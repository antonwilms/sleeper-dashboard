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

Deep behaviour is in the `docs/` directory (indexed from README.md → Documentation). **Per-file
detail — the routing/IA table and one row per module — lives in [docs/navigation.md](docs/navigation.md).
Read it before locating any file.** The index below only chooses a directory. **Product/UX vision**
(target product, not current behaviour) lives in `docs/dynasty-decision-engine-design.md` (the six
surfaces + marginal-value thesis) and `docs/dynasty-frontend-ux-design.md` (UX/visual strategy); the
frontend migration plan is `.claude/tasks/frontend-overhaul.md`.

| Directory | What lives there |
|---|---|
| `src/` | `main.jsx` entry; `App.jsx` — owns all domain state and builds the playerRows pipeline; `constants.js`; `index.css` (`@theme` — the colour/font token source of truth) |
| `src/api/` | Every network and data-store loader: Sleeper (`sleeper.js`, `sleeperStats.js`), KTC (`ktc.js`), CFBD (`cfbd.js`), the data store (`dataStore.js`, `enrichment.js`), and the nflverse families (`nflDraft.js`, `nflRoster.js`, `advStats.js`, `nflSchedule.js`, `nflGameLogs.js`, `teamContext.js`) |
| `src/components/shell/` | App frame and nav chrome: `AppShell`, `TopBar`, `NavRail`, `BottomTabBar`, and `navItems.js` (nav config, `DEFAULT_ROUTE`) |
| `src/components/market/` | The Market surface: table, column descriptors, filter bar, filter panel |
| `src/components/portfolio/` | The Portfolio surface: metric tiles, value-by-age-band chart, holdings table (players and picks) |
| `src/components/teams/` | The `/teams` 32-team index and `/teams/:abbr` team detail |
| `src/components/dp/` | Dynasty-Portfolio design-system primitives (series/trend/coverage/degraded/popover) and the player-detail pop-up's shell and sections |
| `src/components/league/` | Standings, schedule, rosters |
| `src/components/roster/`, `board/`, `trade/` | Dormant and gated-placeholder surfaces |
| `src/context/` | `ProfileDataContext` — the pop-up's read-side data bundle |
| `src/hooks/` | `usePlayerProfile`, `usePlayersTable` (view-local table state), `useTeamHistoryLoader` |
| `src/utils/` | Everything pure: projection and dynasty-scoring modules, matching and lookup helpers, and the view-only derivations each surface renders from |
| `src/__tests__/` | Cross-cutting contract and view-only guard tests |
| `src/__fixtures__/` | `season-totals-2025.json` — the field-existence oracle |

## Traps

