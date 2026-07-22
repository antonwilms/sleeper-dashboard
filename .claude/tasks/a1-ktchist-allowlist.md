# A1 — Scope the `inProgress` bypass to the `ktcHist` read path

> **Session model:** opus plans (this file only) → sonnet implements. No source was edited in this session.
>
> **Repos verified against origin/main (GitHub MCP, both in sync at plan time):**
> - App `sleeper-dashboard` — HEAD `2185ef2f143cecb89b2e6b28d86cc8b3863958f3` (local == origin/main) — "plan and feat: share denominator fix"
> - Data `sleeper-dashboard-data` — HEAD `79fa9d38934fcea0c1a29b4b778b7aec60cd2df7` (local == origin/main) — "nflverse: oline 2026-07-22"

---

## Verdict (read this first)

1. **What is broken.** `loadKtcHistory` fetches each KTC snapshot through `tryDataStore`, which returns `null` for any manifest entry marked `inProgress: true` (`dataStore.js:80`). Every KTC snapshot is registered `inProgress: true` **by design** (`update-ktc.mjs:212` — "KTC snapshot is always 'current value' data"), so all fetches miss, `usable.length === 0`, and every player's `ktcHist*` signals are null / `ktcHistSampleSize: 0`. The KTC series itself is banked and healthy (live manifest: 8 weekly snapshots, `schemaVersion:1`, `recordCount:500`, 7-day spacing).
2. **Does fixing it move scores?** **No.** `ktcHist*` are **capture-only** by an enforced invariant — recorded into `factors`, never fed into `combinedNewFactor`, `projectedPPG`, or `adjustmentSummary`; `dynastyScore.js` does not import `ktcHistory` at all. Populating the series changes only diagnostic `factors.ktcHist*` values and one **view-only** Explorer cell (the ~30-day KTC Δ). No dynasty score or projectedPPG moves.
3. **Grading gate?** **No gate.** This restores intended behavior of an already-shipped, invariant-guarded capture path; it does not activate a new scored factor. Ship directly. (If a future task promotes any `ktcHist*` key *into* `projectedPPG`/dynasty, that promotion is the gradable event — this fix is not.)

