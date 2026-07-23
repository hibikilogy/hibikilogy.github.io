use super::*;
use lol_html::html_content::{ContentType, Element};
use lol_html::{element, rewrite_str, text, RewriteStrSettings};
use std::cell::RefCell;
use std::rc::Rc;

struct RewriteContext<'a> {
    html_path: PathBuf,
    site_root: PathBuf,
    old_host: String,
    new_host: String,
    cache: &'a mut MetadataCache,
    stats: RewriteStats,
}

pub(super) fn rewrite_html(
    html: &str,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
    cache: &mut MetadataCache,
) -> Result<(String, RewriteStats)> {
    if is_search_article_json_page(html_path, html) {
        return rewrite_search_article_json(html, html_path, site_root, old_host, new_host, cache);
    }

    let context = Rc::new(RefCell::new(RewriteContext {
        html_path: html_path.to_path_buf(),
        site_root: site_root.to_path_buf(),
        old_host: old_host.to_string(),
        new_host: new_host.to_string(),
        cache,
        stats: RewriteStats::default(),
    }));
    let script_buffer = Rc::new(RefCell::new(String::new()));

    let img_context = Rc::clone(&context);
    let content_img_context = Rc::clone(&context);
    let lazy_context = Rc::clone(&context);
    let script_context = Rc::clone(&context);
    let script_text = Rc::clone(&script_buffer);

    let rewritten = rewrite_str(
        html,
        RewriteStrSettings::new()
            .append_element_content_handler(element!("img", move |element| {
                rewrite_element_urls(element, &img_context)
            }))
            .append_element_content_handler(element!(".content-container img", move |element| {
                inject_element_metadata(element, true, &content_img_context)
            }))
            .append_element_content_handler(element!("lazy-image", move |element| {
                rewrite_element_urls(element, &lazy_context)?;
                inject_element_metadata(element, false, &lazy_context)
            }))
            .append_element_content_handler(text!(
                "script#hibikilogy-search-articles-data[type=\"application/json\"]",
                move |chunk| {
                    script_text.borrow_mut().push_str(chunk.as_str());
                    chunk.set_str(String::new());
                    if chunk.last_in_text_node() {
                        let json = std::mem::take(&mut *script_text.borrow_mut());
                        let mut context = script_context.borrow_mut();
                        let html_path = context.html_path.clone();
                        let site_root = context.site_root.clone();
                        let old_host = context.old_host.clone();
                        let new_host = context.new_host.clone();
                        let (rewritten, stats) = rewrite_search_article_json(
                            &json,
                            &html_path,
                            &site_root,
                            &old_host,
                            &new_host,
                            context.cache,
                        )?;
                        merge_stats(&mut context.stats, stats);
                        chunk.set_str(rewritten);
                    }
                    Ok(())
                }
            )),
    )
    .map_err(|error| anyhow::anyhow!("failed to rewrite generated HTML: {error}"))?;

    let stats = context.borrow().stats;
    Ok((rewritten, stats))
}

fn rewrite_element_urls(
    element: &mut Element<'_, '_>,
    context: &Rc<RefCell<RewriteContext<'_>>>,
) -> lol_html::HandlerResult {
    let mut stats = RewriteStats::default();
    let borrowed = context.borrow();

    for name in ["data-srcset", "srcset", "src"] {
        let Some(value) = element.get_attribute(name) else {
            continue;
        };
        let (rewritten, count) =
            rewrite_attribute_value(name, &value, &borrowed.old_host, &borrowed.new_host);
        if count > 0 {
            element.set_attribute(name, &rewritten)?;
            stats.urls_rewritten += count;
        }
    }

    drop(borrowed);
    merge_stats(&mut context.borrow_mut().stats, stats);
    Ok(())
}

fn inject_element_metadata(
    element: &mut Element<'_, '_>,
    convert_img: bool,
    context: &Rc<RefCell<RewriteContext<'_>>>,
) -> lol_html::HandlerResult {
    let needs_thumbhash = !element.has_attribute("thumbhash");
    let needs_width = !element.has_attribute("width");
    let needs_height = !element.has_attribute("height");
    if !(needs_thumbhash || needs_width || needs_height) {
        return Ok(());
    }

    let src = element.get_attribute("src");
    let srcset = element
        .get_attribute("srcset")
        .or_else(|| element.get_attribute("data-srcset"));
    let mut context = context.borrow_mut();
    let html_path = context.html_path.clone();
    let site_root = context.site_root.clone();
    let old_host = context.old_host.clone();
    let new_host = context.new_host.clone();
    let Some(path) = resolve_local_image_path(
        src.as_deref(),
        srcset.as_deref(),
        &html_path,
        &site_root,
        &old_host,
        &new_host,
    )?
    else {
        return Ok(());
    };

    let mut stats = RewriteStats::default();
    let Some(metadata) = get_or_compute_image_metadata(&path, context.cache, &mut stats)? else {
        merge_stats(&mut context.stats, stats);
        return Ok(());
    };

    if convert_img {
        let replacement = render_lazy_image(
            element,
            &metadata,
            needs_thumbhash,
            needs_width,
            needs_height,
        );
        element.replace(&replacement, ContentType::Html);
    } else {
        if needs_thumbhash {
            element.set_attribute("thumbhash", &metadata.thumbhash)?;
        }
        if needs_width {
            element.set_attribute("width", &metadata.width.to_string())?;
        }
        if needs_height {
            element.set_attribute("height", &metadata.height.to_string())?;
        }
    }
    if needs_thumbhash {
        stats.metadata_injected += 1;
    }
    if needs_width {
        stats.metadata_injected += 1;
    }
    if needs_height {
        stats.metadata_injected += 1;
    }

    merge_stats(&mut context.stats, stats);
    Ok(())
}

