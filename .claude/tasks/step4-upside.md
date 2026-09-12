# Step 4 up-side removal — RB/WR/TE (calibration arc, final item)

**Repo:** `sleeper-dashboard` (APP) only. Do not edit the data repo. **Scoring-affecting ⚑** — moves `projectedPPG` for veteran RB/WR/TE rows whose last qualifying season was below 0.85× their career average.
**Session 1:** 2026-09-12, planning only, against app `eafe9a4` (== `origin/main`) and data `8301e31` (verdict `grading/2026-09-06-fullpipeline-verdict.md`, snapshot `snapshots/2026-09-12.json`).
**Rookie path:** untouched. No rookie-path key, constant, or ordering changes.

---

## 0. Decision summary

| Question | Resolution |
|---|---|
| Q1 Ship at all? | **Ship.** Small, but the only veteran factor with a graded verdict, wrong in the direction it fires, replicated on two independently built panels, and it currently shows users an explanation line the data refutes. |
| Q2 QB | **Retain the up-side for QB, explicitly**, with a basis string — the `day3:QB` precedent. Removal is measured neutral-to-harmful at QB and the fired QB rows *beat* their projection. |
| Q3 Variant | **Plain removal at RB/WR/TE.** The injury-gated variant is refuted (worse than plain removal at all three). "Delete and rely on 5c" is the same code change as plain removal — 5c does not take over any of the up-side's population. |
| Q4 Cross-repo | CR-15 triggered (mirror must gain a position gate **and keep a legacy mode**); CR-01 note (two additive keys, no version bump); CR-18 row edit. **No committed fit depends on the regressionFactor distribution in shipped behaviour** — verified, §4.2. |
| Q5 Continuity | Fourth model-change date — the first **veteran-path** one. Owed to `grading/anchor-policy.md` as D-18. Two new `factors` keys make the boundary detectable from the row. |

---

## 1. Evidence

### 1.1 The verdict, read from `grading/2026-09-06-fullpipeline-verdict.md` §E

| Pos | n | shipped MAE | no-upside MAE | ΔMAE | ΔSpearman | dnp≥3 subset n | subset ΔMAE |
|---|---|---|---|---|---|---|---|
| QB | 300 | 3.849 | 3.858 | **+0.009** | −0.005 | 60 | +0.050 |
| RB | 588 | 3.362 | 3.343 | −0.019 | +0.002 | 103 | −0.037 |
| WR | 1039 | 2.870 | 2.837 | −0.033 | +0.004 | 163 | −0.021 |
| TE | 522 | 2.154 | 2.142 | −0.012 | −0.000 | 71 | −0.026 |

**Reading correction — the "injury-gated proxy" is not a variant.** `lib/panel.mjs:1836-1837` computes it as `summarize(rows.filter(injuryPredicate))`: the *same* plain removal, scored on the subset whose predictor-year `dnpWeeksLastQ >= 3` (`lib/panel.mjs:1583-1590`, `scripts/panel-run.mjs:1334-1336`). The subset columns say "removal helps even among possibly-injured rows at RB/WR/TE". They do not describe a gated model, and they cannot be compared against the overall column as an alternative.

### 1.2 Session 1 re-run with a player-clustered bootstrap

`lib/panel.mjs` does not persist rows (`backtests/2026-09-06-fullpipeline-panel.json` carries coverage only), so Session 1 re-assembled the panel read-only via `assemblePanel` + `predictFullPipeline` (script: Appendix A; data working tree unchanged). **It reproduces §E exactly** (QB 0.0091, RB −0.0190, WR −0.0326, TE −0.0122). Bootstrap: 4,000 resamples of players, so each player's rows are drawn together.

| Pos | fired rows (dnp≥3) | median actual/shipped: fired · not fired | **removeAll** ΔMAE [95% CI] · P(Δ<0) | keepIfDnp3 | remove 1.12 only | remove 1.05 only |
|---|---|---|---|---|---|---|
| QB | 32 (12) · 73 players | **1.081** · 0.868 | +0.0091 [−0.0054, +0.0250] · 0.10 | −0.0009 [−0.012, +0.010] | 0.0000 (branch never fires) | +0.0091 |
| RB | 142 (28) · 233 | 0.956 · 0.907 | −0.0190 [−0.0382, −0.0013] · 0.99 | −0.0126 [−0.031, +0.003] | −0.0129 | −0.0062 |
| WR | 230 (49) · 343 | 0.765 · 0.870 | −0.0326 [−0.0458, −0.0193] · 1.00 | −0.0293 [−0.042, −0.018] | −0.0188 | −0.0138 |
| TE | 119 (17) · 166 | 0.816 · 0.865 | −0.0122 [−0.0244, +0.0009] · 0.97 | −0.0087 [−0.020, +0.003] | +0.0003 | −0.0125 |

`keepIfDnp3` = a real injury-gated model: up-side kept where `dnpWeeksLastQ >= 3`, removed elsewhere.

### 1.3 Live effect — snapshot `2026-09-12` (estimate)

