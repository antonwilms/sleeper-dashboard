# Brief M2b — "Defences you face" leaves This week; My Team gains "Defences ahead"

Review depth: full — two surfaces change at once; new section on Portfolio.jsx (1,448 lines).

**Revision 1 (2026-11-21): plan-reviewer (full) flags 1–6 folded in** (Anton: "Fold all flags in").
1 → hook row deletes the `currentSeason` local; 2 → T13 lives in `LineupTable.test.jsx` (named "M2b T13"),
weeklyLineup.test.js gets T15 (`allowsForOpponent` null branch); 3 → T14 red step is a named `from` import in
`seasonProjection.js`; 4 → C4 uses exact `classList.contains` tokens and pins RANK's tone; 5 → DefencesFaced
anchors are symbols/text, not line numbers; 6 → `weeklySchedule.js` header comment row added.

Session 1: opus, high. **Session 2: sonnet, medium.** Visual change on two pages — Session 2 runs the app;
Anton judges. Planned at app `ac2d4b2` ("Sign-off: Brief M2a", main == origin/main after `git fetch`).
Data repo: not consulted, not touched. No data contract changes.
Design source: Claude.ai project doc `claude/ux-briefs-week-and-myteam.md` → Brief M §6 (Defences bullet),
Display rule, Season-order convention, "Opponent points allowed = whole position group" (not on disk).
M1/M2a are done and are not re-planned; this executes the M2b outline in `myteam-m2a-offences.md` §11.
Decisions D-a…D-d were made in the Claude.ai project and are not revisited here.

---

## 0. For Anton

My Team gains a "Defences ahead" card, directly under the offences table (where SOS lives). For each player
in your starting ten it shows this week's opponent with every number This week's "Defences you face" panel
shows today, then the rest of the regular season week by week: who he plays and how many points that defence
allows to his position, with byes marked. In the same commit the panel leaves This week, so the information
is never missing and never shown twice. Out of season My Team looks exactly as it does today. This week's
ALLOWED / G and YDS ALLOWED lineup columns keep identical numbers. Cost: no new downloads. Risk: low — it is
display only. See §10 — mainly, SOS and the new schedule count "remaining" slightly differently.

## 1. View-only statement

Nothing in this slice reaches `playerRows`, `projectedPPG`, the dynasty score, a snapshot, a `factors` entry
or `docs/cross-repo-registry.md`. It reads App's existing `defenceAllowed`, `nflScheduleByYear` and
`nflState` props in one more view component (Portfolio already receives all three), adds no App state, no
effect and no load, and deletes one /week panel. `opponentStrengthViewOnly.test.js`,
`weeklyDecisionViewOnly.test.js` and `scheduleViewOnly.test.js` keep guarding it, with one extension (T14).
**If Session 2 finds any of this wrong, stop and report.**

## 2. Metric inventory (the move contract)

Every element `src/components/week/DefencesFaced.jsx` renders today, where it lands in part (a) of the new
`src/components/portfolio/DefencesAhead.jsx`, and the test that pins it (§5). Old testids `defences-*` become
`ahead-*`.

| # | Element today (DefencesFaced) | Lands as (part a) | testid | Test |
|---|---|---|---|---|
| 1 | Row per **filled** starter, empty slot no row | row per filled **starting-ten** slot (D-a), slot order | `ahead-row-<id>` | U5, C1, P1 |
| 2 | DEF cell: name + position | unchanged + label line (row 18) | in row | C1 |
| 3 | VS: logo + Sleeper code; `BYE`; `—`; LAR→`lar.png` | unchanged | `ahead-vs` | C2, P2 |
| 4 | `{prior} PTS/G` (prior half, 1 dp, `—`) | unchanged | `ahead-prior` | U1, C1, P5 |
| 5 | "not blended" + muted prior when `weight === 1` | unchanged | in `ahead-prior` | U6, C3 |
| 6 | `{season} SO FAR` (current half) | unchanged | `ahead-current` | U1, C1, P5 |
| 7 | BLENDED value (1 dp) | unchanged, **band-toned** (D3) | `ahead-blended` | U1, C1, C4, P5 |
| 8 | Per-row blend bar + `n%` | unchanged | in `ahead-blended` | C1 |
| 9 | RANK `n of 32` | unchanged, band-toned (D3); gains testid | `ahead-rank` | C1, P5 |
| 10 | PASS YD/G two-line (current / `2025 · prior`, rounded) | unchanged | `ahead-pass` | U1, C5, P5 |
| 11 | RUSH YD/G two-line | unchanged | `ahead-rush` | U1, C5, P5 |
| 12 | RECORD `W-L` / `W-L-T`, `—` never `0-0` | unchanged | `ahead-record` | U1, C6, P5 |
| 13 | `thru wk N` / `no wk scored` when `unscored > 0` | unchanged | in `ahead-record` | C6 |
| 14 | Bye row: `—` in every number cell | unchanged | — | C2 |
| 15 | Two-line headers: label + current season; title names both | unchanged | `thead` | C7 |
| 16 | Header chip `k {PRIOR_WEIGHT_GAMES}`, no header % | unchanged | card header | C1 |
| 17 | Footer prose (scoring basis, blend bar, yards, records) + one line per failed season | unchanged + band sentence (D3) | `ahead-failed-weeks` | C8, P5 |
| 18 | *(new — brief Display rule)* `allowed to all {POS}s / G` | row sub-line under the position | `ahead-label` | C1 |
| 19 | *(new, part b)* one column per remaining REG week: opponent + points allowed to the row's position | `ahead-schedule` table | `ahead-wk-<week>` | U2–U4, C9, P3 |

## 3. Decisions (Session 2 does not revisit)

