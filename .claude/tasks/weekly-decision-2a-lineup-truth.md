# W2a — /week: the lineup as set, the bench, schedule byes, store lag

Parent: `.claude/tasks/weekly-decision-surface.md`. Depends on **W1** (on `main`, `f4bd1a5`).
**Sequenced before W2**, which builds on this slice's row shape and its schedule util.

Source: a live review of `#/week` after W1 shipped (2026-09-21) produced four amendments. A1–A3 are
here; A4 is W2 §3. Every line reference below was read at `18d92b1` (= `f4bd1a5` + one task-file
commit).

**What this slice fixes.** W1's "The lineup" is the projection-*optimal* lineup, presented as
fact on a surface meant to make no recommendation. W2a shows the lineup as set in Sleeper, adds the
bench, takes byes from the schedule, and states when points-allowed lags the weekly stats.

---

## §0 Decisions already made — do not reopen

- **Starters = the actual Sleeper lineup, slot by slot.** **Bench = the rest of the active roster**,
  sorted PROJ desc with nulls last. No swap markers and no "projection would start" chips.
- **`buildBestLineup` leaves `/week` entirely.** No unrendered optimal lineup is computed in the
  background.
- **ALLOWS keeps the data store as its source**, to stay consistent with `/teams` and `/portfolio`.
  What gets fixed is **silent** staleness.
- **IR and taxi appear in neither section.** Neither can be started.

---

## §1 Findings against live source — where the brief and the repo disagree

Each item below was checked against the repo or the live Sleeper API on 2026-09-21. Session 2 does
not need to repeat the checks.

**1.1 — Taxi players are in `myPlayers` today. The brief says they are not.**
`App.jsx:827` builds `bench` as `roster.players − starters − reserve`. Sleeper's `roster.players`
**includes** taxi players. Checked against the live smoke league (Dynasty 040, league
`1312015497465716736`): on all 12 rosters every `taxi` id is also in `players`. The user's roster
(roster_id 2) carries 4. So W1 has been putting four taxi players into the optimisation pool as
bench, and a bench section built on `myTeam.bench` without a fix would list them as bench.

**1.2 — `roster.starters` order is preserved at the source, but empty slots leak as a fake player.**
`App.jsx:826` is `(roster.starters ?? []).filter(Boolean).map(id => enrichPlayer(id, 'Starter'))`.
- The order is Sleeper's and nothing re-sorts it. That part of the brief holds.
- `'0'` is a truthy string, so `filter(Boolean)` **keeps** Sleeper's empty-slot sentinel.
  `enrichPlayer('0')` finds no `playerMap` entry and returns the stub
  `{ id: '0', full_name: '0', position: '?' }`. So today an empty slot survives in position, but
  as a player named "0". That stub also renders in League → Rosters under "Other"
  (`RostersTab.jsx:10-13`).
- `filter(Boolean)` **would** drop a `null` or `''` entry, and dropping one would shift every later
  starter into the wrong slot. Sleeper uses `'0'`, so this is latent, but the fix must close it.
- No roster in the live league has an empty slot today (0 × `'0'`, 0 × null across 12 × 10
  starters). Nothing live confirms the `'0'` encoding; it rests on the brief. Treat `'0'`, `null`
  and `''` identically as "empty".

**1.3 — The starters array is already aligned to `startingSlots(rosterPositions)`.** Live:
`roster_positions` has 10 non-BN/TAXI/IR entries
(`QB RB RB WR WR WR TE FLEX FLEX SUPER_FLEX`) and every roster's `starters` has length 10.
`startingSlots` (`lineup.js:17-19`) keeps order. Pairing by index is correct.

**1.4 — The bye rule has no schedule input today.** `weeklyLineup.js:67-68`: `bye = opponent == null`,
with `opponent` taken from the projections row. `WeekView` does not receive `nflScheduleByYear`
(`App.jsx:1202-1211`).

**1.5 — The live-season schedule is loaded, and it has no byes in weeks 1–4.** `App.jsx:1060-1069`
loads `dataSeason + 1` into `nflScheduleByYear`. The live store file
`nflverse/schedule/2026.json` has 272 REG games across all 32 teams, in the era-accurate domain:
`LA` (not `LAR`), `LAC`, `LV`, `WAS`. Byes per week: weeks 1–4 have 0, week 5 has 2, and the first
6-team week is week 11. **A week-2 smoke cannot show a real bye.** Bye rendering is test-only in
this slice.

**1.6 — Store lag today.** Store `nfl/season-totals/2026.json`: 32 DEF rows, max `gamesPlayed` = 1,
`lastModified 2026-09-15`. Sleeper `nflState.week` = 2, so `completedWeeks` = 1: equal, and **no
notice fires at smoke time**. The lag notice is test-only in this slice too.

**1.7 — Don't reuse `gameLog.js:85` `findScheduleGame`.** It has no `gameType` filter, scans the
whole array per call, and is a CR-08 trigger site. Build a REG-only index once (§4).

