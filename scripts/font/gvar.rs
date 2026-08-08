//! Rebuild of the `gvar` table in skera subset output.
//!
//! skera (verified on 0.3.0 through 0.5.1 / fontations `main`, 2026-08)
//! estimates the subset GlyphVariationData size with the **new** glyph IDs
//! (`skera/src/gvar.rs`: `data_for_gid(x.0)` over `new_to_old_gid_list`)
//! but embeds the data of the **old** glyph IDs. When the source font's
//! first N glyphs carry less variation data than the glyphs actually
//! retained — always the case for CJK subsets of Source Han — the estimate
//! falls below the Offset16 limit while the real data exceeds it, so skera
//! writes a short offset array whose truncated values point nowhere
//! (`(real_offset / 2) mod 0x10000`). The table is internally inconsistent
//! and renderers that apply `gvar` deltas (Chromium/Skia, FreeType) fail
//! per glyph: the affected characters render as `.notdef` tofu even though
//! `cmap` and `glyf` are intact.
//!
//! Until the upstream fix lands we rebuild `gvar` from the source font's
//! per-glyph variation data with a correct offset array. Subset glyphs are
//! matched back to source glyphs by their `glyf` outline bytes: skera
//! copies outlines verbatim and `gvar` deltas reference outline point
//! indices, so a byte-identical outline implies interchangeable variation
//! data. Identical outlines (e.g. the thousands of empty glyphs in a CJK
//! font) are disambiguated by skera's construction order: its glyph set is
//! an `IntSet` iterated in ascending order, so the old glyph IDs retained
//! in the subset strictly ascend with the new glyph IDs. A unique match
//! that violates that order, or no match at all, fails the build rather
//! than risking a silent mismatch.

use anyhow::{anyhow, Context, Result};
use std::collections::HashMap;
use write_fonts::read::tables::gvar::Gvar;
use write_fonts::read::{FontRef, TableProvider, TopLevelTable};
use write_fonts::types::GlyphId;
use write_fonts::FontBuilder;

const GVAR_HEADER_LEN: u32 = 20;
/// Maximum GlyphVariationData size addressable by short (Offset16) offsets:
/// stored values are real offsets divided by two, so `2 * 0xFFFF`.
const SHORT_OFFSET_LIMIT: usize = 0x1_FFFE;

/// Return `subset_data` with its `gvar` table rebuilt from `source_data`.
/// Fonts without `gvar` (either side) pass through unchanged.
pub fn repair_subset_gvar(source_data: &[u8], subset_data: &[u8]) -> Result<Vec<u8>> {
    let source = FontRef::new(source_data).context("failed to parse source font")?;
    let subset = FontRef::new(subset_data).context("failed to parse subset font")?;

    let (Ok(source_gvar), Ok(_)) = (source.gvar(), subset.gvar()) else {
        return Ok(subset_data.to_vec());
    };

    let source_spans = glyph_spans(&source).context("failed to read source glyf/loca")?;
    let subset_spans = glyph_spans(&subset).context("failed to read subset glyf/loca")?;
    let blobs = resolve_source_blobs(&source_gvar, &source_spans, &subset_spans)?;

    let rebuilt = serialize_gvar(&source_gvar, &blobs)?;

    // Rebuild the font with the repaired table. `FontBuilder` re-sorts the
    // directory and recomputes table checksums and `checkSumAdjustment`.
    let mut builder = FontBuilder::new();
    for record in subset.table_directory().table_records() {
        let tag = record.tag();
        if tag == Gvar::TAG {
            continue;
        }
        let data = subset
            .table_data(tag)
            .ok_or_else(|| anyhow!("failed to read subset table {tag}"))?;
        builder.add_raw(tag, data.as_bytes().to_vec());
    }
    builder.add_raw(Gvar::TAG, rebuilt);
    Ok(builder.build())
}

