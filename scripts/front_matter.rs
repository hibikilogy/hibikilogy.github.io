use anyhow::{Context, Result};

pub fn split_toml_front_matter(markdown: &str) -> Option<(&str, &str)> {
    let rest = markdown
        .strip_prefix("+++\n")
        .or_else(|| markdown.strip_prefix("+++\r\n"))?;

    let (front_matter, body) = if let Some(end) = rest.find("\n+++\n") {
        (&rest[..end], &rest[end + 5..])
    } else if let Some(end) = rest.find("\r\n+++\r\n") {
        (&rest[..end], &rest[end + 7..])
    } else if let Some(end) = rest.find("\n+++\r\n") {
        (&rest[..end], &rest[end + 6..])
    } else if let Some(end) = rest.find("\r\n+++\n") {
        (&rest[..end], &rest[end + 6..])
    } else {
        return None;
    };

    Some((front_matter, body))
}

pub fn parse_toml_front_matter(markdown: &str) -> Result<Option<toml::Value>> {
    let Some((front_matter, _)) = split_toml_front_matter(markdown) else {
        return Ok(None);
    };

    let value = front_matter
        .parse::<toml::Value>()
        .context("failed to parse TOML front matter")?;
    Ok(Some(value))
}
