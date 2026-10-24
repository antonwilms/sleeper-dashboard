# Dynasty label after the QB modifier + dynasty-scoring.md drift corrections

Review depth: full — changes the output of a `playerRows` pipeline step (`applyQBQualityModifier` in `playerRowsWithQBMod`) and the value `projectionSnapshot.js` captures as `players[id].dynasty.label`.

Model for Session 2: **sonnet**, effort medium.

## Goal

1. A dynasty label always agrees with the dynasty score the user sees. Today `computeDynastyScore`
   (`src/utils/dynastyScore.js:1042–1083`) picks the label from `finalScore`, then
   `applyQBQualityModifier` (`src/utils/teamContext.js:100–141`) moves `score` by up to ±15 points
   and keeps the old label — e.g. a WR pushed from 69 to 71 stays "Solid Floor" instead of "Peak Window".
   Fix: extract the label rules into one shared pure function and re-pick the label from the
   post-modifier score.
2. Correct four places where `docs/dynasty-scoring.md` has drifted from the code.

## Hard constraints

- **No dynasty `score` value and no `projectedPPG` may change.** Only `label` may change, and only
  for rows whose QB modifier moves the score across a label threshold.
- Label rules are moved verbatim — same branch order, same comparisons (`>=`, `>`), same strings.
- No change to `factors`, `seasonProjection.js`, `PRIOR_MODEL_FROM` (labels are explicitly exempt —
  `docs/nav/utils.md` `inSeasonConstants.js` row).
- **Out of scope:** switching off the share-trend boost for team-changers (changes scores; waits
  for the dynasty-score backtest). Do not touch `computeShareTrend` or the boost.

## Part 1 — shared label function

### 1a. New module `src/utils/dynastyLabel.js`

Pure leaf module, **no imports**. Placed in its own file (not in `dynastyScore.js`) because
`dynastyScore.js` already imports `computeShareTrend` from `teamContext.js`; importing back from
`dynastyScore.js` into `teamContext.js` would create a cycle.

```js
// Dynasty label rules for components-path (Paths B/C) scores — the single source of truth.
// Called by computeDynastyScore (initial label) and applyQBQualityModifier (re-pick after the
// post-score QB-quality modifier moves the score). Prospect / Limited Data labels are not here.
export function pickDynastyLabel({ score, isLateCareer, isBreakout, isBounceBack, slope, age, depthOrder }) {
  let label
  // (body = dynastyScore.js:1043–1083 verbatim, with `finalScore` → `score`,
  //  including the late-career comment and the depth-3 LABELS_ABOVE_FLOOR gate)
  return label
}
```

Exact body (moved, not rewritten):

```js
  let label
  if (isLateCareer) {
    label = score >= 55 ? 'Veteran Producer'
          : score >= 40 ? 'Managed Decline'
          : score >= 20 ? 'Sell Now'
          : 'Fading'
  } else if (isBreakout) {
    label = 'Breakout'
  } else if (isBounceBack) {
    label = 'Bounce-back'
  } else if (score >= 80) {
    label = 'Elite'
  } else if (score >= 70 && slope > 0) {
    label = 'Ascending Star'
  } else if (score >= 70) {
    label = 'Peak Window'
  } else if (score >= 55 && age != null && age <= 25) {
    label = 'Developing'
  } else if (score >= 55 && slope > 0) {
    label = 'Rising'
  } else if (score >= 55) {
    label = 'Solid Floor'
  } else if (score >= 40 && slope >= 0) {
    label = 'Plateau'
  } else if (score >= 40) {
    label = 'Managed Decline'
  } else if (score >= 20) {
    label = 'Sell Now'
  } else {
    label = 'Fading'
  }
  if (depthOrder != null && depthOrder >= 3) {
    if (LABELS_ABOVE_FLOOR.has(label)) label = 'Solid Floor'
  }
  return label
```

Hoist `LABELS_ABOVE_FLOOR` to a module-level `const` (same seven members:
`'Elite', 'Ascending Star', 'Peak Window', 'Developing', 'Rising', 'Breakout', 'Bounce-back'`).
Not exported.

### 1b. `src/utils/dynastyScore.js`

- Add `import { pickDynastyLabel } from './dynastyLabel'`.
- Replace lines 1042–1083 (the `// ── Label ──` block through the depth-3 gate) with:
  ```js
  // ── Label ── (rules in dynastyLabel.js; re-picked after the QB modifier)
  const label = pickDynastyLabel({ score: finalScore, isLateCareer, isBreakout, isBounceBack, slope, age, depthOrder })
  ```
  `slope` here is the raw `weightedLinearRegression` result (line 883), **not** `normalizedSlope`.
