# Rookie-path calibration (calibration arc, slice 1)

**Opened:** 2026-09-07, after the D1–D6 batch sign-off (`analysis/ranking-and-projection-review-2026-09-04.md` §8).
**Scope source:** `analysis/data-stellar-batch-brief.md` → *Pinned — calibration arc*, the rookie bullet.
**Evidence base:** `sleeper-dashboard-data` `grading/2026-09-06-fullpipeline-verdict.md` → *Rookie panel*, and its artifact `backtests/2026-09-06-fullpipeline-panel.json` → `rookiePanel.rows` (1,056 rows), re-read row-by-row in Session 1.
**Live reference:** `snapshots/2026-09-07.json` (schemaVersion 3, 711 players, 288 rookie-path rows), `nflverse/playerids.json` (schemaVersion 2, `bySleeper`, 6,386 entries), `nflverse/draft/draft_picks.json` (2010–2026, 257 picks in each of 2017–2026), and `raw/-players-nfl.json` (the Sleeper player map, 12,180 rows, captured 2026-05-18 — the source of `years_exp` and `age` for every live figure below).
**Review pass:** plan-reviewer run 2026-09-07; sixteen flags, all triaged in §10. Every number in §1(c), §2 and §5.5 below is post-flag and recomputed under the rule as specified in §2.1, not under crosswalk status.

**Veteran path is untouched by this slice.** §8.1's stop stands: no veteran calibration constant, no shrinkage, no Step-4 edit, no factor pruning here.

---

## 1. The four questions, resolved

### Q1 · What the `unmatched` bucket actually is → **verified-undrafted, not a name-join problem and not a non-prospect problem**

The premise in the slice brief was that the bucket conflates three populations and that the largest is "veterans with no qualifying season riding the rookie path". Checked against the panel; it is not.

**a. In the panel, `unmatched` means exactly `undrafted`.** The panel does not use this app's name matcher. `scripts/panel-run.mjs:1350` builds `draftInfoBySleeper` from `playerids.json` `bySleeper` — a sleeper-id-keyed crosswalk carrying `draftYear`, `draftRound`, `draftPick` and an explicit `undrafted` flag. Cross-tabulating all 366 `nflDraftTier: null` rows against that crosswalk:

| crosswalk status of the 366 | n |
|---|---|
| `undrafted: true` | 366 |
| absent from crosswalk | 0 |
| present with a `draftRound` (i.e. a join miss) | 0 |

Zero join misses, zero unknowns. The 0.28–0.36 realisation is a property of **being undrafted**, measured on a population with no draft record at all.

**b. Experience does not explain it.** Experience proxy: `predictorYear − draftYear`, where `draftYear` comes from the crosswalk and is populated for **every** row including undrafted ones — nflverse's `draft_year` is 100% filled and reads as an *entry* year when `draftRound` is null, which is documented on the data side at `lib/nflverse.mjs:448-450` and is why `undrafted` rather than a null round is the flag that disambiguates the two fields. Three of the 366 undrafted rows carry an unusable value (two at `draftYear: 0`, one at `draftYear: 2025` against `predictorYear: 2024`) and are excluded, so the undrafted row counts below sum to 363. Realised ÷ projected as a ratio of means:

| bucket | Y−D = 0 | Y−D = 1 | Y−D ≥ 2 |
|---|---|---|---|
| undrafted (363 of 366 usable) | 0.396 (n=219) | 0.282 (n=87) | 0.331 (n=57) |
| day-3 (r4–r7) | 0.826 (n=297) | 0.764 (n=34) | 0.866 (n=27) |
| r1 + day-2 | 1.153 (n=312) | 0.416 (n=5) | 0.926 (n=15) |

The correction is flat in experience inside every group. And the third population the brief worried about — a veteran with real draft capital and no qualifying season — is **nearly correct already**: drafted rows at Y−D ≥ 2 realise 0.893 of projection (n=42). So "stop applying a positional prospect baseline to players who are not prospects" is **not** the fix. The fix is: stop giving undrafted players a neutral multiplier.

**c. This app's `unmatched` is a wider bucket than the panel's `undrafted`, and the gap is bounded and pinned.** On `snapshots/2026-09-07.json`, 288 rookie-path rows, app `nflDraftMatchSource` cross-tabbed against the crosswalk:

| app matcher | crosswalk says | n |
|---|---|---|
| matched | drafted | 170 |
| matched | absent from crosswalk | 1 |
| unmatched | `undrafted: true` | 93 |
| unmatched | absent from crosswalk | 22 |
| unmatched | **drafted** (join miss) | **2** |

The rule in §2.1(b) resolves those 117 unmatched rows into **116 `'undrafted'` and 1 `'unknown'`**. Composition of the 116 that take the discount:

| | n | what it is |
|---|---|---|
| crosswalk `undrafted: true` | 93 | the population the constants are fitted on |
| absent from the crosswalk | 22 | unverified; 2026 entrants nflverse has not yet keyed to a Sleeper id, so undrafted by strong inference, not by measurement |
| crosswalk-drafted | 1 | **wrongly discounted** — Robbie Ouzts, 2025 r5, hard-skipped by `positionsCompatible` because nflverse lists him TE and Sleeper lists him RB |

The other join miss, Josh Johnson (2008 r5, `years_exp` 18), resolves `'unknown'` and keeps today's projection: his entry year is outside the app's loaded draft window by construction, which is exactly what the window test in §2.1(b) is for. So the honest claim is **1 wrongly discounted row of 288 (0.35%), 22 discounted on inference rather than measurement, and 93 discounted on the measured population** — not that the rule fails closed on every misjoin.

### Q2 · Is the cap the right instrument → **no. Defer the ceiling entirely.**

Stronger than the brief's caveat. The panel's rookie reconstruction holds **both** `ktcMult` and `collegeContribution` at exactly 1.0 (`lib/projectionFactors.mjs:766-775`, disclosed there as a deviation). Verified arithmetically: all 1,056 rows equal `baseline × ageMult × nflDraftMultiplier` to within 0.02 on the implied age multiplier, and the reachable product range is therefore `[0.82 × 0.58, 1.15 × 1.30] = [0.476, 1.495]`, strictly inside the `[0.45, 1.85]` clamp.

**`hitCap: 0/1056` is arithmetic, not evidence.** The clamp cannot fire in that reconstruction in either direction. The panel neither validates nor refutes a cap.

The live stack does reach it — 6 of 288 rows sit at `rookieMultiplierProduct = 1.85` on 2026-09-07 (7 on 09-05). But nothing available today says what the right ceiling is:

- Expressed against realised rookie outcomes: the panel's own top end is **above** the current live top end (QB p95 23.2, max 27.5 PPG; live top rookie QB projects 24.1). So the panel does not support cutting the top.
- Expressed against the live veteran distribution: a "no rookie above the position's p95 veteran" rule binds on **1** of 288 rows; a p90 rule binds on 8. Low yield, and it would need the whole projected population inside the projection call — a second pass over `playerRows`, which is an architecture change, not a constant.
- Anton's stated goal ("never project a rookie to a level no rookie has reached") cannot be answered by this panel at all: every panel row's outcome is season **Y+1** for a player who already appeared in Y, so the panel grades second-season outcomes and never a debut season. The 2026 class projecting 2026 is exactly the case it does not cover.

**Decision: ship no ceiling and no cap change in this slice.** Named prerequisite, listed in §7 as a data-repo ask and deliberately not planned here: a debut-season rookie panel (predictor = draft year, outcome = the same season). Until that exists, a ceiling would be an unvalidated constant, which is the thing §8.1 refused to ship on the veteran side.

