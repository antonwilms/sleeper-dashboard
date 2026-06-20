# Codebase Review — sleeper-dashboard (app repo)

Read-only audit, 2026-06-20. Reviewed live source against CLAUDE.md invariants and
the cross-repo contracts in `sleeper-dashboard-data`. Findings are ranked for signal;
known-intentional interim state (default `/players`, gated Board/Trade placeholders,
deferred App.jsx extraction) is treated as designed, not flagged.

**Verification performed:** ESLint clean (0 problems); contract/decoupling tests green
(`factorsSchema` 8, `statKeysContract` 12, `advStatsViewOnly` 15, `fantasyPoints` 11 — 46/46).
Import graph swept (no orphaned JS modules). Rate-stat aggregation hazard traced through
every aggregation site (see Verified-safe note at end).

---

## High

### H1 — Daily snapshot can be persisted before async projection inputs settle
- **Location:** `src/App.jsx:559-585` (snapshot write effect) + `src/App.jsx:490-491`
  (`seasonProjections` memo guard); impact path `src/utils/seasonProjection.js:170`
  (`rookieProjection`: `ageMult * ktcMult * collegeContribution * nflDraftMultiplier`).
- **Category:** correctness
- **What's wrong:** The snapshot effect gates on projection *output* existing
  (`seasonProjections && ktcMap && scoringSettings && careerStats`), not on all projection
  *inputs* having loaded. `seasonProjections` becomes non-null as soon as
  `careerStats`/`empiricalCurves`/`positionPeakPPG` exist — but `collegeStats` structurally
  lags `careerStats` (it chains: `careerStats` → async `loadCollegeStats()` →
  `collegeMatches` → `collegeStats` memo), and `nflDraftMatches` is also an independent async
  load. On a warm (data-store/cached) career load, `seasonProjections` is computed and the
  snapshot is written in the window where `collegeStats` is still `null`. For rookies,
  `collegeContribution` and `nflDraftMultiplier` are *multiplicative on `projectedPPG`*, so the
  captured rookie projections use neutral college production and (if the draft load also hasn't
  landed) neutral draft capital. Because the writer is idempotent skip-if-exists per UTC day,
  the first (incomplete) write wins for the whole day and the later, fully-loaded projection
  never replaces it.
- **Why it matters:** The snapshot is the cross-repo grading/backtest ground-truth
  (`projection` field is verbatim `computeNextSeasonProjection` output; consumed by
  `sleeper-dashboard-data` grading). A contaminated snapshot silently mis-grades rookies, and
  the corruption is load-path-dependent (intermittent → hard to notice). This is timely: the
  in-basis grading port is gated on a committed v2 snapshot.
- **Recommended action:** Gate the snapshot write on a "projection inputs settled" condition
  (load-attempt-resolved flags for `collegeStats`/`nflDraftMatches`, not mere non-null — both
  can legitimately stay null when CFBD/data-store is disabled, so a non-null gate would suppress
  snapshots entirely in that mode). Keep first-write-wins, but only after inputs have settled.
- **Effort:** M

---

## Medium

### M1 — nflDraft loader discards a valid permanent cache when the manifest entry is null
- **Location:** `src/api/nflDraft.js:49-90` (`loadNflDraftPicks`)
- **Category:** correctness
- **What's wrong:** Freshness is `rec.data.lastModified === entry?.lastModified`. When the
  manifest is unavailable (cold manifest cache past its 60-min TTL + a transient fetch failure),
  `getManifestEntry` returns `null`, so `entry?.lastModified` is `undefined`; every warm cached
  year fails the equality check and is pushed to `missing`. `tryDataStore` then also returns
  `null` (manifest gone), and the `missing` years are overwritten with `[]`. The code comment
  claims it "returns whatever was fresh in cache," but with a null entry nothing is ever fresh —
  so a fully valid permanent per-year draft cache is thrown away and all rookies get
  `nflDraftMultiplier = 1.0` until the manifest recovers.
- **Why it matters:** Silently neutralizes a real projection input (rookie NFL draft slot, D1)
  on a manifest hiccup, even though correct data is cached locally. Sibling loaders
  (`nflRoster.js`, `advStats.js`) guard with `if (!entry) continue` and degrade to an explicit
  not-complete sentinel rather than discarding cache; `nflDraft` is the outlier.
- **Recommended action:** When `entry` is null, serve cached picks (treat "manifest unavailable"
  as distinct from "cache stale") instead of overwriting with `[]`. Add a test for the
  null-entry + warm-cache path.
- **Effort:** S

