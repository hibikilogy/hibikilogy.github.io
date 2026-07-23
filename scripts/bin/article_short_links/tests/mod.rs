use super::{
    assign_short_link_codes, digest_source_file_name, generate_short_links, orphaned_codes,
    parse_article_file_name, parse_front_matter, render_redirect_html, validate_manifest,
    ActiveArticle, ShortLinkManifest, ShortLinkRecord,
};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

#[test]
fn extracts_explicit_slug_from_zola_front_matter() {
    let markdown = "+++\nslug = \"kitauji-power-play\"\ntitle = \"Title\"\n+++\nbody\n";
    assert_eq!(
        parse_front_matter(markdown).unwrap().slug.as_deref(),
        Some("kitauji-power-play")
    );
}

#[test]
fn does_not_treat_nested_slug_as_page_slug() {
    let markdown =
        "+++\ntitle = \"Title\"\n[extra]\nslug = \"nested\"\ndate = \"2026-05-25\"\n+++\nbody\n";
    assert_eq!(parse_front_matter(markdown).unwrap().slug, None);
}

#[test]
fn rejects_unterminated_front_matter() {
    assert!(parse_front_matter("+++\nslug = \"daxue\"\n").is_err());
}

#[test]
fn falls_back_to_slug_tail_from_article_file_name() {
    assert_eq!(
        parse_article_file_name("2026-05-25-daxue.md")
            .unwrap()
            .slug_tail,
        "daxue"
    );
}

#[test]
fn validates_calendar_date_in_article_file_name() {
    assert!(parse_article_file_name("2026-02-29-invalid.md").is_err());
    assert!(parse_article_file_name("2024-02-29-valid.md").is_ok());
    assert!(parse_article_file_name("1-05-25-invalid.md").is_err());
}

#[test]
fn new_codes_start_with_publish_year_prefix() {
    let assignment = assign_short_link_codes(
        &[article("2026-05-25-daxue.md", "daxue", "26")],
        &manifest(Vec::new()),
    )
    .unwrap();

    assert_eq!(assignment.records[0].code.len(), 5);
    assert!(assignment.records[0].code.starts_with("26"));
}

#[test]
fn remints_legacy_code_for_known_source_file() {
    let active = vec![article("2026-05-25-daxue.md", "daxue", "26")];
    let existing = manifest(vec![record("2026-05-25-daxue.md", "daxue", "abcde")]);

    let assignment = assign_short_link_codes(&active, &existing).unwrap();

    assert_eq!(assignment.reused, 0);
    assert_eq!(
        assignment.records[0].code,
        format!("26{}", &digest_source_file_name("2026-05-25-daxue.md")[..3])
    );
}

#[test]
fn reuses_existing_code_after_source_file_rename() {
    let active = vec![article("2026-05-25-renamed.md", "daxue", "26")];
    let existing = manifest(vec![record("2026-05-25-daxue.md", "daxue", "26abc")]);

    let assignment = assign_short_link_codes(&active, &existing).unwrap();

    assert_eq!(assignment.reused, 1);
    assert_eq!(assignment.records[0].code, "26abc");
    assert_eq!(assignment.records[0].source_file, "2026-05-25-renamed.md");
}

#[test]
fn lengthens_hash_part_for_collision_without_moving_old_code() {
    let active = vec![
        ActiveArticle {
            source_file: "2026-05-25-daxue.md".to_owned(),
            target_slug: "daxue".to_owned(),
            digest: "abcde11111111111111111111111111111111111111111111111111111111111".to_owned(),
            year_prefix: "26".to_owned(),
        },
        ActiveArticle {
            source_file: "2026-05-26-daxue2.md".to_owned(),
            target_slug: "daxue-2".to_owned(),
            digest: "abcde22222222222222222222222222222222222222222222222222222222222".to_owned(),
            year_prefix: "26".to_owned(),
        },
    ];
    let existing = ShortLinkManifest {
        records: vec![ShortLinkRecord {
            source_file: active[0].source_file.clone(),
            target_slug: active[0].target_slug.clone(),
            code: "26abc".to_owned(),
            digest: active[0].digest.clone(),
        }],
        retired_codes: BTreeSet::new(),
    };

    let assignment = assign_short_link_codes(&active, &existing).unwrap();

    assert_eq!(assignment.records[0].code, "26abc");
    assert_eq!(assignment.records[1].code, "26abcd");
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
        record("2026-05-25-daxue.md", "daxue", "26abc"),
        record("2026-05-26-other.md", "other", "26abc"),
    ]);

    assert!(validate_manifest(&manifest).is_err());
}

