# Defence numbers rebuilt — league-scored points allowed, yards allowed, records (P2)

Session 1 (opus), 2026-10-02, against app `d4ccd3b`. Source brief: `../future_plans/in-season-notes-plan.md`
→ *Findings* and **P2**. View-only. Registry edits live in the companion
`defence-numbers-rebuild-registry.md` (commit 2).

## 0. Goal and fixed decisions — do not reopen

1. **Points allowed by position are rebuilt from Sleeper's weekly stat rows, scored in this league's
   scoring**, for both halves of the blend (last season and the live season), and that one source
   replaces `fan_pts_allow_*` at **every** `buildFpaTable` consumer: `/week` (ALLOWS column, Defences
   you face, weight panel `n`), `/teams` (four FPA columns), Portfolio (SOS column).
2. **The blend is unchanged.** `PRIOR_WEIGHT_GAMES = 3`, `FPA_PRIOR_DROP_GAMES = 9`, `blendFpaPerGame`,
   per-cell `weights`, `rankFpaTable`, `buildSosTable` — all untouched. Only the per-season inputs
   change. (The brief's finding that the blend is the bigger effect is reported to Anton, §13 — not
   acted on.)
3. **Defences you face gains three columns**: pass yards allowed per game, rush yards allowed per
   game (each current and last season), and W-L-T record (current and last season, from
   `nflverse/schedule` scores, as the brief specifies).
4. **StoreLagNotice is removed.** After this change nothing on `/week` reads the data store's
   season-totals file (`currentSeasonTotals`) — the brief's removal condition holds (§6.5).
5. **App.jsx owns the new load.** Three routes consume it, so it is domain state, not a
   route-scoped hook (CLAUDE.md → *App.jsx owns all domain/pipeline state*).
6. View-only: nothing new may reach `playerRows`, `projectedPPG`, the dynasty score or any `factors`
   entry (guards in §9).

## 1. Findings against live source (measured 2026-10-02, scripts in the session scratchpad)

Sleeper `GET https://api.sleeper.com/stats/nfl/<season>/<week>?season_type=regular`, 2025 weeks 1–18
and 2026 weeks 1–3:

1. **Every row carries its own `opponent`** (Sleeper domain, `LAR` not `LA`) and `team`. Crediting a
   player row to the defence it faced needs **no schedule join** — `row.opponent` is it.
   `normalizeStatsRowsResponse` (`src/api/sleeperStats.js:122`) already keeps `opponent`.
2. **`TEAM_<abbr>` rows** (one per team that played, `stats.gp === 1`) carry the offence's
   `pass_yd`, `pass_sack_yds`, `rush_yd`, `off_yd`. For the defence `row.opponent`:
   `pass_yd − pass_sack_yds + rush_yd === off_yd === that defence's DEF-row yds_allow`
   (28/28 defences, 2025 wk 5). So **pass yards allowed are net of sack yards** and pass + rush is
   total yards allowed. Keys confirmed present in both seasons.
3. **Games played:** counting, per defence, the weeks in which some `TEAM_*` row names it as
   `opponent` gives **17 for all 32 teams in 2025**; per-week TEAM_ row counts equal 2 × that week's
   REG schedule games in all 18 weeks; no week has a QB/RB/WR/TE scoring row against a defence that
   no TEAM_ row names. Bye teams have no rows at all.
4. **Method validation.** Summing `stats.pts_ppr` of QB/RB/WR/TE rows by `opponent` reproduces the
   DEF rows' `fan_pts_allow_<pos>` exactly (2026 wk 3: 0 of 128 cells off; 2025 wk 5: 1 of 128 off,
   KC WR by 9.4 — Sleeper's own precompute). **`fan_pts_allow_*` is therefore full PPR, not
   half-PPR** as `DefencesFaced.jsx:101`, `LineupTable.jsx:234`, `Teams.jsx:72`,
   `TeamOffences.jsx:72`, `docs/ui.md:254` and `docs/signal-registry.md:55` all state.
5. **Position source.** `playerMap[id].position` (the app's full `/players/nfl` DB) equals the
   payload's embedded `player.position` for every scoring row sampled (2025 wk 5, 2026 wk 3); no
   scoring player id is missing from it. Use `playerMap` — the cached weekly rows do not keep the
   embedded `player` object, and widening `normalizeStatsRowsResponse` would change a cached shape.
6. **League scoring vs Sleeper's figure** (Dynasty 040: `rec` 0.5, TE +0.5 bonus, first-down bonus
   0.25 RB/WR/TE, `pass_td` 5): mean |rank change| per position 0.6–2.1, max 9. KC 2025 per game,
   league vs Sleeper: QB 16.7/15.7, RB 22.1/19.1, WR 25.9/27.9, TE 11.6/11.0; WR rank 12 → 3.
   `bonus_*` keys (incl. `bonus_fd_*`, 2022+) are emitted on the weekly rows, so
   `calculateFantasyPoints(row.stats, scoringSettings)` is exact with no derivation (the same call
   `buildLast3Form` already makes).
7. **Records must come from the schedule, as specified.** The DEF rows' `pts_allow` is *not* the
   opponent's score (3 of 14 2025 wk-5 games differ — D/ST and return TDs are excluded).
8. **The schedule file trails.** The served `nflverse/schedule/2026.json` (`generatedAt`
   2026-09-25) scores weeks 1–2 plus week 3's Thursday game only; KC reads 2-0 while Sleeper has 3
   games. The RECORD cell must therefore say which week it runs through (§6.3). The P1 cadence change
   is the real fix and is out of scope.
9. **Payload size.** ~1.9–2.1 MB per week raw; the normalized `stat-rows/<s>/<w>` cache entry is
   ~0.7 MB. 18 prior-season weeks ≈ 13 MB IndexedDB, re-fetched at most weekly
   (`statsTTL(week, 0)` = 10080 min — existing TTL, unchanged).
