Deep reference for next-season projections and career comparables.

## Next-season projections (`src/utils/seasonProjection.js`)

`computeNextSeasonProjection({ playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, historicalShares, depthMap, teamContext, scoringSettings, ktcMap, collegeStats, currentSeason, qbQualityByTeam = null, ktcHistory = null, nflDraftMatches = null })`

Returns `{ projectedPPG, projectedGames, projectedTotalPts, confidence, factors, adjustmentSummary }` for any QB/RB/WR/TE. Returns `null` for non-skill positions.

### Veteran pipeline (13 steps)

Triggered when the player has at least one qualifying season (gp ≥ 8) and `years_exp > 1`.

| Step | Factor | Notes |
|---|---|---|
| 1 | **Base PPG** | Weighted recent average: last 3 qualifying seasons at 50/30/20 (or 70/30 for 2, 100 for 1) |
| 2 | **Age curve delta** | `nextAgeFactor / curAgeFactor` from empirical curves, clamped [0.80, 1.10] |
| 3 | **Share trend** | Raw lookup: `growing` +8% … `declining` −8%; swing dampened by share volatility (entrenched ×1.00, moderate ×0.80, volatile ×0.50) |
| 4 | **Regression** | Last PPG vs career avg: outlier high (>1.35×) → ×0.88; outlier low (<0.65×) → ×1.12. Swing dampened by consistency (steady ×0.50, moderate ×0.80, erratic ×1.00) — steady producers regress less |
| 5 | **Momentum** | Two-season avg trend vs prior two seasons, normalised by career avg: accelerating +8%, improving +4%, stable ±0%, slowing −4%, decelerating −8%; requires ≥ 4 qualifying seasons (else neutral) |
| 5c | **Breakout / bounce-back / TD-reliance** | Booleans recomputed from dynasty-score logic (`projectionSignals.js`): `isBreakout` ×1.08, `isBounceBack` ×1.05, `isTdReliant` ×0.93; neutral when not firing or inputs missing |
| 5d | **Trajectory** | Weighted linear-regression slope over all career PPG, normalised by mean PPG: `clamp(1 + normalisedSlope × 0.35, 0.93, 1.07)`; requires ≥ 2 qualifying seasons (else neutral) |
| 5e | **Efficiency** | Per-opportunity efficiency composite (`efficiencyMetrics.js`): position-cohort percentiles of YPC (RB), YPT / YPR / catch rate / TD rates (WR/TE), and **passer rating (QB)**, shrunk toward neutral for low sample → `clamp(1 + efficiencyIndex × 0.10, 0.90, 1.10)`; neutral when stats absent |
| 5f | **Snap share** | Field-time signal (`usageMetrics.js`): `off_snp / tm_off_snp` ranked as a percentile within the position cohort, shrunk toward neutral (shrinkK 200) → `clamp(1 + index × 0.06, 0.94, 1.06)` (**±6%**). **RB/WR/TE only** — QB is gated out (near-constant ~0.95, low signal). Neutral when the snap fields are absent |
| 5g | **Red-zone usage** | Own-rate RZ opportunity share (`usageMetrics.js`), primary category: RB `rush_rz_att/rush_att` · WR/TE `rec_rz_tgt/rec_tgt` · QB `pass_rz_att/pass_att`, ranked as a position-cohort percentile, shrunk toward neutral → `clamp(1 + index × 0.05, 0.95, 1.05)` (**±5%**). Neutral when the denominator is absent/zero |
| 5h | **Team RZ share** | Player's RZ opps ÷ team's total RZ opps (`teamRzShare.js`): RB `rush_rz_att / team Σ rush_rz_att` · WR/TE `rec_rz_tgt / team Σ rec_rz_tgt`. **Distinct from D2 own-rate** (corr ≈ 0.39): own-rate = role concentration; team-share = share of team RZ value. Empirical partial β ≈ +0.20 RB / +0.17 WR/TE after controlling for own-rate, overall share, and snap share. Normalization: cohort-percentile + shrinkage-to-50, → `clamp(1 + index × 0.05, 0.95, 1.05)` (**±5%**). **QB gated out** (one passer owns ~100% of team RZ pass attempts → zero discrimination). Team denominator from `historicalTeamTotals[lastQ.season][player.team]`; minimum guard 20. Neutral when team missing, denom < 20, player below opp gate (RB rush_att < 30, WR/TE rec_tgt < 20), or QB |
| 6 | **Projected games** | Weighted avg GP; ×0.88/×0.78 for injury-season count; absence-shape refinement (−5%/−10% for recurring absence patterns; −3%/−7% for hidden absences in high-GP seasons); clamped [8, 17]. Injury season = `gp < 10 AND dnp ≥ 3` **plus contributor evidence** (snap share `off_snp/tm_off_snp ≥ 0.40`, or high start rate, or per-game volume above position floor) in this season or an adjacent one — backup seasons with no contributor evidence are excluded. See `src/utils/durabilitySignals.js` |
| 7 | **Team offense** | `1.0 + (16 − teamRank) / 200` (±8% range) |
| 7b | **QB1 quality** | WR/TE/RB only: `1.0 + (qbScore − 50) / 100 × 0.10` → [0.95, 1.05]; neutral for QBs or unresolved teams |
| 8 | **Depth chart** | Starter ×1.05, Backup ×0.88, Depth 3+ ×0.68 |
| 9 | **Career-comp ensemble blend** | `blendedPPG = α × pipelinePPG + (1−α) × compPPG`; `α = 1 − compBlendWeight`; `compBlendWeight = MAX_COMP_WEIGHT × compConfidence × pipelineUncertainty`; MAX_COMP_WEIGHT = 0.35 |

