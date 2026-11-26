# Dual position ranks — Slice A: shared helper, rank-pair component, pop-up (#1–#4)

Review depth: full — new shared rank logic every later slice consumes; removes a `playerRows` pipeline step
(`App.jsx`'s `positionRank`); changes the basis/floor of two existing PPG ranks (off-season rail, best/worst line)

Decided by Anton 2026-11-26 (handoff brief "Dual position ranks (total points + PPG) everywhere"): format
`QB3 · QB1/g` (total-points rank first, PPG rank second with a `/g` suffix); a 3-game minimum for every PPG
rank; sleek presentation. App repo only. Display-only.

Cross-repo: `src/App.jsx` is an App-side file of **CR-15** (`computeTeamContext`, `computeEmpiricalAgeCurves`)
and **CR-22** (`LS_USER`, `LS_LEAGUE`). This slice touches none of those symbols (only `positionRank`, §3), and
CR-22's data side (`scripts/capture-snapshot.mjs` `main`/`readSnapshotRecord`, which reads the IndexedDB snapshot
and a console marker only) is unaffected. No contract changes; no index edit; no backlog line. Sign-off line:
"Touches cross-repo index: no — App.jsx is a CR-15/CR-22 file, listed symbols untouched".

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a backgrounded `npm run dev`, and
stops it when done.

**Copied definitions created by this slice:**
1. `seasonLinesFromCareer` (§1.2) repeats `seasonPointsFromCareer`'s row filter (`gamesPlayed > 0` and finite
   `fantasyPoints`). Equality test: W-6.
2. `rankDual`'s total-points ranks (§1.1) repeat `rankByTotalPoints`'s grouping (position groups, overall over
   `OVERALL_POSITIONS`, `competitionRanks`). Equality test: W-5. (`rankByTotalPoints` keeps its callers until
   Slices B/C; see §8.)

The 3-game minimum is **not** copied: both tooltip strings that state it (§5.1 `RANK_PAIR_TITLE`, §5.2.5 the
ceiling-floor title) interpolate `PPG_RANK_MIN_GAMES` from `weeklyRanks.js`; RP-2 pins it.

`buildRankPeers` (§1.3) is a **move** of `liveSeasonLog.js`'s `buildLivePeers`, not a copy — the original is
deleted in the same change.

---

## 0. Pre-checks done in planning (Session 1, 2026-11-26, HEAD `032e84b`)

1. **Nothing in scoring/projection reads `playerRows[].positionRank`.** `grep -rn positionRank src` (non-test):
   `App.jsx:547` (initialised `0`), `App.jsx:578–586` (sort by `currentSeasonPPG`, assign `i + 1`),
   `hooks/usePlayerProfile.js:124` (`positionPeers` sort), `dp/PlayerDetailModal.jsx:649` (rail render). Every
   other hit is KTC history's own unrelated `positionRank` (`ktcHistory.js:207/228`, its series entries) or test
   fixtures. `docs/architecture.md:134` already states "no downstream pipeline step depends on it". So the
   field's only consumer is the pop-up rail, and the brief's "leave it, compute separately" fallback is not
   needed: this slice deletes the field (§3) and builds the rail from the shared helper.
2. **`usePlayerProfile`'s `positionPeers` has one consumer**: `PlayerDetailModal.jsx:82` (destructured),
   `:133` (off-season rail). No test references `positionPeers`. It is deleted (§3).
3. **`usePlayerProfile`'s `historicalRanks`** (`:75–83`, `rankPositionSeason`, PPG, no floor) is returned but
   destructured by no component (`grep -rn historicalRanks src`). Out of scope — left untouched; noted in §7.
4. **`seasonRanks.js` consumers.** `buildSeasonPositionRanks`/`computeCeilingFloor`: only
   `PlayerDetailModal.jsx:106–107`. `rankPositionSeason`: `buildSeasonPositionRanks` (changed here),
   `usePlayerProfile.js:80` (dead `historicalRanks`), `portfolio/Portfolio.jsx:422` (`rankByPos`, My Team's
   last-season PPG lookup — Slice B). So `rankPositionSeason` stays; only `buildSeasonPositionRanks` changes.
   `refByPosRank`/`delta` are computed but not rendered (`docs/ui.md:372`, `docs/signal-registry.md:120`).
5. **View-only guards already cover the new code.** `src/__tests__/weeklyDecisionViewOnly.test.js:40` forbids
   every `PIPELINE` module from importing `weeklyRanks`; `gameLogsViewOnly.test.js:49` does the same for
   `liveSeasonLog`. `rankDual` lives in `weeklyRanks.js`, so it inherits the guard. `seasonRanks.js` is
   imported only by view code (pre-check 4).
