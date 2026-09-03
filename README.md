# Sleeper Dashboard

Personal dynasty fantasy football analysis dashboard built on the [Sleeper API](https://docs.sleeper.com/).
No backend — all data is fetched client-side and cached in IndexedDB.

## Tech stack

- **Vite + React** (JavaScript, no TypeScript)
- **Tailwind CSS v4** via `@tailwindcss/vite`; design tokens, dark-only, via `@theme` (no CSS-in-JS, no theme provider)
- **idb** — IndexedDB wrapper for the cache layer
- **Sleeper API** — read-only, no auth required
- **KeepTradeCut** — fetched via CORS proxy, parsed from server-rendered HTML
- **College Football Data API (CFBD)** — bulk player stats 2017–present (window tracks the current-season anchor); requires `VITE_CFBD_API_KEY` in `.env.local`
- **nflverse** — draft picks CSV and current-season roster CSV (release assets); `sleeper_id` column enables direct joins; permanent per-year IndexedDB cache
- **react-router-dom** — client-side routing (HashRouter; no server rewrite needed)
- **Inter (variable)** — self-hosted via @fontsource-variable/inter; tabular figures enabled globally for aligned numerics

## Theming

Dark-only (dp-v2 Slice 0) — there is no toggle. All components are token-driven (`src/index.css @theme`); never add hardcoded Tailwind color classes — map to a token.

## Running locally

```bash
npm install
npm run dev
```

Create a `.env.local` file at the project root:
```
VITE_CFBD_API_KEY=your_key_here
VITE_DATA_STORE_URL=https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main
```

Replace `<owner>` with the GitHub account hosting `sleeper-dashboard-data`. If unset or left as a placeholder, the app runs API-only and the ~7-minute live career load is not avoided.

Open `http://localhost:5173`, enter your Sleeper username, and select a league. On return visits the app loads straight into your last league — no re-entry needed.

---

## Testing

Tests use [Vitest](https://vitest.dev). Run the suite once:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

UI:

```bash
npm run test:ui
```

Test files live next to the modules they cover (`src/utils/foo.js` → `src/utils/foo.test.js`). Cross-cutting tests live in `src/__tests__/`. Shared fixture factories live in `src/__fixtures__/factories.js`.

### The captured season-totals fixture

`src/__fixtures__/season-totals-2025.json` is a snapshot of the Sleeper season-totals response for 2025, committed to the repository. It is a flat object `{ [player_id]: { stats, gamesPlayed, … } }` with no envelope wrapper. The stat-key contract test (`src/__tests__/statKeysContract.test.js`) reads this fixture and asserts that every stat key referenced by projection code appears with a finite numeric value in at least one player row. Update the fixture when a new season's data becomes authoritative.

### Adding integration tests

End-to-end tests for `computeNextSeasonProjection` live in `src/utils/seasonProjection.test.js` and use the factory helpers in `src/__fixtures__/factories.js`. To add a new scenario:

1. Pick a unique player ID (e.g. `'P_MY_SCENARIO'`) — the `compsCache` in `careerComps.js` is keyed by player ID and persists across tests in the same run.
2. Call `makeVet({ playerId: 'P_MY_SCENARIO', ...overrides })` or `makeRookie(...)` and spread `.asArgs()` into `computeNextSeasonProjection`.
3. Override only the inputs relevant to your scenario; defaults produce a stable 5-season RB at neutral efficiency.

### Scope

The suite covers **pure utility helpers**, the **projection schema contract** (all 73 vet / 51 rookie factors keys), the **stat-key contract** (fixture coverage), and **`computeNextSeasonProjection` end-to-end** (vet and rookie integration tests). It does **not** cover App.jsx pipeline integration, React components, IndexedDB I/O, or live API behaviour. Manual smoke-testing the running app remains necessary. Modules that touch browser APIs (`cache.js`, any module that calls `openDB`) are mocked with `vi.mock()` wherever they appear as transitive imports. The Vitest environment is `node` (not jsdom). The QB-quality OQ modifier math is covered: it lives in `applyQBQualityModifier` (`teamContext.js`, extracted from the `playerRowsWithQBMod` memo) with unit tests; only the memo's `.map` wiring remains smoke-only.

- D1 NFL draft slot: `src/api/nflDraft.test.js`, `src/utils/nflDraftMatch.test.js`, rookie integration cases in `src/utils/seasonProjection.test.js`.

---

## Project structure

```
src/
  constants.js          # Shared constant: POSITION_ORDER
  api/
    sleeper.js          # Official Sleeper API calls (api.sleeper.app/v1)
    sleeperStats.js     # Undocumented stats/projections endpoints (api.sleeper.com)
    ktc.js              # KeepTradeCut dynasty values (DOM extraction + pagination)
    cfbd.js             # College Football Data API — bulk player stats by year/category
    nflDraft.js         # nflverse draft-picks CSV loader; per-year IndexedDB cache; permanent TTL
    nflRoster.js        # nflverse current-season roster loader (release-asset CSV); sleeper_id-keyed active-roster Set; per-year permanent cache; graceful fallback
    advStats.js         # nflverse advanced stats loader (view-only); sleeper_id-keyed; per-year permanent cache; MIN_ADVSTATS_ROWS gate; graceful fallback
    nflSchedule.js      # nflverse NFL schedule/results/lines loader (read-only); explicit-season loadNflSchedule(year); MIN_SCHEDULE_GAMES=200 floor; per-year permanent cache; graceful empty shape
    nflGameLogs.js      # nflverse per-game player stats loader (view-only); explicit-season loadNflGameLogs(year); MIN_PLAYERGAME_ROWS=3000 floor; per-year permanent cache; pass-through; graceful empty shape
    teamContext.js      # nflverse team-context pack loader (view-only); first TEAM-keyed family — (team, week) rows; explicit-season loadTeamContext(year); MIN_TEAMCONTEXT_ROWS=60 floor; per-year permanent cache; graceful empty shape
  components/
    shell/
      AppShell.jsx      # App frame: always-on TopBar + (post-league) NavRail / BottomTabBar + content area; pure chrome
      TopBar.jsx        # Sticky header — avatar, league name, Switch, global ⌘K player search
      NavRail.jsx       # Desktop left-rail nav (md+); four primary + League + seasonal Rookies
      BottomTabBar.jsx  # Mobile bottom tab bar (md:hidden); four primary + seasonal Rookies
      navItems.js       # PRIMARY_NAV, LEAGUE_NAV, ROOKIES_NAV, DEFAULT_ROUTE, isRookieSeason()
      CareerLoadProgressBar.jsx # Fixed bottom overlay during career-history background load
      ClearCacheButton.jsx      # IndexedDB cache clear buttons (confirm-on-click)
      ExportDataButton.jsx      # ZIP export of all cached data
    league/
      LeagueView.jsx    # Segmented control + sub-view switcher for /league/:view
      StandingsTable.jsx # League standings table
      ScheduleGrid.jsx  # Weekly matchup grid
      RostersTab.jsx    # All-roster view grouped by position
      SlotBadge.jsx     # Starter / Bench / IR badge
    roster/
      MyTeamView.jsx    # Roster surface (My Team) — current-week + next-season projections
      PlayerCard.jsx    # Per-player card with projection line
      Sparkline.jsx     # 4-bar trend sparkline SVG
    board/
      Board.jsx         # Gated placeholder (marginal-value engine + season-phase classifier)
    trade/
      Trade.jsx         # Gated placeholder (marginal-/phase-aware trade evaluator)
    market/
      Market.jsx        # Real Market table over playerRowsWithProj — Value/Outlook/Production column-set switch, filters, free-text search, saved presets, sort, pagination
      FilterBar.jsx     # Active-filter pills, free-text filter, "+ Add filter", saved presets, "Reset all"
      FilterPanel.jsx   # Expandable filter grid (dp tokens)
      columnDescriptors.js  # COLUMNS / POSITION_STAT_COLUMNS descriptor maps for the Outlook/Production column sets
    portfolio/
      Portfolio.jsx     # Real Portfolio screen — metric tiles, value-by-age-band chart, holdings table (scoped to owned rows)
    dp/
      PlayerDetailTabs.jsx   # Player-detail pop-up shell — scrim, tab strip (up to 4 open), compare matrix, "+ Add player to compare"
      PlayerDetailModal.jsx  # Pop-up body for one open tab — identity/tiles/chart/drivers/right rail
      MarketTable.jsx   # dp-styled presentational table shell for Market
      cells.jsx         # Shared dp-styled presentational cells (SortTh, PlayerCell, ClickableRow, CareerBars, DeltaCell)
      CoveragePips.jsx  # Three-pip coverage indicator (band or raw count); no colour ever
      SeriesBars.jsx    # Arbitrary-length min-max-normalised bar series (scaled/signed modes); never pads
      TrendCell.jsx     # Series + signed delta + window label primitive, three geometries
      DefinitionPopover.jsx  # Click-triggered (never hover) definition popover with percentile strip
      DegradedBlock.jsx # The five degraded-data kinds; never a call to action
  context/
    ProfileDataContext.jsx  # Provides careerStats/playersMap/playerRows/positionPeakPPG/ktcMap/historicalShares/collegeStats/seasonProjections/enrichmentMap/advStats; one provider site (App.jsx, wraps <Routes>) since 1b Slice viii retired the Explorer's two /players-scoped sites
  hooks/
    usePlayerProfile.js    # All profile panel data computation — pure hook, no rendering
    usePlayersTable.js     # View-local table state (pos filter, sort+persistence, page, expand, selected) shared by Market and Portfolio
  utils/
    cache.js            # IndexedDB cache with TTL via idb
    fantasyPoints.js    # calculateFantasyPoints(), getPointsBreakdown()
    dynastyScore.js     # computeEmpiricalAgeCurves(), computeDynastyScore(), computeProspectScore(),
                        # computePositionalRanks(), computeRoleRanks(), computeMarketDivergence()
    careerComps.js      # findCareerComps(), buildCareerArcVector(), computeArcSimilarity(), compsProjectedPPG()
    ktcMatch.js         # matchKTCToSleeper() — name+position matching, dual-format support
    teamContext.js      # computeTeamContext(), computeQBQualityByTeam(),
                        # computeHistoricalTeamTotals(), computeHistoricalShares(), computeShareTrend(),
                        # buildTeamDepthChart(), applyQBQualityModifier()
    collegeMatch.js     # matchCollegeToSleeper() — name+college fuzzy match from CFBD to Sleeper IDs
    collegeMetrics.js   # computeCollegeMetrics() — dominator rating, breakout age, production trend
    nflDraftMatch.js    # matchNflDraftToSleeper() — name+college matching from nflverse draft picks to Sleeper player IDs; reuses normalisation helpers from collegeMatch.js
    relevance.js        # isRelevantPlayer, playedRecently, rosterStatusOf — pure candidate-pool relevance gate (extracted from App.jsx); roster-absence tightens the stale-team+KTC rule
    momentum.js         # computeMomentum() — multi-season PPG momentum signal (shared helper)
    projectionSignals.js # computeBreakoutFlag / computeBounceBackFlag / computeTdReliance — vet projection signals (ported from dynastyScore)
    compsIntegration.js  # computeCompBlend() — confidence-weighted career-comp ensemble blend (Step 9)
    efficiencyMetrics.js # computeEfficiencyFactor() — per-opportunity efficiency composite (Step 5e)
    seasonProjection.js # computeNextSeasonProjection() — 17-factor veteran pipeline + career-comp ensemble blend + rookie path
    seasonRanks.js      # rankPositionSeason / buildSeasonPositionRanks / computeCeilingFloor — per-season positional ranks + Ceiling/Floor (view-only)
    outlookConsistency.js  # extractGamePoints / computeSeasonConsistency / computeConsistency —
                        # view-only per-game scoring distribution (pooled mean / population SD / CV / boom-bust)
    outlookUsage.js     # buildUsageHistory / computeUsageTrend / buildRoleCohort / classifyRole — view-only Outlook usage derivations
    outlookPositionStats.js  # view-only Outlook position-stat derivations (per-pill trend-over-level columns)
    nflStats.js         # normalizeTeamForSchedule / computeSeasonAverages — view-only NFL-stats helpers (pure, never feeds projection/scoring)
    playerTeam.js       # eraTeam + resolvePlayerTeam — single player→team resolution point (era-accurate codes; view-only, never feeds projection/scoring)
  App.jsx               # All UI state; orchestrates the pipeline; renders the router + nav shell
```

---

## Documentation

Deep behavioural docs live in [`docs/`](docs/). Each maps to one unit of
planning work — pair it with the named module when making a change.

- [docs/navigation.md](docs/navigation.md) — the navigation map: routing/IA, and one row per
  module in `src/` giving its responsibility, data shapes, gates and floors, and the invariant or
  `CR-NN` contract it is bound by. Read before locating any file.
- [docs/dynasty-decision-engine-design.md](docs/dynasty-decision-engine-design.md) — product /
  ideal framework: the six surfaces (Board, Roster, Players, Trade, Rookies, Explore), the
  marginal-value thesis, metrics display tiers, and the Ideal-vs-Current gap. The "what."
- [docs/dynasty-frontend-ux-design.md](docs/dynasty-frontend-ux-design.md) — frontend & UX strategy:
  the value chip, the peek, nav/IA, visual language (dark-first, tabular figures), and the
  rejected-patterns list. The "how it looks and behaves." See also
  [.claude/tasks/frontend-overhaul.md](.claude/tasks/frontend-overhaul.md) for the migration plan.
- [docs/architecture.md](docs/architecture.md) — App.jsx state, `leagueData`
  shape & assembly, the playerRows pipeline and player-row shape, player-ID
  sources, the `isRelevantPlayer` filter, positional & role ranks, Vite config,
  Sleeper API notes, React Strict Mode.
- [docs/projection.md](docs/projection.md) — Next-season projections (the 13-step
  veteran pipeline, comp-blend, rookie path, capture-only factors) and career
  comparables.
- [docs/dynasty-scoring.md](docs/dynasty-scoring.md) — Empirical age curves and
  dynasty scoring (routing, prospect & component scores, labels, special
  signals, late-career/depth gates).
- [docs/integrations.md](docs/integrations.md) — Sleeper stats & career-history
  loader, KTC (fetch/parse/match/history), CFBD, nflverse draft, nflverse advstats
  (view-only), data-store integration, enrichment overlay, cache, projection
  snapshots, and the API-layer tables.
- [docs/ui.md](docs/ui.md) — Market (column sets, filters, free-text search,
  saved presets), Portfolio, the player-detail pop-up, team depth chart, the
  color token system, and the Features/navigation overview.
- [docs/signal-registry.md](docs/signal-registry.md) — canonical signal/feature registry:
  every raw source, computed factor, and ephemeral capture classified by layer, source,
  historical coverage, reconstructable-vs-ephemeral status, and current use. The
  inventory that governs snapshot-capture and grading-inclusion decisions.
