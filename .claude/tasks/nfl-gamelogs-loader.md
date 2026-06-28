# NFL game-logs loader (`nflverse/gamelogs/<year>.json`) — app-side, view-only, loader-only

**Session 1 (opus) plan. Implement in Session 2 (sonnet). No source was edited in this session.**

Add the APP-SIDE loader for the data repo's already-shipped per-game player-stats layer
(`nflverse/gamelogs/<year>.json`, live on the CDN for 2012–2024; **2019 absent upstream** — a
known gap). Ship **loader-only**: no UI, no `ProfileDataContext`, no `playerRows` wiring this
slice — exactly like `nflSchedule.js` shipped with no consumer. Wiring is the next (Outlook)
slice's job; do not plan it here.

This is the **app side of an already-shipped data-repo contract**. The served shape and the
`MIN_PLAYERGAME_ROWS = 3000` floor are fixed — the app re-asserts them, it does not redefine
them. Do not propose changing the served shape or the floor.

---

## Key decisions (read before implementing)

### D1 — Explicit-season signature `loadNflGameLogs(year)`, no probe-down. **Confirmed.**
Mirror `nflSchedule.js` verbatim, not `advStats.js`/`nflRoster.js`. The probe-down loaders
(`advStats`, `nflRoster`) resolve a *single* "most-recent-available" season because their
consumers want "the latest completed season." A game-log consumer wants **an arbitrary past
season for a given player** (any of 2012–2024), consumed per-season across many seasons — so a
"most-recent-available" probe is the wrong shape, identical to the reasoning already documented
for `nflSchedule.js` ([nflSchedule.js:25-27](src/api/nflSchedule.js), integrations.md
nflSchedule "Explicit-season signature" bullet).

The **2019 gap reinforces** explicit-season: with a probe-down, a request for 2019 would
silently substitute 2018 or 2020 game logs (wrong-season data presented as 2019). With
explicit-season, `loadNflGameLogs(2019)` finds no manifest entry and returns the graceful empty
shape (`complete: false`) — the consumer renders "no data," never wrong-season data. This is the
decisive argument for explicit-season here.

A caller wanting the current season resolves it the same way the schedule loader documents:
`loadNflGameLogs(parseInt(nflState.season, 10))`.

### D2 — Validator + shared floor live in `dataStore.js` (schedule-style), not in the loader.
Determined against live source. The two precedent styles:
- **advStats/roster style** — validator (`isValidAdvStats`/`isValidRoster`) checks *structure
  only* (`typeof p.rowCount === 'number'`); the loader owns the floor constant
  (`MIN_ADVSTATS_ROWS` in [advStats.js:35](src/api/advStats.js), `MIN_ROSTER_IDS` in
  [nflRoster.js:38](src/api/nflRoster.js)) and re-asserts it.
- **schedule style** — the floor constant lives in `dataStore.js` and is *exported*
  ([dataStore.js:127-130](src/api/dataStore.js)); the validator (`isValidSchedule`,
  [dataStore.js:135-140](src/api/dataStore.js)) checks structure **and** the floor; the loader
  re-asserts the floor on the declared `rowCount` ([nflSchedule.js:79-82](src/api/nflSchedule.js)).

Use **schedule style**: `isValidGameLogs` + `MIN_PLAYERGAME_ROWS` both in `dataStore.js`,
`MIN_PLAYERGAME_ROWS` exported. Reasons: (a) the task's validator must "check the rowCount
floor," so the validator must see the constant; (b) `MIN_PLAYERGAME_ROWS` is the *shared
cross-repo constant* the task names — and the existing exported shared cross-repo floor that
lives in `dataStore.js` is `MIN_SCHEDULE_GAMES`; (c) `nflSchedule.js` is the file this slice is
told to mirror. The loader imports both from `dataStore.js` (like
[nflSchedule.js:45](src/api/nflSchedule.js) imports `isValidSchedule, MIN_SCHEDULE_GAMES`).

