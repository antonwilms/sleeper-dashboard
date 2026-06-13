# Peak-age dedup (D4-B) — compute the capped peak age once, consume it in the late-career gate

_Source finding: `.claude/tasks/backend-audit-deep.md` → D4-B. Planning session: opus, 2026-06-13. Implementer: sonnet._

## Objective

`computeEmpiricalAgeCurves` (`dynastyScore.js`) already derives each position's **capped peak age** internally (`cappedPeakAge`, ~line 91) but returns only `positionPeakPPG` and throws the age away. `computeDynastyScore` then **re-derives the identical value** (~lines 618-626, comment: _"mirrors the logic in computeEmpiricalAgeCurves"_) for its late-career label gate. Two copies of the same `reduce`-then-cap; any change to smoothing or cap policy must be made in both or the late-career gate silently diverges from the normalisation baseline.

**Goal:** one derivation, behavior-identical. Every existing dynasty/ageCurve test passes **unmodified**.

---

## The correctness invariant (state this in the PR/commit)

> For every position, the capped peak age returned by `computeEmpiricalAgeCurves` **equals** the value `computeDynastyScore` re-derives from `empiricalCurves[position]` today.

This holds by construction: both compute `cap = PEAK_AGE_CAPS[pos]` applied to `curve.reduce((best,p)=> p.medianPPG > best.medianPPG ? p : best, curve[0]).age`, over the **same** array — `curves[pos]` returned by the builder **is** the `smoothed` array the builder reduces, and **is** the `empiricalCurves[position]` the consumer reduces. The golden masters already pin the per-position values (`peakAge: 25` RB, `peakAge: 27` WR, with `yearsFromPeak` 1 / −1 / −4 / 0 across scenarios) — the dedup must reproduce them exactly.

---

## Design decision (resolves the return-shape + threading question)

Three moving parts:

1. **One shared internal helper** `derivePeakAge(curve, position)` in `dynastyScore.js` — the single source of truth for the reduce + cap. Both functions call it. **This is what removes the duplication** (the audit's actual goal: cap/smoothing policy lives in exactly one place).
2. **Additive sibling return field** `positionPeakAge` from `computeEmpiricalAgeCurves` — `{ QB, RB, WR, TE }`, value = capped peak age (or `null` for an empty curve). Mirrors `positionPeakPPG`'s shape/naming. (The audit's literal "return `peakAges`"; named `positionPeakAge` for consistency with its established sibling.)
3. **Trailing optional param** `positionPeakAge = null` on `computeDynastyScore`, threaded from the App.jsx memo. The consumer reads the map when present and **falls back to `derivePeakAge(curve, position)` when absent**.

### Why the fallback is mandatory (not optional polish)

The dynasty tests build `empiricalCurves` by hand (`defaultCurves()`) and call `computeDynastyScore` **positionally with no peak-age map**; their golden masters assert non-null `peakAge`/`yearsFromPeak`/`isLateCareer` in `signals`. If the consumer read peak age *only* from a threaded map, those tests would receive `undefined` → the signals flip to `null` → snapshots break. The curve-derived fallback (routed through the **same** `derivePeakAge` helper, so still zero duplication) keeps the hand-built-curve path byte-identical. The param is therefore a **production fast-path + the audit's "consume the returned field"**, while the fallback preserves the test contract — and both share one helper, so the duplicate `reduce` is genuinely gone.

### Why a trailing param (not an insert next to `positionPeakPPG`)

`computeDynastyScore` is called positionally everywhere (App.jsx + every dynasty test, e.g. `computeDynastyScore(playerId, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring())`). Inserting after `positionPeakPPG` would shift `dynastyDraftPick`/`scoringSettings`/… and break every caller and test. The new param goes **last** (after `historicalShares = null`), optional, default `null` → all existing positional callers are unaffected.

### Considered alternative (documented, not chosen)

**Helper-only, no threading:** add `derivePeakAge`, have `computeDynastyScore` always call it (no new param, no App.jsx change, no return field). This also removes the duplication and keeps tests unmodified, and is a valid fallback if the implementer judges the App.jsx thread too risky. Not chosen because it forgoes (a) the audit's explicit "return + consume" shape and (b) a real per-player perf win: with threading, the peak-age `reduce` runs **once per curve-build** instead of **once per player** (~600 players/render). The threading is additive and low-risk, so we take the win. _If anything about the App.jsx thread is ambiguous at implementation time, fall back to helper-only and note it — the dedup and the invariant hold either way._

