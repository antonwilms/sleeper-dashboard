# Sleeper Dashboard — Claude Code Instructions

Vite + React (no TypeScript) dynasty fantasy football dashboard. Sleeper REST API (no auth, read-only) + KeepTradeCut (DOM-scraped) + College Football Data API + nflverse draft data. All state lives in App.jsx; children receive data as props or read from context. Tailwind CSS v4.

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

Required env var — create `.env.local` at project root:
```
VITE_CFBD_API_KEY=your_key_here
```

---

## Navigation map

Deep behaviour is in the `docs/` directory (indexed from README.md → Documentation). Use this table to find which file to edit.

### src/
| File | Responsibility |
|------|----------------|
| `main.jsx` | Entry point — renders `<App>` in StrictMode |
| `App.jsx` | Root component; owns all state; builds playerRows pipeline; renders tab layout |

### src/api/
| File | Responsibility |
|------|----------------|
| `sleeper.js` | Official Sleeper API v1 calls; every call through `fetchWithCache` |
| `sleeperStats.js` | Undocumented stats/projections endpoints + `loadCareerHistory` (aggregates 18 weeks → season totals) |
| `ktc.js` | KeepTradeCut DOM scraper; paginated (pages 0–9); TTL 3 days |
| `cfbd.js` | College Football Data API — bulk player stats by year/category |
| `dataStore.js` | External data-store loader (season-totals, snapshots, enrichment); URL-based config; per-type TTL |
| `enrichment.js` | Loads enrichment overlay (coaching, scheme, injury data) from the data store |
| `nflDraft.js` | nflverse draft-picks CSV loader; permanent per-year IndexedDB cache |

### src/components/
| File | Responsibility |
|------|----------------|
| `PlayersTab.jsx` | Player Explorer table, FilterSidebar, PlayerProfile panel, ComparisonTray; exports `dynastyLabelColor` |
| `SpiderChart.jsx` | 5-axis SVG radar chart; 1–2 player overlays; HTML labels + Tooltip integration |
| `AvailabilityHistory.jsx` | Per-season GP/DNP sparkline (18-cell per season); enrichment tooltips on DNP cells |
| `Tooltip.jsx` | Generic tooltip — portal, viewport-flip, delay, arrow; reads `TooltipContext` |

### src/context/
| File | Responsibility |
|------|----------------|
| `ProfileDataContext.jsx` | Provides `{careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections}` to `PlayerProfile` |
| `TooltipContext.jsx` | Boolean global tooltip toggle |

### src/hooks/
| File | Responsibility |
|------|----------------|
| `usePlayerProfile.js` | Derives all PlayerProfile rendering data (career history, ranks, comps, peers) from `ProfileDataContext` |

### src/utils/
| File | Responsibility |
|------|----------------|
| `cache.js` | IndexedDB cache via `idb`; `getCache / setCache / clearCache`; TTL in minutes |
| `fantasyPoints.js` | `calculateFantasyPoints(stats, scoringSettings)` dot-product; `getPointsBreakdown` for debug |
| `dynastyScore.js` | `computeEmpiricalAgeCurves`, `computeDynastyScore`, `computeProspectScore`, `computePositionalRanks`, `computeRoleRanks`, `computeMarketDivergence`, `computeKTCPositionPercentile` — 950 lines, read in full before touching |
| `seasonProjection.js` | `computeNextSeasonProjection()` — 13-step vet pipeline + comp blend + rookie path |
| `careerComps.js` | `buildCareerArcVector`, `findCareerComps`, `compsProjectedPPG` — session-cached in module-level Map |
| `teamContext.js` | `computeTeamContext`, `computeQBQualityByTeam`, `computeHistoricalTeamTotals`, `computeHistoricalShares`, `computeShareTrend`, `buildTeamDepthChart` |
| `ktcMatch.js` | `matchKTCToSleeper()` — name+position/team fuzzy matching |
| `ktcHistory.js` | KTC snapshot time-series loader + assembler; used for `ktcHist*` capture factors |
| `projectionSignals.js` | `computeBreakoutFlag`, `computeBounceBackFlag`, `computeTdReliance` — vet projection signals (Step 5c) |
| `projectionSnapshot.js` | Snapshot and load ephemeral projection inputs (team, depth, status, KTC); ~2yr TTL |
| `compsIntegration.js` | `computeCompBlend()` — confidence-weighted career-comp ensemble blend (Step 9) |
| `efficiencyMetrics.js` | `computeEfficiencyFactor()` — per-opportunity efficiency composite (Step 5e) |
| `usageMetrics.js` | `computeUsageFactors()` — snap-share & own-rate red-zone usage factors (Steps 5f/5g) |
| `momentum.js` | `computeMomentum()` — multi-season PPG momentum signal (Step 5) |
| `regressionSignals.js` | Trajectory slope + consistency CV sub-score; shared by `dynastyScore.js` and `seasonProjection.js` steps 4 and 5d |
| `collegeMatch.js` | `matchCollegeToSleeper()` — name+college fuzzy match from CFBD to Sleeper IDs |
| `collegeMetrics.js` | `computeCollegeMetrics()` — dominator rating, breakout age, production trend |
| `nflDraftMatch.js` | `matchNflDraftToSleeper()` — nflverse draft picks matched to Sleeper player IDs |
| `enrichmentLookup.js` | Null-safe pure lookups: `findInjuryForWeek`, `getCoaching`, `getScheme`, `getNotes` |
| `exportData.js` | CSV / ZIP download export; `classifyKey` routes cache keys to snapshot ZIP paths |

