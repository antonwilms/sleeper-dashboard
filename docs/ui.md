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

The app uses a persistent nav shell (`AppShell`) with a **desktop left rail** (`NavRail`, grouped since the Dynasty Portfolio redesign — 1b Slice i) and a **mobile bottom tab bar** (`BottomTabBar`, flat, capped at 5). Rail groups: **MANAGE** (Portfolio, Market) · **LEAGUE** (Standings, Schedule, Rosters). **The ACT group (Trade desk, Draft board) was removed in dp-v2 Slice 5a** — both members are gated placeholders, and a rail group with a dead third undermined the rest of it; their routes (`/trade`, `/board`) stay live and reachable by URL, they are simply no longer linked from the rail or tab bar.

| Surface | Route | Status |
|---|---|---|
| **Portfolio** | `/portfolio` | Placeholder as of 1b Slice i — content lands in Slice iv |
| **Market** | `/market` | **Default landing (`DEFAULT_ROUTE`, temporarily — see below).** Real table since 1b Slice iii: Value/Outlook/Volume column-set switch, position pills, sort, pagination, row click/keyboard → the Slice ii detail pop-up. See *Market* below |
| **Draft board** | `/board` | Gated placeholder — requires marginal-value engine + season-phase classifier. Route-only since dp-v2 Slice 5a (not in nav) |
| **Trade desk** | `/trade` | Gated placeholder — requires marginal-/phase-aware trade evaluator. Route-only since dp-v2 Slice 5a (not in nav) |

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

The redesign's data-display surface (1b Slice iii, `.claude/tasks/dynasty-portfolio-1b-iii-market.md`) — one table over `playerRowsWithProj`, dark-only `--color-dp-*`, no `ProfileDataContext` (gets `playerRows`/`loaded`/`careerStats`/`playerMap`/`seasonProjections`/`ktcHistory`/`gameLogsByYear`/`teamContextByYear`/`historicalTeamTotals`/`advStats`/`myTeamName`/`onOpenPlayerDetail` as props from `App.jsx`; `ktcHistory` added dp-v2 Slice 5a for the TREND gutter's sparkline, the next four added dp-v2 Slice 5b for the Efficiency set). Row click (or Enter/Space on a focused row — rows are `role="button"`/`tabIndex={0}`) calls `onOpenPlayerDetail(player_id)`, opening the Slice ii detail pop-up. `dp/MarketTable.jsx` is the presentational shell (`PAGE_SIZE = 50`, own position-pill row and pager). Its cell components (`SortTh`, `PlayerCell`, `ClickableRow`, `CareerBars`, `DeltaCell`) moved to `dp/cells.jsx` in Slice iv so Portfolio could import rather than fork them — a pure relocation, Market's own rendering unchanged.

**Segmented column-set control** — **Value / Outlook / Volume** (renamed from Production, dp-v2 Slice 5a — the persisted key changed too, `'production'` → `'volume'`, with a one-time migration on read: a stored `'production'` resolves to `'volume'` and is written back; an unrecognised value still falls back to `'value'`), persisted to `localStorage['market-column-set']`, validated on read. **Grouped into two labelled pairs since Slice 5a** — `MODEL & MARKET` (Value, Outlook) and `ON FIELD` (Volume) — rather than four flat peers; a future Efficiency set (5b) joins the right-hand group. Position pills (All/QB/RB/WR/TE) sit below it, in the same row as the filter bar (1b Slice vi). Free-text search and saved presets landed in **1b Slice vii** — see the filter bar section below.

**TREND gutter (dp-v2 Slice 5a §4)** — a persistent column immediately right of `PLAYER`, present under **every** column set (unlike everything else in this section, which is per-set), rendering `dp/TrendCell` at `scale="cell"`. Delta/window/band are read straight off `seasonProjections[id].factors` (`ktcHistDelta`/`ktcHistWindowSpanDays`/`ktcHistConfidence`) — already merged onto rows upstream by `seasonProjection.js:307` — never recomputed in Market. The sparkline's raw series (`ktcHistory.series[id]`, entries `{date, value, …}`) is mapped to `.value` before reaching `dp/TrendCell`, which keeps only finite numbers. Delta is `ktcHistDelta` (the raw KTC point change, not the rounded `ktcHistDeltaPct` fraction) — chosen because `dp/TrendCell`'s glyph renders `delta` as a bare number with no unit suffix, and a point change on the same 0–10000 scale as the `KTC` column needs none; window is `ktcHistWindowSpanDays` converted to whole weeks (`13w`). Sorts via a comparator branch (`_trend`, reading `.delta`) in all three sets, following the existing `_snapTrend`/`_oppTrend` precedent — a bare-key sort would silently no-op since the value is an object. `colSpan` is bumped in all three sets to match. View-only; never moves `projectedPPG`.