---

## §2 Source fix — `App.jsx` roster assembly (A1, finding 1.1/1.2)

New pure module `src/utils/rosterSlots.js`. It imports nothing.

```js
export const EMPTY_SLOT_ID = '0'
// Sleeper's empty-starting-slot sentinel is the string '0'. null / '' are treated the same so a
// malformed entry can never shift later starters into the wrong slot.
export function isFilledSlotId(id) // → boolean
// Sleeper's raw roster.starters, one entry per starting slot, in roster_positions order →
// the same length, each entry a player id or null. Never filters, never re-sorts.
export function alignStarterSlots(rawStarters) // → Array<string|null>
```

`App.jsx:821-829` (inside the rosterTeams map):
- `starterSet` and `starters`: filter with `isFilledSlotId`, **not** `Boolean`. This removes the
  `'0'` stub from `starters`. Order is unchanged for every filled slot.
- **Add** `starterSlots: alignStarterSlots(roster.starters ?? [])`. It is aligned to
  `startingSlots(rosterPositions)` by index. This is the field `/week` renders from.
- **Add** `taxi: (roster.taxi ?? []).map(id => enrichPlayer(id, 'Taxi'))`.
- **Leave `bench` as it is** (it still includes taxi). This is deliberate. Removing taxi from `bench`
  at the source would silently change Portfolio's lineup engine: `buildLeagueLineups`
  (`lineup.js:172`) pools `starters + bench + reserve`, so Portfolio's ladders and weakest-slot
  numbers would move on a route this slice does not touch. `buildLeagueLineups` is also a named
  CR-01 trigger. `/week` excludes taxi itself, from the explicit `taxi` field (§3). Record the
  latent Portfolio behaviour (IR and taxi pooled into a startable lineup) in the hand-back as a
  separate follow-up. **Do not fix it here.**

The other consumers of `starters`: `App.jsx:343` (ownerMap), `App.jsx:881` (career-load rosterIds),
`RostersTab.jsx:10`, and `lineup.js:172`. Their only change is losing the `'0'` stub, which was
never a real player. None of them reads `starterSlots` or `taxi`. Grep `\.starters` after the change
and confirm that list is still complete.

Update `docs/architecture.md:89`'s `rosterTeams` shape comment: add `starterSlots` (aligned,
null = empty slot) and `taxi`, and note that `bench` includes taxi players.

---

## §3 `src/utils/weeklyLineup.js` — rebuilt around the set lineup (A1)

Replace the pool-and-optimise body. **Remove the `buildBestLineup` import.** New signature:

```js
export function buildWeeklyLineup({
  myTeam,            // rosterTeams entry: { starterSlots, starters, bench, reserve, taxi } | null
  rosterPositions,
  currentWeek,
  scheduleIndex,     // buildRegWeekIndex(...) result or null (§4)
  projections, scoringSettings, usageByPlayer, formByPlayer, fpaTable, fpaRanks, playerMap,
}) // → { starters: Row[], bench: Row[] }
```

**Starters.** `startingSlots(rosterPositions).map((slot, i) => …)`, with the id taken from
`myTeam.starterSlots[i]`:
- `null` (empty or missing) → an **empty row** for that slot: `player_id: null`, every scalar data
  field null, and **`form: [null, null, null]`, never `null`**. `FormBars({ form = [] })`
  (`LineupTable.jsx:45`) defaults only on `undefined`, so a `null` would throw at `.filter`. This is
  W1's existing empty-slot shape (`weeklyLineup.js:54`). It is **never skipped or collapsed**, whatever its position in the list.
- Otherwise the enriched entry is looked up by id in `myTeam.starters` (the `id`-keyed shape,
  `App.jsx:813-816`). A starter id with no enriched entry still renders, using the `enrichPlayer`
  stub fields.
- If `starterSlots` is longer than the slot list, the surplus ids go to the bench section. They are
  rostered, sit in no slot, and are not in `myTeam.bench` because `App.jsx` excluded them via
  `starterSet`. Without this rule they would vanish from both sections.

**Bench.** `myTeam.bench` minus every id in `myTeam.taxi` (plus any surplus from above). Sort by
`points` desc, **nulls last**. Break ties by `name` ascending, then id. `slot: 'BN'`.

**Never read `myTeam.reserve` or `myTeam.taxi` as candidates.** IR and taxi reach neither section.

**Row shape** (identical for both sections, and a superset of W1's slot shape, so W2 consumes it
unchanged):
`{ slot, player_id, name, position, team, role, opponent, opponentEra, bye, allows, allowsRank,
weight, usage, form, points }`

- `points`: `projections[id]?.stats ? calculateFantasyPoints(stats, scoringSettings) : null`. Keep
  W1's trap #2 comment. The absent-row branch is explicit because `calculateFantasyPoints({})`
  returns `0`, not `null`.
