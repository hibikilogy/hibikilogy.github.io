use anyhow::{bail, Context, Result};
use clap::Parser;
use hibikilogy_tools::article_source::parse_article_file_name;
use hibikilogy_tools::content_routes::{
    ensure_built_page_exists, normalize_route_path, parse_page_front_matter,
    slugify_path_component, validate_slug,
};
#[cfg(test)]
use hibikilogy_tools::managed_fs::atomic_sidecar_path as manifest_sidecar_path;
use hibikilogy_tools::managed_fs::{
    ensure_directory_beneath, recover_atomic_file, reject_symlink_or_directory, write_atomic,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

const DEFAULT_MANIFEST_PATH: &str = "target/deploy-markdown-manifest.json";

#[derive(Debug, Parser)]
#[command(about = "Copy routable Markdown sources into a built Zola site.")]
struct Args {
    #[arg(long, default_value = "content/articles")]
    articles_dir: PathBuf,
    #[arg(long, default_value = "content/docs")]
    docs_dir: PathBuf,
    #[arg(long, default_value = "public")]
    site_root: PathBuf,
    #[arg(long, default_value = "config.toml")]
    config: PathBuf,
    #[arg(long)]
    base_url: Option<String>,
    #[arg(long)]
    source_repository: Option<String>,
    #[arg(long)]
    source_revision: Option<String>,
    #[arg(long)]
    repository_root: Option<PathBuf>,
    #[arg(long)]
    allow_dirty_source: bool,
    #[arg(long, default_value = DEFAULT_MANIFEST_PATH)]
    manifest: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ContentKind {
    Article,
    Document,
}

impl ContentKind {
    fn section(self) -> &'static str {
        match self {
            Self::Article => "articles",
            Self::Document => "docs",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ExportSource {
    source_path: PathBuf,
    source_relative: String,
    route: String,
    output_relative: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct ManifestRecord {
    source_path: String,
    route: String,
    output_path: String,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct MarkdownManifest {
    #[serde(default)]
    records: Vec<ManifestRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pending_records: Option<Vec<ManifestRecord>>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct ExportReport {
    written: usize,
    removed: usize,
}

#[derive(Debug, Clone, Copy)]
struct ExportOptions<'a> {
    repository_root: &'a Path,
    site_root: &'a Path,
    manifest_path: &'a Path,
    base_url: &'a str,
    repository: &'a str,
    revision: &'a str,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let repository_root = resolve_repository_root(args.repository_root.as_deref())?;
    let base_url = match args.base_url {
        Some(base_url) => normalize_base_url(&base_url)?,
        None => load_base_url(&args.config)?,
    };
    let repository = resolve_repository(args.source_repository.as_deref(), &repository_root)?;
    let revision = resolve_revision(args.source_revision.as_deref(), &repository_root)?;
    if !args.allow_dirty_source {
        ensure_sources_match_revision(
            &repository_root,
            &revision,
            &[&args.articles_dir, &args.docs_dir],
        )?;
    }
    let report = export_markdown(
        &args.articles_dir,
        &args.docs_dir,
        ExportOptions {
            repository_root: &repository_root,
            site_root: &args.site_root,
            manifest_path: &args.manifest,
            base_url: &base_url,
            repository: &repository,
            revision: &revision,
        },
    )?;

    println!(
        "wrote {} Markdown route(s) and removed {} orphaned file(s); manifest: {}",
        report.written,
        report.removed,
        args.manifest.display(),
    );
    Ok(())
}

fn export_markdown(
    articles_dir: &Path,
    docs_dir: &Path,
    options: ExportOptions<'_>,
) -> Result<ExportReport> {
    let ExportOptions {
        repository_root,
        site_root,
        manifest_path,
        base_url,
        repository,
        revision,
    } = options;
    ensure_input_directory(articles_dir, "articles directory")?;
    ensure_input_directory(docs_dir, "docs directory")?;
    ensure_input_directory(site_root, "site root")?;
    normalize_base_url(base_url)?;
    validate_repository(repository)?;
    validate_revision(revision)?;

    let existing_manifest = load_manifest(manifest_path)?;
    let mut sources = collect_sources(
        articles_dir,
        ContentKind::Article,
        repository_root,
        site_root,
    )?;
    sources.extend(collect_sources(
        docs_dir,
        ContentKind::Document,
        repository_root,
        site_root,
    )?);
    sources.sort_unstable_by(|left, right| left.output_relative.cmp(&right.output_relative));
    validate_unique_outputs(&sources)?;
    validate_output_ownership(site_root, &sources, &existing_manifest, repository)?;

    let records = sources
        .iter()
        .map(|source| ManifestRecord {
            source_path: source.source_relative.clone(),
            route: format!("/{}", source.route),
            output_path: source.output_relative.clone(),
        })
        .collect::<Vec<_>>();

    let active_outputs = sources
        .iter()
        .map(|source| source.output_relative.as_str())
        .collect::<BTreeSet<_>>();
    let orphaned = manifest_records(&existing_manifest)
        .filter(|record| !active_outputs.contains(record.output_path.as_str()))
        .map(|record| record.output_path.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    save_manifest(
        manifest_path,
        &MarkdownManifest {
            records: existing_manifest.records.clone(),
            pending_records: Some(records.clone()),
        },
    )?;

    for source in &sources {
        write_export(source, site_root, base_url, repository, revision)?;
    }
    for output in &orphaned {
        remove_managed_output(site_root, output)?;
    }

    let manifest = MarkdownManifest {
        records,
        pending_records: None,
    };
    save_manifest(manifest_path, &manifest)?;

    Ok(ExportReport {
        written: sources.len(),
        removed: orphaned.len(),
    })
}

fn collect_sources(
    content_dir: &Path,
    kind: ContentKind,
    repository_root: &Path,
    site_root: &Path,
) -> Result<Vec<ExportSource>> {
    let mut markdown_paths = Vec::new();
    for entry in fs::read_dir(content_dir)
        .with_context(|| format!("failed to read {}", content_dir.display()))?
    {
        let entry = entry
            .with_context(|| format!("failed to read an entry in {}", content_dir.display()))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .with_context(|| format!("failed to inspect {}", path.display()))?;

        if file_type.is_symlink() {
            if path.extension() == Some(OsStr::new("md")) {
                bail!("Markdown symlinks are not supported: {}", path.display());
            }
            continue;
        }
        if file_type.is_file()
            && path.extension() == Some(OsStr::new("md"))
            && path.file_name() != Some(OsStr::new("_index.md"))
        {
            markdown_paths.push(path);
        }
    }
    markdown_paths.sort_unstable();

    markdown_paths
        .into_iter()
        .map(|path| resolve_source(&path, kind, repository_root, site_root))
        .collect()
}

fn resolve_source(
    path: &Path,
    kind: ContentKind,
    repository_root: &Path,
    site_root: &Path,
) -> Result<ExportSource> {
    let markdown =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let front_matter = parse_page_front_matter(&markdown)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .with_context(|| format!("source filename is not valid UTF-8: {}", path.display()))?;
    let stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .with_context(|| format!("source file stem is not valid UTF-8: {}", path.display()))?;

    let route = if let Some(explicit_path) = front_matter.path {
        let route = normalize_route_path(&explicit_path)
            .with_context(|| format!("invalid path in {file_name}"))?;
        ensure_built_page_exists(site_root, &route)
            .with_context(|| format!("missing built target for {file_name}"))?;
        route
    } else {
        let candidate = match front_matter.slug {
            Some(slug) => {
                let slug = slug.to_lowercase();
                validate_slug(&slug).with_context(|| format!("invalid slug in {file_name}"))?;
                slug
            }
            None => fallback_slug(file_name, stem, kind)
                .with_context(|| format!("failed to derive route for {file_name}"))?,
        };
        resolve_section_route(site_root, kind.section(), &candidate)
            .with_context(|| format!("missing built target for {file_name}"))?
    };
    let output_relative = format!("{route}.md");
    validate_managed_output(&output_relative)?;

    Ok(ExportSource {
        source_path: path.to_path_buf(),
        source_relative: repository_relative_path(repository_root, path)?,
        route,
        output_relative,
    })
}

fn fallback_slug(file_name: &str, stem: &str, kind: ContentKind) -> Result<String> {
    let slug = match kind {
        ContentKind::Article => parse_article_file_name(file_name)?.slug_tail,
        ContentKind::Document => stem.to_lowercase(),
    };
    if validate_slug(&slug).is_err() && slugify_path_component(&slug).is_empty() {
        bail!("invalid fallback slug: {slug:?}");
    }
    Ok(slug)
}

fn resolve_section_route(site_root: &Path, section: &str, candidate: &str) -> Result<String> {
    let raw_route = format!("{section}/{candidate}");
    if ensure_built_page_exists(site_root, &raw_route).is_ok() {
        return Ok(raw_route);
    }

    let slugified = slugify_path_component(candidate);
    validate_slug(&slugified)?;
    let slugified_route = format!("{section}/{slugified}");
    ensure_built_page_exists(site_root, &slugified_route)?;
    Ok(slugified_route)
}

fn validate_unique_outputs(sources: &[ExportSource]) -> Result<()> {
    let mut by_output = BTreeMap::new();
    for source in sources {
        if let Some(existing) = by_output.insert(&source.output_relative, &source.source_relative) {
            bail!(
                "multiple Markdown sources resolve to {}: {} and {}",
                source.output_relative,
                existing,
                source.source_relative,
            );
        }
    }
    Ok(())
}

fn validate_output_ownership(
    site_root: &Path,
    sources: &[ExportSource],
    existing_manifest: &MarkdownManifest,
    repository: &str,
) -> Result<()> {
    let managed = manifest_records(existing_manifest)
        .map(|record| record.output_path.as_str())
        .collect::<BTreeSet<_>>();

    for source in sources {
        let output = site_root.join(path_from_slash(&source.output_relative));
        match fs::symlink_metadata(&output) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                bail!("refusing to overwrite symlink {}", output.display())
            }
            Ok(metadata) if !metadata.is_file() => {
                bail!("{} is not a regular file", output.display())
            }
            Ok(_) if !managed.contains(source.output_relative.as_str()) => {
                let contents = fs::read_to_string(&output)
                    .with_context(|| format!("failed to read {}", output.display()))?;
                if !is_generated_output_for_source(&contents, source, repository) {
                    bail!(
                        "refusing to overwrite unmanaged Markdown output {}",
                        output.display()
                    )
                }
            }
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("failed to inspect {}", output.display()))
            }
        }
    }
    Ok(())
}

fn write_export(
    source: &ExportSource,
    site_root: &Path,
    base_url: &str,
    repository: &str,
    revision: &str,
) -> Result<()> {
    let markdown = fs::read_to_string(&source.source_path)
        .with_context(|| format!("failed to read {}", source.source_path.display()))?;
    let source_url = format!(
        "https://github.com/{repository}/blob/{revision}/{}",
        percent_encode_path(&source.source_relative),
    );
    let page_url = format!("{}/{}", base_url.trim_end_matches('/'), source.route);
    let annotated = annotate_markdown(&markdown, &source_url, &page_url);
    let output_path = site_root.join(path_from_slash(&source.output_relative));

    if let Some(parent) = output_path.parent() {
        ensure_directory_beneath(site_root, parent)?;
    }
    reject_symlink_or_directory(&output_path)?;
    fs::write(&output_path, annotated)
        .with_context(|| format!("failed to write {}", output_path.display()))
}

fn annotate_markdown(markdown: &str, source_url: &str, page_url: &str) -> String {
    let (bom, without_bom) = markdown
        .strip_prefix('\u{feff}')
        .map_or(("", markdown), |rest| ("\u{feff}", rest));
    let opening = if without_bom.starts_with("+++\r\n") {
        Some(("+++\r\n", "\r\n"))
    } else if without_bom.starts_with("+++\n") {
        Some(("+++\n", "\n"))
    } else {
        None
    };

    match opening {
        Some((opening, newline)) => {
            let rest = &without_bom[opening.len()..];
            format!(
                "{bom}{opening}# Source: {source_url}{newline}# Page: {page_url}{newline}{rest}"
            )
        }
        None => format!("<!-- Source: {source_url} -->\n<!-- Page: {page_url} -->\n\n{markdown}"),
    }
}

fn load_base_url(config_path: &Path) -> Result<String> {
    let config = fs::read_to_string(config_path)
        .with_context(|| format!("failed to read {}", config_path.display()))?;
    let parsed: toml::Value = toml::from_str(&config)
        .with_context(|| format!("failed to parse {}", config_path.display()))?;
    let base_url = parsed
        .get("base_url")
        .and_then(toml::Value::as_str)
        .with_context(|| format!("base_url is missing from {}", config_path.display()))?;
    normalize_base_url(base_url)
}

fn normalize_base_url(base_url: &str) -> Result<String> {
    let base_url = base_url.trim().trim_end_matches('/');
    if !(base_url.starts_with("https://") || base_url.starts_with("http://")) {
        bail!("base URL must start with http:// or https://: {base_url:?}");
    }
    if base_url.contains(['\r', '\n', '#', '?']) {
        bail!("base URL contains unsupported characters: {base_url:?}");
    }
    Ok(base_url.to_owned())
}

fn resolve_repository(explicit: Option<&str>, repository_root: &Path) -> Result<String> {
    let repository = if let Some(explicit) = explicit {
        explicit.to_owned()
    } else if let Ok(repository) = env::var("GITHUB_REPOSITORY") {
        repository
    } else {
        let remote = git_output(repository_root, &["config", "--get", "remote.origin.url"])?;
        repository_from_remote(&remote)?
    };
    validate_repository(&repository)?;
    Ok(repository)
}

fn resolve_revision(explicit: Option<&str>, repository_root: &Path) -> Result<String> {
    let github_sha = env::var("GITHUB_SHA").ok();
    let head = git_output(repository_root, &["rev-parse", "HEAD"])?;
    let revision = select_revision(explicit, github_sha.as_deref(), &head);
    validate_revision(&revision)?;
    let revision = revision.to_lowercase();
    git_output(
        repository_root,
        &["cat-file", "-e", &format!("{revision}^{{commit}}")],
    )
    .with_context(|| format!("source revision is not a local Git commit: {revision}"))?;
    Ok(revision)
}

fn manifest_records(manifest: &MarkdownManifest) -> impl Iterator<Item = &ManifestRecord> {
    manifest.records.iter().chain(
        manifest
            .pending_records
            .iter()
            .flat_map(|records| records.iter()),
    )
}

fn is_generated_output_for_source(markdown: &str, source: &ExportSource, repository: &str) -> bool {
    let Some((source_url, page_url)) = generated_metadata(markdown) else {
        return false;
    };
    let prefix = format!("https://github.com/{repository}/blob/");
    let Some(reference) = source_url.strip_prefix(&prefix) else {
        return false;
    };
    let Some((revision, encoded_path)) = reference.split_once('/') else {
        return false;
    };
    validate_revision(revision).is_ok()
        && encoded_path == percent_encode_path(&source.source_relative)
        && (page_url.starts_with("https://") || page_url.starts_with("http://"))
        && page_url
            .trim_end_matches('/')
            .ends_with(&format!("/{}", source.route))
}

fn generated_metadata(markdown: &str) -> Option<(&str, &str)> {
    let markdown = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    let mut lines = markdown.lines();
    let first = lines.next()?;
    if first == "+++" {
        let source = lines.next()?.strip_prefix("# Source: ")?;
        let page = lines.next()?.strip_prefix("# Page: ")?;
        Some((source, page))
    } else {
        let source = first.strip_prefix("<!-- Source: ")?.strip_suffix(" -->")?;
        let page = lines
            .next()?
            .strip_prefix("<!-- Page: ")?
            .strip_suffix(" -->")?;
        Some((source, page))
    }
}

fn select_revision(explicit: Option<&str>, github_sha: Option<&str>, head: &str) -> String {
    explicit.or(github_sha).unwrap_or(head).to_owned()
}

fn resolve_repository_root(explicit: Option<&Path>) -> Result<PathBuf> {
    let root = match explicit {
        Some(root) => root.to_path_buf(),
        None => PathBuf::from(git_output(
            Path::new("."),
            &["rev-parse", "--show-toplevel"],
        )?),
    };
    root.canonicalize()
        .with_context(|| format!("failed to resolve repository root {}", root.display()))
}

fn git_output(repository_root: &Path, arguments: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .current_dir(repository_root)
        .args(arguments)
        .output()
        .with_context(|| format!("failed to run git {}", arguments.join(" ")))?;
    if !output.status.success() {
        bail!("git {} failed", arguments.join(" "));
    }
    String::from_utf8(output.stdout)
        .context("git output was not valid UTF-8")
        .map(|output| output.trim().to_owned())
}

fn ensure_sources_match_revision(
    repository_root: &Path,
    revision: &str,
    source_roots: &[&Path],
) -> Result<()> {
    let relative_roots = source_roots
        .iter()
        .map(|path| repository_relative_path(repository_root, path))
        .collect::<Result<Vec<_>>>()?;
    let mut diff_arguments = vec!["diff", "--quiet", revision, "--"];
    diff_arguments.extend(relative_roots.iter().map(String::as_str));
    let diff = Command::new("git")
        .current_dir(repository_root)
        .args(&diff_arguments)
        .status()
        .context("failed to compare Markdown sources with the selected revision")?;
    if !diff.success() {
        bail!(
            "Markdown sources differ from commit {revision}; commit them or pass --allow-dirty-source"
        );
    }

    let mut untracked_arguments = vec!["ls-files", "--others", "--exclude-standard", "--"];
    untracked_arguments.extend(relative_roots.iter().map(String::as_str));
    let untracked = git_output(repository_root, &untracked_arguments)?;
    if !untracked.is_empty() {
        bail!(
            "untracked Markdown sources are not present in commit {revision}; commit them or pass --allow-dirty-source"
        );
    }
    Ok(())
}

fn repository_from_remote(remote: &str) -> Result<String> {
    let remote = remote.trim().trim_end_matches('/').trim_end_matches(".git");
    let repository = if let Some(path) = remote.strip_prefix("git@github.com:") {
        path
    } else if let Some(path) = remote.strip_prefix("https://github.com/") {
        path
    } else if let Some(path) = remote.strip_prefix("ssh://git@github.com/") {
        path
    } else {
        bail!("origin is not a supported GitHub remote: {remote:?}");
    };
    validate_repository(repository)?;
    Ok(repository.to_owned())
}

fn validate_repository(repository: &str) -> Result<()> {
    let mut parts = repository.split('/');
    let (Some(owner), Some(name), None) = (parts.next(), parts.next(), parts.next()) else {
        bail!("GitHub repository must be owner/name: {repository:?}");
    };
    let valid_part = |part: &str| {
        !part.is_empty()
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    };
    if !valid_part(owner) || !valid_part(name) {
        bail!("invalid GitHub repository: {repository:?}");
    }
    Ok(())
}

fn validate_revision(revision: &str) -> Result<()> {
    if revision.len() != 40 || !revision.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!("source revision must be a full 40-character Git commit SHA");
    }
    Ok(())
}

fn percent_encode_path(path: &str) -> String {
    let mut encoded = String::with_capacity(path.len());
    for byte in path.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                encoded.push(byte as char)
            }
            _ => {
                use std::fmt::Write as _;
                write!(&mut encoded, "%{byte:02X}").expect("writing to a String cannot fail");
            }
        }
    }
    encoded
}

