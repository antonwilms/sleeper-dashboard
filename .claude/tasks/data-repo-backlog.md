# Data-repo backlog — asks discovered from the app side

**What this is.** A running list of work that belongs in `sleeper-dashboard-data`, discovered while
building in **this** repo. The app repo cannot edit the data repo, so these accumulate here and are
executed in one batch rather than interrupting app slices.

**Decision (Anton, 2026-08-21):** batch these and do them **after dp-v2 Slice 7**, unless an item is
**truly blocking** — meaning an app slice cannot ship a correct result without it. Nothing currently
listed is blocking; each is either cosmetic or gates a feature that was deliberately cut rather than
shipped broken.

**How to use it.**
- **Appending** is part of every slice's done-definition. When a slice discovers a data-repo ask,
  add a row *in the same change*, with the commit that found it.
- **Do not fix these from the app repo.** If an app-side workaround exists, it belongs in the slice;
  if it does not, the item is what gets recorded.
- **When the batch runs**, this file is the *input*, not the plan. Each item gets transcribed into a
  proper task file in the data repo's own `.claude/tasks/`, planned under that repo's conventions
  (opus plans → plan-reviewer → sonnet), and then struck through and moved to data-repo-backlog-resolved.md with its data-repo commit.
- **This is not the cross-repo contract registry.** `docs/cross-repo-registry.md` records *contracts
  that already exist*; this records *work that does not exist yet*. An item here may or may not end
  up touching a `CR-NN` entry — that gets decided when it is planned.

---

## Open

### D-2 · `advStats` carries no EPA
**Found:** dp-v2 (`fb8c2dd`) · **Blocking:** no · **Size:** medium

`nflverse/advstats/<year>.json` serves `targetShare`, `airYardsShare`, `wopr`, `racr` and their
components — but **no EPA**. It is the only cheap season-aggregated per-player family; `gamelogs`
carries EPA but at **8.2 MB/season**.

**Consequence:** *EPA per opportunity* (rec EPA ÷ target, rush EPA ÷ carry, pass EPA ÷ attempt) cannot
be shown as a per-season series without loading ~33 MB of gamelogs for five seasons. It was therefore
**cut** from the pop-up's Usage & efficiency section (Slice 4b) rather than deferred, and the same
constraint will apply to Market's Efficiency set in Slice 5.

**The ask:** add season-aggregated EPA to the advstats pack — `passingEpa`, `rushingEpa`,
`receivingEpa` summed per player-season, alongside the existing components, so a rate can be
recomputed app-side without summing stored rates.

This is the higher-value of the two: it unlocks a metric the project's own research
(`docs/prediction-research-eval.md` §D-1) rates as the single highest-priority gap, on both surfaces
that want it.

### D-65 · All-position rookie survivorship gap in the dynasty prior (L7, offseason research)
**Found:** qb-rookie-dynasty-research Q4d (data `d9dc742`) · **Found by:** app qb-rookie-dynasty-wiring · **Blocking:** no · **Size:** medium — offseason, research first

Record only — not planned. Rookies who keep playing outscore their dynasty arm-B prior at every position (Σ S+1 PPG ÷ Σ prior, YE0 survivors: QB 1.124, RB 1.135, WR 1.089, TE 1.053; QB vs the rest diff 0.023, CI [−0.092, 0.143], so not QB-specific). Same direction as 2c's prior scale c 1.16–1.32. Partly survivorship (busts have no S+1 outcome). Whether it should change rookie vs veteran dynasty value needs research across all positions (plan item L7, `future_plans/in-season-notes-plan.md` sign-off 2026-10-07 16:20). A fix re-fits every rookie k (CR-25).

### D-72 · R3-FIT QB `sensitivityVerdict` flips under league basis — the committed exponent verdict does not transport
**Found:** league-basis-mirror G3 (data `cb27d88`, `grading/2026-10-16-league-basis-verdict.md`) · **Blocking:** no · **Size:** medium

