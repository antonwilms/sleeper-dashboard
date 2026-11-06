# Market round 2 · D2b — team shares in games played

**Review depth: full** — a new consumer of season-totals `weeklyStats` (CR-02/CR-14) and of nflverse gamelogs'
`games[].team` through the CR-16 era hop (`resolvePlayerTeam`, week grain); replaces how every Market team
share is computed; an `App.jsx` prop; two new `PROVISIONAL` sites; extends D2a's CR-34 key list. No
`factors`/projection/scoring change, no new state.

**Revision 1 (2026-11-06): plan-reviewer (full) flags 1–9 folded in** (Anton: "fold all flags in"). 1 → §6.3
names D2a's W11 assertion; 2 → §4 hook comment and §7 nav row describe the schedule overlap; 3 → App anchor
`:1513–1531`; 4 → decision 10 (CR-34 keys + per-season sum guard), G11, W13 extension; 5 → week team resolved
once per player-week (§3), index stores resolved teams (§2), logs used only once every window season has settled
(decision 7); 6 → G9 fixtures spelled out; 7 → G10 asserts imported names; 8 → render-site tag in `Market.jsx`;
9 → §0 counts schedule files. Flag 9's 2019 point does not hold: `nflverse/gamelogs/2019.json` is in the data
store's manifest at data `a5faf89` (the loader's header comment is stale). The manifest has **no 2026** gamelogs,
so the live window's shares fall back to season teams and its caption says so until that file is produced.

**Revision 2 (2026-11-06): re-review (full) flags 1–7 folded in** (Anton: "fold in and commit"). 1 → G9 case (d);
2 → `FIELD_KEYS` is the single field definition `buildTeamWeekTotals` loops over, plus a test; 3 → `SHARES`
exported at module level and imported by W13; 4 → G2/G4 season totals and G9 `players: {}` spelled out; 5 →
decision 7 and §0 state the switch/merge/memory costs, smoke times the switch; 6 → §8 opens a new backlog entry if
D-90 is closed; 7 → `docs/architecture.md` update unconditional. **Plan approved by Anton 2026-11-06 — ready for Session 2 (sonnet, high). D2a signed off and pushed (`c097a05`).**

Session 1: opus, high. Session 2: **sonnet**, **high** (week-level team attribution and a re-based share test
suite). Visual change — Session 2 runs the app from `.claude/launch.json` and smokes Usage; Anton judges.

Planned at app `c738112`. **Starts only after D2a (`market-weekly-medians.md`) is signed off** — it uses D2a's
`src/utils/marketWeekly.js` (`windowSeasonRows`, `playedWeeks`). Line anchors below are at `c738112`; re-find
them after D2a lands.

---

## 0. What this is, for Anton

Every team-share column on Market's Usage view (Tgt, Carry, AY, RZ Tgt, RZ Car, FP, TD, Scrim Yd Share) is
re-based to **the games the player played**: his targets ÷ his team's targets *in those weeks*. A receiver who
missed half the season no longer has his share halved by games he sat out. A player traded mid-season has each
week counted against the team he played for that week, using the nflverse game logs (your choice, 2026-11-06).
The Usage view loads those logs for the window's seasons the first time it is opened (cached after); until
every season's file has arrived the caption says so and traded players' weeks count for their season team. The
live season has no game-log file in the data store yet, so the live window always shows that caption for now.
Cost/risk: view-only; a first Career visit to Usage downloads up to ~14 game-log files (2–3.5 MB each
uncompressed) plus the same seasons' schedule files (small — the existing loader fetches both); the loaded logs
stay in memory for the visit, and once loaded, switching between Usage and another view recomputes the table
(timed in the smoke test). Snap % is unchanged (already a games-played measure).

---

## 1. Decisions (Session 2 does not revisit)

