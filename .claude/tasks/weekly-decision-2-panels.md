# W2 — /week: defences faced, offences owned, the season grid

Parent: `.claude/tasks/weekly-decision-surface.md`. Depends on **W1**. Adds artboard 9a's remaining
three panels to `WeekView`. Additive only — nothing in W0 or W1 changes shape.

---

## §1 Scope

| Panel | Source | New module |
|---|---|---|
| Defences you face | the W1 `fpaTable`, unmixed | `DefencesFaced.jsx` |
| Offences you own | `loadTeamContext(liveSeason)`, week grain | `OffencesOwned.jsx` |
| The season, week by week | the W1 weekly maps | `SeasonGrid.jsx` + `src/utils/weeklySeasonGrid.js` |

---

## §2 Defences you face

The blend from W1 shown unmixed: one row per lineup player, columns DEF · VS · `{prior} PTS/G` ·
`{season} SO FAR` · BLENDED · RANK. Header right: `k 3 · {pct} THIS SEASON`.

`buildFpaTable` returns only the blended value and `weights[pos]` — **the two source halves do not
escape it.** Do not add them to its return shape; that widens a signature two shipped surfaces
depend on, for one panel's benefit. Instead call the already-exported
`computeFpaPerGame(rows, team, pos)` twice in this panel's own memo — which is exactly what it is
exported for — **against the same two row maps W1 §5.3 resolves, by the same rules**:

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
era-accurate: resolve the opponent once and keep both forms, do not convert twice.

Empty halves are normal and must render `—`, never `0`: no current-season file yet (preseason), a
defence with `gamesPlayed === 0` (its week-1 bye), or no prior season in `careerStats`.

Footnote, from the design: the two source columns sit beside the blend rather than behind a tooltip
— a current-season column far from its prior neighbour is a defence that has changed, or one that
has played one game. Keep the half-PPR-basis disclosure; it applies to every number in this panel.

---

## §3 The season grid

One row per **rostered** player (not just starters — the design's grid is the whole roster's 18
weeks), 18 columns.

`src/utils/weeklySeasonGrid.js`, new, pure:

```js
export function buildSeasonGrid({ myPlayers, weeklyMaps, projections, scoringSettings, currentWeek })
// → [{ id, name, cells: [{ week, kind, points }] }]
// kind: 'played' | 'projected' | 'bye' | 'dnp' | 'future' | 'unknown'
```

- `played` (week < currentWeek, player has a `gp === 1` row) → `calculateFantasyPoints` on that
  week's raw stats in league settings. Filled cell, intensity by value.
- `projected` (week === currentWeek) → the W1 projection. Outlined cell.
- `bye` → the player's team **for that week** has no `TEAM_<abbr>` row in that week's payload.
  Reuse `buildTeamAggregates` from W1 §3 rather than a schedule join — the absence *is* the signal,
  it costs no extra fetch, and it stays correct when a team's abbr changes. Dashed cell, no number.
  **Resolve the team from that week's own row** (`rows[playerId].team`, available because W1 §1
  fetches every week through `getWeeklyStatRows`), never from `playerMap[id].team` — otherwise a
  traded player's grid shows his *new* team's byes across weeks he played for his old one. Same
  field as W1 §3's `accumulateUsage`; if that module exports the resolver, use it.

  **The fallback, which W1 §3 does not need and this panel does.** `accumulateUsage` walks played
  weeks only, so a row always exists. This grid spans all 18 weeks of every rostered player —
  pre-debut, post-IR, released-and-resigned, never-dressed — and **a week where the player has no
  row at all carries no team**, so the bye test cannot run. The rule, and it must be stated in code
  rather than left to Session 2:

  1. That week's own row, if present.
  2. Otherwise the nearest **preceding** week in the window that has one.
  3. Otherwise the nearest **following** week that has one.
  4. Otherwise — no row anywhere in the window — the team is unresolved: `kind: 'unknown'`.

  Carry-forward is an inference, not an observation: a player absent across a trade gets the wrong
  team for the absent weeks, and therefore possibly the wrong bye. Say so in the module header and
  keep the inference to the bye/DNP distinction — it never touches a points value, because a week
  with no row has no points either.

  **`unknown` is a sixth `kind`, not a reuse of `dnp` or `bye`.** Render it as a neutral empty cell
  with no glyph — *not* `—` (which asserts "team played, he did not") and *not* dashed (which
  asserts a bye he may never have had). A player with no rows all season, which is the common way
  to hit it, must not be shown eighteen fabricated byes. `PROVISIONAL(no-data)` at the render site.
- `dnp` (team played, player did not) → `—`, distinct from a bye and from a zero.
- `future` (week > currentWeek) → empty outlined cell.

