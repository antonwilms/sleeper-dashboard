# Test infrastructure setup

## Goal

Install Vitest and backfill a focused test suite that pins the shipped behaviour of the helpers built in Threads A, B, and C, plus a schema-contract and stat-key-contract test that catch the classes of bugs the past few batches exposed (`pass_int` miss, byte-identical port claims, `factors`-key drift). After this batch lands, every future batch's Session 1 plan includes a "Tests to add" section and Session 2 ships those tests alongside the feature.

No source-code changes. Only `package.json`, a new `vitest.config.js`, new co-located `*.test.js` files, a fixture directory, and a README "Testing" subsection.

---

## Architectural decisions

### 1. Framework: Vitest

Confirmed. Native Vite integration (no separate config needed beyond `vitest.config.js`), Jest-compatible `describe/it/expect`, fast watch mode, zero-config ESM. No alternative seriously competes for a Vite + JS codebase.

### 2. Test organisation: co-located

Tests sit next to the module: `src/utils/momentum.js` → `src/utils/momentum.test.js`. Reasons:
- Easier navigation during refactors (one place to look)
- Vitest's default `include: ['**/*.{test,spec}.{js,jsx}']` picks them up with no config
- Project is small (≤ 20 utils); a `tests/` directory adds path noise

Fixtures, however, live in a single `src/__fixtures__/` directory (see §4) — they are shared across tests.

### 3. Fixture strategy: both hand-crafted and captured

- **Hand-crafted, minimal fixtures** inline in each unit-test file for pure helpers (momentum, regression, signals). Construct only the fields the function reads. Tests stay readable; intent is local.
- **Shared factory helpers** in `src/__fixtures__/factories.js` for the integration tests on `computeNextSeasonProjection` / `rookieProjection`, which take 14 arguments. A factory `makeVet({ ...overrides })` returns a complete realistic argument tuple with sensible defaults; tests override only the field under test.
- **Captured live fixture** (`src/__fixtures__/season-totals-2024.json`) for the stat-key contract test only. Real Sleeper season-totals export so the test verifies our keys actually exist in real data.

### 4. Captured fixture provenance

The stat-key contract test depends on a real `careerStats[year]` slice. The user must export this once from the running app's IndexedDB:

```js
// Run in DevTools console with the app loaded, then save to src/__fixtures__/
const db = await indexedDB.open('sleeper-dashboard-cache').then(r => r.result)
const tx = db.transaction('cache', 'readonly').objectStore('cache')
const rec = await new Promise(res => { tx.get('career-history').onsuccess = e => res(e.target.result) })
const season2024 = rec.data['2024']  // { [player_id]: { gamesPlayed, fantasyPoints, stats, ... } }
copy(JSON.stringify(season2024, null, 2))   // anonymise step below
```

**Anonymisation:** Sleeper player IDs are not personally sensitive (they're the same for every Sleeper user). League IDs are not part of `careerStats`. The captured file contains no PII; commit as-is.

**Size budget:** ~2 MB raw / ~400 KB gzip for one season of ~2,500 players' weekly stats roll-up. Acceptable. If it grows past 5 MB, drop to top-300 PPR scorers only.

**Version comment:** Top of `season-totals-2024.json` is wrapped in a one-key envelope:

```json
{
  "__fixtureVersion": "1",
  "__capturedAt": "2026-05-24",
  "__source": "sleeper IndexedDB career-history cache, season 2024",
  "__notes": "If Sleeper renames stat keys, regenerate via DevTools snippet in test-infra-setup.md §4.",
  "data": { ...real season-totals object... }
}
```

The test does `fixture.data` to unwrap. The envelope makes provenance and refresh procedure self-documenting.

### 5. Assertion style: explicit, not snapshot

Snapshot tests are tempting for `factors` but make diffs opaque ("3 lines changed in snap" instead of "added key `foo`, removed key `bar`"). Use:
- `expect(new Set(Object.keys(result.factors))).toEqual(EXPECTED_KEYS)` for shape
- `expect(result.factors.basePPG).toBeGreaterThan(8)` / `.toBeLessThan(20)` for ranges
- Exact equality only for byte-identical ports (where the spec is "same number, same input")

No `toMatchSnapshot` anywhere in this batch.

---

## `package.json` additions

```json
{
  "scripts": {
    "test":       "vitest run",
    "test:watch": "vitest",
    "test:ui":    "vitest --ui"
  },
  "devDependencies": {
    "vitest":    "^2.1.0",
    "@vitest/ui": "^2.1.0"
  }
}
```

Pin a `^2.x` line that matches `vite@^8` peer ranges; the installer resolves the exact version. No additional deps — no jsdom (tests are pure-JS, no DOM), no React Testing Library (App-layer testing is out of scope).

---

## Vitest configuration

New file: `vitest.config.js` at project root.

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',            // pure-JS utils; no DOM
    include:    ['src/**/*.test.js'],
    exclude:    ['node_modules', 'dist', '.claude'],
    globals:    false,              // use `import { describe, it, expect } from 'vitest'`
    testTimeout: 5000,              // unit tests are sub-ms; 5s catches runaway loops
  },
})
```

Do not modify `vite.config.js`. Vitest reads its own config; mixing them is unnecessary.

`.gitignore` already excludes `node_modules` and `dist`; Vitest writes nothing to disk except `.vitest-cache/`. Add one line to `.gitignore`:

```
.vitest-cache
```

---

## Per-module test specifications

### `src/utils/momentum.test.js` (B1a)

Function: `computeMomentum(ppgs, meanPPG)`.

Cases:
1. **Fewer than 4 seasons** → `{ momentum: null, momentumLabel: null }` (3-season input, empty array, null input).
2. **Stable** — `[10, 10, 10, 10]`, mean 10 → `momentum === 0`, label `'stable'`.
3. **Accelerating** — recent2 avg / prior2 avg differs by > 0.20 * mean. E.g. `[10, 10, 14, 14]`, mean 12 → momentum = (14 - 10) / 12 ≈ 0.333 → label `'accelerating'`.
4. **Improving** — momentum in (0.05, 0.20], e.g. `[10, 10, 11, 12]`, mean 10.75.
5. **Slowing** — momentum in [-0.20, -0.05).
6. **Decelerating** — momentum < -0.20.
7. **Boundary** — exactly 0.05 and 0.20 (closed-vs-open boundary verification per the inline `>` vs `>=` in the source).
8. **meanPPG floor** — `meanPPG = 0` should not divide by zero (source uses `Math.max(meanPPG, 1)`).

### `src/utils/projectionSignals.test.js` (B1b)

Functions: `computeBreakoutFlag`, `computeBounceBackFlag`, `computeTdReliance`.

`computeBreakoutFlag`:
1. **Null age** → `false` (the `age != null` guard).
2. **Old player (age > 24)** → `false`.
3. **Young + above-curve** — age 22, currentPPG 18, curve constructed so `interpolateAgeCurve(curve, 22) === 10` and `peakPPG === 20`. rawRatio = (18/20) / (10/20) = 1.8 > 1.3 → `true`.
4. **Young + at-curve** — rawRatio ≈ 1.0 → `false`.
5. **Zero ageFactor** — guard returns `false` (`ageFactor > 0 ? ... : 0`).

`computeBounceBackFlag`:
1. **< 2 qualifying** → `false`.
2. **Prior season GP >= 10** → `false` (not "shortened").
3. **Prior shortened + current beats prior max** — `[{ppg: 12, gp: 14}, {ppg: 9, gp: 8}, {ppg: 15, gp: 16}]` → `true`.
4. **Prior shortened + current beats only second-highest** — designed so currentPPG < priorMax but >= secondHighest → `true`.
5. **Mutation guard** — assert input array unchanged after call (regression for `.sort` on a copy).

`computeTdReliance`:
1. **No scoring settings** → `{ tdDependency: null, isTdReliant: false }`.
2. **No stats** → same null sentinel.
3. **Stats present but totalFP 0** → division-by-zero guard via `Math.max(totalFP ?? 0, 1)`.
4. **High TD share** — `{ rush_td: 10 }` with scoring `{ rush_td: 6 }`, totalFP 100 → tdDependency 0.60 → `isTdReliant: true`.
5. **Mixed** — pass_td + rec_td + 2pt all contribute, low overall dependency → `false`.
6. **Missing TD_STAT_KEY in scoring** — code skips (`statVal != null && multiplier != null`); verify no NaN.

### `src/utils/regressionSignals.test.js` (B2)

Functions: `computeTrajectory`, `computeConsistency`.

`computeTrajectory`:
1. **< 2 seasons** → both null.
2. **Flat series** `[10, 10, 10, 10]` → slope 0, normalizedSlope 0.
3. **Rising series** `[8, 10, 12, 14]` → positive slope; normalizedSlope > 0 and bounded.
4. **Falling series** → negative slope.
5. **Mean floor** — series with mean < 4 (e.g. `[1, 2, 3]`) uses floor of 4 in denominator. Assert exact value matches `slope / 4` not `slope / mean`.
6. **Non-finite guard** — explicitly constructed degenerate input that yields non-finite (likely impossible from inputs, but still document the guard returns nulls).

`computeConsistency`:
1. **< 3 seasons** → `{ consistencyScore: null }`.
2. **Constant series** `[12, 12, 12]` → cv 0 → score 100.
3. **Highly variable series** — large cv → score 0 (clamped).
4. **meanPPG 0** — cv defaults to 1 → score 0.
5. **Steady mid** — known sample, assert score within ±1 of computed expected.

### `src/utils/compsIntegration.test.js` (B3)

Function: `computeCompBlend`.

Mock `findCareerComps` and `compsProjectedPPG` via `vi.mock('./careerComps')` since `careerComps.js` reads its module-level cache and constructing live comps inputs is heavyweight.

Cases:
1. **No comps** (`findCareerComps` returns `[]`) → blendedPPG === pipelinePPG, compBlendWeight 0.
2. **Comps present but compPPG null** — same ineligible path.
3. **Comps present, < 2 subsequent seasons total** — ineligible.
4. **Eligible, low pipeline confidence** — pipelineUncertainty 1.0 → larger blend weight; assert blendedPPG between pipelinePPG and compPPG.
5. **Eligible, high pipeline confidence** — pipelineUncertainty 0.25 → smaller blend weight.
6. **Clamp** — verify blendedPPG clamped to [0, 40].
7. **compBlendWeight upper bound** — assert <= MAX_COMP_WEIGHT (0.35) for the saturating case (many high-sim comps, low pipeline confidence).

### `src/utils/efficiencyMetrics.test.js` (C1)

Function: `computeEfficiencyFactor`.

Cases:
1. **Unsupported position** (`K`) → NEUTRAL.
2. **No lastSeasonStats** → NEUTRAL.
3. **No careerStats** → NEUTRAL.
4. **Zero opportunities** — `pass_att: 0` → rawMetrics all null, available empty → NEUTRAL.
5. **QB happy path** — construct a careerStats with 30 QB seasons producing a known cohort distribution; player with median efficiency → factor ≈ 1.0. Player with elite efficiency → factor > 1.05.
6. **Shrinkage** — low-opportunity (50 attempts) player with 99th-percentile raw ratios → shrunkPct pulls toward 50 → factor closer to 1.0 than the unshrunk version would be. Compare against a high-opportunity (500 attempts) player with the same raw ratios.
7. **Invert (intRate)** — high INT% maps to low factor contribution.
8. **Cohort cache** — call twice with the same `careerStats` reference, assert second call does not rebuild (instrument by checking that mutating the cohort table between calls is preserved — or check by spying on `playersMap` access count; simpler: assert exact equality of two consecutive results with same inputs).
9. **`pass_int` key present** — this is the regression test for the original miss: build a fixture where `stats.pass_int` is set and verify the intRate metric actually fires (not always null).

### `src/utils/ktcHistory.test.js` (C2)

Function: `computeKtcSignals` only. (`loadKtcHistory` is async I/O, mocked-cache-heavy — deferred to a future integration batch.)

Cases:
1. **Null series** → all 13 keys present, all signal values null except `ktcHistSampleSize: 0` and `ktcHistConfidence: 'none'`.
2. **1-point series** → same all-null shape, sampleSize 1.
3. **2-point rising series** — `[{date: '2026-01-01', value: 5000, positionRank: 5, valueVsPosMedian: 1.2}, {date: '2026-01-08', value: 5500, positionRank: 4, valueVsPosMedian: 1.3}]`. Assert delta 500, deltaPct 0.1, label `'rising'`, confidence `'low'`.
4. **8-point series** — confidence `'high'`, all signals populated.
5. **Flat series** — slope 0 → label `'flat'`.
6. **Falling series** — label `'falling'`, rvm label `'losing'`.
7. **`windowSpanDays` calculation** — verify date-difference math (use known dates 7 days apart).
8. **Output shape contract** — every call returns exactly the 13 keys (no more, no fewer). This is the signal-key drift guard.

### `src/utils/fantasyPoints.test.js`

Functions: `calculateFantasyPoints`, `getCategoryPoints`. (`getPointsBreakdown` is debug-only — out of scope.)

`calculateFantasyPoints`:
1. **Empty scoring** → 0.
2. **Empty stats** → 0.
3. **Standard PPR sample** — assert exact total via dot-product.
4. **Null multipliers ignored** — `{ pass_yd: null, pass_td: 4 }` should not throw.
5. **Key in stats absent from scoring** — silently skipped.
6. **2-decimal rounding** — input that yields 12.345 returns 12.35 (round-half-up by `Math.round`).

`getCategoryPoints`:
1. **Null stats / null scoring** → all-zero buckets.
2. **Categorisation correctness** — keys `pass_yd`, `rush_yd`, `rec_yd`, `rec`, `bonus_rec_te`, `pass_int`, `fum_lost` placed in correct buckets per the `categorizeKey` prefix logic. (`rec` and `rec_*` → `'rec'`; `bonus_rec_te` starts with `bonus_` → `'other'`; `pass_int` → `'pass'`; `fum_lost` → `'other'`.)
3. **Exact arithmetic** — known stat + scoring combo, verify per-bucket totals.
4. **Output shape** — always exactly 4 keys.

### `src/utils/projectionSnapshot.test.js` (Thread A)

Functions: `buildProjectionSnapshot`, `deriveScoringBasis`.

`deriveScoringBasis`:
1. **null** → `'unknown'`.
2. **`{ rec: 1 }`** → `'ppr'`.
3. **`{ rec: 1, bonus_rec_te: 0.5 }`** → `'te_premium'` (precedence check — checked before plain PPR).
4. **`{ rec: 0.5 }`** → `'half_ppr'`.
5. **`{ rec: 0 }`** → `'standard'`.
6. **`{ rec: 0.75 }`** → `'custom'`.
7. **`{ rec: 1, bonus_rec_fd: 0.5 }`** → `'custom'` (FD bonus disqualifies plain PPR).

`buildProjectionSnapshot`:
1. **Happy path** — provide 3 projections, 3 players in playerMap (one with no team), assert returned `players` excludes the teamless one; `teamsInSnapshot` covers only included players' teams; `schemaVersion === 1`; `capturedAt` is an ISO string.
2. **`now` override** — passed `now: new Date('2026-05-24T00:00:00Z')` → `capturedAt === '2026-05-24T00:00:00.000Z'`.
3. **No KTC entry** — player not in ktcMap → `players[id].ktc === null`.
4. **KTC present** — `ktc.value` and `ktc.positionPercentile` populated.

`writeProjectionSnapshot` (idempotency / IndexedDB) — deferred. Pure builder is the high-value test.

---

## Schema contract test

File: `src/__tests__/factorsSchema.test.js` (separate from `src/utils/` because it cross-cuts modules).

Two key sets enumerated from the current source (`src/utils/seasonProjection.js`):

```js
// Returned from rookieProjection, plus 13 ktcSignals keys merged in main.
const ROOKIE_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'durabilityFactor',
  'teamFactor', 'depthFactor', 'ktcMult', 'collegeMult', 'ktcPct',
  'collegeBase', 'productionTrend', 'productionTrendAdjust',
  'finalYearDominator', 'finalYearAdjust', 'breakoutAge', 'breakoutAgeFactor',
  'collegeContribution', 'rookieAgeAtDraft',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  // ktcSignals (13):
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
])