1. **Games-played share** = Σ the player's weekly value ÷ Σ his team's weekly total, over his played weeks
   (D2a's `playedWeeks`: `weeklyStatus 'P'`), each week against the team he played for **that week**.
2. **Week team (Anton, 2026-11-06: game logs).** For season `y` with `gameLogsByYear[y].complete === true`, a
   player's team in week `w` is his **REG** game at week `w` in that season's gamelogs, resolved through
   `resolvePlayerTeam`'s week grain (current-franchise → era-accurate, CR-16). Otherwise — logs not loaded or
   incomplete, player or week absent from the logs — his season `team` (season grain). REG only: in 2012–2020
   nflverse numbers the wild-card round week 18 (measured: 2015 `POST:18` 84 rows, 2020 125). Measured at
   `c738112`: in 2024, 19 players with a season-totals row list two or more REG teams in the logs (e.g.
   Davante Adams, LV weeks 1–3 → NYJ, season team NYJ); 489 of 7,227 offence weeks belong to players absent from
   the logs and 891 more have no REG log row that week — both fall back to the season team, which is exact for
   anyone not traded.
3. **Team weekly totals** come from the same weekly rows, over **D1's offence gate** (moved verbatim from
   `offenceTeamTotals`, `marketWindowStats.js:69`): `gamesPlayed >= 1`, not `TEAM_*`, not a known K/P/DEF,
   season pass + carry + target volume > 0; retired players (absent from `playerMap`) kept. One gate now serves
   all eight shares. Consequence, accepted: `tgtShare`/`carryShare`/`aySh` previously used
   `buildTeamShareTotals` (drops retired ids, `playerMap` members of any position) and the RZ pair
   `computeHistoricalTeamTotals` (every row, `DEFAULT_ATTRIBUTION`); both now keep retired players and drop known
   K/P/DEF, matching Anton's D1 choice. The brief's "skill players only" is D1's offence gate as D1 recorded it.
4. **A season counts only when every offence-gated row in it carries a `weeklyStats` object** (`covered`).
   An uncovered season contributes no weeks to any share (API-only mode: every share reads `—`). A season also
   still needs every numerator key tracked (the existing rule).
5. **Weekly FP** for numerator and denominator is `playedWeeks`' `fp` (the league-basis `weeklyPoints`), a
   non-finite week counting 0 (as `fpOf` does for a season).
6. **`basisGp[share]`** = the number of weeks counted (team resolved, season covered, keys tracked). A share is
   `null` when no week counts or its team total is 0.
7. **Where logs load:** Market requests them only while the **Usage** view is active, for each window season
   except `dataSeason` (App's eager load owns that one) and any season already in `gameLogsByYear`, through
   App's existing `onNeedGameLogSeason` (`useGameLogSeasonLoader`, which dedupes, never overwrites, and also
   loads that season's schedule). **Logs are used only once settled:** Market passes `gameLogsByYear` to
   `buildWindowStats` only while Usage is active *and* every window season is settled — has a map entry
   (complete or not), `dataSeason` counting as settled even without one (App's eager load writes nothing on a
   rejected fetch). Otherwise it passes `null` (every week → season team). So a first Career visit rebuilds the
   window stats once when the last file lands, not once per file, and other views never rebuild on a pop-up load.
   **Accepted costs (re-review flag 5):** once settled, every switch between Usage and another view rebuilds the
   window stats (on Career: the week-team index over ~13 log files and team-week totals for ~14 seasons), then
   D2a's medians and the ranks; while on Usage, any later `gameLogsByYear` merge (a pop-up season load, a late
   `dataSeason` eager load) rebuilds once more; and the loaded log files stay in App state for the session, as
   the pop-up's already do. No cache is added now — the smoke step times the switch (§9); a slow result is
   reported, not fixed in this slice.
8. **Caption (Usage only):** ` · Shares: share of team, in games played`, then
   ` · Mid-season team changes not split for <y1>, <y2>` listing the window seasons (window order) whose logs are
   not in use: every window season while logs are not passed (decision 7), else those not `complete`. Omitted
   when the list is empty.
