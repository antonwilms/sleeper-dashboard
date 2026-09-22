# W2 — /week: defences faced, offences owned, the season grid

Parent: `.claude/tasks/weekly-decision-surface.md`. Depends on **W2a**
(`.claude/tasks/weekly-decision-2a-lineup-truth.md`), which must be merged first. Adds artboard 9a's
remaining three panels to `WeekView`.

**Revised 2026-09-21 after the live review of `#/week` (amendments A1–A4).** A1–A3 changed the
shipped lineup table, so they went to **W2a**. This file keeps only additive work, built on W2a's
outputs:
- the lineup `{ starters, bench }` row shape, in which each row carries `opponent` (Sleeper domain)
  and `opponentEra`, resolved once;
- `src/utils/weeklySchedule.js`'s `buildRegWeekIndex` / `resolveTeamWeek`;
- `myTeam.starterSlots` / `myTeam.taxi`.

A4 (grid scope and row order) is §3 below. Nothing here changes a W2a shape.

**One additive change to W2a's hook return.** `useWeeklyDecision` additionally returns
`projections`, `fpaTable`, `priorRows` and `currentRows`: the same two row maps it already resolves
for `buildFpaTable`, so §2 gates them identically by construction. It also returns
`priorSnapByPlayer` (§1a) and `liveTeamContext`, the §4 `loadTeamContext` result, returned as-is. `scheduleIndex` is already
returned by W2a. **Do not call `buildRegWeekIndex` anywhere else.** A second call site would make
this slice a new CR-08 reader.

---

## §1 Scope

| Panel | Source | New module |
|---|---|---|
| Usage: prior-season sub-line (SNAP only) | stored prior-season `off_snp`/`tm_off_snp` | `priorSeasonSnapShare` in `weeklyUsage.js`; optional `LineupTable` prop (starter **and** bench rows) |
| Defences you face | the W1 `fpaTable`, unmixed | `DefencesFaced.jsx` |
| Offences you own | `loadTeamContext(liveSeason)`, week grain | `OffencesOwned.jsx` |
| Why PROJ is blank (§4b) | the projections payload + scoring settings | `projectionGapReason` in `weeklyLineup.js`; `ProjectionGapNotice.jsx` |
| The season, week by week | the W1 weekly maps | `SeasonGrid.jsx` + `src/utils/weeklySeasonGrid.js` |

---

## §1a The prior-season grey sub-line *(carried over from W1)*

The design puts last season's share in grey beneath each of the four usage columns. **W1 shipped
without it** — W1 §3 defined only current-window accumulation while W1 §6 specified the sub-line, an
internal inconsistency in that task file. W1's fix pass 1.5 removed the misleading
`PROVISIONAL(no-data)` tag (the source is not absent) and deferred the element here. Implement it in
this slice.

**Plan-gate correction (2026-09-21): do not reuse `buildPerSeasonTeamShares` / `buildUsageHistory`.**
The earlier draft said to, and it also said to keep W1's denominator. Those two instructions
conflict. Those helpers use a different basis from W1's `computeUsageShares`
(`weeklyUsage.js:98-115`):
- targets are divided by summed player targets, not by team `pass_att`;
- carries are summed over `playerMap` members only;
- they require `gp >= 8`;
- carry share is given for RBs only (`outlookPositionStats.js:48-50,79,91-101`);
- snap% is null for QBs, and an absent `off_snp` reads as null, not 0 (`outlookUsage.js:62-64`).

A grey number on a different basis from the value above it is the thing this section forbids.

**Confirmation-round correction (2026-09-21): only SNAP can be shown on W1's basis.** W1's team
denominators accumulate only over the weeks the player played (`weeklyUsage.js:64,72-73`). A stored
`TEAM_<abbr>` row is the team's **whole** season (the fixture's `TEAM_IND`: `gp` 17, `pass_att`
547). So a player who played 8 of 17 games would get about half his real rush, target or touch
share. Scaling by `gamesPlayed` ratios would be an approximation, and the standing directive is
"omit rather than approximate". Stored rows carry no per-week team volume, so an exact
reconstruction is impossible.

**The rule: SNAP only.** Per-player `tm_off_snp` already counts only that player's own games, so
snap is exact. New pure helper in `src/utils/weeklyUsage.js`, beside W1's functions, additive:

```js
export function priorSeasonSnapShare(seasonRows, playerId)
// seasonRows = careerStats[deriveDataSeason(careerStats)] → number in [0,1] | null
```

