# Projection signal: team-aggregated red-zone share (D3)

**Type:** new projection signal (vet path), empirically-gated active vs capture-only
**Model for implementation:** sonnet (this file is the handoff; opus wrote it without editing source)
**Decision: ACTIVE** — the data is decisive (unlike aDOT). See verification below.

---

## TL;DR

Team-RZ-share = a player's RZ opportunities ÷ their team's total RZ opportunities. Distinct from D2's own-rate RZ usage (which is the player's RZ opportunities ÷ their *own* opportunities). Empirically it is **distinct** from own-rate (corr ≈ 0.39), carries **real marginal signal** over own-rate + overall-share + snap-share (standardized partial β ≈ 0.20 RB / 0.17 WR-TE, positive — while own-rate's own partial β is *negative*), and is **cleanly monotonic** with next-season PPG. → **Active 10th factor** inside the existing `combinedNewFactor` envelope `[0.67, 1.50]`, ±5% magnitude, cohort-percentile-with-shrinkage normalization (D2 pattern). The envelope still holds (the new factor never hits its own rail; worst-case stack ≈ 1.46 < 1.50) but top headroom is now thin — flag `combinedNewFactorRaw` p95 for monitoring.

---

## Verification findings (empirical, 2012–2025 data-repo season-totals + Sleeper players map)

All numbers below are from running the analysis against `../sleeper-dashboard-data/nfl/season-totals/*.json` (14 seasons) with team/position from `../sleeper-dashboard-data/raw/-players-nfl.json`, mirroring the **current-team aggregation convention** of `computeHistoricalTeamTotals` (the existing share signal's denominator builder).

### 1. Denominator construction sanity (2024, 32 teams)
- `rush_rz_att` per team: min 10, median 61, mean 63, max 154 (PHI — tush-push era, plausible).
- `rec_rz_tgt` per team: min 24, median 52, mean 55, max 102.
- No zero/empty teams. Magnitudes land in the expected NFL range (≈40–70 RZ rushes, 50–90 RZ targets).
- **Caveat (the key data-quality limitation):** denominators are summed over *currently-active players only* (the documented `computeHistoricalTeamTotals` limitation, teamContext.js:120–123). Retired/departed players' RZ work is absent, so some teams undercount (e.g. LV rush 10, CLE 11) → shares for remaining players slightly inflate. This is **the same limitation the live share-trend signal already accepts**, and it is mostly harmless for the *most-recent* season (which is what we score) because current rosters are ≈ correct there. The team-denominator minimum guard (below) protects against the worst tiny-denominator cases.

### 2. Coverage by season (qualifying gp≥8 skill players with the field present)
- RB `rush_rz_att`: 2012 weak (43/73 = 59%); **2013–2025 solid (85–95%)**.
- WR/TE `rec_rz_tgt`: 2012 weak (94/190 = 49%); **2013–2025 solid (~80–90%)**.
- Since active players' most-recent qualifying season is ≈ current, coverage for the scored season is excellent. Pre-2013-only players are rare/inactive → degrade to neutral.

### 3. Aggregation-trap (C4) check — PASSES
Across all 3,082 player-seasons with `rush_rz_att`: **0 non-integer values** (it's a counting stat, sums correctly week→season, unlike the rate `pass_rtg` that broke C4) and only 2 `rz>att` impossibilities (0.06% — negligible noise). **Safe to build denominators on these fields.**

### 4. Distinctness from own-rate (D2) — DISTINCT
`corr(own-rate, team-RZ-share)` = **0.384 (RB, n=205)**, **0.396 (WR/TE, n=522)**. Low-moderate — nowhere near the ~0.9 that would mean redundancy. Worked examples (2024 RB; gates: rush_att≥20, team rushRz≥20):
- **High team-share / low own-rate (goal-line workhorses, diluted by between-the-20s usage):** De'Von Achane (team 0.76 / own 0.19 → next PPG 19.6), Rhamondre Stevenson (0.83 / 0.19 → 12.5), Chase Brown (0.79 / 0.19 → 15.8).
- **Low team-share / high own-rate (scrubs whose few carries happen to be RZ):** Carson Steele (0.06 / 0.18), Julius Chestnut (0.06 / 0.18 → 0.5), Tyler Goodson (0.05 / 0.19 → 0.7).

Own-rate cannot tell Achane from Goodson (both ≈0.19); team-share cleanly separates the franchise back from the practice-squad body. They measure genuinely different things: own-rate = *role concentration*; team-share = *share of team RZ value*.

### 5. Marginal signal vs next-season PPG — REAL (the decisive check)
Standardized OLS `nextPPG ~ teamRzShare + ownRate + overallShare + snapShare`:
| Group | n | simple corr(teamRzShare, nextPPG) | **partial β teamRzShare** | β ownRate | β overallShare | β snap |
|---|---|---|---|---|---|---|
| RB | 179 | 0.579 | **+0.202** | −0.068 | +0.307 | +0.262 |
| WR/TE | 482 | 0.493 | **+0.168** | −0.101 | +0.347 | +0.159 |

Team-RZ-share's partial β is positive and **comparable to snap-share**, and it **survives controlling for own-rate, overall-share, and snap-share**. Strikingly, **own-rate's partial β is negative** — D2's own-rate adds ~nil/negative once team-share and volume are in the model. Team-share carries the RZ predictive signal that own-rate does not. This is the **opposite of the aDOT result** (which was flat/nil) → active is justified.

### 6. Monotonicity — CLEAN
Quintiles of team-RZ-share → mean next-season PPG:
- **RB:** 4.6 → 8.8 → 11.4 → 13.4 → 13.3 (monotone up, plateaus at top).
- **WR/TE:** 4.6 → 5.9 → 7.7 → 9.3 → 10.7 (every quintile steps up).

A value gradient, exactly as hypothesized for a value (not role) signal.

---

## Design choice: ACTIVE

Distinct (4) + real marginal signal beating own-rate (5) + monotone (6) ⇒ **active PPG multiplier**, joining `combinedNewFactor` as the 10th factor. Not capture-only. Magnitude ±5% (justification under "Stacking").

---

## Per-position signal spec

Mirror D2 (`usageMetrics.js`) exactly — cohort-percentile + shrinkage-to-50 + single clamp — but with a **team denominator** that per-player stats can't supply (the infrastructure difference from D2).

| Position | Numerator (player) | Denominator (team, scored season) | Player opp gate | Team denom gate |
|---|---|---|---|---|
| RB | `rush_rz_att` | team Σ `rush_rz_att` | `rush_att ≥ 30` | team rushRz `≥ 20` |
| WR/TE | `rec_rz_tgt` | team Σ `rec_rz_tgt` | `rec_tgt ≥ 20` | team recRz `≥ 20` |
| QB | — | — | **gated out** | — |

- **QB gate rationale:** one passer per team ⇒ the starter owns ≈100% of team RZ pass attempts → ~zero discrimination (structural, no data needed; mirrors D2's QB snap-share gate). QBs return the neutral factor 1.0.
- **Normalization: cohort percentile + shrinkage** (NOT raw share). Reasons: (a) keeps it consistent with every other factor and position-comparable; (b) shrinkage neutralizes low-sample players; (c) raw share's level varies by position (RB shares run higher than WR/TE). Exactly the D2 machinery:
  - cohort pool = team-RZ-share of every qualifying player in the **reference (most-recent) season**, pooled per position, cached by `careerStats` identity (mirror `usageMetrics.cohortCache`).
  - `pct = percentileRank(pool, share)`; `shrunkPct = (opp·pct + shrinkK·50)/(opp + shrinkK)` with `shrinkK` in opportunity units (reuse D2: **RB 40, WR/TE 25**); `index = (shrunkPct−50)/50 ∈ [−1,1]`; `factor = clamp(1 + index·0.05, 0.95, 1.05)`.
- **Aggregation across seasons: most recent qualifying season** (= `lastQ.season` in `seasonProjection.js`; B1b/D2 convention). The team denominator must be for **that same season** and the player's (current) team: `historicalTeamTotals[lastQ.season][player.team]`.
- **Multiplier shape:** `±5%`, `[0.95, 1.05]`, neutral 1.0. (Matches the D2 RZ family. ±6% is defensible given the signal strength but eats the thin top headroom — see Stacking. Recommend ±5%.)

---

## Infrastructure & data flow

Two pieces, split along the existing architecture (teamContext aggregates; a per-signal module computes the factor):

### A. Team-RZ denominators — extend `computeHistoricalTeamTotals` (teamContext.js, additive)
Add two accumulators to the existing per-team object (teamContext.js:132–136):
```diff
- if (!teamTotals[team]) teamTotals[team] = { rushAtt: 0, rec: 0, recTgt: 0 }
+ if (!teamTotals[team]) teamTotals[team] = { rushAtt: 0, rec: 0, recTgt: 0, rushRz: 0, recRz: 0 }
  const s = data.stats ?? {}
  teamTotals[team].rushAtt += s.rush_att ?? 0
  teamTotals[team].rec    += s.rec      ?? 0
  teamTotals[team].recTgt += s.rec_tgt  ?? 0
+ teamTotals[team].rushRz += s.rush_rz_att ?? 0
+ teamTotals[team].recRz  += s.rec_rz_tgt  ?? 0
```
This is purely additive — `computeHistoricalShares` ignores the new fields, so its behavior is byte-identical. The RZ denominators inherit the exact team-assignment semantics (current team, gp≥1) of the live share signal — deliberate, for consistency.

### B. New factor module — `src/utils/teamRzShare.js`
A dedicated per-signal module (precedent: momentum.js, projectionSignals.js, efficiencyMetrics.js, usageMetrics.js — one module + one test per signal). It needs module-level cohort caching, which argues against inlining in seasonProjection.js. Proposed export:
```js
// computeTeamRzShareFactor(position, lastSeasonStats, season, playerTeam,
//                          historicalTeamTotals, careerStats, playersMap)
//   → { teamRzShare: number|null, teamRzShareFactor: number, teamRzShareCategory: 'rush'|'rec'|null }
```
Behavior:
- NEUTRAL `{ teamRzShare: null, teamRzShareFactor: 1.0, teamRzShareCategory: null }` when: position is QB or unsupported; no `lastSeasonStats`; no `playerTeam`; no `historicalTeamTotals[season][playerTeam]`; team denom `< 20`; player opp below gate; non-finite.
- Cohort (cached by `careerStats` identity): for the reference season `max(seasons)`, for each qualifying player compute their team-RZ-share (own ÷ `historicalTeamTotals[refSeason][theirTeam][denomKey]`, with the same gates), pooled per position. **The cohort builder therefore also needs `historicalTeamTotals`** — pass it in.
- Player share: `own = lastSeasonStats[rzKey] ?? 0`; `denom = historicalTeamTotals[season][playerTeam][denomKey]`; `share = own/denom`; percentile → shrink (shrinkK by position, sample = player opp) → `clamp(1 + index·0.05, 0.95, 1.05)`.
- Per-position config (RB: rzKey `rush_rz_att`, oppKey `rush_att`, denomKey `rushRz`, minOpp 30, shrinkK 40; WR/TE: `rec_rz_tgt`/`rec_tgt`/`recRz`, minOpp 20, shrinkK 25). `category` = 'rush' | 'rec'.

### C. Thread `historicalTeamTotals` into the projection (options object, one line each)
- `App.jsx`: `historicalTeamTotals` already exists (App.jsx:556). Add it to the `computeNextSeasonProjection({ … })` call object (App.jsx ~900–915) and to the `useMemo` dep array (App.jsx:936).
- `seasonProjection.js`: add `historicalTeamTotals` to the destructure (after `teamContext`, with `= null` default for safety, matching `qbQualityByTeam = null`).

### D. Wire the factor in `seasonProjection.js`
- After the `computeUsageFactors(...)` call (line ~436–446), call:
  ```js
  const { teamRzShare, teamRzShareFactor, teamRzShareCategory } =
    computeTeamRzShareFactor(position, lastSeasonRaw.stats, lastQ.season, player.team,
                             historicalTeamTotals, careerStats, playersMap)
  ```
  (`lastQ.season`, `lastSeasonRaw`, `player.team` are all already in scope at line 374–375.)
- Add `* teamRzShareFactor` to `combinedNewFactorRaw` (line 528–531) → it becomes the 10th factor. Update the block comment: 9→10 factors, name the new one (D3: teamRzShare), and update the "watch realized p95… factor #13–14" note (we're at #10).
- `adjustmentSummary` (after line 585), mirroring the D2 lines:
  ```js
  if (teamRzShareFactor > 1.02) adjustmentSummary.push('High red-zone share ↑')
  if (teamRzShareFactor < 0.98) adjustmentSummary.push('Low red-zone share ↓')
  ```
- Expose in the `factors` object (vet path, near the D2 keys at line 633–635): `teamRzShare` (raw, 3dp or null), `teamRzShareFactor` (3dp), `teamRzShareCategory` ('rush'|'rec'|null).
- **Rookie path:** add the same three keys as null/neutral sentinels (`teamRzShare: null, teamRzShareFactor: 1.0, teamRzShareCategory: null`) — rookies have no prior-year team-RZ data; out of scope for the active multiplier (do **not** multiply it into any rookie-path PPG). Schema-consistency only.

---

## Cross-batch interaction analysis (analysis only — nothing else is modified)

### vs D2 own-rate RZ usage (`rzUsageFactor`) — independent, mild compounding, correct
corr 0.39; they compose multiplicatively in `combinedNewFactor`. They capture *different players*: Achane (team 0.76 / own 0.19) gets a high team-share factor but a ~neutral own-rate factor — they do **not** both fire for him. Both fire only for a player who is simultaneously RZ-*concentrated* and RZ-*high-volume* — a genuine elite goal-line workhorse — where a mild compound (≈1.04×1.04≈1.08) is appropriate. Since own-rate's marginal signal is ~nil (verification 5), the compounding it contributes is weak. **No double-count; deliberately independent dimensions.**

### vs `tdRelianceFactor` (B1b, FROZEN) — desirable emergent interaction, no change
`tdRelianceFactor` penalizes >40%-from-TD players (volatility). team-RZ-share rewards structural RZ volume. Their multiplicative composition is self-correcting:
- tdReliant **+ high** team-RZ-share (goal-line workhorse, sustainable TDs): `0.93 × 1.04 ≈ 0.97` — the penalty is *softened* because the RZ role structurally supports the TDs. Arguably correct.
- tdReliant **+ low** team-RZ-share (fluky TDs not backed by RZ volume): `0.93 × ~1.0` — penalty stands. Correct.
This emerges for free from multiplication; **do not touch `tdRelianceFactor`.**

### vs share-trend (Step 4, `shareTrendMultiplier`) — distinct slices, both justified
Overall carry/target share (rush_att/team or rec_tgt/team) vs the RZ subset. A player can be high-overall/low-RZ (between-the-20s grinder, pass-catching back) or low-overall/high-RZ (goal-line specialist). The regression keeps both with independent positive β (overall 0.31/0.35, team-RZ 0.20/0.17 in the same model) → composing them (shareTrendMultiplier on rawPPG, teamRzShareFactor in combinedNewFactor) is not double-counting; RZ work is a different slice than total volume.

---

## Stacking analysis (the 10th factor)

Simulated realized team-RZ-share factor distribution (2024, n=294, ±5%, shrinkage applied): **min 0.970, p5 0.977, med 0.995, p95 1.037, max 1.041** — and it hits its own ±5% rail **0.0%** of the time (shrinkage keeps everyone gentle). At ±6%: [0.964, 1.050], still 0.0% at-rail.

Envelope check against the documented real-tail extremes of the existing 9-factor stack (min ≈0.72, max ≈1.39, incl. qbQuality ±5%):
| Magnitude | new combined min | new combined max | rail |
|---|---|---|---|
| ±5% | 0.684 | **1.460** | [0.67, 1.50] |
| ±6% | 0.677 | 1.473 | [0.67, 1.50] |

**Still inside the envelope at both magnitudes** — the rail remains a sanity guard, not a moderator, and the realized stack (measured max ≈1.328 × a stud's ~1.04 ≈ 1.38) is comfortably under 1.50. But the *theoretical* top is now ≈1.46 (±5%) — headroom is thin. **Recommendation: ±5%**, and **flag `combinedNewFactorRaw` p95 for monitoring** (the code comment already says: when realized p95 nears ~1.40, escalate to a normalized additive index rather than widening the rail — we are at factor #10, well short of the #13–14 trigger, but this is the first addition that meaningfully consumes top headroom). **Do not re-widen the envelope in this batch** (per constraint); if the empirical p95 starts climbing post-ship, flag a future restructure.

---

## Step sequence

1. **teamContext.js** — extend `computeHistoricalTeamTotals` with `rushRz`/`recRz` (additive). Run suite — `computeHistoricalShares` behavior must be unchanged.
2. **teamRzShare.js** (new) — implement `computeTeamRzShareFactor` + cohort cache, mirroring `usageMetrics.js`. Write `teamRzShare.test.js`.
3. **seasonProjection.js** — destructure `historicalTeamTotals`; call the factor; add `* teamRzShareFactor` to `combinedNewFactorRaw`; add adjustmentSummary lines; add the 3 vet + 3 rookie `factors` keys; update the combine-block comment (9→10).
4. **App.jsx** — pass `historicalTeamTotals` into the projection options + dep array.
5. **factories.js** — extend `makeSeasonEntry` (or via overrides) to carry `rush_rz_att`/`rec_rz_tgt`; extend `makeVet.asOptions()` to include `historicalTeamTotals` (and a default builder).
6. **Tests** — integration scenarios in `seasonProjection.test.js`; update `factorsSchema.test.js` counts/keys.
7. **Done-definition:** `npm test` green; `factorsSchema.test.js` + `statKeysContract.test.js` pass; `npm run build` clean; `npm run lint` no new errors.

---

## Edge cases
- **No team / team not in playersMap** → neutral 1.0.
- **Zero or tiny team denominator** (`< 20`) → neutral 1.0 (the LV/CLE undercount cases; guards against unstable shares).
- **Below player-opp gate** (rush_att<30 / rec_tgt<20) → not in cohort; factor neutral.
- **Field missing** (older seasons, pre-2013 tail) → `own = 0` or neutral; degrades to 1.0.
- **Mid-season trade / offseason move:** current-team attribution (mirrors `historicalShares`). For the scored (most-recent) season this is ≈ correct except for players moved *this* offseason, whose scored-season RZ work was on the prior team but is attributed to the new team's denominator — a bounded, documented limitation identical to the live share signal. Do not attempt historical-roster reconstruction (no data for it).
- **Retired teammates absent from denominator** → denominators undercount, shares inflate; the `≥20` team gate and shrinkage blunt the worst cases. Documented limitation, accepted (same as share-trend).

---

## Docs updates
- **`docs/projection.md`** — add a Step 5h (or D3) subsection describing team-RZ-share: formula per position, cohort-percentile+shrinkage normalization, ±5% multiplier, QB gate, the distinct-from-own-rate (D2) framing, and the current-team-denominator limitation. Add the 3 new `factors` keys to the factors-key listing.
- **`CLAUDE.md`** — (a) factors-contract invariant: bump **65→68 vet / 45→48 rookie** (the test is authoritative; +3 each). (b) Navigation map: add a `teamRzShare.js` row (`computeTeamRzShareFactor()` — team-aggregated red-zone share factor, D3); update the `teamContext.js` row to note `computeHistoricalTeamTotals` now also aggregates RZ denominators (`rushRz`/`recRz`); update the `seasonProjection.js` step count if it enumerates factors.

---

## Tests to add
- **`teamRzShare.test.js`** (new): high team-share → factor >1; low → <1; neutral when team missing / denom `<20` / below opp gate / QB; shrinkage pulls low-opp players toward 1.0; cohort built from reference season. Construct a small `careerStats` + `historicalTeamTotals` by hand.
- **`teamContext.js` coverage** (no existing test file): add a minimal `teamContext.test.js` (or fold into the module test) asserting `computeHistoricalTeamTotals` now emits `rushRz`/`recRz` summed correctly, and that `computeHistoricalShares` output is unchanged.
- **`seasonProjection.test.js`** (integration, via extended `makeVet`): (1) high team-RZ-share vet → `teamRzShareFactor > 1`, projectedPPG up, `'High red-zone share ↑'` in adjustmentSummary; (2) low share → factor <1, `'Low red-zone share ↓'`; (3) missing `historicalTeamTotals` → neutral 1.0, no summary line, projectedPPG unchanged vs baseline; (4) divergence case (high team-share, low own-rate) → team-share factor fires while `rzUsageFactor` stays ~neutral; (5) tdReliance composition (tdReliant + high team-RZ-share → softened net factor). Assert the new `factors` keys exist and are finite.
- **`factorsSchema.test.js`**: add `teamRzShare`, `teamRzShareFactor`, `teamRzShareCategory` to both the vet (52→55 explicit) and rookie (26→29 explicit) expected key sets; bump the documented totals (65→68, 45→48). The test asserts the exact key set both directions — update both lists.
- **`statKeysContract.test.js`**: **no change** — `rush_rz_att` / `rec_rz_tgt` are already in the contract (line 69, from D2) and present in the fixture. The team aggregation introduces no new stat key.

---

## Cross-repo impact

**None.** `rush_rz_att` and `rec_rz_tgt` are already consumed by D2 (`usageMetrics.js`), already in `statKeysContract.test.js`, and already preserved in the data repo's season-totals (confirmed present 2013–2025). The team aggregation reuses these existing fields — it adds **no new data-repo field dependency**, no schemaVersion bump, no manifest/enrichment/CFBD change. The projection-snapshot shape gains 3 diagnostic `factors` keys (a superset, like every prior signal batch) — the data repo tolerates additive `factors` growth (it stores `projection` verbatim); flag it in the task summary per convention, but it requires no data-repo code change. **State explicitly: no `sleeper-dashboard-data` change required.**

---

## Open questions
1. **Multiplier magnitude — ±5% (recommended) vs ±6%.** Both keep the stack inside `[0.67, 1.50]`; ±5% preserves more top headroom and matches the D2 RZ family; ±6% better reflects the signal's strength (partial β ≈ snap-share, which gets ±6%). Recommendation: **±5%**, revisit only if post-ship `combinedNewFactorRaw` p95 stays well below 1.40. Confirm if you'd prefer ±6%.
2. **New module vs teamContext function.** Plan puts the factor in a new `teamRzShare.js` (per-signal-module precedent + needs cohort cache) and only the *denominators* in teamContext. If you'd rather keep all team-RZ logic in teamContext.js, say so — but the cohort-cache + percentile machinery is a projection concern that fits the usageMetrics-style module better.
3. **Team-denominator floor (20).** Chosen from the 2024 distribution (min legit team ≈ 24 rec, 10 rush). If you want a stricter floor (e.g. 30) to further suppress undercounted-team noise, it trades a few neutral'd players for stability — low stakes either way.
