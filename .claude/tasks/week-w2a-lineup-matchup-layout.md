# Brief W2a — This week layout: matchup columns, frozen player column, season order, copy/mobile fixes

**Status:** planning artifact (Session 1, opus). This session edited no source or doc files.
**Review depth: full — multi-surface layout change (This week, My Team, a shared dp primitive), new pure module and hook wiring, new rendered data reads on /week.**
**Session 2:** sonnet, effort medium. Runs the app from `.claude/launch.json` (`sleeper-dashboard`) for the visual check (screenshots at 1440×900 and 375×812), stops it when done.
Planned against live source at app HEAD `736f3ba`. Every anchor below was read at `736f3ba`.
Supersedes the W2 outline in `week-w-matchup-flags-visuals.md` for W2a. W2b is outlined at the end.

---

## Decisions recorded

**D1 — Matchup column set (planner proposal, ≤ 6, all from data /week already loads).** No new
fetch, loader or state (sources: §1). Only the implied total has backtest support
(weeklyOwnProjection.js lines 16–20: Vegas ×0.5 improved RMSE; scaling by points allowed made it worse).

| # | Header | What | Why it bears on this week | Evidence |
|---|---|---|---|---|
| 1 | IMPLIED | His team's Vegas implied points this week; grey line `±x.x vs avg` (vs his team's own earlier implied totals, ≥ 2 weeks) | Expected team scoring is the one input shown to move weekly accuracy | backtest: yes |
| 2 | SPREAD | His team's point spread (betting convention: −3.0 = favoured by 3; `PK` = even) | Expected game script — leading teams run, trailing teams pass | untested — context |
| 3 | ALLOWED / G | Opponent's blended points per game allowed to **all** players at his position; rank line `n of 32 · all WRs` + blend bar (existing ALLOWS cell, relabelled) | How generous this defence is to the position group | backtest: scaling by it hurt — context only |
| 4 | YDS ALLOWED | Opponent's pass yd/G (QB/WR/TE) or rush yd/G (RB), live season so far; grey line = last season | Play-type view of the defence that points (TD-driven) blur | untested — context |
| 5 | PACE | His team's neutral-situation seconds per play, live season; grey `n of N` (1 = fastest) | More plays → more chances for every skill player | untested — context |
| 6 | PROE | His team's pass rate over expected, live season; grey `n of N` (1 = most pass-leaning) | Pass-leaning offences lift QB/WR/TE volume, lower RB | untested — context |

Not added: his share of team opportunities at the position — Usage already shows it; multiplying it
by ALLOWS would be an untested projection-like signal.

**D2 — Fixed columns and column views.** Fixed: **SLOT · PLAYER** (frozen) **· PROJ · OURS · VS**.
OURS becomes fixed beside PROJ (display rule: visible beside the fact it predicts); VS moves after OURS
so PROJ sits next to the frozen block (mobile) and VS heads the matchup group. `LINEUP_LENSES` becomes
`Matchup` (default; columns 1–6 above) · `Usage & form` (RUSH, TARGET, TOUCH, RZ RUSH, RZ TGT, SNAP,
LAST 3) · `All` (every column). Scoring is dropped. **Wide screens:** no viewport auto-switch — `All` is a
choice at every width; default `Matchup` fits 1440 wide (≈ 1,030 px of table).

**D3 — OURS's `imp` sub-line moves to IMPLIED.** OwnCell drops its `own-implied` sub-line
(LineupTable.jsx lines 199–211); the same numbers render in the IMPLIED column for every row with a
line, whatever OURS's reason. OwnCell's `title` (ownTitle) still states the factor.

**D4 — Frozen columns via one shared primitive.** `dp/FrozenScroll.jsx` (scroll container that marks
itself scrolled) + `dp/frozen.js` (literal class constants). Opaque, edge shade once scrolled, every width (no
`md:static` escape). Lineup, Starting ten, Bench. **Market deferred to W2b** together with its
season-order fix (D6), which touches `factViews.js` and its tests.

**D5 — Season-order convention (Anton, 2026-11-19, app-wide).** Side by side: time runs left → right
(oldest, then current, then projection). Stacked in one cell: the current season is the main value,
the prior season the grey sub-line, and that sub-line names its season (`2025 · 240`). Inline text
pairs run left → right, oldest first. Recorded in `docs/ui.md` (Docs 1).

**D6 — Convention audit (surfaces this slice touches).**
- Conform: lineup rank line `2025 QB34 · 2026 QB20` (no code change; pinned by T9), SNAP grey
  `2025 · 61%`, My Team `2025 | 2026 so far | ROS` / `2025 → 2026 PPG`; new YDS ALLOWED built to rule.
- **Violate:** DefencesFaced `TwoLineTh` sub-label `{current} · {prior}` (line 43) and unnamed grey
  lines — fixed in §5; Market `Prev rk` right of FP/G (factViews.js lines 61, 92) — W2b (D4).

**D7 — Points-allowed definition (confirmed 2026-11-19).** `buildDefenceSeasonAllowed` credits every
QB/RB/WR/TE line to the defence faced and divides by that defence's games
(opponentStrength.js lines 84–104): a position-group total per game, split backfields in full. Every
label says "all {POS}s"; the legend says it is not comparable to one player's PROJ.

**D8 — OURS loading state.** `scoredSeasonProjections` is `null` until App.jsx's projection inputs
resolve (App.jsx lines 702–703, 757–759; `applyInSeasonProjection` returns its input when there are no
posteriors). WeekView derives `oursPending = seasonProjections == null` and passes it down; OURS cells
and the header's OURS total read "not available yet" instead of `—` / `0 of 10 valued` — neutral
wording, still true if projections never arrive (App.jsx line 703 returns null on missing inputs).

**D9 — Mobile.** Header card before the lineup already holds at `736f3ba` (WeekView.jsx DOM order,
lines 134–172); pinned by T15b. PROJ at 375 px: §4c.

