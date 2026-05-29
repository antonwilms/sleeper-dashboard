# Projection C3 — Player profile basics

## Goal

Two small additions to `seasonProjection.js`:

1. **Rookie age at draft** — replace the input to the rookie path's existing
   `ageMult` lookup. Use `currentAge − years_exp` (the player's age when they
   entered the NFL) instead of current age, for true rookies only
   (`years_exp ≤ 1`). This is an **input correction**, not a new multiplier:
   the existing lookup table and bucket boundaries stay byte-identical.
2. **Position multiplicity** — new diagnostic factor capturing the fraction of
   a veteran's fantasy points that come from a secondary stat category
   (e.g. CMC receiving, Lamar rushing, Deebo rushing). **Capture-only** — the
   value is recorded into `factors` for future backtesting and does not move
   `projectedPPG`.

**Height / weight: skipped in C3.** See Decision 3.

---

## Architectural decisions

### Decision 1 — Rookie age at draft: **active change, gated to `years_exp ≤ 1`**

The existing `ageMult` lookup (≤21 → 1.15, 22 → 1.05, 23 → 0.95, ≥24 → 0.82)
is conceptually a "youth at NFL entry" discount window. Current age approximates
draft age but drifts apart in years 2+. The fix is to feed the lookup the
correct input (`currentAge − years_exp`) **only for actual rookies**.

**Why gate to `years_exp ≤ 1`:** the rookie path also fires for "year-4 player
with zero qualifying seasons" — a real failed-to-launch population. Using draft
age there inflates the projection (`ageMult` shifts from 0.82 to 0.95+) for
players whose 4 years of evidence say they aren't going to break out. The
rookie path's age-discount only makes sense applied to *actual* young rookies;
for older rookie-path hits, current age is the correct input.

**Effect on existing outputs:**

- `years_exp = 0` (first-year rookies): `age − 0 = age`. Output is byte-identical.
- `years_exp = 1` (second-year rookies): the typical and intended change.
  E.g. a 23-year-old in his second year now uses draft age 22 → `ageMult 1.05`
  instead of `0.95`. This is the bug C3 fixes.
- `years_exp > 1` or `null`: falls back to current age. Byte-identical.
- Computed draft age outside `[18, 28]`: data is suspect; fall back to current
  age. Byte-identical.

### Decision 2 — Position multiplicity: **capture-only, position-aware definition**

Capture-only, mirroring C2's reasoning: no backtest evidence yet that
multiplicity should move next-season projection, projection independence is a
design value, and recording into `factors` gets the signal into daily
projection snapshots for a future answer. No multiplier; no
`adjustmentSummary`; no clamp interaction.

Definition — position-aware (more stable than "max category"):

| `player.position` | Primary category | Secondary category |
|---|---|---|
| QB | `pass` | `rush` |
| RB | `rush` | `rec` |
| WR | `rec` | `rush` |
| TE | `rec` | `rush` |

```
positionMultiplicityRatio = secondaryPts / (primaryPts + secondaryPts)
```

Range `[0, 1]`. Computed from **the most recent qualifying season** only
(`careerStats[lastQ.season][playerId].stats`, the `lastSeasonRaw` variable
already in scope at line 261 of `seasonProjection.js`). The qualifying gate
(`gamesPlayed ≥ 8`) is the sample-size guard — no additional threshold is
needed. Rookie path: `null`.

Position-aware vs. max-category: a young CMC (RB) with massive receiving has
a high ratio under the position-aware definition because primary is `rush`,
secondary is `rec`. A max-category definition would label him "rec-primary"
and report a low ratio, which is misleading — he's playing as an RB, doubling
up on receiving production. Position-aware is the signal we want.

### Decision 3 — Height / weight: **skip**

Static facts already on `playerMap[id].height` / `weight`. They do not derive
from anything and have no backtest evidence supporting a multiplier. Recording
them into `factors` adds bloat for marginal value (the same fields are
present in projection snapshots via `playerMap` reads if a future backtest
wants them, without duplicating into per-player projection objects). Defer
entirely. Trivial to add later as `playerHeight` / `playerWeight` capture-only
keys if desired.

---

## Files to create

| Path | Purpose |
|---|---|
| _(none)_ | The new category-bucket helper goes into existing `fantasyPoints.js` (its natural home). |

