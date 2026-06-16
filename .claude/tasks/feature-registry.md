# Feature / Signal Registry — plan

**Model:** opus planned this file. **sonnet implements** (documentation-only). Read it
top to bottom, then implement exactly. If anything here contradicts existing code or is
ambiguous, **stop and ask** — do not improvise (per CLAUDE.md → Workflow convention).

**This is a documentation/cataloguing task. No source edits, no tests.** The deliverable
is one new doc plus two CLAUDE.md self-maintenance edits (one per repo) and one README
index line. The full classified registry is in §3 below — it IS the doc content.

---

## 0. Goal & scope

Operationalize the project's reconstructable-vs-ephemeral rule (from the "Advstats &
Signal Grading — Findings and Open Items" doc) into a single canonical, per-signal
catalogue spanning **both** repos:

- **`sleeper-dashboard-data`** ingests raw sources with non-uniform historical coverage.
- **`sleeper-dashboard`** (this repo) computes factors from them and captures ephemeral
  inputs at snapshot time.

The registry classifies every signal that **feeds, could feed, or is displayed**, plus
the ephemeral inputs captured at snapshot time. Raw sources are grouped sensibly (one row
per source/key-family), not enumerated stat-key-by-stat-key for unused keys.

Why this matters now: whether a signal is **reconstructable** (rebuildable from historical
files anytime → safe to defer) or **ephemeral** (lost forever if not captured at snapshot
time) governs every snapshot-capture and grading-inclusion decision. The snapshot
persistence layer has been waiting on this inventory; this registry *is* that inventory.

**Do not re-list CLAUDE.md invariants here.** The registry points to them
(capture-only contract, advstats-view-only, ephemeral-inputs-must-be-snapshotted).

---

## 1. Home recommendation + justification