**D1 — Gate: in season = `phase?.phase === 'in-season' && currentWeek >= 1`** (Portfolio's existing
`phase`, and `currentWeek = nflState?.week ?? 0`, M2a D4). Not `inSeasonLayout`: that turns on only from week
2 (`completedWeeks >= 1`), and /week showed the panel from week 1 — gating on `inSeasonLayout` would leave
week 1 with the panel on neither page (D-d). Offseason, preseason and postseason (`late-season`): no section,
no placeholder (D-b). The section also requires at least one filled starting-ten slot.

**D2 — Placement: immediately after `<TeamOffences>`, before Bench**, rendered independently of
`offenceRows.length` (a missing team-context file must not hide it). SOS is the per-team summary of
remaining opponents and lives in that table's last column; Defences ahead is the per-starter detail behind
it, so it reads next. Side by side was rejected: both are wide tables that already scroll at 1440.

**D3 — Colour: LineupTable's five coarse bands, nothing else (D-c).** `allowsToneClass(rank)` moves verbatim
from `LineupTable.jsx` L37–47 to a new `src/components/dp/allowsTone.js` (exported, with its comment);
LineupTable imports it. Applied to part (a)'s BLENDED value and RANK text (BLENDED is the very number /week's
ALLOWED / G shows, toned there) and to each part (b) points-allowed number. The halves (#4, #6), yards and
records stay untoned, as today. No percentile palette, no easy/hard word. Footer gains one sentence:
`Points allowed are coloured in the same bands as This week's ALLOWED / G: ranks 23–32 allow the most, ranks 1–10 the fewest.`

**D4 — Starters = My Team's starting ten (D-a)**: `myLineup.slots` (the `proj` lineup Portfolio's Starting
ten renders), filled slots only, slot order. Team = `rowById.get(id)?.nfl_team ?? null` (Sleeper domain, the
same field `offenceRows` buckets on).

**D5 — Opponents from the live season's schedule only.** `liveSchedule = nflScheduleByYear?.[phaseLiveSeason]`,
used only when `.complete`. Portfolio builds `buildRegWeekIndex(liveSchedule)` itself and resolves each week
with `resolveTeamWeek`. That makes Portfolio the index's second call site: the "one call site" comments in
`useWeeklyDecision.js` (~L246) and `weeklyOwnProjection.js` (~L40) are reworded to "one call site per
surface (useWeeklyDecision for /week, Portfolio for My Team)" — no guard test exists for the old wording.
/week's fallback to Sleeper's projection-payload opponent is **not** carried: My Team loads no weekly
projections, so an unanswerable week reads `—`.

**D6 — Weeks.** Part (a) is `currentWeek`. Part (b) is `currentWeek + 1 … phase.regularWeeks` — played weeks
and this week are excluded (this week is part (a)). Each cell: `resolveTeamWeek` → `game` (opponent +
points allowed), `bye` (`BYE`), `unknown` (`—`, e.g. a week the file has no REG games for).

**D7 — Points allowed per remaining week = `fpaTable[opponentEra][pos]`**, the same blended value part (a)'s
BLENDED and SOS average, with its rank `fpaRanks[opponentEra][pos]` for the tone. 1 dp. Never summed.

**D8 — Seasons.** `priorSeason = defenceAllowed?.prior?.season ?? dataSeason` and `currentSeason =
defenceAllowed?.current?.season ?? null` (Portfolio already computes `currentSeason`, L562, and passes the
prior expression to TeamOffences, L1298 — hoist it to a `priorAllowedSeason` const and use it in both).
Records: `currentRecords = buildTeamRecords(liveSchedule|null, { throughWeek: Math.max(0, currentWeek - 1) })`,
`priorRecords = buildTeamRecords(nflScheduleByYear?.[dataSeason] complete-gated|null)` — exactly the hook's
two calls. Failed weeks: `buildDefenceFailedWeeks(defenceAllowed)`.

**D9 — Moves, not copies.** (i) `buildDefenceFailedWeeks` moves from `useWeeklyDecision.js` to the new
`src/utils/defencesAhead.js`. (ii) The allows/rank/weight block in `weeklyLineup.js` `buildRow` (L110–119)
becomes an exported `allowsForOpponent({ fpaTable, fpaRanks, opponentEra, position })` in the same file,
returning `{ allows, allowsRank, weight }` (all `null` when `opponentEra == null`), and `buildRow` calls it —
body unchanged. (iii) `allowsToneClass` per D3. (iv) DefencesFaced's local helpers (`fpaText`, `yardsText`,
`recordText`, `failedWeeksLine`, `TwoLineTh`, `TwoLineCell`) move into `DefencesAhead.jsx` with the file's
deletion. No definition exists twice afterwards.

**D10 — Copy.** Card title `Defences ahead`; subtitle `Week {currentWeek} · {liveSeason} · your starting ten`;
part (a) caption `This week`; part (b) caption `Rest of season · WK {first}–{last}`. Part (b) empty states:
schedule not loaded → `No {liveSeason} schedule is loaded, so the weeks ahead are not shown.`; no weeks left →
`No regular-season weeks remain.` In both cases part (a) still renders (VS `—` when unloaded).

## 4. Changes by file (touch list)

