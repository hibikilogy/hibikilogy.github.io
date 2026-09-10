//! Split an ordered codepoint set into WOFF2 chunks sized for lazy loading.
//!
//! Codepoints arrive in frequency order (see [`crate::font::frequency`]) and
//! are packed greedily: each chunk is the longest prefix that still compresses
//! to at most [`CHUNK_TARGET_BYTES`]. The boundary is bracketed by a doubling
//! ladder of probes and then narrowed by refinement rounds; the probes of each
//! round are independent and compress in parallel (rayon), and the winning
//! probe's bytes become the chunk, so nothing is compressed twice. Probing
//! runs at a fast brotli quality and only the final upward refinement uses
//! the shipping quality, which is ~15x slower for a few percent smaller
//! output. A final chunk smaller than [`CHUNK_MIN_BYTES`] is merged into its
//! predecessor (re-subset and re-compress), matching the behavior of Google
//! Fonts' CJK slicing where the tail of a frequency-ordered list is the
//! rarest data.

use crate::font::asset::{hashed_output_file_name, split_file_name, Subsetter, FINAL_QUALITY};
use anyhow::{Context, Result};
use rayon::prelude::*;

/// Target compressed size per chunk. Google Fonts' CJK slices land near this
/// range; larger chunks trade request count for bytes a visitor may not need.
pub const CHUNK_TARGET_BYTES: usize = 55 * 1024;
/// Chunks smaller than this merge into the previous chunk instead of shipping
/// a nearly-empty file.
pub const CHUNK_MIN_BYTES: usize = 28 * 1024;

/// Probes per parallel refinement round. The bracket shrinks by a factor of
/// `PROBE_FANOUT + 1` per round, so a 256-wide bracket closes in three.
const PROBE_FANOUT: usize = 8;
/// First ladder rung, in codepoints. Even this many hanzi compress to far
/// below the target, so the boundary never lands below it.
const LADDER_FIRST: usize = 8;
/// Ladder rungs evaluated per parallel batch. The batch stops doubling as soon
/// as one rung overshoots, so batches beyond the boundary never run.
const LADDER_BATCH: usize = 6;
/// WOFF2 brotli quality for boundary probes: ~15x faster than the final
/// quality for a few percent larger output, so the probe-quality boundary is
/// always a fitting lower bound for the final-quality one.
const PROBE_QUALITY: usize = 9;
/// Cap on the first upward walk batch, which steps one codepoint at a time
/// around the headroom estimate.
const FIRST_WALK_REACH: usize = 16;

/// One produced chunk: its codepoints (sorted), the compressed WOFF2 bytes,
/// and the content-hashed file name to publish under.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FontChunk {
    pub codepoints: Vec<u32>,
    pub file_name: String,
    pub bytes: Vec<u8>,
}

/// Subset through `subsetter` into chunks over `ordered_codepoints`
/// (frequency order).
///
/// `name_prefix` is the file-name stem, e.g. `source-han-sans-sc-vf.patch`;
/// each chunk is published as `<prefix>-<n>.<hash>.woff2` with `n` starting at
/// 1 so a single chunk still reads as part of a series.
pub fn chunk_font(
    subsetter: &Subsetter,
    ordered_codepoints: &[u32],
    name_prefix: &str,
) -> Result<Vec<FontChunk>> {
    let mut chunks: Vec<FontChunk> = Vec::new();
    let mut start = 0;
    while start < ordered_codepoints.len() {
        let (end, bytes) = chunk_end(subsetter, ordered_codepoints, start)?;
        chunks.push(build_chunk(
            &ordered_codepoints[start..end],
            bytes,
            name_prefix,
            chunks.len() + 1,
        ));
        start = end;
    }

    while chunks.len() > 1
        && chunks
            .last()
            .is_some_and(|c| c.bytes.len() < CHUNK_MIN_BYTES)
    {
        let tail = chunks.pop().expect("len > 1");
        let mut merged = chunks.pop().expect("len > 1").codepoints;
        merged.extend_from_slice(&tail.codepoints);
        let bytes = compress(subsetter, &merged)?;
        let number = chunks.len() + 1;
        chunks.push(build_chunk(&merged, bytes, name_prefix, number));
    }

    Ok(chunks)
}

