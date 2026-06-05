# Refactor: break the cycle, then dedup breakout / bounce-back / td-reliance

**Type:** pure refactor (structural relocation + formula dedup, zero behavior change)
**Model for implementation:** sonnet (this file is the handoff; opus wrote it without editing source)
**Depends on:** prior batch `refactor-helper-dedup.md` (momentum + consistency dedup, committed `babb06a`)

---

## TL;DR

Two strictly-ordered parts:

1. **Break the cycle.** Move `interpolateAgeCurve` out of `dynastyScore.js` into a new leaf module `src/utils/ageCurve.js` (imports nothing). Repoint its two external importers (`projectionSignals.js`, `seasonProjection.js`) and `dynastyScore.js`'s own internal use. **Verify the cycle is gone** (`npm run build` clean, no circular-dependency warning; full suite + snapshots green) *before* touching the dedup.
2. **Dedup the three flags.** `dynastyScore.js` imports `computeBreakoutFlag` / `computeBounceBackFlag` / `computeTdReliance` from the now-cycle-free `projectionSignals.js`, replaces the inline versions (with a `?? 0` shim on `tdDependency`), and deletes the orphaned `TD_STAT_KEYS` constant and `prevSeason` binding.

The equivalence analysis (from the prior batch, re-verified below against current source) holds. The existing golden-master snapshots in `dynastyScore.test.js` cover all three flags in both true and false states — they are the safety net and must not shift.

**Honest framing of value vs. risk:** the breakout dedup recomputes an already-available `rawRatio` for *zero functional gain*; the entire value of this batch is "single source of truth for the three flag formulas" plus removing a documented circular-import hazard. The relocation (Part 1) is the load-bearing structural win; the dedup (Part 2) is low-risk tidy-up gated behind it. If any step in Part 2 turns out to cost more than expected, Part 1 still stands on its own and Part 2 can be dropped without loss.

---

## Verification findings (against current source, commit `babb06a`)

### Dependency graph — the cycle and exactly what to cut
- `projectionSignals.js:11` imports **only** `interpolateAgeCurve` from `./dynastyScore` (verified — nothing else; it does *not* import `computeKTCPositionPercentile` or any other symbol). Used at `projectionSignals.js:32` inside `computeBreakoutFlag`.
- The cycle that the prior batch avoided: importing any export of `projectionSignals.js` into `dynastyScore.js` would make `dynastyScore → projectionSignals → dynastyScore`. **Cutting the single edge `projectionSignals → dynastyScore` (the `interpolateAgeCurve` import) eliminates the cycle entirely.**

### `interpolateAgeCurve` is a true leaf candidate
`dynastyScore.js:113–126`. The function body references **only its `curve` / `age` parameters** — no module-level constants (`PEAK_AGE_CAPS`, `SKILL_POSITIONS`, `TD_STAT_KEYS`), no sibling helpers (`clamp`, `median`, etc.), no imports. It can move to a module that imports nothing. Confirmed by reading lines 113–126 in full.

### Every importer of `interpolateAgeCurve` (exhaustive `grep -rn` across `src/`)
| Location | Kind | Action |
|---|---|---|
| `dynastyScore.js:113` | definition | **delete** (moves to leaf) |
| `dynastyScore.js:814` | internal use | keep call; add `import` from leaf |
| `projectionSignals.js:11` | `import … from './dynastyScore'` | **repoint to `./ageCurve`** |
| `projectionSignals.js:32` | use | unchanged |
| `seasonProjection.js:1` | `import … from './dynastyScore'` (alongside `computeKTCPositionPercentile`) | **split import** (see below) |
| `seasonProjection.js:300,301` | use | unchanged |
| `factories.js:146`, `projectionSignals.test.js:4,16` | **comments only** — no import | none |

No test imports `interpolateAgeCurve` directly. No barrel/`App.jsx`/component imports it. The move is fully contained.