- The share is `(off_snp ?? 0) / tm_off_snp` when `tm_off_snp > 0` and `gamesPlayed > 0`. That is
  W1's rule: an absent numerator beside a present denominator is a real 0.
- Otherwise the share is null.
- All positions, as in W1.

**RUSH / TARGET / TOUCH render nothing beneath them.** This is the "half a grey line is acceptable"
case below, and it is a decision, not a gap. Say so in the helper's header. It is revisitable if Anton
prefers a stated approximation. `buildPerSeasonTeamShares` / `buildUsageHistory` stay unused here:
they are a different basis (first-round flag).

**Delivery.** The hook returns `priorSnapByPlayer` (`{ [id]: number|null }`) over every rendered row.
`LineupTable` takes it as a new **optional** prop, defaulting to `{}`. W2a's row shape is untouched.

Where a cell's prior-season value is genuinely underivable, render nothing beneath that cell. **Do
not render a dash**: the sub-line is a secondary annotation, and a dash there reads as "last season
was zero" rather than "not computed". Half a grey line across a row is acceptable; a misleading one
is not.

`season` here is `deriveDataSeason(careerStats)` — the same prior season W1 §5.3 blends against, not
`season - 1`. The two must agree, or the row's grey line describes a different year than its ALLOWS
column.

The sub-line renders on **bench rows as well as starter rows**: W2a made the bench a first-class
section with every column shared. On empty starter rows it renders nothing.

**Cross-repo note (§6).** `priorSeasonSnapShare` reads `off_snp` / `tm_off_snp` off stored player
rows. Those are CR-11's keys, so CR-11 is triggered.

---

## §2 Defences you face

**Rows.** One row per **filled** W2a starter row, in set-lineup order. Empty slots and bench players
get no row: the panel is about the defences your starters face.

**Opponent key.** Take each row's `opponent` (Sleeper domain) and `opponentEra` (era-accurate) from
W2a's row as they are. **Never re-derive them from the projection row.** That was W1's source, and
W2a made the schedule authoritative.
- `computeFpaPerGame` keys on the DEF row's own Sleeper-domain key, so pass it `opponent`.
- `fpaTable` is keyed era-accurate, so it uses `opponentEra`.
- A row with `bye` true, or `opponent` null, renders `BYE` / `—` across the value columns.

The blend from W1 shown unmixed, with columns DEF · VS · `{prior} PTS/G` ·
`{season} SO FAR` · BLENDED · RANK. Header right: `k 3`. **The weight is per row, not per panel.**
`fpaTable[opponentEra].weights[pos]` differs by defence and position (byes), so a single
`{pct} THIS SEASON` in the header would be wrong for most rows.
- Render each row's own weight beneath BLENDED, the same bar and percentage as W1's `AllowsCell`,
  using W1's `weight` from W2a's row.
- **Once a defence reaches `FPA_PRIOR_DROP_GAMES` (9) games, the blend drops the prior entirely**
  (`opponentStrength.js:33,105`). The prior cell still shows its value, muted, with the label
  `not blended`. Otherwise the panel would claim that column is a half of the number beside it.

`buildFpaTable` returns only the blended value and `weights[pos]` — **the two source halves do not
escape it.** Do not add them to its return shape; that widens a signature two shipped surfaces
depend on, for one panel's benefit. Instead call the already-exported
`computeFpaPerGame(rows, team, pos)` twice in this panel's own memo — which is exactly what it is
exported for — **against the same two row maps W1 §5.3 resolves, by the same rules**. **Use the hook's returned
`priorRows` / `currentRows`; do not re-derive them in the panel.** The block below documents what
the hook already computes:

```js
const dataSeason = deriveDataSeason(careerStats)                 // NOT season - 1
const currentSeason = currentSeasonTotals?.complete ? currentSeasonTotals.season : null
const priorRows   = careerStats?.[dataSeason] ?? null
const currentRows = currentSeason != null ? currentSeasonTotals.players : null
```

This matters **more** here than in W1, not less: this panel advertises its two columns as the halves
*of the blend rendered beside them*. A `season - 1` that differs from `dataSeason` puts a number
under the `{prior} PTS/G` header that was not the prior actually blended in, and an ungated
`.players` lets the loader's graceful-empty `{}` read as a real current-season half. Both produce a
panel that contradicts the number it exists to explain — silently, and in the one place a user goes
to check the blend. Both take the DEF row's **own key** (Sleeper domain, `LAR`), while `fpaTable` is keyed
era-accurate. W2a resolved both forms once (`opponent` / `opponentEra`). Use them, and do not
convert again.