- `opponent` / `opponentEra` / `bye`: §4's resolution. `opponent` is the **Sleeper** domain (the VS
  cell displays it). `opponentEra` is the era-accurate key for the `fpaTable` / `fpaRanks` join.
  Resolve it **once**. `W2 §2` reuses `opponentEra` and must not re-derive it.
- `allows` / `allowsRank` / `weight`: W1's existing logic, keyed on `opponentEra`. Computed whenever
  `opponentEra != null` — which now includes an unprojected player whose opponent came from the
  schedule.
- `role`, `usage`, `form`: unchanged from W1.

Rewrite the header comment: the table is the lineup **as set in Sleeper**, and nothing on `/week`
ranks or selects players. Delete the two comments about the `id → player_id` remap and the pool
dedupe (`:21-25`, `:48-50`). Their premise is gone.

---

## §4 `src/utils/weeklySchedule.js` — byes from the schedule (A3), new, pure

**One util, two callers**: this slice's lineup rows, and W2 §3's season grid.

```js
// schedule: a loadNflSchedule result the CALLER has already gated on `complete` — pass null
// otherwise. REG games only. Both team codes go through normalizeTeamForSchedule (CR-16), the
// same way strengthOfSchedule.js's buildSosTable treats schedule codes.
export function buildRegWeekIndex(schedule)
// → Map<week:number, Map<eraTeam:string, { opponentEra:string, scored:boolean }>> | null
//   scored = homeScore != null — the played/unplayed gate strengthOfSchedule.js:35 already uses

// team: SLEEPER domain (a roster's playerMap team, or a weekly stat row's `team`). resolveTeamWeek
// itself runs it through normalizeTeamForSchedule BEFORE the index lookup — normalising only the
// schedule's codes (a no-op on a file already keyed `LA`) would leave every Rams player on 'bye'.
export function resolveTeamWeek(index, team, week)
// → { status: 'game', opponentEra, opponent }   // opponent = denormalizeTeamForSchedule(opponentEra)
//   { status: 'bye' }
//   { status: 'unknown' }
```

`unknown` whenever the schedule cannot answer. **A bye is never claimed on a guess.** That covers:
- `index` is null (the schedule is absent or incomplete);
- `team` is null or `'FA'` (the roster team is the literal string `'FA'` for a free agent, never
  null);
- the index has **no REG games at all for `week`**. This guards week 0, week 19+ and a malformed
  file. Without it, every team would read "bye".

Only then: the team has no game that week → `bye`; otherwise → `game`.

**Row resolution in `buildWeeklyLineup`** (with `r = resolveTeamWeek(scheduleIndex, player.team,
currentWeek)`):
1. `r.status === 'game'` → `opponent` / `opponentEra` from the schedule. `bye: false`.
2. `r.status === 'bye'` → `bye: true`, both opponent fields null. PROJ still renders whatever the
   projection row says; that is independent.
3. `r.status === 'unknown'` → W1's source: `projections[id]?.opponent`, with `opponentEra` from
   `normalizeTeamForSchedule` of it. `bye: false`. If there is no projection row either, the VS cell
   renders `—`. **It never renders BYE.**

This is a deliberate refinement of the brief. The brief keeps the projection's opponent and uses the
schedule only when the projection row is missing. Here the schedule is authoritative whenever it can
answer, so the VS column comes from one source per load, and it is the same source W2 §3's grid uses
for byes. The two surfaces cannot disagree about who a player faces.

**`WeekView` input.** `App.jsx:1202-1211` passes `nflScheduleByYear={nflScheduleByYear}`.
`WeekView` reads `nflScheduleByYear?.[season]`, where `season` = `parseInt(nflState.season, 10)` —
the live season, as WeekView already derives it. It passes the entry to the hook only if
`.complete`; otherwise it passes `null`. **Do not add a `loadNflSchedule` call** and do not key
anything on `dataSeason`. App's existing `sosSeason` effect already loads the live season, and if
that ever resolves to a different year, the key is simply absent and the graceful `unknown` path
runs.

---

## §5 Store lag — make ALLOWS staleness visible (A2)

**Plan-gate correction: the brief's comparison is wrong from week 15 on.** On the live 2026
schedule, after 14 completed weeks every team has had its bye, so the most games any team has
played is 13 (it is 16 after 17 weeks). `max DEF gamesPlayed < completedWeeks` would therefore
fire falsely every week until the season ends. The max also plateaus across byes, so it would
hide a real one-week lag. **Compare per team against the schedule.**

In `src/hooks/useWeeklyDecision.js`:

- **Extract** `maxDefGamesPlayed(players) → number | null` from `deriveGamesPlayed`'s loop
  (`:32-44`). It returns `null` when no DEF row exists. Rewrite `deriveGamesPlayed` on top of it
  **with unchanged behaviour**; its six existing tests stay green unedited. The weight panel's `n` is
  unchanged: it is still "max games played", which is what `w = n/(n+k)` needs.
- **Add** to `src/utils/weeklySchedule.js`
  `scheduledGamesThrough(index, eraTeam, week) → number`. It counts that team's REG games in weeks
  `1..week`.
