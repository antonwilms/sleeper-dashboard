# P12b — Rookie QB starter level: registry, anchor policy and backlog companion

Companion to `.claude/tasks/rookie-qb-starter-level.md` (D9, `## Cross-repo impact`). Session 1, 2026-10-04,
against app `692df1e` / data `b7aa64f`. Session 2 applies §1–§3 to the app's `docs/cross-repo-registry.md`
**after** the code commit (so `<code-sha>` is real), then byte-copies the mirrored span into the data repo's
`cross-repo-registry.md`. Every anchor below was grep-checked unique in the live app registry at `692df1e`;
re-check each (`grep -cF` = 1) before editing, and stop on a miss. Never write the sentinel literals or a `sed`
range inside an entry.

Order of application inside the span: (1) P11's queued D-58 bullet; (2) P12a's companion (D-61); (3) this
slice's texts. Where two touch the same field, the later text is appended after the earlier.

## 1. Folded queued texts — apply verbatim

1. **P11 and P10 (D-58 bullets "Also pending from P11 …", `c804ada`, and "Also pending from P10 …", `b8a1e5b`)** —
   P11's CR-26 App side / Invariant / Mirror appends and CR-01 `trimFrozenSnapshot` parenthetical, and P10's CR-01
   `buildOwnProjections` parenthetical, exactly as written in `.claude/tasks/data-repo-backlog.md` (D-58). Both edit
   CR-01 Triggers, which §3.1 also edits. Nothing else from D-58.