| File | Change |
|---|---|
| `src/utils/defencesAhead.js` | **New** — `buildDefencesAhead`, `buildDefenceFailedWeeks` (§4.1) |
| `src/utils/weeklyLineup.js` | Export `allowsForOpponent`; `buildRow` calls it (D9 ii) |
| `src/components/dp/allowsTone.js` | **New** — `allowsToneClass`, moved (D3) |
| `src/components/portfolio/DefencesAhead.jsx` | **New** — presentational (§4.2) |
| `src/components/portfolio/Portfolio.jsx` | Hoisted `fpaTable`/`fpaRanks`; schedule index; records; section (§4.3) |
| `src/components/week/LineupTable.jsx` | Import `allowsToneClass`; delete local copy; L329–330 PROVISIONAL text: `…Defences you face renders it…` → `…My Team's Defences ahead renders it…` |
| `src/components/week/WeekView.jsx` | Remove `<DefencesFaced>`, its import, `priorScheduleSeason`/`priorScheduleEntry`/`priorSchedule`, the `deriveDataSeason` import, the hook's `priorSchedule` arg, and destructured `priorAllowed, currentAllowed, currentSeason, priorRecords, currentRecords, defenceFailedWeeks`; header comment drops "Defences you face (§2)" and adds "Defences moved to My Team's Defences ahead (myteam-m2b-defences-ahead.md)" |
| `src/hooks/useWeeklyDecision.js` | Remove param `priorSchedule`, memos `priorRecords`/`currentRecords`/`defenceFailedWeeks`, export `buildDefenceFailedWeeks`, import `buildTeamRecords`; return drops `priorAllowed, currentAllowed, currentSeason, priorRecords, currentRecords, defenceFailedWeeks`. Delete the now-unused `currentSeason` local (~L233, `defenceAllowed?.current?.season ?? null`) or lint goes red. Keep the `priorAllowed`/`currentAllowed`/`priorSeason` **locals** (fpaTable, `matchupCols` YDS, `priorSeason` still returned). Comments at ~L98, ~L226–228, ~L246, ~L250, ~L261 updated (no "DefencesFaced") |
| `src/utils/weeklyOwnProjection.js` | ~L40 comment only (D5) |
| `src/utils/weeklySchedule.js` | Header comment only (L1–3): "One util, two callers…" → names its callers — `/week`'s lineup rows and season grid (via useWeeklyDecision/weeklyLineup), and My Team's Defences ahead (`Portfolio.jsx`: `buildRegWeekIndex`, `buildTeamRecords`; `defencesAhead.js`: `resolveTeamWeek`) |
| `src/components/week/DefencesFaced.jsx` | **Delete** |
| `src/components/week/DefencesFaced.test.jsx` | **Delete** — every case migrated (§5 migration map) |
| `src/hooks/useWeeklyDecision.test.js` | `buildDefenceFailedWeeks` describe moves to `defencesAhead.test.js`; import trimmed; + T12 |
| `src/components/week/WeekView.test.jsx` | STUB drops the six removed keys; + T10, T11 |
| `src/__tests__/weeklyDecisionViewOnly.test.js` | + T14 |
| `src/components/week/LineupTable.test.jsx` | + T13 (named "M2b T13" — the file already has a "matchup cells (T13)" describe at ~L508) |
| `src/utils/weeklyLineup.test.js` | + T15 |
| New tests | `src/utils/defencesAhead.test.js`, `src/components/portfolio/DefencesAhead.test.jsx`, `src/components/portfolio/PortfolioDefencesAhead.test.jsx` |
| Docs | §6 |

`App.jsx` is **not** touched (Portfolio already gets `defenceAllowed`, `nflScheduleByYear`, `nflState`).

### 4.1 `src/utils/defencesAhead.js`

