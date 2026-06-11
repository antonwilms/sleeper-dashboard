Deep reference for empirical age curves and dynasty scoring.

## Empirical age curves (`computeEmpiricalAgeCurves`)

Iterates all of `careerStats` to build position-level age productivity curves. Requires `gamesPlayed ≥ 10` per player-season. Groups by `(position, estimatedAge)`, computes median PPG per bucket, applies a 3-point rolling average, and finds the empirical peak. Player-seasons with non-finite PPG are excluded from the age buckets (dev-mode `console.warn`) so one corrupted value cannot poison a position cohort's median curve point or `positionPeakPPG`. Peak is capped to remove survivorship bias:

| Position | Capped peak age |
|---|---|
| QB | 32 |
| RB | 25 |
| WR | 28 |
| TE | 29 |

Outputs `curves` (used for age-adjusted scoring) and `positionPeakPPG` (normalisation baseline throughout dynasty scoring).

---

## Dynasty scoring (`src/utils/dynastyScore.js`)

`computeDynastyScore(playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, dynastyDraftPick, scoringSettings, ktcMap, teamContext, depthMap, historicalShares)`

Returns:
```js
{
  score,        // integer 0–100
  label,        // string
  confidence,   // 'prospect' | 'low' | 'moderate' | 'high' | 'none'
  isRookie,
  components,   // null for prospects; object with 5 component scores
  signals,      // special flags and derived values
}
```

### Routing logic

| Path | Condition | Score | Confidence |
|---|---|---|---|
| **A — True prospect** | `years_exp === 0` OR (`years_exp ≤ 3` AND no qualifying seasons AND has KTC) | prospect score | `'prospect'` |
| **A2 — Unproven vet** | Vet with no qualifying seasons and no KTC signal | `15 + (ktcPct ?? 0) × 0.20` | `'none'` (label: "Limited Data") |
| **A3 — Stale data** | `seasonsSinceLastQS ≥ 2` (qualifying seasons exist but ≥ 2 seasons ago) | same as A2, `isStaleData: true` | `'none'` (label: "Limited Data") |
| **A4 — Data gap** | No qualifying seasons and no other gate matched (e.g. `years_exp: null` in Sleeper metadata) | same as A2, `isDataGap: true` | `'none'` (label: "Limited Data") |
| **B — Small sample** | 1–2 qualifying seasons | `prospectScore × 0.4 + componentScore × 0.6` | `'low'` |
| **C — Full evidence** | 3+ qualifying seasons | pure component score | `'moderate'` (3–4) / `'high'` (5+) |

A qualifying season requires `gamesPlayed ≥ 8`.

Seasons with non-finite `fantasyPoints` or `gamesPlayed` are excluded from `seasonHistory` (and from `recencyWeightedPPG`) with a dev-mode `console.warn` — one corrupted season degrades to "season skipped". If the composite still produces a non-finite `finalScore` (corrupted share/context inputs), a finalization guard returns the Limited Data result with `isNonFinite: true` instead of emitting NaN.

**No-market-signal cap:** Prospect scores (PATH A) are capped at 35 when `hasMarketSignal` is false. `hasMarketSignal = ktcInfluenced || hasPremiumPick` (R1 or R2 draft pick). This prevents unrecognised players from receiving inflated dynasty scores.

### Prospect scoring (`computeProspectScore`)

```
priorPPG = POSITION_PRIOR_PPG[pos] × ageMultiplier(age) × draftMultiplier(pick)
priorScore = normalisePPG(priorPPG, peakPPG) × 100
```

If current-season games exist, actual PPG is blended in (Bayesian update with prior weight 8). The evidence blend is skipped (prior-only score, dev-mode `console.warn`) when the current-season `fantasyPoints`/`gamesPlayed` are non-finite. If a KTC position percentile is available, it anchors 60% of the final score (`ktcPercentile × 0.60 + priorScore × 0.40`).

**Position prior PPG:** QB 14, RB 12, WR 9, TE 7

**Age multipliers:** ≤21 → 1.20, 22 → 1.10, 23 → 1.00, 24 → 0.88, 25+ → 0.75

**Draft capital multipliers:** R1 picks 1–3 → 1.30, picks 4–8 → 1.15, picks 9–12 → 1.05, R2 → 0.90, R3 → 0.78, R4+ → 0.65, no data → 0.75

### Component scores (Paths B and C)

| Component | Weight | What it measures |
|---|---|---|
| Age-adjusted | 28% | Current PPG relative to empirical age curve at this age |
| Trajectory | 25% | Weighted linear regression slope over career seasons |
| Current level | 22% | Recency-weighted PPG percentile vs. same position |
| Opportunity quality | 15% | Efficiency percentile (55%) × volume percentile (45%) |
| Reliability | 10% | Consistency (CV, 45%) + durability (recency-weighted GP, 55%) |

> **Consistency — single source of truth:** `dynastyScore.js` imports `computeConsistency` from `src/utils/regressionSignals.js`; the season-projection pipeline uses the same import (Step 4). The `< 3`-season `null` return is mapped to the historical default of 50 inside `dynastyScore.js` (`?? 50`).
>
> **Trajectory — intentionally NOT shared:** `regressionSignals.computeTrajectory` floors the denominator at `max(meanPPG, 4)` as a projection-specific stability guard, whereas `dynastyScore.js` uses an unfloored `slope / meanPPG`. They are intentionally distinct and must not be unified. See `src/utils/regressionSignals.js` header and the inline comment near the trajectory block in `dynastyScore.js`.

