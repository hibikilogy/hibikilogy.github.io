//! Canonical content slug and built-route resolution.

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::path::{Component, Path, PathBuf};

use super::front_matter::extract_toml_front_matter;

#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
pub struct PageFrontMatter {
    pub slug: Option<String>,
    pub path: Option<String>,
}

pub fn parse_page_front_matter(markdown: &str) -> Result<PageFrontMatter> {
    let Some(front_matter) = extract_toml_front_matter(markdown)? else {
        return Ok(PageFrontMatter::default());
    };
    toml::from_str(front_matter).context("failed to parse TOML front matter")
}

pub fn validate_slug(slug: &str) -> Result<()> {
    let valid = !slug.is_empty()
        && slug != "."
        && slug != ".."
        && slug.chars().all(|character| {
            character.is_alphanumeric() || matches!(character, '-' | '_' | '.' | '~')
        });
    if !valid {
        bail!("invalid content slug: {slug:?}");
    }
    Ok(())
}

pub fn slugify_path_component(input: &str) -> String {
    let mut output = String::new();
    let mut pending_hyphen = false;
    for character in input.chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            if pending_hyphen && !output.is_empty() {
                output.push('-');
            }
            pending_hyphen = false;
            output.push(character);
        } else {
            pending_hyphen = !output.is_empty();
        }
    }
    output
}

pub fn normalize_route_path(path: &str) -> Result<String> {
    let normalized = path.trim().trim_matches('/');
    if normalized.is_empty() {
        bail!("content path must not resolve to the site root");
    }
    let relative = Path::new(normalized);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("invalid content path: {path:?}");
    }
    Ok(normalized.replace('\\', "/"))
}

fn built_page_path(site_root: &Path, route: &str) -> Result<PathBuf> {
    let route = normalize_route_path(route)?;
    Ok(site_root.join(route).join("index.html"))
}

pub fn ensure_built_page_exists(site_root: &Path, route: &str) -> Result<()> {
    let target = built_page_path(site_root, route)?;
    if target.is_file() {
        Ok(())
    } else {
        bail!("{} does not exist", target.display())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_route_path, parse_page_front_matter, slugify_path_component, validate_slug,
    };
    use crate::front_matter::extract_toml_front_matter;

    #[test]
    fn parses_only_top_level_route_fields() {
        let markdown =
            "+++\nslug = \"Page\"\npath = \"custom/page\"\n[extra]\nslug = \"nested\"\n+++\nbody\n";
        let parsed = parse_page_front_matter(markdown).unwrap();
        assert_eq!(parsed.slug.as_deref(), Some("Page"));
        assert_eq!(parsed.path.as_deref(), Some("custom/page"));
    }

    #[test]
    fn supports_bom_and_crlf_front_matter() {
        let markdown = "\u{feff}+++\r\nslug = \"page\"\r\n+++\r\nbody\r\n";
        assert_eq!(
            extract_toml_front_matter(markdown).unwrap(),
            Some("slug = \"page\"\r\n")
        );
    }

    #[test]
    fn rejects_unterminated_front_matter() {
        assert!(extract_toml_front_matter("+++\nslug = \"page\"\n").is_err());
    }

    #[test]
    fn validates_route_components() {
        assert!(validate_slug("valid-page_1").is_ok());
        assert!(validate_slug("../escape").is_err());
        assert!(normalize_route_path("/docs/page/../escape").is_err());
    }

    #[test]
    fn slugifies_zola_style_path_components() {
        assert_eq!(slugify_path_component("Omae’s16th"), "omae-s16th");
    }
}
