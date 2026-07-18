# Share-denominator fix — exclude `TEAM_<abbr>` aggregate pseudo-rows from `computeHistoricalTeamTotals`

**Type:** implementation plan (Session 1 output — no source edited).
**Date:** 2026-07-17.
**App HEAD:** `1ca1382c3eb1e210965cb904886e35970cffe304` = `origin/main` (verified via GitHub MCP `list_commits` + local `git rev-parse`; identical).
**Data HEAD:** `52eea562bc344f5fa3a56c99b21c3c51833561b2` = `origin/main` (verified via GitHub MCP; identical). All served-file numbers below derived from this commit's `nfl/season-totals/*.json`.
**Fact base:** `.claude/tasks/share-denominator-diagnostic.md` (2026-07-16, written at the same app HEAD). This plan does not re-derive its findings. Two corrections carried from plan review of the diagnostic: `lib/backtest.mjs` is NOT defective (membership-gated over advstats ids; only the `panel.mjs:67-81` half of the Q5 gate note stands), and the FLIP-CLEARS verdict is unaffected (doubling was common-mode across both arms).

## Objective

`computeHistoricalTeamTotals` (`src/utils/teamContext.js:216-235`) must exclude Sleeper's `TEAM_<abbr>` whole-team aggregate pseudo-rows so the Profile Role-History share and the Outlook RUSH SHARE tile compute the same quantity from the same denominator. Acceptance: Jonathan Taylor (`6813`) Role History shows **67% (2021) … 73% (2025)** instead of 33%/37%, and every value in §4 pins exactly.

Decided approach (settled in the task brief, not re-opened): filter the aggregate rows out and keep summing players. The dynasty-score channels stay pinned current-team and must be byte-identical after this change.

---

## §1 Filter basis — decision

**Chosen: explicit `TEAM_` id-prefix exclusion via a new exported predicate `isTeamAggregateId(playerId)` in `teamContext.js`. NOT playersMap-membership gating.**

One-line justification: **membership gating would silently regress the settled R2 denominator repair** — per-season mode deliberately keeps directory-absent (retired) players in historical totals (`teamContext.js:209-215` module comment: "retired players re-enter totals via their season-record team"), and that semantic is pinned by existing tests (`src/utils/teamContext.test.js` REANCHOR T-1 line 144-145, T-3 line 164-165, T-4 line 275: a `retired` id absent from `REANCHOR_PLAYERS_MAP` must contribute `rushAtt 80` to team D). A membership gate flips those three assertions and re-litigates R2. Prefix exclusion removes exactly the doubled entity class and nothing else.

Findings against the brief's evaluation criteria:

- **playersMap in scope:** yes — it is already argument #2 of `computeHistoricalTeamTotals` (line 216), so membership gating would have needed no threading. Feasibility was not the decider; the R2 semantic was.
- **DST keying (verified):** playersMap keys team defenses by **bare abbreviation** (runtime-verified: `/players/nfl` has `data['IND']` with `position: 'DEF'` and **zero** `TEAM_*` keys among 12200 entries). Season files carry a matching `<abbr>` DEF row per team (`team: '<abbr>'`, `gamesPlayed: 17`) with **no offensive stat keys** — verified `rush_att`/`rec`/`rec_tgt`/`rush_rz_att`/`rec_rz_tgt` all absent/null in every season 2020-2025. **No collision is possible under either gate**: `TEAM_IND` and `IND` are distinct keys; DEF rows pass the prefix filter but contribute 0 to all five sums. (Had a collision existed, prefix-exclusion would have won anyway per the brief.)
- **Robustness to other pseudo-entities:** the non-numeric id population per served season is exactly 32 `TEAM_*` + 32-33 `<abbr>` DEF (2021 has a 33rd abbr-shaped DEF entry) + one legacy oddball `1339z` (2021, team PHI, gp 1, rec_tgt 6, fp 10.9 — a real player-shaped record, not an aggregate; it contributes today and continues to, unchanged). Membership would be more robust to *hypothetical future* pseudo-entities, but at the price of excluding real directory-absent players (the R2 regression). The pseudo-id scheme is instead pinned as cross-repo contract (§7) so a scheme change is a coordinated breaking change, not silent drift.
- **Failure loudness:** covered by the §3 guard package (real-data contract test + synthetic pins + a runtime `share > 1` tripwire following the existing `console.warn` idiom, e.g. `dynastyScore.js:80,655`).
- **Shared helper:** the two surfaces cannot literally share one gate — `buildTeamShareTotals` (`outlookPositionStats.js:32-52`) *needs* its membership gate (its documented view-only semantic, JSDoc line 29: "membership gate only") and membership already subsumes prefix exclusion there (playersMap never carries `TEAM_*` keys). The shared artifact is therefore the **named predicate**: `isTeamAggregateId` becomes the single greppable definition of the excluded entity class, used by `computeHistoricalTeamTotals` now and by any future consumer (notably `computeTeamContext` if the dynasty pin ever lifts). Outlook code is not touched (CLAUDE.md: don't refactor working utilities) — only its two stale comments are corrected (Edits 6-7).

Post-fix equivalence of the two surfaces: on store-served v3 data both denominators are numerically identical (per-season player sums; verified IND 2021/2024/2025 = 499/496/442 both ways). Residual mechanism differences are documented, not new: Outlook drops directory-absent ids (view-only choice) and uses `resolvePlayerTeam` with no current-team fallback, while `computeHistoricalTeamTotals` keeps retired players (R2) and falls back per `resolveAttributedTeam` — both differences move real denominators by ~0 on served data.

## §2 Consumer sweep (all verified against live source at HEAD)

Consumers of `computeHistoricalTeamTotals` / `computeHistoricalShares` and what changes when denominators halve (doubled → true; shares double):

| # | Consumer | Change |
|---|---|---|
| 1 | **Profile Role History + usage chip** — `historicalShares` memo (`App.jsx:210-213`) → ProfileDataContext (`App.jsx:1038`; providers `PlayersTab.jsx:2243`, `OutlookTab.jsx:558`, `NflStatsTab.jsx:392` — pass-throughs to the embedded PlayerProfile) → `usePlayerProfile.js:142-145` (`shareHistory`, slice(-5)) and `:183-186` (`usageShare`) → render `PlayersTab.jsx:543-583` | **The headline fix.** Displayed shares double to true values: Taylor 33/22/18/31/37 → **67/44/35/61/73** (2021-2025). Now agrees with the Outlook tile (73.1% level, +12.0 trend). |
| 2 | **Projection Step 3 share trend** — `seasonProjection.js:341-361` ← `historicalShares` (arg at `App.jsx:525`) | `shareTrendLabel` **invariant** (trend ratio is scale-free; only 3-dp share rounding wobbles it: Taylor 0.465→0.466, both `growing`). `shareVolatility` (absolute SD, thresholds 0.05/0.10 at `teamContext.js:315-320`) **doubles** → labels shift one direction, toward *more* volatile → `shareVolatilityScale` (1.00/0.80/0.50 at `seasonProjection.js:351-355`) drops for re-labeled players → Step-3 deviation is *more* damped (the intended damping restored). Taylor: `moderate`→`volatile`, multiplier 1.064 → **1.040** → projectedPPG moves slightly for label-crossers. The `Math.max(priorShare, 0.01)` floor (line 304) now binds only below a true 1% share. |
| 3 | **Projection Step 5h team-RZ share** — `seasonProjection.js:487-497` → `computeTeamRzShareFactor` (`teamRzShare.js:127-169`) ← `historicalTeamTotals` (arg at `App.jsx:535`) | Recorded `teamRzShare` **doubles to the true value** (Taylor 2025: 0.347 → **0.693** = 70/101). `teamRzShareFactor` ≈ invariant — `percentileRank` (strict `<`) is exact under uniform positive scaling — **except** the `MIN_TEAM_DENOM = 20` gate (`teamRzShare.js:88,148`): teams with true denom 10-19 (real per the line-53 comment: 2024 min legit rush ≈ 10) previously passed at 2x and now correctly go NEUTRAL and leave the cohort pools (`buildCohortTable:68-99`) → small second-order percentile shifts. Cohort membership itself was never contaminated (position lookup at line 76 already fails for `TEAM_*` ids). Snapshot-era note required (§6). |
| 4 | **Role ranks** — `computeRoleRanks` (`dynastyScore.js:372-401`) ← per-season `historicalShares` (`App.jsx:493`) | Weighted shares double **uniformly** → within-position ordering preserved (only 3-dp rounding ties can break) → ranks unchanged in practice. |
| 5 | **Dynasty channels (R2 hold)** — `historicalTeamTotalsCurrentTeam`/`historicalSharesCurrentTeam` (`App.jsx:218-226`) → `computeDynastyScore` arg (`App.jsx:380`) → boost (`dynastyScore.js:895-903`) + `signals.shareHistory/currentShare` (`dynastyScore.js:1049-1057`); `teamContext` memo pinned current-team (`App.jsx:192`) → OQ share score (`dynastyScore.js:218-223,879`) + workhorse-RB gate (`teamContext.js:98`) | **Byte-identical — provable no-op.** In current-team mode `resolveAttributedTeam` (line 20) reads `player?.team` only, so any id absent from playersMap already resolved to null and was skipped pre-fix; the prefix skip removes only rows that contributed nothing. `computeTeamContext` is not edited at all. Guarded by `dynastyScore.test.js:1180-1242` (HOLD fixtures are fully directory-membered and `TEAM_`-free → unaffected), `src/__tests__/attributionHold.test.js` (App.jsx wiring untouched), and new test T-N2. **No input reaching `computeDynastyScore` changes.** |
| 6 | **Outlook own columns / Opp trend** — `outlookPositionStats.js` + `outlookUsage.js` (separate view-only path; `outlookUsage` references `computeHistoricalShares` in comments only, no import) | Untouched, already correct. |

Nothing beyond this list references either function in `src/` (grep-verified; remaining hits are tests). The diagnostic's Q5 table is confirmed with one refinement: Step 3 volatility labels shift toward *volatile* (not "toward entrenched" — that was the pre-fix distortion's direction; the fix reverses it).

