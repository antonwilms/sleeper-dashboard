# In-season evidence — Phase 2c wiring: rookies' prospect prior, SHORT history slot, cap placement

Session 1 (opus), 2026-09-28, planned against app `4b5e8e1`. Session 2 (sonnet) implements.
Parent: `.claude/tasks/in-season-evidence.md`. Previous slice: `in-season-evidence-2b-2-scoring.md`.
Verdict being wired: data `grading/2026-09-27-inseason-dyn-verdict.md` @ `1ca95d4` (artifacts `58ada8b`,
fix pass `5c4b6c7`). Registry companion (for Session 2 commit 2): `in-season-evidence-2c-wiring-registry.md`.
**Revision 2 (2026-09-28):** Anton approved with two amendments — ship the measured (KTC- and
college-neutral) prior (§3.4, §3.5), and a two-season check that keeps WR on the position baseline (§1b).
**Revision 3 (2026-09-28):** Anton narrowed the exception to second-year WRs only (YE1 WR WORSE at S+2; YE0
WR NO-GAIN, point favouring the projection — act only on clear differences, as the NO-GAIN rule does elsewhere).
It also drops revision 1's false claim that the rookie projection carries the rookie season.

---

## 0. Goal and fixed decisions (Anton, made — do not reopen)

1. **Rookies (arm B, as measured).** For `yearsExp` 0 and 1 on the prospect path (PATH A), the prospect
   score's starting PPG is the rookie-path season projection **recomputed with `ktcMult = 1.0` and
   `collegeContribution = 1.0`**. The recompute goes through the same pure function
   (`computeNextSeasonProjection` with `ktcMap: null, collegeStats: null`). It is not divided out of
   `projectedPPG`, because calibration and the ceiling apply after the product. The 2c backtest's arm-B
   prior held **both** factors at 1.0 (data `lib/projectionFactors.mjs:813-814`, `reconstructRookieProjection`:
   KTC history starts 2026-05-18 and the college composite was never ported). Every other rookie-path input
   was live in the backtest. This removes the double count with the 60% KTC anchor. The season projection
   (`seasonProjections`, the snapshot, the displayed ROS) keeps `ktcMult` and college **unchanged**. The live
   update uses the **2a-pinned** `K_DYN_POINTS_ROOKIE0` / `K_DYN_POINTS_ROOKIE1P` (verdict reuse).
2. **Two-season check (amendment 2, narrowed in revision 3): second-year WRs (`yearsExp` 1) keep the
   position-baseline start** (§1b). Every other YE0/YE1 prospect — first-year WRs included — switches to the
   projection start. Second-year WRs keep today's starting point, and the in-season update now applies on top
   of it at the verdict's pooled YE1 arm-A k (`K_DYN_PROSPECT_A_YE1`, §3.6).
3. **SHORT-recent veterans** (latest completed season < 8 games, last qualifying season = `dataSeason − 1`):
   the dynasty level uses that season's PPG as the prior, at the standard `K_DYN_POINTS_HISTORY` (verdict Q2).
   SHORT-stale players are "Limited Data" and stay out of scope.
4. **No-market-signal cap** (no KTC percentile AND no R1/R2 pick): the cap of 35 applies to the **starting
   value only**, and live evidence enters after it, uncapped (§1). The 60% KTC anchor and the position-peak
   clamp are untouched.
5. A one-line note on Market's In-season set (§6).

**Invariants (each tested, §7):**
- Snapshot `projection` stays the raw prior.
- The prospect score reads live stats only through the seam (`src/utils/inSeasonScoring.js`).
- The 2b seam and QB-quality firewall tests keep passing; they may be extended, never loosened.
- Every changed score path has a test that fails under the old behaviour.
- The dynasty prior is invariant to KTC percentile and college stats, while the season projection is not.

**Scope boundaries (stated so no one "completes" them):**
- PATH A `yearsExp` 2–3 players and PATH B keep arm A and get no live input. The verdict measured YE0/YE1 only.
- `computeNextSeasonProjection`, `seasonProjection.js`, `seasonProjections`, the snapshot, and
  `projectedPPG`/`projectedGames` do not change. There is **no `PRIOR_MODEL_FROM` bump**.
- The dynasty prior is recomputed from the live model and is **never frozen**. The frozen snapshot carries
  only the KTC-inclusive `projectedPPG`. The 2026 season runs unfrozen anyway (2b D1 = B). Freezing it later
  is backlog D-56.
- The 2b `inSeason` record (`buildScoringPosteriors`) is unchanged for rookies. Its `next` stays the
  KTC-inclusive projection-prior posterior and **is not** the dynasty prior. A grader must know this (D-56).
- The QB-quality maps keep reading the **pre-2c** prospect score for rookie QBs, by construction (§5.3).

---

## 1–2. Evidence (full tables: `in-season-evidence-2c-wiring-evidence.md`)

- **§1 Cap placement:** on the 2c Q1 cap rows (12,527 rows, 844 players), cap-before BEATS cap-after in every
  slice (pooled −16.25 score pts [−18.03, −14.44]). No cap at all beats cap-before (−3.27) — finding §10.1.
