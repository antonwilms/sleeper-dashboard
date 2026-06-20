Deep reference for the App.jsx state model, the playerRows pipeline, ranks, and platform/runtime notes.

## App-level architecture

`App.jsx` owns all React state and the full data pipeline. Child components receive data as props or read from `ProfileDataContext`. There is no Redux, Zustand, or other state library.

### Routing & shell

App.jsx wraps its content in `HashRouter` and renders `AppShell` (the nav chrome frame). Surfaces are routed via `react-router-dom` and receive pipeline outputs as **props injected by App** — state still lives only in App.jsx; routing is URL-derived, not React state.

| Path | Surface | Notes |
|---|---|---|
| `/` | → `/players` | Catch-all redirect to `DEFAULT_ROUTE` |
| `/board` | Board | Gated placeholder; unlocks with slice 5 |
| `/roster` | Roster (My Team) | Props: `myTeamData`, `myTeamLoading`, `myTeamError`, `seasonProjections` |
| `/players` | Player Explorer | Props: full `playerRowsWithProj` pipeline output + 13 additional props |
| `/trade` | Trade | Gated placeholder; unlocks with slice 5 |
| `/league` | → `/league/standings` | Secondary group redirect |
| `/league/:view` | LeagueView | `view` ∈ standings\|schedule\|rosters; prop: `leagueData` |
| `*` | → `/players` | Unknown-path fallback |

`DEFAULT_ROUTE = '/players'` until the Board is ungated (flip to `'/board'` in `navItems.js`). HashRouter was chosen because no committed SPA-rewrite/fallback config exists; it works correctly under any static host with zero server config.

### State management

All persistent state lives in either `localStorage` (session metadata) or `IndexedDB` (data cache). React state (`useState`) is ephemeral — lost on page reload and re-derived from the cache or API on next load.

**localStorage keys:**

| Key | Contents |
|---|---|
| `sleeper-user` | `{ user_id, username, display_name, avatar }` |
| `sleeper-league` | `{ league_id, name, season }` |
| `tooltips-enabled` | `"true"` or `"false"` (default true) |
| `theme` | `"dark"` or `"light"` (default dark) |
| `comparison-list` | JSON array of up to 4 player IDs |
| `explorer-sort` | `{ column, direction }` — persists last sort across filter changes |
| `explorer-presets` | JSON array of saved filter preset objects |

**Theming:** token-driven dark/light; `.dark` class on `<html>` activates the dark token block in `src/index.css`. Default dark; stored `localStorage['theme']` wins; OS preference not read. `src/theme.js` provides load/persist/apply helpers; `App.jsx` owns the `theme` state.

**Key React state in `App`:**

| State | Type | Purpose |
|---|---|---|
| `theme` | `'dark'`\|`'light'` | Dark/light theme; default dark; persisted in `localStorage['theme']`; applied via `.dark` on `<html>` |
| `storedUser` | object\|null | Loaded from localStorage on boot |
| `selectedLeague` | object\|null | Loaded from localStorage on boot |
| `leagueData` | object\|null | Full assembled league object (see below) |
| `careerStats` | object\|null | `{ [season]: { [player_id]: playerSeasonData } }` |
| `ktcMap` | Map\|null | `player_id → { value, confidence }` |
| `ktcHistory` | object\|null | Assembled KTC snapshot time-series (see Historical KTC signals); null until the loader resolves |
| `careerLoadProgress` | object | `{ current, total, label }` for progress bar |
| `rawCollegeData` | object\|null | `{ receiving: { [year]: rows[] }, rushing: { [year]: rows[] } }` from CFBD |
| `collegeMatches` | object\|null | `{ [player_id]: [seasonEntry] }` — CFBD matched to Sleeper IDs |
| `collegeSettled` | `boolean` | `false` until `loadCollegeStats()` resolves/rejects; gates the daily snapshot write so rookie college inputs aren't captured neutral |
| `nflDraftPicks` | object\|null | `{ [year]: DraftPick[] }` — raw nflverse draft data; null until loader resolves |
| `nflDraftMatches` | object\|null | `{ [player_id]: NflDraftMatch }` — matched draft entries keyed by Sleeper player_id (D1) |
| `nflDraftSettled` | `boolean` | `false` until `loadNflDraftPicks()` resolves/rejects; gates the daily snapshot write so rookie draft inputs aren't captured neutral |
| `nflRoster` | object\|null | `{ activeIds: Set<sleeper_id>\|null, year, complete, byId }` — loaded from nflverse roster CSV; null until the loader resolves |
| `priorTeamSettled` | `boolean` | `false` until `loadPriorSnapshotTeams()` resolves/rejects; gates the daily snapshot write so vet team-change neutralization isn't captured missing |
| `seasonProjections` | object\|null | `{ [player_id]: projectionObject }` — next-season projection per player |

### leagueData assembly

When a league is selected, `App` fetches all league data in parallel and assembles a `leagueData` object:

