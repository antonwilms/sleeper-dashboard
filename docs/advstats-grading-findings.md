# **Advstats & Signal Grading — Findings and Open Items**

**Status:** Grading/activation deliberately **parked**. Active track is ingest → store → display (view-only). Grading resumes once the feature set is stable.

**Why parked:** A partial β is conditional on the exact covariate set, so grading features one at a time against a still-growing feature set forces a full recompute every time a feature is added. Deferring grading until the dataset is feature-complete is the coherent sequencing.

---

## **1\. The two tracks (now decoupled)**

**Track A — data & display (active now).** Ingest, store, and surface every stat with user-viewing value, *view-only*, decoupled from `projectedPPG`. Stats can be shown even if they have no predictive value (e.g. target share, snap share are useful to see regardless).

**Track B — grading & activation (parked).** Measure each signal's incremental predictive value and wire the winners into `projectedPPG`. Resume when the feature set is stable.

**Single-source rule:** the served advstats file is the source for *both* display (now) and activation (later), so a displayed value can never diverge from the value that eventually feeds a projection.

---

## **2\. CRITICAL: reconstructable vs. ephemeral (the one thing parking can break)**

* **Reconstructable** signals (advstats, usage, efficiency, age, breakout) can be rebuilt from historical files at any time → **safe to defer**.  
* **Ephemeral** signals (depth-chart order, injury designation, coaching/scheme) are **lost forever** if not captured at snapshot time. **Parking grading does NOT pause ephemeral-data loss.**

**Action:** continue capturing ephemeral signals into snapshots *now*, even while grading is parked, or they will be unrecoverable when grading resumes.

---

## **3\. Validated signal results (so far)**

Backtest \= standardized partial β of the metric vs **next-season** PPG, controlling for overall share, snap share, own-rate (per position). "Robustness" \= re-run on the full 2012–2024 panel with snapShare dropped (see §4 for why).

| Metric / position | 2020+ panel β (n) | Full-panel β (n) | Verdict |
| ----- | ----- | ----- | ----- |
| **WR `air_yards_share`** | \+0.195 (566), monotonic, collin. 0.74 | **\+0.218 (1269)**, monotonic | **Activate** — downfield role beyond volume; robust |
| **TE `air_yards_share`** | \+0.219 (267), collin. 0.82 ⚠, non-monotonic | **\+0.305 (584)**, monotonic, 0.79 | **Activate** — strengthened on full panel; small-sample wobble resolved |
| **RB `target_share`** | \+0.201 (340), collin. 0.47 | **\+0.303 (783)**, collin. 0.38 | **Activate** — receiving role, orthogonal to rushing volume; cleanest signal |
| RB `air_yards_share` | r≈0.05, β≈0.07, flat | — | **Noise** — exclude from projection; view-only |
| `target_share` (WR/TE) | ≈ overall share (r≈0.9) | — | **Redundant** with volume; view-only |
| `wopr` (all positions) | collinearity-inflated (flagged) | — | **Redundant / proxy**; view-only at most |
| `racr` (all positions) | **not tested** | — | **TODO** — likely view-only (efficiency mean-reverts) |

**Key structural finding — signal is position-specific:** WR/TE get value from *depth of role* (`air_yards_share`); RB from *existence of a receiving role* (`target_share`). A one-size metric misses this. Grading and activation must be per-position. (This is the payoff of having included RBs.)

**`wopr` is a trap:** it contains `target_share` (≈ volume), so its partial β looks large but is collinearity-inflated everywhere. Use the orthogonal component (`air_yards_share`), not `wopr`.

---

## **4\. Methodology findings that future grading must carry forward**

1. **Partial β is conditional on the covariate set.** The backtest controlled for only **three** signals. The production projection uses many more (efficiency, age, breakout, opportunity quality). So the validated βs show the metrics beat **volume** — NOT that they beat the **full feature set**. Their true incremental value over the real model is still unknown.  
2. **The coherent end-state is a JOINT model** — reconstruct all relevant (reconstructable) signals as covariates and fit everything (existing \+ new) together, so each weight is conditioned on all others. This simultaneously calibrates new features and **audits the existing ones** (see §6).  
3. **Measurement ≠ pipeline rewrite.** The projection is a hand-built, non-linear factor pipeline (age curves, composites). A linear joint regression is a *calibration/audit guide*, not a drop-in engine. Replacing the engine with a fitted model is a separate, larger decision — make it only after seeing joint results.  
4. **Basis is not numerically comparable to the app.** The backtest reads team-RZ-share β ≈ **\+0.52** on this data's basis (cohort-only team totals, WR/TE/RB) vs the app's published **\+0.17** (its `historicalTeamTotals` over all rostered players). The numeric D3 anchor is **not reproducible** on the data-repo basis. → Interpret βs **qualitatively/relatively**, never against app-side magnitudes. The `--validate` check is therefore a **qualitative** D3 trust gate (sign \+ own-rate sign \+ monotonic  
   * positive raw r), not a numeric match.  
