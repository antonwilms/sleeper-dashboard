# In-season evidence — Phase 1: the update layer, view-only, in Market

Parent: `.claude/tasks/in-season-evidence.md`. Read its verbatim design doc (the k tables and the
phasing constraint) and its "Findings from Phase 1 planning" before starting.

**What this slice ships:** a pure module that blends the current projection with this season's
games (`src/utils/inSeasonEvidence.js`), and a fifth Market column set, **In-season**, that shows
the observed live-season numbers beside the blended ones.

**What it must not do:** put anything into `seasonProjections`, `playerRows`, the dynasty score, or
a snapshot. Every day a posterior reaches a snapshot writes a contaminated 2026 projection that can
never be removed (parent §Phasing). That is why the only consumer is `Market.jsx`, and why §6's
guard test exists.

---

## §1 Verified facts (2026-09-25, against live source and the live data store)

| Fact | Evidence |
|---|---|
| The live file is loaded already; Market does not receive it yet | `App.jsx:195` state, `:980-990` effect keyed on `nflState.season`; Market props `Market.jsx:320-324` have no `currentSeasonTotals`; `App.jsx:1272-1287` |
| Loader result shape is `{ players, season, complete }`; `complete: false` for all three `null`-manifest cases (missing / store disabled / manifest fetch failed) — copy must be true in all three | `sleeperStats.js:317-336`, header `:300-315` |
| Live file today: `schemaVersion 4`, `inProgress: true`, `lastModified 2026-09-22T18:44:37Z`; `gamesPlayed` distribution `{0: 779, 1: 203, 2: 1461}` | fetched `nfl/season-totals/2026.json` + manifest, 2026-09-25 |
| Live rows carry `stats`, `team`, `gamesPlayed`, `fantasyPoints`, `weeklyPoints`, `weeklyStatus`, `scoringBasis`, … — `fantasyPoints` is the sum of `weeklyPoints` | same fetch; e.g. `weeklyPoints {1: 8.6, 2: 20.6}` → `fantasyPoints 29.2` |
| **`scoringBasis` is `"half_ppr"` on every row of 2025 (2832/2832) and 2026** — the same basis `projectedPPG` is built on when careerStats comes from the store, and the study's basis | same fetch, both years |
| The **live-API** careerStats path computes `fantasyPoints` with **league** scoring and writes no `scoringBasis` | `sleeperStats.js:287` |
| `weeklyStatus` marks future bye weeks `'B'` ahead of time (a KC row shows `'B'` at week 5 on 2026-09-22) — **never derive `n` from `weeklyStatus`**; `gamesPlayed` is the count | same fetch |
| Sleeper omits a zero stat rather than storing it: an absent `rush_att` on a row with `gamesPlayed > 0` is a real 0 | memory/W-series lesson; `/week` precedent |
| `blendWeight(n, k)` already exists: `n/(n+k)`, `null` for `n == null` or `!(k > 0)`, and `n = 0` is a real weight of 0. It is the only **exported** helper for this weight; `opponentStrength.js:107` and `Teams.jsx:78` each compute the same weight inline (left alone — no refactor) | `src/utils/blendWeights.js:34-37` |
| `row.projectedPPG` on Market's rows is the snapshot's `projection.projectedPPG` (same value) — this is the points prior | `App.jsx:599-621`; Outlook renders it `Market.jsx:844` |
| Market's `dataSeason` is `volumeSeasons[0]` (max careerStats key) — no new prop needed | `Market.jsx:370-374` |
| `enrichedRows` and the sort memo **fall through to volume** for any unlisted set; the header/row render does too | `Market.jsx:664-667`, `:703-716`, `:912` `else` |
| `loadColumnSet` accepts any member of `COLUMN_SETS`, else `'value'` | `Market.jsx:141-157` |

---

## §2 `src/utils/inSeasonEvidence.js` (new) — pure, no React, no I/O

### 2.1 Constants

Header comment: purpose, the view-only rule (only `Market.jsx` may import this in Phase 1 — §6
guards it), and a pointer to the parent task file for the k tables' source.

```js
// PROVISIONAL(heuristic): every k below · measured by an out-of-repo 2012–2025 stability study
// (parent in-season-evidence.md), not reproduced in-repo · Phase 2's graded backtest re-fits them
export const K_ROS_POINTS      = { QB: 6,   RB: 3,   WR: 4.5, TE: 5.5 }
export const K_ROS_POINTS_WEAK = { RB: 3,   WR: 3.5, TE: 4 }     // below-median prior volume
export const K_ROS_POINTS_STRONG = { RB: 3, WR: 5,   TE: 6 }     // at/above median
export const K_ROS_OPP         = { QB: 5,   RB: 2,   WR: 2.5, TE: 2.5 }
export const K_DYN_POINTS      = { QB: 7.5, RB: 4.5, WR: 6.5, TE: 6.5 }
export const K_DYN_OPP         = { QB: 5.5, RB: 3.5, WR: 4.5, TE: 4 }
export const MIN_PRIOR_GAMES   = 8   // the study's population floor — below it, weights are extrapolated
export const IN_SEASON_POSITIONS = ['QB', 'RB', 'WR', 'TE']
// PROVISIONAL(heuristic): "meaningful opportunity baseline" thresholds · judgment, not measured · Phase 2 backtest
export const MIN_BASELINE_GAMES = 4    // prior-season games needed for an opp/g baseline
export const MIN_BASELINE_OPP   = 2.0  // prior opp/g below this = no role last season
```

