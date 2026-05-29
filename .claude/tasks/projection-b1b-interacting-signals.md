# Projection B1b — Wire seven interacting signals into the projection pipeline

## Goal

Add seven already-computed signals to `src/utils/seasonProjection.js`. Unlike
B1a's independent signals, these **interact**: three veteran booleans
(`isBreakout`, `isBounceBack`, `isTdReliant`) compose around Step 5 regression,
and three rookie college signals (`productionTrend`, `finalYearDominator`,
`breakoutAge`) compose into the rookie path's college multiplier. Both the
veteran path (`computeNextSeasonProjection`) and the rookie path
(`rookieProjection`) get changes. Every new signal records a numeric
contribution into `factors` for the daily projection snapshot (Thread A).

This batch follows the precedents resolved in
`.claude/tasks/projection-b1a-independent-signals.md` (shipped).

---

## Files to create

| Path | Purpose |
|------|---------|
| `src/utils/projectionSignals.js` | Three pure helpers — `computeBreakoutFlag`, `computeBounceBackFlag`, `computeTdReliance` — byte-identical ports of the inline `isBreakout` / `isBounceBack` / `isTdReliant` logic in `dynastyScore.js`, so the projection can consume them without importing dynasty scoring. |

## Files to modify

| Path | What changes |
|------|--------------|
| `src/utils/seasonProjection.js` | New import of the three helpers. **Veteran path:** new Step 5c block; combine line extended (3 new factors + widened `combinedNewFactor` clamp); `factors` + `adjustmentSummary` extended. **Rookie path:** `rookieProjection`'s college section restructured into a composite; `factors` + `adjustmentSummary` extended. |
| `README.md` | Several sections — see the **README updates** section at the end of this file for exact before/after text. |

**No `App.jsx` changes.** All seven signals are computable from data already
passed into `computeNextSeasonProjection` / `rookieProjection` (`careerStats`,
`empiricalCurves`, `positionPeakPPG`, `scoringSettings`, `collegeStats`). If
the implementer finds a wiring gap, **stop and ask** (per B1a Q1 pattern) —
none is anticipated.

---

## Pre-read notes for the implementer

1. **Step numbering.** The code's `── Step N ──` comments are canonical (B1a
   resolution). The new veteran block is **Step 5c**, inserted immediately
   after the existing `── Step 5b: Momentum multiplier ──`. The README uses a
   different prose numbering — README edits are spelled out separately.
2. **Byte-identical replication.** The three veteran helpers must reproduce
   `dynastyScore.js`'s flag *results* exactly. `dynastyScore.js` stays
   **untouched** (B1a precedent — temporary duplication is accepted, documented
   with a header comment). Do not "improve" the logic even where it looks
   quirky (see Edge cases § isBounceBack narrowness).
3. **Do not modify** `dynastyScore.js`, `collegeMetrics.js`, `teamContext.js`,
   `momentum.js`, dynasty scoring, role ranks, positional ranks, or any other
   consumer. B1a's 10 veteran `factors` keys stay — B1b adds, never renames or
   removes.
4. **`collegeMetrics` already supplies the rookie signals.** `computeCollegeMetrics`
   returns `productionTrend`, `finalYearDominator`, `breakoutAge`,
   `peakDominator`, `seasonsPlayed` on the object the projection already reads
   as `collegeStats[playerId]`. No new computation of college metrics — just
   consume the unused fields.

---

## Decisions resolved (read before implementing)

### Veteran-boolean exposure — DECISION: extract a helper module (`projectionSignals.js`)

Options: extract helpers / recompute inline / piggyback on dynasty results.

- **Piggyback** rejected — `computeNextSeasonProjection` does not receive
  dynasty results; passing them needs an App.jsx change and couples the
  projection to dynasty output shape.
- **Inline** is viable (the conditions are short), but `isTdReliant` is not a
  simple check — it needs the `TD_STAT_KEYS` constant and a dot-product over
  scoring settings. Inlining scatters that into `computeNextSeasonProjection`.
- **Extract** chosen, for consistency with the B1a `momentum.js` precedent
  (signals computed inline in `dynastyScore.js` get a single canonical helper
  home with a duplication header comment) and because it keeps
  `computeNextSeasonProjection` readable. One module holds all three so a
  future task can de-duplicate `dynastyScore.js` against it in one place.

**Known consequence:** after this task there are two copies of each flag's
logic (`dynastyScore.js` inline + `projectionSignals.js`). They must stay in
sync until a future task de-duplicates. `projectionSignals.js` carries a header
comment saying so.

### Rookie college restructure — DECISION: extend `collegeMult` into a composite (option a)

The three rookie signals are **not independent**: `productionTrend` is itself
derived from `finalYearDominator` (it buckets `finalYearDominator / mean`).
Modelling them as parallel multiplicative factors would double-count. So
`peakDominator`, `productionTrend` and `finalYearDominator` are folded into a
**single composite `collegeMult`** (option a). `breakoutAge` *is* genuinely
independent (it is about *when*, not *how much*) — it becomes a separate
`breakoutAgeFactor`. The applied value is `collegeContribution = collegeMult ×
breakoutAgeFactor`, clamped to the brief's ±25% target.

This is a brief-sanctioned modulation of the existing `collegeMult` (option a
was explicitly offered). The existing 3-bucket formula is **preserved verbatim**
as the composite's starting point (`collegeBase`) — the new signals only
*adjust around it*.

### Veteran new-factor clamp — DECISION: replace B1a's `[0.85, 1.15]` clamp with a wider `[0.78, 1.30]`

