use super::*;

pub(super) fn resolve_local_image_path(
    src: Option<&str>,
    srcset: Option<&str>,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
) -> Result<Option<PathBuf>> {
    if let Some(src) = src {
        if let Some(path) =
            resolve_url_to_local_path(src, html_path, site_root, old_host, new_host)?
        {
            return Ok(Some(path));
        }
    }

    let Some(srcset) = srcset else {
        return Ok(None);
    };

    for candidate in srcset.split(',') {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        let url = trimmed.split_ascii_whitespace().next().unwrap_or_default();
        if let Some(path) =
            resolve_url_to_local_path(url, html_path, site_root, old_host, new_host)?
        {
            return Ok(Some(path));
        }
    }

    Ok(None)
}

pub(super) fn resolve_url_to_local_path(
    url: &str,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
) -> Result<Option<PathBuf>> {
    let trimmed = url.trim();
    if trimmed.is_empty() || should_skip_url(trimmed) || trimmed.starts_with("//") {
        return Ok(None);
    }

    let clean = trimmed.split(['?', '#']).next().unwrap_or(trimmed);
    let mapped = if let Some(stripped) = clean.strip_prefix(old_host.trim_end_matches('/')) {
        stripped
    } else if let Some(stripped) = clean.strip_prefix(new_host.trim_end_matches('/')) {
        stripped
    } else if clean.starts_with('/') || is_rewriteable_relative_url(clean) {
        clean
    } else {
        return Ok(None);
    };

    let Some(decoded) = decode_path(mapped) else {
        return Ok(None);
    };

    let path = if decoded.starts_with('/') {
        site_root.join(decoded.trim_start_matches('/'))
    } else {
        html_path.parent().unwrap_or(site_root).join(decoded)
    };

    if !path.is_file() {
        return Ok(None);
    }

    let canonical_path = path
        .canonicalize()
        .with_context(|| format!("failed to resolve local image {}", path.display()))?;
    if !canonical_path.starts_with(site_root) {
        bail!(
            "local image URL {url:?} from {} escapes site root {}",
            html_path.display(),
            site_root.display()
        );
    }

    Ok(Some(canonical_path))
}

pub(super) fn get_or_compute_image_metadata(
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

pub(super) fn compute_image_metadata(bytes: &[u8]) -> Result<CachedImageMetadata> {
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
