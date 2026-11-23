# Brief M3 — My Team visuals: weekly score strip, shared player cell, phone-width fix

Review depth: full — Portfolio.jsx (1,513 lines) visual pass across every My Team table; shared components reused by /week.

**Revision 1 (2026-11-22): plan-reviewer (full) flags 1–8 folded in** (Anton: "Fold all flags in").
1 → Fixture W drops FLEX and pins projections so `b1` benches; 2 → `opponentStrengthViewOnly.test.js` T25b added
to §5.7; 3 → Fixture W gains a second roster so a weak row renders, D3 asserts its team through Portfolio's
`teamOf`; 4 → P6's pre-season `nflState` carries `week: 4`; 5 → §4.5 replaces the name div; 6 → D2 cites the
call-site rule's real source, not CR-08; 7 → three stale consumer comments added to the touch list; 8 → §4.2
uses App's `selectLiveWeekly`.

Session 1: opus, high. **Session 2: sonnet, medium.** Visual change — Session 2 runs the app; Anton judges.
Planned at app `5840612` ("Sign-off: Brief M2b", main == origin/main after `git fetch`).
Data repo: not consulted, not touched. No data contract changes.
Design source: Claude.ai project doc `claude/ux-briefs-week-and-myteam.md` → Brief M §5, Brief W §4 (weekly score
strip) and §6 (colour), Display rule, Season-order convention (not on disk). Executes the M3 outline in
`myteam-m2b-defences-ahead.md` §11. Decisions D-a…D-e were made in the Claude.ai project and are not revisited.

---

## 0. For Anton

In season, every Starting ten and Bench player row gets the same weekly score strip This week shows — one bar
per completed week, height = his points, colour = how that week ranked among this league's starters at his
position, red square for a week he did not play, hatched for a bye, last three weeks ticked. It replaces the
old green/red "games" squares on those rows, so the weeks appear once. The strip is built by the same code from
the same weekly data This week uses, so the two pages cannot disagree about a week. Defences ahead and Weakest
slots get the shared player cell (photo, team, logo), and long names truncate on one line on a phone with the
full name on hover. Out of season My Team is unchanged.

The 8px sideways scroll on phones is **not a My Team table**: it is the top bar (league name + username + Switch
+ League link cannot shrink). It shows on every page — This week measures the same 383px at 375. The fix lets
the league name truncate, so it fixes every page. Cost: no new downloads (the weekly rows are already loaded
for Defences ahead). Risk: low — display only.

## 1. View-only statement

Nothing in this slice reaches `playerRows`, `projectedPPG`, the dynasty score, a snapshot, a `factors` entry or
`docs/cross-repo-registry.md`. App.jsx gains two **props** on `<Portfolio>` — both values App already computes
(`starterPercentiles`, the memo /week receives as `percentileBasis`; `defenceWeeklyByYear[liveSeason]`, the
loader result behind `defenceAllowed`) — and no state, effect, memo or load. `weeklyDecisionViewOnly.test.js`
(pipeline modules may not import `weeklySeasonGrid`) and `opponentStrengthViewOnly.test.js` keep guarding it;
T25b there pins App's `starterPercentiles` lines and gains the second `percentileBasis={starterPercentiles}`
entry (§5.7) — the basis still reaches nothing but the two view props.
**If Session 2 finds any of this wrong, stop and report.**

## 2. Inventories

### 2.1 Every My Team table row type → its name cell

| Table (file) | Row type | Name cell today | After |
|---|---|---|---|
| Starting ten (`Portfolio.jsx`, `starting-ten`) | filled slot | `PlayerCell row={row} marker=…` | same + `photoFromMd`, `className={PLAYER_CELL_PHONE_CAP}` |
| Starting ten | empty slot | italic `empty` | unchanged (names no player) |
| Bench (`Portfolio.jsx`, `bench`) | player | `PlayerCell row={row} marker=…` | same + `photoFromMd`, `className={PLAYER_CELL_PHONE_CAP}` |
| Draft picks (`Portfolio.jsx`, `PickCell`) | pick | `PickCell` | unchanged (a pick, not a player — D-b/D-d) |
| Defences ahead · This week (`DefencesAhead.jsx`) | starter | hand-rolled: name / position / `ahead-label` "allowed to all RBs / G" (3 lines, wraps at 375) | `PlayerCell` (§4.4); label moves to the section eyebrow |
| Defences ahead · Rest of season (`DefencesAhead.jsx`, `ahead-schedule`) | starter | hand-rolled: name (nowrap) / position | `PlayerCell` (§4.4) |
| Weakest slots (`WeakestSlots.jsx`) | slot with a player | plain `row.name` text, truncating | `PlayerCell` (§4.5) |
| Weakest slots | empty slot (`name == null`) | `—` | unchanged |
| Team offences (`TeamOffences.jsx`) | team | logo + code + team name; players as last-name chips; QB name in a column | **unchanged** — the row's subject is a team; chips and the QB column are attributes of it, not player rows (D-d covers rows that name a player as their subject). Stated so the reviewer can disagree. |
| League ladders (`LeagueLadders.jsx`) | position group | no player named | unchanged |

After this slice no My Team row whose subject is a player has a hand-rolled name cell.

### 2.2 Per-row weeks displays today → replacement (in season = `inSeasonLayout`)

