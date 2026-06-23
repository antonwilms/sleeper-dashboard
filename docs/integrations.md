Deep reference for the API/data-store layer, loaders, enrichment, cache, and projection snapshots.

## College Football Data (CFBD) integration

College production is loaded in the background once `careerStats` is available and the league is loaded.

### Fetching (`src/api/cfbd.js`)

Requires `VITE_CFBD_API_KEY` in `.env.local`. In development, requests go through a Vite proxy (`/cfbd-proxy → https://api.collegefootballdata.com`) to bypass CORS. In production, requests hit the API directly.

```js
getBulkPlayerStats(year, category)  // category: 'receiving' | 'rushing' | 'passing'
```

Fetches `/stats/player/season?year=X&category=Y`. Returns rows shaped:
`{ playerId, player, team, position, category, statType, stat }` — one row per stat type per player.

`loadCollegeStats()` fetches receiving + rushing + passing for years 2017–2024 sequentially (400 ms delay between years to respect rate limits). Returns `{ receiving: { [year]: rows[] }, rushing: { [year]: rows[] }, passing: { [year]: rows[] } }`. Results are cached permanently in IndexedDB under `cfbd-players/<year>/<category>`.

**Helper functions:**
- `pivotStatRows(rows)` — groups row-per-stat format into flat player objects: `{ playerId, player, team, position, YDS, TD, REC, YPR, LONG, CAR, YPC, ATT, COMPLETIONS, INT, YPA, PCT, ... }`. All stat values parsed as floats. CFBD provides derived fields like `YPA` and `PCT` directly — no need to compute them downstream.
- `computeTeamTotals(pivotedPlayers)` — sums `YDS + TD` per college team across all pivoted players. Used for receiving / rushing / passing team totals.

**Confirmed passing `statType` keys (CFBD, verified 2023):** `YDS · TD · YPA · COMPLETIONS · INT · PCT · ATT`.

### Matching (`src/utils/collegeMatch.js`)

`matchCollegeToSleeper(rawCollegeData, playersMap)` maps CFBD player entries to Sleeper `player_id`s.

**Name normalisation (`normalizeName`):** lowercase, strip apostrophes/periods, replace remaining punctuation with spaces, drop suffix tokens (Jr/Sr/II/III/IV/V), collapse whitespace.

**College normalisation (`normalizeCollege`):** lowercase, strip "university"/"college"/"the", apply alias table (LSU → louisiana state, Ole Miss → mississippi, USC → southern california, UCF → central florida, SMU → southern methodist, TCU → texas christian, and ~15 more), replace punctuation with spaces.

**Matching strategy:**
1. Build a name-keyed lookup from all QB/RB/WR/TE in Sleeper's `playerMap`.
2. For each year, pivot receiving, rushing, and passing rows; compute team totals for all three categories.
3. **Pass 1 (receiving-driven, skill players):** for each CFBD receiving player, look up by normalized name; disambiguate by college if multiple candidates. Attach matching rushing entry if present.
4. **Pass 2 (passing-driven, QBs only):** for each CFBD passing player, look up by normalized name. Only attach if the matched Sleeper player has `position === 'QB'` — prevents trick-play passers (WRs/RBs) from polluting passing data.
5. Receiving and passing matches for the same player in the same year merge into a single season entry via an in-year upsert accumulator.
6. Return `{ [player_id]: [{ year, team, receiving, rushing, passing, teamRecTotals, teamRushTotals, teamPassTotals }] }` sorted oldest → newest. Each of `receiving`, `rushing`, `passing` may be null.

Skill players (WR/TE/RB) come from receiving as before. QBs are matched from the passing pass.

### College metrics (`src/utils/collegeMetrics.js`)

`computeCollegeMetrics(seasons, position, currentAge, currentSeason)` → metrics object or null.

**Conference strength multiplier** — applied to raw dominator rating (and to the QB quality score) before all threshold checks:

