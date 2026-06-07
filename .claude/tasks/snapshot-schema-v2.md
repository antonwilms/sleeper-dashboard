# Projection snapshot schema v2 — add `targetSeason` + `scoringSettings`

**Model for implementation:** sonnet. **Type:** additive, non-breaking envelope change.

## Summary

Add two top-level fields to the projection snapshot and bump its `schemaVersion` 1 → 2:

- **`targetSeason: number`** — the season the projection forecasts (`currentSeason + 1`). The
  data-repo grading harness currently derives this from a `capturedAt` month heuristic
  (`deriveTargetSeason`), which is fragile (ambiguous for Sep captures, wrong for in-season
  re-projections). The harness already prefers an explicit `snapshot.targetSeason` when present
  (`scripts/grade-snapshot.mjs:171-173`), so storing it directly is consumed automatically with
  **no harness change**.
- **`scoringSettings: object`** — the league's raw `scoring_settings` object, verbatim. All
  current snapshots are `scoringBasis: "custom"`, so without the raw weights, real outcomes can
  only be graded in `half_ppr` (basis-confounded). Capturing the weights now enables future
  in-basis grading (actual custom PPG ≈ season-summed stats · weights, for linear scoring). The
  existing derived `scoringBasis` label stays.

This changes **top-level snapshot envelope fields only** — NOT the per-player `projection` field
(verbatim `computeNextSeasonProjection` output is unchanged). It therefore does **not** touch the
factors contract / `factorsSchema.test.js`. Existing v1 snapshots stay valid and need no migration
(append-only); the harness falls back to its heuristic for them.

### Scope guardrails (do not violate)

- This is independent of `src/api/dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals schema). **Do
  not** touch that constant or conflate the two version numbers.
- Capture `scoringSettings` **verbatim** (`leagueData.scoringSettings`), no normalization — per the
  "Ephemeral inputs must be snapshotted contemporaneously" invariant (CLAUDE.md).
- Do not change the once-per-UTC-day idempotency / skip-if-exists guard in
  `writeProjectionSnapshot`. The new fields are computed in the pure builder; the write path is
  unchanged except for threading one new input through.
- Respect React Strict Mode: the snapshot `useEffect` in `App.jsx` already has a `cancelled` guard —
  preserve it.
- Do not refactor unrelated code (no hoisting the repeated `currentSeason` derivation into a shared
  memo — that is scope creep; mirror the existing local-derivation pattern instead).

---

## Where `currentSeason` comes from

`buildProjectionSnapshot` does **not** currently receive `currentSeason`. It must be threaded in.

The projection pipeline derives it locally inside the `seasonProjections` memo
(`src/App.jsx:882-883`):

```js
const allSeasons    = Object.keys(careerStats).map(Number).sort()
const currentSeason = allSeasons[allSeasons.length - 1]   // last season present in careerStats
```

`computeNextSeasonProjection` forecasts `currentSeason + 1`, so **`targetSeason` must be derived
from the SAME `currentSeason`** to stay consistent with the projections in the same snapshot. Do
**not** substitute `nflState.season` — it can diverge from the last season in `careerStats` and
would silently mis-grade. Mirror the exact derivation above (same `.sort()`, no comparator — the
4-digit year strings sort correctly).

The snapshot writer `useEffect` (`src/App.jsx:945-967`) has `careerStats` in scope (it is App-level
state) and already runs only after `seasonProjections` is truthy — which guarantees `careerStats` is
present. Compute `currentSeason` there and pass it to `writeProjectionSnapshot`.

---

## Data shapes — new top-level snapshot keys

v2 snapshot envelope (new keys marked `← NEW`; everything else unchanged):

```js
{
  schemaVersion:  2,            // ← bumped from 1
  capturedAt:     "2026-05-19T14:23:11.812Z",
  targetSeason:   2026,         // ← NEW: currentSeason + 1 (season the projection forecasts)
  currentSeason:  2025,         // ← NEW: last season in careerStats (the projection's data basis)
  scoringBasis:   "custom",     // unchanged — derived label
  scoringSettings: { rec: 0.5, pass_yd: 0.04, ... },  // ← NEW: leagueData.scoringSettings, verbatim
  leagueId:       "1312015497465716736",
  teamDepthCharts: { ... },     // unchanged
  players:        { ... },      // unchanged — per-player `projection` is verbatim, untouched
}
```

**Decision — store both `targetSeason` and `currentSeason`.** The harness reads `targetSeason`.
`currentSeason` is cheap, documents the projection's data basis, and disambiguates the snapshot for
debugging / future in-basis grading. Both are top-level.

**Defensive guard:** derive `targetSeason`/`currentSeason` only when `currentSeason` is a finite
number; otherwise store `null` for both. This keeps existing direct-call unit tests (which do not
pass `currentSeason`) from producing `NaN`. In practice the App write path always supplies a valid
`currentSeason`.

---

## Function signatures

`src/utils/projectionSnapshot.js` — `buildProjectionSnapshot`:

```js
/**
 * @param {object} args
 * @param {Object} args.seasonProjections
 * @param {Object} args.playerMap
 * @param {Map}    args.ktcMap
 * @param {Array}  args.playerRows
 * @param {Object} args.scoringSettings    leagueData.scoringSettings (stored verbatim + derives basis)
 * @param {string} args.leagueId
 * @param {number} [args.currentSeason]     ← NEW: last season in careerStats; targetSeason = +1
 * @param {Date}   [args.now]
 * @returns {{
 *   schemaVersion: 2,
 *   capturedAt:    string,
 *   targetSeason:  number|null,   // ← NEW
 *   currentSeason: number|null,   // ← NEW
 *   scoringBasis:  string,
 *   scoringSettings: object|null, // ← NEW (verbatim)
 *   leagueId:      string,
 *   teamDepthCharts: Object,
 *   players:       Object,
 * }}
 */
