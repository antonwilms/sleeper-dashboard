# Portfolio Slice D — The offences your starters play in

**Surface:** `/portfolio` (My Team), a new block below *Where you rank / Weakest slots* and above *Bench*.
**Design source:** `Portfolio v4 - football first.dc.html`, the *"The offences your starters play in"*
block (extracted to a scratchpad during planning; the file itself lives only in
`~/Downloads/App design overhaul(1).zip`).
**Depends on:** nothing. **Unblocks:** the `GAME SCRIPT` column Slice B shipped as `PROVISIONAL(no-data)`.

---

## 0. Decision summary (read first — each departs from the brief or the design, with the reason)

Every claim below was checked against live source or the live served data during planning. The
brief's reuse inventory was right about `environment.js` and `opponentStrength.js` and **wrong about
the QB column**; the rest are calls the brief left open.

**D1 · `computeQBQualityByTeam` is not the starting point for the QB column — it is unrelated.**
The brief names it. Its body (`src/utils/teamContext.js`) returns a **dynasty-score 0–100 quality
number** keyed by **Sleeper-domain `nfl_team`**, built from `row.dynastyScore.score` with a
`ktcValue/100` fallback and a literal `50` default. It carries no QB name and no EPA, and it is a
projection-pipeline module feeding `applyQBQualityModifier`. Using it here would render a market
value under an `EPA/ATT` header. **Do not import it.**
The design's `QB · EPA/ATT` is genuinely available elsewhere: `nflverse/gamelogs/<year>.json`
carries per-player per-game `passingEpa` (an EPA **sum** for that game) and `attempts`. Verified
against the served 2025 file during planning: DET's most-attempted passer is sleeper id `3163`
(Goff), 578 REG attempts, `Σ passingEpa / Σ attempts = +0.184` — against the design's illustrative
`+0.21` for the same player, i.e. the right metric at the right magnitude. **That ratio is already
implemented**: `computeSeasonEfficiency` in `src/utils/seasonEfficiency.js` returns `epaPerAtt` per
player, REG-only, behind a `MIN_PASS_ATTEMPTS = 100` floor. §2.3 reuses it rather than recomputing —
a second implementation would let the same quarterback read `—` on Market and a confident number
here.

**D2 · The QB shown is 2025's primary starter, not 2026's depth-chart QB1.**
Every other column in this table is a 2025 regular-season number. Pairing a 2026 depth-chart name
with a 2025 EPA misattributes one player's season to another. One rule, one season: **most REG
attempts for that team in `dataSeason`**, with that player's own EPA/att. A team that changed QBs
for 2026 is a real caveat and belongs in the popover text (§2.3), not in a second selection rule.
The design's own IND row (`F. Mendoza`, EPA `rookie`, rank `0`) shows it anticipated a
current-QB-with-no-prior-data case; we decline that path rather than blend two seasons in one cell.

**D3 · `PTS ALLOWED` and `RZ TRIPS/G` both exist in the served data — neither needs a data-repo ask.**
Verified against the live `nflverse/teamcontext/2025.json`: `def.pointsAllowed` and `off.rzTrips`
are both present on every game row (`def` has 18 fields, `off` 31). `rzTrips` is **already** in
`OFF_SUM_FIELDS`; only `pointsAllowed` has to join `sumRegDef`, which today sums nothing but
`epaSum`/`epaPlays`. §1 does both. `MARGIN` is then pure arithmetic on two per-game values.

**D4 · PROE is a FRACTION in this codebase, not a percentage — the descriptor thresholds must be `0.015`, not `1.5`.**
`computeTeamSeasonMetrics().proe` returns `0.0072`-scale values; the design's strings are `'+2.8%'`
and its threshold literals are `1.5`. Writing `p >= 1.5` against the real field classifies **all 32
teams** as `balanced` — no error, no `NaN`, a descriptor column that is uniformly wrong. §2.2 states
the units on the function signature for this reason.

**D5 · SOS is per (team, position), and the cell renders one value per position I actually hold there.**
The design renders a single `SOS 2026` per row because each of its rows holds exactly one player.
Its own caption says "average fantasy points allowed to **your player's** position" — so the value
is not a team property. `buildFpaTable` is already per-position; averaging across positions to force
one number would invent a quantity the caption disclaims. A team holding a WR and an RB renders
`WR 12th · RB 26th`. A team holding two WRs renders one value. §2.2.

**D6 · SOS needs a schedule load that does not exist yet, and App.jsx already predicted it.**
`nflScheduleByYear` is loaded for `dataSeason` only (`App.jsx:1038-1053`), whose comment reads *"a
'next opponent' feature wanting the live season is additive later"*. This is that feature.
`nflverse/schedule/2026.json` is live on the CDN (272 REG rows, `gameType: 'REG'`, verified during
planning). §4 adds a second load into the **same** `{[year]: loaderResult}` map keyed on
`dataSeason + 1` — the same quantity Portfolio already renders as `projSeason`, so the column label
and the file fetched cannot drift apart. No new App state.

**D7 · `DEF EPA ALLOWED` is in the brief's column table but not in the design's rendered header.**
The design's `nflHead` has 11 columns and omits it; its data array carries `def`/`defR` unused. The
brief lists it. **Ship it** — it is one already-computed field (`defEpaPerPlay`), the block's own
subtitle promises *"what their defence gives back"*, and `Teams.jsx` already renders it with the
inversion handled. 12 columns.

**D8 · Full team names are a new 32-entry constant.** No name map exists anywhere in `src/`
(`NFL_TEAMS` in `marketFilters.js` is abbreviations only). §2.4 adds one. A name is a label, not a
measurement — this is not a fabricated value.

**D9 · The gamelogs↔teamcontext team-code join is safe here only because the table is 2025-only.**
Hazard: gamelogs `games[].team` is **current-franchise**, teamcontext keys are **era-accurate**.
For 2025 the two domains are byte-identical — verified during planning, the 32-key sets differ by
nothing. The QB join (§2.3) may therefore compare them directly, but **must carry a comment saying
why**, because the same code over a pre-2020 season would silently drop LV/LAC/LA. `row.nfl_team`
(Sleeper domain, `LAR`, literal `'FA'`) is a **third** domain and must go through
`normalizeTeamForSchedule` before touching a teamcontext key (§2.6).

**D10 · Row set is teams holding my players, not all 32.** Starters' teams first (by the design's
order: descending `PTS/G`), then bench-only teams behind a `show all N →` expander. `N` is computed,
never the design's literal `17`.

---

## 1. `src/utils/environment.js` — three metrics added

Additive only. Do not change any existing field, `SERIES_METRICS`, `FILTER_METRICS`, or
`LOWER_IS_BETTER`.

### 1.1 `sumRegDef` gains `pointsAllowed`

