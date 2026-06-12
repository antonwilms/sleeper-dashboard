# Bounce-back flag fix — kill the 2-season tautology (D1-A), see injury seasons (F2-C)

_Source findings: `.claude/tasks/backend-audit-deep.md` → D1-A; `.claude/tasks/backend-audit.md` → F2-C. Planning session: opus, 2026-06-12. Implementer: sonnet._

## Objective

`computeBounceBackFlag` (`src/utils/projectionSignals.js:47-56`) matches its documented definition — docs/dynasty-scoring.md:115: _"previous season < 10 GP, current PPG ≥ prior career bests"_ — instead of:

- **D1-A (false positives)**: `secondHighest` is computed over a ppg array that *includes the current season*, so with exactly 2 qualifying seasons `current >= secondHighest` is a tautology (fires for every 2-season player whose first season was 8–9 GP, even with a poor current season), and for 3+ seasons the condition loosens to "≥ second-best overall".
- **F2-C (false negatives)**: the helper sees only the qualifying (GP ≥ 8) array, so a season-ending-injury year (sub-8-GP, including 0-GP full-IR) is invisible — the most dramatic genuine recoveries can never fire.

**This is a deliberate, approved projection-input change.** It moves `projectedPPG` for the affected cohort (the ×1.05 `bounceBackFactor` starts/stops firing for specific players). It is NOT backtest-gated because it corrects *when* the flag fires to match documented intent. The **×1.05 magnitude is untouched** — retuning it would be gated tuning, out of scope.

---

## Decisions made in planning (do not re-litigate; implement as specified)

### 1. Recovery threshold: `currentPPG >= priorMax` (best prior), NOT second-best prior