**Meaningful opportunity baseline** (amendment 1, Anton 2026-09-25) — exactly:
`prior` exists **and** `prior.gamesPlayed >= MIN_BASELINE_GAMES` **and**
`opportunitiesPerGame(prior, pos) >= MIN_BASELINE_OPP`. Both boundaries are inclusive
(4 games / 2.0 opp/g *is* a baseline). Rationale: under 4 games the rate rests on fewer games than
the opportunity k itself (2–5.5), and under 2 opportunities a game the player had no role — a shift
measured against that is really just the size of the new role.

Transcribe the values exactly. **Target share is not built** (k within 0.5 of opportunities', and a
partial-season team share needs its own denominator work) — say so in the header.

**Which k is used for rest-of-season points:** QB → `K_ROS_POINTS.QB` (no split was measured);
RB/WR/TE → `K_ROS_POINTS_WEAK` or `K_ROS_POINTS_STRONG` by the player's prior-volume band (§2.3).
**Extrapolated players** (§2.4 — rookies and anyone under `MIN_PRIOR_GAMES` last season) take
`K_ROS_POINTS_WEAK` for RB/WR/TE per Anton's amendment; **QB takes `K_ROS_POINTS.QB`**, because no
weak-prior QB value was measured and inventing one would be a second extrapolation. `K_ROS_POINTS`
for RB/WR/TE is the fallback when a position's median is `null` (§2.3). Dynasty-horizon and opportunity k have no split; use
the flat table for every player, extrapolated or not.

### 2.2 Opportunities

```js
// PROVISIONAL(heuristic): opportunity definition · the study doc does not define it · Phase 2 fixes it when reproducing the study
export function opportunitiesPerGame(row, position)
```

- QB: `pass_att + rush_att`. RB/WR/TE: `rush_att + rec_tgt`.
- Returns `null` unless `row` exists and `Number.isFinite(row.gamesPlayed) && row.gamesPlayed > 0`.
- A missing stat key counts as `0` **only** under that `gamesPlayed > 0` gate (Sleeper omits zeros).
  A key present with a non-finite value → return `null` (never treat garbage as 0).
- Any other position → `null`.

### 2.3 Prior-season context — `buildPriorSeasonContext(careerStats, dataSeason, playerMap)`

One pass over `careerStats[dataSeason]` (medians and basis together). For each player id with `playerMap[id]?.position` in
RB/WR/TE and `gamesPlayed >= MIN_PRIOR_GAMES`, collect `opportunitiesPerGame`. Return
`{ RB: median|null, WR: median|null, TE: median|null }` (median of an even-length list = mean of
the middle two; empty list → `null`).

Position comes from `playerMap`, **not** from `careerStats` rows (they carry no position). This is
the study's population definition: position group, ≥ 8 prior-season games. It is not restricted to
Market's visible rows, so the band does not change when a filter is applied.