`bin/panel.mjs --fit` under the current default models (`step4-upside`, `qb-takeover`), `--basis half_ppr` vs `--basis league`: the QB `sensitivityVerdict` flips UNSTABLE → CLEARS; every other label is identical. The committed `.claude/tasks/r3fit-exponent-harness.md` verdict was measured on half-PPR, so it does not transport to league basis (the basis the app scores on). Re-examine before any exponent activation (CR-15: "re-fit before any further exponent activation"). `--fit` still defaults to `half_ppr`; no exponent is activated.

### D-73 · Re-examine the `K_ROS_POINTS_SHORT.TE` study pin, independent of basis
**Found:** league-basis-mirror G2 (data `cb27d88`, `grading/2026-10-16-league-basis-verdict.md`); asked for by Anton 2026-10-16 · **Blocking:** no · **Size:** small–medium

The shipped pin is `basis: 'study'`, k = 4. The league run's own rule emits pooled k = 1.5 for it: paired leave-one-season-out Δ −0.141 [−0.225, −0.062] (BEATS). The cell is measured on `q4|X-short|ros|ALL` rows of every position, so this is a question about the study pin itself, not a scoring-basis effect. Decide whether the pin should move to the fitted/pooled k (a re-pin of the 2a file, CR-25) — with the verdict's caveat that the league 2a file as a whole was `do-not-wire` (pooled points delta NO-GAIN), so any move is a deliberate single-entry re-pin, not a basis switch.

---

## Watch

### D-71 · First forward season-totals run carries `weeklyStats`
**Watch (dated 2026-10-15).** Trigger: the first `nfl-season-totals.yml` run after data `7ead2af` (Fri/Mon/Tue 06:13 UTC, next 2026-10-16). Check `nfl/season-totals/2026.json` carries `weeklyStats` on every non-`TEAM_*` row with `gamesPlayed > 0` (the run validates with `requireWeeklyStats: true`, so a red run is the failure signal), and that the app shows a 2026 Game log with no basis caption.
**Found:** weekly-scoring-keys · **Blocking:** no · **Size:** small

### D-16 · A 2026-class debut outcome append, after the 2026 season completes
**Watch (dated 2026-10-10).** Trigger: the 2026 regular season is complete, at **Fri 2027-01-15, ≥ 14:00 UTC (week 18 ends 2027-01-10; command: node bin/season-grade.mjs)**. Then append the 2026 class's debut outcomes and re-check the QB asymptote.
**Found:** rookie-ceiling.md (calibration arc slice 3, `41f277e`) · **Blocking:** no · **Size:** small, deferred until season end

The 2026 entry class is the first genuinely out-of-sample class for the shipped `ROOKIE_CEILING`
constants — the same re-fit-trap caution the calibration-arc verdict's own §F note applies to slice
1's constants applies here too. Expect the QB asymptote in particular to move; its leave-one-class-
year-out fold spread is 20.50–21.95 PPG on n=50, the thinnest cell in the fit.

### D-75 · Re-measure the ROOKIE_TOTAL_FACTOR bias on league basis for the 2026 class
**Watch (dated 2027-01-15, with D-16).** Trigger: D-16's 2026-class debut append. Then re-measure, on league basis, the day-3 / undrafted RB/WR/TE total-points bias of the shipped composition for the 2026 class — the first class the factor never saw.
**Found:** rookie-basis-refit (D-45, data `6bb871d`) · **Blocking:** no · **Size:** small, deferred until season end

