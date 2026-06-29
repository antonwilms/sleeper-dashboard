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

HashRouter (`react-router-dom`). Four primary surfaces + secondary League group:

| Path | Surface |
|---|---|
| `/` | → redirects to `DEFAULT_ROUTE` (`/players`) |
| `/board` | Board (gated placeholder — marginal-value engine + season-phase classifier) |
| `/roster` | Roster / My Team |
| `/players` | Player Explorer |
| `/trade` | Trade (gated placeholder — marginal-/phase-aware trade evaluator) |
| `/league` | → redirects to `/league/standings` |
| `/league/:view` | League group (standings / schedule / rosters) |
| `*` | → redirects to `DEFAULT_ROUTE` |

The **Players** surface (`/players`) hosts a two-level intra-surface tab shell — primary **Dynasty** | **Weekly**, with Dynasty sub-tabs **Value** | **Outlook** | **NFL stats** — persisted to `localStorage` (`players-view`, `players-dynasty-tab`); **Value** renders the Explorer (`PlayersTab`); Outlook is a projection/usage-trend table (`OutlookTab`), NFL stats is a placeholder, Weekly is gated. These are **not** nav-shell entries — `navItems.js` is unchanged. See `src/components/players/PlayersSurface.jsx`.

Nav chrome: desktop left rail (`NavRail`) + mobile bottom tab bar (`BottomTabBar`); four primary items always; seasonal **Rookies** item Jan–May only (hidden offseason). League group reached via "League" link in the rail/top bar. `DEFAULT_ROUTE=/players` until the Board lands (slice 7 flips it). See `src/components/shell/navItems.js`.

### src/
| File | Responsibility |
|------|----------------|
| `main.jsx` | Entry point — renders `<App>` in StrictMode |
| `App.jsx` | Root component; owns all state; builds playerRows pipeline; renders the router + nav shell (`components/shell/AppShell`) and injects pipeline outputs into routed surfaces |
| `constants.js` | Shared constant `POSITION_ORDER` |
| `theme.js` | Theme load/persist/apply helpers (`loadStoredTheme` default-dark, `persistTheme`, `applyThemeClass`); localStorage-helper pattern, not state |

> **Color tokens:** `src/index.css` `@theme` is the color source of truth — neutral/surface role tokens + chromatic primitives (`--c-{hue}-{shade}`) + semantic aliases (accent/positive/negative/warning/caution/market/confidence/chart/phase), each with light + dark values. `--color-canvas` is the page ground (painted on `body`); `--color-surface…surface-5` are the cards/panels/fills that layer above it (light = warm, surface lifts above canvas; dark = cool near-black, lighter-as-higher). Components consume tokens (`bg-[var(--…)]`), never raw palette classes. Every new token must include a `.dark` override value.

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

### src/components/
| File | Responsibility |
|------|----------------|
| `PlayersTab.jsx` | Player Explorer table, FilterSidebar, PlayerProfile panel, ComparisonTray. Rendered as the Players → Dynasty → Value tab (mounted by PlayersSurface). Value tab adds display-only Ceiling/Floor career-finish cells (`seasonRanks.js`) and a ~30-day KTC Δ (`ktcHistory.computeKtcRecentDelta`). (`PlayerProfile`, `SortTh`, `projectionConfidenceClass` now exported for the Outlook tab) Explorer adds a Consistency column + a Recent-cell fallback-season flag (`recentRankSeason`) + an inline `ExpandableTableRow` row-expand reusing `ui/RankingsRow.jsx`. |
| `players/PlayersSurface.jsx` | Players-surface tab shell: Dynasty {Value\|Outlook\|NFL stats} \| Weekly; owns localStorage-persisted tab state (players-view, players-dynasty-tab); forwards all props to PlayersTab on the Value tab. Route element for /players. |
| `players/OutlookTab.jsx` | Players → Dynasty → Outlook table: next-season projection columns (Proj · Δ vs now · Proj G · Signals) + scoring-consistency (PPG ± SD) + the existing snap/opp/role usage trends, with an expandable panel (adjustment narrative · per-season distribution · usage history). Display-only. Reuses `dynastyScore.signals` (same flags as the Profile Dynasty badges), `seasonProjections` (`projectedGames`/`adjustmentSummary`), `currentSeasonPPG` (same PPG as the Value tab), `outlookUsage.js`, and `outlookConsistency.js`. Shared `usePlayersTable`/`PlayersDataTable`. |
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
| `shell/AppShell.jsx` | App frame: always-on `TopBar` + (post-league) desktop `NavRail` / mobile `BottomTabBar` + content area; pure chrome, owns no state |
| `shell/navItems.js` | Nav config: `PRIMARY_NAV`, `LEAGUE_NAV`, `ROOKIES_NAV`, `DEFAULT_ROUTE`, `isRookieSeason()` |
| `shell/{TopBar,NavRail,BottomTabBar,CareerLoadProgressBar,ClearCacheButton,ExportDataButton}.jsx` | Shell chrome + extracted header/progress/utility components |
| `league/{LeagueView,StandingsTable,ScheduleGrid,RostersTab,SlotBadge}.jsx` | Secondary "League" group surfaces (extracted) |
| `roster/{MyTeamView,PlayerCard,Sparkline}.jsx` | Roster surface (extracted My Team) |
| `board/Board.jsx`, `trade/Trade.jsx` | Gated placeholders (marginal-value/phase prerequisites) |

