# R3-FIT activation — ship fitted per-position factor exponents into seasonProjection.js

**Repo:** `sleeper-dashboard` (APP). One session, this repo only — do not edit the data repo. This is the authorized activation of the exponents the data-repo fit produced; it is scoring-affecting ⚑ and ships **only** the positions that CLEARS the committed grading verdict.
**Type:** Session-1 implementation plan (planning only — no source edited this session). New scoring / projection algorithm change → opus-planned, sonnet-implemented (app `CLAUDE.md` model-routing).

**Resolved HEADs (verified via GitHub MCP `get_commit main` = local `origin/main` = local HEAD, trees clean):**
- **App** `sleeper-dashboard`: `6a52dc9590e0751b31717d95601651891a15c796` ("fix: scope inProgress bypass to the ktcHist read path")
- **Data** `sleeper-dashboard-data`: `79fa9d38934fcea0c1a29b4b778b7aec60cd2df7` ("nflverse: oline 2026-07-22")

Re-verify the app SHA before editing and re-anchor every line number below (the app repo has had multiple pushes today).

**BLOCKING AUTHORIZATION (this session cannot start until it exists):** the committed **`grading/<date>-r3fit-verdict.md`** in the data repo (produced by `r3fit-exponent-harness.md`). This session **transcribes** the CLEARS positions' fitted exponent vectors from that verdict — it does not invent numbers. Cite the verdict's file SHA + commit (read via GitHub MCP) in the implementation summary, exactly as `r2-flip-activation.md` cited `grading/2026-07-09-r2flip-verdict.md`.
**If the verdict CLEARS zero positions → this activation is a no-op: do NOT implement it. Report "R3-FIT verdict cleared no positions; exponents remain hand-tuned (w=1); nothing to ship."** (The self-protecting gate working as intended.)

**Substrate (read, do not re-derive):** data `grading/<date>-r3fit-verdict.md` (the exponents + which positions CLEARS + the caveats); data `.claude/tasks/r3fit-exponent-harness.md` §8 (activation handoff) + §11 (cross-repo); app `.claude/tasks/projection-model-assessment.md` §B.1(2)/§F.5; app `docs/projection.md` (the factor stack). App `CLAUDE.md` factors-contract invariant auto-loaded.

---

## 1. Decision summary

| What | Decision | Why |
|---|---|---|
| Which factors get exponents | Only the fittable set the fit shipped: RB/WR/TE `{shareTrend, regression, momentum, trajectory, snapShare, rzUsage, teamRzShare}`; QB `{momentum, regression, trajectory}` | The fit's scope (harness §2); held factors (age/depth/team/qbQuality/efficiency/bounceBack/tdReliance/comp) keep exponent 1 |
| Which positions | **Only CLEARS positions** (per the verdict); NO-GAIN/DEGRADES/UNSTABLE positions get all-1.0 exponents (byte-identical to today) | Ship only what beat hand-tuned out-of-sample (assessment §B.1; roadmap R3-FIT "ship only positions that clear") |
| How applied | Fold `fᵢ → fᵢ^{wᵢ}` into each factor's value at its computation point (vet path); the product, the adjustment narrative, and the stored `factors.<name>` all then carry `fᵢ^{wᵢ}` | Assessment: "each factor still displays as one multiplier `fᵢ^{wᵢ}`"; **no new `factors` key** → values-only change, mirrors the R2 flip's clean cross-repo path |
| Where the exponents live | Per-position constant table in `seasonProjection.js` (git-versioned, documented), NOT a runtime-loaded data file | Avoids a new served-file cross-repo contract; matches how the hand-tuned bucket tables already live |
| Persist exponents per-player? | **No** | Would add `factors` keys → schemaVersion bump + data-grader mirror (§6). Deferred; not needed to ship |

**Provisional by construction:** the gate is retrospective + age-blind + reduced-pipeline (harness §5; roadmap D-1). Snapshots from the activation date forward carry exponent-weighted factors; the activation is subject to R4 forward-grading re-validation (assessment E-3c). State this in the commit + docs.

---

## 2. Mechanism — the exponent fold

