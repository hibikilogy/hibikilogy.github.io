//! Body-font subset orchestration.

use anyhow::{Context, Result};
use clap::Parser;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::css_coverage::{
    check_weight_consistency, subtract_codepoints_from_base_css, validate_font_faces,
    write_comment_only_css, ParsedFontFaces,
};
use crate::text::{
    collect_all_toml_strings, collect_non_title_front_matter_strings, extract_markdown_body,
};
use hibikilogy_tools::font::asset::{
    clear_preload_cache, publish_chunked_font, subset_and_publish, subset_font_descriptors,
    CleanupReport, PublishedChunk, SubsetPublishOptions,
};
use hibikilogy_tools::font::coverage::{
    collect_cjk_codepoints, collect_latin_codepoints, count_cjk_codepoints,
};
use hibikilogy_tools::{front_matter, managed_fs};

#[derive(Debug, Clone, Parser)]
#[command(
    about = "Subset a body font to characters used in markdown content but missing from a base CSS."
)]
struct Args {
    #[arg(long)]
    content_dir: PathBuf,

    #[arg(long)]
    config: PathBuf,

    /// Theme i18n file (`themes/hibikilogy/i18n/zh.toml`); UI strings render
    /// in the body font, so their characters must be covered too.
    #[arg(long)]
    i18n: Option<PathBuf>,

    #[arg(long)]
    font: PathBuf,

    #[arg(long)]
    base_css: PathBuf,

    /// Where to record the first chunk's served path for template preloading
    /// (e.g. `static/_cache/font-preload-body.json`).
    #[arg(long)]
    preload_cache_file: Option<PathBuf>,

    #[arg(long)]
    font_output_dir: PathBuf,

    #[arg(long)]
    css_output_dir: PathBuf,

    #[arg(long)]
    css_file: String,

    #[arg(long)]
    font_family: String,

