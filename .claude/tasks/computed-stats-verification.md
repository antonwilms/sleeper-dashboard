# Computed-stats verification harness (V1 fantasy points · V2 grade inputs · V3 joins)

**Status:** planned 2026-10-18 (Session 1, parent-folder, opus). Not implemented.
**Type:** cross-repo, read-only verification. Writes code to the **app** repo (`scripts/verify/`,
outside `src/`) and output to the **data** repo (`verification/`, backlog files). Changes **no**
scoring module, constant, factor, served family or `src/` file.
**Session 2:** **sonnet**, effort medium, started from the **parent folder**
(`/Users/antonwilms/Claude Projects/Sleeper Dashboard`) because it writes both repos. Read
`sleeper-dashboard/CLAUDE.md` and `sleeper-dashboard-data/CLAUDE.md` first (neither auto-loads from
the parent). Run every git/npm command from inside the relevant repo directory.

Read-at-plan-time anchors: app `76f456c`, data `6677d44` (+ scheduled commits up to `ff2dd9d`).

---

## 0. Why

Several computed-stat flaws were found by accident (TEAM_* rows doubling team totals, the rookie
draft not found, reception share labelled target share, missed games undercounted, KTC history
empty). Tests guard structure (stat keys exist, the factors contract, rates never summed), not
correctness. This builds a repeatable check of the app's computed values against independent
sources before anything new is built on them. Output is a dated report plus backlog items; nothing
ships to scoring.

---

## 1. Settled decisions

**D1 — Run every check against the app's own functions, not the data repo's ports.** The question
is "is what the app computes correct"; the port (`lib/fantasyPoints.mjs`, CR-14) answers "does the
mirror agree", which `test/fantasy-points-season.test.mjs` already covers. A port-based V1 would say
nothing direct about the app (served-row handling in `rescoreSeasonTotals`, the `exact`/`scaled`
`weeklyPointsMethod` branch, the first-down derivation all live only app-side). If V1 finds an
app-side scoring defect, its backlog entry must say the CR-14 port needs the same fix (keep both
sides consistent when the fix is planned).

**D2 — Scripts live in the app repo, at `sleeper-dashboard/scripts/verify/`.** They import app
modules from `src/` directly. Putting them in the data repo would mean the data repo importing app
source, which it never does (every data-side reuse is a mirror: CR-14, CR-15, CR-28) and which would
create a new coupling. `src/` modules use `import.meta.env` at module top (`src/api/dataStore.js:3-4`,
`src/api/cfbd.js:4`), so plain `node` cannot import them; run the harness with **`vite-node`**
(already installed as a vitest 2.1.9 dependency: `node_modules/.bin/vite-node`). Do **not** add a
devDependency or an npm script.

**D3 — Output lives in the data repo** at `sleeper-dashboard-data/verification/` (the requested
location; the folder already holds `college-pivot-phase-b-roundtrip-proof.txt` and is unregistered).
The harness reads the data repo **from disk** (`--data ../sleeper-dashboard-data`), never via
jsDelivr, so a run is pinned to a data-repo commit the report cites.

**D4 — No new CR-NN entry.** The harness reads only shapes that are already contracts (CR-01 snapshot
envelope, CR-02 season-totals, CR-06 draft, CR-08 schedule, CR-09 gamelogs, CR-10 teamcontext, CR-17 KTC, CR-28
absence) plus `nflverse/playerids.json`, `nflverse/snaps/`, `nflverse/rosterweekly/` and
`college/`. Nothing in production depends on the harness and no data-side code reads it, so it adds
no enforced coupling; if a shape changes, the harness breaks loudly and that is acceptable. The
report header lists the CR ids each check reads.

**D5 — Sleeper network reads are allowed** (public, unauthenticated, read-only): `/v1/league/<id>`,
`/v1/league/<id>/matchups/<w>`, `/v1/state/nfl`, `/v1/players/nfl`, and
`https://api.sleeper.com/stats/nfl/<season>/<week>?season_type=regular`. Every response is cached
under `node_modules/.cache/verify-computed-stats/<runDate>/` (gitignored by `node_modules`) and its
fetch time is recorded in the sidecar.

**D6 — `playersMap` = live `/v1/players/nfl`**, exactly what the app uses (`src/App.jsx:930`,
`getAllPlayers` → `leagueData.playerMap`). Its date is recorded; current position/team applied to
past seasons is the app's real behaviour, not a harness choice.

**D7 — Seasons.** V1: every 2025 league week and every completed 2026 week. V2: 2020–2025 regular
season. V3: today's inputs (newest KTC snapshot, `nflverse/draft`, `college/` 2017–2025).

---

## 2. Files to create / touch

### App repo (`sleeper-dashboard/`)

| Path | What |
|---|---|
| `scripts/verify/computed-stats.mjs` | CLI entry. Parses args, loads inputs, runs V1/V2/V3, writes outputs. All I/O lives here and in `lib/io.mjs`. |
| `scripts/verify/lib/io.mjs` | `readDataJson(dataDir, relPath)`, `newestDated(dataDir, dir, re)`, `cachedFetchJson(url, cacheDir)`, `assertOutPath(outDir, dataDir)` |
| `scripts/verify/lib/v1FantasyPoints.mjs` | Pure: `compareWeeklyPoints(...)`, `attributeKeys(...)`, `bucketDiffs(...)` |
| `scripts/verify/lib/nflverseRebuild.mjs` | Pure: `rebuildPlayerSeasons(gamelogs, season)`, `rebuildTeamTotals(gamelogs, season)`, `teamWeeksPlayed(teamcontext, season)` |
| `scripts/verify/lib/v2GradeInputs.mjs` | Pure: per-metric comparisons, tolerance classification |
| `scripts/verify/lib/v3Joins.mjs` | Pure: KTC / college / draft diagnosis |
| `scripts/verify/lib/report.mjs` | Pure: `renderReport(results) → string` (markdown) |
| `scripts/verify/__tests__/*.test.mjs` | Unit tests for every `lib/` module except `io.mjs`'s fetch (§8) |
| `vitest.config.js` | Widen `test.include` with `'scripts/**/*.test.mjs'` — the only config edit |
| `docs/navigation.md` | One line under `### src/` (or a new `### scripts/` heading directly after it): `scripts/verify/` — read-only computed-stats verification harness; run command; reads the sibling data repo from disk; never imported by `src/` |

`eslint.config.js`: touch **only** if `npm run lint` reports problems in `scripts/verify/`. Then add
one block `{ files: ['scripts/**/*.mjs'], languageOptions: { globals: globals.node } }` and nothing
else.

### Data repo (`sleeper-dashboard-data/`)