**D10 — No scoring or snapshot impact.** Nothing reaches `projectedPPG`, the dynasty score,
`factors` or snapshots; no TTL change; view-only. One index site: **CR-18** (`docs/signal-registry.md`
consumer cells, Docs 5) — data side `data-catalog.md` needs no change, no backlog line.

**Revision 1 (plan review round 1; Anton 2026-11-19):** 12 of 13 flags applied (the `signedPct` copy
kept — OffencesOwned leaves /week in Brief M); headshot hidden below md (Anton). Changed: §3b, §4a–d,
§6, §7, D8, D10, tests T5, T8–T16, T18, T20, H1, migration list, Docs 5. Light re-review: no blocking issues. **Plan approved by Anton 2026-11-19.**

---

## Touch list

| File | Change |
|---|---|
| `src/utils/weeklyMatchupColumns.js` | **new**, pure — per-row matchup column values (§1) |
| `src/hooks/useWeeklyDecision.js` | `teamMetrics` + `matchupCols` memos; `matchupCols` returned (§2) |
| `src/components/dp/FrozenScroll.jsx` | **new** — scroll container with `data-scrolled` (§3a) |
| `src/components/dp/frozen.js` | **new** — frozen-column class constants (§3b) |
| `src/components/dp/lens.js` | lens `'all'` shows every group (§3c) |
| `src/components/dp/cells.jsx` | `ClickableRow` `<tr>` gains `group/row` (§3d) |
| `src/components/week/LineupTable.jsx` | column order, matchup cells, lenses, frozen, OURS pending, copy (§4) |
| `src/components/week/MatchupHeader.jsx` | `oursPending` prop (§6) |
| `src/components/week/DefencesFaced.jsx` | season order in header and grey lines (§5) |
| `src/components/week/WeekView.jsx` | pass `matchupCols`, `oursPending` (§6) |
| `src/components/portfolio/Portfolio.jsx` | frozen slot/player on Starting ten and Bench (§7) |
| `src/__tests__/weeklyDecisionViewOnly.test.js` | pipeline-import guard (T18) |
| tests, docs | §Tests, §Docs |

Out of scope: W2b items; DefencesFaced/OffencesOwned beyond §5 (stay until Brief M §6); OURS math;
App.jsx; start/sit logic.

### Copied definitions

One: LineupTable's PROE format `signedPct(v)` = `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`
copies `OffencesOwned.jsx` `fmtPct` (line 15, not exported). Pinned by T19 (both rendered on the same
fixture values). No other copy: yards from `computeYardsPerGame`, team metrics/ranks from
`buildTeamMetricsTable`/`rankMetricsTable`, implied/baseline from `vegasFactor` (passed in by the hook),
`normalizeTeamForSchedule` imported.

---

## §1 `src/utils/weeklyMatchupColumns.js` (new, pure, view-only)

Header comment: Matchup columns; facts or one-step differences; D1's evidence line; never imports
`weeklyOwnProjection.js` (hook passes `vegasFor` — single-importer rule, view-only test lines 125–130).
Imports exactly: `normalizeTeamForSchedule` from `./nflStats`, `computeYardsPerGame` from
`./opponentStrength`, `rankMetricsTable` from `./environment`.

```js
export const YARDS_KIND = { QB: 'pass', WR: 'pass', TE: 'pass', RB: 'rush' }

// rows: lineup rows (filled starters + bench). vegasFor(sleeperTeam) -> vegasFactor result | null.
// currentAllowed / priorAllowed: the hook's defence `teams` maps (era-keyed) or null.
// priorSeason: the season priorAllowed describes (hook line 268).
// teamMetrics: buildTeamMetricsTable(liveTeamContext) when complete, else null (era-keyed).
// -> { [player_id]: MatchupCols }
export function buildMatchupColumns({ rows, vegasFor, currentAllowed, priorAllowed, priorSeason, teamMetrics })
```

`MatchupCols`:
```js
{
  implied: number|null, impliedBaseline: number|null, impliedBaselineWeeks: number,   // 0 when no line
  spread: number|null,                 // betting convention: opponent implied − own implied
  yards: { kind: 'pass'|'rush', current: number|null, prior: number|null, priorSeason } | null,
  pace:  { value: number, rank: number|null, of: number } | null,
  proe:  { value: number, rank: number|null, of: number } | null,
}
```

Rules, in order, per row (`player_id == null` → no entry):
1. `team = row.team`; `hasTeam = typeof team === 'string' && team !== '' && team !== 'FA'`. No team →
   every field null (`impliedBaselineWeeks: 0`).
2. Game fields (implied, spread, yards) are null when `row.bye` or `row.opponent == null`.
   Otherwise: `own = vegasFor(team)`, `opp = vegasFor(row.opponent)` (both Sleeper domain —
   `vegasFactor` normalises, weeklyOwnProjection.js lines 59–62). `implied = own?.implied ?? null`,
   `impliedBaseline = own?.baseline ?? null`, `impliedBaselineWeeks = own?.baselineWeeks ?? 0`.
   `spread = (implied != null && opp?.implied != null) ? opp.implied - implied : null`.
   Sign: `buildImpliedTotals` lines 51–52 give away − home = −spreadLine = home's betting spread.
3. `kind = YARDS_KIND[row.position]`; when `kind` and `row.opponentEra != null` (and rule 2's game
   guard passes): `yards = { kind, current: computeYardsPerGame(currentAllowed, row.opponentEra)?.[kind] ?? null,
   prior: computeYardsPerGame(priorAllowed, row.opponentEra)?.[kind] ?? null, priorSeason }`. Keyed on
   `opponentEra`, never `opponent` (CR-16: `LA` not `LAR`). Both null → `yards: null`.
