//! Font subsetting and generated font-asset publication shared by font tools.

use crate::font::coverage::{describe_codepoint, format_codepoint_list, verify_subset_coverage};
use crate::managed_fs::{ensure_directory, write_atomic_if_changed};
use anyhow::{anyhow, Context, Result};
use skera::{subset_font, Plan, SubsetFlags};
use std::fs;
use std::path::{Component, Path, PathBuf};
use write_fonts::read::{
    collections::IntSet,
    types::{NameId, Tag},
    FontRef, TableProvider,
};

pub const HASH_HEX_LEN: usize = 16;

/// Layout features used only for vertical text. Subsets of horizontally
/// rendered web fonts drop them, which also lets skera drop the vertical
/// alternates that only those lookups reference.
const VERTICAL_FEATURE_DENYLIST: [Tag; 8] = [
    Tag::new(b"vert"),
    Tag::new(b"vrt2"),
    Tag::new(b"vkrn"),
    Tag::new(b"vpal"),
    Tag::new(b"vhal"),
    Tag::new(b"vchw"),
    Tag::new(b"valt"),
    Tag::new(b"vjmo"),
];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CleanupReport {
    pub removed: Vec<String>,
    pub skipped: Vec<String>,
}

impl CleanupReport {
    /// Print the standard one-line summaries for removed/skipped artifacts.
    pub fn print_summary(&self) {
        if !self.removed.is_empty() {
            println!("removed {} old font file(s)", self.removed.len());
        }
        if !self.skipped.is_empty() {
            println!("skipped {} locked old font file(s)", self.skipped.len());
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FontFaceDescriptors {
    pub style: Option<String>,
    pub weight: Option<String>,
}

/// Weight facts read from a font, kept small so descriptor selection is
/// testable without font fixtures.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FontMeta {
    pub fvar_wght: Option<(u32, u32)>,
    pub os2_weight_class: Option<u16>,
}

impl FontMeta {
    /// Read weight facts from a font: the `fvar` `wght` axis range, or the
    /// `OS/2` `usWeightClass` when the font is not variable.
    pub fn from_font(font: &FontRef) -> Self {
        let fvar_wght = font.fvar().ok().and_then(|fvar| {
            fvar.axes().ok().and_then(|axes| {
                axes.iter()
                    .find(|axis| axis.axis_tag() == Tag::new(b"wght"))
                    .map(|axis| {
                        (
                            axis.min_value().to_f32().round() as u32,
                            axis.max_value().to_f32().round() as u32,
                        )
                    })
            })
        });
        let os2_weight_class = font.os2().ok().map(|os2| os2.us_weight_class());
        Self {
            fvar_wght,
            os2_weight_class,
        }
    }
}

/// Choose the `font-weight` descriptor value: the `fvar` `wght` axis range
/// when variable, else the `OS/2` `usWeightClass` single value. `None` when
/// neither is readable — the descriptor is then omitted, which is more
/// accurate than guessing a fixed range for a static font.
pub fn weight_descriptor(meta: FontMeta) -> Option<String> {
    if let Some((min, max)) = meta.fvar_wght {
        return Some(format!("{min} {max}"));
    }
    meta.os2_weight_class.map(|weight| weight.to_string())
}

impl FontFaceDescriptors {
    /// Descriptors for a subset font: `normal` style and the weight read
    /// from the font's own tables (see [`weight_descriptor`]).
    pub fn from_font(font: &FontRef) -> Self {
        Self {
            style: Some("normal".to_string()),
            weight: weight_descriptor(FontMeta::from_font(font)),
        }
    }
}

/// Read `@font-face` descriptors from subset output bytes.
pub fn subset_font_descriptors(font_data: &[u8]) -> Result<FontFaceDescriptors> {
    let font = FontRef::new(font_data).context("failed to parse subset font")?;
    Ok(FontFaceDescriptors::from_font(&font))
}

/// Every layout feature the source font declares in GSUB or GPOS, minus the
/// vertical denylist. An explicit list keeps skera from retaining features
/// that only apply to vertical text.
fn horizontal_layout_features(font: &FontRef) -> Result<IntSet<Tag>> {
    let mut features = IntSet::empty();
    for feature_list in [
        font.gsub().and_then(|table| table.feature_list()),
        font.gpos().and_then(|table| table.feature_list()),
    ] {
        let Ok(feature_list) = feature_list else {
            continue;
        };
        for record in feature_list.feature_records() {
            features.insert(record.feature_tag());
        }
    }
    for tag in VERTICAL_FEATURE_DENYLIST {
        features.remove(tag);
    }
    Ok(features)
}

pub fn subset_with_skera(font_data: &[u8], codepoints: &[u32]) -> Result<Vec<u8>> {
    let font = FontRef::new(font_data).context("failed to parse input font")?;
    let unicodes = codepoints.iter().copied().collect::<IntSet<u32>>();
    let gids = IntSet::empty();
    let drop_tables = IntSet::<Tag>::empty();
    let layout_scripts = inverted_set::<Tag>();
    let layout_features = horizontal_layout_features(&font)?;
    let name_ids = inverted_set::<NameId>();
    let name_languages = inverted_set::<u16>();
    let flags = SubsetFlags::SUBSET_FLAGS_PASSTHROUGH_UNRECOGNIZED
        | SubsetFlags::SUBSET_FLAGS_GLYPH_NAMES
        | SubsetFlags::SUBSET_FLAGS_NOTDEF_OUTLINE;

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

    let subset =
        subset_font(&font, &plan).map_err(|error| anyhow!("skera subset failed: {error}"))?;
    // skera corrupts the gvar offset array whenever subsetting compacts
    // glyph IDs (see the gvar module docs); rebuild the table before it
    // reaches a renderer.
    crate::font::gvar::repair_subset_gvar(font_data, &subset)
}

/// Where and how [`subset_and_publish`] writes its artifacts.
#[derive(Debug, Clone)]
pub struct SubsetPublishOptions<'a> {
    /// Generator name baked into the CSS header comment.
    pub generator_name: &'a str,
    pub font_family: &'a str,
    pub font_output_dir: &'a Path,
    pub css_output_dir: &'a Path,
    pub css_file: &'a str,
    pub output_file: &'a str,
    /// Noun phrase used in the fallback warning for codepoints the source
    /// font does not map, e.g. "required by content".
    pub missing_source_label: &'a str,
}

/// Artifacts written by [`subset_and_publish`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishedSubset {
    pub file_name: String,
    pub bytes: u64,
    pub css_path: PathBuf,
    pub cleanup: CleanupReport,
}

