mod thumbhash;

use anyhow::{bail, Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use clap::Parser;
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

const CACHE_VERSION: u32 = 3;
const CACHE_FILE_NAME: &str = "lazy-image-metadata.json";
const SEARCH_ARTICLE_DATA_SCRIPT_ID: &str = "hibikilogy-search-articles-data";

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct RewriteStats {
    files_changed: usize,
    files_skipped: usize,
    urls_rewritten: usize,
    metadata_injected: usize,
    metadata_skipped: usize,
    cache_hits: usize,
    cache_misses: usize,
}

#[derive(Debug, Parser)]
#[command(about = "Rewrite lazy-image URLs and inject cached image metadata.")]
struct Args {
    #[arg(long, default_value = "config.toml")]
    config: PathBuf,
    directory: PathBuf,
    old_host: Option<String>,
    new_host: Option<String>,
    #[arg(long, default_value = "static/_cache")]
    cache_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
struct SiteConfig {
    extra: Option<SiteConfigExtra>,
}

#[derive(Debug, Deserialize)]
struct SiteConfigExtra {
    image_host_rewrite: Option<ImageHostRewriteConfig>,
}

#[derive(Debug, Deserialize)]
struct ImageHostRewriteConfig {
    old_host: String,
    new_host: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct MetadataCache {
    version: u32,
    #[serde(default)]
    entries: BTreeMap<String, CachedImageMetadata>,
    #[serde(default)]
    unsupported_entries: BTreeMap<String, CachedUnsupportedImage>,
    #[serde(default)]
    paths: BTreeMap<String, CachedPathRecord>,
    #[serde(default)]
    html_files: BTreeMap<String, CachedHtmlRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct CachedImageMetadata {
    thumbhash: String,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct CachedUnsupportedImage {
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct CachedPathRecord {
    content_hash: String,
    len: u64,
    modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct CachedHtmlRecord {
    len: u64,
    modified_ms: u64,
    old_host: String,
    new_host: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedTag {
    name: String,
    attributes: Vec<TagAttribute>,
    self_closing: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TagAttribute {
    name: String,
    value: Option<String>,
    quote: Option<char>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileStat {
    len: u64,
    modified_ms: u64,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let cache_file = args.cache_dir.join(CACHE_FILE_NAME);
    let host_config = resolve_host_rewrite_config(&args)?;
    let stats = rewrite_image_tags_in_directory(
        &args.directory,
        &host_config.old_host,
        &host_config.new_host,
        &cache_file,
    )?;
    println!(
        "Rewrote {} URL(s), injected {} metadata field(s), skipped {} metadata field(s), changed {} HTML file(s), and skipped {} unchanged HTML file(s). Cache hits: {}, misses: {}.",
        stats.urls_rewritten,
        stats.metadata_injected,
        stats.metadata_skipped,
        stats.files_changed,
        stats.files_skipped,
        stats.cache_hits,
        stats.cache_misses,
    );
    Ok(())
}

fn resolve_host_rewrite_config(args: &Args) -> Result<ImageHostRewriteConfig> {
    if let (Some(old_host), Some(new_host)) = (&args.old_host, &args.new_host) {
        return Ok(ImageHostRewriteConfig {
            old_host: old_host.clone(),
            new_host: new_host.clone(),
        });
    }

    let config = load_site_config(&args.config)?;
    let configured = config
        .extra
        .and_then(|extra| extra.image_host_rewrite)
        .with_context(|| {
            format!(
                "missing [extra.image_host_rewrite] in {}",
                args.config.display()
            )
        })?;

    Ok(ImageHostRewriteConfig {
        old_host: args.old_host.clone().unwrap_or(configured.old_host),
        new_host: args.new_host.clone().unwrap_or(configured.new_host),
    })
}

fn load_site_config(path: &Path) -> Result<SiteConfig> {
    let toml = fs::read_to_string(path)
        .with_context(|| format!("failed to read config {}", path.display()))?;
    toml::from_str(&toml).with_context(|| format!("failed to parse config {}", path.display()))
}

fn rewrite_image_tags_in_directory(
    directory: &Path,
    old_host: &str,
    new_host: &str,
    cache_file: &Path,
) -> Result<RewriteStats> {
    if !directory.is_dir() {
        bail!("{} is not a directory", directory.display());
    }

    let mut stats = RewriteStats::default();
    let mut cache = load_cache(cache_file)?;

    for entry in WalkDir::new(directory).follow_links(false) {
        let entry = entry.context("failed to walk directory")?;
        if !entry.file_type().is_file()
            || entry.path().extension().and_then(|ext| ext.to_str()) != Some("html")
        {
            continue;
        }

        let html_path = entry.path();
        let cache_key = normalize_cache_path(html_path);
        let file_stat = read_file_stat(html_path)
            .with_context(|| format!("failed to stat {}", html_path.display()))?;
        if is_cached_html_fresh(&cache, &cache_key, file_stat, old_host, new_host) {
            stats.files_skipped += 1;
            continue;
        }

        let html = fs::read_to_string(html_path)
            .with_context(|| format!("failed to read {}", html_path.display()))?;
        let (rewritten, file_stats) =
            rewrite_html(&html, html_path, directory, old_host, new_host, &mut cache)?;

        let processed_stat = if rewritten != html {
            fs::write(html_path, rewritten)
                .with_context(|| format!("failed to write {}", html_path.display()))?;
            stats.files_changed += 1;
            read_file_stat(html_path)
                .with_context(|| format!("failed to stat {}", html_path.display()))?
        } else {
            file_stat
        };

        cache.html_files.insert(
            cache_key,
            CachedHtmlRecord {
                len: processed_stat.len,
                modified_ms: processed_stat.modified_ms,
                old_host: old_host.to_string(),
                new_host: new_host.to_string(),
            },
        );

        stats.urls_rewritten += file_stats.urls_rewritten;
        stats.metadata_injected += file_stats.metadata_injected;
        stats.metadata_skipped += file_stats.metadata_skipped;
        stats.cache_hits += file_stats.cache_hits;
        stats.cache_misses += file_stats.cache_misses;
    }

    save_cache(cache_file, &cache)?;
    Ok(stats)
}

fn rewrite_html(
    html: &str,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
    cache: &mut MetadataCache,
) -> Result<(String, RewriteStats)> {
    if is_search_article_json_page(html_path, html) {
        return rewrite_search_article_json(
            html,
            html_path,
            site_root,
            old_host,
            new_host,
            cache,
        );
    }

    let mut output = String::with_capacity(html.len());
    let mut cursor = 0;
    let mut stats = RewriteStats::default();
    let mut container_stack: Vec<bool> = Vec::new();

    while let Some(relative_start) = html[cursor..].find('<') {
        let start = cursor + relative_start;
        output.push_str(&html[cursor..start]);

        let Some(tag_end) = find_tag_end(html, start + 1) else {
            output.push_str(&html[start..]);
            return Ok((output, stats));
        };

        let tag = &html[start..=tag_end];
        if is_html_comment_or_declaration(tag) {
            output.push_str(tag);
            cursor = tag_end + 1;
            continue;
        }

        if is_closing_tag(tag) {
            output.push_str(tag);
            container_stack.pop();
            cursor = tag_end + 1;
            continue;
        }

        let parsed = parse_tag(tag)?;
        let is_in_content_container = container_stack.last().copied().unwrap_or(false);
        if parsed.name.eq_ignore_ascii_case("lazy-image") || parsed.name.eq_ignore_ascii_case("img")
        {
            let (rewritten_tag, tag_stats) = rewrite_image_tag(
                parsed.clone(),
                is_in_content_container,
                html_path,
                site_root,
                old_host,
                new_host,
                cache,
            )?;
            output.push_str(&rewritten_tag);
            stats.urls_rewritten += tag_stats.urls_rewritten;
            stats.metadata_injected += tag_stats.metadata_injected;
            stats.metadata_skipped += tag_stats.metadata_skipped;
            stats.cache_hits += tag_stats.cache_hits;
            stats.cache_misses += tag_stats.cache_misses;
        } else {
            output.push_str(tag);
        }

        if is_raw_text_tag(&parsed.name) {
            let raw_content_start = tag_end + 1;
            if let Some(raw_end) = find_closing_tag(html, raw_content_start, &parsed.name) {
                if is_search_article_data_script(&parsed) {
                    let (rewritten_json, json_stats) = rewrite_search_article_json(
                        &html[raw_content_start..raw_end],
                        html_path,
                        site_root,
                        old_host,
                        new_host,
                        cache,
                    )?;
                    output.push_str(&rewritten_json);
                    stats.urls_rewritten += json_stats.urls_rewritten;
                    stats.metadata_injected += json_stats.metadata_injected;
                    stats.metadata_skipped += json_stats.metadata_skipped;
                    stats.cache_hits += json_stats.cache_hits;
                    stats.cache_misses += json_stats.cache_misses;
                } else {
                    output.push_str(&html[raw_content_start..raw_end]);
                }
                let Some(raw_tag_end) = find_tag_end(html, raw_end + 1) else {
                    output.push_str(&html[raw_end..]);
                    return Ok((output, stats));
                };
                output.push_str(&html[raw_end..=raw_tag_end]);
                cursor = raw_tag_end + 1;
                continue;
            }
        }

        if !parsed.self_closing && !is_void_tag(&parsed.name) {
            container_stack
                .push(is_in_content_container || has_class(&parsed, "content-container"));
        }
        cursor = tag_end + 1;
    }

    output.push_str(&html[cursor..]);
    Ok((output, stats))
}

fn is_search_article_json_page(html_path: &Path, html: &str) -> bool {
    let normalized = normalize_cache_path(html_path);
    normalized.ends_with("/search-articles/index.html") && html.trim_start().starts_with('{')
}

fn rewrite_search_article_json(
    json: &str,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
    cache: &mut MetadataCache,
) -> Result<(String, RewriteStats)> {
    let mut stats = RewriteStats::default();
    let mut value: Value = serde_json::from_str(json.trim())
        .context("failed to parse hibikilogy-search-articles-data JSON")?;
    let entries = value
        .as_object_mut()
        .context("hibikilogy-search-articles-data must be a JSON object")?;

    for record in entries.values_mut() {
        let Some(record) = record.as_object_mut() else {
            continue;
        };

        let Some(cover_src) = record
            .get("cs")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        if cover_src.trim().is_empty() {
            continue;
        }

        let (rewritten_cover_src, rewrites) =
            replace_url_with_count(&cover_src, old_host, new_host);
        stats.urls_rewritten += rewrites;
        if rewritten_cover_src != cover_src {
            record.insert("cs".to_string(), Value::String(rewritten_cover_src.clone()));
        }

        let needs_thumbhash = !record.contains_key("ct");
        let needs_width = !record.contains_key("cw");
        let needs_height = !record.contains_key("ch");
        if !(needs_thumbhash || needs_width || needs_height) {
            continue;
        }

        let Some(image_path) = resolve_url_to_local_path(
            &rewritten_cover_src,
            html_path,
            site_root,
            old_host,
            new_host,
        ) else {
            continue;
        };

        if let Some(metadata) = get_or_compute_image_metadata(&image_path, cache, &mut stats)? {
            if needs_thumbhash {
                record.insert("ct".to_string(), Value::String(metadata.thumbhash.clone()));
                stats.metadata_injected += 1;
            }
            if needs_width {
                record.insert("cw".to_string(), Value::Number(metadata.width.into()));
                stats.metadata_injected += 1;
            }
            if needs_height {
                record.insert("ch".to_string(), Value::Number(metadata.height.into()));
                stats.metadata_injected += 1;
            }
        }
    }

    Ok((serde_json::to_string(&value)?, stats))
}

fn rewrite_image_tag(
    mut parsed: ParsedTag,
    is_in_content_container: bool,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
    cache: &mut MetadataCache,
) -> Result<(String, RewriteStats)> {
    if !parsed.name.eq_ignore_ascii_case("lazy-image") && !parsed.name.eq_ignore_ascii_case("img") {
        return Ok((render_tag(&parsed), RewriteStats::default()));
    }

    let mut stats = RewriteStats::default();

    for attr_name in ["data-srcset", "srcset", "src"] {
        if let Some(attribute) = get_attr_mut(&mut parsed, attr_name) {
            if let Some(value) = attribute.value.as_deref() {
                let (replaced, replacements) =
                    rewrite_attribute_value(attr_name, value, old_host, new_host);
                attribute.value = Some(replaced);
                stats.urls_rewritten += replacements;
            }
        }
    }

    let is_lazy_image = parsed.name.eq_ignore_ascii_case("lazy-image");
    let converted_img = parsed.name.eq_ignore_ascii_case("img");
    let needs_thumbhash = !has_attr(&parsed, "thumbhash");
    let needs_width = !has_attr(&parsed, "width");
    let needs_height = !has_attr(&parsed, "height");
    let needs_metadata = needs_thumbhash || needs_width || needs_height;

    let local_image_path = if is_lazy_image {
        if needs_metadata {
            resolve_local_image_path(&parsed, html_path, site_root, old_host, new_host)
        } else {
            None
        }
    } else if is_in_content_container {
        resolve_local_image_path(&parsed, html_path, site_root, old_host, new_host)
    } else {
        None
    };

    if !is_lazy_image && local_image_path.is_none() {
        return Ok((render_tag(&parsed), stats));
    }

    if is_lazy_image && !needs_metadata {
        return Ok((render_tag(&parsed), stats));
    }

    if let Some(image_path) = local_image_path {
        if let Some(metadata) = get_or_compute_image_metadata(&image_path, cache, &mut stats)? {
            if converted_img {
                parsed.name = "lazy-image".to_string();
                parsed.self_closing = false;
                if !has_attr(&parsed, "zoomable") {
                    parsed.attributes.push(TagAttribute {
                        name: "zoomable".to_string(),
                        value: Some("true".to_string()),
                        quote: Some('"'),
                    });
                }
            }
            if needs_thumbhash {
                parsed.attributes.push(TagAttribute {
                    name: "thumbhash".to_string(),
                    value: Some(metadata.thumbhash.clone()),
                    quote: Some('"'),
                });
                stats.metadata_injected += 1;
            }
            if needs_width {
                parsed.attributes.push(TagAttribute {
                    name: "width".to_string(),
                    value: Some(metadata.width.to_string()),
                    quote: Some('"'),
                });
                stats.metadata_injected += 1;
            }
            if needs_height {
                parsed.attributes.push(TagAttribute {
                    name: "height".to_string(),
                    value: Some(metadata.height.to_string()),
                    quote: Some('"'),
                });
                stats.metadata_injected += 1;
            }
        }
    }

    if converted_img && parsed.name.eq_ignore_ascii_case("lazy-image") {
        Ok((format!("{}</lazy-image>", render_tag(&parsed)), stats))
    } else {
        Ok((render_tag(&parsed), stats))
    }
}

fn parse_tag(tag: &str) -> Result<ParsedTag> {
    let Some(end) = tag.rfind('>') else {
        bail!("unterminated tag: {tag}");
    };
    let mut body = &tag[1..end];
    let self_closing = body.trim_end().ends_with('/');
    if self_closing {
        body = body.trim_end_matches(|ch: char| ch.is_ascii_whitespace() || ch == '/');
    }

    let mut name_end = 0;
    for (index, ch) in body.char_indices() {
        if ch.is_ascii_whitespace() {
            name_end = index;
            break;
        }
    }
    if name_end == 0 {
        name_end = body.len();
    }

    let name = body[..name_end].to_string();
    let mut attributes = Vec::new();
    let mut index = name_end;
    let bytes = body.as_bytes();

    while index < body.len() {
        while index < body.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= body.len() {
            break;
        }

        let attr_start = index;
        while index < body.len()
            && !bytes[index].is_ascii_whitespace()
            && bytes[index] != b'='
            && bytes[index] != b'/'
        {
            index += 1;
        }
        if attr_start == index {
            index += 1;
            continue;
        }

        let attr_name = body[attr_start..index].to_string();
        while index < body.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }

        if index >= body.len() || bytes[index] != b'=' {
            attributes.push(TagAttribute {
                name: attr_name,
                value: None,
                quote: None,
            });
            continue;
        }

        index += 1;
        while index < body.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= body.len() {
            attributes.push(TagAttribute {
                name: attr_name,
                value: Some(String::new()),
                quote: Some('"'),
            });
            break;
        }

        let (value, quote) = if bytes[index] == b'"' || bytes[index] == b'\'' {
            let quote = bytes[index] as char;
            index += 1;
            let value_start = index;
            while index < body.len() && body.as_bytes()[index] != quote as u8 {
                index += 1;
            }
            let value = body[value_start..index].to_string();
            if index < body.len() {
                index += 1;
            }
            (value, Some(quote))
        } else {
            let value_start = index;
            while index < body.len() && !body.as_bytes()[index].is_ascii_whitespace() {
                index += 1;
            }
            (body[value_start..index].to_string(), None)
        };

        attributes.push(TagAttribute {
            name: attr_name,
            value: Some(value),
            quote,
        });
    }

    Ok(ParsedTag {
        name,
        attributes,
        self_closing,
    })
}

fn render_tag(tag: &ParsedTag) -> String {
    let mut output = String::new();
    output.push('<');
    output.push_str(&tag.name);

    for attribute in &tag.attributes {
        output.push(' ');
        output.push_str(&attribute.name);
        if let Some(value) = &attribute.value {
            let quote = attribute.quote.unwrap_or('"');
            output.push('=');
            output.push(quote);
            output.push_str(value);
            output.push(quote);
        }
    }

    if tag.self_closing {
        output.push_str(" />");
    } else {
        output.push('>');
    }

    output
}

fn has_attr(tag: &ParsedTag, name: &str) -> bool {
    tag.attributes
        .iter()
        .any(|attribute| attribute.name.eq_ignore_ascii_case(name))
}

fn get_attr<'a>(tag: &'a ParsedTag, name: &str) -> Option<&'a TagAttribute> {
    tag.attributes
        .iter()
        .find(|attribute| attribute.name.eq_ignore_ascii_case(name))
}

fn get_attr_mut<'a>(tag: &'a mut ParsedTag, name: &str) -> Option<&'a mut TagAttribute> {
    tag.attributes
        .iter_mut()
        .find(|attribute| attribute.name.eq_ignore_ascii_case(name))
}

fn has_class(tag: &ParsedTag, class_name: &str) -> bool {
    get_attr(tag, "class")
        .and_then(|attribute| attribute.value.as_deref())
        .is_some_and(|value| {
            value
                .split_ascii_whitespace()
                .any(|item| item == class_name)
        })
}

fn is_search_article_data_script(tag: &ParsedTag) -> bool {
    tag.name.eq_ignore_ascii_case("script")
        && get_attr(tag, "id")
            .and_then(|attribute| attribute.value.as_deref())
            .is_some_and(|value| value == SEARCH_ARTICLE_DATA_SCRIPT_ID)
        && get_attr(tag, "type")
            .and_then(|attribute| attribute.value.as_deref())
            .is_some_and(|value| value.eq_ignore_ascii_case("application/json"))
}

fn is_html_comment_or_declaration(tag: &str) -> bool {
    tag.starts_with("<!--") || tag.starts_with("<!") || tag.starts_with("<?")
}

fn is_closing_tag(tag: &str) -> bool {
    tag.starts_with("</")
}

fn is_void_tag(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn is_raw_text_tag(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "script" | "style" | "textarea" | "title"
    )
}

fn find_closing_tag(html: &str, start: usize, name: &str) -> Option<usize> {
    let mut needle = Vec::with_capacity(name.len() + 2);
    needle.extend_from_slice(b"</");
    needle.extend(name.bytes().map(|byte| byte.to_ascii_lowercase()));

    let bytes = html.as_bytes();
    let mut index = start;
    while index + needle.len() <= bytes.len() {
        if bytes[index] == b'<'
            && bytes[index..index + needle.len()]
                .iter()
                .zip(&needle)
                .all(|(left, right)| left.to_ascii_lowercase() == *right)
        {
            let after_name = index + needle.len();
            let next = bytes.get(after_name).copied();
            if next.is_some_and(|byte| byte == b'>' || byte.is_ascii_whitespace()) {
                return Some(index);
            }
        }

        index += 1;
    }

    None
}

fn find_tag_end(html: &str, start: usize) -> Option<usize> {
    let bytes = html.as_bytes();
    let mut quote: Option<u8> = None;
    let mut expecting_value = false;
    let mut index = start;

    while index < bytes.len() {
        let byte = bytes[index];
        match quote {
            Some(current) if byte == current => quote = None,
            Some(_) => {}
            None if byte == b'=' => expecting_value = true,
            None if expecting_value && byte.is_ascii_whitespace() => {}
            None if expecting_value && (byte == b'"' || byte == b'\'') => {
                quote = Some(byte);
                expecting_value = false;
            }
            None if byte == b'>' => return Some(index),
            None => expecting_value = false,
        }
        index += 1;
    }

    None
}

fn resolve_local_image_path(
    tag: &ParsedTag,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
) -> Option<PathBuf> {
    if let Some(src) = get_attr(tag, "src").and_then(|attribute| attribute.value.as_deref()) {
        if let Some(path) = resolve_url_to_local_path(src, html_path, site_root, old_host, new_host)
        {
            return Some(path);
        }
    }

    let srcset = get_attr(tag, "srcset")
        .and_then(|attribute| attribute.value.as_deref())
        .or_else(|| {
            get_attr(tag, "data-srcset").and_then(|attribute| attribute.value.as_deref())
        })?;

    for candidate in srcset.split(',') {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        let url = trimmed.split_ascii_whitespace().next().unwrap_or_default();
        if let Some(path) = resolve_url_to_local_path(url, html_path, site_root, old_host, new_host)
        {
            return Some(path);
        }
    }

    None
}

fn resolve_url_to_local_path(
    url: &str,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
) -> Option<PathBuf> {
    let trimmed = url.trim();
    if trimmed.is_empty() || should_skip_url(trimmed) || trimmed.starts_with("//") {
        return None;
    }

    let clean = trimmed.split(['?', '#']).next().unwrap_or(trimmed);
    let mapped = if let Some(stripped) = clean.strip_prefix(old_host.trim_end_matches('/')) {
        stripped
    } else if let Some(stripped) = clean.strip_prefix(new_host.trim_end_matches('/')) {
        stripped
    } else if clean.starts_with('/') || is_rewriteable_relative_url(clean) {
        clean
    } else {
        return None;
    };

    let decoded = percent_decode_path(mapped)?;

    let path = if decoded.starts_with('/') {
        site_root.join(decoded.trim_start_matches('/'))
    } else {
        html_path.parent().unwrap_or(site_root).join(decoded)
    };

    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

fn percent_decode_path(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = *bytes.get(index + 1)?;
            let low = *bytes.get(index + 2)?;
            decoded.push(hex_value(high)? * 16 + hex_value(low)?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn get_or_compute_image_metadata(
    image_path: &Path,
    cache: &mut MetadataCache,
    stats: &mut RewriteStats,
) -> Result<Option<CachedImageMetadata>> {
    let cache_key = normalize_cache_path(image_path);
    let stat = read_file_stat(image_path)
        .with_context(|| format!("failed to stat {}", image_path.display()))?;

    if let Some(path_record) = cache.paths.get(&cache_key) {
        if path_record.len == stat.len && path_record.modified_ms == stat.modified_ms {
            if let Some(entry) = cache.entries.get(&path_record.content_hash) {
                stats.cache_hits += 1;
                return Ok(Some(entry.clone()));
            }
            if cache
                .unsupported_entries
                .contains_key(&path_record.content_hash)
            {
                stats.cache_hits += 1;
                stats.metadata_skipped += 1;
                return Ok(None);
            }
        }
    }

    let bytes = fs::read(image_path)
        .with_context(|| format!("failed to read image {}", image_path.display()))?;
    let content_hash = hex_sha256(&bytes);

    if let Some(entry) = cache.entries.get(&content_hash) {
        cache.paths.insert(
            cache_key,
            CachedPathRecord {
                content_hash,
                len: stat.len,
                modified_ms: stat.modified_ms,
            },
        );
        stats.cache_hits += 1;
        return Ok(Some(entry.clone()));
    }

    if cache.unsupported_entries.contains_key(&content_hash) {
        cache.paths.insert(
            cache_key,
            CachedPathRecord {
                content_hash,
                len: stat.len,
                modified_ms: stat.modified_ms,
            },
        );
        stats.cache_hits += 1;
        stats.metadata_skipped += 1;
        return Ok(None);
    }

    let metadata = match compute_image_metadata(&bytes) {
        Ok(metadata) => metadata,
        Err(error) => {
            cache.unsupported_entries.insert(
                content_hash.clone(),
                CachedUnsupportedImage {
                    reason: error.to_string(),
                },
            );
            cache.paths.insert(
                cache_key,
                CachedPathRecord {
                    content_hash,
                    len: stat.len,
                    modified_ms: stat.modified_ms,
                },
            );
            stats.cache_misses += 1;
            stats.metadata_skipped += 1;
            return Ok(None);
        }
    };

    cache.entries.insert(content_hash.clone(), metadata.clone());
    cache.paths.insert(
        cache_key,
        CachedPathRecord {
            content_hash,
            len: stat.len,
            modified_ms: stat.modified_ms,
        },
    );
    stats.cache_misses += 1;
    Ok(Some(metadata))
}

fn compute_image_metadata(bytes: &[u8]) -> Result<CachedImageMetadata> {
    let image = image::load_from_memory(bytes).context("failed to decode image")?;
    let (width, height) = image.dimensions();
    let thumb = image.thumbnail(100, 100).to_rgba8();
    let thumbhash = thumbhash::rgba_to_thumb_hash(
        thumb.width() as usize,
        thumb.height() as usize,
        thumb.as_raw(),
    );

    Ok(CachedImageMetadata {
        thumbhash: URL_SAFE_NO_PAD.encode(thumbhash),
        width,
        height,
    })
}

fn load_cache(path: &Path) -> Result<MetadataCache> {
    if !path.exists() {
        return Ok(MetadataCache {
            version: CACHE_VERSION,
            ..MetadataCache::default()
        });
    }

    let json = fs::read_to_string(path)
        .with_context(|| format!("failed to read cache {}", path.display()))?;
    let mut cache: MetadataCache = serde_json::from_str(&json)
        .with_context(|| format!("failed to parse cache {}", path.display()))?;
    if cache.version < CACHE_VERSION {
        cache.version = CACHE_VERSION;
        cache.html_files.clear();
    }
    Ok(cache)
}

fn is_cached_html_fresh(
    cache: &MetadataCache,
    cache_key: &str,
    stat: FileStat,
    old_host: &str,
    new_host: &str,
) -> bool {
    cache.html_files.get(cache_key).is_some_and(|record| {
        record.len == stat.len
            && record.modified_ms == stat.modified_ms
            && record.old_host == old_host
            && record.new_host == new_host
    })
}

fn save_cache(path: &Path, cache: &MetadataCache) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).with_context(|| {
                format!("failed to create cache directory {}", parent.display())
            })?;
        }
    }

    let json = serde_json::to_string_pretty(cache).context("failed to serialize cache")?;
    fs::write(path, json).with_context(|| format!("failed to write cache {}", path.display()))
}

fn read_file_stat(path: &Path) -> Result<FileStat> {
    let metadata = fs::metadata(path)?;
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .context("file modified time predates unix epoch")?;
    Ok(FileStat {
        len: metadata.len(),
        modified_ms: modified.as_millis() as u64,
    })
}

fn normalize_cache_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

fn join_url(host: &str, path: &str) -> String {
    format!(
        "{}/{}",
        host.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

fn replace_url_with_count(url: &str, old_host: &str, new_host: &str) -> (String, usize) {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return (url.to_string(), 0);
    }

    let leading_len = url.len() - url.trim_start().len();
    let trailing_len = url.len() - url.trim_end().len();
    let leading = &url[..leading_len];
    let trailing = &url[url.len() - trailing_len..];

    if should_skip_url(trimmed) {
        return (url.to_string(), 0);
    }

    let old_host = old_host.trim_end_matches('/');
    let new_host = new_host.trim_end_matches('/');
    let relative_path = strip_relative_prefix(trimmed);

    let rewritten = if let Some(suffix) = trimmed.strip_prefix(old_host) {
        join_url(new_host, suffix)
    } else if trimmed.starts_with('/') || is_rewriteable_relative_url(trimmed) {
        join_url(new_host, relative_path)
    } else {
        trimmed.to_string()
    };

    if rewritten == trimmed {
        return (url.to_string(), 0);
    }

    (format!("{leading}{rewritten}{trailing}"), 1)
}

fn rewrite_attribute_value(
    attr_name: &str,
    value: &str,
    old_host: &str,
    new_host: &str,
) -> (String, usize) {
    if attr_name.ends_with("srcset") {
        rewrite_srcset_value(value, old_host, new_host)
    } else {
        replace_url_with_count(value, old_host, new_host)
    }
}

fn rewrite_srcset_value(value: &str, old_host: &str, new_host: &str) -> (String, usize) {
    let mut rewritten = Vec::new();
    let mut rewritten_urls = 0;

    for candidate in value.split(',') {
        let (rewritten_candidate, candidate_rewrites) =
            rewrite_srcset_candidate(candidate, old_host, new_host);
        rewritten.push(rewritten_candidate);
        rewritten_urls += candidate_rewrites;
    }

    if rewritten_urls == 0 {
        return (value.to_string(), 0);
    }

    (rewritten.join(","), rewritten_urls)
}

fn rewrite_srcset_candidate(candidate: &str, old_host: &str, new_host: &str) -> (String, usize) {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return (candidate.to_string(), 0);
    }

    let leading_len = candidate.len() - candidate.trim_start().len();
    let trailing_len = candidate.len() - candidate.trim_end().len();
    let leading = &candidate[..leading_len];
    let trailing = &candidate[candidate.len() - trailing_len..];
    let url_end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
    let url = &trimmed[..url_end];
    let descriptor = &trimmed[url_end..];
    let (rewritten_url, rewritten_count) = replace_url_with_count(url, old_host, new_host);

    if rewritten_count == 0 {
        return (candidate.to_string(), 0);
    }

    (
        format!("{leading}{rewritten_url}{descriptor}{trailing}"),
        rewritten_count,
    )
}

fn is_rewriteable_relative_url(url: &str) -> bool {
    !url.starts_with("//") && !url.starts_with('#') && !url.starts_with('?') && !has_scheme(url)
}

fn has_scheme(url: &str) -> bool {
    let Some(index) = url.find(':') else {
        return false;
    };

    index > 0
        && url[..index]
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '-' | '.'))
}

fn strip_relative_prefix(path: &str) -> &str {
    let mut normalized = path;

    while let Some(stripped) = normalized.strip_prefix("./") {
        normalized = stripped;
    }

    while let Some(stripped) = normalized.strip_prefix("../") {
        normalized = stripped;
    }

    normalized
}

fn should_skip_url(url: &str) -> bool {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".svg") || lower.ends_with(".gif")
}

#[cfg(test)]
mod convert_tests;
