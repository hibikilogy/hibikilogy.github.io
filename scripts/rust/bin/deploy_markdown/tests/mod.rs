use super::{
    annotate_markdown, export_markdown, repository_from_remote, repository_relative_path,
    select_revision, ManifestRecord, MarkdownManifest,
};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tempfile::TempDir;

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
fn rewrites_zola_links_to_canonical_relative_markdown_routes() {
    let fixture = Fixture::new("links");
    fixture.write(
        "content/articles/2026-02-12-target-source.md",
        "+++\nslug = \"canonical-target\"\n+++\nTarget\n",
    );
    fixture.write(
        "content/docs/join-us.md",
        "+++\nslug = \"getting-started\"\n+++\nJoin\n",
    );
    fixture.write(
        "content/docs/guide.md",
        "+++\ntitle = \"Guide\"\nabstract = \"[Join](@/docs/join-us.md)\"\n+++\n\
         [Article](@/articles/2026-02-12-target-source.md?plain=1#part)\n\
         [Join](@/docs/join-us.md#hello)\n\n\
         [Reference][target]\n\n\
         [target]: @/articles/2026-02-12-target-source.md#reference\n\n\
         ```md\n\
         [Example](@/docs/join-us.md)\n\
         [target]: @/articles/2026-02-12-target-source.md#reference\n\
         ```\n\n\
         `[Inline](@/docs/join-us.md)`\n",
    );
    fixture.write("public/articles/canonical-target/index.html", "article");
    fixture.write("public/docs/getting-started/index.html", "join");
    fixture.write("public/docs/guide/index.html", "guide");

    fixture.export("https://example.com").unwrap();

    let guide = fixture.read("public/docs/guide.md");
    assert!(guide.contains("abstract = \"[Join](getting-started.md)\""));
    assert!(guide.contains("[Article](../articles/canonical-target.md?plain=1#part)"));
    assert!(guide.contains("[Join](getting-started.md#hello)"));
    assert!(guide.contains("[target]: ../articles/canonical-target.md#reference"));
    assert!(guide.contains(
        "```md\n[Example](@/docs/join-us.md)\n\
         [target]: @/articles/2026-02-12-target-source.md#reference\n```"
    ));
    assert!(guide.contains("`[Inline](@/docs/join-us.md)`"));
}

#[test]
fn rejects_unknown_zola_markdown_targets_before_writing_outputs() {
    let fixture = Fixture::new("unknown-link");
    fixture.write(
        "content/docs/guide.md",
        "+++\ntitle = \"Guide\"\n+++\n[Missing](@/docs/missing.md)\n",
    );
    fixture.write("public/docs/guide/index.html", "guide");

    let error = fixture.export("https://example.com").unwrap_err();

    assert!(error.to_string().contains("failed to rewrite links in"));
    assert!(!fixture.root.join("public/docs/guide.md").exists());
    assert!(!fixture.manifest_path().exists());
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
    let final_manifest: MarkdownManifest = serde_json::from_str(&fixture.read_manifest()).unwrap();
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
    assert!(super::ensure_sources_match_revision(&fixture.root, &revision, &root_refs).is_err());

    fixture.write(
        "content/articles/2026-02-12-current.md",
        "+++\nslug = \"current\"\n+++\nbody\n",
    );
    fixture.write("content/docs/untracked.md", "untracked\n");
    assert!(super::ensure_sources_match_revision(&fixture.root, &revision, &root_refs).is_err());
}

struct Fixture {
    _temp: TempDir,
    root: PathBuf,
}

impl Fixture {
    fn new(label: &str) -> Self {
        let temp = tempfile::Builder::new()
            .prefix(&format!("hibikilogy-deploy-markdown-{label}-"))
            .tempdir()
            .unwrap();
        let root = temp.path().to_path_buf();
        fs::create_dir_all(root.join("content/articles")).unwrap();
        fs::create_dir_all(root.join("content/docs")).unwrap();
        fs::create_dir_all(root.join("public")).unwrap();
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