4. Team fields (pace, proe) do **not** depend on the bye/opponent guard — they describe his team's
   season. `era = normalizeTeamForSchedule(team)`; `m = teamMetrics?.[era]`. Ranks computed **once per
   call** (not per row): `ranks = rankMetricsTable(teamMetrics, ['pace', 'proe'])` when `teamMetrics`,
   and `of[metric]` = number of teams with a non-null value for that metric. `pace = m?.pace != null ?
   { value: m.pace, rank: ranks.pace[era] ?? null, of: of.pace } : null`; same for `proe`. (`pace` rank 1
   = fewest seconds per play — `LOWER_IS_BETTER`, environment.js line 106.)
5. Never mutates inputs.

---

## §2 `src/hooks/useWeeklyDecision.js`

- Imports: add `vegasFactor` to the existing `weeklyOwnProjection` import (line 16);
  `buildTeamMetricsTable` to the existing `environment` import (line 6); `buildMatchupColumns` from
  `../utils/weeklyMatchupColumns`.
- After `ownByPlayer` (line 366):
```js
const teamMetrics = useMemo(
  () => (liveTeamContext?.complete ? buildTeamMetricsTable(liveTeamContext) : null),
  [liveTeamContext]
)
const matchupCols = useMemo(
  () => buildMatchupColumns({
    rows: [...lineup.starters.filter(r => r.player_id != null), ...lineup.bench],
    vegasFor: team => vegasFactor(impliedIndex, team, currentWeek),
    currentAllowed, priorAllowed, priorSeason, teamMetrics,
  }),
  [lineup, impliedIndex, currentWeek, currentAllowed, priorAllowed, priorSeason, teamMetrics]
)
```
- Return: add `matchupCols`.
- "Degraded paths" header paragraph: + one sentence — no line, no completed defence weeks or an
  incomplete team context → those matchup cells render `—`.

---

## §3 Shared primitives

### 3a. `src/components/dp/FrozenScroll.jsx` (new)

```jsx
// The horizontal scroll container for a table with frozen leading columns (dp/frozen.js). Marks
// itself `data-scrolled="true"` once scrolled right so the frozen edge shade shows only then.
export function FrozenScroll({ children }) {
  const [scrolled, setScrolled] = useState(false)
  return (
    <div
      data-testid="frozen-scroll"
      data-scrolled={scrolled ? 'true' : 'false'}
      onScroll={e => setScrolled(e.currentTarget.scrollLeft > 0)}
      className="overflow-x-auto group/scroll"
    >
      {children}
    </div>
  )
}
```

### 3b. `src/components/dp/frozen.js` (new — literal strings; Tailwind must see whole class names)

```js
export const FROZEN_SLOT_W = 'w-[56px] min-w-[56px]'
// A td width is only a minimum in auto table layout; the label's own block caps it (56 − 18 − 4 padding).
export const FROZEN_SLOT_INNER = 'block w-[34px] truncate'
export const FROZEN_FIRST = 'sticky left-0 z-[2]'
export const FROZEN_SECOND = 'sticky left-[56px] z-[2]'
export const FROZEN_ROW_HOVER = 'group-hover/row:bg-dp-row-self group-focus/row:bg-dp-row-self'
export const FROZEN_EDGE = "after:content-[''] after:absolute after:inset-y-0 after:-right-3 after:w-3 after:pointer-events-none after:opacity-0 after:bg-linear-to-r after:from-dp-canvas after:to-transparent group-data-[scrolled=true]/scroll:after:opacity-100"
```
Header comment: callers add the opaque background (tables differ); `FROZEN_EDGE` goes on the last
frozen cell of each row and header; existing tokens only. Session 2 checks in the browser that the
frozen header cell's `::after` opacity is `1` when `scrollLeft > 0` and `0` at `0`; if the Tailwind v4
variant order doesn't compile as written, an equivalent order is fine — report it as a deviation.

### 3c. `src/components/dp/lens.js`

`return group == null || group === lens || lens === 'all' ? '' : 'hidden'` and one comment line:
lens `'all'` shows every group. Portfolio has no `all` lens — no behaviour change there.

### 3d. `src/components/dp/cells.jsx` `ClickableRow` (line 118)

Prepend `group/row ` to the `<tr>` className. Inert for every other consumer (no `group-*/row`
classes exist elsewhere).

---

## §4 `src/components/week/LineupTable.jsx`

### 4a. Columns (18), order, groups, test ids

Every `<td>` and `<th>` carries a `data-testid` (`col-…` on td; th not required) so tests stop
indexing by position:

| # | Header | td test id | Group | Notes |
|---|---|---|---|---|
| 1 | (blank) | `col-slot` | fixed, frozen first | `pl-[18px] pr-1 py-2.5 ${FROZEN_SLOT_W} ${FROZEN_FIRST} bg-dp-card ${FROZEN_ROW_HOVER}`; label in `<span className={FROZEN_SLOT_INNER} title={r.slot}>` |
| 2 | PLAYER | `col-player` | fixed, frozen second | `${FROZEN_SECOND} bg-dp-card ${FROZEN_ROW_HOVER} ${FROZEN_EDGE}` (drop `md:static md:bg-transparent`, line 223) |
| 3 | PROJ | `col-proj` | fixed | unchanged cell (line 284) |
| 4 | OURS | `col-ours` | fixed | `OwnCell` with `lens` removed (fixed); see 4d |
| 5 | VS | `col-vs` | fixed | unchanged cell, keeps `border-l` |
| 6 | IMPLIED | `col-implied` | matchup |
| 7 | SPREAD | `col-spread` | matchup | 4b |
| 8 | ALLOWED / G | `col-allows` | matchup | `AllowsCell`, 4b |
| 9 | YDS ALLOWED | `col-yds` | matchup | 4b |
| 10 | PACE | `col-pace` | matchup | 4b |
| 11 | PROE | `col-proe` | matchup | 4b |
| 12–17 | RUSH · TARGET · TOUCH · RZ RUSH · RZ TGT · SNAP | `col-rush` `col-target` `col-touch` `col-rzrush` `col-rztgt` `col-snap` | usage | `UsageCell` unchanged |
| 18 | LAST 3 | `col-last3` | usage | moved from `scoring` to `usage`; add `pr-[18px]` (now last) |

