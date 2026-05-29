# Projection B3 — Career-comp ensemble integration

## Goal

Wire the career-comparables signal (`findCareerComps` / `compsProjectedPPG`,
already computed in `careerComps.js` and currently used only for Player Profile
display) into the **veteran** path of `computeNextSeasonProjection`. It is a
second projection model — a nearest-neighbour estimate from same-position
players with similar career arcs — and is combined with the 7-step pipeline
output by **confidence-weighted ensemble averaging**. The rookie path is out of
scope (rookies have no comps).

This batch follows the precedents from B1a/B1b/B2 (all shipped).

---

## Architectural note

B3 introduces the **first non-multiplier signal** in the projection. Every prior
signal was a factor multiplied into `rawPPG`; the comp signal is a *parallel
model* ensembled with the pipeline's final output. The integration logic lives
in its own module (`compsIntegration.js`) so a future thread that adds more
model-based estimates (e.g. position-specific models) has a clean home for the
ensembling and does not have to touch the pipeline steps.

---

## Files to create

| Path | Purpose |
|------|---------|
| `src/utils/compsIntegration.js` | `computeCompBlend(...)` — computes the comp-confidence score, the blend weight, and the ensembled PPG. Imports `findCareerComps` / `compsProjectedPPG` from `careerComps.js` (read-only consumption). |

## Files to modify

| Path | What changes |
|------|--------------|
| `src/utils/seasonProjection.js` | `computeNextSeasonProjection` veteran path only. New import. The combine tail is restructured: the pipeline result is renamed `pipelinePPG`, a new **Step 8** blends it with the comp estimate, and `projectedPPG` / `projectedTotalPts` are derived from the blend. `factors` + `adjustmentSummary` extended. `rookieProjection` untouched. |
| `README.md` | Several sections — exact before/after in the **README updates** section below. |

**No `App.jsx` change.** Unlike B1a's QB1 quality (which needed eager
pre-computation because `qbQualityByTeam` depends on dynasty scores), the comp
signal needs only `playerId`, `playersMap`, `careerStats`, `positionPeakPPG` —
**all already parameters of `computeNextSeasonProjection`**. The integration is
fully confined to `seasonProjection.js` + the new helper. See the Performance
section.

---

## Pre-read notes for the implementer

1. **Step numbering.** The new block is `── Step 8: Career-comp ensemble blend ──`
   in code (the code's `── Step N ──` comments currently stop at `── Step 7b ──`;
   the combine is unlabelled — `── Step 8 ──` is free). The README table uses its
   own numbering and already has a row "8" (Depth chart); the README row for this
   batch is numbered **9**. README edits are spelled out separately.
2. **Do not modify** `careerComps.js`, `dynastyScore.js`, `collegeMetrics.js`,
   `teamContext.js`, `momentum.js`, `projectionSignals.js`,
   `regressionSignals.js`, dynasty scoring, role ranks, or any other consumer.
   `compsIntegration.js` *imports from* `careerComps.js` — that is consumption,
   not modification, and is allowed.
3. **The Player Profile comps display is unaffected.** It calls `findCareerComps`
   independently via `usePlayerProfile`; B3 calls the same cached function. Both
   share the module-level `compsCache` — order-independent, no conflict.
4. B1a/B1b/B2 `factors` keys are neither renamed nor removed. B3 only adds.

---

## Decision — integration pattern: Option 1 (ensemble blend)

**Chosen: Option 1 — confidence-weighted ensemble blend.** The pipeline produces
`pipelinePPG`; the comps produce `compPPG`; the final projection is a weighted
average `α·pipelinePPG + (1−α)·compPPG`, with the comp weight `(1−α)` scaled by
how trustworthy the comps are and how data-poor the pipeline is.

### Why Option 1

A weighted average has one structural property that decides this batch:

> **`blendedPPG` is always bounded by `[min(pipelinePPG, compPPG),
> max(pipelinePPG, compPPG)]`.**

The blend can only move the projection *toward* the comp estimate, never past
it, and never past the pipeline estimate. This makes the integration
**double-counting-safe by construction** — no matter how much the comp signal
re-embodies trajectory / momentum / breakout / regression (it does — see
Cross-batch analysis), the ensembled result cannot over-project. This is the
single most important property in the batch and the reason Option 1 beats
Option 5.