/// Largest `end` such that `ordered[start..end]` compresses at final quality
/// to at most [`CHUNK_TARGET_BYTES`], plus the compressed bytes of that
/// prefix; always at least `start + 1`.
///
/// Final-quality WOFF2 compression is ~15x slower than probe quality for a
/// few percent smaller output, so the search runs in two phases: phase 1 finds
/// the boundary at [`PROBE_QUALITY`] (cheap probes), phase 2 walks a few
/// codepoints upward at [`FINAL_QUALITY`]. Final quality never compresses
/// worse than probe quality, so the phase-1 boundary always fits at final
/// quality and the two-phase boundary equals a full final-quality search.
fn chunk_end(subsetter: &Subsetter, ordered: &[u32], start: usize) -> Result<(usize, Vec<u8>)> {
    let (seed, _) = search_boundary(subsetter, ordered, start, PROBE_QUALITY)?;
    let seed_bytes = compress_at(subsetter, &ordered[start..seed], FINAL_QUALITY)?;
    if seed_bytes.len() > CHUNK_TARGET_BYTES {
        // Not expected (final quality compresses better); redo the whole
        // search at final quality rather than trusting the seed.
        return search_boundary(subsetter, ordered, start, FINAL_QUALITY);
    }
    let mut lo = seed;
    let mut lo_bytes = seed_bytes;
    if lo == ordered.len() {
        return Ok((lo, lo_bytes));
    }

    // Estimate how many more codepoints fit from the seed measurement: probe
    // quality left `headroom` bytes at the seed and each glyph costs about
    // `per_glyph` final-quality bytes. The first batch steps one codepoint at
    // a time up to the estimate, so an overshoot brackets the boundary
    // exactly and no refinement round runs; wider walks only happen when the
    // estimate undershot.
    let per_glyph = (lo_bytes.len() / (lo - start).max(1)).max(1);
    let headroom = CHUNK_TARGET_BYTES - lo_bytes.len();
    let mut reach = (headroom / per_glyph + 2).clamp(2, FIRST_WALK_REACH);
    let mut step = 1usize;
    let hi;
    loop {
        let mut batch = Vec::new();
        let mut rung = lo + step;
        while batch.len() < reach && rung < ordered.len() {
            batch.push(rung);
            rung += step;
        }
        if rung >= ordered.len() {
            batch.push(ordered.len());
        }
        let results = probe_batch(subsetter, ordered, start, &batch, FINAL_QUALITY)?;
        match results
            .iter()
            .position(|(_, bytes)| bytes.len() > CHUNK_TARGET_BYTES)
        {
            Some(overshot) => {
                hi = results[overshot].0;
                if overshot > 0 {
                    let (end, bytes) = &results[overshot - 1];
                    lo = *end;
                    lo_bytes = bytes.clone();
                }
                break;
            }
            None => {
                let (end, bytes) = results.last().expect("batch is never empty");
                lo = *end;
                lo_bytes = bytes.clone();
                if lo == ordered.len() {
                    return Ok((lo, lo_bytes));
                }
                step *= 2;
                reach = PROBE_FANOUT;
            }
        }
    }

    refine(subsetter, ordered, start, lo, lo_bytes, hi, FINAL_QUALITY)
}

