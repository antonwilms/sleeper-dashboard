# Task: Projection D2 — Snap Share & Own-Rate Red-Zone Usage

Wire two **active** PPG multipliers into the veteran projection pipeline, derived
entirely from stat fields **already present** in cached Sleeper season-totals:

1. **Snap share** — `off_snp / tm_off_snp` (field-time signal).
2. **Own-rate red-zone usage** — position-specific (scoring-position role signal):
   - RB: `rush_rz_att / rush_att`
   - WR/TE: `rec_rz_tgt / rec_tgt`
   - QB: `pass_rz_att / pass_att`

This is a **Thread C-style** batch (derive-from-existing-data + wire-in). No new
API integration, no matching utility, no App.jsx state wiring. One new helper
module + edits to `seasonProjection.js` + tests + docs.

---

## 1. Verification findings (current source, read this session)

All assumptions in the brief were checked against current source. Results:

### `src/utils/seasonProjection.js`
- **Signature is 15 positional args** (`nflDraftMatches` is #15, default `null`):
  `computeNextSeasonProjection(playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, historicalShares, depthMap, teamContext, scoringSettings,
  ktcMap, collegeStats, currentSeason, qbQualityByTeam=null, ktcHistory=null,
  nflDraftMatches=null)`.
- **`combinedNewFactor` clamp = `[0.78, 1.30]`**, currently wrapping **7** factors:
  `qbQualityFactor × momentumFactor × breakoutFactor × bounceBackFactor ×
  tdRelianceFactor × trajectoryFactor × efficiencyFactor` (lines 464–468).
- **Pipeline product** (line 469): `rawPPG = basePPG × ageDelta ×
  shareTrendMultiplier × regressionFactor × teamFactor × depthFactor ×
  combinedNewFactor`. Note `teamFactor` and `depthFactor` are applied **outside**
  the clamp; the 7 "new" factors are **inside** it.
- **`depthFactor`** (Step 7, lines 440–445): depthOrder 1 → 1.05, 2 → 0.88, ≥3 →
  0.68, null → 1.00.
- **`rookieMultiplierProduct` clamp = `[0.45, 1.85]`** (line 163), rookie path only.
- The player's most-recent-qualifying-season raw stats are already available as
  `lastSeasonRaw.stats` (line 359) — the new helper reuses this, no new lookup.

### `factors` contract (`src/__tests__/factorsSchema.test.js`)
- **Vet path: exactly 56 keys** = 43 explicit + 13 `ktcSignals`.
- **Rookie path: exactly 42 keys** = 23 explicit + 13 `ktcSignals` + 6 D1 NFL-draft.
- Test asserts **both directions** (no missing, no extra) — adding any key here
  fails the test until `VET_FACTORS_KEYS` is updated. This is the forcing function.

### `src/api/sleeperStats.js` — **no fix needed** ✅
- The live-aggregation loop (lines 182–184) sums **every** stat key generically:
  `for (const [key, val] of Object.entries(stats)) { if (val != null)
  totals[playerId].stats[key] = (totals[playerId].stats[key] ?? 0) + val }`.
- Therefore `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`,
  `rush_att`, `rec_tgt`, `pass_att` all **survive aggregation** and land in
  `careerStats[year][playerId].stats`. Summed across played weeks, so
  `off_snp/tm_off_snp` is a season-level snap share and `rush_rz_att/rush_att` a
  season-level RZ own-rate — exactly what we want. **No `sleeperStats.js` change.**

### 2025 fixture (`src/__fixtures__/season-totals-2025.json`)
- All five new stat keys present and nested under `stats`:
  `off_snp` (945 players), `tm_off_snp` (2136), `rec_rz_tgt` (377),
  `rush_rz_att` (214), `pass_rz_att` (77); denominators `rush_att` (335),
  `rec_tgt` (502), `pass_att` (96).
- **`rec_rz_td` / `rush_rz_td` are absent (0 players).** Only RZ *opportunity*
  (att/tgt) exists, not RZ conversions — matches the brief's formulas exactly.
  Do **not** design anything on RZ-TD fields.

### Distributions (gp ≥ 8, rough position split, from the fixture)
| Signal | p10 | p25 | med | p75 | p90 |
|---|---|---|---|---|---|
| **QB** snap share | 0.808 | 0.862 | **0.954** | 0.977 | 0.984 |
| **RB** snap share | 0.169 | 0.290 | **0.468** | 0.593 | 0.671 |
| **WR/TE** snap share | 0.370 | 0.457 | **0.582** | 0.779 | 0.859 |
| **QB** `pass_rz_att/pass_att` | 0.091 | 0.113 | **0.135** | 0.149 | 0.159 |
| **RB** `rush_rz_att/rush_att` | 0.094 | 0.121 | **0.172** | 0.202 | 0.233 |
| **WR/TE** `rec_rz_tgt/rec_tgt` | 0.065 | 0.090 | **0.122** | 0.167 | 0.208 |

Two decisions fall straight out of this data:
- **QB snap share is near-constant (0.81–0.98, median 0.95) → gate QB out of snap
  share.** A backup QB who plays half a season (gp ≥ 8 due to injury) would post a
  low snap share and be wrongly penalised; starters are indistinguishable at the
  top. Snap share is **RB/WR/TE only**.
- **RB/WR snap share is wide → that's where the signal lives** (committee back at
  0.29 vs bellcow at 0.67). RZ own-rates differ by position → percentile-within-
  position-cohort handles the position baseline automatically (no hardcoded anchor).