2. **P12a (D-61)** — every text in data `.claude/tasks/qb-rookie-level-research-registry.md` (committed `b7aa64f`):
   CR-09 Data side + Triggers + Mirror; CR-01 Data side; CR-08 Data side + Triggers; CR-16 Data side; CR-15 Data
   side; CR-14 Data side; the CR-27 draft (Data side, Triggers data side, Invariant, Mirror — §3.5 below finalises
   it, so apply the draft and then §3.5's additions); the three `docs/signal-registry.md` appends. One anchor
   correction: the CR-09 Data side anchor is written there as "…(`team` mapped to era codes with `eraTeam`) (CR-27)";
   the live text is "…; `team` mapped to era codes with `eraTeam`) (CR-27)" (`docs/cross-repo-registry.md:113`) —
   append after that unique string.

## 2. Mirror texts emitted (CLAUDE.md rule), with answers

**CR-27 · QB takeover constants** — Mirror, quoted in full: "A change to any feature definition or bin on either
side re-runs `node bin/backtest.mjs --qb-takeover --write` and the app re-pins by byte copy with the data commit
SHA — never by hand-editing a coefficient. A re-pin that adopts a feature the app does not build (`bn`, `wk`, `wp`,
`dg`, `ps` beyond its current exact build) throws app-side by design: build it first. `incPPG`'s k = 3 is this
entry's own constant, not CR-25's. **Transport:** the app's `dp` is Sleeper `depth_chart_order` while the fit used
nflverse charts (only measurement: QB depth-1 68.8%, n = 32, a cross-season upper bound on disagreement); the app's
primary passer comes from Sleeper weekly rows while the fit used nflverse gamelogs (`attempts + sacksSuffered`);
g = 1 is extrapolated (5.1% predicted vs 2.2% raw game-1 rate); a returning original starter reuses the
backup-origin `pStay` with `dq = unknown`; the app holds a backup-origin starter's post-demotion codes at
d2/unknown; the app's primary passer considers playerMap-`QB` rows only (the fit's `primaryPassers` considers every
passer); `rk` is `years_exp === 0` (the fit: `draftYear === S`); live `iq` is a ratio of league-scored points (the
fit: half-PPR `weeklyPoints`) — basis cancels to first order in the ratio at every checkpoint, not only g = 1.
`QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted. **Nothing fails in either repo when this drifts.**"
— **Answer:** the app pins the rookie-level constants file (data `a443ea7`) by byte copy; values used half-PPR ×
`positionBasisScale.QB`; groups transposed onto the app's draft match (overall pick = within-round pick in round 1;
undrafted from `draftCapitalStatus`, the fit's from the crosswalk). Data action: none beyond the byte-sync.

**CR-15 · R3-FIT mirror** — Mirror quoted in full in the live registry (`docs/cross-repo-registry.md:165`, from
"Re-mirror the changed constant/gate/branch" to "…the stand-in for history with no capture."; Session 2 pastes it
into the hand-back). — **Answer:** a fourth rookie mechanism (a value change captures carry): mirror it into
`lib/rookieMirror.mjs` as a new model, together with the start share it multiplies — D-59, extended. The non-`chain`
rookie `projectedPPG` is unchanged, so `reconstructShippedRookieProjection`'s arm-B prior and the 2c k are unaffected.
Boundary 6 in `grading/anchor-policy.md` (this slice).

**CR-01 · Projection snapshot envelope** — Mirror quoted in full at `docs/cross-repo-registry.md:53` (from "State
the new envelope shape" to "…an `inSeason.ros` that carries `start`."). — **Answer:** additive `factors.qbStarterBasis`
on every row, no `schemaVersion` bump, no capture-gate change. Rookie QB `qbStarterPPG`, `chain` rows'
`projectedPPG`/`projectedTotalPts` (still `qbStarterPPG × qbStartShare`, × 17) and rookie QBs' `inSeason` priors move
at boundary 6 — segment across it.

**CR-26 · Snapshot read-back** — Mirror quoted in full at `docs/cross-repo-registry.md:284` (from "This is the one
place the app reads its own captures back" to "(`start.priorSource: 'live'`)."). — **Answer:** no read change; the
frozen `starterPPG` of a `yearsExp` 0 QB with known capital is the pinned rookie level; a capture before the bumped
`PRIOR_MODEL_FROM` is refused, so a pre-boundary rookie level is never read back. Data action: none.

**CR-25 · In-season evidence definitions and fitted k** — Mirror quoted in full at `docs/cross-repo-registry.md:276`
(from "An app-side change to any mirrored definition stales every fitted k" to "…transport only for undiscounted
rows."). — **Answer:** `PRIOR_MODEL_FROM` bumped (model change); no mirrored definition changes; the 2c dynasty k are
untouched (`buildRookieDynastyPriors` passes no takeover input); the QB rookie `K_ROS_POINTS_ROOKIE0`/`K_DYN_POINTS_ROOKIE0`
now apply over the rookie starter level for start-record and `next` priors, unfitted to it — joins D-59.

**CR-18 · Signal registry rows** — Mirror quoted in full at `docs/cross-repo-registry.md:189` (from "This entry's
data side is the one genuinely open set" to "…the emitted row edit is the whole deliverable."). — **Answer:** an
app-side computed-factor row changes (`qbStarterBasis`, rookie level) plus P12a's emitted row edits; no ingest,
coverage or reconstructable status changes. Data action: none (`data-catalog.md` unchanged).

## 3. This slice's registry texts (app span, then byte copy)

### 3.1 CR-01

- **Invariant** — after "A `chain` row with no live QB state carries no `inSeason`. Additive only." append:
  > **Since rookie-qb-starter-level (still v3, no bump)** both paths' `factors` also carry `qbStarterBasis`: `'rookie:top12'`, `'rookie:r1'`, `'rookie:day2'` or `'rookie:day3+'` on a `yearsExp` 0 rookie-path QB with known draft capital, whose `qbStarterPPG` is then the pinned rookie starter level × `rookieBasisScale` (CR-27) rather than the rookie-path level; `'projection'` on every other QB row (`qbStarterPPG` is the path's own level, as before); `null` on non-QBs. On such a row `projectedPPG` stays the rookie-path level unless `qbTakeoverBasis` is `'chain'`, where the `chain` identities above hold on the new `qbStarterPPG`. Additive only.
- **Mirror** — after "the same holds for an `inSeason.ros` that carries `start`." append:
  > **rookie-qb-starter-level:** additive key `qbStarterBasis`, no version bump. A `yearsExp` 0 QB's `qbStarterPPG`, a rookie `chain` row's `projectedPPG`/`projectedTotalPts`, and rookie QBs' `inSeason` `next.prior`/`start.starterPrior` move at `grading/anchor-policy.md` boundary 6 — segment them across it, detected by `qbStarterBasis`. `scripts/qb-rookie-level-run.mjs`'s live-level comparison is meaningful only on a pre-boundary snapshot (it pins 2026-10-03).

### 3.1a CR-01 Triggers (`[registry-stale]`, plan gate flag 1)

- Replace "`buildScoringPosteriors` and `applyInSeasonProjection` in `src/utils/inSeasonScoring.js` (read `seasonProjections[id].projectedPPG`/`projectedGames`)" with:
  > `buildScoringPosteriors` and `applyInSeasonProjection` in `src/utils/inSeasonScoring.js` (read `seasonProjections[id].projectedPPG`/`projectedGames`; `buildScoringPosteriors` also reads `factors.qbStarterPPG` and `factors.qbTakeoverBasis`)

### 3.2 CR-15

- **App side** — after "after `applyRookieCeiling` on the rookie path — is multiplied by `qbStartShare`" append:
  > **rookie-qb-starter-level:** `QB_ROOKIE_STARTER_PPG` + `resolveRookieQbStarterLevel` in `seasonProjection.js` — a `yearsExp` 0 rookie-path QB with known draft capital takes the pinned group level × `positionBasisScale.QB` as `qbStarterPPG` (recorded as `qbStarterBasis: 'rookie:<group>'`), which a `chain` row multiplies by `qbStartShare`; every non-`chain` rookie `projectedPPG` stays the ceiled level
- **Invariant** — replace "then (QB `chain` rows) the start share, then the games ladder" with:
  > then (a `yearsExp` 0 QB with known draft capital) `qbStarterPPG` replaced by the pinned rookie starter level — the non-`chain` `projectedPPG` stays the ceiled level — then (QB `chain` rows) the start share applied to `qbStarterPPG`, then the games ladder
- **Invariant and Mirror wording** (plan gate flag 2) — the entry counts the rookie mechanisms: "The three rookie
  mechanisms reproduce" (Invariant) → "The four rookie mechanisms reproduce"; "any of the three app-side rookie
  mechanisms" → "any of the four app-side rookie mechanisms"; "any of the three rookie mechanisms" → "any of the
  four rookie mechanisms" (Mirror; each phrase greps once). Apply before the appends below.
- **Mirror** — after "the D5 week-1 chart is only the stand-in for history with no capture." append:
  > **rookie-qb-starter-level (a value change captures carry):** mirror the rookie starter level into `lib/rookieMirror.mjs` as a new model — pre-boundary captures keep the rookie-path level as `qbStarterPPG` — together with the start share it multiplies (D-59); until then the reconstruction has neither. Boundary 6 in `grading/anchor-policy.md`. No non-`chain` rookie `projectedPPG` moves, so the dynasty arm-B prior (`reconstructShippedRookieProjection` at ktc/college 1.0, no takeover input) and the 2c k are unaffected (CR-25).

### 3.3 CR-25

- **Mirror** — after "so the 2c rookie k transport only for undiscounted rows." append:
  > **rookie-qb-starter-level:** (a) it moves rookie QBs' `qbStarterPPG` and rookie `chain` rows' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) no CR-25 definition changes and the 2c dynasty k stay valid — `buildRookieDynastyPriors` passes no takeover input, so every rookie QB's dynasty prior is the unchanged ceiled level; (c) a `yearsExp` 0 QB's `next` prior and start-record ROS prior are now the pinned rookie starter level, a prior the QB `K_ROS_POINTS_ROOKIE0`/`K_DYN_POINTS_ROOKIE0` were not fitted on — applied unfitted until D-59's QB re-fit.

### 3.4 CR-26

- **Invariant** — replace "(finite; equal to `projectedPPG` unless `qbTakeoverBasis` is `'chain'`)" with:
  > (finite; equal to `projectedPPG` unless `qbTakeoverBasis` is `'chain'` or, since rookie-qb-starter-level, `qbStarterBasis` starts with `'rookie:'`)
- **Mirror** — append at the end of the field (after P11's folded sentence):
  > Since rookie-qb-starter-level a `yearsExp` 0 QB's frozen `starterPPG` is the pinned rookie starter level; a capture dated before the bumped `PRIOR_MODEL_FROM` is refused, so no pre-boundary rookie level is read back as a starter prior.

### 3.5 CR-27 (after P12a's draft is applied)

- **App side** — after "the chain has no injury input)) and `src/api/qbWeekly.js`" append:
  > ; since rookie-qb-starter-level `QB_ROOKIE_LEVEL_SOURCE`/`QB_ROOKIE_STARTER_PPG` and `resolveRookieQbStarterLevel` in `src/utils/seasonProjection.js` (groups from the app's draft match: top12 = round 1 and pick ≤ 12, r1 = round 1 and pick ≥ 13, day2 = rounds 2–3, day3+ = rounds 4–7 or `draftCapitalStatus` `'undrafted'`; unknown capital, a round-1 match without a pick, `yearsExp` ≠ 0 or a non-QB → no group), applied to `qbStarterPPG` only, and the byte-identical provenance copy `src/__fixtures__/qb-rookie-level-constants-2026-10-04.json`, re-derived by `src/__tests__/qbRookieLevelConstants.test.js`
- **Triggers (app side)** — replace "`buildQbLiveStates`/`primaryPassersByTeamWeek` in `src/utils/inSeasonScoring.js`, `src/api/qbWeekly.js`  ‖" with:
  > `buildQbLiveStates`/`primaryPassersByTeamWeek` in `src/utils/inSeasonScoring.js`, `src/api/qbWeekly.js`, `QB_ROOKIE_LEVEL_SOURCE`/`QB_ROOKIE_STARTER_PPG`/`resolveRookieQbStarterLevel` in `src/utils/seasonProjection.js`, `src/__fixtures__/qb-rookie-level-constants-*.json`, `src/__tests__/qbRookieLevelConstants.test.js`  ‖
- **Mirror** — at the end of the field (after P12a's appended "**Rookie starter level (P12):** …" text) append:
  > **Transport (P12b):** the app's `nflDraftPick` is the nflverse overall pick, equal to the fit's within-round pick in round 1, the only round whose pick is read; the app's undrafted is `draftCapitalStatus` (absent from a loaded draft year), the fit's the crosswalk's `undrafted`; rookie is `years_exp === 0` (the fit: `draftYear === S`). The app applies the level to `qbStarterPPG` only; a `chain` row's `projectedPPG` follows as share × level.

## 4. Data repo — `grading/anchor-policy.md` (data commit 3; then data commit 4 after the push)

4.1 Intro — replace "has changed five times on the axes this file\ntracks — three on the rookie path, one on the veteran path (the Step 4 up-side), one on QB rows of both paths (the\nstart share)." with the same text ending "…one on QB rows of both paths (the start share), one on rookie QB rows
(the rookie starter level)." and "five times" → "six times". Keep the file's line wrapping style.

4.2 "Five model changes on the three tracked axes" → "Six model changes on the four tracked axes". Add table row:
`| 6 | <app push range> (the model is live once the push lands; captures check out app main) | <push time UTC> | rookie (QB rows, yearsExp 0) | rookie QB starter level |`
— commit 3 writes the placeholders literally as `pending — filled by the post-push commit`; commit 4 fills them.

4.3 New subsection, immediately before `## Boundaries by path`:

> ### Rookie QB rows — boundary 6
>
> `factors.qbStarterBasis` present → captured under the rookie-starter-level model; every row carries it from
> boundary 6 on (`null` on non-QBs). On a rookie-path QB row (`projection.confidence === 'rookie'`):
>
> - `'rookie:top12'`, `'rookie:r1'`, `'rookie:day2'`, `'rookie:day3+'` → `qbStarterPPG` = the pinned rookie starter
>   level (`backtests/2026-10-04-qb-rookie-level-constants.json` `starterPPG`, half-PPR) × `rookieBasisScale`. If
>   `qbTakeoverBasis` is `'chain'`, `projectedPPG` and `projectedTotalPts` move with it (boundary 5's identities on
>   the new `qbStarterPPG`); otherwise `projectedPPG` is unchanged from boundary 5. `inSeason.next.prior` and
>   `inSeason.start.starterPrior` read this level.
> - `'projection'` → unchanged from boundary 5.
> - Absent on a rookie-path QB row → pre-boundary: `qbStarterPPG` is the rookie-path level.
>
> Veteran-path rows carry `'projection'`/`null` only; nothing on that path moved.
>
> **Expected segments — rookie QB rows**, a rule and not a date: the first capture whose `capturedAt` is after the
> app push of boundary 6 reflects it; every earlier capture is pre-boundary on this axis.
>
> | capture date | expected rookie QB starter level |
> |---|---|
> | `< first capture after the app push` | rookie-path level — no row carries `qbStarterBasis` |
> | `>= first capture after the app push` | pinned group level on `'rookie:*'` rows — to be confirmed against the first such capture |

