# Scoring robustness guards — NaN firewall (D1-B) + zero-seasonHistory crash (D1-C)

_Source findings: `.claude/tasks/backend-audit-deep.md` → D1-B, D1-C. Planning session: opus, 2026-06-10. Implementer: sonnet._

## Objective

Both scoring entry points degrade to their **existing** graceful-failure contracts instead of crashing or emitting NaN:

- **D1-C**: a player whose `seasonHistory` is empty after all three routing gates (the `years_exp: null` + zero-qualifying case) returns an A2-style "Limited Data" result instead of throwing `TypeError` inside the `playerRows` useMemo.
- **D1-B**: a non-finite `projectedPPG` returns the existing non-skill `null`; a non-finite dynasty `finalScore` routes to the Limited Data return; non-finite `fantasyPoints`/`gamesPlayed` are filtered at qualifying-array construction and at age-curve bucket construction so one bad season degrades to "season skipped", not "player nulled / cohort poisoned".

**Hard constraints** (verify each explicitly before declaring done):
- Pure additive guards. **Byte-identical output for every finite input.** The existing golden-master suites in `src/utils/dynastyScore.test.js` and `src/utils/seasonProjection.test.js` must pass **unmodified** — do not regenerate snapshots, do not edit expected values.
- No `factors` key added/renamed/removed (factors contract, CLAUDE.md). No new module. No refactor of working code — all new returns are written inline; do **not** extract the A2/A3 returns into a shared helper.
- Dev-only warnings, using the existing pattern `if (process.env.NODE_ENV !== 'production') console.warn(...)` (precedent: `dynastyScore.js:516`, `sleeperStats.js:267`).

---

## Scope decisions made in planning (do not re-litigate; implement as specified)

