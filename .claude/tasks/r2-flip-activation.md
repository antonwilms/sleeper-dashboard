# R2-REANCHOR activation — flip projection attribution to per-season-team, hold the ungraded dynasty channels

**Type:** Session-1 implementation plan (planning only — no source edited this session). Scoring-affecting ⚑, **backtest-gate CLEARED** — this is the authorized activation of the dormant R2-REANCHOR merge, not a new ungated change.
**Date:** 2026-07-10.
**App HEAD at planning:** `58e9ed8ea2185186b0513484e03b71a00a3d5ffb` ("plan: reconcile roadmap/assessment with landed E-0a verdict") = `origin/main`, verified via GitHub MCP `list_commits`; every line anchor below is grounded at this SHA.
**Authorization record:** data repo `grading/2026-07-09-r2flip-verdict.md` (file SHA `447c76c98bfa525ad77e998500c4ff2646842a68`, commit `1912d2beca37c965173d572efcb7ffe19776c5f5`, read via GitHub MCP) — verdict **FLIP-CLEARS**, N=1309 panel rows, sensitive cohort improving (WR ΔMAE −0.004 / RB −0.061 / TE −0.027, TE n=28 non-decisive), row parity + QB canary clean. Companion `backtests/2026-07-09-r2flip-fit.json` committed. The gate's §11 (data repo `.claude/tasks/r2-flip-gate.md`) pre-specifies this slice; its items 1–4 are all covered below.
**Dormant merge confirmed present at HEAD:** `DEFAULT_ATTRIBUTION = 'current-team'` (`src/utils/teamContext.js:7`), `resolveAttributedTeam` (`teamContext.js:16`), `attribution` arg on `computeNextSeasonProjection` (`seasonProjection.js:263`), T-1 parity tests (`teamContext.test.js:132/225/268`) + `DEFAULT_ATTRIBUTION` pin (`teamContext.test.js:355-358`).
**Substrate (read, do not re-derive):** `.claude/tasks/projection-reanchor-per-season-team.md` (the dormant merge; §9 [on-flip] items applied here), data repo `.claude/tasks/r2-flip-gate.md` §11.

---

## 1. Decision summary

| Channel | Consumes | Post-activation | Why |
|---|---|---|---|
| Projection Step 3 share trend (`seasonProjection.js:341-361`) | `historicalShares` | **per-season-team** (flip) | The graded channel — the gate's cleared movement is exactly shareTrend's Y−1 leg |
| Projection Step 5h team-RZ share (`seasonProjection.js:488-497`) | `historicalTeamTotals` + `attribution` arg + cohort | **per-season-team** (flip) | Projection consumer of `computeHistoricalTeamTotals` — in the flip scope; join team, denominators, and cohort move together (internally consistent) |
| Dynasty share-trend boost (`dynastyScore.js:894-903`) | `historicalShares` | **HELD current-team** | Discrete ±8/4 categorical injection into a user-facing score; NOT in the graded panel (panel grades next-season PPG, not dynasty scores). Gate §11.2 names hold-at-flip the conservative default; RB feature-level p90 \|Δ\| = 0.0555 share units is label-boundary-relevant |
| Dynasty OQ share score + carryShare/targetShare/teamOffenseRank signals (`dynastyScore.js:879, 218-223, 1049-1051`) | `teamContext.playerShares` (from `computeTeamContext`) | **HELD current-team** | `computeTeamContext` also defaults to `DEFAULT_ATTRIBUTION` — a bare constant flip would move this ungraded dynasty channel (shareScore is 30% of OQ) AND the workhorse-RB QB-mod gate (`signals.carryShare > 0.30`, `teamContext.js:96`). Must be pinned |
| Projection Step 7 team-offense rank (`seasonProjection.js:546`) | `teamContext.teamOffense` | **HELD current-team** (byte-identical pre/post) | Same `teamContext` object as above. Step 7 is NOT a consumer of `computeHistoricalShares`/`computeHistoricalTeamTotals` (out of the authorized flip scope) and its aggregation shift was not in the graded panel. Holding the single memo keeps both consumers pinned |
| Role ranks (`dynastyScore.js:372-401`) | `historicalShares` | **rides per-season** | Verified display-only (§4) — correctness improvement, no score/projection feed |
| Display ride-alongs: Profile Role-History (`usePlayerProfile.js` via ProfileDataContext), Outlook opp-trend (already per-season view path) | `historicalShares` / own path | ride per-season | View-only |