**A scored `0` is a filled cell reading 0, never an empty one.** This is the `null`-is-not-`0`
invariant in its most visible form: a player who played and scored nothing is not a player who did
not play. Test both.

Header shows the filled-cell count ("10 of 180 cells filled" at week 2). Footnote: nothing in this
grid reaches projection, scoring or a dynasty value.

---

## §4 Offences you own — and its empty state

Teamcontext at week grain for each team the user owns a player on: PROE · PACE · OFF EPA · PLAYS/G ·
RZ TRIPS · WK {n} MARGIN.

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
`rushPlays` is a counting component and is safe to sum directly. Check `src/utils/environment.js`
before writing any aggregation: if `sumRegOff`/`sumRegDef` already do this, reuse them.

The design's footnote quotes pace and PROE stability as r .62 and .45. **Reproduce that as the
design's claim or not at all** — no in-repo document supports those figures (parent §0).
Time spent leading or trailing is in no field today; the week margin beside PROE is the usable
proxy, and that framing is the design's and is honest.

---

## §5 Tests

- `weeklySeasonGrid.test.js` — each of the six `kind`s, including `unknown` for a player with no
  row anywhere in the window (assert it is neither `bye` nor `dnp`) and the three-step carry-forward
  (preceding preferred over following); a scored `0` is `played` with `points: 0`,
  not `bye` and not `dnp`; bye detection from an absent `TEAM_*` row; **a player who changed teams
  mid-window resolves per week from `rows[playerId].team`, not once** — the same rule and field
  W1 §3's `accumulateUsage` follows, and for the same reason: a fixed team makes a traded player's
  bye weeks those of the wrong franchise. Build the fixture so a `playerMap`-fallback
  implementation gives a visibly different answer.
- `DefencesFaced` — both halves present; current half absent → `—`; prior absent → `—`; neither → the
  row still renders.
- `OffencesOwned` — `complete: false` renders the empty state and throws nothing; `complete: true`
  against a 2025 fixture renders real values; an aggregation test that fails if a stored rate is
  summed (build the fixture so the summed and component-derived answers differ).
- Extend `src/__tests__/weeklyDecisionViewOnly.test.js` (W1 §8) with `weeklySeasonGrid` and the three
  new components.
- `src/__tests__/teamContextViewOnly.test.js` must stay green — the new loader call is view-only and
  must not appear in any pipeline module.

---

## §6 Cross-repo impact

**CR-10 · nflverse teamcontext (view-only) is triggered by this slice.** An earlier draft claimed no
contract was touched; the plan gate corrected it (2026-09-21). The slice adds a new `loadTeamContext`
call site **and** a new reader of the served `off.*`/`def.*` game-row shape — which is precisely what
CR-10's Triggers enumerate for every prior consumer (dp-v2 slices 4c, 5b, 5c, 6a, 6b), each of which
was listed on exactly this basis. No data-repo file, schema, floor, cadence or manifest family
changes; the obligation is emission.

> **Mirror:** Shape or floor changes land in both repos together. **First TEAM-keyed family** — row
> identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers.
> Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or
> average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly
> across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

Reading an existing family at a new season is not itself a contract *change*, and
`MIN_TEAMCONTEXT_ROWS` is used as-is — lowering that floor **would** be a two-repo change
(CR-09/CR-10) and is explicitly out of scope for v1. But the new call site belongs in CR-10's app
side, and **this slice must not add it**: mirrored region, CR-24 byte-identity, see W0 §6. Append
the proposed text to `.claude/tasks/data-repo-backlog.md` with the commit SHA, non-blocking, for the
two-session route.

CR-21 is not triggered here — W1 owns the in-progress season-totals reads and emitted that Mirror.

If `teamcontext/2026.json` has still not landed when this slice is verified, that is a **data-repo
backlog item, not a blocker** — append it to `.claude/tasks/data-repo-backlog.md` with the commit
SHA and mark it non-blocking, per done-definition item 7.

---

## §7 Done-definition

Standard (CLAUDE.md), plus:
- Smoke `/week`: all five panels render stacked, the page does not blank when panel 4 is empty, and
  panel 4 shows its empty state rather than an error or a zero row. Report what panel 4 said.
- If `teamcontext/2026.json` has landed by then, report the opposite: real PROE/pace values for a
  named team, and confirm they were component-aggregated rather than averaged.
- Season grid at week 2: 10-ish filled cells against 18 columns per row, week 2 outlined, byes
  dashed. Report the filled-cell count the header shows and check it against the grid by eye.
- `grep -rn "PROVISIONAL(" src/` output in the hand-back.
