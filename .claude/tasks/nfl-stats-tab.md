# NFL stats tab — replace the placeholder with a real season-average + game-log table

**Status:** planned (opus). Implementer: sonnet. Read this file first; do not improvise
architecture — if something here contradicts the code, stop and ask.

**One-line goal:** replace `NflStatsPlaceholder` (the Players → Dynasty → **NFL stats**
sub-tab) with a position-split **season-average** table whose rows expand to a per-game
**game log** (week · opponent + H/A · W/L + score · the player's fantasy points ·
spread/total), plus a High/Low summary. Display-only. Value/Outlook/Weekly untouched.

This slice consumes the **already-shipped** `nflverse/schedule/<year>.json` contract via
the existing `loadNflSchedule(year)` loader. No projection/scoring/`factors` change. No
cross-repo change (see *Cross-repo impact*). Reuse existing tokens only — **no new color
tokens** (so no `.dark` additions needed).

---

## 0. Key findings from live source + cached data (read before coding)

These drove the design. Verified against the live data store
(`https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main`) and the fixture
`src/__fixtures__/season-totals-2025.json`.

1. **Per-game fantasy points already exist — reuse, don't recompute.**
   `careerStats[season][playerId]` (built by `getSeasonTotals` in
   [src/api/sleeperStats.js:102](src/api/sleeperStats.js)) is:
   `{ stats, gamesPlayed, gamesStarted, byeWeeks, dnpWeeks, weeklyPoints, weeklyStatus, fantasyPoints, availability }`.
   - `weeklyPoints` = `{ [week]: points }` — the **per-game** fantasy points, league-scored
     (`calculateFantasyPoints`), the *same* source feeding the Profile weekly grid. The
     Profile reads it via `usePlayerProfile.getSeasonData(season).weeklyPoints`
     ([src/hooks/usePlayerProfile.js:93](src/hooks/usePlayerProfile.js)). We read
     `careerStats[season][playerId].weeklyPoints[week]` directly (the tab has `careerStats`
     as a prop, not the Profile context).
   - `weeklyStatus` = `Array(18)` of `'P'` (played) / `'D'` (DNP) / `'B'` (bye) / `'X'`
     (not on a roster / absent that week). Drives the game-log row type.

2. **There is NO per-season / per-week team in the data.** Confirmed: the per-player
   season object has no `team` field, and the weekly aggregation in `getSeasonTotals`
   discards the per-week team (it only sums numeric `stats` keys + `weeklyPoints`). The
   only team signal available app-side is the player's **current** team
   (`playerRow.nfl_team`; `nflRoster` resolves a single current year, not history). **This
   is the one real constraint of the slice** — see the join design (§3) and the team-change
   guard. It is an app-side data gap, **not** a schedule-contract gap (flagged in
   *Cross-repo impact* as a future, out-of-scope data-repo enhancement).

3. **Schedule team domain ≈ Sleeper domain, one alias.** Live `2024.json` uses 32 nflverse
   abbrs identical to `NFL_TEAMS` in [PlayersTab.jsx:1506](src/components/PlayersTab.jsx)
   **except Rams = `LA`** (Sleeper = `LAR`). So the only normalization needed for the
   current domain is `LAR → LA`. Historical relocated seasons use the contemporaneous abbr
   (`2015.json` has `OAK`/`SD`/`STL`); since we only have the player's *current* team, a
   current abbr (`LV`/`LAC`/`LA`) simply finds **no match** in those old files → matchup
   degrades to `—` (correct "unknown" outcome). No per-season alias table needed.

4. **Schedule semantics (verified on live `2024.json` + the test fixture):**
   - `result` = `homeScore − awayScore` (home margin). `result === 0` is a **tie** (never
     null-coerced). `result`/`homeScore`/`awayScore` are `null` for unplayed games.
   - `spreadLine` is **home-perspective, positive = home favored** (live W1: `KC` home,
     `spreadLine: 3` → KC favored by 3). Betting display flips: favorite shown negative.
   - `totalLine` = O/U, same for both teams.
   - `gameType` ∈ `{REG, WC, DIV, CON, SB}`, weeks 1–22. Player weekly data is
     `season_type=regular`, weeks 1–18 → **filter schedule to `gameType === 'REG'`**.
   - All seasons **1999–2026** are in the manifest, so any selectable season can be
     lazy-loaded.

