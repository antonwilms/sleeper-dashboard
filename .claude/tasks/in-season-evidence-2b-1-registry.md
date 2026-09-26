# In-season evidence — Phase 2b-1: registry texts, docs list and backlog entries (companion)

Companion to `.claude/tasks/in-season-evidence-2b-1-constants-snapshot.md` (moved here for size). **Session 2 reads it:** §9 below is applied verbatim in commit 2.

## 9. Cross-repo impact — verbatim edits

### 9.1 CR-15 — companion §A, all three edits verbatim (anchors unique)
Copied verbatim from data `.claude/tasks/in-season-evidence-2a-registry.md` §A (anchors re-checked
unique in `docs/cross-repo-registry.md`, 2026-09-26):

1. **Data side.** Immediately after the text `parity-guarded by \`test/rookie-mirror.test.mjs\``
   (the end of the field), append:

   ```
   ; `scripts/inseason-run.mjs` (`bin/backtest.mjs --inseason`) composes `attachFactorMultipliers`/`predictFullPipeline` and `reconstructShippedRookieProjection` into the in-season k-fit prior, on a context built by `loadFactorInputs`/`buildFactorContext` in `scripts/panel-run.mjs` — a deliberate consumer of the corrected rookie reconstruction outside `bin/panel.mjs`'s closure
   ```

2. **Triggers.** Replace `` `test/rookie-mirror.test.mjs`, `test/step4-mirror.test.mjs` `` (unique,
   the end of the data-side list) with:

   ```
   `test/rookie-mirror.test.mjs`, `test/step4-mirror.test.mjs`, `scripts/inseason-run.mjs`
   ```

3. **Mirror.** Immediately after `and the boundary gets a row in \`grading/anchor-policy.md\`.`
   (the end of the field), append:

   ```
    A mirrored-factor change, or a change to any of the three rookie mechanisms, also stales the in-season k constants fitted by `bin/backtest.mjs --inseason` over this reconstruction (CR-25): re-run it before re-pinning them.
   ```

Mirror emitted (CR-15's own, verbatim): *"Re-mirror the changed constant/gate/branch and **re-fit before
any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces
and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting."* (The
field continues past that point; the edit only appends the CR-25 sentence.)

### 9.2 CR-09 — companion §B, all three edits verbatim (anchors unique)
Copied verbatim from the data companion §B (anchors re-checked unique):

1. **Data side.** Immediately after `` `lib/validate.mjs` `validateGameLogs` `` (the end of the
   field), append:

   ```
   ; read offline (analysis only) by `scripts/inseason-run.mjs` for per-week opportunity/target splits (CR-25)
   ```

   **Triggers.** Immediately after `(the shared stats_player release path; the STATS_BASE tag-switch is what closed the 2019 gap on 2026-07-03)` (unique; the end of the data-side list), append:

   ```
   , `scripts/inseason-run.mjs` (the CR-25 analytical read)
   ```

3. **Mirror.** Replace the sentence `View-only on both sides — must never feed projection/scoring/grading.` with:

   ```
   View-only on both sides — must never feed projection/scoring/grading as per-player values. One sanctioned analytical read: `scripts/inseason-run.mjs` (CR-25) splits season-totals opportunity stats by week from gamelogs, behind a stop that requires ≥ 99% of the skill player-seasons present in gamelogs (gp ≥ 4) to reconcile with season-totals `stats`. It emits only fitted parameters: dimensionless k constants, plus the parameters of the posterior-combination and sort-measure forms built on them. It never emits per-player values. Weekly points there come from season-totals, never from gamelogs `fantasyPoints`.
   ```

Mirror emitted: CR-09's full Mirror field after this edit (§9.11).

### 9.3 CR-01 — three edits
1. **App side:** replace `` `src/utils/projectionSnapshot.js` (writer, `schemaVersion: 3`) `` with
   `` `src/utils/projectionSnapshot.js` (writer, `schemaVersion: 3`; the per-player `inSeason` field is built by `src/utils/inSeasonScoring.js` `buildScoringPosteriors`) ``
