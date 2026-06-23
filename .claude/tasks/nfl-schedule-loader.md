# NFL Schedule Loader — `src/api/nflSchedule.js`

**Model for implementation:** sonnet (fully-specified, mirrors an existing pattern).
**Read this file first; do not improvise architecture.** If anything contradicts
existing code, stop and ask.

## Goal

Add a read-only data-store loader `src/api/nflSchedule.js` that loads
`nflverse/schedule/<year>.json` (per-season NFL schedule + results + Vegas
lines), mirroring the mechanics of `src/api/nflRoster.js` / `src/api/nflDraft.js`
/ `src/api/advStats.js`:
`tryDataStore`/`getManifestEntry`, a shape validator passed to `tryDataStore`, a
permanent per-year IndexedDB cache (`nfl-schedule/<year>`), `lastModified`-driven
freshness, the shared `MIN_SCHEDULE_GAMES = 200` re-assert on `rowCount`, and
graceful degradation to a defined empty shape (no crash, no NaN) when the data
store is disabled or unreachable. Plus the doc/registry/CLAUDE.md updates.

**Scope guards (do not violate):**
- **No UI wiring.** `App.jsx` is NOT touched. The NFL-stats game-log tab and the
  matchup view are later app-arc slices; `players/NflStatsPlaceholder.jsx` and
  `players/WeeklyPlaceholder.jsx` stay untouched.
- **Read-only / loader-only.** The loader MUST NOT feed the playerRows pipeline,
  `seasonProjection.js`, or `dynastyScore.js`. Like advstats, schedule is not
  wired into scoring in this slice — this is a deliberate choice, recorded here
  and guarded by a static decoupling test (see Tests).
- **Do not touch** `src/components/league/ScheduleGrid.jsx` — that is the
  fantasy-league matchup grid, unrelated to NFL game schedules.

---

## Served contract (fixed by the data repo — the app re-asserts, never redefines)

File `nflverse/schedule/<year>.json`:
```js
{ schemaVersion: 1, season, generatedAt, rowCount, games: [ /* Game */ ] }
```
Each `Game`, exactly 15 fields:
```js
{
  gameId, season, week, gameType,
  homeTeam, awayTeam, homeScore, awayScore, result,
  spreadLine, totalLine,
  roof, surface, temp, wind,
}
```
Null semantics the loader/validator MUST tolerate (never coerce):
- `homeScore` / `awayScore` / `result` are `null` for unplayed games. **The entire
  current season publishes null-scored** with `spreadLine`/`totalLine` already
  populated. A validator that required non-null scores would reject every
  current-season file — do not write one.
- `temp` / `wind` are `null` for domes and older seasons.
- `result` is the home margin; **`0` is a tie**, never coerce `0 → null`.

`MIN_SCHEDULE_GAMES = 200` is a **shared cross-repo constant** re-asserted on
`rowCount`; both repos change together.

---

## Stated decisions

### D1 — Loader signature: `loadNflSchedule(year)` (explicit season, NO probe)

Unlike `loadCurrentRoster(currentSeason)` and `loadAdvStats(currentSeason)`,
which probe `currentSeason → currentSeason−1[→ −2]` to resolve the
*most-recent-available* file, `loadNflSchedule` takes **one explicit season** and
does not probe. Rationale, from the two downstream consumers:

- **(a) NFL-stats game-log tab** needs *an arbitrary past season* for a player
  (e.g. a player's 2021 game log). A probe-down resolves "latest available,"
  which can never address a specific historical season — so a probe is wrong
  here.
- **(b) Matchup view** needs the *current* season. The caller resolves "current
  season" from `nflState.season` (the actual current/upcoming NFL season),
  exactly as `nflRoster.js` is invoked in `App.jsx:860` —
  `loadNflSchedule(parseInt(nflState.season, 10))`. Do **not** use the
  projection's careerStats-derived "last completed season" here, which would lag
  the current schedule by a year.

An explicit-year signature serves both with no ambiguity. This is the one
intentional divergence from the roster/advstats probe pattern; everything else
mirrors them.

### D2 — Return shape (defined empty on every failure path)

```js
{ games: Game[], year: number|null, complete: boolean, rowCount: number }
```
- Success: `{ games, year: <requested year>, complete: true, rowCount }`.
- Any degraded path (store disabled, file absent from manifest, store
  unreachable, shape mismatch, below-floor `rowCount`):
  `{ games: [], year: null, complete: false, rowCount: 0 }`.

Mirrors `loadAdvStats`'s `{ byId, year, complete, rowCount }` (`year: null` on
degrade = "nothing trustworthy resolved"). **Consumers branch on `complete`, not
on `year`.** The loader exposes the raw `games` array only — deriving a single
player's games (matching their team across weeks) is a later consumer concern,
not the loader's job.

