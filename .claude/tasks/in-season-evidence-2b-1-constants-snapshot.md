# In-season evidence — Phase 2b-1: pinned constants, frozen-prior source, snapshot field, registry

**Approved by Anton 2026-09-27 — ready for Session 2.**

Session 1 (opus), 2026-09-26. Parent: `in-season-evidence.md`; Phase 1: `in-season-evidence-1-view.md`. Graded gate: data `grading/2026-09-26-inseason-verdict.md` +
`backtests/2026-09-26-inseason-constants.json` @ `a071bdb` (record `eb1f8e1`), companion notes in data
`.claude/tasks/in-season-evidence-2a-registry.md` (§A–§D). Sibling slice: `in-season-evidence-2b-2-scoring.md`.

## 0. Goal, split, fixed decisions

**Split chosen: 2b-1 (this file) = brief items 1, 2, 3, 6 — no score change. 2b-2 = items 4, 5.** Why:
one file for all six would pass 40 KB; and the snapshot field may ship before scoring (never after),
so shipping it first starts graded history early. **This slice changes no projection, no dynasty
score and no rendered surface.** The only new output is an additive per-player snapshot field.

Fixed (Anton, do not reopen): the live season counts on the dynasty side; points-only posterior
(`combination = null`), opportunity display-only; season projection uses `K_ROS_*`, dynasty uses
`K_DYN_*`; population routing standard / ROOKIE0 / ROOKIE1P / SHORT per the verdict with its pooled
fallbacks (already baked into the constants file); no weak/strong split; opportunity baseline = last
season with ≥ 4 games; usage-shift sort = relative; frozen prior (Q7 FREEZE) read back from the latest
daily snapshot captured before kickoff.

### Decision D1 — decided (Anton, 2026-09-26): B

**Why:** every 2026 pre-kickoff capture (latest: 2026-09-08; Sleeper `season_start_date` 2026-09-09)
predates the rookie calibration arc and Step 4 (`f07d9be`…`7b5b055`, 09-09..09-12). The rookie-path
prior moved a median 19.6% between the 09-08 and 09-24 captures (undrafted RBs 9.2 → 3.0 PPG), the
veteran prior 1.4%.

**Decision:** a snapshot captured before `PRIOR_MODEL_FROM` (`'2026-09-13'`) is refused
(`notFrozenReason: 'model-changed'`) and the row uses the live prior. **2026 runs unfrozen**; the
freeze starts at the 2027 kickoff. Q7 measured the cost of not freezing as small (ΔMAE −0.0037,
NO-GAIN; +0.18 PPG residual on promoted rows). No pre-rescore snapshot can ever pass the model gate,
so the 2026 half-PPR → league rescale is **dropped** (measured error, for the record: 0.9% median /
5.5% p90, 09-24 → 09-25). Any `projectionBasis` other than
`'league'` is refused.

### Design rule — a freeze pins the projection MODEL, not just its inputs

A frozen prior is only a prior for *this* model: the k were fitted on its errors, and the live
projection it stands in for is this model's output. So:
1. **`PRIOR_MODEL_FROM`** (in `inSeasonConstants.js`) is the first UTC capture date on the current
   projection model. A captured prior dated earlier is refused, before any fetch.
2. **It is bumped deliberately, in the same commit as any material projection-model change** — any
   change that moves `projectedPPG` or `projectedGames` for any player: a CR-15-mirrored factor, gate
   or constant, the rookie calibration/games/ceiling mechanisms, veteran/rookie routing, the comp blend.
   Not bumped for capture-only factors, labels, `adjustmentSummary` text or display-only code, nor for a
   pure scoring-basis change: basis is gated separately (`projectionBasis` must be `'league'` on both
   sides), which is why `47af353` (season rescore, 09-25) did not move the date. The new value is the next UTC date after the commit's deploy (the first daily
   capture that runs the new build — CR-22 builds `main` at capture time).
3. **A bump after kickoff unfreezes the rest of that season**: the season's pre-kickoff capture now
   predates the model, so every row falls back to the live prior, flagged `'model-changed'`. It never
   keeps a stale prior silently and never re-freezes on a post-kickoff capture (that capture already
   carries in-season depth moves — the double count freezing exists to avoid). 2026 is the first
   instance of this rule.
4. **Enforced, not remembered:** `src/__tests__/priorModelFrom.test.js` (§7.5) is a golden-output test
   over a fixed fixture set, keyed to `PRIOR_MODEL_FROM`. Any change to the model's output reds it; the
   fix is to re-record the golden values **and** bump the date together. The golden record stores the
   date it was recorded under, and the test asserts it equals `PRIOR_MODEL_FROM`, so re-recording
   without a bump fails review visibly (implementation-reviewer checks the pair).
5. A bump does **not** re-fit the k. If the change touches what the data reconstruction mirrors, the
   k are stale too (CR-15 → CR-25 Mirror: re-run the backtest, re-pin).

## 1. Touch list

New: `src/utils/inSeasonConstants.js`, `src/utils/inSeasonScoring.js`, `src/api/frozenPrior.js`,
`src/__fixtures__/inseason-constants-2026-09-26.json`, `src/__tests__/inSeasonConstants.test.js`,
`src/utils/inSeasonScoring.test.js`, `src/api/frozenPrior.test.js`, `src/__tests__/priorModelFrom.test.js`.
Edited: `src/api/dataStore.js` (+`listManifestPaths`, +`isValidProjectionSnapshot`),
`src/utils/projectionSnapshot.js` (export `deriveProjectionBasis`; `scoringPosteriors` arg; gate input),
`src/utils/projectionSnapshot.test.js`, `src/App.jsx`, `docs/cross-repo-registry.md`, `CLAUDE.md`,
`docs/navigation.md`, `docs/nav/utils.md`, `docs/integrations.md`, `docs/architecture.md`,
`docs/signal-registry.md`, `.claude/tasks/data-repo-backlog.md`.
**Not touched:** `seasonProjection.js`, `dynastyScore.js`, `inSeasonEvidence.js`, `Market.jsx`, every
Phase 1/isolation guard test (they must stay green unmodified — §7.4).