| Path | What |
|---|---|
| `verification/<date>-computed-stats-verification.md` | The report (§7) |
| `verification/<date>-computed-stats-verification.json` | Machine-readable sidecar (§7) |
| `CLAUDE.md` | Navigation-map row `backtests/`, `grading/` → `backtests/`, `grading/`, `verification/`, and extend its sentence: verification reports are likewise unregistered (Invariant 3 exception). Stay under the 25,000-byte ceiling. |
| `.claude/tasks/app-repo-backlog.md` | One entry per confirmed **app-code** defect (§6) |

And in the app repo: `.claude/tasks/data-repo-backlog.md` — one entry per confirmed **data-repo**
defect (§6), next id **D-76** (current max is D-75; re-check both `data-repo-backlog.md` and
`data-repo-backlog-resolved.md` before numbering).

**Never touched:** anything under `sleeper-dashboard/src/`, `package.json`, `package-lock.json`,
any data-repo `lib/`, `scripts/`, `bin/`, served family, `manifest.json`, `docs/cross-repo-registry.md`.

---

## 3. CLI

```bash
cd sleeper-dashboard
node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- \
  --data ../sleeper-dashboard-data \
  --out ../sleeper-dashboard-data/verification \
  [--date YYYY-MM-DD] [--only v1,v2,v3] [--no-fetch]
```

- `--date` defaults to today UTC; it names the output files only.
- `--only` runs a subset; the report then marks skipped checks `not run`.
- `--no-fetch` uses only the cache for `<date>`; a cache miss throws (lets a report be re-rendered
  from the same inputs).
- `assertOutPath` throws unless `path.resolve(out)` equals `path.resolve(data, 'verification')`.
  The harness writes nowhere else except the cache dir.
- Exit 0 whenever the report was written, whatever it found. Exit 1 only on a harness error.

Inputs read from the data repo:

| Input | Path |
|---|---|
| Newest snapshot | `snapshots/<YYYY-MM-DD>.json`, highest date by filename; uses `leagueId`, `scoringSettings`, `capturedAt` |
| Season totals | `nfl/season-totals/<year>.json` 2020–2026; validate each with `isValidSeasonTotals` (`src/api/dataStore.js:190`) and throw if false |
| Gamelogs | `nflverse/gamelogs/<year>.json` 2020–2025 |
| Teamcontext | `nflverse/teamcontext/<year>.json` 2020–2025 |
| Schedule | `nflverse/schedule/2026.json` (V1 week-finished gate) |
| Manifest | `manifest.json` (V1 capture gate, input `lastModified`s) |
| Snaps | `nflverse/snaps/<year>.json` 2020–2025 |
| Roster weekly | `nflverse/rosterweekly/<year>.json` 2020–2025 |
| Advstats | `nflverse/advstats/<year>.json` 2020–2025 (cross-reference only) |
| KTC | newest `ktc/snapshot-<date>.json` (bare array, CR-17) |
| Draft | `nflverse/draft/draft_picks.json` → `picksByYear` |
| College | `college/{receiving,rushing,passing}/<year>.json`, 2017–2025 |
| Crosswalk | `nflverse/playerids.json` → `bySleeper` (V3 ground truth only) |

Record in the sidecar `inputs`: each path, its manifest `lastModified` if registered, and the data
repo `git rev-parse HEAD` plus `git status --porcelain` emptiness (read via `child_process.execFileSync`
— read-only git commands only).

---

## 4. Shared construction of app-side values

Build these exactly as the app does; do not reimplement any of them.

```js
// careerStats for a set of seasons, as loadCareerHistory/loadCurrentSeasonTotals deliver it
careerStats[season] = rescoreSeasonTotals(servedSeasonTotals[season], scoringSettings, playersMap)
```

`rescoreSeasonTotals` (`src/api/sleeperStats.js:314`) is pure and returns a new object; call it
fresh per (season, settings) pair — rows already carrying `sourceFantasyPoints` pass through
unrescored, so never feed its output back in.

Team codes: compare teams through `eraTeam(normalizeTeamForSchedule(abbr), season)`
(`src/utils/playerTeam.js:32`, `src/utils/nflStats.js:4`) on both sides. A team key unmatched after
that is itself reported as a finding (`team-key-unmatched`).

App functions called (imports from `src/`): `rescoreSeasonTotals`; `calculateFantasyPoints`,
`scoreSeasonStats`, `getPointsBreakdown` (`src/utils/fantasyPoints.js`);
`computeHistoricalTeamTotals`, `computeHistoricalShares`, `computeTeamContext`,
`isTeamAggregateId` (`src/utils/teamContext.js`); `computeEfficiencyFactor`, `passerRating`
(`src/utils/efficiencyMetrics.js`); `computeUsageFactors` (`src/utils/usageMetrics.js`);
`matchKTCToSleeper` (`src/utils/ktcMatch.js`); `matchCollegeToSleeper`, `normalizeName`,
`normalizeCollege` (`src/utils/collegeMatch.js`); `matchNflDraftToSleeper`
(`src/utils/nflDraftMatch.js`); `eraTeam`; `normalizeTeamForSchedule`; `isValidSeasonTotals`.

If importing any of these under vite-node fails (a module touching `window`/`indexedDB` at load),
**stop and report** — do not patch `src/`.

---

## 5. The three checks

### V1 — fantasy points vs Sleeper matchups

**League ids and settings.** Snapshot `leagueId` (2026). `GET /v1/league/<leagueId>` →
`previous_league_id` (the 2025 league; at plan time `1253804638616956928`) and
`settings.last_scored_leg` (17 for 2025). **Score each season with that season's own league
`scoring_settings`** (from `/v1/league/<id>`), not the snapshot's: at plan time 2025 and 2026
differ (`kr_yd`, `pr_yd` 0.1 → 0.05). Assert the 2026 league's live `scoring_settings` equal the
snapshot's `scoringSettings`; record any difference in the report.

**Weeks.** 2025: 1..`last_scored_leg` of the 2025 league. 2026: week `w` is included only when it
passes all four of the following:
1. `w < state.week` from `/v1/state/nfl` (with `state.season === '2026'` and `season_type === 'regular'`);
2. **capture completeness.** The count of 2026 season-totals rows whose `weeklyStats` has key `w` is
   at least 80% of the median count across weeks 1..`w−1`. Week 1 is compared against the 2025 median
   per-week count. A partial in-progress capture fails here (plan-review measurement: week 6 had 41
   rows against about 650);
3. **week finished.** Every `games[]` entry in `nflverse/schedule/2026.json` with `week === w` and
   `gameType === 'REG'` has non-null `homeScore` and `awayScore` (CR-08 shape). The file carries no
   kickoff times, so a scored week stands in for "finished".
