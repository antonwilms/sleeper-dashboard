# Projection B1a — Wire four independent signals into the veteran pipeline

## Goal

Add four already-computed signals to the **veteran** projection pipeline in
`src/utils/seasonProjection.js` (`computeNextSeasonProjection`): QB1 quality,
multi-season momentum, injury-absence shape, and share volatility. Each is a
small, independent adjustment with a defined numerical effect. Every signal
records a structured numeric contribution into the returned `factors` object so
the daily projection snapshot (Thread A) captures it for future backtesting.
The rookie path (`rookieProjection`) is **out of scope** (that is B1b).

---

## Files to create

| Path | Purpose |
|------|---------|
| `src/utils/momentum.js` | Standalone `computeMomentum(ppgs, meanPPG)` — multi-season momentum signal, mirroring the inline logic in `dynastyScore.js` so the projection can consume it without importing dynasty scoring. |

## Files to modify

| Path | What changes |
|------|--------------|
| `src/utils/seasonProjection.js` | `computeNextSeasonProjection` only. New import of `computeMomentum`. New `qbQualityByTeam` parameter. Steps 4 and 6 modified; momentum block added after Step 5; QB1 block added after Step 7; combine line and `factors`/`adjustmentSummary` extended. **`rookieProjection` is not touched.** |
| `src/App.jsx` | **GATED — see Open Questions Q1.** Two-line change: pass `qbQualityByTeam` into the `computeNextSeasonProjection` call (App.jsx ~878-882) and add it to the `seasonProjections` useMemo dependency array (App.jsx ~903). Do **not** make this change until Q1 is confirmed. seasonProjection.js works correctly without it (QB1 signal stays inert). |

---

## Important pre-read notes for the implementer

1. **Step numbering.** The original task brief numbers the pipeline
   `base PPG → age curve → share trend → regression → projected games → team
   offense → depth chart`. The **code** numbers them differently — its
   `── Step N ──` comments are: Step 1 qualifying seasons, Step 2 base PPG,
   Step 3 age curve, Step 4 share trend, Step 5 regression, Step 6 durability
   (projected games), Step 7 team + depth. **This task file uses the code's
   numbering throughout.** "Projected games" = code Step 6. "Team offense" =
   code Step 7.

2. **`computeQBQualityByTeam` real signature.** It is
   `computeQBQualityByTeam(playerRows, depthMap = null)` and returns
   `{ [nfl_team_abbr]: qualityScore }` where `qualityScore` is 0–100 (the
   team QB1's dynasty score, falling back to `ktcValue/100`, falling back to
   50). It is **not** `computeQBQualityByTeam(careerStats, ...)`. Do not call
   it from `seasonProjection.js` — the already-computed map is passed in as a
   parameter (see QB1 section).

3. **Do not edit `dynastyScore.js`, `teamContext.js`, the rookie path, dynasty
   scoring, role ranks, positional ranks, or any other consumer.** Existing
   factor effects and clamps stay unchanged except for the one deliberate,
   sanctioned modulation of the share-trend multiplier described in Item 4.

---

## Decisions resolved (read before implementing)

### Momentum exposure — DECISION: extract a new helper module (`momentum.js`)

Three options were considered:

- **Piggyback** (require the dynasty result as an input to
  `computeNextSeasonProjection`): rejected. It forces an App.jsx signature
  change *and* couples the projection to dynasty output shape.
- **Inline duplication** (recompute the formula directly inside
  `seasonProjection.js`): viable, but buries a reusable formula in one file.
- **Extract a helper** (`src/utils/momentum.js`): chosen.

Rationale: momentum is currently computed inline inside `computeDynastyScore`
(`dynastyScore.js`, the "Momentum signal" block, ~lines 833-845). We are barred
from modifying `dynastyScore.js`, so a *truly* shared single source of truth is
not achievable in this batch — `dynastyScore.js` keeps its own copy either way.
Given that, the extracted module's value is forward-staging: it gives the
formula one documented, canonical home so a **future** task can refactor
`dynastyScore.js` to import it with a one-line change. `momentum.js` is a pure
function with no imports — **no circular-dependency risk** (`seasonProjection.js`
already imports from `dynastyScore.js`; this adds an independent third module).

**Known limitation to record:** after this task there are two copies of the
momentum formula (the new `momentum.js` and the untouched inline copy in
`dynastyScore.js`). They must stay in sync until a future task de-duplicates.
`momentum.js` must carry a header comment saying so.

### Share-volatility path — DECISION: path (a), modulate the share-trend multiplier magnitude