## 2. Constants, fixture, provenance test (brief item 1)

### 2.1 Fixture
Copy data `backtests/2026-09-26-inseason-constants.json` at `a071bdb` **byte-for-byte** to
`src/__fixtures__/inseason-constants-2026-09-26.json` (`git -C ../sleeper-dashboard-data show
a071bdb:backtests/2026-09-26-inseason-constants.json > …` — reading the sibling is fine, editing it is
not). sha1 must be `8ce9ccdbbf79d9009f775172a0d63e21f2e288ae` (174,412 bytes). No trimming: the
`fixture` block (the sufficient statistics) is what re-derivation needs. Tests are the only importer.
Never bundle it.

### 2.2 `src/utils/inSeasonConstants.js` (pure, no imports)
Header comment, verbatim substance:
```
// Pinned in-season k — Phase 2b (in-season-evidence-2b-1-constants-snapshot.md).
// Source: sleeper-dashboard-data backtests/2026-09-26-inseason-constants.json @ a071bdb,
// copied byte-for-byte to src/__fixtures__/inseason-constants-2026-09-26.json; every K_* below
// is re-derived from that fixture by src/__tests__/inSeasonConstants.test.js. Never hand-edit a K_*:
// re-run the data backtest and re-pin (CR-25).
// WARNING (verdict § "Prior optimism"): these k partly compensate for the projection's known optimism
// (prior scale c ≈ 0.80–0.86 across positions — the prior sits high, so evidence earns extra weight).
// They MUST be re-fitted if that optimism is ever corrected. A calibrated prior and its k change together.
// Basis: fitted on the half-PPR panel; k is dimensionless and applied to league-basis values (verdict
// Limitations; a league-basis refit is data backlog D-45).
```
Exports (values checked against the file 2026-09-26):
```js
export const IN_SEASON_CONSTANTS_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-09-26-inseason-constants.json',
  commit: 'a071bdb324976203ed915e14a57b88fb740fb0b6',
  generatedAt: '2026-09-26T10:10:30.744Z',
  fixture: 'src/__fixtures__/inseason-constants-2026-09-26.json',
}
export const K_ROS_POINTS          = { QB: 3,   RB: 2.5, WR: 3,   TE: 3.5 }
export const K_ROS_POINTS_ROOKIE0  = { QB: 3,   RB: 3,   WR: 2.5, TE: 3 }
export const K_ROS_POINTS_ROOKIE1P = { QB: 2.5, RB: 2.5, WR: 3,   TE: 2.5 }
export const K_ROS_POINTS_SHORT    = { QB: 1.5, RB: 1.5, WR: 1,   TE: 4 }
export const K_DYN_POINTS_HISTORY  = { QB: 7.5, RB: 4,   WR: 6,   TE: 5.5 }
export const K_DYN_POINTS_ROOKIE0  = { QB: 6.5, RB: 6.5, WR: 6.5, TE: 6.5 }
export const K_DYN_POINTS_ROOKIE1P = { QB: 3.5, RB: 3.5, WR: 3.5, TE: 3.5 }
export const K_DYN_POINTS_SHORT    = { QB: 2.5, RB: 2.5, WR: 2.5, TE: 2.5 }
export const K_ROS_OPP             = { QB: 2.5, RB: 1.5, WR: 3,   TE: 3.5 }   // display-only (2b-2 tab)
export const SORT_MEASURE = 'relative'                                        // verdict Q6
// A freeze pins the projection MODEL, not just its inputs (§0 design rule). First UTC capture date on
// the current projection model (7b5b055, Step 4 up-side removal, 2026-09-12 22:27 UTC — also the model
// these k were fitted against). A frozen prior captured earlier is refused (§3.4). BUMP in the same
// commit as any change that moves projectedPPG/projectedGames; priorModelFrom.test.js reds until you do.
export const PRIOR_MODEL_FROM = '2026-09-13'
```
**Deliberately not pinned:** `K_DYN_POINTS` (arm P — §3.3 explains why the dynasty side uses
`K_DYN_POINTS_HISTORY` instead), `K_DYN_OPP` (the 2b-2 tab shows no dynasty-horizon opportunity) and
`K_ROS_SHARE` (target share is not built). None has a consumer.
Pinning either would be dead code.

### 2.3 `src/__tests__/inSeasonConstants.test.js`
Imports the fixture JSON and the module; never reads the sibling. Helpers written in the test:
`refit(cell, excludeSeason?)` = grid `k = t/10` for `t ∈ [fit.kTenths[0], fit.kTenths[1]]`, loss =
Σ over seasons (minus the excluded one) and over n-keys of `Saa + 2w·Sab + w²·Sbb` with
`w = n/(n+k)` from `[count, Saa, Sab, Sbb]`, keep the first strict improvement (`L < best − 1e-9`,
tie → smaller k); `pin(k) = Math.round(k*2)/2`. Then
`expectedK(name, pos, entry, file)`:
1. note `'NO-GAIN vs Phase 1; own k BEATS the pooled k out of sample → own k pinned'` → key must be
   `${name}|${pos}` (no `fixtureKey`), basis `'fitted'`, k = pin(refit(own)).
2. note `'… does not beat the pooled k out of sample → pooled value pinned'` → `fixtureKey` must be
   `${name}|ALL`, basis `'pooled'`, k = pin(refit(ALL)).
3. basis `'fitted'` → own key; `'pooled'` → `fixtureKey` `${name}|ALL`; both k = pin(refit(key)).
4. basis `'study'` → k equals the verdict's comparator column (a literal table in the test, cited to
   the verdict's Constants table: `K_DYN_POINTS.RB` 4.5, `K_DYN_POINTS_HISTORY.QB` 7.5,
   `K_DYN_OPP.TE` 4.0, `K_ROS_POINTS_SHORT.TE` 4.0 (the `'WORSE vs Phase 1'` note)). Session 1 checked
   these four are the only `'study'` entries.
