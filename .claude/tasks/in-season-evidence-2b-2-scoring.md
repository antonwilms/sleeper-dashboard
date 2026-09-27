# In-season evidence — Phase 2b-2: scoring on, the seam test, the "what changed" tab

**Plan approved by Anton 2026-09-27. Ready for Session 2 (2026-09-27): 2b-1 landed (`eacde17`, fix `f3fda2e`), D-49 synced (data `93e469e`, mirror test 21/21), anchors re-checked against `f3fda2e` (§12).**

Session 1 (planning, opus), 2026-09-26. **Depended on 2b-1** (`in-season-evidence-2b-1-constants-snapshot.md`
and its registry companion) being implemented, verified and pushed, **and on the D-49 data sync having
landed**. Before Session 2 starts, the still-open Session 1 re-checks every line anchor below against the
2b-1 commit and patches this file. Anchors here are against `a5e7901` plus the 2b-1 spec.

## 0. Goal and fixed decisions

This slice turns scoring on. The live season reaches exactly two outputs, both through the one seam
module `src/utils/inSeasonScoring.js`:
1. **The season projection shown to the user.** `projectedPPG` becomes the rest-of-season posterior,
   `ros.value` (frozen prior when there is one, else live, times `K_ROS_*` by population), on every
   display consumer. The pipeline's `seasonProjections` and the snapshot's `projection` are untouched.
2. **The dynasty score, standard population only.** The latest-level PPG becomes the history posterior
   `next.value` (S-1 PPG prior × `K_DYN_POINTS_HISTORY`).

Decisions (Anton, 2026-09-26 — do not reopen):
- The dynasty side uses `K_DYN_POINTS_HISTORY` for veterans.
- **Rookies' prospect score is unchanged in 2b.** `computeProspectScore` keeps its last-completed-season
  blend, and its `currentSeasonStats` stays `careerStats[mostRecentSeason]`, never the live season. A
  rookie therefore gets exactly one live update: the season-projection ROS posterior
  (`K_ROS_POINTS_ROOKIE*`). Their next-season estimate is only recorded in the snapshot field (2b-1),
  for later grading.
- **SHORT veterans' dynasty score is unchanged** for the same reason. No history-prior k was measured
  for them (arm R needs S-1 gp ≥ 8). Their ROS projection does update (`K_ROS_POINTS_SHORT`).
- **QB-quality firewall (plan review, BLOCKING flag).** `computeQBQualityByTeam` reads QB rows'
  `dynastyScore.score` (`teamContext.js:59`). Its two maps feed the projection's Step 7b
  (`qbQualityByTeamRostered` → `computeNextSeasonProjection`, `App.jsx:528-530,601`;
  `seasonProjection.js:876-881`) and the dynasty QB modifier (`qbQualityByTeam` →
  `applyQBQualityModifier`, `App.jsx:519-521,535-540`). If a QB's level-adjusted score reached either
  map, the live season would move the raw projection and the snapshot `projection`, and would reach
  SHORT, rookie and standard pass-catchers a second time. **Both QB-quality maps are therefore built
  from dynasty scores computed without the level** (§4.2a). The live season's only dynasty effect is
  the player's own level.
- The 2b-1 model-pin rule holds: 2026 runs unfrozen. Nothing in this slice changes
  `computeNextSeasonProjection`'s output, so `PRIOR_MODEL_FROM` is **not** bumped and
  `priorModelFrom.test.js` must stay green unmodified.
- Opportunity stays display-only. Baseline = most recent of the last three seasons with ≥ 4 games
  (verdict Q5 arm B). No weak/strong split. The usage-shift sort is relative (Q6).

## 1. Touch list

Edited: `src/utils/inSeasonScoring.js` (+`buildInSeasonLevel`, +`applyInSeasonProjection`, and a shared
internal `historyNextOf`), `src/utils/inSeasonScoring.test.js`, `src/utils/dynastyScore.js`,
`src/utils/dynastyScore.test.js`, `src/App.jsx` (incl. the QB-quality firewall), `src/utils/inSeasonEvidence.js`,
`src/utils/inSeasonEvidence.test.js`, `src/components/market/Market.jsx`,
`src/components/market/Market.test.jsx`, `src/components/dp/PlayerDetailModal.jsx` (+ its test if one
covers the NEXT SEASON stat), `src/__tests__/currentSeasonTotalsIsolation.test.js` (rewritten into the
seam test), `src/__tests__/inSeasonEvidenceViewOnly.test.js` (rewritten), `docs/cross-repo-registry.md`,
`docs/nav/utils.md`, `docs/nav/components.md`, `docs/architecture.md`, `docs/signal-registry.md`,
`docs/dynasty-scoring.md` (the level substitution), `.claude/tasks/data-repo-backlog.md`.
**Not touched:** `seasonProjection.js`, `projectionSnapshot.js`, `inSeasonConstants.js`, `frozenPrior.js`.

## 2. Seam additions (`src/utils/inSeasonScoring.js`)

### 2.1 `historyNextOf` (internal, shared)
Extract from 2b-1's `buildScoringPosteriors` the standard-population `next` computation into
`historyNextOf({ row, live, pos })`: prior = `row.fantasyPoints / row.gamesPlayed` (row =
`careerStats[dataSeason][id]`, gp ≥ 8 by population), `posteriorOf(prior, obs, n, K_DYN_POINTS_HISTORY[pos])`,
rounded as in 2b-1. `buildScoringPosteriors` calls it. Its output must be byte-identical to 2b-1's.
The 2b-1 tests stay green unmodified.