Header comment: purpose (My Team's Defences ahead rows), pure/no React/no I/O, view-only, era-domain join
(`opponentEra` keys every map; `opponent` display only, CR-16), cites this task file. Imports:
`resolveTeamWeek` (`./weeklySchedule`), `allowsForOpponent` (`./weeklyLineup`), `computeFpaPerGame`,
`computeYardsPerGame` (`./opponentStrength`).

```js
export function buildDefenceFailedWeeks(defenceAllowed)  // moved verbatim (D9 i)

export function buildDefencesAhead({
  slots,            // myLineup.slots: [{ slot, player_id, name, position, points }]
  teamOf,           // (player_id) => Sleeper-domain team | null
  scheduleIndex,    // buildRegWeekIndex(liveSchedule) | null
  currentWeek,      // integer >= 1
  lastWeek,         // phase.regularWeeks
  fpaTable, fpaRanks,              // buildFpaTable / rankFpaTable over defenceAllowed halves
  priorAllowed, currentAllowed,    // defenceAllowed.prior/current .teams | null
  priorRecords = {}, currentRecords = {},
})
// -> { weeks: number[], rows: Row[] }
// weeks = [currentWeek + 1 .. lastWeek] (empty when currentWeek >= lastWeek)
// Row = { slot, player_id, name, position, team,
//         opponent, opponentEra, bye, allows, allowsRank, weight, notBlended,
//         prior, current, yardsPrior, yardsCurrent, recPrior, recCurrent,
//         ahead: [{ week, status: 'game'|'bye'|'unknown', opponent, opponentEra, allows, allowsRank }] }
```

Per filled slot (`player_id != null`): `team = teamOf(id)`; `r = resolveTeamWeek(scheduleIndex, team,
currentWeek)`; `bye = r.status === 'bye'`; `opponent/opponentEra` from a `game`, else `null`;
`{ allows, allowsRank, weight } = allowsForOpponent({ fpaTable, fpaRanks, opponentEra, position })`;
then exactly the body of DefencesFaced's `rows` `useMemo` (the `.map(r => { … })` inside it): `empty = bye || opponent == null`, `pos = position.toLowerCase()`,
`prior/current = computeFpaPerGame(…Allowed, opponentEra, pos)`, `yardsPrior/yardsCurrent =
computeYardsPerGame(…)`, `recPrior/recCurrent = …Records?.[opponentEra] ?? null`, all `null` when `empty`;
`notBlended = weight === 1` (keep DefencesFaced's comment above `const notBlended`, starting "The blend drops the prior once gCur reaches FPA_PRIOR_DROP_GAMES"). `ahead` maps `weeks` through
`resolveTeamWeek(scheduleIndex, team, week)`; a `game` cell reads `fpaTable?.[opponentEra]?.[pos] ?? null`
and `fpaRanks?.[opponentEra]?.[pos] ?? null`; `bye`/`unknown` cells carry `null`s.

### 4.2 `src/components/portfolio/DefencesAhead.jsx`

`export function DefencesAhead({ rows = [], weeks = [], currentWeek, liveSeason, priorSeason = null,
currentSeason = null, failedWeeks = [], scheduleLoaded = false })`. Presentational, no memo. Root
`data-testid="defences-ahead"`, card classes as TeamOffences' root. Header: title, subtitle (D10), right-aligned
`k {PRIOR_WEIGHT_GAMES}` (import from `opponentStrength`). Header comment: what it is, D-a…D-d, D3's bands,
season order (current main / prior grey naming its season), cites this file and the old panel's lineage
(`weekly-decision-2-panels.md` §2, `defence-numbers-rebuild.md` §6.3).

- **Part (a)** — caption `This week`, then `FrozenScroll` + table with DefencesFaced's nine columns, markup
  and classes as today (DefencesFaced's `<table>` element, `<thead>` through `</tbody>`), first column frozen (`FROZEN_FIRST FROZEN_EDGE bg-dp-card` on `th`/`td`,
  as Portfolio's picks table). Row testid `ahead-row-<id>`; cell testids per §2. DEF cell gains a third line
  `<div data-testid="ahead-label" className="text-[10px] text-dp-muted-2">allowed to all {position}s / G</div>`.
  BLENDED number and RANK text take `allowsToneClass(r.allowsRank)` (when non-empty), replacing
  `text-dp-text` / `text-dp-muted`.
- **Part (b)** — caption per D10, then (if `scheduleLoaded && weeks.length`) `FrozenScroll` + table
  `data-testid="ahead-schedule"`: frozen first column (name, position), then one `th`
  `data-testid="ahead-wk-head-<week>"` reading `WK {week}` per week, ascending (season order). Row testid
  `ahead-sched-<id>`; cell `data-testid="ahead-wk-<week>"`: `game` → line 1 opponent code (`text-dp-text-2`,
  11px mono, no logo), line 2 `allows.toFixed(1)` in `allowsToneClass(allowsRank)` (or `—` muted when null);
  `bye` → `BYE` (muted); `unknown` → `—`. Otherwise the matching D10 sentence.
- **Footer** — DefencesFaced's footer prose verbatim (the footer `<div>` after `</table>`'s wrapper, from
  "Points allowed use this league&rsquo;s scoring" to "marks a record that trails the completed weeks."), then D3's sentence, then the failed-weeks lines
  (`ahead-failed-weeks`, `failedWeeksLine` unchanged).

### 4.3 `src/components/portfolio/Portfolio.jsx`

1. Imports: `buildDefencesAhead`, `buildDefenceFailedWeeks` (`../../utils/defencesAhead`);
   `buildRegWeekIndex`, `buildTeamRecords` (`../../utils/weeklySchedule`); `DefencesAhead` (`./DefencesAhead`).
2. L561–571: hoist `const fpaTable = useMemo(() => buildFpaTable({ prior: priorAllowed, current: currentAllowed }), [priorAllowed, currentAllowed])`
   and `const fpaRanks = useMemo(() => rankFpaTable(fpaTable), [fpaTable])`; `sosTable`'s memo uses the hoisted
   `fpaTable` (deps `[fpaTable, nflScheduleByYear, sosSeason]`). SOS output unchanged — no other SOS edit.
   Add `const priorAllowedSeason = defenceAllowed?.prior?.season ?? dataSeason` and use it at L1298.
3. After it: `const defencesInSeason = phase?.phase === 'in-season' && currentWeek >= 1` (D1);
   `liveSchedule` (D5, complete-gated, `null` unless `defencesInSeason`); `liveScheduleIndex =
   useMemo(buildRegWeekIndex(liveSchedule))`; `priorSchedule` (`nflScheduleByYear?.[dataSeason]`,
   complete-gated); the two records memos and `defenceFailedWeeks` memo (D8); `defencesAhead = useMemo(() =>
   defencesInSeason ? buildDefencesAhead({ slots: myLineup?.slots ?? [], teamOf: id => rowById.get(id)?.nfl_team
   ?? null, scheduleIndex: liveScheduleIndex, currentWeek, lastWeek: phase.regularWeeks, fpaTable, fpaRanks,
   priorAllowed, currentAllowed, priorRecords, currentRecords }) : null, [...])`.
4. Render (D2), right after the `TeamOffences` block:
   `{defencesAhead && defencesAhead.rows.length > 0 && (<DefencesAhead rows={defencesAhead.rows}
   weeks={defencesAhead.weeks} currentWeek={currentWeek} liveSeason={phaseLiveSeason}
   priorSeason={priorAllowedSeason} currentSeason={currentSeason} failedWeeks={defenceFailedWeeks}
   scheduleLoaded={liveScheduleIndex != null} />)}` with comment `{/* ── Defences ahead (in season) ── */}`.
5. File header comment: one sentence — in season (from week 1) a Defences ahead card follows the offences
   table: this week's opponent per starting-ten player and the rest of the REG schedule.

## 5. Tests

Each test names its assertion, defect, red-step mutation and biting fixture fact. **If a stated literal disagrees with the running code, stop and report — do not adjust it to
green.**

### Fixture F (shared by U*, P*; write once per test file, not exported)
- Live schedule `2026` (`complete: true`), REG games `g(week, home, away, homeScore, awayScore)`:
  wk1 `GB 20–17 MIN`, `DET 24–20 CHI`, `LA 21–14 SEA`; wk2 `DET 24–10 GB`, `CHI 13–10 LA`; wk3 `GB 21–14 CHI`,
  `DET 27–20 LA`; wk4 (unplayed, `null` scores) `DET–GB`, `LA–CHI`; wk5 `CHI–DET`, `LA–GB`; wk6 `LA–CHI`,
  `GB–MIN` (**DET has no wk6 game → bye**); no games wk7–18.
- `2025` schedule (`complete: true`): wk4 `DET 20–17 MIN` (DET's 2025 wk4 opponent is MIN, not GB), wk1
  `GB 30–10 MIN`.
- `defenceAllowed`: prior `{ season: 2025, failedWeeks: [], teams: { GB: { gp: 17, pts: { qb: 0, rb: 340, wr: 306, te: 0 }, passYd: 4080, rushYd: 1700 }, CHI: { gp: 17, pts: { qb: 0, rb: 170, wr: 272, te: 0 }, passYd: 3400, rushYd: 1360 } } }`
  (GB 20.0 RB / 18.0 WR / 240 / 100; CHI 10.0 RB / 16.0 WR / 200 / 80);
  current `{ season: 2026, failedWeeks: [2], teams: { GB: { gp: 3, pts: { qb: 0, rb: 90, wr: 72, te: 0 }, passYd: 600, rushYd: 270 } } }`
  (GB 30.0 RB / 24.0 WR / 200 / 90).
  → `fpaTable.GB.rb = (3·30 + 3·20)/6 = 25.0`, weight `0.5`; `fpaTable.CHI.rb = 10.0`; RB ranks CHI 1, GB 2.
- Starters: `rb1` RB team `DET`, `wl1` WR team `LAR`. `currentWeek 4`, `lastWeek 18`.

### `src/utils/defencesAhead.test.js`

- **U1 — this-week row carries every metric.** Asserts `rb1`'s row: `opponent 'GB'`, `opponentEra 'GB'`,
  `prior 20`, `current 30`, `allows 25`, `allowsRank 2`, `weight 0.5`, `notBlended false`,
  `yardsPrior {pass 240, rush 100}`, `yardsCurrent {pass 200, rush 90}`, `recCurrent {w:2,l:1,t:0,…}` (GB wk1–3),
  `recPrior` from a 2025 records map (`{w:1,l:0,t:0}`). Fails if any field is dropped or read from the wrong
  half. Red: in `buildDefencesAhead` set `yardsPrior` from `currentAllowed`. Bites: GB's halves differ (240 vs 200).
- **U2 — remaining weeks exclude played weeks and this week.** Asserts `weeks` equals `[5, …, 18]` (14 entries),
  that `rb1.ahead[0].week === 5`, and no `ahead` entry has `week <= 4`. Fails if weeks start at `currentWeek`
  or at 1. Red: `currentWeek + 1` → `currentWeek`. Bites: wk4 has a real game, so an included wk4 is visible.
- **U3 — bye shown as bye.** Asserts `rb1.ahead` for week 6 is `{ status: 'bye', opponent: null, allows: null }`
  and week 7 is `status 'unknown'`. Fails if a bye is read as unknown or a no-games week as a bye. Red: map
  `resolveTeamWeek`'s `bye` to `unknown`. Bites: wk6 has REG games, DET is absent from them.
- **U4 — ahead cell reads the row's position group.** Asserts `wl1.ahead` week 5 (LA–GB) is
  `{ status: 'game', opponent: 'GB', allows: 21 (=(3·24+3·18)/6), allowsRank }` and `rb1.ahead` week 5 (CHI) has
  `allows 10`. Fails if the cell reads another position's column or the Sleeper code. Red: read
  `fpaTable[opponentEra].rb` unconditionally. Bites: GB WR 21.0 ≠ RB 25.0. `wl1`'s team `LAR` resolves via
  CR-16 (Rams in the schedule as `LA`) — the wk4 opponent is `CHI` with `opponentEra 'CHI'`.
- **U5 — empty slot gets no row.** `slots` `[rb1, { slot: 'FLEX', player_id: null }]` → `rows.length 1`.
  Red: drop the `player_id != null` filter.
- **U6 — notBlended exactly when weight is 1.** Current GB `gp: 9` (FPA_PRIOR_DROP_GAMES) → `notBlended true`,
  `weight 1`; Fixture F → `false`. Red: `notBlended = weight >= 0.5`. Bites: F's weight is exactly 0.5.
- **U7 — schedule absent.** `scheduleIndex null` → `rb1.opponent null`, `prior/current/allows null`, every
  `ahead` cell `unknown`; row still present. Red: return `[]` rows when index is null.
- **U8 — `buildDefenceFailedWeeks`**: the four cases moved verbatim from `useWeeklyDecision.test.js` L30–49.

### `src/components/portfolio/DefencesAhead.test.jsx` (migration of DefencesFaced.test.jsx + new)

Rows built inline (like the old `starterRow`, with the new fields). **Migration map** — each old case kept,
renamed to `ahead-*`, assertions unchanged:

| Old case (DefencesFaced.test.jsx) | New |
|---|---|
| renders both halves; halves absent → `—`, row renders | C1 |
| joins on the era key (LAR/LA) — now proven in U4; render half kept: VS text `LAR` | C2 |
| empty starter slot no row | U5 (rows arrive pre-filtered) |
| ≥9 games → "not blended" | C3 |
| own weight, no header %, `k 3` | C1 |
| pass/rush current over prior, rounded | C5 |
| record W-L / W-L-T; `thru wk N` only when `unscored > 0`; `no wk scored` not `0-0` | C6 |
| bye row → `——` in pass/rush/record | C2 |
| failed-weeks lines singular/plural; none → no line | C8 |
| logo describe (4 cases incl. `lar.png`) | C2 |
| season order T17 | C7 |

- **C1** additionally asserts `ahead-label` reads `allowed to all RBs / G` for an RB row and `ahead-rank`
  reads `2 of 32`. Fails if the label or rank is dropped. Red: delete the `ahead-label` div.
- **C4 — bands on BLENDED/RANK only.** Rows with `allowsRank` 27, 23, 6, 10, 15 → the BLENDED value span's
  `classList.contains(...)` is true for exactly `text-dp-up-text`, `text-dp-up`, `text-dp-down-text`,
  `text-dp-down`, `text-dp-text` respectively, and false for the other four tokens (exact tokens, never a
  `className` substring — `text-dp-up` is a substring of `text-dp-up-text`; as LineupTable S12 does). The
  `ahead-rank` element for the rank-23 row has `classList.contains('text-dp-up')` true and
  `'text-dp-up-text'` false. `ahead-prior` and `ahead-pass` elements contain no element whose classList holds
  any of the four tone tokens. Red: in `allowsTone.js` change `>= 27` to `>= 28` (rank 27 → `text-dp-up`); and
  for RANK, render `ahead-rank` with `text-dp-muted` (rank-23 assertion fails).
- **C9 — schedule table.** `weeks [5, 6, 7]`, a row with cells game(GB, 21.0, rank 30)/bye/unknown → headers
  `WK 5`,`WK 6`,`WK 7` in that DOM order; `ahead-wk-5` text `GB21.0` with `text-dp-up-text`; `ahead-wk-6`
  `BYE`; `ahead-wk-7` `—`. `scheduleLoaded false` → no `ahead-schedule`, the D10 sentence present, part (a)
  still rendered; `weeks []` → `No regular-season weeks remain.` Red: render a bye as `—`.
- **C10 — no percentile palette.** No element under `defences-ahead` has a class matching `dp-scale-` or an
  inline `style` `color`/`background` (the blend bar's `width` style is allowed). Red: add
  `style={{ color: 'red' }}` to a week cell.

### `src/components/portfolio/PortfolioDefencesAhead.test.jsx` (Portfolio integration)

Fixture: Fixture F's schedules/`defenceAllowed`; `careerStats { 2025: {} }`; `rosterPositions ['RB','WR','BN']`;
owned `playerRows` (`baseRow` shape as Portfolio.test.jsx L12) `rb1` RB DET proj 14, `wl1` WR LAR proj 15,
`wb1` WR DET proj 5; `rosterTeams` with **Sleeper's set lineup `starters: [wb1]`** and `bench: [rb1, wl1]`;
`seasonProjections` from the projs; `nflState REG_WK4 = { week: 4, season: '2026', season_type: 'regular',
season_start_date: '2026-09-09' }`.

- **P1 — rows are the starting ten, not Sleeper's set lineup (D-a).** `ahead-row-rb1` and `ahead-row-wl1`
  present in that order; `ahead-row-wb1` absent. Red: build `slots` from `rosterTeams` starters. Bites: wb1 is
  set in Sleeper but out-projected.
- **P2 — this week reads the live season.** `ahead-row-rb1` `ahead-vs` text `GB` (2026 wk4), not `MIN`
  (2025 wk4). Red: `liveSchedule = nflScheduleByYear?.[dataSeason]`.
- **P3 — remaining weeks: live season, played weeks excluded, bye shown.** `ahead-wk-head-5` … `-18` exist;
  no `ahead-wk-head-4` or lower; `ahead-sched-rb1`'s `ahead-wk-5` contains `CHI`, `ahead-wk-6` reads `BYE`.
  Red: `lastWeek` → `currentWeek` (no columns) *and separately* index the 2025 schedule (wk5 empty → `—`).
- **P4 — placement.** The element after `team-offences` (needs Slice D's `teamContextByYear` fixture shape:
  copy a two-game `2026` file for DET/LA/CHI) in document order is `defences-ahead`, and `bench` follows it.
  Also: with `teamContextByYear` omitted (no offences table) the section still renders. Red: render it inside
  the `offenceRows.length > 0` block.
- **P5 — every DefencesFaced metric renders on My Team.** In `ahead-row-rb1`: `ahead-prior` `20.0`,
  `ahead-current` `30.0`, `ahead-blended` contains `25.0` and `50%`, `ahead-rank` `2 of 32`, `ahead-pass`
  children `200` / `2025 · 240`, `ahead-rush` `90` / `2025 · 100`, `ahead-record` children `2-1` / `2025 · 1-0`;
  one `ahead-failed-weeks` line `Week 2 of 2026 failed to load from Sleeper and is left out of these figures.`
  Fails if any metric is dropped between util and render. Red: delete the RUSH `TwoLineCell` from
  `DefencesAhead.jsx`.
- **P6 — out of season unchanged.** With `nflState { season: '2026', season_type: 'pre' }` and also
  `{ …, season_type: 'post', week: 1 }`: no `defences-ahead`; and the ordered list of top-level `data-testid`s
  among `starting-ten, league-ladders, weakest-slots, team-offences, bench, bench-picks` equals the list
  Session 2 records **before any edit** from the same render (paste it in the hand-back). Red: drop the
  `phase?.phase === 'in-season'` term.
- **P7 — week 1 still shows it (D1).** `nflState { …REG_WK4, week: 1 }` → `defences-ahead` present and rb1's
  `ahead-vs` reads `CHI` (DET's wk1 opponent). Red: gate on `inSeasonLayout`. Bites: week 1 has
  `completedWeeks 0`, so `inSeasonLayout` is false there.
- SOS is unchanged by the hoist: Portfolio.test.jsx's Slice D SOS assertions (~L1160–1170) stay green, unedited.

### /week

- **T10 (WeekView.test.jsx) — the panel is gone.** Render with the STUB hook at week 9 → no text
  `Defences you face`, no `[data-testid^="defences-"]`; `existsSync('src/components/week/DefencesFaced.jsx')`
  false; WeekView.jsx source has no `DefencesFaced`. Red: restore the render (import kept from git).
- **T11 (WeekView.test.jsx) — no prior-schedule wiring.** The hook's call arg has no `priorSchedule` key.
  Red: re-add `priorSchedule` to the call.
- **T12 (useWeeklyDecision.test.js) — lineup ALLOWED / G and YDS ALLOWED unchanged.** In the OURS describe's
  setup (L122–140) add `defenceAllowed` with prior `{ season: 2025, failedWeeks: [], teams: { TB: { gp: 17, pts: { qb: 0, rb: 0, wr: 340, te: 0 }, passYd: 4080, rushYd: 1700 } } }`
  and current `{ season: 2026, failedWeeks: [], teams: { TB: { gp: 3, pts: { qb: 0, rb: 0, wr: 90, te: 0 }, passYd: 693, rushYd: 270 } } }`.
  Assert `lineup.starters[0]` `allows 25`, `allowsRank 1`, `weight 0.5`; `matchupCols.w1.yards` equals
  `{ kind: 'pass', current: 231, prior: 240, priorSeason: 2025 }`; the return has no `priorRecords`,
  `currentRecords`, `defenceFailedWeeks` keys. Fails if the extraction or the return trim changes a lineup
  number. Red (a): in `allowsForOpponent` use `blendWeight(gCur, 1)` (weight → 0.75); (b): drop `priorAllowed`
  from the hook's `buildMatchupColumns` call (`prior` → null).
- **T13 (LineupTable.test.jsx, test name prefixed "M2b T13") — render pin.** Using the existing `cellOf` helper: a WR row `{ allows: 25,
  allowsRank: 27, weight: 0.5 }` → `col-allows` text contains `25.0`, `27 of 32 · all WRs`, `50%`, span class
  `text-dp-up-text`; `mc({ yards: { kind: 'pass', current: 231.6, prior: 240, priorSeason: 2025 } })` →
  `col-yds` main line `232 pass`, grey `2025 · 240`. Red: in `allowsTone.js` `>= 27` → `>= 28`.
- **T14 (weeklyDecisionViewOnly.test.js) —** extend the L35 pipeline loop with
  `expect(src).not.toMatch(/from\s+['"][^'"]*defencesAhead['"]/)` and its name in the `it` title. Red:
  temporarily add `import { buildDefencesAhead } from './defencesAhead'` to `src/utils/seasonProjection.js`
  (the first PIPELINE file; a bare side-effect import has no `from` and would not trip the regex).
- **T15 (weeklyLineup.test.js) — `allowsForOpponent` null branch.** Asserts
  `allowsForOpponent({ fpaTable: { DEN: { wr: 18, weights: { wr: 2 } } }, fpaRanks: { DEN: { wr: 4 } }, opponentEra: null, position: 'WR' })`
  equals `{ allows: null, allowsRank: null, weight: null }`, and with `opponentEra: 'DEN'` equals
  `{ allows: 18, allowsRank: 4, weight: 0.4 }`. Fails if the null-opponent guard is dropped (a bye row would get
  weight `0` and a blend bar). Red: remove the `opponentEra != null` guard (weight becomes `blendWeight(0, 3) = 0`).

Existing suites stay green, edited only as this section says.

## 6. Docs (same commit)

Mechanism, never availability (docsAvailabilityClaims rule). Leave the stale surfaces table / rail groups in
`docs/ui.md` alone.
- **`docs/ui.md`** — after the *Ladders, weakest slots, offences* paragraph (ends "…This week has no offences
  panel; it moved here."), a new paragraph: `*Defences ahead.* In season, from week 1, a card follows the
  offences table: one row per filled Starting-ten slot. Its first table is this week's opponent from the live
  season's schedule, with the points that defence allows to the row's whole position group — last season's
  rate, this season's so far, and the blend with its per-row weight and rank — plus pass and rush yards allowed
  per game and both seasons' records. Its second table runs from the week after this one to the last regular
  -season week: the opponent and the blended points it allows to that position group, BYE on a bye, — when the
  schedule cannot answer. Points allowed use ALLOWED / G's five rank bands; nothing else is coloured. Out of
  season the card is absent. This week has no defences panel; it moved here.` L272: `Teams.jsx` and
  `DefencesFaced.jsx` → `Teams.jsx` and My Team's Defences ahead (`utils/defencesAhead.js`).
- **`docs/nav/components.md`** — L8 WeekView row: drop `DefencesFaced`, the last-season schedule
  (`priorScheduleSeason`) clause; add "Defences left `/week` for My Team's Defences ahead". **Delete** the L13
  `week/DefencesFaced.jsx` row. L11 LineupTable: "rendered in Defences you face" → "rendered in My Team's
  Defences ahead"; note `allowsToneClass` comes from `dp/allowsTone.js`. L15 Portfolio row: add the Defences
  ahead clause (gate D1, starting ten, live schedule index + records, hoisted `fpaTable`/`fpaRanks`). New row
  `portfolio/DefencesAhead.jsx` (props, two tables, testids, bands, empty states). New row `dp/allowsTone.js`.
- **`docs/nav/utils.md`** — new row `defencesAhead.js` (both exports, shapes from §4.1); `weeklyLineup.js` row:
  add `allowsForOpponent`; `weeklySchedule.js` row: "Defences you face's RECORD column" → "My Team's Defences
  ahead (RECORD and per-week opponents)"; `opponentStrength.js` row: "and Defences you face" → "and My Team's
  Defences ahead".
- **`docs/navigation.md`** — L22 `/week` row: delete the `DefencesFaced.jsx (…)` clause and "and RECORD" in
  the schedule-exception parenthesis; L23 `/portfolio` row: add Defences ahead. L101 hook row: drop the
  `priorAllowed`/`currentAllowed` "returned so DefencesFaced…" clause, the two W-L-T maps and
  `defenceFailedWeeks`; drop `priorAllowed, currentAllowed, currentSeason, priorRecords, currentRecords,
  defenceFailedWeeks` from Returns.
- **`docs/architecture.md`** L76 `nflScheduleByYear`: add "My Team's Defences ahead reads `[liveSeason]` (opponents,
  records) and `[dataSeason]` (last season's records)".
- **`docs/signal-registry.md`** L62: the third-consumer sentence adds My Team's Defences ahead per-week opponents
  (`buildRegWeekIndex`/`resolveTeamWeek`); the fourth-consumer sentence "feeds Defences you face's RECORD
  column" → "feeds My Team's Defences ahead RECORD column". L57: "Defences you face" → "My Team's Defences
  ahead".
- **`CLAUDE.md`** (app) navigation map: `src/components/week/` row drop ", Defences you face"; `src/components/
  portfolio/` row: "the team-offences table and Bench" → "the team-offences table, Defences ahead and Bench".
  Stay under 25,000 bytes (now 20,059).

## 7. Copied definitions

None created. Moves (D9): `buildDefenceFailedWeeks`, `allowsToneClass`, the allows/weight block
(`allowsForOpponent`, one body, two callers), and DefencesFaced's local helpers. Existing copy untouched:
`LineupTable.jsx` `signedPct` ↔ `TeamOffences.jsx` `fmtPct` (T9 of M2a).

## 8. Smoke (Session 2)

Start the app from `.claude/launch.json` (`preview_start` name `sleeper-dashboard`), never a backgrounded
`npm run dev`; login per docs/architecture.md → *Smoke-testing*. Stop it after. **Do not defer the 1440 check.**
1. **Before any edit:** `/#/portfolio` and `/#/week`, each at **1440×900** (`resize_window` width 1440,
   height 900) **and** 375px (`preset: 'mobile'`, reload). Screenshot My Team from the offences table down,
   and This week's lineup (Matchup view) and Defences you face. Note two starters' ALLOWED / G, rank line and
   YDS ALLOWED values, and their Defences-you-face BLENDED/RANK/PASS/RUSH/RECORD. At 375 also note This week's
   PACE/PROE for those two (M2a open check).
2. **After:** the same screens. Report:
   - My Team: Defences ahead directly under the offences table, title/subtitle per D10; part (a) one row per
     filled Starting-ten slot in slot order, every §2 column, `allowed to all {POS}s / G` lines, BLENDED/RANK
     banded; part (b) `WK {n+1}`…`WK 18` headers ascending, BYE cells on bye weeks, no `NaN`/`undefined`; a
     player who is on both pages shows the same BLENDED/RANK/PASS/RUSH/RECORD values as step 1's panel. At 375
     both tables scroll inside the card with the player column frozen; the page does not scroll sideways.
   - This week: no Defences you face; season grid directly follows the lineup; the noted ALLOWED / G, rank line,
     YDS ALLOWED and (375) PACE/PROE values identical to step 1.
3. `read_console_messages`: no new errors. Out of season is covered by P6 — do not alter nflState.
Reset `resize_window` to `desktop` when done.

## 9. Session 2 handoff

Run on **sonnet** (medium). Implement exactly §4; stop and report on any unanswered design question, on any
stated test literal that does not match the running code (do not adjust it to green), and on anything in §1
found wrong. Done-definition per `CLAUDE.md` (tests, lint 0, clean build, smoke §8, commit before hand-back).

For each test in the task file, check every assertion it names is actually made.
For each new or changed test, apply the task file's named red-step mutation, show the test fail on it, then revert. A substitute red step must say why it still triggers the named defect, or the test counts as not shown red.

Hand-back per `../CLAUDE.md` Session 2: SHA, files touched, deviations, per-test assert/defect/red
confirmation, the P6 before-list, the `grep -rn "PROVISIONAL(" src/` output (expect LineupTable's W-L tag
reworded, no tag added or removed — say so), and before/after screenshots of both pages at both widths.

## 10. Open items (for Anton, not blocking)

1. **SOS check (scope item 3) — SOS does read the live season in season**, but counts "remaining" differently.
   `sosSeason = projSeason = dataSeason + 1`, and `careerStats` stops before the live season (App.jsx
   ~L1424–1428), so in season it is `nflState.season`. SOS counts every game the schedule file has not
   scored yet (`homeScore == null`), which includes this week and any played week the file is late to score;
   Defences ahead's schedule starts the week after this one. The two can cover different weeks; not changed.
2. **Postseason:** /week's panel showed during the playoffs against the regular-season week with the playoff
   week's number (not a real opponent). Defences ahead does not show then.
3. **No projection-payload fallback:** where /week fell back to Sleeper's projected opponent when the schedule
   file could not answer, My Team shows `—` (D5).

## 11. Later slices (outline only — not planned)

- **M3 — §5 visuals.** `dp/WeeklyStrip.jsx` per row, shared `PlayerCell` in My Team's tables, palette via
  App's `percentileBasis` for the strip only (matchup data keeps D3's bands). Depends on M2b (same
  `Portfolio.jsx` region, `DefencesAhead.jsx`, the moved tone helper); plan after M2b is verified.
