# Backend Health Audit — Deep-Core Pass (Pass 2)
_Date: 2026-06-10 | Read-only assessment | No source files edited._
_Scope: dynastyScore.js, seasonProjection.js, signal helpers, careerComps/compsIntegration, rookie/prospect path. Pass-1 findings (F1-A…F4-E) and the roadmap exclusion block are NOT re-reported; one-line confirmations only._

---

## TOP RECOMMENDATIONS

Ranked by value-to-effort. 1–4 are shippable without a backtest gate; 5–8 are projection-input changes and gated.

1. **Add a NaN/Infinity firewall at pipeline outputs** — `clamp()` passes NaN straight through (`Math.max(0, Math.min(40, NaN)) === NaN`); one non-finite `fantasyPoints` propagates untouched through all 13 steps, the comp blend, and into the UI. One `Number.isFinite` guard each on `projectedPPG` (seasonProjection.js) and `finalScore` (dynastyScore.js), with a dev-mode warn. (D1-B)
2. **Guard the `years_exp == null` + zero-qualifying-seasons path in `computeDynastyScore`** — currently throws `TypeError` at the components block and takes down the whole `playerRows` memo (white screen). Three-line guard routing to the A2 "Limited Data" return. (D1-C)
3. **Fix `draftMultiplier`'s 12-team assumption in `computeProspectScore`** — in leagues with >12 teams, Round-1 rookie picks 13+ fall through every R1 branch and get the R4+ multiplier (0.65), scoring a 1.13 worse than a 2.01. Add an R1 catch-all tier. (D1-D)
4. **Fix the 2-season degenerate case in `computeBounceBackFlag`** — for players with exactly 2 qualifying seasons whose first was 8–9 GP, the flag is **always true** regardless of current performance (`secondHighest` includes the current season, so `current >= min(prior, current)` is a tautology). Mislabels dynasty rows "Bounce-back" and applies an unconditional ×1.05 to the projection. The label-side fix is unambiguous; the multiplier side is technically a projection-input change — validate on a snapshot diff. (D1-A)
5. **Stop routing second-year players with a qualifying rookie season down the rookie projection path** — `years_exp ≤ 1` wins over `qualifying.length > 0`, so a rookie who just posted 15+ PPG over 17 games is projected from `baseline × multipliers` (hard ceiling ~12.9 PPG for a WR) with their actual season fully discarded. Backtest-gated, highest projection-accuracy upside in this report. (D3-A)
6. **Length-normalize career-comp similarity (RMS distance)** — raw Euclidean distance grows with overlap length, so the fixed 0.60 similarity floor systematically strips comps from long-career players; the comp blend silently turns off exactly where its stabilizing value is highest. Backtest-gated. (D2-E)
7. **Count sub-8-GP / zero-GP seasons in the projection's Step 6 durability inputs** — the vet path iterates `qualifying` only, so a full-IR season is invisible to `injurySeasons`, to the absence-shape refinement, and to `projectedGames`. Dynasty iterates `allSeasons` and catches it; the projection does not. Backtest-gated. (D2-C)
8. **Warn on unknown CFBD conference labels and guard the team-TD dominator denominator** — both currently fail silent (0.55 harsh default; `team.TD ?? 1` can inflate dominator by orders of magnitude). The dev-warn and the null-guard are shippable; any multiplier-default change is gated. (D1-E, D1-F)

---

## FINDINGS

### Lens 1 — Silent failure modes

#### D1-A: `computeBounceBackFlag` is always true for 2-season players after an 8–9 GP season