**The fix:** add an opt-in `allowInProgress` parameter to `tryDataStore` (default `false`, so every other caller's rejection is byte-for-byte unchanged); `loadKtcHistory`'s snapshot fetch passes `allowInProgress: true`. Two source edits + docs + tests. `tryDataStore`'s global `inProgress` rejection is **not** flipped; no data-repo change.

---

## 1. Consumer sweep

Every consumer of `loadKtcHistory` / the `ktcHist*` fields (grep of `src/`, non-test):

| # | Consumer | Site | What it does today (sampleSize 0) | What it computes once data arrives | Channel |
|---|---|---|---|---|---|
| 1 | **Loader → App state** | `App.jsx:259` `loadKtcHistory({...}).then(setKtcHistory)`; state `App.jsx:156`; already threaded to the projection memo (`App.jsx:533`, dep array `:544`) **and** to PlayersTab (`App.jsx:1037`) | `ktcHistory` state is `null` (loader returns the empty structure `{ series:{}, positionMedians:{}, snapshotDates:[] }`) | Populated `{ series:{[id]:[…]}, positionMedians, snapshotDates }` | wiring (no compute) |
| 2 | **Projection factors** | `seasonProjection.js:307` `computeKtcSignals(ktcHistory?.series?.[playerId] ?? null)`; spread into `factors` at `:312` (rookie) and `:732` (vet) | `series` is `undefined` → `computeKtcSignals(null)` → 13 null/`'none'` sentinels (`ktcHistory.js:255-271`) | Real 13 `ktcHist*` values (delta/vol/trajectory/rank-vs-median + sample descriptors) | **capture-only** — recorded in `factors`, never touches `projectedPPG`/`combinedNewFactor`/`adjustmentSummary` |
| 3 | **Explorer KTC Δ cell** | `PlayersTab.jsx:1874` `computeKtcRecentDelta(s)` over `ktcHistory.series` → `ktcDeltaById` map | `ktcHistory.series` empty → map empty → cell renders blank | ~30-day value Δ per player (`{delta,deltaPct,spanDays,…}`; null for <2 pts) | **view-only display** (Value tab; guarded by degrade-to-null) |

**Explicitly covered per the brief:**
- **Dynasty score (any KTC-momentum/trend channel):** **none exists.** `dynastyScore.js` does not import `ktcHistory` and references no `ktcHist*` key (grep: the only importers of `ktcHistory.js` are `App.jsx`, `seasonProjection.js`, `PlayersTab.jsx`). The dynasty score's KTC inputs are the *current* single-latest snapshot (`ktcMap` → market divergence / KTC percentile), which this change does not touch. **No dynasty channel consumes `ktcHist`.**
- **Projection factor stack:** consumer #2 only — capture-only, invariant-guarded (below).
- **Market-vs-model delta surfaces:** `computeMarketDivergence` (`dynastyScore.js`) reads `ktcValue`/`dynastyScore`, **not** `ktcHist`. Untouched.
- **Display-only panels:** consumer #3 (Explorer Δ cell). The `factors.ktcHist*` keys are **not currently rendered by any component** (no component reads `factors.ktcHist*`) — the Δ cell is the sole user-visible surface that lights up.

**Every consumer already degrades gracefully to a neutral value at sample size 0** (null sentinels in #2 via the `n < 2` branch; empty map in #3). This is what makes the fix safe: turning the tap on replaces neutral sentinels with real values on paths that already tolerate both.

---

## 2. Score-movement verdict

**Populating `ktcHist` does not move dynasty scores or projections — by construction, not by luck.**

- **Enforced invariant** (`CLAUDE.md` → *Capture-only factors do not move projectedPPG*): `ktcHist*` (and `positionMultiplicity*`, `adot*`) "are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines." Confirmed in code: `ktcSignals` is spread into the returned `factors` object **after** `projectedPPG` is finalized (vet `:614`/`:669`; rookie `:173`/`:194`) and is never read by `combinedNewFactor`, the comp blend, or any `adjustmentSummary.push` (`seasonProjection.js:624-666`). Docs concur: `projection.md:147-163` ("diagnostic only — they do not move `projectedPPG`"); `integrations.md:466-469`.
- **No dynasty path exists** (Consumer sweep). The R2 hold is therefore untouched (§3).
- **Only observable deltas:** (a) `factors.ktcHist*` go null→populated (not rendered anywhere today; available to future Outlook "Signals"/Profile surfaces); (b) the Explorer ~30-day KTC Δ cell fills in (view-only).

**Recommendation:** ship directly, no grading gate. Rationale: this is **restoring intended behavior of a path that already shipped behind the capture-only invariant**, not introducing or activating a scored factor. The graded-activation discipline applies when a signal begins to move `projectedPPG`/dynasty; here nothing scored changes. The `factorsSchema.test.js` contract already reserves all 13 `ktcHist*` keys (vet + rookie) — no contract movement either.

---

## 3. R2 hold interaction

**The R2 current-team hold is not touched.** The dynasty-score channels pinned to current-team attribution (R2 flip 2026-07-11; `dynasty-scoring.md:95`; `App.jsx` `historicalSharesCurrentTeam` / current-team `teamContext` memos) are the share-trend boost, dynasty OQ share score, `carryShare`/`targetShare`/`teamOffenseRank` signals, and the workhorse-RB QB-mod gate. **None of these reads `ktcHist`.** The `ktcHist` consumers are the projection factor stack (capture-only, outside the dynasty score) and the view-only Δ cell. Neither sits inside the hold; populating `ktcHist` changes no pinned input. **The hold survives unchanged, and this task must not alter `DEFAULT_ATTRIBUTION` or any current-team pin.**

---

## 4. Neutral-vs-populated discontinuity (cold-start)

- **No cold start for the capture path.** The data repo already banks **8 weekly snapshots** at 7-day spacing (`MIN_SPACING_DAYS=5`, `WINDOW_SIZE=8` → all 8 selected). At first populated load most rostered, KTC-matched players jump straight to `ktcHistSampleSize ≈ 8` → `ktcHistConfidence: 'high'` (`n>=7`). The series does **not** start at length 1 and ramp; the window is already deep. Players present in only a subset of snapshots get shorter series, exactly as intended.
- **The `n < 2` guard already suppresses noise.** `computeKtcSignals` returns all-null sentinels for `n < 2` (`ktcHistory.js:255`); `computeKtcRecentDelta` returns `null` for `n < 2` and degrades to the oldest point when the span < 30d (`ktcHistory.js:337-341`). `ktcHistConfidence` is self-describing (`none`/`low`/`medium`/`high`).
- **Minimum-sample threshold: none needed, and here's why.** A threshold exists to stop a *noisy signal from perturbing a score*. Nothing scored consumes `ktcHist`, so there is no score to perturb; the existing `n<2` null-guards plus the `confidence` descriptor are sufficient for the two diagnostic/view surfaces. Do **not** add a new minimum-sample gate — it would be dead complexity guarding a capture-only/view-only path.

---

## The fix — edits grouped by file

Two source edits. No `App.jsx` change (wiring already complete). No new module.

### File 1 — `src/api/dataStore.js`

**Edit 1a — signature.** `tryDataStore` (`dataStore.js:72`):

```js
// BEFORE (:72)
export async function tryDataStore(relativePath, { validate = null } = {}) {

// AFTER
export async function tryDataStore(relativePath, { validate = null, allowInProgress = false } = {}) {
```

**Edit 1b — the guard.** The `inProgress` rejection (`dataStore.js:80`):

```js
// BEFORE (:80)
  if (entry.inProgress) return null;

// AFTER
  if (entry.inProgress && !allowInProgress) return null;
```

Nothing else in `tryDataStore` changes. The schema-ceiling gate (`:81` `entry.schemaVersion > MAX_SUPPORTED_SCHEMA`), timeout, and validator all still run for the KTC path — **only** the `inProgress` classification is opted out, and **only** when the caller explicitly asks. Default `allowInProgress = false` ⇒ every existing caller (season-totals, roster, draft, advstats, schedule, gamelogs, teamcontext, enrichment) keeps the exact current rejection. **This is a scoped read-path allowlist, not a global flip:** the global default remains reject; a single call site opts in.

> **Why bypassing `inProgress` is safe for KTC specifically (state this in the PR):** for KTC, `inProgress: true` is a **permanent semantic classification** ("this is live current-value data," `update-ktc.mjs:212`), **not** the generic "CI is mid-regeneration, treat as a miss" meaning (`integrations.md:167`). Each `ktc/snapshot-<date>.json` is a dated, immutable, complete point-in-time file (content-hash dedup, one atomic write per date). There is no half-written-file race to guard against here — which is exactly why the scoped opt-in is correct rather than a global change.

**Rejected alternative (do not do):** a path-pattern allowlist buried inside `tryDataStore` (e.g. `if (entry.inProgress && !/^ktc\/snapshot-/.test(relativePath)) return null`). It couples `dataStore.js` to KTC specifics and hides intent; the explicit opt-in flag at the one call site is self-documenting and testable. Also do **not** re-implement a direct `fetch` in `ktcHistory.js` to sidestep `tryDataStore` — it would duplicate the timeout/schema/validate logic and need `BASE_URL`, which `dataStore.js` does not export.

### File 2 — `src/utils/ktcHistory.js`

**Edit 2a — pass the flag.** The parallel snapshot fetch (`ktcHistory.js:141-146`, the `tryDataStore` call at `:143`):

```js
// BEFORE (:143)
      tryDataStore(s.path, { validate: isValidKtcSnapshot })

// AFTER
      // KTC snapshots are registered inProgress:true by design (live current-value
      // data, not mid-regeneration). Opt this read path into inProgress entries;
      // the global rejection in tryDataStore is unchanged for every other family.
      tryDataStore(s.path, { validate: isValidKtcSnapshot, allowInProgress: true })
```

**Edit 2b — correct the stale header comment.** The module header (`ktcHistory.js:4-7`) currently asserts `dataStore.js` "may not be modified." This task modifies it (additively). Update the comment so it no longer misstates the constraint:

```js
// BEFORE (:4-7)
// Coupling note: loadKtcHistory reads the 'data-store/manifest' IndexedDB key
// directly, because dataStore.js exposes no manifest-enumeration export and
// may not be modified. If dataStore.js ever renames its manifest cache key,
// update MANIFEST_CACHE_KEY accordingly.

// AFTER
// Coupling note: loadKtcHistory reads the 'data-store/manifest' IndexedDB key
// directly, because dataStore.js exposes no manifest-enumeration export. If
// dataStore.js ever renames its manifest cache key, update MANIFEST_CACHE_KEY
// accordingly. The snapshot fetch passes { allowInProgress: true } because KTC
// snapshots are registered inProgress:true by design (see tryDataStore).
```

### Step sequence for the implementer
1. `dataStore.js`: apply Edit 1a then 1b.
2. `ktcHistory.js`: apply Edit 2a then 2b.
3. Add tests (§Tests to add).
4. Apply docs edits (§Docs updates).
5. `npm test` (full) · `npm run lint` (0 problems) · `npm run build` (clean). Hand back for the user's manual smoke — do **not** start a dev/preview server. Manual smoke to hand off: with a real `VITE_DATA_STORE_URL`, load the Players → Dynasty → Value tab and confirm the KTC Δ column populates for veterans; confirm dynasty scores and projections are visually unchanged.

---

## Docs updates

### D1 — `docs/integrations.md` (REQUIRED; this doc currently documents the bug)

The "Historical KTC signals" loader steps say the fetch **skips** `inProgress` — that becomes wrong after the fix. Edit step 3 (`integrations.md:459-460`):

```
BEFORE (:459-460)
3. Fetches them in parallel via `tryDataStore` (skips `inProgress` / 404 / stale
   schema).

AFTER
3. Fetches them in parallel via `tryDataStore` with `{ allowInProgress: true }`
   (skips 404 / stale schema, but **not** `inProgress`). KTC snapshots are
   registered `inProgress: true` by design — a permanent "live current-value"
   classification, not a mid-regeneration flag — so this read path opts into them.
   The global `inProgress` rejection in `tryDataStore` is unchanged for every
   other family.
```

Optionally add one clause to the general note at `integrations.md:167` so the two meanings of `inProgress` don't read as contradictory (nice-to-have, not required):

```
BEFORE (:167)
`inProgress: true` means the CI job is regenerating the file — treat as a miss, fall through to live API.

AFTER
`inProgress: true` normally means the CI job is regenerating the file — treat as a miss, fall through to live API. (Exception: the KTC snapshot family sets it permanently to mark live current-value data; the `ktcHistory` loader opts into those via `tryDataStore(..., { allowInProgress: true })`.)
```

### D2 — `docs/signal-registry.md` (REQUIRED — two mechanical rows from the data-repo Tier 0 capture batch)

Add two rows to the **raw-ingested-data / capture** table (header at `signal-registry.md:43-44`: `| Name | Layer | Source | Historical coverage | Reconstructable vs ephemeral | Current use |`). Append after the enrichment rows (after `signal-registry.md:66`), preserving column order and formatting; do not restructure the table. Use the registry's own *Current use* vocabulary term **unused/candidate** for a captured-but-unconsumed family, glossed "capture-only; no consumer":

```markdown
| Sleeper players-state (full `/v1/players/nfl` snapshot) | ephemeral capture | data: `nfl/players-state/<date>.json` (`scripts/update-playerstate.mjs` ← Sleeper `/v1/players/nfl`; weekly Action `weekly-playerstate.yml`) | **2026-07 onward** (capture began 2026-07; no backfill possible) | **Ephemeral** — upstream is current-state-only; each fetch overwrites and Sleeper exposes no history | **unused/candidate** — capture-only, consumed by nothing (no app loader; snapshot layer only) |
| nflverse oline (OL composition, depth-chart derived) | raw ingested data | data: `nflverse/oline/<year>.json` (`scripts/update-oline.mjs` ← nflverse `depth_charts` ESPN feed; weekly Action `nflverse-oline.yml`) | **2025 onward** (2026 live; pre-2025 exists upstream in a legacy `depth_charts` schema, currently unparsed) | **Reconstructable** — upstream archives daily depth-chart states | **unused/candidate** — capture-only, consumed by nothing (no app loader; snapshot layer only) |
```

> Note for reviewer: the task brief phrased the *Current use* as "capture-only, consumed by nothing." I rendered that as **unused/candidate** (the registry's defined vocabulary for a captured-but-unconsumed family) plus the "capture-only, consumed by nothing" gloss, so the row obeys the table's own legend (`signal-registry.md` intro + `:35-36`) rather than inventing a new term. If the maintainer prefers the literal words "capture-only" in the last column, swap the gloss — content is otherwise identical.

### D3 — no other docs need editing (stated explicitly)

- `docs/projection.md` (§*Historical KTC factors (capture-only)*, `:147-163`) — describes the factors and correctly says they never move `projectedPPG`. Still true after the fix; **no edit**.
- `docs/dynasty-scoring.md` — no `ktcHist` reference; the R2 hold description (`:95`) is unaffected; **no edit**.
- `CLAUDE.md` — nav rows for `ktcHistory.js` (`:128`) and `dataStore.js` (`:70`) stay accurate (no module added/renamed/removed; `tryDataStore` gains an optional, defaulted param — no behavior change to document); the *Capture-only factors* invariant (`:163`) stays true and is the guardrail; **no edit**. The `signal-registry.md` KTC-history row (`:62`) already reads "capture-only factor … never moves `projectedPPG`," which remains correct (the classification is unchanged; the path merely now populates) — **no edit** to that row.

---

## Tests to add

### T1 — `src/api/dataStore.test.js` (unit; new `describe('inProgress allowlist')`)

Follow the existing `season-totals schema gate` block (`dataStore.test.js:338-369`) as the template (mock manifest, then file; assert fetch counts). Add:

- **T1a — default rejects `inProgress` (unchanged behavior pinned).** Manifest entry `{ schemaVersion:1, inProgress:true, lastModified:… }` for `ktc/snapshot-2026-07-20.json`. `await tryDataStore('ktc/snapshot-2026-07-20.json', { validate: isValidKtcSnapshot })` → `toBeNull()`; `fetchSpy` called **once** (manifest only, no file fetch). *This is the "unchanged for other families" guard — with no flag, `inProgress` still short-circuits before fetch.*
- **T1b — `allowInProgress:true` fetches and returns the file.** Same manifest; second `fetchSpy` mock resolves a valid KTC array (`[{ name:'A', value:5000 }]`). `await tryDataStore('ktc/snapshot-2026-07-20.json', { validate: isValidKtcSnapshot, allowInProgress:true })` → deep-equals the payload; `fetchSpy` called **twice** (manifest + file).
- **T1c — allowlist does NOT bypass the schema ceiling.** Manifest entry `{ schemaVersion:4, inProgress:true }`. `tryDataStore(path, { allowInProgress:true })` → `toBeNull()`; `fetchSpy` called **once** (schema gate still short-circuits even with the flag). Pins that the opt-in is `inProgress`-only.
- **T1d — non-KTC family with `inProgress:true` and no flag still rejects.** Manifest entry for `nfl/season-totals/2025.json` `{ schemaVersion:3, inProgress:true }`. `tryDataStore('nfl/season-totals/2025.json', { validate: isValidSeasonTotals })` → `toBeNull()`; `fetchSpy` called **once**. Explicit regression guard that the season-totals/other-family rejection is byte-for-byte unchanged.

### T2 — `src/utils/seasonProjection.test.js` (projectedPPG-invariance across null vs populated)

Existing coverage asserts null-ktcHistory sentinels (`:219-222`) but not that a *populated* series leaves the score untouched. Add one test using the existing veteran fixture/harness in that file:
- **T2a — populated `ktcHistory` moves `ktcHist*` factors but not `projectedPPG`/`adjustmentSummary`.** Build one player projection twice: once with `ktcHistory: null`, once with `ktcHistory: { series: { [thatPlayerId]: [8 ascending points spanning >30d] } }` (reuse the 8-point shape from `ktcHistory.test.js:57-69`). Assert: `projectedPPG` **equal** between the two runs; `adjustmentSummary` **deep-equal** between the two runs; and in the populated run `factors.ktcHistSampleSize > 0` with `factors.ktcHistDelta !== null` (i.e., the factors genuinely populated). This is the executable form of the §2 verdict.

### T3 — existing tests to re-run (no change expected)

`factorsSchema.test.js` (13 `ktcHist*` keys already in both lists), `ktcHistory.test.js` (pure `computeKtcSignals`/`computeKtcRecentDelta` — unaffected), and any `*ViewOnly` guards. Confirm green; none should need edits. If `npm test` surfaces a snapshot/count assertion tied to `dataStore.test.js` totals, update the count only.

> Note: `loadKtcHistory` itself (the IndexedDB + manifest + parallel-fetch orchestration) is not directly unit-tested today and this task does not add an integration harness for it — the behavior change is fully covered by T1 (the `tryDataStore` gate is the only line that changed the outcome) plus T2 (capture-only invariance). Adding a full `loadKtcHistory` integration test is out of scope for this one-line-gate fix.

---

## Cross-repo impact

**None.** This is an app-only read-path change.

- **No data-repo change.** The KTC series is correct as registered; `inProgress: true` on KTC snapshots is intentional and stays (`update-ktc.mjs:212`). The fix adapts the *reader*, not the *writer*. Do not open a data-repo PR for this.
- **No manifest-contract change.** The manifest shape and the `inProgress` field are consumed exactly as before; the app simply chooses to honor `inProgress` differently for one opt-in call. The `MAX_SUPPORTED_SCHEMA` ceiling and all validators are unchanged.
- **The two `signal-registry.md` rows (D2)** document data-repo families that already shipped (`nfl/players-state/*`, `nflverse/oline/*` are live in the data repo's `manifest.json`); adding the rows mirrors existing data-repo state into the app-side canonical registry. It creates no new obligation on the data repo.

---

## Guardrails for the implementing session
- Do **not** flip the global `inProgress` rejection in `tryDataStore` — opt-in param only, default `false`.
- Do **not** change `DEFAULT_ATTRIBUTION` or any current-team pin (R2 hold).
- Do **not** touch `App.jsx` wiring — `ktcHistory` is already threaded to the projection memo and PlayersTab.
- Do **not** add a minimum-sample gate or otherwise change `computeKtcSignals`/`computeKtcRecentDelta` math.
- Do **not** widen into KTC ingest, the market-vs-model delta engine, or other roadmap items. One defect, two source edits, docs + tests.
- If anything above contradicts live source when you open it, **stop and ask** — do not improvise.