/// Subset `font_data` to `codepoints`, verify coverage, and publish the
/// WOFF2 plus its `@font-face` CSS.
///
/// Missing codepoints the source font supports fail the build; codepoints
/// the source font itself does not map only warn (they fall back to a later
/// font in the stack).
pub fn subset_and_publish(
    font_data: &[u8],
    codepoints: &[u32],
    options: &SubsetPublishOptions,
) -> Result<PublishedSubset> {
    let subset = subset_with_skera(font_data, codepoints)?;

    let coverage = verify_subset_coverage(codepoints, font_data, &subset)?;
    if !coverage.missing_in_output.is_empty() {
        return Err(anyhow!(
            "subset output is missing codepoint(s) supported by the source font: {}",
            format_codepoint_list(&coverage.missing_in_output)
        ));
    }
    for &codepoint in &coverage.missing_in_source {
        eprintln!(
            "warning: {} {} but not supported by the source font; it will fall back to a later font",
            describe_codepoint(codepoint),
            options.missing_source_label
        );
    }

    let woff2 = woofwoof::compress(&subset, "", 11, true).context("failed to compress WOFF2")?;

    let descriptors = subset_font_descriptors(&subset)?;
    let file_name = hashed_output_file_name(options.output_file, &woff2);
    let font_url = font_url_for_css(
        options.css_output_dir,
        &options.font_output_dir.join(&file_name),
    )?;
    let css = write_font_css(
        options.generator_name,
        options.font_family,
        &font_url,
        codepoints,
        "swap",
        descriptors,
    );
    let css_path = options.css_output_dir.join(options.css_file);
    let cleanup = publish_font_artifacts(
        options.font_output_dir,
        options.output_file,
        Some((&file_name, &woff2)),
        &css_path,
        &css,
    )?;

    Ok(PublishedSubset {
        file_name,
        bytes: woff2.len() as u64,
        css_path,
        cleanup,
    })
}

pub fn hashed_output_file_name(file_name: &str, bytes: &[u8]) -> String {
    let hash = sha256_hex64(bytes);
    let (stem, extension) = split_file_name(file_name);
    format!("{stem}.{hash}.{extension}")
}

