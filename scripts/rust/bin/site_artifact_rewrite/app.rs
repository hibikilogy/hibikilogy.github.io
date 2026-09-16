use super::cache::{
    is_fresh, load as load_cache, normalize_path, read_file_stat, save as save_cache,
    CachedFileRecord,
};
use super::config::{self, CompiledRules, FileMatcher, JsonRule};
use super::html;
use super::json;
use super::stats::RewriteStats;
use anyhow::{bail, Context, Result};
use clap::Parser;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const METADATA_CACHE: &str = "lazy-image-metadata.json";
const STATE_CACHE: &str = "artifact-rewrite-state.json";

#[derive(Debug, Parser)]
#[command(about = "Apply validated rewrite rules to generated site artifacts.")]
struct Args {
    #[arg(long, default_value = "scripts/rust/artifact-rewrite.toml")]
    rules: PathBuf,
    #[arg(long, default_value = "static/_cache")]
    cache_dir: PathBuf,
    #[arg(long)]
    check: bool,
    target_root: PathBuf,
}

struct JsonSourcePlan<'a> {
    rule: &'a JsonRule,
    selector: Option<&'a str>,
    matcher: FileMatcher,
    label: String,
}

pub(super) fn run() -> Result<()> {
    let args = Args::parse();
    let rules = config::load(&args.rules)?;
    let root = args.target_root.canonicalize().with_context(|| {
        format!(
            "failed to resolve target root {}",
            args.target_root.display()
        )
    })?;
    if !root.is_dir() {
        bail!("target root {} is not a directory", root.display());
    }
    let files = collect_files(&root)?;
    let plans = compile_json_sources(&rules)?;
    validate_matches(&rules, &plans, &files)?;
    if args.check {
        println!(
            "Validated {} rewrite rule(s) against {} generated file(s).",
            rule_count(&rules),
            files.len()
        );
        return Ok(());
    }

    let cache_path = args.cache_dir.join(METADATA_CACHE);
    let state_path = args.cache_dir.join(STATE_CACHE);
    let mut cache = load_cache(&cache_path, &state_path)?;
    let mut stats = RewriteStats::default();

    let standalone = standalone_tasks(&plans, &files);
    for (relative, file_rules) in standalone {
        let path = root.join(&relative);
        process_file(
            &path,
            &relative,
            &rules,
            &mut cache,
            &mut stats,
            |source, cache| {
                let mut current = source.to_string();
                let mut file_stats = RewriteStats::default();
                for rule in file_rules {
                    let (rewritten, stats) =
                        json::rewrite(&current, rule, &path, &root, &rules, cache)?;
                    current = rewritten;
                    file_stats.merge(stats);
                }
                Ok((current, file_stats))
            },
        )?;
    }

    let html_tasks = html_tasks(&rules, &plans, &files);
    for (relative, embedded) in html_tasks {
        let path = root.join(&relative);
        process_file(
            &path,
            &relative,
            &rules,
            &mut cache,
            &mut stats,
            |source, cache| html::rewrite(source, &path, &root, &rules, cache, &embedded),
        )?;
    }

    save_cache(&cache_path, &state_path, &cache)?;
    print_stats(&stats);
    Ok(())
}

fn process_file<F>(
    path: &Path,
    relative: &str,
    rules: &CompiledRules,
    cache: &mut super::cache::MetadataCache,
    total: &mut RewriteStats,
    rewrite: F,
) -> Result<()>
where
    F: FnOnce(&str, &mut super::cache::MetadataCache) -> Result<(String, RewriteStats)>,
{
    let stat = read_file_stat(path)?;
    let key = normalize_path(path);
    if is_fresh(cache, &key, stat, &rules.fingerprint) {
        total.files_cached += 1;
        return Ok(());
    }
    let source =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let (output, stats) = rewrite(&source, cache)
        .with_context(|| format!("failed to process generated file {relative}"))?;
    if output != source {
        hibikilogy_tools::managed_fs::write_atomic(path, output.as_bytes())
            .with_context(|| format!("failed to replace {}", path.display()))?;
        total.files_changed += 1;
    } else {
        total.files_unchanged += 1;
    }
    total.merge(stats);
    let processed = read_file_stat(path)?;
    cache.files.insert(
        key,
        CachedFileRecord {
            len: processed.len,
            modified_ms: processed.modified_ms,
            config_fingerprint: rules.fingerprint.clone(),
        },
    );
    Ok(())
}

fn collect_files(root: &Path) -> Result<Vec<String>> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root).follow_links(false) {
        let entry = entry.context("failed to walk target root")?;
        if entry.file_type().is_symlink() {
            bail!(
                "target root contains unsupported symlink {}",
                entry.path().display()
            );
        }
        if entry.file_type().is_file() {
            let relative = entry.path().strip_prefix(root)?;
            files.push(normalize_path(relative));
        }
    }
    files.sort();
    Ok(files)
}

fn compile_json_sources(rules: &CompiledRules) -> Result<Vec<JsonSourcePlan<'_>>> {
    let mut plans = Vec::new();
    for rule in &rules.raw.json {
        for (index, source) in rule.sources.iter().enumerate() {
            let label = format!("JSON rule {:?} source {index}", rule.name);
            plans.push(JsonSourcePlan {
                rule,
                selector: source.select.as_deref(),
                matcher: FileMatcher::compile(&source.files, &label)?,
                label,
            });
        }
    }
    Ok(plans)
}