- In the components-path `signals` object (line 1100–1128) add two keys, retained so the label can
  be re-picked downstream:
  ```js
      slopeRaw:          slope,   // unrounded — label input (sign matters; trajectory.slope is rounded)
      age,                        // label input (Developing gate)
  ```
  Place them after `isLateCareer`. Why `slopeRaw` and not `components.trajectory.slope`: that value
  is `normalizedSlope` rounded to 3 dp, so a small positive slope rounds to `0` and would flip
  `slope > 0` (Ascending Star / Rising) on re-pick. Store `slope` as-is (no rounding, no `?? null`
  coercion — if it is `NaN` it must stay `NaN` so `NaN > 0` / `NaN >= 0` stay `false` exactly as today).
- Do **not** touch the prospect path (lines 739–744) or any Limited Data return.

### 1c. `src/utils/teamContext.js` — `applyQBQualityModifier`

- Add `import { pickDynastyLabel } from './dynastyLabel'`.
- After `newScore` is computed (line 122), add:
  ```js
  // Re-pick the label from the post-modifier score (same rules as computeDynastyScore). Rows
  // without the components-path label inputs keep their label.
  const sig   = ds.signals ?? {}
  const label = 'slopeRaw' in sig
    ? pickDynastyLabel({ score: newScore, isLateCareer: sig.isLateCareer, isBreakout: sig.isBreakout,
                         isBounceBack: sig.isBounceBack, slope: sig.slopeRaw, age: sig.age, depthOrder: sig.depthOrder })
    : ds.label
  ```
  and in the returned `dynastyScore` object add `label,` immediately after `score: newScore,`.
- Presence gate is `'slopeRaw' in sig` (key presence, not `!= null`), because `slopeRaw` can
  legitimately be `NaN`. Every components-path score carries it after 1b; the gate only protects
  hand-built rows (existing `makeWRRow` fixtures have `signals: {}`).
- Update the JSDoc: "Applies the QB-quality modifier … component and dynasty score, and re-picks the
  label from the modified score."
- The early-return paths (same row reference) are unchanged.
- `newOq`, `newScore`, `modPct` arithmetic: **unchanged**.
- One comment-only change in `computeTeamContext` at line 212–213 (WR/TE branch):
  `// "targetShare" is receptions ÷ team receptions (rec), not targets — name kept for compatibility.`

### 1d. Pipeline / snapshot effect (document, do not change)

`playerRowsWithQBMod` → everything downstream (Market, pop-up, `marketFilters` dynasty groups,
`projectionSnapshot.js` `buildDynastyCapture` → `players[id].dynasty.label`) now sees the re-picked
label. Score and component values captured are byte-identical. `dynastyScoreBase` (QB-only) is never
passed through the modifier (QBs return early) — unaffected.

## Part 2 — `docs/dynasty-scoring.md` corrections

All text states mechanism only (docsAvailabilityClaims rule). Anchors are current line numbers.

**2a. Opportunity quality (line 91, table row).** Replace the "What it measures" cell with:
`Efficiency percentile (40%) + volume percentile (30%) + team share score (30%) when a share exists; efficiency (55%) + volume (45%) without one`
and add, directly under the table (before the `components[*].weight` blockquote), a paragraph:

> **Opportunity-quality share score** (`computeOpportunityQuality`): the share comes from the
> current-team `teamContext.playerShares` entry. RB: `carryShare × 200`; WR/TE: `targetShare × 400`;
> both rounded and capped to 0–100. With a share score the base is `0.40 × efficiency + 0.30 ×
> volume + 0.30 × share`; with no share entry for the player (or a `null` share for their position)
> it is `0.55 × efficiency + 0.45 × volume`. The WR/TE `targetShare` from `computeTeamContext` is
> **receptions ÷ team receptions** (`rec`), not targets; `computeHistoricalShares` (the share-trend
> input) is the one that uses targets (`rec_tgt`, receptions fallback).

**2b. Share-trend thresholds (line 127).** Replace with:
`- \`growing\` (relative change > +20%), \`expanding\` (> +5%), \`stable\` (−5% to +5% inclusive), \`shrinking\` (−20% to below −5%), \`declining\` (< −20%). Relative change = (recent share − weighted prior) ÷ max(weighted prior, 0.01).`
Also replace line 126 with:
`- Weighted prior: most recent prior 50%, second-most-recent prior 30%, third-most-recent prior 20%; weights renormalised over the priors present; older seasons ignored`
(`computeShareTrend` weights only p1/p2/p3 and divides by `totalW` — `teamContext.js:319–328`; plan-reviewer wording).

