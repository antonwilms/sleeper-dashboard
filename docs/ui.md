Deep reference for Market, Portfolio, the player detail pop-up, and shared UI components. (The
Player Explorer this doc used to also cover was retired in 1b Slice viii — see master-plan §6a.)

## Features

### Persistent session

Username and league selection are saved to `localStorage`. On return visits the app skips the username form and loads straight into the last league. A sticky header bar shows avatar, display name, and league name with a **Switch** link.

The app is dark-only (dp-v2 Slice 0). `.dark` is set unconditionally in `index.html`; there is no toggle and `localStorage['theme']` is no longer read.

The header's tooltips toggle and the underlying `Tooltip`/`TooltipContext` subsystem were removed
entirely in 1b Slice viii — the old design wasn't worth keeping as-is, and it returns as a designed
feature in a future slice rather than being kept half-wired.

### League selection

Enter a Sleeper username to fetch all leagues for the current season. Each league card shows scoring format (PPR / Half PPR / Standard), team count, and status.

### Navigation & surfaces

The app uses a persistent nav shell (`AppShell`) with a **desktop left rail** (`NavRail`, grouped since the Dynasty Portfolio redesign — 1b Slice i) and a **mobile bottom tab bar** (`BottomTabBar`, flat, capped at 5). Rail groups: **MANAGE** (Portfolio, Market) · **ACT** (Trade desk, Draft board) · **LEAGUE** (Standings, Schedule, Rosters).

| Surface | Route | Status |
|---|---|---|
| **Portfolio** | `/portfolio` | Placeholder as of 1b Slice i — content lands in Slice iv |
| **Market** | `/market` | **Default landing (`DEFAULT_ROUTE`, temporarily — see below).** Real table since 1b Slice iii: Value/Outlook/Production column-set switch, position pills, sort, pagination, row click/keyboard → the Slice ii detail pop-up. See *Market* below |
| **Draft board** | `/board` | Gated placeholder — requires marginal-value engine + season-phase classifier |
| **Trade desk** | `/trade` | Gated placeholder — requires marginal-/phase-aware trade evaluator |

`DEFAULT_ROUTE` is temporarily `/market` (not `/portfolio`) since 1b Slice iii — Portfolio is still a placeholder and the app shouldn't boot to it. Re-evaluate when the Portfolio slice ships real content.

`/roster` (the former "My Team" view, described below for historical reference) is **retired as of 1b Slice i** — it now redirects to `/portfolio`; `MyTeamView` is no longer mounted from `App.jsx` (dormant on disk). `/players` (the Player Explorer) is **retired as of 1b Slice viii** — it now redirects to `/market`, the same old-bookmarks-don't-404 treatment as `/roster`. It had deliberately duplicated Market since 1b Slice iii; Market reached filter parity in Slice vi and free-text search + saved-preset parity in Slice vii, and once that functional parity was met, Slice viii deleted the Explorer outright (`PlayersSurface`, `PlayersTab`, `OutlookTab`, `NflStatsTab`, `PlayersDataTable`, `ComparisonTray`) and settled all five convergence debts by deletion — see master-plan §6a.

The secondary **League** group (`/league/:view`) covers Standings, Schedule, and Rosters. Desktop reaches these directly via the rail's LEAGUE group; mobile via a "League" link in the top bar (→ `/league/standings`) plus `LeagueView`'s own in-page sub-nav (the only mobile path to Schedule/Rosters).

A seasonal **Rookies** slot (visible Jan–May only) is reserved in the nav rail's MANAGE group and the tab bar's flat list.

### Roster surface (formerly My Team) — dormant since 1b Slice i

**Not reachable via routing** — `/roster` redirects to `/portfolio`; the section below documents the
`MyTeamView`/`PlayerCard`/`Sparkline` component files as they exist unrouted on disk, kept honest by
`shell/importIntegrity.test.jsx`. The `App.jsx` state and fetch effect that used to feed them were
removed as dead code, not preserved — re-wiring these components means writing a new fetch effect.

Shows current-week projections, last-week actuals, 4-week average, and a 4-bar trend sparkline per player.

**Roster enhancements:**
- **Sort toggle**: switch between _This Week_ (by current projection) and _Next Season_ (by `projectedPPG`).
- **Per-player next-season line**: "Next season: ~X.X PPG · ~N pts" with a confidence badge (`high` / `med` / `low` / `rookie`).
- **Roster total**: sum of all projected PPG for the upcoming season displayed at the top of the roster.

### League group

Standard dynasty views, reached via `/league/:view`:
- **Standings** — season record, points for/against, rank
- **Schedule** — weekly matchup grid with win/loss colouring
- **Rosters** — all-league rosters grouped by position with Starter/Bench/IR badges

---

## Portfolio (`src/components/portfolio/Portfolio.jsx`)

