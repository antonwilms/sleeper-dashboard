# Projection B2 — Trajectory slope & consistency into the veteran pipeline

## Goal

Wire two dynasty-score-derived signals into the **veteran** path of
`computeNextSeasonProjection` (`src/utils/seasonProjection.js`): the continuous
**trajectory slope** (weighted linear regression over career PPG) and the
**consistency** score (`1 − CV`). Both speak to "how much to trust recent PPG
vs the career mean" — the same concern as Step 5 regression — so B2 is a
design batch, not mechanical wiring. The rookie path is **out of scope**.

This batch follows the precedents from
`.claude/tasks/projection-b1a-independent-signals.md` and
`.claude/tasks/projection-b1b-interacting-signals.md` (both shipped).

---

## Files to create

| Path | Purpose |
|------|---------|
| `src/utils/regressionSignals.js` | Two pure helpers — `computeTrajectory(ppgs)` and `computeConsistency(ppgs)` — porting the weighted-linear-regression slope and the CV-based consistency score from `dynastyScore.js`, so the projection consumes them without importing dynasty scoring. |

## Files to modify

| Path | What changes |
|------|--------------|
| `src/utils/seasonProjection.js` | `computeNextSeasonProjection` (veteran path) only. New import. Step 5 restructured (consistency-modulated regression). New Step 5d (trajectory). Combine line + `factors` + `adjustmentSummary` extended. `rookieProjection` untouched. |
| `README.md` | Several sections — exact before/after in the **README updates** section below. |

**No `App.jsx` changes.** Both signals are computable from `qualifying` /
`ppgs` / `careerAvg`, which already exist in the veteran path. If a wiring gap
appears, **stop and ask** — none is anticipated.

---

## Pre-read notes for the implementer

1. **Step numbering.** The code's `── Step N ──` comments are canonical. The
   new trajectory block is **Step 5d** (after the existing Step 5c). Consistency
   folds **into Step 5** (it modulates `regressionFactor`) — it is not a new
   step. The README uses its own prose numbering; README edits are spelled out
   separately.
2. **Byte-identical formula port.** `regressionSignals.js` reproduces
   `dynastyScore.js`'s `weightedLinearRegression` and `stdDev` and the CV
   consistency formula. `dynastyScore.js` stays **untouched** (B1a/B1b
   precedent — temporary duplication, documented with a header comment).
3. **Do not modify** `dynastyScore.js`, `collegeMetrics.js`, `teamContext.js`,
   `momentum.js`, `projectionSignals.js`, dynasty scoring, role ranks, or any
   other consumer. B1a/B1b `factors` keys are neither renamed nor removed;
   `regressionFactor` is **repurposed** with a `regressionFactorRaw` companion
   (the sanctioned B1b `collegeMult`/`collegeBase` precedent).

---

## Architectural decision

### The signal-type taxonomy

The architecture is **mixed, by signal type** — and the mix is principled, not
a compromise:

> **Directional** signals (which way is the player heading) are **multipliers**.
> **Reliability** signals (how much to trust the estimate) are **modulators**
> of another factor.

This is already the pattern in the codebase: in Step 4, share-**trend**
(directional) is a multiplier and share-**volatility** (reliability) modulates
its magnitude. B2 applies the same taxonomy:

- **Trajectory is directional** → **Pattern A** (flat multiplier joining
  `combinedNewFactor`), exactly like momentum.
- **Consistency is a reliability signal** → **Pattern B** (modulates the
  magnitude of the Step 5 regression factor), exactly like share-volatility
  modulates share-trend.

### Why not Pattern C (replace Step 5)

Rejected. It discards the bucketed regression logic that B1a/B1b explicitly
preserved byte-for-byte, for the largest blast radius in the batch, with no
compelling upside — Pattern B already lets consistency improve the regression
step without throwing it away. The brief's default ("prefer A or B unless C is
compelling") holds; C is not compelling.

### Trade-off summary