**2c. Label table order (lines 158–177).** Move the `Bounce-back | Blue | isBounceBack signal` row
to sit directly after `Breakout`, and add one line above the table:
`Standard labels are checked in table order (first match wins); the late-career gate (above) runs before all of them and the depth-3 cap after. Rules live in \`pickDynastyLabel\` (\`src/utils/dynastyLabel.js\`).`
Change the `Elite` row's routing cell from `score ≥ 80, not late-career` to `score ≥ 80`
(late-career is covered by the new sentence).

**2d. targetShare (line 121).** In "The dynasty OQ share score, `carryShare`/`targetShare`/…
signals", after `targetShare` insert ` (receptions ÷ team receptions, not targets)`.

**2e. QB modifier (line 123, item 3).** Append one sentence: "The label is then re-picked from the
modified score with the same rules (`pickDynastyLabel`), so a modifier that crosses a band changes
the label; rows without components-path label inputs keep theirs."

**2f. Signals.** In the *Special signals* list add: `- **slopeRaw / age**: unrounded trajectory slope and player age, retained as label inputs for the post-modifier re-pick.`

## Part 3 — other docs (same change)

- `docs/nav/utils.md`: add a row `| \`dynastyLabel.js\` | \`pickDynastyLabel\` — the components-path dynasty label rules (late-career gate, Breakout, Bounce-back, 80/70/55/40/20 bands, depth-3 cap); pure leaf module, no imports. Called by \`computeDynastyScore\` and \`applyQBQualityModifier\` (re-pick after the QB modifier) |` next to the `dynastyScore.js` row; append `dynastyLabel.js` to the `dynastyScore.js` row's import list; in the `teamContext.js` row change `applyQBQualityModifier (QB-quality OQ modifier — …)` to note it re-picks the label via `dynastyLabel.js`.
- `docs/architecture.md:146`: change `score re-blended at 15% weight` to `score re-blended at 15% weight, label re-picked (pickDynastyLabel)`.
- No CLAUDE.md change (no new trap/invariant; no `src/` directory added). No signal-registry change (no factor, raw source or capture field added — `dynasty.label` already captured).

## Tests to add / update

**New `src/utils/dynastyLabel.test.js`** — table-driven, one case per branch, asserting the exact string:
1. late-career wins over breakout: `{score: 85, isLateCareer: true, isBreakout: true}` → `'Veteran Producer'`; late-career 45 → `'Managed Decline'`; 25 → `'Sell Now'`; 10 → `'Fading'`.
2. Breakout beats score 90 → `'Breakout'`; Bounce-back with score 90 (no breakout) → `'Bounce-back'` (proves Bounce-back precedes Elite).
3. 80 → `'Elite'`; 79 slope 0.1 → `'Ascending Star'`; 70 slope 0 → `'Peak Window'`; 70 slope NaN → `'Peak Window'`.
4. 55 age 25 → `'Developing'`; 55 age 26 slope 0.1 → `'Rising'`; 55 age null slope −0.1 → `'Solid Floor'`.
5. 40 slope 0 → `'Plateau'`; 40 slope −0.1 → `'Managed Decline'`; 40 slope NaN → `'Managed Decline'`; 20 → `'Sell Now'`; 19 → `'Fading'`.
6. depth 3: score 85 → `'Solid Floor'`; Breakout depth 4 → `'Solid Floor'`; score 45 slope 0 depth 3 → `'Plateau'` (below floor untouched); late-career 60 depth 3 → `'Veteran Producer'` (not in the capped set).

**`src/utils/teamContext.test.js` — `applyQBQualityModifier` describe**, new cases using a row
built like `makeWRRow` but with
`signals: { isLateCareer: false, isBreakout: false, isBounceBack: false, slopeRaw: -0.1, age: 28, depthOrder: 1 }`:
1. **Up-cross:** score 69, OQ 80, label `'Solid Floor'`, `{ KC: 100 }` → OQ 92, score 71 (`round(69 + 12×0.15) = round(70.8)`), label `'Peak Window'`.
2. **Down-cross:** score 70, OQ 80, label `'Peak Window'`, `{ KC: 0 }` → OQ 68, score 68 (`round(70 − 1.8)`), label `'Solid Floor'`.
3. **No cross:** score 60, OQ 60, label `'Solid Floor'`, `{ KC: 100 }` → score 61, label `'Solid Floor'`.
4. **Depth-3 cap holds across the cross:** case 1 inputs with `depthOrder: 3` → score 71, label `'Solid Floor'`.
5. **Late-career band:** `isLateCareer: true`, score 54, OQ 80, label `'Managed Decline'`, `{ KC: 100 }` → score 56, label `'Veteran Producer'`.
6. **Legacy row without inputs keeps its label:** existing `makeWRRow()` (signals `{}`) with `{ KC: 100 }` → score 71 and `label` equal to the input row's label (unchanged).
Each case also asserts the score equals the hand-computed value above (the arithmetic is unchanged; these pin it).
Existing cases #10–#12 etc. must pass unmodified.

