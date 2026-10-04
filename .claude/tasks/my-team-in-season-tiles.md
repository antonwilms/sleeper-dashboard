# My Team header tiles follow the season phase (L1)

Session 1 (opus) task file, 2026-10-04. Item L1 of `future_plans/in-season-notes-plan.md` → "Leftovers
round". It finishes P5b's D6 ("header tiles unchanged"). Planned against app `cec846d` (clean tree,
`main` = `origin/main`) and data `caa738e`. Sonnet implements. **View-only: nothing here reaches
`playerRows`, `projectedPPG`, the dynasty score, a snapshot or a `factors` entry.** Live `/state/nfl`
at planning time: `{"week":4,"season":"2026","season_type":"regular","season_start_date":"2026-09-09",…}`,
so `seasonPhase` gives in-season with `lead: 'current-plus-ros'`.

## 0. Goal and fixed decisions

My Team's three header tiles (`Portfolio.jsx:766-838`) are fixed to last-vs-next:
`LINEUP PPG · {dataSeason}`, `PROJECTED · {projSeason}`, `GAMES MISSED · {dataSeason}`. In-season
they should show:
- the starting ten's `{liveSeason}` PPG so far, with its league rank;
- its rest-of-season projection, with its league rank;
- `{liveSeason}` games missed, plus who is out now.

The offseason layout stays byte-for-byte the same.

**D1 — "the starting ten's PPG so far" = each roster's best lineup by so-far PPG.** This is the
offseason tile 1 rule with the live season in place of `dataSeason`. Offseason tile 1 is
`ladderBy.Lineup.lastMine`, the `last`-side best lineup (best ten by `dataSeason` PPG). It is **not**
the Starting-ten table's ten (that is the `proj` side), and the summary sentence already calls it
"your starting ten". The in-season tile builds a third side, `live`, with the same `buildBestLineup`,
the same pool (current roster minus IR/taxi) and the same PPG rule (`fantasyPoints / gamesPlayed`,
`gamesPlayed > 0`, else `null`). It is ranked and medianed across the league like the other two
sides.
*Alternative for Anton (not built):* sum the so-far PPG of the table's ten (the ROS-picked ten). That
has no fair league rank: a starter with 0 games (rookie, injured) drops out of the sum as `null` and
pulls the team down, which reads as a performance figure when it is not. One-line follow-up if
wanted.

**D2 — the ROS tile appears only when ROS exists; otherwise today's `PROJECTED` tile.** In-season,
`seasonProjections[id].projectedPPG` *is* the rest-of-season posterior for ids carrying `inSeason`
(P5b D4). The `proj` lineup total is therefore already the ROS total, and `ladderBy.Lineup.projMine`
/ `projRank` / `projMedian` are reused unchanged. The tile reads `ROS · {liveSeason}` only when
`inSeasonLayout && liveRows != null && !rosMissing`. That is the same condition under which the
Starting ten shows ROS cells and neither footnote. In every other case (offseason, live file missing,
posteriors not computed) it renders **exactly today's** `PROJECTED · {projSeason}` tile, which is
still a true label for the number shown. "Omit rather than approximate" would put a `—` here, but the
projection is real data and the old label stays true, so the better choice is to keep showing it.