B1a's `combinedNewFactor = clamp(qbQualityFactor × momentumFactor, 0.85, 1.15)`
wrapped 2 factors. B1b adds 3 veteran PPG multipliers. Joining them to the
existing `[0.85, 1.15]` clamp would make it bind constantly (a young breakout
on a good offense with momentum legitimately reaches ~1.25). The brief
explicitly permits "replace it with a wider clamp." All five new veteran PPG
factors share one clamp: `combinedNewFactor = clamp(qbQualityFactor ×
momentumFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor, 0.78,
1.30)`. The five-factor natural range is `[0.813, 1.286]` (see Stacking
analysis), so `[0.78, 1.30]` is a guardrail that essentially never binds — the
same role B1a's clamp played. The `factors.combinedNewFactor` key is kept; its
value now reflects the 5-factor product (documented under Backward compat).

---

## New module: `src/utils/projectionSignals.js`

```js
/**
 * src/utils/projectionSignals.js — Veteran projection signal helpers.
 *
 * Byte-identical ports of the inline isBreakout / isBounceBack / isTdReliant
 * logic in dynastyScore.js (computeDynastyScore — "Special signals" and
 * "TD dependency signal" blocks). dynastyScore.js is intentionally left
 * untouched in this batch; a future task should refactor it to import these
 * so the duplicated logic cannot drift. Keep the thresholds and TD_STAT_KEYS
 * here identical to that file.
 */
import { interpolateAgeCurve } from './dynastyScore'

// Identical to dynastyScore.js TD_STAT_KEYS.
const TD_STAT_KEYS = [
  'rush_td', 'rec_td', 'pass_td',
  'rush_2pt', 'rec_2pt', 'pass_2pt',
  'def_td', 'def_st_td', 'st_td', 'fum_rec_td',
]

/**
 * isBreakout: young player producing far above their age-expected level.
 * Mirrors dynastyScore.js: rawRatio = (currentPPG/peakPPG) / (expectedMedian/peakPPG).
 *
 * @param {number|null} age          player age
 * @param {number}      currentPPG   most recent qualifying season PPG
 * @param {Array}       curve        empirical age curve for the position
 * @param {number}      peakPPG      positionPeakPPG for the position (cancels out;
 *                                   pass `positionPeakPPG?.[position] ?? 20`)
 * @returns {boolean}
 */
export function computeBreakoutFlag(age, currentPPG, curve, peakPPG) {
  const expectedMedianPPG = age != null ? interpolateAgeCurve(curve, age) : peakPPG * 0.7
  const ageFactor = expectedMedianPPG / peakPPG
  const rawRatio  = ageFactor > 0 ? (currentPPG / peakPPG) / ageFactor : 0
  return age != null && age <= 24 && rawRatio > 1.3
}

/**
 * isBounceBack: the season before the most recent one was games-shortened
 * (< 10 GP) and the most recent season matched or beat prior career bests.
 * Mirrors dynastyScore.js. Note: `qualifying` only holds GP>=8 seasons, so the
 * "shortened" prior season is an 8–9 GP season (see Edge cases).
 *
 * @param {Array<{ppg:number, gamesPlayed:number}>} qualifying  oldest → newest
 * @returns {boolean}
 */
export function computeBounceBackFlag(qualifying) {
  if (!Array.isArray(qualifying) || qualifying.length < 2) return false
  const ppgs       = qualifying.map(s => s.ppg)
  const currentPPG = ppgs[ppgs.length - 1]
  const prevSeason = qualifying[qualifying.length - 2]
  if ((prevSeason.gamesPlayed ?? 0) >= 10) return false
  const priorMax      = Math.max(...ppgs.slice(0, -1))
  const secondHighest = [...ppgs].sort((a, b) => b - a)[1]   // copy — avoid mutating ppgs
  return currentPPG >= priorMax || currentPPG >= secondHighest
}

/**
 * isTdReliant: share of the most recent qualifying season's fantasy points
 * that came from TD / 2-pt stats exceeds 40%. Mirrors dynastyScore.js.
 *
 * @param {Object|undefined} stats           most recent qualifying season raw stats
 * @param {number|undefined} totalFP         that season's total fantasy points
 * @param {Object|null}      scoringSettings league scoring settings
 * @returns {{ tdDependency: number|null, isTdReliant: boolean }}
 *          tdDependency is null when it cannot be computed (no scoring settings
 *          or no stats) — a sentinel, distinct from a genuine 0.
 */
export function computeTdReliance(stats, totalFP, scoringSettings) {
  if (!scoringSettings || !stats) return { tdDependency: null, isTdReliant: false }
  let tdPoints = 0
  for (const key of TD_STAT_KEYS) {
    const statVal    = stats[key]
    const multiplier = scoringSettings[key]
    if (statVal != null && multiplier != null) tdPoints += statVal * multiplier
  }
  const tdDependency = tdPoints / Math.max(totalFP ?? 0, 1)
  return { tdDependency, isTdReliant: tdDependency > 0.40 }
}
```

`projectionSignals.js` imports only `interpolateAgeCurve` from `dynastyScore.js`
— a one-way import (`dynastyScore.js` imports neither this module nor
`seasonProjection.js`), so **no circular dependency**.

Add to `seasonProjection.js` imports:

```js
import { computeBreakoutFlag, computeBounceBackFlag, computeTdReliance } from './projectionSignals'
```

---

## Algorithm — veteran path (Items 1–3)

### New Step 5c — `isBreakout` / `isBounceBack` / `isTdReliant`

Insert a block immediately after `── Step 5b: Momentum multiplier ──`. It uses
`age` and `curve` (Step 3), `lastPPG` and `careerAvg` (Step 5), `qualifying`
(Step 1), and the `scoringSettings` / `careerStats` / `playerId` parameters.

