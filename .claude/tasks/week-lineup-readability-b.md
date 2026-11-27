# This Week lineup readability — Slice B: week strips, share mini-bars, one depth label (brief items 2, 3, X)

Review depth: light — view-only UI, copy, docs and tests: no `projectedPPG`/dynasty/`factors`/scoring
input (the strip's points come from `weeklySeasonGrid.js` cells, unchanged), no `docs/cross-repo-registry.md`
site (grep of the registry for `WeeklyStrip`, `LineupTable`, `weeklyUsage`, `weeklySeasonGrid`, `Portfolio`,
`starterPercentiles`, `percentileColour`, `SeriesBars`, `depthChart`, `weeklyLineup`, `depth_chart`: no
hits), no state moved, no hook, no dependency, no `playerRows` step, no TTL, no snapshot capture. The two
new modules are a presentational component and a pure string helper; neither owns state.

Source: Anton's handoff brief "This Week lineup table: readability & usage pass" (2026-11-27), items 2 and
3, plus item X (one depth-label style app-wide). Slice A (`.claude/tasks/week-lineup-readability-a.md`) is
signed off and pushed at `9520fdb`. App repo only. Display-only.

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a backgrounded `npm run dev`,
and stops it when done.

**Copied definitions created by this slice: none.** The week-slot vocabulary is one component
(`dp/WeekSlot.jsx`, §1) both strips render through; the depth label is one helper (`utils/depthLabel.js`,
§4) all three sites import; the WEEKS header title is one exported constant (§2.4) both tables import —
replacing the two hand-written titles that exist today.

---

## 0. Pre-checks done in planning (Session 1, 2026-11-27, HEAD `9520fdb`)

Every brief anchor re-read against live source (the brief's anchors predate Slice A):

- `src/components/dp/WeeklyStrip.jsx` (98 lines). `TRACK_H = 18`, `BAR_W = 5`, root `style={{ width: 107 }}`.
  `max = Math.max(1, ...playedPts)` (own-max height); `last3` Set; `bye` → `bg-dp-bye-hatch` at
  `height: TRACK_H`; `dnp` → `bg-dp-missed` 5×5 with `alignSelf: 'flex-start'` (floats at the top);
  `unknown` → wrapper `height: 0` holding `VoidBar`; a second flex row of 2px ticks (`bg-dp-text-2` under
  `last3`). Two `PROVISIONAL(no-data)` tags (played-no-basis bar; unknown slot). Confirmed.
- Consumers of `WeeklyStrip`: `week/LineupTable.jsx:376` (WEEKS column) and `portfolio/Portfolio.jsx:255`
  (`LiveWeeksCell`, rendered at `:1282` Starting ten and `:1462` Bench). No other importer.
- **Colour scale correction.** `utils/percentileColour.js` `SCALE_STOPS` runs `#2A1B4D` (dark purple, p=0)
  → `#C2F59A` (light green, p=1). The brief's "green top → red bottom" is wrong for this scale; the copy in
  §2.4 states the real ends. Red stays reserved for "did not play" (`--color-dp-missed`).
- `utils/starterPercentiles.js`: `quantile(sortedValues, q)` (type-7, `null` on empty), `basisView(pb)` →
  `{ pending, basis }` with `basis = {}` while pending, `basis[pos]` is `{ values (ascending), n, … }` or
  `null`. Confirmed.
- `utils/weeklySeasonGrid.js`: `buildStripByPlayer(grid, currentWeek)` → `{ [id]: { position, cells } }`,
  cells `week < currentWeek`, kinds `played | bye | dnp | unknown` (`projected`/`future` never reach a
  strip). `played` ⇔ that week's row has `stats.gp === 1`.
- `utils/weeklyUsage.js:209` `buildWeeklyUsageTrend(playedWeeklyMaps, playerId, position, throughWeek)` →
  `{ snap, share, shareKind }`, arrays indexed `week - 1` for weeks `1..min(throughWeek,18)`; `null` where
  no observation. `accumulateUsage` skips `gp !== 1` rows (`:64`), so today a non-played week is already
  `null` — the defect is that bye, dnp and not-loaded all render the same dashed `VoidBar`. Unchanged here.
- `hooks/useWeeklyDecision.js`: `usageTrendByPlayer` (`:250–264`, from `playedWeeklyMaps` = `weeklyMaps`
  with `week < currentWeek`) and `stripByPlayer` (`:307`, from `seasonGrid` over the same `weeklyMaps`).
  Same weeks, same rows ⇒ a `played` cell and a non-null trend value describe the same game. Hook unchanged.
- `week/LineupTable.jsx` (post-Slice A): `UsageCell` `:40–61` renders `SeriesBars mode="scaled"
  domain={[0,1]} height={12} barWidth={3} gap={1}` under `data-testid="usage-trend"` when
  `trend?.some(Number.isFinite)`; `LineupRow` `:280` passes `trend` to RUSH (`shareKind === 'rush'`), TARGET
  (`'target'`) and SNAP (`t.snap`) at `:359`, `:360`, `:364–371`; `s = stripByPlayer?.[r.player_id]` at
  `:284`. `depthLabel(r)` `:83–85`; BACKUP chip title `:306` `` `Depth chart: ${r.depth.position}${r.depth.order}` ``.
  WEEKS `<th>` title `:474`; legend sentences: usage trend `:524–526`, WEEKS `:529–533`. `SeriesBars` is
  imported only for `UsageCell` (`:9`).
- `portfolio/Portfolio.jsx:528–530`: `role = p?.depth_chart_position && p?.depth_chart_order != null ?
  `${p.depth_chart_position}${p.depth_chart_order}` : null`, rendered in `col-role` at `:1286` and `:1466`.
  `WEEKS_TITLE` `:64` (mentions "Ticked"), used at `:1210` and `:1422`.
- `utils/weeklyLineup.js:119–125`: `depth = { position: depth_chart_position, order: depth_chart_order }`
  or `null`; `backup` decision. **Unchanged.** `utils/depthChart.js` (Teams depth chart): **unchanged**.
- Tests that pin current behaviour and must change (§5): `dp/WeeklyStrip.test.jsx` S7, S8, M3 W1 snapshot;
  `portfolio/PortfolioWeeklyStrip.test.jsx:106` (`data-last3`); `week/LineupTable.test.jsx:336`
  (`'Depth chart: LWR2'`) and S11 (`:836–868`, trend without cells); `portfolio/Portfolio.test.jsx:324`
  (`'LWR1'`; fixture `w1` is `position: 'WR'`, `depth_chart_position: 'LWR'`, order 1).
- `grep -rn "PROVISIONAL(" src/ | wc -l` → 49.

---

## 1. Shared slot primitive — new `src/components/dp/WeekSlot.jsx`

One component draws one week's slot for both the points strip and the share mini-bars, so the two can
never use different marks for the same kind.

```js
// header: Brief items 2–3 — one week's slot, shared by dp/WeeklyStrip (points) and LineupTable's
// usage mini-bars (shares), so both strips draw the same mark for the same weeklySeasonGrid.js kind.
// Every slot stands on a 1px baseline segment; only a played week rises above it. View-only.
import { VoidBar } from './SeriesBars'

export const WEEK_SLOT_GAP = 1

export function WeekSlot({ kind, width, trackH, barHeight = null, barClassName = '', barStyle = null, ...attrs })
```

Render: an outer `<div {...attrs}>` with `style={{ width, height: trackH + 1, display: 'flex',
flexDirection: 'column', justifyContent: 'flex-end' }}` holding, top to bottom, the **mark** then the
**base segment**:

| `kind` / input | mark (`data-slot-mark`) | base segment |
|---|---|---|
| `'played'`, `barHeight` finite | `<div data-slot-mark="bar" className={`rounded-t-[1px] ${barClassName}`} style={{ width, height: barHeight, ...barStyle }} />` | solid |
| `'played'`, `barHeight == null` (played, no value to draw) | none | `VoidBar` |
| `'dnp'` | `<svg data-slot-mark="dnp" aria-hidden="true" width={width} height={width} viewBox="0 0 5 5" style={{ display: 'block' }}><path d="M1 1L4 4M4 1L1 4" stroke="var(--color-dp-missed)" strokeWidth="1.25" strokeLinecap="round" fill="none" /></svg>` | solid |
| `'bye'` | `<div data-slot-mark="bye" className="bg-dp-bye-hatch" style={{ width, height: width }} />` | solid |
| `'unknown'` or any other kind | none | `VoidBar` |

Solid base segment: `<div data-slot-base="solid" className="bg-dp-border-row" style={{ width, height: 1 }} />`.
`VoidBar` base: `<div data-slot-base="void"><VoidBar width={width} /></div>` — `VoidBar` itself unchanged.

Decisions behind it:
- **Baseline per slot, not one continuous rule.** A continuous 1px rule would sit exactly where `VoidBar`'s
  dashed line sits, making "not loaded" invisible. Per-slot segments let the unknown week's segment *be*
  the dashed line; with the 1px gap the baseline reads as a faint week ruler.
- **dnp and bye are width × width squares on the baseline** — red × vs. grey hatch — so neither can read as
  a score. Played bars keep their existing minimums (3px for points > 0, 2px for ≤ 0), so a played week
  is the only mark that can be tall.
- `role`/`title`/`aria-label`/`data-*` come in through `attrs`; `WeekSlot` adds no text.

## 2. Points strip — `src/components/dp/WeeklyStrip.jsx`

### 2.1 Fixed per-position height scale

```js
import { basisView, percentileOf, quantile } from '../../utils/starterPercentiles'
export const STRIP_SCALE_Q = 0.95
```

Inside `WeeklyStrip`, after `b` is resolved:

```js
const scaleTop = b ? quantile(b.values, STRIP_SCALE_Q) : null
const sharedScale = Number.isFinite(scaleTop) && scaleTop > 0
const top = sharedScale ? scaleTop : Math.max(1, ...playedPts)
// played bar: points > 0 ? Math.max(3, Math.round(Math.min(1, points / top) * TRACK_H)) : 2
```

- **p95 chosen** (Session 1): full height = a top-5% week among this league's starters at the position, so a
  typical starter week lands near mid-track and the scale is not set by one outlier. Weeks above p95 clamp
  to full height; the slot title still shows the exact points.
- Fallback to own-max exactly when no basis entry is usable: `percentileBasis` pending (`basisView` returns
  `basis = {}`), `basis[position]` null/absent, or a non-positive/non-finite quantile.
- Root gets `data-scale={sharedScale ? 'position' : 'own'}` (test hook; no visible change).
- Colour logic, `data-pct`, both `PROVISIONAL(no-data)` tags and `slotTitle` stay as they are.

### 2.2 Slots through `WeekSlot`

Each cell renders `<WeekSlot key={cell.week} kind={cell.kind} width={BAR_W} trackH={TRACK_H} … />` with the
existing `common` attrs (`data-testid="strip-slot"`, `data-week`, `data-kind`, `role="img"`,
`aria-label`, `title`) on the slot. A `played` cell passes `barHeight` (§2.1) and:
- pending → `barClassName="bg-dp-chip"`;
- basis `b` → `barStyle={{ backgroundColor: scaleCss(p) }}` and `data-pct` on the **slot** (as today);
- no basis → `barClassName="bg-dp-chip"` (keep its `PROVISIONAL(no-data)` comment above it).

A `played` cell with `points == null` falls to `WeekSlot`'s void base (today it renders as unknown — same
meaning). The `unknown` branch keeps its `PROVISIONAL(no-data)` comment above its `WeekSlot`.

Track: `<div className="flex items-end" style={{ gap: WEEK_SLOT_GAP, height: TRACK_H + 1 }}>`. Root width
stays 107px.

### 2.3 Last-3 marker — dropped

Remove the `last3` Set, the `data-last3` attribute and the whole tick row. Decision (Session 1): the last
three played weeks are already the rightmost played bars; the marker read as noise and cost a legend
sentence. Tests that pinned it are rewritten to assert its absence (§5), not deleted silently.

### 2.4 One WEEKS header title

Export from `WeeklyStrip.jsx`:

```js
export const WEEKS_STRIP_TITLE = "Points in each completed week. Height: points on one scale for every player at his position — full height is a top-5% week among this league's starters there. Colour: how that week ranked among this league's starters at his position — light green the top, dark purple the bottom. Red ×: did not play. Hatched stub: bye. Dashed: not loaded."
```

- `LineupTable.jsx` WEEKS `<th>` (`:474`) → `title={WEEKS_STRIP_TITLE}`.
- `Portfolio.jsx`: delete the local `WEEKS_TITLE` (`:64`); `:1210` and `:1422` use `WEEKS_STRIP_TITLE`
  (still `inSeasonLayout ? … : undefined`).

## 3. Share mini-bars — `UsageCell` in `src/components/week/LineupTable.jsx`

### 3.1 New local component

```js
const USAGE_TRACK_H = 12
const USAGE_SLOT_W = 3

// Brief item 3 — the share trend on the same week slots as the WEEKS strip: slot kind comes from the
// row's weeklySeasonGrid.js cells (stripByPlayer), the value from buildWeeklyUsageTrend. A value is drawn
// only on a `played` cell, so a week he did not play can never show a bar. Fixed 0–100% scale.
function UsageTrend({ cells, values })
```

- `slots = (cells ?? []).map(cell => ({ cell, v: cell.kind === 'played' ? values?.[cell.week - 1] : null }))`.
- Render `null` unless `slots.some(s => Number.isFinite(s.v))` (same "all-null renders none" rule as today;
  no cells ⇒ none).
- Otherwise `<div data-testid="usage-trend" className="flex justify-end items-end mt-1" style={{ gap:
  WEEK_SLOT_GAP }}>` of `WeekSlot`s, one per cell, `width={USAGE_SLOT_W}`, `trackH={USAGE_TRACK_H}`,
  `barClassName="bg-dp-slate-2"`, `barHeight = Number.isFinite(v) ? Math.max(2, Math.round(Math.min(1,
  Math.max(0, v)) * USAGE_TRACK_H)) : null` (same 2px real-zero stub and `[0,1]` domain `SeriesBars` used),
  slot attrs `data-testid="usage-slot"`, `data-week`, `data-kind`, `title`.
- Titles: played with value `` `Wk ${w} · ${pctText(v)}` ``; played without value `` `Wk ${w} · no share recorded` ``;
  `'bye'` → `'Bye'`; `'dnp'` → `'Did not play'`; otherwise `` `Wk ${w} · not loaded` ``.

### 3.2 Wiring

- `UsageCell` keeps its props but takes `cells = null` beside `trend`; it renders `<UsageTrend cells={cells}
  values={trend} />` where the `SeriesBars` block was. Drop the `SeriesBars` import.
- `LineupRow`: pass `cells={s?.cells ?? null}` to the three `UsageCell`s that pass `trend` (RUSH, TARGET,
  SNAP). TOUCH/RZ unchanged.
- No cells for a player (no `stripByPlayer` entry) ⇒ no trend. Never fall back to drawing the trend values
  without slot kinds — that is the defect this item removes.
- Alignment is by week number (`values[cell.week - 1]`), not array position.

### 3.3 Legend copy (`lineup-legend`)

- Usage sentence (`:524–526`), replace from "Under SNAP, and under TARGET…" to the end with: "Under SNAP,
  and under TARGET for a WR or TE and RUSH for an RB, a small grey trend shows that share week by week on a
  0–100% scale, on the same week slots as {thisSeason ?? 'this season'} WEEKS: a red × is a week he did not
  play, a hatched stub a bye, a dashed slot a week that did not load or a game with no share recorded, a
  short stub a real zero."
- WEEKS sentence (`:529–533`) becomes: "{thisSeason ?? 'This season'} WEEKS has one bar per completed week:
  height is his points that week on one scale for every player at his position (full height is a top-5%
  week among this league's starters there), colour is how that week ranked among this league's starters at
  his position — the same scale and cut-offs as the season grid below. A red × on the baseline is a week
  he did not play, a hatched stub a bye, a dashed slot a week that did not load."

### 3.4 Addendum (Session 1, 2026-11-27, raised by Session 2) — My Team's strip key and legend

Missed in planning: `Portfolio.jsx` describes the old strip in two places. Both change in this slice:
- Strip key (`:1160`, in-season branch, "did not play"): replace the `w-2 h-2 rounded-sm bg-dp-missed`
  square with an inline `svg` (`aria-hidden="true"`, 8×8, `viewBox="0 0 5 5"`, the same × path, stroke
  and colour as §1's dnp mark). The bye swatch and the "bar height = points, colour = rank among league
  starters" key stay as they are.
- `starting-ten-legend` (`:1298`, in-season string): replace from "height is his points that week" through
  "the three ticked bars are his last three played weeks." with: "height is his points that week on one
  scale for every player at his position (full height is a top-5% week among this league's starters
  there), colour is how that week ranked among this league's starters at his position — the same scale as
  This week. A red × on the baseline is a week he did not play, a hatched stub a bye, a dashed slot a week
  that did not load." Everything else in the string is unchanged.
- Test **PL-1** (Portfolio test file of Session 2's choice): in-season legend text contains "red × on the
  baseline" and contains neither "red square" nor "ticked"; the did-not-play key contains an `svg`. Fails if
  My Team keeps describing the old strip. Red: restore the old sentence.

## 4. One depth label — new `src/utils/depthLabel.js`

```js
// Brief item X — the depth label shown app-wide: fantasy position + Sleeper depth order ("WR2"), never
// Sleeper's slot code (LWR/SWR/RWR), which reads as a formation role. Null unless the player has a depth
// entry (slot code and order) and a fantasy position. View-only; the Teams depth chart
// (utils/depthChart.js) keeps slot codes — there they are the grid layout.
export function depthLabel(position, depthChartPosition, depthChartOrder) {
  return position && depthChartPosition && depthChartOrder != null ? `${position}${depthChartOrder}` : null
}
```

- `LineupTable.jsx`: delete the local `depthLabel(r)`; call `depthLabel(r.position, r.depth?.position,
  r.depth?.order)` (compute once per row as `const depth = …`). Comment above `DEPTH_LABEL_TITLE` keeps its
  meaning, pointing at the util. BACKUP chip `title={depth != null ? `Depth chart: ${depth}` : undefined}`
  (when-it-shows logic unchanged).
- `Portfolio.jsx:528–530`: `const role = depthLabel(p?.position, p?.depth_chart_position, p?.depth_chart_order)`.
  The null rule is the same as today's plus a missing fantasy position (cannot occur for a rostered QB/RB/WR/TE).

## 5. Tests

Existing tests changed (each asserts the new outcome, not merely edited green):

- **S7** (`WeeklyStrip.test.jsx`) → asserts: bye slot has a `[data-slot-mark="bye"]` child 5px tall with
  `bg-dp-bye-hatch`; dnp slot has `svg[data-slot-mark="dnp"]` and no `bg-dp-missed` box, no `alignSelf`;
  every slot's last child is a base segment (`data-slot-base` solid for bye/dnp/played, void for
  unknown); no slot except a played one has a mark taller than 5px; 0-pt played bar 2px, coloured. Fails
  if the bye is full-height again or the dnp floats at the top. Red: restore `height: TRACK_H` on the bye mark.
- **S8** → "no last-3 marker": no element carries `data-last3`, and `weekly-strip` has exactly one child (the
  track). Fails if the tick row or attribute comes back. Red: re-add the tick row.
- **M3 W1** inline snapshot → regenerate (`-u` on this one test only), then read it: confirms `data-scale`,
  base segments, no tick row. Red: none needed beyond the regenerated pin — state that in the hand-back.
- **PortfolioWeeklyStrip.test.jsx:106** → replace with `expect(w1.some(s => s.dataset.last3)).toBe(false)`.
- **LineupTable.test.jsx:336** → `'Depth chart: WR2'`; the `LWR2`-never-in-text assertion stays. Red:
  revert the chip title to the slot code.
- **S11** → pass `stripByPlayer={{ p1: { position, cells } }}` with played cells for each week alongside the
  trends; placement assertions unchanged; the all-null case stays none. Add: same trends with no
  `stripByPlayer` entry render no `usage-trend`. Red: render the trend when cells are absent.
- **Portfolio.test.jsx:324** → `'WR1'`. Red: revert `role` to the slot code.

New tests:

- **WS-1** (`WeeklyStrip.test.jsx`) shared scale: WR basis of 100 ascending values `0..99` (p95 = 94.05);
  two strips, one with a 47-pt week, one with a 94-pt week. Asserts heights 9px and 18px (`round(47/94.05
  *18)`=9) and both roots `data-scale="position"`. Fails if height is own-max (both would be 18px). Red:
  set `top = Math.max(1, ...playedPts)`.
- **WS-2** clamp: a 150-pt week on that basis is 18px, title still `Wk n · 150.0 pts`. Fails if the bar
  overflows the track. Red: drop `Math.min(1, …)`.
- **WS-3** fallback: pending basis and a ready basis with no entry for the position each give
  `data-scale="own"` and the own-max heights (a 10-pt and 20-pt week → 9px and 18px). Fails if a pending
  basis yields position scaling or an absent basis throws. Red: use `quantile(ready.basis.WR.values, …)`
  regardless of `b`.
- **WS-4** `WEEKS_STRIP_TITLE` contains "light green the top", "dark purple the bottom", "did not play" and
  does not contain "Ticked"; LineupTable's WEEKS `<th>` title and Portfolio's in-season WEEKS `<th>` title
  both equal it. Fails if either table keeps a local copy. Red: restore Portfolio's local `WEEKS_TITLE`.
- **WSL-1** (`dp/WeekSlot.test.jsx`) the vocabulary table in §1, one case per row: mark selector present or
  absent, base segment kind, outer height `trackH + 1`. Fails if any kind draws a different mark. Red:
  give `'bye'` `height: trackH`.
- **UT-1** (`LineupTable.test.jsx`) slots follow cells: cells `[played 1, bye 2, dnp 3, unknown 4, played 5]`,
  snap trend `[0.6, null, null, null, 0]` → five `usage-slot`s with `data-kind` matching the cells in
  order, bars only on weeks 1 (`7px` = round(0.6×12)) and 5 (2px stub), dnp has the × mark, bye the hatch.
  Fails if bye and dnp render the same.
- **UT-2** a non-played week never draws a bar: cells `[dnp 1, bye 2, played 3]`, trend `[0.5, 0.5, 0.5]`
  (a value where none should exist) → only week 3 has `[data-slot-mark="bar"]`. Fails if the value is
  drawn on a dnp/bye week (the `gp !== 1` defect). Red: use `values[cell.week - 1]` for every kind.
- **UT-3** played with `null` value → void base, no bar, title `Wk n · no share recorded`.
- **DL-1** (`utils/depthLabel.test.js`): `('WR','LWR',2)` → `'WR2'`; `('QB','QB',1)` → `'QB1'`; each of
  `(null,'LWR',2)`, `('WR',null,2)`, `('WR','LWR',null)` → `null`; `('WR','LWR',0)` → `'WR0'` (order 0 is a
  value). Fails if the slot code leaks or a missing field yields `"WRnull"`. Red: return
  `` `${depthChartPosition}${depthChartOrder}` ``.

Existing T5a/T5b (depth label) must stay green untouched.

## 6. Docs (same change)

- `docs/nav/components.md`: `dp/WeeklyStrip.jsx` row — height on the position's p95 league-starter week
  (`STRIP_SCALE_Q`), own-max fallback, `data-scale`, slots via `dp/WeekSlot`, bye/dnp on the baseline, no
  last-3 marker, `WEEKS_STRIP_TITLE`. New `dp/WeekSlot.jsx` row (the §1 table in one sentence; consumers
  `WeeklyStrip` and `week/LineupTable.jsx`). `week/LineupTable.jsx` row — usage trend now `UsageTrend` over
  the row's strip cells via `WeekSlot`; depth label from `utils/depthLabel.js`. `portfolio/Portfolio.jsx`
  row — ROLE is `depthLabel` (e.g. `WR2`), if the row describes ROLE.
- `docs/nav/utils.md`: new `depthLabel.js` row.
- No `CLAUDE.md`, `docs/signal-registry.md` or registry change (no signal, no contract).

## 7. Nothing else

Not in scope: `buildWeeklyUsageTrend`, `useWeeklyDecision`, `weeklySeasonGrid.js`, `SeasonGrid.jsx`,
`SeriesBars.jsx`/`VoidBar`, `weeklyLineup.js` BACKUP logic, `utils/depthChart.js`, the Teams depth chart,
Portfolio's out-of-season `GamesStripCell`, any colour token. No new `PROVISIONAL(` site; the count stays 49.

## 8. Smoke (Session 2) and what Anton checks in the app

Session 2: `/week` and `/portfolio` (in-season layout), desktop and 375px. Look for: no `NaN`, strips 107px
wide, nothing above the track, no console errors.

Anton checks:
- Jayden Daniels' WEEKS strip: missed weeks a red × on the baseline, the bye a short hatched stub, nothing
  floating at the top.
- A low- and a high-scoring player at the same position: bar heights now compare.
- Under the same player, the SNAP (and TARGET/RUSH) mini-bars show the same weeks as the WEEKS strip —
  missed weeks marked differently from the bye.
- My Team ROLE column and the This Week BACKUP tooltip read `WR2`-style, matching the label under the name.
- My Team's WEEKS strip (Starting ten and Bench) looks right too — it is the same component.

## 9. Open items to surface at sign-off

- The brief described the colour scale as green→red; the live scale is dark purple→light green. Copy states
  the real ends; recolouring is not in this slice.
- The last-3 marker is dropped, not replaced.

---

## Later slices (outline only)

**Slice C — usage colouring + TD column (brief items 4, 6). Largest; likely `full` (new derived ranking
pool).** League-starter percentile colouring of SNAP/RUSH/TARGET/TOUCH/RZ RUSH/RZ TGT shares: a new
per-position, per-share-kind basis over league starters' season-to-date shares (same played-weeks window,
sum components and divide once, `MIN_POOL_SAMPLES`, neutral when the pool is small, `scaleCss`), shares that
don't apply uncoloured, one legend line. New TD column: RB/WR/TE `rush_td + rec_td` · share of team rush +
receiving TDs; QB `pass_td + rush_td` count only. Team TD totals via `buildTeamAggregates` only after
verifying `TEAM_<abbr>` rows carry `rush_td`/`rec_td` in cached data or a fixture, else summed player rows.
Extends `accumulateUsage`/`computeUsageShares`/`computeUsageCounts`. Depends on Slice B for `UsageCell`'s
layout (`UsageTrend`, `cells` prop), so plan after B is verified.

---

## Plan review

plan-reviewer, depth light (sonnet, frontmatter), 2026-11-27: "No blocking issues found." Size 23,100
bytes. Log: `.claude/reviews/week-lineup-readability-b.plan-reviewer.md`. The reviewer left these unchecked:
test-file anchors, the `weeklySeasonGrid.js` cell kinds, the docs/nav rows, and the two-consumer claim
(its grep was blocked). Session 1 checked all four in planning (§0 greps and reads). Approved by Anton 2026-11-27.

## Verification

Session 1, 2026-11-27, on `bf785bd` (diff `9520fdb..bf785bd`).

- **implementation-reviewer**, depth light (sonnet, frontmatter), round 1 on the diff: "No blocking
  issues found." No fix pass; no re-review needed. Log: `.claude/reviews/week-lineup-readability-b.implementation-reviewer.md`.
- **Session 1 diff read**: `WeekSlot.jsx` matches the §1 table; `WeeklyStrip.jsx` p95 scale, own-max
  fallback, `data-scale`, no last-3, `WEEKS_STRIP_TITLE`; `LineupTable.jsx` `UsageTrend` gates values on
  `kind === 'played'` and needs cells; `depthLabel.js` used at all three sites; Portfolio §3.4 key and legend.
- **Checks re-run by Session 1**: `npm test` 201 files / 3799 tests green · `npm run lint` 0 problems ·
  `npm run build` clean apart from the pre-existing >500 kB chunk notice.
- **Deviations accepted**: §3.4 addendum (Session 1 approved mid-implementation); S6/S9a/S9c/S10 retargeted
  to the bar child (selector move only); UT-2 gained one assertion because the named mutation was invisible
  to the bar check; WS-4 split into three tests; components.md LineupTable row also notes the BACKUP tooltip.
  Substitute red steps for UT-1 and UT-3 each trigger the named defect. Session 2 ran on Sonnet as specified.
- **PROVISIONAL inventory**: 49 lines, unchanged from `9520fdb`.
- **Smoke (Session 2)**: `/week` and `/portfolio`, desktop and 375px — strips 107px, nothing outside the
  track, `data-scale=position`, no `NaN`, no console errors; Daniels shows × on missed weeks and a hatched
  bye stub; BACKUP titles and ROLE read `WR2`-style.
- **Open items**: the 3px usage mini-bar marks are very small (Anton judges); colour-scale wording corrected
  from the brief (purple→green); last-3 marker dropped, not replaced.
