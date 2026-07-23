use anyhow::{anyhow, bail, Context, Result};
use clap::Parser;
use hibikilogy_tools::article_source::{
    normalize_iso_date, parse_article_file_name, ArticleFileName as ParsedArticleFileName,
};
use hibikilogy_tools::content_files::sorted_markdown_files;
use hibikilogy_tools::content_routes;
use hibikilogy_tools::managed_fs::{
    ensure_directory_beneath, recover_atomic_file, reject_symlink_or_directory,
};
use hibikilogy_tools::managed_json;
use hibikilogy_tools::url_encoding::encode_query_value;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

const MANIFEST_PATH: &str = "static/_cache/short-links.json";
const SHORT_LINK_DIRECTORY: &str = "s";
const MIN_CODE_LENGTH: usize = 5;
const YEAR_PREFIX_LENGTH: usize = 2;
const MIN_HASH_PART_LENGTH: usize = MIN_CODE_LENGTH - YEAR_PREFIX_LENGTH;
const SHA256_HEX_LENGTH: usize = 64;

#[derive(Debug, Parser)]
#[command(about = "Generate hash-based short-link redirect pages for articles.")]
struct Args {
    #[arg(long)]
    content_dir: PathBuf,

    #[arg(long)]
    site_root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveArticle {
    source_file: String,
    target_slug: String,
    digest: String,
    year_prefix: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ResolvedArticleMetadata {
    target_slug: String,
    publish_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RedirectRecord {
    code: String,
    target_slug: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct ShortLinkRecord {
    source_file: String,
    target_slug: String,
    code: String,
    digest: String,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct ShortLinkManifest {
    #[serde(default)]
    records: Vec<ShortLinkRecord>,

    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    retired_codes: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct SearchIndexEntry {
    url: String,
}

#[derive(Debug, Default, Deserialize)]
struct FrontMatter {
    slug: Option<String>,
    date: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct GenerateReport {
    total: usize,
    created: usize,
    reused: usize,
    removed: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Assignment {
    records: Vec<ShortLinkRecord>,
    reused: usize,
}

pub fn run() -> Result<()> {
    let args = Args::parse();
    let manifest_path = Path::new(MANIFEST_PATH);
    let report = generate_short_links(&args.content_dir, &args.site_root, manifest_path)?;

    println!(
        "wrote {} short links ({} new, {} reused) and removed {} orphaned redirect(s); manifest: {}",
        report.total,
        report.created,
        report.reused,
        report.removed,
        manifest_path.display(),
    );

    Ok(())
}

fn generate_short_links(
    content_dir: &Path,
    site_root: &Path,
    manifest_path: &Path,
) -> Result<GenerateReport> {
    ensure_input_directory(content_dir, "content directory")?;
    ensure_input_directory(site_root, "site root")?;

    let existing_manifest = load_manifest(manifest_path)?;
    let article_urls = load_article_urls(site_root)?;
    let active_articles = collect_active_articles(content_dir, site_root, &article_urls)?;
    let assignment = assign_short_link_codes(&active_articles, &existing_manifest)?;
    let orphaned = orphaned_codes(&existing_manifest.records, &assignment.records);
    let redirects = assignment
        .records
        .iter()
        .map(|record| RedirectRecord {
            code: record.code.clone(),
            target_slug: record.target_slug.clone(),
        })
        .collect::<Vec<_>>();

    let short_root = site_root.join(SHORT_LINK_DIRECTORY);
    ensure_directory_beneath(site_root, &short_root)?;

    write_redirect_pages(&short_root, &redirects)?;
    remove_redirect_directories(&short_root, &orphaned)?;

    let mut retired_codes = existing_manifest.retired_codes;
    retired_codes.extend(orphaned.iter().cloned());
    for record in &assignment.records {
        retired_codes.remove(&record.code);
    }

    save_manifest(
        manifest_path,
        &ShortLinkManifest {
            records: assignment.records.clone(),
            retired_codes,
        },
    )?;

    Ok(GenerateReport {
        total: assignment.records.len(),
        created: assignment.records.len() - assignment.reused,
        reused: assignment.reused,
        removed: orphaned.len(),
    })
}

fn ensure_input_directory(path: &Path, label: &str) -> Result<()> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("failed to inspect {label} {}", path.display()))?;

    if !metadata.is_dir() {
        bail!("{label} {} is not a directory", path.display());
    }

    Ok(())
}

fn collect_active_articles(
    content_dir: &Path,
    site_root: &Path,
    article_urls: &BTreeSet<String>,
) -> Result<Vec<ActiveArticle>> {
    let markdown_files = sorted_markdown_files(content_dir, true)?
        .into_iter()
        .map(|path| {
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .with_context(|| {
                    format!("article filename is not valid UTF-8: {}", path.display())
                })?
                .to_string();
            Ok((file_name, path))
        })
        .collect::<Result<Vec<_>>>()?;

    let mut articles = Vec::with_capacity(markdown_files.len());
    let mut target_slugs = BTreeSet::new();

    for (file_name, markdown_path) in markdown_files {
        validate_source_file_name(&file_name)?;
        let parsed_file_name = parse_article_file_name(&file_name)?;
        let markdown = fs::read_to_string(&markdown_path)
            .with_context(|| format!("failed to read {}", markdown_path.display()))?;
        let metadata = resolve_article_metadata(
            &file_name,
            &markdown,
            &parsed_file_name,
            site_root,
            article_urls,
        )?;

        if !target_slugs.insert(metadata.target_slug.clone()) {
            bail!(
                "multiple articles resolve to the same slug: {}",
                metadata.target_slug
            );
        }

        articles.push(ActiveArticle {
            source_file: file_name.clone(),
            target_slug: metadata.target_slug,
            digest: digest_source_file_name(&file_name),
            year_prefix: short_year_prefix(&metadata.publish_date)?,
        });
    }

    Ok(articles)
}

fn resolve_article_metadata(
    file_name: &str,
    markdown: &str,
    parsed_file_name: &ParsedArticleFileName,
    site_root: &Path,
    article_urls: &BTreeSet<String>,
) -> Result<ResolvedArticleMetadata> {
    let front_matter = parse_front_matter(markdown)?;
    let publish_date = front_matter
        .date
        .unwrap_or_else(|| parsed_file_name.publish_date.clone());
    let target_slug = match front_matter.slug {
        Some(slug) => {
            ensure_target_page_exists(site_root, article_urls, &slug)
                .with_context(|| format!("missing built article target for {file_name}"))?;
            slug
        }
        None => resolve_fallback_target_slug(file_name, parsed_file_name, site_root, article_urls)?,
    };

    Ok(ResolvedArticleMetadata {
        target_slug,
        publish_date,
    })
}

fn resolve_fallback_target_slug(
    file_name: &str,
    parsed_file_name: &ParsedArticleFileName,
    site_root: &Path,
    article_urls: &BTreeSet<String>,
) -> Result<String> {
    if ensure_target_page_exists(site_root, article_urls, &parsed_file_name.slug_tail).is_ok() {
        return Ok(parsed_file_name.slug_tail.clone());
    }

    let slugified = slugify_path_component(&parsed_file_name.slug_tail);
    ensure_target_page_exists(site_root, article_urls, &slugified).with_context(|| {
        format!("missing built article target for {file_name} using fallback slug {slugified:?}",)
    })?;

    Ok(slugified)
}

fn ensure_target_page_exists(
    site_root: &Path,
    article_urls: &BTreeSet<String>,
    slug: &str,
) -> Result<()> {
    validate_slug(slug)?;

    let target_url = format!("/articles/{slug}/");
    if !article_urls.is_empty() && !article_urls.contains(&target_url) {
        bail!("{target_url} not found in search_index.zh.json");
    }

    content_routes::ensure_built_page_exists(site_root, &format!("articles/{slug}"))
}

fn load_article_urls(site_root: &Path) -> Result<BTreeSet<String>> {
    let search_index_path = site_root.join("search_index.zh.json");
    if !search_index_path.is_file() {
        return Ok(BTreeSet::new());
    }

    let json = fs::read_to_string(&search_index_path)
        .with_context(|| format!("failed to read {}", search_index_path.display()))?;
    let entries: Vec<SearchIndexEntry> = serde_json::from_str(&json)
        .with_context(|| format!("failed to parse {}", search_index_path.display()))?;

    Ok(entries
        .into_iter()
        .map(|entry| entry.url)
        .filter(|url| url.starts_with("/articles/"))
        .collect())
}

fn parse_front_matter(markdown: &str) -> Result<FrontMatter> {
    let parsed = content_routes::parse_page_front_matter(markdown)?;
    let mut parsed = FrontMatter {
        slug: parsed.slug,
        date: parsed.date,
    };

    if let Some(slug) = parsed.slug.take() {
        validate_slug(&slug).context("invalid slug in TOML front matter")?;
        parsed.slug = Some(slug.to_lowercase());
    }

    if let Some(date) = parsed.date.take() {
        parsed.date = Some(normalize_iso_date(&date).context("invalid date in TOML front matter")?);
    }

    Ok(parsed)
}

fn short_year_prefix(date: &str) -> Result<String> {
    let normalized = normalize_iso_date(date)?;
    Ok(normalized[2..4].to_owned())
}

fn validate_source_file_name(source_file: &str) -> Result<()> {
    let valid = !source_file.is_empty()
        && source_file.ends_with(".md")
        && !source_file.contains('/')
        && !source_file.contains('\\')
        && source_file != "."
        && source_file != "..";

    if !valid {
        bail!("invalid article source filename: {source_file:?}");
    }

    Ok(())
}

fn validate_slug(slug: &str) -> Result<()> {
    content_routes::validate_slug(slug).map_err(|_| anyhow!("invalid article slug: {slug:?}"))
}

fn digest_source_file_name(source_file: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(source_file.as_bytes());
    hex_lower(&hasher.finalize())
}

fn hex_lower(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut output, "{byte:02x}").expect("writing to a String cannot fail");
    }
    output
}

fn slugify_path_component(input: &str) -> String {
    content_routes::slugify_path_component(input)
}

fn assign_short_link_codes(
    articles: &[ActiveArticle],
    existing_manifest: &ShortLinkManifest,
) -> Result<Assignment> {
    let existing_by_source = existing_manifest
        .records
        .iter()
        .map(|record| (record.source_file.as_str(), record))
        .collect::<BTreeMap<_, _>>();
    let existing_by_slug = existing_manifest
        .records
        .iter()
        .map(|record| (record.target_slug.as_str(), record))
        .collect::<BTreeMap<_, _>>();

    let mut unavailable_codes = existing_manifest.retired_codes.clone();
    unavailable_codes.extend(
        existing_manifest
            .records
            .iter()
            .map(|record| record.code.clone()),
    );

    let mut matched = vec![None; articles.len()];
    let mut claimed_codes = BTreeSet::new();

    for (index, article) in articles.iter().enumerate() {
        if let Some(previous) = existing_by_source.get(article.source_file.as_str()) {
            if is_reusable_code(&previous.code) && claimed_codes.insert(previous.code.as_str()) {
                matched[index] = Some(*previous);
            }
        }
    }

    for (index, article) in articles.iter().enumerate() {
        if matched[index].is_some() {
            continue;
        }

        if let Some(previous) = existing_by_slug.get(article.target_slug.as_str()) {
            if is_reusable_code(&previous.code) && claimed_codes.insert(previous.code.as_str()) {
                matched[index] = Some(*previous);
            }
        }
    }

    let mut records = Vec::with_capacity(articles.len());
    let mut reused = 0;

    for (article, previous) in articles.iter().zip(matched) {
        let code = match previous {
            Some(previous) => {
                reused += 1;
                previous.code.clone()
            }
            None => allocate_code(article, &mut unavailable_codes),
        };

        records.push(ShortLinkRecord {
            source_file: article.source_file.clone(),
            target_slug: article.target_slug.clone(),
            code,
            digest: article.digest.clone(),
        });
    }

    Ok(Assignment { records, reused })
}

fn allocate_code(article: &ActiveArticle, unavailable_codes: &mut BTreeSet<String>) -> String {
    for hash_length in MIN_HASH_PART_LENGTH..=article.digest.len() {
        let candidate = format!("{}{}", article.year_prefix, &article.digest[..hash_length]);
        if unavailable_codes.insert(candidate.clone()) {
            return candidate;
        }
    }

    let digest_code = format!("{}{}", article.year_prefix, article.digest);
    for suffix in 2usize.. {
        let candidate = format!("{digest_code}-{suffix}");
        if unavailable_codes.insert(candidate.clone()) {
            return candidate;
        }
    }

    unreachable!("the numeric suffix space is effectively unbounded")
}

fn validate_manifest(manifest: &ShortLinkManifest) -> Result<()> {
    let mut source_files = BTreeSet::new();
    let mut target_slugs = BTreeSet::new();
    let mut active_codes = BTreeSet::new();

    for record in &manifest.records {
        validate_source_file_name(&record.source_file)
            .with_context(|| format!("invalid manifest record for code {:?}", record.code))?;
        validate_slug(&record.target_slug)
            .with_context(|| format!("invalid manifest record for {}", record.source_file))?;
        validate_code(&record.code)
            .with_context(|| format!("invalid manifest record for {}", record.source_file))?;
        validate_digest(&record.digest)
            .with_context(|| format!("invalid manifest record for {}", record.source_file))?;

        let expected_digest = digest_source_file_name(&record.source_file);
        if record.digest != expected_digest {
            bail!(
                "manifest digest mismatch for {}: expected {}, found {}",
                record.source_file,
                expected_digest,
                record.digest,
            );
        }

        if !source_files.insert(record.source_file.as_str()) {
            bail!("duplicate source_file in manifest: {}", record.source_file);
        }
        if !target_slugs.insert(record.target_slug.as_str()) {
            bail!("duplicate target_slug in manifest: {}", record.target_slug);
        }
        if !active_codes.insert(record.code.as_str()) {
            bail!("duplicate short-link code in manifest: {}", record.code);
        }
    }

    for code in &manifest.retired_codes {
        validate_code(code).context("invalid retired short-link code in manifest")?;
        if active_codes.contains(code.as_str()) {
            bail!("short-link code is both active and retired: {code}");
        }
    }

    Ok(())
}

fn validate_digest(digest: &str) -> Result<()> {
    if digest.len() != SHA256_HEX_LENGTH || !is_lower_hex(digest) {
        bail!("invalid SHA-256 digest: {digest:?}");
    }
    Ok(())
}

fn validate_code(code: &str) -> Result<()> {
    let valid_prefixed = code.rsplit_once('-').map_or_else(
        || is_year_prefixed_hash(code),
        |(base, suffix)| {
            is_year_prefixed_hash(base) && suffix.parse::<usize>().is_ok_and(|number| number >= 2)
        },
    );
    let valid_legacy = code.rsplit_once('-').map_or_else(
        || is_legacy_hash_code(code),
        |(base, suffix)| {
            base.len() == SHA256_HEX_LENGTH
                && is_lower_hex(base)
                && suffix.parse::<usize>().is_ok_and(|number| number >= 2)
        },
    );

    if !valid_prefixed && !valid_legacy {
        bail!("invalid short-link code: {code:?}");
    }

    Ok(())
}

fn is_year_prefixed_hash(code: &str) -> bool {
    if code.len() < MIN_CODE_LENGTH || code.len() > YEAR_PREFIX_LENGTH + SHA256_HEX_LENGTH {
        return false;
    }

    let (year, hash) = code.split_at(YEAR_PREFIX_LENGTH);
    year.bytes().all(|byte| byte.is_ascii_digit())
        && hash.len() >= MIN_HASH_PART_LENGTH
        && is_lower_hex(hash)
}

fn is_reusable_code(code: &str) -> bool {
    code.rsplit_once('-').map_or_else(
        || is_year_prefixed_hash(code),
        |(base, suffix)| {
            is_year_prefixed_hash(base) && suffix.parse::<usize>().is_ok_and(|number| number >= 2)
        },
    )
}

fn is_legacy_hash_code(code: &str) -> bool {
    (MIN_CODE_LENGTH..=SHA256_HEX_LENGTH).contains(&code.len()) && is_lower_hex(code)
}

fn is_lower_hex(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn orphaned_codes(managed: &[ShortLinkRecord], active: &[ShortLinkRecord]) -> Vec<String> {
    let active_codes = active
        .iter()
        .map(|record| record.code.as_str())
        .collect::<BTreeSet<_>>();

    managed
        .iter()
        .filter(|record| !active_codes.contains(record.code.as_str()))
        .map(|record| record.code.clone())
        .collect()
}

fn write_redirect_pages(root: &Path, redirects: &[RedirectRecord]) -> Result<()> {
    for redirect in redirects {
        write_redirect_page(root, redirect)?;
    }

    Ok(())
}

fn write_redirect_page(root: &Path, redirect: &RedirectRecord) -> Result<()> {
    validate_code(&redirect.code)?;
    validate_slug(&redirect.target_slug)?;

    let redirect_dir = root.join(&redirect.code);
    ensure_directory_beneath(root, &redirect_dir)?;

    let redirect_path = redirect_dir.join("index.html");
    reject_symlink_or_directory(&redirect_path)?;

    let redirect_html = render_redirect_html(&article_redirect_target(redirect));
    fs::write(&redirect_path, redirect_html)
        .with_context(|| format!("failed to write {}", redirect_path.display()))
}

fn article_redirect_target(redirect: &RedirectRecord) -> String {
    let source_path = format!("/{SHORT_LINK_DIRECTORY}/{}/", redirect.code);
    let source_param = encode_query_value(&source_path);
    format!("/articles/{}?from={}", redirect.target_slug, source_param)
}

fn remove_redirect_directories(root: &Path, codes: &[String]) -> Result<()> {
    for code in codes {
        remove_redirect_directory(root, code)?;
    }

    Ok(())
}

fn remove_redirect_directory(root: &Path, code: &str) -> Result<()> {
    validate_code(code)?;
    let path = root.join(code);

    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            bail!("refusing to remove symlinked redirect {}", path.display())
        }
        Ok(metadata) if metadata.is_dir() => fs::remove_dir_all(&path)
            .with_context(|| format!("failed to remove {}", path.display())),
        Ok(_) => bail!("{} exists but is not a directory", path.display()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("failed to inspect {}", path.display())),
    }
}

fn render_redirect_html(target_path: &str) -> String {
    let escaped_attribute = escape_html(target_path, true);
    let escaped_text = escape_html(target_path, false);
    let js_target = serde_json::to_string(target_path)
        .expect("serializing a string cannot fail")
        .replace('<', "\\u003c");

    format!(
        "<!doctype html>\n\
<html lang=\"en\">\n\
<head>\n\
  <meta charset=\"utf-8\">\n\
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
  <meta name=\"robots\" content=\"noindex\">\n\
  <title>Redirecting...</title>\n\
  <meta http-equiv=\"refresh\" content=\"0; url={escaped_attribute}\">\n\
  <link rel=\"canonical\" href=\"{escaped_attribute}\">\n\
  <script>window.location.replace({js_target})</script>\n\
</head>\n\
<body>\n\
  <p>Redirecting to <a href=\"{escaped_attribute}\">{escaped_text}</a>.</p>\n\
</body>\n\
</html>\n"
    )
}

fn escape_html(value: &str, escape_quotes: bool) -> String {
    let mut output = String::with_capacity(value.len());

    for character in value.chars() {
        match character {
            '&' => output.push_str("&amp;"),
            '<' => output.push_str("&lt;"),
            '>' => output.push_str("&gt;"),
            '"' if escape_quotes => output.push_str("&quot;"),
            '\'' if escape_quotes => output.push_str("&#39;"),
            _ => output.push(character),
        }
    }

    output
}

fn load_manifest(path: &Path) -> Result<ShortLinkManifest> {
    recover_atomic_file(path)?;
    if !path.exists() {
        return Ok(ShortLinkManifest::default());
    }

    let manifest: ShortLinkManifest = managed_json::load(path)?;

    validate_manifest(&manifest)
        .with_context(|| format!("invalid short-link manifest {}", path.display()))?;

    Ok(manifest)
}

fn save_manifest(path: &Path, manifest: &ShortLinkManifest) -> Result<()> {
    validate_manifest(manifest)?;

    managed_json::save_pretty(path, manifest)
}

#[cfg(test)]
#[path = "tests/mod.rs"]
mod tests;