- **Add** the pure export to `useWeeklyDecision.js`:
  ```js
  export function deriveStoreLag({ currentSeason, currentSeasonTotals, currentWeek, scheduleIndex })
  // → { storeThroughWeek, completedWeeks, behind } | null
  ```
  - It returns `null`, meaning no notice, when any of these holds:
    - `currentSeason == null` (the file is incomplete; this is the existing graceful-absence path);
    - the file has no DEF row;
    - `scheduleIndex` is null.

    Without the schedule there is no correct expected count, and a guess is exactly the false notice
    this section removes.
  - `completedWeeks = max(0, currentWeek − 1)`.
  - `storeGp[eraTeam]` = each DEF row's `gamesPlayed`. The key is the DEF row's own key, which is the
    Sleeper domain, so pass it through `normalizeTeamForSchedule` (a CR-16 hop).
  - `storeThroughWeek` = the largest `k` in `0..completedWeeks` such that, **for every team that has
    a DEF row in the store**, `storeGp[team] >= scheduledGamesThrough(index, team, k)`.
    - Every week has games, so each `k` changes at least one team's count. That makes this exact
      where the max is not.
    - A team **absent** from the store's DEF rows is skipped, not counted as 0. Counting it as 0
      would pin `storeThroughWeek` to 0 and select the "doesn't include any games" copy, which is
      false for the other 31 defences.
  - `behind = storeThroughWeek < completedWeeks`.
  - **Which games count.** `scheduledGamesThrough(index, team, k)` counts a team's REG games in
    weeks `1..k` that are either:
    - `scored`, or
    - in week `completedWeeks` itself. Scores for that week come from the schedule's own cron, which
      can lag too, so an unscored game in that week still counts.

    An unscored game in any **earlier** week was cancelled or postponed. It is not counted.
    Otherwise a game that is never made up would hold the notice up for the rest of the season: the
    same standing false notice this section removes. Say so in the header.
- The hook builds `scheduleIndex` **once**, in a memo, and returns it with `storeLag`. W2 reads it
  from there. **No other `buildRegWeekIndex` call site** is allowed; see CR-08 in §9.

**Render** — a new `src/components/week/StoreLagNotice.jsx`, in `WeekView` directly above
`<LineupTable>`. It renders nothing unless `storeLag?.behind`. One line of muted copy, not an error
colour:

> Points-allowed figures run through week {storeThroughWeek}; week {completedWeeks} hasn't reached the data store yet.

If `storeThroughWeek === 0`, use:

> Points-allowed figures don't include any {season} games; week {completedWeeks} hasn't reached the data store yet.

The second variant is Session 1's addition, not the brief's. Flag it in the hand-back.

**`WeightPanel`** takes `storeLag`. When `behind`, the header's right-hand text becomes
`n = {n} GAME{S} · STORE THROUGH WK {storeThroughWeek} · w = n / (n + k)`. Otherwise it is
unchanged.

**Copy and comment rule** (CLAUDE.md, "Reference docs state capability and mechanism", enforced by
`docsAvailabilityClaims.test.js`):
- The notice is a runtime branch on observed state, and that is allowed.
- **No comment may describe the store's current state, or predict when the job lands.** Say what is
  compared and what renders.
- Cron cadence may be named as mechanism, never as a promise.

It is **expected** to fire for a few hours most Tuesdays, between Sleeper advancing the week and the
season-totals job landing. That is correct behaviour, not a bug to suppress.

---

## §6 `WeekView` / `useWeeklyDecision` / `LineupTable` wiring

**`WeekView.jsx`**
- Delete the `myPlayers` memo (`:52-55`) and its comment.
- Pass `myTeam` and the gated `schedule` into the hook. The hook builds `scheduleIndex` in a memo.
- Render `<StoreLagNotice>` and `<LineupTable starters={…} bench={…} …>`.

**`useWeeklyDecision.js`**
- Takes `myTeam` in place of `myPlayers`.
- Computes `usageByPlayer` / `formByPlayer` over **every rendered row's player**, including the surplus-starter ids §3 sends to the bench — i.e. the rendered
  players only.
- Takes `schedule` (the gated loader result, or null) and builds `scheduleIndex` in one memo.
- Returns `{ weights, lineup: { starters, bench }, n, storeLag, scheduleIndex, loading, error,
  failedWeeks, weeklyMaps, playedWeeklyMaps }`.
- Update the header's degraded-paths paragraph (`:20-27`). It currently says an empty roster yields
  "ten empty slots" and that the lineup "ranks on projection alone"; both are now false.

**`LineupTable.jsx`**
- Props: `{ starters, bench, loading }`.
- Replace the subtitle (`:112-114`, "ten slots by projected points"). It is the recommendation
  framing this slice removes. New text: `{starters.length} slots as set in Sleeper, then the bench ·
  opponent, usage and form beside each`.
- Starters render in the given order. An empty row shows the slot label and the muted word `Empty`
  in the PLAYER cell, `—` everywhere else, and PROJ `—`.