10. **Dead code after this change:** `deriveStoreLag`, `maxDefGamesPlayed`
    (`useWeeklyDecision.js:40,66`), `scheduledGamesThrough` (`weeklySchedule.js:51`, only caller is
    `deriveStoreLag`), `isDefenseRowId` (`opponentStrength.js:39`, only callers are
    `collectSeasonFpaRates` and those two), `StoreLagNotice.jsx`. `currentSeasonTotals` is read on
    `/week`, `/teams` and Portfolio **only** for FPA — the prop is removed from all three
    (`Market` and the in-season seam keep it). `normalizeTeamForSchedule` in
    `useWeeklyDecision.js:11` is used only by `deriveStoreLag` (`:80`). The fixture
    `src/__fixtures__/season-totals-2025-def.json` is read only by `opponentStrength.test.js:11`.

## 2. New loader — `src/api/defenceWeekly.js`

Header comment: view-only; never imported by projection/scoring; guarded by
`opponentStrengthViewOnly.test.js`; reads the live Sleeper weekly stats endpoint via
`getWeeklyStatRows` (shares its `stat-rows/<s>/<w>` cache — `/week`'s own usage fetch hits the same
keys); rows are kept raw and scored on read (CLAUDE.md *Fantasy points: weekly*).

```js
import { getWeeklyStatRows } from './sleeperStats'

const DEFENCE_INPUT_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// Keeps only what buildDefenceSeasonAllowed reads: TEAM_<abbr> rows and QB/RB/WR/TE player rows
// (position from playerMap). Memory, not semantics — a 2,100-row week drops to ~600.
export function filterDefenceInputRows(rows, playerMap) { ... }   // -> new object, same row shape

// season/throughWeek/currentNflWeek come from defenceLoadPlan (§3). Promise.allSettled over weeks
// 1..throughWeek; a rejected week is reported in failedWeeks, never thrown. Never rejects.
export async function loadDefenceWeeklyRows({ season, throughWeek, currentNflWeek, playerMap }) {
  // -> { year: season, weeks: [{ week, rows }] (ascending), failedWeeks: number[], complete }
  // complete === weeks.length > 0
}
```

`complete` follows the loader convention: consumers branch on it, never on key presence. A season
with some failed weeks is still `complete` — per-game rates over the weeks that loaded are exact,
not approximate; the failure is surfaced in copy (§6.3).

## 3. `src/utils/opponentStrength.js` — new inputs, same blend