/// Largest `end` such that `ordered[start..end]` compresses at `quality` to
/// at most [`CHUNK_TARGET_BYTES`], plus the compressed bytes of that prefix.
/// The boundary is bracketed by a doubling ladder of probes and then narrowed
/// by refinement rounds; each round's probes compress concurrently, and the
/// winning probe's bytes are returned so nothing is compressed twice.
fn search_boundary(
    subsetter: &Subsetter,
    ordered: &[u32],
    start: usize,
    quality: usize,
) -> Result<(usize, Vec<u8>)> {
    // Invariant: `lo` fits (or is `start`, unmeasured), `hi` exceeds (or is
    // the end of the input).
    let mut lo = start;
    let mut lo_bytes: Option<Vec<u8>> = None;
    let mut hi = ordered.len();

    // Doubling ladder until one rung overshoots or the input runs out.
    let mut rung = LADDER_FIRST;
    while hi - start > LADDER_FIRST {
        let mut batch = Vec::new();
        while batch.len() < LADDER_BATCH && start + rung < hi {
            batch.push(start + rung);
            rung *= 2;
        }
        if start + rung >= hi && batch.last().copied() != Some(hi) {
            batch.push(hi);
        }
        let results = probe_batch(subsetter, ordered, start, &batch, quality)?;
        match results
            .iter()
            .position(|(_, bytes)| bytes.len() > CHUNK_TARGET_BYTES)
        {
            Some(overshot) => {
                hi = results[overshot].0;
                if overshot > 0 {
                    let (end, bytes) = &results[overshot - 1];
                    lo = *end;
                    lo_bytes = Some(bytes.clone());
                }
                break;
            }
            None => {
                let (end, bytes) = results.last().expect("batch is never empty");
                if *end == hi {
                    return Ok((hi, bytes.clone()));
                }
                lo = *end;
                lo_bytes = Some(bytes.clone());
            }
        }
    }

    // `lo` may still be unmeasured; `start + 1` always fits (a single
    // codepoint compresses to a few KB), so measure it as the floor.
    let (lo, lo_bytes) = match lo_bytes {
        Some(bytes) => (lo, bytes),
        None => (
            start + 1,
            compress_at(subsetter, &ordered[start..start + 1], quality)?,
        ),
    };
    refine(subsetter, ordered, start, lo, lo_bytes, hi, quality)
}

/// Narrow `(lo, hi)` down to the largest fitting `end` at `quality` and
/// return its compressed bytes. `lo` must fit; `hi` must exceed (or be the
/// end of the input, which still bounds the search). Each round probes
/// [`PROBE_FANOUT`] evenly spaced candidates concurrently, shrinking the
/// bracket by a factor of `PROBE_FANOUT + 1`. Sizes are only *mostly*
/// monotonic in prefix length, so a fitting probe above an overshooting one
/// is ignored: the first overshoot owns the boundary, exactly like a binary
/// search that stops looking above its first failing midpoint.
#[allow(clippy::too_many_arguments)]
fn refine(
    subsetter: &Subsetter,
    ordered: &[u32],
    start: usize,
    mut lo: usize,
    mut lo_bytes: Vec<u8>,
    mut hi: usize,
    quality: usize,
) -> Result<(usize, Vec<u8>)> {
    while hi - lo > 1 {
        let width = hi - lo;
        let mut probes: Vec<usize> = (1..=PROBE_FANOUT)
            .map(|i| lo + width * i / (PROBE_FANOUT + 1))
            .filter(|&probe| probe > lo && probe < hi)
            .collect();
        probes.dedup();
        if probes.is_empty() {
            break;
        }
        let results = probe_batch(subsetter, ordered, start, &probes, quality)?;
        if let Some(overshot) = results
            .iter()
            .position(|(_, bytes)| bytes.len() > CHUNK_TARGET_BYTES)
        {
            hi = results[overshot].0;
        }
        for (end, bytes) in results.into_iter().take_while(|&(end, _)| end < hi) {
            if end > lo {
                lo = end;
                lo_bytes = bytes;
            }
        }
    }
    Ok((lo, lo_bytes))
}