### Does `computeKTCPositionPercentile` move? **No.**
It is **not** part of the cycle (`projectionSignals.js` doesn't import it). Per the "move only what's necessary" constraint, it **stays in `dynastyScore.js`**. Consequence: `seasonProjection.js:1` splits into two import lines (one from `./dynastyScore` for `computeKTCPositionPercentile`, one from `./ageCurve` for `interpolateAgeCurve`). Shown explicitly below so it isn't fumbled.

### `computeEmpiricalAgeCurves` does NOT move
Conceptually paired with `interpolateAgeCurve`, but it is a builder with its own dependencies (`median`, `rollingAvg3`, `PEAK_AGE_CAPS`, `SKILL_POSITIONS`, unconditional `console.log`) and is not in the cycle. Moving it is out of scope. The leaf holds only the pure interpolation lookup. (Note this split in the leaf's header comment so the pairing isn't "fixed" later.)

### Re-verified flag equivalence (current line numbers)
- **`computeBreakoutFlag(age, currentPPG, curve, peakPPG)`** vs inline `dynastyScore.js:956` `const isBreakout = age != null && age <= 24 && rawRatio > 1.3 && seasonHistory.length >= 1`. The helper omits `&& seasonHistory.length >= 1`, which is **structurally always-true here**: line 816 (`currentPPG = seasonHistory[seasonHistory.length - 1].ppg`) would throw if `seasonHistory` were empty, so by line 956 it is guaranteed non-empty. The helper recomputes `expectedMedianPPG`/`ageFactor`/`rawRatio` internally — identical values to the inline (which already computed `rawRatio` at line 817 for `ageAdjScore`). Inputs all in scope at the call site: `age`, `currentPPG` (816), `curve`, `peakPPG`. ✅ identical result.
- **`computeBounceBackFlag(seasonHistory)`** vs inline `dynastyScore.js:957–959`. Helper maps `seasonHistory → ppgs` internally and uses a non-mutating copy for the second-highest sort; the inline mutates local `ppgs` via `.sort()` but `ppgs` is not read after line 959, so harmless. `(prevSeason.gamesPlayed ?? 0) >= 10` (helper) vs `prevSeason.gamesPlayed < 10` (inline) differ only for undefined GP, which never occurs (every `seasonHistory` entry has `gamesPlayed >= 8`, built at the season-history filter). ✅ identical result.
- **`computeTdReliance(stats, totalFP, scoringSettings)`** vs inline `dynastyScore.js:916–925`. Identical when `scoringSettings` is present. When falsy: helper returns `tdDependency: null` / `isTdReliant: false`; inline yields `tdDependency: 0` / `false`. The `?? 0` shim restores the inline's `0`. ✅ identical with shim. (See note in "Tests" — the difference is not separately observable at the output boundary because `signals.tdDependency: Math.round(tdDependency * 1000) / 1000` coerces `null → 0`; the shim is kept for code-intent correctness, matching the inline's "always a number" local contract.)

### Snapshot coverage of the three flags — **sufficient, no new scenario required**
`dynastyScore.test.js` golden-master snapshots pin:
- `isBreakout`: `true` in Scenario 2 (line 212) and Scenario 4 (398); `false` in 1/3/5.
- `isBounceBack`: `true` in Scenario 2 (211); `false` elsewhere.
- `isTdReliant`: `true` in Scenario 3 (309); `false` elsewhere.
- `tdDependency`: pinned in all 5 (`0.036`, `0.031`, `0.429`, `0.031`, `0.036`).

All three flags are exercised in both states. Any drift from the dedup trips a snapshot. **Do not add a required scenario.** (One optional defense-in-depth scenario noted in "Tests to add".)

---

## Leaf module design

**File:** `src/utils/ageCurve.js`
**Exports:** `interpolateAgeCurve` (only).
**Imports:** none → true leaf.
**Body:** move `dynastyScore.js:111–126` verbatim (the comment + function), unchanged.

```js
// src/utils/ageCurve.js — pure age-curve interpolation. Imports nothing (leaf module).
//
// Extracted from dynastyScore.js to break the dynastyScore ↔ projectionSignals
// import cycle (projectionSignals.computeBreakoutFlag needs this lookup, and
// dynastyScore now imports the flag helpers back). interpolateAgeCurve depends on
// nothing else, so this is a safe leaf. NOTE: computeEmpiricalAgeCurves (the curve
// *builder*) intentionally stays in dynastyScore.js — it is not in the cycle and
// has its own deps; do not move it here.

// Linear interpolation into an age curve.
// If age is outside the curve's range, clamps to nearest endpoint.
export function interpolateAgeCurve(curve, age) {
  if (curve.length === 0) return 0
  if (age <= curve[0].age) return curve[0].medianPPG
  if (age >= curve[curve.length - 1].age) return curve[curve.length - 1].medianPPG

  for (let i = 0; i < curve.length - 1; i++) {
    const lo = curve[i], hi = curve[i + 1]
    if (age >= lo.age && age <= hi.age) {
      const t = (age - lo.age) / (hi.age - lo.age)
      return lo.medianPPG + t * (hi.medianPPG - lo.medianPPG)
    }
  }
  return curve[curve.length - 1].medianPPG
}
```

