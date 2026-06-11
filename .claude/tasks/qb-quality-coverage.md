# QB quality coverage — un-rostered starters (F1-A) + test seam for the OQ mutation (F4-A)

_Source findings: `.claude/tasks/backend-audit.md` → F1-A, F4-A (and Top Rec #4). Planning session: opus, 2026-06-12. Implementer: sonnet._

## Objective

1. **F1-A**: `computeQBQualityByTeam` includes every relevant NFL QB regardless of fantasy-roster status, so the QB-quality modifier on the dynasty `opportunityQuality` component is meaningful league-wide instead of a no-op for teams whose starter is un-rostered.
2. **F4-A**: the QB-quality computation *and* the OQ-modifier math are unit-test-covered so a NaN / out-of-range regression fails CI instead of silently corrupting OQ for every skill player on a team.

---

## GATING RESOLUTION (read first — this shapes the whole design)

`qbQualityByTeam` feeds **two** consumers:

1. **Dynasty**: the `playerRowsWithQBMod` memo (App.jsx pipeline step 4, ~lines 805-851) — modifies `dynastyScore.components.opportunityQuality` and `dynastyScore.score`. Dynasty score is **not** backtest-gated → shippable now.
2. **Projection**: App.jsx passes `qbQualityByTeam` into `computeNextSeasonProjection` (App.jsx:904) where it becomes **Step 7b** `qbQualityFactor = 1.0 + (q − 50)/100 × 0.10` (`seasonProjection.js:553-563`), an active `combinedNewFactor` multiplier. Expanding QB coverage gives ~half the league's teams a real (non-neutral) factor → **moves `projectedPPG` → backtest-gated → must NOT ship in this task**.

**Isolation design:** the expanded computation ships to the dynasty consumer only. The projection keeps receiving a map computed with today's rostered-only behavior, so its inputs — and therefore `projectedPPG`, the `qbQualityScore`/`qbQualityFactor` factors, and the exported snapshots — stay **byte-identical**. `seasonProjection.js` is not touched at all. The swap of the projection input to the expanded map is recorded below as a backtest-gated follow-up.

This creates a temporary, *deliberate* divergence (dynasty sees league-wide QB quality; projection sees rostered-only). It is documented in three places (CLAUDE.md pipeline note, docs/architecture.md, docs/projection.md Step 7b) so it cannot be mistaken for an accident.

---

## Verified groundwork (done in planning; implementer does not need to re-derive)

### The fix reaches the target QBs (candidate-pool check)

Un-rostered NFL starting QBs are present in `playerRowsWithKTC`:

- `playerIdSet` (App.jsx:656-671) includes every player with any careerStats appearance plus active `years_exp === 0` skill rookies — every actual starter has one or the other.
- The relevance gate (`relevance.js` → `isRelevantPlayer`) then keeps them via Rule 4 (authoritative nflverse-roster presence, when the roster feed is complete), Rule 5 (`playedRecently`, GP > 0 in last 2 seasons), Rule 3 (current rookies), or Rule 6 (team + KTC rescue).
- **Residual drop (document, don't fix):** a non-rookie, fantasy-un-rostered QB with zero GP in the last 2 seasons is dropped only when the nflverse roster feed is unavailable/incomplete (`rs === 'unknown'` disables Rule 4) AND KTC doesn't list him (disables Rule 6). That describes a comeback signee in a brief offseason window before KTC lists him — no realistic Week-1 starter. No relevance.js change is in scope.

### QB1 selection still picks the true starter over the enlarged pool

- `depthMap` is built from `leagueData.playerMap` (App.jsx:553-561) — **all** Sleeper players, not just fantasy-rostered ones — so un-rostered starters carry `depthOrder: 1` and the existing `qbs.find(q => q.depthOrder === 1)` preference (`teamContext.js:26-28`) picks them. This is the audit's point that the QB1 preference already handles multi-QB teams independent of roster status.
- Fallback when no depth-chart QB1 is found (`teamContext.js:30-31`): highest `currentSeasonPPG`. Over the enlarged pool this can pick a benched/just-traded vet whose last-season PPG beats the new starter's — but that fallback semantics is pre-existing and unchanged; the depth chart is normally present and wins. Two `depthOrder === 1` QBs on one team (stale Sleeper data) resolve by `playerRows` iteration order — also pre-existing, unchanged.

### F4-A seam decision: **option (b)** — extract the OQ-modifier math, plus source-level unit tests

Recommendation rationale:
- Option (a) alone leaves F4-A's actual risk surface — the mutation math (modifier formula, clamps, score re-blend) — untested; the audit's fix direction explicitly asks to "assert the OQ modifier on a sample WR row is finite and within the expected range".
- The codebase has a direct precedent: `relevance.js`, whose header reads "Extracted from App.jsx so they can be unit-tested independently. Called at the same point in the playerRows memo — this is not a pipeline reorder." This extraction follows that exact pattern and justification: it is **required for testability**, not an incidental refactor. The "no refactor of working utility functions" invariant is not implicated — the code being moved lives in App.jsx (untested), not in a utility; `computeQBQualityByTeam` itself gets only the F1-A parameter, no restructure. App.jsx still owns all state; the helper is pure.
- Both layers ship: comprehensive `computeQBQualityByTeam` unit tests (the NaN/range source) **and** unit tests on the extracted modifier (the mutation). The `playerRowsWithQBMod` memo body shrinks to a one-line `.map`, and the memo itself remains smoke-only (README Testing → Scope already documents that App.jsx pipeline integration is out of the suite's reach; see Docs updates).

---

## Changes — file by file

### 1. `src/utils/teamContext.js` — `computeQBQualityByTeam` (lines ~8-36)

New signature (third positional param, default preserves today's behavior exactly):

```js
export function computeQBQualityByTeam(playerRows, depthMap = null, includeUnrostered = false)
```

Filter block changes from

```js
if (row.position !== 'QB' || !row.nfl_team || row.ownerTeamName == null) continue
```

to

```js
if (row.position !== 'QB' || !row.nfl_team) continue
if (includeUnrostered) {
  if (row.nfl_team === 'FA') continue   // free agents have no team offense — see note below
} else {
  if (row.ownerTeamName == null) continue   // legacy rostered-only behavior (projection Step 7b input)
}
```

Everything else (quality fallback chain `dynastyScore?.score ?? ktc/100 ?? 50`, depth-chart QB1 preference, PPG fallback) is untouched.

**Legacy mode (`false`) must be byte-identical to today** — including the quirk that a fantasy-rostered QB whose Sleeper team is null gets `nfl_team: 'FA'` (App.jsx:730) and creates an `'FA'` bucket. The projection never reads that key (`playerMap[...].team` is null for true FAs, so Step 7b looks up `qbQualityByTeam[null]` → undefined → neutral), so preserving it is free.

**Expanded mode skips `'FA'` — the one deliberate dynasty-side behavior delta beyond coverage expansion.** Rationale: in the dynasty consumer, `playerRowsWithQBMod` looks up by `row.nfl_team`, and FA skill rows have `nfl_team === 'FA'` — so an `'FA'` bucket feeds a semantically meaningless "QB quality" modifier to free-agent WR/TE/RBs (which QB is "their" QB?). Today this fires only when a fantasy-rostered FA QB exists (rare); with un-rostered QBs included it would fire **always** (the bucket would contain every un-rostered FA QB, winner = highest last-season PPG). Skipping `'FA'` in expanded mode means FA skill rows keep their unmodified OQ. This changes dynasty output only for FA skill players in leagues that currently roster an FA QB — a correctness fix, shippable (dynasty is not gated), pinned by test #8 below.

### 2. `src/utils/teamContext.js` — new pure helper `applyQBQualityModifier`

Append near `computeQBQualityByTeam` (it is its sibling consumer-side function). Header comment must carry the relevance.js-style justification: _"Extracted from App.jsx (playerRowsWithQBMod memo) so the OQ-modifier math can be unit-tested independently. Called at the same point in the pipeline — this is not a pipeline reorder."_

```js
/**
 * Applies the QB-quality modifier to one player row's opportunityQuality
 * component and dynasty score. Pure: returns the SAME row reference when the
 * modifier does not apply (QB rows, missing components, team not in map,
 * non-finite qbScore, non-workhorse RB), otherwise a new row object.
 *
 * @param {Object} row              playerRowsWithKTC row
 * @param {Object} qbQualityByTeam  { [nfl_team]: number 0–100 }
 * @returns {Object} row (unchanged reference) or modified copy
 */
export function applyQBQualityModifier(row, qbQualityByTeam)
```

Body: **verbatim move** of the current map-callback internals from App.jsx:809-850 — position/`components` gate, `qbScore` lookup with `if (qbScore == null) return row`, WR/TE modifier `0.85 + (qbScore / 100) * 0.30`, workhorse-RB (carryShare > 0.30) modifier `1.10 - (qbScore / 100) * 0.15`, `if (modifier == null) return row`, `newOq = Math.round(Math.max(0, Math.min(100, oldOq * modifier)))`, `newScore = Math.round(Math.max(0, Math.min(100, ds.score + (newOq - oldOq) * 0.15)))`, `modPct = Math.round((modifier - 1) * 100)`, and the spread-construction of the new row with updated `score`, `components.opportunityQuality.value`, and `signals.qbQualityScore` / `signals.qbModifierApplied`.

**One additive guard** (the F4-A NaN firewall at the seam — behavior-identical for finite inputs):

```js
if (qbScore == null || !Number.isFinite(qbScore)) return row
```

(replaces the existing `if (qbScore == null) return row`). No dev-warn needed — the unit tests on `computeQBQualityByTeam` are the CI tripwire; the guard is the production backstop.

Do **not** change any math, rounding, or clamp. The modifier ranges, for the record (used by tests): WR/TE ∈ [0.85, 1.15]; workhorse RB ∈ [0.95, 1.10]; max score delta = ±15 OQ pts × 0.15 = ±2.25 → ±2 after rounding.

### 3. `src/App.jsx` — three localized edits, no pipeline reorder

**3a. Step 3 memo** (lines ~797-800) — dynasty-side map goes league-wide:

```js
// QB quality map: requires KTC values to be merged so the ktcValue fallback works.
// Uses depthMap to prefer the depth-chart QB1. League-wide (includes un-rostered
// QBs) for the dynasty OQ modifier — F1-A.
const qbQualityByTeam = useMemo(
  () => computeQBQualityByTeam(playerRowsWithKTC, depthMap, true),
  [playerRowsWithKTC, depthMap]
)

// Projection Step 7b input — INTENTIONALLY kept on the legacy rostered-only
// behavior so projectedPPG and snapshots are byte-identical. Swapping the
// projection to the league-wide map is a projection-input change and is
// backtest-gated (see .claude/tasks/qb-quality-coverage.md → Follow-up).
const qbQualityByTeamRostered = useMemo(
  () => computeQBQualityByTeam(playerRowsWithKTC, depthMap),
  [playerRowsWithKTC, depthMap]
)
```

(Adding a sibling memo at the same step is not a reorder; both depend only on step-2 output + `depthMap`. Cost is one extra O(rows) pass.)

**3b. `playerRowsWithQBMod` memo** (lines ~805-851) — body collapses to the extracted helper:

```js
const playerRowsWithQBMod = useMemo(() => {
  if (!playerRowsWithKTC.length || !Object.keys(qbQualityByTeam).length) {
    return playerRowsWithKTC
  }
  return playerRowsWithKTC.map(row => applyQBQualityModifier(row, qbQualityByTeam))
}, [playerRowsWithKTC, qbQualityByTeam])
```

Import `applyQBQualityModifier` alongside the existing `teamContext.js` imports. The early-return guards stay in the memo (they are memo-level short-circuits, not per-row logic).

**3c. `seasonProjections` memo** (lines ~884-915): pass `qbQualityByTeam: qbQualityByTeamRostered` in the `computeNextSeasonProjection` options, and replace `qbQualityByTeam` with `qbQualityByTeamRostered` in the dependency array. **No other projection-side change.** `seasonProjection.js` is not edited; `factorsSchema.test.js` must pass untouched.

### 4. `src/utils/seasonProjection.js` — **no change** (gating resolution above)

---

## Step sequence for implementation

1. `teamContext.js`: add `includeUnrostered` param (change 1), then add `applyQBQualityModifier` (change 2).
2. `App.jsx`: edits 3a → 3b → 3c.
3. Tests (below).
4. Docs updates (below).
5. Done-definition: `npm test` green; `factorsSchema.test.js` untouched and green (seasonProjection.js unchanged); `npm run build` clean; `npm run lint`.

**Behavior-identity checklist for the implementer to verify explicitly:**
- Legacy-mode `computeQBQualityByTeam(rows, depthMap)` output deep-equals the pre-change function for any fixture (test #1/#3/#8 pin this).
- `projectedPPG` and all `factors` values unchanged for every existing projection test (suite must pass with zero edits to `seasonProjection.test.js`).
- For a fully-rostered, non-FA fixture, expanded mode === legacy mode (test #3) — the dynasty change only *adds* teams.

---

## Tests to add

All in `src/utils/teamContext.test.js` (existing co-located file; plain `describe`/`it`, no mocks needed — both functions are pure). Build minimal row literals inline; a row needs only the fields the functions read: `player_id`, `position`, `nfl_team`, `ownerTeamName`, `currentSeasonPPG`, `ktcValue`, `dynastyScore: { score, components: { opportunityQuality: { value } }, signals: { carryShare } }`.

### `describe('computeQBQualityByTeam')`

1. **Legacy default excludes un-rostered QBs** (pins the projection-path input): QB on `'BUF'` with `ownerTeamName: null`, `dynastyScore.score: 80` → `computeQBQualityByTeam(rows, null)` has no `BUF` key.
2. **Expanded includes them** (F1-A): same fixture, `includeUnrostered: true` → `result.BUF === 80`.
3. **Flag is a no-op for fully-rostered non-FA fixtures**: 3 teams, all QBs `ownerTeamName` set → expanded result deep-equals legacy result.
4. **Depth-chart QB1 preference survives the enlarged pool** (the F1-A regression catcher): team `'KC'` with un-rostered starter (`depthOrder` via `depthMap = { qb1: { depthOrder: 1 } }`, quality 75, PPG 14) and rostered backup (`depthOrder: 2`, quality 40, PPG 18 — higher PPG). Expanded → `result.KC === 75`. Legacy → `result.KC === 40` (backup is the only candidate — assert this too; it documents the failure mode being fixed).
5. **PPG fallback without depthMap**: two QBs, no `depthMap` (pass `null`) → highest `currentSeasonPPG` wins.
6. **Quality fallback chain**: QB with no `dynastyScore` and `ktcValue: 6000` → quality 60; `ktcValue: 12000` → capped at 100; neither score nor KTC → 50.
7. **Output contract sweep (the F4-A CI tripwire at the source)**: mixed fixture — 4+ teams covering rostered, un-rostered, score-less (KTC-only), and bare (neither) QBs — assert for every entry of the expanded result: `Number.isFinite(v)` and `v >= 0 && v <= 100`; assert teams with no QB rows are absent (consumers default to neutral on missing keys).
8. **FA handling pins both modes**: (i) expanded mode with un-rostered `nfl_team: 'FA'` QBs → no `'FA'` key; (ii) legacy mode with a *rostered* `nfl_team: 'FA'` QB → `'FA'` key present (preserves today's projection-input bytes).
9. **Empty input**: `computeQBQualityByTeam([], null, true)` → `{}`.

### `describe('applyQBQualityModifier')`

Use a standard WR row factory in the test file: `{ position: 'WR', nfl_team: 'KC', dynastyScore: { score: 70, components: { opportunityQuality: { value: 60, efficiencyPercentile: 55, volumePercentile: 65 } }, signals: {} } }`.

10. **WR, qbScore 100** → modifier 1.15: `components.opportunityQuality.value === 69` (`round(min(100, 60×1.15))`), `score === Math.round(70 + (69−60)×0.15) === 71`, `signals.qbQualityScore === 100`, `signals.qbModifierApplied === 15`; other OQ subfields (`efficiencyPercentile` etc.) preserved by spread.
11. **WR, qbScore 0** → modifier 0.85: `value === 51`, `qbModifierApplied === -15`, `score === Math.round(70 + (51−60)×0.15) === 69`.
12. **WR, qbScore 50 (neutral)** → modifier 1.0: value and score unchanged in *value*, but a **new annotated object** is returned (`qbModifierApplied === 0`) — pins current behavior exactly.
13. **Workhorse RB** (`signals.carryShare: 0.5`, OQ 60): qbScore 100 → modifier 0.95 → `value === 57`; qbScore 0 → modifier 1.10 → `value === 66`. **Non-workhorse RB** (`carryShare: 0.2` and `carryShare: null`): returns the **same reference** (`expect(result).toBe(row)`).
14. **No-op reference identity** for: QB row; row with `dynastyScore.components: null` (Limited Data / prospect); team absent from the map — all `toBe(row)`.
15. **Finiteness guard (new behavior)**: `qbQualityByTeam = { KC: NaN }` → returns the same reference, OQ untouched. Also sweep qbScore ∈ {0, 25, 50, 75, 100} asserting `value` finite ∈ [0,100] and modifier-implied `qbModifierApplied` ∈ [−15, 15].
16. **Clamp pins**: WR with OQ 95, qbScore 100 → `value === 100` (upper clamp via `min(100, 95×1.15=109.25)`); WR with OQ 0 → `value === 0` either direction.

### Existing tests / contract tests

- No edits to any existing test. `factorsSchema.test.js` and `statKeysContract.test.js` are unaffected (no `seasonProjection.js` change, no stat keys touched) but run with the suite per the done-definition.
- The App.jsx memo itself remains uncovered (suite scope excludes App.jsx — README Testing → Scope); after this change it contains only short-circuits and a `.map` over the tested helper, which is the point of the extraction.

---

## Docs updates

1. **CLAUDE.md → "playerRows pipeline" section**, step 3 line. Before:
   > 3. **`qbQualityByTeam`** — `computeQBQualityByTeam(playerRowsWithKTC, depthMap)`; prefers depth-chart QB1

   After:
   > 3. **`qbQualityByTeam`** — `computeQBQualityByTeam(playerRowsWithKTC, depthMap, true)`; prefers depth-chart QB1; league-wide (includes un-rostered QBs). A sibling memo `qbQualityByTeamRostered` (legacy rostered-only) feeds projection Step 7b — intentional divergence until the projection swap clears its backtest (see docs/projection.md → Step 7b).

2. **CLAUDE.md → Navigation map → `teamContext.js` row**: append `applyQBQualityModifier` to the function list: `…, computeShareTrend, buildTeamDepthChart, applyQBQualityModifier (QB-quality OQ modifier — extracted from App.jsx for testability)`.

3. **docs/architecture.md → playerRows pipeline block** (lines ~67-68). Before:
   ```
   → qbQualityByTeam (useMemo)     — uses depthMap to prefer depth-chart QB1
   → playerRowsWithQBMod (useMemo) — applies QB quality modifier to WR/TE/RB OQ (15% weight)
   ```
   After:
   ```
   → qbQualityByTeam (useMemo)     — computeQBQualityByTeam(…, true): league-wide incl.
                                     un-rostered QBs; depthMap prefers depth-chart QB1.
                                     Sibling qbQualityByTeamRostered (legacy rostered-only)
                                     feeds projection Step 7b only (backtest-gated swap pending)
   → playerRowsWithQBMod (useMemo) — applyQBQualityModifier (teamContext.js) per WR/TE/RB row:
                                     OQ × [0.85–1.15] (WR/TE) or [0.95–1.10] (workhorse RB),
                                     score re-blended at 15% weight
   ```

4. **docs/dynasty-scoring.md → "Opportunity quality modifiers" item 3** (line ~93). Before:
   > 3. **QB quality modifier** (WR/TE/RB only): 15% weight blended into OQ based on `computeQBQualityByTeam`.

   After:
   > 3. **QB quality modifier** (WR/TE/RB only), applied post-score in the `playerRowsWithQBMod` pipeline step via `applyQBQualityModifier` (`teamContext.js`): WR/TE OQ × `0.85 + qbScore/100 × 0.30` (range 0.85–1.15); workhorse RBs (carry share > 0.30) inverse × `1.10 − qbScore/100 × 0.15` (range 0.95–1.10); the dynasty score is then adjusted by the OQ delta at the component's 15% weight. `computeQBQualityByTeam` is league-wide — every NFL team's QB room counts regardless of fantasy-roster status (depth-chart QB1 preferred; PPG fallback; quality = dynasty score, else KTC/100, else 50). Free-agent (`'FA'`) QBs are excluded — FA skill players receive no QB modifier. Non-finite quality values are ignored (row passes through unmodified).

5. **docs/projection.md → Step 7b row** (line ~28). Append to the Notes cell:
   > Input map is the **rostered-only** `qbQualityByTeamRostered` (legacy behavior) — NOT the league-wide map the dynasty OQ modifier uses; swapping the projection to league-wide QB coverage moves `projectedPPG` and is backtest-gated (see `.claude/tasks/qb-quality-coverage.md`).

6. **README.md → Testing → Scope** (line ~71): after the sentence "It does **not** cover App.jsx pipeline integration…", append:
   > The QB-quality OQ modifier math is covered: it lives in `applyQBQualityModifier` (`teamContext.js`, extracted from the `playerRowsWithQBMod` memo) with unit tests; only the memo's `.map` wiring remains smoke-only.

7. **README.md → Project structure**, `teamContext.js` line (~104): append `applyQBQualityModifier()` to the listed functions.

---

## Cross-repo impact

**None.** The projection receives byte-identical inputs, so `computeNextSeasonProjection` output — and therefore the snapshot `projection` field (`factors.qbQualityScore` / `qbQualityFactor`) — is unchanged; no `factors` key is added/removed; no snapshot `schemaVersion` bump.

(For the record: the *future* gated swap of Step 7b to the league-wide map will change snapshot factor **values** but not shape — still no schema bump, no data-repo coordination.)

---

## Follow-up (backtest-gated — do NOT do in this task)

Swap projection Step 7b to the league-wide map: in App.jsx 3c, pass `qbQualityByTeam` (expanded) instead of `qbQualityByTeamRostered`, delete the `qbQualityByTeamRostered` memo, and remove the `includeUnrostered` flag (making league-wide the only behavior). Validate via the snapshot-backtest layer the roadmap tracks (this is a `projectedPPG`-moving change in the same class as the deep-audit's gated items). Until then, the flag and sibling memo are load-bearing — do not "clean them up".

## Out of scope (explicitly)

- Any `seasonProjection.js` edit, any `projectedPPG` change, any snapshot change.
- relevance.js changes (residual pool-drop case documented above is acceptable).
- The QB1 PPG-fallback semantics and duplicate-`depthOrder===1` resolution (pre-existing, unchanged).
- F4-B and all other audit findings.