## §3 Live-season hazard + guard

Hazard (diagnostic Q5): a live-API-aggregated season (no `TEAM_` rows, no `team` fields — `sleeperStats.js:161-234` filters to `activePlayerIds` and writes no team) coexisting with store seasons. **The filter removes the mixed-scale hazard by construction**: both season types now sum individual players only, so the share series is scale-uniform across provenance (the residual current-team-fallback attribution difference for team-less seasons is the already-documented provenance limitation, `docs/projection.md:89`).

Guard package (loud-first, each failure direction covered by the loudest feasible mechanism):

1. **Real-data contract test** (`src/__tests__/seasonTotalsEntityFilter.test.js`, §Tests B) over a new verbatim served-data fixture. Trips if: the filter regresses (884 instead of 442), the served entity shape drifts on regeneration (TEAM_IND presence/values pinned), or DEF rows grow offensive keys.
2. **Synthetic unit pins** (§Tests A): `TEAM_` exclusion in per-season mode; current-team byte-equality with/without a `TEAM_` row (the no-op proof, executable); **retired-non-member-still-included** (T-N2 — the exact assertion a future "helpful" membership gate would break first).
3. **Runtime tripwire:** `share > 1` is structurally impossible while the filter and attribution stay coherent (every numerator entry is summed into its own denominator bucket in the same mode). A `console.warn` in `computeHistoricalShares` (Edit 5) fires loudly if a denominator ever undercounts its own numerator — this catches the *reverse* direction (aggregate-only emission, filter/attribution incoherence). The *doubling* direction under a **renamed** pseudo-id scheme is not runtime-detectable by construction (unknown id, player-shaped row); it is covered by (1) on regeneration and by pinning the `TEAM_` prefix as cross-repo contract (§7) so a rename is a coordinated breaking change.
4. **Contract notes** in both repos (§6, §7) stating the entity composition explicitly — the diagnostic's Q6 gap.

**Fixture caveat discovered during planning:** the existing `src/__fixtures__/season-totals-2025.json` is a pre-v3 shape — 2750 keys, **zero** `TEAM_*` rows, **no `team` fields**. It cannot host this contract test (hence the new extract fixture) and its only consumer is `statKeysContract.test.js` (stat keys only) — leave it untouched; refreshing it is a separate follow-up, not this task.