### Q3 · Tier-correction shape → **four coarse groups × position, downward corrections only, per-tier cells rejected**

Three findings drive this.

**a. Per-tier × position overfits.** Leave-one-predictor-year-out (12 folds, one per predictor year 2013–2024, constants refit on the other 11), mean absolute error in PPG over all 1,056 rows:

| scheme | MAE | RMSE | mean bias | median realised ÷ predicted |
|---|---|---|---|---|
| shipped (no correction) | 3.788 | 4.536 | +1.490 | 0.592 |
| single global constant | 3.445 | 4.348 | −0.001 | 0.763 |
| undrafted only, per position | 2.823 | 3.687 | −0.038 | 0.798 |
| 4 groups × position (shrunk m=20) | 2.727 | 3.632 | −0.057 | 0.816 |
| **10 tiers × position (shrunk m=20)** | **2.751** | 3.679 | −0.064 | 0.811 |

The finer cell set is **worse** out of sample than the coarser one, at every position except RB. Per-tier corrections are rejected on this evidence, and so is re-anchoring the `nflDraftMultiplier` table (same cell count, same overfit, and it would conflate the draft-capital signal with the calibration in one number, destroying the audit trail in every snapshot already captured).

**b. The upward half does not survive, and must not ship.** Under the shipped protocol defined in (c), adding r1/day-2 lift cells makes the out-of-sample error **worse**, not marginally better: LOYO MAE 2.7155 downward-only against 2.7394 with the lift. And the panel's early-tier "under-projection" is an artifact of the two multipliers the reconstruction holds at 1.0 — which are precisely the two that correlate with draft capital. Measured on the live population, the uplift the shipped stack applies over `age × draft` alone:

| group | panel says needs | live stack already applies | live position after the panel's target |
|---|---|---|---|
| r1 | ×1.119 | ×1.358 | ×1.21 **too high** |
| day-2 (r2–r3) | ×1.142 | ×1.217 | ×1.07 too high |
| day-3 (r4–r7) | ×0.824 | ×1.094 | ×1.33 too high |
| undrafted | ×0.359 | ×1.046 | ×2.9 too high |

Concretely: the panel's mean top-8 RB projection is 11.9 PPG against a realised 17.9, while the live stack projects Ashton Jeanty (2025 r1p6) at 16.7 with KTC at the 97th percentile and college at the ceiling. The shipped model is already where the realised mean is at the top. Lifting early rounds on this panel would be fitting reconstruction error, the §8.1 failure mode.

The transfer error runs the other way for the two groups that do ship: the live uplift is only ×1.046 (undrafted) and ×1.094 (day-3), so shipping the panel's own ratio under-corrects by ~5% and ~9% respectively. Under-correction is the safe direction and the constants are quoted unadjusted, with this residual recorded in `docs/projection.md`. A second reason the constants are conservative: the panel grades second seasons, and a debut season is the weaker one.

**c. Cells, n, and the minimum-n rule.** Groups are `r1` = {top-3, top-8, r1-mid, r1-late}, `day2` = {r2, r3}, `day3` = {r4, r5, r6, r7}, `undrafted`. Constant = ratio of means (Σ realised ÷ Σ projected) on the full panel:

| group | QB | RB | WR | TE |
|---|---|---|---|---|
| day3 | 1.103 (n=31) | 0.799 (n=116) | 0.787 (n=128) | 0.710 (n=83) |
| undrafted | 0.668 (n=14) | 0.332 (n=101) | 0.363 (n=150) | 0.279 (n=101) |

**Minimum-n rule (state it in `docs/projection.md` verbatim):**
1. A cell with **n ≥ 30** uses its own ratio of means.
2. A cell with **10 ≤ n < 30** uses its own ratio, floored at the group-pooled ratio and capped at 1.00. Only `undrafted:QB` (n=14) is in this band; its own 0.668 stands, and it beats both the m=20-shrunk 0.486 and the position-pooled 0.359 out of sample (QB-only LOYO MAE 4.509 / 4.576 / 4.650 against 4.621 shipped).
3. A cell with **n < 10 is held at 1.00 — no correction.** It never inherits a neighbouring tier: a neighbouring tier is a different population, and the whole reason for the group structure is that thin cells lie (top-3 RB n=1 at 1.24, r1-mid TE n=2 at 1.63).
4. No further shrinkage. The shrinkage sweep is flat — LOYO MAE 2.7155 at m=0 against 2.7400 at m=80 — because the grouping has already done the smoothing. Raw cells beat m=20 cells at every position.
5. **Every cell above 1.00 is clamped to 1.00.** `day3:QB` at 1.103 therefore ships as **1.00**, not as a lift: its 31 rows are day-3 QBs who reached the panel's `gp ≥ 6` outcome gate, i.e. survivors who won a job, and the panel drops 1,507 of 2,563 assembled rows for no outcome. No day-3 lift is defensible on a survivor-selected cell.

**Shipped constants — 7 live cells, 1 explicit no-op:**

```
undrafted: QB 0.67 · RB 0.33 · WR 0.36 · TE 0.28
day3:      QB 1.00 (no-op) · RB 0.80 · WR 0.79 · TE 0.71
r1, day2:  1.00 (no correction — see (b))
```

Final scheme, LOYO with constants refit per fold: MAE **3.788 → 2.716** (−28.3%), RMSE 4.536 → 3.650, mean bias +1.490 → −0.358, median realised ÷ predicted 0.592 → 0.869. Per position: QB 4.621 → 4.509, RB 4.692 → 3.227, WR 3.551 → 2.528, TE 2.775 → 1.670. Every position improves.

Accepted non-monotonicity, to be stated in the docs so it is not read as a bug: for QB the effective multiplier for an undrafted player (0.67) sits **above** a 7th-rounder's (0.58 × 1.00). The panel says so — `r7:QB` is n=3 — and rule 3 forbids inventing a smoother number. For RB/WR/TE the effective multiplier is monotone across all eleven states.

### Q4 · Validation → **yes, these constants need their own out-of-sample check, and it must run in this repo**

The rookie panel is descriptive calibration. `grading/2026-09-06-fullpipeline-verdict.md` publishes tier ratios; it does not publish any out-of-sample test of a correction fitted to them, so the existing verdict does **not** discharge the scoring-change gate.

Session 1 ran the check: leave-one-predictor-year-out over the 12 predictor years, constants refit on the 11 training years each fold, reported in Q3. That satisfies the gate on substance. To make it durable and reproducible **in this repo** (a test may not read the sibling tree), Session 2 commits the panel rows as a fixture and two tests over it — the provenance test and the LOYO test in §5.3. The constants then cannot drift from their evidence without a red test, and the OOS claim is re-checked on every `npm test`.

**No data-repo change is required to ship this slice.** Three things that would improve or de-risk it do require one; they are recorded in §7 and deliberately not planned.

---

## 2. What changes

All app-side, three files plus tests and docs.

### 2.1 `src/utils/seasonProjection.js`

**a. New module constant, beside `ROOKIE_BASELINE_PPG`:**