Empty halves are normal and must render `—`, never `0`: no current-season file yet (preseason), a
defence with `gamesPlayed === 0` (its week-1 bye), or no prior season in `careerStats`.

Footnote, from the design: the two source columns sit beside the blend rather than behind a tooltip
— a current-season column far from its prior neighbour is a defence that has changed, or one that
has played one game. Keep the half-PPR-basis disclosure; it applies to every number in this panel.

---

## §3 The season grid

**Scope and order (A4).** One row per **rostered** player, not the design's ten. Rows appear in three
visually separated groups, which match W2a's table sections so the grid and the table read as one
roster:

1. **Starters**, in set-lineup order: W2a's filled starter rows. Empty slots get no grid row.
2. **Bench**, in W2a's bench order (PROJ desc, nulls last). Taxi is excluded.
3. **IR**: `myTeam.reserve`, in roster order.

Taxi is in neither group, consistent with W2a. Label each group with a divider row (`STARTERS` /
`BENCH` / `IR`), and omit a group that has no rows. Each row has 18 columns.

`src/utils/weeklySeasonGrid.js`, new, pure:

```js
export function buildSeasonGrid({ groups, weeklyMaps, failedWeeks, scheduleIndex, projections, scoringSettings, currentWeek })
// groups: [{ key: 'starters'|'bench'|'ir', players: [{ id, name, team }] }] — assembled by the caller
//         from W2a's lineup rows + myTeam.reserve; this util does not re-derive section membership
// scheduleIndex: W2a's buildRegWeekIndex(...) result, or null
// → [{ key, rows: [{ id, name, cells: [{ week, kind, points }] }] }]
// kind: 'played' | 'projected' | 'bye' | 'dnp' | 'future' | 'unknown'
```

**The team for week w** (used only for the bye/DNP distinction). The rule must be stated in code,
not left to Session 2:
1. That week's own row: `weeklyMaps.find(m => m.week === w)?.rows?.[playerId]?.team`, **only if
   non-null**.
   - `weeklyMaps` is a week-sorted array with failed weeks removed (`useWeeklyDecision.js:114-124`),
     so `weeklyMaps[w]` is off by one and shifts again after any gap. Never index it.
   - Rows can carry `team: null` (`sleeperStats.js:126`).
   - **For `week >= currentWeek`, skip steps 1–3 and use the roster team.** That is W2a's
     current-week source, and it is what lets the grid and the table agree.
2. Otherwise the nearest **preceding** week in the fetched window that has a row.
3. Otherwise the nearest **following** week that has one.
4. Otherwise the roster team (`player.team`, the Sleeper domain). This covers future weeks and
   players with no row all season.
5. If that is null or `'FA'`, the team is unresolved.

Resolve from the week's own row **before** `playerMap`. Otherwise a traded player's grid shows his
*new* team's byes across weeks he played for his old one. That is the same field W1 §3's
`accumulateUsage` follows. `weeklyUsage.js` exports no resolver (`:67` reads `row.team` inline).
Write the lookup inside `weeklySeasonGrid.js`, and **do not add an export to `weeklyUsage.js`
for it**.

Carry-forward is an inference, not an observation: a player absent across a trade gets the wrong
team for the absent weeks, and therefore possibly the wrong bye. Say so in the module header. Keep
the inference to the bye/DNP distinction. It never touches a points value, because a week with no row
has no points either.

**Revised from the pre-A3 draft:** step 4 is new, and **byes no longer come from an absent
`TEAM_<abbr>` row**. They come from `resolveTeamWeek(scheduleIndex, team, w)`, **the same function**
W2a's lineup rows use (A3: build it once, use it in both places). Two consequences:
- A future week can now be a bye. It is known from the schedule.
- The table and grid can never disagree about whether a player's team plays this week.

Kinds, in precedence order:
- `played` (`week < currentWeek`, and the player has a `gp === 1` row) → `calculateFantasyPoints` on
  that week's raw stats in league settings. Filled cell, intensity by value.
- `bye` (`resolveTeamWeek` → `bye`) → dashed cell, no number. This applies in any week, past or
  future.
- `projected` (`week === currentWeek`, not a bye) → the W1 projection. Outlined cell. With no
  projection, render an outlined empty cell, never `0`. **"No projection" means `!hasScoringProjection(row?.stats, scoringSettings)`** (W2a fix pass 1.1, exported from `weeklyLineup.js`): Sleeper ships ADP-only rows (`{ adp_dd_ppr }`) that score 0 but are not a projection.
- `dnp` (`week < currentWeek`, `resolveTeamWeek` → `game`, no `gp === 1` row) → `—`. This is
  distinct from a bye and from a zero.
