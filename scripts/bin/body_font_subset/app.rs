//! Body-font subset orchestration. The `main.rs` binary is a thin wrapper
//! around [`run`].

use anyhow::{Context, Result};
use clap::Parser;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::css_coverage::{
    check_weight_consistency, filter_uncovered_codepoints, validate_font_faces,
    write_comment_only_css, CssUnicodeRanges, ParsedFontFaces,
};
use crate::text::{
    collect_all_toml_strings, collect_non_title_front_matter_strings, extract_markdown_body,
};
use hibikilogy_tools::font::asset::{
    publish_font_artifacts, subset_and_publish, subset_font_descriptors, CleanupReport,
    SubsetPublishOptions,
};
use hibikilogy_tools::front_matter;

#[derive(Debug, Parser)]
#[command(
    about = "Subset a body font to characters used in markdown content but missing from a base CSS."
)]
struct Args {
    #[arg(long)]
    content_dir: PathBuf,

    #[arg(long)]
    config: PathBuf,

    #[arg(long)]
    font: PathBuf,

    #[arg(long)]
    base_css: PathBuf,

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

#[derive(Debug, Clone)]
struct GenerateOptions {
    content_dir: PathBuf,
    config_path: PathBuf,
    font_path: PathBuf,
    base_css_path: PathBuf,
    font_output_dir: PathBuf,
    css_output_dir: PathBuf,
    css_file: String,
    font_family: String,
    output_file: String,
}

impl From<Args> for GenerateOptions {
    fn from(args: Args) -> Self {
        Self {
            content_dir: args.content_dir,
            config_path: args.config,
            font_path: args.font,
            base_css_path: args.base_css,
            font_output_dir: args.font_output_dir,
            css_output_dir: args.css_output_dir,
            css_file: args.css_file,
            font_family: args.font_family,
            output_file: args.output_file,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GeneratedFont {
    file_name: String,
    codepoints: Vec<u32>,
    bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GenerateReport {
    markdown_files: usize,
    config_strings: usize,
    extracted_codepoints: usize,
    uncovered_codepoints: usize,
    font: Option<GeneratedFont>,
    css_path: PathBuf,
    cleanup: CleanupReport,
}

pub fn run() -> Result<()> {
    let report = generate_body_font_subset(&GenerateOptions::from(Args::parse()))?;

    println!(
        "scanned {} markdown file(s), {} extracted codepoint(s), {} uncovered codepoint(s)",
        report.markdown_files, report.extracted_codepoints, report.uncovered_codepoints
    );
    if report.config_strings > 0 {
        println!(
            "included {} string fragment(s) from config",
            report.config_strings
        );
    }
    match &report.font {
        Some(font) => {
            println!(
                "{}: {} bytes, {} codepoint(s)",
                font.file_name,
                font.bytes,
                font.codepoints.len()
            );
        }
        None => println!("no supplemental font generated"),
    }
    report.cleanup.print_summary();
    println!("css: {}", report.css_path.display());

    Ok(())
}

fn generate_body_font_subset(options: &GenerateOptions) -> Result<GenerateReport> {
    let collected = collect_body_text_from_content(&options.content_dir)?;
    let config_fragments = collect_body_text_from_config(&options.config_path)?;
    let mut all_fragments = collected.fragments;
    all_fragments.extend(config_fragments.iter().cloned());
    let extracted_codepoints = collect_body_font_codepoints(&all_fragments);

    let base_css = fs::read_to_string(&options.base_css_path)
        .with_context(|| format!("failed to read {}", options.base_css_path.display()))?;
    let faces = ParsedFontFaces::parse(&base_css).with_context(|| {
        format!(
            "failed to parse @font-face rules from {}",
            options.base_css_path.display()
        )
    })?;

    let font_data = fs::read(&options.font_path)
        .with_context(|| format!("failed to read font {}", options.font_path.display()))?;
    let css_dir = options
        .base_css_path
        .parent()
        .unwrap_or_else(|| Path::new(""));
    for warning in validate_font_faces(&faces, css_dir, &options.font_family, &font_data)? {
        eprintln!("warning: {warning}");
    }
    let weight = subset_font_descriptors(&font_data)?.weight;
    check_weight_consistency(&faces, &options.font_family, weight.as_deref())?;

    let covered = CssUnicodeRanges::from_ranges(faces.covered_ranges(&options.font_family));
    let uncovered_codepoints =
        filter_uncovered_codepoints(extracted_codepoints.iter().copied(), &covered);

    let css_path = options.css_output_dir.join(&options.css_file);

    if uncovered_codepoints.is_empty() {
        let css = write_comment_only_css(
            "body-font-subset",
            "No supplemental body glyphs were required.",
        );
        let cleanup = publish_font_artifacts(
            &options.font_output_dir,
            &options.output_file,
            None,
            &css_path,
            &css,
        )?;

        return Ok(GenerateReport {
            markdown_files: collected.markdown_files,
            config_strings: config_fragments.len(),
            extracted_codepoints: extracted_codepoints.len(),
            uncovered_codepoints: 0,
            font: None,
            css_path,
            cleanup,
        });
    }

    let published = subset_and_publish(
        &font_data,
        &uncovered_codepoints,
        &SubsetPublishOptions {
            generator_name: "body-font-subset",
            font_family: &options.font_family,
            font_output_dir: &options.font_output_dir,
            css_output_dir: &options.css_output_dir,
            css_file: &options.css_file,
            output_file: &options.output_file,
            missing_source_label: "required by content",
        },
    )?;

    Ok(GenerateReport {
        markdown_files: collected.markdown_files,
        config_strings: config_fragments.len(),
        extracted_codepoints: extracted_codepoints.len(),
        uncovered_codepoints: uncovered_codepoints.len(),
        font: Some(GeneratedFont {
            file_name: published.file_name,
            codepoints: uncovered_codepoints,
            bytes: published.bytes,
        }),
        css_path: published.css_path,
        cleanup: published.cleanup,
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

fn collect_body_text_from_config(config_path: &Path) -> Result<Vec<String>> {
    let document = fs::read_to_string(config_path)
        .with_context(|| format!("failed to read {}", config_path.display()))?;
    let value = document
        .parse::<toml::Value>()
        .with_context(|| format!("failed to parse {}", config_path.display()))?;
    Ok(collect_all_toml_strings(&value))
}

fn collect_body_font_codepoints(fragments: &[String]) -> Vec<u32> {
    let mut codepoints = Vec::new();

    for fragment in fragments {
        codepoints.extend(
            fragment
                .chars()
                .map(|ch| ch as u32)
                .filter(|&codepoint| should_subset_body_codepoint(codepoint)),
        );
    }

    codepoints.sort_unstable();
    codepoints.dedup();
    codepoints
}

fn should_subset_body_codepoint(codepoint: u32) -> bool {
    matches!(
        codepoint,
        0x3000..=0x303F
            | 0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0xFE10..=0xFE1F
            | 0xFE30..=0xFE6B
            | 0xFF01..=0xFF65
    )
}

#[cfg(test)]
#[path = "tests/mod.rs"]
mod tests;