```js
// ── Step 5c: Breakout / bounce-back / TD-reliance adjustments ────────────
const breakoutPeakPPG = positionPeakPPG?.[position] ?? 20   // cancels in rawRatio

const isBreakout = (age != null && curve.length > 0)
  ? computeBreakoutFlag(age, lastPPG, curve, breakoutPeakPPG)
  : null

const isBounceBack = qualifying.length >= 2
  ? computeBounceBackFlag(qualifying)
  : null

const lastQ          = qualifying[qualifying.length - 1]
const lastSeasonRaw  = careerStats?.[lastQ.season]?.[playerId] ?? {}
const { tdDependency, isTdReliant: tdReliantRaw } =
  computeTdReliance(lastSeasonRaw.stats, lastSeasonRaw.fantasyPoints, scoringSettings)
const isTdReliant = tdDependency == null ? null : tdReliantRaw

const breakoutFactor    = isBreakout   === true ? 1.08 : 1.00
const bounceBackFactor  = isBounceBack === true ? 1.05 : 1.00
const tdRelianceFactor  = isTdReliant  === true ? 0.93 : 1.00
```

**Tri-state booleans.** Each flag is `true` / `false` / `null`. `null` means
"could not determine" (missing age/curve, fewer than 2 qualifying seasons, or
no scoring settings). Only `=== true` triggers a non-neutral factor — `false`
and `null` both yield `1.00`.

| Signal | Factor when `true` | Direction | Rationale |
|---|---|---|---|
| `isBreakout` | `breakoutFactor` 1.08 | +8% | "Trust the breakout, regress less." Strong positive for a young player producing 30%+ above age-expected. |
| `isBounceBack` | `bounceBackFactor` 1.05 | +5% | "Project to the demonstrated bounced-back level." Smallest of the three — the bounce-back season already carries 50% of base PPG (Step 2); this only corrects the dip season's 30% drag. |
| `isTdReliant` | `tdRelianceFactor` 0.93 | −7% | "Current PPG is TD-inflated; regress more." Slightly softer than breakout — TD production partially persists for goal-line / red-zone roles. |

All three are **flat multipliers** fed into the combine line via
`combinedNewFactor` — they are **not** folded into `regressionFactor`.

### Where each applies, and why

- **`isBreakout` and `isTdReliant`** conceptually belong with Step 5
  regression. They are implemented as separate flat multipliers (not edits to
  the `regressionFactor` bucket logic) so the existing Step 5 effect stays
  **byte-identical** (constraint: existing factor effects unchanged). They
  "modify regression" by composing multiplicatively with `regressionFactor` in
  the combine line.
- **`isBounceBack`** could touch Step 2 base-PPG weighting or Step 6 games. It
  is implemented as a flat PPG multiplier instead — see the resolution below.

### Interaction with the existing Step 5 regression factor

`regressionFactor` keeps its exact bucket logic. The new factors compose with
it by plain multiplication in the combine line:

- A breakout player almost always has `outlierRatio > 1.15` (the most recent
  season is well above career average — that *is* the breakout), so
  `regressionFactor` is `0.95` or `0.88`. `breakoutFactor` 1.08 offsets it:
  `0.88 × 1.08 = 0.950`, `0.95 × 1.08 = 1.026`. Net: the model still regresses
  a breakout *somewhat* toward the age curve, but the flag recovers ~8% of the
  haircut — the literal "regress less," achieved without touching Step 5.
- A TD-reliant overperformer compounds: `regressionFactor 0.88 × tdRelianceFactor
  0.93 = 0.818` — "regress more."
- The factors can also oppose `regressionFactor`. A TD-reliant player whose
  last season was *below* career average (`regressionFactor` 1.05/1.12,
  bounce-up) gets `× 0.93` — the projected bounce-up is tempered because it
  would be TD-built. This is intentional and correct.

### `isBounceBack` — base PPG vs games projection (brief risk resolved)

**Resolution: `isBounceBack` adjusts PPG only (a flat ×1.05). It does NOT
re-weight Step 2 and does NOT touch the Step 6 games projection or the
injury-season count.**

Rationale:
- Re-weighting Step 2's 50/30/20 is a modulation of an existing factor that
  would need bespoke new weights — fiddly and invasive. A flat multiplier is
  consistent with how every other B1a/B1b signal is modelled.
- Touching Step 6 games would interact with B1a's absence-shape factor and the
  injury-season count — and "the player is healthy now" is speculative (one
  recovered season does not erase durability history). The Step 6 logic
  *should* still reflect that risk.
- The trigger fires on the *second-to-last* qualifying season being short; the
  most recent season (the bounce-back itself) already dominates base PPG at
  50%. A modest +5% corrects the dip season's 30% drag without over-projecting.

See Open Question Q1 — if the user wants bounce-back to also relieve the games
penalty, that is a deliberate follow-up, not part of B1b.

### Cross-flag composition (veteran) — exact numerical outcomes

All three are independent flat multipliers; composition is plain
multiplication. No special-casing.