| Tier | Conferences | Multiplier |
|---|---|---|
| Power | SEC, Big Ten | 1.00 |
| Strong | ACC, Big 12, Pac-12 | 0.90 |
| Mid-Major | AAC, Mountain West, MAC, Sun Belt, CUSA, Ind | 0.78 |
| FCS / Unknown | All others | 0.55 |

This ensures a 30% dominator in the SEC and a 30% dominator in a mid-major conference produce meaningfully different adjusted ratings.

**Per-season quality metric** — `domRating` for skill players, `qbScore` for QBs (× conference multiplier):

| Position | Field | Formula |
|---|---|---|
| WR / TE | `domRating` | `(recYDS / teamRecYDS × 0.65 + recTD / teamRecTD × 0.35) × 100` |
| RB | `domRating` | `(rushYDS / teamRushYDS × 0.65 + rushTD / teamRushTD × 0.35) × 100` |
| QB | `qbScore` | `efficiency × 0.55 + volume × 0.45 + tdBonus` (see below) |

**QB quality score (`qbScore`):**

- **Efficiency** band on CFBD-provided `YPA` (yards per attempt): `4 YPA → 0`, `9 YPA → 100`, clamped.
- **Volume** band on `ATT` (pass attempts): `200 att → 0`, `800 att → 100`, clamped.
- **TD bonus**: `min(10, passing TD / 3)` added at the end, clamped to a final 0–100 score.
- Conference multiplier applied identically to skill-player domRating.

**Estimated age:** `currentAge − (currentSeason − season.year)`

**Breakout detection** — first season meeting the position-specific threshold:

| Position | Threshold |
|---|---|
| WR / TE | `domRating ≥ 20` OR receiving YDS ≥ 800 |
| RB | `domRating ≥ 30` OR rushing YDS ≥ 700 |
| QB | passing YDS ≥ 2500 OR passing TD ≥ 20 |

**Production trend** (requires 2+ seasons with valid ratings — `domRating` for skill/RB, `qbScore` for QB):
- finalYear > mean × 1.15 → `"improving"`
- within 15% of mean → `"peak-final"`
- finalYear < mean × 0.85 → `"declining"`
- single season → `"single-season"`

**Return shape:**
```js
{
  seasons: [{
    year, conference, confMultiplier, estimatedAge,
    domRating,   // populated for WR/TE/RB; null for QB
    qbScore,     // populated for QB; null otherwise
    receiving, rushing, passing,  // any may be null
  }],
  breakoutAge,          // integer age or null — drives the Profile breakout chip; projection records it capture-only
  peakDominator,        // max of (domRating or qbScore, by position) — name preserved for back-compat
  finalYearDominator,   // most recent season's domRating or qbScore (position-aware)
  productionTrend,      // 'improving' | 'peak-final' | 'declining' | 'single-season'
  seasonsPlayed,        // integer
}
```

`peakDominator` and `finalYearDominator` keep their names but hold the position-appropriate value (dominator% for skill/RB, score for QB) so the display layer can branch by `player.position` without a schema change.

---

## Data store integration (`src/api/dataStore.js`)

A public GitHub repo (`sleeper-dashboard-data`) serves pre-computed historical data via jsDelivr CDN, eliminating the 7-minute career history load and 24 CFBD round-trips on a cold start.

### URL structure

```
https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/nfl/season-totals/<year>.json
https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/college/<category>/<year>.json
https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/manifest.json
```

Replace `<owner>` with the actual GitHub account. A placeholder or missing `VITE_DATA_STORE_URL` disables the data store for the entire session (`sessionDisabled = true`) — the app falls back to API-only mode and the ~7-minute career load runs on every visit. This is the top failure mode in the table below.

### Fetch order