1. **Curve-bucket guard is IN scope** (the audit's optional extension). Without it, one NaN season-total poisons a `(position, age)` median bucket → `positionPeakPPG` and curve points go NaN → the `finalScore` guard would route *every player in that cohort* to Limited Data. With it, the bad row degrades to one skipped player-season. It changes nothing in App.jsx (same return shape, same memo) and is behavior-identical for finite inputs.
2. **A `computeProspectScore` evidence-blend guard is IN scope.** Path A returns `prospect.score` directly, *bypassing* the `finalScore` guard — a prospect with NaN `currentSeasonStats.fantasyPoints` would emit `score: NaN` otherwise. The guard skips the Bayesian evidence blend when the current-season values are non-finite, degrading to the prior-only score (the existing contract for prospects with 0 games). This also protects Path B's blend input.
3. **No guard on the rookie projection path** (`rookieProjection`). Verified NaN-proof from careerStats inputs: every multiplier is a table lookup whose bucket comparisons fail closed to a finite default on NaN (`dom >= 30` → false → 0.92 bucket; `r >= 0.85` → false → 0.00 adjust; `ktcPct` is `Math.round` of a count ratio → finite or null), and `baseline` is a constant. A guard there would be untestable dead code, violating the done-definition's test-coverage rule.
4. **`recencyWeightedPPG` gets the same finiteness filter, but silent (no warn).** It runs for the entire position pool per scored player (O(pool²) calls); the `seasonHistory` warn already fires once for the affected player. Without this filter, a NaN season makes the *target player's* `rankingPPG` NaN → `currentLevelScore` silently becomes 0 (percentileRank counts `v < NaN` as 0) — a finite-but-wrong composite the `finalScore` guard cannot catch. (Pool members are already safe: `.filter(v => v > 0)` drops NaN.)
5. **New Limited Data returns carry one distinguishing signal flag each** (`isDataGap: true` for D1-C, `isNonFinite: true` for the finalScore guard) so the diagnoses are distinguishable in the UI/signals without changing any existing path. Consumers access signals via `?.`/specific keys; extra keys are inert (verified — no signals-shape contract test exists; only `factors` is schema-enforced).

---

## Why NaN slips every existing gate (implementer background)

- `clamp(NaN, lo, hi)` = `Math.max(lo, Math.min(hi, NaN))` = NaN. **Do not change `clamp` itself** — guards go at array construction and finalization.
- The qualifying gates read `(d.gamesPlayed ?? 0) < 8`. `??` only catches null/undefined, so `NaN ?? 0` → NaN, and `NaN < 8` → **false** — a NaN-GP season *passes* the GP≥8 gate today.
- `score == null` checks downstream do not catch NaN, and NaN fails every sort comparison, so poisoned rows silently vanish from ranks/divergence.

---

## Changes — file by file

### 1. `src/utils/seasonProjection.js`

#### 1a. Finiteness filter at qualifying-array construction (Step 1, lines ~283–294)

Current mapper body:

```js
const d = careerStats?.[s]?.[playerId]
if (!d || (d.gamesPlayed ?? 0) < 8) return null
return { season: s, ppg: d.fantasyPoints / d.gamesPlayed, gamesPlayed: d.gamesPlayed, dnpWeeks: d.dnpWeeks ?? 0 }
```

New mapper body (predicate order matters — the finite-GP-below-8 skip stays first so normal non-qualifying seasons never reach the warn):

```js
const d = careerStats?.[s]?.[playerId]
if (!d) return null
const gpRaw = d.gamesPlayed ?? 0
if (Number.isFinite(gpRaw) && gpRaw < 8) return null
if (!Number.isFinite(gpRaw) || !Number.isFinite(d.fantasyPoints)) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[projection] non-finite season totals skipped: player=${playerId} season=${s} gp=${d.gamesPlayed} fp=${d.fantasyPoints}`)
  }
  return null
}
return { season: s, ppg: d.fantasyPoints / d.gamesPlayed, gamesPlayed: gpRaw, dnpWeeks: d.dnpWeeks ?? 0 }
```

Behavior-identical for finite inputs: same gate (`gpRaw < 8`), same shape, `gamesPlayed: gpRaw` ≡ `d.gamesPlayed` when finite-and-≥8 (a season with `gamesPlayed` null/undefined cannot reach the return: `gpRaw` is then `0`, caught by `< 8`).

This filter also protects every downstream reader of `lastSeasonRaw = careerStats[lastQ.season][playerId]` (Steps 5c–5h): `lastQ` now always points at a season whose `fantasyPoints`/`gamesPlayed` are finite.

#### 1b. Finalization guard after the comp blend (line ~604)

Current:

```js
const projectedPPG = blendedPPG
const projectedTotalPts = Math.round(projectedPPG * projectedGames * 10) / 10
```

New:

```js
const projectedPPG = blendedPPG
if (!Number.isFinite(projectedPPG)) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[projection] non-finite projectedPPG nulled: player=${playerId} pipelinePPG=${pipelinePPG} compPPG=${compPPG}`)
  }
  return null
}
const projectedTotalPts = Math.round(projectedPPG * projectedGames * 10) / 10
```

Placement after the blend covers both contamination routes (pipeline-side NaN and comp-side NaN — `blendedPPG = clamp(α·pipeline + (1−α)·comp)` is NaN if either side is). `projectedGames` cannot be independently NaN once 1a lands (it derives from filtered `qualifying` GP), so one guard suffices. Returning `null` is the **existing non-skill contract** (`seasonProjection.js:265`, docs/projection.md line 7) — consumer audit below confirms it is universally tolerated.

### 2. `src/utils/dynastyScore.js`

#### 2a. Finiteness filter at `seasonHistory` construction (lines ~614–620)

Same predicate pattern as 1a applied to the `seasonHistory` mapper. Warn tag `[dynastyScore]`:

```js
const d = careerStats[season]?.[playerId]
if (!d) return null
const gpRaw = d.gamesPlayed ?? 0
if (Number.isFinite(gpRaw) && gpRaw < 8) return null
if (!Number.isFinite(gpRaw) || !Number.isFinite(d.fantasyPoints)) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[dynastyScore] non-finite season totals skipped: player=${playerId} season=${season} gp=${d.gamesPlayed} fp=${d.fantasyPoints}`)
  }
  return null
}
return { season, ppg: d.fantasyPoints / d.gamesPlayed, gamesPlayed: gpRaw, fantasyPoints: d.fantasyPoints }
```

#### 2b. Same filter, silent, in `recencyWeightedPPG` (lines ~563–576)

Current mapper: `return d && (d.gamesPlayed ?? 0) >= 8 ? d.fantasyPoints / d.gamesPlayed : null`.

New mapper (no warn — see scope decision 4):

```js
const d = careerStats[season]?.[playerId]
if (!d) return null
const gpRaw = d.gamesPlayed ?? 0
if (!Number.isFinite(gpRaw) || gpRaw < 8 || !Number.isFinite(d.fantasyPoints)) return null
return d.fantasyPoints / d.gamesPlayed
```

(For finite inputs `Number.isFinite(gpRaw)` is always true and the rest is the existing condition — identical behavior.)

#### 2c. D1-C guard: zero-`seasonHistory` fall-through (insert after the A3 block, i.e. after line ~726, before the "Components (Paths B and C)" comment)

```js
// ── PATH A4: Data gap ─────────────────────────────────────────────────────
// No qualifying seasons and none of the routing gates above matched (e.g.
// years_exp == null in Sleeper metadata). Without this guard the components
// block below dereferences seasonHistory[-1] → TypeError inside the
// playerRows useMemo. Degrade to the A2 "Limited Data" contract.
if (seasonHistory.length === 0) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[dynastyScore] zero qualifying seasons fell through routing gates (years_exp=${yearsExp}): player=${playerId} → Limited Data`)
  }
  const score = Math.round(15 + (ktcPct ?? 0) * 0.20)
  return {
    score,
    label:      'Limited Data',
    confidence: 'none',
    isRookie:   false,
    components: null,
    signals: {
      isBreakout:     false,
      isBounceBack:   false,
      isProspect:     false,
      isDataGap:      true,
      draftCapital:   null,
      gamesPlayed:    Number.isFinite(currentSeasonStats?.gamesPlayed) ? currentSeasonStats.gamesPlayed : 0,
      seasonsOfData:  0,
      ageCurveFactor: null,
      peakSeason:     null,
      ktcInfluenced:  ktcPct != null,
    },
  }
}
```

Shape mirrors the A2 return verbatim except `isDataGap: true` replaces `isUnprovenVet: true`, and `gamesPlayed` coalesces non-finite to 0 (new return only — do **not** touch A2/A3). Every input that routes correctly today is unaffected: this point is only reachable when the code currently throws.

#### 2d. D1-B guard: non-finite `finalScore` (insert after the Path B blend block, lines ~857–868, **before** the special-signals/label section so labels are never computed from NaN)

