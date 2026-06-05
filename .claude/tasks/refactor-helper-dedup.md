# Refactor: dedup signal formulas between `dynastyScore.js` and the three extracted helpers

**Type:** pure refactor (code organization, zero behavior change)
**Model for implementation:** sonnet (this file is the handoff; opus wrote it without editing source)
**Primary target:** `src/utils/dynastyScore.js`
**Helpers in scope:** `src/utils/momentum.js`, `src/utils/projectionSignals.js`, `src/utils/regressionSignals.js`

---

## TL;DR — what verification actually found

The task prior assumed "the extractions were byte-identical ports, so this is mechanical." **That is true for two of the four formulas and false for the other two.** Concretely:

| Inline formula in `dynastyScore.js` | Helper | Byte-identical in context? | Verdict |
|---|---|---|---|
| Momentum (lines 834–845) | `momentum.js` → `computeMomentum` | **Yes, exactly** | **Dedup now** |
| Consistency CV (lines 864–868) | `regressionSignals.js` → `computeConsistency` | **Yes** in the ≥3-season branch; `<3` returns `null` vs inline `50` (trivially mapped) | **Dedup now** (with `?? 50`) |
| Trajectory (lines 825–831) | `regressionSignals.js` → `computeTrajectory` | **No** — helper floors the denominator at `max(meanPPG, 4)`; dynasty uses unfloored `slope/meanPPG`. Also helper returns `null` for `<2` seasons where dynasty produces `0`. | **Do NOT dedup** — intentional, documented projection divergence |
| Breakout / BounceBack / TdReliance (lines 925–945, 970–974) | `projectionSignals.js` → `computeBreakoutFlag` / `computeBounceBackFlag` / `computeTdReliance` | Formulas equivalent **in context**, but importing this module into `dynastyScore.js` creates a **circular import** (`projectionSignals.js` imports `interpolateAgeCurve` from `dynastyScore.js`) | **Defer** — see Open Question 1 |

So this batch lands **momentum + consistency** cleanly and safely, **leaves trajectory alone** (it is genuinely different and must stay different), and **defers projectionSignals** because deduping it introduces a `dynastyScore ↔ projectionSignals` cycle that risks the "clean build, no warnings" done-definition. The projectionSignals dedup needs a structural prerequisite (relocating `interpolateAgeCurve`) that is out of this batch's scope.

**No drift to reconcile** in the sense of "a bug fixed in one copy but not the other" — every difference found is an *intentional, already-documented* projection-vs-dynasty divergence. Nothing needs a correctness reconciliation; we just must not pretend the trajectory copies are the same.

---

## Verification findings (detail)

### Current import state
`dynastyScore.js` line 1 imports only `computeShareTrend` from `./teamContext`. It imports none of the three helpers today — clean slate. The three helpers are currently consumed only by `seasonProjection.js` (lines 3–5), which also imports `interpolateAgeCurve` + `computeKTCPositionPercentile` from `dynastyScore.js` (line 1). That existing chain is acyclic; see the cycle analysis below.

### Test coverage baseline — **there is NO `dynastyScore.test.js`**
`grep` confirms `computeDynastyScore` is referenced only in `App.jsx` and `dynastyScore.js` itself. **Zero direct test coverage of `computeDynastyScore` / `computeProspectScore`.** The helpers each have their own unit tests (`momentum.test.js`, `regressionSignals.test.js`, `projectionSignals.test.js`), and `seasonProjection.test.js` exercises them through the projection pipeline — but nothing pins dynasty-score numeric output. **This is the headline risk: the refactor is touching an untested 1084-line file.** Precision-pinning tests must be added *before* any source edit (see "Tests to add").