6. **Today's four pop-up rank sites** (all `dp/PlayerDetailModal.jsx`):
   - `:121–125` `liveLines`/`liveRanks` (`liveSeasonRanks` → `rankByTotalPoints`); `:126–130` `soFar`
     (`posRank` only); `:131–136` `railPeers` (`buildLivePeers` in-season, `positionPeers` otherwise).
   - `:408–418` the `sofar` tile note: a joined string `` `${pos}${posRank} · ${games} G` ``.
   - `:443–449` the `ceiling-floor` line: `Best {pos}{rank} ({season}) · worst {pos}{rank} ({season})`.
   - `:629–658` the rail: title `RANK · {liveSeason} SO FAR` / `RANK · {mostRecentSeason}`, an in-season
     "by total points" sub-caption, rows `<div class="flex items-center gap-2.5 px-2 py-1.5 rounded-md …">` with
     a `w-[30px]` muted mono rank, a truncating name, and a mono PPG (`p.ppg` in-season,
     `p.currentSeasonPPG` otherwise).
7. **Tile note style** (`PlayerDetailModal.jsx:551`): `text-[11px] text-dp-muted mt-1`, not mono. Tokens used
   below exist in `src/index.css` `@theme`: `dp-muted` `#858b95`, `dp-muted-2` `#585d66`.

---

## 1. `src/utils/weeklyRanks.js` — the shared helper

Update the header comment: the module now also owns the **dual rank** (total points + PPG) every production-rank
surface consumes; keep the existing paragraphs, adjust the "unlike `seasonRanks.js`" sentence to say
`seasonRanks.js`'s `buildSeasonPositionRanks` now ranks through `rankDual` while `rankPositionSeason` remains a
PPG-only lookup.

### 1.1 `rankDual`

```js
export const PPG_RANK_MIN_GAMES = 3

// linesById: { [id]: { points, games } } → Map<id, { posRank, posRankPpg, overallRank, overallRankPpg }>
export function rankDual(linesById, playerMap, { minGames = PPG_RANK_MIN_GAMES } = {})
```

1. For each `[id, line]` of `linesById ?? {}`: `position = playerMap?.[id]?.position`. **Skip** when `!position`,
   `!Number.isFinite(line?.points)`, or `!(line?.games > 0)`.
2. Group `{ id, points, games }` by position; also push to an `overall` group when
   `OVERALL_POSITIONS.includes(position)`.
3. For each group (each position group, and `overall` separately):
   - `floor = Math.min(minGames, max games in the group)` — computed **per group**.
   - Total ranks: `competitionRanks(group.map(e => [e.id, e.points]))`.
   - PPG ranks: `competitionRanks(group.filter(e => e.games >= floor).map(e => [e.id, e.points / e.games]))`.