/// Resolve each subset glyph to its source glyph's variation blob by
/// matching `glyf` outline bytes. skera builds `new_to_old_gid_list` from an
/// `IntSet` iterated ascending, so matched old gids must strictly increase
/// with the new gid; that order also disambiguates identical outlines.
fn resolve_source_blobs<'a>(
    source_gvar: &Gvar<'a>,
    source_spans: &[&'a [u8]],
    subset_spans: &[&[u8]],
) -> Result<Vec<&'a [u8]>> {
    let mut by_digest: HashMap<u64, Vec<u32>> = HashMap::new();
    for (gid, span) in source_spans.iter().enumerate() {
        by_digest
            .entry(outline_digest(unpadded(span)))
            .or_default()
            .push(gid as u32);
    }

    let mut blobs: Vec<&[u8]> = Vec::with_capacity(subset_spans.len());
    let mut prev_old_gid: i64 = -1;
    for (new_gid, span) in subset_spans.iter().enumerate() {
        let needle = unpadded(span);
        let matching: Vec<u32> = by_digest
            .get(&outline_digest(needle))
            .into_iter()
            .flatten()
            .copied()
            .filter(|&old_gid| unpadded(source_spans[old_gid as usize]) == needle)
            .collect();
        let old_gid = match matching.as_slice() {
            [] => {
                return Err(anyhow!(
                    "subset glyph {new_gid} outline ({} bytes) not found in source font",
                    span.len()
                ));
            }
            &[only] => {
                if only as i64 <= prev_old_gid {
                    return Err(anyhow!(
                        "subset glyph {new_gid} matches source glyph {only} but retained glyph \
                         IDs must ascend (previous match was {prev_old_gid})"
                    ));
                }
                only
            }
            several => several
                .iter()
                .copied()
                .filter(|&gid| gid as i64 > prev_old_gid)
                .min()
                .unwrap_or_else(|| several[0]),
        };
        prev_old_gid = i64::from(old_gid);
        blobs.push(
            source_gvar
                .data_for_gid(GlyphId::new(old_gid))
                .context("failed to read source gvar data")?
                .map(|data| data.as_bytes())
                .unwrap_or(&[]),
        );
    }
    Ok(blobs)
}

/// Raw `glyf` bytes per glyph, sliced via `loca`.
fn glyph_spans<'a>(font: &FontRef<'a>) -> Result<Vec<&'a [u8]>> {
    let glyf = font.glyf().context("font has no glyf table")?;
    let is_long = font.head()?.index_to_loc_format() == 1;
    let loca = font.loca(is_long).context("font has no loca table")?;
    let bytes = glyf.offset_data().as_bytes();
    let glyph_count = font.maxp().context("font has no maxp table")?.num_glyphs() as usize;
    let mut spans = Vec::with_capacity(glyph_count);
    for gid in 0..glyph_count {
        let start = loca
            .get_raw(gid)
            .with_context(|| format!("loca entry {gid} missing"))? as usize;
        let end = loca
            .get_raw(gid + 1)
            .with_context(|| format!("loca entry {} missing", gid + 1))? as usize;
        spans.push(
            bytes
                .get(start..end)
                .with_context(|| format!("glyph {gid} span {start}..{end} out of bounds"))?,
        );
    }
    Ok(spans)
}