- **§1b Two-season (S+2) check:** 957 player-seasons; pooled, the projection start BEATS the baseline
  (−0.24 ppg). The only WORSE cell is second-year WRs (+0.548 [0.245, 0.851]) → `PROSPECT_PRIOR_KIND[1].WR =
  'position'`. First-year WRs are NO-GAIN (−0.310) and switch, as do QB, RB and TE.
- **§2 League reshuffle (n = 0):** 145 rostered prospects, median |move| 3, p90 17, max 26; 82 down, 10 up.
  Smoke values are in §11.

---

## 3. Seam and pipeline additions

### 3.1 `historyRowOf({ careerStats, dataSeason, id, population })` — `inSeasonScoring.js`, exported, pure

→ `careerStats[dataSeason]?.[id]` for `'standard'`; for `'SHORT'`, `careerStats[dataSeason - 1]?.[id]` when
that row has finite `gamesPlayed >= 8` and finite `fantasyPoints`, else `null`; any other population → `null`.

### 3.2 `buildScoringPosteriors` — the SHORT `next`

In the `else` branch (`:184-188`): for `population === 'SHORT'` with a non-null `historyRowOf(...)`,
`next` = `historyNextOf({ row: thatRow, live, pos })` shaped like standard's (`priorKind: 'history'`,
k = `K_DYN_POINTS_HISTORY[pos]`). Otherwise unchanged. Rookies unchanged. `ros` untouched. Update the comment
at `:174-179`: SHORT-recent's `next` is the level it feeds; rookies' `next` is the KTC-inclusive projection
posterior, recorded for grading, and is **not** the dynasty prior (which is §3.4's neutral recompute).

### 3.3 `buildInSeasonLevel` — admit SHORT-recent

- Iterate the **union** of `Object.keys(careerStats[dataSeason] ?? {})` and `Object.keys(careerStats[dataSeason - 1] ?? {})`.
- Accept `'standard'` or `'SHORT'`, with `row = historyRowOf(...)`, and skip when the row is null.
- The rest is as today.
- Header comment (`:207-210`): "standard and SHORT-recent". The invariant
  `level.get(id) === scoringPosteriors.get(id).next.value` covers both.

### 3.4 New module `src/utils/prospectPrior.js` — the KTC- and college-neutral rookie prior

A pipeline module: pure, no React, no I/O. It imports only `computeNextSeasonProjection` from
`./seasonProjection`, and never a seam module (it joins the PIPELINE guard list, §7.3).

```js
// The rookie dynasty-side prior (in-season-evidence-2c-wiring §0.1): the rookie-path projection recomputed
// through the same pure function with ktcMult = 1.0 and collegeContribution = 1.0 — the prior the 2c
// backtest measured (its reconstruction holds both at 1.0). The season projection keeps both; only the
// dynasty prior drops them, so the market is counted once (the 60% KTC anchor).
// → { [playerId]: projectedPPG } for QB/RB/WR/TE with years_exp 0 or 1 and a finite result.
export function buildRookieDynastyPriors({ playerIds, projectionArgs }) {
  const out = {}
  for (const id of playerIds) {
    const info = projectionArgs.playersMap?.[id]
    if (!['QB', 'RB', 'WR', 'TE'].includes(info?.position)) continue
    if (info.years_exp !== 0 && info.years_exp !== 1) continue
    const p = computeNextSeasonProjection({ ...projectionArgs, playerId: id, ktcMap: null, collegeStats: null })
    if (Number.isFinite(p?.projectedPPG)) out[id] = p.projectedPPG
  }
  return out
}
```
`ktcMap: null` and `collegeStats: null` come **after** the spread, so a caller cannot re-enable them.
`years_exp ≤ 1` always takes the rookie route (`seasonProjection.js:612`). That route reads neither
`qbQualityByTeam` nor any dynasty score, so the helper has no dependency on the QB-quality memos.

### 3.5 `buildProspectLevel({ rookieDynastyPriors, careerStats, dataSeason, playerMap, currentSeasonTotals, projectionBasis })` — `inSeasonScoring.js`, new, exported

→ `Map<playerId, { priorKind, prior, n, obs, k }>`, with nothing rounded. For each id in `rookieDynastyPriors`:
- Skip unless the position is in `IN_SEASON_SCORING_POSITIONS` and `years_exp` is 0 or 1.
- Look up `kind = PROSPECT_PRIOR_KIND[years_exp][pos]` (§3.6).
- `kind === 'projection'`:
  - `prior = rookieDynastyPriors[id]`; skip unless finite.
  - `pop = classifyInSeasonPopulation(...)`; skip unless `pop` is `'ROOKIE0'` or `'ROOKIE1P'`.
  - `k = NEXT_K[pop][pos]`: the 2a `K_DYN_POINTS_ROOKIE0/1P`, reused per the verdict.
- `kind === 'position'`:
  - `prior = null`. The start is computed dynasty-side as today's arm A.
  - `k = K_DYN_PROSPECT_A_YE1[pos]`. Only `yearsExp` 1 can route here (§3.6). The verdict's arm A splits on
    `yearsExp`, not on population, so a YE1 WR with no careerStats row (population ROOKIE0) still takes 3.5.
- Live evidence, when `usableLiveSeason(currentSeasonTotals, dataSeason)` holds and `projectionBasis` is
  `'league'`/`'half_ppr'`: a live row with `scoringBasis === projectionBasis`, integer `gamesPlayed > 0` and
  finite `fantasyPoints` gives `n = gamesPlayed` and `obs = fantasyPoints / n`. Otherwise `n = 0`, `obs = null`.
- With no usable live season, every eligible id still gets an `n = 0` entry, so the prior swap applies all year.

Eligibility is uniform across kinds: an id needs a finite `rookieDynastyPriors` entry even on the `'position'`
path, which never reads it. A non-finite rookie-route projection means broken inputs, and such a player keeps
the pre-2c score. This is intended.

This does **not** read `scoringPosteriors` or `seasonProjections`. Header comment: arm B as measured, and the
second-year-WR exception with a pointer to §1b.

### 3.6 Constants — `src/utils/inSeasonConstants.js` (CR-25)

No `K_DYN_PROSPECT_A_YE0`: nothing routes a YE0 player to the position start, so it is omitted rather than
pinned unused.

```js
// 2c dynasty-side (in-season-evidence-2c-wiring §1b/§3.5). Arm-A k: the 2c verdict's pooled YE1 arm-A fit
// (q1.subgroups.YE1.pooled.A.kFit), pinned by the constants files' rule Math.round(k*2)/2;
// re-derived from the panel fixture by inSeasonConstants.test.js — the one K_* family pinned from a panel,
// not a constants file. Pooled across positions (rung 0); an own-position rung is pinned from a data
// constants file when one exists (D-56).
export const IN_SEASON_DYN_PANEL_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-09-27-inseason-dyn-panel.json',
  commit: '5c4b6c79c9a881a2a445841b9f2b196135378733',
  fixture: 'src/__fixtures__/inseason-dyn-panel-2026-09-27.json',
}
export const K_DYN_PROSPECT_A_YE1 = { QB: 3.5, RB: 3.5, WR: 3.5, TE: 3.5 }
// Starting point of the prospect score by yearsExp and position — the two-season check (§1b): only a clear
// S+2 loss keeps the position baseline (second-year WRs); every other cell starts from the market-neutral
// rookie projection.
export const PROSPECT_PRIOR_KIND = {
  0: { QB: 'projection', RB: 'projection', WR: 'projection', TE: 'projection' },
  1: { QB: 'projection', RB: 'projection', WR: 'position',   TE: 'projection' },
}
```

The fixture is a byte copy:
`git -C ../sleeper-dashboard-data show 5c4b6c7:backtests/2026-09-27-inseason-dyn-panel.json > src/__fixtures__/inseason-dyn-panel-2026-09-27.json`.
This reads the sibling and never edits it. Its sha1 must be `0f2195ec1f04bef27bcaaf2dd2fc259b4ba5179d`.
`inSeasonScoring.js` imports the three new names alongside its existing constants.

---

## 4. Dynasty consumption — `src/utils/dynastyScore.js`

### 4.1 `computeProspectScore(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPercentile = null, basisScale = 1, prospectEntry = null)`

**New 7th parameter `prospectEntry`** — the `buildProspectLevel` entry.
- It is valid when `priorKind` is `'projection'` (with a finite `prior`) or `'position'`, `n` is an integer
  ≥ 0, `k` is finite and ≥ 0, and `n > 0` implies a finite `obs`. An invalid entry is treated as `null`.

**`NO_MARKET_CAP`.** Hoist `const NO_MARKET_CAP = 35` beside `POSITION_PRIOR_PPG`.
- Its comment states the mechanism and cites this task file's §1 and backlog D-54. It carries no league
  counts and no data-availability claims (docs wording rule).
- Tag it `// PROVISIONAL(heuristic): cap value 35 is hand-set, not fitted · its placement was measured (2c wiring §1), its value was not · a fitted cap (Anton, §10.1)`.

**Body:**
1. Compute `hasPremiumPick`, `ktcInfluenced`, `hasMarketSignal` first.
2. `startPPG`:
   - `priorKind === 'projection'` → `prospectEntry.prior`, with **no** completed-season blend. The rookie
     route never reads career stats, and arm B was measured without the blend.
   - Otherwise (a `'position'` entry or no entry) → today's arm-A `priorPPG` blended with
     `currentSeasonStats`, exactly as today.
   - `gamesPlayed` (the completed-season count the signals report) is computed exactly as today in every branch.
3. Cap the starting value only: `start = hasMarketSignal ? startPPG : Math.min(startPPG, NO_MARKET_CAP / 100 * Math.max(peakPPG, 1))`.
4. Live evidence after the cap: `ppg = entry && entry.n > 0 ? (start * entry.k + entry.obs * entry.n) / (entry.k + entry.n) : start`.
   This is `posteriorOf`'s formula, restated because the pipeline cannot import the seam (a test pins the two equal).
5. `prospectScore = normalisePPG(ppg, peakPPG) * 100`, then the KTC blend unchanged. **No final cap.**
6. Return adds `priorKind: entry ? entry.priorKind : 'position'`. The dev `console.log` adds `priorKind`,
   `startPPG` and `n`.

**Arm A with no entry, or with a `'position'` entry at n = 0, is behaviour-identical:**
`normalise(min(p, 0.35·max(peak,1))) = min(normalise(p), 0.35)`, and there is no KTC term when the cap
applies. Every existing prospect test passes **unedited**.

### 4.2 `computeDynastyScore(..., inSeasonLevel = null, prospectLevel = null)`

- New 15th parameter. PATH A only:
  `const prospectEntry = (yearsExp === 0 || yearsExp === 1) ? (prospectLevel?.get(playerId) ?? null) : null`
  → `computeProspectScore`'s 7th argument; `signals.prospectPriorKind = prospect.priorKind`.
- PATH B's call (`:969`) is unchanged.
- SHORT-recent gates:
  - `recencyWeightedPPG` (`:634`): `lastQ.season === allSeasons[allSeasons.length - 1]` →
    `lastQ.season >= allSeasons[allSeasons.length - 1] - 1`.
  - `levelPPG` (`:840`): `lastQS === mostRecentSeason` → `lastQS >= mostRecentSeason - 1`.
  - Stale players never reach `:840` (PATH A3). The peer pool (`:862-868`) admits only `dataSeason` gp ≥ 8 players.
- Rewrite the comment block at `:828-834` and the `recencyWeightedPPG` header (`:619-620`).
- This file imports no seam module (guarded).

---

## 5. App wiring — `src/App.jsx` (no memo re-ordering needed)

The rookie prior does not depend on `seasonProjections`, so there is no cycle. `seasonProjections` and every
existing memo keep their current position and inputs.

### 5.1 `rookieDynastyPriors` memo — directly after `playerRows` (`:528`)

```js
// in-season-evidence-2c-wiring §3.4 — the market-neutral rookie prior for the dynasty score (never the
// season projection). Held until the NFL-draft match settles (the rookie route's draft-slot input).
const rookieDynastyPriors = useMemo(() => {
  if (!playerRows.length || !careerStats || !leagueData?.playerMap || !empiricalCurves || !positionPeakPPG || !nflDraftSettled) return null
  const allSeasons = Object.keys(careerStats).map(Number).sort()
  const nflDraftYears = nflDraftCoverage
    ? Object.keys(nflDraftCoverage).filter(y => (nflDraftCoverage[y] ?? 0) > 0).map(Number)
    : null
  return buildRookieDynastyPriors({
    playerIds: playerRows.map(r => r.player_id),
    projectionArgs: {
      positionBasisScale, playersMap: leagueData.playerMap, careerStats, empiricalCurves, positionPeakPPG,
      scoringSettings: leagueData.scoringSettings, currentSeason: allSeasons[allSeasons.length - 1],
      nflDraftYears, nflDraftMatches,
    },
  })
}, [playerRows, careerStats, leagueData, empiricalCurves, positionPeakPPG, positionBasisScale, nflDraftMatches,
    nflDraftCoverage, nflDraftSettled])
```
Only what the rookie route reads to produce `projectedPPG` (the others it takes are capture-only `factors`
inputs or veteran-path inputs). No `ktcMap`, no `collegeStats` and no `qbQualityByTeam` in `projectionArgs`. The helper forces the first two to
`null`, and the rookie route ignores the third.

### 5.2 `prospectLevel` memo — directly after it

```js
const prospectLevel = useMemo(() => {
  if (!rookieDynastyPriors || !careerStats || !leagueData?.playerMap) return null
  return buildProspectLevel({ rookieDynastyPriors, careerStats, dataSeason: deriveDataSeason(careerStats),
    playerMap: leagueData.playerMap, currentSeasonTotals, projectionBasis })
}, [rookieDynastyPriors, careerStats, leagueData, currentSeasonTotals, projectionBasis])
```

### 5.3 `playerRowsWithProspect` memo — between `playerRowsWithKTC` (`:532-538`) and `qbQualityRows`

```js
const playerRowsWithProspect = useMemo(() => {
  if (!prospectLevel || prospectLevel.size === 0 || !playerRowsWithKTC.length) return playerRowsWithKTC
  const rookieDraftPicks = leagueData.rookieDraftPicks ?? {}
  return playerRowsWithKTC.map(row => {
    if (!prospectLevel.has(row.player_id)) return row
    const dynastyScore = computeDynastyScore(
      row.player_id, leagueData.playerMap, careerStats, empiricalCurves, positionPeakPPG,
      rookieDraftPicks[row.player_id] ?? null, leagueData.scoringSettings, ktcMap, teamContext, depthMap,
      historicalSharesCurrentTeam, positionPeakAge, positionBasisScale, null, prospectLevel,
    )
    return { ...row, dynastyScore }
  })
}, [playerRowsWithKTC, prospectLevel, leagueData, careerStats, empiricalCurves, positionPeakPPG, ktcMap,
    teamContext, depthMap, historicalSharesCurrentTeam, positionPeakAge, positionBasisScale])
```
- `playerRowsWithQBMod` reads `playerRowsWithProspect` in all three places (`:568-571`) and in its deps.
- `qbQualityRows` **keeps** `withBaseDynastyScores(playerRowsWithKTC)`: QB quality reads the pre-2c prospect
  score, so neither the raw projection nor the snapshot can move.
- `seasonProjections` still iterates `playerRowsWithRanks` and reads only `row.player_id`, so its output is
  unchanged. It recomputes when prospect scores change; that costs time and changes no value.

### 5.4 Loading behaviour (accepted; state it in the hand-back)

Until the NFL-draft match settles, rookies show the pre-2c score, then switch to the new prior. There is no
frozen-prior wait: the dynasty prior is always live.

---

## 6. The note — `src/components/market/Market.jsx`, In-season set

After the optimism sentence (`:1117`), add one sentence, rendered while `columnSet === 'inseason'`:

> `Since 2026-09-28, rookie and second-year dynasty scores start from their season projection without its market-value and college adjustments (second-year WRs keep the position baseline), so they moved once before any game counted; all of them now update with this season's games.`

If Session 2 commits on a later day, use the commit date.

---

## 7. Tests

Tests 1–5, 7, 8b, 11, 12 and the §7.2–§7.4 behaviour changes fail under the pre-change code. Tests 6, 8a,
9 and 10 are regression pins.

### 7.1 `src/utils/dynastyScore.test.js` — new `describe('prospect prior — 2c wiring')`

Setup: `P = DEFAULT_PEAK_PPG[pos]` (from `src/__fixtures__/factories.js`). Build expected scores in
`normalisePPG`'s order: `Math.round(Math.min(ppg / Math.max(P, 1), 1) * 100)`. Entries are literal objects.
1. **projection, n = 0** (RB, YE0, premium pick): entry `{ priorKind: 'projection', prior: X, n: 0, obs: null, k: 6.5 }`
   → the expected value for X, and ≠ the `prospectLevel = null` score.
2. **projection, n > 0**: prior 4, n 2, obs 8, k 6 → ppg (24 + 16) / 8 = 5 → expected. Also assert that the
   ppg equals `posteriorOf(4, 8, 2, 6).value` (import from `./inSeasonScoring`).
3. **YE1 projection skips the completed-season blend**: YE1 with a 2025 row (gp 10) → same `.score` as the
   same entry with no 2025 row. Compare `.score` only.
4. **cap-before, strong evidence** (no KTC, no pick): prior 0.6·P, k 3, n 2, obs 1.1·P → (1.05P + 2.2P)/5 =
   0.65·P → **65**; assert `> 35`. Cap-after would give min(80, 35) = 35.
5. **cap-before, weak evidence**: obs 0.1·P → (1.05P + 0.2P)/5 = 0.25·P → **25**. Cap-after would give 35.
6. **projection, n = 0, no market**, prior 0.6·P → exactly 35.
7. **KTC present**: entry + a `ktcMap` with ≥ 5 same-position entries (else the percentile is null) →
   `round(0.6·pct + 0.4·normalise(prior)·100)`, no cap.
8. **position kind (WR YE1)**:
   - (a) `{ priorKind: 'position', prior: null, n: 0, obs: null, k: 3.5 }` → `toEqual` the Map-null result
     apart from `signals.prospectPriorKind`. Assert `.score` equal.
   - (b) n 3, obs well above the arm-A start, and give the WR an R1 pick (a market signal, so the start is
     not capped) → the score equals the posterior of the arm-A start at k 3.5. Compute the arm-A start in the
     test from the known formula (`POSITION_PRIOR_PPG × ageMultiplier × draftMultiplier`).
9. **scope**: a `years_exp` 2 PATH A player and a PATH B player with entries → identical to Map null.
10. **invalid entry** (n 1.5; `'projection'` with prior NaN; n > 0 with obs null) → identical to null.
11. `signals.prospectPriorKind` is `'projection'` / `'position'` / `'position'` (no entry).
12. **SHORT-recent — CHANGED existing test `:1617`**.
    - Retitle it: "a SHORT-recent player's level is read (last qualifying season = latest − 1)".
    - Its fixture (2023 qualifying, 2024 gp 5) is now SHORT-recent, so assert that
      `components.ageAdjusted.value` and `.score` differ from the Map-null result.
    - Add a lapsed test: last qualifying season is latest − 2, which routes to PATH A3 and must `toEqual`
      the Map-null result.
    - Retitle `:1624` to "a true prospect is unchanged by an `inSeasonLevel` entry — its live input arrives
      only through `prospectLevel`".

### 7.2 `src/utils/prospectPrior.test.js` (new) — amendment 1's invariance test

Fixture: a `playersMap` with a YE0 RB and at least 5 other KTC-valued RBs, plus minimal `careerStats`,
`empiricalCurves`, `positionPeakPPG` and `nflDraftMatches` for the rookie.
- **KTC:** `ktcMap` A puts the rookie at percentile ≈ 10 and B at ≈ 90.
  - Assert `computeNextSeasonProjection({ ...args, ktcMap: A }).projectedPPG !== …B` (the season projection moves).
  - Assert `buildRookieDynastyPriors({ playerIds: [id], projectionArgs: { ...args, ktcMap: A } })[id] === …B[id]`
    (the dynasty prior does not).
- **College:** the same pair with two `collegeStats` (peakDominator 35 vs 10).
- **Same pure function:** the prior `=== computeNextSeasonProjection({ ...args, ktcMap: null, collegeStats: null }).projectedPPG`.
- **Filtering:** a YE2 and a K id are absent.

### 7.3 `src/utils/inSeasonScoring.test.js`

- `historyRowOf`: standard → `dataSeason` row; SHORT-recent → the `dataSeason − 1` row; a gp-7 row → null; ROOKIE → null.
- `buildScoringPosteriors`:
  - "SHORT uses the SHORT tables" keeps `ros.k === K_ROS_POINTS_SHORT.TE` and now also asserts
    `next.priorKind === 'history'`, `next.k === K_DYN_POINTS_HISTORY.TE` and `next.prior === r2(100/12)`.
  - Add a SHORT-stale id whose `next` stays `projection` at `K_DYN_POINTS_SHORT`.
- `buildInSeasonLevel`:
  - `:242` changes: `short` **is** in the Map, at `(100/12·5.5 + 15·2)/7.5`.
  - Add: a SHORT-stale id is absent; a SHORT-recent id with no `dataSeason` row is present.
  - `:252` invariant: add `short: { projectedPPG: 9 }` to its `seasonProjections`.
- `buildProspectLevel`:
  - (a) An RB YE0 with no careerStats row → `'projection'`, k `K_DYN_POINTS_ROOKIE0.RB`. An RB YE1 with a row
    → k `K_DYN_POINTS_ROOKIE1P.RB`.
  - (b) **A YE0 WR with no careerStats row (ROOKIE0) → `'projection'`**, prior from the map, k `K_DYN_POINTS_ROOKIE0.WR` (6.5) — the first-year
    WR is on the projection path. **A YE1 WR → `'position'`**, prior null, k `K_DYN_PROSPECT_A_YE1.WR`. Include a
    YE1 WR with **no** careerStats row (population ROOKIE0): still `'position'`, k 3.5 (split by `yearsExp`),
    never 6.5.
  - (c) A live row gives n/obs. A basis mismatch, an unusable live season or a non-finite fp gives
    n 0 / obs null, and the entry is still present.
  - (d) YE2 and non-skill ids are absent, and a first-year RB whose prior is non-finite is absent.
  - (e) It never mutates its inputs (deep-frozen).
- `src/__tests__/inSeasonConstants.test.js`:
  - The panel fixture's sha1 is `0f2195ec…`.
  - `Math.round(kFit*2)/2` of `q1.subgroups.YE1.pooled.A.kFit` equals every cell of `K_DYN_PROSPECT_A_YE1`.
  - `PROSPECT_PRIOR_KIND` has exactly keys `0` and `1`, each with exactly the four skill keys, and the only
    `'position'` cell is `[1].WR`.

### 7.4 `src/__tests__/currentSeasonTotalsIsolation.test.js`

- `PIPELINE` gains `src/utils/prospectPrior.js` in **all ten** copies of the list (they are verbatim copies and
  no test checks they agree): `currentSeasonTotalsIsolation`, `inSeasonEvidenceViewOnly`, `advStatsViewOnly`,
  `teamContextViewOnly`, `opponentStrengthViewOnly`, `weeklyDecisionViewOnly`, `lineupViewOnly`,
  `outlookPositionStatsViewOnly`, `gameLogsViewOnly`, `scheduleViewOnly` (`src/__tests__/`).
- The `LIVE` regex gains `prospectLevel`.
- "exactly two calls" becomes **three**:
  - `calls[0]` matches `inSeasonLevel` and not `prospectLevel`.
  - `calls[1]` is unchanged.
  - `calls[2]` matches `/positionBasisScale, null, prospectLevel,? ?\)$/` and no other live identifier.
- `dynastyScore.js` matches `/prospectLevel/`, and no other `PIPELINE` module does.
- Seam builders: `buildProspectLevel(` receives exactly `['currentSeasonTotals']`. `buildRookieDynastyPriors(`
  receives no live identifier and does not contain `ktcMap` or `collegeStats`.
- `prospectPrior.js`'s `computeNextSeasonProjection(` call contains `ktcMap: null, collegeStats: null`
  after `...projectionArgs`.
- Firewall:
  - `playerRowsWithProspect` maps `playerRowsWithKTC`.
  - `playerRowsWithQBMod` reads `playerRowsWithProspect` and never `playerRowsWithKTC`.
  - The existing `qbQualityRows` regex still passes.
- `:264`: `buildInSeasonLevel` omits an n = 0 SHORT id.
- The snapshot byte-identity describe (`:215`) passes unchanged.

### 7.5 `src/components/market/Market.test.jsx`

In the In-season describe, the note contains `without its market-value and college adjustments`.

---

## 8. Docs (same commit as the code)

- **`CLAUDE.md`** (ceiling 25,000 bytes; 24,815 today by `wc -c`, 24,867 after both edits — confirm with `wc -c`):
  - *Intentional divergence* body → "`dynastyScore.js`'s position prior uses the per-league rookie-pick proxy
    (PATH B, `yearsExp` 2–3, second-year WRs, the no-market cap); `seasonProjection.js` uses the NFL draft slot,
    and other `yearsExp` 0/1 prospect scores start from it. Do not unify unless explicitly asked. If caps
    look wrong, check `rookieDraft.js` still finds this league's draft (else `draftMultiplier(null)`)."
  - `src/__fixtures__/` row: append "; `inseason-dyn-panel-2026-09-27.json` — the arm-A prospect k's oracle".
- **`docs/architecture.md`**:
  - `:162-164`: rewrite the `inSeasonLevel` bullet. "Rookies' prospect score and SHORT veterans' score never
    read it", "prospect scores … do not move" and "only dynasty effect" are all now false.
  - Add bullets for `rookieDynastyPriors`, `prospectLevel` and `playerRowsWithProspect`.
  - *playerRows pipeline*: insert `rookieDynastyPriors → prospectLevel → playerRowsWithProspect` between
    `playerRowsWithKTC` and the QB modifier. Note that QB quality reads `playerRowsWithKTC`.
- **Code comments:** `src/utils/inSeasonConstants.js:1-5` (the header's "every K_* below is re-derived from
  that fixture" gains the `K_DYN_PROSPECT_A_*` exception); `src/utils/inSeasonScoring.js:1-4` (header: SHORT-recent level; prospect entries).
  `src/App.jsx`: the new memos' comments must not name `scoringPosteriors`, because
  `inSeasonEvidenceViewOnly.test.js:113-131` rejects comment hits.
- **`docs/dynasty-scoring.md`:**
  - PATH A: YE0/YE1 start from the market-neutral projection, except second-year WRs, which keep the
    baseline; both take the live update.
  - Cap paragraph (`:63`): the cap bounds the starting value.
  - `:104`: SHORT-recent level; drop the "Rookies' prospect score keeps its last-completed-season blend… no
    history-prior k was measured" sentence.
  - QB quality reads the pre-2c prospect score.
  - Mirror the CLAUDE.md divergence wording.
- **`docs/nav/utils.md`:**
  - New `prospectPrior.js` row.
  - `dynastyScore.js` row: `prospectLevel`, `NO_MARKET_CAP`, `prospectEntry`.
  - `inSeasonScoring.js` row: `historyRowOf`, `buildProspectLevel`.
  - `inSeasonConstants.js` mention: `K_DYN_PROSPECT_A_*`, `PROSPECT_PRIOR_KIND`.
- **`docs/integrations.md:419`:** `next.priorKind` is `'history'` for standard and SHORT-recent. A rookie's
  `next` is the KTC-inclusive projection posterior, not the dynasty prior.
- **`docs/signal-registry.md`** (CR-18):
  - Row `:45`: add `buildProspectLevel` → `computeDynastyScore`'s `prospectLevel` (YE0/YE1 prospect score),
    and SHORT-recent to the level.
  - Row `:108`: QB/RB/TE YE0/YE1 prospect prior = the rookie projection recomputed with `ktcMult`/college neutral.
  - Row `:103` (Rookie NFL-draft slot, which includes `ktcMult`/`ktcPct`): `ktcMult` stays active→projectedPPG
    and is **excluded** from the dynasty prior.
  - Row `:102` (Rookie college contribution): college is excluded from the dynasty prior.
  - Row `:135`: rookie `next` ≠ dynasty prior.
- **Wording rule** (`docsAvailabilityClaims.test.js`): state mechanism, not today's data.

---

## 9. Backlog (`.claude/tasks/data-repo-backlog.md`, same commit)

**D-53 · Registry sync — in-season 2c + 2c wiring (CR-01/15/21/25).**
- The daily run is red from the app push until the sync lands, so it runs the **same day**.
- Gate: companion §F (13 lines).

**D-54 · Re-mirror the prospect prior and record the cap-placement arm.**
- (a) The Q3 prospect path caps the starting value, not the score.
- (b) State in the mirror that the arm-B path has no completed-season blend.
- (c) State in the mirror that the SHORT slot equals `historyPriorOf`'s L = S-2.
- (d) State that the app's arm-B prior now equals `reconstructShippedRookieProjection`'s neutral `ktcMult`/college.
- (e) Fold §1's comparison into `--inseason --dynasty`'s Q3 output.
- No re-fit is owed: every 2c cell is `reuse`, and the app now implements exactly the definitions those cells
  measured. Not blocking.

**D-55 · Record the S+2 arm comparison (§1b).**
- Add it to `--inseason --dynasty` as a reported arm: A vs B, prior-only and updated, per position and per
  subgroup, against `nextPPG2`. Carry `nextPPG2` through `augmentRow` so it no longer needs the `assemble`
  seam, and admit rows without an S+1 outcome.
- Its result gates `PROSPECT_PRIOR_KIND` from now on: a position flips only on a committed re-run.
- Not blocking.

**D-56 · Arm-A k ladder for second-year WRs, and the dynasty prior's freeze.**
- (a) Run the pre-registered arm-A ladder `[subgroup pooled, own position]` for WR YE1 and emit
  `K_DYN_PROSPECT_A_YE1` in a dated constants file. The app re-pins, replacing the panel-derived pin.
- (b) The dynasty prior (KTC/college-neutral) is never frozen, and the snapshot carries only the
  KTC-inclusive prior. Before any grader scores the dynasty-side rookie posterior, decide whether the snapshot
  captures the neutral prior. That would be an additive per-player field (CR-01).
- Not blocking.

---

## 10. Findings for Anton (reported, not acted on)

1. **No cap at all beats cap-before**: −3.3 score points pooled, BEATS in every slice. The rows are
   survivor-biased and the cap population is an upper bound.
2. **All positions pooled, the projection starting point still wins at S+2** (−0.24 ppg, BEATS). Once this
   season's games are applied, the two starts are indistinguishable at S+2 (+0.01, NO-GAIN). The start matters
   most before the games arrive.
3. Second-year players carry no league draft pick (`selectRookieDraft` reads the latest draft only); this now
   affects only the cap test and second-year WRs' baseline.

---

## 11. Touch list, done-definition, commits

**Files touched:**
- Source: `src/utils/inSeasonScoring.js`, `src/utils/inSeasonConstants.js`, `src/utils/prospectPrior.js`
  (new), `src/utils/dynastyScore.js`, `src/App.jsx`, `src/components/market/Market.jsx`.
- Fixture: `src/__fixtures__/inseason-dyn-panel-2026-09-27.json` (new, byte copy).
- Tests: those in §7, plus `Market.test.jsx` and the nine other `PIPELINE`-list guard files (§7.4).
- Docs: those in §8, plus `CLAUDE.md` (two edits, measured).
- `.claude/tasks/data-repo-backlog.md`.
- `docs/cross-repo-registry.md`, commit 2 only.

Nothing else. In particular not `seasonProjection.js`, `teamContext.js`, `projectionSnapshot.js` or
`inSeasonEvidence.js`.

**Done-definition** per CLAUDE.md. Smoke on Colts_420_Reloaded / Dynasty 040:
- Market → Value, sorted by dynasty score. Check n = 0 rookies against evidence §2: Trigg 41→17, J'Mari Taylor 52→26,
  Cam Ward 65→79, and a first-year WR such as CJ Daniels 51→30, if still at n = 0.
- A second-year WR at n = 0 (e.g. Jordan Watkins 42) is unchanged.
- The In-season sentence shows.
- The console is clean.
- Today's snapshot, if written, has rookie `projection` values identical to what `seasonProjections` holds.
- `grep -rn "PROVISIONAL(" src/` output goes in the hand-back.

**Commits:**
- **Commit 1**: code, fixture, tests, docs, backlog.
- **Commit 2**: `docs/cross-repo-registry.md` per the companion, exactly.
- Push only after Session 1 verification. D-53 runs the same day.

## Cross-repo impact

Verbatim edits and quoted Mirror texts: `in-season-evidence-2c-wiring-registry.md`.
- **CR-25** fires. Changed: the arm-B prior (KTC/college-neutral via `prospectPrior.js`), the WR YE1 arm-A k
  pinned from the panel, `PROSPECT_PRIOR_KIND`, the SHORT slot and the cap placement. Also includes the data
  2c companion §A.
- **CR-15** fires by whole-file trigger (`dynastyScore.js`), with no mirrored function changed.
  `prospectPrior.js` calls the rookie route with the two inputs the data mirror already holds neutral, so the
  mirror now matches the app **more** closely. Data 2c companion §B lands too.
- **CR-21** fires: the live season now reaches rookies' prospect scores and SHORT-recent levels.
- **CR-18** fires: signal-registry rows reclassified (§8). No data action.
- **CR-01**: Triggers text edit only (companion §G): the stale App.jsx anchors, plus `buildRookieDynastyPriors`
  as a new reader of the projection payload's `projectedPPG` (it reads the rookie-route result, not the snapshot). The envelope is unchanged and
  `schemaVersion` stays 3.
- **Not fired:** CR-26, CR-02, CR-24.

---

## Review record — plan gate round 1 (2026-09-28)

14 flags, all verified and applied (list in git history); the `teamDepthCharts` claim was rejected
(`projectionSnapshot.js:151-158` narrows it).

## Review record — plan gate round 2 (2026-09-28, changed sections of revision 2)

0 blocking, 3 should-fix, 6 nits; all applied. (1) `prospectPrior.js` added to all ten `PIPELINE`
list copies (§7.4, §11). (2) CR-25 Invariant exception for panel-pinned `K_DYN_PROSPECT_A_*` (companion §A.3/§C.1)
and the `inSeasonConstants.js` header (§8). (3) `buildRookieDynastyPriors` added to CR-01 Triggers (companion §G).
(4) Job-state wording in the §3.6 comment. (5) Companion §E quotes §C.3 in applied order. (6) Tests 7 and 8b tightened.
(7) The YE1-WR-without-row k case. (8) The note names the college adjustment. (9) `projectionArgs` trimmed to what
the rookie route reads.

## Revision 3 (Anton, 2026-09-28) and plan gate round 3

WR exception narrowed to `yearsExp` 1: §0.2, §1b decision, §2 (re-measured), §3.5, §3.6
(`PROSPECT_PRIOR_KIND` keyed by `yearsExp`; `K_DYN_PROSPECT_A_YE0` dropped as unused), §6, §7.1 item 8,
§7.3 (YE0 WR on the projection path, YE1 WR on the position path), §8, §9 D-56, §10, §11, companion §C.
Round 3 gate: 4 flags applied (orphaned evidence block removed; ROOKIE0 fixture for the first-year WR; uniform
eligibility stated and test (d) re-pointed; registry names the YE1 `kFit` path).