**`src/utils/dynastyScore.test.js`:**
- The five golden-master `toMatchInlineSnapshot` results (tests at lines 58, 158, 252, 351, 449) gain
  exactly two keys in `signals`: `"age"` and `"slopeRaw"`. **Hand-edit** each inline snapshot to add
  those two lines in the snapshot's alphabetical key position with the actual values; do **not** run
  `vitest -u` (file header). No other snapshot line may change — in particular every `"score"`,
  `"label"` and component value stays identical; that is the score-invariance proof. Report the five
  `slopeRaw` values in the hand-back (if the one-season case prints `NaN`, keep it).
- New test **"label round-trips through pickDynastyLabel"**: for the results of the stable-vet and
  two-season fixtures (reuse their setup), assert
  `pickDynastyLabel({ score: r.score, isLateCareer: r.signals.isLateCareer, isBreakout: r.signals.isBreakout, isBounceBack: r.signals.isBounceBack, slope: r.signals.slopeRaw, age: r.signals.age, depthOrder: r.signals.depthOrder }) === r.label`.

## Touch list

- `src/utils/dynastyLabel.js` (new)
- `src/utils/dynastyLabel.test.js` (new)
- `src/utils/dynastyScore.js`
- `src/utils/dynastyScore.test.js`
- `src/utils/teamContext.js`
- `src/utils/teamContext.test.js`
- `docs/dynasty-scoring.md`
- `docs/nav/utils.md`
- `docs/architecture.md`
- The 10 view-only guard tests — add `'src/utils/dynastyLabel.js',` to each `PIPELINE` list on the
  line directly after `'src/utils/ageCurve.js',` (the comparable no-import leaf), no other change:
  `src/__tests__/advStatsViewOnly.test.js`, `teamContextViewOnly.test.js`, `scheduleViewOnly.test.js`,
  `gameLogsViewOnly.test.js`, `lineupViewOnly.test.js`, `opponentStrengthViewOnly.test.js`,
  `outlookPositionStatsViewOnly.test.js`, `weeklyDecisionViewOnly.test.js`,
  `inSeasonEvidenceViewOnly.test.js`, `currentSeasonTotalsIsolation.test.js`.

Nothing else. In particular not `App.jsx`, `projectionSnapshot.js`, `seasonProjection.js`,
`inSeasonConstants.js`.

## Confirmations (approved plan)

- **No `PRIOR_MODEL_FROM` bump.** No `projectedPPG`, `projectedGames` or rookie `projectedTotalPts`
  moves; labels are explicitly exempt from the bump rule (`docs/nav/utils.md`, `inSeasonConstants.js`
  row). `priorModelFrom.test.js` must pass unmodified.
- **`slopeRaw` and `age` do not reach the snapshot.** `projectionSnapshot.js` `compactDynastyScore`
  copies only `score`, `label`, `confidence` and each component's `value`/`weight`;
  `buildDynastyCapture` adds only `signals.qbQualityScore`/`qbModifierApplied`. `signals` is never
  spread into `players[id].dynasty`. Only the captured `label` value can differ, for band-crossers.

## Cross-repo

No registry entry covers the dynasty label (`docs/cross-repo-registry.md` has no dynasty row). The
data repo stores `players[id].dynasty` verbatim and describes it as the "final dynasty score at
capture" (data-catalog.md, schemaVersion 3) — a label consistent with the final score matches that
description; shape unchanged. The data repo's D-83 cross-check (`grading/anchor-policy.md:208`)
has already run (PASS, 2026-10-22 vs 2026-10-23 captures), so no coordination is needed. No backlog
line needed (no data-repo work). **Hand-back must state** the first capture date on which corrected
labels can appear (the first daily snapshot captured after this commit lands on `main`).

## Done-definition

Repo standard: `npm test` green, `npm run lint` 0 problems, `npm run build` clean. No
`factorsSchema`/`statKeysContract` impact (no `seasonProjection.js` or stat-key change). Smoke: open
Market, confirm dynasty labels render (no `undefined`/blank label) and the pop-up label matches its
score band for one WR. Commit; hand back SHA, files, deviations, and what each new test asserts.
**Do not push** — push waits for Anton's sign-off after implementation review.