9. **Tooltips** T-F/T-T (D1 §4) drop "per season and team" — see §5.
10. **CR-34 grows; per-season sum guard.** The shares read `rec_air_yd`, `rec_rz_tgt`, `rush_rz_att` from
   `weeklyStats` too — added to D2a's `WEEKLY_KEYS` (CR-34's entry text is list-agnostic, so the index does not
   change). `tracked` still comes from season `stats`, so a key the data side stopped serving weekly would read 0
   while still "tracked". Guard: `buildTeamWeekTotals` also returns `mismatched[y]`, the `WEEKLY_KEYS` whose weeks
   do not sum to the season `stats` value (|diff| > 1e-6) on some offence row of `y`; a season counts toward a
   share only if none of that share's keys (numerator keys ∪ its field's component keys, `FIELD_KEYS`) is
   mismatched. `fpShare` reads no stat key and is not guarded.

---

## 2. `src/utils/marketWeekly.js` (D2a's file — additions)

Imports become `import { resolvePlayerTeam } from './playerTeam'` and `import { isTeamAggregateId } from './teamContext'`.
Header: append one line — `// Team-week totals for Market's games-played shares; week team from gamelogs, else the season team.`

```js
const NON_OFFENCE = new Set(['K', 'P', 'DEF'])

// D1's offence gate (moved from marketWindowStats.js offenceTeamTotals, unchanged): played, not a TEAM_*
// aggregate, not a known K/P/DEF, and offensive volume. Retired ids (absent from playerMap) pass.
export function isOffenceRow(pid, row, pm) {
  if ((row?.gamesPlayed ?? 0) < 1 || isTeamAggregateId(pid)) return false
  if (NON_OFFENCE.has(pm?.[pid]?.position)) return false
  const s = row.stats ?? {}
  return (s.pass_att ?? 0) + (s.rush_att ?? 0) + (s.rec_tgt ?? 0) > 0
}

// { [season]: { [pid]: { [week]: team } } } over REG games, for each season in `seasons` whose gamelogs are
// complete. Each game's team is resolved ONCE here, era-accurate, through the week grain:
// resolvePlayerTeam({ gameLogPlayers: { [pid]: { games: [g] } } }, pid, y, g.week); a null result is not stored.
// Seasons without complete logs are absent.
export function weekTeamIndex(gameLogsByYear, seasons) { … }

// (pid, season, week) → era-accurate team or null. The single week-team rule (decision 2). No allocation per call.
export function makeWeekTeam(sources, index) {
  return (pid, y, w) => {
    const fromLogs = index[y]?.[pid]?.[w] ?? null
    // PROVISIONAL(heuristic): the season team stands in for the week's team · that season's gamelogs are not in use (not loaded/complete or not settled), or omit the player or week · a per-week team on season-totals rows, or complete logs
    return fromLogs ?? resolvePlayerTeam({ careerStats: sources }, pid, y)
  }
}

// Each team-week field's component stat keys — the ONE definition of every non-fp field: buildTeamWeekTotals
// computes each such field as Σ over FIELD_KEYS[field] of (s[k] ?? 0), and decision 10's guard checks the same
// keys. fp has none (it is the week's fp).
export const FIELD_KEYS = Object.freeze({
  recTgt: ['rec_tgt'], rushAtt: ['rush_att'], recAirYd: ['rec_air_yd'], recRz: ['rec_rz_tgt'],
  rushRz: ['rush_rz_att'], fp: [], td: ['rush_td', 'rec_td'], scrimYd: ['rush_yd', 'rec_yd'],
})

// { totals: { [season]: { [week]: { [team]: { recTgt, rushAtt, recAirYd, recRz, rushRz, fp, td, scrimYd } } } },
//   covered: { [season]: boolean }, mismatched: { [season]: Set<key> } } over offence rows' played weeks
// (decisions 3–5, 10). Every field except fp is Σ FIELD_KEYS[field] (so td = rush_td + rec_td, scrimYd =
// rush_yd + rec_yd) — loop over FIELD_KEYS, never restate a formula; fp = week fp ?? 0. A season is covered
// when every offence row has weeklyStats; mismatched holds the WEEKLY_KEYS whose weeks do not sum to the row's
// stats value on some covered offence row of that season.
export function buildTeamWeekTotals(sources, pm, weekTeam) { … }

// Window seasons whose gamelogs are not complete (window order) — the caption's "not split" list.
export function seasonsWithoutWeekTeams(seasons, gameLogsByYear) {
  return (seasons ?? []).filter(y => gameLogsByYear?.[y]?.complete !== true)
}
```
`WEEKLY_KEYS` (D2a) gains `'rec_air_yd', 'rec_rz_tgt', 'rush_rz_att'` (18 keys). Iterate
`Object.entries(sources)` and pass `Number(y)` to `weekTeam`. Create team buckets with the file's
existing `x[k] ?? (x[k] = {…})` pattern. Pure: read inputs only.

