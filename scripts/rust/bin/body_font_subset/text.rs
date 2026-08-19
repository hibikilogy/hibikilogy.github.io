//! Text extraction rules owned by the body-font subset tool.

use anyhow::Result;

use hibikilogy_tools::front_matter;

pub fn extract_markdown_body(markdown: &str) -> Result<&str> {
    Ok(front_matter::split_toml_front_matter(markdown)?
        .map(|(_, body)| body)
        .unwrap_or(markdown))
}

/// All string values in a TOML document, except `title` values (titles are
/// covered by the title font, not the body font).
pub fn collect_non_title_front_matter_strings(value: &toml::Value) -> Vec<String> {
    collect_strings(value, true)
}

/// Every string value in a TOML document.
pub fn collect_all_toml_strings(value: &toml::Value) -> Vec<String> {
    collect_strings(value, false)
}

fn collect_strings(value: &toml::Value, skip_title_keys: bool) -> Vec<String> {
    let mut strings = Vec::new();
    collect_strings_inner(value, skip_title_keys, &mut strings);
    strings
}

fn collect_strings_inner(value: &toml::Value, skip_title_keys: bool, strings: &mut Vec<String>) {
    match value {
        toml::Value::String(text) => strings.push(text.clone()),
        toml::Value::Array(values) => {
            for value in values {
                collect_strings_inner(value, skip_title_keys, strings);
            }
        }
        toml::Value::Table(table) => {
            for (key, value) in table {
                if skip_title_keys && key == "title" {
                    continue;
                }
                collect_strings_inner(value, skip_title_keys, strings);
            }
        }
        _ => {}
    }
}