**Net effect:** projection moves through the cleared channel (Step 3) plus the explicitly-in-scope Step 5h; ZERO ungraded dynasty-score movement; role ranks and profile displays improve.

**Known, documented display divergence:** the dynasty `signals` block (`shareTrendLabel`, `currentShare`, `shareHistory` — `dynastyScore.js:1054-1057`) will show **current-team**-attributed data (it must honestly mirror what the held score consumed), while the Profile Role-History table and role ranks show per-season data. This is the visible face of the temporary asymmetry — documented in `docs/dynasty-scoring.md` (§6.2), not hidden.

**Confidence label:** untouched. `confidence` stays the sample-size band (`docs/projection.md:62` rationale unchanged); attribution changes no `qualifying` count, so no player's label moves.

---

## 2. Mechanism — the flip/hold split

**Control point (located live):** App.jsx builds ONE totals/shares pair and ONE teamContext with no options, then threads them to both paths:
- `teamContext` memo — `src/App.jsx:185-190` (`computeTeamContext(careerStats, leagueData.playerMap, currentSeason)`, no options)
- `historicalTeamTotals` memo — `src/App.jsx:202-205` (no options)
- `historicalShares` memo — `src/App.jsx:207-210` (no options)
- consumers: `computeDynastyScore` call (`App.jsx:353-366`; `teamContext` arg line 362, `historicalShares` arg line 364; memo deps line 426), `computeRoleRanks(playerRowsFinal, historicalShares)` (`App.jsx:477`, deps 483), `computeNextSeasonProjection` call (`App.jsx:503-521`; `historicalShares` line 509, `teamContext` line 511, `historicalTeamTotals` line 519; deps 528), `PlayersTab` prop `historicalShares` (`App.jsx:1022` → ProfileDataContext, display).

