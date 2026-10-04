# P6b-A — QB takeover wiring, Stage A: pin, model module, season projection

Session 1, 2026-10-03. Plan: `future_plans/in-season-notes-plan.md` P6/P6b. Research: data
`grading/2026-10-03-qb-takeover-verdict.md` + `backtests/2026-10-03-qb-takeover-constants.json`
**pinned at data `c3f16f82351151b9dd019781c5ea6e07bcdb1b9a`**. Checked against app `00c0946`, data `8fd0b73`.
Registry draft: data `.claude/tasks/qb-takeover-research-registry.md` (CR-27 draft + P6a's owed
CR-08/09/16 and signal-registry edits — this change lands them).

**Session type.** Parent-folder session (`Claude Projects/Sleeper Dashboard/`), writes both repos, per
the plan's P6b line and Anton's instruction for this slice. One-off: the standing two-session registry
route is not changed by this (no parent CLAUDE.md exists). Each repo keeps its own commits, its own
done-definition and its own push.

**Scope.** QB only. RB/WR/TE keep today's flat depth factor byte-for-byte. Model = the pinned P6a
chain: hazard `pUp` on `dp + og + rk + iq`, stickiness `pStay` on `st`.

**Split (plan-gate round 1).** This file is Stage A (app commit 1). Stage B — live checkpoint, ROS, dynasty discount,
registry and data repo — is `qb-takeover-wiring-b.md`. Sections keep their original numbers; §0, §1, §7, §10 and the
review record live here only.

## 0. Decisions for Anton (defaults applied below; change any before Session 2)

| # | Decision | Default in this plan | Why |
|---|---|---|---|
| D1 | The "mild discount" for a rookie QB who sits longer than expected | ×**0.90** on his dynasty prospect prior, rookie season only, when his actual starts trail the preseason chain's expected starts by more than 1 game (Q5's band) | About half of Q5's next-season PPG gap (−18%), shrunk because Q5 is n = 15 and confounded. **Note:** "expected" comes from depth order, incumbent quality and rookie status — not draft capital, which added nothing once depth order was known (P6a, dg NO-GAIN). So it reads "sat longer than his situation predicted", not "than his draft slot predicted". |
| D2 | Starting QBs' existing +5% depth bump (order 1 → ×1.05) | **Kept** | The takeover model covers backups only. Removing the bump would move every starting QB's projection by 5% with no measurement behind it. |
| D3 | In-season evidence for a backup QB | **Only his starts count** (relief/kneel-down appearances ignored), at the existing QB in-season k | Two kneel-down games at 0 pts would otherwise cut a backup's starter rate by 40%. |
| D4 | Size of the change (information, not a choice) | QB2 veteran behind an average starter: full-season start share **0.156** (today ×0.88). Rookie QB2: 0.232 (average starter), 0.356 (weak starter). QB3+: ≈0.04. | Every backup QB's projected PPG drops sharply in Market, My Team and /week — that is the fix the Mendoza note asked for. |

## 1. What changes

1. **Season projection** (`computeNextSeasonProjection`, both paths): a QB who is not his team's
   depth-chart QB1 gets `projectedPPG = starter PPG × full-season start share`, the share from the
   chain run from game 1 over 17 games (pre-kickoff rule — never the live season, CR-21 invariant).
   The flat ×0.88 / ×0.68 no longer apply to any QB.
