# Refactor: `computeNextSeasonProjection` → options object

**Session type:** sonnet implements  
**Status:** ready for implementation  
**Risk level:** low — mechanical, no logic change, high test coverage

---

## Verification findings

### 1. Exact current signature (`src/utils/seasonProjection.js:236–242`)

```js
export function computeNextSeasonProjection(
  playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, historicalShares, depthMap,
  teamContext, scoringSettings, ktcMap, collegeStats,
  currentSeason, qbQualityByTeam = null, ktcHistory = null,
  nflDraftMatches = null               // NEW (D1)
)
```

15 positional args. The last three default to `null`. The first 12 are required (no default). The function body does NOT read any args by position — it immediately uses the named parameters as variables, so the destructure-at-top change is transparent to the body.

### 2. App.jsx call site (`src/App.jsx:899–904`)

```js
const proj = computeNextSeasonProjection(
  row.player_id, leagueData.playerMap, careerStats, empiricalCurves,
  positionPeakPPG, historicalShares, depthMap, teamContext,
  leagueData.scoringSettings, ktcMap, collegeStats, currentSeason, qbQualityByTeam, ktcHistory,
  nflDraftMatches,
)
```

All 15 args supplied explicitly. None conditionally undefined beyond what the function already handles internally. `qbQualityByTeam`, `ktcHistory`, and `nflDraftMatches` are React state that may be `null` at call time — they're passed as-is, same as before.

### 3. Factory `.asArgs()` shape (`src/__fixtures__/factories.js:244–260`, `284–300`)

`makeVet()` and `makeRookie()` both return an object with a single `.asArgs()` method. The method returns a 15-element array — position 1 is `playerId`, position 15 is `nflDraftMatches ?? null`. The arrays are positional and order-sensitive.

The file also contains a header comment block (lines 1–44) that:
- Documents the `.asArgs()` method name by name
- Has a "PARAMETER ORDER (matches computeNextSeasonProjection signature)" section listing all 15 as a numbered list

### 4. Grep-confirmed call sites (exhaustive)

| File | Lines | Pattern |
|------|-------|---------|
| `src/utils/seasonProjection.js` | 236 | **Function definition** |
| `src/App.jsx` | 899 | **Production call** — 1 positional call, all 15 args |
| `src/__fixtures__/factories.js` | 244, 284 | Not a call — array return in `.asArgs()` |
| `src/utils/seasonProjection.test.js` | 161, 186, 223, 263, 298, 301, 340, 379, 390, 418, 433, 445, 471, 492, 534, 568, 609, 649, 652, 681, 714, 735, 754, 770, 805, 846, 878, 902, 924, 938, 1009, 1018, 1066, 1086, 1104, 1122, 1133, 1153, 1169, 1196, 1203, 1240, 1249, 1258, 1267, 1279, 1299, 1346 | **All 47 calls use `...makeVet().asArgs()` or `...makeRookie().asArgs()` spread** — confirmed by reading call sites; multi-line calls where the closing `.asArgs()` appears on the next line explain why some grep hits lacked the `asArgs` token on the match line |
| `src/__tests__/factorsSchema.test.js` | 170, 177, 194, 239 | `computeNextSeasonProjection(VET_ID, ...SHARED_ARGS)` — array spread with separate first arg |
| `src/__tests__/factorsSchema.test.js` | 182, 189 | `computeNextSeasonProjection(RK_ID, ...ROOKIE_ARGS)` — array spread with separate first arg |
| `src/__tests__/factorsSchema.test.js` | 288 | Direct positional — 15 args (QB test) |
| `src/__tests__/factorsSchema.test.js` | 305 | Direct positional — 14 args (kicker test; `nflDraftMatches` absent, relies on default) |

**No other call sites exist in `src/`.** The `factorsSchema.test.js` is the second test file — it was NOT called out in the task brief and is a required change.

