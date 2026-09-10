use anyhow::{bail, Context, Result};
use clap::Parser;
use hibikilogy_tools::article_source::{
    normalize_iso_date, parse_article_file_name, ArticleFileName as ParsedArticleFileName,
};
use hibikilogy_tools::content_files::sorted_markdown_files;
use hibikilogy_tools::front_matter::{locate_toml_front_matter, FrontMatterSpan};
use hibikilogy_tools::managed_fs::{reject_symlink_or_directory, write_atomic};
use hibikilogy_tools::managed_json;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use toml_edit::{value, Array, DocumentMut};

const RESERVATIONS_VERSION: u32 = 1;
const SHORT_LINK_PREFIX: &str = "/s/";
const SHORT_LINK_DIGITS: usize = 5;
const IDS_PER_YEAR: u16 = 1000;

#[derive(Debug, Parser)]
#[command(about = "Synchronize Zola short-link aliases in article front matter.")]
struct Args {
    #[arg(long)]
    content_dir: PathBuf,

    #[arg(long)]
    reservations: PathBuf,

    #[arg(long)]
    check: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Reservations {
    version: u32,
    reserved_codes: BTreeSet<String>,
}

impl Default for Reservations {
    fn default() -> Self {
        Self {
            version: RESERVATIONS_VERSION,
            reserved_codes: BTreeSet::new(),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct FrontMatter {
    date: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    aliases: Vec<String>,
}

#[derive(Debug)]
struct Article {
    path: PathBuf,
    file_name: String,
    markdown: String,
    metadata: FrontMatter,
    short_code: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct SyncReport {
    updated_articles: usize,
    reserved_codes: usize,
}

pub fn run() -> Result<()> {
    let args = Args::parse();
    let report = sync_short_links(&args.content_dir, &args.reservations, args.check)?;

    if args.check {
        println!(
            "short-link aliases are in sync ({} reserved code(s))",
            report.reserved_codes
        );
    } else {
        println!(
            "updated {} article(s); {} short-link code(s) are permanently reserved",
            report.updated_articles, report.reserved_codes
        );
    }

    Ok(())
}

fn sync_short_links(
    content_dir: &Path,
    reservations_path: &Path,
    check: bool,
) -> Result<SyncReport> {
    ensure_input_directory(content_dir)?;
    reject_symlink_or_directory(reservations_path)?;

    let existing_reservations = load_reservations(reservations_path)?;
    let mut reserved_codes = existing_reservations.reserved_codes.clone();
    let mut articles = load_articles(content_dir)?;
    let mut claimed_codes = BTreeMap::<String, PathBuf>::new();

    for article in &articles {
        let Some(code) = &article.short_code else {
            continue;
        };
        if let Some(previous) = claimed_codes.insert(code.clone(), article.path.clone()) {
            bail!(
                "short-link code {code} is used by both {} and {}",
                previous.display(),
                article.path.display()
            );
        }
        reserved_codes.insert(code.clone());
    }

    let mut updated_articles = Vec::new();
    for article in &mut articles {
        if article.short_code.is_some() || article.metadata.draft {
            continue;
        }

        let publish_date = article_publish_date(article)?;
        let year_prefix = short_year_prefix(&publish_date)?;
        let initial_id = digest_modulo(article.file_name.as_bytes(), IDS_PER_YEAR);
        let code = allocate_code(&year_prefix, initial_id, &mut reserved_codes)?;
        let alias = short_alias(&code);
        let updated = append_alias(&article.markdown, &alias)
            .with_context(|| format!("failed to update {}", article.path.display()))?;
        updated_articles.push((article.path.clone(), updated));
        article.short_code = Some(code);
    }

    let desired_reservations = Reservations {
        version: RESERVATIONS_VERSION,
        reserved_codes,
    };
    let reservations_changed = desired_reservations != existing_reservations;

    if check {
        if !updated_articles.is_empty() || reservations_changed {
            let mut reasons = updated_articles
                .iter()
                .map(|(path, _)| format!("missing short-link alias: {}", path.display()))
                .collect::<Vec<_>>();
            if reservations_changed {
                reasons.push(format!(
                    "reservation ledger is out of sync: {}",
                    reservations_path.display()
                ));
            }
            bail!(
                "short-link aliases are out of sync:\n{}",
                reasons.join("\n")
            );
        }

        return Ok(SyncReport {
            updated_articles: 0,
            reserved_codes: desired_reservations.reserved_codes.len(),
        });
    }

    for (path, markdown) in &updated_articles {
        write_atomic(path, markdown.as_bytes())
            .with_context(|| format!("failed to write {}", path.display()))?;
    }
    if reservations_changed {
        managed_json::save_pretty(reservations_path, &desired_reservations)?;
    }

    Ok(SyncReport {
        updated_articles: updated_articles.len(),
        reserved_codes: desired_reservations.reserved_codes.len(),
    })
}

fn ensure_input_directory(path: &Path) -> Result<()> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("failed to inspect content directory {}", path.display()))?;
    if !metadata.is_dir() {
        bail!("content directory {} is not a directory", path.display());
    }
    Ok(())
}

fn load_reservations(path: &Path) -> Result<Reservations> {
    if !path.exists() {
        return Ok(Reservations::default());
    }

    let reservations: Reservations = managed_json::load(path)?;
    if reservations.version != RESERVATIONS_VERSION {
        bail!(
            "unsupported reservation ledger version {} in {}",
            reservations.version,
            path.display()
        );
    }
    for code in &reservations.reserved_codes {
        validate_code(code)
            .with_context(|| format!("invalid reserved code in {}", path.display()))?;
    }
    Ok(reservations)
}

fn load_articles(content_dir: &Path) -> Result<Vec<Article>> {
    sorted_markdown_files(content_dir, true)?
        .into_iter()
        .map(|path| {
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .with_context(|| {
                    format!("article filename is not valid UTF-8: {}", path.display())
                })?
                .to_owned();
            let markdown = fs::read_to_string(&path)
                .with_context(|| format!("failed to read {}", path.display()))?;
            let metadata = parse_front_matter(&markdown)
                .with_context(|| format!("failed to parse {}", path.display()))?;
            let short_code = find_short_code(&metadata.aliases)
                .with_context(|| format!("invalid short-link aliases in {}", path.display()))?;

            Ok(Article {
                path,
                file_name,
                markdown,
                metadata,
                short_code,
            })
        })
        .collect()
}

fn parse_front_matter(markdown: &str) -> Result<FrontMatter> {
    let span = require_front_matter(markdown)?;
    toml::from_str(&markdown[span.content_start..span.content_end])
        .context("failed to parse TOML front matter")
}

fn require_front_matter(markdown: &str) -> Result<FrontMatterSpan> {
    locate_toml_front_matter(markdown)?.context("missing TOML front matter")
}

fn find_short_code(aliases: &[String]) -> Result<Option<String>> {
    let short_aliases = aliases
        .iter()
        .filter(|alias| alias.starts_with(SHORT_LINK_PREFIX))
        .collect::<Vec<_>>();
    if short_aliases.len() > 1 {
        bail!("multiple /s/ aliases are not allowed");
    }

    short_aliases
        .first()
        .map(|alias| parse_short_alias(alias))
        .transpose()
}

fn parse_short_alias(alias: &str) -> Result<String> {
    let Some(code) = alias
        .strip_prefix(SHORT_LINK_PREFIX)
        .and_then(|value| value.strip_suffix('/'))
    else {
        bail!("invalid short-link alias: {alias:?}");
    };
    validate_code(code)?;
    Ok(code.to_owned())
}

fn validate_code(code: &str) -> Result<()> {
    if code.len() != SHORT_LINK_DIGITS || !code.bytes().all(|byte| byte.is_ascii_digit()) {
        bail!("short-link code must contain exactly five digits: {code:?}");
    }
    Ok(())
}

fn article_publish_date(article: &Article) -> Result<String> {
    if let Some(date) = &article.metadata.date {
        return normalize_iso_date(date).context("invalid front matter date");
    }

    let ParsedArticleFileName { publish_date, .. } = parse_article_file_name(&article.file_name)?;
    Ok(publish_date)
}

fn short_year_prefix(date: &str) -> Result<String> {
    let normalized = normalize_iso_date(date)?;
    Ok(normalized[2..4].to_owned())
}

fn digest_modulo(input: &[u8], modulus: u16) -> u16 {
    Sha256::digest(input).iter().fold(0u16, |remainder, byte| {
        ((u32::from(remainder) * 256 + u32::from(*byte)) % u32::from(modulus)) as u16
    })
}

fn allocate_code(
    year_prefix: &str,
    initial_id: u16,
    reserved_codes: &mut BTreeSet<String>,
) -> Result<String> {
    for offset in 0..IDS_PER_YEAR {
        let id = (initial_id + offset) % IDS_PER_YEAR;
        let code = format!("{year_prefix}{id:03}");
        if reserved_codes.insert(code.clone()) {
            return Ok(code);
        }
    }

    bail!("all {IDS_PER_YEAR} short-link IDs for year {year_prefix} are permanently reserved")
}

fn short_alias(code: &str) -> String {
    format!("{SHORT_LINK_PREFIX}{code}/")
}

fn append_alias(markdown: &str, alias: &str) -> Result<String> {
    let span = require_front_matter(markdown)?;
    let front_matter = &markdown[span.content_start..span.content_end];
    let normalized = front_matter.replace("\r\n", "\n");
    let mut document = normalized
        .parse::<DocumentMut>()
        .context("failed to parse editable TOML front matter")?;

    match document.get_mut("aliases") {
        Some(item) => {
            let aliases = item
                .as_array_mut()
                .context("front matter aliases must be an array")?;
            aliases.push(alias);
        }
        None => {
            let mut aliases = Array::new();
            aliases.push(alias);
            document["aliases"] = value(aliases);
        }
    }

    let mut rendered = document.to_string();
    if span.newline == "\r\n" {
        rendered = rendered.replace("\r\n", "\n").replace('\n', "\r\n");
    }

    Ok(format!(
        "{}{}{}",
        &markdown[..span.content_start],
        rendered,
        &markdown[span.content_end..]
    ))
}

#[cfg(test)]
#[path = "tests/mod.rs"]
mod tests;
