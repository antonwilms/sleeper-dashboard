# Slice 4a — Pop-up: Game log + Distribution

**Program:** [dp-v2.md](dp-v2.md). Follows [dp-v2-3-popup-container.md](dp-v2-3-popup-container.md)
(landed `890cb98`) and the reporting fix at `d3b6467`.
**Model:** sonnet. Fully specified below.
**Baseline:** app `d3b6467` · data `f0c1fc4`.

**Design source is not in this repo** — Claude Design project only (see
[dp-v2-1-systems.md](dp-v2-1-systems.md) §0). Every dimension and rule needed is restated here.

---

## 0. Slice 4 is split — this is the first half

dp-v2 §4 flagged Slice 4 as the largest and highest-risk in the program (five sections, two data
families, one new container) and **pre-registered the seam**: player-scoped sections before
team-joined ones. Taking it, because the two halves have almost no overlap:

| | Sections | Data |
|---|---|---|
| **4a — this file** | Game log, Distribution | `gameLogsByYear`, `nflScheduleByYear`, `careerStats.weeklyPoints` |
| **4b — next** | Usage & efficiency, Environment, Availability & role | season-totals shares, `teamContextByYear` (team join), `durabilitySignals`, depth chart |

4b also carries a **known data gap**: the design's *Weekly status strip* reads Sleeper players-state
snapshots, and **the app has no loader for that family at all** (`grep -rn playersState src` → nothing;
the data repo captures it as capture-only). It either needs Slice-2-style loader wiring first or a
`DegradedBlock`. Recorded here so 4b's planning starts from that fact rather than discovering it.

---

## 1. Confirmed against live source (`d3b6467`)

| Fact | Site |
|---|---|
| `SECTIONS` is a module-level const of `{id,label}`; section wrappers read it, the index reads a decorated memo | `dp/PlayerDetailModal.jsx:12-16` |
| Body is a non-scrolling row: `SectionIndex` + a `flex-1 min-w-0 overflow-y-auto min-h-0` scroll column | `PlayerDetailModal.jsx:263,266` |
| Three sections exist today: `overview`, `drivers`, `why-next` | `PlayerDetailModal.jsx:12-16` |
| The pop-up reads everything through `useProfileData()` — **never** `usePlayerProfile`, which is bound to one `playerId` | `dp/PlayerDetailTabs.jsx`, CLAUDE.md |
| Context carries `gameLogsByYear`, `nflScheduleByYear`, `teamContextByYear` (Slice 2), year-keyed, `{}` initial | `App.jsx:153-155,578` |
| **Loader results gate on `complete`, not key presence** | each loader's header; dp-v2 Slice 2 §3.3 |
| `resolvePlayerTeam({careerStats, gameLogPlayers}, playerId, season, week?)` — week grain reads gamelogs and **era-remaps** | `utils/playerTeam.js:53-65` |
| Slice 1 primitives available: `SeriesBars`, `TrendCell`, `CoveragePips`, `DegradedBlock`, `DefinitionPopover`, `coverageBand` | `src/components/dp/`, `src/utils/coverageBand.js` |
| `computeConsistency(careerStats, playerId)` pools the last **3** qualifying seasons (`gp >= 8`), `MIN_POOLED_GAMES = 10` | `utils/outlookConsistency.js:3-6` |

**Data shapes** (verified in `sleeper-dashboard-data` @ `f0c1fc4`):
- `gamelogs.players[sid].games[]` — `week`, `seasonType`, `team`, `opponent`, and per-position
  counting/rate fields incl. `attempts`, `completions`, `passingYards`, `passingTds`,
  `passingInterceptions`, `passingEpa`, `passingCpoe`, `carries`, `rushingYards`, `rushingTds`,
  `rushingEpa`, `targets`, `receptions`, `receivingYards`, `receivingTds`, `receivingAirYards`,
  `receivingEpa`. **Bye weeks are absent rows, not zero rows.**
