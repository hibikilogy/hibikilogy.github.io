use anyhow::{anyhow, Context, Result};
use clap::Parser;
use skera::{subset_font, Plan, SubsetFlags};
use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::fs;
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;
use write_fonts::read::{
    collections::IntSet,
    types::{NameId, Tag},
    FontRef,
};

const HASH_HEX_LEN: usize = 16;
const DEFAULT_RETAINED_RANGES: &[(u32, u32)] = &[(0x0020, 0x007E)];
const DEFAULT_RETAINED_CODEPOINTS: &[u32] = &[
    0x00A0, 0x00B7, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022, 0x3001, 0x3002, 0x3008,
    0x3009, 0x300A, 0x300B, 0x300C, 0x300D, 0x300E, 0x300F, 0x3010, 0x3011, 0x3014, 0x3015, 0xFF01,
    0xFF08, 0xFF09, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F,
];

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
    let cleanup =
        remove_old_font_outputs(&options.font_output_dir, &options.output_file, &output_file)?;

    fs::write(&output_path, &woff2)
        .with_context(|| format!("failed to write {}", output_path.display()))?;

    let font_url = font_url_for_css(&options.css_output_dir, &output_path)?;
    let css = font_face_css(&options.font_family, &font_url, &codepoints);
    let css_path = options.css_output_dir.join(&options.css_file);
    fs::write(&css_path, css).with_context(|| format!("failed to write {}", css_path.display()))?;

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

fn extract_title(markdown: &str) -> Result<Option<String>> {
    let Some(front_matter) = extract_toml_front_matter(markdown) else {
        return Ok(None);
    };

    for line in front_matter.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() != "title" {
            continue;
        }

        let parsed = format!("title = {}", value.trim())
            .parse::<toml::Table>()
            .context("failed to parse title field in TOML front matter")?;

        return Ok(parsed
            .get("title")
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned));
    }

    Ok(None)
}

fn extract_toml_front_matter(markdown: &str) -> Option<&str> {
    let rest = markdown
        .strip_prefix("+++\n")
        .or_else(|| markdown.strip_prefix("+++\r\n"))?;
    let end = rest.find("\n+++").or_else(|| rest.find("\r\n+++"))?;
    Some(&rest[..end])
}

fn collect_title_codepoints<I, S>(titles: I) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut codepoints = default_retained_codepoints();
    codepoints.extend(titles.into_iter().flat_map(|title| {
        title
            .as_ref()
            .chars()
            .map(|ch| ch as u32)
            .collect::<Vec<_>>()
    }));
    codepoints
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn default_retained_codepoints() -> Vec<u32> {
    let mut codepoints: Vec<u32> = DEFAULT_RETAINED_RANGES
        .iter()
        .flat_map(|&(start, end)| start..=end)
        .collect();
    codepoints.extend(DEFAULT_RETAINED_CODEPOINTS.iter().copied());
    codepoints
}

fn subset_with_skera(font_data: &[u8], codepoints: &[u32]) -> Result<Vec<u8>> {
    let font = FontRef::new(font_data).context("failed to parse input font")?;
    let unicodes = codepoints.iter().copied().collect::<IntSet<u32>>();
    let gids = IntSet::empty();
    let drop_tables = IntSet::<Tag>::empty();
    let layout_scripts = inverted_set::<Tag>();
    let layout_features = inverted_set::<Tag>();
    let name_ids = inverted_set::<NameId>();
    let name_languages = inverted_set::<u16>();
    let flags = SubsetFlags::SUBSET_FLAGS_PASSTHROUGH_UNRECOGNIZED
        | SubsetFlags::SUBSET_FLAGS_GLYPH_NAMES
        | SubsetFlags::SUBSET_FLAGS_NOTDEF_OUTLINE
        | SubsetFlags::SUBSET_FLAGS_RETAIN_GIDS;

    let plan = Plan::new(
        &gids,
        &unicodes,
        &font,
        flags,
        &drop_tables,
        &layout_scripts,
        &layout_features,
        &name_ids,
        &name_languages,
    );

    subset_font(&font, &plan).map_err(|error| anyhow!("skera subset failed: {error}"))
}

