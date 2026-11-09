# Metric glossary + aDOT rename (Brief G)

Review depth: light — labels, tooltips and definition copy only; no value, rank, sort, projection or scoring change; no cross-repo site; the new module is pure data and owns no state.

Session 2 runs on **sonnet**, effort medium.

## Goal

One plain-language source for every metric name and definition shown in Market, the player pop-up and the game log. Rename `aDOT` to **Avg depth** everywhere it renders. Market gets a `?` legend for the current view. Column ids, metric ids and `METRIC_META` keys stay unchanged.

## Out of scope

Pop-up layout (beyond wrapping existing labels in the existing `DefinitionPopover` trigger), any value/format/rank/sort change, `PlayerDetailModal`'s driver rows (`DRIVER_NOTES`), the existing `In-season Opp/G` / `2-yr avg rank` / `Age caution` / `Role` popovers, game-log fixed headers (WK/OPP/RESULT/SPREAD/TOTAL/ROOF/WEATHER/PTS), the `adot*` projection factors, `FactTable.jsx`'s `MUTED_TOOLTIP` fallback (left in place, now unreached for these columns — do not delete it).

## Design decisions (fixed — do not revisit)

- **D1 Entry shape.** `GLOSSARY[id] = { label, short?, definition }`. `label` is the full name; `short` the compact header when it differs. `definition` is one sentence, ends with `.`.
- **D2 Who reads what.** Compact headers (Market, game log aDOT) render `headerLabel(id) = short ?? label`. Pop-up rows and popovers render `label` as the term and `definition` as the gloss. Tooltips (Market `title`, game log `title`) render `glossaryTooltip(id) = \`${label}: ${definition}\``. The full label therefore always appears in the tooltip.
- **D3 Glossary ids.** A Market metric's glossary id is its `MARKET_METRICS` id. A pop-up metric that is the same quantity as a Market metric uses that Market id (see the mapping table); a pop-up metric with a different denominator (per-season-team shares vs Market's games-played shares) gets its own id. Same-quantity sharing is what makes the drift test meaningful.
- **D4 No visible label changes except aDOT.** Every Market header, every rendered pop-up row label and every game-log header must read exactly what it reads at HEAD, except `aDOT` (Market WR/TE + QB `passAdot`) → `Avg Dp`, pop-up `aDOT` row → `Avg depth`, game log `aDOT` → `AVG DP`. Glossary `label`/`short` values below are chosen to satisfy this; Test 4 pins it.
- **D5 Game log keeps its positional abbreviations.** `GAME_LOG_COLUMNS` labels (`YDS`, `TD`, `CAR`, …) mean different stats per position and are narrower than any glossary header; they stay literal in `gameLog.js`. Each column gains a `glossaryId`; the header gets `title={glossaryTooltip(glossaryId)}`; the aDOT column's label becomes `'AVG DP'`. This is a deliberate deviation from Brief G §3 ("gameLog.js labels read from the glossary") — Session 1 flags it to Anton.
- **D6 Game log uses `title`, not `DefinitionPopover`.** The game-log table sits inside an `overflow-x-auto` container, which would clip an absolutely positioned popover. Header `title`s only; no `?` legend in the game log.
- **D7 Market value columns keep their own `label`.** `factViews.js` value columns (`G`, `Owner`, `Dynasty` vs Model's `Dynasty score`, …) keep their descriptor `label`; they gain `glossaryId` (defaults to the column `id` — set explicitly only where it differs) and their `tooltip`/`rosTooltip` come from the glossary. `FactTable.tooltipFor`'s `prevFpPerGRank` season-specific override stays.
- **D8 Pop-up metadata keeps its field names.** `usageEfficiency.js` `METRIC_META` and `EnvironmentSection.jsx`'s local `METRIC_META` keep `label`/`note` keys (consumers unchanged); their values are filled from the glossary at module load, and each entry gains `glossaryId`. `field`, `domain`, formatters untouched.
- **D9 Legend reuses `DefinitionPopover`.** A `?` trigger with `term` = `"<View> columns"` and `gloss` = a `<dl>` node. No new popover component.

## 1. New `src/utils/metricGlossary.js` (pure, no imports)

Exports:

```js
export const GLOSSARY = { /* id → { label, short?, definition } */ }
export function headerLabel(id)      // GLOSSARY[id].short ?? GLOSSARY[id].label; throws on unknown id
export function glossaryTooltip(id)  // `${label}: ${definition}`; throws on unknown id
export const TILE_GLOSSARY_IDS = {
  dynasty: 'dynastyScore', market: 'ktcValue', sofar: 'soFarPpg',
  next: 'projectedPPG', nextRos: 'projectedPPGRos', floor: 'floorRisk',
}
```

Throwing on an unknown id makes a typo fail at import time in every test, not render `undefined`.

Header comment: view-only copy; never imported by projection/scoring; add an id here in the same change as any new rendered column.

### Entries (copy verbatim; `—` in the short column = no `short`)

**Market metrics** (`MARKET_METRICS` ids):

| id | label | short | definition |
|---|---|---|---|
| fp | Fantasy points | FP | Fantasy points scored in the window. |
| fpPerG | Fantasy points per game | FP/G | Fantasy points per game played. |
| passYd | Passing yards | Pass Yd | Yards gained on his completed passes. |
| passYdPerG | Passing yards per game | Pass Yd/G | Passing yards per game played. |
| passTd | Passing touchdowns | Pass TD | Touchdown passes thrown. |
| passTdPerG | Passing touchdowns per game | Pass TD/G | Touchdown passes per game played. |
| cmpPct | Completion % | Cmp% | Share of his pass attempts that were caught. |
| ypa | Yards per attempt | Y/A | Passing yards per pass attempt. |
| passTdRate | Touchdown rate | TD% | Share of his pass attempts that went for a touchdown. |
| intRate | Interception rate | INT% | Share of his pass attempts that were intercepted. |
| sackRate | Sack rate | Sack% | Share of his dropbacks (pass attempts plus sacks) that ended in a sack. |
| passerRating | Passer rating | Rating | The NFL passer rating formula, built from completions, yards, touchdowns and interceptions per attempt. |
| passAdot | Avg depth | Avg Dp | Average depth of his throws, in yards past the line of scrimmage. |
| passAttPerG | Pass attempts per game | Pass Att/G | Passes thrown per game played. |
| passCmpPerG | Completions per game | Cmp/G | Completed passes per game played. |
| sacks | Sacks taken | Sacks | Times he was sacked. |
| sacksPerG | Sacks taken per game | Sacks/G | Times he was sacked per game played. |
| rushAtt | Carries | Car | Rushing attempts. |
| rushAttPerG | Carries per game | Car/G | Rushing attempts per game played. |
| rushYd | Rushing yards | Rush Yd | Yards gained on his carries. |
| rushYdPerG | Rushing yards per game | Rush Yd/G | Rushing yards per game played. |
| rushTd | Rushing touchdowns | Rush TD | Touchdowns scored on his carries. |
| rushTdPerG | Rushing touchdowns per game | Rush TD/G | Rushing touchdowns per game played. |
| ypc | Yards / carry | Y/C | Rushing yards per carry. |
| yacoPerAtt | Yards after contact per carry | YACo/Att | Yards he gained after the first defender made contact, per carry. |
| ybcPerAtt | Yards before contact per carry | YBC/Att | Yards he gained before a defender made contact, per carry, which mostly reflects his blocking. |
| btkl | Broken tackles | Brk Tkl | Tackles he broke or evaded on his carries. |
| btklPerG | Broken tackles per game | Brk Tkl/G | Broken tackles on carries per game played. |
| btklRate | Broken tackle rate | Brk Tkl% | Broken tackles as a share of his carries. |
| tgt | Targets | Tgt | Passes thrown his way. |
| tgtPerG | Targets per game | Tgt/G | Passes thrown his way per game played. |
| rec | Receptions | Rec | Passes he caught. |
| recPerG | Receptions per game | Rec/G | Catches per game played. |
| recYd | Receiving yards | Rec Yd | Yards gained on his catches. |
| recYdPerG | Receiving yards per game | Rec Yd/G | Receiving yards per game played. |
| recTd | Receiving touchdowns | Rec TD | Touchdown catches. |
| recTdPerG | Receiving touchdowns per game | Rec TD/G | Touchdown catches per game played. |
| catchPct | Catch rate | Catch% | Share of his targets he caught. |
| ypr | Yards per reception | Y/R | Receiving yards per catch. |
| ypt | Yards per target | Y/Tgt | Receiving yards per pass thrown his way. |
| aDOT | Avg depth | Avg Dp | Average yards past the line of scrimmage of his targets. |
| dropRate | Drop rate | Drop% | Share of his targets he dropped. |
| scrimYd | Scrimmage yards | Scrim Yd | Rushing plus receiving yards. |
| scrimYdPerG | Scrimmage yards per game | Scrim Yd/G | Rushing plus receiving yards per game played. |
| totalTd | Touchdowns | TD | Passing, rushing and receiving touchdowns combined. |
| totalTdPerG | Touchdowns per game | TD/G | All touchdowns per game played. |
| firstDowns | First downs | 1st Dn | Carries and catches that gained a first down. |
| firstDownsPerG | First downs per game | 1st Dn/G | First downs on carries and catches per game played. |
| looksPerG | Looks per game | Looks/G | Pass attempts plus carries plus targets per game played: every chance he had to touch the ball. |
| fpShare | Fantasy point share | FP Share | His share of his team's offensive fantasy points, in the games he played. |
| tdShare | Touchdown share | TD Share | His share of his team's rushing and receiving touchdowns in the games he played (a QB counts his passing and rushing touchdowns, so his share overlaps his receivers'). |
| scrimYdShare | Scrimmage yards share | Scrim Yd Share | His share of his team's rushing plus receiving yards, in the games he played. |
| snapPct | Snap share | Snap% | Share of his team's offensive snaps he was on the field for. |
| tgtShare | Target share | Tgt Share | His share of his team's targets, in the games he played. |
| carryShare | Carry share | Carry Share | His share of his team's carries, in the games he played. |
| aySh | Air yards share | AY Share | His share of the yards his team's passes travelled in the air, in the games he played. |
| rzTgtShare | Red-zone target share | RZ Tgt Share | His share of his team's targets inside the opponent's 20-yard line, in the games he played. |
| rzRushShare | Red-zone carry share | RZ Car Share | His share of his team's carries inside the opponent's 20-yard line, in the games he played. |
| epaPerAtt | EPA per attempt | EPA/att | Expected points added per pass attempt: how much each throw raised or lowered his team's expected score, on average. |
| cpoe | Completion % over expected | CPOE | How much more often he completes passes than the difficulty of his throws predicts, in percentage points. |
| rushEpaTotal | Rushing EPA | Rush EPA | Total expected points added on his runs. |
| rushEpaPerAtt | Rushing EPA per carry | Rush EPA/att | Expected points added per carry: how much each run raised or lowered his team's expected score, on average. |
| epaPerTgt | EPA per target | EPA/tgt | Expected points added per target: how much each pass thrown his way raised or lowered his team's expected score, on average. |
| racr | Air yards conversion | RACR | Receiving yards per air yard he was targeted with; above 1 means he gains more than the depth of his targets. |

