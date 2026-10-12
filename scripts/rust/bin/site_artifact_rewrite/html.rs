use super::cache::{CachedImageMetadata, MetadataCache};
use super::config::{CompiledRules, HtmlRule, JsonRule};
use super::images::{get_or_compute, resolve_image};
use super::json;
use super::stats::RewriteStats;
use super::urls::rewrite_attribute;
use anyhow::Result;
use lol_html::html_content::{ContentType, Element};
use lol_html::{ElementContentHandlers, RewriteStrSettings, Selector};
use std::borrow::Cow;
use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::str::FromStr;

struct Context<'a> {
    document_path: PathBuf,
    root: PathBuf,
    rules: &'a CompiledRules,
    cache: &'a mut MetadataCache,
    stats: RewriteStats,
}

pub(super) fn rewrite(
    source: &str,
    document_path: &Path,
    root: &Path,
    rules: &CompiledRules,
    cache: &mut MetadataCache,
    embedded: &[(&JsonRule, &str)],
) -> Result<(String, RewriteStats)> {
    let context = Rc::new(RefCell::new(Context {
        document_path: document_path.to_path_buf(),
        root: root.to_path_buf(),
        rules,
        cache,
        stats: RewriteStats::default(),
    }));
    let mut settings = RewriteStrSettings::new();
    if let Some(html) = &rules.raw.html {
        for rule in &html.rules {
            let rule = rule.clone();
            let handler_context = Rc::clone(&context);
            settings = settings.append_element_content_handler((
                Cow::Owned(Selector::from_str(&rule.select).expect("validated selector")),
                ElementContentHandlers::default().element(move |element: &mut Element<'_, '_>| {
                    apply_element(element, &rule, &handler_context)
                }),
            ));
        }
    }

    for (rule, selector) in embedded {
        let rule = (*rule).clone();
        let buffer = Rc::new(RefCell::new(String::new()));
        let handler_buffer = Rc::clone(&buffer);
        let handler_context = Rc::clone(&context);
        settings = settings.append_element_content_handler((
            Cow::Owned(Selector::from_str(selector).expect("validated selector")),
            ElementContentHandlers::default().text(
                move |chunk: &mut lol_html::html_content::TextChunk<'_>| {
                    handler_buffer.borrow_mut().push_str(chunk.as_str());
                    chunk.set_str(String::new());
                    if chunk.last_in_text_node() {
                        let source = std::mem::take(&mut *handler_buffer.borrow_mut());
                        let mut context = handler_context.borrow_mut();
                        let path = context.document_path.clone();
                        let root = context.root.clone();
                        let rules = context.rules;
                        let (rewritten, stats) =
                            json::rewrite(&source, &rule, &path, &root, rules, context.cache)?;
                        context.stats.merge(stats);
                        chunk.set_str(rewritten);
                    }
                    Ok(())
                },
            ),
        ));
    }

    let output = lol_html::rewrite_str(source, settings).map_err(|error| {
        anyhow::anyhow!("failed to rewrite {}: {error}", document_path.display())
    })?;
    let stats = std::mem::take(&mut context.borrow_mut().stats);
    Ok((output, stats))
}