Header: slot th `${FROZEN_SLOT_W} ${FROZEN_FIRST} bg-dp-card-quiet`; PLAYER th `${FROZEN_SECOND}
bg-dp-card-quiet ${FROZEN_EDGE}` (drop `md:static`, line 353); OURS th loses `pr-[18px]` and
`lensHidden`. BENCH `colSpan` 13 → `COLUMN_COUNT = 18` (line 383). Line 348's scroll div →
`<FrozenScroll>`. Empty-slot rows (line 312) keep the frozen classes (hover inert there).

`LINEUP_LENSES` (line 22) → `[{ key: 'matchup', label: 'Matchup' }, { key: 'usage', label: 'Usage & form' }, { key: 'all', label: 'All' }]`;
`useState('matchup')` (line 333). Update the column-views comment (lines 20–21) and the file header
(lines 6–18) to the new fixed set and groups.

### 4b. Matchup cells (props: `matchupCols = {}`; row's entry `c = matchupCols[r.player_id] ?? null`)

`—` (muted, `text-[12px]`) whenever the value is null. All numbers `font-dp-mono`, right-aligned.
- **IMPLIED**: main `c.implied.toFixed(1)`; when `impliedBaseline != null`, grey sub-line
  (`text-[10px] text-dp-muted-2`) `${sign}${Math.abs(implied − baseline).toFixed(1)} vs avg`, sign
  `+` when `implied >= baseline`, else U+2212. `title`: "Vegas implied points for {team} this week
  (nflverse schedule: total ÷ 2 ± spread ÷ 2). Grey: difference from his team's average implied
  total over {impliedBaselineWeeks} earlier games with a line." Header `title`: "His team's Vegas
  implied points this week. The one matchup input our backtest found useful (OURS uses it)."
- **SPREAD**: `Math.abs(spread) < 0.05` → `PK`; else `${spread > 0 ? '+' : '−'}${Math.abs(spread).toFixed(1)}`.
  Header `title`: "His team's point spread this week: negative means favoured (−3.0 = expected to win
  by 3). Opponent's implied total minus his team's."
- **ALLOWED / G** (`AllowsCell`, lines 101–131): header text `ALLOWED / G` (was `ALLOWS TO POS ·
  PTS/G`); rank line `${allowsRank} of 32 · all ${r.position}s` (was `${allowsRank} of 32`); colour
  bands and bar unchanged. Header `title`: "Opponent defence: fantasy points per game it allows to all
  players at his position combined (every WR, split backfields in full), blended with last season,
  in this league's scoring. A group total — not comparable to one player's PROJ. Rank 1 is the toughest of 32."
- **YDS ALLOWED**: main `Math.round(current)` then muted ` ${kind}` (`pass`/`rush`); grey sub-line
  `${priorSeason} · ${Math.round(prior)}` when `prior != null`. `current == null` with `prior != null`
  → main `—`, sub-line still shown. Header `title`: "Opponent's yards allowed per game for his play
  type — passing (net of sacks) for QB, WR and TE, rushing for RB — {thisSeason} so far; grey is
  {defenceSeason}." New prop `defenceSeason` (fallback `last season`): the hook's `priorSeason`, the
  same value the cell's `yards.priorSeason` carries, so header and cell name one season.
- **PACE**: main `${value.toFixed(1)}s`; grey `${rank} of ${of}` when `rank != null`. Header `title`:
  "His team's seconds per play in neutral situations, {thisSeason} so far (nflverse team context).
  Rank 1 is the fastest."
- **PROE**: main `signedPct(value)` (the declared copy, §Copied definitions); grey `${rank} of ${of}`.
  Header `title`: "His team's pass rate over expected, {thisSeason} so far. Rank 1 is the most
  pass-leaning."

### 4c. Mobile (< 768 px): PROJ visible without horizontal scroll

- Headshot (line 228): wrap in `<span className="hidden md:block shrink-0">` — no photo below md (Anton, revision 1).
- Team chip (lines 229–234): the abbreviation text becomes `<span className="hidden md:inline">{r.team}</span>`; the logo stays.
- The name column wrapper (`<div className="min-w-0">`, line 235) gets `max-w-[136px] md:max-w-none`;
  the name text span gets `truncate` (wrap the name in its own `<span className="truncate">`, the
  `StatusChip` stays outside it with `shrink-0`). Rank line and flag sub-line wrap.
- Acceptance (Session 2, in the running app at 375×812, `scrollLeft` 0): for the PROJ header cell and
  the first starter's `col-proj`, `getBoundingClientRect().right <= window.innerWidth`. If it fails,
  tighten only `max-w-[136px]` and report the value used. Also report `col-player`'s right edge
  (≈ 245 px expected, leaving ≈ 95 px of scroll window) and a screenshot scrolled right — Anton judges it.

### 4d. OURS cell (`OwnCell`, lines 188–214) and loading

- Remove the `own-implied` sub-line block and the `implied`/`baseline`/`delta` locals (D3).
- New prop `oursPending` (LineupTable → LineupTableBody → `rowProps` → `LineupRow` → `OwnCell`). When
  true: top renders `<span data-testid="ours-pending" className="text-dp-muted">…</span>` with cell
  `title` "Season projections not available yet — OURS fills in when they arrive." (instead of
  `ownTitle`). Keep the existing PROVISIONAL tag (line 187); no new tag.

### 4e. Copy

- Subtitle (line 342): `opponent, usage and form beside each` → `matchup, usage and form beside each`.
- Legend ALLOWS paragraph (lines 396–400) → "ALLOWED / G is the opponent defence's fantasy points per
  game allowed to all players at that position combined — every WR's points against it that season,
  divided by its games, with split backfields counted in full — blended with last season, in this
  league's scoring (Sleeper weekly stat lines, scored with your settings). It is a group total, not
  comparable to one player's PROJ. Rank 1 is the toughest of 32; the bar beneath is how much of the
  blend is the current season."