- If `bench.length > 0`, add a section-divider row (`colSpan` across all columns), mono caps:
  `BENCH · {bench.length}`. Bench rows follow, slot label `BN`. With no bench players, render no
  divider.
- Every column renders for bench rows exactly as it does for starters.
- **PROJ renders `—` for `points == null`, never `0.0`.** A `0.0` appears only for a real
  projection of zero.
- VS cell: `bye` → `BYE`; otherwise `opponent ?? '—'`.
- **Rewrite** the `PROVISIONAL(no-data)` comment on the opponent's W-L record (`:190-193`). Its
  current reason ("no NFL-schedule/standings source is wired… would need a… schedule fetch")
  becomes false in this slice: `weeklySchedule.js` wires in the schedule, whose
  `homeScore`/`awayScore` a record would need. New text:
  `// PROVISIONAL(no-data): opponent W-L record · not derived this slice · the live schedule's
  homeScore/awayScore (already indexed by weeklySchedule.js) would supply it`.
  Still render nothing. Adding the record is not in scope.
- Update the header comment (`:1-7`): drop "ten rows", and describe starters-as-set plus the bench.

---

## §7 Tests

**Each A1/A3 test must discriminate.** In the hand-back, Session 2 shows each one **red** under the
named mutation: apply the mutation, run, paste the failing assertion line, then revert. A test that
stays green under its mutation does not count.

| Test | File | Red under this mutation |
|---|---|---|
| A lineup set **sub-optimally** by projection renders unchanged, in `startingSlots` order. Fixture: a bench QB out-projects the starting QB, and FLEX holds a TE while SUPER_FLEX holds an RB. Assert starters' `player_id`s equal `starterSlots` and their `slot`s equal `startingSlots(rosterPositions)`. | `weeklyLineup.test.js` | Reinstate `buildBestLineup` over starters+bench |
| An **empty (`'0'`) slot in the middle** of `starterSlots` renders as an empty row in that slot, and every later starter keeps its own slot. | `rosterSlots.test.js` (`alignStarterSlots`) **and** `weeklyLineup.test.js` | Filter nulls before mapping (the `filter(Boolean)`-style collapse) |
| `alignStarterSlots(['a', null, '', '0', 'b'])` has length 5 with nulls at indices 1–3. | `rosterSlots.test.js` | `.filter(Boolean)` |
| `isFilledSlotId('0') === false`, `isFilledSlotId(null) === false`, `isFilledSlotId('') === false`, `isFilledSlotId('4046') === true`. This is the only test guarding the `App.jsx` source fix: the live league has no empty slot to smoke against. | `rosterSlots.test.js` | `isFilledSlotId = Boolean` |
| **Surplus starters:** `starterSlots` has one id more than `startingSlots(rosterPositions)`. The extra id appears in the bench section, not in neither. | `weeklyLineup.test.js` | Drop the surplus rule |
| A **projected IR player** (highest projection on the roster, eligible for FLEX) appears in neither section. | `weeklyLineup.test.js` | Append `myTeam.reserve` to the bench candidates |
| A **taxi player** present in both `myTeam.bench` and `myTeam.taxi` appears in neither section. | `weeklyLineup.test.js` | Drop the taxi exclusion |
| **Bench sorted PROJ desc, nulls last.** Fixture: a bench player with **no projection row** whose name sorts *before* a bench player whose real projection scores exactly `0.0` (empty `stats`). Assert the unprojected player is last and has `points === null`. | `weeklyLineup.test.js` | Coerce `points ?? 0` in the comparator (the tie-break then puts the null first) |
| An unprojected bench row renders PROJ `—`, not `0.0`; the real-zero row renders `0.0`. | new `LineupTable.test.jsx` | Render `(r.points ?? 0).toFixed(1)` |
| An empty starter row renders `Empty`; the `BENCH · n` divider renders only when the bench is non-empty. | `LineupTable.test.jsx` | — (render contract) |
| **A3:** an unprojected starter whose team has a game → `bye: false`, `opponent` taken from the schedule, `points: null`. | `weeklyLineup.test.js` | Revert to `bye = projRow?.opponent == null` |
| **A3:** a team with no REG game that week → `bye: true`. | `weeklySchedule.test.js` | — |
| **A3:** roster team `LAR` against a schedule keyed `LA` resolves as a **game**, with `opponent` in the Sleeper domain and `opponentEra` in the era domain. | `weeklySchedule.test.js` | Drop the `normalizeTeamForSchedule` call **on the `team` input inside `resolveTeamWeek`** (the Rams then read as a bye). Dropping it only in `buildRegWeekIndex` stays green by design, because that call is a no-op on `LA`. |
| **A3:** schedule `null`, and no projection row → `unknown`; the row has `bye: false`, `opponent: null`. | both | Treat `unknown` as `bye` |
| **A3:** `team` null or `'FA'` → `unknown`, never `bye`. | `weeklySchedule.test.js` | Omit the `'FA'` guard |
| **A3:** week 19 (no REG games in the index) → `unknown` for every team. | `weeklySchedule.test.js` | Omit the empty-week guard |
| **A3:** a `POST` game in week 19 between `KC` and `BUF`, with no REG games in week 19. `resolveTeamWeek(idx, 'KC', 19)` → `unknown` and `(idx, 'DAL', 19)` → `unknown`. | `weeklySchedule.test.js` | Omit the `gameType` filter (week 19 then has games: KC reads `game`, DAL reads `bye`) |
| **A2:** store equal to the schedule through `completedWeeks` → `behind: false`, and `StoreLagNotice` renders nothing. | `useWeeklyDecision.test.js`, new `StoreLagNotice.test.jsx` | — |
| **A2, the plan-gate case:** 32 teams, `completedWeeks` 14, and every team has had exactly one bye by week 14, so every store DEF `gamesPlayed` is 13 and the store is current. → `behind: false`. | `useWeeklyDecision.test.js` | Replace with the brief's `maxDefGamesPlayed < completedWeeks` (red: fires falsely) |
| **A2, plateau lag:** the same season, but the store only runs through week 13, and the week-14 bye teams' counts equal their week-13 counts. → `behind: true`, `storeThroughWeek: 13`. | same | Compare max-to-max (red: the plateau hides the lag) |
| **A2:** store behind → the notice text contains **both** numbers. `storeThroughWeek === 0` → the second variant. | `StoreLagNotice.test.jsx` | — |
| **A2:** A week-3 game left unscored (cancelled) at `completedWeeks` 6 does not hold the notice up → `behind: false` once the store is current. A missing DEF row for one team does not zero `storeThroughWeek`. | `useWeeklyDecision.test.js` | Count scheduled games regardless of `scored` (red), and count an absent team as 0 (red) |
| **A2:** `currentSeasonTotals.complete === false` → `null`; `scheduleIndex` null → `null`. In both cases no notice renders and the page still renders. | `useWeeklyDecision.test.js` | Fall back to `currentWeek − 1` (red) |
| **A2:** DEF row keyed `LAR` against a schedule keyed `LA` counts toward `LA`. | `useWeeklyDecision.test.js` | Drop `normalizeTeamForSchedule` (red: the Rams read 0 games, so the notice fires falsely) |
| `WeightPanel` shows `STORE THROUGH WK {k}` only when `behind`. | new `WeightPanel.test.jsx` | — |