```js
function sumRegDef(games) {
  const reg = (games ?? []).filter(g => g.seasonType === 'REG')
  let epaSum = 0, epaPlays = 0, pointsAllowed = 0, pointsRows = 0
  for (const g of reg) {
    epaSum += g.def?.epaSum ?? 0
    epaPlays += g.def?.epaPlays ?? 0
    // Count the rows that actually carry the field. `?? 0` alone would turn an absent or renamed
    // `def.pointsAllowed` into a confident 0.0 PTS ALLOWED for all 32 teams — and a MARGIN exactly
    // equal to PTS/G — with no error and no `—`. There is no teamcontext fixture and no app-side
    // validator for `def.*`, and this is the family's first app-side read of the field, so the
    // presence count is the only thing standing between a schema change and a plausible wrong
    // number. Same reason `rzTripsPerGame` is guarded below.
    if (Number.isFinite(g.def?.pointsAllowed)) { pointsAllowed += g.def.pointsAllowed; pointsRows += 1 }
  }
  return { epaSum, epaPlays, pointsAllowed, pointsRows }
}
```

`sumRegOff` gains the same treatment for `rzTrips` only — add a parallel `rzTripsRows` counter
beside the existing `OFF_SUM_FIELDS` loop (leave the loop itself alone; count in a second, explicit
line, so the generic summer keeps its shape).

### 1.2 `computeTeamSeasonMetrics` gains three keys

Added to the returned object, after `defEpaPerPlay`, before `games`:

```js
    pointsAllowedPerGame: (gameCount > 0 && def.pointsRows === gameCount)
      ? def.pointsAllowed / gameCount : null,
    marginPerGame: (gameCount > 0 && def.pointsRows === gameCount)
      ? (sums.pointsScored - def.pointsAllowed) / gameCount : null,
    rzTripsPerGame: (gameCount > 0 && rzTripsRows === gameCount)
      ? sums.rzTrips / gameCount : null,
```

The `=== gameCount` test is deliberate: a *partially* present field is as untrustworthy as an absent
one, and a per-game average over a short numerator and a full denominator is silently low.

`gameCount` is the **REG offence** game count and is the correct denominator for the defence terms
too: `off` and `def` are two keys on the same game row, so the counts cannot diverge. `margin` is
computed from the two **sums** over one denominator, not as a subtraction of two rounded per-game
values — CR-10's "aggregate then divide" rule applies to the derived quantity as well.

Expected magnitudes (computed from the live 2025 file during planning, for the test in §5.1):
`LA` 30.5 / 20.4 / +10.1 / 4.41 rz; `DET` 28.3 / 24.3 / +4.0 / 3.76; `LV` 14.2 / 25.4 / −11.2 / 2.18.

### 1.3 Header comment

Append to the module header: the three new fields, that `def.pointsAllowed` is the family's first
app-side read of that field anywhere, and that `marginPerGame` is a derived difference of two sums
over one denominator.

---

### 1.4 New export: `rankMetricsTable`

`buildLeagueRankTable` ranks *from a loaded season*, re-deriving every team's metrics. This slice
already holds `buildTeamMetricsTable`'s output and needs ranks over the same numbers, so factor the
ranking half out:

```js
/**
 * Ranks over an ALREADY-COMPUTED metrics table (dp-v2 / Portfolio Slice D) — the additive
 * counterpart to buildLeagueRankTable, which starts from a loaded season and recomputes.
 * Honours the same LOWER_IS_BETTER set. 1 = best; a team with a null value for a metric is absent
 * from that metric's map, never defaulted to first or last.
 * @param {ReturnType<typeof buildTeamMetricsTable>} metricsTable
 * @param {string[]} metricIds
 * @returns {{ [metricId:string]: { [team:string]: number } }}
 */
export function rankMetricsTable(metricsTable, metricIds)
```

Implement `buildLeagueRankTable` in terms of it — `buildLeagueRankTable(loaded, ids)` becomes
`rankMetricsTable(buildTeamMetricsTable(loaded), ids)`. That is a behaviour-preserving refactor of
two existing lines, not a rewrite: the existing `buildLeagueRankTable` already does exactly
"one `computeTeamSeasonMetrics` per team, then rank each metric from that one pass", which is those
two calls composed. Its existing tests must pass unchanged — if any needs editing, stop and report
rather than editing it green.

**Metric ids this slice ranks:** `pointsPerGame`, `epaPerPlay`, `proe`, `defEpaPerPlay`. None is in
`LOWER_IS_BETTER` (which holds only `pace`), so `defEpaPerPlay`'s rank 1 is the *worst* defence —
inverted at the render site, never by touching that set.

## 2. New utils and component

### 2.1 `src/utils/gameScript.js` (new) — the cross-slice export

Pure, no React, no I/O. This is the module Slice B's `GAME SCRIPT` column consumes; it is the reason
this slice earns its place, so it ships with the descriptor **and** the position-fit verdict.

```js
export const MARGIN_LEADS = 4        // points per game
export const MARGIN_TRAILS = -4
export const PROE_PASS_HEAVY = 0.015 // FRACTION — see D4
export const PROE_RUN_HEAVY = -0.015

/**
 * A team's game-script descriptor, e.g. 'trails · pass-heavy'.
 * @param {number|null} marginPerGame  points for − points against, per game
 * @param {number|null} proe           pass rate over expected, as a FRACTION (0.028 = +2.8%)
 * @returns {{ margin: 'leads'|'trails'|'even'|null,
 *             tempo: 'pass-heavy'|'run-heavy'|'balanced'|null,
 *             label: string|null }}
 */
export function describeGameScript(marginPerGame, proe)
```

- A `null`/non-finite input nulls **that half only**. Both null → `{margin:null, tempo:null, label:null}`.
  One present → `label` is that half alone (`'trails'`, `'pass-heavy'`), never `'trails · —'`.