| Combination | Product | Net | Interpretation |
|---|---|---|---|
| `isBreakout` only | 1.08 | +8.0% | Trust the breakout. |
| `isTdReliant` only | 0.93 | −7.0% | Regress the TD inflation. |
| `isBounceBack` only | 1.05 | +5.0% | Project to the bounced-back level. |
| **`isBreakout` + `isTdReliant`** | 1.08 × 0.93 = **1.004** | ≈ 0% | A breakout built partly on TDs nets to ~neutral — the breakout is real but not fully trusted because the scoring is TD-inflated. Neither signal dominates; they offset, pending another season of data. |
| **`isBreakout` + `isBounceBack`** | 1.08 × 1.05 = **1.134** | +13.4% | Reinforcing, as expected — a young player who returned from a lost season *and* broke out. The strongest legitimate young-player combo; well inside the `[0.78, 1.30]` guardrail. |
| **`isBounceBack` + `isTdReliant`** | 1.05 × 0.93 = **0.977** | −2.3% | Returned to form, but the form is TD-built — slight net caution. The bounce-back is acknowledged, then discounted for TD reliance. |
| **All three** | 1.08 × 1.05 × 0.93 = **1.055** | +5.5% | Breakout + bounce-back lift +13.4%; TD-reliance pulls −7% off → net +5.5%. A young, bounced-back breakout whose production leans on TDs lands at a modest positive — real upside, tempered. |

The "cancelling" the brief flagged as a risk is, for the breakout + TD-reliant
case, the **desired** behaviour: a TD-built breakout genuinely deserves more
caution than a volume-built one, and netting to ~neutral expresses exactly that.

### Combine line (veteran)

```js
// ── Combine ──────────────────────────────────────────────────────────────
// All five new PPG multipliers (B1a: qbQuality, momentum; B1b: breakout,
// bounceBack, tdReliance) share one guardrail clamp. Natural range
// [0.813, 1.286] — the clamp essentially never binds.
const combinedNewFactor = clamp(
  qbQualityFactor * momentumFactor * breakoutFactor * bounceBackFactor * tdRelianceFactor,
  0.78, 1.30
)
const rawPPG = basePPG * ageDelta * shareTrendMultiplier * regressionFactor
             * teamFactor * depthFactor * combinedNewFactor
const projectedPPG = clamp(rawPPG, 0, 40)   // existing output clamp, unchanged
```

### Veteran fallbacks (missing data)

| Signal | Missing-data condition | Result |
|---|---|---|
| `isBreakout` | `age == null` OR `curve.length === 0` | `isBreakout = null`, `breakoutFactor = 1.00` |
| `isBounceBack` | `qualifying.length < 2` | `isBounceBack = null`, `bounceBackFactor = 1.00` |
| `isTdReliant` | `scoringSettings` falsy OR most-recent season has no `stats` | `tdDependency = null`, `isTdReliant = null`, `tdRelianceFactor = 1.00` |

### Veteran `factors` keys (7 new)

| Key | Type | Value |
|---|---|---|
| `isBreakout` | boolean \| null | flag, `null` when undeterminable |
| `breakoutFactor` | number (3 dp) | 1.08 / 1.00 |
| `isBounceBack` | boolean \| null | flag, `null` when undeterminable |
| `bounceBackFactor` | number (3 dp) | 1.05 / 1.00 |
| `isTdReliant` | boolean \| null | flag, `null` when undeterminable |
| `tdRelianceFactor` | number (3 dp) | 0.93 / 1.00 |
| `tdDependency` | number (3 dp) \| null | raw 0–1 ratio, `null` sentinel |

`combinedNewFactor` (existing B1a key) keeps its name; its value now reflects
the 5-factor product.

### Veteran `adjustmentSummary` lines (append to the existing block)

```js
if (isBreakout === true)   adjustmentSummary.push('Young breakout — regression softened ↑')
if (isBounceBack === true) adjustmentSummary.push('Bounced back from lost season ↑')
if (isTdReliant === true)  adjustmentSummary.push('TD-reliant scoring — extra regression ↓')
```

---

## Algorithm — rookie path (Items 4–6)

`rookieProjection` currently computes
`projectedPPG = clamp(baseline × ageMult × ktcMult × collegeMult, 0, 40)`
where `collegeMult` is a 3-bucket function of `peakDominator`. Restructure the
**college section only** — `baseline`, `ageMult`, `ktcMult` are untouched.

### Restructured college section

```js
// ── College composite ────────────────────────────────────────────────────
const cm = collegeStats?.[playerId]

// collegeBase — existing 3-bucket peakDominator multiplier, preserved verbatim.
let collegeBase = 1.0
if (cm?.peakDominator != null) {
  const dom = cm.peakDominator
  collegeBase = dom >= 30 ? 1.20 : dom >= 20 ? 1.08 : 0.92
}

// productionTrend adjust
const productionTrend = cm?.productionTrend ?? null
const productionTrendAdjust = ({
  improving:       0.05,
  'peak-final':    0.00,
  declining:      -0.07,
  'single-season': -0.02,
})[productionTrend] ?? 0.00

// finalYearDominator adjust — only with 2+ college seasons and a valid peak.
const finalYearDominator = cm?.finalYearDominator ?? null
let finalYearAdjust = 0.00
if ((cm?.seasonsPlayed ?? 0) >= 2 && finalYearDominator != null
    && cm?.peakDominator != null && cm.peakDominator > 0) {
  const r = finalYearDominator / cm.peakDominator
  if      (r >= 0.85) finalYearAdjust =  0.03
  else if (r <  0.55) finalYearAdjust = -0.05
}

const collegeMult = clamp(collegeBase + productionTrendAdjust + finalYearAdjust, 0.80, 1.26)

// breakoutAge — separate (independent) factor.
const breakoutAge = cm?.breakoutAge ?? null
let breakoutAgeFactor = 1.00
if (breakoutAge != null && breakoutAge >= 17 && breakoutAge <= 24) {
  breakoutAgeFactor = breakoutAge <= 19 ? 1.05
                    : breakoutAge === 20 ? 1.02
                    : breakoutAge === 21 ? 1.00
                    : breakoutAge === 22 ? 0.98
                    : 0.96   // 23–24
}

// collegeContribution — total college effect, explicitly bounded to ±25%.
const collegeContribution = clamp(collegeMult * breakoutAgeFactor, 0.75, 1.25)

const projectedPPG = clamp(baseline * ageMult * ktcMult * collegeContribution, 0, 40)
```

