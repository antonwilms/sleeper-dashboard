# Slice B — My Team: header, tiles, Starting ten, Bench

**Repo:** `sleeper-dashboard`. **Session 2 model:** sonnet. **Depends on:** Slice A (`src/utils/lineup.js`,
`.claude/tasks/lineup-engine.md` — read its §0 and §2 first).
**Design source:** `Portfolio v4 - football first.dc.html`, block `8a`. It is **not in the repo**; it is inside
`~/Downloads/App design overhaul(1).zip`. Extract it to a scratch dir to read it. Ignore `<x-dc>`/`support.js`;
`<sc-for>` is a `.map()`. Only the header, tiles, *Starting ten* and *Bench* blocks are this slice. The
ladder ("Where you rank"), weakest-slots and "offences" blocks are later slices — do not build them.
**Not scoring-affecting.** View-layer only; no memo in the `playerRows` pipeline changes.

---

## 0. Decision summary (read first — each departs from the originating brief or the design, with the reason)

| # | Brief / design said | This plan does | Why |
|---|---|---|---|
| D1 | `SNAP` from `advStats`; check its coverage | `SNAP` from season-totals `off_snp / tm_off_snp` via `outlookUsage.buildUsageHistory` (latest entry whose `season === dataSeason`). Real values; `—` for QB. **`advStats` is not passed to Portfolio.** | `advStats.byId[id]` carries `targetShare, airYardsShare, wopr, racr` only (`src/api/advStats.js:39`). It has no snap field. `buildUsageHistory` already serves Market's `SNAP%` and the pop-up; `off_snp` is confirmed 2020+ (`docs/signal-registry.md:47`). |
| D2 | `SHARE` from `computeHistoricalShares` | Same `buildUsageHistory(id, pos, careerStats, perSeasonTeamShares)` call, reading `.share`. `perSeasonTeamShares` is built **locally**, exactly as Market (`Market.jsx:453-460`) and the pop-up (`UsageEfficiencySection.jsx:24-31`) build it: `buildTeamShareTotals` → `buildPerSeasonTeamShares` from `outlookPositionStats.js`. **No `historicalShares` prop.** | Plan review: `App.jsx`'s `historicalShares` is the projection-pipeline series (`resolveAttributedTeam`). Every view surface feeds `buildUsageHistory` the view-only series (`resolvePlayerTeam`, same math, `outlookPositionStats.js:60-65`). Using the other would let My Team's SHARE disagree with the pop-up opened from the same row. Gated `gamesPlayed ≥ 8` → `—` under 8 games; QB always `null` (`outlookUsage.js:66`). |
| D3 | `STATUS` "not available — ship `—`"; tile clause "only when the data is there" | `STATUS` renders `playerMap[id].injury_status` (+ `injury_body_part`) when non-null, and `—` otherwise. The tile clause is built from the same field. | `playerMap` is the **raw, unslimmed** Sleeper `/players/nfl` payload (`sleeper.js:46`, 24h cache, no field filter). That payload carries `injury_status`/`injury_body_part`, so the brief's premise is false. Its own rule is "render when the data is there". Healthy is `null` → `—`; the design's `ACTIVE`/`ROOKIE`/`NEW TEAM` are **not** inferred. **Product call; reversing it is one cell.** The ephemeral-inputs invariant names injury signals, but this slice reads them for **display only**; nothing is graded or reconstructed from them. Adding `injury_status` to `projectionSnapshot.js` would be a snapshot-envelope change (CR-01) and is **out of scope**; the new registry row says "not captured". |
| D4 | `ROLE` `RB1`, `WR2 · was RB1` | `ROLE` = `{depth_chart_position}{depth_chart_order}` raw from `playerMap` (e.g. `RB1`, `LWR1`, `SWR2`, `QB1`). `—` if either is null. **No `was …` clause.** | Sleeper orders WRs within `LWR`/`RWR`/`SWR`, so "`WR2`" would require breaking three-way order-1 ties by guesswork. The raw pair is real data. A `was` clause needs a prior depth chart, and the app has no historical depth loader (`nflverse/depth/` is data-side only). *Omit rather than approximate.* |
| D5 | `VS MEDIAN STARTER` "comes from Slice A's medians" | Two **new** exports in `lineup.js` (§2): `buildSlotMedians` and `startingBar`. The bar is the **lowest league-median slot the player is eligible for**. | Slice A exposes no per-slot league median. `buildWeakestSlots` computes one internally, excludes my team, and covers my slots only. "Positive = he'd start on a typical team" is exactly "beats the weakest eligible slot a median team fills". |
| D6 | Slot order `QB · SF · RB · RB · WR · WR · WR · TE · FLX · FLX` | `rosterPositions` order: `QB · RB · RB · WR · WR · WR · TE · FLX · FLX · SF` (labels `FLEX→FLX`, `SUPER_FLEX→SF`) | The brief names `rosterPositions` order as the source, but then lists a different order. The league array has `SUPER_FLEX` last (Slice A §3.1 `LEAGUE`). Slot index is the join key Slice C's weakest-slots uses. A visual reorder can follow later. |
| D7 | Design bench has fewer columns (`GAMES` as text, no Δ/POS RANK/strip/GAME SCRIPT) | Brief wins: bench = Starting ten's columns minus `Slot`, plus `VS MEDIAN STARTER` after `Δ` | Brief is explicit ("Same columns as §4, plus"). |
| D8 | Design: picks "no points, so no row" | Brief wins: picks are bench rows | Brief is explicit. |
| D9 | `POS RANK` via `buildSeasonPositionRanks` | `rankPositionSeason(careerStats[dataSeason], playerMap, pos)` from the same module, once per position, which also supplies last-season `ppg` | `buildSeasonPositionRanks` walks **every** season to produce this one. `rankPositionSeason` is its single-season body (`seasonRanks.js:4`). Same ranking, no games floor — identical to Market's Ceiling/Floor. |
| D10 | Games strip: played / missed / bye | Played `P`, missed `D`, **dashed = `B` or `X`**, legend "bye or no game". Games text `P/(P+D)`. | Served 2025 season-totals carry `'X'` at byes (D-1 is forward-only; `availabilityGrid.js` header). Labelling the dashed cell "bye" alone would assert a bye that the data does not record. |
| D11 | — | Remove `ktcHistory` prop, `usePlayersTable`, sort headers, `SORTABLE_KEYS` | Both tables have fixed orders (slot order; projected desc). `ktcHistory` fed only the deleted tile deltas. |
| D12 | Data to Portfolio | Props from `App.jsx`, **not** `ProfileDataContext` | Portfolio and Market are props-only by stated convention (`docs/navigation.md:97`, Market's row in `docs/nav/components.md`). |
| D13 | Cards | No outer frame. The design's `#0b0c0e` bordered outer box is the artboard. Tiles and tables are `bg-dp-card border border-dp-border rounded-[10px]`; page stays `bg-dp-canvas`. | Matches Market. The design's inner cards are already `#131519` = `dp-card`, so nothing about the flat treatment is load-bearing. |

---

## 1. Terminology

- UI title **`My Team`** everywhere the design says "Front office": page `<h1>` and the empty state's `<h1>`.
  No "front office / portfolio / asset / capital" wording in UI copy.
- `src/components/shell/navItems.js` `PRIMARY_NAV`: `label: 'Portfolio'` → `label: 'My Team'`. **Keep
  `key: 'portfolio'` and `path: '/portfolio'`** (`byKey('portfolio')` depends on the key). No redirect.

---

## 2. `src/utils/lineup.js` — two new exports

Append after `buildWeakestSlots`. The module stays a leaf with no imports. Reuse the file's private
`median` and `SLOT_ELIGIBILITY`.

```js
// Per-slot-index league median across ALL teams in leagueLineups (mine included), finite points
// only — same median rule as buildPositionLadders. side: 'last' | 'proj'.
export function buildSlotMedians(leagueLineups, side)
//   → [] when !leagueLineups?.length
//   → leagueLineups[0][side].slots.map((s, i) => ({
//        slot: s.slot, slotIndex: i,
//        median: median(leagueLineups.map(l => l[side].slots[i]?.points ?? null)),
//      }))

// The bar a player of `position` must clear to start on a median team: among entries whose
// SLOT_ELIGIBILITY[slot] includes `position` and whose median !== null, the LOWEST median;
// ties → lower slotIndex. Returns that entry object, or null (position not in LINEUP_POSITIONS,
// no eligible slot, or every eligible median null).
export function startingBar(slotMedians, position)
```

Header comment on `buildSlotMedians`: unlike `buildWeakestSlots`, it **includes** my team, because the
question is "the league's median starter", not "mine vs the others".

---

## 3. `src/App.jsx` — the `/portfolio` route (`:1182-1194`)

- **Props:** replace the `<Portfolio …/>` props with the existing ones minus `ktcHistory`, plus five new
  ones:
  ```jsx
  careerStats={careerStats}
  playerMap={leagueData.playerMap}
  rosterPositions={leagueData.rosterPositions}
  scoringSettings={leagueData.scoringSettings}
  leagueName={selectedLeague?.name ?? null}
  ```
- **Comment:** replace the `{/* No careerStats prop — … */}` comment above the route (`:1177-1180`)
  with a one-line comment: Portfolio reads `careerStats`/`playerMap` for the lineup, rank, games, share,
  snap and role columns, and is props-only like Market.

No other `App.jsx` change. **Do not pass `historicalShares`** (D2). **Do not touch** the `teamContext`
memo or anything named near it.

---

## 4. `src/components/portfolio/Portfolio.jsx` — replace the body

### 4.1 Keep, delete, add

**Keep verbatim:**
- `ordinal`, `PickCell`, `PickValueCell`;
- the `liveSeasons` / `allPickOwnership` / `rosterNameById` / `myRosterId` / `myPickRows` /
  `myPricedPickRows` memos;
- the `ownedRows` memo;
- the `myTeamName == null` early return, with its heading changed to `My Team`.

**Delete:**
- `DEFAULT_SORT`, `SORTABLE_KEYS`, `HORIZON_THRESHOLD_YEARS`, `AGE_BANDS`;
- the local `median`, `horizonInfo`, `seriesValueAt`, `computeRosterValueDelta`,
  `computeConcentrationDelta`, `TileDelta`;
- the `M/teamValueTotals` memo, `pickValueByRoster`, `teamValueTotalsWithPicks`, `tiles`,
  `ageBandValues`, `holdingsRows`;
- `usePlayersTable` and its effect, `displayRows`;
- the imports of `DegradedBlock`, `SortTh`, `CareerBars`, `compareNullsLast` and `usePlayersTable`.
- `unpricedPickCount` is deleted too; nothing renders it now.

**Signature:**
```js
export function Portfolio({
  playerRows = [], loaded = false, rosterTeams = [], seasonProjections = null,
  myTeamName = null, onOpenPlayerDetail = () => {},
  tradedPicks = null, ktcPickTable = null, firstLiveDraftSeason = null, draftRounds = null,
  careerStats = null, playerMap = null,
  rosterPositions = [], scoringSettings = null, leagueName = null,
})
```

**New imports:**
- `buildLeagueLineups`, `buildPositionLadders`, `buildSlotMedians`, `startingBar` from
  `../../utils/lineup`;
- `rankPositionSeason` from `../../utils/seasonRanks`;
- `buildUsageHistory` from `../../utils/outlookUsage`;
- `buildTeamShareTotals`, `buildPerSeasonTeamShares` from `../../utils/outlookPositionStats`;
- `buildAvailabilityGrid` from `../../utils/availabilityGrid`;
- `deriveDataSeason` from `../../utils/environment`;
- `PlayerCell`, `ClickableRow`, `DeltaCell` from `../dp/cells`;
- `DefinitionPopover` stays.

Update the file-header comment to describe the new screen (drop the 1b/Slice 7 tile prose; keep the pick
notes that still apply).

### 4.2 Derived data (all `useMemo`)

- **`dataSeason`** = `deriveDataSeason(careerStats)`: a number, or `null` when `careerStats` is null.
  `projSeason = dataSeason != null ? dataSeason + 1 : null`. **Never** read `nflState`.
- **`leagueLineups`** = `buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions, season: dataSeason })`.
- **Ladders and medians:**
  - `ladders = buildPositionLadders(leagueLineups, myRosterId)`;
  - `ladderBy = Object.fromEntries(ladders.map(l => [l.pos, l]))`;
  - `teamCount = leagueLineups.length`.
- **`slotMedians`** = `buildSlotMedians(leagueLineups, 'proj')`.
- **`myLineup`** = `leagueLineups.find(l => l.rosterId === myRosterId)?.proj ?? null`.
- **`rowById`** = `new Map(ownedRows.map(r => [r.player_id, r]))`.
- **`rankByPos`:**
  - a `{ QB, RB, WR, TE }` map of `rankPositionSeason(careerStats[dataSeason], playerMap, pos)`;
  - each is `Map<id, { rank, points, ppg }>`;
  - `{}` when `careerStats`, `playerMap` or `dataSeason` is null.
- **Per-player facts** — `playerFacts(id, position)` returns
  `{ last, posRank, weeks, played, missed, share, snap, role, status }`:
  - `last` = `rankByPos[position]?.get(id)?.ppg ?? null`;
  - `posRank` = `` `${position}${rank}` `` or `null`;
  - `weeks`:
    - `null` when `careerStats?.[dataSeason]?.[id]` is absent (a rookie or no line);
    - else `buildAvailabilityGrid(careerStats, id, [dataSeason]).rows[0].weeks`;
    - `played`/`missed` = the count of `'P'`/`'D'` in `weeks`, or `null` when `weeks` is `null`;
  - `usage` = `buildUsageHistory(id, position, careerStats, perSeasonTeamShares).find(e => e.season === dataSeason)`, where
    `teamShareTotals = useMemo(() => buildTeamShareTotals(careerStats ?? {}, playerMap ?? {}), …)` and
    `perSeasonTeamShares = useMemo(() => buildPerSeasonTeamShares(careerStats ?? {}, teamShareTotals, playerMap ?? {}), …)`
    — copied from `Market.jsx:453-460`:
    - `share` = `usage?.share ?? null`;
    - `snap` = `usage?.snapPct ?? null`;
  - `p = playerMap?.[id]`:
    - `role` = `p?.depth_chart_position && p?.depth_chart_order != null ? `${p.depth_chart_position}${p.depth_chart_order}` : null`;
    - `status` = `p?.injury_status ? { status: p.injury_status, bodyPart: p.injury_body_part ?? null } : null`.

  Memoise it as a `Map` over the ids of `myLineup.slots` ∪ bench player ids, not per render call.

### 4.3 Header

```
[h1 "My Team"]  [meta line]
[summary sentence]                                   [three tiles]
```

**Layout:**
- Wrapper: `flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-7`.
- Left: `flex-1 min-w-0`.
- Tiles: `grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:shrink-0`.

**Meta line** (`text-[13px] text-dp-muted`): the parts below, non-null ones only, joined with ` · `.
1. `myTeamName`.
2. `leagueName`.
3. The format part, emitted only when `teamCount > 0`: `` `${teamCount}-team ${qbFormat}` ``.
   - `qbFormat` is `superflex` if `rosterPositions` contains `SUPER_FLEX`.
   - Otherwise `2QB` if it contains ≥2 `QB`.
   - Otherwise `1QB`.
4. The scoring part, from `scoringSettings?.rec`:

   | `rec` | Part |
   |---|---|
   | `1` | `PPR` |
   | `0.5` | `half-PPR` |
   | `0` | `standard` |
   | any other finite | `` `${rec}-PPR` `` |
   | non-finite or missing | omitted |

   Implement as a small local `formatScoring(rec)`. **Do not import or move `App.jsx`'s `scoringLabel`**,
   because its casing differs.

**Summary sentence** (`data-testid="summary-sentence"`, `text-[15px] text-dp-text-3 leading-normal max-w-[760px]`).
Build from `L = ladderBy.Lineup`; numbers in `font-dp-mono font-semibold`, the projected number
`text-dp-up-text`, the last-season one `text-dp-text`. `f1 = v => v.toFixed(1)`.
- **S1**, when `L?.lastMine != null && L.lastRank != null`: `Your starting ten scored {f1(lastMine)} points a week last season, {ordinal(lastRank)} of {teamCount}.`
- **S2**, when `L?.projMine != null && L.projRank != null`:
  - If S1 rendered: `Projected {f1(projMine)} for {projSeason}, {ordinal(projRank)}.`
  - Else: `Your starting ten is projected {f1(projMine)} for {projSeason}, {ordinal(projRank)} of {teamCount}.`
- **S3** (only when S2 rendered). Let `third = Math.ceil(teamCount / 3)`. Over
  `G = ['QB','RB','WR','TE']` with non-null `ladderBy[g].projRank`:
  - **carry**: exactly one group has the minimum `projRank`, and that rank `≤ third`.
  - **drag**: exactly one group has the maximum `projRank`, that rank `> teamCount − third`, and it is a different group from carry.
  - Phrases (literal):

    | g | carry | drag (top-half form) | drag (weak-spot form) |
    |---|---|---|---|
    | QB | `The quarterbacks carry it` | `the quarterbacks are what keep it out of the top half` | `the quarterbacks are the weak spot` |
    | RB | `The backfield carries it` | `the backfield is what keeps it out of the top half` | `the backfield is the weak spot` |
    | WR | `The wide receivers carry it` | `the wide receivers are what keep it out of the top half` | `the wide receivers are the weak spot` |
    | TE | `The tight end carries it` | `the tight end is what keeps it out of the top half` | `the tight end is the weak spot` |

  - The top-half form applies when `L.projRank > teamCount / 2`; otherwise use the weak-spot form.
  - Both present → `{carry}; {drag}.` Carry only → `{carry}.` Drag only → the drag phrase with its first
    letter upper-cased, plus `.`. Neither → S3 omitted. **Never write a clause the rule did not produce.**
- No S1 and no S2 → the sentence element is not rendered.

**Tiles.** Each tile: `bg-dp-card border border-dp-border rounded-[10px] px-4 py-3 min-w-[150px]`.
- Label: `font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted`.
- Value: `font-dp-mono text-2xl font-semibold tracking-[-0.02em]`.
- Rank: `font-dp-mono text-xs` with `rankClass(r) = r <= third ? 'text-dp-up-text' : r > teamCount - third ? 'text-dp-down-text' : 'text-dp-text-5'`.
- Meta: `text-[11px] text-dp-muted mt-[3px]`.
- Any absent value → `—` in `text-dp-muted`, with no rank and no meta.

| testid | Label | Value | Beside value | Meta |
|---|---|---|---|---|
| `tile-lineup-last` | `LINEUP PPG · {dataSeason}` | `f1(L.lastMine)` `text-dp-text` | `ordinal(L.lastRank)` | `league median {f1(L.lastMedian)}` |
| `tile-lineup-proj` | `PROJECTED · {projSeason}` | `f1(L.projMine)` `text-dp-up-text` | `ordinal(L.projRank)` | `league median {f1(L.projMedian)}` + (both mines non-null) `` ` · ${sign}${f1(abs(proj−last))} on last year` `` (`+` or `−` U+2212) |
| `tile-games-missed` | `GAMES MISSED · {dataSeason}` | `Σ missed` over starters with non-null `weeks` | `of {Σ (played + missed)}` in `text-dp-text-5` | `by your ten starters` + injury clause |

Labels use `—` for a null season, e.g. `LINEUP PPG · —`. Each tile's value `<span>` carries
`data-testid="{tile testid}-value"`, e.g. `tile-games-missed-value`.

**GAMES MISSED:**
- "Starters" = `myLineup.slots` with non-null `player_id`.
- No starter with non-null `weeks` → value `—` and no `of …`.
- The meta is still `by your ten starters`.

**Injury clause** — count starters by `status.status`, keeping only these, in this order:

| `injury_status` | Clause text |
|---|---|
| `Questionable` | `{n} questionable now` |
| `Doubtful` | `{n} doubtful now` |
| `Out` | `{n} out now` |
| `IR` | `{n} on IR now` |
| `PUP` | `{n} on PUP now` |
| `Sus` | `{n} suspended now` |

- Append each non-zero count as `` ` · ${text}` ``.
- All zero, or `playerMap` null → no clause.
- Never render `0 …`.
- `// PROVISIONAL(no-data)` is **not** needed here: the source is real, and absence renders nothing.

### 4.4 Shared cell renderers (local components in `Portfolio.jsx`)

Each renders `—` (`text-dp-muted`) for `null`.

- **`PpgPairCell({ last, proj, scaleMax })`** (col `ppg`, `w-[130px]`):
  - Two stacked rows, each a 6px bar plus a number.
  - Last-season row: `bg-dp-slate`, number `font-dp-mono text-[10.5px] text-dp-text-5`.
  - Projected row: `bg-dp-up`, number `font-dp-mono text-[10.5px] font-semibold text-dp-text`.
  - Bar width `min(100, v / scaleMax * 100)%`; no bar when the value is null or `≤ 0`.
  - Zero-based on purpose: this is a PPG series (the `CareerBars` rule in `cells.jsx`).
  - Numbers render as `v.toFixed(1)`.
- **`GamesStripCell({ weeks, played, missed })`** (col `games`):
  - 18 cells, `w-[5px] h-[12px] rounded-[1px]`, gap `1.5px`, each with `title` `WK {i+1} · {STATUS_LABEL[code]}`.
  - Cell styles:

    | Code | Classes |
    |---|---|
    | `P` | `bg-dp-up-border` |
    | `D` | `bg-dp-down-bg-strong` |
    | `B`, `X` | `border border-dashed border-dp-slate-2` |

  - Then `{played}/{played+missed}` in `font-dp-mono text-[10.5px] text-dp-text-5`.
  - `weeks === null` → `—`.
  - Import `STATUS_LABEL` from `availabilityGrid`.
- **`PctCell({ value })`** → `` `${Math.round(value * 100)}%` ``.
- **`StatusCell({ status })`**: a chip `font-dp-mono text-[10px] tracking-[0.04em] rounded px-1.5 py-0.5 text-dp-down-text bg-dp-down-bg`.
  - Text = `ABBR[status.status] ?? status.status.toUpperCase()`, plus `` ` · ${bodyPart.toUpperCase()}` `` when `bodyPart` is present.
  - `ABBR = { Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUS' }`.
- **`ScriptCell()`** → always `—`, with
  `// PROVISIONAL(no-data): GAME SCRIPT · the team-metrics slice (Slice D) has not landed · wire computeTeamSeasonMetrics margin + PROE here`.
- **`KtcCell({ value })`** → `value.toLocaleString()` in `font-dp-mono text-dp-muted text-right`.
- **`VsMedianCell({ proj, bar })`** (col `vsmedian`):
  - `proj == null || bar == null` → `—`.
  - Else `g = proj − bar.median`; text `` `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)} vs ${SLOT_LABEL[bar.slot]}` `` (U+2212).
  - Class: `g >= 0` → `text-dp-up-text`; `g <= VS_MEDIAN_FAR_BELOW` (`const VS_MEDIAN_FAR_BELOW = -4`, colour threshold only) → `text-dp-down-text`; else `text-dp-muted`.

`SLOT_LABEL = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLX', SUPER_FLEX: 'SF' }`, falling back to
the raw slot string.

**Every cell `<td>` carries `data-testid="col-{key}"`.** Keys: `slot, player, ppg, delta, vsmedian,
posrank, games, share, snap, script, role, status, ktc`.

**Header cells:**
- Class: `px-[10px] py-2 first:pl-[18px] last:pr-[18px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-dp-muted-2 whitespace-nowrap`.
- The `2025 → 2026 PPG` header is `text-dp-text`, with the text `{dataSeason ?? '—'} → {projSeason ?? '—'} PPG`.
- Column-group dividers (`border-l border-dp-border-row`) before `ppg`, `games`, `script`, `role` and `ktc`, per the design.
- The `GAME SCRIPT` header wraps its label in
  `<DefinitionPopover term="Game script" gloss="The offence's scoring margin and pass rate over expected, blue when it suits this player's position and amber when it works against it. Not built yet — arrives with the team-metrics slice.">`.

### 4.5 Starting ten card (`data-testid="starting-ten"`)

**Card head:**
- Title `Starting ten` (`text-[13px] font-semibold text-dp-text-strong`).
- Sub `best lineup by projected points · last season beside next` (`text-[11.5px] text-dp-muted`).
- Legend on the right, `ml-auto flex flex-wrap gap-3.5 text-[11px] text-dp-text-5`: swatches
  `{dataSeason} PPG` (`bg-dp-slate`), `{projSeason} projected` (`bg-dp-up`), `played` (`bg-dp-up-border`),
  `missed` (`bg-dp-down-bg-strong`), and `bye or no game` (dashed `border-dp-slate-2`).
- Wrap the head in `flex flex-wrap items-baseline gap-2.5 px-[18px] pt-3.5 pb-3 border-b border-dp-border-row`.
- Keep the `!loaded` line (`Player data loading in background…`) under the head.

**Table:**
- Wrap it in `<div className="overflow-x-auto">`; `<table className="w-full text-xs border-collapse">`;
  thead row `bg-dp-row-head`.
- Columns: `Slot`(empty header) · `PLAYER` · `2025 → 2026 PPG` · `Δ` · `POS RANK` · `GAMES {dataSeason}` ·
  `SHARE` · `SNAP` · `GAME SCRIPT` · `ROLE` · `STATUS` · `KTC`.

**Rows** — one per `myLineup.slots[i]`, in array order (= `rosterPositions` order, D6).
`data-testid="starter-{i}"`.
- **Empty slot** (`player_id === null`): a plain `<tr className="border-t border-dp-border-row">` with the
  slot label, `empty` (`text-dp-muted italic`) in `player`, and `—` in every other column.
- **Filled slot:**
  - `row = rowById.get(player_id) ?? { player_id, full_name: slot.name, position: slot.position, nfl_team: null, age: null, years_exp: null, ktcValue: null }`.
  - Wrap in `ClickableRow row={row} onOpen={onOpenPlayerDetail}`.
  - Cells:

    | Column | Content |
    |---|---|
    | `slot` | `SLOT_LABEL`, `font-dp-mono text-[10.5px] text-dp-muted` |
    | `player` | `<PlayerCell row={row} />` unchanged |
    | `ppg` | `PpgPairCell last={facts.last} proj={slot.points}` |
    | `delta` | `DeltaCell delta={facts.last != null && slot.points != null ? slot.points − facts.last : null}` |
    | `posrank` | `facts.posRank` in `font-dp-mono text-dp-text-5 text-right` |
    | `games` | `GamesStripCell` |
    | `share` | `PctCell facts.share` |
    | `snap` | `PctCell facts.snap` |
    | `script` | `ScriptCell` |
    | `role` | `facts.role`, `font-dp-mono text-[10px] text-dp-text-2` |
    | `status` | `StatusCell` |
    | `ktc` | `KtcCell row.ktcValue` |

**Scale and empty state:**
- `scaleMax` = `Math.max(1, …every finite last and proj across the ten rows)`.
- `myLineup` null or `slots.length === 0` → a single muted line in the card instead of the table:
  `No starting lineup — league slots or roster not loaded.`

**Footer** (`flex flex-wrap gap-3.5 px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11.5px]`):
- Left, `text-dp-muted`, literal:
  `POS RANK is last-season PPG among all players at the position in this league's scoring. SHARE is target share for pass-catchers and carry share for backs, from seasons with 8+ games. SNAP is offensive snap share; not tracked for quarterbacks. Dashed week is a bye or a week with no game recorded.`
- Right, `ml-auto text-dp-muted-2`, only when at least one starter has `row.years_exp === 0 && facts.last == null`:
  - 1 rookie: `{full_name} is a rookie: no {dataSeason} line, projection from draft capital and college profile.`
  - More than 1: `{names joined ', '} are rookies: no {dataSeason} line, projections from draft capital and college profile.`

### 4.6 Bench card (`data-testid="bench"`)

**Rows:**
- **Players:** `ownedRows` whose `player_id` is not among `myLineup.slots` player ids.
  - `proj = Number.isFinite(row.projectedPPG) ? row.projectedPPG : null`.
  - `bar = startingBar(slotMedians, row.position)`.
- **Picks:** `myPickRows`, unchanged.
- **Sort order:**
  1. Players with finite `proj`, descending.
  2. Players with null `proj`, by `ktcValue` descending with nulls last.
  3. Picks, by `ktcValue` descending with nulls last.

  Remaining ties go by `full_name` ascending.

**Card head:**
- Title `` `Bench · ${p} player${p === 1 ? '' : 's'} and ${k} pick${k === 1 ? '' : 's'}` ``.
- Sub `same columns, sorted by projected points · the top of this list is who steps in`.
- Right: a `<button type="button" data-testid="bench-toggle">` (`text-[11.5px] text-dp-up-text`), only when
  the row count > `BENCH_COLLAPSED_ROWS` (`const BENCH_COLLAPSED_ROWS = 10`).
  - Label is `` `show all ${n} →` `` when collapsed and `show fewer` when expanded.
  - `useState(false)`.
- When collapsed, render the first 10 rows.

**Table:**
- Columns: `PLAYER` · `2025 → 2026 PPG` · `Δ` · `VS MEDIAN STARTER` · `POS RANK` · `GAMES {dataSeason}` ·
  `SHARE` · `SNAP` · `GAME SCRIPT` · `ROLE` · `STATUS` · `KTC`.
- The `ppg` scale is its own `scaleMax` over the rendered bench players.
- **Player row:** `ClickableRow`, `data-testid="bench-{player_id}"`. Cells as §4.5 (no `slot`), with
  `proj` in place of `slot.points`, plus `VsMedianCell proj bar`.
- **Pick row:** plain `<tr data-testid="bench-{row.id}">` (ids are already `pick-{season}-{round}-{originalRosterId}`, so the testid is `bench-pick-…`).
  - `player` = `<PickCell row={row} />`.
  - `ktc` = `<PickValueCell row={row} maxOwnedKtc={maxOwnedKtc} />`.
  - Every other column `—`.
  - Keep `maxOwnedKtc` as today.
- Zero rows: `colSpan={12}` muted `No bench players or picks.` (or `Loading player data…` when `!loaded`).

**Footer** (same style as §4.5), literal:
`VS MEDIAN STARTER is the gap to the league's median projected starter at the weakest slot this player could fill — positive means he would start on a typical team.`

### 4.7 Page structure

`<div className="bg-dp-canvas flex flex-col gap-[18px]">`, containing header block → Starting ten →
Bench. No other sections.

---

## 5. Tests

Every expected value is a literal written in the test, never recomputed with the code under test.

### 5.1 `src/utils/lineup.test.js` — append `describe('buildSlotMedians / startingBar')`

**Fixture A.** Hand-build `leagueLineups` with `proj.slots` (and `last.slots` identical) over slots
`QB, RB, FLEX, SUPER_FLEX`:

| rosterId | QB | RB | FLEX | SF |
|---|---|---|---|---|
| 1 | 20 | 15 | 10 | 18 |
| 2 | 24 | 12 | null | 14 |
| 3 | 22 | 9 | 8 | 16 |

**Tests:**
1. `buildSlotMedians(A, 'proj').map(m => m.median)` equals `[22, 12, 9, 16]`. FLEX is the mean of 10 and 8
   with the null excluded; my team (rosterId 1) is included. Entry 2 equals
   `{ slot: 'FLEX', slotIndex: 2, median: 9 }`.
2. `buildSlotMedians(A, 'last')` reads `last.slots`. Build `last.slots` with QB `[1, 2, 3]` → median `2`.
3. `startingBar(m, 'QB')` → `{ slot: 'SUPER_FLEX', slotIndex: 3, median: 16 }`.
   `startingBar(m, 'RB')` → slotIndex 2, median 9. `startingBar(m, 'TE')` → slotIndex 2 (no TE slot).
   `startingBar(m, 'K')` → `null`.
4. **Tie → lower index.** Slots `RB, FLEX`, one team RB 10, FLEX 10 → `startingBar(…, 'RB').slotIndex === 0`.
5. **Null medians excluded.** Slots `TE, FLEX`, one team TE `null`, FLEX 7:
   - `startingBar(…, 'TE')` → slotIndex 1;
   - slots `TE` only with TE `null` → `null`.
6. `buildSlotMedians([], 'proj')` and `buildSlotMedians(null, 'proj')` → `[]`.

### 5.2 `src/__tests__/lineupViewOnly.test.js`

Extend the name regex to
`/buildBestLineup|buildLeagueLineups|buildPositionLadders|buildWeakestSlots|buildSlotMedians|startingBar/`.

### 5.3 `src/components/shell/AppShell.test.jsx`

`:28` → `getAllByText('My Team')`; `:56` → `queryByText('My Team')`. Nothing else.

### 5.4 `src/components/portfolio/Portfolio.test.jsx` — rewrite

**Delete:**
- the `tile arithmetic`, `tile degenerate cases`, `value by age band`, `HORIZON pill`, `PROJ Δ` and
  `tile deltas and NO BASELINE` describes;
- the pick tests asserting `tile-value`.

**Keep, updated:**
- `myTeamName null` and `mounting with no props`, heading text now `My Team`;
- `row interaction` — unchanged fixture. With `rosterTeams` defaulting to `[]` there is no lineup, so the
  owned row renders as `bench-r1`. Click and Enter still call `onOpenPlayerDetail('r1')`;
- the pick tests: traded-in/own meta, traded-away absent, unpriced `—` (assert `col-ktc` text is `—`),
  pick click does not open, and the gloss popover. Test ids change `holding-pick-…` → `bench-pick-…`.

Helper constants for the fixtures:

```js
const LEAGUE = ['QB','RB','RB','WR','WR','WR','TE','FLEX','FLEX','SUPER_FLEX','BN','BN']
const W = (p, d = 0) => [...Array(p).fill('P'), ...Array(d).fill('D'), ...Array(18 - p - d).fill('X')]
```

**Fixture M (main):** `rosterPositions={LEAGUE}`, `careerStats = { 2025: … }`.

*Team 1 — `rosterId: 1`, `teamName: 'My Team'`.* All players go in `bench` except as noted; which array
they sit in does not matter to the engine. For each player the careerStats row is
`{ fantasyPoints, gamesPlayed: 10, weeklyStatus, stats }`.

| id | pos | projectedPPG | careerStats 2025 row | playerMap extras | playerRows extras |
|---|---|---|---|---|---|
| `q1` | QB | 22 | fp 210, `W(17)` | `depth_chart_position:'QB', depth_chart_order:1` | ktcValue 7000 |
| `q2` | QB | 16 | **none** | — | `years_exp: 0`, full_name `Rookie Qb` |
| `q3` | QB | 14 | fp 120, `W(17)` | — | — |
| `r1` | RB | 14 | fp 130, `W(16,1)`, stats `{ off_snp: 500, tm_off_snp: 1000 }` | — | — |
| `r2` | RB | 12 | fp 110, `W(17)` | (no depth fields) | — |
| `r3` | RB | 11 | fp 100, `W(17)` | — | — |
| `r4` | RB | 6 | fp 50, `W(17)` | — | — |
| `w1` | WR | 17 | fp 160, `W(15,2)`, `team: 'DAL'`, stats `{ off_snp: 900, tm_off_snp: 1000, rec_tgt: 25 }` | `depth_chart_position:'LWR', depth_chart_order:1` | ktcValue 6000 |
| `w2` | WR | 15 | fp 140, `W(17)`, `team: 'DAL'`, stats `{ rec_tgt: 75 }` | — | — |
| `w3` | WR | 13 | fp 120, `W(17)` | — | — |
| `w4` | WR | 9 | fp 80, `W(17)` | — | — |
| `t1` | TE | 10 | fp 90, `W(17)` | `injury_status:'Questionable', injury_body_part:'Hamstring'` | — |
| `t2` | TE | 5 | fp 40, `W(17)` | — | — |

*Team 2 — `rosterId: 2`, `teamName: 'Other Team'`.* Ten players, every one `projectedPPG` 10, with no
careerStats rows:
- QB `a1`, `a2`;
- RB `b1`, `b2`, `b3`, `b4`;
- WR `c1`, `c2`, `c3`;
- TE `d1`.

Their `playerRows` rows carry `ownerTeamName: 'Other Team'`.

*Shared props:*
- Only `w1` and `w2` carry `team`, so `buildTeamShareTotals` gives DAL `recTgt` 25 + 75 = 100, and
  `buildPerSeasonTeamShares` gives `w1` share `0.25` (gp 10 ≥ 8). Every player without `team` is skipped
  by both builders. No `historicalShares` anywhere.
- `playerMap`: every id → `{ position, full_name }` plus the extras above.
- `playerRows`: every id → `baseRow({ player_id, position, full_name, ownerTeamName, projectedPPG, ktcValue?, years_exp? })`.
  Team-1 rows carry `ownerTeamName: 'My Team'`.
- `full_name` is `` `Player ${id}` `` for every id (e.g. `Player r3`), except `q2`, which is `Rookie Qb`. Use
  the same name in `playerMap`, `playerRows` and the `rosterTeams` entries.
- `rosterTeams` entries are `{ id, slot: 'Bench', full_name, position, team: 'DAL', age: 25 }`.

Hand-derived `proj` lineup for My Team:

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Slot | QB | RB | RB | WR | WR | WR | TE | FLX | FLX | SF |
| Player | q1 | r1 | r2 | w1 | w2 | w3 | t1 | r3 | w4 | q2 |

Bench: `q3`, `r4`, `t2`.

Slot medians (2 teams):
- QB 16, RB 12/11, WR 13.5/12.5/11.5, TE 10, FLX 10.5/9.5, SF 13.

**Tests on M:**
1. **Slot order.** `starter-0`…`starter-9` `col-slot` texts equal
   `['QB','RB','RB','WR','WR','WR','TE','FLX','FLX','SF']`; `starter-9` contains `Rookie Qb`;
   `starter-7` `col-player` contains `r3`'s full_name.
2. **Rookie row degrades.** On `starter-9`:
   - `col-ppg` contains `16.0` and `—`;
   - `col-delta`, `col-posrank`, `col-games`, `col-snap` are each `—`;
   - the footer contains `Rookie Qb is a rookie: no 2025 line, projection from draft capital and college profile.`
3. **Real columns.**
   - `starter-3`: `col-snap` `90%`, `col-share` `25%`, `col-role` `LWR1`, `col-games` contains `15/17`,
     `col-posrank` `WR1`, `col-ktc` `6,000`, `col-delta` `+1.0`.
   - `starter-4` `col-posrank` `WR2`.
   - `starter-0`: `col-snap` `—`, `col-share` `—`.
   - `starter-2` `col-role` `—`.
   - `starter-6` `col-status` `Q · HAMSTRING`.
4. **GAME SCRIPT degraded, header present.**
   - Every `starter-i` `col-script` is `—`.
   - The Starting ten header row contains `GAME SCRIPT`, `SNAP` and `STATUS`.
5. **Tile GAMES MISSED.** `tile-games-missed-value` text **equals** `3`; `tile-games-missed` contains
   `of 153`, `by your ten starters` and `1 questionable now`. That is 9 starters with rows × 17 played+missed = 153; missed 1 + 2 = 3.
6. **Bench.**
   - Bench player rows in DOM order: `bench-q3`, `bench-r4`, `bench-t2`.
   - `bench-q3` `col-vsmedian` is `+1.0 vs SF`.
   - `bench-r4` is `−3.5 vs FLX`.
   - `bench-t2` is `−4.5 vs FLX`, with class `text-dp-down-text`.
7. **Picks in bench.** Render M plus `tradedPicks={[]}`, `ktcPickTable={parseKtcPickRows(ktcRows)}` (the
   existing `ktcRows`), `firstLiveDraftSeason={2027}` and `draftRounds={1}`. My Team (rosterId 1) then owns
   its own 2027 1st.
   - `bench-pick-2027-1-1` renders and is the **last** `bench-*` row in DOM order.
   - Its `col-ppg`, `col-vsmedian`, `col-posrank`, `col-games`, `col-share`, `col-snap`, `col-role` and
     `col-status` are all `—`.
   - Its text contains `2027 1st`, `own pick` and `3,690`.
   - The bench card head reads `Bench · 3 players and 1 pick`.
8. **Degraded inputs don't throw.** Render M with `careerStats={null} playerMap={null}`:
   - no throw;
   - every `starter-i` `col-share`, `col-snap`, `col-role`, `col-status`, `col-posrank`, `col-games` is `—`;
   - `tile-games-missed-value` text **equals** `—`; `tile-games-missed` does not contain `questionable`.

   With careerStats null, `last` is null throughout, but `proj` lineups still build.
9. **Ownership.** No `bench-a1` or `bench-b1` row exists (Other Team's players never appear).
10. **Nav-free heading.** `getByRole('heading', { name: 'My Team' })` present.

**Fixture S (summary + ladder tiles):** `rosterPositions={['QB','RB','WR','TE']}`, 4 teams, one player
per position each. `careerStats = { 2025: { … } }` (so `dataSeason` 2025 and the projection season is
2026), with rows `{ fantasyPoints: last × 10, gamesPlayed: 10, weeklyStatus: W(17) }`.
My team is rosterId 1.

| Team | QB proj/last | RB | WR | TE |
|---|---|---|---|---|
| 1 `My Team` | 25 / 20 | 8 / 10 | 14 / 12 | 9 / 7 |
| 2 | 20 / 22 | 15 / 14 | 16 / 15 | 10 / 8 |
| 3 | 18 / 16 | 12 / 11 | 12 / 10 | 6 / 5 |
| 4 | 15 / 14 | 10 / 9 | 11 / 9 | 21 / 11 |

Hand-derived:
- Proj totals 56 / 61 / 48 / 57 → mine 3rd, median 56.5.
- Last totals 49 / 59 / 42 / 43 → mine 2nd, median 46.0.
- My proj ranks: QB 1, RB 4, WR 2, TE 3.
- `third = 2`.

11. `summary-sentence` text equals
    `Your starting ten scored 49.0 points a week last season, 2nd of 4. Projected 56.0 for 2026, 3rd. The quarterbacks carry it; the backfield is what keeps it out of the top half.`
12. `tile-lineup-last` contains `49.0`, `2nd`, `league median 46.0`. `tile-lineup-proj` contains `56.0`,
    `3rd`, `league median 56.5 · +7.0 on last year`.
13. **Tie omits carry; weak-spot form.** Same fixture with Team 1 WR proj `17`:
    - WR mine rank 1, tying QB;
    - proj totals 59 / 61 / 48 / 57 → mine 2nd, not > 2.

    `summary-sentence` ends with `Projected 59.0 for 2026, 2nd. The backfield is the weak spot.` and does
    not contain `carr`.
14. **Header meta.** With `leagueName="Dynasty 040"` and `scoringSettings={{ rec: 0.5 }}`, the text
    `My Team · Dynasty 040 · 4-team 1QB · half-PPR` is present. S has no SUPER_FLEX and 1 QB slot.

**Fixture C (collapse):**
- `rosterPositions={['QB','BN']}`.
- My team: one QB (proj 20) plus 11 RBs `x1`…`x11` with proj 11…1.
- One other team with one QB.

15. 10 `bench-x*` rows render; `bench-toggle` text is `show all 11 →`. After a click, 11 rows render and
    the toggle reads `show fewer`.

---

## 6. Docs

- **`CLAUDE.md:48`** — `src/components/portfolio/` row → `The My Team surface (/portfolio): header + lineup tiles, Starting ten and Bench tables (players and picks)`.
- **`docs/navigation.md`:**
  - `:13` → `**MANAGE** (My Team, Market, Teams)`;
  - `:22` → `` | `/portfolio` | My Team — header + summary sentence, three lineup tiles, Starting ten and Bench tables, row click → the detail pop-up | ``;
  - `:86` `usePlayersTable.js` → drop "and Portfolio" (it is no longer a consumer).
- **`docs/nav/components.md:8`** — replace the row with a description of §4. It must include:
  - the five props added and `ktcHistory` removed;
  - that the lineup comes from `lineup.js` on `dataSeason`;
  - the column sources (D1–D4, D9, D10);
  - that `GAME SCRIPT` is `PROVISIONAL(no-data)`;
  - that picks are bench rows via `PickCell`/`PickValueCell`;
  - that pick rows are plain `<tr>` (not `ClickableRow`).

  Keep the existing pick-ownership/pricing sentences; they still hold. Drop the tiles, age-band, HORIZON
  and delta prose.
- **`docs/nav/utils.md:49`** `lineup.js` row:
  - add `buildSlotMedians` (per-slot-index league median, all teams incl. mine) and `startingBar` (lowest
    eligible median slot);
  - replace "No renderer yet (Portfolio redesign slices consume it)" with "Rendered by
    `portfolio/Portfolio.jsx` (Slice B)".
- **`README.md`:**
  - `:129` → `My Team screen (/portfolio) — lineup tiles, Starting ten, Bench (players and picks)`;
  - `:144` → drop "and Portfolio".
- **`docs/ui.md:62-96`** — replace the whole `## Portfolio` section with `## My Team (src/components/portfolio/Portfolio.jsx)`.
  Describe §4 at the same altitude as the other sections: header + summary sentence (S3 rule), three
  tiles, Starting ten, Bench. Keep the "Picks as holdings" live-season / roster-id / pricing paragraphs,
  retitled "Picks on the bench". Drop tiles, deltas, age band, Holdings/HORIZON, `portfolio-sort` and the
  §4a.2 cut list.
- **`docs/architecture.md:14`** — the `/portfolio` props list → current props (§4.1 signature); label `My Team`.
- **`docs/nav/utils.md:14`** — `compareNullsLast` "used by `Market.jsx`, `Portfolio.jsx`, and …" → drop `Portfolio.jsx`.
- **`CLAUDE.md:133`** — "one independent instance per consumer (Market, Portfolio)" → "(Market)".
- **`docs/navigation.md:48`** — "Portfolio is one click away in the rail" → "My Team is one click away in the rail".
- **`src/hooks/usePlayersTable.js:10`** — JSDoc example `(e.g. 'market-sort', 'portfolio-sort')` → `(e.g. 'market-sort')`. Comment only.

---

## 7. Cross-repo impact

Edits land in `docs/cross-repo-registry.md` and `docs/signal-registry.md` in this repo only.

### CR-01 · Projection snapshot envelope — trigger list loses a consumer

`Portfolio.jsx:366-367` (the `projectedTotalPts` read) is deleted. Portfolio now reads projections only
through `row.projectedPPG` (merged at `App.jsx:603`, already listed) and `lineup.js`'s `proj` accessor
(already listed). **Edit** CR-01 → Triggers: remove `` `src/components/portfolio/Portfolio.jsx:366-367`, `` from the
app-side list. Mirror, quoted per the rule:

> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump,
> `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README
> snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond
> grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed
> snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as
> in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js`
> `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not
> season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive
> `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

While editing that line, also correct `[registry-stale]` `src/components/roster/MyTeamView.jsx:25` →
`src/components/roster/MyTeamView.jsx:20,25`. `:20` is a second `projectedTotalPts` read in the same file.

Emitted statement: *envelope shape unchanged; `schemaVersion` stays 3. Because the Triggers edit is
inside the `CR-REGISTRY` sentinels, the data repo must sync `cross-repo-registry.md` and run the anchored
diff (see the backlog entry below).*

### CR-02 · season-totals schemaVersion & row composition — new served-`weeklyStatus` renderer

Portfolio's `GAMES` strip and `GAMES MISSED` tile render served `weeklyStatus` through
`buildAvailabilityGrid`. They treat `'X'` as "bye or no game", which is load-bearing on D-1's `'B'`
emission exactly as `gameLog.js` is. **Edit** CR-02 → Triggers: append to the app-side list, after the
`gameLog.js` entry:

`` `src/components/portfolio/Portfolio.jsx` (`GAMES` strip / `GAMES MISSED` tile — served `weeklyStatus` via `buildAvailabilityGrid`, `'B'`/`'X'` both drawn as bye-or-no-game; `rankPositionSeason` over `careerStats[dataSeason]` for `POS RANK`; `buildTeamShareTotals`/`buildPerSeasonTeamShares` for `SHARE`) ``

In the same edit, append two `[registry-stale]` entries that predate this slice:
- `` `src/components/dp/AvailabilityRoleSection.jsx:25` (served `weeklyStatus` via `buildAvailabilityGrid`) ``
- `` `src/hooks/usePlayerProfile.js:80` (direct `rankPositionSeason` over `careerStats[season]`) ``

**Reported, not fixed:** CR-02's Triggers and Mirror still describe `availabilityGrid.js:4` as asserting
"never emit `'B'`", but that header was already corrected. Fixing it means rewriting Mirror prose the data
side owns, which is out of scope. It goes in the backlog entry below.

Mirror, quoted:

> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

Emitted statement: *no shape change. A `'D'` written where a `'B'` belongs would inflate My Team's
GAMES MISSED tile silently. The data repo must sync the mirrored region (backlog entry below).*

### CR-11 · Snap & red-zone usage stat keys — new `buildUsageHistory` call site

**Edit** CR-11 → Triggers: append
`` `portfolio/Portfolio.jsx`'s `buildUsageHistory` call site (`SNAP`/`SHARE` columns) `` after the dp-v2
Slice 5b Market entry. Mirror, quoted:

> Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

Emitted statement: *keys unchanged. The data repo must sync the mirrored region (backlog entry below).
The Mirror's blast-radius sentence could gain "and My Team's `SNAP` column" at that sync, but that wording
edit is optional.*

### CR-17 · KTC value snapshots — touched, unchanged contract

`Portfolio.jsx`'s pick-pricing reads (`pickPrice` in `myPickRows`, `PickValueCell`) survive unchanged in
the Bench table. The deleted tiles also read `pickPrice`, so the trigger wording
("`Portfolio.jsx`'s pick-pricing reads") stays accurate and **no Triggers edit** is needed. Mirror,
quoted:

> Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family degrades to empty with **no error and no test failure**. **Updated, dp-v2 Slice 5a:** the earlier note here said the Explorer's ~30-day KTC Δ cell was the only other thing that degraded and that it was gone, making `ktcHist*` "the only thing that degrades" — that is now stale twice over. First, `ktcHist*` was never only a diagnostic: `market/Market.jsx`'s TREND gutter is a second, real rendering consumer of both `computeKtcSignals`'s output and the raw `series`. Second, and more than bookkeeping, **the failure mode itself changed**: before this slice a bad/empty snapshot produced a silent gap in `factors` with no visible symptom anywhere; now it also produces a **visibly blank TREND column on Market, the app's primary surface** (every row's gutter renders `—`, the `band: 'none'` state) — something a user watching the app would actually notice, not just something a diagnostic dump would show. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two scrapers are independent implementations of one shape, so a KTC markup change can break them separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as if it were good data.

Emitted statement: *no data-side action. Portfolio no longer reads `ktcHistory` at all.*

### CR-18 · Signal registry rows — eight cells edited, one row added

Edit `docs/signal-registry.md`:

- **`:47` and `:48` (snap counts).** Current-use: after "…the pop-up's `§usage` section", append
  `, and (Portfolio Slice B) My Team's Starting ten / Bench `SNAP` column (latest `dataSeason` entry)`.
- **`:63` (KTC current).** Replace
  "feeds `portfolio/Portfolio.jsx`'s ROSTER VALUE/CONCENTRATION tiles and its holdings table" with
  "feeds `portfolio/Portfolio.jsx`'s Bench table (pick rows; the ROSTER VALUE/CONCENTRATION tiles were removed in Portfolio Slice B)".
- **`:110` (Ceiling/Floor, `seasonRanks.js`).** Current-use: append
  `; **and** (Portfolio Slice B) My Team's `POS RANK` column + last-season PPG via `rankPositionSeason` on `dataSeason``.
- **`:111` (best-lineup aggregates).**
  - Source: add `` `buildSlotMedians`/`startingBar` ``.
  - Current-use: replace "**unused/candidate** — no renderer yet (Portfolio redesign slices B–D)" with
    "**view-only display** — `portfolio/Portfolio.jsx` (Slice B: Lineup tiles, summary sentence, Starting ten, Bench `VS MEDIAN STARTER`)".
- **`:127` (depth-chart order).** Current-use: append
  `; **view-only display** (Portfolio Slice B) — My Team's `ROLE` column renders live `playerMap[id].depth_chart_position` + `depth_chart_order` raw`.
- **`:114` (Outlook opportunity trend, per-season-team share series).** Current-use: append
  `; the same series' latest `dataSeason` value is shown in My Team's `SHARE` column (Portfolio Slice B)`.
- **`:132` (Vegas / injury designation / coaching / scheme, §3C).** Current-use: replace
  "unused/candidate (capture-time only)" with
  "unused/candidate as captures (none snapshotted); the live Sleeper injury designation is **displayed** (not captured) — see the §3A injury-designation row".
- **New row** directly after `:67` (Injury overlay), in **§3A**. It does not go in §3C, whose header
  (`:117-122`) defines its rows as `projectionSnapshot.js` captures, and this one is not captured.

  > | Injury designation (`injury_status`, `injury_body_part`) | raw live data | app: `playerMap[id]` ← Sleeper `/players/nfl` (`src/api/sleeper.js` `getAllPlayers`, 24h cache) | live = current only | **Ephemeral** (live designation; not captured by `projectionSnapshot.js`) | **view-only display** — My Team's `STATUS` column and `GAMES MISSED` tile clause (Portfolio Slice B); never moves `projectedPPG`/dynasty score |

The row is an app-read live Sleeper field, not a data-store family, so no data-side row is owed. Mirror,
quoted:

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
> script the list above cannot already name. The listed sites are every one that exists today; a
> *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives
> its own side against live `scripts/` and `lib/` on every review), not by this list. When a
> data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters
> its historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

### Data-repo backlog entry (done-definition 7)

Append to `.claude/tasks/data-repo-backlog.md`, using the next free `D-N` and the file's existing entry
format:

- **Title:** `Sync cross-repo-registry.md after Portfolio Slice B (CR-01/02/11 Triggers)`.
- **Found / Blocking:** `**Found:** <this slice's commit SHA> · **Blocking:** no`.
- **Body:** say that the app edited Triggers inside the `CR-REGISTRY` sentinels. The data repo copies the
  region verbatim and runs the line-anchored sentinel diff. This is the two-session route; the parent-folder
  route is not available.
- **Optional wording:**
  - CR-11's Mirror blast-radius sentence may name My Team's `SNAP` column;
  - CR-02's Mirror still says `availabilityGrid.js:4` asserts "never emit `'B'`" — that app comment was
    already corrected, so the sentence is stale.

### Not triggered

- **CR-07** (advstats) — Portfolio does not read it (D1).
- **CR-10** (teamcontext) — `GAME SCRIPT` is deferred.
- **CR-16** — `nfl_team` is displayed only in `PlayerCell`, never joined.
- **CR-21** — no in-progress read.
- No new coupling.

---

## 8. Step sequence

1. **`lineup.js` §2 + tests §5.1, §5.2.** Run `npx vitest run src/utils/lineup.test.js src/__tests__/lineupViewOnly.test.js`.
2. **`navItems.js` §1 + `AppShell.test.jsx` §5.3.**
3. **`Portfolio.jsx` §4 + `Portfolio.test.jsx` §5.4.** If a §5.4 hand-derived value disagrees with the
   render, **stop and report** which. Do not edit the expected literal to match.
4. **`App.jsx` §3.**
5. **Docs §6, registries §7, data-repo backlog entry §7.** The backlog entry needs the commit SHA, so
   add it in a follow-up amend or a second commit.
6. **Done-definition:**
   - `npm test`; `npm run lint` (0); `npm run build` (clean apart from the pre-existing chunk-size warning).
   - `grep -rn "PROVISIONAL(" src/` → paste into the hand-back.
   - **Smoke** (`docs/architecture.md` → *Smoke-testing the running app*):
     - `/#/portfolio`, rail label reads `My Team`;
     - header meta shows `Colts_420_Reloaded · Dynasty 040 · 12-team superflex · half-PPR`;
     - three tiles with no `NaN`;
     - ten starter rows in slot order;
     - bench collapsed to 10 with `show all N →`;
     - resize to `mobile` and confirm tiles stack and tables scroll inside their cards, not the page.
   - **Report in the hand-back:**
     - the rendered summary sentence verbatim;
     - how many starters show a non-`—` `SNAP`, `SHARE`, `ROLE` and `STATUS`;
     - whether any `STATUS` rendered at all (confirms D3's field is live);
     - console errors.
   - Commit, hand back. **Do not push.**

## 9. Touch list (exhaustive)

**Edited:**
- `src/utils/lineup.js`
- `src/utils/lineup.test.js`
- `src/__tests__/lineupViewOnly.test.js`
- `src/components/portfolio/Portfolio.jsx`
- `src/components/portfolio/Portfolio.test.jsx`
- `src/components/shell/navItems.js`
- `src/components/shell/AppShell.test.jsx`
- `src/App.jsx` (the `/portfolio` route block only)
- `CLAUDE.md`, `README.md`, `docs/navigation.md`, `docs/nav/components.md`, `docs/nav/utils.md`
- `docs/signal-registry.md`, `docs/cross-repo-registry.md`
- `docs/ui.md`, `docs/architecture.md`
- `src/hooks/usePlayersTable.js` (JSDoc comment only)
- `.claude/tasks/data-repo-backlog.md`

**Must not change:**
- `dp/cells.jsx`, `DefinitionPopover.jsx`, `availabilityGrid.js`, `outlookUsage.js`, `seasonRanks.js`
- any pipeline memo in `App.jsx`
- `Market.jsx`
- `seasonProjection.js`, `dynastyScore.js`
- the existing functions in `lineup.js`

## 10. Risks

- **D3 is a product call.** If Anton wants `STATUS` held at `—` until a captured players-state loader
  exists, drop `StatusCell` and the tile clause, and the new registry row with them.
- **"Scored X points a week"** sums per-game averages of the *current* roster's best ten. It is not what
  was actually started in 2025, and missed weeks are not zeroed. The copy is the brief's "final" wording;
  flag it to Anton rather than rewording.
- **`POS RANK` has no games floor** (`rankPositionSeason`: `gamesPlayed > 0`). A 1-game outlier can rank
  above a full-season starter. This is the same ranking as Market's Ceiling/Floor.
- **The rookie footnote keys on `years_exp === 0`**, the same test `App.jsx:362` uses to admit rookies.
  A second-year player with no 2025 line gets `—` and no footnote.
- **IR starters** (Slice A D10) will appear in Starting ten; `STATUS` will show `IR` beside them, which
  is the honest display.
- **The injury designation is displayed, not captured.** The ephemeral-inputs invariant wants injury
  signals snapshotted. Capture belongs to a separate `projectionSnapshot.js` change (CR-01 envelope);
  this slice neither adds nor blocks it.

---

## 11. Plan-review record (2026-09-13)

plan-reviewer ran on this file. Its first run did not complete, so this record is from the second. It
recomputed every §5.1/§5.4 value against the committed `lineup.js` and found **no error**. It confirmed
the D1/D3/D9/D10 source claims, the §3 wiring, all five Mirror quotes (verbatim) and all seven signal
anchors. Each flag below was verified against live source.

**Applied:**
1. **[strategy, high] SHARE fed the projection-pipeline share series.** Verified at `Market.jsx:453-465`
   and `UsageEfficiencySection.jsx:24-38`: both build `perSeasonTeamShares` locally. D2, §3, §4.1,
   §4.2 and Fixture M now do the same, and the `historicalShares` prop is dropped.
2. **[mechanical] Touch list missed stale docs.** Added all six sites to §6/§9: `docs/ui.md:62-96`,
   `architecture.md:14`, `nav/utils.md:14`, `CLAUDE.md:133`, `navigation.md:48` and the
   `usePlayersTable.js:10` JSDoc.
3. **[mechanical] New registry row was in §3C, and `:132` would go stale.** Moved the row to §3A after
   `:67`; added the `:132` edit and the `:114` share-series consumer.
4. **[invariant] Ephemeral injury read.** Recorded in D3 and §10 as display-only; capture is a separate
   CR-01 change.
5. **[cross-repo] Triggers edits sit inside the mirrored sentinels.** The CR-01/02/11 emitted statements
   now ask the data side to sync, and §7 adds the backlog entry.
6. **[cross-repo] CR-02 missed `rankPositionSeason`.** Added, along with the share builders.
7. **[registry-stale] ×3.** Applied in the same line edits: `AvailabilityRoleSection.jsx:25`,
   `usePlayerProfile.js:80` (CR-02), `MyTeamView.jsx:20` (CR-01).
8. **[edge-case] ×3.** `PpgPairCell` now specifies `toFixed(1)`. Tests 5 and 8 assert on
   `tile-games-missed-value` with equality. Fixture S now states `careerStats` key `2025`.

**Reported, not fixed:** CR-02 Mirror prose calls `availabilityGrid.js:4` uncorrected. It is data-side
wording, routed to the backlog entry.

**Dismissed:**
- **[slice-size] ~52KB > 40KB split signal.** About 7.5KB is the five verbatim Mirror quotes the rule
  requires, and hand-written fixture tables account for much of the rest. The code change is one component
  rewrite plus two small util exports. Splitting it (e.g. Starting ten / Bench) leaves a shipped
  intermediate screen with no holdings or picks anywhere, which is worse than one larger slice.

---

## Fix pass 1

**Source:** implementation-reviewer on `4665d32..7a7323b`. All five flags were verified against live
source by Session 1 and all five are applied. None is a behaviour change: four are fidelity gaps to §4
and one is a missing test. **Do not change any computation, copy or layout beyond what is listed here.**

**Touch list:**
- `src/components/portfolio/Portfolio.jsx` — F1.1, F1.2, F1.3 only.
- `src/components/portfolio/Portfolio.test.jsx` — F1.5, F1.6 only; add tests, do not edit existing ones.
- `docs/nav/utils.md` — F1.4 only.

### F1.1 — degraded tile values lose their testid

§4.3 says every tile's value `<span>` carries `data-testid="{tile testid}-value"`. The `—` branches drop
it, so a degraded ladder tile cannot be located.

- `Portfolio.jsx:585` (`tile-lineup-last`) — add `data-testid="tile-lineup-last-value"` to the `—` span.
- `Portfolio.jsx:616` (`tile-lineup-proj`) — add `data-testid="tile-lineup-proj-value"` to the `—` span.

Nothing else on those lines changes. `tile-games-missed-value` (`:624`) is already correct — leave it.

### F1.2 — bench pick row's PLAYER cell has no `col-player`

§4.4: every cell `<td>` carries `data-testid="col-{key}"`. At `Portfolio.jsx:806` the pick row's
`<td>` wrapping `<PickCell row={row} />` has none. Add `data-testid="col-player"`. The starter empty-slot
row (`:694`) already has it.

### F1.3 — second "loading in background" line

`Portfolio.jsx:772-774` renders a `!loaded` line in the Bench card as well as the Starting ten card
(`:657`). §4.5 asks for it on Starting ten only, and the pre-Slice-B screen had exactly one. **Delete the
Bench card's block** (`:772-774`), leaving `:657` untouched.

### F1.4 — `docs/nav/utils.md:17` is now false

The `ktcHistory.js` row still names `portfolio/Portfolio.jsx`'s ROSTER VALUE/CONCENTRATION tile deltas as
live readers of the raw `series`. This slice deleted those tiles and the `ktcHistory` prop. §6 never
listed this row — a plan gap, not an implementation error.

Replace the `portfolio/Portfolio.jsx` sentence in that row with:

> `portfolio/Portfolio.jsx` no longer reads this family at all — Slice B removed the ROSTER VALUE /
> CONCENTRATION tiles and the `ktcHistory` prop with them, leaving Market's TREND gutter as the only
> renderer.

Leave the rest of the row, including the `docs/signal-registry.md:62,99` pointer, unchanged.

### F1.5 — the empty-slot starter branch is untested

`Portfolio.jsx:692-705` is the only site emitting a `starter-{i}` testid, and Fixture M fills all ten
slots, so nothing exercises it. Add one test to `describe`-level scope beside the Fixture C tests:

Name: `'F1-5. an unfillable slot renders an empty row, not a fabricated one'`.

- `rosterPositions={['QB','TE','BN']}`, one roster (`rosterId: 1`, `'My Team'`) holding a single QB
  (`projectedPPG` 20), plus a second roster with one QB (`projectedPPG` 10) so the league has two teams.
- No TE anywhere, so slot index 1 cannot be filled.

Assert:
- `starter-1` is in the document;
- within it, `col-player` text is `empty`;
- within it, `col-ppg`, `col-delta`, `col-posrank`, `col-games` and `col-ktc` are each `—`;
- `starter-0` contains the QB's name.

### F1.6 — assert the degraded tile testids F1.1 adds

Extend the existing degraded-inputs test (§5.4 test 8, `careerStats={null} playerMap={null}`) with two
assertions. **Add lines only; do not alter its existing assertions.**

- `tile-lineup-last-value` text equals `—`;
- `tile-lineup-proj-value` text equals `—`.

With `careerStats` null there is no last-season PPG and no projection ladder value, so both tiles take the
`—` branch.

### Done-definition for this pass

- `npm test` green, `npm run lint` 0 problems, `npm run build` clean (the pre-existing chunk-size warning
  only).
- Commit as `Fix pass 1: Slice B testid and doc fidelity gaps`.
- **Do not push.**
- Hand back the SHA, and per new test whether it passed on the first run.

## Fix pass 2 — correcting F1.6

**Session 1 error, not an implementation error.** F1.6's premise was wrong: `buildLeagueLineups`'s
`proj` side reads `seasonProjections[id].projectedPPG` and never touches `careerStats` (Slice A §2.2), so
nulling `careerStats` degrades the last-season tile only. fix-applier was right to stop. The independence
is worth asserting rather than papering over.

**Touch list:** `src/components/portfolio/Portfolio.test.jsx` only.

### F2.1 — finish test 8 with the true value

In §5.4 test 8 (`careerStats={null} playerMap={null}`), replace the comment fix-applier left at the
skipped assertion with:

- `tile-lineup-proj-value` text equals `139.0`.

Comment it: the projected ladder is independent of `careerStats` — it is built from `seasonProjections`
— so this tile keeps a real value while `tile-lineup-last-value` degrades to `—`. That is the contract,
not a leak.

`139.0` is Fixture M's own optimal-ten projected total: 22 + 14 + 12 + 17 + 15 + 13 + 10 + 11 + 9 + 16.

### F2.2 — a test where both tiles degrade

New test beside test 8, name `'F2-2. no projections either → both ladder tiles degrade'`. Render Fixture M
with `careerStats={null} playerMap={null} seasonProjections={null}`. Assert:

- `tile-lineup-last-value` text equals `—`;
- `tile-lineup-proj-value` text equals `—`;
- the `summary-sentence` testid is **not** in the document (§4.3: no S1 and no S2 → the sentence is not
  rendered);
- no throw.

### Done-definition for this pass

- `npm test` green, `npm run lint` 0, `npm run build` clean (pre-existing chunk-size warning only).
- Commit as `Fix pass 2: assert projection-ladder independence from careerStats`.
- **Do not push.** Hand back the SHA and whether each assertion passed on the first run.