D-45's F4 found the league ratio-of-sums factor higher than the shipped half-PPR one (day-3 0.866 vs 0.796, undrafted 0.944 vs 0.835) and better calibrated out of sample (Σpred ÷ Σreal 1.000 / 1.003 vs 0.918 / 0.887), but worse per player (Δ |error| +0.68 / +0.54 points; MAE favours a smaller factor on a population where 38% / 66% of seasons score 0). It is `do-not-wire` under D-45's pre-registered rule and also fails D-13's own rule, which required the per-player error to beat. Pre-register the re-measure with **bias primary** (Σpred ÷ Σreal on league totals, per group) and a guard that the per-player error is **no worse** (paired Δ |error| CI not above 0). Wiring a league factor would bump `PRIOR_MODEL_FROM` (it moves rookie `projectedTotalPts`).

### D-44 · Regime-aware grading across the season-rescore switch
**Watch (dated 2026-10-10).** Trigger: the first grade of a 2026-target snapshot, which cannot happen before the 2026 regular season completes (**Fri 2027-01-15, ≥ 14:00 UTC (week 18 ends 2027-01-10; command: node bin/season-grade.mjs)**). This entry blocks that grade.
**Found:** season-rescore.md (app `47af353`) · **Blocking:** yes for any grade of a 2026-target snapshot (calendar-blocked to ~Jan 2027 regardless) · **Size:** medium

Snapshots without `projectionBasis` carry half-PPR projections while `scoringBasis` says `'custom'`; `grade-snapshot.mjs:170-173` would grade them in-basis against league outcomes. Grade absent-field captures against half-PPR outcomes (or flag them), `'league'` captures in-basis; honour per-season `live-api` provenance.

Mirror (CR-01, verbatim):
> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

### D-52 · Rest-of-season grader
**Watch (dated 2026-10-10).** Trigger: 2026 regular season complete (**Fri 2027-01-15, ≥ 14:00 UTC (week 18 ends 2027-01-10; command: node bin/season-grade.mjs)**). Then run the full ROS grade, the S+1 `inSeason.next` grade (later, once 2027 completes), and the L6c games check. An interim checkpoint grade is optional and not owed.
**Found:** in-season-evidence-2b-2-scoring.md · **Found by:** `963447b` · **Blocking:** no · **Size:** medium

Grade the snapshot's `players[id].inSeason.ros` against realised rest-of-season PPG, and `inSeason.next` against season S+1 PPG (CR-25's "later consumers" line). The first data is the 2b-1 captures; nothing in the app blocks it.

**L6 (2026-10-10):** the 2026 actual games of veterans with `factors.shortSeasonState` `'short'`/`'none'` (boundary-8 captures) are the **first independent check** of the L6c rule — it was chosen and gated on the same 2015–2025 panel. Grade raw `projectedGames` against 2026 `gamesPlayed`, with `projectedGamesBase` as the counterfactual, by state and for the rel3 cohort; grade the in-season healthy override separately (remaining games, by checkpoint).