4. **per-team coverage (the freshness gate).** Let `scheduled(w)` = every `homeTeam`/`awayTeam` of
   the week-`w` REG games in the schedule file. Let `captured(w)` = the `team` of every `TEAM_*` row
   in `nfl/season-totals/2026.json` whose `weeklyStatus[w − 1] === 'P'`, mapped through
   `eraTeam(normalizeTeamForSchedule(team), 2026)`. The week passes only if
   `scheduled(w) ⊆ captured(w)`. This gate is what catches a capture taken before the last game of
   the week (e.g. before Monday night). Gate 2 cannot, because one missing game is only about 6% of
   rows. Gate 3 cannot either, because the schedule refreshes independently of season-totals. At
   plan time, week 6 had 2 teams marked `'P'` and weeks 1–4 had 32.

Every week that fails gate 2, 3 or 4 is listed in the report as `excluded: capture-incomplete`, with its row
count, the season-totals manifest `lastModified` (`manifest.json` entry for
`nfl/season-totals/2026.json`), the schedule file's `generatedAt`, which gate failed, and for gate 4
the teams in `scheduled(w) \ captured(w)`. It is never scored, so capture lag cannot surface as `app-missing-nonzero`.
Record the final included-week list in the report header.

**Sleeper side.** For each (league, week) `GET /v1/league/<id>/matchups/<w>`; collect
`players_points[playerId]` across all rosters (de-dupe by playerId; if one player appears twice
with different points, record `sleeper-duplicate`). Record any roster with non-null
`custom_points`.

**App side.** `app = rescoreSeasonTotals(served[season], seasonSettings, playersMap)[pid]`;
`appPts = app?.weeklyPoints?.[w]` and `method = app?.weeklyPointsMethod`.

**Row classes** (each row = player × season × week from the Sleeper side):

| Class | Condition |
|---|---|
| `match` | `|appPts − sleeperPts| ≤ 0.01` |
| `diff` | both present, `|Δ| > 0.01` |
| `app-missing-zero` | no `appPts`, `sleeperPts === 0` (benign: rostered, did not play) |
| `app-missing-nonzero` | no `appPts`, `sleeperPts ≠ 0` (defect candidate) |
| `app-no-row` | no season-totals row for the id at all |

**Report:** exact-match rate = `match / (match + diff)`, overall and split by season, by position
(`playersMap[pid].position`; DEF ids are team codes), and by `method` (`exact` vs `scaled`;
`scaled` is the PROVISIONAL heuristic and is expected to diverge). `|Δ|` buckets: `≤0.01`,
`≤0.1`, `≤0.5`, `≤1`, `≤2`, `>2`. Counts for every other class.

**Key attribution** for every `diff` and `app-missing-nonzero` row: fetch Sleeper's current week
stats (`api.sleeper.com/stats/nfl/<season>/<w>?season_type=regular`; the response is a list of
`{ player_id, stats }` — normalise as `normalizeStatsResponse` does, `src/api/sleeperStats.js:14`).
Then:

- `staleKeys` = keys `k` in `seasonSettings` where `live[k] ?? 0 ≠ served.weeklyStats[w][k] ?? 0`,
  each with `(live − served) × multiplier` — data captured before a stat correction, or a key the
  served file pruned.
- `liveScore = calculateFantasyPoints(live, seasonSettings)`; `residual = sleeperPts − liveScore`.
  A nonzero residual means Sleeper's matchup scoring is not the plain dot-product of its own stats
  (custom/position-specific scoring the app does not reproduce).
- Classify each diff row as `stale-capture` (`staleKeys` explain `|Δ|` to 0.01 and residual ≈ 0),
  `scoring-model` (residual ≠ 0), `app-branch` (method `scaled`), or `unexplained`.

Report the 25 largest `|Δ|` rows with their top contributing keys (from `getPointsBreakdown` on
both stat sets), and an aggregate table: `Σ|Δpoints|` by stat key across all diff rows.

**As-run gap (reported, not a defect):** also score 2025 with the **2026** settings — what the app
actually displays for history — and report the mean and max per-week shift vs the 2025-settings
score. This is the by-design "rescore history under today's league settings" behaviour (G8).

### V2 — stats feeding the grades, 2020–2025, regular season

**Reference.** `rebuildPlayerSeasons(gamelogs, season)` sums, per sleeper id, over
`games[]` with `seasonType === 'REG'`: `carries`, `rushingYards`, `rushingTds`, `targets`,
`receptions`, `receivingYards`, `receivingTds`, `attempts`, `completions`, `passingYards`,
`passingTds`, `passingInterceptions`, plus `games` (row count) and a per-team split
(`byTeam[eraTeam(team)]`) for traded players. `rebuildTeamTotals` sums the same per
`eraTeam(normalizeTeamForSchedule(games[].team), season)`. Gamelogs omit unmapped players
(`unmapped` count in the file) — report that count per season as the reference's own floor (G5).
Rates are computed from these summed components only — never sum or average a stored rate
(`racr`, `targetShare`, `wopr` in gamelogs are single-game values; CR-10 trap).

**Population.** Player-seasons whose `playersMap[pid].position ∈ {QB,RB,WR,TE}`, with
`careerStats[season][pid].gamesPlayed ≥ 1` and a gamelogs entry. Report the counts of player-seasons
present on only one side, by position (the unmatched counts are themselves a finding).

**Checks and tolerances** (tolerances are fixed by this plan; Session 2 may not change them —
report the observed distribution regardless so Session 1 can revisit):