### src/context/
| File | Responsibility |
|------|----------------|
| `ProfileDataContext.jsx` | Provides `{careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections}` to `PlayerProfile` |
| `TooltipContext.jsx` | Boolean global tooltip toggle |

### src/hooks/
| File | Responsibility |
|------|----------------|
| `usePlayerProfile.js` | Derives all PlayerProfile rendering data (career history, ranks, comps, peers) from `ProfileDataContext` |
| `usePlayersTable.js` | View-local table UI state shared by the Players → Dynasty table tabs (`posFilter`, `sortState` + `localStorage` persistence under a caller key, `page`, `expanded`, `selectedPlayerId`, handlers, `sortProps`). One instance per tab. Owns **view-local** state only — never App.jsx domain/`playerRows`-pipeline state (see *App.jsx owns all state*). |

### src/utils/
| File | Responsibility |
|------|----------------|
| `cache.js` | IndexedDB cache via `idb`; `getCache / setCache / clearCache / listCacheRecords`; TTL in minutes |
| `fantasyPoints.js` | `calculateFantasyPoints(stats, scoringSettings)` dot-product; `getPointsBreakdown` for debug |
| `ageCurve.js` | `interpolateAgeCurve()` — pure age-curve interpolation lookup; leaf module (imports nothing). Extracted from `dynastyScore.js` to break the `dynastyScore ↔ projectionSignals` cycle |
| `dynastyScore.js` | `computeEmpiricalAgeCurves`, `computeDynastyScore`, `computeProspectScore`, `computePositionalRanks`, `computeRoleRanks`, `computeMarketDivergence`, `computeKTCPositionPercentile` — read in full before touching; imports `momentum.js`, `regressionSignals.js`, `projectionSignals.js`, `ageCurve.js` |
| `seasonProjection.js` | `computeNextSeasonProjection()` — 13-step vet pipeline (10 `combinedNewFactor` signals) + comp blend + rookie path |
| `careerComps.js` | `buildCareerArcVector`, `findCareerComps`, `compsProjectedPPG` — session-cached in module-level Map |
| `teamContext.js` | `computeTeamContext`, `computeQBQualityByTeam`, `computeHistoricalTeamTotals` (also aggregates RZ denominators: `rushRz`/`recRz`), `computeHistoricalShares`, `computeShareTrend`, `buildTeamDepthChart`, `applyQBQualityModifier` (QB-quality OQ modifier — extracted from App.jsx for testability) |
| `teamRzShare.js` | `computeTeamRzShareFactor()` — team-aggregated red-zone share factor (D3); cohort-percentile + shrinkage, ±5%, QB gated out |
| `ktcMatch.js` | `matchKTCToSleeper()` — name+position/team fuzzy matching |
| `seasonRanks.js` | `rankPositionSeason` (per-season positional ranking by league-scored PPG — extracted from `usePlayerProfile`/shared), `buildSeasonPositionRanks` (global ranks + per-rank points reference), `computeCeilingFloor` — pure, **view-only** (Explorer Ceiling/Floor cells); never feeds projection/scoring |
| `sortUtils.js` | `compareNullsLast(va, vb, dir)` — direction-independent null-sink comparator used by all three Players table sort paths (Explorer, Outlook, NFL stats) |
| `ktcHistory.js` | KTC snapshot time-series loader + assembler; used for `ktcHist*` capture factors; `computeKtcRecentDelta` (≈30-day value Δ for the Explorer KTC cell — view-only) |
| `projectionSignals.js` | `computeBreakoutFlag`, `computeBounceBackFlag`, `computeTdReliance` — shared signal helpers imported by both `seasonProjection.js` (Step 5c) and `dynastyScore.js`; imports `interpolateAgeCurve` from `ageCurve.js` and `classifyInjurySeason` from `durabilitySignals.js` (bounce-back down-year detection) |
| `durabilitySignals.js` | `wasContributorSeason`, `classifyInjurySeason` — shared durability helpers imported by `dynastyScore.js`, `seasonProjection.js`, and `projectionSignals.js`. Contributor-evidence thresholds + adjacent-season rescue: see docs/projection.md (Step 6) and docs/signal-registry.md (Durability). |
| `projectionSnapshot.js` | Snapshot and load ephemeral projection inputs (team, depth, status, KTC); ~2yr TTL |
| `compsIntegration.js` | `computeCompBlend()` — confidence-weighted career-comp ensemble blend (Step 9) |
| `efficiencyMetrics.js` | `computeEfficiencyFactor()` — per-opportunity efficiency composite (Step 5e) |
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
| `outlookUsage.js` | `buildUsageHistory`, `computeUsageTrend`, `buildRoleCohort`, `classifyRole` — view-only Outlook usage derivations (per-season snap%/share history, latest-vs-prior trends, cohort-tertile role note). Reuses `historicalShares`; never feeds projection/scoring. |
| `nflStats.js` | View-only NFL-stats helpers: `normalizeTeamForSchedule` (Sleeper→nflverse, `LAR→LA`), `computeSeasonAverages` (per-position season averages from counting stats — never the pre-summed rate keys), `buildGameLog` (schedule-joined per-game log + join-sanity guard), `computeHighLow`. Pure; never imported by projection/scoring. |