    #[arg(long)]
    output_file: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GenerateReport {
    markdown_files: usize,
    config_strings: usize,
    extracted_codepoints: usize,
    latin_codepoints: usize,
    chunks: Vec<PublishedChunk>,
    css_path: PathBuf,
    cleanup: CleanupReport,
    /// Characters handed back from chunk faces to the patch series in the
    /// base CSS (already covered characters now served by the patch).
    reclaimed_codepoints: usize,
}

pub fn run() -> Result<()> {
    let report = generate_body_font_subset(&Args::parse())?;

    println!(
        "scanned {} markdown file(s), {} extracted codepoint(s), {} latin codepoint(s)",
        report.markdown_files, report.extracted_codepoints, report.latin_codepoints
    );
    if report.config_strings > 0 {
        println!(
            "included {} string fragment(s) from config/i18n",
            report.config_strings
        );
    }
    if report.chunks.is_empty() {
        println!("no supplemental font generated");
    } else {
        let total: u64 = report.chunks.iter().map(|c| c.bytes).sum();
        println!("{} chunk(s), {} bytes total:", report.chunks.len(), total);
        for chunk in &report.chunks {
            println!("  {}: {} bytes", chunk.file_name, chunk.bytes);
        }
        if report.reclaimed_codepoints > 0 {
            println!(
                "reclaimed {} codepoint(s) from chunk unicode-ranges",
                report.reclaimed_codepoints
            );
        }
    }
    report.cleanup.print_summary();
    println!("css: {}", report.css_path.display());

    Ok(())
}

fn generate_body_font_subset(options: &Args) -> Result<GenerateReport> {
    let collected = collect_body_text_from_content(&options.content_dir)?;
    let config_fragments = collect_toml_string_fragments(&options.config)?;
    let i18n_fragments = options
        .i18n
        .as_deref()
        .map(collect_toml_string_fragments)
        .transpose()?
        .unwrap_or_default();
    let mut all_fragments = collected.fragments;
    all_fragments.extend(config_fragments.iter().cloned());
    all_fragments.extend(i18n_fragments.iter().cloned());
    let extracted_codepoints = collect_cjk_codepoints(&all_fragments, &[]);
    let latin_codepoints = collect_latin_codepoints(&all_fragments);

    let base_css = fs::read_to_string(&options.base_css)
        .with_context(|| format!("failed to read {}", options.base_css.display()))?;
    let faces = ParsedFontFaces::parse(&base_css).with_context(|| {
        format!(
            "failed to parse @font-face rules from {}",
            options.base_css.display()
        )
    })?;

    let font_data = fs::read(&options.font)
        .with_context(|| format!("failed to read font {}", options.font.display()))?;
    let css_dir = options.base_css.parent().unwrap_or_else(|| Path::new(""));
    for warning in validate_font_faces(&faces, css_dir, &options.font_family, &font_data)? {
        eprintln!("warning: {warning}");
    }
    let weight = subset_font_descriptors(&font_data)?.weight;
    check_weight_consistency(&faces, &options.font_family, weight.as_deref())?;

    // The patch series must own every body codepoint in the family, not just
    // those the chunks miss: a character declared by both a chunk and the
    // patch would be served by whichever rule comes last, and stale chunk
    // declarations silently shadow content patches.
    let patch_codepoints = extracted_codepoints;
    let css_path = options.css_output_dir.join(&options.css_file);

    if patch_codepoints.is_empty() && latin_codepoints.is_empty() {
        let css = write_comment_only_css(
            "body-font-subset",
            "No supplemental body glyphs were required.",
        );
        let cleanup = publish_chunked_font(
            &options.font_output_dir,
            &options.output_file,
            &[],
            &css_path,
            &css,
        )?;
        if let Some(cache_path) = &options.preload_cache_file {
            clear_preload_cache(cache_path)?;
        }

        return Ok(GenerateReport {
            markdown_files: collected.markdown_files,
            config_strings: config_fragments.len() + i18n_fragments.len(),
            extracted_codepoints: 0,
            latin_codepoints: 0,
            chunks: Vec::new(),
            css_path,
            cleanup,
            reclaimed_codepoints: 0,
        });
    }

    let site_counts = count_cjk_codepoints(&all_fragments);

    let published = subset_and_publish(
        &font_data,
        &patch_codepoints,
        &SubsetPublishOptions {
            generator_name: "body-font-subset",
            font_family: &options.font_family,
            font_output_dir: &options.font_output_dir,
            css_output_dir: &options.css_output_dir,
            css_file: &options.css_file,
            output_file: &options.output_file,
            missing_source_label: "required by content",
            site_counts: &site_counts,
            slicing_config: Path::new("scripts/rust/data/font-slicing.config.json"),
            latin_codepoints: &latin_codepoints,
            preload_cache_file: options.preload_cache_file.as_deref(),
        },
    )?;

    // Remove the patch's codepoints from the chunk faces' unicode-range
    // declarations so every body character is declared by exactly one face.
    let owned: std::collections::BTreeSet<u32> = patch_codepoints
        .iter()
        .chain(latin_codepoints.iter())
        .copied()
        .collect();
    let reclaimed = subtract_codepoints_from_base_css(&base_css, &options.font_family, &owned);
    if reclaimed.changed {
        managed_fs::write_atomic_if_changed(&options.base_css, reclaimed.css.as_bytes())
            .with_context(|| format!("failed to rewrite {}", options.base_css.display()))?;
    }

    Ok(GenerateReport {
        markdown_files: collected.markdown_files,
        config_strings: config_fragments.len() + i18n_fragments.len(),
        extracted_codepoints: patch_codepoints.len(),
        latin_codepoints: latin_codepoints.len(),
        chunks: published.chunks,
        css_path: published.css_path,
        cleanup: published.cleanup,
        reclaimed_codepoints: reclaimed.removed,
    })
}

#[derive(Debug, Default)]
struct CollectedBodyText {
    markdown_files: usize,
    fragments: Vec<String>,
}

fn collect_body_text_from_content(content_dir: &Path) -> Result<CollectedBodyText> {
    let mut collected = CollectedBodyText::default();

    for entry in WalkDir::new(content_dir).follow_links(false) {
        let entry = entry.context("failed to walk content directory")?;
        if !entry.file_type().is_file()
            || entry.path().extension().and_then(OsStr::to_str) != Some("md")
        {
            continue;
        }

        let markdown = fs::read_to_string(entry.path())
            .with_context(|| format!("failed to read {}", entry.path().display()))?;
        collected.markdown_files += 1;
        collected.fragments.push(
            extract_markdown_body(&markdown)
                .with_context(|| format!("failed to extract body from {}", entry.path().display()))?
                .to_string(),
        );

        if let Some(front_matter) =
            front_matter::parse_toml_front_matter(&markdown).with_context(|| {
                format!(
                    "failed to parse front matter from {}",
                    entry.path().display()
                )
            })?
        {
            collected
                .fragments
                .extend(collect_non_title_front_matter_strings(&front_matter));
        }
    }

    Ok(collected)
}

/// Every string in a TOML document (`zola.toml`, theme i18n files), so
/// config/UI text is covered by the same subset as article bodies.
fn collect_toml_string_fragments(config_path: &Path) -> Result<Vec<String>> {
    let document = fs::read_to_string(config_path)
        .with_context(|| format!("failed to read {}", config_path.display()))?;
    let value = document
        .parse::<toml::Value>()
        .with_context(|| format!("failed to parse {}", config_path.display()))?;
    Ok(collect_all_toml_strings(&value))
}

#[cfg(test)]
#[path = "tests/mod.rs"]
mod tests;