### Multiplier tables

**`collegeBase`** (existing — peakDominator buckets, unchanged):

| `peakDominator` | `collegeBase` |
|---|---|
| ≥ 30 | 1.20 |
| ≥ 20 | 1.08 |
| < 20 / missing | 0.92 / 1.00 (1.00 when `cm` or `peakDominator` absent) |

**`productionTrendAdjust`:**

| `productionTrend` | adjust | Rationale |
|---|---|---|
| `improving` | +0.05 | Late bloomer — ended above their college average. |
| `peak-final` | 0.00 | Ended at peak — peak already captured by `collegeBase`. |
| `declining` | −0.07 | One-hit wonder — faded after an earlier high. |
| `single-season` | −0.02 | Not directional — only one college season. A small reliability discount (less evidence), **not** punished like `declining`. |
| `null` / missing | 0.00 | Neutral. |

**`finalYearAdjust`** (only when `seasonsPlayed ≥ 2` and `peakDominator > 0`;
`r = finalYearDominator / peakDominator`):

| `r` | adjust | Meaning |
|---|---|---|
| ≥ 0.85 | +0.03 | Sustained — ended at/near their peak. |
| < 0.55 | −0.05 | Peak was a distant outlier spike. |
| 0.55 – 0.85 | 0.00 | Mild fade. |
| not computable | 0.00 | Single-season, or no valid peak. |

**`breakoutAgeFactor`:**

| `breakoutAge` | factor | Meaning |
|---|---|---|
| ≤ 19 | 1.05 | Early breakout vs older competition — elite signal. |
| 20 | 1.02 | |
| 21 | 1.00 | Neutral. |
| 22 | 0.98 | |
| 23–24 | 0.96 | Late breakout — weaker signal. |
| `null` / < 17 / > 24 | 1.00 | Missing or implausible — neutral fallback. |

### Avoiding the `finalYearDominator` / `peakDominator` double-count

`productionTrend` already buckets `finalYearDominator / mean`. `finalYearAdjust`
deliberately uses a **different ratio** — `finalYearDominator / peakDominator` —
which answers a distinct question: "was the *peak* sustained, or a one-season
spike?" `finalYearDominator` therefore informs the **shape** of the college arc
(in concert with `productionTrend`), never acting as a parallel peak multiplier.
`finalYearAdjust` is also gated to `seasonsPlayed ≥ 2`, so single-season players
(where `finalYearDominator === peakDominator` trivially) never receive the
+0.03 "sustained" bonus.

### Rookie cross-signal composition — worked cases (brief)

| Profile | `collegeBase` | trend | finalYear | `collegeMult` | `breakoutAgeFactor` | `collegeContribution` |
|---|---|---|---|---|---|---|
| **One-hit wonder** — peak 38, `declining`, ended far below peak, broke out at 22 | 1.20 | −0.07 | −0.05 | clamp(1.08) = 1.08 | 0.98 | clamp(1.058) = **1.058** |
| **Late bloomer** — peak 24, `improving`, ended at peak, broke out at 19 | 1.08 | +0.05 | +0.03 | clamp(1.16) = 1.16 | 1.05 | clamp(1.218) = **1.218** |
| **Sustained stud** — peak 32, `peak-final`, ended at peak, broke out at 20 | 1.20 | 0.00 | +0.03 | clamp(1.23) = 1.23 | 1.02 | clamp(1.255) = **1.250** (clamp binds) |
| **Single-season flash** — one season, dom 28 | 1.08 | −0.02 | 0.00 (gated) | clamp(1.06) = 1.06 | (age-dependent) | — |

The headline result the brief asked for: the **late bloomer (1.218)** projects
*higher* than the **one-hit wonder (1.058)** despite a much lower college peak —
the composite correctly inverts a naïve `peakDominator`-only ranking.

### Rookie fallbacks (missing data)

| Condition | Result |
|---|---|
| `collegeStats[playerId]` absent | `collegeBase 1.0`, all adjusts 0, `collegeMult 1.0`, `breakoutAgeFactor 1.0`, `collegeContribution 1.0`; `productionTrend`/`finalYearDominator`/`breakoutAge` → `null` |
| `peakDominator` null (e.g. QB with no usable passing data) | `collegeBase 1.0`, `finalYearAdjust 0` |
| `productionTrend` null/missing | `productionTrendAdjust 0` |
| `seasonsPlayed < 2` | `finalYearAdjust 0` |
| `breakoutAge` null or outside 17–24 | `breakoutAgeFactor 1.0` (raw value still recorded in `factors`) |

### Rookie `factors` keys

Current rookie `factors`: `{ basePPG, ageDelta, shareTrend, regressionFactor,
durabilityFactor, teamFactor, depthFactor, ktcMult, collegeMult, ktcPct }`.

Changes — `collegeMult` is **repurposed** to hold the composite value (B1a
precedent: the existing key holds the *applied/derived* value, a new `*Base`
key holds the raw); 8 keys are **added**:

| Key | Type | Value |
|---|---|---|
| `collegeBase` | number (3 dp) | the existing 3-bucket peakDominator multiplier (the pre-B1b `collegeMult`) — **new** |
| `collegeMult` | number (3 dp) | **repurposed** — now the composite `clamp(collegeBase + trend + finalYear, 0.80, 1.26)` |
| `productionTrend` | string \| null | the label |
| `productionTrendAdjust` | number | the applied adjust (e.g. `0.05`) |
| `finalYearDominator` | number \| null | raw value from `computeCollegeMetrics` |
| `finalYearAdjust` | number | the applied adjust |
| `breakoutAge` | number \| null | raw value from `computeCollegeMetrics` |
| `breakoutAgeFactor` | number (3 dp) | 0.96–1.05 |
| `collegeContribution` | number (3 dp) | `clamp(collegeMult × breakoutAgeFactor, 0.75, 1.25)` — the value actually multiplied into `projectedPPG` |

Keep `basePPG, ageDelta, shareTrend, regressionFactor, durabilityFactor,
teamFactor, depthFactor, ktcMult, ktcPct` exactly as they are.

### Rookie `adjustmentSummary` lines

Keep the two existing `collegeMult` lines (they now read the composite — still
meaningful). Append:

```js
if (productionTrend === 'improving')  adjustmentSummary.push('College production improving ↑')
if (productionTrend === 'declining')  adjustmentSummary.push('College production declining ↓')
if (breakoutAgeFactor > 1.0)          adjustmentSummary.push('Early college breakout ↑')
if (breakoutAgeFactor < 1.0)          adjustmentSummary.push('Late college breakout ↓')
```

---

## Stacking analysis

### Veteran path

Per-factor ranges — existing: `ageDelta` [0.80, 1.10], `shareTrendMultiplier`
[0.92, 1.08], `regressionFactor` [0.88, 1.12], `teamFactor` [0.92, 1.075],
`depthFactor` [0.68, 1.05]. New-factor group (inside `combinedNewFactor`):
`qbQualityFactor` [0.95, 1.05], `momentumFactor` [0.92, 1.08], `breakoutFactor`
{1.0, 1.08}, `bounceBackFactor` {1.0, 1.05}, `tdRelianceFactor` {0.93, 1.0}.

