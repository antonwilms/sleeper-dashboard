# My Team in-season columns — the season-phase rule's first adopter (P5b)

Session 1 (opus) task file, 2026-10-03. Package P5 part (b) of `future_plans/in-season-notes-plan.md`,
plus that file's "P5b addition" (ranking basis). Planned against app `fe89736` (clean tree, `main` =
`origin/main`) and data `bf697a5`. Sonnet implements. **View-only: nothing here reaches `playerRows`,
`projectedPPG`, the dynasty score, a snapshot or a `factors` entry.** Live `/state/nfl` at planning
time: `{"week":4,"season":"2026","season_type":"regular","season_start_date":"2026-09-09",…}` →
`seasonPhase` = in-season, `lead: 'current-plus-ros'`, 3 completed weeks.

**Approved by Anton 2026-10-03** with Session 1's picks on both open calls: D5 = today's layout + lag note; D2 = POS RANK cell rank-only (no PPG inside the cell).

## 0. Goal and fixed decisions

My Team's Starting ten and Bench tables are hard-wired to "last season → next season"
(`{dataSeason} → {projSeason} PPG`, `POS RANK`, `GAMES {dataSeason}`). Mid-season the questions are
different: what did he do last year, what is he doing this year, and what is he expected to do for the
rest of it. This slice makes the two tables follow P5a's `seasonPhase` rule: in-season they show
**{dataSeason} actual · {phaseLiveSeason} so far · ROS**, otherwise today's layout. It also switches My
Team's position rank from PPG to total points (Anton's P5b addition — `/week` already ranks by total
points).

**D1 — layout follows `lead`, cells follow data** (P5a §6.4 adoption guidance).
- `phase?.lead === 'current-plus-ros'` → the **in-season layout** (§3). This holds even when the live
  file is unusable: the cells then read `—` and a note says why (§3.6). Never fall back silently.
- Anything else (`last-vs-next`, or `seasonPhase` returned `null`) → **today's layout**, unchanged
  except D2's rank basis. Week 1 (0 completed weeks) and the NFL playoffs land here by P5a's D2/D3.
- Labels are data-true: the last-season column is `dataSeason` (what `careerStats` actually holds),
  the live column is `phase.liveSeason`. Never relabel `dataSeason` data with `lastCompleteSeason`
  (P5a D5).

**D2 — POS RANK is by total league-scored points, everywhere on My Team.** Reuse `/week`'s
`weeklyRanks.js` (`rankByTotalPoints` + `seasonPointsFromCareer`): competition ranking, same scoring,
same population rules. In today's layout the POS RANK cell stays rank-only (`WR12`) — the PPG it should
sit beside is already the adjacent PPG column. In the in-season layout rank and PPG share one cell
(§3.3). *If Anton wants PPG inside the rank cell too, it is a one-line follow-up.*

**D3 — "so far" reads the data-store live season file, not Sleeper's weekly rows.** Source:
`currentSeasonTotals` (league-rescored, the same file the ROS posterior is built from), passed to
Portfolio **only when App's existing `liveSeasonUsable` holds**. Sleeper's weekly rows are loaded by
`useWeeklyDecision`, which is route-scoped to `/week`; loading them for My Team is a new loader, out
of scope. Consequence (reported, §7.1): My Team's "so far" can trail `/week`'s current-season rank by
up to one refresh (the file refreshes Fri/Mon/Tue 06:13 UTC), and between Friday and Tuesday a
total-points rank compares players whose teams have and have not played the current week.

