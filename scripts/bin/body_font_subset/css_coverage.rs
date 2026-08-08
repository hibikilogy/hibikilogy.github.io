//! Base CSS @font-face parsing and per-face chunk validation owned by the
//! body-font subset tool.

use anyhow::{anyhow, bail, Context, Result};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use hibikilogy_tools::font::coverage::{font_codepoints, format_codepoint_list};

/// A single `@font-face` rule parsed from the base CSS.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FontFaceRule {
    /// Value of `font-family`, unquoted.
    pub font_family: Option<String>,
    /// Value of `font-weight`, e.g. `400` or `250 900`.
    pub font_weight: Option<String>,
    /// Value of the first `url(...)` in `src`, unresolved (relative to the
    /// CSS file).
    pub src_url: Option<String>,
    /// Parsed `unicode-range` value; `None` means the rule declares no range
    /// and therefore restricts nothing.
    pub unicode_range: Option<Vec<(u32, u32)>>,
}

/// The `@font-face` rules of a CSS file, in source order.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ParsedFontFaces {
    pub rules: Vec<FontFaceRule>,
}

impl ParsedFontFaces {
    /// Parse every `@font-face` block in the CSS, ignoring comments and
    /// matching keywords case-insensitively.
    pub fn parse(css: &str) -> Result<Self> {
        let css = strip_comments(css);
        let mut rules = Vec::new();
        let mut cursor = 0;

        while let Some(offset) = find_ci(&css[cursor..], "@font-face") {
            let block_start = cursor + offset + "@font-face".len();
            let Some(open) = find_ci(&css[block_start..], "{") else {
                bail!("unterminated @font-face rule (missing '{{')");
            };
            let body_start = block_start + open + 1;
            let Some(close) = css[body_start..].find('}') else {
                bail!("unterminated @font-face rule (missing '}}')");
            };
            rules.push(parse_rule(&css[body_start..body_start + close])?);
            cursor = body_start + close + 1;
        }

        Ok(Self { rules })
    }

    /// The merged covered ranges of all rules for `family`, sorted and
    /// coalesced. A target rule without `unicode-range` covers everything.
    pub fn covered_ranges(&self, family: &str) -> Vec<(u32, u32)> {
        let mut ranges = Vec::new();
        let mut unrestricted = false;
        for rule in &self.rules {
            if rule.font_family.as_deref() != Some(family) {
                continue;
            }
            match &rule.unicode_range {
                None => unrestricted = true,
                Some(rule_ranges) => ranges.extend(rule_ranges.iter().copied()),
            }
        }
        if unrestricted {
            return vec![(0, 0x10FFFF)];
        }
        merge_ranges(ranges)
    }
}

/// Validate the target family's rules against their referenced chunk fonts.
///
/// For every rule: the referenced font file must exist, decompress and parse;
/// `(declared ∩ source cmap) ⊆ chunk cmap` must hold, otherwise the base CSS
/// and its chunk fonts have drifted. Codepoints present in a chunk but not
/// declared by its rule are returned as warnings.
pub fn validate_font_faces(
    faces: &ParsedFontFaces,
    css_dir: &Path,
    target_family: &str,
    source_font: &[u8],
) -> Result<Vec<String>> {
    let source = font_codepoints(source_font)?;
    validate_font_faces_with_source(faces, css_dir, target_family, &source)
}