**Chosen mechanism: two attribution-specific object pairs at the call site** (the task's option (a)), NOT threading an `attribution` override into `computeDynastyScore`. Reasons, grounded in live source:
1. `computeDynastyScore` consumes a **precomputed** `historicalShares` param (`dynastyScore.js:622`); it never touches `resolveAttributedTeam`. Threading a mode into it would force it to rebuild shares internally (per-player — O(players × seasons × players)) or grow a second shares param anyway. Passing a pre-built current-team object is the least-invasive hold and touches zero scoring-module code.
2. Pairwise coherence (reanchor §2c): a shares object must be built from totals of the **same mode**. Two explicit memos make the pairing visible and testable.
3. `computeTeamContext`'s hold needs only one explicit options argument on the existing memo.

Cost: two extra O(players × seasons) passes at load (same complexity as the existing memos, which the perf instrumentation shows are cheap relative to `playerRows`). Acceptable.

---

## 3. Edits — grouped by file

### 3a. `src/utils/teamContext.js` — the flip itself (2 edits)

1. **Line 7** — the activation one-liner:
   ```js
   export const DEFAULT_ATTRIBUTION = 'per-season-team'
   ```
2. **Lines 1–6 header comment** — rewrite (it currently says the default "flips … ONLY in the activation commit"; that commit is this one):
   ```js
   // Historical-attribution modes. 'per-season-team' (the default since the
   // R2 activation, 2026-07-XX; gate FLIP-CLEARS — data repo
   // grading/2026-07-09-r2flip-verdict.md) = careerStats[season][pid].team
   // (season-totals v3), falling back to the current team when the season
   // record carries no team (live-API-aggregated seasons, v1/v2 cache
   // entries, API-only mode). 'current-team' = legacy playersMap attribution;
   // still explicitly pinned by the dynasty-score path (App.jsx) pending its
   // own graded migration — see .claude/tasks/r2-flip-activation.md §1.
   ```
   (Replace `2026-07-XX` with the actual commit date.)
3. **Lines 207–213 `computeHistoricalTeamTotals` header comment** — one tense fix: `"in 'current-team' mode (the default)"` → `"in 'current-team' mode (legacy; the pre-R2 default)"`. The rest of the comment is already mode-conditional and stays.

Nothing else in this file changes. `resolveAttributedTeam`, both compute functions, `computeShareTrend`, `computeQBQualityByTeam`, `applyQBQualityModifier`, `buildTeamDepthChart`: untouched.

### 3b. `src/App.jsx` — the hold wiring (5 edits)

1. **`teamContext` memo (lines 185–190)** — pin explicitly and say why:
   ```js
   const teamContext = useMemo(() => {
     if (!careerStats || !leagueData) return null
     const allSeasons = Object.keys(careerStats).map(Number).sort()
     const currentSeason = allSeasons[allSeasons.length - 1]
     // HELD at current-team: feeds the dynasty OQ share score + carryShare
     // gate (ungraded) and projection Step 7 (not gate-covered). Pinned until
     // the dynasty attribution migration clears its own gate.
     return computeTeamContext(careerStats, leagueData.playerMap, currentSeason, { attribution: 'current-team' })
   }, [careerStats, leagueData])
   ```
2. **New memos, insert directly after the `historicalShares` memo (after line 210)** — the pinned pair for the dynasty boost (names: `historicalTeamTotalsCurrentTeam` / `historicalSharesCurrentTeam`):
   ```js
   // Current-team-pinned pair for the dynasty share-trend boost — the boost is
   // an ungraded score channel and does not ride the R2 per-season flip.
   // Pairwise coherence: shares MUST be built from totals of the same mode.
   const historicalTeamTotalsCurrentTeam = useMemo(() => {
     if (!careerStats || !leagueData?.playerMap) return null
     return computeHistoricalTeamTotals(careerStats, leagueData.playerMap, { attribution: 'current-team' })
   }, [careerStats, leagueData])

   const historicalSharesCurrentTeam = useMemo(() => {
     if (!careerStats || !leagueData?.playerMap || !historicalTeamTotalsCurrentTeam) return null
     return computeHistoricalShares(careerStats, leagueData.playerMap, historicalTeamTotalsCurrentTeam, { attribution: 'current-team' })
   }, [careerStats, leagueData, historicalTeamTotalsCurrentTeam])
   ```
3. **`computeDynastyScore` call (line 364)** — swap the `historicalShares` positional arg to `historicalSharesCurrentTeam`; **memo deps (line 426)**: replace `historicalShares` with `historicalSharesCurrentTeam` in the `playerRows` dependency array.
4. **`computeRoleRanks` call (line 477) — no change** (keeps `historicalShares`, now per-season; §4 finding). Deps at 483 unchanged.
5. **`historicalTeamTotals` (202–205) / `historicalShares` (207–210) memos, `seasonProjections` call (509/511/519) and deps (528), `PlayersTab` prop (1022) — no change.** Defaults flow per-season through them after the constant flip; the projection's own `attribution = DEFAULT_ATTRIBUTION` (`seasonProjection.js:263`) matches, so shares/totals/Step-5h-join flip together coherently.

### 3c. No other source files change

`seasonProjection.js`, `dynastyScore.js`, `teamRzShare.js`: zero edits — the dormant merge already threaded everything. `factorsSchema.test.js` and `statKeysContract.test.js` must pass with **zero edits** (no factors key or stat key changes — values move only).

---

## 4. Role ranks — verify-then-decide finding (verified: display-only → rides)

`computeRoleRanks` output (`roleRank`) traced at HEAD; complete consumer list:
- `App.jsx:477-481` — merged into `playerRanks` → `playerRowsWithRanks`.
- `PlayersTab.jsx:324, 1235, 2067` — Role chip rendering; `PlayersTab.jsx:1838` — sort-column handling (`col === 'roleRank'`).
- `ui/RankingsRow.jsx:13, 31` — the Role rank chip.
- `usePlayerProfile.js:141, 226` — reads `playerRow.roleRank` for the Profile.

`roleRank` is **never** read by `seasonProjection.js`, `dynastyScore.js`, `projectionSnapshot.js`, or any `factors`/score computation (`computeNextSeasonProjection` receives explicit named inputs at `App.jsx:503-521` — no row fields). **Decision: let role ranks ride per-season attribution** as a display-correctness improvement. This is deliberate, not accidental — the Role chip reranks on activation day; stated in docs (§6.4).

---

## 5. Tests

### 5a. `src/utils/teamContext.test.js` — re-specify the T-1 golden guards (4 edits)

The three T-1 blocks currently pin `no-options ≡ explicit current-team`; that expectation is obsolete at activation. New expectation everywhere: **no-options ≡ explicit per-season-team, and ≠ explicit current-team on the mover/retired fixture**. Keep every legacy pin — moved onto the `explicitCurrent` object — so legacy behavior stays recorded and the held dynasty path stays characterized.

1. **`DEFAULT_ATTRIBUTION` describe (lines 355–358)** — flip the single assertion (this is the pre-arranged activation edit from reanchor §10):
   ```js
   it('R2-FLIP: per-season-team is the default — activated 2026-07-XX (gate FLIP-CLEARS, data repo 2026-07-09-r2flip-verdict)', () => {
     expect(DEFAULT_ATTRIBUTION).toBe('per-season-team')
   })
   ```
2. **`computeHistoricalTeamTotals` T-1 (line 132)** — re-title to `R2-FLIP T-1: no-options is deep-equal to explicit per-season-team mode; current-team remains available for the held dynasty path`; assert:
   - `noOptions` `toEqual` explicit `{ attribution: 'per-season-team' }`; `noOptions` `not.toEqual` explicit `{ attribution: 'current-team' }`.
   - Per-season pins on `noOptions` (mirror T-3's expected values, derived from the same fixture: mover 2023 rushAtt 100 on team A, 2024 90 on team B; teammates A 60/65, B 75, C 50/55): `noOptions[2023].A.rushAtt === 160`, `noOptions[2023].C.rushAtt === 50`, `noOptions[2024].B.rushAtt === 165`, retired team-D entry **defined** in 2023 (undercount repair).
   - Legacy pins retained on `explicitCurrent`: `[2023].C.rushAtt === 150`, `[2023].A.rushAtt === 60`, `[2024].C.rushAtt === 145`, `[2023].D` undefined.
3. **`computeHistoricalShares` T-1 (line 225)** — same restructure. Totals for the no-options call must now be built per-season (or with no options); keep a second explicit current-team totals+shares pair for the legacy pins. Per-season pins on `noOptions`: mover 2023 share `100/160 = 0.625`, 2024 share `90/165 → 0.545` (r3). Legacy pins on the explicit-current pair: `100/150`, `90/145`. `retired` has no share row in **both** modes (absent from playersMap — position gate).
4. **`computeTeamContext` T-1 (line 268)** — same restructure for currentSeason 2024. Per-season pins on `noOptions` (mirror T-5): `playerShares.mover.carryShare ≈ 90/165 → 0.545`, `playerShares.mover.teamOffenseRank === noOptions.teamOffense.B.rank`. Legacy pins on `explicitCurrent`: carryShare `90/145`, rank = team C's.

(Verify the derived per-season numbers against the already-passing T-3/T-4/T-5 pins before writing — they use the same `REANCHOR_*` fixtures with explicit per-season mode.)

### 5b. NEW — dynasty hold guard, `src/utils/dynastyScore.test.js`

**The divergent-mover fixture** (engineered so the trend LABEL differs between attributions — the REANCHOR fixture's mover is 'shrinking' in both modes and cannot catch a hold regression). All RB, `gamesPlayed: 14`, rush_att as stated, playersMap teams in parens:

| Player (current team) | 2023 | 2024 |
|---|---|---|
| mover M (C) | team A, rush_att 20 | team B, rush_att 80 |
| teammateA (A) | A, 180 | A, 180 |
| teammateB (B) | B, 100 | B, 120 |
| teammateC (C) | C, 20 | C, 400 |

- Per-season shares for M: 2023 `20/200 = 0.1`, 2024 `80/200 = 0.4` → trend `(0.4−0.1)/0.1 = 3.0` → **'growing'** → boost **+8**.
- Current-team shares for M (all volume pooled into C): 2023 `20/40 = 0.5`, 2024 `80/480 = 0.167` → trend `≈ −0.667` → **'declining'** → boost **−8**.

**Test 1 — fixture sensitivity (input divergence pin):** build both totals+shares pairs via `computeHistoricalTeamTotals`/`computeHistoricalShares` with explicit modes; assert `computeShareTrend(sharesPerSeason.M).shareTrendLabel === 'growing'` and `computeShareTrend(sharesCurrentTeam.M).shareTrendLabel === 'declining'`. This proves the hold is load-bearing, not vacuous.

**Test 2 — the hold itself:** call `computeDynastyScore` twice for M (reuse the file's existing minimal-fixture scaffolding for curves/peakPPG/etc.), identical args except `historicalShares` = the current-team pair vs the per-season pair. Assert:
- held call: `signals.shareTrendLabel === 'declining'` and `signals.shareHistory` equals the current-team series (`[0.5, 0.167]` tail) — i.e. a mover's shareTrendBoost is **unchanged from pre-flip** when the wired input is the pinned pair;
- the two calls' `score` differ (16-point OQ boost swing propagates) — proving an accidental unpinning would be visible.

### 5c. NEW — wiring guard, `src/__tests__/attributionHold.test.js`

Source-text contract test in the repo's established `readFileSync` guard idiom (cf. `advStatsViewOnly.test.js`). Read `src/App.jsx` and assert:
1. the `computeTeamContext(` call passes `{ attribution: 'current-team' }` (regex allowing whitespace/newlines);
2. `historicalSharesCurrentTeam` is built from `historicalTeamTotalsCurrentTeam` with `{ attribution: 'current-team' }` (pairwise-coherence guard);
3. the `computeDynastyScore(` call block contains `historicalSharesCurrentTeam` (multi-line regex over the call parenthesis span);
4. the `computeRoleRanks(` call passes `historicalShares` and NOT `historicalSharesCurrentTeam`;
5. the `computeNextSeasonProjection(` call block contains `historicalShares,` and `historicalTeamTotals,` (the per-season defaults) and does NOT contain `historicalSharesCurrentTeam`/`historicalTeamTotalsCurrentTeam`, and passes no `attribution:` override.
Header comment: this file is the machine check that the R2 flip's hold survives refactors; delete it when the dynasty migration lands.

### 5d. `src/utils/seasonProjection.test.js` — one new test (Step 3 now reflects per-season shares)

T-7/T-8 pass explicit modes and survive unchanged. Add **T-10 (Step 3 flip evidence):** hand-construct two `historicalShares` params for one vet RB (careerStats fixtures need no `team` field — Step 3's mode is decided at share-build time): the divergent series `[{season:2023, share:0.1, gamesPlayed:14}, {season:2024, share:0.4, gamesPlayed:14}]` vs `[{…share:0.5…}, {…share:0.167…}]`, `isTeamChange` null. Assert via the existing Step-3 factors keys (see `factorsSchema` key list; `shareTrendRaw`/multiplier): growing series → raw 1.08, volatility 'volatile' → multiplier `1.04`; declining series → raw 0.92 → multiplier `0.96`; and `projectedPPG` differs accordingly. This is the "projection value that must now reflect per-season" edge case: post-flip, App.jsx feeds the projection the per-season object, so a mover's projection moves where the pinned dynasty boost must not (5b covers the must-not half).

### 5e. Existing-suite impact statement

- `teamContext.test.js` T-2/T-3/T-4/T-5, `teamRzShare.test.js` T-6, `seasonProjection.test.js` T-7/T-8/T-9: all pass explicit modes — **zero edits**.
- Tests calling the compute functions with no options on fixtures **without** `team` fields (e.g. `teamContext.test.js:120-124` zero-GP test) are mode-invariant via the fallback — zero edits. If any unexpected failure appears, the fixture carries a `team` field and the test was silently default-dependent: fix by passing the explicit mode the test means, never by changing source.
- `factorsSchema.test.js` / `statKeysContract.test.js`: **must pass with zero edits** (contract: no key changes).

---

## 6. Docs updates (every file; before → after)

### 6.1 `docs/projection.md`

1. **Line 46** (mode-gated framing) — replace the parenthetical: `("'current-team' until the retrospective gate clears — see .claude/tasks/projection-reanchor-per-season-team.md §7)` → `("'per-season-team' since 2026-07-XX — R2 gate cleared FLIP-CLEARS, data repo grading/2026-07-09-r2flip-verdict.md; the dynasty-score path is explicitly pinned to 'current-team' pending its own graded migration, see docs/dynasty-scoring.md)`.
2. **Line 58** (pre-flip rationale paragraph) — rewrite to past tense: `"Pre-flip ('current-team' mode) the original data-corruption rationale still applies: …"` → `"Historical note: pre-flip ('current-team' mode, until 2026-07-XX) the original data-corruption rationale applied — the share numerator was old-team usage joined against denominators that didn't correspond to it. Post-flip the neutralization survives purely as the un-validated-transfer belief above."`
3. **Line 60** (Intentionally NOT changed list) — extend the Steps 7/7b entry: `"Steps 7/7b (team offense + QB1 quality — both key on the current/new team and are already forward-looking)"` → `"Steps 7/7b (team offense + QB1 quality — both key on the current/new team and are already forward-looking; Step 7's aggregation input additionally stays current-team-attributed because the app's single teamContext object is pinned for the dynasty score — see docs/dynasty-scoring.md attribution-asymmetry note)"`.
4. **Line 64** — replace whole line: `"**Implemented behind the gate:** re-anchoring ships dormant (DEFAULT_ATTRIBUTION); activation is blocked on the R1-HARNESS before/after report. The cross-repo data prerequisite (per-season team) landed in season-totals v3."` → `"**Activated:** DEFAULT_ATTRIBUTION = 'per-season-team' since 2026-07-XX (R2 flip gate cleared FLIP-CLEARS — data repo grading/2026-07-09-r2flip-verdict.md, panel 2020–2024, sensitive cohort improving). Snapshots from that date forward carry per-season-attributed shareTrend/teamRzShare values; pre/post cohorts are distinguishable by snapshot date."`
5. **Line 87** (Step 5h paragraph) — `"(resolveAttributedTeam — current team in legacy mode, the lastQ-season team once flipped)"` → `"(resolveAttributedTeam — the lastQ-season team since the flip; current team only via the provenance fallback below)"`.
6. **Line 89** (Data-quality limitation) — the reanchor §9-item-4 **[on-flip] rewrite**, replace the first two sentences with:
   > **Data-quality limitation (provenance-dependent fallback):** for v3-served seasons, denominators are complete — retired/departed players re-enter via their per-season team. The legacy undercount persists **only** where no per-season `team` exists and `resolveAttributedTeam` silently falls back to the current team: the live-API-aggregated in-season year, v1/v2 cache entries, and API-only mode. Consequence: **the same player can get different projections depending on cache provenance** — a v3-store session attributes his history per-season; a degraded session reproduces legacy current-team attribution. This is a deliberate availability-over-purity trade (reanchor §1); the ≥20 team-denominator guard and shrinkage guard the residual cases.

   Keep the rest of the paragraph (category recording, factors keys, rookie sentinels, neutralization pointer) unchanged.

### 6.2 `docs/dynasty-scoring.md`

1. **Line 95** — currently: `"Share attribution follows teamContext.js DEFAULT_ATTRIBUTION (per-season-team once flipped); note the boost has NO team-change neutralization (unlike projection Steps 3/5h) — a known asymmetry, follow-up candidate."` This becomes **false** at activation (the boost no longer follows the default). Replace with:
   > **Attribution asymmetry (temporary, deliberate):** since the R2 flip (2026-07-XX) the projection attributes historical shares per-season-team, but the share-trend boost is **pinned to current-team** — App.jsx feeds it an explicitly current-team-built `historicalSharesCurrentTeam` pair, because the boost is a discrete ±8/4-point injection into a user-facing score and was not in the graded panel (gate §11.2 names hold-at-flip the conservative default). The dynasty OQ share score, `carryShare`/`targetShare`/`teamOffenseRank` signals, and the workhorse-RB QB-mod gate are likewise pinned via the current-team `teamContext` memo. Consequence: the dynasty `signals` share fields (`shareTrendLabel`, `currentShare`, `shareHistory`) honestly reflect current-team attribution while the Profile Role-History table and role ranks show per-season data. Migrating the dynasty channels is a separate future slice that must first solve dynasty-score validation (not point-gradable like PPG). The boost still has NO team-change neutralization — unchanged known asymmetry, follow-up candidate.
2. **Line 97** (QB quality modifier paragraph) — append one sentence: `"The workhorse-RB carry-share gate reads signals.carryShare, which is current-team-pinned (see the attribution-asymmetry note above)."`

### 6.3 `docs/signal-registry.md`

1. **Line 46** (NFL per-season team row) — currently claims `"never feeds projection/scoring"`; false post-flip. Replace *Current use* cell with: `"**scoring-load-bearing since the R2 flip (2026-07-XX)** — feeds projection Steps 3/5h attribution (careerStats[season][pid].team via resolveAttributedTeam); also view-only display (NFL-stats game-log schedule join — NflStatsTab; Outlook share attribution — OutlookTab); dynasty-score channels remain current-team-pinned; resolution for view surfaces via playerTeam.resolvePlayerTeam"`.
2. **Line 78** (Share trend row) — `"attribution mode-gated ('current-team' default until the R2 gate clears)"` → `"attribution per-season-team since the R2 flip (2026-07-XX); dynasty boost consumes a current-team-pinned copy"`.
3. **Line 90** (Team-RZ-share row) — same replacement as row 78 for the mode-gated clause, **and** (reanchor §9-item-9 [on-flip]) drop `"(denominator over active players — minor undercount)"` from the Reconstructable cell → `"Reconstructable (denominator complete for v3-served seasons; fallback provenance retains the legacy undercount)"`.

### 6.4 `docs/architecture.md`

**Line 112** (`historicalShares` memo description) — the trailing claim `"historicalShares itself stays **current-team** and continues to feed the projection/dynasty share-trend + role-rank path and the Player Profile Role-History table"` becomes false. Replace that sentence with:
> `historicalShares` is **per-season-team** since the R2 flip (2026-07-XX) and feeds projection Step 3, `computeRoleRanks`, and the Player Profile Role-History table. A second, **current-team-pinned** pair — `historicalTeamTotalsCurrentTeam` + `historicalSharesCurrentTeam` — feeds only `computeDynastyScore`'s share-trend boost (ungraded channel, held; see docs/dynasty-scoring.md attribution-asymmetry note). The `teamContext` memo is likewise pinned `{ attribution: 'current-team' }` (dynasty OQ share score + projection Step 7 input).

Also add the two new memos to the memo inventory list in the same section (one line each, mirroring the wording above). Role-rank note: the Role chip reranked on activation day (per-season reattribution) — one clause suffices.

### 6.5 `CLAUDE.md` (app)

1. **§src/utils table, `teamContext.js` row** — `"historical attribution is mode-gated (DEFAULT_ATTRIBUTION/resolveAttributedTeam — per-season-team re-anchor, backtest-gated flip)"` → `"historical attribution is mode-gated (DEFAULT_ATTRIBUTION = 'per-season-team' since the R2 flip 2026-07-XX; dynasty-score channels explicitly pinned current-team — see docs/dynasty-scoring.md)"`.
2. **§State and data flow, "Also upstream:" paragraph** — currently: `"historicalTeamTotals + historicalShares (from computeHistoricalTeamTotals / computeHistoricalShares; used both in computeDynastyScore share trend boost and in computeRoleRanks)"` → `"historicalTeamTotals + historicalShares (per-season-team; feed the projection and computeRoleRanks) + historicalTeamTotalsCurrentTeam + historicalSharesCurrentTeam (current-team-pinned; feed only the computeDynastyScore share-trend boost — R2 hold); teamContext is current-team-pinned"`.

### 6.6 `README.md`

Checked at HEAD: the only attribution-adjacent text is the `seasonRanks.js` tree line; the projection blurb does not repeat the share-trend attribution description. **No change.** (Implementer: re-grep `attribution\|current-team\|per-season` to confirm nothing landed since.)

### 6.7 `src/utils/teamRzShare.js` `MIN_TEAM_DENOM` comment

Reanchor §9 item 7 was applied at merge (comment already reads "undercount largely resolved by per-season attribution; fallback modes retain it") — verify, expect **no change**.

---

## 7. Cross-repo impact (output only — do NOT edit the data repo in this slice)

**Contracts: no shape change.** No `factors` key added/renamed/removed → no snapshot `schemaVersion` bump, nothing for `register-snapshots.mjs` or the grader. Season-totals v3 consumed as already contracted. What changes is the **status** of an existing field: v3 per-season `team` graduates from view-only to scoring-load-bearing.

The task summary (and the eventual sibling-repo session) must carry these two annotations **verbatim**, per gate §11.4 — effective-dated to the flip commit:

1. **Data repo `CLAUDE.md`, Cross-repo contracts table, season-totals row — append:**
   > Per-season `team` is **scoring-load-bearing** in the app since the R2 flip (2026-07-XX): it feeds projection Steps 3/5h attribution (`resolveAttributedTeam`). The dominant-team derivation in `lib/sleeper.mjs` `aggregateWeeks` (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) is therefore a **silent-scoring-change surface** — any edit to that rule changes app projections with no app-side diff. Treat changes as scoring changes: flag cross-repo and route through a graded gate.

2. **Data repo `data-catalog.md`, season-totals section — append one line:**
   > `team` (v3, per-season): scoring-load-bearing in the app since the R2 flip (2026-07-XX) — projection attribution consumes it; the `aggregateWeeks` dominant-team rule is a silent-scoring-change surface (see CLAUDE.md cross-repo contracts).

**Snapshot cohort convention:** the activation commit message must record the flip date (same convention as the 2026-06-12 bounce-back correction — `docs/projection.md` Step 5c precedent). Suggested subject: `feat: activate R2 per-season-team attribution (flip date YYYY-MM-DD; dynasty channels held current-team)`.

---

## 8. Step sequence for the implementer

1. `src/utils/teamContext.js`: flip the constant + both comment updates (§3a).
2. `src/App.jsx`: pin the `teamContext` memo; add the two current-team memos; swap the `computeDynastyScore` arg + `playerRows` deps (§3b).
3. Tests: re-specify the three T-1 blocks + the `DEFAULT_ATTRIBUTION` pin (§5a); add the dynasty hold guard (§5b), the wiring guard (§5c), and T-10 (§5d).
4. Docs §6.1–6.5 (README/teamRzShare: verify-no-change per §6.6/6.7).
5. `npm test` (full suite; `factorsSchema.test.js` + `statKeysContract.test.js` must pass with zero edits), `npm run lint`, `npm run build`. Do NOT start the dev server — visual verification is the user's job.
6. Task summary must state: the flip date; the held channels (boost, OQ share score, carryShare gate, Step 7 input, dynasty signals display); role ranks riding per-season (deliberate); the §7 cross-repo annotations verbatim for the sibling-repo session; the deferred dynasty-migration slice (blocked on a dynasty-score validation method); reanchor §4b's dynasty-neutralization asymmetry unchanged.

**Out of scope, do not do:** migrating any dynasty channel to per-season; touching the Step 3/5h team-change neutralizations (reanchor §4b — one change per gate); confidence-label changes; editing `src/__fixtures__/factories.js` or `season-totals-2025.json`; any data-repo edit.