**Own test file?** Optional, recommended-light. The function is exercised transitively by `dynastyScore.test.js`, `projectionSignals.test.js`, and `seasonProjection.test.js`, so coverage doesn't strictly require it. But a tiny `ageCurve.test.js` (3–4 cases: empty curve → 0, below-range clamp, above-range clamp, midpoint interpolation) is cheap insurance and documents the leaf's contract independent of its callers. **Recommendation: add it** (see "Tests to add"). Low effort, and it's the kind of pure function that benefits from a direct pin.

---

## Sequenced implementation plan

> **Hard rule:** complete and verify Part 1 (cycle broken) before starting Part 2. This isolates "did the relocation break the cycle" from "did the dedup change output."

### Part 1 — relocate `interpolateAgeCurve`, verify cycle broken

**Step 1.1 — create the leaf.** New file `src/utils/ageCurve.js` with the content above.

**Step 1.2 — `dynastyScore.js`: remove local def, import from leaf.**
- Delete the definition at lines **111–126** (the `// Linear interpolation…` comment through the closing `}`).
- Add an import near the existing helper imports at the top (currently lines 2–3 import `momentum` / `regressionSignals`):
  ```js
  import { interpolateAgeCurve } from './ageCurve'
  ```
- The internal call at line 814 is unchanged.
- `interpolateAgeCurve` was `export`ed from `dynastyScore.js`; after the move it is **no longer exported from there**. Verified no one imports it from `./dynastyScore` after Steps 1.3–1.4, so no re-export shim is needed.

**Step 1.3 — `projectionSignals.js`: repoint import.**
```diff
- import { interpolateAgeCurve } from './dynastyScore'
+ import { interpolateAgeCurve } from './ageCurve'
```
(line 11; usage at line 32 unchanged.)

**Step 1.4 — `seasonProjection.js`: split the import.**
```diff
- import { interpolateAgeCurve, computeKTCPositionPercentile } from './dynastyScore'
+ import { computeKTCPositionPercentile } from './dynastyScore'
+ import { interpolateAgeCurve } from './ageCurve'
```
(line 1; usages at lines 300–301 unchanged. Touch nothing else in this file.)

**Step 1.5 — VERIFY the cycle is broken (gate).**
- `npm run build` → must be **clean with no circular-dependency warning**. If a `CIRCULAR_DEPENDENCY` warning still appears, the graph isn't untangled — **stop and diagnose** (most likely another edge into `dynastyScore` exists that wasn't mapped). Do not proceed to Part 2.
- `npm test` → full suite green; `dynastyScore.test.js` snapshots **byte-identical** (relocation is a pure move — zero output change expected).
- Suggested commit boundary here: `refactor: extract interpolateAgeCurve to ageCurve.js leaf (break cycle)`.

### Part 2 — dedup the three flags

**Step 2.1 — `dynastyScore.js`: add the import.**
```js
import { computeBreakoutFlag, computeBounceBackFlag, computeTdReliance } from './projectionSignals'
```
(Now safe — no cycle.)

**Step 2.2 — replace the TD-dependency inline block (lines 916–925).**
Keep `mostRecentQualifyingSeason` (912), `mostRecentRawStats` (913), `mostRecentTotalFP` (914) — they become the helper's arguments.
```diff
- let tdPoints = 0
- if (scoringSettings) {
-   for (const key of TD_STAT_KEYS) {
-     const statVal    = mostRecentRawStats[key]
-     const multiplier = scoringSettings[key]
-     if (statVal != null && multiplier != null) tdPoints += statVal * multiplier
-   }
- }
- const tdDependency = tdPoints / Math.max(mostRecentTotalFP, 1)
- const isTdReliant  = tdDependency > 0.40
+ const { tdDependency: tdDependencyRaw, isTdReliant } =
+   computeTdReliance(mostRecentRawStats, mostRecentTotalFP, scoringSettings)
+ const tdDependency = tdDependencyRaw ?? 0   // helper returns null when scoringSettings is falsy; inline used 0
```
Downstream uses unchanged: `effectiveReliability` (928), log (1017), `signals.tdDependency`/`isTdReliant` (1049–1050).