5. **`off_snp` (snap share) only exists from 2020+.** Any model controlling for snapShare is limited to the **2020–2024** panel; dropping snapShare recovers **2012+**. Effective panel varies by control set and is reported per run. Verify coverage of other usage keys (`rec_rz_tgt`, `rush_rz_att`) before relying on them across the full panel.  
6. **Collinearity flag (|r| \> 0.8)** marks unreliable partials. Expect heavy collinearity among volume-correlated signals (0.7–0.9 observed); a large joint model will need grouping/pruning, not literal per-coefficient reads.  
7. **Activation must inject only the *incremental* effect**, not the raw relationship. `air_yards_share` correlates \~0.74 with overall share, which the projection already captures; wiring it in as a raw multiplier double-counts volume and over-rates high-air-yards players. The adjustment rides on top of the existing volume-driven projection, calibrated to the partial (incremental) effect.  
8. **Known data caveats (carried in every report):**  
   * *Non-independence:* pooled (player, Y→Y+1) rows recur across years → optimistic standard errors. βs are effect-size estimates, not significance tests. Consider clustering later.  
   * *Traded players:* full-season season-totals are attributed to a single advstats `team`, slightly overstating shares for \~2% of rows (affects controls, not outcomes).  
   * *RB rushing denominators undercount QB rushes* (QB sneaks/scrambles excluded — QBs aren't in the cohort) → RB rushing-based shares (overallShare, team-RZ-share) are inflated.

---

## **5\. Tooling status (the grading harness)**

Built and working in `sleeper-dashboard-data`:

* `lib/backtest.mjs` — pure stats (standardized OLS, quintiles, cohort transforms).  
* `scripts/backtest-run.mjs` — orchestration with injectable loader; `normalizeMetric` / `normalizePosition` / `normalizeControls`; `assembleCohort` / `runMetric` / `runValidate`.  
* `bin/backtest.mjs` — CLI: `--metric`, `--position`, `--controls`, `--from/--to`, `--min-games`, `--validate`, `--by-season`, `--json`, `--write`. Reports effective panel \+ collinearity flags.  
* Hermetic integration tests over real file shapes (closed the earlier false-green gap).

The harness is ready. Extending it to the **joint model** (§4.2) is the next tool task when grading resumes.

---

## **6\. Open items for when grading resumes**

1. **Run the joint signal analysis** — reconstruct existing signals as covariates, fit all features together for coherent conditional weights. This *is* the existing-feature audit.  
2. **Audit existing active factors** — most were activated on domain reasoning, not partial-β validation. Some may be volume-confounded (as aDOT was) and not earn their place. The harness is now a stricter bar than the incumbents were held to; apply it consistently.  
3. **Test `racr`** — the one untested metric (expect view-only).  
4. **Resolve per-feature year coverage** — confirm `rec_rz_tgt`/`rush_rz_att` and other keys so grading panels are honest about their effective window.  
5. **Decide the basis** — keep the data-repo basis (qualitative) or reconstruct the app's basis for numeric comparability.  
6. **Activation functional form** — design the incremental, position-specific adjustment that does not double-count volume (§4.7).  
7. **Non-independence** — consider clustering / robust SEs.  
8. **Fill the 2019 advstats gap** — `node bin/update.mjs advstats --year 2019 --force` (write failed during backfill; pre-2020 so it doesn't affect current results, but needed for full coverage).

---

## **7\. Quick reference — activation decisions locked so far**

* **Activate (per position):** WR `air_yards_share`, TE `air_yards_share`, RB `target_share`.  
* **View-only / excluded from projection:** RB `air_yards_share` (noise), `target_share` for WR/TE (redundant), `wopr` (all), `racr` (pending test).  
* **Do all activation calibration against the full feature set, not in isolation** — and only after the feature set is stable.