## Status

Plan approved by Anton 2026-10-24 with both plan-reviewer flags folded in (guard-test PIPELINE
lists; §2b prior wording). Session 2 on sonnet; implementation-reviewer at full depth.

## Verification record

Session 2 commit `06d432a` (diff `f7ebfa8..06d432a`), reviewed by implementation-reviewer at full
depth. Score invariance, verbatim label rules, the presence gate and the snapshot isolation are all
clean. Three flags: two tests do not actually assert what they claim (items 1–2), and the smoke step
skipped the WR pop-up check (item 3). They are fixed below.

## Fix pass 1

Touch only `src/utils/teamContext.test.js` and `src/utils/dynastyScore.test.js`. No source, docs or
snapshot change. Leave every other test as it is.

**1. `teamContext.test.js` › `applyQBQualityModifier` › "legacy row without label inputs keeps its label".**
The test currently sets `label = 'Peak Window'`, which is also what `pickDynastyLabel` returns for
score 71 with undefined inputs, so it passes without the `'slopeRaw' in sig` gate. Replace its body with:
- `makeWRRow()` with its label set to `'Breakout'` (no `isBreakout` signal, so a re-pick cannot
  produce it), `{ KC: 100 }` → `score` 71 and `label` `'Breakout'`.
- A second, untouched `makeWRRow()` (label undefined), `{ KC: 100 }` → `score` 71 and
  `label` `toBeUndefined()`.
Both assertions must fail if the gate is removed: the result would be `'Peak Window'`.

**2. `dynastyScore.test.js` › "label round-trips through pickDynastyLabel".** Keep the two existing
round-trip `expect`s. In the same `it`, add checks that show the stored `slopeRaw`/`age` are the
values the label reads, by re-picking at overridden scores:
- Helper `labelAt(r, score, overrides = {})` = `pickDynastyLabel({ score, isLateCareer: r.signals.isLateCareer, isBreakout: r.signals.isBreakout, isBounceBack: r.signals.isBounceBack, slope: r.signals.slopeRaw, age: r.signals.age, depthOrder: r.signals.depthOrder, ...overrides })`.
- **Negative slope:** compute the "declining TD-reliant vet" result by copying that golden test's
  inputs verbatim (its snapshot shows `slopeRaw` −2.057…, `age` 26, flags false, `depthOrder` null).
  Assert `labelAt(declining, 72)` → `'Peak Window'`, `labelAt(declining, 56)` → `'Solid Floor'`,
  `labelAt(declining, 42)` → `'Managed Decline'`.
- **Zero slope:** the existing `stable` result (`slopeRaw` 0, `age` 26, `depthOrder` 1): `labelAt(stable, 42)` → `'Plateau'`.
- **Positive slope + age:** the existing `two` result (`slopeRaw` 2, `age` 23) with
  `{ isBreakout: false }`: `labelAt(two, 72, { isBreakout: false })` → `'Ascending Star'`,
  `labelAt(two, 56, { isBreakout: false })` → `'Developing'`.
If any expected label differs because a fixture's real signals differ from the values quoted here,
stop and report. Do not change the expectation.

**3. Smoke (done-definition step 6, missed).** Start the app from the `.claude/launch.json` preview
config. Open the player pop-up for one WR on Market and record the WR's name, dynasty score and
label, and whether the label is consistent with the score bands in `docs/dynasty-scoring.md`. Look at
the 403/404 console errors: list the failing URLs and say whether any involves dynasty or label
code. Stop the preview when done.

Done-definition: `npm test`, `npm run lint`, `npm run build`. Commit on `main` as a separate commit.
**Do not push.** Hand back the SHA, the diff, the smoke findings and the console-error list.

## Fix pass 1 — verification

Applied as `d5e74d7` (diff `06d432a..d5e74d7`, tests only). Re-reviewed once at light depth: no
blocking flags. One informational gap: the `labelAt` checks read only the sign of `slopeRaw`, so a
rounded value with the same sign would pass them. The five inline snapshots pin the exact unrounded
values (for example 2.057142857142857), which covers it. Smoke: Chris Olave 87 'Bounce-back' and
Jaxon Smith-Njigba 98 'Breakout' in the pop-up; Zay Flowers 89 and Puka Nacua 92 'Elite' in the
table; no 4xx responses or console errors. Awaiting Anton's sign-off; not pushed.