---

## Invariants

Rules that break things silently if violated.

**Factors contract.** The projection `factors` object is a contract: 73 vet keys / 51 rookie keys, enforced by `src/__tests__/factorsSchema.test.js`. Never add, rename, or remove a `factors` key in `seasonProjection.js` without updating that test.

**Stat-key contract.** Every stat key referenced by projection code must appear with a finite value in `src/__fixtures__/season-totals-2025.json`; enforced by `src/__tests__/statKeysContract.test.js`.

**Fantasy points computed weekly.** Always call `calculateFantasyPoints(weekStats, scoringSettings)` on raw per-week stats. Never sum pre-stored season totals to produce fantasy points.

**React Strict Mode double-fires.** Effects fire twice in dev. Every `async useEffect` that writes state must check a `cancelled` flag before calling the state setter.

**Capture-only factors do not move projectedPPG.** `ktcHist*`, `positionMultiplicity*`, `adot*` (all paths) and the rookie-path `breakoutAgeFactor` are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines. (`breakoutAge`/`breakoutAgeFactor` are still computed and recorded; `breakoutAge` drives the Profile breakout chip.)

**Advstats are display-only.** `src/api/advStats.js` and `src/components/AdvancedStatsPanel.jsx` feed the Player Profile panel only. They must never influence `projectedPPG`, the dynasty score, or any `factors` entry. No projection/scoring module may import them. Enforced by `src/__tests__/advStatsViewOnly.test.js`. Activation is parked — see the "Advstats & Signal Grading — Findings and Open Items" doc.

**Intentional divergence: dynastyScore.js vs seasonProjection.js.** `dynastyScore.js` uses the per-league rookie-pick proxy for dynasty value; `seasonProjection.js` uses the actual NFL draft slot (`nflDraft.js`). Do not unify unless explicitly asked.

**Ephemeral inputs must be snapshotted contemporaneously.** NFL team, `depth_chart_order`, player status, KTC value, and any Vegas/injury/coaching/scheme signals cannot be reconstructed later. Use `projectionSnapshot.js` to capture them at observation time. See docs/integrations.md → "Projection snapshots" and "Data store integration".