4.4 `## Boundaries by path` — append: "Boundary 6 is rookie-QB-only (`yearsExp` 0 with known draft capital); it moves
`qbStarterPPG` on those rows and `projectedPPG`/`projectedTotalPts` only on their `chain` rows, and a pooled rookie QB
grade spanning it measures the mechanism change."

4.5 Last paragraph — "and boundary 5 as of the qb-takeover-wiring push, so the table above is complete, for the
rookie mechanisms,\nthe Step 4 up-side axis and the QB start-share axis, as of qb-takeover-wiring." → "boundary 5 as of
the qb-takeover-wiring push and boundary 6 as of the rookie-qb-starter-level push, so the table above is complete,
for the rookie mechanisms, the Step 4 up-side axis, the QB start-share axis and the rookie QB starter level, as of
rookie-qb-starter-level."

4.6 Data commit 4 (after both pushes): fill row 6 with the app push range and the push's UTC time (as `c2e3ce8`
did for boundary 5). Message: `anchor-policy: boundary 6 push time (app <range>, <UTC>)`.

## 5. Sync gate

After the app registry commit: extract both spans and diff — they must differ in exactly the lines §1 and §3 touched.
Count the changed physical lines app-side (`git diff -U0 <pre>..<post> -- docs/cross-repo-registry.md | grep -c '^+[^+]'`)
and report it; the data byte copy must change the same count. Then `REGISTRY_MIRROR=1 node --test
test/registry-mirror.test.mjs` and `node --test test/registry.test.mjs` in the data repo.

