use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

pub(super) const CACHE_VERSION: u32 = 4;
const STATE_CACHE_VERSION: u32 = 1;

#[derive(Debug, Default, Serialize, Deserialize)]
pub(super) struct MetadataCache {
    pub version: u32,
    #[serde(default)]
    pub entries: BTreeMap<String, CachedImageMetadata>,
    #[serde(default)]
    pub unsupported_entries: BTreeMap<String, CachedUnsupportedImage>,
    #[serde(default)]
    pub paths: BTreeMap<String, CachedPathRecord>,
    #[serde(default)]
    pub files: BTreeMap<String, CachedFileRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct CachedImageMetadata {
    pub thumbhash: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct CachedUnsupportedImage {
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct CachedPathRecord {
    pub content_hash: String,
    pub len: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct CachedFileRecord {
    pub len: u64,
    pub modified_ms: u64,
    pub config_fingerprint: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct FileStat {
    pub len: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Default, Deserialize)]
struct RuntimeCache {
    version: u32,
    #[serde(default)]
    paths: BTreeMap<String, CachedPathRecord>,
    #[serde(default)]
    files: BTreeMap<String, CachedFileRecord>,
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
    files: &'a BTreeMap<String, CachedFileRecord>,
}

pub(super) fn load(path: &Path, state_path: &Path) -> Result<MetadataCache> {
    let mut cache = if path.exists() {
        let json = fs::read_to_string(path)
            .with_context(|| format!("failed to read cache {}", path.display()))?;
        serde_json::from_str(&json)
            .with_context(|| format!("failed to parse cache {}", path.display()))?
    } else {
        MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        }
    };
    if cache.version != CACHE_VERSION {
        cache.version = CACHE_VERSION;
        cache.paths.clear();
        cache.files.clear();
    }
    if state_path.exists() {
        let json = fs::read_to_string(state_path)
            .with_context(|| format!("failed to read state cache {}", state_path.display()))?;
        let state: RuntimeCache = serde_json::from_str(&json)
            .with_context(|| format!("failed to parse state cache {}", state_path.display()))?;
        if state.version == STATE_CACHE_VERSION {
            cache.paths = state.paths;
            cache.files = state.files;
        }
    }
    Ok(cache)
}

pub(super) fn is_fresh(
    cache: &MetadataCache,
    key: &str,
    stat: FileStat,
    fingerprint: &str,
) -> bool {
    cache.files.get(key).is_some_and(|record| {
        record.len == stat.len
            && record.modified_ms == stat.modified_ms
            && record.config_fingerprint == fingerprint
    })
}

pub(super) fn save(path: &Path, state_path: &Path, cache: &MetadataCache) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create cache directory {}", parent.display()))?;
    }
    write_json_if_changed(
        path,
        &PersistedMetadataCache {
            version: CACHE_VERSION,
            entries: &cache.entries,
            unsupported_entries: &cache.unsupported_entries,
        },
        "metadata cache",
    )?;
    write_json_if_changed(
        state_path,
        &PersistedRuntimeCache {
            version: STATE_CACHE_VERSION,
            paths: &cache.paths,
            files: &cache.files,
        },
        "state cache",
    )
}

fn write_json_if_changed<T: Serialize>(path: &Path, value: &T, label: &str) -> Result<()> {
    let mut json = serde_json::to_vec_pretty(value)?;
    json.push(b'\n');
    if fs::read(path).is_ok_and(|current| current == json) {
        return Ok(());
    }
    atomic_write(path, &json).with_context(|| format!("failed to write {label} {}", path.display()))
}

pub(super) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    hibikilogy_tools::managed_fs::write_atomic(path, bytes)
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

pub(super) fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(super) fn hex_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cache_file() -> MetadataCache {
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        cache.entries.insert(
            "img/hero.png".to_string(),
            CachedImageMetadata {
                thumbhash: "hash".to_string(),
                width: 1,
                height: 2,
            },
        );
        cache.paths.insert(
            "page.html".to_string(),
            CachedPathRecord {
                content_hash: "abc".to_string(),
                len: 10,
                modified_ms: 20,
            },
        );
        cache.files.insert(
            "page.html".to_string(),
            CachedFileRecord {
                len: 10,
                modified_ms: 20,
                config_fingerprint: "old".to_string(),
            },
        );
        cache
    }

