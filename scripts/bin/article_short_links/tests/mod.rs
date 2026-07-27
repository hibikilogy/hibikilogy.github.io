use super::{
    allocate_code, append_alias, digest_modulo, find_short_code, parse_front_matter,
    sync_short_links, Reservations, IDS_PER_YEAR,
};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

#[test]
fn hashes_into_the_full_three_digit_space() {
    let id = digest_modulo(b"2026-07-27-example.md", IDS_PER_YEAR);
    assert!(id < 1000);
    assert_eq!(id, 166);
}

#[test]
fn allocates_with_leading_zeroes_and_year_prefix() {
    let mut reserved = BTreeSet::new();
    assert_eq!(allocate_code("26", 7, &mut reserved).unwrap(), "26007");
}

#[test]
fn probes_forward_and_wraps_within_the_same_year() {
    let mut reserved = BTreeSet::from(["26999".to_owned(), "26000".to_owned()]);
    assert_eq!(allocate_code("26", 999, &mut reserved).unwrap(), "26001");
}

#[test]
fn allows_the_same_id_in_different_years() {
    let mut reserved = BTreeSet::from(["26007".to_owned()]);
    assert_eq!(allocate_code("27", 7, &mut reserved).unwrap(), "27007");
}

#[test]
fn fails_when_a_year_is_exhausted() {
    let mut reserved = (0..1000)
        .map(|id| format!("26{id:03}"))
        .collect::<BTreeSet<_>>();
    assert!(allocate_code("26", 123, &mut reserved)
        .unwrap_err()
        .to_string()
        .contains("all 1000"));
}

#[test]
fn rejects_malformed_and_multiple_short_aliases() {
    assert!(find_short_code(&["/s/26abc/".to_owned()]).is_err());
    assert!(find_short_code(&["/s/26001/".to_owned(), "/s/26002/".to_owned()]).is_err());
}

#[test]
fn preserves_legacy_alias_and_unrelated_front_matter() {
    let markdown = "+++\ntitle = \"Example\"\ndate = \"2026-07-27\"\naliases = [\"/old/\"]\n\n[extra]\ncover = \"/cover.webp\"\n+++\nBody\n";
    let updated = append_alias(markdown, "/s/26007/").unwrap();
    assert!(updated.contains("title = \"Example\""));
    assert!(updated.contains("aliases = [\"/old/\", \"/s/26007/\"]"));
    assert!(updated.contains("[extra]\ncover = \"/cover.webp\""));
    assert!(updated.ends_with("+++\nBody\n"));
}

#[test]
fn preserves_crlf_and_bom() {
    let markdown = "\u{feff}+++\r\ntitle = \"Example\"\r\ndate = \"2026-07-27\"\r\n+++\r\nBody\r\n";
    let updated = append_alias(markdown, "/s/26007/").unwrap();
    assert!(updated.starts_with("\u{feff}+++\r\n"));
    assert!(updated.contains("aliases = [\"/s/26007/\"]\r\n"));
    assert!(!updated.replace("\r\n", "").contains('\n'));
}

#[test]
fn parses_draft_and_existing_aliases() {
    let markdown = "+++\ndate = \"2026-07-27\"\ndraft = true\naliases = [\"/s/26007/\"]\n+++\n";
    let metadata = parse_front_matter(markdown).unwrap();
    assert!(metadata.draft);
    assert_eq!(metadata.aliases, ["/s/26007/"]);
}

#[test]
fn syncs_published_articles_and_is_idempotent() {
    let fixture = Fixture::new();
    fixture.write_article(
        "2026-07-27-example.md",
        "+++\ntitle = \"Example\"\ndate = \"2026-07-27\"\naliases = [\"/legacy/\"]\n+++\nBody\n",
    );

    let first = sync_short_links(&fixture.content, &fixture.reservations, false).unwrap();
    assert_eq!(first.updated_articles, 1);
    let article = fixture.read_article("2026-07-27-example.md");
    assert!(article.contains("\"/legacy/\""));
    assert!(article.contains("\"/s/26"));

    let second = sync_short_links(&fixture.content, &fixture.reservations, false).unwrap();
    assert_eq!(second.updated_articles, 0);
    assert_eq!(fixture.read_article("2026-07-27-example.md"), article);
}