- `future` (`week > currentWeek`, not a bye) → empty outlined cell.
- `unknown` → neutral empty cell, no glyph. It applies in two cases:
  - `week < currentWeek`, no `gp === 1` row, and `resolveTeamWeek` → `unknown` (a missing or
    incomplete schedule, or an unresolved team);
  - **any week in `failedWeeks`**, checked before `dnp`. A failed fetch has no rows, so without this
    rule a failed week would read `dnp` and assert "he did not play".

**`unknown` is a sixth `kind`, not a reuse of `dnp` or `bye`.**
- Do not render it as `—`, which asserts "the team played and he did not".
- Do not render it dashed, which asserts a bye he may never have had.
- Put `PROVISIONAL(no-data)` at the render site.
- With the schedule incomplete, `unknown` replaces every past non-played week. That is correct: with
  no schedule there is no bye signal. **Do not fall back to the `TEAM_*`-absence rule.** Two bye
  sources that can disagree is exactly what A3 exists to remove.

**A scored `0` is a filled cell reading 0, never an empty one.** This is the `null`-is-not-`0`
invariant in its most visible form: a player who played and scored nothing is not a player who did
not play. Test both.

**Header** shows the filled-cell count across all groups ("N of M cells filled"). **Footnote:**
nothing in this grid reaches projection, scoring or a dynasty value.

---

## §4 Offences you own — and its empty state

Teamcontext at week grain for each team the user owns a player on: PROE · PACE · OFF EPA · PLAYS/G ·
RZ TRIPS · WK {n} MARGIN.