fn inverted_set<T>() -> IntSet<T>
where
    T: Clone + Eq + std::hash::Hash,
{
    let mut set = IntSet::<T>::empty();
    set.invert();
    set
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct CleanupReport {
    removed: Vec<String>,
    skipped: Vec<String>,
}

fn remove_old_font_outputs(
    output_dir: &Path,
    template_file: &str,
    keep_file: &str,
) -> Result<CleanupReport> {
    let (stem, extension) = split_file_name(template_file);
    let mut report = CleanupReport::default();

    for entry in fs::read_dir(output_dir)
        .with_context(|| format!("failed to read {}", output_dir.display()))?
    {
        let entry = entry.with_context(|| format!("failed to read {}", output_dir.display()))?;
        if !entry.file_type()?.is_file() {
            continue;
        }

        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if file_name == keep_file {
            continue;
        }

        let matches_hashed = file_name.starts_with(&format!("{stem}."))
            && file_name.ends_with(&format!(".{extension}"));
        let matches_plain = file_name == template_file;
        if !matches_hashed && !matches_plain {
            continue;
        }

        match fs::remove_file(entry.path()) {
            Ok(()) => report.removed.push(file_name.into_owned()),
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                report.skipped.push(file_name.into_owned());
            }
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("failed to remove {}", entry.path().display()));
            }
        }
    }

    report.removed.sort();
    report.skipped.sort();
    Ok(report)
}

fn hashed_output_file_name(file_name: &str, bytes: &[u8]) -> String {
    let hash = fnv1a64(bytes);
    let (stem, extension) = split_file_name(file_name);
    format!("{stem}.{hash:0width$x}.{extension}", width = HASH_HEX_LEN)
}

