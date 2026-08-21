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
| **`PlayerDetailModal.jsx` DOES call `usePlayerProfile(playerId)`** and destructures 13 fields (`:2,54`). The never-`usePlayerProfile` rule belongs to **`PlayerDetailTabs.jsx`**, the multi-tab shell, which cannot call a single-`playerId` hook once per open tab. The body is per-player and may use it | `PlayerDetailModal.jsx:54` |
| **`usePlayerProfile` already returns `mostRecentSeason`**, derived byte-identically to `App.jsx`'s `dataSeason` — use it rather than re-deriving | `hooks/usePlayerProfile.js:30-34` vs `App.jsx:899` |
| **`weeklyPoints` is an OBJECT keyed by 1-based week** (`weeklyPoints[week]`), league-scored via `calculateFantasyPoints(stats, scoringSettings)`. Only weeks with `stats.gp === 1` get a key — byes and DNPs occupy **no slot** | `api/sleeperStats.js:199` |
| **`weeklyPoints` is REGULAR SEASON ONLY** — the loader fetches `?season_type=regular` for `week 1..18` | `api/sleeperStats.js:165,170` |
| **`weeklyStatus` is the 18-slot array, indexed `week - 1`**, carrying `'P'` played / `'B'` bye / `'D'` did-not-play — the bye/DNP call is **already made at load time** from `teamsPlaying` | `api/sleeperStats.js:200,206,209` |
| `schedule.games[].result` is the **home margin**; `0` is a tie and it is `null` for every unplayed game | `api/nflSchedule.js:20-23` |
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
  **Note for review:** `src/api/nflGameLogs.js` is a pass-through loader — it names only `week`,
  `seasonType`, `team` and `opponent`, so these field names have **no app-side corroboration** and
  cannot be grepped in `src/`. They were verified directly against `nflverse/gamelogs/2025.json` in
  the data repo. Confirm one row at runtime before building the column maps.
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

**`SECTIONS` does not control visual order.** It drives the index and the scroll-spy's
`[...SECTIONS].reverse().find(...)`; the rendered order is the literal JSX order in the scroll
column. **Both must be edited and both must agree** — insert the const entries *and* the JSX blocks
between `overview` and `drivers`. If they disagree, the index highlights the wrong entry while
scrolling and nothing errors.

Final order this slice: Overview → Game log → Distribution → Score drivers → Why next season.
(The design's full order puts Score drivers and Why-next last; 4b's three sections slot between
Distribution and Score drivers, reaching the final order without another reshuffle.)

### 2.1 Must NOT do
- **No season selector.** Show `mostRecentSeason` from `usePlayerProfile`.
  **Consequence to state, not treat as a bug:** Slice 2 loads gamelogs and schedule for
  `dataSeason` **only**. A player whose last season predates it — retired, or on IR all year — has no
  gamelogs entry for the loaded year and renders degraded rather than showing his final season. That
  is the shipped behaviour; do not add a second fetch to work around it. Market's Production set has a
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

**`RESULT` needs deriving, not printing.** `schedule.games[].result` is the **home margin** — so for
an away player it is inverted, `0` means a tie, and it is `null` for every unplayed game (the entire
current season ships null-scored). Derive W/L/T from the player's team against `homeTeam`/`awayTeam`
and the two scores, and render `—` when `result` or the scores are null. Rendering `result` verbatim
puts the opponent's margin on screen for half the league.
**Production block** (per position, from `gamelogs`): see §3.3.
Then `PTS`, right-aligned, at the end.

There is **no `SNAP%` column**. The design removed it in round 5 because gamelogs carry no snap field
at any grain — snaps are season-grain only. Do not reintroduce it.

### 3.2 `PTS` comes from `weeklyPoints` — and its shape is not what you would guess
`gamelogs.games[].fantasyPoints` / `fantasyPointsPpr` are **nflverse scoring**. This app scores under
the league's own `scoringSettings`, and `careerStats[season][playerId].weeklyPoints` is that number.
Rendering the nflverse figure would put a number on screen that disagrees with the PPG, the
projection and the career chart **in the same pop-up**.

Three facts about it, all settled in review — do not re-derive them:
- **It is an object keyed by the 1-based week**: `weeklyPoints[week]`. **Not** `weeklyPoints[week-1]`,
  which would silently render the previous week's score for every row and `—` for week 1.
- **Only weeks actually played get a key** (`stats.gp === 1`). Byes and DNPs have no entry, so an
  absent key is expected and means "no game played", not "missing data".
- **It is regular-season only** — the loader fetches `?season_type=regular` across weeks 1–18. So
  **every POST row will render `PTS` as `—`, permanently.** That is a real limitation of the source,
  not a bug to fix here. Either render `—` and let the column speak, or omit POST rows from the log
  and say so; **do not** fall back to `fantasyPointsPpr` to fill the gap.

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

