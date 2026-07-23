use super::*;

pub(super) fn load_cache(path: &Path, state_path: &Path) -> Result<MetadataCache> {
    let mut cache = if !path.exists() {
        MetadataCache {
            version: CACHE_VERSION,
            ..MetadataCache::default()
        }
    } else {
        let json = fs::read_to_string(path)
            .with_context(|| format!("failed to read cache {}", path.display()))?;
        serde_json::from_str(&json)
            .with_context(|| format!("failed to parse cache {}", path.display()))?
    };

    if cache.version < CACHE_VERSION {
        cache.version = CACHE_VERSION;
        cache.paths.clear();
        cache.html_files.clear();
    }

    if state_path.exists() {
        let json = fs::read_to_string(state_path)
            .with_context(|| format!("failed to read state cache {}", state_path.display()))?;
        let state: RuntimeCache = serde_json::from_str(&json)
            .with_context(|| format!("failed to parse state cache {}", state_path.display()))?;
        if state.version == CACHE_VERSION {
            cache.paths = state.paths;
            cache.html_files = state.html_files;
        }
    }

    Ok(cache)
}

pub(super) fn is_cached_html_fresh(
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

pub(super) fn save_cache(path: &Path, state_path: &Path, cache: &MetadataCache) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).with_context(|| {
                format!("failed to create cache directory {}", parent.display())
            })?;
        }
    }

    let metadata = PersistedMetadataCache {
        version: CACHE_VERSION,
        entries: &cache.entries,
        unsupported_entries: &cache.unsupported_entries,
    };
    write_json_if_changed(path, &metadata, "metadata cache")?;

    let state = PersistedRuntimeCache {
        version: CACHE_VERSION,
        paths: &cache.paths,
        html_files: &cache.html_files,
    };
    write_json_if_changed(state_path, &state, "state cache")
}

pub(super) fn write_json_if_changed<T: Serialize>(
    path: &Path,
    value: &T,
    label: &str,
) -> Result<()> {
    let mut json =
        serde_json::to_vec_pretty(value).with_context(|| format!("failed to serialize {label}"))?;
    json.push(b'\n');

    if fs::read(path).is_ok_and(|current| current == json) {
        return Ok(());
    }

    fs::write(path, json).with_context(|| format!("failed to write {label} {}", path.display()))
}

pub(super) fn read_file_stat(path: &Path) -> Result<FileStat> {
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

pub(super) fn normalize_cache_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(super) fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}
