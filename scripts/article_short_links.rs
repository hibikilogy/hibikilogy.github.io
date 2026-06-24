use anyhow::{anyhow, bail, Context, Result};
use clap::Parser;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

const MANIFEST_PATH: &str = "static/_cache/short-links.json";
const SHORT_LINK_DIRECTORY: &str = "s";
const MIN_CODE_LENGTH: usize = 5;
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

    /// Codes that were previously published and must never be assigned to a
    /// different article.
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    retired_codes: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct SearchIndexEntry {
    url: String,
}

#[derive(Debug, Deserialize)]
struct FrontMatter {
    slug: Option<String>,
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

fn main() -> Result<()> {
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
    let orphaned_codes = orphaned_codes(&existing_manifest.records, &assignment.records);

    let short_root = site_root.join(SHORT_LINK_DIRECTORY);
    ensure_managed_directory(&short_root)?;

    // Write every active redirect before deleting old redirects. A failed write
    // therefore does not remove a previously working short link.
    for record in &assignment.records {
        write_redirect_page(&short_root, record)?;
    }

    for code in &orphaned_codes {
        remove_redirect_directory(&short_root, code)?;
    }

    let mut retired_codes = existing_manifest.retired_codes;
    retired_codes.extend(orphaned_codes.iter().cloned());
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
        removed: orphaned_codes.len(),
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
    let mut markdown_files = Vec::new();

    for entry in fs::read_dir(content_dir)
        .with_context(|| format!("failed to read {}", content_dir.display()))?
    {
        let entry = entry.with_context(|| {
            format!("failed to read an entry in {}", content_dir.display())
        })?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .with_context(|| format!("failed to inspect {}", path.display()))?;

        if file_type.is_symlink() {
            if path.extension().and_then(|extension| extension.to_str()) == Some("md") {
                bail!("article symlinks are not supported: {}", path.display());
            }
            continue;
        }

        if !file_type.is_file()
            || path.extension().and_then(|extension| extension.to_str()) != Some("md")
        {
            continue;
        }

        let file_name = entry.file_name().into_string().map_err(|file_name| {
            anyhow!(
                "article filename in {} is not valid UTF-8: {:?}",
                content_dir.display(),
                file_name,
            )
        })?;

        if file_name != "_index.md" {
            markdown_files.push((file_name, path));
        }
    }

    markdown_files.sort_unstable_by(|left, right| left.0.cmp(&right.0));

    let mut articles = Vec::with_capacity(markdown_files.len());
    let mut target_slugs = BTreeSet::new();

    for (file_name, markdown_path) in markdown_files {
        validate_source_file_name(&file_name)?;

        let markdown = fs::read_to_string(&markdown_path)
            .with_context(|| format!("failed to read {}", markdown_path.display()))?;
        let target_slug = resolve_target_slug(&file_name, &markdown, site_root, article_urls)?;

        if !target_slugs.insert(target_slug.clone()) {
            bail!("multiple articles resolve to the same slug: {target_slug}");
        }

        articles.push(ActiveArticle {
            digest: digest_source_file_name(&file_name),
            source_file: file_name,
            target_slug,
        });
    }

    Ok(articles)
}

fn resolve_target_slug(
    file_name: &str,
    markdown: &str,
    site_root: &Path,
    article_urls: &BTreeSet<String>,
) -> Result<String> {
    if let Some(slug) = extract_slug_from_markdown(markdown)? {
        ensure_target_page_exists(site_root, article_urls, &slug)
            .with_context(|| format!("missing built article target for {file_name}"))?;
        return Ok(slug);
    }

    let fallback = fallback_slug_from_file_name(file_name)?;
    if ensure_target_page_exists(site_root, article_urls, &fallback).is_ok() {
        return Ok(fallback);
    }

    let slugified = slugify_path_component(&fallback);
    ensure_target_page_exists(site_root, article_urls, &slugified).with_context(|| {
        format!(
            "missing built article target for {file_name} using fallback slug {slugified:?}",
        )
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

    let target = site_root.join("articles").join(slug).join("index.html");
    if target.is_file() {
        Ok(())
    } else {
        bail!("{} does not exist", target.display())
    }
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
        .filter(|url| url.starts_with("/articles/") && url.ends_with('/'))
        .collect())
}

fn extract_slug_from_markdown(markdown: &str) -> Result<Option<String>> {
    let Some(front_matter) = extract_toml_front_matter(markdown)? else {
        return Ok(None);
    };

    let parsed: FrontMatter =
        toml::from_str(front_matter).context("failed to parse TOML front matter")?;

    match parsed.slug {
        Some(slug) => {
            validate_slug(&slug).context("invalid slug in TOML front matter")?;
            Ok(Some(slug))
        }
        None => Ok(None),
    }
}

fn extract_toml_front_matter(markdown: &str) -> Result<Option<&str>> {
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
            return Ok(Some(&rest[..offset]));
        }

        offset += segment.len();
    }