const VET_FACTORS_KEYS = new Set([
  'basePPG', 'ageDelta', 'shareTrend', 'regressionFactor', 'regressionFactorRaw',
  'consistencyScore', 'consistencyBand', 'consistencyScale',
  'durabilityFactor', 'teamFactor', 'depthFactor',
  'momentumFactor', 'momentumLabel', 'absenceShapeFactor', 'absenceShape',
  'shareTrendRaw', 'shareVolatilityLabel', 'shareVolatilityScale',
  'qbQualityFactor', 'qbQualityScore', 'combinedNewFactor',
  'isBreakout', 'breakoutFactor', 'isBounceBack', 'bounceBackFactor',
  'isTdReliant', 'tdRelianceFactor', 'tdDependency',
  'trajectoryFactor', 'trajectoryNormalized',
  'efficiencyFactor', 'efficiencyIndex', 'efficiencyMetrics',
  'positionMultiplicityRatio', 'primaryCategory', 'primaryCategoryPoints', 'secondaryCategoryPoints',
  'pipelinePPG', 'compPPG', 'compCount', 'compAvgSimilarity', 'compConfidence', 'compBlendWeight',
  // ktcSignals (13):
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
])
```

Vet count: 42 + 13 = **55 keys**. Rookie count: 23 + 13 = **36 keys**.

Test body (sketch):

```js
import { computeNextSeasonProjection } from '../utils/seasonProjection'
import { makeVet, makeRookie } from './__fixtures__/factories'   // see §integration