fn split_file_name(file_name: &str) -> (&str, &str) {
    file_name.rsplit_once('.').unwrap_or((file_name, "woff2"))
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn font_face_css(font_family: &str, file_name: &str, codepoints: &[u32]) -> String {
    let mut css = String::from("/* Generated by title-font-subset. Do not edit by hand. */\n\n");
    css.push_str("@font-face {\n");
    css.push_str(&format!(
        "  font-family: \"{}\";\n",
        escape_css_string(font_family)
    ));
    css.push_str("  font-style: normal;\n");
    css.push_str("  font-weight: 200 900;\n");
    css.push_str("  font-display: swap;\n");
    css.push_str(&format!(
        "  src: url(\"./{}\") format(\"woff2\");\n",
        escape_css_string(file_name)
    ));
    css.push_str(&format!(
        "  unicode-range: {};\n",
        css_unicode_range(codepoints)
    ));
    css.push_str("}\n");
    css
}

fn css_unicode_range(codepoints: &[u32]) -> String {
    if codepoints.is_empty() {
        return "U+0-10FFFF".to_string();
    }

    let mut ranges = Vec::new();
    let mut start = codepoints[0];
    let mut previous = codepoints[0];

    for &codepoint in &codepoints[1..] {
        if codepoint == previous + 1 {
            previous = codepoint;
            continue;
        }

        ranges.push(format_range(start, previous));
        start = codepoint;
        previous = codepoint;
    }

    ranges.push(format_range(start, previous));
    ranges.join(", ")
}

fn format_range(start: u32, end: u32) -> String {
    if start == end {
        format!("U+{:04X}", start)
    } else {
        format!("U+{:04X}-{:04X}", start, end)
    }
}

fn escape_css_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn font_url_for_css(css_output_dir: &Path, font_path: &Path) -> Result<String> {
    let relative = relative_path(css_output_dir, font_path).ok_or_else(|| {
        anyhow!(
            "failed to compute relative font path from {} to {}",
            css_output_dir.display(),
            font_path.display()
        )
    })?;

    Ok(relative
        .components()
        .map(component_to_url_segment)
        .collect::<Vec<_>>()
        .join("/"))
}

fn component_to_url_segment(component: Component<'_>) -> String {
    match component {
        Component::ParentDir => "..".to_string(),
        Component::CurDir => ".".to_string(),
        Component::Normal(value) => value.to_string_lossy().into_owned(),
        Component::RootDir => "/".to_string(),
        Component::Prefix(prefix) => prefix.as_os_str().to_string_lossy().into_owned(),
    }
}

fn relative_path(from_dir: &Path, to_path: &Path) -> Option<PathBuf> {
    let from_components: Vec<_> = from_dir.components().collect();
    let to_components: Vec<_> = to_path.components().collect();

    let mut shared_len = 0;
    while shared_len < from_components.len()
        && shared_len < to_components.len()
        && from_components[shared_len] == to_components[shared_len]
    {
        shared_len += 1;
    }

    if shared_len == 0 && from_dir.is_absolute() != to_path.is_absolute() {
        return None;
    }

    let mut relative = PathBuf::new();
    for _ in shared_len..from_components.len() {
        relative.push("..");
    }
    for component in &to_components[shared_len..] {
        relative.push(component.as_os_str());
    }

    if relative.as_os_str().is_empty() {
        relative.push(".");
    }

    Some(relative)
}

#[cfg(test)]
mod tests {
    use super::{
        collect_title_codepoints, css_unicode_range, default_retained_codepoints, extract_title,
        font_face_css, hashed_output_file_name, remove_old_font_outputs,
    };
    use skrifa::MetadataProvider;
    use std::{
        collections::BTreeSet,
        fs,
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };
    use write_fonts::read::{FontRef, TableProvider};

    #[test]
    fn extracts_title_from_zola_toml_front_matter() {
        let markdown =
            "+++\ntitle = \"\\u5317\\u5b87\\u6cbb \\\"\\u5439\\u594f\\u90e8\\\"\"\ndate = 2024-01-01\n+++\n# Body\n";

        assert_eq!(
            extract_title(markdown).unwrap().as_deref(),
            Some("\u{5317}\u{5b87}\u{6cbb} \"\u{5439}\u{594f}\u{90e8}\"")
        );
    }

    #[test]
    fn extracts_title_from_zola_toml_front_matter_with_crlf() {
        let markdown =
            "+++\r\ntitle = \"\\u5317\\u5b87\\u6cbb\"\r\ndate = 2024-01-01\r\n+++\r\n# Body\r\n";

        assert_eq!(
            extract_title(markdown).unwrap().as_deref(),
            Some("\u{5317}\u{5b87}\u{6cbb}")
        );
    }

    #[test]
    fn ignores_titles_outside_front_matter() {
        let markdown = "# Body\n\ntitle = \"not front matter\"\n";
        assert_eq!(extract_title(markdown).unwrap(), None);
    }

    #[test]
    fn collects_unique_sorted_title_codepoints() {
        let titles = ["\u{594F}\u{594F}A", "\u{5317}A"];
        let codepoints = collect_title_codepoints(titles);

        assert!(codepoints.contains(&0x41));
        assert!(codepoints.contains(&0x5317));
        assert!(codepoints.contains(&0x594F));
        assert_eq!(codepoints, {
            let mut expected = default_retained_codepoints();
            expected.extend([0x5317, 0x594F]);
            expected
                .into_iter()
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect::<Vec<_>>()
        });
    }

    #[test]
    fn keeps_english_digits_and_symbols_even_when_titles_do_not_use_them() {
        let codepoints = collect_title_codepoints(["\u{5317}\u{5b87}\u{6cbb}"]);

        for codepoint in ['A', 'Z', 'a', 'z', '0', '9', '&', '?', '~'] {
            assert!(codepoints.contains(&(codepoint as u32)));
        }

        for codepoint in [
            '\u{3001}', '\u{3002}', '\u{300C}', '\u{300D}', '\u{FF01}', '\u{FF1F}',
        ] {
            assert!(codepoints.contains(&(codepoint as u32)));
        }
    }

    #[test]
    fn formats_unicode_ranges_for_css() {
        let codepoints = [0x41, 0x42, 0x44, 0x4E00, 0x4E02];
        assert_eq!(
            css_unicode_range(&codepoints),
            "U+0041-0042, U+0044, U+4E00, U+4E02"
        );
    }

    #[test]
    fn renders_single_font_face_css() {
        let css = font_face_css(
            "Hibikilogy Title Serif",
            "source-han-serif-title.woff2",
            &[0x41, 0x42, 0x4E00],
        );

        assert!(css.contains("font-family: \"Hibikilogy Title Serif\";"));
        assert!(css.contains("src: url(\"./source-han-serif-title.woff2\") format(\"woff2\");"));
        assert!(css.contains("unicode-range: U+0041-0042, U+4E00;"));
    }

    #[test]
    fn computes_relative_font_url_from_css_directory() {
        let css_dir = Path::new("static/styles");
        let font_path = Path::new("static/assets/fonts/source-han-serif-title.woff2");

        let relative = super::font_url_for_css(css_dir, font_path).unwrap();

        assert_eq!(relative, "../assets/fonts/source-han-serif-title.woff2");
    }

    #[test]
    fn inserts_content_hash_before_output_extension() {
        let first = hashed_output_file_name("source-han-serif-title.woff2", b"abc");
        let second = hashed_output_file_name("source-han-serif-title.woff2", b"abc");
        let third = hashed_output_file_name("source-han-serif-title.woff2", b"abcd");

        assert_eq!(first, second);
        assert_ne!(first, third);
        assert!(first.starts_with("source-han-serif-title."));
        assert!(first.ends_with(".woff2"));
        assert_eq!(
            first.len(),
            "source-han-serif-title.".len() + 16 + ".woff2".len()
        );
    }

    #[test]
    fn removes_old_hashed_outputs_and_keeps_current_one() {
        let base = std::env::temp_dir().join(format!(
            "title-font-subset-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();

        for name in [
            "source-han-serif-title.1111111111111111.woff2",
            "source-han-serif-title.2222222222222222.woff2",
            "source-han-serif-title.woff2",
            "other-font.woff2",
        ] {
            fs::write(base.join(name), b"x").unwrap();
        }

        let cleanup = remove_old_font_outputs(
            &base,
            "source-han-serif-title.woff2",
            "source-han-serif-title.2222222222222222.woff2",
        )
        .unwrap();

        assert_eq!(
            cleanup.removed,
            vec![
                "source-han-serif-title.1111111111111111.woff2".to_string(),
                "source-han-serif-title.woff2".to_string(),
            ]
        );
        assert!(cleanup.skipped.is_empty());
        assert!(base
            .join("source-han-serif-title.2222222222222222.woff2")
            .exists());
        assert!(base.join("other-font.woff2").exists());

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn generated_woff2_keeps_layout_tables_when_present() {
        let path =
            find_generated_font_from_css(Path::new("static/fonts/source-han-serif-title.css"));
        let Some(path) = path else {
            return;
        };

        let woff2 = fs::read(path).unwrap();
        let sfnt = woofwoof::decompress(&woff2).unwrap();
        let font = FontRef::new(&sfnt).unwrap();

        assert!(font.gsub().is_ok(), "generated font should keep GSUB");
        assert!(font.gpos().is_ok(), "generated font should keep GPOS");
        assert!(font.gdef().is_ok(), "generated font should keep GDEF");
    }

    #[test]
    fn generated_woff2_maps_known_title_characters() {
        let path =
            find_generated_font_from_css(Path::new("static/fonts/source-han-serif-title.css"));
        let Some(path) = path else {
            return;
        };

        let woff2 = fs::read(path).unwrap();
        let sfnt = woofwoof::decompress(&woff2).unwrap();
        let font = FontRef::new(&sfnt).unwrap();
        let charmap = font.charmap();

        for ch in [
            '\u{7F3A}', '\u{9AD8}', '\u{5B9E}', '\u{5317}', '\u{594F}', 'A', '?', '\u{FF1F}',
        ] {
            assert!(
                charmap.map(ch as u32).is_some(),
                "generated font should map U+{:04X}",
                ch as u32
            );
        }
    }

    fn find_generated_font_from_css(css_path: &Path) -> Option<std::path::PathBuf> {
        let css = fs::read_to_string(css_path).ok()?;
        let marker = "src: url(\"./";
        let start = css.find(marker)? + marker.len();
        let end = css[start..].find("\") format(\"woff2\")")?;
        let file_name = &css[start..start + end];
        Some(css_path.parent()?.join(file_name))
    }
}