| Where | Today in season | After in season | Out of season |
|---|---|---|---|
| Starting ten + Bench `col-games` (Usage view), header `GAMES {liveSeason}` | `LiveGamesCell`: live-season `GamesStripCell` (18 P/D/B/X squares from `usage.live.weeks` + `played/total` text) over a grey `{dataSeason} p/t` line | header `{liveSeason} WEEKS`; `LiveWeeksCell` (§4.3): `WeeklyStrip` over the grey `{dataSeason} p/t` line. **Gone:** the live 18-square strip and the live `p/t` count (both are the same weeks, classified differently — a second, disagreeing account of them) | unchanged: `GAMES {dataSeason}`, `GamesStripCell` |
| Starting ten header key (Usage view) | three swatches: played / missed / bye or no game | in season: strip key (bar / red square "did not play" / hatched "bye"); out of season unchanged | unchanged |
| Starting ten legend | "GAMES, SHARE and SNAP are …; Dashed week is a bye…" | in-season sentence rewritten (§4.3) | unchanged |
| Header tile `GAMES MISSED · {liveSeason}` | sums `weeklyStatus` D over starters | **unchanged** — a team total, not a per-row display (D-b is per row). Can count differently from the red squares; §10 item 1. | unchanged |
| Defences ahead | upcoming weeks only (WK ≥ currentWeek) | unchanged — different weeks | n/a |

`buildInSeasonUsage` (`portfolioUsage.js`) keeps computing `live.weeks/played/missed`; after this slice nothing
renders them for the live season. Do not edit the util (CLAUDE.md: no refactor of working utils).

## 3. Decisions (Session 2 does not revisit)

- **D1 — cells come from /week's own functions.** My Team's strip cells are
  `buildStripByPlayer(buildSeasonGrid(…), currentWeek)` — `weeklySeasonGrid.js`'s existing pair, the exact path
  `useWeeklyDecision` runs — fed by App's `defenceWeeklyByYear[liveSeason]`. That loader result
  (`loadDefenceWeeklyRows`) is `{ year, weeks: [{ week, rows }], failedWeeks, complete }` from the same
  `getWeeklyStatRows` cache keys /week fetches, for weeks `1..currentWeek-1` (`defenceLoadPlan`), filtered to
  `TEAM_*` and QB/RB/WR/TE rows — every My Team player row is QB/RB/WR/TE (App.jsx playerRows filter). So for a
  given player the two surfaces produce identical cells. Rejected: deriving cells from `liveSeasonTotals`
  (`weeklyStatus` + rescored `weeklyPoints`) — a second derivation that classifies absences differently
  (CR-28) and falls back to scaled points, so the two pages could disagree about the same week.
- **D2 — schedule index.** Reuse Portfolio's existing `liveScheduleIndex` (one `buildRegWeekIndex` call site per
  surface — the rule stated in `useWeeklyDecision.js` ~L236 and `weeklyOwnProjection.js` ~L40). It is non-null only when the live schedule is `complete` — the same gate WeekView applies.
  Without it past non-played weeks resolve `unknown` (dashed), never `bye`/`dnp`.
- **D3 — gate.** The strip renders only when `inSeasonLayout` (D-a; from week 2, when a completed week exists)
  **and** the weekly result is a `complete` load of `phaseLiveSeason` (`weeklyResult.year === phaseLiveSeason`).
  Otherwise the cell's strip slot reads `—` — never a strip of red squares built from absent rows.
- **D4 — colour.** `WeeklyStrip` gets App's `starterPercentiles` object as `percentileBasis`, passed straight
  through Portfolio untouched — no memo, no derivation, no fallback in Portfolio (D-c).
- **D5 — WeeklyStrip unchanged.** No new prop is needed: My Team supplies `cells`, `position`,
  `percentileBasis` exactly as LineupTable does; the header text is Portfolio's. `WeeklyStrip.jsx` is not
  edited; test W1 pins its output.
- **D6 — prior-season line stays.** The grey `{dataSeason} p/t` line under the strip is a different season
  (Season-order convention: current main, prior grey beneath, naming its season) — not a duplicate.
- **D7 — phone width for names.** My Team's frozen-column PlayerCells take /week's phone treatment:
  `photoFromMd` and `className={PLAYER_CELL_PHONE_CAP}`, the cap hoisted from LineupTable's literal
  `'max-w-[168px] md:max-w-none'` into `dp/frozen.js` (one definition, imported by both — not a copy).
  PlayerCell's truncating name span gains `title={row.full_name}` for every caller (adds a hover title on
  /week, Market, Teams and the pop-up compare too — an attribute only, no layout change). Weakest slots is a
  grid (`minmax(0,1fr)`), so it truncates without the cap and keeps its photo.
- **D8 — Defences ahead label.** "allowed to all {POS}s / G" leaves the name cell. The This-week section
  eyebrow reads `This week · points allowed to the row's position / G` (it labels the PTS/G, SO FAR, BLENDED
  and RANK columns for every row; the row's position shows in PlayerCell's chip). The `DEF` column headers are
  left as is. PlayerCell sub-line: `sub={null}` (team abbr only — the rows carry no age).
- **D9 — overflow fix (D-e).** Measured at 375 on `5840612`: `document.documentElement.scrollWidth` 383 on both
  /portfolio and /week. The only unclipped elements past 375 are in `TopBar.jsx`'s header row (right cluster
  ends at 383) and the fixed `BottomTabBar` (stretched by the widened layout viewport, not a cause). Cause: the
  left cluster `<div className="flex items-center gap-2.5 shrink-0 min-w-0">` (TopBar.jsx L125) cannot shrink,
  so the league pill's `truncate max-w-[220px]` never engages. Removing `shrink-0` there (keep `min-w-0`) gave
  scrollWidth 375 in the browser, the league name truncating to ~56px. Also add `title={selectedLeague.name}`
  to the truncating name span (L133). Nothing else in the header changes.

## 4. Changes by file (touch list)

