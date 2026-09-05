# D1a — snapshot envelope `inputStatus` (schema 2→3)

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-05). **Slice:** D1a of the stellar-data batch (`analysis/data-stellar-batch-brief.md` Arc A). **Blocks:** D1b (server-side capture asserts on `inputStatus` before committing), and the grading exclusion rule in D6.

**Base:** `b0e97cb` on `claude-md-slimming`. The three commits below it (`c1ce924`, `7613ceb`, `b0e97cb`) are assumed present; Step 0's dependency note is satisfied by them.
**Plan gate:** plan-reviewer run 2026-09-05. Eleven flags, all folded into this file. Two of its findings landed as source fixes outside this slice rather than as plan changes, and are recorded in *Out of scope*.

**Goal.** Label every gated projection input in the daily snapshot envelope, so a snapshot captured while an input silently failed is *detectably* wrong rather than *invisibly neutral*. Three such windows are already in the series (2026-07-16→18 shares, 2026-09-03 college, draft capital 2026-05-19→09-05); each was found by hand, weeks late. The write gate is **not** tightened — a failed load still writes, it is now labelled.

**Do not change what gets written or when.** `shouldWriteProjectionSnapshot` keeps its settled-not-non-null semantics (`.claude/tasks/snapshot-input-gating.md`). Forward capture beats purity; this slice only adds the label.

---

## Step 0 — anchors re-verified at HEAD (do not re-derive)

Verified 2026-09-05 against app `b0e97cb` and data `323a2b6`. The brief's line anchors were starting points; these are the checked facts. Re-check any anchor before editing at it — three commits landed on the app side between the brief and this base.

| Claim | Verified |
|---|---|
| Envelope is `schemaVersion: 2` with `capturedAt, targetSeason, currentSeason, scoringBasis, scoringSettings, leagueId, teamDepthCharts, players` | `src/utils/projectionSnapshot.js:190-200` |
| `factors.nflDraftMatchSource` and `factors.collegeContribution` already recorded | `src/utils/seasonProjection.js:48,68,216`; asserted in `src/__tests__/factorsSchema.test.js:93` — **no work needed** |
| Career loader already classifies each season's path | `getSeasonTotals` `onPath?.('cache-hit'\|'data-store'\|'live-api')`, `src/api/sleeperStats.js:120,131,155,233` |
| Dynamic draft-year list and `nfl-draft/years` cache exist | `src/api/nflDraft.js:41-58,117-121` |
| *(sibling repo, observation only — see correction 3)* the registrar accepts any numeric `schemaVersion` | `scripts/register-snapshots.mjs:65,92`; `shouldSkipSnapshot:32-36` compares, never gates |

**Four corrections to the brief. Implement this file, not the brief, where they differ.**

1. **`ktcMap` is a `Map`, not an object.** The brief specifies `Object.keys(ktcMap).length`, which returns `0` for every snapshot. Use `ktcMap.size`. Confirmed at `src/utils/ktcMatch.js:65,92,134` (returns `new Map()`) and consumed as `ktcMap?.get(playerId)` at `src/utils/projectionSnapshot.js:77`.
2. **The draft-year exclusion rule is off by one.** The brief writes "`detail.years` lacking `targetSeason−1` → exclude rookie-path rows". `targetSeason = currentSeason + 1`, and a rookie playing the target season was drafted **in** that season: today `careerStats` ends 2025, `targetSeason` is 2026, and the class that needs draft capital is the 2026 class. `targetSeason−1` would check the wrong class. Record the raw `detail.years` list and document the rule as `detail.years.includes(targetSeason)`, with the January–April exception noted (the class has not been drafted yet, so its absence is correct, not a defect).
3. **The brief's data-side ask is probably wider than the work.** Reading the sibling tree at `323a2b6` suggests the registrar takes any numeric `schemaVersion`, the importer only checks that registration succeeded, and neither `scripts/grade-snapshot.mjs` nor `lib/panel.mjs` reads the snapshot's version at all. **This is an observation, not authority, and it does not narrow anything.** The registry's entry-format rule is explicit: the far side of `‖` is frozen authority, *"kept correct by the both-repos-same-change rule — never by re-deriving them at review time"*. So CR-01's Mirror text stands exactly as written and Session 2 emits it unchanged. Carry the observation to the data-repo backlog as a *hint to check first*, phrased as such. If it holds, that session closes the item cheaply; if it does not, the Mirror already told it what to do. Do not let this note shrink the hand-off.
4. **`inputStatus.college.loaded` must test non-empty, not merely non-null.** `getBulkPlayerStats` can return an empty or null pivot from a bad cache entry without throwing — that is exactly the 2026-09-03 failure mode the `cfbd-players-v2` namespace bump was cut for (`src/api/cfbd.js:15`, and `normalizeCollegeStats:55`). Gate on `count > 0` per year × category.

