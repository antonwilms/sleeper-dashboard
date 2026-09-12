# Rookie realisation ceiling (calibration arc, slice 3)

**Opened:** 2026-09-11, after the calibration-arc sign-off (`analysis/ranking-and-projection-review-2026-09-04.md` §9).
**Scope source:** §9.3 item 1 — *"Rookie ceiling — the founding concern."* This is the item the arc was opened to answer and did not.
**Evidence base:** `sleeper-dashboard-data` `grading/2026-09-11-rookie-verdict.md` and its artifact `backtests/2026-09-11-rookie-panel.json` → `debut.rows` (2,071 entrants across 13 entry classes 2013–2025, six-state outcome classification, row-level), re-read row-by-row in Session 1. Every number below was recomputed from that file, not quoted from the verdict.
**Live reference:** `snapshots/2026-09-10.json` (schemaVersion 3, 715 players, 291 rookie-path rows, carries slice 1 and predates slice 2), `raw/-players-nfl.json` (position and `years_exp`).
**Extends:** `.claude/tasks/rookie-calibration.md` (slice 1) and `.claude/tasks/rookie-availability.md` (slice 2). Their machinery — `resolveDraftCapitalStatus`, `ROOKIE_CALIBRATION`, `resolveRookieGames`, the `[0.45, 1.85]` product clamp — is reused unchanged, not replaced.

**Veteran path is untouched by this slice.** §8.1's stop stands: no veteran calibration constant, no shrinkage, no Step-4 edit, no factor pruning here.

**App-repo only.** The data-repo fit this slice needs already exists and is committed (`backtests/2026-09-11-rookie-panel.json`, verdict 2026-09-11). No data-repo change is required to ship. Three optional improvements are recorded in §7 and deliberately not planned.

**Review pass:** plan-reviewer run 2026-09-11; twenty flags, all accepted, all triaged in §10. Every number, line anchor and test specification below is **post-flag** — the body was corrected in place rather than annotated, so Session 2 reads a plan, not a plan plus errata.

---

## 0. The case, verified