The documented intent (docs/dynasty-scoring.md:115) literally says "current PPG ≥ **prior career bests**" — best-prior is the documented rule. The "≥ second-best" behavior was accidental (D1-A: "the math accidentally reduces to…"); keeping an accident because it is incumbent would be a tuning decision requiring a backtest, which this non-gated task must not make. `priorMax` is computed over **prior qualifying seasons only** (`slice(0, -1)`), which simultaneously kills the n=2 tautology (D1-A's fix direction: "when only one prior exists, require currentPPG >= priorMax alone"). Comparison stays `>=` (equality fires — pinned by tests; this preserves several existing fixtures, see Blast radius).

### 2. Down year = the calendar season immediately preceding the current qualifying season

`downSeason = current.season - 1`. Two qualifying conditions, exactly one season slot:

- **(a) Games-shortened qualifying season** (preserves the existing trigger): the previous qualifying entry *is* `downSeason` (adjacent) and has `gamesPlayed < 10` (i.e. 8–9 GP).
- **(b) Sub-8-GP injury season** (F2-C, new): `careerStats[downSeason][playerId]` exists with `gamesPlayed < 8` AND `classifyInjurySeason(careerStats, playerId, position, downSeason)` returns true.

Notes on (b):
- **Reuses `durabilitySignals.js` wholesale** (per task constraint — do not reinvent season classification). `classifyInjurySeason` = base trigger `gp < 10 && dnp >= 3` + contributor evidence in this or an adjacent (±1) season. This deliberately **supersedes F2-C's literal sketch** (`gamesPlayed < 8 AND gamesPlayed > 0`): 0-GP full-IR seasons DO count when the adjacent-season rescue fires (a star's Achilles year is the strongest bounce-back precursor), and backup-noise seasons (3 GP, no role evidence anywhere) do NOT count — a career backup's first real opportunity is a breakout, not a bounce-back. `classifyInjurySeason` post-dates the F2-C finding and is the codebase's single injury-season authority (CLAUDE.md → durabilitySignals row).
- The current season itself typically provides the adjacent rescue for a multi-injury gap (e.g. 2GP-2023 / 3GP-2024 / full-2025: the 2024 down year is rescued by 2025's contributor evidence) — this is desired.
- Condition (a) intentionally requires **no** injury evidence: an 8–9 GP qualifying season is a meaningful-sample contributor season by construction; the evidence gate exists for the noisy sub-8-GP band only. Asymmetry is deliberate — document it in the helper.

**Adjacency is a (small) tightening of (a)**: the old code accepted a `< 10 GP` previous *qualifying entry* at any calendar distance (e.g. a 9-GP season in 2021, nothing 2022-23, current 2024 → fired). Under the new rule that pattern requires a recognized injury season at `currentSeason − 1` or it does not fire. Justification: "previous season" in the documented definition reads calendar-adjacent; a recovery three years removed from the down year is not a bounce-back. This cohort (interior multi-year gap, no adjacent injury entry) is part of the corrected behavior, not collateral.

### 3. Minimum data: `qualifying.length >= 2` stays

Bounce-back requires demonstrated prior form (≥ 1 prior qualifying season for the `priorMax` baseline) plus the current season. A player whose only career shape is `injury year → first qualifying season` has no baseline to recover *to* — not a bounce-back. The projection consumer's `null` sentinel for < 2 qualifying seasons is unchanged.

### 4. New signature

```js
/**
 * @param {Array<{season:number, ppg:number, gamesPlayed:number}>} qualifying  oldest → newest, GP ≥ 8
 * @param {Object} careerStats  full careerStats (all seasons incl. sub-8-GP entries)
 * @param {string} playerId
 * @param {string} position
 * @returns {boolean}
 */
export function computeBounceBackFlag(qualifying, careerStats, playerId, position)
```

Both consumers already hold every argument in scope, and both already pass season-bearing entries (dynasty `seasonHistory` entries: `{season, ppg, gamesPlayed, fantasyPoints}`; projection `qualifying` entries: `{season, ppg, gamesPlayed, dnpWeeks}`). The two consumers shift together by construction — one helper, one definition; bounce-back stays OFF the intentional-divergence list.

---

## Implementation

### 1. `src/utils/projectionSignals.js`

Add import (no cycle: `durabilitySignals.js` is a leaf module — "imports nothing"):

```js
import { classifyInjurySeason } from './durabilitySignals'
```

Replace `computeBounceBackFlag` (lines 38-56) — new body:

```js
export function computeBounceBackFlag(qualifying, careerStats, playerId, position) {
  if (!Array.isArray(qualifying) || qualifying.length < 2) return false

  const current  = qualifying[qualifying.length - 1]
  const priors   = qualifying.slice(0, -1)
  const priorMax = Math.max(...priors.map(s => s.ppg))

  const downSeason = current.season - 1
  const prevQ      = priors[priors.length - 1]

  // (a) the immediately-preceding season was a games-shortened (8–9 GP) qualifying season
  const shortQualifyingPrior =
    prevQ.season === downSeason && (prevQ.gamesPlayed ?? 0) < 10

  // (b) F2-C: the immediately-preceding season was a sub-8-GP (incl. 0-GP full-IR)
  //     season classified as a genuine injury season (contributor evidence in it
  //     or an adjacent season — see durabilitySignals.js; backup noise excluded).
  const downEntry = careerStats?.[downSeason]?.[playerId]
  const subQualifyingInjury =
    downEntry != null &&
    (downEntry.gamesPlayed ?? 0) < 8 &&
    classifyInjurySeason(careerStats, playerId, position, downSeason)

  if (!shortQualifyingPrior && !subQualifyingInjury) return false

  // Recovery: current PPG matched/beat the best PRIOR qualifying season (D1-A:
  // priors only — never include the current season in its own baseline).
  return current.ppg >= priorMax
}
```

Rewrite the function's JSDoc to state the full definition (down-year conditions (a)/(b), best-prior recovery, ≥ 2 qualifying seasons, the deliberate (a)-vs-(b) evidence asymmetry, and that 0-GP IR years count via the adjacent rescue).

Also update the **stale file header** (lines 1-10): it still claims "Byte-identical ports… dynastyScore.js is intentionally left untouched in this batch; a future task should refactor it to import these". That refactor landed — `dynastyScore.js` imports these helpers today. Rewrite to: shared veteran signal helpers, single source of truth for `isBreakout` / `isBounceBack` / `isTdReliant`, imported by both `dynastyScore.js` and `seasonProjection.js` (Step 5c); bounce-back definition corrected per D1-A/F2-C (this task). Comment-only change.

### 2. `src/utils/dynastyScore.js` (call-site only, line ~872)

```js
const isBounceBack = computeBounceBackFlag(seasonHistory, careerStats, playerId, position)
```

All arguments in scope. Nothing else changes — label chain, signals emission, score math untouched (the flag affects the label only in dynasty).

### 3. `src/utils/seasonProjection.js` (call-site only, lines ~394-396)

```js
const isBounceBack = qualifying.length >= 2
  ? computeBounceBackFlag(qualifying, careerStats, playerId, position)
  : null
```

All in scope. `bounceBackFactor = isBounceBack === true ? 1.05 : 1.00` and the adjustmentSummary line are untouched. **No `factors` key added/renamed/removed** → `factorsSchema.test.js` must pass with zero edits.

### Step sequence

1. projectionSignals.js (import + helper + header).
2. Both call sites.
3. Tests (below): update projectionSignals.test.js, add new unit + integration tests.
4. Docs (below), including the changeover date.
5. Done-definition: `npm test` green; `factorsSchema.test.js` untouched and green; `npm run build`; `npm run lint`.

---

## Blast radius — every existing test evaluated against the new rule

Planning evaluated each fixture; the implementer must re-verify by running the suite, but these are the expected outcomes and the *reasons*:

| Test / fixture | Career shape | Old → New | Why |
|---|---|---|---|
| `dynastyScore.test.js` Scenario 2 (:151, golden master :212 `isBounceBack: true`) | `[8,8,8,14@9GP(2023),14(2024)]` | true → **true (unchanged)** | (a): prevQ 2023 = currentSeason−1, 9 GP < 10; recovery: 14 ≥ priorMax 14 (equality fires) |
| `dynastyScore.test.js` Scenarios 1/3/4/5 (`isBounceBack: false` at :123/:306/:398/:489) | all-14-GP seasons, or < 2 qualifying | false → **false (unchanged)** | no 8–9 GP prior / length guard; fixtures have no sub-8-GP entries with `dnpWeeks ≥ 3` so (b) cannot fire (`makeSeasonEntry` sets `dnpWeeks: 0`) |
| `seasonProjection.test.js` :190-207 (1 qualifying season, `isBounceBack` null) | 1 season | null → **null (unchanged)** | consumer `< 2` gate unchanged |
| `seasonProjection.test.js` :225-257 "was clamped above" (`isBounceBack: true` at :257) | `clampHiCareerStats` | true → **true (unchanged)** | same shape as Scenario 2 |
| `seasonProjection.test.js` :262+ "was clamped below" | `clampLoCareerStats` (prior 14 GP) | false → **false (unchanged)** | no down year either way |
| `seasonProjection.test.js` :524-560 "new upper rail … 1.50" | `clampHiCareerStats` + usage stats | true → **true (unchanged)** | augmenting 2024 stats doesn't touch GP/PPG shape |
| `seasonProjection.test.js` :1383-1400 ascending regression (**exact pin `combinedNewFactor === 1.213`**, product includes bounceBack 1.05) | `clampHiCareerStats` | true → **true (unchanged)** | as above — the 1.213 pin survives |
| `seasonProjection.test.js` :1724-1800 Step 6 injury-gate tests | flat 8-PPG careers `[16GP, 9GP, 9GP]` | true → **true (unchanged, and irrelevant)** | (a) adjacent 9-GP prior; recovery 8 ≥ priorMax 8 fires both before/after; tests assert only `injurySeasons`/`projectedGames`, which Step 5c does not touch |
| `__tests__/factorsSchema.test.js` | keys only | **untouched** | shape unchanged |
| `dynastyScore.test.js` :679/:700 robustness-guard tests | single 5-GP season | **untouched** | Limited Data paths; bounce-back never evaluated |

**Net: zero golden-master or integration-test edits.** The only existing tests that change are the helper's own unit tests:

### `src/utils/projectionSignals.test.js` — `describe('computeBounceBackFlag')` — update ALL five

All entries now need `season` fields (adjacency) and the calls need the new arguments. Where (b) is not under test, pass `careerStats` containing exactly the qualifying entries (no sub-8-GP seasons) so (b) is inert.

1. **`< 2 → false`** (:51-55): keep expectations; update calls to new signature (extra args may be `{}` / `'X'` / `'WR'` — the length guard returns first).
2. **`prior season GP >= 10 → false`** (:57-65): add seasons `2022/2023/2024`; same expectation (false) — now via "(a) fails: prevQ has 10 GP" and "(b) fails: no sub-8 entry at 2023".
3. **`prior shortened + current beats prior max → true`** (:67-75): seasons `2022/2023/2024` (`[12@14GP, 9@8GP, 15@16GP]`); still **true** — (a) adjacent 8 GP, 15 ≥ priorMax 12.
4. **`beats second-highest → true`** (:77-91): **FLIPS to `false`** — this is the D1-A pin. `[14@14GP(2021), 12@14GP(2022), 9@8GP(2023), 13@16GP(2024)]`: (a) fires (adjacent 8 GP) but recovery fails — current 13 < priorMax 14. Rename to e.g. `'recovers only to second-best prior → false (D1-A: must match/beat prior career best)'` and rewrite the comment to state the corrected rule. This is a real behavioral assertion of the fix, not an edit-to-green: the old expected value was the bug.
5. **mutation guard** (:93-102): keep (new implementation has no sort, but the guard is still worth pinning); update signature.

---

## Tests to add

### `src/utils/projectionSignals.test.js` (same describe)

A small local helper keeps fixtures readable:

```js
// careerStats builder: entries keyed by season for player 'P1'
function cs(entries) {  // entries: { [season]: { gamesPlayed, dnpWeeks, gamesStarted, stats?, fantasyPoints? } }
  const out = {}
  for (const [season, e] of Object.entries(entries)) out[season] = { P1: e }
  return out
}
```

6. **D1-A headline: 2-season tautology no longer fires.** `qualifying = [{season:2023, ppg:10, gamesPlayed:9}, {season:2024, ppg:7, gamesPlayed:14}]` → **false** (old code: true via tautology). Recovery 7 < priorMax 10.
7. **2-season genuine recovery still fires.** Same but current ppg 12 → **true** (12 ≥ 10; (a) adjacent 9 GP).
8. **Equality boundary.** Current ppg exactly === priorMax → **true** (pins `>=`).
9. **F2-C: sub-8-GP injury season recovery fires.** `qualifying = [{season:2022, ppg:15, gamesPlayed:16}, {season:2024, ppg:15.5, gamesPlayed:16}]`; careerStats has those two entries **plus** `2023: { gamesPlayed: 4, dnpWeeks: 8, gamesStarted: 4, stats: {} }` (gs 4 ≥ MIN_STARTS → self contributor evidence) → **true** (old code: false — 2023 never reached the qualifying array). The F2-C headline.
10. **F2-C: 0-GP full-IR year fires via adjacent rescue.** `2023: { gamesPlayed: 0, dnpWeeks: 14, gamesStarted: 0, stats: {} }` (no self-evidence) but the 2022 entry carries contributor evidence (e.g. `gamesStarted: 14`) → rescue → **true**.
11. **F2-C: backup noise excluded.** `2023: { gamesPlayed: 3, dnpWeeks: 5, gamesStarted: 0, stats: { rec_tgt: 2 } }` and **no** contributor evidence in 2022/2023/2024 (both qualifying entries built with `gamesStarted: 0` and thin `rec_tgt` so `wasContributorSeason` fails all three priorities) → `classifyInjurySeason` false → **false**, even though current ppg ≥ priorMax.
12. **F2-C: injury year + insufficient recovery → false.** Same fixture as #9 but current ppg 14 < priorMax 15 → **false** (recovery condition applies on the (b) path too).
13. **Adjacency tightening pin.** `qualifying = [{season:2021, ppg:9, gamesPlayed:9}, {season:2024, ppg:10, gamesPlayed:16}]`, careerStats has no 2023 entry → **false** (old code: true — 9-GP prior qualifying entry at any distance). Comment: down year must be `currentSeason − 1`.

### `src/utils/seasonProjection.test.js` — new `describe('Step 5c — bounce-back definition (D1-A / F2-C)')`

Use `makeVet` with custom careerStats; unique player IDs (cache isolation per factories header). Position WR, age 26+ (so `isBreakout` stays false and doesn't co-fire).

14. **F2-C integration: injury-gap vet fires the ×1.05.** careerStats: `2021: makeSeasonEntry(196,14)`, `2022: makeSeasonEntry(196,14)` (14 ppg), `2023: { fantasyPoints: 24, gamesPlayed: 3, dnpWeeks: 10, gamesStarted: 3, stats: {} }` (gs/gp = 1.0 ≥ START_RATE_FLOOR → evidence), `2024: makeSeasonEntry(224,14)` (16 ppg ≥ priorMax 14). Expect: `factors.isBounceBack === true`, `factors.bounceBackFactor === 1.05`, `adjustmentSummary` contains `'Bounced back from lost season ↑'`.
15. **Control: same vet without the 2023 entry → no flag.** Qualifying = [2021, 2022, 2024]; prevQ 2022 ≠ 2023, no 2023 entry → `isBounceBack === false`, `bounceBackFactor === 1.00`. Pins that a bare gap (no injury entry) does not fire, and isolates #14's cause to the injury season.
16. **D1-A integration: 2-season bad-current vet does NOT fire.** careerStats: `2023: makeSeasonEntry(90, 9)` (10 ppg, 9 GP), `2024: makeSeasonEntry(98, 14)` (7 ppg). Expect `factors.isBounceBack === false`, `bounceBackFactor === 1.00` (old code: fired). Assert also `projectedPPG` is finite — this is the cohort whose `projectedPPG` deliberately moves.

### `src/utils/dynastyScore.test.js` — new `describe('bounce-back label (D1-A / F2-C)')`

(Existing `beforeEach` console.log spy applies.)

17. **D1-A: 2-season bad-current player loses the 'Bounce-back' label.** `makePlayer('WR', 24, 2)`; careerStats `2023: makeSeasonEntry(90, 9)`, `2024: makeSeasonEntry(98, 14)`. Expect `signals.isBounceBack === false` and `label !== 'Bounce-back'` (don't pin the exact replacement label — it follows the score thresholds; assert the negative).
18. **F2-C: injury-recovery player gains it.** `makePlayer('WR', 27, 6)` (age 27 → not breakout-eligible, not late-career for WR cap 28); careerStats as test #14. Expect `signals.isBounceBack === true`, `label === 'Bounce-back'` (isBreakout false, not late-career → bounce-back wins the chain).

---

## Docs updates

1. **docs/dynasty-scoring.md:115** — replace the definition line. Before:
   > - **isBounceBack**: previous season < 10 GP, current PPG ≥ prior career bests

   After:
   > - **isBounceBack**: the season immediately preceding the current qualifying season (`currentSeason − 1`) was a down year — either an 8–9 GP qualifying season, or a sub-8-GP (incl. 0-GP full-IR) season classified as a genuine injury season by `classifyInjurySeason` (`durabilitySignals.js`: base trigger + contributor evidence; backup seasons excluded) — AND current PPG ≥ the best **prior** qualifying-season PPG. Requires ≥ 2 qualifying seasons. _Definition corrected <YYYY-MM-DD> (audit D1-A/F2-C): previously the current season leaked into its own baseline (2-season tautology) and sub-8-GP injury years were invisible._

   (`<YYYY-MM-DD>` = the date the implementation lands; the implementer fills it in.)

2. **docs/projection.md — Step 5c row** (line ~20): append to the Notes cell:
   > `isBounceBack` definition corrected <YYYY-MM-DD> (D1-A/F2-C — see dynasty-scoring.md → Special signals): down year is the calendar season immediately before the current qualifying season (8–9 GP qualifying season, or sub-8-GP/0-GP injury season per `durabilitySignals.js`); recovery requires current PPG ≥ best prior qualifying PPG. The ×1.05 magnitude is unchanged. **Snapshots written before <YYYY-MM-DD> carry the old (looser) flag** — pre/post cohorts are distinguishable by snapshot date; no snapshot `schemaVersion` change (values moved, shape did not).

3. **CLAUDE.md → Navigation map → `projectionSignals.js` row**: change the import note. Before: "…imports `interpolateAgeCurve` from `ageCurve.js`". After: "…imports `interpolateAgeCurve` from `ageCurve.js` and `classifyInjurySeason` from `durabilitySignals.js` (bounce-back down-year detection)".

4. **CLAUDE.md → Navigation map → `durabilitySignals.js` row**: first sentence currently names two consumers; change to "…shared helpers imported by `dynastyScore.js`, `seasonProjection.js`, and `projectionSignals.js` (bounce-back)". Keep the rest of the row unchanged.

5. **README.md** — no change (no module add/remove; README doesn't describe signal definitions).

6. In-code doc comments (counted here for completeness, specified in Implementation §1): the projectionSignals.js file header (stale "byte-identical port / dynastyScore left untouched" text) and the `computeBounceBackFlag` JSDoc.

---

## Cross-repo impact

**Snapshot shape contract: untouched.** No `factors` key added/renamed/removed, no projection-output shape change, no snapshot `schemaVersion` bump. What changes is **values**: `factors.isBounceBack` / `factors.bounceBackFactor` / `projectedPPG` (and the dynasty label) for the affected cohorts, in snapshots written after the change lands.

`sleeper-dashboard-data` needs to mirror **nothing** — but the task summary should state, for future backtest work: snapshots are dated (`snapshots/<date>.json`), so the pre/post boundary is the implementation date recorded in docs/projection.md Step 5c (item 2 above). That dating is sufficient; no marker field is needed.

---

## Out of scope (explicitly)

- The ×1.05 `bounceBackFactor` magnitude, the dynasty label precedence chain, and any other Step 5c signal (breakout, TD-reliance).
- D2-C (projection durability blind to sub-8-GP seasons) — related machinery, separate gated finding.
- Any change to `classifyInjurySeason` / `wasContributorSeason` thresholds — this task only *consumes* them.
- The projection's `< 2 qualifying seasons → null` sentinel wiring.