### 2.2 `buildInSeasonLevel({ careerStats, dataSeason, playerMap, currentSeasonTotals, projectionBasis })` → `Map<id, number>`
Pipeline-independent: it needs no projection, so it can run before `playerRows`. Returns an empty Map
unless `usableLiveSeason(...)` holds and `projectionBasis ∈ {'league','half_ppr'}`. Iterates
`Object.keys(careerStats[dataSeason] ?? {})`. For each id it requires all of:
- a skill position;
- `classifyInSeasonPopulation(...) === 'standard'`;
- a live row whose `scoringBasis === projectionBasis`;
- `n > 0` and a finite `obs`.

It then sets `map.set(id, historyNextOf(...).value)`. **n = 0 rows are omitted**, because the dynasty
score then reads its own unchanged value; this keeps the Map small. **Invariant, tested:** for every id
in both, `level.get(id) === scoringPosteriors.get(id).next.value`.

### 2.3 `applyInSeasonProjection(seasonProjections, scoringPosteriors, currentSeasonTotals)` → object
- `scoringPosteriors` null/empty → returns `seasonProjections` itself (same reference).
- Otherwise a new top-level object. Ids without a record, or whose `ros.value` is not finite, keep the
  **same object reference**. Ids with a record get
  `{ ...proj, projectedPPG: r1(ros.value), projectedTotalPts, inSeason: record }` with
  `r1 = x => Math.round(x*10)/10` and **(Anton, 2026-09-27) points scored so far plus the rest-of-season
  rate × remaining projected games**:
  ```js
  const live = currentSeasonTotals?.players?.[id]
  const pointsSoFar = Number.isFinite(live?.fantasyPoints) ? live.fantasyPoints : 0   // league-rescored; basis already checked by the record's existence
  const remainingGames = Math.max(0, proj.projectedGames - record.n)
  const projectedTotalPts = r1(pointsSoFar + r1(ros.value) * remainingGames)
  ```
  - `proj.projectedGames` is the live projection's full-season games figure. The frozen trim carries
    PPG only, so games always come from the live projection.
  - A player who has already played more games than projected adds no remaining games. The total is
    then the points banked, never negative remaining.
  - `record.n` is the same live `gamesPlayed` the posterior used. Nothing is re-estimated.
- `factors`, `confidence`, `adjustmentSummary` and `projectedGames` are the prior's, carried by
  reference. `projectedGames` stays the full-season figure, so `projectedTotalPts` no longer equals
  `projectedPPG × projectedGames` for scored rows. The `projectedTotalPts` consumers, both dormant
  (`roster/MyTeamView.jsx:20,25`, `roster/PlayerCard.jsx:42`), read it as a total and need no change.
- Tests (`inSeasonScoring.test.js`):
  - `(fp 30, n 3, ros 9.4, projectedGames 14)` → `r1(30 + 9.4·11)` = 133.4;
  - `n` > `projectedGames` → the total equals `fantasyPoints`;
  - no live row, n 0 → `r1(ros × projectedGames)`;
  - the unscored id keeps its object reference.
- Never mutates its inputs. Tested with deep-frozen inputs.

## 3. Dynasty consumption (`src/utils/dynastyScore.js`)

`computeDynastyScore(…, positionBasisScale = null, inSeasonLevel = null)` gains a new **last**
parameter. `inSeasonLevel` is a `Map<id, number>` or `null`. The rule, in a comment at the top of the
components block: "The live season enters the dynasty score only here, and only as the latest level
for the standard population (in-season-evidence-2b-2 §3). The posterior replaces the PPG of the most
recent completed season in exactly two reads."
1. `recencyWeightedPPG(playerId, careerStats, allSeasons, inSeasonLevel = null)`. When `inSeasonLevel`
   has the id **and** the last qualifying season equals `allSeasons.at(-1)` (the most recent completed
   season), replace the latest qualifying PPG with the level value, **in both branches**: the
   one-qualifying-season return (`dynastyScore.js:631`, today `qualifying[0]`; a standard player can
   have exactly one qualifying season) and the 0.70/0.30 blend's `last`. `qualifying` holds bare values
   today (`:620-628`), so carry `{ season, ppg }` internally to know the last qualifying season. The
   return value is unchanged when there is no substitution. The same function serves the player **and** every
   peer in `positionRankingPPGs`, so the pool stays on one formula. Both call sites pass
   `inSeasonLevel`.
2. `ageAdjScore`: `currentPPG = (lastQS === mostRecentSeason && inSeasonLevel?.has(playerId)) ?
   inSeasonLevel.get(playerId) : seasonHistory.at(-1).ppg`.

**Untouched, deliberately:** trajectory, momentum, consistency, durability, opportunity quality, TD
reliance, `computeBreakoutFlag` (it keeps the completed-season `seasonHistory.at(-1).ppg` — pass the
original value, not the substituted `currentPPG`), bounce-back, `peakSeason`, the label logic (it reads
`finalScore`), and every path other than components (A, A2–A4). Both `computeProspectScore` call sites
keep receiving `currentSeasonStats`, which stays `careerStats[mostRecentSeason][playerId]`. **Path B's
prospect term gets no live input.** The live season reaches a Path B score only through its components
(60%), and only when the player is standard.