it('vet projection emits exactly the documented factors keys', () => {
  const r = computeNextSeasonProjection(...makeVet().asArgs())
  expect(new Set(Object.keys(r.factors))).toEqual(VET_FACTORS_KEYS)
})

it('rookie projection emits exactly the documented factors keys', () => {
  const r = computeNextSeasonProjection(...makeRookie().asArgs())
  expect(new Set(Object.keys(r.factors))).toEqual(ROOKIE_FACTORS_KEYS)
})

it('value types', () => {
  const r = computeNextSeasonProjection(...makeVet().asArgs())
  expect(typeof r.factors.basePPG).toBe('number')
  expect(['steady', 'moderate', 'erratic', null]).toContain(r.factors.consistencyBand)
  expect(['accelerating','improving','stable','slowing','decelerating', null]).toContain(r.factors.momentumLabel)
  // ... a handful more type / enum assertions for the highest-risk fields
})
```

Going forward: any batch that adds a key updates these sets — test failure is the forcing function.

---

## Stat-key contract test

File: `src/__tests__/statKeysContract.test.js`.

Enumerate every Sleeper stat key referenced anywhere in projection code:

```js
// projectionSignals.js TD_STAT_KEYS
const TD_KEYS = ['rush_td', 'rec_td', 'pass_td', 'rush_2pt', 'rec_2pt', 'pass_2pt',
                 'def_td', 'def_st_td', 'st_td', 'fum_rec_td']

