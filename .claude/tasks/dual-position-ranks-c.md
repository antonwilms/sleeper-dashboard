# Dual position ranks — Slice C: Market Prev rk + 2-yr rank (#7, #8), and the brighter `/g`

Review depth: full — §1 edits `src/utils/twoYearBaseline.js`, the App site of **CR-33** in
`docs/cross-repo-registry.md`, and §8 edits `docs/signal-registry.md` (App site of **CR-18**); touching a
registry-listed site is a non-overridable `full` trigger. (Otherwise view-only display work on Market, My Team
and the pop-up: no scoring, projection, pipeline, state or TTL trigger.)

Decided by Anton 2026-11-26 (handoff brief "Dual position ranks (total points + PPG) everywhere"): format
`QB3 · QB1/g` (total-points rank first, the per-game rank second with a `/g` suffix); a 3-game minimum on
every per-game rank (`min(3, most games at the position)`); sleek presentation. Brief decisions 4 (Prev rk
moves to the shared helper, total rank beside it, divergence comment rewritten, `rankWindow` unchanged) and 7
(2-yr rank gains a total-points rank over the same two seasons). At Slice B sign-off Anton added: brighten the
`/g` rank (`RankPair` default `text-dp-muted-2` → `text-dp-muted`).

Built in A/B and consumed here: `rankDual`, `PPG_RANK_MIN_GAMES` (`src/utils/weeklyRanks.js`); `RankPair`,
`RANK_PAIR_TITLE` (`src/components/dp/RankPair.jsx`); `ppgRankLabel`, `rankPairText`
(`src/components/dp/rankPairText.js`). App repo only. Display-only.

Cross-repo. **CR-33** (two-year baseline and age caution): its App definitions are `twoYearAveragePPG`,
`cautionAge`, `ageCaution`, `AGE_CAUTION`; this slice changes **none** of them — only `buildTwoYearRanks`,
which is not in the entry, the parity test (`twoYearBaselineParity.test.js`) or the data side. Data side read
in planning: `sleeper-dashboard-data/lib/dynastyBacktest.mjs:215–217` defines `twoYearAveragePPG(careerStats,
pid, S)`; its ranking (`rankTransform`, `:40`) is the backtest's percentile, not a display rank, and has no
counterpart to `buildTwoYearRanks`. So CR-33's invariant ("B2 = mean PPG of the seasons in {S−1, S} with ≥ 8
games…") is untouched; no index edit, no data-side edit, no backlog line. **CR-18**: §8 rewords one clause of
the computed-view part of `docs/signal-registry.md:45`; no ingested field is added, removed or renamed. Sign-off
line: "Touches cross-repo index: yes — CR-33 (`twoYearBaseline.js` `buildTwoYearRanks` only; CR-33 functions
unchanged), CR-18 (`docs/signal-registry.md:45` one clause reworded)".

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a backgrounded `npm run dev`, and
stops it when done.

**Copied definitions created by this slice: none.** Prev rk ranks through `rankDual`. The 2-yr total rank uses
`buildTwoYearRanks`'s own existing tie rule (`1 + count strictly higher`), applied to a second value in the
same function — not a copy of `competitionRanks` (§1.2 says why `rankDual` cannot be used there).

---

## 0. Pre-checks done in planning (Session 1, 2026-11-26, HEAD `a270684`)

1. **`buildTwoYearRanks` readers** (`grep -rn buildTwoYearRanks src`, non-test): `Market.jsx:443–445`
   (`twoYearRanks` → `modelRows[].twoYearRank`, rendered by `MODEL_CELLS.dynasty` at `:169`),
   `Portfolio.jsx:414` (`col-2yr`, Starting ten `:1288`, Bench `:1468`), `PlayerDetailModal.jsx:269`
   (dynasty tile `:404`). Every consumer hands the entry to `TwoYearRankCell` and reads no field itself —
   `grep -rn "poolSize\|entry\.rank\|entry\.ppg"` finds only `TwoYearRank.jsx:25` and tests. Nothing sorts on
   the entry. So the entry's shape can change freely inside this slice.
2. **B2's floor makes the 3-game rule moot for #7.** A B2 value exists only with at least one 8+-game season
   in {S−1, S}, so every ranked player has ≥ 8 games; a `min(3, …)` floor could never exclude anyone. No floor
   code is added; the per-game rank is never null when an entry exists. (Brief decision 3 is satisfied, not
   re-implemented.)
