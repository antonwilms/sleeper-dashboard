# Backend Health Audit — Sleeper Dashboard
_Date: 2026-06-08 | Read-only assessment | No source files edited._

---

## TOP RECOMMENDATIONS

Ranked by value-to-effort ratio. All five are independently shippable without touching the projection pipeline or requiring a backtest gate.

1. **Remove `ownerTeamName == null` filter from `computeQBQualityByTeam`** (`teamContext.js:12`) — Step 7b is silently neutral for any NFL team whose starting QB isn't rostered in the fantasy league; one line deleted, immediate signal improvement for ~half of NFL teams.

2. **Fix WR/TE share denominator in `computeTeamContext`** (`teamContext.js:57-62`) — current-season "targetShare" uses `rec / team.rec` while the historical path uses `rec_tgt / team.recTgt`; every WR/TE share trend compares apples to oranges; add `recTgt` to the teamTotals accumulator.

3. **Guard v1 data-store entries from the `weeklyStatus` stale-detection loop** (`sleeperStats.js:109-151`) — any season-totals file at schema v1 in the data store is re-fetched on every session start; add a manifest-freshness check before firing the stale path for data-store-sourced entries.

4. **Add a smoke test for `computeQBQualityByTeam` / `playerRowsWithQBMod`** — the only post-`playerRows` step that mutates a scored component is completely untested; a one-fixture test catches the `ownerTeamName` regression (closes F1-A reversion risk) and any future NaN propagation.

5. **Production guard on `computeEmpiricalAgeCurves` console.log** (`dynastyScore.js:88-92`) — age-curve logs fire in every production session; wrap in `if (process.env.NODE_ENV !== 'production')`.

---

## FINDINGS

### Lens 1 — Silent Failure Modes

#### F1-A: `computeQBQualityByTeam` skips unrostered NFL starters