Rewrite the header's source paragraph (DEF rows / `currentSeasonTotals` → weekly rows). Keep
`FPA_POSITIONS`, `PRIOR_WEIGHT_GAMES`, `FPA_PRIOR_DROP_GAMES` (comments unchanged in substance),
`blendFpaPerGame`, `rankFpaTable` **byte-for-byte**. Delete `isDefenseRowId` and
`collectSeasonFpaRates`. Add `import { calculateFantasyPoints } from './fantasyPoints'`
(not a projection module — the existing guard's import-ban regex does not match it).

### 3.1 `defenceLoadPlan({ dataSeason, nflState })` → `Array<{ season, throughWeek, currentNflWeek }>`

```
regWeeks(s) = s >= 2021 ? 18 : 17
[] if dataSeason == null
prior: { season: dataSeason, throughWeek: regWeeks(dataSeason), currentNflWeek: 0 }
live  = parseInt(nflState?.season, 10)
if Number.isFinite(live) && live > dataSeason:
  type = nflState.season_type
  if type === 'post':    { season: live, throughWeek: regWeeks(live), currentNflWeek: 0 }
  if type === 'regular': tw = min((nflState.week ?? 0) - 1, regWeeks(live));
                         if tw >= 1 → { season: live, throughWeek: tw, currentNflWeek: nflState.week }
  any other type ('pre', 'off', missing): no live entry
```
Completed weeks only (`week − 1`): the in-progress week's partial games never enter a rate. This is
the same played-weeks rule `playedWeeklyMaps` uses. `currentNflWeek: 0` for a finished season gives
`statsTTL` its 7-day branch.

### 3.2 `buildDefenceSeasonAllowed(loaderResult, { playerMap, scoringSettings })`

Returns `null` unless `loaderResult?.complete`. Otherwise
`{ season: loaderResult.year, weeks: number[], failedWeeks: number[], teams }` where
`teams: { [eraTeam]: { gp, pts: { qb, rb, wr, te }, passYd, rushYd } }` — **season totals**, not
rates. One pass per week:

- `TEAM_*` row with `opponent != null`: `def = normalizeTeamForSchedule(row.opponent)` (CR-16 hop,
  LAR→LA); add `week` to that defence's played set; `passYd += (pass_yd ?? 0) − (pass_sack_yds ?? 0)`;
  `rushYd += rush_yd ?? 0`.
- Any other row with `opponent != null` and `playerMap[id]?.position` in QB/RB/WR/TE:
  `pts[def][pos] += calculateFantasyPoints(row.stats ?? {}, scoringSettings ?? {})`.
- `gp` = size of the played set. A team enters `teams` only when `gp > 0`; its four `pts` start at 0
  (a defence that faced no TE line allowed 0 — a measured value). Points credited to a defence with
  no played week (cannot happen per §1.3) are dropped, never divided by 0.

### 3.3 Rates

```js
// -> pts/gp, or null (no allowed map, team absent, gp <= 0)
export function computeFpaPerGame(allowed, team, pos)
// -> { pass, rush } per game, or null on the same conditions
export function computeYardsPerGame(allowed, team)
```
`allowed` is a `teams` map (era-keyed), `team` is era-domain. Keep the explicit `gp <= 0 → null`
guard and its comment.

### 3.4 `buildFpaTable({ prior = null, current = null } = {})`

Parameters **renamed** from `priorRows`/`currentRows` (a stale caller then fails loudly in tests,
not silently). Each is a `teams` map or null. `priorRate = computeFpaPerGame(prior, team, pos)`;
`current = { rate, gp } | null` from the `current` map. Team set = union of both maps' keys. Output
shape, `weights[pos] = current gp`, and the JSDoc's "until the live season is available this is
exactly the prior season's rate" paragraph keep their meaning — reword the paragraph to name the new
inputs.

## 4. `src/utils/weeklySchedule.js`

1. **Delete** `scheduledGamesThrough` and its header sentence about per-team scheduled-game counts.
2. **Add** `buildTeamRecords(schedule, { throughWeek = Infinity } = {})` →
   `{ [eraTeam]: { w, l, t, lastWeek, unscored } }` | `{}` for a null schedule. REG games only; both
   team codes through `normalizeTeamForSchedule`. A game with `homeScore != null && awayScore != null`
   counts toward W/L/T (compare the two scores; equal = tie) and `lastWeek` (the highest scored week
   for that team). A game with a null score and `week <= throughWeek` increments `unscored` — the
   schedule file has not caught up with a week Sleeper reports complete. A bye adds nothing, so a
   team on bye in the latest week is not marked as trailing. A team enters the map once it has any
   scored game or any `unscored` game; DefencesFaced renders `—` when `w + l + t === 0`, never `0-0`.
   The caller passes a `complete`-gated schedule or null, as for `buildRegWeekIndex`.

## 5. `src/App.jsx`

1. State, beside `nflScheduleByYear` (`:195`):
   `const [defenceWeeklyByYear, setDefenceWeeklyByYear] = useState({})   // { [year]: loaderResult }`
2. Effect, placed after the `currentSeasonTotals` effect (`:1093`):
   ```js
   // defence-numbers-rebuild.md §5 — view-only. Last season (dataSeason) in full, plus the live
   // season's completed weeks, from Sleeper's weekly stat rows. Feeds only the defenceAllowed memo.
   useEffect(() => {
     if (!careerStats || !nflState || !leagueData?.playerMap) return
     let cancelled = false
     const plan = defenceLoadPlan({ dataSeason: deriveDataSeason(careerStats), nflState })
     for (const p of plan) {
       loadDefenceWeeklyRows({ ...p, playerMap: leagueData.playerMap })
         .then(r => { if (!cancelled) setDefenceWeeklyByYear(prev => ({ ...prev, [p.season]: r })) })
         .catch(err => console.warn('[defenceWeekly] Load error:', err.message))
     }
     return () => { cancelled = true }
   }, [careerStats, nflState, leagueData])
   ```
   No reset on league switch: the rows are league-independent; scoring happens in the memo.
3. Memo, near the other view-only memos (not inside the `playerRows` chain):
   ```js
   const defenceAllowed = useMemo(() => {
     if (!careerStats || !leagueData) return null
     const priorSeason = deriveDataSeason(careerStats)
     const live = nflState?.season != null ? parseInt(nflState.season, 10) : null
     const opts = { playerMap: leagueData.playerMap, scoringSettings: leagueData.scoringSettings ?? {} }
     return {
       prior: buildDefenceSeasonAllowed(defenceWeeklyByYear[priorSeason], opts),
       current: live != null && live > priorSeason
         ? buildDefenceSeasonAllowed(defenceWeeklyByYear[live], opts) : null,
     }
   }, [careerStats, leagueData, nflState, defenceWeeklyByYear])
   ```
4. Props: `defenceAllowed={defenceAllowed}` on `WeekView`, `Portfolio`, `Teams` — exactly these
   three. Remove `currentSeasonTotals={currentSeasonTotals}` from those three only (`Market` keeps
   it).

## 6. `/week`

### 6.1 `src/hooks/useWeeklyDecision.js`

- Params: remove `currentSeasonTotals`; add `defenceAllowed = null`, `priorSchedule = null`.
- Delete `maxDefGamesPlayed`, `deriveStoreLag`, the `storeLag` memo, the `isDefenseRowId`,
  `scheduledGamesThrough` **and `normalizeTeamForSchedule`** imports (all three become unused — lint), and the `priorRows`/`currentRows` memos and their comments.
- `deriveGamesPlayed({ current, currentWeek })`: `current` is `defenceAllowed.current` (or null).
  Max `gp` over `current.teams` when it has at least one team; else `Math.max(0, currentWeek − 1)`.
  Keep it exported and pure; rewrite its comment (the source is the weekly rows now).
- `priorAllowed = defenceAllowed?.prior?.teams ?? null`, `currentAllowed = defenceAllowed?.current?.teams ?? null`,
  `priorSeason = defenceAllowed?.prior?.season ?? dataSeason`,
  `currentSeason = defenceAllowed?.current?.season ?? null`.
- `fpaTable = buildFpaTable({ prior: priorAllowed, current: currentAllowed })`.
- `priorRecords = buildTeamRecords(priorSchedule)`,
  `currentRecords = buildTeamRecords(schedule, { throughWeek: Math.max(0, currentWeek - 1) })`
  (memoised).
- `defenceFailedWeeks`: `[{ season, weeks }]` for each half whose `failedWeeks` is non-empty.
- Return: drop `storeLag`, `priorRows`, `currentRows`; add `priorAllowed`, `currentAllowed`,
  `priorSeason`, `priorRecords`, `currentRecords`, `defenceFailedWeeks`. Keep the rest.
- `buildPriorSnapByPlayer` is untouched (it derives `dataSeason` itself — same year as
  `priorSeason` whenever the prior half loaded).

### 6.2 `src/components/week/WeekView.jsx`

- Props: remove `currentSeasonTotals`; add `defenceAllowed = null`.
- `priorScheduleSeason = useMemo(() => deriveDataSeason(careerStats), [careerStats])` — **not**
  `priorSeason` or `dataSeason`: both names are destructured from the hook's return in this same
  component. `priorSchedule` = `nflScheduleByYear?.[priorScheduleSeason]` gated on `.complete` (else
  null), exactly as `schedule` is gated today. DefencesFaced's `priorSeason` prop is the hook's
  `priorSeason`.
- Remove the `StoreLagNotice` import and render; `<WeightPanel weights={weights} n={n} season={season} />`.
- `DefencesFaced` props: `starters`, `priorAllowed`, `currentAllowed`, `priorRecords`,
  `currentRecords`, `priorSeason`, `currentSeason`, `failedWeeks={defenceFailedWeeks}`.
- Update the header comment (drop "the store-lag notice").

### 6.3 `src/components/week/DefencesFaced.jsx`

- Join on `r.opponentEra` (era domain — the new maps are era-keyed). Update the header comment's
  domain paragraph accordingly; `allows`/`allowsRank`/`weight` still come off the row.
- `prior = computeFpaPerGame(priorAllowed, r.opponentEra, pos)`, `current` likewise.
  `yardsPrior/yardsCurrent = computeYardsPerGame(...)`. `recPrior = priorRecords[r.opponentEra]`,
  `recCurrent = currentRecords[r.opponentEra]`. All `null` when `r.empty`.
- Columns: `DEF · VS · {priorSeason} PTS/G · {currentSeason} SO FAR · BLENDED · RANK · PASS YD/G ·
  RUSH YD/G · RECORD` (existing six unchanged). The three new headers are two lines: the label, then
  `{currentSeason ?? '—'} · {priorSeason ?? '—'}` in `text-dp-muted-2 text-[9px]`.
- New cells (right-aligned, `font-dp-mono`): top line current value `text-[12px] text-dp-text-2`,
  second line prior value `text-[10.5px] text-dp-muted`. Yards: `Math.round(v)`, `—` for null.
  Record: `${w}-${l}` when `t === 0`, else `${w}-${l}-${t}`; `—` when absent or `w + l + t === 0`.
  On the current-season record only, when `recCurrent.unscored > 0`, append ` thru wk ${lastWeek}`
  (or ` no wk scored` when `w + l + t === 0`) in `text-dp-muted-2 text-[9px]` on the same line.
  `data-testid`s: `defences-pass`, `defences-rush`, `defences-record`.
- Footer (replace the "Half-PPR basis…" paragraph in full):
  > Points allowed use this league&rsquo;s scoring: every QB, RB, WR and TE stat line in
  > Sleeper&rsquo;s weekly stats, scored with your league&rsquo;s settings and credited to the defence
  > it came against, divided by that defence&rsquo;s games. Each row&rsquo;s bar beneath BLENDED is how
  > much of that row&rsquo;s blend is the current season — it differs by defence and position, so
  > there is no single season-wide percentage to show in the header. Yards are per game from the
  > opposing offence&rsquo;s weekly team line; passing is net of sack yards, so pass plus rush is
  > total yards allowed. Records are regular-season results from the nflverse schedule file, which
  > refreshes on its own cadence; &ldquo;thru wk N&rdquo; marks a record that trails the completed
  > weeks.
- When `failedWeeks` is non-empty, one extra footer line per entry:
  `Week{s} {list} of {season} failed to load from Sleeper and {is|are} left out of these figures.`

### 6.4 `src/components/week/LineupTable.jsx` (`:232-236`, `:136-137`)

`:136-137` — keep the `PROVISIONAL(no-data)` tag on the VS cell's missing W-L record but rewrite it:
`// PROVISIONAL(no-data): opponent W-L record · not rendered on this row · buildTeamRecords
// (weeklySchedule.js) supplies it and Defences you face renders it; wiring it here is P3's call`.

Replace the ALLOWS footnote with: "ALLOWS is blended per-game fantasy points allowed to that
player&rsquo;s position, in this league&rsquo;s scoring (Sleeper weekly stat lines, scored with your
settings). Rank 1 is the toughest of 32. The bar beneath is how much of the blend is the current
season." Drop the `fan_pts_allow_*` span.

### 6.5 Removals

Delete `src/components/week/StoreLagNotice.jsx` and `StoreLagNotice.test.jsx`.
`src/components/week/WeightPanel.jsx`: drop the `storeLag` prop and the `STORE THROUGH WK` branch —
the header always renders `n = {n} GAME(S) · w = n / (n + k)`. Its display-only rows are P3's,
not this slice's.

## 7. `/teams` — `src/components/teams/Teams.jsx`

- Props: `currentSeasonTotals` → `defenceAllowed = null`. Delete the `currentSeason` derivation
  comment block (`:146-155`); `currentSeason = defenceAllowed?.current?.season ?? null`,
  `priorSeason = defenceAllowed?.prior?.season ?? dataSeason`.
- `fpaTable = buildFpaTable({ prior: defenceAllowed?.prior?.teams ?? null, current: defenceAllowed?.current?.teams ?? null })`,
  deps `[defenceAllowed]`. `fpaPopoverText` receives `priorSeason` (not `dataSeason`).
- `fpaPopoverText` copy: `basis` becomes "This league's scoring — every QB/RB/WR/TE stat line in
  Sleeper's weekly stats, scored with your league's settings and credited to the defense it came
  against." `field` strings: replace the `fan_pts_allow_${pos} ÷ gamesPlayed` prefix with
  `` `league-scored ${pos.toUpperCase()} points allowed ÷ games` `` in all three variants (suffixes
  unchanged). Keep the polarity sentence and the blend glosses.
- Degraded banner (`:240-248`): the API-only-mode text is now false (the source no longer needs the
  data store). Replace with: `FPA QB/RB/WR/TE read "—" below until last season's weekly Sleeper
  stats have loaded — or, if that load failed, until the next visit.` Keep the
  `defenseRowsAvailable` gate and rename it `defenceTableAvailable`; update its comment.

## 8. Portfolio — `src/components/portfolio/Portfolio.jsx`, `TeamOffences.jsx`

- `Portfolio.jsx`: prop `currentSeasonTotals` → `defenceAllowed = null`. `currentSeason =
  defenceAllowed?.current?.season ?? null`. `sosTable` memo:
  `buildFpaTable({ prior: defenceAllowed?.prior?.teams ?? null, current: defenceAllowed?.current?.teams ?? null })`,
  deps `[defenceAllowed, nflScheduleByYear, sosSeason]`. `fpaCurrentSeason={currentSeason}`
  unchanged. Pass `priorSeason={defenceAllowed?.prior?.season ?? dataSeason}` to `TeamOffences`
  and use it in `sosGloss` where the gloss names the prior season today (`dataSeason` stays for the
  passer and team-metric columns).
- `TeamOffences.jsx`: the trailing `"Half-PPR basis (Sleeper's own scoring, not necessarily this
  league's)."` → `"This league's scoring (Sleeper weekly stat lines, scored with your settings)."`;
  SOS `field`: `'league-scored points allowed to the position ÷ games, averaged over remaining opponents'`.
  New prop `priorSeason = null`; the gloss uses `priorSeason ?? dataSeason` wherever it names the
  prior season, so `TeamOffences.test.jsx` (renders only `dataSeason={2025}`; asserts
  `'2025 season data only'` and `'shrinking toward 2025'`) stays green unchanged.

## 9. Tests

1. `src/utils/opponentStrength.test.js` — rewrite against the new inputs. Delete the
   `isDefenseRowId` block and the `REAL_2025_DEF` fixture test, and **delete
   `src/__fixtures__/season-totals-2025-def.json`** (its only reader; `seasonTotalsEntityFilter.test.js`
   reads the `-ind` fixture). Assert:
   - `defenceLoadPlan`: no dataSeason → `[]`; `regular` week 4 → live `throughWeek 3`,
     `currentNflWeek 4`; `regular` week 1 → prior only; `pre`/`off` → prior only; `post` → live
     `throughWeek 18`, `currentNflWeek 0`; live ≤ dataSeason → prior only; 2020 prior → 17 weeks.
   - `buildDefenceSeasonAllowed`: `null` for null / `complete: false`; a two-week fixture with a
     `TEAM_KC` row whose opponent is `LAR` credits **`LA`** (CR-16 hop); a QB row scored under a
     custom `scoringSettings` gives the hand-computed value (`pass_yd 300 × 0.04 + pass_td 2 × 5 =
     22`); a row whose `playerMap` position is K, or absent from `playerMap`, adds nothing; net pass
     yards subtract `pass_sack_yds`; `gp` counts weeks named by a TEAM_ row, not player rows; a
     defence that faced no TE has `pts.te === 0` (and `computeFpaPerGame` returns 0, not null).
   - `computeFpaPerGame`/`computeYardsPerGame`: null for null map, absent team, `gp 0`.
   - `buildFpaTable`: keep the existing blend/drop/degradation/`weights` cases, re-expressed on
     `teams` maps (`{ gp, pts, passYd, rushYd }`) — same expected numbers.
   - League scoring is what ranks: a fixture where two defences' rows carry `pts_ppr` values ranking
     them one way and the league's `scoringSettings` rank them the other — `rankFpaTable` over
     `buildFpaTable` must follow the league-scored order.
2. `src/api/defenceWeekly.test.js` (new) — mock `./sleeperStats`'s `getWeeklyStatRows`: it is
   called exactly for weeks `1..throughWeek` with `(season, w, currentNflWeek)` forwarded verbatim
   (the §3.1 TTL reasoning depends on both); one week rejects → `failedWeeks [w]`, other weeks present ascending, `complete true`; all reject →
   `complete false`, no throw; `filterDefenceInputRows` keeps `TEAM_*` and QB/RB/WR/TE, drops K/DEF
   rows and ids absent from `playerMap`.
3. `src/utils/weeklySchedule.test.js` — drop the `scheduledGamesThrough` block; add
   `buildTeamRecords`: W/L/T counting incl. a `result 0` tie, non-REG games skipped, `LA` keys,
   `lastWeek`, null schedule → `{}`; `unscored` counts a null-score game at `week <= throughWeek`
   only (one beyond it is not counted), and a team whose latest week is a bye has `unscored 0`.
4. `src/hooks/useWeeklyDecision.test.js` — drop `deriveStoreLag`; rewrite `deriveGamesPlayed` on
   `current` (max gp; empty teams → fallback; null → fallback).
5. `src/components/week/DefencesFaced.test.jsx` — re-key fixtures to era `opponentEra` (one row
   with `opponent 'LAR'`, `opponentEra 'LA'` proves the join uses the era key); assert the three new
   cells (current top, prior below), `2-1-1` tie formatting, `thru wk 2` only when
   `unscored > 0` (a bye-week team with `unscored 0` shows no marker), `—` for a bye row, the failed-weeks line.
6. `src/components/week/WeightPanel.test.jsx` — replace the two `storeLag` cases with one asserting
   the header never contains `STORE THROUGH`.
7. `src/components/teams/Teams.test.jsx` (`:251-300`) and `src/components/portfolio/Portfolio.test.jsx`
   (`:617`) — fixtures move from DEF-row `careerStats`/`currentSeasonTotals` to a `defenceAllowed`
   prop; same expected values and ranks; the Teams banner test asserts the new copy.
   `TeamOffences.test.jsx` — unchanged and green; add one case passing `priorSeason={2024}` and
   asserting the gloss names 2024.
8. `src/__tests__/opponentStrengthViewOnly.test.js` — extend: each `PIPELINE` file must not match
   `/buildDefenceSeasonAllowed|computeYardsPerGame|defenceLoadPlan|loadDefenceWeeklyRows|defenceWeekly/`;
   and in `src/App.jsx` every non-comment line containing `defenceAllowed` is either the
   `const defenceAllowed = useMemo(` line or the exact prop `defenceAllowed={defenceAllowed}`, with
   that prop occurring exactly three times.
9. `src/__tests__/weeklyDecisionViewOnly.test.js` — no change needed; confirm still green.

## 10. Docs (same commit as the code)

- `docs/navigation.md` — `/week` and `/teams` rows (source wording); `src/api/` table: new
  `defenceWeekly.js` row; `useWeeklyDecision.js` row (new params/returns, no store lag).
- `docs/nav/components.md` — `WeekView` (no StoreLagNotice), `WeightPanel` (no store-through),
  **delete** the `StoreLagNotice` row, `DefencesFaced` (era join, three new columns, footer),
  `Teams` (new prop, banner), `TeamOffences`/Portfolio (new prop).
- `docs/nav/utils.md` — `opponentStrength.js` (new exports, removed `isDefenseRowId`),
  `weeklySchedule.js` (`buildTeamRecords`, removed `scheduledGamesThrough`).
- `docs/architecture.md` — state table: add `defenceWeeklyByYear` (`{ [year]: loaderResult }`,
  initial `{}`, merged per year); a memo line for `defenceAllowed`; the `currentSeasonTotals` row
  stops naming Teams/Portfolio/`/week` if it does.
- `docs/ui.md:246-260` — FPA section: the blend paragraph stays; replace the *Basis caveat* with the
  league-scoring source; replace *Row taxonomy and the CR-16 join* with the weekly-row crediting
  (TEAM_ rows → games and yards, player rows → points, `normalizeTeamForSchedule` on `opponent`).
- `docs/signal-registry.md` — row 55 (`fan_pts_allow_*`): **Current use** becomes "unused —
  served, unrendered since defence-numbers-rebuild (replaced by league-scored weekly rows); measured
  2026-10-02 to be full-PPR, not half-PPR". **New row** after it: *Sleeper weekly stat rows (live
  API, app-fetched)* · raw source · `api.sleeper.com/stats/nfl/<season>/<week>` via
  `getWeeklyStatRows` (`stat-rows/<s>/<w>` cache) · any season Sleeper serves; this slice reads
  `dataSeason` + the live season's completed weeks · Reconstructable · view-only: `/week` usage and
  form (existing), and since this slice league-scored points allowed by position, pass/rush yards
  allowed (`TEAM_*` `pass_yd − pass_sack_yds`, `rush_yd`) and defence games (`opponentStrength.js`)
  for `/week`, `/teams`, Portfolio SOS; never projection/scoring. Schedule row 59: drop the
  "(plus `homeScore` … store-lag notice's `scheduledGamesThrough`)" clause; append a fourth
  consumer — `buildTeamRecords` (W-L-T from `homeScore`/`awayScore`), Defences you face's RECORD,
  for the live season and `dataSeason`.