---

## Invariants

Rules that break things silently if violated.

**Factors contract.** The projection `factors` object is a contract: 61 vet keys / 42 rookie keys, enforced by `src/__tests__/factorsSchema.test.js`. Never add, rename, or remove a `factors` key in `seasonProjection.js` without updating that test.

**Stat-key contract.** Every stat key referenced by projection code must appear with a finite value in `src/__fixtures__/season-totals-2025.json`; enforced by `src/__tests__/statKeysContract.test.js`.

**Fantasy points computed weekly.** Always call `calculateFantasyPoints(weekStats, scoringSettings)` on raw per-week stats. Never sum pre-stored season totals to produce fantasy points.

**React Strict Mode double-fires.** Effects fire twice in dev. Every `async useEffect` that writes state must check a `cancelled` flag before calling the state setter.

**Capture-only factors do not move projectedPPG.** `ktcHist*` and `positionMultiplicity*` keys are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines.

**Intentional divergence: dynastyScore.js vs seasonProjection.js.** `dynastyScore.js` uses the per-league rookie-pick proxy for dynasty value; `seasonProjection.js` uses the actual NFL draft slot (`nflDraft.js`). Do not unify unless explicitly asked.

**Ephemeral inputs must be snapshotted contemporaneously.** NFL team, `depth_chart_order`, player status, KTC value, and any Vegas/injury/coaching/scheme signals cannot be reconstructed later. Use `projectionSnapshot.js` to capture them at observation time. See docs/integrations.md → "Projection snapshots" and "Data store integration".

**App.jsx owns all state.** Do not move state into child components or new hooks. Do not introduce Redux, Zustand, Jotai, or any other state library. Do not add TypeScript. Do not modify cache TTL values without being asked. Do not refactor working utility functions while implementing a feature.

**playerRows pipeline order is load-bearing.** Trace the full pipeline (section below) before changing any step — each step depends on the previous one's output shape.

### Cross-repo contracts (with sleeper-dashboard-data)

This repo cannot edit the data repo. Any change affecting these contracts **must be called out in the task summary** so `sleeper-dashboard-data` can be updated to match.

- **Snapshot shape:** `src/utils/projectionSnapshot.js` writes `projection-snapshots/<date>`; `classifyKey` in `src/utils/exportData.js` routes it to `snapshots/<date>.json` for the data repo. The `projection` field is verbatim `computeNextSeasonProjection` output — changing the `factors` object or projection shape changes the exported snapshot.
- **season-totals schemaVersion:** `src/api/dataStore.js` advertises `MAX_SUPPORTED_SCHEMA=2` and re-fetches v1 cache entries lacking `weeklyStatus`; the data repo writes v2. Coordinate any version bump.
- **Enrichment schemas:** `src/api/enrichment.js` (`loadEnrichment`) and `src/utils/enrichmentLookup.js` read `enrichment/*.json` authored and validated in the data repo. Any field change must be mirrored there.
- **Manifest contract:** `dataStore.js` (`getManifestEntry` + validators) depends on the data repo's manifest field names and shape. Treat them as a public API.
- **CFBD pivot:** `src/api/cfbd.js` `pivotStatRows` depends on the confirmed CFBD `statType` sets the data repo stores. Adding or removing a stat type must be coordinated.

---

## Field-existence rule

To confirm a stat key exists in the live data, check `src/__fixtures__/season-totals-2025.json`. Grep finds _consumers_ of a key in source; the fixture confirms the key is _present in the data_. Both checks are needed — grep alone is not sufficient.

---

## Done-definition for code tasks

Before reporting a task complete:
1. Tests cover the change: any new behaviour gets a new test, and any changed behaviour gets its test updated to assert the correct new outcome (not merely edited to go green). Purely non-behavioural changes — renames, docs, lint, dead-code removal — need none. This applies even to skip-planning tasks that have no task-file "Tests to add" spec.
2. `npm test` — full suite must be green.
3. Run any contract tests touching changed areas: `factorsSchema.test.js` if `seasonProjection.js` changed; `statKeysContract.test.js` if stat-key references changed.
4. `npm run build` — clean with no warnings.
5. Fix anything red before declaring done.

---

## Workflow convention

Features use a two-session flow: **opus plans**, **sonnet implements**.

