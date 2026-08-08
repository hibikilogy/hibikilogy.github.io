use anyhow::{bail, Context, Result};
use globset::{Glob, GlobSet, GlobSetBuilder};
use lol_html::Selector;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;
use std::str::FromStr;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RulesConfig {
    pub version: u32,
    #[serde(default)]
    pub url: BTreeMap<String, UrlMapConfig>,
    pub html: Option<HtmlConfig>,
    #[serde(default)]
    pub json: Vec<JsonRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UrlMapConfig {
    pub from: Vec<String>,
    pub to: String,
    pub relative_to: RelativeTo,
    #[serde(default)]
    pub exclude_extensions: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum RelativeTo {
    TargetRoot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct HtmlConfig {
    pub files: Vec<String>,
    pub rules: Vec<HtmlRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct HtmlRule {
    pub name: String,
    pub select: String,
    pub rewrite_urls: Option<HtmlUrlRewrite>,
    pub asset: Option<AssetSpec>,
    pub metadata: Option<MetadataFields>,
    #[serde(default)]
    pub set: BTreeMap<String, String>,
    pub replace_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct HtmlUrlRewrite {
    pub map: String,
    pub attributes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct AssetSpec {
    #[serde(rename = "type")]
    pub kind: AssetType,
    pub from: OneOrMany,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum AssetType {
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(super) enum OneOrMany {
    One(String),
    Many(Vec<String>),
}

impl OneOrMany {
    pub(super) fn values(&self) -> Vec<&str> {
        match self {
            Self::One(value) => vec![value],
            Self::Many(values) => values.iter().map(String::as_str).collect(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct MetadataFields {
    pub thumbhash: Option<String>,
    pub width: Option<String>,
    pub height: Option<String>,
}

impl MetadataFields {
    pub(super) fn is_empty(&self) -> bool {
        self.thumbhash.is_none() && self.width.is_none() && self.height.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct JsonRule {
    pub name: String,
    pub sources: Vec<JsonSource>,
    pub each: JsonEach,
    pub rewrite_url: Option<JsonUrlRewrite>,
    pub asset: Option<AssetSpec>,
    pub metadata: Option<MetadataFields>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct JsonSource {
    pub files: Vec<String>,
    pub select: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum JsonEach {
    ObjectValues,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct JsonUrlRewrite {
    pub field: String,
    pub map: String,
}

pub(super) struct CompiledRules {
    pub raw: RulesConfig,
    pub html_files: Option<FileMatcher>,
    pub url_maps: BTreeMap<String, CompiledUrlMap>,
    pub fingerprint: String,
}

pub(super) struct CompiledUrlMap {
    pub from: Vec<Url>,
    pub to: Url,
    pub excluded_extensions: HashSet<String>,
}

pub(super) struct FileMatcher {
    includes: GlobSet,
    excludes: GlobSet,
}

impl FileMatcher {
    pub(super) fn compile(patterns: &[String], label: &str) -> Result<Self> {
        if patterns.is_empty() {
            bail!("{label} must contain at least one file glob");
        }
        let mut includes = GlobSetBuilder::new();
        let mut excludes = GlobSetBuilder::new();
        let mut include_count = 0;
        for pattern in patterns {
            let (excluded, pattern) = pattern
                .strip_prefix('!')
                .map_or((false, pattern.as_str()), |value| (true, value));
            if pattern.trim().is_empty() {
                bail!("{label} contains an empty glob");
            }
            let glob = Glob::new(pattern)
                .with_context(|| format!("invalid glob {pattern:?} in {label}"))?;
            if excluded {
                excludes.add(glob);
            } else {
                includes.add(glob);
                include_count += 1;
            }
        }
        if include_count == 0 {
            bail!("{label} must contain an include glob");
        }
        Ok(Self {
            includes: includes.build()?,
            excludes: excludes.build()?,
        })
    }

    pub(super) fn is_match(&self, path: &str) -> bool {
        self.includes.is_match(path) && !self.excludes.is_match(path)
    }
}

pub(super) fn load(path: &Path) -> Result<CompiledRules> {
    let source = fs::read_to_string(path)
        .with_context(|| format!("failed to read rewrite rules {}", path.display()))?;
    let raw: RulesConfig = toml::from_str(&source)
        .with_context(|| format!("failed to parse rewrite rules {}", path.display()))?;
    compile(raw)
}

pub(super) fn compile(raw: RulesConfig) -> Result<CompiledRules> {
    if raw.version != 1 {
        bail!(
            "unsupported artifact rewrite config version {}",
            raw.version
        );
    }

    let mut url_maps = BTreeMap::new();
    for (name, map) in &raw.url {
        if map.from.is_empty() {
            bail!("URL map {name:?} must contain at least one source URL");
        }
        let from = map
            .from
            .iter()
            .map(|value| parse_base_url(value, &format!("URL map {name:?} source")))
            .collect::<Result<Vec<_>>>()?;
        let to = parse_base_url(&map.to, &format!("URL map {name:?} target"))?;
        let excluded_extensions = map
            .exclude_extensions
            .iter()
            .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
            .collect();
        url_maps.insert(
            name.clone(),
            CompiledUrlMap {
                from,
                to,
                excluded_extensions,
            },
        );
    }

    let html_files = raw
        .html
        .as_ref()
        .map(|html| FileMatcher::compile(&html.files, "html.files"))
        .transpose()?;
    let mut names = HashSet::new();
    if let Some(html) = &raw.html {
        if html.rules.is_empty() {
            bail!("html.rules must not be empty");
        }
        for rule in &html.rules {
            validate_name(&mut names, &rule.name)?;
            validate_selector(&rule.select, &format!("HTML rule {:?}", rule.name))?;
            if let Some(rewrite) = &rule.rewrite_urls {
                require_map(&url_maps, &rewrite.map, &rule.name)?;
                validate_nonempty_strings(
                    &rewrite.attributes,
                    "rewrite_urls.attributes",
                    &rule.name,
                )?;
            }
            validate_asset(rule.asset.as_ref(), &rule.name)?;
            validate_metadata(rule.metadata.as_ref(), &rule.name)?;
            if rule.rewrite_urls.is_none()
                && rule.metadata.is_none()
                && rule.set.is_empty()
                && rule.replace_tag.is_none()
            {
                bail!("HTML rule {:?} has no effects", rule.name);
            }
            if (rule.metadata.is_some() || !rule.set.is_empty() || rule.replace_tag.is_some())
                && rule.asset.is_none()
            {
                bail!(
                    "HTML rule {:?} requires asset when using metadata, set, or replace_tag",
                    rule.name
                );
            }
            if rule.replace_tag.as_deref().is_some_and(str::is_empty) {
                bail!("HTML rule {:?} has an empty replace_tag", rule.name);
            }
        }
    }

    for rule in &raw.json {
        validate_name(&mut names, &rule.name)?;
        if rule.sources.is_empty() {
            bail!("JSON rule {:?} must contain at least one source", rule.name);
        }
        for (index, source) in rule.sources.iter().enumerate() {
            FileMatcher::compile(
                &source.files,
                &format!("JSON rule {:?} source {index}", rule.name),
            )?;
            if let Some(selector) = &source.select {
                validate_selector(
                    selector,
                    &format!("JSON rule {:?} source {index}", rule.name),
                )?;
            }
        }
        if let Some(rewrite) = &rule.rewrite_url {
            if rewrite.field.is_empty() {
                bail!("JSON rule {:?} has an empty rewrite_url.field", rule.name);
            }
            require_map(&url_maps, &rewrite.map, &rule.name)?;
        }
        validate_asset(rule.asset.as_ref(), &rule.name)?;
        validate_metadata(rule.metadata.as_ref(), &rule.name)?;
        if rule.rewrite_url.is_none() && rule.metadata.is_none() {
            bail!("JSON rule {:?} has no effects", rule.name);
        }
        if rule.metadata.is_some() && rule.asset.is_none() {
            bail!("JSON rule {:?} requires asset for metadata", rule.name);
        }
    }

    let normalized = serde_json::to_vec(&raw).context("failed to normalize rewrite rules")?;
    let fingerprint = format!("{:x}", Sha256::digest(normalized));
    Ok(CompiledRules {
        raw,
        html_files,
        url_maps,
        fingerprint,
    })
}

fn parse_base_url(value: &str, label: &str) -> Result<Url> {
    let url = Url::parse(value).with_context(|| format!("{label} is not a valid URL"))?;
    if url.cannot_be_a_base() || url.host_str().is_none() {
        bail!("{label} must be an absolute hierarchical URL");
    }
    Ok(url)
}

fn validate_name(names: &mut HashSet<String>, name: &str) -> Result<()> {
    if name.trim().is_empty() {
        bail!("rule names must not be empty");
    }
    if !names.insert(name.to_string()) {
        bail!("duplicate rule name {name:?}");
    }
    Ok(())
}

fn validate_selector(selector: &str, label: &str) -> Result<()> {
    if selector.trim().is_empty() {
        bail!("{label} has an empty selector");
    }
    Selector::from_str(selector)
        .map(|_| ())
        .map_err(|error| anyhow::anyhow!("{label} has invalid selector {selector:?}: {error}"))
}

fn require_map(maps: &BTreeMap<String, CompiledUrlMap>, map: &str, rule: &str) -> Result<()> {
    if !maps.contains_key(map) {
        bail!("rule {rule:?} references missing URL map {map:?}");
    }
    Ok(())
}

fn validate_asset(asset: Option<&AssetSpec>, rule: &str) -> Result<()> {
    if let Some(asset) = asset {
        match asset.kind {
            AssetType::Image => {}
        }
        validate_nonempty_strings(&asset.from.values(), "asset.from", rule)?;
    }
    Ok(())
}

fn validate_metadata(metadata: Option<&MetadataFields>, rule: &str) -> Result<()> {
    if let Some(metadata) = metadata {
        if metadata.is_empty() {
            bail!("rule {rule:?} has an empty metadata mapping");
        }
        for field in [
            metadata.thumbhash.as_deref(),
            metadata.width.as_deref(),
            metadata.height.as_deref(),
        ]
        .into_iter()
        .flatten()
        {
            if field.is_empty() {
                bail!("rule {rule:?} has an empty metadata target");
            }
        }
    }
    Ok(())
}

fn validate_nonempty_strings<T: AsRef<str>>(values: &[T], field: &str, rule: &str) -> Result<()> {
    if values.is_empty() || values.iter().any(|value| value.as_ref().trim().is_empty()) {
        bail!("rule {rule:?} requires non-empty {field}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(source: &str) -> Result<CompiledRules> {
        let raw = toml::from_str(source)?;
        compile(raw)
    }

    #[test]
    fn rejects_unknown_fields_and_missing_maps() {
        assert!(parse("version = 1\nunknown = true").is_err());
        assert!(parse(
            r#"
version = 1
[html]
files = ["**/*.html"]
[[html.rules]]
name = "x"
select = "img"
rewrite_urls = { map = "missing", attributes = ["src"] }
"#
        )
        .is_err());
    }

    #[test]
    fn rejects_invalid_globs_selectors_and_empty_rules() {
        assert!(parse(
            r#"
version = 1
[html]
files = ["["]
rules = []
"#
        )
        .is_err());
        assert!(parse(
            r#"
version = 1
[html]
files = ["**/*.html"]
[[html.rules]]
name = "x"
select = ""
"#
        )
        .is_err());
    }

    #[test]
    fn rejects_invalid_urls_duplicate_names_and_empty_effects() {
        assert!(parse(
            r#"
version = 1
[url.bad]
from = ["not a URL"]
to = "https://cdn.test/"
relative_to = "target-root"
"#
        )
        .is_err());
        assert!(parse(
            r#"
version = 1
[html]
files = ["**/*.html"]
[[html.rules]]
name = "same"
select = "img"
set = { x = "y" }
asset = { type = "image", from = "src" }
[[html.rules]]
name = "same"
select = "img"
rewrite_urls = { map = "missing", attributes = ["src"] }
"#
        )
        .is_err());
        assert!(parse(
            r#"
version = 1
[html]
files = ["**/*.html"]
[[html.rules]]
name = "asset-only"
select = "img"
asset = { type = "image", from = "src" }
"#
        )
        .is_err());
    }

    #[test]
    fn compiles_a_full_config_with_every_rule_kind() {
        let compiled = parse(
            r#"
version = 1

[url.image_cdn]
from = [ "https://hibikilogy.vercel.app/" ]
to = "https://cdn.example.test/"
relative_to = "target-root"
exclude_extensions = [ "svg", "gif" ]

[html]
files = [ "**/*.html", "!search-articles/index.html" ]

[[html.rules]]
name = "image-urls"
select = "img, lazy-image"
rewrite_urls = { map = "image_cdn", attributes = [ "src", "srcset" ] }

[[html.rules]]
name = "article-images"
select = ".content-container img"
asset = { type = "image", from = [ "src", "srcset" ] }
set = { zoomable = "true" }
metadata = { thumbhash = "thumbhash", width = "width", height = "height" }
replace_tag = "lazy-image"

[[json]]
name = "search-cover"
sources = [
  { files = [ "**/*.html" ], select = 'script[type="application/json"]' },
  { files = [ "search-articles/index.html" ] },
]
each = "object-values"
rewrite_url = { field = "cs", map = "image_cdn" }
asset = { type = "image", from = "cs" }
metadata = { thumbhash = "ct", width = "cw", height = "ch" }
"#,
        )
        .unwrap();

        let image_cdn = &compiled.url_maps["image_cdn"];
        assert_eq!(image_cdn.to.as_str(), "https://cdn.example.test/");
        assert_eq!(image_cdn.from.len(), 1);
        assert_eq!(image_cdn.excluded_extensions.len(), 2);

        let matcher = compiled.html_files.as_ref().unwrap();
        assert!(matcher.is_match("articles/2026/01/page.html"));
        assert!(!matcher.is_match("search-articles/index.html"));

        assert_eq!(compiled.raw.html.as_ref().unwrap().rules.len(), 2);
        assert_eq!(compiled.raw.json.len(), 1);
        assert!(!compiled.fingerprint.is_empty());
    }
}