```
1. IndexedDB cache
       │  hit (not expired, v2-shaped, not stale vs manifest) → return
       │    • data-store-sourced entry (sourceLastModified set): stale if manifest has newer lastModified
       │    • live-API-sourced entry (no sourceLastModified): served on return visits unless
       │      the data store has a usable non-inProgress entry to migrate to
       ▼  miss / expired / stale / pre-phase-5 shape
2. Data store (if enabled, manifest loaded, file present, schema OK, not inProgress)
       │  hit → write to IndexedDB with sourceLastModified metadata, return
       ▼  miss / disabled / schema mismatch / network fail
3. Live API (existing behaviour)
       │  hit → write to IndexedDB, return
       ▼  fail → bubble up error
```

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `VITE_DATA_STORE_URL` | *(none)* | Base URL — must be set to the real published repo URL; if unset or contains `<user>`, data store is disabled |
| `VITE_DATA_STORE_ENABLED` | `'true'` | Set to `'false'` to force API-only mode. Only the literal string `'false'` disables. |

Both are set in `.env.local`.

### Manifest

Fetched once per session from `<baseUrl>/manifest.json`, memoised in memory and also persisted to IndexedDB with a 60-minute TTL under key `data-store/manifest`. Shape:

```js
{
  schemaVersion: 1,
  generatedAt: '2026-05-17T00:00:00Z',
  files: {
    'nfl/season-totals/2023.json': { schemaVersion: 1, lastModified: '2026-04-01T...', inProgress: false },
    'college/receiving/2023.json': { schemaVersion: 1, lastModified: '2026-04-01T...', inProgress: false },
    // ...
  },
}
```

`inProgress: true` means the CI job is regenerating the file — treat as a miss, fall through to live API.

### Failure modes

| Failure | Behaviour |
|---|---|
| `VITE_DATA_STORE_URL` unset or contains `<user>` placeholder | Data store disabled immediately without attempting any fetch; `[dataStore] VITE_DATA_STORE_URL is a placeholder` warning logged once |
| Manifest times out (> 5 s) or 5xx | Data store disabled for the rest of the session; single `[dataStore]` log including the URL |
| Manifest malformed (parse error, missing `files`) | Same as above |
| Specific file 404 or times out (> 15 s) | Treated as miss; fall through to live API silently |
| `schemaVersion` in manifest exceeds `MAX_SUPPORTED_SCHEMA` | Skip file; fall through; log once per file per session |
| File JSON shape doesn't pass validator | Skip file; `[dataStore] shape mismatch` log once per file |

### Exports

| Function | Description |
|---|---|
| `tryDataStore(relativePath, { validate })` | Returns parsed JSON or null |
| `getManifestEntry(relativePath)` | Returns manifest file entry or null |
| `isDataStoreReady()` | True if enabled and manifest loaded |
| `invalidateManifest()` | Forces manifest re-fetch on next request |

---

## Career history loader (`src/api/sleeperStats.js`)

Loads full career stats from 2012 to the most recently completed season, one week at a time (200 ms delay between requests — only after actual network fetches, not when weeks are served from cache). A progress bar at the bottom shows current season/week. Completed seasons are cached permanently under `season-totals/<year>`.

**Cache reuse across visits:** A v2-shaped season-totals entry is served on return visits without re-running the 18-week loop. Data-store-sourced entries (have `sourceLastModified`) are re-fetched only when the manifest confirms a newer data-store version. Live-API-sourced entries (no `sourceLastModified`) are served from cache unless the data store has a usable non-in-progress entry to migrate to.

**Fantasy point calculation:** Points are calculated weekly from raw stat objects. Never summed from stored season totals — avoids inflated rate-stat accumulation.

**Usage stat keys (D2):** `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, and `pass_rz_att` flow through the generic stat-summing aggregation (no schema change, no data-repo coordination for the live path) and are consumed by the D2 snap-share / red-zone usage projection factors (`src/utils/usageMetrics.js`). Seasons predating these fields degrade to neutral factors.

**Why some seasons carry more stat fields than others (stated fact, not a bug).** Field coverage differs by era and is expected:
- **Snap & red-zone keys** (`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) exist in Sleeper data from **~2021 onward**. Pre-2021 seasons lack them, so the D2 snap-share / RZ-usage factors, D3 team-RZ-share, and the durability snap-share contributor signal all **degrade to neutral** for those seasons (by design — see `usageMetrics.js`, `teamRzShare.js`, `durabilitySignals.js`).
- **Season length:** pre-2021 NFL had **17 regular-season weeks**; those seasons store `X` at week 18 for every player (see `sleeper-dashboard-data/README.md → nfl/season-totals`).
- **College coverage:** CFBD college stats are loaded for **2017–2024 only** (see CFBD integration below), so the rookie path's college signals are blank for players whose college careers fall outside that window.