Path (b) (downgrade the confidence label) was rejected. Path (a) is chosen
because:

1. **Backtestability.** The cross-cutting requirement wants a *numeric*
   per-signal contribution in `factors`. Path (a) yields a clean numeric
   `shareVolatilityScale`; path (b) only mutates a categorical string.
2. **Statistical correctness.** A volatile share series makes the recent
   share trend a noisier estimator of next season — down-weighting its swing
   is the principled treatment.
3. **Lower blast radius.** Path (a) leaves the `confidence` label logic
   untouched (the constraint only permits confidence changes under path (b)).

Note: path (a) deliberately modifies the magnitude of the **existing**
share-trend factor. This is sanctioned — it is exactly what brief Item 4(a)
specifies. For `entrenched` players the share-trend multiplier is **identical
to today** (`scale = 1.0`); modulation only ever *shrinks* the swing toward
1.0 for `moderate`/`volatile` players. The raw pre-modulation value is still
recorded (`factors.shareTrendRaw`) so no information is lost.

### QB1 quality location — DECISION: new dedicated step after Step 7, ±5% multiplier

`computeQBQualityByTeam` is App.jsx pipeline step 3; its output map
`qbQualityByTeam` is already in scope at the `computeNextSeasonProjection`
call site (App.jsx line ~878, inside the `seasonProjections` useMemo, which
runs after `qbQualityByTeam` is defined at App.jsx ~785). It is simply not
passed in today.

Location choice — a **new step (Step 7b)**, not folded into Step 1 base PPG or
Step 7 team offense:

- *Not Step 1 (base PPG):* base PPG is historical production; QB1 quality is a
  forward-looking environmental signal — conflating them is wrong.
- *Not folded into Step 7 (team offense):* the team-offense factor is a
  *backward-looking* rank of last season's total points. QB1 quality is a
  *forward-looking* signal (it reads the QB1's dynasty score, which is itself
  forward-looking). They are correlated but distinct; folding them hides the
  attribution. A dedicated step keeps a clean `factors` key.
- **Double-counting with team-offense rank is real but bounded** — a good QB
  drives a good offense, so the two factors partially overlap. This is why the
  QB1 multiplier is deliberately the **smallest** new factor (±5%, vs ±8% for
  momentum and share trend), and is **centred on a neutral QB** (`quality = 50
  → multiplier 1.0`). The modest range is the mitigation; do not widen it.

---

## New module: `src/utils/momentum.js`

```js
/**
 * src/utils/momentum.js — Multi-season production-momentum signal.
 *
 * Compares the most recent two-season average PPG against the prior
 * two-season average, normalised by mean PPG.
 *
 * NOTE: this mirrors the inline momentum computation in dynastyScore.js
 * (computeDynastyScore, "Momentum signal" block). dynastyScore.js is
 * intentionally left untouched in this task; a future task should refactor
 * it to import this function so the two copies cannot drift. Keep the
 * formula and the label thresholds here byte-identical to that block.
 */

/**
 * @param {number[]} ppgs    PPG per qualifying season, oldest → newest
 *                           (a qualifying season = gamesPlayed >= 8).
 * @param {number}   meanPPG Mean of all qualifying-season PPGs.
 * @returns {{ momentum: number|null, momentumLabel: string|null }}
 *          Both null when fewer than 4 qualifying seasons exist.
 */
export function computeMomentum(ppgs, meanPPG) {
  if (!Array.isArray(ppgs) || ppgs.length < 4) {
    return { momentum: null, momentumLabel: null }
  }
  const n = ppgs.length
  const recentAvg = (ppgs[n - 1] + ppgs[n - 2]) / 2
  const priorAvg  = (ppgs[n - 3] + ppgs[n - 4]) / 2
  const momentum  = (recentAvg - priorAvg) / Math.max(meanPPG, 1)

  let momentumLabel
  if      (momentum >  0.20) momentumLabel = 'accelerating'
  else if (momentum >  0.05) momentumLabel = 'improving'
  else if (momentum >= -0.05) momentumLabel = 'stable'
  else if (momentum >= -0.20) momentumLabel = 'slowing'
  else                        momentumLabel = 'decelerating'

  return { momentum, momentumLabel }
}
```

This is a verbatim port of the `dynastyScore.js` momentum block. Do not change
the thresholds.

---

## `computeNextSeasonProjection` — new signature

Append `qbQualityByTeam` as the final parameter, defaulting to `null` so the
function is safe to call without it:

```js
export function computeNextSeasonProjection(
  playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, historicalShares, depthMap,
  teamContext, scoringSettings, ktcMap, collegeStats,
  currentSeason, qbQualityByTeam = null
)
```

Add to the imports at the top of the file:

```js
import { computeMomentum } from './momentum'
```

---

## Algorithm — the four items

All four apply to the **veteran path only** (the code below the rookie-routing
early-return). Do not add any of this to `rookieProjection`.

### Item 1 — Momentum multiplier (new Step 5b)

**Where:** a new block immediately after Step 5 (regression). It reuses
`careerAvg`, which Step 5 already computes, as the `meanPPG` argument — so it
must come after Step 5.

**Compute:**

```js
// ── Step 5b: Momentum multiplier ────────────────────────────────────────
const ppgs = qualifying.map(s => s.ppg)          // oldest → newest, all GP>=8
const { momentum, momentumLabel } = computeMomentum(ppgs, careerAvg)
const momentumFactor = ({
  accelerating: 1.08,
  improving:    1.04,
  stable:       1.00,
  slowing:      0.96,
  decelerating: 0.92,
})[momentumLabel] ?? 1.00
```

`qualifying` is already oldest→newest (built from `allSeasons.sort()`). Its
`>= 8` games threshold matches `dynastyScore.js`'s `seasonHistory`, so
`ppgs` and `careerAvg` reproduce the dynasty momentum inputs exactly.

| `momentumLabel` | `momentumFactor` |
|---|---|
| accelerating | 1.08 |
| improving | 1.04 |
| stable | 1.00 |
| slowing | 0.96 |
| decelerating | 0.92 |
| `null` (< 4 qualifying seasons) | 1.00 |

**Interaction with existing factors:** none direct. Momentum is its own
multiplicative factor. It is conceptually adjacent to Step 5 regression
(`outlierRatio = lastPPG / careerAvg`) and they can point opposite ways — an
`accelerating` player coming off a single outlier season gets a momentum boost
*and* a regression haircut. This is intentional: regression measures one
season vs the career mean; momentum measures a two-season trend vs the
two-season prior. Compose by plain multiplication; do not special-case.

**Fallback:** `< 4` qualifying seasons (includes single-season players) →
`computeMomentum` returns `{ null, null }` → `momentumFactor = 1.0`.

**`factors` keys:** `momentumFactor` (number, 3 dp), `momentumLabel`
(string, or `null` sentinel).

### Item 2 — Absence-shape refinement (inside Step 6)

**Where:** inside Step 6 (durability / projected games), **after** the existing
`injurySeasons` multiplier and **before** the existing
`clamp(avgGames, 8, 17)`.

**Background:** the `availability` object lives at
`careerStats[season][playerId].availability` and was added in Phase 5
(season-totals schemaVersion 2). Shape (from `sleeperStats.js`
`computeAvailability`):

```
availability = {
  longestAbsence:      number,   // max single absence-run length, in weeks
  absenceSegments:     Array<{ start: number, end: number, length: number }>,
  firstWeek:           number|null,
  lastWeek:            number|null,
  returnedFromAbsence: boolean,
  absenceCause:        string,
}
```

Pre-Phase-5 season records have **no `availability` field** — treat as
"no absence info".

**The existing binary trigger** (unchanged, keep it):
`injurySeasons = qualifying.filter(s => s.gamesPlayed < 10 && s.dnpWeeks >= 3)`
then `*= 0.78` / `*= 0.88`. It answers *"how many seasons did the player miss
significant time?"* It cannot see the **shape** of those absences, nor any
absence in a season that still cleared 10 games.

**The absence-shape refinement** adds a multiplier on `avgGames` driven by two
counts over qualifying seasons that carry `availability` data:

```js
// ── Step 6 (continued): Absence-shape refinement ────────────────────────
const availSeasons = qualifying
  .map(s => careerStats?.[s.season]?.[playerId]?.availability)
  .filter(Boolean)

let absenceShapeFactor = 1.0
let absenceShape = null   // sentinel when no Phase-5 data on any season

if (availSeasons.length > 0) {
  let recurringAbsenceSeasons = 0   // seasons with >= 2 multi-week absence runs
  let hiddenAbsenceSeasons    = 0   // GP>=10 seasons (binary trigger missed) w/ a long absence
  qualifying.forEach(s => {
    const a = careerStats?.[s.season]?.[playerId]?.availability
    if (!a) return
    const segs = Array.isArray(a.absenceSegments) ? a.absenceSegments : []
    const multiWeekRuns = segs.filter(seg => (seg.length ?? 0) >= 2).length
    if (multiWeekRuns >= 2) recurringAbsenceSeasons += 1
    if (s.gamesPlayed >= 10 && (a.longestAbsence ?? 0) >= 4) hiddenAbsenceSeasons += 1
  })

  if      (recurringAbsenceSeasons >= 2) absenceShapeFactor *= 0.90
  else if (recurringAbsenceSeasons >= 1) absenceShapeFactor *= 0.95
  if      (hiddenAbsenceSeasons >= 2)    absenceShapeFactor *= 0.93
  else if (hiddenAbsenceSeasons >= 1)    absenceShapeFactor *= 0.97

  absenceShapeFactor = clamp(absenceShapeFactor, 0.85, 1.0)
  absenceShape = { recurringAbsenceSeasons, hiddenAbsenceSeasons, seasonsWithData: availSeasons.length }
}

avgGames *= absenceShapeFactor
// existing line follows unchanged:
const projectedGames = Math.round(clamp(avgGames, 8, 17))
```

| Count | Threshold | Effect on `absenceShapeFactor` |
|---|---|---|
| `recurringAbsenceSeasons` | ≥ 2 | ×0.90 |
| `recurringAbsenceSeasons` | == 1 | ×0.95 |
| `hiddenAbsenceSeasons` | ≥ 2 | ×0.93 |
| `hiddenAbsenceSeasons` | == 1 | ×0.97 |
| floor clamp | — | `clamp(.., 0.85, 1.0)` — never below −15% |

**Why this is distinct from the `dnpWeeks >= 3` trigger (no double-count):**

- `hiddenAbsenceSeasons` counts only seasons with `gamesPlayed >= 10`. The
  binary trigger filters on `gamesPlayed < 10`, so it **never fired** on these
  seasons — **zero overlap by construction**. This is the purely-additive part:
  a player who played 13 games but missed one consecutive 4-week block is
  invisible to the binary trigger and is now caught.
- `recurringAbsenceSeasons` keys on **fragmentation** (≥ 2 separate multi-week
  runs), not occurrence. A clean single 5-week absence triggers the binary
  rule but scores **0** here (one run). Three separate 2-week absences also
  trigger the binary rule and score **1** here. So this sub-component
  discriminates *chronic / recurring* injury shape among injury seasons — a
  dimension the binary count is blind to. There is mild magnitude overlap with
  the injury-season multiplier; it is deliberately kept small (≤ 10%) for that
  reason.

**Fallback (pre-Phase-5 seasons / missing data):** if no qualifying season has
an `availability` object, `availSeasons.length === 0` → `absenceShapeFactor`
stays `1.0` and `absenceShape` stays `null`. The existing binary
`injurySeasons` logic still runs independently and is unaffected — because the
absence-shape contribution is a neutral `1.0`, there is **no double-count**.
A player with a *mix* of Phase-5 and pre-Phase-5 seasons simply has the
refinement computed over the Phase-5 subset only (`seasonsWithData` records
how many).

**Interaction with the existing factor in Step 6:** multiplicative and
sequential — existing `injurySeasons` multiplier first, then
`*= absenceShapeFactor`, then the existing `clamp(avgGames, 8, 17)`. The
existing games clamp bounds the result; no new clamp on `projectedGames` is
needed.

**`factors` keys:** `absenceShapeFactor` (number, 3 dp), `absenceShape`
(object `{ recurringAbsenceSeasons, hiddenAbsenceSeasons, seasonsWithData }`,
or `null` sentinel).

> Absence shape affects **`projectedGames`**, not `projectedPPG`. It does **not**
> participate in the PPG multiplier-stacking analysis below.

### Item 3 — Share-volatility modulation (inside Step 4)

**Where:** Step 4 (share trend). `computeShareTrend` already returns
`volatilityLabel` on the same `trend` object the step already uses — **no new
input needed**.

**Replace** the current Step 4 multiplier assignment:

```js
// ── Step 4: Share trend multiplier (volatility-modulated) ───────────────
const trend = computeShareTrend(historicalShares?.[playerId] ?? null)
const shareTrendRaw = ({
  growing:   1.08,
  expanding: 1.04,
  stable:    1.00,
  shrinking: 0.96,
  declining: 0.92,
})[trend?.shareTrendLabel] ?? 1.00

const shareVolatilityLabel = trend?.volatilityLabel ?? null
const shareVolatilityScale = ({
  entrenched: 1.00,
  moderate:   0.80,
  volatile:   0.50,
})[shareVolatilityLabel] ?? 1.00

// Modulate the *deviation from 1.0* — a noisier share series gets a smaller swing.
const shareTrendMultiplier = 1.0 + (shareTrendRaw - 1.0) * shareVolatilityScale
```