### D3 — Current-season mutability via `lastModified` (permanent TTL is still correct)

Past completed seasons are immutable → permanent cache (999999 min) is correct.
The current season's file changes weekly as scores fill in; the manifest
`lastModified` freshness check re-fetches it exactly like the weekly roster
refresh. No special-casing of "current vs past" in the loader — `lastModified`
handles both.

### D4 — `MIN_SCHEDULE_GAMES` lives in `dataStore.js` (exported), enforced twice

The floor is enforced at **two** layers, per the contract:
1. **Validator** (`isValidSchedule`, structure boundary): rejects a `games` array
   shorter than the floor, so `tryDataStore` returns `null` for a sparse file.
2. **Loader** (`loadNflSchedule`, after fetch): re-asserts on the file's declared
   `json.rowCount`, matching the `nflRoster`/`advStats` loader-side `rowCount`
   gate (defense-in-depth: catches an honest-but-low declared count).

Because the **validator** needs the constant and validators live in
`dataStore.js`, define and `export const MIN_SCHEDULE_GAMES = 200` **in
`dataStore.js`**, and import it into `nflSchedule.js` for the loader-side
re-assert. This is a deliberate, justified divergence from roster/advstats (whose
constants live in the loader and are *not* referenced by the validator): a single
exported constant keeps one source of truth and avoids duplicating the magic
number across the two files. Import direction stays `nflSchedule → dataStore`
(no cycle).

### D5 — Manifest-null degrades to empty (no keep-cache branch)

When `getManifestEntry` returns `null` (store disabled or file absent), the loader
returns the empty shape — it does **not** serve stale cache. This matches the
per-year `nflRoster`/`advStats` convention. `nflDraft.js` *does* keep-cache on
manifest-null, but that is a single bulk file where dropping everything is costly;
schedule is per-year like roster/advstats. With no UI consumer in this slice,
past-season resilience is not yet exercised. **Documented follow-up:** if/when the
game-log tab ships and immutable past-season resilience matters, add a
keep-cache-on-manifest-null branch modeled on `nflDraft.js`.

---

## Data shapes

**Cache record** under key `nfl-schedule/<year>` (TTL 999999), mirrors the
advstats record:
```js
{ games: Game[], season, rowCount, lastModified }
```

**Validator** `isValidSchedule(p)` — structure only; never inspects
score/result/temp/wind, so null scores, null temp/wind, and `result === 0` pass
trivially:
```js
true  ⇔  p is a non-null non-array object
      ∧  Array.isArray(p.games)
      ∧  p.games.length >= MIN_SCHEDULE_GAMES
      ∧  p.games[0] has 'gameId' ∧ 'homeTeam' ∧ 'awayTeam'   // sample-checked, like isValidCFBDRows
```

---

## Edits — grouped by file

### FILE 1 (NEW): `src/api/nflSchedule.js`

Create the file with this exact content (header comment mirrors `advStats.js`'s
style):