### `docs/projection.md`
- Veteran-pipeline step table (lines 15–27) + the `combinedNewFactor` paragraph
  (line 29, "**seven** new PPG multipliers … natural range [0.680, 1.514]") are
  the primary doc-edit targets. Capture-only factor sections (Historical KTC, line
  87; Position multiplicity, line 104) are the format precedent for new factor rows.

### `src/__fixtures__/factories.js`
- `makeVet` / `makeRookie` expose `.asArgs()` (15-arg spread). `makeSeasonEntry`
  default stats contain **no** snap/RZ fields → the new factors are **neutral by
  default**, so every existing integration test stays **byte-identical**. New tests
  add `off_snp`/`tm_off_snp`/`*_rz_*` via the `stats` override.

---

## 2. Per-signal spec

Both signals live in a new helper, `src/utils/usageMetrics.js`, modelled
**exactly** on `efficiencyMetrics.js` (cohort table keyed by `careerStats`
identity, `percentileRank` + shrinkage-toward-50, NEUTRAL sentinel object, single
`clamp`). Per the Thread-B precedent, the tiny `percentileRank`/`clamp` helpers are
**duplicated** into the new module rather than imported from `efficiencyMetrics.js`
(which must not be modified).

### Helper API
```js
// src/utils/usageMetrics.js
export function computeUsageFactors(position, lastSeasonStats, careerStats, playersMap)
//   → { snapShare, snapShareFactor, rzUsageRate, rzUsageFactor, rzUsageCategory }
```
- `lastSeasonStats` = `.stats` of the player's most-recent qualifying season
  (caller passes `lastSeasonRaw.stats`).
- Cohort reference season = `Math.max(...Object.keys(careerStats))`, exactly like
  `efficiencyMetrics.buildCohortTable`. One cohort table, two pools per position
  (snap, rz), built once and memoised on `careerStats` identity.
- NEUTRAL return (any missing input):
  `{ snapShare:null, snapShareFactor:1.0, rzUsageRate:null, rzUsageFactor:1.0, rzUsageCategory:null }`.

### Signal A — Snap share
| Property | Value |
|---|---|
| **Formula** | `off_snp / tm_off_snp` from `lastSeasonStats` |
| **Denominator-zero / missing** | if `off_snp` or `tm_off_snp` null/absent, or `tm_off_snp ≤ 0` → `snapShare=null`, `snapShareFactor=1.0` |
| **Position activation** | **RB / WR / TE only.** QB → null/neutral (data shows ~constant 0.95; low information, mis-penalises injury-fill starters) |
| **Cohort pool** | per-position snap shares from reference season, gated by `off_snp ≥ MIN_SNAP_OPPS = 100` (≈ half-season of snaps; keeps cameo players out of the reference) |
| **Aggregation** | single most-recent qualifying season (C1/C3 precedent) |
| **Normalization** | percentile within position cohort, shrunk toward 50 with `shrinkK = 200` (off_snp units). `index = (shrunkPct − 50)/50 ∈ [−1,1]` |
| **Multiplier** | `snapShareFactor = clamp(1 + index × 0.06, 0.94, 1.06)` — **±6%** |

