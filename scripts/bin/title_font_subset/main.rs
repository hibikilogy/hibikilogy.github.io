use anyhow::{anyhow, Context, Result};
use clap::Parser;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

mod codepoints;
mod markdown;

use codepoints::collect_title_codepoints;
use hibikilogy_tools::font::asset::{
    font_url_for_css, hashed_output_file_name, publish_font_artifacts, subset_with_skera,
    write_font_css, FontFaceDescriptors,
};
use markdown::extract_title;

#[derive(Debug, Parser)]
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
}

#[derive(Debug, Clone)]
struct GenerateOptions {
    content_dir: PathBuf,
    font_path: PathBuf,
    font_output_dir: PathBuf,
    css_output_dir: PathBuf,
    css_file: String,
    font_family: String,
    output_file: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GeneratedFont {
    file_name: String,
    codepoints: Vec<u32>,
    bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GenerateReport {
    titles: usize,
    codepoints: usize,
    font: GeneratedFont,
    css_path: PathBuf,
    removed_fonts: Vec<String>,
    skipped_fonts: Vec<String>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let report = generate_title_font_subset(&GenerateOptions {
        content_dir: args.content_dir,
        font_path: args.font,
        font_output_dir: args.font_output_dir,
        css_output_dir: args.css_output_dir,
        css_file: args.css_file,
        font_family: args.font_family,
        output_file: args.output_file,
    })?;

    println!(
        "generated {} from {} title(s), {} unique codepoint(s)",
        report.font.file_name, report.titles, report.codepoints
    );
    println!(
        "{}: {} bytes, {} codepoint(s)",
        report.font.file_name,
        report.font.bytes,
        report.font.codepoints.len()
    );
    if !report.removed_fonts.is_empty() {
        println!("removed {} old font file(s)", report.removed_fonts.len());
    }
    if !report.skipped_fonts.is_empty() {
        println!(
            "skipped {} locked old font file(s)",
            report.skipped_fonts.len()
        );
    }
    println!("css: {}", report.css_path.display());

    Ok(())
}

fn generate_title_font_subset(options: &GenerateOptions) -> Result<GenerateReport> {
    let titles = collect_titles_from_content(&options.content_dir)?;
    let codepoints = collect_title_codepoints(&titles);
    if codepoints.is_empty() {
        return Err(anyhow!(
            "no title characters found in {}",
            options.content_dir.display()
        ));
    }

    fs::create_dir_all(&options.font_output_dir)
        .with_context(|| format!("failed to create {}", options.font_output_dir.display()))?;
    fs::create_dir_all(&options.css_output_dir)
        .with_context(|| format!("failed to create {}", options.css_output_dir.display()))?;

    let font_data = fs::read(&options.font_path)
        .with_context(|| format!("failed to read font {}", options.font_path.display()))?;
    let subset = subset_with_skera(&font_data, &codepoints)?;
    let woff2 = woofwoof::compress(&subset, "", 8, true).context("failed to compress WOFF2")?;

    let output_file = hashed_output_file_name(&options.output_file, &woff2);
    let output_path = options.font_output_dir.join(&output_file);
    let font_url = font_url_for_css(&options.css_output_dir, &output_path)?;
    let css = write_font_css(
        "title-font-subset",
        &options.font_family,
        &font_url,
        &codepoints,
        "swap",
        FontFaceDescriptors::VARIABLE,
    );
    let css_path = options.css_output_dir.join(&options.css_file);
    let cleanup = publish_font_artifacts(
        &options.font_output_dir,
        &options.output_file,
        Some((&output_file, &woff2)),
        &css_path,
        &css,
    )?;

    Ok(GenerateReport {
        titles: titles.len(),
        codepoints: codepoints.len(),
        font: GeneratedFont {
            file_name: output_file,
            codepoints,
            bytes: woff2.len() as u64,
        },
        css_path,
        removed_fonts: cleanup.removed,
        skipped_fonts: cleanup.skipped,
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