- `CLAUDE.md` — Navigation map `src/api/` row: `Sleeper (`sleeper.js`, `sleeperStats.js`)` →
  `Sleeper (`sleeper.js`, `sleeperStats.js`, `defenceWeekly.js`)` (+20 bytes; file is 24,861 of
  the 25,000 ceiling — prune elsewhere in the same commit if the size test fails).
- `docs/projection.md:79` — the closing sentence "`fan_pts_allow_*` (points allowed) stays Sleeper
  half-PPR" becomes: points allowed are built from Sleeper's weekly rows in league scoring
  (`opponentStrength.js`); the served `fan_pts_allow_*` keys are full-PPR and unread.
- `docs/nav/components.md` LineupTable row — "the opponent's W-L record have no source in this
  slice" → the record is rendered in Defences you face; this row still renders none
  (`PROVISIONAL(no-data)`).

## 11. Backlog (`.claude/tasks/data-repo-backlog.md`, same commit as the registry)

Append **D-57 · Registry sync — defence numbers rebuild (CR-02/08/16/20/21)**: Found by the
registry commit's SHA · Blocking: yes for CR-24 (daily mirror run red until synced), no for the app
· Size: small, two-session route. Steps as D-53: byte-copy the app's mirrored span, run
`REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` and `node --test test/registry.test.mjs`;
gate on the changed-line count the companion's §G states. Note in the entry: CR-20 is retired, so
the data side may stop treating `fan_pts_allow_*` as load-bearing — no data-side code change is
asked for.