- **What**: `teamContext.js:12` filters `row.ownerTeamName == null`, so any QB not currently rostered in this fantasy league is invisible to QB quality computation.
- **Where**: `src/utils/teamContext.js:8-35`; called from `App.jsx` to produce `qbQualityByTeam`; applied in the `playerRowsWithQBMod` memo (Step 7b).
- **Why it matters**: In a typical 10-12 team dynasty league, many NFL teams' starting QBs are un-rostered (especially after waiver moves, early-season surprises, or injury promotions). Those teams silently get quality score 50 (neutral), making Step 7b a no-op for their WR/TE/RBs. The modifier was designed to be meaningful; the filter undermines it by reducing coverage to only rostered QBs.
- **Fix direction**: Delete the `row.ownerTeamName == null` guard entirely. All QBs in `playerRows` (which already includes relevant free agents via the candidate pool) should contribute. The `depthMap`-based QB1 preference (lines 18-25) correctly handles multi-QB teams regardless of roster status.
- **Effort / risk**: XS — one `continue` condition removed; no pipeline order change, no test impact beyond the missing smoke test (see Top Rec #4).
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### F1-B: v1 data-store season-totals entries re-fetch every session

- **What**: `sleeperStats.js:139` fires the "stale cache" path whenever `sample.weeklyStatus === undefined`. This was intended to force-refresh pre-phase-5 live-API cache entries, but it also catches data-store-sourced v1 files (which legitimately lack `weeklyStatus`). The re-fetch path at `sleeperStats.js:151` writes the v1 file back to cache with `sourceLastModified` set — but the stale check fires before the manifest-freshness check on the next session, ignoring `sourceLastModified` and triggering another re-fetch. Infinite loop per v1 season.
- **Where**: `src/api/sleeperStats.js:109-155`; affects all season-totals files at schemaVersion 1 in the data store (likely seasons ≤ 2019 that have not been backfilled to v2).
- **Why it matters**: For each v1 season, every page load incurs a full data-store HTTP fetch (up to 15 s timeout per file). With 5-8 historical seasons potentially on v1, that's 5-8 guaranteed network fetches per session that serve the same unchanged data, with no caching benefit despite the TTL.
- **Fix direction**: Before the `weeklyStatus` check, verify `sourceLastModified`: if the record has `sourceLastModified` set AND the manifest entry's `lastModified` matches, the entry is a fresh data-store v1 file — serve it without re-fetching. Only fall through when there is no `sourceLastModified` (genuine pre-phase-5 live-API entry) or when the manifest has a newer version. This narrows the stale detection to its original target without touching v2 logic.
- **Effort / risk**: S — 4-6 lines in the stale-detection block; needs a unit test that a v1 data-store entry with a matching `sourceLastModified` is served from cache on the second call.
- **Gating**: Shippable now.
- **Already known?**: No. (Related to the data-store v1/v2 schema work but orthogonal to the shape validator.)

---

#### F1-C: `computeEmpiricalAgeCurves` logs fire in production

- **What**: `dynastyScore.js:88-92` contains `console.log` calls for every position's derived peak age with no `process.env.NODE_ENV` guard.
- **Where**: `src/utils/dynastyScore.js:88-92`.
- **Why it matters**: Every production session emits ≥5 console lines (one per position), leaking internal model parameters to any user who opens DevTools. Minor, but degrades console hygiene for debugging.
- **Fix direction**: Wrap the block in `if (process.env.NODE_ENV !== 'production')`. Vite's build-time dead-code elimination will strip it entirely from production bundles.
- **Effort / risk**: XS — 2 lines; zero behavior change.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### F1-D: `sleeperStats.js` week-skip silently undercounts `gamesPlayed`

- **What**: In the 18-week career history loop, a failed week fetch (`console.warn` and continue) means that week's data is absent from the season total. If the player had stats that week, `gamesPlayed` is undercounted by 1.
- **Where**: `src/api/sleeperStats.js` (18-week loop); mitigated for historical seasons by the data store (which stores pre-aggregated season totals with correct `gamesPlayed`).
- **Why it matters**: The data store eliminates this for all pre-current-season data. The current-season live-API path is the only exposure, and a single-week HTTP failure is uncommon. Low severity, but `gamesPlayed` undercounts can push players below the qualifying threshold (GP ≥ 8) and suppress their share and projection data for that season.
- **Fix direction**: No code change needed now — document the data store as the mitigation. If a per-season "expected weeks" counter were added to the cache entry, a guard assertion could detect and warn on an unusual undercount. That's opt-in improvement, not a bug fix.
- **Effort / risk**: Documentation only.
- **Gating**: Shippable now (doc update only).
- **Already known?**: Noted in docs/integrations.md; included here for completeness.

---

### Lens 2 — Data Quality Traps

#### F2-A: WR/TE "targetShare" in `computeTeamContext` is reception share

- **What**: `computeTeamContext` accumulates only `rec` in `teamTotals` (not `rec_tgt`) and computes `targetShare = s.rec / totals.rec` for WR/TE. The historical path in the same file (`computeHistoricalTeamTotals`, lines 132-138) correctly accumulates both `rec` and `recTgt`, and `computeHistoricalShares` uses `rec_tgt / team.recTgt` when available. The current-season function is inconsistent.
- **Where**: `src/utils/teamContext.js:57-62` (teamTotals accumulation; missing `recTgt`); `:95-110` (WR/TE share assignment, uses `rec`). Compare `:132-138` (historical path correctly accumulates `recTgt`).
- **Why it matters**: Two concrete impacts.
  1. **OQ shareScore miscalibrated**: The scale factor `* 400` in `computeOpportunityQuality` was presumably tuned against reception share. If the denominator changes to targets, the same player's fraction rises slightly (targets > receptions), so the score would also rise. Net effect is small for most players but larger for high-catch-rate slot receivers whose reception share is significantly closer to 1 than their target share.
  2. **Share trend discontinuity**: `computeShareTrend` in Step 3 of `seasonProjection.js` reads the current year's `targetShare` from `teamContext` alongside historical years from `historicalShares`. The two use different denominators — current year is reception share, historical years are target share (post-~2021) or reception share (pre-2021). The trend direction derived from mixing these is unreliable for recent-year comparisons.
- **Fix direction**: In `computeTeamContext`: add `recTgt: 0` to the teamTotals initializer; add `teamTotals[team].recTgt += s.rec_tgt ?? 0` in the accumulation loop; replace the WR/TE share assignment with the fallback pattern from the historical path (`recTgt > 0 && totals.recTgt > 0 ? recTgt / totals.recTgt : rec / totals.rec`). No downstream schema changes required.
- **Effort / risk**: S — 3 targeted lines; verify the OQ `shareScore * 400` calibration holds for target share values (they are in the same 0.10-0.30 range; the clamp to 100 prevents overflow). Factors schema and stat-key contract are unaffected.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### F2-B: Pre-2021 vs. post-2021 share series uses different denominators for long-career WR/TE

- **What**: `computeHistoricalShares` uses `rec_tgt / team.recTgt` for seasons where the data is available (Sleeper began providing `rec_tgt` in ~2021) and falls back to `rec / team.rec` for earlier seasons. For any WR/TE with pre-2021 career data, the share array mixes these two metrics.
- **Where**: `src/utils/teamContext.js:150-185`; consumed by `computeShareTrend` in `seasonProjection.js:Step 3`.
- **Why it matters**: A metric discontinuity in the share series causes spurious trend signals. Example: a player's 2020 share of 0.21 (rec-based) followed by a 2021 share of 0.26 (target-based) at equivalent real usage looks like a 24% step-up — the trend fires "growing" incorrectly. Long-tenure veterans (TEs drafted pre-2020, boundary WRs with 5+ seasons) are most affected. The share trend multiplier range is `[0.90, 1.10]`, so a spurious "growing" label adds up to 10% to the projection.
- **Fix direction**: Full fix requires per-season team attribution (backtest-gated). Cheap mitigation: in `computeShareTrend`, detect seasons where the underlying share metric switches (i.e., where `historicalTeamTotals[season][team].recTgt === 0` for an earlier season and `> 0` for a later one) and suppress the trend label when a discontinuity exists. This is a suppression, not a fix, but it converts a silent error into a conservative neutral.
- **Effort / risk**: Full fix — backtest-gated. Discontinuity suppression — S effort, shippable now, zero regression risk (conservative).
- **Gating**: Full fix backtest-gated. Suppression mitigation shippable now.
- **Already known?**: The denominator inconsistency is not documented. Orthogonal to "offseason team-change handling" (affects players who never changed teams). Treat as new.

---

#### F2-C: `computeBounceBackFlag` never fires for the most dramatic recovery cases (GP < 8 prior season)

- **What**: `projectionSignals.js:computeBounceBackFlag` receives the `qualifying` array (seasons with GP ≥ 8). So "shortened prior season" means 8-9 games — not a major injury miss. A player who missed 11 games with a torn ACL and then had a full recovery produces no qualifying entry for the missed year, and the bounce-back flag never fires.
- **Where**: `src/utils/projectionSignals.js:computeBounceBackFlag`.
- **Why it matters**: The most predictable positive-regression cases — a high-ceiling player returning from a season-ending injury — are exactly the ones the ×1.05 flag cannot reach. The regression step (Step 2) uses career average to partially correct this, but not as precisely.
- **Fix direction**: Pass a separate "all seasons including sub-8-GP" array and check for a prior season with `gamesPlayed < 8 AND gamesPlayed > 0` followed by a strong recovery. This is a projection-input change.
- **Effort / risk**: Projection-input change — backtest-gated.
- **Gating**: Backtest-gated. Distinct from the injury-vs-backup heuristic (roadmapped); that addresses the _cause_ classification, not the bounce-back signal itself.
- **Already known?**: No.

---

### Lens 3 — Data Left on the Table

#### F3-A: `ktcHist*` signals — highest backtest-activation priority

- **What**: Thirteen KTC history factors (trajectory, volatility, rank-vs-median, delta, etc.) are stored per player in `factors` but carry zero weight in `projectedPPG`.
- **Where**: `src/utils/seasonProjection.js` Steps 5g/5h; `src/utils/ktcHistory.js`; `docs/projection.md` capture-only section.
- **Why it matters**: KTC trajectory is a leading indicator — dynasty market consensus often moves before on-field stats reflect a role change. Among all capture-only factors, `ktcHistTrajectory` and `ktcHistRankVsMedian` are most defensible for early activation because they represent directional consensus, not just absolute value, reducing their sensitivity to market hype vs. real role signal.
- **Surfaceability**: Backtest-gated. No activation without the measurement layer.
- **Gating**: Backtest-gated.
- **Already known?**: Yes (roadmapped). Included to confirm this is the highest-readiness capture-only group.

---

#### F3-B: Enrichment coaching/scheme data feeds no scoring model

- **What**: `enrichment.js` loads `coaching`, `scheme`, `injuries`, and `notes` in parallel at startup. The data lands in `enrichmentMap` (App state) and is consumed **only** by `AvailabilityHistory` for DNP tooltip text. No scoring or projection module reads coaching or scheme data.
- **Where**: `src/api/enrichment.js`; `src/utils/enrichmentLookup.js`; `src/App.jsx` (enrichmentMap state).
- **Why it matters**: A new offensive coordinator or scheme-type shift (run-heavy → pass-heavy) is high-signal for WR/TE target share changes. The data is hand-curated, structured, and already in memory. The join key (player_id) already exists in the projection pipeline. The only missing piece is a consumption path.
- **Surfaceability**: Scheme integration requires a measurement layer (projection-input change). However, the enrichment `injuries` array — which has severity metadata — has a narrower activation path: it could enrich `classifyInjurySeason` contributor evidence without touching `projectedPPG`. That sub-path overlaps "injury severity feeding projections" (roadmapped — respect the exclusion).
- **Gating**: Full scheme integration: backtest-gated. Injury-severity enrichment: roadmapped (excluded from new findings).
- **Already known?**: Coaching/scheme specifically — No. Injury severity — roadmapped (excluded).

---

#### F3-C: `positionMultiplicityRatio` — dual-role player signal unexamined

- **What**: `positionMultiplicityRatio` captures the fraction of a player's fantasy points from secondary roles (e.g., RB receiving, QB scrambling). Stored in `factors`, not surfaced anywhere.
- **Where**: `src/utils/seasonProjection.js` Step 5b; `docs/projection.md` capture-only section.
- **Why it matters**: Dual-role players have different projection variance characteristics — their floor is higher (multiple scoring paths) but their ceiling is ceiling-constrained by opportunity split. A high ratio combined with a new offensive scheme (which could consolidate or eliminate the secondary role) is a meaningful projection signal. At minimum, surfacing the ratio in the player profile (alongside the capture-only KTC signals) would give analysts context.
- **Surfaceability**: Surfaceable as display-only without a backtest gate (it's already computed and in `factors`). Activating it as a projection weight is backtest-gated.
- **Gating**: Display-only: shippable now (but this is UI scope — out of scope for this audit). Weight activation: backtest-gated.
- **Already known?**: No.

---

### Lens 4 — Maintainability / Blast Radius

#### F4-A: `playerRowsWithQBMod` mutates a scored field post-hoc with no test coverage

- **What**: The `playerRowsWithQBMod` memo overwrites `dynastyScore.components.opportunityQuality.value` on each row after `computeDynastyScore` has already run. This is intentional (KTC must load first for QB rows to have KTC-backed quality scores), but the mutation is invisible to the test suite. If `computeQBQualityByTeam` returns NaN or an out-of-range value for any team, the OQ component is silently corrupted for all skill players on that team.
- **Where**: `src/App.jsx` (`playerRowsWithQBMod` useMemo); downstream consumers see the already-modified value.
- **Why it matters**: The `factorsSchema.test.js` and `statKeysContract.test.js` tests don't exercise the App.jsx pipeline at all. The mutation step has no assertion. A regression in `computeQBQualityByTeam` (including the fix for F1-A) could silently corrupt OQ values in production without failing CI.
- **Fix direction**: Add a unit/integration test for `computeQBQualityByTeam`: mock a `playerRows` array with QBs on 3-4 NFL teams (some rostered, some not), assert all teams get a finite quality in [0, 100], and assert the OQ modifier on a sample WR row is finite and within the expected ±5% range. This test pins the post-mod behavior and would catch the F1-A regression.
- **Effort / risk**: S — test-only, no source change.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### F4-B: WR/TE share mismatch is undocumented in code — looks intentional

- **What**: The `computeTeamContext` WR/TE share assignment uses `rec` while the historical path in the same file uses `rec_tgt`. There is no comment marking this as a discrepancy vs. the historical path. A future developer reading `computeHistoricalTeamTotals` will see `recTgt` and assume `computeTeamContext` is equivalent. It isn't.
- **Where**: `src/utils/teamContext.js:57-62` vs. `:132-138`.
- **Fix direction**: Add a one-line comment at the `computeTeamContext` WR/TE share assignment: `// TODO: use rec_tgt (targets) — computeHistoricalTeamTotals already does; see F2-A in backend-audit.md`. This prevents the discrepancy from being treated as intentional design while the fix is pending.
- **Effort / risk**: XS — comment only.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### F4-C: `compsCache` module-level Map never invalidates within a session

- **What**: `careerComps.js` holds a module-level `compsCache` Map keyed by player ID. It is never cleared. The cache is keyed only by `playerId` — not by `positionPeakPPG`, which is an input to `buildCareerArcVector`. If `positionPeakPPG` changes (e.g., `careerStats` reloads or the user switches leagues), previously cached arc vectors are stale.
- **Where**: `src/utils/careerComps.js` (module-level `compsCache`); `src/utils/compsIntegration.js:computeCompBlend`.
- **Why it matters**: `positionPeakPPG` is derived from `computeEmpiricalAgeCurves(careerStats, playersMap)`. If `careerStats` identity changes mid-session (e.g., different league loads different scoring data), `seasonProjections` will recompute via its memo dependency, but `compsCache` will serve stale arc vectors computed under the prior `positionPeakPPG`. The projection PPG from comps could be scaled to the wrong baseline. Low probability for single-league sessions, but a silent error if it fires.
- **Fix direction**: Include `positionPeakPPG` identity (or a shallow-hash of peak PPG values) as part of the compsCache key, or clear `compsCache` when `careerStats` changes. Adding a `cacheVersion` variable that is bumped whenever `careerStats` changes is sufficient. Alternatively, document the assumption in a comment.
- **Effort / risk**: XS for documentation; S for proper key extension; neither touches projection math.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### F4-D: `ktcHistory.js` hard-codes `dataStore.js` manifest cache key

- **What**: `ktcHistory.js:91` uses `await getCache('data-store/manifest')` with a string literal. `dataStore.js:34` writes the manifest under the same literal `'data-store/manifest'`. No exported constant binds them.
- **Where**: `src/utils/ktcHistory.js:91`; `src/api/dataStore.js:34`.
- **Why it matters**: If `dataStore.js` renames its manifest key (e.g., for versioning), `ktcHistory.js` silently returns `null` from `getCache`, falls back to its own cached KTC history, and loads stale snapshots without any warning. The coupling comment in `ktcHistory.js` acknowledges the dependency but provides no guard.
- **Fix direction**: Export `export const MANIFEST_CACHE_KEY = 'data-store/manifest'` from `dataStore.js`; import and use it in `ktcHistory.js`. Confirm neither module is frozen (CLAUDE.md frozen-module invariant) before editing.
- **Effort / risk**: XS — one constant export, one import; zero behavior change.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### F4-E: `playerRows` recomputes all `computeDynastyScore` calls when `ktcMap` loads

- **What**: `playerRows` depends on `[careerStats, leagueData, empiricalCurves, positionPeakPPG, ktcMap, teamContext, depthMap, historicalShares, nflRoster]`. Because `ktcMap` is in the dependency array, all `computeDynastyScore` calls for all relevant players (~500-1500) re-execute when KTC data arrives — even though only the KTC percentile sub-component changes.
- **Where**: `src/App.jsx` (`playerRows` useMemo dependency array).
- **Why it matters**: Two pipeline recomputes are guaranteed per cold session: once when `careerStats` loads and once when `ktcMap` loads afterward. Each recompute runs `computeDynastyScore` for all players, which is the most expensive single operation in the pipeline (calls `computeEmpiricalAgeCurves`, `computeOpportunityQuality`, etc. per player). Visible as a second "flash" of scores updating in the UI.
- **Fix direction**: Split `playerRows` into `playerRowsBase` (no KTC dependency; runs once on careerStats load) and a lightweight `playerRowsWithKTC` that only adds the `ktcValue` and `ktcPercentile` fields. Move the KTC sub-component of `computeDynastyScore` to the second step. This is a medium-effort pipeline restructure with meaningful blast radius (pipeline order is an invariant).
- **Effort / risk**: M effort; M risk (pipeline order). Needs careful review of every `playerRows` consumer to ensure the two-phase shape is compatible.
- **Gating**: Shippable without a backtest gate, but requires a manual smoke test pass after the restructure. Not recommended until other findings are addressed.
- **Already known?**: No. Note: this is related to the slow-load diagnosis (roadmapped) but specifically concerns pipeline recompute frequency, not initial load time.

---

## DATA-REPO & CROSS-REPO FOLLOW-UPS

### v1 season-totals schema migration (`sleeper-dashboard-data`)
Finding F1-B reveals that season-totals files at schemaVersion 1 in the data store cause a re-fetch on every session. The data-repo can address this two ways: (a) regenerate historical seasons to v2 (add a minimal `weeklyStatus` array of 18 `'X'` entries — acceptable for seasons too old to have real weekly tracking data); or (b) add a `schemaVersion` field to each manifest `files` entry, allowing `sleeperStats.js` to distinguish a fresh data-store v1 from a stale live-API entry without re-fetching. Option (b) is the cheaper data-repo change and unblocks the `sleeperStats.js` fix for F1-B.

### Per-season team field (`sleeper-dashboard-data` + `sleeperStats.js`)
Findings F2-A and F2-B both have deeper fixes that require `sleeperStats.js:normalizeStatsResponse` to store the per-season NFL team for each player entry (`entry.team` per weekly stats row). This is already flagged under "offseason team-change handling" (roadmapped). The F2-B share-denominator discontinuity shares the same infrastructure dependency even though it affects players who never changed teams — both fixes converge on the same prerequisite.

### Manifest key contract (`dataStore.js` ↔ `ktcHistory.js`)
The implicit string contract `'data-store/manifest'` is shared between two modules in the same repo with no exported binding. CLAUDE.md or the docs/integrations.md cross-repo section should capture this as an explicit interface contract. If the key ever changes (e.g., to support multiple manifest versions), the silent `ktcHistory.js` fallback would go undetected without the constant-export fix from F4-D.

### `enrichmentLookup.findInjuryForWeek` linear scan
`src/utils/enrichmentLookup.js:findInjuryForWeek` scans the injuries array linearly. At current enrichment volumes (< 200 entries) this is negligible. A pre-indexed `Map<playerId, Map<year, segment[]>>` would drop per-player lookup to O(1). Not urgent now — flag for activation when injury-severity feeding projections connects the enrichment data to the projection pipeline and lookup frequency scales with player count.
