# Dual position ranks — Slice B: My Team + This Week (#5, #6)

Review depth: full — §7 edits `docs/signal-registry.md`, the App site of CR-18 in `docs/cross-repo-registry.md`;
touching a registry-listed site is a non-overridable `full` trigger. (Otherwise a view-only display change on two
surfaces with no scoring, projection, pipeline, state or TTL trigger; deletes three exported view-only helpers
whose last callers move here.)

Decided by Anton 2026-11-26 (handoff brief "Dual position ranks (total points + PPG) everywhere"): format
`QB3 · QB1/g` (total-points rank first, PPG rank second with a `/g` suffix), overall `#5 · #2/g overall`;
3-game minimum for every PPG rank (`min(3, most games at the position)`); sleek presentation. Slice A
(`649e379`, `59593ad`, signed off 2026-11-26) built `rankDual`, `seasonLinesFromCareer`, `PPG_RANK_MIN_GAMES`
(`src/utils/weeklyRanks.js`) and `RankPair` / `RANK_PAIR_TITLE` (`src/components/dp/RankPair.jsx`). This slice
consumes them. App repo only. Display-only.

Cross-repo: none of the touched source files (`weeklyRanks.js`, `liveSeasonLog.js`, `RankPair.jsx`,
`Portfolio.jsx`, `LineupTable.jsx`, `useWeeklyDecision.js`) appears in `docs/cross-repo-registry.md`. §7 edits
`docs/signal-registry.md`, the App site of **CR-18** (invariant: "Every ingested field has a current
signal-registry row"; data side `data-catalog.md`). The edited row (`:126`, season position/overall rank) is a
view-layer computed factor, not an ingested field, and no ingested field is added, removed or renamed — so
CR-18's invariant is untouched and `data-catalog.md` needs no edit. No index edit, no backlog line. Sign-off
line: "Touches cross-repo index: yes — CR-18 (`docs/signal-registry.md` row 126 reworded; computed view-layer
row, no ingested field changed, no data-side edit)".

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a backgrounded `npm run dev`, and
stops it when done.

**Copied definitions created by this slice: none.** The This Week line's visible text and its tooltip both
come from one `rankSegments` function (§4.1); `RankPair` and `rankPairText` share one `ppgRankLabel` (§2).
This slice **deletes** three originals whose copies Slice A pinned with equality tests (§1.3), so those
tests (W-5, W-6, L-2) go with them and their behavioural assertions are re-stated as standalone tests (§6).

---

## 0. Pre-checks done in planning (Session 1, 2026-11-26, HEAD `ee30371`)

1. **Callers of the single-rank helpers** (`grep -rnE "rankByTotalPoints|seasonPointsFromCareer|seasonPointsFromWeekly" src`, non-test):
   `portfolio/Portfolio.jsx:22` (import), `:429` and `:433` (`lastRanks`, `liveRanks`), and
   `weeklyRanks.js:167–168` (`buildLineupRanks`). Tests: `weeklyRanks.test.js` (`rankByTotalPoints`,
   `seasonPointsFromCareer`, `seasonPointsFromWeekly` describes; W-5; W-6), `liveSeasonLog.test.js:6,52–57` (L-2).
   After §3 and §1.2 no production caller remains → all three are deleted (§1.3).
2. **`buildLineupRanks` result readers:** `hooks/useWeeklyDecision.js:275` (passes it as `ranksByPlayer`),
   `utils/weeklyLineup.js:142` (copies `ranksByPlayer[id]` onto `row.ranks` opaquely), `week/LineupTable.jsx:69–74`
   (`rankLine`, the only reader of `lastPos`/`thisPos`/`thisOverall`). `weeklyLineup.test.js:349–352` passes an
   old-shape object through and asserts it comes back equal — opaque passthrough, unaffected.
3. **`liveSeasonLines`** (`liveSeasonLog.js:18`) takes the same `[{ week, rows }]` shape as
   `seasonPointsFromWeekly` (L-2 called both with one `weeks`), skips `TEAM_*` and non-`gp === 1` rows, sums
   `calculateFantasyPoints` and counts games. `liveSeasonLog.js` imports `fantasyPoints`, `gameLog`, `nflStats` —
   none imports `weeklyRanks`, so `weeklyRanks → liveSeasonLog` creates no cycle. The view-only guards
   (`weeklyDecisionViewOnly.test.js`, `gameLogsViewOnly.test.js`) check direct imports from pipeline modules only;
   `weeklyRanks.js` is not a pipeline module.
4. **My Team rank sites** (`portfolio/Portfolio.jsx`): `SeasonLineCell` (`:198–208`, sub-line
   `[posRank, 'N G'].join(' · ')`); `playerFactsById` (`:487–499`, `posRank` and `soFar.posRank` as joined
   strings `` `${position}${rank}` ``); render sites `col-last` / `col-sofar` (Starting ten `:1265–1266`, Bench
   `:1443–1444`), `col-posrank` (off-season, Starting ten `:1274`, Bench `:1454`); legend strings `:1295–1296`.
   `rankByPos` (`:417–424`, `rankPositionSeason`) feeds only `f.last` (the last-season **PPG value**, not a rank)
   — out of scope, unchanged. `liveRows` (`:381`) is `liveSeasonTotals.players`, careerStats-shaped
   (`gamesPlayed`, `fantasyPoints`), so `seasonLinesFromCareer(liveRows)` applies exactly as
   `seasonPointsFromCareer(liveRows)` did.
5. **Contrast over the watermark.** `LineupTable.test.jsx` T4b requires every text node over the
   `PlayerCell` team-logo watermark to clear 4.5:1 (`__tests__/watermarkContrast.js`'s `minWatermarkContrast`).
   Computed in planning (same maths, `src/index.css` tokens, white at 0.12 over `dp-card`/`dp-card-quiet`/
   `dp-row-self`): `dp-text-4` 5.00, `dp-text-5` 4.21, `dp-muted` 3.70, `dp-muted-2` 1.92. So on This Week the
   `/g` part **cannot** be dimmer than the sub-line's own `dp-text-4`; the hierarchy is made the other way —
   the total rank is lifted to `dp-text-2` (§4.2). My Team's season cells are not inside `PlayerCell` (no
   watermark); they keep `RankPair`'s default `/g` tone (`dp-muted-2`), the same as the signed-off pop-up.