```js
// Rookie realisation calibration (calibration arc slice 1).
// Fitted on sleeper-dashboard-data backtests/2026-09-06-fullpipeline-panel.json
// rookiePanel.rows (1,056 graded rookie-path seasons, predictor years 2013-2024),
// as Σ realised PPG ÷ Σ projected PPG per group × position. Downward only: the
// panel's early-round lift is an artifact of that reconstruction holding ktcMult
// and collegeContribution at 1.0, so r1/day2 stay uncorrected. See
// docs/projection.md → Rookie path → Realisation calibration for the minimum-n
// rule and the n per cell.
const ROOKIE_CALIBRATION = {
  undrafted: { QB: 0.67, RB: 0.33, WR: 0.36, TE: 0.28 },
  day3:      { QB: 1.00, RB: 0.80, WR: 0.79, TE: 0.71 },
}
const DAY3_TIERS = new Set(['r4', 'r5', 'r6', 'r7'])
```

**b. New pure helper, exported for direct test:**

```js
export function resolveDraftCapitalStatus({ nflDraftMatchSource, yearsExp, currentSeason, nflDraftYears })
// → 'matched' | 'undrafted' | 'unknown'
```

- `nflDraftMatchSource === 'matched'` → `'matched'`.
- Otherwise `'unknown'` when `yearsExp` is null, `currentSeason` is null, or `nflDraftYears` is null/empty.
- Otherwise `entryYear = (currentSeason + 1) - yearsExp` (the target season minus experience; `currentSeason` is the last completed season, so the target season is `currentSeason + 1`). **`'undrafted'` only when `nflDraftYears` contains `entryYear` — a set-membership test, not a min-to-max range test.** Anything else → `'unknown'`.

Membership, not a range, and `nflDraftYears` must arrive already filtered to years that actually carried picks (§2.2). Two failure modes a `[min…max]` test would let through, both real: a year served as `[]` by a store-down cache path widens the range while matching nobody, and an interior missing year is invisible to min/max — `loadNflDraftPicks` can return a gapped `picksByYear` from its per-year cache path (`src/api/nflDraft.js:72-73`, "Store unavailable → return whatever was fresh in cache"). `src/utils/projectionSnapshot.js:187` already filters coverage years on `> 0` for exactly this reason, with the comment naming the defect class; this is the same guard, reused rather than reinvented.

Why the window test is load-bearing rather than cosmetic: `src/api/nflDraft.js` sets `MIN_DRAFT_YEAR = 2017`, so a rookie-path player who entered the league before 2017 is unmatched **by construction**, and a year that fails to load leaves its whole class unmatched. Deriving the window from the loaded data (not from a duplicated 2017) makes the discount fail closed in exactly the silent-neutral situation this repo has been bitten by three times (§7.6 of the analysis). Josh Johnson (`years_exp` 18, entry 2008, currently projected 10.7 PPG) resolves `'unknown'` and is left alone.

**c. New pure helper, exported for direct test:**

```js
export function resolveRookieCalibration({ position, draftCapitalStatus, nflDraftTier })
// → { rookieCalibrationMult: number, rookieCalibrationBasis: string }
```

- `draftCapitalStatus === 'undrafted'` → `ROOKIE_CALIBRATION.undrafted[position]`, basis `` `undrafted:${position}` ``.
- `draftCapitalStatus === 'matched' && DAY3_TIERS.has(nflDraftTier)` → `ROOKIE_CALIBRATION.day3[position]`, basis `` `day3:${position}` ``.
- Anything else → `1.0`, basis `'none'`.
- Unknown position (defensive; `SKILL` already gates the caller) → `1.0`, basis `'none'`.

`basis` records the cell that was **consulted**, not whether it moved the number, so `day3:QB` rows carry `basis: 'day3:QB'` with `rookieCalibrationMult: 1.00`. That is deliberate: it makes the population visible in a snapshot without recomputing the grouping, which is what the grading side needs when the QB cell is eventually revisited. The consequence for the summary lines is handled in (f).

**d. In `rookieProjection`** — signature gains `currentSeason` and `nflDraftYears` after `nflDraftMatches`. Apply the multiplier **outside** the existing product clamp:

```js
const rookieMultiplierProduct = clamp(rookieMultiplierProductRaw, 0.45, 1.85)   // unchanged
const draftCapitalStatus = resolveDraftCapitalStatus({ nflDraftMatchSource, yearsExp, currentSeason, nflDraftYears })
const { rookieCalibrationMult, rookieCalibrationBasis } = resolveRookieCalibration({ position, draftCapitalStatus, nflDraftTier })
const projectedPPG = clamp(baseline * rookieMultiplierProduct * rookieCalibrationMult, 0, 40)
```

**Outside, not inside, and this is not a style choice.** Folded into `rookieMultiplierProductRaw`, the `0.45` floor would clip the discount for **132 of the 200** live rows the correction touches — it would silently swallow most of the change. Keeping it outside also leaves `rookieMultiplierProduct` comparable across the whole captured snapshot series, which matters for CR-01 continuity. Round once, at the end, on the product of all three terms.

**e. Three new `factors` keys** (rookie path only, mirroring the D1 precedent — do not add them to the vet key set):

| key | type | value |
|---|---|---|
| `draftCapitalStatus` | string enum | `'matched'` / `'undrafted'` / `'unknown'` |
| `rookieCalibrationMult` | number | 1.0 when no correction; recorded to 3dp |
| `rookieCalibrationBasis` | string | `'undrafted:WR'` / `'day3:RB'` / `'none'` |

**f. Two new `adjustmentSummary` lines, both gated on `rookieCalibrationMult < 1`** — never on the basis string alone, which is set on 20 live `day3:QB` rows whose multiplier is 1.00 and which must emit no line. These move `projectedPPG`, so a line is correct; the no-summary rule applies to capture-only factors.
- `rookieCalibrationMult < 1 && basis startsWith 'undrafted:'` → `'Undrafted — realisation discount ↓↓'`
- `rookieCalibrationMult < 1 && basis startsWith 'day3:'` → `'Day-3 pick — realisation discount ↓'`

**g. `computeNextSeasonProjection`** gains **two** destructured options: `currentSeason` (today only a bare `// currentSeason — reserved; currently unused` comment placeholder at `:257`, not a binding — App.jsx already passes the value at `:572`, where it is silently discarded) and `nflDraftYears = null`. Delete the "reserved" comment and describe both uses. Pass both through to `rookieProjection`. The veteran branch reads neither.

### 2.2 `src/App.jsx`

In the projection memo (the `computeNextSeasonProjection` call at ~`:575`), pass:

```js
currentSeason,                    // already in scope and already passed to buildProjectionSnapshot
nflDraftYears: nflDraftCoverage
  ? Object.keys(nflDraftCoverage).filter(y => (nflDraftCoverage[y] ?? 0) > 0).map(Number)
  : null,
```

The `> 0` filter is the same one `buildNflDraftStatus` applies at `src/utils/projectionSnapshot.js:187`; a year present with zero picks is not a loaded year. Add `nflDraftCoverage` to that memo's dependency array. `nflDraftCoverage` is already state (`:174`), already derived from the loaded `picksByYear` in the draft effect (`:927-931`), and already written into the snapshot envelope (`:694`) — so the window the guard uses is already captured per snapshot and needs no envelope change. Do not add a new loader and do not touch `src/api/nflDraft.js`.

### 2.3 `src/utils/nflDraftMatch.js`

Docstring only. The *UDFA handling* block says distinguishing UDFAs from name-match misses "requires a verified-UDFA list; deferred to D1.5". Replace with the measured position: the projection now infers `'undrafted'` from an unmatched result plus an entry year inside the loaded draft-year set, and the residual cost is **1 wrongly discounted row of 288** on 2026-09-07 — Robbie Ouzts, whose pick is present in `picksByYear` but hard-skipped by `positionsCompatible` (nflverse TE against Sleeper RB). No logic change.

---

