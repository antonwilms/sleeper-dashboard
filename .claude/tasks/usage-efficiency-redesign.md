# Pop-up "Usage & efficiency" redesign — season grid with league ranks (one slice)

Review depth: full — requested by Anton for this slice; it also introduces a new league-wide ranking rule
(a "pool" definition every row depends on) and a new consumer of the live season's `currentSeasonTotals`.
Trigger check: nothing here feeds `projectedPPG`, the dynasty score, a `factors` key, fantasy-point scoring,
`projectionSnapshot.js` or any `docs/cross-repo-registry.md` contract (§1). No domain state moves; App.jsx's
only edit is removing the now-unread `historicalTeamTotals` key from the profile-data context bundle (§4); no new hook, state library, dependency, cache TTL or `playerRows` step.

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a backgrounded `npm run dev`, and
stops it when done.

Copied definitions created by this slice: **one** — `LIVE_SEASON_GAMES = 17` in `usageEfficiency.js`, a copy
of `qbTakeover.REG_SEASON_TEAM_GAMES` (`src/utils/qbTakeover.js:14`). It is copied, not imported, because
`inSeasonEvidenceViewOnly.test.js:116–121` pins qbTakeover's non-test importers to `App.jsx` and
`inSeasonScoring.js`; that test is **not** widened. Equality test U11 (§8). Everything else is imported:
values from `marketWindowStats.buildWindowStats`, percentiles from `starterPercentiles.percentileOf`, colour from
`percentileColour.scaleCss`/`scaleInk`, the live gate from `inSeasonEvidence.usableLiveSeason`, `QUALIFYING_GP`
from `outlookConsistency.js`, the QB volume floor from `marketMetrics.METRIC_BY_ID[id].minVolume`.

Revisions (2026-11-25): r2 = sack-rate addendum + round-1 flags; r3 (Anton) = local 17 + U11, sacks test lines,
more stale docs (§6), `of N` = ranked count; r4 = round-3 anchors/legend wording with a per-row-true legend (§2.5/§2.7/§3.1, U6b/U6c).

---

## 0. Pre-checks done in planning (Session 1, 2026-11-25)

1. **The live season is absent from the card today — confirmed in code and data, not grep alone.**
   - `careerStats` is built `for (let s = 2012; s < currentSeason; s++)` (`src/api/sleeperStats.js:432`), so the
     live season (2026) is never a `careerStats` key; `PlayerDetailModal.jsx:171–173` derives
     `axisSeasons = careerHistory.slice(-5).map(h => h.season)` and `usePlayerProfile.js:38–56` builds
     `careerHistory` from `careerStats` only → `axisSeasons` never contains 2026.
   - `buildGamesPlayedShareSeries` passes `currentSeasonTotals: null` (`src/utils/usageEfficiency.js:284`), and
     `marketWeekly.windowSeasonRows` returns `{}` for a season that is in neither source → the share rows could
     not show 2026 even if the axis carried it.
   - Data: the served live file exists — `../sleeper-dashboard-data/nfl/season-totals/2026.json` (local checkout,
     last commit 8e99c6a 2026-11-20): 2,736 rows, 1,590 with `weeklyStats`. Tee Higgins (`6801`): `gamesPlayed 9`,
     `rec_tgt 73`, `rec_air_yd 637`, `rec_rz_tgt 7`, `off_snp 448` — real inputs for every WR row.
   - The app already loads it as `currentSeasonTotals` (`App.jsx:225`, effect `:1210–1230`), and
     `PlayerDetailModal.jsx:91` already destructures it from `useProfileData()` — no new wiring for the live column.
   - Not checked: the browser's IndexedDB cache; Session 2's smoke (§9) is the in-app check.
2. **`buildWindowStats.rates.passerRating` is not null.** It is initialised `null` at
   `marketWindowStats.js:130` and then assigned `passerRating(a.sums)` at `:146` (the same
   `efficiencyMetrics.passerRating` the card uses today via `buildPositionStatSeries`). It is the QB source (§3.2).
3. **The 2025 fixture carries no `weeklyStats`** (0 of 2,750 rows) and no positions, so the share rows are void
   against it. Rank tests use built fixtures (§8); the fixture is still the field-existence oracle — every stat
   key this slice reads (`rec_tgt`, `rec_air_yd`, `rush_att`, `rush_yd`, `pass_att`, `pass_cmp`, `pass_yd`,
   `pass_td`, `pass_int`, `pass_sack`, `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`) is already in
   `WINDOW_TOTAL_KEYS` and present there. No new stat key.
4. **`buildRzShareSeries` has no other reader.** `grep -rn buildRzShareSeries src` → only
   `UsageEfficiencySection.jsx` and `usageEfficiency.test.js`. Same for `buildGamesPlayedShareSeries`,
   `alignToAxis`, `buildMetricRow`, `GP_SHARE_SOURCE`. `historicalTeamTotals`' only context reader is the
   modal's forward to this component (`PlayerDetailModal.jsx:90`, `:724`) — §4 removes the key from the context
   bundle; App.jsx's `historicalTeamTotals` memo (`App.jsx:299`) stays, it feeds `computeHistoricalShares`.