**Market value columns** (`factViews.js`):

| id | label | short | definition |
|---|---|---|---|
| gp | Games | G | Games he played in the window. |
| gs | Games started | GS | Games he started in the window. |
| prevFpPerGRank | Previous rank | Prev rk | His fantasy-points-per-game rank at his position in the prior season. |
| ownerTeamName | Owner | — | The team in this league that rosters him. |
| ktcValue | KTC value | KTC | KeepTradeCut dynasty value, crowd-sourced from dynasty managers, on a 0–10000 scale. |
| dynastyScore | Dynasty score | Dynasty | This app's dynasty value, built from age, trajectory, current level, opportunity and reliability. |
| divergencePct | Vs market | — | How far his dynasty-score rank sits from his KTC rank, as a percentage of rank depth (not a price difference). |
| ktcTrend | KTC trend | — | KeepTradeCut value trend over the captured snapshot window (view only; never moves the projection). |
| projectedPPG | Projection | Next | This app's projected fantasy points per game. |
| projectedPPGRos | Rest of season | ROS | Rest-of-season rate: the preseason projection updated with this season's games. |
| rosDelta | Δ preseason | — | Rest-of-season estimate minus the preseason projection (hover a value for both). |
| oppShift | Opp shift | — | This season's evidence-weighted carries plus targets per game (QB: pass attempts plus carries) against his baseline, as a percentage, unlike Looks/G, which counts pass attempts, carries and targets for every position. |
| signals | Signals | — | Number of dynasty signal badges this player carries. |

