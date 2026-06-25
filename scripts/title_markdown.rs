use anyhow::Result;

#[path = "front_matter.rs"]
mod front_matter;

pub fn extract_title(markdown: &str) -> Result<Option<String>> {
    let Some(front_matter) = front_matter::parse_toml_front_matter(markdown)? else {
        return Ok(None);
    };

    Ok(front_matter
        .get("title")
        .and_then(toml::Value::as_str)
        .map(ToOwned::to_owned))
}
