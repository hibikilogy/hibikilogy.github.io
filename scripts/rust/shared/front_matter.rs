//! TOML front matter parsing shared by content tools.

use anyhow::{bail, Context, Result};

/// Located TOML front matter: byte range of its content plus the document's
/// newline style, so callers can splice the document without re-sniffing the
/// BOM and opening marker.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrontMatterSpan {
    pub content_start: usize,
    pub content_end: usize,
    pub newline: &'static str,
}

pub fn locate_toml_front_matter(markdown: &str) -> Result<Option<FrontMatterSpan>> {
    let bom_length = usize::from(markdown.starts_with('\u{feff}')) * '\u{feff}'.len_utf8();
    let after_bom = &markdown[bom_length..];
    let (newline, opening_length) = if after_bom.starts_with("+++\r\n") {
        ("\r\n", "+++\r\n".len())
    } else if after_bom.starts_with("+++\n") {
        ("\n", "+++\n".len())
    } else {
        return Ok(None);
    };
    let content_start = bom_length + opening_length;
    let rest = &markdown[content_start..];
    let mut offset = 0;

    for segment in rest.split_inclusive('\n') {
        if segment.trim_end_matches(&['\r', '\n'][..]) == "+++" {
            return Ok(Some(FrontMatterSpan {
                content_start,
                content_end: content_start + offset,
                newline,
            }));
        }
        offset += segment.len();
    }

    bail!("unterminated TOML front matter")
}

pub fn split_toml_front_matter(markdown: &str) -> Result<Option<(&str, &str)>> {
    let Some(span) = locate_toml_front_matter(markdown)? else {
        return Ok(None);
    };
    let closing_end = markdown[span.content_end..]
        .find('\n')
        .map_or(markdown.len(), |index| span.content_end + index + 1);
    Ok(Some((
        &markdown[span.content_start..span.content_end],
        &markdown[closing_end..],
    )))
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