Cross-cutting landmines — each spans several files, so no single file's header owns it. A trap
specific to one module lives in that module's own header comment. The `dataSeason`-vs-`nflState.season`
split and the `complete`-not-key-presence rule are in [State and data flow](#state-and-data-flow).

**Two `teamContext` modules.** `src/api/teamContext.js` is the view-only nflverse team-context
loader; `src/utils/teamContext.js` is a projection-pipeline module (`computeTeamContext`,
`computeHistoricalTeamTotals`, …). `App.jsx` imports both, and its `teamContext` memo is the *utils*
one. Never wire the loader into projection/scoring — `teamContextViewOnly.test.js` guards it.

**Three team-abbr domains (CR-16).** Sleeper (`playerMap[id].team`, KTC rows,
`enrichment/coaching.json` — carries `LAR`, and the literal `'FA'` for a free agent); era-accurate
(teamcontext, schedule, `careerStats[season][id].team` — `STL`/`SD`/`OAK` in their eras); nflverse
current-franchise (gamelogs `games[].team`). The hops are `nflStats.js`'s
`normalizeTeamForSchedule`/`denormalizeTeamForSchedule` and `playerTeam.js`'s `eraTeam`;
`resolvePlayerTeam` is the single player→team resolution point. An ungated join does not error — it
silently yields an empty bucket or a `—` row.

**Never sum or average a stored rate.** Families carrying components *and* rates (teamcontext
`off.*`/`def.*`, gamelogs) publish rates as single-game values. Aggregate the `*Sum`/`*Plays`
components across the window, then divide (CR-10). Where a component is itself a per-game rate,
weight it (`cpoe` is attempt-weighted).

**`null` is not `0` in a series.** `CareerBars`/`SeriesBars`/`TrendCell` treat `null` as a void slot
(dashed baseline, excluded from the domain) and a measured `0` as a real value. Never pad a series,
and never substitute `0` for a missing observation.

**`matchKTCToSleeper` silently drops KTC's pick rows.** Picks carry `position: null` and
`team: "FA"`, so they fall past the position guard and out as unmatched. Everything downstream —
`ktcMap`, `loadKtcHistory`'s series — is therefore **players-only**. Pick prices come from the
parallel `ktcPicks.js` path. Do not widen the matcher; a pick is not a player.

---

## Invariants

Rules that break things silently if violated.

**Factors contract.** The projection `factors` object is a contract: 73 vet keys / 51 rookie keys, enforced by `src/__tests__/factorsSchema.test.js`. Never add, rename, or remove a `factors` key in `seasonProjection.js` without updating that test.

**Stat-key contract.** Every stat key referenced by projection code must appear with a finite value in `src/__fixtures__/season-totals-2025.json`; enforced by `src/__tests__/statKeysContract.test.js`.

**Fantasy points computed weekly.** Always call `calculateFantasyPoints(weekStats, scoringSettings)` on raw per-week stats. Never sum pre-stored season totals to produce fantasy points.

**React Strict Mode double-fires.** Effects fire twice in dev. Every `async useEffect` that writes state must check a `cancelled` flag before calling the state setter.

**Capture-only factors do not move projectedPPG.** `ktcHist*`, `positionMultiplicity*`, `adot*` (all paths) and the rookie-path `breakoutAgeFactor` are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines. (`breakoutAge`/`breakoutAgeFactor` are still computed and recorded; `breakoutAge` drives the Profile breakout chip.)

**Advstats are display-only.** `src/api/advStats.js` (target/air-yards share, WOPR, RACR) must
never influence `projectedPPG`, the dynasty score, or any `factors` entry, regardless of whether
it has a UI consumer. `market/Market.jsx`'s Efficiency column set reads `RACR` (WR/TE only, gated
on `advStats.complete`, not key presence); `targetShare`/`airYardsShare`/`wopr` are unrendered. No
projection/scoring module may import it. Enforced by
`src/__tests__/advStatsViewOnly.test.js`. See `docs/advstats-grading-findings.md`.

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
Delete the tag in the same change that wires the real source.

**Intentional divergence: dynastyScore.js vs seasonProjection.js.** `dynastyScore.js` uses the per-league rookie-pick proxy for dynasty value; `seasonProjection.js` uses the actual NFL draft slot (`nflDraft.js`). Do not unify unless explicitly asked. If prospect scores look uniformly flat, check that `rookieDraft.js` is still identifying this league's rookie draft before suspecting the scoring — an unidentified draft scores every prospect at `draftMultiplier(null)`.

**Ephemeral inputs must be snapshotted contemporaneously.** NFL team, `depth_chart_order`, player status, KTC value, and any Vegas/injury/coaching/scheme signals cannot be reconstructed later. Use `projectionSnapshot.js` to capture them at observation time. See docs/integrations.md → "Projection snapshots" and "Data store integration".

**App.jsx owns all domain/pipeline state** (the `playerRows` pipeline, league/career data) and flows it down as props. Do not move domain state into child components or new hooks, and do not introduce Redux, Zustand, Jotai, or any other state library. (Purely view-local table UI state — position filter, sort, page, expand, selected-profile id — may live in the `usePlayersTable` hook, one independent instance per consumer (Market, Portfolio); this is not domain state.) Do not add TypeScript. Do not modify cache TTL values without being asked. Do not refactor working utility functions while implementing a feature.