## 12. Touch list, done-definition, commits

**Commit 1 (code + tests + docs):** `src/api/defenceWeekly.js` (+ test, new),
`src/utils/opponentStrength.js` (+ test), `src/utils/weeklySchedule.js` (+ test),
`src/App.jsx`, `src/hooks/useWeeklyDecision.js` (+ test), `src/components/week/{WeekView,
DefencesFaced, LineupTable, WeightPanel}.jsx` (+ DefencesFaced/WeightPanel tests),
`src/components/week/StoreLagNotice{,.test}.jsx` (deleted), `src/components/week/ProjectionGapNotice.jsx`
(comment only: drop ", same as StoreLagNotice" at `:3`), `src/components/teams/Teams.jsx`
(+ test), `src/components/portfolio/{Portfolio,TeamOffences}.jsx` (+ Portfolio and TeamOffences
tests), `src/__fixtures__/season-totals-2025-def.json` (deleted),
`src/api/sleeperStats.js` (**comment only**, `:113-118`: `stat-rows/*` and `stats/*` can now cover
the same `dataSeason` weeks — `/week` and the defence loader read `stat-rows/*`, `getSeasonTotals`'
live-API path writes `stats/*`; the "do not dedupe" instruction stays),
`src/__tests__/opponentStrengthViewOnly.test.js`, the §10 docs (incl. `CLAUDE.md`, `docs/projection.md`).
**Commit 2 (registry + backlog):** `docs/cross-repo-registry.md` per the companion,
`.claude/tasks/data-repo-backlog.md` (D-57).

