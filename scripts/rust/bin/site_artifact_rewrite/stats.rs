use std::collections::BTreeMap;

#[derive(Debug, Default, Clone, Copy)]
pub(super) struct RuleStats {
    pub matched: usize,
    pub modified: usize,
    pub skipped: usize,
}

#[derive(Debug, Default)]
pub(super) struct RewriteStats {
    pub files_changed: usize,
    pub files_unchanged: usize,
    pub files_cached: usize,
    pub cache_hits: usize,
    pub cache_misses: usize,
    pub rules: BTreeMap<String, RuleStats>,
}

impl RewriteStats {
    pub(super) fn rule_mut(&mut self, name: &str) -> &mut RuleStats {
        self.rules.entry(name.to_string()).or_default()
    }

    pub(super) fn merge(&mut self, addition: Self) {
        self.files_changed += addition.files_changed;
        self.files_unchanged += addition.files_unchanged;
        self.files_cached += addition.files_cached;
        self.cache_hits += addition.cache_hits;
        self.cache_misses += addition.cache_misses;
        for (name, stats) in addition.rules {
            let total = self.rules.entry(name).or_default();
            total.matched += stats.matched;
            total.modified += stats.modified;
            total.skipped += stats.skipped;
        }
    }
}
