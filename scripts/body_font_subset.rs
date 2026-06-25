use anyhow::{Context, Result};
use clap::Parser;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[path = "body_text.rs"]
mod body_text;
#[path = "css_coverage.rs"]
mod css_coverage;
#[path = "font_asset.rs"]
mod font_asset;

use body_text::{
    collect_all_toml_strings, collect_non_title_front_matter_strings, extract_markdown_body,
    parse_toml_document, parse_toml_front_matter,
};
use css_coverage::{filter_uncovered_codepoints, write_comment_only_css, CssUnicodeRanges};
use font_asset::{
    font_url_for_css, hashed_output_file_name, remove_old_font_outputs, subset_with_skera,
    write_font_css, FontFaceDescriptors,
};

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
    removed_fonts: Vec<String>,
    skipped_fonts: Vec<String>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let report = generate_body_font_subset(&GenerateOptions {
        content_dir: args.content_dir,
        config_path: args.config,
        font_path: args.font,
        base_css_path: args.base_css,
        font_output_dir: args.font_output_dir,
        css_output_dir: args.css_output_dir,
        css_file: args.css_file,
        font_family: args.font_family,
        output_file: args.output_file,
    })?;

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

fn generate_body_font_subset(options: &GenerateOptions) -> Result<GenerateReport> {
    fs::create_dir_all(&options.font_output_dir)
        .with_context(|| format!("failed to create {}", options.font_output_dir.display()))?;
    fs::create_dir_all(&options.css_output_dir)
        .with_context(|| format!("failed to create {}", options.css_output_dir.display()))?;

    let collected = collect_body_text_from_content(&options.content_dir)?;
    let config_fragments = collect_body_text_from_config(&options.config_path)?;
    let mut all_fragments = collected.fragments;
    all_fragments.extend(config_fragments.iter().cloned());
    let extracted_codepoints = collect_body_font_codepoints(&all_fragments);

    let base_css = fs::read_to_string(&options.base_css_path)
        .with_context(|| format!("failed to read {}", options.base_css_path.display()))?;
    let covered = CssUnicodeRanges::parse(&base_css).with_context(|| {
        format!(
            "failed to parse unicode-range from {}",
            options.base_css_path.display()
        )
    })?;
    let uncovered_codepoints =
        filter_uncovered_codepoints(extracted_codepoints.iter().copied(), &covered);

    let cleanup = remove_old_font_outputs(&options.font_output_dir, &options.output_file, None)?;
    let css_path = options.css_output_dir.join(&options.css_file);

    if uncovered_codepoints.is_empty() {
        fs::write(
            &css_path,
            write_comment_only_css(
                "body-font-subset",
                "No supplemental body glyphs were required.",
            ),
        )
        .with_context(|| format!("failed to write {}", css_path.display()))?;

        return Ok(GenerateReport {
            markdown_files: collected.markdown_files,
            config_strings: config_fragments.len(),
            extracted_codepoints: extracted_codepoints.len(),
            uncovered_codepoints: 0,
            font: None,
            css_path,
            removed_fonts: cleanup.removed,
            skipped_fonts: cleanup.skipped,
        });
    }

    let font_data = fs::read(&options.font_path)
        .with_context(|| format!("failed to read font {}", options.font_path.display()))?;
    let subset = subset_with_skera(&font_data, &uncovered_codepoints)?;
    let woff2 = woofwoof::compress(&subset, "", 8, true).context("failed to compress WOFF2")?;

    let output_file = hashed_output_file_name(&options.output_file, &woff2);
    let output_path = options.font_output_dir.join(&output_file);
    fs::write(&output_path, &woff2)
        .with_context(|| format!("failed to write {}", output_path.display()))?;

    let font_url = font_url_for_css(&options.css_output_dir, &output_path)?;
    let css = write_font_css(
        "body-font-subset",
        &options.font_family,
        &font_url,
        &uncovered_codepoints,
        "block",
        FontFaceDescriptors::VARIABLE,
    );
    fs::write(&css_path, css).with_context(|| format!("failed to write {}", css_path.display()))?;

    Ok(GenerateReport {
        markdown_files: collected.markdown_files,
        config_strings: config_fragments.len(),
        extracted_codepoints: extracted_codepoints.len(),
        uncovered_codepoints: uncovered_codepoints.len(),
        font: Some(GeneratedFont {
            file_name: output_file,
            codepoints: uncovered_codepoints,
            bytes: woff2.len() as u64,
        }),
        css_path,
        removed_fonts: cleanup.removed,
        skipped_fonts: cleanup.skipped,
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
        collected
            .fragments
            .push(extract_markdown_body(&markdown).to_string());

        if let Some(front_matter) = parse_toml_front_matter(&markdown).with_context(|| {
            format!(
                "failed to parse front matter from {}",
                entry.path().display()
            )
        })? {
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
    let value = parse_toml_document(&document)
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
mod tests {
    use super::{
        collect_body_font_codepoints, collect_body_text_from_config, collect_body_text_from_content,
    };
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn collects_body_and_non_title_front_matter_text() {
        let base = std::env::temp_dir().join(format!(
            "body-font-subset-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        fs::write(
            base.join("a.md"),
            "+++\ntitle = \"标题\"\ndescription = \"摘要\"\ntags = [\"标签\"]\n+++\n# 正文\n`code`\n",
        )
        .unwrap();

        let collected = collect_body_text_from_content(&base).unwrap();

        assert_eq!(collected.markdown_files, 1);
        assert!(collected
            .fragments
            .iter()
            .any(|text| text.contains("# 正文")));
        assert!(collected.fragments.iter().any(|text| text == "摘要"));
        assert!(collected.fragments.iter().any(|text| text == "标签"));
        assert!(!collected.fragments.iter().any(|text| text == "标题"));

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn body_subset_filters_out_ascii_and_kana() {
        let codepoints = collect_body_font_codepoints(&[
            "中文ABC".to_string(),
            "かなカナ".to_string(),
            "，。「」".to_string(),
        ]);

        assert!(codepoints.contains(&('中' as u32)));
        assert!(codepoints.contains(&('文' as u32)));
        assert!(codepoints.contains(&('，' as u32)));
        assert!(codepoints.contains(&('「' as u32)));
        assert!(!codepoints.contains(&('A' as u32)));
        assert!(!codepoints.contains(&('か' as u32)));
        assert!(!codepoints.contains(&('カ' as u32)));
    }

    #[test]
    fn collects_strings_from_config_toml() {
        let path = std::env::temp_dir().join(format!(
            "body-font-config-test-{}.toml",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(
            &path,
            "base_url = \"https://example.com\"\n[extra]\ndescription = \"站点说明\"\n",
        )
        .unwrap();

        let strings = collect_body_text_from_config(&path).unwrap();
        assert!(strings.iter().any(|text| text == "https://example.com"));
        assert!(strings.iter().any(|text| text == "站点说明"));

        fs::remove_file(path).unwrap();
    }
}
