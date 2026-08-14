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
| `/` | → redirects to `DEFAULT_ROUTE` (`/market`, temporary — see below) |
| `/portfolio` | Portfolio — real screen since 1b Slice iv: header, four metric tiles, value-by-age-band chart, holdings table, row click → the Slice ii detail pop-up |
| `/market` | Market — real table over `playerRowsWithProj` since 1b Slice iii: Value/Outlook/Production column-set switch, position pills, sort, pagination, row click → the Slice ii detail pop-up |
| `/board` | Board (gated placeholder — marginal-value engine + season-phase classifier), nav label "Draft board" |
| `/roster` | → redirects to `/portfolio` (retired route; old bookmarks/back-history don't 404) |
| `/players` | Player Explorer — no nav-shell entry, still routed and reachable directly (see below) |
| `/trade` | Trade (gated placeholder — marginal-/phase-aware trade evaluator), nav label "Trade desk" |
| `/league` | → redirects to `/league/standings` |
| `/league/:view` | League group (standings / schedule / rosters) |
| `*` | → redirects to `DEFAULT_ROUTE` |

The **Players** surface (`/players`) hosts a two-level intra-surface tab shell — primary **Dynasty** | **Weekly**, with Dynasty sub-tabs **Value** | **Outlook** | **NFL stats** — persisted to `localStorage` (`players-view`, `players-dynasty-tab`); **Value** renders the Explorer (`PlayersTab`); Outlook is a projection/usage-trend table (`OutlookTab`), NFL stats is a placeholder, Weekly is gated. These are **not** nav-shell entries. See `src/components/players/PlayersSurface.jsx`.

**`/players` stays routed-but-unlinked, duplicating Market on purpose (1b Slice iii).** Market v1 ships without the filter panel, saved presets, and comparison tray the Explorer has today, so `/players` is not retired yet — `PlayersSurface`/`PlayersTab`/`OutlookTab`/`NflStatsTab`/`PlayersDataTable`/`SortTh`/`ValueChip` keep their current rendering and styling untouched (only two `export` keywords added, so Market can import — not copy — `NflStatsTab`'s `COLUMNS` and `OutlookTab`'s `POSITION_STAT_COLUMNS` descriptor maps). Since `DEFAULT_ROUTE` is now `/market` and `/players` has no nav entry, the Explorer's filters/presets/comparison are reachable only by typing the URL — accepted deliberately (task file §1.1), not an oversight. The gate for actually retiring `/players` is Market reaching filter parity. Three convergence debts carry forward to whichever slice does: `PlayersTab.jsx:369-373`'s hard-coded dynasty-score weight strings → `dynastyScore.components[*].weight`; `PlayersTab.jsx:864-881`'s inline signal-badge block → `src/utils/dynastySignalBadges.js`; the two `/players`-scoped `ProfileDataContext` providers → the App-level one.

Nav chrome: desktop left rail (`NavRail`, grouped `NAV_GROUPS`) + mobile bottom tab bar (`BottomTabBar`, flat `PRIMARY_NAV`, capped at 5). Seasonal **Rookies** item Jan–May only (appended to the rail's MANAGE group and to the tab bar's flat list; hidden offseason). League destinations are reached directly from the rail's LEAGUE group on desktop; on mobile, via `TopBar`'s mobile-only League link (`/league` → `/league/standings`) plus `LeagueView`'s own in-page sub-nav (`md:hidden`, the only mobile path to `/league/schedule`/`/league/rosters`). **`DEFAULT_ROUTE=/market`, temporarily, since 1b Slice iii** — Portfolio is still a placeholder, so the app shouldn't boot to it; re-evaluate when the Portfolio slice ships real content. See `src/components/shell/navItems.js`.

### src/
| File | Responsibility |
|------|----------------|
| `main.jsx` | Entry point — renders `<App>` in StrictMode |
| `App.jsx` | Root component; owns all state; builds playerRows pipeline; renders the router + nav shell (`components/shell/AppShell`) and injects pipeline outputs into routed surfaces |
| `constants.js` | Shared constant `POSITION_ORDER` |
| `theme.js` | Theme load/persist/apply helpers (`loadStoredTheme` default-dark, `persistTheme`, `applyThemeClass`); localStorage-helper pattern, not state |

> **Color tokens:** `src/index.css` `@theme` is the color source of truth — neutral/surface role tokens + chromatic primitives (`--c-{hue}-{shade}`) + semantic aliases (accent/positive/negative/warning/caution/market/confidence/chart/phase), each with light + dark values. `--color-canvas` is the page ground (painted on `body`); `--color-surface…surface-5` are the cards/panels/fills that layer above it (light = warm, surface lifts above canvas; dark = cool near-black, lighter-as-higher). Components consume tokens (`bg-[var(--…)]`), never raw palette classes. Every new token in this family must include a `.dark` override value.
>
> **`--color-dp-*` / `--font-dp-*` (Dynasty Portfolio redesign, 1b Slice i):** a second, **dark-only** token family — no `.dark` override, by design (master-plan §4/§5.1). Scoped to new route **content** only: `Portfolio`/`Market` screen bodies (Slices iii/iv) and the player-detail pop-up (Slices ii/v). **Not** used by `TopBar`/`NavRail`/`BottomTabBar` — the shared chrome keeps the light/dark-adaptive `--color-*` family above, unchanged, wrapping `League`/`Board`/`Trade` in both themes exactly as before. Because the page `body` background still follows the theme toggle, every `--color-dp-*` surface's outermost element must paint its own ground (`bg-dp-canvas`/`bg-dp-card`) before using any `text-dp-*` class, or it renders unreadable in light mode. Fonts: `--font-dp-sans` (Public Sans Variable) and `--font-dp-mono` (IBM Plex Mono, imported as explicit 400/500/600 weight subpaths — the package root is 400-only).

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
| `nflSchedule.js` | nflverse NFL schedule / results / Vegas lines (`nflverse/schedule/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflSchedule(year)` (no probe); `MIN_SCHEDULE_GAMES=200` floor; per-year permanent cache; `lastModified` freshness for the mutable current season; graceful empty shape. **Read-only** — not wired into projection/scoring (guarded by `scheduleViewOnly.test.js`); UI consumer: `NflStatsTab` game log (lazy per-season load) |
| `nflGameLogs.js` | nflverse per-game player stats (`nflverse/gamelogs/<year>.json`) — loaded from data store via `dataStore.js`; explicit-season `loadNflGameLogs(year)` (no probe); `MIN_PLAYERGAME_ROWS=3000` floor; per-year permanent cache; `lastModified` freshness; graceful empty shape; pass-through (computes nothing). **View-only / loader-only** — no consumer this slice; not wired into projection/scoring (guarded by `gameLogsViewOnly.test.js`). Wiring is the next (Outlook) slice. 2019 absent upstream → graceful empty |
| `teamContext.js` | nflverse team-context pack (`nflverse/teamcontext/<year>.json`) — **first TEAM-keyed family**: `teams` keyed by era-accurate team abbr → `games[]`, row identity `(team, week)` (weeks continuous REG→POST), NOT `sleeper_id`; explicit-season `loadTeamContext(year)` (no probe); `MIN_TEAMCONTEXT_ROWS=60` floor; per-year permanent cache (`nfl-teamcontext/<year>`); `lastModified` freshness; graceful empty shape; pass-through (per-week rates never summed — aggregate the `*Sum`/`*Plays` components); lookups `getTeamSeasonRows`/`getTeamWeekRow`; joins via `utils/playerTeam.js`. **View-only / loader-only** — no consumer this slice; not wired into projection/scoring (guarded by `teamContextViewOnly.test.js`). Distinct from `src/utils/teamContext.js` (projection module) |

### src/components/
| File | Responsibility |
|------|----------------|
| `PlayersTab.jsx` | Player Explorer table, FilterSidebar, PlayerProfile panel, ComparisonTray. Rendered as the Players → Dynasty → Value tab (mounted by PlayersSurface). Value tab adds display-only Ceiling/Floor career-finish cells (`seasonRanks.js`) and a ~30-day KTC Δ (`ktcHistory.computeKtcRecentDelta`). (`PlayerProfile`, `SortTh`, `projectionConfidenceClass` now exported for the Outlook tab) Explorer adds a Consistency column + a Recent-cell fallback-season flag (`recentRankSeason`) + an inline `ExpandableTableRow` row-expand reusing `ui/RankingsRow.jsx`. |
| `players/PlayersSurface.jsx` | Players-surface tab shell: Dynasty {Value\|Outlook\|NFL stats} \| Weekly; owns localStorage-persisted tab state (players-view, players-dynasty-tab); forwards all props to PlayersTab on the Value tab. Route element for /players. |
| `players/OutlookTab.jsx` | Players → Dynasty → Outlook table: next-season projection columns (Proj · Δ vs now · Proj G · Signals) + scoring-consistency (PPG ± SD) + the existing snap/opp/role usage trends, with an expandable panel (adjustment narrative · per-season distribution · usage history). Display-only. Reuses `dynastyScore.signals` (same flags as the Profile Dynasty badges), `seasonProjections` (`projectedGames`/`adjustmentSummary`), `currentSeasonPPG` (same PPG as the Value tab), `outlookUsage.js`, and `outlookConsistency.js`. Shared `usePlayersTable`/`PlayersDataTable`. Position pills swap the right-hand column group to three position-specific stacked stat columns (`outlookPositionStats.js`); ALL view keeps Snap/Opp/Role. |
| `players/NflStatsTab.jsx` | Players → Dynasty → NFL stats: position-split season-average table + expandable per-game game log (schedule-joined opponent/result/lines + reused weeklyPoints + High/Low). Display-only. Reuses `SortTh`/`PlayerProfile` (PlayersTab) + `ExpandableTableRow`; lazy-loads `loadNflSchedule`. Consumes the shared `usePlayersTable` + `PlayersDataTable`; the season selector, per-pill columns, lazy schedule load, and game-log panel stay here. |
| `players/WeeklyPlaceholder.jsx` | Gated placeholder for the Weekly primary tab (weekly rankings/matchup engine prerequisite); mirrors board/Board.jsx. |
| `players/PlayersDataTable.jsx` | Presentational, state-free wrapper for the shared Players → Dynasty table chrome (position pills + optional toolbar, `!loaded` notice, table shell, pagination, empty-state, Player Profile panel + backdrop). Columns (`header`) and rows (`renderRow`) arrive via render-props; per-tab filter→sort + detail panels stay in the consuming tab. Consumed by `OutlookTab`/`NflStatsTab` (Weekly next). |
| `AdvancedStatsPanel.jsx` | View-only advanced/usage stats panel (descriptor-driven `ADV_STAT_ROWS`) rendered in the Player Profile Stats tab |
| `SpiderChart.jsx` | 5-axis SVG radar chart; 1–2 player overlays; HTML labels + Tooltip integration |
| `AvailabilityHistory.jsx` | Per-season GP/DNP sparkline (18-cell per season); enrichment tooltips on DNP cells |
| `Tooltip.jsx` | Generic tooltip — portal, viewport-flip, delay, arrow; reads `TooltipContext` |
| `ui/ValueChip.jsx` | Pure presentational value chip — `{ value · market-delta · confidence }`; reads design tokens, consumes existing row fields, computes nothing (display-only, like `AdvancedStatsPanel`) |
| `ui/ExpandableTableRow.jsx` | Reusable table-row expander (`ExpandableTableRow` + `ExpandChevron`) — a row plus an optional full-width detail row; presentational, state-free. Used by the Outlook usage-history panel (slice #4 game log reuses it). |
| `ui/RankingsRow.jsx` | Pure presentational Rankings-row strip (Recent / Peak / Consist / Outlook / Role / Next-Szn rank chips + movement narrative + legend). Shared by the Player Profile header (ROW 3) and the Explorer inline row-expand — single source, no fork. Display-only. |
| `shell/AppShell.jsx` | App frame: always-on `TopBar` (forwards `currentWeek`) + (post-league) desktop `NavRail` / mobile `BottomTabBar` + content area; pure chrome, owns no state; fixed explicit prop list — does not forward arbitrary props |
| `shell/navItems.js` | Nav config: `PRIMARY_NAV` (flat, for `BottomTabBar`), `NAV_GROUPS` (grouped MANAGE/ACT/LEAGUE, for `NavRail`), `LEAGUE_NAV`, `ROOKIES_NAV`, `DEFAULT_ROUTE`, `isRookieSeason()` |
| `shell/{TopBar,NavRail,BottomTabBar,CareerLoadProgressBar,ClearCacheButton,ExportDataButton}.jsx` | Shell chrome + extracted header/progress/utility components. `TopBar` (1b Slice i): logo + league name, visual-only search field, freshness indicator (`currentWeek` prop), theme toggle, user/Switch, mobile League link, tooltip toggle — structural rework only, still on the light/dark-adaptive `--color-*` token family |
| `league/{LeagueView,StandingsTable,ScheduleGrid,RostersTab,SlotBadge}.jsx` | Secondary "League" group surfaces (extracted). `LeagueView`'s own sub-nav is `md:hidden` since 1b Slice i — desktop reaches Standings/Schedule/Rosters via the rail's LEAGUE group; mobile still needs the in-page tabs |
| `portfolio/Portfolio.jsx` | 1b Slice iv — real Portfolio screen: header + `N skill players` subline, four metric tiles (roster value/weighted age/concentration/projected points — values only, no deltas), a value-by-age-band chart, and a holdings table (ASSET/VALUE/5-YR PPG/PROJ Δ/HORIZON), row click/keyboard → `onOpenPlayerDetail`. Scoped entirely to `ownerTeamName === myTeamName` rows, derived once and shared by every section. No column-set switch, no position pills, no pager (table shell is inlined here, not `MarketTable`) — see `dp/cells.jsx`. `HORIZON` reads `row.dynastyScore.signals.yearsFromPeak` (pipeline-computed, not re-derived); the age-band chart intentionally uses fixed position-blind bands instead (aggregating *value* across a roster, where position-blind bands are the point) — the two deliberately disagree occasionally. Five design elements cut per master-plan §4a.2 (alert cards, `CALL` column, tile deltas, the horizon segmented control, "contending window open"); the "· N rookie picks" subline clause cut for a data gap (no traded-picks endpoint loaded) |
| `market/Market.jsx` | 1b Slice iii — real Market table over `playerRowsWithProj`: Value/Outlook/Production column-set switch (`market-column-set`), position pills, sort (`usePlayersTable`, `market-sort`; see `src/hooks/` table for the three-set sort-reset mechanics), pagination, row click/keyboard → `onOpenPlayerDetail`. Column *derivations* are harvested (imported, not copied) from `outlookPositionStats`/`outlookUsage`/`outlookConsistency`/`nflStats`/`dynastySignalBadges`, plus the imported (not copied) `NflStatsTab.COLUMNS`/`OutlookTab.POSITION_STAT_COLUMNS` descriptor maps. Dark-only `--color-dp-*` throughout; does not consume `ProfileDataContext` (gets its data as props from `App.jsx`, mirroring `PlayersSurface`'s call site). Its presentational cells (`CareerBars`/`PlayerCell`/`ClickableRow`/`DeltaCell`/`SortTh`) moved to `dp/cells.jsx` in Slice iv so Portfolio could import rather than fork them |
| `dp/cells.jsx` | 1b Slice iv — shared dp-styled presentational cells, moved out of `Market.jsx`: `SortTh`, `PlayerCell`, `ClickableRow`, `CareerBars` (5-wide 0-padded sparkline, dimensions fixed — do not respec per caller), `DeltaCell` (colored ±N text, extracted from Market's Value/NEXT column). Imported by both `Market.jsx` and `Portfolio.jsx` |
| `dp/MarketTable.jsx` | 1b Slice iii — dp-styled presentational table shell for Market. Mirrors `PlayersDataTable`'s render-prop shape (`header`/`renderRow`/pagination, `PAGE_SIZE=50`) but is a fresh build, not a reuse — `PlayersDataTable`/`SortTh`/`ValueChip` are styled with the old `--color-*` family and shared with `/players`; recoloring them would recolor that surface. Hard-codes the ALL/QB/RB/WR/TE pill row and always renders a pager, so it **cannot** be reused as-is by Portfolio (no pills, no pager) — Portfolio's table shell is inlined in `Portfolio.jsx` instead |
| `dp/PlayerDetailModal.jsx` | 1b Slice ii — player detail overlay hoisted above the router (`App.jsx`'s `detailPlayerId` state), mountable from any surface; reads `usePlayerProfile` + the App-level `ProfileDataContext.Provider`; dark-only `--color-dp-*`; single-player until Slice v adds the tab strip/compare matrix. **Reachable since 1b Slice iii** — Market row click/keyboard calls `openPlayerDetail`; Portfolio's holdings rows do the same since Slice iv. New leaf module `src/utils/dynastySignalBadges.js` (extracted from `PlayersTab.jsx`'s inline badge block) derives its SIGNALS-rail content; Market's Outlook column set is the helper's second consumer, re-applying `OutlookTab`'s `0.95–1.05` age-curve gate locally rather than editing the shared helper |
| `roster/{MyTeamView,PlayerCard,Sparkline}.jsx` | **Dormant, not deleted** (1b Slice i retired the `/roster` route) — left on disk, unimported by `App.jsx`; the `myTeamData` state and its fetch effect that used to feed them were removed from `App.jsx` as dead code. Still exercised (compiled + rendered with hand-built fixtures) by `shell/importIntegrity.test.jsx`, which keeps them honest until a future slice re-wires them |
| `board/Board.jsx`, `trade/Trade.jsx` | Gated placeholders (marginal-value/phase prerequisites); nav labels "Draft board"/"Trade desk" since 1b Slice i |

### src/context/
| File | Responsibility |
|------|----------------|
| `ProfileDataContext.jsx` | Provides `{careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats}` (ten keys). Three provider sites since 1b Slice ii: `PlayersTab.jsx`/`PlayersDataTable.jsx` (both `/players`-scoped, feed the Explorer's inline `PlayerProfile`) and an App-level provider wrapping `<Routes>` in `App.jsx` (feeds `dp/PlayerDetailModal.jsx`, `playerRows` key is `playerRowsWithProj`) — nested providers are harmless, the innermost wins for its subtree |
| `TooltipContext.jsx` | Boolean global tooltip toggle |

### src/hooks/
| File | Responsibility |
|------|----------------|
| `usePlayerProfile.js` | Derives all PlayerProfile rendering data (career history, ranks, comps, peers) from `ProfileDataContext` |
| `usePlayersTable.js` | View-local table UI state shared by the Players → Dynasty table tabs AND, since 1b Slice iii, Market (`posFilter`, `sortState` + `localStorage` persistence under a caller key, `page`, `expanded`, `selectedPlayerId`, handlers, `sortProps`, `setSortState`). One instance per consumer. Owns **view-local** state only — never App.jsx domain/`playerRows`-pipeline state (see *App.jsx owns all state*). `setSortState` (added Slice iii, additive) lets a caller re-assert a specific sort directly — needed because `handleSort` only toggles the current column's direction and can't switch to an arbitrary column/direction pair; Market uses it to re-assert each column set's own default sort when the set switches (`handlePosFilter`'s own reset already follows whatever `defaultSort` the hook was constructed with, which Market re-supplies per active set). |

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
| `seasonRanks.js` | `rankPositionSeason` (per-season positional ranking by league-scored PPG — extracted from `usePlayerProfile`/shared), `buildSeasonPositionRanks` (global ranks + per-rank points reference), `computeCeilingFloor` — pure, **view-only** (Explorer Ceiling/Floor cells); never feeds projection/scoring |
| `sortUtils.js` | `compareNullsLast(va, vb, dir)` — direction-independent null-sink comparator used by all three Players table sort paths (Explorer, Outlook, NFL stats) |
| `ktcHistory.js` | KTC snapshot time-series loader + assembler; used for `ktcHist*` capture factors; `computeKtcRecentDelta` (≈30-day value Δ for the Explorer KTC cell — view-only) |
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
| `nflStats.js` | View-only NFL-stats helpers: `normalizeTeamForSchedule` (Sleeper→nflverse, `LAR→LA`), `computeSeasonAverages` (per-position season averages from counting stats — never the pre-summed rate keys), `buildGameLog` (schedule-joined per-game log + join-sanity guard), `computeHighLow`. Pure; never imported by projection/scoring. |
| `playerTeam.js` | `eraTeam(abbr, season)` (app-side mirror of the data repo's era remap — LA→STL ≤2015, SD/LAC ≤2016, OAK/LV ≤2019; both repos change together on a future franchise move) + `resolvePlayerTeam({careerStats, gameLogPlayers}, playerId, season, week?)` — the SINGLE player→team resolution point, returning ERA-ACCURATE codes (teamcontext/schedule domain). Season grain: `careerStats[season][pid].team` (already era-accurate); week grain: gamelogs `games[].team` (current-franchise domain → era-remapped here). View-only; never feeds projection/scoring (guarded by `teamContextViewOnly.test.js`) |

---

## Invariants

Rules that break things silently if violated.

**Factors contract.** The projection `factors` object is a contract: 73 vet keys / 51 rookie keys, enforced by `src/__tests__/factorsSchema.test.js`. Never add, rename, or remove a `factors` key in `seasonProjection.js` without updating that test.

**Stat-key contract.** Every stat key referenced by projection code must appear with a finite value in `src/__fixtures__/season-totals-2025.json`; enforced by `src/__tests__/statKeysContract.test.js`.

**Fantasy points computed weekly.** Always call `calculateFantasyPoints(weekStats, scoringSettings)` on raw per-week stats. Never sum pre-stored season totals to produce fantasy points.

**React Strict Mode double-fires.** Effects fire twice in dev. Every `async useEffect` that writes state must check a `cancelled` flag before calling the state setter.

**Capture-only factors do not move projectedPPG.** `ktcHist*`, `positionMultiplicity*`, `adot*` (all paths) and the rookie-path `breakoutAgeFactor` are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines. (`breakoutAge`/`breakoutAgeFactor` are still computed and recorded; `breakoutAge` drives the Profile breakout chip.)

**Advstats are display-only.** `src/api/advStats.js` and `src/components/AdvancedStatsPanel.jsx` feed the Player Profile panel only. They must never influence `projectedPPG`, the dynasty score, or any `factors` entry. No projection/scoring module may import them. Enforced by `src/__tests__/advStatsViewOnly.test.js`. Activation is parked — see the "Advstats & Signal Grading — Findings and Open Items" doc.

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

**App.jsx owns all domain/pipeline state** (the `playerRows` pipeline, league/career data) and flows it down as props. Do not move domain state into child components or new hooks, and do not introduce Redux, Zustand, Jotai, or any other state library. (Purely view-local table UI state — position filter, sort, page, expand, selected-profile id — may live in the `usePlayersTable` hook, one independent instance per tab; this is not domain state.) Do not add TypeScript. Do not modify cache TTL values without being asked. Do not refactor working utility functions while implementing a feature.

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
| Adding an Explorer column from a spec | **sonnet** |
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
1. **`playerRows`** — base rows from careerStats + leagueData; calls `computeDynastyScore` per player; adds `positionRank` by currentSeasonPPG
2. **`playerRowsWithKTC`** — merges `ktcValue` from `ktcMap`
3. **`qbQualityByTeam`** — `computeQBQualityByTeam(playerRowsWithKTC, depthMap, true)`; prefers depth-chart QB1; league-wide (includes un-rostered QBs). A sibling memo `qbQualityByTeamRostered` (legacy rostered-only) feeds projection Step 7b — intentional divergence until the projection swap clears its backtest (see docs/projection.md → Step 7b).
4. **`playerRowsWithQBMod`** — applies QB quality modifier to WR/TE/RB `opportunityQuality` component (15% weight)
5. **`playerRowsFinal`** — `computeMarketDivergence(playerRowsWithQBMod)`; adds `divergenceSignal`, `dynRank`, `ktcRank`
6. **`playerRanks`** — `computePositionalRanks(playerRowsFinal, careerStats, currentSeason)` → `Map<player_id, ranks>`
7. **`playerRowsWithRanks`** — merges `recentRank`, `peakRank`, `consistencyRank`, `dynastyRank`, `rankMovement`, `movementLabel`

`playerRowsWithRanks` is passed to `<PlayersTab>`.

Also upstream: `depthMap` (from `leagueData.playerMap[id].depth_chart_order`), `empiricalCurves` + `positionPeakPPG` + `positionPeakAge` (from `computeEmpiricalAgeCurves`), `historicalTeamTotals` + `historicalShares` (per-season-team; feed the projection and `computeRoleRanks`) + `historicalTeamTotalsCurrentTeam` + `historicalSharesCurrentTeam` (current-team-pinned; feed only the `computeDynastyScore` share-trend boost — R2 hold); `teamContext` is current-team-pinned.

---

## Patterns

### Caching (cache.js + IndexedDB)
- `getCache(key)` returns data or `null` (null on miss or TTL expiry)
- `setCache(key, value, ttlMinutes)` — default TTL 60 min; keys containing "players" default to 1440 min
- Pass TTL explicitly to make intent clear (see `sleeper.js`). Per-function TTLs, stale-cache invalidation, and the nflverse-via-data-store path: [docs/integrations.md](docs/integrations.md).

### Component data access (two patterns)
1. **Props from App.jsx**: `StandingsTable`, `ScheduleGrid`, `RostersTab`, `MyTeamView`, `PlayersTab` — all props-only, no context reads
2. **ProfileDataContext**: any `usePlayerProfile` consumer reads the ten-key value (see `src/context/` table above) via `useContext`. Two provider sites are `/players`-scoped (`PlayersTab.jsx` wrapping the Explorer's `PlayerProfile`, `PlayersDataTable.jsx` wrapping Outlook/NFL-stats' shared panel); since 1b Slice ii a third, App-level provider wraps `<Routes>` in `App.jsx` itself, feeding `dp/PlayerDetailModal.jsx` so the pop-up is mountable from any route, not just `/players`