**gamesPlayed accuracy:** The `gp` field is the authoritative participation signal:
- `gp === 1` → played; increments `gamesPlayed`, `gamesStarted` if `gs === 1`
- `gp === 0` → in response but didn't play; classified as `byeWeek` (team not playing) or `dnpWeek` (team played, player didn't)
- absent → not in response

**Stale cache invalidation:** Entries without a `weeklyStatus` field (pre-Phase-5 cache writes) are re-fetched automatically. The same sentinel is applied to IndexedDB entries populated by the data-store path, so users who cached a v1 season-totals payload re-fetch it after the data store ships v2.

**Schema versions (Phase 5):** Manifest entries for `nfl/season-totals/<year>.json` ship at `schemaVersion: 2`. `dataStore.js` advertises `MAX_SUPPORTED_SCHEMA = 2`. The `isValidSeasonTotals` shape validator only requires v1 fields, so a season that is still on v1 in the data store keeps loading — `AvailabilityHistory` simply renders the GP/DNP columns with a blank sparkline for that season.

**Per-player season data shape:**
```js
{
  gamesPlayed, gamesStarted, byeWeeks, dnpWeeks,
  fantasyPoints,   // cumulative season float
  weeklyPoints,    // { [week]: float }
  stats,           // raw stat totals for the season

  // Phase 5 (present on v2 season-totals files and on live aggregation):
  weeklyStatus,    // Array<'P'|'D'|'B'|'X'> length 18 — 'P' played, 'D' DNP, 'B' bye, 'X' absent
  availability: {
    longestAbsence,      // number — max run of consecutive 'D' weeks within firstWeek..lastWeek
    absenceSegments,     // Array<{ start, end, length }>  1-indexed weeks
    firstWeek, lastWeek, // number | null — first/last week with 'P'
    returnedFromAbsence, // boolean — true if any segment ends before lastWeek
    absenceCause,        // 'unknown' placeholder for future enrichment
  },
}
```

---

## Enrichment overlay

The enrichment overlay is a separate layer of hand-curated data (coaching changes, scheme notes, injury type/severity, free-form notes) that lives in `sleeper-dashboard-data/enrichment/`. It is fetched once on app mount via `loadEnrichment()` (`src/api/enrichment.js`) and stored in `enrichmentMap` state.

**Phase 6 consumer:** `AvailabilityHistory` enriches tooltips on red `D` (DNP) cells. When `enrichment/injuries.json` has an entry whose `(playerId, year, segmentStartWeek..segmentEndWeek)` covers a cell, the tooltip upgrades to `W{n}: DNP — {type} ({severity})`. Cells with no enrichment show `W{n}: DNP`.

**Graceful degradation:** if the data store is disabled or unreachable, `enrichmentMap` stays `null`; all consumers fall back to unenriched baseline rendering with no console errors.

**Adding entries:** use `node bin/enrich.mjs` in the data repo (see `sleeper-dashboard-data/README.md → Enrichment overlay`). Direct JSON edits bypass validation; always run `node bin/enrich.mjs validate` after manual edits.

**Lookup helpers:** `src/utils/enrichmentLookup.js` exposes `findInjuryForWeek`, `getCoaching`, `getScheme`, `getNotes` — all null-safe pure functions.

---

## API layer

### `src/api/sleeper.js` — official endpoints (`https://api.sleeper.app/v1`)