- **What**: `projectionSignals.js:54` computes `secondHighest = [...ppgs].sort(desc)[1]` over an array **that includes the current season**. With exactly 2 qualifying seasons, `sorted[1]` is `min(prior, current)`, so `currentPPG >= secondHighest` is a tautology — the flag fires for every 2-season player whose first qualifying season had 8–9 GP, no matter how poor the current season was. For ≥3 seasons the math accidentally reduces to "current ≥ second-best prior season", which is materially looser than the documented intent ("current PPG ≥ prior career bests", docs/dynasty-scoring.md): after a down year, beating the *injury season's own PPG* can be enough.
- **Where**: `src/utils/projectionSignals.js:47-56` (`computeBounceBackFlag`); consumed by `dynastyScore.js:872` (Bounce-back label, blue) and `seasonProjection.js:394-405` (×1.05 `bounceBackFactor` + adjustmentSummary line).
- **Why it matters**: 8–9 GP rookie or sophomore seasons are common (mid-season call-ups, injuries). Every such player's second qualifying season is unconditionally branded a bounce-back and gets +5% projected PPG — a systematic positive bias on exactly the small-sample population where the pipeline already has the least evidence. It also overrides more accurate dynasty labels (Bounce-back beats Elite/Developing in the label chain only below Breakout, but it pre-empts everything from Elite down).
- **Fix direction**: Compute `secondHighest` over `ppgs.slice(0, -1)` (priors only); when only one prior exists, require `currentPPG >= priorMax` alone. Decide explicitly whether "≥ second-best prior" is the intended softening for 3+ season careers and document it in the helper.
- **Effort / risk**: S — a 3-line change in a shared helper; both consumers shift simultaneously (that's the point of the shared module).
- **Gating**: Label-side effect shippable; the ×1.05 multiplier side is a projection-input change → validate via snapshot diff / backtest before shipping. Recommend shipping as one change with a before/after snapshot comparison.
- **Already known?**: No. Distinct from F2-C (which is about the flag being *unreachable* for <8-GP injury seasons; this is about it being *unavoidable* for 8–9 GP ones). The two are complementary halves of the same helper.

---

#### D1-B: No NaN/Infinity firewall — `clamp()` passes NaN through the entire multiplier stack

- **What**: Every helper module individually guards its own ratios (`isFinite` checks in efficiencyMetrics, usageMetrics, teamRzShare, regressionSignals — verified), but the **chain itself has no firewall**. `clamp(v, lo, hi)` is `Math.max(lo, Math.min(hi, v))`, and both Math functions propagate NaN. If `careerStats[s][pid].fantasyPoints` or `gamesPlayed` is ever NaN/non-finite (a single corrupted week in the live-API aggregation path, a malformed data-store file that slips past shape validation), then: `basePPG` → NaN → `rawPPG` → NaN → `pipelinePPG = clamp(NaN,0,40)` → NaN → `blendedPPG` → NaN → `projectedPPG`, `projectedTotalPts` → NaN, rendered as "NaN" in the UI. Identical exposure in `computeDynastyScore` (`Math.round(NaN)` → NaN score) and in `computeEmpiricalAgeCurves` (a NaN PPG poisons a median bucket → curve point → every player's ageAdjScore at that age).
- **Where**: `src/utils/seasonProjection.js:30` (clamp), `:591` (pipelinePPG), `:604` (projectedPPG); `src/utils/dynastyScore.js:554` (clamp), `:849-855` (componentScore); `src/utils/compsIntegration.js:60`.
- **Why it matters**: The pipeline's stated design is "degrade gracefully to neutral" — and the leaf modules honor it — but the trunk does not. One bad season-totals value silently converts a player's entire projection and dynasty score to NaN with no console signal, and because NaN fails every comparison, the row also silently drops out of ranks/divergence (`score == null` checks don't catch NaN).
- **Fix direction**: Two finalization guards: in `computeNextSeasonProjection`, after the comp blend, `if (!Number.isFinite(projectedPPG)) { warn-in-dev; return null }` (the existing null contract for non-skill positions already has consumers handling null); in `computeDynastyScore`, guard `finalScore` similarly and fall back to the A2-style Limited Data return. Optionally harden `qualifying`-array construction with an `isFinite(d.fantasyPoints)` filter so one bad season degrades to "season skipped" rather than "player nulled".
- **Effort / risk**: S — additive guards, zero behavior change on finite inputs; one unit test each with a NaN fixture.
- **Gating**: Shippable now.
- **Already known?**: No. Complements (does not duplicate) the stat-key contract test, which checks key *presence/finiteness in the fixture*, not runtime data.

---

#### D1-C: Latent crash: `years_exp == null` + zero qualifying seasons throws in `computeDynastyScore`

- **What**: Path A requires `yearsExp != null && yearsExp <= 1`; Path A2 requires `yearsExp != null && yearsExp >= 2`; Path A3 requires `seasonHistory.length > 0`. A player with `years_exp: null` in Sleeper's playerMap and no 8+-GP season skips all three gates and reaches the components block, where `seasonHistory[seasonHistory.length - 1].ppg` (dynastyScore.js:733) dereferences `undefined` → TypeError.
- **Where**: `src/utils/dynastyScore.js:629-733` (routing gates → components block). Trigger population: `computeDynastyScore` runs for **every** skill player in `playerIdSet` *before* the relevance filter (App.jsx:712 precedes the filter at :750), so any careerStats appearance (one week of GP>0, never 8 in a season) with null `years_exp` metadata is enough.
- **Why it matters**: The throw is inside the `playerRows` useMemo — it doesn't corrupt one row, it kills the entire pipeline and blanks the app. Sleeper metadata gaps (null `years_exp` on journeyman/practice-squad entries) are exactly the kind of upstream change that arrives without warning. The app has presumably never hit it because stat-producing players nearly always have `years_exp` set — which is what makes it latent rather than hypothetical.
- **Fix direction**: After the A3 gate, add `if (seasonHistory.length === 0) return <A2-style Limited Data result>` (covers the null-years_exp case and any future gate gap). Pure guard; no score change for any player who works today.
- **Effort / risk**: XS — 3 lines + one test with a null-`years_exp` fixture player.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### D1-D: `draftMultiplier` assumes a 12-team league — R1 picks 13+ get the R4+ multiplier

- **What**: `dynastyScore.js:464-474` checks `round === 1 && pickNo <= 3 / 8 / 12`. `pickNo` is Sleeper's `pick_no` — the **overall** pick number (App.jsx:1105), which within round 1 equals the slot. In a 14- or 16-team league, R1 picks 13–16 match no R1 branch, fail `round === 2/3`, and fall to the terminal `0.65` — below R2's 0.90 and R3's 0.78. A late-first rookie pick (premium capital) scores worse than a third-rounder.
- **Where**: `src/utils/dynastyScore.js:464-474` (`draftMultiplier`); input built at `src/App.jsx:1096-1110`. Note the projection-side equivalent (`resolveNflDraftFactor`, seasonProjection.js:41-70) is **clean** — its else-chain has an R1 catch-all. The intentional dynasty-vs-projection draft-slot divergence is respected; this is a bug within the dynasty table, not a unification proposal.
- **Why it matters**: Silent and league-size dependent: 12-team leagues never see it, larger leagues mis-score every late-R1 rookie, and the `hasPremiumPick` market-signal check (`round <= 2`) still passes — so the player isn't capped at 35, just quietly handed a 0.65 prior multiplier. Also inverts the no-data case: an unmatched player (0.75) outranks a known R1.13 pick (0.65).
- **Fix direction**: Add `if (round === 1) return 1.00` (or 1.02, mirroring the projection table's r1-late) before the R2 branch. Pure table extension; 12-team behavior is byte-identical.
- **Effort / risk**: XS — one branch + a test at pick R1.14.
- **Gating**: Shippable now (dynasty score only; does not touch projectedPPG).
- **Already known?**: No.

---

#### D1-E: Unknown CFBD conference strings silently get the harshest multiplier (0.55)

- **What**: `getConferenceMultiplier` returns 0.55 — below MAC (0.65) and Conference USA (0.62) — for any conference string not in the hard-coded table, with no logging. The 2024–25 realignment wave (and CFBD's own label churn, e.g. "American" vs "American Athletic", which the table already hedges twice) makes new/renamed labels a *when*, not an *if*.
- **Where**: `src/utils/collegeMetrics.js:8-29`; flows into `domRating`/`qbScore` → `peakDominator` → `collegeBase` (seasonProjection rookie path) and the College-Production chip.
- **Why it matters**: A label drift doesn't error — it quietly discounts every affected prospect's college production ~45%, dragging `collegeBase` to the 0.92 bucket regardless of actual dominance. Because the rookie path has no other production evidence, this is a large silent haircut on a whole cohort at once.
- **Fix direction**: Dev-mode `console.warn` listing unseen conference strings (shippable, zero behavior change). Separately consider defaulting unknown-but-present strings to a mid-tier value (~0.75) while keeping 0.55 for *missing* conference — that part is a rookie-projection-input change.
- **Effort / risk**: XS for the warn; the default change is XS code but gated.
- **Gating**: Warn: shippable now. Default change: backtest-gated.
- **Already known?**: No.

---

#### D1-F: Dominator TD-share term divides by `team.TD ?? 1`

- **What**: `collegeMetrics.js:68` (and the RB twin at :77): `((rec.TD ?? 0) / Math.max(team.TD ?? 1, 1)) * 0.35`. The guard requires only `team.YDS != null` — if the CFBD team-totals row carries yards but not TDs, a player with 10 TDs gets a TD-share of 10/1 = 1000%, inflating `domRating` by up to +350 points.
- **Where**: `src/utils/collegeMetrics.js:64-78`; consumed by `peakDominator`/`finalYearDominator` → rookie `collegeBase` and the captured college factors.
- **Why it matters**: The active-multiplier blast radius is capped — `collegeBase` saturates at 1.20 for dom ≥ 30 — so the *projection* error is bounded at "top bucket when it shouldn't be". But the captured `peakDominator`/`finalYearDominator` values are corrupted for any future backtest, and `finalYearAdjust`'s ratio (`finalYear / peak`) becomes meaningless when one side is inflated. Garbage capture data is the expensive kind: it's discovered years later, mid-backtest.
- **Fix direction**: Require `team.TD != null && team.TD > 0` for the TD term; when absent, compute domRating from the yardage term alone at full weight (`× 1.0` instead of `× 0.65`) or record null. Mirror for RB.
- **Effort / risk**: S — guard + weight-renormalization decision + test with a TD-less team-totals fixture.
- **Gating**: Affects rookie projection inputs → backtest-gated for the multiplier path; the capture-field correction itself is data hygiene and arguably shippable (capture-only fields must be *right* to be useful).
- **Already known?**: No.

---

### Lens 2 — Data-quality traps

#### D2-A: Opportunity quality mixes seasons — share from current season, efficiency/volume from last *qualifying* season

- **What**: `computeOpportunityQuality` computes efficiency/volume percentiles from the player's most recent **qualifying** season (and pools that same season), but `playerShare` (30% of the blended score when present) comes from `teamContext`, which is **current-season-only** (`computeTeamContext`, GP ≥ 4 gate). Mid-season (GP 4–7) or after a 1-season gap (A3 allows it), the three sub-scores describe different seasons.
- **Where**: `src/utils/dynastyScore.js:157-207` (component seasons), `:807-809` (share injection); `src/utils/teamContext.js:44-115` (current-season shares).
- **Why it matters**: Weeks 4–8 of a season, a player's shareScore reflects this year's role while eff/vol percentiles reflect last year's — a role-change player (new starter, new team) gets a 30/70 blend of two different jobs presented as one number. Not wrong per se, but undocumented, and it interacts with F2-A's denominator issue (the share metric is also the wrong stat).
- **Fix direction**: Document the mixed-season semantics at the `playerShare` parameter; longer-term, prefer the share from the same season as `targetSeason` via `historicalShares` when the current-season share is absent or low-GP.
- **Effort / risk**: XS to document; the data change is S and shifts dynasty OQ scores.
- **Gating**: Documentation shippable now; data change shippable with a dynasty-score snapshot diff (no projection impact).
- **Already known?**: No. Adjacent to F2-A (confirms F2-A's `* 400` calibration concern) but a distinct axis (time, not denominator).

---

#### D2-B: Trajectory and momentum treat qualifying-season *index* as the time axis — gap-blind

- **What**: Both `weightedLinearRegression` callers (dynastyScore.js:743-744, regressionSignals.js:53-54) use `xs = [0, 1, 2, …]` over qualifying seasons; `computeMomentum` likewise pairs "last two vs prior two" qualifying seasons. Calendar gaps (a missed year between qualifying seasons) are compressed to adjacency, overstating per-year slope for players with interior injury gaps and letting momentum compare e.g. 2021–22 against 2024–25 as if consecutive.
- **Where**: `src/utils/dynastyScore.js:741-746`; `src/utils/regressionSignals.js:48-60`; `src/utils/momentum.js:18-35`.
- **Why it matters**: Dynasty's A3 gate bounds *trailing* staleness but not interior gaps, and the projection has no gap bound at all (see D2-C). The affected population (vets with a missed year mid-career) is small but systematically gets a steeper-looking trajectory than reality. Bounded impact: trajectory factor clamps ±7% (projection) and the dynasty trajectory score clamps 0–100.
- **Fix direction**: Use season-year as `xs` (`s.season - firstSeason`) in both modules — preserves the intentional floored/unfloored normalisation divergence (which is respected; this changes the x-axis, not the normalisation). Momentum could require the 4 seasons to span ≤ 5 calendar years.
- **Effort / risk**: S; changes both dynasty and projection values for gap players only.
- **Gating**: Backtest-gated (projection input).
- **Already known?**: No.

---

#### D2-C: Projection Step 6 durability is blind to sub-8-GP and zero-GP seasons

- **What**: The vet path computes `injurySeasons` and `availSeasons` by iterating `qualifying` (GP ≥ 8) only. The base injury trigger is `gp < 10 && dnp >= 3`, so within `qualifying` only GP 8–9 seasons can ever count — a torn-ACL 2-game season or a full-IR 0-game season contributes nothing to `injurySeasons`, nothing to the absence-shape refinement, and nothing to `projectedGames`. `computeDynastyScore` deliberately iterates `allSeasons` for exactly this reason (the adjacent-season rescue exists to catch full-IR years); the projection forgoes it.
- **Where**: `src/utils/seasonProjection.js:496-498` (`qualifying.filter`), `:503-505` (`availSeasons` from `qualifying`); contrast `src/utils/dynastyScore.js:795-797` (`allSeasons.filter`). The divergence is *recorded* in CLAUDE.md ("dynastyScore.js iterates allSeasons … seasonProjection.js iterates qualifying") but the consequence — the projection's injury discount can never see a serious injury — is not.
- **Why it matters**: The players with the most projection-relevant injury history (recent season-enders) are precisely the ones whose `projectedGames` gets no discount. Their missed season also vanishes from `recent` (Step 2 weights slide back to older seasons), so the projection is simultaneously stale-based and durability-blind for this group.
- **Fix direction**: Iterate `allSeasons` for `injurySeasons` (the `classifyInjurySeason` contributor-evidence + adjacent-rescue machinery already handles backup noise); extend `availSeasons` similarly. Keep Step 2's qualifying gate (PPG quality) unchanged.
- **Effort / risk**: S code; meaningful projection deltas for the injured-vet cohort.
- **Gating**: Backtest-gated.
- **Already known?**: Sibling of F2-C (same root: the qualifying gate starves injury signals) — F2-C covers the bounce-back flag; this covers the durability/projected-games side. The injury-vs-backup heuristic roadmap item addresses cause classification, not this scope hole. Treat as new.

---

#### D2-D: Projection vet path has no stale-season gate (dynasty's A3 has no projection counterpart)

- **What**: Dynasty routes players whose last qualifying season is ≥ 2 seasons old to "Limited Data". The projection has no equivalent: `qualifying.length >= 1` plus `years_exp > 1` runs the full multiplier stack on arbitrarily old seasons. Step 2's weights are indexed by qualifying-season position, not calendar recency, so a player whose last qualifying year was 2023 gets 50% weight on 2023 as if it were last season; `recentStarterEvidence` (depth-staleness suppression) likewise reads `gamesStarted` from that old season and can suppress a *correct* current depth-chart penalty with 2-year-old starter evidence.
- **Where**: `src/utils/seasonProjection.js:282-314` (no gate), `:541` (`recentStarterEvidence` from `lastSeasonRaw`).
- **Why it matters**: The relevance filter keeps players with GP > 0 in the last 2 seasons or KTC+team rescue, so 1–2-season-stale projections do reach the UI (e.g. a 2024 qualifier who barely played 2025). Confidence still reads 'high' if they have 5 old qualifying seasons — sample-size confidence masquerading as recency confidence.
- **Fix direction**: Cheapest conservative step: compute `seasonsSinceLastQ = currentSeason − lastQ.season` and record it as a capture-only factor now (shippable, schema +1 key with factorsSchema test update); a discount or confidence demotion keyed on it is the gated follow-up.
- **Effort / risk**: XS for capture; gated for any active use.
- **Gating**: Capture shippable now; active use backtest-gated.
- **Already known?**: No. (Distinct from season-phase handling, which is about *within*-season timing; this is cross-season staleness.)

---

#### D2-E: Career-comp similarity is not length-normalized — long careers systematically lose comps

- **What**: `computeArcSimilarity` converts raw Euclidean distance over the overlap to `1/(1+distance)` with a fixed 0.60 keep-threshold. Distance grows ~√n with overlap length at constant per-season deviation: a uniform 0.30 normalized-PPG gap passes at n=2 (sim 0.70) and fails at n=8 (sim 0.54). Long-career players face a strictly harder threshold, compounded by the requirement that candidates have careers at least as long.
- **Where**: `src/utils/careerComps.js:31-42` (`computeArcSimilarity`), `:87` (0.60 floor); downstream `compsIntegration.js:43` (blend silently disabled when no comps survive).
- **Why it matters**: The comp blend's weight is already tiny for high-confidence pipelines, but for medium-confidence vets (3–4 seasons heading into 5+) the blend quietly evaporates as careers lengthen — not by design, but by metric arithmetic. It also makes `compAvgSimilarity` incomparable across career lengths, which poisons any future backtest of `compConfidence` calibration.
- **Fix direction**: Use RMS distance (`Math.sqrt(sumSq / overlapLen)`) so the threshold means the same per-season deviation at any length; re-tune the 0.60 floor against the new scale (it will need to drop or the keep-rate changes character).
- **Effort / risk**: S code; re-tuning the floor is the real work.
- **Gating**: Backtest-gated (changes comp sets, therefore projectedPPG).
- **Already known?**: No. Not the roadmapped "richer comps" (age-alignment/features) — this is a defect in the existing metric's scale-invariance.

---

#### D2-F: `compsProjectedPPG` has survivorship bias — busted comps contribute nothing

- **What**: A comp's `theirSubsequentSeasons` only contains *qualifying* (GP ≥ 8) seasons; a comp who washed out, retired, or lost his role after the overlap contributes zero subsequent data points instead of low ones. The ensemble average is therefore conditioned on "comp remained a qualifier" — the single most optimistic conditioning possible for a projection input.
- **Where**: `src/utils/careerComps.js:8-23` (arc vector = qualifying only), `:116-127` (`compsProjectedPPG` averages whatever exists); `compsIntegration.js:53` (`seasonsFactor` floor of 0.5 still grants half-credit to thin coverage).
- **Why it matters**: The comp blend is pitched as a regression-to-archetype stabilizer, but the archetype's downside outcomes are structurally excluded. For volatile archetypes (small RBs, TD-dependent TEs) the blend pulls *up* precisely when the comp evidence should pull down. `compConfidence`'s coverage term dampens but does not remove the bias (it lowers weight; it doesn't fix the estimate's sign).
- **Fix direction**: Impute a below-replacement normalized PPG (e.g. 0.15–0.25 of peak) for comp-seasons where the comp was age-plausible to play but has no qualifying entry, or restrict subsequent-season credit to comps with full 2-season coverage. Both need backtests.
- **Effort / risk**: M (definition of "should have played" needs care — retirement vs data-window edge).
- **Gating**: Backtest-gated.
- **Already known?**: No.

---

#### D2-G: Minor durability denominator — pre-2021 seasons max at 16 games but are scored against 17

- **What**: `weightedAvgGames / 17` (dynasty) and `projectedGames`'s weighted GP both treat 17 as a full season; 2020-and-earlier seasons cap at 16, so every pre-2021 season carries a built-in ~6% durability haircut.
- **Where**: `src/utils/dynastyScore.js:798`; `seasonProjection.js:490-492` (Step 2/6 weighted GP).
- **Why it matters**: Recency weighting shrinks the effect every year; by now it only distorts long-career vets' durability sub-score (10% component weight × 55% sub-weight). Documenting beats fixing.
- **Fix direction**: Note in docs/dynasty-scoring.md → Reliability; if ever fixed, a per-season games constant (16 pre-2021, 17 after) — see cross-repo note.
- **Effort / risk**: XS (doc).
- **Gating**: Doc shippable; normalization change backtest-gated.
- **Already known?**: No (not the stat-label audit; that's about key naming).

---

### Lens 3 — Data left on the table

#### D3-A: Second-year players with a qualifying rookie season are projected as if they never played

- **What**: The rookie-path gate is `qualifying.length === 0 || (yearsExp != null && yearsExp <= 1)` — the second disjunct wins even when a full qualifying rookie season exists. `rookieProjection` then computes `baseline × ageMult × ktcMult × collegeContribution × nflDraftMultiplier` with **no evidence term**: a WR who just posted 15–17 PPG over 17 games is projected from the 7-PPG WR baseline with a hard multiplier cap of 1.85 → ceiling ≈ 12.9 PPG. KTC percentile partially proxies the breakout (the market saw it), but the player's own season is structurally excluded. Contrast `computeProspectScore` in dynastyScore.js:489-497, which Bayesian-blends actual PPG (evidence weight up to 12 vs prior weight 8) for exactly this population — the projection side has no equivalent.
- **Where**: `src/utils/seasonProjection.js:301-304` (routing), `:75-240` (`rookieProjection`, no stats input at all — `currentSeasonStats` is not even passed).
- **Why it matters**: Year-2 breakout candidates are the highest-leverage dynasty projections the dashboard makes, and this is the cohort where the model is most wrong by construction: systematic underprojection proportional to how good the rookie season was. The error also leaks into `myTeamData` trend comparisons and any projected-vs-actual display.
- **Fix direction**: Two options, both gated: (a) route `yearsExp <= 1 && qualifying.length > 0` to the vet path (it degrades fine at 1 qualifying season: weights [1.0], regression vs 1-season careerAvg is neutral, momentum/trajectory return neutral); or (b) add a Bayesian evidence blend inside `rookieProjection` mirroring `computeProspectScore` (prior weight ~8 games). Option (a) is less new code and reuses tested machinery; check the factors contract (vet vs rookie key sets differ — routing change moves players between the 73-key and 51-key shapes, factorsSchema.test must be consulted, not edited-to-green).
- **Effort / risk**: M; the factors-contract interaction is the main blast radius.
- **Gating**: Backtest-gated.
- **Already known?**: No. (Not "base weighting" — that roadmap item concerns the vet 50/30/20 weights.)

---

#### D3-B: Sub-8-GP partial seasons are discarded everywhere in the vet path

- **What**: A 5–7 game season at high PPG is hard evidence of role and health-adjusted form, but the GP ≥ 8 gate drops it from `basePPG`, regression, momentum, trajectory, efficiency/usage (which read `lastSeasonRaw` = last *qualifying* season), and — per D2-C — even from durability. The single hard threshold makes the pipeline bimodal: a season is either fully trusted or invisible.
- **Where**: `src/utils/seasonProjection.js:283-294` (the gate); every downstream step inherits it.
- **Why it matters**: For the injured-star cohort this stacks with D2-C and D2-D: the partial season is ignored, the absence is unpunished, and an older season gets the 50% weight. A GP-weighted inclusion (e.g. weight seasons by `min(gp/17, 1)` inside Step 2) would use the evidence proportionally to its sample size.
- **Fix direction**: Backtest a GP-proportional weighting of sub-8 seasons into Step 2 only (leave cohort percentile steps on qualifying seasons — their denominators assume near-full seasons).
- **Effort / risk**: M.
- **Gating**: Backtest-gated.
- **Already known?**: Adjacent to the "base weighting" roadmap item (which would naturally absorb it) — flagging so the backtest design includes partial seasons as a candidate feature rather than re-deriving this later.

---

#### D3-C: `computeProspectScore` evidence blend only ever sees the most recent season

- **What**: The Bayesian blend reads `currentSeasonStats = careerStats[mostRecentSeason][playerId]`. In-season, a year-2 prospect's evidence is the current 3–6 game partial while their *complete* rookie season is ignored (it's no longer `mostRecentSeason`). The prior (weight 8) then dominates a 4-game sample even though 17+4 games of real evidence exist.
- **Where**: `src/utils/dynastyScore.js:622-624` (single-season lookup), `:489-497` (blend).
- **Why it matters**: Prospect scores wobble at season start: a strong rookie season's information vanishes from the blend the moment week 1 of year 2 lands in careerStats. KTC anchoring (60%) hides much of it, but non-KTC prospects (the no-market-signal population the 35-cap targets) swing on tiny current-season samples.
- **Fix direction**: Pool the last two seasons' games for the evidence term (`evidenceWeight = min(totalGames, 12)` over both), or use the better-sampled of the two. Dynasty-score-only change; no projection impact.
- **Effort / risk**: S; shippable with a dynasty snapshot diff rather than a projection backtest.
- **Gating**: Shippable (dynasty score is not backtest-gated; projection is untouched).
- **Already known?**: No.

---

#### D3-D: `momentum` is computed and displayed in dynasty signals but carries no score weight — undocumented asymmetry

- **What**: `computeMomentum` feeds an active ±8% multiplier in the projection (Step 5b) but in `computeDynastyScore` it is computed, rounded, and emitted in `signals` only — zero effect on the composite. Nothing in dynastyScore.js or docs/dynasty-scoring.md states this is deliberate (the docs list momentum under "Special signals" without noting it is display-only, in a file where other computed-but-inactive things are explicitly labeled capture-only).
- **Where**: `src/utils/dynastyScore.js:748-749` (computed), `:849-855` (absent from composite); docs/dynasty-scoring.md:114.
- **Why it matters**: Pure maintainability-of-intent: the next person to touch the composite cannot tell whether momentum was meant to be weighted and forgotten, or deliberately display-only. One sentence in the doc closes it.
- **Fix direction**: Add "momentum is display-only in dynasty scoring; it is an active multiplier only in the projection (Step 5b)" to docs/dynasty-scoring.md.
- **Effort / risk**: XS (doc).
- **Gating**: Shippable now.
- **Already known?**: No.

---

### Lens 4 — Maintainability / blast radius

#### D4-A: Step labels in seasonProjection.js have drifted from docs/projection.md — two "Step 8"s, off-by-one step names

- **What**: Code comments label age-curve "Step 3" and share-trend "Step 4"; the docs table calls them 2 and 3. The code contains two `Step 8` headers (depth chart at :539 and career-comp blend at :597) while docs call the blend Step 9; Step 7b appears *after* Step 8 in code order. For a pipeline whose ordering is a declared load-bearing invariant, the numbering is the navigation layer — and it currently lies.
- **Where**: `src/utils/seasonProjection.js:316, :331, :539, :553, :597` vs `docs/projection.md` steps table.
- **Why it matters**: Any task file or review comment saying "between Step 7 and Step 8" is now ambiguous in exactly the file where misplacing a multiplier (inside vs outside `combinedNewFactor`) silently changes the envelope analysis.
- **Fix direction**: Renumber code comments to match the docs table (comments only, zero behavior); add the step number to each factor's docs row if any are missing.
- **Effort / risk**: XS — comment-only.
- **Gating**: Shippable now.
- **Already known?**: No.

---

#### D4-B: Capped-peak-age derivation duplicated between `computeEmpiricalAgeCurves` and `computeDynastyScore`

- **What**: dynastyScore.js:600-609 re-derives the curve's peak point and re-applies `PEAK_AGE_CAPS` "(mirrors the logic in computeEmpiricalAgeCurves)" for the late-career gate. The curve builder already computes exactly this (`cappedPeakAge`, :85) and throws it away — only `positionPeakPPG` is returned.
- **Where**: `src/utils/dynastyScore.js:75-99` vs `:600-609`.
- **Why it matters**: Same-file duplication today, but the two copies implement the reduce differently (builder: max medianPPG then min with cap; consumer: identical — *currently*). Any change to smoothing or cap policy must be made twice or the late-career gate silently diverges from the normalisation baseline. This is in-module drift risk, not the protected cross-module deliberate duplication.
- **Fix direction**: Return `peakAges: { QB: …, … }` from `computeEmpiricalAgeCurves` alongside `positionPeakPPG`; consume it in `computeDynastyScore`. Additive return key; callers ignoring it are unaffected.
- **Effort / risk**: S — touches the empiricalCurves consumer signature in App.jsx; behavior-identical refactor, needs the existing ageCurve/dynastyScore tests green.
- **Gating**: Shippable now (no value changes).
- **Already known?**: No.

---

#### D4-C: Cohort/cache keys omit secondary inputs across all four module-level caches

- **What**: Confirms the F4-C *pattern* and extends it: `efficiencyMetrics.cohortCache` and `usageMetrics.cohortCache` key by `careerStats` identity but also read `playersMap`; `teamRzShare.cohortCache` additionally reads `historicalTeamTotals`; `careerComps.compsCache` (F4-C) keys by playerId only. Today all secondary inputs change identity in lockstep with `careerStats` (App.jsx memo chain), so none misfire — but the invariant lives in App.jsx's dependency arrays, not in the modules.
- **Where**: `src/utils/efficiencyMetrics.js:77`, `usageMetrics.js:68`, `teamRzShare.js:55`, `careerComps.js:47`.
- **Why it matters**: One added memo or reordered dependency in App.jsx silently serves stale cohorts in three modules at once. The frozen-module convention means these caches won't be touched incidentally — which is exactly why the assumption should be written down where it lives.
- **Fix direction**: One header comment per cache: "keyed by careerStats identity; correctness assumes playersMap/historicalTeamTotals only change together with careerStats (App.jsx memo chain)". Full key extension only if F4-C's fix lands and sets the precedent.
- **Effort / risk**: XS — comments.
- **Gating**: Shippable now.
- **Already known?**: F4-C covers careerComps; the other three caches are new instances of the same class.

---

#### D4-D: `rollingAvg3` smooths across non-contiguous ages

- **What**: `computeEmpiricalAgeCurves` smooths the per-age median array positionally; if an age bucket is empty (sparse TE pools at the tails), the 3-point window averages non-adjacent ages (e.g. 24 and 31 smoothing a lone 27).
- **Where**: `src/utils/dynastyScore.js:29-34`.
- **Why it matters**: Mid-curve ages are densely populated in practice; only the tails are sparse, and `interpolateAgeCurve` clamps to endpoints anyway. Cosmetic for now; becomes real only if the qualifying gate (GP ≥ 10) is ever raised.
- **Fix direction**: None now; note in docs/dynasty-scoring.md that smoothing is positional, not age-distance-weighted.
- **Effort / risk**: XS (doc).
- **Gating**: Shippable now.
- **Already known?**: No.

---

### Confirmed clean (explicitly checked, no findings)

- **`momentum.js`** — guards (`length < 4`, `max(meanPPG, 1)`) are correct; both consumers pass consistent mean definitions. Clean (gap-blindness is D2-B, an input-axis issue shared with trajectory, not a module defect).
- **`regressionSignals.js`** — `computeTrajectory` (n ≥ 2 gate, denominator floor, `isFinite` check) and `computeConsistency` (n ≥ 3, CV) are correct; the documented floored-vs-unfloored divergence is faithfully implemented on both sides.
- **`efficiencyMetrics.js`** — passer-rating formula verified against the canonical NFL definition (clamps, /6 × 100); the per-week `pass_rtg`/`cmp_pct` trap is correctly avoided and loudly documented; every ratio is `Number.isFinite`-guarded; shrinkage degenerates safely at opps=0. Clean.
- **`usageMetrics.js`** — snap-share shrinkage elegantly neutralizes the snaps=0 edge (shrunkPct → exactly 50); QB gates match docs; all guards present. Clean.
- **`teamRzShare.js`** — guard ladder (team missing → denom < 20 → opp gate → isFinite) is exhaustive; QB gate structural rationale verified. Clean aside from the D4-C cache comment and the already-documented retired-player denominator undercount.
- **`ktcHistory.computeKtcSignals`** — null-sentinel contract complete for n < 2; `max(values[0], 1)` / `max(m, 1)` guards present. Clean.
- **`ageCurve.interpolateAgeCurve`** — endpoint clamping correct; empty-curve → 0 is handled by callers (breakout flag degrades to false; ageAdjScore degrades to 0 — only reachable if a whole position has no 10+-GP seasons, which implies a broken careerStats load that D1-B's firewall would surface).
- **`durabilitySignals.js`** — priority ladder, presence-invariant snap-share ratio, and adjacent-season rescue all verified correct as written; the projection-side *consumption scope* is D2-C, not a defect in this module.
- **`computeTdReliance` / `computeBreakoutFlag`** — clean; the peakPPG cancellation claimed in the Step 5c comment is algebraically true.
- **`combinedNewFactor` envelope** — the 10-factor product, clamp bounds, and monitoring guidance in code match docs exactly; per-factor clamps make the documented worst case (≈1.46) arithmetically correct.
- **Step 2 weight normalisation, Step 5 regression bands, Step 7 team factor, Step 7b QB factor** — bounds verified; no division hazards.
- Pass-1 confirmations encountered en route: confirms **F1-C** (dynastyScore.js:88-92 unguarded logs), **F2-A** (the `*400` targetShare scale is calibrated to reception share), **F4-C** (compsCache; extended by D4-C).

---

## DATA-REPO & CROSS-REPO FOLLOW-UPS

### Season-totals finite-value validation at ingestion (`sleeper-dashboard-data`)
D1-B's in-app firewall is the last line of defense; the first should be the data repo's publishing pipeline asserting every `fantasyPoints`, `gamesPlayed`, and stat value is finite before a season-totals file ships. The shape validator presumably checks structure — add a finiteness sweep. Cheap, and it converts a silent in-app NaN into a CI failure in the repo that caused it.

### Per-season games constant (`sleeper-dashboard-data` manifest)
D2-G (16-game pre-2021 seasons) and any future `gp/seasonLength` normalisation need an authoritative games-per-season value. A `seasonLength` field per season-totals manifest entry (16 vs 17) is a 1-line additive manifest change that unblocks the fix without hard-coding the 2021 boundary in app code.

### CFBD team-totals completeness (`cfbd.js` consumers ↔ data repo statType contract)
D1-F shows the app assumes team receiving/rushing totals always carry `TD` alongside `YDS`. The data repo's confirmed-statType contract (CLAUDE.md → CFBD pivot) should state whether TD is guaranteed; if it isn't, the in-app guard is mandatory rather than defensive.

### Sleeper `pick_no` semantics (documentation only)
D1-D exists because `pick.pick_no` (overall) was consumed as a within-round slot with a 12-team table. Whichever fix lands, record in docs/integrations.md that `rookieDraftPicks.pick` is overall pick number and that `draft_slot` is the within-round alternative — the next consumer of that map should not have to rediscover it.

### Snapshot backtest set for the gated items
Five findings here (D1-A multiplier side, D2-C, D2-E, D2-F, D3-A) are all blocked on the same missing measurement layer the roadmap already tracks. When that layer lands, this file's gated items are a ready-made first test suite — D3-A (second-year routing) is the recommended first experiment: biggest expected effect size, crisp cohort definition (years_exp ≤ 1 with qualifying.length ≥ 1), and the outcome variable (next-season PPG) is already in the snapshots.
