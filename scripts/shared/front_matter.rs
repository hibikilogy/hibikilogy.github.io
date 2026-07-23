//! TOML front matter parsing shared by content tools.

use anyhow::{bail, Context, Result};

pub fn split_toml_front_matter(markdown: &str) -> Result<Option<(&str, &str)>> {
    let markdown = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    let Some(rest) = markdown
        .strip_prefix("+++\r\n")
        .or_else(|| markdown.strip_prefix("+++\n"))
    else {
        return Ok(None);
    };
    let mut offset = 0;
    for segment in rest.split_inclusive('\n') {
        let line = segment.trim_end_matches(&['\r', '\n'][..]);
        if line == "+++" {
            return Ok(Some((&rest[..offset], &rest[offset + segment.len()..])));
        }
        offset += segment.len();
    }
    bail!("unterminated TOML front matter")
}

pub fn parse_toml_front_matter(markdown: &str) -> Result<Option<toml::Value>> {
    let Some((front_matter, _)) = split_toml_front_matter(markdown)? else {
        return Ok(None);
    };

    let value = front_matter
        .parse::<toml::Value>()
        .context("failed to parse TOML front matter")?;
    Ok(Some(value))
}

pub fn extract_toml_front_matter(markdown: &str) -> Result<Option<&str>> {
    Ok(split_toml_front_matter(markdown)?.map(|(front_matter, _)| front_matter))
}