## §4 Expected values — Jonathan Taylor (`6813`, IND every season), from served data at data HEAD `52eea56`

Per-season, rush share (RB): numerator = `stats.rush_att`; before-denominator = players+TEAM row; after-denominator = players only. `share` is 3-dp rounded (`teamContext.js:278`); "cell" is `Math.round(share*100)` (`PlayersTab.jsx:568`).

| Season | gp | rush_att | Denom before | Denom after | TEAM_IND row | share before → after | cell before → after |
|---|---|---|---|---|---|---|---|
| 2020 | 15 | 232 | 918 | **459** | 459 | 0.253 → **0.505** | 25% → 51% |
| 2021 | 17 | 332 | 998 | **499** | 499 | 0.333 → **0.665** | 33% → **67%** |
| 2022 | 11 | 192 | 877 | **438** | 439 | 0.219 → **0.438** | 22% → 44% |
| 2023 | 10 | 169 | 959 | **480** | 479 | 0.176 → **0.352** | 18% → 35% |
| 2024 | 14 | 303 | 992 | **496** | 496 | 0.305 → **0.611** | 31% → 61% |
| 2025 | 17 | 323 | 884 | **442** | 442 | 0.365 → **0.731** | 37% → **73%** |

Role History displays `slice(-5)` → **67, 44, 35, 61, 73** (2021-2025). Note the TEAM row ≠ player sum by ±1 in 2022/2023 — "exactly doubled" is exact to ±1; the after-denominator is the player sum, not `TEAM_row`.

Derived pins (full 6-season history, all gp≥8):
- `computeShareTrend` after: `shareTrendLabel = 'growing'` (trend ≈ 0.466), `shareVolatility ≈ 0.1439` → `volatilityLabel = 'volatile'` → Step-3 `shareVolatilityScale = 0.50`, `shareTrendMultiplier = 1.040`. (Before, for the record: 'growing' 0.465, SD ≈ 0.072, 'moderate', scale 0.80, multiplier 1.064.)
- Step 5h 2025: RZ denominators 202 → **101** (`rush_rz_att` sums); Taylor `teamRzShare` 0.347 → **0.693** (70/101, r3), `teamRzShareCategory 'rush'`.
- Full 2025 IND totals object after fix: `{ rushAtt: 442, rec: 351, recTgt: 514, rushRz: 101, recRz: 69 }` (before: 884 / 711 / 1044 / 202 / 138).

---

## Edits, grouped by file

### 1. `src/utils/teamContext.js` (the only behavioral source change)

**Edit 1 — new exported predicate** (insert after `resolveAttributedTeam`, i.e. after line 21):

```js
// Sleeper's weekly stats include whole-team aggregate pseudo-entities keyed
// `TEAM_<abbr>` (one per NFL team). Store-served season-totals files carry them
// verbatim (data repo, since 2026-05-19): full offensive stat keys, gamesPlayed
// 17, and a per-season `team` — structurally a player row apart from the id.
// Summing them alongside players exactly doubles every team denominator.
// `<abbr>` DEF entries also appear but carry no offensive stat keys (verified
// 2020–2025) and need no gate; live-API-aggregated seasons contain neither.
// Deliberately an id-prefix test, NOT a playersMap-membership gate: the R2
// per-season denominator repair requires directory-absent (retired) players to
// keep contributing to historical totals (see the retired-player pins in
// teamContext.test.js). The `TEAM_` prefix is cross-repo contract (data repo
// data-catalog.md); renaming it upstream is a coordinated breaking change.
export function isTeamAggregateId(playerId) {
  return typeof playerId === 'string' && playerId.startsWith('TEAM_')
}
```

**Edit 2 — apply the filter in `computeHistoricalTeamTotals`** (line 220-221; insert one line after the gp gate):

```js
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 1) continue
      if (isTeamAggregateId(playerId)) continue   // whole-team aggregate rows double the denominator
      const team = resolveAttributedTeam(data, playersMap[playerId], attribution)
```

**Edit 3 — extend the function's block comment** (lines 206-215): append one sentence to the existing note:

