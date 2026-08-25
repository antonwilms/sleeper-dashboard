# Fantasy points allowed by position — blended, ranked

New app-side surface. Origin: F-24's research (idea tracker), where Anton's note reframed "team
defensive strength" as **fantasy points a defense has allowed to each position group, ranked** —
which is both the right metric and one the store already serves.

**⚠ Review found a blocker that changes what this is.** The prior-season half works today. The
**in-season half cannot work at all** without a prerequisite spanning both repos — see §0. Planning's
original "no data-repo work, no new ingest" was true only for the preseason half.

---

## 0. The blocker — the app has no in-progress-season data, anywhere

Anton's second requirement ("once the regular season starts this should slowly adjust") **cannot be
met by this feature alone.** Three independent blockers, all verified:

1. **`careerStats` never contains the live season, by construction.**
   `loadCareerHistory` builds `for (let s = 2012; s < currentSeason; s++)` (`sleeperStats.js:240`)
   with `currentSeason = parseInt(nflState.season)` (`App.jsx:840`), and that is the only writer of
   `setCareerStats`. So `careerStats[2026]` is `undefined` in preseason and in Week 17 alike, and
   `deriveDataSeason` returns the last **completed** season by definition.
2. **The store read would reject it anyway.** `tryDataStore` defaults `allowInProgress: false`
   (`dataStore.js:73,81`), while the data repo marks the live year `inProgress: true`.
3. **Nothing produces the file.** The data repo has weekly crons for advstats, gamelogs, teamcontext,
   roster, schedule, oline, playerstate and KTC — but **no workflow ingests `nfl/season-totals` at
   all**; the only `update.mjs nfl` invocation anywhere is `smoke-test.yml`'s `--dry-run`. So
   `nfl/season-totals/2026.json` will not exist during 2026 unless run by hand.

**This is bigger than this feature.** It means the app shows last-completed-season data on *every*
surface for the whole of a live season — Market's Efficiency header already says "Fixed to the 2025
season" for exactly this reason. Closing it would light up in-season data app-wide, not just here.

**Consequence for this plan:** it splits in two.

- **This slice (ships now, correct today):** the ranking over the **last completed season**. In
  preseason that is exactly what Anton asked for, and it is the state the app is in right now.
- **Prerequisite slice (before the season starts):** in-season season-totals — a data-repo cron plus
  an app-side current-season load with `allowInProgress: true`. **Only then does the blend's
  current-season term become reachable.**

