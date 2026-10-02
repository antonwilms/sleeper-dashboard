# Defence numbers rebuilt — registry companion (Session 2, commit 2)

Companion to `defence-numbers-rebuild.md`. Applies to `docs/cross-repo-registry.md` only.
**Route:** the standard two-session route — app applies first, data syncs the same day (backlog
D-57). The parent-folder route is not used (its 2026-09-05 precondition is unmet). The daily mirror
run is red between the app push and the data sync. Never write the region's sentinel literals or a
`sed` range literal into an entry.

Every anchor below was checked against app `d4ccd3b` on 2026-10-02 and occurs **exactly once** in
the file. Edit by exact string replacement; each edited field stays one physical line.
`<DATE>` = the date of this commit (YYYY-MM-DD).

## A. CR-02

1. **App side** — replace this exact substring (it has a leading and a trailing space) with a
   **single space**:

   `` in `src/hooks/useWeeklyDecision.js`, `maxDefGamesPlayed:40` (the league-wide max DEF-row `gamesPlayed`, consumed by `deriveGamesPlayed:52` as the `/week` blend's `n`) and `deriveStoreLag:66` (its own per-team scan of DEF-row `gamesPlayed` — a freshness signal, not a rate); ``

   so the list reads `` …(season grain reads `careerStats[season][pid].team`); `buildPriorSeasonContext` in… ``.

2. **Triggers** — delete this exact substring (with its trailing space):

   `` `isDefenseRowId` call sites `src/hooks/useWeeklyDecision.js:45` (inside `maxDefGamesPlayed`) and `:77` (inside `deriveStoreLag`), ``

3. **Triggers** — also delete this exact substring (including its trailing space):

`` `src/utils/opponentStrength.js` (`collectSeasonFpaRates:76`, iterates the served row set — now takes a row map, either a `careerStats[season]` slice or a live season's `currentSeasonTotals.players`; `isDefenseRowId:39`, depends on bare-abbr DEF rows existing in it — `[registry-stale]`, omitted here until in-season-season-totals.md, corrected here); ``

## B. CR-08

1. **App side** — replace `` fed by the `:1099` `sosSeason` load. `` with:

   `` fed by the `sosSeason` load. **A fourth reader since defence-numbers-rebuild** — `buildTeamRecords` in the same file (W-L-T from `homeScore`/`awayScore` on scored REG games) for `/week`'s Defences-you-face RECORD column, fed by both the `sosSeason` entry and the `dataSeason` entry. ``

   **Registry-stale refresh, same field** (plan gate 2026-10-02): set each anchor to its value in
   the app **after commit 1**, found by grep, keeping the existing `[registry-stale]` history
   wording and appending `, then <old>; re-corrected by defence-numbers-rebuild`:
   `isValidSchedule:148` → `grep -n "export function isValidSchedule" src/api/dataStore.js`;
   the `:143` after `MIN_SCHEDULE_GAMES = 200` → `grep -n "MIN_SCHEDULE_GAMES = " src/api/dataStore.js`;
   `App.jsx:1079` → `grep -n "loadNflSchedule(dataSeason)" src/App.jsx`;
   `App.jsx:644` → the `nflScheduleByYear,` line inside the `profileContextValue` memo;
   `App.jsx:1099` → `grep -n "loadNflSchedule(sosSeason)" src/App.jsx`.

2. **Triggers** — two replacements:
   - `` `homeScore` at `:20` as the same played/unplayed gate — it feeds `deriveStoreLag`'s expected-games count, so a rename silently skews the lag notice) ``
     →
     `` `homeScore` at `:20` as the same played/unplayed gate), and (defence-numbers-rebuild) `buildTeamRecords` in the same file (`homeScore`/`awayScore`, the RECORD column) ``
   - `` via `src/components/week/WeekView.jsx:61-62` (the `/week` read of `nflScheduleByYear[season]`, gated on `complete`) ``
     →
     `` via `src/components/week/WeekView.jsx` (the `/week` reads of `nflScheduleByYear[season]` and, since defence-numbers-rebuild, `nflScheduleByYear[dataSeason]`, each gated on `complete`), `src/components/dp/PlayerDetailModal.jsx` (`nflScheduleByYear?.[mostRecentSeason]`, the read behind the game-log context block) and `portfolio/Portfolio.jsx` (the `nflScheduleByYear?.[sosSeason]` read feeding `buildSosTable`) — the last two `[registry-stale]`, never listed, added by defence-numbers-rebuild's plan gate ``

3. **Mirror** — append to the end of the field (after its final full stop, one space first):

   `` **Since defence-numbers-rebuild `homeScore`/`awayScore` also drive `/week`'s RECORD column** — a rename or reshape blanks it to `—` with no error. ``

## C. CR-16

1. **App side** — two replacements:
   - delete `` `src/hooks/useWeeklyDecision.js:80` (`deriveStoreLag`), `` (with its trailing space);
   - `` `src/utils/opponentStrength.js:88`, `` → `` `src/utils/opponentStrength.js` (`buildDefenceSeasonAllowed`, on each Sleeper weekly row's `opponent`), ``
   - `` (`buildRegWeekIndex`, `resolveTeamWeek`, and the VS display's `denormalizeTeamForSchedule`) `` →
     `` (`buildRegWeekIndex`, `resolveTeamWeek`, and the VS display's `denormalizeTeamForSchedule`) and `buildTeamRecords` (defence-numbers-rebuild) ``
2. **Triggers** — delete `` `src/hooks/useWeeklyDecision.js` (`deriveStoreLag`), `` (with its trailing space).

## D. CR-20 — retire

Header and **Direction** unchanged. In **Data side**, replace the sentence
`` A future widened denylist (or an allowlist rewrite) could drop `fan_pts_allow_*` keys, or the DEF row itself, with **no app-side diff**. ``
with
`` Since the retirement nothing app-side reads them, so a widened denylist or an allowlist rewrite that drops the keys or the DEF row is safe. ``
Replace the four other field lines whole:

- **App side:**
  `` - **App side:** none since defence-numbers-rebuild (<DATE>). Formerly `src/utils/opponentStrength.js`'s `fan_pts_allow_${pos}` reads and `isDefenseRowId`, feeding `teams/Teams.jsx`'s FPA columns, Portfolio's SOS column, `/week`'s ALLOWS column and `DefencesFaced.jsx`; all four now read league-scored points allowed built from Sleeper's weekly stat rows (`src/api/defenceWeekly.js`, `buildDefenceSeasonAllowed`). `docs/signal-registry.md`'s `fan_pts_allow_*` row records the keys as served-but-unrendered. ``
- **Invariant:**
  `` - **Invariant:** **RETIRED (<DATE>):** no app surface reads these keys or rows any more. Formerly: every bare-abbr DEF row, and its seven `fan_pts_allow_*` keys, survive season-totals aggregation and pruning unmodified. ``
- **Triggers:**
  `` - **Triggers:** none — retired  ‖  none — retired ``
- **Mirror:**
  `` - **Mirror:** Retired — the data repo may widen `prunePlayerStats`, add an allowlist, or drop `fan_pts_allow_*` and the bare-abbr DEF rows without an app-side change. Measured 2026-10-02: the keys are full-PPR (`pts_ppr`), not half-PPR. If an app slice reads them again, re-open this id rather than minting a new one. ``

## E. CR-21

1. **App side** — delete this exact substring (with its trailing space):

   `` `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js`, `FPA_PRIOR_DROP_GAMES` (`:33`) in the same file (the current-season games-played threshold at which the prior term is dropped entirely rather than shrunk), `maxDefGamesPlayed` in `src/hooks/useWeeklyDecision.js` (the league-wide max DEF-row `gamesPlayed`, which becomes the `/week` blend's `n` via `deriveGamesPlayed`) and `deriveStoreLag` in the same file (a per-team freshness check against the live schedule), `src/components/week/DefencesFaced.jsx` (a second, direct read of the same `currentRows`), ``

2. **Triggers** — delete this exact substring (with its trailing space):

   `` `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js` and its three live `buildFpaTable` call sites `src/hooks/useWeeklyDecision.js:284`, `teams/Teams.jsx:161`, `portfolio/Portfolio.jsx:370` (`[registry-stale]`, reported by weekly-decision-2a-lineup-truth.md's plan gate, corrected here), `FPA_PRIOR_DROP_GAMES` in `src/utils/opponentStrength.js` (`:33`) and its readers `src/utils/weeklyLineup.js:100`, `src/utils/blendWeights.js:23`, `teams/Teams.jsx:77,82`, `maxDefGamesPlayed`/`deriveStoreLag` in `src/hooks/useWeeklyDecision.js` (both read `currentSeasonTotals.players`' DEF rows' `gamesPlayed`), `src/components/week/DefencesFaced.jsx:28`, ``

3. **Mirror** — two replacements:
   - `` **the app has no way to tell on `/teams` or `/portfolio`** — it will render a half-season's rates as though they were a season's, with no error and no test failure. ``
     →
     `` **the app has no way to tell in Market's In-season column set or the in-season seam** — it will read a half-season's rates as though they were a season's, with no error and no test failure. ``
   - `` `/week` compares each team's DEF-row `gamesPlayed` against that team's scheduled REG games through Sleeper's completed weeks and states the lag (`deriveStoreLag`), so a stopped job surfaces there as a lag notice that never clears. ``
     →
     `` Since defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows on them at all. ``

## F. Not edited

CR-14 (callers are explicitly not triggers), CR-18 (the signal-registry edits are app-originated —
no data-side ingest change), CR-10/CR-23 (no teamcontext read changes).

## G. Gate for the data sync (D-57)

The mirrored span differs from the data copy at `defacb1` in exactly **15** lines: CR-02 App side,
Triggers; CR-08 App side, Triggers, Mirror; CR-16 App side, Triggers; CR-20 App side, Data side,
Invariant, Triggers, Mirror; CR-21 App side, Triggers, Mirror. State this count in the D-57 entry.

## H. Mirror texts of every touched entry (the rule's deliverable — `## Cross-repo impact`)

Quoted verbatim from `docs/cross-repo-registry.md` at `d4ccd3b`; for CR-08, CR-20 and CR-21 the text
is the Mirror **as it reads after §B/§D/§E**.

- **CR-02** (unchanged): A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry. **Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim** (the pop-up's Game log `PTS` and Distribution histogram) and labels them half-PPR from the row's served `scoringBasis`: changing the basis `weeklyPoints` is written on — D-47 included — without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test.
- **CR-08** (after §B.3): Shape or floor changes land in both repos together. Read-only on the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written, with no validator to catch it (this family stays read-only/view-only on the app side regardless). **Since defence-numbers-rebuild `homeScore`/`awayScore` also drive `/week`'s RECORD column** — a rename or reshape blanks it to `—` with no error.
- **CR-16** (unchanged): A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.
- **CR-18** (unchanged; app-originated signal-registry edits, nothing owed data-side): This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.
- **CR-20** (before retirement, for the record): Do not remove, rename or filter `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/(total), and do not widen `prunePlayerStats`'s denylist (or replace it with an allowlist) without an explicit DEF-row exemption alongside the existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA QB/RB/WR/TE columns degrade silently to `—` across all 32 teams** — and with them Portfolio's SOS column, `/week`'s Defences-you-face panel and the lineup's blended FPA — if either the keys or the rows vanish — no error, no test failure, indistinguishable from the API-only-mode degraded state already shown for an unrelated reason (§6 of the task file). This is the exact silent-degradation shape CR-11/12/13/19 exist to record, for a *row*, not merely a key.
  **After §D:** Retired — the data repo may widen `prunePlayerStats`, add an allowlist, or drop `fan_pts_allow_*` and the bare-abbr DEF rows without an app-side change. Measured 2026-10-02: the keys are full-PPR (`pts_ppr`), not half-PPR. If an app slice reads them again, re-open this id rather than minting a new one.
- **CR-21** (after §E.3): If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell in Market's In-season column set or the in-season seam** — it will read a half-season's rates as though they were a season's, with no error and no test failure. Since defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows on them at all. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel. **Since in-season-evidence-2b-2 a mis-marked or stale in-progress file also moves displayed projections and veterans' and rookies' dynasty scores, silently** — `gamesPlayed` counting inactive weeks over-weights every posterior.