- New legend paragraph after it: "IMPLIED is his team's Vegas implied points this week, with the
  difference from his team's average implied total in earlier weeks. SPREAD is his team's point
  spread (negative = favoured). YDS ALLOWED is the opponent's passing yards (net of sacks) per game
  for a QB, WR or TE and rushing yards per game for an RB, this season so far, with last season in
  grey. PACE is his team's seconds per play in neutral situations and PROE its pass rate over
  expected, this season, ranked across the league. Only the implied total has backtest support here
  (OURS uses it); scaling by ALLOWED made projections worse. The rest are context, untested."
- Rank sentence (lines 412–414): replace `(My Team&rsquo;s RANK uses points per game)` with
  `(the same basis as My Team&rsquo;s position ranks)`.
- OURS paragraph (lines 419–429): "scaling fully by ALLOWS" → "scaling fully by ALLOWED / G"; append
  "The implied total it uses is in the IMPLIED column."

---

## §5 `src/components/week/DefencesFaced.jsx` — season order (D5/D6)

- `TwoLineTh` (lines 39–46): second line renders `{currentSeason ?? '—'}` only; add `title`
  `"Main value: ${currentSeason}; grey line beneath: ${priorSeason}"` (with `—` fallbacks).
- `TwoLineCell` (lines 48–58): new prop `priorSeason`; the grey line renders
  `priorSeason != null && prior !== '—' ? `${priorSeason} · ${prior}` : prior`. Pass
  `priorSeason={priorSeason}` at the three call sites (lines 151–163).
- Footer copy and every other column unchanged. Update the file header with one line: season order
  per docs/ui.md (current main, prior grey and named).

---

## §6 `WeekView.jsx` and `MatchupHeader.jsx`

- WeekView: destructure `matchupCols` from the hook (line 78); `const oursPending = seasonProjections == null`;
  pass `matchupCols={matchupCols}`, `oursPending={oursPending}` and `defenceSeason={priorSeason}`
  (already destructured, line 76) to `<LineupTable>` (lines 161–172)
  and `oursPending={oursPending}` to `<MatchupHeader>` (line 156). Header comment: one sentence on both.
- MatchupHeader: new prop `oursPending = false` → `Side` (my side only). When true, my OURS block
  renders label `OURS · ours`, value `…` (muted), sub-line `season projections not available yet`, wrapper
  `data-testid="matchup-ours-pending"`, instead of the `TotalRow` (no `n of N valued`). Keep the
  existing PROVISIONAL tag (line 42) on the TotalRow branch; no new tag.

---

## §7 `src/components/portfolio/Portfolio.jsx` — frozen columns

Starting ten (table at lines ~985–1100):
- Replace its `<div className="overflow-x-auto">` with `<FrozenScroll>`.
- Slot `<th>` (line 990) and both slot `<td>`s (lines 1035, 1069): `px-[10px] first:pl-[18px]` →
  `pl-[18px] pr-1` plus `${FROZEN_SLOT_W} ${FROZEN_FIRST}` and an opaque background (`bg-dp-row-head`
  on th, `bg-dp-card ${FROZEN_ROW_HOVER}` on td); the label in `<span className={FROZEN_SLOT_INNER} title={slot.slot}>`.
- PLAYER `<th>` (line 991) and both player `<td>`s (lines 1036, 1070): `sticky left-0 z-[1] … md:static
  md:bg-transparent` → `${FROZEN_SECOND} ${FROZEN_EDGE}` plus `bg-dp-row-head` (th) /
  `bg-dp-card ${FROZEN_ROW_HOVER}` (td).

Bench (table at lines ~1180–1270):
- Its `<div className="overflow-x-auto">` → `<FrozenScroll>`.
- PLAYER `<th>` (line 1184) and both player `<td>`s (pick row line 1231, player row line 1263):
  `sticky left-0 z-[1] … md:static md:bg-transparent` → `${FROZEN_FIRST} ${FROZEN_EDGE}` plus the same
  backgrounds; keep `first:pl-[18px]`.

Nothing else in Portfolio changes; re-read anchors before editing.

---

## Tests

Each: what it asserts, the defect it catches, the red step, and the fixture fact asserted in setup.
Migrated in `LineupTable.test.jsx` (behaviour change — updated to the new outcome, not bent green):
index lookups (lines 142–179, 308–311, 343–364) → `col-*` ids; `cellFor` returns `col-ours`/`col-proj`;
line 189 → `col-ours` is the 4th cell, right after `col-proj`; the OURS-cell describe (lines 182–244):
`textContent` loses its `imp …` suffix (`'14.8imp 26.0 · +2.0'` → `'14.8'`, `'OUTimp…'` → `'OUT'`,
`'—imp…'` → `'—'`), `own-implied` lookups become absence checks, and the implied/U+2212 formatting
moves to T13's `col-implied` cases. Titles are unchanged.

**`src/utils/weeklyMatchupColumns.test.js` (new).** Fixtures build `impliedIndex` with the real
`buildImpliedTotals` and `vegasFor = t => vegasFactor(index, t, week)` (tests are exempt from the
single-importer rule).
- **T1 spread sign.** Week 5 game home `KC` / away `DEN`, `spreadLine: 3`, `totalLine: 45`; KC row
  (opponent `DEN`) → `spread === -3`, DEN row → `+3`. Setup asserts KC implied 24 > DEN implied 21.
  Fails if the difference is taken own − opponent. Red: swap the operands.
- **T2 implied without a baseline.** KC has one earlier week with a line (setup asserts
  `vegasFactor(...).baseline === null`) → `implied === 24`, `impliedBaseline === null`,
  `impliedBaselineWeeks === 1`; with two earlier weeks (20, 22) → `impliedBaseline === 21`. Fails if
  `implied` is dropped when there is no baseline. Red: return `implied: null` when `baseline == null`.