Tests:
- **Fixture integrity:** sha1 of the fixture file text equals the §2.1 value; `source`, `generatedAt`,
  `basis: 'half_ppr'`, `combination === null`, `sortMeasure.name === 'relative'`, `fit.prior ===
  'frozen'`, `fit.opportunityBaseline === 'B'`, and `fit.priorOptimism` contains `'MUST be re-fitted'`.
  `IN_SEASON_CONSTANTS_SOURCE.generatedAt` equals the file's `generatedAt`.
- **Every file entry re-derives:** for all 46 entries, `refit(fixture[key]).toBe(entry.kFit)`, every
  `foldK[s]` equals `refit(fixture[key], s)`, and `entry.k === expectedK(…)`. Session 1 ran this
  derivation, and 46/46 kFit and every foldK reproduce exactly.
- **App module equals the file:** each of the nine exported `K_*` tables deep-equals
  `mapValues(file.constants[name], e => e.k)`, and `SORT_MEASURE === file.sortMeasure.name`.
- **Two-branch test of the Q4 NO-GAIN pooled-pin rule (owed from 2a).** No real cell took the
  keep-own branch (0 of 14), so both entries are synthetic, built from real fixture cells:
  - keep-own: copy `K_ROS_POINTS_ROOKIE0.WR`, which has an own fixture cell (own pin 2.5 ≠ the ALL
    pin 3.0), and set the keep-own note. `expectedK` returns 2.5. Adding `fixtureKey: '…|ALL'` makes
    it throw.
  - pooled: the real `K_ROS_POINTS_ROOKIE0.RB` entry → `expectedK` returns 3.0 from the ALL cell.
    Deleting its `fixtureKey` makes it throw.
  Scope note, in a comment: the *decision* (does own k BEAT pooled, a paired bootstrap) happens in the
  data repo's `buildConstants`. The app can check only the outcome contract: which cell a k must
  re-derive from, given the branch the file records. The decision-level test stays owed data-side
  (D-49, §10).

## 3. The seam module — `src/utils/inSeasonScoring.js` (pure, no React, no I/O)

Imports: `./inSeasonConstants` only. It must **not** import `./inSeasonEvidence` (Market-only, guarded)
or anything from `src/api/`. Header: "The one named seam through which the live season reaches the
season projection and the dynasty score (2b-2). In 2b-1 its output reaches only the snapshot field."

### 3.1 Helpers (all exported for tests)
```js
export const IN_SEASON_SCORING_POSITIONS = ['QB', 'RB', 'WR', 'TE']
// Same rule as inSeasonEvidence.usableLiveSeason. Copied because that module is Market-only and Market may not
// import this seam, so both copies stay; inSeasonScoring.test.js asserts they agree.
export function usableLiveSeason(currentSeasonTotals, dataSeason) { /* verbatim body */ }
// (prior·k + obs·n)/(k+n). Null rule in order (Phase 1's `blend`): prior non-finite → null;
// n not a finite integer ≥ 0 or k not finite ≥ 0 → null; n === 0 → { value: prior, weight: 0 };
// obs non-finite (n > 0) → null. weight = n/(n+k).
export function posteriorOf(prior, obs, n, k) → { value, weight } | null
```

### 3.2 Population — `classifyInSeasonPopulation({ playerId, careerStats, dataSeason, yearsExp })`
Mirrors the verdict's arms (data `classifyArm`, `enumerateCandidates`), transposed onto the app's own
routing, which is what data `rookiePathStateAt` reproduces:
- `qualifying` = seasons in `careerStats` whose row has a finite `gamesPlayed ≥ 8` and finite
  `fantasyPoints`. This is exactly `computeNextSeasonProjection`'s qualifying rule
  (`seasonProjection.js:584-603`), re-implemented and not imported.
- rookie route ⇔ `qualifying.length === 0 || (yearsExp != null && yearsExp <= 1)` (`:612`).
  - rookie: `'ROOKIE1P'` if any `careerStats[s][playerId] != null` for any season, else `'ROOKIE0'`.
  - veteran: `'standard'` if `careerStats[dataSeason]?.[playerId]?.gamesPlayed` is finite and ≥ 8,
    else `'SHORT'`.
Returns one of the four strings. A comment cites the verdict's Coverage table and names the two
definitions it transposes (arm P = veteran and S-1 gp ≥ 8; X groups as §3.3 of the data 2a task).

### 3.3 k and prior per population × horizon
| population | `ros` prior · k | `next` prior · k |
|---|---|---|
| standard | projection prior · `K_ROS_POINTS` | **history**: S-1 PPG = `careerStats[dataSeason][id].fantasyPoints / gamesPlayed` · `K_DYN_POINTS_HISTORY` |
| ROOKIE0 | projection prior · `K_ROS_POINTS_ROOKIE0` | projection prior · `K_DYN_POINTS_ROOKIE0` |
| ROOKIE1P | projection prior · `K_ROS_POINTS_ROOKIE1P` | projection prior · `K_DYN_POINTS_ROOKIE1P` |
| SHORT | projection prior · `K_ROS_POINTS_SHORT` | projection prior · `K_DYN_POINTS_SHORT` |

Why standard's `next` uses the history prior (put in a comment): the dynasty score builds its level
from completed-season PPG, not `projectedPPG`. `K_DYN_POINTS_HISTORY` (arm R, raw S-1 PPG prior) is the
k measured for exactly that base, and a projection-prior shift would carry the prior's known optimism
(c ≈ 0.80–0.86) into every veteran's dynasty score. Rookie and SHORT `next` is the verdict's measured
projection-prior predictor (arm X), recorded for grading only (Anton, 2026-09-26: their dynasty score
is unchanged in 2b).