### Rejection notes

- **Option 2 (replace base PPG).** Wrong conceptually. `compPPG` is a *finished
  forecast of next season* — it already embodies age, regression, role change
  (it is "what similar players actually did next"). Feeding it in as Step 1
  base PPG would run a baked forecast back through Steps 3–7 (age curve, share
  trend, regression, …), double-applying every modifier. Rejected.
- **Option 3 (sanity-check pull).** A bounded "only deviate on strong
  disagreement" multiplier. Option 1 with a confidence-scaled α already
  *subsumes* this — when comps barely disagree the blend barely moves; when
  they strongly disagree it moves more. Option 3 is a special case of Option 1
  with information thrown away. Rejected as redundant.
- **Option 4 (confidence-routed).** Hard on/off at a season-count cutoff
  creates a discontinuity (a 4-season player gets full comps, a 5-season player
  gets none). Option 1's α formula folds pipeline confidence in *continuously*
  (`pipelineUncertainty`), achieving Option 4's intent without the cliff.
  Rejected as a degenerate, discontinuous Option 1.
- **Option 5 (flat ratio multiplier).** `clamp(compPPG / pipelinePPG, lo, hi)`
  as a multiplier. A multiplier **stacks** — it does not have the
  bounded-by-inputs safety of an average, so it reintroduces exactly the
  double-counting risk Option 1 avoids. It also loses model transparency (you
  cannot recover the two estimates from a single ratio). Rejected.

---

## Per-signal spec (the 10 items)

### 1. Integration pattern

Option 1 — confidence-weighted ensemble blend. See above.

### 2. Numerical effect — α, weight, blend formula

```
compBlendWeight  w  = MAX_COMP_WEIGHT × compConfidence × pipelineUncertainty
α                   = 1 − w
blendedPPG          = clamp(α × pipelinePPG + (1 − α) × compPPG, 0, 40)
```

- `MAX_COMP_WEIGHT = 0.35` — the comp model is capped at 35% of the ensemble;
  the pipeline always retains ≥ 65%. (Chosen over the brief's suggested 0.40
  for extra double-counting headroom — see Open Question Q1.)
- `w ∈ [0, 0.35]`, so `α ∈ [0.65, 1.0]`. `w = 0` (α = 1.0) → pure pipeline.

**`compConfidence ∈ [0, 1]`** — how trustworthy the comp estimate is. A weighted
average of three sub-factors (a weighted average, not a raw product: a triple
product of sub-unity factors collapses far too aggressively and would make
comps almost never matter):

```
compConfidence = 0.45 × countFactor + 0.40 × simFactor + 0.15 × seasonsFactor
```

| Sub-factor | Formula | Range |
|---|---|---|
| `countFactor` | `min(nComps / 3, 1)` | {0.33, 0.67, 1.0} for {1, 2, 3} comps |
| `simFactor` | `clamp((avgSim − 60) / 25, 0, 1)` | avgSim 60 → 0, 85+ → 1.0 |
| `seasonsFactor` | `clamp(subseasonCount / 4, 0.5, 1)` | 2 → 0.5, 4+ → 1.0 |

- `nComps` — number of comps returned by `findCareerComps` (≤ 3).
- `avgSim` — mean of the comps' `similarity` field (already a 0–100 integer,
  ≥ 60 by the inclusion threshold inside `findCareerComps`).
- `subseasonCount` — total subsequent-season data points behind `compPPG`:
  `Σ over comps of min(theirSubsequentSeasons.length, 2)` (the `slice(0,2)`
  matches what `compsProjectedPPG` actually averages).

**`pipelineUncertainty`** — how much room the pipeline leaves for a second model:

| pipeline `confidence` | `pipelineUncertainty` |
|---|---|
| `'low'` (1–2 qualifying seasons) | 1.00 |
| `'medium'` (3–4) | 0.60 |
| `'high'` (5+) | 0.25 |

High-data vets still get a small (≤ 0.0875) comp weight rather than a hard
zero — no Option-4 discontinuity.

### 3. Eligibility rule

The comp blend is applied (`w > 0`) only when **all** hold:

- `compPPG != null` — `compsProjectedPPG` produced an estimate;
- `nComps ≥ 1` — at least one comp cleared the 0.60 similarity threshold;
- `subseasonCount ≥ 2` — at least two subsequent-season data points stand
  behind the estimate (one comp with 2 post-overlap seasons, or two comps with
  1 each).

Minimum comp count is **1**, not 2 — `countFactor` already heavily discounts a
lone comp (0.33), and the `subseasonCount ≥ 2` gate guarantees even a single
comp brings two data points. Requiring 2 comps would zero out a large,
needlessly-excluded slice of the player pool (coverage is genuinely sparse for
unusual archetypes).

**Ineligible → `w = 0`, `α = 1.0`, `blendedPPG = pipelinePPG`** (pure pipeline,
byte-identical to today). `compPPG` recorded as its computed value or `null`;
`compConfidence` and `compBlendWeight` recorded as `0`.

### 4. Performance pattern — lazy (no App.jsx change)

`findCareerComps` is called **lazily, inside `computeNextSeasonProjection`**
(via `computeCompBlend`). It needs `playerId, playersMap, careerStats,
positionPeakPPG` — every one already a parameter of
`computeNextSeasonProjection`. No new parameter, **no App.jsx change**.

First-run cost: the projection runs over ~350–450 veteran players;
`findCareerComps` for each does an O(N) sweep over ~100–150 same-position
candidates, building a short (≤ ~10-element) arc vector per candidate. That is
on the order of a few hundred thousand cheap arithmetic operations on the first
pipeline run — well under ~100 ms. `careerComps.js`'s module-level `compsCache`
(keyed by `playerId`) makes every subsequent pipeline re-run (each dependency
change) **free**. Eager pre-computation in App.jsx would move this cost to a
different memo without reducing it, at the price of an App.jsx change and a new
parameter — not worth it here. Beneficial side effect: the projection pre-warms
`compsCache`, so opening a Player Profile afterward is instant.

### 5. Cross-batch interaction analysis

The comp signal, being built from whole-career arc similarity, re-embodies
several existing signals. The blend's bounded-average property (see the Option 1
rationale) means **none of these can compound into over-projection** — but each
is walked through explicitly:

- **Comps vs trajectory (B2).** A rising-arc player matches other rising-arc
  players; `trajectoryFactor` also boosts a rising arc. Overlap is real — but
  `compPPG` reflects what rising players *empirically did next* (some kept
  rising, some plateaued, some regressed), which is a more honest,
  regression-aware version of the naïve slope extrapolation. The blend averages
  the two; it cannot exceed either.
- **Comps vs momentum (B1a).** Same — momentum is recent-window direction;
  comps embody it empirically. Bounded by the average.
- **Comps vs isBreakout / isBounceBack (B1b).** A young breakout's comps are
  other young breakouts; their subsequent seasons are the empirical record of
  how breakouts actually aged. If anything the comp estimate *tempers* the flat
  +8% breakout bump toward what really happened.
- **Comps vs regression (Step 5 + B2 consistency).** The most acute overlap:
  comps **are** empirical regression — if similar players regressed after the
  comparable season, `compPPG` is already low. But note *what* is blended: the
  pipeline applies its regression *inside* `pipelinePPG`, and the blend averages
  that already-regressed number with the empirically-regressed `compPPG`. Two
  estimates that agree on direction, averaged, produce a confident estimate
  between them — that is not harmful double-counting (which would require
  regressing, then pulling toward something *more* regressed, then regressing
  again; the pipeline never re-applies its Step 5 after the blend).

**Resolution: keep every signal active.** The blend is a weighted average, so
the worst case is a confident estimate sitting between two correlated models —
never an extrapolation beyond either. See the worked examples.

### 6. Pipeline location

A new **Step 8**, *after* the combine and after the `confidence` is known. The
blend operates on the pipeline's final, clamped `pipelinePPG` — it is a
post-pipeline model ensemble, not a factor, so it sits entirely outside the
`combinedNewFactor` clamp and outside the per-step multiplier stacking.

### 7. `projectedGames` — PPG-only blend

