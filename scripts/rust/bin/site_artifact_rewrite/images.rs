use super::cache::{
    hex_sha256, normalize_path, read_file_stat, CachedImageMetadata, CachedPathRecord,
    CachedUnsupportedImage, MetadataCache,
};
use super::config::CompiledUrlMap;
use super::thumbhash;
use super::urls::resolve_local_path;
use anyhow::{Context, Result};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use image::GenericImageView;
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn resolve_image(
    sources: &[String],
    document_path: &Path,
    root: &Path,
    maps: &[&CompiledUrlMap],
) -> Result<Option<PathBuf>> {
    for source in sources {
        for candidate in source.split(',') {
            let url = candidate
                .trim()
                .split_ascii_whitespace()
                .next()
                .unwrap_or_default();
            if let Some(path) = resolve_local_path(url, document_path, root, maps)? {
                return Ok(Some(path));
            }
        }
    }
    Ok(None)
}

pub(super) fn get_or_compute(
    image_path: &Path,
    cache: &mut MetadataCache,
    cache_hits: &mut usize,
    cache_misses: &mut usize,
    skipped: &mut usize,
) -> Result<Option<CachedImageMetadata>> {
    let key = normalize_path(image_path);
    let stat = read_file_stat(image_path)?;
    if let Some(path) = cache.paths.get(&key) {
        if path.len == stat.len && path.modified_ms == stat.modified_ms {
            if let Some(metadata) = cache.entries.get(&path.content_hash) {
                *cache_hits += 1;
                return Ok(Some(metadata.clone()));
            }
            if cache.unsupported_entries.contains_key(&path.content_hash) {
                *cache_hits += 1;
                *skipped += 1;
                return Ok(None);
            }
        }
    }

    let bytes = fs::read(image_path)
        .with_context(|| format!("failed to read image {}", image_path.display()))?;
    let hash = hex_sha256(&bytes);
    let record = CachedPathRecord {
        content_hash: hash.clone(),
        len: stat.len,
        modified_ms: stat.modified_ms,
    };
    cache.paths.insert(key, record);
    if let Some(metadata) = cache.entries.get(&hash) {
        *cache_hits += 1;
        return Ok(Some(metadata.clone()));
    }
    if cache.unsupported_entries.contains_key(&hash) {
        *cache_hits += 1;
        *skipped += 1;
        return Ok(None);
    }

    let metadata = match compute(&bytes) {
        Ok(metadata) => metadata,
        Err(error) => {
            cache.unsupported_entries.insert(
                hash,
                CachedUnsupportedImage {
                    reason: error.to_string(),
                },
            );
            *cache_misses += 1;
            *skipped += 1;
            return Ok(None);
        }
    };
    cache.entries.insert(hash, metadata.clone());
    *cache_misses += 1;
    Ok(Some(metadata))
}

fn compute(bytes: &[u8]) -> Result<CachedImageMetadata> {
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