| Function | Endpoint | Cache TTL |
|---|---|---|
| `getNFLState()` | `/state/nfl` | 60 min |
| `getUserByUsername(username)` | `/user/<username>` | 60 min |
| `getLeaguesForUser(userId, season)` | `/user/<userId>/leagues/nfl/<season>` | 60 min |
| `getLeague(leagueId)` | `/league/<leagueId>` | 60 min |
| `getLeagueUsers(leagueId)` | `/league/<leagueId>/users` | 60 min |
| `getLeagueDrafts(leagueId)` | `/league/<leagueId>/drafts` | 60 min |
| `getDraftPicks(draftId)` | `/draft/<draftId>/picks` | 1 week |
| `getLeagueRosters(leagueId)` | `/league/<leagueId>/rosters` | 60 min |
| `getMatchups(leagueId, week)` | `/league/<leagueId>/matchups/<week>` | 60 min (live) / 1 week (completed) |
| `getAllPlayers()` | `/players/nfl` | 24 h (~5 MB response) |

### `src/api/sleeperStats.js` — undocumented endpoints (`https://api.sleeper.com`)

| Function | Cache key | Cache TTL |
|---|---|---|
| `getWeeklyStats(season, week)` | `stats/<season>/<week>` | 60 min (live) / 1 week (completed) |
| `getWeeklyProjections(season, week)` | `projections/<season>/<week>` | 60 min |
| `loadCareerHistory(...)` | `season-totals/<year>` | permanent (999999 min) |

### `src/api/ktc.js`

| Function | Cache key | Cache TTL |
|---|---|---|
| `getKTCValues()` | `ktc-values` | 4320 min (3 days) |
| `loadKtcHistory()` (`src/utils/ktcHistory.js`) | `ktc-history/v1` | 1440 min (1 day) backstop; rebuilt on new snapshot |

### `src/api/cfbd.js`

| Function | Cache key | Cache TTL |
|---|---|---|
| `getBulkPlayerStats(year, category)` | `cfbd-players/<year>/<category>` | permanent (999999 min) |

### `src/api/nflDraft.js` — nflverse draft picks

- **Source:** `${VITE_DATA_STORE_URL}/nflverse/draft/draft_picks.json` via `tryDataStore`/`getManifestEntry` in `dataStore.js`. The direct nflverse release URL is CORS-blocked in the browser (302 → `release-assets.githubusercontent.com`, no `Access-Control-Allow-Origin`); `sleeper-dashboard-data` ingests the nflverse CSV server-side via `bin/update.mjs draft` (yearly Action) and publishes it as JSON via jsDelivr. See the data repo for the served shape spec.
- No API key, no auth.
- **Years loaded:** 2017–current (matches CFBD coverage). Older draft classes are exclusively year-9+ vets who don't hit the rookie projection path.
- **Cache:** `nfl-draft/<year>` per year, permanent TTL (999999 min). Each cache record stores `{ picks, lastModified }`. Freshness is checked against the manifest `lastModified` — a changed token triggers a full re-fetch so draft-day additions land.
- **Failure mode:** when the manifest is unavailable, permanently-cached years are served as-is (manifest-null is treated as "keep cache", not "stale"); uncached years degrade to `[]`. When the manifest is present but the data store fetch fails, fresh cached years are served and uncached years degrade to `[]`. Either way, projection degrades gracefully — `nflDraftMultiplier = 1.0` for every player when data unavailable.
- **Refresh:** manifest `lastModified` invalidation is automatic. To force a refetch manually, clear the `nfl-draft/*` cache keys.

### `src/api/nflRoster.js` — nflverse current rosters