5. **`METRIC_META.sacks` readers.** `grep -rn "METRIC_META\.sacks\|'sacks'" src` → the card (via
   `POSITION_STAT_METRICS.QB`), `usageEfficiency.test.js`, and `metricGlossary.test.js`'s `POPUP_LABEL_PINS`
   (which pins the pop-up's rendered labels). `marketMetrics.js`/`factViews.js` `'sacks'` is Market's own id,
   not `METRIC_META`. After this slice nothing renders it → the `METRIC_META.sacks` entry is deleted and the pin
   updated (§3.3, §8). `METRIC_META.sackPct` already exists (`glossaryId: 'sackRate'`, label `Sack rate`,
   `pctFmt`, field `pass_sack ÷ (pass_att + pass_sack)`); it is reused unchanged.
6. **QB volume floor exists in Market, not in the card.** The card has no volume floor today. Market's
   `cmpPct`, `passerRating` and `sackRate` metrics all carry `minVolume: PASS = { stat: 'pass_att', perGame: 14 }`
   (`marketMetrics.js:16`, `:56`, `:60`, `:61`), applied in `rankWindow` as `totals.pass_att / gp < 14 → not
   ranked` (`:145`). Anton's "same pass_att floor as cmpPct/passerRating" is read as: adopt that floor, by
   import, for all three QB rate rows (§2.7).

## 1. Display-only check

The card stays display-only. The only new imports go into `src/utils/usageEfficiency.js` (view-only, not in any
`PIPELINE` list of `currentSeasonTotalsIsolation.test.js` / `marketWindowStatsViewOnly.test.js`) and
`UsageEfficiencySection.jsx`. No projection/scoring module gains an import. CR-21 (in-progress season-totals
reads are scored only via `inSeasonScoring.js`): this slice reads live **stat counts** through
`buildWindowStats`, exactly as Market's live window already does (`Market.jsx:294`), and never scores them — no
`fpShare`/`fp` field is rendered. CR-11/CR-19/CR-34 keys are read through the existing `WINDOW_TOTAL_KEYS` /
`SHARES` / `FIELD_KEYS` lists; no list changes. **No registry entry changes; no backlog line.**
Session 2 re-runs: `grep -rn "usageEfficiency" src/utils/seasonProjection.js src/utils/dynastyScore.js
src/utils/projectionSnapshot.js` → empty.

## 2. What the card shows (product)

A grid. Rows = the position's metrics; columns = the player's axis seasons oldest → newest, then (in season) a
rightmost live column. Each cell: the value, and under it his rank at the position, e.g. `18.6%` over
`WR22 of 104`. The cell background is his percentile among the same pool (higher = brighter), only for metrics
where higher is better. One legend explains the colour and the basis.

### 2.1 Rows (order)

| Pos | Rows (metric id → label from `METRIC_META`) | Direction |
|---|---|---|
| QB | `cmpPct`, `passerRating`, `sackPct` | up, up, **down** (rank 1 = lowest rate; coloured, percentile inverted) |
| RB | `rushShare`, `rbTargetShare`, `yardsPerCarry`, `snapShare`, `rushRzShare` | all up |
| WR/TE | `targetShare`, `airYardsShare`, `aDOT`, `snapShare`, `recRzShare` | up, up, **neutral**, up, up |

The row list is a new `USAGE_GRID_ROWS` constant in `usageEfficiency.js` (exactly the table above; `TE` aliases
`WR`), replacing the card's read of `POSITION_STAT_METRICS` + the snap/RZ conditionals.
`outlookPositionStats.js` is not edited. Snap share and red-zone share stay RB/WR/TE-only (QB reasons unchanged;
carry the existing comments onto the constant).

**Sack rate (Anton's addendum) replaces the raw sacks row.** Value = `buildWindowStats` `rates.sackRate` =
`pass_sack ÷ (pass_att + pass_sack)`, per dropback (`marketWindowStats.js:129`). Lower is better: rank 1 = the
lowest rate, and the cell is coloured with the percentile inverted, so the lowest rate sits at the bright end.

### 2.7 QB efficiency volume floor (`cmpPct`, `passerRating`, `sackPct`)

For these three rows a pool member counts for the row only if `totals.pass_att / gp >= 14` (`gp` = his
`buildWindowStats` entry's `gp` for that column), the floor read from `METRIC_BY_ID.cmpPct.minVolume`,
`METRIC_BY_ID.passerRating.minVolume`, `METRIC_BY_ID.sackRate.minVolume` (`marketMetrics.js`) via a
`ROW_MIN_VOLUME = { cmpPct: 'cmpPct', passerRating: 'passerRating', sackPct: 'sackRate' }` id map. The floor
narrows that **row's** pool the same way for every QB, so it is still one pool per (season, position, row),
identical for every player. `of N` = the players actually ranked on that row (8+ games **and** over the floor
**and** a finite value) — Anton 2026-11-25, superseding the brief's "of N = pool size" line; Market does the same. A QB in the games pool but below the floor: value shown, marker `low vol`
(`data-low-volume="true"`), no rank, no colour. A QB below the games gate keeps the `<8 g` marker (games gate
checked first). Other rows have no volume floor (§7).

### 2.2 Columns

- Completed seasons: `axisSeasons` exactly as the modal passes it today (unchanged; `§availability` shares it).
  Header = the season (`2023`).
- Live column: present iff `liveUsable` (§4). Header `${S} so far` while `!phase.liveSeasonComplete`, else
  `${S}` — the same label rule as the modal's game-log picker (`PlayerDetailModal.jsx:672`). It is always the
  rightmost column (docs/ui.md → *Season order*).
- A player with no live row (or `gamesPlayed 0`) still gets the live column, with void cells.

### 2.3 Cells

- **Ranked** (season-player in the pool, finite value): value line (mono 12px) + rank line (10.5px)
  `${POS}${rank} of ${N}`, both in `scaleInk(p)` on `scaleCss(p)` when the direction is `up`; neutral rows use
  the card's normal surface and `text-dp-text` / `text-dp-muted` — no scale colour. Min contrast of `scaleInk`
  over the whole scale is 4.59:1 (computed in planning over 1,001 samples; T14 in `percentileColour.test.js`
  already pins ≥ 4.5), so value and rank line share the ink — no muted grey on a coloured cell.
- **Unqualified** (player's games in that column < the column's `minGp`): value shown, no rank, no colour, and a
  marker `<8 g` (live: `<${minGp} g`), `data-unqualified="true"`.
- **Void** (no finite value): empty cell, no text, `data-void="true"`, with a 1px dashed bottom border
  (`border-dp-border`) echoing SeriesBars' void baseline — never `0`, never `—`. Pre-2020 snap share is void and
  keeps its `NOT MEASURED THEN` note under the grid when any column is < 2020 (unchanged copy).
- Each row's label cell keeps its `DefinitionPopover` (term = label, gloss = note, field = `METRIC_META.field`).

### 2.4 Removed

Floor/ceiling caption, `SeriesBars`, `CoveragePips` + span label (`5y`), the latest-value column and the
unlabelled Δ column. **No trend figure is added** — the grid itself shows the trend left → right.

### 2.5 Header and legend

Header row keeps the `DISPLAY ONLY` badge and the role chip. Its line becomes exactly:
`Never feeds projection or dynasty score. Shares are his share of his team's weekly totals in the games he
played — each week credited to the team he played for where that season's game logs are loaded, otherwise to
his season team.`
(`gameLogsByYear` widens on demand, so a column's shares/ranks can update when the picker loads that season —
accepted, recorded in docs/ui.md.)
Legend under the grid (one line on desktop, wraps on phone):
- a 6-stop gradient strip (`scaleCss(0)` … `scaleCss(1)`) labelled `bottom` → `top`;
- the rank-basis line, true for every row of that card (`${POS}` from the `position` prop):
  - RB/WR/TE (no row has a volume floor): `Rank among all ${POS} in Sleeper's player list with 8+ games that season and a value for that stat (league scoring not involved). Not /week's colours, which rank league starters.`
  - QB (all three rows floored): `Rank among ${POS} in Sleeper's player list with 8+ games and ≥ ${perGame} pass attempts a game that season (league scoring not involved). Not /week's colours, which rank league starters.` — `perGame` read from `METRIC_BY_ID.cmpPct.minVolume.perGame` (14), not inlined.
  ("in Sleeper's player list": the pool needs a `playerMap` position — §3.1.)
- when the live column shows: `${S} so far: ${minGp}+ games (8 of 17, pro-rated to ${teamGames} team games played).`
- WR/TE: `Avg depth: uncoloured — a style, not better or worse.`
- QB: `Sack rate: lower is better (rank 1 = lowest). Below ${perGame} pass attempts a game: low vol, unranked.`
The `sackPct` row's `DefinitionPopover` gloss is `METRIC_META.sackPct.note` + ` Lower is better.`

### 2.6 Role chip

Unchanged classifier and cohort. Its popover gloss gains the numbers it used (display rule: signals show their
numbers): `${season}: ${shareLabel} ${pct(share)}, snap share ${pct(snapPct)} (season-team basis). Bands: bottom
third < ${pct(c33)}, top third ≥ ${pct(c67)}; ${everyDownLabel} also needs snap share ≥ ${pct(s67)}.` —
`shareLabel` = `carry share` (RB) / `target share` (WR/TE); `everyDownLabel` = `Every-down back` (RB) /
`Every-down` (WR/TE); `s67` = `cohort[position].snap[1]` (the snap cutoff `classifyRole` uses for the top band,
`outlookUsage.js:143`). `snap share …` omitted when `snapPct` is null; the `; … also needs …` clause omitted when
`s67` is null. `lastNonNull` in the component is extended to also return the
season each value came from (`shareSeason`, `snapSeason`); if they differ, both seasons are named. Cutoffs come
from `buildRoleCohort(...)[position].share`. The note "(season-team basis)" is required: the chip's share is
`buildPerSeasonTeamShares`' season-team share, which can differ from the grid's games-played share. Moving the
role to the games-played basis is out of scope (§7).

## 3. Data — one derivation for value, rank and colour

### 3.1 New exports in `src/utils/usageEfficiency.js`

```js
import { METRIC_BY_ID } from './marketMetrics'          // QB volume floors (§2.7)

// Copy of qbTakeover.REG_SEASON_TEAM_GAMES (qbTakeover.js:14) — not imported: inSeasonEvidenceViewOnly.test.js
// pins qbTakeover's importers. Equality test U11.
export const LIVE_SEASON_GAMES = 17

export const USAGE_GRID_ROWS = { QB: [...], RB: [...], WR: [...] }; USAGE_GRID_ROWS.TE = USAGE_GRID_ROWS.WR  // §2.1
export const ROW_MIN_VOLUME = { cmpPct: 'cmpPct', passerRating: 'passerRating', sackPct: 'sackRate' } // → METRIC_BY_ID ids

// Team games completed in the live season = max over currentSeasonTotals.players rows of the count of
// weeklyStatus entries that are 'P' or 'D' (the team played that week). null when not complete / no rows.
export function liveTeamGamesCompleted(currentSeasonTotals) // → number | null

// Live qualifying threshold: Math.max(1, Math.ceil(QUALIFYING_GP / LIVE_SEASON_GAMES * teamGames)).
// null when teamGames is null or 0.
export function liveQualifyingGp(currentSeasonTotals) // → { teamGames, minGp } | null

// THE pool rule (Anton): every pid in `rows` whose playerMap position === position and whose
// rows[pid].gamesPlayed >= minGp. Not filtered by roster, starter status or playerRows. Sorted pids.
// A careerStats id absent from playerMap has no position and is not in the pool (nor in buildWindowStats'
// own isPool, so it has no value either) — disclosed in the legend ("in Sleeper's player list") and docs/ui.md.
export function qualifyingPool({ rows, playerMap, position, minGp }) // → string[]

// value → the metric for one buildWindowStats entry (null-safe; non-finite → null).
export const METRIC_VALUE = {
  cmpPct: e => e?.rates.cmpPct, passerRating: e => e?.rates.passerRating, sackPct: e => e?.rates.sackRate,
  rushShare: e => e?.usage.carryShare, rbTargetShare: e => e?.usage.tgtShare, yardsPerCarry: e => e?.rates.ypc,
  targetShare: e => e?.usage.tgtShare, airYardsShare: e => e?.usage.aySh, aDOT: e => e?.rates.aDOT,
  snapShare: e => e?.usage.snapPct, rushRzShare: e => e?.usage.rzRushShare, recRzShare: e => e?.usage.rzTgtShare,
}
// 'up' = higher is better (coloured, rank 1 = highest); 'down' = lower is better (coloured, rank 1 = lowest,
// percentile inverted); 'neutral' = rank 1 = highest, no colour.
export const METRIC_DIRECTION = {
  cmpPct: 'up', passerRating: 'up', sackPct: 'down', rushShare: 'up', rbTargetShare: 'up', yardsPerCarry: 'up',
  targetShare: 'up', airYardsShare: 'up', aDOT: 'neutral', snapShare: 'up', rushRzShare: 'up', recRzShare: 'up',
}

// Competition rank ("1224"): rank = 1 + count of poolValues strictly better. poolValues = the row's ranked
// values (finite only, floored rows already filtered); of = poolValues.length (Anton 2026-11-25). percentile =
// starterPercentiles.percentileOf(sorted poolValues, value), returned as 1 − p when ascending (so the
// lowest sack rate gets the highest percentile = bright end). Returns null when value is not finite.
export function rankInPool(value, poolValues, { ascending }) // → { rank, of, percentile } | null

// The grid. ONE buildWindowStats call per column (§5); every row, the player's value and the pool's values
// read the same Map.
export function buildUsageGrid({
  playerId, position, seasons, careerStats, playerMap, gameLogsByYear,
  currentSeasonTotals, liveUsable,
}) // → { columns, rows }
```

`buildUsageGrid` output:

```js
columns: [{ season, kind: 'season' | 'live', minGp, teamGames /* live only, else null */, poolSize /* games pool, unrendered */ }]
rows: [{ id, meta /* METRIC_META[id] */, direction, cells: [{
  season, value /* number|null */, gp, qualified /* gp >= minGp */, lowVolume /* floored row, below floor */,
  rank, of, percentile /* null unless qualified && !lowVolume */,
}] }]
```

Algorithm, per column (completed seasons from `[...seasons].sort()`, then the live season `S =
currentSeasonTotals.season` when `liveUsable` and `liveQualifyingGp` is non-null):
1. `window = kind === 'live' ? { id: 'live', kind: 'live', seasons: [S] } : { id: String(y), kind: 'season', seasons: [y] }`.
2. `stats = buildWindowStats({ window, careerStats, currentSeasonTotals: kind === 'live' ? currentSeasonTotals : null, playerMap, gameLogsByYear })`.
   (Completed columns keep `currentSeasonTotals: null` as today, so a completed season can never read live rows.)
3. `rows = marketWeekly.windowSeasonRows(season, careerStats, kind === 'live' ? currentSeasonTotals : null)` — the
   same source `buildWindowStats` reads, so `gamesPlayed` for the gate and the values come from one row set.
4. `minGp = kind === 'live' ? liveQualifyingGp(...).minGp : QUALIFYING_GP`;
   `pool = qualifyingPool({ rows, playerMap, position, minGp })`.
5. Per row id: `poolValues = pool.map(pid => finite(METRIC_VALUE[id](stats.get(pid)))).filter(v => v != null)`
   (`of` = its length); `value = finite(METRIC_VALUE[id](stats.get(playerId)))`;
   `gp = rows[playerId]?.gamesPlayed ?? 0`; `qualified = pool.includes(playerId)`; rank/percentile only when
   `qualified && value != null`.
   For a row in `ROW_MIN_VOLUME`: `meets(pid) = (e.totals.pass_att ?? 0) / e.gp >= mv.perGame` with
   `e = stats.get(pid)`, `mv = METRIC_BY_ID[ROW_MIN_VOLUME[id]].minVolume` (stat `pass_att`); the row's pool =
   `pool.filter(meets)` before step 5's value read; the player's `lowVolume = qualified && !meets(playerId)`, and a
   low-volume cell gets no rank/percentile. Read `mv.stat`/`mv.perGame` from the import; do not inline 14.

The position used for the pool is the `position` prop (`player.position`, the same `playerMap` position
`buildWindowStats` keys on). TE is ranked among TEs, WR among WRs, even though they share a metric list.

**`of N` = ranked count (Anton 2026-11-25).** N counts the pool members actually ranked on that row: in the games
pool, over the row's volume floor (QB rows), with a finite value. A member with no finite value (a WR with 0
targets for aDOT; a team-season without weekly coverage) is not in N. Shares/snap/RZ for a season with no weekly
coverage are void for everyone — the whole cell row is void.

### 3.2 Sources, and what changes vs today

| Row | Today | New source (`buildWindowStats` entry) | Note |
|---|---|---|---|
| `cmpPct` | `computeSeasonAverages(...).compPct` (0–100) | `rates.cmpPct` (fraction) | `METRIC_META.cmpPct.format` → `v => \`${(v*100).toFixed(1)}%\``, `domain: [0, 1]`; update its test |
| `passerRating` | `efficiencyMetrics.passerRating(stats)` | `rates.passerRating` | same function, season sums (pre-check 2) |
| `sacks` → `sackPct` | `stats.pass_sack` (count) | `rates.sackRate` = `pass_sack ÷ (pass_att + pass_sack)` | replaces the count row (Anton); `METRIC_META.sackPct` reused unchanged |
| `yardsPerCarry` / `aDOT` | direct division | `rates.ypc` / `rates.aDOT` | same ratios |
| shares (4) | `buildGamesPlayedShareSeries` (same `usage.*`) | `usage.carryShare` / `tgtShare` / `aySh` | identical numbers; now also for < 8-game seasons |
| `snapShare` | `buildUsageHistory().snapPct` (r3-rounded) | `usage.snapPct` (unrounded) | ≤ 0.05 pp display drift; untracked (pre-2020) → null |
| `rushRzShare` / `recRzShare` | `buildRzShareSeries` ÷ `historicalTeamTotals` (season team) | `usage.rzRushShare` / `rzTgtShare` (games-played, week team) | Anton rule 6; `METRIC_META` `field` strings → `Σ rush_rz_att ÷ Σ team rush_rz_att over his played weeks (week team)` / `Σ rec_rz_tgt ÷ …` |

Red-zone denominator: Slice 4c chose `historicalTeamTotals` to keep retired ids in the denominator;
`buildWindowStats` keeps them too (`buildTeamWeekTotals` → `isOffenceRow` passes ids absent from `playerMap`,
`marketWeekly.js:129`). The only retired-id exclusion is the **pool** (§3.1), not the denominator.

### 3.3 Removed from `usageEfficiency.js`

`alignToAxis`, `buildMetricRow`, `buildRzShareSeries`, `GP_SHARE_SOURCE`, `buildGamesPlayedShareSeries` (pre-check
4: no other reader) and their tests. Their two `PROVISIONAL` tags move onto `buildUsageGrid` (§3.4). The file
header comment is rewritten to describe the grid. `METRIC_META.sacks` is deleted (pre-check 5: no remaining
reader once the row goes). The `POSITION_STAT_METRICS` import goes (`USAGE_GRID_ROWS` replaces it), and so does
the `resolvePlayerTeam` import (`usageEfficiency.js:17`; its only use is `buildRzShareSeries`, L254).
Other `METRIC_META` entries are untouched (`domain`/`deltaFormat` stay, now unread by this card).

### 3.4 PROVISIONAL tags (keep exactly two categories; one tag per site)

- `buildUsageGrid` derivation: keep the existing
  `// PROVISIONAL(heuristic): pop-up share rows credit a week to the season team when that season's gamelogs are not loaded/complete · makeWeekTeam's fallback · complete gamelogs for every axis season`
  (moves from the component to the helper) and the existing `PROVISIONAL(no-data)` share-slot line beside the
  share-value read.
- Render site (void cell in the component):
  `// PROVISIONAL(no-data): void cell — no finite value for this season · untracked key, no weekly coverage, or no live row · the key tracked / weeklyStats served for that season`.

## 4. Live season wiring (`PlayerDetailModal.jsx`)

- `liveUsable = useMemo(() => !!careerStats && usableLiveSeason(currentSeasonTotals, deriveDataSeason(careerStats)), [careerStats, currentSeasonTotals])` —
  the same rule App.jsx uses for `liveSeasonUsable` (`App.jsx:255`), imported from
  `src/utils/inSeasonEvidence.js` (`usableLiveSeason`; the modal already imports that module) and
  `environment.deriveDataSeason` (already imported).
- `liveLabel = phase?.liveSeasonComplete ? String(S) : \`${S} so far\`` (S = `currentSeasonTotals?.season`).
- `UsageEfficiencySection` props become: `careerStats, playersMap, playerId, position, axisSeasons, playerRows,
  gameLogsByYear, currentSeasonTotals, liveUsable, liveLabel`. **`historicalTeamTotals` is removed** from this
  call **and** from the modal's `useProfileData()` destructure (`PlayerDetailModal.jsx:90`) — otherwise
  `no-unused-vars` fails lint. Its context key then has no reader, so remove it from the context bundle in
  `App.jsx` (the `historicalTeamTotals,` entry at ~L876 with its two-line Slice 4c comment, and from that memo's
  dependency array ~L887) and from `src/context/ProfileDataContext.jsx`'s header comment (L5, L12ff). App.jsx's
  `historicalTeamTotals` memo itself (L299) is unchanged — it still feeds `computeHistoricalShares`. This is a
  read-side bundle edit, not a state move. Test contexts that still pass the key are harmless; leave them.
- Out of season `usableLiveSeason` is false (no `currentSeasonTotals` later than `dataSeason`), so no live column.

Live threshold rule (proposed, for Anton): **`max(1, ceil(8 / 17 × T))`**, T = team games played so far
(max P/D count over live rows). T = 10 → 5 games; T = 4 → 2; T = 17 → 8 (equals the completed rule). Using the
max over all rows makes T one number for the whole league, so the live pool is identical for every player.

## 5. Component (`src/components/dp/UsageEfficiencySection.jsx`)

- Keep: `teamShareTotals`, `perSeasonTeamShares`, `usageHistory`, the role memo (the chip needs them). Delete:
  `positionSeries` (`buildPositionStatSeries`), `rzShareSeries`, `gpShareSeries` and their imports
  (`buildPositionStatSeries`, `coverageBand`, `CoveragePips`, `SeriesBars`).
- `grid = useMemo(() => buildUsageGrid({...}), [playerId, position, axisSeasons, careerStats, playersMap, gameLogsByYear, currentSeasonTotals, liveUsable])`.
  All hooks stay above the early returns (existing rule).
- Early returns unchanged: empty `axisSeasons` → the existing `not-yet-accruing` DegradedBlock (even if a live
  column could exist — a rookie's first season is covered by the in-season Opp/G line below; recorded §7);
  no rows → `never-available` block.
- Table markup: `<FrozenScroll>` wrapping `<table data-testid="usage-grid">`; first column (metric label) frozen
  with `FROZEN_FIRST` + opaque `bg-dp-card` + `FROZEN_EDGE`, width `w-[112px] min-w-[112px]`; season columns
  `min-w-[84px]`, header cells `data-season={season}` and `data-kind`; body cells `data-testid="usage-cell"`,
  `data-metric={id}`, `data-season={season}`. Coloured cells set `style={{ backgroundColor: scaleCss(p), color:
  scaleInk(p) }}`; uncoloured cells set no inline `backgroundColor`. Rank line text exactly `${position}${rank} of ${of}`.
- 375px: the frozen label column + horizontal scroll; no page-level horizontal scroll.
- Update the component header comment (it currently describes Slice 4b/4c SeriesBars rows).

## 6. Docs in the same change

- `docs/ui.md` §usage (L332–365, through the role-chip sentence at L365): rewrite to the grid — rows, sources
  (`buildUsageGrid` → `buildWindowStats`), pool rule, live column + threshold, colour/neutral rule, void /
  unqualified cells, removed pips/Δ/floor-ceiling, RZ on the games-played basis and the trade-off of §3.2.
  Mechanism wording only (`docsAvailabilityClaims.test.js`).
- `docs/nav/components.md` row `dp/UsageEfficiencySection.jsx` and `docs/nav/utils.md` row `usageEfficiency.js`:
  new export list, removed exports.
- `src/components/dp/seriesBarsColourRegression.test.js`: delete the `UsageEfficiencySection.jsx does not pass a
  colour prop` case (the component no longer renders `SeriesBars`); update the file comment line 8. Non-behavioural.
- `docs/ui.md:499` (SeriesBars consumers sentence): drop `UsageEfficiencySection` as a consumer.
- `docs/ui.md` §usage also states the §3.1 pool exclusion, the §3.2 denominator note, and the §2.5 week-team
  condition (ranks can update when the picker loads a season).
- `docs/nav/components.md` `dp/SeriesBars.jsx` row (L36): drop `UsageEfficiencySection` from its consumers.
- `docs/nav/utils.md` `outlookUsage.js` row (L50) and `outlookPositionStats.js` row (L51): the pop-up's `§usage`
  now uses only `buildUsageHistory`/`buildRoleCohort`/`classifyRole` (role chip) and
  `buildTeamShareTotals`/`buildPerSeasonTeamShares` (their input); `buildPositionStatSeries` and
  `POSITION_STAT_METRICS` have no pop-up consumer — say so as current fact (exports unchanged).
- `docs/signal-registry.md` (no new signal; these rows name removed paths — rewrite each to the current reader):
  L50/L51 (`off_snp`/`tm_off_snp`): `§usage` snap share is now `marketWindowStats.buildWindowStats`
  `usage.snapPct` via `usageEfficiency.buildUsageGrid`; `buildUsageHistory` remains for the role chip only.
  L52 (red-zone keys): replace the `buildRzShareSeries` ÷ `historicalTeamTotals` sentence with
  `buildUsageGrid` → `buildWindowStats` `usage.rzTgtShare`/`rzRushShare` (games-played, week team).
  L56 (Market Efficiency-set counting stats): the pop-up's QB row is now `sackPct` = `rates.sackRate`
  (`pass_sack`, with `pass_att`) via `buildUsageGrid`, not the `outlookPositionStats` sack count.
- Stale `historicalTeamTotals`/§usage references (round-2 reviewer; rewrite each as current fact):
  - `docs/navigation.md:92` `ProfileDataContext.jsx` row: drop `historicalTeamTotals` from the key list,
    `nineteen` → `eighteen`, drop "feeds … its red-zone share row"; also `docs/navigation.md:112` (Patterns
    item 2, "nineteen-key value" → "eighteen-key value").
  - `src/context/ProfileDataContext.jsx:6` (`nineteen keys` → `eighteen keys`; plus the L5/L12ff edits of §4).
  - `docs/nav/components.md:46` `dp/PlayerDetailModal.jsx` row: drop `/historicalTeamTotals` and "§usage also
    takes historicalTeamTotals (for its red-zone row)"; add §usage's new props `currentSeasonTotals`,
    `liveUsable`, `liveLabel` and the modal's `usableLiveSeason` derivation.
  - `docs/ui.md:400–402` (Environment): drop "threaded onto ProfileDataContext" and the "thirteen → fourteen"
    key count; state the Environment section's current inputs.
  - `docs/signal-registry.md:123` (Outlook snap trend): consumer is the `§usage` role chip only, not a snap-share row.
  - `docs/nav/utils.md:56` `usageEfficiency.js` row: `sackPct` is now consumed (QB grid row) — drop it from the
    "retained unconsumed" list; `sacks` removed.
- CLAUDE.md: no change.

## 7. Out of scope / recorded follow-ups

- Role chip on the games-played basis (would change the classifier inputs and its cohort).
- A live-only grid for a rookie with no completed season.
- Low-volume rate outliers on the unfloored rows: the QB rows now carry Market's 14-att/G floor (§2.7), but YPC
  and aDOT do not, so an 8-game back with few carries can top YPC. Market's `RUSH`/`TGT` floors would close it;
  not built (Anton's addendum scoped the floor to the QB efficiency rows).
- `buildPositionStatSeries` / `POSITION_STAT_METRICS` lose their last consumer; left in place, candidate for removal.

## 8. Tests (each names its defect and red step)

New file `src/utils/usageEfficiency.test.js` cases replace the deleted ones; component cases go in
`src/components/dp/PlayerDetailModal.usageAvailability.test.jsx` (existing `renderModal` helper and context).
Build fixtures with `weeklyStatus`/`weeklyStats` like the existing `F1` describe (L363ff).

**U1 same pool for every player.** League: WRs `a`, `b` (in `playerRows`, starters), `c` (gp 9, `gamesStarted 0`,
not in `playerRows`, not rostered), `d` (gp 7), RB `r` (gp 16). Asserts `qualifyingPool` returns `['a','b','c']`;
`buildUsageGrid` for `a` and for `b` both report `of 3` on every ranked row of that season (all three have finite values), and `c`'s target share
(highest) puts `a` at rank 2 and `b` at rank 3. Fails if the pool is built per player, filtered by
`playerRows`/roster/`gamesStarted`, includes the 7-game WR or the RB. Red step: in `qualifyingPool`, add
`&& (rows[pid].gamesStarted ?? 0) > 0` → `of 2`, ranks shift; revert.

**U2 rank = sorted position; ties share.** 12 RBs (gp ≥ 8) with distinct YPC except two tied at 4.5 (2nd and
3rd best). Asserts the known player at 4.1 YPC has rank = 1 + count of YPC strictly greater (computed in the test
from the fixture's `rush_yd/rush_att`), `of 12`; both 4.5 players show rank 2, the next shows 4. Fails if ranks
are ascending, dense (2,2,3) or ordinal (2,3). Red step: change `rankInPool` to dense ranking; revert.

**U3 < 8-game season unranked.** Player with a 7-game season on the axis. Asserts that cell has a finite
`value`, `rank`/`of`/`percentile` null, `qualified false`; in the rendered modal the cell shows the value and
`<8 g`, no `backgroundColor`. Fails if the gate is dropped or uses `>= 1`. Red step: `qualified = true`; revert.

**U4 live column present in season, absent out of season.** Same careerStats; (a) `currentSeasonTotals =
{ season: 2026, complete: true, players: {...} }` with `careerStats` max 2025 → rendered header cell
`data-kind="live"` with text `2026 so far`, rightmost; its rank line ranks against the live rows only (a player
present only in live rows changes `of N`); (b) `currentSeasonTotals` `complete: false` → no live header. Also
`liveQualifyingGp` for T = 10 → `{ teamGames: 10, minGp: 5 }`, T = 17 → 8, empty players → null. Fails if the live
column is unconditional, missing, built from `careerStats`, or uses a flat 8-game gate. Red step: in
`buildUsageGrid` ignore `liveUsable` (always append) → (b) fails; revert. Second red step: `minGp =
QUALIFYING_GP` for live → live pool empty, rank line absent; revert.

**U5 aDOT uncoloured, shares coloured.** WR grid render: the `aDOT` cell has a rank line and no inline
`backgroundColor`; the `targetShare` cell's `backgroundColor` equals `scaleCss(percentile)` and its `color`
equals the `rgb` of `scaleInk(percentile)`. Fails if direction drives colour wrongly. Red step: set
`METRIC_DIRECTION.aDOT = 'up'`; revert.

**U6 sack rate: lower rate → better rank and brighter percentile.** Two pooled QBs (gp ≥ 8, both ≥ 14 att/G):
`q1` 20 sacks / 480 att (rate 0.04), `q2` 40 sacks / 460 att (rate 0.08). Asserts `q1` rank 1, `q2` rank 2,
`of 2`, and `q1.percentile > q2.percentile`; rendered, `q1`'s `sackPct` cell `backgroundColor` equals
`scaleCss(q1.percentile)` (non-null). Also asserts the QB grid has no `sacks` row. Fails if rank or percentile is
not inverted (lower rate dimmer / ranked last) or the count row survives. Red step (Anton's): drop the inversion
— set `METRIC_DIRECTION.sackPct = 'up'` → `q1` rank 2 and lower percentile; revert.

**U6b QB volume floor.** Three QBs in the games pool; `q3` has 9 games and 90 att (10/G < 14). Asserts `q3`'s
`cmpPct`, `passerRating`, `sackPct` cells have a finite `value`, `lowVolume true`, null rank/percentile, render
`low vol` with no `backgroundColor`; `q1`/`q2` show `of 2` on those rows (N = ranked QBs, Anton 2026-11-25), and
the rendered QB legend contains `≥ 14 pass attempts a game`. Fails if the floor is missing, inlined differently
from `METRIC_BY_ID`, or the floored-out QB counts in N. Red step: skip the `ROW_MIN_VOLUME` filter → `q3`
ranked, `of 3`; revert.

**U6c N excludes members with no value.** WR pool of 3 (gp ≥ 8) where `c` has 0 targets (`aDOT` null). Asserts
`a`'s `aDOT` cell `of 2` and his `targetShare` cell `of 3`. Fails if N counts the games pool. Red step: set `of`
to the games-pool size; revert.

**U7 RZ row on the games-played basis.** WR who missed weeks (like F1-T5's `w1`), `rec_rz_tgt` in
`weeklyStats`. Asserts the grid's `recRzShare` value `toBe(buildWindowStats({...}).get('w1').usage.rzTgtShare)`
and differs from the season-team share (`rec_rz_tgt ÷ team season rec_rz_tgt`, computed in the test). Same for
an RB with `rzRushShare`. Fails if RZ still reads `historicalTeamTotals`. Red step: restore the
`buildRzShareSeries`-style season-total division for `recRzShare`; revert.

**U8 header copy.** The usage section's text does not contain `per-season-team`, contains
`games he played` and `otherwise to his season team`, and a WR render's legend contains `with 8+ games that season and a value for that stat`,
`Sleeper's player list` and `league starters`; for a QB the legend contains `lower is better`. Red step: restore
the old header string; revert.

**U9 one whole-league pass per column (perf).** `vi.mock('./marketWindowStats', async orig => ({ ...await orig(),
buildWindowStats: vi.fn((await orig()).buildWindowStats) }))`; a 3-season axis + live → exactly 4 calls, for a
QB and for a WR. Fails if a pass is made per metric/row or per pool. Red step: call `buildWindowStats` inside
the per-row loop; revert.

**U10 role popover shows its numbers.** WR fixture from the existing role describe (L243ff): opening the chip
shows `target share` with a `%` value, `season-team basis`, and (cohort with a snap cutoff) `Every-down also
needs snap share ≥` with a `%` value. Red step: restore the old gloss; revert.

**U11 copied 17 (copied-definitions rule).** In `usageEfficiency.test.js`: `import { REG_SEASON_TEAM_GAMES } from
'./qbTakeover'` (test file only — the seam test checks non-test importers) and assert
`LIVE_SEASON_GAMES === REG_SEASON_TEAM_GAMES`, naming `qbTakeover.REG_SEASON_TEAM_GAMES` as the original. Fails if
either side drifts. Red step: set `LIVE_SEASON_GAMES = 18`; revert. `inSeasonEvidenceViewOnly.test.js` unchanged.

**Updated existing tests (assert the same facts on the new markup):**
- `F1-T5` (L386): the 2025 `targetShare` cell reads `35.7%` and not `25.0%`; the 2024 cell is `data-void="true"`.
  (The `—`/delta assertions go with the Δ column.)
- QB raw-counts test (L144): cmp% / passer-rating cells show the recomputed values (cmp% now formatted from the
  fraction — same displayed string).
- Pre-2020 snap test (L183/190): the < 2020 `snapShare` cell is `data-void="true"`; the note shows/doesn't show.
- RB/WR row-label tests (L152–174) keep their label assertions. QB label test (L134): `Sacks taken` → `Sack rate`.
- `metricGlossary.test.js` `POPUP_LABEL_PINS` (L145): remove `"sacks":"Sacks taken"`, add `"sackPct":"Sack rate"`.
- `usageEfficiency.test.js`: drop `alignToAxis`/`buildMetricRow`/`buildRzShareSeries`/`buildGamesPlayedShareSeries`
  cases; `cmpPct` domain/format case → `domain [0,1]`, `format(0.634) === '63.4%'` (red step: old ×100-free format
  → `0.6%`). Drop the `METRIC_META.sacks.domain` assertion (L82; keep `yardsPerCarry`/`aDOT`) and the
  two `METRIC_META.sacks.deltaFormat` assertions (L90–91; keep both `rushShare` lines, L88–89) (entry deleted). Keep the other
  `METRIC_META` cases.

## 9. Done-definition and smoke

CLAUDE.md done-definition in full (`npm test`, `npm run lint` 0 problems, `npm run build` clean, each new/changed
test shown red with its named mutation then reverted). `grep -rn "PROVISIONAL(" src/` output in the hand-back.

Smoke (preview `sleeper-dashboard`; docs/architecture.md → *Smoke-testing the running app*): open the pop-up for
Tee Higgins (WR), one RB (e.g. Bijan Robinson), one TE (e.g. Trey McBride) and one QB (e.g. Joe Burrow), §usage
card, at desktop and at 375px (`resize_window` mobile, then reset to desktop). Screenshot each (8). Report for
each: column headers incl. `2026 so far` (in season today), a ranked cell's `POSnn of N`, that N is the same
across two players of one position for the same season (open a second WR), aDOT's N ≤ target share's N, aDOT uncoloured, the QB's Sack rate row coloured with the lowest rate brightest and a `low vol` cell if one
exists (a backup QB), a void cell
where one exists, no `NaN`, no page-level horizontal scroll at 375px. Console free of new errors. Stop the
preview when done.

Hand-back: commit SHA, files touched, deviations, per-test assertion/defect/red step and confirmation it was
seen red. No sign-off request (Session 1 sends it).

## Fix pass 1

Source: implementation-reviewer (full) on `3c2c6c0..d5cc201`, one flag `[test-honesty]`: U6b names "`q1`/`q2`
show `of 2` on those rows" but only `q1`'s `of` is asserted.

Change — `src/utils/usageEfficiency.test.js`, test `'U6b a QB under 14 attempts a game keeps the value, is unranked
and is not counted'` only: build `const two = grid('q2', 'QB', careerStats, playerMap)` beside `one`, and inside the
existing `for` loop add `expect(cellOf(two, id).of, id).toBe(2)`. Asserts every floored-in QB, not just the
top-ranked one, reports the same N; fails if `of` depends on the queried player.

Red step: in `rankInPool` temporarily set `of` to the count of pool values not better than `value` (a
player-relative count) → `q2`'s `sackPct` `of` becomes 1 (q1's stays 2), so the new assertion fails while the old
`q1` assertion passes; revert.

Leave alone: every other test, all source files, the layout deviations (accepted), the live legend's
`so far` wording (as specified). Done-definition: `npm test`, `npm run lint`, `npm run build`; commit.

## Verification

Session 1, 2026-11-25. Implementation `d5cc201` (Session 2, sonnet); fix pass `a15490c` (fix-applier).
- implementation-reviewer, full (opus, high), on `3c2c6c0..d5cc201`: one flag `[test-honesty]` (U6b asserted
  only q1's `of 2`) → Fix pass 1. All rules confirmed against the diff (one pool per season/position; `of N` =
  ranked count; QB floor via `METRIC_BY_ID`; sackPct inversion; `LIVE_SEASON_GAMES` + U11, seam test untouched;
  one `buildWindowStats` per column; `historicalTeamTotals` context key removed, memo kept; every §6 doc edit).
  No scope beyond the touch list; no registry or backlog change.
- Session 2's deviations accepted: header wraps; role popover opens leftwards; card grows 160px (`pb-40`) while a
  row-label popover is open; `FROZEN_POPOVER_LIFT` on label cells; spacing-cover shadow; role gloss keeps the old
  sentence and appends the numbers; `cmpPct` `field` text and `deltaFormat` moved to the fraction scale; U4's
  "no live column" test widened (the named mutation alone stayed green on `complete: false`).
- Fix-pass re-review, light, on `d5cc201..a15490c`: no flags. Red step run by Session 1 (fix-applier hand-back
  was empty): `of: poolValues.length - better` → U6b fails "passerRating: expected 1 to be 2" on q2; reverted.
- Checks at `a15490c`: `npm test` 3740/3740 · lint 0 · build clean apart from the pre-existing Vite chunk-size
  notice (also printed by a build of 3c2c6c0).
- Open: live legend line says `${S} so far` even when the completed live season's header shows the bare year
  (as specified; copy follow-up if wanted). Pre-2020 `NOT MEASURED THEN` note covered by tests only.