**PPG-only.** This is not merely the recommended default — it is **forced by the
data shape**: a comp's `theirSubsequentSeasons` are *normalised-PPG* values
(from the career arc vector); they carry **no games-played information** at all.
Blending games would require games data the comp structures do not contain, and
adding it would mean modifying `careerComps.js` (out of scope). `projectedGames`
from Step 6 stands unchanged; `projectedTotalPts` is recomputed from the blended
PPG × the Step 6 games.

### 8. Fallback behaviour

No eligible comps (sparse coverage, unusual archetype, long-career vet with no
extending comps, < 2 qualifying seasons) → `w = 0`, `α = 1.0`, `blendedPPG =
pipelinePPG`. The projection is byte-identical to the pre-B3 pipeline for that
player. The model degrades gracefully player-by-player; an uncovered player is
never worse off than today.

### 9. `factors` keys (6 new)

| Key | Type | Value |
|---|---|---|
| `pipelinePPG` | number (1 dp) | the pre-blend pipeline projection — lets a snapshot backtest recover the pipeline-only estimate |
| `compPPG` | number (1 dp) \| null | the career-comp nearest-neighbour estimate; `null` when none |
| `compCount` | integer | number of comps returned (0 if none) — recorded even when ineligible |
| `compAvgSimilarity` | integer (0–100) \| null | mean comp similarity; `null` when no comps |
| `compConfidence` | number (3 dp) | the [0, 1] comp-confidence score; `0` when ineligible |
| `compBlendWeight` | number (3 dp) | the applied comp weight `1 − α ∈ [0, 0.35]`; `0` when no blend |

The returned top-level `projectedPPG` is the **blended** value;
`factors.pipelinePPG` preserves the pre-blend number for attribution.

### 10. `adjustmentSummary` lines

Fire on the *realised* effect of the blend (gated on the blend actually being
applied), not on raw divergence — a large `compPPG` gap behind a tiny weight is
not a meaningful event:

```js
if (compBlendWeight > 0) {
  const blendShift = (projectedPPG - pipelinePPG) / Math.max(pipelinePPG, 1)
  if (blendShift >  0.03) adjustmentSummary.push('Career comps lift projection ↑')
  if (blendShift < -0.03) adjustmentSummary.push('Career comps temper projection ↓')
}
```

---

## New module: `src/utils/compsIntegration.js`

```js
/**
 * src/utils/compsIntegration.js — Career-comp ensemble integration.
 *
 * Combines the season-projection pipeline output with the career-comparables
 * nearest-neighbour estimate (compsProjectedPPG) via a confidence-weighted
 * blend. See .claude/tasks/projection-b3-career-comp-integration.md.
 */
import { findCareerComps, compsProjectedPPG } from './careerComps'

const MAX_COMP_WEIGHT = 0.35

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

/**
 * @param {string} playerId
 * @param {Object} playersMap
 * @param {Object} careerStats
 * @param {Object} positionPeakPPG
 * @param {string} position
 * @param {number} pipelinePPG        the pipeline's final clamped projectedPPG
 * @param {string} pipelineConfidence 'low' | 'medium' | 'high'
 * @returns {{
 *   blendedPPG: number, compPPG: number|null, compCount: number,
 *   compAvgSimilarity: number|null, compConfidence: number, compBlendWeight: number
 * }}
 */
export function computeCompBlend(
  playerId, playersMap, careerStats, positionPeakPPG, position,
  pipelinePPG, pipelineConfidence
) {
  const comps   = findCareerComps(playerId, playersMap, careerStats, positionPeakPPG)
  const nComps  = comps.length
  const compPPG = compsProjectedPPG(comps, positionPeakPPG, position)
  const avgSim  = nComps > 0
    ? Math.round(comps.reduce((s, c) => s + c.similarity, 0) / nComps)
    : null

  let subseasonCount = 0
  for (const c of comps) {
    subseasonCount += Math.min(c.theirSubsequentSeasons?.length ?? 0, 2)
  }

  const eligible = compPPG != null && nComps >= 1 && subseasonCount >= 2
  if (!eligible) {
    return {
      blendedPPG: pipelinePPG, compPPG, compCount: nComps,
      compAvgSimilarity: avgSim, compConfidence: 0, compBlendWeight: 0,
    }
  }

  const countFactor   = Math.min(nComps / 3, 1)
  const simFactor     = clamp((avgSim - 60) / 25, 0, 1)
  const seasonsFactor = clamp(subseasonCount / 4, 0.5, 1)
  const compConfidence = 0.45 * countFactor + 0.40 * simFactor + 0.15 * seasonsFactor

  const pipelineUncertainty = ({ low: 1.0, medium: 0.6, high: 0.25 })[pipelineConfidence] ?? 0.6
  const compBlendWeight = MAX_COMP_WEIGHT * compConfidence * pipelineUncertainty
  const alpha = 1 - compBlendWeight

  const blendedPPG = clamp(alpha * pipelinePPG + (1 - alpha) * compPPG, 0, 40)

  return {
    blendedPPG, compPPG, compCount: nComps,
    compAvgSimilarity: avgSim, compConfidence, compBlendWeight,
  }
}
```