/// [`validate_font_faces`] with the source codepoint set supplied directly,
/// so tests can avoid parsing a full source font.
pub fn validate_font_faces_with_source(
    faces: &ParsedFontFaces,
    css_dir: &Path,
    target_family: &str,
    source: &BTreeSet<u32>,
) -> Result<Vec<String>> {
    let mut warnings = Vec::new();
    for (index, rule) in faces.rules.iter().enumerate() {
        if rule.font_family.as_deref() != Some(target_family) {
            continue;
        }
        let label = format!("@font-face rule {} (family {:?})", index + 1, target_family);
        let Some(url) = &rule.src_url else {
            bail!("{label} declares no src url");
        };
        let chunk_path = resolve_src_url(css_dir, url)
            .with_context(|| format!("{label}: invalid src url {url:?}"))?;
        let chunk_data = fs::read(&chunk_path).with_context(|| {
            format!(
                "{label}: failed to read chunk font {}",
                chunk_path.display()
            )
        })?;
        let chunk = font_codepoints(&chunk_data).with_context(|| {
            format!(
                "{label}: failed to parse chunk font {}",
                chunk_path.display()
            )
        })?;

        let Some(declared) = &rule.unicode_range else {
            continue;
        };
        let declared_codepoints = range_set(declared);
        let missing: Vec<u32> = declared_codepoints
            .intersection(source)
            .filter(|codepoint| !chunk.contains(codepoint))
            .copied()
            .collect();
        if !missing.is_empty() {
            bail!(
                "{label}: chunk {} is missing codepoint(s) declared by unicode-range and supported by the source font: {}",
                chunk_path.display(),
                format_codepoint_list(&missing)
            );
        }
        let undeclared: Vec<u32> = chunk.difference(&declared_codepoints).copied().collect();
        if !undeclared.is_empty() {
            warnings.push(format!(
                "{label}: chunk {} contains codepoint(s) not declared by unicode-range: {}",
                chunk_path.display(),
                format_codepoint_list(&undeclared)
            ));
        }
    }
    Ok(warnings)
}

pub fn write_comment_only_css(generator_name: &str, message: &str) -> String {
    format!("/* Generated by {generator_name}. {message} */\n")
}

/// Every `@font-face` rule for the target family must declare the same
/// `font-weight` as the generated patch face. Mixed weight descriptors
/// within one family make Chrome select a single weight bucket and silently
/// skip the other bucket's faces without ever consulting their
/// `unicode-range`, so the chunk fonts would never load.
pub fn check_weight_consistency(
    faces: &ParsedFontFaces,
    target_family: &str,
    expected_weight: Option<&str>,
) -> Result<()> {
    let expected = expected_weight.unwrap_or("400");
    for (index, rule) in faces.rules.iter().enumerate() {
        if rule.font_family.as_deref() != Some(target_family) {
            continue;
        }
        let declared = rule.font_weight.as_deref().unwrap_or("400");
        if declared != expected {
            bail!(
                "@font-face rule {} (family {:?}) declares font-weight {declared:?} but the subset font is {expected:?}; mixed font-weight descriptors within one family break unicode-range face selection in browsers",
                index + 1,
                target_family,
            );
        }
    }
    Ok(())
}

/// Merged unicode-range coverage with fast `contains` lookups, used to
/// compute which extracted content codepoints still need a patch font.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CssUnicodeRanges {
    ranges: Vec<(u32, u32)>,
}

impl CssUnicodeRanges {
    pub fn from_ranges(ranges: Vec<(u32, u32)>) -> Self {
        Self {
            ranges: merge_ranges(ranges),
        }
    }

