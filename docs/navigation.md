# Navigation map

Per-file detail for `sleeper-dashboard`. Rules and invariants live in
[CLAUDE.md](../CLAUDE.md); this file answers "which file do I edit?" and "what shape is the data
that reaches it?" Rows are present-tense — they describe what a module does now. History lives in
`git log`.

Per-file detail for `src/components/` moved to [docs/nav/components.md](nav/components.md).
Per-file detail for `src/utils/` moved to [docs/nav/utils.md](nav/utils.md).

### Routing / IA

HashRouter (`react-router-dom`). Grouped nav IA: **MANAGE** (This week, My Team, Market, Teams) ·
**LEAGUE** (Standings, Schedule, Rosters). There is no ACT group — Trade desk and Draft board are
both gated placeholders, and a rail group with a dead third undermined the rest of it; their routes
stay live and reachable by URL, simply not linked from the rail or tab bar (no redirects — unlike
`/roster`/`/players` below, these are unbuilt routes, not retired ones):

| Path | Surface |
|---|---|
| `/` | → redirects to `DEFAULT_ROUTE` (`/market`) |
| `/week` | This week — the weekly start/sit surface for the user's own rostered players (view-only). A weight panel (`src/utils/blendWeights.js`'s `SIGNAL_FAMILIES`, `fpa`'s `k`/`dropGames` imported from `opponentStrength.js`, never a literal) states how much of each blended signal is the current season, then a ten-slot lineup table (`src/utils/weeklyLineup.js`'s `buildWeeklyLineup`, reusing `lineup.js`'s `buildBestLineup`) shows opponent/ALLOWS/usage/form/PROJ per slot. Orchestrated by `src/hooks/useWeeklyDecision.js`, which reads the live Sleeper stats/projections endpoints via `sleeperStats.js`'s `getWeeklyStatRows`/`getWeeklyProjectionRows` (meta-preserving: these keep `team`/`opponent`, unlike `getWeeklyStats`/`getWeeklyProjections`) — no data-store dependency, so this surface cannot be blocked by an ingest job. No `vs {opponent}` clause in the header — `leagueData` carries no schedule for the current week's league matchup (a deliberate v1 omission, not a gap to fill later) |
| `/portfolio` | My Team — header + summary sentence, three lineup tiles, Starting ten and Bench tables, row click → the detail pop-up |
| `/market` | Market — table over `playerRowsWithProj`: Value/Outlook/Volume/Efficiency column-set switch, position pills, sort, pagination, row click → the detail pop-up |
| `/teams` | Teams — the 32-team index: PROE/pace/success/off EPA-play/RZ TD%/def EPA allowed/pts-per-game + a YOUR EXPOSURE column, sortable, no pager. Rows are clickable (whole-row + keyboard, via `useNavigate()`), navigating to `/teams/:abbr`. Four FPA columns — `FPA QB`/`FPA RB`/`FPA WR`/`FPA TE`, blended per-game fantasy points allowed (`src/utils/opponentStrength.js`), rank 1 = toughest, no colour (polarity stated in text/popover only); ascending-first via `usePlayersTable`'s `ascByDefault`. The blend's current-season term populates from the data repo's in-progress season-totals file (App.jsx's `currentSeasonTotals` loader, `src/api/sleeperStats.js`'s `loadCurrentSeasonTotals`, `allowInProgress: true`); when that file is absent the term is `null` and this renders the last-completed-season rate alone — the documented graceful-absence path, not a "yet" — and the popover always states which season(s) are actually in play and the exact per-team blend weight |
| `/teams/:abbr` | Team detail — four 14-season metric cards (PROE/pace/success rate/off EPA per play), team holdings, and a coaching block. Reads `:abbr` itself via `useParams` (`App.jsx` is route-unaware; `LeagueView.jsx` is the precedent) |
| `/board` | Board (gated placeholder — marginal-value engine + season-phase classifier), nav label "Draft board" — route-only, not in nav |
| `/roster` | → redirects to `/portfolio` (retired route; old bookmarks/back-history don't 404) |
| `/players` | → redirects to `/market` (retired route; old bookmarks/back-history don't 404) |
| `/trade` | Trade (gated placeholder — marginal-/phase-aware trade evaluator), nav label "Trade desk" — route-only, not in nav |
| `/league` | → redirects to `/league/standings` |
| `/league/:view` | League group (standings / schedule / rosters) |
| `*` | → redirects to `DEFAULT_ROUTE` |

`/players` (the Explorer) no longer exists — the route redirects to `/market` above.
`COLUMNS`/`POSITION_STAT_COLUMNS` (the two column-descriptor maps Market's Outlook/Production sets
harvest) live natively in `src/components/market/columnDescriptors.js`; `DYNASTY_GROUP_MAP`/`NFL_TEAMS`
live natively in `src/utils/marketFilters.js`.

Nav chrome: desktop left rail (`NavRail`, grouped `NAV_GROUPS`) + mobile bottom tab bar
(`BottomTabBar`, flat `PRIMARY_NAV`, capped at 5). `NAV_GROUPS` references `PRIMARY_NAV` entries by
`key` (a small lookup), not array index — a positional reference (`PRIMARY_NAV[2]`/`[3]`) would
silently re-point groups at whatever shifted into those slots if `PRIMARY_NAV` changes shape.
Seasonal **Rookies** item Jan–May only (appended to the rail's MANAGE group and to the tab bar's flat
list; hidden offseason). League destinations are reached directly from the rail's LEAGUE group on
desktop; on mobile, via `TopBar`'s mobile-only League link (`/league` → `/league/standings`) plus
`LeagueView`'s own in-page sub-nav (`md:hidden`, the only mobile path to
`/league/schedule`/`/league/rosters`). `DEFAULT_ROUTE=/market` — Market is the app's data-display
centre of gravity; My Team is one click away in the rail. See `src/components/shell/navItems.js`.

### src/
| File | Responsibility |
|------|----------------|
| `main.jsx` | Entry point — renders `<App>` in StrictMode |
| `App.jsx` | Root component; owns all state; builds playerRows pipeline (the seven memo steps and everything upstream of them: [architecture.md](architecture.md) → *playerRows pipeline*); renders the router + nav shell (`components/shell/AppShell`) and injects pipeline outputs into routed surfaces |
| `constants.js` | Shared constant `POSITION_ORDER` |

> **Color tokens:** `src/index.css` `@theme` is the color source of truth — neutral/surface role tokens + chromatic primitives (`--c-{hue}-{shade}`) + semantic aliases (accent/positive/negative/warning/caution/market/confidence/chart/phase), each with light + dark values (dp-v2 Slice 0: the app is dark-only, so a new token now takes a single value — the existing `.dark` block and its overrides stay, but the block is not extended). `--color-canvas` is the page ground (painted on `body`); `--color-surface…surface-5` are the cards/panels/fills that layer above it (light = warm, surface lifts above canvas; dark = cool near-black, lighter-as-higher). Components consume tokens (`bg-[var(--…)]`), never raw palette classes.
>
> **`--color-dp-*` / `--font-dp-*` (Dynasty Portfolio redesign, 1b Slice i):** a second, **dark-only** token family — no `.dark` override, by design (master-plan §4/§5.1). Scoped to new route **content** only: `Portfolio`/`Market` screen bodies (Slices iii/iv) and the player-detail pop-up (Slices ii/v). **Not** used by `TopBar`/`NavRail`/`BottomTabBar` — the shared chrome stays on the `--color-*` family above, unchanged, wrapping `League`/`Board`/`Trade`. Every `--color-dp-*` surface's outermost element must paint its own ground (`bg-dp-canvas`/`bg-dp-card`) before using any `text-dp-*` class. Fonts: `--font-dp-sans` (Public Sans Variable) and `--font-dp-mono` (IBM Plex Mono, imported as explicit 400/500/600 weight subpaths — the package root is 400-only). dp-v2 Slice 1 added `--color-dp-muted-3` (percentile-strip caption) and `--color-dp-pip-off` (unfilled coverage pip) — single value each, per Slice 0's amended rule above, not added to the `.dark` block.

### src/api/
| File | Responsibility |
|------|----------------|
| `sleeper.js` | Official Sleeper API v1 calls; every call through `fetchWithCache`. `getTradedPicks(leagueId)` (`/league/{id}/traded_picks`, 60min TTL — a trade can land any time, unlike `getDraftPicks`'s permanent-once-drafted TTL) |
| `sleeperStats.js` | Undocumented stats/projections endpoints + `loadCareerHistory` (aggregates 18 weeks → season totals). `loadCurrentSeasonTotals(season)` — the live (in-progress) season's partial season-totals, follows `nflRoster.js`'s layered pattern (permanent TTL + `lastModified` compare); `allowInProgress: true` scoped to this one `tryDataStore` call; cache key `season-totals-live/<season>`, distinct from `getSeasonTotals`'s own `season-totals/<season>` (which stores a bare players map — this stores a `{players, lastModified}` wrapper); returns `{players, season, complete}`, graceful-empty on any of the three `getManifestEntry` null states. `getWeeklyStatRows`/`getWeeklyProjectionRows` — `/week`'s meta-preserving siblings to `getWeeklyStats`/`getWeeklyProjections`: same URLs, but the row shape keeps `team`/`opponent`/`gameId` (Sleeper domain) rather than reducing to a bare stats map, via a private `fetchStatsRows` helper that does NOT route through `fetchStats` (whose `normalizeStatsResponse` call on the cache-hit path would otherwise strip that metadata on the second load); cache keys `stat-rows/<season>/<week>` / `projection-rows/<season>/<week>`, distinct from the bare-map `stats/*`/`projections/*` keys; same `statsTTL` |
| `ktc.js` | KeepTradeCut DOM scraper; paginated (pages 0–9); TTL 3 days |
| `cfbd.js` | College Football Data API — bulk player stats by year/category |
| `dataStore.js` | External data-store loader (season-totals, snapshots, enrichment); URL-based config; per-type TTL |
| `enrichment.js` | Loads enrichment overlay (coaching, scheme, injury data) from the data store |
| `nflDraft.js` | nflverse draft picks — loaded from data store via `dataStore.js` (`tryDataStore`/`getManifestEntry`); `lastModified`-driven freshness; permanent per-year IndexedDB cache |
| `nflRoster.js` | nflverse current-season roster — loaded from data store via `dataStore.js`; `sleeper_id`-keyed active-roster Set; `lastModified`-driven freshness; per-year permanent cache; graceful fallback |
| `advStats.js` | nflverse advanced stats (target/air-yards share, WOPR, RACR) — loaded from data store via `dataStore.js`; `sleeper_id`-keyed; `MIN_ADVSTATS_ROWS=250` gate; per-year permanent cache. View-only — never feeds projection/scoring (see Invariants). `market/Market.jsx`'s Efficiency set reads `RACR` for WR/TE, gated on the result's `complete` flag |
| `nflSchedule.js` | nflverse NFL schedule / results / Vegas lines (`nflverse/schedule/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflSchedule(year)` (no probe); `MIN_SCHEDULE_GAMES=200` floor; per-year permanent cache; `lastModified` freshness for the mutable current season; graceful empty shape. Read-only — not wired into projection/scoring (guarded by `scheduleViewOnly.test.js`). Loaded into `App.jsx` state, `dataSeason`-keyed (`nflScheduleByYear`), exposed via `ProfileDataContext`; still view-only. Rendered by `dp/GameLogSection.jsx`'s game-log context block (OPP/RESULT/SPREAD/TOTAL/ROOF/WEATHER) |
| `nflGameLogs.js` | nflverse per-game player stats (`nflverse/gamelogs/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflGameLogs(year)` (no probe); `MIN_PLAYERGAME_ROWS=3000` floor; per-year permanent cache; `lastModified` freshness; graceful empty shape; pass-through (computes nothing). View-only / loader-only — not wired into projection/scoring (guarded by `gameLogsViewOnly.test.js`). Loaded into `App.jsx` state, `dataSeason`-keyed (`gameLogsByYear`), exposed via `ProfileDataContext`; still view-only. Rendered by `dp/GameLogSection.jsx`'s per-position production columns. 2019 absent upstream → graceful empty |
| `teamContext.js` | nflverse team-context pack (`nflverse/teamcontext/<year>.json`) — first TEAM-keyed family: `teams` keyed by era-accurate team abbr → `games[]`, row identity `(team, week)` (weeks continuous REG→POST), NOT `sleeper_id`; each game's `off`/`def` blocks carry components AND rates (e.g. `epaSum`/`epaPlays`/`epaPerPlay`) — rates are single-game, never summed; explicit-season `loadTeamContext(year)` (no probe); `MIN_TEAMCONTEXT_ROWS=60` floor; per-year permanent cache (`nfl-teamcontext/<year>`); `lastModified` freshness; graceful empty shape; pass-through (per-week rates never summed — aggregate the `*Sum`/`*Plays` components); lookups `getTeamSeasonRows`/`getTeamWeekRow`; joins via `utils/playerTeam.js`. View-only / loader-only — not wired into projection/scoring (guarded by `teamContextViewOnly.test.js`). Loaded into `App.jsx` state across a five-season window, `teamContextByYear`, exposed via `ProfileDataContext`. Rendered by `dp/EnvironmentSection.jsx`, the family's first consumer anywhere in `src/` of the `off.*`/`def.*` shape (CR-10); PROE specifically is `(passPlays÷plays) − (proeXpassSum÷proePlays)` — `proePlays`, not the also-present `proePassPlays`. Distinct from `src/utils/teamContext.js` (projection module) |

### src/context/
| File | Responsibility |
|------|----------------|
| `ProfileDataContext.jsx` | Provides `{careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats, teamContextByYear, gameLogsByYear, nflScheduleByYear, historicalTeamTotals}` (fourteen keys). `teamContextByYear` loads a five-season window, and, with `historicalTeamTotals` (the `App.jsx` projection-side memo, `computeHistoricalTeamTotals`, threaded onto context read-only — not recomputed here), feeds the pop-up's Environment section and its red-zone share row. One provider site: an App-level provider wrapping `<Routes>` in `App.jsx`, feeding `dp/PlayerDetailTabs.jsx` and, through it, `dp/PlayerDetailModal.jsx` (`playerRows` key is `playerRowsWithProj`) |

### src/hooks/
| File | Responsibility |
|------|----------------|
| `usePlayerProfile.js` | Derives all PlayerProfile rendering data (career history, ranks, comps, peers) from `ProfileDataContext` |
| `usePlayersTable.js` | View-local table UI state used by Market (`posFilter`, `sortState` + `localStorage` persistence under a caller key, `page`, `expanded`, `selectedPlayerId`, handlers, `sortProps`, `setSortState`). One instance per consumer. Owns view-local state only — never App.jsx domain/`playerRows`-pipeline state (see *App.jsx owns all state*). `setSortState` lets a caller re-assert a specific sort directly — needed because `handleSort` only toggles the current column's direction and can't switch to an arbitrary column/direction pair; Market uses it to re-assert each column set's own default sort when the set switches (`handlePosFilter`'s own reset already follows whatever `defaultSort` the hook was constructed with, which Market re-supplies per active set). `handleSort`'s `ascByDefault` set includes `ceilingRank`/`floorRank` (rank-shaped columns, 1 = best, where the first click should sort ascending), `defEpaPerPlay` (`teams/Teams.jsx`'s DEF EPA ALL column — a lower-is-better number, only Teams has a column by that name) and `fpaQb`/`fpaRb`/`fpaWr`/`fpaTe` (`teams/Teams.jsx`'s FPA columns, same lower-is-better/ascending-first reasoning); still shared by every consumer of this hook |
| `useTeamHistoryLoader.js` | The on-demand 14-season `teamContextByYear` load for `teams/TeamDetail.jsx`, extracted out of `App.jsx` so its dedupe/merge logic is unit-testable without mounting the whole app (the same reasoning `tabState.js` documents). Takes `(careerStats, eagerSeasonCount, setTeamContextByYear)`, returns `onNeedTeamHistory` — call once (e.g. on team-detail's mount) to widen the load past `App.jsx`'s eager `ENV_SEASONS`-season effect, which stays untouched. Tracks years it has itself started fetching in a `ref` (recorded when the fetch starts, not when it lands) and always deterministically excludes the eager effect's own target years (`allSeasons.slice(-eagerSeasonCount)`, the same formula that effect uses) rather than diffing against `teamContextByYear` state — a state diff would either self-retrigger (if listed in the effect's deps) or trip `react-hooks/exhaustive-deps` (if omitted), and would race the eager effect: `needFullTeamHistory` can flip true before that effect's own fetch resolves, at which point `teamContextByYear` is still `{}`, so a state diff would re-request the seasons already in flight — `loadTeamContext` has no in-flight dedupe. `Promise.allSettled` (one rejected season doesn't lose the batch) + a `cancelled` flag + one merged setter write, mirroring the eager effect's own non-negotiables |
| `useWeeklyDecision.js` | The one orchestration point for `/week`, the same route-scoped-loader pattern as `useTeamHistoryLoader.js` (cited in its own header) — extracted to a hook, not App.jsx state, because nothing it loads feeds the `playerRows` pipeline, reaches another route, or outlives `/week`. Fetches `getWeeklyStatRows` for weeks `1..currentWeek` and `getWeeklyProjectionRows` for the current week (`Promise.allSettled`, `cancelled`-flag-guarded setters); resolves the FPA table via `buildFpaTable`/`rankFpaTable` exactly as `Teams.jsx`/`Portfolio.jsx` do (`deriveDataSeason`, `currentSeasonTotals?.complete`-gated, row maps passed straight through); derives `n` (games played) from the max `gamesPlayed` across `currentSeasonTotals.players`' DEF rows, falling back to `currentWeek - 1`; builds per-player usage (`weeklyUsage.js`) and last-3-played-weeks form, then assembles the lineup via `weeklyLineup.js`'s `buildWeeklyLineup`. Returns `{ weights, lineup, n, loading, error, weeklyMaps, playedWeeklyMaps }` |

## Patterns

### Caching (cache.js + IndexedDB)
- `getCache(key)` returns data or `null` (null on miss or TTL expiry)
- `setCache(key, value, ttlMinutes)` — default TTL 60 min; keys containing "players" default to 1440 min
- Pass TTL explicitly to make intent clear (see `sleeper.js`). Per-function TTLs, stale-cache invalidation, and the nflverse-via-data-store path: [docs/integrations.md](docs/integrations.md).

### Component data access (two patterns)
1. **Props from App.jsx**: `StandingsTable`, `ScheduleGrid`, `RostersTab`, `MyTeamView`, `Market`, `Portfolio` — all props-only, no context reads
2. **ProfileDataContext**: any `usePlayerProfile` consumer reads the fourteen-key value (see the `src/context/` table above) via `useContext`. **One provider site**: an App-level provider wraps `<Routes>` in `App.jsx` itself, feeding `dp/PlayerDetailTabs.jsx` (and, through it, `dp/PlayerDetailModal.jsx`) so the pop-up is mountable from any route