## 3. `src/utils/marketWindowStats.js`

- Imports become exactly `./efficiencyMetrics` and `./marketWeekly` (`windowSeasonRows`, `playedWeeks`,
  `weekTeamIndex`, `makeWeekTeam`, `buildTeamWeekTotals`). Drop `buildTeamShareTotals`,
  `computeHistoricalTeamTotals`, `isTeamAggregateId`, `resolvePlayerTeam`; delete `NON_OFFENCE` and
  `offenceTeamTotals` (moved). Keep `fpOf` (the season `fp` reduce still uses it).
- `buildWindowStats({ window, careerStats, currentSeasonTotals, playerMap, gameLogsByYear } = {})`.
- Replace the `teamShare`/`rz`/`offence` lines (`:113–115`) with:
```js
  const weekTeam = makeWeekTeam(sources, weekTeamIndex(gameLogsByYear, seasons))
  const { totals: teamWeek, covered, mismatched } = buildTeamWeekTotals(sources, pm, weekTeam)
```
- `SHARES` (`:117–128`) moves to module level as `export const SHARES` (it no longer closes over builder locals;
  exported so W13 reads the real numerator keys) and becomes `[name, numerator keys | position fn | null (= week FP), team-week field]`:
  `tgtShare ['rec_tgt'] 'recTgt'`, `carryShare ['rush_att'] 'rushAtt'`, `aySh ['rec_air_yd'] 'recAirYd'`,
  `rzTgtShare ['rec_rz_tgt'] 'recRz'`, `rzRushShare ['rush_rz_att'] 'rushRz'`, `fpShare null 'fp'`,
  `tdShare pos => (pos === 'QB' ? ['pass_td', 'rush_td'] : ['rush_td', 'rec_td']) 'td'`,
  `scrimYdShare ['rush_yd', 'rec_yd'] 'scrimYd'`. Comment above it:
  `// Games-played shares: Σ player ÷ Σ his team's weekly totals over his played weeks, each week credited to the`
  `// team he played for that week. A season counts when it is covered and every numerator key is tracked.`
- Loop body (`:198–213`) becomes — each player-week's team resolved **once**, before the eight shares:
```js
    // One pass per player: each covered season's played weeks with that week's team.
    const seasonWeeks = entries.map(e => ({
      e,
      weeks: covered[e.y] ? playedWeeks(e.row).map(x => ({ ...x, team: weekTeam(pid, e.y, x.w) })) : [],
    }))
    for (const [name, keysOf, field] of SHARES) {
      const keys = typeof keysOf === 'function' ? keysOf(position) : keysOf
      const guarded = [...(keys ?? []), ...FIELD_KEYS[field]]
      let num = 0, den = 0, g = 0
      for (const { e, weeks } of seasonWeeks) {
        if (keys && !keys.every(k => tracked[e.y].has(k))) continue
        if (guarded.some(k => mismatched[e.y]?.has(k))) continue
        for (const { w, s, fp, team } of weeks) {
          if (!team) continue
          num += keys ? keys.reduce((a, k) => a + (s?.[k] ?? 0), 0) : (fp ?? 0)
          den += teamWeek[e.y]?.[w]?.[team]?.[field] ?? 0
          g += 1
        }
      }
      basisGp[name] = g
      usage[name] = g > 0 && den > 0 ? num / den : null
    }
```
  Import `FIELD_KEYS` from `./marketWeekly` too.
- `result.team` stays `entries[0].row.team ?? null` (season grain). Header comment (`:1–10`): add one sentence —
  team shares are games-played shares over `marketWeekly.js`'s team-week totals.
- Unchanged: windows, `tracked`, totals, rates, snap %, `oppPerG`/`looksPerG`, `WINDOW_TOTAL_KEYS`.