Add to `seasonProjection.js` imports:

```js
import { computeCompBlend } from './compsIntegration'
```

---

## Code changes — `computeNextSeasonProjection` combine tail

Current tail (code ~339–356): `── Combine ──` computes `combinedNewFactor`,
`rawPPG`, `const projectedPPG = clamp(rawPPG, 0, 40)`,
`const projectedTotalPts = …`, then `const confidence = …`.

Restructure to:

```js
  // ── Combine ─────────────────────────────────────────────────────────────
  // (combinedNewFactor + rawPPG unchanged)
  const combinedNewFactor = clamp( … unchanged … )
  const rawPPG = basePPG * ageDelta * shareTrendMultiplier * regressionFactor
               * teamFactor * depthFactor * combinedNewFactor
  const pipelinePPG = clamp(rawPPG, 0, 40)        // was `projectedPPG`

  const confidence = qualifying.length >= 5 ? 'high'
                    : qualifying.length >= 3 ? 'medium'
                    : 'low'

  // ── Step 8: Career-comp ensemble blend ──────────────────────────────────
  // A second model: nearest-neighbour PPG from same-position players with
  // similar career arcs, blended with the pipeline output by a confidence-
  // weighted average. A weighted average is bounded by its two inputs, so the
  // blend cannot over-project. Lives outside the combinedNewFactor clamp.
  const {
    blendedPPG, compPPG, compCount, compAvgSimilarity, compConfidence, compBlendWeight,
  } = computeCompBlend(
    playerId, playersMap, careerStats, positionPeakPPG, position,
    pipelinePPG, confidence,
  )
  const projectedPPG = blendedPPG
  const projectedTotalPts = Math.round(projectedPPG * projectedGames * 10) / 10
```

Changes, precisely:
- Rename the `const projectedPPG = clamp(rawPPG, 0, 40)` result to `pipelinePPG`.
- **Move the `confidence` declaration up** to immediately after `pipelinePPG`
  (it only depends on `qualifying.length` — pure relocation, zero behaviour
  change — and Step 8 needs it).
- Add the Step 8 block.
- `projectedPPG` and `projectedTotalPts` are now derived from `blendedPPG`.
- The `adjustmentSummary` block and the `return` are unchanged in position; the
  `return` already references `projectedPPG` / `projectedTotalPts` / `confidence`
  by those names, so it picks up the blended values automatically.

### `factors` additions

Append to the veteran-path `factors` object (post-B2: 30 keys → post-B3: 36):

```js
pipelinePPG:       Math.round(pipelinePPG * 10) / 10,
compPPG,                                           // already 1-dp from compsProjectedPPG, or null
compCount,
compAvgSimilarity,
compConfidence:    Math.round(compConfidence * 1000) / 1000,
compBlendWeight:   Math.round(compBlendWeight * 1000) / 1000,
```

### `adjustmentSummary` additions

Append the two lines from item 10 to the existing `adjustmentSummary` block.

---

## Cross-batch interaction — worked examples

**Example 1 — over-hyped young breakout (double-count stress test).** A 23-yo
WR, 3 qualifying seasons, ascending. `combinedNewFactor` stacks momentum 1.04 ×
breakout 1.08 × trajectory 1.05 × qbQuality 1.02 ≈ 1.20 → `pipelinePPG ≈ 15.6`.
Comps: 3 other young ascending WRs, `avgSim` 74, `subseasonCount` 5.
`compConfidence = 0.45×1.0 + 0.40×0.56 + 0.15×1.0 = 0.824`; `confidence`
'medium' → `pipelineUncertainty` 0.6; `w = 0.35×0.824×0.6 = 0.173`; α = 0.827.
- Comps say *higher* (`compPPG` 16.5): `blendedPPG = 0.827×15.6 + 0.173×16.5 =
  15.76` → **+1.0%**. The already-stacked pipeline gets a *nudge*, not another
  +20%.