4. Result per id: `posRank` (total, position group), `posRankPpg` (PPG, position group, `null` when under the
   floor), `overallRank` / `overallRankPpg` (from the `overall` group; both `null` outside
   `OVERALL_POSITIONS`; `overallRankPpg` also `null` under the overall group's floor).

`competitionRanks` stays module-private and unchanged. `rankByTotalPoints`, `seasonPointsFromCareer`,
`seasonPointsFromWeekly`, `buildLineupRanks` stay unchanged (Slice B's callers).

### 1.2 `seasonLinesFromCareer`

```js
// careerStats[season] rows -> { [id]: { points, games } } for rows with gamesPlayed > 0 and finite points.
// Same row filter as seasonPointsFromCareer (equality test W-6).
export function seasonLinesFromCareer(seasonRows)
```
`points = row.fantasyPoints`, `games = row.gamesPlayed`.

### 1.3 `buildRankPeers` (moved from `liveSeasonLog.js`'s `buildLivePeers`)

Same signature and ordering as `buildLivePeers` today (`liveSeasonLog.js:40–59`):
`buildRankPeers({ lines, ranks, playersMap, position, playerId, limit = 5 })`, candidates = ids in `lines` at
`position` with a non-null `ranks.get(id)?.posRank`, sorted posRank → higher points → id; top `limit`, then a
`null` separator and the player when ranked but outside. Peer shape gains one field:
`{ player_id, positionRank, positionRankPpg, full_name, ppg }`, where
`positionRankPpg = ranks.get(id).posRankPpg ?? null`. `ranks` is a `rankDual` result. Update the comment to
say it serves both the in-season and the off-season rail.

## 2. `src/utils/liveSeasonLog.js`

- Delete `liveSeasonRanks` and `buildLivePeers`, and the `rankByTotalPoints` import. Callers use
  `rankDual(lines, playerMap)` directly (lines are already `{ points, games }`) and `buildRankPeers`.
- Header/`liveSeasonLines` comments: no other change.

## 3. Remove the dead PPG rank (`App.jsx`, `usePlayerProfile.js`)

- `src/App.jsx`: delete `positionRank: 0,` (`:547`) and the block `// Rank within position by currentSeasonPPG`
  through the closing `}` of its second loop (`:578–586`). Nothing else in the memo changes; `filteredRows`'
  order is unaffected (the block sorted per-position copies).
- `src/hooks/usePlayerProfile.js`: delete the `positionPeers` memo (`:119–129`, including its section comment)
  and its `positionPeers,` return entry (and the `// Peers` comment above it).
- Test fixtures that still carry `positionRank` on mock rows may keep it (harmless extra field) — do not churn
  them.

## 4. `src/utils/seasonRanks.js` — best/worst by total points, PPG rank beside it

- `rankPositionSeason`: unchanged.
- `buildSeasonPositionRanks(careerStats, playersMap)`: per season,
  `const ranks = rankDual(seasonLinesFromCareer(seasonData), playersMap)`; for each `[id, r]` push
  `{ season, rank: r.posRank, rankPpg: r.posRankPpg, points: seasonData[id].fantasyPoints }` to
  `ranksByPlayer`, and accumulate `refByPosRank[pos][r.posRank]` from the same `points` (`pos` =
  `playersMap[id].position`). Update both header comments: `rank` is the **total-points** position rank
  (competition ranking, ties share), `rankPpg` the PPG rank under `rankDual`'s floor (`null` below it);
  `refByPosRank` is keyed by total-points rank.
- `computeCeilingFloor`: selection unchanged (min/max `rank`, tie rules as today — now on total rank); `decorate`
  adds `rankPpg: s.rankPpg ?? null`. Update its return-shape comment.
- `seasonRanks.js` imports `rankDual`, `seasonLinesFromCareer` from `./weeklyRanks`.

## 5. Display

### 5.1 New `src/components/dp/RankPair.jsx`

```jsx
import { PPG_RANK_MIN_GAMES } from '../../utils/weeklyRanks'

const N = PPG_RANK_MIN_GAMES
export const RANK_PAIR_TITLE =
  `Rank by total points · rank by points per game (min ${N} games; lower until someone at the position has played ${N})`

// The inline total · per-game rank pair. Sets no font or size — it inherits its host's, so every tight cell
// renders it identically within its own context. The /g part is secondary (dp-muted-2); the total rank keeps
// the host colour and stays the visual anchor.
export function RankPair({ prefix = '', rank, rankPpg, title = RANK_PAIR_TITLE }) {
  if (rank == null) return null
  return (
    <span data-testid="rank-pair" title={title} className="whitespace-nowrap">
      <span>{prefix}{rank}</span>
      <span className="text-dp-muted-2"> · {rankPpg != null ? `${prefix}${rankPpg}` : '—'}/g</span>
    </span>
  )
}
```
`prefix` is the position (`QB`) or `#` (Slice B's overall: `#5 · #2/g`). View-only; no hooks.

### 5.2 `PlayerDetailModal.jsx`

1. **Ranks.** Replace the `liveRanks` memo body with `liveLines ? rankDual(liveLines, playersMap) : null`.
   Add, next to it:
   ```js
   const pastLines = useMemo(
     () => (mostRecentSeason != null ? seasonLinesFromCareer(careerStats?.[mostRecentSeason]) : null),
     [careerStats, mostRecentSeason])
   const pastRanks = useMemo(() => (pastLines ? rankDual(pastLines, playersMap) : null), [pastLines, playersMap])
   ```
   (`mostRecentSeason` is the hook's, already in scope at `:83`; declare these after the hook call.)
2. **`soFar`** gains `posRankPpg: liveRanks?.get(playerId)?.posRankPpg ?? null`.
3. **`railPeers`**: in-season unchanged except `buildLivePeers` → `buildRankPeers`; otherwise
   `pastLines ? buildRankPeers({ lines: pastLines, ranks: pastRanks, playersMap, position: player.position, playerId }) : []`.
   Update the comment above it: both rails are the top five by total points (+ this player), from the live
   Sleeper rows in season and from `careerStats[mostRecentSeason]` otherwise. Remove `positionPeers` from the
   hook destructure.
4. **`sofar` tile note** (`:414–416`) becomes JSX:
   `soFar ? <>{soFar.posRank != null && <><RankPair prefix={player.position} rank={soFar.posRank} rankPpg={soFar.posRankPpg} />{' · '}</>}{soFar.games} G</> : …`
   (the two non-`soFar` strings unchanged).
5. **`ceiling-floor` line** (`:443–449`) becomes two aligned rows inside the same `data-testid="ceiling-floor"`
   wrapper, `className="mt-1 flex flex-col gap-0.5"`, title
   `` `Best and worst single-season finish by total points among all ${player.position}s who played that season, with the per-game rank beside it (min ${PPG_RANK_MIN_GAMES} games)` ``
   (`PPG_RANK_MIN_GAMES` imported from `../../utils/weeklyRanks`, never a literal `3`):
   ```jsx
   <div data-testid="ceiling-floor-best" className="flex items-baseline gap-1.5">
     <span className="w-[34px]">Best</span>
     <RankPair prefix={player.position} rank={ceilingFloor.ceiling.rank} rankPpg={ceilingFloor.ceiling.rankPpg} />
     <span className="text-dp-muted-2">{ceilingFloor.ceiling.season}</span>
   </div>
   ```
   and the same with `ceiling-floor-worst` / `Worst` / `ceilingFloor.floor`.
6. **Rail** (`:629–658`):
   - Title text unchanged. Delete the in-season `by total points` sub-caption line.
   - Insert, as the first child of the `flex flex-col gap-1.5` list, **only when `railPeers.length > 0`** (the
     off-season list container renders even when `railPeers` is `[]` — no `mostRecentSeason`, no position, or
     empty `pastLines` — and must not show headers over no rows), a header row with **no** `rounded-md` class:
     ```jsx
     <div data-testid="rank-rail-head" className="flex items-center gap-2.5 px-2 font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted-2">
       <span className="w-[28px]" title="Rank by total points">TOT</span>
       <span className="w-[28px]" title={RANK_PAIR_TITLE}>/G</span>
       <span className="flex-1" />
       <span title="Points per game">PPG</span>
     </div>
     ```
   - Each player row keeps its classes; its rank span becomes two spans:
     `<span data-testid="rail-rank-tot" className="font-dp-mono text-[11px] text-dp-muted w-[28px]">{p.positionRank}</span>`
     `<span data-testid="rail-rank-ppg" className="font-dp-mono text-[11px] text-dp-muted-2 w-[28px]">{p.positionRankPpg ?? '—'}</span>`
   - The PPG cell reads `p.ppg` in both phases (`p.ppg != null ? p.ppg.toFixed(1) : '—'`); the
     `currentSeasonPPG` branch goes. (Off-season `ppg` is now unrounded `points / games` rather than the
     2-dp-rounded `currentSeasonPPG` — a possible 0.1 display difference on a double-rounding edge; accepted.)
   - Ellipsis row unchanged.
7. Imports: `rankDual`, `seasonLinesFromCareer`, `buildRankPeers`, `PPG_RANK_MIN_GAMES` from `../../utils/weeklyRanks`;
   `liveSeasonLines` only from `../../utils/liveSeasonLog`; `RankPair`, `RANK_PAIR_TITLE` from `./RankPair`.

**Accepted behaviour change — off-season rail population.** Today it is `playerRows` (relevance-filtered: retired
players and ghosts removed; `currentSeasonPPG > 0`), ranked by PPG with no floor. After: every
`careerStats[mostRecentSeason]` row with `gamesPlayed > 0` and a `playersMap` position — the same population as
My Team's last-season POS RANK and `/week`'s last-season rank (both `seasonPointsFromCareer(careerStats[dataSeason])`),
so a player retired since that season still holds his finish. Stated, not corrected.

### 5.3 `src/components/market/factViews.js:56–60` comment

Rewrite the pop-up half only: "the pop-up's ceiling/floor line uses `seasonRanks.js`'s
`buildSeasonPositionRanks`, which ranks by total points with the PPG rank beside it under a 3-game floor
(`weeklyRanks.js`'s `rankDual`)". Keep "Kept on purpose; do not unify here." (Slice C revisits it.) No code change.

## 6. Tests

Red-step rule: apply the named mutation, see the named test fail, revert.

**`src/utils/weeklyRanks.test.js`** (add `describe('rankDual')`, `describe('seasonLinesFromCareer')`,
`describe('buildRankPeers')`):
- **W-1 orderings diverge.** WRs `a {100, 10}`, `b {60, 4}`, `c {80, 8}`, `d {45, 5}` (points, games; PPG
  10, 15, 10, 9). Asserts `posRank` a 1, c 2, b 3, d 4 and `posRankPpg` b 1, a 2, c 2, d 4. Fails if the PPG
  rank is computed from total points (or the total from PPG). Red: rank PPG on `e.points` instead of
  `e.points / e.games`.
- **W-2 3-game floor.** WRs with games 5, 4, 2 (the 2-game player has the best PPG): asserts the 2-game player's
  `posRankPpg` is `null`, his `posRank` is not, and the others' PPG ranks are 1 and 2. Fails if the floor is
  not applied. Red: drop the `e.games >= floor` filter.
- **W-3 week-1 floor.** Every player `games: 1` (QB and WR mix): asserts every `posRankPpg` and
  `overallRankPpg` is a number. Fails if the floor is a flat 3. Red: `floor = minGames`.
- **W-4 floor is per group.** WRs with max games 3 (one at 2 → `null`), TEs whose max is 2 (both TEs at 2 and 1
  games): asserts the 2-game TE has a numeric `posRankPpg` while the 2-game WR has `null`, and the 1-game TE is
  `null`. Fails if one floor is pooled across positions. Red: compute `floor` once over every entry.
- **W-5 total ranks agree with `rankByTotalPoints`** (copy #2). One careerStats-shaped season with a points tie
  (`20, 20, 10`), a QB, a K, a `gamesPlayed: 0` row and an unmapped id: asserts
  `rankDual(seasonLinesFromCareer(rows), PM)` and `rankByTotalPoints(seasonPointsFromCareer(rows), PM)` have
  the same key set and, per id, equal `posRank` and `overallRank`; the K's `overallRank`/`overallRankPpg` are
  `null`. Fails if the two total-rank paths drift. Red: in `rankDual` replace `competitionRanks` for totals with
  a dense `i + 1` assignment (the tie fixture then differs).
- **W-6 `seasonLinesFromCareer` agrees with `seasonPointsFromCareer`** (copy #1). Rows with `gamesPlayed` 10/0/5
  and one `fantasyPoints: null`: asserts the same key set, `points` equal to `seasonPointsFromCareer`'s values,
  `games` equal `gamesPlayed`; `null` rows → `{}`. Fails if the filters drift. Red: drop `gamesPlayed > 0`.
- **W-7 skips.** An id absent from `playerMap`, `points: NaN`, and `games: 0` (with finite points), beside one
  valid WR → only the valid WR is in the result, at `posRank 1, posRankPpg 1`. Fails if a 0-game entry is
  ranked (its `points / 0` is `Infinity`, which would take PPG rank 1). Red: drop the `!(line?.games > 0)` skip.
- **W-8 `buildRankPeers` carries the PPG rank.** Over a `rankDual` result: asserts each peer's
  `positionRankPpg` equals `ranks.get(id).posRankPpg` (one peer `null` under the floor), and order is by
  `posRank`. Fails if the peer drops or mislabels the PPG rank. Red: set `positionRankPpg: ranks.get(id).posRank`.

**`src/utils/liveSeasonLog.test.js`** — the `ranks and peers (L-3)` block keeps its three cases with
`liveSeasonRanks` → `rankDual` and `buildLivePeers` → `buildRankPeers` imported from `./weeklyRanks`; all
existing assertions unchanged (they exercise total rank, which is unchanged). Update the import line.

**`src/utils/seasonRanks.test.js`** — `buildSeasonPositionRanks`:
- **SR-1 (changed)** — the existing multi-season case's `toEqual` entries gain `rankPpg` (`{ season, rank,
  rankPpg, points }`); its fixture has equal games so values match today's ranks. Fails if the entries drop
  the PPG rank. Red: omit `rankPpg` from the pushed entry.
- **SR-2 (new) total basis.** A season where `wr1 {300 pts, 17 g}`, `wr2 {200 pts, 8 g}`: asserts wr1
  `rank 1, rankPpg 2`, wr2 `rank 2, rankPpg 1`, and `refByPosRank.WR[1] === 300`. Fails if the season rank is
  still PPG. Red: revert `buildSeasonPositionRanks` to `rankPositionSeason`.
- `computeCeilingFloor` existing tests: add `rankPpg` to the input seasons where they `toEqual` the output, and
  one assertion that `ceiling.rankPpg`/`floor.rankPpg` pass through (input `rankPpg` omitted → `null`). Red:
  drop `rankPpg` from `decorate`.

**New `src/components/dp/RankPair.test.jsx`:**
- **RP-1** `prefix="QB" rank={3} rankPpg={1}` → text `QB3 · QB1/g`; the `/g` span has class `text-dp-muted-2`;
  `title` equals `RANK_PAIR_TITLE`. `rankPpg={null}` → `QB3 · —/g`. `rank={null}` → renders nothing.
  `prefix="#"` → `#5 · #2/g`. Fails if the pair loses its suffix, order or null handling. Red: render
  `{rankPpg}` without the `/g` suffix.
- **RP-2 the tooltip states the shared floor.** Asserts `RANK_PAIR_TITLE` contains
  `` `min ${PPG_RANK_MIN_GAMES} games` `` (imported from `../../utils/weeklyRanks`). Fails if the title hard-codes
  the number instead of reading the constant. Red: replace the interpolation with a literal `3` **and**
  temporarily set `PPG_RANK_MIN_GAMES = 4` — the test must go red (with the interpolation it stays green at 4);
  restore both.

**`src/components/dp/PlayerDetailModal.seasonPhase.test.jsx`:**
- **S-1 (changed)** — today asserts `tile-sofar` contains `WR2 · 3 G`. In that fixture wr1 has 3 games,
  48.3 pts, 16.1/g and wr2 3 games, 67.5 pts, 22.5/g, so wr1 is WR2 on both bases: the assertion becomes
  `WR2 · WR2/g · 3 G`. Fails if the tile drops the per-game rank. Red: omit the `rankPpg` prop in the tile
  note (it then reads `WR2 · —/g`).
- **S-4 (changed)** — drop the `by total points` assertion; select rows with `div.rounded-md` as today (the
  header row has no `rounded-md`), and additionally assert `getByTestId('rank-rail-head')` reads
  `TOT`, `/G`, `PPG`. Fails if the column headers are missing, or if the header row carries `rounded-md` (it
  would become rows[0]). Red: delete the header row.
- **S-18 (new) in-season rail and tile, diverging.** (S-11–S-17 are taken in this file.) Override `liveWeeklyRows` with weeks 1–5 built by
  `liveWeek`, `wr2` deleted from weeks 4 and 5 (wr1 5 games, 80.5 pts, 16.1/g; wr2 3 games, 67.5 pts,
  22.5/g). Asserts rail rows[0] is Test Receiver with `rail-rank-tot` `1` and `rail-rank-ppg` `2`, rows[1] Other
  Receiver `2` / `1`; `tile-sofar` contains `WR1 · WR2/g` and `5 G`. Fails if the rail or tile ranks by PPG,
  or shows one rank. Red: render `p.positionRank` in the `rail-rank-ppg` span.
- **S-19 (new) floor in the pop-up.** Weeks 1–3 from `liveWeek`, `wr2` deleted from week 3 (wr2 2 games):
  opening `wr2` → its rail row's `rail-rank-ppg` is `—` and `tile-sofar` contains `WR2 · —/g` and `2 G`.
  Fails if the 3-game floor is not applied in the pop-up. Red: call `rankDual(liveLines, playersMap, { minGames: 1 })`.

**`src/components/dp/PlayerDetailModal.test.jsx`:**
- **M-1 (new) off-season rail from careerStats.** `renderModal('p1')` with `careerStats` overridden so 2024
  adds `p8 { gamesPlayed: 4, fantasyPoints: 100 }` and `ghost { gamesPlayed: 2, fantasyPoints: 60 }` (neither
  is in `playerRows` with these values — ghost is not in `playerRows` at all). Asserts the `RANK · 2024` rail
  rows in order p1 (`1`/`2`), p8 (`2`/`1`), p7 (`3`/`3`), ghost (`4`/`—`). Fails if the off-season rail still
  reads `playerRows`' `positionRank`/population, ranks by PPG, or skips the floor. Red: restore the
  `positionPeers` branch for `!inSeasonLayout`.
- **ceiling/floor (changed)** — the existing `cf1` case asserts, via `within`, `ceiling-floor-best` contains
  `Best`, `WR1 · WR1/g`, `2023` and `ceiling-floor-worst` contains `Worst`, `WR3 · WR3/g`, `2022`. Fails if
  a row loses its rank pair or season, or the two rows swap. Red: pass `ceilingFloor.floor` to the best row.
- **CF-2 (new) diverging seasons.** `cfStats` with 2022 `cf1 { gamesPlayed: 8, fantasyPoints: 200 }` (25/g;
  cf2 320/16 = 20/g, cf3 240/16 = 15/g) and 2023 as today: asserts worst is `WR3 · WR1/g` (2022) and best
  `WR1 · WR1/g` (2023). Fails if best/worst are still picked by PPG (it would read worst `WR1`, 2022). Red:
  revert `buildSeasonPositionRanks` to `rankPositionSeason`.

Contract tests: `factorsSchema`/`statKeysContract` untouched (no `seasonProjection.js` or stat-key change).

## 7. Docs (same change)

- `docs/nav/utils.md`: `weeklyRanks.js` row — add `rankDual` (total + PPG ranks, per-group
  `min(3, max games)` floor), `PPG_RANK_MIN_GAMES`, `seasonLinesFromCareer`, `buildRankPeers` (both pop-up
  rails); consumers now include `seasonRanks.js` and `dp/PlayerDetailModal.jsx`. `seasonRanks.js` row —
  `buildSeasonPositionRanks` ranks by total points via `rankDual` with `rankPpg` beside it;
  `rankPositionSeason` remains the PPG-only lookup (My Team). `liveSeasonLog.js` row — remove
  `liveSeasonRanks`/`buildLivePeers`.
- `docs/nav/components.md`: add a `dp/RankPair.jsx` row; `dp/PlayerDetailModal.jsx` row — the `sofar` tile's
  note shows the rank pair and games; the rail (both phases) is the top five by total points with `TOT` · `/G`
  · `PPG` columns, from Sleeper rows in season and `careerStats[mostRecentSeason]` otherwise; the
  `ceiling-floor` line is two rows, best/worst by total points with the PPG rank beside.
- `docs/ui.md:372` (ceiling-floor sentence) and `:230` (the "Prev rk vs the pop-up's ceiling/floor line"
  sentence: the pop-up side now ranks by total points with the PPG rank under a 3-game floor).
- `docs/signal-registry.md:120` — ceiling/floor finish is by total points with the PPG rank beside it.
- `docs/architecture.md:134` and `:197` — remove `positionRank` from the `playerRows` description and shape.
- `docs/navigation.md:97` — the `usePlayerProfile.js` row drops "peers" from its list (`positionPeers` is
  deleted, §3).
- CLAUDE.md: no change.

**Open items to carry (not this slice):** `usePlayerProfile`'s unconsumed `historicalRanks` (PPG, no floor) —
dead code, left untouched.

## 8. Later slices (outline only — plan each after A is verified)

- **B — My Team + This Week (#5, #6).** `Portfolio.jsx` season-line cells (`:200` `SeasonLineCell`,
  `:426–500`: `lastRanks` over `careerStats[dataSeason]`, `liveRanks` over the live season-totals rows) and
  `LineupTable.jsx`'s `rankLine` (`buildLineupRanks` in `weeklyRanks.js`, needs games from the weekly rows:
  `liveSeasonLines`-style lines) move to `rankDual` and render `RankPair` (overall: `prefix="#"` + ` overall`).
  Then `rankByTotalPoints`/`seasonPointsFromCareer` lose their last callers — B decides whether to delete them
  (and W-5/W-6 with them). Depends on A's `rankDual`/`RankPair`. Width check on both tables.
- **C — Market + 2-yr rank (#7, #8).** `twoYearBaseline.js`'s `buildTwoYearRanks` adds a two-season
  total-points rank beside the PPG one (apply the 3-game floor to the PPG rank); `factViews.js` Prev rk moves to
  `rankDual` (3-game rule) with the total rank beside it, `rankWindow` unchanged for other metrics; rewrite the
  divergence comment and `docs/ui.md:230`. Depends on A.

## 9. What to check in the app (in season today — week 12 of 2026)

1. Open any QB's pop-up: the rail under `RANK · 2026 SO FAR` shows `TOT` / `/G` / `PPG` column headers; rows
   are ordered by the TOT column; a player with a higher PPG but fewer points shows a better `/G` than TOT.
2. The `2026 SO FAR` tile note reads like `QB3 · QB1/g · 11 G`, the `/g` part dimmer.
3. Open a backup QB with 1–2 starts: his `/G` reads `—` in the rail (if listed) and the tile.
4. The Floor-risk tile shows two aligned lines `Best QB2 · QB1/g 2023` / `Worst …`.
5. Narrow the window below 1180px: the rail stacks under Overview; names truncate, nothing overlaps.
   (The off-season rail cannot be seen live in season; M-1 covers it.)

## Plan review

Round 1 (plan-reviewer, full, 2026-11-26): 7 flags — S-1 not listed as changed; S-11/S-12 ids taken; 3-game
floor restated as a literal in two titles; W-7/SR-1/ceiling-floor/S-4 lacked a named defect or red step; rail
header shown over an empty off-season list; `docs/navigation.md:97` not named; cross-repo claim wrong for
`App.jsx` (CR-15/CR-22). All seven folded in above at Anton's direction ("fix all seven"); no re-review run.

Approved by Anton 2026-11-26 — Session 2 (sonnet) may implement.

## Session 2 questions — decisions (Session 1, 2026-11-26)

Session 2 stopped on two items it couldn't resolve from the plan. These rulings amend §5.2.5 and §6.

1. **S-3 (unlisted, now changed).** The new ceiling-floor season span also reads `2025`, so S-3's
   `getAllByText('2025').find(el => el.tagName === 'SPAN')` hits it before the chart label. Scope the lookup
   by intent rather than by DOM shape:
   `.find(el => el.tagName === 'SPAN' && !el.closest('[data-testid="ceiling-floor"]'))`.
   Leave the assertions alone. Red step: point `label2025` at the live bar's span and confirm the
   `not.toContain('bg-dp-up')` assertion fails, then revert.
2. **§5.2.5 layout amended: floor-risk tile overflow at 1360–1440px.** Each one-line row needs about 143px
   (`Worst` + `QB28 · QB31/g` + `2019`), but the tile has about 115px. Even with no season the row is
   about 111px, which leaves no safe margin. So each entry becomes **two lines**, and the testids and the
   wrapper title stay as they are:
   ```jsx
   <div data-testid="ceiling-floor-best" className="flex flex-col">
     <span className="text-dp-muted-2">Best · {ceilingFloor.ceiling.season}</span>
     <RankPair prefix={player.position} rank={ceilingFloor.ceiling.rank} rankPpg={ceilingFloor.ceiling.rankPpg} />
   </div>
   ```
   Do the same for `ceiling-floor-worst`, with `Worst` and `ceilingFloor.floor`. The wrapper stays
   `mt-1 flex flex-col gap-0.5`, and `w-[34px]` is dropped. The widest line is now the pair, about 73px.
   The ceiling/floor and CF-2 tests still assert, via `within`, the label, the pair and the season in each
   row. Change only their text expectations if the `Best · 2023` join requires it. Their red steps are
   unchanged. Smoke at 1360 and 1440 with Dak Prescott: no spill past the tile border. Report the measured
   widths.

## Fix pass 1 (Session 1, 2026-11-26 — triage of implementation-reviewer round 1 on `649e379`)

Six flags. Four are fixed below, one is fixed with a red step only (5) and one is accepted (6). Change only the
items listed here; touch nothing else.

1. **Orphan comment.** `src/hooks/usePlayerProfile.js` return object: delete the leftover `// Peers` line and the
   blank line after it, so `// Role` follows the previous group directly. Non-behavioural, so no test is needed.
2. **M-1 does not assert the off-season PPG cell.** In `PlayerDetailModal.jsx`, add `data-testid="rail-ppg"` to the
   rail row's PPG cell span (the one rendering `p.ppg != null ? p.ppg.toFixed(1) : '—'`, about line 682). Change no
   class or text. In M-1 (`PlayerDetailModal.test.jsx`), extend `read` with
   `within(row).getByTestId('rail-ppg').textContent` and the expected rows with p1 `18.0` (306/17), p8 `25.0`
   (100/4), p7 `12.0` (96/8) and ghost `30.0` (60/2). Fails if the off-season PPG cell reads `currentSeasonPPG`
   (undefined on `buildRankPeers` peers, so every cell reads `—`). Red step: render `p.currentSeasonPPG` in that
   cell, confirm it goes red, then revert.
3. **The rail header guard over an empty list is untested.** Add a test in `PlayerDetailModal.test.jsx` (or in
   `.seasonPhase.test.jsx`, whichever already has an off-season render helper). It renders the off-season pop-up
   with a `careerStats[mostRecentSeason]` that has no row at the player's position, so the rail section renders
   with `railPeers.length === 0`, and asserts `queryByTestId('rank-rail-head')` is null. Fails if the header renders
   over an empty list. Red step: drop the `railPeers.length > 0 &&` guard, confirm it goes red, then revert. **If no
   fixture can make the rail section render with zero peers** (that is, if the whole rail is already hidden when
   empty, so the red step can't go red), stop and report it rather than writing a test that can't fail.
4. **The ceiling-floor title is not pinned to the constant.** In the existing ceiling/floor `describe` of
   `PlayerDetailModal.test.jsx`, add a test asserting
   `screen.getByTestId('ceiling-floor').getAttribute('title')` contains `` `min ${PPG_RANK_MIN_GAMES} games` ``,
   with `PPG_RANK_MIN_GAMES` imported from `../../utils/weeklyRanks`. Fails if the title restates the floor as a
   literal. Red step (as for RP-2): replace the interpolation with a literal `3`, temporarily set the constant to 4,
   confirm it goes red, then revert both.
5. **The third L-3 case was not shown red.** No code change. Show the case "unmapped ids never ranked or listed"
   failing by temporarily dropping `rankDual`'s `!position` skip, then revert. Report it in the hand-back.
6. **Smoke at 1440 — accepted, no change.** Session 2 measured the tile content box at both widths (114px at 1360,
   116px at 1440) and the line widths (61, 65, 68 and 72px, independent of viewport), so 1440 is covered.

Done-definition: `npm test`, `npm run lint` and `npm run build` all clean. Commit on `main`, unpushed, with the
subject `Fix pass 1: dual ranks slice A test gaps`. Stage by path.

## Verification

Session 1, 2026-11-26. Diff `032e84b..59593ad`, two commits:
- `649e379 Pop-up ranks: total points and per game as a pair` (Session 2, on sonnet);
- `59593ad Fix pass 1: dual ranks slice A test gaps` (fix-applier).

**Plan review (full):** 7 flags, all folded in before approval at Anton's direction (see *Plan review*).

**Mid-implementation:** Session 2 stopped on two items, and Session 1 ruled on both (see *Session 2 questions —
decisions*):
- the S-3 lookup is scoped away from `ceiling-floor`;
- the floor-risk Best/Worst entries become two lines, because the one-line rows overflowed the tile at
  1360–1440px.

**implementation-reviewer (full, opus/high) on `032e84b..649e379`:** 6 flags. Fix pass 1 handled them:
- 1, orphan `// Peers` comment: fixed.
- 2, M-1 didn't assert the off-season PPG cell: fixed. Added `rail-ppg`, and M-1 now expects 18.0, 25.0, 12.0
  and 30.0.
- 3, no test of the rail header over an empty list: fixed with the new M-2.
- 4, ceiling-floor title not pinned to `PPG_RANK_MIN_GAMES`: fixed with a new test.
- 5, the third L-3 case not shown red: shown red by dropping `rankDual`'s `!position` skip, then reverted.
- 6, smoke at 1440 not reported: accepted, since both content widths (114 and 116px) and the line widths
  (≤72px) were measured.

**Fix-pass re-review (light) on `649e379..59593ad`:** "No flags."

**Session 1 read of the source diff:**
- `rankDual` matches §1: per-group floor `min(minGames, max games)`, skips for no position, non-finite points or
  zero games, overall ranks only for QB/RB/WR/TE.
- `buildSeasonPositionRanks` ranks via `rankDual`, and `refByPosRank` is keyed by total rank.
- `computeCeilingFloor` passes `rankPpg` through.
- `RankPair` matches §5.1.
- `App.jsx` drops only `positionRank: 0` and the PPG-rank block.

**Checks re-run by Session 1 at `59593ad`:**
- `npm test`: 198 files, 3765 tests passed.
- `npm run lint`: 0 problems.
- `npm run build`: clean apart from the >500 kB chunk notice. Session 2 showed HEAD `032e84b` also prints it, so
  it predates this slice.

**Red steps:**
- Session 2's hand-back covers W-1–W-8, L-3, SR-1, SR-2, ceiling/floor passthrough, RP-1, RP-2, S-1, S-3, S-4,
  S-18, S-19, M-1, ceiling/floor and CF-2.
- The fix-applier's covers M-1 (changed), M-2, the ceiling-floor title test and the third L-3 case.
- Each test was seen failing on its named mutation and then reverted.
- Substitute red steps, each confirmed by the reviewer to trigger the named defect:
  - L-3: totals ranked by PPG.
  - SR-2 and CF-2: a `rankPositionSeason` loop in place of `rankDual`.
  - M-1 (original): an inline copy of the deleted `positionPeers` memo.

**Smoke (Session 2, preview config, week 12):**
- Dak Prescott: rail headers TOT / /G / PPG line up with the rows, which are ordered by TOT. The tile reads
  `QB2 · QB4/g · 11 G`, with the /g part dimmer. Floor-risk lines are 61–72px wide in a 114px tile at 1360 and a
  116px tile at 1440: no spill, no wrap.
- Joshua Dobbs (2 games): rail `64 —`, tile `QB64 · —/g · 2 G`.
- No console errors.

**Other notes:**
- PROVISIONAL tags: 49 before, 49 after.
- Deviations: the two Session 1 rulings. Docs: the `docs/nav/utils.md` `weeklyRanks` row dropped a now-false
  clause, and `docs/ui.md` and `docs/nav/components.md` describe the two-line layout.
- Cross-repo index: untouched. `App.jsx` is a CR-15/CR-22 file, but the symbols those entries list are unchanged.
- Backlog lines added: none.

Signed off by Anton 2026-11-26