> Store-served files also carry `TEAM_<abbr>` whole-team aggregate pseudo-rows with a per-season `team`; they are excluded via `isTeamAggregateId` — unfiltered, every store-season denominator is exactly doubled.

**Edit 4 — breadcrumb comment on `computeTeamContext`** (append to the comment block at lines 127-131, no code change):

> NOTE: pinned `{ attribution: 'current-team' }` by its only caller (App.jsx), which drops `TEAM_*` rows via the playersMap lookup. If this path ever migrates to per-season attribution, it must adopt `isTeamAggregateId` — the aggregate rows carry a per-season `team` and would double these totals (and the fantasyPts ranking inputs) the same way.

**Edit 5 — `share > 1` tripwire in `computeHistoricalShares`** (insert after line 275, `if (share === null || !isFinite(share)) continue`, before the push):

```js
      if (share > 1) console.warn(`[teamContext] share > 1 (${share.toFixed(3)}) for ${playerId} season ${season} — team denominator smaller than its own contributor; entity-filter/attribution contract violated`)
```

(Unconditional `console.warn` with a `[module]` prefix is the established idiom — `dynastyScore.js:80,522,655`. Structurally unreachable on coherent data; see §3.3.)

**Do NOT touch:** `resolveAttributedTeam`, `computeTeamContext` code, `computeQBQualityByTeam`, `applyQBQualityModifier`, `computeShareTrend`, `buildTeamDepthChart`.

### 2. `src/utils/outlookPositionStats.js` (comment-only)

**Edit 6** — the `buildTeamShareTotals` JSDoc (lines 20-27) misdocuments the mirror: "Mirrors computeHistoricalTeamTotals (teamContext.js:191) discipline — gamesPlayed>=1 AND present-in-playerMap players". Replace that opening clause with:

> Same gamesPlayed>=1 discipline as computeHistoricalTeamTotals; entity gating here is playerMap membership, which both excludes the `TEAM_<abbr>` aggregate pseudo-rows (playersMap never carries `TEAM_*` keys — teamContext excludes them by id via `isTeamAggregateId`) and drops directory-absent (retired) ids — a deliberate view-only divergence from teamContext, which keeps them (R2 denominator repair).

Keep the rest of the JSDoc (attribution-difference sentences, `rec_air_yd` note) unchanged. Drop the stale `:191` line anchor.

### 3. `src/utils/outlookPositionStats.test.js` (comment-only)

**Edit 7** — the comment at lines 211-215 claims "buildTeamShareTotals still gates on playerMap membership exactly like computeHistoricalTeamTotals." Replace with:

> (Retired-player inclusion in the denominator is a deliberate divergence: buildTeamShareTotals gates on playerMap membership and drops directory-absent ids, while computeHistoricalTeamTotals keeps them — the R2 denominator repair — and excludes only `TEAM_<abbr>` aggregate rows via isTeamAggregateId.)

### 4. `src/__fixtures__/season-totals-2025-ind.json` (new file — verbatim served-data extract)

Generate from the app repo root (sibling checkout at data HEAD `52eea56`):

```bash
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('../sleeper-dashboard-data/nfl/season-totals/2025.json','utf8'));const out={};for(const [k,v] of Object.entries(d)){if(v?.team==='IND')out[k]=v}fs.writeFileSync('src/__fixtures__/season-totals-2025-ind.json',JSON.stringify(out,null,2)+'\n');console.log(Object.keys(out).length)"
```

Expected: **93 entries**, including `TEAM_IND`, the `IND` DEF row, and `6813`; 20 entries have `gamesPlayed < 1` (exercise the gp gate). Do not hand-edit the extract.

### 5. `src/__tests__/seasonTotalsEntityFilter.test.js` (new file — see Tests B)

### 6. `src/utils/teamContext.test.js` (additions only — see Tests A; existing tests must pass unchanged)

### 7. `CLAUDE.md` (two edits — see Docs updates)

### 8. `docs/*.md` (see Docs updates)

**No change to:** `App.jsx` (all four memos and every call site stay byte-identical — `attributionHold.test.js` enforces this), `seasonProjection.js`, `teamRzShare.js`, `dynastyScore.js`, `usePlayerProfile.js`, `PlayersTab.jsx`, any `src/api/*` module, the existing `season-totals-2025.json` fixture, and the data repo.