---

## Changes — file by file

### 1. `src/utils/dynastyScore.js`

**1a. New helper** (place near `PEAK_AGE_CAPS` / above `computeEmpiricalAgeCurves`, after the `PEAK_AGE_CAPS` const ~line 18):

```js
// Single source of truth for a position's capped peak age (D4-B).
// derivedPeakAge = age of the highest-medianPPG point on the (smoothed) curve;
// capped by PEAK_AGE_CAPS to remove survivorship-bias inflation at late ages.
// Returns all three pieces so computeEmpiricalAgeCurves can keep its dev-mode
// "derived vs capped" log without re-deriving. Empty/missing curve → nulls
// (cap still reported). Consumed by computeEmpiricalAgeCurves (builder) and
// computeDynastyScore (late-career gate fallback).
function derivePeakAge(curve, position) {
  const cap = PEAK_AGE_CAPS[position] ?? null
  if (!curve || curve.length === 0) {
    return { derivedPeakAge: null, cap, cappedPeakAge: null }
  }
  const derivedPeakAge = curve.reduce(
    (best, p) => p.medianPPG > best.medianPPG ? p : best,
    curve[0]
  ).age
  const cappedPeakAge = cap != null ? Math.min(derivedPeakAge, cap) : derivedPeakAge
  return { derivedPeakAge, cap, cappedPeakAge }
}
```

The `> best.medianPPG` strict comparison + `curve[0]` seed are copied verbatim from both current sites (first-max-wins tie behavior preserved).

**1b. `computeEmpiricalAgeCurves`** — add `positionPeakAge` accumulator and use the helper.

- Init alongside the other accumulators (~line 71): add `const positionPeakAge = {}`.
- Non-empty branch (~lines 81-107): replace the inline `peakPoint`/`derivedPeakAge`/`cap`/`cappedPeakAge` derivation (lines 82-91) with:
  ```js
  const { derivedPeakAge, cap, cappedPeakAge } = derivePeakAge(smoothed, pos)
  ```
  The dev-mode log (lines 93-100) is **unchanged** — it still reads `cap` and `derivedPeakAge` (now destructured from the helper). The `cappedPeakPoint` reduce (lines 102-106, finds the curve point nearest `cappedPeakAge` to set `positionPeakPPG`) is **unchanged** — that second reduce is consumer-unique and stays. After it, add:
  ```js
  positionPeakAge[pos] = cappedPeakAge
  ```
- Empty branch (~lines 108-110): alongside `positionPeakPPG[pos] = 1`, add `positionPeakAge[pos] = null`.
- Return (line 113): `return { curves, positionPeakPPG, positionPeakAge }`.

**Behavior check:** `positionPeakPPG` and `curves` are byte-identical (only the source of the intermediate `cappedPeakAge` moved into the helper; the value is the same). `positionPeakAge` is purely additive.

**1c. `computeDynastyScore`** — add the trailing param and consume.

- Signature (~lines 600-604): append `, positionPeakAge = null` after `historicalShares = null`.
- Late-career gate (~lines 618-628): replace the re-derivation (lines 618-626) with:
  ```js
  // Capped peak age for the late-career label gate. Prefer the value the curve
  // builder already computed (positionPeakAge); fall back to deriving from the
  // curve via the shared helper when the map isn't supplied (hand-built-curve
  // tests, and any legacy caller). Single source of truth: derivePeakAge.
  const peakAge = positionPeakAge?.[position] ?? derivePeakAge(curve, position).cappedPeakAge
  const yearsFromPeak = peakAge != null && age != null ? age - peakAge : null
  const isLateCareer  = yearsFromPeak != null && yearsFromPeak >= 5
  ```
  `positionAgeCap`/`derivedCurvePeakAge` locals are removed (folded into the helper). `peakAge`, `yearsFromPeak`, `isLateCareer` keep their names and downstream uses (label gate + `signals.peakAge`/`signals.yearsFromPeak`/`signals.isLateCareer`) unchanged.

  **Note on `?? `vs the empty-curve case:** when `positionPeakAge[position]` is `null` (empty curve in production) the `??` falls through to `derivePeakAge(curve, position).cappedPeakAge`, which for an empty curve is also `null` — same result, no behavior change. (The fallback is only ever reached with a non-null distinct value when the map is absent entirely, i.e. tests.)

### 2. `src/App.jsx`