```js
{
  league,           // raw Sleeper league object
  users,            // array of Sleeper user objects
  rosters,          // array of Sleeper roster objects
  playerMap,        // { [player_id]: playerInfo } from getAllPlayers()
  rosterTeams,      // assembled array: [{ teamName, starters, bench, reserve, rosterId, userId }]
  myRosterId,       // roster ID of the logged-in user
  scoringSettings,  // league.scoring_settings (used for fantasy point calculation)
  rookieDraftPicks, // { [player_id]: { round, pick } } — from most recent rookie draft
}
```

### playerRows pipeline

The Explorer table is driven by a memoised pipeline. Steps must stay in this order:

```
careerStats + leagueData + empiricalCurves + positionPeakPPG + ktcMap + teamContext
  + depthMap + historicalShares
    → playerRows (useMemo)          — computeDynastyScore called per player;
                                      share trend boost applied inside dynasty score
    → playerRowsWithKTC (useMemo)   — merges ktcMap values
    → qbQualityByTeam (useMemo)     — computeQBQualityByTeam(…, true): league-wide incl.
                                      un-rostered QBs; depthMap prefers depth-chart QB1.
                                      Sibling qbQualityByTeamRostered (legacy rostered-only)
                                      feeds projection Step 7b only (backtest-gated swap pending)
    → playerRowsWithQBMod (useMemo) — applyQBQualityModifier (teamContext.js) per WR/TE/RB row:
                                      OQ × [0.85–1.15] (WR/TE) or [0.95–1.10] (workhorse RB),
                                      score re-blended at 15% weight
    → playerRowsFinal (useMemo)     — computeMarketDivergence adds divergence signals
    → playerRanks (useMemo)         — computePositionalRanks + computeRoleRanks
                                      returns Map<player_id, ranksObject>
    → playerRowsWithRanks (useMemo) — merges rank fields into each row
    → passed as prop to PlayersTab
    → filtered/sorted/paginated in displayRows (useMemo inside PlayersTab)
```

**Derived memos upstream of the pipeline:**