3. **Why the 2-yr per-game rank cannot go through `rankDual`.** `rankDual` ranks `points / games`. B2 is the
   **mean of per-season PPGs** over 8+-game seasons only (CR-33's definition and the S3/S4a verdict's tested
   baseline). Feeding `rankDual` would silently change the ranked quantity. The per-game rank stays B2.
4. **Prev rk today.** `Market.jsx:352–357` builds `buildWindowStats` for `prevWindowFor(activeWindow, windows)`
   (a one-season window, Overview only) and ranks it with `rankWindow(ws, [METRIC_BY_ID.fpPerG])` — the
   half-of-max-games floor. `FactTable.jsx:26` reads `prevRanks?.[id]?.fpPerG` (`{ rank, of }`) into
   `ext.prevRank`; `factViews.js:39–42` `PREV_RANK.value` reads `ext.prevRank.rank`, `format: v => '#'+v`;
   `FactTable.jsx:51–54` builds its header tooltip. Window stats rows carry `position`, `gp`, `fp`
   (`marketWindowStats.js:188–196`; `fp` sums `fantasyPoints`, non-finite as 0). `rankWindow` keeps its other
   caller (`Market.jsx:349`, `windowRanks`) — unchanged. `METRIC_BY_ID` stays imported in `Market.jsx` only if
   another use remains; lint decides.
5. **Fixture arithmetic for Market tests** (`Market.factViews.test.jsx:20–24`, `careerStats` at `:31–44`).
   rankDual on the WR rows, floor `min(3, max games)`:
   - 2024 (prev of the default live window): totals w2 340 #1, w3 255 #2, w1 120 #3, w4 50 #4; PPG (floor 3)
     w2 20 #1, w3 15 #2, w1 10 #3, w4 10 #3. Today w4 (5 gp < ceil(17/2)) reads `—`.
   - 2023 (prev of the 2024 window): totals w1 210 #1, w3 170 #2, w2 30 #3; PPG w1 15 #1, w3 10 #2, w2 10 #2.
6. **Contrast.** `dp-muted` (`#858b95`) on `dp-card` (`#0e1014`) ≈ 5.2:1; `dp-muted-2` ≈ 2.7:1. No `RankPair`
   default consumer sits over the `PlayerCell` watermark (This Week passes its own tones, `LineupTable.jsx`
   `RankLine`). The Prev rk and 2-yr cells are not inside `PlayerCell`.
7. **`metricGlossary.js` imports nothing** (its header: "pure, no imports"), so its definition text states no
   number; the header tooltip in `FactTable` carries the interpolated floor.

---

## 1. `src/utils/twoYearBaseline.js` — `buildTwoYearRanks`

### 1.1 New helper (module-private, not exported)

```js
// Total league-scored points over {S−1, S}: every row with gamesPlayed > 0 and finite fantasyPoints, short
// seasons included (B2 averages only the 8+-game ones). null when neither season has such a row.
function twoYearTotalPoints(careerStats, playerId, dataSeason) { … }
```

### 1.2 `buildTwoYearRanks`

Same pool as today (veteran rows with a B2 value and a `playersMap` position). For each pool member also
compute `points = twoYearTotalPoints(...)` (never null for a pool member — a B2 season is such a row). Rank
both values within each position pool with the existing tie rule (`1 + count strictly higher`). New entry:

```js
// Map<playerId, { rank, rankPpg, poolSize, points, ppg }> — rank: by two-season total points; rankPpg: by B2
// (the per-game rank). Ties share a rank. No games floor on rankPpg: B2 already needs an 8-game season.
```

`rank` changes meaning (was the B2 rank, now the total rank) to match `RankPair`'s `rank`/`rankPpg` props; §0.1
shows its only reader is `TwoYearRankCell`. Rewrite the function comment (`:43–44`) to the one above. Keep the
sort line (it orders nothing observable but the loop) or drop it — Session 2's call, no behaviour change.
`twoYearAveragePPG`, `cautionAge`, `ageCaution`, `AGE_CAUTION`, `isVeteranRow`: unchanged. Header comment
(`:1–13`): add one sentence — "`buildTwoYearRanks` also ranks two-season total points beside B2 (app-only; not
part of CR-33)." The `PROVISIONAL(heuristic)` line at `:17` stays as is.

## 2. `src/components/dp/RankPair.jsx` — brighter `/g`