### D3 — Floor is checked on the **declared `rowCount`** in both validator and loader.
`isValidSchedule` checks `p.games.length` (a flat top-level array). The gamelogs served shape
has **no flat top-level array** — `players` is an object keyed by `sleeper_id`, each with a
*nested* `games[]`. The cheap floor proxy is therefore the **declared top-level `rowCount`**
field. So both the validator and the loader re-assert hit the same field. This is still
meaningful defense-in-depth: the validator rejects at the `tryDataStore` fetch boundary (a bad
file is never cached), the cache-hit guard re-checks on the IndexedDB-hydration path, and the
loader re-assert covers the post-fetch path — three checkpoints, mirroring schedule. Note in a
code comment that the floor is on declared `rowCount` (no flat array to length-check).

### D4 — Do **not** pin `schemaVersion === 1` in the validator. (Deviation from a literal
reading of the goal's "validator checks schemaVersion" — flagged deliberately.)
The schema **ceiling** is already enforced upstream by `tryDataStore`, which gates the
*manifest entry's* `schemaVersion` against `MAX_SUPPORTED_SCHEMA`
([dataStore.js:81-84](src/api/dataStore.js)). Gamelogs ships `schemaVersion: 1` ≤ the existing
ceiling `3`, so it already passes — **no `MAX_SUPPORTED_SCHEMA` bump is needed**. A hard
`p.schemaVersion === 1` body check in the validator would self-break the app on a *benign
additive v2 bump* of the gamelogs file, directly contradicting the season-totals
graceful-degradation precedent (v1/v2/v3 all load — [dataStore.js:5-8](src/api/dataStore.js),
CLAUDE.md "season-totals schemaVersion" bullet). `isValidSchedule` likewise does not re-check
`schemaVersion`. So the validator checks **players-object shape + declared rowCount floor**, and
the schema gate stays where it belongs (`tryDataStore`). If the reviewer wants a literal
"checks schemaVersion," add a *presence-only* guard `Number.isInteger(p.schemaVersion)` (never a
`=== 1` pin) — but the recommendation is to omit it and rely on the upstream gate.

### D5 — Pass-through only; the loader computes nothing.
The loader returns `json.players` verbatim (like [advStats.js:80](src/api/advStats.js) returns
`byId: json.players`). It does **not** transform per-game stats, **does not** sum the single-game
rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`), and **does not**
touch `fantasyPoints`/`fantasyPointsPpr` (nflverse default scoring — passed through as opaque
data, never reconciled with [src/utils/fantasyPoints.js](src/utils/fantasyPoints.js)). Because
there is no transform, the SPARSE-null invariant ("absent stat key ⇒ null, never 0; present 0 is
a real zero") is preserved automatically: an absent key stays absent (JS `undefined`), a present
`0` stays `0`. A unit test pins this. Any season-figure recomputation from components is the
*consumer's* (Outlook slice) job, not the loader's.

### D6 — Return field naming: `year` (not `season`), mirroring schedule's return verbatim.
The goal text illustrates the empty shape as `{ players:{}, season:null, … }`, but the precedent
this slice mirrors returns the echoed-back arg as **`year`** ([nflSchedule.js:47](src/api/nflSchedule.js)
`EMPTY = { games: [], year: null, … }`; `advStats` also returns `year`). Use `year` in the
returned object for consistency with both per-year loaders. The **cached record** still stores
`season: json.season` (the file's own field), exactly like [nflSchedule.js:85-90](src/api/nflSchedule.js).

### D7 — Name collision check: clear.
`src/utils/nflStats.js` already has a `buildGameLog(...)` — that is the *view-layer* helper that
joins `weeklyPoints` to schedule rows; it is **unrelated** to this raw loader. The loader export
is `loadNflGameLogs` and the file is `nflGameLogs.js`; no collision. Do not touch `nflStats.js`.

---

## Data shapes

### Served shape (authoritative — from the data repo; do not change)
```
{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }
players: { [sleeper_id]: { gsisId, name, position, games[] } }
each game: { week, seasonType, team, opponent, …sparse per-game stats }
```
- SPARSE: absent stat key ⇒ null (never 0); present `0` is a real zero.
- Per-game RATE fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are
  SINGLE-GAME values — never sum them.
- `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring — display/training only, NOT
  app scoring.
- Positions QB/RB/WR/TE/FB; 2012+; `MIN_PLAYERGAME_ROWS = 3000` sparsity floor; `inProgress: false`.

### Loader return shape
```js
// success
{ players: <object keyed by sleeper_id, verbatim>, year: <number>, complete: true, rowCount: <number> }
// graceful empty (any failure path)
{ players: {}, year: null, complete: false, rowCount: 0 }
```
Consumers branch on `complete`, not `year` (same convention as schedule).