2. **Rest of season** (the in-season seam): for a QB who is not his team's original week-1 starter,
   ROS PPG = starter-rate posterior × the chain's expected share of the remaining team games, run from
   the live checkpoint (last game's starter, streak, week-1 starter flag, live incumbent quality).
3. **Dynasty**: unchanged starter outlook (the rookie dynasty prior never applies the share; `next`
   uses the starter PPG); a rookie QB flagged by D1 gets ×0.90 on his prospect prior.

## 2. Stage A — pin, model module, season projection (app commit 1)

### 2.1 Pin the constants

- `src/__fixtures__/qb-takeover-constants-2026-10-03.json` = `git -C ../sleeper-dashboard-data show
  c3f16f8:backtests/2026-10-03-qb-takeover-constants.json` — byte copy, never reformatted.
- New `src/utils/qbTakeoverConstants.js` (pure, no imports):
  ```js
  export const QB_TAKEOVER_SOURCE = { file: 'sleeper-dashboard-data backtests/2026-10-03-qb-takeover-constants.json',
    commit: 'c3f16f82351151b9dd019781c5ea6e07bcdb1b9a', generatedAt: '2026-10-03T20:19:11.236Z',
    fixture: 'src/__fixtures__/qb-takeover-constants-2026-10-03.json' }
  export const QB_LEVELS = { /* copy definitions.bins.levels verbatim, all 12 keys */ }
  export const QB_HAZARD = { features: ['dp','og','rk','iq'], coef: { /* hazard.coef verbatim, 4 dp */ } }
  export const QB_STICK  = { features: ['st'], coef: { /* stickiness.coef verbatim */ } }
  export const QB_DEFS = { incK: 3, priorMinGames: 4, obsMinGamesNoPrior: 2, weakCut: 0.85, strongCut: 1.10,
    bnCap: 8, streakCap: 4 }
  // PROVISIONAL(heuristic): rookie-QB sat-longer prospect discount · Q5 report-only (n=15, confounded), D1 · a data-side Q5 replication on the app's definition (D-60)
  export const QB_SAT_LONGER_DISCOUNT = 0.90
  // Not in the pinned constants file (it has no q5 key): mirrors data lib/qbTakeover.mjs QB_TAKEOVER_DEFAULTS.q5.band @ c3f16f8 (:43), the band Q5 classified with
  export const QB_SAT_LONGER_BAND = 1          // residual < −1 → sat longer
  ```
  Header comment: never hand-edit a coefficient; re-run `node bin/backtest.mjs --qb-takeover --write`
  and re-pin by byte copy (CR-27).
- New `src/__tests__/qbTakeoverConstants.test.js`:
  1. fixture `source`/`generatedAt` equal `QB_TAKEOVER_SOURCE`; fixture `basis === 'half_ppr'`.
  2. `QB_HAZARD`/`QB_STICK` features and coef deep-equal fixture `hazard`/`stickiness`.
  3. `QB_LEVELS` deep-equals `definitions.bins.levels`; `QB_DEFS` equals `definitions.incPPG.{k,priorMinGames,obsMinGamesNoPrior}` and the iq cuts parsed from the data's `QB_TAKEOVER_DEFAULTS` values stated in `definitions.bins.iq` (0.85/1.1 — assert the literal string contains `weak < 0.85` and `1.1 < strong`).
  4. **Re-derivation:** a test-local port of data `fitLogistic` (ridge Newton–Raphson, intercept
     unpenalised, `beta[0]` start `log((E+0.5)/(N−E+0.5))`, λ = `definitions.lambda`, tol 1e-10,
     maxIter 100, Gaussian elimination with partial pivoting) over the pooled fixture patterns
     (`fixture.hazardPatterns` rows are `[...codes(hazardKeys), trials, events]`; aggregate over the
     used keys, offset 0), then `Math.round(b*1e4)/1e4` equals every pinned coef, hazard and
     stickiness. The port lives in the test file only.

### 2.2 `src/utils/qbTakeover.js` (new, pure, imports `./qbTakeoverConstants` only)

```js
export const REG_SEASON_TEAM_GAMES = 17                 // 2021+; the live seasons this app scores
export const dpCode = order => order === 1 ? 1 : order === 2 ? 0 : 2   // LEVELS.dp = [d2, d1, d3]; null/≥3 → d3
export function iqCode(ppg, median)                     // data iqCode verbatim: null/med ≤ 0 → 3 (unknown); rel < 0.85 → 1; > 1.10 → 2; else 0
export function priorPPG(row)                           // data priorPPG: gp ≥ 4 and finite fantasyPoints → fp/gp, else null
export function incPPG(prior, obs)                      // data incPPG verbatim (k = 3; no prior → mean when ≥ 2 obs, else null)
export function pUpOf(codes)                            // predict over QB_HAZARD; THROWS if any QB_HAZARD.features key is not an integer code in range
export function pStayOf(codes)                          // same over QB_STICK
export function expectedStarts({ start, remaining })    // verbatim port of data lib/qbTakeover.mjs expectedStarts (54 states), models fixed to the pins
export function buildPreseasonQbShares({ playerMap, careerStats, dataSeason, games = REG_SEASON_TEAM_GAMES })
```

`expectedStarts` port: same state indexing, same `bnCode`/`wkCode`/`stCode` helpers, same
`start = { role = 'B', ps, c, s = 1, g, hazardCodes, stickCodes }`, same og → `dq = unknown` rule, same
return `{ perGame, expected, fraction, massPerGame }`. The hazard call merges `{ ...hazardCodes, ps, bn, wk }`
exactly as data does; unused keys are ignored by `pUpOf`. Port the code, do not re-derive it.

**`buildPreseasonQbShares`** — the g = 1 rule (constants `definitions.population`/`bins.iq`), Sleeper
domain throughout, no live-season input:
1. QBs = `playerMap` entries with `position === 'QB'`. Team `T = info.team`; `null`/`'FA'` → `{ role: 'no-team' }`.
2. Per team: QBs on `T` with `depth_chart_order === 1`. None → every QB on `T` is `{ role: 'no-chart' }`.
   Incumbent = the order-1 QB with the smallest `player_id` (string `<`, data's tie rule); the rest are backups.
3. `incPrior[T] = priorPPG(careerStats[dataSeason]?.[incumbentId])` (league basis — the ratio cancels basis to first order, verdict "For P6b").
   `median` = median of non-null `incPrior` over all teams with an incumbent.
4. Backup `x` on `T`: `codes = { dp: dpCode(depth_chart_order ?? null), og: 0, rk: info.years_exp === 0 ? 1 : 0, iq: iqCode(incPrior[T], median) }`
   (unlisted on a charted team → `d3`; a second order-1 QB → `d1`).
   `r = expectedStarts({ start: { role: 'B', ps: 0, c: 0, g: 1, hazardCodes: codes, stickCodes: {} }, remaining: games })`.
5. Return `{ [id]: { role, team, incumbentId, codes?, pUp?, share?, perGame?, games? } }` — `role ∈ incumbent | backup | no-team | no-chart`;
   backups carry `codes`, `pUp = pUpOf(codes)`, `share = r.fraction`, `perGame = r.perGame` (17 numbers, used by D1 in Stage B), `games`.

### 2.3 `src/utils/seasonProjection.js`

New input `qbTakeover = null` on `computeNextSeasonProjection` (the `buildPreseasonQbShares` map). Read
`const qbEntry = position === 'QB' ? (qbTakeover?.[playerId] ?? null) : null` once, before routing.

**Basis** (`qbTakeoverBasis`, a fixed vocabulary): non-QB → `'none'`; vet `depthStale` → `'stale'`;
`qbEntry == null` → `'not-evaluated'`; `qbEntry.role !== 'backup'` → the role; else `'chain'`.
`qbStartShare` = `qbEntry.share` when basis `'chain'`, else `null`.

**Vet path, Step 8** — QB rows only; non-QB branch order byte-identical:
```js
if      (depthStale)                                   depthFactor = 1.00
else if (isQB && qbEntry?.role === 'backup')           depthFactor = 1.00   // start share applied after the comp blend (Step 10)
else if (depthOrder === 1)                             depthFactor = 1.05
else if (isQB)                                         depthFactor = 1.00   // flat 0.88/0.68 never apply to a QB
else if (depthOrder === 2) … (unchanged)
```
**Vet path, Step 10 (new, after `computeCompBlend`)**: `qbStarterPPG = blendedPPG` (QB rows; `null`
otherwise); `projectedPPG = qbStartShare != null ? blendedPPG * qbStartShare : blendedPPG`. The existing
non-finite check and rounding run unchanged; total points follow the next paragraph.
The `blendShift` summary line keeps reading `projectedPPG` vs `pipelinePPG` — compute it from
`blendedPPG` instead so the share does not fire "Career comps temper projection".

**Total points on a `chain` row (both paths, plan-gate flag 6).** `projectedPPG` there is per *team* game, so
`projectedPPG × projectedGames` (games *played*, vet-clamped 8–17; rookie ladder) under-counts and, on the rookie
path, double-counts sitting. For basis `'chain'` only: `projectedTotalPts = Math.round(qbStarterPPG * qbStartShare * REG_SEASON_TEAM_GAMES * 10) / 10`
with `games` read from the entry (`qbEntry.games`, set by `buildPreseasonQbShares`) — `seasonProjection.js`
gains no import. The product is starter PPG × expected starts. `projectedGames` is unchanged (availability, still shown as "Proj G"). Every other row: formula unchanged.

**Rookie path**: `rookieProjection` gains a trailing parameter `qbEntry = null`. After
`applyRookieCeiling`: `qbStarterPPG = ceiledPPG` (QB), `projectedPPG = qbStartShare != null ? ceiledPPG * qbStartShare : ceiledPPG`.
`factors.depthFactor` stays `1.0`. Games ladder unchanged; total points as in the paragraph above for `chain` rows.

**Factors** (both paths, every position — schema keys are per path): `qbStartShare` (4 dp or `null`),
`qbTakeoverBasis`, `qbStarterPPG` (3 dp or `null`). Vet 75 → **78**, rookie 60 → **63**: update
`src/__tests__/factorsSchema.test.js`, the two key lists in `src/utils/seasonProjection.test.js` (:59, :90),
and CLAUDE.md's count (same byte length). Add to `rookieProjection`'s comment block "both paths".

**adjustmentSummary** (both paths): basis `'chain'` → ``Backup QB — projected to start ${Math.round(qbStartShare*100)}% of games ↓``.
The vet `'Not confirmed starter ↓'` line (`depthFactor < 0.90`) can no longer fire for a QB — leave it.

### 2.4 App wiring (Stage A)

- `const qbPreseasonShares = useMemo(() => leagueData?.playerMap && careerStats ? buildPreseasonQbShares({ playerMap: leagueData.playerMap, careerStats, dataSeason: deriveDataSeason(careerStats) }) : null, [careerStats, leagueData])`, declared beside `depthMap`.
- `seasonProjections` memo: pass `qbTakeover: qbPreseasonShares`; add it to the deps.
- **Do not** add it to `rookieDynastyPriors`' `projectionArgs` (that prior is the starter outlook by design).

### 2.5 Model pin (CR-25/26)

`PRIOR_MODEL_FROM` = the **day after the app push's UTC date** (a later date only refuses more frozen
priors; an earlier one could admit an old-model capture). 2026 is already unfrozen
(`'2026-09-13'` > kickoff), so the bump costs nothing this season. In `src/__tests__/priorModelFrom.test.js`
add fixtures `vetQB_backup` (vet QB, `depthMap` order 2, `qbTakeover: { [id]: { role:'backup', share: 0.1558, … } }`)
and `rookieQB_backup` (the day-3 rookie QB with a `share: 0.232246` backup entry), re-record GOLDEN by
running the code once, set `recordedUnder` to the new date. Existing fixtures must not change.

**Factories (plan-gate flag 2).** `makeVet`/`makeRookie` in `src/__fixtures__/factories.js` build an explicit
`asOptions()` literal; add `qbTakeover: overrides.qbTakeover ?? null` to **both**, or every QB fixture above and in
§4 silently runs `not-evaluated`. Add one assertion that a `makeVet({ qbTakeover: X }).asOptions().qbTakeover === X`.

## 4. Guards and tests (Stage A)

- **PIPELINE lists**: append `'src/utils/qbTakeover.js'` and `'src/utils/qbTakeoverConstants.js'` after
  `'src/utils/ktcHistory.js',` in all nine `src/__tests__/*ViewOnly.test.js` lists + `currentSeasonTotalsIsolation.test.js` (ten lists).
- `inSeasonEvidenceViewOnly.test.js`: new test — the only non-test importer of `qbTakeover` is `src/App.jsx` (Stage B widens it).
- `currentSeasonTotalsIsolation.test.js`: the `computeNextSeasonProjection(` call contains `qbTakeover: qbPreseasonShares` and its
  live-identifier list stays `[]`; the `buildRookieDynastyPriors(` call contains no `qbPreseasonShares`.
- `qbTakeover.test.js`: golden chain (§7 below, `perGame` to 1e-6); `pUpOf` throws on a missing pinned key;
  `buildPreseasonQbShares` cases — incumbent / backup / no-team / no-chart / two order-1 QBs (smaller id incumbent, other `d1`) /
  unlisted → `d3` / rookie → `rk 1` / iq weak, strong, unknown against a hand median; a backup's `share` equals the golden
  case with the same codes.
- `seasonProjection.test.js`: vet QB order 2 + backup entry → `depthFactor 1.0`, basis `chain`, `projectedPPG = round1(qbStarterPPG × share)`,
  `qbStarterPPG` equals the same player's `projectedPPG` computed with `qbTakeover: null` (unrounded vs 3 dp); no entry → basis
  `not-evaluated`, `depthFactor 1.0` (was 0.88); order 1 → 1.05, `incumbent`; stale → `stale`, share null; rookie QB backup →
  share applied after the ceiling; RB order 2 → still 0.88, basis `none`, both QB keys null; the new summary line.
- `factorsSchema.test.js` 78/63, `qbTakeoverConstants.test.js` (§2.1), `priorModelFrom.test.js` (§2.5), factories (§2.5).

## 5. Docs (commit 1 — plan-gate flag 12: docs land with the code they describe)

- `docs/projection.md`: Step 8 row (QB: flat factor retired; order 1 ×1.05 kept; backups ×1.00 in the pipeline) and a new
  **Step 10 · QB start share** subsection (g = 1 rule, chain, applied after the comp blend / ceiling, per-team-game semantics,
  the verdict's g = 1 overstatement: 5.1% predicted vs 2.2% raw game-1 rate, uncorrected); rookie path note.
- `docs/signal-registry.md` §3B: edit the Depth factor row (QB clause) and add rows `qbStartShare`/`qbTakeoverBasis`/`qbStarterPPG`
  (computed factor · `seasonProjection.js` from `buildPreseasonQbShares` · live: current Sleeper `depth_chart_order` + S−1
  priors · ephemeral input, captured · active→projectedPPG, QB rows).
- `docs/nav/utils.md`: `qbTakeover.js`, `qbTakeoverConstants.js`; `docs/navigation.md`: the new fixture.
- `CLAUDE.md` (24,950 B of 25,000): `75 vet keys / 60 rookie keys` → `78 vet keys / 63 rookie keys`; add the fixture to the
  `src/__fixtures__/` row **only** after compressing that row (e.g. "provenance oracles for every pinned constant set — listed in
  docs/navigation.md") so `claudeMdSize.test.js` stays green. Leave room for Stage B's `qbWeekly.js` addition.

## 7. Golden values (data `expectedStarts` at the pins, `node` against `c3f16f8`; `perGame` listed to 6 dp in the test)

| case | start | codes (dp, og, rk, iq) | remaining | pUp | expected | fraction |
|---|---|---|---|---|---|---|
| G1 | B, ps 0, c 0, g 1 | d2, 0, vet, mid | 17 | 0.053131 | 2.648596 | 0.155800 |
| G2 | same | d2, 0, rookie, mid | 17 | 0.085849 | 3.948185 | 0.232246 |
| G3 | same | d2, 0, rookie, weak | 17 | 0.152710 | 6.048543 | 0.355797 |
| G4 | same | d3, 0, vet, strong | 17 | 0.011390 | 0.634499 | 0.037323 |
| G5 | same | d2, 0, vet, unknown | 17 | 0.060194 | 2.947575 | 0.173387 |
| L1 | B, ps 1, c 0, g 5 | d1, 1, vet, mid | 13 | 0.227391 | 5.728915 | 0.440686 |
| L2 | S, ps 1, c 3, s 2, g 8 | d2, 0, rookie, mid | 10 | 0.085849 | 4.532445 | 0.453244 |
| L3 | S, ps 1, c 0, s 4, g 12 | d2, 0, vet, mid | 6 | 0.053131 | 3.750443 | 0.625074 |
| L4 | B, ps 0, c 9, g 10 | d2, 0, vet, weak | 8 | 0.097220 | 1.675769 | 0.209471 |

`pStay` by st: s1 0.687337, s2 0.728732, s3 0.854433. First `perGame` values: G1 0.053131, 0.086827, 0.109709;
L2 0.728732, 0.554339; L3 0.854433, 0.73779. Session 2 regenerates the full `perGame` arrays with the scratch script
below (read-only against the data repo) and pastes them into the test:
`node -e` importing `../sleeper-dashboard-data/lib/qbTakeover.mjs` `expectedStarts`/`predict` with the pinned
`hazard`/`stickiness` objects, `stickCodes = { st, dg3: 0, rk, dq: 3 }`, unused hazard keys 0.

## 9. Done, commits, smoke (Stage A)

**Two implementation sessions, one verification each.** Session 2a implements Stage A only (file `-a`) → app commit 1 →
done-definition → hand back, **no push**. Session 1 verifies. Session 2b then implements Stage B (file `-b`) → app commits 2
(Stage B code + its docs) and 3 (registry + P6a's signal-registry appends + backlog) and data commit 4 (registry byte copy +
CLAUDE.md count + anchor-policy) → hand back, no push. After Session 1 verifies 2b: push app (`git pull --rebase origin main`,
never `--force`), then data in the same sitting — the CR-24 daily run is red until 4 lands.

`PRIOR_MODEL_FROM` and `GOLDEN.recordedUnder` are set in commit 1 to (planned push UTC date + 1 day). If the real push date
differs, a one-line fixup commit updates both strings immediately before the push (the golden test keeps them equal).

Each hand-back: commit SHA(s), every file, every deviation, what each new/changed test asserts, `grep -rn "PROVISIONAL(" src/`;
2b also the §6.1 changed-line counts.

App (Stage A): `npm test`, `npm run lint`, `npm run build`, factorsSchema. One commit (**commit 1**), no push. No data-repo
edit in Stage A. Smoke: Market QB list with `scoringPosteriors` absent or present — backup QBs' projection shows the new
adjustment line in the pop-up and a reduced PPG; starters unchanged versus `main`; no `NaN`. A Claude screenshot is not sign-off.

## 10. Out of scope (recorded, not built)

- The dynasty score's own depth multiplier on the opportunity score (`dynastyScore.js` ×1.15/0.90/0.70) — a different number, untouched.
- RB/WR/TE depth factor.
- The vet staleness guard (`depthStale`) still holds a benched veteran QB with ≥ 8 starts last season at neutral.
- Discount persistence into `yearsExp` 1 (D-60).

## Review record

### Plan gate, round 1 (2026-10-03) — 19 flags, verbatim (decisions below)

Run as `general-purpose` (opus) with `.claude/agents/plan-reviewer.md`'s mandate inlined (the agent type is not registered in this session); data repo readable because this is a parent-folder slice.

1. FLAG [ordering]: §3.4 does not say where the new `qbLiveStates` memo goes. `buildProspectLevel`'s memo (`prospectLevel`, App.jsx:565) reads it and sits far above `scoringPosteriors` (:698). If `qbLiveStates` is declared near the defence effect (~:1140) or beside `scoringPosteriors`, the code hits a TDZ error at render. It has to be declared between `qbPreseasonShares`/`liveSeasonUsable` (:229–:250) and `prospectLevel` (:565) — qb-takeover-wiring.md:231 / src/App.jsx:565
2. FLAG [mechanical]: `makeVet`/`makeRookie` `asOptions()` list each option explicitly and do not pass `qbTakeover` through. The §2.5 `vetQB_backup`/`rookieQB_backup` fixtures and the §4 seasonProjection tests would silently run with `qbTakeover` undefined (basis `not-evaluated`, no share) and record GOLDEN without the change. `src/__fixtures__/factories.js` needs `qbTakeover: overrides.qbTakeover ?? null` in both factories, and it is not in the touch list — src/__fixtures__/factories.js:252-270,295-311 / qb-takeover-wiring.md:149-151
3. FLAG [edge-case]: the snapshot write gate does not wait for `qbWeekly`. `shouldWriteProjectionSnapshot` gates only on `inSeasonSettled` (liveSeasonSettled && frozenPrior). The daily capture can therefore write `players[id].inSeason` for backup QBs before `qbWeekly` resolves (no `start`, prior = share-applied projectedPPG, n = games played). It is first-write-wins per day, so whether a captured record carries `start` depends on a race. Add `qbWeekly` settling to the gate, or state the race — src/App.jsx:817-826 / src/utils/projectionSnapshot.js:436-454
4. FLAG [edge-case]: a preseason `backup` QB with no live state takes "today's code path" (`qbLiveStates` null while loading, empty Map on any failed week, last game without a primary, g = 17). That path blends a per-team-game prior (`projectedPPG` = starter × share) with per-game-played `obs` that includes relief and kneel-down games — exactly the mix D3 rejects. `applyInSeasonProjection` then multiplies by `projectedGames − n`, so the displayed ROS flips when `qbWeekly` lands. Specify the fallback for basis-`chain` rows (omit the record, or use the starter prior with starts) — qb-takeover-wiring.md:215 / src/utils/inSeasonScoring.js:159-200
5. FLAG [edge-case]: the two live sources cover different weeks. `qbWeekly` loads through `week − 1` only. `currentSeasonTotals` (Fri/Mon/Tue cadence, CR-21 Mirror) can already hold a partly played week. In `applyInSeasonProjection`'s start branch, `pointsSoFar` (from totals) plus `starterValue × expected` (17 − g counted from weekly rows) then double-counts that week's game for teams that have played it — qb-takeover-wiring.md:217 / src/utils/inSeasonScoring.js:302-316
6. FLAG [edge-case]: on the vet path, `projectedTotalPts = projectedPPG × projectedGames`, and `projectedGames` is clamped to 8–17 games played. For a `chain` row, `projectedPPG` is per team game, so the total under-counts (it should scale by 17). §10 lists only the rookie double-count. §6.2/CR-01 Mirror then tell graders to "grade on total points", which is also mis-scaled for these rows — qb-takeover-wiring.md:121-122,292,337,391
7. FLAG [edge-case]: `start` records change the meaning of fields the UI labels as preseason. On those records `ros.prior` = starter prior × live remaining fraction (moves weekly, not the preseason value) and the evidence count is `starts`, while `n` stays games played. The pop-up note "PPG · preseason {ros.prior} → after {n} G" and Market's In-season prior/GP/weight cells keep their current labels and become wrong for these QBs. The plan touches neither — src/components/dp/PlayerDetailModal.jsx:369-370 / src/components/market/Market.jsx:1013-1037
8. FLAG [edge-case]: for the `next` projection-prior branch, §3.3 swaps the prior to `factors.qbStarterPPG` (the live value). It does not say what happens when the record is frozen. Today that branch uses `projPrior`, which is the frozen value when one exists. Specify `frozenPrior.starterPPG[id]` when frozen, so frozen and live inputs are not mixed — qb-takeover-wiring.md:214 / src/utils/inSeasonScoring.js:190-195
9. FLAG [invariant]: the currentSeasonTotalsIsolation guard does not cover the new live identifiers. Its `LIVE` regex has no `qbLiveStates`/`qbWeekly`, so the existing seam-builder assertions (`buildProspectLevel` → `['currentSeasonTotals']`, `buildScoringPosteriors` → `['currentSeasonTotals','frozenPrior']`, computeDynastyScore calls, `buildInSeasonLevel`, `buildRookieDynastyPriors`) stay green whichever call a live QB identifier is passed to. §4 adds a check only for `computeNextSeasonProjection(`. Extend `LIVE` and the allowed lists instead — src/__tests__/currentSeasonTotalsIsolation.test.js:105-157 / qb-takeover-wiring.md:240-241
10. FLAG [mechanical]: wrong count of guard files. There are nine `*ViewOnly.test.js` files, not ten (nine plus currentSeasonTotalsIsolation = ten PIPELINE lists) — qb-takeover-wiring.md:237
11. FLAG [mechanical]: the pinned constants file has no `q5` key. Its top-level keys are source, generatedAt, basis, definitions, hazard, stickiness, chain, q4, verification, fixture. `q5.band` exists only in data `QB_TAKEOVER_DEFAULTS` (lib/qbTakeover.mjs:43). The `QB_SAT_LONGER_BAND` comment claims a provenance the fixture cannot back — qb-takeover-wiring.md:56
12. FLAG [ordering]: §5 and §9 disagree on when docs land. §5 says docs go in "the same commits as the code they describe"; §9 puts all docs in commit 3. Commit 1 changes the factor counts and Step 8 while CLAUDE.md, projection.md and signal-registry.md still describe 75/60 and the flat QB factor — qb-takeover-wiring.md:258,373
13. FLAG [cross-repo]: the CR-25 Invariant is left contradicting its own append. It still says the backtest's evidence definitions ("n = games played") equal the app's. The §8 App-side append and Mirror (c) introduce n = starts for QB backups, but only the App side and Mirror are amended — the Invariant needs the same carve-out — qb-takeover-wiring.md:352-354 / docs/cross-repo-registry.md:273
14. FLAG [cross-repo]: the CR-15 Invariant still lists `rookieProjection`'s exact ordering ("calibration inside, then the ceiling …, then the games ladder, then total points"). The share now sits between the ceiling and the games ladder, and the Invariant is not amended. CR-15's Mirror also keeps "a trigger like the other ten app-side modules", which goes stale once Triggers say twelve — qb-takeover-wiring.md:340-342 / docs/cross-repo-registry.md:163,166
15. FLAG [cross-repo]: the CR-26 Invariant still names only `players[id].projection.projectedPPG` as what a snapshot must carry. The plan's read-back of `projection.factors.qbStarterPPG` is added to App side and Mirror only. This entry is data→app, so the Invariant is what the data reviewer holds — qb-takeover-wiring.md:356-358 / docs/cross-repo-registry.md:281
16. FLAG [cross-repo]: the reconstruction source for the g = 1 features is inconsistent. D-59 and the CR-15 Mirror rebuild them "from the D5 week-1 chart" (nflverse) yet promise "parity against a post-boundary capture". The app computes them from the Sleeper `depth_chart_order` current at capture (snapshot `teamDepthCharts`/`depthChartOrder`), so nflverse-based parity cannot hold. Name the captured chart as the parity source — qb-takeover-wiring.md:301-305,342
17. FLAG [cross-repo]: the CR-27 Mirror's **Transport** list omits three app-vs-fit transpositions. Primary passer is restricted to playerMap `position === 'QB'` rows (data's `primaryPassers` considers every passer). `rk` comes from `years_exp === 0` (data uses `draftYear === S`). Live `iq` uses league-scored weekly points (fit used half-PPR `weeklyPoints`; "ratio cancels" is stated only for g = 1) — qb-takeover-wiring.md:160,192-194,366
18. FLAG [cross-repo]: §6.2 under-edits grading/anchor-policy.md. It leaves stale "Four model changes on the two tracked axes" (:57), the "## Boundaries by path" section (:89-93, which needs a boundary-5 line), and "the table above is complete … as of D-18" (:97-100). The boundary time should also be the app push (captures check out app `main`), not the Stage A commit time, because the push follows commits 2–3 — qb-takeover-wiring.md:286-297
19. FLAG [registry-stale]: CR-01 (projection payload `projectedPPG` and `inSeason`) does not list two live consumers whose meaning this change alters for QB backups (`projectedPPG` per team game; `inSeason.ros.prior`/`value` per remaining team game). They are `buildOwnProjections` in src/utils/weeklyOwnProjection.js:98-100 (reads `projectedPPG` and `inSeason`) and src/components/portfolio/Portfolio.jsx:383-390 (reads `inSeason.ros.weight/value/prior` and `projectedPPG`) — docs/cross-repo-registry.md:52

MIRROR block: CR-01's Mirror quoted in full (already covered by §8); CR-25 note — the Invariant field, not the Mirror, is what is left contradicting (flag 13).


### Decisions on round 1 (Session 1, 2026-10-03 — every flag verified against live source first; all 19 accepted)

| # | Decision | Where applied |
|---|---|---|
| 1 | `qbLiveStates` declared immediately after `qbPreseasonShares` (beside `depthMap`), above `prospectLevel`; `qbWeekly` state with the other `useState`s | B §3.6 |
| 2 | Factories pass `qbTakeover` through; one pass-through assertion | A §2.5 |
| 3 | `qbWeeklySettled` state; snapshot gate `inSeasonSettled` waits for it (a failed load still settles) | B §3.6, §4 |
| 4 | A preseason-`chain` row with no live state emits **no** in-season record (display = raw projection; snapshot `inSeason` absent) — omit, never blend per-team-game prior with relief-contaminated evidence | B §3.3 |
| 5 | Start branch's points-so-far = `start.seasonPoints` from the same weekly rows the chain counts; season-totals `fantasyPoints` not read there | B §3.2, §3.3 |
| 6 | `chain` rows: `projectedTotalPts = qbStarterPPG × qbStartShare × games` (starter PPG × expected starts) on both paths; also removes the rookie games-ladder double count (dropped from §10) | A §2.2–2.3; CR-01/CR-15 texts; anchor policy |
| 7 | Pop-up `next` note and Market In-season GP/ROS cells get `start`-aware labels; Portfolio and `/week` correct as is | B §3.5 |
| 8 | `next` starter prior follows the frozen/live rule of `starterPrior` | B §3.3 |
| 9 | `LIVE` regex gains `qbLiveStates|qbWeekly`; allowed lists updated; new `buildQbLiveStates` → `['qbWeekly']` | B §4 |
| 10 | Nine `*ViewOnly` files + the isolation test = ten lists | A §4 |
| 11 | `QB_SAT_LONGER_BAND` provenance = data `QB_TAKEOVER_DEFAULTS.q5.band` @ c3f16f8, not the fixture | A §2.1 |
| 12 | Docs land in the commit whose code they describe; split per commit | A §5, B §5 |
| 13 | CR-25 Invariant carve-out for starts-based QB evidence | B §8 |
| 14 | CR-15 Invariant ordering amended (share between ceiling and games ladder; chain total); Mirror "other ten" → "other eleven" | B §8 |
| 15 | CR-26 Invariant names `projection.factors.qbStarterPPG` | B §8 |
| 16 | D-59 / CR-15 Mirror: parity against a capture reads that capture's own Sleeper chart; D5 week-1 only for history | B §6.3, §8 |
| 17 | CR-27 Transport lists QB-rows-only primary passer, `rk` from `years_exp`, league-basis `iq` ratio | B §8 |
| 18 | anchor-policy: intro, `:57`, *Boundaries by path*, closing paragraph; boundary time = app push | B §6.2 |
| 19 | CR-01 Triggers gain `buildOwnProjections` and Portfolio `playerFactsById` (`[registry-stale]`) plus the §3.5 reads; the matching D-58 items are struck | B §8, §5 |

**Also (Session 1):** the plan was split at the stage boundary into `-a` (Stage A) and `-b` (Stage B, registry, data) — 48.6 KB as one
file. Stage A is verified before Stage B starts; one push at the end. The superseded single file `qb-takeover-wiring.md` was deleted.
Not re-reviewed (one plan-gate round, per the workflow); the decisions above are Session 1's.

## Verification record — Stage A (`c7a5d84`, 2026-10-04)

implementation-reviewer on `00c0946..c7a5d84`: 3 flags + 1 scope note. Session 2a's six declared deviations accepted
(PRIOR_MODEL_FROM `2026-10-04` is re-checked against the real push date per §9). Scope note accepted:
`src/utils/inSeasonConstants.js` is where `PRIOR_MODEL_FROM` lives — a necessary consequence of §2.5.

1. FLAG [untested]: blendShift-from-`blendedPPG` and share-after-blend untestable with the default fixture (`compBlendWeight` 0). → Fix pass 1 item 1.
2. FLAG [fidelity]: docs/projection.md Step 10 says no-team/no-chart QBs are `not-evaluated`; they carry entries with those roles. → item 2.
3. FLAG [fidelity]: docs/projection.md attaches 5.1% to "a d2 vet behind an average starter"; it is the verdict's mean extrapolated game-1 pUp over all game-1 rows (d2/vet/mid is 5.3%, G1). → item 3.

## Fix pass 1 (Stage A)

Touch only `src/utils/seasonProjection.test.js` and `docs/projection.md`. No source change. One commit on top of `c7a5d84`, no push.

1. **`src/utils/seasonProjection.test.js`** — rewrite the case "the share is applied after the comp blend: no 'Career comps temper'
   line from the share, and the backup line is added" to use the comp-pool setup the existing case
   "comp blend: compBlendWeight > 0 and projectedPPG ≠ pipelinePPG when comps are eligible" uses (`compBlendCareerStats(tgtId, compId)`
   + its `extraPlayers`), with the target made a **QB** (and the comp a QB, so the pool is eligible — mirror whatever that case needs for
   eligibility; if a QB target cannot get `compBlendWeight > 0` from that fixture, stop and report rather than inventing a pool).
   Run it twice — `qbTakeover: null` (unshared) and `qbTakeover: { [tgtId]: { role: 'backup', share: 0.1558, games: 17, … } }` with
   `depthMap` order 2. Assert: `factors.compBlendWeight > 0` in both; shared `factors.qbStarterPPG` equals the unshared run's unrounded
   blended value, i.e. `round1(qbStarterPPG) === unshared.projectedPPG` **and** `qbStarterPPG ≠ unshared.factors.pipelinePPG` (proves the
   starter value is post-blend); shared `projectedPPG === round1(qbStarterPPG × 0.1558)`; the backup summary line is present;
   'Career comps temper projection ↓' is absent from the shared run **unless** it is also present in the unshared run (the share must not
   be what fires it — assert `shared.includes(x) === unshared.includes(x)` for both comp lines).
2. **`docs/projection.md` Step 10, paragraph 2, last sentence** → "A QB with no team gets the entry `role: 'no-team'`, and every QB on
   a team with no order-1 QB gets `role: 'no-chart'`; neither is shared. `not-evaluated` means the projection received no entry at all
   (no `qbTakeover` map, as in the dynasty prior's recomputation)."
3. **`docs/projection.md` "Known overstatement" sentence** → "Known overstatement, uncorrected: across the fit's game-1 rows the model's
   mean extrapolated start rate is 5.1% against 2.2% raw (P6a verdict); the pinned model is applied as fitted. (A d2 veteran behind an
   average starter is 5.3% per game.)"

Done: `npm test`, `npm run lint`. Hand back the SHA, files, and what the rewritten test asserts.

### Fix pass 1 — result

Applied by fix-applier as `5fbffed` (on `c7a5d84`; `npm test` 2758 green, lint green). Re-review of `c7a5d84..5fbffed`:
"No blocking issues found." Session 1 check: the comp-line equality is not vacuous — with blendShift computed from the
shared `projectedPPG` (≈2.4 vs `pipelinePPG` 15) "Career comps temper" would fire in the shared run only and fail the
assertion. **Stage A verified** (`00c0946..5fbffed`); not pushed. Reminder for the push: today is 2026-10-04, so
`PRIOR_MODEL_FROM`/`recordedUnder` (`2026-10-04`) must take the §9 fixup to push-date + 1.