- Default `ppgClassName = 'text-dp-muted'` (was `text-dp-muted-2`).
- Comment `:8–12`: "The /g part is secondary (dp-muted by default, ≈5.2:1 on the card)…"; keep the watermark
  sentence.
- `PlayerDetailModal.jsx:677` `rail-rank-ppg`: `text-dp-muted-2` → `text-dp-muted`, matching the default (the
  rail's `TOT`/`/G` column headers carry the distinction; both rank columns then share one tone). Nothing else
  in the rail changes.

## 3. `src/components/dp/TwoYearRank.jsx` — the pair

Ranked branch renders:

```jsx
<span data-testid="two-year-rank" onClick={stop} className="text-[11px] text-dp-muted font-dp-mono">
  <DefinitionPopover term="2-yr rank" gloss={TWO_YEAR_GLOSS}>
    2-yr <RankPair prefix={position} rank={entry.rank} rankPpg={entry.rankPpg} title={null} rankClassName="text-dp-text-4" />
  </DefinitionPopover>
</span>
```

- Visible text `2-yr WR5 · WR3/g`. The word `avg` goes (the total rank is not an average; `/g` carries it).
- `title={null}`: the popover gloss is the explanation; a native tooltip on the pair would compete with it.
- `rankClassName="text-dp-text-4"` lifts the total rank above the host's `dp-muted` so it stays the anchor
  (the `/g` part takes the new default `dp-muted`, equal to the host).
- `TWO_YEAR_GLOSS` (module const): "Rank among veterans at this position over the last two completed seasons,
  in league scoring: first by total points across both seasons, then (/g) by points per game averaged over the
  seasons with 8+ games. In the dynasty history tests (S3/S4a, seasons 2015–2022) the dynasty score did not
  beat the per-game ranking."
- Unranked branch: add the same `data-testid="two-year-rank"`; term `2-yr rank`; gloss unchanged; still `—`.
- Import `RankPair` from `./RankPair`.

## 4. Prev rk (#8)

### 4.1 `src/utils/weeklyRanks.js` — one line builder

```js
// Market window stats (Map<id, { gp, fp }>) -> { [id]: { points: fp, games: gp } }, for rankDual.
export function linesFromWindowStats(windowStats) { … }   // skips entries with !(gp > 0) or non-finite fp
```
Header comment (`:3–9`): add `linesFromWindowStats` (Market's Prev rk) to the line-builder list.

### 4.2 `src/components/market/Market.jsx:353–357`

```js
const prevRanks = useMemo(() => {
  if (!prevWindow) return null
  const ws = buildWindowStats({ window: prevWindow, careerStats, currentSeasonTotals, playerMap })
  return rankDual(linesFromWindowStats(ws), playerMap)
}, [prevWindow, careerStats, currentSeasonTotals, playerMap])
```
`windowRanks` (`:348–351`) and every other `rankWindow` use: unchanged.

### 4.3 `src/components/market/FactTable.jsx`

- `:26` `ext: { prevRank: prevRanks?.get(row.player_id) ?? null }` (a `rankDual` entry).
- A built-in cell branch beside `owner` (`:63–81`), for `c.cell === 'rankPair'`:
  ```jsx
  <td key={c.id} className="px-3 py-3 whitespace-nowrap font-dp-mono text-[13px] text-right text-dp-text">
    {ext.prevRank?.posRank == null
      ? <span className="text-dp-muted text-xs">—</span>
      : <RankPair prefix="#" rank={ext.prevRank.posRank} rankPpg={ext.prevRank.posRankPpg} title={null} />}
  </td>
  ```
  The `—` matches the generic null cell. `title={null}`: the header tooltip explains the column. Prefix `#`
  keeps the column's existing look (`#3` → `#3 · #1/g`).
- `tooltipFor` (`:51–54`): `` `Position rank in ${prevSeason}: by total points · by points per game (/g, min ${PPG_RANK_MIN_GAMES} games)` ``,
  and with no season `` `Position rank in the prior season: by total points · by points per game (/g, min ${PPG_RANK_MIN_GAMES} games)` ``.
  Import `PPG_RANK_MIN_GAMES` from `../../utils/weeklyRanks`, `RankPair` from `../dp/RankPair`.
- Update the file header if it lists the built-in cells; the "this file builds no data" sentence stays true.

### 4.4 `src/components/market/factViews.js`

- `PREV_RANK.value`: `ext?.prevRank?.posRank ?? null` (sort stays by the total rank, `asc`); add
  `cell: 'rankPair'`; keep `format` (fallback, and `factCellValue` consumers).
- Replace the divergence comment (`:57–61`) with (settled in planning, plan review round 1 flag 5 — a season
  window's pool is `careerStats[y]` rows with a QB/RB/WR/TE position and `gamesPlayed >= 1`,
  `marketWindowStats.js:78` via `marketWeekly.js`'s `windowSeasonRows`, the same rows `seasonLinesFromCareer`
  takes): "Prev rk and the pop-up's ceiling/floor line agree: both rank `careerStats[season]` through
  weeklyRanks.js's `rankDual` (total points, with the per-game rank under the 3-game floor), per position over
  the same rows. One edge: a row with non-finite `fantasyPoints` counts as 0 points here (`buildWindowStats`'s
  `fpOf`) and is skipped by `seasonLinesFromCareer`." No "stop if same" branch — this is the sentence.
- Header comment (`:3`) "Imports only marketMetrics and metricGlossary" stays true.

### 4.5 `src/utils/metricGlossary.js:78`

`definition: 'His position rank in the prior season by total points, with his points-per-game rank beside it.'`
(one sentence, ends with a full stop, no number — §0.7).

## 5. Nothing else

No change to `rankWindow`, `marketMetrics.js`, `seasonRanks.js`, `Portfolio.jsx` (its `col-2yr` cells render
`TwoYearRankCell` and pick the pair up), the pop-up beyond `:677`, or the This Week line.

## 6. Tests

Red-step rule: apply the named mutation, see the named test fail, revert. Changed tests whose expected strings
depend on a fixture Session 2 did not plan: read the fixture, write **both** ranks as literals, and report
the hand arithmetic in the hand-back.

**`src/utils/twoYearBaseline.test.js`**
- **TY-0 (changed, `:63–69`).** Same fixture; assertions on `rank`/`poolSize` re-stated for the new shape:
  the old per-B2 expectations move to `rankPpg`, and `rank` is asserted from the fixture's two-season totals
  (literal). `r1` `toEqual({ rank: 1, rankPpg: 1, poolSize: 1, points: <literal>, ppg: 9 })`. Fails if the
  entry drops a field. Red: omit `points` from the built entry.
- **TY-1 (new) total and per-game ranks diverge; short seasons count toward the total only.** S = 2025, three
  veteran WRs (`isVeteranRow` rows as the existing tests build them):
  a 2024 `{16 g, 160}` 2025 `{16 g, 160}` (B2 10, total 320); b 2024 `{8 g, 120}` 2025 `{6 g, 210}` (B2 15 —
  the 6-game season is excluded — total 330); c 2024 `{10 g, 150}` 2025 `{10 g, 150}` (B2 15, total 300).
  Expect b `{ rank: 1, rankPpg: 1, poolSize: 3, points: 330, ppg: 15 }`, a `{ rank: 2, rankPpg: 3, points: 320, ppg: 10 }`,
  c `{ rank: 3, rankPpg: 1, points: 300, ppg: 15 }` (`toMatchObject` for a/c). Fails if the total is
  computed from B2's seasons only, or if `rank` is the per-game rank. Red steps: (i) in
  `twoYearTotalPoints` skip rows with `gamesPlayed < 8` → b's `rank` becomes 3; (ii) set `rank` to the B2 rank
  → a's `rank` becomes 3.
- `twoYearBaselineParity.test.js`, `twoYearBaselineViewOnly.test.js`: untouched, must stay green.

**`src/components/dp/TwoYearRank.test.jsx`**
- **TR-1 (changed, `:11–13`).** Entry `{ rank: 14, rankPpg: 11, poolSize: 80, points: 1500, ppg: 12 }`,
  `WR`: `getByTestId('two-year-rank').textContent` `toBe('2-yr WR14 · WR11/g')`; click the popover's button
  (`within(getByTestId('two-year-rank')).getByRole('button')` — the testid span's `onClick={stop}` sits above
  the `DefinitionPopover` button, so clicking the span itself never opens it) → the gloss contains
  `by total points across both seasons` and `averaged over the seasons with 8+ games`. Fails if the cell shows
  one rank or swaps them. Red: pass `rank={entry.rankPpg}`.
- **TR-2 (new) tones and no native title.** Token-exact class checks (`classList.contains`, never
  `className.toContain` — `text-dp-muted` is a prefix of `text-dp-muted-2`): the pair's first child span
  contains `text-dp-text-4`; the second contains `text-dp-muted` and not `text-dp-muted-2`;
  `getByTestId('two-year-rank').querySelectorAll('[title]').length` is 0. Fails if the total rank is not
  lifted, the `/g` part is faint, or the pair carries `RANK_PAIR_TITLE`. Red steps: (i) drop `title={null}`
  (title count 1); (ii) drop `rankClassName` (first span loses `text-dp-text-4`).
- The QB case (`:23–24`): its entry gains `rankPpg: 2` → `toBe('2-yr QB1 · QB2/g')`, read via the testid and
  clicked through the inner button as in TR-1. The unranked case keeps `—` and reads it via the testid.

**`src/utils/weeklyRanks.test.js`**
- **LW-1 (new) `linesFromWindowStats`.** `new Map([['a', { gp: 4, fp: 40 }], ['b', { gp: 0, fp: 0 }], ['c', { gp: 2, fp: NaN }]])`
  → `toEqual({ a: { points: 40, games: 4 } })`; `null` → `{}`. Fails if 0-game or non-finite entries pass.
  Red: drop the `gp > 0` check (`b` appears).

**`src/components/market/Market.factViews.test.jsx`** (arithmetic in §0.5)
- **9 (changed).** `cellOf('Receiver One', 'Prev rk').textContent` `toBe('#1 · #1/g')` (2024 window → 2023).
  The two title assertions become `toContain('Position rank in 2024')` / `'… in 2023'` and one
  `` toContain(`min ${PPG_RANK_MIN_GAMES} games`) ``. Fails if the cell drops the per-game rank. Red: render
  `#${posRank}` alone in the `rankPair` branch.
- **PR-1 (new) diverging bases, 3-game floor replaces half-season.** `renderMarket({ liveSeasonUsable: true })`, default (live) window → prior 2024:
  Receiver One `#3 · #3/g`, Receiver Two `#1 · #1/g`, Receiver Four `#4 · #3/g`. Then with
  `careerStats` overridden to add `w4: wr(2, 40, 100)` to 2023, `pickWindow('2024')`: Receiver Four
  `#3 · —/g`, Receiver Two `#4 · #2/g`. Fails if Prev rk keeps `rankWindow`'s half-season floor (w4 would
  read `—` in 2024), if the per-game rank is derived from the total, or if the 3-game floor is missing. Red
  steps: (i) restore `rankWindow(ws, [METRIC_BY_ID.fpPerG])` with `ext.prevRank` mapped back → w4 reads `—`;
  (ii) `rankDual(..., { minGames: 1 })` → w4's 2023 pair reads `#3 · #1/g`.
- **PR-2 (new) sort by the total rank.** On the 2024 window's prior (2023) with the override above, click the
  `Prev rk` header (ascending): WR rows order Receiver One, Receiver Three, Receiver Four, Receiver Two. Fails
  if the column sorts by the per-game rank (Receiver Two would precede Receiver Four). Red:
  `PREV_RANK.value` reads `posRankPpg`.

**`src/components/market/Market.test.jsx:864–876`** (test 7, changed). `getByText('2-yr avg WR1')` →
`within(<p1's row>).getByTestId('two-year-rank')` — scoped to p1's row, because p2/p3/p5 render the unranked
branch with the same testid — with `textContent` the fixture's pair (literal); the click target is the button
inside that testid. Red (these fixtures' total and B2 orders coincide, so swapping the props changes nothing):
restore the old `2-yr avg {position}{entry.rank}` render in `TwoYearRank.jsx`.

**`src/components/portfolio/Portfolio.test.jsx:1465–1466, 1483`** (changed). `'2-yr avg WR2'`/`'WR3'` →
the fixture's pairs (`2-yr WR<a> · WR<b>/g`, literal); `col-2yr` `toBe(...)`. Red: restore the old
`2-yr avg {position}{entry.rank}` render.

**`src/components/dp/PlayerDetailModal.test.jsx:462`** (changed). `'2-yr avg WR1'` → the fixture's pair.
Red: restore the old `2-yr avg {position}{entry.rank}` render.

**`src/components/dp/RankPair.test.jsx`** — every tone check here and below is token-exact
(`classList.contains` / `toHaveClass`), since `text-dp-muted` is a string prefix of `text-dp-muted-2`.
- RP-1 (`:17`): rewrite `className.toContain(...)` as `classList.contains('text-dp-muted')` true **and**
  `classList.contains('text-dp-muted-2')` false. RP-4 (`:44–48`): the no-props case's second span likewise.
  Fails if the default stays faint. Red: restore `text-dp-muted-2` as the default.
- **Rail (changed).** Add to `PlayerDetailModal.seasonPhase.test.jsx` S-18 (`:196`): `rail-rank-ppg`'s
  `classList` contains `text-dp-muted` and not `text-dp-muted-2`. Red: restore `text-dp-muted-2` at `:677`.

`grep -rn "muted-2" src --include=*.test.jsx` (zsh: quote or drop the glob) after the change: any remaining
hit asserting a rank pair's `/g` tone is updated the same way; report the list.

Contract tests: `factorsSchema`/`statKeysContract` untouched.

## 7. Glossary test

`src/__tests__/metricGlossary.test.js` test 1 (one sentence, full stop) must stay green with §4.5's text.

## 8. Docs (same change)

- `docs/nav/utils.md:18` `twoYearBaseline.js` — `buildTwoYearRanks` → `Map<id, {rank, rankPpg, poolSize,
  points, ppg}>`: two-season total-points rank beside the B2 rank (app-only, not CR-33).
- `docs/nav/utils.md:83` `weeklyRanks.js` — add `linesFromWindowStats` (Market's Prev rk).
- `docs/nav/utils.md:54` `marketMetrics.js` — if it names Prev rk as a `rankWindow` consumer, drop that.
- `docs/nav/components.md:40` `TwoYearRank.jsx` — `2-yr WR14 · WR11/g` (`RankPair`, total rank in
  `dp-text-4`, `data-testid="two-year-rank"`). `:46` `RankPair.jsx` — default `ppgClassName` `text-dp-muted`;
  consumers add `TwoYearRank.jsx` and `market/FactTable.jsx`. `:24` `FactTable.jsx` — built-in `rankPair` cell
  (Prev rk), `prevRanks` is a `rankDual` Map. `:22` `Market.jsx` — only if it describes `prevRanks`.
- `docs/ui.md:230` `2-yr avg WR14` → `2-yr WR14 · WR11/g`. `:231` the ranks sentence: Prev rk ranks through
  `rankDual` (total points, per-game rank with the 3-game floor), other columns through `rankWindow`; replace
  the **Prev rk vs the pop-up's ceiling/floor line** paragraph with §4.4's comment text. Also `:231`'s
  Overview column list: "`Prev rk` (the prior season's FP/G position rank; hidden on Last 3 and Career)" →
  "`Prev rk` (the prior season's position rank by total points with the per-game rank beside it, `#3 · #1/g`;
  hidden on Last 3 and Career)". `:572` "Prev rk
  (prior-season rank: total points · per game)".
- `docs/signal-registry.md:45`, the clause "the two-year-average rank (`twoYearBaseline.js`) reads completed
  seasons' `gamesPlayed`/`fantasyPoints` (view-only display)" → "the two-year rank (`twoYearBaseline.js`:
  two-season total points and the B2 average PPG) reads completed seasons' `gamesPlayed`/`fantasyPoints`
  (view-only display)". Nothing else in the row.
- Then `grep -rn -e "2-yr avg" -e "half that season's max games" src docs` (excluding `docs/dynasty-*` dated
  design docs) must return nothing, `grep -rn "FP/G position rank" src docs` must return nothing (it catches
  the old `:231` column-list wording and the old `FactTable` tooltip), and `grep -rn rankWindow docs` is read hit by hit: no hit may still call
  Prev rk a `rankWindow` rank.
- CLAUDE.md: no change.

## 9. Smoke (Session 2) and what to check in the app

Session 2, preview at 1440 wide and the `mobile` preset:
1. **Market → Overview**, a position pill: measure the `Prev rk` column width before (HEAD `a270684`) and
   after; the cells read `#n · #m/g` on one line, no overlap. Switch Window to the prior season and back; to
   `Last 3`/`Career` the column disappears as today.
2. **Market → Model**: the dynasty cell's sub-line reads `2-yr WR5 · WR3/g` inside the 230px column, no wrap;
   clicking it opens the gloss and does not open the player.
3. **My Team**: `2-YR RANK` column width before/after; the pop-up's dynasty tile shows the pair.
4. Pop-up rail and My Team season cells: the `/g` part is visibly brighter than before.
5. No console errors. Stop and report rather than restyle if anything wraps, overlaps or a column more than
   doubles.

For Anton:
1. **Market → Overview** → `Prev rk` reads like `#3 · #1/g` (rank by total points last season, then per game);
   a player with only 1–2 games last season reads `#40 · —/g`. Backups with 4–8 games, who used to show `—`,
   now get a rank.
2. **Market → Model** and **My Team's 2-YR RANK** → `2-yr WR5 · WR3/g`; click it for the explanation.
3. Everywhere a `/g` rank appears outside This Week (pop-up, My Team cells), it is now easier to read.

## 10. Open items to surface at sign-off

- `usePlayerProfile`'s unconsumed `historicalRanks` (Slice A) — still untouched.
- Phone truncation on This Week and the wider PLAYER column (Slice B) — unchanged here.
- The 2-yr per-game rank keeps B2's own 8-game-season rule (stricter than 3 games), by design (§0.2–0.3).

## Plan review

Round 1 (plan-reviewer, full, opus/high, 2026-11-26; log `.claude/reviews/dual-position-ranks-c.plan-reviewer.md`):
7 flags, no invariant or cross-repo flags; §0.5 arithmetic and the PR-1/PR-2/TY-0/TY-1/test-9 expected values
confirmed by hand. All seven folded in above at Anton's direction ("Fix all seven"), no re-review run:
1. TR-1 / QB case clicked the `onClick={stop}` span — now click the popover button inside the testid (§6).
2. Market test 7's testid matched several rows — now scoped to p1's row (§6).
3. "Red: as TR-1" could not turn the Market/Portfolio/pop-up consumer tests red (their fixtures' two orders
   coincide) — red is now restoring the old `2-yr avg` render (§6).
4. `text-dp-muted` is a prefix of `text-dp-muted-2` — every tone check is token-exact; TR-2 gained a red step
   for the lifted total rank (§6).
5. The replacement divergence comment claimed different populations; live source shows they agree — the
   sentence is settled in §4.4, and `docs/ui.md:231` copies it.
6. `docs/ui.md:231`'s Overview column list still called Prev rk an FP/G rank — added to §8, with a grep.
7. The QB case had no `rankPpg` — its entry gains `rankPpg: 2`, expected `2-yr QB1 · QB2/g` (§6).

## Session 2 questions — decisions (Session 1, 2026-11-26)

Q1. Two exact-import guards contradict §3/§4.3: `src/__tests__/twoYearBaselineViewOnly.test.js:43–46`
(`TwoYearRank.jsx` imports only `DefinitionPopover`, `twoYearBaseline`) and
`src/__tests__/marketWindowStatsViewOnly.test.js:66–69` (`FactTable.jsx`'s exact import list).
**Ruling: extend both allowlists, nothing else.** The guards exist to keep these view-only files off the
projection/scoring/in-season/api layers. `RankPair` and `weeklyRanks` are view-only display modules, and
neither file gains a forbidden specifier. Changes:
- `twoYearBaselineViewOnly.test.js`: the `TwoYearRank.jsx` expectation becomes
  `['../../utils/twoYearBaseline', './DefinitionPopover', './RankPair']`, and the test name gains `RankPair`.
  The `twoYearBaseline.js imports only ./environment` test is unchanged and must stay green (§1 adds no import).
- `marketWindowStatsViewOnly.test.js`: the `FactTable.jsx` expectation gains `'../../utils/weeklyRanks'` and
  `'../dp/RankPair'` (sorted), and the test name mentions the rank pair. The `factViews.js` exact list is
  unchanged (§4.4 adds no import), and the "never import the in-season modules, the api layer or
  marketWindowStats" test stays as is.
- This is a changed guard, not a behaviour test. Its red step: delete one of the new imports from the source
  file and see the guard fail on the mismatch, then revert. List both in the hand-back as deviations ruled here.

## Fix pass 1 (Session 1, 2026-11-26 — triage of implementation-reviewer round 1 on `64cb8b5`)

Round 1 (full, opus/high): one flag, `[untested]` — the new `rankPair` cell's `posRank == null` branch in
`src/components/market/FactTable.jsx` (renders `—`) is asserted by no test. Accepted; fixed here.

Item 1 — test only, no source change. In `src/components/market/Market.factViews.test.jsx`, add one test:
- **PR-3 (new) no prior-season row reads `—`.** `renderMarket({ liveSeasonUsable: true })` with the base
  fixture (no override), `pickWindow('2024')` → prior 2023, where `w4` has no row:
  `cellOf('Receiver Four', 'Prev rk').textContent` `toBe('—')`, and that cell has no
  `[data-testid="rank-pair"]` inside it. In the same window `cellOf('Receiver One', 'Prev rk').textContent`
  is still `'#1 · #1/g'`, so the dash is per row. Fails if an unranked row renders empty or a pair. Red step:
  in the `rankPair` branch replace the `—` span with `null` (the cell renders empty). See it fail, then revert.

Leave everything else alone. The pop-up dynasty tile's 2-yr wrap ("2-yr" / "QB20 · QB16/g") is **not** part
of this pass. Session 1 left it as specified for Anton to judge at sign-off: the line is ~119px, the tile has
116px at 1440 and 92px on phones, so forcing one line would push it past the tile edge on phones.

Done-definition for this pass: `npm test`, `npm run lint`, `npm run build` all clean. Commit by path as
"Fix pass 1: dual ranks slice C Prev rk empty cell test". Do not push.

## Verification

Session 1, 2026-11-26. Diff `a270684..df16b2d`, two commits:
- `64cb8b5 Dual position ranks on Market Prev rk and the 2-yr rank` (Session 2, sonnet);
- `df16b2d Fix pass 1: dual ranks slice C Prev rk empty cell test` (fix-applier).

**Plan review.** Round 1 (full, opus/high): 7 flags, all folded in before approval at Anton's direction (see
*Plan review*).

**Mid-implementation.** Session 2 stopped twice:
- Q1, the two exact-import guards. Ruled: extend both allowlists (see *Session 2 questions — decisions*).
- The pop-up dynasty-tile wrap. Ruled: commit as specified; Session 1 triages it.

**implementation-reviewer (full, opus/high) on `a270684..64cb8b5`.** One flag, `[untested]`: the Prev rk
`rankPair` cell's `—` branch had no test. Fixed by Fix pass 1 (PR-3). The reviewer also confirmed:
- fidelity and scope, with every deviation declared;
- CR-33: only `buildTwoYearRanks` and the private `twoYearTotalPoints` changed, and the four contract
  functions still match the data side;
- CR-18: one clause at `docs/signal-registry.md:45`;
- invariants: no App.jsx, state, TTL or dependency change, and no PROVISIONAL change;
- every specified assertion is made, and each named red step fails its test;
- the §8 closing greps are empty.

**Fix-pass re-review (light) on `64cb8b5..df16b2d`.** "No blocking issues found."

**Checks re-run by Session 1 at `df16b2d`:**
- `npm test`: 198 files, 3773 tests passed. The stderr stack trace is `playerIds.test.js`'s deliberate
  `idb down` case.
- `npm run lint`: 0 problems.
- `npm run build`: clean apart from the existing >500 kB chunk notice.
- PROVISIONAL count: 49 before, 49 after.
- The `2-yr avg` / `half that season's max games` / `FP/G position rank` grep over `src` and `docs` is empty.

**Red steps.** Session 2 covers each new or changed test on its named mutation, restored afterwards: TY-0,
TY-1 (i, ii), TR-1, TR-2 (i, ii), the QB case, LW-1, test 9, PR-1 (i, ii), PR-2, Market test 7, the
Portfolio and pop-up 2-yr cases, RP-1, RP-4, S-18, and both guards. The fix-applier covers PR-3.

**Smoke (Session 2, preview config).** Widths at 1440, before → after:
- Market Prev rk: 85.6 → 141.8px.
- My Team 2-YR RANK (starters / bench): 225.4 / 214.2 → 274.2 / 262.0px.

No other wrap or overlap, and no console errors in the retained log.

**Open smoke item, left for Anton.** The pop-up dynasty tile breaks the 2-yr line as "2-yr" / "QB20 · QB16/g".
The line is about 119px; the tile has 116px of room at 1440 and 92px on phones. Forcing one line would push it
past the tile edge on phones.

**Deviations:**
- Q1's guard allowlists.
- One renamed Market test title.
- The dropped sort line and unused import, both allowed.
- An extra `Market.jsx` consumer in `docs/nav/utils.md`.
- Two extra red steps.

**Cross-repo:** CR-33 and CR-18 touched as above. No data-side edit; index unchanged. **Backlog lines added:** none.