### Cache record (`nfl-gamelogs/<year>`, permanent TTL 999999 min)
```js
{ players, season, rowCount, lastModified }
```
Mirrors [nflSchedule.js:85-90](src/api/nflSchedule.js) (`games`→`players`).

---

## Edits grouped by file

### FILE 1 — `src/api/dataStore.js` (validator + shared floor)
Anchor: insert immediately **after** `isValidSchedule` (ends [dataStore.js:140](src/api/dataStore.js)),
matching the `MIN_SCHEDULE_GAMES` + `isValidSchedule` block style at lines 127-140.

Add:
```js
// Shared cross-repo sparsity floor for nflverse/gamelogs/<year>.json. Must equal the data
// repo's write-gate value exactly; both repos change together. Enforced here (validator) and
// re-asserted in nflGameLogs.js (loader, on the declared rowCount).
export const MIN_PLAYERGAME_ROWS = 3000

// Structure + floor validator. players is keyed by sleeper_id → { gsisId, name, position,
// games[] }; there is no flat top-level array, so the floor is checked on the declared rowCount
// (no array length to check, unlike isValidSchedule). schemaVersion is NOT re-checked here — the
// MAX_SUPPORTED_SCHEMA ceiling is enforced against the manifest entry in tryDataStore (and a hard
// version pin would self-break on a benign additive bump, per the season-totals precedent).
export function isValidGameLogs(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  if (typeof p.players !== 'object' || p.players === null) return false
  if (typeof p.rowCount !== 'number' || p.rowCount < MIN_PLAYERGAME_ROWS) return false
  const sample = Object.values(p.players)[0]
  return sample != null && Array.isArray(sample.games) && 'position' in sample
}
```
- Combines the `isValidAdvStats` players-object guard ([dataStore.js:122-125](src/api/dataStore.js))
  with the `isValidSchedule` floor + sample-identity guard ([dataStore.js:135-140](src/api/dataStore.js)).
- **No `MAX_SUPPORTED_SCHEMA` change** — gamelogs v1 ≤ existing ceiling 3 (see D4).

### FILE 2 — `src/api/nflGameLogs.js` (NEW loader)
Structural verbatim mirror of [nflSchedule.js](src/api/nflSchedule.js) (`games`→`players`,
`schedule`→`gamelogs`, `MIN_SCHEDULE_GAMES`→`MIN_PLAYERGAME_ROWS`, `isValidSchedule`→`isValidGameLogs`).
Include a top-of-file doc comment mirroring nflSchedule.js:1-42 (view-only / loader-only banner,
Source, served shape, sparse-null + rate-field + fantasyPoints notes, explicit-season rationale,
2019-gap note, cache, floor enforced-twice, graceful-empty).

```js
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidGameLogs, MIN_PLAYERGAME_ROWS } from './dataStore'

const EMPTY = { players: {}, year: null, complete: false, rowCount: 0 }

/**
 * Loads nflverse per-game player stats for one explicit season.
 * @param {number} year  explicit NFL season, e.g. 2023 (= parseInt(nflState.season, 10) for current)
 * @returns {Promise<{ players: object, year: number|null, complete: boolean, rowCount: number }>}
 */
export async function loadNflGameLogs(year) {
  const path = `nflverse/gamelogs/${year}.json`

  // 1. Manifest check — file not in store (e.g. 2019 gap) / store disabled → graceful empty
  const entry = await getManifestEntry(path)
  if (!entry) return { ...EMPTY }

  // 2. Cache check (lastModified-aware) — must still meet the sparsity floor
  const rec = await getCacheRecord(`nfl-gamelogs/${year}`)
  if (rec?.data?.rowCount >= MIN_PLAYERGAME_ROWS && rec.data.lastModified === entry.lastModified) {
    console.log(`[nflGameLogs] year=${year} served from cache (rows=${rec.data.rowCount})`)
    return { players: rec.data.players, year, complete: true, rowCount: rec.data.rowCount }
  }

  // 3. Fetch (isValidGameLogs rejects malformed / below-floor files at the boundary)
  const json = await tryDataStore(path, { validate: isValidGameLogs })
  if (!json) return { ...EMPTY }  // store unavailable / shape mismatch → graceful empty

  // 4. Sparsity re-assert on the declared rowCount (floor is on rowCount — no flat games array)
  if (json.rowCount < MIN_PLAYERGAME_ROWS) {
    console.log(`[nflGameLogs] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_PLAYERGAME_ROWS}), skipping`)
    return { ...EMPTY }
  }

  // 5. Cache with lastModified for next-load freshness
  await setCacheWithMeta(`nfl-gamelogs/${year}`, {
    players: json.players,
    season: json.season,
    rowCount: json.rowCount,
    lastModified: entry.lastModified,
  }, 999999, {})

  console.log(`[nflGameLogs] fetched year=${year} rows=${json.rowCount}`)
  return { players: json.players, year, complete: true, rowCount: json.rowCount }
}
```