fn apply_element(
    element: &mut Element<'_, '_>,
    rule: &HtmlRule,
    context: &Rc<RefCell<Context<'_>>>,
) -> lol_html::HandlerResult {
    context.borrow_mut().stats.rule_mut(&rule.name).matched += 1;
    let mut changed = false;

    if let Some(rewrite) = &rule.rewrite_urls {
        let context_ref = context.borrow();
        let map = &context_ref.rules.url_maps[&rewrite.map];
        for attribute in &rewrite.attributes {
            if let Some(value) = element.get_attribute(attribute) {
                let (rewritten, count) = rewrite_attribute(attribute, &value, map)?;
                if count > 0 {
                    element.set_attribute(attribute, &rewritten)?;
                    changed = true;
                }
            }
        }
    }

    if let Some(asset) = &rule.asset {
        let sources = asset
            .from
            .values()
            .into_iter()
            .filter_map(|attribute| element.get_attribute(attribute))
            .collect::<Vec<_>>();
        let mut context_ref = context.borrow_mut();
        let maps = context_ref.rules.url_maps.values().collect::<Vec<_>>();
        let Some(path) = resolve_image(
            &sources,
            &context_ref.document_path,
            &context_ref.root,
            &maps,
        )?
        else {
            context_ref.stats.rule_mut(&rule.name).skipped += 1;
            if changed {
                context_ref.stats.rule_mut(&rule.name).modified += 1;
            }
            return Ok(());
        };
        let mut hits = 0;
        let mut misses = 0;
        let mut skipped = 0;
        let metadata = get_or_compute(
            &path,
            context_ref.cache,
            &mut hits,
            &mut misses,
            &mut skipped,
        )?;
        context_ref.stats.cache_hits += hits;
        context_ref.stats.cache_misses += misses;
        context_ref.stats.rule_mut(&rule.name).skipped += skipped;
        let Some(metadata) = metadata else {
            if changed {
                context_ref.stats.rule_mut(&rule.name).modified += 1;
            }
            return Ok(());
        };
        drop(context_ref);
        changed |= write_metadata(element, rule, &metadata)?;
        for (name, value) in &rule.set {
            if element.get_attribute(name).as_deref() != Some(value) {
                element.set_attribute(name, value)?;
                changed = true;
            }
        }
        if let Some(target) = &rule.replace_tag {
            if !element.tag_name().eq_ignore_ascii_case(target) {
                replace_tag(element, target, &rule.name)?;
                changed = true;
            }
        }
    }
    if changed {
        context.borrow_mut().stats.rule_mut(&rule.name).modified += 1;
    }
    Ok(())
}

fn write_metadata(
    element: &mut Element<'_, '_>,
    rule: &HtmlRule,
    metadata: &CachedImageMetadata,
) -> Result<bool, lol_html::errors::AttributeNameError> {
    let Some(fields) = &rule.metadata else {
        return Ok(false);
    };
    let mut changed = false;
    for (target, value) in [
        (fields.thumbhash.as_ref(), metadata.thumbhash.clone()),
        (fields.width.as_ref(), metadata.width.to_string()),
        (fields.height.as_ref(), metadata.height.to_string()),
    ] {
        if let Some(target) = target {
            if !element.has_attribute(target) {
                element.set_attribute(target, &value)?;
                changed = true;
            }
        }
    }
    Ok(changed)
}

fn replace_tag(element: &mut Element<'_, '_>, target: &str, rule: &str) -> lol_html::HandlerResult {
    if is_void_element(&element.tag_name()) {
        let mut output = format!("<{target}");
        for attribute in element.attributes() {
            output.push(' ');
            output.push_str(&attribute.name());
            output.push_str("=\"");
            output.push_str(&escape_attribute(&attribute.value()));
            output.push('"');
        }
        output.push_str(&format!("></{target}>"));
        element.replace(&output, ContentType::Html);
        Ok(())
    } else {
        element.set_tag_name(target).map_err(|error| {
            anyhow::anyhow!(
                "HTML rule {rule:?} cannot rename <{}> to <{target}>: {error}",
                element.tag_name()
            )
            .into()
        })
    }
}