**Pre-refactor suite baseline (verified by running `npx vitest run`):**
- **14 test files, 191 tests, all green.**
- Post-refactor: the existing **191 must remain green and unchanged**; total grows only by the new `dynastyScore.test.js` precision tests. (Same discipline as the 15-arg refactor's test-count baseline, adapted: we are *adding* a file, not changing counts elsewhere.)

### 1. Momentum — `computeMomentum` — EXACT MATCH ✅
- Inline: `dynastyScore.js` lines **833–845** (the `let momentum = null … momentumLabel = …` block, gated on `ppgs.length >= 4`).
- Helper `momentum.js:21` `computeMomentum(ppgs, meanPPG)`.
- Formula (`recentAvg`/`priorAvg`, `/ Math.max(meanPPG, 1)`), label thresholds (`>0.20`, `>0.05`, `>=-0.05`, `>=-0.20`), and the `< 4 → {null, null}` sentinel are **identical**.
- Call-site inputs match exactly: inline passes `ppgs` (= `seasonHistory.map(s => s.ppg)`, oldest→newest) and `meanPPG` (= `ppgs.reduce(...)/ppgs.length`, line 827). Helper expects exactly that.
- `momentum.js` imports nothing → **no circular-import risk.**

### 2. Consistency — `computeConsistency` — MATCH in the live branch ✅ (with a `?? 50` shim)
- Inline: `dynastyScore.js` lines **864–868**:
  ```js
  let consistencyScore = 50
  if (seasonHistory.length >= 3) {
    const cv = meanPPG > 0 ? stdDev(ppgs) / meanPPG : 1
    consistencyScore = clamp(100 - cv * 100, 0, 100)
  }
  ```
- Helper `regressionSignals.js:73` `computeConsistency(ppgs)`:
  ```js
  if (ppgs.length < 3) return { consistencyScore: null }
  const cv = meanPPG > 0 ? stdDev(ppgs) / meanPPG : 1
  const consistencyScore = Math.max(0, Math.min(100, 100 - cv * 100))
  ```
- `clamp(v,0,100)` ≡ `Math.max(0, Math.min(100, v))` — **identical**. `stdDev` is a byte-identical private copy in both files. Helper recomputes `meanPPG` from the same `ppgs`, yielding the same value. The `>=3` gate is identical (`ppgs.length === seasonHistory.length`).
- **Only difference:** `<3` seasons → helper returns `null`, inline keeps `50`. Trivially reconciled at the call site with `?? 50`. No correctness drift.
- `regressionSignals.js` imports nothing → **no circular-import risk.**

### 3. Trajectory — `computeTrajectory` — **GENUINELY DIFFERENT, leave inline** ⛔
- Inline: `dynastyScore.js` lines **825–831**, `normalizedSlope = meanPPG > 0 ? slope / meanPPG : 0`.
- Helper `regressionSignals.js:49`, `normalizedSlope = slope / Math.max(meanPPG, 4)`.
- The helper's own header (lines 9–13, 44–47) documents this: *"dynastyScore.js uses an unfloored `slope / meanPPG`; the 4.0 floor is a projection-specific stability guard."* They diverge for `meanPPG < 4`, and at `<2` seasons (helper → `null`; dynasty inline → `0`, giving `trajectoryScore = 50`).
- The shared sub-helper `weightedLinearRegression` is **module-private** in `regressionSignals.js` (not exported), so there is no import path to dedup just that piece. `dynastyScore.js` keeps its own copy (lines 621–633).
- **Action: do nothing to trajectory.** Deduping it would change dynasty output for low-mean players — a behavior change, forbidden by scope.

### 4. Breakout / BounceBack / TdReliance — equivalent in context, but **circular import** ⚠️ → defer
- Inline locations: TD dependency lines **925–945**; `isBreakout`/`isBounceBack` lines **970–974** (with `rawRatio` originating at line 822 and `prevSeason` at line 970).
- Equivalence analysis (for the record, so a future batch can dedup confidently):
  - `computeBreakoutFlag(age, currentPPG, curve, peakPPG)` reproduces `age != null && age <= 24 && rawRatio > 1.3`. Inline additionally `&& seasonHistory.length >= 1`, which is **always true** on the component path (Path A2 returns early when `seasonHistory.length === 0`). The helper recomputes `rawRatio` internally — identical value, but redundant since the inline already has `rawRatio` for `ageAdjScore`. **Low dedup value.**
  - `computeBounceBackFlag(seasonHistory)`: identical result. The inline `ppgs.sort(...)[1]` mutates the local `ppgs`, but `ppgs` is not read after line 974, so it is harmless; the helper uses a non-mutating copy and produces the same boolean. The helper's `(prevSeason.gamesPlayed ?? 0) >= 10` vs inline `< 10` differ only for undefined GP, which never occurs (seasonHistory entries always have `gamesPlayed >= 8`).
  - `computeTdReliance(stats, totalFP, scoringSettings)`: identical when `scoringSettings` is present. When `scoringSettings` is falsy, helper returns `tdDependency: null` vs inline `0`; both serialize to `0` in `signals.tdDependency` (since `Math.round(null*1000)/1000 === 0`), and `isTdReliant` is `false` either way. A `?? 0` at the call site makes it exact.
- **Blocker:** `projectionSignals.js:11` does `import { interpolateAgeCurve } from './dynastyScore'`. Importing **any** export of `projectionSignals.js` into `dynastyScore.js` creates a direct `dynastyScore ↔ projectionSignals` module cycle. At runtime this is safe (neither binding is used during module evaluation, only at call time), but **Vite/Rollup may emit a `CIRCULAR_DEPENDENCY` build warning**, which violates the done-definition's "clean build, no warnings." Combined with the near-zero value of the breakout dedup (it recomputes an already-available `rawRatio`), the cost/risk balance says **defer**. See Open Question 1 and the deferred follow-up below.

---

## Conflict reconciliation

None required. Every helper-vs-inline difference is an *intentional projection-specific divergence already called out in the helper headers and in `docs/dynasty-scoring.md`*, not a bug introduced by drift:
- Trajectory's 4.0 floor — projection stability guard, deliberately not in dynasty.
- The `null` sentinels (`computeConsistency`/`computeTrajectory` for short histories) — the projection wanted "no value" rather than a defaulted `50`/`0`.

The prior's tie-breaker ("keep whatever produces no behavior change in dynasty output") resolves cleanly: **keep dynasty's current outputs.** For momentum and consistency the helper *already* produces those exact outputs (so importing changes nothing). For trajectory the helper would change them, so we don't import it.

---

## Implementation order (exact)

> **Prime directive:** zero change to any dynasty-score output. The precision tests are the safety net. Add them first, green, *then* touch source.

### Step 0 — establish the safety net (before any source change)
1. Create `src/utils/dynastyScore.test.js` with the precision-pinning tests specified in "Tests to add" below.
2. Capture expected values as **golden masters**: write each assertion as `expect(result).toMatchInlineSnapshot()` (empty), run `npx vitest run src/utils/dynastyScore.test.js -u` **against unmodified source**, and let Vitest fill the snapshots. Eyeball each snapshot for sanity (scores in 0–100, labels plausible) before committing. These snapshots now encode current behavior; any later numeric drift fails the test.
3. Run the full suite (`npx vitest run`) → confirm **191 + new** tests green.
4. Commit this test file *before* editing source (so the baseline is recorded independently of the refactor). Suggested commit: `test: pin dynasty-score output before helper de-dup`.

### Step 1 — dedup momentum (clean)
1. Add to `dynastyScore.js` line 1 area: `import { computeMomentum } from './momentum'`.
2. Replace lines **833–845** (`let momentum = null … 'decelerating'`) with:
   ```js
   // Momentum signal — only when ≥ 4 qualifying seasons exist (see momentum.js)
   const { momentum, momentumLabel } = computeMomentum(ppgs, meanPPG)
   ```
   Leave every downstream use of `momentum` / `momentumLabel` (logging line 1033–1035; signals lines 1066–1067) untouched.
3. `npx vitest run` → all green, snapshots unchanged.

### Step 2 — dedup consistency (clean)
1. Add `import { computeConsistency } from './regressionSignals'`.
2. Replace lines **864–868** with:
   ```js
   // Consistency sub-score (CV-based); shared formula in regressionSignals.js.
   // Helper returns null for < 3 qualifying seasons → preserve the inline default of 50.
   const { consistencyScore: consistencyRaw } = computeConsistency(ppgs)
   const consistencyScore = consistencyRaw ?? 50
   ```
   (`consistencyScore` stays a single binding consumed at lines 896, 1050, 1063 — `Math.round(consistencyScore)` unchanged.)
3. `npx vitest run` → all green, snapshots unchanged.

### Step 3 — trajectory: **no change.** Add a one-line comment near line 825 noting the divergence is intentional, so the next reader doesn't "finish the job":
   ```js
   // NOTE: trajectory is intentionally NOT shared with regressionSignals.computeTrajectory —
   // that helper floors the denominator at max(meanPPG, 4) for the projection; dynasty uses
   // unfloored slope/meanPPG. See docs/dynasty-scoring.md. Do not dedup.
   ```

### Step 4 — projectionSignals: **deferred.** Do not import `projectionSignals.js` into `dynastyScore.js` in this batch. Leave lines 925–945 and 970–974 inline. (Rationale + follow-up below.)

### Step 5 — helper header comments (only the ones now actually deduped)
- `momentum.js` lines 7–11: the header says *"dynastyScore.js is intentionally left untouched … a future task should refactor it to import this function."* That future task is now done — update to state that `dynastyScore.js` imports `computeMomentum` (single source of truth) and that `seasonProjection.js` also consumes it.
- `regressionSignals.js` lines 4–13: update the **consistency** portion to "now imported by `dynastyScore.js`," but **keep the trajectory-divergence paragraph verbatim** (lines 9–13 / 44–47) — it is still true and now load-bearing.
- `projectionSignals.js` header: **leave unchanged** (still a duplicate; deferral keeps it accurate).

### Step 6 — docs (see Docs updates) and CLAUDE.md, then run the full done-definition.

### Step 7 — done-definition gate
- `npx vitest run` — full suite green (191 + new).
- `npm run build` — **must be clean, no warnings.** (No cycle is introduced by Steps 1–2, so this should pass; the deferral in Step 4 is specifically what protects this.)
- `npm run lint` — clean.

---

## Tests to add (BEFORE the refactor) — `src/utils/dynastyScore.test.js`

Strategy: characterization / golden-master. `computeDynastyScore`'s formula is too coupled to hand-derive exact composites reliably, so we **capture** current output via inline snapshots, then freeze it. Build inputs by reusing `src/__fixtures__/factories.js` helpers (`makeSeasonEntry`, `defaultCurves`, `breakoutCurves`, `DEFAULT_PEAK_PPG`, `defaultPPRScoring`, `defaultVetCareerStats`, `clampHiCareerStats`, `clampLoCareerStats`). Note `computeDynastyScore` takes **positional args**, not the projection's options object:

```js
computeDynastyScore(
  playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, dynastyDraftPick, scoringSettings,
  ktcMap = null, teamContext = null, depthMap = null, historicalShares = null
)
```

Add these scenarios. For each, assert the **whole returned object** via `toMatchInlineSnapshot()` (captures `score`, `label`, every `components.*` number, and every `signals.*` field — the deduped functions feed `signals.momentum/momentumLabel/consistencyScore`, and the deferred ones feed `isBreakout/isBounceBack/tdDependency/isTdReliant`, so the snapshot nets all four formulas at once). Add a couple of explicit `expect(result.signals.momentumLabel).toBe(...)` lines per scenario for human readability.

1. **Stable 5-season vet (Path C, all signals active).**
   `defaultVetCareerStats('P_DS_STABLE')` (five 12-PPG/14-GP seasons), `player {position:'RB', age:26, years_exp:5}`, `defaultCurves()`, `DEFAULT_PEAK_PPG`, `scoringSettings: defaultPPRScoring()`, `depthMap {P_DS_STABLE:{depthOrder:1}}`, `currentSeason 2025`.
   Pins: momentum (`'stable'`), consistency (≥3 → real CV value), trajectory, tdReliance(false), composite + label.

2. **Accelerating bounce-back breakout (Path C, positive signals).**
   `clampHiCareerStats('P_DS_HI')` (ppgs `[8,8,8,14,14]`, 2023 GP=9), `empiricalCurves: breakoutCurves()`, `player {position:'RB', age:24, years_exp:5}`, scoring `defaultPPRScoring()`.
   Pins: `momentumLabel:'accelerating'`, `isBounceBack:true`, `isBreakout:true`, label `'Breakout'`. Directly exercises every projectionSignals formula (verifies the deferral leaves them intact).

3. **Declining TD-reliant vet (Path C, negative signals + reliability penalty).**
   `clampLoCareerStats('P_DS_LO')` (ppgs `[14,14,14,8,8]`, last season high `rush_td`), `player {position:'RB', age:26, years_exp:6}`, scoring `defaultPPRScoring()`.
   Pins: `momentumLabel:'decelerating'`, `isTdReliant:true`, the `effectiveReliability = round(reliability*0.90)` path, label.

4. **Two-season player (Path B, prospect blend + consistency default).**
   careerStats with exactly 2 qualifying seasons (e.g. `2023: makeSeasonEntry(168,14)`, `2024: makeSeasonEntry(196,14)`), `player {position:'WR', age:23, years_exp:2}`, scoring `defaultPPRScoring()`.
   Pins: `confidence:'low'`, the prospect-prior blend, and — crucially — `signals.consistencyScore === 50` (the `<3 → null → ?? 50` shim). This is the one scenario that would catch a botched consistency-sentinel mapping.

5. **One-season player (edge: consistency=50, momentum=null, trajectory at length 1).**
   careerStats with a single qualifying season, `years_exp:2` so it reaches Path B (not the true-prospect path). 
   Pins: `momentum:null`, `consistencyScore:50`, `trajectory` not crashing at length 1. Confirms momentum's `<4→null` and consistency's `<3→50` shims both hold.

> If, while capturing snapshots, scenario 5 routes to an early-return path (A2/A3) instead of Path B, adjust `years_exp`/`gamesPlayed` so it lands on the component path — the goal is to exercise the deduped code, and the snapshot will make the actual path obvious. Do not change source to force a path.

**Console noise:** `computeDynastyScore` and `computeProspectScore` emit `console.log` when `NODE_ENV !== 'production'` (Vitest runs as `'test'`). This is harmless to assertions but noisy. Pass `empiricalCurves` directly (do **not** call `computeEmpiricalAgeCurves`, which logs unconditionally at lines 90/92). Optionally wrap tests with a `vi.spyOn(console, 'log').mockImplementation(() => {})` in `beforeEach` to keep output clean — your call; not required for correctness.

---

## Docs updates

### `docs/dynasty-scoring.md`
- **Line 73** ("Projection reuse" for Trajectory + Consistency): this note currently lumps trajectory and consistency together as both "recomputed by the season-projection pipeline via `regressionSignals.js`." After this batch that is **misleading** — split it:
  - **Consistency** is now the *single source of truth*: `dynastyScore.js` imports `computeConsistency` from `regressionSignals.js` (mapping the `<3`-season `null` to its historical default of `50`).
  - **Trajectory** is deliberately **not** shared: `regressionSignals.computeTrajectory` floors the denominator at `max(meanPPG, 4)` for the projection, whereas `dynastyScore.js` uses unfloored `slope/meanPPG`. State that they are intentionally distinct and must not be unified.
- **Line 108** ("Projection reuse" for breakout/bounceback/tdReliant, "recomputed byte-identically … via `projectionSignals.js`"): with projectionSignals **deferred**, this remains accurate (still duplicated). Leave as-is, but optionally append a pointer: "(de-dup of these into an import is tracked as a follow-up — see below / task file)."
- **Lines 95–98** (Reliability/Consistency formula): already correct (`clamp(100 − CV × 100, 0, 100)`, "requires ≥ 3 qualifying seasons") — no change.

### `docs/projection.md`
Verified: the only "Projection reuse" note here (line 185) is about `findCareerComps`/`compsIntegration` — unrelated to this batch. The momentum/consistency/trajectory reuse notes live in `dynasty-scoring.md`, not here. **No change to `projection.md`.** (The task brief's assumption that these notes were in `projection.md` was incorrect; recorded here so the implementer doesn't hunt for them.)

### `CLAUDE.md` (navigation map, `src/utils/` table)
- `momentum.js` row ("`computeMomentum()` — … (Step 5)"): now also consumed by `dynastyScore.js`. Update to "shared by `dynastyScore.js` and the season-projection pipeline."
- `regressionSignals.js` row ("Trajectory slope + consistency CV sub-score; shared by `dynastyScore.js` and `seasonProjection.js` steps 4 and 5d"): this line currently implies *both* trajectory and consistency are shared with dynasty. After this batch, **only consistency** is imported by dynasty; trajectory is dynasty-local-and-different. Reword to: "Consistency CV sub-score shared with `dynastyScore.js`; trajectory slope is projection-specific (floored) and intentionally NOT shared with dynasty's unfloored trajectory."
- `dynastyScore.js` row ("950 lines, read in full before touching"): the file is now 1084 lines and imports `computeMomentum`/`computeConsistency`. Optionally update the line count and append "imports momentum.js + regressionSignals.js for momentum/consistency." Low priority but keeps the map honest.

---

## Cross-repo impact

**None.** Verified explicitly:
- `dynastyScore.js`'s external API (`computeEmpiricalAgeCurves`, `interpolateAgeCurve`, `computeEfficiencyMetrics`, `computeProspectScore`, `computeDynastyScore`, `computePositionalRanks`, `computeRoleRanks`, `computeMarketDivergence`, `computeKTCPositionPercentile`) is unchanged — same names, signatures, return shapes.
- No `factors` key, projection output, or snapshot shape is touched (this batch never enters `seasonProjection.js`).
- The `dynastyScore` output object (`score`, `label`, `components`, `signals`) is byte-for-byte preserved (that is the whole point, enforced by the snapshots).
- None of the `sleeper-dashboard-data` cross-repo contracts (snapshot shape, season-totals schemaVersion, enrichment schemas, manifest, CFBD pivot) are affected.

Nothing for `sleeper-dashboard-data` to mirror.

---

## Risks (honest assessment)

1. **Untested target file.** `computeDynastyScore` had zero coverage. Confidence in "zero behavior change" rests entirely on the Step-0 golden snapshots. Mitigation: snapshots cover all five paths/signal-combinations the deduped code touches; they are captured pre-refactor and must stay identical. This is as strong a net as is practical without a live-cache diff.
2. **Circular import (the reason projectionSignals is deferred).** Importing `projectionSignals.js` into `dynastyScore.js` makes a 2-node module cycle. Runtime-safe, but a build-time `CIRCULAR_DEPENDENCY` warning would break the "clean build" gate. Deferring sidesteps it entirely for this batch.
3. **Momentum/consistency confidence is high, not absolute.** The formulas are byte-identical and the snapshots will confirm zero output change. If any snapshot shifts after Step 1 or 2, **stop** — that means an assumption above is wrong; do not `-u` the snapshot to make it pass.
4. **Trajectory temptation.** A reader might "helpfully" finish the dedup by importing `computeTrajectory`. The Step-3 comment + docs/CLAUDE.md wording exist to prevent exactly that. It would silently change low-mean-player scores.
5. **`computeProspectScore` cascade.** `computeDynastyScore` calls `computeProspectScore` on Paths A/B, but `computeProspectScore` contains **none** of the four deduped formulas — it is untouched by this refactor. Scenarios 2/4 still snapshot through it to catch any incidental change.

---

## Open questions (need a decision before / during implementation)

1. **projectionSignals dedup — defer or do now?** This plan **recommends deferring** it (lands momentum + consistency this batch) because importing `projectionSignals.js` into `dynastyScore.js` introduces a `dynastyScore ↔ projectionSignals` circular import, and the breakout dedup recomputes an already-available `rawRatio` for near-zero benefit. Deferral narrows the originally-requested three-helper scope to two, so it warrants sign-off.
   - **Recommended follow-up batch** (separate task file): extract `interpolateAgeCurve` (and possibly `computeKTCPositionPercentile`) into a tiny leaf module (e.g. `src/utils/ageCurve.js`) that both `dynastyScore.js` and `projectionSignals.js` import. With the cycle broken, `dynastyScore.js` can import `computeBreakoutFlag`/`computeBounceBackFlag`/`computeTdReliance` cleanly (using the `?? 0` shim on `tdDependency`). That batch is opus-territory (it moves an exported symbol consumed by `seasonProjection.js`).
   - **Alternative if you want it done now:** attempt the projectionSignals import in this batch, gated strictly on `npm run build` emitting **no** circular-dependency warning. If a warning appears, revert that import and fall back to the deferral. Riskier for the done-definition; not recommended.

2. **Inline snapshots vs explicit value assertions.** This plan recommends `toMatchInlineSnapshot()` (golden master) since hand-deriving the composite is unreliable. If you prefer hard-coded `toEqual` literals, capture them from the same pre-refactor run — functionally equivalent, just more verbose. No source impact either way.
