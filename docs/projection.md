Deep reference for next-season projections and career comparables.

## Next-season projections (`src/utils/seasonProjection.js`)

`computeNextSeasonProjection({ playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, historicalShares, depthMap, teamContext, scoringSettings, ktcMap, collegeStats, currentSeason, qbQualityByTeam = null, ktcHistory = null, nflDraftMatches = null, historicalTeamTotals = null, priorTeamByPlayer = null, attribution = DEFAULT_ATTRIBUTION })`

`currentSeason` is currently unused — reserved for staleness capture (deep-audit D2-D).

Returns `{ projectedPPG, projectedGames, projectedTotalPts, confidence, factors, adjustmentSummary }` for any QB/RB/WR/TE. Returns `null` for non-skill positions, **and for skill players whose final `projectedPPG` is non-finite (corrupted season-totals input) — a dev-mode `console.warn` identifies the player.**

### Veteran pipeline (13 steps)

Triggered when the player has at least one qualifying season (gp ≥ 8) and `years_exp > 1`.

| Step | Factor | Notes |
|---|---|---|
| 1 | **Base PPG** | Weighted recent average: last 3 qualifying seasons at 50/30/20 (or 70/30 for 2, 100 for 1) |
| 2 | **Age curve delta** | `nextAgeFactor / curAgeFactor` from empirical curves, clamped [0.80, 1.10] |
| 3 | **Share trend** | Raw lookup: `growing` +8% … `declining` −8%; swing dampened by share volatility (entrenched ×1.00, moderate ×0.80, volatile ×0.50) |
| 4 | **Regression** | Last PPG vs career avg: outlier high (>1.35×) → ×0.88; outlier low (<0.65×) → ×1.12. Swing dampened by consistency (steady ×0.50, moderate ×0.80, erratic ×1.00) — steady producers regress less |
| 5 | **Momentum** | Two-season avg trend vs prior two seasons, normalised by career avg: accelerating +8%, improving +4%, stable ±0%, slowing −4%, decelerating −8%; requires ≥ 4 qualifying seasons (else neutral) |
| 5c | **Breakout / bounce-back / TD-reliance** | Booleans recomputed from dynasty-score logic (`projectionSignals.js`): `isBreakout` ×1.08, `isBounceBack` ×1.05, `isTdReliant` ×0.93; neutral when not firing or inputs missing. `isBounceBack` definition corrected 2026-06-12 (D1-A/F2-C — see dynasty-scoring.md → Special signals): down year is the calendar season immediately before the current qualifying season (8–9 GP qualifying season, or sub-8-GP/0-GP injury season per `durabilitySignals.js`); recovery requires current PPG ≥ best prior qualifying PPG. The ×1.05 magnitude is unchanged. **Snapshots written before 2026-06-12 carry the old (looser) flag** — pre/post cohorts are distinguishable by snapshot date; no snapshot `schemaVersion` change (values moved, shape did not). |
| 5d | **Trajectory** | Weighted linear-regression slope over all career PPG, normalised by mean PPG: `clamp(1 + normalisedSlope × 0.35, 0.93, 1.07)`; requires ≥ 2 qualifying seasons (else neutral) |
| 5e | **Efficiency** | Per-opportunity efficiency composite (`efficiencyMetrics.js`): position-cohort percentiles of YPC (RB), YPT / YPR / catch rate / TD rates (WR/TE), and **passer rating (QB)**, shrunk toward neutral for low sample → `clamp(1 + efficiencyIndex × 0.10, 0.90, 1.10)`; neutral when stats absent |
| 5f | **Snap share** | Field-time signal (`usageMetrics.js`): `off_snp / tm_off_snp` ranked as a percentile within the position cohort, shrunk toward neutral (shrinkK 200) → `clamp(1 + index × 0.06, 0.94, 1.06)` (**±6%**). **RB/WR/TE only** — QB is gated out (near-constant ~0.95, low signal). Neutral when the snap fields are absent |
| 5g | **Red-zone usage** | Own-rate RZ opportunity share (`usageMetrics.js`), primary category: RB `rush_rz_att/rush_att` · WR/TE `rec_rz_tgt/rec_tgt` · QB `pass_rz_att/pass_att`, ranked as a position-cohort percentile, shrunk toward neutral → `clamp(1 + index × 0.05, 0.95, 1.05)` (**±5%**). Neutral when the denominator is absent/zero |
| 5h | **Team RZ share** | Player's RZ opps ÷ team's total RZ opps (`teamRzShare.js`): RB `rush_rz_att / team Σ rush_rz_att` · WR/TE `rec_rz_tgt / team Σ rec_rz_tgt`. **Distinct from D2 own-rate** (corr ≈ 0.39): own-rate = role concentration; team-share = share of team RZ value. Empirical partial β ≈ +0.20 RB / +0.17 WR/TE after controlling for own-rate, overall share, and snap share. Normalization: cohort-percentile + shrinkage-to-50, → `clamp(1 + index × 0.05, 0.95, 1.05)` (**±5%**). **QB gated out** (one passer owns ~100% of team RZ pass attempts → zero discrimination). Team denominator from `historicalTeamTotals[lastQ.season][player.team]`; minimum guard 20 (denominator excludes `TEAM_<abbr>` aggregate pseudo-rows — see the entity-filter era note below). Neutral when team missing, denom < 20, player below opp gate (RB rush_att < 30, WR/TE rec_tgt < 20), or QB |
| 6 | **Projected games** | Weighted avg GP; ×0.88/×0.78 for injury-season count; absence-shape refinement (−5%/−10% for recurring absence patterns; −3%/−7% for hidden absences in high-GP seasons); clamped [8, 17]. Injury season = `gp < 10 AND dnp ≥ 3` **plus contributor evidence** (snap share `off_snp/tm_off_snp ≥ 0.40`, or high start rate, or per-game volume above position floor) in this season or an adjacent one — backup seasons with no contributor evidence are excluded. See `src/utils/durabilitySignals.js` |
| 7 | **Team offense** | `1.0 + (16 − teamRank) / 200` (±8% range) |
| 7b | **QB1 quality** | WR/TE/RB only: `1.0 + (qbScore − 50) / 100 × 0.10` → [0.95, 1.05]; neutral for QBs or unresolved teams. Input map is the **rostered-only** `qbQualityByTeamRostered` (legacy behavior) — NOT the league-wide map the dynasty OQ modifier uses; swapping the projection to league-wide QB coverage moves `projectedPPG` and is backtest-gated (see `.claude/tasks/qb-quality-coverage.md`). |
| 8 | **Depth chart** | Starter ×1.05, Backup ×0.88, Depth 3+ ×0.68. **Staleness guard:** a penalty-tier order (≥2) on a player who started ≥8 games last qualifying season is treated as a stale offseason depth chart → held neutral (1.0), `depthStale=true`. Null order → neutral (unchanged). |
| 9 | **Career-comp ensemble blend** | `blendedPPG = α × pipelinePPG + (1−α) × compPPG`; `α = 1 − compBlendWeight`; `compBlendWeight = MAX_COMP_WEIGHT × compConfidence × pipelineUncertainty`; MAX_COMP_WEIGHT = 0.35 |

