# In-season evidence — 2c wiring: registry companion (Session 2, commit 2)

Companion to `in-season-evidence-2c-wiring.md`. Applies to `docs/cross-repo-registry.md` only.
**Route:** the standard two-session route (app applies first, data syncs the same day — backlog D-53).
The parent-folder route is not used (its 2026-09-05 precondition is unmet). The daily mirror run is red
between the app push and the data sync. Never write the region's sentinel literals or a `sed` range
literal into an entry.

Every anchor below was checked against app `4b5e8e1` on 2026-09-28 and occurs exactly once in the file,
**except** where a disambiguated form is given (§A.4 data side, §B.2) — use that form. Apply §A and §B first (they are the data repo's 2c companion, copied verbatim from
`sleeper-dashboard-data/.claude/tasks/in-season-evidence-2c-registry.md` @ `1ca95d4`), then §C and §D
(this slice's additions, some of which anchor on text §A inserts). Edit by exact string replacement;
each edited field stays one physical line.

## A. CR-25 — data 2c companion §A (verbatim)

1. **App side** — after the field's final text `blended with the pinned \`K_ROS_OPP\``, append:

   `; \`src/utils/dynastyScore.js\` — the prospect prior the dynasty-side 2c k are fitted on (\`POSITION_PRIOR_PPG\`, \`ageMultiplier\`, \`draftMultiplier\`, \`computeProspectScore\`'s completed-season blend \`8 : min(gp, 12)\` and \`normalisePPG\`, its 0.60 KTC share and no-market-signal cap of 35), the prospect-path gate \`isTrueProspect\`, the SHORT history slot (\`recencyWeightedPPG\`'s last qualifying season and \`ageAdjScore\`'s \`currentPPG\`) and the stale-data route (\`seasonsSinceLastQS >= 2\`); \`src/App.jsx\` \`rookieDraftPicks\`, built from \`selectRookieDraft\` in \`src/utils/rookieDraft.js\` (the most recent rookie draft only, so a \`yearsExp\` 1 player carries no pick)`

2. **Data side** — five insertions:
   - after `` `classifyArm` `` (inside the `lib/inSeasonEvidence.mjs` parenthetical) insert
     `` , `prospectPriorPPG`, `ageMultiplier`, `draftMultiplier`, `modelScore`, `dynastyPickProxy`, `historyPriorOf`, `decideOwnVsPooled`, `ladderPick`, `PROSPECT_MIRROR` ``;
   - after `` `writeInSeasonArtifacts`) `` insert
     `` , `scripts/inseason-dyn-run.mjs` (`runInSeasonDyn`, `inSeasonDynMain`, `writeInSeasonDynArtifacts`) ``;
   - replace `` `bin/backtest.mjs --inseason`, `` with `` `bin/backtest.mjs --inseason` and `--inseason --dynasty`, ``;
   - after `` `backtests/<date>-inseason-constants.json` `` insert `` , `backtests/<date>-inseason-dyn-constants.json` ``;
   - between `` `test/inseason.test.mjs` `` and the `.` that follows it (the full stop that ends the list,
     just before the `(\`PHASE1_K\`` note), insert `` , `test/inseason-dyn.test.mjs` ``.

3. **Invariant** — replace `the population routing) equal the app's` with
   `the population routing, and — for the dynasty-side 2c k — the prospect prior and the SHORT history slot) equal the app's`.
   **This slice adds (same line):** replace `re-derivable from that fixture's sufficient statistics by the file's own \`fit\` rule;` with
   `re-derivable from that fixture's sufficient statistics by the file's own \`fit\` rule — except \`K_DYN_PROSPECT_A_*\`, which equal \`Math.round(kFit*2)/2\` of the matching \`yearsExp\` subgroup's pooled arm-A \`kFit\` (\`q1.subgroups.YE<n>.pooled.A.kFit\`) in the panel fixture that \`IN_SEASON_DYN_PANEL_SOURCE\` names;`
   (the anchor occurs once).

