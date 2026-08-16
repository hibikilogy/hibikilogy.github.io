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

/// WOFF2 brotli quality of every shipped font file (chunks, latin subset).
/// Boundary probes use a cheaper quality — see `chunk::PROBE_QUALITY`.
pub const FINAL_QUALITY: usize = 11;

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

/// A source font prepared for repeated subsetting: parsed once, with the
/// horizontal layout-feature list and the gvar repair index precomputed, so
/// chunk-size probes don't redo that work per probe.
pub struct Subsetter<'a> {
    font: FontRef<'a>,
    layout_features: IntSet<Tag>,
    gvar_source: crate::font::gvar::GvarSource<'a>,
}

impl<'a> Subsetter<'a> {
    pub fn new(font_data: &'a [u8]) -> Result<Self> {
        let font = FontRef::new(font_data).context("failed to parse input font")?;
        let layout_features = horizontal_layout_features(&font)?;
        let gvar_source = crate::font::gvar::GvarSource::new(&font)?;
        Ok(Self {
            font,
            layout_features,
            gvar_source,
        })
    }

    pub fn subset(&self, codepoints: &[u32]) -> Result<Vec<u8>> {
        let unicodes = codepoints.iter().copied().collect::<IntSet<u32>>();
        let gids = IntSet::empty();
        let drop_tables = IntSet::<Tag>::empty();
        let layout_scripts = inverted_set::<Tag>();
        let name_ids = inverted_set::<NameId>();
        let name_languages = inverted_set::<u16>();
        let flags = SubsetFlags::SUBSET_FLAGS_PASSTHROUGH_UNRECOGNIZED
            | SubsetFlags::SUBSET_FLAGS_GLYPH_NAMES
            | SubsetFlags::SUBSET_FLAGS_NOTDEF_OUTLINE;

        let plan = Plan::new(
            &gids,
            &unicodes,
            &self.font,
            flags,
            &drop_tables,
            &layout_scripts,
            &self.layout_features,
            &name_ids,
            &name_languages,
        );

        let subset = subset_font(&self.font, &plan)
            .map_err(|error| anyhow!("skera subset failed: {error}"))?;
        // skera corrupts the gvar offset array whenever subsetting compacts
        // glyph IDs (see the gvar module docs); rebuild the table before it
        // reaches a renderer.
        crate::font::gvar::repair_with_source(&self.gvar_source, &subset)
    }
}

pub fn subset_with_skera(font_data: &[u8], codepoints: &[u32]) -> Result<Vec<u8>> {
    Subsetter::new(font_data)?.subset(codepoints)
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
    /// Series stem for content-hashed chunk names, e.g.
    /// `source-han-sans-sc-vf.patch.woff2`.
    pub output_file: &'a str,
    /// Noun phrase used in the fallback warning for codepoints the source
    /// font does not map, e.g. "required by content".
    pub missing_source_label: &'a str,
    /// Per-codepoint usage counts from the site; drives the first frequency
    /// layer of chunk ordering (the rest fall back to the Google slicing
    /// table at `slicing_config`).
    pub site_counts: &'a std::collections::HashMap<u32, u64>,
    /// `scripts/data/font-slicing.config.json`.
    pub slicing_config: &'a Path,
    /// Non-CJK codepoints (printable ASCII, Latin extensions, Western
    /// punctuation, symbols) shipped as one consolidated subset file ahead of
    /// the frequency chunks, so e.g. Latin text loads a single small file
    /// instead of any chunk. May be empty; the chunks are then the whole
    /// series.
    pub latin_codepoints: &'a [u32],
    /// Records the first chunk's served path as JSON for the template's
    /// `<link rel="preload">` (read via Zola's `load_data`, which needs a
    /// stable location while chunk names are content-hashed). The file is
    /// removed again if the series ever publishes nothing.
    pub preload_cache_file: Option<&'a Path>,
}

/// One published chunk: file name plus compressed size.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishedChunk {
    pub file_name: String,
    pub bytes: u64,
}

/// Artifacts written by [`subset_and_publish`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishedSubset {
    pub chunks: Vec<PublishedChunk>,
    pub css_path: PathBuf,
    pub cleanup: CleanupReport,
}

