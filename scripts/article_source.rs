use anyhow::{bail, Context, Result};
use chrono::{Datelike, NaiveDate};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArticleFileName {
    pub publish_date: String,
    pub slug_tail: String,
}

pub fn parse_article_file_name(file_name: &str) -> Result<ArticleFileName> {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .with_context(|| format!("failed to read file stem from {file_name}"))?;
    let mut parts = stem.splitn(4, '-');
    let (Some(year), Some(month), Some(day), Some(slug_tail)) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        bail!("{file_name} does not match YYYY-MM-DD-slug.md");
    };
    if slug_tail.is_empty() {
        bail!("{file_name} does not contain a slug tail");
    }
    Ok(ArticleFileName {
        publish_date: normalize_iso_date(&format!("{year}-{month}-{day}"))
            .with_context(|| format!("{file_name} contains an invalid calendar date"))?,
        slug_tail: slug_tail.to_lowercase(),
    })
}

pub fn normalize_iso_date(date: &str) -> Result<String> {
    let strict_iso = date.len() == 10
        && date.as_bytes().get(4) == Some(&b'-')
        && date.as_bytes().get(7) == Some(&b'-')
        && date
            .bytes()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit());
    if !strict_iso {
        bail!("date must be YYYY-MM-DD: {date}");
    }
    let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .with_context(|| format!("date must be YYYY-MM-DD: {date}"))?;
    if parsed.year() <= 0 {
        bail!("date year must be positive: {date}");
    }
    Ok(parsed.format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::parse_article_file_name;

    #[test]
    fn validates_calendar_dates() {
        assert!(parse_article_file_name("2026-02-29-invalid.md").is_err());
        assert!(parse_article_file_name("2024-02-29-valid.md").is_ok());
    }
}