4. **Triggers:**
   - app side: before the `  ‖  ` separator, append
     `` , `computeProspectScore`, `POSITION_PRIOR_PPG`, `ageMultiplier`, `draftMultiplier`, `normalisePPG`, `isTrueProspect`, `recencyWeightedPPG`, `ageAdjScore`, `seasonsSinceLastQS` in `src/utils/dynastyScore.js`, `selectRookieDraft` in `src/utils/rookieDraft.js`, `rookieDraftPicks` in `src/App.jsx` ``;
   - data side: after `` `test/inseason.test.mjs` `` (the last trigger), append
     `` , `scripts/inseason-dyn-run.mjs`, `test/inseason-dyn.test.mjs` ``.
     *(App-side disambiguation: `` `test/inseason.test.mjs` `` occurs twice. Anchor on the unique
     `` `bin/backtest.mjs`, `test/inseason.test.mjs` `` at the end of the Triggers line; the Data-side
     occurrence is the one followed by `.` — §A.2's last bullet.)*

5. **Mirror**, two edits:
   - replace `the pin rules in \`buildConstants\`)` with
     `the pin rules in \`buildConstants\`/\`decideOwnVsPooled\`/\`ladderPick\`)`;
   - after the first sentence (it ends `never hand-edit a \`K_*\`.`), insert:

   `The dynasty-side 2c k (\`--inseason --dynasty\`) also mirror the prospect prior and the SHORT history slot: a change to \`POSITION_PRIOR_PPG\`, the age or draft multipliers, the completed-season blend, the prospect-path gate, the rookie-draft pick source or \`recencyWeightedPPG\` re-fits them via \`node bin/backtest.mjs --inseason --dynasty --write\`. The data side approximates the league's rookie-draft pick from NFL draft order (skill-position rank into a 12-team, 5-round draft) and ages players on 1 September; both are stated in that constants file's \`fit\`, and neither is an app definition.`

   (Keep a single space between the first sentence's full stop and the inserted text, and between the
   inserted text and the sentence that followed.)

## B. CR-15 — data 2c companion §B (verbatim)

1. **Data side** — at the end of the field (after
   `a deliberate consumer of the corrected rookie reconstruction outside \`bin/panel.mjs\`'s closure`), append:

   `; \`scripts/inseason-dyn-run.mjs\` (\`runInSeasonDyn\`, \`bin/backtest.mjs --inseason --dynasty\`) reuses that prior through \`assembleSeason\` and imports \`reconstructAgeCurves\` for the prospect-score peak normaliser`

2. **Triggers**, data side — after `` `scripts/inseason-run.mjs` `` (the last trigger), append `` , `scripts/inseason-dyn-run.mjs` ``.
   *(App-side disambiguation: `` `scripts/inseason-run.mjs` `` occurs 7 times; anchor on the unique
   `` `test/step4-mirror.test.mjs`, `scripts/inseason-run.mjs` `` at the end of CR-15's Triggers line.)*

3. **Mirror** — replace `fitted by \`bin/backtest.mjs --inseason\` over this reconstruction` with
   `fitted by \`bin/backtest.mjs --inseason\` and \`--inseason --dynasty\` over this reconstruction`.

No Invariant change. No app-side CR-15 text change: `dynastyScore.js` fires CR-15 as a whole-file trigger,
but `computeEmpiricalAgeCurves` (the mirrored function) is untouched by this slice.

## C. CR-25 — this slice's additions (after §A)

1. **App side** — after §A.1's appended text, which ends `so a \`yearsExp\` 1 player carries no pick)`, append:

   `; since in-season-evidence-2c-wiring (the 2c verdict's arm B and Q2 history prior on reused 2a k, plus a two-season check): \`buildRookieDynastyPriors\` in \`src/utils/prospectPrior.js\` (the rookie-path \`computeNextSeasonProjection\` recomputed with \`ktcMap: null, collegeStats: null\` — \`ktcMult\` and \`collegeContribution\` at 1.0, as the data side's arm-B prior holds them; the season projection keeps both) and \`buildProspectLevel\` in \`src/utils/inSeasonScoring.js\` (a \`yearsExp\` 0/1 prospect score starts from that prior, with no completed-season blend, updated at \`K_DYN_POINTS_ROOKIE0\`/\`K_DYN_POINTS_ROOKIE1P\` by population — except a \`yearsExp\` 1 WR, which keeps the position-prior start, updated at \`K_DYN_PROSPECT_A_YE1\`; the routing is \`PROSPECT_PRIOR_KIND\` (by \`yearsExp\` and position) in \`src/utils/inSeasonConstants.js\`, the arm-A k pinned by \`Math.round(k*2)/2\` from the 2c panel's \`q1.subgroups.YE1.pooled.A.kFit\` (\`IN_SEASON_DYN_PANEL_SOURCE\`) via the fixture \`src/__fixtures__/inseason-dyn-panel-2026-09-27.json\`), \`computeProspectScore\`'s \`prospectEntry\` argument and \`NO_MARKET_CAP\` (the cap of 35 bounds the starting value only, as a PPG ceiling of 0.35 × the position peak; the live update enters after it), and the SHORT history slot as wired — \`historyRowOf\` (prior = the PPG of the season before \`dataSeason\`, gp ≥ 8) feeding \`historyNextOf\`/\`buildInSeasonLevel\` at \`K_DYN_POINTS_HISTORY\`, admitted by \`recencyWeightedPPG\`/\`ageAdjScore\`'s level gate (last qualifying season ≥ the latest completed season − 1)`

2. **Triggers**, app side — after §A.4's appended text, which ends `` `rookieDraftPicks` in `src/App.jsx` ``
   (still before the `  ‖  ` separator), append
   `` , `src/utils/prospectPrior.js`, `src/__fixtures__/inseason-dyn-panel-*.json`, `buildProspectLevel`, `historyRowOf` in `src/utils/inSeasonScoring.js`, `NO_MARKET_CAP` in `src/utils/dynastyScore.js` ``.
   (`K_DYN_PROSPECT_A_*` and `PROSPECT_PRIOR_KIND` are covered by the existing `src/utils/inSeasonConstants.js` trigger.)

3. **Mirror** — after the field's final text `rather than adding another.`, append (one space first):

   `Since in-season-evidence-2c-wiring the app applies the 2c verdict's reuse rows (arm B at the 2a rookie k, SHORT-recent at \`K_DYN_POINTS_HISTORY\`); a data-side run that pins \`K_DYN_PROSPECT_B_*\` or \`K_DYN_POINTS_SHORT_HISTORY\` as new constants transports only after a deliberate app re-pin. The app's dynasty-side rookie prior holds \`ktcMult\` and \`collegeContribution\` at 1.0 to equal the data side's arm-B prior: porting either into the data reconstruction changes arm B and re-fits these k. Which \`yearsExp\` × position cells start from the projection (\`PROSPECT_PRIOR_KIND\`) follows a two-season (S+2) arm comparison on the 2c Q1 rows — only a WORSE cell keeps the position baseline; a cell flips only on a committed re-run of it. The second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit (\`IN_SEASON_DYN_PANEL_SOURCE\`), not from a constants file, until the data side emits them. The no-market cap's placement (starting value only) was chosen on the 2c Q1 cap rows (cap-before BEATS cap-after, pooled −16.3 score points): a change to the cap or its placement re-runs that comparison.`

## D. CR-21 — this slice's edits

1. **App side** — two replacements:
   - `` `computeDynastyScore`'s `inSeasonLevel` parameter in `src/utils/dynastyScore.js`) `` →
     `` `computeDynastyScore`'s `inSeasonLevel` parameter in `src/utils/dynastyScore.js`; since in-season-evidence-2c-wiring also SHORT veterans' level through `historyRowOf`, and the prospect score of `yearsExp` 0/1 players through `buildProspectLevel` and `computeDynastyScore`'s `prospectLevel` parameter) ``
   - `` the `liveSeasonUsable`/`scoringPosteriors` memos and the frozen-prior effect (reads `` →
     `` the `liveSeasonUsable`/`inSeasonLevel`/`scoringPosteriors`/`rookieDynastyPriors`/`prospectLevel`/`playerRowsWithProspect` memos and the frozen-prior effect (reads ``
   (The two `inSeasonLevel`-parameter anchors in §D.1 and §D.3 differ only by the trailing `)` vs `, the`.)

2. **Invariant** — replace
   `` the rest-of-season posterior) and the dynasty score's latest level for the standard population (`buildInSeasonLevel` → `computeDynastyScore`'s `inSeasonLevel`); `` with
   `` the rest-of-season posterior), the dynasty score's latest level for the standard population and, since in-season-evidence-2c-wiring, for SHORT veterans whose last qualifying season is the one before the latest completed season (`buildInSeasonLevel` → `computeDynastyScore`'s `inSeasonLevel`), and the prospect score of `yearsExp` 0/1 players (`buildProspectLevel` → `computeDynastyScore`'s `prospectLevel`); ``
   (the anchor occurs once; the sentence then reads "…reach the displayed season projection (…), the
   dynasty score's latest level … and the prospect score …; `computeNextSeasonProjection` and …").

3. **Triggers** — two replacements:
   - `` `computeDynastyScore`'s `inSeasonLevel` parameter in `src/utils/dynastyScore.js`, the `` →
     `` `computeDynastyScore`'s `inSeasonLevel` and `prospectLevel` parameters in `src/utils/dynastyScore.js`, `buildProspectLevel` and `historyRowOf` in `src/utils/inSeasonScoring.js`, the ``
   - `` the `liveSeasonUsable`/`scoringPosteriors` memos and the frozen-prior effect in `src/App.jsx` `` →
     `` the `liveSeasonUsable`/`inSeasonLevel`/`scoringPosteriors`/`rookieDynastyPriors`/`prospectLevel`/`playerRowsWithProspect` memos and the frozen-prior effect in `src/App.jsx` ``

4. **Mirror** — replace `also moves displayed projections and veterans' dynasty scores, silently` with
   `also moves displayed projections and veterans' and rookies' dynasty scores, silently`.

## G. CR-01 — Triggers (stale anchors only)

Replace the stale anchor list `src/App.jsx:656-687,701,741,758,1336,1361` with the **post-commit-1** line
numbers of, in order: the scored-projection memo through `playerRowsWithProj`'s memo (one range), the
`profileContextValue` `seasonProjections:` line, the snapshot effect's two `seasonProjections` reads, and the two
`seasonProjections={scoredSeasonProjections}` props. Session 2 derives them with `grep -n` after commit 1 and
records the output in the hand-back. On the same line, after `` `trimFrozenSnapshot` in `src/utils/inSeasonScoring.js` (reads served `players[id].projection.projectedPPG`) ``,
insert `` , `buildRookieDynastyPriors` in `src/utils/prospectPrior.js` (reads the rookie-route `projectedPPG` of a `computeNextSeasonProjection` call made with `ktcMap: null, collegeStats: null`) ``.
One physical line (CR-01 Triggers).

## E. Mirror texts emitted (CLAUDE.md rule — quoted verbatim as they read after this commit)

Why no re-fit is owed (CR-25): every 2c cell is `reuse`, and the changed app definitions — the arm-B
prior with no completed-season blend for YE0/1, the SHORT-recent history slot (`lastQS >= latest − 1`),
the KTC/college-neutral arm-B prior, the cap on the starting value — are exactly the definitions the verdict's arm-B and Q2 cells were
measured on (Q2: `historyPriorOf`'s L = S-2 is the app's `dataSeason − 1`). Arm A is behaviour-identical.
The data side still owes the mirror update (backlog D-54): its Q3 prospect path caps after evidence.

- **CR-01** — "State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. Since in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back), so the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys need no change. Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version."
  → This slice: envelope unchanged, `schemaVersion` stays 3, no data action beyond D-53. SHORT-recent
  rows' `inSeason.next` now carries `priorKind: 'history'`. A rookie's `inSeason.next` is NOT the dynasty
  prior (that is KTC/college-neutral and not captured) — D-56(b).
- **CR-15** — "…A mirrored-factor change, or a change to any of the three rookie mechanisms, also stales the in-season k constants fitted by `bin/backtest.mjs --inseason` over this reconstruction (CR-25): re-run it before re-pinning them." (full Mirror unchanged except §B.3's amendment to "`bin/backtest.mjs --inseason` and `--inseason --dynasty`")
  → This slice: no mirrored factor or rookie mechanism changed (`computeEmpiricalAgeCurves` untouched);
  D-53 syncs §B's text only.
- **CR-18** — "When a data-repo change adds, removes or reclassifies an ingested field, stat key or source … emit the exact `docs/signal-registry.md` row edit the app must make … The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable."
  → App-side change: the rows are edited in commit 1 (task §8). No data action.
- **CR-21** — "If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell on `/teams` or `/portfolio`** … **Since in-season-evidence-2b-2 a mis-marked or stale in-progress file also moves displayed projections and veterans' and rookies' dynasty scores, silently** — `gamesPlayed` counting inactive weeks over-weights every posterior."
  → No data action beyond D-53.
- **CR-25** — the entry's Mirror after §A.5 and §C.3: its existing text with §A.5's two edits, followed by §C.3's appended paragraph **verbatim and in that order** (reuse rows → neutral prior → S+2 routing rule → WR panel pin → cap placement). See §A.5 and §C.3 for the exact words.
  → Data action: D-53 (sync), D-54 (mirror cap placement / no-blend / neutral-prior equality; record the cap
  comparison), D-55 (record the S+2 comparison), D-56 (arm-A WR YE1 ladder; neutral-prior freeze). No re-fit (reason above).

## F. Sync gate (supersedes the data 2c companion's §C count)

After this commit the mirrored region differs from the data copy in exactly **13 physical lines**:
CR-01 Triggers (1); CR-15 Data side, Triggers, Mirror (3); CR-21 App side, Invariant, Triggers, Mirror (4);
CR-25 App side, Data side, Invariant, Triggers, Mirror (5). Session 2 checks
`git diff --stat docs/cross-repo-registry.md` shows 13 insertions / 13 deletions and nothing else, and
records the commit SHA in D-53. The data session copies the app span byte-for-byte, gates on the same
13-line count, and runs `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` and
`node --test test/registry.test.mjs`.
