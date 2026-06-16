# Prediction-Research Evaluation — projectedPPG + dynasty scoring vs. the NFL research review

**Type:** Evaluation only (Session-1 shape: read live source, write one task file, edit no source).
**Inputs:** `docs/nfl_prediction_research.docx` (the scientific review) and our parked grading
record. **Horizon discipline applied:** this is a dynasty (multi-year) tool, so season- and
career-horizon findings are weighted; 1-week / 4-week-only signals are treated as out of scope for
`projectedPPG` unless dynasty relevance is specifically argued.

### Sourcing note (possible doc drift — flagged, not guessed)
The brief names `advstats-grading-findings.md` as an authoritative reference "made accessible in this
session." **No file by that name exists on disk** anywhere under `Claude Projects/Sleeper Dashboard/`.
The validated grading/activation record it describes is real but lives in three places, which I used as
the findings of record:
- `sleeper-dashboard-data/.claude/tasks/advstats-backtest.md` (methodology + decisions 4/6/8: the
  collinearity framing, RB-noise expectation, D3 self-validation anchor),
- `sleeper-dashboard-data/README.md` → "Analysis / Backtesting" (the standardized-OLS partial-β design,
  `wopr = 1.5·targetShare + 0.7·airYardsShare`, RB `target_share` "primary meaningful metric"),
- `sleeper-dashboard/docs/signal-registry.md` (canonical current-use classification),
- and the CLAUDE.md pointer "Activation is parked — see the *Advstats & Signal Grading — Findings and
  Open Items* doc," which is referenced by several files but is itself **not present as a standalone
  file**. Treat the bracketed title as the not-yet-extracted findings doc; the substance is reconstructed
  from the above. If a canonical `advstats-grading-findings.md` is expected to exist, this is drift worth
  reconciling.

---

## A. Summary verdict