/// FNV-1a over the outline bytes. Collisions are harmless: candidates are
/// always verified by full byte comparison before use.
fn outline_digest(span: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for &byte in span {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// Glyph data is 2-byte aligned; some producers (skera TTF output) include a
/// trailing zero pad byte in the `loca` span while others (WOFF2 round-trip,
/// the source font) exclude it. Trim trailing zeros while the length stays
/// even and above the 10-byte glyph header so equivalent outlines compare
/// equal regardless of producer padding.
fn unpadded(span: &[u8]) -> &[u8] {
    let mut end = span.len();
    while end > 10 && end.is_multiple_of(2) && span[end - 1] == 0 {
        end -= 1;
    }
    &span[..end]
}

/// Serialize a `gvar` table: source header fields and shared tuples, freshly
/// computed offset array, then the per-glyph blobs. Short offsets are used
/// only when the padded data region truly fits them.
fn serialize_gvar(source_gvar: &Gvar, blobs: &[&[u8]]) -> Result<Vec<u8>> {
    let axis_count = source_gvar.axis_count();
    let shared_tuple_count = source_gvar.shared_tuple_count();
    let shared_tuples_size = u32::from(axis_count) * u32::from(shared_tuple_count) * 2;
    let source_bytes = source_gvar.offset_data().as_bytes();
    let shared_tuples = if shared_tuple_count == 0 {
        &[][..]
    } else {
        let start = source_gvar.shared_tuples_offset().to_u32() as usize;
        source_bytes
            .get(start..start + shared_tuples_size as usize)
            .context("source gvar shared tuples out of bounds")?
    };

    let glyph_count = u16::try_from(blobs.len()).context("subset glyph count exceeds u16")?;
    let padded_size: usize = blobs.iter().map(|blob| blob.len() + blob.len() % 2).sum();
    let long_offsets = padded_size > SHORT_OFFSET_LIMIT;
    let offset_size: u32 = if long_offsets { 4 } else { 2 };
    let array_size = (u32::from(glyph_count) + 1) * offset_size;
    let shared_tuples_offset = if shared_tuple_count == 0 {
        0
    } else {
        GVAR_HEADER_LEN + array_size
    };
    let data_offset = GVAR_HEADER_LEN + array_size + shared_tuples_size;

    let mut table = Vec::with_capacity(data_offset as usize + padded_size);
    // version (1.0) is copied from the source header.
    table.extend_from_slice(
        source_bytes
            .get(0..4)
            .context("source gvar header truncated")?,
    );
    table.extend_from_slice(&axis_count.to_be_bytes());
    table.extend_from_slice(&shared_tuple_count.to_be_bytes());
    table.extend_from_slice(&shared_tuples_offset.to_be_bytes());
    table.extend_from_slice(&glyph_count.to_be_bytes());
    table.extend_from_slice(&u16::from(long_offsets).to_be_bytes());
    table.extend_from_slice(&data_offset.to_be_bytes());

    let write_offset = |table: &mut Vec<u8>, offset: u32| {
        if long_offsets {
            table.extend_from_slice(&offset.to_be_bytes());
        } else {
            let stored = u16::try_from(offset / 2).expect("short offset must fit u16");
            table.extend_from_slice(&stored.to_be_bytes());
        }
    };
    let mut offset: u32 = 0;
    write_offset(&mut table, 0);
    for blob in blobs {
        offset += blob.len() as u32;
        if !long_offsets && blob.len() % 2 != 0 {
            offset += 1;
        }
        write_offset(&mut table, offset);
    }
    table.extend_from_slice(shared_tuples);
    for blob in blobs {
        table.extend_from_slice(blob);
        if !long_offsets && blob.len() % 2 != 0 {
            table.push(0);
        }
    }
    Ok(table)
}

#[cfg(test)]
mod tests {
    use super::{repair_subset_gvar, GVAR_HEADER_LEN};
    use crate::font::asset::subset_with_skera;
    use std::collections::HashMap;
    use std::fs;
    use write_fonts::read::tables::gvar::Gvar;
    use write_fonts::read::{FontRef, TableProvider, TopLevelTable};
    use write_fonts::types::GlyphId;

    /// (long_format, offset array, data region length) of a font's gvar.
    fn gvar_offsets(font: &FontRef) -> (bool, Vec<u32>, usize) {
        let gvar = font.gvar().expect("gvar should parse");
        let bytes = gvar.offset_data().as_bytes();
        let glyph_count = gvar.glyph_count() as usize;
        let long = gvar.flags().bits() & 1 == 1;
        let data_offset = gvar.glyph_variation_data_array_offset() as usize;
        let mut offsets = Vec::with_capacity(glyph_count + 1);
        for i in 0..=glyph_count {
            let entry = if long {
                let start = GVAR_HEADER_LEN as usize + i * 4;
                u32::from_be_bytes(bytes[start..start + 4].try_into().unwrap())
            } else {
                let start = GVAR_HEADER_LEN as usize + i * 2;
                u32::from(u16::from_be_bytes(
                    bytes[start..start + 2].try_into().unwrap(),
                )) * 2
            };
            offsets.push(entry);
        }
        (long, offsets, bytes.len() - data_offset)
    }

    /// codepoint -> gid map merged from all of the font's cmap subtables
    /// (source and subset may pick different "best" subtables).
    fn cmap_gids(font: &FontRef) -> HashMap<u32, u32> {
        let mut map = HashMap::new();
        let cmap = font.cmap().unwrap();
        for record in cmap.encoding_records() {
            let subtable = record.subtable(cmap.offset_data()).unwrap();
            for (codepoint, gid) in subtable.iter() {
                map.insert(codepoint, gid.to_u32());
            }
        }
        map
    }

    #[test]
    fn repair_produces_consistent_offsets_for_real_subset() {
        let font_data = fs::read("themes/hibikilogy/static/fonts/SourceHanSansSC-VF.ttf")
            .expect("committed source font should exist");
        // Latin, hanzi, and punctuation, mirroring a real body-font subset.
        let requested = [
            0x41, 0x42, 0x43, 0x4E00, 0x7684, 0x3001, 0x7EEB, 0x94E0, 0x9719, 0x51A2,
        ];
        let subset = subset_with_skera(&font_data, &requested).expect("subset should succeed");
        let font = FontRef::new(&subset).expect("subset should parse");

        let (_long, offsets, data_region) = gvar_offsets(&font);
        assert!(
            offsets.windows(2).all(|pair| pair[0] <= pair[1]),
            "offsets must be monotonic"
        );
        assert_eq!(
            *offsets.last().unwrap(),
            data_region as u32,
            "last offset must cover the whole data region"
        );

        // For every cmap-reachable codepoint the subset glyph must carry the
        // exact variation blob of the matching source glyph.
        let source = FontRef::new(&font_data).unwrap();
        let source_gvar = source.gvar().unwrap();
        let subset_gvar = font.gvar().unwrap();
        let source_cmap = cmap_gids(&source);
        for (codepoint, new_gid) in cmap_gids(&font) {
            let old_gid = source_cmap[&codepoint];
            let expected = source_gvar
                .data_for_gid(GlyphId::new(old_gid))
                .unwrap()
                .map(|data| data.as_bytes().to_vec());
            let actual = subset_gvar
                .data_for_gid(GlyphId::new(new_gid))
                .unwrap()
                .map(|data| data.as_bytes().to_vec());
            assert_eq!(actual, expected, "gvar blob mismatch for U+{codepoint:04X}");
        }
    }

    #[test]
    fn repair_preserves_other_tables_and_is_idempotent() {
        let font_data = fs::read("themes/hibikilogy/static/fonts/SourceHanSerifCN-VF.ttf")
            .expect("committed source font should exist");
        let requested = [0x41, 0x42, 0x43, 0x4E00, 0x7684, 0x3001];
        // subset_with_skera already repairs; running the repair a second time
        // over its output must reproduce the identical gvar table.
        let subset = subset_with_skera(&font_data, &requested).expect("subset should succeed");
        let twice = repair_subset_gvar(&font_data, &subset).expect("second repair should succeed");
        let gvar_bytes = |data: &[u8]| {
            let font = FontRef::new(data).unwrap();
            font.table_data(Gvar::TAG).unwrap().as_bytes().to_vec()
        };
        assert_eq!(gvar_bytes(&subset), gvar_bytes(&twice));

        // Non-gvar tables survive the rebuild byte-for-byte.
        let before = FontRef::new(&subset).unwrap();
        let after = FontRef::new(&twice).unwrap();
        for record in before.table_directory().table_records() {
            let tag = record.tag();
            if tag == Gvar::TAG {
                continue;
            }
            assert_eq!(
                before.table_data(tag).map(|data| data.as_bytes()),
                after.table_data(tag).map(|data| data.as_bytes()),
                "table {tag} changed"
            );
        }
    }
}
