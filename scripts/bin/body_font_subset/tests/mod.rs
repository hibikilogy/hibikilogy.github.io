//! Unit tests for the body-font subset tool: app orchestration helpers and
//! the per-`@font-face` base CSS parser.

use super::{
    collect_body_font_codepoints, collect_body_text_from_config, collect_body_text_from_content,
};
use crate::css_coverage::{
    check_weight_consistency, filter_uncovered_codepoints, parse_unicode_range_value,
    validate_font_faces_with_source, CssUnicodeRanges, ParsedFontFaces,
};
use hibikilogy_tools::font::asset::css_unicode_range;
use hibikilogy_tools::font::coverage::font_codepoints;
use std::collections::BTreeSet;
use std::fs;
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
fn body_subset_filters_out_ascii_and_kana() {
    let codepoints = collect_body_font_codepoints(&[
        "中文ABC".to_string(),
        "かなカナ".to_string(),
        "，。「」".to_string(),
    ]);

    assert!(codepoints.contains(&('中' as u32)));
    assert!(codepoints.contains(&('文' as u32)));
    assert!(codepoints.contains(&('，' as u32)));
    assert!(codepoints.contains(&('「' as u32)));
    assert!(!codepoints.contains(&('A' as u32)));
    assert!(!codepoints.contains(&('か' as u32)));
    assert!(!codepoints.contains(&('カ' as u32)));
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

    let strings = collect_body_text_from_config(&path).unwrap();
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
fn covered_ranges_filters_by_family_and_merges() {
    let faces = ParsedFontFaces::parse(BASE_CSS).unwrap();
    assert_eq!(
        faces.covered_ranges("Source Han Sans SC VF"),
        vec![(0x4E00, 0x4E00), (0x662F, 0x662F), (0x7684, 0x7684)]
    );
    // Other families do not contribute coverage.
    assert_eq!(
        faces.covered_ranges("Missing Family"),
        Vec::<(u32, u32)>::new()
    );
}

#[test]
fn unrestricted_rule_covers_everything() {
    let css = "@font-face { font-family: 'F'; src: url('f.woff2'); }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    assert_eq!(faces.covered_ranges("F"), vec![(0, 0x10FFFF)]);
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

#[test]
fn validation_checks_declared_against_chunk_cmap() {
    // A rule declaring exactly the chunk's real codepoints validates
    // clean, with no missing characters and no undeclared warnings.
    let chunk = fs::read("themes/hibikilogy/static/fonts/L1_7684_256.woff2")
        .expect("committed L1 chunk should exist");
    let codepoints: Vec<u32> = font_codepoints(&chunk)
        .expect("chunk should parse")
        .into_iter()
        .collect();
    let css = format!(
        "@font-face {{ font-family: 'F'; src: url('../fonts/L1_7684_256.woff2'); unicode-range: {}; }}",
        css_unicode_range(&codepoints)
    );
    let faces = ParsedFontFaces::parse(&css).unwrap();
    let source: BTreeSet<u32> = codepoints.into_iter().collect();

    let warnings = validate_font_faces_with_source(
        &faces,
        std::path::Path::new("themes/hibikilogy/static/styles"),
        "F",
        &source,
    )
    .unwrap();
    assert!(warnings.is_empty());
}

#[test]
fn validation_fails_on_chunk_missing_declared_characters() {
    // 、(U+3001) is supported by the source font but absent from this
    // hanzi-only chunk.
    let css = "@font-face { font-family: 'F'; src: url('../fonts/L1_7684_256.woff2'); unicode-range: U+7684, U+3001; }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    let source: BTreeSet<u32> = [0x7684, 0x3001].into_iter().collect();

    let error = validate_font_faces_with_source(
        &faces,
        std::path::Path::new("themes/hibikilogy/static/styles"),
        "F",
        &source,
    )
    .expect_err("missing declared characters must fail");
    assert!(error.to_string().contains("U+3001"));
}

#[test]
fn validation_warns_on_undeclared_chunk_codepoints() {
    // Declare only 的; the chunk contains many more codepoints.
    let css = "@font-face { font-family: 'F'; src: url('../fonts/L1_7684_256.woff2'); unicode-range: U+7684; }";
    let faces = ParsedFontFaces::parse(css).unwrap();
    let source: BTreeSet<u32> = [0x7684].into_iter().collect();

    let warnings = validate_font_faces_with_source(
        &faces,
        std::path::Path::new("themes/hibikilogy/static/styles"),
        "F",
        &source,
    )
    .unwrap();
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
fn covered_ranges_feed_patch_calculation() {
    let faces = ParsedFontFaces::parse(BASE_CSS).unwrap();
    let covered = CssUnicodeRanges::from_ranges(faces.covered_ranges("Source Han Sans SC VF"));
    assert!(covered.contains(0x7684));
    assert!(!covered.contains(0x4E01));

    let uncovered = filter_uncovered_codepoints([0x7684, 0x4E01, 0x9FFF], &covered);
    assert_eq!(uncovered, vec![0x4E01, 0x9FFF]);
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
