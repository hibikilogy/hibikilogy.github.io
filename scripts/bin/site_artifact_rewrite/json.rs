use super::cache::{CachedImageMetadata, MetadataCache};
use super::config::{CompiledRules, JsonEach, JsonRule};
use super::images::{get_or_compute, resolve_image};
use super::stats::RewriteStats;
use super::urls::rewrite_url;
use anyhow::{Context, Result};
use serde_json::{Map, Number, Value};
use std::path::Path;

pub(super) fn rewrite(
    source: &str,
    rule: &JsonRule,
    document_path: &Path,
    root: &Path,
    rules: &CompiledRules,
    cache: &mut MetadataCache,
) -> Result<(String, RewriteStats)> {
    let mut stats = RewriteStats::default();
    let mut value: Value = serde_json::from_str(source.trim())
        .with_context(|| format!("JSON rule {:?} could not parse input", rule.name))?;
    match rule.each {
        JsonEach::ObjectValues => {
            let object = value.as_object_mut().with_context(|| {
                format!("JSON rule {:?} requires a top-level object", rule.name)
            })?;
            for item in object.values_mut() {
                let Some(record) = item.as_object_mut() else {
                    stats.rule_mut(&rule.name).skipped += 1;
                    continue;
                };
                apply_record(record, rule, document_path, root, rules, cache, &mut stats)?;
            }
        }
    }
    Ok((serde_json::to_string(&value)?, stats))
}

fn apply_record(
    record: &mut Map<String, Value>,
    rule: &JsonRule,
    document_path: &Path,
    root: &Path,
    rules: &CompiledRules,
    cache: &mut MetadataCache,
    stats: &mut RewriteStats,
) -> Result<()> {
    stats.rule_mut(&rule.name).matched += 1;
    let mut changed = false;
    if let Some(rewrite) = &rule.rewrite_url {
        if let Some(current) = record.get(&rewrite.field).and_then(Value::as_str) {
            let map = &rules.url_maps[&rewrite.map];
            let (rewritten, count) = rewrite_url(current, map)?;
            if count > 0 {
                record.insert(rewrite.field.clone(), Value::String(rewritten));
                changed = true;
            }
        }
    }

    if let Some(asset) = &rule.asset {
        let sources = asset
            .from
            .values()
            .into_iter()
            .filter_map(|field| record.get(field).and_then(Value::as_str))
            .map(str::to_string)
            .collect::<Vec<_>>();
        let maps = rules.url_maps.values().collect::<Vec<_>>();
        let Some(path) = resolve_image(&sources, document_path, root, &maps)? else {
            stats.rule_mut(&rule.name).skipped += 1;
            if changed {
                stats.rule_mut(&rule.name).modified += 1;
            }
            return Ok(());
        };
        let mut hits = 0;
        let mut misses = 0;
        let mut skipped = 0;
        let Some(metadata) = get_or_compute(&path, cache, &mut hits, &mut misses, &mut skipped)?
        else {
            stats.cache_hits += hits;
            stats.cache_misses += misses;
            stats.rule_mut(&rule.name).skipped += skipped;
            if changed {
                stats.rule_mut(&rule.name).modified += 1;
            }
            return Ok(());
        };
        stats.cache_hits += hits;
        stats.cache_misses += misses;
        stats.rule_mut(&rule.name).skipped += skipped;
        changed |= write_metadata(record, rule, &metadata);
    }
    if changed {
        stats.rule_mut(&rule.name).modified += 1;
    }
    Ok(())
}

fn write_metadata(
    record: &mut Map<String, Value>,
    rule: &JsonRule,
    metadata: &CachedImageMetadata,
) -> bool {
    let Some(fields) = &rule.metadata else {
        return false;
    };
    let mut changed = false;
    for (target, value) in [
        (
            fields.thumbhash.as_ref(),
            Value::String(metadata.thumbhash.clone()),
        ),
        (
            fields.width.as_ref(),
            Value::Number(Number::from(metadata.width)),
        ),
        (
            fields.height.as_ref(),
            Value::Number(Number::from(metadata.height)),
        ),
    ] {
        if let Some(target) = target {
            if !record.contains_key(target) {
                record.insert(target.clone(), value);
                changed = true;
            }
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::CACHE_VERSION;
    use crate::config;
    use image::{Rgba, RgbaImage};
    use tempfile::tempdir;

    #[test]
    fn rewrites_arbitrary_json_fields_and_preserves_existing_metadata() {
        let directory = tempdir().unwrap();
        RgbaImage::from_pixel(4, 5, Rgba([0, 255, 0, 255]))
            .save(directory.path().join("cover.png"))
            .unwrap();
        let raw = toml::from_str(
            r#"
version = 1
[url.cdn]
from = ["https://site.test/"]
to = "https://cdn.test/"
relative_to = "target-root"
[[json]]
name = "covers"
sources = [{ files = ["data.json"] }]
each = "object-values"
rewrite_url = { field = "cover", map = "cdn" }
asset = { type = "image", from = "cover" }
metadata = { thumbhash = "hash", width = "wide", height = "high" }
"#,
        )
        .unwrap();
        let rules = config::compile(raw).unwrap();
        let rule = &rules.raw.json[0];
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        let (output, _) = rewrite(
            r#"{"a":{"cover":"/cover.png","wide":99}}"#,
            rule,
            &directory.path().join("data.json"),
            directory.path(),
            &rules,
            &mut cache,
        )
        .unwrap();
        let value: Value = serde_json::from_str(&output).unwrap();
        assert_eq!(value["a"]["cover"], "https://cdn.test/cover.png");
        assert_eq!(value["a"]["wide"], 99);
        assert_eq!(value["a"]["high"], 5);
        assert!(value["a"]["hash"].is_string());
        assert!(!output.contains('\n'));
    }
}