Steps 5, 5c, 5d, 5e, 5f, 5g, 5h and 7b feed `combinedNewFactor = clamp(combinedNewFactorRaw, 0.67, 1.50)` where `combinedNewFactorRaw = momentumFactor × qbQualityFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor × trajectoryFactor × efficiencyFactor × snapShareFactor × rzUsageFactor × teamRzShareFactor` (10 factors). Both values are recorded in `factors` for diagnostics. The `[0.67, 1.50]` bounds are a **sanity rail against pathological stacks**, not an active moderator. Measured distribution (2012–2025, n=1,504 qualifying vet projections): mean ≈ 0.96; p5–p95 ≈ 0.82–1.135; max observed 1.328 — the clamp fires ~0% on real players. Measurement caveat: `qbQualityFactor` was forced to 1.0 in the run; real non-QB tails are up to ±5% wider (est. max ≈1.39, min ≈0.72). Adding D3 (±5%): worst-case theoretical stack ≈ 1.46 < 1.50 — top headroom is now thin; **monitor `combinedNewFactorRaw` p95**; if it approaches ≈1.40 escalate to a normalized additive-index restructure rather than widening the rail. At 10 factors (well below the #13–14 trigger), do NOT re-widen the envelope.

### Non-finite input firewall (D1-B)

Season-totals values are not trusted to be finite. Two layers guard the pipeline:
1. **Qualifying-array filter (Step 1):** a season whose `fantasyPoints` or `gamesPlayed` is non-finite is skipped (dev-mode `console.warn`), exactly as if it were a sub-8-GP season. If no qualifying seasons remain, the player routes to the rookie path (the existing no-qualifying-seasons contract). The GP ≥ 8 gate itself is evaluated first, so finite seasons are gated identically to before.
2. **Finalization guard (after the Step 9 comp blend):** if `projectedPPG` is still non-finite (e.g. corrupted `positionPeakPPG` or team-context inputs), the projection returns `null` — the same contract as non-skill positions — with a dev-mode `console.warn`. The player is omitted from `seasonProjections`, ranks, and that day's projection snapshot.

The rookie path needs no guard: every rookie multiplier is a bounded table lookup whose bucket comparisons fail closed to a finite default on non-finite input.

### Team-change handling (offseason)

Per-season team IS now available to the pipeline (`careerStats[season][pid].team`, season-totals v3); historical attribution is mode-gated by `DEFAULT_ATTRIBUTION` in `teamContext.js` (`'per-season-team'` since 2026-07-11 — R2 gate cleared FLIP-CLEARS, data repo `grading/2026-07-09-r2flip-verdict.md`; the dynasty-score path is explicitly pinned to `'current-team'` pending its own graded migration, see `docs/dynasty-scoring.md`). Team-change *detection* for the offseason neutralization remains snapshot-based as below.

**Detection:** `loadPriorSnapshotTeams` reads the most-recent projection snapshot strictly before today's UTC date and extracts `players[pid].nfl_team` for each player. Comparing this against the current `playersMap[pid].team` gives `isTeamChange` (`true` / `false` / `null`). A `null` result means "unknown" — no prior snapshot covers this player (new install, player not included in yesterday's snapshot, etc.) — and is intentionally kept distinct from `false`. Detection is:
- **Forward-only**: no backfill before snapshots existed.
- **Coverage-limited**: the first league of each UTC day wins; subsequent leagues on the same day are skipped.
- **Brand-new installs**: no snapshots → `isTeamChange null` for all players until snapshots accumulate.
- **Snapshot timing:** because `isTeamChange` is null (no neutralization) until `loadPriorSnapshotTeams` resolves, the daily snapshot write defers until that read settles (`priorTeamSettled`) — so a warm career load doesn't freeze a missing-team-change projection for the day. A legitimately-null read (first-ever session) still settles and writes the correct un-neutralized projection. See integrations.md → *Projection snapshots → Input-settled gate*.