| File | Change |
|---|---|
| `src/utils/weeklySeasonGrid.js` | + `buildStripsFromWeeklyResult` (§4.1) |
| `src/components/dp/frozen.js` | + `PLAYER_CELL_PHONE_CAP` |
| `src/components/week/LineupTable.jsx` | import `PLAYER_CELL_PHONE_CAP`, replace its literal (output identical) |
| `src/components/dp/cells.jsx` | PlayerCell name span `title={row.full_name}`; header comment line |
| `src/components/portfolio/Portfolio.jsx` | §4.3 |
| `src/components/portfolio/DefencesAhead.jsx` | §4.4 |
| `src/components/portfolio/WeakestSlots.jsx` | §4.5 |
| `src/components/shell/TopBar.jsx` | §3 D9 |
| `src/App.jsx` | two `<Portfolio>` props (§4.2); the defence-load effect's comment (~L1234) |
| `src/components/dp/WeeklyStrip.jsx` | **header comment line 1 only**: "(shared: /week lineup now, My Team later)" → "(shared: /week lineup and My Team's Starting ten/Bench in season)". No code change — W1's snapshot covers the markup |
| `src/api/defenceWeekly.js` | header comment L7 only: the live season's result is also read by the pop-up **and My Team's weekly strip** (`buildStripsFromWeeklyResult`) |
| tests | §5 |
| docs | §6 |

Nothing else. In particular **no code change** in `WeeklyStrip.jsx` or `defenceWeekly.js`, and **not** `portfolioUsage.js`, `availabilityGrid.js`,
`defencesAhead.js`, `useWeeklyDecision.js`, `starterPercentiles.js`, `TeamOffences.jsx`, `LeagueLadders.jsx`.

### 4.1 `src/utils/weeklySeasonGrid.js`

Add after `buildStripByPlayer`:

```js
// M3 — My Team's weekly strip (myteam-m3-visuals.md D1): the cells /week's strip renders, from App's live
// weekly loader result (loadDefenceWeeklyRows: { year, weeks: [{ week, rows }], failedWeeks, complete }).
// The same buildSeasonGrid → buildStripByPlayer pair useWeeklyDecision runs — never a second derivation.
// null unless `weeklyResult` is a complete load of `season`: an absent load must not read as "did not play".
// -> { [id]: { position, cells } } | null
export function buildStripsFromWeeklyResult({ players, weeklyResult, season, scheduleIndex, scoringSettings, currentWeek }) {
  if (!weeklyResult?.complete || weeklyResult.year !== season) return null
  const grid = buildSeasonGrid({
    groups: [{ key: 'starters', players: players ?? [] }],
    weeklyMaps: weeklyResult.weeks, failedWeeks: weeklyResult.failedWeeks,
    scheduleIndex, projections: null, scoringSettings, currentWeek,
  })
  return buildStripByPlayer(grid, currentWeek)
}
```

