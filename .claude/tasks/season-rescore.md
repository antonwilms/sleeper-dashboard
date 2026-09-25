# Season rescore — careerStats and the live season onto the league's scoring basis

**Decision (Anton, made — not reopened here):** every projection input is rescored from Sleeper's
half-PPR onto this league's `scoringSettings`, before in-season Phase 2.

**What this slice ships:** one rescoring seam (`rescoreSeasonTotals`, `src/api/sleeperStats.js`)
applied to every `careerStats` season and to the live season's rows; first-down-bonus
reconstruction for seasons Sleeper never emitted it; `weeklyPoints` scaled to reconcile; a
runtime per-position basis scale on the three half-PPR-calibrated PPG constants; an additive
`projectionBasis` snapshot field; the Market In-season basis note made true.

**What it must not do:** cache rescored rows under a raw key; write a derived key into any row's
`stats`; touch `fan_pts_allow_*` (stays Sleeper half-PPR, already disclosed — CR-20); change
`calculateFantasyPoints`' math; bump snapshot `schemaVersion`.

Expect large cross-position movement in tests and smoke (TE up, WR down, return specialists up) —
that is the point, not a regression.

**Size note:** ~50KB, over the 40KB split signal. ~8KB is verbatim `Mirror` quotation and ~6KB is
exact registry/doc replacement text. Not split: the behaviour is atomic — the snapshot field must
ship with the switch (the daily capture builds `main`), and the constant rescale must ship with it
or half-PPR thresholds sit on league-basis values for a release.

---

## §1 Verified facts (2026-09-25, live source + local data store `sleeper-dashboard-data@4ebb68d`)

1. **Seam location.** `getSeasonTotals` (`sleeperStats.js:165`) returns data-store rows as served
   (`:221`) — `fantasyPoints` = Σ weekly `pts_half_ppr` (data `lib/sleeper.mjs:293,321`), every
   row `scoringBasis: 'half_ppr'` (all rows, all seasons 2012–2026). Only its live-API branch
   (`:224-297`) scores with league settings. `loadCurrentSeasonTotals` (`:317`) likewise returns
   raw rows. Both are called once each, from `App.jsx:901` and `:986`.
2. **Season-level rescoring is valid (linearity).** Every Sleeper scoring key is a per-game count
   (threshold bonuses such as `bonus_rec_yd_100` are 0/1 per game, summed to a count), so
   `calculateFantasyPoints(Σ weekly stats) = Σ calculateFantasyPoints(weekly stats)` up to rounding.
   Checked: a fixed half-PPR ruleset applied to season `stats` reproduces the stored per-week-summed
   points for **2,308 / 2,327** skill player-seasons 2023–2026.
3. **The stored half-PPR series has its own era break.** Pre-2022 stored points also charge every
   fumble (`fum` −1): with that term 2012 reproduces 340/371 (180 without), 2021 652/678 (424
   without); 2023+ reproduce without it; 2022 is mixed. Rescoring applies one ruleset to every
   season and removes this break as a side effect.
4. **First-down bonus coverage.** `bonus_fd_{qb,rb,wr,te}`: **zero rows 2012–2021**, present
   2022+. **Correction to the brief's formula:** `bonus_fd_<pos>` = **`pass_fd` + `rec_fd` +
   `rush_fd`**, not `rec_fd + rush_fd` — the brief's 198/200-style misses are passing first downs
   by skill players (Tyler Boyd 2022: 36 + 1 `pass_fd` = 37; Taysom Hill 2022: 30 + 9 = 39). With
   `pass_fd` included: 2022 439/441 (the 2 misses are fullback-type rows Sleeper gave no key),
   2023 418/418, 2024 426/426, 2025 445/445, 2026 251/251. `bonus_fd_qb` follows the same formula
   (80/80 QBs, 2022). Rows never carry two `bonus_fd_*` keys. `pass_fd`/`rec_fd`/`rush_fd` are
   sparse: an absent key is a zero (rows lacking `rec_fd` with `rec > 0` are 1–5-catch players and
   the 32 `TEAM_*` rows), present 2012+.
5. **`bonus_rec_te` needs no reconstruction** — present every season 2012+ (~18–20% of skill rows,
   ≈ TE share). `bonus_rec_yd_100/200`, `bonus_rush_yd_100/200`, `kr_yd`, `pr_yd` present 2012+.
6. **Reconstruction matters.** League/half ratio, top-24 by rescored PPG, ≥8 GP:
   | season | QB | RB | WR | TE |
   |---|---|---|---|---|
   | 2015 without / with reconstruction | 1.124 / 1.124 | 1.077 / 1.156 | 1.082 / 1.149 | 1.252 / 1.317 |
   | 2019 without / with | 1.126 / 1.126 | 1.044 / 1.115 | 1.050 / 1.114 | 1.246 / 1.306 |
   | 2022 (emitted) | 1.092 | 1.107 | 1.102 | 1.306 |
   | 2025 (emitted) | 1.090 | 1.106 | 1.143 | 1.301 |
   Without it, every RB/WR/TE series gets a fake ~6% step at 2022.
7. **This league scores return yardage** (`kr_yd`/`pr_yd` 0.05); Sleeper half-PPR does not. Return
   specialists' ratio is large (Charlie Jones 2025 ×11.0). Correct for this league; will look
   surprising in smoke.
8. **`weeklyPoints` consumers:** `outlookConsistency.js:18` (`extractGamePoints` → pop-up
   consistency, `PlayerDetailTabs.jsx:89`, `Market.jsx:535,552` SD), `DistributionSection.jsx:29`
   (5-point buckets), `gameLog.js:148` via `GameLogSection.jsx:32` (per-week `pts` cell),
   `usePlayerProfile.js:98` (pass-through). **Availability does not read points** —
   `computeAvailability` / `buildAvailabilityGrid` read `weeklyStatus` only. The projection's
   `consistencyScore` (Step 4) uses season PPGs, not weekly points.
9. **Half-PPR-calibrated absolute constants** — see §2.4 for the full inventory.
10. **Snapshot readers of `schemaVersion`** (data repo): `register-snapshots.mjs:65` requires a
    number; `shouldSkipSnapshot:35` compares for equality with the file's own prior manifest entry;
    `lib/snapshot-capture.mjs:88` gates on `>= MIN_SCHEMA_VERSION`. `grade-snapshot.mjs:170-173`
    takes the projection basis to be `snapshot.scoringBasis` — which pre-fix snapshots already set
    to `'custom'` while their projections are half-PPR (the problem §3.6 fixes forward).
11. **`CLAUDE.md` is 24,509 bytes** of a 25,000 ceiling (`claudeMdSize.test.js`) — §5 edits are
    net ≤ +250 bytes.

---

## §2 Decisions

### 2.1 Position source for first-down reconstruction — `playersMap[id].position` (current)

Season rows carry no position. **Chosen: current Sleeper position.** Reasons:
- Under this league's settings `bonus_fd_rb` = `bonus_fd_wr` = `bonus_fd_te` = 0.25 and
  `bonus_fd_qb` is unscored, so the choice only matters for players who moved **between QB and a
  skill position** before 2022.