**2a. empiricalCurves memo** (~lines 532-538): destructure and thread the new field.
- Change `const { curves: empiricalCurves, positionPeakPPG } = useMemo(...)` → `const { curves: empiricalCurves, positionPeakPPG, positionPeakAge } = useMemo(...)`.
- Empty early-return inside the memo (`return { curves: {}, positionPeakPPG: {} }`) → `return { curves: {}, positionPeakPPG: {}, positionPeakAge: {} }`.

**2b. `computeDynastyScore` call site** (~line 708): append `positionPeakAge` as the final argument, after `historicalShares`:
```js
const dynastyScore = computeDynastyScore(
  playerId, leagueData.playerMap, careerStats, empiricalCurves, positionPeakPPG,
  rookieDraftPicks[playerId] ?? null, leagueData.scoringSettings, ktcMap, teamContext, depthMap,
  historicalShares, positionPeakAge,
)
```

**2c. memo dependency array** for `playerRows` (~line 783): `positionPeakAge` is derived from the same memo as `empiricalCurves`/`positionPeakPPG` (same identity lifecycle), so it changes in lockstep. Adding it to the dep array is optional-but-correct; if the existing array lists `positionPeakPPG`, add `positionPeakAge` beside it for honesty. (No new memo, no reorder — pipeline order is untouched.)

**No other consumer** of `computeEmpiricalAgeCurves` exists (verified: App.jsx:535 is the only non-test caller; tests pass curves directly). `seasonProjection.js` uses `positionPeakPPG` only and needs nothing.

### Step sequence

1. `dynastyScore.js`: add `derivePeakAge` (1a) → rewire `computeEmpiricalAgeCurves` (1b) → rewire `computeDynastyScore` signature + gate (1c).
2. `App.jsx`: memo destructure + early return (2a) → call site (2b) → dep array (2c).
3. Tests (below).
4. Docs (below).
5. Done-definition: `npm test` green with **zero edits to existing tests**; `npm run lint` 0 problems; `npm run build` clean. (No factors/stat-key contract touched — those suites are unaffected.)

---

## Tests to add

All in `src/utils/dynastyScore.test.js` (co-located; existing `beforeEach` `console.log` spy already suppresses the curve-builder log).

**T1 — Dedup lock: builder `positionPeakAge` equals the consumer's re-derivation, per position.**
This is the regression lock the finding asks for. Build a small `careerStats` + `playersMap` that yields non-empty curves for all four positions (enough `gp ≥ 10` player-seasons per position to populate buckets — reuse/extend an existing curve-building fixture if present, else hand-roll ~3 ages per position). Then:
```js
const { curves, positionPeakAge } = computeEmpiricalAgeCurves(careerStats, playersMap)
for (const pos of ['QB','RB','WR','TE']) {
  // independent re-derivation = the OLD inline logic, kept in the test as the oracle
  const cap = { QB:32, RB:25, WR:28, TE:29 }[pos]
  const curve = curves[pos]
  const expected = curve.length === 0 ? null
    : Math.min(curve.reduce((b,p)=>p.medianPPG>b.medianPPG?p:b, curve[0]).age, cap)
  expect(positionPeakAge[pos]).toBe(expected)
}
```
The inline oracle (not an import of the helper) is deliberate — it pins the value independently so a future change to `derivePeakAge` that drifts from the documented cap policy fails here.

**T2 — Consumer equivalence: map-threaded vs fallback produce identical `signals`.**
Same player/curve inputs, two calls:
```js
const withMap    = computeDynastyScore(id, pm, cs, curves, peakPPG, null, scoring, null, null, null, null, positionPeakAge)
const withoutMap = computeDynastyScore(id, pm, cs, curves, peakPPG, null, scoring) // no map → fallback
expect(withMap.signals.peakAge).toBe(withoutMap.signals.peakAge)
expect(withMap.signals.yearsFromPeak).toBe(withoutMap.signals.yearsFromPeak)
expect(withMap.signals.isLateCareer).toBe(withoutMap.signals.isLateCareer)
expect(withMap).toEqual(withoutMap) // full structural identity
```
Use `positionPeakAge` from the T1 `computeEmpiricalAgeCurves` call so the map and the curves are genuinely consistent.

**T3 — Late-career gate still fires through the map.**
Pick a position/age that yields `yearsFromPeak ≥ 5` (e.g. RB with capped peak 25, player age 30 → `isLateCareer true`, label in {Veteran Producer, Managed Decline, Sell Now, Fading}). Assert `isLateCareer === true` and a late-career label, passing the map. Guards against a threading mistake that silently nulls `peakAge` (which would make every player non-late-career).