// efficiencyMetrics.js ratios + opportunity denominators
const EFFICIENCY_KEYS = ['pass_att', 'pass_yd', 'pass_td', 'pass_int',
                         'rush_att', 'rush_yd', 'rush_td',
                         'rec_tgt', 'rec', 'rec_yd', 'rec_td']

const ALL_REFERENCED_KEYS = new Set([...TD_KEYS, ...EFFICIENCY_KEYS])
```

Test loads `src/__fixtures__/season-totals-2024.json`, unwraps `.data`, and for each key asserts that **at least one player-stats object in the season has that key as a non-null finite number** (offence keys: QB sample must cover pass_*; RB sample must cover rush_*; WR/TE must cover rec_*; defense/ST keys: any player having the key is fine — they appear on individual position rows when the league tracks them).

Failure message lists the missing keys explicitly:

```
Stat keys referenced in projection code but absent from captured fixture: [pass_int, foo_bar]
This is exactly the bug class that caused the C1 pass_int issue. Either:
  • The key was renamed in Sleeper's response → update the consumer.
  • The fixture is stale → regenerate per §4.
```

This is the single most important test in the suite.

**Missing-fixture handling:** if `season-totals-2024.json` is absent (e.g. fresh clone before user exports), the test calls `it.skip(...)` with a clear console warning pointing at §4. CI eventually flips this from skip to fail once a fixture is committed.

---

## Integration tests

File: `src/utils/seasonProjection.test.js` and `src/__fixtures__/factories.js`.

### Factory pattern (`factories.js`)

A `MockProjection` builder with chainable / spread overrides:

```js
export function makeVet(overrides = {}) {
  const playerId = overrides.playerId ?? 'P1'
  const player = {
    position: 'WR', age: 26, years_exp: 5, team: 'SF',
    depth_chart_order: 1, ...overrides.player,
  }
  const careerStats = overrides.careerStats ?? defaultVetCareerStats(playerId)
  return {
    asArgs: () => [
      playerId,
      { [playerId]: player, ...overrides.playersMap },
      careerStats,
      overrides.empiricalCurves ?? defaultCurves(),
      overrides.positionPeakPPG ?? { QB: 20, RB: 18, WR: 18, TE: 14 },
      overrides.historicalShares ?? {},
      overrides.depthMap ?? { [playerId]: { depthOrder: 1 } },
      overrides.teamContext ?? { teamOffense: { SF: { rank: 5 } } },
      overrides.scoringSettings ?? defaultPPRScoring(),
      overrides.ktcMap ?? null,
      overrides.collegeStats ?? null,
      overrides.currentSeason ?? 2025,
      overrides.qbQualityByTeam ?? null,
      overrides.ktcHistory ?? null,
    ],
  }
}
// makeRookie() — same shape, player.years_exp = 0, careerStats empty.
```

`defaultVetCareerStats(playerId)`: synthesises 5 seasons of stats with realistic per-season `gamesPlayed`, `fantasyPoints`, `weeklyPoints`, and a minimal `.stats` populated with the keys efficiencyMetrics needs.

Goal: each test reads `const args = makeVet({ player: { age: 30 } }).asArgs()` — single-line override, full readable intent.

### Vet integration cases

1. **Fully-equipped vet** (5 qualifying seasons, comps available via mocked careerComps, KTC history present, all signals firing):
   - All 55 vet `factors` keys present (covered also by schema test; assert here as belt-and-suspenders).
   - `projectedPPG` in (5, 25) — sanity range, not exact.
   - `combinedNewFactor` strictly within `[0.78, 1.30]` clamp.
   - `confidence === 'high'`.
   - `projectedGames` in `[8, 17]`.
2. **Bare-minimum vet** — `years_exp: 2`, single qualifying season (just enough not to route to rookie path), no comps, no KTC history, no scoringSettings:
   - Pipeline still returns a number; no throws.
   - `isBounceBack === null` (qualifying.length < 2).
   - `tdDependency === null` (no scoring settings).
   - `combinedNewFactor` defaults toward 1.0 (most factors at 1.0 sentinel).
   - `confidence === 'low'`.
3. **Clamp binds from above** — all positive signals (momentumLabel='accelerating', isBreakout=true, isBounceBack=true, efficiencyFactor at upper bound, trajectoryFactor at cap, qbQualityFactor at +5%). Verify `combinedNewFactor === 1.30` exactly (clamp).
4. **Clamp binds from below** — all negative signals. Verify `combinedNewFactor === 0.78` exactly.

### Rookie integration cases

1. **Year-1 rookie with full college data** — years_exp 0, age 22, KTC pct 80, peakDominator 32 → all 36 rookie keys present; `rookieAgeAtDraft === 22`; `ageMult === 1.05`; `collegeBase === 1.20`.
2. **Year-2 sophomore (years_exp 1)** — age 23 → `rookieAgeAtDraft === 22` (subtracted). Verify draft-age substitution fires.
3. **Year-4 failed-to-launch routed to rookie path** — years_exp 3, no qualifying seasons, age 25 → `rookieAgeAtDraft === null` (the `yearsExp <= 1` gate); `ageForLookup === 25` → `ageMult === 0.82`.
4. **Rookie without college data** — `collegeStats === null` → `collegeMult === 1.0`, `breakoutAgeFactor === 1.0`, `collegeContribution === 1.0`.
5. **Rookie with KTC** — verify `ktcPct` populated, `ktcMult` between 0.70 and 1.30.

---

## Fixture files

| File | Format | Provenance | Size budget |
|---|---|---|---|
| `src/__fixtures__/season-totals-2024.json` | JSON envelope (see §4) | User export from IndexedDB | < 5 MB |
| `src/__fixtures__/factories.js` | ES module | Hand-crafted | < 200 lines |

No other fixture files. Unit tests embed inputs inline.

---

## Implementation sequence (for Session 2)

Each step ends with `npm test` (or `npm run build` where no tests touch it yet) passing before the next step starts.

1. Install Vitest: `npm install -D vitest@^2 @vitest/ui@^2`. Add scripts to `package.json`. Add `vitest.config.js`. Add `.vitest-cache` to `.gitignore`. Run `npm test` → "no test files found" is the expected pass state.
2. Write `src/utils/momentum.test.js`. Run `npm test` → passes.
3. Write `src/utils/projectionSignals.test.js`. Tests pass.
4. Write `src/utils/regressionSignals.test.js`. Tests pass.
5. Write `src/utils/fantasyPoints.test.js`. Tests pass.
6. Write `src/utils/projectionSnapshot.test.js`. Tests pass.
7. Write `src/utils/ktcHistory.test.js` (computeKtcSignals only). Tests pass.
8. Write `src/utils/efficiencyMetrics.test.js`. Tests pass.
9. Write `src/utils/compsIntegration.test.js` (with `vi.mock('./careerComps')`). Tests pass.
10. Write `src/__fixtures__/factories.js`. No tests yet — used by integration & schema next.
11. Write `src/__tests__/factorsSchema.test.js`. Tests pass.
12. Write `src/utils/seasonProjection.test.js` (integration). Tests pass.
13. **Stop. Ask the user to export the captured fixture** per §4 instructions. They drop `season-totals-2024.json` into `src/__fixtures__/`.
14. Write `src/__tests__/statKeysContract.test.js`. Tests pass (or fail loudly, surfacing real bugs — which is the test doing its job).
15. Update README.md "Testing" subsection per §README updates below.
16. `npm test && npm run build` both green → batch complete.

If any step fails because the *test is wrong*, fix the test. If any step fails because *the code is wrong* (e.g. stat-key contract surfaces a missing key), stop and report to the user — source changes are out of scope for this batch and need their own plan.

---

## Edge cases and risks

### What this suite does NOT catch

- App.jsx pipeline ordering bugs (no UI / component tests).
- IndexedDB integration (`writeProjectionSnapshot`, `loadKtcHistory`, `cache.js` round-trip).
- Sleeper / KTC / CFBD API contract drift beyond the captured-fixture stat-key set.
- Tailwind / CSS regressions.
- React rendering or hook ordering issues.
- Performance regressions (test runtime is asserted but pipeline runtime in production is not).
- Browser-only behaviour (clipboard, download triggers, etc.).

The user should understand: **a green test suite means the pure helpers behave correctly with their documented inputs. It does not mean the app works.** Manual smoke-test of the live app remains necessary.

### Fixture obsolescence

The captured `season-totals-2024.json` becomes stale if Sleeper renames keys. The version envelope (§4) and the `__capturedAt` field surface this. Refresh procedure documented in §4 and again at the top of `statKeysContract.test.js` as a comment.

### Test brittleness

Hard-pinned exact PPG values would break on every formula tweak. Mitigation: range assertions (`toBeGreaterThan` / `toBeLessThan`), key-set assertions, type / enum assertions. Exact-equality only for byte-identical ports of `dynastyScore.js` formulas (the whole point of those is byte-equality).

### Byte-identical-to-dynastyScore.js drift

The byte-identical claims (momentum, isBreakout, isBounceBack, isTdReliant, weighted regression, stdDev, consistency) are documented in source comments but not enforced. **Future improvement** (out of scope here): a separate test that runs the same fixture inputs through both the new helper and the inline `dynastyScore.js` logic and asserts equality. Skipped now because dynastyScore.js's inline blocks are not currently exported separately — extracting them would be a source change. Add to a future batch.

### Integration test setup complexity

`computeNextSeasonProjection` takes 14 args. Mitigation: `makeVet` / `makeRookie` factories (§Integration / factory pattern). One override line per test.

### Fixture size / repo bloat

Soft cap 5 MB on `season-totals-2024.json`. If exceeded, narrow to top-300 PPR scorers and document the narrowing at the top of the file.

### Vitest version pin

`vite@^8` is recent; verify `vitest@^2` peer-deps cleanly during install. If not, fall back to `vitest@latest` and pin to the resolved version.

---

## README updates

Add a new section under existing "Running locally" (around line 31):

````markdown
## Testing

Tests use [Vitest](https://vitest.dev). Run the suite once:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

UI:

```bash
npm run test:ui
```

Test files live next to the modules they cover (`src/utils/foo.js` → `src/utils/foo.test.js`). Cross-cutting tests live in `src/__tests__/`. Shared fixture factories live in `src/__fixtures__/factories.js`.

### The captured season-totals fixture

`src/__tests__/statKeysContract.test.js` requires `src/__fixtures__/season-totals-2024.json`, a real Sleeper season-totals export. Regenerate it whenever Sleeper changes their stat-key schema. With the app running, in the browser DevTools console:

```js
const db = await indexedDB.open('sleeper-dashboard-cache').then(r => r.result)
const tx = db.transaction('cache', 'readonly').objectStore('cache')
const rec = await new Promise(res => { tx.get('career-history').onsuccess = e => res(e.target.result) })
copy(JSON.stringify({
  __fixtureVersion: '1',
  __capturedAt: new Date().toISOString().slice(0, 10),
  __source: 'sleeper IndexedDB career-history cache, season 2024',
  data: rec.data['2024'],
}, null, 2))
```

Paste into `src/__fixtures__/season-totals-2024.json`. No PII; safe to commit.

### Scope

The suite covers pure utility helpers, the projection schema contract, the stat-key contract, and `computeNextSeasonProjection` end-to-end. It does **not** cover App.jsx pipeline integration, React components, IndexedDB I/O, or live API behaviour. Manual smoke-testing the running app remains necessary.
````

No other README sections change.

---

## Workflow template updates (for the CLAUDE.md two-session pattern)

The `CLAUDE.md` section "What belongs in a task file" lists required sections. Add **Tests to add** to that table, between **Acceptance criteria** and **Out of scope**:

| **Tests to add** | List of concrete test files and per-file test cases the implementer should write. Reference the corresponding test-infra-setup.md patterns (factories, schema contract, etc.). If the batch is doc-only or pure refactor, write "none — refactor only" with a one-line justification. |

And the Session 2 step list in CLAUDE.md currently ends:

> 5. Update README.md if the task file lists it under "Documentation" — otherwise leave it.

Add a step 6:

> 6. Apply the tests specified in the task file's "Tests to add" section. Run `npm test` and `npm run build`; both must pass before the session ends. If the task file's tests section says "none — refactor only", skip this step.

These edits are documentation in `CLAUDE.md` — making them is in scope for **a follow-up doc batch**, not this implementation batch. The Session 2 implementer should not edit `CLAUDE.md`. Surfacing the text here is so the user can paste it themselves (or queue it as a sonnet doc-only follow-up).

---

## Open questions

1. **Captured fixture export — user action required.** The user must export `season-totals-2024.json` per §4 once the implementation reaches step 13. Confirm willingness, or propose a deferral path (skip the stat-key contract test until next batch).
2. **Which season to capture.** 2024 chosen because it's the most recent completed season as of 2026-05-24 and is presumably already cached. If 2025 is also cached and complete by the time the implementation runs, use 2025 instead and rename accordingly.
3. **`writeProjectionSnapshot` / `loadKtcHistory` async I/O tests.** Deferred. Confirm OK to defer, or expand scope to mock `idb` and add round-trip tests now.
4. **CLAUDE.md doc update.** Confirm: queue as a separate sonnet doc batch, not edited in this batch.
5. **`careerComps.js` mocking.** Plan uses `vi.mock('./careerComps')` for `compsIntegration.test.js` because the live function reads a module-level cache and constructing live comps inputs is heavyweight. Confirm — alternative is a full integration fixture for findCareerComps, which is much more code for marginal value.
