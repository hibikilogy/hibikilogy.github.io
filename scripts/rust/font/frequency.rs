//! Character-frequency ordering for chunk splitting.
//!
//! Codepoints are ordered in three layers:
//!
//! 1. characters actually used by the site, most frequent first (counted from
//!    content, config strings, or titles depending on the caller);
//! 2. characters absent from the site, in Google Fonts' simplified-Chinese
//!    slicing order (`scripts/rust/data/font-slicing.config.json`, highest to
//!    lowest network frequency);
//! 3. anything else, in ascending codepoint order.
//!
//! The first chunk produced from this ordering is the one a first-time
//! visitor is most likely to need, so it is also the preload candidate.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

/// The layered frequency model. Rank values are positions within their
/// layer: lower sorts first.
#[derive(Debug)]
pub struct FrequencyModel {
    site_rank: HashMap<u32, u32>,
    google_rank: HashMap<u32, u32>,
}

#[derive(Debug, Deserialize)]
struct SlicingConfig {
    #[serde(rename = "priorityBuckets")]
    priority_buckets: Vec<String>,
}

impl FrequencyModel {
    /// Build from per-codepoint site counts and the Google slicing table.
    pub fn new(site_counts: &HashMap<u32, u64>, google_config: &Path) -> Result<Self> {
        let mut by_count: Vec<(u32, u64)> = site_counts.iter().map(|(&cp, &n)| (cp, n)).collect();
        by_count.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        let site_rank = by_count
            .iter()
            .enumerate()
            .map(|(index, &(cp, _))| (cp, index as u32))
            .collect();

        let raw = std::fs::read_to_string(google_config)
            .with_context(|| format!("failed to read {}", google_config.display()))?;
        let config: SlicingConfig = serde_json::from_str(&raw)
            .with_context(|| format!("failed to parse {}", google_config.display()))?;
        let mut google_rank = HashMap::new();
        let mut index = 0u32;
        for bucket in &config.priority_buckets {
            for ch in bucket.chars() {
                google_rank.entry(ch as u32).or_insert(index);
                index += 1;
            }
        }
        Ok(Self {
            site_rank,
            google_rank,
        })
    }

    /// Sort codepoints into the layered frequency order.
    pub fn order(&self, codepoints: &[u32]) -> Vec<u32> {
        let mut ordered = codepoints.to_vec();
        ordered.sort_by_key(|&cp| match self.site_rank.get(&cp) {
            Some(&rank) => (0, rank, cp),
            None => match self.google_rank.get(&cp) {
                Some(&rank) => (1, rank, cp),
                // Unknown codepoints rank by their own value, ascending.
                None => (2, cp, cp),
            },
        });
        ordered
    }
}

#[cfg(test)]
mod tests {
    use super::FrequencyModel;
    use std::collections::HashMap;
    use std::path::Path;

    fn model(site: &[(u32, u64)]) -> FrequencyModel {
        FrequencyModel::new(
            &site.iter().copied().collect::<HashMap<_, _>>(),
            Path::new("scripts/rust/data/font-slicing.config.json"),
        )
        .expect("slicing config should parse")
    }

    #[test]
    fn site_counts_beat_google_order_and_unknowns_go_last() {
        let model = model(&[(0x9F8D, 3), (0x4E00, 10)]);
        // 龍 (0x9F8D, site-only) precedes Google-table chars not on the site;
        // a char in neither table sorts last, ascending by codepoint.
        let ordered = model.order(&[0x9F8D, 0x4E00, 0x4E8C, 0xE000, 0xE001]);
        assert_eq!(ordered[0], 0x4E00);
        assert_eq!(ordered[1], 0x9F8D);
        assert!(ordered[2] == 0x4E8C);
        assert_eq!(ordered[3], 0xE000);
        assert_eq!(ordered[4], 0xE001);
    }

    #[test]
    fn ties_in_site_counts_fall_back_to_codepoint_order() {
        let model = model(&[(0x9FFF, 5), (0x4E00, 5)]);
        assert_eq!(model.order(&[0x9FFF, 0x4E00]), vec![0x4E00, 0x9FFF]);
    }

    #[test]
    fn google_layer_keeps_the_tables_relative_order() {
        let model = model(&[]);
        let config: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string("scripts/rust/data/font-slicing.config.json").unwrap(),
        )
        .unwrap();
        let first = config["priorityBuckets"][0]
            .as_str()
            .unwrap()
            .chars()
            .next()
            .unwrap() as u32;
        let last = config["priorityBuckets"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()
            .as_str()
            .unwrap()
            .chars()
            .last()
            .unwrap() as u32;
        assert_eq!(model.order(&[last, first]), vec![first, last]);
    }
}