5. **Several `stats` keys are pre-summed weekly RATES and are garbage as season values.**
   `getSeasonTotals` sums *every* stat key across weeks, so `cmp_pct`, `pass_ypa`,
   `pass_ypc`, `pass_rtg`, `rush_ypa`, `rec_ypr`, `rec_ypt` are **sums of weekly rates**
   (e.g. a QB's summed `cmp_pct` ≈ 1108). **Never display these keys.** All rates must be
   **derived from counting stats** (`compPct = pass_cmp/pass_att`, etc.). Columns are built
   only from counting stats that exist and sum correctly (verified present, per position):
   QB `pass_cmp pass_att pass_yd pass_td pass_int rush_yd rush_td`; RB
   `rush_att rush_yd rush_td rec_tgt rec rec_yd rec_td`; WR/TE
   `rec_tgt rec rec_yd rec_td` (+ `rush_*` ignored for the line); plus `gamesPlayed` and
   `fantasyPoints` for FP/G.

6. **Wiring:** `PlayersSurface` already spreads `{...props}` into `OutlookTab`; the new tab
   gets the **same** props the Outlook tab uses. The default table season is derived as
   `max(Object.keys(careerStats))` — **no `nflState`/`currentSeason` prop is needed**, so
   **App.jsx does not change**. Schedule is lazy-loaded inside the tab on first expansion
   (the task-sanctioned lean path), cached per year (IndexedDB cache already permanent in
   `loadNflSchedule`).

---

## 1. End-state UX

Players → Dynasty → **NFL stats**:

- **Position pills** `ALL | QB | RB | WR | TE` (identical markup to Outlook,
  [OutlookTab.jsx:217-228](src/components/players/OutlookTab.jsx)).
- A **table-level season `<select>`** — `Season averages: [▾ 2025]` — listing every season
  present in `careerStats` (desc), default = `latestSeason` (`max(careerStats keys)`),
  persisted to `localStorage['nflstats-season']`. Changing it recomputes the averages for
  **all** rows for the chosen season (and is the default season for newly-expanded game
  logs — see below).
- A **season-average table** over the same `playerRows` set the other tabs use, for the
  selected `tableSeason`. Columns vary by the active position pill (§4). Sortable via
  `SortTh` ([PlayersTab.jsx:88](src/components/PlayersTab.jsx)), default **FP/G ↓**.
  Pagination 50, mirroring Outlook. Cells with no data render `—` (never NaN).
- **Each row expands** (chevron, via `ExpandableTableRow`) into a **game-log panel**:
  - A **per-row season `<select>`** (player's seasons with `gamesPlayed > 0`), default = the
    table-level `tableSeason` if the player played it, else the player's most-recent played
    season. (The per-row selector overrides the table season for that one panel only.)
  - A **High/Low** summary line (best/worst fantasy game over that season's played games).
  - A **game-log table**: `Wk · Opp · Result · FP · Spread · Total`, one row per
    `P`/`D`/`B` week (skip `X`); `@`/`vs` in the Opp cell for away/home; `BYE` rows; `DNP`
    weeks show opponent/result/lines but no FP.
- Clicking the row **body** opens the shared **Player Profile** panel (same pattern as
  Outlook, [OutlookTab.jsx:357-375](src/components/players/OutlookTab.jsx)); the chevron
  cell `stopPropagation`s so it doesn't open the profile.

**Graceful empties (required):** schedule not yet loaded → matchup columns `—` +
"Loading schedule…"; schedule empty-shape / season absent → matchup `—` + "Schedule
unavailable for {season}."; team-change/unverifiable → matchup `—` + a "possible team
change" note; pre-2020 missing fields (`temp`/`wind` etc. are unused here; null
`spread`/`total`) → `—`; player with no games in the selected season → "No games played
in {season}." The **season-average columns always render** even when the schedule is the
empty shape (they don't depend on the schedule).

---

## 2. Files

| File | Action |
|---|---|
| `src/utils/nflStats.js` | **NEW** — pure helpers (normalize, season averages, game-log join, High/Low). |
| `src/utils/nflStats.test.js` | **NEW** — unit tests for the above. |
| `src/components/players/NflStatsTab.jsx` | **NEW** — the tab component (+ in-file `GameLogPanel`). |
| `src/components/players/NflStatsTab.test.jsx` | **NEW** — component-render test. |
| `src/components/players/NflStatsPlaceholder.jsx` | **DELETE** — replaced. |
| `src/components/players/PlayersSurface.jsx` | **EDIT** — swap the import + render; one line each. |
| `src/components/players/PlayersSurface.test.jsx` | **EDIT** — mock the new tab; update test 3. |
| `docs/ui.md`, `docs/signal-registry.md`, `CLAUDE.md`, `README.md` | **EDIT** — see *Docs updates*. |

**No change to `src/App.jsx`** (props already forwarded; season derived from `careerStats`).
**No change to `src/api/nflSchedule.js`** (consumed as-is; public surface re-confirmed:
`loadNflSchedule(year) → { games, year, complete, rowCount }`, empty shape
`{ games: [], year: null, complete: false, rowCount: 0 }`,
[src/api/nflSchedule.js:47-94](src/api/nflSchedule.js)).
**No change to `src/__tests__/scheduleViewOnly.test.js`** — `nflStats.js` is a *consumer*,
not a pipeline module, so it is not (and must not be) in that test's `PIPELINE` list; no
projection/scoring module may import `nflStats.js` or `nflSchedule.js` (that guard stays
green).

---

## 3. The join — exact key, normalization, and the team-change guard

**Join key:** `(normalizeTeamForSchedule(playerRow.nfl_team), week, season)` → the single
`gameType === 'REG'` schedule game in `season` where `homeTeam` or `awayTeam` equals the
normalized team. The player's team is the **current** team (only signal available — see
§0.2). Correct for the current/most-recent season and any season the player spent on their
current franchise; the guard below suppresses wrong matchups otherwise.

**Normalization (`normalizeTeamForSchedule`):** map Sleeper → schedule (nflverse) domain.
Only `LAR → LA` differs in the current domain; everything else is identity.
`SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }`. (No per-season historical alias table — see §0.3:
a relocated franchise's old abbr just doesn't match the current abbr → `—`.)

**Team-change / abbr-mismatch guard (`teamConsistent`):** a season's matchup context is
only shown when the *current* team's REG schedule is consistent with the player's played
weeks. Compute `teamScheduledWeeks` = the weeks the current team has a REG game that
season; if **any** week with `weeklyStatus === 'P'` is **not** in `teamScheduledWeeks`, the
player was on a different team that season → `teamConsistent = false` → all matchup fields
degrade to `—` with a note. (A team's bye is its one missing REG week; in a team-change
season the player almost always has a `P` in the current team's bye week, tripping the
guard. Rare false-negatives are acceptable for a display tab.) When the schedule isn't
loaded / is the empty shape, `teamConsistent = true` (we cannot disprove) but
`scheduleLoaded = false`, so matchup still shows `—` with the "schedule unavailable" note
rather than the "team change" note.

This guard is the honest answer to the §0.2 data gap: **never show a wrong opponent**,
degrade to `—` instead.

---

## 4. Per-position column sets (built only from fields that exist)

Leading columns on every tab: **(chevron)** · **Player** (`full_name` + sub-line
`POS · age · TEAM · Nyr`, copied from [OutlookTab.jsx:277-289](src/components/players/OutlookTab.jsx))
· **G** (`gamesPlayed`). Then, by active pill:

| Pill | Stat columns (label ← derivation) | Default sort |
|---|---|---|
| **QB** | Cmp% ← `100·pass_cmp/pass_att` · Pass Yd/G ← `pass_yd/G` · Pass TD ← `pass_td` · INT ← `pass_int` · Rush Yd/G ← `rush_yd/G` · Rush TD ← `rush_td` · FP/G ← `fantasyPoints/G` | FP/G ↓ |
| **RB** | Rush Att ← `rush_att` · Rush Yd/G ← `rush_yd/G` · Rush TD ← `rush_td` · Tgt ← `rec_tgt` · Rec ← `rec` · Rec Yd/G ← `rec_yd/G` · Rec TD ← `rec_td` · FP/G | FP/G ↓ |
| **WR** / **TE** | Tgt ← `rec_tgt` · Rec ← `rec` · Catch% ← `100·rec/rec_tgt` · Rec Yd/G ← `rec_yd/G` · Y/R ← `rec_yd/rec` · Rec TD ← `rec_td` · FP/G | FP/G ↓ |
| **ALL** | Yds/G ← `(pass_yd+rush_yd+rec_yd)/G` · TD ← `pass_td+rush_td+rec_td` · FP/G | FP/G ↓ |

**Convention:** yards → per-game (`/G`, `toFixed(1)`); TD / INT / receptions / targets /
attempts → season totals (integer); rates (`Cmp%`/`Catch%`) → `Math.round + '%'`; `Y/R`,
`FP/G` → `toFixed(1)`. `null` → `—`. `tabular-nums` on numerics. The **ALL** pill uses the
position-agnostic composite for every row (mixed positions); the QB/RB/WR/TE pills filter
rows to that position and show its set (mirrors Outlook's pill behavior).

**Optional advstats column — intentionally OMITTED this slice.** `advStats.byId[id]`
(`targetShare`) is served and view-only, but it reflects `advStats.year` which may differ
from the table's `latestSeason`, introducing a season-mismatch wrinkle. Per "OMIT and note
rather than add complexity," leave it out; note as a future enhancement (gate on
`advStats.year === latestSeason`). No new data dependency added.

`prototype columns requiring fields NOT served` (e.g. snap counts per game, EPA,
air-yards-per-game) → omitted; not available per-game in this ingest.

---

## 5. `src/utils/nflStats.js` — pure helpers (signatures + return shapes)

All functions are pure, null-safe, never return `NaN`. No imports from projection/scoring.

```js
// Sleeper → schedule (nflverse) team domain. Only LAR differs currently.
export const SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }
export function normalizeTeamForSchedule(team) {
  if (!team) return null
  return SCHEDULE_TEAM_ALIAS[team] ?? team
}

// Season-average line. seasonData = careerStats[season][playerId] (or undefined).
// Reads COUNTING stats only — never the pre-summed rate keys (§0.5). games===0 / no
// data → games:0 and every stat field null.
export function computeSeasonAverages(seasonData, position) → {
  games,        // gamesPlayed ?? 0
  fpPerG,       // games>0 ? fantasyPoints/games : null
  compPct,      // pass_att>0 ? 100*pass_cmp/pass_att : null
  passYdPerG,   // games>0 ? pass_yd/games : null
  passTd,       // pass_td ?? null
  passInt,      // pass_int ?? null
  rushAtt,      // rush_att ?? null
  rushYdPerG,   // games>0 ? rush_yd/games : null
  rushTd,       // rush_td ?? null
  tgt,          // rec_tgt ?? null
  rec,          // rec ?? null
  recYdPerG,    // games>0 ? rec_yd/games : null
  recTd,        // rec_td ?? null
  ypr,          // rec>0 ? rec_yd/rec : null
  catchPct,     // rec_tgt>0 ? 100*rec/rec_tgt : null
  totalYdPerG,  // games>0 ? (pass_yd+rush_yd+rec_yd)/games : null
  totalTd,      // (pass_td+rush_td+rec_td) || null
}
// `position` is accepted for future per-position tuning but the current impl returns the
// full superset (the component picks keys per pill). Treat missing stat keys as 0 inside
// derivations, but return null (not 0) when the underlying counting input is absent so the
// cell shows `—`, e.g. passTd = stats.pass_td ?? null.

// Game log for one player-season. weeklyPoints / weeklyStatus from careerStats[season][id].
// scheduleGames = loadNflSchedule(season).games (raw 15-field rows) or [].
export function buildGameLog({ playerTeam, season, weeklyPoints, weeklyStatus, scheduleGames }) → {
  scheduleLoaded,   // scheduleGames.length > 0
  teamConsistent,   // §3 guard; true when !scheduleLoaded (cannot disprove)
  rows: [ {
    week,           // 1..18
    status,         // 'P' | 'D' | 'B'   (X weeks are skipped)
    fantasyPoints,  // 'P' → weeklyPoints[week] ?? null ; 'D'/'B' → null
    opponent,       // 'BUF' | 'BYE' (B) | null (untrusted/empty schedule, or D with no game)
    homeAway,       // 'home' | 'away' | null
    result,         // 'W' | 'L' | 'T' | null
    score,          // '27-20' (player-perspective my-opp) | null
    spread,         // player-perspective line, favorite negative | null
    total,          // totalLine | null
  } ],
}
```

`buildGameLog` algorithm:
1. `normTeam = normalizeTeamForSchedule(playerTeam)`.
2. `reg = scheduleGames.filter(g => g.gameType === 'REG')`;
   `weekMap = Map<week, game>` for reg games where `homeTeam === normTeam || awayTeam === normTeam`.
3. `scheduleLoaded = scheduleGames.length > 0`.
   `teamConsistent`: if `!scheduleLoaded` → `true`; else every week `w` with
   `weeklyStatus[w-1] === 'P'` must be in `weekMap` → else `false`.
   `matchupTrusted = scheduleLoaded && teamConsistent`.
4. For `w` in 1..18, `status = weeklyStatus?.[w-1] ?? 'X'`; skip `'X'`. Then:
   - `'B'` → `{ week:w, status:'B', fantasyPoints:null, opponent:'BYE', homeAway:null, result:null, score:null, spread:null, total:null }`.
   - `'P'`/`'D'`:
     - `fantasyPoints = status === 'P' ? (weeklyPoints?.[w] ?? null) : null`.
     - if `matchupTrusted && weekMap.has(w)`: `g = weekMap.get(w)`;
       `isHome = g.homeTeam === normTeam`; `opponent = isHome ? g.awayTeam : g.homeTeam`;
       `homeAway = isHome ? 'home' : 'away'`;
       if `g.homeScore != null && g.awayScore != null`:
       `my = isHome ? g.homeScore : g.awayScore`, `opp = isHome ? g.awayScore : g.homeScore`,
       `score = `${my}-${opp}``; `margin = g.result == null ? null : (isHome ? g.result : -g.result)`;
       `result = margin == null ? null : margin > 0 ? 'W' : margin < 0 ? 'L' : 'T'`;
       else `score = null; result = null`;
       `spread = g.spreadLine == null ? null : (isHome ? -g.spreadLine : g.spreadLine)`;
       `total = g.totalLine ?? null`.
     - else (untrusted, empty schedule, or `D` with no game): all matchup fields `null`.

```js
// Best/worst fantasy game over PLAYED weeks. rows = buildGameLog(...).rows.
export function computeHighLow(rows) → { high, low } | null
// played = rows.filter(r => r.status === 'P' && r.fantasyPoints != null)
// empty → null; else high/low = max/min by fantasyPoints → { week, opponent, fantasyPoints }
```

**Sign sanity (implementer, double-check the spread):** live 2024 W1 `KC` home,
`spreadLine: 3` (KC favored). Player on KC (`isHome`) → `spread = -3` (favorite negative ✓).
Player on the away team → `spread = +3` (underdog ✓).

---

## 6. `src/components/players/NflStatsTab.jsx` — component

Model it on `OutlookTab` (same prop list, position pills, `SortTh`, pagination,
`ExpandableTableRow`, Profile panel). Differences: variable columns per pill, a game-log
panel instead of usage history, and lazy per-year schedule loading.

**Imports:** `useCallback, useMemo, useState, useEffect` (react); `Tooltip`;
`ProfileDataContext`; `{ SortTh, PlayerProfile, projectionConfidenceClass }` from
`../PlayersTab` ([cite OutlookTab.jsx:1-6](src/components/players/OutlookTab.jsx));
`{ ExpandableTableRow, ExpandChevron }` from `../ui/ExpandableTableRow`;
`{ loadNflSchedule }` from `../../api/nflSchedule`;
`{ normalizeTeamForSchedule, computeSeasonAverages, buildGameLog, computeHighLow }` from
`../../utils/nflStats`.

**Props (via `{...props}` from PlayersSurface):** `playerRows, loaded, careerStats,
playerMap, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
enrichmentMap, advStats, comparisonList, addToComparison, removeFromComparison`
(same set OutlookTab destructures, [OutlookTab.jsx:93-97](src/components/players/OutlookTab.jsx)).

**Column descriptor** (module const). Each entry `{ key, label, fmt, tooltip? }` where `key`
is a `computeSeasonAverages` field and `fmt` ∈ `perGame|int|pct|ratio`:

```js
const COLUMNS = {
  QB:  [compPct(pct,'Cmp%'), passYdPerG(perGame,'Pass Yd/G'), passTd(int,'Pass TD'),
        passInt(int,'INT'), rushYdPerG(perGame,'Rush Yd/G'), rushTd(int,'Rush TD'),
        fpPerG(perGame,'FP/G')],
  RB:  [rushAtt(int,'Rush Att'), rushYdPerG(perGame,'Rush Yd/G'), rushTd(int,'Rush TD'),
        tgt(int,'Tgt'), rec(int,'Rec'), recYdPerG(perGame,'Rec Yd/G'), recTd(int,'Rec TD'),
        fpPerG(perGame,'FP/G')],
  WR:  [tgt(int,'Tgt'), rec(int,'Rec'), catchPct(pct,'Catch%'), recYdPerG(perGame,'Rec Yd/G'),
        ypr(ratio,'Y/R'), recTd(int,'Rec TD'), fpPerG(perGame,'FP/G')],
  TE:  <same array as WR>,
  ALL: [totalYdPerG(perGame,'Yds/G'), totalTd(int,'TD'), fpPerG(perGame,'FP/G')],
}
const fmtCell = (v, kind) => v == null ? '—'
  : kind==='pct' ? `${Math.round(v)}%` : kind==='int' ? `${v}` : v.toFixed(1)
```

**State (component-local — allowed; OutlookTab does the same, and the App.jsx-owns-state
invariant governs the playerRows pipeline / league+career state, not a display tab's UI
state):**
- `posFilter` ('ALL' default), `sortState` (`{column:'fpPerG', direction:'desc'}`,
  persisted to `localStorage['nflstats-sort']` exactly like `outlook-sort`,
  [OutlookTab.jsx:99-112](src/components/players/OutlookTab.jsx)), `page`,
  `expanded` (`Set`), `selectedPlayerId`.
- `tableSeason` (number; init from `localStorage['nflstats-season']` if a valid season key,
  else `latestSeason`; persist on change exactly like `sortState`). Reset `page` to 1 on
  change.
- `logSeasonById` (`{}` → player_id→selected game-log season; default lazily on expand =
  `tableSeason` if the player played it, else most-recent played).
- `scheduleByYear` (`{}` → `{ [year]: { games, loaded, loading } }`).

**Derive `latestSeason` + `allSeasons`:** `latestSeason = useMemo(() => { const k = Object.keys(careerStats ?? {}).map(Number); return k.length ? Math.max(...k) : null }, [careerStats])`; `allSeasons = useMemo(() => Object.keys(careerStats ?? {}).map(Number).sort((a,b)=>b-a), [careerStats])` (desc; feeds the table-level `<select>`).

**Enriched rows for sorting:** `enrichedRows = useMemo(() => (playerRows ?? []).map(r => ({ ...r, _avg: computeSeasonAverages(careerStats?.[tableSeason]?.[r.player_id], r.position) })), [playerRows, careerStats, tableSeason])`.

**displayRows / sort / paginate:** copy Outlook's `displayRows` memo
([OutlookTab.jsx:174-208](src/components/players/OutlookTab.jsx)), with the sort comparator
keyed on `full_name` (string on `r`) else `r._avg[column]` (number, nulls sink). Same
`handleSort`, `handlePosFilter` (resets sort to `{column:'fpPerG', direction:'desc'}`),
`toggleExpanded`, pagination block, and the `!loaded` notice.

**Lazy schedule loader (StrictMode-safe — honor the cancelled-flag invariant):**
```js
const ensureSchedule = useCallback((year) => {
  if (year == null) return
  setScheduleByYear(prev => prev[year] ? prev
    : { ...prev, [year]: { games: [], loaded: false, loading: true } })
}, [])
useEffect(() => {
  let cancelled = false
  const pending = Object.entries(scheduleByYear).filter(([, v]) => v.loading && !v.loaded)
  if (!pending.length) return
  for (const [year] of pending) {
    loadNflSchedule(Number(year)).then(res => {
      if (cancelled) return
      setScheduleByYear(prev => ({ ...prev,
        [year]: { games: res.games ?? [], loaded: true, loading: false } }))
    })
  }
  return () => { cancelled = true }
}, [scheduleByYear])
```

**Header controls:** the position-pill row (copied from Outlook) plus a label +
`<select>` `Season averages: [▾ {tableSeason}]` whose options are `allSeasons`; `onChange`
sets `tableSeason` (persist + reset page). Place it inline with / beside the pills.

**Table:** `overflow-x-auto` wrapper; use `table-auto` (NOT Outlook's `table-fixed` — column
count varies per pill, so a fixed colgroup is impractical; numeric cells get
`whitespace-nowrap tabular-nums`). Header row: chevron `<th/>`, `<SortTh label="Player"
col="full_name" {...sortProps} />`, `<SortTh label="G" col="games" .../>` (sorts `_avg.games`),
then `COLUMNS[posFilter].map(c => <SortTh label={c.label} col={c.key} tooltip={c.tooltip} {...sortProps} />)`.
Body: `pageRows.map` → `ExpandableTableRow` (`colSpan = 3 + COLUMNS[posFilter].length`):
chevron cell (`onClick stopPropagation` → `toggleExpanded(id)` and default
`logSeasonById[id]`), Player cell, G cell, then `COLUMNS[posFilter].map(c =>
<td className="py-2 px-3 text-right tabular-nums">{fmtCell(row._avg[c.key], c.fmt)}</td>)`.
`onRowClick = () => setSelectedPlayerId(id)`. Empty-body row like
[OutlookTab.jsx:332-338](src/components/players/OutlookTab.jsx).

**`detail` = `<GameLogPanel … />`** (see §7).

**Profile panel + backdrop:** copy verbatim from
[OutlookTab.jsx:357-375](src/components/players/OutlookTab.jsx) (same context value &
PlayerProfile props).

---

## 7. `GameLogPanel` (in-file sub-component)

Props: `{ playerId, playerTeam, position, availableSeasons, season, onSeasonChange,
careerStats, scheduleEntry, onNeedSeason }` where `availableSeasons` = the player's seasons
with `gamesPlayed>0` (sorted desc), `season` = `logSeasonById[playerId] ?? defaultSeason`
(`defaultSeason` = `tableSeason` if the player played it, else `availableSeasons[0]`),
`scheduleEntry` = `scheduleByYear[season]`.

Behavior:
1. `useEffect(() => onNeedSeason(season), [season])` → parent `ensureSchedule(season)`.
2. `const sd = careerStats?.[season]?.[playerId]`. If `!sd || sd.gamesPlayed === 0` →
   "No games played in {season}." (still render the season `<select>`).
3. `const { rows, scheduleLoaded, teamConsistent } = buildGameLog({ playerTeam, season,
   weeklyPoints: sd.weeklyPoints, weeklyStatus: sd.weeklyStatus,
   scheduleGames: scheduleEntry?.loaded ? scheduleEntry.games : [] })`.
4. `const hl = computeHighLow(rows)`.
5. Render:
   - **Season `<select>`** (only when `availableSeasons.length > 1`; else a static label),
     `onChange → onSeasonChange(playerId, Number(value))`.
   - A **note line** by state: `scheduleEntry?.loading` → "Loading schedule…";
     `!scheduleLoaded` (loaded but empty/absent) → "Schedule unavailable for {season} —
     matchup details hidden."; `scheduleLoaded && !teamConsistent` → "Couldn't verify
     {playerTeam}'s {season} schedule — matchup details hidden (possible team change)."
   - **High/Low** (when `hl`): `High {hl.high.fantasyPoints.toFixed(1)} (W{week} {vs/@}{opp})
     · Low …`, using `--color-positive-text` / `--color-negative-text`.
   - **Game-log table** `Wk · Opp · Result · FP · Spread · Total`:
     - Opp: `'BYE'` for B; else `homeAway==='away' ? '@'+opp : 'vs '+opp`; `—` if null.
     - Result: `W`/`L` colored positive/negative, `T` neutral; `—` if null. Append
       `score` muted when present.
     - FP: `status==='B'` → `—`; `status==='D'` → muted `DNP`; else `fantasyPoints.toFixed(1)`
       (or `—` if null).
     - Spread: `spread == null ? '—' : spread.toFixed(1)` (favorite negative).
     - Total: `total ?? '—'`.

`playerTeam` passed from the row = `row.nfl_team` (the join team, §3).

---

## 8. `PlayersSurface.jsx` edits (two lines)

- [Line 4](src/components/players/PlayersSurface.jsx): replace
  `import { NflStatsPlaceholder } from './NflStatsPlaceholder'`
  → `import { NflStatsTab } from './NflStatsTab'`.
- [Line 79](src/components/players/PlayersSurface.jsx): replace
  `{dynastyTab === 'nflStats' && <NflStatsPlaceholder />}`
  → `{dynastyTab === 'nflStats' && <NflStatsTab {...props} />}`.

(`DYNASTY_TABS` [lines 14-18] and the tab state already include `nflStats` — no change.)
Then **delete** `src/components/players/NflStatsPlaceholder.jsx`.

---

## 9. Step sequence (for the implementer)

1. Add `src/utils/nflStats.js` (§5). Add `src/utils/nflStats.test.js` (§10A); `npm test` it.
2. Add `src/components/players/NflStatsTab.jsx` (§6–7).
3. Edit `PlayersSurface.jsx` (§8); delete `NflStatsPlaceholder.jsx`.
4. Add `NflStatsTab.test.jsx` (§10B); update `PlayersSurface.test.jsx` (§10C).
5. Docs (§11).
6. Done-definition (CLAUDE.md): `npm test`, `npm run lint`, `npm run build` all clean.
   `scheduleViewOnly.test.js` must stay green (it will — no projection import added).

---

## 10. Tests to add / update

### 10A. `src/utils/nflStats.test.js` (pure — no jsdom)
- **normalizeTeamForSchedule:** `'LAR'→'LA'`, `'KC'→'KC'`, `null→null`.
- **computeSeasonAverages:**
  - QB: `stats {pass_cmp:300,pass_att:450,pass_yd:4200,pass_td:30,pass_int:10,rush_yd:200,rush_td:3}`,
    `gamesPlayed:17, fantasyPoints:380` → `compPct≈66.7`, `passYdPerG≈247.06`, `passTd:30`,
    `passInt:10`, `rushYdPerG≈11.76`, `rushTd:3`, `fpPerG≈22.35`, `totalYdPerG≈258.82`,
    `totalTd:33`.
  - WR: `stats {rec_tgt:120,rec:90,rec_yd:1200,rec_td:8}`, `gamesPlayed:16, fantasyPoints:240`
    → `tgt:120, rec:90, catchPct:75, recYdPerG:75, ypr≈13.33, recTd:8, fpPerG:15`.
  - **No-data:** `computeSeasonAverages(undefined,'WR')` and a `gamesPlayed:0` object →
    `games:0`, every stat field `null`, and `JSON.stringify` contains no `NaN`.
  - **Rates derived, not read:** `stats` including a bogus `cmp_pct:9999, rec_ypr:9999`
    → `compPct` is the derived `66.7` (not 9999); confirms pre-summed rate keys are ignored.
- **buildGameLog** (synthetic `scheduleGames`; include one `gameType:'WC'` game to prove
  it's filtered out):
  - **Normal home win:** `playerTeam:'KC'`, week 1 game `{homeTeam:'KC',awayTeam:'BAL',
    homeScore:27,awayScore:20,result:7,spreadLine:3,totalLine:46,gameType:'REG'}`,
    `weeklyStatus[0]='P'`, `weeklyPoints{1:24}` → row `{week:1,status:'P',fantasyPoints:24,
    opponent:'BAL',homeAway:'home',result:'W',score:'27-20',spread:-3,total:46}`.
  - **Away perspective sign-flip:** same game but `playerTeam:'BAL'` → `homeAway:'away'`,
    `opponent:'KC'`, `result:'L'`, `score:'20-27'`, `spread:3`.
  - **Tie (`result===0`):** scores 20-20 → `result:'T'`.
  - **Null-score in-progress (`homeScore/awayScore/result` null):** `score:null, result:null`
    but `opponent/homeAway/spread/total` present.
  - **Bye week:** `weeklyStatus` `'B'` in the team's missing REG week → row
    `{status:'B', opponent:'BYE', fantasyPoints:null}`.
  - **DNP:** `weeklyStatus` `'D'` in a week the team plays → `opponent` present,
    `fantasyPoints:null`.
  - **Team-abbr alias:** `playerTeam:'LAR'`, schedule uses `'LA'` → matches (opponent set).
  - **Team-change/inconsistent:** `playerTeam:'KC'` but a `'P'` week falls on KC's bye
    week (no KC game that week) → `teamConsistent:false`, every row matchup `null`.
  - **Empty schedule (nflSchedule empty shape):** `scheduleGames:[]` → `scheduleLoaded:false`,
    `teamConsistent:true`, rows still carry `fantasyPoints`, matchup all `null`.
  - **`'X'` weeks skipped:** weeks with `'X'` produce no rows.
- **computeHighLow:** rows with `P` FP `[24,14,31,3]` (+ a `D` and `B` row that must be
  ignored) → `high.fantasyPoints:31`, `low.fantasyPoints:3` with correct `week`/`opponent`;
  all-non-P rows → `null`.

### 10B. `src/components/players/NflStatsTab.test.jsx` (jsdom — model on `OutlookTab.test.jsx`)
- Mocks: `vi.mock('../Tooltip', …)`; `vi.mock('../PlayersTab', …)` with a `PlayerProfile`
  stub (`<div data-testid="profile">{playerId}</div>`), keeping `SortTh` /
  `projectionConfidenceClass` real (`importActual`); `vi.mock('../../api/nflSchedule', () =>
  ({ loadNflSchedule: vi.fn().mockResolvedValue({ games: [<one REG game for the WR's team>],
  year: 2024, complete: true, rowCount: 1 }) }))` (no network).
- `BASE_PROPS` like Outlook's, with `careerStats` for `latestSeason` (e.g. 2024) holding a
  QB, RB, WR (each with `weeklyPoints`/`weeklyStatus` for the game-log test) and a player
  with **no** 2024 data (to assert `—`).
- Assertions:
  1. A row per relevant player (names render).
  2. **Position columns switch:** click `QB` → header `Cmp%` present, `Catch%` absent;
     click `WR` → `Catch%` present, `Cmp%` absent.
  3. **Season-average formatting:** a known `FP/G` value renders (e.g. `15.0`); the
     no-data player's cells show `—`.
  3b. **Table-level season `<select>`:** give a player two seasons with different lines;
     selecting the other season recomputes the row's averages (assert a value changes), and
     `localStorage['nflstats-season']` updates.
  4. **Sort toggle:** `FP/G ↓` → click → `FP/G ↑` (via `SortTh` indicator).
  5. **Expansion:** click a chevron → game-log panel appears; with mocked schedule, the
     opponent abbr renders; the season `<select>` appears when the player has ≥2 seasons.
  6. **Row click opens profile:** clicking the player name → `data-testid="profile"` with
     the right id; chevron click does **not** open it.
  7. **No NaN/undefined:** `container.textContent` matches neither.

### 10C. `src/components/players/PlayersSurface.test.jsx` (update)
- Add `vi.mock('./NflStatsTab', () => ({ NflStatsTab: () => <div data-testid="nflstats">nflstats</div> }))`
  (next to the existing `OutlookTab` mock, [line 14](src/components/players/PlayersSurface.test.jsx)).
- **Test 3** ([lines 31-37](src/components/players/PlayersSurface.test.jsx)): replace the
  heading assertion `screen.getByRole('heading', { name: 'NFL stats' })` with
  `expect(screen.getByTestId('nflstats')).toBeTruthy()`; keep
  `expect(localStorage.getItem('players-dynasty-tab')).toBe('nflStats')` and
  `expect(screen.queryByTestId('explorer')).toBeNull()`.
- Test 4's `queryByRole('button', { name: 'NFL stats' })` assertion stays valid (the pill
  label is unchanged).

---

## 11. Docs updates (concrete before/after)

### `docs/ui.md`
**(a) Line 32 — the surface paragraph.** Change `**NFL stats** is a labeled "coming soon"
placeholder (later slice).` →
`**NFL stats** is a position-split season-average table with an expandable per-game game log
(see *NFL stats tab* below).`

**(b) New section after the Outlook tab block (after line 146).** Insert:

```markdown
## NFL stats tab (`src/components/players/NflStatsTab.jsx`)

The **Players → Dynasty → NFL stats** tab. Same relevant player set as the Explorer (the
`playerRows` prop), ALL/QB/RB/WR/TE position pills, column sort
(`localStorage['nflstats-sort']`, default FP/G ↓), pagination — no filter sidebar.
**Display-only**: nothing here feeds projection or the dynasty score.

The table shows **season averages for a selected season** — a table-level season `<select>`
(`localStorage['nflstats-season']`, default = most-recent season `max(careerStats keys)`)
recomputes every row's averages for the chosen season. The visible columns vary by position
pill:

| Pill | Stat columns |
|---|---|
| QB | Cmp% · Pass Yd/G · Pass TD · INT · Rush Yd/G · Rush TD · FP/G |
| RB | Rush Att · Rush Yd/G · Rush TD · Tgt · Rec · Rec Yd/G · Rec TD · FP/G |
| WR / TE | Tgt · Rec · Catch% · Rec Yd/G · Y/R · Rec TD · FP/G |
| ALL | Yds/G · TD · FP/G (position-agnostic composite) |

Rates (Cmp%, Catch%, Y/R) are **derived from counting stats** — the pre-summed weekly-rate
keys in `careerStats.stats` (`cmp_pct`, `pass_ypa`, `rec_ypr`, …) are season *sums of
weekly rates* and are never displayed. Cells with no data show `—` (never NaN).

**Game log (row expansion).** Each row expands (reusable
`src/components/ui/ExpandableTableRow.jsx`) into a per-game log for a selected season
(season `<select>` when the player has multiple): **Wk · Opp (vs/@) · Result (W/L/T +
score) · FP · Spread · Total**, plus a **High/Low** best/worst-fantasy-game summary. Per-game
fantasy points reuse `careerStats[season][id].weeklyPoints` (the Profile weekly-grid
source); matchup context is joined from `nflverse/schedule/<year>.json` via
`loadNflSchedule(year)` (lazy-loaded per season on first expansion, cached per year).

**Schedule join.** Key `(team, week, season)` against `gameType === 'REG'` games. The
player's team is the **current** `nfl_team` (the data has no per-season team), normalized
Sleeper→nflverse (`LAR→LA`). A bye-week consistency guard hides matchup context for seasons
where the current team's schedule doesn't fit the player's played weeks (likely team
change) — those cells degrade to `—` rather than show a wrong opponent. `result` is the home
margin (0 = tie); `spreadLine` is home-perspective (shown favorite-negative from the
player's side). Pure helpers live in `src/utils/nflStats.js`
(`computeSeasonAverages`/`buildGameLog`/`computeHighLow`/`normalizeTeamForSchedule`).

**Row interactions.** Chevron (stop-propagation cell) toggles the game log; clicking the
rest of the row opens the same **Player Profile** panel as the Explorer/Outlook.

**Known limitations / future.** No per-season historical team → team-change seasons hide
matchup context. Defense-vs-position (DvP) matchup strength and a richer matchup card are a
**future slice** (need weekly defensive splits not in this ingest). An advstats target-share
column is a possible later add (gate on `advStats.year === season`).
```

### `docs/signal-registry.md` (line 55 — the NFL-schedule row)
Change the *Current use* cell `**view-only display** (NFL-stats game log / matchup view —
loader shipped, consumer pending); not wired into projection/scoring` →
`**view-only display** (NFL-stats game log — `NflStatsTab` shipped; `result`/`spreadLine`/
`totalLine` surfaced in the per-game log); not wired into projection/scoring`.
No new signal row is added: the game log is a view of existing `weeklyPoints` (already a
registered Sleeper-derived signal) joined to the already-registered schedule row.

### `CLAUDE.md`
**(a) `src/api/` table, `nflSchedule.js` row** — change the tail `**Read-only** — not wired
into projection/scoring (guarded by `scheduleViewOnly.test.js`); no UI consumer yet` →
`**Read-only** — not wired into projection/scoring (guarded by `scheduleViewOnly.test.js`);
UI consumer: `NflStatsTab` game log (lazy per-season load)`.

**(b) `src/components/` table** — replace the `players/NflStatsPlaceholder.jsx` row with:
`| `players/NflStatsTab.jsx` | Players → Dynasty → NFL stats: position-split season-average
table + expandable per-game game log (schedule-joined opponent/result/lines + reused
weeklyPoints + High/Low). Display-only. Reuses `SortTh`/`PlayerProfile`/
`projectionConfidenceClass` (PlayersTab) + `ExpandableTableRow`; lazy-loads
`loadNflSchedule`. |`

**(c) Cross-repo contracts → nflverse schedule bullet** — append a sentence:
`The app-side consumer is `NflStatsTab` (game log); the join uses the player's *current*
team because season-totals carry no per-season team — a known app-side gap, not a schedule
contract change.`

**(d) `src/utils/` table** — add a row:
`| `nflStats.js` | View-only NFL-stats helpers: `normalizeTeamForSchedule` (Sleeper→nflverse,
`LAR→LA`), `computeSeasonAverages` (per-position season averages from counting stats — never
the pre-summed rate keys), `buildGameLog` (schedule-joined per-game log + bye-week
team-consistency guard), `computeHighLow`. Pure; never imported by projection/scoring. |`

### `README.md` (component tree, lines 122-124)
Replace the `NflStatsPlaceholder.jsx` line (124) with:
`      NflStatsTab.jsx  # Players → Dynasty → NFL stats (season-average table + expandable
schedule-joined game log; display-only)`
and add under `src/utils/` (near the other view-only utils): a line for `nflStats.js`
mirroring the CLAUDE.md (d) text in one line.

---

## 12. Cross-repo impact

**Expected: none.** This slice consumes the already-shipped `nflverse/schedule/<year>.json`
contract unchanged; the served shape is sufficient for the join (`homeTeam`/`awayTeam`/
`week`/`season`/`homeScore`/`awayScore`/`result`/`spreadLine`/`totalLine`/`gameType` all
present and used). No data-repo change required.

**One limitation surfaced (not a contract gap, not in scope):** `nfl/season-totals/<year>`
carries **no per-season player team**, so the game-log join must use the player's *current*
team + a bye-week guard, and team-change seasons hide matchup context. The clean fix would
be a future data-repo enhancement adding a per-season (or per-week) team to the season-totals
shape — **explicitly out of scope here** (would be a coordinated `schemaVersion` bump). Noted
so it's on record, not actioned.

---

## 13. Reuse / refactor flags

- **Reused as-is (cited):** `ExpandableTableRow`/`ExpandChevron`
  ([ui/ExpandableTableRow.jsx](src/components/ui/ExpandableTableRow.jsx)) — fits this slice
  with no missing prop (it forks nothing). `SortTh`/`PlayerProfile`/
  `projectionConfidenceClass` ([PlayersTab.jsx:88,132](src/components/PlayersTab.jsx)).
  Position-pill markup + sort/pagination/profile-panel scaffolding from `OutlookTab`. Weekly
  fantasy-points extraction (`careerStats…weeklyPoints`, the Profile source).
- **Refactor candidate — FLAG ONLY, do not perform this slice:** `OutlookTab` and
  `NflStatsTab` now duplicate substantial table scaffolding (position pills, `SortTh` wiring,
  `sortState` + `localStorage` persistence, pagination block, expand `Set`,
  Profile-panel + backdrop). A shared `usePlayersTable` hook or `PlayersDataTable` wrapper is
  a sensible follow-up once a third consumer (Weekly) lands. Out of scope here.
- **DvP / matchup strength:** future slice (needs weekly defensive splits not in this
  ingest); this slice is column-level matchup context only.
