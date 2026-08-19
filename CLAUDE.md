# Sleeper Dashboard — Claude Code Instructions

Vite + React (no TypeScript) dynasty fantasy football dashboard. Sleeper REST API (no auth, read-only) + KeepTradeCut (DOM-scraped) + College Football Data API + nflverse draft data. All state lives in App.jsx; children receive data as props or read from context. Surface routing is via `react-router-dom` (HashRouter). Tailwind CSS v4.

---

## Commands

```bash
npm install           # install dependencies
npm run dev           # dev server → http://localhost:5173
npm test              # run full test suite once (Vitest)
npm run test:watch    # watch mode
npm run test:ui       # Vitest browser UI
npm run build         # production build — also the build smoke-test; must be clean before done
npm run lint          # ESLint
npm run preview       # serve the production build locally
```

Required env vars — create `.env.local` at project root:
```
VITE_CFBD_API_KEY=your_key_here
VITE_DATA_STORE_URL=https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main
```

`VITE_CFBD_API_KEY` is required for college stats. `VITE_DATA_STORE_URL` must point to the real published data repo or the data store is disabled (API-only mode, ~7-minute career load on every visit).

---

## Navigation map

Deep behaviour is in the `docs/` directory (indexed from README.md → Documentation). Use this table to find which file to edit. **Product/UX vision** (target product, not current behaviour) lives in `docs/dynasty-decision-engine-design.md` (the six surfaces + marginal-value thesis) and `docs/dynasty-frontend-ux-design.md` (UX/visual strategy); the frontend migration plan is `.claude/tasks/frontend-overhaul.md`.

### Routing / IA

HashRouter (`react-router-dom`). Grouped nav IA since the Dynasty Portfolio redesign (1b, Slice i —
`.claude/tasks/dynasty-portfolio-1b.md`): **MANAGE** (Portfolio, Market) · **ACT** (Trade desk,
Draft board) · **LEAGUE** (Standings, Schedule, Rosters):

