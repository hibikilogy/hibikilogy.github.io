use super::config::CompiledUrlMap;
use anyhow::{bail, Result};
use std::path::{Component, Path, PathBuf};
use url::Url;

pub(super) fn rewrite_attribute(
    name: &str,
    value: &str,
    map: &CompiledUrlMap,
) -> Result<(String, usize)> {
    if name.ends_with("srcset") {
        rewrite_srcset(value, map)
    } else {
        rewrite_url(value, map)
    }
}

pub(super) fn rewrite_url(value: &str, map: &CompiledUrlMap) -> Result<(String, usize)> {
    let trimmed = value.trim();
    if trimmed.is_empty() || is_excluded(trimmed, map) {
        return Ok((value.to_string(), 0));
    }
    let leading = &value[..value.len() - value.trim_start().len()];
    let trailing = &value[value.trim_end().len()..];
    let rewritten = if let Ok(parsed) = Url::parse(trimmed) {
        let Some(source) = map.from.iter().find(|source| same_origin(source, &parsed)) else {
            return Ok((value.to_string(), 0));
        };
        let source_path = source.path().trim_end_matches('/');
        if !has_path_prefix(parsed.path(), source_path) {
            return Ok((value.to_string(), 0));
        }
        map_url(&parsed, source_path, &map.to)?
    } else if is_relative_reference(trimmed) {
        map_relative(trimmed, &map.to)?
    } else {
        return Ok((value.to_string(), 0));
    };
    if rewritten == trimmed {
        Ok((value.to_string(), 0))
    } else {
        Ok((format!("{leading}{rewritten}{trailing}"), 1))
    }
}

fn rewrite_srcset(value: &str, map: &CompiledUrlMap) -> Result<(String, usize)> {
    let mut count = 0;
    let mut output = Vec::new();
    for candidate in value.split(',') {
        let trimmed = candidate.trim();
        let split = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
        let (url, descriptor) = trimmed.split_at(split);
        let (rewritten, changed) = rewrite_url(url, map)?;
        count += changed;
        let leading = &candidate[..candidate.len() - candidate.trim_start().len()];
        let trailing = &candidate[candidate.trim_end().len()..];
        output.push(format!("{leading}{rewritten}{descriptor}{trailing}"));
    }
    Ok(if count == 0 {
        (value.to_string(), 0)
    } else {
        (output.join(","), count)
    })
}

fn same_origin(left: &Url, right: &Url) -> bool {
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn map_url(parsed: &Url, source_path: &str, target: &Url) -> Result<String> {
    let suffix = parsed
        .path()
        .strip_prefix(source_path)
        .unwrap_or(parsed.path());
    let mut mapped = target.join(suffix.trim_start_matches('/'))?;
    mapped.set_query(parsed.query());
    mapped.set_fragment(parsed.fragment());
    Ok(mapped.into())
}

fn map_relative(value: &str, target: &Url) -> Result<String> {
    let mut clean = value.trim_start_matches('/');
    while let Some(value) = clean.strip_prefix("./") {
        clean = value;
    }
    while let Some(value) = clean.strip_prefix("../") {
        clean = value;
    }
    Ok(target.join(clean)?.into())
}

fn has_path_prefix(path: &str, prefix: &str) -> bool {
    prefix.is_empty()
        || path == prefix
        || path
            .strip_prefix(prefix)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

fn is_relative_reference(value: &str) -> bool {
    !value.starts_with("//")
        && !value.starts_with('#')
        && !value.starts_with('?')
        && Url::parse(value).is_err()
}

fn is_excluded(value: &str, map: &CompiledUrlMap) -> bool {
    let path = value.split(['?', '#']).next().unwrap_or(value);
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            map.excluded_extensions
                .contains(&extension.to_ascii_lowercase())
        })
}