## 3. Deliberately not in this slice

Each of these was considered and rejected with a reason, so Session 2 does not re-open them:

1. **Any veteran-path change.** §8.1's stop.
2. **A cap, ceiling, or change to `[0.45, 1.85]`.** Q2. The panel cannot test it.
3. **Any change to the `nflDraftMultiplier` tier table.** Q3(a). Re-anchoring it overfits and destroys the audit trail.
4. **Any early-round lift.** Q3(b). It makes out-of-sample error worse under the shipped protocol.
5. **An app loader for `nflverse/playerids.json`.** This would be the clean way to read `undrafted` directly, and it is blocked on process, not on merit: no registry entry covers an app read of that family (`docs/signal-registry.md:61` records it as "internal-only … no app loader"), so it is a brand-new **runtime** cross-repo coupling, which per CLAUDE.md routes to the Claude.ai project for a draft registry entry before it can be planned. The entry-year rule in §2.1(b) gets 116 of 117 rows right using only what the app already loads.
6. **A name-collision guard** (recognising a player whose name appears in `picksByYear` but was rejected on position — the Ouzts case). Yield is 1 live row of 288. It needs either a change to `matchNflDraftToSleeper`'s return shape, which would inflate `Object.keys(nflDraftMatches).length` and therefore `inputStatus.nflDraft.detail.matched` (`projectionSnapshot.js:181`) — a CR-01 surface and the D1b smoke line's own floor — or a duplicated matching loop. Recorded as a measured residual instead, in §2.3 and §1(c). The right home is the matcher's position cross-check, as its own slice.
7. **`projectedGames` for rookies (fixed at 14) and a rookie depth factor.** A 4th-string undrafted QB (live: Joe Fagnano, 13.3 → 8.9 PPG after this slice, still at depth 4) is over-projected in *availability* as much as in level, and the discount only addresses level. The panel has no depth or availability reconstruction on the rookie path, so there is no constant to fit. Next slice in this arc.

---

## 4. Docs/README updates

**`docs/projection.md` → Rookie path (`:95-141`):**
1. Fix the stale formula at `:100` — it omits `nflDraftMultiplier`, which has been in the product since D1. New line:
   `projectedPPG = ROOKIE_BASELINE_PPG[pos] × clamp(ageMult × ktcMult × collegeContribution × nflDraftMultiplier, 0.45, 1.85) × rookieCalibrationMult`
   and state explicitly that the calibration multiplier is applied **outside** the clamp, with the reason (132 of 200 corrected rows would otherwise hit the 0.45 floor).
2. New subsection **Realisation calibration** carrying: the two constant tables with n per cell; the group definitions; the five-part minimum-n rule from Q3(c) verbatim; the LOYO result (3.788 → 2.716 MAE, per-position deltas); the provenance line (`backtests/2026-09-06-fullpipeline-panel.json`, predictor years 2013–2024, outcome gate `gp ≥ 6`); and the `draftCapitalStatus` three-state definition including why `'unknown'` takes no discount.
3. Record the three known biases in that subsection, not in a footnote: the constants are fitted where `ktcMult`/`collegeContribution` are 1.0 so they under-correct the live stack by ~5% (undrafted) and ~9% (day-3); the panel grades second seasons, never debut seasons; and `day3:QB` is a survivor-selected cell held at 1.00 rather than lifted.
4. Update the `Unmatched (incl. UDFA) — ×1.00` row of the tier table at `:137` and the trailing sentence at `:139` (`"distinguishing them requires a verified-UDFA list, deferred to a future batch"`) — an unmatched player whose entry year is inside the loaded draft-year set now takes the undrafted discount; an out-of-set or unknown one stays neutral. Name the measured residual (1 of 288).
5. Note that the rookie ceiling is explicitly deferred, with Q2's reason in one sentence, so the next session does not re-derive it.

**`docs/signal-registry.md`:**
1. New computed-factor row after `:100`: `Rookie realisation calibration (draftCapitalStatus, rookieCalibrationMult, rookieCalibrationBasis)` | computed factor | `seasonProjection.js` (constants fitted on data-repo `backtests/2026-09-06-fullpipeline-panel.json`) | draft 2010+ / panel 2013–2024 | **Live input remains ephemeral → captured for grading** | `active→projectedPPG` (rookie path). Classified the way `:90` classifies `depthFactor`, and for the same reason: `draftCapitalStatus` is determined by Sleeper `years_exp`, a current-value-only field that increments every season, plus the draft-year set loaded at compute time. What makes the factor gradeable is the captured `factors` value, not reconstructability of its inputs. `rookieCalibrationMult` is reconstructable **given** a captured status.
2. Amend the existing rookie NFL-draft-slot row at `:100` so `nflDraftMatchSource` is described as the join outcome only, now distinct from `draftCapitalStatus`, which adds the undrafted/unknown split.
3. Amend the crosswalk row at `:61`: it stays **internal-only, no app loader** — this slice deliberately does not read it (§3 item 5) — but note that its `undrafted` flag is what defined the population the shipped constants are fitted to, so a change in how the data repo derives `undrafted` (currently `draftRound === null`, `lib/nflverse.mjs:548`) invalidates them.

**`docs/navigation.md`:** update the `seasonProjection.js` row (`:124`) — per-module export lists live there, and the slice adds two exports, `resolveDraftCapitalStatus` and `resolveRookieCalibration`.

**`CLAUDE.md`:** two edits. The *Factors contract* invariant's count goes from "51 rookie keys" to 54. The `src/__fixtures__/` navigation row today reads "`season-totals-2025.json` — the field-existence oracle" and gains the panel fixture with its own one-clause purpose (the rookie calibration constants' provenance oracle). Watch the 25,000-byte ceiling; both edits are a few words.

**No README change.** Nothing here adds a command, a surface, or a data family.

---

## 5. Tests to add

### 5.1 `src/__tests__/factorsSchema.test.js` (update — required by the Factors contract invariant)

- Add `draftCapitalStatus`, `rookieCalibrationMult`, `rookieCalibrationBasis` to `ROOKIE_FACTORS_KEYS`; update the header comment's derivation note and the count in the two rookie test names from 51 to 54. `VET_FACTORS_KEYS` is unchanged at 73 — a test asserting the vet path does **not** emit the three keys is what the both-directions helper already does and needs no new case.
- In *rookie factors value types and enum constraints*, add: `draftCapitalStatus` ∈ `['matched','undrafted','unknown']`; `rookieCalibrationMult` is a finite number in `(0, 1]`; `rookieCalibrationBasis` matches `/^(none|undrafted:(QB|RB|WR|TE)|day3:(QB|RB|WR|TE))$/`.
- The existing `ROOKIE_OPTIONS` fixture passes no `nflDraftMatches`, no `nflDraftYears` and `currentSeason: 2025` → expect `draftCapitalStatus: 'unknown'`, `rookieCalibrationMult: 1`, `rookieCalibrationBasis: 'none'`, and `projectedPPG` unchanged from today. This doubles as the fail-closed assertion.

### 5.2 `src/utils/seasonProjection.test.js` (new cases, after the existing D1 tests at `:762-819`)

Direct unit tests on the two new exported helpers. Window `[2017…2026]` means the array of those ten years.