Steps 5, 5c, 5d, 5e, 5f, 5g, 5h and 7b feed `combinedNewFactor = clamp(combinedNewFactorRaw, 0.67, 1.50)` where `combinedNewFactorRaw = momentumFactor × qbQualityFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor × trajectoryFactor × efficiencyFactor × snapShareFactor × rzUsageFactor × teamRzShareFactor` (10 factors). Both values are recorded in `factors` for diagnostics. The `[0.67, 1.50]` bounds are a **sanity rail against pathological stacks**, not an active moderator. Measured distribution (2012–2025, n=1,504 qualifying vet projections): mean ≈ 0.96; p5–p95 ≈ 0.82–1.135; max observed 1.328 — the clamp fires ~0% on real players. Measurement caveat: `qbQualityFactor` was forced to 1.0 in the run; real non-QB tails are up to ±5% wider (est. max ≈1.39, min ≈0.72). Adding D3 (±5%): worst-case theoretical stack ≈ 1.46 < 1.50 — top headroom is now thin; **monitor `combinedNewFactorRaw` p95**; if it approaches ≈1.40 escalate to a normalized additive-index restructure rather than widening the rail. At 10 factors (well below the #13–14 trigger), do NOT re-widen the envelope.

**Per-opportunity efficiency (Step 5e):** `computeEfficiencyFactor` (`src/utils/efficiencyMetrics.js`) derives efficiency metrics from the player's most recent qualifying season — YPC / rush TD rate (RB), YPT / YPR / catch rate / rec TD rate (WR/TE), **and the canonical passer rating computed from season-total pass_cmp/att/yd/td/int (QB)** — ranks each as a percentile within its position cohort (the most recent season in `careerStats`), shrinks low-sample percentiles toward neutral, and combines them with position-specific weights into `efficiencyIndex ∈ [−1, 1]`. The cohort table is built once per session and memoised. Raw metric values are recorded in `factors.efficiencyMetrics` for backtesting. QB passer rating is computed from season totals, **not** the stored per-week `pass_rtg` (which Sleeper reports weekly and the loader sums); `completionPct` is recorded in `factors.efficiencyMetrics` for backtesting but does not feed the factor.

**Snap share & red-zone usage (Steps 5f / 5g):** `computeUsageFactors` (`src/utils/usageMetrics.js`) derives two orthogonal usage signals from the player's most recent qualifying season, each normalised as a percentile within its position cohort (the most recent season in `careerStats`) and shrunk toward neutral for low-sample players — exactly the C1 efficiency design (the cohort table is built once per session and memoised; the small `clamp`/`percentileRank` helpers are duplicated rather than imported from the frozen `efficiencyMetrics.js`):

- **`snapShareFactor`** — field-time share `off_snp / tm_off_snp`, `clamp(1 + index × 0.06, 0.94, 1.06)`. **RB/WR/TE only:** QB is gated out because QB snap share is near-constant (median ~0.95, p10 0.81) — it carries little information and would wrongly penalise injury-fill starters who cross the gp ≥ 8 threshold. Cohort pool gated by `off_snp ≥ 100`; shrinkK 200 (off_snp units).
- **`rzUsageFactor`** — own-rate red-zone opportunity share for the player's primary category (RB `rush_rz_att/rush_att`, WR/TE `rec_rz_tgt/rec_tgt`, QB `pass_rz_att/pass_att`), `clamp(1 + index × 0.05, 0.95, 1.05)`. Cohort pool gated by the C1 opportunity minimums (rush 30 · rec 20 · pass 50); shrinkK reuses the C1 strengths (RB 40 · WR/TE 25 · QB 80). `rzUsageCategory` records the scored category.

Both factors degrade gracefully to neutral 1.0 (with `null` raw-value sentinels) when the stat fields are absent, the denominator is zero, or the position is gated out. New `factors` keys: `snapShare`, `snapShareFactor`, `rzUsageRate`, `rzUsageFactor`, `rzUsageCategory` (vet path only — rookies have no prior NFL usage season). The five stat keys (`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) flow through the generic stat-summing aggregation; they are confirmed present in the 2025 data and degrade to neutral for older seasons that predate them.

**Team-aggregated red-zone share (Step 5h, D3):** `computeTeamRzShareFactor` (`src/utils/teamRzShare.js`) computes a player's share of their team's total RZ opportunities — distinct from D2 own-rate (corr ≈ 0.39): own-rate measures *role concentration* (RZ opps / own opps); team-share measures *share of team RZ value* (RZ opps / team RZ opps). Empirical validation (2012–2025): standardized partial β vs next-season PPG is +0.20 RB / +0.17 WR/TE after controlling for own-rate, overall share, and snap share. Monotonic quintile response (both positions). Own-rate's own partial β is *negative* in the same model, confirming team-share carries the RZ predictive signal.

Per-position spec:

| Position | Numerator | Denominator | Player opp gate | Team denom gate |
|---|---|---|---|---|
| RB | `rush_rz_att` | team Σ `rush_rz_att` (`historicalTeamTotals[season][team].rushRz`) | `rush_att ≥ 30` | rushRz `≥ 20` |
| WR/TE | `rec_rz_tgt` | team Σ `rec_rz_tgt` (`historicalTeamTotals[season][team].recRz`) | `rec_tgt ≥ 20` | recRz `≥ 20` |
| QB | — | — | **gated out** | — |

QB gated out: one passer per team → starter owns ~100% of team RZ pass attempts → structural ~zero discrimination (mirrors D2 QB snap-share gate). Normalization: same cohort-percentile + shrinkage-to-50 machinery as D2 (shrinkK: RB 40 · WR/TE 25). Magnitude ±5%, `[0.95, 1.05]`, neutral 1.0. Scored against the player's most-recent qualifying season (`lastQ.season`) and their current team's denominator for that same season. Team denominators are aggregated by `computeHistoricalTeamTotals` (additive extension; `computeHistoricalShares` is unaffected). The module-level cohort cache is keyed by `careerStats` identity (once per session).

**Data-quality limitation:** denominators are summed over currently-active players only (same limitation as the live share-trend signal; `teamContext.js:120–123`). Retired/departed players' RZ work is absent → some teams slightly undercount. The team-denominator minimum guard (≥20) and shrinkage together handle the worst cases (e.g. LV/CLE retired-player undercount). `teamRzShareCategory` records the scored category (`'rush'` or `'rec'`). New `factors` keys: `teamRzShare`, `teamRzShareFactor`, `teamRzShareCategory`. Rookies record null/neutral sentinels (no prior NFL season to score).

**Career-comp ensemble blend (Step 9):** After the veteran pipeline clamps `rawPPG` to `pipelinePPG`, `computeCompBlend` (`src/utils/compsIntegration.js`) blends in a nearest-neighbour estimate from `compsProjectedPPG`. `compConfidence` is a 0–1 score weighted by comp count (45%), average similarity (40%), and subsequent-season coverage (15%). `pipelineUncertainty` scales the comp's influence: high-confidence pipelines (low uncertainty) down-weight the comp; low-confidence pipelines let it pull up to MAX_COMP_WEIGHT = 0.35 of the final value. The blend is skipped (weight = 0) when fewer than 1 comp qualifies or when fewer than 2 subsequent seasons are available across all comps. `projectedPPG = blendedPPG`; `pipelinePPG` is preserved in `factors` for backtesting.

**Confidence:** `'high'` (5+ qualifying seasons), `'medium'` (3–4), `'low'` (1–2).

### Rookie path

Triggered when `qualifying.length === 0` OR `years_exp ≤ 1`.

```
projectedPPG = ROOKIE_BASELINE_PPG[pos] × ageMult × ktcMult × collegeContribution
```

**Rookie baselines:** QB 13 · RB 9 · WR 7 · TE 5

**Age multipliers:** keyed on **draft age** (`currentAge − years_exp`) when
`years_exp ≤ 1` and the value is in `[18, 28]`; otherwise current age. The
lookup is unchanged: ≤21 → ×1.15, 22 → ×1.05, 23 → ×0.95, 24+ → ×0.82.
`rookieAgeAtDraft` is recorded in `factors` (null when the draft-age guard
doesn't fire — e.g. year-3+ rookie-path hits, or implausible computed age).

**KTC multiplier:** `0.70 + (ktcPositionPercentile / 100) × 0.60` (range 0.70–1.30)

**College contribution** — `collegeContribution = clamp(collegeMult × breakoutAgeFactor, 0.75, 1.25)` (bounded ±25%):

- **collegeBase** — peakDominator ≥ 30 → 1.20, ≥ 20 → 1.08, else 0.92
- **productionTrend adjust** — improving +0.05, peak-final 0.00, declining −0.07, single-season −0.02
- **finalYearDominator adjust** (2+ college seasons, `r = finalYearDominator / peakDominator`) — r ≥ 0.85 → +0.03, r < 0.55 → −0.05, else 0.00
- **collegeMult** — `clamp(collegeBase + trend adjust + finalYear adjust, 0.80, 1.26)`
- **breakoutAgeFactor** — breakout age ≤ 19 → 1.05, 20 → 1.02, 21 → 1.00, 22 → 0.98, 23–24 → 0.96; neutral (1.00) if null or implausible

**NFL draft slot (D1).** Actual NFL draft capital provides a league-independent rookie signal, loaded from nflverse via `src/api/nflDraft.js` and matched by `src/utils/nflDraftMatch.js`.

| Tier | Round/Pick | Multiplier |
|---|---|---|
| `top-3` | R1 picks 1–3 | ×1.30 |
| `top-8` | R1 picks 4–8 | ×1.18 |
| `r1-mid` | R1 picks 9–15 | ×1.10 |
| `r1-late` | R1 picks 16–32 | ×1.02 |
| `r2` | Round 2 | ×0.92 |
| `r3` | Round 3 | ×0.82 |
| `r4` | Round 4 | ×0.74 |
| `r5` | Round 5 | ×0.68 |
| `r6` | Round 6 | ×0.62 |
| `r7` | Round 7+ | ×0.58 |
| Unmatched (incl. UDFA) | — | ×1.00 |

The product `ageMult × ktcMult × collegeContribution × nflDraftMultiplier` is clamped to `[0.45, 1.85]` (`rookieMultiplierProduct`). This cap binds at the extremes (~top 1–3% stacked positive and bottom 1–3% stacked negative) and is inactive for the middle 95% of rookies. UDFAs and match misses are both treated as unmatched (×1.00); distinguishing them requires a verified-UDFA list, deferred to a future batch.

Projected games = 14. Confidence = `'rookie'`.

### Adjustment summary

`adjustmentSummary` is a string array of human-readable labels (e.g. `"Age curve improving ↑"`, `"Regression from outlier season ↓"`) shown in the Profile panel's Dynasty tab.

### Historical KTC factors (capture-only)

The projection records four historical KTC market signals into `factors` for
backtesting. They are **diagnostic only — they do not move `projectedPPG`** and
add no `adjustmentSummary` lines. Both the veteran and rookie paths record them.

| `factors` key | Signal |
|---|---|
| `ktcHistDelta` / `ktcHistDeltaPct` | KTC value change across the snapshot window |
| `ktcHistVolatility` / `ktcHistVolatilityPct` | Stdev of recent KTC values |
| `ktcHistTrajectorySlope` / `ktcHistTrajectoryNormalized` / `ktcHistTrajectoryLabel` | OLS slope of value over the window |
| `ktcHistRankVsMedianTrend` / `ktcHistRankVsMedianLabel` / `ktcHistValueVsPosMedian` | Trend of value vs position-median value |
| `ktcHistSampleSize` / `ktcHistWindowSpanDays` / `ktcHistConfidence` | Sample-size descriptors |

All values are `null` / `'none'` when the player appears in fewer than 2
snapshots. See [Historical KTC signals](integrations.md#historical-ktc-signals-srcutilsktchistoryjs) in integrations.md for the loader.

### Position multiplicity factors (capture-only)

The projection records the share of fantasy points coming from a player's
secondary stat category, computed from the most recent qualifying season. This
is **diagnostic only — it does not move `projectedPPG`** and adds no
`adjustmentSummary` lines. Veteran path computes; rookie path records null
sentinels.

| `factors` key | Meaning |
|---|---|
| `positionMultiplicityRatio` | `secondaryPts / (primaryPts + secondaryPts)`; `[0, 1]`, null when stats absent |
| `primaryCategory` | `'pass'` (QB) / `'rush'` (RB) / `'rec'` (WR, TE) |
| `primaryCategoryPoints` | Primary-category fantasy points in the most recent qualifying season |
| `secondaryCategoryPoints` | Secondary-category fantasy points in the most recent qualifying season |

Secondary category by primary: QB→rush, RB→rec, WR→rush, TE→rush. Bucketing
uses stat-key prefix (`pass_*` / `rush_*` / `rec` / `rec_*`) via
`getCategoryPoints` in `fantasyPoints.js`.

### aDOT factors (capture-only)

The projection records three air-depth-of-target diagnostics into `factors` for
backtesting. They are **diagnostic only — they do not move `projectedPPG`** and
add no `adjustmentSummary` lines. Both the veteran and rookie paths record the
keys; values are null on the rookie path (no prior-season stats available).

**Position scope (Q3 resolution):** WR and TE record actual values. RB and QB
record `null` for all three fields — RB near-zero receiving aDOT is noise; QB
passing air-yards is a conceptually separate signal deferred to a future batch.

| `factors` key | Meaning |
|---|---|
| `adot` | `rec_air_yd / rec_tgt` of the most-recent qualifying season (3 d.p.); `null` when `rec_tgt = 0`, `rec_air_yd` absent, or position is RB/QB |
| `adotDelta` | `adot(mostRecent) − adot(secondMostRecent)` (3 d.p.); `null` when fewer than 2 qualifying seasons carry `rec_air_yd` |
| `adotSampleSize` | `rec_tgt` of the most-recent qualifying season (integer); makes the captured `adot` interpretable for future shrinkage/backtest analysis |

**Calibration caveat.** Computed as Sleeper's `rec_air_yd / rec_tgt`. Note that
Sleeper's `rec_air_yd` runs approximately half the magnitude of published
industry aDOT — empirical spot-checks against known deep threats (e.g. Jefferson,
Chase ≈ 4.2 in the fixture vs published values around 8.4) suggest this is
air-yards-on-completed-receptions rather than air-yards-on-all-targets. Ranking
is preserved; absolute calibration is not. Use this field for relative
comparisons within the cohort, not as a substitute for published aDOT in
external contexts.

**Why capture-only?** Empirical analysis of the 2019–2025 cohort (WR n=583)
yields Pearson r = 0.289 vs same-season PPG — weak, positive, and confounded by
volume/role. Elite WRs (PPG ≥ 17, n=17) span aDOT 4.0–7.8 (both elite slot and
elite deep), confirming aDOT is a role indicator rather than a value indicator.
An active monotonic multiplier would either duplicate existing signals
(`efficiencyFactor`'s YPR/catch-rate sub-scores) or mis-penalize legitimate
role-specific outliers. The captured `adotDelta` (year-over-year change) is the
most defensible future activation path (role-change trajectory signal) and is
recorded here so that activation can be validated against snapshot data before
being enabled.

---

## Career comparables (`src/utils/careerComps.js`)

`findCareerComps(playerId, playersMap, careerStats, positionPeakPPG, topN = 3)`

Finds up to 3 players at the same position whose career arc most closely matches the profiled player's. Session-cached per player in a module-level `Map`.

**Career arc vector:** normalised PPG per qualifying season (gp ≥ 8), sorted ascending. `normalisedPPG = PPG / positionPeakPPG`, clamped to [0, 1.5].

**Similarity:** Euclidean distance over the overlap, converted to `1 / (1 + distance)`. Only candidates with similarity ≥ 0.60 are kept.

Each comp includes `theirSubsequentSeasons` — what the comp did after the overlap point.

Comps are skipped for prospects (`confidence === 'prospect'`).

> **Projection reuse:** `findCareerComps` and `compsProjectedPPG` are also called by the season-projection veteran pipeline via `src/utils/compsIntegration.js` (Step 9). The same session-level `compsCache` Map serves both callers — the profile panel's first lookup amortises the cost for the pipeline, and vice versa.