**Pop-up-only metrics** (different denominator from any Market metric, or no Market counterpart):

| id | label | short | definition |
|---|---|---|---|
| rushShare | Rush share | — | His share of his team's carries over the season. |
| seasonTgtShare | Target share | — | His share of his team's targets over the season. |
| seasonAySh | Air yards share | — | His share of the yards his team's passes travelled in the air over the season. |
| rushRzShare | Red-zone share | — | His share of his team's carries inside the opponent's 20-yard line over the season. |
| recRzShare | Red-zone share | — | His share of his team's targets inside the opponent's 20-yard line over the season. |
| ayPerAtt | Air yards per attempt | AY/att | Yards his passes travelled in the air, per attempt. |
| gamelogCarryShare | Carry share | — | His share of all his team's runs over the season, quarterback scrambles and sneaks included. |
| yaco | Yards after contact | YAC | Rushing yards he gained after the first defender made contact. |
| drops | Drops | — | Catchable passes he dropped. |
| proe | PROE | — | Pass rate over expected: how much more often his team passes than the score, down and distance predict (positive means pass-heavy). |
| pace | Pace | — | Seconds per play in neutral game situations (lower is faster). |
| successRate | Success rate | — | Share of his team's offensive plays graded successful. |
| rzTdRate | Red-zone TD rate | — | Share of his team's red-zone trips that ended in a touchdown. |
| soFarPpg | So far | — | Fantasy points per game in the live season so far. |
| floorRisk | Floor risk | — | Standard deviation of his per-game fantasy points; higher means more boom-and-bust weeks. |

