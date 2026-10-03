# Player pop-up — season-phase header and a game-log season switcher (P5c)

Session 1 (opus) task file, 2026-10-03. Package P5 part (c) of `future_plans/in-season-notes-plan.md`.
Planned against app `e21fe2b` (clean tree) and data `bf697a5`. Sonnet implements. **View-only: nothing
here reaches `playerRows`, `projectedPPG`, the dynasty score, a snapshot or a `factors` entry.** Live
`/state/nfl` at planning time: `{"week":4,"season":"2026","season_type":"regular","season_start_date":"2026-09-09",…}`
→ `seasonPhase` = in-season, `lead: 'current-plus-ros'`, 3 completed weeks.

**Approved by Anton 2026-10-03**, including Session 1's pick on D7 (the in-season rail lists this season, ranked by total points), and with the plan-gate round-1 fixes applied.

## 0. Goal and fixed decisions

The pop-up's Overview header is written for the offseason: `NEXT SEASON`, a career chart that stops at
`dataSeason`, and a `RANK THIS SEASON` rail that, in October, lists 2025's ranks. Its Game log shows
one season only (`mostRecentSeason`), read from the nflverse gamelogs file — which has no 2026 until
the file clears `MIN_PLAYERGAME_ROWS` around weeks 5–6. This slice:

1. makes the Overview header follow P5a's `seasonPhase` rule (§3);
2. gives the Game log a season switcher across every season the player has played (§4), loading older
   seasons on demand (§2.3);
3. builds the live season's game log, and the header's "so far" line, from **Sleeper's weekly stat
   rows**, never the gamelogs file (§4.3) — no CR-18 floor change, no data-repo work.

**D1 — the live season's source is App's existing defence load, reused (no new fetch).** App already
loads the live season's completed weeks of Sleeper weekly rows for the defence numbers
(`defenceWeeklyByYear[live]`, `App.jsx:1125-1137`, plan from `defenceLoadPlan`,
`opponentStrength.js:49-63`): QB/RB/WR/TE player rows plus `TEAM_*` rows, raw `{ stats, team, opponent,
gameId }`, weeks `1..week-1` in `regular` (from week 2) and `1..18` in `post`. That is exactly the
pop-up's input. Expose that one entry on `ProfileDataContext` (§2.2). Consequences, accepted: the
pop-up has a live season exactly when the defence load does (regular week ≥ 2, or `post`); K/DEF rows
are filtered out (the full pop-up only renders for QB/RB/WR/TE — `playerRows` is skill-only,
`App.jsx:405-406`, and the `!dynastyScore` branch returns early for everything else). A pop-up-scoped
`getWeeklyStatRows` loop was rejected: same rows, a second parse of every week, and a second loader to
keep in step with `defenceLoadPlan`.

**D2 — layout follows `lead`, cells follow data** (P5a §6.4, as P5b D1). `phase?.lead ===
'current-plus-ros'` → the in-season header (§3.2). Anything else → today's header, with only the
data-true relabels of §3.3. Never relabel `dataSeason` data with `lastCompleteSeason`.

**D3 — "so far" and its rank are Sleeper-row totals, the same arithmetic as `/week`.** Per player: sum
`calculateFantasyPoints(row.stats, scoringSettings)` over weeks with `stats.gp === 1`; games = that
count; position rank = `rankByTotalPoints` over every player's total (`weeklyRanks.js`). This equals
`/week`'s this-season rank by construction (`seasonPointsFromWeekly` over the same weeks — the defence
filter removes only non-skill positions, which never share a position bucket with QB/RB/WR/TE). It can
differ from **My Team**'s so-far column, which reads the data-store file (P5b D3, refreshed
Fri/Mon/Tue) — reported (§8.1), not reconciled.

**D4 — the switcher's options are the seasons the player has played, `mostRecentSeason`, and the
live season when he has played in it.** `usePlayerProfile`'s `availableSeasons` (careerStats seasons
with `gamesPlayed > 0`) ∪ `{mostRecentSeason}` (always — so a player who sat out `dataSeason` still
opens on it with today's degraded copy, and the default never triggers an on-demand fetch; plan gate
flag 1) ∪ the live season when `liveLines?.[playerId]?.games > 0` (an IR/FA/retired player with no
live games does not open on an empty season; flag 2). Newest first. **Default = the newest option** —
the live season in-season and in the playoffs for a player with live games, `mostRecentSeason`
otherwise. Picking a season is view-local UI state in the
modal (allowed by the App-owns-state invariant's carve-out); the modal remounts per player
(`PlayerDetailTabs` keys it), so the pick resets per player.

**D5 — older seasons load on demand, into App's existing maps.** A new hook (§2.3, modelled on
`useTeamHistoryLoader.js`) loads `nflverse/gamelogs/<y>.json` and `nflverse/schedule/<y>.json` for a
season the user picks, merging into `gameLogsByYear`/`nflScheduleByYear`. The eager `dataSeason`
loads (`App.jsx:1218-1243`) and the `sosSeason` schedule load (`:1245-1263`) are untouched; the modal
requests only seasons **below** `mostRecentSeason`, so the hook never races them.