```js
if (!Number.isFinite(finalScore)) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[dynastyScore] non-finite finalScore (componentScore=${componentScore}): player=${playerId} → Limited Data`)
  }
  const score = Math.round(15 + (ktcPct ?? 0) * 0.20)
  return {
    score,
    label:      'Limited Data',
    confidence: 'none',
    isRookie:   false,
    components: null,
    signals: {
      isBreakout:     false,
      isBounceBack:   false,
      isProspect:     false,
      isNonFinite:    true,
      draftCapital:   null,
      gamesPlayed:    Number.isFinite(currentSeasonStats?.gamesPlayed) ? currentSeasonStats.gamesPlayed : 0,
      seasonsOfData:  seasonHistory.length,
      ageCurveFactor: null,
      peakSeason:     null,
      ktcInfluenced:  ktcPct != null,
    },
  }
}
```

This is the trunk firewall for residual non-finite routes the array filters don't cover (e.g. NaN `teamContext.playerShares` values → `shareScore` NaN → `opportunityScore` NaN → `componentScore` NaN; or poisoned `positionPeakPPG` if curves were built elsewhere). For finite inputs `Number.isFinite(finalScore)` is always true → zero behavior change.

#### 2e. `computeProspectScore` evidence-blend guard (lines ~490–497)

Current condition: `if (currentSeasonStats && (currentSeasonStats.gamesPlayed ?? 0) > 0) { ...blend... }`.

New:

```js
if (currentSeasonStats && (currentSeasonStats.gamesPlayed ?? 0) > 0) {
  if (!Number.isFinite(currentSeasonStats.gamesPlayed) || !Number.isFinite(currentSeasonStats.fantasyPoints)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[prospectScore] non-finite current-season totals — evidence blend skipped: player=${player.player_id ?? player.full_name} gp=${currentSeasonStats.gamesPlayed} fp=${currentSeasonStats.fantasyPoints}`)
    }
  } else {
    gamesPlayed = currentSeasonStats.gamesPlayed
    // ...existing blend body unchanged...
  }
}
```

Note `(NaN ?? 0) > 0` is false, so a NaN-GP season already skips the blend today; the new branch matters for the finite-GP + NaN-fantasyPoints case. Degrades to the prior-only score — the existing 0-games prospect contract. `gamesPlayed` in the returned object stays 0 in the degraded case (matches the no-evidence path today).

#### 2f. Curve-bucket guard in `computeEmpiricalAgeCurves` (lines ~56–60)

Current:

```js
const ppg = data.fantasyPoints / data.gamesPlayed
const pos = player.position
if (!byPositionAge[pos][ageAtSeason]) byPositionAge[pos][ageAtSeason] = []
byPositionAge[pos][ageAtSeason].push(ppg)
```

New (insert between `ppg` computation and the push):

```js
const ppg = data.fantasyPoints / data.gamesPlayed
if (!Number.isFinite(ppg)) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[age curve] non-finite PPG excluded from ${player.position} age-${ageAtSeason} bucket: player=${playerId} season=${season} gp=${data.gamesPlayed} fp=${data.fantasyPoints}`)
  }
  continue
}
```

Covers both NaN `fantasyPoints` and NaN `gamesPlayed` (NaN GP passes the `< 10` gate at line 45 for the same `??`/comparison reason as above, then yields NaN ppg here). Return shape, smoothing, peak-cap logic, and the App.jsx consumer (`App.jsx:538-544`) are untouched; for finite inputs the bucket contents are identical.

### 3. `src/utils/compsIntegration.js` — **no change**

The audit cites its `clamp` (:60) as a propagation point, not a defect site. With 1b placed *after* the blend, comp-side NaN is caught at the single finalization guard. Adding a second guard inside the blend would be redundant.

---

## Consumer audit — `computeNextSeasonProjection` `null` return (required by task; verified in source 2026-06-10)

| Consumer | Location | Null handling | Verdict |
|---|---|---|---|
| `seasonProjections` memo | `App.jsx:884-915` | `if (proj) result[row.player_id] = proj` — a null projection simply omits the player from the map | ✅ |
| `playerRowsWithProj` | `App.jsx:919-944` | `const p = seasonProjections[row.player_id]; return p ? {...row, ...} : row`; `nextSeasonRank` loop skips `projectedPPG == null` | ✅ |
| `MyTeamView` | `App.jsx:304-336` | `projections?.[p.id] ?? null`; per-field `?? null`; sums/sorts use `?? 0` | ✅ |
| `usePlayerProfile` → PlayerProfile | `usePlayerProfile.js:155`, `PlayersTab.jsx:1086-1240` | `seasonProjections?.[playerId] ?? null`; rendering gated by `{projection && ...}` (`PlayersTab.jsx:1228`) and `projection?.` accesses | ✅ |
| Projection snapshot writer | `App.jsx:951-977` → `projectionSnapshot.js:66-69` | `buildPlayersBlock` iterates `Object.entries(seasonProjections)` — nulls were never inserted, so the player is simply absent from that day's snapshot | ✅ (side effect noted in Cross-repo impact) |
| `myTeamData` | `App.jsx:1142-1147` | Uses Sleeper's *weekly* projections API (`fetchList`), **not** `computeNextSeasonProjection` — not a consumer | n/a |

**Conclusion: no consumer needs work; the null contract holds everywhere.** No synthetic factors object is needed.

Dynasty Limited Data consumers also need no work: the new returns are shape-identical to A2 (already in production). `playerRowsWithQBMod` skips rows with `components: null` (`App.jsx:812`), `computeMarketDivergence`/`computePositionalRanks` treat the numeric score like any A2 score, and PlayersTab has an explicit `confidence === 'none'` summary path (`PlayersTab.jsx:787-788`) and label color/order entries for `'Limited Data'` (`PlayersTab.jsx:1461,1510`).

## Qualifying-threshold degradation (required confirmation)

The finiteness filter drops whole seasons, which lowers `qualifying.length` / `seasonHistory.length`. Expected, documented degradations — all land on existing contracts, none crash or NaN:

- **One of several seasons poisoned** → season skipped; vet may shift Path C → Path B (≤2 remaining seasons: prospect-prior blend, confidence `low`) and projection weights shift to the 2-season `[0.30, 0.70]` (or 1-season `[1.00]`) form. This is "season skipped", the intended semantics.
- **All qualifying seasons poisoned** → `qualifying.length === 0`: projection routes to the **rookie path** (the existing contract for no-qualifying-season vets — the "year-4 failed-to-launch" population, `seasonProjection.js:301-304`); dynasty routes to A2 (`years_exp ≥ 2`), Path A (`≤ 1`), or the new A4 guard (`null`).
- A filtered season is invisible to Step-6 durability and the dynasty durability sub-score, same as any sub-8-GP season today (`allPlayerSeasons` already self-excludes NaN GP via `(d.gamesPlayed ?? 0) > 0` → false).

There is **no** path where the filter changes the GP≥8 evaluation of a *finite* season — the finite gate is checked first in every new predicate.

## Step sequence for implementation

1. `seasonProjection.js`: 1a filter → 1b finalization guard.
2. `dynastyScore.js`: 2a `seasonHistory` filter → 2b `recencyWeightedPPG` filter → 2c A4 guard → 2d finalScore guard → 2e prospect blend guard → 2f curve-bucket guard.
3. Tests (section below), including the fixture additions to `src/__fixtures__/factories.js` if helpful (new `P_*` IDs — careerComps/efficiency caches are keyed by player ID / careerStats identity; use unique IDs per test, per the factories header).
4. Docs updates (section below).
5. Done-definition: `npm test` green (golden masters **unmodified**), `factorsSchema.test.js` green (no factors keys changed — it must pass untouched), `npm run build` clean, `npm run lint`.

---

## Tests to add

Conventions: co-located unit tests; suppress `console.log` (existing `beforeEach` spy pattern in `dynastyScore.test.js:49-51`) and spy `console.warn` with `vi.spyOn(console, 'warn').mockImplementation(() => {})` to both silence and assert. Vitest runs with `NODE_ENV === 'test'` ≠ `'production'`, so dev warns fire under test. Use fresh unique player IDs per test (module-level caches — see `factories.js` header). Reuse `makeSeasonEntry`, `defaultCurves`, `DEFAULT_PEAK_PPG`, `defaultPPRScoring`, `makeVet` from `src/__fixtures__/factories.js`.

### `src/utils/dynastyScore.test.js` — new `describe('robustness guards (D1-B / D1-C)')`

1. **D1-C: null-`years_exp` + zero qualifying seasons returns Limited Data, does not throw.**
   Input: `playersMap = { P_DG_NULLEXP: { position: 'RB', age: 26, years_exp: null } }`; `careerStats = { 2024: { P_DG_NULLEXP: makeSeasonEntry(40, 5) } }` (5 GP — never qualifies); no ktcMap.
   Expect: no throw; `score === 15`; `label === 'Limited Data'`; `confidence === 'none'`; `components === null`; `signals.isDataGap === true`; `signals.seasonsOfData === 0`; `console.warn` called once with a string containing `years_exp=null`.
   Variant (same test or sibling): with a ktcMap giving the player a KTC percentile, `score === Math.round(15 + pct * 0.20)`.

2. **D1-C trigger population sanity: null-`years_exp` player WITH a qualifying season still routes to components.** Input: same player but `makeSeasonEntry(120, 12)` in 2024. Expect: `components !== null`, `signals.isDataGap` undefined, no warn. (Pins the guard to the empty-history case only.)

3. **NaN `fantasyPoints` in the only qualifying-GP season → A2 Limited Data, warns.**
   Input: `{ position: 'WR', age: 27, years_exp: 5 }`; `careerStats = { 2024: { P_DG_NANFP: makeSeasonEntry(NaN, 14) } }`.
   Expect: season filtered → `seasonHistory` empty → existing A2 path: `label === 'Limited Data'`, `signals.isUnprovenVet === true` (NOT `isDataGap` — A2 catches it first); `console.warn` called with a string containing `non-finite season totals`.

4. **Season-skip equivalence (one poisoned season among many).**
   Input A: 26-y/o RB, `years_exp 5`, `defaultVetCareerStats(P_DG_SKIP)` **plus** `2019: { P_DG_SKIP: makeSeasonEntry(NaN, 14) }`.
   Input B (control): identical but with the 2019 entry **absent**.
   Expect: `computeDynastyScore(A)` deep-equals `computeDynastyScore(B)` (use distinct player IDs but identical-shaped inputs, or clear comparisons field-by-field on score/label/components/signals); warn fired for A only.

5. **finalScore guard: finite seasons but NaN component input → Limited Data with `isNonFinite`.**
   Input: 26-y/o RB with `defaultVetCareerStats`, and `teamContext = { playerShares: { [pid]: { carryShare: NaN } } }`.
   Reach: `shareScore = Math.round(clamp(NaN*200, 0, 100))` → NaN → `opportunityScore` NaN → `componentScore` NaN → `finalScore` NaN → guard.
   Expect: `label === 'Limited Data'`, `signals.isNonFinite === true`, `confidence === 'none'`, `components === null`, warn fired containing `non-finite finalScore`.

6. **Prospect blend guard: NaN current-season `fantasyPoints` degrades to prior-only score.**
   Input: rookie `{ position: 'WR', age: 22, years_exp: 0 }` with `careerStats = { 2024: { P_DG_PROSP: makeSeasonEntry(NaN, 6) } }` and a premium pick (`{ round: 1, pick: 5 }`) so the 35-cap doesn't mask the assertion.
   Control: same player with `careerStats = {}`.
   Expect: both calls return the **same finite score**; `Number.isFinite(score)` true; warn fired for the NaN case containing `evidence blend skipped`.

7. **Finite-input regression**: explicit note in the describe header — the existing golden-master suite above is the byte-identical regression gate; it must pass with zero edits. Additionally add one explicit control: run the Scenario-1 stable-vet fixture (`P_DS_STABLE` inputs duplicated under a fresh ID) and assert `signals.isDataGap`, `signals.isNonFinite` are both `undefined` and no `console.warn` fired.

### `src/utils/dynastyScore.test.js` — new `describe('computeEmpiricalAgeCurves — non-finite bucket guard')`

(`computeEmpiricalAgeCurves` logs unconditionally — spy `console.log` too, per the test-file header note.)

8. **NaN PPG degrades one bucket entry, not the cohort.**
   Input: three same-age (e.g. `age: 26`), same-position RB players in one season, two with finite entries (`makeSeasonEntry(170, 17)`, `makeSeasonEntry(150, 15)`), one with `makeSeasonEntry(NaN, 16)`; `playersMap` ages set so `ageAtSeason` lands on the same bucket (remember the age estimate uses `new Date().getFullYear()` — compute `player.age` from the test's season accordingly, e.g. season = current year).
   Control: identical input with the NaN player's entry removed.
   Expect: `curves` and `positionPeakPPG` deep-equal between poisoned and control runs; every `medianPPG` in the poisoned run is finite; `positionPeakPPG.RB` finite; warn fired once containing `non-finite PPG excluded`.

### `src/utils/seasonProjection.test.js` — new `describe('non-finite firewall (D1-B)')`

9. **NaN `fantasyPoints` in the most recent would-qualify season → season skipped, output equals control.**
   Input A: `makeVet({ playerId: 'P_NF_SKIP_A' })` with an extra `2025: { [pid]: makeSeasonEntry(NaN, 14) }` appended to careerStats and `currentSeason: 2025`.
   Input B (control): `makeVet({ playerId: 'P_NF_SKIP_B' })` with no 2025 entry, `currentSeason: 2025`.
   Expect: `projectedPPG`, `projectedGames`, `factors.basePPG`, `confidence` all equal between A and B; result non-null; warn fired for A containing `non-finite season totals`.

10. **All qualifying seasons poisoned → routes to rookie path (existing no-qualifying contract), no throw.**
    Input: vet (`years_exp: 5`) whose every careerStats season has `fantasyPoints: NaN`.
    Expect: no throw; result non-null; `confidence === 'rookie'` (the documented degradation — see "Qualifying-threshold degradation").

11. **Finalization guard: non-finite reaches the blend → returns null, warns.**
    Input: `makeVet({ positionPeakPPG: { ...DEFAULT_PEAK_PPG, RB: NaN } })` (player must be RB with an age inside the curve so Step 3 computes: `curFactor = cur / NaN` → NaN → `ageDelta` NaN → `rawPPG` NaN → `pipelinePPG` NaN → `blendedPPG` NaN).
    Expect: returns exactly `null`; warn fired containing `non-finite projectedPPG nulled`.
    (If the chosen fixture's `cur > 0` gate prevents the NaN — it shouldn't, `cur` comes from the finite curve — fall back to poisoning `empiricalCurves.RB[*].medianPPG` *and* `positionPeakPPG.RB` together; assert the same null outcome. The test must end with a genuinely-null return, not a skipped guard.)

12. **Finite-input regression**: the existing vet/rookie integration describes (65-key/48-key schemas, clamp restructure regressions, golden values) must pass unmodified — call this out in the describe header comment. No new test needed beyond 9's control leg.

### Contract tests (`src/__tests__/`) — no new tests, but must run

- `factorsSchema.test.js`: unaffected (no factors keys change) — must pass untouched; if it fails, the implementation added/removed a key and is wrong.
- `statKeysContract.test.js`: unaffected (no new stat-key references).

---

## Docs updates

### `docs/projection.md`

1. **Return contract (line 7).** Before:
   > Returns `{ projectedPPG, projectedGames, projectedTotalPts, confidence, factors, adjustmentSummary }` for any QB/RB/WR/TE. Returns `null` for non-skill positions.

   After:
   > Returns `{ projectedPPG, projectedGames, projectedTotalPts, confidence, factors, adjustmentSummary }` for any QB/RB/WR/TE. Returns `null` for non-skill positions, **and for skill players whose final `projectedPPG` is non-finite (corrupted season-totals input) — a dev-mode `console.warn` identifies the player.**

2. **New subsection** after the "Veteran pipeline (13 steps)" table (after the `combinedNewFactor` paragraph), titled `### Non-finite input firewall (D1-B)`:
   > Season-totals values are not trusted to be finite. Two layers guard the pipeline:
   > 1. **Qualifying-array filter (Step 1):** a season whose `fantasyPoints` or `gamesPlayed` is non-finite is skipped (dev-mode `console.warn`), exactly as if it were a sub-8-GP season. If no qualifying seasons remain, the player routes to the rookie path (the existing no-qualifying-seasons contract). The GP ≥ 8 gate itself is evaluated first, so finite seasons are gated identically to before.
   > 2. **Finalization guard (after the Step 9 comp blend):** if `projectedPPG` is still non-finite (e.g. corrupted `positionPeakPPG` or team-context inputs), the projection returns `null` — the same contract as non-skill positions — with a dev-mode `console.warn`. The player is omitted from `seasonProjections`, ranks, and that day's projection snapshot.
   > The rookie path needs no guard: every rookie multiplier is a bounded table lookup whose bucket comparisons fail closed to a finite default on non-finite input.

