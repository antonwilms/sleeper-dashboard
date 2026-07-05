# Team-context loader (`nflverse/teamcontext/<year>.json`) + shared player→team join helper — app-side, view-only, loader-only

**Session 1 (opus) plan. Implement in Session 2 (sonnet). No source was edited in this session.**

Add the APP-SIDE loader for the data repo's already-shipped **team-keyed** context pack
(`nflverse/teamcontext/<year>.json`, live on the CDN **2012–2025**, all 14 seasons present in the
manifest), plus the **shared player→team join helper** that future consumers (Outlook shares,
teamcontext display consumers, the projection refactor) will all use. Ship **loader-only**: no UI,
no `ProfileDataContext`, no `playerRows` wiring this slice — exactly like `nflGameLogs.js` shipped
with no consumer.

This is the **app side of an already-shipped data-repo contract** (data repo commit `a817d45`,
2026-07-04). The served shape and the `MIN_TEAMCONTEXT_ROWS = 60` floor are fixed — the app
re-asserts them, it does not redefine them. Do not propose changing either.

---

## Verified live contract (verified against the live files during planning — do not re-derive)

### Served shape (from `nflverse/teamcontext/2013.json` and `2025.json`, both inspected)

```
{
  schemaVersion: 1,
  season: <number>,
  generatedAt: <ISO string>,
  rowCount: <number>,        // team-GAME rows (REG + POST), e.g. 534 (2013), 570 (2025)
  teamCount: 32,
  teams: {
    <TEAM>: {                // era-accurate team abbr — the object key IS the team code
      games: [
        {
          week: <number>,    // continuous REG→POST numbering (see below)
          seasonType: 'REG' | 'POST',
          gameId: <string>,  // e.g. "2013_01_ARI_STL"
          opponent: <TEAM>,  // era-accurate, same domain as the keys
          off: { …31 fields },
          def: { …18 fields }
        }, …
      ]
    }, …
  }
}
```

- **`off` fields (verified, exact):** `plays, passPlays, rushPlays, passRate, epaSum, epaPlays,
  epaPerPlay, passEpaSum, passEpaPlays, passEpaPerPlay, rushEpaSum, rushEpaPlays, rushEpaPerPlay,
  successes, successPlays, successRate, proePlays, proePassPlays, proeXpassSum, proe, rzTrips,
  rzPlays, rzPassPlays, rzRushPlays, rzPassRate, rzTdTrips, rzFgTrips, neutralSeconds,
  neutralGaps, neutralSecPerPlay, pointsScored`
- **`def` fields (verified, exact):** `plays, passPlays, rushPlays, epaSum, epaPlays, epaPerPlay,
  passEpaSum, passEpaPlays, passEpaPerPlay, rushEpaSum, rushEpaPlays, rushEpaPerPlay, successes,
  successPlays, successRate, rzTripsAllowed, rzTdTripsAllowed, pointsAllowed`
- **Per-week rates are single-game values** (`proe`, `epaPerPlay`, `successRate`, `rzPassRate`,
  `neutralSecPerPlay`, `passRate`, …) — **never sum or average the ratios across weeks**; the rows
  ship the counting components (`epaSum`/`epaPlays`, `proeXpassSum`/`proePassPlays`,
  `neutralSeconds`/`neutralGaps`, …) precisely so a consumer aggregates components and re-divides.
  This is the gamelogs rate-field rule applied to team rows; the loader is pass-through.
- **Week numbering is continuous REG→POST** and **unique within a team-season** (verified: SEA 2013
  plays REG weeks 1–17 then POST 19/20/21 — week 18 was its wild-card bye; PHI 2025 plays REG 1–18
  then POST 19). `rowCount` includes POST rows (2013: 534 = 512 REG + 22 POST). A `(team, week)`
  lookup by `week` alone is therefore unambiguous.