- **T3 yards kind and CR-16 key.** `currentAllowed = { LA: { gp: 2, passYd: 500, rushYd: 200, pts: {…} } }`,
  `priorAllowed` likewise (`passYd: 4080, gp: 17`); an RB row with `opponent: 'LAR', opponentEra: 'LA'`
  → `yards = { kind: 'rush', current: 100, prior: …, priorSeason: 2025 }`; a WR row → `kind 'pass'`,
  `current: 250`. Setup asserts `'LAR' in currentAllowed === false`. Fails if keyed on `opponent`. Red:
  use `row.opponent` → `yards` null.
- **T4 team ranks once, `of` counts ranked teams, CR-16.** `teamMetrics = { KC: { pace: 27, proe: 0.03 },
  LA: { pace: 29, proe: -0.01 }, LV: { pace: null, proe: 0.01 } }`; a `LAR` row → `pace { value: 29,
  rank: 2, of: 2 }`, `proe { rank: 3, of: 3 }`; KC row → `pace.rank 1`, `proe.rank 1`. Setup asserts
  `teamMetrics.LAR === undefined` and `LV.pace === null`. Fails if `of` counts every team (3 for pace)
  or the lookup uses the Sleeper code. Red: `of = Object.keys(teamMetrics).length`; separately, look
  up `teamMetrics[row.team]`.
- **T5 guards.** Bye row carrying `opponent: 'DEN', opponentEra: 'DEN'` (setup asserts both non-null
  and that the `vegasFor` stub returns an implied for its team — so only the bye guard can null it) → implied,
  spread, yards `null`, pace/proe present; `team: 'FA'` → all null; a row with `player_id: null` → no
  key; `teamMetrics: null` → pace/proe null. Fails if the bye guard is dropped. Red: remove the
  `row.bye` check → implied non-null.

**`src/components/dp/lens.test.js` (new).**
- **T6** `lensHidden('usage','all') === ''`, `('usage','matchup') === 'hidden'`, `(null,'x') === ''`.
  Fails if `all` hides groups. Red: drop the `'all'` branch.

**`src/components/dp/FrozenScroll.test.jsx` (new).**
- **T7** `data-scrolled` `"false"` → `scrollLeft = 40` + `scroll` → `"true"` → `0` → `"false"`. Setup:
  class `group/scroll` present. Fails if state never updates. Red: no-op `onScroll`.

**`src/components/dp/cells.test.jsx`.**
- **T8** `ClickableRow`'s `<tr>` class list contains `group/row`. Fails if the frozen cells' hover
  group is missing (they would stay dark on row hover). Setup asserts the rendered `tr` has
  `role="button"`. Red: remove it.

**`src/components/week/LineupTable.test.jsx`.**
- **T9 rank line season order.** Row with `ranks { lastPos: 34, thisPos: 20 }`, `lastSeason 2025`,
  `thisSeason 2026` → in the rank line text, `indexOf('2025 ') < indexOf('2026 ')`. Fails if the
  segments are reversed. Setup asserts both ranks non-null. Red: swap the two `segs.push` lines.
- **T10 column order.** Header text sequence equals `['', 'PLAYER', 'PROJ', 'OURS', 'VS', 'IMPLIED',
  'SPREAD', 'ALLOWED / G', 'YDS ALLOWED', 'PACE', 'PROE', 'RUSH', 'TARGET', 'TOUCH', 'RZ RUSH',
  'RZ TGT', 'SNAP', 'LAST 3']`; every body row (starter, empty slot, bench) has 18 tds; the BENCH
  divider `colSpan` is 18. Setup asserts one filled starter, one `player_id: null` slot, one bench row.
  Fails on the old order or a missing cell. Red: restore VS before PROJ.
- **T11 views.** Default: `aria-pressed` on Matchup; matchup cells visible; usage cells and `col-last3`
  hidden; `col-slot/player/proj/ours/vs` never hidden in any view. `Usage & form`: usage + `col-last3`
  visible, matchup hidden. `All`: no cell hidden. Fails if OURS is still lens-grouped or LAST 3 stays
  in a removed group. Setup asserts the row has usage counts and a `matchupCols` entry. Red: give OURS
  `lensHidden('usage', lens)` → default view hides it.
- **T12 frozen classes.** `col-slot` td and slot th contain `sticky` and `left-0`; `col-player` td and
  PLAYER th contain `left-[56px]` and the `FROZEN_EDGE` string's `after:opacity-0`; neither contains
  `md:static` or `md:bg-transparent`; both tds contain `bg-dp-card`; the table sits inside
  `[data-testid="frozen-scroll"]`; a `WRRB_FLEX` slot's label sits in a span with `w-[34px]`, `truncate`,
  `title="WRRB_FLEX"` (setup asserts `WRRB_FLEX` is not in `SLOT_LABEL`). Fails if the md escape hatch
  returns or a long label can widen the column. Red: re-add `md:static`; separately, drop the inner span.
- **T13 matchup cells.** One row per case, each scoped to its `col-*` cell: implied 24 / baseline 22
  → `24.0` and `+2.0 vs avg`; implied 21 / baseline 24 → `−3.0 vs avg` (U+2212, not `-`); baseline
  null → no `vs avg`; spread −3 → `−3.0`, +3.5 → `+3.5`, 0.02 → `PK`; allows rank 19 on a WR →
  `19 of 32 · all WRs`; yards `{ kind 'pass', current 231.4, prior 240, priorSeason 2025 }` →
  `231 pass` and `2025 · 240`; yards current null / prior 240 → main `—`, sub-line `2025 · 240`;
  pace `{ value 27.44, rank 3, of 32 }` → `27.4s`, `3 of 32`; proe `{ value 0.032, rank 1, of 32 }` →
  `+3.2%`, `1 of 32`; `matchupCols` missing the id → the five `matchupCols` cells read `—` (`col-allows`
  reads `row.allows`, not `matchupCols`). Setup asserts each fixture's
  source value (e.g. `implied - baseline === -3`). Red: format minus with `-`; drop `all {POS}s`;
  omit the prior season label — each named case fails.