pub fn remove_old_font_outputs(
    output_dir: &Path,
    template_file: &str,
    keep_file: Option<&str>,
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
        if keep_file.is_some_and(|keep| file_name == keep) {
            continue;
        }

        // Only exact matches are removed: the plain template file (historical
        // un-hashed artifacts) and `<stem>.<16 hex digits>.<extension>` hashed
        // artifacts. Anything else, such as `<stem>.foo.<extension>` or
        // `<stem>.manual-backup.<extension>`, is left alone.
        let matches_plain = file_name == template_file;
        let matches_hashed = is_hashed_artifact(&file_name, stem, extension);
        if !matches_plain && !matches_hashed {
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

/// Whether `file_name` is `<stem>.<exactly HASH_HEX_LEN hex digits>.<extension>`.
fn is_hashed_artifact(file_name: &str, stem: &str, extension: &str) -> bool {
    let Some(rest) = file_name.strip_prefix(stem) else {
        return false;
    };
    let Some(rest) = rest.strip_prefix('.') else {
        return false;
    };
    let Some((hash, ext)) = rest.rsplit_once('.') else {
        return false;
    };
    hash.len() == HASH_HEX_LEN
        && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        && ext == extension
}

pub fn publish_font_artifacts(
    font_output_dir: &Path,
    template_file: &str,
    font: Option<(&str, &[u8])>,
    css_path: &Path,
    css: &str,
) -> Result<CleanupReport> {
    // The cleanup below lists this directory, so it must exist even when no
    // font is published.
    ensure_directory(font_output_dir)?;
    let keep_file = if let Some((file_name, bytes)) = font {
        let output_path = font_output_dir.join(file_name);
        write_atomic_if_changed(&output_path, bytes)
            .with_context(|| format!("failed to publish {}", output_path.display()))?;
        Some(file_name)
    } else {
        None
    };

    write_atomic_if_changed(css_path, css.as_bytes())
        .with_context(|| format!("failed to publish {}", css_path.display()))?;
    remove_old_font_outputs(font_output_dir, template_file, keep_file)
}

pub fn write_font_css(
    generator_name: &str,
    font_family: &str,
    font_url: &str,
    codepoints: &[u32],
    font_display: &str,
    descriptors: FontFaceDescriptors,
) -> String {
    let mut css = format!("/* Generated by {generator_name}. Do not edit by hand. */\n\n");
    css.push_str("@font-face {\n");
    css.push_str(&format!(
        "  font-family: \"{}\";\n",
        escape_css_string(font_family)
    ));
    if let Some(style) = descriptors.style {
        css.push_str(&format!("  font-style: {};\n", style));
    }
    if let Some(weight) = descriptors.weight {
        css.push_str(&format!("  font-weight: {};\n", weight));
    }
    css.push_str(&format!("  font-display: {};\n", font_display));
    css.push_str(&format!(
        "  src: url(\"{}\") format(\"woff2\");\n",
        escape_css_string(font_url)
    ));
    css.push_str(&format!(
        "  unicode-range: {};\n",
        css_unicode_range(codepoints)
    ));
    css.push_str("}\n");
    css
}

pub fn font_url_for_css(css_output_dir: &Path, font_path: &Path) -> Result<String> {
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

fn inverted_set<T>() -> IntSet<T>
where
    T: Clone + Eq + std::hash::Hash,
{
    let mut set = IntSet::<T>::empty();
    set.invert();
    set
}

fn split_file_name(file_name: &str) -> (&str, &str) {
    file_name.rsplit_once('.').unwrap_or((file_name, "woff2"))
}

/// Truncated SHA-256 (64 bits) rendered as 16 lowercase hex digits. The
/// full hash is not needed for cache busting; 64 bits keep collisions
/// negligible while the filename stays compact.
fn sha256_hex64(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    digest[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn css_unicode_range(codepoints: &[u32]) -> String {
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

pub fn format_range(start: u32, end: u32) -> String {
    if start == end {
        format!("U+{:04X}", start)
    } else {
        format!("U+{:04X}-{:04X}", start, end)
    }
}

fn escape_css_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
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
        css_unicode_range, hashed_output_file_name, remove_old_font_outputs, subset_with_skera,
        CleanupReport,
    };
    use crate::font::coverage::{classify_coverage, font_codepoints};
    use std::collections::BTreeSet;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};
    use write_fonts::read::tables::layout::FeatureList;
    use write_fonts::read::{FontRef, TableProvider};

    fn unique_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "hibikilogy-font-asset-{}-{}",
            name,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn touch(dir: &std::path::Path, name: &str) {
        fs::write(dir.join(name), b"x").unwrap();
    }

    fn cleanup_report(template_file: &str, names: &[&str]) -> Vec<String> {
        let dir = unique_dir("cleanup");
        fs::create_dir_all(&dir).unwrap();
        for name in names {
            touch(&dir, name);
        }
        let report = remove_old_font_outputs(&dir, template_file, None).unwrap();
        fs::remove_dir_all(dir).unwrap();
        report.removed
    }

    #[test]
    fn cleanup_removes_only_plain_template_and_exact_hashed_artifacts() {
        let removed = cleanup_report(
            "font.woff2",
            &[
                "font.woff2",                   // plain template: removed
                "font.1234567890abcdef.woff2",  // 16 hex digits: removed
                "font.foo.woff2",               // non-hash middle: kept
                "font.manual-backup.woff2",     // non-hash middle: kept
                "font.1234567890abcde.woff2",   // 15 hex digits: kept
                "font.1234567890abcdefg.woff2", // 17 hex digits: kept
                "font.1234567890abcdef.ttf",    // wrong extension: kept
                "other.1234567890abcdef.woff2", // other stem: kept
            ],
        );
        assert_eq!(removed, vec!["font.1234567890abcdef.woff2", "font.woff2"]);
    }

    #[test]
    fn cleanup_handles_stems_containing_dots() {
        let removed = cleanup_report(
            "font.patch.woff2",
            &[
                "font.patch.woff2",                  // plain template: removed
                "font.patch.abcdef1234567890.woff2", // 16 hex digits: removed
                "font.patch.foo.woff2",              // non-hash middle: kept
                "font.patch.woff2.bak",              // unrelated: kept
            ],
        );
        assert_eq!(
            removed,
            vec!["font.patch.abcdef1234567890.woff2", "font.patch.woff2"]
        );
    }

    #[test]
    fn cleanup_keeps_the_newly_published_file() {
        let dir = unique_dir("keep");
        fs::create_dir_all(&dir).unwrap();
        touch(&dir, "font.aaaaaaaaaaaaaaaa.woff2");
        touch(&dir, "font.1234567890abcdef.woff2");
        let report: CleanupReport =
            remove_old_font_outputs(&dir, "font.woff2", Some("font.aaaaaaaaaaaaaaaa.woff2"))
                .unwrap();
        fs::remove_dir_all(dir).unwrap();
        assert_eq!(report.removed, vec!["font.1234567890abcdef.woff2"]);
    }

    #[test]
    fn hashed_output_file_name_is_deterministic_and_formatted() {
        let first = hashed_output_file_name("font.woff2", b"payload");
        let second = hashed_output_file_name("font.woff2", b"payload");
        assert_eq!(first, second);
        assert_eq!(first.len(), "font.".len() + 16 + ".woff2".len());
        assert!(first.ends_with(".woff2"));
        let hash = &first["font.".len()..first.len() - ".woff2".len()];
        assert!(hash.bytes().all(|byte| byte.is_ascii_hexdigit()));

        let other = hashed_output_file_name("font.woff2", b"other");
        assert_ne!(first, other);
    }

    #[test]
    fn css_unicode_range_formats_singletons_and_ranges() {
        assert_eq!(css_unicode_range(&[0x4E00]), "U+4E00");
        assert_eq!(
            css_unicode_range(&[0x4E00, 0x4E01, 0x4E03]),
            "U+4E00-4E01, U+4E03"
        );
        assert_eq!(css_unicode_range(&[]), "U+0-10FFFF");
    }

    #[test]
    fn weight_descriptor_prefers_fvar_then_os2_then_none() {
        use super::{weight_descriptor, FontMeta};
        assert_eq!(
            weight_descriptor(FontMeta {
                fvar_wght: Some((250, 900)),
                os2_weight_class: Some(250),
            }),
            Some("250 900".to_string())
        );
        assert_eq!(
            weight_descriptor(FontMeta {
                fvar_wght: None,
                os2_weight_class: Some(400),
            }),
            Some("400".to_string())
        );
        assert_eq!(
            weight_descriptor(FontMeta {
                fvar_wght: None,
                os2_weight_class: None,
            }),
            None
        );
    }

    #[test]
    fn descriptors_read_weight_from_the_real_fonts() {
        use super::subset_font_descriptors;
        // The committed variable fonts expose wght 250..900; a static font
        // without fvar would fall back to OS/2 usWeightClass instead.
        let serif = fs::read("themes/hibikilogy/static/fonts/SourceHanSerifCN-VF.ttf")
            .expect("committed source font should exist");
        let descriptors = subset_font_descriptors(&serif).expect("font should parse");
        assert_eq!(descriptors.style.as_deref(), Some("normal"));
        assert_eq!(descriptors.weight.as_deref(), Some("250 900"));
    }

    #[test]
    fn write_font_css_emits_owned_descriptors() {
        use super::{write_font_css, FontFaceDescriptors};
        let css = write_font_css(
            "test",
            "Fam",
            "../fonts/f.woff2",
            &[0x4E00],
            "swap",
            FontFaceDescriptors {
                style: Some("normal".to_string()),
                weight: Some("250 900".to_string()),
            },
        );
        assert!(css.contains("font-family: \"Fam\";"));
        assert!(css.contains("font-style: normal;"));
        assert!(css.contains("font-weight: 250 900;"));
        assert!(css.contains("font-display: swap;"));
        assert!(css.contains("unicode-range: U+4E00;"));
    }

    fn layout_feature_tags(feature_list: &FeatureList) -> BTreeSet<String> {
        feature_list
            .feature_records()
            .iter()
            .map(|record| record.feature_tag().to_string())
            .collect()
    }

    #[test]
    fn subset_drops_vertical_features_and_keeps_horizontal_ones() {
        // Real committed source font, small codepoint set (Latin + hanzi).
        let font_data = fs::read("themes/hibikilogy/static/fonts/SourceHanSansSC-VF.ttf")
            .expect("committed source font should exist");
        let requested = [
            0x41, 0x42, 0x43,   // ASCII, keeps Latin kern lookups alive
            0x00E9, // é, exercises ccmp composition lookups
            0x4E00, 0x7684, 0x3001,
        ];
        let subset = subset_with_skera(&font_data, &requested).expect("subset should succeed");

        // The subset must still cover every requested codepoint the source
        // font supports.
        let report = classify_coverage(
            &requested.iter().copied().collect(),
            &font_codepoints(&font_data).unwrap(),
            &font_codepoints(&subset).unwrap(),
        );
        assert!(report.missing_in_output.is_empty(), "{report:?}");

        // The output must parse and expose its layout tables.
        let font = FontRef::new(&subset).expect("subset output should parse");
        let gsub = font.gsub().expect("GSUB should be readable");
        let gpos = font.gpos().expect("GPOS should be readable");
        let output_features: BTreeSet<String> = layout_feature_tags(&gsub.feature_list().unwrap())
            .union(&layout_feature_tags(&gpos.feature_list().unwrap()))
            .cloned()
            .collect();

        // No vertical features may survive, even though the source declares
        // vert/vrt2/vkrn/vpal/vhal/vjmo.
        let vertical: BTreeSet<String> = [
            "vert", "vrt2", "vkrn", "vpal", "vhal", "vchw", "valt", "vjmo",
        ]
        .into_iter()
        .map(str::to_string)
        .collect();
        assert!(
            output_features.is_disjoint(&vertical),
            "vertical features survived: {:?}",
            output_features.intersection(&vertical).collect::<Vec<_>>()
        );

        // Horizontal features relevant to the retained glyphs survive
        // (natural pruning of unrelated features is allowed; ccmp is not
        // exercised by these precomposed codepoints).
        for key in ["kern", "locl", "fwid", "pwid"] {
            assert!(
                output_features.contains(key),
                "expected horizontal feature {key:?} to survive in {:?}",
                output_features
            );
        }

        // Every surviving feature must come from the source font (minus the
        // vertical denylist): no invented or passthrough layout features.
        let source_gsub: BTreeSet<String> =
            layout_feature_tags(&font.gsub().unwrap().feature_list().unwrap());
        let source_gpos: BTreeSet<String> =
            layout_feature_tags(&font.gpos().unwrap().feature_list().unwrap());
        let source_features: BTreeSet<String> = source_gsub
            .union(&source_gpos)
            .cloned()
            .collect::<BTreeSet<_>>()
            .difference(&vertical)
            .cloned()
            .collect();
        assert!(output_features.is_subset(&source_features));

        // Glyph-order-sensitive passthrough tables must not appear (the
        // subset renumbers glyph IDs).
        let output_tables: Vec<String> = font
            .table_directory()
            .table_records()
            .iter()
            .map(|record| record.tag().to_string())
            .collect();
        for banned in ["morx", "mort", "kerx", "trak", "ankr"] {
            assert!(
                !output_tables.iter().any(|tag| tag == banned),
                "{banned} leaked through"
            );
        }
    }
}