**Opportunity quality modifiers (applied in order):**

1. **Depth chart** (from `depth_chart_order`): Starter → ×1.15, Backup → ×0.90, Depth 3+ → ×0.70 + label capped at "Solid Floor"
2. **Share trend boost** (from `historicalShares` via `computeShareTrend`): flat ±points on the OQ component:

| Trend label | Boost |
|---|---|
| growing | +8 pts |
| expanding | +4 pts |
| stable | 0 |
| shrinking | −4 pts |
| declining | −8 pts |

3. **QB quality modifier** (WR/TE/RB only): 15% weight blended into OQ based on `computeQBQualityByTeam`.

**Share trend labels** (from `computeShareTrend` in `teamContext.js`):
- Weighted prior: most recent season 50%, prior 30%, oldest 20%
- `growing` (>10% increase), `expanding` (>3%), `stable` (within 3%), `shrinking` (>3% decrease), `declining` (>10% decrease)
- Volatility: `entrenched` (<5% std dev), `moderate` (5–10%), `volatile` (>10%)

**Reliability:**
- Consistency: `clamp(100 − CV × 100, 0, 100)` — requires ≥ 3 qualifying seasons
- Durability: recency-weighted GP/17, penalised ×0.85 for 2+ injury seasons, ×0.70 for 3+
- Injury season = `gamesPlayed < 10 AND dnpWeeks ≥ 3` AND the player was a meaningful contributor (this season or an adjacent one)
- Contributor evidence (any one): snap share `off_snp / tm_off_snp ≥ 0.40`, OR `gamesStarted ≥ 4` with a start rate ≥ 0.50, OR per-game volume above the position floor (QB `pass_att/gp ≥ 15`; RB `rush_att/gp ≥ 8`; WR/TE `rec_tgt/gp ≥ 4`)
- Backup seasons (gs=0, thin stats, below all volume/snap floors) are **not** counted as injury seasons even when gp and dnp thresholds trigger
- Full-IR seasons (gp=0, dnp≥3) count when an adjacent season (±1 year) shows contributor evidence ("adjacent rescue") — `dynastyScore.js` iterates `allSeasons` (including gp=0 seasons) intentionally; see `src/utils/durabilitySignals.js`

### TD dependency signal

If `tdDependency > 0.40`, `isTdReliant = true` and reliability is penalised ×0.90.

### Special signals

- **isBreakout**: age ≤ 24, rawRatio > 1.3 (performing 30%+ above age-expected)
- **isBounceBack**: previous season < 10 GP, current PPG ≥ prior career bests
- **Single source of truth:** `isBreakout`, `isBounceBack` and `isTdReliant` are computed by `src/utils/projectionSignals.js` (`computeBreakoutFlag` / `computeBounceBackFlag` / `computeTdReliance`) and imported by **both** `dynastyScore.js` and the season-projection veteran pipeline (Step 5c). `dynastyScore.js` maps the helper's `null` `tdDependency` (no scoring settings) back to `0`. See [Next-season projections § Step 5c](projection.md).
- **momentum**: labels — accelerating (>0.20), improving (>0.05), stable (≥−0.05), slowing (≥−0.20), decelerating
- **shareTrendLabel / shareVolatility / currentShare**: exposed from share history

### Late-career gate

Players ≥ 5 years past their position's capped peak age bypass standard label logic. Late-career labels: Veteran Producer (≥ 55), Managed Decline (≥ 40), Sell Now (≥ 20), Fading.

### Depth chart label gate

`depth_chart_order ≥ 3` → label capped at "Solid Floor". Late-career gate takes priority.

### Label table

| Label | Color | Routing |
|---|---|---|
| Elite Prospect | Purple | Prospect, score ≥ 70, age ≤ 22 |
| High Prospect | Purple | Prospect, score ≥ 70, age ≤ 24 |
| Prospect | Purple | Prospect, score ≥ 50 |
| Late Prospect | Purple | Prospect, has draft pick data |
| Unranked Prospect | Purple | Prospect, no draft data |
| Breakout | Green | isBreakout signal |
| Elite | Green | score ≥ 80, not late-career |
| Ascending Star | Green | score ≥ 70, positive slope |
| Peak Window | Green | score ≥ 70 |
| Developing | Blue | score ≥ 55, age ≤ 25 |
| Rising | Blue | score ≥ 55, positive slope |
| Solid Floor | Blue | score ≥ 55 |
| Bounce-back | Blue | isBounceBack signal |
| Plateau | Yellow | score ≥ 40, slope ≥ 0 |
| Veteran Producer | Slate | Late-career, score ≥ 55 |
| Managed Decline | Orange | Late-career score ≥ 40, or standard score ≥ 40 with negative slope |
| Sell Now | Red | score ≥ 20 |
| Fading | Red | score < 20 |

> **Note (post-D1):** Dynasty score still uses the per-league rookie-pick proxy (`leagueData.rookieDraftPicks`) for prospect scoring; the next-season projection (`src/utils/seasonProjection.js`) uses actual NFL draft slot instead. This is intentional — Thread D batches do not modify `dynastyScore.js`. A future batch may unify if needed (see [projection.md](projection.md)).