**Existing tests.**
- In `weeklyLineup.test.js`, **delete** the trap #1 and trap #2 `describe`s (`:13-101`) and the
  `bye` case (`:108-122`). They assert the optimiser and the projection-inferred bye, which is the
  behaviour this slice removes.
- Port the LAR / weight / form cases (`:124-190`) to the new signature, with an `id`-shaped roster
  in `myTeam.starters`.
- Trap #2's null-not-0 rule survives as the bench-sort test above.

**Guards.**
- Extend `src/__tests__/weeklyDecisionViewOnly.test.js` with `weeklySchedule` and `rosterSlots`.
- Add one assertion that `src/utils/weeklyLineup.js`, `src/hooks/useWeeklyDecision.js` and every
  file under `src/components/week/` contain no `buildBestLineup` reference. That is the regression
  guard for "no unrendered lineup computed in the background".
- `scheduleViewOnly.test.js` and `lineupViewOnly.test.js` must stay green unmodified.

---

## §8 Docs (same change)

- `CLAUDE.md:47` — "the ten-slot lineup table" → "the lineup table (starters as set in Sleeper, then
  the bench)".
- `docs/navigation.md:22` and `:89`.
- `docs/nav/components.md:8`, plus rows for `LineupTable`, `WeightPanel` and `StoreLagNotice` if the
  file lists them.
- `docs/nav/utils.md:55` (`weeklyLineup.js`). Its text names `buildBestLineup`, which is now wrong.
  Add rows for `weeklySchedule.js` and `rosterSlots.js`.
- `docs/architecture.md:89` (§2).
- `docs/signal-registry.md` (CR-18, §9): the NFL-schedule row's **Current use** (`:58`) gains
  `/week`: the lineup's VS/BYE via `utils/weeklySchedule.js`, reading `week`/`gameType`/`homeTeam`/
  `awayTeam` off the live season's file. The `fan_pts_allow_*` row (`:54`) gains `/week`'s ALLOWS
  column. **That second edit is W1's omission, corrected here**: W1 added a third `buildFpaTable`
  consumer and never recorded it. Both edits must obey the docs-availability rule above.

---

## §9 Cross-repo impact

The brief expected none. **Six entries are triggered** (four in the first draft; the plan gate added CR-16 and CR-02). The reason is the one the brief itself warns
about: by the registry's trigger format **a new call site of a named symbol is a trigger** (W1 fix
pass 1.9 established this for CR-20). This slice adds such call sites.