## 6. `.claude/tasks/data-repo-backlog.md` (app commit 2)

- **D-58** — the P11 bullet and the P10 bullet: prefix "~~" … "~~ **Applied 2026-10-0x by rookie-qb-starter-level (`<registry-sha>`).**" as
  the file does for superseded items. The rest of D-58 stays queued.
- **D-59** — append: "**Also (rookie-qb-starter-level, `<code-sha>`):** the rookie QB starter level — mirror
  `QB_ROOKIE_STARTER_PPG`/`resolveRookieQbStarterLevel` into `lib/rookieMirror.mjs` as a new model (pre-boundary
  captures keep the rookie-path level; boundary 6), applied to the starter level the share multiplies, and re-fit the
  QB `K_ROS_POINTS_ROOKIE0`/`K_DYN_POINTS_ROOKIE0` over that prior (CR-25)."
- **D-61** (new, closed) — `### D-61 · Registry companion of P12a (qb-rookie-level-research)` / **Found:** data
  `qb-rookie-level-research-registry.md` · **Found by:** data `b7aa64f` · **Status:** applied by
  rookie-qb-starter-level (`<registry-sha>`, data `<data-sha>`) — kept for traceability.
- **D-62** (new) — `### D-62 · Confirm anchor-policy boundaries 5 and 6 against their first captures` / **Found:**
  rookie-qb-starter-level.md · **Blocking:** no · **Size:** small. Steps: read the first `snapshots/<date>.json` whose
  `capturedAt` follows each app push; confirm every QB row carries `qbTakeoverBasis` (5) and every row `qbStarterBasis`
  (6), with `'rookie:*'` rows' `qbStarterPPG` = pinned value × `rookieBasisScale` to 3 dp; replace each "to be
  confirmed" table row with a confirmed one (counts per basis), as the rookie and veteran tables carry.

## 7. Mirror texts verbatim (app registry at `692df1e`)

Quoted for the CLAUDE.md emission rule; §2 carries the answers. CR-27's is quoted in §2.

**CR-01** (`:53`):

> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. Since in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 — the frozen-prior read-back), so the snapshot `schemaVersion` is no longer independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that ceiling before any snapshot bump above it, never after (data CLAUDE.md Invariant 4). The per-player `inSeason` field is additive and did not bump the version; graders that ignore unknown per-player keys need no change. Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version. **qb-takeover-wiring:** additive keys, no version bump. A grader must not score a `qbTakeoverBasis: 'chain'` row's `projectedPPG` against realised PPG per game played — grade it on total points or segment it (`grading/anchor-policy.md` boundary 5); the same holds for an `inSeason.ros` that carries `start`.