**Step 2.3 — replace the breakout/bounce-back inline (lines 955–959).**
```diff
- const prevSeason = seasonHistory.length >= 2 ? seasonHistory[seasonHistory.length - 2] : null
- const isBreakout    = age != null && age <= 24 && rawRatio > 1.3 && seasonHistory.length >= 1
- const isBounceBack  = prevSeason != null &&
-   prevSeason.gamesPlayed < 10 &&
-   (currentPPG >= Math.max(...ppgs.slice(0, -1)) || (ppgs.length >= 2 && currentPPG >= ppgs.sort((a, b) => b - a)[1]))
+ const isBreakout   = computeBreakoutFlag(age, currentPPG, curve, peakPPG)
+ const isBounceBack = computeBounceBackFlag(seasonHistory)
```
`peakEntry`/`peakSeason` at 961–962 are unaffected. `rawRatio` (817) and `ageFactor` (815) stay — still used by `ageAdjScore` (818) and `signals.ageCurveFactor` (1044); no orphan, no double-compute bug (the helper's internal `rawRatio` is a separate local).

**Step 2.4 — orphan cleanup.**
- **`TD_STAT_KEYS`** (`dynastyScore.js:17`): after Step 2.2 its only consumer is gone (verified: `grep -c` shows exactly 2 occurrences = def + the one use). **Delete the constant** (lines ~15–19, the array). The helper carries its own copy.
- **`prevSeason`**: removed as part of Step 2.3 (was used only at 957–958).
- Re-grep `TD_STAT_KEYS` and `prevSeason` after editing to confirm zero remaining references.

**Step 2.5 — VERIFY.**
- `npm test` → snapshots **byte-identical**. If any snapshot shifts, **stop — do not `-u`.** A shift means one of the equivalence assumptions (always-true `seasonHistory.length >= 1`, harmless `ppgs` mutation, never-undefined GP, `?? 0` shim) is wrong in some path; investigate.
- `npm run build` → clean, no warnings.
- `npm run lint` → see baseline note below.

### Lint baseline (important)
`npm run lint` currently reports **45 problems (44 errors, 1 warning)** — a large pre-existing baseline (e.g. `'defaultPPRScoring' is defined but never used`). **Do not try to fix the baseline.** After the refactor, confirm the count does **not increase**: removing `TD_STAT_KEYS` / `prevSeason` should keep it flat or reduce it by clearing any unused-var error those would create. Any *new* `no-unused-vars` (or other) error introduced by the edits must be resolved; pre-existing ones are out of scope.

---

## The dedup specifics — quick reference

| Flag | Inline (current lines) | Replacement | Inputs in scope | Notes |
|---|---|---|---|---|
| breakout | 956 | `computeBreakoutFlag(age, currentPPG, curve, peakPPG)` | `age`, `currentPPG` (816), `curve`, `peakPPG` | helper recomputes `rawRatio` (redundant, identical); `&& length>=1` is structurally always-true |
| bounce-back | 957–959 | `computeBounceBackFlag(seasonHistory)` | `seasonHistory` | helper uses non-mutating copy; GP always defined |
| td-reliance | 916–925 | `computeTdReliance(mostRecentRawStats, mostRecentTotalFP, scoringSettings)` + `?? 0` shim | `mostRecentRawStats` (913), `mostRecentTotalFP` (914), `scoringSettings` | shim restores inline's `0` when `scoringSettings` falsy |

---

## Tests to add

- **Required: none.** Existing `dynastyScore.test.js` snapshots pin all three flags in both states and lock every numeric output; they are the regression net for Part 2. Relocation in Part 1 changes no output, so they also confirm Part 1.
- **Recommended (light): `src/utils/ageCurve.test.js`** — direct unit test for the relocated leaf:
  1. empty curve → `0`
  2. age below range → first point's `medianPPG` (clamp)
  3. age above range → last point's `medianPPG` (clamp)
  4. age at a midpoint → linear interpolation value
  Documents the leaf's contract and gives it standalone coverage. ~15 lines.
- **Optional (defense-in-depth): a `scoringSettings: null` scenario** in `dynastyScore.test.js` asserting `result.signals.tdDependency === 0` and `isTdReliant === false`. Honestly noted: this would **not** catch a missing `?? 0` shim, because `signals.tdDependency = Math.round(null * 1000)/1000 = 0` regardless — the shim is code-intent, not output-observable. Add only if you want the null-scoring path explicitly pinned; otherwise skip.

---

## Docs updates

### `docs/dynasty-scoring.md` line 110 (the "Projection reuse" note)
Currently reads: *"…recomputed byte-identically by the season-projection veteran pipeline via `src/utils/projectionSignals.js` … (De-dup of these into an import is deferred — requires first relocating `interpolateAgeCurve` …)."* The deferral is now resolved. Rewrite to the unified state, e.g.:
> **Single source of truth:** `isBreakout`, `isBounceBack` and `isTdReliant` are computed by `src/utils/projectionSignals.js` (`computeBreakoutFlag` / `computeBounceBackFlag` / `computeTdReliance`) and imported by **both** `dynastyScore.js` and the season-projection veteran pipeline (Step 5c). `dynastyScore.js` maps the helper's `null` `tdDependency` (no scoring settings) back to `0`. See [Next-season projections § Step 5c](projection.md).

### `CLAUDE.md` — navigation map (`src/utils/` table)
- **Add a row for `ageCurve.js`:** `` `ageCurve.js` | `interpolateAgeCurve()` — pure age-curve interpolation lookup; leaf module (imports nothing). Extracted from dynastyScore.js to break the dynastyScore ↔ projectionSignals cycle. ``
- **`dynastyScore.js` row:** it currently says "imports `momentum.js` + `regressionSignals.js` for momentum/consistency." Append `projectionSignals.js` (breakout/bounce-back/td-reliance) and `ageCurve.js` (interpolation). Update the line-count note if you wish (it drops by the removed inline blocks + `TD_STAT_KEYS`). Note `interpolateAgeCurve` is no longer defined here (it was not in the listed exports, so no export-list edit needed).
- **`projectionSignals.js` row:** currently "vet projection signals (Step 5c)." Update to note it is now the **shared** source for both `seasonProjection.js` and `dynastyScore.js`, and that it imports `interpolateAgeCurve` from `ageCurve.js`.

### `docs/projection.md`
No change needed — verified in the prior batch that its only "Projection reuse" note concerns `compsIntegration`, unrelated to these flags.

---

## Cross-repo impact

**None.** Verified:
- `dynastyScore.js` public API unchanged except `interpolateAgeCurve` relocates to `ageCurve.js` (same signature, same behavior; only the import path changes for `projectionSignals.js` and `seasonProjection.js`). All other exports (`computeEmpiricalAgeCurves`, `computeDynastyScore`, `computeProspectScore`, `computePositionalRanks`, `computeRoleRanks`, `computeMarketDivergence`, `computeKTCPositionPercentile`) untouched.
- `seasonProjection.js` behavior unchanged (import path only) → `factors` shape, `projectedPPG`, and snapshot output all unchanged. No `factorsSchema.test.js` / `statKeysContract.test.js` impact.
- No change to any `sleeper-dashboard-data` contract (snapshot shape, season-totals schemaVersion, enrichment, manifest, CFBD pivot).

Nothing for the data repo to mirror.

---

## Risks

1. **Incomplete cycle break.** Mitigated: `interpolateAgeCurve` references nothing from `dynastyScore.js` (verified line-by-line), and `projectionSignals.js`'s *only* import from `dynastyScore.js` is `interpolateAgeCurve`. Cutting that one edge is provably sufficient. The Step 1.5 build gate is the hard check — if a circular-dependency warning persists, stop.
2. **Snapshot shift on the flag dedup.** The flags are "equivalent in context"; the context assumptions are now verified structurally (the `length>=1` guarantee from line 816; the post-959 non-read of `ppgs`; GP-always-defined). If a snapshot still shifts, an assumption is wrong in an untested path — investigate, don't `-u`.
3. **Orphan leftovers / lint creep.** `TD_STAT_KEYS` and `prevSeason` orphan on dedup; both must be removed. Watch the lint count against the 45-baseline — only *new* errors matter.
4. **`seasonProjection.js` import split fumble.** The two-symbol import must split into two lines (one per source). Exact diff given in Step 1.4; touch nothing else in that file.
5. **Low functional value.** Stated up front: this is single-source-of-truth + cycle-removal, not a behavior improvement. Keep the effort proportionate; if Part 2 hits friction, Part 1 alone is a complete, shippable win.

---

## Open questions

1. **`ageCurve.test.js` — add it or rely on transitive coverage?** Recommendation: add the light 4-case test (cheap, documents the leaf contract). If you'd rather keep the change minimal, transitive coverage via the three existing suites is technically sufficient. Either is acceptable; no source-behavior impact.
2. **Leaf module name.** `ageCurve.js` is recommended (accurate: it holds the age-curve interpolation lookup). If a different convention is preferred (e.g. `ageCurveInterp.js`), it's purely cosmetic — pick one and use it consistently across the import paths and CLAUDE.md.