| `volatilityLabel` | `shareVolatilityScale` | Effect |
|---|---|---|
| `entrenched` | 1.00 | full swing — identical to today |
| `moderate` | 0.80 | 80% of the swing |
| `volatile` | 0.50 | 50% of the swing |
| `null` (< 2 share seasons → `trend` is `null`) | 1.00 | no-op (`shareTrendRaw` is already 1.00) |

Worked example: a `growing` + `volatile` player → `shareTrendRaw = 1.08`,
`scale = 0.50` → `shareTrendMultiplier = 1.0 + 0.08×0.50 = 1.04`.

**Interaction with the existing factor in Step 4:** this *is* a deliberate
modulation of the existing share-trend factor (the sanctioned design from brief
Item 4(a)). It only ever shrinks the swing toward neutral; `entrenched` players
are unaffected. The raw value is preserved in `factors.shareTrendRaw`.

**Fallback:** `< 2` seasons of share history → `computeShareTrend` returns
`null` → `shareTrendRaw = 1.00`, `shareVolatilityLabel = null`,
`shareVolatilityScale = 1.00`, `shareTrendMultiplier = 1.00`. Neutral.

**`factors` keys:** `shareVolatilityLabel` (string, or `null` sentinel),
`shareVolatilityScale` (number, 3 dp), `shareTrendRaw` (number, 3 dp). The
existing `factors.shareTrend` key continues to record the **applied**
multiplier — which is now the *modulated* value. See "Backward compatibility"
below for the semantic-shift note.

### Item 4 — QB1 quality multiplier (new Step 7b)

**Where:** a new block immediately after Step 7 (team + depth modifiers).

**Compute:**

```js
// ── Step 7b: QB1 quality multiplier (WR/TE/RB only) ─────────────────────
let qbQualityScore  = null
let qbQualityFactor = 1.0
if (position !== 'QB') {
  const q = qbQualityByTeam?.[player.team]
  if (q != null && isFinite(q)) {
    qbQualityScore  = Math.round(q)
    // Neutral QB (quality 50) → 1.0; range strictly [0.95, 1.05] by construction.
    qbQualityFactor = 1.0 + (q - 50) / 100 * 0.10
  }
}
```

| Player position | `q = qbQualityByTeam[team]` | `qbQualityFactor` | `qbQualityScore` |
|---|---|---|---|
| QB | — (not looked up) | 1.0 | `null` |
| WR / TE / RB | resolved 0–100 | `1.0 + (q−50)/100×0.10` → [0.95, 1.05] | `Math.round(q)` |
| WR / TE / RB | unresolved (`null`/missing) | 1.0 | `null` |

The factor is inherently bounded to [0.95, 1.05] because `q ∈ [0, 100]` — no
explicit clamp needed on this factor itself.

**Interaction with the existing factor (Step 7 team offense):** correlated but
not folded together — see the "QB1 quality location" decision above. The ±5%
range (half of momentum's / share-trend's ±8%, centred on a neutral QB) is the
deliberate mitigation for the partial double-count with `teamFactor`. Both are
plain multiplicative factors in the combine line.

**Fallback:** QB position, or `qbQualityByTeam` is `null` (App.jsx wiring not
yet applied — see Q1), or the team has no resolved QB1 → `qbQualityFactor = 1.0`,
`qbQualityScore = null`. The signal is a graceful no-op until App.jsx is wired.

**Uniform treatment of WR/TE/RB:** apply the same ±5% to all three. A reduced
effect for RBs (QB play matters less for a workhorse back) was considered but
rejected for B1a to keep the addition mechanical — see Open Question Q2 if you
want to revisit.

**`factors` keys:** `qbQualityFactor` (number, 3 dp), `qbQualityScore`
(number 0–100 integer, or `null` sentinel).

### Combine line — stacking and the joint clamp

Two of the four signals are **PPG multipliers** (`momentumFactor`,
`qbQualityFactor`). Share volatility modifies the existing
`shareTrendMultiplier` (not a new multiplier); absence shape modifies
`projectedGames` (not PPG). So only two new factors enter the PPG product.

**Replace** the combine line:

```js
// New factors are jointly capped at ±15% as a guardrail (see note below).
const combinedNewFactor = clamp(qbQualityFactor * momentumFactor, 0.85, 1.15)
const rawPPG = basePPG * ageDelta * shareTrendMultiplier * regressionFactor
             * teamFactor * depthFactor * combinedNewFactor
const projectedPPG = clamp(rawPPG, 0, 40)   // existing output clamp, unchanged
```