- Five-factor natural product range: **[0.813, 1.286]**. The
  `combinedNewFactor` clamp `[0.78, 1.30]` contains it — a guardrail that
  essentially never binds (B1a's design philosophy preserved).
- Full cumulative product (all six groups): worst ≈ `0.80 × 0.92 × 0.88 × 0.92
  × 0.68 × 0.78 = 0.316`; best ≈ `1.10 × 1.08 × 1.12 × 1.075 × 1.05 × 1.30 =
  1.952`. The cumulative top rises from B1a's ~1.70 to ~1.95.
- The unchanged output `clamp(rawPPG, 0, 40)` bounds the result. Reaching
  ~1.95× requires every factor near its max simultaneously — a heavily
  anti-correlated combination that does not occur for real players. **No
  additional global clamp.** Per-step clamps + the `[0.78, 1.30]`
  `combinedNewFactor` guardrail + the output clamp are sufficient.

### Rookie path

`projectedPPG = baseline × ageMult × ktcMult × collegeContribution`.

- `ageMult` [0.82, 1.15], `ktcMult` [0.70, 1.30] — both existing, unchanged.
- College group: `collegeMult` natural [0.80, 1.26] (post-clamp);
  `breakoutAgeFactor` [0.96, 1.05]; their product's natural range is
  [0.768, 1.323]. The `collegeContribution` clamp **`[0.75, 1.25]`** is the
  brief's explicit ±25% design ceiling — unlike the veteran guardrail, this one
  is *meant* to bind for the strongest profiles (it caps the generational
  prospect at +25%, see the "sustained stud" worked case). No single college
  signal can dominate: max single contribution is `collegeBase` at 1.20.
- Full rookie multiplier: max `1.15 × 1.30 × 1.25 = 1.869`; for the highest
  baseline (QB 13) → `24.3` PPG — far below the `clamp(…, 0, 40)` output
  ceiling. No runaway risk; no extra clamp needed.

---

## Implementation order

Run `npm run build` after each numbered step.

1. **Create `src/utils/projectionSignals.js`** with the three helpers and the
   header comment.
2. **Veteran path** — add the import; add the Step 5c block; extend the combine
   line (3 new factors + widen `combinedNewFactor` clamp to `[0.78, 1.30]`);
   add the 7 `factors` keys; add the 3 `adjustmentSummary` lines.
3. **Rookie path** — restructure `rookieProjection`'s college section; change
   the `projectedPPG` line to use `collegeContribution`; repurpose `collegeMult`
   and add the 8 `factors` keys; add the 4 `adjustmentSummary` lines.
4. **README** — apply every edit in the README updates section below.
5. Final `npm run build` — confirm no new warnings.

Veteran before rookie: the veteran path introduces the new helper module and
the clamp change (the structurally larger edit); the rookie path is then a
self-contained section rewrite.

---

## Edge cases

- **`isBounceBack` narrowness (replicate as-is).** `qualifying` only holds
  GP ≥ 8 seasons, so the "shortened" prior season the flag keys on is an 8–9 GP
  season — a truly catastrophic (< 8 GP) season is filtered out of `qualifying`
  entirely and is invisible to the flag. This is a property of
  `dynastyScore.js`'s existing signal. B1b replicates it **byte-identically**
  (no divergence) — see Open Question Q2. Do not "fix" it.
- **`ppgs` mutation.** `dynastyScore.js` calls `ppgs.sort()` in place inside
  the `isBounceBack` expression. `computeBounceBackFlag` copies (`[...ppgs]`)
  before sorting — the boolean result is identical, the mutation is avoided.
- **Age-curve unavailable for the breakout check.** `curve.length === 0` →
  `isBreakout = null`, `breakoutFactor = 1.00`. (Even without the caller gate,
  `interpolateAgeCurve([], age)` returns 0 → `rawRatio` 0 → `false`; the gate
  only converts that to the `null` sentinel.)
- **`peakPPG` is immaterial to `isBreakout`.** It cancels algebraically in
  `rawRatio`. Pass `positionPeakPPG?.[position] ?? 20` for parity with
  `dynastyScore.js`; the result does not depend on it.
- **Single-season rookies.** `productionTrend === 'single-season'` →
  `−0.02`; `finalYearAdjust` gated off (`seasonsPlayed < 2`). Net college
  effect is small and slightly cautious.
- **QB rookies.** `computeCollegeMetrics` puts `qbScore` (0–100) into both
  `peakDominator` and `finalYearDominator`. `collegeBase`'s ≥30 / ≥20 buckets
  apply to `qbScore` exactly as they did pre-B1b (existing behaviour,
  unchanged); the trend / finalYear ratios are unitless and position-agnostic.
- **`tdDependency` sentinel.** `null` when scoring settings or stats are
  absent (distinct from a genuine 0) — see Open Question Q4.

---

## Backward compatibility / `factors` shape evolution

- **Veteran `factors`** grows from 17 keys (post-B1a) to 24. `combinedNewFactor`
  keeps its name; its value now wraps 5 factors instead of 2.
- **Rookie `factors`** grows from 10 keys to 18. `collegeMult` is **repurposed**
  — pre-B1b it was the 3-bucket peakDominator multiplier; post-B1b it is the
  composite. The pre-B1b value is preserved under the new `collegeBase` key. Any
  backtest spanning the B1b boundary must read `collegeBase` for an
  apples-to-apples comparison with pre-B1b snapshots.
- All additions are backward-compatible — `projectionSnapshot.js` embeds the
  `projection` object verbatim with no field whitelist. Rookie- and
  veteran-path `factors` already differ in shape; B1b widens that gap, which is
  fine.

---

## Acceptance criteria

- [ ] `src/utils/projectionSignals.js` exists and exports `computeBreakoutFlag`,
      `computeBounceBackFlag`, `computeTdReliance`; logic byte-identical to the
      `dynastyScore.js` blocks; header comment documents the duplication.
- [ ] Veteran path: Step 5c block present after Step 5b; `breakoutFactor`,
      `bounceBackFactor`, `tdRelianceFactor` enter `combinedNewFactor`.
- [ ] `combinedNewFactor = clamp(qbQualityFactor × momentumFactor ×
      breakoutFactor × bounceBackFactor × tdRelianceFactor, 0.78, 1.30)`.
- [ ] Veteran `factors` has the 7 new keys with the types/values above;
      tri-state booleans are `true` / `false` / `null`.
- [ ] A vet with `isBreakout` and `isTdReliant` both true gets a combined
      `≈ 1.004` contribution from those two factors.
- [ ] Rookie path: `projectedPPG` uses `collegeContribution`; `collegeMult`
      holds the composite; `collegeBase` holds the old 3-bucket value.
- [ ] Rookie `factors` has all 8 new keys; a late bloomer (moderate peak +
      `improving`) yields a higher `collegeContribution` than a one-hit wonder
      (high peak + `declining`).
- [ ] All seven signals degrade to a neutral `1.0` factor with `null`
      sentinels when their inputs are missing.
- [ ] `dynastyScore.js`, `collegeMetrics.js`, `teamContext.js`, `momentum.js`
      are unchanged; B1a's `factors` keys are neither renamed nor removed.
- [ ] All README edits in the section below are applied.
- [ ] `npm run build` passes with no new warnings.

---

## Out of scope — do not touch

- `dynastyScore.js` (including the inline copies of the three flags — they keep
  their own copy; de-duplication against `projectionSignals.js` is a future
  task), `collegeMetrics.js`, `teamContext.js`, `momentum.js`.
- Dynasty scoring, role ranks, positional ranks, market divergence, every other
  pipeline consumer.
- B1a's factors, clamps, and step logic — except the explicitly sanctioned
  widening of the `combinedNewFactor` clamp.
- Step 2 base-PPG weighting and Step 6 games projection — `isBounceBack` does
  not touch them (see resolution + Q1).
- `App.jsx`, `projectionSnapshot.js`, cache TTLs, API calls, dependencies.
- PlayerProfile's College Production display — it already renders breakout
  age / peak / trend chips; B1b only makes the projection *consume* those
  fields, no display change.

---

## README updates

Apply all of the following to `README.md`. Each is mechanical.

**1. File tree (~line 61).** After the `momentum.js` line, add:

```
    projectionSignals.js # computeBreakoutFlag / computeBounceBackFlag / computeTdReliance — vet projection signals (ported from dynastyScore)
```

**2. File tree `seasonProjection.js` line (~line 62).** Change the factor
count — if it reads `11-factor veteran pipeline`, change to `14-factor veteran
pipeline` (B1b adds breakout / bounce-back / TD-reliance).

**3. Veteran pipeline heading (~line 651).** Change `### Veteran pipeline (9
steps)` to `### Veteran pipeline (10 steps)`.

**4. Veteran pipeline table (~lines 655–665).** Insert a new row immediately
after the Momentum row (Step 5):

```
| 5c | **Breakout / bounce-back / TD-reliance** | Booleans recomputed from dynasty-score logic (`projectionSignals.js`): `isBreakout` ×1.08, `isBounceBack` ×1.05, `isTdReliant` ×0.93; neutral when not firing or inputs missing |
```

**5. Combine-clamp note (~line 667).** Replace the whole line:

- *Before:* `Steps 5 and 7b (momentum and QB1 quality) are jointly capped at ±15% (`combinedNewFactor = clamp(momentumFactor × qbQualityFactor, 0.85, 1.15)`).`
- *After:* `Steps 5, 5c and 7b feed `combinedNewFactor = clamp(momentumFactor × qbQualityFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor, 0.78, 1.30)` — a guardrail bounding the five new PPG multipliers; its natural range is [0.813, 1.286] so it essentially never binds.`

**6. Rookie path formula (~line 676).** Replace:

- *Before:* `projectedPPG = ROOKIE_BASELINE_PPG[pos] × ageMult × ktcMult × collegeMult`
- *After:* `projectedPPG = ROOKIE_BASELINE_PPG[pos] × ageMult × ktcMult × collegeContribution`

**7. Rookie college multiplier (~line 685).** Replace the single
`**College multiplier:** …` line with:

```
**College contribution** — `collegeContribution = clamp(collegeMult × breakoutAgeFactor, 0.75, 1.25)` (bounded ±25%):

- **collegeBase** — peakDominator ≥ 30 → 1.20, ≥ 20 → 1.08, else 0.92
- **productionTrend adjust** — improving +0.05, peak-final 0.00, declining −0.07, single-season −0.02
- **finalYearDominator adjust** (2+ college seasons, `r = finalYearDominator / peakDominator`) — r ≥ 0.85 → +0.03, r < 0.55 → −0.05, else 0.00
- **collegeMult** — `clamp(collegeBase + trend adjust + finalYear adjust, 0.80, 1.26)`
- **breakoutAgeFactor** — breakout age ≤ 19 → 1.05, 20 → 1.02, 21 → 1.00, 22 → 0.98, 23–24 → 0.96; neutral (1.00) if null or implausible
```

**8. Dynasty "Special signals" section (~lines 605–610).** After the
`isBounceBack` bullet, add:

```
- **Projection reuse:** `isBreakout`, `isBounceBack` and `isTdReliant` are recomputed byte-identically by the season-projection veteran pipeline via `src/utils/projectionSignals.js` — see Next-season projections § Step 5c.
```

**9. `factors` key list.** The current README does **not** enumerate the
`factors` object's keys anywhere (the return shape at ~line 649 only names
`factors` as a whole). So there is **no key-list to extend** — no edit needed
for this item. (The brief anticipated such a list; it does not exist in the
current README. If the user wants one added, that is a separate doc task.)