**Home: this repo (app), at `docs/signal-registry.md`.** (Confirms the task's lean.)

Justification, after surveying both repos' doc structures:

1. **The classification axis is an app-side concern.** Every row's *Reconstructable vs
   ephemeral* and *Current use* value is determined by how the **app** consumes the
   signal — whether it feeds `projectedPPG`, the dynasty score, a capture-only factor, or
   a view-only panel. The data repo only knows a field's raw coverage, not its role.
2. **The primary consumer of the rule lives here.** The reconstructable/ephemeral split
   drives `src/utils/projectionSnapshot.js` capture decisions and the
   "Ephemeral inputs must be snapshotted contemporaneously" invariant — both app-side.
   The doc should sit next to the logic it governs.
3. **Co-location with the factor catalog.** The app already has a structured `docs/`
   (`architecture.md`, `projection.md`, `dynasty-scoring.md`, `integrations.md`, `ui.md`)
   indexed from `README.md → Documentation`. `signal-registry.md` slots in beside
   `projection.md`/`dynasty-scoring.md` (which define the factors it classifies) and
   `integrations.md` (which documents the raw sources).
4. **The data repo has no `docs/` directory.** Its documentation is one ~40 KB monolithic
   `README.md` plus `CLAUDE.md` and `snapshot-workflow.md`. A multi-section registry there
   would either bloat the README or create the first stray top-level doc — strictly worse
   for discoverability than the app's existing indexed `docs/`.
5. **Most rows are app-side.** Computed factors (the majority of the registry) and the
   ephemeral captures all originate in this repo; only the raw-source rows are data-side,
   and those are already cross-referenced from `integrations.md`.

The grading harness (`bin/grade.mjs`) is the *other* consumer and lives in the data repo,
but grading **inclusion** is downstream of snapshot **capture** — you can only grade what
was captured. The capture decision is the time-critical one (miss it and the signal is
gone), and it is app-side. So the app is the correct home even though grading is not.

**Cross-repo obligation:** because the registry is hosted here, the data repo's
`CLAUDE.md` gets (a) a self-maintenance flag for its ingest layer and (b) a pointer line
to this doc. Exact text in §6.

---

## 2. Coverage verification — data-checked, not assumed

Per the field-existence rule and the `off_snp`-2020+ cautionary case, coverage below was
**verified against the actual data files** in `sleeper-dashboard-data`, not read from docs.
Method: counted finite values per stat key per season across
`nfl/season-totals/2012–2025.json`, and enumerated the `nflverse/`, `college/`, `ktc/`,
`snapshots/`, `enrichment/` directories. Findings that **correct or sharpen** the docs:

| Signal | Doc/assumption | **Verified actual** |
|---|---|---|
| `off_snp` (player off. snaps) | "2020+" | ✅ **Confirmed 2020+.** Zero finite rows 2012–2019; 1254 rows in 2020. The cautionary case holds. |
| `tm_off_snp` (team off. snaps) | implied alongside `off_snp` | ⚠️ **2012+** (1182 rows in 2012) — the *denominator* predates the *numerator* by 8 seasons. Snap-share = `off_snp/tm_off_snp` is therefore gated by `off_snp` → **snap share is 2020+**, but the limiter is the numerator, not the denominator. |
| `rec_air_yd` (aDOT input) | "2012–present" | ✅ **Confirmed 2012+** (349 rows in 2012). |
| `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` (RZ usage) | not pinned | ✅ **2012+**, all three (2012 lighter: 148/98/71 rows; full coverage 2013+). |
| `pass_cmp` + passer-rating keys | "preserved, present" | ✅ **2012+** (97 rows in 2012). |
| nflverse advstats (`targetShare`/`airYardsShare`/`wopr`/`racr`) | per-year files | ⚠️ **2012–2024 with a real hole at 2019** (file absent; sequence is …2018, **2020**…). **2025 not yet published** (offseason). All present years clear `MIN_ADVSTATS_ROWS=250` (min 324 in 2012). `racr`/`airYardsShare` null for ~10–25% of rows (RBs / no-air-yards) every year. |
| nflverse roster (team/position/status) | current + per-year | ⚠️ **2024, 2025, 2026 only** — no historical roster before 2024. |
| CFBD college (passing/receiving/rushing) | per-year | ✅ **2017–2024** (no earlier seasons ingested). |
| KTC snapshots (history) | time series | ⚠️ **Starts 2026-05-18** — only 3 snapshots exist (2026-05-18, -06-01, and one more). The `ktcHist*` factor family has **~1 month** of history; everything before mid-May 2026 is **unrecoverable** (KTC exposes no historical API). |
| NFL season-totals 2025 | completed season | ⚠️ Still `inProgress: true` in `manifest.json` — treat 2025 as the in-season/mutable file (re-exportable), not a frozen completed season. |
| Enrichment overlay | coaching/scheme/injuries/notes | ⚠️ Only **`coaching.json` is populated (95 entries)**; `scheme.json`, `injuries.json`, `notes.json` are **empty scaffolds** (0 entries) → unused/candidate. |

**Key takeaway for the snapshot layer:** the two signals with the thinnest, most
irrecoverable history are **KTC value/history** (capture began 2026-05-18) and **per-season
NFL team / depth / status** (nflverse roster only 2024+; pre-2024 is ephemeral-only). These
are the highest-priority contemporaneous captures.

---

## 3. The registry (complete, all six columns)

> **This table is the deliverable.** §5 specifies it be written verbatim (with the §3
> preamble) to `docs/signal-registry.md`. Columns: **Name · Layer · Source · Historical
> coverage · Reconstructable vs ephemeral · Current use.**
>
> *Layer* ∈ {raw ingested data, computed factor, ephemeral capture}.
> *Current use* vocabulary: **active→projectedPPG**, **active→dynasty score**,
> **capture-only factor** (recorded in `factors`, must not move `projectedPPG` — see
> CLAUDE.md capture-only invariant), **view-only display**, **unused/candidate**.
> "Coverage" floors are bounded by ingestion start (Sleeper season-totals begin 2012);
> deeper history is backfillable from the live source unless noted, which is what makes a
> raw row *reconstructable*.

### 3A. Raw ingested data (`sleeper-dashboard-data`)

| Name | Layer | Source | Historical coverage | Reconstructable vs ephemeral | Current use |
|---|---|---|---|---|---|
| Fantasy scoring core (`fantasyPoints`, `weeklyPoints`, `gp`, `gamesStarted`, `dnpWeeks`, `byeWeeks`, `weeklyStatus`, `availability`) | raw ingested data | data: `nfl/season-totals/<year>.json` ← Sleeper season totals (`lib/sleeper.mjs`) | **2012–2025** (2025 `inProgress`) | **Reconstructable** — Sleeper is the live source; backfillable per season. (FP recomputed weekly from `stats` × `scoringSettings`, never summed.) | active→projectedPPG (base PPG, momentum, regression, durability) + active→dynasty score |
| Snap counts — numerator `off_snp` | raw ingested data | `nfl/season-totals` stat key `off_snp` | **2020+ only** (verified zero 2012–2019) | **Reconstructable 2020+** (Sleeper provides it 2020-on); **structurally absent pre-2020** — not backfillable from this source | active→projectedPPG (snap-share, durability contributor test) |
| Snap counts — denominator `tm_off_snp` | raw ingested data | `nfl/season-totals` stat key `tm_off_snp` | **2012+** | **Reconstructable** | active→projectedPPG (snap-share denominator) |
| Red-zone opportunities (`rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) | raw ingested data | `nfl/season-totals` stat keys | **2012+** (full 2013+) | **Reconstructable** | active→projectedPPG (D2 own-rate RZ usage + D3 team-RZ-share) |
| Passing efficiency keys (`pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int`) | raw ingested data | `nfl/season-totals` stat keys | **2012+** | **Reconstructable** | active→projectedPPG (QB passer-rating efficiency) |
| Receiving volume/air (`rec`, `rec_tgt`, `rec_air_yd`, `rec_yd`, `rec_td`) | raw ingested data | `nfl/season-totals` stat keys | **2012+** (`rec_air_yd` confirmed 2012) | **Reconstructable** | active→projectedPPG (shares, efficiency) + `rec_air_yd`/`rec_tgt` feed capture-only aDOT |
| Rushing volume (`rush_att`, `rush_yd`, `rush_td`) | raw ingested data | `nfl/season-totals` stat keys | **2012+** | **Reconstructable** | active→projectedPPG (shares, efficiency) |
| nflverse advanced receiving (`targetShare`, `airYardsShare`, `wopr`, `racr`, raw `components`) | raw ingested data | data: `nflverse/advstats/<year>.json` (`scripts/update-advstats.mjs`); served `sleeper_id`-keyed | **2012–2024, gap at 2019, 2025 pending**; `airYardsShare`/`racr` ~10–25% null (RB) | **Reconstructable** from nflverse weekly stats (2019 backfillable if nflverse has it; recompute season ratios) | **view-only display** (Player Profile "Advanced & Usage"); recorded as **capture-only factor** in `seasonProjection.js` (WR/TE) — never moves `projectedPPG` |
| nflverse roster (team, position, status, fullName) | raw ingested data | data: `nflverse/roster/<year>.json` (`scripts/update-roster.mjs`); `sleeper_id`-keyed | **2024, 2025, 2026 only** | **Reconstructable 2024+** (nflverse season rosters); **pre-2024 not ingested** → historical season team/status is ephemeral-only before 2024 | active→projectedPPG indirectly (active-roster relevance gate, `nflRoster.js`) |
| nflverse draft picks (`round`, `pick`, `season`, draft slot) | raw ingested data | data: `nflverse/draft/draft_picks.json` (`scripts/update-draft.mjs`), all years ≥ 2010 | **2010+** | **Reconstructable** — draft slot is a permanent historical record | active→projectedPPG (rookie path NFL-draft-slot multiplier, `nflDraft.js`) |
| nflverse playerids crosswalk (`gsis_id ↔ sleeper_id`) | raw ingested data | data: `nflverse/playerids.json` (`scripts/update-playerids.mjs`) | all players (current) | **Reconstructable** | **internal-only** (server-side join for advstats re-keying); not an app loader — supports view-only advstats |
| CFBD college stats (passing / receiving / rushing categories) | raw ingested data | data: `college/{passing,receiving,rushing}/<year>.json` (`scripts/update-cfbd.mjs`) | **2017–2024** | **Reconstructable** via CFBD API (key required); pre-2017 not ingested → breakout-age unavailable for players whose college career predates 2017 | active→projectedPPG (rookie path: dominator, breakout age, production trend) |
| KTC dynasty value (per-player `value`, `confidence`) — **current** | raw ingested data | DOM-scraped; app `src/api/ktc.js` (live) + data `ktc/snapshot-<date>.json` (`scripts/update-ktc.mjs`) | live = current; **stored snapshots from 2026-05-18** | **Ephemeral** — KTC exposes no history; today's value is reconstructable today only, lost if not snapshotted | active→dynasty score (market divergence, KTC percentile) |
| KTC value **history** (time series across snapshot dates) | raw ingested data | data `ktc/snapshot-<date>.json` series → app `src/utils/ktcHistory.js` | **2026-05-18 onward only (~1 month)** | **Ephemeral** — irrecoverable before capture began | **capture-only factor** (`ktcHist*` family, 13 keys) — never moves `projectedPPG` |
| Coaching overlay (HC / OC / DC by team-year) | raw ingested data | data: `enrichment/coaching.json` (hand-authored via `bin/enrich.mjs`) | **95 entries** (populated) | **Ephemeral** per project rule (coaching/scheme = capture-time); reconstructable from public record only by hand | **view-only display** (enrichment tooltips); not in projection/scoring |
| Scheme overlay (offense/defense scheme by team-year) | raw ingested data | data: `enrichment/scheme.json` | **empty (0 entries)** | **Ephemeral** (capture-time scheme) | **unused/candidate** |
| Injury overlay (designation/type, segment) | raw ingested data | data: `enrichment/injuries.json`; segment matches a season-totals absence | **empty (0 entries)** | **Mixed:** the *absence* (which weeks missed) is **reconstructable** from `dnpWeeks`/`gamesPlayed`/`weeklyStatus`; the *designation/type* (e.g. ACL) is **ephemeral** (hand-authored) | **unused/candidate** (designation); absence is active→projectedPPG via durability |
| Notes overlay (player/team annotations) | raw ingested data | data: `enrichment/notes.json` | **empty (0 entries)** | **Ephemeral** (hand-authored context) | **unused/candidate** |

### 3B. Computed factors (`sleeper-dashboard`)

Coverage of a computed factor = coverage of its scarcest input. *Reconstructable* iff all
inputs are reconstructable (a factor built only from reconstructable raw data is itself
reconstructable — it never needs snapshot capture).

| Name | Layer | Source (module) | Historical coverage | Reconstructable vs ephemeral | Current use |
|---|---|---|---|---|---|
| Base PPG / pipeline PPG (`basePPG`, `pipelinePPG`) | computed factor | `seasonProjection.js` | 2012+ | Reconstructable | active→projectedPPG |
| Age delta (`ageDelta`) + empirical age curves | computed factor | `dynastyScore.js` `computeEmpiricalAgeCurves` → `ageCurve.js` interpolation | 2012+ (age × PPG history) | Reconstructable | active→projectedPPG + active→dynasty score |
| Share trend (`shareTrend`, `shareTrendRaw`, `shareVolatility*`) | computed factor | `teamContext.js` / `seasonProjection.js` Step 3 | 2012+ | Reconstructable | active→projectedPPG (neutralized 1.0 on team-change) |
| Regression / consistency (`regressionFactor[Raw]`, `consistencyScore/Band/Scale`) | computed factor | `regressionSignals.js` | 2012+ | Reconstructable | active→projectedPPG (consistency CV shared with dynasty) |
| Trajectory (`trajectoryFactor`, `trajectoryNormalized`) | computed factor | `regressionSignals.js` (floored, projection-specific) | 2012+ | Reconstructable | active→projectedPPG |
| Momentum (`momentumFactor`, `momentumLabel`) | computed factor | `momentum.js` | 2012+ | Reconstructable | active→projectedPPG + active→dynasty score |
| Durability (`durabilityFactor`, `injurySeasons`, `absenceShape*`) | computed factor | `durabilitySignals.js` | 2012+; snap-based contributor test (`off_snp/tm_off_snp ≥ 0.40`) **fires 2020+ only**, with start-rate/volume fallback pre-2020 | Reconstructable (snap path 2020+, fallback otherwise) | active→projectedPPG |
| Team factor (`teamFactor`) | computed factor | `teamContext.js` (team offense rank) | 2012+ | Reconstructable | active→projectedPPG |
| Depth factor (`depthFactor`, `depthStale` [vet]) | computed factor | `seasonProjection.js` from `depthMap` (`depth_chart_order`) | current only at compute time | **Ephemeral input** (`depth_chart_order`) → factor is ephemeral; `depthStale` flags staleness | active→projectedPPG |
| QB-quality (`qbQualityFactor`, `qbQualityScore`) | computed factor | `teamContext.js` `computeQBQualityByTeam` (Step 7b) | depends on depth (current) + PPG history | Partly ephemeral (depth-chart QB1 identity is current) | active→projectedPPG |
| Breakout / bounce-back / TD-reliance (`isBreakout`/`breakoutFactor`, `isBounceBack`/`bounceBackFactor`, `isTdReliant`/`tdRelianceFactor`, `tdDependency`) | computed factor | `projectionSignals.js` (shared with `dynastyScore.js`) | 2012+ | Reconstructable | active→projectedPPG |
| Efficiency (`efficiencyFactor`, `efficiencyIndex`, `efficiencyMetrics`) | computed factor | `efficiencyMetrics.js` Step 5e (passer rating from `pass_cmp/att/yd/td/int`; YPC/YPT/etc.) | 2012+ | Reconstructable | active→projectedPPG |
| Snap-share usage (`snapShare`, `snapShareFactor`) | computed factor | `usageMetrics.js` Step 5f (`off_snp/tm_off_snp`) | **2020+** (gated by `off_snp`) | **Reconstructable 2020+ only**; neutral pre-2020 | active→projectedPPG |
| Own-rate RZ usage (`rzUsageRate`, `rzUsageFactor`, `rzUsageCategory`) | computed factor | `usageMetrics.js` Step 5g (`rec_rz_tgt`/`rush_rz_att` ÷ own opps) | 2012+ | Reconstructable | active→projectedPPG |
| Team-RZ-share (`teamRzShare`, `teamRzShareFactor`, `teamRzShareCategory`) | computed factor | `teamRzShare.js` Step 5h (D3) | 2012+ | Reconstructable (denominator over active players — minor undercount) | active→projectedPPG (neutralized on team-change) |
| Combined new factor (`combinedNewFactor`, `combinedNewFactorRaw`) | computed factor | `seasonProjection.js` (product of 10 Step-5/7b signals, clamped [0.67,1.50]) | 2012+ (2020+ where snap-share contributes) | Reconstructable | active→projectedPPG |
| Career-comp blend (`compPPG`, `compCount`, `compAvgSimilarity`, `compConfidence`, `compBlendWeight`) | computed factor | `careerComps.js` + `compsIntegration.js` Step 9 | 2012+ | Reconstructable | active→projectedPPG |
| Rookie college contribution (`collegeMult`, `collegeBase`, `collegeContribution`, `productionTrend[Adjust]`, `finalYearDominator/Adjust`, `breakoutAge`) | computed factor | `collegeMetrics.js` (CFBD) | **2017+** (CFBD floor) | Reconstructable 2017+ | active→projectedPPG (rookie path); `breakoutAge` drives Profile chip |
| Rookie NFL-draft slot (`nflDraftMultiplier`, `nflDraftRound/Pick/Tier`, `nflDraftMatchSource`, `rookieMultiplierProduct`, `rookieAgeAtDraft`, `ktcMult`/`ktcPct`) | computed factor | `nflDraftMatch.js`/`nflDraft.js` (+ KTC) | draft 2010+ | Reconstructable (KTC component is current-value, see KTC rows) | active→projectedPPG (rookie path) |
| Dynasty score + market signals (`computeDynastyScore`, `computeMarketDivergence`, `divergenceSignal`, positional/role ranks, `computeKTCPositionPercentile`) | computed factor | `dynastyScore.js` | 2012+ history + current KTC | Reconstructable except live-KTC inputs (ephemeral) | **active→dynasty score** (drives ranks, Explorer, market divergence) — **not** `projectedPPG` |
| aDOT diagnostics (`adot`, `adotDelta`, `adotSampleSize`) | computed factor | `seasonProjection.js` (`rec_air_yd`/`rec_tgt`) | 2012+ | Reconstructable | **capture-only factor** (must not move `projectedPPG`) |
| Historical-KTC factors (`ktcHist*`, 13 keys) | computed factor | `ktcHistory.js` (KTC snapshot series) | **2026-05-18+** | **Ephemeral** (KTC history irrecoverable pre-capture) | **capture-only factor** |
| Position-multiplicity (`positionMultiplicityRatio`, `primaryCategory`, `primaryCategoryPoints`, `secondaryCategoryPoints`) | computed factor | `seasonProjection.js` | 2012+ | Reconstructable | **capture-only factor** |
| Rookie breakout-age factor (`breakoutAgeFactor`) | computed factor | rookie path (`collegeMetrics.js`) | 2017+ | Reconstructable | **capture-only factor** (demoted; does not move `projectedPPG`) |

### 3C. Ephemeral captures (snapshot-time, `src/utils/projectionSnapshot.js` → data `snapshots/<date>.json` v2)

These are the reason the snapshot layer exists: each is unavailable later. Captured
per-player as `{ nfl_team, status, depthChartOrder, ktc, projection }` plus envelope
`teamDepthCharts`, `scoringSettings`, `targetSeason`, `currentSeason`, `scoringBasis`,
`leagueId`.

| Name | Layer | Source | Historical coverage | Reconstructable vs ephemeral | Current use |
|---|---|---|---|---|---|
| NFL team at observation (`nfl_team`) | ephemeral capture | `leagueData.playerMap[id].team` → snapshot | snapshots 2026-05-19+ | **Ephemeral** before 2024 (roster backfill only 2024+); capture contemporaneously | feeds projection team/QB/share context; grading join |
| Depth-chart order (`depthChartOrder`) + team depth charts (`teamDepthCharts`) | ephemeral capture | `playerMap[id].depth_chart_order` / `buildTeamDepthChart` → snapshot | snapshots only | **Ephemeral** — never reconstructable | active→projectedPPG (depth factor); ephemeral-input invariant |
| Player status (`status`) | ephemeral capture | `playerMap[id].status` → snapshot | snapshots only; roster status 2024+ | **Ephemeral** (live status) | relevance gate; grading context |
| KTC value at observation (`ktc`) | ephemeral capture | `ktcMap` → snapshot | snapshots 2026-05-19+ | **Ephemeral** | active→dynasty score; ktcHist history |
| Scoring settings (`scoringSettings`, `scoringBasis`) | ephemeral capture | `league.scoring_settings` → snapshot envelope (v2) | v2 snapshots | **Ephemeral** (per-league config at capture); enables in-basis grading | grading basis (in-basis dot-product) |
| Projection output (`projection` verbatim, `targetSeason`, `currentSeason`) | ephemeral capture | `computeNextSeasonProjection` → snapshot envelope | v2 snapshots | **Ephemeral as-scored** (depends on then-current inputs/code); the grading subject | grading input (never re-run) |
| Vegas / injury designation / coaching / scheme (future ephemeral signals) | ephemeral capture | enrichment overlay + any future capture | coaching 95 entries; rest empty | **Ephemeral** per project rule | unused/candidate (capture-time only) |

---

## 4. Tests to add

**None — documentation-only.** This task adds one Markdown doc and edits two `CLAUDE.md`
files plus one `README.md` index line. No source, no behaviour change, therefore no tests
(per the app CLAUDE.md done-definition: "Purely non-behavioural changes — renames, docs,
lint, dead-code removal — need none"). Implementer must **not** run the projection/build
suites for this change beyond confirming no source was touched.

---

## 5. Docs updates

### 5.1 New registry doc — `docs/signal-registry.md` (this repo)

Create `sleeper-dashboard/docs/signal-registry.md` with:

1. A short preamble (3–5 sentences) stating: purpose (canonical signal inventory spanning
   both repos), the reconstructable-vs-ephemeral rule and why it governs snapshot-capture
   and grading-inclusion, a pointer to the "Advstats & Signal Grading — Findings and Open
   Items" doc for the rationale, and the column legend + *Current use* vocabulary from the
   §3 preamble.
2. The **§2 coverage-verification table** (data-checked findings), with a one-line note
   that coverage was verified against `sleeper-dashboard-data` data files, not docs.
3. The **§3 registry tables (3A, 3B, 3C) verbatim**, all six columns.
4. A closing "Maintenance" line: *"This registry is canonical. Update it in the same change
   whenever a signal/factor is added, removed, or reclassified (layer, source, coverage, or
   reconstructable-vs-ephemeral status). The sibling `sleeper-dashboard-data` repo flags
   ingest-layer changes here — see its CLAUDE.md."*

Do **not** duplicate CLAUDE.md invariants in the doc — link to them
(capture-only, advstats-view-only, ephemeral-inputs-must-be-snapshotted).

### 5.2 This repo's `CLAUDE.md` — Self-maintenance edit

In `sleeper-dashboard/CLAUDE.md`, **Self-maintenance** section (currently lines ~190–195),
append one sentence to the first paragraph. Concrete edit:

> **Before** (end of the first Self-maintenance paragraph):
> "…Push deep detail into the relevant `docs/` file and link to it rather than duplicating
> it here."
>
> **After** — append:
> "If a change adds, removes, or reclassifies a signal/factor — a raw source, a computed
> `factors` entry, an ephemeral capture, or its historical coverage or
> reconstructable-vs-ephemeral status — update the canonical signal registry
> (`docs/signal-registry.md`) in the same change."

### 5.3 This repo's `README.md` — Documentation index entry

In `sleeper-dashboard/README.md`, the **`## Documentation`** list (currently ending at the
`docs/ui.md` bullet, ~line 142–144), add one bullet (keep alpha/topical grouping — place
after the `docs/integrations.md` bullet or at list end):

> - [docs/signal-registry.md](docs/signal-registry.md) — canonical signal/feature registry:
>   every raw source, computed factor, and ephemeral capture classified by layer, source,
>   historical coverage, reconstructable-vs-ephemeral status, and current use. The
>   inventory that governs snapshot-capture and grading-inclusion decisions.

---

## 6. Cross-repo impact

The registry is hosted in **this** repo. The data repo cannot be edited from here — these
are **flagged cross-repo outputs** for the data-repo session to apply to
`sleeper-dashboard-data/CLAUDE.md`. State them in the task summary.

### 6.1 Data-repo self-maintenance line (its ingest layer)

Add to `sleeper-dashboard-data/CLAUDE.md` → **Self-maintenance** section, as a new
sentence after "…update the relevant section in the same change.":

> "When a change adds, removes, or alters the historical coverage of an ingested field,
> stat key, or data source (`nfl`/`cfbd`/`ktc`/`roster`/`draft`/`advstats`/`playerids`/
> `enrichment`), flag the canonical signal registry for update: it lives in the app repo at
> `docs/signal-registry.md`. Note the change (Source / Historical coverage /
> Reconstructable-vs-ephemeral) in your task summary so the app repo updates the row."

### 6.2 Data-repo pointer line (because the registry is hosted here)

Add to `sleeper-dashboard-data/CLAUDE.md` → **Sibling repo** section, one line:

> "The canonical signal/feature registry — classifying every raw source, computed factor,
> and ephemeral capture by layer, coverage, and reconstructable-vs-ephemeral status — lives
> in the app repo at `docs/signal-registry.md`. Ingest-layer changes here must be flagged
> for it (see Self-maintenance)."

### 6.3 No data shape or contract changes

This task touches no schema, manifest field, stat key, or served shape — it only documents
them. No Cross-repo contract (snapshot shape, season-totals schema, enrichment, manifest,
advstats) is modified.

---

## 7. Implementer checklist (sonnet)

1. Create `docs/signal-registry.md` per §5.1 (preamble + §2 table + §3A/3B/3C verbatim +
   maintenance line). **No source files touched.**
2. Apply the §5.2 CLAUDE.md Self-maintenance append (this repo).
3. Apply the §5.3 README Documentation-index bullet (this repo).
4. Do **not** edit any data-repo file. Surface §6.1 + §6.2 in the task summary as flagged
   cross-repo outputs for the `sleeper-dashboard-data` session.
5. No tests, no build run required (documentation-only); confirm `git status` shows only
   the three app-repo doc files changed.