| Option | Trajectory | Consistency | Verdict |
|---|---|---|---|
| All Pattern A | flat factor | flat factor | Consistency-as-flat-factor is wrong — it is not directional; "consistent → +X%" rewards steadiness regardless of level. Rejected for consistency. |
| All Pattern B | modulate Step 5 | modulate Step 5 | Trajectory is directional; modulating regression's *magnitude* with it conflates direction and reliability. Rejected for trajectory. |
| **Mixed (chosen)** | **Pattern A** | **Pattern B** | Each signal handled by the mechanism matching its type. Mirrors the Step 4 share-trend / share-volatility split. |
| Pattern C | continuous model | continuous model | Largest blast radius; discards preserved Step 5. Rejected. |

---

## New module: `src/utils/regressionSignals.js`

```js
/**
 * src/utils/regressionSignals.js — Trajectory & consistency signals for the
 * season projection.
 *
 * weightedLinearRegression and stdDev are byte-identical ports of the private
 * helpers in dynastyScore.js; computeConsistency reproduces its CV-based
 * consistency formula. dynastyScore.js is intentionally left untouched in this
 * batch; a future task should de-duplicate. Keep the formulas in sync.
 *
 * The trajectory *normalisation* (denominator floor of 4.0) is projection-
 * specific — see computeTrajectory.
 */

// Byte-identical to dynastyScore.js (the unused `const n` from that copy is
// omitted — it does not affect the result).
function weightedLinearRegression(xs, ys) {
  const ws     = xs.map((_, i) => i + 1)
  const wSum   = ws.reduce((a, b) => a + b, 0)
  const wxSum  = ws.reduce((s, w, i) => s + w * xs[i], 0)
  const wySum  = ws.reduce((s, w, i) => s + w * ys[i], 0)
  const wxxSum = ws.reduce((s, w, i) => s + w * xs[i] * xs[i], 0)
  const wxySum = ws.reduce((s, w, i) => s + w * xs[i] * ys[i], 0)
  const denom  = wSum * wxxSum - wxSum * wxSum
  if (Math.abs(denom) < 1e-10) return 0
  return (wSum * wxySum - wxSum * wySum) / denom
}

// Byte-identical to dynastyScore.js.
function stdDev(values) {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * Career trajectory — weighted linear-regression slope over PPG, normalised.
 *
 * @param {number[]} ppgs  PPG per qualifying season, oldest → newest (GP >= 8).
 * @returns {{ slope: number|null, normalizedSlope: number|null }}
 *          Both null when fewer than 2 seasons, or the result is non-finite.
 *
 * Normalisation: slope / max(meanPPG, 4). dynastyScore.js uses an unfloored
 * `slope / meanPPG`; the 4.0 floor is a projection-specific stability guard for
 * very-low-mean players (it changes nothing for meanPPG >= 4, which is
 * essentially every qualifying veteran).
 */
export function computeTrajectory(ppgs) {
  if (!Array.isArray(ppgs) || ppgs.length < 2) {
    return { slope: null, normalizedSlope: null }
  }
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length
  const xs = ppgs.map((_, i) => i)
  const slope = weightedLinearRegression(xs, ppgs)
  const normalizedSlope = slope / Math.max(meanPPG, 4)
  if (!isFinite(slope) || !isFinite(normalizedSlope)) {
    return { slope: null, normalizedSlope: null }
  }
  return { slope, normalizedSlope }
}

/**
 * Consistency — 100 − coefficient-of-variation × 100, clamped [0, 100].
 * Byte-identical to dynastyScore.js's consistency sub-score.
 *
 * @param {number[]} ppgs  PPG per qualifying season (GP >= 8).
 * @returns {{ consistencyScore: number|null }}
 *          consistencyScore is null when fewer than 3 seasons (dynastyScore.js
 *          defaults to 50 internally; the projection uses a null sentinel
 *          instead of shipping a fake value).
 */
export function computeConsistency(ppgs) {
  if (!Array.isArray(ppgs) || ppgs.length < 3) return { consistencyScore: null }
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length
  const cv = meanPPG > 0 ? stdDev(ppgs) / meanPPG : 1
  const consistencyScore = Math.max(0, Math.min(100, 100 - cv * 100))
  return { consistencyScore }
}
```

`regressionSignals.js` has **no imports** — no circular-dependency risk.

Add to `seasonProjection.js` imports:

```js
import { computeTrajectory, computeConsistency } from './regressionSignals'
```

---

## Per-signal spec — Consistency (Pattern B, modulates Step 5)

### 1. Pipeline location