## Files to modify

| Path | Change |
|---|---|
| `src/utils/fantasyPoints.js` | Add `getCategoryPoints(stats, scoringSettings)` — buckets fantasy points by `pass` / `rush` / `rec` / `other` via stat-key prefix. New export; no change to `calculateFantasyPoints` or `getPointsBreakdown`. |
| `src/utils/seasonProjection.js` | Add `yearsExp` param to `rookieProjection`; compute `rookieAgeAtDraft` and use it as the `ageMult` lookup input (gated); add `rookieAgeAtDraft` to rookie `factors`. In the veteran path, compute position-multiplicity ratio from `lastSeasonRaw.stats` + `scoringSettings`; add 4 `factors` keys. Rookie path also gets the 4 multiplicity keys as `null` sentinels (consistency). |
| `README.md` | See "README updates" section. |

**No App.jsx change.** All inputs (`player.age`, `player.years_exp`,
`careerStats[lastQ.season][playerId].stats`, `scoringSettings`) are already in
scope at the modified call sites. **No new dependencies.**

---

## Helper spec — `getCategoryPoints` in `fantasyPoints.js`

```js
/**
 * Bucket fantasy points by stat category (pass / rush / rec / other).
 *
 * Categorisation is by stat-key prefix:
 *   - keys starting with `pass_`           → 'pass'
 *   - keys starting with `rush_`           → 'rush'
 *   - the bare key `rec` or starting `rec_` → 'rec'
 *   - everything else                       → 'other'
 *
 * @param {Object} stats            Map of stat_key → value
 * @param {Object} scoringSettings  Map of stat_key → points multiplier
 * @returns {{ pass: number, rush: number, rec: number, other: number }}
 *          Each bucket rounded to 2 dp. All zeros for null / missing inputs.
 */
export function getCategoryPoints(stats, scoringSettings)
```

**Algorithm** — same dot-product loop as `calculateFantasyPoints`, but each
contribution is added into one of four buckets keyed by the categoriser. Skip
`stats == null` / `scoringSettings == null` (return all zeros). Skip
contributions with `multiplier == null` or `statValue == null`. Round each
bucket to 2 dp at the end.

Categoriser is a tiny private function `categorizeKey(key)`:

```js
if (key.startsWith('pass_')) return 'pass'
if (key.startsWith('rush_')) return 'rush'
if (key === 'rec' || key.startsWith('rec_')) return 'rec'
return 'other'
```

No exports beyond `getCategoryPoints`. Pure — no side effects, no IO.

---

## Integration — `seasonProjection.js`

### A. Rookie path — `rookieProjection` function

**Signature change** (add `yearsExp` as a new parameter, placed right after
`playerId` to read naturally):

```js
function rookieProjection(player, playerId, yearsExp, ktcMap, playersMap, collegeStats, positionPeakPPG)
```

**Call site** (~line 168 of current `seasonProjection.js`):

```js
return rookieProjection(player, playerId, yearsExp, ktcMap, playersMap, collegeStats, positionPeakPPG)
```

(`yearsExp` is already in scope at that line — `const yearsExp = player.years_exp ?? null`.)

**Inside `rookieProjection`**, replace the current ageMult block:

```js
// BEFORE (lines 27–35):
const age      = player.age ?? 23

let ageMult
if      (age <= 21) ageMult = 1.15
else if (age === 22) ageMult = 1.05
else if (age === 23) ageMult = 0.95
else                 ageMult = 0.82
```

with:

```js
const age = player.age ?? 23

// Draft-age input correction (Projection C3).
// Only meaningful for actual rookies (years_exp ≤ 1); for older rookie-path
// hits (e.g. year-4 player with no qualifying seasons) current age is correct.
let rookieAgeAtDraft = null
if (yearsExp != null && yearsExp <= 1) {
  const candidate = age - yearsExp
  if (candidate >= 18 && candidate <= 28) rookieAgeAtDraft = candidate
}
const ageForLookup = rookieAgeAtDraft ?? age

let ageMult
if      (ageForLookup <= 21) ageMult = 1.15
else if (ageForLookup === 22) ageMult = 1.05
else if (ageForLookup === 23) ageMult = 0.95
else                          ageMult = 0.82
```

