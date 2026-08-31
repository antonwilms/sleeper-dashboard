# Signal registry: advstats coverage reclassified to regular-season-only

**Type:** emitted `docs/signal-registry.md` row edit (CR-18), written by the data repo — it
cannot edit this file itself. Written into this repo's tracked `.claude/tasks/` per the
cross-repo registry's data→app ask channel (same mechanism as
`registry-anchor-appside.md`).

**Source:** data repo `advstats-grain-and-share.md` (2026-08-31) — `aggregateAdvReceiving`
(`lib/nflverse.mjs`) now filters to `season_type === 'REG'` before any accumulation and
fixed a sign bug in the `airYardsShare` weight (magnitude-weighted, `Σ|aₜ|` denominator,
instead of squaring the signed value against a signed denominator). All 14 served seasons
(`nflverse/advstats/2012.json`–`2025.json`) were re-ingested 2026-08-31.

## What actually changed (verified, not estimated)

- **Coverage** changes from *2012–2025, regular season + postseason combined
  (undocumented)* to *2012–2025, regular season only*. Two postseason-only players per
  season (players whose entire receiving activity in the file was playoff games) are no
  longer emitted at all.
- **Source** unchanged — nflverse `stats_player` release, `stats_player_week_<year>.csv`
  — now filtered on `season_type === 'REG'` at ingest. All 14 seasons also moved onto the
  current `stats_player` release tag as an incidental side effect (previously 11 seasons
  were served from a frozen legacy tag); this does not change the row shape or the
  reconstructable-vs-ephemeral status below.
- **Reconstructable** — unchanged. Postseason remains reconstructable from the same
  source CSV for anyone who later needs it (one `season_type` filter away).
- **Current use** unchanged — still capture-only / view-only, per the existing rows.
- **Served `schemaVersion` unchanged at 1** — the layout does not move, only values and
  row membership.
- **Magnitude of the change:** `components` volumes (targets/airYards/weeks) change for
  ~27% of rows per season (postseason volume removed from both player totals and team
  denominators); `targetShare`/`airYardsShare` ratios move by a median |Δ| of 0.004
  (max 0.034) — small, because postseason volume mostly cancels between numerator and
  denominator. Separately, the `airYardsShare` sign-bug fix moved 12 pathological rows
  across all 14 years (0.18% of 6,725 rows) — multi-team players whose split near-cancels
  to a small signed total, which the old formula squared into an out-of-range share (e.g.
  one row moved `0.102 → -0.001`). No magnitude floor was added; the corrected weight
  removes the failure mode by construction rather than by threshold.

## The two rows to edit

Both rows currently read the pre-2026-08-31 shape. Grep confirms exactly these two:

### 1. `docs/signal-registry.md` — verification-audit table (near line 18)

Current:
> `nflverse advstats (`targetShare`/`airYardsShare`/`wopr`/`racr`)` | per-year files | ✅
> **2012–2025, no gap** (2019 and 2025 filled). All years clear `MIN_ADVSTATS_ROWS=250`
> (min 324 in 2012). `racr`/`airYardsShare` null for ~10–25% of rows (RBs / no-air-yards)
> every year.

Proposed:
> `nflverse advstats (`targetShare`/`airYardsShare`/`wopr`/`racr`)` | per-year files,
> **regular season only since 2026-08-31** | ✅ **2012–2025, no gap** (2019 and 2025
> filled). All years clear `MIN_ADVSTATS_ROWS=250` (min ~324 in 2012, post-REG-filter
> counts run slightly lower than the pre-2026-08-31 figures — re-verify against the
> current files if this number is load-bearing anywhere). `racr`/`airYardsShare` null for
> ~10–25% of rows (RBs / no-air-yards) every year. **REG-only as of 2026-08-31** —
> postseason rows are excluded at ingest (`aggregateAdvReceiving`'s `season_type` filter);
> a player whose entire season here was playoff games is no longer emitted.

### 2. `docs/signal-registry.md` — canonical layer table (near line 55)

Current:
> `nflverse advanced receiving (`targetShare`, `airYardsShare`, `wopr`, `racr`, raw
> `components`)` | raw ingested data | data: `nflverse/advstats/<year>.json`
> (`scripts/update-advstats.mjs`); served `sleeper_id`-keyed | **2012–2025, no gap** (2019
> and 2025 filled); `airYardsShare`/`racr` ~10–25% null (RB) | **Reconstructable** from
> nflverse weekly stats (recompute season ratios) | **Rendered since dp-v2 Slice 5b** —
> `market/Market.jsx`'s Efficiency column set is the first UI consumer (`RACR`, WR/TE
> only, `advStats?.byId?.[id]?.racr` gated on `complete`); `AdvancedStatsPanel.jsx`
> ("Advanced & Usage"), the Explorer's renderer, was deleted in 1b Slice viii, and
> `targetShare`/`airYardsShare`/`wopr` remain unrendered. Recorded as **capture-only
> factor** in `seasonProjection.js` (WR/TE) — never moves `projectedPPG`

Proposed (Coverage column only; Layer/Source/Reconstructable/Current-use columns are
unchanged — see "What actually changed" above):
> **Coverage** column becomes: **2012–2025, regular season only** (no gap; 2019 and 2025
> filled); `airYardsShare`/`racr` ~10–25% null (RB). **Grain changed 2026-08-31** —
> previously regular season + postseason combined, undocumented; `aggregateAdvReceiving`
> now filters to `season_type === 'REG'` at ingest, so postseason volume no longer
> contributes to either player totals or team-share denominators, and two
> postseason-only players per season are no longer emitted at all. Postseason remains
> reconstructable from the same source CSV.

## Not part of this ask

- No `schemaVersion` note is needed anywhere — it did not change.
- No other row in either table needs touching — this reclassifies exactly one source
  (advstats), not gamelogs or any other nflverse family.
- This is not a `Mirror` matter and needs no `docs/cross-repo-registry.md` App-side edit
  beyond what the data repo already applied to its own `Data side`/`Triggers` (see the
  data repo's `advstats-grain-and-share.md` §3.5/§6 for that half — already landed,
  `aggregateAdvReceiving` added to CR-07's data-side `Triggers`).