### `SHARED_ARGS` / `ROOKIE_ARGS` shape in `factorsSchema.test.js`

`SHARED_ARGS` (lines 127–141) is a 13-element array:

```js
const SHARED_ARGS = [
  vetPlayersMap,                              // arg 2
  vetCareerStats,                             // arg 3
  {},                                         // arg 4: empiricalCurves
  { QB: 20, RB: 18, WR: 18, TE: 14 },        // arg 5: positionPeakPPG
  {},                                         // arg 6: historicalShares
  { [VET_ID]: { depthOrder: 1 } },           // arg 7: depthMap
  { teamOffense: { SF: { rank: 5 } } },      // arg 8: teamContext
  null,                                       // arg 9: scoringSettings
  null,                                       // arg 10: ktcMap
  null,                                       // arg 11: collegeStats
  2025,                                       // arg 12: currentSeason
  null,                                       // arg 13: qbQualityByTeam
  null,                                       // arg 14: ktcHistory
  // nflDraftMatches (arg 15) ABSENT → relies on positional default = null
]
// Used as: computeNextSeasonProjection(VET_ID, ...SHARED_ARGS) → 14 total
```

`ROOKIE_ARGS` (lines 150–164) has the same structure (13 elements, no `nflDraftMatches`).

### 5. Docs containing the positional signature

- **`docs/projection.md:5`** — contains the full 14-arg signature string (missing `nflDraftMatches`, which was added in D1 but not updated in the doc). **Must be updated.**
- **`docs/architecture.md:84`** — mentions the function by name and output shape only; no positional signature. No change needed.

### 6. CLAUDE.md

The navigation table names the function descriptively but does not document the argument list. The invariants section mentions "factors contract" but not the positional signature. **No CLAUDE.md change needed.**

---

## Naming choice: `.asArgs()` → `.asOptions()`

**Decision: rename to `.asOptions()`.**

Rationale: `.asArgs()` communicates a positional array ("spread these as args"). After the refactor the method returns an object literal, not an array. Keeping the name `.asArgs()` while changing the return type from array to object would be actively misleading — "args" conventionally implies positional. Renaming to `.asOptions()` is accurate and self-documenting.

Cost: every test call in `seasonProjection.test.js` changes from `...makeVet().asArgs()` to `makeVet().asOptions()` (drop the spread operator, rename the method). This is a systematic, grep-and-replace-safe change with no logic implication.

---

## Default value parity

Positional signature: `qbQualityByTeam = null, ktcHistory = null, nflDraftMatches = null`  
Destructure: `{ ..., qbQualityByTeam = null, ktcHistory = null, nflDraftMatches = null }`

These are semantically identical:
- In the positional case, passing `undefined` for arg 13 (or omitting it) gives `null` via the default.
- In the destructure case, passing an options object without `qbQualityByTeam` (or with `qbQualityByTeam: undefined`) also gives `null` via the destructure default.

The `factorsSchema.test.js` `SHARED_ARGS` / `ROOKIE_ARGS` currently omit `nflDraftMatches` (only 14 total args), which today resolves to `null` via the positional default. After the refactor, the corresponding `SHARED_OPTIONS` / `ROOKIE_OPTIONS` objects should include `nflDraftMatches: null` explicitly for clarity — though omitting it would also be fine (destructure default handles it). The plan recommends including it explicitly to keep the options object self-documenting.

---

## Implementation step sequence

Execute **steps 1 and 2 together** (function definition + App.jsx) — they must stay in sync. After step 2, `npm test` must be green before continuing.

### Step 1 — `src/utils/seasonProjection.js:236`

Replace the 15-positional-arg signature with a single destructured options parameter:

```js
export function computeNextSeasonProjection({
  playerId,
  playersMap,
  careerStats,
  empiricalCurves,
  positionPeakPPG,
  historicalShares,
  depthMap,
  teamContext,
  scoringSettings,
  ktcMap,
  collegeStats,
  currentSeason,
  qbQualityByTeam = null,
  ktcHistory = null,
  nflDraftMatches = null,
}) {
```