pub(super) fn resolve_local_path(
    value: &str,
    document_path: &Path,
    root: &Path,
    maps: &[&CompiledUrlMap],
) -> Result<Option<PathBuf>> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.starts_with("//") {
        return Ok(None);
    }
    let path = if let Ok(parsed) = Url::parse(trimmed) {
        let Some(map) = maps.iter().find(|map| {
            same_origin(&map.to, &parsed)
                || map.from.iter().any(|source| same_origin(source, &parsed))
        }) else {
            return Ok(None);
        };
        if is_excluded(trimmed, map) {
            return Ok(None);
        }
        let base = if same_origin(&map.to, &parsed) {
            map.to.path()
        } else {
            map.from
                .iter()
                .find(|source| same_origin(source, &parsed))
                .map_or("/", Url::path)
        }
        .trim_end_matches('/');
        if !has_path_prefix(parsed.path(), base) {
            return Ok(None);
        }
        parsed
            .path()
            .strip_prefix(base)
            .unwrap_or(parsed.path())
            .trim_start_matches('/')
            .to_string()
    } else if is_relative_reference(trimmed) {
        trimmed
            .split(['?', '#'])
            .next()
            .unwrap_or(trimmed)
            .to_string()
    } else {
        return Ok(None);
    };
    let decoded = hibikilogy_tools::url_encoding::decode_path(&path)
        .ok_or_else(|| anyhow::anyhow!("invalid percent encoding in asset URL {value:?}"))?;
    let candidate = if trimmed.starts_with('/') || Url::parse(trimmed).is_ok() {
        root.join(decoded.trim_start_matches('/'))
    } else {
        document_path.parent().unwrap_or(root).join(decoded)
    };
    reject_lexical_escape(&candidate, root, value)?;
    if !candidate.is_file() {
        return Ok(None);
    }
    let canonical = candidate.canonicalize()?;
    let canonical_root = root.canonicalize()?;
    if !canonical.starts_with(&canonical_root) {
        bail!("asset URL {value:?} escapes target root {}", root.display());
    }
    Ok(Some(canonical))
}

fn reject_lexical_escape(path: &Path, root: &Path, value: &str) -> Result<()> {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let mut depth = 0usize;
    for component in relative.components() {
        match component {
            Component::Normal(_) => depth += 1,
            Component::ParentDir if depth == 0 => {
                bail!("asset URL {value:?} escapes target root {}", root.display())
            }
            Component::ParentDir => depth -= 1,
            Component::CurDir => {}
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn map() -> CompiledUrlMap {
        CompiledUrlMap {
            from: vec![Url::parse("https://example.test/").unwrap()],
            to: Url::parse("https://cdn.test/base/").unwrap(),
            excluded_extensions: ["svg".to_string()].into_iter().collect::<HashSet<_>>(),
        }
    }

    #[test]
    fn uses_strict_origin_and_preserves_suffixes() {
        let map = map();
        assert_eq!(
            rewrite_url("https://example.test/a.png?q=1#x", &map)
                .unwrap()
                .0,
            "https://cdn.test/base/a.png?q=1#x"
        );
        assert_eq!(
            rewrite_url("https://example.test.evil/a.png", &map)
                .unwrap()
                .1,
            0
        );
        assert_eq!(rewrite_url("/a.svg?q=1", &map).unwrap().1, 0);
    }

    #[test]
    fn rewrites_srcset_candidates() {
        let (value, count) = rewrite_attribute("srcset", "/a.png 1x, ../b.png 2x", &map()).unwrap();
        assert_eq!(count, 2);
        assert!(value.contains("https://cdn.test/base/a.png 1x"));
    }

    #[test]
    fn target_root_relative_urls_keep_query_and_do_not_escape_target_base() {
        let map = map();
        assert_eq!(
            rewrite_url("../image.png?q=1#hero", &map).unwrap().0,
            "https://cdn.test/base/image.png?q=1#hero"
        );
        assert_eq!(
            rewrite_url("https://example.test.evil/image.png", &map)
                .unwrap()
                .1,
            0
        );
    }

    #[test]
    fn rejects_asset_paths_that_escape_the_target_root() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("nested/index.html");
        assert!(resolve_local_path("../../outside.png", &document, directory.path(), &[]).is_err());
    }
}