#[test]
fn initial_drafts_do_not_receive_codes() {
    let fixture = Fixture::new();
    fixture.write_article(
        "2026-07-27-draft.md",
        "+++\ndate = \"2026-07-27\"\ndraft = true\n+++\n",
    );

    let report = sync_short_links(&fixture.content, &fixture.reservations, false).unwrap();
    assert_eq!(report.updated_articles, 0);
    assert!(!fixture.reservations.exists());
}

#[test]
fn published_codes_remain_when_article_returns_to_draft() {
    let fixture = Fixture::new();
    fixture.write_article(
        "2026-07-27-example.md",
        "+++\ndate = \"2026-07-27\"\naliases = [\"/s/26007/\"]\ndraft = true\n+++\n",
    );

    sync_short_links(&fixture.content, &fixture.reservations, false).unwrap();
    let ledger: Reservations =
        serde_json::from_str(&fs::read_to_string(&fixture.reservations).unwrap()).unwrap();
    assert!(ledger.reserved_codes.contains("26007"));
}

#[test]
fn deleted_article_codes_are_never_reused() {
    let fixture = Fixture::new();
    let file_name = "2026-07-27-example.md";
    let initial_id = digest_modulo(file_name.as_bytes(), IDS_PER_YEAR);
    let reserved_code = format!("26{initial_id:03}");
    fixture.write_reservations(&[&reserved_code]);
    fixture.write_article(file_name, "+++\ndate = \"2026-07-27\"\n+++\n");

    sync_short_links(&fixture.content, &fixture.reservations, false).unwrap();
    let metadata = parse_front_matter(&fixture.read_article(file_name)).unwrap();
    let code = find_short_code(&metadata.aliases).unwrap().unwrap();
    assert_eq!(code, format!("26{:03}", (initial_id + 1) % 1000));
}

#[test]
fn duplicate_codes_across_articles_are_rejected() {
    let fixture = Fixture::new();
    for name in ["2026-07-27-a.md", "2026-07-28-b.md"] {
        fixture.write_article(
            name,
            "+++\ndate = \"2026-07-27\"\naliases = [\"/s/26007/\"]\n+++\n",
        );
    }

    assert!(
        sync_short_links(&fixture.content, &fixture.reservations, false)
            .unwrap_err()
            .to_string()
            .contains("used by both")
    );
}

#[test]
fn check_mode_reports_drift_without_writing() {
    let fixture = Fixture::new();
    fixture.write_article(
        "2026-07-27-example.md",
        "+++\ndate = \"2026-07-27\"\n+++\nBody\n",
    );
    let before = fixture.read_article("2026-07-27-example.md");

    let error = sync_short_links(&fixture.content, &fixture.reservations, true).unwrap_err();
    assert!(error.to_string().contains("out of sync"));
    assert_eq!(fixture.read_article("2026-07-27-example.md"), before);
    assert!(!fixture.reservations.exists());
}

#[test]
fn check_mode_accepts_synced_content() {
    let fixture = Fixture::new();
    fixture.write_article(
        "2026-07-27-example.md",
        "+++\ndate = \"2026-07-27\"\naliases = [\"/s/26007/\"]\n+++\n",
    );
    fixture.write_reservations(&["26007"]);

    let report = sync_short_links(&fixture.content, &fixture.reservations, true).unwrap();
    assert_eq!(report.updated_articles, 0);
    assert_eq!(report.reserved_codes, 1);
}

struct Fixture {
    _temp: TempDir,
    content: PathBuf,
    reservations: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let content = temp.path().join("content/articles");
        fs::create_dir_all(&content).unwrap();
        Self {
            reservations: temp
                .path()
                .join("scripts/data/short-link-reservations.json"),
            _temp: temp,
            content,
        }
    }

    fn write_article(&self, name: &str, contents: &str) {
        fs::write(self.content.join(name), contents).unwrap();
    }

    fn read_article(&self, name: &str) -> String {
        fs::read_to_string(self.content.join(name)).unwrap()
    }

    fn write_reservations(&self, codes: &[&str]) {
        let parent = self.reservations.parent().unwrap();
        fs::create_dir_all(parent).unwrap();
        let reservations = Reservations {
            version: 1,
            reserved_codes: codes.iter().map(|code| (*code).to_owned()).collect(),
        };
        fs::write(
            &self.reservations,
            format!("{}\n", serde_json::to_string_pretty(&reservations).unwrap()),
        )
        .unwrap();
    }
}