**What fires on a confirmed change (`isTeamChange === true`):**
- **Step 3 share trend** — the share trend describes old-team roles; trend transfer across a team change is un-validated → held neutral. `shareTrendMultiplier` is forced to 1.0. The raw trend values (`shareTrendRaw`, `shareVolatilityLabel`, `shareVolatilityScale`) are still recorded diagnostically.
- **Step 5h team-RZ-share** — under per-season attribution the share is well-defined old-team history; transfer to the new team's RZ structure is un-validated → held neutral. `teamRzShareFactor` is forced to 1.0 and `teamRzShare` is set to null.

Historical note: pre-flip (`current-team` mode, until 2026-07-11) the original data-corruption rationale applied — the share numerator was old-team usage joined against denominators that didn't correspond to it. Post-flip the neutralization survives purely as the un-validated-transfer belief above.

**Intentionally NOT changed:** base PPG, age curve, regression, momentum, efficiency, snap share, own-rate RZ usage (D2), trajectory, breakout/bounce-back/TD-reliance, Steps 7/7b (team offense + QB1 quality — both key on the current/new team and are already forward-looking; Step 7's aggregation input additionally stays current-team-attributed because the app's single teamContext object is pinned for the dynasty score — see docs/dynasty-scoring.md attribution-asymmetry note), comp blend, confidence.

**Confidence:** intentionally NOT lowered for team-changers in this implementation. The `confidence` label is a coarse sample-size band (`high`/`medium`/`low`/`rookie`) consumed widely; repurposing it to also encode roster uncertainty would conflate two axes. `isTeamChange` is captured as a factor so a future, backtest-validated uncertainty adjustment can be built deliberately.

**Activated:** `DEFAULT_ATTRIBUTION = 'per-season-team'` since 2026-07-11 (R2 flip gate cleared FLIP-CLEARS — data repo `grading/2026-07-09-r2flip-verdict.md`, panel 2020–2024, sensitive cohort improving). Snapshots from that date forward carry per-season-attributed shareTrend/teamRzShare values; pre/post cohorts are distinguishable by snapshot date. **Entity-filter era note (2026-07-18 fix):** between the flip commit (2026-07-16) and the entity filter, per-season denominators included Sleeper's `TEAM_<abbr>` aggregate pseudo-rows and were exactly doubled — snapshots in that window carry ~½-scale `teamRzShare` and share-volatility labels biased toward `entrenched` (`shareTrendLabel` was unaffected — scale-free). Current-team-pinned dynasty channels were never exposed.

**New factors keys:** `isTeamChange` (boolean or null), `prevTeam` (string or null), `newTeam` (string or null) — **both vet and rookie paths**. `depthStale` (boolean) — **vet path only**.

**Per-opportunity efficiency (Step 5e):** `computeEfficiencyFactor` (`src/utils/efficiencyMetrics.js`) derives efficiency metrics from the player's most recent qualifying season — YPC / rush TD rate (RB), YPT / YPR / catch rate / rec TD rate (WR/TE), **and the canonical passer rating computed from season-total pass_cmp/att/yd/td/int (QB)** — ranks each as a percentile within its position cohort (the most recent season in `careerStats`), shrinks low-sample percentiles toward neutral, and combines them with position-specific weights into `efficiencyIndex ∈ [−1, 1]`. The cohort table is built once per session and memoised. Raw metric values are recorded in `factors.efficiencyMetrics` for backtesting. QB passer rating is computed from season totals, **not** the stored per-week `pass_rtg`; likewise `completionPct` is computed from `pass_cmp/pass_att`, **not** the stored per-week `cmp_pct`. Both `pass_rtg` and `cmp_pct` are weekly values the loader **sums**, so they are unusable as season-level metrics and are **never consumed** by projection code. `completionPct` is recorded in `factors.efficiencyMetrics` for backtesting but does not feed the factor.

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