**Stacking analysis (required by the brief):**

Per-factor ranges — existing: `ageDelta` [0.80, 1.10], `shareTrendMultiplier`
[0.92, 1.08], `regressionFactor` [0.88, 1.12], `teamFactor` [0.92, 1.075],
`depthFactor` [0.68, 1.05]. New: `qbQualityFactor` [0.95, 1.05],
`momentumFactor` [0.92, 1.08].

- The two new factors are each **inherently bounded by construction** (a
  closed-form expression / a discrete label lookup) — neither needs its own
  clamp.
- Their **natural joint range** is `[0.95×0.92, 1.05×1.08] = [0.874, 1.134]`.
- The cumulative all-factor product moves from a pre-B1a worst/best of roughly
  `[0.405, 1.430]` to `[0.354, 1.703]` — a modest widening, still bounded on
  the output side by the **unchanged** `clamp(rawPPG, 0, 40)`.
- **Decision: add a defensive joint clamp** `clamp(qbQualityFactor ×
  momentumFactor, 0.85, 1.15)`. Because the natural joint range [0.874, 1.134]
  sits *inside* [0.85, 1.15], this clamp essentially never binds in practice —
  it is a guardrail, not an active constraint. It is included anyway because it
  (a) gives a single auditable line proving "the new signals jointly cannot
  exceed ±15%", directly satisfying the brief's "no one new signal dominates"
  and "cumulative must not blow past existing bounds" requirements, and (b)
  costs nothing when it does not bind. No global clamp on the *full* cumulative
  product is added — the existing per-step clamps plus the output
  `clamp(rawPPG, 0, 40)` remain sufficient.

**`factors` key:** `combinedNewFactor` (number, 3 dp) — the actually-applied
clamped product, recorded for clean snapshot attribution. In the (practically
unreachable) event the clamp binds, the individual `qbQualityFactor` /
`momentumFactor` keys slightly over-state vs `combinedNewFactor`; this is
acceptable and documented.

---

## `factors` object — exact additions

The veteran-path return currently has:
`{ basePPG, ageDelta, shareTrend, regressionFactor, durabilityFactor,
teamFactor, depthFactor }`. Add these **10** keys (keep existing keys and their
meanings, except `shareTrend` — see note):

| Key | Type | Value / sentinel | Rounding |
|---|---|---|---|
| `momentumFactor` | number | 0.92–1.08; `1.0` when < 4 qualifying seasons | 3 dp |
| `momentumLabel` | string \| null | label, or `null` when < 4 qualifying seasons | — |
| `absenceShapeFactor` | number | 0.85–1.0; `1.0` when no Phase-5 data | 3 dp |
| `absenceShape` | object \| null | `{ recurringAbsenceSeasons, hiddenAbsenceSeasons, seasonsWithData }`, or `null` when no Phase-5 data | — |
| `shareTrendRaw` | number | 0.92–1.08; pre-modulation share-trend multiplier; `1.0` when no trend | 3 dp |
| `shareVolatilityLabel` | string \| null | `entrenched`/`moderate`/`volatile`, or `null` when < 2 share seasons | — |
| `shareVolatilityScale` | number | 1.0 / 0.80 / 0.50; `1.0` when no trend | 3 dp |
| `qbQualityFactor` | number | 0.95–1.05; `1.0` for QBs / unresolved | 3 dp |
| `qbQualityScore` | number \| null | 0–100, or `null` for QBs / unresolved | integer |
| `combinedNewFactor` | number | clamped `qbQualityFactor × momentumFactor` | 3 dp |

`factors.shareTrend` (existing) keeps recording the **applied** multiplier,
which under path (a) is now the volatility-modulated value. Use the existing
`clamp(v, lo, hi)` helper in the file for the joint clamp and the
absence-shape clamp; momentum needs no clamp (discrete lookup).

---

## `adjustmentSummary` — lines to add

Append to the existing `adjustmentSummary` push block (veteran path only),
following the existing arrow-suffixed string style:

```js
if (momentumLabel === 'accelerating' || momentumLabel === 'improving')
  adjustmentSummary.push('Production trending up ↑')
if (momentumLabel === 'slowing' || momentumLabel === 'decelerating')
  adjustmentSummary.push('Production trending down ↓')

if (absenceShapeFactor < 0.97)
  adjustmentSummary.push('Recurring absence pattern ↓')

if (shareVolatilityLabel === 'volatile' && shareTrendRaw !== 1.0)
  adjustmentSummary.push('Volatile role — trend down-weighted')

if (qbQualityFactor > 1.02) adjustmentSummary.push('Quality QB play ↑')
if (qbQualityFactor < 0.98) adjustmentSummary.push('Weak QB play ↓')
```