- **T14 OURS: no implied sub-line; pending state.** With an `own` carrying `vegas.implied 26`,
  `col-ours` has no `[data-testid="own-implied"]` and `col-implied` shows `26.0` (from `matchupCols`).
  With `oursPending` true, `col-ours` contains `[data-testid="ours-pending"]` with `…` and no `—`;
  false → no pending marker. Setup asserts the own entry's `value` is null in the pending case
  (fails if pending reads as missing); title contains `not available yet`. Red: ignore `oursPending`.
- **T15 copy.** Legend text contains `same basis as My Team` and not `uses points per game`; contains
  `not comparable to one player` and `untested`. Setup asserts `lineup-legend` exists. Fails on the old
  sentence. Red: restore line 414.
- **T16 mobile chip.** The team abbreviation is inside a span with classes `hidden` and `md:inline`;
  the headshot sits in a span with `hidden` and `md:block`; the team logo is still rendered in
  `col-player`. Setup asserts the row's `team` is `KC`. Fails if the abbreviation or photo is dropped
  entirely or stays visible on mobile. Red: remove either wrapper span.

**`src/components/week/DefencesFaced.test.jsx`.**
- **T17 season order.** Seasons 2025/2026: PASS YD/G header line 2 is `2026` (not `2026 · 2025`);
  `defences-pass` grey line `2025 · 240`; a `—` prior stays `—`. Setup: prior pass yards round to 240.
  Red: restore line 43.

**`src/components/week/MatchupHeader.test.jsx`.**
- **T17b** `oursPending` true with `mine.ours { total: null, valued: 0, slots: 10 }` →
  `matchup-ours-pending` present, text has `not available yet`, and `matchup-mine` text has
  no `0 of 10 valued`; false → `0 of 10 valued` shows. Setup asserts `valued === 0`. Red: ignore the prop.

**`src/components/week/WeekView.test.jsx`.**
- **T15b order and pass-through.** `matchup-header` precedes the lineup table in document order
  (`compareDocumentPosition` has `DOCUMENT_POSITION_FOLLOWING`); with `seasonProjections={null}` the
  lineup renders `ours-pending` once loaded; with `seasonProjections={{}}` it renders none. Setup
  asserts the fixture roster has a filled starter. Fails if the header card moves below the lineup or
  WeekView passes a constant. Red: render `<MatchupHeader>` after `<LineupTable>`; separately,
  hard-code `oursPending` to `true`.

**`src/hooks/useWeeklyDecision.test.js`.**
- **H1 wiring.** With the existing mocks, a complete schedule carrying a week-`currentWeek` line for
  the fixture player's team (`spreadLine 3`, `totalLine 45`, player's team home) → 
  `result.current.matchupCols[id].spread === -3`; setup asserts that game's `homeTeam` is the player's
  team and `spreadLine === 3`. `loadTeamContext` resolving `{ teams: { KC: { games: [one REG row] } },
  complete: false }` → `pace === null`; setup asserts `buildTeamMetricsTable(mock).KC.pace != null`.
  Fails if the hook uses the wrong week or ignores `.complete`. Red: pass `currentWeek - 1` to
  `vegasFactor`; separately, drop the `.complete` gate.

**`src/components/portfolio/Portfolio.test.jsx`.**
- **T20 frozen.** Starting ten: `col-slot` td has `left-0` and `w-[56px]`, `col-player` td has
  `left-[56px]`; Bench: every `col-player` td (player and pick rows) has `sticky` and `left-0`; none has
  `md:static`; both tables sit inside `frozen-scroll`; a `REC_FLEX` slot's label sits in the
  `w-[34px] truncate` span. Setup asserts the fixture has a `REC_FLEX` slot and one pick and one player
  on the bench. Fails if the md escape hatch remains. Red: restore one `md:static`.

**`src/__tests__/weeklyDecisionViewOnly.test.js`.**
- **T18** add `expect(src).not.toMatch(/from\s+['"][^'"]*weeklyMatchupColumns['"]/)` to the PIPELINE
  loop (and the `it` title). Setup: `PIPELINE` includes `seasonProjection.js`. Red: temporarily add
  the import to `seasonProjection.js` → fails; revert.

**Copy equality (`LineupTable.test.jsx`).**
- **T19** `OffencesOwned` (complete fixture; setup asserts KC `proe` = 0.032 via `buildTeamMetricsTable`)
  and `LineupTable` (`matchupCols.proe.value 0.032`) both show `+3.2%`; `-0.01` → `−1.0%` in both.
  Names `OffencesOwned.jsx` `fmtPct` as the original. Red: hyphen in LineupTable only.

---

## Risks

- **Edge shade** is dark-on-dark (`dp-canvas` over `dp-card`); Anton judges it from screenshots.
- **Sticky + `border-collapse`:** no borders on frozen cells; checked in the scrolled screenshot.
- **OURS pending forever** if projections never resolve — the copy stays true; telling failure apart needs App.jsx state (out of scope).
- **Pace/PROE** are season-to-date, unblended, noisy early; `of` is printed, never assumed 32.
- **Duplication:** ALLOWED/G and yards also show in Defences you face until Brief M §6 moves it — accepted.
- No scoring, snapshot or cross-repo impact (D10).

---

## Docs updates (same change)