### 3.4 Frozen-prior gates (pure)
```js
// manifestPaths: string[] from listManifestPaths('snapshots/'). kickoffDate: nflState.season_start_date.
export function selectFrozenPriorCandidate({ manifestPaths, kickoffDate, epoch = PRIOR_MODEL_FROM })
  → { dateKey: string|null, reason: null | 'no-kickoff' | 'no-snapshot' | 'model-changed' }
```
`kickoffDate` must match `/^\d{4}-\d{2}-\d{2}$/`; otherwise the reason is `'no-kickoff'`. Candidates
are paths matching `/^snapshots\/(\d{4}-\d{2}-\d{2})\.json$/` with `dateKey < kickoffDate`. The
comparison is strict string order on UTC date keys and needs no timezone reasoning. At most one day
of freshness is lost. Pick the max. Captures skip days (09-04, 09-06 are missing), so the rule is
"latest before", never a fixed date. None → `'no-snapshot'`. `dateKey < epoch` → `'model-changed'`,
refused **before** any fetch. The dateKey is still returned so the flag can name it.
```js
export function checkFrozenSnapshot(env, { leagueId, liveSeason, projectionBasis })
  → null | 'league' | 'season' | 'basis'
```
`env.leagueId !== leagueId` → `'league'`. `env.targetSeason !== liveSeason` → `'season'`.
`env.projectionBasis !== 'league' || projectionBasis !== 'league'` → `'basis'`. Absent (a pre-rescore
capture, half-PPR projections whose `scoringBasis` says `'custom'`), `'half_ppr'`, `'mixed'` and
`'unknown'` are all refused. No pre-rescore capture passes the model gate, so the basis check guards later captures only.
```js
export function trimFrozenSnapshot(snapshot) → { env: { dateKey?, capturedAt, leagueId, targetSeason, projectionBasis: snapshot.projectionBasis ?? null }, players: { [id]: projectedPPG } }
```
It keeps only finite `players[id].projection.projectedPPG`.

### 3.5 `buildScoringPosteriors(args)` → `null | Map<playerId, InSeasonRecord>`
```js
buildScoringPosteriors({ seasonProjections, careerStats, dataSeason, playerMap, currentSeasonTotals,
                         projectionBasis, frozenPrior })
```
- `null` unless `usableLiveSeason(currentSeasonTotals, dataSeason)` and `projectionBasis ∈
  {'league','half_ppr'}`.
- `frozenPrior` is the loader result (§4): `{ status: 'ok', dateKey, players }` or `{ status,
  reason, dateKey? }`.
- For each `id` of `Object.keys(seasonProjections ?? {})` with `playerMap[id].position` in the four
  positions:
  - `live = currentSeasonTotals.players?.[id] ?? null`. If `live` exists and `live.scoringBasis !==
    projectionBasis`, **skip** (no record). That is Phase 1's basis guard, keyed on the one basis the
    projection was built on.
  - `n = live && Number.isFinite(live.gamesPlayed) && live.gamesPlayed > 0 ? live.gamesPlayed : 0`.
    `obs = n > 0 && Number.isFinite(live.fantasyPoints) ? live.fantasyPoints / n : null`.
  - Projection prior: if `frozenPrior?.status === 'ok'` and `frozenPrior.players[id]` is finite, use
    that value with `frozen = true`, `priorSource = 'snapshot:' + dateKey`, `notFrozenReason = null`.
    Otherwise use `seasonProjections[id].projectedPPG` with `frozen = false`, `priorSource = 'live'`,
    and `notFrozenReason = frozenPrior?.status === 'ok' ? 'absent' : (frozenPrior?.reason ??
    'unavailable')`.
  - `population = classifyInSeasonPopulation({ playerId: id, careerStats, dataSeason, yearsExp:
    playerMap[id].years_exp ?? null })`.
  - `ros = posteriorOf(projPrior, obs, n, K_ROS_*[pos])`. `next` follows §3.3. If `ros` or `next` is
    `null`, skip the record (no partial records).
  - Record:
```js
{ season: currentSeasonTotals.season, n, population, frozen, priorSource, notFrozenReason,
  ros:  { prior, k, weight: r4(w), value: r2(v) },
  next: { priorKind: 'history' | 'projection', prior: r2(p), k, weight: r4(w), value: r2(v) } }
```
  where `r2 = x => Math.round(x*100)/100` and `r4` likewise to 4 dp. `ros.prior` is stored as read
  (projectedPPG is already 1 dp).

`frozenPrior` statuses are `'ok' | 'refused' | 'none' | 'unavailable' | 'not-needed'`. Every one except
`'ok'` yields a live prior with the reason carried through.

## 4. Frozen-prior loader — `src/api/frozenPrior.js`

```js
export async function loadFrozenPrior({ liveSeason, kickoffDate, leagueId, projectionBasis })
  → { status, reason?, dateKey?, players? }
```
1. `!(await isDataStoreReady())` → `{ status: 'unavailable', reason: 'unavailable' }`.
2. `selectFrozenPriorCandidate({ manifestPaths: await listManifestPaths('snapshots/'), kickoffDate })`
   → reason `'no-snapshot'`/`'no-kickoff'` → `{ status: 'none', reason }`; `'model-changed'` →
   `{ status: 'refused', reason, dateKey }`. No fetch on either path.
3. Cache key `frozen-prior/<dateKey>` via `getCache`/`setCache` (`src/utils/cache.js`), TTL `999999`
   (snapshots are immutable, Invariant 5). The cache holds `trimFrozenSnapshot` output, never the 2.2 MB
   raw file. On a miss: `tryDataStore('snapshots/<dateKey>.json', { validate: isValidProjectionSnapshot })`.
   `null` → `{ status: 'unavailable', reason: 'unavailable', dateKey }`.
4. `checkFrozenSnapshot(trim.env, { leagueId, liveSeason, projectionBasis })` → reason →
   `{ status: 'refused', reason, dateKey }`; else `{ status: 'ok', dateKey, players: trim.players }`.
5. Any throw → `{ status: 'unavailable', reason: 'unavailable' }` plus one `console.warn`. It never rejects.
6. **Bounded:** `tryDataStore`'s 15 s timer clears when the headers arrive (`fetchWithTimeout`,
   `dataStore.js:22-26`), so a stalled 2.2 MB body read has no limit. Wrap steps 3–4 in
   `Promise.race` with a 30 s timeout (`FROZEN_PRIOR_TIMEOUT_MS = 30_000`, exported) that resolves
   `{ status: 'unavailable', reason: 'timeout' }`. The abandoned fetch is harmless. `tryDataStore` is
   not edited. The snapshot gate therefore settles well inside the capture's 180 s marker timeout.
   Add `'timeout'` to §3.5's reason list and the §7.2 tests (fake timers).