---

## Step sequence (Session 2)
1. `src/api/dataStore.js` — add `MIN_PLAYERGAME_ROWS` + `isValidGameLogs` after `isValidSchedule`
   (FILE 1).
2. `src/api/nflGameLogs.js` — create the loader (FILE 2).
3. `src/api/nflGameLogs.test.js` — co-located loader unit tests (Tests T1–T10).
4. `src/api/dataStore.test.js` — add an `isValidGameLogs` describe block (Tests V1–V7); add
   `isValidGameLogs, MIN_PLAYERGAME_ROWS` to its existing import at
   [dataStore.test.js:12](src/api/dataStore.test.js).
5. `src/__tests__/gameLogsViewOnly.test.js` — view-only contract test (Test C1).
6. Docs updates (all of the "Docs updates" section below) — same change.
7. `npm test`, `npm run lint`, `npm run build` — all green/clean (per CLAUDE.md done-definition).
   No new behaviour touches `seasonProjection.js`/stat-key references, so `factorsSchema.test.js`
   / `statKeysContract.test.js` are unaffected — but run the full suite.

---

## Docs updates

### CLAUDE.md
**(a) `src/api/` table** — add a row immediately after the `nflSchedule.js` row:
```
| `nflGameLogs.js` | nflverse per-game player stats (`nflverse/gamelogs/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflGameLogs(year)` (no probe); `MIN_PLAYERGAME_ROWS=3000` floor; per-year permanent cache; `lastModified` freshness; graceful empty shape; pass-through (computes nothing). **View-only / loader-only** — no consumer this slice; not wired into projection/scoring (guarded by `gameLogsViewOnly.test.js`). Wiring is the next (Outlook) slice. 2019 absent upstream → graceful empty |
```

**(b) Cross-repo contracts** — add a bullet immediately after the **nflverse schedule (read-only)**
bullet:
```
- **nflverse gamelogs (view-only):** `src/api/nflGameLogs.js` reads `nflverse/gamelogs/<year>.json`, produced by the data repo (live on the CDN for 2012–2024; **2019 absent upstream** — a known gap, degrades to the empty shape). The served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id` → `{ gsisId, name, position, games[] }`; each game `{ week, seasonType, team, opponent, …sparse per-game stats }` — absent stat key ⇒ null, present `0` is a real zero; per-game rate fields `racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe` are single-game values, never summed; `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring, never reconciled with `src/utils/fantasyPoints.js`) and the shared **`MIN_PLAYERGAME_ROWS = 3000`** sparsity floor are the contract, re-asserted app-side in `dataStore.js` (`isValidGameLogs`) and `nflGameLogs.js`. This is the app side of an already-shipped data-repo contract — view-only, not wired into projection/scoring (guarded by `gameLogsViewOnly.test.js`), no UI/pipeline consumer this slice. Changing the served shape or the shared floor must be coordinated (both repos change together).
```