**CR-15** (`:165`):

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`) only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other eleven app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the three app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`. A mirrored-factor change, or a change to any of the three rookie mechanisms, also stales the in-season k constants fitted by `bin/backtest.mjs --inseason` and `--inseason --dynasty` over this reconstruction (CR-25): re-run it before re-pinning them. **qb-takeover-wiring (a gate change captures carry):** add the QB start share to `lib/projectionFactors.mjs` as a new depth model — legacy flat kept for pre-boundary captures, `qb-takeover` the harness default — never an overwrite. It needs the g = 1 takeover features (depth order, rookie, the incumbent's S−1 PPG over the all-teams median) and the CR-27 chain, and it applies after the comp blend / rookie ceiling, not inside `rawPPG`. Until then the reconstruction applies 0.88/0.68 to post-boundary QB2/QB3 rows the app shares at ≈0.16/≈0.04. Boundary 5 in `grading/anchor-policy.md`; the QB in-season k are stale until re-fitted (CR-25, data backlog D-59). Parity against a post-boundary capture reads that capture's own Sleeper chart (`teamDepthCharts`/`depthChartOrder`); the D5 week-1 chart is only the stand-in for history with no capture.

**CR-18** (`:189`):

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**CR-25** (`:276`):

> An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. The dynasty-side 2c k (`--inseason --dynasty`) also mirror the prospect prior and the SHORT history slot: a change to `POSITION_PRIOR_PPG`, the age or draft multipliers, the completed-season blend, the prospect-path gate, the rookie-draft pick source or `recencyWeightedPPG` re-fits them via `node bin/backtest.mjs --inseason --dynasty --write`. The data side approximates the league's rookie-draft pick from NFL draft order (skill-position rank into a 12-team, 5-round draft) and ages players on 1 September; both are stated in that constants file's `fit`, and neither is an app definition. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior, the pin rules in `buildConstants`/`decideOwnVsPooled`/`ladderPick`) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM` (a frozen prior captured before the current model is refused — CR-26). An app-side model change bumps `PRIOR_MODEL_FROM` at once; if it also changes a CR-15-mirrored factor, the k are stale until re-fitted — a bump is not a re-fit. The Q4 NO-GAIN pooled-pin *decision* (own k BEATS pooled out of sample) is taken and tested data-side; the app's provenance test checks only which fixture cell each `k` re-derives from. These k partly compensate for the projection's known optimism (c ≈ 0.80–0.86): correcting that optimism is a re-fit, not a re-pin. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another. Since in-season-evidence-2c-wiring the app applies the 2c verdict's reuse rows (arm B at the 2a rookie k, SHORT-recent at `K_DYN_POINTS_HISTORY`); a data-side run that pins `K_DYN_PROSPECT_B_*` or `K_DYN_POINTS_SHORT_HISTORY` as new constants transports only after a deliberate app re-pin. The app's dynasty-side rookie prior holds `ktcMult` and `collegeContribution` at 1.0 to equal the data side's arm-B prior: porting either into the data reconstruction changes arm B and re-fits these k. Which `yearsExp` × position cells start from the projection (`PROSPECT_PRIOR_KIND`) follows a two-season (S+2) arm comparison on the 2c Q1 rows — only a WORSE cell keeps the position baseline; a cell flips only on a committed re-run of it. The second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit (`IN_SEASON_DYN_PANEL_SOURCE`), not from a constants file, until the data side emits them. The no-market cap's placement (starting value only) was chosen on the 2c Q1 cap rows (cap-before BEATS cap-after, pooled −16.3 score points): a change to the cap or its placement re-runs that comparison. **qb-takeover-wiring:** (a) it moves QB backups' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) it changes a CR-15-mirrored factor (Step 8, QB), so the QB `K_*` are stale until `--inseason` re-runs on the re-mirrored reconstruction (D-59) — a bump is not a re-fit; (c) the QB ROS posterior for a non-original starter uses n = starts at a k fitted on n = games played, which coincide for the starters that dominate that fit; (d) a rookie QB whose starts trail the preseason chain by more than one game has his prospect prior × 0.90 — the data side's arm-B prior has no such discount, so the 2c rookie k transport only for undiscounted rows.

**CR-26** (`:284`):

> This is the one place the app reads its own captures back. Renaming the `snapshots/<date>.json` template or its manifest key, re-keying captures off UTC date, rewriting a committed snapshot, dropping `leagueId`/`targetSeason`/`projectionBasis`, or moving `projection.projectedPPG` silently turns every frozen prior into the live one (flagged `no-snapshot`, `league`, `season` or `basis`) — nothing errors. A snapshot `schemaVersion` bump above the app's `MAX_SUPPORTED_SCHEMA` makes `tryDataStore` refuse the file (flag `unavailable`): raise the app ceiling first (data CLAUDE.md Invariant 4, which since this entry no longer exempts snapshots). A capture gap before kickoff is tolerated by design (latest-before rule); a capture gap spanning the whole pre-kickoff window leaves the season unfrozen. A frozen prior pins the projection model: a capture dated before the app's `PRIOR_MODEL_FROM` (CR-25) is refused, so an app model change after kickoff unfreezes the rest of that season rather than keeping a stale prior. The data side needs no action for that — it is decided by the app constant against the capture date. Since qb-takeover-wiring the trim also reads `projection.factors.qbStarterPPG`; moving or renaming it silently makes every QB's ROS starter prior the live one (`start.priorSource: 'live'`).
