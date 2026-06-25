use std::collections::BTreeSet;

const DEFAULT_RETAINED_RANGES: &[(u32, u32)] = &[(0x0020, 0x007E)];
const DEFAULT_RETAINED_CODEPOINTS: &[u32] = &[
    0x00A0, 0x00B7, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022, 0x3001, 0x3002, 0x3008,
    0x3009, 0x300A, 0x300B, 0x300C, 0x300D, 0x300E, 0x300F, 0x3010, 0x3011, 0x3014, 0x3015, 0xFF01,
    0xFF08, 0xFF09, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F,
];

pub fn collect_title_codepoints<I, S>(texts: I) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut codepoints: Vec<u32> = DEFAULT_RETAINED_RANGES
        .iter()
        .flat_map(|&(start, end)| start..=end)
        .collect();
    codepoints.extend(DEFAULT_RETAINED_CODEPOINTS.iter().copied());

    for text in texts {
        codepoints.extend(
            text.as_ref()
                .chars()
                .filter(|ch| !ch.is_control())
                .map(|ch| ch as u32),
        );
    }

    codepoints
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