---

## Tests to add

### A. Co-located unit tests — `src/utils/teamContext.test.js`

New `describe('entity filter (TEAM_ aggregate pseudo-rows)')` block using a synthetic fixture: two member players (`p1` 120 rush_att, `p2` 80) + `TEAM_X: { gamesPlayed: 17, team: 'X', stats: { rush_att: 200, rec: 50, rec_tgt: 60, rush_rz_att: 40, rec_rz_tgt: 12 } }` + a `retired` numeric-shaped id absent from playersMap (`gamesPlayed: 14, team: 'X', stats: { rush_att: 50 } }`); playersMap has `p1`/`p2` (position RB, team X) only.

1. **T-N1 — exclusion:** per-season totals for X = `{ rushAtt: 250, rec: …, recTgt: …, rushRz: …, recRz: … }` — players + retired only, TEAM_X absent from every key (assert all five keys exactly; without the filter rushAtt would be 450).
2. **T-N2 — R2 semantic preserved (anti-membership-gate pin):** `retired` (not in playersMap) still contributes 50 to X in per-season mode while `TEAM_X` does not. This is the assertion a membership gate would break first — comment it as such.
3. **T-N3 — current-team no-op proof:** `computeHistoricalTeamTotals(cs, playersMap, { attribution: 'current-team' })` is `toEqual`-identical for the fixture **with and without** the `TEAM_X` row present (both drop it: playersMap lookup pre-fix, prefix filter post-fix).
4. **T-N4 — no phantom share rows:** `computeHistoricalShares` emits no `TEAM_X` entry (membership+position gates) and p1's share is `120/250 = 0.48`.
5. **T-N5 — `isTeamAggregateId` unit:** `'TEAM_IND'` → true; `'6813'`, `'IND'`, `'1339z'`, `''` → false; non-string input → false.
6. **T-N6 — tripwire:** `computeHistoricalShares` with a handcrafted undersized totals argument (e.g. totals `{ 2024: { X: { rushAtt: 10 } } }` vs a member RB with `rush_att: 50`, gp 8) emits a share and calls `console.warn` (spy with `vi.spyOn(console, 'warn')`; the totals object is caller-supplied, so the violation is constructible without touching the filter).
7. **T-N7 — Taylor real-value pins (compact real-data fixture inline):** per season `s` of the §4 table build `{ '6813': { gamesPlayed: gp, team: 'IND', stats: { rush_att: N } }, rest: { gamesPlayed: 17, team: 'IND', stats: { rush_att: playersSum − N } }, TEAM_IND: { gamesPlayed: 17, team: 'IND', stats: { rush_att: teamRowValue } } }` with playersMap `{ '6813': { position: 'RB', team: 'IND' }, rest: { position: 'RB', team: 'IND' } }` (TEAM_IND intentionally absent, as in `/players/nfl`). Rest-of-team values: 227/167/246/311/193/119; TEAM_IND row values: 459/499/439/479/496/442. Assert:
   - totals per season: IND.rushAtt = 459/499/438/480/496/442;
   - `6813` share array = `[0.505, 0.665, 0.438, 0.352, 0.611, 0.731]` (exact 3-dp values, oldest→newest);
   - `computeShareTrend` on that array: `shareTrendLabel 'growing'`, `volatilityLabel 'volatile'`, `shareVolatility` `toBeCloseTo(0.144, 2)`.
   Comment the display consequence (Role History slice(-5) → 67/44/35/61/73) and the Step-3 consequence (scale 0.50, multiplier 1.040) so the pins aren't opaque.

**Existing tests:** all pass unchanged — REANCHOR/HOLD fixtures contain no `TEAM_`-prefixed ids and are otherwise unaffected by the filter. If any existing test fails, stop: that is a plan error, not a test to edit.

### B. Contract test — `src/__tests__/seasonTotalsEntityFilter.test.js` (new)

Imports the new extract fixture + `computeHistoricalTeamTotals`, `computeHistoricalShares`, `isTeamAggregateId` from `teamContext.js`, `computeTeamRzShareFactor` from `teamRzShare.js`.