### D-60 · Replicate Q5 on the app's sat-longer definition
**Watch (dated 2026-10-10).** Trigger: recount at the first `nfl/season-totals` run where `nfl/season-totals/2026.json` is `inProgress: false` (after Sleeper's post-Super-Bowl rollover). The January run (P3 Slice B) deliberately does not count it: the in-progress guard refuses 2026 (Anton, 2026-10-24). Recipe: the existing `--inseason --dynasty` path cannot reach the 2025 class's S+1 until `guardLoad(load, { maxLoadSeason: 2025 })` (`scripts/inseason-dyn-run.mjs:1068`) and `DYN_DEFAULTS.seasons.to` (2024, `lib/inSeasonEvidence.mjs:631`) are lifted by a planned slice; re-run only at ≥ 20 flagged-with-S+1 players (13 today).
**Status 2026-10-07: kept at 0.90 by decision (Anton, 2026-10-07); revisit at the 20-player floor.** Replicated by qb-rookie-dynasty-research (data A2 `d9dc742`): 89 preseason-backup rookie QBs (week-1 chart, 2014–2024), 31 ever flagged, 13 flagged with an S+1 PPG → Q5a `insufficient` (floor 20); the thin sample leaned against a discount (full-sample d 1.09; d 1.0 BEATS 0.90, MAE 5.79 vs 6.33). Q5b (year-2 persistence) `insufficient` (6 players). The `PROVISIONAL(heuristic)` tags were re-cited by qb-rookie-dynasty-wiring (app cfb3a76). Re-run `node bin/backtest.mjs --inseason --dynasty --write` when the flagged-with-S+1 sample reaches 20 players.
**Found:** qb-takeover-wiring.md · **Found by:** `8ba42fd` · **Blocking:** no · **Size:** small

Q5 with today's-chart-as-proxy replaced by the real week-1 chart, rookie season only, and the S+1 persistence question (the discount stops when the player turns `yearsExp` 1). Replaces the `PROVISIONAL(heuristic)` basis of `QB_SAT_LONGER_DISCOUNT`/`QB_SAT_LONGER_BAND` in `src/utils/qbTakeoverConstants.js`.

### D-67 · DM parity on the short-season rule
**Watch (dated 2026-10-10).** Trigger: the first daily capture whose `capturedAt` is after **2026-10-10T12:45:38Z** (the boundary-8 app push). That is expected to be `snapshots/2026-10-10.json` tonight, or else the next one. Display-only fix `59fc51d` (13:06:03Z) does not move it.
**Found:** short-season-wiring · **Found by:** app short-season-wiring B1 (`e3de164`) · **Blocking:** no · **Size:** small

After the first post-boundary-8 capture:
- rebuild a DM parity fixture from it;
- run DM-1 under `rule: 'l6c'`, expecting ≥ 99%;
- confirm anchor-policy boundary 8's cross-check.

**Append (D-76, 2026-10-19):** the DM-0 fixture is pinned at data `4f469cc` (pre-correction), so DM-1 is unaffected; the planned post-boundary-8 fixture rebuild must pin a data rev before boundary 10, or be rebuilt after it.

### D-83 · Watch: boundary-10 cross-check
**Watch.** Trigger: the first daily capture after the D-76 coordinated push (C3) vs the last capture before it. Compare with the C1 impact verdict (data `grading/2026-10-22-absence-role-verdict.md`; before/after movers: 2 `projectedGames`, 1 `projectedPPG`, 3 `projectedTotalPts`, 5 `injurySeasons`, 9 `absenceShapeFactor`, 1 bounce-back flip, 5 dynasty score, 2 label; noise floor empty).
**Found:** D-76 absence-role (data `76b5ddf`, Stage B rewrite; §6 of `.claude/tasks/d76-absence-role.md`) · **Blocking:** no · **Size:** small

- **Exact** on the season-totals-determined fields: the set of veteran rows whose `projectedGames`, `factors.injurySeasons`, `factors.absenceShapeFactor` or `factors.isBounceBack` change, and their before/after values, must equal the C1 verdict's (rows present in both captures only; Step 6 reads only `careerStats`, which does not change between the two captures).
- **Report-only** on `projectedPPG`, `projectedTotalPts`, `dynasty.score`/`label`: the captures are a day apart, so live Sleeper/KTC/depth state moves them. Report agreement in direction with C1's movers and the count of other movers; no pass/fail.

---

## Pre-existing data-repo backlog — recorded there, not here

These were known before dp-v2 and live in the data repo's own docs. Listed only so nobody re-discovers
them and files a duplicate:

- `nflverse/roster` 2012–2015 absent (upstream files fail the shared `MIN_ROSTER_IDS` gate).
- CFBD college files lag at 2017–2024 until 2025 is materialized.
- Enrichment overlay: `scheme.json` / `injuries.json` / `notes.json` are 0-entry scaffolds; only
  `coaching.json` is populated (~95 entries). The hand-authored path has demonstrably not filled them.
- A precomputed teamcontext season-summary pack was **considered and rejected** for dp-v2 (Slice 6's
  14-season fetch is permanently cached and first-visit only). Recorded so it is not re-proposed as
  new.

### D-77 · Season-totals `gamesPlayed` exceeds nflverse snap games for ~2.5% of skill player-seasons
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** yes · **Size:** small — needs a definition decision first

V2.11: `gamesPlayed` ≠ `nflverse/snaps/<year>.json` `games` for 92 of 3,757 skill player-seasons with a snaps entry (2.45% overall). Per season: 2020 5 of 621 (0.8%), 2021 39 of 663 (5.9%), 2022 31 of 628 (4.9%), 2023 5 of 611 (0.8%), 2024 7 of 615 (1.1%), 2025 5 of 619 (0.8%); 2021 and 2022 exceed 2%. 76 are positive (the app's count is higher: +1 ×64, +2 ×9, +3 ×1, +4 ×2) and 16 negative (−1 ×14, −2 ×2). 3 of the 39 mismatches in 2021 and 2 of 31 in 2022 are traded players. Cause not established. `gamesPlayed` is the PPG denominator, so which definition it should carry has to be decided first and documented in data-catalog.md.

Example: pid `2342` (Devin Smith, WR, JAX, 2021), `gamesPlayed` 5:
- `weeklyStatus`: `P` for weeks 1–5, `D` week 8, `X` weeks 6, 7 and 9–18.
- gamelogs REG: one row, week 1 (JAX, 1 target). `snaps` `games` 1 (9 offensive snaps).
- `rosterweekly`: week 1 JAX `ACT`; weeks 2–5 JAX `DEV`; week 8 CAR `DEV`; week 9 CAR `TRC`.

**Append (D-76, 2026-10-19):** 22 of V2.12's 48 negatives are exactly `snaps.games − gamesPlayed` — D-77's cause; the ids are in the D-76 Stage A report.

### D-78 · `college/` files carry no rows for some FCS / lower-division players in the KTC top 400
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — confirm intent first

V3 college: surname searches of every `college/{receiving,rushing,passing}/2017–2025.json` return no row at all for Dallas Goedert (KTC rank 175), Tyson Bagent (244) and Jack Strand (359), and none for Christian Watson (52) under that name. Other `college-none` players are present under a different spelling (see the app-side name-variant entry). If the ingest is meant to hold FCS and lower-division players, rows are missing; if it is FBS-only, record that in data-catalog.md so the matcher's `college-none` is understood as expected for them.

**Append (join-defects-id-crosswalk, 2026-10-25):** after the ID-first joins the 7 remaining `college-none` rows in the top 400 are all lower-division: Christian Watson (NDSU), Dallas Goedert (SDSU), Emanuel Wilson (Fort Valley St), Dohnte Meyers (Delta St), Tyson Bagent (Shepherd), Kameron Johnson (Barton), Jack Strand (MSU Moorhead). Same question as above; no app change needed either way.

### D-79 · `SHORT_SEASON_K` (L6c) was fitted on pre-D-76 `dnpWeeks`
**Found:** D-76 absence-role (data `76b5ddf`, Stage B rewrite; §6 of `.claude/tasks/d76-absence-role.md`) · **Blocking:** no · **Size:** small

Pinned in `src/utils/shortSeasonConstants.js` / `lib/durabilityMirror.mjs` from `backtests/2026-10-10-games-short-constants.json`. The predictor `avgGames` comes from `projectedGamesFor` (injury multiplier, absence shape); the outcome `gamesPlayed` is unaffected. Likely to move: low — 2 of 435 veterans' `projectedGames` move (D-76 pre-estimate; C1 verdict, data `grading/2026-10-22-absence-role-verdict.md`: measured 2 of 741 rows' `projectedGames` move, +1 each). Re-run `--games-calibration --short` after the push and compare k. **Anton 2026-10-19:** practice-squad history may be a real next-season signal as a role input (Stage A graded check: MAE 4.872 → 4.874 after the fix) — test it as a separate input, not by restoring the old `'D'`.

### D-80 · Durability rule constants were validated on pre-D-76 data
**Found:** D-76 absence-role (data `76b5ddf`, Stage B rewrite; §6 of `.claude/tasks/d76-absence-role.md`) · **Blocking:** no · **Size:** small–medium

`classifyInjurySeason` trigger (gp < 10 ∧ dnp ≥ 3), ×0.88/×0.78, absence-shape 0.95/0.90/0.97/0.93 and clamp 0.85, dynasty ×0.85/×0.70. Hand-set (no fit artifact), but validated by the boundary-7 graded check on the faulty data. Likely to move: low–medium. D-76's own graded check is Stage A step 3's `--absence` run (pre-rewrite; afterwards `--absence` is vacuous, before = after). A post-push check of the rule constants needs a mode comparing a committed data rev with the working tree: scope that here; do not re-run `--absence` as is. **Anton 2026-10-19:** practice-squad history may be a real next-season signal as a role input (Stage A graded check: MAE 4.872 → 4.874 after the fix) — test it as a separate input, not by restoring the old `'D'`.

### D-81 · Games-calibration candidates
**Found:** D-76 absence-role (data `76b5ddf`, Stage B rewrite; §6 of `.claude/tasks/d76-absence-role.md`) · **Blocking:** no · **Size:** small

`backtests/2026-10-08-games-calibration-constants.json`, `2026-10-09-games-cause-constants.json` (report-only, not wired except via L6c) read `projectedGamesFor` and `classifyInjurySeason` (K1). Likely to move: low; refresh only if D-79 moves.

### D-82 · In-season k (`K_ROS_*`, `K_DYN_*`) was fitted on a model that included pre-D-76 `projectedGames`
**Found:** D-76 absence-role (data `76b5ddf`, Stage B rewrite; §6 of `.claude/tasks/d76-absence-role.md`) · **Blocking:** no · **Size:** small

`inSeasonConstants.js`; fitted on the boundary-6 model's errors, which include `projectedGames`. CR-25: a bump does not refit. Likely to move: low; fold into the next scheduled k refit, no separate run.

### D-84 · playerids crosswalk coverage for fringe/UDFA players (low priority)
**Found:** D-76 absence-role (data `76b5ddf`, Stage B rewrite; §6 of `.claude/tasks/d76-absence-role.md`) · **Blocking:** no · **Size:** medium

Players outside the `nflverse/playerids.json` crosswalk have no rosterweekly entry, so their Sleeper `'D'` weeks are never checked and remain (2025: 510 rows / 5,350 `'D'` slots; 322–698 skill slots/season 2021–2025). Only 8 of the 2025 rows are in the projection snapshot, none with KTC. Low impact on scores. Extend crosswalk coverage for fringe/UDFA players, then re-run the classifier through the normal ingest (completed seasons need another Invariant-1 rewrite, which triggers CR-30).

### D-85 · In-season healthy-cut override (`isHealthyCutRow`) sorted by pre-D-76 `'D'`
**Found:** D-76 absence-role (data `76b5ddf`, Stage B rewrite; §6 of `.claude/tasks/d76-absence-role.md`) · **Blocking:** no · **Size:** small

`isHealthyCutRow` (`inSeasonScoring.js`) and the verdict `inSeasonRule` of the data repo's `scripts/games-short-run.mjs` `inSeasonCheck`: `count(head, 'D')` sorts S+1 cut rows into `healthy` (no `'D'`) vs `missed`; practice-squad weeks put rows in `missed`. Likely to move: low–medium — membership of the two groups changes for cut rows with role weeks. Re-run `--games-calibration --short` after the push and confirm the override verdict and both groups' MAE ordering still hold.

---

## Done

Resolved items live in [data-repo-backlog-resolved.md](data-repo-backlog-resolved.md), moved verbatim.
