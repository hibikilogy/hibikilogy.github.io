use super::{collect_titles_from_content, generate_title_font_subset, GenerateOptions};
use crate::codepoints::collect_title_codepoints;
use crate::markdown::extract_title;
use std::fs;
use std::path::{Path, PathBuf};

fn write_file(dir: &Path, name: &str, contents: &str) -> PathBuf {
    let path = dir.join(name);
    fs::write(&path, contents).unwrap();
    path
}

fn generate_options(content_dir: PathBuf, temp: &Path) -> GenerateOptions {
    GenerateOptions {
        content_dir,
        font_path: Path::new("themes/hibikilogy/static/fonts/SourceHanSerifCN-VF.ttf")
            .to_path_buf(),
        font_output_dir: temp.join("fonts"),
        css_output_dir: temp.join("styles"),
        css_file: "title-font.css".to_string(),
        font_family: "Test Title Font".to_string(),
        output_file: "title-font.woff2".to_string(),
    }
}

#[test]
fn collects_titles_from_front_matter_only() {
    assert_eq!(
        extract_title("+++\ntitle = \"标题\"\n+++\n# 正文\n")
            .unwrap()
            .as_deref(),
        Some("标题")
    );
    assert_eq!(extract_title("# 无 front matter\n").unwrap(), None);
    assert_eq!(extract_title("+++\ntags = [\"x\"]\n+++\n").unwrap(), None);
}

#[test]
fn codepoints_retain_ascii_punctuation_and_title_characters() {
    let codepoints = collect_title_codepoints(["中文标题!"]);
    // Always-retained ASCII range and CJK punctuation.
    assert!(codepoints.contains(&0x20));
    assert!(codepoints.contains(&('A' as u32)));
    assert!(codepoints.contains(&0x3001));
    assert!(codepoints.contains(&0xFF01));
    // Title characters.
    assert!(codepoints.contains(&('中' as u32)));
    assert!(codepoints.contains(&('!' as u32)));
    // Deduplicated and sorted.
    let mut sorted = codepoints.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(codepoints, sorted);
}

#[test]
fn codepoints_skip_control_characters() {
    let codepoints = collect_title_codepoints(["\u{0000}\u{0001}标题"]);
    assert!(!codepoints.contains(&0));
    assert!(!codepoints.contains(&1));
    assert!(codepoints.contains(&('标' as u32)));
}

// ---------------------------------------------------------------------------
// app.rs orchestration
// ---------------------------------------------------------------------------

#[test]
fn collects_titles_from_markdown_files_only() {
    let temp = tempfile::tempdir().unwrap();
    let content_dir = temp.path().join("content");
    fs::create_dir_all(&content_dir).unwrap();
    write_file(
        &content_dir,
        "2026-01-01-hello.md",
        "+++\ntitle = \"你好世界\"\n+++\n正文\n",
    );
    write_file(
        &content_dir,
        "2026-01-02-no-title.md",
        "# 无 front matter\n",
    );
    write_file(&content_dir, "notes.txt", "+++\ntitle = \"忽略我\"\n+++\n");

    let titles = collect_titles_from_content(&content_dir).unwrap();

    assert_eq!(titles, vec!["你好世界".to_string()]);
}

#[test]
fn errors_when_content_has_no_titles() {
    let temp = tempfile::tempdir().unwrap();
    let content_dir = temp.path().join("content");
    fs::create_dir_all(&content_dir).unwrap();
    write_file(&content_dir, "notes.txt", "no front matter here\n");

    // The titles guard fires before the font is read, so this stays fast even
    // though the options point at the real committed source font.
    let err = generate_title_font_subset(&generate_options(content_dir, temp.path())).unwrap_err();

    assert!(
        err.to_string().contains("no titles found"),
        "unexpected error: {err}"
    );
}

#[test]
fn generates_subset_font_and_css_from_content_titles() {
    let temp = tempfile::tempdir().unwrap();
    let content_dir = temp.path().join("content");
    let font_output_dir = temp.path().join("fonts");
    let css_output_dir = temp.path().join("styles");
    fs::create_dir_all(&content_dir).unwrap();
    write_file(
        &content_dir,
        "2026-01-01-hello.md",
        "+++\ntitle = \"你好世界\"\n+++\n正文\n",
    );

    let report = generate_title_font_subset(&generate_options(content_dir, temp.path())).unwrap();

    assert_eq!(report.titles, 1);
    assert!(
        report.codepoints >= 4,
        "expected the four hanzi, got: {report:?}"
    );
    assert!(font_output_dir.join(&report.font.file_name).exists());
    assert!(report.font.bytes > 0);
    let css = fs::read_to_string(css_output_dir.join("title-font.css")).unwrap();
    assert!(css.contains("Test Title Font"));
}