Build the blend's shape now so the second term drops in without a rewrite, but **do not claim the
feature adjusts in-season until the prerequisite lands** — §2 and the popover must say which seasons
are actually in play.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `fan_pts_allow_{qb,rb,wr,te}` (+ `_k`, `_def`, total) sit on the bare-abbr DEF rows, populated 32/32 in 2025 | measured |
| **NOT always 32 rows — 2017–2019 carry 33**: `OAK` and `LV` are duplicate rows for the same defense (both `team: "OAK"`, identical values). Any "32 rows" or 1–32 rank assumption breaks on history | measured, 14 seasons |
| **2017 `MIA`/`TB` carry `gamesPlayed: 17` in a 16-game season** (the Irma postponement), so their per-game denominator over-counts by one | measured |
| They are **season totals**, not per-game — PHI 2025: `fan_pts_allow_wr` 455.2 over `gamesPlayed` 17 = **26.8/g** | measured |
| Spread across 32 defenses (2025 totals): QB 197.0–402.6, RB 289.5–483.0, WR 401.2–666.3, TE 130.7–355.0 — a real, wide signal | measured |
| **`scoringBasis` on DEF rows is `half_ppr`** — Sleeper's basis, not necessarily the league's | measured |
| **`gamesPlayed` on a DEF row IS that defense's games** — verified across all 14 seasons (16 pre-2021, 17 from 2021), matching `stats.gp` and `weeklyPoints` length. The per-game premise holds | measured |
| **The STORE path returns the file whole and unfiltered** (`return dsResult`) | `src/api/sleeperStats.js:144-159` |
| **But the LIVE-API fallback produces ZERO DEF rows** — `if (!activePlayerIds.has(playerId)) continue` (`:185`), and the 32 DEF entries carry `status: null` while Dynasty 040 has no DEF roster slot. In API-only mode every column reads `—` | `sleeperStats.js:185`, `App.jsx:848-852` |
| **DEF rows key the Sleeper domain (`LAR`)** while `/teams`' rows come from teamcontext's era-accurate keys (`LA`) — the CR-16 boundary `Teams.jsx`'s YOUR EXPOSURE already documents | measured |
| **Zero app consumers of `fan_pts_allow*` today** | grep, excluding fixtures |
| **F-24 preserved DEF rows by COINCIDENCE, not by guard** — `prunePlayerStats` `continue`s on `TEAM_*` only; its comment says DEF rows *"are untouched by the denylist itself (defense never produces idp_/punt output) so need no separate guard"*. A widened denylist would strip them with no app-side diff | data repo `lib/sleeper.mjs` |
| **2026 season-totals does not exist yet** — so "current season" is genuinely absent right now, which is exactly the preseason case | `manifest.json` |
| `season-totals-2025.json` has no DEF rows — **but `season-totals-2025-ind.json` already carries a verbatim `IND` DEF row** with all seven `fan_pts_allow_*` keys, plus `TEAM_IND` and numeric ids, pinned by `seasonTotalsEntityFilter.test.js` | measured |
| `docs/signal-registry.md` has **zero** `fan_pts_allow` hits — this is a NEW row, not a reclassification | measured |
| The repo's own research already placed this feature: opponent quality is a **1-week predictor**, *"points-allowed-by-position is wanted during the season"*, and it is **out of scope for `projectedPPG`** | `docs/prediction-research-eval.md:175-186` |
| `/teams` already renders a sortable 32-row table with an inverted lower-is-better column (`DEF EPA ALL`, ascending-first via `usePlayersTable`'s `ascByDefault`) | `components/teams/Teams.jsx` |

---

## 2. The blend — shrinkage, not a switch

Anton's requirement: preseason uses last full season; once the season starts the current one takes
over **slowly**, because this year's defense is what matters.

That is a shrinkage problem, and shrinkage expresses it in one expression with no week-number
branching and no discontinuity:

```
fpaPerGame = (gCur · rateCur + K · ratePrior) / (gCur + K)
```

where `rateX = fan_pts_allow_<pos> ÷ gamesPlayed` for that season, and `K` is the prior's weight in
**pseudo-games**.

- **`gCur = 0` needs an explicit guard — it does NOT "fall out".** Planning claimed the expression
  handles it; that is arithmetically wrong. `rateCur` is `fpa/0` = `Infinity` (or `NaN` for `0/0`),
  and `0 * Infinity === NaN` in JS, so the whole expression is `NaN`. **`computeFpaPerGame` must
  return `null` when `gamesPlayed <= 0`, and the caller must drop that term entirely.** This covers
  both preseason and the week-1 team-on-bye case.
- Weight shifts continuously as real games accumulate; no cliff at any week.
- At `gCur = K` the two are equal; beyond that the current season dominates.

**`K = 6`, as a named exported constant** — crossover at ~6 games, current season ~65% by week 12.
**But note the ceiling review found:** real `gCur` maxes at 17, so the current season tops out at
17/23 ≈ **74%** and the prior keeps ~26% even in the fantasy playoffs. "Slowly adjusting" is
satisfied; "the current season dominates" is not — say the former, not the latter. If a lower floor
is wanted later, K is the single knob.

**This is a judgment call, not a backtested one.** There is no in-repo backtest for defensive FPA
stability; say so at the constant and in the popover rather than implying it was fitted.

**Do not tag it `PROVISIONAL`.** Every input is real measured data — the *weighting* is a choice, not
a fabricated value, and the `PROVISIONAL` convention is for values not backed by real data. A named
constant plus an honest popover line is the right disclosure. *(If review disagrees, defer to it.)*

**Degradation, both directions:**
- No prior season → use the current season alone (`gCur > 0`), and mark coverage low.
- No current season **and** no prior → render `—`. Never substitute a league average.
- A team with `gamesPlayed = 0` in the current season contributes nothing; it is `gCur = 0`, which is
  already the preseason case.

---

## 3. Which seasons

- **Prior** = the most recent season with data, via `environment.js`'s existing `deriveDataSeason(careerStats)`
  — do not add a fourth local copy of that derivation.
- **Current** = `nflState.season` when a season-totals file exists for it, else absent. Three
  mechanics review supplied: `nflState` is **not** a prop to `Teams` today (`App.jsx:1144-1150`
  passes `playerRows`/`loaded`/`careerStats`/`teamContextByYear`/`myTeamName` only) and must be
  threaded; `nflState.season` is a **string** while `deriveDataSeason` returns a **Number**, so
  compare deliberately; and the existence check without a fetch is
  **`getManifestEntry('nfl/season-totals/<Y>.json')`** (`dataStore.js:66`) — async, but the manifest
  is memoised.

**Until §0's prerequisite lands, the current term is always absent** and the blend is the prior
season alone. That is correct behaviour today, not a bug — but the popover must name the season(s)
actually in play rather than implying a blend that is not happening.

**These are deliberately different sources**, and that is the whole point of this feature: `dataSeason`
is "newest season with data" (2025 today) while `nflState.season` is the live NFL season (2026). The
app's own loader convention keys view-only families on `dataSeason` precisely because they diverge —
here we need **both**, and conflating them would make the blend either never update or update
against a file that does not exist. State this in the code.

---

## 4. Surface — Teams index columns

Add four sortable columns to `/teams`: **`FPA QB`, `FPA RB`, `FPA WR`, `FPA TE`** — blended per-game
points allowed, one decimal.

- **Rank 1 = toughest defense** (lowest points allowed), the conventional direction. Show the rank
  alongside or via the popover; the cell's primary value is the per-game number.
- **Lower is better for the defense, so first click sorts ascending** — add the four keys to
  `usePlayersTable`'s `ascByDefault` set, exactly as `defEpaPerPlay` did in Slice 6a.
- **Do not colour by value.** These are neither good nor bad without knowing whose side you are on —
  a soft defence is good for your starter and bad for your own DST. Follow the precedent
  `EnvironmentSection` set for own-defense EPA: state polarity in text, never in colour.
- **A `DefinitionPopover` per column** carrying: the field expression, which seasons are actually in
  play and their weights, and the basis caveat (§6).
- **Join through `normalizeTeamForSchedule`.** `/teams`' rows are era-accurate (`LA`); DEF rows are
  Sleeper-domain (`LAR`). Without the hop **the Rams row renders `—`** — the identical bug 6a caught
  in YOUR EXPOSURE and 6b caught in coaching. This is a **CR-16** trigger.
- **Degraded state for API-only mode.** The live-API fallback yields no DEF rows at all (§1), so all
  four columns would be empty with no explanation. Render `dp/DegradedBlock`-style copy or a muted
  `—` with a stated reason, never a silent blank column.

**Explicitly not in this slice:** the per-player "your starter faces the 3rd-softest WR defence this
week" surface. That is the actual start/sit payoff and it is a bigger piece — it needs the current
week, the schedule join (`nflScheduleByYear` is loaded and rendered since Slice 4a, so it is
feasible), and a decision about where it lives (Market gutter? the pop-up? a new Start/Sit surface?).
Ship the ranking first; that follow-on is worth its own slice and its own design pass.

---

## 5. Where the derivation lives

New pure util `src/utils/opponentStrength.js`:

- `FPA_POSITIONS = ['qb','rb','wr','te']` — deliberately excludes `_k` and `_def`; the app is
  QB/RB/WR/TE structurally (`SKILL_POSITIONS`).
- `PRIOR_WEIGHT_GAMES = 6` (§2).
- `computeFpaPerGame(careerStats, season, team, pos)` → per-game rate or `null`.
- `buildFpaTable(careerStats, { priorSeason, currentSeason })` → `{ [team]: { qb, rb, wr, te } }`
  blended, **one pass over the 32 DEF rows per season**, not one pass per team per metric — the
  mistake `computeLeagueStanding` makes and `buildLeagueRankTable`/`buildTeamMetricsTable` were
  written to avoid.
- `rankFpaTable(table)` → per-position 1–32 ranks, ascending (1 = toughest).

Pure, no React, no I/O. **View-only** — must never be imported by projection or scoring, guarded by a
new test in the style of `teamContextViewOnly.test.js`. The research doc's placement (§1) makes this
non-negotiable: opponent strength is out of scope for `projectedPPG`.

**Identifying DEF rows:** bare 2–3-letter uppercase keys, distinct from `TEAM_<abbr>` aggregates and
numeric player ids. `isTeamAggregateId` matches `TEAM_*` only — do **not** reuse it. Add an explicit
predicate for the three-way taxonomy (player / `TEAM_*` / bare-abbr DEF).

**Do not assume 32 rows or a 1–32 rank range** — 2017–2019 carry 33 (duplicate `OAK`/`LV`, §1). Rank
over however many rows are present, and de-duplicate on the row's own `team` field rather than the
key when a historical season is in play.

---

## 6. The basis caveat — state it, do not hide it

`fan_pts_allow_*` is a **pre-summed season total in Sleeper's `half_ppr` basis**, not the league's own
scoring settings. The app's standing invariant — *"Fantasy points computed weekly … never sum
pre-stored season totals"* — is about computing a **player's** points and does not forbid reading a
served defensive aggregate, but the distinction must be visible:

- For a **ranking**, basis barely matters — relative order across 32 defenses is robust to scoring
  tweaks.
- For the **displayed number**, it does. The popover must say the figure is half-PPR, not league-scored.

**The in-basis alternative is real but out of scope here:** deriving points-allowed-per-position from
the app's own league-scored `weeklyPoints` joined to the schedule. It needs no new data either.
Record it as the upgrade path; do not build it in this slice.

---

## 7. Tests

- **Preseason** — with no current-season file, the blend returns exactly the prior rate. This is the
  behaviour Anton specified; assert it directly.
- **Mid-season shift** — at `gCur = K` the result is the midpoint of the two rates; at `gCur = 3K` it
  is within a stated tolerance of the current rate. Proves "slowly adjusting" is real, not asserted.
- **No prior** — current season alone; **neither** → `null`, never a league average.
- **Rank direction** — lowest per-game allowed ranks 1.
- **Row taxonomy** — `TEAM_*` and numeric player rows are excluded from the DEF table; only bare
  abbrs are read.
- **View-only guard** — no projection/scoring module imports `opponentStrength.js`.
- **Do NOT hand-author DEF rows into `season-totals-2025.json`.** That file is the *captured* fixture
  and CLAUDE.md's field-existence authority (`statKeysContract.test.js:21,34`); fabricating rows into
  it makes it stop being evidence of live data. Either extract rows **verbatim** from the data repo's
  real `nfl/season-totals/2025.json`, or build ranking rows in-test. Note
  **`season-totals-2025-ind.json` already carries a real `IND` DEF row** (plus `TEAM_IND` and numeric
  ids) and is the existing precedent for the row-taxonomy case.
- **`gamesPlayed = 0`** returns `null`, and the blend drops the term rather than producing `NaN`.

---

## 8. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `src/utils/` | New `opponentStrength.js` row |
| `CLAUDE.md` routing table | `/teams` row gains the four FPA columns |
| `docs/ui.md` | The columns, the blend, the basis caveat |
| `docs/signal-registry.md` | `fan_pts_allow_*` goes from **served-but-unrendered** to rendered — this is exactly the reclassification CR-18 exists for |

---

## 9. Cross-repo impact

**Two entries fire.** Planning said one and deferred its text; both Mirrors are emitted verbatim
below, from the live registry region.

**CR-02 · season-totals schemaVersion & row composition** — the whole feature rests on this entry's
Invariant (*"the served row set is player rows **plus** `TEAM_<abbr>` … **plus** `<abbr>` DEF rows"*),
and `opponentStrength.js` becomes a new row-taxonomy consumer of a trigger list that enumerates every
existing one.

> **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app
> since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via
> `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks;
> ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections
> **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate.
> Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:**
> `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist;
> CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever
> written into the season file itself (manifest-only). **D-1, same change, forward-only:**
> `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'`
> into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a
> written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the
> served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a
> `kind: 'bye'` row straight off served `weeklyStatus`.

**CR-18 · Signal registry rows** — `fan_pts_allow_*` gains a **new** row (there is no existing one).
`Direction: data→app`.

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new
> ingest adds a script the list above cannot already name. The listed sites are every one that exists
> today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer
> re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When
> a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters
> its historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**A key-preservation entry for `fan_pts_allow_*` IS warranted** — and for a sharper reason than
planning gave. DEF rows are **not** deliberately guarded in the prune: `prunePlayerStats` exempts
`TEAM_*` explicitly and DEF rows survive only because defenses never produce `idp_`/`punt` output. A
widened denylist would strip them with **no app-side diff** — the exact silent-degradation shape
CR-11/12/13/19 exist to record. Draft it in the CR-11 family style and land it in both repos.

**Registry staleness to fix in passing:** CR-02's app-side trigger list omits a second cross-row
reader of the served row set — `src/utils/outlookPositionStats.js:72` (`buildPerSeasonTeamShares`,
row loop `:78`), alongside the already-listed `buildTeamShareTotals` at `:36`.

---

## 10. Done-definition

- [ ] Preseason (no current-season file) returns exactly the prior season's rate — verified against
      today's real state, where 2026 does not exist
- [ ] `PRIOR_WEIGHT_GAMES` is a named export with its rationale and its untested status stated
- [ ] One pass per season over the 32 DEF rows; no per-team-per-metric recomputation
- [ ] Rank 1 = toughest; the four keys added to `ascByDefault`; **no colour on the cells**
- [ ] Popover states the blend, the live weights, and the **half-PPR basis**
- [ ] Fixture gains DEF rows for all 32 teams; view-only guard test added
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Smoked: `/teams` sorts by each FPA column; a soft and a tough defence read plausibly against
      the 2025 spreads in §1
- [ ] CR-02 **and** CR-18 mirrors carried out; a NEW `fan_pts_allow_*` signal-registry row added
      (there is none today); the CR-02 `outlookPositionStats.js:72` staleness fixed
- [ ] A `fan_pts_allow_*` key-preservation entry drafted and landed in **both** repos
- [ ] Rams row renders a real value (`normalizeTeamForSchedule` applied), not `—`
- [ ] `gamesPlayed = 0` yields `null`, never `NaN`
- [ ] API-only mode shows a stated degraded state, not four silently blank columns
- [ ] The popover names the seasons actually in play — it must NOT imply an in-season blend until
      §0's prerequisite ships
