//! Codepoint reading and subset coverage verification shared by font tools.

use anyhow::{Context, Result};
use std::collections::BTreeSet;
use write_fonts::read::{FontRef, TableProvider};

/// Read the set of codepoints mapped by a font's best cmap subtable.
///
/// Accepts TTF/OTF directly and WOFF2 (decompressed via `woofwoof`).
/// Noncharacters (U+FDD0..U+FDEF and the U+xxFFFE/U+xxFFFF plane ends) are
/// excluded: cmap subtables often map U+FFFF to the .notdef glyph as a
/// sentinel, and they can never be real text.
pub fn font_codepoints(font_data: &[u8]) -> Result<BTreeSet<u32>> {
    let data = if font_data.starts_with(b"wOF2") {
        woofwoof::decompress(font_data).context("failed to decompress WOFF2 font")?
    } else {
        font_data.to_vec()
    };
    let font = FontRef::new(&data).context("failed to parse font")?;
    let cmap = font.cmap().context("failed to read cmap")?;
    let Some((_, _, subtable)) = cmap.best_subtable() else {
        return Ok(BTreeSet::new());
    };
    Ok(subtable
        .iter()
        .map(|(codepoint, _)| codepoint)
        .filter(|&codepoint| !is_noncharacter(codepoint))
        .collect())
}

fn is_noncharacter(codepoint: u32) -> bool {
    (0xFDD0..=0xFDEF).contains(&codepoint)
        || codepoint & 0xFFFF == 0xFFFE
        || codepoint & 0xFFFF == 0xFFFF
}

/// Result of checking that a subset output covers the requested characters.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct CoverageReport {
    /// Requested codepoints that the source font supports but the output is
    /// missing: a subsetting failure.
    pub missing_in_output: Vec<u32>,
    /// Requested codepoints the source font itself does not map (e.g. emoji
    /// in titles): they fall back to later fonts in the stack; warning only.
    pub missing_in_source: Vec<u32>,
}

/// Classify requested codepoints against source and output codepoint sets.
///
/// The invariant asserted by callers is `(requested ∩ source) ⊆ output`.
pub fn classify_coverage(
    requested: &BTreeSet<u32>,
    source: &BTreeSet<u32>,
    output: &BTreeSet<u32>,
) -> CoverageReport {
    let missing_in_source: Vec<u32> = requested.difference(source).copied().collect();
    let in_source: BTreeSet<u32> = requested.intersection(source).copied().collect();
    let missing_in_output: Vec<u32> = in_source.difference(output).copied().collect();
    CoverageReport {
        missing_in_output,
        missing_in_source,
    }
}

/// Verify that a subsetted font covers every requested codepoint the source
/// font supports.
pub fn verify_subset_coverage(
    requested: &[u32],
    source_font: &[u8],
    output_font: &[u8],
) -> Result<CoverageReport> {
    let requested: BTreeSet<u32> = requested.iter().copied().collect();
    let source = font_codepoints(source_font)?;
    let output = font_codepoints(output_font)?;
    Ok(classify_coverage(&requested, &source, &output))
}

/// Format a codepoint for diagnostics, appending the character itself when it
/// is not a control character.
pub fn describe_codepoint(codepoint: u32) -> String {
    match char::from_u32(codepoint) {
        Some(ch) if !ch.is_control() => format!("U+{codepoint:04X} ({ch})"),
        _ => format!("U+{codepoint:04X}"),
    }
}

/// Format a codepoint list for diagnostics, capping the printed entries.
pub fn format_codepoint_list(codepoints: &[u32]) -> String {
    const MAX_PRINTED: usize = 20;
    let mut output = codepoints
        .iter()
        .take(MAX_PRINTED)
        .map(|&codepoint| describe_codepoint(codepoint))
        .collect::<Vec<_>>()
        .join(", ");
    if codepoints.len() > MAX_PRINTED {
        output.push_str(&format!(", … ({} total)", codepoints.len()));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{classify_coverage, font_codepoints, format_codepoint_list};
    use std::collections::BTreeSet;
    use std::fs;

    fn set(codepoints: &[u32]) -> BTreeSet<u32> {
        codepoints.iter().copied().collect()
    }

    #[test]
    fn classify_reports_output_gaps_and_source_missing() {
        let requested = set(&[0x4E00, 0x4E01, 0x1F600]);
        let source = set(&[0x4E00, 0x4E01]);
        let output = set(&[0x4E00]);

        let report = classify_coverage(&requested, &source, &output);

        // 0x4E01 is supported by the source but lost in the output.
        assert_eq!(report.missing_in_output, vec![0x4E01]);
        // The emoji is not supported by the source font at all.
        assert_eq!(report.missing_in_source, vec![0x1F600]);
    }

    #[test]
    fn classify_is_clean_when_output_covers_everything_requested() {
        let requested = set(&[0x4E00, 0x1F600]);
        let source = set(&[0x4E00]);
        let output = set(&[0x4E00]);

        let report = classify_coverage(&requested, &source, &output);

        assert!(report.missing_in_output.is_empty());
        assert_eq!(report.missing_in_source, vec![0x1F600]);
    }

    #[test]
    fn font_codepoints_reads_woff2_and_ttf_equivalently() {
        // Build a small real WOFF2 from the committed source font.
        let font_data = fs::read("themes/hibikilogy/static/fonts/SourceHanSansSC-VF.ttf")
            .expect("committed source font should exist");
        let subset = crate::font::asset::subset_with_skera(&font_data, &[0x4E00, 0x7684])
            .expect("subset should succeed");
        let woff2 = woofwoof::compress(&subset, "", 11, true).expect("woff2 should compress");
        let from_woff2 = font_codepoints(&woff2).expect("woff2 should parse");

        // 的 survives the subset round-trip.
        assert!(from_woff2.contains(&0x7684));

        let ttf = woofwoof::decompress(&woff2).expect("woff2 should decompress");
        let from_ttf = font_codepoints(&ttf).expect("ttf should parse");
        assert_eq!(from_woff2, from_ttf);
    }

    #[test]
    fn font_codepoints_excludes_noncharacters() {
        // Source Han maps U+FFFF to .notdef as a sentinel; the filter must
        // drop it even when it survives subsetting.
        let font_data = fs::read("themes/hibikilogy/static/fonts/SourceHanSansSC-VF.ttf")
            .expect("committed source font should exist");
        let codepoints = font_codepoints(&font_data).expect("source font should parse");
        assert!(!codepoints.contains(&0xFFFF));
        assert!(!codepoints.contains(&0xFFFE));
        assert!(!codepoints.contains(&0xFDD0));
    }

    #[test]
    fn format_codepoint_list_caps_long_lists() {
        let many: Vec<u32> = (0x4E00..=0x4E30).collect();
        let formatted = format_codepoint_list(&many);
        assert!(formatted.contains("…"));
        assert!(formatted.contains("(49 total)"));

        let few = format_codepoint_list(&[0x4E00]);
        assert_eq!(few, "U+4E00 (一)");
    }
}