**Old helpers kept, untouched, for their other consumers:** `buildTeamShareTotals`
(`outlookPositionStats.js:36`) — `dp/UsageEfficiencySection.jsx:36`, `portfolio/Portfolio.jsx:364`;
`computeHistoricalTeamTotals` (`teamContext.js:252`) — `App.jsx:287` (`historicalTeamTotals`: the pop-up's
§usage RZ row via `usageEfficiency.buildRzShareSeries`, and `computeHistoricalShares`) and `App.jsx:300`
(current-team attribution). Neither file is edited.

## 4. `src/components/market/Market.jsx` · `src/App.jsx` · `src/hooks/useGameLogSeasonLoader.js`

- `Market` gains prop `onNeedGameLogSeason = null`; extend the prop comment block (`:227–230`): `gameLogsByYear`
  also gives the Usage view's games-played shares their week team, and `onNeedGameLogSeason` requests a window
  season's logs while Usage is active.
- `windowStats` memo — decision 7:
```js
  // Usage's games-played shares use the gamelogs only once every window season has settled, so the window
  // stats rebuild once, not once per arriving file; other views never pass them.
  const shareLogs = useMemo(() => {
    if (columnSet !== 'usage' || !activeWindow) return null
    const settled = activeWindow.seasons.every(y => y === dataSeason || gameLogsByYear?.[y] !== undefined)
    return settled ? (gameLogsByYear ?? null) : null
  }, [columnSet, activeWindow, dataSeason, gameLogsByYear])
```
  and pass `gameLogsByYear: shareLogs` to `buildWindowStats` (deps gain `shareLogs`). `prevRanks` unchanged.
- New effect (no async state write, so no `cancelled` flag; the hook dedupes Strict Mode's double run):
```js
  // Usage's games-played shares credit each week to the team a player played for; that needs each window
  // season's gamelogs. dataSeason is App's eager load; a season already in the map is never re-requested.
  useEffect(() => {
    if (columnSet !== 'usage' || !activeWindow || !onNeedGameLogSeason) return
    for (const y of activeWindow.seasons) {
      if (y !== dataSeason && gameLogsByYear?.[y] === undefined) onNeedGameLogSeason(y)
    }
  }, [columnSet, activeWindow, dataSeason, gameLogsByYear, onNeedGameLogSeason])
```
- Caption: when `columnSet === 'usage'`, append decision 8's clauses, the list being
  `seasonsWithoutWeekTeams(activeWindow.seasons, shareLogs)` (with `shareLogs` null every season is listed —
  import it from `../../utils/marketWeekly`). Order: after the snap clause, before D2a's per-game clause. Directly
  above the clause, the render-site tag (one line, verbatim):
  `// PROVISIONAL(heuristic): shares for the listed seasons credit a traded player's weeks to his season team · their gamelogs are not in use yet (loading, incomplete, or not produced) · complete gamelogs for every window season`
- `App.jsx`: the `<Market …>` element (`:1513–1531`, inside `<Route path="/market"` at `:1512`) gains
  `onNeedGameLogSeason={onNeedGameLogSeason}`. Nothing else in `App.jsx`.
- `useGameLogSeasonLoader.js` header (`:11–13`): replace "the caller only asks for seasons below dataSeason, so the
  two never race" with: "Callers (the pop-up's season switcher, Market's Usage view) never ask for dataSeason. Market
  may ask for the live season, dataSeason + 1, whose schedule App's eager sosSeason load also fetches: that file
  is then fetched twice and both writers store the same loader's result (this hook never overwrites; the eager
  write does), which is harmless." Comment only.

## 5. `src/utils/marketMetrics.js`

Tooltips only (verbatim):
- `fpShare`: `"Share of the fantasy points scored by the team's offence (every player with a pass, carry or target), in the games the player played."`
- `tdShare`: `"Share of the team's rushing + receiving TDs in the games the player played. A QB counts his passing + rushing TDs, so QB shares overlap his receivers'."`

---

## 6. Tests

Each new or changed test is shown failing with its defect temporarily reintroduced, then reverted.