- Opus session: read relevant code, decide signatures and data shapes, write `.claude/tasks/<feature>.md`. **Do not edit any source files.** End the session.
- Sonnet session: read the task file first, implement exactly what it specifies, run the build. If something is ambiguous or contradicts existing code, stop and ask — do not guess.

The task file is the handoff artifact, not chat history. A planning session that edits source has broken the handoff.

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

Keep this file current as part of every task's done-definition. If a change adds/renames/removes a `src/` module, changes a command in `package.json`, alters a documented invariant or the factors contract, or changes a data shape referenced here, update the relevant CLAUDE.md section in the **same change**. Keep this file thin — it is a navigation-and-rules layer, not a second README. Push deep detail into the relevant `docs/` file and link to it rather than duplicating it here.

If a change affects a Cross-repo contract, state it explicitly in your task summary so `sleeper-dashboard-data` can be updated to match.

---

## State and data flow

### Key useState in App()
| Variable | Holds |
|----------|-------|
| `nflState` | Current NFL season/week from `/state/nfl` |
| `user` / `leagues` / `selectedLeague` | Sleeper identity (persisted in localStorage) |
| `leagueData` | Full league snapshot (see shape below) |
| `careerStats` | `{ [season]: { [player_id]: { gamesPlayed, gamesStarted, byeWeeks, dnpWeeks, fantasyPoints, weeklyPoints, stats } } }` |
| `careerLoadProgress` | Progress bar state for background career load |
| `ktcMap` | `Map<player_id, {value, confidence}>` — null until KTC fetch completes |
| `enrichmentMap` | `{ coaching, scheme, injuries, notes }` or null — loaded once on mount via `enrichment.js` |
| `comparisonList` | `string[]` up to 4 player_ids (persisted in localStorage) |
| `myTeamData` | User's roster with projected/actual/trend per player |
| `tooltipsEnabled` | Boolean (persisted in localStorage) |

### leagueData shape
```js
{
  standings: [{ rosterId, ownerId, teamName, managerName, wins, losses, ties, pointsFor, pointsAgainst, rank }],
  weeklyScores: { [rosterId]: [{ week, points, opponentRosterId, won }] },
  weeks: number[],
  rosterTeams: [{ rosterId, ownerId, rank, teamName, managerName, starters, bench, reserve }],
  playerMap: { [player_id]: SleeperPlayer },   // includes depth_chart_order, age, years_exp, position, team, status
  rosteredIds: Set<player_id>,
  rookieDraftPicks: { [player_id]: { round, pick } },
  scoringSettings: league.scoring_settings,
}
```

### playerRows pipeline (all useMemo, must stay in this order)
1. **`playerRows`** — base rows from careerStats + leagueData; calls `computeDynastyScore` per player; adds `positionRank` by currentSeasonPPG
2. **`playerRowsWithKTC`** — merges `ktcValue` from `ktcMap`
3. **`qbQualityByTeam`** — `computeQBQualityByTeam(playerRowsWithKTC, depthMap)`; prefers depth-chart QB1
4. **`playerRowsWithQBMod`** — applies QB quality modifier to WR/TE/RB `opportunityQuality` component (15% weight)
5. **`playerRowsFinal`** — `computeMarketDivergence(playerRowsWithQBMod)`; adds `divergenceSignal`, `dynRank`, `ktcRank`
6. **`playerRanks`** — `computePositionalRanks(playerRowsFinal, careerStats, currentSeason)` → `Map<player_id, ranks>`
7. **`playerRowsWithRanks`** — merges `recentRank`, `peakRank`, `consistencyRank`, `dynastyRank`, `rankMovement`, `movementLabel`

`playerRowsWithRanks` is passed to `<PlayersTab>`.

Also upstream: `depthMap` (from `leagueData.playerMap[id].depth_chart_order`), `empiricalCurves` + `positionPeakPPG` (from `computeEmpiricalAgeCurves`), `teamContext`, `historicalTeamTotals` + `historicalShares` (from `computeHistoricalTeamTotals` / `computeHistoricalShares`; used both in `computeDynastyScore` share trend boost and in `computeRoleRanks`).

---

## Patterns

### Caching (cache.js + IndexedDB)
- `getCache(key)` returns data or `null` (null on miss or TTL expiry)
- `setCache(key, value, ttlMinutes)` — default TTL 60 min; keys containing "players" default to 1440 min
- Pass TTL explicitly to make intent clear (see `sleeper.js` for examples)
- Stale cache detection: check a field that old entries lack (e.g. `sample.dnpWeeks !== undefined` in `sleeperStats.js`)

### Component data access (two patterns)
1. **Props from App.jsx**: `StandingsTable`, `ScheduleGrid`, `RostersTab`, `MyTeamView`, `PlayersTab` — all props-only, no context reads
2. **ProfileDataContext**: `PlayersTab` wraps `PlayerProfile` in `<ProfileDataContext.Provider>`; `PlayerProfile` and `usePlayerProfile` read `{careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections}` via `useContext`