fn render_lazy_image(
    element: &Element<'_, '_>,
    metadata: &CachedImageMetadata,
    needs_thumbhash: bool,
    needs_width: bool,
    needs_height: bool,
) -> String {
    let mut attributes = element
        .attributes()
        .iter()
        .map(|attribute| (attribute.name(), attribute.value()))
        .collect::<Vec<_>>();
    for name in ["data-srcset", "srcset", "src"] {
        if let Some(value) = element.get_attribute(name) {
            upsert_attribute(&mut attributes, name, value);
        }
    }
    upsert_attribute(&mut attributes, "zoomable", "true".to_string());
    if needs_thumbhash {
        upsert_attribute(&mut attributes, "thumbhash", metadata.thumbhash.clone());
    }
    if needs_width {
        upsert_attribute(&mut attributes, "width", metadata.width.to_string());
    }
    if needs_height {
        upsert_attribute(&mut attributes, "height", metadata.height.to_string());
    }

    let mut output = String::from("<lazy-image");
    for (name, value) in attributes {
        output.push(' ');
        output.push_str(&name);
        output.push_str("=\"");
        output.push_str(&value.replace('"', "&quot;"));
        output.push('"');
    }
    output.push_str("></lazy-image>");
    output
}

fn upsert_attribute(attributes: &mut Vec<(String, String)>, name: &str, value: String) {
    if let Some(attribute) = attributes
        .iter_mut()
        .find(|(attribute_name, _)| attribute_name.eq_ignore_ascii_case(name))
    {
        attribute.1 = value;
    } else {
        attributes.push((name.to_string(), value));
    }
}

fn merge_stats(total: &mut RewriteStats, addition: RewriteStats) {
    total.urls_rewritten += addition.urls_rewritten;
    total.metadata_injected += addition.metadata_injected;
    total.metadata_skipped += addition.metadata_skipped;
    total.cache_hits += addition.cache_hits;
    total.cache_misses += addition.cache_misses;
}

fn is_search_article_json_page(html_path: &Path, html: &str) -> bool {
    let normalized = normalize_cache_path(html_path);
    normalized.ends_with("/search-articles/index.html") && html.trim_start().starts_with('{')
}

fn rewrite_search_article_json(
    json: &str,
    html_path: &Path,
    site_root: &Path,
    old_host: &str,
    new_host: &str,
    cache: &mut MetadataCache,
) -> Result<(String, RewriteStats)> {
    let mut stats = RewriteStats::default();
    let mut value: Value = serde_json::from_str(json.trim())
        .context("failed to parse hibikilogy-search-articles-data JSON")?;
    let entries = value
        .as_object_mut()
        .context("hibikilogy-search-articles-data must be a JSON object")?;

    for record in entries.values_mut() {
        let Some(record) = record.as_object_mut() else {
            continue;
        };
        let Some(cover_src) = record.get("cs").and_then(Value::as_str).map(str::to_string) else {
            continue;
        };
        if cover_src.trim().is_empty() {
            continue;
        }

        let (rewritten_cover_src, rewrites) =
            replace_url_with_count(&cover_src, old_host, new_host);
        stats.urls_rewritten += rewrites;
        if rewritten_cover_src != cover_src {
            record.insert("cs".to_string(), Value::String(rewritten_cover_src.clone()));
        }

        let needs_thumbhash = !record.contains_key("ct");
        let needs_width = !record.contains_key("cw");
        let needs_height = !record.contains_key("ch");
        if !(needs_thumbhash || needs_width || needs_height) {
            continue;
        }

        let Some(image_path) = resolve_url_to_local_path(
            &rewritten_cover_src,
            html_path,
            site_root,
            old_host,
            new_host,
        )?
        else {
            continue;
        };
        let Some(metadata) = get_or_compute_image_metadata(&image_path, cache, &mut stats)? else {
            continue;
        };

        if needs_thumbhash {
            record.insert("ct".to_string(), Value::String(metadata.thumbhash.clone()));
            stats.metadata_injected += 1;
        }
        if needs_width {
            record.insert("cw".to_string(), Value::Number(metadata.width.into()));
            stats.metadata_injected += 1;
        }
        if needs_height {
            record.insert("ch".to_string(), Value::Number(metadata.height.into()));
            stats.metadata_injected += 1;
        }
    }

    Ok((serde_json::to_string(&value)?, stats))
}