**Which teams.** The distinct teams of W2a's filled starters and bench (taxi and IR are excluded,
matching the table), in table order (starters' teams first). Exclude a null team and the literal
`'FA'`.

**Team-code hop (CR-16).** Roster teams are the Sleeper domain (`LAR`), while teamcontext is keyed
era-accurate (`LA`) (`api/teamContext.js:25-26`). Look each team up via
`normalizeTeamForSchedule(team)`. Without it, the Rams row reads empty with no error.

**`{n}`** is the latest REG week ≤ `currentWeek − 1` for which that team has a row. It is per team,
because byes differ.

**`nflverse/teamcontext/2026.json` does not exist** (parent §1.3, verified 2026-09-20). This panel
ships empty and **must not block the page** — treat absence exactly as `loadCurrentSeasonTotals`
treats a missing manifest entry. `loadTeamContext` already returns
`{ teams: {}, year: null, complete: false, rowCount: 0 }` for store-down / disabled / absent /
below-floor. **Branch on `complete`, never on key presence** — an absent key and a resolved-but-empty
year both read as "nothing there".

**The season to load is the live season, and that is a deliberate exception.** Every existing
nflverse side-load (`teamContextByYear`, `gameLogsByYear`, `nflScheduleByYear`) keys on `dataSeason`
— the most recent season *with data* — precisely so consumers do not render "no data" in the
offseason. This surface is about the in-progress season and nothing else; `dataSeason` would show it
last year's offence. Add a **`/week`-scoped** `loadTeamContext(parseInt(nflState.season, 10))` inside
`useWeeklyDecision`, merged into the hook's own state. **Do not touch App.jsx's `teamContextByYear`
effect, do not widen `ENV_SEASONS`, and do not key anything new on `dataSeason`.** Record the
exception in the hook's header comment citing CLAUDE.md §State and data flow, or a future reader
will "fix" it back.

`loadTeamContext` enforces `MIN_TEAMCONTEXT_ROWS` three times over; the file is gated at ~60 rows
(2 weeks × 32 teams) and should land within days. Nothing here changes when it does — the panel
fills on its own. Verify that by pointing the loader at 2025 in a test.

**Empty-state copy must be true.** A `null` manifest entry means one of three things — file missing,
store disabled, or manifest fetch failed — and this loader does not distinguish them
(`sleeperStats.js` header, and `teamContext.js`'s own graceful-absence note). Do not write "isn't
available yet", which is true of only the first. `PROVISIONAL(no-data)` at the render site.

**Rate fields are single-game values — never sum or average them** (CR-10, CLAUDE.md Traps).
Aggregate the `*Sum`/`*Plays` counting components across the window, then divide. PROE's pairing is
`proeXpassSum / proePlays`, **not** `proePassPlays` — verified arithmetically in dp-v2 Slice 4c.
`rushPlays` is a counting component and is safe to sum directly.

**Reuse the exported path; write no aggregation.** `buildTeamMetricsTable(loaded)` →
`computeTeamSeasonMetrics` (`environment.js:66-91,206`) already returns `proe`, `pace`,
`epaPerPlay`, `playsPerGame` and `rzTripsPerGame`, component-aggregated. Portfolio's
`TeamOffences.jsx` renders an owned-teams table from the same call (`Portfolio.jsx:348-364`).
- Use it for five of the six columns.
- **Do not export, call or edit `sumRegOff` / `sumRegDef` / `OFF_SUM_FIELDS`.** They are private
  named CR-23 triggers; touching them would fire CR-23.
- WK {n} MARGIN is a single week, so read it from `getTeamWeekRow(loaded, eraTeam, n)`. Use the
  same points-scored / points-allowed fields `sumRegOff` / `sumRegDef` read: look them up in
  `environment.js`, don't guess. The value is null when either is absent. It is a single-game
  difference, so no rate is summed.

The design's footnote quotes pace and PROE stability as r .62 and .45. **Reproduce that as the
design's claim or not at all** — no in-repo document supports those figures (parent §0).
Time spent leading or trailing is in no field today; the week margin beside PROE is the usable
proxy, and that framing is the design's and is honest.

---

## §4b Why a PROJ cell is empty — one-line notice *(added 2026-09-22, Anton)*

W2a made PROJ render `—` whenever `points == null`. That is correct, but on its own it does not say
**why** a cell is blank. Add one muted line directly above the lineup table, below
`StoreLagNotice`, that explains it.

**Anton asked for two reasons. The truth has three.** A blank PROJ has three distinct causes, and
the copy must be true, the same rule as §4's empty state. Checked live, week 3: 411 of 3,116
QB/RB/WR/TE projection rows carry scoring stats, and the rest are ADP-only. So most weeks the real
reason for a given blank is the third one below. Showing "not published yet" then would be false.

New pure export in `src/utils/weeklyLineup.js`, beside `hasScoringProjection`:

```js
export function projectionGapReason({ rows, projections, scoringSettings, error })
// rows = W2a's rendered starters + bench (empty starter slots excluded)
// → 'scoring' | 'unpublished' | 'player' | null
```

The checks run in this order, and the first match wins:
1. **`null`** when no rendered player row has `points == null`. Nothing is blank, so no notice.
2. **`null`** when `error` is set. The existing "projections failed to load" banner (`WeekView`)
   already explains it, and two lines for one cause is noise.
3. **`'scoring'`** when `scoringSettings` has no key with a finite, non-zero weight. That is the
   same test `hasScoringProjection` applies, so extract a shared `hasUsableScoring(scoringSettings)`
   rather than writing it twice. Without scoring rules no row can score, so this outranks the rest.
   (`App.jsx` passes `selectedLeague.scoring_settings ?? {}`, so "didn't load" arrives as `{}`, not
   `null`.)
4. **`'unpublished'`** when **no row in the whole `projections` payload** passes
   `hasScoringProjection`. That means Sleeper has published nothing scoreable for this week.
   **Check the whole payload, not just the roster.** Five players with no projection among 400 who
   have one is not "not published".
5. **`'player'`** otherwise: the week is published, and Sleeper has no projection for those
   particular players.

**Copy.** `{n}` is `currentWeek`. The line is muted and not an error colour, and it names no player:

| Reason | Text |
|---|---|
| `scoring` | `PROJ is blank: this league's scoring settings didn't load.` |
| `unpublished` | `PROJ is blank: Sleeper hasn't published week {n} projections yet.` |
| `player` | `A blank PROJ means Sleeper has no week {n} projection for that player.` |

The two "yet" / "didn't" phrasings are runtime branches on observed state, like W2a's store-lag
notice. That is allowed. **No comment may predict when Sleeper publishes.**

**Wiring.**
- The hook computes `projectionGap = projectionGapReason(...)` in a memo, over the rendered rows it
  already has, and returns it. This is an additive return field, in line with this file's header.
- `WeekView` renders a new `src/components/week/ProjectionGapNotice.jsx`. It takes
  `{ reason, week }` and renders `null` when `reason` is `null`.
- The component is presentational and props-only.

**Cross-repo.** None. It reads only the live Sleeper projections payload and the league's scoring
settings, and no registry entry lists either. State that in §6's "checked" list.

---

## §5 Tests

**Discrimination requirement (as in W2a §7).** For each test marked *(mutation)*, show it red in the
hand-back under the named mutation: paste the failing line, then revert.

- `weeklySeasonGrid.test.js`:
  - Each of the six `kind`s.
  - `unknown` for a past week with no row, when the schedule is null. Assert it is neither `bye`
    nor `dnp`. *(mutation: fall back to `TEAM_*` absence → red)*
  - The carry-forward: preceding is preferred over following, and the roster team is the last resort.
  - A scored `0` is `played` with `points: 0`, not `bye` and not `dnp`.
  - A **future** bye week renders `bye` (schedule-derived).
  - A team with a schedule game but no player row in a past week → `dnp`.
  - **A player who changed teams mid-window resolves per week from `rows[playerId].team`, not
    once.** Build the fixture so the two teams have **different schedule byes**. A
    `player.team`-only implementation then puts the bye in the wrong week.
    *(mutation: resolve from `player.team` only → red)*
  - **A failed week** (in `failedWeeks`, absent from `weeklyMaps`) → `unknown`, not `dnp`.
    *(mutation: ignore `failedWeeks` → red)*
  - **A gap in `weeklyMaps`** (week 2 failed): week 3's team is still read from week 3's own entry.
    *(mutation: index `weeklyMaps[w]` → red)*
  - The grid and W2a's lineup agree: for `currentWeek`, a player whose W2a row has `bye: true` has
    a `bye` cell. Both call `resolveTeamWeek`, and this test pins it.
- `SeasonGrid` render:
  - Three groups, in order, with dividers.
  - Taxi absent; an IR player present in the IR group.
  - An empty group omits its divider.
  - `unknown` renders with no glyph (neither `—` nor dashed).
- `DefencesFaced`:
  - Both halves present.
  - Current half absent → `—`; prior absent → `—`; neither → the row still renders.
  - An **`LAR` opponent** reads the Sleeper-keyed DEF row via `opponent`, and the era-keyed
    `fpaTable` via `opponentEra`. *(mutation: pass `opponentEra` to `computeFpaPerGame` → the
    Rams halves go `—`)*
  - An empty starter slot gets no row.
  - A defence with ≥ 9 current games shows its prior cell muted, labelled `not blended`.
  - Each row shows its own weight; the header has no single percentage.
- Prior-season sub-line (§1a):
  - A bench row gets its sub-line.
  - Only SNAP has a grey value. RUSH, TARGET and TOUCH render nothing beneath (no dash).
  - An absent `off_snp` beside a present `tm_off_snp` gives `0%`, not blank (W1's rule).
    *(mutation: `off_snp == null → null` → red)*
  - `gamesPlayed` 0, or an absent `tm_off_snp` → nothing renders.
  - The year is `deriveDataSeason(careerStats)`: build a fixture where `season − 1` differs.
    *(mutation: `season − 1` → red)*
- `OffencesOwned`:
  - A `LAR`-rostered player's team reads the `LA` teamcontext row.
    *(mutation: drop `normalizeTeamForSchedule` → red)*
  - Taxi, IR and `'FA'` teams are not listed.
  - `complete: false` renders the empty state and throws nothing.
  - `complete: true` against a 2025 fixture renders real values.
  - An aggregation test that fails if a stored rate is summed. Build the fixture so the summed and
    the component-derived answers differ.
- `projectionGapReason` (`weeklyLineup.test.js`), one case per branch:
  - no blank row → `null`;
  - `error` set → `null`;
  - `scoringSettings: {}` → `'scoring'`, even when the payload has scoring rows;
  - a payload with only ADP-only rows → `'unpublished'`;
  - a payload with one scoring row elsewhere and a blank roster player → `'player'`.
    *(mutation: check only the roster's rows for step 4 → it reads `'unpublished'` → red)*
  - a scoring-weight-`0`-only settings object → `'scoring'`.
    *(mutation: test key presence, not weight → red)*
- `ProjectionGapNotice.test.jsx`: each reason's exact text includes `week 3` where it applies;
  `null` renders nothing.
- Extend `src/__tests__/weeklyDecisionViewOnly.test.js` with `weeklySeasonGrid` and the four new
  components.
- `src/__tests__/teamContextViewOnly.test.js` must stay green. The new loader call is view-only and
  must not appear in any pipeline module.

---

## §6 Cross-repo impact

The pre-revision draft named CR-10 only. Re-checked **by enumerated call site** (the basis W1 fix
pass 1.9 established), this slice triggers **six** entries (CR-10, CR-20, CR-21, CR-11, CR-16, CR-18).

No data-repo file, schema, floor, cadence or manifest family changes. The obligation is emission.
**Do not edit `docs/cross-repo-registry.md`** (mirrored region, CR-24). Every registry correction
below goes to `.claude/tasks/data-repo-backlog.md` with the commit SHA, marked non-blocking, for
the two-session route.

**CR-10 · nflverse teamcontext (view-only): triggered** by §4. It adds a new `loadTeamContext`
call site **and** a new reader of the served `off.*`/`def.*` game-row shape. That is precisely
what CR-10's Triggers enumerate for every prior consumer (dp-v2 slices 4c, 5b, 5c, 6a, 6b).

> **Mirror:** Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

Reading an existing family at a new season is not itself a contract *change*, and
`MIN_TEAMCONTEXT_ROWS` is used as-is. Lowering that floor **would** be a two-repo change
(CR-09/CR-10), and it is out of scope for v1.

**CR-20 · `fan_pts_allow_*` DEF-row key preservation: triggered** by §2. §2 adds a new
`computeFpaPerGame` call site. `computeFpaPerGame`'s `fan_pts_allow_${pos}` read is a named
Trigger. *(The pre-revision draft missed this. It is the same under-call W1 made.)*

> **Mirror:** Do not remove, rename or filter `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/(total), and do not widen `prunePlayerStats`'s denylist (or replace it with an allowlist) without an explicit DEF-row exemption alongside the existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA QB/RB/WR/TE columns degrade silently to `—` across all 32 teams** if either the keys or the rows vanish — no error, no test failure, indistinguishable from the API-only-mode degraded state already shown for an unrelated reason (§6 of the task file). This is the exact silent-degradation shape CR-11/12/13/19 exist to record, for a *row*, not merely a key.

**CR-21 · In-progress season-totals reads: triggered** by §2. §2 passes
`currentSeasonTotals.players` straight into `computeFpaPerGame` as the current-season half: a
second in-progress read beside `buildFpaTable`'s `currentRows`. *(The pre-revision draft said
"CR-21 is not triggered here — W1 owns the in-progress reads". That was true only while W2 made no
such read of its own.)*

> **Mirror:** If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will render a half-season's rates as though they were a season's, with no error and no test failure. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

**CR-11 · Snap & red-zone usage stat keys: triggered** by §1a. `priorSeasonSnapShare` reads
`off_snp` / `tm_off_snp` off stored prior-season rows. That makes it a new app-side reader of the
keys this entry protects, the same basis on which the entry lists `outlookUsage.js:62-63`.

> **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

**CR-16 · Era-accurate team-code remap: triggered.** A new call site of `normalizeTeamForSchedule` in
§4 (roster team → teamcontext key). This is the same basis on which W2a counts it (W2a §9).

> **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

**CR-18 · Signal registry rows: triggered.** This slice edits three Current-use cells in
`docs/signal-registry.md`, in the same change:
- the teamcontext row (`:60`) — the `/week` panel, at the **live** season;
- the `fan_pts_allow_*` row (`:54`) — the unmixed halves;
- the `off_snp`/`tm_off_snp` rows (`:47-48`) — the grey SNAP sub-line.

All three edits obey the docs-availability rule.

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Checked, not triggered:**
- **CR-08** (schedule). §3 calls W2a's `resolveTeamWeek`, and adds no schedule reader of its own. W2a
  registers `weeklySchedule.js` as the reader. CR-08 lists readers, not their callers: Portfolio's
  `buildSosTable` call is not listed there either.
- **CR-02**: after the confirmation round, §1a reads no `TEAM_*` rows and no per-season `team`, so no
  CR-02 reader is added.
- **§4b** (the PROJ notice) reads only the live Sleeper projections payload and the league's
  scoring settings. No entry lists either.
- **CR-23** (team-season pack): not triggered, **on condition** that §4's rule holds.
  `sumRegOff` / `sumRegDef` / `OFF_SUM_FIELDS` are neither exported, nor called directly, nor
  edited. `buildTeamMetricsTable` reaches them internally, as Portfolio's existing call does. If
  Session 2 finds it must touch them, stop and ask: that edit fires CR-23.
- **CR-14**: the grid calls `calculateFantasyPoints`, and its definition is untouched.

If `teamcontext/2026.json` has still not landed when this slice is verified, that is a
**data-repo backlog item, not a blocker**. Append it with the commit SHA, marked non-blocking.

---

## §7 Done-definition

Standard (CLAUDE.md), plus the following.

**Red demonstrations** for every *(mutation)* test in §5.

**Smoke `/week`:**
- All five panels render stacked.
- The page does not blank when panel 4 is empty. Panel 4 shows its empty state rather than an error
  or a zero row. Report what panel 4 said.
- If `teamcontext/2026.json` has landed by then, report the opposite: real PROE/pace values for a
  named team, confirmed as component-aggregated rather than averaged.
- The season grid at week 2:
  - Three groups (starters / bench / IR); taxi absent.
  - The IR group is omitted if the roster has no IR players. The user's roster had 0 on 2026-09-21.
  - Week 2 is outlined.
  - **Future byes dashed** in weeks 5–14, where the schedule has byes.
  - Report the filled-cell count the header shows, and check it against the grid by eye.
- Defences-you-face lists exactly the filled starters, in set-lineup order.
- **The PROJ notice (§4b).** Report which reason showed and which players were blank. Against the
  live week, expect `player`, since Sleeper publishes scoring rows for about 400 players and not the
  rest.

**Backlog appends** (with SHA, non-blocking):
- the App-side/Triggers text for CR-10, CR-20, CR-21, CR-11 and CR-16;
- the registry-staleness items the plan gate found:
  - CR-02 `sleeperStats.js` anchors (`:146/147/152/112` → `:209/210/215/175`);
  - CR-02's unlisted callers (`Market.jsx:454,458`, `UsageEfficiencySection.jsx:24,28`,
    `App.jsx:230,243`);
  - CR-10 anchors (`App.jsx:1009/637` → `:1010/638`);
  - CR-10's unlisted Portfolio consumer (`Portfolio.jsx:348-350` → `TeamOffences.jsx`);
  - CR-20's `Teams.jsx:151,157` → `:161,167`.

`grep -rn "PROVISIONAL(" src/` output in the hand-back.

---

## Review record — plan gate, 2026-09-21 (revision round)

The plan-reviewer ran once on the revised file. Session 1 verified each flag against live source
before applying it.

| Flag | Verdict | Applied where |
|---|---|---|
| §1a: "reuse `buildPerSeasonTeamShares`" and "use W1's denominator" cannot both hold | **Accepted.** Verified at `outlookPositionStats.js:79-101` vs `weeklyUsage.js:98-115`. | §1a now runs W1's `computeUsageShares` on stored inputs. |
| §1a: stored `TEAM_*` rows exist; `computeHistoricalTeamTotals` has no `passAtt` | **Accepted.** Verified live: 2025 store, 32 `TEAM_*` rows, Sleeper-keyed (`TEAM_LAR`). | §1a (with a `denormalizeTeamForSchedule` key hop) |
| §3: `weeklyMaps[w]` is an array with gaps; `team` can be null | **Accepted.** | §3 step 1 |
| §3: a failed week reads `dnp` | **Accepted.** | `failedWeeks` input → `unknown` |
| Hook return lacks `projections` / `fpaTable` / `scheduleIndex` | **Accepted.** | Header: additive return widening. `scheduleIndex` is returned by W2a, and the single `buildRegWeekIndex` call site is kept. |
| §2: the prior column is not a half of the blend past 9 games; the header percentage is per row | **Accepted.** | §2: per-row weight, `not blended` label |
| §4: missing domain hop; team scope; `{n}` | **Accepted.** | §4 |
| §4: `sumRegOff` / `sumRegDef` are private CR-23 triggers; the exported path exists | **Accepted.** Verified at `environment.js:28,41,66,206`. | §4 reuses `buildTeamMetricsTable`; CR-23 is conditional-not-triggered. |
| The grid/table "never disagree" claim is overstated for the current week | **Accepted.** | §3: `week >= currentWeek` uses the roster team |
| `weeklyUsage.js` exports no resolver | **Accepted.** | §3 |
| CR-18 is missing the `:50-52` rows | **Accepted.** | §6 |
| Registry staleness (CR-02, CR-10, CR-20) | **Recorded.** | §7 backlog appends |

The gate also confirmed that §2's Sleeper-domain `opponent` → `computeFpaPerGame` is correct. After
the §1a change, CR-16 is additionally triggered (§6).

### Confirmation round (same day)

| Flag | Verdict | Applied |
|---|---|---|
| §1a's `TEAM_*` season denominator is not W1's played-weeks basis | **Accepted.** Verified at `weeklyUsage.js:64,72-73`. | §1a is SNAP only; RUSH/TARGET/TOUCH omitted per "omit rather than approximate"; CR-02 is dropped. |
| `snapObservations` never set | **Moot.** | `computeUsageShares` is no longer used for the sub-line. |
| Neither file says where prior usage or teamcontext lives | **Accepted.** | Hook returns `priorSnapByPlayer` and `liveTeamContext`; optional `LineupTable` prop. |
| §2 re-derives row maps | **Accepted.** | §2 uses the hook's returned values. |