```js
/**
 * src/api/nflSchedule.js
 *
 * READ-ONLY / LOADER-ONLY. Loads nflverse NFL schedule / results / Vegas lines
 * (`nflverse/schedule/<year>.json`) from the data store and returns the per-season
 * games array for DISPLAY use only (the NFL-stats game-log tab and the matchup
 * view — both later app-arc slices; no consumer in this slice). These values MUST
 * NOT feed the playerRows pipeline, projectedPPG, the dynasty score, or any
 * projection `factors` entry. The decoupling is enforced by
 * src/__tests__/scheduleViewOnly.test.js. Do not import this module from any
 * projection/scoring file.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/schedule/<year>.json
 *         Produced server-side by sleeper-dashboard-data (scripts/update-schedule.mjs
 *         ← nflverse `nfldata` games.csv, weekly Action). One file per season.
 *
 * Served shape: { schemaVersion:1, season, generatedAt, rowCount, games[] }; each
 * game has exactly 15 fields (gameId, season, week, gameType, homeTeam, awayTeam,
 * homeScore, awayScore, result, spreadLine, totalLine, roof, surface, temp, wind).
 * Null semantics tolerated, never coerced: homeScore/awayScore/result are null for
 * unplayed games (the whole CURRENT season ships null-scored with spreadLine/
 * totalLine populated); temp/wind null for domes/older seasons; result is the home
 * margin and 0 is a TIE (never 0 → null).
 *
 * Signature: loadNflSchedule(year) takes an EXPLICIT season (no probe). Consumer
 * (a) needs an arbitrary past season for a player; consumer (b) resolves the
 * current season from nflState.season: loadNflSchedule(parseInt(nflState.season, 10)).
 *
 * Cache: `nfl-schedule/<year>` per year, permanent TTL (999999 min). Freshness via
 * the manifest entry's `lastModified` stored in the cache record — a changed token
 * re-fetches. Past seasons are immutable (permanent cache correct); the current
 * season's file mutates weekly as scores fill in and is re-fetched on lastModified
 * change, exactly like the weekly roster refresh.
 *
 * MIN_SCHEDULE_GAMES (shared cross-repo constant, defined in dataStore.js) is
 * enforced twice: isValidSchedule rejects a short games array at the tryDataStore
 * boundary, and this loader re-asserts it on the declared rowCount after fetch.
 *
 * Graceful absence: store down / disabled / file absent from manifest / shape
 * mismatch / below-floor rowCount → { games: [], year: null, complete: false,
 * rowCount: 0 } (no crash, no NaN). Consumers branch on `complete`, not `year`.
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidSchedule, MIN_SCHEDULE_GAMES } from './dataStore'

const EMPTY = { games: [], year: null, complete: false, rowCount: 0 }

/**
 * Loads the NFL schedule for one explicit season.
 *
 * @param {number} year  explicit NFL season, e.g. 2026 (= parseInt(nflState.season, 10))
 * @returns {Promise<{
 *   games: Array<object>,   // raw Game[] (15-field rows; null scores/result/temp/wind tolerated)
 *   year: number|null,
 *   complete: boolean,
 *   rowCount: number,
 * }>}
 */
export async function loadNflSchedule(year) {
  const path = `nflverse/schedule/${year}.json`

  // 1. Manifest check — file not in store yet / store disabled → graceful empty
  const entry = await getManifestEntry(path)
  if (!entry) return { ...EMPTY }

  // 2. Cache check (lastModified-aware) — must still meet the sparsity floor
  const rec = await getCacheRecord(`nfl-schedule/${year}`)
  if (rec?.data?.rowCount >= MIN_SCHEDULE_GAMES && rec.data.lastModified === entry.lastModified) {
    console.log(`[nflSchedule] year=${year} served from cache (rows=${rec.data.rowCount})`)
    return { games: rec.data.games, year, complete: true, rowCount: rec.data.rowCount }
  }

  // 3. Fetch from data store (isValidSchedule rejects short / malformed files)
  const json = await tryDataStore(path, { validate: isValidSchedule })
  if (!json) return { ...EMPTY }  // store unavailable / shape mismatch → graceful empty

  // 4. Sparsity re-assert on the declared rowCount
  if (json.rowCount < MIN_SCHEDULE_GAMES) {
    console.log(`[nflSchedule] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_SCHEDULE_GAMES}), skipping`)
    return { ...EMPTY }
  }

  // 5. Cache with lastModified for next-load freshness
  await setCacheWithMeta(`nfl-schedule/${year}`, {
    games: json.games,
    season: json.season,
    rowCount: json.rowCount,
    lastModified: entry.lastModified,
  }, 999999, {})

  console.log(`[nflSchedule] fetched year=${year} rows=${json.rowCount}`)
  return { games: json.games, year, complete: true, rowCount: json.rowCount }
}
```

### FILE 2 (EDIT): `src/api/dataStore.js`

Add the shared constant and the validator. Anchor: immediately **after the
`isValidAdvStats` function** (currently ends at line 125, the closing `}` of
`isValidAdvStats`). Append:

```js

// Shared cross-repo sparsity floor for nflverse/schedule/<year>.json. Both repos
// change together. Enforced here (validator) and re-asserted in nflSchedule.js
// (loader, on the declared rowCount).
export const MIN_SCHEDULE_GAMES = 200

// Structure-only validator. Deliberately ignores score/result/temp/wind, so null
// scores, null temp/wind, and result === 0 (a tie) all pass. Samples games[0] for
// the three required identity fields, like isValidCFBDRows samples parsed[0].
export function isValidSchedule(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  if (!Array.isArray(p.games) || p.games.length < MIN_SCHEDULE_GAMES) return false
  const g = p.games[0]
  return g != null && 'gameId' in g && 'homeTeam' in g && 'awayTeam' in g
}
```

> Note: keep `MIN_SCHEDULE_GAMES` exported (the loader imports it). No other
> change to `dataStore.js`; `tryDataStore`/`getManifestEntry`/manifest logic are
> untouched.

---

## Docs updates

Apply all of the following. (No source files beyond the two above.)

### `docs/integrations.md` — new loader section

Insert a new subsection **after the `### \`src/api/advStats.js\`` section (which
ends at line 318) and before `### \`src/api/dataStore.js\`` (line 320)**:

```md
### `src/api/nflSchedule.js` — nflverse NFL schedule / results / lines (read-only)

- **Source:** `${VITE_DATA_STORE_URL}/nflverse/schedule/<year>.json` via `tryDataStore`/`getManifestEntry` in `dataStore.js`. `sleeper-dashboard-data` ingests the nflverse `nfldata` `games.csv` server-side (`scripts/update-schedule.mjs`, weekly Action) and publishes one file per season as JSON via jsDelivr. See the data repo for the served shape spec.
- No API key, no auth.
- **Served shape (re-asserted, never redefined):** `{ schemaVersion: 1, season, generatedAt, rowCount, games[] }`. Each game has exactly 15 fields: `gameId`, `season`, `week`, `gameType`, `homeTeam`, `awayTeam`, `homeScore`, `awayScore`, `result`, `spreadLine`, `totalLine`, `roof`, `surface`, `temp`, `wind`.
- **Null semantics (tolerated, never coerced):** `homeScore`/`awayScore`/`result` are `null` for unplayed games — the entire current season publishes null-scored with `spreadLine`/`totalLine` already populated; `temp`/`wind` are `null` for domes and older seasons; `result` is the home margin and `0` is a tie (never coerced to null).
- **Explicit-season signature** — `loadNflSchedule(year)` takes one explicit season; it does **not** probe down like `nflRoster`/`advStats`. The game-log consumer needs an arbitrary past season for a player, so a "most-recent-available" probe is wrong here. A caller wanting the current season resolves it from `nflState.season` (the actual current/upcoming NFL season): `loadNflSchedule(parseInt(nflState.season, 10))` — identical to how `nflRoster.js` is invoked.
- **Cache:** `nfl-schedule/<year>` per year, permanent TTL (999999 min). Each record stores `{ games, season, rowCount, lastModified }`. Past completed seasons are immutable so the permanent cache is correct; the current season's file changes weekly as scores fill in, and the manifest `lastModified` freshness check re-fetches it exactly like the weekly roster refresh.
- **`MIN_SCHEDULE_GAMES = 200`** sparsity floor — a shared cross-repo constant (both repos change together), defined and exported from `dataStore.js`. Enforced twice: `isValidSchedule` rejects a `games` array shorter than the floor at the `tryDataStore` boundary, and `loadNflSchedule` re-asserts it on the file's declared `rowCount` after fetch.
- **Read-only / loader-only.** Not wired into the playerRows pipeline, `seasonProjection.js`, or `dynastyScore.js` in this slice — like advstats, this is a deliberate choice, guarded by `src/__tests__/scheduleViewOnly.test.js`. No UI consumer yet (the NFL-stats game-log tab and matchup view are later app-arc slices).
- **Failure mode:** data store disabled / file absent from manifest / store unreachable / shape mismatch / below-floor `rowCount` → `{ games: [], year: null, complete: false, rowCount: 0 }` (no crash, no NaN). Unlike `nflDraft.js` (single bulk file), there is no keep-cache-on-manifest-null branch; a manifest-null load degrades to empty, matching the per-year `nflRoster`/`advStats` convention. A keep-cache branch for immutable past seasons is a documented follow-up if the game-log tab needs that resilience.
```