Snapshots are registered `inProgress: false` (checked in `manifest.json`), so no `allowInProgress` is
passed. CR-26's Invariant now requires that.
`frozen-prior/` keys fall to `raw/` in the export ZIP (`exportData.js` `classifyKey`). Data
`bin/import-snapshot.mjs` imports only `snapshots/`, so they are inert there.

`src/api/dataStore.js` additions:
```js
// CR-04/CR-26 — enumerate served paths through the accessor (ktc.js/ktcHistory.js read the cached
// manifest object directly; this is the accessor form for new readers).
export async function listManifestPaths(prefix) → string[]   // [] when disabled / no manifest
export function isValidProjectionSnapshot(p) → boolean
// p is an object, p.players a non-null object, typeof p.leagueId === 'string', Number.isFinite(p.targetSeason)
```
The snapshot family's `schemaVersion` (3) now passes through `tryDataStore`'s `MAX_SUPPORTED_SCHEMA`
(4) ceiling. A future snapshot bump above 4 must raise that ceiling first (CR-01/CR-26 Mirrors).

## 5. App wiring (`src/App.jsx`) — snapshot-only in 2b-1

1. `import { deriveProjectionBasis, … } from './utils/projectionSnapshot'`,
   `import { buildScoringPosteriors, usableLiveSeason } from './utils/inSeasonScoring'`,
   `import { loadFrozenPrior } from './api/frozenPrior'`, `import { deriveDataSeason } from
   './utils/environment'` (if not already imported).
2. State: `const [liveSeasonSettled, setLiveSeasonSettled] = useState(false)` and
   `const [frozenPrior, setFrozenPrior] = useState(null)`. `null` means not yet settled.
3. The `currentSeasonTotals` effect (`:984-994`): call `setLiveSeasonSettled(true)` inside both the
   `.then` and the `.catch`, **each guarded by `!cancelled`**. A superseded run must never open the
   snapshot gate: the daily snapshot is first-write-wins. Nothing else changes. On the three reset lines
   (`:758`, `:1112`, `:1132`), append `setLiveSeasonSettled(false); setFrozenPrior(null)` to the same
   line.
4. **Placement: directly after the empirical-curves memo (`:202-210`), above `playerRows` and
   `seasonProjections`.** Both the `scoringPosteriors` memo and the snapshot effect's deps read these
   during render, so declaring them later is a use-before-declaration ReferenceError that lint, build
   and unit tests do not catch:
   ```js
   const projectionBasis = useMemo(() => deriveProjectionBasis(careerStats), [careerStats])
   const liveSeasonUsable = useMemo(
     () => !!careerStats && usableLiveSeason(currentSeasonTotals, deriveDataSeason(careerStats)),
     [careerStats, currentSeasonTotals])
   ```
5. New effect, after the `currentSeasonTotals` effect. Deps `[liveSeasonUsable, currentSeasonTotals,
   nflState, selectedLeague, projectionBasis]`. **No synchronous setState in the body**: the repo
   enforces `react-hooks/set-state-in-effect`, and the only exceptions carry reasoned disables
   (`:735,756`).
   - `if (!liveSeasonUsable) return`. "Not needed" is derived in render (item 7), never set.
   - Else `loadFrozenPrior({ liveSeason: currentSeasonTotals.season, kickoffDate:
     nflState?.season_start_date ?? null, leagueId: selectedLeague?.league_id ?? null,
     projectionBasis })`, and `.then` sets `setFrozenPrior` under a `cancelled` flag (Strict Mode).
6. Memo **after** `seasonProjections`:
   ```js
   const scoringPosteriors = useMemo(() => {
     if (!liveSeasonUsable || !seasonProjections || !careerStats || !leagueData?.playerMap || frozenPrior == null) return null
     return buildScoringPosteriors({ seasonProjections, careerStats, dataSeason: deriveDataSeason(careerStats),
       playerMap: leagueData.playerMap, currentSeasonTotals, projectionBasis, frozenPrior })
   }, [liveSeasonUsable, seasonProjections, careerStats, leagueData, currentSeasonTotals, projectionBasis, frozenPrior])
   ```
   Place it in the gap between the `seasonProjections` memo's close (`:598`) and `playerRowsWithProj`
   (`:602`). **Its only consumer in 2b-1 is the snapshot effect.** Pass it to no component, context or
   memo. §7.6 enforces this.
7. Snapshot effect (`:679-725`): pass `scoringPosteriors` to `writeProjectionSnapshot`. Pass
   `inSeasonSettled: liveSeasonSettled && (!liveSeasonUsable || frozenPrior != null)` to
   `shouldWriteProjectionSnapshot`. An unusable live season settles immediately.
   Add both to the deps array. **Keep `seasonProjections` (not any derived map) as the writer's
   `seasonProjections`.** The `[snapshot] wrote …` line stays byte-identical (CR-22).

## 6. Snapshot field + schemaVersion (brief item 3)

`projectionSnapshot.js`:
- `export` the existing `deriveProjectionBasis` (no body change).
- `buildPlayersBlock(seasonProjections, playerMap, ktcMap, scoringPosteriors)`: after building an
  entry, if `scoringPosteriors?.get(playerId)` exists, set `players[playerId].inSeason = record`.
  Otherwise the key is **absent** (never `null`). Key order: existing five keys, then `inSeason`.
  `projection` stays the verbatim `seasonProjections[id]`. **Its semantics are unchanged** (grading
  continuity): it is the pipeline's prior, never a posterior.
- `buildProjectionSnapshot`/`writeProjectionSnapshot` accept `scoringPosteriors` (default `null`) and
  thread it through. JSDoc and file header gain one line each.
- `shouldWriteProjectionSnapshot` gains `inSeasonSettled` and returns `false` when it is not `true`.
  It gates on settledness, never on data: an off-season or failed load still settles
  (`'not-needed'`/`'unavailable'`), exactly like `collegeSettled`/`priorTeamSettled`. The daily
  capture's 180 s marker timeout is unaffected. The added wait is one manifest read plus, from 2027,
  one bounded (15 s) fetch.