- **Source:** `${VITE_DATA_STORE_URL}/nflverse/roster/<year>.json` via `tryDataStore`/`getManifestEntry` in `dataStore.js`. The direct nflverse release URL is CORS-blocked in the browser (302 → `release-assets.githubusercontent.com`, no `Access-Control-Allow-Origin`); `sleeper-dashboard-data` ingests the nflverse CSV server-side via `bin/update.mjs roster` (weekly Tuesday Action; content-hash dedup; `inProgress: false`) and publishes it as JSON via jsDelivr. See the data repo for the served shape spec.
- No API key, no auth.
- **`sleeper_id` join** → direct join to Sleeper player IDs; no fuzzy name matching required. ~86% sleeper_id coverage of skill-position rows (roster_2025: ~2141 rows).
- **Cache:** `nfl-roster/<year>` per year, permanent TTL (999999 min). Each cache record stores `{ byId, season, rowCount, lastModified, activeIds }`. Freshness is checked against the manifest `lastModified` — a changed token triggers a re-fetch, picking up the weekly roster refresh.
- **Probe order:** `currentSeason → currentSeason−1 → currentSeason−2`. `currentSeason` is `nflState.season` (the actual current/upcoming NFL season). In the offseason the upcoming-season file is not yet published, so the resolved year is typically `currentSeason − 1`.
- **`MIN_ROSTER_IDS = 1500`** sparsity gate: only files with ≥ 1500 sleeper-id-bearing rows are trusted (matches the data-repo write-gate). A sparse preliminary file is never cached as authoritative; the probe continues to the next year.
- **Failure mode:** if no year yields a complete roster, returns `{ activeIds: null, year: null, complete: false, byId: null }` → the relevance filter treats all roster statuses as `'unknown'` and falls back to prior behavior (no players hidden).
- **Usage:** `activeIds` (a `Set<sleeper_id>`) drives `rosterStatusOf()` in `src/utils/relevance.js`. Absence from a complete roster tightens the stale-team+KTC rule; presence is an additive keep-signal. Rostered players and current rookies are always kept regardless.

### `src/api/advStats.js` — nflverse advanced stats (view-only)

- **Source:** `${VITE_DATA_STORE_URL}/nflverse/advstats/<year>.json` via `tryDataStore`/`getManifestEntry` in `dataStore.js`. `sleeper-dashboard-data` ingests nflverse advanced receiving stats server-side (Phase 1a) and publishes them as JSON via jsDelivr. `sleeper_id`-keyed; WR/TE/RB; `inProgress: false`, `schemaVersion: 1`.
- No API key, no auth.
- **View-only.** Loaded for **display/diagnostics only** in the Player Profile "Advanced & Usage" panel. **Never** consumed by projection or scoring — enforced by `src/__tests__/advStatsViewOnly.test.js`. Activation is parked (see the "Advstats & Signal Grading — Findings and Open Items" doc).
- **Served fields per player:** `targetShare`, `airYardsShare`, `wopr`, `racr` (plus raw `components`). `airYardsShare`/`racr` are frequently `null` for RBs.
- **Cache:** `nfl-advstats/<year>` per year, permanent TTL (999999 min). Each record stores `{ byId, season, rowCount, lastModified }`. Freshness is checked against the manifest `lastModified` — a changed token re-fetches.
- **Probe order:** `currentSeason → currentSeason−1`, where `currentSeason` is the most-recent completed season (careerStats-derived). In the offseason the upcoming season's advstats are not yet published, so the resolved year is typically the last completed season.
- **`MIN_ADVSTATS_ROWS = 250`** sparsity gate: only files with ≥ 250 sleeper-id rows are trusted (matches the data-repo write-gate). Sparse files are skipped, not cached.
- **Failure mode:** store down / no qualifying year / shape mismatch → `{ byId: null, year: null, complete: false, rowCount: 0 }`; the panel renders nothing (no crash, no NaN).

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

### `src/api/dataStore.js`

| Export | Description |
|---|---|
| `tryDataStore(relativePath, { validate })` | Fetches `relativePath` from the data store; validates shape; returns parsed JSON or null |
| `getManifestEntry(relativePath)` | Returns the manifest's file entry for `relativePath`, or null |
| `isDataStoreReady()` | Resolves true if the data store is enabled and the manifest loaded successfully |
| `invalidateManifest()` | Clears the in-memory manifest promise; next `tryDataStore` / `getManifestEntry` call re-fetches |

---

## Cache (`src/utils/cache.js`)

IndexedDB database `sleeper-dashboard`, object store `cache`. Base record shape: `{ key, data, expiresAt }`. Records written via `setCacheWithMeta` also carry optional fields: `sourceLastModified` and `sourceSchemaVersion` (both nullable).

