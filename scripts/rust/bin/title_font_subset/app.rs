//! Title-font subset orchestration.

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::codepoints::collect_title_codepoints;
use hibikilogy_tools::font::asset::{
    subset_and_publish, CleanupReport, PublishedChunk, SubsetPublishOptions,
};
use hibikilogy_tools::font::coverage::{collect_latin_codepoints, count_cjk_codepoints};
use hibikilogy_tools::front_matter;

#[derive(Debug, Clone, Parser)]
#[command(about = "Subset a title font from markdown front matter titles.")]
struct Args {
    #[arg(long)]
    content_dir: PathBuf,

    #[arg(long)]
    font: PathBuf,

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

    /// Where to record the first chunk's served path for template preloading
    /// (e.g. `static/_cache/font-preload-title.json`).
    #[arg(long)]
    preload_cache_file: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GenerateReport {
    titles: usize,
    codepoints: usize,
    latin_codepoints: usize,
    chunks: Vec<PublishedChunk>,
    css_path: PathBuf,
    cleanup: CleanupReport,
}

pub fn run() -> Result<()> {
    let report = generate_title_font_subset(&Args::parse())?;

    println!(
        "generated {} chunk(s) from {} title(s), {} unique codepoint(s), {} latin codepoint(s)",
        report.chunks.len(),
        report.titles,
        report.codepoints,
        report.latin_codepoints
    );
    for chunk in &report.chunks {
        println!("  {}: {} bytes", chunk.file_name, chunk.bytes);
    }
    report.cleanup.print_summary();
    println!("css: {}", report.css_path.display());

    Ok(())
}

fn generate_title_font_subset(options: &Args) -> Result<GenerateReport> {
    let titles = collect_titles_from_content(&options.content_dir)?;
    if titles.is_empty() {
        return Err(anyhow!(
            "no titles found in {}",
            options.content_dir.display()
        ));
    }
    let codepoints = collect_title_codepoints(&titles);
    let latin_codepoints = collect_latin_codepoints(&titles);
    let site_counts = count_cjk_codepoints(&titles);

    let font_data = fs::read(&options.font)
        .with_context(|| format!("failed to read font {}", options.font.display()))?;
    let published = subset_and_publish(
        &font_data,
        &codepoints,
        &SubsetPublishOptions {
            generator_name: "title-font-subset",
            font_family: &options.font_family,
            font_output_dir: &options.font_output_dir,
            css_output_dir: &options.css_output_dir,
            css_file: &options.css_file,
            output_file: &options.output_file,
            missing_source_label: "requested by titles",
            site_counts: &site_counts,
            slicing_config: Path::new("scripts/rust/data/font-slicing.config.json"),
            latin_codepoints: &latin_codepoints,
            preload_cache_file: options.preload_cache_file.as_deref(),
        },
    )?;

    Ok(GenerateReport {
        titles: titles.len(),
        codepoints: codepoints.len(),
        latin_codepoints: latin_codepoints.len(),
        chunks: published.chunks,
        css_path: published.css_path,
        cleanup: published.cleanup,
    })
}

fn collect_titles_from_content(content_dir: &Path) -> Result<Vec<String>> {
    let mut titles = Vec::new();

    for entry in WalkDir::new(content_dir).follow_links(false) {
        let entry = entry.context("failed to walk content directory")?;
        if !entry.file_type().is_file()
            || entry.path().extension().and_then(OsStr::to_str) != Some("md")
        {
            continue;
        }

        let markdown = fs::read_to_string(entry.path())
            .with_context(|| format!("failed to read {}", entry.path().display()))?;
        if let Some(title) = extract_title(&markdown)
            .with_context(|| format!("failed to extract title from {}", entry.path().display()))?
        {
            titles.push(title);
        }
    }

    Ok(titles)
}

fn extract_title(markdown: &str) -> Result<Option<String>> {
    let Some(front_matter) = front_matter::parse_toml_front_matter(markdown)? else {
        return Ok(None);
    };

    Ok(front_matter
        .get("title")
        .and_then(toml::Value::as_str)
        .map(ToOwned::to_owned))
}

#[cfg(test)]
#[path = "tests/mod.rs"]
mod tests;