The closing `}` of the old signature becomes the `}) {` of the new one. No other change inside the function body.

### Step 2 — `src/App.jsx:899`

Replace the positional call with an object literal:

```js
const proj = computeNextSeasonProjection({
  playerId:        row.player_id,
  playersMap:      leagueData.playerMap,
  careerStats,
  empiricalCurves,
  positionPeakPPG,
  historicalShares,
  depthMap,
  teamContext,
  scoringSettings: leagueData.scoringSettings,
  ktcMap,
  collegeStats,
  currentSeason,
  qbQualityByTeam,
  ktcHistory,
  nflDraftMatches,
})
```

**Run `npm test` after steps 1+2.** All tests will fail at this point (factories still return arrays, test calls still spread arrays) — this is expected and confirms that steps 3–5 are required.

Actually: **do not run tests in intermediate broken state**. Update all five files before running `npm test`. The reason is that changing the function signature alone breaks 47 calls in `seasonProjection.test.js` and 9 calls in `factorsSchema.test.js`. It is cleaner to do the full conversion atomically and then run the suite once.

Recommended execution order:
1. `src/utils/seasonProjection.js` (signature)
2. `src/App.jsx` (call site)
3. `src/__fixtures__/factories.js` (rename `.asArgs()` → `.asOptions()`, return object)
4. `src/utils/seasonProjection.test.js` (all factory calls)
5. `src/__tests__/factorsSchema.test.js` (all call patterns)
6. `docs/projection.md` (signature line)
7. Run `npm test` → green
8. Run `npm run build` → clean

### Step 3 — `src/__fixtures__/factories.js`

**3a. Update the top-of-file comment block (lines 1–44):**

- Change "Each factory returns an object with an `.asArgs()` method that **spreads into** computeNextSeasonProjection's **15-argument signature**:" to "Each factory returns an object with an `.asOptions()` method that **passes directly as** computeNextSeasonProjection's **options object**:"
- Update both USAGE examples to remove the `...` spread and use `.asOptions()`
- Change section header "PARAMETER ORDER (matches computeNextSeasonProjection signature)" to "Option keys (all 15 accepted by computeNextSeasonProjection)"
- Remove the "matches computeNextSeasonProjection signature" parenthetical; the numbered list becomes an unordered list (order is now irrelevant), or keep numbered for readability but note "order is now irrelevant"

**3b. In `makeVet()` (lines 242–261):**

Rename `asArgs` → `asOptions` and change the return from an array to an object:

```js
return {
  playerId,
  asOptions: () => ({
    playerId,
    playersMap:        { [playerId]: player, ...(overrides.extraPlayers ?? {}) },
    careerStats:       cs,
    empiricalCurves:   overrides.empiricalCurves   ?? defaultCurves(),
    positionPeakPPG:   overrides.positionPeakPPG   ?? DEFAULT_PEAK_PPG,
    historicalShares:  overrides.historicalShares   ?? {},
    depthMap:          overrides.depthMap           ?? { [playerId]: { depthOrder: 1 } },
    teamContext:       overrides.teamContext        ?? { teamOffense: { KC: { rank: 8 } } },
    scoringSettings:   overrides.scoringSettings    ?? null,
    ktcMap:            overrides.ktcMap             ?? null,
    collegeStats:      overrides.collegeStats       ?? null,
    currentSeason:     overrides.currentSeason      ?? 2025,
    qbQualityByTeam:   overrides.qbQualityByTeam    ?? null,
    ktcHistory:        overrides.ktcHistory         ?? null,
    nflDraftMatches:   overrides.nflDraftMatches    ?? null,
  }),
}
```

**3c. In `makeRookie()` (lines 282–301):** same transformation.

### Step 4 — `src/utils/seasonProjection.test.js`