1. `docs/ui.md` — new `### Season order (app-wide convention)` under `## Systems` (before
   `## Theming & tokens`, line ~527): D5's three rules with one example each (My Team `2025 | 2026 so
   far | ROS`; SNAP `61%` over grey `2025 · 58%`; rank line `2025 QB34 · 2026 QB20`), "new surfaces
   follow it", and the known exception: Market's `Prev rk` sits right of the current FP/G (to be
   reordered in W2b). Also add one line on frozen columns: tables with a player column freeze slot +
   player via `dp/FrozenScroll` + `dp/frozen.js` (lineup, Starting ten, Bench).
2. `docs/nav/components.md` — update rows `week/LineupTable.jsx`, `week/WeekView.jsx`,
   `week/MatchupHeader.jsx`, `week/DefencesFaced.jsx`, `dp/lens.js`, `dp/cells.jsx`,
   `portfolio/Portfolio.jsx` per §3–§7; new rows `dp/FrozenScroll.jsx`, `dp/frozen.js`.
3. `docs/nav/utils.md` — new `weeklyMatchupColumns.js` row (inputs, `MatchupCols`, CR-16 keys,
   view-only); add it as a consumer on the `opponentStrength.js` and `environment.js` rows.
4. `docs/navigation.md` line 22 (`/week` row: matchup columns, frozen player column) and line 101
   (`useWeeklyDecision.js` row: `teamMetrics`/`matchupCols` memos, `matchupCols` returned).
5. `docs/signal-registry.md` consumer cells (CR-18 App site): line 62 (schedule lines — replace
   "OURS column and its implied-total sub-line" with OURS plus the lineup's IMPLIED and SPREAD),
   line 64 (team context — `/week` lineup PACE/PROE), line 58 (Sleeper weekly rows — `/week` YDS
   ALLOWED via the defence load). Display-only; classes unchanged.
6. `CLAUDE.md` line 47 (`src/components/week/` row): after "the lineup table" insert "(matchup
   columns, frozen player column, weight panel in its legend; …". Must stay under 25,000 bytes.

Phrasing states mechanism, not data availability (`docsAvailabilityClaims.test.js`).

---

## Done-definition notes for Session 2

- `npm test`, `npm run lint`, `npm run build` clean. No factors/stat-key contract change.
- Every new/changed test shown red with its named red step, then restored.
- Smoke `/week` (Dynasty 040, docs/architecture.md → *Smoke-testing*): 1440×900 (Matchup; All scrolled
  right, shade visible) and 375×812 (header card then lineup, PROJ in view, then scrolled). Report the
  4c measurements, whether Matchup scrolls at 1440, one row's six values checked against Defences you
  face / Offences you own (ALLOWED/G = BLENDED, YDS = PASS/RUSH YD/G, PACE/PROE = team row), the OURS
  pending state on a hard reload; `/portfolio` Starting ten and Bench scrolled at 375. No console errors.
- `grep -rn "PROVISIONAL(" src/`: **no new tags expected**. Data-repo backlog: none expected.
  Sign-off line: cross-repo index touched — CR-18 (consumer cells only).

---

## W2b — outline only (plan after W2a is verified)

Depends on W2a's frozen primitive and layout. Palette (discrete stated steps in `@theme`, legend,
colour-blind safe, ≥ 4.5:1; SeasonGrid, ALLOWED/G bands, strips, W1 status tones); shared player cell
in `dp/cells.jsx` (+ ~40 px photos, logo watermark) across surfaces; `dp/WeeklyStrip.jsx` replacing
LAST 3 plus usage trend; Market frozen player column (`FactTable.jsx`, `MarketTable.jsx` →
`FrozenScroll`, `bg-dp-card-quiet`) and `Prev rk` moved left of FP/G in `factViews.js`. Likely `full`;
the shared player cell probably splits into its own slice.

---

## Fix pass 1

Source: implementation-reviewer (full) on `9f1413b..fcf0f37`, three flags, all low, all triaged
should-fix. Touch only what each item names.

**1.1 — Empty slots must not show the OURS pending marker (fidelity, §4d/D8).**
`src/components/week/LineupTable.jsx` `LineupRow`, the `<OwnCell … oursPending={oursPending} />` call
(line ~338): pass `oursPending={oursPending && r.player_id != null}`. An empty slot then renders `—`
with no title, as before W2a. Test, in `LineupTable.test.jsx` beside T14: `oursPending` true with one
filled starter and one `player_id: null` slot → the empty row's `col-ours` has no
`[data-testid="ours-pending"]` and its text is `—`; the filled row still has the marker. Setup asserts
the second row's `player_id === null`. Red: drop the `&& r.player_id != null`.

**1.2 — T19 must pin the specified literals (test honesty).** `LineupTable.test.jsx`, describe
"PROE format equals OffencesOwned fmtPct (T19)": parameterise the fixture's `off(...)` by
`passPlays` and `proeXpassSum` (keep `plays: 60`, `proePlays: 60` and every other field); cases
(a) `passPlays 33, proeXpassSum 31.08` → setup asserts `Math.abs(proe - 0.032) < 1e-9`; both
`offences-owned-KC` and `col-proe` contain the literal `+3.2%`; (b) `passPlays 30, proeXpassSum 30.6`
→ setup asserts `Math.abs(proe + 0.01) < 1e-9`; both contain the literal `−1.0%` (U+2212). Delete the
locally computed `pct` string. Red: format LineupTable's `signedPct` minus as a hyphen → (b) fails.

**1.3 — H1's incomplete case must wait for the mock to land (test honesty).**
`src/hooks/useWeeklyDecision.test.js`, test "spread is read from the current week …": after the
`loadTeamContext` call wait, add `await waitFor(() => expect(result.current.liveTeamContext).toBe(mock))`
before the `pace` null assertion. Red: drop the hook's `.complete` gate on `teamMetrics` → the test
fails reliably.

Leave alone: everything else in the diff, incl. the reported deviations (T12 inline key list, H1's own
fixture, port 5174) — accepted. Done-definition: `npm test`, lint, build; no smoke needed (1.1's only
visible change is an empty slot's OURS cell, covered by its test). Commit on `main`, unpushed.
