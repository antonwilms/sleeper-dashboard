# P6b-B — QB takeover wiring, Stage B: live checkpoint, ROS, dynasty discount, registry, data repo

Session 1, 2026-10-03. Read `qb-takeover-wiring-a.md` first — its §0 decisions, §1 summary, §2 definitions (the module,
factors keys, entry shape), §7 golden values, §10 out-of-scope and the review record apply here. Start only after Stage A
(commit 1) has been verified by Session 1. Parent-folder session; writes both repos.

## 3. Stage B — live checkpoint, ROS, dynasty discount (app commit 2)

### 3.1 Loader `src/api/qbWeekly.js` (new)

```js
export function qbWeeklyLoadPlan({ dataSeason, nflState })  // live season only: copy defenceLoadPlan's live branch
  // (regular → throughWeek = min(week − 1, regWeeks), ≥ 1 else null; post → regWeeks; anything else → null); regWeeks = season ≥ 2021 ? 18 : 17
export function filterQbInputRows(rows, playerMap)          // TEAM_* rows + playerMap position 'QB' rows
export async function loadQbWeeklyRows({ season, throughWeek, currentNflWeek, playerMap })
  // = loadDefenceWeeklyRows' shape: getWeeklyStatRows per week (shares the stat-rows/<s>/<w> cache),
  // Promise.allSettled, { year, weeks: [{ week, rows }], failedWeeks, complete: weeks.length > 0 }. Never rejects.
```
Copied, not imported: `defenceWeekly.js`/`opponentStrength.js` are view-only and guarded.

### 3.2 Seam: `buildQbLiveStates` in `src/utils/inSeasonScoring.js`

`inSeasonScoring.js` may now import `./inSeasonConstants`, `./qbTakeover`, `./qbTakeoverConstants` and
`./fantasyPoints` (update its header and the import-list guard). Signature:
```js
export function primaryPassersByTeamWeek(weeks)
  // → Map<`${team}|${week}`, { pid, dropbacks, attempts }>; non-TEAM_ rows with stats; dropbacks = pass_att + pass_sack
  // (absent → 0), must be > 0; ties: attempts, then smaller pid (data betterPasser). team = row.team (Sleeper domain).
export function buildQbLiveStates({ qbWeekly, playerMap, careerStats, dataSeason, scoringSettings, preseason })
  // → Map<playerId, QbLiveState>; empty Map unless qbWeekly.complete && failedWeeks.length === 0 (a missing week
  // breaks the team-game index and streaks — omit, do not approximate).
```
Rules (data `buildRows`/`definitions`, transposed onto Sleeper weekly rows):
1. Team `T` played week `w` iff a `TEAM_<T>` row exists that week with non-null `opponent`. `G_T` = T's played weeks, ascending; `g = |G_T|`.
2. `P_T[i]` = primary of T's i-th game; `P1` = `P_T[0]?.pid ?? null`; incumbent `inc` = primary of T's **last** game.
   Last game has no primary → no state for T's QBs (data excludes `noPrevPrimary`).
3. Per QB `x` (playerMap position QB, `T = info.team`, not `null`/`'FA'`, `g ≥ 1`, `remaining = 17 − g > 0`):
   - `x === inc && x === P1` → `kind: 'original'` (no model: P6a fits stickiness on backup-origin starters only).
   - `x === inc`, `x ≠ P1` → `kind: 'starter'`; streak `s` = consecutive games ending at the last where `x` was primary;
     chain `start = { role: 'S', ps: 1, c: 0, s, g: g + 1, hazardCodes: { dp: 0 /*d2*/, og: 0, rk, iq: 3 /*unknown*/ }, stickCodes: {} }`
     — post-demotion re-entry codes are a stated simplification (verdict chain text: "re-enters B at the checkpoint dp").
   - otherwise `kind: 'backup'`; `hazardCodes = { dp: dpCode(info.depth_chart_order ?? null), og: x === P1 ? 1 : 0, rk, iq }`,
     `start = { role: 'B', ps, c: 0, g: g + 1, hazardCodes, stickCodes: {} }`, `ps` = 1 iff x was any team's primary in an earlier week.
     `c` (benched count) is 0: `bn` is not a pinned feature; the builder asserts at module load that
     `QB_HAZARD.features ⊆ ['dp','og','rk','iq','ps']` and throws otherwise (a re-pin adopting bn/wk/wp/dg must build it — CR-27).
   - `rk = info.years_exp === 0 ? 1 : 0`.
   - `iq` (backups): `incPPG(priorPPG(careerStats[dataSeason][inc]), obs)`, `obs` = inc's
     `calculateFantasyPoints(row.stats, scoringSettings)` for every loaded week where his row has `stats.gp ≥ 1`;
     `median` over every team's `inc` incPPG (nulls omitted); `iqCode(incPPG, median)`.
   - `r = expectedStarts({ start, remaining })`.
   - `starts` = weeks where x was the primary of `row.team` that week (any team); `startPoints` = Σ his scored points those weeks;
     `seasonPoints` = Σ his scored points over every loaded week with `stats.gp ≥ 1` (plan-gate flag 5: the start branch's points-so-far must
     come from the same weeks the chain counts, not from season-totals, which can hold a partly played later week).