6. **Width.** This Week's sub-line sets the frozen PLAYER column's width at `md`+ (the `startsit-flag` comment,
   `LineupTable.jsx:294`; `PLAYER_CELL_PHONE_CAP` is `max-w-[168px] md:max-w-none`). Below `md` the sub-line
   truncates with the full line in its `title` (P1-T1) — today's 37-character line already does. The pairs add
   about 22 characters (~130px at 11px). That growth is what the pairs need; it is reported in the smoke (§7),
   not engineered away.

---

## 1. `src/utils/weeklyRanks.js`

### 1.1 Header comment

Rewrite lines 1–11 to say: the module owns the production-rank logic every surface consumes — `rankDual`
(total-points rank plus points-per-game rank under the per-group `min(PPG_RANK_MIN_GAMES, most games)` floor),
the line builders, `buildRankPeers` (pop-up rails) and `buildLineupRanks` (`/week`'s rank line); My Team's
season cells (`portfolio/Portfolio.jsx`) call `rankDual` directly; `seasonRanks.js`'s
`buildSeasonPositionRanks` ranks through `rankDual` while its `rankPositionSeason` remains a PPG-only lookup.
Keep the "Overall ranks among QB/RB/WR/TE only", competition-ranking, live-season-source and Population
paragraphs as they are.

### 1.2 `buildLineupRanks`

```js
import { liveSeasonLines } from './liveSeasonLog'

// → { [id]: { lastPos, lastPosPpg, thisPos, thisPosPpg, thisOverall, thisOverallPpg } } for each rendered
// player, each a number or null. Total and per-game ranks from rankDual; this season's games are the weekly
// rows' gp === 1 count (liveSeasonLines).
export function buildLineupRanks({ rendered, careerStats, playedWeeklyMaps, playerMap, scoringSettings }) {
  const lastSeason = deriveDataSeason(careerStats)
  const lastRanks = rankDual(seasonLinesFromCareer(careerStats?.[lastSeason]), playerMap)
  const thisRanks = rankDual(liveSeasonLines(playedWeeklyMaps, scoringSettings), playerMap)
  // loop as today; per id:
  //   lastPos: l?.posRank ?? null, lastPosPpg: l?.posRankPpg ?? null,
  //   thisPos: t?.posRank ?? null, thisPosPpg: t?.posRankPpg ?? null,
  //   thisOverall: t?.overallRank ?? null, thisOverallPpg: t?.overallRankPpg ?? null
}
```
Total ranks are unchanged: `seasonLinesFromCareer` has `seasonPointsFromCareer`'s row filter and
`liveSeasonLines` has `seasonPointsFromWeekly`'s arithmetic (Slice A's W-5/W-6/L-2 proved both before they are
deleted here).

### 1.3 Delete

- `rankByTotalPoints`, `seasonPointsFromCareer`, `seasonPointsFromWeekly`, and the now-unused
  `calculateFantasyPoints` import.
- `seasonLinesFromCareer`'s comment: drop "Same row filter as seasonPointsFromCareer (equality test W-6)".
- `competitionRanks`, `OVERALL_POSITIONS`, `PPG_RANK_MIN_GAMES`, `rankDual`, `buildRankPeers`: unchanged.

## 2. `src/components/dp/RankPair.jsx`

Two optional class props and a text twin, so This Week can set its own tones and build its tooltip from the
same format. Defaults keep the pop-up's rendering byte-identical.

```jsx
// '—' when the per-game rank is null (under the games floor).
const ppgRankLabel = (prefix, rankPpg) => (rankPpg != null ? `${prefix}${rankPpg}` : '—')

// The pair as plain text, for title attributes: `QB3 · QB1/g`, `QB3 · —/g`.
export function rankPairText(prefix, rank, rankPpg) {
  return `${prefix}${rank} · ${ppgRankLabel(prefix, rankPpg)}/g`
}

export function RankPair({ prefix = '', rank, rankPpg, title = RANK_PAIR_TITLE, rankClassName, ppgClassName = 'text-dp-muted-2' }) {
  if (rank == null) return null
  return (
    <span data-testid="rank-pair" title={title} className="whitespace-nowrap">
      <span className={rankClassName}>{prefix}{rank}</span>
      <span className={ppgClassName}> · {ppgRankLabel(prefix, rankPpg)}/g</span>
    </span>
  )
}
```
Update the component comment: callers over the `PlayerCell` watermark (This Week) pass tones that clear 4.5:1
there — `ppgClassName` must not be dimmer than the host text; elsewhere the default dims the `/g` part.
(`rankClassName` undefined renders no `class` attribute on the first span, as today.)

## 3. `src/components/portfolio/Portfolio.jsx` (#5)

1. Imports: drop `rankByTotalPoints, seasonPointsFromCareer`; import `rankDual, seasonLinesFromCareer,
   PPG_RANK_MIN_GAMES` from `../../utils/weeklyRanks` and `RankPair` from `../dp/RankPair`.
2. `lastRanks` / `liveRanks` memos: same guards and deps, bodies
   `rankDual(seasonLinesFromCareer(careerStats[dataSeason]), playerMap)` and
   `rankDual(seasonLinesFromCareer(liveRows), playerMap)`. Comment above `lastRanks`: "D2 — position rank by
   total league-scored points with the per-game rank beside it (weeklyRanks.js's rankDual, /week's basis)".