2. **Invariant:** append immediately after `which was league-scored even then — additive only.` (unique; the field's end):
   ```
    **Since in-season-evidence-2b-1 (still v3, no bump)**, a player entry may carry `inSeason` — `{ season, n, population, frozen, priorSource, notFrozenReason, ros: { prior, k, weight, value }, next: { priorKind, prior, k, weight, value } }` — the in-season posterior at capture; absent when there is no usable live season or the player is ineligible; `projection` stays the unmodified prior (never a posterior), so grading continuity holds — additive only.
   ```
3. **Mirror:** replace the sentence `This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place).` with:
   ```
   Since in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back), so the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys need no change.
   ```
4. **Triggers:** replace `` `src/App.jsx:602-604` `` with `` `src/App.jsx:602-627` (Session 2 re-greps the post-change lines), `buildScoringPosteriors` in `src/utils/inSeasonScoring.js` (reads `seasonProjections[id].projectedPPG`), `trimFrozenSnapshot` in `src/utils/inSeasonScoring.js` (reads served `players[id].projection.projectedPPG`) ``
**Mirror emitted (CR-01, after edit):** no `schemaVersion` bump (stays 3). The new per-player shape is
as above. Data repo: the README snapshot section documents `players[id].inSeason`.
`register-snapshots.mjs` and `grade-snapshot.mjs` need no change. Data CLAUDE.md Invariant 4's clause
"snapshots have no `tryDataStore` reader, so their schemaVersion is independent of it" becomes false.
Replace it with "snapshots are read back through `tryDataStore` (CR-26), so the ceiling applies to them
too".

### 9.4 CR-04 — two edits
1. **App side:** after `` `getManifestEntry:66` `` insert `` and `listManifestPaths` (path enumeration by prefix, first used by `src/api/frozenPrior.js` for `snapshots/`) ``
2. **Triggers:** replace `` `getManifestEntry` and the validator block in `src/api/dataStore.js` `` with
   `` `getManifestEntry`, `listManifestPaths` and the validator block in `src/api/dataStore.js` ``
3. **App side:** after `The module's own header (`:4-6`) flags this as a deliberate "Coupling note".` append
   `` A second bypass of the same shape: `src/api/ktc.js` (`:127-134`) reads `getCache('data-store/manifest')` and enumerates `Object.keys(manifest.files)` for the newest `ktc/snapshot-<date>.json`. ``
**Mirror emitted (CR-04, verbatim head):** *"New families are additive and need no app change (the app
already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` /
`inProgress` is breaking and needs both repos."* The new reader enumerates `manifest.files` keys by the
`snapshots/<date>.json` path template. Renaming the snapshot path breaks it silently: the frozen prior
degrades to live, flagged `'no-snapshot'`.

### 9.5 CR-21 — two edits (a new reader of the in-progress file)
1. **App side:** after `…and its sole consumer, `src/components/market/Market.jsx`'s In-season column set` append
   `` ; `buildScoringPosteriors` and the `usableLiveSeason` copy in `src/utils/inSeasonScoring.js` (read `season`, `complete`, `gamesPlayed`, `fantasyPoints`, `scoringBasis` off the live file; since in-season-evidence-2b-1 the output reaches only the snapshot's per-player `inSeason` field), and in `src/App.jsx` the `liveSeasonUsable`/`scoringPosteriors` memos and the frozen-prior effect (reads `currentSeasonTotals.season`) ``
2. **Triggers:** after `` `src/components/market/Market.jsx` (the `currentSeasonTotals` prop) `` insert
   `` , `buildScoringPosteriors`/`usableLiveSeason` in `src/utils/inSeasonScoring.js`, the `liveSeasonUsable`/`scoringPosteriors` memos and the frozen-prior effect in `src/App.jsx` ``
The Invariant's "must never let it reach the scoring pipeline" stays true in 2b-1. 2b-2 amends it.
**Mirror emitted (CR-21, verbatim first sentence):** *"If the weekly job stops running, starts writing
partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no
way to tell on `/teams` or `/portfolio`** — it will render a half-season's rates as though they were a
season's, with no error and no test failure."* Add for the data side: `gamesPlayed` is now also every
snapshot `inSeason` record's `n`.

### 9.6 CR-22 — stale anchors refreshed; Mirror emitted (the snapshot-write effect is edited)
Replace `` , `:59-60`) `` with `` , `:61-62`) ``, `` (`:717-738`) `` with `` (`:731-751`) `` and `` (`:700`) ``
with `` (`:713`) `` — **then Session 2 re-greps all three after its own App.jsx edits and writes the
post-change lines** (§5 shifts them). Anchors checked unique 2026-09-26.
The effect that owns the `[snapshot] wrote` marker gains a settle gate (`inSeasonSettled`). The marker
text, cache key and record shape are unchanged. **Mirror (verbatim):** *"Before renaming or
restructuring any of the App-side surfaces above, check whether `.github/workflows/daily-snapshot.yml`
depends on it — it drives a headless build of this app and reads exactly these surfaces, with no test
or type system connecting the two repos. **Nothing app-side fails when this drifts** — a broken surface
shows up only as a green app build with no committed snapshot, silence in the data repo's own scheduled
Action."* Data-side note: the marker now also waits for the live-season load and one manifest read.
Both always settle.

