# Sleeper Dashboard

Personal dynasty fantasy football analysis dashboard built on the [Sleeper API](https://docs.sleeper.com/).
No backend — all data is fetched client-side and cached in IndexedDB.

## Tech stack

- **Vite + React** (JavaScript, no TypeScript)
- **Tailwind CSS v4** via `@tailwindcss/vite`
- **idb** — IndexedDB wrapper for the cache layer
- **Sleeper API** — read-only, no auth required
- **KeepTradeCut** — fetched via CORS proxy, parsed from server-rendered HTML
- **College Football Data API (CFBD)** — bulk player stats 2017–2024; requires `VITE_CFBD_API_KEY` in `.env.local`

## Running locally

```bash
npm install
npm run dev
```

Create a `.env.local` file at the project root with your CFBD API key:
```
VITE_CFBD_API_KEY=your_key_here
```

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

The suite covers **pure utility helpers**, the **projection schema contract** (all 56 vet / 42 rookie factors keys), the **stat-key contract** (fixture coverage), and **`computeNextSeasonProjection` end-to-end** (vet and rookie integration tests). It does **not** cover App.jsx pipeline integration, React components, IndexedDB I/O, or live API behaviour. Manual smoke-testing the running app remains necessary. Modules that touch browser APIs (`cache.js`, any module that calls `openDB`) are mocked with `vi.mock()` wherever they appear as transitive imports. The Vitest environment is `node` (not jsdom).

- D1 NFL draft slot: `src/api/nflDraft.test.js`, `src/utils/nflDraftMatch.test.js`, rookie integration cases in `src/utils/seasonProjection.test.js`.

---

## Project structure

```
src/
  api/
    sleeper.js          # Official Sleeper API calls (api.sleeper.app/v1)
    sleeperStats.js     # Undocumented stats/projections endpoints (api.sleeper.com)
    ktc.js              # KeepTradeCut dynasty values (DOM extraction + pagination)
    cfbd.js             # College Football Data API — bulk player stats by year/category
    nflDraft.js         # nflverse draft-picks CSV loader; per-year IndexedDB cache; permanent TTL
  components/
    PlayersTab.jsx      # Player Explorer table + FilterSidebar + PlayerProfile panel + ComparisonTray
    SpiderChart.jsx     # 5-axis SVG radar chart with HTML label overlay and Tooltip integration
    Tooltip.jsx         # Reusable tooltip (portal, viewport-flip, delay, arrow)
  context/
    TooltipContext.jsx      # React context providing tooltipsEnabled boolean
    ProfileDataContext.jsx  # Provides careerStats/playersMap/playerRows/positionPeakPPG/ktcMap/historicalShares/collegeStats/seasonProjections
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
                        # buildTeamDepthChart()
    collegeMatch.js     # matchCollegeToSleeper() — name+college fuzzy match from CFBD to Sleeper IDs
    collegeMetrics.js   # computeCollegeMetrics() — dominator rating, breakout age, production trend
    nflDraftMatch.js    # matchNflDraftToSleeper() — name+college matching from nflverse draft picks to Sleeper player IDs; reuses normalisation helpers from collegeMatch.js
    momentum.js         # computeMomentum() — multi-season PPG momentum signal (shared helper)
    projectionSignals.js # computeBreakoutFlag / computeBounceBackFlag / computeTdReliance — vet projection signals (ported from dynastyScore)
    compsIntegration.js  # computeCompBlend() — confidence-weighted career-comp ensemble blend (post-pipeline Step 8)
    efficiencyMetrics.js # computeEfficiencyFactor() — per-opportunity efficiency composite (Step 5e)
    seasonProjection.js # computeNextSeasonProjection() — 17-factor veteran pipeline + career-comp ensemble blend + rookie path
  App.jsx               # All UI state; orchestrates the full data pipeline
```

---

## Documentation

Deep behavioural docs live in [`docs/`](docs/). Each maps to one unit of
planning work — pair it with the named module when making a change.

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
  loader, KTC (fetch/parse/match/history), CFBD, nflverse draft, data-store
  integration, enrichment overlay, cache, projection snapshots, and the
  API-layer tables.
- [docs/ui.md](docs/ui.md) — Player Explorer (columns, filters, sort), the
  Player Profile panel and its tabs, SpiderChart, Tooltip, team depth chart, and
  the Features/tabs overview.