4. **D1 (sat longer)**: only `rk = 1` and `preseason[x]?.role === 'backup'`:
   `expectedSoFar = Σ preseason[x].perGame[0..g−1]`; `residual = starts − expectedSoFar`; `satLonger = residual < −QB_SAT_LONGER_BAND`.
   Otherwise both `null`. (The preseason chart is today's Sleeper order — a proxy for the week-1 chart; stated in docs.)

`QbLiveState = { kind, team, gamesPlayed: g, remaining, pNext, expected, fraction, starts, startPoints, seasonPoints, residual, satLonger }`
(`original`: `pNext/expected/fraction` null; `residual/satLonger` as rule 4).

### 3.3 Seam consumers

**`buildScoringPosteriors({ …, qbLiveStates = null })`** — for `pos === 'QB'` with state kind `backup|starter`:
- `starterPrior` = `frozenPrior.starterPPG?.[id]` when the record is frozen and that is finite; else
  `seasonProjections[id].factors.qbStarterPPG` when finite; else `projPrior`. `startPriorSource` ∈ `'frozen' | 'live' | 'projection'`.
- `obs = starts > 0 ? startPoints / starts : null`; `p = posteriorOf(starterPrior, obs, starts, kRos)` (same `kRos` cell — D3).
- `ros = { prior: starterPrior * fraction, k: kRos, weight: r4(p.weight), value: r2(p.value * fraction) }`;
  `start = { kind, fraction: r4, expected: r4, remaining, pNext: r4, starts, seasonPoints: r2, starterPrior, starterValue: r2(p.value), priorSource: startPriorSource }`.
- Record gains `start` (absent on every other record). `n` stays live `gamesPlayed`.
- **`next`, every QB**: where `next` uses the projection prior, the prior is the starter prior picked by the **same rule
  as `starterPrior` above** — `frozenPrior.starterPPG[id]` when the record is frozen and that is finite, else
  `factors.qbStarterPPG` when finite, else `projPrior` (plan-gate flag 8: never a live starter prior on a frozen record).
  Equals `projPrior` for every unshared row — "dynasty keeps the starter outlook".
- `original` → today's code path, unchanged.
- **No live state on a preseason-`chain` row (plan-gate flag 4)** — `qbLiveStates` null/empty, or no state for this id
  (failed week, last game without a primary, team not yet played, `remaining` 0): if
  `seasonProjections[id].factors.qbTakeoverBasis === 'chain'`, **emit no record for this id** (`continue`). Display then
  shows the raw projection (preseason share × starter PPG, full-season total) and the snapshot's `inSeason` is absent —
  omit rather than blend a per-team-game prior with relief-contaminated per-game-played evidence. Any other QB row with
  no state → today's path.

**`applyInSeasonProjection`**: when `record.start` → `projectedTotalPts = r1(record.start.seasonPoints + record.start.starterValue * record.start.expected)`
(`start` therefore also carries `seasonPoints: r2(state.seasonPoints)`; season-totals `fantasyPoints` is not read on this branch — flag 5);
`projectedPPG = r1(record.ros.value)` as today.

**`buildProspectLevel({ …, qbLiveStates = null })`**: a QB with `kind === 'projection'` entry and
`qbLiveStates.get(id)?.satLonger === true` → `prior *= QB_SAT_LONGER_DISCOUNT`; entry gains
`satLongerDiscount: 0.9` (else absent). `computeDynastyScore` reads only the existing fields — confirm.

**Frozen prior (CR-26)**: `trimFrozenSnapshot` also returns `starterPPG: { [id]: projection.factors.qbStarterPPG }`
(finite values only); `readAndGate` returns `starterPPG: trim.starterPPG ?? {}` (pre-change cache entries lack it).

### 3.5 Labels on `start` records (plan-gate flag 7)

On a `start` record `ros.prior`/`ros.value` are per remaining team game at the live share and the evidence count is
`start.starts`, not `n`. Two surfaces label them as preseason / games played:
- `src/components/dp/PlayerDetailModal.jsx` `next` tile note: when `projection.inSeason.start` →
  ``PPG · starter ${start.starterValue.toFixed(1)} × ${Math.round(start.fraction*100)}% of ${start.remaining} games left · ${start.starts} starts``;
  otherwise today's note.
- `src/components/market/Market.jsx` In-season set: the GP cell renders `post.start ? post.start.starts : post.n` with a
  `chip('starts', …)` on start records; `inSeasonSortValue('n')` returns `post?.start?.starts ?? post?.n ?? null`; the ROS cell adds
  ``chip(`QB ${Math.round(post.start.fraction*100)}%`, 'Not his team\'s week-1 starter: starter rate × his expected share of the remaining games. Prior and ROS are both at that share.')``.
  Prior/delta cells unchanged (both sides are at the same share, so the delta is the evidence shift).
- Portfolio (`playerFactsById`) and `/week` (`buildOwnProjections`) read `projectedPPG`/`ros` deltas — correct as is; no change.
- Tests: one render test per surface for a `start` record.

### 3.6 App wiring (Stage B)

- State, with the other `useState`s (~:200–205): `const [qbWeekly, setQbWeekly] = useState(null)` and
  `const [qbWeeklySettled, setQbWeeklySettled] = useState(false)`. Effect beside the defence effect (~:1140), deps
  `[careerStats, nflState, leagueData]`, `cancelled` flag: plan `null` → `setQbWeeklySettled(true)` and stop; else
  `loadQbWeeklyRows` → `setQbWeekly(r)`, and `setQbWeeklySettled(true)` in both `then` and `catch`.
- **Placement (plan-gate flag 1 — TDZ):** `qbLiveStates` is read by the `prospectLevel` memo (~:565), which sits far above
  `scoringPosteriors` (~:698). Declare `qbLiveStates` **immediately after `qbPreseasonShares`** (which sits beside `depthMap`,
  ~:243, after `liveSeasonUsable` ~:228):
  `const qbLiveStates = useMemo(() => liveSeasonUsable && qbWeekly && careerStats && leagueData?.playerMap && qbPreseasonShares ? buildQbLiveStates({ qbWeekly, playerMap: leagueData.playerMap, careerStats, dataSeason: deriveDataSeason(careerStats), scoringSettings: leagueData.scoringSettings, preseason: qbPreseasonShares }) : null, [liveSeasonUsable, qbWeekly, careerStats, leagueData, qbPreseasonShares])`.
- Pass `qbLiveStates` to the `buildScoringPosteriors` and `buildProspectLevel` calls (deps too). Nothing else.
- **Snapshot gate (plan-gate flag 3):** the write effect's
  `inSeasonSettled: liveSeasonSettled && (!liveSeasonUsable || frozenPrior != null)` becomes
  `liveSeasonSettled && (!liveSeasonUsable || (frozenPrior != null && qbWeeklySettled))` (+ `qbWeeklySettled` in its deps), so
  whether a captured record carries `start` never depends on a load race. A failed load still settles (records then
  follow the flag-4 fallback, deterministically).

## 4. Guards and tests (Stage B)

- `inSeasonEvidenceViewOnly.test.js`: seam import list → `['./inSeasonConstants', './qbTakeover', './qbTakeoverConstants', './fantasyPoints']`
  (order as written in the file); the `qbTakeover` importers test (added in Stage A) becomes exactly `src/App.jsx` and `src/utils/inSeasonScoring.js`.
- `currentSeasonTotalsIsolation.test.js` (plan-gate flag 9): add `qbLiveStates|qbWeekly` to the `LIVE` regex, then update the
  allowed lists — `buildProspectLevel` → `['currentSeasonTotals', 'qbLiveStates']`, `buildScoringPosteriors` →
  `['currentSeasonTotals', 'frozenPrior', 'qbLiveStates']`, new `buildQbLiveStates` → `['qbWeekly']`; every other existing
  assertion (computeDynastyScore calls, `buildInSeasonLevel`, `buildRookieDynastyPriors` → `[]`, `computeNextSeasonProjection` → `[]`)
  keeps its list and now also covers the new identifiers.
- `inSeasonScoring.test.js`: `primaryPassersByTeamWeek` tie rules; `buildQbLiveStates` — original / starter (streak) / backup
  (og 1 when week-1 starter benched), bye week skipped in the index, a failed week → empty Map, iq median, D1 residual both sides
  of −1; `buildScoringPosteriors` QB branch (fraction applied to prior and value, starts-only evidence, frozen `starterPPG` used,
  `next` prior = frozen `starterPPG` on a frozen record, live `qbStarterPPG` otherwise; a `chain` row with no state emits no
  record); `applyInSeasonProjection` total = `start.seasonPoints + starterValue × expected` (season-totals `fantasyPoints` deliberately
  different in the fixture, to prove it is not read); `buildProspectLevel` discount only for QB + `satLonger === true`.
- App snapshot gate: `inSeasonSettled` includes `qbWeeklySettled` (extend the existing gate test if one exists, else a
  `currentSeasonTotalsIsolation`-style source assertion on the effect's argument).
- `frozenPrior`/`trimFrozenSnapshot` tests: `starterPPG` kept, missing in cache → `{}`.
- `qbWeekly.test.js`: plan (pre/regular wk 1/regular wk 5/post), filter.
- §3.5: one render test each for the pop-up note and Market's In-season cells on a `start` record.

## 5. Docs

**Commit 2 (Stage B code + its docs):** `docs/nav/utils.md` (the seam's new exports), `docs/navigation.md` (`src/api/qbWeekly.js`),
`docs/architecture.md` (pipeline: `qbPreseasonShares` → `qbLiveStates` beside it; `qbWeekly` effect; the snapshot gate's
`qbWeeklySettled`), `docs/signal-registry.md` row for the live start chain (seam-only: ROS for non-week-1-starter QBs + the
rookie-QB prospect discount; input Sleeper weekly stat rows, ephemeral, not captured beyond `inSeason.start`), `docs/ui.md`
sentence for the two §3.5 labels, CLAUDE.md `src/api/` row gains `qbWeekly.js` (within the ceiling).
**Commit 3 (registry batch):** §8 registry texts (app copy), P6a's three signal-registry *Current use* appends verbatim from data
`qb-takeover-research-registry.md`, CLAUDE.md `all 26` → `all 27`, and `.claude/tasks/data-repo-backlog.md`: mark D-57 resolved
(this change's byte copy), strike the two CR-01 items D-58 queued that §8 supersedes, add D-59 and D-60 (§6.3).

## 6. Data repo (data commit 4 — committed with Stage B, pushed right after the app push)

### 6.1 Registry — both copies, one change

1. Edit the **app** copy `docs/cross-repo-registry.md` with the §8 texts.
2. Byte-copy the app's mirrored span into data `cross-repo-registry.md`. That copy also carries the pending **D-57**
   sync (16 lines). Gate: the span differs from data `8fd0b73` in exactly **D-57's 16 lines + this change's lines** — count
   this change's physical lines while editing and state both numbers in the hand-back.
3. Data `CLAUDE.md`: `all 26` → `all 27`. Run `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`,
   `node --test test/registry.test.mjs`, `npm test`.
4. D-58's queued anchor batch is **not** taken here.

### 6.2 `grading/anchor-policy.md` — boundary 5

- Intro (:4–8): "changed four times … three on the rookie path, one on the veteran path" → "five times … three on the rookie
  path, one on the veteran path, one on QB rows of both paths".
- `:57` "Four model changes on the two tracked axes" → "Five model changes on the three tracked axes".
- `## Boundaries by path` (:89–93): add "Boundary 5 is QB-only on both paths; it moves only QB rows whose `qbTakeoverBasis`
  is not `incumbent`/`stale`, and a pooled QB grade spanning it measures the mechanism change."
- Closing paragraph (:97–100): "Boundary 4 exists as of `7b5b055`, so the table above is complete, for the rookie mechanisms and
  the Step 4 up-side axis, as of D-18." → "… Boundary 5 exists as of the qb-takeover-wiring push, so the table above is
  complete, for the rookie mechanisms, the Step 4 up-side axis and the QB start-share axis, as of qb-takeover-wiring." 
- New section **QB rows — both paths** under *Row-level detection*: `factors.qbTakeoverBasis` present → captured under the
  qb-takeover model (every row carries it from boundary 5 on; `'none'` on non-QBs, so non-QB rows are unaffected by this axis).
  On a QB row: `'chain'` → `projectedPPG = qbStarterPPG × qbStartShare`, **expected points per team game, not per game
  played** — grade on total points or segment; `'not-evaluated'`/`'no-team'`/`'no-chart'` order ≥ 2 → 1.00 where legacy had
  0.88/0.68; `'incumbent'` and `'stale'` → unchanged from legacy. Absent on a QB row → legacy flat factor.
- Date table row 5: the Stage A commit SHA, but the **app push** UTC time (captures check out app `main`, and the push
  follows commits 2–3 — plan-gate flag 18), path "both (QB rows)", mechanism "qb-takeover start share". Expected-segments:
  a new small table for QB rows — "first capture whose `capturedAt` is after the app push" — stated as a rule, not a date,
  with a sentence that no such capture exists at writing; the first sync after it fills the confirmed row.
- `'chain'` rows' `projectedTotalPts` = `qbStarterPPG × qbStartShare × 17` (starter PPG × expected starts), so "grade on
  total points" is well-scaled for them — say so in the QB section.

### 6.3 New backlog items (app `data-repo-backlog.md`, next ids)

- **D-59 · Re-mirror the QB start share (CR-15) and re-fit the QB in-season k (CR-25).** New depth model in
  `lib/projectionFactors.mjs` (legacy flat kept for pre-boundary captures; `qb-takeover` the harness default; share applied
  after `computeCompBlend`/the rookie ceiling). Two feature sources, kept apart (plan-gate flag 16): **parity** against a
  post-boundary capture uses that capture's own Sleeper chart (`teamDepthCharts` / per-player `depthChartOrder`) — the
  app computed from it; **historical fits** (no capture exists) use the D5 week-1 chart as a stand-in and say so. Then run `node bin/backtest.mjs --inseason --write`; the app re-pins only if a QB k moves. Also: a starts-based QB ROS k
  (D3) as a reported arm. Blocking: no.
- **D-60 · Replicate Q5 on the app's sat-longer definition.** Q5 with today's-chart-as-proxy replaced by the real week-1 chart,
  rookie season only, and the S+1 persistence question (the discount stops when the player turns `yearsExp` 1). Blocking: no.

## 8. Cross-repo impact

Every text below is applied verbatim to the app registry and byte-copied (§6.1). "Append" = add to the end of that field.

**CR-01 · Projection snapshot envelope**
- App side, append: "; since qb-takeover-wiring, `computeNextSeasonProjection`'s `qbTakeover` input (`buildPreseasonQbShares` in `src/utils/qbTakeover.js`) and `buildScoringPosteriors`' `qbLiveStates` (`buildQbLiveStates`, same seam file) shape QB rows"
- Invariant, append: " **Since qb-takeover-wiring (still v3, no bump)** both paths' `factors` carry `qbStartShare`, `qbTakeoverBasis` and `qbStarterPPG` on every row (`'none'`/`null` for non-QBs). On a QB row with `qbTakeoverBasis: 'chain'`, `projectedPPG` = `qbStarterPPG` × `qbStartShare` — expected points per team game, not per game played — and no QB row carries the flat 0.88/0.68 depth multiplier. An `inSeason` record may carry `start` — `{ kind, fraction, expected, remaining, pNext, starts, seasonPoints, starterPrior, starterValue, priorSource }` — and on such a record `ros.prior`/`ros.value` are per remaining team game (starter rate × remaining start fraction). On a `chain` row `projectedTotalPts` = `qbStarterPPG` × `qbStartShare` × 17 (starter PPG × expected starts), not `projectedPPG × projectedGames`. A `chain` row with no live QB state carries no `inSeason`. Additive only."
- Triggers, app side append: "`buildPreseasonQbShares` in `src/utils/qbTakeover.js`, `buildQbLiveStates` in `src/utils/inSeasonScoring.js`; `buildOwnProjections` in `src/utils/weeklyOwnProjection.js` (reads `projectedPPG` and the presence of `inSeason`) and `playerFactsById` in `src/components/portfolio/Portfolio.jsx` (reads `inSeason.ros.weight/value/prior` and `projectedPPG`) — `[registry-stale]`, reported by qb-takeover-wiring's plan gate; the `inSeason.start` reads in `src/components/dp/PlayerDetailModal.jsx` (`next` tile note) and `src/components/market/Market.jsx` (In-season GP/ROS cells, `inSeasonSortValue`)"
- Note for Session 2: D-58 also queues a `Portfolio.jsx`/`buildOwnProjections` CR-01 addition; this text supersedes those two items — strike them from D-58 when editing the backlog.
- Mirror, append: " **qb-takeover-wiring:** additive keys, no version bump. A grader must not score a `qbTakeoverBasis: 'chain'` row's `projectedPPG` against realised PPG per game played — grade it on total points or segment it (`grading/anchor-policy.md` boundary 5); the same holds for an `inSeason.ros` that carries `start`."

**CR-15 · R3-FIT factor-multiplier mirror**
- App side, append: " **qb-takeover-wiring:** `src/utils/qbTakeover.js` (`buildPreseasonQbShares`, `expectedStarts`) and `seasonProjection.js`'s QB branch — Step 8 no longer applies 0.88/0.68 to any QB (order 1 keeps 1.05; a takeover `backup` or an unevaluated QB gets 1.00), and a QB `backup` row's finished PPG — after `computeCompBlend` on the vet path, after `applyRookieCeiling` on the rookie path — is multiplied by `qbStartShare`"
- Triggers: "any of the eleven listed `src/utils/` modules" → "any of the twelve listed `src/utils/` modules".
- Mirror, append: " **qb-takeover-wiring (a gate change captures carry):** add the QB start share to `lib/projectionFactors.mjs` as a new depth model — legacy flat kept for pre-boundary captures, `qb-takeover` the harness default — never an overwrite. It needs the g = 1 takeover features (depth order, rookie, the incumbent's S−1 PPG over the all-teams median) and the CR-27 chain, and it applies after the comp blend / rookie ceiling, not inside `rawPPG`. Until then the reconstruction applies 0.88/0.68 to post-boundary QB2/QB3 rows the app shares at ≈0.16/≈0.04. Boundary 5 in `grading/anchor-policy.md`; the QB in-season k are stale until re-fitted (CR-25, data backlog D-59). Parity against a post-boundary capture reads that capture's own Sleeper chart (`teamDepthCharts`/`depthChartOrder`); the D5 week-1 chart is only the stand-in for history with no capture."
- Invariant: replace "*including `rookieProjection`'s ordering* — calibration inside, then the ceiling on the finished level, then the games ladder, then total points —" with "*including `rookieProjection`'s ordering* — calibration inside, then the ceiling on the finished level, then (QB `chain` rows) the start share, then the games ladder, then total points (on a `chain` row `qbStarterPPG × qbStartShare × 17`, not PPG × games) —". Session 2 copies the live sentence exactly before replacing; if it differs, stop and report.
- Mirror: "is a trigger like the other ten app-side modules" → "is a trigger like the other eleven app-side modules".

**CR-18 · Signal registry rows** — app-side edit only (§5 rows). Mirror text for the data side: "No data action: no ingested field, stat key or source changed; `data-catalog.md` unaffected. The P6a *Current use* appends from data `qb-takeover-research-registry.md` are applied app-side in this change."

**CR-21 · In-progress season-totals reads**
- App side, append: "; since qb-takeover-wiring a QB's ROS start chain and starts evidence come from Sleeper's live weekly stat rows (`loadQbWeeklyRows` in `src/api/qbWeekly.js` → `buildQbLiveStates`), not from this file — on those records `applyInSeasonProjection` takes points so far from the same weekly rows (`start.seasonPoints`), not from this file's `fantasyPoints`; `buildScoringPosteriors` still gates on `usableLiveSeason`"
- Triggers, app side append: "`buildQbLiveStates` in `src/utils/inSeasonScoring.js`, the `qbWeekly` effect and `qbLiveStates` memo in `src/App.jsx`"
- Mirror, append: " **Since qb-takeover-wiring** a modelled QB's ROS evidence is his starts from Sleeper's weekly rows, so a stale or mis-marked file moves neither those QBs' ROS rate nor their points-so-far total."

**CR-25 · In-season evidence definitions and fitted k**
- App side, append: "; since qb-takeover-wiring `buildScoringPosteriors`' QB branch (starter prior `factors.qbStarterPPG`, evidence n = starts — weeks he was his team's primary passer — and obs = his league-scored points in those weeks, at the existing QB `K_ROS_POINTS*` cell; `next`'s projection prior = the starter prior — frozen `starterPPG` on a frozen record, else `qbStarterPPG`) and `buildProspectLevel`'s rookie-QB discount (`QB_SAT_LONGER_DISCOUNT` from `src/utils/qbTakeoverConstants.js`)"
- Triggers, app side append: "`QB_SAT_LONGER_DISCOUNT`/`QB_SAT_LONGER_BAND` in `src/utils/qbTakeoverConstants.js`"
- Mirror, append: " **qb-takeover-wiring:** (a) it moves QB backups' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) it changes a CR-15-mirrored factor (Step 8, QB), so the QB `K_*` are stale until `--inseason` re-runs on the re-mirrored reconstruction (D-59) — a bump is not a re-fit; (c) the QB ROS posterior for a non-original starter uses n = starts at a k fitted on n = games played, which coincide for the starters that dominate that fit; (d) a rookie QB whose starts trail the preseason chain by more than one game has his prospect prior × 0.90 — the data side's arm-B prior has no such discount, so the 2c rookie k transport only for undiscounted rows."
- Invariant, append (plan-gate flag 13): " **Carve-out (qb-takeover-wiring):** for a QB whose in-season record carries `start` (not his team's week-1 starter), the app's ROS evidence is n = starts and obs = his league-scored points in those starts, from Sleeper weekly rows — not the backtest's n = games played; the QB `K_ROS_POINTS*` are applied there unfitted to that definition until a starts-based QB arm is measured (D-59)."

**CR-26 · Snapshot read-back (frozen in-season prior)**
- App side, append: "; since qb-takeover-wiring `trimFrozenSnapshot` also keeps `players[id].projection.factors.qbStarterPPG` (finite only) as the frozen QB starter prior, returned by `loadFrozenPrior` as `starterPPG`"
- Invariant, append (plan-gate flag 15): " Since qb-takeover-wiring a QB row also carries `players[id].projection.factors.qbStarterPPG` (finite; equal to `projectedPPG` unless `qbTakeoverBasis` is `'chain'`) as the frozen QB starter prior, unmodified like `projectedPPG`."
- Mirror, append: " Since qb-takeover-wiring the trim also reads `projection.factors.qbStarterPPG`; moving or renaming it silently makes every QB's ROS starter prior the live one (`start.priorSource: 'live'`)."

**CR-27 · QB takeover constants** *(new — qb-takeover-research.md P6a, 2026-10-03; pinned by qb-takeover-wiring)* — insert after CR-26:
- **App side:** `src/utils/qbTakeoverConstants.js` (`QB_TAKEOVER_SOURCE`, `QB_LEVELS`, `QB_HAZARD`, `QB_STICK`, `QB_DEFS`, and the app-owned `QB_SAT_LONGER_DISCOUNT`/`QB_SAT_LONGER_BAND`) and its byte-identical provenance copy `src/__fixtures__/qb-takeover-constants-2026-10-03.json`, re-derived by `src/__tests__/qbTakeoverConstants.test.js`; `src/utils/qbTakeover.js` — the `expectedStarts` port (54 states), `pUpOf`/`pStayOf`, `dpCode`, `iqCode`, `priorPPG`, `incPPG`, and `buildPreseasonQbShares` (the g = 1 rule: incumbent = the team's Sleeper `depth_chart_order` 1 QB, smallest id on a tie; `dp` from Sleeper order, unlisted → d3; `rk` = `years_exp` 0; `iq` = the incumbent's S−1 PPG with gp ≥ 4 over the median of all teams' incumbents; 17 team games); `buildQbLiveStates`/`primaryPassersByTeamWeek` in `src/utils/inSeasonScoring.js` (primary passer = max `pass_att + pass_sack` over TEAM-filtered **QB rows only** (`filterQbInputRows`), ties attempts then smaller id, from Sleeper weekly rows; incumbent = last game's primary; `og` = the team's game-1 primary; `iq` = incPPG k = 3 over league-scored weekly points; `kind: 'original'` unmodelled) and `src/api/qbWeekly.js`
- **Data side:** `lib/qbTakeover.mjs` (`QB_TAKEOVER_DEFAULTS`, `LEVELS`, `primaryPassers`, `checkpointChart`, `buildRows` and `incPPG`/`priorPPG`, `iqCode`, `dgCode`, `patternTable`, `fitLogistic`, `forwardLadder`, `expectedStarts`, `CHAIN_TEXT`), `scripts/qb-takeover-run.mjs`, `bin/backtest.mjs --qb-takeover`, `backtests/<date>-qb-takeover-constants.json`, `test/qb-takeover.test.mjs`
- **Invariant:** the app's live feature definitions and bins equal the pinned constants file's `definitions` (the transpositions named under *App side* excepted and stated); every pinned coefficient equals that file's and re-derives from its `fixture` at its `lambda`; the app's chain reproduces `expectedStarts`'s state space and transitions exactly; the app builds every feature the pinned hazard and stickiness models use and refuses (throws) on a pin that adds one it does not build.
- **Direction:** both
- **Triggers:** `src/utils/qbTakeoverConstants.js`, `src/__fixtures__/qb-takeover-constants-*.json`, `src/utils/qbTakeover.js`, `buildQbLiveStates`/`primaryPassersByTeamWeek` in `src/utils/inSeasonScoring.js`, `src/api/qbWeekly.js`  ‖  `QB_TAKEOVER_DEFAULTS`, `LEVELS`, `primaryPassers`, `checkpointChart`, `buildRows`, `incPPG`, `priorPPG`, `iqCode`, `fitLogistic`, `forwardLadder`, `expectedStarts` in `lib/qbTakeover.mjs`; `scripts/qb-takeover-run.mjs`; `bin/backtest.mjs`; `test/qb-takeover.test.mjs`
- **Mirror:** A change to any feature definition or bin on either side re-runs `node bin/backtest.mjs --qb-takeover --write` and the app re-pins by byte copy with the data commit SHA — never by hand-editing a coefficient. A re-pin that adopts a feature the app does not build (`bn`, `wk`, `wp`, `dg`, `ps` beyond its current exact build) throws app-side by design: build it first. `incPPG`'s k = 3 is this entry's own constant, not CR-25's. **Transport:** the app's `dp` is Sleeper `depth_chart_order` while the fit used nflverse charts (only measurement: QB depth-1 68.8%, n = 32, a cross-season upper bound on disagreement); the app's primary passer comes from Sleeper weekly rows while the fit used nflverse gamelogs (`attempts + sacksSuffered`); g = 1 is extrapolated (5.1% predicted vs 2.2% raw game-1 rate); a returning original starter reuses the backup-origin `pStay` with `dq = unknown`; the app holds a backup-origin starter's post-demotion codes at d2/unknown; the app's primary passer considers playerMap-`QB` rows only (the fit's `primaryPassers` considers every passer); `rk` is `years_exp === 0` (the fit: `draftYear === S`); live `iq` is a ratio of league-scored points (the fit: half-PPR `weeklyPoints`) — basis cancels to first order in the ratio at every checkpoint, not only g = 1. `QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted. **Nothing fails in either repo when this drifts.**

**P6a's owed edits (land here):** apply data `.claude/tasks/qb-takeover-research-registry.md` §CR-09 (Data side, Triggers,
Mirror sentence), §CR-08 (Data side append + Triggers) and §CR-16 (Data side append) verbatim.

## 9. Done, commits, smoke (Stage B)

Commits 2, 3 (app) and 4 (data) per `qb-takeover-wiring-a.md` §9; no push until Session 1 has verified.

App: `npm test`, `npm run lint`, `npm run build`, statKeysContract (`pass_sack` is a new stat-key reference — it is present in
`src/__fixtures__/season-totals-2025.json`; confirm finite, else follow the contract test's rule). Data: `npm test`,
`REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`, `node --test test/registry.test.mjs`.

**Smoke** (`.claude/launch.json`, recipe in `docs/architecture.md`): Market QB list, ROS and In-season tabs — a rookie backup
(e.g. Fernando Mendoza if still QB2) and a veteran QB2 show a reduced ROS, the `QB n%` chip and starts in GP; a benched week-1
starter shows a chain share; true week-1 starters unchanged versus `main`; the pop-up `next` note reads the start form; My Team and
/week render without `NaN`/`—` regressions; console clean. Report what was seen. A Claude screenshot is not sign-off.

## Verification record — Stage B (app `5fbffed..56653fc` + data working tree, 2026-10-04)

Session 2b stopped before data commit 4: P6a's verbatim CR-08/CR-09 data-side text claims `homeScore`/`awayScore`/`seasonType`
against `scripts/qb-takeover-run.mjs`, where they do not resolve (they live in `lib/qbTakeover.mjs`), so data
`test/registry.test.mjs` reds. **Session 1: rewording approved** (2b's proposal — route the claims through
`lib/qbTakeover.mjs` `buildRows`/`primaryPassers`); it names where the symbols actually live. Declared deviations 1–8 accepted.

implementation-reviewer: 7 flags, all verified against source and accepted.

1. [fidelity] A preseason-`chain` QB who is live `original` falls to today's path: `posteriorOf(projPrior, …)` blends the
   ≈0.16-share prior with his real starter scoring. → item 1.
2. [invariant] `PROVISIONAL(heuristic)` missing at the two derivation sites of the sat-longer heuristic. → item 3.
3. [untested] The module-load feature-subset throw has no test. → item 4.
4. [fidelity] `docs/architecture.md` *State management* inventory lacks `qbWeekly`/`qbWeeklySettled`; the `frozenPrior` shape lacks `starterPPG`. → item 5.
5. [fidelity] CR-27 insertion: two blank lines before the CR-27 heading, none before the END sentinel (both copies). → item 6.
6. [fidelity] anchor-policy QB expected-segments has prose but no table. → item 7.
7. [backlog] D-60 names no found-by commit. → item 8.

**Session 1 decision on 2b's behaviour note (injured week-1 starter).** Daniels (WAS) — week-1 starter, injured, not last
game's primary — falls into the backup chain at `og = yes` and shows ROS 6.6 per team game (34%). The chain has no injury
input (verdict: "What this does NOT model: injury status"), so this reads as a verdict on the player that the model cannot
make. Rule (item 2): the team's week-1 starter who is not last game's primary **and** carries a non-empty Sleeper
`injury_status` is `kind: 'original'` — today's starter path, where availability is handled as for every other position.
A healthy benched week-1 starter stays in the chain. Anton may override.

## Fix pass 1 (Stage B)

App: one commit on top of `56653fc`. Data: then make commit 4. No push. PRIOR_MODEL_FROM untouched.

1. **`src/utils/inSeasonScoring.js` `buildScoringPosteriors`, the non-start branch** (flag 1): when `pos === 'QB'` and
   `seasonProjections[id].factors?.qbTakeoverBasis === 'chain'`, use `starterPrior` (the existing frozen/live rule) instead of
   `projPrior`: `ros = posteriorOf(isChainRow ? starterPrior : projPrior, obs, n, kRos)`. Every non-`chain` row keeps `projPrior`
   (starters' ROS byte-identical). Test: a preseason-`chain` QB whose live state is `original` gets a ROS built on `qbStarterPPG`
   (assert against a hand value), and an `incumbent`-basis original is unchanged.
2. **`buildQbLiveStates`** (injury rule): a QB `x` with `x === P1`, `x !== inc` and `typeof info.injury_status === 'string' &&
   info.injury_status !== ''` → `kind: 'original'` (no chain), not `backup`. Comment: "the chain has no injury input; an injured
   week-1 starter keeps the starter path (P6b fix pass 1)". Tests: injured week-1 starter → `original`; same player with
   `injury_status: null` → `backup` with `og = 1`. Docs: one sentence in `docs/projection.md` (Step 10 / live chain) and the
   `docs/signal-registry.md` live-chain row gains "Sleeper `injury_status` (ephemeral, current only) gates the week-1 starter".
3. **PROVISIONAL tags** (flag 2): add `// PROVISIONAL(heuristic): …` single lines, same wording family as the definition's tag,
   at `buildProspectLevel`'s `prior *= QB_SAT_LONGER_DISCOUNT` and at `buildQbLiveStates`' `satLonger = residual < -QB_SAT_LONGER_BAND`.
4. **Feature-subset throw test** (flag 3): in `inSeasonScoring.test.js`, `vi.resetModules()` + `vi.doMock('./qbTakeoverConstants', …)`
   returning the real module with `QB_HAZARD.features` extended by `'bn'`, then `await expect(import('./inSeasonScoring')).rejects.toThrow()`;
   restore with `vi.doUnmock` + `vi.resetModules()`. If module-mocking proves unreliable in this suite, fall back to a static
   source assertion on the guard loop and say so.
5. **`docs/architecture.md`** (flag 4): inventory rows for `qbWeekly` (loader result `{ year, weeks, failedWeeks, complete }` or null)
   and `qbWeeklySettled` (boolean, gates the snapshot write); the `frozenPrior` shape gains `starterPPG?`.
6. **Registry layout** (flag 5) — app `docs/cross-repo-registry.md`: exactly one blank line between CR-26's Mirror and the CR-27
   heading, and one blank line after CR-27's Mirror before `<!-- CR-REGISTRY-END -->`. Also apply the approved CR-08/CR-09 rewording
   and add to CR-27 *App side* after "`kind: 'original'` unmodelled": " (also the week-1 starter carrying a Sleeper `injury_status` who
   missed the last game — the chain has no injury input)". Then re-copy the whole mirrored span byte-for-byte into data
   `cross-repo-registry.md`.
7. **`grading/anchor-policy.md`** (flag 6): turn the QB expected-segments paragraph into a table matching the other two:
   `| capture date | expected QB start-share model |`, one row "`< first capture after the app push`" → "legacy — no QB row carries
   `qbTakeoverBasis`", one row "`>= first capture after the app push`" → "qb-takeover — to be confirmed against the first such capture";
   keep the one-line note that no such capture exists at writing.
8. **Backlog** (flag 7): D-60 **Found by:** `8ba42fd`.

Done: app `npm test`, `npm run lint`, `npm run build`; data `npm test`, `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`,
`node --test test/registry.test.mjs` all green. Commit app (message "Fix pass 1: P6b-B — …") then data commit 4 (registry span +
`all 27` + anchor-policy, message naming the app SHA it mirrors). Hand back both SHAs, files, what each new test asserts, the
final span diff-line count against data `8fd0b73`, and the `grep -rn "PROVISIONAL(" src/` lines for the new tags.

### Fix pass 1 — result (2026-10-04)

Applied as app `9060d01` (on `56653fc`; 2799 tests, lint, build green) and data commit 4 `23a6ae0` (on `8fd0b73`; data
`npm test` 1248 pass, registry-mirror 21/21, registry 2/2; spans byte-identical; 36 → 44 lines vs `8fd0b73`). Nothing pushed.
Re-review of the fix diff + data commit 4: **one surviving flag → to Anton** (no third automatic round):

- [fidelity] On the item-1 branch (preseason-`chain` QB, live `original`) the record still writes `ros.prior: projPrior` (the
  ≈0.16-share value) while `ros.value` is built on `starterPrior`. Market prior/delta + sort, the pop-up note/`nextDelta` and
  Portfolio's delta then show the prior swap as a large evidence-driven rise (≈2.4 → ≈13), and snapshots store a prior the value
  was not built from. Proposed fix (one line + one assertion): emit `ros.prior` as `isChainRow ? starterPrior : projPrior` on that
  branch; the `bk` test also asserts `ros.prior === 15`.

**Push checklist (after sign-off):** fixup `PRIOR_MODEL_FROM` + `GOLDEN.recordedUnder` to push UTC date + 1 (both strings); fill
anchor-policy boundary 5's push time (data); push app (`git pull --rebase`, never `--force`), then data the same sitting; mark D-57
resolved is already in the backlog.

## Fix pass 2 (Stage B) — Anton approved 2026-10-04 ("apply fix and push")

App only, one commit on top of `9060d01`, no push (Session 1 pushes).

1. `src/utils/inSeasonScoring.js` `buildScoringPosteriors`: the record's `ros.prior` on the non-start branch becomes
   `isChainRow ? starterPrior : projPrior` (the prior `ros.value` was built from). Start-branch and every non-`chain` row unchanged.
   Test (`inSeasonScoring.test.js`, the chain-basis original case `bk`): also assert `ros.prior === 15`; the `incumbent`-basis case's
   prior stays 20.
2. Push-date fixup (§9 of `-a`): push UTC date is 2026-10-04 → `PRIOR_MODEL_FROM = '2026-10-05'` in `src/utils/inSeasonConstants.js`
   and `GOLDEN.recordedUnder: '2026-10-05'` in `src/__tests__/priorModelFrom.test.js`. Nothing else in either file.

Done: `npm test`, `npm run lint`, `npm run build`. Commit "Fix pass 2: P6b-B — ros.prior on chain→original; PRIOR_MODEL_FROM 2026-10-05".