| case | input | expected |
|---|---|---|
| matched wins | `nflDraftMatchSource: 'matched'`, any yearsExp | `'matched'` |
| undrafted, in set | unmatched, `yearsExp: 0`, `currentSeason: 2025`, window `[2017…2026]` | `'undrafted'` |
| entry before set | unmatched, `yearsExp: 18`, same window | `'unknown'` |
| entry after set | unmatched, `yearsExp: 0`, window `[2017…2024]` | `'unknown'` |
| **interior gap** | unmatched, `yearsExp: 1` (entry 2025), window `[2017…2024, 2026]` | `'unknown'` — the min/max regression guard |
| **zero-pick year excluded upstream** | unmatched, `yearsExp: 0`, window `[2017…2025]` (2026 filtered out by App.jsx's `> 0`) | `'unknown'` |
| no window loaded | unmatched, `nflDraftYears: null` | `'unknown'` |
| empty window | unmatched, `nflDraftYears: []` | `'unknown'` |
| yearsExp null | unmatched, `yearsExp: null` | `'unknown'` |
| currentSeason null | unmatched, `currentSeason: null` | `'unknown'` |
| calibration · undrafted WR | `'undrafted'`, WR | `0.36`, `'undrafted:WR'` |
| calibration · day-3 RB | `'matched'`, `nflDraftTier: 'r6'`, RB | `0.80`, `'day3:RB'` |
| calibration · day-3 QB no-op | `'matched'`, `'r4'`, QB | `1.00`, `'day3:QB'` |
| calibration · r1 untouched | `'matched'`, `'top-3'`, QB | `1.00`, `'none'` |
| calibration · r3 untouched | `'matched'`, `'r3'`, WR | `1.00`, `'none'` |
| calibration · unknown untouched | `'unknown'`, `null` tier, TE | `1.00`, `'none'` |

Plus, through `computeNextSeasonProjection` (integration, all with `careerStats: {}` so the rookie path fires):

- **Clamp interaction, the load-bearing case.** TE, `age: 24`, `years_exp: 0` → `ageMult 0.82`, no KTC, no college → product 0.82; unmatched with entry year in the window → `rookieCalibrationMult 0.28`. Assert `rookieMultiplierProduct === 0.82` (unchanged by the calibration, i.e. the multiplier is outside the clamp) and `projectedPPG === 1.1` (`5 × 0.82 × 0.28 = 1.148`). If a future refactor moves the multiplier inside the clamp this returns 2.3 and the test reds — which is the whole point of the case.
- **Adjustment summary, three cases.** The undrafted case emits `'Undrafted — realisation discount ↓↓'` and no day-3 line; a day-3 RB emits the day-3 line and no undrafted line; **a day-3 QB emits neither line while still carrying `rookieCalibrationBasis: 'day3:QB'`** — the flag-7 regression; a `top-3` rookie emits neither.
- **No veteran leakage.** A vet-path player (the existing 5-season WR fixture) with `nflDraftYears` and `currentSeason` supplied returns an identical `projectedPPG` to the same call without them, and its factors contain none of the three new keys.

### 5.3 `src/__tests__/rookieCalibration.test.js` (new file) — the constants' provenance and out-of-sample gate

New fixture `src/__fixtures__/rookie-panel-2026-09-06.json` (~52 KB): the 1,056 `rookiePanel.rows` trimmed to `{ p: position, y: predictorYear, t: tier|'unmatched', pr: projectedPPG, o: outcomePPG }`, with a `source` string naming the data-repo artifact and commit it came from. Extract it once, commit it; the test never reads the sibling tree. Precedent for committing a copy of data-repo data as a fixture: `src/__fixtures__/season-totals-2025.json` is byte-identical to the data repo's served `nfl/season-totals/2025.json`.

1. **Fixture integrity.** 1,056 rows; 366 with `t === 'unmatched'`; tier counts match the verdict file's table (`top-3` 18, `top-8` 23, `r1-mid` 24, `r1-late` 47, `r2` 107, `r3` 113, `r4` 116, `r5` 98, `r6` 88, `r7` 56); every `pr > 0`.
2. **Provenance — each shipped constant is re-derived from the fixture.** For each of the 7 live cells plus `day3:QB`, recompute Σ`o` ÷ Σ`pr` over the group × position and assert it rounds to the constant in `ROOKIE_CALIBRATION` (2dp), and assert the cell's n equals the n documented in `docs/projection.md`. Expected: `undrafted` QB 0.67 / RB 0.33 / WR 0.36 / TE 0.28 at n 14 / 101 / 150 / 101; `day3` RB 0.80 / WR 0.79 / TE 0.71 at n 116 / 128 / 83; `day3:QB` raw 1.10 at n 31, shipped as 1.00 by the ≤1.00 clamp — assert both the raw value and that the shipped constant is 1.00, so the clamp is documented by a test rather than by a comment.
3. **Out-of-sample gate.** Reimplement the LOYO protocol over the fixture (12 folds by `y`; refit cells on the 11 training years under the same minimum-n rule; predict the held-out year) and assert: corrected MAE < uncorrected MAE by at least 0.75 PPG overall, and corrected MAE ≤ uncorrected for **each** of QB/RB/WR/TE. Measured margins to leave headroom against: overall 3.788 → 2.716; QB 4.621 → 4.509; RB 4.692 → 3.227; WR 3.551 → 2.528; TE 2.775 → 1.670. Assert the sign of mean bias flips from positive to near-zero-or-negative (+1.490 → −0.358). Use loose bounds, not exact equality — the assertion is that the correction generalises, not that a float is reproduced.
4. **The upward half stays out.** Under the same shipped protocol, adding r1/day-2 lift cells (the min-n rule with the ≤1.00 clamp lifted) must **not** improve overall LOYO MAE. Measured on the shipped protocol: 2.7155 downward-only against 2.7394 with the lift, i.e. the lift is 0.024 PPG *worse*. Assert `maeWithLift >= maeDownwardOnly`. This is the test that stops a later session "completing" the tier table.

### 5.4 Regression test — the named live rows (in `src/__tests__/rookieCalibration.test.js`)

All four cases are synthetic fixtures whose inputs are the factor values actually observed for those players in `sleeper-dashboard-data snapshots/2026-09-07.json`, with `years_exp`/`age` from `raw/-players-nfl.json`, so they are deterministic and need no network. Cite the pid and the snapshot date in a comment on each. `currentSeason: 2025`, window `[2017…2026]` throughout.

**A · known 2026 first-rounder — Fernando Mendoza (pid 13269, QB, 2026 R1P1, `LV`).** Inputs: QB, `years_exp: 0`, `age: 22` → `rookieAgeAtDraft 22`, `ageMult 1.05`; `ktcMap` giving `ktcPct 80` → `ktcMult 1.18`; `collegeStats` giving `peakDominator ≥ 30` and `productionTrend 'improving'` → `collegeContribution 1.25`; `nflDraftMatches: { '13269': { year: 2026, round: 1, pick: 1 } }`.
Expected: `nflDraftTier 'top-3'`, `rookieMultiplierProduct 1.85` (raw 2.013, clamped), `draftCapitalStatus 'matched'`, `rookieCalibrationMult 1`, `rookieCalibrationBasis 'none'`, **`projectedPPG 24.1` — unchanged from the shipped model.** The panel's early-capital cells are not shipped, so the top of the rookie board must not move; if it moves, someone has shipped the lift.

**B · known unmatched fringe player — Luke Altmyer (pid 13314, QB, 2026 UDFA, `DET`, no depth-chart order).** Inputs: QB, `years_exp: 0`, **`age: null`** — his real Sleeper record has no age, so `age ?? 23` gives 23, `rookieAgeAtDraft 23`, `ageMult 0.95`, and the fixture therefore also exercises the null-age default. No KTC entry → `ktcMult 1.0`; `collegeStats` giving `collegeMult 1.26` → `collegeContribution 1.25`; `nflDraftMatches: {}`.
Expected: `nflDraftMatchSource 'unmatched'`, `nflDraftTier null`, `rookieMultiplierProduct 1.188` (unclamped), `draftCapitalStatus 'undrafted'`, `rookieCalibrationMult 0.67`, `rookieCalibrationBasis 'undrafted:QB'`, **`projectedPPG 10.3`** (was 15.4), and the summary contains the undrafted line. The panel's `undrafted:QB` cell (0.668, n=14) is what this asserts.

**C · the window guard — Josh Johnson (pid 260, QB, 2008 r5, unmatched because the app loads 2017+).** Inputs: QB, `years_exp: 18`, `age: 40` → `ageMult 0.82`, no KTC, no college, `nflDraftMatches: {}`.
Expected: `draftCapitalStatus 'unknown'`, `rookieCalibrationMult 1`, `rookieCalibrationBasis 'none'`, **`projectedPPG 10.7` — unchanged.** A real drafted player outside the loaded window must not take the UDFA discount.

**D · the day-3 case — Bhayshul Tuten (pid 12490, RB, 2025 r4 p104).** `years_exp: 1`, `age: 23` → `ageMult 1.05` via `rookieAgeAtDraft 22`; `ktcPct 83` → `ktcMult 1.198`; `collegeContribution 1.25`; round 4 → `nflDraftMultiplier 0.74`; product 1.164.
Expected: `rookieCalibrationBasis 'day3:RB'`, `rookieCalibrationMult 0.80`, `projectedPPG 8.4` (was 10.5).

### 5.5 Expected aggregate effect — the pinned numbers Session 2 must reproduce

All computed under the rule in §2.1 on `snapshots/2026-09-07.json` (288 rookie-path rows), with `years_exp` from `raw/-players-nfl.json` and the window `[2017…2026]`:

| quantity | value |
|---|---|
| `draftCapitalStatus` split | matched 171 · undrafted 116 · unknown 1 |
| rows with `rookieCalibrationMult < 1` | **200** (116 undrafted + 84 day-3 non-QB) |
| rows carrying `basis 'day3:QB'` at mult 1.00 | 20 |
| corrected rows that would hit the 0.45 floor if the multiplier went inside the clamp | 132 |
| discounted rows that are crosswalk-drafted (the known cost) | 1 (Ouzts, 8.4 → 2.8) |

Board effect, rookies projected above the **median veteran at their own position**, before → after: QB 14 → 6 · RB 63 → 34 · WR 110 → 41 · TE 57 → 21. Rookies above the veteran p90 are unchanged at 1 / 3 / 3 / 1, and the top of each position's rookie board is unchanged (QB 24.1, RB 16.7, WR 13.0, TE 9.3). Largest single movers are undrafted RBs at 10–11 PPG dropping to 3–4 (CJ Donaldson 11.3 → 3.7, Corey Kiner 10.7 → 3.5).

Session 2 should reproduce the four above-median counts in the running app as its smoke check (`docs/architecture.md` → *Smoke-testing the running app*), since the change is visible on the Market table's Proj column. Small drift in those counts is expected and acceptable — the live KTC file, depth charts and roster move daily, and the numbers above are pinned to one snapshot date. A large divergence, or any movement in the four maxima, is a defect.

---

## 6. Cross-repo impact

Three registry entries are touched. Each `Mirror` text is quoted verbatim below, per the rule that the mirror instruction itself is the deliverable, followed by what this change specifically requires under it.

### CR-01 · Projection snapshot envelope

> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

**Under it, for this change.** The rookie path gains three additive `factors` keys — `draftCapitalStatus` (`'matched'|'undrafted'|'unknown'`), `rookieCalibrationMult` (number, 1.0 = no correction), `rookieCalibrationBasis` (string, `'none'|'undrafted:<POS>'|'day3:<POS>'`) — on the rookie path only. **The snapshot `schemaVersion` stays 3.** The entry enumerates four earlier keys as non-bumping rather than stating a general rule, so the basis for holding at 3 is the Invariant itself: these are additive `factors` keys, no top-level envelope field changes, no `inputStatus` label changes, and no v2 or v3 field changes. `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, `lib/grade.mjs`, `bin/import-snapshot.mjs`, `lib/snapshot-capture.mjs` and `resolveScoring` in `scripts/panel-run.mjs` all need no change to keep reading these snapshots.

**What does need attention on the data side is comparability, not shape.** From the first snapshot captured after this lands, rookie-path `projection.projectedPPG` is a different model: undrafted rookie-path rows are multiplied by 0.28–0.67 by position and drafted round-4-to-7 non-QB rows by 0.71–0.80, applied outside the `[0.45, 1.85]` `rookieMultiplierProduct` clamp (`rookieMultiplierProduct` itself is unchanged and stays comparable across the whole series). On `snapshots/2026-09-07.json` this moves 200 of 288 rookie-path rows. Any forward grading, optimism ratio or panel that spans the change date must **segment rookie-path rows on it** rather than pooling them; `rookieCalibrationMult != 1` is the mechanical marker for a row on the new model, and `rookieCalibrationBasis` names the cell it came from — including on the 20 `day3:QB` rows where the multiplier is 1.00 and the row is therefore on the old level by design. Veteran-path rows are untouched and need no segmentation.

### CR-15 · R3-FIT factor-multiplier mirror

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs:110` only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope.

**Under it, for this change.** `src/utils/seasonProjection.js` is a CR-15 app-side trigger and this change adds a rookie-path multiplier that `lib/projectionFactors.mjs`'s `reconstructRookieProjection` does not reproduce — the same reconstruction the constants were fitted through. To mirror: add `ROOKIE_CALIBRATION` (both tables, the group definitions, `DAY3_TIERS`) and the post-clamp application order to that function, and note that the app's `draftCapitalStatus` has three states where the panel's join has two — a panel re-run should map crosswalk `undrafted: true` to `'undrafted'` and a missing crosswalk entry to `'unknown'` (no discount), which is the app's own semantics and, on the panel population, changes nothing because 366 of 366 unmatched rows are crosswalk-`undrafted`. **The constants must not be re-fitted through a reconstruction that already applies them** — a re-fit is a fit of the *uncorrected* stack, so the calibration multiplier stays out of the predictor whenever the rookie panel is regenerated for fitting. Which positions each cell is gated to (`day3` excludes QB by shipping 1.00) is part of the mirror. Nothing app-side fails when this drifts.

### CR-18 · Signal registry rows (`docs/signal-registry.md`)

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change.  **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Under it, for this change.** The entry's `Direction` is data→app and the trigger fires mechanically because §4 edits three `docs/signal-registry.md` rows. No data-side field, stat key, source or coverage changes here, so nothing is owed back to the data repo under this entry beyond awareness: the app is adding a computed-factor row and amending two existing rows, none of which changes what the data repo ingests or how `data-catalog.md` describes it. The one substantive coupling to record is stated inside the amended crosswalk row itself (§4 item 3): the shipped constants are only valid while `bySleeper.undrafted` keeps its current derivation.

### Registry work this slice cannot do

- **The provenance dependency does not go into the registry body.** An earlier draft asked the data repo to record it in its own registry copy; that is wrong, because the entries live inside the `<!-- CR-REGISTRY-BEGIN -->` sentinels and are byte-identical across both repos, so a one-sided addition is precisely what the drift check reports. It goes to `.claude/tasks/data-repo-backlog.md` instead (§7 item 3), which is the sanctioned one-sided channel. **After this change the mirrored region is untouched and the drift check should return empty.**
- **Two stale app-side trigger lists were found and are not fixed here**, for the same sentinel reason — both are inside the mirrored region and therefore a both-repos, same-change edit: CR-06's `Triggers` omits `matchNflDraftToSleeper` in `src/utils/nflDraftMatch.js`, a live consumer that reads served pick fields by name (`fullName`/`college`/`position` at `:126-130`, `round`/`pick`/`team`/`age` at `:172-180`), and this slice treats its `positionsCompatible` hard-skip as load-bearing evidence; CR-01's `Triggers` names the `factors` shape only at its definition site, while `src/hooks/usePlayerProfile.js:179` and `src/components/market/Market.jsx:439-446` consume that shape too. Recorded in §7 item 4 for the next paired session.
- **No new registry entry is drafted, and this is a deliberate call.** The reviewer's reading is that committing a data-repo panel artifact as a fixture, with scoring constants fitted to it, is a brand-new coupling that routes to the Claude.ai project. It is not a *runtime* coupling: nothing is fetched, no served path is read, and the precedent for a committed copy of data-repo data used as a test oracle is `src/__fixtures__/season-totals-2025.json`, which is byte-identical to the data repo's served `nfl/season-totals/2025.json` and which no entry covers. The real dependency — the constants' validity resting on data-side derivations the app cannot see — is recorded as backlog (§7 item 3) and inside the amended crosswalk row. If Anton reads it the other way, the fix is one Claude.ai draft entry and this slice waits; §5.3's fixture is the only affected piece.

---

## 7. Data-repo asks — flagged, not planned

Per the slice constraint, these are stated and stopped at. All four belong in `.claude/tasks/data-repo-backlog.md` as part of the done-definition (item 7), with the commit that found them.

1. **Debut-season rookie panel** — *blocks the rookie ceiling, does not block this slice.* Every row of the current panel has outcome = predictor year + 1 for a player who already appeared in the predictor year (`lib/panel.mjs:1851-1905`), so it grades second seasons and never a debut season — which is the case the live app's rookie path mostly serves. A variant with predictor = draft year and outcome = the same season is the only instrument that can answer "never project a rookie above what a rookie has reached". Without it, Q2 stays deferred.
2. **Rookie-panel drop breakdown by tier and position** — *does not block, materially improves the next fit.* `assembleRookiePanel` records `drops: { noOutcome: 1507 }` as a single scalar (`lib/panel.mjs:1852`). 1,507 of 2,563 assembled rows are dropped by the `gp ≥ 6` outcome gate, and that gate is certainly not neutral across tiers — a day-3 or undrafted player failing to play six games is the modal outcome, and a QB cell like `day3:QB` (n=31, raw ratio 1.10) is survivor-selected in a way the current artifact cannot quantify. A per-tier × position drop count would tell us how much, and would either justify or retire the ≤1.00 clamp on that cell.
3. **Record the app's dependency on `bySleeper.undrafted`** — *does not block.* The shipped constants are fitted to the population that flag defines, currently derived as `draftRound === null` (`lib/nflverse.mjs:548`, with the 96.6% / 0.2% presence argument in its docstring and a `MAX_UNDRAFTED_RATE = 0.75` ceiling in `lib/validate.mjs`). If that derivation changes, or the ceiling starts firing, the app's constants are fitted to a population that no longer exists and this slice must be re-run. Note also that `bySleeper.draftPick` is the within-round pick while `draft_picks.json`'s `pick` is the overall selection — the two were compared during this slice and must never be joined on.
4. **Two stale CR trigger lists** (CR-06 and CR-01, detailed in §6) — *does not block.* Both are inside the mirrored region, so fixing them is a both-repos same-change edit that neither repo-scoped session can make alone.

---

## 8. Done-definition

Standard `CLAUDE.md` list. Specifically for this slice: `factorsSchema.test.js` (item 3, `seasonProjection.js` changed); no `statKeysContract.test.js` run needed (no new stat keys); a real smoke run reporting the four above-median counts from §5.5 (item 6); the CLAUDE.md byte ceiling re-checked after the two edits in §4; and all four §7 asks appended to `.claude/tasks/data-repo-backlog.md` (item 7).

## 9. Hand-back should report

The commit SHA or diff range; every file touched; the LOYO numbers the new test actually printed (not the ones quoted here); the §5.5 counts observed in the running app against the pinned table; the value of `projectedPPG` for the four named regression fixtures; and any deviation from the constants in §2.1(a), which must be none — a changed constant without a changed fixture is the one failure this slice's tests are built to catch.

---

## 10. Review pass — plan-reviewer flags and dispositions

Sixteen flags, 2026-09-07. Fourteen accepted and folded in above, two declined with reasons.

| flag | disposition |
|---|---|
| `currentSeason` is a comment placeholder, not an option — the slice adds two options | **Accepted.** §2.1(g) rewritten; App.jsx already passes the value at `:572` and it is currently discarded. |
| `[min…max]` window does not fail closed on a zero-pick year or an interior gap | **Accepted, and it was the most valuable flag.** §2.1(b) is now a set-membership test, §2.2 filters on `> 0` reusing `projectionSnapshot.js:187`'s own guard, and §5.2 gains the two regression cases. |
| corrected-row count not pinned; 93 vs 95 vs 22 unstated | **Accepted.** Recomputed under the shipped rule with real `years_exp`: 116 undrafted, 200 corrected, 1 wrongly discounted. §1(c) now carries the full composition and §5.5 is a pinned table. The overclaim about failing closed on "those" is gone. |
| fixture B's stated `ageMult` contradicts its numbers | **Accepted.** Altmyer's Sleeper record has `age: null`, so 0.95 comes from the `age ?? 23` default. Stated, and the fixture now deliberately exercises that default. |
| §5.3(4)'s headroom pair was measured on the shrunk fit, not the shipped protocol | **Accepted, and the assertion got stronger.** Under the shipped protocol the lift is 0.024 PPG *worse* (2.7155 → 2.7394), so the test asserts a sign, not a margin. |
| Q1(b) buckets sum to 363, not 366; experience proxy provenance unstated | **Accepted.** Provenance and the three excluded rows are now stated inline. |
| `day3:QB` would emit a discount line with no discount | **Accepted.** §2.1(f) gates both lines on `rookieCalibrationMult < 1`; §2.1(c) explains why `basis` still records the consulted cell; §5.2 adds the case. 20 live rows. |
| new signal-registry row classified Reconstructable when `years_exp` is current-value-only | **Accepted.** Reclassified as ephemeral-input/captured, following the `depthFactor` row at `:90`. |
| CR-15 is touched and unmirrored | **Accepted.** Mirror text quoted and a specific instruction added, including the trap that a re-fit must not run through a reconstruction that already applies the calibration. |
| CR-01's `Mirror` text not quoted; "CR-01's own rule" overgeneralised | **Accepted.** Quoted verbatim; the v3-holds argument now rests on the Invariant, not on a rule the entry does not state. |
| asking the data repo to edit its registry copy contradicts the byte-identical claim | **Accepted.** That ask is withdrawn; it is backlog item 3. |
| CR-18 fires on the three `docs/signal-registry.md` row edits | **Accepted.** Mirror text quoted, with a note that nothing is owed back under it beyond awareness. |
| new coupling: constants fitted to a data-repo artifact should route to the Claude.ai project | **Declined**, with the reasoning recorded in §6 so it is reviewable: no runtime coupling is created, and `season-totals-2025.json` is the standing precedent for a committed copy of data-repo data as a test oracle with no registry entry. The real dependency is recorded as backlog item 3 and in the amended crosswalk row. Reversible at the cost of one draft entry. |
| CR-06 `Triggers` omits `matchNflDraftToSleeper` | **Accepted as a finding, not fixed here** — inside the mirrored sentinels, so a both-repos edit. Backlog item 4. |
| CR-01 `Triggers` omits the two live `factors`-shape consumers | **Accepted as a finding, not fixed here** — same reason. Backlog item 4. |
| §4 omits `docs/navigation.md:124` and CLAUDE.md's fixtures row | **Accepted.** Both added, with the byte-ceiling check in §8. |

---

## Fix pass 1

implementation-reviewer on `f07d9be`, 2026-09-09. Seven flags. Five are real and specified below; two are declined at the end with reasons. Nothing outside this section changes — the build in `src/utils/seasonProjection.js`, `src/App.jsx` and `src/utils/nflDraftMatch.js` is correct as landed and must not be touched.

### 1 · The LOYO test is missing its mean-bias assertion

`src/__tests__/rookieCalibration.test.js` — `runLoyo` returns MAE only, so §5.3(3)'s required assertion ("assert the sign of mean bias flips from positive to near-zero-or-negative, +1.490 → −0.358") is absent. That assertion is not decoration: MAE alone cannot distinguish a correction that removes systematic over-projection from one that merely shrinks spread, and over-projection is the defect this slice exists to fix.

Add signed error to `runLoyo`'s accumulation (`predCorrected - r.o` and `r.pr - r.o`, note the sign convention is prediction minus outcome, the opposite order from the existing `Math.abs(r.o - pred)` lines) and return `biasCorrected` / `biasUncorrected`. Then assert, in the existing `describe('rookie calibration — LOYO out-of-sample gate (shipped, downward-only)')` block:

- `biasUncorrected` is greater than +1.0 (measured +1.490 — the shipped model over-projects the rookie path by about 1.5 PPG per row).
- `biasCorrected` is less than +0.2 and greater than −1.0 (measured −0.358).

Loose bounds, as §5.3(3) instructs. Do not assert exact floats.

### 2 · `factorsSchema.test.js`'s "unchanged" claim asserts nothing

`src/__tests__/factorsSchema.test.js`, in *rookie factors value types and enum constraints*: the comment reads "projectedPPG unchanged from the pre-calibration model on this fixture" and the assertion under it is `expect(r.projectedPPG).toBeGreaterThan(0)`, which would stay green if the calibration moved that fixture's projection. This is the fail-closed assertion for the whole `'unknown'` path, so it has to pin the value.

Replace it with the concrete pre-calibration number. `ROOKIE_OPTIONS` is a WR, `age: 22`, `years_exp: 0`, `ktcMap: null`, `collegeStats: null`, `nflDraftMatches: null` → `ageMult 1.05`, every other multiplier 1.0, `rookieMultiplierProduct 1.05`, so `projectedPPG = 7 × 1.05 = 7.35` → **7.4** as recorded. Assert `expect(r.projectedPPG).toBe(7.4)` and keep a one-line comment saying that this is the pre-calibration value and that `draftCapitalStatus: 'unknown'` is why it is unchanged.

### 3 · The accepted QB non-monotonicity is in no doc

§3(c)'s final paragraph requires it stated "in the docs so it is not read as a bug", and `docs/projection.md` → *Realisation calibration* does not carry it. Add a short paragraph after the *Known biases* list (before the early-round-lift paragraph at what is currently line 183):

> **One accepted non-monotonicity.** For QB, the effective multiplier for an undrafted player (0.67) sits **above** a 7th-rounder's (0.58 × 1.00). The panel says so, and rule 3 forbids inventing a smoother number: `r7:QB` is n=3, far below the n≥10 floor, so it takes no correction at all, while `undrafted:QB` (n=14) does. For RB, WR and TE the effective multiplier is monotone across all eleven draft states. This is a consequence of the minimum-n rule, not a modelling claim that being undrafted is better than being drafted in round 7.

### 4 · Reconcile the lift variant with the number the docs quote

The test's lift variant is real, not trivial — it refits `r1`/`day2` uncapped and lets n≥10 cells take their own >1 ratio — but it un-pins the ≤1.00 clamp for those two groups only, while §5.3(4)'s parenthetical ("the min-n rule with the ≤1.00 clamp lifted") also un-pins `day3:QB` (n=31, raw 1.10). That is why the test printed 2.7228 where §3(b) and `docs/projection.md` quote 2.7394. **The task file's parenthetical was the imprecise half, not the implementation** — the r1/day2-only variant is a better match for the section's stated purpose ("stop a later session completing the tier table"), and it stays as the primary assertion. The fix is to assert both variants and make the published numbers match what the test prints.

- Keep the existing `withLift = runLoyo({ liftGroups: new Set(['r1', 'day2']) })` case and its `maeWithLift >= maeDownwardOnly` assertion unchanged.
- Add a second variant that also un-pins `day3` — `runLoyo({ liftGroups: new Set(['r1', 'day2', 'day3']) })` — and assert its MAE is likewise `>= maeDownwardOnly`. This is the variant §3(b)'s 2.7394 was measured on, and it is the one that guards `day3:QB` against being lifted off 1.00 by a later session reading its raw 1.10 as an opportunity.
- Print both MAEs from the test run and write the two actual figures into `docs/projection.md`'s early-round-lift paragraph, replacing the single `2.7394` with both, each labelled by which groups it lifts. If the all-groups figure comes out materially different from 2.7394, report the number rather than adjusting the test to hit it — the assertion is on the sign for both variants, never on a float.

### 5 · The no-leakage case varies only one of the two options

`src/utils/seasonProjection.test.js`, *vet path ignores nflDraftYears/currentSeason for calibration purposes*: `makeVet` already defaults `currentSeason: 2025` (`src/__fixtures__/factories.js:264`), so `rWithout` and `rWith` differ only in `nflDraftYears` and the test's name overstates what it checks. Make `rWithout` pass `currentSeason: null` alongside no `nflDraftYears`, so the pair genuinely differs in both options, and keep every existing assertion. If `makeVet` cannot express a null `currentSeason` through `asOptions()`, spread the options object and delete the key rather than widening the factory.

### 6 · Backlog entries name no SHA

`.claude/tasks/data-repo-backlog.md` D-8 through D-11 record **Found:** "…this commit" where every prior entry names a SHA (D-5 `22ed5c1`, D-1 `855aded`, D-2 `fb8c2dd`). Replace the phrase "this commit" with `f07d9be` in all four, leaving the rest of each line — including the blocking status, which is correct on all four — untouched.

### Declined, with reasons — do not act on these

- **The commit message does not carry the Mirror text.** Not a defect. The convention places the Mirror text in the task file's `## Cross-repo impact` section as Session 1 output, and §6 carries all three entries verbatim, including CR-15's re-fit trap. A commit message is not the required channel and duplicating it there would create a second copy to drift.
- **`src/__fixtures__/factories.js` and the task file appearing in the diff.** Both in scope. The factories change is the `nflDraftYears` passthrough that §5.2's cases need, confined to that plus two comments; the task file was untracked before this commit.

### Done-definition for this fix pass

`npm test` green, `npm run lint` clean, `npm run build` clean. No smoke run needed — no change here touches `projectedPPG` for any player, and the build files are not modified. Hand back the fix commit SHA, the two lift-variant MAEs the test printed, and the mean-bias pair.
