# Snapshot dynasty-score capture

**Status:** planned (Session 1, 2026-10-18) — awaiting plan-reviewer + Anton's approval.
**Status update:** plan-reviewer round 1 (opus) — four flags folded in (QB in-season wording,
clamp exception, B2 refactor dropped, `MAX_SUPPORTED_SCHEMA` reason corrected).
**Repos:** cross-repo. App edits (source, tests, docs) in `sleeper-dashboard/`; data edits (tests
and docs only — no data-side source change) in `sleeper-dashboard-data/`. Session 2 runs **on sonnet**, started
from the **parent folder** (`../CLAUDE.md` → *Where to start a session*), names the target repo for
every edit, and runs git/npm from inside each repo directory. One commit per repo.
**Scoring-affecting:** no. Capture-only: no change to `projectedPPG`, `computeDynastyScore`, the
dynasty score, `PRIOR_MODEL_FROM`, or the factors contract (82/69 keys).

## Why

The daily projection snapshot does not record the dynasty score. Its KTC-dependent parts (the
Limited-Data KTC rescue, PATH B's KTC influence, `ktcPct`) read a live KTC value that has no
history, so a day's score can never be rebuilt afterwards. Capturing it daily is the only way to
grade it later.

## Shape added (per player, `players[id].dynasty`)

```js
dynasty: null | {
  score:       number,                 // row.dynastyScore.score — post-QB-modifier (final displayed)
  label:       string,
  confidence:  string,                 // 'high'|'moderate'|'low'|'prospect'|'none'
  components:  null | {                // null on the prospect / Limited-Data paths (row has none)
    ageAdjusted:        { value: number, weight: number },
    trajectory:         { value: number, weight: number },
    currentLevel:       { value: number, weight: number },
    reliability:        { value: number, weight: number },
    opportunityQuality: { value: number, weight: number },   // post-modifier value
  },
  qbQualityScore:    number | null,    // row.dynastyScore.signals?.qbQualityScore ?? null
  qbModifierApplied: number | null,    // row.dynastyScore.signals?.qbModifierApplied ?? null (percent, e.g. 7 / -4)
  dynastyScoreBase?: {                 // present ONLY when the row carries dynastyScoreBase with a finite score
    score, label, confidence, components   // same compact rules as above; no qb* fields
  },
}
```

Rules (all in one pure helper, see Step A1):
- **`dynasty: null`** when the id has no row in `playerRows`, the row has no `dynastyScore`, or
  `dynastyScore.score` is not finite (`Number.isFinite`). The key is **always present** on every
  snapshot player entry — deliberately unlike `inSeason`'s absent-never-null rule, so "not
  captured" (pre-change file: key absent) and "no score" (`null`) stay distinguishable.
- A finite score with `components: null` (prospect path `dynastyScore.js:746`, Limited-Data paths
  `:773`/`:803`/`:836`) is captured with `components: null`. The Limited-Data KTC-rescue score
  (`:772`) is exactly the ephemeral case this slice exists for.
- `components` iterates the fixed key list `['ageAdjusted','trajectory','currentLevel','reliability','opportunityQuality']`;
  each entry is a **new object** `{ value, weight }` (only those two fields — `slope`, `percentile`,
  `consistencyScore`, `durabilityScore`, `efficiencyPercentile`, `volumePercentile`, `shareScore`
  are deliberately dropped). A key missing from the row's `components` → that entry `null`.
  Values copied as-is (already rounded at source); no re-rounding.
- `dynastyScoreBase` exists only on QBs while a live in-season level exists (`App.jsx:494`). It
  is the QB's score computed without the live level (the `dynasty.score` beside it has the level);
  neither is QB-modified. Captured with the same compact rules
  (score/label/confidence/components). Absent (not null) otherwise, mirroring the row.
- The row read is `playerRowsWithProj` — already passed as `playerRows` (`App.jsx:861`). Its
  `dynastyScore` is the final pipeline value: post-prospect-level (`App.jsx:605`), post-QB-modifier
  (`playerRowsWithQBMod`), and — in-season — includes the live `inSeasonLevel` for **every**
  position in `IN_SEASON_SCORING_POSITIONS` (QB included: `App.jsx:470-485` passes it to all
  players). For a QB, `dynasty.score` is the level-informed score and `dynastyScoreBase` the
  level-free one (the score the QB-quality firewall feeds downstream).
  **App.jsx needs no change**: the effect already depends on `playerRowsWithProj`.

**Pre-modifier recovery is approximate, by design of the source.** `applyQBQualityModifier`
(`teamContext.js:100`) rounds `qbScore` before storing `qbQualityScore`, rounds the modifier into
`qbModifierApplied`, and rounds/clamps both the new OQ and the new score. Recovering the
pre-modifier score from `score`, `components.opportunityQuality.value`, `qbQualityScore` and
`qbModifierApplied` is therefore approximate, not exact: about ±1 point when nothing clamps.
**Clamp exception:** `newOq = round(clamp(oldOq × modifier, 0, 100))` maps every
`oldOq ≥ 100 / modifier` (≈ 87+ at `qbScore` 100) to 100, and `newScore` clamps at 0/100. In those
cases the error can be 2+ points. A captured `opportunityQuality.value` of 100 (or `score` of
0/100) with a non-null `qbModifierApplied` is the only visible sign that a clamp may have occurred;
the true pre-modifier OQ is unrecoverable there. Accepted as specified; both the ±1 bound and the
clamp exception are documented in Steps B4 and D. Exact recovery would need a pre-modifier OQ
value, which this slice does not add.

## Decisions

### 1. `schemaVersion` — no bump (stays 3)

Data `CLAUDE.md` Invariant 4: bump only on an incompatible layout change. This is additive; every
existing field keeps name, type and meaning. Precedent at v3 with no bump: `projectionBasis`,
`projectionModelFrom`, per-player `inSeason` (app `docs/integrations.md` → *Projection
snapshots*; data `README.md` §snapshots). Every reader ignores unknown per-player keys
(verified below). (The app's `MAX_SUPPORTED_SCHEMA` is already 4, `src/api/dataStore.js:9`, so
the read-back ceiling is not a reason either way.) A bump would make the data gate's
`schemaVersion < 3` floor and every reader's version handling meaningless for an additive key,
and the registration fingerprint (`shouldSkipSnapshot`: recordCount + schemaVersion) would treat
the new version as a content change — cost with no benefit.

**Correction to the request's premise:** the live CR-01 entry
(`docs/cross-repo-registry.md:5-8`) does not carry a "factors keys don't bump" rule and has no
**Mirror** field — the data-side registry mirror was retired (CR-24, 2026-10-17); the registry is
now single-sourced in the app repo. The no-bump rule comes from data Invariant 4 plus the
precedent above. See *Cross-repo impact* for the CR-01 text.

### 2. Data-side commit gate — do **not** require the field

`evaluateSnapshotRecord` (`sleeper-dashboard-data/lib/snapshot-capture.mjs:84`) stays unchanged.

- **Asymmetric loss.** A rejection forfeits that whole day's capture — KTC, depth, status,
  projections — which is the irreplaceable data the gate exists to protect. A missing dynasty
  block is one lost field; a rejected day is every field lost.
- **CR-22.** The daily job builds the app at `inputs.app_ref` (default `main`,
  `.github/workflows/daily-snapshot.yml:12-18`). A `workflow_dispatch` against an older ref, or the
  manual `bin/import-snapshot.mjs` path (which bypasses the gate), produces snapshots without the
  key. A required field would turn an old-ref rerun into a hard failure.
- **Pattern.** The gate checks *inputs* (`inputStatus`), never outputs; the dynasty score is an
  output. A broken dynasty pipeline shows as `dynasty: null` everywhere, which the live check in
  the done-definition catches.

Not gated → no change to `lib/snapshot-capture.mjs` or `scripts/capture-snapshot.mjs`. A test
pins that the gate accepts a record both with and without `dynasty` (Step B1).

### 3. Size impact

Measured against `sleeper-dashboard-data/snapshots/2026-10-17.json`: **3,125,973 bytes**
pretty-printed (`writeJsonStable`, 2-space indent), 1,991,602 minified, **750 players**. (The
request's ~2.2 MB figure predates the `inSeason` block.)

A full `dynasty` block is ~340 bytes minified, ~650–700 bytes at the file's indent depth;
`dynastyScoreBase` adds ~300 / ~550 on the ~30–40 QBs that carry it; `null` is ~15 bytes.
Estimate: **+0.25 MB in IndexedDB (≈ +13%) and +0.5 MB in the committed file (≈ +17%, to ~3.65
MB)**. Acceptable: jsDelivr's per-file limit is far above this; the frozen-prior read
(`frozenPrior.js`) fetches the raw file once and caches only the trim, so the trim and its cache
are unchanged in size; the 30 s `FROZEN_PRIOR_TIMEOUT_MS` race has ample headroom for +0.5 MB.
Session 2 records the real byte delta from the `[snapshot] wrote … (N bytes)` console line in the
hand-back.

## Steps

### A. App — `sleeper-dashboard/src/utils/projectionSnapshot.js`

**A1.** Add an internal (non-exported) pure helper above `buildPlayersBlock`:

```js
const DYNASTY_COMPONENT_KEYS = ['ageAdjusted', 'trajectory', 'currentLevel', 'reliability', 'opportunityQuality']

/** Compact { score, label, confidence, components } from a computeDynastyScore result; null when score is not finite. */
function compactDynastyScore(ds) { … }

/** players[id].dynasty from a playerRowsWithProj row (or undefined). */
function buildDynastyCapture(row) { … }
```

`compactDynastyScore(ds)`: returns `null` unless `Number.isFinite(ds?.score)`; otherwise
`{ score: ds.score, label: ds.label ?? null, confidence: ds.confidence ?? null, components }` where
`components` is `null` when `ds.components == null`, else an object over
`DYNASTY_COMPONENT_KEYS`, each `c == null ? null : { value: c.value ?? null, weight: c.weight ?? null }`.

`buildDynastyCapture(row)`: `const core = compactDynastyScore(row?.dynastyScore)`; if `core` is
null return `null`. Otherwise return `{ ...core, qbQualityScore: row.dynastyScore.signals?.qbQualityScore ?? null,
qbModifierApplied: row.dynastyScore.signals?.qbModifierApplied ?? null }`, plus
`dynastyScoreBase: base` only when `const base = compactDynastyScore(row.dynastyScoreBase)` is non-null.

**A2.** `buildPlayersBlock(seasonProjections, playerMap, ktcMap, scoringPosteriors = null, playerRows = null)`:
build `const rowById = new Map((playerRows ?? []).map(r => [r.player_id, r]))` once before the
loop; in the entry literal add `dynasty: buildDynastyCapture(rowById.get(playerId)),` after
`projection`. Update the JSDoc `@param`/`@returns` to name `dynasty`. Keep `inSeason` handling
exactly as is.

**A3.** `buildProjectionSnapshot`: pass `playerRows` as the fifth argument to `buildPlayersBlock`.
Update its JSDoc line for `args.playerRows` (now also the dynasty-capture source). `schemaVersion`
stays `3`.

**A4.** Fix the wrong comment at `buildTeamDepthChartsBlock` (~line 151):
`// Per-player rows already carry dynasty score / KTC — no need to duplicate at team level.` →
`// Per-player entries carry KTC and the dynasty capture (players[id].dynasty) — not duplicated at team level.`

**A5.** File header: add one line after the `inSeason` sentence — every player entry also carries
`dynasty` (the final dynasty score at capture, compact; `null` when the player has no finite score).

Nothing else in this file changes. `loadPriorSnapshotTeams`, `shouldWriteProjectionSnapshot`,
`writeProjectionSnapshot` are untouched. **Do not touch** `App.jsx`, `inSeasonScoring.js`,
`frozenPrior.js`, `dynastyScore.js`, `teamContext.js`, `seasonProjection.js`.

### B. Data — `sleeper-dashboard-data/`

**B1. Tests only for the gate** — `test/snapshot-capture.test.mjs`: one test — the existing valid
v3 record builder with every player given a full `dynasty` object (and one `dynasty: null`)
returns `{ ok: true }` with `snapshot.players[id].dynasty` passed through unchanged; plus one
asserting the same record with no `dynasty` keys is also `{ ok: true }` (gate does not require it).

**B2. Registration — no change, no new test.** `scripts/register-snapshots.mjs`
`registerSnapshots` reads only top-level `schemaVersion`, `capturedAt` and
`Object.keys(players).length`; no per-player key can reach any of them, so a test with `dynasty`
present would be tautological. Do not refactor it or touch `test/register-snapshots.test.mjs`.
The request's "add tests proving the registration script still works" is answered by this
structural argument, stated in the hand-back. The live check in the done-definition confirms the
first real capture registers.

**B3. Grader** — `test/grade.test.mjs`: load `test/fixtures/grade-snapshot.json`, deep-clone it,
add a `dynasty` object to every player (one `null`); assert
`buildGradeInputFromSnapshot(withKey, outcomes, opts)` deep-equals the call on the original, and
`scoreProjections` of both deep-equal. **Do not edit the fixture file** (other tests pin it).

**B4. Docs** — `README.md` §snapshots: add a `**players[id].dynasty** (still v3 — additive, no bump)`
paragraph next to the `inSeason` one: the shape, the null rule, the approximate pre-modifier
recovery (±1 point unclamped; not recoverable when the modifier clamps OQ at 100 or the score at
0/100), that a QB's `score` carries the live level while `dynastyScoreBase` does not, "the commit gate does not require it; graders ignore it". `data-catalog.md:82` — append
"additive per-player `dynasty` (final dynasty score at capture), no bump" to the schemaVersion line.

### C. App tests (`sleeper-dashboard/`)

**C1.** `src/utils/projectionSnapshot.test.js` — new `describe('dynasty field (via buildProjectionSnapshot)')`:
1. A row with full components + `signals.qbQualityScore: 74, qbModifierApplied: 7` → `players[id].dynasty`
   deep-equals the expected compact object; each component has exactly the keys `['value','weight']`
   (assert `Object.keys`), proving extra component fields are dropped.
2. A row with `dynastyScoreBase` → `dynasty.dynastyScoreBase` present, compact, no `qb*` keys; a row
   without it → `'dynastyScoreBase' in dynasty === false`.
3. Finite score with `components: null` (Limited-Data shape) → captured, `components === null`,
   `qbQualityScore === null`, `qbModifierApplied === null`.
4. `score: null` (N/A shape, `dynastyScore.js:685`) → `dynasty === null`; projection player with
   no matching row → `dynasty === null`; `playerRows: []` → every player `dynasty === null` and the
   key is present (`'dynasty' in entry`).
5. Byte-identity: deleting `dynasty` from every player of the with-rows snapshot deep-equals the
   `playerRows: []` snapshot with `dynasty` deleted — no other field moved (projection,
   ktc, inSeason, teamDepthCharts' players aside, envelope). Note `teamDepthCharts` depends on
   `playerRows` via `buildTeamDepthChart`; compare `players` blocks only for this assertion.
6. Isolation: the captured object is not the row's object (`!==`) and mutating it does not
   change the row.
7. `schemaVersion` stays `3`.

**C2.** `src/utils/inSeasonScoring.test.js` → `describe('trimFrozenSnapshot')`: a snapshot whose
players carry `dynasty` (and a `dynastyScoreBase`) trims to a value deep-equal to the same snapshot
without them.

**C3.** `src/__tests__/qbFrozenPriorRollover.test.js` (already mocks `tryDataStore`): one test —
`loadFrozenPrior` with `rawCapture()` augmented with `dynasty` on every player returns the same
`{ status, players, starterPPG, qbChain }` as the un-augmented capture; and
`isValidProjectionSnapshot` (from the real `dataStore`, imported via `vi.importActual`) accepts the
augmented object. If `vi.importActual` is awkward in that file, put the validator assertion in
the nearest `dataStore` test file instead — report which.

**C4.** `src/utils/teamChange.test.js` → `describe('loadPriorSnapshotTeams')`: a prior record whose
players carry `dynasty` (incl. `null`) yields the identical `{ [pid]: nfl_team }` map.

### D. App docs (`sleeper-dashboard/`)

- `docs/integrations.md` → *Projection snapshots*: add a `**dynasty** (per-player, still
  schemaVersion: 3)` paragraph after the `inSeason` one — shape, always-present/null rule, source is
  `playerRowsWithProj` (final, post-modifier, and in-season-informed for every in-season scoring
  position, QB included), `dynastyScoreBase` presence (QBs only: the level-free score), approximate
  pre-modifier recovery with the clamp exception, the gate does not require it. Mechanism-only
  phrasing (`docsAvailabilityClaims.test.js`).
- `docs/signal-registry.md` §3C: add `dynasty` to the per-player shape sentence
  (`{ nfl_team, status, depthChartOrder, ktc, projection, dynasty, inSeason? }`) and one new row:
  *Dynasty score at capture (`players[id].dynasty`)* · ephemeral capture · `playerRowsWithProj[].dynastyScore`
  → snapshot · snapshots from this change's first capture · **Ephemeral** (KTC-dependent paths
  cannot be rebuilt) · capture-only (grading input; read by nothing in the app).
- `docs/nav/utils.md` `projectionSnapshot.js` row: "Every player entry carries `dynasty` (compact
  final dynasty score; `null` when none)."
- `CLAUDE.md`: no change needed (Invariant *Ephemeral inputs must be snapshotted* already covers it;
  stays under 25,000 bytes).

## Cross-repo impact

- **CR-01 · Projection snapshot envelope** — touched (App site `projectionSnapshot.js`
  `writeProjectionSnapshot`'s output). Data sites read live: `lib/snapshot-capture.mjs`
  `evaluateSnapshotRecord` reads `schemaVersion`, `inputStatus.*`, `targetSeason`, and
  `Object.keys(players).length` — never a per-player field; `scripts/grade-snapshot.mjs`
  `buildGradeInputFromSnapshot` reads only `players[id].projection` (+ `teamDepthCharts` via
  `buildPositionMap`). Neither reads `dynasty`; both are pinned by tests B1/B3. **Entry text after
  this change — unchanged** (no Mirror field exists since CR-24's retirement; this is the full entry):

  ```
  #### CR-01 · Projection snapshot envelope
  - **Invariant:** The v3 envelope the app writes (`targetSeason`, `scoringSettings`, `inputStatus`, `projectionBasis`) is what the data gate and grader read.
  - **App:** `src/utils/projectionSnapshot.js` (`writeProjectionSnapshot`)
  - **Data:** `lib/snapshot-capture.mjs` (`evaluateSnapshotRecord`); `scripts/grade-snapshot.mjs` (`gradeSnapshot`)
  ```

  Not amended: the invariant names what the data side *reads*, and nothing on the data side reads
  `dynasty` yet. The future slice that grades the dynasty score creates that read and amends CR-01
  then.
- **CR-22 · Data repo executes the app** — not changed: no `localStorage` key, boot path,
  `[snapshot] wrote` marker or IndexedDB layout moves. The marker's byte count grows; nothing parses it.
- **CR-26 · Snapshot read-back** — not changed: snapshots stay immutable, `inProgress: false`,
  `projection.projectedPPG` raw; `trimFrozenSnapshot` ignores the key (C2/C3).
- **CR-04 · Manifest** — not changed: `recordCount`/`schemaVersion` unaffected (B2).
- No new coupling → no new index entry. `crossRepoIndex.test.js` / data `test/registry.test.mjs`
  unaffected (no site renamed or touched; data-side source is unchanged, only tests and docs).

## Done-definition

App (`sleeper-dashboard/`): `npm test` green (incl. `factorsSchema.test.js` untouched-green,
`docsAvailabilityClaims.test.js`, `crossRepoIndex.test.js`), `npm run lint` 0 problems,
`npm run build` clean. No user-visible surface → no smoke beyond the size probe below.
`grep -rn "PROVISIONAL(" src/` output pasted (expected: unchanged by this slice).

Data (`sleeper-dashboard-data/`): `npm test` and `npm run smoke` green.

**Size probe (Session 2):** start the app from `.claude/launch.json`, let a snapshot write in a
fresh profile (or after deleting today's `projection-snapshots/<date>` record), and report the
`[snapshot] wrote … (N bytes)` line plus a spot check that one QB entry has `dynasty` with
`dynastyScoreBase` (in-season) and one WR has non-null `qbModifierApplied`. Stop the server.

Commit each repo separately; hand back both SHAs, every file touched, every deviation, and what each
new test asserts.

**Live check (after push, first daily capture — Session 1 / Anton):** the first
`snapshots/<date>.json` the `daily-snapshot` Action commits after the app commit lands on `main`
must carry `players[id].dynasty`. From `sleeper-dashboard-data/` after `git pull --rebase`:

```bash
node -e 'const s=require("./snapshots/<date>.json");const v=Object.values(s.players);const d=v.filter(p=>"dynasty" in p),n=d.filter(p=>p.dynasty!==null);console.log({players:v.length,withKey:d.length,nonNull:n.length,base:n.filter(p=>p.dynasty.dynastyScoreBase).length,schemaVersion:s.schemaVersion})'
```

Pass: `withKey === players`, `nonNull` a large majority (expect > 600 of ~750), `schemaVersion: 3`,
and the manifest entry registered `inProgress: false`. Any snapshot dated before the app commit
legitimately lacks the key.

## Risks

- **Capture race.** `playerRowsWithProj` and `seasonProjections` come from the same synchronous
  memo chain, so in the render where the gate opens, `dynastyScore` is consistent with the
  projections. `qbQualityByTeam` empty → no modifier → `qbModifierApplied: null`, which is honest.
- **Market divergence** fields on the row are not captured (out of scope).
- **First-league-of-the-day-wins** applies unchanged; the captured score is that league's.

## Verification (Session 1, 2026-10-18)

- Session 2 hand-back: app `49e2ceb`, data `5201b1a` (was `3680d77` before the push-time rebase). implementation-reviewer (opus, medium) on both
  diffs: one flag, the skipped size probe; capture-only and touch-list conformance confirmed.
- Size probe run by Session 1 (dev server via the parent-folder `.claude/launch.json`, league
  Dynasty 040, fresh profile): `[snapshot] wrote projection-snapshots/2026-10-18 (2176172 bytes)`.
  Same snapshot with `dynasty` stripped: minified 1,967,892 → 2,165,678 (+198 KB, +10%);
  pretty-printed as committed 3,088,870 → 3,467,002 (+378 KB, +12%). Below the plan's estimate.
- Spot checks: 740/740 players carry the key, 0 null (every player had a finite score);
  `schemaVersion` 3; 345 captured with `components: null` (prospect / Limited-Data paths);
  106 QBs carry `dynastyScoreBase` (e.g. id 19: score 33 with level, base 35); 288 rows carry
  `qbModifierApplied`, 153 of them WRs (e.g. id 1479: `qbQualityScore` 58, `qbModifierApplied` 2);
  15 modified rows sit at OQ 100 (the documented clamp case).
- Flag resolved. Remaining: push both repos, then the post-push live check on the first daily capture.
- Pushed 2026-10-19 with `pull --rebase` first, no force: app `49e2ceb` (no rebase needed), data `5201b1a`
  (rebased from `3680d77` onto the 2026-10-18 capture). The first daily capture after `49e2ceb`
  (the 2026-10-19 16:29 UTC run) is the live check; `snapshots/2026-10-18.json` predates the push and
  legitimately lacks the key.