**`schemaVersion` stays 3. Justification:** the field is additive and optional. `projection` and every
envelope field are unchanged. Invariant 4 bumps only on an incompatible layout change. Session 1
checked (2026-09-25) that no CR-01 data reader walks per-player keys. Precedent: `projectionBasis`
landed at v3 without a bump. The field's presence is its own marker: absent means a pre-2b capture, no
usable live season, or an ineligible player.

## 7. Tests (done-definition 1)

### 7.1 `src/utils/inSeasonScoring.test.js`
- `posteriorOf`: `(10, 20, 3, 3)` → value 15, weight 0.5; n 0 → prior with weight 0 even when obs is
  `null`; obs `null` with n 2 → `null`; prior `NaN` → `null`; `k = 0` with n > 0 → value = obs.
- `classifyInSeasonPopulation`: 4 fixtures, one per population. Add the boundary cases: a second-year
  (`years_exp: 1`) player with a 16-game rookie season is **ROOKIE1P**, not standard, because the app
  routes `yearsExp ≤ 1` to the rookie path. A `years_exp: 4` player whose only row is 2023 gp 12 and
  2025 gp 5 is **SHORT**. A player with only a 2025 gp 3 row and `years_exp: 2` is ROOKIE1P (no
  qualifying season). A `years_exp: null` player with S-1 gp 8 is standard.
- `selectFrozenPriorCandidate`: `['snapshots/2026-09-05.json','snapshots/2026-09-08.json',
  'snapshots/2026-09-09.json','ktc/snapshot-2026-09-01.json']`, kickoff `'2026-09-09'` → dateKey
  `'2026-09-08'`, reason `'model-changed'` (epoch 09-13). The same with `epoch: '2026-09-01'` → reason
  `null`. Kickoff `'2026-09-05'` with `epoch: '2026-09-01'` → `'no-snapshot'` (strict `<`). Kickoff
  `undefined`/`'Sept 9'` → `'no-kickoff'`.
- `checkFrozenSnapshot`: each of the three reasons, plus `null` for a matching league-basis envelope.
  Absent `projectionBasis` → `'basis'`.
- `buildScoringPosteriors`:
  - Frozen used: `frozen: true`, `priorSource: 'snapshot:2026-09-13'`, and `ros.prior` is the frozen
    value, not the live one.
  - Absent from the frozen map: live prior with `'absent'`.
  - Refused frozen: live prior with the refusal reason.
  - Standard `next`: `priorKind 'history'`, prior = S-1 PPG, `k = K_DYN_POINTS_HISTORY[pos]`.
  - ROOKIE0 `next`: `priorKind 'projection'`, `k = K_DYN_POINTS_ROOKIE0[pos]`.
  - Basis mismatch skips the record.
  - n 0 → `value === prior`, `weight 0`.
  - Non-skill position → no record.
  - Unusable live season → `null`. `projectionBasis 'mixed'` → `null`.
  - **Mutation guard:** `Object.freeze` deep-freezes `seasonProjections` and `frozenPrior` before the
    call, and the call does not throw.

### 7.2 `src/api/frozenPrior.test.js`
Uses the `vi.mock('../utils/cache', …)` pattern from `rookieCalibration.test.js` and mocks
`./dataStore` (`isDataStoreReady`, `listManifestPaths`, `tryDataStore`).
- Model-epoch path: `tryDataStore` is **not called**.
- Cache hit: no fetch.
- Miss: a fetch, then `setCache` is called once with the trimmed payload (no `teamDepthCharts`, no
  `inputStatus`).
- League mismatch → `refused/'league'`.
- `tryDataStore` null → `'unavailable'`.
- A thrown error resolves to `'unavailable'` and does not reject.
- A store that is not ready → `'unavailable'`.

### 7.3 `src/utils/projectionSnapshot.test.js` additions
- **Byte-identity:** build a snapshot with `scoringPosteriors: null` and with a Map holding a record
  for one player (fixed `now`). Deleting `players[id].inSeason` from the second must make
  `JSON.stringify` of the two equal. The `projection` object is `toBe` the same reference as
  `seasonProjections[id]`.
- A Map entry for a player excluded by `buildPlayersBlock` (no team) adds nothing.
- `shouldWriteProjectionSnapshot`: `inSeasonSettled: false` → false. Update every existing
  `true`-expecting case to pass `inSeasonSettled: true` (a changed behaviour, asserted, not bent).
- `deriveProjectionBasis` is exported and unchanged: the existing cases now call it directly.

### 7.5 `src/__tests__/priorModelFrom.test.js` — the model-pin guard (§0 design rule 4)
Uses the `vi.mock('../utils/cache', …)` pattern and `makeVet`/`makeRookie`/`clampHiCareerStats`/
`breakoutCurves` from `src/__fixtures__/factories.js`. Fixture set (fixed, documented in the file):
default vet RB; vet WR on `clampHiCareerStats`; vet RB with `breakoutCurves()` (it replaces only the RB
curve) and age 23; default vet TE (`player: { position: 'TE' }`); default rookie WR (no draft match,
`nflDraftYears: null` → `unknown` capital); **undrafted** rookie RB — absent from `nflDraftMatches`,
with `nflDraftYears: [2026]` (entry year = `currentSeason + 1 − years_exp` = 2026 for the factory
defaults; `seasonProjection.js:209-215`); rookie QB day-3 (`nflDraftMatches` entry with a round-5
pick, `nflDraftYears: [2026]`). For each, run `computeNextSeasonProjection(f.asOptions())` and collect
`{ projectedPPG, projectedGames }`. Then:
```js
const GOLDEN = { recordedUnder: '2026-09-13', outputs: { /* recorded by running the code once */ } }
expect(GOLDEN.recordedUnder).toBe(PRIOR_MODEL_FROM)
expect(outputs).toEqual(GOLDEN.outputs)
```
with an assertion message on the second `expect`: `"Projection model output changed: re-record GOLDEN
and bump PRIOR_MODEL_FROM (inSeasonConstants.js) in the same commit — a frozen prior pins the model."`
Session 2 records `GOLDEN.outputs` from the current code (it *is* the 2026-09-13 model: no projection
change since `7b5b055` other than `47af353`'s basis rescale, which leaves `scoringSettings: null`
fixtures unchanged). If any fixture returns `null`, choose a different override — every entry must be
a real projection. This is a characterisation test: it catches output changes on these fixtures, not
every conceivable change; CR-15's Mirror remains the second line.