The redesign's aggregate-heavy surface (1b Slice iv, `.claude/tasks/dynasty-portfolio-1b-iv-portfolio.md`) — everything on it is scoped to rows the user owns (`ownerTeamName === myTeamName`), derived once and shared by the tiles, chart and table. **When `myTeamName` is null** (no roster resolves for the user in this league), the whole screen renders a single explanatory empty state instead of four `—` tiles above an empty chart/table.

Header: "Portfolio" 22/700 + `` `${N} skill players` `` — `playerRows` holds only QB/RB/WR/TE, so `N` can never equal a full Sleeper roster's size (K/DEF etc. are absent); worded accordingly rather than "assets". Nothing occupies the header's right side in v1 (both the posture clause and the horizon segmented control are cut, master-plan §4a.2).

**Four metric tiles**, values only, no deltas (§4a.2 — a delta needs a prior snapshot of the same aggregate, which doesn't exist):
- **Roster value** — `Σ ktcValue` over owned rows (absent `ktcValue` skipped, not treated as 0). Note: `Nth of M`, the rank of the team's total among **all** teams' totals (grouped from the full `playerRows`, not just owned), `M` = teams holding ≥1 skill player.
- **Weighted age** — `Σ(age × ktcValue) / Σ ktcValue` over owned rows with both fields present, one decimal. Note: `League median N`, computed the same way per team, **excluding any team whose denominator is 0** (or the median is `NaN`).
- **Concentration** — share of owned value held by the top 4 assets by `ktcValue`, as a whole percentage; `—` below four valued assets. Note reworded from the design's claim ("Four assets hold most of your value") to something always true: `Top 4 of N assets by value`.
- **Projected points** — `Σ projectedTotalPts` over the roster's **starters**, next season. **Joined on `starter.id`, not `starter.player_id`** — `enrichPlayer` (`App.jsx`) returns `{ id, slot, full_name, position, team, age }` with no `player_id` key; joining on the wrong field silently sums to 0 while every other guard stays silent, since the starters array isn't empty. Three distinct degenerate cases all render `—` (tracked via an explicit contributing-starter count, never inferred from the sum): empty/absent `starters`; `seasonProjections` still `null` (pre-resolve); a full starters array whose players all lack a projection. Never falls back to summing the whole roster.

**Value by age band** — a 5-bar chart of `Σ ktcValue` per age band, `21–23`/`24–25` → `bg-dp-up`, `26–28` → `bg-dp-neutral`, `29–30`/`31+` → `bg-dp-down`. **The first band is lower-open (`≤23`, not `21–23`)** — otherwise a 21-and-under rookie falls into no bucket and vanishes from the chart while still counting in the Roster value tile, so the bars would stop summing to the tile. Owned rows with a null age are excluded from every band (not bucketed into `31+`).

**Holdings table** — ASSET · VALUE · 5-YR PPG · PROJ Δ · HORIZON, sorted by `ktcValue` descending by default (`usePlayersTable`, `portfolio-sort`, with the same restored-key `SORTABLE_KEYS` validation Market uses — Portfolio has one column set, so the set-switch machinery doesn't apply, but a stale/foreign sort value restored from `localStorage` still needs a fallback). No `30D` column (same broken `ktcHist` series Market cut, cut the same way — a whole unpopulatable column is cut, not tagged) and no `CALL` column (§4a.2). `PROJ Δ` is guarded with `currentSeasonPPG > 0`, **not a null check** — `currentSeasonPPG` is `0`, never `null`, so a null guard never fires and a player with no prior season would otherwise show `projectedPPG − 0` as a fabricated full-projection gain. `5-YR PPG` reuses `dp/cells.jsx`'s `CareerBars` unchanged — since dp-v2 Slice 1, an absent season renders as a void slot (a dashed baseline marker), distinct from a genuine 0.0 PPG season's filled stub.

**HORIZON** reads `row.dynastyScore.signals.yearsFromPeak` — **computed by the pipeline, never re-derived** from `age`/`positionPeakAge` in the component (that would be a second source of truth; the pipeline's version has a `derivePeakAge` fallback a component-local recompute would lack). Thresholds (`±2` years, one named constant): `yearsFromPeak <= -2` → Appreciating, `-2 < yearsFromPeak < 2` → Peak, `>= 2` → Depreciating; `—` when `yearsFromPeak` or `signals` itself is null (the non-scored path). **Deliberately inconsistent with the age-band chart above**, and intentionally so: the chart uses fixed position-blind age bands (correct — it aggregates *value* across a roster, where position-blind bands are the point) while the pill uses position-relative peak distance (correct — a per-player judgment must account for position, since a 29-year-old QB and a 29-year-old RB are not on the same curve). They will occasionally disagree for one player; that's expected, not a bug. This is not `PROVISIONAL(heuristic)` — the underlying quantity is pipeline-computed from measured curves, and the only judgment is the ±2 display boundary over an already-real number (master-plan §2.1/§2.4 amended in the same change that shipped this to stop listing it as a heuristic).

Row click / Enter/Space on a focused row → `onOpenPlayerDetail(row.player_id)`, reusing `dp/cells.jsx`'s `ClickableRow`/`PlayerCell` — same mechanism as Market.

**Cut from the design (master-plan §4a.2), all deliberate:** the "needs a decision" alert cards, the Holdings `CALL` column, the three tile deltas, the 30 days/Season/All time segmented control, the header's "contending window open" clause. **Cut for a data gap, not §4a.2:** the "· N rookie picks" subline clause — the app never loads Sleeper's traded-picks endpoint, so there is no representation of unused future picks as tradeable assets.

`DEFAULT_ROUTE` stayed `/market` through this slice — whether Portfolio reclaims it is a product call, not something this slice decided.

---

## Market (`src/components/market/Market.jsx`)

The redesign's data-display surface (1b Slice iii, `.claude/tasks/dynasty-portfolio-1b-iii-market.md`) — one table over `playerRowsWithProj`, dark-only `--color-dp-*`, no `ProfileDataContext` (gets `playerRows`/`loaded`/`careerStats`/`playerMap`/`seasonProjections`/`myTeamName`/`onOpenPlayerDetail` as props from `App.jsx`). Row click (or Enter/Space on a focused row — rows are `role="button"`/`tabIndex={0}`) calls `onOpenPlayerDetail(player_id)`, opening the Slice ii detail pop-up. `dp/MarketTable.jsx` is the presentational shell (`PAGE_SIZE = 50`, own position-pill row and pager). Its cell components (`SortTh`, `PlayerCell`, `ClickableRow`, `CareerBars`, `DeltaCell`) moved to `dp/cells.jsx` in Slice iv so Portfolio could import rather than fork them — a pure relocation, Market's own rendering unchanged.

**Segmented column-set control** — Value / Outlook / Production, persisted to `localStorage['market-column-set']`, validated on read. Position pills (All/QB/RB/WR/TE) sit below it, in the same row as the filter bar (1b Slice vi). Free-text search and saved presets landed in **1b Slice vii** — see the filter bar section below.

### Filter bar + panel (`market/FilterBar.jsx` + `market/FilterPanel.jsx`, 1b Slice vi)

Market reached **functional** parity with the Explorer's filter set (master-plan §6a — the union of the Explorer's ten dimensions plus the design's `Min projected games`, minus the design's `Risk` group, which stays cut per §4a.2 since its Low/Med/High thresholds are still undefined; the Explorer itself was deleted in 1b Slice viii once that parity was reached). Predicates live in `src/utils/marketFilters.js` — pure, no React — originally harvested from the Explorer's `PlayersTab.jsx`, now the single source since that file's deletion. `DYNASTY_GROUP_MAP` and `NFL_TEAMS` were `PlayersTab.jsx`-owned data, imported from there until Slice viii; they now live natively in `marketFilters.js`, since they're data whose labels must track `dynastyScore`'s label set.

- **Placement.** `dp/MarketTable.jsx` gained an optional `filterBar` render-prop, rendered in the SAME flex-wrap row as the position pills — additive, matching the design's one-row Filter-bar paragraph (position control → active pills → "+ Add filter" → right-aligned actions). The panel itself is a `w-full` child of that row, which is what pushes it onto its own line below the bar without a second render slot.
- **Twelve dimensions**, grouped Player (starters-only, rookies-only, age range, experience range) / Availability (all/my roster/available/NFL free agent) / Team (NFL team + fantasy team multi-selects) / Dynasty (four dynasty-group chips, market-signal radio, KTC range) / Projection (min projected games) / **Search** (free-text, 1b Slice vii — the twelfth, in the bar itself rather than the panel).
- **Sentinel gating** — the three range filters (age/experience/KTC) and `minProjectedGames` only filter when they differ from their default. A null-valued row (no age, no `years_exp`, no `ktcValue`, no `seasonProjections` entry) passes at rest and is dropped only once that control moves. The `FilterPanel`'s slider bounds are read directly from `marketFilters.DEFAULT_MARKET_FILTERS` rather than re-declared, so they cannot drift from the values the predicates gate on.
- **Live filtering.** `filters` is `Market.jsx` view-local state (like `columnSet`), persisted to `localStorage['market-filters']` and validated on read via `normalizeFilters` (per-key type/length/enum, not key presence — a stale `ageRange: ["18","45"]` would otherwise pass a presence check and read as active). Every change resets `page` to 1. Filters apply live; the panel's "Apply · N players" button only closes the panel, it never commits a draft.
- **Header count.** The subline now reads `${filtered} of ${total} players · N filters active` once any filter is active, replacing the unconditional "every asset in the league, owned or not" copy — so the header, the pager's "X–Y of Z", and the panel's Apply-button count always agree.

**Free-text search (1b Slice vii §2)** — a text input in the bar itself, left of "+ Add filter", labeled "Filter by name…" (deliberately worded "Filter" rather than "Search" to stay visually/semantically distinct from `TopBar`'s global `⌘K` search, below — one narrows the table, the other navigates). Predicate: `(row.full_name ?? '').toLowerCase().includes(query.trim().toLowerCase())` inside `applyMarketFilters`, so it composes with every other dimension through the one pipeline. Counts toward `activeFilterCount`/renders a pill/clears via "Reset all" like any other dimension. **Never persisted**, at both ends: `Market.jsx`'s `setFilters` writes `{ ...next, search: '' }` to `localStorage` on every change (it fires on every keystroke, not just filter changes), and `marketFilters.normalizeFilters` unconditionally forces `search` back to `''` on read regardless of what a payload holds — the same reasoning the Explorer applies to its own (unpersisted) search state.

**Saved presets (1b Slice vii §3)** — a "Presets" control sharing one `ml-auto` wrapper with "Reset all" at the right edge of the bar (visible whenever presets exist or a filter is active; `FilterBar` has no other right-aligned slot, so this wrapper is new, not reused). Stored under **`market-filter-presets`** — a new `localStorage` key, distinct from the Explorer's `explorer-presets` (whose payloads are a different, ten-key shape and would silently misapply here). Cap of 5, name-replace on save; unlike the Explorer, **re-saving an existing name always works even at the cap** — the Explorer disables its save control at `presets.length >= 5` regardless of name, making its own name-replace branch unreachable once full. `marketFilters.isRestorableFilters(raw)` — a strict companion to `normalizeFilters` sharing its per-key validators — filters the stored preset list at mount, **dropping** (not salvaging) any entry that fails: a live filter payload is *salvaged* per-key (losing every dimension because one drifted is worse than repairing it), but a *named* preset is *dropped* instead, since silently applying a corrupted preset as "no filter on that dimension" under the name the user chose is a promise broken in a way they have no way to notice. Applying a preset routes through `normalizeFilters` (a no-op for anything that survived the strict check, but it keeps one code path) — which is also what forces `search` back to `''` even if the saved state happened to carry one.

### Global player search (`shell/TopBar.jsx`, 1b Slice vii §4)

`TopBar`'s search field — visual-only and disabled since Slice i — is now a live, global `⌘K`/`Ctrl+K` player *navigator*, distinct from Market's free-text *filter* above (see the task file's "two different features" framing: one narrows a table, the other jumps to a player from anywhere). Desktop/tablet only (`hidden sm:block`, unchanged) — Market's own text filter covers mobile.

- **Enabled** once `searchablePlayers` (a narrow `{player_id, full_name, position, age, nfl_team, score}` projection, memoised in `App.jsx` from `playerRowsWithProj` — never the full row array) is non-empty; disabled before then, same as before. Placeholder narrows to `"Search players"` (the mock's "Search players, teams, picks" is out of scope — picks aren't a modeled entity and teams have no detail surface to navigate to).
- **`⌘K`/`Ctrl+K`** focuses the field via a listener `TopBar` owns itself (not `App.jsx` — a boolean "focus signal" prop can't re-fire on a repeated keypress). **Inert while the player-detail pop-up is open** (`popupOpen` prop, `tabs.length > 0`) — avoids a second global key listener competing with the pop-up's own, and a search overlay stacking on top of an open modal. The pop-up's `z-40` scrim already blocks the click path over `TopBar`'s `z-30`; `popupOpen` closes the same gap for a keydown listener, which a scrim can't block.
- **≥2 characters** opens a results dropdown: up to 8 players whose `full_name` matches (same null-guarded substring test as Market's filter), ranked by `score` (`dynastyScore.score`) descending, nulls last. Fewer than 2 characters or zero matches renders no dropdown (never an empty panel). Escape closes it and blurs the field; clicking outside closes it.
- Picking a result calls `onOpenPlayerDetail(id)` (`App.jsx`'s `openPlayerDetail`, the same entry point Market/Portfolio use) and clears the query — it navigates, it never touches a table.
- **Chrome tokens, not `--color-dp-*`.** The dropdown uses `--color-surface`/`--color-border`/`--color-text-*`, matching the field it descends from — `TopBar` is the shared chrome, and that's the family it uses throughout (see the `--color-dp-*` note above). Rows are local markup, not `dp/cells.jsx`'s `PlayerCell` (which carries dp tokens) — deliberately, to avoid mixing token families in one component.
- Query clears on league switch, via a `TopBar`-local effect on `selectedLeague?.league_id` (`App.jsx`'s `handleSwitch` has no handle on this view-local state, and `AppShell` renders `TopBar` unconditionally, so it never unmounts on a switch).

- **Value** (default) — `PLAYER` · `DYNASTY SCORE` (mono number + 6px meter + label) · `VS MARKET` · `KTC` · `CAREER PPG` (5-wide sparkline, **non-sortable**) · `CEILING` · `FLOOR` · `NOW` · `NEXT` (value + delta beneath) · `±SD` · `OWNER`. Default sort `dynastyScoreValue` (= `row.dynastyScore?.score ?? null`) **descending** — a distinct sort key from the Explorer's own `dynastyScore` key, which sorts by label ordinal ascending (lower = better) and would surface the worst outlooks first if harvested directly.
  - `VS MARKET` has **four** states: `▲ N% under by rank` (undervalued) / `▼ N% over by rank` (overvalued) / `≈ aligned` (KTC present, no signal) / `—` (no KTC value at all — never rendered as "aligned"). The percentage is `divergencePct`, a rank-depth percentage (`dynastyScore.js`), not a price delta — worded as rank distance, not "N% off".
  - `KTC` (Slice vii follow-up, added after the initial vii hand-back — the raw crowd-sourced dynasty value `VS MARKET`'s chip is derived from) — `row.ktcValue.toLocaleString()`, `—` when absent. Sortable, unlike `VS MARKET`'s own chip.
  - `CEILING`/`FLOOR` (Slice vii follow-up) — best/worst single-season positional finish by PPG, harvested from the Explorer's `computeCeilingFloor`/`buildSeasonPositionRanks` (`src/utils/seasonRanks.js`, imported not forked — it's already a pure, presentation-free util) and re-skinned to dp tokens as a local `CeilingFloorCell`, dropping the Explorer's tier-colored rank badge (its `bg-[--c-green-100]`-style raw chromatic primitives carried a `.dark` override that followed the app's former light/dark toggle — but Market was forced dark regardless of that toggle, so a tier badge would silently render light-mode colors against a dark row whenever the toggle was off; plain mono text sidesteps the mismatch, and the delta text reuses `dp-up-text`/`dp-down-text` instead). The toggle is gone as of dp-v2 Slice 0; restoring the badge is possible but not done (dp-v2 §2.1). Ties break the same way as the Explorer: ceiling favors the higher-points season, floor the lower. `ceilingRank`/`floorRank` are the sortable keys — added to `usePlayersTable`'s `ascByDefault` set (rank 1 = best, so the first click sorts ascending, matching the Explorer's own special-casing of the same rank-shaped columns; the shared hook's other consumers have no rank-type column today, so this is additive).
  - `±SD` is `computeConsistency(careerStats, playerId).sd` — `—` for both the null-object case (no qualifying seasons) and the non-null-object-with-null-`sd` case (qualifying season(s) exist but pooled games < `MIN_POOLED_GAMES`). No Low/Med/High risk word — that threshold is still undefined (master-plan §5.4); Slice ii shipped the same `±sd`-only convention on the pop-up's Floor-risk tile.
  - No KTC 30-day-Δ column — that upstream series is the redesign's one known real data gap (master-plan §2.2), omitted per §4a.2 rather than shipped empty. (This is distinct from the raw `KTC` value column above, which has no such gap.)
- **Outlook** — columns (`PLAYER` · `PROJ` · `Δ VS NOW` · `PROJ G` · `SIGNALS` · `PPG ± SD`, then `ALL`'s Snap trend/Opp trend/Role or a position's `POSITION_STAT_COLUMNS` triple) originally harvested from the Explorer's `OutlookTab.jsx`; `POSITION_STAT_COLUMNS` now lives natively in `market/columnDescriptors.js` (moved there in 1b Slice viii before `OutlookTab.jsx` was deleted). `SIGNALS` reuses `src/utils/dynastySignalBadges.js` (Slice ii's pop-up helper, its second consumer) but **re-applies the Outlook column set's own `0.95–1.05` age-curve dead-band locally** (filtering the helper's output in Market, not editing the shared helper — the pop-up depends on the helper's unfiltered behaviour) and adds `⚠ Injury risk`. The signals sort key counts what Market actually renders post-filter.
- **Production** — per-position `COLUMNS` map originally harvested from the Explorer's `NflStatsTab.jsx`, now living natively in `market/columnDescriptors.js`, applied via `computeSeasonAverages`. Season-scoped, unlike the other two sets: a season `<select>` appears next to the segmented control only when Production is active, persisted to `localStorage['market-production-season']`, resets `page` to 1 on change (mirrors the Explorer's former `tableSeason` pattern). No game-log row-expander — that was the Explorer's row-expand, deleted with it; Market's row click opens the pop-up instead.

**Sort mechanics (§3.4a of the task file) — three behaviours that don't come free from `usePlayersTable`:**
1. Switching column sets calls the hook's `setSortState` (added Slice iii, additive — see the `src/hooks/` table) to re-assert the *new* set's own default sort, and resets `page`.
2. `usePlayersTable` is constructed with `defaultSort: DEFAULT_SORT[columnSet]` — the **active** set's default, not a fixed one — so a position-pill click (which resets sort to whatever `defaultSort` the hook was built with) always resets to the currently active set's default, not a stale one from a different set.
3. On every `columnSet`/`sortState.column` change, Market validates the current sort column against a per-set `SORTABLE_KEYS` allow-list and falls back to that set's default if the column isn't a member — covers a `market-sort` value restored from `localStorage` naming a column the active set has no column for (e.g. reloading with Production's `games` persisted while Value is the initial active set).

**Convergence debts — settled in 1b Slice viii.** The Explorer's hard-coded dynasty-score weight strings, inline signal-badge block, and two `/players`-scoped `ProfileDataContext` providers all disappeared with `PlayersTab.jsx` itself; `dynastyScore.components[*].weight`, `src/utils/dynastySignalBadges.js`, and the single App-level provider are now the sole sources.

---

## Player detail pop-up (`src/components/dp/PlayerDetailTabs.jsx` + `PlayerDetailModal.jsx`)

Opens from a row click (or Enter/Space on a focused row) on Market or Portfolio, via `onOpenPlayerDetail(player_id)` → `App.jsx`'s `openPlayerDetail(id)`. Mountable from any surface — the state lives in `App.jsx`, not in either table.

**Shell (`PlayerDetailTabs.jsx`, 1b Slice v)** — scrim (`z-40`) + panel (`z-50`, so it renders above the mobile `BottomTabBar`'s `z-40`), a tab strip, the compare matrix, and the body. `Escape` and a scrim click both close the whole pop-up.

**Body (`PlayerDetailModal.jsx`, 1b Slice ii, body-only since Slice v)** — one open player's identity row, four tiles (Dynasty score / Market value / Next season / Floor risk — values only, `PROVISIONAL(no-data)` on the Market-value tile's omitted 30-day Δ), a Career-PPG-and-projection bar chart, "What drives the score" (the five weighted `dynastyScore.components`) and "Why next season" (projection adjustment chips + closest career comps) side by side, and a right rail (POSITION IN PORTFOLIO share, SIGNALS badges via `src/utils/dynastySignalBadges.js`, RANK THIS SEASON peers). Eight empty states are handled explicitly (null `dynastyScore` entirely, null `.components`, null `.signals`, null `projection`, null `ktcValue`, `computeConsistency` returning `null`, a non-null consistency object with a null `sd`, and an empty `comps` list) — see `PlayerDetailModal.test.jsx`. Takes `{ playerId, myTeamName, onCompare }`; has no `onClose` of its own since Slice v moved the close affordances to the shell.

### Tab strip and multi-open (1b Slice v)

Up to `TAB_CAP` (4) players open at once, `App.jsx`'s `tabs[]` (oldest first) + `activeTab`. `openPlayerDetail(id)`'s signature is unchanged from Slice ii — activates an already-open tab rather than duplicating it; otherwise appends and activates. **At the cap, the OLDEST tab is evicted (FIFO)** — replacing the *active* tab was rejected during planning because it silently removes what the user is currently reading; FIFO applies identically whether the new tab came from a row click or the dropdown. Closing a tab activates its left neighbour (or `null`, closing the whole pop-up, when it was the last one). The FIFO-eviction and neighbour-activation rules are pure functions in `src/utils/tabState.js` (`addTab`/`removeTab`), extracted out of `App.jsx` specifically so they're unit-testable without mounting the whole app.

### Compare matrix (1b Slice v)

Renders only with ≥2 tabs open, seven rows (Dynasty score, Market value, Age, PPG now, PPG next, Games proj., Consistency — the mock's eighth row, `Risk`, is cut: this program has no Low/Med/High thresholds anywhere, and `Consistency` already carries the same underlying `±sd`). **Colours the winner relative to the currently open tabs** (the design doc's reading), not the mock's absolute per-player thresholds (`dyn >= 70`, `age <= 25`, etc.) — a matrix exists to compare, and an absolute threshold can mark a cell green in a comparison where that player is clearly the worse of the two. Missing values render `—` in muted and are excluded from the min/max entirely (a player with no KTC value must not "win" Market value by being null); an all-tie row (including the degenerate one-real-value case) renders every cell neutral.

All per-tab data is sourced through `useProfileData()` in one `useMemo`, never through `usePlayerProfile` — that hook is bound to a single `playerId` and cannot be called once per open tab. Two fields need care: `Games proj.` reads `seasonProjections[id]?.projectedGames` (not a `playerRowsWithProj` field — that memo never merges it), and `PPG now` reads the row's `currentSeasonPPG` guarded `> 0` (the row field is `0`, never `null`, for a player with no most-recent season; an unguarded `0` would render as real and could lose a comparison it was never actually part of).

### "+ Add player to compare" dropdown (1b Slice v)

No text input — the design specifies a static top-5 list, not a search field, so none was built. Suggestions are the top 5 open (non-open) players by `dynastyScore.score`, reusing `dp/cells.jsx`'s `PlayerCell` per row. Stays visible at the 4-tab cap (picking one just triggers the same FIFO eviction a row click would). The identity row's "Compare" button (dead in Slice ii — there was nothing to point it at yet) now opens this dropdown. `Escape` is handled by **one** `window` listener in the shell that branches on the dropdown's own open/closed flag — closing the dropdown if it's open, otherwise closing the whole pop-up — rather than two separate listeners, which can't express "close the dropdown only" (a second listener's `stopPropagation` against the first is a no-op on the same target).

### Convergence debts, settled

The tab strip above was meant to eventually retire the Explorer's own `ComparisonTray` and (with
its last consumer gone) `SpiderChart.jsx`, but neither could happen while `/players` was still
live. Both retired by deletion in 1b Slice viii, along with the rest of the five convergence debts
— see master-plan §6a.

---

## Team depth chart (`buildTeamDepthChart`)

`buildTeamDepthChart(nflTeam, playersMap, playerRows)` in `teamContext.js`.

Groups all skill-position players on `nflTeam` by position (QB/RB/WR/TE), sorts each group by `depth_chart_order` then by current-season PPG, and returns:

```js
{
  QB: [{ player_id, full_name, age, depthOrder, dynastyLabel, dynastyScore, dynastyConf, ktcValue, currentSeasonPPG }],
  RB: [...],
  WR: [...],
  TE: [...],
}
```

`usePlayerProfile.js` still computes this, returned under the key **`teamDepthChart`** (not
`depthChart` — that name appears nowhere in the hook; corrected 2026-08-17), but as of 1b Slice viii
it has **no renderer** — the Explorer's Player Profile panel was its only consumer, and that panel was deleted
with the surface. `dp/PlayerDetailModal.jsx` (the pop-up body Market/Portfolio open) does not read
it. Left computed rather than pruned, per CLAUDE.md's "don't refactor working utility functions
while implementing a feature" — re-adding a Team tab to the pop-up is a rendering job away, not a
re-derivation one.

---

## Systems (`src/components/dp/*`, `src/utils/coverageBand.js`)

dp-v2 Slice 1 landed five shared primitives and one pure util. All five components ship **unused**
this slice — exercised only by their own tests — because their real consumers (Overview career
charts, usage-trend cells, definition popovers on derived stats, degraded-data placeholders) are
Slices 4–7, which have real data behind them. This section documents the vocabulary so later
slices wire into it rather than reinvent it.

**Coverage bands** (`coverageBand.js`) — the single source of the "how much do we know" vocabulary:
`coverageBand(n)` maps an observation count to `'none' | 'low' | 'medium' | 'high'`
(`0` / `1-3` / `4-6` / `≥7`), `pipCount(band)` maps a band to a pip count (`0-3`). Mirrors
`ktcHistory.js`'s confidence thresholds but diverges at `n=1`: `computeKtcSignals` floors at
`n < 2` → `'none'` because every signal it emits is a *trend*, and a trend needs two observations;
`coverageBand` describes whether a value is *readable*, which takes one. `dp/CoveragePips.jsx`
renders the band as three ascending-height spans (`bg-dp-text-5` filled / `bg-dp-pip-off` unfilled)
— no colour under any prop, ever; decorative (`aria-hidden`), the caller carries the label in text.

**The one trend treatment** (`dp/TrendCell.jsx`) — series → signed delta (glyph first, colour
second: `▲`/`▼`/`→`) → window label, fixed order, three geometries (`cell`/`tile`/`section`) via a
lookup, not three components. Band-gated: `high`/`medium` show the series, `low` suppresses it
(delta + window survive), `none` renders `—` only; an absent or unrecognised band is treated as
`none` — this repo's direction on unknown input is to show less, not assert more. A band never
implies a delta exists (`coverageBand`'s `n=1` `'low'` can have `delta == null`); the caller passes
the delta, `TrendCell` never computes one. `projectedIndex` marks one bar dashed and excludes it
from nothing — it is the caller's job to keep it out of the delta calculation upstream.
**Distinct from the module-local, unexported `TrendCell` in `market/Market.jsx:182`** (the Outlook
set's Snap/Opp trend cells) — the name collision is Slice 5's to resolve when it wires this
primitive in.

**Definitions** (`dp/DefinitionPopover.jsx`) — click-triggered, never hover (must work by keyboard:
the trigger is a `<button>`, `Escape` closes and returns focus). Content order: term + scope → one-
sentence gloss → percentile strip (league 10th/50th/90th with the subject marked — no colour, no
verdict; further right is good for a receiver and bad for a runner) → coverage pips + span → field
expression (mono, wraps on any character). One popover open at a time via local state + a
click-outside handler — no context/provider.

**The five degraded kinds** (`dp/DegradedBlock.jsx`) — `not-yet-accruing` (capability real, history
hasn't happened), `not-measured-then` (hard coverage cliff at a date), `undefined-here` (no
denominator for this player-game), `never-available` (no source exists, none coming —
the only kind with the amber border/label pair, `dp-down-border`/`dp-down-text`; the other four are
neutral), `no-baseline` (value is real, no prior snapshot to diff against). Never a call to action —
no "check back soon", no retry, no link; the app is a static client over a CDN and cannot fetch what
is missing. An unrecognised kind degrades to the neutral border with the slug uppercased rather than
throwing.

**The two normalisation regimes** — `dp/cells.jsx`'s `CareerBars` is **zero-based** (`max` over
positive values; a `0.0` season must look like nothing but stay visible as a small stub).
`dp/SeriesBars.jsx` and `dp/TrendCell.jsx` are **min–max normalised** instead — a market-value
series like `9781 → 9989` is flat under zero-based scaling, so only min–max shows the movement the
column exists to show. Never render a value series with `CareerBars`, and never render a PPG series
with `SeriesBars`/`TrendCell` in `'scaled'` mode without a stated `domain`; both files carry this
rule as a header comment. A void slot (`null`/`undefined`/non-finite — only `Number.isFinite` counts
as measured) renders identically across both: no fill, a 1px dashed `border-top` in `dp-slate-2` at
the baseline, never a filled stub. `SeriesBars` never pads to a fixed length and never substitutes
`0` for a null; `'signed'` mode draws a real zero axis (positives above / negatives below a 1px
`dp-muted-2` rule) — required for series like PROE/EPA where a floored negative would render as the
same small positive stub that means *measured zero*, the exact confusion void slots exist to
prevent.

---

## Theming & tokens

All color is defined in `src/index.css` `@theme` as CSS custom properties and consumed via Tailwind's arbitrary-value syntax (`bg-[var(--token)]`). When adding a new surface or component, choose an existing token — never a raw Tailwind palette class. The app is dark-only (dp-v2 Slice 0): a new token now takes a single value. The existing `.dark` block and its overrides stay (the CSS is not retokenised) — but the block is not to be extended.

**Surfaces & elevation (1e).** The page is painted with `--color-canvas` (a distinct ground), and `--color-surface…--color-surface-5` are the cards/panels/fills that layer above it — a cool-tinted near-black canvas with standard lighter-as-higher elevation. The tint is fully contained in the canvas/surface/border block of `src/index.css` — re-tint there in one edit (shift hue, keep the step spacing). Text and semantic tokens remain AA on these surfaces.

## Color token system (`src/index.css`)

All UI color is expressed through CSS custom properties defined in `@theme` inside `src/index.css`. Components use Tailwind's arbitrary-value syntax — `bg-[var(--token)]`, `text-[var(--token)]` — instead of Tailwind's built-in color scale.

### Two-tier architecture

**Tier 1 — chromatic primitives** (`--c-{hue}-{shade}`): exact Tailwind palette hex values. Example: `--c-indigo-500: #6366f1`. Primitives are used directly when a specific shade is needed (badges, chart fills, focus states).

**Tier 2 — semantic role tokens**: reference primitives by role. Light values are the exact hex in use today; dark-mode values are defined in the `.dark` block but not yet applied.

Key semantic groups:

| Group | Tokens |
|---|---|
| Surface | `--color-surface` … `--color-surface-5` |
| Border | `--color-border`, `--color-border-strong` |
| Text | `--color-text`, `--color-text-strong`, `--color-text-secondary`, `--color-text-semi-muted`, `--color-text-muted`, `--color-text-faint`, `--color-text-faintest`, `--color-text-disabled` |
| Accent (indigo) | `--color-accent`, `--color-accent-text`, `--color-accent-hover`, `--color-accent-subtle-bg`, `--color-on-accent` |
| Semantic | `--color-positive-text`, `--color-negative-text`, `--color-scrim`, `--color-tooltip-bg/fg` |
| Chart | `--color-chart-grid`, `--color-chart-axis`, `--color-chart-label`, `--color-chart-recent`, `--color-chart-above`, `--color-chart-below` |
| Compare / sparkline | `--color-compare-1`, `--color-compare-2`, `--color-sparkline` |
| Toast / inverse surface | `--color-toast-bg`, `--color-toast-track` (dark surface even in light mode) |
| Confidence dots | `--color-conf-dot-high`, `--color-conf-dot-moderate`, `--color-conf-dot-default` |
| Market / phase | `--color-market-up/down/neutral`, `--color-phase-*` |

The `.dark` block in `index.css` does not contain overrides for every token — 29 semantic tokens have one and 35 deliberately do not (both verified AA on both grounds in 1b Slice 1e). It is activated via the class variant `@custom-variant dark (&:where(.dark, .dark *))`; class `dark` on `<html>` is now unconditional (dp-v2 Slice 0 — the app is dark-only).

