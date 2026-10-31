# Market window stats · Slice A — per-window stats, metric registry, position ranks (data layer only)

**Review depth: full** — no scoring or `factors` change, but the slice reads the live season's rows beside
`careerStats` (the isolation contract `currentSeasonTotalsIsolation.test.js` guards) and reads CR-02 rows
(`TEAM_*`/DEF exclusion) and CR-11 keys (`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`). Unsure → full.

Session 1: opus, medium. Session 2: **sonnet**, medium.

---

## 0. What this is, for Anton

A tested calculator that, for any time window — this season so far, one past season, the last three, or a
whole career — gives every NFL QB/RB/WR/TE their real stats (yards, TDs, rates, shares, snap %, fantasy
points on your league's scoring) and where they rank at their position. Nothing on screen changes in this
slice; Slices B/C draw it. Rates are always rebuilt from the summed raw counts, never averaged.

## 1. Scope

In: two new pure modules, their unit tests, one view-only guard test, one docs row each.
Out: any UI or component change, the window selector, EPA/CPOE (Slice C), filters, localStorage, games missed.
`Market.jsx`, `Market.test.jsx`, `App.jsx` and `currentSeasonTotalsIsolation.test.js` are not touched.

## 2. Touch list

| File | Change |
|---|---|
| `src/utils/marketWindowStats.js` | **new** — `availableWindows`, `defaultWindow`, `buildWindowStats`, `WINDOW_TOTAL_KEYS` |
| `src/utils/marketMetrics.js` | **new** — `MARKET_METRICS`, `rankWindow` |
| `src/utils/marketWindowStats.test.js` | **new** |
| `src/utils/marketMetrics.test.js` | **new** |
| `src/__tests__/marketWindowStatsViewOnly.test.js` | **new** — guard (§6) |
| `docs/nav/utils.md` | two new rows; `efficiencyMetrics.js` row reuser list (§8) |
| `src/utils/efficiencyMetrics.js` | **comment only** — line 31's reuser list (§8); no code change |

Nothing else. If implementation seems to need another file, stop and report.

## 3. Planner checks (done 2026-10-31 against `../sleeper-dashboard-data` on disk, `nfl/season-totals/*.json`, and its `raw/-players-nfl.json` directory dump as a stand-in for `playerMap`)

Skill = `playerMap` position ∈ QB/RB/WR/TE and `gamesPlayed ≥ 1`.

1. **Snap coverage.** `off_snp` is **absent from every row 2012–2019** (0 skill rows carry it); `tm_off_snp`
   is present every season. 2020+: 2025 604/635 skill rows carry `off_snp`, 2026 (live, through week 8)
   527/565. Consequence: an "absent key = 0" reading would give every pre-2020 player a 0 % snap share —
   §4.4's tracked-key rule exists for this.
2. **`rush_btkl`** is absent from every row 2012–2014. All other 23 keys in §4.3 are present in every
   season 2012–2026. All 25 keys exist in `src/__fixtures__/season-totals-2025.json` (field-existence rule).
3. **Team/DST rows.** Every file has 64 team-like rows: `TEAM_<abbr>` (whole-team aggregates; e.g.
   `TEAM_DAL` 2025 carries `rush_att` 465) and bare-abbr DEF rows (`DAL`, no offensive keys). `TEAM_*` ids are
   not in `playerMap`; bare abbrs are, with position `DEF`. The position filter excludes both; `buildTeamShareTotals`
   already excludes `TEAM_*` from denominators by `playerMap` membership (CR-02: `TEAM_*` never summed).
4. **`playerMap` coverage.** `playerMap` is the full Sleeper `/players/nfl` directory (`getAllPlayers`, App.jsx:947),
   not rostered players. Rows with gp ≥ 1 missing from the (May 2026) dump: 1 in 2012, 0 in 2016–2025,
   2 in 2026 (players added after the dump; the live directory carries them). **No material gap.** Rule
   stays: a pid absent from `playerMap` is excluded (no position = no pool), never guessed, matching
   `buildTeamShareTotals`.
5. **Pool is not roster-limited.** `careerStats` seasons served from the data store are the whole file
   (`getSeasonTotals` data-store path returns `dsResult` unfiltered); `activePlayerIds` filters only the
   live-API fallback path. The live season is the whole file too.
6. **`weeklyStatus`** on 2026 rows marks unplayed future weeks `X` (sample: `P,D,D,D,D,B,P,X…X`). Not read by
   this slice; games missed is out of scope.
7. **Fantasy points basis.** Both sources are rescored by `rescoreSeasonTotals` (`src/api/sleeperStats.js:329`):
   `loadCareerHistory` per season (:443) and `loadCurrentSeasonTotals` (:417, :426), each with the league's
   `scoringSettings`. Rescored rows carry `scoringBasis: 'league'`. **Exception:** with empty/absent
   `scoringSettings` the seam returns rows unchanged (Sleeper half-PPR). So `fp` is league-basis whenever the
   league has scoring settings; `WindowStats.leagueScored` (§4.3) reports it per player rather than assuming it.
8. **Live-season gate.** Both `usableLiveSeason` copies are unimportable from a new module: `inSeasonEvidence`
   may be imported only by `Market.jsx` and `inSeasonScoring` only by `App.jsx`/`api/frozenPrior.js`
   (`inSeasonEvidenceViewOnly.test.js`). A third copy is rejected. **Deviation from the brief:** the window
   functions take a precomputed `liveUsable: boolean`; Market (Slice B) computes it as
   `usableLiveSeason(currentSeasonTotals, deriveDataSeason(careerStats))` from the `inSeasonEvidence` import it
   already has.
9. **Red-zone denominators.** `buildTeamShareTotals` sums only `rushAtt, rec, recTgt, recAirYd` and is not
   changed. Red-zone team totals come from `teamContext.computeHistoricalTeamTotals` — the builder the
   pop-up's RZ share already uses (`usageEfficiency.buildRzShareSeries`), so Market and the pop-up agree for
   the same player-season. It keeps directory-absent ids (unbiased for older seasons) and excludes `TEAM_*` by
   id. Its keys are `row.team` (per-season-team attribution); `buildRzShareSeries` looks them up with
   `resolvePlayerTeam`, and this slice does the same. Verified identical on the served domain: every gp ≥ 1
   row in 2014/2025/2026 carries a `team` (no fallback to `playerMap.team`), and rows already carry `LA`/`STL`
   (not `LAR`), so `resolvePlayerTeam`'s normalisation is an identity there (as `playerTeam.js` documents).
   Importing a projection module from a view module is the allowed direction (guards forbid only the reverse).

## 4. `src/utils/marketWindowStats.js`

Header comment: view-only; never feeds `projectedPPG`, the dynasty score, any `factors` entry or a snapshot;
pure; never writes into `careerStats`, `currentSeasonTotals` or any row (guarded by
`marketWindowStatsViewOnly.test.js` and the frozen-input tests). Sum components then divide (CR-10's rule).

Imports — exactly these four:
```js
import { passerRating } from './efficiencyMetrics'
import { buildTeamShareTotals } from './outlookPositionStats'
import { resolvePlayerTeam } from './playerTeam'
import { computeHistoricalTeamTotals } from './teamContext'
```

Comments in this module never spell the names of the Market-only or scoring-seam in-season modules; refer to
them as "the Market-only in-season module" / "CR-25's opportunity definition". (§6 checks specifiers, not
text, but keep the source clean anyway.)

```js
const SKILL = ['QB', 'RB', 'WR', 'TE']
export const WINDOW_TOTAL_KEYS = [
  'pass_att','pass_cmp','pass_yd','pass_td','pass_int','pass_sack','pass_air_yd',
  'rush_att','rush_yd','rush_td','rush_yac','rush_btkl','rush_rz_att',
  'rec_tgt','rec','rec_yd','rec_td','rec_air_yd','rec_rz_tgt','rec_drop',
  'fum_lost','rush_fd','rec_fd','off_snp','tm_off_snp',
]
```

### 4.1 `availableWindows({ careerStats, currentSeasonTotals, liveUsable })`

→ `Array<{ id: string, kind: 'live'|'season'|'last3'|'career', seasons: number[], label: string }>`, in this order:

- `completed` = `Object.keys(careerStats ?? {}).map(Number).filter(Number.isFinite)` sorted **descending**.
- `S = currentSeasonTotals?.season`; live entries only when `liveUsable === true` (strict) **and** `Number.isFinite(S)`.
- live: `{ id: 'live', kind: 'live', seasons: [S], label: \`${S} so far\` }`
- each `y` of `completed`: `{ id: String(y), kind: 'season', seasons: [y], label: String(y) }`
- last3: `{ id: 'last3', kind: 'last3', seasons, label: 'Last 3 seasons' }` with `seasons = live ? [S, ...completed.slice(0, 2)] : completed.slice(0, 3)`
- career: `{ id: 'career', kind: 'career', seasons: live ? [S, ...completed] : completed, label: 'Career' }`
- `seasons` arrays are descending. last3 and career are emitted only when their `seasons` is non-empty;
  with no completed seasons and no live season the result is `[]`.

`liveUsable` is the caller's `usableLiveSeason(...)` result (§3.8). This module never re-derives it.

### 4.2 `defaultWindow(windows)`

`windows.find(w => w.kind === 'live') ?? windows.find(w => w.kind === 'season') ?? null`. (The first `season`
entry is the latest completed season because of §4.1's order.)

### 4.3 `buildWindowStats({ window, careerStats, currentSeasonTotals, playerMap })` → `Map<pid, WindowStats>`

**Row source per season `y` of `window.seasons`** — `rowsFor(y)`:
`careerStats?.[y]` if present; else `currentSeasonTotals.players ?? {}` when `currentSeasonTotals?.complete === true`
and `currentSeasonTotals.season === y`; else `{}`. Let `pm = playerMap ?? {}` and use `pm` everywhere below,
including the calls into `buildTeamShareTotals` / `computeHistoricalTeamTotals` (neither null-guards its
`playerMap` or season object). Null `careerStats`, null `playerMap`, null `currentSeasonTotals` or a `complete`
live result without `players` all return an empty `Map` (or partial data), never throw. Build one **new local object**
`sources = { [y]: rowsFor(y) }` over the window's seasons. `sources` references the original row objects;
nothing is ever assigned into `sources[y]`'s rows, `careerStats` or `currentSeasonTotals`.

**Tracked keys per season** (§3.1/§3.2): `tracked[y]` = Set of `WINDOW_TOTAL_KEYS` present (key in `row.stats`)
on at least one row of `sources[y]` whose `playerMap` position is in `SKILL` and `gamesPlayed ≥ 1`. A key
absent from a row of a season where it is tracked counts as 0 (Sleeper omits zeros); a key in a season
where it is untracked contributes nothing, to numerator **or** denominator.

**Pool:** every pid in any `sources[y]` with `SKILL.includes(playerMap?.[pid]?.position)`, keeping only
season-rows with `gamesPlayed ≥ 1`; a pid with no such row in the window gets no entry. Position is the
current `playerMap` position for every season (a converted player ranks under his current position).

**WindowStats** (all numbers raw, unrounded; `null` never `0` for a missing value):

```
{
  pid, position,
  team,            // raw row.team of the latest window season he played (gp ≥ 1), or null
  seasons,         // number[] descending — window seasons where he has gp ≥ 1
  gp, gs,          // Σ gamesPlayed, Σ (gamesStarted ?? 0)
  fp,              // Σ fantasyPoints (non-finite → contributes 0)
  fpPerG,          // fp / gp
  leagueScored,    // true iff every contributing row has scoringBasis === 'league'
  totals: { [k of WINDOW_TOTAL_KEYS]: number | null },   // null iff k untracked in all his seasons
  rates:  { cmpPct, ypa, passTdRate, intRate, sackRate, passerRating, passAdot,
            ypc, yacoPerAtt, btklRate,
            catchPct, ypr, ypt, aDOT, dropRate },
  usage:  { snapPct, snapSeasons, tgtShare, carryShare, aySh, rzTgtShare, rzRushShare, oppPerG },
  basisGp: { [rateOrUsageKey]: number },  // Σ gamesPlayed over the seasons that value rests on (see below)
}
```

**Rates — aligned sums.** For a rate over component keys `K`, sum each component over only those of his
seasons where **every** key of `K` is tracked; null when that set is empty or the denominator sum ≤ 0.
`basisGp[rate]` = Σ gamesPlayed over that same season set (0 when empty). For most rates this equals `gp`;
it differs for `btklRate` (2015+) and `snapPct` (2020+), and `rankWindow` floors on it (§5.2).
Fractions stay fractions (0.65, not 65). Definitions:

| rate | formula |
|---|---|
| `cmpPct` | pass_cmp / pass_att |
| `ypa` | pass_yd / pass_att |
| `passTdRate` | pass_td / pass_att |
| `intRate` | pass_int / pass_att |
| `sackRate` | pass_sack / (pass_att + pass_sack) |
| `passerRating` | `passerRating({ pass_att, pass_cmp, pass_yd, pass_td, pass_int })` on the aligned sums |
| `passAdot` | pass_air_yd / pass_att |
| `ypc` | rush_yd / rush_att |
| `yacoPerAtt` | rush_yac / rush_att (Sleeper `rush_yac` = yards after contact) |
| `btklRate` | rush_btkl / rush_att |
| `catchPct` | rec / rec_tgt |
| `ypr` | rec_yd / rec |
| `ypt` | rec_yd / rec_tgt |
| `aDOT` | rec_air_yd / rec_tgt |
| `dropRate` | rec_drop / rec_tgt |

Stored `cmp_pct`, `rush_ypa`, `pass_rtg` (and any other stored rate) are never read.

**Usage.**
- `snapPct` = Σ off_snp / Σ tm_off_snp over his seasons where `off_snp` and `tm_off_snp` are both tracked;
  null when that set is empty or Σ tm_off_snp ≤ 0. `snapSeasons` = the count of seasons in that set (so
  Slice B can say "2020+ only" on a career window); `basisGp.snapPct` = Σ gp over it.
- `oppPerG` = (QB: pass_att + rush_att; RB/WR/TE: rush_att + rec_tgt) ÷ gp, from the window totals — Σ/Σgp,
  never a mean of per-season values (null-as-0 within totals since all four keys are tracked every season).
  Same definition as the Market-only in-season module's `opportunitiesPerGame` (CR-25), duplicated because
  that module may not be imported here; the comment cites "CR-25's opportunity definition" without naming it.
  `fpPerG` likewise = Σ fp / Σ gp.
- Shares — Σ player ÷ Σ team over his (season, team) pairs:
  for each of his seasons `y`: `team = resolvePlayerTeam({ careerStats: sources }, pid, y)`; skip the season
  for that share when `team` is null, the numerator key is untracked in `y`, or the team denominator for
  `(y, team)` is absent or ≤ 0; otherwise add his numerator and that team's denominator. Null when nothing was
  added. `basisGp[share]` = Σ gp over the seasons added.

  | share | numerator | denominator (per season, team) |
  |---|---|---|
  | `tgtShare` | rec_tgt | `teamShare[y][team].recTgt` |
  | `carryShare` | rush_att | `teamShare[y][team].rushAtt` |
  | `aySh` | rec_air_yd | `teamShare[y][team].recAirYd` |
  | `rzTgtShare` | rec_rz_tgt | `rz[y][team].recRz` |
  | `rzRushShare` | rush_rz_att | `rz[y][team].rushRz` |

  `teamShare = buildTeamShareTotals(sources, pm)` and `rz = computeHistoricalTeamTotals(sources, pm)`
  (default `per-season-team` attribution) — **one call each**, covering the live season because `sources`
  holds it under `S`. The two builders gate differently (playerMap membership vs keep-retired-ids); that
  mirrors the pop-up exactly (its target/carry/AY shares use the first, its RZ share the second) and is
  deliberate — do not unify them here.

  A mid-season trade: a Sleeper season row carries one `team`, so a traded player's whole season is
  attributed to that team — the same limitation every existing share in the app has. Do not try to fix it.

## 5. `src/utils/marketMetrics.js`

No imports. Header: view-only, pure.

### 5.1 `MARKET_METRICS`

`Array<{ id, label, positions: string[], kind: 'total'|'perGame'|'rate', value: ws => number|null,
format: v => string, better: 'high'|'low', minVolume?: { stat, perGame }, basis?: string }>`.

`basis` is set on every `rate` metric that reads `ws.rates.<k>` or `ws.usage.<k>` (k = the key it reads, e.g.
`snapPct`, `btklRate`, `tgtShare`); it names the `ws.basisGp` entry the gp floor uses. Metrics without `basis`
floor on `ws.gp`. Every `better: 'low'` metric is a `rate` (no low-is-better totals — a total that rewards
"fewer" ranks one-game players first).

`format` returns `'—'` for null/non-finite. Formatters (module-private): `int` (Math.round), `dec1`
(toFixed(1)), `dec2` (toFixed(2)), `pct1` (`(v*100).toFixed(1) + '%'`), `rating` (toFixed(1)).
`value` reads WindowStats only; totals read `ws.totals[k]` (null stays null); per-game = total ÷ `ws.gp`
(null if the total is null).

Planner-set volume floors: `PASS = { stat: 'pass_att', perGame: 14 }`, `RUSH = { stat: 'rush_att', perGame: 6 }`,
`TGT = { stat: 'rec_tgt', perGame: 3 }`.

| id | label | positions | kind | value | format | better | minVolume |
|---|---|---|---|---|---|---|---|
| `fp` | FP | all | total | ws.fp | dec1 | high | |
| `fpPerG` | FP/G | all | perGame | ws.fpPerG | dec1 | high | |
| `passYd` | Pass Yd | QB | total | pass_yd | int | high | |
| `passYdPerG` | Pass Yd/G | QB | perGame | pass_yd/gp | dec1 | high | |
| `passTd` | Pass TD | QB | total | pass_td | int | high | |
| `cmpPct` | Cmp% | QB | rate | rates.cmpPct | pct1 | high | PASS |
| `ypa` | Y/A | QB | rate | rates.ypa | dec1 | high | PASS |
| `passTdRate` | TD% | QB | rate | rates.passTdRate | pct1 | high | PASS |
| `intRate` | INT% | QB | rate | rates.intRate | pct1 | low | PASS |
| `sackRate` | Sack% | QB | rate | rates.sackRate | pct1 | low | PASS |
| `passerRating` | Rating | QB | rate | rates.passerRating | rating | high | PASS |
| `passAdot` | aDOT | QB | rate | rates.passAdot | dec1 | high | PASS |
| `rushAtt` | Car | QB,RB | total | rush_att | int | high | |
| `rushYd` | Rush Yd | QB,RB,WR | total | rush_yd | int | high | |
| `rushYdPerG` | Rush Yd/G | QB,RB | perGame | rush_yd/gp | dec1 | high | |
| `rushTd` | Rush TD | QB,RB | total | rush_td | int | high | |
| `ypc` | Y/C | QB,RB | rate | rates.ypc | dec1 | high | RUSH |
| `yacoPerAtt` | YACo/Att | RB | rate | rates.yacoPerAtt | dec2 | high | RUSH |
| `btklRate` | Brk Tkl% | RB | rate | rates.btklRate | pct1 | high | RUSH |
| `tgt` | Tgt | RB,WR,TE | total | rec_tgt | int | high | |
| `tgtPerG` | Tgt/G | RB,WR,TE | perGame | rec_tgt/gp | dec1 | high | |
| `rec` | Rec | RB,WR,TE | total | rec | int | high | |
| `recYd` | Rec Yd | RB,WR,TE | total | rec_yd | int | high | |
| `recYdPerG` | Rec Yd/G | RB,WR,TE | perGame | rec_yd/gp | dec1 | high | |
| `recTd` | Rec TD | RB,WR,TE | total | rec_td | int | high | |
| `catchPct` | Catch% | RB,WR,TE | rate | rates.catchPct | pct1 | high | TGT |
| `ypr` | Y/R | RB,WR,TE | rate | rates.ypr | dec1 | high | TGT |
| `ypt` | Y/Tgt | RB,WR,TE | rate | rates.ypt | dec1 | high | TGT |
| `aDOT` | aDOT | WR,TE | rate | rates.aDOT | dec1 | high | TGT |
| `dropRate` | Drop% | RB,WR,TE | rate | rates.dropRate | pct1 | low | TGT |
| `scrimYd` | Scrim Yd | all | total | rush_yd + rec_yd | int | high | |
| `scrimYdPerG` | Scrim Yd/G | all | perGame | (rush_yd + rec_yd)/gp | dec1 | high | |
| `totalTd` | TD | all | total | pass_td + rush_td + rec_td | int | high | |
| `firstDowns` | 1st Dn | RB,WR,TE | total | rush_fd + rec_fd | int | high | |
| `oppPerG` | Opp/G | all | perGame | usage.oppPerG | dec1 | high | |
| `snapPct` | Snap% | RB,WR,TE | rate | usage.snapPct | pct1 | high | |
| `tgtShare` | Tgt Share | RB,WR,TE | rate | usage.tgtShare | pct1 | high | |
| `carryShare` | Carry Share | QB,RB | rate | usage.carryShare | pct1 | high | |
| `aySh` | AY Share | WR,TE | rate | usage.aySh | pct1 | high | |
| `rzTgtShare` | RZ Tgt Share | RB,WR,TE | rate | usage.rzTgtShare | pct1 | high | |
| `rzRushShare` | RZ Car Share | QB,RB | rate | usage.rzRushShare | pct1 | high | |

"all" = `['QB','RB','WR','TE']`. A sum of totals (`scrimYd`, `totalTd`, `firstDowns`) is null only when every
addend is null; a null addend otherwise counts 0. Ids are unique (test).

### 5.2 `rankWindow(statsById, metrics = MARKET_METRICS)` → `{ [pid]: { [metricId]: { rank, of } | null } }`

- `maxGp` = max `ws.gp` over **all** of `statsById` (all positions). `gpFloor = Math.ceil(0.5 * maxGp)`.
- For each metric and each position in `metric.positions`, the eligible set is players of that position where:
  `value(ws)` is finite; for `perGame`/`rate`, `g ≥ gpFloor` where `g = metric.basis ? (ws.basisGp[metric.basis] ?? 0) : ws.gp`;
  with `minVolume` (rates only), `(ws.totals[minVolume.stat] ?? 0) / ws.gp ≥ minVolume.perGame`. Totals have no floor.
  `gpFloor` stays derived from window-wide `ws.gp` — only the player's own side of the comparison uses `basisGp`.
- Competition ranking: `rank = 1 + count of eligible same-position players strictly better`
  (`>` for `high`, `<` for `low`), on raw unrounded values. `of` = eligible count. Ties share a rank (1,2,2,4).
- Every pid in `statsById` gets an entry; every metric id gets a key; ineligible or not-applicable-to-position
  → `null`.

INT, sacks and fumbles lost are offered only as rates (`intRate`, `sackRate`) — no "fewer is better" totals.
Fumbles lost has no rate metric in A (`totals.fum_lost` is still built for B to display).

## 6. Guard — `src/__tests__/marketWindowStatsViewOnly.test.js`

Style of `twoYearBaselineViewOnly.test.js`. `PIPELINE` = that file's list verbatim (it includes
`projectionSnapshot.js`, `inSeasonScoring.js`, `dynastySignalBadges.js`, `App.jsx`). For each: the file's
module specifiers (use the `MODULE_SPEC_RE` extractor from `inSeasonEvidenceViewOnly.test.js`) contain no
`marketWindowStats` or `marketMetrics`. Plus — all three on **module specifiers only**, never source text:
- `marketWindowStats.js` imports exactly `['./efficiencyMetrics', './outlookPositionStats', './playerTeam', './teamContext']` (sorted compare).
- `marketMetrics.js` imports nothing.
- Neither module has a specifier matching `/inSeasonEvidence|inSeasonScoring|\/api\//`.

## 7. Tests

Fixtures are small hand-built objects in the test files (no JSON fixture). Every test that calls
`buildWindowStats` deep-freezes `careerStats`, `currentSeasonTotals` and `playerMap` first (a recursive
`Object.freeze` helper) — any write throws in ESM strict mode — and additionally asserts
`JSON.stringify(careerStats)` is unchanged and has no key for the live season.

`marketWindowStats.test.js`:
1. **Rates recomputed, not averaged** — QB, 2 seasons: 2024 `pass_cmp 10, pass_att 20` (50 %), 2025
   `pass_cmp 90, pass_att 100` (90 %); `cmpPct` = 100/120 ≈ 0.8333 (`toBeCloseTo`), not 0.70. Same shape for
   `ypc`, and `passerRating` equals `passerRating(` the summed components `)`.
2. **Stored rates ignored** — rows carry `cmp_pct: 999`, `pass_rtg: 999`, `rush_ypa: 999`; results unaffected.
3. **Live window presence** — `liveUsable` derived in the test by `usableLiveSeason` imported from
   `../utils/inSeasonEvidence` (test files are outside the importer guard): `complete: true, season: 2026`
   with `careerStats` max 2025 → `live` first; `complete: false` → no `live`; `season: 2025` → no `live`.
4. **Window seasons** — completed {2023,2024,2025}, live 2026: last3 = [2026,2025,2024], career = [2026,2025,2024,2023];
   no live: last3 = [2025,2024,2023], career = [2025,2024,2023]. Order of the list: live, 2025, 2024, 2023, last3, career.
   `defaultWindow` → live when present, else `'2025'`; `[]` → null.
5. **Live rows read from `currentSeasonTotals`** — a live window's stats equal the live row's; a `season`
   window for 2025 does not include them.
6. **Share denominators per (season, team) with a mid-window team change** — player P: 2024 on `KC`
   (`rec_tgt 50`; team KC total 500), 2025 on `BUF` (`rec_tgt 100`; team BUF total 400; KC 2025 total 600 and
   must not be used). Last-2 window `tgtShare` = 150/900. Team totals built from teammates in the fixture.
7. **Live-season share** uses live-season teammates only (a careerStats teammate on the same team does not
   enter the live denominator).
8. **`TEAM_*` and DEF rows** — a `TEAM_KC` row (not in `playerMap`) with big `rec_tgt` does not enter the
   denominator and gets no entry; a `KC` row with position `DEF` gets no entry.
9. **Exclusions** — K and FB rows, gp 0 rows, pid missing from `playerMap` → no entry; a player with gp 0 in
   2025 and gp 5 in 2024 has `seasons: [2024]`, `gp: 5` on a last-2 window.
10. **Tracked-key rule** — 2019 season where no skill row carries `off_snp` (but rows carry `tm_off_snp`),
    2020 where they do: career `snapPct` uses 2020 only, `snapSeasons: 1`; `totals.off_snp` counts 2020 only;
    a window of 2019 alone → `snapPct: null`, `totals.off_snp: null`. A tracked key absent on one row counts 0.
11. **`leagueScored`** — true when all rows `scoringBasis: 'league'`; false when one row lacks it.
12. **`oppPerG`** — QB uses pass_att + rush_att, WR uses rush_att + rec_tgt.
13. **Rate alignment** — 2014 where no skill row carries `rush_btkl`, 2015 where they do; RB with 2014
    `rush_att 100`, 2015 `rush_att 200, rush_btkl 20` → `btklRate` = 20/200 = 0.10 (not 20/300), `basisGp.btklRate`
    = 2015's gp only, while `ypc` uses both seasons and `basisGp.ypc === gp`.
14. **Games-weighted per-game** — 2024 `gp 2, fp 40` (20/g), 2025 `gp 16, fp 160` (10/g) → `fpPerG` = 200/18
    ≈ 11.11, not 15. Same fixture shape for `oppPerG` (Σ opportunities / Σ gp).
15. **RZ share uses the keep-retired builder** — a teammate pid absent from `playerMap` with `rec_rz_tgt 10`
    enters the RZ denominator (`rzTgtShare` = 10/20 for a player with 10) but **not** the `tgtShare` denominator;
    the expected `rzTgtShare` equals what `computeHistoricalTeamTotals` on the same fixture yields.
16. **Null tolerance** — `playerMap: null` → empty Map; `careerStats: null` with no live → empty Map;
    `currentSeasonTotals: { complete: true, season: 2026 }` (no `players`) on a live window → empty Map, no throw.

`marketMetrics.test.js` (hand-built `WindowStats` maps, no `buildWindowStats` needed):
1. **Competition ties** — four WRs with `tgt` 100, 90, 90, 80 → ranks 1, 2, 2, 4, `of: 4`.
2. **`better: 'low'`** — `intRate` 0.01 ranks above 0.03.
3. **gp floor** — maxGp 17 → floor 9; an 8-gp WR has `null` for `catchPct` and `fpPerG` but a rank for `fp`.
   `maxGp` taken across positions (a 17-gp QB sets the floor for an all-WR pool otherwise maxing at 10).
4. **minVolume** — WR with 2 tgt/g → `catchPct` null; QB with 10 att/g → `intRate` null.
4a. **basis floor** — window maxGp 34 (floor 17): a WR with `gp 34` but `basisGp.snapPct 8` gets `null` for
    `snapPct` and a rank for `tgtPerG`; with `basisGp.snapPct 20` he gets a `snapPct` rank.
5. **Within position** — an RB and a WR with the same `tgt` both rank 1 in their own position.
6. **Not applicable / null value** — QB gets `null` for `tgt`; a WR whose `aDOT` is null gets `null`, and `of`
   excludes him.
7. **Registry shape** — ids unique; every entry has the fields; every `positions` ⊆ skill; every
   `minVolume.stat` ∈ `WINDOW_TOTAL_KEYS`; `format(null) === '—'`; every `better: 'low'` entry has
   `kind: 'rate'`; every `rate` entry reading `ws.rates`/`ws.usage` has a `basis` (assert via a list of the
   expected `{id, basis}` pairs); `minVolume` appears only on `rate` entries.

## 8. Docs

`docs/nav/utils.md` — one row each, capability-phrased (no availability claims, per
`docsAvailabilityClaims.test.js`):
- `marketWindowStats.js` — pure, view-only per-window (live / season / last 3 / career) skill-player totals,
  recomputed rates, per-(season, team) shares and snap % from `careerStats` + `currentSeasonTotals`; takes the
  caller's `liveUsable`; a stat key untracked in a season contributes nothing; guarded by
  `marketWindowStatsViewOnly.test.js`.
- `marketMetrics.js` — `MARKET_METRICS` registry and `rankWindow` (within-position competition ranks, gp floor
  ½ × window max gp checked against the games a rate rests on, per-metric volume floors; below a floor → `null`).
- `efficiencyMetrics.js` row: "reused view-only by `outlookPositionStats.js`" → "reused view-only by
  `outlookPositionStats.js` and `marketWindowStats.js`". Same wording change in the source comment at
  `src/utils/efficiencyMetrics.js:31` (comment only; no code line changes).

No CLAUDE.md change (no invariant/command change). No `docs/signal-registry.md` change: no new raw source,
factor or ephemeral capture — display-only derivations of keys already registered. No cross-repo registry
change: reads existing CR-02/CR-11 keys and rows, defines no shared contract; nothing for
`data-repo-backlog.md`.

## 9. Done-definition and hand-back

Repo done-definition 1–5, 8 (commit). Step 6: no visible surface — note it. `currentSeasonTotalsIsolation.test.js`
and `Market.test.jsx` green and **unmodified** (`git diff --stat` shows neither). `grep -rn "PROVISIONAL(" src/`
output pasted (this slice adds none). Hand-back: SHA, files touched, deviations, what each test asserts.

## 10. Stops (report, do not improvise)

- Any need to edit `outlookPositionStats.js`, `playerTeam.js`, `teamContext.js`, `Market.jsx` or App.jsx, or
  any non-comment line of `efficiencyMetrics.js`.
- `buildTeamShareTotals`, `computeHistoricalTeamTotals` or `resolvePlayerTeam` behaving differently from §4.3
  when handed `sources` (e.g. an RZ denominator lookup by `resolvePlayerTeam` missing a key that exists).
- An existing test going red.

## 11. Open for Anton

1. **Career-window rate floor.** The brief's floor (gp ≥ half the window's max gp) on a Career window means
   roughly 100+ games, so career rates and per-game ranks cover only long-tenured players. Recommend keeping
   it for A (it's one constant) and revisiting when B shows it; alternative is a fixed floor (e.g. 32 games)
   for Career only.
2. **Snap % before 2020** is not in the data at all; a career snap % is "2020 onward" (`snapSeasons` lets B say so).

## 12. Revision record

- 2026-10-31 — written (Session 1, opus).
- 2026-11-01 — revised for all 7 plan-reviewer flags (Anton: "Revise for all flags"): §6 checks module
  specifiers only and comments avoid the in-season module names; RZ denominators reuse
  `computeHistoricalTeamTotals` (matches the pop-up) instead of a private builder; `passInt`/`sacks`/`fumLost`
  totals dropped, low-is-better only as rates, `minVolume` rates-only; new `basisGp` so rate floors use the
  games a rate rests on; tests 13–16 and metrics 4a added; null-tolerant `rowsFor`/`pm`; `efficiencyMetrics`
  docs row + source comment added to the touch list.

## Fix pass 1 (Session 1, 2026-11-01; from implementation-reviewer on `4d2dde2`, full depth)

**Test-only.** No change to `marketWindowStats.js`, `marketMetrics.js`, the guard test, docs or any other file.
The reviewer found no fidelity, scope, invariant or cross-repo problem; all six items are test gaps. Session 1
re-ran the four target test files at `4d2dde2`: 95/95 green. Both declared deviations (Map-or-object input to
`rankWindow`; DEF fixture without offensive keys) are accepted as-is.

Edit only `src/utils/marketWindowStats.test.js` and `src/utils/marketMetrics.test.js`:

1. **Test 14 `oppPerG` must discriminate** (`marketWindowStats.test.js`, 'oppPerG by position, games-weighted',
   ~:146–150). Change the 2024 row to `rec_tgt: 40` (20/g; 2025 stays 160 over 16 gp = 10/g). Assert
   `w.usage.oppPerG` ≈ `200 / 18` (11.11 — a per-season mean would be 15). Leave the `fpPerG` assertion and the
   QB/WR position case as they are.
2. **Test 7 must span a completed season** ('live-season share uses live-season teammates only', ~:86–92). Use
   `win([2026, 2025])` and give `wr` no 2025 row (so only his 2026 season adds). Keep `x`'s 2025 row
   (`rec_tgt: 500`, team `KC`). Assert `tgtShare` ≈ `10 / 40`, which fails if 2025 KC totals leak into the
   2026 denominator (10/540).
3. **Test 16 freezes its inputs** ('tolerates nulls', ~:176–181). Route all three calls through `run()` (which
   deep-freezes and checks `careerStats` unchanged). `run()` must tolerate `careerStats: null`: change its
   two post-checks to run only when `careerStats` is a non-null object (`freeze(null)` is already a no-op).
   Assertions unchanged (`size === 0`, no throw).
4. **`sackRate` denominator** — new case in `marketWindowStats.test.js`: QB `pass_att 90, pass_sack 10` →
   `rates.sackRate` ≈ `0.10` (not 10/90).
5. **The three untested share mappings plus `basisGp` for shares** — new case: one season, team `KC`, player
   `rb` (RB) with `rush_att 50, rush_rz_att 5, rec_air_yd 30` and a teammate `t` (WR, in `playerMap`) with
   `rush_att 150, rush_rz_att 15, rec_air_yd 270`. Make each team total distinct so a swapped key fails.
   Assert `carryShare` ≈ 50/200, `rzRushShare` ≈ 5/20, `aySh` ≈ 30/300. Then a two-season case where the
   player's team denominator is absent in one season (e.g. 2024 row with `team` unresolvable — `team: null`,
   gp 6; 2025 gp 10 on KC): assert `basisGp.tgtShare === 10` (only the added season), and the share uses
   only 2025.
6. **`rankWindow` plain-object input** (`marketMetrics.test.js`) — one case passing the same fixture as
   metrics test 1 as a plain `{ [pid]: ws }` object; assert the ranks are identical to the Map result.

Done: `npm test`, `npm run lint`, `npm run build` green; commit as
`test: market window stats fix pass 1 — discriminating oppPerG/live-share cases, frozen null inputs, sackRate, share mappings, object input`.
Hand back SHA and what each changed/added test asserts. If any new assertion fails against the current
source, stop and report — do not change source.