QB gated out: one passer per team → starter owns ~100% of team RZ pass attempts → structural ~zero discrimination (mirrors D2 QB snap-share gate). Normalization: same cohort-percentile + shrinkage-to-50 machinery as D2 (shrinkK: RB 40 · WR/TE 25). Magnitude ±5%, `[0.95, 1.05]`, neutral 1.0. Scored against the player's most-recent qualifying season (`lastQ.season`) and the attributed team's denominator for that same season (`resolveAttributedTeam` — the lastQ-season team since the flip; current team only via the provenance fallback below). Team denominators are aggregated by `computeHistoricalTeamTotals` (additive extension; `computeHistoricalShares` is unaffected). The module-level cohort cache is keyed by `careerStats` identity (once per session).

**Data-quality limitation (provenance-dependent fallback):** for v3-served seasons, denominators are complete — retired/departed players re-enter via their per-season team. The legacy undercount persists **only** where no per-season `team` exists and `resolveAttributedTeam` silently falls back to the current team: the live-API-aggregated in-season year, v1/v2 cache entries, and API-only mode. Consequence: **the same player can get different projections depending on cache provenance** — a v3-store session attributes his history per-season; a degraded session reproduces legacy current-team attribution. This is a deliberate availability-over-purity trade (reanchor §1); the ≥20 team-denominator guard and shrinkage guard the residual cases. Since D1a, this caveat is recorded per season in the daily projection snapshot's `inputStatus.careerStats.detail.provenance` (`'cache-hit'|'data-store'|'live-api'`), so a graded row can be attributed to its actual provenance instead of guessed at. `teamRzShareCategory` records the scored category (`'rush'` or `'rec'`). New `factors` keys: `teamRzShare`, `teamRzShareFactor`, `teamRzShareCategory`. Rookies record null/neutral sentinels (no prior NFL season to score). Team-changers' Step 5h share is additionally neutralized to 1.0 when a team change is detected (see [Team-change handling](#team-change-handling-offseason)). Store-served seasons additionally carry `TEAM_<abbr>` aggregate and `<abbr>` DEF pseudo-rows; `computeHistoricalTeamTotals` excludes the aggregates via `isTeamAggregateId` (unfiltered they exactly doubled every team denominator), and DEF rows contribute nothing (no offensive stat keys).

**Career-comp ensemble blend (Step 9):** After the veteran pipeline clamps `rawPPG` to `pipelinePPG`, `computeCompBlend` (`src/utils/compsIntegration.js`) blends in a nearest-neighbour estimate from `compsProjectedPPG`. `compConfidence` is a 0–1 score weighted by comp count (45%), average similarity (40%), and subsequent-season coverage (15%). `pipelineUncertainty` scales the comp's influence: high-confidence pipelines (low uncertainty) down-weight the comp; low-confidence pipelines let it pull up to MAX_COMP_WEIGHT = 0.35 of the final value. The blend is skipped (weight = 0) when fewer than 1 comp qualifies or when fewer than 2 subsequent seasons are available across all comps. `projectedPPG = blendedPPG`; `pipelinePPG` is preserved in `factors` for backtesting.

**Confidence:** `'high'` (5+ qualifying seasons), `'medium'` (3–4), `'low'` (1–2).

### Rookie path

Triggered when `qualifying.length === 0` OR `years_exp ≤ 1`.

```
projectedPPG = ROOKIE_BASELINE_PPG[pos] × clamp(ageMult × ktcMult × collegeContribution × nflDraftMultiplier, 0.45, 1.85) × rookieCalibrationMult
```

The realisation calibration multiplier (calibration arc slice 1, below) is applied **outside** the `[0.45, 1.85]` clamp on the first four terms, deliberately: folded inside, the 0.45 floor would swallow the discount for 132 of the 200 live rows the correction touches on `snapshots/2026-09-07.json`.

**Rookie baselines:** QB 13 · RB 9 · WR 7 · TE 5

Because `collegeContribution` and the D1 `nflDraftMultiplier` both fail closed to a neutral 1.0 when `collegeStats` / `nflDraftMatches` are null, the daily projection snapshot defers its write until those load attempts settle so rookies aren't captured with neutral college/draft inputs — see integrations.md → *Projection snapshots → Input-settled gate*.

**Age multipliers:** keyed on **draft age** (`currentAge − years_exp`) when
`years_exp ≤ 1` and the value is in `[18, 28]`; otherwise current age. The
lookup is unchanged: ≤21 → ×1.15, 22 → ×1.05, 23 → ×0.95, 24+ → ×0.82.
`rookieAgeAtDraft` is recorded in `factors` (null when the draft-age guard
doesn't fire — e.g. year-3+ rookie-path hits, or implausible computed age).

**KTC multiplier:** `0.70 + (ktcPositionPercentile / 100) × 0.60` (range 0.70–1.30)

**College contribution** — `collegeContribution = clamp(collegeMult, 0.75, 1.25)` (bounded ±25%). `breakoutAgeFactor` is **capture-only** (recorded in `factors`, does **not** move `projectedPPG`) — see below:

- **collegeBase** — peakDominator ≥ 30 → 1.20, ≥ 20 → 1.08, else 0.92
- **productionTrend adjust** — improving +0.05, peak-final 0.00, declining −0.07, single-season −0.02
- **finalYearDominator adjust** (2+ college seasons, `r = finalYearDominator / peakDominator`) — r ≥ 0.85 → +0.03, r < 0.55 → −0.05, else 0.00
- **collegeMult** — `clamp(collegeBase + trend adjust + finalYear adjust, 0.80, 1.26)`
- **breakoutAgeFactor** (capture-only) — breakout age ≤ 19 → 1.05, 20 → 1.02, 21 → 1.00, 22 → 0.98, 23–24 → 0.96; neutral (1.00) if null or implausible. **Recorded for backtesting only — it does not enter `collegeContribution` and does not move `projectedPPG`** (demoted; see "College breakout-age factor (capture-only)" below). `breakoutAge` is still computed and still drives the College-Production chip in the Profile panel.

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
| Unmatched (incl. UDFA) | — | ×1.00 (nflDraftMultiplier only — see Realisation calibration below) |

The product `ageMult × ktcMult × collegeContribution × nflDraftMultiplier` is clamped to `[0.45, 1.85]` (`rookieMultiplierProduct`). This cap binds at the extremes (~top 1–3% stacked positive and bottom 1–3% stacked negative) and is inactive for the middle 95% of rookies. UDFAs and match misses are both treated as unmatched for the purposes of `nflDraftMultiplier` (×1.00). Since calibration arc slice 1, an unmatched player whose entry year (`(currentSeason + 1) − years_exp`) falls inside the app's loaded draft-year set takes the `undrafted` realisation discount below instead of staying neutral; an unmatched player whose entry year is outside that set (or missing inputs) stays `'unknown'` and neutral. Measured residual on `snapshots/2026-09-07.json`: 1 of 288 rookie-path rows is wrongly discounted this way — Robbie Ouzts (2025 r5), whose pick **is** present in the loaded draft data but is hard-skipped by `nflDraftMatch.js`'s `positionsCompatible` guard (nflverse lists him TE, Sleeper lists him RB). See [signal-registry.md](signal-registry.md) for the classification of `draftCapitalStatus` as an ephemeral-input, captured-for-grading factor.

Confidence = `'rookie'`. Projected games — see **Projected games**, below.

A rookie realisation ceiling (capping projections above what a rookie has historically reached) is explicitly deferred — the available rookie panel grades only second-season outcomes, never a debut season, so it cannot answer whether a *debut*-season rookie has been projected above what a rookie has reached; see [.claude/tasks/rookie-calibration.md](../.claude/tasks/rookie-calibration.md) §1 Q2 for the full reasoning.

### Projected games (calibration arc slice 2)

Every rookie-path player was projected at a flat 14 games, regardless of position, draft capital, or experience — measured mean absolute error 9.4 games per player, the largest single miscalibration in the projection (undrafted rookies realise a mean 3.2 games; a day-3 QB realises 1.9). `resolveRookieGames` (`src/utils/seasonProjection.js`) replaces the constant with a five-rung ladder, **first-hit-wins**: a cell absent from a table is absent on purpose (it failed that rung's own floor) and is never backfilled from a neighbouring cell.

**Group**, reusing the realisation-calibration grouping unchanged: `draftCapitalStatus === 'undrafted'` → `undrafted`; `'matched'` → `r1` (top-3/top-8/r1-mid/r1-late), `day2` (r2/r3), or `day3` (r4–r7). **Experience bucket:** `years_exp === 0` → `'0'`, `=== 1` → `'1'`, `>= 2` → `'2+'`, `null` → no bucket (skips both experience-keyed rungs).

**The ladder, in order, group/undrafted status `'matched'`/`'undrafted'`:**

1. **Rung 1 — group × position × experience**, floor n ≥ 30. 28 of 48 possible cells clear it; the full table (`ROOKIE_GAMES_GPE`) lives in source, with each cell's `n` in a trailing comment.
2. **Rung 2 — group × experience**, floor n ≥ 30. Exists because rung 3 is dominated by debut seasons (77–84% of the r1 and day2 populations), so an experience-blind cell over-projects a second- or third-year player by roughly 2×.

   | group | debut (`0`) | year 2 (`1`) | year 3+ (`2+`) |
   |---|---|---|---|
   | `r1` | 12.8 (n=127) | — (n=17, below floor) | — (n=8, below floor) |
   | `day2` | 12.3 (n=276) | 6.9 (n=44) | 4.0 (n=40) |
   | `day3` | 8.0 (n=632) | 4.0 (n=274) | 3.4 (n=213) |
   | `undrafted` | 3.3 (n=1036) | 2.5 (n=785) | 4.2 (n=396) |

3. **Rung 3 — group × position**, floor n ≥ 10. All 16 cells clear it.

   | group | QB | RB | WR | TE |
   |---|---|---|---|---|
   | `r1` | 10.5 (n=57) | 13.8 (n=18) | 12.8 (n=61) | 14.6 (n=16) |
   | `day2` | 4.7 (n=65) | 10.8 (n=91) | 13.1 (n=127) | 11.5 (n=77) |
   | `day3` | 2.1 (n=244) | 7.9 (n=303) | 6.7 (n=385) | 7.7 (n=187) |
   | `undrafted` | 1.3 (n=191) | 3.8 (n=564) | 2.9 (n=1006) | 4.0 (n=456) |

4. **Rung 4 — group pooled**, the last resort inside the group ladder, no floor: `r1` 12.2 (n=152) · `day2` 10.7 (n=360) · `day3` 6.2 (n=1119) · `undrafted` 3.2 (n=2217).

**A separate ladder for `draftCapitalStatus === 'unknown'`** (his draft capital is unknown, so key on what is known): position × experience over the **whole rookie-path population**, pooled across all four groups, every cell n ≥ 112.

| position | debut (`0`) | year 2 (`1`) | year 3+ (`2+`) | pooled |
|---|---|---|---|---|
| QB | 3.9 | 2.3 | 2.5 | 3.0 |
| RB | 7.6 | 3.0 | 4.5 | 5.9 |
| WR | 6.3 | 3.0 | 4.1 | 5.0 |
| TE | 7.0 | 4.5 | 5.2 | 6.0 |

**Rounding.** Every resolved value rounds to the nearest whole game (`Math.round`, half-up — load-bearing on four `.5` cells in the tables above and in source). Rounding costs 0.006 MAE against the unrounded table and both rendered surfaces (Market's games column, the pop-up's "N games projected" note) read as counts. The domain is `[0, 17]`; the floor is unreachable from any shipped cell (the smallest is 0.7, which rounds to 1) and is kept only as a guard against a bad future edit, not as a live branch.

**No lower clamp at 8.** The veteran path clamps projected games to `[8, 17]`; that floor belongs to a player with a qualifying history, and copying it to the rookie path would erase this slice's entire finding — day-3 and undrafted rookies routinely play far fewer than 8 games.

**Validation.** Leave-one-target-year-out (13 folds, one per target season 2013–2025, cells refit on the other 12 each fold, predictions rounded) over 3,848 rookie-path player-target-seasons: MAE 9.424 (constant 14) → 4.234 (group × position ladder, no experience rungs) → **4.055** (full ladder, rungs 1–4). The experience rungs' aggregate gain (0.18 games) is small by design — the point is the per-row error on the subpopulation they target (a second-year day-3 RB plays a mean 3.5 games where the experience-blind cell says 7.9), not the aggregate. Reproduced and pinned by `src/__tests__/rookieAvailability.test.js` against a fixture assembled from `nfl/season-totals/*` and `nflverse/playerids.json` — **no committed data-repo artifact backs this panel** (unlike the realisation-calibration fixture, which is a trimmed copy of a SHA-anchored data-repo artifact); the fixture's own `source` block carries the full join and predicate as the interim provenance story. Session 1 derived the panel on 2026-09-09 (the date the filename carries); the implementing session independently re-derived it on 2026-09-11 from the same two families, and the two derivations agreed on every shipped value, every n, and the 9.424 LOCO baseline. See [.claude/tasks/rookie-availability.md](../.claude/tasks/rookie-availability.md) §5 and §7 item 1 (a committed availability panel, filed as a data-repo ask, not planned in this slice).

**Rejected: depth-chart input.** Week-1 depth order is the single strongest predictor of games in isolation (LOYO MAE 3.593 against 4.493 for draft group alone, both on the debut population), but rejected on a source mismatch, not a weak signal: almost all of its power sits in the "off the depth chart" bucket, and "off the nflverse week-1 chart" (52% of the historical debut population) and "Sleeper `depth_chart_order == null`" (31% of the comparable live population, since Sleeper's chart runs deeper) are different populations — fitting on one and applying to the other is the same reconstruction-error trap slice 1's own §8.1 analysis stopped a veteran constant on. Restricted to the part that *does* transfer (depth 1 vs. depth 2, the source-invariant part), depth alone scores worse than group × position (5.144) and adds only 0.155 games (~3.6%) on top of the group ladder. There is also no rookie equivalent of the veteran staleness guard (`depthStale` keys on last season's `gamesStarted`, which a rookie does not have).

**A known, bounded residual: this multiplies two separately-fitted terms.** The realisation-calibration PPG constants are conditioned on a `gp ≥ 6` outcome gate — they estimate points *per game given a real season*. Multiplying by unconditional mean games therefore overstates expected total points wherever low-game players also score less per game, as they do. Bounded by the share of a cohort's games contributed by its `≥ 6`-game population — r1 98%, day2 97%, day3 90%, undrafted 82% — which implies an overstatement of r1 2%, day2 3%, day3 10%, **undrafted 18%** (worst case). Still a large improvement on today's error for that population (+320%, 14 games against a realised 3.2). The proper fix — project PPG given a real season, project the probability of playing, combine — needs a second fitted model and is deliberately out of scope for this slice; see `.claude/tasks/rookie-availability.md` §3 item 4 and §7 item 2.

**Two known residuals, recorded so they are not mistaken for oversights:**
- Five of the 46 live rookie-path rows at `years_exp ≥ 2` (measured on `snapshots/2026-09-07.json`) fall through rung 2 to the experience-blind rung 3, because their group × experience cell sits below the n ≥ 30 floor.
- The undrafted third-year-plus cell (rung 2) is **not monotone with experience** — 4.2 games against 2.5 in year two. An undrafted player still on a roster in year three has survived a selection; a scalar experience decay would get this backwards, which is why this is a keyed table rather than a multiplier.

### Realisation calibration (calibration arc slice 1)

Actual rookie-path outcomes systematically undershoot the pre-calibration model for undrafted players and day-3 (rounds 4–7) non-QB picks — verified against `sleeper-dashboard-data backtests/2026-09-06-fullpipeline-panel.json` `rookiePanel.rows` (1,056 graded rookie-path seasons, predictor years 2013–2024, outcome gate `gp ≥ 6`). `draftCapitalStatus` (`src/utils/seasonProjection.js` `resolveDraftCapitalStatus`) resolves to:

- `'matched'` — `nflDraftMatchSource === 'matched'` (a real NFL draft-slot join).
- `'undrafted'` — unmatched, with `entryYear = (currentSeason + 1) − years_exp` a member of the app's loaded draft-year set (`nflDraftYears`, filtered to years with ≥1 loaded pick). A **set-membership test, not a min-to-max range** — a range test would let a store-down year served as `[]`, or an interior gap in a cached `picksByYear`, silently match a year with no actual data.
- `'unknown'` — anything else (missing inputs, or an entry year outside the loaded set, e.g. a player who entered the league before the app's `MIN_DRAFT_YEAR = 2017` floor). `'unknown'` takes **no discount** — failing closed to neutral rather than guessing.

`resolveRookieCalibration` (`src/utils/seasonProjection.js`) applies a group × position constant:

**Groups:** `r1` = {top-3, top-8, r1-mid, r1-late}, `day2` = {r2, r3}, `day3` = {r4, r5, r6, r7}, `undrafted` = the `draftCapitalStatus === 'undrafted'` population.

**Shipped constants** (ratio of means, Σ realised PPG ÷ Σ projected PPG, per group × position):

| group | QB | RB | WR | TE |
|---|---|---|---|---|
| `undrafted` | 0.67 (n=14) | 0.33 (n=101) | 0.36 (n=150) | 0.28 (n=101) |
| `day3` | 1.00 — no-op (n=31) | 0.80 (n=116) | 0.79 (n=128) | 0.71 (n=83) |
| `r1`, `day2` | 1.00 — no correction (see below) | | | |

**Minimum-n rule** (verbatim from `.claude/tasks/rookie-calibration.md` §3(c)):

1. A cell with **n ≥ 30** uses its own ratio of means.
2. A cell with **10 ≤ n < 30** uses its own ratio, floored at the group-pooled ratio and capped at 1.00. Only `undrafted:QB` (n=14) is in this band; its own 0.668 stands, and it beats both the m=20-shrunk 0.486 and the position-pooled 0.359 out of sample.
3. A cell with **n < 10 is held at 1.00 — no correction.** It never inherits a neighbouring tier: a neighbouring tier is a different population.
4. No further shrinkage — the grouping has already done the smoothing.
5. **Every cell above 1.00 is clamped to 1.00.** `day3:QB` (raw 1.10, n=31) therefore ships as **1.00**, not as a lift: its 31 rows are day-3 QBs who reached the panel's `gp ≥ 6` outcome gate — survivors who won a job — so no day-3 lift is defensible on a survivor-selected cell. `rookieCalibrationBasis` still records `'day3:QB'` on these rows (with `rookieCalibrationMult: 1.00`) so the population stays visible for a future revisit; it emits no `adjustmentSummary` line, since that gate is on the multiplier actually moving `projectedPPG`.

**Out-of-sample validation:** leave-one-predictor-year-out (12 folds, constants refit on the other 11 years each fold) over all 1,056 rows — MAE 3.788 → 2.716 (−28.3%), mean bias +1.490 → −0.358 (over-projection → near-neutral). Per position: QB 4.621 → 4.509, RB 4.692 → 3.227, WR 3.551 → 2.528, TE 2.775 → 1.670 — every position improves. Reproduced and pinned by `src/__tests__/rookieCalibration.test.js` against a committed fixture (`src/__fixtures__/rookie-panel-2026-09-06.json`), so the correction cannot drift from its evidence without a red test.

**Known biases, stated rather than hidden:**

- **The constants under-correct the live stack.** They are fitted on a panel reconstruction that holds `ktcMult` and `collegeContribution` at 1.0 (the panel's own disclosed deviation); the live stack's actual uplift over `age × draft` alone is ×1.046 (undrafted) and ×1.094 (day-3), so shipping the panel's own ratio under-corrects by roughly 5% (undrafted) and 9% (day-3). Under-correction is the safer direction, so the constants ship unadjusted rather than pre-compensated for a gap that itself carries uncertainty.
- **The panel grades second seasons, never debut seasons.** Every panel row's outcome is the predictor year + 1 for a player who already appeared in the predictor year — a systematically easier population than the true debut season most rookie-path rows represent.
- **`day3:QB` is a survivor-selected cell held at 1.00, not lifted.** Its raw ratio (1.10, n=31) reflects day-3 QBs who won a job and reached `gp ≥ 6`; the population of day-3 QBs who never played is invisible to the panel, so the raw ratio overstates how good a random day-3 QB pick actually is. Rule 3/5 above hold it at the no-correction default rather than trusting the raw number.

**One accepted non-monotonicity.** For QB, the effective multiplier for an undrafted player (0.67) sits **above** a 7th-rounder's (0.58 × 1.00). The panel says so, and rule 3 forbids inventing a smoother number: `r7:QB` is n=3, far below the n≥10 floor, so it takes no correction at all, while `undrafted:QB` (n=14) does. For RB, WR and TE the effective multiplier is monotone across all eleven draft states. This is a consequence of the minimum-n rule, not a modelling claim that being undrafted is better than being drafted in round 7.

An **early-round lift** (raising `r1`/`day2` projections to match the panel's own ratios, ×1.119 for r1 and ×1.142 for day-2) was evaluated and rejected: under the shipped protocol it makes leave-one-year-out MAE *worse*, not better, in both a group-scoped and a wider variant — 2.7155 downward-only vs. 2.7228 lifting `r1`/`day2` only, vs. 2.7276 lifting `r1`/`day2`/`day3` (the wider variant additionally un-pins `day3:QB`'s raw 1.10 ratio) — and the panel's early-tier "under-projection" is itself an artifact of holding `ktcMult`/`collegeContribution` at 1.0 — the live stack already sits at or above the panel's realised mean for top picks (e.g. the panel's mean top-8 RB projection is 11.9 PPG against a realised 17.9, while the live stack projects a 97th-percentile-KTC, ceiling-college RB at 16.7). `src/__tests__/rookieCalibration.test.js` asserts both variants stay rejected.

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

### College breakout-age factor (capture-only)

The rookie path records `breakoutAge` and `breakoutAgeFactor` for backtesting. They are **diagnostic only —
they do not move `projectedPPG`** and add no `adjustmentSummary` lines. `breakoutAge` is computed by
`computeCollegeMetrics` (`src/utils/collegeMetrics.js`) and also feeds the College-Production breakout-age
chip (see docs/ui.md). `breakoutAgeFactor` was an active rookie multiplier in earlier batches; it was demoted
to capture-only (breakout age's standalone predictive signal was weak once `collegeMult` and NFL draft slot
were in the model). Vet path does not compute these keys.

---

## Career comparables (`src/utils/careerComps.js`)

`findCareerComps(playerId, playersMap, careerStats, positionPeakPPG, topN = 3)`

Finds up to 3 players at the same position whose career arc most closely matches the profiled player's. Session-cached per player in a module-level `Map`.

**Career arc vector:** normalised PPG per qualifying season (gp ≥ 8), sorted ascending. `normalisedPPG = PPG / positionPeakPPG`, clamped to [0, 1.5].

**Similarity:** Euclidean distance over the overlap, converted to `1 / (1 + distance)`. Only candidates with similarity ≥ 0.60 are kept.

Each comp includes `theirSubsequentSeasons` — what the comp did after the overlap point.

Comps are skipped for prospects (`confidence === 'prospect'`).

> **Projection reuse:** `findCareerComps` and `compsProjectedPPG` are also called by the season-projection veteran pipeline via `src/utils/compsIntegration.js` (Step 9). The same session-level `compsCache` Map serves both callers — the profile panel's first lookup amortises the cost for the pipeline, and vice versa.