The current dynasty prediction system is **well-aligned with the season/career-horizon research on the
points that matter most for dynasty, and it is conservative in exactly the places the research says to be
conservative.** It already does the three things best-evidence demands: it leans on *usage-derived
production and red-zone usage rather than raw touchdowns* (TD-reliance is penalized, not rewarded), it
builds rookies from *college dominator + actual NFL draft capital with zero combine/athleticism inputs*,
and it *models availability* both as projected games and as a dynasty reliability sub-score. The clearest
real gaps are all on the QB/efficiency and team-context axes: **EPA/attempt — the research's stickiest QB
season metric — is absent from the entire app** (QB efficiency uses passer rating instead), and the
research's single biggest disruptor, **team-context instability (QB change / new OC / OL change), is
essentially unmodeled** (only QB *quality* and the player's own team *change* are handled). Finally, the
system computes target/carry share but consumes only the *trend*, not the level the research anchors on —
a defensible choice, but an untested one. Critically, none of these gaps should be closed by reading a
correlation off the research table and wiring a signal in: our own grading work has already shown that a
research-headline metric (WOPR) is collinearity-inflated, so every candidate below is routed to the
parked joint-model grading process rather than to direct activation.

---

## B. Claim-by-claim table (season/career-relevant claims only)

Classification ∈ {Agrees, Contradicts, Silent, Untested-on-our-data}. Short-horizon-only claims are
excluded here and handled as out-of-scope in §D.

| # | Research claim (season/career horizon) | What our system actually does (source) | Class | Note |
|---|---|---|---|---|
| 1 | **Usage predicts usage; prior-year target share (WR/TE) r≈0.70 is the single stickiest season metric** | Computes target share `rec_tgt / team recTgt` in `computeHistoricalShares` (`teamContext.js:219`), but feeds only the *trend* (`computeShareTrend`) — projection Step 3 `shareTrendMultiplier` (±8%) and dynasty OQ share-boost (±8 pts). The level anchor is recency-weighted **PPG** (production), `seasonProjection.js` Step 1. | Agrees (partial) | We capture usage *persistence* implicitly via PPG persistence, but never use the share *level* as an anchor. See §D-3. |
| 2 | **Carry share (RB) r≈0.65 is the clearest RB volume predictor** | Computes carry share `rush_att / team rushAtt` (`computeHistoricalShares`); used as trend (as #1) and as the `carryShare > 0.30` workhorse switch in the QB-quality modifier (`teamContext.js:71,76`). | Agrees (partial) | Same level-vs-trend caveat as #1. |
| 3 | **EPA/attempt (QB) r≈0.60 — most predictive QB season metric (must adjust for OL/scheme; EPA is a team stat)** | **Absent from the entire app** — `grep` for EPA across `src/` returns nothing. QB efficiency instead uses canonical **passer rating** from season totals (`computeEfficiencyFactor`, `efficiencyMetrics.js`, Step 5e). | Contradicts (by omission) | Highest-value dynasty position is scored on a weaker, more team-confounded efficiency proxy. See §D-1. |
| 4 | **YPRR (WR/TE) career r≈0.55 — solid efficiency signal** | Not computed — Sleeper season totals carry no routes-run denominator. Efficiency uses YPT / YPR / catch rate / rec-TD rate instead (`efficiencyMetrics.js`). | Silent (data unavailable) | YPR ≠ YPRR (no route denominator). Data-gap, not a design choice. See §D-5. |
| 5 | **"Availability is the best ability" — snap rate / role stability is the strongest season-long predictor** | Modeled twice: projection Step 6 `projectedGames` with injury-season + absence-shape penalties (`durabilitySignals.js` `classifyInjurySeason`), and dynasty **Reliability** durability sub-score (recency-weighted GP, ×0.85/×0.70 injury penalties). | Agrees (strong) | But: `projectedPPG` is per-game and intentionally excludes availability (correct); availability only scales the season *total*. Dynasty weights reliability at just **10%**. See §D-6. |
| 6 | **Rookies: college dominator rating + draft capital primary; combine drills near-useless (<2% variance)** | Rookie path = `baseline × ageMult × ktcMult × collegeContribution × nflDraftMultiplier`. `collegeContribution` from dominator (`computeCollegeMetrics`, `collegeMetrics.js`); `nflDraftMultiplier` from **actual** NFL draft slot (`nflDraftMatch.js`/`nflDraft.js`). **No combine/athleticism input anywhere.** | Agrees (strong) | Textbook match to best-evidence. Combine drills are not just down-weighted — they are absent. |
| 7 | **TDs near-random (r≈0.25); red-zone usage rate is the better structural signal** | TD-reliance is **penalized**: `computeTdReliance` (`projectionSignals.js`) → Step 5c `tdRelianceFactor ×0.93` and dynasty reliability `×0.90` at `tdDependency > 0.40`. Red-zone usage feeds projectedPPG twice: own-rate (Step 5g, `computeUsageFactors`) **and** team-RZ-share (Step 5h, `computeTeamRzShareFactor`). | Agrees (exceeds) | We do *more* than the research asks — actively de-weight TD reliance *and* use two orthogonal RZ-usage signals. A genuine strength. |
| 8 | **College dominator ignores strength of schedule** | Dominator (`computeCollegeMetrics`) is raw share-of-team; no SoS adjustment. No SoS anywhere in app (`grep`: none). | Silent (shares the limitation) | Matches the project's own stance that SoS is in-season-valuable / weak-offseason. See §D / out-of-scope. |
| 9 | **Team-context disruption (QB change, new OC, OL change) is the single biggest disruptor; EPA is a team stat** | Models QB1 **quality** (Step 7b `qbQualityFactor`; dynasty QB-mod via `applyQBQualityModifier`) and team offense rank (Step 7). Models the *player's own* team **change** (`isTeamChange` neutralizes share + team-RZ-share). Does **not** model QB *change*, OC change, or OL change. Coaching overlay is view-only (95 entries, not in projection); `scheme.json` empty. | Contradicts (partial) / Silent | The biggest research-flagged disruptor of WR/RB multi-year outlook is largely unmodeled. See §D-2. |
| 10 | **Best models explain only 50–70% of season variance; football YoY correlations are low; uncertainty is intrinsic** | Expressed via confidence bands (`high/medium/low/rookie`), comp-blend uncertainty weighting (Step 9, `compsIntegration.js`), and the `[0.67,1.50]` sanity rail. | Agrees (philosophical) | The system's modest per-factor magnitudes (±5–8%) are consistent with low-signal humility. |
| 11 | **ACWR / workload-spike injury risk** | No workload or tracking data ingested; not modeled. | Silent (no data) | Short-horizon in-season risk signal; out of scope (§D). |

---

## C. Confirmed strengths (system already matches best-evidence)

1. **Touchdown discipline (claim 7).** The research's sharpest warning — "never chase touchdowns,
   r≈0.25" — is one the system actively honors. `computeTdReliance` *penalizes* TD-reliant production
   (Step 5c `×0.93`; dynasty reliability `×0.90`), and structural red-zone usage is captured by **two**
   empirically-separated signals: own-rate RZ usage (Step 5g) and team-RZ-share (Step 5h, validated at
   partial β +0.20 RB / +0.17 WR/TE). This is the single best agreement in the system and it goes beyond
   the research's prescription.

2. **Rookie construction (claim 6).** `seasonProjection.js` rookie path uses college dominator
   (`collegeMetrics.js`) + **actual** NFL draft slot (`nflDraft.js`, 10-tier multiplier) and **zero**
   combine drills. This is exactly what the literature says is the only defensible pre-NFL approach, and
   `breakoutAgeFactor` has correctly been demoted to capture-only (weak standalone signal once dominator +
   draft slot are present) — which also matches the user's own note ("Things I don't see the value in:
   Breakout age college").

3. **Availability is modeled, on both surfaces (claim 5).** Projected games (`durabilitySignals.js`
   contributor-evidence logic, absence-shape refinement) and the dynasty Reliability sub-score both
   encode "availability is the best ability," with careful backup-vs-injury disambiguation that mirrors
   the user's Will Levis / Malik Willis notes.

4. **Usage-derived, not raw-yardage-derived.** The base anchor is fantasy PPG (a usage×efficiency
   composite) plus share-trend, never raw yards — consistent with "usage predicts usage; raw production
   (rec yards r≈0.40) is weaker."

5. **Calibrated humility (claim 10).** Per-factor magnitudes are deliberately small (±5–8%), the combined
   factor is clamped, and comp-blend influence scales with pipeline uncertainty — an appropriate response
   to a sport where 50–70% explained variance is the ceiling.

---

## D. Gaps & contradictions, prioritized

Each gap states the source location, why it matters **for dynasty specifically**, and a recommended
response classified as **(i) direct fix**, **(ii) parked grading candidate (joint model, NOT direct
activation)**, or **(iii) out of scope**.

### D-1 — QB EPA/attempt is absent (research's stickiest QB metric) — *highest priority*
- **Source:** No EPA anywhere in `src/` (verified by grep). QB efficiency = passer rating only
  (`efficiencyMetrics.js`, Step 5e). Not in `docs/signal-registry.md` at all → not ingested, not computed.
- **Why it matters for dynasty:** QB is the longest-tenured, highest-value dynasty asset, so a weak QB
  efficiency signal compounds over the most years. Passer rating is more era- and team-inflated than
  EPA/attempt and rewards checkdown efficiency; EPA/attempt is the research's r≈0.60 season metric.
- **Recommended response: (ii) parked grading candidate.** EPA/attempt is not in the data store, so this
  is a data-repo ingest + a joint-model grading question, not an app edit. The research's own caveat —
  "EPA is a team stat, adjust for OL/scheme" — is *itself* the argument against direct activation: it must
  be graded for incremental value over the existing passer-rating efficiency factor, with team-context
  controls, before wiring. Route to the joint-model grading process. **Not a direct fix.**

### D-2 — Team-context instability (QB change / new OC / OL change) unmodeled — *high priority*
- **Source:** Step 7b `qbQualityFactor` models QB *quality*, not *change*; `isTeamChange` handling
  (`seasonProjection.js`) covers the player's *own* move but not his environment's churn; `coaching.json`
  is view-only (95 entries) and `scheme.json` is an empty scaffold (`signal-registry.md`).
- **Why it matters for dynasty:** The research names this the single biggest disruptor of WR/RB
  production, and a QB downgrade or OC change resets a pass-catcher's multi-year outlook — exactly the
  multi-season swing a dynasty tool exists to anticipate. The user's own notes ask for split-backfield /
  role-context awareness, which is the same family.
- **Recommended response: mixed.** (ii) A "context-instability" factor (new-QB / new-OC / OL-change flag)
  is a **parked grading candidate**: it depends on populating the enrichment overlay (data repo) and
  capturing it contemporaneously (ephemeral, per the snapshot invariant), then joint-model grading. The
  existing per-player `isTeamChange` neutralization is the only piece that's a defensible (i) already-done
  fix. The environment-churn piece is **not** a direct activation.

### D-3 — Usage-share *level* not used as an anchor (only the trend) — *medium priority*
- **Source:** `computeHistoricalShares` (`teamContext.js:219`) computes the level; only
  `computeShareTrend` (direction) reaches the model (Step 3, dynasty OQ boost). Base anchor is PPG.
- **Why it matters for dynasty:** Prior-year target/carry share *level* is the research's most stable
  season anchor (r≈0.70/0.65) and is structurally more persistent than production across multiple years —
  the dynasty-relevant property.
- **Recommended response: (ii) parked grading candidate.** Test whether a usage-share-*level* term adds
  incremental value over the PPG anchor in a joint model. **This must be reconciled with our own grading
  result** that advstats `target_share` partial β ≈ 0 once `overallShare`/volume is controlled (decision 4
  in `advstats-backtest.md`) — i.e. the level may already be implicitly captured through PPG, which is
  precisely why this is a grading question and not a wire-it-in. **Not direct activation.**

### D-4 — air_yards_share (WR/TE) validated-as-orthogonal but parked — *medium priority*
- **Source:** `src/api/advStats.js` is view-only (enforced by `src/__tests__/advStatsViewOnly.test.js`);
  `seasonProjection.js` records `targetShare/airYardsShare/wopr/racr` as **capture-only** for WR/TE; never
  moves `projectedPPG` (CLAUDE.md advstats invariant).
- **Why it matters for dynasty:** Air-yards share captures downfield role / big-play opportunity *beyond*
  target share — a role signal that tends to persist across seasons and discriminates ascending WRs.
- **Recommended response: (ii) parked grading process — this is the candidate the harness was built
  for.** It is explicitly *not* a direct activation. It is gated on the in-basis grading harness
  ([grading-in-basis-port-gate] / `sleeper-dashboard-data/.claude/tasks/grading-harness-in-basis.md`) and
  the joint-model backtest clearing the project's empirical bar (the D3 +0.17/+0.20 anchor). See §F.

### D-5 — YPRR unavailable (data gap) — *low priority*
- **Source:** No routes-run denominator in Sleeper season totals; efficiency uses YPR/YPT/catch rate.
- **Why it matters for dynasty:** YPRR (career r≈0.55) is a cleaner efficiency signal than YPR for elite
  WR/TE identification across seasons.
- **Recommended response: (iii) out of scope now / longer-horizon (ii).** Acquiring routes-run requires a
  new ingest source (the user's notes flag `nflfastr.com`). Until that data exists it cannot be graded;
  treat as a future data-repo sourcing question, not an app task.

### D-6 — Availability possibly under-weighted in the dynasty score — *low priority / low confidence*
- **Source:** Dynasty Reliability component is 10% (durability 55% of that); `projectedPPG` excludes
  availability by design.
- **Why it matters for dynasty:** The research calls availability the *strongest* season-long predictor;
  a 10% reliability weight may understate it for a multi-year hold.
- **Recommended response: (ii) grading/weighting candidate.** This is a weight-tuning question for the
  joint model/backtest, not a direct edit — and the per-game `projectedPPG` should keep excluding
  availability (only the season total and the dynasty weighting are in scope). Low confidence; do not
  re-weight by hand.

### Out-of-scope (short-horizon-only; correctly ignored — do NOT wire into projectedPPG)
Per horizon discipline, these 1-week / 4-week signals from the research are **(iii) out of scope** for a
dynasty projection, and the system is *correct* to omit them: projected game total (O/U), Vegas spread /
game script, single-game opponent defensive DVOA, 2–3-week rolling usage trend, snap-rate spikes, and the
weekly injury report. ACWR / workload-spike injury risk (D-11/claim 11) is likewise out of scope (no
tracking data, and it is an in-season risk signal). The one short-horizon item with a *dynasty* analogue
is opponent strength — see SoS below.

### SoS (claim 8) — out of scope for the offseason projection, consistent with the research
The research treats opponent quality as a **1-week** predictor (defensive DVOA) and explicitly flags that
college dominator ignores SoS. The app has no SoS anywhere, which **matches both the research's horizon
placement and the project's own position** (and the user's notes: points-allowed-by-position is wanted
*during the season*). Recommended response: **(iii) out of scope for `projectedPPG`** as an offseason
dynasty signal; if pursued it belongs to the in-season projection cycle the user describes, not the
multi-year baseline. No change recommended to the offseason pipeline.

---

## E. Divergences where OUR findings override the research document

1. **WOPR (the research's headline receiver metric) — overridden.** The review sells WOPR
   (`1.5·target_share + 0.7·air_yards_share`, ">0.60 elite") as a top-tier 4-week/season opportunity
   number. **Our grading found WOPR collinearity-inflated and excluded it.** WOPR bundles `target_share` —
   which our model already captures through volume/`overallShare` (decision 4: `target_share` partial
   β ≈ 0, "already captured by volume, not unrelated to PPG") — with `air_yards_share`. Its apparent value
   is inflated by the component the model already has. The isolated, orthogonal candidate is
   **`air_yards_share`**, not WOPR. **Our findings win:** WOPR stays excluded; `air_yards_share` (WR/TE)
   is the activation candidate (still parked, §D-4).

2. **RB `air_yards_share` / `racr` — overridden as noise.** The research presents air-yards metrics as
   broadly useful for receivers. Our findings (and the data shape) show RB `air_yards_share`/`racr` are
   frequently `null` or net-negative (behind-LOS targets) and are **excluded as noise**; `target_share` is
   "the primary meaningful metric for RBs" (README "Analysis / Backtesting"; `advstats-backtest.md`
   decision 6). **Our findings win.**

3. **Research YoY correlations ≠ incremental value in our model — the governing override (brief point
   7).** The research's correlation table (target share r≈0.70, etc.) measures a signal *in isolation*. It
   is **not** the same as that signal's incremental value over our full feature set, and our grading
   methodology is built precisely to measure the latter (standardized partial β with `overallShare /
   snapShare / rzOwnRate` controls). **Therefore no recommendation in §D activates a signal on the
   strength of a research correlation alone** — every candidate (EPA/att, share-level, air_yards_share,
   instability flag) is routed to the parked joint-model grading process. This is the methodological spine
   of this evaluation, not a footnote.

---

## F. Companion data-repo evaluation (belongs in a separate `sleeper-dashboard-data` session)

These questions require reading data-repo source and/or re-running the grading/backtest harness and were
**not** attempted here (this session did not read data-repo *source*, only its findings docs):

1. **Has `bin/backtest.mjs` actually been run and committed?** The `backtests/` results and `grading/`
   folders appeared to hold only scaffolding (`.gitkeep`) — confirm whether the air_yards_share /
   target_share / wopr / racr × WR/TE/RB reports exist, and capture the committed numeric verdicts (the
   §E claims are reconstructed from the task/README, not from a committed report).
2. **Does WR/TE `air_yards_share` clear the project's empirical bar?** Re-run / read the standardized
   partial-β vs the aDOT r=0.289 floor and the D3 +0.17/+0.20 self-validation anchor, on the 2020–2024
   snap-available panel (the README notes the app-side anchors are not numerically reproducible there;
   confirm the qualitative pass: β>0, own-rate β<0, monotone, raw r>0).
3. **Is the in-basis grading harness unblocked?** Per [grading-in-basis-port-gate], joint-model grading is
   gated on a **v2 snapshot being committed** so `buildInBasisOutcomes` (`lib/fantasyPoints.mjs`) can score
   in-basis. Confirm whether a v2 snapshot exists yet; until it does, the §D-3/D-4 candidates cannot be
   jointly graded.
4. **EPA/attempt feasibility (for D-1):** does nflverse expose season-level EPA/attempt joinable by
   `sleeper_id` (via `nflverse/playerids.json`), with usable 2012+ coverage, so it could be ingested as a
   QB candidate predictor? Pure data-repo sourcing question.
5. **YPRR feasibility (for D-5):** is routes-run available from an ingestable source (nflfastr / PFF) to
   compute YPRR keyed by `sleeper_id`? Coverage and licensing.
6. **Joint-model-over-full-feature-set run (the brief-point-7 test):** measure incremental β of the
   candidate signals over the **full current projection feature set**, not just the three controls —
   requires the data-repo harness and is the actual gate for any §D activation.
7. **Does the 2019 advstats hole + 2025-pending file bias the backtest panel?** Data-quality question for
   the retrospective tool's pooled 2012→2025 panel.