### 7.6 Seam assertions — added to `src/__tests__/inSeasonEvidenceViewOnly.test.js` (plan review HIGH flag)
The guard's own header asks Phase 2 to rewrite it into a controlled seam, not to slip past its regex.
Keep every existing assertion and add a `describe('the in-season scoring seam (2b-1)')` block:
- non-test importers of `inSeasonScoring` are exactly `src/App.jsx` and `src/api/frozenPrior.js`;
- `inSeasonScoring.js` imports exactly `['./inSeasonConstants']`;
- in `App.jsx`, the identifier `scoringPosteriors` appears only in its own `useMemo` declaration, that
  memo's name, and the snapshot effect (the slice from `shouldWriteProjectionSnapshot({` to the
  effect's `}, [` deps close). Count the matches outside those two slices: it must be 0;
- `writeProjectionSnapshot(`'s argument object still passes `seasonProjections,` (the raw map);
- no PIPELINE module imports `inSeasonScoring`, `inSeasonConstants` or `frozenPrior`.
Update the header comment: Phase 1's view-only rule plus the 2b-1 seam. 2b-2 extends this block
(its §5.1).

### 7.4 Guards that must stay green **unmodified**
(Except the §7.6 additions.) `currentSeasonTotalsIsolation.test.js`: PIPELINE modules still never name `currentSeasonTotals`; the
effect slice still names `setCurrentSeasonTotals` and never `setCareerStats`; the three reset lines
still carry `setCurrentSeasonTotals(null)`. `inSeasonEvidenceViewOnly.test.js`: `App.jsx` and
`projectionSnapshot.js` still never match `/inSeasonEvidence|buildInSeasonPosteriors/`. That is why
the builder is `buildScoringPosteriors`, the module is `inSeasonScoring`, and the snapshot arg is
`scoringPosteriors`. `factorsSchema`, `statKeysContract`, `projectionInputsGuard`. If any of these
needs an edit, **stop and report**. It means the wiring reached somewhere §5 does not allow.

## 8. Docs (same change)
Full list in companion `in-season-evidence-2b-1-registry.md` §8. Session 2 applies it.

## 9. Cross-repo impact (brief item 6) — app applies first, data syncs the same day

**Route:** the two-session route (Anton, 2026-09-13; the parent folder still has no CLAUDE.md and no
review gate). Session 2 applies every registry edit below to `docs/cross-repo-registry.md` in **one
commit** (commit 2, §11). A data-repo session then copies the mirrored span byte-for-byte into
`cross-repo-registry.md`. It bumps that repo's CLAUDE.md "all 24" → "all 26" and edits Invariant 4's
snapshot sentence (CR-26 Mirror). It runs `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`.
The daily mirror run is red from the app push until that sync lands. Keep it same-day. **The
companion's ordering constraint is satisfied:** `scripts/inseason-run.mjs` and
`lib/inSeasonEvidence.mjs` exist at data `a071bdb`. Anchors below were checked unique on 2026-09-26.
Never write a sentinel literal or a `sed` range inside an entry (CR-24).