### 6.1 Fixture helper — `src/utils/marketWindowStats.test.js`
`row(stats, o)` gains weekly fields, placed **before** the spread so `o` can override them:
`weeklyStatus` = `'P'` for weeks 1..gp, `'X'` to 18; `weeklyStats` = `{ 1: stats }` when gp ≥ 1, else `{}`;
`weeklyPoints` = week 1 the row's `fantasyPoints`, weeks 2..gp `0` (gp from the merged row). With every row's
season in week 1, a games-played share equals the old season share, so existing expected values hold. Add
`const logs = (players, complete = true) => ({ complete, players })` and
`const g = (week, team, seasonType = 'REG') => ({ week, team, seasonType })`. `run()` passes a `gameLogsByYear`
argument through.

### 6.2 New
| # | File | Asserts | Fails if |
|---|---|---|---|
| G1 | `marketWindowStats.test.js` | 2025 KC: `wr` gp 8 (`'P'` weeks 1–8, `rec_tgt` 10 each week, stats 80); `x` gp 16 (weeks 1–16, 5/week in 1–8, 15/week in 9–16, stats 160) → `wr` `tgtShare` 2/3 (its season-total share is 1/3) and `basisGp.tgtShare` 8; `x` 2/3 | the denominator sums the team's whole season |
| G2 | `marketWindowStats.test.js` | 2024, all WR, `'P'` weeks 1–6, `rec_tgt` per week: `p` 10 (season team `NYJ`), `lv1` 10 (`LV`), `nyj1` 20 (`NYJ`); season `stats.rec_tgt` `p` 60, `lv1` 60, `nyj1` 120; every log game entry `{ week, team, seasonType: 'REG' }`. With `logs({ p: weeks 1–2 LV, 3–6 NYJ; lv1: 1–6 LV; nyj1: 1–6 NYJ })`: `p` 60/160 = 0.375, `nyj1` 120/160 = 0.75, `lv1` 60/80 = 0.75. With no `gameLogsByYear`, and with the same logs `complete: false`: `p` 1/3, `nyj1` 2/3, `lv1` 1 | weeks are credited to the season team despite complete logs, or an incomplete load is used |
| G3 | `marketWindowStats.test.js` | G2's logs with `p`'s weeks 1–2 games `seasonType: 'POST'` → `p` 1/3 | POST games are read as REG weeks |
| G4 | `marketWindowStats.test.js` | 2015, season team `STL` for `p` and `t`; logs list `p` weeks 1–3 at `LA` (nflverse current-franchise), `t` absent; both `'P'` weeks 1–3, per week `p` 10, `t` 30, season `stats.rec_tgt` `p` 30, `t` 90 → `p` `tgtShare` 0.25 | the raw log team is used without the CR-16 era hop (`LA` bucket → `p` 1.0) |
| G5 | `marketWindowStats.test.js` | window `[2025, 2024]`: 2025 `wr` 10 / `x` 30 (covered); 2024 `wr` 50 / `y` 50 with `y` overriding `weeklyStats: undefined` → `wr` `tgtShare` 0.25, `basisGp.tgtShare` = 2025 weeks; window `[2024]` → `null`, basis 0 | an uncovered teammate is read as zero weeks (2024 would add 50/50) |
| G6 | `marketWindowStats.test.js` | `wr` `weeklyPoints { 1: 30 }`, `sourceWeeklyPoints { 1: 3 }`; `x` `{ 1: 70 }` / `{ 1: 50 }` → `fpShare` 0.3 | the half-PPR `sourceWeeklyPoints` is used (3/53) |
| G7 | `marketWeekly.test.js` | `isOffenceRow`: `TEAM_KC`, a `K` with a carry, a `DEF`, a gp-0 row, a zero-volume row → false; a retired id with a target → true. `weekTeamIndex` skips an incomplete season and POST games. `seasonsWithoutWeekTeams([2026, 2025, 2024], { 2025: { complete: true }, 2024: { complete: false } })` → `[2026, 2024]` | the moved gate drifts from D1's, or the index reads POST/incomplete logs |
| G8 | `Market.factViews.test.jsx` | `onNeedGameLogSeason` spy, `gameLogsByYear { 2023: { complete: true, players: {} } }`: Overview on Career → not called; Usage on Career → called with 2022, never with 2024 (dataSeason) or 2023 (present); Usage on the live window with `liveSeasonUsable: true` → called with 2025 | Market requests dataSeason, a present season, or loads on another view |
| G9 | `Market.factViews.test.jsx` | Usage on Career (`liveSeasonUsable` false → seasons 2024, 2023, 2022; dataSeason 2024). (a) `gameLogsByYear { 2024: complete, 2023: complete }` (2022 unsettled) → caption contains `Shares: share of team, in games played` and `Mid-season team changes not split for 2024, 2023, 2022`. (b) `{ 2024: complete, 2023: complete, 2022: { complete: false, players: {} } }` → `not split for 2022` and not `2024, 2023`. (c) all three complete → no `not split` clause. (d) `{ 2023: complete, 2022: complete }`, 2024 (dataSeason) absent → `not split for 2024` and not `2023` or `2022`. Stats view with (a) → neither clause. Every `complete` entry is `{ complete: true, players: {} }` | the clauses ignore the view, the settle rule (incl. the dataSeason exemption — without it (d) lists `2024, 2023, 2022`), or the load state |
| G10 | `marketWindowStatsViewOnly.test.js` | `marketWeekly.js` imports exactly `./playerTeam`, `./teamContext`, and the named imports are exactly `resolvePlayerTeam` and `isTeamAggregateId` (parse the `{ … }` list of each import statement); `marketWindowStats.js` imports exactly `./efficiencyMetrics`, `./marketWeekly` | the share code reaches back into `outlookPositionStats`/`teamContext`'s season builders (`computeHistoricalTeamTotals`, `buildTeamShareTotals`) or the api layer |
| G11 | `marketWindowStats.test.js` | single season KC: `wr` and `x` with `rec_tgt` and `rec_air_yd`; `x`'s `stats.rec_air_yd` 300 while its weeks sum to 200 (via `weeklyStats` override) → `wr` `aySh` null, `basisGp.aySh` 0; `tgtShare` unchanged. Same with a second, consistent season → `aySh` from that season only | a weekly key the data side dropped or altered silently yields a share instead of being skipped |

