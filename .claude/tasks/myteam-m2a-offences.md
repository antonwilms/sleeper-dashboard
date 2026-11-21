# Brief M2a — "Offences you own" merges into My Team's offences table and leaves This week

Review depth: full — two surfaces change at once; state moves out of a hook into App.jsx-owned props.

**Revision 1 (2026-11-21): plan-reviewer (full) flags 1–5 folded in** (Anton: "Fold all flags in").
1 → T10 fixture sets `neutralGaps: 20`; 2 → T8 guard walks non-test files and the §4.1 comment no longer names
the deleted file; 3 → tc2026W DET `neutralSeconds 600` so T4 tells the seasons' PACE apart (T1 literal now
`30.0`); 4 → docs/ui.md text appended as whole sentences after the paragraph; 5 → navigation.md L101
params/returns and components.md L16 Portfolio row added to §6.

Session 1: opus, high. **Session 2: sonnet, medium.** Visual change on two pages — Session 2 runs the app;
Anton judges. Planned at app `279859a` ("Sign-off: Brief M1", main == origin/main after `git fetch`).
Data repo: read only, untouched (local checkout `7be344b`, ahead 4 / behind 2, another session's
uncommitted file); consulted only to confirm `nflverse/teamcontext/2026.json` exists. No data contract changes.
Design source: Claude.ai project doc `claude/ux-briefs-week-and-myteam.md` → Brief M §6 (Offences bullet),
Display rule, Season-order convention (not on disk). M1 (`.claude/tasks/myteam-m1-live-season.md`) is done
and is not re-planned; this slice executes its §2 D3 ("M2 reads `teamContextByYear[liveSeason]` and deletes
the hook's copy") and the Offences half of its §10 outline. M2b and M3 are outlined in §11.

---

## 0. For Anton

My Team's offences table gains the two things only This week had — each offence's pace (ranked, blue for the
fastest eight) and last week's scoring margin — so in season it is the one place to read the offences you own.
This week loses its "Offences you own" panel in the same commit, so the information never disappears or
shows twice. Out of season My Team's table is unchanged. This week's PACE and PROE lineup columns keep
exactly the same numbers; they now read the team file App already loads instead of fetching it a second
time. Cost: none new — one duplicate download goes away. Risk: low; view-only.

## 1. View-only statement

Nothing in this slice reaches `playerRows`, `projectedPPG`, the dynasty score, a snapshot, a `factors` entry
or `docs/cross-repo-registry.md`. It reads `teamContextByYear` (already view-only, guarded by
`teamContextViewOnly.test.js`) in two more view components and deletes one route-scoped load. No new App
state, no new effect. **If Session 2 finds any of this wrong, stop and report.**

## 2. Metric inventory (the merge contract)

Every metric either table renders today, where it lands, and the test that pins it (§5).

| # | Metric (today's header) | Today on | Lands on My Team as | testid | Shown when | Test |
|---|---|---|---|---|---|---|
| 1 | TEAM code + logo + team name | both | TEAM (unchanged) | `offence-<TEAM>` row | always | T1, T3 |
| 2 | YOUR PLAYERS chips | My Team | unchanged | `offence-players` | always | T1 |
| 3 | PTS/G + bar | My Team | unchanged | `offence-pts`, `pts-bar` | always | T1 |
| 4 | PTS ALLOWED | My Team | unchanged | `offence-allowed` | always | T1 |
| 5 | MARGIN (season, per game) | My Team | unchanged | `offence-margin` | always | T1 |
| 6 | WEEK MARGIN (`WK n` + one game) | /week | **new** `WEEK MARGIN` | `offence-week-margin` | in season | T1, T2, T4 |
| 7 | OFF EPA/PL (/week: OFF EPA) | both | unchanged | `offence-epa` | always | T1 |
| 8 | PROE | both | unchanged | `offence-proe` | always | T1, T9 |
| 9 | PACE | /week | **new** `PACE`, rank-toned | `offence-pace` | in season | T1, T5 |
| 10 | PLAYS/G | both | unchanged | `offence-plays` | always | T1 |
| 11 | RZ TRIPS/G (/week: RZ TRIPS) | both | unchanged | `offence-rz` | always | T1 |
| 12 | DEF EPA ALL | My Team | unchanged | `offence-def` | always | T1 |
| 13 | QB · EPA/ATT | My Team | unchanged | `offence-qb` | always | T1 |
| 14 | SOS | My Team | unchanged | `offence-sos` | always | T1 |

/week's metrics 7, 8, 10, 11 are the same `buildTeamMetricsTable` fields My Team already renders — they merge
into the existing cells, not duplicate columns. /week's footer prose ("Single-season values … stability r .62 /
.45 … the design's own claim") is not a metric and is **not carried**: it cites a figure nothing in the repo
reproduces. Its WEEK MARGIN definition moves into that column's header popover (§3.2).

## 3. Decisions (Session 2 does not revisit)

**D1 — In season only, both new columns.** PACE and WEEK MARGIN render when `inSeason` (Portfolio's
`inSeasonLayout`). Out of season the table is byte-for-byte today's 12 columns (brief: "out of season
unchanged"). PACE is a season metric and would be meaningful out of season too — Open item 1.

**D2 — Placement (Season-order convention: time runs left → right).** `WEEK MARGIN` sits immediately right of
`MARGIN` — the season so far, then the latest week. `PACE` sits between `PROE` and `PLAYS/G` (pace drives
plays). In-season order: TEAM, YOUR PLAYERS, PTS/G, PTS ALLOWED, MARGIN, WEEK MARGIN, OFF EPA/PL, PROE, PACE,
PLAYS/G, RZ TRIPS/G, DEF EPA ALL, QB · EPA/ATT, SOS.

**D3 — Ranked against the league.** PACE joins Portfolio's `rankMetricsTable` list
(`['pointsPerGame', 'epaPerPlay', 'proe', 'defEpaPerPlay', 'pace']`); `LOWER_IS_BETTER` already holds `pace`,
so rank 1 = fewest seconds per play = fastest, toned with the existing `toneClass(rank, false, rankedTeamCount)`
(blue top 8, amber bottom 8). **WEEK MARGIN is uncoloured** for the same reason MARGIN is (file header: a
positive margin is good for a back, bad for a receiver) and it is one game, not a ranked season figure.
PLAYS/G and RZ TRIPS/G stay untoned: toning them would change the out-of-season table (D1).

**D4 — Where My Team gets the current week: `nflState.week`, the prop Portfolio already receives** — the same
field WeekView reads (`nflState?.week ?? 0`). `const currentWeek = nflState?.week ?? 0` in Portfolio. The
week margin is the latest REG week `<= currentWeek - 1` **per team** (byes differ), as OffencesOwned does today.

**D5 — WEEK MARGIN only describes the live season.** Computed only when `liveShown` (in season AND the table is
on `phaseLiveSeason`, i.e. `liveTc.complete`). On the in-season fallback (table shows `dataSeason` under the
M1 caption) every WEEK MARGIN cell renders `—`: a week of last season is not "last week". PACE on the fallback
shows `dataSeason`'s pace, like every other season metric in that state.

**D6 — Week-margin derivation moves (not copies) into `src/utils/environment.js`** as
`lastWeekMargin(loaded, team, currentWeek)`, beside `buildTeamMetricsTable` (same input). It reads
`loaded?.teams?.[team]?.games` directly — environment.js has no imports and must not gain an
`api/teamContext` import. OffencesOwned is deleted, so there is no copy and no equality test.

**D7 — /week's PACE/PROE source: App's `teamContextByYear[season]`.** `WeekView` gets a new prop
`teamContextByYear = {}` and passes `teamContextByYear?.[season] ?? null` into the hook as `liveTeamContext`
(`season` = `parseInt(nflState.season, 10)`, as today). The hook keeps its single gate
(`liveTeamContext?.complete ? buildTeamMetricsTable(liveTeamContext) : null`). App loads `dataSeason + 1`; in
season that equals `nflState.season` (App.jsx SOS-effect comment). If they ever differ, the key is absent and
PACE/PROE read `—` — the same graceful path `nflScheduleByYear?.[season]` already takes in WeekView. Timing
change, accepted: PACE/PROE now fill once `careerStats` has loaded (App's effect dependency) rather than as
soon as `/week` mounts.

**D8 — The OffencesOwned empty state is not migrated.** My Team already omits the table when no complete
season is available (`offenceRows.length > 0` gate, existing test "Slice D … incomplete → absent").

## 4. Changes by file (touch list)

| File | Change |
|---|---|
| `src/utils/environment.js` | + `lastWeekMargin` (§4.1) |
| `src/components/portfolio/Portfolio.jsx` | `currentWeek`; `pace` in rank list; row fields `pace`, `paceRank`, `weekMargin` (§4.2) |
| `src/components/portfolio/TeamOffences.jsx` | Two in-season columns; header comment (§4.3) |
| `src/components/week/WeekView.jsx` | Drop `<OffencesOwned>` + import; new prop `teamContextByYear`; pass `liveTeamContext` to the hook; header comment (§4.4) |
| `src/hooks/useWeeklyDecision.js` | Delete state, effect, import, return key; new param (§4.5) |
| `src/App.jsx` | `<WeekView teamContextByYear={teamContextByYear}>`; comment ~L1443–1447 (§4.6) |
| `src/components/week/LineupTable.jsx` | L153 comment only: `Copy of TeamOffences.jsx's fmtPct (not exported); equality pinned by LineupTable.test.jsx.` |
| `src/components/week/OffencesOwned.jsx` | **Delete** |
| `src/components/week/OffencesOwned.test.jsx` | **Delete** — every case migrated (§5 "Migration map") |
| Tests | §5 |
| Docs, CLAUDE.md | §6 |

### 4.1 `environment.js`

```js
// The latest REG week at or before `currentWeek - 1` for which `team` has a teamcontext row — per team,
// because byes differ — and that one game's margin (off.pointsScored − def.pointsAllowed), never summed.
// Moved from /week's former offences panel (myteam-m2a-offences.md D6). `team` is the era-accurate teamcontext key.
export function lastWeekMargin(loaded, team, currentWeek) {
  const games = loaded?.teams?.[team]?.games ?? []
  let row = null
  for (const g of games) {
    if (g.seasonType !== 'REG') continue
    if (g.week > currentWeek - 1) continue
    if (row == null || g.week > row.week) row = g
  }
  if (row == null) return null
  const ps = row.off?.pointsScored
  const pa = row.def?.pointsAllowed
  return { week: row.week, margin: ps != null && pa != null ? ps - pa : null }
}
```
Behaviour equals OffencesOwned's `latestKnownWeek` + `getTeamWeekRow` pair (weeks are unique per team-season,
so returning the row found is the same row `getTeamWeekRow(n)` returns).

### 4.2 `Portfolio.jsx`

- Beside `phaseLiveSeason` (~L363): `const currentWeek = nflState?.week ?? 0` with comment `// D4 — the same
  field WeekView reads; WEEK MARGIN uses the latest REG week <= currentWeek - 1.`
- Import `lastWeekMargin` from `../../utils/environment` (same import line as `buildTeamMetricsTable`).
- After `offenceFallback` (~L539): `const offenceLive = inSeasonLayout && offenceSeason === phaseLiveSeason`.
- `teamRanks` memo (~L547): metric list gains `'pace'` (D3). Update the comment above it only if it lists metrics.
- `offenceRows` row object: after `proeRank` add
  `pace: m?.pace ?? null, paceRank: teamRanks.pace?.[team] ?? null,`
  and after `marginPerGame` add
  `weekMargin: offenceLive ? lastWeekMargin(tcForSeason, team, currentWeek) : null,`
  (`team` here is already the era-accurate key — `normalizeTeamForSchedule`, CR-16). Memo deps gain
  `offenceLive, tcForSeason, currentWeek`.
- `<TeamOffences>` call: no new prop (it already gets `inSeason`, `liveSeason`, `season`, `fallback`).

### 4.3 `TeamOffences.jsx`

- Header comment: append `In season (myteam-m2a-offences.md) two more columns: WEEK MARGIN (one game,
  uncoloured like MARGIN) right of MARGIN, and PACE (rank-toned, lower = faster = rank 1) between PROE and
  PLAYS/G. Out of season neither renders.`
- Thead, inside the existing `th(...)` sequence:
  - after `th('MARGIN')`: `{inSeason && th('WEEK MARGIN', { popover: { gloss: weekMarginGloss, field:
    'teamcontext off.pointsScored − def.pointsAllowed, latest REG week before this one' } })}` where
    `const weekMarginGloss = liveShown ? 'One game: points scored minus points allowed in the team’s most
    recent regular-season game before this week — the closest available proxy for time spent leading or
    trailing, which no field here carries directly.' : \`No ${liveSeason} games loaded yet, so there is no
    last week to show.\``
  - after `th('PROE', …)`: `{inSeason && th('PACE', { popover: { gloss: 'Seconds per play in neutral game
    situations. Lower is faster — more plays for everyone. Blue = the eight fastest.', field: 'teamcontext
    off.neutralSeconds ÷ off.neutralGaps, REG weeks summed' } })}`
- Tbody, matching positions:
  - after the `offence-margin` td:
    ```jsx
    {inSeason && (
      <td data-testid="offence-week-margin" className="px-[10px] py-2 whitespace-nowrap">
        {r.weekMargin == null ? <Missing /> : (
          <span className="font-dp-mono text-dp-text">
            <span className="text-dp-muted text-[10px] mr-1">WK {r.weekMargin.week}</span>
            <Num value={r.weekMargin.margin} format={v => signed(v, 1)} />
          </span>
        )}
      </td>
    )}
    ```
  - after the `offence-proe` td: `{inSeason && <td data-testid="offence-pace" className="px-[10px] py-2"><Num
    value={r.pace} format={v => v.toFixed(1)} cls={toneClass(r.paceRank, false, rankedTeamCount)} /></td>}`
    (format = OffencesOwned's `v.toFixed(1)`, unchanged).
- Footer left span: when `inSeason`, append ` WEEK MARGIN is the latest single game; PACE is seconds per neutral
  play, lower is faster.` Out of season the footer text is unchanged.
- Nothing else changes (props signature unchanged: `inSeason` is already a prop).

### 4.4 `WeekView.jsx`

- Delete `import { OffencesOwned } from './OffencesOwned'` and the `<OffencesOwned … />` element (L196–201).
- Props: add `teamContextByYear = {},` after `nflScheduleByYear = {},`.
- Beside the schedule lines (~L67): `// Live team context from App's teamContextByYear (myteam-m2a-offences.md
  D7) — the hook gates on .complete; an absent key reads as no data.` then
  `const liveTeamContext = teamContextByYear?.[season] ?? null`.
- Hook call: add `liveTeamContext,`. Destructure: remove `liveTeamContext` from the hook's returned names.
- Header comment L13–24: drop "Offences you own (§4) and"; add one sentence: `Offences moved to My Team's
  offences table (myteam-m2a-offences.md); the lineup's PACE/PROE read App's teamContextByYear[season].`

### 4.5 `useWeeklyDecision.js`

- Remove `import { loadTeamContext } from '../api/teamContext'`.
- Remove the state block L128–135 (comment + `useState`) and the effect L203–219 (comment + `useEffect`).
- Signature: add `liveTeamContext = null,` after `standings = [],`, with the comment
  `// App.jsx's teamContextByYear[season] (myteam-m2a-offences.md D7) — feeds only the lineup's PACE/PROE.`
- `teamMetrics` memo L363–368: code unchanged; comment becomes `// W2a — the lineup's matchup columns. Team
  metrics only from a complete load of App's live-season team context (passed in), never key presence.`
- Return object: remove `liveTeamContext`.
- Header comment L28–34 ("Why a hook…"): unchanged except, if it lists what the hook loads, drop teamcontext.

### 4.6 `App.jsx`

- `<WeekView>` (~L1587): add `teamContextByYear={teamContextByYear}`.
- Comment ~L1443–1447 becomes: `// The live season's team context (myteam-m1-live-season.md D3): dataSeason + 1,
  the live NFL season (see the SOS effect above), merged into the same view-only teamContextByYear map. Read by
  My Team's offences table and /week's lineup PACE/PROE (WeekView indexes it by nflState.season,
  myteam-m2a-offences.md D7) — the only live team-context load in the app. A complete: false result is the
  loader's graceful absence.`
- No code change to the effect.

## 5. Tests

Fixture for T1–T4, added inside Portfolio.test.jsx's `describe('Slice D …')` beside `tc2026` (the existing
`tcGame` hard-codes `week: 1`, so a week-aware builder is needed):
```js
const tcWeek = (week, scored, allowed, passPlays, neutralSeconds = 700) => ({
  ...tcGame(scored, allowed, passPlays), week,
  off: { ...tcGame(scored, allowed, passPlays).off, neutralSeconds },
})
const tc2026W = (complete = true) => ({
  complete,
  teams: {
    DET: { games: [tcWeek(1, 24, 20, 20, 600), tcWeek(3, 30, 10, 20, 600)] }, // bye week 2; pace 30 ≠ 2025's 35
    LA: { games: [tcWeek(1, 14, 24, 40, 800), tcWeek(2, 14, 24, 40, 800)] },
    CHI: { games: [tcWeek(2, 20, 20, 30, 760), tcWeek(3, 20, 20, 30, 760)] },
  },
})
```
Values verified against the live `buildTeamMetricsTable`/`rankMetricsTable` at planning time: DET
`pointsPerGame 27`, `pointsAllowedPerGame 15`, `marginPerGame 12`, `epaPerPlay 0.1`, `proe −0.16667`,
`pace 30` (1200 ÷ 40), `playsPerGame 60`, `rzTripsPerGame 3`, `defEpaPerPlay −0.05`; pace CHI 38, LA 40, so
pace ranks `DET 1, CHI 2, LA 3`. The 2025 `teamContextByYear` DET pace is 35 (700 ÷ 20).
With `nflState = REG_WK4_D` (week 4): DET's latest REG week ≤ 3 is 3 (margin +20.0); LA's is 2 (−10.0).

Every test names its defect. "Red" = the exact temporary mutation Session 2 applies, shows failing, reverts.

**T1 — every metric of both old tables renders on My Team in season** (Portfolio.test.jsx). Render
`<Portfolio {...withData} nflState={REG_WK4_D} playerMap={mapNew} teamContextByYear={{ ...teamContextByYear,
2026: tc2026W() }} gameLogsByYear={logs2026} />`. Asserts, on `offence-DET`, exact `textContent`:
`offence-pts` `27.0` (and a `pts-bar` div), `offence-allowed` `15.0`, `offence-margin` `+12.0`,
`offence-week-margin` `WK 3+20.0`, `offence-epa` `+0.100`, `offence-proe` `−16.7%`, `offence-pace` `30.0`,
`offence-plays` `60.0`, `offence-rz` `3.00`, `offence-def` `−0.050`, `offence-qb` contains `Hendon Hooker` and
`+0.100`, `offence-sos` matches the existing `/RB \d+(st|nd|rd|th).*WR \d+(st|nd|rd|th)/`, `offence-players` has
`chip-starter` `Back` and `chip-bench` `Bench`; the row's first td contains `DET` and a `team-logo`. Also asserts
the thead's `th` texts, in order, equal `['TEAM','YOUR PLAYERS','PTS/G','PTS ALLOWED','MARGIN','WEEK MARGIN',
'OFF EPA/PL','PROE','PACE','PLAYS/G','RZ TRIPS/G','DEF EPA ALL','QB 2026 · EPA/ATT','SOS 2026']` (14), and
`offence-LA` `offence-week-margin` is `WK 2−10.0`.
Fails if any one metric is dropped, misplaced (D2 order), or reads the wrong season; the LA line fails if the
CR-16 hop or the per-team week is lost. Red (three, each alone): (a) delete the `offence-pace` td and th;
(b) delete the `offence-week-margin` td and th; (c) delete the `offence-rz` td. Each must fail T1.

**T2 — WEEK MARGIN is one game from the latest REG week before this one, per team** (environment.test.js,
unit on `lastWeekMargin`). Fixture `KC` games: REG week 1 (24−17), REG week 2 (30−10), REG week 3 (0−7, the
in-progress week). Asserts `lastWeekMargin(tc, 'KC', 3)` `toEqual({ week: 2, margin: 20 })`; with
`currentWeek 20` and an added `{ week: 19, seasonType: 'POST', … }` row it returns week 3 (`margin −7`), not 19;
`lastWeekMargin(tc, 'KC', 1)` is `null`; an absent team is `null`; a week-2 row missing `def.pointsAllowed`
gives `{ week: 2, margin: null }`. Fails if the bound is `<= currentWeek` (returns week 3), if POST rows count,
or if a missing component is coerced to 0. Red: change `g.week > currentWeek - 1` to `g.week > currentWeek`.
(Migrates OffencesOwned "WK {n} MARGIN reads a single week…".)

**T3 — out of season the table is unchanged** (Portfolio.test.jsx). Render `withData` with `nflState={{ season:
'2026', season_type: 'pre' }}` and `teamContextByYear={{ ...teamContextByYear, 2026: tc2026W() }}`. Asserts the
thead `th` texts equal today's 12 exactly (`['TEAM','YOUR PLAYERS','PTS/G','PTS ALLOWED','MARGIN','OFF EPA/PL',
'PROE','PLAYS/G','RZ TRIPS/G','DEF EPA ALL','QB 2025 · EPA/ATT','SOS 2026']`), no `offence-pace` /
`offence-week-margin` anywhere, `offence-DET` `offence-pts` `30.0` (2025), and the footer left span does not
contain `WEEK MARGIN`. Fails if either new column, its footer clause, or the live file leaks out of season.
Red: change both `{inSeason && th(…)}` / `{inSeason && <td …>}` guards for PACE to `{true && …}`.

**T4 — in-season fallback: caption, last season's PACE, no week margin** (Portfolio.test.jsx). Render
`nflState={REG_WK4_D}` with `teamContextByYear={{ ...teamContextByYear, 2026: tc2026W(false) }}`. Asserts
`offences-fallback-note` text (M1's, unchanged), `offence-DET` `offence-pts` `30.0`, `offence-pace` `35.0` (2025's;
the incomplete 2026 file's DET pace is 30.0), `offence-week-margin` `—`, and the WEEK MARGIN header still
present. Fails if WEEK MARGIN reads the fallback season's games (the 2025 fixture rows are week 1, so it would
show `WK 1+10.0`), if PACE reads the incomplete live file (`30.0`), or if the columns vanish on fallback. Red: in Portfolio set `weekMargin: lastWeekMargin(tcForSeason, team, currentWeek)` (drop the
`offenceLive ?` guard).

**T5 — PACE is rank-toned and wired to the rank list** (two parts).
(a) TeamOffences.test.jsx, new case in "rank colouring at the boundaries": `inSeason` rows with `pace: 30,
paceRank` 8 / 9 / 24 / 25 at `rankedTeamCount 32`; asserts `offence-pace` span class contains
`text-dp-up-text` at 8, neither tone at 9 and 24, `text-dp-down-text` at 25. Fails if PACE is inverted or
untoned. Red: pass `true` as `toneClass`'s `invert` for PACE.
(b) In T1 additionally assert `offence-DET` `offence-pace` span class contains `text-dp-up-text` (DET rank 1).
Fails if Portfolio omits `'pace'` from `rankMetricsTable` (rank null → neutral). Red: remove `'pace'` from the
list. (Direction — lower seconds = rank 1 — is already pinned by environment.test.js "pace ranks the OPPOSITE
direction".)

**T6 — WEEK MARGIN is uncoloured** (TeamOffences.test.jsx, beside "MARGIN is deliberately uncoloured"). For
`weekMargin.margin` `+14` and `−14`, `inSeason`: the `offence-week-margin` cell contains no element whose class
includes `text-dp-up-text` or `text-dp-down-text`. Fails if a tone is added. Red: give the margin `Num`
`cls={toneClass(1, false, 32)}`.

**T7 — component-aggregated, not averaged** (Portfolio.test.jsx; migrates OffencesOwned's aggregation test).
In season, 2026 `DET` games: week 1 `{ plays 70, passPlays 40, proeXpassSum 33, proePlays 60, proe: 40/70 −
33/60 }`, week 2 `{ plays 50, passPlays 20, proeXpassSum 15, proePlays 40, proe: 20/50 − 15/40 }` (other
fields from `tcGame`). Asserts `offence-proe` is `+2.0%`, not `+2.3%` (mean of stored rates) nor `+4.6%` (sum).
Fails if the merged surface reads a stored per-game rate. Red: in Portfolio set `proe:` to the mean of
`tcForSeason.teams[team].games.map(g => g.off.proe)`.

**T8 — /week no longer renders the Offences panel, and the component is gone** (WeekView.test.jsx). Render
WeekView with `STUB` (remove `liveTeamContext` from `STUB`). Asserts `queryByTestId('offences-owned')` is null
and the container text has no `Offences you own`; source guard: `existsSync('src/components/week/
OffencesOwned.jsx')` is false and no **non-test** `src/**/*.{js,jsx}` file (skip `*.test.*`, as the
`weeklyDecisionViewOnly.test.js` L126 `readdirSync` walk does) matches `/\bOffencesOwned\b/` — this plan
leaves the name in no source comment (§4.1, §4.4 and the LineupTable comment all avoid it). Fails if the panel or any import survives
("never duplicated"). Red: temporarily add `<div data-testid="offences-owned">Offences you own</div>` to
WeekView's return.