- `schedule.games[]` — `gameId`, `week`, `gameType`, `homeTeam`, `awayTeam`, `homeScore`,
  `awayScore`, `result`, `spreadLine`, `totalLine`, `roof`, `surface`, `temp`, `wind`.
  **`temp`/`wind` are honestly `null` indoors.**

---

## 2. Scope

Two new sections appended to `SECTIONS`, in design order, **after `overview`**:

```js
{ id: 'game-log',     label: 'Game log' },
{ id: 'distribution', label: 'Distribution' },
```

Final order this slice: Overview → Game log → Distribution → Score drivers → Why next season.
(The design's full order puts Score drivers and Why-next last; 4b's three sections slot between
Distribution and Score drivers, reaching the final order without another reshuffle.)

### 2.1 Must NOT do
- **No season selector.** Show the most recent season with data. Market's Production set has a
  selector; the pop-up does not need one, and adding it is scope the design does not specify.
- **Do not split Comps out of Why-next.** Still 4b-or-later.
- **Do not add a players-state loader.** That is 4b's problem to scope (§0).
- **No new data families.** Everything here is already in context from Slice 2.
- **Do not touch `SectionIndex`, the scroll column, or the 1180px rule.** Slice 3 proved them; this
  slice only adds sections to them.

---

## 3. Game log

One row per game the player's team played in `dataSeason`, in week order, `seasonType` REG then POST.

### 3.1 Two blocks, hairline-separated
**Context block** (identical for every position, from `schedule`): `WK · OPP · RESULT · SPREAD ·
TOTAL · ROOF · WEATHER`.
**Production block** (per position, from `gamelogs`): see §3.3.
Then `PTS`, right-aligned, at the end.

There is **no `SNAP%` column**. The design removed it in round 5 because gamelogs carry no snap field
at any grain — snaps are season-grain only. Do not reintroduce it.

### 3.2 `PTS` comes from `weeklyPoints`, not from gamelogs
`gamelogs.games[].fantasyPoints` / `fantasyPointsPpr` are **nflverse scoring**. This app scores under
the league's own `scoringSettings`, and `careerStats[season][playerId].weeklyPoints[week-1]` is that
number. Rendering nflverse PPR here would put a number on screen that disagrees with the PPG, the
projection and the career chart **in the same pop-up**.

Use `weeklyPoints`. Confirm the indexing convention against a known row before trusting it (it is a
per-week array; verify whether index 0 is week 1 for the seasons in play, and say what you found in
the hand-back). If `weeklyPoints` is absent for the season, render `PTS` as `—` rather than falling
back to the nflverse figure.

### 3.3 Per-position production columns — a deviation from the drawn mock, with precedent
The design draws **one** production block, receiver-shaped (`TGT · REC · YDS · TD · aDOT · EPA/TGT`),
because its mock player is a WR. For a QB every one of those is empty; for an RB most are.

This is the same defect the round-5 review caught in Market's Efficiency set (F4) and fixed by making
it per-position. **Do the same here.** All fields below are present in the gamelogs shape:

| Position | Production columns |
|---|---|
| QB | `CMP/ATT` · `YDS` · `TD` · `INT` · `EPA/ATT` (`passingEpa ÷ attempts`) |
| RB | `CAR` · `YDS` · `TD` · `TGT` · `REC` · `EPA/CAR` (`rushingEpa ÷ carries`) |
| WR / TE | as drawn — `TGT` · `REC` · `YDS` · `TD` · `aDOT` (`receivingAirYards ÷ targets`) · `EPA/TGT` (`receivingEpa ÷ targets`) |

**Recompute every rate per game from its components.** Never read a stored rate and never average a
rate across games. A zero denominator renders `—`, not `0` — that is the design's `UNDEFINED HERE`
case (no targets in a game means EPA-per-target has no value), and it is exactly the distinction
Slice 1's void slots exist to preserve.