Band rule: `weak` iff prior opp/g `< median`; `strong` otherwise. `median == null` → use the flat
`K_ROS_POINTS[pos]` and band `null`. Extrapolated RB/WR/TE players are `band: 'weak'` by rule
(they are outside the median's population and never compared against it).

The same pass also returns **`seasonBasis`**: over the rows whose `playerMap` position is a skill
position (QB/RB/WR/TE — the same filter, so `TEAM_*`/DEF rows are never read; any game count), the
single `scoringBasis` they share **only if** every such row carries it and all agree; else `null`. Return shape: `{ medians: { RB, WR, TE }, seasonBasis }`. Used by §2.4 rule 3 for players with no prior row.

### 2.4 The builder — `buildInSeasonPosteriors({ playerRows, careerStats, dataSeason, playerMap, currentSeasonTotals })`

**Usable gate first:**

```js
export function usableLiveSeason(currentSeasonTotals, dataSeason) {
  const s = currentSeasonTotals?.season
  return currentSeasonTotals?.complete === true && Number.isFinite(s)
    && Number.isFinite(dataSeason) && s > dataSeason
}
```

Not usable → return `null` (the caller renders its no-data state). Usable → return
`{ liveSeason, priorSeason: dataSeason, maxGames, byId: Map<player_id, Result> }`, where
`maxGames` is the max non-null `games` across the **results** (0 if none) — i.e. over `playerRows`'
players only. **Never scan `currentSeasonTotals.players` whole:** it also holds `TEAM_<abbr>` and
bare-abbr DEF rows (CR-02's Invariant), and a DEF row's `gamesPlayed` is a team's, not a player's.
The live row set is only ever indexed by a `playerRows` id.

Per row in `playerRows` (compute the prior-season context once, before the loop):

```
live   = currentSeasonTotals.players[id] ?? null
prior  = careerStats[dataSeason]?.[id] ?? null
pos    = row.position
```

`Result` — every field present on every result, `null` when not computable:

| Field | Value |
|---|---|
| `games` | `live?.gamesPlayed` if finite, else `null` |
| `ppg` | `live.fantasyPoints / live.gamesPlayed` when `gamesPlayed > 0` and `fantasyPoints` finite, else `null` — **never 0 for an unplayed player** |
| `oppNow` | `opportunitiesPerGame(live, pos)` |
| `oppPrior` | `opportunitiesPerGame(prior, pos)` (its own `gamesPlayed > 0` gate) — shown as data whatever the game count |
| `extrapolated` | `true` iff `pos` is valid and **not** (`prior` exists and `prior.gamesPlayed >= MIN_PRIOR_GAMES`) |
| `hasBaseline` | the meaningful-opportunity-baseline test (§2.1) |
| `newRole` | `!hasBaseline && oppNow != null && oppNow >= MIN_BASELINE_OPP` — a role that did not exist last season |
| `proj` | `row.projectedPPG` if finite, else `null` |
| `band` | `'weak'` / `'strong'` / `null` (§2.3; `null` for QB; `'weak'` for extrapolated RB/WR/TE) |
| `rosPpg`, `rosWeight` | points posterior, rest of season |
| `dynPpg`, `dynWeight` | points posterior, dynasty horizon — computed and tested, **not rendered** in Phase 1 (amendment 2) |
| `rosOpp`, `rosOppWeight` | opportunity posterior, rest of season |
| `dynOpp`, `dynOppWeight` | opportunity posterior, dynasty horizon — computed, **not rendered** in Phase 1 (Phase 2 reads it) |
| `oppShift` | `rosOpp − oppPrior` when `hasBaseline` and `rosOpp` non-null, else `null` |
| `oppShiftSort` | `oppShift` when non-null; when `newRole`, `blendWeight(n, K_ROS_OPP[pos]) × oppNow` — a shift from a prior of 0, shrunk like a real shift so both share one scale; else `null` |

**Eligibility for any posterior** (all must hold, else every posterior field and `oppShift` are
`null`; the observed fields `games`/`ppg`/`oppNow` still fill):

1. `pos` in `IN_SEASON_POSITIONS`.
2. *(Amendment 1 reversed the ≥ 8-game exclusion.)* Rookies and players under `MIN_PRIOR_GAMES`
   last season **do** get a posterior, flagged `extrapolated: true`, with the k in §2.1. The study
   excluded them by construction, so the flag must reach every render of their posterior (§3.5).
3. **Same scoring basis:** `live` is null, or `live.scoringBasis` and the prior basis are both
   non-null strings and equal. The prior basis is `prior.scoringBasis` when a prior row exists, else
   `seasonBasis` (§2.3). **A mismatch guard, not a guarantee** — say so in the code comment; its
   limits are in the parent, finding 6. (A careerStats season built by the live-API fallback has no
   `scoringBasis` → no posterior. Blending a league-scored prior with a half-PPR observation would
   be a plausible-looking wrong number.) The check uses the `prior` careerStats row as the proxy
   for `projectedPPG`'s basis — the projection is built from those rows.

**The blend** — one private helper, reusing `blendWeight` from `./blendWeights` (the app's one
exported definition of the weight — do not add a second):

```
n = live && live.gamesPlayed > 0 ? live.gamesPlayed : 0     // no live row, or 0 games → n = 0
w = blendWeight(n, k)
posterior = priorValue + w * (observed - priorValue)        // == (prior·k + obs·n)/(k+n)
```

- **Null rule, checked in this order:** `priorValue == null` → posterior and weight `null`. Then
  `n = 0` → weight `0`, posterior `= priorValue` (correct, not a fallback: a missed game is not
  evidence — parent §Mechanism; `observed` is `null` here and must not be read). Then
  `observed == null` with `n > 0` → posterior and weight **`null`**. JS coerces `null` to `0` in
  arithmetic, so without this branch a non-finite `fantasyPoints` or a garbage stat key would
  produce a plausible-looking wrong posterior. Every non-null posterior must pass
  `Number.isFinite`.
- Points: prior `proj`, observed `ppg`. `proj == null` → `rosPpg`/`dynPpg` and their weights `null`
  (the opportunity posterior is independent of the projection and still computes).
- Opportunity: prior `oppPrior`, observed `oppNow` — **only when `hasBaseline`**; otherwise `rosOpp`,
  `dynOpp` and their weights are `null` (no posterior against a ~0 baseline).
- Return raw floats. Rounding is the render's job.

**Performance:** one prior-season-context pass + one O(rows) pass. Memoised by the caller (§3.3).

---

## §3 `src/components/market/Market.jsx`

Every one of these is a **named branch placed before the volume fall-through**, per the precedent
comments at `:661-663` and `:700-702`. Missing any one renders volume data under In-season headers
with no error.

### 3.1 Set registration

- `COLUMN_SETS`: append `'inseason'`. `COLUMN_SET_LABELS.inseason = 'In-season'`.
- `COLUMN_SET_GROUPS`: add `'inseason'` to **MODEL & MARKET** after `'outlook'` (the posterior is a
  model output shown beside the projection). Update the `:38-39` comment.
- `DEFAULT_SORT.inseason = { column: 'rosPpg', direction: 'desc' }`.
- `INSEASON_SORTABLE_KEYS = new Set(['full_name', '_trend', 'games', 'ppg', 'proj', 'rosPpg', 'oppPrior', 'oppNow', 'oppShiftSort'])`; register in `SORTABLE_KEYS`. (No `dynPpg` — not rendered.)
- `SORT_LABELS.inseason`: `full_name: 'player', _trend: 'trend', games: 'G', ppg: 'PPG', proj: 'current proj', rosPpg: 'ROS', oppPrior: 'opp/g prior', oppNow: 'opp/g', oppShiftSort: 'opp shift'`.
- `loadColumnSet` needs no change (`COLUMN_SETS.includes` covers it) — add a test that proves it.

### 3.2 Props

Add `currentSeasonTotals = null` to `Market`'s destructured props; extend the `:315-319` props
comment. In `App.jsx`'s `<Market …>` element (`:1272-1287`) add
`currentSeasonTotals={currentSeasonTotals}`. **That is the only `App.jsx` change** — no import, no
memo, no state. (`currentSeasonTotalsIsolation.test.js`'s App.jsx slice test reads the effect body
only and is unaffected.)

### 3.3 Rows

```js
const inSeason = useMemo(() => {
  if (columnSet !== 'inseason') return null
  return buildInSeasonPosteriors({ playerRows, careerStats, dataSeason, playerMap, currentSeasonTotals })
}, [columnSet, playerRows, careerStats, dataSeason, playerMap, currentSeasonTotals])

const inSeasonRows = useMemo(() => {
  if (columnSet !== 'inseason') return []
  return (playerRows ?? []).map(r => ({
    ...r,
    _trend: trendByPlayer.get(r.player_id) ?? null,
    _is: inSeason?.byId.get(r.player_id) ?? null,
  }))
}, [columnSet, playerRows, inSeason, trendByPlayer])
```

`enrichedRows`: add `: columnSet === 'inseason' ? inSeasonRows` before `: volumeRows`.

### 3.4 Sort

New branch in the `displayRows` memo, **before** `// volume`:

```js
if (columnSet === 'inseason') {
  return [...rows].sort((a, b) => {
    if (key === 'full_name') return compareNullsLast(a.full_name, b.full_name, dir)
    if (key === '_trend') return compareNullsLast(a._trend?.delta ?? null, b._trend?.delta ?? null, dir)
    return compareNullsLast(a._is?.[key] ?? null, b._is?.[key] ?? null, dir)
  })
}
```

### 3.5 Header and cells

New `else if (columnSet === 'inseason')` branch **before** the final `else { // volume`.
`colSpan = 9`. Let `S = inSeason?.liveSeason`, `P = inSeason?.priorSeason`; when `inSeason` is
`null`, headers fall back to the unsuffixed form (never print `null`/`undefined` — the
`efficiencyColumnLabel` precedent at `:136-137`).

| # | Header | Sort key | Cell |
|---|---|---|---|
| 1 | Player | `full_name` | `PlayerCell` |
| 2 | Trend | `_trend` | `TrendCell`, same as every set |
| 3 | `G <S>` | `games` | integer; `null` → `—` |
| 4 | `PPG <S>` | `ppg` | 1 dp; `null` → `—` |
| 5 | Current proj | `proj` | 1 dp |
| 6 | ROS | `rosPpg` | `14.2 · 40%` — value 1 dp, then `rosWeight` as a whole percent (the share of the estimate that is this season); `extrapolated` → the **ext** marker after it. `rosPpg == null` → a bare `—`, never `— ext` |
| 7 | `Opp/G <P>` | `oppPrior` | 1 dp |
| 8 | `Opp/G <S>` | `oppNow` | 1 dp |
| 9 | Opp shift | `oppShiftSort` | **Branch on `oppShift != null`** (not `hasBaseline` — a baselined row can have a `null` shift): signed 1 dp (`+2.3`, `−1.1`), coloured with the existing up/down tokens exactly as Outlook's `Δ vs now` cell (`:846-852`), plus **ext** when `extrapolated`. Else `newRole`: `oppNow` 1 dp (unsigned, uncoloured) followed by the **new role** marker — never a shift against ~0. Otherwise `—` |

A `0%` weight renders as `0%` — it is a real weight (player has not played yet), not missing data.

**Markers.** Both are small inline text chips after the value (`font-dp-mono text-[10px]`, the
muted chip tokens `bg-dp-chip text-dp-text-2` used by Outlook's Role cell) with a `title` tooltip:
- **ext** — "Extrapolated: fewer than 8 games last season, or a rookie. The update weights were
  measured on players with 8+ games; for this player they are carried over, not measured."
- **new role** — "No real role last season (under 4 games or under 2 opportunities a game), so
  there is no baseline to shift from. This is this season's opportunities per game."

**The dynasty-horizon posterior is not rendered** (amendment 2): no column, no tooltip, no sort
key. `buildInSeasonPosteriors` still computes `dynPpg`/`dynWeight`/`dynOpp`/`dynOppWeight` and §6.1
still tests them — Phase 2 reads them.

Tag the render site of cells 6 and 9:
`// PROVISIONAL(heuristic): in-season posterior · k from an out-of-repo study · Phase 2 backtest re-fits k`
(one tag covering the branch is enough if the cells sit together; the derivation site's tag
is in §2).

**Tooltips** (on `SortTh`, `tooltip=` prop). Plain language, no r-values, no sample sizes, no
"Phase 2" (W0 §2.1's provenance rule; the parent §0-style gap applies — the study is not in-repo):

- Current proj — "The projection as it stands today. Not frozen at the preseason: it moves
  in-season when a depth-chart change moves its depth factor."
- ROS — "Current projection updated with this season's games. The % is how much of the estimate
  is this season; it grows with every game played. Missed games don't count against a player.
  Weights come from a measured stability study, not yet reproduced in this app."
- Opp shift — "Carries + targets per game (QB: pass attempts + carries), last season versus this
  season's evidence-weighted rate. Volume settles about twice as fast as points, so this moves
  first when a role changes."
- `Opp/G <P>` — "Last completed season, per game played."

### 3.6 Header note (the `:954-962` block)

Add a `columnSet === 'inseason'` paragraph in the same style:

- `inSeason != null`: "`<S>` season to date — up to `<maxGames>` games played. **ext** marks
  rookies and players with fewer than 8 games last season: their update weights are extrapolated."
- `inSeason == null`: "No in-progress season data is loaded — the in-season columns read —."
  **This wording must stay true for all three `complete: false` causes** (§1, row 2). Do not write
  "not available yet".
- **Always, while the set is active** (amendment 4): "Half-PPR basis (Sleeper's own scoring, not
  necessarily this league's)." — the exact string `Teams.jsx:72` and `TeamOffences.jsx:72` use for
  the FPA/points basis, so the caveat reads identically across the app. Copy the string; do not
  import it across components.

### 3.7 What stays unchanged

TREND gutter, filters, pagination, pills, `handleSelectColumnSet` and the stale-sort effect
(`:393-416`, generic via `SORTABLE_KEYS`). Do not touch the other four sets' branches.

---

## §4 Docs

- `src/utils/blendWeights.js` — **header comment only** (`:1-9`): it says it is "the weight
  panel's whole content"; add one sentence that `blendWeight` is also imported by
  `inSeasonEvidence.js` for Market's In-season set. No code change.
- `docs/nav/utils.md` — new row for `inSeasonEvidence.js`, in the style of the `liveAdvStats.js`
  row (`:43`): exports, the usable gate, the eligibility rules, "view-only; only `Market.jsx`
  imports it — `inSeasonEvidenceViewOnly.test.js`".
- `docs/nav/components.md:22` — Market row: five sets, name In-season and its source.
- `docs/ui.md` — the Market section (near `:206-208`): one bullet for the In-season set.
- `docs/signal-registry.md` — CR-18, §5.2 below.
- `src/__tests__/docsAvailabilityClaims.test.js` scans the reference docs: **write mechanism, not
  dated availability** ("renders `—` when no in-progress file is loaded", never "2026 isn't
  published yet").

---

## §5 Cross-repo impact

### 5.1 CR-21 · In-progress season-totals reads — **fires** (new reader of `currentSeasonTotals`)

The entry's Invariant — "must never let it reach the scoring pipeline" — **still holds**, and §6's
guard is what keeps it holding. Only the enumerations go stale.

**App-side edit (Session 2 applies to `docs/cross-repo-registry.md`, inside the mirrored span):**

- **App side:** after `` `src/components/week/DefencesFaced.jsx` (a second, direct read of the same `currentRows`) `` append
  `` , `buildInSeasonPosteriors` / `usableLiveSeason` in `src/utils/inSeasonEvidence.js` (a view-only prior↔live-season blend; reads `gamesPlayed`, `fantasyPoints`, `scoringBasis` and `stats.{pass_att,rush_att,rec_tgt}` off player rows) and its sole consumer, `src/components/market/Market.jsx`'s In-season column set ``
- **Triggers** (app half, before the ` ‖ `): after `` `src/components/week/DefencesFaced.jsx:28` `` append
  `` , `src/utils/inSeasonEvidence.js` (`buildInSeasonPosteriors`, `usableLiveSeason`), `src/components/market/Market.jsx` (the `currentSeasonTotals` prop) ``

- **Invariant:** append one sentence at the end:
  `` Since in-season-evidence-1-view.md the app also relies on two per-row facts of an in-progress file: every player row carries `scoringBasis` (the app refuses to blend a live row against a prior season without a matching basis, so its absence silently empties every in-season posterior), and `gamesPlayed` counts games actually played (it is the blend's n, so counting inactive weeks silently inflates every weight). ``

Anchor all three insertions on the quoted text, not on a line number. Change nothing else in the
entry.

**Mirror (quoted verbatim, CR-21):**

> If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell on `/teams` or `/portfolio`** — it will render a half-season's rates as though they were a season's, with no error and no test failure. `/week` compares each team's DEF-row `gamesPlayed` against that team's scheduled REG games through Sleeper's completed weeks and states the lag (`deriveStoreLag`), so a stopped job surfaces there as a lag notice that never clears. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

**Route:** app applies first, data syncs (the standing two-session route — see memory/registry-edit-route;
the parent-folder precondition is still unmet). **Between this slice's push and the data sync, the
data repo's daily `registry-mirror.yml` run is red** — that red is the sync owed. Keep the window
short.

### 5.1a CR-02 · season-totals row composition — **fires** (a new cross-row reader)

`buildPriorSeasonContext` scans every row of `careerStats[dataSeason]` — the same class of reader
as `buildSeasonPositionRanks`/`computeEmpiricalAgeCurves`, which CR-02 lists. Both halves (medians, `seasonBasis`) exclude
`TEAM_<abbr>` and DEF rows **through the `playerMap` position filter** (neither has a `playerMap`
entry with a skill position) — say so in its code comment, and cover it in §6.1 test 3. The live
row set is never scanned whole (§2.4 `maxGames`).

**App-side edit** (mirrored span):
- **App side:** at the end of the field (after `` `deriveStoreLag:66` (its own per-team scan of DEF-row `gamesPlayed` — a freshness signal, not a rate) ``) append
  `` ; `buildPriorSeasonContext` in `src/utils/inSeasonEvidence.js` (a cross-row scan of `careerStats[dataSeason]` for per-position opportunity medians and the season's single `scoringBasis` — both halves exclude `TEAM_*`/DEF rows via the `playerMap` position filter) ``
- **Triggers** (app half): after `` `computeEmpiricalAgeCurves` (`src/utils/dynastyScore.js:63-64`) and `buildSeasonPositionRanks` (`src/utils/seasonRanks.js:20`) `` append
  `` , `buildPriorSeasonContext` (`src/utils/inSeasonEvidence.js`) ``

**Mirror (quoted verbatim, CR-02):**

> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

Nothing in that Mirror is newly at risk from this slice; the entry fires because its Triggers
enumerate cross-row readers by name.

### 5.2 CR-18 · Signal registry rows — **fires** (Current-use cells gain a consumer)

**App-side edit, `docs/signal-registry.md`** — append to the *current use* cell of each row:

- *Fantasy scoring core* (`:45`): add `` `scoringBasis` `` to the row's field list in the first cell
  (it is now consumed per row for the first time), then append to the current-use cell `; **in-progress season, view-only (in-season-evidence-1-view.md):** `gamesPlayed`/`fantasyPoints`/`scoringBasis` of the live season's rows feed `inSeasonEvidence.js`'s prior↔live blend, rendered only by Market's In-season set — never projection/scoring. This reader uses the **stored** half-PPR `fantasyPoints` (not recomputed from `stats` × `scoringSettings`), gated on a matching `scoringBasis``
- *Receiving volume/air* (`:51`) and *Rushing volume* (`:52`): `; view-only in-season opportunities (`rec_tgt`/`rush_att` per game, live and last completed season) — Market's In-season set via `inSeasonEvidence.js``
- *Passing efficiency keys* (`:50`): `; `pass_att` also counts toward QB in-season opportunities (view-only, Market's In-season set)`

**Mirror (quoted verbatim, CR-18):**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

No field, key or source is added or reclassified, so no data-side `data-catalog.md` change is owed
unless its season-totals row enumerates app consumers — the data session checks (D-42).

### 5.3 Not fired

- **CR-01 / CR-22 (snapshots)** — nothing enters `seasonProjections`, `playerRows` or
  `projectionSnapshot.js`; §6 proves it structurally.
- **CR-04** — no loader, validator or manifest read changes.
- **CR-01 — `[registry-stale]`, recorded not fixed.** CR-01's Market anchors are already stale
  (`Market.jsx:439-446,537` vs live `:471`, `:538`, `:569/571`, and merged `row.projectedPPG` at
  `:541/:770/:799/:844`), and `inSeasonEvidence.js` becomes a new view-only reader of
  `projectedPPG`. Out of this slice's scope — Phase 2 rewrites the projection payload contract
  anyway. Session 2 records it in D-42's note; it does not edit CR-01.
- **CR-15 (R3-FIT mirror)** — no projection constant or `factors` key changes.

### 5.4 Backlog — append **D-42** to `.claude/tasks/data-repo-backlog.md`

"Sync the CR-02 and CR-21 app-side edits (in-season-evidence-1-view.md) into the data registry's mirrored span
and run `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`; check whether
`data-catalog.md`'s season-totals row enumerates app consumers (CR-18) and add the In-season set if
so. Note for the data side: this reader refuses to blend when `scoringBasis` is absent and uses
`gamesPlayed` as the blend's n. `[registry-stale]`, not fixed: CR-01's Market anchors are stale and omit `inSeasonEvidence.js` as a view-only `projectedPPG` reader (in-season-evidence-1-view.md §5.3) — fold into Phase 2's CR-01 rewrite." **Found:** this slice's commit · **Blocking:** yes for CR-24
byte-identity (the daily run is red until synced); no for the app.

---

## §6 Tests

### 6.1 `src/utils/inSeasonEvidence.test.js` (new)

Synthetic fixtures only (the 2025 fixture has no `scoringBasis`). Each asserts a number or a
`null`, computed by hand in the test comment:

1. **Formula:** WR, strong band, `proj 10`, live `gamesPlayed 3`, `fantasyPoints 60` (ppg 20),
   k 5 → `rosWeight 0.375`, `rosPpg 13.75`. Same player, dynasty k 6.5 → `dynWeight 3/9.5`,
   `dynPpg` exact.
2. **Band:** WR with prior opp/g below the median gets k 3.5; at/above gets 5; RB gets 3 in both
   bands; QB gets the flat 6 and `band: null`. Build a `careerStats[dataSeason]` of ≥ 3 WRs with
   `gamesPlayed ≥ 8` so the median is known.
3. **Median population:** a WR with `gamesPlayed 7` last season is excluded from the median but
   **does** get a posterior — `extrapolated: true`, `band: 'weak'`, k 3.5; a K, a `TEAM_KC` row and a `KC` DEF row (no skill-position `playerMap`
   entry) are excluded from every median.
4. **n = 0:** live row with `gamesPlayed 0` → `ppg null`, `oppNow null`, `rosPpg === proj`,
   `rosWeight === 0` (not `null`). No live row at all → same.
5. **Extrapolated (amendment 1):** fixture: every `careerStats[dataSeason]` skill row and the live
   rows carry `scoringBasis: 'half_ppr'`. A rookie WR (no prior row, `proj 8`, 2 games at 14 ppg) →
   `extrapolated: true`, k 3.5 → `rosWeight 2/5.5`, `rosPpg` exact; `dynPpg` uses the flat 6.5. A
   rookie QB uses the flat 6 (no weak QB value). A veteran with exactly 8 prior games →
   `extrapolated: false`; with 7 → `true`.
5a. **Baseline boundary (both inclusive):** prior 4 games at 2.0 opp/g → `hasBaseline: true`,
   `oppShift` numeric. 3 games at 5.0 → `false`. 10 games at 19 opportunities (1.9) → `false`. No prior row → `false`.
   For every `false` case: `rosOpp`/`dynOpp`/`oppShift` `null`.
5b. **New role:** RB, no baseline, 2 games, `oppNow` 6.0 → `newRole: true`, `oppShiftSort === 0.5 × 6.0
   = 3.0` (k 2). `oppNow` exactly 2.0 → `newRole: true`. `oppNow` 1.5 → `newRole: false`, `oppShiftSort null`. No baseline and `n = 0` →
   `newRole: false`. With a baseline → `newRole: false` and `oppShiftSort === oppShift`.
5c. **Season basis for a rookie:** every 2025 skill row `half_ppr` → rookie posterior computes; a
   `TEAM_KC` row without `scoringBasis` does not change that. One 2025 skill row missing it, or two different values → `seasonBasis null` → rookie posteriors
   `null` (veterans with their own matching row unaffected).
6. **Basis mismatch:** live `half_ppr`, prior `scoringBasis` absent → all posteriors `null`.
   Live `half_ppr`, prior `ppr` → all `null`.
7. **`proj` null** → `rosPpg`/`dynPpg` null, `rosOpp`/`oppShift` still computed (given a baseline).
8. **Opportunities:** QB = `pass_att + rush_att`; RB/WR/TE = `rush_att + rec_tgt`; an absent key
   with `gamesPlayed > 0` counts 0; a present non-finite key → `null`; `gamesPlayed 0` → `null`.
9. **`oppShift`** = `rosOpp − oppPrior`, sign preserved (a backup going 2 → 12 opp/g over 2 games,
   RB k 2 → `rosOpp 7`, `oppShift +5`).
10. **Usable gate:** `complete: false` → `null`; `season === dataSeason` → `null`; `season` non-finite
    → `null`; usable → `liveSeason`, `priorSeason`, `maxGames` correct.
11. **Null observed with n > 0:** live `gamesPlayed 2`, `fantasyPoints: NaN` → `ppg null`,
    `rosPpg`/`rosWeight`/`dynPpg`/`dynWeight` all `null` (not the prior, not a number). Live
    `gamesPlayed 2` with `rec_tgt: 'x'` → `oppNow null`, `rosOpp`/`oppShift` `null`. Every
    non-null posterior in the whole test file passes `Number.isFinite`.
12. **Inputs untouched:** run the builder on `Object.freeze`d (deep-frozen) `playerRows`,
    `careerStats` and `currentSeasonTotals`; it must not throw, and a `structuredClone` taken
    before equals the inputs after. `playerRows` are the same objects Portfolio, Teams and the
    pop-up receive.
13. **Live DEF/TEAM rows ignored:** a `currentSeasonTotals.players` holding a DEF row `KC` with
    `gamesPlayed 3` and a `TEAM_KC` row, while every player has `gamesPlayed 2` → `maxGames === 2`.

### 6.2 `src/__tests__/inSeasonEvidenceViewOnly.test.js` (new) — the snapshot-safety guard

Header: this is the Phase 1 structural guarantee that no posterior reaches `seasonProjections`,
`playerRows` or a snapshot; Phase 2 rewrites it into a controlled seam alongside
`currentSeasonTotalsIsolation.test.js` — do not delete it, rewrite it.

1. PIPELINE list **copied verbatim** from `currentSeasonTotalsIsolation.test.js:12-27`: none
   matches `/inSeasonEvidence|buildInSeasonPosteriors/`.
2. `src/App.jsx` and `src/utils/projectionSnapshot.js` do not match that regex.
3. Walk `src/` recursively (`readdirSync`, as `weeklyDecisionViewOnly.test.js` does): the only
   non-test file importing `inSeasonEvidence` is `src/components/market/Market.jsx`.
4. `inSeasonEvidence.js` imports nothing but `./blendWeights` (regex over its `import` lines).

### 6.3 `src/components/market/Market.test.jsx` — extend

Reuse the file's render helpers. **Not its base fixtures:** they stop at 2024 and carry no
`scoringBasis`, so every live-row player would be ineligible. Add an In-season fixture:
`careerStats` with a 2025 season (`scoringBasis: 'half_ppr'` on every row, ≥ 8 games), a
`currentSeasonTotals` for 2026 (`complete: true`, same basis, 2 games), and at least one player
with no 2025 row (the rookie case).

1. The In-season chip renders inside the MODEL & MARKET group, after Outlook.
2. Selecting it with a usable `currentSeasonTotals` renders the nine headers with season suffixes
   (`G 2026`, `Opp/G 2025`) and `Current proj`; **no header contains `Dyn`** (amendment 2); a
   veteran's ROS cell reads `<value> · <pct>%` with no **ext**; the rookie's ROS cell carries
   **ext**; an extrapolated row with `proj` null shows a bare `—`; a baselined row whose `oppShift`
   is `null` (basis mismatch) shows `—` in Opp shift, never `null`/`+null`; a no-baseline player with `oppNow ≥ 2` shows `<oppNow> new role` and no signed value.
2a. The Half-PPR basis sentence renders in both the usable and the no-data state.
3. With `currentSeasonTotals = { players: {}, season: 2026, complete: false }` the note reads the
   §3.6 no-data sentence and posterior cells read `—`; no `null`/`undefined`/`NaN` text anywhere.
4. Sorting by Opp shift orders rows by `_is.oppShiftSort` (a new-role row by its shrunk `oppNow`), nulls last in both directions.
5. `localStorage['market-column-set'] = 'inseason'` restores the set on mount.
6. A stored `market-sort` naming an Outlook-only key while In-season is active falls back to
   `rosPpg desc`.
7. **Fall-through guard:** with In-season active (usable fixture, ALL pill), `Opp shift` renders
   and Volume's ALL-only headers `Yds/G` and `FP/G` do not. (Not the `Season` selector — gated on
   `columnSet` itself; not `G` — In-season's own `G` falls back to that label.)

---

## §7 Done-definition notes

- `factorsSchema`/`statKeysContract` tests: not triggered.
- **Smoke (required, user-visible):** start from `.claude/launch.json`. Market → In-season. Report:
  the note's season and max games; that ROS weights read small (≤ 2 games played → roughly 25–40%
  for points; RB/WR/TE opportunities higher at 44–50%; QB points and opportunities
  both ≈ 25–29%); that rookies show a ROS value with **ext**, that at least one player shows **new role**, that
  there is no Dyn column and the Half-PPR basis line shows; that no
  cell shows `NaN`/`null`; sort by Opp shift and name the top three. Switch to Outlook and back —
  both render. Then confirm the pipeline is untouched: Outlook's `Proj` for two named players is
  identical with the In-season set never opened versus after opening it.
- Hand-back: `grep -rn "PROVISIONAL(" src/` output (four new sites expected: three in
  `inSeasonEvidence.js`, one in `Market.jsx`).
- Commit, then push per the done-definition. **Then flag to Anton that D-42 (data registry sync) is
  owed** — the data repo's daily mirror run is red until it lands.

## §8 Touch list

New: `src/utils/inSeasonEvidence.js`, `src/utils/inSeasonEvidence.test.js`,
`src/__tests__/inSeasonEvidenceViewOnly.test.js`.
Edited: `src/utils/blendWeights.js` (header comment only), `src/components/market/Market.jsx`, `src/components/market/Market.test.jsx`, `src/App.jsx`
(one prop), `docs/nav/utils.md`, `docs/nav/components.md`, `docs/ui.md`, `docs/signal-registry.md`,
`docs/cross-repo-registry.md` (CR-02 and CR-21 only), `.claude/tasks/data-repo-backlog.md` (D-42).
**Not touched:** `seasonProjection.js`, `dynastyScore.js`, `projectionSnapshot.js`,
`currentSeasonTotalsIsolation.test.js`, `blendWeights.js` code, `opponentStrength.js`, `CLAUDE.md`.

---

## Review records

In the parent → *Phase 1 review records* (rounds 1–2, amendment 1). §5's two-session registry
route is Anton's standing decision, not an oversight.