fn repository_relative_path(repository_root: &Path, path: &Path) -> Result<String> {
    let root = repository_root
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", repository_root.display()))?;
    let path = path
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", path.display()))?;
    let relative = path.strip_prefix(&root).with_context(|| {
        format!(
            "{} is outside repository root {}",
            path.display(),
            root.display()
        )
    })?;
    let mut parts = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy()),
            _ => bail!("invalid repository-relative path: {}", relative.display()),
        }
    }
    if parts.is_empty() {
        bail!("repository-relative path must not be empty");
    }
    Ok(parts.join("/"))
}

fn path_from_slash(path: &str) -> PathBuf {
    path.split('/').collect()
}

fn ensure_input_directory(path: &Path, label: &str) -> Result<()> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("failed to inspect {label} {}", path.display()))?;
    if !metadata.is_dir() {
        bail!("{label} {} is not a directory", path.display());
    }
    Ok(())
}

fn validate_managed_output(output: &str) -> Result<()> {
    if !(output.starts_with("articles/") || output.starts_with("docs/")) || !output.ends_with(".md")
    {
        bail!("refusing to manage output outside articles/docs: {output:?}");
    }
    let path = Path::new(output);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("invalid managed output path: {output:?}");
    }
    Ok(())
}

fn remove_managed_output(site_root: &Path, output: &str) -> Result<()> {
    validate_managed_output(output)?;
    let path = site_root.join(path_from_slash(output));
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            bail!("refusing to remove symlink {}", path.display())
        }
        Ok(metadata) if metadata.is_file() => {
            fs::remove_file(&path).with_context(|| format!("failed to remove {}", path.display()))
        }
        Ok(_) => bail!("{} is not a regular file", path.display()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("failed to inspect {}", path.display())),
    }
}