- `label` joins the two halves with `' · '` (U+00B7, matching the design and `PlayerCell`'s meta).

```js
/**
 * Whether a team's script suits a position. Pass-catchers (QB/WR/TE) want trailing and pass-heavy;
 * backs (RB) want leading and run-heavy. The inversion is the whole point — see §3 of the brief.
 * @returns {'good'|'bad'|'neutral'}
 */
export function gameScriptFit(script, position)
```

Rules, transcribed from the design's `starters` map and generalised off its `isRB` test:

- `wants = position === 'RB' ? { margin: 'leads', tempo: 'run-heavy' } : { margin: 'trails', tempo: 'pass-heavy' }`
- `against` is the mirror (`RB` → `trails`/`pass-heavy`; others → `leads`/`run-heavy`).
- `good` = either half matches `wants` and **neither** matches `against`.
- `bad` = either half matches `against` and **neither** matches `wants`.
- Everything else (including a null script, an unknown position, or `even · balanced`) → `neutral`.
- A `null` or unrecognised `position` → `neutral`, never the pass-catcher default: an unknown
  position must not be silently treated as a WR.

Note the asymmetry this produces, and keep it: `leads · pass-heavy` is `neutral` for **both** an RB
and a WR (one half each way). That is the design's own behaviour and it is correct — a split script
is not evidence either way.

### 2.2 `src/utils/strengthOfSchedule.js` (new)

```js
/**
 * Average fantasy points allowed to each position by a team's REMAINING opponents.
 * @param {{games: Array<object>}|null} schedule  loadNflSchedule(year) result; gated on `complete`
 *        by the CALLER, which passes null when incomplete
 * @param {ReturnType<typeof buildFpaTable>} fpaTable  era-accurate keys
 * @returns {{[team:string]: {qb:number|null, rb:number|null, wr:number|null, te:number|null,
 *            opponents:number}}}
 */
export function buildSosTable(schedule, fpaTable)
```

- REG only: `g.gameType === 'REG'`. Each game contributes its opponent to **both** teams.
- **Unplayed games only** — skip any game whose `homeScore != null`. `sosSeason` is the **live**
  season by construction (see §3.1), so without this filter the column is a full-season average that
  silently includes weeks already behind us; today (2026 week 3) the served
  `nflverse/schedule/2026.json` already carries real scores. The loader's documented null semantics
  are the gate: *"homeScore/awayScore/result are null for unplayed games"* — and `result` is
  **0 for a tie**, so test `homeScore`, never `result`, and never truthiness.
  Pre-season every game is unplayed and this is the full 17.
- `homeTeam`/`awayTeam` are the schedule domain; run both through `normalizeTeamForSchedule` so the
  keys land in the same era-accurate domain as `fpaTable` (CR-16).
- Per position, average `fpaTable[opponent][pos]` over opponents with a non-null value; **opponents
  missing that position's value are dropped from both numerator and denominator**, never counted as
  zero. No opponent has a value → `null` for that position.
- `opponents` is the count of remaining scheduled games found, so a caller can tell "no schedule"
  from "a real average", and "one game left" from "seventeen".
- Empty/absent schedule → `{}`. Never throws.

**Ranking reuses `rankFpaTable` verbatim — write no `rankSosTable`.** Checked against the body
(`src/utils/opponentStrength.js:158-170`): it is keyed by **team**, iterates `FPA_POSITIONS`
explicitly, sorts each position **ascending** so rank 1 is the lowest points allowed — which is
exactly "1 = hardest" — gives a team with a null value a null rank while keeping its entry, and
ranks over however many teams have a value rather than assuming 32. `buildSosTable` returns the same
row shape `buildFpaTable` does, and `opponents` is an inert sibling key exactly as `weights` already
is, because the iteration is over `FPA_POSITIONS` and never `Object.keys(row)`. Import it in
`Portfolio.jsx` alongside `buildFpaTable`.

### 2.3 `src/utils/qbSeason.js` (new)

This module **selects** each team's primary passer. It does **not** compute EPA — `epaPerAtt` comes
from `computeSeasonEfficiency` (`src/utils/seasonEfficiency.js:61`), which already aggregates
`Σ passingEpa / Σ attempts` over REG games behind `MIN_PASS_ATTEMPTS = 100`. Recomputing it here
would fork the ratio and drop the floor, so the same quarterback could read `—` in Market's
Efficiency set and a confident number in this table.

```js
/**
 * Each team's primary passer for one season: the player with the most REG pass attempts.
 * Selection only — no EPA. Pair the returned playerId with computeSeasonEfficiency's `epaPerAtt`.
 * @param {{players: object, complete?: boolean}|null} gameLogs  loadNflGameLogs(year) result
 * @returns {{[team:string]: {playerId: string, attempts: number}}}
 */
export function buildTeamPrimaryPassers(gameLogs)
```

- Gate on `gameLogs?.complete` inside the function and return `{}` when false — the same shape
  `computeSeasonEfficiency` uses, so the two cannot disagree about whether the season loaded.
- Accumulate REG-only `attempts` per `(games[].team, playerId)`. Skip rows with zero or non-finite
  attempts: a rushing-only game must not dilute the count, and a non-QB must never become a team's
  primary passer.
- Ties → higher total attempts is the only criterion; break exact ties on the lower `playerId` so
  the result is deterministic across runs.
- A player who changed teams mid-season accrues to **each** team separately, since the bucket key is
  the game row's own `team`. That is correct: this asks who threw the passes for *this* offence.
- Keys are gamelogs' **current-franchise** domain. Safe to index a teamcontext row with directly
  **for 2025 only** (D9) — carry that as a comment at the call site in §2.6, not here.
- The display name is resolved by the caller from `playerMap[playerId]`, not here — this module is
  pure over gamelogs and must not take `playerMap`.
- A primary passer under the 100-attempt floor renders his name with `—` for EPA. That is the
  correct outcome, not a gap to paper over.

### 2.4 `src/utils/nflTeamNames.js` (new)

`export const NFL_TEAM_NAMES = { ARI: 'Arizona Cardinals', ... }` — 32 entries in the **era-accurate
current** domain, i.e. the exact key set of `teamcontext/2025.json`: `LA` (not `LAR`), `LAC`, `LV`.
Plus `export function teamName(abbr) { return NFL_TEAM_NAMES[abbr] ?? abbr }` — an unknown code
falls back to the abbreviation, never `undefined` and never a `—`.

Historical codes (`STL`/`SD`/`OAK`) are **out of scope**: nothing in this slice renders a pre-2020
season. Say so in the header so a later slice knows the map is deliberately current-only.

### 2.5 `src/components/portfolio/TeamOffences.jsx` (new)

Props-only, like `LeagueLadders`/`WeakestSlots`. It computes nothing from raw loaders — Portfolio
assembles rows and passes them in.

```jsx
export function TeamOffences({ rows = [], dataSeason = null, sosSeason = null, rankedTeamCount = 0 })
```

`rows` is already sorted (starters' teams first, then bench-only) and each row is:

```js
{
  team,                  // era-accurate abbr
  name,                  // full name
  hasStarter,            // drives the split point and the expander
  players: [{ playerId, name, position, starter }],
  pointsPerGame, ptsRank,
  pointsAllowedPerGame,
  marginPerGame,
  epaPerPlay, epaRank,
  proe, proeRank,
  playsPerGame,
  rzTripsPerGame,
  defEpaPerPlay, defRank,
  qb: { name, epaPerAtt, rank } | null,
  sos: [{ position, rank }],   // one per distinct position held, in QB/RB/WR/TE order
  script,                      // describeGameScript output — rendered as the row's title attr only
}
```

Structure, per the design:

- Card: `bg-dp-card border border-dp-border rounded-[10px] overflow-hidden`.
- Header row: title *"The offences your starters play in"*, subtitle
  *"{dataSeason} season, regular season only · how they use players, how well they do, what their
  defence gives back"*, and a right-aligned mono meta
  *"teamContext · {rankedTeamCount} TEAMS · BLUE / AMBER = TOP / BOTTOM 8"* — the number of teams
  actually ranked, not a literal 32.
  **The prop is `rankedTeamCount`, never `teamCount`:** `Portfolio.jsx:268` already binds
  `const teamCount = leagueLineups.length` — the *fantasy* league's size (12), used at `:341`,
  `:370`, `:378`, `:429` and passed to `<LeagueLadders>`. Passing it here compiles, renders a
  plausible header, and colours every rank ≥ 5 amber.
- Table headers reuse `TH_CLASS` and `DIVIDER`. **Move both into a new
  `src/components/portfolio/tableClasses.js` and import them in both files** — do NOT export them
  from `Portfolio.jsx` and import back, which is a cycle: `Portfolio.jsx:14-15` already imports
  `LeagueLadders` and `WeakestSlots`. The sibling precedent for exactly this is `slotLabel.js`
  (Slice C, C10), a pure move into a shared module. Delete the two consts from `Portfolio.jsx` in
  the same change; they are module-level and have no other reader.
  Dividers before `PTS/G`, `OFF EPA/PL`, `QB`, and `SOS`, matching the design's `bl` flags.
- Columns, in order: `TEAM`, `YOUR PLAYERS`, `PTS/G`, `PTS ALLOWED`, `MARGIN`, `OFF EPA/PL`, `PROE`,
  `PLAYS/G`, `RZ TRIPS/G`, `DEF EPA ALL`, `QB {dataSeason} · EPA/ATT`, `SOS {sosSeason}`.
- Player chips: starters `text-dp-up-text bg-dp-up-bg border border-dp-up-border`, bench
  `text-dp-text-5 border border-dp-border` on transparent. Chip text is the player's **last name**
  (the design shows `LaPorta`, `Rice`), falling back to the full name when a last name cannot be
  split off.
- `PTS/G` carries the design's inline bar: a `<div>` (never a `<span>` — see §6) of width
  `Math.round(((pts - 16) / 16) * 60)` px clamped to `[0, 60]`, `bg-dp-up` at top-8, `bg-dp-down` at
  bottom-8, `bg-dp-slate` between.
- Row `title` is the game-script label, so hovering a row explains the margin without a column.

Rank colouring — one shared helper in this file, the design's `tone()`:

```js
// blue at top-8, amber at bottom-8, neutral between. `invert` flips it for metrics where a low
// rank number is bad news for my player (SOS: rank 1 = hardest schedule).
function toneClass(rank, invert = false) {
  if (rank == null) return 'text-dp-text'
  const good = invert ? rank >= 25 : rank <= 8
  const bad  = invert ? rank <= 8  : rank >= 25
  return good ? 'text-dp-up-text' : bad ? 'text-dp-down-text' : 'text-dp-text'
}
```

`25` is `rankedTeamCount - 7`; with 32 ranked teams the literal is right, but compute it as
`rank >= rankedTeamCount - 7` so a partial rank set does not colour half the table amber.

**`MARGIN` ships UNCOLOURED (`text-dp-text`), departing from the design.** The design colours a
positive margin blue — and then the caption directly beneath it says a *negative* margin is the good
one for pass-catchers. Both cannot be true on one screen: blue-means-winning and blue-means-good-for
-your-player are different claims sharing one colour. Colour is this table's verdict channel, and
the only well-defined verdict about margin is position-dependent — which is precisely what the
`GAME SCRIPT` column now carries, per player, via `gameScriptFit`. So MARGIN renders the signed
number and nothing more, and the caption explains it. Sign formatting still follows the design
(`+4.0` / `−11.2`, U+2212 for the minus).

**`PROE` keeps the design's colouring, uninverted** — rank 1 (most pass-over-expected) is blue.
PROE is a property of the offence, not of my player, and the table's job is to describe the offence;
the position-dependence lives one column over in `GAME SCRIPT`, which is per-player and where it
belongs. Inverting PROE here would make the same offence render blue on one row and amber on
another purely because of who I happen to roster.

**`DEF EPA ALL` uses `invert`** — a defence allowing negative EPA is good, and this is the exact
inversion `Teams.jsx`'s `epaColorClass` comment warns about. Note `buildLeagueRankTable` does **not**
treat `defEpaPerPlay` as lower-is-better, so its rank 1 is the *worst* defence; the inversion at the
render site is what makes that read correctly. Do not "fix" it by adding the metric to
`LOWER_IS_BETTER` — that set is shared with Market's filters and Teams' sort.

Missing values render `—` in `text-dp-muted`, per column, with the column still present. No
"missing data" callout anywhere in this block.

Expander: below the starters' teams, `show all {rows.length} →` in `text-dp-up-text` as a real
`<button>` (not a styled span), toggling `useState(false)`. Collapsed shows only `hasStarter` rows.
When every row has a starter, render no expander at all — not a disabled one. Expanded label is
`show fewer ←`. This is view-local UI state, which the App.jsx-owns-state invariant explicitly
permits.

Caption footer, two columns, `bg-dp-card-quiet border-t border-dp-border-row`, shipped verbatim:

> PTS/G against PTS ALLOWED is the game script: a negative MARGIN means the team usually trails and
> throws to catch up, good for pass-catchers; a big positive margin means leads and a run-heavy
> fourth quarter. A high PROE says the team throws more than the situation calls for.

and, second column, `text-dp-muted-2`:

> SOS is the rest of the {sosSeason} schedule — the average fantasy points allowed to your player's
> position (FPA) by the opponents still to come, ranked 1 = hardest.

The design's trailing *"Seven more teams hold bench-only players and sit below the fold"* sentence is
**dropped** — the expander button says the same thing with a live count.

`DefinitionPopover` on the `PROE`, `RZ TRIPS/G`, `DEF EPA ALL`, `QB` and `SOS` headers (not on every
column — the caption already covers PTS/PTS ALLOWED/MARGIN). Keep each `gloss` to one or two
sentences. The QB gloss must state **D2** plainly: *"{dataSeason}'s primary passer by attempts, and
his EPA per attempt that season. A team that has since changed quarterbacks will show last season's
starter."* The SOS gloss must state the FPA basis is Sleeper's own half-PPR, mirroring
`Teams.jsx`'s `fpaPopoverText` wording rather than inventing a second phrasing.

Horizontal scroll: the table sits in `<div className="overflow-x-auto">`, the card has
`overflow-hidden`. The page body must not scroll — same containment `Teams.jsx` and Slice B's
tables already use.

### 2.6 `src/components/portfolio/Portfolio.jsx` — wiring

New props (defaults keep every existing test render valid):

```js
teamContextByYear = null, gameLogsByYear = null, nflScheduleByYear = null,
currentSeasonTotals = null,
```

New memos, placed after `playerFactsById`:

- `teamMetrics` — `buildTeamMetricsTable(tcForSeason)` where
  `tcForSeason = teamContextByYear?.[dataSeason]`, gated on `?.complete` (**never key presence** —
  CLAUDE.md's loader rule); `{}` when incomplete.
- `teamRanks` — ranks over the **same** `teamMetrics` object, via a new additive export on
  `environment.js` (§1.4). Do **not** also call `buildLeagueRankTable`: it starts from the loaded
  season and runs its own `computeTeamSeasonMetrics` pass per team, so calling both here is two full
  passes over 32 teams for one render — the exact duplication `buildLeagueRankTable`'s own header
  (`src/utils/environment.js:121-134`) exists to prevent. `buildLeagueRankTable` stays untouched;
  Market and Teams keep using it.
- `fpaTable` / `sosTable` / `sosRanks` — `buildFpaTable({ priorRows: careerStats?.[dataSeason] ?? null,
  currentRows: currentSeasonTotals?.complete ? currentSeasonTotals.players : null })`, then
  `buildSosTable(sched?.complete ? sched : null, fpaTable)` with
  `sched = nflScheduleByYear?.[sosSeason]`, `sosSeason = projSeason`.
  Copy Teams.jsx's `currentSeason` derivation verbatim — it must be the loader's own `complete`
  flag, not a second local guess.
- `primaryPassers` — `buildTeamPrimaryPassers(gameLogsByYear?.[dataSeason] ?? null)` (the helper
  gates on `complete` itself, §2.3).
- `efficiency` — `computeSeasonEfficiency(gameLogsByYear?.[dataSeason] ?? null, tcForSeason, dataSeason)`.
  Its third argument is `season`; pass `dataSeason`. The QB's EPA is
  `efficiency[primaryPassers[team]?.playerId]?.epaPerAtt ?? null` — never recomputed here.
  The QB rank is a rank over those `epaPerAtt` values across the teams that have one, descending
  (higher EPA = rank 1), computed in this memo; a team whose passer is under the attempt floor has a
  null EPA and therefore a null rank, and renders `—` beside the name.
- `offenceRows` — the assembly. For each owned row with a real NFL team
  (`r.nfl_team` present and **not** the literal `'FA'`), bucket by
  `normalizeTeamForSchedule(r.nfl_team)` (CR-16: `LAR` → `LA`, or the Rams row silently vanishes).
  `starter` is membership in `myLineup.slots`' non-null `player_id` set. Then one row per bucket per
  §2.5's shape, sorted `hasStarter` desc, then `pointsPerGame` desc with nulls last via
  `compareNullsLast(a, b, dir)` from `src/utils/sortUtils.js` — **three required arguments**, the
  third being `-1` for descending (see `Teams.jsx:216` for the live call shape).
  The QB name resolves as `playerMap?.[primaryPassers[team]?.playerId]?.full_name ?? null` — and
  this indexing of a **current-franchise** gamelogs key into an **era-accurate** teamcontext bucket
  needs the D9 comment here, at the join, naming the 2025-only precondition.

Render `<TeamOffences …/>` in its own full-width row between the ladders grid and the Bench block.
Show it only when there is at least one row; when `ownedRows` is empty the block is absent, matching
how the ladders behave with no roster.

`ScriptCell` — replace the `PROVISIONAL(no-data)` stub:

```jsx
function ScriptCell({ script, position }) {
  if (script?.label == null) return <span className="text-dp-muted">—</span>
  const fit = gameScriptFit(script, position)
  const cls = fit === 'good' ? 'text-dp-up-text' : fit === 'bad' ? 'text-dp-down-text' : 'text-dp-text-5'
  return <span className={`text-[11px] ${cls}`}>{script.label}</span>
}
```

**There are TWO call sites, not one** — `Portfolio.jsx:725` (Starting ten) and `:838` (Bench). Wire
**both**; a bench player's offence is exactly as real as a starter's, and leaving `:838` as a bare
`<ScriptCell />` would strand it at a permanent `—` under a component that no longer carries the
`PROVISIONAL` tag explaining why. Each passes its own row's team and position:
`<ScriptCell script={scriptByTeam[normalizeTeamForSchedule(row.nfl_team)] ?? null} position={row.position} />`,
where `scriptByTeam` is a memo mapping each team in `teamMetrics` through `describeGameScript`.
The Bench table's empty/pick rows keep their literal `—` cell (`:820`) — a draft pick has no
offence, and `normalizeTeamForSchedule` must never be handed a pick row.
A player whose `nfl_team` is the literal `'FA'` resolves to no script and renders `—`.
**Delete the `PROVISIONAL(no-data)` comment above it in the same change** (CLAUDE.md: the tag is
deleted by the change that wires the real source) and update the `GAME SCRIPT` header's
`DefinitionPopover` gloss — it currently ends *"Not built yet — arrives with the team-metrics
slice."*, which is false the moment this lands.

---

## 3. `src/App.jsx` — one effect, four props

**3.1** A second schedule effect, immediately after the existing one, sharing `nflScheduleByYear`:

```js
  // Slice D — the LIVE season's schedule, for the Portfolio SOS column. The effect above loads
  // dataSeason (the season whose game logs it annotates); this one loads dataSeason + 1, which is
  // always the live NFL season, because careerStats is built `s < currentSeason` (see the
  // currentSeasonTotals effect below) — so dataSeason is always the last COMPLETED season and
  // dataSeason + 1 is nflState.season. Portfolio labels the same quantity `projSeason`, which is
  // why the column header and the file fetched cannot drift apart. Same `{[year]: loaderResult}`
  // map, merged per year, so no new state. The one degraded window is the early offseason before
  // nflverse publishes the new season's file: loadNflSchedule returns its graceful
  // `complete: false` and SOS renders `—`, which is correct.
  useEffect(() => {
    if (!careerStats) return
    let cancelled = false
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const sosSeason = allSeasons[allSeasons.length - 1] + 1
    loadNflSchedule(sosSeason)
      .then(r => { if (!cancelled) setNflScheduleByYear(prev => ({ ...prev, [sosSeason]: r })) })
      .catch(err => console.warn('[nflSchedule] SOS load error:', err.message))
    return () => { cancelled = true }
  }, [careerStats])
```

The `cancelled` guard is required (React Strict Mode invariant), not optional.

**3.2** Four props onto the `/portfolio` `<Portfolio>` element: `teamContextByYear`,
`gameLogsByYear`, `nflScheduleByYear`, `currentSeasonTotals`. All four are existing bindings in
scope at that call site. Change nothing else about the route.

---

## 4. Tests

### 4.1 `src/utils/environment.test.js` — extend

Two-game hand-built team fixture (`seasonType: 'REG'` plus one `'POST'` row that must be excluded):
asserts `pointsAllowedPerGame`, `marginPerGame`, `rzTripsPerGame`; asserts a zero-game team yields
`null` for all three (not `NaN`, not `0`); asserts the POST row changes none of them.

**The presence guard (§1.1/§1.2):** a fixture whose `def` rows omit `pointsAllowed` entirely must
yield `pointsAllowedPerGame === null` and `marginPerGame === null` — **not** `0` and **not**
`pointsPerGame`. A second fixture where only one of two REG rows carries the field must also yield
`null`, not a half-numerator average. Same pair for `rzTrips`. These are the tests that catch a
silent upstream schema change on the family's first app-side read of the field.

`rankMetricsTable` (§1.4): ranks a hand-built metrics table; honours `LOWER_IS_BETTER` for `pace`;
a team with a null value is absent from that metric's map rather than ranked last; and
`buildLeagueRankTable(loaded, ids)` equals `rankMetricsTable(buildTeamMetricsTable(loaded), ids)`
on the same fixture — the assertion that the refactor preserved behaviour. **The existing
`buildLeagueRankTable` tests must pass unedited.**

### 4.2 `src/utils/gameScript.test.js` (new) — the brief's §6 core

- `describeGameScript` across the margin × PROE grid: all nine combinations of
  `{+6, 0, −6} × {+0.03, 0, −0.03}` against the expected label.
- **Boundary rows at exactly `4`, `−4`, `0.015`, `−0.015`** — each threshold is `>=`/`<=`, so the
  boundary value is inside the named band, and a test that only probes ±6 would not catch a flipped
  comparison.
- **The D4 unit regression:** `describeGameScript(0, 0.028)` is `pass-heavy`. Assert it explicitly
  with a comment naming the percentage-vs-fraction trap — this is the test that fails if someone
  "fixes" the threshold to `1.5`.
- Null handling: both null; margin-only; PROE-only — asserting `label` never contains a `—`.
- `gameScriptFit` inversion: `'trails · pass-heavy'` is `good` for WR/TE/QB and `bad` for RB;
  `'leads · run-heavy'` is the mirror; `'even · balanced'` is `neutral` for both; `'leads ·
  pass-heavy'` is `neutral` for both (the deliberate asymmetry, §2.1); a null script and a null
  position are each `neutral`.

### 4.3 `src/utils/strengthOfSchedule.test.js` (new)

- A 3-team round-robin schedule against a hand-built FPA table: asserts the average is over
  opponents, that a team appears in both its home and away games, and `opponents` counts correctly.
- An opponent with a `null` value for one position is **excluded from the denominator** — assert the
  numeric result, not just non-null, since a zero-fill bug still produces a number.
- A `POST` (non-`REG`) game is excluded.
- **A played game (`homeScore` non-null) is excluded**, and a game with `homeScore: 0` **is**
  excluded while one with `result: 0` (a tie, already played) is too — the tie case is the one a
  truthiness check gets wrong, so assert it explicitly.
- All games played → every position `null` and `opponents: 0`, not a crash and not a stale average.
- `null`/empty schedule → `{}`; no throw.
- `rankFpaTable` over a `buildSosTable` result: 1 = lowest FPA (hardest); the `opponents` sibling
  key does not become a fifth ranked position; a team with a null value keeps its entry with a null
  rank; ranks over 3 teams, not 32.

### 4.4 `src/utils/qbSeason.test.js` (new)

- Two passers on one team: the higher-attempt one wins, and the returned `attempts` is the REG sum.
- A zero-attempt row does not create a passer and does not dilute attempts.
- A passer who played for two teams is returned for **each** team with only that team's attempts.
- A `POST` row is excluded.
- An exact attempt tie resolves to the lower `playerId`, deterministically across runs.
- `complete: false` and `null` inputs → `{}`.
- **No EPA assertion here** — this module returns no EPA (§2.3). `epaPerAtt` stays covered by
  `seasonEfficiency`'s existing tests, including its `MIN_PASS_ATTEMPTS` floor.

### 4.5 `src/components/portfolio/TeamOffences.test.jsx` (new)

- Renders a row's team, name, chips, and every numeric cell.
- **Rank colouring at the boundaries** (brief §6): ranks `8` and `9` on `PTS/G` assert
  `text-dp-up-text` present / absent; `24` and `25` for the amber edge; and the same four for `SOS`
  with `invert` — where the classes are the **opposite** way round. Assert on the rendered
  `className`, per `LeagueLadders.test.jsx`'s precedent.
- `rankedTeamCount` drives the amber edge: with `rankedTeamCount = 16`, rank `9` is amber and rank
  `8` is not — the regression that catches a hard-coded `25`.
- **MARGIN carries neither the up nor the down colour class** at `+10`, at `−10` and at `0` — the
  deliberate departure from the design (§2.5). A test that only checks the text would let a future
  "restore the design's colour" pass silently re-introduce the caption contradiction.
- **A row with every metric null renders `—` in each cell and does not throw** (brief §6) — include
  `qb: null` and `sos: []` in that row.
- Expander: collapsed shows only starter teams; clicking `show all N →` reveals the rest; with all
  rows `hasStarter` the button is absent from the DOM.
- The `PTS/G` bar is a `div` with a non-zero inline width — the direct guard against the Slice C
  `<span className="w-full">` class of bug (§6).

### 4.6 `src/components/portfolio/Portfolio.test.jsx` — integration only

- With the four new props supplied as complete loader results, the block renders and a known team
  row is present.
- With all four omitted (the existing default), the block is absent and **the rest of the screen
  still renders** — this is the regression that protects every pre-existing test.
- `GAME SCRIPT` renders a real descriptor for a starter whose team has metrics, and `—` for one
  whose team has none — asserted **in both tables**, `starting-ten` and the Bench (the two call
  sites, §2.6), since wiring only one is the likely miss.
- A Rams player (`nfl_team: 'LAR'`) lands on the `LA` teamcontext row and gets a real script — the
  CR-16 regression, which produces an empty bucket and a `—` rather than an error.
- Assert `PROVISIONAL(` no longer appears for GAME SCRIPT: `grep -rn "PROVISIONAL(" src/` output goes
  in the hand-back summary (CLAUDE.md), and the count must drop by one.

---

## 5. Docs to update in the same change

- `docs/nav/utils.md` — one row each for `gameScript.js`, `strengthOfSchedule.js`, `qbSeason.js`,
  `nflTeamNames.js`; amend the `environment.js` row with the three new metrics.
- `docs/nav/components.md` — a row for `TeamOffences.jsx`; amend the `Portfolio.jsx` row.
- `CLAUDE.md` — the `src/components/portfolio/` directory description gains the offences table.
  Watch the 25,000-byte ceiling (`claudeMdSize.test.js`); prune in the same commit if it breaches.
- `docs/signal-registry.md` — **three** Current-use cells (CR-18):
  - the **teamcontext** row (`:60`) — sixth use: Portfolio's offences table, and the family's first
    app-side read of `def.pointsAllowed` anywhere;
  - the **schedule** row (`:58`) — second consumer, and the first load of a season **other than**
    `dataSeason` into `nflScheduleByYear`;
  - the **`fan_pts_allow_*`** row (`:54`) — second consumer, first use as a *schedule* strength
    rather than a per-defence rate.
  The **gamelogs** row also gains `passingEpa`/`attempts` as a QB-quality read — check whether that
  row already enumerates those fields before adding.

## 6. Constraints carried from prior slices

- Tokens: `--color-dp-*` only. No hex literals in the component.
- **Tailwind width/height on a `<span>` renders at zero** — the Slice C spec bug. Every bar and
  every sized element in this slice is a `<div>` or carries `block`/`inline-block`. No class-string
  test catches this; §4.5 asserts the rendered width instead, and the smoke test is the real gate.
- Loader results are gated on `complete`, never key presence.
- Football language throughout; no fantasy-manager jargon in the caption.
- Do not touch `computeLeagueStanding`, `SERIES_METRICS`, `FILTER_METRICS`, or `LOWER_IS_BETTER`.
- Do not import `src/utils/teamContext.js` (D1) or `src/api/teamContext.js` into any new util —
  `TeamOffences.jsx` and the new utils take plain data.

## 7. Done

CLAUDE.md's done-definition, plus: smoke the `/portfolio` screen in the running app and report the
offences table's first two rows' numbers and the GAME SCRIPT column's colours. Paste
`grep -rn "PROVISIONAL(" src/` into the hand-back.

## Cross-repo impact

Six registry entries are touched. Each `Mirror` block below is that entry's own text, quoted from
`docs/cross-repo-registry.md`; the **Slice D** note after it is what this change adds.

### CR-08 · nflverse schedule (read-only)

> Shape or floor changes land in both repos together. Read-only on the app side — not wired into
> projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor
> change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24),
> `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs`
> reads this family (while `inProgress`) to derive each team's bye week(s) for
> `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a
> `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being
> written, with no validator to catch it (this family stays read-only/view-only on the app side
> regardless).

**Slice D:** a second app-side renderer and the first load of a season other than `dataSeason` into
`nflScheduleByYear`. `buildSosTable` reads `gameType`, `homeTeam`, `awayTeam` **and `homeScore`** —
the last as the played/unplayed gate, relying on the loader's documented "null for unplayed"
semantics, so a source that starts writing `0` for unplayed games would silently empty this column.

### CR-09 · nflverse gamelogs (view-only)

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are
> load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week`
> and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every
> week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all
> seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without
> changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/
> `passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is
> now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not
> merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are
> never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must
> never feed projection/scoring/grading. 2019 was backfilled on 2026-07-03 (5,756 rows across 586
> players) and is no longer a gap; the family is complete 2012–2025.

**Slice D:** a new app-side reader of `players[].games[]` — `buildTeamPrimaryPassers` reads
`seasonType`, `team` and `attempts`. It is a **team-grain** reader of the per-game `team` key, a use
this entry's "week-grain team join" prose does not yet cover, and it relies on the
current-franchise-vs-era-accurate identity holding for the rendered season (D9).

### CR-10 · nflverse teamcontext (view-only)

> Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is
> `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week
> rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average
> stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly across
> weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

**Slice D:** **the first app-side reader anywhere of `def.pointsAllowed`** — served on every game
row, consumed by nothing until now. `sumRegDef` sums it as a counting component and divides once by
the REG game count; `marginPerGame` is a difference of two sums over that one denominator, never a
subtraction of two rounded per-game rates. `off.rzTrips` was already in `OFF_SUM_FIELDS` and gains
its first rendered consumer. Sixth rendering consumer overall: `portfolio/TeamOffences.jsx`.

### CR-18 · Signal registry rows (`docs/signal-registry.md`)

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
> script the list above cannot already name. The listed sites are every one that exists today; a
> *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its
> own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo
> change adds, removes or reclassifies an ingested field, stat key or source — or alters its
> historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Slice D:** the flow is app→data here, not data→app, so the deliverable is the four Current-use
cell edits in §5 (teamcontext, schedule, `fan_pts_allow_*`, gamelogs), made in this repo in this
change.

### CR-20 · `fan_pts_allow_*` DEF-row key preservation

> Do not remove, rename or filter
> `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/(total), and do not widen `prunePlayerStats`'s
> denylist (or replace it with an allowlist) without an explicit DEF-row exemption alongside the
> existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA QB/RB/WR/TE columns degrade silently to `—`
> across all 32 teams** if either the keys or the rows vanish — no error, no test failure,
> indistinguishable from the API-only-mode degraded state already shown for an unrelated reason.
> This is the exact silent-degradation shape CR-11/12/13/19 exist to record, for a *row*, not
> merely a key.

**Slice D:** a second consumer on a second surface — `buildSosTable` via `buildFpaTable`. The silent
degradation this entry describes now empties the Portfolio SOS column too, and there it has **no**
"API-only mode" banner to explain itself. No shape change is requested.

### CR-21 · In-progress season-totals reads

> If the weekly job stops running, starts writing partial weeks under a different marking, or the
> `inProgress` flag's meaning changes, **the app has no way to tell** — it will render a half-
> season's rates as though they were a season's, with no error and no test failure. The floor in
> `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season
> validates; that means **the validator no longer distinguishes "early season" from "broken scrape"
> by games played alone**, and the app-side consumer must not assume it does. Any change to the
> job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror
> for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a
> pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

**Slice D:** threads `currentSeasonTotals.players` into `buildFpaTable`'s `currentRows` on a new
surface. The obligation this creates is **wording**: the SOS popover must not present the blend as a
completed season. Mirror `Teams.jsx`'s `fpaPopoverText`, which already names the prior season, the
current season and the per-team `gCur` weight — do not write a second, vaguer phrasing here.

### CR-23 · Team-season summary pack (parked)

> This pack is **derived, not sourced** … **Any change to the summed field set is a both-repos
> change in the same cycle.**

**Slice D:** §1.1 changes the summed field set — `sumRegDef` gains `pointsAllowed`, taking the
pack's contract from 17 offence sums + 2 defence sums to **17 + 3**. The pack is not built yet (its
deriver, `summariseTeamSeasons` and `validateTeamSeasonSummary` are all named-but-unbuilt), so
nothing drifts today, but CR-23's `Invariant` text is stale the moment this lands and the pack would
ship a column of zeros for `pointsAllowed` the day it is built.

**Do NOT edit `docs/cross-repo-registry.md` in this change.** That text sits inside the
CR-24-enforced byte-identical span; a one-sided edit from this repo-scoped session reds the data
repo's daily `registry-mirror.yml` (already red pending backlog D-19), and the sanctioned route for
a registry correction is the two-session one — data repo emits, app applies, data repo syncs with
the anchored diff — not an app-side rewrite.

### Registry corrections owed (backlog, not edits)

Plan review surfaced five drifted or incomplete registry facts. **None is fixed in this change**,
for the CR-24 reason above. Session 2 appends all of them to `.claude/tasks/data-repo-backlog.md`
with this commit's SHA, marked **non-blocking**:

1. **CR-23 `Invariant`** reads "17 offence sums + 2 defence sums"; after §1.1 it is 17 + 3.
2. **CR-08 `Triggers`** (app side) name only `src/api/nflSchedule.js` and
   `isValidSchedule`/`MIN_SCHEDULE_GAMES`, but `src/utils/gameLog.js:87,98,102,145` is already a
   live reader of `homeTeam`/`awayTeam`/`gameType` — and Slice D adds
   `src/utils/strengthOfSchedule.js` as a second.
3. **CR-20 `Triggers`** name only `opponentStrength.js`'s three symbols; the live rendering consumer
   `teams/Teams.jsx:151,157,297` is in the entry's prose but absent from `Triggers` — and Slice D
   adds `portfolio/Portfolio.jsx`'s `buildSosTable` call.
4. **CR-10 `Triggers`** anchors are stale: `loadTeamContext` call site says `App.jsx:1002` (live
   `:1009`), provider key says `App.jsx:631` (live `:637`).
5. **CR-08 / CR-09 app-side anchors** are stale: CR-08 says `App.jsx:930` (live `:1047`); CR-09 says
   `App.jsx:915` (live `:1032`) and `App.jsx:583` (live `:638`).

## Review record — plan-reviewer, 2026-09-20

22 flags. Each was checked against live source before a decision; the ones declined are declined on
product grounds, not because the reviewer was wrong about the code.

**Applied (17).**
- `rankFpaTable` is team-keyed and iterates `FPA_POSITIONS` — reusable verbatim. `rankSosTable` is
  **deleted** from the plan (§2.2). The reviewer was right and the original reuse note was wrong.
- `seasonEfficiency.js` already owns `Σ passingEpa / Σ attempts` behind `MIN_PASS_ATTEMPTS = 100`.
  `qbSeason.js` is cut down to **passer selection only** (§2.3, D1). This was the biggest catch: the
  fork would have shown a confident EPA here for a QB Market renders `—`.
- Two `ScriptCell` call sites (`:725`, `:838`), not one (§2.6).
- `teamCount` collides with `Portfolio.jsx:268`'s fantasy-league size; the prop is
  `rankedTeamCount` (§2.5). Would have compiled and coloured rank ≥ 5 amber.
- `TH_CLASS`/`DIVIDER` move to `tableClasses.js` — a back-import from `Portfolio.jsx` is a cycle
  (§2.5).
- `def.pointsAllowed ?? 0` masks an absent field; presence counting added, with tests (§1.1, §4.1).
- SOS filters to **unplayed** games — `sosSeason` is the live season, and the served 2026 file
  already carries scores (§2.2).
- §3.1's comment justified an impossible state; `careerStats` is built `s < currentSeason`, so
  `dataSeason + 1` is always the live season (§3.1).
- Two `computeTeamSeasonMetrics` passes collapsed into one via a new `rankMetricsTable` export, with
  `buildLeagueRankTable` refactored onto it behaviour-preservingly (§1.4).
- `compareNullsLast`'s third argument, and the two wrong internal cross-refs (D5→§2.2, D8→§2.4).
- Cross-repo section rewritten: all six entries now quote real `Mirror` text; **CR-09 and CR-21
  added** (both were genuinely touched and missing).
- The five registry-staleness findings recorded as backlog items rather than edits.

**Declined (2), with reasons.**
- *"PROE should be inverted for RB rows."* Declined. PROE describes the offence, not my player; the
  position-dependent verdict is the `GAME SCRIPT` column, which this slice exists to build.
  Inverting PROE would colour the same offence differently on two rows depending on who I roster —
  a team statistic rendering as a personal one.
- *"`rankSosTable` forks a helper and the file forbids reconciling it later."* Moot: the fork is
  gone, so there is nothing to reconcile.

**Resolved differently (1).**
- *"MARGIN's colour contradicts the caption."* The reviewer is right that the design contradicts
  itself. Rather than pick one of two defensible colourings, **MARGIN ships uncoloured** (§2.5):
  the number is the data, and the one well-defined verdict about it is per-position and now lives in
  `GAME SCRIPT`. Departure from the design, recorded here and asserted by a test.

**Note for Anton.** The task file is ~55KB, well above CLAUDE.md's 40KB "the slice is too large" signal.
I did not split it: the `gameScript.js` export and the table that feeds it are the same piece of
work, and separating them would ship a util with no consumer and a table with no reason to exist.
Most of the growth is the verbatim registry text and this record, not new scope.

---

## Fix pass 1

implementation-reviewer on `8afa23e..ef3d975`, 2026-09-20. Six flags; four are fixed here, one is
declined, one is spun out as separate work. The slice was already pushed (`ef3d975`), so this lands
on top — the same shape as Slice C's fix pass.

**Do only what this section names.** Do not touch the containment classes, the commit messages, or
any file not listed below.

### 1.1 `src/utils/strengthOfSchedule.js` — a team whose games are all played keeps its row

`opponentsByTeam` is populated only from unplayed games, so a team with a schedule but nothing left
to play vanishes from the table entirely. §2.2 gave `opponents` the job of separating "no schedule"
from "a real average", and an absent row collapses exactly that distinction — at the end of a
season, every team disappears rather than reporting zero games remaining. The rendered output is
`—` either way today; this is about the shape being what the spec says and the count staying
meaningful.

Seed the map from **every** team appearing in a REG game, then push opponents only for unplayed
games:

```js
  for (const g of schedule?.games ?? []) {
    if (g.gameType !== 'REG') continue
    const home = normalizeTeamForSchedule(g.homeTeam)
    const away = normalizeTeamForSchedule(g.awayTeam)
    if (!home || !away) continue
    // Every team in the REG schedule gets a row, even with nothing left to play — `opponents: 0`
    // is "the season is over", an absent row is "there is no schedule". Collapsing the two loses
    // the distinction `opponents` exists for (§2.2).
    opponentsByTeam[home] ??= []
    opponentsByTeam[away] ??= []
    // Unplayed only. `homeScore != null`, never truthiness and never `result`: a 0-0 score and a
    // tie (`result === 0`) are both PLAYED games.
    if (g.homeScore != null) continue
    add(home, away)
    add(away, home)
  }
```

`add` and the averaging loop below are unchanged — a team with an empty `opps` array already yields
`opponents: 0` and `null` for every position, because `vals.length > 0` is false. An absent or
non-REG-only schedule still yields `{}`.

### 1.2 `src/utils/strengthOfSchedule.test.js` — assert the spec, not the old output

The existing case (`"all games played → no team has an unplayed opponent, so no crash and no stale
average"`) asserts `toEqual({})`. That was written to the implementation rather than to §4.3, which
specifies "every position `null` and `opponents: 0`". **Rewrite that assertion** to the spec: each
team in the schedule is present, `opponents === 0`, and all four positions are `null`.

Add one case beside it: a schedule with **no REG games at all** still yields `{}` — this is the
assertion that keeps the two states distinguishable, and it is the one the old test was standing in
for.

### 1.3 `src/components/portfolio/TeamOffences.test.jsx` — cover the CR-21 gloss branches

`fpaCurrentSeason` was added specifically because CR-21 says the app must not present an in-progress
season as a completed one, and neither branch of `sosGloss` is asserted anywhere. That makes the
justification for the prop untestable and lets a future edit reinstate the completed-season wording
silently.

Two cases, opening the SOS header's `DefinitionPopover` the way the existing popover tests do:

- `fpaCurrentSeason` **null** → the gloss names the prior season alone and does **not** claim a
  blend.
- `fpaCurrentSeason` **set** → the gloss names both seasons and the shrinkage.

Assert on the distinguishing substrings, not the whole paragraph, so ordinary copy edits do not
break the test — but the substrings must be the ones that carry the CR-21 claim.

### 1.4 `src/components/portfolio/TeamOffences.test.jsx` — cover `NAME_SUFFIX`

Both existing chip fixtures are plain two-token names, so the Jr./Sr./II–V stripping is unexecuted.
Add one row whose players include a suffixed name (e.g. `Marvin Harrison Jr.`) and one Roman-numeral
name (e.g. `Michael Pittman II`), and assert the chips read `Harrison` and `Pittman`. Add a
single-token name (e.g. a mononym) and assert it renders unchanged rather than empty.

### Declined — not a defect

**"Neither commit message emits any `Mirror` text."** CLAUDE.md's rule is that a change touching a
listed contract must emit the `Mirror` text **"as Session 1 output, in a `## Cross-repo impact`
section of the task file"**. That section exists, quotes all seven entries verbatim, and is
committed in `d9db09f` as part of the task file. Nothing in the convention asks for it in a commit
message, and duplicating it there would create a second copy that drifts. No change.

### Spun out — real, but not this slice

**`[contain:inline-size]` is on the new scroller only.** The reviewer is right that this is
inconsistent: `Portfolio.jsx:786`, `Portfolio.jsx:912` and `Teams.jsx:252` are bare `overflow-x-auto`
under the same `<main>`, and Session 2's own diagnosis — `AppShell.jsx:34`'s `<main>` is `flex-1`
with no `min-w-0` — applies to all of them. They do not overflow today only because they are
narrower. The right fix is the one class on `<main>`, not four `contain` classes, and that is shared
chrome outside this slice's touch list. Leave the new scroller exactly as it is; the AppShell fix is
tracked separately.