### Signal B — Own-rate red-zone usage
| Property | Value |
|---|---|
| **Category by position** | RB → `rush` (`rush_rz_att/rush_att`); WR/TE → `rec` (`rec_rz_tgt/rec_tgt`); QB → `pass` (`pass_rz_att/pass_att`). **Primary position only** (C1/C3 precedent) |
| **Formula / zero-guard** | `rz / opp`; if `opp` (`rush_att`/`rec_tgt`/`pass_att`) null/absent or `≤ 0` → `rzUsageRate=null`, `rzUsageFactor=1.0` |
| **Cohort pool MIN** (reuse C1 `MIN_COHORT_OPPS`) | `rush_att ≥ 30` · `rec_tgt ≥ 20` · `pass_att ≥ 50` |
| **Shrinkage `shrinkK`** (reuse C1) | RB 40 · WR/TE 25 · QB 80 |
| **Aggregation** | single most-recent qualifying season |
| **Normalization** | percentile within position cohort, shrunk toward 50. `index = (shrunkPct − 50)/50` |
| **Multiplier** | `rzUsageFactor = clamp(1 + index × 0.05, 0.95, 1.05)` — **±5%** |
| **`rzUsageCategory`** | `'rush'` / `'rec'` / `'pass'` (the category actually scored), else `null` |