(`qbQualityFactor > 1.02` ⇔ QB quality > 70; `< 0.98` ⇔ QB quality < 30.)

---

## Implementation order

Do the three unblocked items first, QB1 last (it carries the only gated
cross-file change). Run `npm run build` after each item.

1. **Momentum.** Create `src/utils/momentum.js`. Add the import and the Step 5b
   block. Add `momentumFactor` to the combine line (alongside the
   `combinedNewFactor` wrapper). Add `factors` keys + `adjustmentSummary`.
2. **Absence shape.** Modify Step 6 only. Add `factors` keys +
   `adjustmentSummary`. Does not touch the PPG combine line.
3. **Share volatility.** Modify Step 4. Add `factors` keys +
   `adjustmentSummary`.
4. **QB1 quality.** Add the `qbQualityByTeam = null` parameter and the Step 7b
   block in `seasonProjection.js` (this part is constraint-compliant and can
   land regardless). Add `factors` keys + `adjustmentSummary`. **Then**, only
   if Open Question Q1 is confirmed, apply the two-line App.jsx change.

---

## Integration points

- `computeNextSeasonProjection` is called once per player inside the
  `seasonProjections` useMemo in `App.jsx` (~line 872-903).
- `qbQualityByTeam` (App.jsx ~785) is already computed and in lexical scope at
  that call site — passing it in is purely additive.
- The returned `projection` object is embedded **verbatim** into the daily
  snapshot by `projectionSnapshot.js` (`buildPlayersBlock`, `projection`
  field — no whitelist). All 10 new `factors` keys ride along automatically.

---

## Backward compatibility / `factors` shape evolution

- The veteran-path `factors` object grows from 7 keys to 17. Adding fields is
  backward-compatible — `projectionSnapshot.js` embeds `projection` verbatim
  with no whitelist, and snapshots already differ in `factors` shape between
  the rookie path (`ktcMult`, `collegeMult`, `ktcPct`) and the veteran path.
- **Semantic shift to flag:** `factors.shareTrend` previously equalled the raw
  label→multiplier lookup. Under path (a) it now equals the
  *volatility-modulated* multiplier. For `entrenched` players the value is
  unchanged; for `moderate`/`volatile` players it is dampened toward 1.0. The
  raw value is newly available as `factors.shareTrendRaw`. Any backtest that
  spans the pre-B1a / post-B1a snapshot boundary must read `shareTrendRaw` for
  an apples-to-apples raw-trend comparison.
- Do **not** add any of the new keys to `rookieProjection`'s `factors` — the
  rookie path is out of scope and its distinct shape is pre-existing and fine.

---

## Acceptance criteria

- [ ] `src/utils/momentum.js` exists and exports `computeMomentum(ppgs,
      meanPPG)` returning `{ momentum, momentumLabel }`, `{ null, null }` for
      `< 4` entries; the formula and thresholds are byte-identical to the
      `dynastyScore.js` momentum block.
- [ ] `computeNextSeasonProjection` accepts a trailing `qbQualityByTeam = null`
      parameter.
- [ ] Veteran-path return `factors` contains all 10 new keys with the types,
      ranges, sentinels, and rounding in the table above.
- [ ] A player with `< 4` qualifying seasons gets `momentumFactor: 1.0`,
      `momentumLabel: null`.
- [ ] A player with only pre-Phase-5 seasons gets `absenceShapeFactor: 1.0`,
      `absenceShape: null`, and the existing `injurySeasons` multiplier is
      unchanged (no double-count).
- [ ] A player with `< 2` seasons of share history gets `shareTrendRaw: 1.0`,
      `shareVolatilityLabel: null`, `shareVolatilityScale: 1.0`,
      `shareTrend: 1.0`.
- [ ] An `entrenched` player's `shareTrend` equals `shareTrendRaw` (modulation
      is a no-op); a `volatile` player's `shareTrend` is strictly closer to 1.0
      than `shareTrendRaw` whenever `shareTrendRaw ≠ 1.0`.
- [ ] QBs get `qbQualityFactor: 1.0`, `qbQualityScore: null`. WR/TE/RB on a
      team with a resolved QB1 get `qbQualityFactor ∈ [0.95, 1.05]`.