**Edits (full verbatim text, anchors and emitted Mirrors: companion `in-season-evidence-2b-1-registry.md` §9.1–§9.10):**
- **CR-15** — companion-2a §A items 1–3 verbatim (the in-season harness is a consumer of the rookie reconstruction; a mirrored-factor change stales CR-25's k).
- **CR-09** — companion-2a §B verbatim (the one sanctioned analytical gamelogs read, emitting fitted parameters only).
- **CR-01** — App side names `buildScoringPosteriors`; Invariant gains the `inSeason` field (still v3); Mirror's "snapshots have no `tryDataStore` reader" sentence is replaced (they now do — CR-26).
- **CR-04** — `listManifestPaths` joins the accessor surface and triggers.
- **CR-21** — `buildScoringPosteriors` joins the in-progress readers (snapshot capture only in 2b-1; the Invariant's "never reach scoring" is amended in 2b-2).
- **CR-22, CR-18** — no text edit; Mirrors emitted (the snapshot-write effect gains a settle gate; `docs/signal-registry.md` gains a §3C row).
- **CR-25 (new)** — supersedes companion-2a §C's draft: pinned constants home, fixture, population routing, `PRIOR_MODEL_FROM`.
- **CR-26 (new)** — snapshot read-back (the frozen prior), `data→app`.
- Checked, not fired: CR-02, 07, 10, 11, 14, 16, 17, 19, 20, 23, 24.

## 10. Data-repo backlog
D-49 (registry sync + the data-side Q4 decision test + README/Invariant 4) and D-50 (model marker in
snapshots, non-blocking): verbatim entries in companion §10. Session 2 appends them.

## 11. Done-definition and commits
Commit 1: code, tests, docs, backlog (D-49 with "SHA: this commit's registry commit — see commit 2").
Commit 2: `docs/cross-repo-registry.md` + the CLAUDE.md count, one commit, so the data sync copies one
known span. Then update D-49's SHA line in a third tiny commit, or amend before push if not yet pushed.
Run `npm test`, `npm run lint`, `npm run build`. Contract tests: `factorsSchema`/`statKeysContract`
must be unaffected. **Smoke:** this slice has no visible surface. Run the app from the launch config,
let a league load, and report the `[snapshot] wrote|skipped` console line. If today's snapshot already
exists, delete only the `projection-snapshots/<today>` record via DevTools, or call
`buildProjectionSnapshot` in the console. Report one player's `inSeason` record and the `frozenPrior`
status. Expect `status: 'refused', reason: 'model-changed', dateKey: '2026-09-08'` for the
2026 season. Push per the done-definition. Hand back the SHAs, every file, deviations, what each test
asserts, and the PROVISIONAL inventory.

---

## Review record — plan gate round 1 (2026-09-26)

plan-reviewer raised 15 flags. Session 1 verified each; 14 applied, 1 answered.
| # | flag | decision |
|---|---|---|
| 1 | HIGH — naming the builder to slip past `inSeasonEvidenceViewOnly`'s regex routes around the guard | **Applied** — §7.6 seam assertions in that guard. |
| 2 | `projectionBasis` memo placement (TDZ) | Applied — §5.4 pins it after `:202-210`. |
| 3 | Synchronous setState in the effect violates `react-hooks/set-state-in-effect` (verified) | Applied — derived `liveSeasonUsable`. |
| 4 | `.catch` without a `cancelled` guard can open the first-write-wins gate | Applied — §5.3. |
| 5 | CR-15/CR-09 edits pointed at the data companion, which the gate cannot read | Applied — verbatim text copied into the companion §9.1/§9.2. |
| 6 | CR-21 misses the other new readers | Applied — companion §9.5. |
| 7 | CR-01 Triggers miss `buildScoringPosteriors`/`trimFrozenSnapshot` | Applied — companion §9.3. |
| 8 | Emitted Mirrors truncated or paraphrased | Applied — companion §9.11 carries each full current Mirror. |
| 9 | CR-22 line anchors stale | Applied — companion §9.6 refresh (Session 2 re-greps post-change). |
| 10 | CR-04 misses the `ktc.js` manifest bypass | Applied — companion §9.4. |
| 11 | CR-01 `App.jsx:602-604` stale | Applied — refreshed in companion §9.3. 2b-2 §10.2 refreshes the rest. |
| 12 | `inProgress` snapshots would silently read as `unavailable` | Applied — CR-26 Invariant; §4 note. |
| 13 | Body read unbounded past headers (verified) | Applied — §4 step 6 `Promise.race` 30 s. |
| 14 | §7.5 fixtures (no "undrafted" marker; `breakoutCurves` is RB-only) | Applied — fixture list corrected. |
| 15 | Slice size | Answered — docs/backlog moved to the companion; file under 40 KB. |

---

## Verification record (2026-09-27)
Session 2 hand-back: `a5e7901..eacde17` (85b2b7a code, 684317f registry, eacde17 D-49 SHA), pushed before
verification (process deviation, noted — it opened the CR-24 red window early; no harm found).
implementation-reviewer found no blocking issue. It confirmed clean: the pipeline, snapshot `projection`
and writer input are untouched; App.jsx placement, effects, `cancelled` guards and `inSeasonSettled`; the
seam allow-list check is real; the loader's epoch refusal, trimmed cache and 30 s race; 46/46
re-derivation; the registry text matches the companion verbatim; the fixture sha1; CLAUDE.md is 24,815 bytes.
| flag | decision |
|---|---|
| `listManifestPaths`/`isValidProjectionSnapshot` untested; the loader test mocks the validator to `true` | **Fix** — item 1 |
| `vetRB_breakout` also uses `clampHiCareerStats` (undeclared) | **Accept, declared here**: it still exercises the breakout curve and gives a real projection. Re-recording would buy nothing. |
| Bare `.toThrow()` in the two Q4 branch cases | **Fix** — item 2 |
| D-50 names no commit | **Fix** — item 3 |
| Mirrors not in the commit messages | **Fix** — the untracked `…-handback-mirrors.md` holds CR-01/04/09/15/18/21/22 but lacks CR-25/CR-26; item 4 completes and commits it. It is the D-49 session's instruction source. |
| Pushed before verification | Noted; no action. |
Also, from the hand-back: the stale `src/api/ktc.js:125` comment (item 5, a one-line hygiene fix).

## Fix pass 1
Scope: exactly these five items. Touch nothing else. One commit, then push (`git pull --rebase origin
main` first, never `--force`).
1. **Tests for the new data-store exports.**
   - Add to the existing `src/api/dataStore.test.js`: `isValidProjectionSnapshot` → `true` for
     `{ players: {}, leagueId: 'x', targetSeason: 2026 }`, and `false` for `null`, `players: null`,
     a non-string `leagueId`, and `targetSeason: NaN` or `'2026'`.
   - `listManifestPaths('snapshots/')`, with the `fetch`/cache mocking pattern the existing
     dataStore tests use: it returns only the matching keys, and `[]` when the manifest is unavailable.
     If `dataStore.js`'s module-level env or `manifestPromise` state makes a direct test impractical,
     use `vi.resetModules` + `vi.stubEnv`. If that is still impractical, stop and report; do not skip
     the case silently.
   - In `src/api/frozenPrior.test.js` "miss: one fetch…", assert
     `tryDataStore.mock.calls[0][1].validate === isValidProjectionSnapshot`, the mocked export's
     identity.
2. `src/__tests__/inSeasonConstants.test.js`: in the keep-own and pooled branch cases, replace
   `.toThrow()` with `.toThrow(/<exact substring of expectedK's fixtureKey-guard message>/)` for each
   branch. Use the real message text from `expectedK`.
3. `.claude/tasks/data-repo-backlog.md`, D-50: add "Found by: `85b2b7a` (in-season 2b-1)". Blocks: no.
4. `.claude/tasks/in-season-evidence-2b-1-handback-mirrors.md`: append `## CR-25` and `## CR-26`
   sections carrying each entry's full `Mirror` field verbatim from `docs/cross-repo-registry.md`.
   Commit the file.
5. `src/api/ktc.js:125`: the comment says `dataStore.js` has no manifest-enumeration export. Reword
   it: "`listManifestPaths` now exists; this reader still reads the cached manifest directly (CR-04
   names the bypass)". Comment only; no code change.
Also commit the untracked `.claude/tasks/in-season-evidence-2b-2-scoring.md` in the same commit
(plan artifact, approved).
Done-definition: `npm test`, `npm run lint`, `npm run build`. Hand back the SHA and what each new
assertion checks.