#[test]
fn renders_meta_refresh_and_js_redirect_html() {
    let html = render_redirect_html("/articles/daxue?from=%2Fs%2F26abc%2F");

    assert!(html.contains(r#"<meta name="robots" content="noindex">"#));
    assert!(html.contains(
        r#"<meta http-equiv="refresh" content="0; url=/articles/daxue?from=%2Fs%2F26abc%2F">"#
    ));
    assert!(html.contains(r#"<link rel="canonical" href="/articles/daxue?from=%2Fs%2F26abc%2F">"#));
    assert!(html.contains(r#"window.location.replace("/articles/daxue?from=%2Fs%2F26abc%2F")"#));
    assert!(html.contains(
        r#"<a href="/articles/daxue?from=%2Fs%2F26abc%2F">/articles/daxue?from=%2Fs%2F26abc%2F</a>"#
    ));
}

#[test]
fn reports_codes_missing_from_active_assignment() {
    let managed = vec![
        record("2026-05-25-daxue.md", "daxue", "26abc"),
        record("2025-05-20-old.md", "old", "25fff"),
    ];
    let active = vec![record("2026-05-25-daxue.md", "daxue", "26abc")];

    assert_eq!(orphaned_codes(&managed, &active), vec!["25fff"]);
}

#[test]
fn uses_front_matter_date_for_year_prefix() {
    let fixture = TestFixture::new("frontmatter-year");
    fixture.write(
        "content/articles/2024-06-15-kaori.md",
        "+++\nslug = \"kaori\"\ndate = \"2026-01-01\"\n+++\nbody\n",
    );
    fixture.write(
        "public/search_index.zh.json",
        r#"[{"url":"/articles/kaori/","title":"kaori"}]"#,
    );
    fixture.write("public/articles/kaori/index.html", "<html>kaori</html>");

    generate_short_links(
        &fixture.root.join("content/articles"),
        &fixture.root.join("public"),
        &fixture.root.join("static/_cache/short-links.json"),
    )
    .unwrap();

    let manifest: ShortLinkManifest =
        serde_json::from_str(&fixture.read("static/_cache/short-links.json")).unwrap();
    assert!(manifest.records[0].code.starts_with("26"));
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
    assert!(manifest.records[0].code.starts_with("26"));

    let redirect = fixture.read(&format!("public/s/{}/index.html", manifest.records[0].code));
    assert!(redirect.contains("/articles/daxue?from=%2Fs%2F26"));
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

    let old_record = record("2025-05-20-old.md", "old", "25fff");
    fixture.write(
        "static/_cache/short-links.json",
        &serde_json::to_string_pretty(&manifest(vec![old_record])).unwrap(),
    );
    fixture.write("public/s/25fff/index.html", "old redirect");

    let report = generate_short_links(
        &fixture.root.join("content/articles"),
        &fixture.root.join("public"),
        &fixture.root.join("static/_cache/short-links.json"),
    )
    .unwrap();

    assert_eq!(report.removed, 1);
    assert_eq!(report.reused, 0);
    assert!(!fixture.root.join("public/s/25fff").exists());

    let manifest: ShortLinkManifest =
        serde_json::from_str(&fixture.read("static/_cache/short-links.json")).unwrap();
    assert!(manifest.retired_codes.contains("25fff"));
    assert!(manifest.records[0].code.starts_with("26"));
}

#[test]
fn lowercases_explicit_slug_from_front_matter() {
    let markdown = "+++\nslug = \"Kitauji-Power-Play\"\ntitle = \"Title\"\n+++\nbody\n";
    assert_eq!(
        parse_front_matter(markdown).unwrap().slug.as_deref(),
        Some("kitauji-power-play")
    );
}

#[test]
fn lowercases_fallback_slug_from_article_file_name() {
    assert_eq!(
        parse_article_file_name("2026-05-25-Kaori.md")
            .unwrap()
            .slug_tail,
        "kaori"
    );
    assert_eq!(
        parse_article_file_name("2024-04-05-NozoMizore.md")
            .unwrap()
            .slug_tail,
        "nozomizore"
    );
    assert_eq!(
        parse_article_file_name("2019-03-27-Nozomi.md")
            .unwrap()
            .slug_tail,
        "nozomi"
    );
}

#[test]
fn ensures_redirect_url_is_lowercase_with_mixed_case_source() {
    let fixture = TestFixture::new("lowercase-redirect");
    fixture.write(
        "content/articles/2024-06-15-Kaori.md",
        "+++\ntitle = \"Title\"\n+++\nbody\n",
    );
    fixture.write(
        "public/search_index.zh.json",
        r#"[{"url":"/articles/kaori/","title":"kaori"}]"#,
    );
    fixture.write("public/articles/kaori/index.html", "<html>kaori</html>");

    generate_short_links(
        &fixture.root.join("content/articles"),
        &fixture.root.join("public"),
        &fixture.root.join("static/_cache/short-links.json"),
    )
    .unwrap();

    let manifest: ShortLinkManifest =
        serde_json::from_str(&fixture.read("static/_cache/short-links.json")).unwrap();
    assert_eq!(manifest.records[0].target_slug, "kaori");

    let redirect = fixture.read(&format!("public/s/{}/index.html", manifest.records[0].code));
    assert!(redirect.contains("/articles/kaori?from=%2Fs%2F"));
    assert!(!redirect.contains("/articles/Kaori"));
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

fn article(source_file: &str, target_slug: &str, year_prefix: &str) -> ActiveArticle {
    ActiveArticle {
        source_file: source_file.to_owned(),
        target_slug: target_slug.to_owned(),
        digest: digest_source_file_name(source_file),
        year_prefix: year_prefix.to_owned(),
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
    _temp: TempDir,
    root: PathBuf,
}

impl TestFixture {
    fn new(label: &str) -> Self {
        let temp = tempfile::Builder::new()
            .prefix(&format!("hibikilogy-short-links-{label}-"))
            .tempdir()
            .unwrap();
        let root = temp.path().to_path_buf();
        fs::create_dir_all(&root).unwrap();
        Self { _temp: temp, root }
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
