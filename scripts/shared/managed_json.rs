//! JSON manifest persistence built on managed filesystem writes.

use super::managed_fs::write_atomic;
use anyhow::{Context, Result};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::Path;

pub fn load<T: DeserializeOwned>(path: &Path) -> Result<T> {
    let json =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    serde_json::from_str(&json).with_context(|| format!("failed to parse {}", path.display()))
}

pub fn save_pretty<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let mut json = serde_json::to_vec_pretty(value).context("failed to serialize JSON")?;
    json.push(b'\n');
    write_atomic(path, &json).with_context(|| format!("failed to write {}", path.display()))
}