### `docs/dynasty-scoring.md`

3. **Routing table** (after the A3 row): add a row:
   > | **A4 — Data gap** | No qualifying seasons and no other gate matched (e.g. `years_exp: null` in Sleeper metadata) | same as A2, `isDataGap: true` | `'none'` (label: "Limited Data") |

4. **After the routing table** (after the "A qualifying season requires `gamesPlayed ≥ 8`." line), add:
   > Seasons with non-finite `fantasyPoints` or `gamesPlayed` are excluded from `seasonHistory` (and from `recencyWeightedPPG`) with a dev-mode `console.warn` — one corrupted season degrades to "season skipped". If the composite still produces a non-finite `finalScore` (corrupted share/context inputs), a finalization guard returns the Limited Data result with `isNonFinite: true` instead of emitting NaN.

5. **`computeEmpiricalAgeCurves` section** (after the "Requires `gamesPlayed ≥ 10` per player-season." sentence):
   > Player-seasons with non-finite PPG are excluded from the age buckets (dev-mode `console.warn`) so one corrupted value cannot poison a position cohort's median curve point or `positionPeakPPG`.

6. **Prospect scoring section** (after the "If current-season games exist, actual PPG is blended in…" sentence):
   > The evidence blend is skipped (prior-only score, dev-mode `console.warn`) when the current-season `fantasyPoints`/`gamesPlayed` are non-finite.