- Comps say *regression* (`compPPG` 13.5 — ascending young WRs often fade):
  `blendedPPG = 0.827×15.6 + 0.173×13.5 = 15.24` → **−2.3%**. The comps act as
  the empirical reality-check, pulling the hyped pipeline down.

**Example 2 — thin-data vet (where comps earn their weight).** 2 qualifying
seasons → `confidence` 'low' → `pipelineUncertainty` 1.0. `pipelinePPG` 11.0;
3 strong comps, `avgSim` 82, `subseasonCount` 6 → `compConfidence = 0.45 +
0.40×0.88 + 0.15 = 0.952`; `w = 0.35×0.952×1.0 = 0.333`; α = 0.667.
`compPPG` 13.0 → `blendedPPG = 0.667×11.0 + 0.333×13.0 = 11.67` → **+6.1%**. The
data-poor pipeline gets a meaningful comp-informed correction.

**Example 3 — no eligible comps.** `w = 0`, α = 1.0, `blendedPPG = pipelinePPG`
— byte-identical to the pre-B3 projection.

**Bound.** `blendedPPG` always lies in `[min(pipelinePPG, compPPG),
max(pipelinePPG, compPPG)]`. The maximum displacement is `w_max × |compPPG −
pipelinePPG| = 0.35 × |Δ|`, and `w` reaches 0.35 only for a low-confidence
pipeline with near-perfect comps — exactly the player for whom a large comp
correction is most warranted.

---

## Stacking analysis

- The comp blend operates on the **already-clamped** `pipelinePPG ∈ [0, 40]`
  and produces a convex combination with `compPPG` (realistically `≤ ~39` — the
  arc vector caps normalised PPG at 1.5 and `positionPeakPPG` is ~20–26). A
  convex combination of two values in `[0, 40]` is itself in `[0, 40]`; the
  helper re-applies `clamp(…, 0, 40)` defensively.
- **B3 adds zero width to the multiplier-stacking envelope.** The
  `combinedNewFactor` clamp `[0.78, 1.30]` and every per-step factor are
  entirely upstream of Step 8 and untouched. The comp blend is a post-pipeline
  ensemble, not a factor — it does not participate in multiplier stacking at
  all.
- The output bound `[0, 40]` is unchanged and still holds.

---

## Implementation order

Run `npm run build` after each numbered step.

1. **Create `src/utils/compsIntegration.js`.**
2. **Add the import** to `seasonProjection.js`.
3. **Restructure the combine tail** — rename `projectedPPG` → `pipelinePPG`,
   move `confidence` up, add the Step 8 block, derive `projectedPPG` /
   `projectedTotalPts` from `blendedPPG`.
4. **`factors`** — add the 6 new keys.
5. **`adjustmentSummary`** — add the 2 new lines.
6. **README** — apply every edit in the README updates section.
7. Final `npm run build` — no new warnings.

---

## Edge cases

- **No comps / sparse coverage.** `findCareerComps` returns `[]` → ineligible →
  pure pipeline. A meaningful fraction of vets (unusual archetypes, and most
  long-career vets — see below) will be ineligible; that is acceptable, not a
  regression.
- **Long-career veterans.** `findCareerComps` only keeps candidates whose arc
  is *at least as long* as the target's, and `theirSubsequentSeasons` is what
  the comp did *beyond* that length. For an 8-season target, comps need 9+
  seasons to contribute any subsequent data — rare → usually
  `subseasonCount < 2` → ineligible → pure pipeline. This is correct:
  long-career vets are precisely the high-`confidence` players who need a
  second model least.
- **Single comp.** Eligible only if that comp has 2 subsequent seasons
  (`subseasonCount ≥ 2`); `countFactor` 0.33 keeps its weight small.
- **Near-zero `pipelinePPG`.** The blend still works (`blendedPPG` is a convex
  combination); a deep scrub with eligible comps gets pulled toward `compPPG`,
  bounded by `[0, 40]`. Such players rarely have eligible comps anyway.