**D6 — the live game log omits EPA.** Sleeper's weekly rows carry no EPA. The live column set is
`GAME_LOG_COLUMNS` minus the `epa` column (omit, not approximate), with one caption line saying so.
`aDOT` stays (`rec_air_yd` ÷ `rec_tgt`, CR-13's key).

**D7 — the rail follows the phase** (Session 1's pick; alternative for Anton in §8.4). In-season it
lists this season's top five at the position plus the player, by total points (D3), with PPG beside
each; otherwise it keeps today's list under a data-true title.

**D8 — no registry text edit** (as P3/P4/P5b). The registry is byte-mirrored (CR-24) and D-57/D-58 are
open. This slice emits its Mirror text (Cross-repo impact) and queues trigger/anchor items on D-58.
`docs/signal-registry.md` is app-owned (CR-18 direction data→app) and **is** edited.

## 1. Findings against live source (2026-10-03)

1. **The header today** (`dp/PlayerDetailModal.jsx`, 653 lines). Tiles `:261-305` (`dynasty`,
   `market`, `next`, `floor`; grid `grid-cols-2 md:grid-cols-4` `:376`). The `next` tile already
   switches on the *record*: `projection?.inSeason` → `REST OF SEASON`, note `PPG · preseason {prior} →
   after {n} G` (`:286-294`); its delta is `projectedPPG − currentSeasonPPG` (`:117-123`), i.e. ROS
   minus **last season's** PPG. Chart bars `:141-159`: `careerHistory.slice(-5)` + a projection bar
   labelled `'{yy} ROS`/`'{yy} proj` (`projSeason = mostRecentSeason + 1`). Caption `:400-402`
   (`rest of season`/`next season`). Rail `RANK THIS SEASON` `:463-486` from `usePlayerProfile`'s
   `positionPeers` (`usePlayerProfile.js:120-130`) — `playerRows`' `currentSeasonPPG`/`positionRank`,
   which are **`careerStats[mostRecentSeason]`** PPG ranks (`App.jsx:408-411`, `:519-526`). So
   in-season the rail is titled "this season" and shows 2025.
2. **The game log today.** `PlayerDetailModal.jsx:89-93` reads `gameLogsByYear?.[mostRecentSeason]` /
   `nflScheduleByYear?.[mostRecentSeason]`; `GameLogSection` (`dp/GameLogSection.jsx`, 117 lines)
   already works for **any** season it is handed: `careerStats[season][id]` for `weeklyStatus` and
   PTS (`resolveDisplayWeeklyPoints`), the season's gamelogs/schedule results for production and
   context. It degrades on `!familyReady` (`:41-52`) — an absent key and an incomplete load read the
   same, which is what the existing test `gameLogsByYear/nflScheduleByYear entirely missing for the
   season` asserts for `mostRecentSeason`.
3. **Season coverage.** `careerStats` spans 2012 → live − 1 (`sleeperStats.js:395`); gamelogs files
   2012–2025 with no gap (`docs/signal-registry.md:61`); schedule likewise. A season without a file
   degrades through the existing `DegradedBlock` path.
4. **Sleeper weekly payload, checked live** (2026 wk 3, 2025 wk 7):
   - Counting stats are **sparse with no explicit zeros**: of 168 WR rows with `gp: 1`, 138 have no
     `rec_td` key and none has `rec_td: 0`; same for `pass_int` (QB), `rush_td` (RB). In a played week an
     absent counting key **is** a zero.
   - `rec_air_yd` is absent on 15 of 126 targeted WR rows — ambiguous (air yards can be ≤ 0), so an
     absent `rec_air_yd` renders `aDOT —`, never 0.
   - **Bye teams have no `TEAM_*` row at all** (2025 wk 7: 30 `TEAM_*` rows; the two bye teams absent;
     no player rows for them either). `sleeperStats.js:145-147`'s comment ("a row with `opponent ==
     null` means that team is on bye — `TEAM_*` rows appear … 32/week") is wrong on the first count;
     §6 corrects it. The classifier (§4.3) treats *absent or `opponent == null`* as bye.
   - Rows carry `team`/`opponent` in the Sleeper domain (`LAR`), per `normalizeStatsRowsResponse`.
5. **Context.** `profileContextValue` (`App.jsx:756-773`, 14 keys) has no `nflState`, no
   `scoringSettings`, no weekly rows. `useProfileData()` is the pop-up's only data channel.
6. **Guards.** `opponentStrengthViewOnly.test.js:47-55` constrains App lines containing
   `defenceAllowed` (not `defenceWeeklyByYear`); comment lines are excluded. `weeklyDecisionViewOnly`
   and `gameLogsViewOnly` constrain PIPELINE files only. Nothing forbids a `dp/` component reading
   `weeklyRanks.js` (Portfolio already does).
7. **Registry.** CR-08 (schedule) and CR-09 (gamelogs) gain an on-demand load call site and the
   "dataSeason-keyed" description stops being the whole truth; CR-08's trigger read
   `PlayerDetailModal.jsx` `nflScheduleByYear?.[mostRecentSeason]` changes to the picked season; every
   registered `App.jsx` anchor after the import block shifts; CR-01/CR-10's `PlayerDetailModal.jsx`
   anchors (already queued on D-58) shift again. `gameLog.js` is **not** edited, so CR-02's `:130-160`
   and CR-08's `:87,98,102,145` (+ queued `:142-143`) hold. Signal-registry rows `:56` (Sleeper weekly
   rows) and `:61` (gamelogs) gain/change consumers — CR-18 fires (§6).

## 2. Wiring

### 2.1 `src/utils/liveSeasonLog.js` (new, pure, no React)

Header comment: P5c; the pop-up's live season from Sleeper weekly rows (App's defence load, live entry);
view-only, never imported by projection/scoring; Sleeper rows are sparse — an absent counting key in a
`gp === 1` week is 0; bye = no `TEAM_<team>` row that week, or one with `opponent == null`.

Imports: `calculateFantasyPoints` (`./fantasyPoints`), `rankByTotalPoints` (`./weeklyRanks`),
`GAME_LOG_COLUMNS`, `findScheduleGame`, `deriveGameResult`, `formatWeather` (`./gameLog`),
`normalizeTeamForSchedule` (`./nflStats`).

```js
// The live season's entry of App's `defenceWeeklyByYear`, keyed on nflState.season. null when unknown.
export function selectLiveWeekly(byYear, nflState) {
  const live = parseInt(nflState?.season, 10)
  return Number.isFinite(live) ? (byYear?.[live] ?? null) : null
}

// → { [id]: { points, games } } over every gp === 1 row; TEAM_* skipped. Same arithmetic, same order,
// as weeklyRanks.js's seasonPointsFromWeekly (points must agree exactly — §7 test L-2).
export function liveSeasonLines(weeks, scoringSettings) { … }

// → Map<id, { posRank, overallRank }> — rankByTotalPoints over the lines' points.
export function liveSeasonRanks(lines, playerMap) { … }

// The rail's peers: the top `limit` at `position` by posRank (ties: higher points, then id), then —
// if the player is ranked but outside them — a null separator and the player. Each peer
// { player_id, positionRank, full_name, ppg }. Players with no posRank are never listed.
export function buildLivePeers({ lines, ranks, playersMap, position, playerId, limit = 5 }) { … }

export const LIVE_GAME_LOG_COLUMNS = Object.fromEntries(
  Object.entries(GAME_LOG_COLUMNS).map(([pos, cols]) => [pos, cols.filter(c => c.id !== 'epa')])
)

// One played week's production from a Sleeper stats object, ordered as LIVE_GAME_LOG_COLUMNS[pos].
// Counting keys absent → 0 (Sleeper omits zeros). aDOT = rec_air_yd / rec_tgt to 1 dp, '—' when
// rec_tgt is 0/absent or rec_air_yd is absent. `stats` null → every column '—'.
export function computeLiveGameLogValues(position, stats) { … }
```

`computeLiveGameLogValues` keys: QB `[`${pass_cmp}/${pass_att}`, pass_yd, pass_td, pass_int]`; RB
`[rush_att, rush_yd, rush_td, rec_tgt, rec]`; WR/TE (and any other position, as `computeGameLogValues`
does) `[rec_tgt, rec, rec_yd, rec_td, aDOT]`. Counts render as `String(n)`.

```js
/**
 * Rows for the live season, in the GameLogSection row shape (kind 'played' | 'bye', seasonType 'REG',
 * week, opponent, resultText, spread, total, roof, roundLabel: null, weather, production, pts).
 * Per loaded week, ascending (a failed week has no entry → no row):
 *  - row?.stats?.gp === 1 → played: team = row.team ?? playerTeam; production + PTS
 *    (calculateFantasyPoints(row.stats, scoringSettings ?? {})).
 *  - else team = row?.team ?? playerTeam; no team or 'FA' → no row (unknown, not a guess);
 *    TEAM_<team> absent or opponent == null → bye row; otherwise did-not-play: the context block with
 *    production all '—' and pts null.
 * Schedule join: normalizeTeamForSchedule(team) (Sleeper → era-accurate), then findScheduleGame /
 * deriveGameResult / formatWeather on that code; spread/total/roof off the schedule game.
 */
export function buildLiveGameLogRows({ position, weeks, playerId, playerTeam, scoringSettings, scheduleGames }) { … }
```

`playerTeam` is `playersMap[id].team` (Sleeper domain; the current team — used only for weeks with no
row of the player's own).

### 2.2 `src/App.jsx`

1. Imports, beside `useTeamHistoryLoader` (`:60`):
   `import { useGameLogSeasonLoader } from './hooks/useGameLogSeasonLoader'` and
   `import { selectLiveWeekly } from './utils/liveSeasonLog'`.
2. Directly above `const profileContextValue = useMemo(` (`:756`):

```js
  // P5c — the pop-up's game-log season switcher loads older seasons' gamelogs + schedule on demand,
  // into the same two maps (src/hooks/useGameLogSeasonLoader.js).
  const onNeedGameLogSeason = useGameLogSeasonLoader(setGameLogsByYear, setNflScheduleByYear)
```

3. In the context literal, after `historicalTeamTotals,`:

```js
    // P5c (player-popup-season-phase.md) — view-only: the season-phase input, the live season's
    // Sleeper weekly rows (the defence load's live entry, reused — no second fetch) and the league
    // scoring they are scored in, and the game log's on-demand season loader.
    nflState,
    liveWeeklyRows: selectLiveWeekly(defenceWeeklyByYear, nflState),
    scoringSettings: leagueData?.scoringSettings ?? null,
    onNeedGameLogSeason,
```

   Deps array: append `nflState, defenceWeeklyByYear, onNeedGameLogSeason`.
4. The defence effect's comment (`:1125-1126`), second line only — keep it one line:
   `// season's completed weeks, from Sleeper's weekly stat rows. Feeds the defenceAllowed memo and, live season only, the pop-up (selectLiveWeekly).`
   (comment line — `opponentStrengthViewOnly`'s App check skips it).

Nothing else in `App.jsx`. Do not touch the eager gamelogs/schedule effects.

### 2.3 `src/hooks/useGameLogSeasonLoader.js` (new)

```js
/**
 * P5c — on-demand gamelogs + schedule for one season, for the pop-up's game-log season switcher.
 * Widens App's `gameLogsByYear` / `nflScheduleByYear` beyond the eager dataSeason (+ sosSeason)
 * loads, which stay untouched; the caller only asks for seasons below dataSeason, so the two never
 * race. A year is recorded in a ref when its fetch STARTS, so a repeat call (React Strict Mode's
 * double effect, or re-picking a season) never re-fetches. An existing map entry is never
 * overwritten. A rejected load (IndexedDB, not the loaders' own graceful paths) still writes the
 * loader's graceful-empty shape, so the pop-up's "loading" state always ends. No cancelled flag:
 * these setters belong to App, which outlives every caller.
 * @returns {(year: number) => void}
 */
export function useGameLogSeasonLoader(setGameLogsByYear, setNflScheduleByYear) { … }
```

Empty shapes: gamelogs `{ players: {}, year: null, complete: false, rowCount: 0 }` (`nflGameLogs.js:59`),
schedule `{ games: [], year: null, complete: false, rowCount: 0 }` (`nflSchedule.js:47`) — local
constants, not imports (both loaders keep `EMPTY` private). Ignore a non-integer `year`. `useCallback`
over the two setters. On reject, `console.warn('[gameLogSeason] …')` then write the empty shape.

### 2.4 `src/context/ProfileDataContext.jsx` — comment only

The key list becomes eighteen: append `nflState, liveWeeklyRows, scoringSettings, onNeedGameLogSeason`
and one sentence: the last four are P5c's (the phase input, the live season's Sleeper weekly rows, the
scoring they are scored in, and the game log's on-demand season loader).

## 3. The Overview header

### 3.1 Derivations in `PlayerDetailModal.jsx`

Read the four new context keys. All of the following are hooks or derive from hooks and must sit
**above** the `if (!dynastyScore)` early return (`:226`).

```js
  // P5c — the shared season-phase rule picks the header (seasonPhase.js). `now` only matters for an
  // `off` payload (the pre-rollover window).
  const phase = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- read only for season_type 'off'; recomputed per nflState
    const now = Date.now()
    return seasonPhase(nflState, { now })
  }, [nflState])
  const inSeasonLayout = phase?.lead === 'current-plus-ros'
  const liveReady = liveWeeklyRows?.complete === true
  const liveSeason = liveReady ? liveWeeklyRows.year : null
  const liveLines = useMemo(
    () => (liveReady ? liveSeasonLines(liveWeeklyRows.weeks, scoringSettings) : null),
    [liveReady, liveWeeklyRows, scoringSettings])
  const liveRanks = useMemo(
    () => (liveLines ? liveSeasonRanks(liveLines, playersMap) : null), [liveLines, playersMap])
  const soFar = useMemo(() => {
    const line = liveLines?.[playerId]
    if (!line || line.games === 0) return null
    return { ppg: line.points / line.games, games: line.games, posRank: liveRanks?.get(playerId)?.posRank ?? null }
  }, [liveLines, liveRanks, playerId])
  // post / pre-rollover: the season just played is not in careerStats yet.
  const seasonLag = phase != null && !inSeasonLayout && mostRecentSeason != null
    && phase.lastCompleteSeason > mostRecentSeason
```

Lint rule as P5b §2.2: run `npm run lint` first **without** the disable comment; keep it only if lint
flags `Date.now()`. Lint ends at 0 problems either way.

### 3.2 In-season (`inSeasonLayout`)

**Tiles** — five, in this order: `dynasty`, `market`, **`sofar`** (new), `next`, `floor`. The grid
class becomes a literal pair: `inSeasonLayout ? 'grid grid-cols-2 md:grid-cols-5 gap-3.5' : 'grid
grid-cols-2 md:grid-cols-4 gap-3.5'` (Tailwind scans literals — never interpolate the number).

- `sofar` (`data-testid="tile-sofar"`): label `` `${phase.liveSeason} SO FAR` ``; value
  `soFar ? soFar.ppg.toFixed(1) : '—'`; no delta; note — `soFar` →
  `` [soFar.posRank != null ? `${player.position}${soFar.posRank}` : null, `${soFar.games} G`].filter(Boolean).join(' · ') ``;
  else `liveReady ? 'No games yet' : 'Weekly stats not loaded'`. ("No games yet" is a
  phrase about the player, not a data-availability claim; it is in a component, not in-scope docs.)
- `next`: label `projection?.inSeason ? 'REST OF SEASON' : \`PROJECTED · ${projSeason}\`` where
  `projSeason = mostRecentSeason != null ? mostRecentSeason + 1 : null` (fall back to `'PROJECTED'`
  when null). Note unchanged.

**Delta of `next` (all phases, follows the record):** when `projection?.inSeason` carries finite
`ros.value` and `ros.prior`, delta = `ros.value − ros.prior` (the movement the note describes —
Market's/My Team's Δ); otherwise today's `nextSeasonDelta`. Colour rule unchanged.

**Chart:** when `soFar` exists, every history bar is `kind: 'historical'` and a bar
`{ key: 'live', label: \`'${String(phase.liveSeason).slice(-2)} so far\`, value: soFar.ppg, kind: 'latest' }`
goes between the history bars and the projection bar. No `soFar` → bars as today. Caption: `projection?.inSeason
? 'rest of season' : \`${projSeason} projection\`` (in-season only; today's caption elsewhere).

**Rail:** title `` `RANK · ${phase.liveSeason} SO FAR` `` with a sub-line `by total points`
(`text-[11px] text-dp-muted`, under the title). Rows from `buildLivePeers({ lines: liveLines, ranks:
liveRanks, playersMap, position: player.position, playerId })` rendered exactly like today's rows
(`positionRank` → rank column, `ppg` → value column, same highlight). `liveLines` null or no peers →
one line `No {phase.liveSeason} games loaded.` (`text-xs text-dp-muted`).

### 3.3 Every other phase (`!inSeasonLayout`, incl. `phase == null`)

Tiles, delta (except the record rule above), chart, caption: as today. Rail title becomes data-true:
`` `RANK · ${mostRecentSeason}` `` (`RANK` when `mostRecentSeason` is null); its rows are unchanged
(`positionPeers`). When `seasonLag`, one line under the tiles (`data-testid="season-lag-note"`,
`text-[11px] text-dp-muted`):
`The {phase.lastCompleteSeason} season is over. These tiles compare {mostRecentSeason} with {mostRecentSeason + 1} until Sleeper rolls over to {phase.lastCompleteSeason + 1}.`

The identity row, ownership meta, Compare/Shop buttons and every section below `§game-log` are unchanged.

## 4. The game log

### 4.1 Season state in `PlayerDetailModal.jsx` (above the early return)

```js
  // P5c — the game-log season switcher. Options: seasons played (careerStats) + the live season
  // (Sleeper weekly rows); newest first; default the newest. View-local UI state.
  const liveGames = liveLines?.[playerId]?.games ?? 0
  const gameLogSeasons = useMemo(() => {
    const set = new Set(availableSeasons)
    if (mostRecentSeason != null) set.add(mostRecentSeason)
    if (liveSeason != null && liveGames > 0) set.add(liveSeason)
    return [...set].sort((a, b) => b - a)
  }, [availableSeasons, mostRecentSeason, liveSeason, liveGames])
  const [pickedGameLogSeason, setPickedGameLogSeason] = useState(null)
  const gameLogSeason = pickedGameLogSeason != null && gameLogSeasons.includes(pickedGameLogSeason)
    ? pickedGameLogSeason : (gameLogSeasons[0] ?? null)
  const isLiveLog = gameLogSeason != null && gameLogSeason === liveSeason
  const onDemandLog = gameLogSeason != null && mostRecentSeason != null && gameLogSeason < mostRecentSeason
  useEffect(() => {
    if (onDemandLog) onNeedGameLogSeason?.(gameLogSeason)
  }, [onDemandLog, gameLogSeason, onNeedGameLogSeason])
```

`availableSeasons` comes from `usePlayerProfile` (already returned, `usePlayerProfile.js:86-89`; do not
edit that hook). Replace `:92-93`'s two reads with `gameLogsByYear?.[gameLogSeason]` /
`nflScheduleByYear?.[gameLogSeason]`, and update the comment above them (`:89-91`, "no season
selector") to describe the switcher.

### 4.2 Card header and dispatch (`§game-log`, `:491-505`)

Card title row: `<div className="flex items-baseline justify-between gap-3 mb-3.5">`, the existing
`Game log` title div (drop its `mb-3.5`), and — when `gameLogSeasons.length > 1` — a `<select
data-testid="game-log-season" aria-label="Game log season">` with `value={gameLogSeason}`,
`onChange={e => setPickedGameLogSeason(Number(e.target.value))}`, one `<option>` per season, text
`` s === liveSeason && !phase?.liveSeasonComplete ? `${s} · so far` : String(s) `` (no "so far" in
`post`, where the lag note calls the season over — flag 5). Style:
`font-dp-mono text-[11px] bg-dp-chip text-dp-text-2 border border-dp-border rounded-md px-2 py-1`.

Body: `isLiveLog` → `<LiveGameLogSection …/>` (§4.3); else `<GameLogSection …/>` with `season={gameLogSeason}`,
`gameLogsResult`/`scheduleResult` for that season, and a new prop `loading={onDemandLog &&
typeof onNeedGameLogSeason === 'function' && (gameLogsByYear?.[gameLogSeason] === undefined ||
nflScheduleByYear?.[gameLogSeason] === undefined)}` (no loader in context → falls through to the
`!familyReady` degraded path, never a permanent loading line — flag 3). Key presence is read **only**
for this loading line, never for availability (still `complete`).

### 4.3 `dp/GameLogSection.jsx`

- Extract the table + caption JSX (`:72-116`) into a local `GameLogTable({ rows, cols, basisCopy })`,
  markup unchanged (`hasFinitePts` computed inside; caption `data-testid="game-log-basis"` unchanged).
  `GameLogSection` renders it with its existing `rows`/`cols`/`basisCopy`. No behaviour change.
- `GameLogSection` gains `loading = false`: when true, before the `!familyReady` branch, render
  `<p data-testid="game-log-loading" className="text-xs text-dp-muted italic">Loading the {season} game log…</p>`.
  Hooks stay above every return.
- New export `LiveGameLogSection({ weeklyResult, scheduleResult, playerId, position, season, playerTeam, scoringSettings, playerName })`:
  - `ready = weeklyResult?.complete === true && scheduleResult?.complete === true`; not ready →
    `DegradedBlock kind="not-yet-accruing"`: `Game log for {season} isn't available{ for name}.`
  - `rows = buildLiveGameLogRows({ position, weeks: weeklyResult.weeks, playerId, playerTeam, scoringSettings, scheduleGames: scheduleResult.games })` (memoised; empty when not ready).
  - No row with `production` other than all-`—` (i.e. no played week) → `DegradedBlock
    kind="not-yet-accruing"`: `No {season} games recorded for {playerName ?? 'this player'}.` Bye/DNP-only
    seasons land here.
  - Else `GameLogTable` with `cols = LIVE_GAME_LOG_COLUMNS[position] ?? LIVE_GAME_LOG_COLUMNS.WR` and
    caption: `{season} comes from Sleeper's weekly stats through week {last loaded week}, league-scored
    with this league's current scoring settings. Sleeper's stats carry no EPA, so that column is left
    out.` plus, when `weeklyResult.failedWeeks.length > 0`, ` Week(s) {list} couldn't be loaded.`
    (`Week` for one, `Weeks` for more; list joined `, `).

`LiveGameLogSection` is rendered with `weeklyResult={liveWeeklyRows}`, `scheduleResult={nflScheduleByYear?.[liveSeason]}`
(the `sosSeason` entry — `dataSeason + 1` is the live season whenever the live option exists),
`playerTeam={player.team}`, `scoringSettings`.

## 5. Out of scope

`usePlayerProfile.js` (CR-01/02/07/11 anchors — untouched), `gameLog.js`, Distribution / Usage /
Availability / Environment / Drivers / Why-next sections and their titles, the compare tab, Market,
My Team, `/week`. No playoff rows for the live season (the weekly load is regular-season only; the
caption's "through week N" states the range). No loader changes.

## 6. Docs (same commit)

All edits state mechanism, never availability (`docsAvailabilityClaims.test.js`).

- `docs/nav/utils.md` — new row `liveSeasonLog.js` after `gameLog.js` (`:37`): the exports of §2.1,
  one line each; view-only; consumer `dp/PlayerDetailModal.jsx` + `dp/GameLogSection.jsx`.
  `seasonPhase.js` row (`:56`): append `dp/PlayerDetailModal.jsx` (the pop-up's Overview header) to its
  adopters. `weeklyRanks.js` row (`:64`): append that `rankByTotalPoints` also ranks the pop-up's
  so-far tile and in-season rail (via `liveSeasonLog.js`).
- `docs/nav/components.md` — `dp/GameLogSection.jsx` row (`:33`): replace "in `mostRecentSeason`"
  with "in the season the pop-up picks"; add the `loading` prop and `LiveGameLogSection` (Sleeper
  weekly rows, `LIVE_GAME_LOG_COLUMNS`, no EPA, did-not-play and bye rows from the `TEAM_*` rows).
  `dp/PlayerDetailModal.jsx` row (`:37`): replace "fed `careerStats`, `gameLogsByYear[mostRecentSeason]`,
  `nflScheduleByYear[mostRecentSeason]`" with the switcher (options, default, on-demand load via
  `onNeedGameLogSeason`), and append one sentence on the phase header (§3.2/§3.3: `sofar` tile, the
  `next` label/delta rule, the so-far bar, the rail's two titles, the lag note).
- `docs/navigation.md` — `ProfileDataContext.jsx` row (`:83`) and Patterns item 2 (`:102`): eighteen
  keys, naming the four new ones. Hooks table: new row `useGameLogSeasonLoader.js` after
  `useTeamHistoryLoader.js`. `defenceWeekly.js` row (`:67`): append "The live season's result also
  reaches the pop-up through `ProfileDataContext`'s `liveWeeklyRows` (`liveSeasonLog.js`'s
  `selectLiveWeekly`) — its QB/RB/WR/TE + `TEAM_*` filter is what the live game log needs."
- `docs/architecture.md:73` (`defenceWeeklyByYear` row): append "its live-season entry is also the
  pop-up's `liveWeeklyRows`". `gameLogsByYear`/`nflScheduleByYear` rows: add "widened on demand per
  season by `useGameLogSeasonLoader` (the pop-up's game-log switcher)".
- `docs/ui.md:300`: replace "in `mostRecentSeason` (from `usePlayerProfile`'s `mostRecentSeason`, no
  season selector)" with "in the season picked in the card header — every season the player has
  played plus the live season (newest first, default the newest); older seasons load on demand; the
  live season is built from Sleeper's weekly rows (no EPA column)". Add one sentence to the pop-up's
  Overview description on the phase header (§3).
- `docs/signal-registry.md:56` (Sleeper weekly rows), Current-use cell: append `; and since P5c the
  player pop-up's live season — the so-far tile, its total-points position rank, the in-season rank
  rail and the live game log (production, league-scored PTS, did-not-play/bye from TEAM_* rows),
  read from the defence load's live entry (view-only)`. Coverage cell: "this slice reads" → "the app
  reads".
- `docs/signal-registry.md:61` (gamelogs), Current-use cell: "`gameLogsByYear`, dataSeason-keyed" →
  "`gameLogsByYear`, dataSeason-keyed, widened on demand per season by the pop-up's game-log
  switcher"; and "in the player-detail pop-up's `§game-log` section" → "in the player-detail pop-up's
  `§game-log` section (any season the player played; the live season reads Sleeper's weekly rows
  instead)".
- `src/api/defenceWeekly.js` header (`:1-6`): add one line — the live season's result is also read by
  the pop-up (via `selectLiveWeekly`).
- `src/api/sleeperStats.js:145-147` comment: replace the three lines, keeping **exactly three lines**
  (CR-02 anchors in this file), with: `// A team on bye has no TEAM_* row in the STATS payload at all
  (seen 2025 wk 7: 30 rows); a row with` / `// opponent == null is treated as a bye too. A bye team has
  no projections row either.` / `// Both are normal, neither is an error.`
- `docs/ui.md:296` (pop-up body description): "four tiles — … / Next season / …" and "RANK THIS SEASON
  peers" become true for both phases — four tiles (five in-season, with `{liveSeason} SO FAR`), the
  `next` tile's three labels (`NEXT SEASON` / `PROJECTED · {projSeason}` / `REST OF SEASON`), and the
  rail titled `RANK · {season}` (`RANK · {liveSeason} SO FAR` in-season, by total points). (flag 7)
- `docs/signal-registry.md:60` (schedule), Current-use cell: "`nflScheduleByYear`, dataSeason-keyed" →
  add "widened on demand per season by the pop-up's game-log switcher"; and name the live game log's
  schedule join (`liveSeasonLog.js`'s `buildLiveGameLogRows`, through `gameLog.js`'s helpers). (flag 7)
- `CLAUDE.md` — two in-place edits only, total ≤ 119 bytes (file is 24,881 / 25,000; run
  `claudeMdSize.test.js`): the `src/hooks/` row (`:55`) inserts `` `useGameLogSeasonLoader`, `` after
  `` `useTeamHistoryLoader`, ``; *State and data flow*'s "(view-only nflverse side-loads, modelled on
  `advStats`)" → "(view-only nflverse side-loads, modelled on `advStats`; the pop-up widens the last
  two per season)". Nothing else. (flag 7)

## 7. Tests

### 7.1 `src/utils/liveSeasonLog.test.js` (new)

Fixture: two weeks of `{ week, rows }`; `TEAM_DAL`/`TEAM_NYG` rows with opponents in week 1, week 2
has `TEAM_NYG` only (DAL on bye); `wr1` (DAL) `gp:1` week 1 `{ gp:1, rec_tgt:8, rec:5, rec_yd:76,
rec_td:1, rec_air_yd:96 }`; `wr2` (NYG) `gp:1` both weeks; `rb1` (NYG) week 1 row `{ gms_active: 1 }`
(no `gp`), week 2 `gp:1 { rush_att: 12, rush_yd: 40 }`; scoring `{ rec: 0.5, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1 }`.
Schedule: DAL–NYG week 1 (scored), NYG week 2 game.

- **L-1 lines.** `liveSeasonLines` → `wr1 { points: 16.1, games: 1 }` (5×0.5 + 7.6 + 6), `rb1.games === 1`; no `TEAM_*` key.
- **L-2 agreement with /week.** For the fixture, `liveSeasonLines(w, s)[id].points === seasonPointsFromWeekly(w, s)[id]` for every id, and the key sets match.
- **L-3 ranks + peers.** `liveSeasonRanks` gives WR ranks by total points (not PPG: give `wr2` more total, less PPG); `buildLivePeers` with `limit: 1` for `wr1` outside the top → `[top, null, wr1]`; inside → no separator; an unranked player is never listed.
- **L-4 values.** `computeLiveGameLogValues('WR', wr1Stats)` → `['8','5','76','1','12.0']`; a `gp:1` WR row with only `{ gp:1, rec_tgt: 2 }` → `['2','0','0','0','—']` (absent counts are 0, absent air yards is `—`); QB `{ gp:1, pass_cmp: 20, pass_att: 30, pass_yd: 250 }` → `['20/30','250','0','0']`; `null` → all `—`, length 4 for QB.
- **L-5 rows.** `buildLiveGameLogRows` for `wr1` (playerTeam `DAL`): week 1 played (opponent `NYG`, `W …` result text, `pts` 16.1), week 2 `kind: 'bye'`. For `rb1` week 1: a DNP row (opponent present, production all `—`, `pts` null). A player with `playerTeam: 'FA'` and no rows → `[]`. A Rams player (`team: 'LAR'`) joins a schedule game listed as `LA` (CR-16 hop).
- **L-6 select.** `selectLiveWeekly({ 2026: r }, { season: '2026' }) === r`; `{ season: 'x' }` → null; missing year → null.

### 7.2 `src/hooks/useGameLogSeasonLoader.test.js` (new, pattern of `useTeamHistoryLoader.test.js`)

Mock both loaders. **H-1** a call loads both families for that year and merges into harness state.
**H-2** a second call for the same year (and a Strict-Mode-style double call) fetches once. **H-3** an
existing map entry is not overwritten. **H-4** a rejected `loadNflGameLogs` writes the graceful empty
(`complete: false`) for that year. **H-5** non-integer year → no call.

### 7.3 `src/components/dp/PlayerDetailModal.seasonPhase.test.jsx` (new)

Build on `PlayerDetailModal.gameLogDistribution.test.jsx`'s fixture style (copy what is needed —
that file stays unedited). Context adds `nflState: { season: '2026', season_type: 'regular', week: 4,
season_start_date: '2026-09-09' }`, `scoringSettings`, `onNeedGameLogSeason: vi.fn()`, and
`liveWeeklyRows: { year: 2026, complete: true, failedWeeks: [], weeks: [...] }` with three weeks for
`wr1` (DAL) plus a second WR who outscores him on total points, and `nflScheduleByYear[2026]`
(complete) covering DAL's three games.

1. **S-1 in-season tiles.** `tile-sofar` exists and reads `2026 SO FAR`, the PPG to 1 dp, `WR2 · 3 G`;
   five tiles; the grid has `md:grid-cols-5`.
2. **S-2 next tile.** With a scored projection (`inSeason: { n: 3, ros: { prior: 20.5, value: 18.7, … } }`):
   label `REST OF SEASON`, delta `-1.8`. Without `inSeason`, in-season: label `PROJECTED · 2026`.
3. **S-3 chart.** A bar labelled `'26 so far` exists; the `2025` bar is not the `latest` colour
   (`bg-dp-up` only on the so-far bar).
4. **S-4 rail in-season.** Title `RANK · 2026 SO FAR`; the other WR listed first; `wr1` highlighted.
5. **S-5 offseason header.** `nflState: { season: '2026', season_type: 'pre' }`, `liveWeeklyRows: null`:
   no `tile-sofar`, four tiles, rail title `RANK · 2025`, no `season-lag-note`.
6. **S-6 lag note.** `{ season: '2026', season_type: 'post' }` → `season-lag-note` contains `The 2026
   season is over` and `compare 2025 with 2026`.
7. **S-7 switcher default + live log.** `game-log-season` exists; options `2026 · so far`, `2025`, …
   newest first; selected `2026`; the live table has `aDOT` and **no** `EPA/TGT`; `game-log-basis`
   contains `Sleeper's weekly stats through week 3` and `no EPA`; a bye week (week 2 with no `TEAM_DAL`)
   renders the BYE row.
8. **S-8 switch to dataSeason.** `fireEvent.change(select, { target: { value: '2025' } })` → `EPA/TGT`
   header back, gamelogs values render (as the existing WR test), `onNeedGameLogSeason` not called.
9. **S-9 on-demand.** Switch to `2024` with no `gameLogsByYear[2024]` → `onNeedGameLogSeason` called
   with `2024`; `game-log-loading` contains `Loading the 2024 game log`. Re-render with complete 2024
   results → the table renders.
10. **S-10 live rows not loaded.** `liveWeeklyRows: null` in-season → no `2026` option; `tile-sofar`
    value `—`, note `Weekly stats not loaded`; rail `No 2026 games loaded.`
11. **S-11 failed week caption.** `failedWeeks: [2]` → caption contains `Week 2 couldn't be loaded.`
12. **S-12 no live games → no live option** (flag 2). A WR with no `gp: 1` row in any live week: no
    `2026` option, the select's value is `2025`, `tile-sofar` note `No games yet`.
13. **S-13 sat out `dataSeason`** (flag 1). A player with 2024 games and no 2025 row: options include
    `2025` and the default is `2025` (today's degraded copy), `onNeedGameLogSeason` not called.
14. **S-14 no loader in context** (flag 3). Context without `onNeedGameLogSeason`, switch to `2024` with
    no 2024 results → no `game-log-loading`; the `isn't available` degraded copy renders.
15. **S-15 post label** (flag 5). `season_type: 'post'` with live rows → the option reads `2026`, not
    `2026 · so far`.

### 7.4 Existing tests

- `PlayerDetailModal.test.jsx:354` asserts `RANK THIS SEASON` — change to `RANK · 2024` (that file's
  `careerStats` ends at 2024, `:62-74`, so its `mostRecentSeason` is 2024). Its comment at `:222` ("RANK THIS SEASON rail") → "rank rail". These are the
  **only** permitted edits to existing tests (behaviour change, D7). Everything else — including
  `PlayerDetailModal.gameLogDistribution.test.jsx` (no `nflState` in its context → today's header,
  default season = `mostRecentSeason` since it has no live rows) and `PlayerDetailTabs.test.jsx` —
  must stay green **unedited**. If one needs an edit, stop and report.
- `src/__tests__/gameLogsViewOnly.test.js`: add one `it` per PIPELINE file asserting no import of
  `liveSeasonLog` or `useGameLogSeasonLoader` (extend the existing loop's body, or a second loop).

## 8. Findings for Anton (reported, not acted on)

1. **Pop-up "so far" = `/week`, may differ from My Team for a few days** (D3). The pop-up and `/week`
   read Sleeper directly; My Team's so-far column reads the stored file (refreshed Fri/Mon/Tue). On a
   Sunday night the same player can show different so-far numbers on My Team and in the pop-up.
2. **Week 1, and the window before Sleeper's week-2 stats:** no live season in the switcher (the
   weekly load starts at week 2) — the game log opens on last season, as P5a's week-1 rule does.
3. **Playoff weeks** are not in the live game log; the finished season's playoff rows appear once it
   becomes `dataSeason` and its gamelogs file is read.
4. **Rail alternative (D7):** keep the old list and only retitle it `RANK · 2025` in-season. Picked
   the live list because a rank list labelled with the season being played is what the rail implies.
5. **Pre-rollover offseason (Feb–Mar):** the just-finished season has no game log anywhere (not in
   `careerStats`, no weekly load in `off`). Fixing it means loading that season's weekly rows in `off`
   too — a `defenceLoadPlan` change, which also moves the defence numbers. Not done here.
6. **Byes in older seasons show as blank games** (flag 4). Seasons before the 2026 bye fix mark a bye
   `'X'` ("no game recorded"), and `gameLog.js:158` only skips empty slots, so an `'X'` week renders a
   row of dashes. It already happens for `mostRecentSeason`; the switcher now shows it back to 2012. A
   one-line `gameLog.js` change (render `'X'` as the bye/no-game row) — follow-up, out of scope here.

## Cross-repo impact

No served shape, floor, key or scoring change. Every entry below has a trigger this slice touches;
each Mirror is quoted verbatim from `docs/cross-repo-registry.md` (plan gate flags 8–9). Data side for
all of them: no action beyond the byte-sync of the D-58 batch.

- **CR-02 · season-totals schemaVersion & row composition** — `dp/GameLogSection.jsx` (named as the
  renderer of `resolveDisplayWeeklyPoints`) is restructured (`GameLogTable` extracted, no behaviour
  change); the display of served `weeklyStatus`/`weeklyPoints` through `buildGameLogRows` widens
  from `mostRecentSeason` to every season the player played; `src/api/sleeperStats.js` gets a
  comment-only, line-count-neutral edit. The Mirror's "the app displays served `weeklyPoints`
  verbatim (the pop-up's Game log `PTS` …)" now covers every season back to 2012.
  > A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry. **Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim** (the pop-up's Game log `PTS` and Distribution histogram) and labels them half-PPR from the row's served `scoringBasis`: changing the basis `weeklyPoints` is written on — D-47 included — without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test.

- **CR-08 · nflverse schedule (read-only)** — new on-demand `loadNflSchedule(year)` call site
  (`useGameLogSeasonLoader.js`); the pop-up reads the picked season's and the live season's
  schedule; `liveSeasonLog.js` joins it. A shape or floor change now breaks any season's game log,
  not only `dataSeason`'s.
  > Shape or floor changes land in both repos together. Read-only on the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written, with no validator to catch it (this family stays read-only/view-only on the app side regardless). **Since defence-numbers-rebuild `homeScore`/`awayScore` also drive `/week`'s RECORD column** — a rename or reshape blanks it to `—` with no error.

- **CR-09 · nflverse gamelogs (view-only)** — new on-demand `loadNflGameLogs(year)` call site; the
  pop-up renders any season's file the player played in.
  > Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading as per-player values. One sanctioned analytical read: `scripts/inseason-run.mjs` (CR-25) splits season-totals opportunity stats by week from gamelogs, behind a stop that requires ≥ 99% of the skill player-seasons present in gamelogs (gp ≥ 4) to reconcile with season-totals `stats`. It emits only fitted parameters: dimensionless k constants, plus the parameters of the posterior-combination and sort-measure forms built on them. It never emits per-player values. Weekly points there come from season-totals, never from gamelogs `fantasyPoints`. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

- **CR-01 · Projection snapshot envelope** — a new display read of the scored projection's
  `inSeason.ros.value`/`ros.prior` (the `next` tile's delta) in `PlayerDetailModal.jsx`, and its
  registered anchors shift. No envelope or `schemaVersion` change.
  > State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. Since in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back), so the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys need no change. Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

- **CR-10 · nflverse teamcontext (view-only)** — anchors only (`PlayerDetailModal.jsx:77,550`,
  `App.jsx` context/loader anchors shift).
  > Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

- **CR-16 · Era-accurate team-code remap** — a new `normalizeTeamForSchedule` call site
  (`liveSeasonLog.js`, Sleeper → era-accurate for the live schedule join). No mapping change.
  > A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

- **CR-18 · Signal registry rows** — `docs/signal-registry.md:56`, `:60` and `:61` edited (§6).
  The emitted row edits in §6 are the deliverable.
  > This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.


**Queue on D-58** (append to `.claude/tasks/data-repo-backlog.md`'s D-58 entry in the same commit, as a
"Also pending from P5c (player-popup-season-phase.md, `<sha>`)" bullet list):
- **CR-08 App side and Triggers** — add `src/hooks/useGameLogSeasonLoader.js` (on-demand
  `loadNflSchedule(year)` for seasons below `dataSeason`, merged into `nflScheduleByYear`) as a call
  site; the `PlayerDetailModal.jsx` read `nflScheduleByYear?.[mostRecentSeason]` becomes
  `nflScheduleByYear?.[gameLogSeason]` (the picked season) plus `nflScheduleByYear?.[liveSeason]` for the
  live game log; add `src/utils/liveSeasonLog.js` `buildLiveGameLogRows` as a reader of
  `homeTeam`/`awayTeam`/`week`/`result`/`homeScore`/`awayScore`/`spreadLine`/`totalLine`/`roof`/`temp`/`wind`
  (through `gameLog.js`'s helpers). Re-derive `App.jsx:1240,1260` and the context anchor `:769`.
- **CR-09 App side and Triggers** — add `src/hooks/useGameLogSeasonLoader.js` (on-demand
  `loadNflGameLogs(year)`); amend "`gameLogsByYear`, dataSeason-keyed" to "dataSeason-keyed, widened on
  demand per season by the pop-up's game-log switcher"; name `dp/GameLogSection.jsx` and
  `src/utils/gameLog.js` (the pre-existing `[registry-stale]` omission this entry already records),
  and (`[registry-stale]`, plan gate flag 10) `src/utils/qbSeason.js:13-24` `buildTeamPrimaryPassers`
  (reads `seasonType`/`team`/`attempts`) with its call `portfolio/Portfolio.jsx:455`, and
  `Portfolio.jsx:459` (`computeSeasonEfficiency(gameLogsByYear?.[dataSeason] …)`).
  Re-derive `App.jsx:1032,638`.
- **CR-01 / CR-10 Triggers** — re-derive every `PlayerDetailModal.jsx` anchor (already queued above;
  this slice shifts them again). **CR-01** also gains the `next` tile's `inSeason.ros.value`/`ros.prior`
  delta read in the same file.
- **CR-16 App side and Triggers** — add `src/utils/liveSeasonLog.js` (`normalizeTeamForSchedule`, the
  Sleeper→era-accurate hop for the live game log's schedule join).
- **All registered `App.jsx` anchors after `:60`** (CR-01, CR-07, CR-08, CR-09, CR-10) shift by this
  slice's two import lines, and those after `:756` by its hook call and context keys — re-derive at the
  sync.
- Data side: no action beyond the byte-sync.

## Done-definition notes for Session 2

Standard CLAUDE.md done-definition. Smoke (user-visible): open a pop-up for a rostered WR on `/week`
or My Team — check the five tiles, the `'26 so far` bar, the in-season rail, the switcher defaulting
to `2026 · so far` with a live table (no EPA column, PTS present), switch to 2025 (EPA back) and to an
older season (brief loading line, then the table). Paste the `grep -rn "PROVISIONAL(" src/` output
(no new tags expected — every value here is real data).

## Plan gate — round 1 (2026-10-03)

plan-reviewer raised 10 flags (1 high, 3 medium, 6 low). Session 1 checked each one against live source, and all 10 held. All are applied above.

| # | Sev | Flag | Decision |
|---|---|---|---|
| 1 | high | `noGames` (2023/24 games, no 2025 row) would default to 2024 → permanent loading line, breaking `gameLogDistribution.test.jsx:214-218` | Option (a): `mostRecentSeason` is always an option (D4, §4.1); S-13 |
| 2 | med | live season offered to players with no live games (IR/FA) | live option only when `liveLines[id].games > 0` (D4); S-12 |
| 3 | low | loading never ends without `onNeedGameLogSeason` in context | `loading` gated on the loader being a function (§4.2); S-14 |
| 4 | low | older seasons' `'X'` byes render as dash rows (`gameLog.js:158`) | accepted, reported §8.6 (`gameLog.js` out of scope) |
| 5 | low | `post`: option says "so far" beside "season is over" | suffix dropped when `phase.liveSeasonComplete` (§4.2); S-15 |
| 6 | low | `sleeperStats.js` comment is `:145-147`, not `:144-146` | corrected (§1.4, §6) |
| 7 | low | docs left false: `ui.md:296`, `signal-registry.md:60`, `CLAUDE.md` hooks row + State paragraph | added to §6 (CLAUDE.md ≤ 119 bytes, two in-place edits) |
| 8 | med | CR-02 touched but not named | added with full Mirror |
| 9 | med | CR-01/10/16/18 named without Mirror text; CR-08/09 Mirrors quoted partially | all Mirrors quoted verbatim (extracted from the registry, not from the reviewer's copy) |
| 10 | low | CR-09 misses `qbSeason.js` / `Portfolio.jsx:455,459` | added to the D-58 CR-09 bullet |

Size: about 53 KB, of which about 9 KB is verbatim Mirror text that the cross-repo rule requires. The plan itself is still one slice. A natural split if wanted: header (§3) and game log (§4).

## Verification — round 1 (2026-10-03, diff `e21fe2b..db44ec7`)

implementation-reviewer raised 6 flags. Session 1 independently re-ran `npm test`, which gave 139 files and 2,689 passing tests. It also re-ran `npm run lint`, which reported 0 problems, and `npm run build`, whose only warning is the chunk-size one that also appears on the clean tree.

The five self-reported deviations are all accepted. The chart bar gated on `inSeasonLayout` matches §3.2/§3.3's intent.

Flag 1 asked for the Mirror text in the commit messages. It is rejected: CLAUDE.md requires the Mirror text in the task file's `## Cross-repo impact`, which is committed in `c0483d3`.

Flags 2–6 are verified and fixed below.

## Fix pass 1

Change only what is listed. Leave everything else alone.

1. **Lag note position** (`src/components/dp/PlayerDetailModal.jsx:453-457`).
   - Move the `{seasonLag && (<p data-testid="season-lag-note" …>)}` block so it renders directly **after** the tile grid's closing `</div>`, not before the grid.
   - Drop `-mb-2` from its className.
   - Keep the text and testid unchanged.
   - Update the `{/* Four tiles (five in-season) */}` comment only if it would now mislabel the note.
2. **`docs/ui.md:296`** — append one sentence to the pop-up Overview description, phrased as mechanism with no availability claims. It must say:
   - The header follows `seasonPhase` (`src/utils/seasonPhase.js`).
   - When the lead is `current-plus-ros`, the Overview adds the `{liveSeason} SO FAR` tile and a `'{yy} so far` chart bar, built from the live season's Sleeper weekly rows (`liveWeeklyRows`).
   - When `seasonPhase`'s `lastCompleteSeason` is past `mostRecentSeason`, a one-line season-lag note renders under the tiles.
3. **`src/utils/liveSeasonLog.test.js`, L-5** — add a case that exercises the `opponent == null` arm of the bye classifier:
   - A week whose rows hold `TEAM_DAL: { stats: {}, team: 'DAL', opponent: null }`, plus no `gp: 1` row for a DAL player (`playerTeam: 'DAL'`).
   - Assert that week's row is `kind: 'bye'`.
4. **`src/utils/liveSeasonLog.test.js`, L-3** — make the "unranked never listed" case actually reach the no-`posRank` filter:
   - Add a player with a real `gp: 1` line in the weeks fixture but **no `playersMap` entry**, so `rankByTotalPoints` skips it.
   - Assert that the player has a `lines` entry with `games ≥ 1`, and is absent from `buildLivePeers`' output for `position: 'WR'`.
   - Keep the existing `ghost` assertion.
5. **`src/components/dp/PlayerDetailModal.seasonPhase.test.jsx`** — add two tests:
   - **S-16 live schedule not ready.** Use the default in-season context (live rows complete, `wr1` has live games) but set `nflScheduleByYear[2026]` to `{ games: [], year: null, complete: false, rowCount: 0 }`. The switcher still defaults to `2026`, and `#game-log` contains `isn't available`. There is no `<table>` inside `#game-log`.
   - **S-17 live did-not-play row.** Use a live fixture where wr1 has a played week and, in another week, no row while `TEAM_DAL` has an opponent. The live table renders a row for that week whose opponent cell is filled, whose production cells are all `—`, and whose PTS cell is `—`.

Done-definition:
- `npm test` (full), `npm run lint` at 0 problems, `npm run build` clean apart from the existing chunk-size warning.
- Commit as `Fix pass 1: P5c — lag note under tiles, ui.md phase sentence, classifier/peer/live-log tests`.
- Do not push.

## Verification — round 2 (re-review of `db44ec7..38c95a6`)

Items 1, 2, 3 and 5 are clean: the lag note, the `opponent == null` bye case, S-16 and S-17 each fail on a regression. Two flags survive the re-review. Per the workflow they go to Anton, with no third automatic round.

- **Medium, test honesty.** The new L-3 test still never reaches `buildLivePeers`' `posRank != null` check, because the position check rejects the unmapped player first. Inside the app that check can't fire: `rankByTotalPoints` gives every mapped player with points a rank, so the check is only defensive. The fix is a hand-built `ranks` Map in the test, a one-line change. Session 1 recommends it as a follow-up, not a blocker.
- **Low, docs.** The `docs/ui.md:296` sentence doesn't say what renders when the live read is empty: the so-far tile shows `—` with "Weekly stats not loaded", and the so-far bar is left out. Recommendation is the same: a follow-up.