**No data-repo file, schema, floor, cadence or manifest family changes.** The obligation is emission.
**Do not edit `docs/cross-repo-registry.md`**: it is a mirrored region under CR-24 byte-identity.
Every registry correction goes to `.claude/tasks/data-repo-backlog.md` with the commit SHA, marked
non-blocking, for the two-session route.

**CR-08 · nflverse schedule (read-only): triggered.** `src/utils/weeklySchedule.js` is a new reader
of the served `gameType`/`homeTeam`/`awayTeam`, and of `week`. It is the third app-side reader, on
exactly the basis `buildSosTable` was listed as the second. It also makes `/week` a consumer of App's
second `loadNflSchedule` call site (`App.jsx:1067`, the `sosSeason` load), which until now fed only
Portfolio's SOS column. Backlog: append `src/utils/weeklySchedule.js` `buildRegWeekIndex` to CR-08's
App side and Triggers.

> **Mirror:** Shape or floor changes land in both repos together. Read-only on the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written, with no validator to catch it (this family stays read-only/view-only on the app side regardless).

**CR-21 · In-progress season-totals reads: triggered.** §5 reads the live file's DEF-row
`gamesPlayed` as a **freshness** signal, which is the same read W1 §9 counted as a CR-21 trigger, now
put to a new use. Two backlog items follow:
1. Add `deriveStoreLag` / `maxDefGamesPlayed` (`src/hooks/useWeeklyDecision.js`) to CR-21's App
   side.
2. **Propose a Mirror amendment.** The sentence "if the weekly job stops running … the app has no
   way to tell" becomes partly false for `/week`: a stopped job now surfaces as a persistent lag
   notice. It is still true for `/teams` and `/portfolio`. Proposed replacement clause:
   `…the app has no way to tell on /teams or /portfolio; /week compares each team's DEF-row
   gamesPlayed against that team's scheduled REG games through Sleeper's completed weeks and
   states the lag (weekly-decision-2a §5), so a stopped job surfaces there as a lag notice that
   never clears.`

> **Mirror:** If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will render a half-season's rates as though they were a season's, with no error and no test failure. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

`deriveStoreLag` compares **completeness** per team against the schedule, not correctness. It detects a job that has not landed,
not a partial scrape. That is exactly the Mirror's "must not assume" line. Keep the notice's wording
to "hasn't reached the data store", which is what it measures.

**CR-20 · `fan_pts_allow_*` DEF-row key preservation: triggered.** §5 moves the `isDefenseRowId`
call inside `useWeeklyDecision.js` (into `maxDefGamesPlayed`) and §6 moves the `buildFpaTable` /
`rankFpaTable` lines. Open backlog item **D-23** pins those three call sites by line (`:37`, `:153`,
`:159`) for the pending sync. **Update D-23's proposed text** to the post-change line numbers in the
same commit. Otherwise the sync will write stale anchors into the mirrored region. **D-23's anchors are already stale at HEAD**: `buildFpaTable` is at `:155`, not `:153`, and `rankFpaTable` is at `:161`, not `:159`. So **re-derive all three from the post-change file with `grep -n`**, rather than shifting the old numbers.

> **Mirror:** Do not remove, rename or filter `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/(total), and do not widen `prunePlayerStats`'s denylist (or replace it with an allowlist) without an explicit DEF-row exemption alongside the existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA QB/RB/WR/TE columns degrade silently to `—` across all 32 teams** if either the keys or the rows vanish — no error, no test failure, indistinguishable from the API-only-mode degraded state already shown for an unrelated reason (§6 of the task file). This is the exact silent-degradation shape CR-11/12/13/19 exist to record, for a *row*, not merely a key.

**CR-18 · Signal registry rows: triggered.** §8 edits two Current-use cells in
`docs/signal-registry.md` (CR-18's app-side Trigger). The app owns this file, so the edit itself is
the app side. Nothing is owed data-side beyond awareness.

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**CR-16 · Era-accurate team-code remap: triggered.** *(The first draft called it untriggered. The plan gate overturned that and the rule in this section's opening agrees: CR-16's Triggers name `normalizeTeamForSchedule` in `nflStats.js`, and this slice adds new call sites.)* Those call sites are `resolveTeamWeek` (team input), `buildRegWeekIndex` (schedule codes), `deriveStoreLag` (DEF keys) and `denormalizeTeamForSchedule` for the VS display. This is a schedule ↔ season-totals join, which is exactly CR-16's Invariant. Backlog: add `src/utils/weeklySchedule.js` and `deriveStoreLag` to CR-16's App side, and note that `denormalizeTeamForSchedule` (`nflStats.js:18`) is unnamed there.

> **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

**CR-02 · season-totals row composition: triggered.** *(The first draft called it untriggered.)* `isDefenseRowId` is a named CR-02 Trigger. §5 moves its call and puts the served DEF rows' `gamesPlayed` to a new use: a per-team freshness signal. Backlog: add `maxDefGamesPlayed` / `deriveStoreLag` to CR-02's app-side reader list.

> **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

**Registry staleness to carry into the backlog.** Every item here was found by the gate. None is a W2a change; append each so the two-session sync can fix it:
- CR-21: its Trigger is `buildFpaTable`'s `currentRows`, but none of the three call sites that pass it is listed (`useWeeklyDecision.js:157`, `Teams.jsx:163`, `Portfolio.jsx:372`).
- CR-16: callers are unlisted (`weeklyLineup.js:77`, from W1; it survives in §4's `unknown` fallback; `opponentStrength.js:88`, `strengthOfSchedule.js:25-26`, `teamExposure.js:22`, `Portfolio.jsx:606,851,975`, `TeamDetail.jsx:180,192`).
- CR-08: the `loadNflSchedule` anchors are one line off (`App.jsx:1048` and `:1068`, not `:1047` and `:1067`).

**Checked, not triggered:**
- **CR-01** (projection snapshot). Its Triggers include `lineup.js` `buildLeagueLineups` (the `proj` accessor). §2 **deliberately leaves `bench` unchanged** so that `buildLeagueLineups` needs no edit. `lineup.js` is not touched.
- **CR-10** (teamcontext): not read.
- **CR-14** (`calculateFantasyPoints`): the definition is untouched, and the call already exists (W1).
- **CR-22** (App.jsx `LS_*` / boot auto-load): the roster edit is in the league-load effect, not the boot effect.
- **CR-24**: the registry file is not edited.

---

## §10 Done-definition

Standard (CLAUDE.md), plus the following.

**Red demonstrations.** Every mutation in §7's table: the failing line, pasted.

**Smoke `/week`** (`.claude/launch.json`; Colts_420_Reloaded / Dynasty 040), and report each item:
- **Starters match Sleeper.** Compare the ten rendered starters, in order, against
  `GET https://api.sleeper.app/v1/league/1312015497465716736/rosters` → roster_id 2 → `starters`.
  Paste both lists.