- **High-`confidence` pipeline.** `pipelineUncertainty` 0.25 → max `w` ≈ 0.0875
  — a small but non-zero comp influence; no discontinuity at the 5-season mark.
- **Scoring basis.** Both `pipelinePPG` and `compPPG` trace to the **same**
  `careerStats[...].fantasyPoints` field (`buildCareerArcVector`,
  `computeNextSeasonProjection`'s `qualifying`, and `positionPeakPPG` all read
  it). The two estimates are therefore in the *same* scoring basis by
  construction, and the blend is basis-safe **regardless** of what that basis
  is — no normalisation is needed. See Open Question Q2.
- **`< 2` qualifying seasons.** `buildCareerArcVector` yields a < 2-length
  vector → `findCareerComps` returns `[]` → ineligible → pure pipeline.

---

## Acceptance criteria

- [ ] `src/utils/compsIntegration.js` exists, exports `computeCompBlend`, and
      imports `findCareerComps` / `compsProjectedPPG` from `careerComps.js`.
- [ ] `computeNextSeasonProjection` computes `pipelinePPG`, then a Step 8 blend;
      the returned `projectedPPG` is the blended value and `projectedTotalPts`
      is recomputed from it.
- [ ] A player with no eligible comps has `projectedPPG === pipelinePPG`
      (pure-pipeline, unchanged from pre-B3) and `compBlendWeight === 0`.
- [ ] `compBlendWeight` never exceeds `0.35`; `blendedPPG` always lies between
      `pipelinePPG` and `compPPG`.
- [ ] Veteran `factors` has the 6 new keys with the types/sentinels above;
      `factors.pipelinePPG` holds the pre-blend value.
- [ ] No `App.jsx` change; `careerComps.js`, `dynastyScore.js`,
      `regressionSignals.js`, `projectionSignals.js`, `momentum.js`,
      `teamContext.js` unchanged; `rookieProjection` unchanged.
- [ ] B1a/B1b/B2 `factors` keys all still present and unchanged.
- [ ] The Player Profile comps display still works (it calls `findCareerComps`
      independently).
- [ ] All README edits applied.
- [ ] `npm run build` passes with no new warnings.

---

## Out of scope — do not touch

- `rookieProjection` and the rookie path.
- `careerComps.js` (consumed via import only — not modified),
  `dynastyScore.js`, `collegeMetrics.js`, `teamContext.js`, `momentum.js`,
  `projectionSignals.js`, `regressionSignals.js`.
- Dynasty scoring, role ranks, positional ranks, every other consumer.
- All existing pipeline steps and their factors/clamps — the comp blend is
  purely additive, applied after the combine.
- The `combinedNewFactor` clamp `[0.78, 1.30]` — the blend lives outside it.
- The `confidence` label logic — unchanged (B1a/B2 precedent).
- `App.jsx`, `projectionSnapshot.js`, the Player Profile comps UI, cache TTLs,
  dependencies, API calls.

---

## README updates

Apply all of the following to `README.md`. Each is mechanical.

**1. File-map line for `seasonProjection.js` (line 63).** Replace:

- *Before:* `    seasonProjection.js # computeNextSeasonProjection() — 15-factor veteran pipeline + rookie path`
- *After:* `    seasonProjection.js # computeNextSeasonProjection() — 15-factor veteran pipeline + career-comp blend + rookie path`

**2. File-map — new module.** Insert a line immediately after the
`projectionSignals.js` line (line 62):

```
    compsIntegration.js # computeCompBlend() — ensembles the pipeline projection with the career-comp estimate
```

**3. Veteran pipeline heading (line 655).** Change `### Veteran pipeline (11
steps)` to `### Veteran pipeline (12 steps)`.

**4. Veteran pipeline table — new row.** Insert immediately after the row `| 8
| **Depth chart** | … |` (line 671):

```
| 9 | **Career-comp blend** | Ensembles the pipeline `projectedPPG` with the career-comp nearest-neighbour estimate: `α × pipelinePPG + (1 − α) × compPPG`. Comp weight `1 − α` is capped at 0.35 and scales with comp count / similarity / subsequent-season data and with pipeline uncertainty (low ×1.0, medium ×0.6, high ×0.25). Neutral (α = 1.0) when no eligible comps. |
```