Nothing else. In particular: no code change to `sleeperStats.js`, no change to `statsTTL`, `blendWeights.js`,
`strengthOfSchedule.js`, `weeklyLineup.js`, `Market.jsx`, `inSeason*.js`, or `currentSeasonTotals`'s
loader.

Done-definition per CLAUDE.md, plus:
- `grep -rn "fan_pts_allow\|isDefenseRowId\|deriveStoreLag\|maxDefGamesPlayed\|scheduledGamesThrough\|StoreLag" src docs/nav docs/navigation.md docs/ui.md`
  returns only `src/__fixtures__/season-totals-2025*.json` hits (field-existence fixtures) — and
  `docs/signal-registry.md` is outside the grep's paths on purpose (its row 55 keeps the key names).
- `grep -rn "PROVISIONAL(" src/` output pasted into the hand-back (expected: no new tags — every
  new value is backed by real data).
- **Smoke** (`/week`, `/teams`, `/portfolio`, account in `docs/architecture.md`): console has no
  errors and no `[defenceWeekly] Load error` warning; `/teams` FPA columns populated for all
  32 with no banner after load; Defences you face shows the three new columns. Spot-check against §1
  (2025 is final; 2026 may move by stat corrections): KC last-season PTS/G QB 16.7 · RB 22.1 · WR
  25.9 · TE 11.6, pass/rush YD/G 196/106, record 6-11; KC 2026 after 3 games pass/rush 178/100,
  record from the schedule file with `thru wk N` if it still trails. No `NaN`, no layout collapse
  at the table's new width (horizontal scroll inside the card is acceptable — it already
  `overflow-x-auto`s).