/// Verify that `subset` covers every requested codepoint the source font
/// supports, failing on gaps. Requests the source font does not map only warn
/// (they fall back to a later font in the stack).
fn verify_subset(
    requested: &[u32],
    font_data: &[u8],
    subset: &[u8],
    what: &str,
    missing_source_label: &str,
) -> Result<()> {
    let coverage = verify_subset_coverage(requested, font_data, subset)?;
    if !coverage.missing_in_output.is_empty() {
        return Err(anyhow!(
            "{what} is missing codepoint(s) supported by the source font: {}",
            format_codepoint_list(&coverage.missing_in_output)
        ));
    }
    for &codepoint in &coverage.missing_in_source {
        eprintln!(
            "warning: {} {} but not supported by the source font; it will fall back to a later font",
            describe_codepoint(codepoint),
            missing_source_label
        );
    }
    Ok(())
}

/// Subset `font_data` to `codepoints` (frequency order), split the result
/// into chunks sized for lazy loading, verify coverage, and publish the
/// chunks plus their `@font-face` CSS.
///
/// Missing codepoints the source font supports fail the build; codepoints
/// the source font itself does not map only warn (they fall back to a later
/// font in the stack).
pub fn subset_and_publish(
    font_data: &[u8],
    codepoints: &[u32],
    options: &SubsetPublishOptions,
) -> Result<PublishedSubset> {
    let model =
        crate::font::frequency::FrequencyModel::new(options.site_counts, options.slicing_config)?;
    let ordered = model.order(codepoints);
    let subsetter = Subsetter::new(font_data)?;
    let chunks = crate::font::chunk::chunk_font(&subsetter, &ordered, options.output_file)?;
    if chunks.is_empty() && options.latin_codepoints.is_empty() {
        return Err(anyhow!(
            "no codepoints to subset for {}",
            options.font_family
        ));
    }

    // The consolidated latin subset ships first, so its rule leads the CSS
    // and its file preloads ahead of the chunk series.
    let (latin_file_name, latin_subset) = if options.latin_codepoints.is_empty() {
        (None, None)
    } else {
        let latin_subset = subsetter.subset(options.latin_codepoints)?;
        verify_subset(
            options.latin_codepoints,
            font_data,
            &latin_subset,
            "latin subset",
            options.missing_source_label,
        )?;
        let latin_bytes = woofwoof::compress(&latin_subset, "", FINAL_QUALITY, true)
            .context("failed to compress WOFF2 latin subset")?;
        let (stem, extension) = split_file_name(options.output_file);
        let file_name = hashed_output_file_name(&format!("{stem}-latin.{extension}"), &latin_bytes);
        (Some((file_name, latin_bytes)), Some(latin_subset))
    };

    let descriptors = if chunks.is_empty() {
        subset_font_descriptors(
            latin_subset
                .as_deref()
                .expect("latin subset exists when chunks are empty"),
        )?
    } else {
        let all: Vec<u32> = chunks
            .iter()
            .flat_map(|c| c.codepoints.iter().copied())
            .collect();
        // Verify coverage against the union of all chunk subsets, not one chunk.
        let union_subset = subsetter.subset(&all)?;
        verify_subset(
            &all,
            font_data,
            &union_subset,
            "subset output",
            options.missing_source_label,
        )?;
        subset_font_descriptors(&union_subset)?
    };

    // Publish the latin file first, then the chunks; the css lists the latin
    // rule before the chunk rules.
    let mut publish: Vec<(&str, &[u8])> = Vec::new();
    let mut css_chunks: Vec<(String, &[u32])> = Vec::new();
    if let Some((file_name, bytes)) = &latin_file_name {
        let url = font_url_for_css(
            options.css_output_dir,
            &options.font_output_dir.join(file_name),
        )?;
        publish.push((file_name, bytes));
        css_chunks.push((url, options.latin_codepoints));
    }
    for chunk in &chunks {
        let url = font_url_for_css(
            options.css_output_dir,
            &options.font_output_dir.join(&chunk.file_name),
        )?;
        publish.push((chunk.file_name.as_str(), chunk.bytes.as_slice()));
        css_chunks.push((url, chunk.codepoints.as_slice()));
    }
    let css_refs: Vec<(&str, &[u32])> = css_chunks
        .iter()
        .map(|(url, cps)| (url.as_str(), *cps))
        .collect();
    let css = write_chunked_font_css(
        options.generator_name,
        options.font_family,
        "swap",
        &descriptors,
        &css_refs,
    );
    let css_path = options.css_output_dir.join(options.css_file);
    let cleanup = publish_chunked_font(
        options.font_output_dir,
        options.output_file,
        &publish,
        &css_path,
        &css,
    )?;
    if let Some(cache_path) = options.preload_cache_file {
        let mut paths: Vec<&str> = Vec::with_capacity(chunks.len().min(1) + 1);
        if let Some((file_name, _)) = &latin_file_name {
            paths.push(file_name);
        }
        if let Some(first_chunk) = chunks.first() {
            paths.push(&first_chunk.file_name);
        }
        write_preload_cache(cache_path, options.font_output_dir, &paths)?;
    }

    Ok(PublishedSubset {
        chunks: chunks
            .iter()
            .map(|c| PublishedChunk {
                file_name: c.file_name.clone(),
                bytes: c.bytes.len() as u64,
            })
            .collect(),
        css_path,
        cleanup,
    })
}