### 6.3 Existing tests to update (behaviour changed on purpose — assert the new outcome)
- `marketWindowStats.test.js` "RZ share uses the keep-retired builder; tgtShare does not" (`:168`): rename
  "every share keeps retired players"; `tgtShare` → `toBeCloseTo(10 / 100)`; the `rzTgtShare` and
  `computeHistoricalTeamTotals` cross-check stay.
- `marketWindowStatsViewOnly.test.js`: D2a's five-import test → G10's lists, and D2a's W11 assertion
  "`marketWeekly.js` imports nothing" → replaced by G10's `marketWeekly.js` assertion (W11's PIPELINE and
  no-api/no-in-season checks stay).
- `src/__tests__/marketWeeklyKeys.test.js` (D2a's W13): the literal list gains `rec_air_yd`, `rec_rz_tgt`,
  `rush_rz_att`; add one assertion — importing `SHARES` from `../utils/marketWindowStats` and `FIELD_KEYS` from
  `../utils/marketWeekly`: every numerator key of every `SHARES` entry (a function entry evaluated for each of
  QB/RB/WR/TE; `null` skipped) and every `FIELD_KEYS` key is in `WEEKLY_KEYS`. Fails if a share reads a weekly key
  outside CR-34 (e.g. a new key added to the QB `tdShare` list).
- New in `marketWeekly.test.js` (with G7): `FIELD_KEYS` single source — `buildTeamWeekTotals` on one offence row
  whose single played week carries distinct values for every `FIELD_KEYS` key yields, for each non-fp field,
  exactly Σ of that field's keys. Fails if `buildTeamWeekTotals` restates a field formula that drifts from
  `FIELD_KEYS`.
- `factViews.test.js` T11: the `fpShare`/`tdShare` `toBe` strings → §5.
- Every other share test in `marketWindowStats.test.js` (`:76`, `:88`, `:96`, `:191`, T3, T4, T5, T9, T12) keeps
  its expected values through §6.1's helper. Re-run T3's and T12's D1 mutations (drop the `NON_OFFENCE` check;
  drop the volume gate) against `isOffenceRow` and confirm red — the hand-back says so. If any other expected
  value moves, stop and report.