Inside **Step 5 (Regression)**. The existing bucket `if/else` chain is renamed
to produce `regressionFactorRaw`; consistency then modulates it into the final
`regressionFactor`. Mirrors how Step 4 produces `shareTrendRaw` →
`shareTrendMultiplier`.

### 2. Numerical effect

Consistency **dampens** the regression correction for steady producers; it
never amplifies it. The existing regression effect is the **baseline** —
preserved byte-for-byte for erratic players and for players with < 3 qualifying
seasons.

```js
regressionFactor = 1.0 + (regressionFactorRaw - 1.0) * consistencyScale
```

`consistencyScale ∈ {0.50, 0.80, 1.00}` — `1.00` = full (existing) regression,
lower = dampened. Dampen-only, mirroring B1a's share-volatility modulation
(`entrenched` 1.00 = baseline, never amplifies).

### 3. Threshold mapping

`consistencyScore` is 0–100 (`100 − CV×100`). Three bands:

| `consistencyScore` | `consistencyBand` | `consistencyScale` | Effect on regression |
|---|---|---|---|
| ≥ 80 | `steady` | 0.50 | deviation from 1.0 halved — regress half as much |
| 60 – 79 | `moderate` | 0.80 | deviation × 0.80 |
| < 60 | `erratic` | 1.00 | full regression — **byte-identical to today** |
| `null` (< 3 seasons) | `null` | 1.00 | full regression — **byte-identical to today** |

Worked example: an outlier-high season → `regressionFactorRaw = 0.88`. A
`steady` player: `regressionFactor = 1.0 + (0.88−1.0)×0.50 = 0.940` — the −12%
haircut becomes −6%. An `erratic` player keeps `0.88`.

### 4. Interactions

- **Existing Step 5 buckets:** the `1.35× / 0.65×` thresholds and the
  `0.88 / 0.95 / 1.05 / 1.12` values are **unchanged**. Consistency only scales
  the resulting factor's deviation from 1.0. Transparent: `regressionFactorRaw`
  is recorded alongside the modulated `regressionFactor` (B1b
  `collegeBase`/`collegeMult` precedent).
- **`isTdReliant` (B1b):** both lean toward more regression, but via different
  mechanisms — `isTdReliant` is a flat `×0.93` inside `combinedNewFactor`;
  consistency modulates `regressionFactor`. No double-count. They usually
  *align* (TD-reliant boom/bust scoring → high CV → `erratic` → full
  regression + `×0.93`), which is correct. A rare TD-reliant-but-`steady`
  player still gets the `×0.93`; their `regressionFactor` is merely dampened —
  fine.
- **Share-volatility (B1a):** non-redundant. Share-volatility measures noise in
  opportunity *share* and modulates *share-trend*; consistency measures noise
  in fantasy *output* and modulates *regression*. A goal-line back can have an
  entrenched role (stable share) but boom/bust PPG (erratic consistency) — the
  two signals correctly diverge.
- **Confidence label:** **unchanged.** Per B1a's path-(a) precedent, consistency
  affects PPG only (via regression), never the `confidence` label. Not
  revisited — see Open Question Q2.

### 5. Fallback

`qualifying.length < 3` → `computeConsistency` returns `{ consistencyScore: null }`
→ `consistencyBand = null`, `consistencyScale = 1.00`, `regressionFactor ===
regressionFactorRaw` (existing effect, byte-identical). No fake value shipped.

### 6. `factors` keys (4 new + 1 repurposed)

| Key | Type | Value |
|---|---|---|
| `consistencyScore` | number (integer) \| null | 0–100 score; `null` when < 3 seasons |
| `consistencyBand` | string \| null | `steady` / `moderate` / `erratic`, or `null` |
| `consistencyScale` | number (3 dp) | 0.50 / 0.80 / 1.00 |
| `regressionFactorRaw` | number | the bucket value (0.88 / 0.95 / 1.00 / 1.05 / 1.12) |
| `regressionFactor` | number (3 dp) | **repurposed** — now the consistency-modulated value (was the bucket value) |

### 7. `adjustmentSummary`

```js
if (consistencyBand === 'steady' && regressionFactorRaw !== 1.0)
  adjustmentSummary.push('Steady producer — regression softened')
```