3. `playerFactsById`: `posRank` and `soFar.posRank` become **objects** `{ prefix, rank, rankPpg }` (or `null`):
   ```js
   const pair = (r) => (r?.posRank != null && position ? { prefix: position, rank: r.posRank, rankPpg: r.posRankPpg ?? null } : null)
   const posRank = pair(lastRanks.get(id))
   // in the liveRows branch:  posRank: pair(liveRanks.get(id)),
   ```
   (`pair` declared inside the loop body after `position`, or as a two-argument helper above the memo — Session
   2's choice.) `EMPTY_FACTS.posRank` stays `null`. No other reader of `f.posRank` / `soFar.posRank` exists
   (pre-check 4).
4. `SeasonLineCell({ ppg, posRank, games = null })`:
   ```jsx
   if (ppg == null && posRank == null && games == null) return <span className="text-dp-muted">—</span>
   const gamesText = games != null ? `${games} G` : null
   return (
     <div className="text-right">
       <div className="font-dp-mono text-[12px] text-dp-text">{ppg != null ? ppg.toFixed(1) : '—'}</div>
       {(posRank || gamesText) && (
         <div className="font-dp-mono text-[10.5px] text-dp-text-5 whitespace-nowrap">
           {posRank && <RankPair {...posRank} />}{posRank && gamesText && ' · '}{gamesText}
         </div>
       )}
     </div>
   )
   ```
   Comment: "a season's per-game line: PPG over the rank pair (total points · per game) and, for the live
   season, games played". Reads `WR12 · WR10/g · 11 G`.
5. `col-posrank` (both tables, off-season): `{f.posRank ? <RankPair {...f.posRank} /> : <span className="text-dp-muted">—</span>}`;
   td classes unchanged.
6. Legend (`:1295–1296`), exact replacements, `N` = `${PPG_RANK_MIN_GAMES}` interpolated, never a literal:
   - in-season: `with position rank by total points; SO FAR adds games played.` →
     `with position rank by total points and, dimmer, by points per game (/g, among players with at least N games — fewer until someone at the position has played N); SO FAR adds games played.`
   - off-season: `POS RANK is last-season total points among all players at the position in this league's scoring.` →
     `POS RANK is last season's position rank among all players at the position in this league's scoring: by total points, then, dimmer, by points per game (/g, at least N games).`

Out of scope here: `rankByPos`/`f.last` (a PPG value), `TwoYearRankCell` (Slice C), ladders, summary sentence,
Defences ahead (team ranks).

## 4. `src/components/week/LineupTable.jsx` (#6)

### 4.1 Segments, text and JSX from one source

Replace `rankLine` (`:67–75`) with:
```js
// The under-name line's segments, oldest first: last-season and this-season position rank, then this-season
// overall rank (QB/RB/WR/TE). A segment without a total rank is omitted, never `—`; a missing per-game rank
// reads `—/g` inside its pair. The visible line and its title are both built from this list.
function rankSegments(r, lastSeason, thisSeason) {
  const k = r.ranks
  const segs = []
  if (k?.lastPos != null && lastSeason != null) segs.push({ key: 'last', label: `${lastSeason} `, prefix: r.position, rank: k.lastPos, rankPpg: k.lastPosPpg ?? null, tail: '' })
  if (k?.thisPos != null && thisSeason != null) segs.push({ key: 'this', label: `${thisSeason} `, prefix: r.position, rank: k.thisPos, rankPpg: k.thisPosPpg ?? null, tail: '' })
  if (k?.thisOverall != null) segs.push({ key: 'overall', label: '', prefix: '#', rank: k.thisOverall, rankPpg: k.thisOverallPpg ?? null, tail: ' overall' })
  return segs
}

function rankLineText(r, lastSeason, thisSeason) {
  const segs = rankSegments(r, lastSeason, thisSeason)
  return segs.length > 0
    ? segs.map(s => `${s.label}${rankPairText(s.prefix, s.rank, s.rankPpg)}${s.tail}`).join(' · ')
    : r.position
}

function RankLine({ r, lastSeason, thisSeason }) {
  const segs = rankSegments(r, lastSeason, thisSeason)
  if (segs.length === 0) return <span>{r.position}</span>
  return (
    <span>
      {segs.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && ' · '}{s.label}
          <RankPair prefix={s.prefix} rank={s.rank} rankPpg={s.rankPpg} title={null} rankClassName="text-dp-text-2" ppgClassName="text-dp-text-4" />
          {s.tail}
        </Fragment>
      ))}
    </span>
  )
}
```
Reads `KC · 2025 WR14 · WR11/g · 2026 WR8 · WR5/g · #31 · #20/g overall`, the three total ranks a step brighter
(`dp-text-2`) than the rest of the grey sub-line (`dp-text-4`, which the `/g` parts keep) — the anchor
hierarchy within the 4.5:1 limit (pre-check 5). The segment separator stays ` · ` (the app's one separator;
the brighter anchors and year labels mark segment starts).

`title={null}` is deliberate: `RankPair`'s default parameter applies only to `undefined`, so `null` renders no
`title` attribute on the pairs. Without it each pair's generic `RANK_PAIR_TITLE` would shadow the sub-line's own
title (`player-cell-sub`, `cells.jsx:123`), the one tooltip that carries the full line when it truncates and
already explains both ranks (§4.2).

### 4.2 Call site (`:286–287`)

```jsx
subTitle={`${r.team ?? 'FA'} · ${rankLineText(r, lastSeason, thisSeason)} — rank by total points, then by points per game (min ${PPG_RANK_MIN_GAMES} games), in this league's scoring; overall is among QB, RB, WR and TE`}
sub={<RankLine r={r} lastSeason={lastSeason} thisSeason={thisSeason} />}
```
`subTruncate` stays (below `md` the line truncates with this title, as today — pre-check 6).

**Team code fix (pre-existing bug, fixed here because this line is rewritten).** Today's title reads
`r.nfl_team`, but lineup rows carry `team` (`weeklyLineup.js:140` `buildRow`; the `PlayerCell` call above passes
`nfl_team: r.team`), so every rostered player's tooltip starts `FA · …` while the visible line starts `KC · …`.
The new title reads `r.team ?? 'FA'`, matching `PlayerCell`'s abbr for a rostered player.

### 4.3 Legend (`:506–510`)

Replace `— all by total points in this league&rsquo;s scoring (the same basis as My Team&rsquo;s position ranks).`
with `— each by total points, then by points per game (/g; at least {PPG_RANK_MIN_GAMES} games, fewer until
someone at the position has played {PPG_RANK_MIN_GAMES}), in this league&rsquo;s scoring (the same basis as My
Team&rsquo;s position ranks).` (T15's `same basis as My Team` and `not.toContain('uses points per game')` both
still hold.)

### 4.4 Imports

`Fragment` from `react` (if not already imported); `RankPair`, `rankPairText` from `../dp/RankPair`;
`PPG_RANK_MIN_GAMES` from `../../utils/weeklyRanks`.

## 5. Small comment edits

- `src/hooks/useWeeklyDecision.js:273–274`: "Season position/overall ranks by total league-scored points and per
  game (weeklyRanks.js's buildLineupRanks), over the same rendered rows. …" (rest unchanged).
- `src/components/week/LineupTable.jsx:19–20` (file header): "the under-name line is the season rank line (by
  total league-scored points, weeklyRanks.js)" → "the under-name line is the season rank line (rank pairs: by
  total league-scored points, then per game — weeklyRanks.js's buildLineupRanks, dp/RankPair.jsx)".
- `src/utils/liveSeasonLog.js:15–17` (`liveSeasonLines` comment): replace "Same arithmetic, same order, as
  weeklyRanks.js's seasonPointsFromWeekly." with "Also /week's this-season rank line (weeklyRanks.js's
  buildLineupRanks)."

## 6. Tests

Red-step rule: apply the named mutation, see the named test fail, revert.

**`src/utils/weeklyRanks.test.js`**
- Import line: drop `rankByTotalPoints, seasonPointsFromCareer, seasonPointsFromWeekly`. Hoist `line`/`wrMap`
  above the first use or define `const pts = o => Object.fromEntries(Object.entries(o).map(([id, p]) => [id, line(p, 3)]))`
  after them (callbacks run after module evaluation, so either works).
- **R-1/R-2/R-3 (ported from the `rankByTotalPoints` describe; rename it `rankDual — total ranks`).** Same
  fixtures and expected values through `rankDual(pts({...}), PM)`; `toEqual({ posRank, overallRank })` becomes
  `toMatchObject`. R-1 ties `30,20,20,10 → 1,2,2,4` — fails if totals are not competition-ranked; red: rank
  totals by sorted index (`i + 1`) instead of `competitionRanks`. R-2 `posRank` within position, `overallRank`
  across QB/RB/WR/TE — fails if overall is taken from the position group; red: set `overallRank: posRanks.total.get(id)`.
  R-3 K/DEF `overallRank` and `overallRankPpg` null, the WR overall 1 — fails if K/DEF enter the overall group;
  red: drop the `OVERALL_POSITIONS.includes(position)` guard. The fourth old case (skips) is already W-7 —
  delete it rather than port.
- **Delete** the `seasonPointsFromCareer` and `seasonPointsFromWeekly` describes and W-5 (their subjects are
  deleted; R-1/R-3 carry W-5's tie and K assertions; §6 liveSeasonLog L-7/L-8 carry the weekly ones).
- **W-6 (rewritten standalone).** Same rows; asserts
  `seasonLinesFromCareer(rows)` `toEqual({ a: { points: 20, games: 10 }, c: { points: 11, games: 5 } })` and
  `null → {}`. Fails if 0-game or non-finite rows are kept. Red: drop `row?.gamesPlayed > 0`.
- **BL-0 (changed) — the three `buildLineupRanks` cases.** Case 1 unchanged. Case 2 `toEqual` gains the PPG
  keys: `{ lastPos: 1, lastPosPpg: 1, thisPos: null, thisPosPpg: null, thisOverall: null, thisOverallPpg: null }`.
  Case 3: `{ lastPos: null, lastPosPpg: null, thisPos: 2, thisPosPpg: 2, thisOverall: 3, thisOverallPpg: 3 }`
  (one week, games 1 each → floor 1 → PPG ranks equal totals). Fails if the result drops a PPG key. Red: omit
  `lastPosPpg` from the built entry.
- **BL-1 (new) PPG ranks diverge and the floor counts weekly games.** `careerStats = { 2025: { a: { gamesPlayed: 10, fantasyPoints: 100 }, b: { gamesPlayed: 4, fantasyPoints: 60 } } }`;
  three weekly maps: `a` `{ gp: 1, rec: 5 }` in weeks 1–3, `b` `{ gp: 1, rec: 9 }` in weeks 1–2 only, `c`
  `{ gp: 1, rec: 4 }` in weeks 1–3; `scoringSettings: { rec: 1 }`, `rendered` a, b, c. Expected:
  a `{ lastPos: 1, lastPosPpg: 2, thisPos: 2, thisPosPpg: 1, thisOverall: 2, thisOverallPpg: 1 }`,
  b `{ lastPos: 2, lastPosPpg: 1, thisPos: 1, thisPosPpg: null, thisOverall: 1, thisOverallPpg: null }`,
  c `{ lastPos: null, lastPosPpg: null, thisPos: 3, thisPosPpg: 2, thisOverall: 3, thisOverallPpg: 2 }`.
  Fails if the PPG fields are copied from the total ranks, or if this season's games are not counted from the
  weekly rows. Red steps (both): (i) `thisPosPpg: t?.posRank ?? null` → a reads 2; (ii) feed `rankDual` lines
  with `games: 1` for every id → b's `thisPosPpg` becomes 1.

**`src/utils/liveSeasonLog.test.js`**
- Import: drop `seasonPointsFromWeekly` from the `./weeklyRanks` import. Delete L-2 (its oracle is deleted);
  rename the describe `liveSeasonLines (L-1, L-7, L-8)` (L-2 is deleted here; L-3 to L-6 are taken in this file:
  `ranks and peers (L-3)`, `computeLiveGameLogValues (L-4)`, `buildLiveGameLogRows (L-5)`, `selectLiveWeekly (L-6)`).
- **L-7 (ported from `seasonPointsFromWeekly` case 1).** The same two maps; asserts
  `liveSeasonLines(maps, { rec: 1 })` `toEqual({ a: { points: 6, games: 2 } })`. Fails if `gp !== 1` or
  `TEAM_*` rows are counted. Red: drop the `gp !== 1` skip (`b` appears).
- **L-8 (ported from case 2).** Same `x`/`y` map; asserts PPR `x.points > y.points` and half-PPR
  `y.points > x.points`. Fails if the scoring settings are ignored. Red: score with `{}` instead of
  `scoringSettings` (all zero, the first comparison fails).

**`src/components/dp/RankPair.test.jsx`**
- RP-1, RP-2 unchanged (defaults render as before).
- **RP-3 (new) text twin.** For `(QB, 3, 1)`, `(QB, 3, null)`, `(#, 5, 2)`: the rendered pair's `textContent`
  equals `rankPairText(...)`. Fails if the tooltip text drifts from the visible pair. Red: make `rankPairText`
  emit the per-game part without its prefix.
- **RP-4 (new) tone props.** With `rankClassName="text-dp-text-2" ppgClassName="text-dp-text-4"` the first
  child span has class `text-dp-text-2` and the second `text-dp-text-4` (not `text-dp-muted-2`); with neither,
  the first has no `class` attribute and the second `text-dp-muted-2`. Fails if a prop is ignored. Red:
  hard-code the second span's class back to `text-dp-muted-2`.

**`src/components/portfolio/Portfolio.test.jsx`**
- **"3. real columns" (changed).** `col-posrank` `toBe('WR1 · WR1/g')` for row 3 and `'WR2 · WR2/g'` for row 4
  (fixture: every 2025 row has 10 games, so the bases agree). Fails if the off-season POS RANK drops the
  per-game rank. Red: render `` `${f.posRank.prefix}${f.posRank.rank}` `` in `col-posrank`.
- **P5b-1 (changed) diverging bases.** Keeps its `w2 gamesPlayed: 5` override (w1 160/10 = 16/g, w2 140/5 =
  28/g): row 3 `col-posrank` `toBe('WR1 · WR2/g')`, row 4 `toBe('WR2 · WR1/g')`; the `'last-season total
  points'` assertion becomes `toContain('by total points, then, dimmer, by points per game')`. Fails if My Team's
  per-game rank is derived from total points. Red: `rankPpg: r.posRank` in `pair`.
- **P5b-2 (changed).** `col-last` row 3 `toContain('WR1 · WR1/g')`; `col-sofar` row 3
  `toContain('WR2 · WR2/g · 3 G')` (LIVE w1 54/3, w2 60/3); row 4 `toContain('WR1 · WR1/g')`. Other assertions
  unchanged. Fails if the season cells lose the pair or its order with games. Red: render `posRank.rank`
  alone in `SeasonLineCell`.
- **P5b-F (new) floor and no-wrap on My Team.** `inSeasonProps` with LIVE `w2: { gamesPlayed: 2, fantasyPoints: 60, scoringBasis: 'league' }`
  (w1 3 games 54): row 4 `col-sofar` contains `WR1 · —/g · 2 G`, row 3 contains `WR2 · WR1/g · 3 G`; the
  sub-line `div` holding the pair has class `whitespace-nowrap`. Fails if the so-far PPG rank ignores the
  3-game floor, or the pair can wrap inside the cell. Red: `rankDual(seasonLinesFromCareer(liveRows), playerMap, { minGames: 1 })`
  in `liveRanks` (row 4 then reads `WR1/g`).
- **Off-season legend (`:740–742`, changed).** Expected string's first sentence becomes
  `` `POS RANK is last season's position rank among all players at the position in this league's scoring: by total points, then, dimmer, by points per game (/g, at least ${PPG_RANK_MIN_GAMES} games).` ``
  (constant imported from `../../utils/weeklyRanks`), the rest unchanged. Fails if the legend still describes a
  total-only rank. Red: restore the old sentence in `Portfolio.jsx`.
- T10 (`QB2`) stays green unchanged (q1 60/3, q3 45/3 → `QB2 · QB2/g`); no edit.

**`src/components/week/LineupTable.test.jsx`**
- **LT-1 (changed, "all three segments").** Ranks `{ lastPos: 14, lastPosPpg: 11, thisPos: 8, thisPosPpg: 5, thisOverall: 31, thisOverallPpg: 20 }`:
  `lineOf(...).textContent` `toBe('2025 WR14 · WR11/g · 2026 WR8 · WR5/g · #31 · #20/g overall')` and three
  `[data-testid="rank-pair"]` inside it. Fails if a segment loses its per-game rank or the overall pair its
  `#`/`overall`. Red: drop the `rankPpg` prop in `RankLine` (every pair reads `—/g`).
- **LT-2 (changed, "omits a missing segment").** `{ lastPos: 14, lastPosPpg: null, thisPos: null, thisOverall: null }`
  → `toBe('2025 WR14 · —/g')`; `ranks: null` → `'WR'` (unchanged). Fails if a null per-game rank hides the
  segment. Red: push the `last` segment only when `k.lastPosPpg != null`.
- **P1-T1 (changed).** Title `toContain('2025 WR12 · —/g')`, `toContain('rank by total points, then by points per game')`
  and `` toContain(`min ${PPG_RANK_MIN_GAMES} games`) ``; `truncate` assertions unchanged. Fails if the title
  omits the per-game ranks or states the floor as a literal. Red: replace the interpolation with a literal `3`
  **and** temporarily set `PPG_RANK_MIN_GAMES = 4` (it must go red; with the interpolation it stays green);
  restore both.
- **T11 (changed).** Its ranks gain `lastPosPpg: 11, thisPosPpg: 5, thisOverallPpg: 20`;
  `sub.textContent` `toContain('2025 WR14 · WR11/g · 2026 WR8 · WR5/g · #31 · #20/g overall')`; the title
  assertion becomes `toContain('rank by total points, then by points per game')`. Red: as LT-1.
- **LT-3 (new) title matches the line, and nothing inside shadows it.** For LT-1's ranks (the `row()` fixture's
  `team: 'KC'`): the sub-line's `title` starts with
  `` `${sub.querySelector('[data-testid="player-cell-team"]').textContent} · ${lineOf(container).textContent}` ``
  (i.e. `KC · 2025 WR14 · …`), and `lineOf(container).querySelectorAll('[title]').length` is `0`. Fails if the
  tooltip's team code or rank text drifts from the visible line, or if a pair carries its own title that hides
  the full-line tooltip on hover. Red steps (all three): (i) join `rankLineText`'s segments with `' | '`;
  (ii) drop `title={null}` from `RankLine`'s `RankPair` (each pair then carries `RANK_PAIR_TITLE`); (iii) read
  `r.nfl_team` in `subTitle` again (the title then starts `FA · `).
- **T4c (new) rank pairs clear 4.5:1 over the watermark.** Render a row with LT-1's ranks and team `KC`; for each
  `rank-pair` in the sub-line, both child spans pass `minWatermarkContrast(span) >= 4.5`. Fails if the `/g` part
  is dimmer than the sub-line (RankPair's default `dp-muted-2` is 1.92). Red: omit `ppgClassName` in `RankLine`.
- T9 (season order) and T15 (legend) stay green unchanged.

Contract tests: `factorsSchema`/`statKeysContract` untouched (no `seasonProjection.js` or stat-key change).

## 7. Docs (same change)

- `docs/nav/utils.md` `weeklyRanks.js` row (`:83`): drop `rankByTotalPoints`, `seasonPointsFromCareer`,
  `seasonPointsFromWeekly`; `buildLineupRanks` → `{[id]: {lastPos, lastPosPpg, thisPos, thisPosPpg, thisOverall, thisOverallPpg}}`
  via `rankDual` over `seasonLinesFromCareer(careerStats[dataSeason])` and `liveSeasonLog.js`'s
  `liveSeasonLines`; My Team calls `rankDual` + `seasonLinesFromCareer` directly. `liveSeasonLog.js` row (`:48`):
  `liveSeasonLines` also feeds `weeklyRanks.js`'s `buildLineupRanks`; drop "same arithmetic as
  `seasonPointsFromWeekly`".
- `docs/nav/components.md`: `dp/RankPair.jsx` row (`:46`) — `rankClassName`/`ppgClassName` (defaults: none /
  `text-dp-muted-2`), `rankPairText`, consumers now also `portfolio/Portfolio.jsx` and `week/LineupTable.jsx`.
  `week/LineupTable.jsx` row (`:11`) — the under-name line is
  `{lastSeason} {POS}{rank} · {POS}{rankPpg}/g · {thisSeason} … · #{overall} · #{overallPpg}/g overall`, rank
  pairs with the total rank in `dp-text-2`; a missing per-game rank reads `—/g`. `portfolio/Portfolio.jsx` row
  (`:14`) — `POS RANK` and the season cells' sub-line show the `RankPair` (total · per game) from `rankDual`
  over `careerStats[dataSeason]` / the live rows.
- `docs/ui.md:86–87` (POS RANK: total points with the per-game rank beside it, `rankDual`, 3-game floor),
  `:99` (`PPG over rank` → `PPG over the rank pair`), `:570` (rank-line example →
  `2025 QB34 · QB30/g · 2026 QB20 · QB18/g`).
- `docs/signal-registry.md:126` — "Season position/overall rank by total league-scored points, with the
  per-game rank beside it (3-game floor)"; display: `/week` lineup sub-line and My Team's POS RANK / season
  cells.
- `docs/signal-registry.md:120`, trailing clause only: "(its `POS RANK` is by total points, `weeklyRanks.js`)"
  → "(its `POS RANK` is by total points with the per-game rank beside it, `weeklyRanks.js`'s `rankDual`)".
  The rest of row 120 is unchanged.
- Then `grep -rn -e rankByTotalPoints -e seasonPointsFromCareer -e seasonPointsFromWeekly src docs` must return
  nothing, and `grep -rn -e "by total league-scored points" -e "by total points" src docs` is read hit by hit:
  every hit that describes the My Team or This Week rank must also mention the per-game rank.
- CLAUDE.md: no change.

## 8. Smoke (Session 2) and what to check in the app (in season — week 12 of 2026)

Session 2, in the preview at 1440 and 1280 wide, and at the `mobile` preset:
1. **This Week:** measure the frozen PLAYER column (`col-player`) width on the widest starter row at HEAD
   `ee30371` and after; report both. At 1440/1280 the sub-line's `scrollWidth <= clientWidth` (no truncation).
   On mobile it truncates with the full line in its title (unchanged behaviour). No console errors.
2. **My Team:** `col-sofar` and `col-last` on one line each, no wrap, no overlap with neighbours; report the two
   columns' widths before/after at 1440.
3. Stop and report, rather than restyle, if anything overlaps, wraps or a column more than doubles.

For Anton:
1. **This Week** → each starter's grey line under the name reads like
   `KC · 2025 QB4 · QB2/g · 2026 QB2 · QB1/g · #5 · #2/g overall`; the three total ranks are slightly brighter.
   Hover anywhere on the line, the ranks included: one tooltip shows the whole line and explains both ranks.
2. A backup or a player with 1–2 games this season shows `—/g` in his 2026 pair.
3. **My Team** → the `2025` and `2026 so far` cells read `18.4` over `QB3 · QB1/g` and `QB2 · QB4/g · 11 G`,
   the `/g` part dimmer; nothing wraps.
4. Judge whether the wider PLAYER column on This Week is acceptable (Session 2 reports the before/after width).

## 9. Open items to surface at sign-off

- **Phone truncation on This Week** — below `md` the longer line truncates (tooltip keeps it), as today's
  shorter line already did; the brief's "never truncate" holds at tablet/desktop widths only.
- **Faint `/g` on My Team and the pop-up** — `dp-muted-2` is 2.7:1 on the card (below the 4.5:1 This Week must
  meet). If Anton finds it too faint, one default change in `RankPair` (`dp-muted`, 5.2:1) fixes both.
- `usePlayerProfile`'s unconsumed `historicalRanks` (Slice A's open item) — still untouched.

## 10. Later slice (outline only — plan after B is verified)

- **C — Market + 2-yr rank (#7, #8).** `twoYearBaseline.js`'s `buildTwoYearRanks` adds a two-season
  total-points rank beside the PPG one (3-game floor on the PPG rank); `TwoYearRank.jsx` renders the pair (also
  My Team's `2-YR RANK`); `factViews.js` Prev rk moves to `rankDual` with the total rank beside it,
  `rankWindow` unchanged for other metrics; rewrite the divergence comment (`factViews.js:56–60`) and
  `docs/ui.md:230`. Depends on A (done) only; B's `RankPair` tone props are available if Market's cells need them.

## Plan review

Round 1 (plan-reviewer, light, 2026-11-26 — run at the wrong depth; the CR-18 edit makes it `full`): 3 flags. All three were folded in above at Anton's direction ("Fix
all three"), and no re-review was run.
1. The L-4/L-5 ids were already taken in `liveSeasonLog.test.js`, so the ported tests were renamed
   (to L-6/L-7, which round 2 found also collided — now L-7/L-8).
2. Each pair's own title shadowed the This Week full-line tooltip. `RankLine` now passes `title={null}`, and
   LT-3 asserts there is no `[title]` inside the line, with a second red step.
3. The CR-18 site (`docs/signal-registry.md`) was not named. The cross-repo paragraph and sign-off line now
   name it, and no data-side edit is needed.

Round 2 (plan-reviewer, full, opus/high, 2026-11-26): 3 flags. All three were folded in above at Anton's
direction ("Fix all three"), and no re-review was run.
1. L-6 was also taken (`selectLiveWeekly (L-6)`), so the ported tests are now L-7/L-8.
2. The full-line tooltip read `r.nfl_team`, which lineup rows don't carry, so it showed `FA`. §4.2 now reads
   `r.team`, and LT-3 checks that the title starts with the visible team code, with a third red step.
3. Two total-only descriptions were outside the lists. The `LineupTable.jsx` header was added to §5,
   `docs/signal-registry.md:120`'s trailing clause was added to §7, and §7 gains a wording grep.
Approved by Anton 2026-11-26 — Session 2 (sonnet) may implement.

CR-18 side check (round 2): the reviewer read `../sleeper-dashboard-data/data-catalog.md`. It links to the
signal registry rather than mirroring it, so no data-side edit is needed.

## Session 2 questions — decisions (Session 1, 2026-11-26)

1. **`rankPairText` trips `react-refresh/only-export-components`** (a non-component function exported from
   `dp/RankPair.jsx`, so lint reports 1 error). Ruling: **move it, don't suppress it.** The repo has no
   `eslint-disable … react-refresh` anywhere. Its precedent is a plain `.js` module beside the component
   (`dp/lens.js` for `cells.jsx`'s `LensSwitch`, `dp/allowsTone.js`, `dp/frozen.js`). This amends §2, §4.4, §6 and §7:
   - New `src/components/dp/rankPairText.js` exports `ppgRankLabel` and `rankPairText`, with the bodies and
     comments from §2. It has no React import.
   - `dp/RankPair.jsx` imports `ppgRankLabel` from `./rankPairText` and keeps exporting only `RankPair` and
     `RANK_PAIR_TITLE`. The constant export already passes the rule today.
   - `week/LineupTable.jsx` imports `rankPairText` from `../dp/rankPairText`, and `RankPair` stays from
     `../dp/RankPair`.
   - RP-3 imports `rankPairText` from `./rankPairText`. Its assertion and red step are unchanged (make
     `rankPairText` emit the per-game part without its prefix). It still compares against the rendered
     `RankPair`, so it still catches drift between the two.
   - Docs: `docs/nav/components.md` gets a `dp/rankPairText.js` row ("`ppgRankLabel`, `rankPairText` — the rank
     pair as plain text for title attributes; shared by `dp/RankPair.jsx` and `week/LineupTable.jsx`. Pure, no
     React"). The `dp/RankPair.jsx` row drops `rankPairText` and says it renders through `ppgRankLabel`.
   - This is not a copied definition: there is one definition, imported by both.

## Fix pass 1 (Session 1, 2026-11-26 — triage of implementation-reviewer round 1 on `c2da0c8`)

There was one flag (`[untested]`): the per-game clause in two legends, and the `PPG_RANK_MIN_GAMES` interpolated
into each, are asserted by no test. Ruling: fix it with two assertions. Touch only the two test files named here
and nothing else in them, plus the one source line item 0 names.

0. **Amendment, made after the fix-applier stopped (Session 1, 2026-11-26).** Item 2's assertion exposed a real
   copy bug. In `src/components/week/LineupTable.jsx:535–536`, `at least {PPG_RANK_MIN_GAMES}` ends one line and
   `games, fewer …` starts the next. JSX drops a newline between an expression and text, so the legend renders
   `at least 3games`.
   - Fix: append `{' '}` directly after that `{PPG_RANK_MIN_GAMES}` (`… at least {PPG_RANK_MIN_GAMES}{' '}`).
     Change no other character of the legend.
   - Item 2's assertion then passes.
   - Item 2 gains red step (iii): remove the `{' '}`. The test must go red (`3games`). Then restore it.

1. **My Team in-season legend** (`src/components/portfolio/Portfolio.jsx:1300`).
   - In `Portfolio.test.jsx`, inside the existing test `T4 the legend names the live season and the unsplit
     caption follows the loaded gamelogs`, add after its `legend` declaration:
     ```js
     expect(legend).toContain(`with position rank by total points and, dimmer, by points per game (/g, among players with at least ${PPG_RANK_MIN_GAMES} games — fewer until someone at the position has played ${PPG_RANK_MIN_GAMES}); SO FAR adds games played.`)
     ```
     `PPG_RANK_MIN_GAMES` is already imported at `:8`.
   - It fails if the in-season legend loses the per-game clause, or states the floor as a literal.
   - Red steps (both):
     - (i) Restore the old in-season clause `with position rank by total points; SO FAR adds games played.`
       in `Portfolio.jsx`.
     - (ii) Replace both `${PPG_RANK_MIN_GAMES}` interpolations in that string with a literal `3` **and**
       temporarily set `PPG_RANK_MIN_GAMES = 4` in `weeklyRanks.js`. It must go red; with the interpolations
       kept and the constant at 4 it stays green.
   - Restore everything.
2. **This Week legend** (`src/components/week/LineupTable.jsx:535–537`).
   - In `LineupTable.test.jsx`'s `T15` test, add:
     ```js
     expect(text).toContain(`each by total points, then by points per game (/g; at least ${PPG_RANK_MIN_GAMES} games, fewer until someone at the position has played ${PPG_RANK_MIN_GAMES}), in this league’s scoring`)
     ```
     `text` is already whitespace-normalised. `&rsquo;` renders as `’` (U+2019), so the literal must use
     that character. `PPG_RANK_MIN_GAMES` is already imported at `:11`.
   - It fails if the legend loses the per-game clause, or states the floor as a literal.
   - Red steps (both):
     - (i) Restore the old clause `— all by total points in this league&rsquo;s scoring`.
     - (ii) Use literal `3`s with the constant temporarily at 4, as in item 1.
     - (iii) Remove item 0's `{' '}` (renders `3games`).
   - Restore everything.

Done-definition:
- `npm test`, `npm run lint` and `npm run build` are all clean.
- Commit on `main`, unpushed, with the subject `Fix pass 1: dual ranks slice B legend tests`. Stage by path.
- Hand back the SHA and each red step seen.

## Verification

Session 1, 2026-11-26. Diff `ee30371..b5bbe52`, two commits:
- `c2da0c8 Dual position ranks on My Team and This Week` (Session 2, sonnet);
- `b5bbe52 Fix pass 1: dual ranks slice B legend tests` (fix-applier).

**Plan review.** Round 1 (light) and round 2 (full, opus/high, required by the CR-18 site) each raised 3 flags.
All six were folded in before approval at Anton's direction (see *Plan review*).

**Mid-implementation.** Session 2 stopped on one item: `rankPairText` tripped `react-refresh/only-export-components`.
Session 1 ruled that it moves to `dp/rankPairText.js` (see *Session 2 questions — decisions*).

**implementation-reviewer (full, opus/high) on `ee30371..c2da0c8`.** One flag, `[untested]`: the in-season My
Team legend and the This Week legend clauses had no test. Fixed by Fix pass 1. Its new This Week assertion exposed a
real copy bug: the legend rendered `at least 3games`, because JSX dropped the newline after the expression. Item 0
added `{' '}`, and the applier stopped rather than bending the test. The reviewer also confirmed:
- fidelity and scope;
- view-only, App.jsx state, PROVISIONAL and docs-phrasing invariants;
- CR-18 (it read the data side, `data-catalog.md`, which links rather than mirrors);
- every specified assertion is made;
- the docs are complete and the closing greps are empty;
- nothing is left behind by the three deleted helpers.

**Fix-pass re-review (light) on `c2da0c8..b5bbe52`.** "No blocking issues found." Round-1 flag closed.

**Checks re-run by Session 1 at `b5bbe52`:**
- `npm test`: 198 files, 3767 tests passed. A stderr stack trace comes from `src/api/playerIds.test.js`'s
  deliberate `idb down` case, a file this slice does not touch.
- `npm run lint`: 0 problems.
- `npm run build`: clean apart from the >500 kB chunk notice, which also prints at `ee30371`.
- The `rankByTotalPoints` / `seasonPointsFromCareer` / `seasonPointsFromWeekly` grep over `src` and `docs` is
  empty.
- PROVISIONAL count: 49 before, 49 after.

**Red steps:** Session 2's hand-back covers each new or changed test on its named mutation, and each was restored:
- R-1, R-2, R-3;
- W-6;
- BL-0 and BL-1 (i, ii);
- L-7, L-8;
- RP-3, RP-4;
- 3. real columns, P5b-1, P5b-2, P5b-F;
- the off-season legend;
- LT-1, LT-2, P1-T1, T11;
- LT-3 (i, ii, iii);
- T4c.

The fix-applier's covers T4 (i, ii) and T15 (i, ii, iii). The one substitute is P5b-2's: it renders
`posRank.rank` with no prefix. The reviewer confirmed it still drops the pair, which is the named defect.

**Smoke (Session 2, preview config, week 12; run before the import-only `rankPairText` move).**

Widths, before → after:

| Surface | 1440 wide | 1280 wide |
|---|---|---|
| This Week PLAYER column | 330 → 490px | 324 → 490px |
| My Team last-season cells (starters / bench) | 98 / 77 → 172 / 147px | — |
| My Team so-far cells (starters / bench) | 191 / 142 → 246 / 196px | — |

- No wrapping or overlap, and nothing more than doubled.
- This Week does not truncate at desktop widths.
- On mobile it truncates, and the tooltip carries the full line.
- The tooltip team code now shows the team; it read `FA` before.
- No console errors.
- The off-season POS RANK was not visible live (in season); unit tests cover it.
- The one-space legend fix (b5bbe52) was not smoked live; T15 pins the rendered text.

**Other notes:**
- **Deviations:** the `rankPairText` ruling; Fix pass item 0, a source fix not in the original plan; Session 2's
  three cosmetic deviations (test names carrying their ids, shared test constants, comment wording).
- **Cross-repo:** CR-18 touched (`docs/signal-registry.md` rows 120/126 reworded, computed view-layer rows); no
  data-side edit; index unchanged.
- **Backlog lines added:** none.
