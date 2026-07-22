use anyhow::{Context, Result};

use hibikilogy_tools::front_matter;

pub fn extract_markdown_body(markdown: &str) -> Result<&str> {
    Ok(front_matter::split_toml_front_matter(markdown)?
        .map(|(_, body)| body)
        .unwrap_or(markdown))
}

pub fn parse_toml_front_matter(markdown: &str) -> Result<Option<toml::Value>> {
    front_matter::parse_toml_front_matter(markdown)
}

pub fn parse_toml_document(document: &str) -> Result<toml::Value> {
    document
        .parse::<toml::Value>()
        .context("failed to parse TOML document")
}

pub fn collect_non_title_front_matter_strings(value: &toml::Value) -> Vec<String> {
    let mut strings = Vec::new();
    collect_non_title_strings_inner(value, &mut strings);
    strings
}

pub fn collect_all_toml_strings(value: &toml::Value) -> Vec<String> {
    let mut strings = Vec::new();
    collect_all_strings_inner(value, &mut strings);
    strings
}

fn collect_non_title_strings_inner(value: &toml::Value, strings: &mut Vec<String>) {
    match value {
        toml::Value::String(text) => strings.push(text.clone()),
        toml::Value::Array(values) => {
            for value in values {
                collect_non_title_strings_inner(value, strings);
            }
        }
        toml::Value::Table(table) => {
            for (key, value) in table {
                if key == "title" {
                    continue;
                }
                collect_non_title_strings_inner(value, strings);
            }
        }
        _ => {}
    }
}

fn collect_all_strings_inner(value: &toml::Value, strings: &mut Vec<String>) {
    match value {
        toml::Value::String(text) => strings.push(text.clone()),
        toml::Value::Array(values) => {
            for value in values {
                collect_all_strings_inner(value, strings);
            }
        }
        toml::Value::Table(table) => {
            for value in table.values() {
                collect_all_strings_inner(value, strings);
            }
        }
        _ => {}
    }
}