### 9.7 CR-18 — no text edit; Mirror emitted (`docs/signal-registry.md` gains a §3C row, §8)
The row edit is the §8 text. It adds no data-side ingest. **Mirror (verbatim tail):** *"**Nothing fails
in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory
that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions
months later."*

### 9.8 CR-25 — new entry (append after CR-24, inside the region). Supersedes companion §C's draft
```
#### CR-25 · In-season evidence definitions and fitted k *(new — in-season-evidence-2a-backtest.md, 2026-09-26; pinned by in-season-evidence-2b-1)*
- **App side:** `src/utils/inSeasonConstants.js` (every pinned `K_*`, `SORT_MEASURE`, `PRIOR_MODEL_FROM`, `IN_SEASON_CONSTANTS_SOURCE`) and its provenance copy `src/__fixtures__/inseason-constants-2026-09-26.json` (byte-identical to the data file its `source` names; re-derived by `src/__tests__/inSeasonConstants.test.js`); `src/utils/inSeasonScoring.js` — `classifyInSeasonPopulation` (rookie route = `computeNextSeasonProjection`'s own `qualifying.length === 0 || yearsExp <= 1`; ROOKIE0/ROOKIE1P split on any earlier careerStats row; standard/SHORT on `careerStats[dataSeason]` gp ≥ 8) and `posteriorOf` (n = live `gamesPlayed`; n = 0 returns the prior); `src/utils/inSeasonEvidence.js` — `opportunitiesPerGame` (the opportunity definition), `MIN_PRIOR_GAMES`, `MIN_BASELINE_GAMES`, `MIN_BASELINE_OPP`, the baseline and new-role rules and the sort shift (its own view-only `K_*` are the study values and retire when in-season-evidence-2b-2 moves the tab onto the pinned constants)
- **Data side:** `lib/inSeasonEvidence.mjs` (`IN_SEASON_DEFAULTS`, `opportunities`, `buildCheckpoints`, `fitK`, `pinK`, `classifyArm`), `scripts/inseason-run.mjs` (`runInSeason`, `runArmS`, `enumerateCandidates`, `buildConstants`, `writeInSeasonArtifacts`), `bin/backtest.mjs --inseason`, `backtests/<date>-inseason-constants.json`, `test/inseason.test.mjs`. (`PHASE1_K` in `lib/inSeasonEvidence.mjs` is a **frozen historical comparator** — Phase 1's shipped values — and is never re-mirrored.)
- **Invariant:** the backtest's evidence definitions (opportunity keys, n = games played, the baseline thresholds and lookback, the population routing) equal the app's, so the k it fits transport; every `K_*` in `src/utils/inSeasonConstants.js` equals the pinned `k` of the constants file its fixture's `source` names, re-derivable from that fixture's sufficient statistics by the file's own `fit` rule; and `PRIOR_MODEL_FROM` is the first capture date on the current projection model — a frozen prior pins the model, not just its inputs, so the constant is bumped in the same commit as any change that moves `projectedPPG`/`projectedGames` (guarded app-side by `src/__tests__/priorModelFrom.test.js`), and when those k were last pinned it equalled the first capture on the model they were fitted against.
- **Direction:** both
- **Triggers:** `src/utils/inSeasonConstants.js`, `src/__fixtures__/inseason-constants-*.json`, `classifyInSeasonPopulation` and `posteriorOf` in `src/utils/inSeasonScoring.js`, `src/utils/inSeasonEvidence.js`  ‖  `lib/inSeasonEvidence.mjs`, `scripts/inseason-run.mjs`, `bin/backtest.mjs`, `test/inseason.test.mjs`
- **Mirror:** An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior, the pin rules in `buildConstants`) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM` (a frozen prior captured before the current model is refused — CR-26). An app-side model change bumps `PRIOR_MODEL_FROM` at once; if it also changes a CR-15-mirrored factor, the k are stale until re-fitted — a bump is not a re-fit. The Q4 NO-GAIN pooled-pin *decision* (own k BEATS pooled out of sample) is taken and tested data-side; the app's provenance test checks only which fixture cell each `k` re-derives from. These k partly compensate for the projection's known optimism (c ≈ 0.80–0.86): correcting that optimism is a re-fit, not a re-pin. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another.
```

### 9.9 CR-26 — new entry (append after CR-25)
```
#### CR-26 · Snapshot read-back (frozen in-season prior) *(new — in-season-evidence-2b-1, 2026-09-26)*
- **App side:** `src/api/frozenPrior.js` `loadFrozenPrior` (via `listManifestPaths('snapshots/')` and `tryDataStore('snapshots/<date>.json', { validate: isValidProjectionSnapshot })` in `src/api/dataStore.js`), and the pure gates in `src/utils/inSeasonScoring.js` — `selectFrozenPriorCandidate` (latest `snapshots/<date>.json` with date strictly before Sleeper's `season_start_date`; refused before fetch when earlier than `PRIOR_MODEL_FROM`, the first capture on the current projection model), `checkFrozenSnapshot` (refuses a different `leagueId`, a `targetSeason` other than the live season, and any `projectionBasis` other than `'league'`, absent included), `trimFrozenSnapshot` (reads `players[id].projection.projectedPPG`, `leagueId`, `targetSeason`, `projectionBasis`, `capturedAt`)
- **Data side:** `snapshots/<date>.json` (served path template) and its `manifest.json` entries, `scripts/register-snapshots.mjs` (`registerSnapshots`), `lib/snapshot-capture.mjs` (`evaluateSnapshotRecord` — which daily captures get committed), `.github/workflows/daily-snapshot.yml` (the capture cadence), `bin/import-snapshot.mjs`
- **Invariant:** a committed snapshot is immutable (Invariant 5), registered in `manifest.json` under `snapshots/<YYYY-MM-DD>.json` keyed by UTC capture date with `inProgress: false` (the app reads it without `allowInProgress`, so a `true` flag reads as unavailable), carries top-level `leagueId`, `targetSeason`, `projectionBasis` and `capturedAt`, carries `players[id].projection.projectedPPG` as the unmodified pipeline prior, and has a `schemaVersion` at or below the app's `MAX_SUPPORTED_SCHEMA`. The app reads the latest capture dated before kickoff as the frozen in-season prior and degrades every failure to the live prior with a stated reason — never to "no posterior".
- **Direction:** data→app
- **Triggers:** `src/api/frozenPrior.js`, `listManifestPaths` and `isValidProjectionSnapshot` in `src/api/dataStore.js`, `selectFrozenPriorCandidate`/`checkFrozenSnapshot`/`trimFrozenSnapshot` in `src/utils/inSeasonScoring.js`  ‖  `scripts/register-snapshots.mjs`, `lib/snapshot-capture.mjs`, `.github/workflows/daily-snapshot.yml`, `bin/import-snapshot.mjs`
- **Mirror:** This is the one place the app reads its own captures back. Renaming the `snapshots/<date>.json` template or its manifest key, re-keying captures off UTC date, rewriting a committed snapshot, dropping `leagueId`/`targetSeason`/`projectionBasis`, or moving `projection.projectedPPG` silently turns every frozen prior into the live one (flagged `no-snapshot`, `league`, `season` or `basis`) — nothing errors. A snapshot `schemaVersion` bump above the app's `MAX_SUPPORTED_SCHEMA` makes `tryDataStore` refuse the file (flag `unavailable`): raise the app ceiling first (data CLAUDE.md Invariant 4, which since this entry no longer exempts snapshots). A capture gap before kickoff is tolerated by design (latest-before rule); a capture gap spanning the whole pre-kickoff window leaves the season unfrozen. A frozen prior pins the projection model: a capture dated before the app's `PRIOR_MODEL_FROM` (CR-25) is refused, so an app model change after kickoff unfreezes the rest of that season rather than keeping a stale prior. The data side needs no action for that — it is decided by the app constant against the capture date.
```
**Data side** of CR-26 names only its own files. Session 1 checked that `registerSnapshots` and
`evaluateSnapshotRecord` exist as whole words, so data `test/registry.test.mjs` resolves them.

### 9.10 Checked, not fired
- CR-02: no cross-row scan of `careerStats` or live rows. Only per-id reads.
- CR-14: `calculateFantasyPoints` is untouched.
- CR-16: no team join.
- CR-17: no KTC read.
- CR-24: no sentinel, path or `sed` line change.
- CR-07/10/11/19/20/23: untouched.


### 9.11 Emitted Mirrors — full current text (plan review: no truncation)
Emitted verbatim in this slice's output, as the registry reads **before** this change (after-edit
additions are in the sections above):
- **CR-01:** "State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version." — answer: no bump (v3); new per-player `inSeason`; the independence sentence is replaced (§9.3).
- **CR-04:** "New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** […the field continues verbatim through "…a future `inProgress: true` on the live advstats file would still render."]" — addition: `listManifestPaths` enumerates `snapshots/`, which must stay `inProgress: false`.
- **CR-09:** the field as it reads after §9.2's replacement.
- **CR-15:** the full field, ending "…and the boundary gets a row in `grading/anchor-policy.md`.", plus §A item 3's appended sentence.
- **CR-18:** "This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. […verbatim…] The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable." — the row edit is §8's §3C row.
- **CR-21:** the full field, from "If the weekly job stops running…" to "…its `inProgress` flag is accurate, not a mislabel."
- **CR-22:** the full field, from "Before renaming or restructuring…" to "…a rename breaks a manual, watched run rather than a silent daily one."

Session 2 pastes each full field verbatim from `docs/cross-repo-registry.md` into its hand-back's
Cross-repo section. The bracketed ellipses above mark text copied verbatim, not omitted content.
---

## 8. Docs (same change)
- `docs/nav/utils.md` / `docs/integrations.md` state the §0 design rule (a freeze pins the model; bump `PRIOR_MODEL_FROM` with any output-moving model change).
- `docs/nav/utils.md`: rows for `inSeasonConstants.js` and `inSeasonScoring.js` (exports, "2b-1: snapshot
  field only; 2b-2: the scoring seam"). Amend the `projectionSnapshot.js` row with the `inSeason` field.
- `docs/navigation.md` (`src/api/` table): a `frozenPrior.js` row. Add `listManifestPaths` and
  `isValidProjectionSnapshot` to the `dataStore.js` row.
- `docs/integrations.md` → *Projection snapshots*: the `inSeason` per-player field (shape per §3.5,
  presence rule, v3 unchanged). A new subsection *Frozen-prior read-back* stating the mechanism only
  (selection rule, gates, cache, the settle gate). Per the availability-claims rule, never say
  whether a frozen prior exists today. *Data store integration → Exports*: the two new exports.
- `docs/architecture.md` → *playerRows pipeline*: the `scoringPosteriors` memo after
  `seasonProjections`, feeding only the snapshot effect. The two new state slices go in the
  `useState` inventory.
- `docs/signal-registry.md` §3C: a new row — *In-season posterior (`players[id].inSeason`)* ·
  ephemeral capture · `inSeasonScoring.buildScoringPosteriors` → snapshot · snapshots from this change
  on · **Ephemeral as-scored** (frozen/live prior choice, live evidence at capture) · "grading input
  (ROS and next-season horizons); feeds no projection or score until 2b-2". Amend the Fantasy-scoring-
  core row's in-progress clause to name the new reader (snapshot capture only). Amend the Projection-
  output row: "`projection` stays the prior".
- `CLAUDE.md`: the registry sentence "all 24 `CR-NN` entries" → "all 26". Add
  `inseason-constants-2026-09-26.json` — the in-season k constants' provenance oracle — to the
  `src/__fixtures__` row. The file is at 24,728 of 25,000 bytes. If the size test goes red, shorten that
  row's existing wording in the same commit. Never raise the ceiling.
- `grep -rn "PROVISIONAL(" src/` goes in the hand-back. This slice adds no new tag. Phase 1's tags in
  `inSeasonEvidence.js` stay until 2b-2.

## 10. Data-repo backlog (`.claude/tasks/data-repo-backlog.md`, same change — done-definition 7)
- **D-49 · Registry sync — in-season 2b-1 (CR-01/04/09/15/21, new CR-25/CR-26).** Blocks: the daily
  mirror run (red until synced). Found by this slice's registry commit (record its SHA). Steps are
  §9's route paragraph. **Also owed data-side:** the decision-level two-branch unit test of the Q4
  NO-GAIN pin in `buildConstants`, keep-own branch included (2a verification record, 0 of 14 cells
  took it). The app pins only the outcome contract (§2.3). Also: the README snapshot section gains
  `players[id].inSeason`, and Invariant 4's snapshot clause is corrected (CR-01/CR-26 Mirrors).
- **D-50 · Record a model marker in snapshots (non-blocking).** `PRIOR_MODEL_FROM` is a date because
  snapshots carry no model version. A version field would let the frozen-prior gate compare models
  directly. That is an app-side capture change first, so it is recorded for the next CR-01 slice, not
  owed by the data repo now.