1. **Served-shape assumption pins:** fixture has exactly one `TEAM_`-prefixed key (`TEAM_IND`) with `team 'IND'`, `gamesPlayed 17`, `stats.rush_att === 442`; the `IND` DEF row exists with `gamesPlayed 17` and **none** of the five offensive keys (`rush_att`/`rec`/`rec_tgt`/`rush_rz_att`/`rec_rz_tgt` each `== null`); `6813` exists with `team 'IND'`, `stats.rush_att 323`, `stats.rush_rz_att 70`.
2. **Denominator pin (the doubling regression trip):** `computeHistoricalTeamTotals({ 2025: fixture }, {})` → `[2025].IND` `toEqual({ rushAtt: 442, rec: 351, recTgt: 514, rushRz: 101, recRz: 69 })`. (Empty playersMap is sufficient: every fixture entry carries `team`, and per-season mode reads it first — this also proves the denominator no longer depends on directory membership.)
3. **Share pin:** `computeHistoricalShares({ 2025: fixture }, { '6813': { position: 'RB', team: 'IND' } }, totals)` → `{ '6813': [{ season: 2025, share: 0.731, gamesPlayed: 17 }] }` and no other keys.
4. **Step-5h value pin:** `computeTeamRzShareFactor('RB', fixture['6813'].stats, 2025, 'IND', totals, { 2025: fixture }, { '6813': { position: 'RB', team: 'IND' } })` → `teamRzShare === 0.693`, `teamRzShareCategory === 'rush'` (do not pin the factor — the one-player cohort makes it a degenerate-pool artifact).

### C. Suite / contract runs

Full `npm test`; explicitly confirm green: `dynastyScore.test.js` (hold guard), `attributionHold.test.js`, `outlookPositionStats.test.js`, `factorsSchema.test.js` (no factors-key change — values only), `statKeysContract.test.js` (its fixture untouched). Then `npm run lint`, `npm run build`.

---

## Docs updates

1. **`CLAUDE.md` → src/utils table, `teamContext.js` row:** after "(also aggregates RZ denominators: `rushRz`/`recRz`)" append: "; `isTeamAggregateId` excludes Sleeper `TEAM_<abbr>` whole-team aggregate pseudo-rows from `computeHistoricalTeamTotals` denominators (store-served season-totals carry one per team; unfiltered they exactly doubled every team total)".
2. **`CLAUDE.md` → Cross-repo contracts, "season-totals schemaVersion" bullet:** append: "Served files also include per-team `TEAM_<abbr>` whole-team aggregate pseudo-rows (full stat keys, `gamesPlayed`, per-season `team`) and `<abbr>` DEF entries (no offensive stat keys); the `TEAM_` id prefix is contract — consumers must exclude those rows from any cross-player summation (`teamContext.isTeamAggregateId`), and renaming the pseudo-id scheme upstream is a breaking change."
3. **`docs/projection.md` line 27 (Step 5h table row):** after "Team denominator from `historicalTeamTotals[lastQ.season][player.team]`; minimum guard 20" insert " (denominator excludes `TEAM_<abbr>` aggregate pseudo-rows — see the entity-filter era note below)".
4. **`docs/projection.md` attribution/activation paragraph (line 64):** append: "**Entity-filter era note (2026-07-17 fix):** between the flip commit (2026-07-16) and the entity filter, per-season denominators included Sleeper's `TEAM_<abbr>` aggregate pseudo-rows and were exactly doubled — snapshots in that window carry ~½-scale `teamRzShare` and share-volatility labels biased toward `entrenched` (`shareTrendLabel` was unaffected — scale-free). Current-team-pinned dynasty channels were never exposed." (Implementer: replace the date with the actual landing date.)
5. **`docs/projection.md` data-quality paragraph (line 89):** append: "Store-served seasons additionally carry `TEAM_<abbr>` aggregate and `<abbr>` DEF pseudo-rows; `computeHistoricalTeamTotals` excludes the aggregates via `isTeamAggregateId` (unfiltered they exactly doubled every team denominator), and DEF rows contribute nothing (no offensive stat keys)."
6. **`docs/signal-registry.md` line 78 (Share trend row), last column:** append "; denominators exclude `TEAM_<abbr>` aggregate rows (entity filter 2026-07-17); snapshots 2026-07-16→fix carry ~½-scale `shareVolatility` (labels biased `entrenched`)".
7. **`docs/signal-registry.md` line 90 (Team-RZ-share row), last column:** append "; denominators exclude `TEAM_<abbr>` aggregate rows (entity filter 2026-07-17); snapshots 2026-07-16→fix carry ~½-scale `teamRzShare` (factor ≈ unaffected — percentile vs an equally-scaled cohort)".
8. **`docs/architecture.md` line 111 (`historicalTeamTotals` bullet):** correct the stale shape and add the filter: "... → `{ [season]: { [nfl_team]: { rushAtt, rec, recTgt, rushRz, recRz } } }`; excludes `TEAM_<abbr>` whole-team aggregate pseudo-rows (`isTeamAggregateId`) — store-served v3 files carry one per team plus `<abbr>` DEF entries (no offensive stat keys)."
9. **`docs/architecture.md` line 112 (`historicalShares` bullet):** append one sentence: "Since the entity filter (2026-07-17) the Profile Role-History values agree with the Outlook per-season-team share path (both denominators are player-only sums)."
10. **`docs/dynasty-scoring.md`:** **no change** — the hold and its attribution-asymmetry note (line 95) remain accurate; the pinned channels are byte-identical.
11. **`README.md`:** **no change** (no share/Role-History content).