fn is_void_element(name: &str) -> bool {
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

fn escape_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::CACHE_VERSION;
    use crate::config;
    use image::{Rgba, RgbaImage};
    use tempfile::tempdir;

    fn rules(rule: &str) -> CompiledRules {
        let source = format!(
            r#"
version = 1
[url.cdn]
from = ["https://site.test/"]
to = "https://cdn.test/"
[html]
files = ["**/*.html"]
{rule}
"#
        );
        config::compile(toml::from_str(&source).unwrap()).unwrap()
    }

    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let directory = tempdir().unwrap();
        let image = directory.path().join("pixel.png");
        RgbaImage::from_pixel(2, 3, Rgba([255, 0, 0, 255]))
            .save(&image)
            .unwrap();
        (directory, image)
    }

    #[test]
    fn renames_arbitrary_normal_and_void_elements() {
        let (directory, _) = fixture();
        let rules = rules(
            r#"
[[html.rules]]
name = "normal"
select = "source-widget"
asset = { from = "src" }
replace_tag = "target-widget"

[[html.rules]]
name = "void"
select = "img"
asset = { from = "src" }
replace_tag = "picture-widget"
"#,
        );
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        let document = directory.path().join("index.html");
        let source = r#"<source-widget src="/pixel.png"><b>kept</b></source-widget><img src="/pixel.png" alt="x">"#;
        let (output, _) =
            rewrite(source, &document, directory.path(), &rules, &mut cache, &[]).unwrap();
        assert!(output.contains(r#"<target-widget src="/pixel.png"><b>kept</b></target-widget>"#));
        assert!(output.contains(r#"<picture-widget src="/pixel.png" alt="x"></picture-widget>"#));
    }

    #[test]
    fn asset_failure_keeps_independent_url_rewrite_only() {
        let directory = tempdir().unwrap();
        let rules = rules(
            r#"
[[html.rules]]
name = "missing"
select = "img"
rewrite_urls = { map = "cdn", attributes = ["src"] }
asset = { from = "src" }
set = { zoomable = "true" }
replace_tag = "target-widget"
"#,
        );
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        let (output, stats) = rewrite(
            r#"<img src="/missing.png">"#,
            &directory.path().join("index.html"),
            directory.path(),
            &rules,
            &mut cache,
            &[],
        )
        .unwrap();
        assert_eq!(output, r#"<img src="https://cdn.test/missing.png">"#);
        assert_eq!(stats.rules["missing"].skipped, 1);
    }

    #[test]
    fn metadata_fills_missing_values_and_set_overwrites() {
        let (directory, _) = fixture();
        let rules = rules(
            r#"
[[html.rules]]
name = "metadata"
select = "lazy-image"
asset = { from = "src" }
metadata = { thumbhash = "hash", width = "w", height = "h" }
set = { zoomable = "true" }
"#,
        );
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        let (output, _) = rewrite(
            r#"<lazy-image src="/pixel.png" w="99" zoomable="false"></lazy-image>"#,
            &directory.path().join("index.html"),
            directory.path(),
            &rules,
            &mut cache,
            &[],
        )
        .unwrap();
        assert!(output.contains(r#"w="99""#));
        assert!(output.contains(r#"h="3""#));
        assert!(output.contains(r#"zoomable="true""#));
        assert!(output.contains("hash="));
    }

    #[test]
    fn embedded_json_uses_the_shared_json_executor() {
        let (directory, _) = fixture();
        let source = r#"
version = 1
[url.cdn]
from = ["https://site.test/"]
to = "https://cdn.test/"
[html]
files = ["**/*.html"]
[[html.rules]]
name = "images"
select = "img"
rewrite_urls = { map = "cdn", attributes = ["src"] }
[[json]]
name = "embedded"
sources = [{ files = ["**/*.html"], select = "script[data-json]" }]
rewrite_url = { field = "cover", map = "cdn" }
asset = { from = "cover" }
metadata = { width = "wide" }
"#;
        let rules = config::compile(toml::from_str(source).unwrap()).unwrap();
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        let json_rule = &rules.raw.json[0];
        let (output, _) = rewrite(
            r#"<script data-json>{"a":{"cover":"/pixel.png"}}</script>"#,
            &directory.path().join("index.html"),
            directory.path(),
            &rules,
            &mut cache,
            &[(json_rule, "script[data-json]")],
        )
        .unwrap();
        assert!(output.contains(r#""cover":"https://cdn.test/pixel.png""#));
        assert!(output.contains(r#""wide":2"#));
    }

    #[test]
    fn later_asset_rule_uses_url_rewritten_by_an_earlier_rule() {
        let (directory, _) = fixture();
        let rules = rules(
            r#"
[[html.rules]]
name = "url"
select = "img"
rewrite_urls = { map = "cdn", attributes = ["src"] }
[[html.rules]]
name = "asset"
select = "img"
asset = { from = "src" }
metadata = { width = "wide" }
replace_tag = "image-widget"
"#,
        );
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        let (output, _) = rewrite(
            r#"<img src="/pixel.png">"#,
            &directory.path().join("index.html"),
            directory.path(),
            &rules,
            &mut cache,
            &[],
        )
        .unwrap();
        assert!(output.contains(r#"<image-widget src="https://cdn.test/pixel.png" wide="2">"#));
    }
}
