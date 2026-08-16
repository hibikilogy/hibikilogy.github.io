//! Codepoint filtering owned by the title-font subset tool.

use hibikilogy_tools::font::coverage::is_cjk_codepoint;
use std::collections::BTreeSet;

/// Always-retained latin characters: printable ASCII plus common Western
/// punctuation, so titles never render through fallback fonts even before a
/// rebuild picks up new characters.
const LATIN_RETAINED_RANGES: &[(u32, u32)] = &[(0x0020, 0x007E)];
const LATIN_RETAINED_CODEPOINTS: &[u32] = &[
    0x00A0, 0x00B7, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022,
];

/// Always-retained CJK punctuation, kept in the chunk series with the hanzi.
const CJK_RETAINED_CODEPOINTS: &[u32] = &[
    0x3001, 0x3002, 0x3008, 0x3009, 0x300A, 0x300B, 0x300C, 0x300D, 0x300E, 0x300F, 0x3010, 0x3011,
    0x3014, 0x3015, 0xFF01, 0xFF08, 0xFF09, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F,
];

fn collect<I, S>(texts: I, retained: &[u32], ranges: &[(u32, u32)], cjk: bool) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut codepoints: Vec<u32> = ranges
        .iter()
        .flat_map(|&(start, end)| start..=end)
        .collect();
    codepoints.extend(retained.iter().copied());

    for text in texts {
        codepoints.extend(
            text.as_ref()
                .chars()
                .filter(|ch| !ch.is_control())
                .map(|ch| ch as u32)
                .filter(|&codepoint| is_cjk_codepoint(codepoint) == cjk),
        );
    }

    codepoints
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

/// CJK-family codepoints from `texts`, plus the retained CJK punctuation.
/// These feed the frequency-ordered chunk series.
pub fn collect_title_codepoints<I, S>(texts: I) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    collect(texts, CJK_RETAINED_CODEPOINTS, &[], true)
}

/// Non-CJK codepoints from `texts` (latin, Western punctuation, symbols),
/// plus the retained latin set. These ship in one consolidated subset file.
pub fn collect_latin_title_codepoints<I, S>(texts: I) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    collect(
        texts,
        LATIN_RETAINED_CODEPOINTS,
        LATIN_RETAINED_RANGES,
        false,
    )
}
