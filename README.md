# Sleeper Dashboard

Personal dynasty fantasy football analysis dashboard built on the [Sleeper API](https://docs.sleeper.com/).
No backend — all data is fetched client-side and cached in IndexedDB.

## Tech stack

- **Vite + React** (JavaScript, no TypeScript)
- **Tailwind CSS v4** via `@tailwindcss/vite`; design tokens + dark/light theming via `@theme` (no CSS-in-JS, no theme provider)
- **idb** — IndexedDB wrapper for the cache layer
- **Sleeper API** — read-only, no auth required
- **KeepTradeCut** — fetched via CORS proxy, parsed from server-rendered HTML
- **College Football Data API (CFBD)** — bulk player stats 2017–2024; requires `VITE_CFBD_API_KEY` in `.env.local`
- **nflverse** — draft picks CSV and current-season roster CSV (release assets); `sleeper_id` column enables direct joins; permanent per-year IndexedDB cache
- **react-router-dom** — client-side routing (HashRouter; no server rewrite needed)
- **Inter (variable)** — self-hosted via @fontsource-variable/inter; tabular figures enabled globally for aligned numerics

## Theming

Dark-first — the app defaults to a dark theme; a light/dark toggle in the header persists to `localStorage['theme']` (default dark; stored choice wins; OS preference is not read). All components are token-driven (`src/index.css @theme`); never add hardcoded Tailwind color classes — map to a token.

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
  components/
    shell/
      AppShell.jsx      # App frame: always-on TopBar + (post-league) NavRail / BottomTabBar + content area; pure chrome
      TopBar.jsx        # Sticky header — avatar, league name, Switch, Tooltips toggle
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
    PlayersTab.jsx      # Player Explorer table + FilterSidebar + PlayerProfile panel + ComparisonTray
    AdvancedStatsPanel.jsx # View-only advanced/usage stats panel (descriptor-driven) for the Player Profile
    SpiderChart.jsx     # 5-axis SVG radar chart with HTML label overlay and Tooltip integration
    Tooltip.jsx         # Reusable tooltip (portal, viewport-flip, delay, arrow)
    ui/
      ValueChip.jsx     # Pure presentational value chip { value · market delta · confidence }; tokens-driven, no data coupling
  context/
    TooltipContext.jsx      # React context providing tooltipsEnabled boolean
    ProfileDataContext.jsx  # Provides careerStats/playersMap/playerRows/positionPeakPPG/ktcMap/historicalShares/collegeStats/seasonProjections/advStats
  hooks/
    usePlayerProfile.js    # All profile panel data computation — pure hook, no rendering
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
  App.jsx               # All UI state; orchestrates the pipeline; renders the router + nav shell
```

---

## Documentation

Deep behavioural docs live in [`docs/`](docs/). Each maps to one unit of
planning work — pair it with the named module when making a change.

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
- [docs/ui.md](docs/ui.md) — Player Explorer (columns, filters, sort), the
  Player Profile panel and its tabs, the Advanced & Usage panel, SpiderChart,
  Tooltip, team depth chart, and the Features/tabs overview.
- [docs/signal-registry.md](docs/signal-registry.md) — canonical signal/feature registry:
  every raw source, computed factor, and ephemeral capture classified by layer, source,
  historical coverage, reconstructable-vs-ephemeral status, and current use. The
  inventory that governs snapshot-capture and grading-inclusion decisions.