## Cross-repo impact

**No data-repo code, pipeline, or file change.** The served numbers are correct as emitted; `TEAM_*` rows are legitimate content. Mirror items for `sleeper-dashboard-data` (doc-level, to be applied in a data-repo session — call out in the implementation task summary per CLAUDE.md):

1. **`data-catalog.md` — season-totals section (~lines 30-40):** add an entity-composition bullet: entries are numeric `sleeper_id` players **plus** one `TEAM_<abbr>` whole-team aggregate pseudo-row per team (full stat keys, `gamesPlayed`, per-season `team`; present since 2026-05-19 `135d8ac`), `<abbr>` DEF entries (no offensive stat keys), and rare legacy suffixed ids (e.g. `1339z`, 2021). Consumers must exclude `TEAM_*` from cross-player summation (the app does via `teamContext.isTeamAggregateId`); the `TEAM_` prefix is contract — renaming it is a breaking change.
2. **`CLAUDE.md` (data repo) — cross-repo table, season-totals row (~line 216):** mirror the same disclosure sentence.
3. **Informational annotations (no action now):** `lib/panel.mjs:67-81` built the flip-gate share denominators the same unfiltered way — common-mode across both arms, FLIP-CLEARS unaffected, but absolute share-feature levels in the panel artifacts are ~½ scale; annotate if those artifacts are ever consumed in absolute terms. (`lib/backtest.mjs` is NOT affected — advstats-id iteration, membership-gated.) App snapshots written 2026-07-16→fix carry ~½-scale `teamRzShare`/`shareVolatility`; note for the 2026 grading run (~Jan 2027).

## Out of scope — do not do

- **No `computeTeamContext` code change** (dynasty input; pinned current-team shields it — Edit 4's comment is the breadcrumb for the future migration slice).
- **No R2 flip/hold change**; no App.jsx change of any kind.
- **No `buildTeamShareTotals`/Outlook behavior change** (comments only).
- **No data-repo emission change**; no regeneration.
- **No refresh of `src/__fixtures__/season-totals-2025.json`** (stale pre-v3 shape noted in §3 — separate follow-up).
- **No display-layer changes** — the corrected values flow through existing render code.

## Implementation sequence

1. `teamContext.js` Edits 1-5 → 2. comment Edits 6-7 → 3. generate the extract fixture (verify 93 entries) → 4. Tests A + B → 5. full suite + lint + build (Done-definition; no dev server — visual smoke is the user's: Taylor Role History **67/44/35/61/73** and agreement with the Outlook tile's 73.1%) → 6. Docs updates 1-9 → 7. task summary must state the cross-repo doc mirror items explicitly.
