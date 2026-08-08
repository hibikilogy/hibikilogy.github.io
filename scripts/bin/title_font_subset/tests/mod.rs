use crate::codepoints::collect_title_codepoints;
use crate::markdown::extract_title;

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