    pub fn contains(&self, codepoint: u32) -> bool {
        self.ranges
            .binary_search_by(|&(start, end)| {
                if codepoint < start {
                    std::cmp::Ordering::Greater
                } else if codepoint > end {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .is_ok()
    }
}

pub fn filter_uncovered_codepoints(
    codepoints: impl IntoIterator<Item = u32>,
    covered: &CssUnicodeRanges,
) -> Vec<u32> {
    let mut uncovered: Vec<u32> = codepoints
        .into_iter()
        .filter(|&codepoint| !covered.contains(codepoint))
        .collect();
    uncovered.sort_unstable();
    uncovered.dedup();
    uncovered
}

fn parse_rule(block: &str) -> Result<FontFaceRule> {
    let mut rule = FontFaceRule::default();
    for declaration in block.split(';') {
        let Some((key, value)) = declaration.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        match key.as_str() {
            "font-family" => rule.font_family = Some(strip_quotes(value).to_string()),
            "font-weight" => rule.font_weight = Some(value.to_string()),
            "src" => rule.src_url = extract_url(value),
            "unicode-range" => rule.unicode_range = Some(parse_unicode_range_value(value)?),
            _ => {}
        }
    }
    Ok(rule)
}

/// Parse a `unicode-range` declaration value.
///
/// Stray commas between tokens (`U+4E00, , U+4E01`) are tolerated, but a
/// declaration with no tokens at all (`unicode-range: ;`) is an error so that
/// broken generated CSS is not silently accepted. `U+4??` wildcards are
/// expanded to their low-bit range.
pub(crate) fn parse_unicode_range_value(value: &str) -> Result<Vec<(u32, u32)>> {
    let mut ranges = Vec::new();
    let mut saw_token = false;
    for token in value.split(',') {
        let token = token.trim();
        if token.is_empty() {
            continue;
        }
        saw_token = true;
        ranges.push(parse_range_token(token)?);
    }
    if !saw_token {
        bail!("unicode-range declaration is empty");
    }
    Ok(ranges)
}

fn parse_range_token(token: &str) -> Result<(u32, u32)> {
    let token = token
        .strip_prefix("U+")
        .or_else(|| token.strip_prefix("u+"))
        .ok_or_else(|| anyhow!("invalid unicode-range token: {token}"))?;

    if let Some(question) = token.find('?') {
        let (prefix, wildcard) = token.split_at(question);
        if !wildcard.chars().all(|ch| ch == '?') {
            bail!("wildcard '?' must be trailing in unicode-range token: U+{token}");
        }
        if prefix.is_empty() {
            bail!("wildcard without hex prefix in unicode-range token: U+{token}");
        }
        let base = u32::from_str_radix(prefix, 16)
            .with_context(|| format!("failed to parse unicode codepoint {token}"))?;
        let shift = wildcard.len() * 4;
        let start = base
            .checked_shl(shift as u32)
            .ok_or_else(|| anyhow!("unicode-range token overflows: U+{token}"))?;
        let end = start | ((1u32 << shift) - 1);
        if end > 0x10FFFF {
            bail!("unicode-range token exceeds U+10FFFF: U+{token}");
        }
        return Ok((start, end));
    }

    let (start, end) = if let Some((start, end)) = token.split_once('-') {
        (parse_hex(start)?, parse_hex(end)?)
    } else {
        let value = parse_hex(token)?;
        (value, value)
    };

    if start > end {
        return Err(anyhow!("invalid unicode-range token: U+{token}"));
    }

    Ok((start, end))
}

fn parse_hex(value: &str) -> Result<u32> {
    u32::from_str_radix(value.trim(), 16)
        .with_context(|| format!("failed to parse unicode codepoint {value}"))
}

fn range_set(ranges: &[(u32, u32)]) -> BTreeSet<u32> {
    let mut codepoints = BTreeSet::new();
    for &(start, end) in ranges {
        codepoints.extend(start..=end);
    }
    codepoints
}

fn merge_ranges(mut ranges: Vec<(u32, u32)>) -> Vec<(u32, u32)> {
    if ranges.is_empty() {
        return ranges;
    }

    ranges.sort_unstable_by_key(|&(start, _)| start);
    let mut merged = Vec::with_capacity(ranges.len());
    let mut current = ranges[0];

    for (start, end) in ranges.into_iter().skip(1) {
        if start <= current.1.saturating_add(1) {
            current.1 = current.1.max(end);
        } else {
            merged.push(current);
            current = (start, end);
        }
    }

    merged.push(current);
    merged
}

/// Extract the first `url(...)` value from a `src` declaration.
fn extract_url(value: &str) -> Option<String> {
    let start = find_ci(value, "url(")?;
    let after = &value[start + "url(".len()..];
    let end = after.find(')')?;
    let url = after[..end].trim();
    Some(strip_quotes(url).to_string())
}

/// Resolve a CSS `src` url against the directory of the CSS file. Rooted and
/// absolute urls are rejected: chunk fonts live next to the base CSS.
fn resolve_src_url(css_dir: &Path, url: &str) -> Result<std::path::PathBuf> {
    if url.contains("://") || url.starts_with('/') {
        bail!("unsupported absolute src url {url:?}");
    }
    Ok(css_dir.join(url))
}

fn strip_quotes(value: &str) -> &str {
    let bytes = value.as_bytes();
    if bytes.len() >= 2
        && (bytes[0] == b'\'' || bytes[0] == b'"')
        && bytes[bytes.len() - 1] == bytes[0]
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

/// Remove `/* ... */` comments; an unterminated comment is left in place.
fn strip_comments(css: &str) -> String {
    let mut output = String::with_capacity(css.len());
    let mut rest = css;
    while let Some(start) = rest.find("/*") {
        output.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find("*/") else {
            output.push_str(rest);
            return output;
        };
        rest = &after[end + 2..];
    }
    output.push_str(rest);
    output
}

fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    haystack.to_ascii_lowercase().find(needle)
}