**Game-log-only**:

| id | label | short | definition |
|---|---|---|---|
| cmpAtt | Completions / attempts | CMP/ATT | Completed passes out of passes thrown. |
| passInt | Interceptions | INT | Passes he threw that were intercepted. |

## 2. `src/utils/marketMetrics.js`

- Import `GLOSSARY`-helpers `headerLabel`, `glossaryTooltip`.
- Remove the `label` argument from `total`, `perGame`, `rate`, `advRate` and from the literal `rushEpaTotal` object; each builder sets `label: headerLabel(id)` and `tooltip: glossaryTooltip(id)`. The three hand-written `tooltip:` fields (`looksPerG`, `fpShare`, `tdShare`) and their spread wrappers' `tooltip` keys are removed (the `{ ...x, rank: false }` wrappers on `sacks`/`sacksPerG` stay).
- Everything else (ids, positions, value fns, formats, `minVolume`, `basis`, `rank`, `PER_GAME_TWIN`, `rankWindow`) is untouched.
- `advancedCaption` (factViews.js) reads `METRIC_BY_ID[...].label` — unchanged output by D4.

## 3. `src/components/market/factViews.js`

- Import `glossaryTooltip`.
- Value columns `G`, `GS`, `PREV_RANK`, `OWNER`, `KTC`, `DYN` and every `MODEL_COLUMNS` entry: keep `label`; set `tooltip: glossaryTooltip(<glossary id>)`. Glossary id = column `id`, except Model's `projectedPPG` column which also sets `rosTooltip: glossaryTooltip('projectedPPGRos')` (its `rosLabel: 'ROS'` stays). Delete `TREND_TOOLTIP` and the hand-written `tooltip`/`rosTooltip` strings they replace. Add a `glossaryId` field on each value column (= its id; `projectedPPG` also `rosGlossaryId: 'projectedPPGRos'`) so the legend and tests can resolve it.
- `factColumns`: unchanged logic. Metric columns already copy `metric.label`/`metric.tooltip`. Add `glossaryId` to its output: metric columns → the resolved metric id (the per-game twin when the Stats toggle swaps it); value columns → `ros && c.rosGlossaryId ? c.rosGlossaryId : c.glossaryId`.
- New export:

```js
// Legend rows for the current view: one per rendered column, in column order.
export function legendEntries(view, pos, opts) // → [{ id, header, name, definition }]
```

  `header` = the column's rendered `label`; `name`/`definition` = `GLOSSARY[col.glossaryId].label`/`.definition`. Same `opts` as `factColumns` (`windowKind`, `statsMode`, `ros`), so the legend lists exactly what FactTable renders.

## 4. `src/components/market/Market.jsx` — legend

- **Left of** the view-selector groups — immediately before the `FACTS`/Model group map, as the first child of that same flex cluster — render the trigger below. Placement is fixed: `DefinitionPopover`'s panel is `absolute w-64` with no right anchoring, so a trigger at the cluster's right edge overflows the viewport; on the left the panel opens over the selectors. Do not modify `DefinitionPopover`. Smoke must confirm the open panel is fully on-screen at desktop width.

```jsx
<DefinitionPopover term={`${VIEW_LABELS[columnSet]} columns`} gloss={<dl>…</dl>}>
  <span aria-label="Column definitions" data-testid="market-legend">?</span>
</DefinitionPopover>
```

  `gloss` is a `<dl>` over `legendEntries(columnSet, posFilter, { windowKind: activeWindow?.kind ?? null, statsMode, ros: isModel && scoringPosteriors != null })` — exactly the values passed to `FactTable` today. Each row: `<dt>` `header` (plus ` · name` when `name !== header`), `<dd>` `definition`. Styling: match existing mono label tokens (`font-dp-mono text-[10px] text-dp-muted`); align the trigger with the selector buttons' baseline. Import `DefinitionPopover` from `../dp/DefinitionPopover` and `legendEntries` from `./factViews`.
- No other Market change.

## 5. Pop-up

- `src/utils/usageEfficiency.js` `METRIC_META`: each entry gets `glossaryId` and `label: GLOSSARY[gid].label`, `note: GLOSSARY[gid].definition` (a small local helper `g(gid) => ({ glossaryId: gid, label, note })` spread into each entry is fine). Mapping:

| METRIC_META id | glossaryId |
|---|---|
| cmpPct | cmpPct |
| passerRating | passerRating |
| sacks | sacks |
| rushShare | rushShare |
| rbTargetShare | seasonTgtShare |
| yardsPerCarry | ypc |
| targetShare | seasonTgtShare |
| airYardsShare | seasonAySh |
| aDOT | aDOT |
| snapShare | snapPct |
| rushRzShare | rushRzShare |
| recRzShare | recRzShare |
| epaPerAtt | epaPerAtt |
| cpoe | cpoe |
| sackPct | sackRate |
| ayPerAtt | ayPerAtt |
| rushEpaTotal | rushEpaTotal |
| carrySh | gamelogCarryShare |
| rushEpaPerAtt | rushEpaPerAtt |
| yac | yaco |
| btkl | btkl |
| epaPerTgt | epaPerTgt |
| racr | racr |
| drops | drops |
| racrLive | racr |

  The retained-unconsumed entries' labels change (e.g. `EPA/ATT` → `EPA per attempt`); they render nowhere, so D4 is not affected. Update the header comment's "one-line note" wording to say notes come from the glossary.
- `src/components/dp/EnvironmentSection.jsx` local `METRIC_META`: same treatment, glossaryId = key (`proe`, `pace`, `successRate`, `rzTdRate`). Not exported (react-refresh lint).
- `UsageEfficiencySection.jsx`, `EnvironmentSection.jsx` render code: unchanged (they already pass `term={row.meta.label} gloss={row.meta.note}`).
- `src/components/dp/PlayerDetailModal.jsx` overview tiles: each tile gets `glossaryId` — `TILE_GLOSSARY_IDS[t.key]`, except `next` uses `TILE_GLOSSARY_IDS.nextRos` when `projection?.inSeason`. In the tile render, wrap `{t.label}` (not `labelMarker`) in `<DefinitionPopover term={GLOSSARY[t.glossaryId].label} gloss={GLOSSARY[t.glossaryId].definition}>`. Tile label text itself unchanged.

## 6. Game log

- `src/utils/gameLog.js` `GAME_LOG_COLUMNS`: add `glossaryId` per column; change WR `adot` label to `'AVG DP'`. Ids unchanged.