| Function | Description |
|---|---|
| `getCache(key)` | Returns `data` or `null` on miss/expiry — unchanged |
| `setCache(key, value, ttlMinutes)` | Writes record without metadata — unchanged |
| `getCacheRecord(key)` | Returns `{ data, expiresAt, sourceLastModified, sourceSchemaVersion }` or null. Used by data-store-aware callers to access metadata for stale-check. |
| `setCacheWithMeta(key, value, ttlMinutes, meta)` | Like `setCache` but also persists `meta.sourceLastModified` and `meta.sourceSchemaVersion`. |
| `clearCache(prefix)` | No argument → clears all; with prefix → deletes matching keys |

Default TTL: 1440 min for keys containing `"players"`, 60 min otherwise. Pass TTL explicitly to override.

### Debug panel

Five buttons, each requiring two-click confirmation:

| Button | Call | Effect |
|---|---|---|
| Clear KTC cache | `clearCache('ktc-values')` | Forces fresh KTC fetch |
| Clear KTC history cache | `clearCache('ktc-history/')` | Forces a fresh historical-snapshot rebuild |
| Clear season totals | `clearCache('season-totals/')` | Re-fetches all career seasons |
| Clear weekly stats | `clearCache('stats/')` | Removes weekly stat cache |
| Clear all cache | `clearCache()` | Wipes everything |
| Clear data store cache | `clearCache('data-store/')` + `invalidateManifest()` | Removes manifest + all data-store-sourced entries; forces manifest re-fetch on next request |

### Projection snapshots (`src/utils/projectionSnapshot.js`)