### `CLAUDE.md` — `src/api/` navigation map

Add a new row to the `### src/api/` table, **immediately after the `advStats.js`
row** (the row beginning `` | `advStats.js` | ``):

```md
| `nflSchedule.js` | nflverse NFL schedule / results / Vegas lines (`nflverse/schedule/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflSchedule(year)` (no probe); `MIN_SCHEDULE_GAMES=200` floor; per-year permanent cache; `lastModified` freshness for the mutable current season; graceful empty shape. **Read-only** — not wired into projection/scoring (guarded by `scheduleViewOnly.test.js`); no UI consumer yet |
```

### `CLAUDE.md` — Cross-repo contracts list

Add a new bullet to **`### Cross-repo contracts (with sleeper-dashboard-data)`**,
immediately **after the `nflverse advstats (view-only)` bullet** (the last bullet
in that list). This extends the existing nflverse precedent rows — do not restate
the general invariants:

```md
- **nflverse schedule (read-only):** `src/api/nflSchedule.js` reads `nflverse/schedule/<year>.json`, produced by the data repo (`scripts/update-schedule.mjs` ← nflverse `nfldata` `games.csv`). The served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, games[] }`; each game's 15 fields `gameId`/`season`/`week`/`gameType`/`homeTeam`/`awayTeam`/`homeScore`/`awayScore`/`result`/`spreadLine`/`totalLine`/`roof`/`surface`/`temp`/`wind`; null `homeScore`/`awayScore`/`result`/`temp`/`wind` and `result === 0` tie are valid) and the shared **`MIN_SCHEDULE_GAMES = 200`** sparsity floor are the contract, re-asserted app-side in `dataStore.js` (`isValidSchedule`) and `nflSchedule.js`. This is the app side of an already-shipped data-repo contract — read-only, not wired into projection/scoring. Changing the served shape or the shared floor must be coordinated (both repos change together).
```

### `README.md` — `src/api/` file tree

Add a line to the `api/` block, **immediately after the `advStats.js` line**
(line 95):

```
    nflSchedule.js      # nflverse NFL schedule/results/lines loader (read-only); explicit-season loadNflSchedule(year); MIN_SCHEDULE_GAMES=200 floor; per-year permanent cache; graceful empty shape
