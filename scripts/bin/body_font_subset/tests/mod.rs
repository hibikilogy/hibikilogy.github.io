//! Unit tests for the body-font subset tool: app orchestration helpers and
//! the per-`@font-face` base CSS parser.

use super::{
    collect_body_font_codepoints, collect_body_text_from_content, collect_latin_codepoints,
    collect_toml_string_fragments,
};
use crate::css_coverage::{
    check_weight_consistency, parse_unicode_range_value, subtract_codepoints_from_base_css,
    validate_font_faces_with_source, ParsedFontFaces,
};
use hibikilogy_tools::font::asset::{css_unicode_range, subset_with_skera};
use hibikilogy_tools::font::coverage::font_codepoints;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// app.rs orchestration helpers
// ---------------------------------------------------------------------------

#[test]
fn collects_body_and_non_title_front_matter_text() {
    let base = std::env::temp_dir().join(format!(
        "body-font-subset-test-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&base).unwrap();
    fs::write(
        base.join("a.md"),
        "+++\ntitle = \"标题\"\ndescription = \"摘要\"\ntags = [\"标签\"]\n+++\n# 正文\n`code`\n",
    )
    .unwrap();

    let collected = collect_body_text_from_content(&base).unwrap();

    assert_eq!(collected.markdown_files, 1);
    assert!(collected
        .fragments
        .iter()
        .any(|text| text.contains("# 正文")));
    assert!(collected.fragments.iter().any(|text| text == "摘要"));
    assert!(collected.fragments.iter().any(|text| text == "标签"));
    assert!(!collected.fragments.iter().any(|text| text == "标题"));

    fs::remove_dir_all(base).unwrap();
}

#[test]
fn body_subset_covers_cjk_including_kana_but_not_ascii() {
    let codepoints = collect_body_font_codepoints(&[
        "中文ABC".to_string(),
        "かなカナ".to_string(),
        "，。「」".to_string(),
    ]);

    assert!(codepoints.contains(&('中' as u32)));
    assert!(codepoints.contains(&('文' as u32)));
    assert!(codepoints.contains(&('か' as u32)));
    assert!(codepoints.contains(&('カ' as u32)));
    assert!(codepoints.contains(&('，' as u32)));
    assert!(codepoints.contains(&('「' as u32)));
    assert!(!codepoints.contains(&('A' as u32)));
    assert!(!codepoints.contains(&0x20));
}

#[test]
fn latin_codepoints_cover_ascii_and_site_non_cjk() {
    let codepoints = collect_latin_codepoints(&["中文ABC — é".to_string()]);

    // Printable ASCII is always retained; site non-CJK characters (Western
    // punctuation, Latin-1) are collected too.
    assert!(codepoints.contains(&('A' as u32)));
    assert!(codepoints.contains(&0x20));
    assert!(codepoints.contains(&0x2014));
    assert!(codepoints.contains(&0x00E9));
    // CJK characters and control characters stay out of the latin subset.
    assert!(!codepoints.contains(&('中' as u32)));
    assert!(!codepoints.contains(&0x0A));
    assert!(!codepoints.contains(&0x3001));
}

#[test]
fn collects_strings_from_config_toml() {
    let path = std::env::temp_dir().join(format!(
        "body-font-config-test-{}.toml",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::write(
        &path,
        "base_url = \"https://example.com\"\n[extra]\ndescription = \"站点说明\"\n",
    )
    .unwrap();

    let strings = collect_toml_string_fragments(&path).unwrap();
    assert!(strings.iter().any(|text| text == "https://example.com"));
    assert!(strings.iter().any(|text| text == "站点说明"));

    fs::remove_file(path).unwrap();
}

// ---------------------------------------------------------------------------
// css_coverage.rs parser and validation
// ---------------------------------------------------------------------------

const BASE_CSS: &str = r#"
/* leading comment */
@font-face {
  font-family: 'Source Han Sans SC VF';
  font-style: normal;
  font-weight: 200 900;
  font-display: swap;
  src: url('../fonts/L1_7684_256.woff2') format('woff2');
  unicode-range: U+7684, U+4E00, U+662F;
}

@font-face {
  font-family: "Other Family";
  src: url("../fonts/other.woff2");
  unicode-range: U+4E00-4E01;
}
"#;

#[test]
fn parses_faces_with_comments_and_case_variants() {
    let faces = ParsedFontFaces::parse(BASE_CSS).expect("css should parse");

    assert_eq!(faces.rules.len(), 2);
    assert_eq!(
        faces.rules[0].font_family.as_deref(),
        Some("Source Han Sans SC VF")
    );
    assert_eq!(
        faces.rules[0].src_url.as_deref(),
        Some("../fonts/L1_7684_256.woff2")
    );
    assert_eq!(
        faces.rules[0].unicode_range,
        Some(vec![(0x7684, 0x7684), (0x4E00, 0x4E00), (0x662F, 0x662F)])
    );
    assert_eq!(faces.rules[1].font_family.as_deref(), Some("Other Family"));
    assert_eq!(faces.rules[1].unicode_range, Some(vec![(0x4E00, 0x4E01)]));
}

#[test]
fn empty_unicode_range_declaration_is_an_error() {
    let css = "@font-face { font-family: 'F'; unicode-range: ; }";
    let error = ParsedFontFaces::parse(css).expect_err("empty declaration must fail");
    assert!(error.to_string().contains("empty"));
}

#[test]
fn stray_commas_are_tolerated_but_whitespace_only_is_not() {
    let ranges = parse_unicode_range_value("U+4E00, , U+4E01").unwrap();
    assert_eq!(ranges, vec![(0x4E00, 0x4E00), (0x4E01, 0x4E01)]);

    let error = parse_unicode_range_value(" , , ").expect_err("must fail");
    assert!(error.to_string().contains("empty"));
}

#[test]
fn wildcards_expand_low_bits() {
    assert_eq!(
        parse_unicode_range_value("U+4??").unwrap(),
        vec![(0x400, 0x4FF)]
    );
    assert_eq!(
        parse_unicode_range_value("U+1F12?").unwrap(),
        vec![(0x1F120, 0x1F12F)]
    );
    assert!(parse_unicode_range_value("U+4?5").is_err());
    assert!(parse_unicode_range_value("U+???????").is_err());
}

/// Subset the committed source font to `codepoints` and write it as a real
/// WOFF2 at `<temp>/fonts/chunk.woff2`, so validation tests resolve the CSS
/// `src` against an actual file.
fn write_chunk_fixture(temp: &Path, codepoints: &[u32]) {
    let font_data = fs::read("themes/hibikilogy/static/fonts/SourceHanSansSC-VF.ttf")
        .expect("committed source font should exist");
    let subset = subset_with_skera(&font_data, codepoints).expect("subset should succeed");
    let woff2 = woofwoof::compress(&subset, "", 11, true).expect("compress should succeed");
    let fonts_dir = temp.join("fonts");
    fs::create_dir_all(&fonts_dir).unwrap();
    fs::write(fonts_dir.join("chunk.woff2"), woff2).unwrap();
}

#[test]
fn validation_checks_declared_against_chunk_cmap() {
    // A rule declaring exactly the chunk's real codepoints validates
    // clean, with no missing characters and no undeclared warnings.
    let temp = tempfile::tempdir().unwrap();
    write_chunk_fixture(temp.path(), &[0x4E00, 0x662F, 0x7684]);
    let chunk = fs::read(temp.path().join("fonts/chunk.woff2")).unwrap();
    let codepoints: Vec<u32> = font_codepoints(&chunk)
        .expect("chunk should parse")
        .into_iter()
        .collect();
    let css = format!(
        "@font-face {{ font-family: 'F'; src: url('../fonts/chunk.woff2'); unicode-range: {}; }}",
        css_unicode_range(&codepoints)
    );
    let faces = ParsedFontFaces::parse(&css).unwrap();
    let source: BTreeSet<u32> = codepoints.into_iter().collect();

    let warnings =
        validate_font_faces_with_source(&faces, &temp.path().join("styles"), "F", &source).unwrap();
    assert!(warnings.is_empty());
}

#[test]
fn validation_fails_on_chunk_missing_declared_characters() {
    // 、(U+3001) is supported by the source font but absent from this
    // hanzi-only chunk.
    let temp = tempfile::tempdir().unwrap();
    write_chunk_fixture(temp.path(), &[0x7684]);
    let css = "@font-face { font-family: 'F'; src: url('../fonts/chunk.woff2'); unicode-range: U+7684, U+3001; }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    let source: BTreeSet<u32> = [0x7684, 0x3001].into_iter().collect();

    let error = validate_font_faces_with_source(&faces, &temp.path().join("styles"), "F", &source)
        .expect_err("missing declared characters must fail");
    assert!(error.to_string().contains("U+3001"));
}

#[test]
fn validation_warns_on_undeclared_chunk_codepoints() {
    // Declare only 的; the chunk contains two more codepoints.
    let temp = tempfile::tempdir().unwrap();
    write_chunk_fixture(temp.path(), &[0x4E00, 0x662F, 0x7684]);
    let css =
        "@font-face { font-family: 'F'; src: url('../fonts/chunk.woff2'); unicode-range: U+7684; }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    let source: BTreeSet<u32> = [0x7684].into_iter().collect();

    let warnings =
        validate_font_faces_with_source(&faces, &temp.path().join("styles"), "F", &source).unwrap();
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains("not declared"));
}

#[test]
fn validation_skips_other_families_and_missing_src_is_an_error() {
    let css =
        "@font-face { font-family: 'Other'; src: url('missing.woff2'); unicode-range: U+4E00; }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    // Rule for a different family is not validated at all.
    let source: BTreeSet<u32> = [0x4E00].into_iter().collect();
    assert!(
        validate_font_faces_with_source(&faces, std::path::Path::new("styles"), "F", &source)
            .is_ok()
    );

    let css = "@font-face { font-family: 'F'; unicode-range: U+4E00; }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    let error =
        validate_font_faces_with_source(&faces, std::path::Path::new("styles"), "F", &source)
            .expect_err("missing src must fail");
    assert!(error.to_string().contains("src"));
}

#[test]
fn parses_font_weight_descriptor() {
    let faces = ParsedFontFaces::parse(BASE_CSS).unwrap();
    assert_eq!(faces.rules[0].font_weight.as_deref(), Some("200 900"));
    assert_eq!(faces.rules[1].font_weight, None);
}

#[test]
fn weight_consistency_rejects_mixed_descriptors() {
    let css = "@font-face { font-family: 'F'; font-weight: 250 900; src: url('a.woff2'); }
               @font-face { font-family: 'F'; font-weight: 250 900; src: url('b.woff2'); }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    check_weight_consistency(&faces, "F", Some("250 900")).unwrap();

    let css = "@font-face { font-family: 'F'; font-weight: 200 900; src: url('a.woff2'); }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    let error = check_weight_consistency(&faces, "F", Some("250 900"))
        .expect_err("mixed weight descriptors must fail the build");
    assert!(error.to_string().contains("200 900"));
}

#[test]
fn weight_consistency_defaults_missing_weight_to_400() {
    let css = "@font-face { font-family: 'F'; src: url('a.woff2'); }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    check_weight_consistency(&faces, "F", Some("400")).unwrap();
    check_weight_consistency(&faces, "F", None).unwrap();
    assert!(check_weight_consistency(&faces, "F", Some("250 900")).is_err());
    // Rules for other families are ignored.
    check_weight_consistency(&faces, "Other", Some("250 900")).unwrap();
}

#[test]
fn subtract_removes_codepoints_from_matching_family_only() {
    let css = "@font-face {\n  font-family: 'F';\n  unicode-range: U+4E00-4E10;\n}\n\n@font-face {\n  font-family: 'G';\n  unicode-range: U+4E00-4E10;\n}\n";
    let removed: BTreeSet<u32> = [0x4E02, 0x4E05, 0x4E06].into_iter().collect();
    let result = subtract_codepoints_from_base_css(css, "F", &removed);

    assert_eq!(result.removed, 3);
    assert!(result.changed);
    assert!(result
        .css
        .contains("U+4E00-4E01, U+4E03-4E04, U+4E07-4E10;"));
    // The other family's declaration is untouched.
    assert!(result.css.matches("U+4E00-4E10").count() == 1);
}

#[test]
fn subtract_drops_a_fully_reclaimed_declaration() {
    let css = "@font-face {\n  font-family: 'F';\n  unicode-range: U+4E00;\n}\n";
    let removed: BTreeSet<u32> = [0x4E00].into_iter().collect();
    let result = subtract_codepoints_from_base_css(css, "F", &removed);
    assert_eq!(result.removed, 1);
    assert!(!result.css.contains("unicode-range"));
}

#[test]
fn subtract_is_a_noop_when_nothing_matches() {
    let css = "@font-face { font-family: 'F'; unicode-range: U+4E00; }";
    let removed: BTreeSet<u32> = [0x9FFF].into_iter().collect();
    let result = subtract_codepoints_from_base_css(css, "F", &removed);
    assert!(!result.changed);
    assert_eq!(result.css, css);
}