No new `signals` key, and no factor change. `dynastyScore.js` is a whole-file CR-15 trigger. §8
emits the Mirror; `computeEmpiricalAgeCurves` is unchanged, so nothing mirrored moves.

## 4. App wiring (`src/App.jsx`)

1. Memo **before** `playerRows`:
   ```js
   const inSeasonLevel = useMemo(() => {
     if (!careerStats || !leagueData?.playerMap) return null
     return buildInSeasonLevel({ careerStats, dataSeason: deriveDataSeason(careerStats),
       playerMap: leagueData.playerMap, currentSeasonTotals, projectionBasis })
   }, [careerStats, leagueData, currentSeasonTotals, projectionBasis])
   ```
   `projectionBasis` is 2b-1's memo. If it is declared below this point, move its declaration up. It
   depends only on `careerStats`.
2. `computeDynastyScore(…, positionBasisScale, inSeasonLevel)` in the `playerRows` memo. Add
   `inSeasonLevel` to that memo's deps.
2a. **QB-quality firewall.** In the same loop, when `info.position === 'QB' && inSeasonLevel?.has(playerId)`,
   also compute `dynastyScoreBase = computeDynastyScore(<identical args>, positionBasisScale, null)`
   and push it on the row as `dynastyScoreBase`. That costs one extra call per QB with live evidence,
   about 40. Then add
   `const qbQualityRows = useMemo(() => playerRowsWithKTC.map(r => r.dynastyScoreBase ? { ...r, dynastyScore: r.dynastyScoreBase } : r), [playerRowsWithKTC])`
   and point **both** `computeQBQualityByTeam` memos (`:519-521` and `:528-530`) at `qbQualityRows`
   instead of `playerRowsWithKTC`. `teamContext.js` is not edited. `dynastyScoreBase` is read nowhere
   else; say so in a comment at the push site.
3. **Placement:** 2b-1's `scoringPosteriors` memo and this one both go in the gap between the
   `scoringPosteriors` memo (`:617-621`, after the `seasonProjections` memo) and `playerRowsWithProj`
   (`:625`). It is read by `playerRowsWithProj` and `profileContextValue` (`:656`); a later declaration is a TDZ ReferenceError
   (a `const` read before its line). The memo:
   `const scoredSeasonProjections = useMemo(() => applyInSeasonProjection(seasonProjections, scoringPosteriors, currentSeasonTotals), [seasonProjections, scoringPosteriors, currentSeasonTotals])`.
4. Switch **display** consumers to `scoredSeasonProjections`:
   - `playerRowsWithProj` (reads and deps);
   - `profileContextValue.seasonProjections`;
   - the `seasonProjections=` props of `<Portfolio>` (`:1299`) and `<Market>` (`:1324`);
   - any other JSX `seasonProjections=` prop. Grep and list them in the hand-back.
5. **Stays on raw `seasonProjections`:** the snapshot effect's `shouldWriteProjectionSnapshot` and
   `writeProjectionSnapshot` args, and `buildScoringPosteriors`'s input. The posterior is a function of
   the raw prior, never of itself.
6. `<Market>` gains two props:
   - `scoringPosteriors={scoringPosteriors}`;
   - `frozenPriorStatus={frozenPrior && { status: frozenPrior.status, reason: frozenPrior.reason ?? null, dateKey: frozenPrior.dateKey ?? null }}`.

## 5. The seam test — rewrite `src/__tests__/currentSeasonTotalsIsolation.test.js` in place

The header comment is rewritten: "in-season-evidence-2b-2 — the live season reaches scoring only
through `src/utils/inSeasonScoring.js`, and the snapshot's `projection` is byte-identical with the live
season loaded or not." Keep the file name (history continuity). Blocks:
1. **Keep verbatim:**
   - the `deriveDataSeason` block;
   - the `careerStats is never written…` block;
   - the `live-season rows are league-scoped` block. Its reset-line count stays 3; the 2b-1 additions
     share those lines.
2. **PIPELINE modules** (same 14-entry list):
   - no module matches `/currentSeasonTotals|loadCurrentSeasonTotals/`;
   - none has a module specifier ending `inSeasonScoring`, `inSeasonEvidence`, `frozenPrior` or
     `inSeasonConstants` (reuse the `moduleSpecifiers` extractor, copied from the view-only guard);
   - `dynastyScore.js` matches `/inSeasonLevel/`, and **no other** PIPELINE module does.
