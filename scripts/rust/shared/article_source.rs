//! Article source-file naming and publication-date parsing.

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
    use super::{normalize_iso_date, parse_article_file_name};

    #[test]
    fn validates_calendar_dates() {
        assert!(parse_article_file_name("2026-02-29-invalid.md").is_err());
        assert!(parse_article_file_name("2024-02-29-valid.md").is_ok());
    }

    #[test]
    fn rejects_non_iso_date_formats() {
        for bad in [
            "2026/01/01",  // wrong separators
            "2026-1-01",   // unpadded month
            "20260101",    // no separators
            "2026-01-1",   // unpadded day
            "2026-01-01x", // trailing junk
        ] {
            assert!(
                normalize_iso_date(bad).is_err(),
                "expected {bad:?} to be rejected"
            );
        }
        assert_eq!(normalize_iso_date("2026-01-01").unwrap(), "2026-01-01");
    }

    #[test]
    fn rejects_non_digit_separators_and_non_positive_years() {
        assert!(normalize_iso_date("2026-a-01").is_err());
        assert!(
            normalize_iso_date("0000-01-01").is_err(),
            "year zero is not positive"
        );
        assert!(
            normalize_iso_date("2023-02-29").is_err(),
            "non-leap February 29"
        );
    }

    #[test]
    fn requires_a_slug_tail_and_lowercases_it() {
        assert!(parse_article_file_name("2026-01-01-.md").is_err());
        assert!(parse_article_file_name("2026-01-01.md").is_err());
        assert_eq!(
            parse_article_file_name("2026-01-01-My-Post.md")
                .unwrap()
                .slug_tail,
            "my-post"
        );
    }

    #[test]
    fn strips_directories_but_keeps_dots_in_the_slug() {
        let parsed = parse_article_file_name("articles/2026-01-01-post.md.txt").unwrap();
        assert_eq!(parsed.slug_tail, "post.md");
    }
}