**Dependency — satisfied, recorded for the audit trail.** `inputStatus.nflDraft.detail.years` is meaningless against the old hard-coded `DRAFT_YEARS = [2017…2024]`, so this slice depended on the dynamic draft-year fix (review §7.6/§7.7) landing first. It was uncommitted in the working tree when this file was first written; it is now `c1ce924`, with the college cache-shape fix at `7613ceb` and the export-route repair at `b0e97cb` behind it. Nothing to do here — start from a clean tree at `b0e97cb`.

---

## Design — where each field comes from

The builder is pure and receives only what the caller passes. Some of the six entries are derivable from arguments it already has or can cheaply be handed; the rest need data plumbed out of loaders that currently discard it. Split the work that way — §A is an afternoon, §B is the slice.

### A. Derivable inside `buildProjectionSnapshot` — no new App state

- **`depthChart.count`** — count of `players` rows with `depthChartOrder != null`. The players block already records it (`projectionSnapshot.js:88`). Compute after `buildPlayersBlock`, over the snapshot's own player set, not over all of `playerMap`.
- **`ktc.count`** — `ktcMap.size` (see correction 1).
- **`nflDraft.detail.matched`** and **`priorSnapshotTeams.count`** — need `nflDraftMatches` and `priorTeamByPlayer` added as builder args. Both are already App state (`App.jsx:159,179`), and `matchNflDraftToSleeper` returns a plain object, so `Object.keys(...).length` is correct here.
  **Not a one-line call-site change** (an earlier draft of this file said it was, wrongly). The snapshot effect's dependency array at `App.jsx:684-688` carries the *settled flags*, not these two values; the array that lists them is the `playerRowsWithProj` memo's, at `:571`, which is a different array. Add both to the effect's array in the same edit or `react-hooks/exhaustive-deps` fails the lint gate (done-definition item 4). Adding them is safe: the effect is already idempotent per UTC day and re-fires are no-ops.

### B. Needs new plumbing — the real work of this slice

Each of these is loaded, used, and discarded. Add a coverage report alongside the existing result; do **not** widen the existing return shapes that consumers depend on.

1. **College.** `loadCollegeStats` returns `{ receiving, rushing, passing }` keyed by year (`src/api/cfbd.js:139-156`), but `App.jsx:877-883` feeds it straight into `matchCollegeToSleeper` and keeps only `collegeMatches`. Add a second return value or an `onCoverage` callback reporting, per year and category, the player count. New App state `collegeCoverage`. From it derive `loaded` (every `collegeFetchYears(anchor)` year × category has `count > 0`), `count` (Σ of the three categories at the anchor year), and `detail.years` (years with any empty or null category).
2. **Draft.** `loadNflDraftPicks()` returns `{ [year]: DraftPick[] }` and `App.jsx:890-895` keeps only the matches. New App state `nflDraftCoverage` holding the year list and total pick count.
  **Derive it in `App.jsx` from the returned object — do not add reporting inside `loadNflDraftPicks`.** `src/api/nflDraft.js` is a bare file-level CR-06 trigger, and deriving in the caller keeps this slice out of that contract entirely. The returned shape already carries everything needed.
  **`loaded` must count picks, not keys.** There are *two* store-unavailable returns, and only one is empty. `nflDraft.js:103-107` returns `{}` when the year list was never learned, but `:108-113` returns a **fully-keyed object whose missing years are `[]`** when the year list was cached and the store is down. Key presence alone reads as `loaded: true` with a complete-looking `detail.years` and no picks behind it — which would let the documented `detail.years.includes(targetSeason)` rule pass a target class with zero picks. This is the same defect class correction 4 fixes for college, so fix it the same way: `loaded` requires a non-zero pick count for the target year, and `detail.years` lists only years with at least one pick.