    #[test]
    fn config_fingerprint_invalidates_only_file_state() {
        let cache = cache_file();
        let stat = FileStat {
            len: 10,
            modified_ms: 20,
        };
        assert!(is_fresh(&cache, "page.html", stat, "old"));
        assert!(!is_fresh(&cache, "page.html", stat, "new"));
        assert!(cache.entries.contains_key("img/hero.png"));
    }

    #[test]
    fn load_returns_fresh_defaults_without_cache_files() {
        let temp = tempfile::tempdir().unwrap();
        let cache_path = temp.path().join("cache.json");
        let state_path = temp.path().join("state.json");

        let cache = load(&cache_path, &state_path).unwrap();

        assert_eq!(cache.version, CACHE_VERSION);
        assert!(cache.entries.is_empty());
        assert!(cache.paths.is_empty());
        assert!(cache.files.is_empty());
    }

    #[test]
    fn save_then_load_round_trips_all_state() {
        let temp = tempfile::tempdir().unwrap();
        let cache_path = temp.path().join("cache.json");
        let state_path = temp.path().join("state.json");
        let expected = cache_file();

        save(&cache_path, &state_path, &expected).unwrap();
        let loaded = load(&cache_path, &state_path).unwrap();

        assert_eq!(loaded.version, CACHE_VERSION);
        assert_eq!(loaded.entries, expected.entries);
        assert_eq!(loaded.unsupported_entries, expected.unsupported_entries);
        assert_eq!(loaded.paths, expected.paths);
        assert_eq!(loaded.files, expected.files);
    }

    #[test]
    fn stale_metadata_version_clears_runtime_state_but_keeps_entries() {
        let temp = tempfile::tempdir().unwrap();
        let cache_path = temp.path().join("cache.json");
        let state_path = temp.path().join("state.json");
        fs::write(
            &cache_path,
            serde_json::to_string_pretty(&json!({
                "version": CACHE_VERSION - 1,
                "entries": { "img/hero.png": { "thumbhash": "hash", "width": 1, "height": 2 } },
                "paths": { "page.html": { "content_hash": "abc", "len": 10, "modified_ms": 20 } },
                "files": { "page.html": { "len": 10, "modified_ms": 20, "config_fingerprint": "old" } },
            }))
            .unwrap(),
        )
        .unwrap();

        let cache = load(&cache_path, &state_path).unwrap();

        assert_eq!(cache.version, CACHE_VERSION);
        assert!(cache.entries.contains_key("img/hero.png"));
        assert!(cache.paths.is_empty(), "runtime paths must be invalidated");
        assert!(cache.files.is_empty(), "runtime files must be invalidated");
    }

    #[test]
    fn stale_state_version_is_ignored_while_metadata_cache_survives() {
        let temp = tempfile::tempdir().unwrap();
        let cache_path = temp.path().join("cache.json");
        let state_path = temp.path().join("state.json");
        fs::write(
            &cache_path,
            serde_json::to_string_pretty(&json!({
                "version": CACHE_VERSION,
                "entries": { "img/hero.png": { "thumbhash": "hash", "width": 1, "height": 2 } },
            }))
            .unwrap(),
        )
        .unwrap();
        fs::write(
            &state_path,
            serde_json::to_string_pretty(&json!({
                "version": STATE_CACHE_VERSION + 1,
                "paths": { "page.html": { "content_hash": "abc", "len": 10, "modified_ms": 20 } },
                "files": { "page.html": { "len": 10, "modified_ms": 20, "config_fingerprint": "old" } },
            }))
            .unwrap(),
        )
        .unwrap();

        let cache = load(&cache_path, &state_path).unwrap();

        assert!(cache.entries.contains_key("img/hero.png"));
        assert!(cache.paths.is_empty(), "stale state must not be merged");
        assert!(cache.files.is_empty());
    }
}