3. **App.jsx call-site slices** (reuse `projectionInputsGuard`'s paren-balancing `extractCall`, copied):
   - `computeDynastyScore(` includes `inSeasonLevel` and none of
     `currentSeasonTotals|scoringPosteriors|frozenPrior`;
   - `computeNextSeasonProjection(` includes none of
     `currentSeasonTotals|scoringPosteriors|inSeasonLevel|frozenPrior|scoredSeasonProjections`;
   - `writeProjectionSnapshot(` includes `seasonProjections,` and not `scoredSeasonProjections`;
   - `buildScoringPosteriors(` includes `seasonProjections,` and not `scoredSeasonProjections`;
   - the only identifiers passed to `buildInSeasonLevel(`/`buildScoringPosteriors(`/`applyInSeasonProjection(`
     that carry live data are `currentSeasonTotals` and `frozenPrior`.
4. **Behavioural byte-identity.**
   - Build two projections with `makeVet`/`makeRookie` → `seasonProjections`.
   - Build a live season and a posterior Map with `buildScoringPosteriors`.
   - Snapshot A = `buildProjectionSnapshot` with no posteriors.
   - Call `applyInSeasonProjection(seasonProjections, posteriors, liveSeason)` on deep-frozen inputs.
   - Snapshot B = `buildProjectionSnapshot({ seasonProjections, scoringPosteriors: posteriors, … })`.
   - Assert every `A.players[id].projection` JSON equals `B.players[id].projection`.
   - Assert `B` minus each `inSeason` key JSON equals `A`.
   - Assert the scored map's `projectedPPG` differs from the raw one for a player with n > 0. This
     proves the seam did something while the snapshot stayed put.
5. **QB-quality firewall.**
   - `extractCall` on both `computeQBQualityByTeam(` calls: each passes `qbQualityRows`, never
     `playerRowsWithKTC`/`playerRows`.
   - Behavioural: for a QB fixture row carrying `dynastyScoreBase` whose score differs from its
     level-adjusted `dynastyScore`, `computeQBQualityByTeam(qbQualityRows)` equals
     `computeQBQualityByTeam` over rows whose `dynastyScore` is the base score.
6. **Dynasty unchanged at n = 0.** `computeDynastyScore` returns the same result for `inSeasonLevel`
   `null`, an empty Map, and a Map whose value equals the player's S-1 PPG exactly.

### 5.1 Rewrite `src/__tests__/inSeasonEvidenceViewOnly.test.js`
Its own comment asks for a rewrite, not a deletion.
- `inSeasonEvidence.js`, now opportunity-only, stays Market-only: the importer list is exactly
  `['src/components/market/Market.jsx']`.
- It imports exactly `['./blendWeights', './inSeasonConstants']`. Update the self-check expectations.
- `App.jsx`, `projectionSnapshot.js` and every PIPELINE module never import it.
- **`inSeasonScoring.js` importers are exactly `src/App.jsx`, `src/api/frozenPrior.js`, and test
  files.** `Market.jsx` must not import it; it receives records as props.
- **Extend 2b-1's §7.6 seam block, don't replace it.** The `scoringPosteriors` allow-list in App.jsx
  grows from {its memo, the snapshot effect} to {its memo, the snapshot effect,
  `applyInSeasonProjection(`'s args, the `<Market` element's props}. Any other use is a failure.
  `inSeasonScoring.js` still imports only `./inSeasonConstants`.

## 6. `src/utils/inSeasonEvidence.js` → opportunity-only (the tab's display half)

- **Remove:**
  - the points posterior (`rosPpg`, `rosWeight`, `dynPpg`, `dynWeight`);
  - `K_ROS_POINTS`, `K_ROS_POINTS_WEAK`, `K_ROS_POINTS_STRONG`, `K_ROS_OPP`, `K_DYN_POINTS`, `K_DYN_OPP`;
  - `dynOpp`, `dynOppWeight`;
  - the band, `medians` and `MEDIAN_POSITIONS`;
  - `extrapolated`, and `MIN_PRIOR_GAMES` once `extrapolated` and the medians (its only readers,
    `:23,70,151`) are gone — the CR-25 edit in §10.3 drops it from the App side in the same commit;
  - the k tag at `inSeasonEvidence.js:16`, and the render-site k tag at `Market.jsx:983` (§7);
  - the tags at `:25` (baseline thresholds) and `:31` (opportunity definition). Both are now mirrored
    and measured under CR-25 (the verdict's Q5 and reconciliation). Replace each with a plain comment
    citing the verdict, not a PROVISIONAL tag.
  `buildPriorSeasonContext` shrinks to `{ seasonBasis }`, or is removed if nothing reads it. Grep first.
- **Import** `K_ROS_OPP` from `./inSeasonConstants`.
- **Baseline B** (data `scripts/inseason-run.mjs` ~L386 is the definition mirrored):
  1. For `y = dataSeason, dataSeason−1, dataSeason−2`, take the first season where
     `careerStats[y]?.[id]?.gamesPlayed ≥ MIN_BASELINE_GAMES`.
  2. Then `oppPrior = opportunitiesPerGame(row, pos)`. `hasBaseline` holds only if `oppPrior ≥
     MIN_BASELINE_OPP`, otherwise there is no baseline.
  3. **Stop at that first season either way** (the data side `break`s).
  4. Result fields: `oppPrior`, `baselineSeason` (the `y` found, or `null`), `hasBaseline`.
- `rosOpp = blend(oppPrior, oppNow, n, K_ROS_OPP[pos])`.
- `oppShift = n > 0 ? rosOpp − oppPrior : null` (unchanged rule).
- **`oppShiftRel = oppShift / oppPrior`** (data `q6rel`); `oppShiftSort = oppShiftRel`.
- `newRole` keeps its definition (eligible, no baseline, `oppNow ≥ MIN_BASELINE_OPP`) and still renders
  its chip. **Its sort value is `null` (nulls last):** the relative measure is undefined without a
  baseline, and the verdict measured no alternative.
- Eligibility (basis guard) is unchanged.
- The result drops `proj`, `band` and `extrapolated`. It keeps `games`, `ppg`, `oppNow`, `oppPrior`,
  `baselineSeason`, `hasBaseline`, `newRole`, `rosOpp`, `rosOppWeight`, `oppShift`, `oppShiftRel`,
  `oppShiftSort`.
- **`usableLiveSeason` stays** in this file. Market may not import the seam (§5.1), so 2b-1's comment in
  `inSeasonScoring.js` saying 2b-2 retires this copy is corrected in this slice to "both copies stay;
  kept identical by `inSeasonScoring.test.js`". Add that equality test: the same inputs give the same
  outputs from both functions.
- The header comment is rewritten: view-only opportunity display, Market-only. The points half moved
  to the seam. The definitions are CR-25 triggers; Q5 arm B and Q6 relative were measured by the
  verdict, so adopting them needs no re-fit.

`inSeasonEvidence.test.js`: rewrite the points and band cases. Keep and extend the opportunity cases:
- lookback finds 2023 when 2025 gp 2 and 2024 absent;
- stops at 2025 gp 5 with opp 1.2 (no baseline, even though 2024 had a big role);
- `oppShiftRel` for `(prior 10, now 15, n 3, k 3)` = 0.25;
- `newRole` sort `null`.
Assert the behaviour, not just green.

## 7. The In-season tab → "what changed" (`src/components/market/Market.jsx`)

Rows: `inSeasonRows` attaches `_is` = the opportunity result (§6) and `_post` =
`scoringPosteriors?.get(id) ?? null`. Keep the named branch before the volume fall-through. Its accessor
map is explicit, never `_post?.[key]`:
- `n` → `_post?.n`
- `prior` → `_post?.ros.prior`
- `ros` → `_post?.ros.value`
- `delta` → `_post ? _post.ros.value − _post.ros.prior : null`
- `ppg`, `oppPrior`, `oppNow`, `oppShiftSort` → `_is?.[key]`
- `full_name` and `_trend` as today.

**Sort registry:** `DEFAULT_SORT.inseason` (`Market.jsx:65`) → `{ column: 'delta', direction: 'asc' }`,
so the biggest drops come first — the "what changed" question. `INSEASON_SORTABLE_KEYS` (`:80`) and
`SORT_LABELS.inseason` (`:114`) are replaced with the ten column keys above. A stored `market-sort`
naming a retired key (`games`, `proj`, `rosPpg`, `rosWeight`) falls back through the existing stale-key
path to the new default. Existing test (6) (`Market.test.jsx:1447-1452`) is changed to assert
`{ column: 'delta' }`, with a comment giving the reason.
Columns (`colSpan = 10`):

| header | key | cell |
|---|---|---|
| Player | `full_name` | as today |
| Trend | `_trend` | as today |
| `G {S}` | `n` | `_post.n` |
| `PPG {S}` | `ppg` | `_is.ppg` |
| Prior | `prior` | `_post.ros.prior`. When `!_post.frozen` add a `live` chip whose title names the reason (map below) |
| ROS | `ros` | `_post.ros.value · round(weight·100)%`, plus a `rookie`/`short` chip for ROOKIE0/ROOKIE1P/SHORT (title: "Own measured update weight for this group") |
| Δ | `delta` | `ros.value − ros.prior`, signed, up/down colour, 1 dp |
| `Opp/G base` | `oppPrior` | `_is.oppPrior`; header tooltip "Most recent of the last three seasons with 4+ games" (the cell `title` gives `baselineSeason`) |
| `Opp/G {S}` | `oppNow` | as today |
| Opp shift | `oppShiftSort` | `+x%` from `oppShiftRel` (0 dp), else the `new role` chip, else `—` |

Reason → chip title:
- `model-changed`: "Not frozen: the projection model changed after the preseason capture, so this is today's projection"
- `absent`: "Not in the preseason capture"
- `league`: "Preseason capture was for a different league"
- `basis` / `season`: "Preseason capture is not comparable"
- `no-snapshot` / `no-kickoff` / `unavailable` / `not-needed`: "No preseason capture available"

The note line under the title, replacing the Phase 1 note, is built from these sentences:
1. `{S} season to date — up to {maxGames} games played.` When `inSeason` is null, the Phase 1
   no-data sentence instead.
2. Priors:
   - `frozenPriorStatus.status === 'ok'` → `Priors frozen from the {dateKey} preseason capture.`
   - `reason === 'model-changed'` → `Priors are not frozen this season: the projection model changed after the preseason capture.`
   - otherwise → `Priors are today's projection (no usable preseason capture).`
3. Always, verbatim substance: **`Early-season drift below the prior mostly reflects the projection's
   known optimism — it runs roughly 15–20% high — not player performance.`**
4. The existing basis sentence (league-scored vs half-PPR), keyed on `projectionBasis === 'league'`
   (derive it in Market as today, from the rows' basis).

**Tooltips on the new headers.**
- ROS: "The preseason projection updated with this season's games; the % is this season's share of the
  estimate. Weights were measured by backtest (2014–2025)."
- Δ: "Rest-of-season estimate minus the prior."

Delete the Phase 1 "Current proj" tooltip ("Not frozen…"), the `ext` chip and its title constant, and the
render-site `PROVISIONAL(heuristic)` tag at `:983`. Every value is now measured.

**Market.test.jsx (In-season describe) — update, don't bend:**
- headers exactly as above;
- the optimism sentence is present;
- a frozen record renders its prior with no chip;
- a `model-changed` record renders the `live` chip with that title;
- the Δ sign colour;
- the relative sort puts `+50%` above `+20%` above `−10%`, with `new role` last;
- `scoringPosteriors` null → every posterior cell reads `—`, and the chip still toggles;
- the stored-set restore case still passes.

## 8. Other user-visible change — the player pop-up's NEXT SEASON stat
`PlayerDetailModal.jsx` (`key: 'next'` stat, ~`:274`). When `projection?.inSeason` exists (the scored
map carries it):
- label `'REST OF SEASON'`;
- value unchanged (it is now `ros.value`);
- note ``` `PPG · preseason ${inSeason.ros.prior.toFixed(1)} → after ${inSeason.n} G` ```;
- the chart bar label `'{yy} ROS'`.

The caption at `:368` ("… next season {projectedPPG} …") reads `rest of season` instead of
`next season` under the same condition. Otherwise the component is exactly as today. The delta vs last season is unchanged. Add or adjust one
test.

## 9. Docs
- `docs/nav/utils.md`: the `inSeasonScoring.js` row gains the two exports and "the scoring seam". Rewrite
  the `inSeasonEvidence.js` row (opportunity-only, baseline B, relative shift, imports).
  `dynastyScore.js` row: the `inSeasonLevel` parameter.
- `docs/nav/components.md`: the Market In-season set row and the PlayerDetailModal NEXT/ROS stat.
- `docs/architecture.md` → *playerRows pipeline*:
  - `inSeasonLevel` before `playerRows`;
  - `scoredSeasonProjections` after `scoringPosteriors`;
  - display consumers read the scored map; the snapshot reads the raw one.
- `docs/dynasty-scoring.md`: a short "In-season level" subsection (§3's two reads; standard only; the
  prospect score and SHORT are unchanged, and why).
- `docs/signal-registry.md`:
  - Fantasy-scoring-core row: the in-progress season is now **active** (`gamesPlayed`/`fantasyPoints`)
    → projection display (ROS posterior) + dynasty level (standard), through `inSeasonScoring.js`
    only. It is never an input to `computeNextSeasonProjection`.
  - Receiving/rushing volume rows: baseline B and the relative shift, view-only.
  - The 2b-1 §3C row: "feeds the projection display and dynasty level since 2b-2".
- `PROVISIONAL(` inventory in the hand-back. This slice **removes** four tags: `inSeasonEvidence.js:16,25,31` and `Market.jsx:983`. It adds none.

## 10. Cross-repo impact

**Route:** as 2b-1. Session 2 applies the edits in one registry commit; a data-repo session syncs it
the same day; the daily mirror run is red in between. Session 1 re-verifies anchors against the
post-2b-1 registry before Session 2.

### 10.1 CR-21 — Invariant amended (the scoring switch)
Replace `and must never let it reach the scoring pipeline.` with:
```
and must never let it reach the scoring pipeline except through `src/utils/inSeasonScoring.js` — since in-season-evidence-2b-2 the live season's `gamesPlayed`/`fantasyPoints` reach the displayed season projection (`applyInSeasonProjection`, the rest-of-season posterior) and the dynasty score's latest level for the standard population (`buildInSeasonLevel` → `computeDynastyScore`'s `inSeasonLevel`); `computeNextSeasonProjection` and the snapshot's `projection` never see it.
```
App side: also replace the description `a view-only prior↔live-season blend; reads `gamesPlayed`, `fantasyPoints`, `scoringBasis` and `stats.{pass_att,rush_att,rec_tgt}` off player rows` (registry line 239) with `a view-only opportunity blend (the points posterior moved to the seam in in-season-evidence-2b-2); reads `gamesPlayed`, `scoringBasis` and `stats.{pass_att,rush_att,rec_tgt}` off player rows` — Session 1 re-verifies this exact anchor against the post-2b-1 registry. App side / Triggers: append `` `buildInSeasonLevel`, `applyInSeasonProjection` in `src/utils/inSeasonScoring.js`; `computeDynastyScore`'s `inSeasonLevel` parameter in `src/utils/dynastyScore.js` `` to both.
**Mirror emitted (CR-21, verbatim first sentence):** *"If the weekly job stops running, starts writing
partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no
way to tell on `/teams` or `/portfolio`** — it will render a half-season's rates as though they were a
season's, with no error and no test failure."* Add for the data side: a mis-marked or stale in-progress
file now also moves displayed projections and veterans' dynasty scores, silently. `gamesPlayed`
counting inactive weeks would over-weight every posterior.

### 10.2 CR-01 — App side note
After the 2b-1 App-side text, append:
```
; display consumers receive `applyInSeasonProjection`'s scored copy (`projectedPPG` = the rest-of-season posterior; `projectedTotalPts` = points scored so far + that rate × remaining projected games; `inSeason` attached) while `writeProjectionSnapshot` receives the raw `seasonProjections`, so the snapshot `projection` stays the unmodified prior
```
Also refresh CR-01's stale Triggers line anchors (plan review, `[registry-stale]`):
- `src/components/market/Market.jsx:439-446,537` → `:484,552`;
- `src/components/dp/PlayerDetailModal.jsx:119-120,147-152,275,278,299,580` → `:120-121,148-153,276,279,300,368,581`;
- `src/components/dp/PlayerDetailTabs.jsx:111` → `:112`;
- `src/App.jsx:625-650` (2b-1's refresh) stays and is re-grepped;
- add `portfolio/Portfolio.jsx:274` (the `buildLeagueLineups` call).

Session 2 re-greps these after its own edits and records the post-change lines instead.
**Mirror emitted:** no envelope change and no bump. The snapshot's `projection` semantics are
unchanged, so data graders need nothing.

### 10.3 CR-25 — App side definitions update
In the App side, replace `the baseline and new-role rules and the sort shift (its own view-only `K_*` are the study values and retire when in-season-evidence-2b-2 moves the tab onto the pinned constants)` with:
```
the lookback baseline (most recent of the last three seasons with ≥ 4 games — verdict Q5 arm B), the new-role rule and the relative sort shift (`oppShiftRel`, verdict Q6), blended with the pinned `K_ROS_OPP`
```
In the same field, delete `` `MIN_PRIOR_GAMES`, `` (removed by §6). After `` `posteriorOf` (n = live `gamesPlayed`; n = 0 returns the prior) `` (App side; unique),
append `` , `historyNextOf`/`buildInSeasonLevel` (the dynasty-side evidence `K_DYN_POINTS_HISTORY` was fitted on: prior = raw S-1 PPG, S-1 gp ≥ 8, n = live `gamesPlayed`) ``. In **Triggers**, after `` `classifyInSeasonPopulation` and `posteriorOf` `` (unique) insert `` , `historyNextOf`, `buildInSeasonLevel` ``.
**Mirror emitted (CR-25, verbatim first sentence):** *"An app-side change to any mirrored definition
stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen
`PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file —
never hand-edit a `K_*`."* This change adopts definitions the verdict already measured (arm B, relative,
no band). No re-fit is owed. The data side's `IN_SEASON_DEFAULTS.lookbackSeasons` (3) and
`minBaselineGames`/`minBaselineOpp` must keep matching.

### 10.4 CR-15 — no text edit; Mirror emitted (`dynastyScore.js` is a whole-file trigger)
Only `computeDynastyScore`/`recencyWeightedPPG` change. `computeEmpiricalAgeCurves`, the mirrored part,
is unchanged. **Mirror (verbatim):** *"Re-mirror the changed constant/gate/branch and **re-fit before
any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces
and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting."* Nothing to
re-mirror: no mirrored constant, gate or branch moved.

### 10.5 CR-18 — no text edit; Mirror emitted (signal-registry rows reclassified, §9)
**Mirror (verbatim tail):** *"**Nothing fails in either repo when this drifts** — the registry simply
becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion
decisions, a stale row misroutes those decisions months later."*

### 10.6 CR-02 — fires (`buildPriorSeasonContext` is a named App-side symbol)
§6 removes the medians half of `buildPriorSeasonContext`, and the whole function if nothing else reads
it. Edit CR-02's App side text `` `buildPriorSeasonContext` in `src/utils/inSeasonEvidence.js` (a
cross-row scan of `careerStats[dataSeason]` for per-position opportunity medians and the season's single
`scoringBasis` — …) `` to whatever survives. That is the `seasonBasis` half only, or the whole
parenthesis and its Triggers mention are deleted. Session 2 writes the exact post-change text in the
registry commit, from what §6 actually left. `buildInSeasonLevel` reads per-id rows, not cross-row.
**Mirror emitted (CR-02, verbatim head):** *"A version bump needs both repos. **Per-season `team` is
scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h
attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most
played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app
projections **with no app-side diff**."* Data side: nothing to change. The in-progress file's
`gamesPlayed`/`fantasyPoints` now move scores (CR-21).

### 10.7 Checked, not fired
- CR-26: untouched.
- CR-22: the snapshot effect's args are unchanged.
- CR-04, CR-09, CR-14, CR-16, CR-24: untouched.

## 10.8 Carried from 2b-1 verification (advisory, fold in)
- `src/api/dataStore.test.js`: `isValidProjectionSnapshot` null / `players: null` cases → `.toBe(false)`;
  `listManifestPaths` "fetch fails" case → `expect(fetchSpy).toHaveBeenCalledTimes(1)`.
- `src/utils/ktcHistory.js:5`: reword the stale "no manifest-enumeration export" comment as `ktc.js` was
  reworded in `f3fda2e`. Comment only.

## 11. Backlog, done-definition, commits
- **D-51 · Registry sync — in-season 2b-2 (CR-01/21/25 text).** Blocks the mirror run until synced.
  Record the SHA.
- **D-52 (non-blocking) · Rest-of-season grader.** Grade snapshot `inSeason.ros` against realised ROS
  PPG, and `inSeason.next` against S+1 PPG (CR-25's "later consumers" line). The first data is the 2b-1
  captures.

Commits: code/tests/docs, then the registry commit, then the SHA-record commit.
Run `npm test`, lint and build. **`factorsSchema`, `statKeysContract`, `projectionInputsGuard` and
`priorModelFrom` must stay green unmodified.**

**Smoke (user-visible):** use the launch config and Anton's league (CLAUDE.md recipe). Check:
1. Market → In-season: the columns, the optimism sentence, and the "not frozen … model changed" note
   (2026).
2. Two players with n > 0: `Prior` equals the Outlook set's pre-2b value, and `ROS` equals
   Outlook's `proj` now.
3. Open one pop-up: `REST OF SEASON` with the prior → after n G note.
4. Portfolio's ladders render without `NaN`.
5. The console `[snapshot]` line: the snapshot's `projection` for one player still equals the raw
   pipeline value. Read it from IndexedDB `projection-snapshots/<today>` if written.

Report what broke, not whether it is good. Hand back the SHAs, files, deviations, test assertions and
the PROVISIONAL inventory.

---

## Review record — plan gate round 1 (2026-09-26)

plan-reviewer raised 14 flags. Session 1 verified each against live source; all 14 are applied.
| # | flag | decision |
|---|---|---|
| 1 | BLOCKING — the level leaks into `computeNextSeasonProjection` via QB quality (`teamContext.js:59` reads `dynastyScore.score`) | **Applied** — §0 firewall, §4.2a `dynastyScoreBase` → `qbQualityRows` for both QB-quality maps, §5 guard. Verified: `computeQBQualityByTeam` prefers `row.dynastyScore?.score`. |
| 2 | HIGH — the dynasty QB modifier spreads the level to SHORT/rookie/pass-catchers | **Applied** by the same firewall. The live QB level reaches no other player's score. |
| 3 | TDZ ordering of `scoringPosteriors`/`scoredSeasonProjections` | Applied — pinned between `:621` and `:625` (re-checked §12). |
| 4 | Sort accessor vs record shape | Applied — explicit accessor map. |
| 5 | In-season sort registry and test (6) | Applied — default `delta` asc; test asserts the change. |
| 6 | CR-02 fires (`buildPriorSeasonContext`) | Applied — §10.6 with Mirror. |
| 7 | CR-25 anchor had a stray "there" | Applied — anchor copied from the companion. |
| 8 | `MIN_PRIOR_GAMES` orphaned; history definitions missing from CR-25 | Applied — removed from code and entry; `historyNextOf`/`buildInSeasonLevel` added. |
| 9 | One-qualifying-season branch of `recencyWeightedPPG` | Applied — §3 item 1. |
| 10 | `PlayerDetailModal.jsx:368` "next season" caption | Applied — §8. |
| 11 | PROVISIONAL inventory wrong | Applied — four tags removed, named. |
| 12 | `usableLiveSeason` copy cannot be retired | Applied — both stay, equality test, 2b-1 comment corrected here. |
| 13 | CR-21 App-side description stale after §6 | Applied — §10.1. |
| 14 | CR-01 stale line anchors | Applied — §10.2 refresh, re-grepped by Session 2. |

## 12. Anchor re-check (Session 1, 2026-09-27, against `f3fda2e`)
- **Registry:** in sync with data `93e469e` (the diff of the two sentinel spans is empty). Every §10 anchor
  was re-grepped, and each exists exactly once:
  - CR-21: `and must never let it reach the scoring pipeline.` and the `a view-only prior↔live-season
    blend; …` description;
  - CR-25: the `the baseline and new-role rules …` parenthesis, `` `MIN_PRIOR_GAMES`, ``, the
    `posteriorOf` App-side parenthesis, and the Triggers pair;
  - CR-01: the Market, PlayerDetailModal and PlayerDetailTabs anchors, and `src/App.jsx:625-650`;
  - CR-02: `buildPriorSeasonContext`.
- **App.jsx** (the 2b-1 insertions shifted it):
  - QB-quality memos `:519-521`, `:528-530`; QB modifier `:535-540`;
  - `computeNextSeasonProjection`'s `qbQualityByTeam` arg `:601`;
  - `scoringPosteriors` `:617-621`; `playerRowsWithProj` `:625`; `profileContextValue` `:656`;
  - JSX `seasonProjections=` at `:1299` (Portfolio) and `:1324` (Market);
  - `projectionBasis`/`liveSeasonUsable` at `:222-225`, already above `playerRows` (`:347`), so §4.1 needs
    no move.
- **Unchanged:** `dynastyScore.js` (`recencyWeightedPPG` `:619`, the one-qualifying return `:631`,
  `currentPPG` `:827`, ranking calls `:848,:854`, `computeBreakoutFlag` `:991`, prospect calls
  `:701,:956`); `Market.jsx` (`DEFAULT_SORT.inseason` `:65`, `INSEASON_SORTABLE_KEYS` `:79`,
  `SORT_LABELS.inseason` `:113`, render tag `:983`); `PlayerDetailModal.jsx` (`'proj'` bar `:151-152`,
  `'next'` stat `:274`, caption `:368`); `inSeasonEvidence.js` tags `:16,25,31`, `MIN_PRIOR_GAMES`
  readers `:23,70,151`; `teamContext.js:59`.
- **Change folded in (Anton, 2026-09-27):** `projectedTotalPts` = points so far + ROS rate × remaining
  projected games (§2.3).