    bail!("unterminated TOML front matter")
}

fn fallback_slug_from_file_name(file_name: &str) -> Result<String> {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .with_context(|| format!("failed to read file stem from {file_name}"))?;

    let mut parts = stem.splitn(4, '-');
    let (Some(year), Some(month), Some(day), Some(slug)) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        bail!("{file_name} does not match YYYY-MM-DD-slug.md");
    };

    let year = parse_date_part(year, 4, "year", file_name)?;
    let month = parse_date_part(month, 2, "month", file_name)?;
    let day = parse_date_part(day, 2, "day", file_name)?;

    if !is_valid_date(year, month, day) {
        bail!("{file_name} contains an invalid calendar date");
    }

    if slug.is_empty() {
        bail!("{file_name} does not contain a slug tail");
    }

    Ok(slug.to_owned())
}

fn parse_date_part(value: &str, expected_length: usize, label: &str, file_name: &str) -> Result<u32> {
    if value.len() != expected_length || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        bail!("invalid {label} in {file_name}; expected YYYY-MM-DD-slug.md");
    }

    value
        .parse::<u32>()
        .with_context(|| format!("failed to parse {label} in {file_name}"))
}

fn is_valid_date(year: u32, month: u32, day: u32) -> bool {
    if year == 0 || !(1..=12).contains(&month) {
        return false;
    }

    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => return false,
    };

    (1..=days_in_month).contains(&day)
}

