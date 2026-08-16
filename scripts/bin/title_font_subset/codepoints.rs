//! Codepoint filtering owned by the title-font subset tool.

use hibikilogy_tools::font::coverage::{
    collect_codepoints, is_cjk_codepoint, LATIN_RETAINED_CODEPOINTS, LATIN_RETAINED_RANGES,
};

/// Always-retained CJK punctuation, kept in the chunk series with the hanzi.
const CJK_RETAINED_CODEPOINTS: &[u32] = &[
    0x3001, 0x3002, 0x3008, 0x3009, 0x300A, 0x300B, 0x300C, 0x300D, 0x300E, 0x300F, 0x3010, 0x3011,
    0x3014, 0x3015, 0xFF01, 0xFF08, 0xFF09, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F,
];

/// CJK-family codepoints from `texts`, plus the retained CJK punctuation.
/// These feed the frequency-ordered chunk series.
pub fn collect_title_codepoints<I, S>(texts: I) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    collect_codepoints(texts, &[], CJK_RETAINED_CODEPOINTS, is_cjk_codepoint)
}

/// Non-CJK codepoints from `texts` (latin, Western punctuation, symbols),
/// plus the retained latin set. These ship in one consolidated subset file.
pub fn collect_latin_title_codepoints<I, S>(texts: I) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    collect_codepoints(
        texts,
        LATIN_RETAINED_RANGES,
        LATIN_RETAINED_CODEPOINTS,
        |codepoint| !is_cjk_codepoint(codepoint),
    )
}