## Cross-repo impact

Touched contracts: **CR-02, CR-08, CR-16, CR-18, CR-20 (retired), CR-21**. CR-14:
`calculateFantasyPoints` gains a caller, and callers are explicitly not triggers — no edit.

The registry text edits, and **each touched entry's `Mirror` text quoted in full** (the rule's
deliverable), are in `defence-numbers-rebuild-registry.md` §H. Route: two-session (app applies
first, data syncs the same day — D-57; the parent-folder route stays unused per the 2026-09-13
override). Summary of what each Mirror means for this change:

- **CR-02** — the app stops iterating served DEF rows (`opponentStrength.js`, `maxDefGamesPlayed`,
  `deriveStoreLag` leave its App side and Triggers). Its Mirror is unchanged and owes nothing new.
- **CR-08** — `homeScore`/`awayScore` now also drive `/week`'s RECORD column; `nflScheduleByYear`
  gains a `dataSeason` read on `/week`. Shape changes keep landing in both repos together.
- **CR-16** — `buildDefenceSeasonAllowed` and `buildTeamRecords` are new `normalizeTeamForSchedule`
  call sites; a one-sided mapping change empties their joins silently.
- **CR-18** — `docs/signal-registry.md` changes (row 55 current use, the schedule row, a new
  Sleeper-weekly-rows row). App-originated, so the data repo owes no row edit; quoted for the rule.
- **CR-20** — retired: no app surface reads `fan_pts_allow_*` or bare-abbr DEF rows any more.
- **CR-21** — `/teams`, Portfolio and `/week` stop reading the in-progress file; its Mirror is
  rewritten so it no longer claims a `/week` lag notice. The seam and Market clauses are unchanged.

## 13. Findings for Anton (reported, not acted on)

1. Sleeper's `fan_pts_allow_*` is full-PPR; every in-app label called it half-PPR.
2. The k = 3 blend still dominates early (at 3 games a defence is 50% last season). This slice
   changes the inputs only; if the Chiefs still look off after it lands, the blend is the next
   lever.
3. Records trail Sleeper by up to a week until P1 moves the schedule cron.
4. Cost: first visit downloads ~36 MB (18 weeks of last season) once a week from Sleeper; cached in
   the browser after that.
5. The daily snapshot capture (data repo, CR-22) boots the app with an empty browser cache, so it
   will also pull these ~40 MB from Sleeper on every run. Not a contract change; worth knowing if
   capture runs slow down.
6. On a cold first `/week` visit the live season's completed weeks are fetched twice at once (this
   loader and `/week`'s own usage fetch share a cache but not in-flight requests). A few MB, once a
   week; not fixed here.

## Review record — plan gate round 1 (2026-10-02)

plan-reviewer raised 20 flags; all verified against live source and all accepted (Anton delegates
review calls). Applied:

- **High:** `normalizeTeamForSchedule` import becomes unused (§6.1); CR-02's App side and Triggers
  also name `maxDefGamesPlayed`/`deriveStoreLag`/`isDefenseRowId` call sites (companion §A, count →
  15).
- **Medium:** WeekView `priorSeason` name collision → `priorScheduleSeason` (§6.2);
  `TeamOffences.test.jsx` kept green via `priorSeason ?? dataSeason` (§8) and a new case (§9.7);
  done-grep corrected and `ProjectionGapNotice.jsx:3` comment added to the touch list (§12);
  "thru wk" now keys on `unscored > 0`, so a team on bye in the latest week is not marked trailing
  (§4, §6.3, tests §9.3/§9.5); Mirror texts quoted in full (companion §H).
- **Low:** orphaned `season-totals-2025-def.json` deleted (§9.1); `sleeperStats.js:113-118`
  comment-only fix (§12); `docs/projection.md:79` and the CLAUDE.md `src/api/` row added (§10);
  LineupTable's `PROVISIONAL(no-data)` W-L tag rewritten, not removed — wiring the record into the
  lineup row stays P3's (§6.4); §9.2 asserts weeks requested and `currentNflWeek` forwarded;
  `TeamOffences.jsx:72` anchor; CR-16 App side gains `buildTeamRecords`; CR-20 Data side's
  "live hazard" sentence rewritten so the retired entry no longer argues against itself.