**Lookup table unchanged.** Bucket boundaries unchanged. Only the input expression
changes.

**Add to the rookie `factors` object:** `rookieAgeAtDraft` (number or `null`).
Also include the four position-multiplicity null sentinels (Section B).
No new `adjustmentSummary` line — this is an input correction, not a notable
adjustment.

### B. Veteran path — position multiplicity

Add a small block at the **top of `seasonProjection.js`** (constants):

```js
const POS_PRIMARY   = { QB: 'pass', RB: 'rush', WR: 'rec', TE: 'rec' }
const POS_SECONDARY = { QB: 'rush', RB: 'rec',  WR: 'rush', TE: 'rush' }
```

Add the import:

```js
import { getCategoryPoints } from './fantasyPoints'
```

In the veteran path, **after `lastSeasonRaw` is resolved** (~line 261, just
after the TD-reliance block that already reads `lastSeasonRaw`), insert:

```js
// ── Position multiplicity (capture-only, C3) ────────────────────────────
const primaryCategory   = POS_PRIMARY[position]   ?? null
const secondaryCategory = POS_SECONDARY[position] ?? null
let positionMultiplicityRatio = null
let primaryCategoryPoints   = null
let secondaryCategoryPoints = null
if (primaryCategory && secondaryCategory && lastSeasonRaw.stats && scoringSettings) {
  const cats = getCategoryPoints(lastSeasonRaw.stats, scoringSettings)
  primaryCategoryPoints   = Math.round(cats[primaryCategory]   * 10) / 10
  secondaryCategoryPoints = Math.round(cats[secondaryCategory] * 10) / 10
  const denom = primaryCategoryPoints + secondaryCategoryPoints
  if (denom > 0) {
    positionMultiplicityRatio = Math.round((secondaryCategoryPoints / denom) * 1000) / 1000
  }
}
```

Add to the veteran `factors` object (alongside existing keys; placement doesn't
matter for behavior — place after `efficiencyMetrics` for thematic grouping):

```js
positionMultiplicityRatio,
primaryCategory,
primaryCategoryPoints,
secondaryCategoryPoints,
```

**No** `combinedNewFactor` change. **No** clamp change. **No**
`adjustmentSummary` line. The signal is diagnostic only.

### C. Rookie `factors` — multiplicity sentinels

Add to the rookie `factors` block for symmetry across paths:

```js
positionMultiplicityRatio: null,
primaryCategory:           null,
primaryCategoryPoints:     null,
secondaryCategoryPoints:   null,
```

Both paths now expose the same 4 multiplicity keys (vet computes, rookie always
null). This keeps the `factors` shape consistent across the rookie/vet split,
matching the C2 precedent for `ktcHist*` keys.

---

## `factors` keys added by C3

### Rookie path (1 new active key + 4 sentinel keys)

| Key | Type | Source / notes |
|---|---|---|
| `rookieAgeAtDraft` | number\|null | `age − years_exp` when `years_exp ≤ 1` and the value is in `[18, 28]`; otherwise `null`. The same value drives the `ageMult` lookup. |
| `positionMultiplicityRatio` | `null` | Always `null` in the rookie path. |
| `primaryCategory` | `null` | Always `null` in the rookie path. |
| `primaryCategoryPoints` | `null` | Always `null` in the rookie path. |
| `secondaryCategoryPoints` | `null` | Always `null` in the rookie path. |

### Veteran path (4 new keys)

| Key | Type | Notes |
|---|---|---|
| `positionMultiplicityRatio` | number\|null | `secondary / (primary + secondary)`, 3 dp. `null` when position is non-skill, stats absent, or primary+secondary = 0. Range `[0, 1]`. |
| `primaryCategory` | string\|null | One of `'pass'` / `'rush'` / `'rec'`; from `POS_PRIMARY[position]`. |
| `primaryCategoryPoints` | number\|null | Primary-category fantasy points in the most recent qualifying season, 1 dp. |
| `secondaryCategoryPoints` | number\|null | Secondary-category fantasy points in the most recent qualifying season, 1 dp. |