- **Bench count** = `players − starters − reserve − taxi` from the same response. The four taxi
  players are absent from both sections. Name them.
- **No BYE is shown** at week 2 (the schedule has no week-2 byes, finding 1.5). Report any starter
  or bench row with PROJ `—`, and what its VS cell says.
- **No store-lag notice renders** (finding 1.6), and the weight panel's header is W1's.
- The subtitle no longer says "by projected points".

**Regression checks on other surfaces:**
- League → Rosters still lists the taxi players, and no player named "0".
- Market still shows the owner for one of the user's taxi players.

**Backlog appends** (with the commit SHA):
- CR-08, CR-21 × 2, CR-16 and CR-02 (§9);
- the D-23 anchor re-derivation;
- the three registry-staleness items in §9.
A follow-up note (**not** a data-repo item; put it in the hand-back) that Portfolio's
`buildLeagueLineups` pools IR and taxi players into a startable lineup.

`grep -rn "PROVISIONAL(" src/` output in the hand-back.

---

## Review record — plan gate, 2026-09-21

| Flag | Verdict | Applied where |
|---|---|---|
| The store-lag max-vs-completed check fires falsely once all byes are past | **Accepted.** This is the brief's premise, not only the plan's. Verified live: at 14 completed weeks the max is 13; at 17 it is 16. | §5 rewritten as a per-team comparison against the schedule; new tests for the gate case and the plateau lag. |
| An empty row with `form: null` crashes `FormBars` | **Accepted.** Verified: `LineupTable.jsx:45` defaults only on `undefined`. | §3 |
| The PROVISIONAL W-L reason becomes false | **Accepted.** | §6 rewrites the tag; still not rendered. |
| CR-16 was wrongly marked not triggered | **Accepted.** | §9 plus Mirror |
| CR-02 was wrongly marked not triggered | **Accepted.** | §9 plus Mirror |
| `resolveTeamWeek` must normalise its `team` input | **Accepted.** | §4 comment; §7 mutation names the call site |
| The POST-game fixture may not discriminate | **Accepted.** | §7: week-19 fixture |
| Nothing tests the `App.jsx` source fix | **Accepted.** | §7: `isFilledSlotId` test |
| The surplus-starter rule has no test | **Accepted.** | §7 |
| D-23 anchors are already stale | **Accepted.** | §9: re-derive, don't shift |
| Registry staleness (CR-02, CR-21, CR-20, CR-16, CR-08) | **Recorded.** | §9 backlog list |

### Confirmation round (same day)

| Flag | Verdict | Applied |
|---|---|---|
| A cancelled game pins the notice permanently | **Accepted.** | §5 counts `scored` games, plus the unscored latest week; the index carries `scored`. |
| A missing DEF row zeros `storeThroughWeek` | **Accepted.** | §5 skips absent teams. |
| Surplus starters get null usage and form | **Accepted.** | §6: every rendered row |
| `weeklyLineup.js:77` missing from the CR-16 staleness list | **Accepted.** | §9 |
| Size | **Noted.** | About 42KB, at the split threshold only because of the review record. Kept as one slice. |