**Every** `computeNextSeasonProjection(...makeVet({...}).asArgs())` becomes `computeNextSeasonProjection(makeVet({...}).asOptions())` — remove the spread operator `...` and rename `asArgs` to `asOptions`.

Same for every `...makeRookie({...}).asArgs()` → `makeRookie({...}).asOptions()`.

The header comment at line 9 says "constructs the 15 inputs that computeNextSeasonProjection needs" — update to "constructs the options object with 15 keys that computeNextSeasonProjection needs".

This is a safe global find-and-replace: `...makeVet(` → `makeVet(` (removing spread) + `.asArgs()` → `.asOptions()`. Do both substitutions. Verify the call count: 47 call sites, all factory-based.

### Step 5 — `src/__tests__/factorsSchema.test.js`

**5a. Convert `SHARED_ARGS` to `SHARED_OPTIONS` (lines 127–141):**

```js
const SHARED_OPTIONS = {
  playerId:         VET_ID,
  playersMap:       vetPlayersMap,
  careerStats:      vetCareerStats,
  empiricalCurves:  {},
  positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
  historicalShares: {},
  depthMap:         { [VET_ID]: { depthOrder: 1 } },
  teamContext:      { teamOffense: { SF: { rank: 5 } } },
  scoringSettings:  null,
  ktcMap:           null,
  collegeStats:     null,
  currentSeason:    2025,
  qbQualityByTeam:  null,
  ktcHistory:       null,
  nflDraftMatches:  null,
}
```

Update the comment above it from "Base args shared by both vet calls below" to "Base options shared by both vet calls below".

**5b. Convert `ROOKIE_ARGS` to `ROOKIE_OPTIONS` (lines 150–164):**

```js
const ROOKIE_OPTIONS = {
  playerId:         RK_ID,
  playersMap:       rookiePlayersMap,
  careerStats:      {},
  empiricalCurves:  {},
  positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
  historicalShares: {},
  depthMap:         {},
  teamContext:      {},
  scoringSettings:  null,
  ktcMap:           null,
  collegeStats:     null,
  currentSeason:    2025,
  qbQualityByTeam:  null,
  ktcHistory:       null,
  nflDraftMatches:  null,
}
```

**5c. Update all vet-path calls (lines 170, 177, 194, 239):**

`computeNextSeasonProjection(VET_ID, ...SHARED_ARGS)` → `computeNextSeasonProjection(SHARED_OPTIONS)`

**5d. Update all rookie-path calls (lines 182, 189):**

`computeNextSeasonProjection(RK_ID, ...ROOKIE_ARGS)` → `computeNextSeasonProjection(ROOKIE_OPTIONS)`

**5e. Convert the QB direct call (lines 288–294):**

```js
const r = computeNextSeasonProjection({
  playerId:         QB_ID,
  playersMap:       qbPlayersMap,
  careerStats:      qbCareerStats,
  empiricalCurves:  {},
  positionPeakPPG:  { QB: 22, RB: 18, WR: 18, TE: 14 },
  historicalShares: {},
  depthMap:         { [QB_ID]: { depthOrder: 1 } },
  teamContext:      { teamOffense: { KC: { rank: 8 } } },
  scoringSettings:  null,
  ktcMap:           null,
  collegeStats:     null,
  currentSeason:    2025,
  qbQualityByTeam:  null,
  ktcHistory:       null,
  nflDraftMatches:  null,
})
```

**5f. Convert the kicker direct call (lines 305–311):**

```js
const k = computeNextSeasonProjection({
  playerId:         'kicker',
  playersMap:       { kicker: { position: 'K', age: 32, years_exp: 10, team: 'BAL' } },
  careerStats:      {},
  empiricalCurves:  {},
  positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
  historicalShares: {},
  depthMap:         {},
  teamContext:      {},
  scoringSettings:  null,
  ktcMap:           null,
  collegeStats:     null,
  currentSeason:    2025,
  qbQualityByTeam:  null,
  ktcHistory:       null,
  // nflDraftMatches omitted → destructure default = null
})
```