### 3.4 Bye weeks vs did-not-play — the derivation that needs the schedule
A missing gamelogs row means one of two different things, and the design is explicit that they must
not look alike:
- **Bye** — the player's team had no game that week. Render the design's labelled full-width row:
  `BYE — no row exists in the source. Not a zero.` (mono, muted, spanning all columns).
- **Did not play** — the team played, the player has no row. Render the context block for that game
  and `—` across the production block.

Distinguishing them is **why `nflScheduleByYear` was wired in Slice 2**. Resolve the player's team for
the season, then for each week check whether the schedule has a game with that team on either side.

**The join crosses an era boundary.** `schedule` teams are in the **era-accurate** domain;
`gamelogs.games[].team` is **current-franchise**. `resolvePlayerTeam(..., season, week)` already
returns era-accurate codes — use it, and do not add a second remap. For `dataSeason` the two domains
coincide, so a test that only covers the current season proves nothing about the join; cover a
historical season too (see §5).

### 3.5 Weather and roof
`roof` renders verbatim. `temp`/`wind` render `—` when null — which is the honest state indoors, **not
a zero**. Do not coalesce to `0`, and do not hide the column for dome games; the `—` is the
information.

### 3.6 Degraded states
- No gamelogs entry for `dataSeason`, or `complete === false` → `DegradedBlock`. Pick the kind by
  cause: a season the family does not cover is `NOT MEASURED THEN`; a season not yet played is
  `NOT YET — ACCRUING`.
- Player has no `games[]` in an otherwise-complete season (rookie who never dressed, or a player
  absent from the family) → `NOT YET — ACCRUING` for a rookie, otherwise the generic no-rows state.
- **The section still renders with its heading and its degraded block.** Never hide it — an empty
  section is the one place that can say *why* the thing you wanted is not there.

---

## 4. Distribution

A histogram of per-game fantasy points, **pooled over the same three qualifying seasons
`computeConsistency` uses** — not one season.

This was a round-5 review finding: the design's tile shows a 3-season pooled `±SD` while its histogram
was labelled with one season's game count, so the two could not both be right. The fix chosen was to
pool the histogram. **Match `computeConsistency`'s window exactly** — reuse its output rather than
re-deriving the season set, so the tile's `±SD` and this section's SD are provably the same number.

- **Buckets:** 5-point, `0–5 … 30–35`, then `35+`. An empty bucket renders as a void slot — a dashed
  rule at the axis, no fill — reusing Slice 1's convention. **Not a zero-height filled bar.**
- **Shape block** beside it: pooled mean, population SD, coefficient of variation, games over 20,
  games under 10 — each `X of N` where `N` is the pooled game count, so every figure reconciles
  against the same denominator.
- **±1 SD marked** on the plot as a dashed pair.
- Coverage: pips + span from the pooled season count, via `coverageBand`.
- `computeConsistency` returns `null` (no qualifying seasons) or an object with a null `sd` (pooled
  games < `MIN_POOLED_GAMES`). **Both are real and both need a degraded state** — the second is the
  subtler one: seasons exist, the distribution is drawable, but no SD is defensible. Draw the
  histogram and render the SD row as `—`; do not suppress the whole section.

**Do not draw a band around the projection anywhere.** The visible spread is *historical* per-game
variance and lives here; the projection is a point estimate with no interval. This is a standing rule
from the round-4 spec.

---

## 5. Tests

- **Game log, per position** — QB/RB/WR each render their own production columns; a WR row does not
  render `CMP/ATT`.
- **Rate recomputation** — `aDOT`/`EPA per opportunity` computed from components; a zero denominator
  renders `—`, not `0`.
- **Bye vs DNP** — a week the team had no game renders the labelled bye row; a week the team played
  but the player has no row renders context + `—`. **This is the assertion that proves the schedule
  join works**, so make it explicit.
- **Era join** — one case in a historical season where the gamelogs code and the schedule code differ
  (`LV`/`OAK` ≤2019, `LAC`/`SD` ≤2016, `LA`/`STL` ≤2015). A `dataSeason`-only test passes for the
  wrong reason (§3.4).
