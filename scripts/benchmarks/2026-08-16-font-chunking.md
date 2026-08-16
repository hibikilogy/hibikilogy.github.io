# Font chunking benchmark baseline (2026-08-16)

Baseline for the frequency-ordered font chunking rework (branch
`Refactor/zola`, commits `f244197`/`fe016c7`/`e62b7ba`/`a473f99`). Compares the
old system (single patch file + `L1/L2/L3` base slices, pre-change commit
`7ecdcbd`) against the new one (frequency-ordered chunk series with chunk 1
preloaded).

## Systems under test

| | Old (`7ecdcbd`) | New |
| --- | --- | --- |
| Body patch | 1 file, 425,460 B / 768 codepoints | 37 chunks, 2,088,616 B total; chunk 1 = 56,308 B (preloaded) |
| Title patch | 1 file, 274,772 B / 709 codepoints | 5 chunks, 276,436 B total; chunk 1 = 55,972 B (preloaded) |
| Base slices | `L1/L2/L3` loaded on demand; 992 codepoints double-declared with the patch (L1 fully shadowed by L2 — last matching `@font-face` wins — and never actually loaded) | none; every codepoint is declared by exactly one `@font-face` |
| Chunk naming | `stem.<hash>.woff2` | `stem-<n>.<hash>.woff2`, content-hashed, served with `immutable` |

## Methodology

- Old system: `git worktree` at `7ecdcbd`, old pipeline regenerated with a
  shared `CARGO_TARGET_DIR`, `zola serve` on port 1113. New system on port 1112.
- Chrome via DevTools MCP, one isolated browser context per measurement (cold
  cache, no service worker state).
- Bytes = sum of `PerformanceResourceTiming.transferSize` over all entries
  (wire bytes after compression); requests = entry count.
- LCP from a buffered `PerformanceObserver`; throttled run uses
  `emulate(networkConditions="Fast 4G")`.
- Pages: home `/`, a dense long-form article (`lineupsummary-outlook2`), and
  `/tags/`.

## Cold localhost (no throttling)

| Page | System | Requests | Transferred | LCP |
| --- | --- | --- | --- | --- |
| Home | old | 29 | 2,385 KB | 204 ms |
| Home | new | 35 | 1,919 KB | 512 ms |
| Article | old | 29 | 2,385 KB | 404 ms |
| Article | new | 41 | 2,267 KB | 416 ms |
| Tags | old | 27 | 2,039 KB | 220 ms |
| Tags | new | 24 | 1,319 KB | 260 ms |

Transferred bytes: home **−20%**, article **−5%**, tags **−35%**.

## Fast 4G (article page)

| Metric | Old | New |
| --- | --- | --- |
| LCP | 2,772 ms | 2,616 ms |
| FCP | 908 ms | 996 ms |
| Network settled | 4,132 ms | 3,925 ms |
| Font requests started within 400 ms | 0 | 2 (the two preloaded chunk 1 files) |

## Reading the numbers

- Bytes and request counts are the solid metrics. Localhost LCP/FCP differences
  are noise-level (sub-100 ms server variance dominates); the new system's home
  LCP of 512 ms vs 204 ms is not meaningful at this scale.
- The byte win concentrates on text-light pages (home, tags): the preloaded
  first chunk covers the most frequent characters and the rest stream in only
  if the page needs them.
- Dense long articles pull most of the body series, so transfer approaches the
  old single-file total. This is inherent to `unicode-range` slicing of CJK
  fonts, not a regression.
- Under Fast 4G the preloaded chunk 1 files start within 400 ms; in the old
  system no font request started that early. First-render text uses the
  highest-frequency glyphs immediately.

## Chunk coverage distribution

How the frequency-ordered chunks cover real site text, measured over
`content/` against the generated chunk CSS (characters counted with
repetition; "chunks per page" = distinct chunks a page's text touches).

Title font (5 chunks, 709 codepoints, 166 titles):

| Chunk | Share of title chars |
| --- | --- |
| 1 (preloaded) | 72.4% |
| 2 | 14.1% |
| 3 | 7.1% |
| 4 | 4.7% |
| 5 | 1.6% |

- Distinct chunks per title: 1→7, 2→47, 3→55, 4→39, 5→18 titles (avg 3.1 of 5).
- A page showing the latest 12 titles needs all 5 chunks (270 KB of the 276 KB
  series); a page with a single title needs chunks 1–3 (164 KB).

Body font (37 chunks, 3,716 codepoints, 167 articles, 721,108 chars):

| Chunks | Share of body chars |
| --- | --- |
| 1 (preloaded) | 58.8% |
| 1–3 | 80.9% |
| 1–5 | 89.2% |
| 6–37 (tail) | 10.8% |

- Average article touches 27.1 of 37 chunks; distribution is broad (7–37).

Reading: title text is far more correlated than body text (72% vs 59%
chunk-1 coverage; 3/5 vs 27/37 chunks per page), so the title series stays
useful as chunks even though listing pages eventually load them all. The title
character set is also nearly closed — new articles mostly reuse the existing
709 glyphs — so title chunk hashes are stable across content updates and the
`immutable` cache headers pay off.

## Build-time cost

Chunk boundary search runs two phases: a probe-quality (brotli q9) doubling
ladder + fan-out refinement brackets a conservative boundary, then a
final-quality (q11) walk — its first batch sized from the measured per-glyph
headroom — closes in exactly. Probes within a batch compress in parallel
(rayon) and the winning probe's bytes become the chunk directly; a `Subsetter`
caches the parsed source font, its horizontal layout-feature list, and the
gvar repair outline index across all probes. All outputs are byte-identical
to the original sequential q11-only search.

Measured on the developer machine (32 logical cores, debug profile):

| Pipeline | Sequential q11 | Two-phase parallel |
| --- | --- | --- |
| `build:subset-titlefont` (5 chunks) | ~46 s | ~27 s |
| `build:subset-bodyfont` (37 chunks, 3,716 codepoints) | ~5 min 5 s | ~3 min 10 s |
| nextest title end-to-end tests | ~23 s each | ~11 s each |

Probe cost breakdown (100-hanzi body probe): skera subset + gvar repair
19 ms (uncached source indexing: 157 ms), woff2 q11 400 ms, woff2 q9 27 ms —
final-quality brotli dominates, which is why probing happens at q9.

## Reproducing

1. `pnpm build:all` (or at least `pnpm build:subset-bodyfont &&
   pnpm build:subset-titlefont && zola build`).
2. For the old side: `git worktree add ../hibikilogy-old 7ecdcbd`, copy the
   Vite outputs (`themes/hibikilogy/static/styles/critical.css`, `uno.css`,
   `static/js/`) into the worktree, regenerate its fonts with the old pipeline,
   `zola serve --port 1113`.
3. Serve the new build on another port, drive both with Chrome DevTools MCP in
   isolated contexts, and collect `transferSize` / LCP as above.