Snapshot `2026-09-10`, player `13269` (2026 #1 overall pick, QB):

| field | value |
|---|---|
| `projectedPPG` | **24.1** |
| `nextSeasonRank` (positional, the app's own output) | **1 of 105 QBs** |
| rank among all 715 projected players (a Session-1 statistic, not an app output) | 2 |
| `rookieCalibrationMult` | **1.00** (`basis: 'none'`) |
| `rookieMultiplierProduct` | **1.85** — at the upper clamp |
| `ageDelta` / `ktcMult` / `collegeContribution` / `nflDraftMultiplier` | 1.05 / 1.162 / 1.25 / 1.30 → raw product 1.982, clamped to 1.85 |

`24.1 = ROOKIE_BASELINE_PPG.QB (13) × 1.85 × 1.00`.

**Be precise about which rank is which**, because the two are different quantities and only one is a program output. `App.jsx:616` sorts on `projectedPPG` **within a position** and writes `nextSeasonRank` (`:614-619`); that is what the UI shows, and by it a player who has never taken an NFL snap is currently the **#1 projected QB in the league**, ahead of every veteran. The "2 of 715" figure is a whole-population ordering computed in Session 1 over the snapshot for scale; the app never computes it. §5.5 pins the positional rank, and the reviewer's point that the overall rank is not an app output is why.

Slice 1 does not touch this row (r1 is uncorrected by design); slice 2 moves only `projectedTotalPts`. So neither shipped slice can reach it.

Against the debut panel, restricted to QB entrants who played at least 8 games (n=50, 13 classes):

| statistic | value |
|---|---|
| highest realised debut PPG, any games played | 24.84 (`sleeperId 4017`, 2017, **7 games**) |
| highest realised debut PPG at ≥8 games | 22.32 (`sleeperId 6797`, 2020, 15 games) |
| p99 | 21.90 |
| p95 | 19.05 |
| p90 | 17.80 |
| mean of the first-round QB cell (n=31 at ≥8 games) | **14.60** |
| p90 of that same first-round cell | 18.70 |

`13269` is projected **above every first-round rookie QB debut season in 13 years** and 65 % above that cell's mean. That is the founding concern, stated as a number.

---

## 1. The five questions, resolved

### Q1 · Ceiling form → **against realised rookie outcomes, per position. Not against the veteran projected distribution.**

Five reasons, in decreasing weight.

**a. It is the question that was asked.** §9.1's concern is *"no rookie QB has averaged 24 PPG"* — a claim about rookie outcomes. A veteran-relative rule answers a different question (*"may a rookie out-project an elite veteran?"*), which is a claim about the league, not about rookies, and which nobody has asserted is wrong.

**b. The veteran projections are themselves the known-biased quantity.** The review's own §2.2 finding is that the engine is *systematically optimistic* and that the factors make it worse, and §9.3 item 5 records the veteran calibration constant as **blocked with no route** until Jan–Feb 2027. Anchoring the rookie ceiling to the veteran distribution imports that uncorrected bias into the one path this arc has actually calibrated, and it does so silently — the rookie number would move whenever the veteran path is re-tuned, with no rookie-side diff. The realised-outcome ceiling is anchored to outcomes, which are not a model output.

**c. Yield and shape.** Measured on `2026-09-10`, the veteran rule binds on almost nothing and binds discontinuously:

| veteran rule | rows it binds on (of 291 rookie rows) |
|---|---|
| no rookie above the position's p95 veteran | **1** (QB `13269` only) |
| no rookie above the position's p90 veteran | **7** (QB 1, RB 3, WR 2, TE 1) |
| no rookie above the position's top projected veteran | **1** |

(§9.3 says eight at p90; recomputed here it is seven — `12518` at TE 8.3 sits just under the TE veteran p90 of 8.34. The discrepancy does not change the conclusion.)

**d. Stability and snapshot comparability.** A veteran-quantile ceiling is recomputed from the live population every render. It therefore moves when veteran inputs move for reasons that have nothing to do with the rookie: a KTC file that fails to load, a team-context change, a roster filter change. That is precisely this repo's recurring failure mode — §7.6 of the analysis records **three separate silent-neutral input defects**, each invisible until a snapshot audit. It also breaks CR-01 continuity: two snapshots a day apart would carry rookie projections scored against different ceilings with nothing in the envelope saying so. A per-position constant is stable, versionable, and capturable in `factors`.

**e. Architecture.** The realised-outcome ceiling is four numbers per position. It applies inside `rookieProjection`, which stays a pure per-player function. No population, no second pass, no new parameter, no memo change. This is the smallest change that can answer the question.

**Costing the veteran form honestly, as asked.** If it had won on (a)–(d), the cheapest correct implementation is **not** threading a population into `computeNextSeasonProjection`. That function is called once per player from the loop at `src/App.jsx:565`; the population is not known until the loop finishes, so threading it in requires a throwaway first projection pass purely to build the distribution — two full passes of the most expensive memo in the app (it is already `[perf][memo]`-instrumented at `:589`), plus an options key the veteran branch must ignore.

The **post-pass is genuinely cleaner, and cleaner than the brief assumes**: it belongs *inside* the existing `seasonProjections` memo, after the `for` loop and before the `return result`, not as a new memo downstream. At that point `result` already is the whole projected population, and every consumer — `playerRowsWithProj` (`:595`), `profileContextValue` (`:634`), the snapshot builder (`:674`), the two component props (`:1185`, `:1201`) — reads that one memo, so nothing downstream changes and there is no pipeline-ordering hazard at all. Its real cost is different and worth naming: the transform must rewrite `projectedPPG`, `projectedTotalPts`, four `factors` keys and `adjustmentSummary`, all of which are constructed inside `seasonProjection.js`. Doing that in `App.jsx` would put factor construction in two files and break the rule the snapshot contract leans on (CR-01 names *"the `factors` object shape in `src/utils/seasonProjection.js`"* as the trigger). The fix would be an exported pure `applyRookieCeiling(projectionsById, playersMap)` in `seasonProjection.js` that `App.jsx` merely calls. That is a real, buildable design — it is simply not needed, because the form that won needs none of it.

### Q2 · Survivorship in the ceiling itself → **the ceiling is defined on debut entrants who played ≥8 games, and the survivor gate is the *correct* conditioning here, not a bias. What it excludes is stated below.**

This is the question that sank `day3:QB` in slice 1, so it gets answered in full rather than waved at.

**Two different comparisons, with two different answers. State both; neither is a general property of quantiles.** An earlier draft of this section asserted that adding non-survivors back "lowers every quantile and leaves the maximum untouched", and generalised from it. That is true only of one of the two operations available here, and the plan's own gate table below contradicts the generalisation. The corrected pair:

**(i) Against the full entrant population, reading absence as 0 PPG — the gate is permissive.** This operation adds 706 zeros and nothing else above them, so it moves probability mass strictly below the tail and every upper quantile falls. Measured, all eight margins positive:

| position | p90 full (n=2,071) | p90 gated (gp≥8) | margin | p99 full | p99 gated | margin |
|---|---|---|---|---|---|---|
| QB | 14.08 | 17.80 | +3.72 | 21.10 | 21.90 | +0.80 |
| RB | 9.05 | 12.11 | +3.07 | 16.12 | 16.87 | +0.75 |
| WR | 7.03 | 9.87 | +2.84 | 12.87 | 14.38 | +1.51 |
| TE | 4.61 | 6.21 | +1.61 | 10.26 | 11.60 | +1.35 |

So the shipped constants are the **looser** of the two: this gate cannot manufacture a ceiling the record does not support. That is the claim slice 1's `day3:QB` failure mode calls for, and it holds.

**(ii) Against a looser games gate — the gate is restrictive at the very top, deliberately.** Loosening from `gp≥8` to `gp≥1` does *not* only add zeros; it adds 1–7-game rows carrying unstable rates, some of them very high. The QB maximum rises 22.32 → 24.84 and p99 rises 21.90 → 23.33 at `gp≥6`. Here the gate tightens the ceiling rather than loosening it, and the justification is the separate one below — a rate over fewer than eight games does not estimate a rate.

The two comparisons answer different questions and must not be collapsed into one sentence about "upper quantiles". (i) is the survivorship defence. (ii) is the small-sample defence. Both are needed; neither substitutes for the other.

**Why gate at all, then — and why ≥8.** Because `projectedPPG` is a **per-game rate**, and so is `outcomePPG`. A rate measured over one game is not an estimate of anything. The panel's own top-5 QB list contains two single-game seasons at 19.26 and 19.24 PPG, and the pooled maximum, 24.84, is a **7-game** season. Those rows inflate the upper tail with sampling noise, and they inflate it *upward*, which is the unsafe direction for a ceiling. `gp ≥ 8` is "at least half a season". Its own justification is that it is not load-bearing: the quantiles the mechanism actually uses barely move across the gate, while the maximum collapses.

| position | p90 at gp≥1 / ≥6 / ≥8 / ≥10 | p99 at gp≥1 / ≥6 / ≥8 / ≥10 | max at gp≥1 / ≥6 / ≥8 |
|---|---|---|---|
| QB | 17.66 / 17.75 / 17.80 / 18.27 | 22.28 / 23.33 / 21.90 / 21.98 | 24.84 / 24.84 / **22.32** |
| RB | 10.64 / 11.99 / 12.11 / 12.13 | 16.53 / 16.62 / 16.87 / 17.10 | 21.27 / 21.27 / 21.27 |
| WR | 8.39 / 9.59 / 9.87 / 10.34 | 14.11 / 14.32 / 14.38 / 14.44 | 20.71 / 20.71 / 20.71 |
| TE | 5.37 / 5.65 / 6.21 / 6.40 | 10.82 / 11.50 / 11.60 / 11.66 | 12.16 / 12.16 / 12.16 |

**This also rules the maximum out as the instrument, independently.** The pooled QB maximum is 24.84 and `13269` projects 24.1 — a max-based ceiling **would not fire on the row this slice exists to fix**. A single order statistic drawn from 13 classes is the noisiest available summary and is set, at QB, by a partial season. The mechanism must use a quantile.

**Population statement — say this verbatim in `docs/projection.md`.**

> The ceiling constants are quantiles of **realised debut-season PPG among rookie-path entrants who played at least 8 games in their entry season**, entry classes 2013–2025, half-PPR, from `backtests/2026-09-11-rookie-panel.json` `debut.rows` (2,071 entrants; 873 clear the gate — QB 50, RB 281, WR 366, TE 176).
>
> **It excludes** every entrant who played 0–7 games: **1,198 of 2,071 rows**, which decompose exactly as
>
> | excluded population | n |
> |---|---|
> | never appeared (`absentNoRosterFile` 115 + `absentOnRoster` 215 + `absentOffRoster` 105 + `rosteredZero` 271) | 706 |
> | played 1–5 games (`played1to5`) | 373 |
> | played 6–7 games (the part of `played6plus` below the gate: 992 − 873) | **119** |
> | **total excluded** | **1,198** |
>
> Those rows are excluded because a per-game rate over fewer than eight games does not estimate a per-game rate, **not** because their outcomes are uninteresting — they are exactly the population slice 1 and slice 2 exist to price, and they are priced there.
>
> **Relative to the full entrant population the exclusion is permissive, not restrictive.** Reading every absence as 0 PPG and recomputing over all 2,071 rows lowers p90 and p99 at all four positions (margins +3.72/+3.07/+2.84/+1.61 and +0.80/+0.75/+1.51/+1.35). The shipped constants are the looser of the two, deliberately. Relative to a *looser games gate* the comparison reverses, and that is the small-sample argument, not the survivorship one.

**What the panel still cannot tell us**, carried forward from the verdict's own §F: entrants are those nflverse has keyed to a Sleeper id, so the entrant floor sits above the outcome (uncorrelated with it, but these rows are not "every entrant"); 31 of the legacy rows resolve to a different position under crosswalk-only resolution; and 2025 is one class of 13, so the tail estimates carry real sampling error — quantified in Q5 rather than assumed away.

### Q3 · Hard clamp or soft compression → **soft compression. A monotone squash with a knee. Hard caps are rejected on ranking, and at three of four positions they are structurally inert.**

**The transform.** Per position, with knee `K` and asymptote `C` (`C > K`):

```
ceil(x) = x                                    when x ≤ K
ceil(x) = K + (C − K) · (1 − e^(−(x − K)/(C − K)))   when x > K
```

Properties, all verified in Session 1 and all assertable:
- **Strictly increasing** on all of `[0, ∞)`. Derivative is `1` at and below `K` and `e^(−(x−K)/(C−K)) > 0` above it. Checked on a 0.001 grid over `[0, 40]`: zero non-increasing steps.
- **Continuous and C¹ at the knee** — no kink at the join, so no visible discontinuity in a sorted board.
- **Identity below the knee.** 272 of 291 live rookie rows are provably untouched, bit for bit.
- **Never attains `C`.** `projectedPPG` is already clamped to `[0, 40]`, and `ceil(40)` is 21.88 / 16.86 / 14.37 / 11.59 against asymptotes 21.9 / 16.87 / 14.38 / 11.6. No row can land on the asymptote, so the asymptote itself can never become a tie value.

**Why not a hard cap — the ranking argument.** The panel's finding is that *the top of the rookie board is the part that works*: the top projected rookie historically finished 2nd of 7 at his position. Ordering is the signal, so the mechanism must not spend it. A hard cap does:

| hard cap at | live rookie rows pinned to the cap value (i.e. mutually tied) |
|---|---|
| realised p95 | QB 2, RB 3, WR 3, TE 1 — **9 rows collapsed into 4 ties** |
| realised p99 | QB 1, RB 0, WR 0, TE 0 |

At p95 the cap ties `13269` with `12508` at QB, and ties the top three RBs and the top three WRs with each other. It destroys the #1-versus-#2 distinction at every position — the exact information the panel says is worth keeping.

**Why not a hard cap — the inertness argument, which is the decisive one.** Pre-ceiling `projectedPPG` is already bounded by `baseline × 1.85 × 1.00`:

| position | maximum reachable pre-ceiling PPG | p99 asymptote | can a p99 hard cap ever fire? |
|---|---|---|---|
| QB | 24.05 | 21.90 | yes |
| RB | 16.65 | 16.87 | **no** |
| WR | 12.95 | 14.38 | **no** |
| TE | 9.25 | 11.60 | **no** |

The existing `[0.45, 1.85]` clamp already holds RB, WR and TE below any p99-level cap. A hard cap at a level the evidence supports is a **QB-only, one-row mechanism**. Dropping the cap to p95 to make it bite is what produces the ties above. The squash escapes this because its knee sits at p90, well inside the reachable range at all four positions, and its effect is graduated rather than all-or-nothing.

**Measured ordering result, live.** Applying the transform to all 291 rookie rows on `2026-09-10`, within each position, over every pair:

| position | n | inversions | pre-existing tied pairs | **new** tied pairs |
|---|---|---|---|---|
| QB | 47 | 0 | 25 | **0** |
| RB | 68 | 0 | 62 | **0** |
| WR | 119 | 0 | 231 | **0** |
| TE | 57 | 0 | 75 | **0** |

Zero inversions and zero new ties **after rounding to 1 dp**, which is the grain `projectedPPG` is emitted at. The pre-existing ties (e.g. two RBs both at 16.7, two WRs both at 13.0) are present before the mechanism and survive it unchanged; the mechanism neither creates nor resolves them. Note the limit honestly: strict monotonicity is a theorem about the real-valued transform, but `projectedPPG` is rounded to 1 dp, so two inputs within ~0.05 of each other *could* in principle round together. On the live population none do, and §5 pins that.

**Chosen constants.** `K` = the position's p90, `C` = its p99, both on the Q2 population:

| position | n (gp ≥ 8) | knee `K` (p90) | asymptote `C` (p99) |
|---|---|---|---|
| QB | 50 | **17.80** | **21.90** |
| RB | 281 | **12.11** | **16.87** |
| WR | 366 | **9.87** | **14.38** |
| TE | 176 | **6.21** | **11.60** |

**Quantile convention, pinned — this is part of the constants, not an implementation detail.** Zero-based rank with linear interpolation: sort ascending, take index `p · (n − 1)`, interpolate between the bracketing order statistics, round the result to 2 dp. At least three common conventions disagree at these sample sizes, and without pinning one the provenance test in §5.3 is the thing that gets edited green rather than the constants. Worked check: QB has n=50, so `0.99 × 49 = 48.51`, which interpolates 49 % of the way from 21.4600 to 22.3227 and gives **21.90**. Session 2 must use this convention and no other.

Read the pair as: *below the level nine in ten established rookies fail to reach, do nothing; above it, compress increasingly hard toward the level ninety-nine in a hundred fail to reach, and never arrive.*

**Live effect, `2026-09-10`** — 19 of 291 rows are above a knee; 17 change at 1 dp (`12501` WR 10.2→10.19 and `12522` QB 17.9→17.90 round back to themselves, and `rookieCeilingBasis` is how a reader still sees they fired):

| player | pos | tier | pre | post |
|---|---|---|---|---|
| `13269` | QB | top-3 | 24.1 | **21.0** |
| `12508` | QB | r1-late | 20.6 | 19.8 |
| `12527` | RB | top-8 | 16.7 | 15.1 |
| `13287` | RB | top-3 | 16.7 | 15.1 |
| `12507` | RB | r1-late | 15.4 | 14.5 |
| `12512` | RB | r2 | 14.0 | 13.7 |
| `13286` | RB | r1-late | 13.7 | 13.5 |
| `12526` | WR | top-8 | 13.0 | 12.1 |
| `13279` | WR | top-8 | 13.0 | 12.1 |
| `13281` | WR | top-8 | 12.5 | 11.9 |
| `13294` | WR | r1-late | 11.2 | 11.0 |
| `12519` | WR | r2 | 11.0 | 10.9 |
| `12514` | WR | r1-late | 10.9 | 10.8 |
| `12517` | TE | r1-mid | 9.3 | 8.6 |
| `12518` | TE | r1-mid | 8.3 | 7.9 |
| `12506` | TE | r3 | 7.3 | 7.2 |
| `13330` | TE | r1-late | 7.2 | 7.1 |

`13269`'s `nextSeasonRank` moves **1 → 8 among 105 QBs**: he stops being the league's top projected quarterback, and ten players across the population are now projected above him where one was. The QB gap between the top rookie and the second closes from 3.5 PPG to 1.2 PPG, which is the §9.1 complaint answered directly.

### Q4 · No double-counting with slice 1 → **the two mechanisms share no key, and on the live population they co-fire on zero rows. Three separate guarantees.**

**a. Different key sets — the structural guarantee, with the test that actually witnesses it.** Slice 1 is keyed on `(draftCapitalStatus, nflDraftTier) → group` **× position**, and is a multiplier applied to *every* row in a cell. The ceiling is keyed on **position alone** and is a transform of the *output level*. **The ceiling's key set contains no draft-group term**, so no re-fit of `ROOKIE_CEILING` can become an r1 or day-2 realisation constant — there is no cell in it to put one in.

The boundary is a property of the table's shape, but *nothing asserts that shape* unless a test varies draft group and holds everything else fixed: a `ROOKIE_CEILING` that silently grew a draft-group dimension would pass every other test in §5. §5.4 E is that test, and it is the one that makes this paragraph a claim about the code rather than about the prose.

**b. Measured non-overlap.** On `2026-09-10`, rows where slice 1's multiplier is below 1.00 **and** the ceiling fires: **0**. The populations are disjoint in practice because slice 1 discounts the bottom (undrafted and day-3) and the ceiling trims the top, and no live row is in both. This is a measurement, not an invariant — a day-3 QB with extreme KTC could in principle be in both — and the plan does **not** forbid it. Forbidding it would be a hidden third rule.

**c. Measured tier-neutrality.** If the ceiling were a backdoor realisation constant for r1/day2, it would move those groups' means the way a constant does. It does not:

| group | n | rows touched | mean `projectedPPG` pre → post |
|---|---|---|---|
| `undrafted` | 116 | 0 | 3.026 → 3.026 (**0.00 %**) |
| `day3` | 107 | 0 | 4.822 → 4.822 (**0.00 %**) |
| `day2` | 47 | 3 | 7.681 → 7.669 (−0.16 %) |
| `r1` | 20 | 16 | 13.400 → 12.792 (−4.54 %) |
| `unknown` | 1 | 0 | 10.700 → 10.700 (0.00 %) |

Two of the four groups are untouched to the last digit. The r1 movement is −4.5 %, produced by 16 rows moving by 16 *different* amounts between −0.1 and −3.1 — which is the signature of a level transform and not of a constant, since a constant moves every row in the cell by the same ratio. A test in §5 pins the two zero-effect groups.

**d. How a reader of `factors` tells them apart.** Four keys, and a single unambiguous rule per mechanism:

| the reader wants to know | the test |
|---|---|
| did slice 1's discount move this row? | `rookieCalibrationMult < 1` |
| which slice-1 cell was consulted? | `rookieCalibrationBasis` (`'undrafted:WR'` / `'day3:RB'` / `'none'`) |
| **did the ceiling move this row?** | **`rookieCeilingBasis !== 'none'`** |
| **by how much?** | **`rookieCeilingPPGPre − projectedPPG`** |
| **against which constants?** | **`rookieCeilingKnee`, `rookieCeilingAsymptote`** |

`rookieCeilingBasis` is the authoritative firing signal, not the difference between the two PPG numbers: for a row just above the knee the compression is smaller than the 1 dp emission grain, so the two numbers can print the same while the mechanism did fire (`12501` and `12522` live). This mirrors slice 1's own precedent, where `rookieCalibrationBasis` records the cell consulted rather than whether the number moved.

Capturing `rookieCeilingKnee` / `rookieCeilingAsymptote` on every rookie row (not only firing ones) is deliberate and is what §9.3 item 2's anchor-policy work needs: it lets the grading side segment a captured snapshot series by ceiling version **from the row itself**, without a date-to-model-version lookup table. That is the failure the arc already paid for once on the veteran side.

### Q5 · Validation → **yes, it needs its own out-of-sample check, and the distributional claim is *not* self-evidencing. Leave-one-class-year-out, run in Session 1 and committed as a test.**

The existing verdict does **not** discharge this gate. `grading/2026-09-11-rookie-verdict.md` publishes the debut panel's composition and its own §E residual finding; it publishes no quantile, no ceiling, and no out-of-sample test of one. Its §F explicitly reserves *"no fitted constant, no ceiling, no cap"* as out of that slice. The gate is this slice's to clear.

**Why the claim is not self-evidencing.** "p90 of a sample is the 90th percentile of that sample" is a tautology. The *shipped* claim is different and is an extrapolation: *the 2026 class's debut outcomes will exceed `C` about one time in a hundred*. Eight hundred and seventy-three rows across 13 classes is a small sample in the tail — the QB cell has fifty. If the true exceedance rate at a fitted p99 is four percent rather than one, the asymptote is too tight and the mechanism is over-trimming the top. That is testable, and untested it is an assumption.

**The check Session 1 ran.** Leave-one-class-year-out: hold out one entry class (2013…2025, 13 folds), refit `K` and `C` per position on the other twelve, then measure what fraction of the held-out class's rows exceed each. If the quantiles generalise, held-out exceedance tracks nominal.

| parameterisation | held-out n | above knee (nominal) | above asymptote (nominal) |
|---|---|---|---|
| **K=p90, C=p99 (shipped)** | 873 | **10.19 %** (10 %) | **1.60 %** (1 %) |
| K=p75, C=p95 | 873 | 25.32 % (25 %) | 5.27 % (5 %) |
| K=p90, C=p95 | 873 | 10.19 % (10 %) | 5.27 % (5 %) |

The shipped pair generalises: the knee is calibrated to within 0.2 pp. The asymptote's 1.60 % against a 1 % nominal is a **real, disclosable** finding — the fitted p99 is slightly tighter than the true 99th percentile, i.e. the mechanism trims marginally harder at the very top than the label implies. It ships anyway, for two stated reasons: 1.6 % versus 1 % on n=873 is well inside what 13 classes resolve, and the asymptote is never attained (Q3), so the error is an error in a bound that is approached, not applied.

**Fold-to-fold stability, disclosed rather than smoothed:**

| position | knee across 13 folds | asymptote across 13 folds |
|---|---|---|
| QB | 17.66 – 18.06 | **20.50 – 21.95** |
| RB | 11.99 – 12.20 | 16.00 – 17.05 |
| WR | 9.66 – 10.26 | 14.24 – 14.42 |
| TE | 5.66 – 6.45 | **10.70 – 11.65** |

Knees are tight everywhere. The QB and TE **asymptotes** are the loose estimates (spans of 1.45 and 0.95 PPG), which is the direct consequence of n=50 and n=176. Record this in `docs/projection.md`: the QB asymptote in particular is a thin estimate, and a future class can move it.

**Full-pool exceedance of the shipped asymptote**, for the doc: QB 1 season of 50 (`6797`/2020/22.3), RB 3 of 281, WR 4 of 366, TE 2 of 176. Ten realised debut seasons in 13 years sit above their position's asymptote — which is what a p99 should look like, and is the concrete form of the sentence "a level a rookie essentially does not reach."

**A ranking check is *not* needed as a fitted gate**, and the plan says so rather than adding a ceremonial test. A strictly increasing transform preserves Spearman correlation exactly; there is nothing to measure. What §5 pins instead is the thing that is *not* a theorem: that the implementation is actually monotone, and that 1 dp rounding does not collapse the live top five.

---

## 2. What changes

App-side, one source file plus tests, docs and one fixture. `src/App.jsx` is **not** modified — see §2.2.

### 2.1 `src/utils/seasonProjection.js`

**a. New module constant, beside `ROOKIE_CALIBRATION` (`:34`) and the slice-2 games tables.**

```js
// Rookie realisation ceiling (calibration arc slice 3).
// Quantiles of realised DEBUT-season PPG among rookie-path entrants who played
// >= 8 games in their entry season, entry classes 2013-2025, half-PPR, from
// sleeper-dashboard-data backtests/2026-09-11-rookie-panel.json debut.rows
// (2,071 entrants; 873 clear the gate). knee = p90, asymptote = p99.
// Keyed on POSITION ONLY and never on draft group — that is what keeps this
// mechanism structurally distinct from ROOKIE_CALIBRATION above rather than a
// backdoor r1/day2 realisation constant. See docs/projection.md -> Rookie path
// -> Realisation ceiling for the population statement, the exclusions, and the
// leave-one-class-year-out result.
const ROOKIE_CEILING = {
  QB: { knee: 17.80, asymptote: 21.90 },   // n=50
  RB: { knee: 12.11, asymptote: 16.87 },   // n=281
  WR: { knee:  9.87, asymptote: 14.38 },   // n=366
  TE: { knee:  6.21, asymptote: 11.60 },   // n=176
}
```

**b. New pure helper, exported for direct test:**

```js
export function applyRookieCeiling({ position, projectedPPG })
// -> { ceiledPPG, rookieCeilingBasis, rookieCeilingKnee, rookieCeilingAsymptote }
```

- No entry for `position` (defensive; `SKILL` already gates the caller) → return the input unchanged, `basis: 'none'`, knee and asymptote `null`. **Fail closed to no ceiling.**
- Non-finite or negative `projectedPPG` → unchanged, `basis: 'none'`, but knee and asymptote still reported for the position. (The non-finite firewall documented at `docs/projection.md` → *Non-finite input firewall (D1-B)* is upstream of this; this is belt-and-braces.)
- `projectedPPG <= knee` → unchanged, `basis: 'none'`, knee and asymptote reported.
- `projectedPPG > knee` → `knee + (asymptote − knee) * (1 − Math.exp(−(projectedPPG − knee) / (asymptote − knee)))`, `basis: \`ceiling:${position}\``.

Knee and asymptote are returned on **every** skill-position call, firing or not, for the Q4(d) anchor-policy reason. `basis` alone distinguishes fired from not-fired.

**c. In `rookieProjection` (`:273`)** — no signature change. The slice-1 calibration call is at `:379-380` and the `projectedPPG` assignment it feeds is at `:382`. Rename that assignment to `projectedPPGPre` and insert the ceiling between it and the slice-2 games block (`:389-391`), so the total-points identity `PPG × games` holds against the **post**-ceiling PPG:

```js
const projectedPPGPre = clamp(baseline * rookieMultiplierProduct * rookieCalibrationMult, 0, 40)

// ── Rookie realisation ceiling (calibration arc slice 3) ────────────────
// Applied LAST, on the finished level, after slice 1's cell multiplier.
// Monotone: strictly increasing, identity at or below the knee, asymptotic to
// (but never equal to) the ceiling. A hard cap was rejected — it ties the top
// rookies at a position, and at RB/WR/TE the [0.45, 1.85] product clamp
// already holds projectedPPG below any evidence-supported cap, making a cap a
// QB-only no-op. See .claude/tasks/rookie-ceiling.md Q3.
const { ceiledPPG, rookieCeilingBasis, rookieCeilingKnee, rookieCeilingAsymptote } =
  applyRookieCeiling({ position, projectedPPG: projectedPPGPre })
const projectedPPG = ceiledPPG
```

`projectedTotalPts` at `:391` is unchanged in form and now derives from the ceiled PPG — so the ceiling reaches **both** the positional `nextSeasonRank` (sorted on `projectedPPG` at `App.jsx:616`) and the total-points column.

**`:391` multiplies the UNROUNDED PPG.** `projectedTotalPts = Math.round(projectedPPG * projectedGames * 10) / 10` takes the raw `clamp(...)` result, while the returned `projectedPPG` is separately rounded to 1 dp. Keep that asymmetry exactly as it is — `factorsSchema.test.js:318-320` documents the same trap for a vet row — and compute every expected total in §5 from the unrounded value. For `13269` that is `round(21.007209 × 12 × 10) / 10 = 252.1`, **not** `21.0 × 12 = 252.0`.

**d. Four new `factors` keys** (rookie path only — do **not** add to `VET_FACTORS_KEYS`):

| key | type | value |
|---|---|---|
| `rookieCeilingBasis` | string | `` `ceiling:${position}` `` when it fired, else `'none'` |
| `rookieCeilingKnee` | number \| null | the position's knee; `null` only for an unrecognised position |
| `rookieCeilingAsymptote` | number \| null | the position's asymptote; `null` only for an unrecognised position |
| `rookieCeilingPPGPre` | number | pre-ceiling `projectedPPG`, rounded to **3 dp** |

`rookieCeilingPPGPre` is at 3 dp, not the 1 dp of `projectedPPG`, deliberately: at 1 dp a sub-0.05 compression is invisible, and two live rows on `2026-09-10` are in exactly that band. Matches the 3 dp convention already used for `rookieMultiplierProduct`, `collegeMult` and `collegeContribution`.

**e. One new `adjustmentSummary` line**, gated on the basis string (unlike slice 1's, which is gated on the multiplier — because here the basis *is* the firing signal and a sub-0.05 move is still a real firing):

- `rookieCeilingBasis !== 'none'` → `'Above the historical rookie ceiling ↓'`

This moves `projectedPPG`, so a line is correct; the no-summary rule applies only to capture-only factors.

### 2.2 `src/App.jsx` — **no change, and that is the point**

The ceiling is a per-position constant, so `rookieProjection` needs no population and `computeNextSeasonProjection` needs no new option. The `seasonProjections` memo (`:552-591`), its 15-entry dependency array, `playerRowsWithProj` (`:595`) and the `nextSeasonRank` sort (`:614`) are all untouched; they pick the new values up because they already read the projection objects. Session 2 must not add a second pass, a new memo, or a population parameter. If a diff to `App.jsx` appears in this slice, something has gone wrong.

### 2.3 New fixture — `src/__fixtures__/rookie-debut-panel-2026-09-11.json`

A trimmed copy of `backtests/2026-09-11-rookie-panel.json` `debut.rows`, committed so the constants cannot drift from their evidence and so no test reads the sibling tree (same precedent as `rookie-panel-2026-09-06.json` and `rookie-games-panel-2026-09-09.json`).

Shape — `{ source, rows }`, with `source` naming the artifact **and the data-repo commit SHA**, and each row trimmed to exactly:

```json
{ "p": "QB", "g": "r1", "y": 2024, "c": "played6plus", "gp": 17, "o": 21.46 }
```

`p` position · `g` draftGroup · `y` targetSeason · `c` outcomeClass (the six-state label) · `gp` outcomeGames · `o` outcomePPG (`null` when `gp` is 0). All 2,071 rows, not only the 873 that clear the gate — the excluded rows are what makes the Q2 survivorship claim checkable in-repo rather than merely asserted. Measured size at 4 dp on `o`: ~143 KB, comparable to the 204 KB slice-2 fixture.

---

## 3. Deliberately not in this slice

Each considered and rejected with a reason, so Session 2 does not reopen them:

1. **Any veteran-path change.** §8.1's stop.
2. **Any veteran-relative ceiling, and any population-aware projection pass.** Q1. If a later slice revives it, Q1's costing says where it goes.
3. **Any change to `[0.45, 1.85]`, to `ROOKIE_BASELINE_PPG`, or to the `nflDraftMultiplier` tier table.** The ceiling sits downstream of all three; re-tuning them here would confound this slice's effect with theirs and invalidate every captured `rookieMultiplierProduct`.
4. **Any change to `ROOKIE_CALIBRATION` or `resolveRookieGames`.** Slices 1 and 2 ship as they are. In particular, do **not** revisit `day3:QB` here — its resolution is a slice-1 question and this panel does not change it.
5. **A floor.** The mechanism is one-sided by construction. A rookie *floor* is a different claim needing a different fit, and slice 1 already prices the bottom by tier.
6. **Group-keyed or tier-keyed ceiling cells.** Q4(a): adding a draft-group term is precisely what would turn this into a backdoor r1/day2 realisation constant. The key set is position-only on purpose.
7. **Re-fitting `C` to hit exactly 1 % held-out exceedance.** The 1.60 % measurement is disclosed, not tuned away. Fitting a constant to its own validation statistic is how the out-of-sample gate stops meaning anything.
8. **Applying the ceiling only to `years_exp ≤ 1` rows.** The debut panel is a debut population, and a rookie-path row with `years_exp ≥ 2` is not a debut. It takes the ceiling anyway: such a row is a player entering a season with **no qualifying NFL production at all**, for whom the debut distribution's upper quantiles are, if anything, generous — so applying them is permissive, never tight. One such live row exists (`projectedPPG` 10.7, `draftCapitalStatus: 'unknown'`); the ceiling does not fire on it. State this in the docs rather than adding a branch.

---

## 4. Docs/README updates

**`docs/projection.md`:**

1. **Rookie path → the formula block (`:99`).** Extend to the full chain:
   `projectedPPG = ceil_pos( ROOKIE_BASELINE_PPG[pos] × clamp(ageMult × ktcMult × collegeContribution × nflDraftMultiplier, 0.45, 1.85) × rookieCalibrationMult )`, with one sentence that `ceil_pos` is the monotone ceiling below and that it is applied last, on the finished level.
2. **Delete the deferral paragraph at `:145`** — *"A rookie realisation ceiling … is explicitly deferred"* — and replace it with a pointer to the new section plus one line saying the deferral's stated blocker (the panel graded only second seasons) was cleared by the 2026-09-11 debut panel.
3. **New section, `### Realisation ceiling (calibration arc slice 3)`**, placed after *Realisation calibration* (`:199`) so the doc reads in slice order. It must carry, at minimum: the transform and its four properties; the constants table with per-position n; **Q2's population statement verbatim**, including the exclusion counts and the sentence that the exclusion is permissive rather than restrictive; the Q3 hard-cap rejection with the inertness table; the Q5 leave-one-class-year-out numbers **including the 1.60 %-against-1 % disclosure and the QB/TE asymptote fold spans**; the §3.8 note on `years_exp ≥ 2` rookie-path rows; and the live effect on `13269` as the worked example.
4. **Adjustment summary (`:239`)** — add the new line.
5. **Projected games (`:147`)** — one sentence noting `projectedTotalPts` now derives from the ceiled PPG, so the games ladder and the ceiling compose rather than competing.

**`docs/signal-registry.md`:**

6. **New row** after the *Rookie availability* row (`:103`), for `rookieCeilingBasis` / `rookieCeilingKnee` / `rookieCeilingAsymptote` / `rookieCeilingPPGPre`. Classification: **Reconstructable** — every input is either a permanent record (position) or already captured (`rookieCeilingPPGPre`), with no current-value Sleeper field anywhere in the chain. State the claim **narrowly**: this is the first *calibration-arc* rookie factor that is reconstructable without a captured-envelope caveat. It is **not** the first reconstructable rookie-path factor — `:100` (rookie college contribution), `:105` (rookie-path aDOT) and `:108` (rookie `breakoutAgeFactor`) already carry a plain "Reconstructable", and an earlier draft of this plan overclaimed here. The reason is worth one clause: `draftCapitalStatus` depends on `years_exp`, and this key set does not. Effect: **active → `projectedPPG` and `projectedTotalPts`** (rookie path) — contrast it explicitly with the availability row above, which is `projectedTotalPts`-only, since that distinction is the reason this slice exists.
7. **Amend the *Rookie realisation calibration* row (`:102`)** with one clause recording that a second, structurally distinct rookie mechanism now also moves `projectedPPG`, keyed on position alone, and that `rookieCalibrationMult < 1` versus `rookieCeilingBasis !== 'none'` are the two firing tests a grader must keep apart.

**`docs/navigation.md`:**

8. **`:124`'s `seasonProjection.js` row** enumerates the module's exports and already names `resolveDraftCapitalStatus`/`resolveRookieCalibration` (slice 1) and `resolveRookieGames` (slice 2) explicitly. Add `applyRookieCeiling` in the same form, with its one-line description and the `docs/projection.md → Rookie path → Realisation ceiling` pointer.

**`CLAUDE.md`** — required by its own *Self-maintenance* rule, which says CLAUDE.md is updated in the same change that alters what it asserts:

9. **`:95` → Invariants → *Factors contract*** states "73 vet keys / **55** rookie keys". Update to **59** rookie keys. Leave the vet count alone — it not changing is the veteran-untouched guard.
10. **`:54` → the `src/__fixtures__/` row** enumerates the three existing fixtures by name and role. Add `rookie-debut-panel-2026-09-11.json` — the rookie ceiling constants' provenance oracle.

**`docs/cross-repo-registry.md`:**

11. **CR-15's App-side field is stale and this slice makes it more so.** It describes `src/utils/seasonProjection.js` only in veteran terms ("qualifying-season builder, rookie-vs-veteran routing, basePPG per-length weight table, label→factor maps, forward-mover neutralization, `combinedNewFactorRaw` membership and its `[0.67, 1.50]` clamp") and names **no** rookie-path constant — yet live source already carries `ROOKIE_BASELINE_PPG:23`, the `[0.45, 1.85]` rookie clamp `:369`, `ROOKIE_CALIBRATION:34` + `resolveRookieCalibration:199` (slice 1, shipped) and the five `ROOKIE_GAMES_*` tables `:49-112` + `resolveRookieGames:219` (slice 2, shipped). The module-level Triggers line does cover the file, so nothing is *broken*; the harm is that the data repo's reviewer reads this prose as far-side authority for what `reconstructShippedRookieProjection` must mirror. Extend the App-side field to name all three rookie mechanisms plus this slice's, marked `[registry-stale]` inline, following the correction convention CR-02's own entry uses.

**`README.md`:** no change — it does not enumerate projection factors.

---

## 5. Tests to add

### 5.1 `src/__tests__/factorsSchema.test.js` (update — required by the Factors contract invariant)

- Add `'rookieCeilingBasis'`, `'rookieCeilingKnee'`, `'rookieCeilingAsymptote'`, `'rookieCeilingPPGPre'` to `ROOKIE_FACTORS_KEYS`, under a `// Calibration arc slice 3 — rookie realisation ceiling (4):` comment.
- **Do not** add them to `VET_FACTORS_KEYS`.
- Update the rookie count **55 → 59** in three places, not one: the derivation comment at **`:73-74`** (`"…+ 1 availability (arc slice 2) + 3 teamChangeFactors = 55 total"`), the file-header canonical-count note at **`:18`**, and the `it(...)` title. `:76` is the D1-keys NOTE and carries no count — an earlier draft of this plan cited it in error.
- Add a slice-3 line to the header NOTE block (`:16-24`) and to the `:78` "rookie-path only — do NOT add to VET_FACTORS_KEYS" note, matching the slices-1 and -2 lines already there.
- The vet-path assertions must stay byte-identical and must still pass — that is the veteran-untouched guard.

### 5.2 `src/utils/seasonProjection.test.js` (new cases, after the slice-2 cases)

Direct unit tests of the exported `applyRookieCeiling`. Inputs are explicit, no fixture.

| # | input | expected |
|---|---|---|
| a | `{ position: 'QB', projectedPPG: 10 }` | `ceiledPPG` exactly `10`; `basis 'none'`; `knee 17.8`; `asymptote 21.9` |
| b | `{ position: 'QB', projectedPPG: 17.8 }` | exactly `17.8`; `basis 'none'` — **the knee is inclusive-below** |
| c | `{ position: 'QB', projectedPPG: 24.05 }` | `21.007` ±0.001; `basis 'ceiling:QB'` |
| d | `{ position: 'RB', projectedPPG: 16.65 }` | `15.036` ±0.001; `basis 'ceiling:RB'` |
| e | `{ position: 'WR', projectedPPG: 12.95 }` | `12.102` ±0.001; `basis 'ceiling:WR'` |
| f | `{ position: 'TE', projectedPPG: 9.25 }` | `8.533` ±0.001; `basis 'ceiling:TE'` |
| g | `{ position: 'K', projectedPPG: 30 }` | unchanged `30`; `basis 'none'`; `knee null`; `asymptote null` — **fails closed** |
| h | `{ position: 'QB', projectedPPG: 0 }` | `0`; `basis 'none'` |
| i | `{ position: 'QB', projectedPPG: 40 }` (the upper clamp) | `21.8818` ±0.0001, and **strictly less than `21.9`** — the asymptote is unattainable in the reachable domain |
| j | `{ position: 'WR', projectedPPG: NaN }` | `NaN` passed through unchanged, `basis 'none'`, no throw |

Plus two structural cases:

- **k · monotonicity.** For each of the four positions, walk `x` from 0 to 40 in steps of 0.01 and assert `applyRookieCeiling(x + 0.01) > applyRookieCeiling(x)` at every step. Zero exceptions. This is the property the whole ranking argument rests on, and it is the one thing in Q3 that is an implementation claim rather than a theorem.
- **l · identity below every knee.** For `x` from 0 to 6.21 in steps of 0.01, assert the output is `=== x` at all four positions — bitwise identity, not a tolerance. Guards against a refactor that routes every row through the exponential.

And one integration case through `computeNextSeasonProjection`, built the way slice 1's §5.4 cases are: a QB with `years_exp: 0`, empty `careerStats`, and factor inputs chosen so `rookieMultiplierProductRaw` exceeds 1.85 and clamps. Assert `factors.rookieMultiplierProduct === 1.85`, `factors.rookieCalibrationMult === 1`, `factors.rookieCeilingPPGPre === 24.05`, `projectedPPG === 21.0`, `factors.rookieCeilingBasis === 'ceiling:QB'`, and `adjustmentSummary` contains `'Above the historical rookie ceiling ↓'`.

**Quantile helper.** §5.3 needs a percentile function, and it must implement the §1 Q3 convention (zero-based index `p · (n − 1)`, linear interpolation). Write it once in the new test file. Do **not** reach for a library or a different convention — the constants were fitted under this one, and a mismatch surfaces as a provenance failure that looks like a bad constant.

### 5.3 `src/__tests__/rookieCeiling.test.js` (new file) — provenance and the out-of-sample gate

Same three-concern structure as `rookieCalibration.test.js`. Reads only `src/__fixtures__/rookie-debut-panel-2026-09-11.json`; never the sibling repo.

**Fixture integrity.**
- 2,071 rows.
- Position counts: QB 218, RB 582, WR 874, TE 397.
- Six-state `c` counts: `played6plus` 992, `played1to5` 373, `rosteredZero` 271, `absentOnRoster` 215, `absentNoRosterFile` 115, `absentOffRoster` 105 (sums to 2,071).
- Target seasons are exactly 2013–2025, 13 distinct values, none empty.
- Consistency: **zero** rows with `gp > 0` and `o === null`, and **zero** rows with `gp === 0` and `o !== null`. (Both hold in the source; they are what makes the gate arithmetic well-defined.)
- `source` is a non-empty string naming the artifact and containing a 40-character data-repo SHA.

**Provenance — the eight constants re-derived, not asserted.** For each position, filter the fixture to `gp >= 8 && o != null`, assert the n (QB 50, RB 281, WR 366, TE 176), compute p90 and p99 **using the §1 Q3 convention** (zero-based index `p · (n − 1)`, linear interpolation), round to 2 dp, and assert they equal the shipped values — read back through `applyRookieCeiling`'s returned `knee`/`asymptote`, not by importing the table, so a table edit that bypasses the resolver still fails. **This is the test that makes the constants undriftable**, and it must cover all eight numbers. Include the QB p99 worked check from §1 Q3 as a comment so a future reader can tell a convention mismatch from a bad constant.

**Q2 survivorship — the exclusion is permissive.** For each position, compute p90 and p99 over the **full 2,071-row** population with absence read as 0 PPG, and assert each is **strictly below** the shipped gated value. Expected values, so Session 2 can distinguish a real failure from a convention mismatch:

| position | full p90 | full p99 | margin below gated p90 | margin below gated p99 |
|---|---|---|---|---|
| QB | 14.08 | 21.10 | 3.72 | **0.80** |
| RB | 9.05 | 16.12 | 3.07 | **0.75** |
| WR | 7.03 | 12.87 | 2.84 | 1.51 |
| TE | 4.61 | 10.26 | 1.61 | 1.35 |

The p99 margins at QB and RB are under one PPG — not comfortable — so assert the *values* to 2 dp as well as the inequality. A failure on the inequality alone would be ambiguous between a genuine violation and a quantile-convention slip. This pins the direction-of-bias argument as a fact about the fixture rather than a claim in prose, and it is the check that would have caught the `day3:QB` reasoning error had it been written for slice 1.

**Q2 gate insensitivity.** Recompute p90 at `gp >= 6` and `gp >= 10` and assert each is within **0.75** PPG of the shipped `gp >= 8` value at every position. Observed margins — the band was widened from an earlier draft's 0.60 precisely because TE consumed 93 % of it:

| position | p90 at gp≥6 | p90 at gp≥8 | p90 at gp≥10 | max \|Δ\| from the shipped value |
|---|---|---|---|---|
| QB | 17.75 | 17.80 | 18.27 | 0.467 |
| RB | 11.99 | 12.11 | 12.13 | 0.127 |
| WR | 9.59 | 9.87 | 10.34 | 0.468 |
| TE | 5.65 | 6.21 | 6.40 | **0.560** |

Asserts the gate choice is not load-bearing; fails loudly if a future refit makes it so. Do **not** assert the same for the maximum — the point of the Q2(ii) argument is that the maximum *does* move.

**Q5 out-of-sample gate — leave-one-class-year-out.** A from-scratch reimplementation over the fixture: for each of the 13 target seasons, refit p90/p99 per position on the other twelve and measure held-out exceedance. Assert:
- held-out above-knee rate in `[0.085, 0.120]` (observed 0.1019, nominal 0.10);
- held-out above-asymptote rate in `[0.005, 0.030]` (observed 0.0160, nominal 0.01) — the band is deliberately wide enough to admit the disclosed 1.60 % and narrow enough to fail if a refit pushes the asymptote to a p95-like 5 %;
- every fold produces a finite knee and asymptote at every position, with `asymptote > knee` in all 52 fold-position pairs.

**Q3 hard-cap rejection, pinned so a later session cannot quietly switch instruments.** From the fixture, derive each position's p99, and assert that `baseline × 1.85` (13/9/7/5 × 1.85) is **below** it for RB, WR and TE and **above** it for QB. That is the inertness finding, re-derived rather than quoted, and it is the reason a hard cap is not a live option.

### 5.4 Named live-row regression fixtures (in `src/__tests__/rookieCeiling.test.js`)

Built the way slice 1's §5.4 and slice 2's §5.4 cases are: synthesise the inputs so the assertion is exact and deterministic, and cite the live player and snapshot date in a comment rather than depending on snapshot values at runtime.

- **A · `13269`, the founding case — the required regression pin.** QB, `years_exp: 0`, empty `careerStats`, inputs set so the product clamps to 1.85 and `rookieCalibrationMult` is 1.00 (top-3 tier, `draftCapitalStatus: 'matched'`). Assert, through `computeNextSeasonProjection`: `projectedPPG === 21.0` (was 24.1), `factors.rookieCeilingPPGPre === 24.05`, `factors.rookieCeilingBasis === 'ceiling:QB'`, `factors.rookieCeilingKnee === 17.8`, `factors.rookieCeilingAsymptote === 21.9`, `factors.rookieCalibrationMult === 1` and `factors.rookieCalibrationBasis === 'none'` (the ceiling did this, slice 1 did not), `projectedGames === 12` (slice 2's `gpe:r1|QB|0`, unchanged), and **`projectedTotalPts === 252.1`**. That last figure is `round(21.007209 × 12 × 10) / 10` — computed from the **unrounded** ceiled PPG, per §2.1(c). Writing it as `21.0 × 12` gives 252.0 and is wrong. Comment must name the snapshot (`2026-09-10`) and the observed pre-value (24.1, the #1 projected QB of 105).
- **B · ordering among the top five at a position survives — the required ordering assertion.** Two halves, and **every input is pinned** — an unpinned "five spanning values" is not a property of the transform, since near the clamp maximum the derivative falls to ~0.57 at TE and two inputs 0.1 apart can compress below the 1 dp grain.
  - **Constructed half**, exact inputs and expected outputs:

    | position | pinned inputs | expected outputs (1 dp) |
    |---|---|---|
    | QB | `[16.80, 17.80, 19.86, 21.93, 24.05]` | `[16.8, 17.8, 19.4, 20.4, 21.0]` |
    | RB | `[11.11, 12.11, 13.61, 15.11, 16.65]` | `[11.1, 12.1, 13.4, 14.3, 15.0]` |
    | WR | `[8.87, 9.87, 10.89, 11.90, 12.95]` | `[8.9, 9.9, 10.8, 11.5, 12.1]` |
    | TE | `[5.21, 6.21, 7.21, 8.22, 9.25]` | `[5.2, 6.2, 7.1, 7.9, 8.5]` |

    Each set spans from below the knee to the position's clamp maximum (`baseline × 1.85`) and the outputs are strictly increasing at 1 dp at all four positions.
  - **Live half**, the top five pre-values per position from `2026-09-10`, hard-coded with a comment citing the snapshot: QB `[24.1, 20.6, 17.9, 17.6, 14.0]` → `[21.0, 19.8, 17.9, 17.6, 14.0]`; RB `[16.7, 16.7, 15.4, 14.0, 13.7]` → `[15.1, 15.1, 14.5, 13.7, 13.5]`; WR `[13.0, 13.0, 12.5, 11.2, 11.0]` → `[12.1, 12.1, 11.9, 11.0, 10.9]`; TE `[9.3, 8.3, 7.3, 7.2, 5.7]` → `[8.6, 7.9, 7.2, 7.1, 5.7]`. Assert **no pair that was strictly ordered before becomes tied or inverted after** — phrased that way, not as "strictly decreasing", because RB and WR each carry a *pre-existing* tie (16.7/16.7 and 13.0/13.0) that the mechanism neither creates nor is allowed to resolve.
- **C · the bottom of the board is untouched — the Q4 double-count guard.** Two cases, both through `computeNextSeasonProjection`: an undrafted WR (`draftCapitalStatus: 'undrafted'`, `rookieCalibrationMult` 0.36) and a day-3 RB (`day3:RB`, 0.80). Assert for each that `rookieCeilingBasis === 'none'`, that `rookieCeilingPPGPre` equals `projectedPPG` to 1 dp, and that `rookieCalibrationMult` is unchanged from its slice-1 value. This is the assertion that slice 1's constants did not move and that the ceiling is not reaching into the discounted population.
- **D · a fired ceiling below the emission grain.** Construct a WR whose pre-ceiling PPG is just above the WR knee (e.g. 10.2). Assert `rookieCeilingBasis === 'ceiling:WR'` **while** `projectedPPG` rounds back to the pre-value at 1 dp. Pins Q4(d)'s rule that the basis string, not the difference of the two numbers, is the firing signal. Cite `12501` on `2026-09-10` as the live instance.
- **E · draft-group invariance — the test that witnesses the Q4(a) boundary.** Hold `position` and the pre-ceiling PPG fixed at a value **above** the knee, and sweep `draftCapitalStatus` × `nflDraftTier` across every reachable combination — `matched` × each of the eleven tiers, plus `undrafted` and `unknown`. Assert `rookieCeilingKnee`, `rookieCeilingAsymptote` and the post-ceiling `projectedPPG` are **identical across all of them**. Case C cannot do this job: both its rows sit below their knees, so it would pass unchanged even if `ROOKIE_CEILING` grew a draft-group dimension. This is the only test in §5 that fails if the ceiling ever becomes a tier constant, which is the thing §1 Q4 promises it cannot become.

### 5.5 Expected aggregate effect — the pinned numbers Session 2 must reproduce

Session 2 runs the mechanism over `snapshots/2026-09-10.json`'s 291 rookie-path rows as a smoke check and reports:

| quantity | expected |
|---|---|
| rookie-path rows above a knee | **19** of 291 |
| rows whose `projectedPPG` changes at 1 dp | **17** |
| rows where the ceiling **and** slice 1's discount both fire | **0** |
| `undrafted` group mean `projectedPPG`, pre → post | 3.026 → 3.026 (**0.00 %**) |
| `day3` group mean, pre → post | 4.822 → 4.822 (**0.00 %**) |
| `day2` group mean, pre → post | 7.681 → 7.669 (−0.16 %) |
| `r1` group mean, pre → post | 13.400 → 12.792 (−4.54 %) |
| `13269` `projectedPPG` | 24.1 → **21.0** |
| `13269` `nextSeasonRank` (positional, QB) | 1 of 105 → **8 of 105** |
| rows projected strictly above `13269` across all 715 players | 1 → **10** |
| within-position inversions, all 291 rows | **0** |
| new tied pairs introduced, all 291 rows | **0** |

**On the ranks.** Pin the **positional** rank (1 → 8 among 105 QBs): it is what `App.jsx:616-619` computes, what the UI shows, and it is tie-free here. Do **not** pin a whole-population rank as an exact integer. At 21.0 `13269` ties `6770` — `snapshots/2026-09-10.json` already carries a row at exactly `projectedPPG: 21` — so with 10 rows strictly above him his whole-population position is 11 or 12 depending on tie-break, and an earlier draft of this plan asserted "exactly 12". The tie-free way to state the same fact is the row above: ten players are projected strictly higher, up from one.

**Read these as ±0.1 on any individual row.** They were computed in Session 1 by applying the transform to the snapshot's **already-rounded 1 dp** `projectedPPG`, because that is what the snapshot stores; the shipped code applies it to the unrounded value. Individual rows may therefore differ in the last digit when Session 2 recomputes from source. The counts (19, 17, 0, 0, 0) and the positional rank move (1 → 8) should reproduce exactly. If `13269` does not land on 21.0, check the clamp path before touching the constants — his pre-value is exactly `13 × 1.85` and is not rounding-sensitive.

### 5.6 Three existing assertions in the shipped slice-1 and slice-2 tests will go red — update them, do not delete them

Both slices pinned their own case A on **this same player**, at his pre-ceiling value. They are the regression pins this slice is deliberately moving, so they must be re-pinned, and each must keep asserting its **own** slice's invariant so the update does not quietly retire a guard:

| file:line | current | change to | keep asserting |
|---|---|---|---|
| `src/__tests__/rookieCalibration.test.js:349` | `expect(r.projectedPPG).toBe(24.1)` | `toBe(21.0)` | `rookieMultiplierProduct === 1.85`, `draftCapitalStatus === 'matched'`, `rookieCalibrationMult === 1`, `rookieCalibrationBasis === 'none'` — slice 1 still does **not** touch this row, which is the whole point of its case A |
| `src/__tests__/rookieAvailability.test.js:467` | `expect(r.projectedPPG).toBe(24.1)   // unchanged from slice 1` | `toBe(21.0)` | `rookieGamesBasis === 'gpe:r1|QB|0'`, `projectedGames === 12` |
| `src/__tests__/rookieAvailability.test.js:470` | `expect(r.projectedTotalPts).toBe(288.6)   // 24.05 (unrounded) × 12` | `toBe(252.1)` | the comment must be updated too — it now reads `21.007209 (unrounded) × 12`, and the unrounded-PPG point it was making is still the point |

Add a one-line comment at each site naming slice 3 as the cause. **§8's "`npm test` green" is unreachable until these three land**, and an earlier draft of this plan listed neither file — so Session 2 should expect three failures on first run and treat them as expected, not as a bug in the new code.

---

## 6. Cross-repo impact

Three entries are triggered. For each, the registry's **Mirror text is the deliverable** — Session 2 emits it into the hand-back so the data-repo side has the authoritative wording, not a paraphrase of it. An earlier draft of this plan paraphrased all three; the paraphrase of CR-01 also generalised a clause that is not general (see below).

### CR-01 · Projection snapshot envelope — **note, no version bump**

Triggered by *"the `factors` object shape in `src/utils/seasonProjection.js`"*. Four additive rookie-path keys; `schemaVersion` stays **3**. No data-repo reader needs changing to accept the envelope — `lib/grade.mjs`, `bin/import-snapshot.mjs` and `lib/snapshot-capture.mjs` all read named fields, and `src/utils/projectionSnapshot.js` never enumerates `factors` keys.

**Do not cite the registry as saying additive keys never bump the version.** Its exact words are that additive `factors` keys **`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`** do not bump it — a statement about those four, not a general rule. The no-bump decision here is this slice's own judgement, on the same reasoning, and must be recorded as such.

The substantive note, because this is a behaviour change with no data-repo diff: **`projectedPPG` and `projectedTotalPts` themselves change for rookie-path rows from this commit forward.** Snapshots captured before and after are scored under different models. That is the segmentation problem §9.3 item 2 opened `grading/anchor-policy.md` for, and this slice adds the **third** model-change date (slices 1, 2, 3). `rookieCeilingKnee` / `rookieCeilingAsymptote` are what make the segmentation computable from the row rather than from a date table.

> **Mirror (verbatim):** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

### CR-15 · R3-FIT factor-multiplier mirror — **triggered, and not discharged**

Triggered: its app-side Triggers are the eleven listed `src/utils/` modules, which include `src/utils/seasonProjection.js`, and this slice adds a new level transform to the rookie path. It is **not discharged** — `reconstructShippedRookieProjection` in the data repo is still a reserved name with no body (verdict §*Not in this slice*), so this slice widens the app-vs-reconstruction gap by one more mechanism. Record it in the data-repo backlog; do not plan the fit here. See also §4 item 11, which corrects the stale App-side prose in this same entry.

> **Mirror (verbatim):** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs:110` only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — **triggered**

Triggered: `docs/signal-registry.md` is its sole app-side trigger and §4 items 6–7 edit it. The row edits themselves are specified there; this entry's deliverable is the Mirror text.

> **Mirror (verbatim):** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

### Registry work this slice cannot do

No new cross-repo **runtime** coupling is created: the app reads no new data family, and the fixture is a committed copy, not a live read. So no new CR entry and no Claude.ai-project routing is needed — the same disposition slices 1 and 2 reached.

---

## 7. Data-repo asks — flagged, not planned

Recorded for `.claude/tasks/data-repo-backlog.md`, each naming the app SHA that motivated it. None blocks this slice.

1. **Publish the ceiling quantiles in a verdict.** The constants are fitted app-side from a data-repo artifact, with the fit living only in `src/__tests__/rookieCeiling.test.js`. Mirroring the quantile computation into `bin/panel.mjs --rookie` would let both repos re-derive the same eight numbers and would close the same gap slice 1's §7 flagged.
2. **`grading/anchor-policy.md` now has three dates, not two.** §9.3 item 2 specified two model-change dates; this slice is the third. Writing it with a stale list is worse than not writing it.
3. **A 2026-class debut outcome append, after the 2026 season completes.** It is the first genuinely out-of-sample class for these constants — the verdict's §F re-fit-trap note applies to the ceiling exactly as it does to slice 1's constants. Expect the QB asymptote to move; its fold spread is 20.50–21.95 on n=50.

---

## 8. Done-definition

- `npm test` green, including the updated `factorsSchema.test.js` at 59 rookie keys, the new `rookieCeiling.test.js`, and the three §5.6 re-pins.
- `npm run lint` clean.
- `git diff --stat` shows **no change to `src/App.jsx`** (§2.2).
- `docs/projection.md` `:145`'s deferral paragraph is gone, not merely contradicted elsewhere in the file.
- All four doc/contract files in §4 updated: `docs/projection.md`, `docs/signal-registry.md`, `docs/navigation.md`, `CLAUDE.md` (both `:54` and `:95`), plus the CR-15 App-side correction in `docs/cross-repo-registry.md`.
- The §5.5 smoke numbers reproduced against `snapshots/2026-09-10.json` and reported.
- **Run the app and look at it** (CLAUDE.md done-definition item 6). This change is user-visible and an earlier draft of this plan had no smoke step. Three surfaces to check:
  1. **Market → Outlook.** Its default sort is `projectedPPG` descending (`src/components/market/Market.jsx:60`), and the `Proj` column (`:786`, rendered `:809`) re-orders: 17 rookies drop, `13269` moves off the top of the QB board.
  2. **`nextSeasonRank`** moves for the 19 rookies above a knee — confirm the `Next` column reflects it.
  3. **Profile → Dynasty tab.** The new `'Above the historical rookie ceiling ↓'` line must render (`docs/projection.md:241` describes this surface). Check it specifically on `12501` and `12522`, the two rows whose **displayed PPG did not change** — the line is the only visible evidence the mechanism fired there, and it is the Q4(d) claim made visible.

## 9. Hand-back should report

- The commit SHA and `git diff --stat`.
- The §5.5 table as actually measured, with any row that differs from the pinned value called out and explained.
- `13269`'s post-ceiling `projectedPPG`, `projectedTotalPts`, overall rank, and all four new `factors` values.
- Confirmation that `rookieCalibrationMult` and `projectedGames` are unchanged for every row in the snapshot — the slices-1-and-2-untouched check.
- The three CR Mirror texts from §6, emitted verbatim.
- A screenshot or equivalent evidence for each of the three §8 smoke surfaces.
- Any place the plan was wrong, stated plainly rather than worked around.

---

## 10. Review pass — plan-reviewer flags and dispositions

Run 2026-09-11 against app `42d11c5` and data `a0d9192`. **Twenty flags, all twenty accepted.** Each was independently re-verified against live source or recomputed from the panel before acceptance; none was declined, and nothing is deferred to a fix pass — the body above is corrected in place.

| # | class | flag | disposition |
|---|---|---|---|
| 1 | mechanical | Three shipped assertions pin `13269` pre-ceiling (`rookieCalibration.test.js:349`, `rookieAvailability.test.js:467`, `:470`); `npm test` cannot go green | **New §5.6.** Verified all three. Re-pinned, not deleted; each keeps its own slice's invariant |
| 2 | mechanical | §5.4 A's total-points formula used the rounded PPG; `:391` uses the unrounded one → 252.1, not 252.0 | Fixed in §5.4 A and in §2.1(c), which now states the asymmetry explicitly. `factorsSchema.test.js:318-320` documents the same trap |
| 3 | mechanical | Quantile convention unpinned; ≥3 conventions differ at n=50, so the provenance test becomes the editable thing | Pinned in §1 Q3 as zero-based `p·(n−1)` with linear interpolation, with the QB p99 worked check (`0.99 × 49 = 48.51`, interpolating 21.46→22.3227 → 21.90). Repeated in §5.2 and §5.3 |
| 4 | mechanical | Q2's verbatim population statement claims 1,198 excluded but enumerates 1,079 | Fixed. The missing 119 are `played6plus` rows at 6–7 games (992 − 873). Now a table that sums |
| 5 | shape | Q2 claimed adding non-survivors "leaves the maximum untouched" and generalised; the plan's own gate table shows the QB max rising 22.32 → 24.84 as the gate loosens | **The most substantive flag.** The paragraph conflated two different operations. Rewritten as two explicitly separate comparisons: (i) vs the full entrant population with absence = 0, where the gate is permissive; (ii) vs a looser games gate, where it is restrictive and the justification is small-sample, not survivorship |
| 6 | edge-case | §5.3's survivorship test needs full-population p90/p99, but only p95 was published | Eight values published. QB and RB p99 margins are 0.80 and 0.75, so the test now asserts values to 2 dp as well as the inequality |
| 7 | edge-case | Gate-insensitivity band of 0.60 has 93 % consumed at TE (0.560) | Band widened to 0.75; all four observed margins published |
| 8 | edge-case | "rank 2 → 12 exactly" is unsafe — `13269` ties `6770` at exactly 21.0 | Replaced with the tie-free positional rank (1 → 8 of 105 QBs), which is what the app computes, plus "rows strictly above: 1 → 10" |
| 9 | edge-case | §5.4 B's constructed inputs were unpinned; TE's derivative near the clamp max is ~0.57, so 0.1 apart can round together | All twenty inputs and outputs pinned in a table |
| 10 | strategy | Q4(a)'s "enforced by the shape of the table" is witnessed by no test; case C's rows sit below their knees | **New §5.4 E**, the draft-group invariance sweep. Q4(a) reworded to say the prose is a claim only because E asserts it |
| 11 | invariant | `CLAUDE.md:95` states 55 rookie keys; §4 omitted CLAUDE.md | Added as §4 item 9 (55 → 59) |
| 12 | invariant | `docs/navigation.md:124` enumerates the module's exports; `CLAUDE.md:54` enumerates the fixtures; §4 listed neither | Added as §4 items 8 and 10 |
| 13 | mechanical | "first rookie-path factor reconstructable without a caveat" is false — `:100`, `:105`, `:108` already are | Narrowed to "first *calibration-arc* rookie factor", with the three counterexamples named |
| 14 | mechanical | `App.jsx:614` is `const rankById = {}`; the sort is `:616` and produces a **positional** rank, not the "overall rank 2 of 715" the plan reasoned from | Corrected throughout. §0 now separates the app's `nextSeasonRank` from the Session-1 whole-population statistic, and the positional framing is stronger: `13269` is currently the **#1 projected QB in the league** |
| 15 | mechanical | Stale anchors: `:381` (calibration is `:379-380`, assignment `:382`) and `factorsSchema.test.js:76` (count lives at `:73-74` and `:18`) | Both corrected |
| 16 | mechanical | §8 had no smoke step despite a user-visible change (Market default sort, `Proj` column, the new summary line) | §8 extended with three named surfaces, including the two rows whose displayed PPG does not move |
| 17 | cross-repo | CR-01 Mirror not emitted, and the paraphrase generalised a clause scoped to four named keys | Mirror emitted verbatim; the no-bump decision is now recorded as this slice's judgement rather than as a registry rule |
| 18 | cross-repo | CR-15 triggered (`seasonProjection.js` is among its eleven app-side modules), Mirror not emitted | Mirror emitted verbatim; trigger stated |
| 19 | cross-repo | CR-18 triggered, Mirror not emitted | Mirror emitted verbatim |
| 20 | registry-stale | CR-15's App-side prose names no rookie-path constant, though three shipped ones exist; the data repo reads it as far-side authority | Added as §4 item 11 — an in-scope `[registry-stale]` correction to `docs/cross-repo-registry.md`, following CR-02's inline-correction convention |

**One thing the reviewer checked and confirmed rather than flagged**, recorded because it is the plan's largest architectural claim: §2.2's "`src/App.jsx` needs no change" **holds**. Every downstream consumer reads `projectedPPG`/`projectedTotalPts` off the projection objects, and `src/utils/projectionSnapshot.js` passes the projection verbatim without enumerating `factors` keys, so the four new keys reach the envelope with no writer change.

---

## Fix pass 1

implementation-reviewer run 2026-09-11 against the staged, uncommitted tree on base `42d11c5` (14 files, no `src/App.jsx`). Seven flags. The reviewer separately confirmed clean: the three §5.6 re-pins at 21.0 / 21.0 / 252.1 with each slice's own invariant retained and `252.1` genuinely derived from the unrounded PPG; `VET_FACTORS_KEYS` untouched and every vet assertion byte-identical; the quantile helper implementing zero-based `p·(n−1)` and re-deriving all eight constants through `applyRookieCeiling`'s return values; `src/App.jsx` absent; `ROOKIE_CEILING` position-keyed; the ceiling placed after slice 1 and before `projectedTotalPts`, which still multiplies the unrounded value; no test skipped, `.only`'d or deleted; and every §4 doc edit landed, including the **removal** of the `docs/projection.md:145` deferral paragraph.

Work the items in this order. Item 1 gates the commit.

### 1 · The live smoke result contradicts the measured result, and the offered explanation does not hold

**Blocking.** The hand-back's §5.5 table says `13269` lands at `projectedPPG` 21.0 and `nextSeasonRank` 8 of 105. The smoke paragraph says the running app shows him 9th at 20.3 behind eight named quarterbacks. Those are different numbers for the same player, and daily KTC drift is not a sufficient explanation. Inverting the QB transform:

| displayed PPG | implied pre-ceiling PPG | implied `rookieMultiplierProduct` |
|---|---|---|
| 21.0 | 24.02 | 1.848, i.e. pinned at the 1.85 clamp |
| **20.3** | **21.66** | **1.666, i.e. below the clamp** |

The snapshot row's raw product is 1.982 and clamps to 1.85. To reach 1.666 the raw product must fall about 16 %, which is a change in `ktcMult`, `collegeContribution` or `ageDelta`, not rounding. The §5.5 "±0.1 on any individual row" caveat covers a rounding difference, not a 0.7 PPG gap. `applyRookieCeiling` is a pure function of `(position, projectedPPG)` and the diff contains no live-versus-snapshot branch, so the transform cannot itself produce two answers.

**Do the diagnostic before anything else.** Read live `13269`'s own `factors` in the running app and report all four of `rookieMultiplierProduct`, `ktcMult`, `collegeContribution` and `rookieCeilingPPGPre`. Then:

- If `rookieCeilingPPGPre` is ≈21.66 and the product is below 1.85, the mechanism is correct and the live inputs have moved since the 2026-09-10 capture. Say which input moved and by how much, correct the smoke paragraph to state that the live run and the snapshot replay have different inputs, and the item is closed. Nothing in the code changes.
- If `rookieCeilingPPGPre` is 24.05 and the product is 1.85 while the screen renders 20.3, then the displayed number is not this mechanism's output and the smoke did not demonstrate what it claims. Stop and report before committing.

Note for the diagnosis: the newest KTC file in the data repo is `ktc/snapshot-2026-09-07.json`, which **predates** the 2026-09-10 projection snapshot. If the live app reads KTC from a source the snapshot capture did not, that asymmetry is itself the finding and belongs in the hand-back.

#### Item 1 — RESOLVED 2026-09-11, second branch. The mechanism is correct; the smoke evidence is not.

Diagnostic run from source rather than from a browser, which isolates the mechanism from the rendering path: `computeNextSeasonProjection` driven with the inputs the app would load today, reconstructed from the sibling data repo (`raw/-players-nfl.json`, `nfl/season-totals/2016-2025`, `matchKTCToSleeper` over the newest KTC file `ktc/snapshot-2026-09-07.json`, `matchCollegeToSleeper` + `computeCollegeMetrics` over `college/{receiving,rushing,passing}/2017-2025`, `matchNflDraftToSleeper` over `nflverse/draft/draft_picks.json`).

| factor for `13269` | measured from today's inputs | recorded in `snapshots/2026-09-10.json` | moved |
|---|---|---|---|
| `ageDelta` | 1.05 | 1.05 | no |
| `ktcMult` | 1.162 | 1.162 | no |
| `collegeContribution` | 1.25 | 1.25 | no |
| `nflDraftMultiplier` | 1.30 | 1.30 | no |
| `rookieMultiplierProduct` | 1.85 | 1.85 | no |
| `rookieCeilingPPGPre` | 24.05 | 24.05 | no |
| `projectedPPG` | **21.0** | n/a (pre-slice) | — |

**No input moved, including the KTC-derived one**, even though the live path reads an older KTC file than the one behind the 2026-09-10 capture. So the ceiling reproduces the pinned §5.5 value exactly from real data, and the `20.3 / 9th of 105` figure in the hand-back's smoke paragraph is **not reproducible from this mechanism under any input set** consistent with either the snapshot or today's repo.

**Disposition.** The implementation is correct and is not the defect. The smoke evidence is invalid and does not demonstrate what it claims, so §8's smoke step is **not discharged**. Most likely cause, named but not chased: the dev server's IndexedDB caches are long-lived (`getKTCValues` TTL is 3 days; the CFBD and draft caches are effectively permanent), so the browser was serving an input set matching neither the snapshot nor the current repo — or the build predated this diff. Requirement carried into the fix pass done-definition: **re-run §8's smoke against a cleared cache and a fresh build** before the tree is committed, and report `13269`'s displayed PPG together with his `rookieMultiplierProduct` and `rookieCeilingPPGPre` so the three are checkable against each other.

### 2 · §5.4 E's sweep never exercises the fired branch at QB or WR, so it is vacuous on 46 of its 48 rows

With `ktcMap: null`, `age: 22` and `collegeStats: {}` the reachable product is `1.05 × nflDraftMultiplier`, which tops out below the knee at QB (17.745 against 17.80) and WR (9.555 against 9.87). Only two rows fire, both `top-3`, both RB or TE, and the `sawAtLeastOneFiring > 0` guard is a global count that those two satisfy. On every non-firing row the reconstruction assertion is true by identity, so a draft-group dependence introduced **in the transform** rather than in the table survives the test. Since case E exists solely to witness §1 Q4(a), a version that cannot fire is not witnessing it.

Rebuild the sweep with inputs at or near the maxima (`age ≤ 21` → `ageMult` 1.15, a KTC map giving a high positional percentile → `ktcMult` up to 1.30, college stats giving `collegeContribution` 1.25) so the product reaches the clamp. Then assert, per position:

- the reconstruction identity on **every** swept row, as now; **and**
- that the fired branch is exercised on **every combination where firing is reachable**, using this map rather than a global counter. It is exact, derived from `max(ageMult × ktcMult × collegeContribution) = 1.86875`, the 1.85 clamp, and slice 1's multipliers:

| position | knee | fires for `matched` tiers | cannot fire, structurally | `undrafted` | `unknown` |
|---|---|---|---|---|---|
| QB | 17.80 | top-3 … r4 | r5, r6, r7 | max 16.11 — cannot | max 24.05 — fires |
| RB | 12.11 | top-3 … r3 | r4 … r7 | max 5.49 — cannot | max 16.65 — fires |
| WR | 9.87 | top-3 … r3 | r4 … r7 | max 4.66 — cannot | max 12.95 — fires |
| TE | 6.21 | top-3 … r3 | r4 … r7 | max 2.59 — cannot | max 9.25 — fires |

Assert the "cannot" cells **cannot** fire even at maximal inputs. That turns the unreachable half from a silent pass into a positive statement, and it is a second, independent witness of the same Q4 boundary: the bottom of the board is out of the ceiling's range by construction, not by luck.

### 3 · Correct the deviation comment's stated reason — it is wrong on its own terms

The comment at `src/__tests__/rookieCeiling.test.js:496-506` says the literal §5.4 E is unachievable because KTC percentile is integer-quantized. Quantization is not the blocker: the assertion is on the 1 dp `projectedPPG` plus exactly-comparable knee and asymptote, so a finer lever would have sufficed. **The real blocker is reachability** — at the low tiers and undrafted the pre-ceiling maximum sits structurally below the knee and no choice of inputs crosses it, per the table in item 2. The conclusion "not achievable by construction" is right; record the correct reason, so that a later session does not re-specify the literal test on the belief that a better lever would fix it.

The task file is wrong here too, not only the comment: §5.4 E as written asked for something unachievable. Item 2's shape is the corrected specification.

### 4 · §5.4 D bypasses `computeNextSeasonProjection` and so pins nothing case c–f does not already pin

Case D exists to pin Q4(d) on a **real projection row**: that `rookieCeilingBasis`, not the difference between the two PPG numbers, is the firing signal. As written it calls `applyRookieCeiling({ position: 'WR', projectedPPG: 10.2 })` directly and asserts the same arithmetic as the §5.2 unit cases. Route it through `computeNextSeasonProjection` and assert on the projection object: `factors.rookieCeilingBasis === 'ceiling:WR'`, `factors.rookieCeilingPPGPre` and `projectedPPG` equal at 1 dp, **and** `adjustmentSummary` contains `'Above the historical rookie ceiling ↓'`. That last assertion is the one that matters — it is the only visible evidence of a sub-grain firing, and §8's third smoke surface depends on it.

### 5 · Two stale `55` counts in the file carrying the second copy of the key set

`src/utils/seasonProjection.test.js:83` still reads `… + 3 teamChangeFactors = 55 total.` above a `ROOKIE_FACTORS_KEYS` set that now holds 59, and omits the `+ 4 ceiling (arc slice 3)` term its sibling comment in `factorsSchema.test.js:73-74` received. `:984` still reads `Test 19: Rookie schema extension — exactly 55 keys` directly above an `it(...)` title correctly bumped to 59. Both are the derivation note a future session reads before editing the set, which is exactly the artefact that must not lie. Fix both.

### 6 · The three new backlog entries name no commit

D-14, D-15 and D-16 each carry `app commit pending`. §7 requires each to name the app SHA that motivated it, and CLAUDE.md's done-definition item 7 requires the commit that found it. The placeholder is reasonable while the tree is uncommitted, but it must be rewritten with the real SHA **at commit time** or the three entries permanently name nothing — the precise failure item 7 exists to prevent. (Blocking status is present and correct on all three; only the SHA is missing.)

### 7 · Two scope and delivery items

- **The D-8 Open → Done move in `.claude/tasks/data-repo-backlog.md` was not requested.** CLAUDE.md's done-definition item 7 governs *appending* newly surfaced work, which covers D-14/15/16 but not a 50-line rewrite retiring an existing entry. The resolution claim itself checks out — it cites data commit `f0a7d07`, which matches the fixture's `source` SHA, and the debut panel is committed — so this is a scope question, not a correctness one. Either keep it and say plainly in the hand-back that it was out of the stated touch list, or split it out; do not leave it unremarked.
- **The three §6 Mirror texts have no carrier.** They are the CR deliverable, and a staged tree has no commit message to hold them. Put all three verbatim in the commit message body when the tree is committed.

### Done-definition for this fix pass

- ~~Item 1 resolved and reported before the commit is made.~~ **Done** — see the resolution block above. Superseded by the next line.
- §8's smoke re-run against a **cleared IndexedDB cache and a fresh build**, reporting `13269`'s displayed PPG alongside his `rookieMultiplierProduct` and `rookieCeilingPPGPre`. The original smoke is withdrawn.
- `npm test` green, `npm run lint` clean.
- Case E fires at every reachable combination in the item-2 table and asserts non-firing at every unreachable one.
- Case D runs through `computeNextSeasonProjection` and asserts the `adjustmentSummary` line.
- No `55` remains in either test file as a rookie-key count.
- The commit message carries the three Mirror texts; D-14/15/16 carry the real SHA.