### docs/integrations.md
Insert a new subsection **after** the `### src/api/nflSchedule.js` section (after
[integrations.md:330](docs/integrations.md)) and **before** `### src/api/dataStore.js`
([integrations.md:332](docs/integrations.md)). Mirror the advStats/nflSchedule section format:
```
### `src/api/nflGameLogs.js` — nflverse per-game player stats (view-only)

- **Source:** `${VITE_DATA_STORE_URL}/nflverse/gamelogs/<year>.json` via `tryDataStore`/`getManifestEntry` in `dataStore.js`. `sleeper-dashboard-data` ingests nflverse per-game player stats server-side and publishes one file per season as JSON via jsDelivr. Live on the CDN for **2012–2024**; **2019 is absent upstream** (a known nflverse gap — the loader degrades to the empty shape, never substitutes an adjacent season). See the data repo for the served shape spec.
- No API key, no auth.
- **Served shape (re-asserted, never redefined):** `{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }`. `players` is keyed by `sleeper_id` → `{ gsisId, name, position, games[] }`; each game is `{ week, seasonType, team, opponent, …sparse per-game stats }` (positions QB/RB/WR/TE/FB).
- **Sparse / null semantics (tolerated, never coerced):** an **absent** stat key means **null** (never 0); a **present `0`** is a real zero. The loader is **pass-through** and transforms nothing, so absent keys stay absent and present zeros stay zero.
- **Rate fields are single-game:** `racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe` are per-game values — **never summed**; a consumer recomputes season figures from components. **`fantasyPoints`/`fantasyPointsPpr`** are nflverse's default scoring — display/training only, **never** reconciled with `src/utils/fantasyPoints.js`.
- **Explicit-season signature** — `loadNflGameLogs(year)` takes one explicit season; it does **not** probe down like `nflRoster`/`advStats`. The game-log consumer needs an arbitrary past season for a player, so a "most-recent-available" probe is wrong here (and would silently substitute an adjacent season for the absent 2019). A caller wanting the current season resolves it from `nflState.season`: `loadNflGameLogs(parseInt(nflState.season, 10))`.
- **Cache:** `nfl-gamelogs/<year>` per year, permanent TTL (999999 min). Each record stores `{ players, season, rowCount, lastModified }`. Past completed seasons are immutable so the permanent cache is correct; the manifest `lastModified` freshness check re-fetches a mutated current-season file exactly like the weekly roster refresh.
- **`MIN_PLAYERGAME_ROWS = 3000`** sparsity floor — a shared cross-repo constant (both repos change together), defined and exported from `dataStore.js`. Enforced three times: `isValidGameLogs` rejects a below-floor file at the `tryDataStore` boundary, the cache-hit guard re-checks the floor on the IndexedDB path, and `loadNflGameLogs` re-asserts it on the file's declared `rowCount` after fetch. (The floor is checked on the declared `rowCount`, not an array length — `players` is a keyed object with nested `games[]`, no flat top-level array.)
- **View-only / loader-only.** Not wired into the playerRows pipeline, `seasonProjection.js`, or `dynastyScore.js` in this slice — like advstats/schedule, a deliberate choice, guarded by `src/__tests__/gameLogsViewOnly.test.js`. No UI consumer yet (the Outlook slice is the planned consumer).
- **Failure mode:** data store disabled / file absent from manifest (incl. 2019) / store unreachable / shape mismatch / below-floor `rowCount` → `{ players: {}, year: null, complete: false, rowCount: 0 }` (no crash, no NaN).
```

### docs/signal-registry.md
**Section 3A. Raw ingested data** — add a row immediately after the **NFL schedule / results /
lines** row ([signal-registry.md:56](docs/signal-registry.md)):
```
| nflverse per-game player stats (`week`, `seasonType`, `team`, `opponent`, sparse per-game counting + rate stats, `fantasyPoints`/`fantasyPointsPpr`) | raw ingested data | data: `nflverse/gamelogs/<year>.json`; served `sleeper_id`-keyed → `{ gsisId, name, position, games[] }` | **2012–2024, gap at 2019** (file absent upstream); QB/RB/WR/TE/FB; `MIN_PLAYERGAME_ROWS=3000` floor | **Reconstructable** from nflverse weekly player stats (2019 backfillable if nflverse later fills it; rate fields are single-game and never summed) | **view-only display** (loader shipped, no consumer yet — Outlook slice planned); `app: src/api/nflGameLogs.js`; never feeds projection/scoring |
```

### README.md
**`api/` tree** — add a line immediately after the `nflSchedule.js` line
([README.md:96](README.md)):
```
    nflGameLogs.js      # nflverse per-game player stats loader (view-only); explicit-season loadNflGameLogs(year); MIN_PLAYERGAME_ROWS=3000 floor; per-year permanent cache; pass-through; graceful empty shape
```
(Optional, low-priority: the data-sources bullet at [README.md:14](README.md) mentions nflverse
draft/roster only — extending it to mention per-game gamelogs is nice-to-have, not required.)