Fires only when the player is steady **and** there was a regression to soften
(mirrors B1a's `volatile && shareTrendRaw !== 1.0` line). No line for
`erratic` — that is the unchanged baseline, not a notable event.

---

## Per-signal spec — Trajectory (Pattern A, new Step 5d)

### 1. Pipeline location

A new **Step 5d**, immediately after Step 5c. It groups with the other
PPG-trend / recent-form multipliers (momentum 5b, breakout/bounce/TD 5c) that
feed `combinedNewFactor`. Not Step 2 (it is not a base-PPG re-weighting) and not
Step 5 (regression is mean-reversion — a different concept; trajectory is
directional).

### 2. Numerical effect

A flat multiplier:

```js
trajectoryFactor = trajectoryNormalized == null
  ? 1.00
  : clamp(1.0 + trajectoryNormalized * 0.35, 0.93, 1.07)
```

Range **[0.93, 1.07]** (±7%). Linear, not bucketed — trajectory is genuinely
continuous, and keeping it continuous makes it *complementary* to momentum's
coarse 5-bucket label rather than a redundant second bucketing (see
interactions).

### 3. Normalisation

`computeTrajectory` returns `normalizedSlope = slope / max(meanPPG, 4)`, where
`slope` is the byte-identical `weightedLinearRegression` over
`(seasonIndex, PPG)` pairs. The `max(…, 4)` denominator floor is the stability
guard the brief requires — without it a sub-4-PPG-mean player (a deep backup
with one good stretch) produces an unstable ratio. The floor changes nothing
for `meanPPG ≥ 4` (essentially every qualifying veteran). The `× 0.35`
coefficient maps a `normalizedSlope` of ±0.20 (a clearly rising/falling career)
to the ±7% cap; the `clamp` is the real guardrail against any residual
instability.

Coefficient rationale: a steadily rising career (e.g. 10 → 12 → 14 PPG) yields
`normalizedSlope ≈ 0.167` → `trajectoryFactor ≈ 1.058`; a steep riser caps at
`1.07`; a clear decliner caps at `0.93`.

### 4. Interactions

- **Momentum (B1a) — kept both active, deliberately.** Both read the PPG trend,
  so there is genuine overlap — which is why trajectory's range is held to a
  modest ±7% (vs momentum's ±8%). They are *not* redundant: momentum is a
  **recent-window** signal (last 4 seasons, 2-vs-2, 5 discrete buckets, requires
  ≥ 4 seasons); trajectory is a **whole-career** signal (all qualifying
  seasons, recency-weighted regression, continuous, requires ≥ 2). For a
  long-career player they diverge meaningfully — e.g. a 7-year vet who declined
  for five years then posted two strong ones reads `accelerating` on momentum
  but flat/negative on trajectory. Composition is plain multiplication inside
  `combinedNewFactor`; the combined trend swing is `[0.92×0.93, 1.08×1.07] =
  [0.856, 1.156]` (~±15%), and the `combinedNewFactor` clamp bounds any pile-up
  (see Stacking).
- **`isBreakout` (B1b):** a young breakout usually also has a rising trajectory
  — reinforcing, which is correct (a genuine ascending breakout *should*
  project high). Both sit in `combinedNewFactor`; the `[0.78, 1.30]` clamp caps
  the stack.
- **Share-trend (Step 4):** different domains — share-trend is opportunity
  share, trajectory is fantasy output. They compose multiplicatively with no
  special-casing. Reinforcing (efficient ascending player: share ↑ + output ↑)
  and offsetting (empty volume: share ↑ + output flat) both yield sensible
  outcomes.

### 5. Fallback

`qualifying.length < 2` (or a non-finite result) → `computeTrajectory` returns
`{ slope: null, normalizedSlope: null }` → `trajectoryFactor = 1.00`,
`trajectoryNormalized = null`.

### 6. `factors` keys (2 new)

| Key | Type | Value |
|---|---|---|
| `trajectoryFactor` | number (3 dp) | 0.93–1.07; `1.0` when < 2 seasons |
| `trajectoryNormalized` | number (3 dp) \| null | normalised slope; `null` when < 2 seasons |

### 7. `adjustmentSummary`

```js
if (trajectoryFactor > 1.03) adjustmentSummary.push('Career trajectory rising ↑')
if (trajectoryFactor < 0.97) adjustmentSummary.push('Career trajectory declining ↓')
```

---

## Code changes — exact placement

### Step 5 restructure (consistency)

Current Step 5 (code lines ~213–223) computes `careerAvg`, `lastPPG`,
`outlierRatio`, then a `let regressionFactor` bucket chain. Replace with:

```js
// ── Step 5: Regression to mean (consistency-modulated) ──────────────────
const careerAvg = qualifying.reduce((a, s) => a + s.ppg, 0) / qualifying.length
const ppgs = qualifying.map(s => s.ppg)          // oldest → newest, all GP>=8
const lastPPG = qualifying[qualifying.length - 1].ppg
const outlierRatio = lastPPG / Math.max(careerAvg, 1)

let regressionFactorRaw
if      (outlierRatio > 1.35) regressionFactorRaw = 0.88
else if (outlierRatio > 1.15) regressionFactorRaw = 0.95
else if (outlierRatio < 0.65) regressionFactorRaw = 1.12
else if (outlierRatio < 0.85) regressionFactorRaw = 1.05
else                          regressionFactorRaw = 1.00

// Consistency dampens the regression correction for steady producers; erratic
// players (and < 3-season players) keep the full, byte-identical correction.
const { consistencyScore } = computeConsistency(ppgs)
const consistencyBand = consistencyScore == null ? null
  : consistencyScore >= 80 ? 'steady'
  : consistencyScore >= 60 ? 'moderate'
  : 'erratic'
const consistencyScale = ({ steady: 0.50, moderate: 0.80, erratic: 1.00 })[consistencyBand] ?? 1.00
const regressionFactor = 1.0 + (regressionFactorRaw - 1.0) * consistencyScale
```

Two notes for the implementer:
- **`const ppgs` moves here from Step 5b.** It is currently declared in Step 5b
  (`const ppgs = qualifying.map(s => s.ppg)`). Move that declaration up into
  Step 5 as shown, and **delete** the line from Step 5b. Step 5b's
  `computeMomentum(ppgs, careerAvg)` then references the Step 5 `ppgs`. This is
  a pure relocation — identical value, zero behaviour change.
- `regressionFactor` changes from `let` (bucket) to `const` (modulated). The
  bucket result is now `let regressionFactorRaw`.

### New Step 5d (trajectory)

Insert immediately after Step 5c (after the `tdRelianceFactor` line, code ~255):

```js
// ── Step 5d: Trajectory multiplier ──────────────────────────────────────
const { slope: trajectorySlope, normalizedSlope: trajectoryNormalized } = computeTrajectory(ppgs)
const trajectoryFactor = trajectoryNormalized == null
  ? 1.00
  : clamp(1.0 + trajectoryNormalized * 0.35, 0.93, 1.07)
```

(`trajectorySlope` is destructured for clarity but not stored in `factors` —
`trajectoryNormalized` is the position-comparable signal that is recorded.)

### Combine line

```js
// ── Combine ─────────────────────────────────────────────────────────────
// Six new PPG multipliers (B1a: qbQuality, momentum; B1b: breakout, bounceBack,
// tdReliance; B2: trajectory) share one clamp. Post-B2 natural range is
// [0.756, 1.376]; the [0.78, 1.30] clamp is now a genuine CAP that binds for
// extreme stackers — not a never-bind guardrail. Do not widen it further.
const combinedNewFactor = clamp(
  qbQualityFactor * momentumFactor * breakoutFactor * bounceBackFactor
    * tdRelianceFactor * trajectoryFactor,
  0.78, 1.30
)
```

The `rawPPG` line is unchanged — `regressionFactor` (now modulated) and
`combinedNewFactor` (now 6 factors) flow through exactly as before.

---

## Stacking analysis

### Factor envelopes (post-B2)

| Factor / group | Range | Note |
|---|---|---|
| `ageDelta` | [0.80, 1.10] | unchanged |
| `shareTrendMultiplier` | [0.92, 1.08] | unchanged |
| `regressionFactor` | [0.88, 1.12] | **modulation only narrows it per-player** — `erratic` players still reach the extremes, so the union envelope is unchanged |
| `teamFactor` | [0.92, 1.075] | unchanged |
| `depthFactor` | [0.68, 1.05] | unchanged |
| `combinedNewFactor` | clamped [0.78, 1.30] | now 6 factors; natural range [0.756, 1.376] |

### `combinedNewFactor` — clamp decision

Six-factor natural product: min `0.95×0.92×1.0×1.0×0.93×0.93 = 0.756`, max
`1.05×1.08×1.08×1.05×1.0×1.07 = 1.376`. The existing **`[0.78, 1.30]` clamp is
kept** — it is **not widened**.

Rationale: B1a/B1b framed this clamp as a guardrail that "essentially never
binds." With six correlated factors that is no longer true, and chasing the
natural range with an ever-widening clamp is the ratchet the brief warns
against. Instead, **reframe it honestly as a cap**: a deliberate ceiling of
+30% / floor of −22% on the *combined new-factor group*. It binds only for
extreme stackers — a young breakout with accelerating momentum, a strong
trajectory and an elite QB1 — i.e. exactly the over-hyped players where the
model should stay humble. Keeping the cap fixed (rather than widening) is the
correct call **and** sets the right precedent: future batches add factors
*inside* the cap, they do not move it.

### Cumulative envelope

Full product min/max:
`0.80×0.92×0.88×0.92×0.68×0.78 = 0.316` … `1.10×1.08×1.12×1.075×1.05×1.30 =
1.952`. **Identical to post-B1b** — because the `combinedNewFactor` clamp is
unchanged and consistency only *narrows* `regressionFactor`. **B2 adds zero
width to the cumulative multiplier envelope.** The output `clamp(rawPPG, 0, 40)`
is unchanged and continues to bound the result. No new global clamp.

---

## Implementation order

Run `npm run build` after each numbered step.

1. **Create `src/utils/regressionSignals.js`** with both helpers + header
   comment.
2. **Add the import** to `seasonProjection.js`.
3. **Consistency** — restructure Step 5 (move `ppgs` up from Step 5b, delete the
   old Step 5b `ppgs` line, rename the bucket result to `regressionFactorRaw`,
   add the consistency block, derive the modulated `regressionFactor`).
4. **Trajectory** — add the Step 5d block after Step 5c.
5. **Combine line** — add `trajectoryFactor`; update the comment.
6. **`factors`** — add the 6 new keys; change `regressionFactor` storage to the
   modulated value (round to 3 dp).
7. **`adjustmentSummary`** — add the 3 new lines.
8. **README** — apply every edit in the README updates section.
9. Final `npm run build` — no new warnings.

---

## `factors` — full additions

Add to the veteran-path return `factors` object (post-B1b: 24 keys → post-B2:
30):

```js
// consistency
consistencyScore:    consistencyScore != null ? Math.round(consistencyScore) : null,
consistencyBand,
consistencyScale:    Math.round(consistencyScale * 1000) / 1000,
regressionFactorRaw,
// regressionFactor (existing key) — now stores the MODULATED value:
regressionFactor:    Math.round(regressionFactor * 1000) / 1000,
// trajectory
trajectoryFactor:      Math.round(trajectoryFactor * 1000) / 1000,
trajectoryNormalized:  trajectoryNormalized != null ? Math.round(trajectoryNormalized * 1000) / 1000 : null,
```

`regressionFactor` was previously stored unrounded as the bucket value; it is
now the modulated value, rounded to 3 dp. `regressionFactorRaw` preserves the
bucket value for snapshot backtesting (B1b `collegeBase` precedent).

---

## Backward compatibility

- Veteran `factors` grows from 24 keys to 30. All additions are
  backward-compatible — `projectionSnapshot.js` embeds `projection` verbatim
  with no whitelist.
- **Semantic shift:** `factors.regressionFactor` previously equalled the raw
  bucket value; post-B2 it equals the consistency-modulated value. For
  `erratic` / `< 3`-season players it is identical to the old value. Backtests
  spanning the B2 boundary should read `regressionFactorRaw` for an
  apples-to-apples comparison of the raw regression signal.
- Rookie `factors` (18 keys) is **unchanged** — rookie path out of scope.

---

## Edge cases

- **< 2 qualifying seasons:** trajectory → `null` / factor `1.00`.
- **< 3 qualifying seasons:** consistency → `null` band, scale `1.00`,
  regression unmodulated (byte-identical to today).
- **Near-zero `meanPPG`:** trajectory denominator floored at `4.0`; consistency
  CV uses `meanPPG > 0 ? … : 1` (→ `consistencyScore` 0 → `erratic` → scale
  1.0). Both degrade safely.
- **Non-finite slope:** `computeTrajectory` guards with `isFinite` and returns
  `null` → factor `1.00`.
- **Flat career (identical PPG every season):** slope 0 → `trajectoryFactor`
  1.00; CV 0 → `consistencyScore` 100 → `steady`.
- **Two-season vet:** `weightedLinearRegression` reduces to `ppg₂ − ppg₁`
  (a finite, sensible slope) — trajectory applies; consistency does not (< 3).

---

## Acceptance criteria

- [ ] `src/utils/regressionSignals.js` exists, exports `computeTrajectory` and
      `computeConsistency`; `weightedLinearRegression` / `stdDev` / CV formula
      byte-identical to `dynastyScore.js`; header comment documents the
      duplication.
- [ ] Step 5 produces `regressionFactorRaw` (bucket) and a consistency-modulated
      `regressionFactor`; `ppgs` is declared once, in Step 5.
- [ ] An `erratic` or `< 3`-season player has `regressionFactor ===
      regressionFactorRaw` (existing effect preserved exactly).
- [ ] A `steady` player with a non-neutral bucket has `regressionFactor`
      strictly closer to 1.0 than `regressionFactorRaw`.
- [ ] Step 5d sets `trajectoryFactor ∈ [0.93, 1.07]`; `trajectoryFactor = 1.0`
      and `trajectoryNormalized = null` for `< 2`-season players.
- [ ] `combinedNewFactor` multiplies in `trajectoryFactor`; clamp stays
      `[0.78, 1.30]`.
- [ ] Veteran `factors` has the 6 new keys with the types/sentinels above;
      `regressionFactor` holds the modulated value.
- [ ] `rookieProjection`, `dynastyScore.js`, `momentum.js`,
      `projectionSignals.js`, `teamContext.js` are unchanged.
- [ ] All README edits applied.
- [ ] `npm run build` passes with no new warnings.

---

## Out of scope — do not touch

- `rookieProjection` and the rookie path entirely.
- `dynastyScore.js` (including its inline trajectory/consistency logic — it
  keeps its own copy; de-duplication is a future task), `collegeMetrics.js`,
  `teamContext.js`, `momentum.js`, `projectionSignals.js`.
- Dynasty scoring, role ranks, positional ranks, every other consumer.
- The Step 5 regression *buckets* (`1.35× / 0.65×` thresholds, `0.88`–`1.12`
  values) — unchanged; consistency only scales the resulting deviation.
- The `confidence` label logic — unchanged.
- The `combinedNewFactor` clamp bounds `[0.78, 1.30]` — kept, not widened.
- `App.jsx`, `projectionSnapshot.js`, cache TTLs, dependencies, API calls.

---

## README updates

Apply all of the following to `README.md`. Each is mechanical.

**1. File-map line for `seasonProjection.js` (~line 62).** If the line states
an explicit factor count (`N-factor veteran pipeline`), change `N` to `N+1` —
B2 adds the trajectory factor; consistency is a regression *modulator*, not a
standalone factor, so it does not increment the count.

**2. Veteran pipeline heading (~line 653).** Change `### Veteran pipeline (10
steps)` to `### Veteran pipeline (11 steps)`.

**3. Regression row in the veteran pipeline table (~line 662).** Replace:

- *Before:* `| 4 | **Regression** | Last PPG vs career avg: outlier high (>1.35×) → ×0.88; outlier low (<0.65×) → ×1.12 |`
- *After:* `| 4 | **Regression** | Last PPG vs career avg: outlier high (>1.35×) → ×0.88; outlier low (<0.65×) → ×1.12. Swing dampened by consistency (steady ×0.50, moderate ×0.80, erratic ×1.00) — steady producers regress less |`

**4. New trajectory row.** Insert immediately after the `5c` row (~line 664):

```
| 5d | **Trajectory** | Weighted linear-regression slope over all career PPG, normalised by mean PPG: `clamp(1 + normalisedSlope × 0.35, 0.93, 1.07)`; requires ≥ 2 qualifying seasons (else neutral) |
```

**5. `combinedNewFactor` note (~line 670).** Replace the whole paragraph:

- *Before:* `Steps 5, 5c and 7b feed `combinedNewFactor = clamp(momentumFactor × qbQualityFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor, 0.78, 1.30)` — a guardrail bounding the five new PPG multipliers; its natural range is [0.813, 1.286] so it essentially never binds.`
- *After:* `Steps 5, 5c, 5d and 7b feed `combinedNewFactor = clamp(momentumFactor × qbQualityFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor × trajectoryFactor, 0.78, 1.30)` — a cap on the six new PPG multipliers. Post-B2 the natural range is [0.756, 1.376], so the clamp now binds for extreme stackers (roughly the strongest/weakest 1–2% of players). It is a deliberate ceiling, not a never-bind guardrail; future batches add factors inside it rather than widening it.`

**6. Dynasty "Component scores" section — projection-reuse note.** After the
Component scores table (~after line 575, before "Opportunity quality
modifiers"), add:

```
> **Projection reuse:** the Trajectory slope and the Consistency (CV) sub-score are recomputed by the season-projection veteran pipeline via `src/utils/regressionSignals.js` — trajectory as a PPG multiplier (Step 5d), consistency as a regression-strength modulator (Step 4). See Next-season projections.
```

**7. `factors` key list.** The README does **not** enumerate the `factors`
object's keys anywhere — there is no key list to extend. No edit needed for
this item (stated explicitly per the brief).

No other README sections require changes — the rookie path section, the
dynasty label table, and the CFBD/college sections are all untouched by B2.

---

## Open questions — confirm before / during implementation

### Q1 — `combinedNewFactor` reframed from guardrail to binding cap

B2 keeps the clamp at `[0.78, 1.30]` while the six-factor natural range grows
to `[0.756, 1.376]`, so the clamp now **binds** for extreme stackers (it did
not, by design, in B1a/B1b). The plan argues this is correct — a fixed +30%
ceiling on the combined new-factor group, applied to exactly the over-hyped
players. **Confirm** this is acceptable rather than widening the clamp. (Strong
recommendation: keep it fixed — widening every batch is an unbounded ratchet.)

### Q2 — Consistency is dampen-only, not two-sided

B2 implements consistency so that `steady` players regress **less** and
`erratic` (and `< 3`-season) players keep **today's full** regression — the
existing effect is the baseline and is never amplified. This matches B1a's
share-volatility precedent exactly. The brief's phrasing ("low consistency →
*more aggressive* regression") is satisfied only in the **relative** sense
(erratic regress more than steady), not absolutely. **Confirm** dampen-only is
intended. If the user specifically wants `erratic` players to regress *harder
than today* (`consistencyScale > 1.0` for that band), that is a two-sided
modulation — a larger change to the existing effect and a more complex
precedent; it can be added but should be an explicit decision.

### Q3 — Trajectory normalisation floor

`computeTrajectory` normalises with `slope / max(meanPPG, 4)`;
`dynastyScore.js` uses an unfloored `slope / meanPPG`. The 4.0 floor is a
projection-specific stability guard and changes nothing for `meanPPG ≥ 4`
(essentially every qualifying veteran). **Confirm** the minor, deliberate
divergence from `dynastyScore.js`'s normalisation is acceptable (recommended —
the alternative is an unstable ratio for sub-4-PPG players).

---

## Reference implementations

- **Formulas to port:** `dynastyScore.js` `computeDynastyScore` — the
  `weightedLinearRegression` helper + the "B. Trajectory" block (slope,
  `normalizedSlope`), and the `stdDev` helper + the consistency sub-score
  (`clamp(100 − CV×100, 0, 100)`).
- **Helper-module + duplication-comment pattern:** `src/utils/momentum.js`
  (B1a), `src/utils/projectionSignals.js` (B1b).
- **Reliability-signal-modulates-directional-factor pattern:** Step 4's
  `shareVolatilityScale` modulating `shareTrendRaw` → `shareTrendMultiplier`
  (B1a) — consistency/regression mirrors it exactly.
- **Existing-key-repurpose + raw-companion pattern:** B1b's `collegeMult`
  (composite) / `collegeBase` (raw) — mirrored here by `regressionFactor`
  (modulated) / `regressionFactorRaw` (bucket).

## Documentation

README.md — all edits enumerated in the README updates section. No other
documentation files.