- The season-accurate alternative (`nflverse/roster/<year>.json`) covers 2016+ only (2012–2015
  would fall back to current anyway), needs a position-vocabulary map, and would put ~10 extra
  fetches in front of `careerStats`.
- Every other careerStats consumer (age curves, cohorts, projections) already buckets by current
  position; scoring a converted player's whole history as his current position is the like-for-like
  series the projection wants.

**Converted-player error, measured 2016–2021** (nflverse roster position vs current Sleeper): 42
position-changed player-seasons, **5 with any league-points error** — Taysom Hill 2018/2019/2020/
2021 (QB→TE: +4.5 / +5.5 / +17.5 / +16.0 season points, ≤ 1.3 PPG) and Tommy Stevens 2020 (+0.5).
The season-accurate choice would instead give Hill a TE bonus from 2022 (Sleeper's own emission)
but none before — a break in his series. 2012–2015 cannot be checked (no roster file). Non-skill
rows (K, DEF, `TEAM_*`) get no derived bonus; `TEAM_*` `fantasyPoints` has no reader.

**Emission detection is per season, not per row:** derive iff **no row in that season** carries any
`bonus_fd_*` key. In an emitting season a row without the key keeps zero — Sleeper's own call
(§1.4's two fullback rows).

### 2.2 `weeklyPoints` — scale by the season ratio

No per-week stats exist in the store, so rescored weeks cannot be exact. **Chosen:** each week ×
(rescored season total ÷ source season total). Why:
- Sums reconcile with the rescored season (game log vs season PPG agree).
- Every *shape* metric is exactly unchanged within a season: consistency CV, boom/bust
  (defined relative to the player's own mean, `BOOM_MULT`/`BUST_MULT`), and distribution shape.
- Measured per-week error against true weekly league scores (Sleeper weekly API, 2025 weeks
  1/5/9/13): median absolute error QB 0.49, RB 0.41, WR 0.21, TE 0.19 points; relative (weeks
  ≥ 5 true points) median 4.6%, p90 18.9%; worst are return specialists (§1.7). That error lands on
  the two per-week absolute displays — the game-log `pts` cell and distribution bucket assignment —
  which get `PROVISIONAL(heuristic)` tags (§3.8). The exact fix is data-side (D-47).
- Ratio undefined (source total ≤ 0, except source 0 with rescored 0 → ratio 1): every week →
  `null` — omit rather than invent. `extractGamePoints` already drops non-finite values; `gameLog`
  renders `null` as `—`.

**Alternative for Anton (one-line change if preferred):** leave the game log showing Sleeper's real
half-PPR weekly numbers, labelled as such, and scale only for the shape metrics. Not chosen: the
log would then disagree with the season line directly above it.

### 2.3 `scoringBasis` on rescored rows — the literal `'league'`

Rescored rows carry **`scoringBasis: 'league'`** ("scored with this league's `scoringSettings`"),
plus provenance `sourceScoringBasis` (served label or `null`) and `sourceFantasyPoints` (served
total). Not `deriveScoringBasis(settings)`: that label reads only `rec` and `bonus_rec_te`, so any
`rec: 0.5` league without TE premium would label rescored rows `'half_ppr'` — identical to raw
store rows — and the gate could not tell them apart (plan review). `'league'` cannot collide with a
served label. The In-season gate (`inSeasonEvidence.js:151-153`) compares prior vs live labels: it
passes because **both went through the seam** (`'league'` = `'league'`) and refuses when exactly one
did (`'league'` vs `'half_ppr'`) — tested (§4.3). If `scoringSettings` is null/empty the seam is a
pass-through and both sides keep `'half_ppr'` — consistent, and the Market note says so (§3.7).
`deriveScoringBasis` stays where it is (snapshot envelope label only) — not moved.

### 2.3a Non-additive keys

`scoreSeasonStats` skips a `NON_ADDITIVE_KEYS` set identical to the data repo's `RATE_KEYS`
(`lib/fantasyPoints.mjs:29`, 29 keys: `cmp_pct`, `def_kr_lng`, `def_kr_ypa`, `def_pr_lng`,
`def_pr_ypa`, `down_3_pct`, `down_4_pct`, `fgm_lng`, `fgm_pct`, `g2g_pct`, `kr_lng`, `kr_ypa`,
`pass_lng`, `pass_rtg`, `pass_td_lng`, `pass_ypa`, `pass_ypc`, `pos_rank_half_ppr`, `pos_rank_ppr`,
`pos_rank_std`, `pr_lng`, `pr_ypa`, `rec_lng`, `rec_td_lng`, `rec_ypr`, `rush_lng`, `rush_td_lng`,
`rush_ypa`, `rz_pct`). None is a Sleeper scoring key today, so this changes no score; it makes the
linearity claim true by construction for any league, and covers live-API rows, whose
`getSeasonTotals` sum includes rate keys (`sleeperStats.js:264-266`). `calculateFantasyPoints`
(weekly) stays unguarded. This reverses CR-14's "no app counterpart" note — edited in §6.3.

**Live-API rows are rescored too**, not skipped: they already carry exact weekly league points,
but skipping them would leave those seasons without first-down reconstruction and break the
series the brief requires be consistent. Their ratio is ≈ 1 (exactly 1 in emitting seasons), so
their weekly values barely move.

### 2.3b K and DEF rows move team offence ranks

Every row in a season is rescored, K and bare-abbr DEF rows included. `computeTeamContext`
(`teamContext.js:161-172`, `current-team` mode) resolves K/DEF rows through `playersMap` and adds
their `fantasyPoints` into `teamTotals[team].fantasyPts` — which ranks teams for projection Step 7
(`teamFactor`) and the dynasty offence score. Those ranks therefore move on league-basis K/DEF
points too. Accepted: every row on one basis is the consistent choice. **Pre-existing, out of
scope, reported in hand-back:** a DEF row's points counting toward a team's *offence* rank.

### 2.4 Constant inventory

| Constant | Where | Kind | v1 treatment |
|---|---|---|---|
| `ROOKIE_BASELINE_PPG` {13,9,7,5} | `seasonProjection.js:23` | absolute PPG, half-PPR | × `positionBasisScale[pos]` |
| `ROOKIE_CEILING` knee/asymptote | `seasonProjection.js:58-63` | absolute PPG (debut p90/p99, half-PPR) | both × `positionBasisScale[pos]` |
| `POSITION_PRIOR_PPG` {14,12,9,7} | `dynastyScore.js:481` | absolute PPG, normalised by `positionPeakPPG` | × `positionBasisScale[pos]` (keeps prior/peak invariant) |
| rookie `clamp(…, 0, 40)`, vet `clamp(rawPPG, 0, 40)`, comp blend `clamp(…, 0, 40)` | `seasonProjection.js`, `compsIntegration.js:60` | absolute guard rail | unchanged — never binds (max realised PPG ≪ 40 even ×1.3) |
| trajectory denominator floor `max(meanPPG, 4)` | `regressionSignals.js:55` | absolute floor | unchanged — stability floor; ×1.1–1.3 moves only means in [3.1, 4) |
| momentum / outlier floors `max(meanPPG, 1)` / `max(careerAvg, 1)`, `max(peakPPG, 1)`, `max(totalFP, 1)` | `momentum.js:25`, `seasonProjection.js:662`, `dynastyScore.js:507`, `projectionSignals.js` | absolute floor | unchanged — divide-by-zero guards |
| `peakPPG ?? 20`, `peakPPG * 0.7` fallbacks | `dynastyScore.js`, `careerComps.js`, `projectionSignals.js` | absolute fallback | unchanged — only when no curve exists; cancel in ratios |
| `VS_MEDIAN_FAR_BELOW = -4` | `Portfolio.jsx:36` | absolute points, display tint | unchanged — compares projection vs league-median bar, both now league basis; flag only |
| `DISTRIBUTION_BUCKETS` 5-pt edges, `AXIS_MIN/MAX` | `distribution.js` | display axis | unchanged — not calibrated |
| `ROOKIE_CALIBRATION` cells | `seasonProjection.js:40` | **unitless** Σrealised/Σprojected | robust to first order (both sides rescale); exact only after data refit |
| regression `outlierRatio` buckets 1.35/1.15/0.85/0.65 | `seasonProjection.js:666-670` | **unitless** | robust |
| momentum 0.20/0.05, trajectory ×0.35 clamp, consistency CV bands, breakout `rawRatio > 1.3` | `momentum.js`, `seasonProjection.js`, `projectionSignals.js` | **unitless** | robust |
| in-season `K_*`, `MIN_*_GAMES`, `MIN_BASELINE_OPP` | `inSeasonEvidence.js` | games / opportunities | robust (not points) |
| `isTdReliant` threshold 0.40 | `projectionSignals.js` `computeTdReliance` | **unitless but basis-sensitive** | unchanged. Pre-fix it divided league-basis TD points by a half-PPR total — this slice makes it internally consistent for the first time. 2025 ≥8 GP flags: RB 8→3, WR 13→7, TE 17→7, QB 36→36 of 37 (the near-universal QB flag is pre-existing, out of scope — noted in hand-back) |

**`positionBasisScale` is measured at runtime, not hard-coded** — the app supports any league, and
a hard-coded 1.14 is this league only. `computeEmpiricalAgeCurves` already scans exactly the
population that sets `positionPeakPPG` (gp ≥ 10, skill positions); it additionally returns the
per-position **median of `fantasyPoints / sourceFantasyPoints`** over rows with
`sourceScoringBasis === 'half_ppr'` (store-sourced — live-API rows are league→league and would
dilute it). Fewer than `MIN_BASIS_SCALE_ROWS = 30` qualifying rows → `1` (no evidence of a rescale:
unrescored careerStats, or a store-disabled session — the latter is a documented residual).
Expected for this league (offline proxy): QB ≈ 1.12, RB ≈ 1.14, WR ≈ 1.15, TE ≈ 1.30.
Cross-check against the populations the rookie constants came from (debut seasons ≥ 8 GP,
2013–2025): p90 ratios 1.12 / 1.13 / 1.13 / 1.33, p99 1.07 / 1.12 / 1.11 / 1.31 — within 0.06 of
the single scale. **Interim until the data-side custom-basis refit (D-45)** — tagged
`PROVISIONAL(heuristic)`.

### 2.5 Snapshot — additive `projectionBasis`, no `schemaVersion` bump

New top-level envelope field `projectionBasis`: `'league'` (every careerStats season was rescored
through the seam with this snapshot's own `scoringSettings`), `'half_ppr'` (none were, served basis),
`'mixed'`, or `'unknown'` (no careerStats). **Absent ⇒ pre-fix ⇒ half-PPR projections** (subject to
`inputStatus.careerStats.detail.provenance`: a `live-api` season was league-scored even pre-fix).
The field ships with the switch because the daily capture builds the app's `main`.

**`schemaVersion` stays 3.** No reader breaks on an additive key (§1.10); field *presence* already
marks the boundary, so a bump carries no information the field does not; CR-01's own Mirror
precedent is that additive keys do not bump. (v3's bump was different: the capture gate needed a
version threshold to know whether to *require* `inputStatus`; nothing will require
`projectionBasis`.)

---

## §3 Implementation

### 3.1 `src/utils/fantasyPoints.js` (CR-14) — the math

`calculateFantasyPoints` is **not changed**. Add, below it:

```js
// season-rescore.md §2.3a — identical to sleeper-dashboard-data lib/fantasyPoints.mjs RATE_KEYS (CR-14).
export const NON_ADDITIVE_KEYS = new Set([ /* the 29 keys listed in §2.3a */ ])
// season-rescore.md §2.1 — Sleeper emits bonus_fd_<pos> only 2022+. Its value is
// pass_fd + rec_fd + rush_fd for the row's position (verified 2022–2026, QB included).
export function seasonEmitsFirstDownBonus(rows)          // true iff any row's stats has a key starting 'bonus_fd_'
export function withFirstDownBonus(stats, position)      // QB/RB/WR/TE only: returns a NEW object
                                                         // { ...stats, [`bonus_fd_${pos.toLowerCase()}`]:
                                                         //   (pass_fd ?? 0) + (rec_fd ?? 0) + (rush_fd ?? 0) }.
                                                         // Any other position, or stats already carrying a
                                                         // bonus_fd_* key → returns `stats` itself. Never mutates.
export function scoreSeasonStats(stats, scoringSettings, { position = null, deriveFirstDowns = false } = {})
  // → calculateFantasyPoints(<stats, with the derived bonus if deriveFirstDowns>, <scoringSettings minus
  //   every NON_ADDITIVE_KEYS key>). Build the filtered settings object; never mutate the input.
```

### 3.2 `src/api/sleeperStats.js` (CR-02, CR-21) — the one seam

**Import line 2 stays one line** (keeps CR-02's `:175/:209/:210/:215` anchors valid):
`import { calculateFantasyPoints, scoreSeasonStats, seasonEmitsFirstDownBonus } from '../utils/fantasyPoints';`

**Add `export function rescoreSeasonTotals(rows, scoringSettings, playersMap)`** placed **after
`getSeasonTotals` and before the `loadCurrentSeasonTotals` header comment** (the isolation test
slices `loadCurrentSeasonTotals`'s body up to `loadCareerHistory` — nothing new may sit between them).
Header comment: the seam's contract (rescore on read, after the cache; never cache the result;
linearity justification §1.2; `PROVISIONAL(heuristic)` line for the weekly scaling, §3.8). Behaviour:
- `rows` not an object → return it. `scoringSettings` null or with zero keys → return `rows`
  unchanged (same reference).
- `deriveFirstDowns = !seasonEmitsFirstDownBonus(rows)`.
- Returns a **new** map. Per entry: a non-object, or a row that already has
  `sourceFantasyPoints !== undefined` (already rescored) → copied through unchanged (idempotent).
  Otherwise, with `position = playersMap?.[id]?.position ?? null`,
  `scored = scoreSeasonStats(row.stats, scoringSettings, { position, deriveFirstDowns })`,
  `source = row.fantasyPoints`:
  - `ratio` = `scored / source` if `Number.isFinite(source) && source > 0`; `1` if
    `source === 0 && scored === 0`; else `null`.
  - `weeklyPoints`: if `row.weeklyPoints == null` keep it; else same container type (object →
    object with the same keys; array → array) with each value `Math.round(v * ratio * 100) / 100`
    when `ratio != null && Number.isFinite(v)`, else `null`.
  - new row `{ ...row, fantasyPoints: scored, weeklyPoints, scoringBasis: 'league',
    sourceFantasyPoints: Number.isFinite(source) ? source : null,
    sourceScoringBasis: typeof row.scoringBasis === 'string' ? row.scoringBasis : null }`.
  - `row.stats` is carried by reference and **never written** — the derived bonus exists only
    inside `scoreSeasonStats`.

**`loadCareerHistory`:** `result[season] = rescoreSeasonTotals(await getSeasonTotals(...), scoringSettings, playersMap)`.
`getSeasonTotals` is untouched — the cache keeps what it kept (served rows; live-API rows as before).

**`loadCurrentSeasonTotals(season, scoringSettings = null, playersMap = null)`:** both return paths
that carry players (cache hit `:327`, fresh `:334`) return
`players: rescoreSeasonTotals(<raw>, scoringSettings, playersMap)`; `setCacheWithMeta` still stores
the raw `dsResult`. Update its header comment (one sentence: rows are rescored on read).

### 3.3 `src/App.jsx`

- Live-season effect (`:980-990`): guard `if (!nflState?.season || !leagueData) return`, call
  `loadCurrentSeasonTotals(season, leagueData.scoringSettings, leagueData.playerMap)`, deps
  `[nflState, leagueData]`. Update its comment: rows are league-specific now.
- Because those rows are now league-specific, reset them wherever careerStats is reset on a league
  change: add `setCurrentSeasonTotals(null)` beside `setCareerStats(null)` at `:756`,
  `handleUsernameSubmit` (`:1108`) and `handleSwitch` (`:1128`).
- `:202-210` memo: destructure `positionBasisScale` too (empty-state return gains
  `positionBasisScale: {}`); pass it to `computeDynastyScore` as the new trailing argument (`:415`
  call, after `positionPeakAge`) and to `computeNextSeasonProjection({ …, positionBasisScale })`
  (`:570`); add it to both memos' dependency arrays.
- **Do not touch** `teamContext`, the CR-22 surfaces (`LS_USER`/`LS_LEAGUE`, the auto-load effect,
  the `[snapshot] wrote` marker) or the snapshot write effect beyond what §3.6 needs (nothing).

### 3.4 `src/utils/dynastyScore.js` (CR-15)

- `computeEmpiricalAgeCurves`: in the existing row loop, **immediately after the skill-position
  check and before the age lookup**, accumulate `data.fantasyPoints / data.sourceFantasyPoints` per
  position when `data.sourceScoringBasis === 'half_ppr'`, both finite, `sourceFantasyPoints > 0`.
  Return `{ curves, positionPeakPPG, positionPeakAge, positionBasisScale }`, where each position is
  `Math.round(median(ratios) * 1000) / 1000` if `ratios.length >= MIN_BASIS_SCALE_ROWS` (30,
  module constant, `PROVISIONAL(heuristic)` line) else `1`. Reuse the module's existing `median`.
- `computeProspectScore(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPercentile = null, basisScale = 1)`:
  `priorPPG = (POSITION_PRIOR_PPG[position] ?? 9) * basisScale * ageMultiplier(age) * draftMultiplier(...)`.
  `PROVISIONAL(heuristic)` line on `POSITION_PRIOR_PPG` naming the rescale and D-45.
- `computeDynastyScore(..., positionPeakAge = null, positionBasisScale = null)`: both
  `computeProspectScore` calls (`:679`, `:934`) pass `positionBasisScale?.[position] ?? 1`.

### 3.5 `src/utils/seasonProjection.js` (CR-01 payload, CR-15)

- `computeNextSeasonProjection({ …, positionBasisScale = null })` → `rookieProjection(…, basisScale)`
  with `basisScale = positionBasisScale?.[position] ?? 1` (new trailing parameter).
- `rookieProjection`: `baseline = (ROOKIE_BASELINE_PPG[position] ?? 7) * basisScale`;
  `applyRookieCeiling({ position, projectedPPG: projectedPPGPre, basisScale })`.
- `applyRookieCeiling({ position, projectedPPG, basisScale = 1 })`: `knee = c.knee * basisScale`,
  `asymptote = c.asymptote * basisScale`, then unchanged. `basisScale = 1` is byte-identical to today,
  so `rookieCeiling.test.js`'s provenance assertions stand.
- New rookie-path factor **`rookieBasisScale: basisScale`** (next to the ceiling keys, comment
  "season-rescore — rookie path only, do not add to VET_FACTORS_KEYS"). Rookie factors 59 → 60.
- `PROVISIONAL(heuristic)` lines on `ROOKIE_BASELINE_PPG` and `ROOKIE_CEILING`: "half-PPR-calibrated
  · scaled at runtime by `positionBasisScale` · data-side custom-basis refit (D-45)". Update the
  `ROOKIE_CEILING` comment's "half-PPR" sentence to say so.

### 3.6 `src/utils/projectionSnapshot.js` (CR-01)

- `deriveScoringBasis` untouched (envelope label only).
- Add `function deriveProjectionBasis(careerStats)`: `'unknown'` when careerStats is null or has no
  season with a row; else, per season, take its first object row: `scoringBasis === 'league'` →
  `'league'`; else `scoringBasis === 'half_ppr'` →
  `'half_ppr'`; else `'other'`. All `'league'` → `'league'`; all `'half_ppr'` → `'half_ppr'`;
  otherwise `'mixed'`. (All rows of one season pass the seam together, so the first row is the
  season.)
- Envelope: `projectionBasis: deriveProjectionBasis(careerStats)` directly after `scoringBasis`.
  `schemaVersion: 3` unchanged. Extend the JSDoc return shape.

### 3.7 In-season note — `inSeasonEvidence.js` + `Market.jsx`

- `buildInSeasonPosteriors` computes `liveBasis` over `currentSeasonTotals.players` with the **same
  single-basis rule** `buildPriorSeasonContext` applies to the prior season (skill-position rows via
  `playerMap`; any missing/differing label → `null`) — extract that loop's basis half into a private
  helper both call, so the rule has one definition. Returns `leagueScored: seasonBasis === 'league'
  && liveBasis === 'league'` alongside `liveSeason`/`priorSeason`/`maxGames`/`byId` — **both** sides
  must be league-scored, because the `ppg` cell (`:132-133`) renders the live row whether or not it
  is eligible (plan review).
- `Market.jsx:1068`: `inSeason?.leagueScored ? "Scored on this league's settings." : "Half-PPR basis (Sleeper's own scoring, not necessarily this league's)."`
  The FPA notes (`Teams.jsx:72`, `TeamOffences.jsx:72`, `DefencesFaced.jsx:101`, `LineupTable.jsx:234`)
  stay — FPA is still half-PPR.

### 3.8 `PROVISIONAL(heuristic)` sites for the weekly scaling

One line each. Per-week displays: `rescoreSeasonTotals` (derivation), `GameLogSection.jsx` at the
`weeklyPoints` hand-off (`:32`), `DistributionSection.jsx:29`. Absolute SD displays (SD is not
scale-invariant, and a scaled week's spread differs from the true week's — plan review):
`outlookConsistency.js` `extractGamePoints` (`:18`, derivation), `Market.jsx:535` (`floorRiskSd`),
`Market.jsx:552` (Outlook consistency), `PlayerDetailTabs.jsx:89` (pop-up "Consistency ±x"). Text:
`// PROVISIONAL(heuristic): weeklyPoints scaled by the season's league/half-PPR ratio · the store has no per-week stats (median error 4.6%, p90 19%) · per-week scoring keys in season-totals (D-47)`

---

## §4 Tests

**4.1 `src/utils/fantasyPoints.test.js`** — `seasonEmitsFirstDownBonus` (true with one `bonus_fd_te`
row, false with none); `withFirstDownBonus`: WR `{pass_fd:1, rec_fd:36}` → `bonus_fd_wr: 37`;
QB → `bonus_fd_qb`; K/null position → same reference; stats already carrying `bonus_fd_rb` → same
reference; input object unchanged (frozen). **The invariance test the brief requires:** under the
league settings (`rec 0.5, bonus_rec_te 0.5, bonus_fd_{wr,te,rb} 0.25, pass_td 5, …`) a pre-2022
row (`rec_fd`, `rush_fd`, `pass_fd`, no `bonus_fd_*`, `deriveFirstDowns: true`) and a 2022+ row
with identical stats plus `bonus_fd_te` = their sum (`deriveFirstDowns: false`) score **identically**,
and the value is hand-computed in the test. `NON_ADDITIVE_KEYS`: a settings object carrying
`pass_ypa: 1` scores a row with `pass_ypa: 40` as 0 through `scoreSeasonStats` (and the settings
object passed in is not mutated); the set has exactly the 29 keys of §2.3a.

**4.2 `src/api/sleeperStats.test.js`** — the file mocks `calculateFantasyPoints` (`:17`,
`vi.fn(() => 10)`); make that mock partial (`importOriginal`) so the new exports are real, and keep
the existing assertions' intent. Add `rescoreSeasonTotals` cases:
- `fantasyPoints` = hand-computed league score; `scoringBasis: 'league'`; `sourceFantasyPoints`/`sourceScoringBasis` kept.
- `weeklyPoints` scaled — each week = round(v × ratio), sum within 0.01 × weeks of `fantasyPoints`; keys preserved; array input stays an array.
- ratio undefined (source −2) → every week `null`; source 0 & scored 0 → weeks unchanged.
- idempotent: second pass returns the same row objects; input deep-frozen and `stats` reference identical (no derived key leaked).
- per-season detection: a map where one row has `bonus_fd_wr` → other rows get **no** derived bonus; a map with none → WR row gets it.
- `null` / `{}` scoringSettings → same reference returned.
- `loadCareerHistory` (data-store path): `setCacheWithMeta` receives the **raw** rows; returned season is rescored.
- `loadCurrentSeasonTotals`: fresh fetch caches raw, returns rescored; cache-hit path returns rescored; no settings → raw passthrough (existing cases updated for the new signature).

**4.3 `src/utils/inSeasonEvidence.test.js`** — prior season and live rows both passed through the
real `rescoreSeasonTotals` → `basisOk`, non-null `rosPpg`, `leagueScored: true`; prior rescored but
live raw → posteriors null (gate refuses `'league'` vs `'half_ppr'`) **and** `leagueScored: false`;
both raw → `leagueScored: false`, posteriors present (both `'half_ppr'`).

**4.4 `src/utils/dynastyScore.test.js`** — `positionBasisScale`: 30 half_ppr-sourced TE rows at
ratio 1.3 → `TE: 1.3`; 29 → `1`; rows with `sourceScoringBasis: null` ignored; unrescored
careerStats → all `1`. `computeProspectScore` invariance: scaling `positionPeakPPG[pos]` and
`basisScale` by the same factor leaves the score unchanged (no KTC, R1 pick).

**4.5 Rookie path** (`rookieCeiling.test.js` / `seasonProjection` rookie tests) — `basisScale 1.3`
multiplies `factors.basePPG`, `rookieCeilingKnee`, `rookieCeilingAsymptote` by 1.3 and records
`rookieBasisScale: 1.3`; omitted `positionBasisScale` → today's exact outputs. **`factorsSchema.test.js`:**
add `'rookieBasisScale'` to `ROOKIE_FACTORS_KEYS`, 59 → 60 in its comments and test name.

**4.6 `projectionSnapshot.test.js`** — `projectionBasis` `'league'` / `'half_ppr'` / `'mixed'` /
`'unknown'`; `schemaVersion` still 3.

**4.7 `statKeysContract.test.js`** — new `FIRST_DOWN_KEYS = ['pass_fd','rec_fd','rush_fd','bonus_fd_qb','bonus_fd_rb','bonus_fd_wr','bonus_fd_te']`
asserted present & finite in the 2025 fixture (all verified present).

**4.8** `Market.test.jsx` In-season note: both copies. `currentSeasonTotalsIsolation.test.js`
must stay green unmodified in intent (update only a literal call signature if it asserts one).

---

## §5 Docs

- **`CLAUDE.md`** — replace the *Fantasy points computed weekly* invariant (`:103`) with:
  `**Fantasy points: weekly, or one season seam.** Score per-week stats with \`calculateFantasyPoints(weekStats, scoringSettings)\`. A season row's \`fantasyPoints\` comes only from \`rescoreSeasonTotals\` (\`src/api/sleeperStats.js\`); season-level dot-products (it, \`getCategoryPoints\`, \`computeTdReliance\`) are valid only because scoring keys are per-game counts; \`scoreSeasonStats\` excludes \`NON_ADDITIVE_KEYS\`.`
  (Plan review: `getCategoryPoints` at `seasonProjection.js:727` and `computeTdReliance` already
  dot-product season stats; the old wording was already false for them.) Factors contract:
  `59 rookie keys` → `60`. Check `claudeMdSize.test.js` stays green.
- **`docs/integrations.md:197`** — rewrite the fantasy-point-calculation line to the same rule;
  snapshot section: `projectionBasis` (values, absent ⇒ pre-fix half-PPR), `schemaVersion` still 3.
- **`docs/projection.md`** — rookie baseline and ceiling: constants are half-PPR-calibrated and scaled
  at runtime by `positionBasisScale` (definition, the 30-row floor, D-45). New short subsection
  *Scoring basis*: projections are built on league-basis careerStats (the seam, first-down
  reconstruction pre-2022, current-position choice + its measured error).
- **`docs/dynasty-scoring.md`** (grep `POSITION_PRIOR_PPG`) — same scale note.
- **`docs/navigation.md`** (`sleeperStats.js` row: the seam + new `loadCurrentSeasonTotals`
  signature) and **`docs/nav/utils.md`** (`fantasyPoints.js`: new exports incl. `NON_ADDITIVE_KEYS`;
  `dynastyScore.js`: `positionBasisScale`).
- **`docs/ui.md`** — the In-season note description (`:203` area) and any pop-up game-log/distribution
  wording that states the points basis.
- **`docs/signal-registry.md`** (CR-18) —
  - *Fantasy scoring core* row: Reconstructable cell's `(FP recomputed weekly from \`stats\` ×
    \`scoringSettings\`, never summed.)` → `(served \`fantasyPoints\` is Sleeper half-PPR; the app
    rescores every season from \`stats\` × the league's \`scoringSettings\` in \`rescoreSeasonTotals\`
    — the served value survives as \`sourceFantasyPoints\`; \`weeklyPoints\` scaled by the season ratio.)`;
    Current-use cell: `This reader uses the **stored** half-PPR \`fantasyPoints\` (not recomputed from
    \`stats\` × \`scoringSettings\`), gated on a matching \`scoringBasis\`` → `This reader uses the
    rescored league-basis \`fantasyPoints\`, gated on a matching \`scoringBasis\` (set by the seam)`.
  - **New §3A row:** `| First downs (\`pass_fd\`, \`rec_fd\`, \`rush_fd\`) and Sleeper's first-down bonus (\`bonus_fd_{qb,rb,wr,te}\`) | raw ingested data | \`nfl/season-totals\` stat keys | \`*_fd\` **2012+**; \`bonus_fd_*\` **2022+ only** (zero rows 2012–2021) | **Reconstructable** — \`bonus_fd_<pos>\` = \`pass_fd\` + \`rec_fd\` + \`rush_fd\` (verified 2022–2026) | active→projectedPPG + dynasty score via \`rescoreSeasonTotals\`: served \`bonus_fd_*\` used as-is in seasons that emit it, derived under the player's current position in seasons that emit none (season-rescore.md) |`
  - **New computed-factor row** (after the *Rookie realisation ceiling* row, `:105`):
    `| Scoring-basis scale (\`positionBasisScale\`; rookie \`rookieBasisScale\`) | computed factor | \`dynastyScore.js\` \`computeEmpiricalAgeCurves\` — per-position median of rescored ÷ served PPG over gp ≥ 10 rows served as \`half_ppr\` (30-row floor, else 1) | 2012+ (same rows as the age curves) | **Reconstructable** (pure function of season-totals + \`scoringSettings\`) | active→projectedPPG (rookie path: scales \`ROOKIE_BASELINE_PPG\` and the \`ROOKIE_CEILING\` knee/asymptote; recorded as \`factors.rookieBasisScale\`) + active→dynasty score (scales \`POSITION_PRIOR_PPG\`); \`PROVISIONAL(heuristic)\` — interim until the data-side custom-basis refit (season-rescore.md) |`
  - §3C: add `projectionBasis` to the envelope list (`:122`); *Scoring settings* row name gains
    `projectionBasis`, Current use gains `; since season-rescore.md also the basis every careerStats
    row is rescored onto — a projection input, not only a grading basis`.

---

## §6 Cross-repo impact

Every entry was checked against its live `Triggers`. Registry edits below are **inside the mirrored
span of `docs/cross-repo-registry.md`**; route is the standing two-session route — **app applies
first, data syncs** (D-43). The daily `registry-mirror.yml` run is red between the app push and the
data sync; keep that window same-day. Never write the sentinel literals inside an entry.

### 6.1 CR-01 · Projection snapshot envelope — **fires** (`projectionSnapshot.js`; `seasonProjection.js` rookie `factors` + projection values)

**App-side edit** — append to CR-01's **Invariant**, after the `At v3 (D1a)` sentence:
` **Since season-rescore.md (still v3, no bump)**, the envelope carries top-level \`projectionBasis\` — \`'league'\` when every careerStats season was rescored onto this snapshot's own \`scoringSettings\`, else \`'half_ppr'\`/\`'mixed'\`/\`'unknown'\`; **absent means a pre-switch capture whose projections are half-PPR even though its \`scoringBasis\` says \`'custom'\`** — except any season whose \`inputStatus.careerStats.detail.provenance\` is \`'live-api'\`, which was league-scored even then — additive only.`

**Mirror (verbatim, CR-01):**
> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

**Answer to the Mirror:** new envelope field `projectionBasis` (above); new rookie factor
`rookieBasisScale`; `schemaVersion` **not** bumped (§2.5). `scoringSettings` unchanged.
**Consequence the data side must act on:** every snapshot's projections change basis on the
switch date — D-44.

### 6.2 CR-02 · season-totals row composition — **fires** (the season-totals loader in `sleeperStats.js`, `loadCurrentSeasonTotals`, `buildPriorSeasonContext`)

**App-side edits (mirrored span) — CR-02 is extended rather than a new entry drafted** (plan
review `[registry-gap]`: a brand-new entry routes to the Claude.ai project; extending an existing
one stays in-repo, and served-row composition is CR-02's own subject):
1. **App side** — append: `; since season-rescore.md, \`rescoreSeasonTotals\` in \`src/api/sleeperStats.js\` (applied to every \`careerStats\` season in \`loadCareerHistory\` and to \`loadCurrentSeasonTotals\`' rows) and \`scoreSeasonStats\`/\`withFirstDownBonus\`/\`seasonEmitsFirstDownBonus\` in \`src/utils/fantasyPoints.js\` read every key of the league's \`scoringSettings\` off season-totals \`stats\`, plus \`pass_fd\`/\`rec_fd\`/\`rush_fd\` and the season-wide presence of any \`bonus_fd_*\` key`
2. **Invariant** — append: ` **Since season-rescore.md**, every Sleeper scoring stat key also survives aggregation under its Sleeper name as the plain sum of its weekly values — all \`bonus_*\`, \`pass_fd\`/\`rec_fd\`/\`rush_fd\`, \`kr_yd\`/\`pr_yd\`, the per-game threshold counts \`bonus_rec_yd_100/200\`/\`bonus_rush_yd_100/200\` — and \`bonus_fd_*\` stays **absent, never zero-filled**, in seasons Sleeper did not emit it (2012–2021): the app detects emission per season by key presence.`
3. **Triggers** (app side, before `‖`) — append: `, \`rescoreSeasonTotals\` in \`src/api/sleeperStats.js\`, \`scoreSeasonStats\`/\`withFirstDownBonus\`/\`seasonEmitsFirstDownBonus\` in \`src/utils/fantasyPoints.js\`; the served-\`weeklyPoints\` readers \`src/components/dp/GameLogSection.jsx:32\` and \`src/hooks/usePlayerProfile.js:98\` (\`[registry-stale]\`, reported by season-rescore.md's plan gate, corrected here)`; data side (after `‖`) — append `, \`isPrunedStatKey\`/\`prunePlayerStats\` in \`lib/sleeper.mjs\``.
4. **Mirror** — append: ` **Since season-rescore.md the app rescores every season's \`fantasyPoints\` from \`stats\` × the league's \`scoringSettings\`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 \`bonus_fd_*\` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's \`scoringSettings\` can carry.`

**Mirror (verbatim, CR-02):**
> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

**Answer:** no schema bump; served shape unchanged; the app no longer uses served `fantasyPoints`/
`weeklyPoints` except as `sourceFantasyPoints` and the weekly-scaling source. The stat keys it now
depends on are recorded in the CR-02 extension above.

### 6.3 CR-14 · `calculateFantasyPoints` port — **fires** (`src/utils/fantasyPoints.js`)

**App-side edit** — append to CR-14's **Invariant**:
` **Since season-rescore.md** the app also scores served season totals, through \`scoreSeasonStats\` in the same file: in a season where no row carries any \`bonus_fd_*\` key (2012–2021), each QB/RB/WR/TE row is first given \`bonus_fd_<pos>\` = \`pass_fd\` + \`rec_fd\` + \`rush_fd\` (position = the player's current Sleeper position); \`calculateFantasyPoints\` itself is unchanged. A port used on pre-2022 seasons in a custom basis must reproduce that derivation.`

Also in CR-14 (mirrored span):
- **App side** — replace the parenthetical `(\`src/App.jsx:788\`/\`:790\`/\`:795\` and \`src/api/sleeperStats.js:199\` call it but do not define the math, so they are not triggers.)` with `(its callers — \`src/api/sleeperStats.js\` \`getSeasonTotals\`, \`src/hooks/useWeeklyDecision.js\` \`buildLast3Form\`, \`src/utils/weeklySeasonGrid.js\`, \`src/utils/weeklyLineup.js\` — do not define the math, so they are not triggers; \`[registry-stale]\`, reported by season-rescore.md's plan gate, corrected here.) Since season-rescore.md the same file also defines \`scoreSeasonStats\` (season-total scoring: first-down derivation + \`NON_ADDITIVE_KEYS\` exclusion)`.
- **Mirror** — replace the last sentence (`Note one deliberate asymmetry: … must not be "mirrored back" into the app.`) with: `**\`RATE_KEYS\` has an app counterpart since season-rescore.md:** \`NON_ADDITIVE_KEYS\` in \`src/utils/fantasyPoints.js\`, applied by \`scoreSeasonStats\` only — the app now scores season totals, where a non-additive key would be wrong. \`calculateFantasyPoints\` (weekly) stays unguarded on both sides. **Keep the two lists identical.**`

**Mirror (verbatim, CR-14):**
> Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored — **and so does the R3-FIT panel** (CR-15), which builds its outcome column from the same port. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades and a wrong fit. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed. Note one deliberate asymmetry: `RATE_KEYS` (`lib/fantasyPoints.mjs:29`) is a data-side-only defensive guard excluding non-additive keys from the dot-product; it has **no app counterpart** and must not be "mirrored back" into the app.

**Answer:** the dot-product is unchanged, so forward in-basis grading (2026+, emitted
`bonus_fd_*`) needs no port change. The derivation must be ported before any custom-basis run over
2012–2021 — folded into D-45/D-46.

### 6.4 CR-15 · R3-FIT factor-multiplier mirror — **fires** (`dynastyScore.js` `computeEmpiricalAgeCurves`; `seasonProjection.js` rookie constants)

**App-side edit** — append to CR-15's **App side**, after `` `src/utils/careerComps.js` (career-arc vectors and comp matching) ``:
` **season-rescore.md:** every mirrored PPG input is now league-basis (served half-PPR is rescored at load), and \`computeEmpiricalAgeCurves\` also returns \`positionBasisScale\` (per-position median rescored/served PPG over gp ≥ 10 rows, 30-row floor) which \`rookieProjection\` applies to \`ROOKIE_BASELINE_PPG\` and, via \`applyRookieCeiling\`'s \`basisScale\`, to the \`ROOKIE_CEILING\` knee/asymptote — recorded per rookie as \`factors.rookieBasisScale\``

**Mirror (verbatim, CR-15):**
> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`) only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the three app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`.

**Answer:** the rookie scale is a change captured snapshots will carry → a new rookie model at the
switch boundary, not an overwrite (D-46).

### 6.5 CR-21 · In-progress season-totals reads — **fires** (`loadCurrentSeasonTotals`, the App effect, `buildInSeasonPosteriors`)

**App-side edit** — in CR-21's **Invariant**, replace
`every player row carries \`scoringBasis\` (the app refuses to blend a live row against a prior season without a matching basis, so its absence silently empties every in-season posterior)`
with
`every player row carries the scoring \`stats\` the app rescores it from (since season-rescore.md the app rescores live rows exactly like careerStats and sets \`scoringBasis: 'league'\` itself — the served label survives only as \`sourceScoringBasis\`; the blend still refuses a live row whose label differs from the prior season's)`

**Mirror (verbatim, CR-21):**
> If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell on `/teams` or `/portfolio`** — it will render a half-season's rates as though they were a season's, with no error and no test failure. `/week` compares each team's DEF-row `gamesPlayed` against that team's scheduled REG games through Sleeper's completed weeks and states the lag (`deriveStoreLag`), so a stopped job surfaces there as a lag notice that never clears. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

**Answer:** cadence, marking and floor unchanged; DEF-row `gamesPlayed`/`fan_pts_allow_*` untouched.
The in-progress rows still never reach the scoring pipeline.

### 6.6 CR-18 · Signal registry rows — **fires** (§5's `docs/signal-registry.md` edits)

**Mirror (verbatim, CR-18):**
> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Answer:** app-originated row edits (§5); data side checks whether `data-catalog.md`'s
season-totals row needs the first-down coverage fact (D-43).

### 6.7 Checked, not fired

CR-20 (`fan_pts_allow_*` never read or written by the seam — `stats` untouched); CR-22 (no change to
`LS_USER`/`LS_LEAGUE`, the auto-load effect, the `[snapshot] wrote` marker, `DB_NAME`/`STORE`, or the
`projection-snapshots/` key); CR-16 (no team-code handling); CR-04 (no manifest reads added);
CR-11/12/13/19 (their keys read unchanged); CR-24 (no registry file moved, no *Drift check* line
reworded — the span edits make the mirror run red until D-43, which is expected); CR-03/05–10/17/23
(untouched families).

---

## §7 Backlog — append to `.claude/tasks/data-repo-backlog.md`

Each with **Found:** season-rescore.md (app `<sha>`).

- **D-43 · Registry sync — CR-01/02/14/15/21 edits** · Blocking: yes for CR-24 (mirror run
  red until synced); no for the app · two-session route. Byte-copy the app span, run
  `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`; check `data-catalog.md`'s
  season-totals row for the `bonus_fd_*` 2022+ coverage fact (CR-18). Data-side parity: `RATE_KEYS` ↔ app `NON_ADDITIVE_KEYS` must stay identical (CR-14).
- **D-44 · Regime-aware grading across the switch** · Blocking: yes for any grade of a 2026-target
  snapshot (calendar-blocked to ~Jan 2027 regardless). Snapshots without `projectionBasis` carry
  half-PPR projections while `scoringBasis` says `'custom'`; `grade-snapshot.mjs:170-173` would grade
  them in-basis against league outcomes. Grade absent-field captures against half-PPR outcomes (or
  flag them), `'league'` captures in-basis; honour per-season `live-api` provenance. Mirror: CR-01's
  text in §6.1.
- **D-45 · Custom-basis full-pipeline backtest + rookie-constant refit** · Blocking: no — replaces
  the interim `positionBasisScale` rescale on `ROOKIE_BASELINE_PPG`, `ROOKIE_CEILING`,
  `POSITION_PRIOR_PPG` and re-measures `ROOKIE_CALIBRATION` in basis. Requires the CR-14 first-down
  derivation ported for 2012–2021 outcomes. Mirrors: CR-14 and CR-15 texts in §6.3/§6.4.
- **D-46 · CR-15 mirror basis** · Blocking: no. The R3-FIT / rookie mirror pins `half_ppr`; add the
  league-basis model at the switch boundary (new model, not an overwrite; `anchor-policy.md` row),
  including `positionBasisScale` and `factors.rookieBasisScale`. Mirror: CR-15 text in §6.4.
- **D-47 · Per-week scoring keys in season-totals** · Blocking: no. The store keeps only
  `weeklyPoints` (half-PPR) per week, so the app scales weeks by a season ratio (median 4.6%, p90
  19% per-week error). Serving per-week values of the scoring keys would make the rescore exact.
  Size/shape to be planned data-side (CR-02 row composition).

---

## §8 Graded gate — what exists now, what must wait

**This moves every `projectedPPG`. No graded verdict is claimed.** The app repo has no harness that
reproduces historical projections end to end, so a pipeline-level in-basis error comparison is not
producible here.

**Available now (Session 1, offline, descriptive only)** — Step-1 persistence (the `basePPG`
weighted mean of the prior three ≥ 8-GP seasons) predicting the target season, each basis scored
against its own outcome; n in brackets:

| target | QB rel-MAE half / league | RB | WR | TE | cross-position Spearman vs **league** outcome: half-basis input / league-basis input |
|---|---|---|---|---|---|
| 2021 (reconstructed fd) | 0.175 / 0.171 (29) | 0.388 / 0.368 (91) | 0.417 / 0.401 (146) | 0.402 / 0.401 (78) | 0.785 / 0.809 (344) |
| 2025 (emitted fd) | 0.168 / 0.172 (29) | 0.328 / 0.309 (74) | 0.388 / 0.379 (138) | 0.441 / 0.430 (94) | 0.819 / 0.832 (335) |

Reading: relative error is flat-to-slightly-better; cross-position ordering against what the
league actually pays improves by 0.013–0.024. Within-position Spearman is mixed (WR 2025 0.796 →
0.728) — n is small and no interval was computed. Not a verdict.

**Must wait for the data side:** the full-pipeline custom-basis panel (D-45) — in-basis MAE of
shipped vs rescored projections with a clustered bootstrap — and forward grading of `'league'`
snapshots (D-44, ~Jan 2027).

---

## §9 Smoke (done-definition 6)

Market Value set sorted by projected PPG: TE rows move up, return specialists up, no `NaN`/blank
PPG; the In-season set renders numbers (not the no-data state) and its note reads "Scored on this
league's settings."; one TE and one RB pop-up: season line, game-log `pts` and distribution render,
game-log weeks sum ≈ the season total; `/week` and `/portfolio` load clean; console free of new
errors. Snapshot: read today's `projection-snapshots/<date>` record from IndexedDB (after clearing
it) and confirm `projectionBasis: 'league'`, `schemaVersion: 3`, a rookie with `rookieBasisScale`.
Report the four `positionBasisScale` values seen live.

## §10 Touch list

`src/utils/fantasyPoints.js`, `src/api/sleeperStats.js`, `src/App.jsx`, `src/utils/dynastyScore.js`,
`src/utils/seasonProjection.js`, `src/utils/projectionSnapshot.js`, `src/utils/inSeasonEvidence.js`,
`src/components/market/Market.jsx`, `src/components/dp/GameLogSection.jsx`,
`src/components/dp/DistributionSection.jsx`; tests per §4; docs per §5; `docs/cross-repo-registry.md`
(§6.1–6.5); `.claude/tasks/data-repo-backlog.md` (§7); `outlookConsistency.js`,
`PlayerDetailTabs.jsx` (tags only, §3.8).
**Not touched:** `calculateFantasyPoints`' body, `getSeasonTotals`, `cache.js`, the FPA modules,
`teamContext.js`, any view-only guard's module list.

---

## Review records

### Plan review 1 (plan-reviewer, 2026-09-25) — 13 flags, each verified against live source; decisions by Session 1 (Anton delegates review calls)

| # | Flag | Verdict | Applied |
|---|---|---|---|
| 1 | New invariant wording false: `getCategoryPoints` (`seasonProjection.js:727`) and `computeTdReliance` already dot-product season stats | correct | §5 invariant reworded to name them and the additivity condition |
| 2 | No guard for non-additive keys; live-API rows' summed stats include rates | correct (risk ≈ 0 today, but the claim should hold by construction) | §2.3a `NON_ADDITIVE_KEYS` = data `RATE_KEYS`; CR-14 Mirror asymmetry reversed (§6.3). Live-API rows still rescored — reasoned in §2.3a |
| 3 | `deriveScoringBasis` label collides (`rec 0.5` custom league → `'half_ppr'` both sides) | correct | §2.3 rows labelled `'league'`; `deriveScoringBasis` no longer moved |
| 4 | K/DEF rows feed `computeTeamContext` team rank | correct (verified `teamContext.js:161-172`) | §2.3b — accepted, documented; DEF-in-offence-rank reported as pre-existing |
| 5 | Absolute SD displays not tagged | correct | §3.8 extended to `outlookConsistency.js:18`, `Market.jsx:535,552`, `PlayerDetailTabs.jsx:89` |
| 6 | `rookieBasisScale` lacks a signal-registry row | correct | §5 new computed-factor row |
| 7 | `leagueScored` read prior side only | correct | §3.7 both sides via one shared single-basis helper; §4.3 case |
| 8 | CR-01 edit lacks the `live-api` qualifier | correct | §6.1 |
| 9 | `[registry-gap]` CR-25 | accepted the reviewer's alternative | folded into CR-02 as an extension (§6.2) — stays in-repo; no count change in `CLAUDE.md` |
| 10 | `[registry-stale]` CR-02 `weeklyPoints` readers | correct | §6.2 edit 3 |
| 11 | `[registry-stale]` CR-14 callers | correct | §6.3 App-side edit |
| 12 | anchor `:755` → `:756` | correct | §3.3 |
| 13 | size ~50KB | advisory | not split — reason in the header size note |