fn load_manifest(path: &Path) -> Result<MarkdownManifest> {
    recover_atomic_file(path)?;
    if !path.exists() {
        return Ok(MarkdownManifest::default());
    }
    let json =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let manifest: MarkdownManifest = serde_json::from_str(&json)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn validate_manifest(manifest: &MarkdownManifest) -> Result<()> {
    for records in std::iter::once(&manifest.records).chain(manifest.pending_records.iter()) {
        let mut outputs = BTreeSet::new();
        for record in records {
            validate_managed_output(&record.output_path)?;
            if !outputs.insert(&record.output_path) {
                bail!(
                    "duplicate output in Markdown manifest: {}",
                    record.output_path
                );
            }
        }
    }
    Ok(())
}

fn save_manifest(path: &Path, manifest: &MarkdownManifest) -> Result<()> {
    validate_manifest(manifest)?;
    let mut json =
        serde_json::to_string_pretty(manifest).context("failed to serialize Markdown manifest")?;
    json.push('\n');
    write_atomic(path, json.as_bytes())
        .with_context(|| format!("failed to write {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::{
        annotate_markdown, export_markdown, repository_from_remote, repository_relative_path,
        select_revision, ManifestRecord, MarkdownManifest,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    const REVISION: &str = "0123456789abcdef0123456789abcdef01234567";

    #[test]
    fn inserts_comments_inside_front_matter_without_changing_body() {
        let markdown = "+++\ntitle = \"标题\"\n+++\n\n正文\n";
        let annotated = annotate_markdown(
            markdown,
            "https://github.com/owner/repo/blob/sha/content/page.md",
            "https://example.com/docs/page",
        );
        assert!(annotated.starts_with("+++\n# Source: https://github.com/"));
        assert!(annotated.contains("# Page: https://example.com/docs/page\ntitle = \"标题\""));
        assert!(annotated.ends_with("+++\n\n正文\n"));
    }

    #[test]
    fn generates_article_and_document_routes_with_effective_base_url() {
        let fixture = Fixture::new("routes");
        fixture.write(
            "content/articles/2026-02-12-source-name.md",
            "+++\nslug = \"canonical-name\"\n+++\n文章正文\n",
        );
        fixture.write(
            "content/docs/guide.md",
            "+++\ntitle = \"Guide\"\n+++\nDoc body\n",
        );
        fixture.write("public/articles/canonical-name/index.html", "article");
        fixture.write("public/docs/guide/index.html", "doc");

        let report = fixture.export("https://preview.example/").unwrap();

        assert_eq!(report.written, 2);
        let article = fixture.read("public/articles/canonical-name.md");
        assert!(article.contains(&format!(
            "# Source: https://github.com/owner/repo/blob/{REVISION}/content/articles/2026-02-12-source-name.md"
        )));
        assert!(article.contains("# Page: https://preview.example/articles/canonical-name"));
        assert!(article.contains("content/articles/2026-02-12-source-name.md"));
        assert!(article.ends_with("+++\n文章正文\n"));
        assert!(fixture.root.join("public/docs/guide.md").is_file());
    }

    #[test]
    fn slugifies_fallback_and_percent_encodes_source_url() {
        let fixture = Fixture::new("slugify");
        fixture.write(
            "content/articles/2024-04-05-Omae’s16th.md",
            "+++\ntitle = \"Title\"\n+++\nbody\n",
        );
        fixture.write("public/articles/omae-s16th/index.html", "article");

        fixture.export("https://example.com").unwrap();
        let output = fixture.read("public/articles/omae-s16th.md");
        assert!(output.contains("Omae%E2%80%99s16th.md"));
    }

    #[test]
    fn removes_only_orphaned_manifest_outputs() {
        let fixture = Fixture::new("cleanup");
        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nbody\n",
        );
        fixture.write("public/articles/current/index.html", "article");
        fixture.write("public/articles/old.md", "old generated");
        fixture.write("public/articles/manual.md", "manual");
        let manifest = MarkdownManifest {
            records: vec![ManifestRecord {
                source_path: "content/articles/old.md".to_owned(),
                route: "/articles/old".to_owned(),
                output_path: "articles/old.md".to_owned(),
            }],
            pending_records: None,
        };
        fixture.write(
            "static/_cache/deploy-markdown.json",
            &serde_json::to_string(&manifest).unwrap(),
        );

        let report = fixture.export("https://example.com").unwrap();

        assert_eq!(report.removed, 1);
        assert!(!fixture.root.join("public/articles/old.md").exists());
        assert!(fixture.root.join("public/articles/manual.md").is_file());
    }

    #[test]
    fn refuses_to_overwrite_unmanaged_markdown_output() {
        let fixture = Fixture::new("unmanaged-output");
        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nbody\n",
        );
        fixture.write("public/articles/current/index.html", "article");
        fixture.write("public/articles/current.md", "manual");

        assert!(fixture.export("https://example.com").is_err());
        assert_eq!(fixture.read("public/articles/current.md"), "manual");
    }

    #[test]
    fn fails_when_built_target_is_missing() {
        let fixture = Fixture::new("missing-target");
        fixture.write(
            "content/articles/2026-02-12-missing.md",
            "+++\ntitle = \"Missing\"\n+++\nbody\n",
        );
        assert!(fixture.export("https://example.com").is_err());
    }

    #[test]
    fn parses_supported_git_remotes() {
        assert_eq!(
            repository_from_remote("git@github.com:owner/repo.git").unwrap(),
            "owner/repo"
        );
        assert_eq!(
            repository_from_remote("https://github.com/owner/repo.git").unwrap(),
            "owner/repo"
        );
    }

    #[test]
    fn reclaims_generated_output_when_manifest_was_removed() {
        let fixture = Fixture::new("missing-manifest");
        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nbody\n",
        );
        fixture.write("public/articles/current/index.html", "article");
        fixture.export("https://example.com").unwrap();
        fs::remove_file(fixture.manifest_path()).unwrap();

        fixture.export("https://preview.example").unwrap();

        let output = fixture.read("public/articles/current.md");
        assert!(output.contains("# Page: https://preview.example/articles/current"));
    }

    #[test]
    fn resumes_from_pending_manifest_records() {
        let fixture = Fixture::new("pending-manifest");
        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nbody\n",
        );
        fixture.write("public/articles/current/index.html", "article");
        fixture.export("https://example.com").unwrap();
        let final_manifest: MarkdownManifest =
            serde_json::from_str(&fixture.read_manifest()).unwrap();
        fixture.write_manifest(&MarkdownManifest {
            records: Vec::new(),
            pending_records: Some(final_manifest.records),
        });

        fixture.export("https://example.com").unwrap();

        let recovered: MarkdownManifest = serde_json::from_str(&fixture.read_manifest()).unwrap();
        assert!(recovered.pending_records.is_none());
        assert_eq!(recovered.records.len(), 1);
    }

    #[test]
    fn recovers_manifest_from_interrupted_replacement_backup() {
        let fixture = Fixture::new("manifest-backup");
        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nbody\n",
        );
        fixture.write("public/articles/current/index.html", "article");
        fixture.export("https://example.com").unwrap();
        let manifest = fixture.manifest_path();
        fs::rename(&manifest, super::manifest_sidecar_path(&manifest, "bak")).unwrap();

        fixture.export("https://example.com").unwrap();

        assert!(fixture.manifest_path().is_file());
    }

    #[test]
    fn selects_revision_without_using_branch_names() {
        let head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let github = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let explicit = "cccccccccccccccccccccccccccccccccccccccc";
        assert_eq!(
            select_revision(Some(explicit), Some(github), head),
            explicit
        );
        assert_eq!(select_revision(None, Some(github), head), github);
        assert_eq!(select_revision(None, None, head), head);
    }

    #[test]
    fn rejects_sources_outside_repository_root() {
        let fixture = Fixture::new("outside-root");
        let outside = fixture.root.parent().unwrap();
        assert!(repository_relative_path(&fixture.root, outside).is_err());
    }

    #[test]
    fn detects_modified_and_untracked_markdown_sources() {
        let fixture = Fixture::new("dirty-sources");
        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nbody\n",
        );
        let revision = fixture.initialize_git();
        let roots = [
            fixture.root.join("content/articles"),
            fixture.root.join("content/docs"),
        ];
        let root_refs = roots.iter().map(PathBuf::as_path).collect::<Vec<_>>();
        assert!(super::ensure_sources_match_revision(&fixture.root, &revision, &root_refs).is_ok());

        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nchanged\n",
        );
        assert!(
            super::ensure_sources_match_revision(&fixture.root, &revision, &root_refs).is_err()
        );

        fixture.write(
            "content/articles/2026-02-12-current.md",
            "+++\nslug = \"current\"\n+++\nbody\n",
        );
        fixture.write("content/docs/untracked.md", "untracked\n");
        assert!(
            super::ensure_sources_match_revision(&fixture.root, &revision, &root_refs).is_err()
        );
    }

    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "hibikilogy-deploy-markdown-{label}-{}-{unique}",
                std::process::id(),
            ));
            fs::create_dir_all(root.join("content/articles")).unwrap();
            fs::create_dir_all(root.join("content/docs")).unwrap();
            fs::create_dir_all(root.join("public")).unwrap();
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

        fn export(&self, base_url: &str) -> anyhow::Result<super::ExportReport> {
            export_markdown(
                &self.root.join("content/articles"),
                &self.root.join("content/docs"),
                super::ExportOptions {
                    repository_root: &self.root,
                    site_root: &self.root.join("public"),
                    manifest_path: &self.manifest_path(),
                    base_url,
                    repository: "owner/repo",
                    revision: REVISION,
                },
            )
        }

        fn manifest_path(&self) -> PathBuf {
            self.root.join("static/_cache/deploy-markdown.json")
        }

        fn read_manifest(&self) -> String {
            fs::read_to_string(self.manifest_path()).unwrap()
        }

        fn write_manifest(&self, manifest: &MarkdownManifest) {
            self.write(
                "static/_cache/deploy-markdown.json",
                &serde_json::to_string(manifest).unwrap(),
            );
        }

        fn initialize_git(&self) -> String {
            for arguments in [
                vec!["init"],
                vec!["config", "user.email", "tests@example.com"],
                vec!["config", "user.name", "Hibikilogy Tests"],
                vec!["add", "content"],
                vec!["commit", "-m", "test fixture"],
            ] {
                let output = Command::new("git")
                    .current_dir(&self.root)
                    .args(arguments)
                    .output()
                    .unwrap();
                assert!(output.status.success());
            }
            let output = Command::new("git")
                .current_dir(&self.root)
                .args(["rev-parse", "HEAD"])
                .output()
                .unwrap();
            assert!(output.status.success());
            String::from_utf8(output.stdout).unwrap().trim().to_owned()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
