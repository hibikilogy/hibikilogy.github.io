#[path = "cache.rs"]
mod cache;
#[path = "html.rs"]
mod html;
#[path = "images.rs"]
mod images;
#[path = "thumbhash.rs"]
mod thumbhash;
#[path = "urls.rs"]
mod urls;

use anyhow::{bail, Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use clap::Parser;
use hibikilogy_tools::url_encoding::decode_path;
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

use cache::*;
use html::rewrite_html;
use images::*;
use urls::*;

const CACHE_VERSION: u32 = 4;
const CACHE_FILE_NAME: &str = "lazy-image-metadata.json";
const STATE_FILE_NAME: &str = "lazy-image-state.json";
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

#[derive(Debug, Default, Deserialize)]
struct RuntimeCache {
    version: u32,
    #[serde(default)]
    paths: BTreeMap<String, CachedPathRecord>,
    #[serde(default)]
    html_files: BTreeMap<String, CachedHtmlRecord>,
}

#[derive(Serialize)]
struct PersistedMetadataCache<'a> {
    version: u32,
    entries: &'a BTreeMap<String, CachedImageMetadata>,
    unsupported_entries: &'a BTreeMap<String, CachedUnsupportedImage>,
}

#[derive(Serialize)]
struct PersistedRuntimeCache<'a> {
    version: u32,
    paths: &'a BTreeMap<String, CachedPathRecord>,
    html_files: &'a BTreeMap<String, CachedHtmlRecord>,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileStat {
    len: u64,
    modified_ms: u64,
}

pub fn run() -> Result<()> {
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
    let canonical_site_root = directory
        .canonicalize()
        .with_context(|| format!("failed to resolve site root {}", directory.display()))?;

    let mut stats = RewriteStats::default();
    let state_file = cache_file.with_file_name(STATE_FILE_NAME);
    let mut cache = load_cache(cache_file, &state_file)?;

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
        let (rewritten, file_stats) = rewrite_html(
            &html,
            html_path,
            &canonical_site_root,
            old_host,
            new_host,
            &mut cache,
        )?;

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

    save_cache(cache_file, &state_file, &cache)?;
    Ok(stats)
}

#[cfg(test)]
#[path = "tests/mod.rs"]
mod tests;