pub fn hashed_output_file_name(file_name: &str, bytes: &[u8]) -> String {
    let hash = sha256_hex64(bytes);
    let (stem, extension) = split_file_name(file_name);
    format!("{stem}.{hash}.{extension}")
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

/// Publish a chunked font series plus its `@font-face` CSS. `template_file`
/// is the series stem (e.g. `font.patch.woff2`); every previous chunk of the
/// series not in `chunks` is removed. Chunks publish in frequency order, so
/// the first rule in the CSS is the highest-frequency chunk. An empty
/// `chunks` list publishes the CSS alone and retires all previous artifacts.
pub fn publish_chunked_font(
    font_output_dir: &Path,
    series_template: &str,
    chunks: &[(&str, &[u8])],
    css_path: &Path,
    css: &str,
) -> Result<CleanupReport> {
    ensure_directory(font_output_dir)?;
    for (file_name, bytes) in chunks {
        let output_path = font_output_dir.join(file_name);
        write_atomic_if_changed(&output_path, bytes)
            .with_context(|| format!("failed to publish {}", output_path.display()))?;
    }
    write_atomic_if_changed(css_path, css.as_bytes())
        .with_context(|| format!("failed to publish {}", css_path.display()))?;

    let (stem, extension) = split_file_name(series_template);
    let keep: Vec<&str> = chunks.iter().map(|(name, _)| *name).collect();
    let mut report = CleanupReport::default();
    for entry in fs::read_dir(font_output_dir)
        .with_context(|| format!("failed to read {}", font_output_dir.display()))?
    {
        let entry =
            entry.with_context(|| format!("failed to read {}", font_output_dir.display()))?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if keep.contains(&file_name.as_ref()) {
            continue;
        }
        // Series files are `<stem>-<digits or latin>.<16 hex>.<ext>`; the
        // plain template and single-file hashed artifacts are also retired.
        let is_series = is_series_artifact(&file_name, stem, extension);
        let is_legacy =
            file_name == series_template || is_hashed_artifact(&file_name, stem, extension);
        if !is_series && !is_legacy {
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

/// Whether `file_name` is a series artifact, `<stem>-<series>.<exactly
/// HASH_HEX_LEN hex>.<extension>`, where `<series>` is either the chunk
/// number (`1`, `2`, …) or the consolidated `latin` subset.
fn is_series_artifact(file_name: &str, stem: &str, extension: &str) -> bool {
    let Some(rest) = file_name.strip_prefix(stem) else {
        return false;
    };
    let Some(rest) = rest.strip_prefix('-') else {
        return false;
    };
    let Some((series, rest)) = rest.split_once('.') else {
        return false;
    };
    if series != "latin" && (series.is_empty() || !series.bytes().all(|b| b.is_ascii_digit())) {
        return false;
    }
    let Some((hash, ext)) = rest.rsplit_once('.') else {
        return false;
    };
    hash.len() == HASH_HEX_LEN
        && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        && ext == extension
}

/// Record the served paths of the preload candidates (the latin subset, then
/// the first chunk) as `{"paths": ["<dir>/<file>", ...]}` for the template's
/// preload links. The served prefix is the font directory's own name
/// (`themes/hibikilogy/static/fonts` is served at `/fonts/`).
fn write_preload_cache(cache_path: &Path, font_output_dir: &Path, paths: &[&str]) -> Result<()> {
    let served_dir = font_output_dir
        .file_name()
        .with_context(|| format!("{} has no directory name", font_output_dir.display()))?
        .to_string_lossy();
    let inner = paths
        .iter()
        .map(|path| format!("\"{served_dir}/{path}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let json = format!("{{\"paths\": [{inner}]}}\n");
    if let Some(parent) = cache_path.parent() {
        ensure_directory(parent)?;
    }
    write_atomic_if_changed(cache_path, json.as_bytes())
        .with_context(|| format!("failed to write {}", cache_path.display()))?;
    Ok(())
}

/// Remove the preload cache when the series publishes no chunks, so a stale
/// entry cannot preload a deleted font file.
pub fn clear_preload_cache(cache_path: &Path) -> Result<()> {
    match fs::remove_file(cache_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => {
            Err(error).with_context(|| format!("failed to remove {}", cache_path.display()))
        }
    }
}

/// Render one `@font-face` rule per chunk, in order. `descriptors` apply to
/// every rule (a chunk series is one logical face, split for lazy loading).
pub fn write_chunked_font_css(
    generator_name: &str,
    font_family: &str,
    font_display: &str,
    descriptors: &FontFaceDescriptors,
    chunks: &[(&str, &[u32])],
) -> String {
    let mut css = format!("/* Generated by {generator_name}. Do not edit by hand. */\n\n");
    for (font_url, codepoints) in chunks {
        css.push_str("@font-face {\n");
        css.push_str(&format!(
            "  font-family: \"{}\";\n",
            escape_css_string(font_family)
        ));
        if let Some(style) = &descriptors.style {
            css.push_str(&format!("  font-style: {style};\n"));
        }
        if let Some(weight) = &descriptors.weight {
            css.push_str(&format!("  font-weight: {weight};\n"));
        }
        css.push_str(&format!("  font-display: {font_display};\n"));
        css.push_str(&format!(
            "  src: url(\"{}\") format(\"woff2\");\n",
            escape_css_string(font_url)
        ));
        css.push_str(&format!(
            "  unicode-range: {};\n",
            css_unicode_range(codepoints)
        ));
        css.push_str("}\n\n");
    }
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

/// Split a file name into stem and extension at the last dot, defaulting the
/// extension to `woff2` (the only font format these tools publish).
pub(crate) fn split_file_name(file_name: &str) -> (&str, &str) {
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
    use super::{css_unicode_range, hashed_output_file_name, subset_with_skera};
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

    #[test]
    fn publish_chunked_font_retires_previous_chunks() {
        let dir = unique_dir("retire");
        fs::create_dir_all(&dir).unwrap();
        let css_path = dir.join("font.css");
        let chunk = "font.patch-1.1234567890abcdef.woff2";
        super::publish_chunked_font(
            &dir,
            "font.patch.woff2",
            &[(chunk, b"one")],
            &css_path,
            "/* one */",
        )
        .unwrap();
        assert!(dir.join(chunk).exists());

        // Publishing an empty series must remove the previous chunk files, or
        // stale hashed artifacts would linger in the served directory.
        let report =
            super::publish_chunked_font(&dir, "font.patch.woff2", &[], &css_path, "/* empty */")
                .unwrap();
        assert_eq!(report.removed, vec![chunk]);
        assert!(!dir.join(chunk).exists());
        assert_eq!(fs::read_to_string(&css_path).unwrap(), "/* empty */");
        fs::remove_dir_all(dir).unwrap();
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