**D3 — the games-missed tile counts the live file's `weeklyStatus`.** In-season, the same ten
starters (`myLineup` slots, unchanged) are counted over the live season-totals rows, through the same
`buildAvailabilityGrid` (`'D'` = missed, `'P'` = played). The injury-status clause ("· 1 questionable
now") is live `playerMap` data and is unchanged in both layouts.
Checked in the data repo (`lib/sleeper.mjs:296-327,355-366`):
- Weeks not yet played stay `'X'`. A known future bye becomes `'B'`.
- During the Friday–Tuesday partial week, players whose team has not played yet are not in
  `teamsPlaying`, so they are marked `'B'`, not `'D'`. So the live count never shows a phantom
  missed game; at most the `of N` denominator trails by one game for those players until Tuesday.

**D4 — layout follows `lead`, cells follow data** (P5b D1). With the in-season layout and no usable
live file:
- tile 1 reads `—` with a sub-line saying so;
- tile 2 falls back per D2;
- tile 3 reads `—` and keeps its injury clause.

Week 1, the playoffs (`post`) and an unknown phase keep today's tiles. P5b's season-lag note already
covers `post`.

**D5 — out of scope** (reported in §7):
- the summary sentence (it still says "last season … Projected … for 2026");
- League ladders and Weakest slots;
- the Starting-ten and Bench tables (P5b);
- `buildPositionLadders`;
- `App.jsx` (Portfolio already receives `nflState` and `liveSeasonTotals`, `App.jsx` P5b lines).

**D6 — no registry text edit** (as P3/P4/P5b). D-58 is still open. This slice queues its CR-21/CR-02
additions there. `docs/signal-registry.md` is app-owned and **is** edited (§5).

## 1. Findings against live source (2026-10-04, `cec846d`)

1. **Tiles** (`Portfolio.jsx`). They render inside an IIFE at `:764-838`:
   - tile 1 `:769-789` (`L.lastMine`/`lastRank`/`lastMedian`);
   - tile 2 `:791-820` (`L.projMine`/`projRank`/`projMedian`, plus `± on last year` when `L.lastMine`
     is present);
   - tile 3 `:822-837` (from the `gamesMissedTile` memo `:573-597`).

   `rankClass` and `thirdForTiles` are at `:570-571`. `f1` is at `:495`.
2. **Phase state already in Portfolio** (P5b):
   - `phase`, `inSeasonLayout`, `phaseLiveSeason` (`:298-307`);
   - `liveRows` (`:309-310`): `liveSeasonTotals.players`, only when its `season === phaseLiveSeason`.
     App passes the file only when `liveSeasonUsable`.
   - `rosMissing` (`:419-420`).
   - `leagueLineups` memo (`:314-317`), `ladders`/`ladderBy` (`:318-319`), `myLineup` (`:323-326`).

   Everything the tiles need is in scope. No new prop is needed.
3. **`lineup.js`** (350 lines, leaf module, imports nothing):
   - `buildLeagueLineups` (`:169-198`) returns `{rosterId, teamName, last, proj}`. `lineup.test.js`
     test 17 (`:265-274`) asserts **exactly** those four keys. So the new `live` side must be present
     only when live rows are passed.
   - `sortByValueDesc`, `rankMap` and `median` are module-private (`:200-233`, `:21-26`).
   - Callers of `buildLeagueLineups`: `Portfolio.jsx` only (plus tests and the guard).
4. **Live rows carry `weeklyStatus`.** `rescoreSeasonTotals` spreads the served row
   (`sleeperStats.js:340-348`), so `weeklyStatus` survives. `buildAvailabilityGrid(careerStats, id,
   seasons)` reads `careerStats[season][id].weeklyStatus`, so `{ [phaseLiveSeason]: liveRows }` is a
   valid first argument.
5. **Guard.** `src/__tests__/lineupViewOnly.test.js:34` forbids a fixed list of `lineup.js` export
   names in pipeline modules. The new export is added to that list (§4). This only makes the guard
   stricter.
6. **Registry.**
   - CR-02's Triggers name Portfolio's "`GAMES` strip / `GAMES MISSED` tile — served `weeklyStatus`
     via `buildAvailabilityGrid`" (`docs/cross-repo-registry.md:60`). The tile now also reads the
     live file's `weeklyStatus`.
   - CR-21's App side gets Portfolio from P5b's queued D-58 text; this slice widens what it reads.
   - The registered `Portfolio.jsx` anchors (`:274`, `:300,304`, `:350`, `:606,851,975`, all already
     stale and queued for re-derivation on D-58) shift again.
   - Signal registry rows `:45` and `:117` name My Team's readers, so CR-18 fires (§5).

## 2. `src/utils/lineup.js`

### 2.1 `buildLeagueLineups` gains an optional `live` side

Signature: `buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions, season, liveRows = null })`.

Inside the per-team map, replace the body of `lastPoints` with a shared helper (same rule, no
behaviour change for `last`):

```js
    const ppgOf = (rows, player) => {
      const d = rows?.[player.player_id]
      if (d && d.gamesPlayed > 0 && Number.isFinite(d.fantasyPoints)) return d.fantasyPoints / d.gamesPlayed
      return null
    }
    const lastPoints = player => ppgOf(careerStats?.[season], player)
```

Return:

```js
    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      last: buildBestLineup(pool, rosterPositions, lastPoints),
      proj: buildBestLineup(pool, rosterPositions, projPoints),
      // In-season only (my-team-in-season-tiles.md): best lineup by the live season's PPG so far.
      ...(liveRows != null ? { live: buildBestLineup(pool, rosterPositions, player => ppgOf(liveRows, player)) } : {}),
    }
```

`liveRows` is a `{ [player_id]: { gamesPlayed, fantasyPoints, … } }` map (the live season-totals
`players`). Same pool as `last`/`proj`.

### 2.2 New export `lineupStanding`

Place it directly after `buildPositionLadders`:

```js
// One side's `Lineup` standing — my total, its competition rank and the league median — by the same
// rules as buildPositionLadders' `Lineup` row, for any side (`last`, `proj`, or `live` when present).
// A lineup without that side counts as a null total.
export function lineupStanding(leagueLineups, side, myRosterId) {
  if (!leagueLineups || leagueLineups.length === 0) return { mine: null, rank: null, median: null }
  const values = leagueLineups.map(l => ({ rosterId: l.rosterId, value: l[side]?.total ?? null }))
  const ranks = rankMap(sortByValueDesc(values))
  const found = values.some(v => v.rosterId === myRosterId)
  return {
    mine: found ? values.find(v => v.rosterId === myRosterId).value : null,
    rank: found ? ranks.get(myRosterId) : null,
    median: median(values.map(v => v.value)),
  }
}
```

Do not refactor `buildPositionLadders` to call it. Agreement is proven by a test (§6.1, L-3).

Header comment of the file: no change (it still imports nothing).

## 3. `src/components/portfolio/Portfolio.jsx`

### 3.1 Imports and memos

- Add `lineupStanding` to the existing `../../utils/lineup` import.
- `leagueLineups` memo (`:314-317`): pass `liveRows: inSeasonLayout ? liveRows : null` and add
  `inSeasonLayout, liveRows` to its deps. `liveRows` and `inSeasonLayout` are defined above it (`:306`,
  `:309`), so no reordering is needed.
- Directly after `rosMissing` (`:419-420`) add:

```js
  // L1 — the tiles' in-season state. ROS tile only where the Starting ten shows ROS (D2).
  const rosTileReady = inSeasonLayout && liveRows != null && !rosMissing
  const liveStanding = useMemo(
    () => (inSeasonLayout && liveRows != null ? lineupStanding(leagueLineups, 'live', myRosterId) : null),
    [inSeasonLayout, liveRows, leagueLineups, myRosterId]
  )
```

(`rosMissing` is a plain `const`, not a memo, and stays one.)

### 3.2 `gamesMissedTile` memo (`:573-597`)

Replace the starter loop so it counts the live file in-season and `careerStats[dataSeason]`
otherwise:

```js
    const liveTile = inSeasonLayout
    const season = liveTile ? phaseLiveSeason : dataSeason
    for (const id of starterIds) {
      let weeks
      if (liveTile) {
        // No row, or a row without the status array, has no games line (offseason: `f.weeks === null`).
        if (!Array.isArray(liveRows?.[id]?.weeklyStatus)) continue
        weeks = buildAvailabilityGrid({ [phaseLiveSeason]: liveRows }, id, [phaseLiveSeason]).rows[0].weeks
      } else {
        const f = factsFor(id)
        if (f.weeks === null) continue
        weeks = f.weeks
      }
      any = true
      missedSum += weeks.filter(w => w === 'D').length
      totalSum += weeks.filter(w => w === 'P' || w === 'D').length
    }
```

- The offseason branch's arithmetic is identical to today: `f.played + f.missed` is exactly the
  P + D count.
- The injury clause block is unchanged.
- Return `{ value, of, injuryClause, L, season }`.
- Add `inSeasonLayout, liveRows, phaseLiveSeason, dataSeason` to the deps.
- When `liveTile && liveRows == null`, every starter is skipped, so `value`/`of` are `null`. That is
  intended (D4).

### 3.3 Tile JSX (`:764-838`)

All three keep their container and value `data-testid`s (`tile-lineup-last`/`-value`,
`tile-lineup-proj`/`-value`, `tile-games-missed`/`-value`) and their classes. Literal text fragments
that sit beside an expression are written as JS strings, not bare JSX text, as the summary sentence
does, so the exact-text assertions hold.

**Tile 1.** Branch on `inSeasonLayout`.
- **`false`:** today's JSX, untouched.
- **`true`:**
  - Label: `` `LINEUP PPG · ${phaseLiveSeason ?? '—'} SO FAR` ``.
  - If `liveStanding?.mine != null`: the value `f1(liveStanding.mine)` (same span classes as today).
    Then, when `liveStanding.rank != null`, the ordinal with `rankClass(liveStanding.rank)`. Then,
    when `liveStanding.median != null`, the sub-line `` `league median ${f1(liveStanding.median)}` ``.
  - Else: the muted `—` value span (same as today's null branch). Then, only when
    `liveRows == null`, the sub-line (same `text-[11px] text-dp-muted mt-[3px]` div)
    `` `no ${phaseLiveSeason ?? '—'} season data loaded` ``.

**Tile 2.** Branch on `rosTileReady`.
- **`false`:** today's JSX, untouched. This covers the offseason and the in-season fallback (D2).
- **`true`:**
  - Label: `` `ROS · ${phaseLiveSeason ?? '—'}` ``.
  - Value and rank exactly as today's tile 2 (`L.projMine`, `L.projRank`, `text-dp-up-text`, and the
    `—` branch when `L?.projMine == null`).
  - Sub-line, when `L.projMedian != null`: `` `league median ${f1(L.projMedian)}` ``. When also
    `liveStanding?.mine != null`, follow it with
    `` ` · ${L.projMine - liveStanding.mine >= 0 ? '+' : '−'}${f1(Math.abs(L.projMine - liveStanding.mine))} on ${phaseLiveSeason} so far` ``.
    The minus is U+2212, as today.
  - **Never** the `on last year` clause in this branch.

**Tile 3.** One change: the label becomes `` `GAMES MISSED · ${gamesMissedTile.season ?? '—'}` ``.
Everything else is unchanged (value, `of N`, `by your ten starters{injuryClause}`).

No other JSX changes. `PROVISIONAL(` inventory unchanged.

## 4. Guard

`src/__tests__/lineupViewOnly.test.js:34`: add `lineupStanding` to the alternation:
`/buildBestLineup|buildLeagueLineups|buildPositionLadders|buildWeakestSlots|buildSlotMedians|startingBar|lineupStanding/`.
No other edit.

## 5. Docs (same commit)

- **`docs/ui.md:77-80`.** After the sentence ending `…never captured).`, add:
  > In-season (`seasonPhase` lead `current-plus-ros`) the tiles read `LINEUP PPG · {liveSeason} SO FAR` (each roster's best lineup by so-far PPG from the live season-totals rows — `buildLeagueLineups`'s `live` side — ranked with `lineupStanding`), `ROS · {liveSeason}` (the `proj` lineup total, which in-season is the rest-of-season projection, with a `± on {liveSeason} so far` delta) only where the Starting ten shows ROS (otherwise the `PROJECTED` tile above), and `GAMES MISSED · {liveSeason}` counted from the live rows' `weeklyStatus`; with no usable live file the first and third read `—`.
- **`docs/nav/components.md:15`** (`portfolio/Portfolio.jsx` row). After the clause `…any other lead keeps the last-vs-next columns;` insert:
  > the three header tiles follow the same rule (in-season: `LINEUP PPG · {liveSeason} SO FAR` from `lineup.js`'s `live` side via `lineupStanding`, `ROS · {liveSeason}` when the Starting ten shows ROS, `GAMES MISSED · {liveSeason}` from the live rows' `weeklyStatus`);
- **`docs/nav/utils.md:71`** (`lineup.js` row).
  - Replace `` `buildLeagueLineups` (every roster × `last` = `careerStats[season]` PPG and `proj` = `seasonProjections[id].projectedPPG`; `` with `` `buildLeagueLineups` (every roster × `last` = `careerStats[season]` PPG and `proj` = `seasonProjections[id].projectedPPG`, plus `live` = the `liveRows` PPG so far when that optional argument is passed; ``.
  - After the `buildPositionLadders (…)` parenthetical, insert `` `lineupStanding(leagueLineups, side, myRosterId)` (one side's `Lineup` total, rank and median by the same rules — My Team's in-season tiles), ``.
- **`docs/nav/utils.md:51`** (`availabilityGrid.js` row). Append (the row already omitted Portfolio's existing `GAMES` strip): `` Also `portfolio/Portfolio.jsx`'s `GAMES` strip and `GAMES MISSED` tile, over `careerStats[dataSeason]` or, in-season (the tile), the live season-totals rows. ``
- **`docs/signal-registry.md:45`** (fantasy scoring core), end of the Current-use cell. After `…read the same two for the so-far PPG, games played and total-points position rank (view-only)` add:
  > ; its in-season header tiles read the same two for each roster's best so-far lineup (`lineup.js`'s `live` side) and the live rows' `weeklyStatus` for `GAMES MISSED` (view-only)
- **`docs/signal-registry.md:117`** (best-lineup aggregates).
  - Source cell: after `` `seasonProjections[id].projectedPPG`, `` insert `` and, in-season, the live season-totals rows' PPG so far (`live` side, my-team-in-season-tiles.md), ``.
  - Coverage cell (live text has inner backticks): ``last completed season in `careerStats` + current projection only`` → ``last completed season in `careerStats` + current projection, plus the live season so far in-season``.
  - Current-use cell: `Lineup tiles` → `Lineup tiles (in-season: so-far and ROS)`.
- All edits state mechanism, never availability (`docsAvailabilityClaims.test.js`). No `CLAUDE.md`
  change.

## 6. Tests

### 6.1 `src/utils/lineup.test.js`

Add `lineupStanding` to the import. New `describe('live side and lineupStanding (L1)')` at the end:

- **L-1 `live` side present only with `liveRows`.**
  - Reuse test 14's single-team shape with `liveRows = { p1: { fantasyPoints: 30, gamesPlayed: 2 } }`.
    Then `result[0].live.slots[0].points === 15` and `Object.keys(result[0]).sort()` equals
    `['last', 'live', 'proj', 'rosterId', 'teamName']`.
  - Without `liveRows` the keys are the four (test 17 stays unedited and green).
- **L-2 live PPG rule.** `liveRows = { p1: { fantasyPoints: 50, gamesPlayed: 0 } }` with p2 absent.
  Then every `live` slot's `points` is `null` (test 15's rule, on the live side).
- **L-3 agreement with `buildPositionLadders`.** On the `buildPositionLadders` describe's 12-team
  fixture (move `leagueLineups` there into scope, or rebuild it identically in the new describe),
  for rosterIds 1, 6 and 11:
  - `lineupStanding(lls, 'last', id)` deep-equals `{ mine: L.lastMine, rank: L.lastRank, median: L.lastMedian }`;
  - the same for `'proj'`;
  - where `L` is that roster's `Lineup` ladder.
- **L-4 missing side and missing roster.**
  - `lineupStanding(lls, 'live', 1)` on lineups built without `liveRows` gives
    `{ mine: null, rank: null, median: null }`.
  - `lineupStanding(lls, 'last', 999)` gives `mine`/`rank` `null` and `median` equal to the ladder's
    `lastMedian`.
  - `lineupStanding([], 'last', 1)` gives all three `null`.

### 6.2 `src/components/portfolio/Portfolio.test.jsx`

**In `describe('Fixture S')`**, add a live file built from Fixture S's teams. Every player gets
`gamesPlayed: 3`, `fantasyPoints: ppg × 3` and `weeklyStatus: WK(['P','P','P'])`, where
`const WK = s => [...s, ...Array(18 - s.length).fill('X')]`. My Team's RB and TE are the exceptions:

| team | QB | RB | WR | TE | live total |
|---|---|---|---|---|---|
| My Team (1) | 24 | 12 (gp 2, fp 24, `P,P,D`) | 16 | 8 (gp 1, fp 8, `P,D,D`) | **60.0** |
| Team 2 | 21 | 14 | 15 | 9 | 59.0 |
| Team 3 | 15 | 10 | 9 | 5 | 39.0 |
| Team 4 | 14 | 8 | 10 | 12 | 44.0 |

Live median = (59 + 44) / 2 = **51.5**. My rank is **1st**. Ids are `${rosterId}-${pos}` (as
`buildFixtureS`). `REG_WK4 = { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }`,
`LIVE_S = { season: 2026, complete: true, players }`.

`scoredS` = `buildFixtureS()`'s `seasonProjections` with
`'1-QB': { projectedPPG: 25, inSeason: { n: 3, ros: { prior: 24, weight: 0.3, value: 25 } } }`.
Its `projectedPPG` stays 25, so the `proj` side keeps 56.0 / 3rd / median 56.5.

1. **S-L1 in-season tiles.** `nflState={REG_WK4}`, `liveSeasonTotals={LIVE_S}`,
   `seasonProjections={scoredS}`.
   - `tile-lineup-last` contains `LINEUP PPG · 2026 SO FAR`; its value testid's text is `60.0`; it
     contains `1st` and `league median 51.5`; it does **not** contain `49.0`.
   - `tile-lineup-proj` contains `ROS · 2026`; its value is `56.0`; it contains `3rd` and
     `league median 56.5 · −4.0 on 2026 so far`; it does not contain `on last year` or `PROJECTED`.
   - `tile-games-missed` contains `GAMES MISSED · 2026`; its value is `3`; it contains `of 12`.
2. **S-L2 ROS not computed: tile 2 falls back.** As S-L1 but with plain `seasonProjections` (no
   `inSeason`). `tile-lineup-proj` contains `PROJECTED · 2026` and
   `league median 56.5 · +7.0 on last year`, and not `ROS ·`. Tile 1 still reads `60.0`.
   `ros-missing-note` is present.
3. **S-L3 live file missing.** `REG_WK4`, `liveSeasonTotals={null}`, `scoredS`.
   - Tile 1 contains `LINEUP PPG · 2026 SO FAR`, value `—`, and `no 2026 season data loaded`.
   - Tile 2 contains `PROJECTED · 2026`.
   - Tile 3 contains `GAMES MISSED · 2026`, value `—`, and not `of `.
4. **S-L4 week 1 keeps today's tiles.** `nflState={{ ...REG_WK4, week: 1 }}` with `LIVE_S` and
   `scoredS`. The tiles equal test 12's text: tile 1 contains `LINEUP PPG · 2025`, `49.0`, `2nd`,
   `league median 46.0`; tile 2 contains `PROJECTED · 2026`, `league median 56.5 · +7.0 on last year`;
   tile 3 contains `GAMES MISSED · 2025`.

**In `describe('Fixture M')`**, after P5b-10:

5. **S-L5 injury clause survives in-season; no status array, no count.** Render `inSeasonProps`.
   `tile-games-missed` contains `GAMES MISSED · 2026` and `1 questionable now`. Its value testid's
   text is `—`, and the tile does not contain `of `. Fixture M's `LIVE` rows (w1/w2) carry no
   `weeklyStatus`, so no starter has a games line. This fails if the skip rule is
   `liveRows?.[id] === undefined`, which would render a false `0 of 0`.

Existing tests 5, 12, `F2-2` and every P5b test must stay green **unedited**. If one needs an edit,
stop and report.

## 7. Findings for Anton (reported, not acted on)

1. **Tile 1 and the table use different tens** (D1). Tile 1 is each roster's best ten *so far*; the
   Starting-ten table is the best ten *for the rest of the season*. The offseason tiles have always
   worked this way (best by last season vs best projected). It is more visible in-season. The
   alternative is in D1.
2. **Small samples.** A player with one game counts at that game's PPG in the so-far lineup, the same
   rule as offseason tile 1 (no games floor).
3. **Still last-vs-next:** the summary sentence and League ladders. They are candidates for the next
   leftover if wanted.
4. **So-far data trails `/week` by up to one refresh** (P5b §7.1). Tile 1 and tile 3 read the
   data-store file (Fri/Mon/Tue 06:13 UTC).

## 8. Touch list, done-definition, commit

Touch list, exactly:
- `src/utils/lineup.js` (§2)
- `src/utils/lineup.test.js` (§6.1)
- `src/components/portfolio/Portfolio.jsx` (§3)
- `src/components/portfolio/Portfolio.test.jsx` (§6.2)
- `src/__tests__/lineupViewOnly.test.js` (§4, one regex)
- `docs/ui.md`, `docs/nav/components.md`, `docs/nav/utils.md`, `docs/signal-registry.md` (§5)
- `.claude/tasks/data-repo-backlog.md` (one D-58 bullet, Cross-repo impact)
- this task file (commit it)

Not touched: `src/App.jsx`, `seasonPhase.js`, `availabilityGrid.js`, `weeklyRanks.js`,
`inSeasonScoring.js`, `inSeasonEvidence.js`, `LeagueLadders.jsx`, `WeakestSlots.jsx`, `CLAUDE.md`,
`docs/cross-repo-registry.md`.

Done-definition (CLAUDE.md):
- `npm test` green.
- `npm run lint` 0 problems.
- `npm run build` clean, no new warnings (the Vite chunk-size notice predates this).
- No contract tests apply.
- `wc -l src/App.jsx` unchanged.
- `git diff cec846d -- src/App.jsx` empty.
- `grep -rn "PROVISIONAL(" src/components/portfolio/Portfolio.jsx src/utils/lineup.js` unchanged from
  `cec846d`.

**Smoke** (the `.claude/launch.json` preview, Anton's league per `docs/architecture.md` → *Smoke-testing
the running app*): open My Team. It is in-season (week 4–5 of 2026).
- Report the three tiles' full text.
- At 1280px and 1440px width, confirm the tiles are not starved or overlapping. A wrapped tile label
  is acceptable; say whether it wraps.
- Cross-check tile 2's value against today's (it should be the same number as before this change,
  relabelled).
- Cross-check tile 3's count against the Starting ten's `{liveSeason} so far` games column (the sum of
  games played should equal the tile's `of N` minus its missed count, for starters with a live row).

Commit: one code commit, message `My Team header tiles follow the season phase: so-far lineup PPG, ROS,
games missed (L1)`, with the attribution trailer. Push only after Session 1 verification (CLAUDE.md
step 9).

## Review record — plan gate round 1 (2026-10-04)

plan-reviewer: 8 flags (1 medium, 1 low-medium, 6 low). I checked each against live source and applied
all of them.
- Flag 1's data-side claim was checked by Session 1 in the data repo (`lib/sleeper.mjs:296-327`: a
  `gp 0` row is `'B'` when its team is not in `teamsPlaying`, else `'D'`; `:355-366` fill only `'X'`
  slots with byes). The reviewer cannot read the sibling.

| # | Flag | Decision |
|---|---|---|
| 1 | (medium) The tile depends on the partial week never being `'D'`, but the plan recorded this in CR-02 Triggers, which the data reviewer does not read | Applied: queued as a CR-02 Invariant + Mirror addition; the Triggers clause names the artifact only |
| 2 | (low-medium) P5b's CR-21 Mirror replacement (b) does not name the tiles | Applied: (b) amended too |
| 3 | (low) Mirror not quoted verbatim for every touched entry; the CR-21 quote dropped its last sentence | Applied: all five quoted in full below |
| 4 | (low) Guard regex at `lineupViewOnly.test.js:34`, not `:36` | Applied |
| 5 | (low) Row spread at `sleeperStats.js:340-348` | Applied |
| 6 | (low) signal-registry `:117` Coverage find string lacked inner backticks | Applied |
| 7 | (low) A live row without `weeklyStatus` rendered a false `0 of 0` | Applied: skip on `!Array.isArray(weeklyStatus)`; S-L5 asserts `—` |
| 8 | (low) `utils.md:51` also omitted the existing `GAMES` strip | Applied |

## Cross-repo impact

Touched contracts:
- **CR-21** and **CR-02**: new readers, with an Invariant/Mirror addition queued.
- **CR-01** and **CR-16**: anchors only.
- **CR-18**: app-owned row edits (§5).

No contract shape changes. **No registry text edit in this slice** (D6). The data repo has nothing to
do beyond the next registry byte-sync. Session 2 appends one bullet to D-58 in
`.claude/tasks/data-repo-backlog.md`, directly after the P5c bullet:

> - Also pending from L1 (my-team-in-season-tiles.md, `<sha>`):
>   - **CR-21 App side and Triggers.** Extend P5b's queued Portfolio clause:
>     - Portfolio also reads `weeklyStatus` off the live rows for the in-season `GAMES MISSED` tile.
>     - It passes the live rows to `buildLeagueLineups` (`src/utils/lineup.js`, its `liveRows`
>       argument → the `live` side; reads `gamesPlayed`/`fantasyPoints`), ranked by `lineupStanding`.
>     - Add `buildLeagueLineups`'s `liveRows` argument to Triggers.
>   - **CR-21 Mirror.** Amend both of P5b's queued replacements:
>     - (a) "My Team's in-season columns" → "My Team's in-season columns and header tiles".
>     - (b) The added sentence becomes: "Portfolio's in-season columns and header tiles
>       (my-team-in-season-columns.md, my-team-in-season-tiles.md) do read this file, so a stopped
>       job leaves their so-far PPG, games, rank, so-far lineup PPG and games-missed count silently
>       stale."
>   - **CR-02 Triggers.** The Portfolio clause "(`GAMES` strip / `GAMES MISSED` tile — served
>     `weeklyStatus` via `buildAvailabilityGrid`, …" gains "; in-season the `GAMES MISSED` tile reads
>     the live season-totals rows' `weeklyStatus` the same way".
>   - **CR-02 Invariant and Mirror.** Append to both: "Since my-team-in-season-tiles the app counts
>     `'D'` in the live (in-progress) file's `weeklyStatus` as a missed game. A player whose team has
>     not yet played the partly played current week must be marked `'B'`/`'X'`, never `'D'`, or My
>     Team's GAMES MISSED tile shows phantom misses with no app-side diff." (Data side today:
>     `aggregateWeeks` marks such a `gp 0` row `'B'` because its team is not in `teamsPlaying`.)
>   - **CR-01 / CR-02 / CR-16.** Re-derive every `portfolio/Portfolio.jsx` anchor (`:274`,
>     `:300,304`, `:350`, `:606,851,975`). They are already queued above, and this slice shifts
>     them again.
>   - Data side: no action beyond the byte-sync. The data reviewer checks the new CR-02 Invariant
>     sentence against `aggregateWeeks`.

**What each entry gets.**
- **CR-21** (in-progress season-totals reads): a new view-only read of the live file — per-player
  `gamesPlayed`/`fantasyPoints` (the so-far lineup) and `weeklyStatus` (missed games). It reads
  per-player values, never a league-wide max, so it does not infer weeks complete.
- **CR-02** (season-totals row composition): a second reader of served `weeklyStatus`, on the live
  season, through the same `buildAvailabilityGrid`. It depends on the partial-week marking (Invariant
  addition above).
- **CR-01 / CR-16**: anchors only. The `buildLeagueLineups` call (CR-01's `Portfolio.jsx:274`) gains
  one argument; what it reads from the scored map is unchanged.
- **CR-18** (signal registry rows): app-side row edits are made in this slice (§5); no data-repo action.

Current Mirror texts, quoted verbatim from `docs/cross-repo-registry.md`:

- **CR-21** (In-progress season-totals reads): "If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell in Market's In-season column set or the in-season seam** — it will read a half-season's rates as though they were a season's, with no error and no test failure. Since defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows on them at all. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel. **Since in-season-evidence-2b-2 a mis-marked or stale in-progress file also moves displayed projections and veterans' and rookies' dynasty scores, silently** — `gamesPlayed` counting inactive weeks over-weights every posterior. **Since season-totals-cadence.md (2026-10) the job runs Friday, Monday and Tuesday mornings, so between Friday and Tuesday the file holds a partly played current week under the same `inProgress: true` marking** — teams that have played it carry one more `gamesPlayed` than teams that have not. Per-player readers (the posteriors' own `n`) read this correctly; the league-max reader (Market's "up to N games played") reports the leading teams' count. A new reader that infers "weeks complete" from a league-wide max `gamesPlayed` will be one week early from Friday to Tuesday. Points allowed no longer read this file (defence-numbers-rebuild). **Since qb-takeover-wiring** a modelled QB's ROS evidence is his starts from Sleeper's weekly rows, so a stale or mis-marked file moves neither those QBs' ROS rate nor their points-so-far total."
- **CR-02** (season-totals row composition): "A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry. **Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim** (the pop-up's Game log `PTS` and Distribution histogram) and labels them half-PPR from the row's served `scoringBasis`: changing the basis `weeklyPoints` is written on — D-47 included — without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test."
- **CR-01** (Projection snapshot envelope): "State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. Since in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back), so the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys need no change. Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version. **qb-takeover-wiring:** additive keys, no version bump. A grader must not score a `qbTakeoverBasis: 'chain'` row's `projectedPPG` against realised PPG per game played — grade it on total points or segment it (`grading/anchor-policy.md` boundary 5); the same holds for an `inSeason.ros` that carries `start`. **rookie-qb-starter-level:** additive key `qbStarterBasis`, no version bump. A `yearsExp` 0 QB's `qbStarterPPG`, a rookie `chain` row's `projectedPPG`/`projectedTotalPts`, and rookie QBs' `inSeason` `next.prior`/`start.starterPrior` move at `grading/anchor-policy.md` boundary 6 — segment them across it, detected by `qbStarterBasis`. `scripts/qb-rookie-level-run.mjs`'s live-level comparison is meaningful only on a pre-boundary snapshot (it pins 2026-10-03)."
- **CR-16** (Era-accurate team-code remap): "A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers."
- **CR-18** (Signal registry rows): "This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable."