```

### `docs/signal-registry.md` — §3A Raw ingested data

Add one row to the **§3A. Raw ingested data** table, **immediately after the
`nflverse draft picks` row (line 54)** and before the `nflverse playerids
crosswalk` row (line 55) — keeping it in the nflverse cluster:

```md
| NFL schedule / results / lines (`gameId`, `week`, `gameType`, `homeTeam`/`awayTeam`, `homeScore`/`awayScore`, `result`, `spreadLine`, `totalLine`, `roof`/`surface`/`temp`/`wind`) | raw ingested data | data: `nflverse/schedule/<year>.json` ← nflverse `nfldata` games.csv (`scripts/update-schedule.mjs`) | **1999–present** (per-season) | **Reconstructable** — static once final, re-derivable from the source CSV | **view-only display** (NFL-stats game log / matchup view — loader shipped, consumer pending); not wired into projection/scoring |
```

> **Leave the §"Coverage verification" table (lines 11–23) alone.** That table
> holds *data-checked actuals*; no per-year row-count / null-rate verification was
> performed for schedule in this slice, so adding a row there would violate its
> premise. Only the §3A registry row is added.

---

## Tests to add

### TEST 1 (NEW): `src/api/nflSchedule.test.js` — loader unit tests

Mirror `src/api/advStats.test.js` exactly (mock `./dataStore` with
`importOriginal` so the real `isValidSchedule`/`MIN_SCHEDULE_GAMES` are available;
mock `../utils/cache`). Fixture helper builds a `games` array of length ≥ 200
programmatically.

```js
vi.mock('./dataStore', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getManifestEntry: vi.fn(), tryDataStore: vi.fn() }
})
vi.mock('../utils/cache', () => ({
  getCacheRecord: vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))
```

Fixtures:
- `LAST_MODIFIED = '2026-06-01'`; `ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }`.
- `PLAYED_GAME = { gameId: '2024_01_KC_BAL', season: 2024, week: 1, gameType: 'REG', homeTeam: 'BAL', awayTeam: 'KC', homeScore: 20, awayScore: 27, result: -7, spreadLine: 3, totalLine: 46.5, roof: 'open', surface: 'grass', temp: null, wind: null }`
- `UNPLAYED_GAME = { ...same id/teams..., homeScore: null, awayScore: null, result: null, spreadLine: 3, totalLine: 46.5, temp: null, wind: null }`
- `TIE_GAME = { ...PLAYED_GAME, homeScore: 20, awayScore: 20, result: 0 }`
- `makeJson(rowCount = 272, games = Array.from({ length: rowCount }, () => PLAYED_GAME))` → `{ schemaVersion: 1, season: <year>, generatedAt: '…', rowCount, games }`.

Cases:
1. **Fresh cache + matching lastModified + rowCount ≥ floor → served from cache.**
   `getCacheRecord` returns `{ data: { games: [...], rowCount: 272, lastModified: LAST_MODIFIED } }`.
   Expect `tryDataStore` NOT called; result `{ games, year: 2026, complete: true, rowCount: 272 }`.
2. **Cache miss → fetch + cache.** `getCacheRecord → null`, `tryDataStore → makeJson()`.
   Expect `tryDataStore` called once; `setCacheWithMeta` called once with
   `cacheKey === 'nfl-schedule/2026'`, `cacheData.lastModified === LAST_MODIFIED`,
   `ttl === 999999`; result `complete: true`, `year: 2026`, `rowCount: 272`.
3. **Null-scored current-season fixture passes through.**
   `tryDataStore → makeJson(272, Array.from({length:272}, () => UNPLAYED_GAME))`.
   Expect no throw; `result.complete === true`;
   `result.games[0]` has `homeScore: null, awayScore: null, result: null` unchanged.
4. **`result === 0` tie preserved.** First game is `TIE_GAME`.
   Expect `result.games[0].result === 0` (strictly `=== 0`, not null/falsy-coerced).
5. **Below-floor rowCount rejected (loader re-assert).**
   `tryDataStore → makeJson(150)` (rowCount 150 < 200). Expect
   `result` deep-equals `{ games: [], year: null, complete: false, rowCount: 0 }`;
   `setCacheWithMeta` NOT called.
6. **Manifest entry null (store disabled / file absent) → graceful empty.**
   `getManifestEntry → null`. Expect `tryDataStore` NOT called; `setCacheWithMeta`
   NOT called; result `{ games: [], year: null, complete: false, rowCount: 0 }`.
7. **Store unavailable (`tryDataStore → null`) → graceful empty.**
   `getManifestEntry → ENTRY`, `getCacheRecord → null`, `tryDataStore → null`.
   Expect result `{ games: [], year: null, complete: false, rowCount: 0 }`;
   `setCacheWithMeta` NOT called.
8. **Stale cache lastModified → re-fetch with new token.**
   `getManifestEntry → { lastModified: '2026-07-01', … }`, cache record has
   `lastModified: '2026-05-01'`, `tryDataStore → makeJson()`. Expect `tryDataStore`
   called once; `setCacheWithMeta` call's `cacheData.lastModified === '2026-07-01'`.
9. **Explicit-year signature (no probe).** Call `loadNflSchedule(2021)` with
   `getManifestEntry → ENTRY`, `getCacheRecord → null`, `tryDataStore → makeJson()`.
   Expect `getManifestEntry` called with a path containing `2021`, exactly once
   (proves no fallback probe to 2020); `setCacheWithMeta` cacheKey ===
   `'nfl-schedule/2021'`; `result.year === 2021`.

### TEST 2 (EDIT): `src/api/dataStore.test.js` — `isValidSchedule` validator tests

Add `isValidSchedule` (and `MIN_SCHEDULE_GAMES`) to the static import on line 12,
then add a new `describe('isValidSchedule')` block after the `isValidAdvStats`
block (ends line 187). Helper: `makeGames(n, base = {…})` builds an n-length array.

Cases:
- **Valid payload** — `games` length ≥ `MIN_SCHEDULE_GAMES`, sample game has
  `gameId`/`homeTeam`/`awayTeam` → `true`.
- **Null-scored current season passes** — every game has
  `homeScore: null, awayScore: null, result: null, temp: null, wind: null` (and the
  required id/team fields) → `true` (must NOT reject; this is the "null-scored
  current-season fixture passes validation" edge case at the validator boundary).
- **`result === 0` tie passes** — sample game has `result: 0` → `true`.
- **Below-floor rejected** — `games` length 150 (< 200) → `false` ("below-floor
  rowCount rejected" at the validator boundary).
- **Missing / non-array `games`** — `{ games: undefined }` and `{ games: 'x' }` → `false`.
- **`null`** → falsy.
- **Top-level array** → falsy.
- **Sample game missing identity fields** — `games[0]` lacks `gameId` → `false`.

### TEST 3 (NEW): `src/__tests__/scheduleViewOnly.test.js` — decoupling guard

Mirror `src/__tests__/advStatsViewOnly.test.js`. Reuse the same `PIPELINE` module
list. For each pipeline module assert it does **not** import `nflSchedule` or
reference `loadNflSchedule`; and assert `src/api/nflSchedule.js` imports nothing
from `seasonProjection`/`dynastyScore`/`projectionSignals`/`usageMetrics`.

```js
expect(src).not.toMatch(/from\s+['"][^'"]*nflSchedule['"]/)
expect(src).not.toMatch(/loadNflSchedule/)
```
This makes the read-only constraint enforceable rather than merely documented (the
established advstats precedent), satisfying the "note it's a choice" requirement.

> This is the one judgment call in the test plan: TEST 1 and TEST 2 are
> mandatory; TEST 3 mirrors the advstats decoupling guard because the read-only
> constraint is a hard requirement of this slice. If the user prefers not to add
> a guard test for a loader with no consumer yet, TEST 3 may be dropped — but the
> CLAUDE.md / docs references to `scheduleViewOnly.test.js` must be removed with
> it.

### Done-definition reminders
- `npm test` green; `npm run lint` 0 problems; `npm run build` clean.
- No contract test (`factorsSchema`/`statKeysContract`) is implicated — this slice
  touches neither `seasonProjection.js` nor stat-key references.

---

## Cross-repo impact

This is the **app side of an already-shipped data-repo contract**
(`nflverse/schedule/<year>.json` is already served). After this slice:

- Both repos assert **`MIN_SCHEDULE_GAMES = 200`** (data repo as a write-gate; app
  via `isValidSchedule` + the `nflSchedule.js` `rowCount` re-assert) and the
  **15-field game shape** with its null semantics (`homeScore`/`awayScore`/
  `result`/`temp`/`wind` nullable; `result === 0` is a tie).
- **Nothing further is required of `sleeper-dashboard-data`** — the file, schema,
  and floor already exist there. This task only adds the app-side reader, docs,
  registry row, and tests.
- Future coordination rule (recorded in CLAUDE.md Cross-repo contracts): any change
  to the served shape or to the shared `MIN_SCHEDULE_GAMES` floor must change both
  repos together.

---

## File-touch summary

| File | Change |
|------|--------|
| `src/api/nflSchedule.js` | **NEW** — `loadNflSchedule(year)` loader |
| `src/api/dataStore.js` | **EDIT** — add exported `MIN_SCHEDULE_GAMES = 200` + `isValidSchedule` after `isValidAdvStats` (line 125) |
| `src/api/nflSchedule.test.js` | **NEW** — 9 loader unit tests |
| `src/api/dataStore.test.js` | **EDIT** — import `isValidSchedule`/`MIN_SCHEDULE_GAMES` (line 12) + new `describe('isValidSchedule')` after line 187 |
| `src/__tests__/scheduleViewOnly.test.js` | **NEW** — decoupling guard (judgment call; see TEST 3 note) |
| `docs/integrations.md` | **EDIT** — new `### src/api/nflSchedule.js` section after line 318 |
| `CLAUDE.md` | **EDIT** — src/api nav row (after `advStats.js` row) + new Cross-repo contracts bullet (after advstats bullet) |
| `README.md` | **EDIT** — `api/` file-tree line after line 95 |
| `docs/signal-registry.md` | **EDIT** — §3A row after line 54 |

**Not touched (intentional):** `src/App.jsx` (no UI wiring), `seasonProjection.js`,
`dynastyScore.js`, the playerRows pipeline, `players/NflStatsPlaceholder.jsx`,
`players/WeeklyPlaceholder.jsx`, `src/components/league/ScheduleGrid.jsx`.