### M2 — `cache.js` has no unit tests
- **Location:** `src/utils/cache.js` (no `cache.test.js` exists)
- **Category:** test-gap
- **What's wrong:** The IndexedDB cache layer — TTL expiry with auto-delete on read
  (`getCache`/`getCacheRecord`), `clearCache` prefix-cursor walk, `listCacheRecords` live-only
  filter, and the `key.includes('players')` default-TTL branch — is entirely uncovered.
  `dataStore.test.js` covers validators and the placeholder/manifest-fail guards, but not cache
  semantics. Cache invalidation is explicitly a correctness-critical path (TTL discipline,
  permanent-vs-expiring records feed the export `isLive()` check and the loaders' freshness logic).
- **Recommended action:** Add a `cache.test.js` (fake-timers for TTL expiry/auto-delete, prefix
  isolation for `clearCache`, expired-record exclusion for `listCacheRecords`, default-TTL branch).
- **Effort:** M

---

## Low

### L1 — Latent rate-stat aggregation hazard (currently contained, no live consumer)
- **Location:** `src/api/sleeperStats.js:201-203` (`getSeasonTotals` sum-all-keys loop)
- **Category:** correctness (hardening — **not** a current bug)
- **What's wrong:** The aggregator sums *every* stat key across 18 weeks, including non-additive
  rate/derived stats (`pass_rtg`, `cmp_pct`, `pass_ypa`, `pass_ypc`, `rec_ypr`, `rush_ypa`,
  `pos_rank_*`, `fgm_pct`, …), so stored season totals contain impossible values that *look*
  valid (e.g. fixture player 19: `pass_rtg=931.7`, `cmp_pct=756.8`). Verified the only projection
  consumer is `efficiencyMetrics.js`, which recomputes rates from season-total components and
  never reads the summed rates; a source-wide grep found **no other consumer**. Documented as
  intentional-preserve in both repos' CLAUDE.md. The data repo keeps a defensive `RATE_KEYS` set
  in `lib/fantasyPoints.mjs`; the app has no symmetric guard.
- **Why it matters:** Purely forward-looking: any future code that naively reads
  `season.stats.pass_rtg` (display, a new factor, an export consumer) gets silent garbage with no
  guardrail. The values also ride along verbatim in the exported snapshot `players[*].projection`
  is unaffected, but raw season-totals exports carry them.
- **Recommended action:** Optional hardening — mirror the data repo's `RATE_KEYS` and either skip
  those keys in the aggregation sum or document the unsafe keys at the read sites. No action
  required for current behaviour.
- **Effort:** S

### L2 — `careerCancelRef` is a write-only (dead) ref
- **Location:** `src/App.jsx:168` (declare), `:781`, `:783` (assign); never read
- **Category:** obsolete
- **What's wrong:** The ref is set to `true` then immediately to a fresh `cancel` object, and its
  `.current` is never read anywhere. Actual cancellation of the previous career load works via the
  effect's local `cancel` object captured in the cleanup (`return () => { cancel.current = true }`).
  The ref is vestigial and misleading (reads as if it cancels prior runs, but cannot).
- **Recommended action:** Remove the ref and its two assignments.
- **Effort:** S

### L3 — Leftover debug instrumentation in `loadCareerHistory`
- **Location:** `src/api/sleeperStats.js:266-280`
- **Category:** obsolete
- **What's wrong:** A dev-only block iterates the *entire* `playersMap` on every career load and
  logs `[gp fix]` lines for hardcoded names (`Rice`/`Chase`/`Jefferson`) — leftover from the
  gp-disambiguation fix. Guarded by `NODE_ENV !== 'production'`, so it's harmless in prod, but it's
  stale debugging code with hardcoded player names and an O(players) scan in dev.
- **Recommended action:** Delete the spot-check block.
- **Effort:** S

### L4 — `fantasyPoints.js` runs a self-test at module load in all builds
- **Location:** `src/utils/fantasyPoints.js:80-94` (`testFantasyPoints()` called at module top level)
- **Category:** suboptimal
- **What's wrong:** The module unconditionally invokes `testFantasyPoints()` on import, emitting a
  console line ("Fantasy points engine OK") and doing throwaway work. `fantasyPoints.js` is a hot,
  widely-imported module (App.jsx, sleeperStats, projection paths), and the side effect is not
  tree-shaken (top-level call) — so it runs in production too. (Observable in the test output above.)
- **Recommended action:** Move the assertion into the existing `fantasyPoints.test.js`, or guard it
  behind a dev flag; remove the unconditional call.
- **Effort:** S

### L5 — Orphaned static assets
- **Location:** `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`,
  `public/icons.svg`
- **Category:** obsolete
- **What's wrong:** None are referenced anywhere (no import, no sprite `<use>`, no `href`).
  `react.svg`/`vite.svg` are Vite scaffold leftovers; `hero.png` and `public/icons.svg` are
  unreferenced (only `public/favicon.svg` is wired into `index.html`).
- **Recommended action:** Delete the four files.
- **Effort:** S

---

## Verified safe (checked, not findings)

- **Rate-stat hazard "elsewhere":** traced all aggregation sites — `teamContext.js`
  (`computeHistoricalTeamTotals`/`computeTeamContext`) sums only additive volume counts;
  `usageMetrics.js` computes snap/RZ shares as summed-numerator ÷ summed-denominator (correct, not
  averaged weekly rates); `efficiencyMetrics.js` recomputes passer rating/YPC/etc. from
  season-total components and explicitly warns against the stored rates. No new analogous hazard.
- **`fantasyPoints.js` ↔ `lib/fantasyPoints.mjs` contract:** formula identical (loop
  `scoringSettings`, skip null multiplier/stat, 2-dp round). In sync; no drift.
- **Freshness logic** in `nflRoster.js` and `advStats.js`: correct `lastModified`-aware
  re-fetch with `if (!entry) continue` guards (the M1 flaw is specific to `nflDraft.js`).
- **Snapshot UTC day-boundary** (`projectionSnapshot.js`): `dateKeyUTC` and `capturedAt` both use
  UTC consistently; first-league-of-the-day-wins is intentional. (The race in H1 is about *input
  readiness*, not the UTC keying.)
- **advstats view-only decoupling:** enforced and green (`advStatsViewOnly.test.js`).