**playerRows pipeline order is load-bearing.** Trace the full pipeline (section below) before changing any step — each step depends on the previous one's output shape.

### Cross-repo contract registry (with sleeper-dashboard-data)

This repo cannot edit the data repo. The **complete enumerated registry** — the entry-format definition and all 21 `CR-NN` entries — lives in [docs/cross-repo-registry.md](docs/cross-repo-registry.md). It is the sole authority for what the data repo must mirror: the plan-reviewer subagent reads that file and never reads the sibling tree. Its app-side trigger lists are a maintained cache the subagent re-verifies against live `src/` on every review.

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
6. **Smoke the change in the running app if it is user-visible** — see [Workflow convention](#workflow-convention) for the recipe. Report what you looked at and what you saw. A slice with no visible surface (a loader-wiring or pure-util slice) can note that instead.
7. **If the change surfaced work that belongs in the data repo, append it to [.claude/tasks/data-repo-backlog.md](.claude/tasks/data-repo-backlog.md) in the same change** — with the commit that found it and whether it blocks. This repo cannot edit the sibling, so an unrecorded ask is a lost one. Distinct from [docs/cross-repo-registry.md](docs/cross-repo-registry.md), which records contracts that already exist rather than work that does not.
8. Fix anything red before declaring done.

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
- **Visual verification.** Claude Code **may** run the app and look at it, and should when a change is visual — handing back UI nobody has looked at wastes a round. Start it from the `.claude/launch.json` preview config rather than backgrounding `npm run dev` in a shell, and stop the server when done. `npm test` / `npm run lint` / `npm run build` are still required and still come first.
- **How to smoke it.** `preview_start` the `sleeper-dashboard` config from `.claude/launch.json`, or
  attach to an already-running server on `:5173` rather than starting a second one. A fresh browser
  profile lands on the username form: enter **`Colts_420_Reloaded`** and pick league **Dynasty 040**.
  The league choice persists to `localStorage`, so later runs load straight in. First load runs the
  career fetch — give it time before concluding a surface is empty. Check the console for errors and
  for the loaders' own `[teamContext]`/`[nflGameLogs]`/`[nflSchedule]`/`[advStats]` lines, which name
  the season they resolved.
- **But a screenshot from Claude is not sign-off.** The user's eyes remain the acceptance gate for anything aesthetic — density, spacing, whether a screen reads well, whether a chart is legible. Claude's job is to catch what is *broken* (an element that fails to render, a value that shows as `NaN`, a layout that collapses); the user's job is to judge whether it is *good*. Report what you looked at and what you saw, and never claim a design works because it rendered without throwing.

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

**This file has a hard ceiling of 25,000 bytes, enforced by `src/__tests__/claudeMdSize.test.js`.**
It is a rules-and-orientation layer, not a second README. A change that would breach the ceiling
**prunes in the same commit** — it does not raise the ceiling.

Per-file detail belongs in [docs/navigation.md](docs/navigation.md), not here: responsibilities,
data shapes, gates and floors, props and export lists. A trap specific to one module belongs in that
module's own header comment; only a trap spanning several files belongs in [Traps](#traps), itself
capped at 3,000 bytes. Nothing here records history — rows and rules state what is true now, and
`git log` holds the rest.

Keep this file current as part of every task's done-definition. If a change adds/renames/removes a
`src/` module, changes a command in `package.json`, alters a documented invariant or the factors
contract, or changes a data shape referenced here, update the relevant CLAUDE.md **or
`docs/navigation.md`** section in the **same change**. If a change adds, removes, or reclassifies a
signal/factor — a raw source, a computed `factors` entry, an ephemeral capture, or its historical coverage or reconstructable-vs-ephemeral status — update the canonical signal registry (`docs/signal-registry.md`) in the same change.

If a change touches an entry in [docs/cross-repo-registry.md](docs/cross-repo-registry.md), emit that entry's `Mirror` text in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id — naming the contract in prose is not enough. If the change introduces a coupling the registry does not list, add the new entry to **both** repos in the same change (see [Workflow convention](#workflow-convention) for how a genuinely new coupling gets drafted).

---

## State and data flow

> **App state & `leagueData` shape:** App.jsx owns all domain state (see the *App.jsx owns all state* invariant); children get props or read `ProfileDataContext`. The `useState` inventory and the `leagueData` object shape live in [docs/architecture.md](docs/architecture.md) → *State management* and *leagueData assembly* — kept there to avoid drift, not duplicated here.

**`dataSeason` — the loader-season choice.** `teamContextByYear`, `gameLogsByYear`, and `nflScheduleByYear` (view-only nflverse side-loads, modelled on `advStats`) are keyed on the most-recent season with **data**, `Object.keys(careerStats).map(Number).sort()`'s max — NOT `nflState.season`, the live NFL season. In the offseason those differ (e.g. `nflState.season` is 2026 while there is no `nflverse/gamelogs/2026.json` or `teamcontext/2026.json` yet), and loading the live season would make every future consumer of these families render as "no data" for a reason that has nothing to do with the code. Each is a `{ [year]: loaderResult }` map (initial `{}`, merged per year) — consumers must branch on `loaderResult.complete`, never on key presence, since an absent key and a resolved-but-empty year both read as "nothing there."

### playerRows pipeline (all useMemo, must stay in this order)
1. **`playerRows`** — base rows from careerStats + leagueData; calls `computeDynastyScore` per player; adds `positionRank` by currentSeasonPPG. Also computes `careerSparkline` (`[ppg × 5 league seasons]`) inline — `null` for an absent season or 0 games, a number (including a legitimate `0`) only for a measured PPG; not snapshotted, not scored, no pipeline step downstream depends on it
2. **`playerRowsWithKTC`** — merges `ktcValue` from `ktcMap`
3. **`qbQualityByTeam`** — `computeQBQualityByTeam(playerRowsWithKTC, depthMap, true)`; prefers depth-chart QB1; league-wide (includes un-rostered QBs). A sibling memo `qbQualityByTeamRostered` (legacy rostered-only) feeds projection Step 7b — intentional divergence until the projection swap clears its backtest (see docs/projection.md → Step 7b).
4. **`playerRowsWithQBMod`** — applies QB quality modifier to WR/TE/RB `opportunityQuality` component (15% weight)
5. **`playerRowsFinal`** — `computeMarketDivergence(playerRowsWithQBMod)`; adds `divergenceSignal`, `dynRank`, `ktcRank`
6. **`playerRanks`** — `computePositionalRanks(playerRowsFinal, careerStats, currentSeason)` → `Map<player_id, ranks>`
7. **`playerRowsWithRanks`** — merges `recentRank`, `peakRank`, `consistencyRank`, `dynastyRank`, `rankMovement`, `movementLabel`

`playerRowsWithRanks` feeds `playerRowsWithProj` (merges `seasonProjections`; also computes `nextSeasonRank`) — the pipeline's terminal output, passed to `Market`, `Portfolio`, and the App-level `ProfileDataContext.Provider` (which feeds the player-detail pop-up).

Also upstream: `depthMap` (from `leagueData.playerMap[id].depth_chart_order`), `empiricalCurves` + `positionPeakPPG` + `positionPeakAge` (from `computeEmpiricalAgeCurves`), `historicalTeamTotals` + `historicalShares` (per-season-team; feed the projection and `computeRoleRanks`) + `historicalTeamTotalsCurrentTeam` + `historicalSharesCurrentTeam` (current-team-pinned; feed only the `computeDynastyScore` share-trend boost — R2 hold); `teamContext` is current-team-pinned.