(Code labels this `── Step 8 ──`; the README table's own numbering reaches 9
here.)

**5. After the `combinedNewFactor` paragraph (after line 673).** Insert a new
paragraph:

```
The career-comp blend (Step 9) is applied *after* the combine — it is a model ensemble on the final `projectedPPG`, not a pipeline factor, so it sits outside the `combinedNewFactor` clamp and the per-step multiplier stacking. Because the blend is a weighted average, the result is always bounded by the pipeline and comp estimates and cannot over-project. `factors.pipelinePPG` preserves the pre-blend pipeline value.
```

**6. Career comparables section (after line 787).** After the line `Comps are
skipped for prospects (\`confidence === 'prospect'\`).`, add:

```
**Projection reuse:** the season projection's veteran pipeline ensembles `compsProjectedPPG` with its own pipeline output — see Next-season projections § Step 9 (Career-comp blend). The comp weight is confidence-scaled and capped at 0.35; the blend is computed in `src/utils/compsIntegration.js`.
```

**7. `seasonProjections` shape note (line 147) and the `factors` object.** No
edit needed — the return shape `{ projectedPPG, projectedGames,
projectedTotalPts, confidence, factors, adjustmentSummary }` is unchanged
(`projectedPPG` is now the blended value but the key is the same), and the
README does not enumerate `factors` keys anywhere, so there is no key list to
extend. Stated explicitly per the brief.

No other README sections require changes.

---

## Open questions — confirm before / during implementation

### Q1 — `MAX_COMP_WEIGHT = 0.35` vs the brief's suggested 0.40

B3 caps the comp model at **35%** of the ensemble (the brief floated 40%). The
0.35 choice buys extra headroom against the trajectory/momentum/breakout
double-counting and keeps the pipeline a clear majority model in every case.
The blend is a tunable parameter with no ground truth until snapshot
backtesting accumulates; the value is isolated as `MAX_COMP_WEIGHT` at the top
of `compsIntegration.js` so a future task can retune it without touching the
design. **Confirm 0.35** (recommended) or specify 0.40.

### Q2 — Scoring-basis assumption

The brief notes `compsProjectedPPG` may have been "computed in half-PPR
equivalent." In the current code, `compPPG` and `pipelinePPG` **both** derive
from `careerStats[...].fantasyPoints`, so they share whatever basis that field
uses — the blend is internally consistent **regardless**. Per CLAUDE.md's
fantasy-points rule, `careerStats.fantasyPoints` is computed with the active
league's `scoringSettings`, so the basis is the live league's. This is
informational: **confirm** there is no separate half-PPR path feeding
`careerStats.fantasyPoints` that would desync it — if there is, it is a
pre-existing whole-projection issue, not introduced by B3, since both estimates
read the identical field.

### Q3 — Performance pattern (decision, not blocking)

B3 uses the **lazy** pattern — `findCareerComps` called inside
`computeNextSeasonProjection`, no App.jsx change (unlike B1a's QB1 quality). The
first-run cost is a one-time sub-100 ms sweep, amortised to zero by the existing
`compsCache`. Recorded here for visibility; **no confirmation needed** unless
the user specifically wants the eager App.jsx pattern instead (not recommended
— it adds wiring without reducing cost).

---

## Reference implementations

- **Comp source:** `careerComps.js` — `findCareerComps` (similarity sweep,
  `theirSubsequentSeasons`), `compsProjectedPPG` (normalised → absolute PPG).
- **Helper-module + isolated-tunable-constant pattern:** `momentum.js` (B1a),
  `projectionSignals.js` (B1b), `regressionSignals.js` (B2).
- **Confidence-weighted modulation precedent:** B1a share-volatility and B2
  consistency both scale an effect by a confidence-like factor — B3's
  `pipelineUncertainty` plays the analogous role for the comp weight.
- **Eager-vs-lazy wiring contrast:** B1a's QB1 quality (`qbQualityByTeam`
  passed from App.jsx) is the *eager* case; B3 is the *lazy* case because its
  inputs are already in scope.

## Documentation

README.md — all edits enumerated in the README updates section. No other
documentation files.