**Constant table** (module-level, near `ROOKIE_BASELINE_PPG` line 23):

```js
// Fitted per-position factor exponents (R3-FIT). Transcribed from the committed data-repo
// verdict grading/<date>-r3fit-verdict.md (fill the placeholders below with the actual wFinal
// vectors of the CLEARS positions; leave a position ABSENT — or all-1.0 — when it did NOT clear).
// fᵢ^1 === fᵢ, so an absent position/factor is byte-identical to pre-activation behavior.
// Provisional (retrospective, age-blind, reduced-pipeline gate — see docs/projection.md). Do not
// hand-tune these; they change only via a re-run + re-committed verdict.
const POSITION_FACTOR_EXPONENTS = {
  // e.g. if WR cleared:  WR: { shareTrend: 0.9, regression: 1.0, momentum: 1.1, trajectory: 1.0,
  //                            snapShare: 1.2, rzUsage: 0.8, teamRzShare: 1.3 },
}
function factorExponent(position, name) {
  return POSITION_FACTOR_EXPONENTS[position]?.[name] ?? 1
}
function applyExponent(factor, position, name) {
  const w = factorExponent(position, name)
  return w === 1 ? factor : Math.pow(factor, w)
}
```

**Apply at each fittable factor's computation point (vet path only; rookie path unchanged).** Reassigning the variable makes the product (rawPPG/combinedNewFactorRaw), the `adjustmentSummary` thresholds, and the stored `factors.<name>` all use the exponentiated value automatically:

| Factor | Var | Apply right after | Note |
|---|---|---|---|
| shareTrend | `shareTrendMultiplier` | line 361 (after team-change neutralization) | `1.0^w=1.0` → team-changers unaffected |
| regression | `regressionFactor` | line 384 | top-level product factor (line 599) |
| momentum | `momentumFactor` | line 394 | enters `combinedNewFactorRaw` (595) |
| trajectory | `trajectoryFactor` | line 465 | enters `combinedNewFactorRaw` |
| snapShare | `snapShareFactor` | line 479 | RB/WR/TE (QB gated → factor already 1.0; `1^w=1`) |
| rzUsage | `rzUsageFactor` | line 479 | " |
| teamRzShare | `teamRzShareFactor` | line 497 (after neutralization) | `1.0^w=1.0` → team-changers unaffected |

`efficiencyFactor` (468), `bounceBackFactor`/`tdRelianceFactor` (413-415), `ageDelta`, `depthFactor`, `teamFactor`, `qbQualityFactor` — **not wrapped** (held at exponent 1 in v1; harness §2). Do not touch them.

`combinedNewFactorRaw` (594-598) and `combinedNewFactor = clamp(…, 0.67, 1.50)` (598) recompute from the exponentiated sub-factors automatically; the clamp still guards (assert it still holds — §4). `rawPPG` (599-601) uses the exponentiated `shareTrendMultiplier`/`regressionFactor`. `projectedPPG` (comp-blended) moves accordingly.

**Position note:** `position` is in scope (line 268). QB rows only wrap momentum/regression/trajectory; the usage factors are already 1.0 for QB (gated), so wrapping them is harmless but unnecessary — the table simply has no QB entries for them.

---

## 3. Edits — grouped by file

### 3a. `src/utils/seasonProjection.js` (the only source file)
1. Add `POSITION_FACTOR_EXPONENTS` + `factorExponent` + `applyExponent` near line 23 (§2).
2. Seven one-line reassignments at the anchors in §2's table, e.g. after line 361: `shareTrendMultiplier = applyExponent(shareTrendMultiplier, position, 'shareTrend')`. Each factor binding is currently `const` — change the affected bindings to `let` (verify none is referenced before the reassignment in a way that assumes the raw value; `shareTrendMultiplier`, `regressionFactor`, `momentumFactor`, `trajectoryFactor`, `snapShareFactor`, `rzUsageFactor`, `teamRzShareFactor` are each read only downstream of their computation).
3. **No `factors` return-object key change** (lines 668-736) — the same 73 keys, exponentiated values. **No rookie-path change** (lines 75-240).