**Why percentile-within-cohort, not absolute anchors:** RZ own-rates have no
universal "good" threshold and differ by position (medians 0.135/0.172/0.122);
snap share's informative spread (RB/WR) is best resolved relative to peers. This is
exactly the case C1 (`efficiencyMetrics.js`) already solved — reusing its proven,
shrinkage-protected, per-session-memoised cohort design avoids hardcoding 2025's
distribution and auto-adapts to each season. Considered-and-rejected: fixed
position-specific anchors (simpler but bakes in one season's distribution and
can't be validated without backtests).

---

## 3. Composite vs separate — **two separate factors**

`snapShareFactor` and `rzUsageFactor` stay distinct (not one "usageFactor"). They
measure orthogonal things — field time vs preferred scoring-position role — and
separating them gives clean per-signal backtest attribution. (Matches the brief's
recommendation.)

---

## 4. Pipeline location — **both inside `combinedNewFactor`** (Pattern A: flat factors)

The two factors join the existing 7-factor stack:
```js
const combinedNewFactor = clamp(
  qbQualityFactor * momentumFactor * breakoutFactor * bounceBackFactor
    * tdRelianceFactor * trajectoryFactor * efficiencyFactor
    * snapShareFactor * rzUsageFactor,           // ← D2
  0.78, 1.30
)
```
Rationale: they are small per-opportunity/usage multipliers exactly like
`efficiencyFactor`/`momentumFactor`; every prior vet-path signal (B1a/B1b/B2/C1)
lives inside this shared cap. Keeping them inside continues the established "all
new small multipliers share one ceiling" design and prevents stack blow-ups.
Rejected alternatives: separate post-pipeline multiplier (B3 blend style — not
warranted, these aren't ensemble blends) and modulating an existing factor (see §5,
the divergence cases work *better* as independent multipliers).

---

## 5. Cross-batch interaction analysis (with worked examples)

### 5.1 Snap share × depth chart (Step 7, `depthFactor`, applied outside the clamp)
Real overlap — but **flat independent multipliers compose correctly on the
divergence cases**, which is the whole point of adding snap share:

| Case | depthOrder → depthFactor | snap share → snapShareFactor | net (depthFactor × snapShareFactor) | reading |
|---|---|---|---|---|
| **Bellcow RB** | 1 → 1.05 | 0.67 (p90) → ~1.05 | ~1.10 | both agree; mild double-count, acceptable (a confirmed workhorse *is* more valuable) |
| **Committee RB (false starter)** | 1 → 1.05 | 0.29 (p10) → ~0.95 | ~1.00 | **snap share corrects the depth-chart "starter" overstatement** ✓ |
| **High-snap backup** | 2 → 0.88 | 0.60 → ~1.02 | ~0.90 | **snap share rescues a misleading depth-2 label** ✓ |
| **Buried depth-3** | 3 → 0.68 | 0.20 → ~0.94 | ~0.64 | both agree player is marginal ✓ |

Decision: **flat factor, accept the mild agree-case overlap; do NOT modulate
depthFactor.** Modulation (B2-style) would *blunt* the valuable divergence cases.
The only redundancy is when both signals agree (bellcow / buried), where a small
extra nudge is defensible.

### 5.2 RZ usage × `isTdReliant` (B1b, `tdRelianceFactor` inside the clamp)
Different quantities: `isTdReliant` measures TD-points **output** dependence (>40%
of fantasy pts from TDs → ×0.93); RZ own-rate measures RZ **opportunity** share.
**Independent composition reproduces the brief's exact 3-way ordering — no explicit
cross-wiring, no double-count:**

| Scenario | rzUsageFactor | tdRelianceFactor | product | reading |
|---|---|---|---|---|
| High RZ + TD-reliant | ~1.04 | 0.93 | ~0.967 | TDs are *structural* → regress **less** than a pure TD-reliant player ✓ |
| Low RZ + TD-reliant | ~0.96 | 0.93 | ~0.893 | flukey TDs → regress **harder** ✓ |
| High RZ + not TD-reliant | ~1.04 | 1.00 | ~1.04 | RZ role = positive TD-regression upside ✓ |

Decision: **independent; do NOT modulate `tdRelianceFactor`** (also out of scope —
`projectionSignals.js` is frozen). They multiply, the signs compose correctly, and
they measure opportunity vs output, so there is no double-count.

### 5.3 Snap share × share trend (Step 4, `shareTrendMultiplier`, outside the clamp)
Distinct: `shareTrendMultiplier` is the **trajectory** of carry/target share over
time (growing/declining); snap share is the **current level** of field time. A
rising-target-share slot receiver can still have low absolute snap share — both
fire independently and correctly. No overlap concern; they compose.

### 5.4 Snap share × role rank (`computeRoleRanks`)
**No pipeline interaction.** `roleRank` is a *display* rank (architecture.md), not a
projection input — it never enters `computeNextSeasonProjection`. It also uses
carry/target share, a different dimension than `off_snp`. Nothing to compose.

---

## 6. Stacking analysis & `combinedNewFactor` clamp decision — **keep `[0.78, 1.30]`**

Adding two factors changes the **natural** (pre-clamp) product range:
- Current 7-factor natural range (per code/doc): `[0.680, 1.514]`.
- `snapShareFactor ∈ [0.94, 1.06]`, `rzUsageFactor ∈ [0.95, 1.05]`.
- New 9-factor natural range ≈ `[0.680 × 0.94 × 0.95, 1.514 × 1.06 × 1.05]` =
  **`[0.607, 1.685]`**.

The clamp now binds for a **larger tail** of stackers. This is consistent with the
documented doctrine ("a deliberate ceiling, not a never-bind guardrail; future
batches add factors inside it rather than widening it"). **Keep `[0.78, 1.30]`.**
Most players sit well inside it; only multi-signal extremes (which we don't trust
without backtests anyway) clip.

**Trend to flag (not act on now):** at 9 multiplicands the product-with-outer-clamp
is getting crowded — the clamp is shading from "guardrail" toward "per-signal cap."
A future batch may want to restructure the inner stack into a single normalized
aggregate index (like `efficiencyIndex`) instead of a raw product. **Out of scope
for D2** (would perturb existing byte-identical behaviour). Recorded as an open
question (§11).

---

## 7. `factors` keys — vet-only, **+5 keys → 61 vet / 42 rookie**

New vet-path keys (added to the vet `return.factors` block):
| key | type | meaning |
|---|---|---|
| `snapShare` | number\|null | `off_snp/tm_off_snp`, rounded 3dp; null when missing or QB |
| `snapShareFactor` | number | multiplier, `[0.94,1.06]`; 1.0 when neutral |
| `rzUsageRate` | number\|null | primary-category RZ own-rate, 3dp; null when missing |
| `rzUsageFactor` | number | multiplier, `[0.95,1.05]`; 1.0 when neutral |
| `rzUsageCategory` | string\|null | `'rush'`/`'rec'`/`'pass'`/null |

**Rookie path unchanged (stays 42).** Rationale: these are vet-pipeline multipliers
(rookies have no prior NFL snap/RZ season), following the vet-only precedent of
`momentumFactor`/`efficiencyFactor`/`trajectoryFactor` (which are absent from the
rookie `factors`). Do **not** add them to the rookie path or `ROOKIE_FACTORS_KEYS`.

---

## 8. Step sequence (implementation order)

1. **Create `src/utils/usageMetrics.js`** — `computeUsageFactors(...)` + private
   `clamp`, `percentileRank`, `MIN_SNAP_OPPS`, `MIN_RZ_OPPS` (reuse C1 values),
   `SHRINK_K`, position config, cohort cache + `buildUsageCohortTable`. NEUTRAL
   sentinel as specified. Mirror `efficiencyMetrics.js` structure closely.
2. **Wire into `seasonProjection.js`** (vet path only):
   - `import { computeUsageFactors } from './usageMetrics'`.
   - After Step 5e (efficiency), add **Step 5f/5g**: call
     `computeUsageFactors(position, lastSeasonRaw.stats, careerStats, playersMap)`.
   - Add `snapShareFactor` and `rzUsageFactor` to the `combinedNewFactor` product.
   - Add the 5 keys to the vet `return.factors` block (rounded like neighbours;
     raw rates 3dp, factors 3dp).
   - Add adjustment-summary lines: `snapShareFactor > 1.02` → "High snap share ↑";
     `< 0.98` → "Low snap share ↓"; `rzUsageFactor > 1.02` → "Red-zone role ↑";
     `< 0.98` → "Limited red-zone role ↓".
3. **`factorsSchema.test.js`** — add the 5 keys to `VET_FACTORS_KEYS`; update the
   "56" comments/assertions to **61**. Leave `ROOKIE_FACTORS_KEYS` and "42" as-is.
4. **`statKeysContract.test.js`** — add a `USAGE_KEYS = ['off_snp','tm_off_snp',
   'rec_rz_tgt','rush_rz_att','pass_rz_att']` group, union into
   `ALL_CONTRACT_KEYS` (denominators `rush_att`/`rec_tgt`/`pass_att` are already in
   `EFFICIENCY_KEYS`). All five confirmed present in the fixture → passes.
5. **Tests** — new `src/utils/usageMetrics.test.js` + integration cases in
   `seasonProjection.test.js` (§10).
6. **Docs** — `docs/projection.md` (+ one line in `docs/integrations.md`) (§9).
7. **Done-definition:** `npm test` green (esp. `factorsSchema`, `statKeysContract`,
   `seasonProjection`), then `npm run build` clean.

---

## 9. README / docs updates

The repo was refactored into `docs/`; the thin root `README.md` needs **no change**.

**`docs/projection.md` (primary):**
- Veteran-pipeline step table: add rows **5f Snap share** and **5g Red-zone usage**
  (after 5e), each noting position activation, cohort-percentile + shrinkage,
  multiplier range, and "neutral when stats absent / QB for snap share."
- Update the `combinedNewFactor` paragraph (line 29): "**seven**" → "**nine**";
  add `× snapShareFactor × rzUsageFactor` to the formula; update natural range
  `[0.680, 1.514]` → **`[0.607, 1.685]`**; keep the "deliberate ceiling … add
  inside, don't widen" framing.
- Add a short subsection (mirroring the Step 5e efficiency paragraph) describing
  `computeUsageFactors` (`src/utils/usageMetrics.js`), the new `factors` keys, and
  that QB is gated out of snap share with the data justification.

**`docs/integrations.md` (one line):** in the Sleeper season-totals / career-history
notes, add that `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`
flow through the generic stat-summing aggregation and are consumed by the D2 usage
factors (no schema change; no data-repo coordination required for the live path —
see §11 risk on the data-store path).

---

## 10. Tests to add

**`src/utils/usageMetrics.test.js`** (unit, pure — node env):
- Snap share: high vs low snap share within a built cohort → factor > 1 vs < 1;
  missing `off_snp`/`tm_off_snp` → neutral; `tm_off_snp = 0` → neutral; **QB always
  neutral/null** regardless of inputs.
- RZ usage: high vs low RZ rate per position (RB rush / WR-TE rec / QB pass) →
  correct direction + correct `rzUsageCategory`; below-MIN-opp sample shrinks hard
  toward neutral; zero/absent denominator → neutral.
- Cohort cache: same `careerStats` identity reused; new identity rebuilds.

**`src/utils/seasonProjection.test.js`** (integration, `makeVet` overrides — use
**unique** `playerId`s per the `compsCache`/`cohortCache` isolation note):
- High snap share (RB) lifts `projectedPPG`; low snap share tempers it.
- Missing snap data → projection **byte-identical** to pre-D2 (regression guard:
  default `makeSeasonEntry` has no snap fields).
- High RZ rate lifts; low RZ tempers; verify `factors.rzUsageCategory`.
- **Cross-batch composition** worked cases from §5: committee-RB (depthOrder 1 +
  low snap → net ≈ neutral) and high-RZ + TD-reliant (net ≈ 0.967 direction).
- Clamp-binding: extend the existing `clampHiCareerStats` stacker with high snap +
  high RZ → confirm `combinedNewFactor` still pinned at 1.30.
- QB with full snap data → `snapShareFactor === 1.0`, `snapShare === null`.

**`src/__tests__/factorsSchema.test.js`** — `VET_FACTORS_KEYS` +5 (→ 61), assertion
text/count updated; rookie set untouched (the existing both-directions test is the
forcing function).

**`src/__tests__/statKeysContract.test.js`** — `USAGE_KEYS` added to the contract.

---

## 11. Edge cases & risks

- **Older-season coverage (brief risk #1).** Could not verify pre-2025 snap/RZ
  presence (only the 2025 fixture is in-repo). **Not on the critical path:** the
  player's value comes from their *most-recent qualifying season* and the cohort
  from the *reference (max) season* — both are current for any active player and
  have the fields. Seasons lacking the fields simply contribute nothing (own value
  null → neutral; excluded from cohort pool via the MIN gate). The "back to 2012"
  depth matters for cohort sample size, not correctness. Recommended (non-blocking)
  pre-impl spot-check: open DevTools → IndexedDB → a `season-totals/2018` entry and
  confirm whether `off_snp`/`*_rz_*` exist; informs only how far back the signal
  has data, not whether to ship.
- **Data-store path (cross-repo).** `getSeasonTotals` step 2 returns season-totals
  JSON authored by `sleeper-dashboard-data` (its `lib/sleeper.mjs` mirrors this
  aggregation). If those generated files strip snap/RZ fields, the data-store path
  yields neutral factors for affected seasons. Graceful-degradation handles it (no
  error, just neutral). **Not a D2 blocker and not editable from this repo** —
  flag in the task summary so the data repo can be checked/coordinated if deep
  historical snap data is wanted later. The live-API and fixture paths are
  unaffected.
- **Zero/again-missing denominators** → null rate → neutral factor (specified).
- **Position multiplicity** (receiving RB, rushing QB): **primary position only**
  for the active signal (C1/C3 precedent). Secondary-category RZ rate is **not**
  computed or captured in D2 (keeps `factors` lean; no backtest to justify it).
  Listed as an open question.
- **QB snap share**: gated out entirely (null/neutral) — data-justified.
- **Existing-test invariance**: default fixtures carry no snap/RZ fields → all
  pre-D2 projections remain byte-identical. This is the core safety property.

---

## 12. Open questions (for user)

1. **Secondary-category RZ usage** (e.g. a receiving RB's `rec_rz_tgt`, a rushing
   QB's `rush_rz_att`): default in this plan is **not captured** (primary only).
   Capture as additional null-able diagnostic keys for future backtesting? (Adds
   keys; raises vet count beyond 61.) Default: no.
2. **Multiplier magnitudes** (`±6%` snap, `±5%` RZ) and **MIN/shrinkK** values are
   conservative first guesses without backtest data, documented for re-tuning.
   Accept as-is, or prefer tighter (±3–4%) for the first ship?
3. **`combinedNewFactor` restructure** (raw product → normalized aggregate index)
   is flagged as a growing concern at 9 factors but deferred. Confirm deferral
   (recommended) vs. wanting it folded into D2.
4. **QB snap-share gate**: confirm gating QB out entirely (recommended on the data)
   vs. keeping QB in (near-neutral but exposes injury-fill starters to a spurious
   penalty).