export function buildProjectionSnapshot({ seasonProjections, playerMap, ktcMap, playerRows,
  scoringSettings, leagueId, currentSeason, now }) { ... }
```

`writeProjectionSnapshot(args)` signature is unchanged (same `args` object, now also carrying
`currentSeason`); it passes `args` straight through to `buildProjectionSnapshot`.

---

## Step sequence (implementation)

1. **`src/utils/projectionSnapshot.js` — `buildProjectionSnapshot`:**
   - Destructure `currentSeason` from args.
   - Compute `const targetSeason = Number.isFinite(currentSeason) ? currentSeason + 1 : null`.
     Also normalize `const cs = Number.isFinite(currentSeason) ? currentSeason : null`.
   - In the returned object: set `schemaVersion: 2`; add `targetSeason`, `currentSeason: cs`, and
     `scoringSettings: scoringSettings ?? null` (verbatim — `deriveScoringBasis(scoringSettings)` for
     `scoringBasis` is already computed and stays).
   - Update the JSDoc `@param`/`@returns` block to match (schemaVersion 2 + new fields).
   - The file-top module comment can stay; optionally note v2 captures targetSeason + raw scoring.

2. **`src/utils/projectionSnapshot.js` — `writeProjectionSnapshot`:** no logic change. It already
   spreads `args` into `buildProjectionSnapshot(args)`, so `currentSeason` flows through once the
   caller supplies it. Leave the idempotency / TTL / dateKey logic exactly as-is.

3. **`src/App.jsx` — snapshot writer `useEffect` (currently lines ~945-967):**
   - Inside the async IIFE (before the `writeProjectionSnapshot` call), derive `currentSeason` from
     `careerStats`, mirroring the `seasonProjections` memo:
     ```js
     const allSeasons    = Object.keys(careerStats).map(Number).sort()
     const currentSeason = allSeasons[allSeasons.length - 1]
     ```
   - Add `currentSeason` to the `writeProjectionSnapshot({ ... })` argument object.
   - `careerStats` is App-level state already in closure scope; add it to the effect's guard
     (`if (!careerStats) return` alongside the existing checks) and to the dependency array
     (`careerStats`). Keep the `cancelled` flag handling unchanged.

4. Run the done-definition (below).

No other source files change. `exportData.js` `classifyKey` needs **no** change — it routes by key
prefix (`projection-snapshots/<date>`), not by schema version or field set; the v2 payload exports
to `snapshots/<date>.json` exactly as before.

---

## Docs updates

Apply all of these (this repo):

### 1. `docs/integrations.md` → "Projection snapshots" (around lines 336-346)

- **Line 338** (the intro paragraph) — extend the captured-inputs list. Change:
  > … (player projections, KTC values, NFL depth charts, scoring basis) …

  to:
  > … (player projections, KTC values, NFL depth charts, scoring basis, the league's raw
  > `scoringSettings`, and the forecast `targetSeason`) …

- Add a new bullet after the **Export path** bullet (after line 346):
  > **Schema v2 (this change):** snapshots now carry top-level `schemaVersion: 2`, `targetSeason`
  > (= `currentSeason + 1`, where `currentSeason` is the last season in `careerStats`),
  > `currentSeason`, and `scoringSettings` (the league's raw `scoring_settings`, verbatim — the
  > existing derived `scoringBasis` label stays). v2 is additive: existing v1 snapshots remain
  > valid (no migration; append-only). The per-player `projection` field is unchanged. The data
  > repo's grading harness already prefers `snapshot.targetSeason` over its `capturedAt` heuristic.

### 2. `CLAUDE.md` → Cross-repo contracts → "Snapshot shape" row

The current bullet covers the verbatim `projection` field. Append a sentence to the **Snapshot
shape** bullet under "Cross-repo contracts (with sleeper-dashboard-data)":
  > As of snapshot `schemaVersion: 2`, the envelope also carries top-level `targetSeason`,
  > `currentSeason`, and verbatim `scoringSettings`; bumping the snapshot schema requires mirroring
  > the data repo's README snapshot section and `scripts/register-snapshots.mjs` expectations. This
  > snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals).

### 3. No other app docs need editing

`docs/architecture.md`, `docs/projection.md`, `docs/dynasty-scoring.md`, `docs/ui.md`, and
`README.md` do not describe the snapshot envelope shape — no change. The factors contract /
`factorsSchema.test.js` is untouched (per-player projection shape unchanged), so no factors-doc
edits.

---

## Tests to add

Co-located unit tests in `src/utils/projectionSnapshot.test.js` (extend the existing
`buildProjectionSnapshot` describe block; the file already mocks `./cache`).

1. **`targetSeason = currentSeason + 1` and `currentSeason` stored.**
   - Input: minimal valid args plus `currentSeason: 2025`.
   - Expect: `snap.targetSeason === 2026`, `snap.currentSeason === 2025`.

2. **`schemaVersion` is 2.**
   - Input: any valid args (with `currentSeason`).
   - Expect: `snap.schemaVersion === 2`.

3. **`scoringSettings` stored verbatim (object identity / deep-equal).**
   - Input: `scoringSettings: { rec: 0.5, pass_yd: 0.04, bonus_rec_te: 0.5 }`.
   - Expect: `snap.scoringSettings` deep-equals that exact object (no normalization, extra keys
     preserved), AND `snap.scoringBasis === 'te_premium'` (derived label still computed alongside).

4. **`null` scoringSettings → `scoringSettings: null` and `scoringBasis: 'unknown'`.**
   - Input: `scoringSettings: null`, `currentSeason: 2025`.
   - Expect: `snap.scoringSettings === null`, `snap.scoringBasis === 'unknown'`, `targetSeason === 2026`.

5. **Missing `currentSeason` → `targetSeason: null`, `currentSeason: null` (no `NaN`).**
   - Input: omit `currentSeason`.
   - Expect: `snap.targetSeason === null`, `snap.currentSeason === null` (guards the defensive path).

### Existing snapshot tests whose expectations change

- `src/utils/projectionSnapshot.test.js`, test **"happy path — teamless player excluded;
  schemaVersion=1; capturedAt is ISO string"** (line ~68): the assertion
  `expect(snap.schemaVersion).toBe(1)` must change to `toBe(2)`. Update its title to say
  `schemaVersion=2`. (This is a genuine expected-outcome update, not editing-to-green.)
- The shared test helpers (`scoreFor`, and the `buildProjectionSnapshot` calls in the existing
  describe block) do not pass `currentSeason`; they need no change for the tests they assert, but
  for the two new positive tests pass `currentSeason: 2025` explicitly.

No contract test in `src/__tests__/` changes: `factorsSchema.test.js` (per-player projection shape —
untouched) and `statKeysContract.test.js` (stat-key references — untouched). No integration test
needed; the App.jsx wiring is a one-line input thread covered indirectly.

---

## Cross-repo impact (sleeper-dashboard-data — this session cannot edit it)

Mirror these in the data repo so it accepts and documents v2. **The grading harness needs no logic
change** — `scripts/grade-snapshot.mjs:171-173` already resolves
`targetSeasonOpt ?? (snapshot.targetSeason ?? deriveTargetSeason(snapshot.capturedAt))`, so an
explicit `snapshot.targetSeason` is consumed automatically and `meta.targetSeasonDerived` will
correctly become `false` for v2 snapshots.

1. **`README.md` → `snapshots/<date>.json` section (lines 156-199):**
   - In the JSON example (lines 163-167): bump `"schemaVersion": 1` → `2`; add `"targetSeason":
     2026`, `"currentSeason": 2025`, and `"scoringSettings": { ... }` (raw weights) to the top-level
     envelope alongside `scoringBasis`.
   - Add prose: `targetSeason` is the season the projection forecasts (= `currentSeason + 1`);
     `currentSeason` is the last season in the app's `careerStats`; `scoringSettings` is the
     league's raw `scoring_settings`, captured verbatim to enable in-basis grading of non-`half_ppr`
     leagues. Note v2 is additive and v1 snapshots remain valid (harness falls back to the
     `capturedAt` heuristic for them).

2. **`scripts/register-snapshots.mjs` — shape check (lines 68-70):** **No code change required to
   accept v2.** The minimal check is `typeof parsed.schemaVersion === 'number' && parsed.capturedAt`
   — it gates on *a* numeric schemaVersion, not a specific value, and `recordCount` comes from
   `parsed.players`. A v2 payload passes as-is, and `manifest.json` records
   `schemaVersion: parsed.schemaVersion` (now 2) automatically. Optional hardening only (not
   required): nothing to add. State this explicitly so the implementer doesn't invent a gate.

3. **`CLAUDE.md` → Cross-repo contracts table:**
   - **"Snapshot shape" row:** note the envelope now also carries `targetSeason`, `currentSeason`,
     and verbatim `scoringSettings` at `schemaVersion: 2`.
   - **"Snapshot target season" row:** update to reflect that the app now writes an explicit
     `targetSeason`, so the `deriveTargetSeason()` heuristic is the **fallback for v1 snapshots
     only**; v2 snapshots are graded against `snapshot.targetSeason` directly. Note that the raw
     `scoringSettings` capture (previously flagged as "needed") is now **satisfied** by the app —
     reframe from "needed" to "captured as of snapshot v2; in-basis grading consumer is a future
     data-repo task."
   - **Invariant 4 (schemaVersion discipline):** note snapshot schema is now v2 and, like KTC/NFL,
     is bumped only on incompatible layout change; it is independent of the app's
     `MAX_SUPPORTED_SCHEMA` (season-totals).

4. **No change to `lib/grade.mjs` / `bin/grade.mjs` now.** Consuming `scoringSettings` for in-basis
   grading is a separate future data-repo task; this change only *captures* the field. Flag it as a
   follow-up, not part of this handoff.

---

## Done-definition (sonnet)

1. New tests added per "Tests to add"; the `schemaVersion=1→2` existing assertion updated.
2. `npm test` — full suite green.
3. `factorsSchema.test.js` / `statKeysContract.test.js` unaffected, but confirm still green.
4. `npm run build` — clean, no warnings.
5. Update `docs/integrations.md` and `CLAUDE.md` per "Docs updates" in the same change.
6. **State the Cross-repo impact in the task summary** so `sleeper-dashboard-data` is updated to
   match (README snapshot section, CLAUDE.md rows; harness + register-snapshots need no code change).