---

## 7. Docs (same change)

- `docs/ui.md` → *Fact views* Usage sentence: every share is a games-played share (Σ player ÷ Σ team over the
  weeks he played, each week credited to that week's team from the gamelogs, else the season team), over the
  offence gate (retired kept, known K/P/DEF out); the Usage view requests the window's gamelogs; the two caption
  clauses; a season without `weeklyStats` on every offence row contributes nothing. Replace the
  "per-(season, team) shares … deliberately not `buildTeamShareTotals`" wording accordingly.
- `docs/nav/utils.md`: `marketWeekly.js` row (team-week exports, decision 2's rule, the `PROVISIONAL` site);
  `marketWindowStats.js` row (games-played shares, `gameLogsByYear` argument, no `outlookPositionStats`/RZ-builder
  import).
- `docs/nav/components.md`: `market/Market.jsx` (`onNeedGameLogSeason`, the Usage effect, caption clauses).
- `docs/navigation.md`: `useGameLogSeasonLoader.js` row — callers are the pop-up and Market's Usage view;
  neither asks for `dataSeason`; Market may ask for `dataSeason + 1`, whose schedule App's eager `sosSeason` load
  also fetches (a harmless double fetch, same result).
- `docs/architecture.md` (unconditional): the `gameLogsByYear` / `nflScheduleByYear` rows (`:73–74`) name the
  pop-up's game-log switcher as the only on-demand caller — add Market's Usage view (window seasons except
  `dataSeason`, only while Usage is active); the `/market` route row (`:15`) props list gains `gameLogsByYear` and
  `onNeedGameLogSeason` only if it lists props exhaustively (it lists a subset today — leave it if so).
- `docs/signal-registry.md`: row 46 (`weeklyStats`) and row 63 (gamelogs `team`) consumers — Market's
  games-played shares (view-only).
- `docs/cross-repo-registry.md`: no change — CR-34's text is list-agnostic and its App site (`WEEKLY_KEYS`)
  is unchanged as a symbol; CR-02/CR-09/CR-14/CR-16 list sites, not consumers.

## 8. Data-repo backlog

Append to D2a's `D-90` entry: "D2b (commit …) adds `rec_air_yd`, `rec_rz_tgt`, `rush_rz_att` to `WEEKLY_KEYS`
(the data mirror test's literal must include them) and Market's games-played shares as a second view-only
`weeklyStats` consumer." Non-blocking. **If D-90 is already closed** (moved to *Done*, its mirror literal holding
the 15 D2a keys), do not append: open a new entry `D-NN · CR-34: mirror literal gains rec_air_yd, rec_rz_tgt,
rush_rz_att` (next free id) with the same text, and name it in the hand-back.

## 9. Done-definition notes

- Full `npm test`, `npm run lint` (0), `npm run build` (clean); `statKeysContract`, `teamContextViewOnly`,
  `gameLogsViewOnly`, `crossRepoIndex` pass unchanged.
- Smoke: Usage on QB/RB/WR/TE/ALL for live, a completed season, Last 3 and Career. Watch the Network panel:
  gamelog requests only for non-`dataSeason` window seasons, only on Usage; the "not split" clause shows while
  they load and clears after. Check a known 2024 trade (Davante Adams) on the 2024 window, no `NaN`, shares
  ≤ 100% except a QB's TD Share. Also time a Usage → Overview → Usage switch on Career after the logs have
  settled (decision 7's accepted cost). Time the Career Usage `windowStats` memo once in the console (not committed)
  and report it.
- `grep -rn "PROVISIONAL(" src/` — two new sites (`marketWeekly.js` `makeWeekTeam`, `Market.jsx` Usage caption);
  paste the count.
- Hand-back per `../CLAUDE.md` → Session 2.

## Out of scope
Snap % (already games-played), a per-week team on season-totals rows (would be new data capture), Efficiency
trimming, route data, any scoring/model change, the pop-up's and My Team's share rows (they keep the old
builders).