fn is_leap_year(year: u32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
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
    let valid = !slug.is_empty()
        && slug != "."
        && slug != ".."
        && slug
            .chars()
            .all(|character| character.is_alphanumeric() || matches!(character, '-' | '_' | '.' | '~'));

    if !valid {
        bail!("invalid article slug: {slug:?}");
    }

    Ok(())
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

    // Exact source-file matches have priority over the rename fallback.
    for (index, article) in articles.iter().enumerate() {
        if let Some(previous) = existing_by_source.get(article.source_file.as_str()) {
            if claimed_codes.insert(previous.code.as_str()) {
                matched[index] = Some(*previous);
            }
        }
    }

    // If a file was renamed but still resolves to the same article slug, retain
    // its published short code.
    for (index, article) in articles.iter().enumerate() {
        if matched[index].is_some() {
            continue;
        }

        if let Some(previous) = existing_by_slug.get(article.target_slug.as_str()) {
            if claimed_codes.insert(previous.code.as_str()) {
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
            None => allocate_code(&article.digest, &mut unavailable_codes),
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

fn allocate_code(digest: &str, unavailable_codes: &mut BTreeSet<String>) -> String {
    for prefix_length in MIN_CODE_LENGTH..=digest.len() {
        let candidate = digest[..prefix_length].to_owned();
        if unavailable_codes.insert(candidate.clone()) {
            return candidate;
        }
    }

    for suffix in 2usize.. {
        let candidate = format!("{digest}-{suffix}");
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
    let valid_prefix = (MIN_CODE_LENGTH..=SHA256_HEX_LENGTH).contains(&code.len())
        && is_lower_hex(code);

    let valid_suffixed = code.rsplit_once('-').is_some_and(|(digest, suffix)| {
        digest.len() == SHA256_HEX_LENGTH
            && is_lower_hex(digest)
            && suffix
                .parse::<usize>()
                .is_ok_and(|number| number >= 2)
    });

    if !valid_prefix && !valid_suffixed {
        bail!("invalid short-link code: {code:?}");
    }

    Ok(())
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

fn write_redirect_page(short_root: &Path, record: &ShortLinkRecord) -> Result<()> {
    validate_code(&record.code)?;
    validate_slug(&record.target_slug)?;

    let redirect_dir = short_root.join(&record.code);
    ensure_managed_directory(&redirect_dir)?;

    let redirect_path = redirect_dir.join("index.html");
    reject_symlink_or_directory(&redirect_path)?;

    let target_path = format!("/articles/{}/", record.target_slug);
    let redirect_html = render_redirect_html(&target_path);

    fs::write(&redirect_path, redirect_html)
        .with_context(|| format!("failed to write {}", redirect_path.display()))
}

fn ensure_managed_directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            bail!("refusing to use symlinked directory {}", path.display())
        }
        Ok(metadata) if !metadata.is_dir() => {
            bail!("{} exists but is not a directory", path.display())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => fs::create_dir_all(path)
            .with_context(|| format!("failed to create {}", path.display())),
        Err(error) => Err(error).with_context(|| format!("failed to inspect {}", path.display())),
    }
}

fn reject_symlink_or_directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            bail!("refusing to overwrite symlink {}", path.display())
        }
        Ok(metadata) if metadata.is_dir() => {
            bail!("{} exists but is a directory", path.display())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("failed to inspect {}", path.display())),
    }
}

fn remove_redirect_directory(short_root: &Path, code: &str) -> Result<()> {
    validate_code(code)?;
    let path = short_root.join(code);

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
  <title>Redirecting…</title>\n\
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
    if !path.exists() {
        return Ok(ShortLinkManifest::default());
    }

    let json = fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let manifest: ShortLinkManifest = serde_json::from_str(&json)
        .with_context(|| format!("failed to parse {}", path.display()))?;

    validate_manifest(&manifest)
        .with_context(|| format!("invalid short-link manifest {}", path.display()))?;

    Ok(manifest)
}

fn save_manifest(path: &Path, manifest: &ShortLinkManifest) -> Result<()> {
    validate_manifest(manifest)?;

    if let Some(parent) = path.parent() {
        ensure_managed_directory(parent)?;
    }

    reject_symlink_or_directory(path)?;

    let mut json = serde_json::to_string_pretty(manifest)
        .context("failed to serialize short-link manifest")?;
    json.push('\n');

    fs::write(path, json).with_context(|| format!("failed to write {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::{
        assign_short_link_codes, digest_source_file_name, extract_slug_from_markdown,
        fallback_slug_from_file_name, generate_short_links, orphaned_codes, render_redirect_html,
        validate_manifest, ActiveArticle, ShortLinkManifest, ShortLinkRecord,
    };
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn extracts_explicit_slug_from_zola_front_matter() {
        let markdown = "+++\nslug = \"kitauji-power-play\"\ntitle = \"Title\"\n+++\nbody\n";

        assert_eq!(
            extract_slug_from_markdown(markdown).unwrap().as_deref(),
            Some("kitauji-power-play")
        );
    }

    #[test]
    fn does_not_treat_nested_slug_as_page_slug() {
        let markdown = "+++\ntitle = \"Title\"\n[extra]\nslug = \"nested\"\n+++\nbody\n";

        assert_eq!(extract_slug_from_markdown(markdown).unwrap(), None);
    }

    #[test]
    fn rejects_unterminated_front_matter() {
        let markdown = "+++\nslug = \"daxue\"\n";

        assert!(extract_slug_from_markdown(markdown).is_err());
    }

    #[test]
    fn falls_back_to_slug_tail_from_article_file_name() {
        assert_eq!(
            fallback_slug_from_file_name("2026-05-25-daxue.md").unwrap(),
            "daxue"
        );
    }

    #[test]
    fn validates_calendar_date_in_article_file_name() {
        assert!(fallback_slug_from_file_name("2026-02-29-invalid.md").is_err());
        assert!(fallback_slug_from_file_name("2024-02-29-valid.md").is_ok());
        assert!(fallback_slug_from_file_name("1-05-25-invalid.md").is_err());
    }

    #[test]
    fn reuses_existing_code_for_known_source_file() {
        let active = vec![article("2026-05-25-daxue.md", "daxue")];
        let existing = manifest(vec![record(
            "2026-05-25-daxue.md",
            "daxue",
            "abcde",
        )]);

        let assignment = assign_short_link_codes(&active, &existing).unwrap();

        assert_eq!(assignment.reused, 1);
        assert_eq!(assignment.records[0].code, "abcde");
    }

    #[test]
    fn reuses_existing_code_after_source_file_rename() {
        let active = vec![article("2026-05-25-renamed.md", "daxue")];
        let existing = manifest(vec![record(
            "2026-05-25-daxue.md",
            "daxue",
            "abcde",
        )]);

        let assignment = assign_short_link_codes(&active, &existing).unwrap();

        assert_eq!(assignment.reused, 1);
        assert_eq!(assignment.records[0].code, "abcde");
        assert_eq!(assignment.records[0].source_file, "2026-05-25-renamed.md");
    }

    #[test]
    fn lengthens_prefix_for_digest_collision_without_moving_old_code() {
        let active = vec![
            ActiveArticle {
                source_file: "2026-05-25-daxue.md".to_owned(),
                target_slug: "daxue".to_owned(),
                digest: "abcde11111111111111111111111111111111111111111111111111111111111"
                    .to_owned(),
            },
            ActiveArticle {
                source_file: "2026-05-26-daxue2.md".to_owned(),
                target_slug: "daxue-2".to_owned(),
                digest: "abcde22222222222222222222222222222222222222222222222222222222222"
                    .to_owned(),
            },
        ];
        let existing = ShortLinkManifest {
            records: vec![ShortLinkRecord {
                source_file: active[0].source_file.clone(),
                target_slug: active[0].target_slug.clone(),
                code: "abcde".to_owned(),
                digest: active[0].digest.clone(),
            }],
            retired_codes: BTreeSet::new(),
        };

        let assignment = assign_short_link_codes(&active, &existing).unwrap();

        assert_eq!(assignment.records[0].code, "abcde");
        assert_eq!(assignment.records[1].code, "abcde2");
    }

    #[test]
    fn rejects_unsafe_manifest_code() {
        let manifest = ShortLinkManifest {
            records: vec![ShortLinkRecord {
                source_file: "2026-05-25-daxue.md".to_owned(),
                target_slug: "daxue".to_owned(),
                code: "../../outside".to_owned(),
                digest: digest_source_file_name("2026-05-25-daxue.md"),
            }],
            retired_codes: BTreeSet::new(),
        };

        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn rejects_duplicate_manifest_codes() {
        let manifest = manifest(vec![
            record("2026-05-25-daxue.md", "daxue", "abcde"),
            record("2026-05-26-other.md", "other", "abcde"),
        ]);

        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn renders_meta_refresh_and_js_redirect_html() {
        let html = render_redirect_html("/articles/daxue/");

        assert!(html.contains(r#"<meta name="robots" content="noindex">"#));
        assert!(html.contains(r#"<meta http-equiv="refresh" content="0; url=/articles/daxue/">"#));
        assert!(html.contains(r#"<link rel="canonical" href="/articles/daxue/">"#));
        assert!(html.contains(r#"window.location.replace("/articles/daxue/")"#));
        assert!(html.contains(r#"<a href="/articles/daxue/">/articles/daxue/</a>"#));
    }

    #[test]
    fn reports_codes_missing_from_active_assignment() {
        let managed = vec![
            record("2026-05-25-daxue.md", "daxue", "abcde"),
            record("2026-05-20-old.md", "old", "fffff"),
        ];
        let active = vec![record("2026-05-25-daxue.md", "daxue", "abcde")];

        assert_eq!(orphaned_codes(&managed, &active), vec!["fffff"]);
    }

    #[test]
    fn generates_manifest_in_requested_cache_path_and_redirect_pages() {
        let fixture = TestFixture::new("short-links");
        fixture.write(
            "content/articles/2026-05-25-daxue.md",
            "+++\nslug = \"daxue\"\n+++\nbody\n",
        );
        fixture.write(
            "public/search_index.zh.json",
            r#"[{"url":"/articles/daxue/","title":"daxue"}]"#,
        );
        fixture.write("public/articles/daxue/index.html", "<html>daxue</html>");

        let manifest_path = fixture.root.join("static/_cache/short-links.json");
        let report = generate_short_links(
            &fixture.root.join("content/articles"),
            &fixture.root.join("public"),
            &manifest_path,
        )
        .unwrap();

        assert_eq!(report.total, 1);
        assert_eq!(report.created, 1);
        assert_eq!(report.reused, 0);
        assert_eq!(report.removed, 0);

        let manifest: ShortLinkManifest =
            serde_json::from_str(&fixture.read("static/_cache/short-links.json")).unwrap();
        assert_eq!(manifest.records.len(), 1);
        assert_eq!(manifest.records[0].code.len(), 5);

        let redirect = fixture.read(&format!(
            "public/s/{}/index.html",
            manifest.records[0].code
        ));
        assert!(redirect.contains("/articles/daxue/"));
    }

    #[test]
    fn removes_and_retires_orphaned_redirect_code() {
        let fixture = TestFixture::new("orphan-cleanup");
        fixture.write(
            "content/articles/2026-05-25-daxue.md",
            "+++\nslug = \"daxue\"\n+++\nbody\n",
        );
        fixture.write(
            "public/search_index.zh.json",
            r#"[{"url":"/articles/daxue/","title":"daxue"}]"#,
        );
        fixture.write("public/articles/daxue/index.html", "<html>daxue</html>");

        let old_record = record("2026-05-20-old.md", "old", "fffff");
        fixture.write(
            "static/_cache/short-links.json",
            &serde_json::to_string_pretty(&manifest(vec![old_record])).unwrap(),
        );
        fixture.write("public/s/fffff/index.html", "old redirect");

        let report = generate_short_links(
            &fixture.root.join("content/articles"),
            &fixture.root.join("public"),
            &fixture.root.join("static/_cache/short-links.json"),
        )
        .unwrap();

        assert_eq!(report.removed, 1);
        assert!(!fixture.root.join("public/s/fffff").exists());

        let manifest: ShortLinkManifest =
            serde_json::from_str(&fixture.read("static/_cache/short-links.json")).unwrap();
        assert!(manifest.retired_codes.contains("fffff"));
    }

    #[test]
    fn slugifies_fallback_tail_when_raw_target_is_not_built() {
        let fixture = TestFixture::new("slugified-fallback");
        fixture.write(
            "content/articles/2024-04-05-Omae’s16th.md",
            "+++\ntitle = \"Title\"\n+++\nbody\n",
        );
        fixture.write(
            "public/search_index.zh.json",
            r#"[{"url":"/articles/omae-s16th/","title":"omae"}]"#,
        );
        fixture.write("public/articles/omae-s16th/index.html", "<html>omae</html>");

        generate_short_links(
            &fixture.root.join("content/articles"),
            &fixture.root.join("public"),
            &fixture.root.join("static/_cache/short-links.json"),
        )
        .unwrap();

        let manifest: ShortLinkManifest =
            serde_json::from_str(&fixture.read("static/_cache/short-links.json")).unwrap();
        assert_eq!(manifest.records[0].target_slug, "omae-s16th");
    }

    fn article(source_file: &str, target_slug: &str) -> ActiveArticle {
        ActiveArticle {
            source_file: source_file.to_owned(),
            target_slug: target_slug.to_owned(),
            digest: digest_source_file_name(source_file),
        }
    }

    fn record(source_file: &str, target_slug: &str, code: &str) -> ShortLinkRecord {
        ShortLinkRecord {
            source_file: source_file.to_owned(),
            target_slug: target_slug.to_owned(),
            code: code.to_owned(),
            digest: digest_source_file_name(source_file),
        }
    }

    fn manifest(records: Vec<ShortLinkRecord>) -> ShortLinkManifest {
        ShortLinkManifest {
            records,
            retired_codes: BTreeSet::new(),
        }
    }

    struct TestFixture {
        root: PathBuf,
    }

    impl TestFixture {
        fn new(label: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "hibikilogy-short-links-{label}-{}-{unique}",
                std::process::id(),
            ));
            fs::create_dir_all(&root).unwrap();
            Self { root }
        }

        fn write(&self, relative: &str, contents: &str) {
            let path = self.root.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(path, contents).unwrap();
        }

        fn read(&self, relative: &str) -> String {
            fs::read_to_string(self.root.join(relative)).unwrap()
        }
    }

    impl Drop for TestFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