- **Registry-stale (CR-08):** App side `App.jsx`/`dataStore.js` line anchors refreshed to post-change
  values, and the two unnamed readers (`PlayerDetailModal.jsx`, Portfolio's `sosSeason` read) added
  to Triggers (companion §B).
- **Advisory, recorded not changed:** duplicate in-flight fetch and daily-capture download cost
  (§13.5–6). No App-memo behaviour test beyond the §9.8 line guard — the memo is four lines of
  wiring over functions tested directly.


## Verification record (Session 1, 2026-10-02, `d4ccd3b..93ddc3c`)

implementation-reviewer: no fidelity or invariant flags. Registry replay of companion §A–E is exact
and the mirrored span differs in exactly 15 lines. All four declared deviations accepted: Portfolio
memo deps on the hoisted halves are equivalent; the `docsAvailabilityClaims` allowlist removal was
forced by its own stale-entry check and narrows the guard; the trimmed Teams negative assertion is
restored in a stronger form below; D-57's SHA is fixed below. Four low flags:
1. D-57 breaks the `Found · Found by` format and never names `93ddc3c` → **accepted** (1.1).
2. Mirror texts not in commit messages → **rejected**: the rule puts them in the task file, and
   they are in the companion §H, which this fix pass commits (1.4).
3. `defenceFailedWeeks` derivation untested → **accepted** (1.2). The `throughWeek` cut is already
   pinned by `buildTeamRecords`' own tests, and WeekView's `.complete` gate is the same one-line gate
   `schedule` has always had → not extended.
4. New copy unasserted → **accepted** for the two `field` strings (1.3), which carry the source
   claim; the footers are prose and stay unasserted.

Found during verification: **backlog-id collision with P1** (data repo `season-totals-cadence.md`,
shipped and pushed `dc87b48..85dd48d`). P1 asks an app session to file **D-57** and apply three
CR-21 edits. Its Mirror sentence names `buildFpaTable`'s per-DEF rates, `deriveStoreLag` and
`maxDefGamesPlayed`, all deleted by this slice. P1 is pushed, so its ordering precondition holds.
Decision: fold P1's three edits into this slice's D-57, adapted to post-P2 code (1.5). That gives
one sync and one red window instead of two conflicting entries.

## Fix pass 1

### 1.1 D-57 (`.claude/tasks/data-repo-backlog.md:853`)
Rewrite the metadata line to the standard form:
`**Found:** defence-numbers-rebuild.md · **Found by:** `8d1eeb2` (code), registry edits `93ddc3c` + fix pass 1 · **Blocking:** yes for CR-24 (the daily mirror run stays red from the app push until synced); no for the app · **Size:** small — two-session route, same day as the app push`.
Retitle it `D-57 · Registry sync — defence numbers rebuild + season-totals cadence (CR-02/08/16/20/21)`.
In Steps, change the gate to **16** physical lines (verified count from 1.5), add `CR-21 Data side (1)` to the enumerated
list, and add one sentence: "Includes data `season-totals-cadence.md`'s three CR-21 edits, adapted
in app fix pass 1 (its Mirror sentence no longer names readers this slice deleted). Byte-copy the
app span at the fix-pass commit — not at `93ddc3c`."

### 1.2 Test `defenceFailedWeeks`
In `src/hooks/useWeeklyDecision.js`, extract the memo body into an exported pure
`buildDefenceFailedWeeks(defenceAllowed)` (same logic). The memo calls it. Comment:
`// Halves of the defence load that dropped weeks — surfaced in DefencesFaced's footer.` In
`useWeeklyDecision.test.js`, assert:
- null → `[]`;
- `{ prior: { season: 2025, failedWeeks: [4] }, current: { season: 2026, failedWeeks: [] } }` → `[{ season: 2025, weeks: [4] }]`;
- both halves failing → two entries, prior first;
- `{ prior: null, current: { season: 2026, failedWeeks: [2, 3] } }` → `[{ season: 2026, weeks: [2, 3] }]`.

### 1.3 Assert the source claim in the `field` strings
- `src/components/teams/Teams.test.jsx`, the gCur ≥ 9 case (`:313-326`): add
  `expect(dialog.textContent).toContain('league-scored QB points allowed ÷ games')`.
- `src/components/portfolio/TeamOffences.test.jsx`: in the case that opens the SOS popover (add one
  if none opens it), assert it contains
  `'league-scored points allowed to the position ÷ games, averaged over remaining opponents'`.
No source change. If either assertion fails, stop and report; do not edit the copy to match.

### 1.4 Commit the task files
`git add .claude/tasks/defence-numbers-rebuild.md .claude/tasks/defence-numbers-rebuild-registry.md`
in the fix-pass commit.

### 1.5 Registry — P1's CR-21 edits, adapted (`docs/cross-repo-registry.md`, CR-21 only)
Edit by exact string replacement. Each anchor occurs exactly once in the file at `93ddc3c`.
1. **Data side**: replace `` the weekly workflow's own cadence (`.github/workflows/nfl-season-totals.yml`) ``
   with `` the workflow's own cadence (`.github/workflows/nfl-season-totals.yml`, Fri/Mon/Tue 06:13 UTC since season-totals-cadence.md) ``.
   In the same field, replace `` `shouldSkipCompletedSeason` / the `inProgress `` with
   `` `shouldSkipCompletedSeason` / `isOpeningWeekPartial` / the `inProgress ``.
2. **Triggers**, data side: replace `` `hasNoData`, `shouldSkipCompletedSeason` in `scripts/update-nfl.mjs` ``
   with `` `hasNoData`, `isOpeningWeekPartial`, `shouldSkipCompletedSeason` in `scripts/update-nfl.mjs` ``.
3. **Mirror**: after its final text `over-weights every posterior.`, append (one space first):
   `` **Since season-totals-cadence.md (2026-10) the job runs Friday, Monday and Tuesday mornings, so between Friday and Tuesday the file holds a partly played current week under the same `inProgress: true` marking** — teams that have played it carry one more `gamesPlayed` than teams that have not. Per-player readers (the posteriors' own `n`) read this correctly; the league-max reader (Market's "up to N games played") reports the leading teams' count. A new reader that infers "weeks complete" from a league-wide max `gamesPlayed` will be one week early from Friday to Tuesday. Points allowed no longer read this file (defence-numbers-rebuild). ``

After 1.5 the mirrored span differs from `d4ccd3b`, and so from the data copy at `defacb1`
(identical at `d4ccd3b`), in **16** physical lines. CR-21 Data side is the only newly changed line:
App side, Triggers and Mirror were already changed in `93ddc3c`. Verify by diffing the
sentinel-bounded span against `d4ccd3b` before committing, and write the verified count into D-57.

Leave alone: all code outside 1.2's extraction; the companion file's §A–H text.

**Done-definition:** full CLAUDE.md done-definition (smoke not needed — no visible change). One
commit: `Fix pass 1: defence numbers rebuild — D-57 format + P1 CR-21 fold-in, failed-weeks test, field assertions, task files`.
Hand back the SHA and the verified changed-line count.