**D4 — ROS is the scored projection, shown only where an in-season record exists.** `ROS` =
`seasonProjections[id].projectedPPG` (the scored map App passes — `projectedPPG` *is* the
rest-of-season posterior for ids carrying `inSeason`, `inSeasonScoring.js:302-316`), rendered only
when `seasonProjections[id].inSeason` exists, with ` · NN%` = `Math.round(inSeason.ros.weight * 100)`.
`Δ` = `inSeason.ros.value − inSeason.ros.prior` (Market's In-season Δ, `Market.jsx:1013`). No record →
`—` in both (Market's ROS cell does the same). Portfolio never receives `scoringPosteriors` — the seam
guard (`inSeasonEvidenceViewOnly.test.js:114-132`) allows it only on `<Market`; the `inSeason` key on
the scored projection is the public route (`PlayerDetailModal.jsx:287-293`, `weeklyOwnProjection.js`
read it the same way).

**D5 — the season-lag window gets today's layout plus a note.** In the NFL playoffs (`post`) and in
the pre-rollover offseason, `phase.lastCompleteSeason > dataSeason`: the season just played is not in
`careerStats` (built `s < parseInt(nflState.season)`, `sleeperStats.js:395`), and no next-season
projection exists until it is. Recommendation (applied here): keep today's layout — its labels
(`{dataSeason} → {projSeason}`) are true to the data shown — and add one note line naming the lag
(§4). Alternative for Anton: show the finished season's actuals from the live file instead, with the
next-season column blank until rollover. Not reachable before January 2027; revisit then.

**D6 — scope is the two tables.** Header tiles (`LINEUP PPG · {dataSeason}`, `PROJECTED ·
{projSeason}`, `GAMES MISSED`), the summary sentence, League ladders, Weakest slots and Team offences
are **unchanged** (§7.3 lists them as follow-ups). No change to lineup selection (`buildLeagueLineups`
still picks on `projectedPPG`) or bench order.

**D7 — no registry text edit** (as P3/P4). The registry is byte-mirrored (CR-24) and D-57 is still
open at its 16-line gate. This slice emits its Mirror text (in the Cross-repo impact section) and
queues trigger additions on D-58. `docs/signal-registry.md` is app-owned (CR-18 direction data→app)
and **is** edited.

## 1. Findings against live source (2026-10-03)

1. **Portfolio today** (`src/components/portfolio/Portfolio.jsx`, 999 lines): `dataSeason =
   deriveDataSeason(careerStats)` (`:270`), `projSeason = dataSeason + 1` (`:271`). `rankByPos`
   (`:290-297`) = `rankPositionSeason(careerStats[dataSeason], playerMap, pos)` — **ranks by PPG**
   (`seasonRanks.js:1-12`); `playerFactsById` (`:308-342`) takes both `last` (PPG) and `posRank` from
   it. Starting-ten header row `:793-813` (12 columns), empty-slot row `:817-833`, filled row `:835-854`,
   footnote `:860-873`; Bench header row `:919-940` (12 columns), pick row `:944-961`, player row
   `:963-980`, empty-state `colSpan={12}` `:984`. Neither table is sortable.
2. **What Portfolio already receives.** `seasonProjections={scoredSeasonProjections}`
   (`App.jsx:1413`) — so the PPG pair's lower bar and `PROJECTED · 2026` are already the ROS
   posterior today, just labelled "projected". It does **not** receive `nflState` or
   `currentSeasonTotals` (`App.jsx:1409-1430`).
3. **Import guards that shape D3/D4.** Only `App.jsx` and `api/frozenPrior.js` may import
   `inSeasonScoring` (`inSeasonEvidenceViewOnly.test.js:102-108`); only `market/Market.jsx` may import
   `inSeasonEvidence` (`:50-63`); `scoringPosteriors` may appear in `App.jsx` only in its memo, the
   scored-projection memo, the snapshot effect and the `<Market` element (`:114-132`). So Portfolio
   cannot call `usableLiveSeason` or `buildInSeasonPosteriors`; App gates the prop instead, with the
   `liveSeasonUsable` memo it already has (`App.jsx:227-229`). No guard restricts which elements get
   `currentSeasonTotals` (checked `currentSeasonTotalsIsolation.test.js` in full).
4. **`weeklyRanks.js` fits as-is.** `seasonPointsFromCareer(rows)` takes any `{id: {gamesPlayed,
   fantasyPoints}}` map (gp > 0, finite points) — the live file's rows have that shape after
   `rescoreSeasonTotals` (`sleeperStats.js:341-347`). `rankByTotalPoints` skips ids with no
   `playerMap` position, so the live file's `TEAM_*` rows drop out; bare-abbr DEF rows rank among
   `DEF` only, which My Team never renders.
5. **Purity lint.** `react-hooks/purity` (in `reactHooks.configs.flat.recommended`) flags
   `performance.now()` inside `useMemo` — `App.jsx:216` carries `// eslint-disable-next-line
   react-hooks/purity` for it. `Date.now()` is the same class of call (§2.2).
6. **Registry.** CR-21 gains a reader and its Mirror becomes partly false; CR-02's Portfolio POS RANK
   trigger clause becomes false; CR-01 gains a display reader of the scored projection's `inSeason`;
   CR-16's, CR-02's and CR-01's `Portfolio.jsx` anchors shift. Highest registered `App.jsx` anchor is
   `:1407`; the two new prop lines go after `:1429`, so no registered `App.jsx` anchor moves (P3's
   *queued* `:1438` does — see Cross-repo impact). Signal registry rows `:45` (fantasy scoring core)
   and `:114` (Ceiling/Floor) name My Team's readers — CR-18 fires (§5).

## 2. Wiring

### 2.1 `src/App.jsx` — two props on `<Portfolio`

Directly after `defenceAllowed={defenceAllowed}` at `:1429` (inside the `<Portfolio` element, not
`<WeekView`'s `:1396` or `<Teams`'s `:1460`), add exactly two lines:

```jsx
                          nflState={nflState}
                          liveSeasonTotals={liveSeasonUsable ? currentSeasonTotals : null}
```

Nothing else in `App.jsx`. Line count 1514 → 1516. Do not pass `scoringPosteriors` or
`frozenPrior` (§1.3). Do not touch the JSX comment above the route (`:1406-1407`) — editing it would
shift the registered `:1407` anchor.

### 2.2 `Portfolio.jsx` — props, imports, phase

- Props: add `nflState = null, liveSeasonTotals = null,` after `defenceAllowed = null,` (`:216`).
- Imports: `import { seasonPhase } from '../../utils/seasonPhase'` and
  `import { rankByTotalPoints, seasonPointsFromCareer } from '../../utils/weeklyRanks'`. Keep the
  `rankPositionSeason` import (it still supplies `last`, the PPG).
- After `projSeason` (`:271`):

```js
  // P5b — the shared season-phase rule picks the tables' layout (seasonPhase.js). `now` only matters
  // for an `off` payload (the pre-rollover window, D5).
  const phase = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- read only for season_type 'off'; recomputed per nflState
    const now = Date.now()
    return seasonPhase(nflState, { now })
  }, [nflState])
  const inSeasonLayout = phase?.lead === 'current-plus-ros'
  const phaseLiveSeason = phase?.liveSeason ?? null
  // App passes the live file only when usableLiveSeason holds; the season match is belt and braces.
  const liveRows = liveSeasonTotals != null && liveSeasonTotals.season === phaseLiveSeason
    ? (liveSeasonTotals.players ?? null) : null
  // post / pre-rollover: the season just played is not in careerStats yet (D5).
  const seasonLag = phase != null && !inSeasonLayout && dataSeason != null && phase.lastCompleteSeason > dataSeason
```

  Name it `phaseLiveSeason`, never `liveSeason`: `Portfolio.jsx:225` already has `liveSeasons` (draft-pick
  seasons from `deriveLiveSeasons`), one letter away and unrelated.

  Run `npm run lint` first **without** the disable comment; keep it only if lint flags `Date.now()`
  (an unused directive is itself a lint problem). Lint must end at 0 problems either way.

### 2.3 Ranks and facts

New memos beside `rankByPos`:

```js
  // D2 — position rank by TOTAL league-scored points (weeklyRanks.js, /week's basis), not PPG.
  const lastRanks = useMemo(
    () => (careerStats == null || dataSeason == null ? new Map()
      : rankByTotalPoints(seasonPointsFromCareer(careerStats[dataSeason]), playerMap)),
    [careerStats, dataSeason, playerMap]
  )
  const liveRanks = useMemo(
    () => (liveRows == null ? new Map() : rankByTotalPoints(seasonPointsFromCareer(liveRows), playerMap)),
    [liveRows, playerMap]
  )
```

In `playerFactsById`:
- `posRank`: replace the `rankEntry` derivation with
  `const lastRank = lastRanks.get(id)?.posRank; const posRank = lastRank != null && position ? \`${position}${lastRank}\` : null`.
  `last` (PPG) is unchanged (`rankByPos[position]?.get(id)?.ppg ?? null`).
- `soFar` — `null` when `liveRows == null`, else
  `{ games, ppg, posRank }` with `games = Number.isFinite(live?.gamesPlayed) ? live.gamesPlayed : null`,
  `ppg = live?.gamesPlayed > 0 && Number.isFinite(live.fantasyPoints) ? live.fantasyPoints / live.gamesPlayed : null`,
  `posRank` = `${position}${liveRanks.get(id).posRank}` or `null` (where `live = liveRows[id] ?? null`).
  A player absent from the live file → `{ games: null, ppg: null, posRank: null }`.
- `ros` — `null` when `liveRows == null` (so §3.6's note is true by construction, not by App's
  coupling); else `const proj = seasonProjections?.[id]; const ins = proj?.inSeason`;
  `ros = ins && Number.isFinite(proj.projectedPPG) && Number.isFinite(ins.ros?.weight)
  ? { value: proj.projectedPPG, weight: ins.ros.weight, delta: ins.ros.value - ins.ros.prior } : null`.
  (Guard `delta` to `null` if either operand is non-finite.)
- Add `liveRows`, `liveRanks`, `lastRanks`, `seasonProjections` to the deps; drop nothing else.
- `EMPTY_FACTS` (`:38`) gains `soFar: null, ros: null`.

Compute `soFar`/`ros` regardless of layout (cheap; keeps one facts shape). Nothing else reads them.

## 3. The in-season layout (`inSeasonLayout === true`)

### 3.1 Columns

| Table | Today (unchanged, 12) | In-season (13) |
|---|---|---|
| Starting ten | slot · PLAYER · `{dataSeason} → {projSeason} PPG` · Δ · POS RANK · `GAMES {dataSeason}` · SHARE · SNAP · GAME SCRIPT · ROLE · STATUS · KTC | slot · PLAYER · `{dataSeason}` · `{phaseLiveSeason} so far` · ROS · Δ · `GAMES {dataSeason}` · `SHARE {dataSeason}` · `SNAP {dataSeason}` · GAME SCRIPT · ROLE · STATUS · KTC |
| Bench | PLAYER · PPG pair · Δ · VS MEDIAN STARTER · POS RANK · GAMES · SHARE · SNAP · GAME SCRIPT · ROLE · STATUS · KTC | PLAYER · `{dataSeason}` · `{phaseLiveSeason} so far` · ROS · Δ · VS MEDIAN STARTER · `GAMES {dataSeason}` · `SHARE {dataSeason}` · `SNAP {dataSeason}` · GAME SCRIPT · ROLE · STATUS · KTC |

Implement as one table per section with a layout branch over the differing run of header cells and row
cells (Starting ten: today's `[PPG, Δ, POS RANK]` ↔ in-season `[last, sofar, ros, Δ]`; Bench: today's
`[PPG, Δ, VS MEDIAN, POS RANK]` ↔ in-season `[last, sofar, ros, Δ, VS MEDIAN]`), plus the
`SHARE`/`SNAP` header suffix. Do not duplicate whole tables. Dividers: `DIVIDER` on the `{dataSeason}`
header (where the PPG header has it today), on `ROS`, and on GAMES as today.

### 3.2 `data-testid`s

In-season cells: `col-last`, `col-sofar`, `col-ros`, `col-delta`, `col-vsmedian` (bench). Every other
cell keeps its current testid. `col-ppg` and `col-posrank` are **not rendered** in the in-season
layout. Empty-slot rows and pick rows render a muted `—` in each in-season cell (13 cells), the KTC
cell unchanged. Bench empty state: `colSpan={inSeasonLayout ? 13 : 12}`.

### 3.3 Cells (new, local to `Portfolio.jsx`, beside `PctCell`)

```jsx
// P5b — a season's per-game line: PPG over a sub-line of position rank (total points) and, for the
// live season, games played. "—" only when all three are missing.
function SeasonLineCell({ ppg, posRank, games = null }) {
  if (ppg == null && posRank == null && games == null) return <span className="text-dp-muted">—</span>
  const sub = [posRank, games != null ? `${games} G` : null].filter(Boolean).join(' · ')
  return (
    <div className="text-right">
      <div className="font-dp-mono text-[12px] text-dp-text">{ppg != null ? ppg.toFixed(1) : '—'}</div>
      {sub && <div className="font-dp-mono text-[10.5px] text-dp-text-5">{sub}</div>}
    </div>
  )
}

// ROS (D4): the scored projection with this season's share of the estimate.
function RosCell({ ros }) {
  if (ros == null) return <span className="text-dp-muted">—</span>
  return (
    <span className="font-dp-mono text-[12px] font-semibold text-dp-text whitespace-nowrap">
      {ros.value.toFixed(1)}
      <span className="font-normal text-dp-text-5"> · {Math.round(ros.weight * 100)}%</span>
    </span>
  )
}
```

Row wiring: `col-last` → `<SeasonLineCell ppg={f.last} posRank={f.posRank} />`; `col-sofar` →
`f.soFar ? <SeasonLineCell {...f.soFar} /> : <muted —>`; `col-ros` → `<RosCell ros={f.ros} />`;
`col-delta` → `<DeltaCell delta={f.ros?.delta ?? null} />`. Starters and Bench read the same facts —
do **not** use `slot.points`/`entry.proj` for ROS (they equal `projectedPPG`, but the record gate
lives in the facts).

### 3.4 Headers

`{dataSeason ?? '—'}` · `{phaseLiveSeason} so far` · `ROS` wrapped in
`<DefinitionPopover term="Rest of season" gloss="The preseason projection updated with this season's games; the % is this season's share of the estimate.">ROS</DefinitionPopover>`
(same in both tables — no claim about the lineup, which is picked on `projectedPPG` whether or not a
record exists) · `Δ`. `TH_CLASS` uppercases visually; write the text as shown.

### 3.5 Section copy

- Starting ten subtitle (`:773`): in-season →
  `best lineup by rest-of-season projection · {dataSeason}, {phaseLiveSeason} so far and the rest of the season`.
- Legend (`:776-777`): in-season omits the two bar keys (`{dataSeason} PPG`, `{projSeason} projected`);
  the played/missed/bye keys stay (the GAMES strip remains).
- Bench subtitle (`:904`): in-season → `same columns, sorted by rest-of-season projection · the top of this list is who steps in`.
- Starting ten footnote (`:860-865`), in-season replacement for the first span:
  `{dataSeason} and {phaseLiveSeason} SO FAR are points per game in this league's scoring, with
  position rank by total points; SO FAR adds games played. ROS is the preseason projection updated
  with this season's games, and Δ is ROS minus that projection. GAMES, SHARE and SNAP are
  {dataSeason}'s: SHARE is target share for pass-catchers and carry share for backs, from seasons with
  8+ games; SNAP is offensive snap share, not tracked for quarterbacks. Dashed week is a bye or a week
  with no game recorded.`
- Today's footnote, first sentence only (D2): `POS RANK is last-season PPG among …` →
  `POS RANK is last-season total points among all players at the position in this league's scoring.`
  Rest unchanged.
- The rookie note (`:866-873`) is unchanged in both layouts.

### 3.6 No usable live file, or no records

`inSeasonLayout && liveRows == null` → every `col-sofar`, `col-ros` and `col-delta` reads `—` (by
construction, §2.3). Add one line to the Starting ten footnote bar, same style as the rookie note:
`No {phaseLiveSeason} season data is loaded — SO FAR, ROS and Δ read —; the lineup is picked on the
season projection.` (`data-testid="live-missing-note"`.)

**Live file usable but no in-season records.** `scoringPosteriors` is `null` until `frozenPrior`
settles (`App.jsx:697`) and permanently when `projectionBasis` is `'mixed'`/`'unknown'`
(`inSeasonScoring.js:150`). Then `liveRows != null` but every `f.ros` is null. When
`inSeasonLayout && liveRows != null && no Starting-ten player has f.ros` (empty slots excluded), add
one line (`data-testid="ros-missing-note"`): `ROS is not computed yet — ROS and Δ read —; the lineup
is picked on the season projection.` The two notes are mutually exclusive by construction.

## 4. Today's layout — the season-lag note (D5)

When `seasonLag`, add one line to the Starting ten footnote bar (`data-testid="season-lag-note"`):
`The {phase.lastCompleteSeason} season is over. It joins these columns when Sleeper rolls over to
{phase.lastCompleteSeason + 1}; until then they compare {dataSeason} with {projSeason}.` Nothing else
changes.

## 5. Docs (same commit)

- `docs/nav/utils.md` `seasonPhase.js` row (`:56`): replace `No consumers yet.` with
  `Adopted by \`portfolio/Portfolio.jsx\` (My Team's table layout).` `weeklyRanks.js` row (`:64`):
  append `Also My Team's POS RANK and in-season rank sub-lines (\`portfolio/Portfolio.jsx\`), over
  \`careerStats[dataSeason]\` and the live season-totals rows.`
- `docs/nav/components.md` `portfolio/Portfolio.jsx` row (`:15`): **replace** the clause
  `` `POS RANK` and last-season PPG come from `utils/seasonRanks.js`'s `rankPositionSeason` over
  `careerStats[dataSeason]` `` with `` `POS RANK` is by total league-scored points
  (`utils/weeklyRanks.js`'s `rankByTotalPoints` over `careerStats[dataSeason]`); last-season PPG comes
  from `utils/seasonRanks.js`'s `rankPositionSeason` ``, then append one sentence: the tables follow
  `seasonPhase` — `lead: 'current-plus-ros'` renders `{dataSeason}` · `{liveSeason} so far` · ROS · Δ
  (ROS/Δ from the scored projection's `inSeason`, so-far PPG/games/rank from the `liveSeasonTotals`
  prop, which App passes only when `liveSeasonUsable`); any other lead keeps the last-vs-next columns.
  Name the two new props (`nflState`, `liveSeasonTotals`).
- `docs/ui.md:84-87` (My Team Starting ten columns): replace `` `POS RANK` (`utils/seasonRanks.js`'s
  `rankPositionSeason` over `careerStats[dataSeason]`, no games floor — same ranking as Market's
  Ceiling/Floor) `` with `` `POS RANK` (total league-scored points, `utils/weeklyRanks.js`'s
  `rankByTotalPoints` over `careerStats[dataSeason]`, no games floor — the `/week` rank basis) ``, and
  add after that paragraph one sentence: in-season (`seasonPhase` lead `current-plus-ros`) the PPG
  pair, `Δ` and `POS RANK` are replaced by `{dataSeason}` (PPG over rank), `{liveSeason} so far` (PPG
  over rank and games), `ROS` (scored projection · this season's weight) and `Δ` (ROS minus the
  prior), and the `SHARE`/`SNAP` headers carry `{dataSeason}`; without a usable live file or in-season
  records those cells read `—` with a note.
- `docs/signal-registry.md:45`, last sentence of the Current-use cell: after `Market's In-season set
  additionally reads \`gamesPlayed\`/\`fantasyPoints\` for its PPG cell (view-only)` add `; My Team's
  in-season columns (\`portfolio/Portfolio.jsx\`) read the same two for the so-far PPG, games played
  and total-points position rank (view-only)`.
- `docs/signal-registry.md:114` (Ceiling/Floor row), last clause: `My Team's \`POS RANK\` column +
  last-season PPG via \`rankPositionSeason\` on \`dataSeason\`` → `My Team's last-season PPG via
  \`rankPositionSeason\` on \`dataSeason\` (its \`POS RANK\` is by total points, \`weeklyRanks.js\`)`.
- `src/utils/weeklyRanks.js` header comment only (no code): `:4-6` — replace "unlike `seasonRanks.js`,
  whose `rankPositionSeason` ranks My Team by PPG with no ties and no overall rank, so it is not
  reused here" with "unlike `seasonRanks.js`'s `rankPositionSeason` (by PPG, no ties, no overall rank).
  My Team's POS RANK and in-season rank sub-lines use these functions too (`portfolio/Portfolio.jsx`)";
  `:17-19` — replace "and My Team's rank already shares that population" with "and My Team's
  last-season rank uses the same `careerStats` population".
- All edits state mechanism, never availability (`docsAvailabilityClaims.test.js`). No `CLAUDE.md`
  change (24,881 / 25,000 bytes; nothing it says becomes false).

## 6. Tests — `src/components/portfolio/Portfolio.test.jsx`

Add inside `describe('Fixture M', …)` (reusing `commonProps`, `starterRow`), after test 11. Fixtures:

```js
  const REG_WK4 = { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }
  const LIVE = { season: 2026, complete: true, players: {
    w1: { gamesPlayed: 3, fantasyPoints: 54, scoringBasis: 'league' },   // 18.0
    w2: { gamesPlayed: 3, fantasyPoints: 60, scoringBasis: 'league' },   // 20.0 — WR1 so far
  } }
  const scoredProj = { ...seasonProjections,
    w1: { projectedPPG: 17, inSeason: { n: 3, ros: { prior: 16, weight: 0.3, value: 17 } } } }
  const inSeasonProps = { ...commonProps, seasonProjections: scoredProj, nflState: REG_WK4, liveSeasonTotals: LIVE }
```

(`w1` keeps `projectedPPG: 17`, so the lineup is unchanged: row 3 = w1, row 4 = w2.)

1. **P5b-1 rank basis is total points.** `careerStats` copy with `w2.gamesPlayed: 5` (140 pts → 28.0
   PPG, above w1's 16.0); render with `commonProps` → row 3 `col-posrank` `WR1`, row 4 `WR2`. (Fails on
   the old PPG ranking, which puts w2 first.)
2. **P5b-2 in-season layout.** Render `inSeasonProps`. Starting ten has no `col-ppg`/`col-posrank`;
   header text contains `2026 so far`, `ROS`, `SHARE 2025`. Row 3: `col-last` contains `16.0` and
   `WR1`; `col-sofar` contains `18.0`, `WR2`, `3 G`; `col-ros` contains `17.0` and `30%`; `col-delta`
   is `+1.0`. Row 4: `col-sofar` contains `20.0` and `WR1`; `col-ros` and `col-delta` are `—` (no
   record). No `live-missing-note`, no `ros-missing-note`.
3. **P5b-3 rookie in-season.** Row 9 (q2, no 2025 row, not in the live file): `col-last` `—`,
   `col-sofar` `—`.
4. **P5b-4 cell counts.** `commonProps` renders no pick rows, so add test 7's pick props
   (`tradedPicks={[]}`, its `ktcPickTable` from `parseKtcPickRows`, `firstLiveDraftSeason={2027}`,
   `draftRounds={1}`) to `inSeasonProps` for this test. In-season: Starting ten header `th` count = 13
   = `td` count of row 0; Bench header `th` count = 13 = `td` count of the first player row **and** of
   the pick row. Empty-slot row: add one in-season render to the existing `describe('F1-5 (unfillable
   slot)')` with `nflState: REG_WK4` (define it locally there) asserting the empty row (`starter-{i}`)
   has 13 `td`s, each in-season cell `—`.
5. **P5b-5 week 1 keeps today's layout.** `nflState: { …REG_WK4, week: 1 }` with `liveSeasonTotals:
   LIVE` → `col-ppg` present, no `col-sofar`, header contains `2025 → 2026 PPG`.
6. **P5b-6 unknown phase.** `commonProps` (no `nflState`) → no `col-sofar`, no `season-lag-note`.
7. **P5b-7 live file missing.** `{ ...inSeasonProps, liveSeasonTotals: null }` → in-season headers;
   every `col-sofar` in the Starting ten is `—`; row 3 (w1, which still carries an `inSeason` record in
   `scoredProj`) `col-ros` and `col-delta` are `—` (by construction, §2.3); `live-missing-note`
   present and contains `No 2026 season data is loaded`; no `ros-missing-note`.
8. **P5b-8 season-lag note.** `nflState: { season: '2026', season_type: 'post', week: 1 }` → today's
   layout (`col-ppg` present) and `season-lag-note` contains `The 2026 season is over` and
   `compare 2025 with 2026`.
9. **P5b-9 live season mismatch is ignored.** `liveSeasonTotals: { ...LIVE, season: 2025 }` with
   `REG_WK4` → `live-missing-note` present, row 3 `col-sofar` `—`.
10. **P5b-10 ROS not computed.** `{ ...inSeasonProps, seasonProjections }` (Fixture M's plain map, no
    `inSeason` anywhere) → row 3 `col-sofar` contains `18.0`, `col-ros` `—`; `ros-missing-note`
    present; no `live-missing-note`.

Existing tests: test 2 and test 3 must stay green **unedited** (today's layout; Fixture M's equal
`gamesPlayed` make PPG and total ranks agree). If any existing test needs an edit, stop and report.

## 7. Findings for Anton (reported, not acted on)

1. **"So far" can trail `/week` by a few days** (D3). `/week` ranks this season from Sleeper's weekly
   rows (always current); My Team reads the data-store file, refreshed Friday, Monday and Tuesday
   mornings. Same week, two different current-season ranks is possible on a Sunday night.
2. **The season-lag window (D5)** — January to roughly March: My Team keeps showing last season →
   this season with a note until Sleeper rolls the season over. The real fix is folding the finished
   season into the dynasty data at the end of the regular season — a pipeline change, not a view one.
3. **Not converted yet (D6):** the three header tiles (`PROJECTED · 2026` is already the
   rest-of-season figure, labelled "projected"), the summary sentence and the League ladders still
   speak "last season vs next". Candidates for a small follow-up once Anton has seen the tables.
4. **GAMES strip stays last season's.** An in-season availability strip would need per-week rows
   from the live file — data exists (`weeklyPoints`), not built here.

## 8. Touch list, done-definition, commit

Touch list — exactly:
- `src/App.jsx` (two prop lines, §2.1)
- `src/components/portfolio/Portfolio.jsx`
- `src/components/portfolio/Portfolio.test.jsx`
- `docs/nav/utils.md`, `docs/nav/components.md`, `docs/ui.md`, `docs/signal-registry.md` (§5)
- `src/utils/weeklyRanks.js` — header comment only (§5); no code change
- `.claude/tasks/data-repo-backlog.md` (one D-58 bullet, Cross-repo impact)
- this task file (commit it)

Not touched: `seasonPhase.js`, `weeklyRanks.js` code, `seasonRanks.js`, `lineup.js`,
`inSeasonScoring.js`, `inSeasonEvidence.js`, `Market.jsx`, any guard test, `CLAUDE.md`,
`docs/cross-repo-registry.md`.

Done-definition (CLAUDE.md): `npm test` green; `npm run lint` 0 problems; `npm run build` clean, no
new warnings (the Vite chunk-size notice predates this). No contract tests apply. `wc -l src/App.jsx`
→ 1516. `grep -rn "PROVISIONAL(" src/components/portfolio/Portfolio.jsx` unchanged from `fe89736`
(nothing here is a stand-in — every new cell is real data or `—`).

**Smoke** (the `.claude/launch.json` preview, Anton's league per `docs/architecture.md` → *Smoke-testing
the running app*): open My Team.
- It is week 4–5 of 2026, so the in-season layout must render. Check both tables: headers, no `NaN`,
  no collapsed layout (horizontal scroll is fine).
- For two starters, compare against Market → In-season: My Team `{phaseLiveSeason} so far` PPG =
  Market `PPG 2026`; My Team ROS value and % = Market ROS (a 0.1 rounding difference is acceptable —
  My Team shows the rounded `projectedPPG`, Market the record's `ros.value`); Δ = Market Δ.
- For one starter, compare the so-far rank with `/week`'s `2026 WR…` sub-line and report both (they may
  differ — §7.1).
- Report three rows (player, the four in-season cells) in the hand-back.

Commit: one code commit, message `My Team in-season columns: season-phase layout, total-points ranks
(P5b)`, with the attribution trailer. Push only after Session 1 verification (CLAUDE.md step 9).

## Review record — plan gate round 1 (2026-10-03)

plan-reviewer: 10 flags (4 medium, 6 low). All verified against live source; all applied.

| # | Flag | Decision |
|---|---|---|
| 1 | (medium) CR-02 touched (its Portfolio POS RANK trigger clause becomes false; `:300,304` anchors shift) | Applied: CR-02 bullet with Mirror; D-58 trigger rewrite queued |
| 2 | (medium) CR-21 Mirror falsified ("Portfolio … no longer shows"; "no way to tell" list) | Applied: exact replacement text queued on D-58 |
| 3 | CR-16/CR-18 Mirror not quoted | Applied: quoted |
| 4 | P3's queued CR-01 `App.jsx:1438` shifts to `:1440` | Applied: noted in the D-58 bullet |
| 5 | (medium) `docs/ui.md:85`, `signal-registry.md:114`, `components.md:15`, `weeklyRanks.js` header become false | Applied: §5 edits; components clause replaced, not appended; `weeklyRanks.js` comment-only edit added to touch list |
| 6 | (medium) live file usable but no records (frozenPrior pending / basis mixed): unexplained `—`, false gloss | Applied: `ros-missing-note` + test P5b-10; gloss no longer mentions the lineup |
| 7 | P5b-7's note true only via App coupling | Applied: `ros` null when `liveRows == null`; P5b-7 asserts ROS/Δ `—` |
| 8 | P5b-4 pick rows absent from `commonProps`; empty-slot branch untested | Applied: pick props stated; empty-slot count in the F1-5 describe |
| 9 | Line anchors drifted | Applied: corrected |
| 10 | `liveSeason` beside existing `liveSeasons` | Applied: renamed `phaseLiveSeason` |

## Cross-repo impact

Touched contracts: **CR-21, CR-02, CR-01, CR-16 (anchors only), CR-18** (app-owned row edits, §5). No
contract shape changes; no data-repo action beyond the next registry byte-sync. **No registry text edit
in this slice** (D7). Session 2 appends one bullet to D-58 in `.claude/tasks/data-repo-backlog.md`:

> - Also pending from P5b (my-team-in-season-columns.md, `<sha>`):
>   - **CR-21 App side and Triggers** — add `src/components/portfolio/Portfolio.jsx` (the
>     `liveSeasonTotals` prop, passed by `src/App.jsx`'s `<Portfolio` element as
>     `liveSeasonUsable ? currentSeasonTotals : null`; reads `season`, and `gamesPlayed`/`fantasyPoints`
>     off player rows for My Team's so-far PPG, games and total-points position rank via `weeklyRanks.js`).
>   - **CR-21 Mirror** — two replacements: (a) "**the app has no way to tell in Market's In-season column
>     set or the in-season seam**" → "**the app has no way to tell in Market's In-season column set, My
>     Team's in-season columns or the in-season seam**"; (b) "Since defence-numbers-rebuild no surface
>     states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat
>     rows, not from this file, so a stopped job no longer shows on them at all." → "Since
>     defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points
>     allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows in
>     those columns at all. Portfolio's in-season columns (my-team-in-season-columns.md) do read this
>     file, so a stopped job leaves their so-far PPG, games and rank silently stale."
>   - **CR-02 Triggers** — the Portfolio clause "`rankPositionSeason` over `careerStats[dataSeason]` for
>     `POS RANK`" becomes "`rankByTotalPoints`/`seasonPointsFromCareer` (`src/utils/weeklyRanks.js`)
>     over `careerStats[dataSeason]` and the live rows for `POS RANK` and the in-season rank sub-lines;
>     `rankPositionSeason` for last-season PPG only"; re-derive the `portfolio/Portfolio.jsx:300,304`
>     anchors. Joins P3's queued `weeklyRanks.js` addition.
>   - **CR-01 Triggers** — add the `inSeason` read (`ros.value`/`ros.prior`/`ros.weight`) and the
>     `projectedPPG` read in `Portfolio.jsx`'s `playerFactsById`, from the scored map; re-derive the
>     `Portfolio.jsx:274` `buildLeagueLineups` anchor. P3's queued CR-01 `App.jsx:1438` (`<Market`'s
>     `seasonProjections`) becomes `:1440` after P5b's two `<Portfolio` prop lines; `:1413` is unchanged.
>   - **CR-16** — re-derive the `Portfolio.jsx` anchors (already queued above; this slice shifts them again).
>   - Data side: no action beyond the byte-sync.

- **CR-21** (in-progress season-totals reads) — a new view-only reader, gated on the same
  `usableLiveSeason` the seam uses. It reads per-player `gamesPlayed` (never a league-wide max), so it
  does not infer weeks complete; between Friday and Tuesday its total-points rank compares players over
  different game counts (§7.1). Its Mirror becomes partly false (the "no way to tell" list and the
  "Portfolio … no longer shows" sentence) — replacement text queued above. Current Mirror, quoted:
  "If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell in Market's In-season column set or the in-season seam** — it will read a half-season's rates as though they were a season's, with no error and no test failure. Since defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows on them at all. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel. **Since in-season-evidence-2b-2 a mis-marked or stale in-progress file also moves displayed projections and veterans' and rookies' dynasty scores, silently** — `gamesPlayed` counting inactive weeks over-weights every posterior. **Since season-totals-cadence.md (2026-10) the job runs Friday, Monday and Tuesday mornings, so between Friday and Tuesday the file holds a partly played current week under the same `inProgress: true` marking** — teams that have played it carry one more `gamesPlayed` than teams that have not. Per-player readers (the posteriors' own `n`) read this correctly; the league-max reader (Market's "up to N games played") reports the leading teams' count. A new reader that infers "weeks complete" from a league-wide max `gamesPlayed` will be one week early from Friday to Tuesday. Points allowed no longer read this file (defence-numbers-rebuild)."
- **CR-02** (season-totals row composition) — POS RANK's derivation changes, and `liveRanks` is a second
  cross-row reader of served rows that relies on `TEAM_*` rows having no `playerMap` position
  (bare-abbr DEF rows rank among `DEF`, never rendered). No shape dependency added. Mirror, quoted:
  "A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry. **Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim** (the pop-up's Game log `PTS` and Distribution histogram) and labels them half-PPR from the row's served `scoringBasis`: changing the basis `weeklyPoints` is written on — D-47 included — without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test." No data-side action.
- **CR-01** (projection snapshot envelope) — a new display reader of the scored projection's
  `projectedPPG` and `inSeason` record. Read-only; envelope unchanged; no `schemaVersion` bump. Mirror,
  quoted: "State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. Since in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back), so the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys need no change. Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version." Envelope shape unchanged; no bump.
- **CR-16** (era-accurate team-code remap) — no mapping change; `Portfolio.jsx` line anchors shift
  (queued above). Mirror, quoted: "A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers." No data-side action.
- **CR-18** (signal registry rows) — app-side row edits made in this slice (`docs/signal-registry.md:45`
  and `:114`, §5); no data-repo action. Mirror, quoted: "This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable."