| # | App value | Reference | Tolerance |
|---|---|---|---|
| V2.1 | season `stats.rush_att`, `rec_tgt`, `rec`, `pass_att`, `pass_cmp`, `pass_int` | gamelogs sums | `|Δ| ≤ 1` |
| V2.2 | `rush_yd`, `rec_yd`, `pass_yd` | gamelogs sums | `|Δ| ≤ max(5, 1% of ref)` |
| V2.3 | `rush_td`, `rec_td`, `pass_td` | gamelogs sums | exact |
| V2.4 | `computeHistoricalTeamTotals(careerStats, playersMap)` (per-season-team, the App.jsx:282 call) `rushAtt`, `rec`, `recTgt` per team-season | `rebuildTeamTotals` | `|Δ|/ref ≤ 1%`; any ratio in `[1.9, 2.1]` reported separately as `doubling` |
| V2.5 | same, `{ attribution: 'current-team' }` (App.jsx:295) | `rebuildTeamTotals` | reported, not toleranced (G2) |
| V2.6 | `computeHistoricalShares(...)` per-season-team (App.jsx:287): RB share, WR/TE share | RB: carries ÷ team carries; WR/TE: targets ÷ team targets (player's single team) | `|Δ| ≤ 0.010`; also count rows where the app took the `rec ÷ team rec` fallback branch (`rec_tgt` absent/0) — expected 0 in 2020–2025 |
| V2.7 | same, current-team pair (App.jsx:300) | as V2.6 | reported, not toleranced (G2) |
| V2.8 | `computeTeamContext(careerStats, playersMap, S, { attribution: 'current-team' })` for each S (App.jsx:246 uses only the max season) — `carryShare`, `targetShare`, `teamOffense[*].rushAtt/rec` | carryShare: carries ÷ team carries; `targetShare`: **both** reception share (what it computes) and target share (what its name says) | carryShare / reception-share `|Δ| ≤ 0.010`; the target-share gap reported as G1 |
| V2.9 | `computeEfficiencyFactor(pos, careerStats[S][pid].stats, careerStats, playersMap).efficiencyMetrics` — `ypc`, `rushTdRate`, `ypt`, `catchRate`, `ypr`, `recTdRate`, `passerRating`, `completionPct` | the same ratios on gamelogs sums; passer rating via the app's own `passerRating` on gamelogs components (`{ pass_att, pass_cmp, pass_yd, pass_td, pass_int }`) so only the inputs are under test | ypc/ypt/ypr `≤ 0.05`; catchRate/completionPct `≤ 0.005`; TD rates `≤ 0.003`; passerRating `≤ 0.5` |
| V2.10 | `computeUsageFactors(...).rzUsageRate` inputs: per-team Σ `rush_rz_att`, Σ `rec_rz_tgt` (V2.4's `rushRz`, `recRz`) | teamcontext Σ `off.rzRushPlays`, Σ `off.rzPassPlays` over REG games | **consistency only.** Rush side: flag a team-season whose Σ `rush_rz_att` ÷ Σ `rzRushPlays` falls outside `[0.85, 1.15]`. Receiving side: **ratio only, no band and no flag**. `rzPassPlays` counts every red-zone dropback (sacks, scrambles, throwaways), while `rec_rz_tgt` counts only targets, so the ratio sits well below 1 by definition (plan-review measurement: about 0.66–0.90). Report its per-season min/median/max, and list any team-season whose ratio is `> 1.0` (more targets than dropbacks is impossible). The receiving ratio never feeds `outRate` or §6. Plausibility on every player-season: `0 ≤ rate ≤ 1`, `rec_rz_tgt ≤ rec_tgt`, `rush_rz_att ≤ rush_att` (G7) |
| V2.11 | season-totals `gamesPlayed` | `nflverse/snaps/<S>.json` `players[pid].games` | exact |
| V2.12 | season-totals `dnpWeeks` (and the count of `'D'` in `weeklyStatus`) | `eligibleWeeks − snaps.games`, where `eligibleWeeks` = weeks the player is listed in `rosterweekly` with status `ACT`/`INA`/`RES`/`PUP` on a team T whose teamcontext has a `REG` game that week (era-mapped) | exact; report the signed distribution (negative = app undercounts misses) |

`efficiencyMetrics` values are rounded to 3 dp app-side; compare after rounding the reference the
same way. `computeEfficiencyFactor`/`computeUsageFactors` cache cohort tables on `careerStats`
identity — build one `careerStats` (2020–2025 under the snapshot's settings) and reuse it.

**Traded players (G3).** A season-totals row carries one `team`. For player-seasons with more than
one REG team in gamelogs, exclude them from the V2.4/V2.6/V2.8 tolerance rates and report them in
their own table: app share vs per-team reference shares, and how much of the team denominator
their stats moved.

**Rate definition for "out of tolerance".** Per metric, per season: `outRate = out / compared`.

**Snap share** is already validated (r = 0.9995 vs PFR, data-catalog.md snaps row) — skip it.

### V3 — joins, top ~400 players

**Population.** Newest KTC snapshot rows with `position ∈ {QB,RB,WR,TE}`, sorted by `value` desc,
first 400. (Dynasty score is not captured in any served file, so KTC is the relevance ranking.)
Run each app matcher on its **full** input exactly as App.jsx does, then inspect only the outcomes
for these 400:

- `ktcMap = matchKTCToSleeper(ktcRowsAll, playersMap)` (App.jsx:328; the whole snapshot array)
- `drafts = matchNflDraftToSleeper(picksByYear filtered to 2017 ≤ year ≤ currentYear, playersMap)`
  (the filter mirrors `deriveDraftYears`, `src/api/nflDraft.js:41`)
- `college = matchCollegeToSleeper({ receiving, rushing, passing }, playersMap)` with each year's
  file passed through `normalizeCollegeStats` (`src/api/cfbd.js:55`), years 2017–2025

**Ground truth** is `nflverse/playerids.json` `bySleeper[sid]` (`draftYear`, `draftRound`,
`draftPick`, `undrafted`, `college`), plus `playersMap[sid].college`. KTC rows carry no id, so KTC
truth is internal consistency only.

**Reason codes** (a row may carry several; each reported with name, KTC value/rank, sid, and the
evidence):

KTC (`src/utils/ktcMatch.js`) — replicate the lookup keys with a local copy of its private
`normalizeName` (ktcMatch.js:47; it is not exported — copy it verbatim into `v3Joins.mjs` with a
comment naming the source line, and add a test asserting the copy matches 10 sample names'
expected outputs):
- `ktc-unmatched` — no sid in `ktcMap` for this row. Hint: Sleeper skill players sharing the last
  token of the normalised name.
- `ktc-ambiguous-first-taken` — the name|position key had > 1 Sleeper candidate; the matcher took
  `ids[0]` (ktcMatch.js:108; the name|team path does the same at :118).
- `ktc-team-fallback` — matched only by name|team (position key missed); give both positions.
- `ktc-team-disagree` — KTC team ≠ Sleeper `team` after the alias map `{ LVR: 'LV', JAC: 'JAX' }`
  and treating Sleeper `null`/`'FA'` as `FA`.
- `ktc-duplicate-target` — two KTC rows resolve to the same sid (the later overwrites).

Draft (`src/utils/nflDraftMatch.js`):
- `draft-missing` — crosswalk says drafted (`undrafted === false`, `draftYear` 2017+) but no entry
  in `drafts`. Sub-reason by re-probing with the exported `normalizeName`/`normalizeCollege`:
  `position-incompatible` (e.g. Robbie Ouzts: TE in nflverse, RB in Sleeper — the known
  `positionsCompatible` miss), `ambiguous-name`, `name-not-found` (pick name absent from the Sleeper
  name map).
- `draft-disagree` — matched, but year/round/pick ≠ crosswalk.
- `draft-spurious` — matched, crosswalk says undrafted or drafted before 2017.
- `draft-out-of-window` — crosswalk `draftYear < 2017`: expected absence (loader floor), counted,
  not a defect.

College (`src/utils/collegeMatch.js`):
- `college-none` — no seasons matched for a player whose `draftYear` (crosswalk) or
  `playersMap.years_exp` implies a college season in 2017–2025.
- `college-rushing-only` — no seasons matched but the player's normalised name appears in a
  `rushing` file year with no same-name `receiving` row that year: the matcher's Pass 1 is
  receiving-driven and Pass 2 is QB-only (collegeMatch.js:167 Pass 1, :178 Pass 2), so a rushing-only player cannot
  match. Count how many RBs this affects.
- `college-disagree` — a matched season's `team` (normalised) shares no word of length > 3 with
  `normalizeCollege(crosswalk.college)` or `normalizeCollege(playersMap.college)`. Allow transfers:
  flag only when **no** matched season agrees with either source.
- `college-after-draft` — a matched season `year ≥ draftYear` (wrong person).
- `college-name-collision` — the normalised name maps to > 1 CFBD player in a matched year.

---

## 6. Defects, gaps and backlog entries

**Known definitional gaps — listed in the report under their own heading, each with its measured
size, never counted as defects:**

- **G1** `computeTeamContext` `targetShare` = receptions ÷ team receptions (teamContext.js:213);
  measured gap vs true target share.
- **G2** current-team attribution (App.jsx:246, :295, :300) — a player's season stats grouped under
  today's team. Measured: count and size of share errors for players whose `careerStats[S].team`
  differs from `playersMap.team`.
- **G3** one team per player-season for traded players.
- **G4** app team totals count only rows with `gamesPlayed ≥ 1`; current-team mode drops players
  absent from `playersMap`.
- **G5** gamelogs drop unmapped players, so reference team totals run slightly low.
- **G6** Sleeper vs nflverse stat definitions (kneels, laterals, sack attribution) — reported via
  the V2.1–V2.3 distributions, not hidden inside a tolerance.
- **G7** no independent per-player red-zone source is served; V2.10 is consistency-only.
- **G8** history rescored under today's league settings (V1 as-run gap).
- **G9** stat corrections after the season-totals capture (V1 `stale-capture`).
- **G10** first-down derivation uses the current position (`rescoreSeasonTotals`); no effect for
  2022+ seasons.

**Confirmed defect** = one of:
- a V1 `unexplained` or `app-missing-nonzero` row class with ≥ 5 rows, or any `scoring-model` row
  for a QB/RB/WR/TE;
- a V2 metric whose `outRate > 2%` in any season after excluding G3 rows, or any `doubling` team
  total, or any single share error `> 0.05` not explained by G1–G3;
- a V3 reason code other than `draft-out-of-window` hitting any top-400 player, except
  `ktc-team-disagree` alone (a player who changed teams since the scrape is not a join defect).

One backlog entry per confirmed defect (group rows that share one root cause into one entry).
**Route by who owns the fix:** app code → `sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md`
(asks for the app); data-repo code or data → `sleeper-dashboard/.claude/tasks/data-repo-backlog.md`
(asks for the data repo, `### D-NN` format). Entry format, matching the live entries in `data-repo-backlog.md` (e.g. D-75, D-52). The same
template is used in `app-repo-backlog.md`, minus the `D-NN · ` id prefix:

```
### <D-NN · >Short title
**Found:** computed-stats-verification (app `<harness SHA>`, report `verification/<date>-computed-stats-verification.md`) · **Blocking:** yes|no · **Size:** small|medium|large — <one-clause qualifier, optional>

What is wrong, the measured size, the players/seasons affected, and the file:symbol at fault. If the
fix site has a CR-NN mirror, name it.
```

**Blocking = yes** when the defect moves a value that feeds `projectedPPG` or the dynasty score
beyond its tolerance for ≥ 2% of in-scope player-seasons, or breaks a join for any top-100 KTC
player. Otherwise **no**. Session 2 proposes the label; Session 1 confirms it in verification.

A finding that is neither a confirmed defect nor a listed gap goes in the report's
**Unclassified** section with no backlog entry.

---

## 7. Report and sidecar

`verification/<date>-computed-stats-verification.md` — write for an engineer, exact paths and
numbers:

1. Header: date, app harness SHA (marked `local — unpushed at report time`; §9 push sequence fixes it if a rebase changes it), data repo HEAD SHA (+ clean/dirty), snapshot file, KTC file,
   players-map fetch time, CR ids read (D4), exact run command.
2. Summary table: one row per check (V1, V2.1–V2.12, V3 KTC/draft/college) — compared, out of
   tolerance, rate, verdict (`pass` / `defect` / `gap` / `not run`).
3. V1 section (§5 V1 outputs), V2 section (per metric × season table), V3 section (per reason code:
   count, then every row).
4. Known definitional gaps (G1–G10, each measured).
5. Confirmed defects — each with its backlog file and entry title.
6. Unclassified.
7. Not covered: per-player red-zone (needs play-by-play), snap share (already validated), the
   `inSeasonScoring.js` live path's inputs (CR-21; it calls the same `calculateFantasyPoints`, V1
   covers the function only), seasons before 2020.

`…-verification.json` sidecar: `{ schemaVersion: 1, generatedAt, inputs, fetches[], v1: { summary,
rows[] }, v2: { summary, outOfTolerance[], traded[], gaps }, v3: { flagged[] } }`. V1 `rows` holds
every compared row (`season, week, pid, position, sleeperPts, appPts, method, class, staleKeys?,
residual?`). V2/V3 hold only out-of-tolerance / flagged rows plus summaries. If the file exceeds
5 MB, drop V1 `match` rows and say so in `summary`.

Both outputs are unregistered (no `manifest.json` entry), like the existing `verification/` file and
the `backtests/`/`grading/` verdicts.

---

## 8. Tests (app repo, `scripts/verify/__tests__/`)

Fixtures are small inline objects in the test files — **no test reads the data repo or the network**
(data Invariant 10; app tests already never hit the store).

- `v1FantasyPoints.test.mjs` — `compareWeeklyPoints` classifies one row of each class correctly
  (0.01 boundary inclusive for `match`); `attributeKeys` returns the differing key with
  `(live − served) × multiplier` and a zero residual when live stats reproduce the matchup points,
  nonzero when they do not; `bucketDiffs` puts 0.01/0.1/0.5/1/2/2.5 in the right buckets.
- `nflverseRebuild.test.mjs` — `POST` games excluded; a traded player's two teams kept separate in
  `byTeam` and summed in the season total; team totals era-map `LA`/`LV`; rates are never read from
  the input's stored rate fields (fixture sets `targetShare: 99` and asserts it is ignored).
- `v2GradeInputs.test.mjs` — each tolerance rule at its boundary (in and just out); the `doubling`
  ratio band; G3 rows excluded from `outRate` but present in `traded`.
- `v3Joins.test.mjs` — the copied KTC `normalizeName` matches the expected outputs for 10 names
  (incl. `D'Andre Swift`, `Marvin Harrison Jr.`, `Kenneth Walker III`); a two-candidate name|position
  key yields `ktc-ambiguous-first-taken`; a fixture shaped like Ouzts (pick TE, Sleeper RB, crosswalk
  drafted) yields `draft-missing/position-incompatible`; a rushing-only CFBD player yields
  `college-rushing-only`; a 2016 pick yields `draft-out-of-window` and no defect.
- `report.test.mjs` — `renderReport` on a minimal results object contains the summary table header,
  every G1–G10 heading, and `not run` for a skipped check.
- `io.test.mjs` — `assertOutPath` accepts `<data>/verification` and throws for `<data>`,
  `<data>/snapshots`, and an app path; `newestDated` picks the highest date.

Each test asserts behaviour (classification, exclusion, boundary), never only "returns an object".

---

## 9. Order of work

1. App repo: write `scripts/verify/lib/*` + tests; widen `vitest.config.js` include. `npm test`
   green.
2. Write `scripts/verify/computed-stats.mjs`. Dry-run `--only v1 --date <today>` and confirm the
   imports load under vite-node (§4 stop rule).
3. `docs/navigation.md` line. `npm test`, `npm run lint` (0 problems), `npm run build` (clean).
   Commit the harness (message `verify: computed-stats harness (computed-stats-verification)` +
   attribution), **then** `git pull --rebase origin main` in the app repo on the clean tree, so the
   commit sits on top of the current remote. Read the SHA with `git rev-parse HEAD` **after** the
   rebase. The report cites that SHA.
4. In the data repo: `git pull --rebase origin main` (scheduled jobs push to main), then run the full
   harness from the app repo with `--data ../sleeper-dashboard-data --out ../sleeper-dashboard-data/verification`.
5. Classify findings per §6; write backlog entries in both files as routed. The report's
   "Confirmed defects" section names each entry.
6. Data repo: edit the `CLAUDE.md` navigation row; `npm run smoke` and `npm test` green; commit the
   report, sidecar, `CLAUDE.md` and `app-repo-backlog.md`.
7. App repo: commit `data-repo-backlog.md` (if it changed).
8. **Push neither repo in Session 2.** The data commit cites an app SHA that stays local until the
   app is pushed, and the app pushes only after verification is clean (app done-definition step 9).
   Pushing the data repo first would publish a citation to a commit the remote does not have, and a
   later app rebase could rewrite it. This is a deliberate exception to the data repo's
   push-your-own-work rule: the data commits touch only `verification/`, `CLAUDE.md` and a backlog
   file, so holding them cannot conflict with the scheduled jobs.

**Push sequence after human sign-off** (Session 1, or a session it names):
a. App repo: `git pull --rebase origin main`. Read `git rev-parse` of the harness commit and compare
   it with the SHA the report cites. **Do not push yet.**
b. If the SHA changed, fix every citation in this step, before either push: the report header, the
   sidecar `inputs`, and every `**Found:**` line in both backlog files. Commit the
   `data-repo-backlog.md` fix in the app repo (it is still unpushed, so this cannot strand a commit)
   and amend the unpushed data commit for the report/sidecar/`app-repo-backlog.md`. The fix commit
   is a new commit on top, so the harness SHA it cites does not move again.
c. App repo: `git push origin main`. If the push is rejected, return to a; never `--force`.
d. Data repo: `git pull --rebase origin main` (union-resolve `manifest.json` if it conflicts; this
   slice does not touch it); `git push origin main`. Never `--force`.

This applies both repos' "Cross-repo commit IDs" rule: every cited ID is checked after the last
rebase that could move it, and the app is pushed before the data commit that cites it.

---

## 10. Done-definition

- App: `npm test` green incl. the new `scripts/verify/__tests__`; `npm run lint` 0 problems;
  `npm run build` clean; `git diff --stat` for the harness commits shows **no** path under `src/`,
  and no change to `package.json`/`package-lock.json`.
- Data: `npm run smoke` and `npm test` green; `git diff --stat` shows only `verification/`,
  `CLAUDE.md`, `.claude/tasks/app-repo-backlog.md`.
- The report exists, its summary table has a verdict for every check run, and every confirmed defect
  has exactly one backlog entry in the routed file.
- No UI change, so no app smoke.
- Neither repo pushed (§9 step 8); both `git status` show the new commits ahead of `origin/main`.

## 11. Hand-back (to Session 1)

App SHA(s) and data SHA; every file touched in each repo; deviations from this file; what each new
test asserts; the report's summary table pasted verbatim; the list of backlog entries written
(file, title, blocking label); the exact harness command run; any stop-and-report from §4.
Session 1 verifies by reading the diff and spot-checking ≥ 5 V1 rows and ≥ 5 V2 rows of the sidecar
against the raw inputs by hand.

---

## Fix pass 1

**Source:** implementation-reviewer on app `76f456c..c46a0b4` and data `f8e5ce4..3adfd81` (10 flags), plus
one plan error Session 1 found while spot-checking: §5 V2.12's eligible statuses omitted `PUP`.
**Applier:** fix-applier (sonnet), started from the parent folder; it writes both repos. This section
is the whole spec. Anything it does not name stays as it is.

### F1 · Plan correction: PUP counts as an eligible week (V2.12)
- `scripts/verify/lib/v2GradeInputs.mjs` `eligibleWeeks`: `OK` becomes `new Set(['ACT', 'INA', 'RES', 'PUP'])`,
  mirroring data `lib/absence.mjs` `MISSED_ROSTER_STATUSES`. Add a one-line comment naming that source.
- §5 table row V2.12 is already corrected in this file by Session 1. The applier does not edit the task file.

### F2 · V2.12 population and diagnostics
In the V2.11/V2.12 block of `runV2`:
- A player-season with a season-totals row, a `rosterweekly` entry and **no** `snaps` entry is
  compared in V2.12 with `snaps.games = 0`, rather than being dropped. V2.11 is unchanged: no snaps
  entry means no V2.11 comparison, and the row is still counted in `pop.noSnaps`.
- Add `info.dnpBySeason[s]` with these fields:
  - `rowsWithDev`: the number of compared rows with ≥ 1 `DEV` week;
  - `devWeeks`: the total `DEV` weeks across those rows;
  - `devWeeksMarkedD`: the `DEV` weeks whose `weeklyStatus[w−1] === 'D'`;
  - `devToDRate`: `devWeeksMarkedD / devWeeks`;
  - `positive` and `negative`: the counts of rows with delta > 0 and delta < 0.
- For every row with delta < 0, push `{ season, pid, position, app, ref, weeks: [{ w, rosterStatus,
  team, weeklyStatus, gamelogRow: bool }] }` to `info.dnpNegative`. That is one entry per
  `rosterweekly` week, where `gamelogRow` is true if gamelogs has a REG game that week. Do not
  interpret these rows.
- Sidecar: write both under `v2.info`. Report: add a V2.12 diagnostic table with one row per season
  from `dnpBySeason`, and a count of `dnpNegative`.

### F3 · V2.6: test the arithmetic on ex-traded denominators, measure G3 separately
- Delete the `touched` set, the `-g3team` series, and the `g3Team` term in `unexplainedLarge`.
- The toleranced V2.6 series compares
  `computeHistoricalShares(careerExTraded, playersMap, appTotEx)` against reference shares computed
  over `refEx` (ex-traded denominators). Both already exist, from V2.4. Traded players are absent on
  both sides and stay listed in `traded`. A row counts as unexplained-large when it is out of
  tolerance and `|Δ| > 0.05`.
- New report-only series `V2.6-g3effect`, for every non-traded player on a team that a traded player
  touched. It holds the as-run share (`computeHistoricalShares(careerStats, …)` with the
  `historicalTeamTotals` it was given) minus the ex-traded app share. Report the count, the mean
  `|Δ|` and the max `|Δ|` per season. This series is G3's measured size and never feeds a verdict.
- V2.7 (current-team, report-only) is unchanged.

### F4 · V2.8: test computeTeamContext against a current-team reference, measure G1 and G2 separately
- Toleranced series `V2.8`. For season S, the reference groups nflverse gamelog counts the way the
  app does: denominator = Σ over pids with `careerStats[S][pid].gamesPlayed ≥ 1` and
  `refTeam(playersMap[pid].team, S) === T` of their gamelogs `carries` / `receptions`. Numerator =
  the player's own gamelogs count. Compare `carryShare` (RB) and `targetShare` (WR/TE) against the
  carry and reception shares on that reference. Tolerance `|Δ| ≤ 0.010`. Every player in
  `playerShares` that has a gamelogs entry is compared. Traded players are no longer excluded,
  because current-team grouping does not depend on trades. Delete `denomOff`, the `V2.8-g2` and
  `V2.8-g3team` series, and their `ASIDE` entries.
- Report-only `V2.8-g2effect`: per player, the current-team reference share minus the
  true-season-team share (§5's V2.6 reference without the ex-traded change). Report the count with
  `appTeam ≠ season team`, the mean `|Δ|` and the max `|Δ|` per season. This is G2's size.
- G1 (`g1` array): for every WR/TE row compared in V2.8, record the reception share and the target
  share on the **same** current-team reference (Σ `targets` instead of `receptions`). Its size is
  measured on every V2.8 WR/TE row.

### F5 · Verdicts are mechanical; annotations become committed prose only
- `summarizeV2`: delete the `ASIDE` block, along with `mainCompared`, `mainOut`, `mainWorstRate` and
  `asideOut`. For a toleranced check, the verdict is `defect` when any season's rate is > 2%,
  otherwise `pass`. Keep the `doubling` and `unexplainedLarge` overrides to `defect`, and the V2.10
  rule. A series named `*-effect` is excluded from `byCheck`, as `SECONDARY` is today.
- `computed-stats.mjs`: delete `verdictOverrides` (read, store, render). `report.mjs:66` renders
  `s.verdict` only.
- The `--annotations <path>` file has exactly three allowed keys: `defects` (array of
  `{ id, file, title, blocking }`, `blocking ∈ {'yes','no'}`), `unclassified` (array of strings) and
  `notes` (object `{ checkId: string }`). Any other key throws.
  - `report.mjs` renders `notes` under a new heading, **"Session notes (hand-written, not
    computed)"**, one line per check. The summary table's verdict column is never altered.
  - The sidecar embeds the annotations object verbatim under `annotations`, along with its path and
    sha256.
- The annotations file is committed to the data repo at
  `verification/2026-10-18-computed-stats-annotations.json`. The recorded command must name that
  real path; remove the `.replace(/--annotations \S+/, …)` rewrite.

### F6 · Cleanliness covers the inputs, untracked included
`io.mjs` `gitInfo`: drop `--untracked-files=no`. In `computed-stats.mjs`, call it for the data repo
with an **inclusion** pathspec of the input paths: `snapshots`, `ktc`, `nfl/season-totals`,
`nflverse`, `college`, `manifest.json`. Do not use exclusions. An untracked file under those paths
then makes the header read `dirty`.

### F7 · Tests (`scripts/verify/__tests__/v2GradeInputs.test.mjs`)
- Replace the `tallyOutRate (G3)` test. Call `runV2` on a minimal fixture `ctx`: two teams, one
  traded WR whose gamelogs show both teams, two non-traded teammates. Assert that the traded pid
  appears in `traded` and is absent from every V2.6 series row, and that the teammates' V2.6 rows
  are compared on ex-traded denominators. Use exact expected share values, computed by hand in the
  test.
- `summarizeV2` tests:
  - a season at 2.0% gives `pass` and one at 2.1% gives `defect`;
  - `doubling` non-empty forces V2.4 to `defect`;
  - V2.10 with `over1` non-empty gives `gap`;
  - a `*-effect` series never changes a verdict.
- `eligibleWeeks` counts a `PUP` week and does not count a `DEV` week.
- `report.test.mjs`: an annotations object with `notes` renders the "Session notes" heading, and
  the summary verdict equals the computed one. An annotations object with a `verdictOverrides` key
  throws.
- `io.test.mjs` is untouched. Do not test `gitInfo` against a real repo.

### F8 · Re-run
Re-render with the same inputs. Data HEAD has not changed since the run (`f8e5ce4` is the last
non-slice commit; check this, and stop and report if `git log f8e5ce4..HEAD` contains anything other
than `3adfd81`).

```bash
node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- --data ../sleeper-dashboard-data \
  --out ../sleeper-dashboard-data/verification --date 2026-10-18 --no-fetch
```

Run it first **without** `--annotations`. Read the summary, then write the annotations file (F5)
and the backlog changes (F9) from the new numbers, and run once more with
`--annotations ../sleeper-dashboard-data/verification/2026-10-18-computed-stats-annotations.json`.
Overwrite both outputs. If `--no-fetch` misses the cache, stop and report; do not refetch.

### F9 · Backlog entries, from the re-run numbers only
Every entry keeps the §6 template exactly: `**Blocking:** yes` or `no` and nothing else, with any
qualifier moved to the body.
- **V2.4 / V2.9 / V2.6 / V2.8:** every one whose re-run verdict is `defect` gets a backlog entry
  under §6 routing. The cause is "not established". List the out-of-tolerance cells (season, metric
  and the worst 5 rows from the sidecar) and the `file:symbol` that computes the value. If a re-run
  verdict is `pass`, write no entry.
- **D-76** (rewrite in place):
  - Restate the size from the re-run V2.12 with PUP, including the zero-snaps rows.
  - Add the per-season `dnpBySeason` table.
  - State the DEV → `'D'` cause **only for the seasons whose `devToDRate` ≥ 0.5**. List any other
    season (2020 expected) under "Open: why season S does not show it", giving its `devToDRate`.
  - Restrict the proposed rewrite range to the seasons where the cause is stated.
  - Give the `dnpNegative` count with "unexamined; per-week detail in sidecar `v2.info.dnpNegative`".
  - Keep `**Blocking:** yes` only if, after PUP, the rate is still > 2% in any season; otherwise `no`.
- **D-77** (rewrite in place):
  - Set `**Blocking:** yes` if any season's re-run V2.11 rate is > 2%, otherwise `no`, and move the
    "borderline" wording into the body.
  - Replace the "likely definitional" cause with "cause not established". Keep the pid `2342`
    example and add its per-week evidence: the `weeklyStatus` `P` weeks, the gamelogs REG weeks, and
    `rosterweekly` status for weeks 1–5.
- **App-repo "Name-only matchers…" entry:** remove Travis Hunter from it. Add a separate entry for
  him: print `playersMap[<his sid>].position` and `fantasy_positions` from the cached players map;
  the root cause is the matchers' skill-position guard, quoted from what that prints. Blocking under
  §6's top-100 rule (he is rank 234 → `no`, unless a top-100 player shares the cause).
- No other entry changes, beyond a SHA citation update if the harness SHA changes (F10).

### F10 · Commits (no pushes)
- **App repo:** one commit for the harness fixes (`verify: fix pass 1 (computed-stats-verification)` +
  attribution), then `git pull --rebase origin main`, then read the SHA. A second commit holds the
  `data-repo-backlog.md` rewrites, citing the new harness SHA as "app `<sha>` (fix pass 1)".
- **Data repo:** one new commit on top of `3adfd81`. It holds the re-rendered report and sidecar,
  the annotations file and the `app-repo-backlog.md` changes; every citation in it names the new
  harness SHA. Do not amend `3adfd81`.
- Push neither repo.

### Leave alone
V1 and V3 logic, apart from the backlog wording above. Tolerances. The `--annotations` flag's
existence. Every other backlog entry. `src/`, `package.json`, `eslint.config.js`. This task file.

### Done
App `npm test`, `npm run lint` and `npm run build`; data `npm run smoke` and `npm test`. The
fix-applier hand-back format applies, with these additions: the new summary table verbatim, the
`dnpBySeason` table, and every backlog entry added, rewritten or removed.

---

## Fix pass 2 (manual follow-up, approved by Anton 2026-10-18; no further review round)

**Source:** the single re-review of Fix pass 1. Anton approved fixing re-review flags 1–3 (wording)
and 6–7 (tests). Flags 4 and 5 are recorded as known gaps and are **not** changed here:
- flag 4: the V2.8 half of the `unexplainedLarge` override is dead code;
- flag 5: `fallbackBranch` now counts ex-traded rows only.

**Applier:** fix-applier (sonnet), started from the parent folder. This section is the whole spec.

### P1 · V2.9 wording and blocking rationale
- In the data repo's `.claude/tasks/app-repo-backlog.md`, the V2.9 entry's heading becomes
  `V2.9 efficiency inputs differ from gamelogs ratios: 72 comparisons across 36 player-seasons (cause not established)`.
- Add one sentence to its body, after the "72 of 10,728 comparisons" sentence: the 72 out
  comparisons are 36 distinct player-seasons (2020 7, 2021 13, 2022 7, 2023 2, 2024 5, 2025 2).
  That is about 1.8% of in-scope RB/WR/TE player-seasons across 2020–2025, so `Blocking: no` under
  §6, which counts in-scope player-seasons across the slice. 2021 alone is 13 of 356 (3.7%).
  Quote the in-scope denominator the sidecar gives; if it gives none, keep "about 1.8%" and say
  "≈2,048".
- In `verification/2026-10-18-computed-stats-annotations.json`, `defects[id=APP-7].title` takes the
  same text as the new heading.

### P2 · V2.4 note
In the annotations file, `notes["V2.4"]` becomes exactly this:
"Verdict is the mechanical 2% rule. With 32 teams, any single team out of tolerance is 3.1% of a
season-metric cell, so 7 cells exceed 2%: 2021 rec (1), 2021 recTgt (1), 2022 rushAtt (1),
2022 rec (1), 2025 rushAtt (2), 2025 rec (3), 2025 recTgt (2). That is 11 team-metric cells in all,
each with the app total above the rebuild. Cause not established; see backlog entry APP-5."

### P3 · Test: V2.8 current-team reference
In `scripts/verify/__tests__/v2GradeInputs.test.mjs`, extend the existing `runV2` fixture, or add a
second minimal one, so that it shows each of the following:
- `V2.8` rows are compared against a denominator summed only over pids with `gamesPlayed ≥ 1` whose
  `playersMap` team is T. Include one `gamesPlayed: 0` teammate whose gamelogs carries must **not**
  enter the denominator.
- A traded player **is** compared in `V2.8`, and is absent from `V2.8-g2effect`.
- A non-traded player whose `playersMap.team` differs from the season team appears in
  `V2.8-g2effect`.
- G1: for a WR, the `g1` entry's reception share and target share both use the same current-team
  reference.

Assert exact hand-computed values, written in the test.

### P4 · Test: F2 games-missed behaviour
In the same file, with a fixture whose `ctx` holds one season:
- A player with a season-totals row and a `rosterweekly` entry but **no** `snaps` entry is
  compared in `V2.12` with `snaps.games = 0`: assert its `ref` equals its eligible-week count. It is
  absent from `V2.11`.
- `info.dnpBySeason[s]` gives exact `rowsWithDev`, `devWeeks`, `devWeeksMarkedD`, `devToDRate`,
  `positive` and `negative`. The fixture needs one DEV player whose DEV weeks are `'D'` in
  `weeklyStatus`, plus one negative-delta row.
- The negative row appears in `info.dnpNegative` with a `weeks` array of `{ w, rosterStatus, team,
  weeklyStatus, gamelogRow }`.

If a fixture shows that `runV2` behaves differently from F2 or F4 as written, **stop and report**.
Do not change `lib/` code in this pass.

### P5 · Order, citations, re-render
1. **App:** add the P3/P4 tests. `npm test`, `npm run lint` and `npm run build` must be green.
   Commit as `verify: fix pass 2 tests (computed-stats-verification)` + attribution, then
   `git pull --rebase origin main`, then read the new SHA `T`.
2. **Data:** apply P1 and P2. In both backlog files and the annotations file, replace every
   `c49ad11` citation with `T`, writing it as "app `T` (fix pass 2)". Then re-render:
   `--date 2026-10-18 --no-fetch --annotations ../sleeper-dashboard-data/verification/2026-10-18-computed-stats-annotations.json`.
   The report header must show `T`. The summary table must be identical to Fix pass 1's; if it is
   not, stop and report.
3. **Commit:** a new data commit on top of `89966e3` with the report, sidecar, annotations and
   `app-repo-backlog.md`. A new app commit with `data-repo-backlog.md` (citations only). Push
   nothing.

### Leave alone
All `lib/` and `computed-stats.mjs` code. Every other backlog entry's content. This task file.

### Done
App `npm test`, `npm run lint` and `npm run build`; data `npm test`. Hand back in the fix-applier
format, plus: `T`, the new data SHA, and a statement that the summary table is unchanged.