---

## Tests to add

### `src/api/nflGameLogs.test.js` (NEW, co-located loader unit tests)
Mirror [nflSchedule.test.js](src/api/nflSchedule.test.js) verbatim in structure: same `vi.mock`
of `./dataStore` (`getManifestEntry`, `tryDataStore`) and `../utils/cache` (`getCacheRecord`,
`setCacheWithMeta`), same `beforeEach(vi.clearAllMocks)`.

Fixtures:
```js
const LAST_MODIFIED = '2026-06-01'
const ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }
const GAME_FULL = { week: 1, seasonType: 'REG', team: 'KC', opponent: 'BAL', receptions: 0, recYards: 0, racr: 1.2, targetShare: 0.18 }
const GAME_SPARSE = { week: 2, seasonType: 'REG', team: 'KC', opponent: 'CIN' } // absent stat keys
const PLAYERS = { '111': { gsisId: '00-1', name: 'A', position: 'WR', games: [GAME_FULL, GAME_SPARSE] } }
// declared rowCount drives the floor; the players object need not actually contain 3000 games
function makeJson(rowCount = 3200, players = PLAYERS) {
  return { schemaVersion: 1, season: 2023, generatedAt: '2023-01-01T00:00:00Z', rowCount, playerCount: Object.keys(players).length, unmapped: 0, players }
}
```

| # | Case | Inputs | Expected |
|---|---|---|---|
| T1 | fresh cache + matching `lastModified` + rowCount ≥ floor → served from cache | `getManifestEntry→ENTRY`; `getCacheRecord→{ data:{ players:PLAYERS, rowCount:3200, lastModified:LAST_MODIFIED } }` | `tryDataStore` NOT called; returns `{ players:PLAYERS, year:2023, complete:true, rowCount:3200 }` |
| T2 | cache miss → fetch + cache | `ENTRY`; `getCacheRecord→null`; `tryDataStore→makeJson()` | `tryDataStore` called once; `setCacheWithMeta` called once with key `nfl-gamelogs/2023`, `cacheData.lastModified===LAST_MODIFIED`, `ttl===999999`; result `complete:true`, `year:2023`, `rowCount:3200` |
| T3 | **sparse-null pass-through** | `ENTRY`; cache null; `tryDataStore→makeJson()` | `result.players['111'].games[0].receptions === 0` (present 0 preserved); `'recYards' in result.players['111'].games[1] === false` and `result.players['111'].games[1].recYards === undefined` (absent key NOT coerced to 0) |
| T4 | per-game rate field passed through unchanged (not summed/altered) | same as T3 | `result.players['111'].games[0].racr === 1.2` and `result.players['111'].games[0].targetShare === 0.18` (loader transforms nothing) |
| T5 | below-floor `rowCount` rejected (loader re-assert) | `ENTRY`; cache null; `tryDataStore→makeJson(2000)` | returns `{ players:{}, year:null, complete:false, rowCount:0 }`; `setCacheWithMeta` NOT called |
| T6 | **manifest entry null (store disabled / file absent — the 2019 gap)** | `getManifestEntry→null` | `tryDataStore` NOT called; `setCacheWithMeta` NOT called; returns empty shape |
| T7 | absent 2019 specifically → empty | `loadNflGameLogs(2019)` with `getManifestEntry→null` | `getManifestEntry` called with a path containing `2019`; returns empty shape (specialization of T6, pinned because 2019 is the named real-world gap) |
| T8 | store unavailable (`tryDataStore→null`) → empty | `ENTRY`; cache null; `tryDataStore→null` | returns empty shape; `setCacheWithMeta` NOT called |
| T9 | stale cache `lastModified` → re-fetch with new token | `getManifestEntry→{…lastModified:'2026-07-01'}`; `getCacheRecord→{ data:{ players:{}, rowCount:3200, lastModified:'2026-05-01' } }`; `tryDataStore→makeJson()` | `tryDataStore` called once; `setCacheWithMeta` call's `cacheData.lastModified==='2026-07-01'` |
| T10 | explicit-year signature (no probe) | `loadNflGameLogs(2014)`; `ENTRY`; cache null; `tryDataStore→makeJson()` | `getManifestEntry` called once with a path containing `2014`; cache key is `nfl-gamelogs/2014`; `result.year===2014` |