### Filter bar + panel (`market/FilterBar.jsx` + `market/FilterPanel.jsx`, 1b Slice vi)

Market reached **functional** parity with the Explorer's filter set (master-plan §6a — the union of the Explorer's ten dimensions plus the design's `Min projected games`, minus the design's `Risk` group, which stays cut per §4a.2 since its Low/Med/High thresholds are still undefined; the Explorer itself was deleted in 1b Slice viii once that parity was reached). Predicates live in `src/utils/marketFilters.js` — pure, no React — originally harvested from the Explorer's `PlayersTab.jsx`, now the single source since that file's deletion. `DYNASTY_GROUP_MAP` and `NFL_TEAMS` were `PlayersTab.jsx`-owned data, imported from there until Slice viii; they now live natively in `marketFilters.js`, since they're data whose labels must track `dynastyScore`'s label set.

- **Placement.** `dp/MarketTable.jsx` gained an optional `filterBar` render-prop, rendered in the SAME flex-wrap row as the position pills — additive, matching the design's one-row Filter-bar paragraph (position control → active pills → "+ Add filter" → right-aligned actions). The panel itself is a `w-full` child of that row, which is what pushes it onto its own line below the bar without a second render slot.
- **Sixteen dimensions** (dp-v2 Slice 5c, up from twelve), grouped Player (starters-only, rookies-only, age range, experience range) / Availability (all/my roster/available/NFL free agent) / Team (NFL team + fantasy team multi-selects) / Dynasty (four dynasty-group chips, market-signal radio, KTC range) / Projection (min projected games) / **Environment** (`NEW`, dp-v2 Slice 5c — Team PROE / pace / off. EPA-play / RZ TD rate) / **Search** (free-text, 1b Slice vii, in the bar itself rather than the panel).
- **Sentinel gating** — the three range filters (age/experience/KTC) and `minProjectedGames` only filter when they differ from their default. A null-valued row (no age, no `years_exp`, no `ktcValue`, no `seasonProjections` entry) passes at rest and is dropped only once that control moves. The `FilterPanel`'s slider bounds are read directly from `marketFilters.DEFAULT_MARKET_FILTERS` rather than re-declared, so they cannot drift from the values the predicates gate on.
- **Live filtering.** `filters` is `Market.jsx` view-local state (like `columnSet`), persisted to `localStorage['market-filters']` and validated on read via `normalizeFilters` (per-key type/length/enum, not key presence — a stale `ageRange: ["18","45"]` would otherwise pass a presence check and read as active). Every change resets `page` to 1. Filters apply live; the panel's "Apply · N players" button only closes the panel, it never commits a draft.
- **Header count.** The subline now reads `${filtered} of ${total} players · N filters active` once any filter is active, replacing the unconditional "every asset in the league, owned or not" copy — so the header, the pager's "X–Y of Z", and the panel's Apply-button count always agree.