| pos | col id | glossaryId |
|---|---|---|
| QB | cmpAtt | cmpAtt |
| QB | yds | passYd |
| QB | td | passTd |
| QB | int | passInt |
| QB | epa | epaPerAtt |
| RB | car | rushAtt |
| RB | yds | rushYd |
| RB | td | rushTd |
| RB | tgt | tgt |
| RB | rec | rec |
| RB | epa | rushEpaPerAtt |
| WR/TE | tgt | tgt |
| WR/TE | rec | rec |
| WR/TE | yds | recYd |
| WR/TE | td | recTd |
| WR/TE | adot | aDOT |
| WR/TE | epa | epaPerTgt |

- `liveSeasonLog.js`: no edit needed (`LIVE_GAME_LOG_COLUMNS` filters the same objects). Its comment's `aDOT = …` wording may stay (comment, not rendered).
- `src/components/dp/GameLogSection.jsx` `GameLogTable`: production `<th>` gets `title={glossaryTooltip(c.glossaryId)}`. Nothing else.

## 7. Docs (same change)

- `docs/nav/utils.md`: new row for `metricGlossary.js` (exports, view-only, who reads it); `usageEfficiency.js` row: label/note now filled from the glossary; `gameLog.js` row if it lists column labels.
- `docs/nav/components.md`: Market row — the `?` legend (`legendEntries`); `dp/GameLogSection.jsx` row — header titles.
- `docs/ui.md`: lines 202/203/290 — `aDOT` → `Avg Dp` in the Stats/Efficiency per-pill lists and `AVG DP` in the game-log list; one sentence that every Market header tooltip and pop-up metric definition reads `metricGlossary.js`, and the legend.
- Follow `docsAvailabilityClaims.test.js` phrasing rules. No CLAUDE.md change (no new directory; utils row lives in nav).

## Tests

New file `src/__tests__/metricGlossary.test.js` unless noted. **Before editing any source**, capture the HEAD pins for Test 4 by running the current code (a throwaway script or `console.log` in a scratch test), then paste them as literals.