**App.jsx owns all domain/pipeline state** (the `playerRows` pipeline, league/career data) and flows it down as props. Do not move domain state into child components or new hooks, and do not introduce Redux, Zustand, Jotai, or any other state library. (Purely view-local table UI state — position filter, sort, page, expand, selected-profile id — may live in the `usePlayersTable` hook, one independent instance per tab; this is not domain state.) Do not add TypeScript. Do not modify cache TTL values without being asked. Do not refactor working utility functions while implementing a feature.

**playerRows pipeline order is load-bearing.** Trace the full pipeline (section below) before changing any step — each step depends on the previous one's output shape.

### Cross-repo contracts (with sleeper-dashboard-data)

This repo cannot edit the data repo. Any change affecting these contracts **must be called out in the task summary** so `sleeper-dashboard-data` can be updated to match.

- **Snapshot shape:** `src/utils/projectionSnapshot.js` writes `projection-snapshots/<date>`; `classifyKey` in `src/utils/exportData.js` routes it to `snapshots/<date>.json` for the data repo. The `projection` field is verbatim `computeNextSeasonProjection` output — changing the `factors` object or projection shape changes the exported snapshot. As of snapshot `schemaVersion: 2`, the envelope also carries top-level `targetSeason`, `currentSeason`, and verbatim `scoringSettings`; bumping the snapshot schema requires mirroring the data repo's README snapshot section and `scripts/register-snapshots.mjs` expectations. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals). The `projection.factors` object now includes `isTeamChange`/`prevTeam`/`newTeam`/`depthStale` (additive, no `schemaVersion` bump; rookie path omits `depthStale`).
- **season-totals schemaVersion:** `src/api/dataStore.js` advertises `MAX_SUPPORTED_SCHEMA=3` and re-fetches v1 cache entries lacking `weeklyStatus`; the data repo writes v3 (v3 adds an additive per-season `team`, consumed view-only by the NFL-stats game log). v1/v2 files still load (validator + additive consumption). Coordinate any version bump.
- **Enrichment schemas:** `src/api/enrichment.js` (`loadEnrichment`) and `src/utils/enrichmentLookup.js` read `enrichment/*.json` authored and validated in the data repo. Any field change must be mirrored there.
- **Manifest contract:** `dataStore.js` (`getManifestEntry` + validators) depends on the data repo's manifest field names and shape. Treat them as a public API.
- **CFBD pivot:** `src/api/cfbd.js` `pivotStatRows` depends on the confirmed CFBD `statType` sets the data repo stores. Adding or removing a stat type must be coordinated.
- **nflverse roster/draft:** `src/api/nflRoster.js` reads `nflverse/roster/<year>.json` and `src/api/nflDraft.js` reads `nflverse/draft/draft_picks.json`; both produced by the data repo (`bin/update.mjs roster` / `bin/update.mjs draft`). The served JSON shapes (`players` keyed by `sleeper_id`, `rowCount`, `picksByYear`) and the `MIN_ROSTER_IDS = 1500` sparsity gate are the contract. Changing either shape must be coordinated with the loaders.
- **nflverse advstats (view-only):** `src/api/advStats.js` reads `nflverse/advstats/<year>.json`, produced by the data repo (Phase 1a). The served shape (`players` keyed by `sleeper_id`; per-player `targetShare`/`airYardsShare`/`wopr`/`racr`/`components`; `rowCount`; `schemaVersion: 1`; `inProgress: false`) and the `MIN_ADVSTATS_ROWS = 250` sparsity gate are the contract, re-asserted in `advStats.js`. This is the app side of an already-shipped data-repo contract — display-only, not wired into projection. Changing the served shape must be coordinated with the loader.
- **nflverse schedule (read-only):** `src/api/nflSchedule.js` reads `nflverse/schedule/<year>.json`, produced by the data repo (`scripts/update-schedule.mjs` ← nflverse `nfldata` `games.csv`). The served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, games[] }`; each game's 15 fields `gameId`/`season`/`week`/`gameType`/`homeTeam`/`awayTeam`/`homeScore`/`awayScore`/`result`/`spreadLine`/`totalLine`/`roof`/`surface`/`temp`/`wind`; null `homeScore`/`awayScore`/`result`/`temp`/`wind` and `result === 0` tie are valid) and the shared **`MIN_SCHEDULE_GAMES = 200`** sparsity floor are the contract, re-asserted app-side in `dataStore.js` (`isValidSchedule`) and `nflSchedule.js`. This is the app side of an already-shipped data-repo contract — read-only, not wired into projection/scoring. Changing the served shape or the shared floor must be coordinated (both repos change together). The app-side consumer is `NflStatsTab` (game log); the join uses the **per-season `team`** from season-totals v3 (degrading to `—` when absent/`null`) — the former current-team gap is closed.
- **nflverse gamelogs (view-only):** `src/api/nflGameLogs.js` reads `nflverse/gamelogs/<year>.json`, produced by the data repo (live on the CDN for 2012–2024; **2019 absent upstream** — a known gap, degrades to the empty shape). The served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id` → `{ gsisId, name, position, games[] }`; each game `{ week, seasonType, team, opponent, …sparse per-game stats }` — absent stat key ⇒ null, present `0` is a real zero; per-game rate fields `racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe` are single-game values, never summed; `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring, never reconciled with `src/utils/fantasyPoints.js`) and the shared **`MIN_PLAYERGAME_ROWS = 3000`** sparsity floor are the contract, re-asserted app-side in `dataStore.js` (`isValidGameLogs`) and `nflGameLogs.js`. This is the app side of an already-shipped data-repo contract — view-only, not wired into projection/scoring (guarded by `gameLogsViewOnly.test.js`), no UI/pipeline consumer this slice. Changing the served shape or the shared floor must be coordinated (both repos change together).

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

Features use a two-session flow: **opus plans**, **sonnet implements**.

- Opus session: read relevant code, decide signatures and data shapes, write `.claude/tasks/<feature>.md`. **Do not edit any source files.** End the session.
- Sonnet session: read the task file first, implement exactly what it specifies, run the build. If something is ambiguous or contradicts existing code, stop and ask — do not guess.
- **Visual verification is the user's job.** Claude Code must NOT start the dev server (`npm run dev` / `npm run preview`) or run any browser/visual/smoke test. Validate with `npm test` / `npm run lint` / `npm run build` only, then hand back for the user's manual smoke. This is especially load-bearing for theming/palette work, whose acceptance is the user's eyes in light **and** dark.

The task file is the handoff artifact, not chat history. A planning session that edits source has broken the handoff.

Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2.

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

**Sibling repo:** `sleeper-dashboard-data` — the data store this app consumes via jsDelivr and writes snapshots into. See [Cross-repo contracts](#cross-repo-contracts-with-sleeper-dashboard-data).

---

## Self-maintenance

Keep this file current as part of every task's done-definition. If a change adds/renames/removes a `src/` module, changes a command in `package.json`, alters a documented invariant or the factors contract, or changes a data shape referenced here, update the relevant CLAUDE.md section in the **same change**. Keep this file thin — it is a navigation-and-rules layer, not a second README. Push deep detail into the relevant `docs/` file and link to it rather than duplicating it here. If a change adds, removes, or reclassifies a signal/factor — a raw source, a computed `factors` entry, an ephemeral capture, or its historical coverage or reconstructable-vs-ephemeral status — update the canonical signal registry (`docs/signal-registry.md`) in the same change.

If a change affects a Cross-repo contract, state it explicitly in your task summary so `sleeper-dashboard-data` can be updated to match.

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

Also upstream: `depthMap` (from `leagueData.playerMap[id].depth_chart_order`), `empiricalCurves` + `positionPeakPPG` + `positionPeakAge` (from `computeEmpiricalAgeCurves`), `teamContext`, `historicalTeamTotals` + `historicalShares` (from `computeHistoricalTeamTotals` / `computeHistoricalShares`; used both in `computeDynastyScore` share trend boost and in `computeRoleRanks`).

---

## Patterns

### Caching (cache.js + IndexedDB)
- `getCache(key)` returns data or `null` (null on miss or TTL expiry)
- `setCache(key, value, ttlMinutes)` — default TTL 60 min; keys containing "players" default to 1440 min
- Pass TTL explicitly to make intent clear (see `sleeper.js`). Per-function TTLs, stale-cache invalidation, and the nflverse-via-data-store path: [docs/integrations.md](docs/integrations.md).

### Component data access (two patterns)
1. **Props from App.jsx**: `StandingsTable`, `ScheduleGrid`, `RostersTab`, `MyTeamView`, `PlayersTab` — all props-only, no context reads
2. **ProfileDataContext**: `PlayersTab` wraps `PlayerProfile` in `<ProfileDataContext.Provider>`; `PlayerProfile` and `usePlayerProfile` read `{careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections}` via `useContext`