**T4 — Empty-curve position: `positionPeakAge[pos] === null` and consumer fallback agrees.**
A `careerStats`/`playersMap` where one position has no `gp ≥ 10` seasons → `curves[pos] === []`, `positionPeakAge[pos] === null`; a `computeDynastyScore` call for such a player yields `signals.peakAge === null`, `isLateCareer === false`, both with and without the map.

**Existing tests:** the four golden-master scenarios (`dynastyScore.test.js` snapshots pinning `peakAge` 25/27 and `yearsFromPeak`/`isLateCareer`) and all `seasonProjection`/`ageCurve` tests must pass **unmodified** — they exercise the fallback path and the value is byte-identical. Implementer must confirm `git diff` shows no edits to existing test files. (If any existing snapshot moves, the refactor is not behavior-identical — stop and investigate, do not `-u`.)

---

## Docs updates

**docs/dynasty-scoring.md**

1. Line 16 — empirical-curves output. Before:
   > Outputs `curves` (used for age-adjusted scoring) and `positionPeakPPG` (normalisation baseline throughout dynasty scoring).

   After:
   > Outputs `curves` (used for age-adjusted scoring), `positionPeakPPG` (normalisation baseline throughout dynasty scoring), and `positionPeakAge` (the capped peak age per position; consumed by the late-career gate so the age is derived once here rather than re-computed in `computeDynastyScore`).

2. Line 22 — `computeDynastyScore` signature. Before:
   > `computeDynastyScore(playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, dynastyDraftPick, scoringSettings, ktcMap, teamContext, depthMap, historicalShares)`

   After (append the optional trailing param):
   > `computeDynastyScore(playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, dynastyDraftPick, scoringSettings, ktcMap, teamContext, depthMap, historicalShares, positionPeakAge = null)`

3. Late-career gate (after line 124) — add one sentence:
   > The capped peak age comes from `computeEmpiricalAgeCurves`' `positionPeakAge` output (single source of truth); when the map is absent (hand-built-curve callers) it is derived from `empiricalCurves[position]` via the same internal helper, so the value is identical either way.

**CLAUDE.md** — no change required. The `dynastyScore.js` navigation row lists exported functions (unchanged; `derivePeakAge` is internal, not exported). The playerRows-pipeline section references `empiricalCurves` + `positionPeakPPG` from the memo; `positionPeakAge` rides the same memo and is an internal threading detail, not a pipeline-step or state-shape change. If the implementer wants belt-and-suspenders, the one-line mention in the pipeline's "Also upstream" note (`empiricalCurves` + `positionPeakPPG` … → add `+ positionPeakAge`) is acceptable but **not required** — keep CLAUDE.md thin per its self-maintenance rule.

**README.md** — no change (no module added/removed, no command change, no scope change).

**Code comment cleanup:** delete the now-stale `// Derive the capped peak age (mirrors the logic in computeEmpiricalAgeCurves)` comment at dynastyScore.js:618 — there is no longer a mirror; the new gate comment (1c) replaces it. The `ageCurve.js` leaf-note (lines 6-9) about `computeEmpiricalAgeCurves` staying in `dynastyScore.js` is still accurate — leave it.

---

## Cross-repo impact

**None.** `positionPeakAge` is consumed entirely in-app (App.jsx memo → `computeDynastyScore` late-career gate). It never enters an exported shape: the projection snapshot is verbatim `computeNextSeasonProjection` output (`projectionSnapshot.js`), which does **not** include `computeDynastyScore` output or `computeEmpiricalAgeCurves`'s return; dynasty scores/signals are not part of any data-repo contract. No snapshot `schemaVersion` change, no manifest/enrichment/CFBD/nflverse contract touched. Confirmed: nothing for `sleeper-dashboard-data` to mirror.

---

## Out of scope (explicitly)

- The `cappedPeakPoint`/`positionPeakPPG` normalisation reduce (lines 102-107) — consumer-unique, not duplicated, untouched.
- `PEAK_AGE_CAPS` values, the smoothing (`rollingAvg3`), the dev-mode age-curve log, and the late-career label thresholds — all unchanged.
- Any dynasty-score value change — this is a behavior-identical dedup; if a score or signal moves, it's a bug in the refactor.