No other README sections require changes.

---

## Open questions — confirm before / during implementation

### Q1 — `isBounceBack` and the games projection (design confirmation)

B1b applies `isBounceBack` as a PPG-only multiplier (×1.05); it deliberately
does **not** relieve the Step 6 games projection or the injury-season /
absence-shape penalties, even though the flag's trigger is a games-shortened
prior season. Rationale is in the algorithm section. **Confirm this is the
intended scope.** If the user wants bounce-back to also lift the games
projection, that is a deliberate follow-up (it would interact with B1a's
absence-shape factor and needs its own design).

### Q2 — `isBounceBack` narrowness (acknowledge, replicate as-is)

As implemented in `dynastyScore.js`, `isBounceBack` fires on an 8–9 GP prior
season, not a catastrophic (< 8 GP) one — sub-8-GP seasons are filtered out of
`qualifying`. B1b replicates this byte-identically (the no-divergence
principle). **Confirm** the implementer should replicate exactly rather than
widen the trigger. Recommended: replicate exactly; widening is a separate task
that would also have to touch `dynastyScore.js`.

### Q3 — Rookie `collegeContribution` clamp `[0.75, 1.25]`

The brief's "±25% total college contribution" is a rough target; B1b sets the
clamp at exactly `[0.75, 1.25]`. This binds for the strongest college profiles
(the "sustained stud" worked case clamps from 1.255 → 1.250). **Confirm**
±25% is the intended ceiling, or supply a preferred band.

### Q4 — `tdDependency` sentinel

`computeTdReliance` returns `tdDependency: null` when scoring settings or stats
are absent. `dynastyScore.js` implicitly yields `0` in that case (the sum loop
just does not run). The `isTdReliant` *boolean* is identical either way
(`false`); only the recorded `factors.tdDependency` differs. The `null`
sentinel lets snapshot backtests distinguish "no scoring data" from "genuinely
0% TD". **Confirm** the `null` sentinel is acceptable (recommended) rather than
mirroring `dynastyScore.js`'s `0`.

---

## Reference implementations

- **Flag logic to port:** `dynastyScore.js` `computeDynastyScore` — the
  "Special signals" block (`isBreakout`, `isBounceBack`) and the "TD dependency
  signal" block (`isTdReliant`, `tdDependency`, `TD_STAT_KEYS`).
- **Helper-module + duplication-comment pattern:** `src/utils/momentum.js`
  (B1a).
- **Existing-key-repurpose + raw-companion pattern:** B1a's `factors.shareTrend`
  (applied) / `factors.shareTrendRaw` (raw) — mirrored here by
  `factors.collegeMult` (composite) / `factors.collegeBase` (raw 3-bucket).
- **Guardrail-clamp pattern:** B1a's `combinedNewFactor`.
- **College metrics shape:** `src/utils/collegeMetrics.js` `computeCollegeMetrics`
  return object (`productionTrend`, `finalYearDominator`, `breakoutAge`,
  `peakDominator`, `seasonsPlayed`).

## Documentation

README.md — all edits enumerated in the README updates section above. No other
documentation files.