1. **Coverage.** For every `view` in `[...FACT_VIEWS, 'model']` × pos `QB/RB/WR/TE/ALL` × `statsMode` `totals/perGame` × `ros` `false/true` × `windowKind` `null/'season'/'live'/'last3'/'career'`: every `factColumns` column has a `glossaryId` with a `GLOSSARY` entry whose `label` and `definition` are non-empty strings. Also every `MARKET_METRICS` id, every `usageEfficiency.METRIC_META[*].glossaryId`, every `environment.SERIES_METRICS` id, every `GAME_LOG_COLUMNS[pos][*].glossaryId`, every `TILE_GLOSSARY_IDS` value. And every definition is one sentence: it ends with `.` and contains no `'. '`. *Asserts every rendered metric is explained; fails if a new column ships with no glossary entry or a multi-sentence definition.* Red check: add a throwaway column id to `FACT_VIEW_COLUMNS.usage.QB` with no entry → red; restore.
2. **No `aDOT` header.** No string in: `MARKET_METRICS[*].label`, every `factColumns` label over the Test 1 grid, `usageEfficiency.METRIC_META[*].label`, every `GAME_LOG_COLUMNS` / `LIVE_GAME_LOG_COLUMNS` label, every `GLOSSARY[*].label` / `.short`, matches `/adot/i`. *Fails if any header reverts to aDOT.* Red check: set `aDOT.short` back to `'aDOT'` → red; restore.
3. **No drift between Market and pop-up.** For every `usageEfficiency.METRIC_META` entry whose `glossaryId` is a `METRIC_BY_ID` key: `METRIC_BY_ID[gid].tooltip === \`${meta.label}: ${meta.note}\``. Plus, in `PlayerDetailModal.usageAvailability.test.jsx` (WR fixture already there), click the `Avg depth` row trigger and assert the dialog text contains `GLOSSARY.aDOT.definition` and the term `Avg depth`; and in `Market.factViews.test.jsx`, assert the WR Stats `Avg Dp` header's `title` equals `glossaryTooltip('aDOT')`. *Asserts both surfaces show one definition; fails if either side hard-codes its own copy.* Red check: hard-code `note: 'x'` on `METRIC_META.aDOT` → red; restore.
4. **Labels unchanged except aDOT (D4).** Pin, from HEAD: `MARKET_METRICS.map(m => [m.id, m.label])`; the `factColumns` label arrays for every view × pos (totals and perGame, `ros` false and true, `windowKind: 'season'`); the rendered `METRIC_META` labels (the 12 non-retained ids) and the four environment labels via a render or the `SERIES_METRICS` row labels; `GAME_LOG_COLUMNS` labels. Assert current output equals the pins with only `aDOT`→`Avg Dp` (Market), `aDOT`→`Avg depth` (pop-up), `aDOT`→`AVG DP` (game log). *Asserts the glossary migration changed no other visible label; fails if a glossary label/short silently renames a header.* Red check: change `GLOSSARY.fp.short` to `'Pts'` → red; restore.
5. **Legend lists the current view.** In `factViews.test.js`: `legendEntries('efficiency', 'WR', {})` ids equal `factColumns('efficiency','WR',{}).map(c => c.id)` and each `definition` equals `GLOSSARY[glossaryId].definition`; with `statsMode: 'perGame'` on `stats`/`RB` the `rushAtt` row's name is `GLOSSARY.rushAttPerG.label`; with `ros: true` on `model` the `projectedPPG` row's definition is `GLOSSARY.projectedPPGRos.definition`. In `Market.factViews.test.jsx`: click `market-legend`, assert the dialog lists the current view's headers, switch view, reopen, assert the list changed to the new view's headers. *Fails if the legend shows a different view's, pill's or stats mode's columns.* Red check: pass a hard-coded `'overview'` to `legendEntries` in Market → red; restore.
6. **Game log header titles.** In `gameLog.test.js`: every `GAME_LOG_COLUMNS[pos]` column has a `glossaryId` in `GLOSSARY`; in `PlayerDetailModal.gameLogDistribution.test.jsx`, the WR `AVG DP` `<th>` has `title === glossaryTooltip('aDOT')`. *Fails if a game-log column loses its definition.* Red check: drop the `title` prop → red; restore.
7. **Tile definitions.** In `PlayerDetailModal.test.jsx` (or `.seasonPhase.test.jsx` for the in-season case): clicking the `DYNASTY SCORE` tile label opens a dialog containing `GLOSSARY.dynastyScore.definition`; with an in-season projection the `REST OF SEASON` tile shows `GLOSSARY.projectedPPGRos.definition`. *Fails if a tile points at the wrong entry or loses its definition.* Red check: map `next` to `projectedPPG` unconditionally → in-season case red; restore.
8. **`headerLabel`/`glossaryTooltip` throw on unknown id.** *Fails if a typo'd id renders `undefined` silently.*

Existing tests that assert old strings (`aDOT` headers in `gameLog.test.js`, `liveSeasonLog.test.js`, `marketMetrics.test.js`, `PlayerDetailModal.*.test.jsx`; the old `looksPerG`/`fpShare`/`tdShare`/`TREND_TOOLTIP`/`rosTooltip` text in Market tests) are updated to the new outcome — say which in the hand-back.

## Copies created

None. Every label/definition has one definition site (`metricGlossary.js`).

## Touch list

`src/utils/metricGlossary.js` (new), `src/utils/marketMetrics.js`, `src/components/market/factViews.js`, `src/components/market/Market.jsx`, `src/utils/usageEfficiency.js`, `src/components/dp/EnvironmentSection.jsx`, `src/components/dp/PlayerDetailModal.jsx`, `src/utils/gameLog.js`, `src/components/dp/GameLogSection.jsx`, tests above, `docs/nav/utils.md`, `docs/nav/components.md`, `docs/ui.md`. Anything else → stop and ask.

## Done-definition

Repo CLAUDE.md done-definition. Smoke (visual): Market Stats WR (header `AVG DP`, hover title), Efficiency QB (`AVG DP`), the `?` legend on two views (open panel fully on-screen, not clipped on the right); pop-up for a WR — Usage row `Avg depth` popover, a tile popover, game log `AVG DP` header title. Report `grep -rn "PROVISIONAL(" src/` (expected unchanged).