### Step 6 — `docs/projection.md:5`

Update line 5 from:

```
`computeNextSeasonProjection(playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, historicalShares, depthMap, teamContext, scoringSettings, ktcMap, collegeStats, currentSeason, qbQualityByTeam = null, ktcHistory = null)`
```

to:

```
`computeNextSeasonProjection({ playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, historicalShares, depthMap, teamContext, scoringSettings, ktcMap, collegeStats, currentSeason, qbQualityByTeam = null, ktcHistory = null, nflDraftMatches = null })`
```

Note: the existing doc line was also missing `nflDraftMatches` (added in D1). Fix both issues in this edit.

---

## Test verification protocol

### Pre-refactor baseline

Before making any changes, run:

```bash
npm test 2>&1 | tail -5
```

Record the total test count (e.g. "X tests passed"). This is the acceptance target.

### Post-refactor verification

After all five file changes:

```bash
npm test
```

Acceptance criteria:
1. All tests pass (same count as baseline)
2. Zero test outcome changes — no test that was passing now fails, no test that was failing now passes
3. `npm run build` exits clean with no warnings

If any test fails after the refactor, **stop and investigate before continuing**. A failing test means either a missed call site or a destructure key name mismatch. Check:
- Did the test use `.asArgs()` (not yet renamed to `.asOptions()`)?
- Is the test spreading an array when it should be passing an object?
- Does the destructure key name exactly match the call site property name?

---

## Docs updates

| File | Change |
|------|--------|
| `docs/projection.md:5` | Update signature line to options-object form; also add the missing `nflDraftMatches = null` that D1 added but didn't update in this doc |
| `docs/architecture.md` | No change — only references function name and output shape |
| `CLAUDE.md` | No change — navigation table and invariants don't reference positional signature |

---

## Tests to add

**None.** The existing 47 calls in `seasonProjection.test.js` and 9 calls in `factorsSchema.test.js` provide thorough behavioral coverage. Every test is effectively a regression guard: if a key name in the destructure doesn't match the property name at a call site, the test fails with `null`/`undefined` result or mismatched assertion values. Adding a purpose-built "accepts options object" test would be redundant.

---

## Cross-repo impact

**None.** The refactor changes the function's input calling convention only — it does not change:
- The return shape (`{projectedPPG, projectedGames, projectedTotalPts, confidence, factors, adjustmentSummary}`)
- The `factors` key set (65 vet / 45 rookie — enforced by `factorsSchema.test.js`)
- The `adjustmentSummary` string values
- The snapshot written by `projectionSnapshot.js` (which records the return value, not the inputs)

The `sleeper-dashboard-data` cross-repo contract is with the snapshot output shape and the `factors` object — both are unchanged. No data-repo update required.

---

## Open questions

None. The naming decision is resolved (`.asOptions()`), the default parity is confirmed, and every call site is enumerated. Sonnet should implement exactly as specified.

---

## Checklist for sonnet

- [ ] Read this file in full before starting
- [ ] Run `npm test` baseline and record test count
- [ ] Edit `src/utils/seasonProjection.js` — destructure signature
- [ ] Edit `src/App.jsx` — object literal call
- [ ] Edit `src/__fixtures__/factories.js` — rename `.asArgs()` → `.asOptions()`, return object, update comments
- [ ] Edit `src/utils/seasonProjection.test.js` — replace all `...makeVet().asArgs()` / `...makeRookie().asArgs()` spreads
- [ ] Edit `src/__tests__/factorsSchema.test.js` — convert SHARED_ARGS, ROOKIE_ARGS, QB direct call, kicker direct call
- [ ] Edit `docs/projection.md` — update signature line
- [ ] Run `npm test` — all green, count matches baseline
- [ ] Run `npm run build` — clean
- [ ] If anything fails, stop and report — do not guess