### 3b. No other source files change
`dynastyScore.js`, `teamContext.js`, `teamRzShare.js`, `usageMetrics.js`, `efficiencyMetrics.js`: zero edits — the fold is entirely inside `seasonProjection.js`. `factorsSchema.test.js` must pass with **zero key edits** (values move, keys don't). `statKeysContract.test.js`: zero edits (no stat-key change).

---

## 4. Tests

App uses Vitest (`npm test`). Add/adjust:

### 4a. NEW — `src/__tests__/factorExponents.test.js`
1. **Exponent application:** for a CLEARS position in the shipped table, hand-construct a vet fixture (reuse `factorsSchema.test.js` `SHARED_OPTIONS` scaffolding) and assert `factors.<name> === Math.pow(rawFactor, w)` for each wrapped factor, and that `projectedPPG` differs from the same fixture run through a table with all-1.0 exponents. **Prove the fold is load-bearing.**
2. **No-op for non-CLEARS position:** a position absent from the table (or all-1.0) produces byte-identical `factors` + `projectedPPG` to a hand-computed exponent-1 run (guards the "absent === unchanged" invariant).
3. **Team-change safety:** `isTeamChange === true` → `shareTrendMultiplier`/`teamRzShareFactor` forced to 1.0 → `1.0^w === 1.0` → exponent is inert on team-changers (assert both).
4. **Clamp still holds:** `combinedNewFactor ∈ [0.67, 1.50]` after exponentiation on an extreme fixture.
5. **Table-matches-verdict guard:** a value assertion that `POSITION_FACTOR_EXPONENTS` contains exactly the CLEARS positions/vectors from the committed verdict (transcription guard; cite the verdict date in a comment). Relax only via a new verdict.

### 4b. `src/utils/seasonProjection.test.js` — update value assertions
Any existing test asserting a specific factor value or `projectedPPG` for a **CLEARS** position updates to the exponentiated expectation (assert the correct new value — never edit-to-green). Tests on non-CLEARS positions and the rookie path: zero edits.

### 4c. Contract tests — zero edits expected
`factorsSchema.test.js` (73/51 keys unchanged; value-type/range assertions survive exponentiation — type stays number, positivity preserved, clamp holds) and `statKeysContract.test.js` must pass untouched. If either fails, STOP — it means a key or stat-key changed unexpectedly.

### 4d. Done-definition (app `CLAUDE.md`)
`npm test` green; run `factorsSchema.test.js` + `statKeysContract.test.js` (touched-area contract tests); `npm run lint` 0 problems; `npm run build` clean. Do NOT start the dev server — visual verification is the user's job.

---

## 5. Docs updates (app; before → after where precise)

### 5.1 `docs/projection.md`
- **Step-5 combine note (line 34)** — append: "Since R3-FIT (activated `<date>`), each factor `fᵢ` in the CLEARS positions is raised to a fitted per-position exponent `wᵢ` (`fᵢ^{wᵢ}`) before entering the product; hand-tuned positions/factors keep `wᵢ=1`. The exponents live in `POSITION_FACTOR_EXPONENTS` (`seasonProjection.js`), transcribed from the committed data-repo verdict `grading/<date>-r3fit-verdict.md`. The `[0.67, 1.50]` rail still guards the exponentiated product."
- **New subsection "Fitted factor exponents (R3-FIT)"** after the combine note: the model form (`basePPG × Π fᵢ^{wᵢ}`), which positions/factors ship exponents (from the verdict), the held factors, and the **provisional** caveat (retrospective + age-blind + reduced-pipeline gate; R4 forward re-validation — roadmap D-1). State that snapshots from `<date>` forward carry exponent-weighted factors; pre/post cohorts are distinguishable by snapshot date (same convention as the 2026-06-12 bounce-back correction and the R2 flip).

### 5.2 `docs/signal-registry.md`
For each **CLEARS** position's fitted factor (rows 80/81/82/83/90/91/92), append to the Current-use cell: "exponent-weighted since R3-FIT (`<date>`, positions: …) — see docs/projection.md 'Fitted factor exponents'". Non-CLEARS factors: no change.

### 5.3 `CLAUDE.md` (app)
- **§src/utils table, `seasonProjection.js` row** — append: "; fittable factors carry per-position fitted exponents (`POSITION_FACTOR_EXPONENTS`, R3-FIT `<date>`) for CLEARS positions — values-only, no `factors` key change".
- **Invariants → Factors contract** — append a sentence: "R3-FIT exponents change factor *values* (`fᵢ→fᵢ^{wᵢ}`) not keys; the 73/51 contract is unchanged."

### 5.4 `README.md`
Re-grep `projection\|exponent\|factor`; the README projection blurb likely needs no change (it doesn't enumerate factor magnitudes). Confirm no-change or add one sentence pointing at docs/projection.md.

---

## 6. Cross-repo impact (output only — do NOT edit the data repo in this slice)

**Contracts: no shape change** — exactly the R2-flip precedent (`r2-flip-activation.md` §7). No `factors` key added/renamed/removed → **no snapshot `schemaVersion` bump, nothing for `register-snapshots.mjs`, and the data grader's `NUMERIC_FACTOR_KEYS` (`lib/grade.mjs:31-58`) needs no addition.** What changes is the **values** of existing persisted factor keys (the exponentiated multipliers + the moved `combinedNewFactor`/`combinedNewFactorRaw`/`pipelinePPG`/`projectedPPG`).

State these annotations in the task summary (for the eventual data-repo doc session to carry), effective-dated to the activation commit:
1. **Silent-scoring-change surface:** the persisted `factors` values now mean `fᵢ^{wᵢ}`. The data grader's `factorDiagnostics` (`lib/grade.mjs`) will correlate the **exponentiated** factor values from `<date>`-forward snapshots — a documented diagnostic shift, **not** a scoring break (the grader scores `projectedPPG`, not factor values). A factor shipped with `w=0` stores a constant `1.0` → the grader's `pearson` returns null (`zero variance` — `lib/grade.mjs:257`), which is the honest "dead factor" signal.
2. **Data `CLAUDE.md` cross-repo contracts — snapshot-shape row, append:** "Since R3-FIT (`<date>`), CLEARS-position `factors` values are exponent-weighted (`fᵢ^{wᵢ}`); keys/shape unchanged. `NUMERIC_FACTOR_KEYS` correlations from `<date>`-forward snapshots describe exponentiated factors — a diagnostic shift, not a scoring change."
3. **Snapshot cohort convention:** the commit message records the activation date. Suggested subject: `feat: activate R3-FIT fitted exponents (positions: …; date YYYY-MM-DD; provisional pre-R4)`.

---

## 7. Step sequence for the implementer

1. Read the committed `grading/<date>-r3fit-verdict.md` (data repo, via GitHub MCP — cite SHA). If **zero positions CLEARS → STOP, report the no-op** (§header). Else transcribe the CLEARS positions' `wFinal` vectors.
2. `seasonProjection.js`: `POSITION_FACTOR_EXPONENTS` + helpers + the 7 factor reassignments (§3a). Fill the table from the verdict only.
3. Tests §4a (incl. the table-matches-verdict guard) + §4b value updates. Confirm §4c contracts pass untouched.
4. Docs §5. `npm test` / `npm run lint` / `npm run build` all clean. No dev server.
5. Task summary: the CLEARS positions + shipped exponent vectors (+ the verdict SHA it transcribed); the §6 cross-repo annotations verbatim for the data session; the provisional/age-blind/reduced-pipeline caveat + R4 re-validation; that NO-GAIN/DEGRADES/UNSTABLE positions stayed hand-tuned.

**Out of scope, do not do:** inventing/hand-tuning any exponent (only transcribe from the committed verdict); fitting anything (that is the data repo); wrapping held factors (efficiency/age/depth/team/qbQuality/bounceBack/tdReliance/comp); activating `airYardsShare` (R3-EFFACT, gated on R1-AGE) or `shareLevel` (graded-and-parked); persisting exponents as new `factors` keys; any data-repo edit; touching the rookie path.