**Environment filters (dp-v2 Slice 5c)** — the first Market filters that join through teamcontext rather than reading a player-row field directly. Team PROE/pace/off. EPA-play/RZ TD rate each keep only players whose team's **league rank** for that metric is `<= N`, joined at **season grain** via `resolvePlayerTeam` (`careerStats[dataSeason][pid].team`; never week grain — no gamelogs needed for this join).
- **`32 = any` is the one dimension whose OFF state is a MAXIMUM**, not a minimum or a full span — every other filter is off at `0` or its range's full extent. The control's floor is `1` (`0` would mean "no team passes," a state the UI must never reach), and the pill/slider read `top N of 32` / `any` at the ceiling. `LEAGUE_TEAM_COUNT` (`marketFilters.js`) is `NFL_TEAMS.length`, not a second `32` literal.
- **A memoised rank table, not a per-row/per-call recompute.** `computeLeagueStanding` (the pop-up's helper) re-runs `computeTeamSeasonMetrics` for all 32 teams to return one rank — fine once per pop-up render, far too expensive inside a filter predicate over ~600 rows × 4 metrics on every keystroke. `environment.js`'s new `buildLeagueRankTable(loaded, metricIds)` computes every team's metrics once, then ranks each requested id from that single pass; `Market.jsx` memoises its result once per `dataSeason` (**not** the user-selectable `activeVolumeSeason` — both are in scope, and binding to the wrong one would silently re-join the filters to whatever season Volume's selector holds) and passes the **table**, not the loader, into `applyMarketFilters`. `computeLeagueStanding` itself is unchanged. **Gated on the season's `complete` flag, not key presence** — an incomplete load yields empty per-metric maps that the graceful-null rule below would otherwise read as "no team has a rank," dropping every row the moment a control moved; incomplete is treated exactly like absent, and all four filters go inert.
- **Metric ids are `environment.js`'s new `FILTER_METRICS`** (`proe`/`pace`/`epaPerPlay`/`rzTdRate`), a deliberately different list from the pop-up's `SERIES_METRICS` (which carries `successRate` instead of `epaPerPlay`) — both constants are commented as intentionally different sets, not reconciled.
- **Graceful nulls** — a player whose team doesn't resolve, or whose team has no rank for the metric being filtered, passes while every env filter is untouched and is **dropped once any of the four moves** — the same rule ageRange/ktcRange follow for a null age/KTC value, not a permanent pass. If `rankTable` is absent entirely (no teamcontext loaded for the season), all four filters are inert instead.
- **Presets: absent ≠ invalid.** `isRestorableFilters` treats the four `env*Top` keys as valid when **absent** (a pre-5c preset has none of them) but still rejects a **present-but-invalid** value, unlike every key before it, which is required either way. Requiring them the same strict way as the rest would have silently dropped every saved preset the moment this slice shipped.

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
- **Outlook** — columns (`PLAYER` · `TREND` (gutter, above) · `PROJ` · `Δ VS NOW` · `PROJ G` · `SIGNALS` · `PPG ± SD`, then `ALL`'s Snap trend/Opp trend/Role or a position's `POSITION_STAT_COLUMNS` triple) originally harvested from the Explorer's `OutlookTab.jsx`; `POSITION_STAT_COLUMNS` now lives natively in `market/columnDescriptors.js` (moved there in 1b Slice viii before `OutlookTab.jsx` was deleted). `SIGNALS` reuses `src/utils/dynastySignalBadges.js` (Slice ii's pop-up helper, its second consumer) but **re-applies the Outlook column set's own `0.95–1.05` age-curve dead-band locally** (filtering the helper's output in Market, not editing the shared helper — the pop-up depends on the helper's unfiltered behaviour) and adds `⚠ Injury risk`. The signals sort key counts what Market actually renders post-filter. The Snap trend/Opp trend cell component is `UsageTrendCell` (renamed dp-v2 Slice 5a §4.4, from a module-local `TrendCell` — the name now belongs to the `dp/TrendCell` primitive that powers the TREND gutter; the rename is behaviour-preserving, these two columns are otherwise untouched).
- **Volume** (renamed from Production, dp-v2 Slice 5a) — per-position `COLUMNS` map originally harvested from the Explorer's `NflStatsTab.jsx`, now living natively in `market/columnDescriptors.js`, applied via `computeSeasonAverages`. Season-scoped, unlike the other two sets: a season `<select>` appears next to the segmented control only when Volume is active, persisted to **`localStorage['market-production-season']`** — the key itself is deliberately **not** renamed, since the read falls back to the season list's first entry on a miss and a renamed key would silently drop every user's stored season; a comment at the read site says so — resets `page` to 1 on change (mirrors the Explorer's former `tableSeason` pattern). No game-log row-expander — that was the Explorer's row-expand, deleted with it; Market's row click opens the pop-up instead.
- **Efficiency** (dp-v2 Slice 5b, the fourth set, joining Volume in the `ON FIELD` group) — per-position (`EFFICIENCY_COLUMNS` in `market/columnDescriptors.js`; `ALL` reuses WR/TE's list rather than inventing a fifth cross-position shape): QB `EPA/ATT`/`CPOE`/`SACK%`/`AY/ATT`/`RUSH EPA`; RB `CARRY SH`/`TGT SH`/`RUSH EPA/ATT`/`YAC`/`BTKL`; WR/TE `TGT SH`/`AY SH`/`aDOT`/`EPA/TGT`/`RACR`/`RZ SH`/`SNAP%`/`DROPS`. Single-season, **pinned to `dataSeason`** — the season `<select>` stays hidden, unlike Volume's; the header states this explicitly ("Fixed to the *N* season … unlike Volume") rather than leaving the numbers' disagreement with Volume unexplained.
  - **New helper `src/utils/seasonEfficiency.js`** — a one-pass aggregator over `gameLogsByYear[dataSeason].players`, memoised in Market on the loader results + `dataSeason` (not recomputed per row/sort/filter — ~600 players × ~17 games is the trap 5a's TREND gutter already set the precedent for avoiding). REG-only; sums components then divides, never averages a per-game rate. **`CPOE` is attempt-weighted** — `Σ(passingCpoe × attempts) ÷ Σattempts` — because `passingCpoe` is itself a per-game rate, and a plain mean would let one low-attempt game (e.g. 3 attempts at +40%) read as an elite season. `CARRY SH` is the one cross-family join, `Σ gamelogs.carries ÷ Σ teamcontext.off.rushPlays` matched `(team, week)` — deliberately wider than the per-season-team rush share elsewhere in this app, since `off.rushPlays` includes QB scrambles/sneaks that the skill-cohort denominator excludes; its `resolvePlayerTeam` calls receive REG-filtered games only, since that helper's week-grain lookup (`games.find(g => g.week === week)`) is seasonType-blind and a POST row sharing a week number could otherwise win.
  - **`RACR`** reads the new `advStats` prop directly (`advStats?.byId?.[id]?.racr`, gated on `advStats.complete`, not key presence) rather than re-deriving `receivingYards÷receivingAirYards` from gamelogs — Market is advstats' first UI consumer since the Explorer's `AdvancedStatsPanel.jsx` was deleted in 1b Slice viii.
  - **`TGT SH`/`AY SH`/`aDOT`/`RZ SH`/`SNAP%`** reuse `outlookPositionStats.buildPositionStatSeries`/`usageEfficiency.buildRzShareSeries`/`outlookUsage.buildUsageHistory` unedited, taking each series' latest entry **only when that entry's season equals `dataSeason`** — those helpers gate at `gamesPlayed≥8` (shared with the projection's attribution; not forked), so falling back to a stale prior-season value when the current season hasn't qualified yet would misrepresent a table whose header claims one fixed season. In practice this means all five columns render `—` for roughly the first half of every season — stated in the header, not worked around, and invisible to an offseason smoke.
  - **`METRIC_META`** (`usageEfficiency.js`) is the single metadata source, extended additively with the twelve new entries above (`epaPerAtt`/`cpoe`/`sackPct`/`ayPerAtt`/`rushEpaTotal`/`carrySh`/`rushEpaPerAtt`/`yac`/`btkl`/`epaPerTgt`/`racr`/`drops`) rather than a second metadata map in the Market module; Market reads only `.label`/`.format`/`.field`/`.note` from it (never `.domain`/`.deltaFormat`, which serve the pop-up's multi-season rows).
  - **Position-aware default sort** — `EFFICIENCY_LEAD_SORT` (QB→`EPA/ATT`, RB→`CARRY SH`, WR/TE→`AY SH`/`airYardsShare`) is asserted via the `setSortState` escape hatch on both a column-set switch *into* Efficiency and a position-pill click *while* Efficiency is active — `DEFAULT_SORT` alone is keyed by set, not by `(set, posFilter)`, so it can't express this. The stale-column fallback effect is also position-aware for this one set (`EFFICIENCY_SORTABLE_KEYS_BY_POS`, keyed by `posFilter`) rather than a flat per-set union, which would let e.g. a QB-only column pass validity while a WR pill is active.
  - Four new props (`gameLogsByYear`/`teamContextByYear`/`historicalTeamTotals`/`advStats`) — Market stays props-only.

**Sort mechanics (§3.4a of the task file) — three behaviours that don't come free from `usePlayersTable`:**
1. Switching column sets calls the hook's `setSortState` (added Slice iii, additive — see the `src/hooks/` table) to re-assert the *new* set's own default sort, and resets `page`.
2. `usePlayersTable` is constructed with `defaultSort: DEFAULT_SORT[columnSet]` — the **active** set's default, not a fixed one — so a position-pill click (which resets sort to whatever `defaultSort` the hook was built with) always resets to the currently active set's default, not a stale one from a different set.
3. On every `columnSet`/`sortState.column` change, Market validates the current sort column against a per-set `SORTABLE_KEYS` allow-list and falls back to that set's default if the column isn't a member — covers a `market-sort` value restored from `localStorage` naming a column the active set has no column for (e.g. reloading with Volume's `games` persisted while Value is the initial active set). `market-sort` itself needed no migration for the Production→Volume rename — its payload is `{column, direction}` with no set key, and this same fallback already covers a column the active set doesn't carry.
4. The `TREND` gutter's `_trend` key is a comparator branch in every set (reading `.delta` off an object), not a bare-key lookup — `Value`/`Outlook` resolve `a[key]` off the row and `Volume`/`Efficiency` resolve `a._avg?.[key]`/`a._eff?.[key]`, none of which reaches a nested delta, so every sort branch special-cases `_trend` the same way `_snapTrend`/`_oppTrend` already did.
5. **Efficiency's default sort is per-`(set, posFilter)`, not per-set** (dp-v2 5b) — `usePlayersTable`'s built-in position-pill reset only knows one fixed `defaultSort`, which can't vary by position, so Market wraps both the position-pill handler and the column-set-switch handler to additionally call `setSortState(EFFICIENCY_LEAD_SORT[posFilter])` for Efficiency specifically. The stale-column fallback effect (point 3, above) is likewise position-aware for this one set, checking a per-position key set rather than a flat per-set union — a union would let a QB-only column like `cpoe` pass validity while a WR pill is active, leaving the sort silently stuck on a column WR has no header for.

**Convergence debts — settled in 1b Slice viii.** The Explorer's hard-coded dynasty-score weight strings, inline signal-badge block, and two `/players`-scoped `ProfileDataContext` providers all disappeared with `PlayersTab.jsx` itself; `dynastyScore.components[*].weight`, `src/utils/dynastySignalBadges.js`, and the single App-level provider are now the sole sources.

---

## Player detail pop-up (`src/components/dp/PlayerDetailTabs.jsx` + `PlayerDetailModal.jsx`)

Opens from a row click (or Enter/Space on a focused row) on Market or Portfolio, via `onOpenPlayerDetail(player_id)` → `App.jsx`'s `openPlayerDetail(id)`. Mountable from any surface — the state lives in `App.jsx`, not in either table.

**Shell (`PlayerDetailTabs.jsx`, 1b Slice v)** — scrim (`z-40`) + panel (`z-50`, so it renders above the mobile `BottomTabBar`'s `z-40`), a tab strip, the compare matrix, and the body. `Escape` and a scrim click both close the whole pop-up.

**Body (`PlayerDetailModal.jsx`, 1b Slice ii, body-only since Slice v; continuous scroll + section index since dp-v2 Slice 3; Game log + Distribution added Slice 4a; Usage & efficiency + Availability & role added Slice 4b; Environment added Slice 4c — Slice 4 complete)** — a non-scrolling row of a **140px section index** (`dp/SectionIndex.jsx`) beside a single `overflow-y-auto` scroll column holding **eight** sections, in this order: `§overview` (identity row, four tiles — Dynasty score / Market value / Next season / Floor risk, values only, `PROVISIONAL(no-data)` on the Market-value tile's omitted 30-day Δ — a Career-PPG-and-projection bar chart, **and the right rail**), `§game-log` (below), `§distribution` (below), `§usage` (below), `§availability` (below), `§environment` (below), `§drivers` ("What drives the score" — the five weighted `dynastyScore.components`), and `§why-next` ("Why next season" — projection adjustment chips + closest career comps). `SECTIONS` (the id/label const) and the literal JSX order are edited together and must agree — the const drives the index and the `IntersectionObserver` scroll-spy, but the scroll column's rendered order is the JSX order, not the const's. Section labels render **in the index only**; the existing card titles remain each section's sole visible heading. The **right rail** (POSITION IN PORTFOLIO share, SIGNALS badges via `src/utils/dynastySignalBadges.js`, RANK THIS SEASON peers) is scoped inside `§overview` and scrolls away with it. Clicking an index row scrolls to the section (`Element.scrollIntoView`) and highlights it; the active section is otherwise tracked via `IntersectionObserver` against the scroll column. No route, no hash — the pop-up is deliberately routeless. **At ≥1180px** (the `dpwide:` breakpoint token, `--breakpoint-dpwide` in `src/index.css`'s `@theme`): index + main column + 300px right rail beside `§overview`. **Below 1180px**: the index is hidden and the right rail stacks full width below the `§overview` content. Empty states are handled explicitly throughout (null `dynastyScore` entirely — this branch renders no index and no scroll column at all — null `.components`, null `.signals`, null `projection`, null `ktcValue`, `computeConsistency` returning `null`, a non-null consistency object with a null `sd`, an empty `comps` list, and each new section's own degraded paths below) — see `PlayerDetailModal.test.jsx`, `PlayerDetailModal.gameLogDistribution.test.jsx`, `PlayerDetailModal.usageAvailability.test.jsx` and `PlayerDetailModal.environment.test.jsx`. Takes `{ playerId, myTeamName, onCompare }`; has no `onClose` of its own since Slice v moved the close affordances to the shell.

### Game log and Distribution (dp-v2 Slice 4a)

**`§game-log`** (`dp/GameLogSection.jsx`, helpers in `src/utils/gameLog.js`) — one row per game the player's team played in `mostRecentSeason` (from `usePlayerProfile`'s `mostRecentSeason`, no season selector), REG weeks 1–18 then POST, each row a context block from `nflScheduleByYear` (`WK · OPP · RESULT · SPREAD · TOTAL · ROOF · WEATHER`) plus a **per-position** production block from `gameLogsByYear` and a right-aligned `PTS`.

- **Byes vs did-not-play** come from `careerStats[season][playerId].weeklyStatus` (18-slot, `week-1`-indexed, `'P'`/`'B'`/`'D'`) — **never** a schedule scan (that derivation is circular: the week-grain team join reads the very gamelogs row that's absent on a bye). A `'B'` week renders a labelled full-width row (`WK n · BYE — no row exists in the source. Not a zero.`); a `'D'` week renders the real schedule context with `—` across the production block and `PTS`.
- **`RESULT` is derived**, not printed — `schedule.games[].result` is the home margin (`null` for every unplayed game, `0` a tie); `deriveGameResult()` orients it to the player's own team via `homeTeam`/`awayTeam` and both scores.
- **`PTS` reads `careerStats[...].weeklyPoints[week]`** (object, 1-based key) — this app's league-scored points, not `gamelogs`' nflverse `fantasyPoints`/`fantasyPointsPpr`. It is REG-only, so every POST row's `PTS` is `—` by design.
- **Production is per position** (`GAME_LOG_COLUMNS` in `gameLog.js`, `TE` aliases `WR`): QB gets `CMP/ATT · YDS · TD · INT · EPA/ATT`; RB gets `CAR · YDS · TD · TGT · REC · EPA/CAR`; WR/TE get `TGT · REC · YDS · TD · aDOT · EPA/TGT`. Every rate is recomputed from its game-level counting components; a zero/null denominator renders `—`, never `0`.
- Team resolution for the schedule join is `resolvePlayerTeam` (week grain first — era-remapped from the gamelogs row's own `team` field — season grain as fallback for weeks with no gamelogs row).
- Degrades to `DegradedBlock` (heading still renders) when `gameLogsByYear`/`nflScheduleByYear` aren't `complete` for the season, or when the player has no `games[]` in an otherwise-complete family (rookie → `NOT YET — ACCRUING`, otherwise `NOT MEASURED THEN`).

**`§distribution`** (`dp/DistributionSection.jsx`, bucket helpers in `src/utils/distribution.js`) — a histogram of per-game fantasy points, pooled over `computeConsistency`'s **own** `seasons` window (the same 3-qualifying-season pool the Overview tile's `±SD` uses — reused, never re-derived, so the two numbers are provably identical) via `outlookConsistency.extractGamePoints`. Buckets are 5-point (`0–5 … 30–35`, `35+`) **plus an explicit `<0` bucket** (per-game league points do go negative). An empty bucket renders a void slot (dashed baseline), never a zero-height fill. A shape block alongside gives pooled mean/SD/CV and `X of N` counts over 20 and under 10, `N` always the pooled game count; coverage pips read the pooled **game** count via `coverageBand`, not the season count (`coverageBand(≤3)` would read `'low'` for every player if seasons were used, since `computeConsistency` caps its window at 3 seasons). `consistency === null` renders `NOT YET — ACCRUING`; a non-null consistency with a null `sd` (pooled games under `MIN_POOLED_GAMES`) still draws the histogram and shape block, with the SD row and the ±1 SD dashed markers omitted.

### Usage & efficiency and Availability & role (dp-v2 Slice 4b)

Both render **existing** derivations only — this slice adds no new denominator, stat-key reader or
`App.jsx` state; `src/utils/outlookPositionStats.js` and `src/utils/outlookUsage.js` are unedited.

**`§usage`** (`dp/UsageEfficiencySection.jsx`, alignment helpers in `src/utils/usageEfficiency.js`)
— per-metric rows built on `outlookPositionStats.POSITION_STAT_METRICS`: QB gets `cmpPct` /
`passerRating` / `sacks`; RB gets `rushShare` / `rbTargetShare` / `yardsPerCarry` plus a snap-share
row; WR/TE get `targetShare` / `airYardsShare` / `aDOT` plus a snap-share row. **QB never gets a
snap-share row** — `usageMetrics.js`'s `SNAP_POSITIONS` (RB/WR/TE only) gates it out because QB
snap share is near-constant (~0.95) and would wrongly penalise injury-fill starters; respected here
by construction rather than re-imported. Snap share itself is `outlookUsage.buildUsageHistory`'s
existing `snapPct` (`off_snp ÷ tm_off_snp`), the same call `Market.jsx`'s Outlook column set already
makes with the same `perSeasonTeamShares` deps — never recomputed. Every metric is projected onto
one shared season axis (`PlayerDetailModal.jsx`'s `axisSeasons`, `careerHistory.slice(-5)`'s
seasons — also feeds `§availability`'s grid) via `alignToAxis`, so a season a given metric doesn't
qualify for is a `null` void slot at the *same x position* every other row uses, never a collapsed
or misaligned bar. `SeriesBars` renders in `scaled` mode with an explicit domain for bounded
fraction metrics (`[0,1]` for the shares/snap share, `[0,100]` for `cmpPct`, `[0,158.3]` for
`passerRating` — a share series is unreadable auto-scaled) and the floor/ceiling is captioned on
the card; `sacks`/`yardsPerCarry`/`aDOT` have no natural fixed ceiling and stay auto-scaled. Each
row shows the latest real value, the signed delta **vs. the axis's first season specifically** (not
a latest-vs-prior trend — `null` when that first season itself has no value, never a substituted
baseline), coverage pips + span from its own non-null count on the axis, a one-line note, and the
raw field expression in a `DefinitionPopover`. **Pre-2020 snap-share seasons are void slots, never
`0`** (`off_snp` starts 2020; `buildUsageHistory` already guards this) — when the axis includes one,
the snap-share row also carries a `NOT MEASURED THEN` note. A `DISPLAY ONLY` badge sits at the top
of the section. `EPA per opportunity` is **cut permanently** (`fb8c2dd`) — gamelogs is 8.2 MB/season,
so a five-season series would cost ~33 MB to draw five bars, and `advStats`, the only cheap
season-aggregated alternative, carries no EPA. **Red-zone share** was cut from this slice and added
in dp-v2 Slice 4c, once `historicalTeamTotals` (the projection-side `computeHistoricalTeamTotals`,
threaded onto `ProfileDataContext` that slice) was available: `src/utils/usageEfficiency.js`'s
`buildRzShareSeries` reads `rush_rz_att÷historicalTeamTotals[season][team].rushRz` for RB,
`rec_rz_tgt÷…recRz` for WR/TE — QB excluded, same reasoning as snap share (its own-team red-zone
pass-attempt share is ≈1.0, no signal). `historicalTeamTotals` was deliberately chosen over the
view-only `buildTeamShareTotals` used for the other shares: extending that function would inherit
its `playerMap` membership gate, which drops retired ids and biases older seasons' shares high —
exactly the seasons the section's "delta vs first shown" measures against.

**`§availability`** (`dp/AvailabilityRoleSection.jsx`, `src/utils/availabilityGrid.js`) — two of the
design's three blocks. A games-played grid (the same `axisSeasons` × 18 weeks) reads
`careerStats[season][pid].weeklyStatus` and renders **all four** codes: `P` played, `D` did not
play, `B` bye, `X` "no game recorded". `B` is real but is currently only ever seen in **API-only
mode** (`VITE_DATA_STORE_URL` unset) — the served `nfl/season-totals` files never emit it (verified
across every player in the 2025 file; real byes land in `X` there), so `X`'s legend/caption says so
explicitly when the rendered window has any. The legend lists `B` only when the window actually has
one. Byes are **never** reconstructed from the schedule — season-grain team is a single dominant
team per season (CR-02's `aggregateWeeks` rule), so a traded player would get phantom byes for his
old team's weeks. The design's third block, a weekly status strip sourced from Sleeper players-state
snapshots, is **omitted outright** — the app has no loader for that family (capture-only in the data
repo) — and gets **no `DegradedBlock`** standing in for it: the degraded kinds describe states of
data, and dressing an unwired capability as `NOT YET — ACCRUING` would say something false. The
depth chart reads the hook's **`teamDepthChart`** (not `depthChart` — see below), the subject's own
position group only, with the subject's row marked; an empty or missing group renders a
`DegradedBlock` (`no-baseline`) rather than an empty list. `roleRank`/`usageShare` (also dark since
1b Slice viii) were judged not to fit either block and were left dark rather than given an invented
third one.

### Environment (dp-v2 Slice 4c)

**`§environment`** (`dp/EnvironmentSection.jsx`, helpers in `src/utils/environment.js`) — the last
piece of Slice 4, and the family's first rendering consumer anywhere in `src/` of teamcontext's
`off.*`/`def.*` shape (previously loader-only). `App.jsx`'s existing `teamContext` effect (Slice 2)
was widened in this slice from `dataSeason`-only to a **five-season window**
(`Promise.allSettled`-batched, one merged setter write), and `historicalTeamTotals` — the existing
`App.jsx` projection-side memo, unedited — was threaded onto `ProfileDataContext` alongside it
(thirteen keys → **fourteen**).

Four series metrics, each a REG-only season aggregate — `computeTeamSeasonMetrics` filters to
`seasonType === 'REG'`, sums the counting components across a team's games that season, then
divides (never sums a stored rate, CR-10's rule):
- **PROE** — `(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)`, a **difference**,
  `signed` mode. The denominator is `proePlays`, not the also-present `proePassPlays` — verified
  against real `nflverse/teamcontext/2025.json` (ARI week 1: `37/61 − 36.561/61 = +0.0072`, matching
  the stored `proe` of `0.007`; pairing with `proePassPlays` gives `−0.3816`, nonsense).
  `src/api/teamContext.js`'s header comment paired the fields wrongly until this slice fixed it —
  it was the only in-repo record of the pairing.
- **Pace** — `Σ off.neutralSeconds ÷ Σ off.neutralGaps`, `scaled` mode, **lower is better** — its
  league rank is computed in the opposite direction from the other three metrics here.
- **Success rate** — `off.successes ÷ off.successPlays` (NOT `÷ off.plays`, which returns ≈1.0 for
  every team), `scaled` mode.
- **Red-zone TD rate** — `off.rzTdTrips ÷ off.rzTrips`, `scaled` mode.

**Its own axis, not 4b's** — `envAxisSeasons` (computed once in `PlayerDetailModal.jsx`) is
`Object.keys(careerStats).sort().slice(-5)`, the last five **league** seasons — the same window
`App.jsx`'s loader effect requests — not `axisSeasons` (4b's `careerHistory.slice(-5)`, the
player's last five seasons *with data*). For an older player those two sets can be entirely
disjoint, which would make every Environment bar a void slot if the section reused 4b's axis.
Per season, the player's team is resolved via `resolvePlayerTeam` and rendered once in a shared
"Team by season" caption above all four rows (a traded player's bars span franchises — this is
correct and must be labelled, not mistaken for one team's own trend). A season with no resolved
team, or with `teamContextByYear[season]` absent or `complete !== true`, is a per-metric void slot.
If the player's team resolves in **none** of the loaded seasons, the whole section renders a
`DegradedBlock` (`not-yet-accruing`) instead of five empty splits, mirroring 4b's
`UsageEfficiencySection` empty-axis precedent.

**League median and rank** (`computeLeagueStanding`) come from the *same loaded season's* full
32-team `teams` object — no extra fetch, and always the same season as the value being ranked.
Rendered as `Nth of 32`.

A **splits block** beneath the series (current season only, not a trend): `off.epaSum÷epaPlays`
with a pass/rush split (`passEpaSum÷passEpaPlays` / `rushEpaSum÷rushEpaPlays`), `Σ plays ÷ games`,
`Σ pointsScored ÷ games`, and the player's own defense's `def.epaSum÷epaPlays` — captioned with its
polarity (negative = the defense playing well, which is *bad* for the player's own offensive
volume) rather than coloured by the offensive rows' up/down convention, since the sign means the
opposite thing here.

`DISPLAY ONLY` badge, same as `§usage`; guarded by `teamContextViewOnly.test.js` (unedited, still
green) — none of this reaches projection or scoring.

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
`depthChart` — that name appears nowhere in the hook; corrected 2026-08-17). The Explorer's Player
Profile panel, its original consumer, was deleted with that surface in 1b Slice viii, leaving it
dark; **it has a renderer again as of dp-v2 Slice 4b** — `dp/AvailabilityRoleSection.jsx`'s depth
chart block, in the pop-up's `§availability` section, showing the subject's own position group with
the subject's row marked.

---

## Systems (`src/components/dp/*`, `src/utils/coverageBand.js`)

dp-v2 Slice 1 landed five shared primitives and one pure util, all shipped unused at the time —
exercised only by their own tests — pending real consumers with real data behind them. `CoveragePips`
and `DegradedBlock` gained their first consumer in dp-v2 Slice 4a (Distribution's pooled-game-count
pips; both new sections' degraded states). `SeriesBars` and `DefinitionPopover` gained theirs in
dp-v2 Slice 4b (`dp/UsageEfficiencySection.jsx`'s per-metric rows). `TrendCell` remains unused,
reserved for a later slice. This section documents the vocabulary so later slices wire into it
rather than reinvent it.

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
prevent. `'signed'` mode's first real consumer is dp-v2 Slice 4c's PROE row
(`dp/EnvironmentSection.jsx`) — every dp-v2 Slice 4b series before it used `'scaled'` only.

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