3. **KTC rows.** `ktcPlayers.length` is a local inside the KTC effect (`App.jsx:257-266`) — the comment there already flags it as deliberately local. `detail.rows` (500 today) is the number that distinguishes "the name join failed" from "the scrape only covers the top 500", which is the actual bound per review §7.5 item 3. Add `ktcRowCount` state, set in the same `cancelled`-guarded callback as the two existing writes.
  **`rows` and `count` are not comparable without a constant.** The scrape's 500 rows are ≈464 players plus ≈36 pick rows, and `matchKTCToSleeper` drops the pick rows by design (they are what `parseKtcPickRows` exists to parse). So `rows − count` carries a permanent ~36-row floor that is *not* join loss. Either scope `detail.rows` to player rows only, or record both and state the floor in the `docs/integrations.md` paragraph. Pick one and say which; do not leave a reader to discover it from a grading panel.
4. **Career-stats provenance.** `onPath` already emits the right three values per season; `loadCareerHistory` collapses them into `pathCounts` and only logs (`src/api/sleeperStats.js:280,297,302`). Add an optional `onSeasonPath(season, path)` callback and collect it into new App state.

5. **Rejected loaders must still produce a status.** `setCollegeCoverage` and `setNflDraftCoverage` naturally sit in each loader's `.then` (`App.jsx:877-884`, `:888-897`), which is **skipped on rejection** while `.finally` still flips `collegeSettled` / `nflDraftSettled` and lets the write proceed. A thrown CFBD or draft load is the loudest version of the failure this slice exists to label, and it is the one path that would reach the builder with no coverage object at all. Define the null-coverage case explicitly: coverage state `null` means *the loader rejected*, and the builder must emit `{ loaded: false, count: 0 }` for it, distinct from a loader that resolved with partial data. Set it from the `.catch`, or default it in the builder — either is fine, but the envelope must never omit an entry.

**Hazard — do not put provenance on `careerStats`.** Twenty-three call sites do `Object.keys(careerStats).map(Number)` to derive the season list, including the snapshot effect itself (`App.jsx:667`). A non-numeric key becomes `NaN`, sorts last, and silently becomes `currentSeason`. Provenance travels in its own state, never as a key on the season map. Same reason `loadCareerHistory`'s return shape stays exactly as it is.

### C. Envelope shape

`schemaVersion: 3`. Add one top-level `inputStatus` key; change nothing else. Every entry is `{ loaded: boolean, count: number|null, detail?: object }`:

- `college` — `detail.years`: years with any null or empty category.
- `nflDraft` — `count`: total picks; `detail.years`: years with at least one pick (see §B2 — never bare key presence); `detail.matched`: matched players.
- `ktc` — `count`: matched players; `detail.rows`: scraped rows.
- `priorSnapshotTeams` — `count`: players with a prior team; `loaded: false` when `priorTeamByPlayer` is null (no prior snapshot — legitimate, not a defect; say so in the doc).
- `depthChart` — `count` only.
- `careerStats` — `detail.seasons`, and `detail.provenance` as `{ [season]: <path> }`. Two things to pin here, both in the JSDoc:
  - **Key type.** `Object.keys` yields strings while the loader's season variable is a number, and test 7 asserts the two agree. Use strings in the envelope — JSON object keys serialize to strings regardless, so anything else is a lie the round-trip corrects — and convert once at the boundary rather than letting both forms circulate. This is the same coercion the hazard note above is about.
  - **Path vocabulary.** Either map the loader's `'data-store'`/`'cache-hit'`/`'live-api'` to `'store'`/`'cache'`/`'live-api'` at the boundary, or carry the loader's own three strings through untouched. Pick one. Two vocabularies for one fact is how a grading panel silently splits a cohort.

v3 is additive. Every v2 field keeps its name, type and meaning, and v2 files stay valid with no migration.

---

## Cross-repo impact

This slice touches **four** registry entries, not one. Emit all four Mirror blocks; CLAUDE.md's rule is that quoting the text *is* the deliverable, so none of these may be summarised.

### CR-01 · Projection snapshot envelope — the primary contract (`Direction: app→data`)

> **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

Standing as written, per Step 0 correction 3. `scoringSettings` is untouched by this slice, so the R3-FIT / CR-15 half of that text carries no work here — state that in the hand-back rather than leaving it ambiguous, but do not delete it from the quoted block.

### CR-05 · CFBD statType keys — `classifyKey` and the college loaders

> **Mirror:** Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it: `YDS`/`TD`/`ATT` are read by name in **both** `src/utils/collegeMetrics.js:69-124` (dominator rating, QB college score) **and** `src/api/cfbd.js` `computeTeamTotals:115` (team YDS/TD denominators) — renaming either nulls a rating with no error and no test failure. (Note the name list in `collegeMetrics.js:57-59` is a *comment* recording the confirmed 2023 field names; it is documentation, not a read.) **E2 Phases A/B (2026-09) changed the container and the value type** (long-form rows → a pivoted envelope; `stat` string → number) — that change is complete on both sides as of this entry; a *further* shape change is still both-repos, the same as any statType change.