fn validate_matches(
    rules: &CompiledRules,
    plans: &[JsonSourcePlan<'_>],
    files: &[String],
) -> Result<()> {
    let html_files = rules
        .html_files
        .as_ref()
        .map(|matcher| matching_files(matcher, files))
        .unwrap_or_default();
    if rules.raw.html.is_some() && html_files.is_empty() {
        bail!("html.files did not match any generated files");
    }
    let html_set = html_files.into_iter().collect::<BTreeSet<_>>();
    for plan in plans {
        let matches = matching_files(&plan.matcher, files);
        if matches.is_empty() {
            bail!("{} did not match any generated files", plan.label);
        }
        if plan.selector.is_none() {
            if let Some(conflict) = matches.iter().find(|path| html_set.contains(*path)) {
                bail!(
                    "standalone {} conflicts with HTML processing for {conflict}",
                    plan.label
                );
            }
        }
    }
    Ok(())
}

fn matching_files<'a>(matcher: &FileMatcher, files: &'a [String]) -> Vec<&'a String> {
    files.iter().filter(|path| matcher.is_match(path)).collect()
}

fn standalone_tasks<'a>(
    plans: &'a [JsonSourcePlan<'a>],
    files: &[String],
) -> Vec<(String, Vec<&'a JsonRule>)> {
    let mut tasks = BTreeMap::<String, Vec<&JsonRule>>::new();
    for plan in plans.iter().filter(|plan| plan.selector.is_none()) {
        for file in files.iter().filter(|file| plan.matcher.is_match(file)) {
            tasks.entry(file.clone()).or_default().push(plan.rule);
        }
    }
    tasks.into_iter().collect()
}

fn html_tasks<'a>(
    rules: &'a CompiledRules,
    plans: &'a [JsonSourcePlan<'a>],
    files: &[String],
) -> Vec<(String, Vec<(&'a JsonRule, &'a str)>)> {
    let mut tasks = BTreeMap::<String, Vec<(&JsonRule, &str)>>::new();
    if let Some(matcher) = &rules.html_files {
        for file in files.iter().filter(|file| matcher.is_match(file)) {
            tasks.entry(file.clone()).or_default();
        }
    }
    for plan in plans.iter().filter(|plan| plan.selector.is_some()) {
        for file in files.iter().filter(|file| plan.matcher.is_match(file)) {
            tasks
                .entry(file.clone())
                .or_default()
                .push((plan.rule, plan.selector.expect("filtered selector")));
        }
    }
    tasks.into_iter().collect()
}

fn rule_count(rules: &CompiledRules) -> usize {
    rules.raw.html.as_ref().map_or(0, |html| html.rules.len()) + rules.raw.json.len()
}

fn print_stats(stats: &RewriteStats) {
    for (name, rule) in &stats.rules {
        println!(
            "{name}: matched {}, modified {}, skipped {}",
            rule.matched, rule.modified, rule.skipped
        );
    }
    println!(
        "Artifacts: changed {}, unchanged {}, cached {}. Image cache hits: {}, misses: {}.",
        stats.files_changed,
        stats.files_unchanged,
        stats.files_cached,
        stats.cache_hits,
        stats.cache_misses
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::{MetadataCache, CACHE_VERSION};

    fn rules(source: &str) -> CompiledRules {
        config::compile(toml::from_str(source).unwrap()).unwrap()
    }

    #[test]
    fn rejects_standalone_json_and_html_file_overlap() {
        let rules = rules(
            r#"
version = 1
[url.cdn]
from = ["https://site.test/"]
to = "https://cdn.test/"
[html]
files = ["**/*.html"]
[[html.rules]]
name = "html"
select = "img"
rewrite_urls = { map = "cdn", attributes = ["src"] }
[[json]]
name = "json"
sources = [{ files = ["data.html"] }]
rewrite_url = { field = "url", map = "cdn" }
"#,
        );
        let plans = compile_json_sources(&rules).unwrap();
        assert!(validate_matches(&rules, &plans, &["data.html".to_string()]).is_err());
    }

    #[test]
    fn file_state_makes_a_second_processing_run_a_noop() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("page.html");
        fs::write(&path, "before").unwrap();
        let rules = rules(
            r#"
version = 1
[url.cdn]
from = ["https://site.test/"]
to = "https://cdn.test/"
[html]
files = ["**/*.html"]
[[html.rules]]
name = "html"
select = "img"
rewrite_urls = { map = "cdn", attributes = ["src"] }
"#,
        );
        let mut cache = MetadataCache {
            version: CACHE_VERSION,
            ..Default::default()
        };
        let mut first = RewriteStats::default();
        process_file(
            &path,
            "page.html",
            &rules,
            &mut cache,
            &mut first,
            |_, _| Ok(("after".to_string(), RewriteStats::default())),
        )
        .unwrap();
        let mut second = RewriteStats::default();
        process_file(
            &path,
            "page.html",
            &rules,
            &mut cache,
            &mut second,
            |_, _| panic!("fresh files must not be rewritten"),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "after");
        assert_eq!(first.files_changed, 1);
        assert_eq!(second.files_cached, 1);
    }
}