- **Manifest entry (verified):** `{ schemaVersion: 1, recordCount, inProgress: false,
  lastModified }`. Note the manifest field is **`recordCount`**, not `rowCount` — same as the
  other nflverse families; loaders never read it (they use only `lastModified`, plus
  `tryDataStore`'s built-in `schemaVersion`/`inProgress` gates). The floor is asserted on the
  **file's** declared `rowCount`. Do not "fix" the field-name mismatch.
- **Floor:** `MIN_TEAMCONTEXT_ROWS = 60`, defined in the data repo at
  `lib/nflverse.mjs:53`, write-gated at `scripts/update-teamcontext.mjs:85-89`. (60 ≈ two weeks'
  worth of team-game rows; the completed-season files carry 534–570.) The data repo also has
  `MIN_TEAMCONTEXT_SEASON = 2012` (`lib/nflverse.mjs:55`) — **data-repo-side only**; the app does
  not mirror it (absent seasons degrade via the manifest probe).
- **Current season (2025) mutates weekly** during the season; past seasons are immutable — the
  standard `lastModified`-freshness / permanent-cache pairing applies unchanged.

### Team-code domain map (load-bearing — every value below was verified, not assumed)

| Source | Field | Domain | Verified evidence |
|---|---|---|---|
| teamcontext `teams` keys + `opponent` | — | **Era-accurate** | 2013 file has STL/SD/OAK, no LA/LAC/LV/LAR; 2025 has LA/LAC/LV, no LAR |
| season-totals per-season team (`careerStats[season][pid].team`, schema v3) | `team` | **Era-accurate, SAME abbr domain as teamcontext** | Exhaustive scan of `nfl/season-totals/2012–2025.json`: 2013 = STL/SD/OAK; 2016 = LA+SD+OAK; 2017 = LA+LAC+OAK; 2020 = LA+LAC+LV; **zero anomalies, `LAR` never appears in any year** |
| gamelogs `games[].team` / `games[].opponent` (`nflverse/gamelogs/<year>.json`) | `team` | **CURRENT-FRANCHISE for ALL seasons** | 2013 file contains LA/LAC/LV and **no** STL/SD/OAK. This is deliberate on the data-repo side (`lib/nflverse.mjs:931-937`: the two families have different domains — "do not 'fix' one to match the other") |
| schedule `homeTeam`/`awayTeam` (`nflverse/schedule/<year>.json`) | — | **Era-accurate** | 2013 file has STL/SD/OAK, no LA |
| Sleeper `playerMap[pid].team` (current team) | — | Sleeper current domain, incl. **LAR** | Existing alias `SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }` at [nflStats.js:2](src/utils/nflStats.js) exists for exactly this |

**Era remap (the data repo's, to be mirrored app-side):** `eraTeam(abbr, season)` at data repo
`lib/nflverse.mjs:942-947`:
`LA → STL` for season ≤ 2015 · `LAC → SD` for season ≤ 2016 · `LV → OAK` for season ≤ 2019.

**The domain boundary, stated:** the **week-grain** source (gamelogs `games[].team`) resolves
**current-franchise** codes and MUST be era-remapped before joining teamcontext or schedule; the
**season-grain** source (`careerStats[season][pid].team`) is already era-accurate and in the same
abbr domain — the remap is a **provable identity** on it (see D8). `playerMap[pid].team` (Sleeper
current team, incl. `LAR`) is **not** an input to the join helper — it identifies the player's
*current* team, which is meaningless for a historical (season, week) join. Do not add it as a
fallback.

---

## Key decisions (read before implementing)

### D1 — Explicit-season `loadTeamContext(year)`, no probe-down. **Confirmed.**
Mirror `loadNflGameLogs(year)` ([nflGameLogs.js:66](src/api/nflGameLogs.js)) verbatim. A
teamcontext consumer needs an arbitrary past season (any of 2012–2025), so a
"most-recent-available" probe is the wrong shape — same reasoning as the schedule/gamelogs loaders
(documented at [nflGameLogs.js:32-37](src/api/nflGameLogs.js)). A caller wanting the current
season resolves it from `nflState.season`: `loadTeamContext(parseInt(nflState.season, 10))`.

### D2 — Validator + shared floor live in `dataStore.js` (schedule/gamelogs style). **Confirmed.**
`MIN_TEAMCONTEXT_ROWS` and `isValidTeamContext` go in `dataStore.js`, appended after
`isValidGameLogs` ([dataStore.js:142-158](src/api/dataStore.js) is the gamelogs block to mirror;
the file currently ends at line 158). This matches the two existing **shared cross-repo floors**
(`MIN_SCHEDULE_GAMES` [dataStore.js:130](src/api/dataStore.js), `MIN_PLAYERGAME_ROWS`
[dataStore.js:145](src/api/dataStore.js)) — the validator must see the constant, and the loader
imports both from `dataStore.js` exactly like [nflGameLogs.js:57](src/api/nflGameLogs.js).

### D3 — Floor is checked on the declared `rowCount` in both validator and loader. **Confirmed.**
Like gamelogs, there is **no flat top-level array** (`teams` is an object of objects with nested
`games[]`), so both the validator and the loader re-assert use the file's declared top-level
`rowCount` — the same reasoning documented at [dataStore.js:147-151](src/api/dataStore.js).

### D4 — Cache the whole season file under `nfl-teamcontext/<year>`; `(season, team)` identity is served by lookup helpers, not by per-team cache records.
One IndexedDB record per year, permanent TTL (999999 min), `lastModified` freshness — identical to
`nfl-gamelogs/<year>` ([nflGameLogs.js:39-42, 74, 91](src/api/nflGameLogs.js)). The task brief's
"cache key is (season, team)" is the **row identity**, honored by the exported lookups
(`getTeamSeasonRows` / `getTeamWeekRow`); fragmenting into 32 records per season would invent a
parallel mechanism. The **one intentional divergence** from the gamelogs precedent: the payload is
`teams` (team-keyed) instead of `players` (sleeper_id-keyed), and lookups are by team code — do
not route through any sleeper_id-keyed helper or validator.

### D5 — File name collision: `src/api/teamContext.js` vs the existing `src/utils/teamContext.js` (a projection-pipeline module). Handled, not renamed.
The slice mandates `src/api/teamContext.js`. The existing `src/utils/teamContext.js`
(`computeTeamContext` etc.) is **in the projection pipeline** and is legitimately imported by
`dynastyScore.js`/`seasonProjection.js` — it even appears in the view-only PIPELINE list
([gameLogsViewOnly.test.js:13](src/__tests__/gameLogsViewOnly.test.js)). Consequences:
- The view-only contract test **must use a path-qualified regex** (`api\/teamContext`), never a
  bare `/teamContext/`, which would false-positive on every legitimate `./teamContext` import in
  the pipeline.
- Export names are globally unique and non-colliding: `loadTeamContext`, `getTeamSeasonRows`,
  `getTeamWeekRow` (vs the utils module's `compute*` names).
- The loader's header comment must state the distinction explicitly.

### D6 — Join helper is a NEW leaf util `src/utils/playerTeam.js`. **Confirmed, with reasoning.**
Candidate homes considered against live source:
- `src/utils/teamContext.js` — **rejected**: it is a projection-pipeline module; hosting a
  view-only helper there would make the view-only contract unenforceable (the pipeline may import
  that file freely).
- `src/utils/nflStats.js` — **rejected as host** (it is schedule-join/game-log focused), but the
  helper **imports `normalizeTeamForSchedule` from it** ([nflStats.js:4-7](src/utils/nflStats.js))
  to reuse the existing `LAR → LA` alias rather than duplicating the table (no parallel
  mechanisms). No import cycle: `playerTeam → nflStats` only; `nflStats` imports nothing.
- New `src/utils/playerTeam.js` — **chosen**: small, pure, view-only, one responsibility.

### D7 — Uniform normalization chain on both grains: `normalizeTeamForSchedule` (LAR→LA) then `eraTeam(abbr, season)`.
Applied to both grains for one code path. On the season grain both steps are identity on all live
data (see domain map); on the week grain `eraTeam` is the load-bearing correction. Applying the
chain uniformly is protective (a stray current-franchise or LAR code still resolves correctly) and
costs nothing.

### D8 — Outlook consolidation: **YES — consolidate.** Provably numerically invariant.
The three inline reads in `outlookPositionStats.js` (`data.team` at
[outlookPositionStats.js:39](src/utils/outlookPositionStats.js) and
[:78](src/utils/outlookPositionStats.js), `seasonData.team ?? null` at
[:194](src/utils/outlookPositionStats.js)) are replaced with `resolvePlayerTeam(...)` calls.
Invariance argument, in three parts:
1. **The transform is identity unless** the input ∈ {`LA` season ≤ 2015, `LAC` ≤ 2016, `LV` ≤ 2019,
   `LAR` any season}. An exhaustive scan of `nfl/season-totals/2012–2025.json` (all 14 files, run
   during planning) found **zero** such values — every year has exactly 32 team codes, all
   era-correct, `LAR` never appears.
2. **Internal consistency**: the denominator builder (`buildTeamShareTotals`) and both share
   consumers key by the *same* transformed value, so even a hypothetical remap could not split a
   team's totals across keys.
3. **The existing test fixtures** use neutral codes (`DAL`, `A`, `B`) with seasons 2022–2025
   (checked `outlookPositionStats.test.js`) — identity there too.

**Invariance gate (hard):** `src/utils/outlookPositionStats.test.js` and
`src/utils/outlookUsage.test.js` must pass **UNCHANGED — do not edit either file**. If either
fails after the refactor, revert only the `outlookPositionStats.js` edits (keep the helper and
loader), and report the consolidation as a follow-up instead. Invariance over tidiness.

---

## Edits, grouped by file

### 1. `src/api/dataStore.js` — append validator + floor (after `isValidGameLogs`, i.e. after line 158, end of file)

Mirror the `MIN_PLAYERGAME_ROWS`/`isValidGameLogs` block style
([dataStore.js:142-158](src/api/dataStore.js)):

```js
// Shared cross-repo sparsity floor for nflverse/teamcontext/<year>.json. Must equal the data
// repo's write-gate value exactly (lib/nflverse.mjs MIN_TEAMCONTEXT_ROWS); both repos change
// together. Enforced here (validator) and re-asserted in src/api/teamContext.js (loader, on the
// declared rowCount).
export const MIN_TEAMCONTEXT_ROWS = 60

// Structure + floor validator for the FIRST TEAM-keyed family. teams is keyed by era-accurate
// team abbr → { games[] }; rows are identified by (team, week), not sleeper_id. No flat
// top-level array, so the floor is checked on the declared rowCount (like isValidGameLogs).
// schemaVersion is NOT re-checked here — the MAX_SUPPORTED_SCHEMA ceiling is enforced against
// the manifest entry in tryDataStore, per the gamelogs precedent (dataStore.js:149-151).
export function isValidTeamContext(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  if (typeof p.teams !== 'object' || p.teams === null) return false
  if (typeof p.rowCount !== 'number' || p.rowCount < MIN_TEAMCONTEXT_ROWS) return false
  const sample = Object.values(p.teams)[0]
  if (sample == null || !Array.isArray(sample.games) || sample.games.length === 0) return false
  const g = sample.games[0]
  return g != null && 'week' in g && 'opponent' in g && 'off' in g && 'def' in g
}
```

Notes: sampling the first team + first game mirrors `isValidGameLogs`'s sampling
([dataStore.js:156-157](src/api/dataStore.js)). `MAX_SUPPORTED_SCHEMA` ([dataStore.js:8](src/api/dataStore.js))
stays untouched — teamcontext ships `schemaVersion: 1`, which passes the existing
`entry.schemaVersion > MAX_SUPPORTED_SCHEMA` gate in `tryDataStore`
([dataStore.js:81](src/api/dataStore.js)); no new mechanism.

### 2. `src/api/teamContext.js` — NEW loader (mirror [nflGameLogs.js](src/api/nflGameLogs.js) structure 1:1)

Header comment must cover: VIEW-ONLY/LOADER-ONLY + decoupling test name; source path + CDN
coverage (2012–2025); the served shape summary incl. the rate-field rule (never sum/average
ratios; aggregate the `*Sum`/`*Plays` components and re-divide); FIRST TEAM-keyed family (identity
`(team, week)`, era-accurate codes, join via `src/utils/playerTeam.js`); continuous REG→POST week
numbering; explicit-season signature rationale; cache key/TTL; the triple floor enforcement; the
graceful empty shape; and the name distinction from `src/utils/teamContext.js` (projection module,
unrelated).

```js
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidTeamContext, MIN_TEAMCONTEXT_ROWS } from './dataStore'

const EMPTY = { teams: {}, year: null, complete: false, rowCount: 0 }

/**
 * Loads the nflverse team-context pack for one explicit season.
 * @param {number} year  explicit NFL season, e.g. 2013 (= parseInt(nflState.season, 10) for current)
 * @returns {Promise<{ teams: object, year: number|null, complete: boolean, rowCount: number }>}
 */
export async function loadTeamContext(year) {
  const path = `nflverse/teamcontext/${year}.json`

  // 1. Manifest check — absent season / store disabled → graceful empty
  const entry = await getManifestEntry(path)
  if (!entry) return { ...EMPTY }

  // 2. Cache check (lastModified-aware) — must still meet the sparsity floor
  const rec = await getCacheRecord(`nfl-teamcontext/${year}`)
  if (rec?.data?.rowCount >= MIN_TEAMCONTEXT_ROWS && rec.data.lastModified === entry.lastModified) {
    console.log(`[teamContext] year=${year} served from cache (rows=${rec.data.rowCount})`)
    return { teams: rec.data.teams, year, complete: true, rowCount: rec.data.rowCount }
  }

  // 3. Fetch (isValidTeamContext rejects malformed / below-floor files at the boundary)
  const json = await tryDataStore(path, { validate: isValidTeamContext })
  if (!json) return { ...EMPTY }

  // 4. Sparsity re-assert on the declared rowCount (no flat top-level array)
  if (json.rowCount < MIN_TEAMCONTEXT_ROWS) {
    console.log(`[teamContext] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_TEAMCONTEXT_ROWS}), skipping`)
    return { ...EMPTY }
  }

  // 5. Cache with lastModified for next-load freshness
  await setCacheWithMeta(`nfl-teamcontext/${year}`, {
    teams: json.teams,
    season: json.season,
    rowCount: json.rowCount,
    lastModified: entry.lastModified,
  }, 999999, {})

  console.log(`[teamContext] fetched year=${year} rows=${json.rowCount}`)
  return { teams: json.teams, year, complete: true, rowCount: json.rowCount }
}

/**
 * All game rows for one team within a loaded season. `team` must be an ERA-ACCURATE code
 * (resolvePlayerTeam output / teamcontext key domain). Null on miss or empty load — never throws.
 * @param {{ teams: object }} loaded  loadTeamContext(year) result
 * @param {string} team
 * @returns {Array<object>|null}
 */
export function getTeamSeasonRows(loaded, team) {
  if (!team) return null
  return loaded?.teams?.[team]?.games ?? null
}

/**
 * One team-week row within a loaded season. Weeks are continuous REG→POST and unique per
 * team-season; a bye/absent week returns null. Never throws.
 * @returns {object|null}
 */
export function getTeamWeekRow(loaded, team, week) {
  const games = getTeamSeasonRows(loaded, team)
  if (!games) return null
  return games.find(g => g.week === week) ?? null
}
```

### 3. `src/utils/playerTeam.js` — NEW shared join helper (pure, view-only, sync)

Header comment must state: the SINGLE player→team resolution point; era-accurate output domain
(joins to teamcontext + schedule); the season-grain vs week-grain sources and their input domains
(season-totals = era-accurate already; gamelogs = current-franchise, remap load-bearing); that
`eraTeam` **mirrors the data repo's `lib/nflverse.mjs` `eraTeam`** and a future franchise
move/rename must update both together; view-only (never feeds projection/scoring, guarded by
`teamContextViewOnly.test.js`); and that `playerMap[pid].team` (current team) is deliberately not
an input.

```js
import { normalizeTeamForSchedule } from './nflStats.js'

/**
 * App-side mirror of the data repo's era remap (lib/nflverse.mjs eraTeam). Maps a
 * current-franchise abbr to the era-accurate abbr for old seasons; identity otherwise.
 * A future relocation/rename must be added in BOTH repos together.
 */
export function eraTeam(abbr, season) {
  if (abbr === 'LA'  && season <= 2015) return 'STL'
  if (abbr === 'LAC' && season <= 2016) return 'SD'
  if (abbr === 'LV'  && season <= 2019) return 'OAK'
  return abbr
}

/**
 * Resolve a player's ERA-ACCURATE team code for a season (week omitted) or a specific week.
 * - Season grain: careerStats[season][playerId].team (season-totals schema v3 — already
 *   era-accurate; the normalization chain is a verified identity on that domain).
 * - Week grain:   gameLogPlayers[playerId].games[].team (nflverse gamelogs — CURRENT-FRANCHISE
 *   domain in all seasons; the era remap here is load-bearing). Caller supplies
 *   loadNflGameLogs(season).players.
 * Returns null when unresolved — never throws, never NaN.
 * @param {{ careerStats?: object, gameLogPlayers?: object }} sources
 * @param {string} playerId
 * @param {number|string} season
 * @param {number|null} [week]
 * @returns {string|null}
 */
export function resolvePlayerTeam({ careerStats, gameLogPlayers } = {}, playerId, season, week = null) {
  const yr = Number(season)
  if (!playerId || !Number.isFinite(yr)) return null
  let raw = null
  if (week == null) {
    raw = careerStats?.[yr]?.[playerId]?.team ?? null
  } else {
    raw = gameLogPlayers?.[playerId]?.games?.find(g => g.week === week)?.team ?? null
  }
  if (!raw) return null
  return eraTeam(normalizeTeamForSchedule(raw), yr)
}
```

### 4. `src/utils/outlookPositionStats.js` — consume the helper (three sites + import + JSDoc), per D8

- **Import** (after line 5, alongside the existing imports at
  [outlookPositionStats.js:3-5](src/utils/outlookPositionStats.js)):
  `import { resolvePlayerTeam } from './playerTeam.js'`
- **Site 1 — `buildTeamShareTotals`, line 39**: `const team = data.team` →
  `const team = resolvePlayerTeam({ careerStats }, playerId, season)`
  (`careerStats`, `playerId`, `season` are all in scope in that loop; the `if (!team) continue`
  gate on line 40 is unchanged — the helper returns null exactly when `data.team` is falsy).
- **Site 2 — `buildPerSeasonTeamShares`, line 78**: `const team = data.team` →
  `const team = resolvePlayerTeam({ careerStats }, playerId, season)` (same shape; gate on line 79
  unchanged).
- **Site 3 — `buildPositionStatSeries`, line 194**: `const seasonTeam = seasonData.team ?? null` →
  `const seasonTeam = resolvePlayerTeam({ careerStats }, playerId, season)`.
- **JSDoc**: update the two doc mentions of inline team attribution —
  [outlookPositionStats.js:22-24](src/utils/outlookPositionStats.js) ("teams by the PER-SEASON
  team (careerStats[season][id].team, nflverse domain e.g. 'LA')") and
  [:57-58](src/utils/outlookPositionStats.js) — to say attribution is via
  `playerTeam.resolvePlayerTeam` (season grain; era-accurate domain, identical values to the
  former inline read).
- **No signature changes**; no caller (`OutlookTab.jsx`) edits. The double `careerStats[season][playerId]`
  lookup inside the helper is O(1) per row — acceptable for one join implementation.

### 5. `src/__tests__/teamContextViewOnly.test.js` — NEW contract test (mirror [gameLogsViewOnly.test.js](src/__tests__/gameLogsViewOnly.test.js))

- Copy the 14-module `PIPELINE` list verbatim from
  [gameLogsViewOnly.test.js:7-24](src/__tests__/gameLogsViewOnly.test.js) (keep the "add new
  projection/scoring modules here" comment).
- For each pipeline module assert (per D5, **path-qualified** — a bare `/teamContext/` would
  false-positive on the legitimate `src/utils/teamContext.js` imports):
  - `expect(src).not.toMatch(/from\s+['"][^'"]*api\/teamContext['"]/)`
  - `expect(src).not.toMatch(/loadTeamContext|getTeamSeasonRows|getTeamWeekRow/)`
  - `expect(src).not.toMatch(/from\s+['"][^'"]*playerTeam['"]/)`
  - `expect(src).not.toMatch(/resolvePlayerTeam/)`
- Mirror the reverse assertion ([gameLogsViewOnly.test.js:35-38](src/__tests__/gameLogsViewOnly.test.js)):
  `src/api/teamContext.js` **and** `src/utils/playerTeam.js` import nothing from
  `seasonProjection|dynastyScore|projectionSignals|usageMetrics`. (`playerTeam.js` importing
  `./nflStats` is fine — `nflStats.js` is view-only and not in the pipeline.)

---

## Step sequence for the implementer

1. `src/api/dataStore.js`: append `MIN_TEAMCONTEXT_ROWS` + `isValidTeamContext` (edit 1).
2. `src/api/dataStore.test.js`: add the `isValidTeamContext` describe (Tests → C).
3. `src/api/teamContext.js`: new loader + lookups (edit 2).
4. `src/api/teamContext.test.js`: new co-located unit tests (Tests → A).
5. `src/utils/playerTeam.js`: new join helper (edit 3).
6. `src/utils/playerTeam.test.js`: new co-located unit tests (Tests → B).
7. `src/utils/outlookPositionStats.js`: consolidation edits (edit 4). Then run
   `npx vitest run src/utils/outlookPositionStats.test.js src/utils/outlookUsage.test.js` —
   **both must pass with zero edits to the test files** (D8 gate). If not: revert step 7 only,
   keep everything else, and report the consolidation as a follow-up.
8. `src/__tests__/teamContextViewOnly.test.js`: new contract test (edit 5).
9. Docs updates (below).
10. Done-definition: `npm test` (full suite green) → `npm run lint` (0 problems) →
    `npm run build` (clean). No dev server / visual checks — loader-only, nothing renders.

---

## Tests to add

**A. `src/api/teamContext.test.js`** (co-located; mirror the mock harness of
[nflGameLogs.test.js:1-28](src/api/nflGameLogs.test.js) — `vi.mock('./dataStore', …importOriginal)`
and `vi.mock('../utils/cache')`). Fixture: `ENTRY = { lastModified, schemaVersion: 1,
inProgress: false }`; `TEAMS` with two era-accurate 2013 teams, e.g. `STL` with games
`[{ week: 1, seasonType: 'REG', gameId: '2013_01_ARI_STL', opponent: 'ARI', off: { proe: 0.022,
epaPerPlay: 0.053, rzPassRate: 0.8, plays: 70 }, def: { epaPerPlay: -0.055, pointsAllowed: 27 } },
{ week: 19, seasonType: 'POST', … }]` and `ARI` with a week-1 game;
`makeJson(rowCount = 534, teams = TEAMS)` returning
`{ schemaVersion: 1, season: 2013, generatedAt, rowCount, teamCount: 2, teams }`.

| # | Case | Inputs | Expected |
|---|---|---|---|
| T1 | Fresh cache hit | entry + cached `{ teams, rowCount: 534, lastModified: same }` | served from cache; `tryDataStore` not called; `{ teams, year: 2013, complete: true, rowCount: 534 }` |
| T2 | Cache miss → fetch + cache | entry, no cache, `tryDataStore → makeJson()` | `setCacheWithMeta` once with key `nfl-teamcontext/2013`, TTL `999999`, `lastModified` stored; result complete |
| T3 | Below-floor rowCount | `makeJson(40)` | EMPTY `{ teams: {}, year: null, complete: false, rowCount: 0 }`; no cache write |
| T4 | Manifest entry null (absent season / store disabled) | `getManifestEntry → null` | EMPTY; `tryDataStore` not called |
| T5 | Store unavailable / shape mismatch | `tryDataStore → null` | EMPTY; no cache write |
| T6 | Stale cache `lastModified` | cached token ≠ entry token | re-fetch; new token cached |
| T7 | Explicit-year signature | `loadTeamContext(2014)` | manifest path and cache key both contain `2014`; `result.year === 2014` |
| T8 | Pass-through (computes nothing) | fetch path | `off.proe === 0.022`, `off.epaPerPlay === 0.053`, `off.rzPassRate === 0.8` unchanged on the returned rows |
| T9 | Cache-hit floor guard | cached record with `rowCount: 40` + matching token | not served from cache; falls through to fetch (mirrors [nflGameLogs.js:75](src/api/nflGameLogs.js)) |
| T10 | `getTeamSeasonRows` hit/miss | loaded 2013 + `'STL'` / `'LA'` / EMPTY-loaded | games array / `null` (era-wrong code misses — correct by design) / `null`, no throw |
| T11 | `getTeamWeekRow` | (`'STL'`, 1) / (`'STL'`, 19 — continuous POST week) / (`'STL'`, 2 — absent) / (`'LA'`, 1) | row / row / `null` / `null` |

**B. `src/utils/playerTeam.test.js`** (co-located; pure — no mocks):
- `eraTeam` boundary matrix: `(LA,2015)→STL`, `(LA,2016)→LA`, `(LAC,2016)→SD`, `(LAC,2017)→LAC`,
  `(LV,2019)→OAK`, `(LV,2020)→LV`, `(KC,2013)→KC`, `(STL,2013)→STL` (identity on already-era codes).
- Season grain: `careerStats = { 2013: { p1: { team: 'STL' } } }` → `'STL'` (**the STL-2013 case**);
  `{ 2025: { p1: { team: 'LA' } } }` → `'LA'`; defensive `LAR` input → `'LA'` (alias chain);
  missing season / missing pid / `team: null` / `careerStats` undefined → `null`.
- Week grain: `gameLogPlayers = { p1: { games: [{ week: 5, team: 'LA' }] } }` with season `2013`
  → `'STL'` (**the load-bearing era remap of the current-franchise gamelogs domain**); same with
  season `2025` → `'LA'`; week miss → `null`; pid miss → `null`; `gameLogPlayers` undefined → `null`.
- Season passed as string `'2013'` → coerced, same results. `resolvePlayerTeam({}, …)` and
  `resolvePlayerTeam(undefined, …)` → `null`, never throws.

**C. `src/api/dataStore.test.js`** — new `describe('isValidTeamContext')` after the
`isValidGameLogs` describe ([dataStore.test.js:239-280](src/api/dataStore.test.js)), mirroring its
case style: valid payload passes (rowCount ≥ 60, sampled team has non-empty `games` with
`week`/`opponent`/`off`/`def`); `expect(MIN_TEAMCONTEXT_ROWS).toBe(60)` (the cross-repo pin);
rejects: `rowCount: 40` (below floor); `rowCount: '534'` (non-number); `teams: null` / missing;
sampled team without a `games` array / with empty `games`; `games[0]` missing `off` or `def`;
top-level array payload; `null` payload.

**D. `src/__tests__/teamContextViewOnly.test.js`** — as specified in edit 5 (the view-only import
assertion for both the loader and the helper, path-qualified per D5).

**E. Outlook invariance (no new file):** `src/utils/outlookPositionStats.test.js` and
`src/utils/outlookUsage.test.js` pass **unchanged** — this is the D8 invariance gate, not a new test.

---

## Docs updates

1. **CLAUDE.md → `### src/api/` table** — add a row after the `nflGameLogs.js` row:

   > `| teamContext.js | nflverse team-context pack (`nflverse/teamcontext/<year>.json`) — **first TEAM-keyed family**: `teams` keyed by era-accurate team abbr → `games[]`, row identity `(team, week)` (weeks continuous REG→POST), NOT `sleeper_id`; explicit-season `loadTeamContext(year)` (no probe); `MIN_TEAMCONTEXT_ROWS=60` floor; per-year permanent cache (`nfl-teamcontext/<year>`); `lastModified` freshness; graceful empty shape; pass-through (per-week rates never summed — aggregate the `*Sum`/`*Plays` components); lookups `getTeamSeasonRows`/`getTeamWeekRow`; joins via `utils/playerTeam.js`. **View-only / loader-only** — no consumer this slice; not wired into projection/scoring (guarded by `teamContextViewOnly.test.js`). Distinct from `src/utils/teamContext.js` (projection module) |`

2. **CLAUDE.md → `### src/utils/` table** — add a `playerTeam.js` row (near `nflStats.js`):

   > `| playerTeam.js | `eraTeam(abbr, season)` (app-side mirror of the data repo's era remap — LA→STL ≤2015, SD/LAC ≤2016, OAK/LV ≤2019; both repos change together on a future franchise move) + `resolvePlayerTeam({careerStats, gameLogPlayers}, playerId, season, week?)` — the SINGLE player→team resolution point, returning ERA-ACCURATE codes (teamcontext/schedule domain). Season grain: `careerStats[season][pid].team` (already era-accurate); week grain: gamelogs `games[].team` (current-franchise domain → era-remapped here). View-only; never feeds projection/scoring (guarded by `teamContextViewOnly.test.js`) |`

3. **CLAUDE.md → `### src/utils/` table, `outlookPositionStats.js` row** — amend the phrase
   "shares are **per-season-team** attributed (`careerStats[season][id].team`, schema v3)" to
   "shares are **per-season-team** attributed via `playerTeam.resolvePlayerTeam` (season grain —
   `careerStats[season][id].team`, schema v3, era-accurate domain; numerically identical to the
   former inline read)".

4. **CLAUDE.md → Cross-repo contracts** — add a bullet after the gamelogs bullet:

   > `- **nflverse teamcontext (view-only):** `src/api/teamContext.js` reads `nflverse/teamcontext/<year>.json`, produced by the data repo (`scripts/update-teamcontext.mjs` ← nflverse pbp). The served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, teamCount, teams }`; `teams` keyed by **era-accurate** team abbr → `{ games[] }`; each game `{ week, seasonType, gameId, opponent, off:{…}, def:{…} }`; weeks continuous REG→POST; per-week rates are single-game values, never summed — consumers aggregate the `*Sum`/`*Plays` components) and the shared **`MIN_TEAMCONTEXT_ROWS = 60`** sparsity floor are the contract, re-asserted app-side in `dataStore.js` (`isValidTeamContext`) and `teamContext.js`. The **first TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; joins go through `src/utils/playerTeam.js` (`eraTeam` mirrors the data repo's era remap — a future franchise move updates both repos together). This is the app side of an already-shipped data-repo contract — view-only, not wired into projection/scoring (guarded by `teamContextViewOnly.test.js`), no UI/pipeline consumer this slice. Changing the served shape or the shared floor must be coordinated (both repos change together).`

5. **README.md → `src/` tree** — after the `nflGameLogs.js` line (line 97):
   `    teamContext.js      # nflverse team-context pack loader (view-only); first TEAM-keyed family — (team, week) rows; explicit-season loadTeamContext(year); MIN_TEAMCONTEXT_ROWS=60 floor; per-year permanent cache; graceful empty shape`
   and after the `nflStats.js` line (line 165):
   `    playerTeam.js       # eraTeam + resolvePlayerTeam — single player→team resolution point (era-accurate codes; view-only, never feeds projection/scoring)`

6. **docs/integrations.md** — insert a new section
   `### \`src/api/teamContext.js\` — nflverse team context (view-only)` between the gamelogs
   section (ends line 343) and `### src/api/dataStore.js` (line 345), mirroring the gamelogs
   section's bullet structure ([integrations.md:332-343](docs/integrations.md)): Source (CDN path,
   2012–2025, one file per season); served shape (as in the Cross-repo bullet, incl. the exact
   `off`/`def` field lists or a pointer to the data repo's `data-catalog.md`); the
   single-week-rate rule; the era-accurate team-code domain + `playerTeam.js` join pointer +
   the gamelogs-domain boundary note; explicit-season signature; cache (`nfl-teamcontext/<year>`,
   permanent TTL, `lastModified` freshness for the mutable current season); the
   `MIN_TEAMCONTEXT_ROWS = 60` triple enforcement (validator / cache-hit guard / loader
   re-assert); view-only/loader-only + guard test name; failure mode → the empty shape. Do NOT
   touch the two dataStore Exports tables ([integrations.md:180-187](docs/integrations.md),
   [:345-352](docs/integrations.md)) — they list only the four fetch functions, not validators or
   floors (verified).

7. **docs/signal-registry.md** — add one row to the **raw ingested data** table after the
   gamelogs row (line 57):

   > `| nflverse team context (off/def per-week: plays/passRate, `proe`, `epaPerPlay`/`successRate` splits, RZ trip/pass rates, `neutralSecPerPlay` pace, points) | raw ingested data | data: `nflverse/teamcontext/<year>.json` (`scripts/update-teamcontext.mjs` ← nflverse pbp); served TEAM-keyed (`teams[abbr].games[]`, era-accurate codes) | **2012–2025, no gap**; `MIN_TEAMCONTEXT_ROWS=60` floor | **Reconstructable** — re-derivable from pbp at any time | **view-only display** (loader shipped, no consumer yet); `app: src/api/teamContext.js` + join helper `src/utils/playerTeam.js`; never feeds projection/scoring |`

   Also amend the "NFL per-season team (`team`)" row (line 46) Current-use cell: append
   "; resolution now via `playerTeam.resolvePlayerTeam` (era-accurate domain)". Do **not** edit
   the dated coverage-audit table at the top of the file (lines 10–24) — it is a point-in-time
   audit that predates this family.

---

## Cross-repo impact

- **Consumed contract (existing — this slice mirrors it, adds no new obligation):** the served
  shape above and `MIN_TEAMCONTEXT_ROWS = 60`. Data-repo anchors: floor at `lib/nflverse.mjs:53`,
  write gate at `scripts/update-teamcontext.mjs:85-89`, era remap `eraTeam` at
  `lib/nflverse.mjs:942-947`. The data-repo side shipped (commit `a817d45`, 2026-07-04) —
  **no NEW obligation flows back to the data repo.**
- **Shared-constant sync points (two):**
  1. `MIN_TEAMCONTEXT_ROWS = 60` — `dataStore.js` (app) must equal `lib/nflverse.mjs` (data);
     both move together. Pinned by the `expect(MIN_TEAMCONTEXT_ROWS).toBe(60)` test.
  2. `eraTeam` — `src/utils/playerTeam.js` (app) mirrors `lib/nflverse.mjs:942-947` (data). A
     future franchise relocation/rename must update both together (documented in both the helper
     header and the CLAUDE.md contract bullet).
- **Known asymmetry, do not "fix":** the manifest entry field is `recordCount` (all nflverse
  families); the file field is `rowCount`. Loaders read only `entry.lastModified` (+
  `tryDataStore`'s `schemaVersion`/`inProgress` gates) and assert the floor on the file's
  `rowCount` — the gamelogs precedent, unchanged here.

## Out of scope (do not do in this slice)

- No consumer wiring: no UI, no context, no `playerRows` pipeline, no `App.jsx` change, no
  `OutlookTab.jsx`/`NflStatsTab.jsx` change.
- `NflStatsTab`/`buildGameLog` keeps its own `normalizeTeamForSchedule` join path
  ([nflStats.js:53-63](src/utils/nflStats.js)) — it is already correct (per-season team is
  era-accurate; schedule is era-accurate). Unifying it onto `resolvePlayerTeam` is a possible
  follow-up, not this slice.
- `playerMap[pid].team` (Sleeper current-team domain, incl. `LAR`) stays out of the helper.
- No `MIN_TEAMCONTEXT_SEASON` mirror app-side.
- No changes to the served shape, the floor value, `MAX_SUPPORTED_SCHEMA`, or any cache TTL.