Total new `factors` keys added by C3: **5** (1 rookie-only active + 4 shared
where rookies carry sentinels). The veteran `factors` count goes from
~39 + 13 (C2) = 52 to ~56. The rookie `factors` count grows by 5 as well
(13 KTC + 5 C3).

---

## Pipeline location summary

| Signal | Location | Pipeline effect |
|---|---|---|
| Rookie age at draft | Inside `rookieProjection`'s existing `ageMult` lookup | **Active** — changes the lookup input; `ageMult` value (and therefore `projectedPPG`) shifts for year-2 rookies whose draft age sits in a different bucket than their current age. Lookup table and buckets unchanged. |
| Position multiplicity | After `lastSeasonRaw` is computed in the veteran path | **None** — capture-only diagnostic into `factors`. No clamp interaction. |

---

## Cross-batch interactions

### C3 multiplicity vs. C1 efficiency (known limitation)

C1's `efficiencyFactor` deferred multi-category players: per-opportunity metrics
are computed against the player's *primary* position only. For a CMC, C1
calculates efficiency from rushing per-touch metrics and ignores his receiving
production entirely. C3's `positionMultiplicityRatio` **records** the secondary
contribution but **does not fix** C1's behavior. The proper fix — recomputing
efficiency across both categories with appropriate weighting — would require
revisiting `efficiencyMetrics.js` (in C3's no-touch list) and is out of scope.
The captured ratio is sufficient to flag the cohort in a future backtest;
quantifying the C1 bias on multi-position players is a follow-up.

### C3 draft age vs. B1b college breakout age (independent, multiplicative)

Both fire on rookies. They are **not redundant**:

- `breakoutAge` (B1b) — the college age at which the player crossed the
  dominator threshold. Captures *timing of production in college*.
- `rookieAgeAtDraft` (C3) — age when the player entered the NFL. Captures
  *NFL entry timing*.

They stack multiplicatively in the rookie path: `ageMult × … × collegeContribution`
(which contains `breakoutAgeFactor`). A 21-year-old declared-early breakout
gets both the youth NFL discount (`ageMult 1.15`) and the early-breakout boost
(`breakoutAgeFactor 1.05`). This is the intended composition — both signals
genuinely apply to early-declaring producers. No change to the rookie clamp
(`collegeContribution` still clamped to `[0.75, 1.25]`); `ageMult` remains
unclamped and continues to be a direct input to `projectedPPG`.

### C3 vs. C2 KTC historical signals

Independent. C2's `ktcHist*` keys are capture-only and don't interact with the
veteran `combinedNewFactor` stack; C3's multiplicity is also capture-only.
Neither widens any clamp.

---

## Edge cases

| Case | Handling |
|---|---|
| `years_exp == null` (Sleeper field absent) | `rookieAgeAtDraft = null`; ageMult uses current age. Byte-identical to pre-C3. |
| `years_exp > 1` (rookie path via "no qualifying seasons" route, e.g. year-4 prospect) | `rookieAgeAtDraft = null`; ageMult uses current age. Intentional — see Decision 1. |
| `years_exp = 0` (first-year rookie) | `rookieAgeAtDraft = age`. Byte-identical ageMult value. |
| `years_exp = 1` (second-year "rookie") | `rookieAgeAtDraft = age − 1`. The typical and intended C3 case. |
| Implausible draft age (`< 18` or `> 28`) — corrupt `years_exp` | Fall back to current age. `rookieAgeAtDraft = null`. |
| Veteran path, `lastSeasonRaw.stats` missing | Multiplicity keys all `null`. (Shouldn't happen — qualifying gate requires `gp ≥ 8` — but defensive.) |
| Veteran path, `scoringSettings` missing | Multiplicity keys all `null`. (App.jsx always passes scoring settings; defensive.) |
| Non-skill position reaches multiplicity block | Function already returns `null` for non-SKILL positions before this point; the `primaryCategory` lookup returns `undefined` → all `null`. Defensive only. |
| QB with zero rushing (Tom Brady type) | `secondaryCategoryPoints ≈ 0`, ratio ≈ 0. Correctly reports "not multi-position." |
| Lamar Jackson / Konami-code QB | `rush` contribution is large; ratio ≈ 0.3–0.4. Correctly flags multiplicity. |
| CMC peak season | `rec` contribution is large; ratio ≈ 0.4. Correctly flags multiplicity. |
| Taysom Hill (listed TE) | Primary `rec` near zero, secondary `rush` large → ratio approaches 1.0. Correctly extreme. Acceptable — signal is honest. |
| `primary + secondary = 0` (degenerate qualifying season) | Ratio `null`. (`gp ≥ 8` makes this essentially impossible, but the guard is cheap.) |

---

## Risks

- **`years_exp` reliability** — handled by the `[18, 28]` plausibility window
  and the `years_exp ≤ 1` gate. The most likely failure mode is a returning
  veteran whose `years_exp` was reset by Sleeper; gating to `≤ 1` means such
  players take the year-4+-rookie-path route anyway and the guard does the
  right thing.
- **Multiplicity from one season is noisy** — accepted. The qualifying gate
  (`gp ≥ 8`) is the sample-size guard; a weighted-across-recent-seasons version
  is out of scope for C3 (deferred until backtest data shows it matters).
- **C1 efficiency bias on multi-position players** — known limitation,
  documented above. C3 captures the signal but doesn't fix the bias.
- **Capture-only correctness** — the C3 veteran-path multiplicity computation
  must not leak into any multiplier or summary. Acceptance criterion below
  requires `projectedPPG` byte-identity vs. pre-C3 for veterans.
- **Rookie ageMult shifts for year-2 rookies** — intentional behavior change,
  but it *will* move `projectedPPG` for that population. Acceptance criterion
  below distinguishes: byte-identical for year-1 rookies, intentionally shifted
  for year-2 rookies, byte-identical for year-3+ rookie-path hits.

---

## Implementation step sequence

1. **`src/utils/fantasyPoints.js`** — add the `getCategoryPoints` export.
   Pure, ~20 lines. Don't touch existing functions.
2. **`src/utils/seasonProjection.js`** — add the `POS_PRIMARY` / `POS_SECONDARY`
   constants, the `getCategoryPoints` import, the `yearsExp` parameter on
   `rookieProjection`, the draft-age logic + `rookieAgeAtDraft` factor key,
   the veteran-path multiplicity block, and the multiplicity null sentinels in
   the rookie factors. Update the one call site of `rookieProjection`.
3. **`npm run build`** — clean build.
4. **README updates** — see below.

---

## Acceptance criteria

- [ ] `npm run build` passes with no new warnings.
- [ ] **Rookie path year-1 (`years_exp = 0`)**: `projectedPPG` byte-identical
      to pre-C3 for every such player. `rookieAgeAtDraft` equals `age`.
- [ ] **Rookie path year-2 (`years_exp = 1`)**: `projectedPPG` may differ from
      pre-C3 (this is the C3 fix). `rookieAgeAtDraft = age − 1` when in
      `[18, 28]`. Spot-check: a year-2 23-year-old gets `ageMult = 1.05` (was
      `0.95`).
- [ ] **Rookie path year-3+** (`years_exp > 1`, hit via no qualifying seasons):
      `projectedPPG` byte-identical. `rookieAgeAtDraft = null`.
- [ ] **Veteran path**: `projectedPPG`, `projectedTotalPts`, `confidence`, and
      `nextSeasonRank` are byte-identical to pre-C3 for every veteran.
- [ ] Every projection's `factors` object contains all 4 new multiplicity keys
      (`positionMultiplicityRatio`, `primaryCategory`, `primaryCategoryPoints`,
      `secondaryCategoryPoints`) on both paths.
- [ ] Every projection's `factors` object contains `rookieAgeAtDraft` on the
      rookie path. (Veteran path does not need this key — it's path-specific.)
- [ ] No new `adjustmentSummary` strings introduced.
- [ ] `combinedNewFactor`, every existing clamp, and every B1a/B1b/B2/B3/C1/C2
      `factors` key are unchanged.
- [ ] Lamar Jackson / Josh Allen verification log (already in `seasonProjections`
      useMemo) shows `positionMultiplicityRatio > 0` for Lamar and a non-null
      value for Allen.
- [ ] CMC verification (add to the existing verification logs if convenient,
      otherwise spot-check via the Profile panel after the build): high
      `positionMultiplicityRatio` (≈ 0.3–0.5).
- [ ] No edits to `seasonProjection.js` / `fantasyPoints.js` / `README.md`
      other consumers. No App.jsx change.

## Out of scope

- Wiring `positionMultiplicityRatio` into any multiplier (deferred — capture-only
  C3 default; revisit when backtest data accumulates).
- Fixing the C1 efficiency bias on multi-position players (would require
  changes to `efficiencyMetrics.js`, in the no-touch list).
- Weighting multiplicity across multiple seasons (single most-recent qualifying
  season only).
- Height / weight factors (Decision 3 — defer).
- Any UI surface for the new factors (Profile panel chip, Explorer column).
- Changes to `combinedNewFactor`, clamps, `adjustmentSummary`, or rookie KTC /
  college pipelines beyond the `ageMult` input swap.
- Touching any file in the constraint no-touch list.

---

## README updates

Two small edits in `sleeper-dashboard/README.md`.

### 1. Rookie path — `ageMult` description (~line 695)

**Before:**
```
**Age multipliers:** ≤21 → ×1.15, 22 → ×1.05, 23 → ×0.95, 24+ → ×0.82
```

**After:**
```
**Age multipliers:** keyed on **draft age** (`currentAge − years_exp`) when
`years_exp ≤ 1` and the value is in `[18, 28]`; otherwise current age. The
lookup is unchanged: ≤21 → ×1.15, 22 → ×1.05, 23 → ×0.95, 24+ → ×0.82.
`rookieAgeAtDraft` is recorded in `factors` (null when the draft-age guard
doesn't fire — e.g. year-3+ rookie-path hits, or implausible computed age).
```

### 2. Historical KTC factors subsection (added in C2) — extend with multiplicity

Locate the "Historical KTC factors (capture-only)" subsection introduced by C2
(under "Next-season projections" → "Rookie path"). **Append** a second short
subsection immediately after it:

```
### Position multiplicity factors (capture-only)

The projection records the share of fantasy points coming from a player's
secondary stat category, computed from the most recent qualifying season. This
is **diagnostic only — it does not move `projectedPPG`** and adds no
`adjustmentSummary` lines. Veteran path computes; rookie path records null
sentinels.

| `factors` key | Meaning |
|---|---|
| `positionMultiplicityRatio` | `secondaryPts / (primaryPts + secondaryPts)`; `[0, 1]`, null when stats absent |
| `primaryCategory` | `'pass'` (QB) / `'rush'` (RB) / `'rec'` (WR, TE) |
| `primaryCategoryPoints` | Primary-category fantasy points in the most recent qualifying season |
| `secondaryCategoryPoints` | Secondary-category fantasy points in the most recent qualifying season |

Secondary category by primary: QB→rush, RB→rec, WR→rush, TE→rush. Bucketing
uses stat-key prefix (`pass_*` / `rush_*` / `rec` / `rec_*`) via
`getCategoryPoints` in `fantasyPoints.js`.
```

No further README edits. C3 introduces no new pipeline step, no new module,
and no new state — the existing "Next-season projections" section already
documents the rookie path's ageMult lookup, and the multiplicity addition fits
under the capture-only-factors convention C2 established.

---

## Open questions

**Q1 — Multiplicity capture-only vs. active.** Plan commits to capture-only
(consistent with C2 and the project's stated projection-independence value).
If the user prefers the multiplicity signal to actively move projection — e.g.
a small bounded `multiplicityFactor = clamp(1 + (ratio − cohortMedian) × k,
0.97, 1.03)` — that is a separate future batch. Confirm capture-only.

**Q2 — Draft-age gate `years_exp ≤ 1` vs. broader.** Plan commits to gating
the draft-age substitution to actual rookies (`years_exp ≤ 1`). Year-3+
rookie-path hits keep current-age behavior. If the user wants draft age applied
to all rookie-path hits (including year-4 failed-to-launch players), the
behavior would shift their ageMult upward — likely overestimating that
population. Confirm the gate.

**Q3 — Helper placement.** Plan adds `getCategoryPoints` to `fantasyPoints.js`
(its natural home, alongside `calculateFantasyPoints` and `getPointsBreakdown`).
Alternative: a new `src/utils/statCategories.js`. The chosen location keeps the
file count flat. Confirm acceptable.