### `src/api/dataStore.test.js` (add to EXISTING file)
Extend the import at [dataStore.test.js:12](src/api/dataStore.test.js) with `isValidGameLogs,
MIN_PLAYERGAME_ROWS`. Add an `isValidGameLogs` describe block mirroring the `isValidSchedule`
block ([dataStore.test.js:189-237](src/api/dataStore.test.js)):

| # | Case | Expected |
|---|---|---|
| V1 | valid payload (`players` with one `{position, games:[…]}` sample, `rowCount: MIN_PLAYERGAME_ROWS`) | `true` |
| V2 | sparse game (player's first game omits stat keys, present `0` elsewhere) still valid | `true` (validator is structural; null semantics tolerated) |
| V3 | below-floor `rowCount` (e.g. 2000) | `false` |
| V4 | `rowCount` not a number (`'3200'`) | `false` |
| V5 | `players` missing / null | falsy |
| V6 | `null` input, and top-level array input | falsy (both) |
| V7 | sample player missing `games` array (or `games` non-array) | `false` |

### `src/__tests__/gameLogsViewOnly.test.js` (NEW, contract test)
Mirror [scheduleViewOnly.test.js](src/__tests__/scheduleViewOnly.test.js) verbatim — same
`PIPELINE` array (the 14 projection/scoring modules). 

| # | Case | Expected |
|---|---|---|
| C1 | for each PIPELINE module: source must not match `/from\s+['"][^'"]*nflGameLogs['"]/` nor `/loadNflGameLogs/`; and `src/api/nflGameLogs.js` must not import from `seasonProjection`/`dynastyScore`/`projectionSignals`/`usageMetrics` | all pass (no projection/scoring module imports the loader; loader imports nothing from projection/scoring) |

---

## Cross-repo impact

- **Existing data-repo contract consumed:** the served shape `{ schemaVersion:1, season,
  generatedAt, rowCount, playerCount, unmapped, players{ [sleeper_id]:{ gsisId, name, position,
  games[] } } }` and the **`MIN_PLAYERGAME_ROWS = 3000`** sparsity floor. The data repo's side is
  **already shipped** (live on the CDN for 2012–2024; 2019 absent upstream). The app **re-asserts**
  these; it does not redefine them.
- **Shared-constant sync point:** `MIN_PLAYERGAME_ROWS` in `dataStore.js` must equal the data
  repo's per-file write-gate value (3000) exactly. If either side ever changes the floor, both
  change together — document it at the constant (the comment in FILE 1 states this) and in the
  CLAUDE.md cross-repo bullet.
- **No NEW obligation flows back to the data repo.** This slice consumes an already-published
  contract loader-only; it adds no field, no schema bump (gamelogs v1 ≤ existing
  `MAX_SUPPORTED_SCHEMA` 3), and no new file the data repo must produce. **Nothing to change in
  `sleeper-dashboard-data`.**

---

## Handoff note (next slice — do NOT build here)
The Outlook slice is the planned consumer. It will wire `loadNflGameLogs` (lazy per-season, like
`NflStatsTab` lazy-loads `loadNflSchedule`) and is where season figures get recomputed from the
single-game components. This slice ships the loader only — keep it out of `ProfileDataContext`,
the `playerRows` pipeline, and all UI, exactly as `nflSchedule.js` shipped.

## Invariants honored
- **View-only:** never imported by `seasonProjection.js`/`dynastyScore.js`/any factors entry/any
  grading path — enforced by `gameLogsViewOnly.test.js` (C1).
- **No served-shape or floor changes** — app re-asserts only.
- **nflverse `fantasyPoints` not conflated** with `src/utils/fantasyPoints.js` — pass-through data.
- **Existing per-year conventions reused by name** — `getCacheRecord`/`setCacheWithMeta`,
  `tryDataStore`/`getManifestEntry`, `nfl-gamelogs/<year>` cache key, 999999 TTL, `lastModified`
  freshness, declared-`rowCount` floor re-assert, `{ players:{}, year:null, complete:false,
  rowCount:0 }` graceful empty. No parallel mechanism invented.