- **Weather** — `temp: null` renders `—`; assert it is not `0`.
- **`PTS`** — sourced from `weeklyPoints`; absent `weeklyPoints` renders `—` and does **not** fall
  back to `fantasyPointsPpr`.
- **Distribution** — buckets sum to the pooled game count; `over 20` + `under 10` counts reconcile
  against it; an empty bucket renders a void slot; the section's SD equals the Overview tile's.
- **Degraded** — incomplete loader result renders a `DegradedBlock`, and the section still renders
  its heading.
- Existing modal and tabs tests must pass **unedited**; both files already carry the jsdom stubs from
  Slice 3.

---

## 6. Smoke (`CLAUDE.md` done-definition step 6)

Recipe in `CLAUDE.md` → Workflow convention. Check:
- a **WR** (receiver columns), a **QB** (`CMP/ATT`, `EPA/ATT`), and an **RB** — each gets its own
  production block, none renders a column of dashes;
- a **dome game** shows `—` for weather, not `0`;
- a **bye week** shows the labelled row, and it reads differently from any did-not-play week;
- the Distribution histogram's game count matches its shape block, and its SD matches the Overview
  tile's `±SD`;
- **Fernando Mendoza** (no NFL games) renders both sections with headings and degraded blocks, not
  blank space;
- the section index now lists five entries and still scrolls rather than swaps;
- no console errors.

---

## 7. Docs

| File | Edit |
|---|---|
| `docs/ui.md` → *Player detail pop-up* | The two new sections, the per-position game-log columns, the bye-vs-DNP rule, and that `PTS` is league-scored rather than nflverse |
| `CLAUDE.md` `src/components/` table | `PlayerDetailModal.jsx` row — now renders five sections and consumes `gameLogsByYear` / `nflScheduleByYear` |
| `docs/signal-registry.md` | **Check**: this is the first *rendered* consumer of gamelogs and schedule. Slice 2 already reclassified them to view-only-reachable; if the wording distinguishes "reachable" from "rendered", update it — and note that `signal-registry.md` is **CR-18**'s app-side trigger, so a Current-use edit means emitting the `Mirror` text |

---

## 8. Cross-repo impact

**None expected** — both families are already served and this slice only renders them. But §7's
`signal-registry.md` check is genuinely open: if a Current-use cell changes wording, **CR-18
triggers** and the `Mirror` text must be emitted. Resolve it in planning, not at implementation time.

---

## 9. Done-definition

- [ ] Two sections added to `SECTIONS`; index shows five entries; scroll/index behaviour unchanged
- [ ] Game-log production columns are **per position**; no column of dashes on any position
- [ ] Every rate recomputed from components; zero denominator → `—`
- [ ] Bye row vs did-not-play row are visibly different, and the distinction is schedule-derived
- [ ] Era-boundary join covered by a test in a historical season
- [ ] `temp`/`wind` null → `—`, never `0`
- [ ] `PTS` from `weeklyPoints`; no nflverse fallback
- [ ] Distribution pooled over `computeConsistency`'s window; SD matches the Overview tile
- [ ] Empty buckets render void slots, not zero-height bars
- [ ] Both degraded paths handled (`null` consistency, and non-null with null `sd`)
- [ ] Sections render their headings even when fully degraded
- [ ] Existing tests pass unedited
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect Slice ii's three unless a genuinely unbacked value ships
- [ ] Smoked per §6, with what you saw reported

---

## 10. Hand-back should report

- The `weeklyPoints` indexing convention you confirmed (§3.2).
- Which positions you checked in the smoke and what each production block showed.
- The era-boundary case your join test uses.
- Whether the Distribution SD matched the Overview tile's on a real player.
- The `signal-registry.md` / CR-18 determination (§7).
- Anything in §1 that had drifted from `d3b6467`.