### `CLAUDE.md` — no change

No module added/renamed, no command change, no factors-contract change, no data shape referenced in CLAUDE.md changes. The Limited Data contract lives in docs/dynasty-scoring.md, which is updated above. (Per the self-maintenance rule this is an explicit "nothing to update".)

### `README.md` — no change

README does not describe scoring failure modes; the docs/ files are the right depth layer.

---

## Cross-repo impact (`sleeper-dashboard-data`)

- **Upstream complement (separate data-repo task — out of scope here):** the data repo's season-totals publishing pipeline should add a **finiteness sweep** to its shape validator: assert every `fantasyPoints`, `gamesPlayed`, and per-key `stats` value is finite (`Number.isFinite`) before a season-totals file ships, failing CI on violation. That converts a silent in-app degradation into a loud failure in the repo that caused it (deep-audit → "Season-totals finite-value validation at ingestion"). This app-side firewall is the *last* line of defense, not a replacement. **Note for a follow-up data-repo task; do not attempt from this repo.**
- **Snapshot shape contract:** unchanged — no `factors` key changes, no `schemaVersion` bump. One behavioral note worth stating in the task summary: on a day with corrupted input, a player nulled by the finalization guard is **omitted** from that day's projection snapshot (identical to how non-skill players are omitted today). The data repo's snapshot registration makes no per-player completeness assumption, so no coordination is required.

---

## Out of scope (explicitly)

- `compsIntegration.js` / `careerComps.js` internal guards (covered by the finalization guard; see Changes §3).
- Any change to `clamp()` semantics, A2/A3 return bodies, the bounce-back/draft-multiplier defects (D1-A/D1-D), or anything backtest-gated.
- The data-repo finiteness validator (noted above as a separate task).