- **`depthMap`**: extracted from `leagueData.playerMap[id].depth_chart_order`. Shape: `{ [player_id]: { depthOrder } }`. Null if no depth data present.
- **`empiricalCurves` / `positionPeakPPG`**: from `computeEmpiricalAgeCurves(careerStats, playersMap)`.
- **`teamContext`**: `computeTeamContext(careerStats, playerMap, currentSeason)` — current-season share metrics.
- **`historicalTeamTotals`**: `computeHistoricalTeamTotals(careerStats, playerMap)` → `{ [season]: { [nfl_team]: { rushAtt, rec, recTgt } } }`.
- **`historicalShares`**: `computeHistoricalShares(careerStats, playerMap, historicalTeamTotals)` → `{ [player_id]: [{ season, share, gamesPlayed }] }` oldest→newest. RBs use rush attempts share; WR/TE use target share (or reception share as fallback). Minimum 8 games to qualify.
- **`collegeStats`**: derived from `collegeMatches` + `playerMap` via `computeCollegeMetrics`. Shape: `{ [player_id]: collegeMetricsObject }`. See [College metrics](integrations.md#college-metrics-srcutilscollegemetricsjs) in integrations.md.
- **`seasonProjections`**: `computeNextSeasonProjection` called per skill-position player. Shape: `{ [player_id]: { projectedPPG, projectedGames, projectedTotalPts, confidence, factors, adjustmentSummary } }`. See [Next-season projections](projection.md) in projection.md.
- **`playerRowsWithProj`**: adds `projectedPPG`, `projectedTotalPts`, `projectionConfidence`, and `nextSeasonRank` to each row from `seasonProjections`.

**Player row shape:**

```js
{
  player_id, full_name, position, nfl_team, age, years_exp,
  ownerTeamName,        // null = free agent
  currentSeasonPPG,     // 0 for rookies with no data
  careerSparkline,      // [ppg × 5 seasons] — null padded at front if < 5 seasons
  trend,                // 'up' | 'flat' | 'down' | 'insufficient'
  dynastyScore,         // { score, label, confidence, isRookie, components, signals }
  positionRank,         // integer rank within position by currentSeasonPPG
  ktcValue,             // integer or null
  roleRank,             // integer or null — RB/WR/TE only, by weighted carry/target share
  // Positional ranks (added by playerRowsWithRanks):
  recentRank,           // rank by current/recent season PPG
  peakRank,             // rank by career-best single-season PPG
  consistencyRank,      // rank by weighted avg rank across last 3 seasons
  dynastyRank,          // rank by dynastyScore.score
  rankMovement,         // integer delta vs prior season rank (positive = moved up)
  movementLabel,        // 'up' | 'down' | 'stable' | null
  // Projection fields (added by playerRowsWithProj):
  projectedPPG,         // float or null — next-season PPG estimate
  projectedTotalPts,    // float or null — projectedPPG × projectedGames
  projectionConfidence, // 'high' | 'medium' | 'low' | 'rookie' | null
  nextSeasonRank,       // integer or null — positional rank by projectedPPG
}
```

**Player ID sources (candidate pool before filtering):**

1. Any player who appears in any season's `careerStats`
2. Any player currently rostered in the league
3. Any player with `years_exp === 0` and an active skill position with status `Active`, `Injured_Reserve`, or `Free Agent` — ensures rookies with no game data appear

**Relevance filter (`isRelevantPlayer`) — applied after building the candidate pool:**

Sleeper's `status` and `active` fields are unreliable for retirement detection (Brady and Ryan both show `active: true`). A multi-signal filter is used instead. A player is **kept** if any of the following are true (evaluated in order):

| Rule | Rationale |
|---|---|
| Ghost entry: no `age`, no `team`, no `years_exp`, no `full_name` | Excluded immediately — placeholder/undrafted records with no real data |
| `rosteredIds.has(player_id)` | Always show rostered players |
| `years_exp === 0` AND `age > 0` | Current rookies with a known age. Ageless `years_exp === 0` entries are ghost records and are excluded. |
| `gamesPlayed > 0` in either of the last 2 seasons | Recent activity confirms the player is relevant |
| `nfl_team` set (and not `'FA'`) **AND** `ktcMap.has(player_id)` **AND** not definitively absent from a complete current nflverse roster | Both signals required, AND the player is not definitively absent from a complete current nflverse roster — closes the stale-team + lingering-KTC retiree leak (e.g. Roethlisberger shows team PIT but is absent from roster_2025). |
| nflverse current-roster **presence** (`rosterStatusOf === 'present'`) | Authoritative "on an NFL roster" keep-signal; additive — never excludes |

If none of the above match, the player is excluded. The 2-season activity window (current and prior season) is the primary gate. The NFL team + KTC exception catches offseason free agents the dynasty market still values, but requires both signals to fire together to prevent recently-retired veterans from leaking through. Roster **absence** only tightens the stale-team+KTC rule, and only when a complete roster resolved (`rosterComplete: true`); when the roster feed is unavailable or incomplete (e.g. the upcoming-season file in the offseason), the filter falls back to the prior behavior — and rostered players and current rookies are always kept regardless of roster data.

---

## Role ranks (`computeRoleRanks`)

`computeRoleRanks(playerRows, historicalShares)` → `Map<player_id, rank>`

Runs after `playerRowsFinal` alongside `computePositionalRanks`. RB/WR/TE only. For each player: computes a weighted share from the last 3 qualifying seasons (50%/30%/20% most-recent-first), normalised when fewer than 3 seasons exist. Players are ranked within their position group by this weighted share (descending). QBs are excluded.

Merged into `playerRanks` and then into `playerRowsWithRanks` as `roleRank`.

---

## Positional ranks (`computePositionalRanks`)

`computePositionalRanks(playerRows, careerStats, currentSeason)` → `Map<player_id, ranksObject>`

Four independent ranks within each position group:

| Rank | Method |
|---|---|
| **Recent** | `currentSeasonPPG` if gp ≥ 6 this season, else most recent season PPG with gp ≥ 8. Lookback capped at 3 seasons prior. |
| **Peak** | Best single-season PPG where gp ≥ 8. |
| **Consistency** | Weighted rank across last 3 completed seasons (50/30/20). Non-qualifying = penalty rank (pool + 5). Null if < 2 qualifying seasons. |
| **Dynasty** | Rank by `dynastyScore.score` desc. |

`rankMovement = lastSeasonRank − recentRank`. `movementLabel`: ≥ 3 → "up", ≤ −3 → "down", else "stable".

---

## Vite configuration

Two dev-only proxies in `vite.config.js`:

```js
proxy: {
  '/ktc-proxy': {
    target: 'https://keeptradecut.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ktc-proxy/, ''),
  },
  '/cfbd-proxy': {
    target: 'https://api.collegefootballdata.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/cfbd-proxy/, ''),
  },
}
```

`ktc.js` uses `import.meta.env.DEV` to try the Vite proxy first, then falls back to `corsproxy.io`. `cfbd.js` uses `import.meta.env.DEV` to switch between `/cfbd-proxy` and the direct API URL. The CFBD API key is read from `import.meta.env.VITE_CFBD_API_KEY` inside `getHeaders()` at fetch time.

---

## Sleeper API notes

- Rate limit: ~1000 requests/minute
- `fpts` field is integer part only; full value = `fpts + fpts_decimal / 100`
- `starters[]` can contain `null` for empty lineup slots — always filter before iterating
- The undocumented stats API has no `/v1/` prefix and uses `api.sleeper.com` (not `api.sleeper.app`)
- Stats endpoints return a list `[{ player_id, stats }]`, not a map — `normalizeStatsResponse()` converts before caching
- `years_exp` is 0 for rookies in their first season

---

## React Strict Mode

The app runs in React Strict Mode. In development, effects fire twice — the `cancelled` flag in async `useEffect`s prevents the second invocation from writing to state.