- [ ] The combine line multiplies in `combinedNewFactor = clamp(qbQualityFactor
      × momentumFactor, 0.85, 1.15)`; `factors.combinedNewFactor` records it.
- [ ] `rookieProjection` is byte-for-byte unchanged.
- [ ] `npm run build` passes with no new warnings.
- [ ] With `qbQualityByTeam` NOT yet wired in App.jsx, every player still
      projects (QB1 signal inert: `qbQualityFactor 1.0`, `qbQualityScore null`)
      and the build passes — i.e. items 1-3 ship independently of Q1.

---

## Out of scope — do not touch

- `rookieProjection` and the entire rookie path (that is batch B1b).
- `dynastyScore.js` — including the inline momentum block. It keeps its own
  copy; de-duplicating it against `momentum.js` is a future task.
- `teamContext.js`, `computeShareTrend`, `computeQBQualityByTeam` — consumed
  as-is.
- Dynasty scoring, role ranks, positional ranks, market divergence, and every
  other `playerRows` pipeline consumer.
- The `confidence` label logic (untouched — path (a) was chosen for Item 4
  specifically so confidence stays as-is).
- Existing factor effects and clamps, except the one sanctioned share-trend
  modulation (Item 4) and the additive new factors.
- `projectionSnapshot.js` — it already embeds `projection` verbatim; no change
  needed.
- Cache TTLs, API calls, new dependencies — none.

---

## Open questions — resolve before / during implementation

### Q1 (BLOCKS the App.jsx wiring of QB1 quality only)

The stated constraint is "modifications confined to `seasonProjection.js` and
one new helper module." But the QB1 quality signal needs the already-computed
`qbQualityByTeam` map, which `computeNextSeasonProjection` does not currently
receive. Activating it requires a **two-line change to `src/App.jsx`**:

1. Pass `qbQualityByTeam` as the trailing argument in the
   `computeNextSeasonProjection(...)` call (App.jsx ~878-882).
2. Add `qbQualityByTeam` to the `seasonProjections` useMemo dependency array
   (App.jsx ~903).

`qbQualityByTeam` is already defined and in scope (App.jsx ~785), so this is
genuinely minimal and mechanical — but it does exceed the literal constraint.

**Recommended:** approve the two-line App.jsx change. It is the cleanest path
and keeps the snapshot's QB1 signal consistent with the canonical
`computeQBQualityByTeam` output already used by dynasty scoring.

**If rejected:** ship items 1-3 plus the *dormant* QB1 code (the Step 7b block
and `qbQualityByTeam = null` parameter are constraint-compliant on their own;
the signal simply stays inert at `1.0`/`null`). Do **not** substitute an
internally-derived QB-quality proxy — a careerStats-only proxy cannot
reproduce the dynasty-score-based canonical signal and would diverge from the
rest of the app, polluting backtests. Defer real QB1 activation to a follow-up
batch instead.

**→ Confirm with the user which path before touching App.jsx.**

### Q2 (minor — default is fine if unanswered)

QB1 quality is applied uniformly (±5%) to WR, TE, and RB. QB play arguably
matters less for a workhorse RB than for a pass-catcher. The default is uniform
treatment for B1a simplicity. If the user wants RB dampened (e.g. half-strength,
`1.0 + (q−50)/100×0.05`), apply that only to RB — otherwise ship uniform.

### Q3 (verify during implementation)

Confirm the `availability` object and its `absenceSegments` / `longestAbsence`
fields are actually present on recent-season records in the live `careerStats`
in IndexedDB (Phase 5 / schemaVersion 2). The field names are confirmed in
`sleeperStats.js` `computeAvailability`; just sanity-check that the snapshot
era of data being projected actually carries them. If absent everywhere, the
absence-shape factor degrades gracefully to `1.0` (acceptable, but worth
knowing).

---

## Documentation

None. (No README.md section currently documents `seasonProjection.js`'s factor
list. If the user wants the new factors documented, that is a separate sonnet
doc task.)

---

## Reference implementations

- **Momentum formula:** `dynastyScore.js`, `computeDynastyScore`, the
  "Momentum signal" block (~lines 833-845) — port verbatim.
- **Multiplier-from-label pattern:** existing Step 4 share-trend lookup in
  `seasonProjection.js` — momentum's lookup mirrors it.
- **`availability` shape:** `src/api/sleeperStats.js` `computeAvailability`
  (~lines 40-84).
- **`factors` rounding style:** existing veteran-path return in
  `computeNextSeasonProjection` (`ageDelta`/`teamFactor`/`durabilityFactor`
  rounded to 3 dp).