Reached through `classifyKey` in `src/utils/exportData.js`, a listed CR-05 trigger, and through the college coverage work in §B1. This slice changes **no** `statType` key and no served container shape, so the coordination this text is about carries no data-side work. Record that conclusion; do not skip the block.

**`[registry-stale]` — report, do not fix.** CR-05's app-side triggers name `normalizeCollegeStats` / `pivotStatRows` / `computeTeamTotals` but omit two live producers of the served college shape that this slice reads: `getBulkPlayerStats` (`src/api/cfbd.js:61`, the sole `tryDataStore` + `isValidCFBDRows` fetch path) and `loadCollegeStats` (`:139`). The entry's own App-side prose already refers to "every `getBulkPlayerStats` exit" while its trigger list drops it. Flag it to the human in the hand-back. Session 2 does not edit the registry.

### CR-06 · nflverse roster & draft — only if §B2 is done wrong

> **Mirror:** Shape or sparsity-constant changes land in both repos together. **`MIN_ROSTER_IDS` is declared twice** — `lib/nflverse.mjs:18` (data) and `src/api/nflRoster.js:38` (app) — with no shared source; editing one and not the other is the whole failure mode this entry exists for. The app has no live fallback for either family — it must get them from the store.

`src/api/nflDraft.js` is a bare file-level trigger. §B2 now says to derive draft coverage in `App.jsx` from the returned object, which keeps this slice out of the file entirely and makes this block informational. **If implementation finds it must touch `nflDraft.js` after all, stop and report** — that is a scope change into a `both`-direction contract, not something to absorb quietly.

### CR-17 · KTC value snapshots — the §B3 call site