Of the 421 veteran rows, 170 have `regressionFactorRaw > 1`. Position comes from a join to `nfl/players-state/2026-09-12.json`. The estimate rescales captured `pipelinePPG` by `1/regressionFactor` and pushes it back through the comp blend (`computeCompBlend`'s weight does not depend on `pipelinePPG`). Reconstruction error against the captured `projectedPPG` is at most 0.09, p95 0.06.

| Pos | vets | up-side rows (1.12 · 1.05) | mean Δ projectedPPG | largest cut |
|---|---|---|---|---|
| QB | 58 | 11 (2 · 9) | **retained — 0** | — |
| RB | 97 | 34 (23 · 11) | −0.20 | −0.77 |
| WR | 161 | 73 (45 · 28) | −0.17 | −1.13 (`6794`, 13.6 → ≈12.5, overall rank 62 → 79) |
| TE | 105 | 52 (37 · 15) | −0.12 | −0.65 |

Global removal would change one player in the overall top 50. Its only top-10 mover is a QB (`4881`, 21.9 → 21.1, rank 6 → 9), which QB retention avoids. The review's "~25 % of veterans" understates the live footprint: the up-side fires on **40 %** of veteran rows.

### 1.4 Test coverage today

Session 1 deleted both up-side branches in a scratch copy of the app and ran the full suite: **1,701 tests / 98 files stay green.** No existing test pins Step 4's up-side at any threshold. The tests in §6 are the only guard this behaviour will have.

---

## 2. The five questions

### Q1 · Ship at all → **ship**

**Against:**
- Best case ΔMAE −0.033, roughly 1/30 of the rookie LOYO gain (3.788 → 2.716).
- TE's interval touches zero.
- A fourth grading boundary, plus a versioned data-side re-mirror (§4).
- Batching with factor pruning (review §4 item 6) means waiting on the D6 stop, i.e. known-wrong ranks until 2027 at least.

**For — and these carry it:**
1. **Direction is established, not marginal.** The reduced R3-FIT panel (review §2.3) and the full D6 reconstruction agree on direction at RB/WR/TE. At WR the interval excludes zero by a wide margin, and at RB it just excludes zero. A replicated sign on an unvalidated hand factor is the bar the programme has used to *remove* things.
2. **It fires where the pipeline is already most optimistic.** Fired WR rows realise 0.765× shipped against 0.870× for the rest, and TE 0.816× against 0.865×. The up-side adds optimism in the cells that are already the worst-calibrated — the §2.2 problem, made locally worse.
3. **The product shows the wrong reason.** `'Bounce-back from down year ↑'` (`seasonProjection.js:918`) tells a user a down year predicts a rebound. For RB/WR/TE the data says it predicts decline. Standing directive 1 — show data, not verdicts — cuts against keeping a verdict the data contradicts.
4. **Cheap and contained.** One branch and two capture keys. 159 live rows move by 0.1–0.2 PPG on average. Rank churn at the top of the board is negligible.
5. **Timing is close to free for the 2026 forward grade.** The 2026 season is already under way, so the preseason capture window closed under the old model whether this ships or not. The boundary adds a segmentation row; it does not split a clean preseason cohort.

A reasoned "do not ship" was considered and rejected on point 1. If Anton disagrees, the fallback deliverable is §3.6 (the docs correction alone) plus this file as the decision record.

### Q2 · QB → **retain the up-side for QB, explicitly, with a basis string**

- Removal at QB is +0.009, with P(removal helps) = 0.10. Both variants are neutral-to-worse.
- The fired QB rows realise **1.081×** shipped against 0.868× for non-fired QBs. QBs coming off a down year beat even the boosted projection. §2.3's reduced panel said the same (n = 20, "mildly positive").
- The QB 1.12 branch never fires on the panel. All of QB's measured effect is the 1.05 branch.

So the only evidence at QB points *toward* the up-side, weakly. Removing it would act against the evidence to buy uniformity. Global removal would also produce this slice's single most visible live change (a top-10 QB losing three ranks), which is exactly the move the data supports least.

**Why not per-branch-per-position tuning** (e.g. keep TE's neutral 1.12 branch)? The cells behind that split are 17–49 fired rows. Tuning at that grain is fitting noise. Branches are kept or removed together, per position.

**Mechanism:** a module-level `REGRESSION_UPSIDE_POSITIONS = new Set(['QB'])` plus a captured `regressionUpsideBasis` that records the cell *consulted*, not whether it moved the number — the same semantics as `rookieCalibrationBasis: 'day3:QB'`.

### Q3 · Variant → **plain removal; injury gate refuted; "rely on 5c" is the same code with a wrong rationale**

**Injury-gated variant — rejected on the data.** `keepIfDnp3` is worse than plain removal at every position where removal helps: RB −0.0126 vs −0.0190, WR −0.0293 vs −0.0326, TE −0.0087 vs −0.0122. The up-side hurts even on possibly-injured rows. Two caveats, stated rather than hidden:
- `dnpWeeks >= 3` on a qualifying (gp ≥ 8) season is a weaker injury signal than `classifyInjurySeason`.
- The fired ∩ dnp≥3 cells are small (28 / 49 / 17).

Neither caveat supplies evidence *for* a gate. Building one would add a mechanism without a measurement.

**"Delete Step 4 up-side, rely on Step 5c" (review §4 item 2) — tested, and it does not hold as stated:**
- **The two never co-fire.** `computeBounceBackFlag` (`projectionSignals.js:64-92`) requires `current.ppg >= priorMax`. That implies `lastPPG >= careerAvg`, so `outlierRatio >= 1` whenever `careerAvg >= 1`. Step 4's up-side needs `outlierRatio < 0.85`. The only overlap is `careerAvg < 1` (the `Math.max(careerAvg, 1)` floor), and there are zero live cases: 0 of 421 rows carry both `isBounceBack === true` and `regressionFactorRaw > 1`.
- **They act at opposite moments.** Step 4's up-side is a *prospective* bet, placed during the down year, that recovery is coming. 5c is a *retrospective* reward, applied after recovery has been observed. That prospective bet is what Step 4 added and 5c does not. It covered 40 % of live veterans, and 5c covers none of them. The verdict says the bet loses at RB/WR/TE and weakly wins at QB.
- **5c has never been graded.** It is held-omitted in R3-FIT (`scripts/panel-run.mjs:1062-1063,1217`) and absent from D6's 13-factor reconstruction. "Rely on 5c" therefore inherits no evidence.

So options 1 and 3 are the same diff: 5c is untouched and simply keeps doing what it did. The task records the corrected rationale in docs so a later reader does not read 5c as the up-side's replacement.

---

## 3. What changes

### 3.1 `src/utils/seasonProjection.js`

**a. New module-level constant**, beside the other module constants (not inside the function):

```js
// Step 4 up-side (outlierRatio < 0.85 → ×1.12 / ×1.05) is retained ONLY for these positions.
// RB/WR/TE removed per data grading/2026-09-06-fullpipeline-verdict.md §E + Session-1 clustered
// bootstrap (.claude/tasks/step4-upside.md §1.2): removal ΔMAE WR −0.033, RB −0.019, TE −0.012;
// QB +0.009 and fired QB rows realise 1.08× shipped. Changes only via a new graded verdict.
const REGRESSION_UPSIDE_POSITIONS = new Set(['QB'])
```

**b. Step 4 bucket block** (`:658-663`) becomes the following. The order of the down-side branches is preserved, and the dampener (`:665-673`) is unchanged:

```js
  let regressionFactorRaw
  let regressionUpsideBasis = 'none'
  if      (outlierRatio > 1.35) regressionFactorRaw = 0.88
  else if (outlierRatio > 1.15) regressionFactorRaw = 0.95
  else if (outlierRatio < 0.85) {
    if (REGRESSION_UPSIDE_POSITIONS.has(position)) {
      regressionFactorRaw   = outlierRatio < 0.65 ? 1.12 : 1.05
      regressionUpsideBasis = `retained:${position}`
    } else {
      regressionFactorRaw   = 1.00
      regressionUpsideBasis = `removed:${position}`
    }
  }
  else                          regressionFactorRaw = 1.00
```

`position` is already bound at `:557` (`const position = player.position`, directly after the `SKILL` gate at `:555`), so it is always one of QB/RB/WR/TE here. (`:312` is `rookieProjection()`'s own, separate binding — not this one.)

**c. `factors`** — two additive keys, placed directly after `regressionFactorRaw` (`:967`):

```js
      outlierRatio:          Math.round(outlierRatio * 1000) / 1000,
      regressionUpsideBasis,
```

- `outlierRatio` is always finite on the vet path (`lastPPG` has passed the finite filter; the denominator is floored at 1), so there is no null sentinel.
- `regressionUpsideBasis` ∈ `'none' | 'removed:RB' | 'removed:WR' | 'removed:TE' | 'retained:QB'`. **It is the authoritative firing signal.** `outlierRatio` at 3 dp can round across a threshold (0.8496 → 0.850), so it must not be used to classify the branch.

**d. `adjustmentSummary`** — **no code change.** `'Bounce-back from down year ↑'` (`:918`, gated on `regressionFactor > 1.05`) is now QB-only by construction. Add a one-line comment saying so. `'Steady producer — regression softened'` (`:939`, gated on `regressionFactorRaw !== 1.0`) correctly stops firing for removed rows. Add **no** new line for removed rows: nothing is applied, so there is nothing to explain.

**e. Not touched:** the rookie-path `factors` (`:479` `regressionFactor: 1.0` stays, and neither new key is added there); Step 5c; `computeConsistency`; line 888's composition; `projectionSignals.js`; `durabilitySignals.js`; `dynastyScore.js` (it has no outlier logic).

### 3.2 No other source file changes

`App.jsx`, the snapshot writer and every renderer are unchanged. `projectionSnapshot.js` never enumerates `factors` keys, and no consumer reads `regressionFactor*` (grep: only `seasonProjection.js`, tests, docs).

---

## 4. Cross-repo impact

### 4.1 CR-15 · R3-FIT factor-multiplier mirror — **triggered, not discharged (data-repo session owed: D-17)**

Triggered: `src/utils/seasonProjection.js` is among CR-15's app-side trigger modules, and this change alters the regression bucket table that `lib/projectionFactors.mjs:90-107` (`reconstructRegressionFactor`) reproduces, including the per-position gate the Mirror text explicitly makes part of the mirror.

> **Mirror (verbatim):** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs:110` only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the three app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces.

**What makes this unlike the rookie slices — the re-mirror must be versioned, not a deletion.** Three data-side consumers depend on the *legacy* table and break or silently change if the branches are simply deleted:
1. **Parity test T-F10** (`test/panel-fit.test.mjs` "parity gate") asserts `localRegressionFactorRaw(outlierRatio)` and `reconstructRegressionFactor(...)` exactly against `test/fixtures/r3fit-parity-2025/snapshot-2026-07-05.slim.json`. That fixture was captured under the legacy table and carries RB/WR/TE rows at `regressionFactorRaw` 1.05 / 1.12. A deleted branch turns it red.
2. **`runStep4Verdict`** (`lib/panel.mjs:1797-1839`): its "shipped" arm *is* the legacy table. Re-mirror without a legacy mode and §E degenerates to ΔMAE ≡ 0 at RB/WR/TE and can never be reproduced.
3. **R3-FIT reproducibility**: `backtests/2026-08-09-r3fit-{fit,panel}.json` were computed under legacy.

So `reconstructRegressionFactor` needs `position` and a model selector (e.g. `{ model: 'legacy' | 'step4-upside' }`). Parity against pre-boundary snapshots keeps `legacy`; the fit and full-pipeline paths default to the current app model. Note that the slim parity fixture carries `factors` only, with no position. A new-model parity check needs a post-boundary snapshot plus a position join, and `regressionUpsideBasis` supplies the position suffix directly.

### 4.2 Does any committed fit depend on the current regressionFactor distribution? — **verified: nothing shipped does**

- **R3-FIT:** `grading/2026-08-09-r3fit-verdict.md` — `regression` was a fit candidate at every position (flatOneRates QB 0.674, RB 0.364, WR 0.381, TE 0.344). **Every `Final verdict` line is UNSTABLE.** Nothing cleared.
- **App side:** `grep -rn "r3fit\|exponent" src/` returns nothing. `.claude/tasks/r3fit-activation.md`'s no-op clause applied: no `POSITION_FACTOR_EXPONENTS` table exists.
- **Committed analysis artifacts computed under the legacy distribution** — historical records, not dependencies, but a naive re-run will no longer reproduce them:
  - `backtests/2026-08-09-r3fit-fit.json`, `-panel.json`, `grading/2026-08-09-r3fit-verdict.md`
  - `backtests/2026-09-06-fullpipeline-panel.json`, `grading/2026-09-06-fullpipeline-verdict.md` (§D was never produced because of the stop; §E's shipped arm is legacy by construction)
- **The E-0a and rookie verdicts** do not involve `regression` (`grep -ln regression backtests/* grading/*` lists only the R3-FIT and full-pipeline files).
- **Latent obligation:** the Mirror's "re-fit before any further exponent activation" has no pending activation to block today. It binds the next `--fit` run, which must use the versioned mirror.

### 4.3 CR-01 · Projection snapshot envelope — **note, no version bump**

Triggered by the `factors` object shape in `seasonProjection.js`. There are two additive vet-path keys, and `schemaVersion` stays **3**. As in `rookie-ceiling.md` §6, the no-bump call is **this slice's own judgement** on the same reasoning as the registry's named keys, not a general rule the registry states. The substantive note: **`projectedPPG`/`projectedTotalPts` change for RB/WR/TE veteran rows from this commit forward**, and snapshots on either side are scored under different models (§5).

> **Mirror (verbatim):** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

Envelope shape after this change: unchanged at the top level. `players[pid].projection.factors` gains `outlierRatio` (number, 3 dp) and `regressionUpsideBasis` (string enum, §3.1c) on veteran-path rows only.

### 4.4 CR-18 · Signal registry rows — **triggered** (§7 item 4 edits `docs/signal-registry.md`)

> **Mirror (verbatim):** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

### 4.5 Not triggered

CR-02, CR-11, CR-13 and CR-17 also name `seasonProjection.js`. This change reads no new served field, stat key or KTC value: `position` and qualifying-season PPG were already read at the same sites.

### 4.6 Registry prose — deliberately not edited here

CR-15's app-side prose enumerates `seasonProjection.js` elements but does not name the Step 4 bucket table or its (new) position gate. The data repo holds a second copy (`cross-repo-registry.md`, guarded by `test/registry.test.mjs`). An app-only prose edit would open a known drift between the two copies. Recorded as part of D-17 for a parent-folder session, which is the sanctioned two-sided path. The trigger file itself (`seasonProjection.js`) is already listed, so no consumer is uncovered.

Plan review surfaced two more pre-existing registry staleness items (§10 flags 4–5). They follow the same route for the same reason: **Session 2 does not edit `docs/cross-repo-registry.md`.**

---

## 5. Continuity — the fourth model-change date (owed: D-18)

`grading/anchor-policy.md` is currently scoped to **rookie** mechanisms, and its section "Veteran-path rows are unaffected" becomes false at this boundary. This app session cannot write the file. The data-repo session that follows owes:

1. **Retitle/rescope:** "mechanism-version segmentation" covering both paths.
2. **Row-level detection rule (authoritative), veteran-path rows only.** First scope to rows with `projection.confidence !== 'rookie'` (the rookie path sets `confidence: 'rookie'` at `seasonProjection.js:474`, and the snapshot captures `confidence`). Rookie-path rows never carry `regressionUpsideBasis` on either side of the boundary, so a presence-only rule would put post-boundary rookie rows in the legacy segment. Within that scope: `factors.regressionUpsideBasis` present → captured under the step4-upside model; absent → legacy Step 4 table. For rows that fired, the suffix names the position and whether the up-side was retained or removed.
3. **Date table row 4:** `| <commit — step4-upside slice SHA> | <YYYY-MM-DD HH:MM UTC> | step4-upside (veteran path; RB/WR/TE up-side removed, QB retained) |`, and "Three model changes" → "Four".
4. **Expected segments:** the first capture carrying `regressionUpsideBasis` is the first 16:29 UTC capture at or after the commit time. Verify against committed snapshots rather than assert, the way the existing three rows were.
5. **Replace "Veteran-path rows are unaffected"** with: rookie boundaries 1–3 are rookie-path only; boundary 4 is veteran-path only, affects only rows whose basis starts `removed:`, and a pooled veteran grade spanning it measures the mechanism change.

---

## 6. Tests to add

Shared fixture design for §6.2–6.4 is a **two-season career with `careerAvg` exactly 20**, `step4Career(id, L)`:

```js
{ 2023: { [id]: makeSeasonEntry((40 - L) * 16, 16) }, 2024: { [id]: makeSeasonEntry(L * 16, 16) } }
```

It is run through `makeVet({ playerId, player: { position, age: 27, years_exp: 5 }, careerStats, currentSeason: 2025 }).asOptions()`. Why this shape:
- `outlierRatio = L / 20`, and every `L` below is exact in binary.
- Two qualifying seasons → `computeConsistency` returns null → `consistencyScale` 1.00 → **`regressionFactor === regressionFactorRaw`**, which isolates the bucket from the dampener.
- `isBounceBack` is false (prior season 16 GP, not short or injured).
- `isBreakout` is false (age 27).
- Unique ids per case (the comps cache is keyed by player id): write them **inline** in the test file, prefixed `'P_STEP4_'` (e.g. `'P_STEP4_WR_L12'`). That is the existing convention (`'P_BB_F2C_HIT'`, `seasonProjection.test.js:2779`). **Do not edit `src/__fixtures__/factories.js`.** Its header comment (`:24-25`) refers to a `P_*` constant list that does not exist, and correcting that is out of scope.

### 6.1 `src/__tests__/factorsSchema.test.js` (update — Factors-contract invariant)

- Add `'outlierRatio', 'regressionUpsideBasis'` to `VET_FACTORS_KEYS`, directly after `'regressionFactorRaw'`. **Do not** add them to `ROOKIE_FACTORS_KEYS`; add a NOTE line as the slice-1/2/3 NOTEs do.
- Counts **73 → 75**: the header history comment (`:18`, and append "step4-upside added outlierRatio/regressionUpsideBasis, vet-path only"), the `:45` comment (57 explicit → 59), and the test title at `:203`.
- In `'vet factors value types and enum constraints'`: `SHARED_OPTIONS` ppgs are 12, 13, 13.125, 13, 13 → careerAvg 12.825, last 13 → ratio 1.01365. Assert `f.outlierRatio === 1.014`, `f.regressionUpsideBasis === 'none'`, and `f.regressionUpsideBasis` matches `/^(none|removed:(RB|WR|TE)|retained:QB)$/`.
- The rookie both-directions test already proves the rookie path gains neither key. No rookie assertion changes.

### 6.2 `src/utils/seasonProjection.test.js` — second key-set copy (update)

`VET_FACTORS_KEYS` at `:55` ("mirrors factorsSchema.test.js") gets the same two keys in the same position, plus any count in its comments. Both copies drifting is the known hazard.

### 6.3 `src/utils/seasonProjection.test.js` — new `describe('Step 4 — regression up-side (step4-upside)')`, after the Step 5c block

**A. Threshold regression table.** An `it.each` over `L × position`, asserting `factors.outlierRatio`, `factors.regressionFactorRaw`, `factors.regressionFactor` and `factors.regressionUpsideBasis`. Both sides of **both** thresholds, plus the unchanged down-side:

| L | outlierRatio (3dp) | RB / WR / TE → raw · rf · basis | QB → raw · rf · basis |
|---|---|---|---|
| 12 | 0.6 | 1 · 1 · `removed:<POS>` | 1.12 · 1.12 · `retained:QB` |
| 12.96875 | 0.648 | 1 · 1 · `removed:<POS>` | 1.12 · 1.12 · `retained:QB` |
| 13 | 0.65 | 1 · 1 · `removed:<POS>` | **1.05** · 1.05 · `retained:QB` (at the threshold, not `< 0.65`) |
| 13.03125 | 0.652 | 1 · 1 · `removed:<POS>` | 1.05 · 1.05 · `retained:QB` |
| 16 | 0.8 | 1 · 1 · `removed:<POS>` | 1.05 · 1.05 · `retained:QB` |
| 16.96875 | 0.848 | 1 · 1 · `removed:<POS>` | 1.05 · 1.05 · `retained:QB` |
| 17 | 0.85 | 1 · 1 · `none` | 1 · 1 · `none` (at the threshold, not `< 0.85`) |
| 17.03125 | 0.852 | 1 · 1 · `none` | 1 · 1 · `none` |
| 23 | 1.15 | 1 · 1 · `none` | 1 · 1 · `none` |
| 24 | 1.2 | 0.95 · 0.95 · `none` | 0.95 · 0.95 · `none` |
| 27 | 1.35 | 0.95 · 0.95 · `none` | 0.95 · 0.95 · `none` |
| 28 | 1.4 | 0.88 · 0.88 · `none` | 0.88 · 0.88 · `none` |

The down-side rows pin that the change did not reach the other branches. The four `x.xxx875`/`x.xx125` rows pin the strict `<` at 3 dp either side. Assert `outlierRatio` with `toBe` on the 3dp value.

**B. Adjustment summary.**
- RB, WR and TE at L = 12: `adjustmentSummary` does **not** contain `'Bounce-back from down year ↑'`. Pre-change it did, since rf 1.12 > 1.05; this is the user-visible regression.
- QB at L = 12: contains it.
- QB at L = 13 and L = 16 (rf 1.05): does **not** contain it — the strict `> 1.05` gate is unchanged.

**C. Consistency dampener — steady band, ≥ 3 seasons.**
- **Down-year career** `[22, 22, 22, 22, 16]` PPG (fp = ppg × 16, gp 16; seasons 2020–2024): careerAvg 20.8, ratio 16/20.8 = 0.769, consistencyBand `'steady'`.
  - WR: raw 1, rf 1, basis `removed:WR`, `consistencyBand === 'steady'`, and `adjustmentSummary` does **not** contain `'Steady producer — regression softened'`.
  - QB, same career: raw 1.05, **rf 1.025**, basis `retained:QB`, and summary contains `'Steady producer — regression softened'`.
- **Up-year career** `[18, 18, 18, 18, 24]`: ratio 1.25, steady. For WR and QB alike: raw 0.95, rf 0.975, basis `none`, and the steady line present. This pins the dampener still acting on the down-side.
- Before asserting, Session 2 confirms `consistencyBand === 'steady'` on both fixtures. If it is not, stop and report rather than retuning the fixture silently.

**D. Edge cases.**
- **Career-average floor:** L = 0.25 with the prior season at 0.75 (fp 12 and 4, gp 16). careerAvg 0.5 → denominator floored to 1 → ratio 0.25. RB: raw 1, basis `removed:RB`, `outlierRatio === 0.25`. QB: raw 1.12, basis `retained:QB`.
- **Single qualifying season:** years_exp 2, one season at 12 PPG. `outlierRatio === 1`, basis `none`, raw 1.
- **Every position emits a basis string:** for each of QB/RB/WR/TE at L = 18, `typeof factors.regressionUpsideBasis === 'string'`.

**E. Step 5c unaffected.** Re-run the existing `'F2-C integration: injury-gap WR fires the ×1.05 bounceBackFactor'` fixture and additionally assert `factors.regressionUpsideBasis === 'none'`. That career's last season is the recovery, so the ratio is > 1. This pins the structural non-overlap from Q3 in a test.

### 6.4 Expected-green checks Session 2 must report

- Full suite green. Session 1 verified that no pre-existing assertion pins the up-side (§1.4), so **the only pre-existing tests that should need edits are the two key-set copies (§6.1, §6.2).** If anything else goes red, stop and report — it means this plan missed a dependency.
- `statKeysContract.test.js` is unaffected (no new stat key).

---

## 7. Docs/README updates

1. **`docs/projection.md` Step 4 row (`:20`) — this is also an honesty correction.** The current row omits the ×0.95 and ×1.05 middle buckets. Replace it with:
   `| 4 | **Regression** | outlierRatio = lastPPG ÷ max(career avg over all qualifying seasons, 1). Down-side, all positions: > 1.35 → ×0.88, > 1.15 → ×0.95. Up-side (< 0.85), **QB only**: < 0.65 → ×1.12, < 0.85 → ×1.05; **RB/WR/TE → ×1.00 since <ship date>** (see *Step 4 up-side* below). Deviation from 1.0 dampened by consistency (steady ×0.50, moderate ×0.80, erratic ×1.00; < 3 qualifying seasons → ×1.00). Captured: `outlierRatio` (3 dp), `regressionUpsideBasis` |`
2. **`docs/projection.md` — new subsection `### Step 4 up-side (RB/WR/TE removed, QB retained)`**, after the veteran step table and its combine paragraph. It must state:
   - the verdict table (§1.1) and the bootstrap's removeAll CIs (§1.2);
   - that the "injury-gated proxy" column is a subset score, not a variant, and that a true dnp-gated variant was worse at RB/WR/TE;
   - why QB is retained (fired QBs realise 1.08×; removal +0.009);
   - **the 5c relationship**: the two are structurally mutually exclusive (except `careerAvg < 1`), 5c is not the up-side's replacement, and 5c has never been graded;
   - how to read `factors`: `regressionUpsideBasis` is authoritative and `outlierRatio` can round across a threshold. Both keys exist on veteran-path rows only (`confidence !== 'rookie'`), so their absence on a rookie row says nothing about the model version;
   - that snapshots before `<ship date>` carry the legacy table, with no `schemaVersion` change — the same wording pattern as the 5c row's 2026-06-12 note.
3. **`docs/projection.md` *Adjustment summary* paragraph (`:287`):** append that `'Bounce-back from down year ↑'` can fire only for QBs since `<ship date>`.
4. **`docs/signal-registry.md:85`** — Regression row keys become `regressionFactor[Raw]`, `outlierRatio`, `regressionUpsideBasis`, `consistencyScore/Band/Scale`; source `seasonProjection.js` Step 4 + `regressionSignals.js`; coverage 2012+; Reconstructable; current use `active→projectedPPG (up-side QB-only since <ship date>; consistency CV shared with dynasty)`. (CR-18.)
5. **`CLAUDE.md` Factors-contract invariant:** "73 vet keys / 59 rookie keys" → "75 vet keys / 59 rookie keys". This is a byte-neutral edit; the file is at 23,160 of 25,000 bytes.
6. **`.claude/tasks/data-repo-backlog.md`** — two entries, in a **second commit** that names the first commit's SHA (the `41f277e`/`871f82b` precedent):
   - **D-17 · CR-15: version the Step 4 regression mirror** · Found: `<slice SHA>` · Blocking: no, but blocks any further `--fit`/`--fullpipeline` run that claims to reproduce the app. Content: §4.1's three consumers, the `position` + model-selector signature, keeping T-F10 on `legacy`, and adding the clustered bootstrap (Appendix A) to `runStep4Verdict`'s output so §1.2's intervals are committed data-side rather than living only in this file. It also carries the both-copies registry corrections from §4.6 and §10 flags 4–5: the CR-15 prose, CR-01's unlisted consumers, and the stale `seasonProjection.js` anchors in CR-02/CR-13/CR-17. Every anchor is to be recomputed against the landed commit.
   - **D-18 · `grading/anchor-policy.md`: fourth model-change date (first veteran-path boundary)** · Found: `<slice SHA>` · Blocking: no — forward grading is calendar-blocked to Jan–Feb 2027 — but writing the policy with three dates after this lands is the D-15 failure mode. Content: §5 items 1–5 verbatim, with `<slice SHA>` and its UTC commit time filled in.
7. **Not changed:** `README.md` (no Step 4 prose — grep clean); `docs/nav/utils.md` (no new export); `docs/dynasty-scoring.md` (no outlier logic there).

---

## 8. Smoke (user-visible: Proj values and the Profile adjustment list)

Against a fresh build with a cleared cache (the §9.4 lesson), open the player detail pop-up for the players below. Adjustment chips render via the generic `.map` at `src/components/dp/PlayerDetailModal.jsx:580`, and Proj at `:275`.
- **`6794` (WR):** expect Proj ≈ 12.5 (±0.2; was 13.6 on 2026-09-12) and no "Bounce-back from down year" line.
- **`3976` (QB, raw 1.12):** expect Proj unchanged at 6.9 (±0.1) and the line still present.

In DevTools, count `seasonProjections` rows whose `factors.regressionUpsideBasis` starts `removed:`. Expect ≈ 159 (RB 34 · WR 73 · TE 52) and `retained:QB` ≈ 11; these vary slightly with roster churn. Report what was seen. A mismatch beyond churn is a stop-and-report.

## 9. Done-definition

CLAUDE.md done-definition items 1–11, with these specifics:
- `factorsSchema.test.js` and `seasonProjection.test.js` both run.
- `npm test`, `npm run lint` and `npm run build` are clean.
- Smoke per §8.
- Commit 1 = code + tests + docs (§3, §6, §7 items 1–5). Commit 2 = backlog D-17/D-18 naming commit 1.
- Push only after verification is clean, and confirm `origin/main` contains both SHAs (the §8.3 process lesson).

**Hand-back must report:**
- both SHAs;
- every file touched;
- every deviation from this file;
- what each new test asserts;
- the smoke observations;
- the `grep -rn "PROVISIONAL(" src/` output (expected unchanged — this slice adds no tag).

---

## 10. Review pass — plan-reviewer flags and dispositions (2026-09-13)

Each of the five flags was verified against live source before disposition.

| # | Flag | Verified | Disposition |
|---|---|---|---|
| 1 | mechanical — `position` anchor `:312` | Correct. `:312` is inside `rookieProjection()`; the vet binding is `:557`, after the `SKILL` gate at `:555` | **Fixed** in §3.1b. The conclusion (always QB/RB/WR/TE) is unchanged |
| 2 | mechanical — no `P_*` list in `factories.js` | Correct. Only the defaults `'P_VET_DEF'` (`:243`) and `'P_ROO_DEF'` (`:286`) exist; the header comment at `:24-25` describes a list that isn't there | **Fixed** in §6: inline `'P_STEP4_*'` ids, `factories.js` untouched |
| 3 | edge-case — the detection rule misfiles rookie rows | Correct. Rookie `factors` never carry the key; `confidence: 'rookie'` is set at `:474` and captured in snapshots | **Fixed** in §5 item 2 (scoped to `confidence !== 'rookie'`) and §7 item 2, so D-18 inherits the scoped rule |
| 4 | registry-stale — CR-01 unlisted consumers | Correct: `PlayerDetailModal.jsx:119-120, :147-152, :275, :299, :580`; `MyTeamView.jsx:19`; `App.jsx:602-604`; `usePlayerProfile.js:151` | **Deferred to D-17.** Render site `:580` added to §8 smoke |
| 5 | registry-stale — CR-02/13/17 anchors | Correct: `rec_air_yd` reads now `:734`/`:742`, `resolveAttributedTeam` `:777`, `computeKtcSignals` `:596` | **Deferred to D-17** |

**Why 4–5 are deferred:**
1. **Both pre-date this slice** and don't affect its correctness. No consumer reads the removed summary string, which reaches the UI only via the unchanged generic map at `:580`.
2. **This slice shifts the anchors again**, so corrections belong after the commit lands.
3. **The registry has two copies kept identical.** An app-only edit opens drift; a parent-folder session edits both (D-17).

The reviewer's MIRROR block matches §4.1, §4.3 and §4.4 verbatim. No change was needed.

---

## Appendix A — Session 1 bootstrap (provenance for §1.2; run from any cwd, read-only against the data repo)

```js
// node step4boot.mjs "<abs path to sleeper-dashboard-data>"
const D = process.argv[2];
const run = await import(D + '/scripts/panel-run.mjs'), lib = await import(D + '/lib/panel.mjs');
const panel = run.assemblePanel({ fromYear: lib.PANEL_DEFAULTS.fromYear, toYear: lib.PANEL_DEFAULTS.toYear,
  attribution: 'per-season-team', basis: 'half_ppr', withFactorMultipliers: true, historyFloor: 2012 });
const ratioOf = r => { const q = r.qualifyingSeasons ?? []; if (!q.length) return null;
  const m = q.reduce((a, s) => a + s.ppg, 0) / q.length; return q[q.length - 1].ppg / Math.max(m, 1); };
const pred = (r, reg) => lib.predictFullPipeline(reg == null ? r : { ...r, multipliers: { ...r.multipliers, regression: reg } }, {}).predicted;
const fires = r => { const x = ratioOf(r); return x != null && x < 0.85 && r.multipliers?.regression != null; };
const V = { removeAll: r => fires(r) ? 1 : null, keepIfDnp3: r => fires(r) && (r.dnpWeeksLastQ ?? 0) < 3 ? 1 : null,
  remove112only: r => fires(r) && ratioOf(r) < 0.65 ? 1 : null, remove105only: r => fires(r) && ratioOf(r) >= 0.65 ? 1 : null };
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  const rows = panel.rows.filter(r => r.position === pos).map(r => ({ r, pid: r.sleeperId, a: r.outcomePPG, s: pred(r, null) }))
    .filter(o => Number.isFinite(o.s) && Number.isFinite(o.a));
  for (const [name, f] of Object.entries(V)) {
    const d = rows.map(o => { const g = f(o.r); const v = g == null ? o.s : pred(o.r, g); return { pid: o.pid, diff: Math.abs(v - o.a) - Math.abs(o.s - o.a) }; });
    const byP = new Map(); for (const x of d) { const e = byP.get(x.pid) ?? { sum: 0, n: 0 }; e.sum += x.diff; e.n++; byP.set(x.pid, e); }
    const cl = [...byP.values()], bs = [];
    for (let b = 0; b < 4000; b++) { let s = 0, n = 0; for (let i = 0; i < cl.length; i++) { const c = cl[Math.floor(rnd() * cl.length)]; s += c.sum; n += c.n; } bs.push(s / n); }
    bs.sort((x, y) => x - y);
    console.log(pos, name, (d.reduce((a, x) => a + x.diff, 0) / d.length).toFixed(4), bs[100].toFixed(4), bs[3899].toFixed(4), (bs.filter(x => x < 0).length / 4000).toFixed(3));
  }
}
```