Once per UTC day, after the season projection pipeline (`seasonProjections`) produces its final rows **and the lagging projection inputs (CFBD college stats, nflverse draft picks, the prior-snapshot team map) have settled**, the app writes a snapshot to IndexedDB under the key `projection-snapshots/<YYYY-MM-DD>`. The snapshot records the contemporaneous inputs and outputs of the pipeline (player projections, KTC values, NFL depth charts, scoring basis, the league's raw `scoringSettings`, and the forecast `targetSeason`) so future backtests have a real before-the-fact dataset to grade against.

**Input-settled gate (warm-load race).** `seasonProjections` goes non-null as soon as `careerStats` + age curves exist, but three inputs arrive later over async loads and each defaults to a *neutral* result when null: `collegeStats` and `nflDraftMatches` (CFBD / data-store) → the rookie multipliers `collegeContribution` / `nflDraftMultiplier` = 1.0, and `priorTeamByPlayer` (prior-snapshot IDB read) → `isTeamChange` null → no vet team-change neutralization. On a warm (cached) career load the write would otherwise fire — and be frozen for the whole UTC day by first-write-wins — before those land, baking neutral college/draft and a missing team-change signal into that day's snapshot. The write effect therefore gates on three `*Settled` flags (`collegeSettled` / `nflDraftSettled` / `priorTeamSettled`) that flip once each load attempt *resolves or rejects* — **settled, not non-null** — so sessions where those inputs legitimately stay null forever (CFBD / data-store disabled; no prior snapshot yet) still write, because neutral college/draft and a null prior-team map are then the correct permanent truths. The gate predicate is the pure `shouldWriteProjectionSnapshot` in `projectionSnapshot.js`. The snapshot schema is unchanged — only the write *timing* moved.

**Idempotency:** `writeProjectionSnapshot` calls `getCacheRecord` first; if a live record already exists for today's UTC date, it returns `{ written: false, reason: 'already-exists' }` without touching IndexedDB. Re-fires of the effect (e.g. when `playerRowsWithProj` identity changes after a pipeline re-run) are no-ops after the first write.

**First-league-of-the-day-wins limitation:** snapshots are keyed by UTC date only, not by `leagueId`. If the user opens a second league on the same day, its snapshot is skipped. The recorded `leagueId` makes this detectable retrospectively.

**TTL:** 999999 minutes (~1.9 years). These records pass `isLive()` in `exportData.js` and appear in the export ZIP as `snapshots/<date>.json`. They are never auto-expired within a session; cleanup is a v2 concern.

**Export path:** `classifyKey` in `exportData.js` routes `projection-snapshots/<date>` cache keys to `snapshots/<date>.json` in the ZIP. The data repo's `node bin/update.mjs snapshots` then registers each file in `manifest.json`. See `sleeper-dashboard-data/README.md → snapshots/<date>.json` for the import workflow.

**Schema v2 (this change):** snapshots now carry top-level `schemaVersion: 2`, `targetSeason` (= `currentSeason + 1`, where `currentSeason` is the last season in `careerStats`), `currentSeason`, and `scoringSettings` (the league's raw `scoring_settings`, verbatim — the existing derived `scoringBasis` label stays). v2 is additive: existing v1 snapshots remain valid (no migration; append-only). The per-player `projection` field is unchanged. The data repo's grading harness already prefers `snapshot.targetSeason` over its `capturedAt` heuristic.

---

## KeepTradeCut (KTC) integration

KTC dynasty values are fetched on every league load (cache miss) or served from IndexedDB (TTL 3 days). See [Fetching](#fetching-srcapiktcjs) section below for full details on proxy, pagination, HTML parsing, and matching.

### Fetching (`src/api/ktc.js`)

1. **Vite proxy** (dev only): `/ktc-proxy/...` → `https://keeptradecut.com/...`
2. **corsproxy.io fallback**: used in production or when proxy response lacks `.onePlayer` elements
3. **Pagination**: loops pages 0–9 (`?page=N`), stops on partial page or no new players. Up to 500 players; in practice 300–350.
4. **Deduplication**: `Set` of `"name|team"` keys.

**URL format:** `https://keeptradecut.com/dynasty-rankings?filters=QB%7CRB%7CWR%7CTE%7CRDP&format=2&page=0`

### HTML parsing

```
div.onePlayer
  div.player-name > p > a          → name
                       span.player-team → team abbreviation
  div.position-team                → "QB", "RB2", etc.
  div.value > p                    → dynasty value integer
```

### Matching (`src/utils/ktcMatch.js`)

`matchKTCToSleeper(ktcPlayers, playersMap)` — supports v1 (`playerName, positionID`) and v2 (`name, position`) cache formats. Two-strategy matching: `name|POSITION` lookup first, `name|TEAM` fallback.

### Data flow

```
getKTCValues() → matchKTCToSleeper() → ktcMap state
  → playerRowsWithKTC → ProfileDataContext → usePlayerProfile → ktcValue
```

### Historical KTC signals (`src/utils/ktcHistory.js`)

Projection C2 adds a second KTC path that reads *historical* snapshots from the
data store (`ktc/snapshot-YYYY-MM-DD.json`) — separate from and additive to the
single-latest-snapshot `ktc-values` cache.

`loadKtcHistory({ playersMap, window })` runs once per league load in App.jsx:

1. Enumerates `ktc/snapshot-*.json` entries from the data-store manifest.
2. Selects the 8 most recent, deduping snapshots within 5 days of each other.
3. Fetches them in parallel via `tryDataStore` (skips `inProgress` / 404 / stale
   schema).
4. Matches each snapshot to Sleeper IDs (`matchKTCToSleeper`) and assembles
   per-player value time-series plus per-snapshot position medians.
5. Caches the assembled structure under `ktc-history/v1`; rebuilds when the
   newest snapshot's manifest `lastModified` changes.

`computeKtcSignals(series)` (pure) derives four signals per player — delta,
volatility, trajectory, and rank-vs-position-median trend — recorded into the
projection's `factors` as `ktcHist*` keys. **Capture-only: the signals are
recorded for backtesting and do not move `projectedPPG`.**

Graceful degradation: when the data store is unavailable or holds fewer than 2
usable snapshots, every player's signals are neutral null sentinels and the
projection is unaffected.