> **Mirror:** Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family degrades to empty with **no error and no test failure**. **Updated, dp-v2 Slice 5a:** the earlier note here said the Explorer's ~30-day KTC Δ cell was the only other thing that degraded and that it was gone, making `ktcHist*` "the only thing that degrades" — that is now stale twice over. First, `ktcHist*` was never only a diagnostic: `market/Market.jsx`'s TREND gutter is a second, real rendering consumer of both `computeKtcSignals`'s output and the raw `series`. Second, and more than bookkeeping, **the failure mode itself changed**: before this slice a bad/empty snapshot produced a silent gap in `factors` with no visible symptom anywhere; now it also produces a **visibly blank TREND column on Market, the app's primary surface** (every row's gutter renders `—`, the `band: 'none'` state) — something a user watching the app would actually notice, not just something a diagnostic dump would show. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two scrapers are independent implementations of one shape, so a KTC markup change can break them separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as if it were good data.

§B3 edits the KTC effect at `App.jsx:257-266`, whose `parseKtcPickRows` call site is a listed CR-17 trigger, and `detail.rows` is a new app-side recording of the raw scrape's row set — the row set this entry's Invariant pins. This slice **reads** `ktcPlayers.length` and changes no record shape, no path and no validator, so no data-side work follows. That is the conclusion to record; the ~36 pick-row floor in §B3 is the same fact seen from the app side.

### Backlog and new couplings

Append to `.claude/tasks/data-repo-backlog.md` in the same change, per CLAUDE.md done-definition item 7, marked **non-blocking** — the app can ship v3 before the data repo acts. The entry carries CR-01's Mirror ask (registrar, grader, README), the v3 fixture, the `data-catalog.md` snapshots row, and Step 0 correction 3's observation phrased as a hint to check first, not as a narrowed scope.

No new coupling is created, so no `CR-22` entry. `docs/signal-registry.md` needs no new **row** — `inputStatus` is a field on an existing envelope, not a new served family — but it does need an edit; see the docs list below.

## Docs/README updates

- **`docs/integrations.md` → Projection snapshots (`:397`).** Add a "Schema v3 (this change)" paragraph in the style of the existing v2 one: what `inputStatus` records, that the write gate is deliberately unchanged, and that `loaded: false` still writes. State the two legitimate-`false` cases explicitly — no prior snapshot (`priorSnapshotTeams`), and a pre-draft target class (`nflDraft`) — so a future reader does not chase them as bugs.
- **`docs/architecture.md` → Smoke-testing the running app (`:247`).** Two lines to the recipe, as the brief specifies: rookie-path rows with `nflDraftMatchSource = 'matched'` > 50, and `inputStatus.college.loaded === true`. Both are console-checkable on the existing `Colts_420_Reloaded` / Dynasty 040 path.
- **`docs/projection.md` → §5h (`:89`).** One sentence: the "same player, different projection by cache provenance" caveat is now recorded per season in the snapshot's `inputStatus.careerStats.detail.provenance`, so a graded row can be attributed to its provenance instead of guessed at.
- **`docs/signal-registry.md` → §3C.** No new row, but the section is version-labelled and goes stale on this bump. Three places, not the "three rows" a first pass suggests: the §3C heading itself reads "→ data `snapshots/<date>.json` v2" (`:110`), and two rows carry "v2 snapshots" in their coverage column (`:123,124`) — the scoring-settings row additionally says "snapshot envelope (v2)" in its source column, so that line needs two edits. CLAUDE.md's self-maintenance rule requires the registry updated when a change touches an ephemeral capture or its coverage status, and the envelope those rows describe becomes v3. Update the heading and all four cells.
- **`docs/cross-repo-registry.md` → CR-01.** Update the App-side line from `schemaVersion: 2` to `3` and name `inputStatus` in the Invariant. This file is mirrored in the data repo — do not edit the sibling from this session; the backlog entry above carries it.

---

## Tests to add

`src/utils/projectionSnapshot.test.js` (293 lines today — extend, do not restructure):

1. Envelope is `schemaVersion: 3` and every v2 field survives with its v2 value, from the existing fixture inputs.
2. All six `inputStatus` entries present, each with `loaded` boolean and `count` number-or-null, and the documented `detail` keys where specified.
3. `ktc.count` equals `ktcMap.size` for a non-empty `Map` — the regression test for correction 1. A test built on a plain object would pass while the shipped code returns `0`; build the fixture as a real `Map`.
4. `college.loaded === false` when any year × category has zero players, and `detail.years` names exactly those years. This is the 2026-09-03 reproduction — use a fixture with one empty category in one year.
5. `nflDraft.detail.years` reflects the store's year list, and `loaded === false` on the store-unavailable path (empty `{}`).
6. `priorSnapshotTeams.loaded === false` with `count: 0` when `priorTeamByPlayer` is null, and the snapshot is still built.
7. `careerStats.detail.provenance` carries one entry per season in `detail.seasons`, using the single agreed vocabulary.
8. `nflDraft.loaded === false` on the **second** store-unavailable path: a fully-keyed result whose years are all `[]`. A test that only covers the empty-`{}` path misses the case §B2 calls out.
9. A rejected college or draft loader still produces `{ loaded: false, count: 0 }` in the envelope, with no entry omitted.
10. `shouldWriteProjectionSnapshot` is unchanged: the existing gate tests must still pass untouched. If any needs editing, stop and report — that means the gate moved, which this slice forbids.

`src/api/sleeperStats.test.js` — `onSeasonPath` fires once per season with the loader's classification, and `loadCareerHistory`'s return value is byte-identical to before (guards the 23-consumer hazard).

`src/api/cfbd.test.js` — the coverage report counts players per year × category, and reports a null category as zero rather than throwing.

---

## Out of scope

Server-side capture (D1b), any change to the write gate's timing or predicate, widening the KTC scrape past 500 rows, the rookie-multiplier recalibration from review §7.7, and replacing `nflDraftMatch.js` name matching with crosswalk draft fields (D2 backlog note). Do not touch `src/utils/exportData.js`. The snapshot cache-key format is unchanged, so `classifyKey`'s `projection-snapshots/<date>` route is unaffected by this slice.
**History worth knowing, because an earlier draft of this file got it wrong.** That claim was briefly false: `7613ceb` moved the CFBD namespace to `cfbd-players-v2` while `classifyKey` still matched the old literal, so every college entry silently fell through to the `raw/` catch-all instead of `college/<category>/<year>.json`. It was fixed in `b0e97cb`, which derives the route from the exported `CFBD_CACHE_NAMESPACE` and adds the branch's first test coverage. Mentioned here because §B1 touches the college loaders and a reader may wonder whether the export path is in play. It is not.

## Risks

- **Plumbing four loaders is where scope grows.** If the career-provenance channel (B4) turns out to need more than an added callback, ship the other five entries and record `careerStats: { loaded, count, detail: { seasons } }` without `provenance`. Five labelled inputs beat a stalled slice; note the omission in the hand-back.
- **`loaded` must never gate the write.** The one way to make this slice worse than doing nothing is to let a `false` suppress a snapshot. Re-read `shouldWriteProjectionSnapshot` before touching the effect.