### 3.4 Bye vs did-not-play — **the app already knows; do not scan the schedule**
The first draft specified deriving this by scanning the schedule for the player's team. **That was
wrong, and it was also circular**: the week grain of `resolvePlayerTeam` resolves the team *from the
gamelogs row*, which is precisely the row that is absent on a bye.

`careerStats[season][playerId].weeklyStatus` is an 18-slot array indexed `week - 1`, and
`sleeperStats.js` already classifies every week at load time against the set of teams playing:

| Value | Meaning | Render |
|---|---|---|
| `'P'` | played | normal row |
| `'B'` | **bye** — the team had no game | the design's labelled full-width row: `BYE — no row exists in the source. Not a zero.` |
| `'D'` | **did not play** — team played, player did not | context block, `—` across the production block |

Read `weeklyStatus[week - 1]`. This removes three problems the schedule-scan approach carried: the
era-domain join, the mid-season-trade case (season-grain team is a single *dominant* team per CR-02's
`aggregateWeeks` rule, so a traded player would emit phantom byes for his old team's weeks), and
phantom byes for every non-playoff week if the scan spanned POST.

**The schedule is still required** — it supplies the context block's spread, total, roof and weather
(§3.1). It is simply not how byes are detected.

Note `weeklyStatus` is regular-season only, same as `weeklyPoints`. POST weeks have no status slot;
treat a POST gamelogs row as played.

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

- **Buckets:** 5-point, `0–5 … 30–35`, then `35+` — **plus a `<0` bucket**. Per-game league points go
  negative (83 of 25,376 games in `src/__fixtures__/season-totals-2025.json`), so the design's bucket
  set has no home for them. Without a negative bin they either vanish — breaking the "buckets sum to
  the pooled count" invariant — or get silently folded into `0–5`, which misstates the distribution
  for exactly the volatile players this section exists to characterise.
- An empty bucket renders as a void slot — a dashed rule at the axis, no fill — reusing Slice 1's
  convention. **Not a zero-height filled bar.**
- **Shape block** beside it: pooled mean, population SD, coefficient of variation, games over 20,
  games under 10 — each `X of N` where `N` is the pooled game count, so every figure reconciles
  against the same denominator.
- **±1 SD marked** on the plot as a dashed pair.
- **Coverage: pips from the pooled GAME count, not the season count.** `computeConsistency` caps its
  window at `WINDOW_SEASONS = 3`, and `coverageBand(n <= 3)` is `'low'` → **1 pip for every player
  alive**, which is a meaningless encoding. Pooled games (typically 30–50) lands in `'high'` and
  actually discriminates. Span still reads in seasons (`3y`), since that is the window the number
  describes — pips measure the sample, the span names the window.
- `computeConsistency` returns `null` (no qualifying seasons) or an object with a null `sd` (pooled
  games < `MIN_POOLED_GAMES`). **Both are real and both need a degraded state** — the second is the
  subtler one: seasons exist, the distribution is drawable, but no SD is defensible. Draw the
  histogram and render the SD row as `—`; do not suppress the whole section.
- **Comparing this section's SD to the Overview tile's:** the tile renders a formatted string
  (`±${sd.toFixed(1)}`, `PlayerDetailModal.jsx:237`, with a second copy in the chart caption at
  `:321`). Assert against the underlying `computeConsistency` value, or match the rounding — a raw
  comparison against the rendered text will fail on a value that rounds.

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
- a player with **no NFL games** renders both sections with headings and degraded blocks, not blank
  space. **Fernando Mendoza may not serve here** — if he has no `dynastyScore` at all, the modal
  early-returns the whole-modal empty state (`PlayerDetailModal.jsx:178-193`) with no index and no
  sections, so the case never reaches this code. Pick a player who *has* a score but no games, and
  say which one you used;
- the section index now lists five entries and still scrolls rather than swaps;
- no console errors.

---

## 7. Docs

| File | Edit |
|---|---|
| `docs/ui.md` → *Player detail pop-up* | The two new sections, the per-position game-log columns, the bye-vs-DNP rule, and that `PTS` is league-scored rather than nflverse |
| `CLAUDE.md` `src/components/` table | `PlayerDetailModal.jsx` row — now renders five sections and consumes `gameLogsByYear` / `nflScheduleByYear` |
| **`docs/signal-registry.md`** | **Mandatory — three cells, confirmed in review.** Lines `:56` (schedule) and `:57` (gamelogs) both read "view-only, **reachable** (dp-v2 Slice 2) … **no rendering component yet**", and `:46` (NFL per-season `team`) says "the NFL-stats game-log schedule join … so schedule-joined display is currently dark". This slice falsifies all three |
| **`docs/cross-repo-registry.md`** | CR-08's `Mirror` says "The family currently has no app-side consumer", and CR-08/CR-09's app sides say "still no rendering consumer" — all falsified here. Separately **`[registry-stale]`, reported not introduced**: CR-09 and CR-10's app-side entries omit the Slice-2 call sites CR-08's prose does record (`App.jsx:900` `loadNflGameLogs`, `App.jsx:887` `loadTeamContext`, and the context exposure at `App.jsx:578-580` / `ProfileDataContext.jsx`). Fixing those is a one-line correction each in a file this slice already edits |

---

## 8. Cross-repo impact

**CR-18 fires.** The first draft said "none expected" and left the determination open; it is settled
and it is positive. `docs/signal-registry.md` distinguishes *reachable* from *rendered* in the exact
words this slice falsifies (§7), so three Current-use cells change. Per CLAUDE.md the `Mirror` text is
the deliverable, not a prose mention:

**CR-18 · Signal registry rows (`docs/signal-registry.md`) — Mirror:**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
> script the list above cannot already name. The listed sites are every one that exists today; a *new*
> one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side
> against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds,
> removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or
> reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must
> make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the
> family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo
> when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs
> snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later.
> The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Direction is app→data-nothing.** Nothing changed about coverage, source or ephemerality — only which
app code renders the family — so the data repo has no counterpart edit. The obligation is discharged by
making the three registry edits completely, here.

## 9. Done-definition

- [ ] Two sections added to `SECTIONS`; index shows five entries; scroll/index behaviour unchanged
- [ ] Game-log production columns are **per position**; no column of dashes on any position
- [ ] Every rate recomputed from components; zero denominator → `—`
- [ ] Bye row vs did-not-play row are visibly different, and the distinction is schedule-derived
- [ ] `temp`/`wind` null → `—`, never `0`
- [ ] `PTS` reads `weeklyPoints[week]` (**1-based object key**, not `[week-1]`); no nflverse fallback;
      POST rows render `—` and that is accepted, not patched
- [ ] Bye/DNP comes from `weeklyStatus[week-1]`, **not** a schedule scan
- [ ] `RESULT` is derived per the player's team, not `result` printed verbatim
- [ ] Both `SECTIONS` and the JSX order updated, and they agree
- [ ] Distribution pooled over `computeConsistency`'s window; SD matches the Overview tile
- [ ] Empty buckets render void slots, not zero-height bars; a **`<0` bucket exists**
- [ ] Distribution coverage pips use the pooled **game** count, not the season count
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

---

## 11. Plan-review record (2026-08-20)

**Eighteen flags — the most any slice in this program has drawn, and the review earned it.** All
verified; the first draft's §3.4 was wrong in a way that would have produced working-looking code
built on a circular derivation. §3 and §4 were rewritten rather than patched.

**The finding that dissolved four flags at once:** `careerStats[…].weeklyStatus` already classifies
every week as played / bye / did-not-play, decided at load time in `sleeperStats.js` against the set
of teams playing. The draft's schedule-scan derivation was not merely redundant — it was **circular**,
because the week grain of `resolvePlayerTeam` resolves the team from the gamelogs row that is absent
on a bye. Reading `weeklyStatus[week-1]` also removes the era-domain join, the mid-season-trade
phantom-bye case, and phantom byes across POST weeks.

**Three shape errors that would have shipped silently:** `weeklyPoints` is an **object keyed by
1-based week**, so the draft's `weeklyPoints[week-1]` would have rendered every row one week late and
`—` for week 1; it is **regular-season only**, so POST rows can never carry points; and only played
weeks get a key at all. All three are now stated rather than left for the implementer to "verify".

**Two design decisions corrected.** Distribution's coverage pips would have read **1-of-3 for every
player alive** — `computeConsistency` caps at three seasons and `coverageBand(<= 3)` is `'low'` — so
they now measure pooled *games*. And the bucket set had no bin for **negative** per-game points, which
occur 83 times in the 2025 fixture, so they would have vanished and broken the section's own sum
invariant.

**Two false claims in §1**, both about the file being edited: `PlayerDetailModal.jsx` **does** call
`usePlayerProfile` (the never-use rule belongs to the multi-tab shell), and it already exposes
`mostRecentSeason` — so the draft's silence on where `dataSeason` comes from had also steered away
from the answer.

**`RESULT` is the home margin**, inverted for away players, `0` for a tie and `null` for every
unplayed game — printing it verbatim would show the opponent's margin for half the league.

**CR-18 fires.** The draft left the determination open; `signal-registry.md` distinguishes *reachable*
from *rendered* in the exact words this slice falsifies, across three cells. `Mirror` text is now
quoted in §8. One `[registry-stale]` finding is reported and folded into §7 as a correction: CR-09 and
CR-10's app-side entries omit Slice-2 call sites that CR-08's prose records.

**One flag rejected as unverifiable rather than wrong:** the reviewer could not corroborate §3.3's
per-position gamelogs field names in `src/`, correctly — the loader is pass-through and names only
four keys. They were verified against the data repo, which the reviewer cannot read. §1 now says so,
and asks the implementer to confirm one row at runtime.