| Path | Surface |
|---|---|
| `/` | → redirects to `DEFAULT_ROUTE` (`/market`, settled — see below) |
| `/portfolio` | Portfolio — real screen since 1b Slice iv: header, four metric tiles, value-by-age-band chart, holdings table, row click → the Slice ii detail pop-up |
| `/market` | Market — real table over `playerRowsWithProj` since 1b Slice iii: Value/Outlook/Production column-set switch, position pills, sort, pagination, row click → the Slice ii detail pop-up |
| `/board` | Board (gated placeholder — marginal-value engine + season-phase classifier), nav label "Draft board" |
| `/roster` | → redirects to `/portfolio` (retired route; old bookmarks/back-history don't 404) |
| `/players` | → redirects to `/market` (retired 1b Slice viii — the Explorer surface; old bookmarks/back-history don't 404) |
| `/trade` | Trade (gated placeholder — marginal-/phase-aware trade evaluator), nav label "Trade desk" |
| `/league` | → redirects to `/league/standings` |
| `/league/:view` | League group (standings / schedule / rosters) |
| `*` | → redirects to `DEFAULT_ROUTE` |

**`/players` (the Explorer) was retired in 1b Slice viii** — deleted outright, not deprecated in place. It reached filter parity with Market in Slice vi, then free-text search + saved presets in Slice vii (master-plan §6a); once functional parity was met, Slice viii deleted `PlayersSurface`/`PlayersTab`/`OutlookTab`/`NflStatsTab`/`PlayersDataTable` and the modules only it consumed (`SpiderChart.jsx`, `AdvancedStatsPanel.jsx`, `AvailabilityHistory.jsx`, `ui/RankingsRow.jsx`, `ui/ExpandableTableRow.jsx`, `ui/ValueChip.jsx`, the tooltip subsystem — see below), and settled all five convergence debts by deletion rather than convergence. `COLUMNS`/`POSITION_STAT_COLUMNS` (the two column-descriptor maps Market's Outlook/Production sets harvest) now live natively in `src/components/market/columnDescriptors.js`; `DYNASTY_GROUP_MAP`/`NFL_TEAMS` now live natively in `src/utils/marketFilters.js`. Three data families the Explorer was the only display consumer of went dark on the display side but are untouched on the data side — see `advStats.js`/`nflSchedule.js` rows below and `collegeStats`' still-live projection consumer.

Nav chrome: desktop left rail (`NavRail`, grouped `NAV_GROUPS`) + mobile bottom tab bar (`BottomTabBar`, flat `PRIMARY_NAV`, capped at 5). Seasonal **Rookies** item Jan–May only (appended to the rail's MANAGE group and to the tab bar's flat list; hidden offseason). League destinations are reached directly from the rail's LEAGUE group on desktop; on mobile, via `TopBar`'s mobile-only League link (`/league` → `/league/standings`) plus `LeagueView`'s own in-page sub-nav (`md:hidden`, the only mobile path to `/league/schedule`/`/league/rosters`). **`DEFAULT_ROUTE=/market`, settled (dp-v2 §2.2)** — Market is the app's data-display centre of gravity; Portfolio is one click away in the rail. See `src/components/shell/navItems.js`.

### src/
| File | Responsibility |
|------|----------------|
| `main.jsx` | Entry point — renders `<App>` in StrictMode |
| `App.jsx` | Root component; owns all state; builds playerRows pipeline; renders the router + nav shell (`components/shell/AppShell`) and injects pipeline outputs into routed surfaces |
| `constants.js` | Shared constant `POSITION_ORDER` |

> **Color tokens:** `src/index.css` `@theme` is the color source of truth — neutral/surface role tokens + chromatic primitives (`--c-{hue}-{shade}`) + semantic aliases (accent/positive/negative/warning/caution/market/confidence/chart/phase), each with light + dark values (dp-v2 Slice 0: the app is dark-only, so a new token now takes a single value — the existing `.dark` block and its overrides stay, but the block is not extended). `--color-canvas` is the page ground (painted on `body`); `--color-surface…surface-5` are the cards/panels/fills that layer above it (light = warm, surface lifts above canvas; dark = cool near-black, lighter-as-higher). Components consume tokens (`bg-[var(--…)]`), never raw palette classes.
>
> **`--color-dp-*` / `--font-dp-*` (Dynasty Portfolio redesign, 1b Slice i):** a second, **dark-only** token family — no `.dark` override, by design (master-plan §4/§5.1). Scoped to new route **content** only: `Portfolio`/`Market` screen bodies (Slices iii/iv) and the player-detail pop-up (Slices ii/v). **Not** used by `TopBar`/`NavRail`/`BottomTabBar` — the shared chrome stays on the `--color-*` family above, unchanged, wrapping `League`/`Board`/`Trade`. Every `--color-dp-*` surface's outermost element must paint its own ground (`bg-dp-canvas`/`bg-dp-card`) before using any `text-dp-*` class. Fonts: `--font-dp-sans` (Public Sans Variable) and `--font-dp-mono` (IBM Plex Mono, imported as explicit 400/500/600 weight subpaths — the package root is 400-only). dp-v2 Slice 1 added `--color-dp-muted-3` (percentile-strip caption) and `--color-dp-pip-off` (unfilled coverage pip) — single value each, per Slice 0's amended rule above, not added to the `.dark` block.

### src/api/
| File | Responsibility |
|------|----------------|
| `sleeper.js` | Official Sleeper API v1 calls; every call through `fetchWithCache` |
| `sleeperStats.js` | Undocumented stats/projections endpoints + `loadCareerHistory` (aggregates 18 weeks → season totals) |
| `ktc.js` | KeepTradeCut DOM scraper; paginated (pages 0–9); TTL 3 days |
| `cfbd.js` | College Football Data API — bulk player stats by year/category |
| `dataStore.js` | External data-store loader (season-totals, snapshots, enrichment); URL-based config; per-type TTL |
| `enrichment.js` | Loads enrichment overlay (coaching, scheme, injury data) from the data store |
| `nflDraft.js` | nflverse draft picks — loaded from data store via `dataStore.js` (`tryDataStore`/`getManifestEntry`); `lastModified`-driven freshness; permanent per-year IndexedDB cache |
| `nflRoster.js` | nflverse current-season roster — loaded from data store via `dataStore.js`; `sleeper_id`-keyed active-roster Set; `lastModified`-driven freshness; per-year permanent cache; graceful fallback |
| `advStats.js` | nflverse advanced stats (target/air-yards share, WOPR, RACR) — loaded from data store via `dataStore.js`; `sleeper_id`-keyed; `MIN_ADVSTATS_ROWS=250` gate; per-year permanent cache. **View-only** — never feeds projection/scoring (see Invariants) |
| `nflSchedule.js` | nflverse NFL schedule / results / Vegas lines (`nflverse/schedule/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflSchedule(year)` (no probe); `MIN_SCHEDULE_GAMES=200` floor; per-year permanent cache; `lastModified` freshness for the mutable current season; graceful empty shape. **Read-only** — not wired into projection/scoring (guarded by `scheduleViewOnly.test.js`). **No UI consumer as of 1b Slice viii** — `NflStatsTab`'s game log was the only caller of `loadNflSchedule`, and it was deleted with the Explorer; the loader still runs for nobody, fully dark on the display side |
| `nflGameLogs.js` | nflverse per-game player stats (`nflverse/gamelogs/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflGameLogs(year)` (no probe); `MIN_PLAYERGAME_ROWS=3000` floor; per-year permanent cache; `lastModified` freshness; graceful empty shape; pass-through (computes nothing). **View-only / loader-only** — no consumer this slice; not wired into projection/scoring (guarded by `gameLogsViewOnly.test.js`). Wiring is the next (Outlook) slice. 2019 absent upstream → graceful empty |
| `teamContext.js` | nflverse team-context pack (`nflverse/teamcontext/<year>.json`) — **first TEAM-keyed family**: `teams` keyed by era-accurate team abbr → `games[]`, row identity `(team, week)` (weeks continuous REG→POST), NOT `sleeper_id`; explicit-season `loadTeamContext(year)` (no probe); `MIN_TEAMCONTEXT_ROWS=60` floor; per-year permanent cache (`nfl-teamcontext/<year>`); `lastModified` freshness; graceful empty shape; pass-through (per-week rates never summed — aggregate the `*Sum`/`*Plays` components); lookups `getTeamSeasonRows`/`getTeamWeekRow`; joins via `utils/playerTeam.js`. **View-only / loader-only** — no consumer this slice; not wired into projection/scoring (guarded by `teamContextViewOnly.test.js`). Distinct from `src/utils/teamContext.js` (projection module) |

### src/components/
| File | Responsibility |
|------|----------------|
| `shell/AppShell.jsx` | App frame: always-on `TopBar` (forwards `currentWeek`; since 1b Slice vii also `searchablePlayers`/`popupOpen`/`onOpenPlayerDetail` for global search) + (post-league) desktop `NavRail` / mobile `BottomTabBar` + content area; pure chrome, owns no state; fixed explicit prop list — does not forward arbitrary props |
| `shell/navItems.js` | Nav config: `PRIMARY_NAV` (flat, for `BottomTabBar`), `NAV_GROUPS` (grouped MANAGE/ACT/LEAGUE, for `NavRail`), `LEAGUE_NAV`, `ROOKIES_NAV`, `DEFAULT_ROUTE`, `isRookieSeason()` |
| `shell/{TopBar,NavRail,BottomTabBar,CareerLoadProgressBar,ClearCacheButton,ExportDataButton}.jsx` | Shell chrome + extracted header/progress/utility components. `TopBar` (1b Slice i structural rework; still on the `--color-*` token family, never `--color-dp-*` — §5.2 of the Slice vii task file): logo + league name, freshness indicator (`currentWeek` prop), user/Switch, mobile League link, and — **live since 1b Slice vii** — a global `⌘K`/`Ctrl+K` player search (`searchablePlayers` prop, a narrow `{player_id, full_name, position, age, nfl_team, score}` projection from `App.jsx`; ≥2 chars opens a results dropdown, top 8 by `score` descending nulls-last, guarded substring match on `full_name`; picking a result calls `onOpenPlayerDetail(id)`). Owns the query/dropdown-open state and the `⌘K` listener itself (not `App.jsx`); inert while the pop-up is open (`popupOpen` prop = `tabs.length > 0`). Disabled, as before, when `searchablePlayers` is empty. `sm:hidden` below the `sm` breakpoint — desktop/tablet only, by design; Market's own text filter (below) covers mobile. **The tooltip toggle button and the `Tooltip.jsx`/`TooltipContext.jsx` subsystem it drove were removed entirely in 1b Slice viii** — the old design wasn't worth keeping; tooltips return as a designed feature in a future slice |
| `league/{LeagueView,StandingsTable,ScheduleGrid,RostersTab,SlotBadge}.jsx` | Secondary "League" group surfaces (extracted). `LeagueView`'s own sub-nav is `md:hidden` since 1b Slice i — desktop reaches Standings/Schedule/Rosters via the rail's LEAGUE group; mobile still needs the in-page tabs |
| `portfolio/Portfolio.jsx` | 1b Slice iv — real Portfolio screen: header + `N skill players` subline, four metric tiles (roster value/weighted age/concentration/projected points — values only, no deltas), a value-by-age-band chart, and a holdings table (ASSET/VALUE/5-YR PPG/PROJ Δ/HORIZON), row click/keyboard → `onOpenPlayerDetail`. Scoped entirely to `ownerTeamName === myTeamName` rows, derived once and shared by every section. No column-set switch, no position pills, no pager (table shell is inlined here, not `MarketTable`) — see `dp/cells.jsx`. `HORIZON` reads `row.dynastyScore.signals.yearsFromPeak` (pipeline-computed, not re-derived); the age-band chart intentionally uses fixed position-blind bands instead (aggregating *value* across a roster, where position-blind bands are the point) — the two deliberately disagree occasionally. Five design elements cut per master-plan §4a.2 (alert cards, `CALL` column, tile deltas, the horizon segmented control, "contending window open"); the "· N rookie picks" subline clause cut for a data gap (no traded-picks endpoint loaded) |
| `market/Market.jsx` | 1b Slice iii — real Market table over `playerRowsWithProj`: Value/Outlook/Production column-set switch (`market-column-set`), position pills, sort (`usePlayersTable`, `market-sort`; see `src/hooks/` table for the three-set sort-reset mechanics), pagination, row click/keyboard → `onOpenPlayerDetail`. Column *derivations* are harvested (imported, not copied) from `outlookPositionStats`/`outlookUsage`/`outlookConsistency`/`nflStats`/`dynastySignalBadges`/`seasonRanks` (Ceiling/Floor, Slice vii follow-up), plus `market/columnDescriptors.js`'s `COLUMNS`/`POSITION_STAT_COLUMNS` descriptor maps (moved there natively in 1b Slice viii, out of the Explorer's `NflStatsTab.jsx`/`OutlookTab.jsx` before those files were deleted). Dark-only `--color-dp-*` throughout; does not consume `ProfileDataContext` (gets its data as props from `App.jsx`). Its presentational cells (`CareerBars`/`PlayerCell`/`ClickableRow`/`DeltaCell`/`SortTh`) moved to `dp/cells.jsx` in Slice iv so Portfolio could import rather than fork them; `CeilingFloorCell` (Slice vii follow-up) stays local to Market, re-skinned from the (now-deleted) Explorer's version to dp tokens with its tier-colored rank badge dropped (that badge's raw `--c-*` primitives followed the app's former light/dark toggle, which Market ignored — see the `--color-dp-*` note above). The toggle is gone as of dp-v2 Slice 0; restoring the badge is possible but not done (dp-v2 §2.1). **Slice vi** added `filters` (view-local, `market-filters`, validated on read via `marketFilters.normalizeFilters`) applied in `displayRows` after the position pill and before sort/pagination; the header subline and `MarketTable`'s pager both read the same filtered array, so all three counts on screen agree. **Slice vii** added free-text search + saved presets (see `market/FilterBar.jsx`'s row and `docs/ui.md`) and, as a same-day follow-up, the Value set's `KTC`/`Ceiling`/`Floor` columns — the raw KTC value and the Explorer's best/worst single-season positional finish, both real capabilities the initial vii hand-back's "parity" claim had missed |
| `market/FilterBar.jsx` | 1b Slice vi — active-filter pills (each with its own `×`), a free-text filter input ("Filter by name…", left of "+ Add filter" — 1b Slice vii §2), "+ Add filter" (toggles the panel it also renders), saved presets (1b Slice vii §3 — `market-filter-presets`, cap 5, re-saving an existing name works at the cap), and "Reset all" — the presets control and "Reset all" share one `ml-auto` wrapper (visible whenever presets exist or a filter is active), not two independent `ml-auto` siblings. Owns the panel's open/closed UI state AND the presets list (load-filter-via-`isRestorableFilters`-at-mount/save/apply/delete) — both view-local, single-consumer chrome state; filter *values* are `Market.jsx`'s, passed down as `filters`/`onFiltersChange`. Rendered by `Market.jsx` and passed into `dp/MarketTable.jsx`'s `filterBar` render-prop |
| `market/FilterPanel.jsx` | 1b Slice vi — the expandable filter grid (`bg-dp-card`, 4-column), re-skinned in the dp token language from the (now-deleted) Explorer's `FilterSidebar`/`RangeSlider`/`MultiSelect` rather than reused at the time (old `--color-*` family, then still shared with `/players`). Range-slider bounds are read directly from `marketFilters.DEFAULT_MARKET_FILTERS`, so they can't drift from the sentinel defaults the predicates gate on. Filters apply live; Apply and Reset both collapse the panel (Apply is a close-only action, not a commit point) |
| `dp/cells.jsx` | 1b Slice iv — shared dp-styled presentational cells, moved out of `Market.jsx`: `SortTh`, `PlayerCell`, `ClickableRow`, `CareerBars` (5-wide sparkline, dimensions fixed — do not respec per caller; dp-v2 Slice 1 gave it void slots — `null` renders a dashed baseline marker, distinct from a measured `0`'s filled 2px stub), `DeltaCell` (colored ±N text, extracted from Market's Value/NEXT column). Imported by both `Market.jsx` and `Portfolio.jsx`. Carries the zero-based-vs-min–max normalisation rule (also in `dp/SeriesBars.jsx`) as a file-header comment |
| `dp/CoveragePips.jsx` | dp-v2 Slice 1 — three-pip coverage indicator (`band` or raw `count`, converted via `coverageBand.js`); no colour under any prop, decorative (`aria-hidden`). Ships unused this slice — first real consumer is a later slice |
| `dp/SeriesBars.jsx` | dp-v2 Slice 1 — arbitrary-length sibling to `CareerBars`; never pads, never substitutes `0` for a null. `'scaled'` (min–max, optional explicit `domain`) or `'signed'` (real zero axis, positives above/negatives below a 1px rule) modes. Ships unused this slice |
| `dp/TrendCell.jsx` | dp-v2 Slice 1 — series → delta (glyph + colour) → window label primitive, three geometries (`cell`/`tile`/`section`) via a lookup object. **Distinct from the module-local, unexported `TrendCell` in `market/Market.jsx:182`** — the name collision is Slice 5's to resolve, not touched here. Band-gated (`low` suppresses the series; `none` renders `—`; unrecognised treated as `none`). Ships unused this slice |
| `dp/DefinitionPopover.jsx` | dp-v2 Slice 1 — click-triggered (never hover) definition popover: term/scope, gloss, percentile strip, coverage pips, field expression. Keyboard-operable (`Escape` closes, focus returns to trigger); one open at a time via local state, no context/provider. Ships unused this slice |
| `dp/DegradedBlock.jsx` | dp-v2 Slice 1 — the five degraded-data kinds (`not-yet-accruing`/`not-measured-then`/`undefined-here`/`never-available`/`no-baseline`); `never-available` alone gets the amber border/label pair, the rest neutral. Never a call to action. Ships unused this slice |
| `dp/MarketTable.jsx` | 1b Slice iii — dp-styled presentational table shell for Market. Mirrored the (now-deleted) Explorer's `PlayersDataTable` render-prop shape (`header`/`renderRow`/pagination, `PAGE_SIZE=50`) but was a fresh build from the start, not a reuse — that component and its `SortTh`/`ValueChip` were styled with the old `--color-*` family and shared with `/players`; recoloring them would have recolored that surface. Hard-codes the ALL/QB/RB/WR/TE pill row and always renders a pager, so it **cannot** be reused as-is by Portfolio (no pills, no pager) — Portfolio's table shell is inlined in `Portfolio.jsx` instead. **Slice vi** added an optional `filterBar` render-prop, rendered in the SAME flex-wrap row as the position pills — additive, absent prop renders exactly as before |
| `dp/PlayerDetailModal.jsx` | 1b Slice ii, **body-only since Slice v** — the identity row/tiles/chart/drivers panel/right rail for one player; reads `usePlayerProfile` + the App-level `ProfileDataContext.Provider`; dark-only `--color-dp-*`. Takes `{ playerId, myTeamName, onCompare }` — no `onClose` (nothing in the body calls it once the scrim/panel/close-× moved to the shell). Rendered by `dp/PlayerDetailTabs.jsx` for whichever tab is active. New leaf module `src/utils/dynastySignalBadges.js` (extracted from `PlayersTab.jsx`'s inline badge block) derives its SIGNALS-rail content; Market's Outlook column set is the helper's second consumer, re-applying `OutlookTab`'s `0.95–1.05` age-curve gate locally rather than editing the shared helper |
| `dp/PlayerDetailTabs.jsx` | 1b Slice v — the pop-up's shell: scrim, panel, tab strip (up to 4 open players, FIFO eviction at the cap — `App.jsx`'s `tabs[]`/`activeTab`), the compare matrix (≥2 tabs, seven rows, winner-relative colouring per open tabs — not the mock's absolute thresholds), and the "+ Add player to compare" dropdown (top 5 by dynasty score, no text input, reuses `dp/cells.jsx`'s `PlayerCell`). Owns one local flag (`dropdownOpen`); a single `Escape` listener branches on it (closes the dropdown if open, else the whole pop-up — two listeners on `window` can't express "dropdown only", since `stopPropagation` between them is a no-op). Sources all per-tab data through `useProfileData()` — never `usePlayerProfile`, a per-`playerId` hook that can't be called once per open tab; `seasonProjections[id]?.projectedGames` (not a row field) and `computeConsistency(careerStats, id)` (a pure function, safe to call per tab) are the two traps. Mountable from any surface, exactly as Slice ii's modal was; `openPlayerDetail(id)`'s signature is unchanged, so `Market.jsx`/`Portfolio.jsx` need no edits |
| `roster/{MyTeamView,PlayerCard,Sparkline}.jsx` | **Dormant, not deleted** (1b Slice i retired the `/roster` route) — left on disk, unimported by `App.jsx`; the `myTeamData` state and its fetch effect that used to feed them were removed from `App.jsx` as dead code. Still exercised (compiled + rendered with hand-built fixtures) by `shell/importIntegrity.test.jsx`, which keeps them honest until a future slice re-wires them |
| `board/Board.jsx`, `trade/Trade.jsx` | Gated placeholders (marginal-value/phase prerequisites); nav labels "Draft board"/"Trade desk" since 1b Slice i |

### src/context/
| File | Responsibility |
|------|----------------|
| `ProfileDataContext.jsx` | Provides `{careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats}` (ten keys). **One provider site** (down from three as of 1b Slice viii, which retired the Explorer's two `/players`-scoped sites with the surface): an App-level provider wrapping `<Routes>` in `App.jsx`, feeding `dp/PlayerDetailTabs.jsx` and, through it, `dp/PlayerDetailModal.jsx` (`playerRows` key is `playerRowsWithProj`) |

### src/hooks/
| File | Responsibility |
|------|----------------|
| `usePlayerProfile.js` | Derives all PlayerProfile rendering data (career history, ranks, comps, peers) from `ProfileDataContext` |
| `usePlayersTable.js` | View-local table UI state shared by Market (since 1b Slice iii) and Portfolio (`posFilter`, `sortState` + `localStorage` persistence under a caller key, `page`, `expanded`, `selectedPlayerId`, handlers, `sortProps`, `setSortState`) — the Explorer's own Dynasty tabs used it too until 1b Slice viii retired that surface. One instance per consumer. Owns **view-local** state only — never App.jsx domain/`playerRows`-pipeline state (see *App.jsx owns all state*). `setSortState` (added Slice iii, additive) lets a caller re-assert a specific sort directly — needed because `handleSort` only toggles the current column's direction and can't switch to an arbitrary column/direction pair; Market uses it to re-assert each column set's own default sort when the set switches (`handlePosFilter`'s own reset already follows whatever `defaultSort` the hook was constructed with, which Market re-supplies per active set). `handleSort`'s `ascByDefault` set (additive, Slice vii follow-up) also includes `ceilingRank`/`floorRank` — rank-shaped columns (1 = best) where the first click should sort ascending, mirroring the Explorer's own separately-implemented `handleSort`; no other consumer of this hook has a rank-type column today. |

### src/utils/
| File | Responsibility |
|------|----------------|
| `cache.js` | IndexedDB cache via `idb`; `getCache / setCache / clearCache / listCacheRecords`; TTL in minutes |
| `fantasyPoints.js` | `calculateFantasyPoints(stats, scoringSettings)` dot-product; `getPointsBreakdown` for debug |
| `ageCurve.js` | `interpolateAgeCurve()` — pure age-curve interpolation lookup; leaf module (imports nothing). Extracted from `dynastyScore.js` to break the `dynastyScore ↔ projectionSignals` cycle |
| `dynastyScore.js` | `computeEmpiricalAgeCurves`, `computeDynastyScore`, `computeProspectScore`, `computePositionalRanks`, `computeRoleRanks`, `computeMarketDivergence`, `computeKTCPositionPercentile` — read in full before touching; imports `momentum.js`, `regressionSignals.js`, `projectionSignals.js`, `ageCurve.js` |
| `seasonProjection.js` | `computeNextSeasonProjection()` — 13-step vet pipeline (10 `combinedNewFactor` signals) + comp blend + rookie path |
| `careerComps.js` | `buildCareerArcVector`, `findCareerComps`, `compsProjectedPPG` — session-cached in module-level Map |
| `teamContext.js` | `computeTeamContext`, `computeQBQualityByTeam`, `computeHistoricalTeamTotals` (also aggregates RZ denominators: `rushRz`/`recRz`); `isTeamAggregateId` excludes Sleeper `TEAM_<abbr>` whole-team aggregate pseudo-rows from `computeHistoricalTeamTotals` denominators (store-served season-totals carry one per team; unfiltered they exactly doubled every team total), `computeHistoricalShares`, `computeShareTrend`, `buildTeamDepthChart`, `applyQBQualityModifier` (QB-quality OQ modifier — extracted from App.jsx for testability); historical attribution is mode-gated (`DEFAULT_ATTRIBUTION` = `'per-season-team'` since the R2 flip 2026-07-11; dynasty-score channels explicitly pinned current-team — see docs/dynasty-scoring.md) |
| `teamRzShare.js` | `computeTeamRzShareFactor()` — team-aggregated red-zone share factor (D3); cohort-percentile + shrinkage, ±5%, QB gated out |
| `ktcMatch.js` | `matchKTCToSleeper()` — name+position/team fuzzy matching |
| `seasonRanks.js` | `rankPositionSeason` (per-season positional ranking by league-scored PPG — extracted from `usePlayerProfile`/shared), `buildSeasonPositionRanks` (global ranks + per-rank points reference), `computeCeilingFloor` — pure, **view-only** (Market's Value-set Ceiling/Floor cells, `CeilingFloorCell` in `Market.jsx` — the Explorer's own consumer of this util was deleted with that surface in 1b Slice viii); never feeds projection/scoring |
| `sortUtils.js` | `compareNullsLast(va, vb, dir)` — direction-independent null-sink comparator used by `Market.jsx`, `Portfolio.jsx`, and `TopBar.jsx`'s global search results ranking |
| `tabState.js` | `addTab(tabs, id, cap)` (FIFO eviction at cap) / `removeTab(tabs, activeTab, id)` (left-neighbour activation, `null` when the last tab closes) — pure state-transition helpers for the player detail pop-up's `tabs[]`/`activeTab` (1b Slice v). Extracted out of `App.jsx` so this logic is unit-testable without mounting the whole app, which this repo has no precedent for |
| `marketFilters.js` | 1b Slice vi (+ Slice vii's `search` key) — pure Market filter predicates + state helpers: `DEFAULT_MARKET_FILTERS` (twelve dimensions; for the three range filters the defaults ARE the sentinel `applyMarketFilters` gates on), `applyMarketFilters(rows, filters, {playerMap, myTeamName, seasonProjections})`, `activeFilterCount`, `normalizeFilters` (per-key type/length/enum validation for the `market-filters` localStorage restore — NOT key-presence, since the sentinels are strict `!==` and a stale shape like `ageRange: ["18","45"]` would otherwise read as active and silently empty the table). **`search`** (1b Slice vii §2) is the one key `normalizeFilters` *never* restores — it forces `''` unconditionally regardless of payload, and `Market.jsx`'s `setFilters` separately blanks it before every `localStorage` write, so a free-text query is applied live but never persisted at either end. **`isRestorableFilters(raw)`** (1b Slice vii §3.1) is a strict companion sharing the same per-key validators: unlike `normalizeFilters`, it never salvages — a payload is restorable only if every key (`search` excepted) is already valid. Used to filter a *named* saved preset list at mount (drop, don't salvage — silently applying "no filter" under a name the user chose is worse than the preset disappearing), while the live `market-filters` payload keeps `normalizeFilters`'s salvage behaviour. Predicates were originally harvested from the Explorer's `PlayersTab.jsx`; that file was deleted in 1b Slice viii, so this is now the single source. `DYNASTY_GROUP_MAP` and `NFL_TEAMS` were `PlayersTab.jsx`-owned data, imported (not copied) from there until Slice viii — they now live here natively, closing the `utils/`→component dependency inversion that import direction created |
| `ktcHistory.js` | KTC snapshot time-series loader + assembler; `computeKtcSignals` feeds the projection's `ktcHist*` capture factors. **`computeKtcRecentDelta` (the ≈30-day value Δ) was deleted in 1b Slice viii** — its only consumer, the Explorer's KTC cell, was deleted with that surface |
| `coverageBand.js` | dp-v2 Slice 1 — the single source of the coverage vocabulary (`coverageBand(n)` → `'none'\|'low'\|'medium'\|'high'`, `pipCount(band)`), consumed by `dp/CoveragePips.jsx` and `dp/TrendCell.jsx`. Mirrors `ktcHistory.js:283`'s thresholds (a deliberate, named 2-line duplication — `ktcHistory.js` is not imported, it does data-store I/O) but diverges at `n=1`: `computeKtcSignals` floors at `n < 2` → `'none'` because every signal it emits is a trend, while `coverageBand` describes whether a value is readable, which takes one observation |
| `projectionSignals.js` | `computeBreakoutFlag`, `computeBounceBackFlag`, `computeTdReliance` — shared signal helpers imported by both `seasonProjection.js` (Step 5c) and `dynastyScore.js`; imports `interpolateAgeCurve` from `ageCurve.js` and `classifyInjurySeason` from `durabilitySignals.js` (bounce-back down-year detection) |
| `durabilitySignals.js` | `wasContributorSeason`, `classifyInjurySeason` — shared durability helpers imported by `dynastyScore.js`, `seasonProjection.js`, and `projectionSignals.js`. Contributor-evidence thresholds + adjacent-season rescue: see docs/projection.md (Step 6) and docs/signal-registry.md (Durability). |
| `projectionSnapshot.js` | Snapshot and load ephemeral projection inputs (team, depth, status, KTC); ~2yr TTL |
| `compsIntegration.js` | `computeCompBlend()` — confidence-weighted career-comp ensemble blend (Step 9) |
| `efficiencyMetrics.js` | `computeEfficiencyFactor()` — per-opportunity efficiency composite (Step 5e) — also exports `passerRating` (reused view-only by `outlookPositionStats.js`). |
| `usageMetrics.js` | `computeUsageFactors()` — snap-share & own-rate red-zone usage factors (Steps 5f/5g) |
| `momentum.js` | `computeMomentum()` — multi-season PPG momentum signal; shared by `dynastyScore.js` and the season-projection pipeline (Step 5) |
| `regressionSignals.js` | Consistency CV sub-score shared with `dynastyScore.js`; trajectory slope is projection-specific (floored) and intentionally NOT shared with dynasty's unfloored trajectory |
| `collegeMatch.js` | `matchCollegeToSleeper()` — name+college fuzzy match from CFBD to Sleeper IDs |
| `collegeMetrics.js` | `computeCollegeMetrics()` — dominator rating, breakout age, production trend |
| `nflDraftMatch.js` | `matchNflDraftToSleeper()` — nflverse draft picks matched to Sleeper player IDs |
| `enrichmentLookup.js` | Null-safe pure lookups: `findInjuryForWeek`, `getCoaching`, `getScheme`, `getNotes` |
| `exportData.js` | CSV / ZIP download export; `classifyKey` routes cache keys to snapshot ZIP paths |
| `relevance.js` | `isRelevantPlayer`, `playedRecently`, `rosterStatusOf` — pure candidate-pool relevance gate (extracted from App.jsx); roster-absence tightens the stale-team+KTC rule |
| `outlookConsistency.js` | `extractGamePoints`, `computeSeasonConsistency`, `computeConsistency` — view-only per-game scoring-distribution helpers (pooled mean / population SD / CV / self-relative boom-bust over the last 3 qualifying seasons, `gp ≥ 8`). Reuses `careerStats[...].weeklyPoints`; never feeds projection/scoring. |
| `outlookUsage.js` | `buildUsageHistory`, `computeUsageTrend`, `buildRoleCohort`, `classifyRole` — view-only Outlook usage derivations (per-season snap%/share history, latest-vs-prior trends, cohort-tertile role note). Opp-trend consumes the **view-only per-season-team share series** (`outlookPositionStats.buildPerSeasonTeamShares`), not `historicalShares`. Never feeds projection/scoring. |
| `outlookPositionStats.js` | `buildTeamShareTotals`, `buildPerSeasonTeamShares`, `buildPositionStatSeries`, `computeMetricSummary`, `POSITION_STAT_METRICS` — view-only Outlook position-stat derivations (per-pill stacked trend-over-level cells: Cmp%/passer-rtg/sacks · rush/target share + Y/C · target/air-yards share + aDOT). Rates recomputed from season-total counting components (never stored rate keys); shares are **per-season-team** attributed via `playerTeam.resolvePlayerTeam` (season grain — `careerStats[season][id].team`, schema v3, era-accurate domain; numerically identical to the former inline read) via `buildTeamShareTotals`/`buildPerSeasonTeamShares` — no longer reusing `historicalShares` (`buildTeamReceivingTotals` removed, zero remaining consumers); reuses `outlookConsistency.QUALIFYING_GP`, `efficiencyMetrics.passerRating`, `nflStats.computeSeasonAverages`. Never feeds projection/scoring. |
| `nflStats.js` | View-only NFL-stats helpers: `normalizeTeamForSchedule` (Sleeper→nflverse, `LAR→LA` — used by `playerTeam.js`, a **CR-16** app-side trigger) and `computeSeasonAverages` (per-position season averages from counting stats — never the pre-summed rate keys; used by `Market.jsx`/`outlookPositionStats.js`). Pure; never imported by projection/scoring. **`buildGameLog`/`computeHighLow` were deleted in 1b Slice viii** — their only consumer, the Explorer's `NflStatsTab` game log, was deleted with that surface. |
| `playerTeam.js` | `eraTeam(abbr, season)` (app-side mirror of the data repo's era remap — LA→STL ≤2015, SD/LAC ≤2016, OAK/LV ≤2019; both repos change together on a future franchise move) + `resolvePlayerTeam({careerStats, gameLogPlayers}, playerId, season, week?)` — the SINGLE player→team resolution point, returning ERA-ACCURATE codes (teamcontext/schedule domain). Season grain: `careerStats[season][pid].team` (already era-accurate); week grain: gamelogs `games[].team` (current-franchise domain → era-remapped here). View-only; never feeds projection/scoring (guarded by `teamContextViewOnly.test.js`) |

---

## Invariants

Rules that break things silently if violated.

**Factors contract.** The projection `factors` object is a contract: 73 vet keys / 51 rookie keys, enforced by `src/__tests__/factorsSchema.test.js`. Never add, rename, or remove a `factors` key in `seasonProjection.js` without updating that test.

**Stat-key contract.** Every stat key referenced by projection code must appear with a finite value in `src/__fixtures__/season-totals-2025.json`; enforced by `src/__tests__/statKeysContract.test.js`.

**Fantasy points computed weekly.** Always call `calculateFantasyPoints(weekStats, scoringSettings)` on raw per-week stats. Never sum pre-stored season totals to produce fantasy points.

**React Strict Mode double-fires.** Effects fire twice in dev. Every `async useEffect` that writes state must check a `cancelled` flag before calling the state setter.

**Capture-only factors do not move projectedPPG.** `ktcHist*`, `positionMultiplicity*`, `adot*` (all paths) and the rookie-path `breakoutAgeFactor` are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines. (`breakoutAge`/`breakoutAgeFactor` are still computed and recorded; `breakoutAge` drives the Profile breakout chip.)

**Advstats are display-only.** `src/api/advStats.js` (target/air-yards share, WOPR, RACR) must never influence `projectedPPG`, the dynasty score, or any `factors` entry, regardless of whether it has a UI consumer. **Currently has no UI consumer at all** — `AdvancedStatsPanel.jsx`, its only renderer, was deleted with the Explorer in 1b Slice viii; the loader, cache and sparsity gate are untouched and the family is fully loaded-but-unrendered. No projection/scoring module may import it. Enforced by `src/__tests__/advStatsViewOnly.test.js`. Re-adding a renderer is a rendering job, not a re-ingestion one — see the "Advstats & Signal Grading — Findings and Open Items" doc.

**Not-real data must be marked `PROVISIONAL(...)`.** At every site that renders or derives a value not backed by real data, add a single-line comment:

```js
// PROVISIONAL(<category>): <what is fake> · <why> · <what would make it real>
```

`<category>` is exactly one of `no-data` (field is real in principle, source is empty/missing/gated —
render `—`/omit, never a fabricated fallback), `heuristic` (a deliberate, scoped-down stand-in for
an engine that doesn't exist — ship it, but it must not be presented as a model verdict), or
`mock-copy` (handoff copy shipped verbatim with no data behind the claim — prefer rewording to
something true). One tag per site, at the derivation *and* the render site if they differ. `grep -rn
"PROVISIONAL(" src/` is the canonical inventory — paste its output into a slice's hand-back summary.
Delete the tag in the same change that wires the real source. Introduced by the Dynasty Portfolio
redesign (1b Slice i, `.claude/tasks/dynasty-portfolio-1b.md` §2.4) as a standing rule for every
subsequent slice, not a one-off note for that program.

**Intentional divergence: dynastyScore.js vs seasonProjection.js.** `dynastyScore.js` uses the per-league rookie-pick proxy for dynasty value; `seasonProjection.js` uses the actual NFL draft slot (`nflDraft.js`). Do not unify unless explicitly asked.

**Ephemeral inputs must be snapshotted contemporaneously.** NFL team, `depth_chart_order`, player status, KTC value, and any Vegas/injury/coaching/scheme signals cannot be reconstructed later. Use `projectionSnapshot.js` to capture them at observation time. See docs/integrations.md → "Projection snapshots" and "Data store integration".

**App.jsx owns all domain/pipeline state** (the `playerRows` pipeline, league/career data) and flows it down as props. Do not move domain state into child components or new hooks, and do not introduce Redux, Zustand, Jotai, or any other state library. (Purely view-local table UI state — position filter, sort, page, expand, selected-profile id — may live in the `usePlayersTable` hook, one independent instance per consumer (Market, Portfolio); this is not domain state.) Do not add TypeScript. Do not modify cache TTL values without being asked. Do not refactor working utility functions while implementing a feature.

**playerRows pipeline order is load-bearing.** Trace the full pipeline (section below) before changing any step — each step depends on the previous one's output shape.

### Cross-repo contract registry (with sleeper-dashboard-data)

This repo cannot edit the data repo. The **complete enumerated registry** — the entry-format definition and all 18 `CR-NN` entries — lives in [docs/cross-repo-registry.md](docs/cross-repo-registry.md). It is the sole authority for what the data repo must mirror: the plan-reviewer subagent reads that file and never reads the sibling tree. Its app-side trigger lists are a maintained cache the subagent re-verifies against live `src/` on every review.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable.

**A coupling that is not listed there does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see [Workflow convention](#workflow-convention).

---

## Field-existence rule

To confirm a stat key exists in the live data, check `src/__fixtures__/season-totals-2025.json`. Grep finds _consumers_ of a key in source; the fixture confirms the key is _present in the data_. Both checks are needed — grep alone is not sufficient.

---

## Done-definition for code tasks

Before reporting a task complete:
1. Tests cover the change: any new behaviour gets a new test, and any changed behaviour gets its test updated to assert the correct new outcome (not merely edited to go green). Purely non-behavioural changes — renames, docs, lint, dead-code removal — need none. This applies even to skip-planning tasks that have no task-file "Tests to add" spec.
2. `npm test` — full suite must be green.
3. Run any contract tests touching changed areas: `factorsSchema.test.js` if `seasonProjection.js` changed; `statKeysContract.test.js` if stat-key references changed.
4. `npm run lint` — must report 0 problems.
5. `npm run build` — clean with no warnings.
6. Fix anything red before declaring done.

---

## Workflow convention

**The standard loop is fully in-repo.** Every step — planning, review, approval, implementation — happens in this repository against live source. Nothing in the standard loop depends on an external tool or on a chat held outside it.

```
Session 1 (planning, opus)
  → plan-reviewer subagent   ← the review gate
  → human approval
  → Session 2 (implementation, sonnet)
```

Features use a two-session flow: **opus plans**, **sonnet implements**.

- Opus session: read relevant code, decide signatures and data shapes, write `.claude/tasks/<feature>.md`. **Do not edit any source files.** End the session.
- Sonnet session: read the task file first, implement exactly what it specifies, run the build. If something is ambiguous or contradicts existing code, stop and ask — do not guess.
- **Visual verification is the user's job.** Claude Code must NOT start the dev server (`npm run dev` / `npm run preview`) or run any browser/visual/smoke test. Validate with `npm test` / `npm run lint` / `npm run build` only, then hand back for the user's manual smoke. This is especially load-bearing for theming/palette work, whose acceptance is the user's eyes in light **and** dark.

The task file is the handoff artifact, not chat history. A planning session that edits source has broken the handoff.

### Plan review

The plan-reviewer subagent (`.claude/agents/plan-reviewer.md`) is the **primary review gate**, not a lint pass. Invoke it on the task file at the end of Session 1, before Session 2. Its mandate is three-part:

1. **Factual / mechanical** — paths, function signatures, data shapes, stat keys and step ordering, checked against live source.
2. **Strategic / principles** — whether the planned approach is sound and conforms to the [Invariants](#invariants) above: a plan that is factually accurate but violates an invariant, or solves the problem the wrong way, gets flagged.
3. **Cross-repo intent** — whether the plan touches an entry in [docs/cross-repo-registry.md](docs/cross-repo-registry.md), and if so whether Session 1 emitted that entry's `Mirror` text. The reviewer checks against that registry only; it never reads the sibling tree.

**Flags are advisory input to the human, not an auto-apply queue.** Session 1 reports them verbatim and does not act on them. The human decides what to fix. Session 2 starts only after human approval.

### The Claude.ai project

**Out of the standard loop.** The Claude.ai project is an occasional exploration tool — open-ended thinking, cross-repo reading, research that has not yet become a plan. It is not a review gate, it does not author task files, and no step of the standard loop waits on it.

**The one residual case that still routes there:** a change that introduces a **brand-new cross-repo coupling not yet present in the registry**. A repo-scoped subagent can check a plan against a known list, but it cannot reason about a coupling that has never been written down, and it cannot read the sibling tree to discover one. Take that case to the Claude.ai project, which can hold both repos at once.

Its output is not a decision — it is a **draft registry entry** in the format defined at the top of [docs/cross-repo-registry.md](docs/cross-repo-registry.md). That draft returns to Session 1, lands in both repos' registries in the same change, and is then subject to the normal in-repo gate like anything else. Extending an existing entry is *not* this case and stays in-repo.

### Which model for which task

| Task | Model |
|------|-------|
| Designing anything touching the playerRows pipeline | **opus** |
| Anything touching `dynastyScore.js` (950 lines, tightly coupled) | **opus** |
| New scoring / projection algorithm | **opus** |
| Cross-file refactors spanning App.jsx + utils + components | **opus** |
| Architecture review / multi-file debugging | **opus** |
| Implementing a fully-specified task file from `.claude/tasks/` | **sonnet** |
| Adding a Market column from a spec | **sonnet** |
| New component matching an existing pattern | **sonnet** |
| README / CLAUDE.md updates after a feature lands | **sonnet** |
| Single-file bug fix with clear repro | **sonnet** |
| Renames, lint cleanup, dead-code removal | **sonnet** |

If a sonnet session uncovers a design question the task file didn't anticipate, stop and report — do not improvise architecture.

**Sibling repo:** `sleeper-dashboard-data` — the data store this app consumes via jsDelivr and writes snapshots into. See [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard-data).

---

## Self-maintenance

Keep this file current as part of every task's done-definition. If a change adds/renames/removes a `src/` module, changes a command in `package.json`, alters a documented invariant or the factors contract, or changes a data shape referenced here, update the relevant CLAUDE.md section in the **same change**. Keep this file thin — it is a navigation-and-rules layer, not a second README. Push deep detail into the relevant `docs/` file and link to it rather than duplicating it here. If a change adds, removes, or reclassifies a signal/factor — a raw source, a computed `factors` entry, an ephemeral capture, or its historical coverage or reconstructable-vs-ephemeral status — update the canonical signal registry (`docs/signal-registry.md`) in the same change.

If a change touches an entry in [docs/cross-repo-registry.md](docs/cross-repo-registry.md), emit that entry's `Mirror` text in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id — naming the contract in prose is not enough. If the change introduces a coupling the registry does not list, add the new entry to **both** repos in the same change (see [Workflow convention](#workflow-convention) for how a genuinely new coupling gets drafted).

---

## State and data flow

> **App state & `leagueData` shape:** App.jsx owns all domain state (see the *App.jsx owns all state* invariant); children get props or read `ProfileDataContext`. The `useState` inventory and the `leagueData` object shape live in [docs/architecture.md](docs/architecture.md) → *State management* and *leagueData assembly* — kept there to avoid drift, not duplicated here.

### playerRows pipeline (all useMemo, must stay in this order)
1. **`playerRows`** — base rows from careerStats + leagueData; calls `computeDynastyScore` per player; adds `positionRank` by currentSeasonPPG. Also computes `careerSparkline` (`[ppg × 5 league seasons]`) inline — since dp-v2 Slice 1, `null` for an absent season or 0 games, a number (including a legitimate `0`) only for a measured PPG; not snapshotted, not scored, no pipeline step downstream depends on it
2. **`playerRowsWithKTC`** — merges `ktcValue` from `ktcMap`
3. **`qbQualityByTeam`** — `computeQBQualityByTeam(playerRowsWithKTC, depthMap, true)`; prefers depth-chart QB1; league-wide (includes un-rostered QBs). A sibling memo `qbQualityByTeamRostered` (legacy rostered-only) feeds projection Step 7b — intentional divergence until the projection swap clears its backtest (see docs/projection.md → Step 7b).
4. **`playerRowsWithQBMod`** — applies QB quality modifier to WR/TE/RB `opportunityQuality` component (15% weight)
5. **`playerRowsFinal`** — `computeMarketDivergence(playerRowsWithQBMod)`; adds `divergenceSignal`, `dynRank`, `ktcRank`
6. **`playerRanks`** — `computePositionalRanks(playerRowsFinal, careerStats, currentSeason)` → `Map<player_id, ranks>`
7. **`playerRowsWithRanks`** — merges `recentRank`, `peakRank`, `consistencyRank`, `dynastyRank`, `rankMovement`, `movementLabel`

`playerRowsWithRanks` feeds `playerRowsWithProj` (merges `seasonProjections`; also computes `nextSeasonRank`) — the pipeline's terminal output, passed to `Market`, `Portfolio`, and the App-level `ProfileDataContext.Provider` (which feeds the player-detail pop-up).

Also upstream: `depthMap` (from `leagueData.playerMap[id].depth_chart_order`), `empiricalCurves` + `positionPeakPPG` + `positionPeakAge` (from `computeEmpiricalAgeCurves`), `historicalTeamTotals` + `historicalShares` (per-season-team; feed the projection and `computeRoleRanks`) + `historicalTeamTotalsCurrentTeam` + `historicalSharesCurrentTeam` (current-team-pinned; feed only the `computeDynastyScore` share-trend boost — R2 hold); `teamContext` is current-team-pinned.

---

## Patterns

### Caching (cache.js + IndexedDB)
- `getCache(key)` returns data or `null` (null on miss or TTL expiry)
- `setCache(key, value, ttlMinutes)` — default TTL 60 min; keys containing "players" default to 1440 min
- Pass TTL explicitly to make intent clear (see `sleeper.js`). Per-function TTLs, stale-cache invalidation, and the nflverse-via-data-store path: [docs/integrations.md](docs/integrations.md).

### Component data access (two patterns)
1. **Props from App.jsx**: `StandingsTable`, `ScheduleGrid`, `RostersTab`, `MyTeamView`, `Market`, `Portfolio` — all props-only, no context reads
2. **ProfileDataContext**: any `usePlayerProfile` consumer reads the ten-key value (see `src/context/` table above) via `useContext`. **One provider site** (the Explorer's two `/players`-scoped sites were retired with that surface in 1b Slice viii): an App-level provider wraps `<Routes>` in `App.jsx` itself, feeding `dp/PlayerDetailTabs.jsx` (and, through it, `dp/PlayerDetailModal.jsx`) so the pop-up is mountable from any route