/// Compress every `ordered[start..end]` prefix concurrently, in `ends` order.
fn probe_batch(
    subsetter: &Subsetter,
    ordered: &[u32],
    start: usize,
    ends: &[usize],
    quality: usize,
) -> Result<Vec<(usize, Vec<u8>)>> {
    ends.par_iter()
        .map(|&end| compress_at(subsetter, &ordered[start..end], quality).map(|bytes| (end, bytes)))
        .collect()
}

/// Assemble a chunk from its (unsorted) codepoints and compressed bytes.
fn build_chunk(codepoints: &[u32], bytes: Vec<u8>, name_prefix: &str, number: usize) -> FontChunk {
    let mut sorted = codepoints.to_vec();
    sorted.sort_unstable();
    // `name_prefix` is the series template, e.g. `font.patch.woff2`; chunk
    // names insert the series number before the extension.
    let (stem, extension) = split_file_name(name_prefix);
    let file_name = hashed_output_file_name(&format!("{stem}-{number}.{extension}"), &bytes);
    FontChunk {
        codepoints: sorted,
        file_name,
        bytes,
    }
}

fn compress(subsetter: &Subsetter, codepoints: &[u32]) -> Result<Vec<u8>> {
    compress_at(subsetter, codepoints, FINAL_QUALITY)
}

fn compress_at(subsetter: &Subsetter, codepoints: &[u32], quality: usize) -> Result<Vec<u8>> {
    let subset = subsetter.subset(codepoints)?;
    woofwoof::compress(&subset, "", quality, true).context("failed to compress WOFF2 chunk")
}

#[cfg(test)]
mod tests {
    use super::{chunk_font, CHUNK_MIN_BYTES, CHUNK_TARGET_BYTES};
    use crate::font::asset::Subsetter;
    use crate::font::coverage::font_codepoints;
    use std::collections::BTreeSet;
    use std::fs;

    const SOURCE: &str = "themes/hibikilogy/static/fonts/SourceHanSansSC-VF.ttf";

    #[test]
    fn chunks_respect_size_target_and_stay_disjoint() {
        let font_data = fs::read(SOURCE).expect("committed source font should exist");
        let subsetter = Subsetter::new(&font_data).unwrap();
        // A few dozen hanzi are enough to exercise the size limit without a
        // minutes-long subsetting loop.
        let codepoints: Vec<u32> = (0x4E00..0x4E00 + 40).collect();
        let chunks = chunk_font(&subsetter, &codepoints, "probe").expect("chunking should succeed");

        assert!(!chunks.is_empty());
        for chunk in &chunks[..chunks.len().saturating_sub(1)] {
            assert!(
                chunk.bytes.len() <= CHUNK_TARGET_BYTES + 8 * 1024,
                "chunk {} overshot the target: {} bytes",
                chunk.file_name,
                chunk.bytes.len()
            );
        }
        let mut seen = BTreeSet::new();
        for chunk in &chunks {
            for &cp in &chunk.codepoints {
                assert!(seen.insert(cp), "codepoint U+{cp:04X} in two chunks");
            }
            assert!(font_codepoints(&chunk.bytes).is_ok());
        }
        assert_eq!(seen.len(), codepoints.len());
        if chunks.len() > 1 {
            assert!(chunks.last().unwrap().bytes.len() >= CHUNK_MIN_BYTES);
        }
        assert!(chunks[0].file_name.starts_with("probe-1."));
    }

    #[test]
    fn chunking_is_deterministic_for_identical_input() {
        let font_data = fs::read(SOURCE).expect("committed source font should exist");
        let subsetter = Subsetter::new(&font_data).unwrap();
        let codepoints: Vec<u32> = (0x4E00..0x4E00 + 12).collect();
        let first = chunk_font(&subsetter, &codepoints, "probe").expect("chunking should succeed");
        let second = chunk_font(&subsetter, &codepoints, "probe").expect("chunking should succeed");
        assert_eq!(first, second, "same input must produce identical chunks");
    }
}