`players`: `[{ id, name, team, position }]` (buildSeasonGrid's player shape). `projections: null` is safe —
it is read only for `week === currentWeek`, which the strip filter drops. Group key `'starters'` only because
`buildStripByPlayer` reads `starters`/`bench` groups; it carries no meaning here.

### 4.2 `src/App.jsx` — the `<Portfolio>` element only

Add, beside the existing props:

```jsx
percentileBasis={starterPercentiles}
liveWeeklyRows={selectLiveWeekly(defenceWeeklyByYear, nflState)}
```

`starterPercentiles` is the identifier WeekView already receives (`percentileBasis={starterPercentiles}`).
`selectLiveWeekly` (`utils/liveSeasonLog.js`, already imported at App.jsx L70) is the single selector the pop-up
context uses for the same entry (App.jsx ~L881) — do not re-derive it inline. Apart from the ~L1234 comment
(touch list), no other App.jsx line changes.

### 4.3 `src/components/portfolio/Portfolio.jsx`

1. **Props:** add `percentileBasis = null, liveWeeklyRows = null` to `Portfolio`'s destructuring.
2. **Imports:** `WeeklyStrip` from `'../dp/WeeklyStrip'`; `buildStripsFromWeeklyResult` from
   `'../../utils/weeklySeasonGrid'`; `PLAYER_CELL_PHONE_CAP` added to the `'../dp/frozen'` import.
3. **Memo** (after `liveScheduleIndex`, which it reads):
   ```js
   // M3 D1/D3 — the weekly score strip, in season only: /week's own cells from App's live weekly rows.
   const stripByPlayer = useMemo(() => {
     if (!inSeasonLayout) return null
     const players = [...factIds].map(id => {
       const row = rowById.get(id)
       const slot = myLineup?.slots.find(s => s.player_id === id)
       return { id, name: row?.full_name ?? slot?.name ?? null, team: row?.nfl_team ?? null, position: row?.position ?? slot?.position ?? null }
     })
     return buildStripsFromWeeklyResult({ players, weeklyResult: liveWeeklyRows, season: phaseLiveSeason, scheduleIndex: liveScheduleIndex, scoringSettings, currentWeek })
   }, [inSeasonLayout, factIds, rowById, myLineup, liveWeeklyRows, phaseLiveSeason, liveScheduleIndex, scoringSettings, currentWeek])
   ```
   (`team: row?.nfl_team` matches `defencesAhead`'s `teamOf`; `'FA'` and `null` both resolve `unknown` in
   `resolveTeamWeek`.)
4. **Cell:** replace `LiveGamesCell` (delete it — no other caller) with:
   ```jsx
   // In-season WEEKS (M3 §2.2): the live season's weekly score strip, the prior season's played/total in grey beneath.
   function LiveWeeksCell({ strip, position, percentileBasis, prior, priorSeason }) {
     return (
       <div>
         {strip == null
           // PROVISIONAL(no-data): in-season WEEKS strip absent · App's live weekly rows not yet a complete load of the live season (or this player has no strip entry) · loadDefenceWeeklyRows resolving complete for the live season
           ? <span className="text-dp-muted">—</span>
           : <WeeklyStrip cells={strip.cells} position={strip.position ?? position} percentileBasis={percentileBasis} />}
         {prior?.weeks != null && (
           <div className="font-dp-mono text-[10.5px] text-dp-text-5">{`${priorSeason} ${prior.played}/${prior.played + prior.missed}`}</div>
         )}
       </div>
     )
   }
   ```
   The prior line is `LiveGamesCell`'s, verbatim.
5. **Both tables' `col-games` td** (Starting ten filled-slot row and Bench row): in season render
   `<LiveWeeksCell strip={stripByPlayer?.[row.player_id] ?? null} position={row.position} percentileBasis={percentileBasis} prior={f.usage?.prior} priorSeason={dataSeason} />`;
   out of season unchanged (`GamesStripCell`). The empty-slot row's `—` is unchanged.
6. **Both tables' header:** `{inSeasonLayout ? `${phaseLiveSeason} WEEKS` : `GAMES ${dataSeason}`}` in place of
   `GAMES {inSeasonLayout ? phaseLiveSeason : dataSeason}`. Same classes. Add
   `title="Points in each completed week, coloured by rank among this league's starters at his position. Ticked: his last three played weeks."`
   to the th in season only (LineupTable's WEEKS title, minus the season-grid reference).
7. **Starting ten header key** (the three `lensHidden('usage', lens)` swatch spans): wrap in
   `{inSeasonLayout ? <in-season key> : <today's three spans, unchanged>}`. In-season key, same span classes:
   `<span className="w-2 h-2 rounded-sm bg-dp-missed" /> did not play` and
   `<span className="w-2 h-2 rounded-sm bg-dp-bye-hatch" /> bye`, plus a text-only span
   `bar height = points, colour = rank among league starters`. Each span keeps `data-testid` free — tests find
   them by text.
8. **Starting ten legend, in-season branch:** replace the sentence
   `GAMES, SHARE and SNAP are ${phaseLiveSeason}'s so far, with ${dataSeason ?? '—'} in grey beneath.` and the
   trailing `Dashed week is a bye or a week with no game recorded.` with:
   `${phaseLiveSeason} WEEKS has one bar per completed week: height is his points that week, colour is how that week ranked among this league's starters at his position — the same scale as This week. Hatched is a bye, a red square at the top a week he did not play, a dashed slot a week that did not load; the three ticked bars are his last three played weeks. The grey line beneath is ${dataSeason ?? '—'}'s games played of games. SHARE and SNAP are ${phaseLiveSeason}'s so far, with ${dataSeason ?? '—'} in grey beneath.`
   The rest of the in-season sentence (`SHARE is the player's share…`, `${unsplitClause}`) stays. The
   out-of-season branch is unchanged.
9. **PlayerCell calls** in `col-player` (Starting ten filled row, Bench row): add `photoFromMd` and
   `className={PLAYER_CELL_PHONE_CAP}`.
10. **WeakestSlots** call: add `teamOf={id => rowById.get(id)?.nfl_team ?? null}`.
11. **Header comment:** one sentence: in season the Starting ten and Bench carry /week's weekly score strip
    (M3); Defences ahead and Weakest slots use the shared PlayerCell.

### 4.4 `src/components/portfolio/DefencesAhead.jsx`

- Import `PlayerCell` from `'../dp/cells'` and `PLAYER_CELL_PHONE_CAP` from `'../dp/frozen'`.
- Local helper: `const cellRow = r => ({ player_id: r.player_id, full_name: r.name, position: r.position, nfl_team: r.team })`.
- Both tables' first td: content becomes
  `<PlayerCell row={cellRow(r)} sub={null} photoFromMd className={PLAYER_CELL_PHONE_CAP} />` — the td keeps its
  classes. The `ahead-label` div and the position div are deleted (the chip carries the position).
- This-week eyebrow text: `This week · points allowed to the row's position / G` (D8), same element/classes.
- Header comment: the "plus a label line naming the position group…" clause becomes "the position group the
  points belong to is named in the This-week eyebrow (the points are the whole group's, not this player's)".

### 4.5 `src/components/portfolio/WeakestSlots.jsx`

- Props: add `teamOf = () => null`.
- Import `PlayerCell` from `'../dp/cells'`.
- **Replace the name div** (`<div className="text-xs text-dp-text-2 truncate">…</div>`) entirely — do not nest
  PlayerCell inside it (its `truncate` would clip the cell's watermark and photo). When `row.name == null`
  render `<div className="text-xs text-dp-muted">—</div>` in its place; otherwise
  `<PlayerCell row={{ player_id: row.player_id, full_name: row.name, position: row.position, nfl_team: teamOf(row.player_id) }} sub={null} />`.
  The bar beneath stays where it is (inside the same `min-w-0` div, after the cell).
- Rows stay non-clickable.

### 4.6 `src/components/dp/frozen.js`, `cells.jsx`, `LineupTable.jsx`, `TopBar.jsx`

- `frozen.js`: `// A frozen player column's phone cap: PlayerCell truncates its name inside it (W2b-2; My Team M3).`
  `export const PLAYER_CELL_PHONE_CAP = 'max-w-[168px] md:max-w-none'`
- `LineupTable.jsx`: `className="max-w-[168px] md:max-w-none"` → `className={PLAYER_CELL_PHONE_CAP}`; add the
  import. No other change.
- `cells.jsx`: `<span className="truncate">{row.full_name}</span>` →
  `<span className="truncate" title={row.full_name ?? undefined}>{row.full_name}</span>`; the PlayerCell line of
  the header comment adds "the name truncates with the full name as its title".
- `TopBar.jsx`: D9.

## 5. Tests

Each test names what it asserts, the defect it catches, the fixture fact that makes it bite and its red step.
Shared fixture for P* (write once in the new file, not exported) — **Fixture W**:

- `nflState` `{ season: '2026', season_type: 'regular', week: 4, season_start_date: '2026-09-09' }` →
  `inSeasonLayout`, completed weeks 1–3.
- Players (in `playerRows` and `playerMap`; construction style of `PortfolioDefencesAhead.test.jsx`'s `spec`):
  owned by "My Team": `w1` WR DAL proj 18, `r1` RB PHI proj 14, `b1` WR NYG proj 8; owned by "Other Team"
  (rosterId 2): `o1` WR KC proj 25, `o2` RB KC proj 6. `rosterPositions` `['QB', 'RB', 'WR', 'TE', 'BN']` — no
  FLEX, so the one WR slot takes w1 (18 > 8) and **b1 is on the Bench**; QB and TE slots render `empty`.
  Other Team's WR (25) beats w1, so Weakest slots renders a WR row for w1 (loss 7); its RB (6) loses to r1, so
  no RB row. If `buildBestLineup`/`buildWeakestSlots` disagree with these facts, stop and report.
- `scoringSettings` `{ rec: 1, rec_yd: 0.1, rush_yd: 0.1 }`.
- `liveWeeklyRows` `{ year: 2026, complete: true, failedWeeks: [3], weeks: [`
  `{ week: 1, rows: { w1: { team: 'DAL', stats: { gp: 1, rec: 5, rec_yd: 50 } }, r1: { team: 'PHI', stats: { gp: 1, rush_yd: 120 } }, b1: { team: 'NYG', stats: { gp: 1, rec: 2, rec_yd: 20 } } } },`
  `{ week: 2, rows: { r1: { team: 'PHI', stats: { gp: 1, rush_yd: 40 } } } } ] }`
  → w1: wk1 played 10.0, wk2 **bye** (DAL has no wk-2 game), wk3 **unknown** (failed week);
  r1: wk1 12.0, wk2 4.0; b1: wk1 4.0, wk2 **dnp** (NYG plays wk 2, no b1 row).
- `nflScheduleByYear[2026]` `{ complete: true, games: [g(1,'DAL','NYG'), g(1,'PHI','WAS'), g(2,'NYG','PHI'), g(3,'DAL','PHI'), g(3,'NYG','WAS')] }`
  with `g` as in `src/utils/defencesAhead.test.js` (local copy in the test file).
- `percentileBasis` **B** `{ status: 'ready', needsPrior: false, liveSeason: 2026, priorSeason: 2025, basis: {`
  `WR: { values: Array.from({ length: 60 }, (_, i) => 30 + i), n: 60, season: 2026, source: 'live' },`
  `RB: { values: Array.from({ length: 60 }, () => 0.5), n: 60, season: 2026, source: 'live' }, QB: null, TE: null } }`
  → every WR week below 30 is percentile 0; every RB week above 0.5 is percentile 100.
- `liveSeasonTotals` `{ season: 2026, complete: true, players: { … } }` (LIVE_U's style): w1/r1/b1 each
  `gamesPlayed: 3`, `weeklyStatus` `['P','P','P', …'X' ×15]` (so the old cell would print `3/3` — P4 bites on it).
  `careerStats[2025]`: w1 `weeklyStatus` 15 × `'P'` + 2 × `'D'` + `'X'` (grey line `2025 15/17`); r1, b1 any
  17-week status.

### 5.1 `src/utils/weeklySeasonGrid.test.js` (extend)

- **U1 `buildStripsFromWeeklyResult` returns /week's own cells.** Fixture W's rows/schedule (index via
  `buildRegWeekIndex`), `season: 2026`, `currentWeek: 4`. Asserts `w1` cells `[{week:1,kind:'played',points:10},
  {week:2,kind:'bye'},{week:3,kind:'unknown'}]` (points via `toBeCloseTo`), `b1` week 2 `kind: 'dnp'`, no cell
  with `week >= 4`, `position: 'WR'`; **and** `toEqual` against
  `buildStripByPlayer(buildSeasonGrid({ groups: buildGridGroups({ starters: [...], bench: [...] }), weeklyMaps, failedWeeks, scheduleIndex, projections: null, scoringSettings, currentWeek: 4 }), 4)`
  for the same players (the /week path). Defect: a second derivation (e.g. classifying from rows alone, so a
  bye or failed week reads `dnp`). Fact that bites: w1 wk2 is a bye only via the schedule; wk3 is unknown only
  via `failedWeeks`. Red: in the new function pass `failedWeeks: []` → wk3 reads `dnp`, U1 fails.
- **U2 an absent or foreign load is `null`, never a strip.** Asserts `null` for `weeklyResult` `null`,
  `{ ...W, complete: false }`, and `{ ...W, year: 2025 }` with `season: 2026`. Defect: an unloaded week set
  renders every game week as a red "did not play" square. Red: delete the guard line → returns an object.

### 5.2 `src/components/dp/WeeklyStrip.test.jsx` (extend) — /week unchanged

- **W1 WeeklyStrip's markup is pinned.** Render `WeeklyStrip` with cells
  `[played 12.0 wk1, bye wk2, dnp wk3, unknown wk4, played 0 wk5, played 30 wk6]`, `position: 'WR'`, the WR
  basis from Fixture W; assert `container.innerHTML` `toMatchInlineSnapshot()`. **Write and run this test
  first, before any source change, so the snapshot records `5840612`'s output.** Defect: a prop or default
  added for My Team changes /week's strip. Red: change `BAR_W` from 5 to 6 → snapshot fails; revert.
- **W2 /week's cap is unchanged by the hoist** (in `src/components/week/LineupTable.test.jsx`, named "M3 W2").
  Asserts the `col-player` PlayerCell root of a filled row has class tokens `max-w-[168px]` and
  `md:max-w-none`, and `PLAYER_CELL_PHONE_CAP === 'max-w-[168px] md:max-w-none'`. Defect: the hoisted constant
  drifts and silently widens /week's phone column. Red: set the constant to `'max-w-[200px] md:max-w-none'`.

### 5.3 `src/components/dp/cells.test.jsx` (extend)

- **T9 the truncating name carries the full name as its title.** Render `PlayerCell` with
  `full_name: 'Christian McCaffrey'`; assert the `.truncate` span inside `player-cell-name` has
  `title === 'Christian McCaffrey'`, and a row with `full_name: null` has no `title` attribute. Defect: a
  truncated name with no way to read it (D-d). Red: remove the `title` prop.

### 5.4 `src/components/portfolio/PortfolioWeeklyStrip.test.jsx` (new, Fixture W)

- **P1 every Starting ten and Bench player row carries the strip, in season.** Asserts both tables' thead text
  contains `2026 WEEKS` and not `GAMES 2026`; for `w1`, `r1` (starting-ten rows) and `b1` (bench row) the
  `col-games` cell contains one `[data-testid="weekly-strip"]`; w1's slots are exactly weeks 1–3 with
  `data-kind` `played`, `bye`, `unknown` and titles `Wk 1 · 10.0 pts`, `Bye`, `Wk 3 · not loaded`; b1's week 2
  is `dnp` titled `Did not play`; `data-last3` on w1 wk1 only; the draft-picks block contains no
  `weekly-strip`. Defect: the strip missing from a table or a row type, or showing future weeks. Red: in the
  Bench row's `col-games` render `GamesStripCell` again (the Bench assertions fail).
- **P2 colour is App's basis, passed through.** Asserts w1 wk1 slot `data-pct="0"` and r1 wk1 slot
  `data-pct="100"`. Fact that bites: against w1's own played weeks (just 10.0) any locally derived basis puts
  wk1 at 50; against the league lineups' points it is > 0; reading the WR basis for r1 gives 0. Red (each
  shown failing, then reverted): (a) in Portfolio pass `percentileBasis={null}` to `LiveWeeksCell` → no
  `data-pct`; (b) pass `{ status: 'ready', basis: { WR: { values: [10] }, RB: { values: [4, 12] } } }` built in
  Portfolio instead of the prop → `data-pct` 50.
- **P3 App passes /week's basis and the live weekly rows** (in `src/__tests__/portfolioLiveLoads.test.js`,
  named "M3 P3", same source-text technique as its existing test). Asserts the `<Portfolio` element's text
  contains `percentileBasis={starterPercentiles}` and `liveWeeklyRows={selectLiveWeekly(defenceWeeklyByYear, nflState)}`;
  and the `<WeekView` element contains `percentileBasis={starterPercentiles}`. Defect: My Team coloured on a
  second basis. Red: change App's Portfolio prop to `percentileBasis={null}`.
- **P4 the old live weeks display is gone — no duplicate weeks.** In season, for w1's `col-games`: no element
  with a `title` starting `WK ` (GamesStripCell's squares); text does not contain `3/3` (the live count from
  `liveSeasonTotals`); text contains `2025 15/17` (the prior line, kept). The Starting ten header key contains
  `did not play` and `bye` and not `bye or no game`; the legend contains `2026 WEEKS has one bar per completed
  week` and not `Dashed week is a bye`. Defect: the same weeks shown twice on a row, or a stale key. Red: render
  `GamesStripCell weeks={f.usage?.live?.weeks} …` beside the strip in the Starting ten cell.
- **P5 no complete live weekly load → `—`, never red squares.** Render with `liveWeeklyRows={null}`, then with
  `{ ...W, complete: false }`: `col-games` of w1 has no `weekly-strip`, no `[data-kind="dnp"]`, and its first
  line reads `—`; the prior line still shows. Defect: an absent load drawn as "did not play". Red: in Portfolio
  call `buildSeasonGrid`/`buildStripByPlayer` directly with `liveWeeklyRows?.weeks ?? []` instead of the
  guarded function → dnp slots appear.
- **P6 out of season My Team is unchanged.** Render Fixture W with `nflState { season: '2026', season_type: 'pre', week: 4 }`
  (`week: 4` so a leaked strip would have weeks 1–3 to draw and the `weekly-strip` assertion can bite; still
  passing `liveWeeklyRows` and `percentileBasis`): no `weekly-strip` anywhere; both headers contain
  `GAMES 2025`; w1's `col-games` contains squares titled `WK 1 · Played`; the header key contains
  `bye or no game`. Also week 1 in season (`week: 1`, `inSeasonLayout` false): both headers contain
  `GAMES 2025` and no `WEEKS`. Defect: the strip or its key leaking out of season (D-a). Red (each shown
  failing, then reverted): (a) make the `col-games` ternary `true ? <LiveWeeksCell …/> : …` and the memo's
  guard `if (false)` → pre-season case fails; (b) replace `inSeasonLayout` with `phase?.phase === 'in-season'`
  in both tables' WEEKS header condition → week-1 case fails (the header reads `2026 WEEKS`).

### 5.5 Shared player cell on every inventoried table

- **D1 (`DefencesAhead.test.jsx`, replaces C1's label assertion).** C1 keeps every other assertion; replace
  `expect(getByTestId('ahead-label')…)` with: `queryByTestId('ahead-label')` is null; the This-week eyebrow
  text is `This week · points allowed to the row's position / G`; the row's first td contains one
  `player-cell` whose `player-cell-team` is `KC`, `player-cell-pos` is `RB`, name span title `Player One`,
  root classes include `max-w-[168px]`. Add the same `player-cell` check to C9's `ahead-sched-p1` row. Defect:
  a hand-rolled or three-line name cell left on Defences ahead. Red: restore the old `<div>{r.name}</div>` in
  the Rest-of-season td (C9 fails) — and, separately, restore the `ahead-label` div (C1 fails).
- **D2 (`WeakestSlots.test.jsx`, new "M3 D2").** Rows `[{ slot: 'RB', slotIndex: 1, player_id: 'r1', name:
  'Run Back', position: 'RB', mine: 8, median: 12, loss: 4 }, { slot: 'TE', slotIndex: 3, player_id: null,
  name: null, position: null, mine: 0, median: 6, loss: 6 }]`, `teamOf={() => 'PHI'}`: row 1 contains a
  `player-cell` with team `PHI` and name `Run Back`; the empty row contains no `player-cell` and shows `—`; the
  existing per-row loss text still renders. Defect: Weakest slots keeps a bare name. Red: revert the name div
  to `row.name`.
- **D3 (`PortfolioWeeklyStrip.test.jsx`, "M3 D3", Fixture W).** Every `tr` in `starting-ten` and `bench` tbody
  whose row names a player, every row of `defences-ahead`'s two tables, and every `weak-row-*` with a player
  contains exactly one `player-cell`; each `player-cell` under `starting-ten`, `bench` and `defences-ahead`
  carries `max-w-[168px]` and its photo wrapper `hidden md:flex`. Weakest slots: exactly one `weak-row-*`
  renders (w1's WR slot — Fixture W fact), and its `player-cell-team` is `DAL` (through Portfolio's
  `teamOf`, §4.3 item 10). Defect: any My Team player row left without the shared cell or the phone cap, or
  Weakest slots' team never wired (renders `FA`). Red (each shown failing, then reverted): (a) drop
  `className={PLAYER_CELL_PHONE_CAP}` from the Bench PlayerCell; (b) remove the `teamOf` prop from
  Portfolio's `<WeakestSlots>` → team reads `FA`.

### 5.6 `src/components/shell/TopBar.test.jsx` (extend)

- **TB1 the league pill can shrink (D9).** Render with `selectedLeague: { name: 'A Very Long Dynasty League Name' }`
  and a user. Asserts the element that contains the league name span: its nearest ancestor `div` with class
  `items-center` and `gap-2.5` has no `shrink-0` token and has `min-w-0`; the name span has
  `title="A Very Long Dynasty League Name"`. jsdom cannot measure, so this pins the cause found at 375; the
  smoke (§7) pins the number. Defect: the 8px page overflow at 375 on every surface. Red: restore `shrink-0`.

### 5.7 Existing tests that change (update to the new correct outcome — do not merely make green)

- `Portfolio.test.jsx` **T1**: `games` expectations become: `not.toContain('3/3')` and `toContain('2025 15/17')`
  (the live count left with the old strip, §2.2); everything else in T1 unchanged.
- `Portfolio.test.jsx` **T3**: in-season header assertions for the games column become `2026 WEEKS`;
  out-of-season ones stay `GAMES 2025`.
- `Portfolio.test.jsx` **T4**: the legend's in-season assertions follow §4.3 item 8 (assert the new sentence's
  `2026 WEEKS has one bar` and the unchanged `unsplitClause` behaviour).
- `src/__tests__/opponentStrengthViewOnly.test.js` **T25b**: the expected list ends with
  `'percentileBasis={starterPercentiles}'` **twice** (WeekView's route first, then Portfolio's, in App.jsx
  source order); retitle the test and its comment from "the /week prop" to "the /week and My Team props". It
  still fails if any other App.jsx line (e.g. in the playerRows chain) references the basis.
- Any other assertion found reading `GAMES 2026`, the live `p/t` count, the in-season swatch text or the
  `ahead-label`: update to the §2 "after" column and list it in the hand-back. If one cannot be expressed that
  way, stop and report.

## 6. Docs (same commit)

- `docs/ui.md` → My Team section, *In-season usage* paragraph: `GAMES` becomes `{liveSeason} WEEKS` in season —
  `dp/WeeklyStrip` over `weeklySeasonGrid.js`'s `buildStripsFromWeeklyResult` (App's live weekly loader
  result, /week's cells), coloured from App's `starterPercentiles` (`percentileBasis`), with the
  `{dataSeason}` played/total in grey beneath; renders `—` until that loader result is a `complete` load of
  the live season. SHARE/SNAP text unchanged.
- `docs/ui.md` → My Team, Defences ahead paragraph: the label line now lives in the This-week eyebrow; rows use
  `PlayerCell`. Weakest slots: rows use `PlayerCell` (`teamOf` from Portfolio).
- `docs/ui.md` → *Shared player cell* paragraph (≈L565): add Defences ahead and Weakest slots to the list; the
  name truncates with the full name as its title; frozen-column callers on a phone use `photoFromMd` and
  `PLAYER_CELL_PHONE_CAP` (`dp/frozen.js`).
- `docs/nav/components.md`: rows for `portfolio/Portfolio.jsx` (new props `percentileBasis`, `liveWeeklyRows`;
  WEEKS column), `portfolio/DefencesAhead.jsx`, `portfolio/WeakestSlots.jsx` (`teamOf`), `dp/WeeklyStrip.jsx`
  ("My Team may reuse it" → "and My Team's Starting ten/Bench in season"), `dp/frozen.js`
  (`PLAYER_CELL_PHONE_CAP`), `dp/cells.jsx` (name title), `shell/…TopBar` (league name truncates).
- `docs/nav/utils.md`: `weeklySeasonGrid.js` row gains `buildStripsFromWeeklyResult`.
- Mechanism only, no availability claims (`docsAvailabilityClaims.test.js`). Leave the stale surfaces table
  and rail groups in `docs/ui.md` alone.

## 7. Copied definitions

None. LineupTable's `'max-w-[168px] md:max-w-none'` literal is **moved** to `dp/frozen.js` and imported by
both callers (W2 pins the value). The `{dataSeason} p/t` line moves verbatim from the deleted `LiveGamesCell`
into `LiveWeeksCell` (a move, not a copy).

## 8. Smoke (Session 2)

Start from `.claude/launch.json` (`preview_start` name `sleeper-dashboard`; if 5173 is taken it moves port —
use the reported one). `Colts_420_Reloaded` / Dynasty 040; wait for the career load. Use the browser pane's
`resize_window`. Before **and** after the change, screenshot:

1. My Team at **1440×900**: Starting ten and Bench in the Usage view (WEEKS column, key, legend open),
   Defences ahead (both parts), Weakest slots. Do not defer the 1440 check.
2. My Team at **375**: the same sections; names on one line, truncated with title.
3. This week at **1440×900** and **375**: lineup WEEKS column (strip unchanged), player cells (unchanged apart
   from the hover title).
4. Report `document.documentElement.scrollWidth` vs `clientWidth` at 375 on My Team **and** This week, before
   (expect 383/375) and after (expect 375/375). If after is still > clientWidth, find the element (unclipped
   elements whose right edge passes clientWidth) and report — do not improvise a second fix.
5. Compare one player's strip on My Team with the same player's on This week: same bars, kinds and titles.
6. No console errors. Reset the viewport (`preset: desktop`) and stop the server when done.

## 9. Session 2 handoff

Run on **sonnet** (medium). Implement exactly §4; write W1 first (§5.2). Stop and report on any unanswered design
question, on any stated test literal that does not match the running code (do not adjust it to green), and on
anything in §1 found wrong. Done-definition per `CLAUDE.md` (tests, lint 0, clean build, smoke §8, commit
before hand-back).

For each test in the task file, check every assertion it names is actually made.
For each new or changed test, apply the task file's named red-step mutation, show the test fail on it, then revert. A substitute red step must say why it still triggers the named defect, or the test counts as not shown red.

Hand-back per `../CLAUDE.md` Session 2: SHA, files touched, deviations, per-test assert/defect/red confirmation,
the list of existing assertions changed under §5.7, the `grep -rn "PROVISIONAL(" src/` output (expect exactly one
new tag, `LiveWeeksCell`'s; none removed), the §8 screenshots and scrollWidth numbers.

## 10. Open items (for Anton, not blocking)

1. **Tile vs strip.** The `GAMES MISSED · {liveSeason}` header tile counts misses from the season file's
   per-week status; the strip's red squares come from Sleeper's weekly rows plus the schedule (This week's
   rule — bench backups who sat count as "did not play", the known L5 limitation). The two can differ by a
   week for some players. Not changed here.
2. **Top bar on phones.** The fix truncates the league name (≈7 characters visible at 375 with the current
   username/Switch/League controls). If that reads badly, the alternative is hiding the username's avatar or the
   Switch label on phones — a design call, not in this slice.
3. **Strip before the weekly rows arrive.** On a cold load the WEEKS cells read `—` until the live weekly rows
   finish (they load alongside Defences ahead's numbers).

## Fix pass 1

From implementation-reviewer (full) on `49340f8..2eafacd`: 2 flags, both accepted. **Test and docs only — no source
change.** Touch only `src/components/portfolio/PortfolioWeeklyStrip.test.jsx` and `docs/nav/components.md`.

**F1 (medium, test-honesty) — P4's key check cannot bite.** `startHead` is the whole `starting-ten` card's text, which
includes `starting-ten-legend`; the in-season legend already says "a week he did not play" and "Hatched is a bye", so
P4 stays green with the in-season key spans (`Portfolio.jsx` ~L1184–1188) deleted, and the named `bye` assertion is
missing.

1. In M3 P4 replace `const startHead = screen.getByTestId('starting-ten').textContent` with the card's **header
   only**: `const startHead = screen.getByTestId('starting-ten').firstElementChild.textContent` (the
   `border-b` header div that holds the title, the LensSwitch and the key; the legend lives in a later sibling).
2. Assert on it: `toContain('did not play')`, `toContain('bye')`, `not.toContain('bye or no game')` (kept), and
   `not.toContain('WEEKS has one bar')` (proves the legend is outside the scope).
3. Red step (shown failing, then reverted): in `Portfolio.jsx` delete the two in-season key spans
   (`… bg-dp-missed" /> did not play` and `… bg-dp-bye-hatch" /> bye`) → P4 fails. If P4 stays green, stop and report.
   Leave the rest of P4 and every other test as is.

**F2 (low, fidelity) — a nav row records history.** In `docs/nav/components.md`'s `portfolio/Portfolio.jsx` row,
delete the clause `the two new props are \`percentileBasis\` and \`liveWeeklyRows\`; ` (the sentence before it already
names both props). Leave the older "the two new props are `nflState` and `liveSeasonTotals`" clause alone — not this
slice.

Done: `npm test`, `npm run lint`, `npm run build` clean; commit `Fix pass 1: M3 P4 key scope and nav row`
(unpushed). Hand back the SHA, the diff, and the red-step result.