**T9 — PROE format equality re-pointed** (LineupTable.test.jsx T19, changed). Rename describe to `LineupTable —
PROE format equals TeamOffences fmtPct (T19)`; comment `Copy of TeamOffences.jsx fmtPct (not exported)`.
Replace the OffencesOwned render with `render(<TeamOffences rows={[{ team: 'KC', hasStarter: true, players: [],
proe }]} season={2025} rankedTeamCount={32} />)` and assert `getByTestId('offence-proe').textContent` is
exactly `c.text`. Keeps the copy guard alive after its original is deleted. Fails if the two formats diverge.
Red: change TeamOffences `fmtPct`'s `toFixed(1)` to `toFixed(2)`.

**T10 — PACE/PROE lineup values unchanged after the rewire** (new file
`src/components/week/WeekViewTeamContext.test.jsx`, real hook — not mocked). Mock `../../api/sleeperStats`
(`getWeeklyStatRows`, `getWeeklyProjectionRows` → `{}`) and `../../api/sleeper` (`getMatchups` → `[]`), as
useWeeklyDecision.test.js does. Render `<MemoryRouter><WeekView myTeamName="Me" rosterTeams={[{ rosterId: 3,
teamName: 'Me', starterSlots: ['w1'], starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }],
bench: [], reserve: [], taxi: [] }]} rosterPositions={['WR']} careerStats={{ 2025: {} }} playerMap={{ w1: {
position: 'WR', full_name: 'W One' } }} nflState={{ season: '2026', week: 4 }} teamContextByYear={tcByYear}
/></MemoryRouter>` where `tcByYear = { 2025: ctx(24, 800), 2026: ctx(35, 600) }` and `ctx(passPlays,
neutralSeconds)` is the useWeeklyDecision.test.js `OFF` fixture (one REG week 1 DAL game) with those two fields
**and `neutralGaps: 20`** (`OFF` carries 60, which would give 10.0s / 13.3s), plus `complete: true, rowCount:
100` — so pace is 600 ÷ 20 = 30.0 (2026) and 800 ÷ 20 = 40.0 (2025). Asserts (await) `col-pace` text contains `30.0s` and not `40.0s`, and
`col-proe` contains `+8.3%` and not `−10.0%` (2026: 35/60 − 30/60; 2025: 24/60 − 30/60). Then rerender with
`2026: { ...ctx(35, 600), complete: false }`: `col-pace` and `col-proe` read `—`. Fails if WeekView indexes the
map by `dataSeason` (shows 2025's 40.0s / −10.0%), if the hook ignores its param, or if the `.complete` gate is
dropped. Red: in WeekView use `teamContextByYear?.[priorScheduleSeason]`. If `col-pace` is not in the DOM on
the default lens, stop and report — do not switch lens in the test without saying why.

**T11 — the hook takes team context as a param and no longer loads it** (useWeeklyDecision.test.js, changed).
- Delete the describe "the live-season teamcontext effect" (its guard — live season, not `dataSeason` — moves
  to T10) and the `loadTeamContext` hoisted mock + `vi.mock('../api/teamContext', …)`.
- Rewrite the two W2a cases (~L295–318): pass `liveTeamContext: mock` in `args` instead of
  `loadTeamContext.mockResolvedValue(mock)`; drop the `result.current.liveTeamContext` waits. Keep every
  existing assertion (`spread −3`, `implied 24`, incomplete → `pace` null; complete → `pace.of` 1) and add, on
  the complete case, `pace.value` `toBe(30)` and `proe.value` `toBeCloseTo(35 / 60 − 30 / 60, 9)` — the values
  the old effect-loaded path produced on this fixture. Fails if the param is ignored or the gate dropped.
  Red: in the hook's `teamMetrics` memo replace `liveTeamContext` with `null`.
- Add: `expect('liveTeamContext' in result.current).toBe(false)`. Fails if the return key survives. Red: re-add
  it to the return object.

**T12 — the route-scoped load is gone and App wires the map** (portfolioLiveLoads.test.js, new describe
`'/week reads App\'s live team context (M2a)'`). Asserts `src/hooks/useWeeklyDecision.js` source does not match
`/loadTeamContext|api\/teamContext/` and has no `setLiveTeamContext`; the `<WeekView` … `/>` block in App.jsx
contains `teamContextByYear={teamContextByYear}`; over non-test `src/**/*.{js,jsx}`, the files matching
`/import\s*\{[^}]*\bloadTeamContext\b[^}]*\}\s*from/` (an import, not a doc-comment mention — environment.js,
seasonEfficiency.js and api/teamContext.js name it in comments) sorted `toEqual(['src/App.jsx',
'src/hooks/useTeamHistoryLoader.js'])` (planning-time importers are those two plus `useWeeklyDecision.js`). If
the post-change list differs, stop and report. Fails if the duplicate load is reintroduced. Red: re-add the import line
`import { loadTeamContext } from '../api/teamContext'` to the hook.

**Migration map (OffencesOwned.test.jsx → where each case now lives):** LAR→LA row → T1 (`offence-LA` week
margin) + existing Slice D logo test; `complete: false` empty state → not migrated (D8; existing "incomplete →
absent" test); real-shaped values → T1; aggregation → T7; WK MARGIN single week → T2 (+ T1 per team); LAR logo
beside LA code → existing Slice D test (`offence-LA` `lar.png`).

**Existing tests that must stay green unchanged:** TeamOffences.test.jsx all cases (none passes `inSeason` except
"in season (T22)" — check it still passes with the two new columns; if it asserts a column count, update it to
14 in season and name that as a changed test), Portfolio Slice D T6/T7, `teamContextViewOnly.test.js`,
`weeklyDecisionViewOnly.test.js`, `docsAvailabilityClaims.test.js`, `claudeMdSize.test.js`.

## 6. Docs (same commit)

Mechanism, never availability (docsAvailabilityClaims rule).
- **`docs/ui.md`** L116–124 (*Ladders, weakest slots, offences*): leave the existing sentences intact and append,
  after the paragraph's last sentence ("GAME SCRIPT follows the same season."): `In season the table adds two
  columns. WEEK MARGIN, right of MARGIN, is one game: each team's latest REG week before nflState.week, uncoloured,
  and — while the table shows {dataSeason} under the fallback caption. PACE, between PROE and PLAYS/G, is seconds
  per neutral play, ranked with lower = faster. Out of season the table keeps its 12 columns. This week has no
  offences panel; it moved here.`
- **`docs/nav/components.md`**: L8 WeekView row — drop OffencesOwned; add the `teamContextByYear` prop and
  `teamContextByYear?.[season]` → the hook's `liveTeamContext`. **Delete** the L14 `week/OffencesOwned.jsx` row.
  L17 TeamOffences row — "12 columns" → "12 columns out of season; in season 14, adding WEEK MARGIN (after
  MARGIN, uncoloured) and PACE (after PROE, rank-toned)". L16 `portfolio/Portfolio.jsx` row, offences clause —
  add: in season it reads `nflState.week` for each team's WEEK MARGIN (`environment.js` `lastWeekMargin`, live
  season only) and ranks `pace` with the other offence metrics.
- **`docs/navigation.md`**: L22 `/week` row — remove the OffencesOwned clause and "OffencesOwned's teamcontext
  read … are the exceptions" wording (keep the schedule exception). L101 `useWeeklyDecision.js` row — replace
  the live-teamcontext load description with "receives App's `teamContextByYear[season]` as `liveTeamContext`
  (PACE/PROE matchup columns only); loads no team context itself", add `liveTeamContext` to that row's params
  list, and remove `liveTeamContext` from its Returns list. `environment.js` lives in
  `docs/nav/utils.md` — add `lastWeekMargin` to its export list there.
- **`docs/architecture.md`** L74 `teamContextByYear` row: "for My Team's offences" → "for My Team's offences and
  `/week`'s lineup PACE/PROE (WeekView reads `[nflState.season]`) — the app's only live team-context load".
- **`docs/signal-registry.md`** L64: replace the `/week`'s `OffencesOwned.jsx` … `useWeeklyDecision.js` clause
  with: My Team's `TeamOffences` (via `Portfolio.jsx`) reads the live season from App's `teamContextByYear`,
  and `environment.js`'s `lastWeekMargin` is the family's week-grain read (single-game margin,
  `off.pointsScored − def.pointsAllowed`, never summed); `/week`'s lineup PACE/PROE read the same entry.
- **`CLAUDE.md`** (app): navigation-map `src/components/week/` row — drop ", Offences you own"; *State and data
  flow* — "for My Team's offences and SOS" → "for My Team's offences and SOS and `/week`'s PACE/PROE". Keep under
  the 25,000-byte ceiling (now 20,053).
- Leave the stale surfaces table and rail groups in `docs/ui.md` alone.

## 7. Copied definitions

None created. One existing copy re-pointed: `LineupTable.jsx` `signedPct` ↔ `TeamOffences.jsx` `fmtPct` (was ↔
`OffencesOwned.jsx` `fmtPct`, an identical body), equality test T9. `lastWeekMargin` is a move (D6).

## 8. Smoke (Session 2)

Start the app from `.claude/launch.json` (`preview_start` name `sleeper-dashboard`), never a backgrounded
`npm run dev`; login path per docs/architecture.md → *Smoke-testing*. Stop it after.
1. **Before any edit:** `/#/portfolio` and `/#/week`, each at **1440×900** (`resize_window` width 1440, height
   900) **and** 375px (`preset: mobile`, reload). Screenshot My Team's offences table and This week's lineup
   (Matchup view, PACE/PROE visible) and Offences you own panel. Note two teams' PACE/PROE lineup values.
   Do not defer the 1440 check.
2. **After:** the same four screens. Report for each:
   - My Team (in season): 14 headers in D2 order; WEEK MARGIN `WK n ±x.x` per team (byes may differ); PACE
     numbers with blue/amber on some rows; subtitle still `2026 season so far`; no `NaN`; at 375px the table
     scrolls inside its card, the page does not scroll sideways.
   - This week: no "Offences you own" panel; season grid directly follows Defences you face; the two noted
     teams' PACE/PROE lineup values identical to step 1.
   - `read_network_requests`: `nflverse/teamcontext/2026.json` fetched by App's load and **no second
     fetch when navigating to `/week`** (cache hits log `[teamContext] year=2026 served from cache` once per App
     load, not per /week mount).
3. `read_console_messages`: no new errors. Out of season is covered by T3 — do not alter nflState.
Reset `resize_window` to `desktop` when done.

## 9. Session 2 handoff

Run on **sonnet** (medium). Implement exactly §4; stop and report on any unanswered design question, on any T1
literal that does not match the running code (do not adjust it to green), and on anything in §1 found wrong.
Done-definition per `CLAUDE.md` (tests, lint 0, clean build, smoke §8, commit before hand-back).

For each test in the task file, check every assertion it names is actually made.
For each new or changed test, apply the task file's named red-step mutation, show the test fail on it, then revert. A substitute red step must say why it still triggers the named defect, or the test counts as not shown red.

Hand-back per `../CLAUDE.md` Session 2: SHA, files touched, deviations, per-test assert/defect/red confirmation,
the `grep -rn "PROVISIONAL(" src/` output (OffencesOwned's `PROVISIONAL(no-data)` tag disappears with the file —
say so), and before/after screenshots of both pages at both widths.

## 10. Open items (for Anton, not blocking)

1. PACE out of season: it is a season figure and would read fine on last season's table; kept off to honour
   "out of season unchanged". A one-line follow-up if wanted.
2. This week's dropped footer sentence cited a pace/PROE stability figure (r .62 / .45) that nothing in the
   repo reproduces; it is not carried to My Team.

## 11. Later slices (outline only — not planned)

- **M2b — "Defences you face" → My Team "Defences ahead".** This week's opponents plus the rest-of-season
  schedule per starter, where SOS lives; every current DefencesFaced metric kept (ALLOWS blend, RECORD, failed-
  weeks footer); the panel leaves `/week` in the same commit it lands. Depends on M2a (same `TeamOffences`/
  Portfolio region and WeekView file; plan after M2a is verified).
- **M3 — §5 visuals.** `dp/WeeklyStrip.jsx` per row, shared `PlayerCell`, palette via App `percentileBasis`.
  Depends on M2b (same files).

## Fix pass 1

From implementation-reviewer (full) on 97dfc9c..a5b79fb — three low flags, all fixed here. Touch only the
files named; change nothing else.

**F1 — docs/ui.md L123 (plan defect).** Replace exactly the sentence
`WEEK MARGIN, right of MARGIN, is one game: each team's latest REG week before nflState.week, uncoloured, and — while the table shows {dataSeason} under the fallback caption.`
with
``WEEK MARGIN, right of MARGIN, is one game: each team's latest REG week before `nflState.week`, uncoloured; it renders `—` while the table shows `{dataSeason}` under the fallback caption.``
Leave the rest of the paragraph untouched. Docs-only; no test.

**F2 — PROVISIONAL(no-data) tags for WEEK MARGIN's fallback `—`** (successor to the deleted OffencesOwned tag).
- `src/components/portfolio/Portfolio.jsx`, the line directly above `weekMargin: offenceLive ? lastWeekMargin(tcForSeason, team, currentWeek) : null,` in `offenceRows`, add:
  `// PROVISIONAL(no-data): WEEK MARGIN null in season until the live teamcontext is complete · offenceLive gates it to the live season's file · a complete teamcontext/<liveSeason>.json`
- `src/components/portfolio/TeamOffences.jsx`, inside the `offence-week-margin` `<td>`, before `{r.weekMargin == null ? …`, add a single-line JSX comment:
  `{/* PROVISIONAL(no-data): WEEK MARGIN renders — on the fallback or with no prior REG week · derived null in Portfolio offenceRows · a complete live teamcontext with a played week */}`
Comment-only; no test. Paste `grep -rn "PROVISIONAL(" src/components/portfolio/` in the hand-back.

**F3 — tests for the WEEK MARGIN popover `liveShown` branch and in-season footer.** In
`src/components/portfolio/TeamOffences.test.jsx` add `describe('TeamOffences — WEEK MARGIN gloss and footer (M2a Fix pass 1)')`
with an `openWeekMarginPopover` helper modelled on the SOS one (`getByRole('button', { name: /^WEEK MARGIN/ })`, then `getByRole('dialog')`):
- **F3a live:** `renderRows([baseRow()], { season: 2026, inSeason: true, liveSeason: 2026, fallback: false })`. Asserts the dialog contains `most recent regular-season game` and not `No 2026 games loaded yet`; and the `team-offences` card text contains `WEEK MARGIN is the latest single game`. Fails if `weekMarginGloss`'s `liveShown` branches are inverted, or the footer's `inSeason &&` clause is dropped.
- **F3b fallback:** `renderRows([baseRow()], { season: 2025, inSeason: true, liveSeason: 2026, fallback: true })`. Asserts the dialog contains `No 2026 games loaded yet, so there is no last week to show.` and not `most recent regular-season game`. Fails if `liveShown` is inverted or becomes `inSeason` alone.
Red steps: (1) swap the two arms of `weekMarginGloss` → F3a and F3b red; (2) replace `liveShown` in `weekMarginGloss` with `inSeason` → F3b red; (3) delete the footer WEEK MARGIN clause → F3a red. Restore after each. No source change for F3.

Done-definition: `npm test`, `npm run lint`, `npm run build`; no smoke needed (no visible change besides docs). Commit as `Fix pass 1: M2a WEEK MARGIN PROVISIONAL tags, gloss/footer tests, ui.md wording`.

## Verification

- Implementation: a5b79fb (Session 2, sonnet). Fix pass 1: f2ca8f8 (fix-applier); spec fa4a8f3.
- Review: implementation-reviewer, full depth (opus, high), on 97dfc9c..a5b79fb — 3 low flags:
  ui.md fragment sentence (plan defect) → fixed F1; missing PROVISIONAL(no-data) for WEEK MARGIN's fallback `—` → fixed F2;
  no positive test for WEEK MARGIN gloss `liveShown` branch / in-season footer → fixed F3.
- Fix-pass re-review: light, on fa4a8f3..f2ca8f8 — no flags.
- Checks re-run by Session 1 at f2ca8f8: npm test 192 files / 3697 passed · lint 0 problems · build clean apart from the pre-existing Vite chunk-size notice.
- Deviations from the task file: none (T6/T11 assert slightly more than specified).
- Not observed in smoke: a single teamcontext/<liveSeason>.json fetch on /week (network buffer empty) — structurally guarded by T12 and the useWeeklyDecision tests; PACE/PROE not re-compared at 375 width.
- Scoring / snapshot / cross-repo index: untouched. Backlog lines added: none.
