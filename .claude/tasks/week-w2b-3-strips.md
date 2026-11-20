# W2b-3 — weekly score strip + usage trend (This week)

Repo: sleeper-dashboard (app). Planned at `8281f3a`; every line anchor below was read there.
Session 2: **sonnet**, effort medium.

Review depth: full — new shared `dp/` primitive, a changed `useWeeklyDecision` return shape and
`SeasonGrid` prop interface, and removal of an exported function plus a lineup-row key.

Design source: ux-briefs-week-and-myteam.md §4/§6 (Claude.ai project; restated in Anton's brief of
2026-11-20). Prior slices done: W2b-1 (percentile scale), W2b-1q, W2b-2 (shared `PlayerCell`).

## Product outcome

Each lineup row shows the player's season at a glance — one small bar per completed week, coloured
by how that week ranked among the league's starters at his position (same scale as the season grid),
byes and missed weeks marked with the grid's hatch and red. In Usage & form, SNAP (every position)
and TARGET (WR/TE) / RUSH (RB) also carry a small neutral week-by-week share trend under the season
number.

## Fixed decisions (do not revisit)

- **D1 Matchup columns are not recoloured** (Anton, 2026-11-20). `allowsToneClass`
  (`LineupTable.jsx:38–45`) and its call (l.114) stay byte-identical; IMPLIED/SPREAD/YDS/PACE/PROE
  stay uncoloured. A guard test pins this (S12).
- **D2 One grid derivation, in the hook.** `buildSeasonGrid` moves from `SeasonGrid.jsx:90–93` into
  `useWeeklyDecision` (one memo). The hook returns `seasonGrid`; `SeasonGrid` renders that prop and
  no longer computes it; the strip is a filter of the same rows. No second derivation of
  played/bye/dnp/unknown anywhere. Hook, not WeekView, because the hook already owns every input
  (`weeklyMaps`, `failedWeeks`, `scheduleIndex`, `projections`, `lineup`, `myTeam`) and is unit-tested
  with `renderHook`.
- **D3 Lens.** The strip replaces LAST 3 in the `usage` group, so it shows in **Usage & form and
  All**, hidden in Matchup (the default). Reason: Matchup is about this week's opponent; adding a
  ~135px column there would reopen W2a's matchup layout and phone scroll window.
- **D4 Strip geometry.** Fixed 18 slots of pitch 6px (bar 5px + gap 1px) → track **107px** wide
  (18×5 + 17×1), **18px** tall, plus a 2px gap and a 2px emphasis row beneath = **22px** total
  height. The track width is fixed (`width: 107`) whatever the week, so the column does not grow
  through the season; completed weeks fill from the left, later slots are simply empty (no element).
  Column ≈ 107 + 10 (`px-2.5`) + 18 (`pr-[18px]`) = 135px — about what LAST 3 took (31px bars +
  ~100px text). On phone the column scrolls with the others; the frozen block is untouched.
- **D5 Strip slot kinds** (weeks `1 .. min(currentWeek − 1, 18)` only — i.e. grid cells with
  `week < currentWeek`, whose kinds are only `played`/`bye`/`dnp`/`unknown`):
  - `played`: bottom-anchored bar, height zero-based on the row's own max:
    `points > 0 ? Math.max(3, Math.round(points / max * 18)) : 2` with `max = Math.max(1, ...played
    points)` (the FormBars rule at `LineupTable.jsx:85–100`, which is deleted). Fill:
    `scaleCss(percentileOf(basis.values, points))` when the basis is ready and has this position;
    `bg-dp-chip` (neutral) when pending; `bg-dp-chip` with a `PROVISIONAL(no-data)` tag when ready
    but the position has no basis (same wording as `SeasonGrid.jsx:46`).
  - `bye`: full-track-height (18px) slot, class `bg-dp-bye-hatch`. The hatch pattern is what no bar
    ever has.
  - `dnp`: a 5×5 `bg-dp-missed` square **hanging from the top** of the track (`align-self:
    flex-start`). Every bar stands on the baseline, so a missed week is shape-coded, not only
    red — this matters for deuteranopia, where #E24B4A and the scale's greens converge.
  - `unknown`: the void treatment. The `strip-slot` element is a wrapper `<div>` with
    `style={{ width: 5, height: 0 }}` carrying all the D5 attributes. Its only child is
    `<VoidBar width={5} />` (`SeriesBars.jsx:10–14`: height 0,
    `border-top: 1px dashed var(--color-dp-slate-2)`; imported, see D9). The wrapper's own height is
    0, so S7 measures the wrapper's inline height (0) and finds the dashed border on its child.
  - Per slot: `data-testid="strip-slot"`, `data-week`, `data-kind`, `data-pct` (played + coloured
    only, `Math.round(p*100)`), `data-last3="true"` (emphasised slots only), `role="img"`,
    `aria-label` = `title` = `Wk 7 · 18.4 pts` (`points.toFixed(1)`) / `Bye` / `Did not play` /
    `Wk 7 · not loaded` (unknown).
- **D6 Last-3 emphasis, not by hue.** The last three `played` slots (by week, ignoring bye/dnp/unknown
  between them) get a 5×2px `bg-dp-text-2` tick in the emphasis row beneath the bar. Position/shape
  only; fill unchanged. Fewer than three played weeks → every played slot ticked.
- **D7 Header.** `${thisSeason} WEEKS` (e.g. `2026 WEEKS`), or `WEEKS` when `thisSeason == null`.
  `title`: "Points in each completed week, coloured by rank among this league's starters at his
  position (cut-offs in the season grid legend). Ticked: his last three played weeks."
- **D8 Usage trend.** Values for weeks `1 .. min(currentWeek − 1, 18)`, one per week, `null` = void.
  Computed per week by calling the existing `accumulateUsage([wk], id)` then
  `computeUsageShares(totals, position)` on that single week — **no formula is copied**, so the
  null-vs-zero semantics are exactly the season cell's: a week with `gp !== 1`, a failed week (absent
  from `playedWeeklyMaps`) or `tm_off_snp` absent → `null`; `off_snp` absent with `tm_off_snp`
  present → `0`. Series: `snap` for every position; `share` = `target` for WR/TE, `rush` for RB,
  `null` (no second trend) for QB and anything else. Rendered with the existing `SeriesBars`
  (`mode="scaled"`, `domain={[0, 1]}`, `height={12}`, `barWidth={3}`, `gap={1}` → 71px max): fixed
  0–100% domain so growth reads honestly and rows compare; neutral `bg-dp-slate-2` bars; a measured
  0 is SeriesBars' 2px stub, a null its dashed void. A series with no finite value renders nothing.
  Placed **under** the printed `count · share` line (right-aligned), above SNAP's grey prior-season
  line — under, not beside, so neither column widens by ~75px. The printed season value is
  unchanged.
- **D9 Reuse, no copies.** `SeriesBars.jsx`'s `VoidBar` becomes a named export (one word added at
  l.10, no behaviour change) so `WeeklyStrip` reuses it. The "is the basis pending" rule
  (`SeasonGrid.jsx:96–97`) moves into one exported helper both components call. **Copied definitions
  created by this slice: none.**

## Changes, file by file

### 1. `src/utils/starterPercentiles.js` — add (append after l.112)

```js
// W2b-3 — the view a grid/strip renders from a resolvePercentileBasis result (or null).
export function basisView(percentileBasis) {
  const pending = percentileBasis == null || percentileBasis.status === 'pending'
  return { pending, basis: pending ? {} : (percentileBasis.basis ?? {}) }
}
```

### 2. `src/utils/weeklySeasonGrid.js` — add two exports (after `buildSeasonGrid`, l.119)

```js
// W2b-3 — the grid's three groups from the lineup rows plus myTeam.reserve (moved verbatim from
// SeasonGrid.jsx:77–88; section membership is still the caller's job, now the hook's).
export function buildGridGroups({ starters = [], bench = [], reserve = [] }) { ... }

// W2b-3 — the lineup's weekly strip: each starters/bench grid row's cells with week < currentWeek,
// keyed by player id. A filter of buildSeasonGrid's own output — never a second derivation.
// -> { [id]: { position, cells } }
export function buildStripByPlayer(grid, currentWeek) { ... }
```

`buildGridGroups` body = `SeasonGrid.jsx:78–87` unchanged (starters filtered on `player_id != null`
mapped `{ id: r.player_id, name: r.name, team: r.team, position: r.position }`; bench the same
without the filter; reserve `{ id: p.id, name: p.full_name, team: p.team, position: p.position }`;
groups `starters`, `bench`, `ir` in that order). `buildStripByPlayer` iterates groups with key
`starters` or `bench` only (IR rows never render in the lineup) and returns
`{ position: row.position, cells: row.cells.filter(c => c.week < currentWeek) }`. Same cell objects
(no copy/re-shape), so equality with the grid is by construction. Update the module header's
"`groups` arrives already assembled … by the caller" sentence (l.5–6) to name `buildGridGroups`.

### 3. `src/utils/weeklyUsage.js` — append (after l.203; lines 1–143 must not move)

```js
// W2b-3 — the Usage & form trend: one share per completed week, null where that week has no
// observation. Each week is accumulateUsage over that one week, then computeUsageShares — the
// season cell's own functions, so the null-vs-zero rule cannot drift.
// -> { snap: (number|null)[], share: (number|null)[] | null, shareKind: 'target'|'rush'|null }
export function buildWeeklyUsageTrend(playedWeeklyMaps, playerId, position, throughWeek) { ... }
```

`throughWeek` = last completed week; length = `Math.max(0, Math.min(throughWeek, 18))`. Index map
`week → wk` from `playedWeeklyMaps`; a missing week → `null` in both series. `shareKind`:
`WR`/`TE` → `'target'`, `RB` → `'rush'`, else `null` (and `share: null`).

### 4. `src/hooks/useWeeklyDecision.js`

- **Delete** `buildLast3Form` and its header comment, l.58–69. Delete the `calculateFantasyPoints`
  import (l.15) only if nothing else in the file uses it (at `8281f3a` nothing does — Session 2
  re-greps). Grep at `8281f3a`, `grep -rn "buildLast3Form" src docs`: production hits only
  `useWeeklyDecision.js:61,320`; tests only `useWeeklyDecision.test.js:5,74–117` → no other
  consumer, so it is removed.
- Import `buildWeeklyUsageTrend` (l.7–10 block) and `buildSeasonGrid, buildGridGroups,
  buildStripByPlayer` from `../utils/weeklySeasonGrid`.
- Usage memo l.306–323: drop `form`/`formByPlayer`; add
  `trend[id] = buildWeeklyUsageTrend(playedWeeklyMaps, id, p.position, currentWeek - 1)`; return
  `{ usageByPlayer, countsByPlayer, usageTrendByPlayer }`; deps add `currentWeek`, drop
  `scoringSettings`. Rewrite the l.306–307 comment (form is gone; trend is per completed week).
- l.341–358: drop `formByPlayer` from the `buildWeeklyLineup` call and deps.
- New memo after `lineup` (after l.358):
  ```js
  const seasonGrid = useMemo(() => buildSeasonGrid({
    groups: buildGridGroups({ starters: lineup.starters, bench: lineup.bench, reserve: myTeam?.reserve ?? [] }),
    weeklyMaps, failedWeeks, scheduleIndex, projections, scoringSettings, currentWeek,
  }), [lineup, myTeam, weeklyMaps, failedWeeks, scheduleIndex, projections, scoringSettings, currentWeek])
  const stripByPlayer = useMemo(() => buildStripByPlayer(seasonGrid, currentWeek), [seasonGrid, currentWeek])
  ```
  `weeklyMaps` (all fetched weeks, not `playedWeeklyMaps`) — exactly what WeekView passes
  SeasonGrid today (`WeekView.jsx:203`); `resolveCell` handles `week >= currentWeek` itself.
- Return (l.411–416): add `seasonGrid, stripByPlayer, usageTrendByPlayer`.
- Stale comments: l.42–43 ("usage all null/`—`" and the form wording in the week-1 degraded path)
  and l.71–75 ("usage/form must be computed over", "usage/form can be built"): change "form" to
  "trend". Comment-only.

### 5. `src/utils/weeklyLineup.js` — remove the `form` key

- l.16 `emptyRow`: delete `form: [null, null, null],`.
- l.92 `buildRow` params: delete `formByPlayer`. l.128: delete `const form = …`. l.132: delete
  `form` from the returned row.
- l.161 `buildWeeklyLineup` params and l.175 `rowArgs`: delete `formByPlayer`.

### 6. `src/components/dp/SeriesBars.jsx`

l.10: `function VoidBar` → `export function VoidBar`. Nothing else.

### 7. `src/components/dp/WeeklyStrip.jsx` — new

```js
// W2b-3 — one season, one bar per completed REG week (shared: /week lineup now, My Team later).
// `cells` are weeklySeasonGrid.js cells (week < currentWeek: played | bye | dnp | unknown) —
// the season grid's own output, so the strip and grid cannot disagree. View-only.
export function WeeklyStrip({ cells = [], position = null, percentileBasis = null }) { ... }
```

- `const { pending, basis } = basisView(percentileBasis)`; `const b = basis[position] ?? null`.
- Outer: `<div data-testid="weekly-strip" style={{ width: 107 }}>`; track
  `<div className="flex items-end" style={{ gap: 1, height: 18 }}>` (one child per cell, in cell
  order = week order); emphasis row `<div className="flex mt-[2px]" style={{ gap: 1, height: 2 }}>`
  with one 5px-wide child per cell, `bg-dp-text-2` only on last-3 slots. Kinds, attributes and
  titles exactly as D5/D6. Bars use `rounded-[1px]`.
- Last-3: `played` cells sorted by week, `.slice(-3)`, as a `Set` of weeks.
- Zero cells (week 1) → render the muted text `—` (`text-dp-muted text-[12px]`) instead of the track.
- Tags: the no-basis branch carries
  `// PROVISIONAL(no-data): played strip bar with no percentile basis · fewer than MIN_POOL_SAMPLES league-starter weeks at this position and no usable prior-season pool · a season reaching the threshold, or the prior league's matchups loading`;
  the unknown branch carries
  `// PROVISIONAL(no-data): the unknown strip slot · a week this strip cannot resolve (failed fetch or an incomplete/unresolved schedule) · a successful fetch and complete schedule would resolve it`.

### 8. `src/components/week/SeasonGrid.jsx`

- Props (l.72–76) become `{ grid = [], percentileBasis = null }`. Delete the `groups`/`grid` memos
  (l.77–93) and the `buildSeasonGrid` import (l.7); `useMemo` import goes if unused (`Fragment`
  stays).
- l.96–97 → `const { pending, basis } = basisView(percentileBasis)` (import from
  `starterPercentiles`). l.98 unchanged.
- Header comment l.1–4: the hook now assembles groups (`buildGridGroups`) and builds the grid;
  this component renders it. No render change otherwise.

### 9. `src/components/week/WeekView.jsx`

- Destructure `seasonGrid, stripByPlayer, usageTrendByPlayer` (l.75–79).
- `LineupTable` (l.165–179): add `stripByPlayer={stripByPlayer}`,
  `usageTrendByPlayer={usageTrendByPlayer}`, `percentileBasis={percentileBasis}`.
- `SeasonGrid` (l.199–210) → `<SeasonGrid grid={seasonGrid} percentileBasis={percentileBasis} />`.
  `weeklyMaps`, `projections`, `failedWeeks`, `scheduleIndex` stay destructured only if still used
  (`failedWeeks` is, l.152; drop the rest from the destructure if unused — lint will say).
- Header comment l.24: mention the strip/trend props.

### 10. `src/components/week/LineupTable.jsx`

- Delete `FormBars` and its comment (l.81–104).
- Imports: `WeeklyStrip` from `../dp/WeeklyStrip`, `SeriesBars` from `../dp/SeriesBars`.
- `UsageCell` (l.55–69): new optional prop `trend = null` (array or null). After the l.59–61 value
  div, when `trend?.some(Number.isFinite)`:
  `<div data-testid="usage-trend" className="flex justify-end mt-1"><SeriesBars values={trend} mode="scaled" domain={[0, 1]} height={12} barWidth={3} gap={1} /></div>`.
  The prior-share div stays last.
- `LineupRow` (l.280): new props `stripByPlayer`, `usageTrendByPlayer`, `percentileBasis`;
  `const t = usageTrendByPlayer?.[r.player_id] ?? null`.
  - l.354 RUSH: `trend={t?.shareKind === 'rush' ? t.share : null}`.
  - l.355 TARGET: `trend={t?.shareKind === 'target' ? t.share : null}`.
  - l.359–366 SNAP: `trend={t?.snap ?? null}`.
  - l.367–374 → `<td data-testid="col-weeks" className={\`px-2.5 py-2.5 pr-[18px] ${lensHidden('usage', lens)}\`}>`
    containing `<WeeklyStrip cells={s?.cells ?? []} position={s?.position ?? r.position} percentileBasis={percentileBasis} />`
    with `s = stripByPlayer?.[r.player_id]`; an empty slot (`player_id == null`) renders `—`
    muted, not a strip.
- `LineupTable`/`LineupTableBody` props (l.383–401) and `rowProps` (l.404): thread
  `stripByPlayer = {}`, `usageTrendByPlayer = {}`, `percentileBasis = null`.
- Header l.473–475 → D7 text/title; `COLUMN_COUNT` stays 18.
- Header comment l.10–24: "LAST 3"/form → the weekly strip and usage trend.
- Legend (l.513–522): append to the usage paragraph:
  "Under SNAP, and under TARGET for a WR or TE and RUSH for an RB, a small grey trend shows that
  share week by week on a 0–100% scale; a dashed slot is a week with no observation (did not play,
  bye, or not loaded), a short stub a real zero." Add a new paragraph after it (same `span` classes):
  "{thisSeason ?? 'This season'} WEEKS has one bar per completed week: height is his points that
  week, colour is how that week ranked among this league's starters at his position — the same
  scale and cut-offs as the season grid below. Hatched is a bye, a red square at the top a week he
  did not play, a dashed slot a week that did not load. The three ticked bars are his last three
  played weeks."

### 11. Docs (same change)

- `docs/nav/components.md` l.11 (LineupTable): replace the last-3 sparkline/LAST 3 text with the
  strip (`col-weeks`, `stripByPlayer`, D5/D6) and the usage trend (`usageTrendByPlayer`); l.15
  (SeasonGrid): now renders a `grid` prop built by the hook; l.8 (WeekView): the new props; add a
  `dp/WeeklyStrip.jsx` row near the other `dp/` rows; note `VoidBar` is exported from
  `dp/SeriesBars.jsx` on that file's row if it has one.
- `docs/nav/utils.md` l.84: `buildGridGroups`/`buildStripByPlayer`, and that the hook (not
  SeasonGrid) is the caller; l.76: `buildWeeklyUsageTrend`; the `starterPercentiles.js` row:
  `basisView`.
- `docs/navigation.md` l.101: drop "last-3-played-weeks form", add `seasonGrid`/`stripByPlayer`/
  `usageTrendByPlayer` to the description and the returned-keys list; l.22: "form" → the weekly
  strip.
- Mechanism wording only (`docsAvailabilityClaims.test.js`).

## Tests

Each names the defect it catches and the fixture fact that makes its red step bite. Session 2 shows
each red by reintroducing the defect, then reverts.

**`src/utils/weeklySeasonGrid.test.js`**

- **S1 strip = grid.** Fixture: player `p1` (WR, KC), `currentWeek` 6. Schedule (complete): KC
  plays in weeks 1, 2, 3 and 5, bye in week 4. `weeklyMaps` holds weeks 1–4 only; week 5 is in
  `failedWeeks` and **absent from `weeklyMaps`** (as the hook does it). Weeks 1–2: `p1` rows with
  `gp: 1`. Week 3's row carries `stats: { rec: 5, rec_yd: 60 }` **with no `gp`** (points would be
  non-zero). The KC game in week 3 is what makes it `dnp`; the KC game in week 5 is what makes a
  dropped failed-week check read `dnp` rather than `unknown`. Build the grid with
  `buildGridGroups`+`buildSeasonGrid`, then `buildStripByPlayer(grid, 6)`. Asserts
  `strip.p1.cells` `toBe`-equal element-wise to the grid row's cells with `week < 6` (same objects)
  and kinds `[played, played, dnp, bye, unknown]`. Fails if the strip is derived separately with a
  points-based played test (week 3 would read `played`) or drops the failed-week check.
- **S2 strip excludes IR and current/future weeks.** Same fixture plus a reserve player; asserts no
  IR id key and every cell `week < currentWeek`. Fails if IR is included or the filter is `<=`.
- **S3 `buildGridGroups`** — moved verbatim; asserts the three keys in order and that an empty
  starter slot (`player_id: null`) is dropped. Fails if the move changed membership.

**`src/utils/weeklyUsage.test.js`**

- **S4 trend null-vs-zero.** Fixture WR `w1`, 4 played-week maps: wk1 `gp:1, off_snp:30,
  tm_off_snp:60, rec_tgt:5`, team pass_att 35; wk2 `gp:1, tm_off_snp:62` (**no `off_snp`**); wk3
  `gp:1, off_snp:20` (**no `tm_off_snp`**); wk4 absent (failed). `throughWeek` 4. Asserts
  `snap = [0.5, 0, null, null]` and `shareKind === 'target'`, `share[0] = 5/35`. Fails if an absent
  `tm_off_snp` is read as 0, an absent `off_snp` as null, or a missing week is skipped instead of
  held as a null slot (array would be length 3).
- **S5 trend matches the season cell.** Over S4's maps, asserts `share` and `snap` for the one
  observed week equal `computeUsageShares(accumulateUsage([thatWeek], id), pos)` — and for an RB
  fixture `shareKind === 'rush'`, for a QB `share === null`. Fails if a per-week formula is
  hand-written and position gating differs (e.g. QB gets a rush trend).

**`src/components/dp/WeeklyStrip.test.jsx`** (new)

- **S6 colour = scale of the position's basis.** Basis ready with `WR: { values: [0,5,10,15,20,…] }`
  (≥ 1 value) and `RB` a different array; cells for a played week of 15 pts, `position="WR"`.
  Asserts the bar's `style.backgroundColor === scaleCss(percentileOf(WR.values, 15))` and
  `data-pct`. Fails if the component picks the wrong basis entry or a different percentile. (The
  slot-vs-position wiring defect is caught at the LineupRow level by S10, not here.)
- **S7 bye/dnp/void are not bars.** Cells `[bye, dnp, unknown, played 0 pts]`. Asserts the bye slot
  has class `bg-dp-bye-hatch` and height 18; dnp has `bg-dp-missed`, height 5 and
  `align-self: flex-start`; unknown's `strip-slot` wrapper has inline height 0 and its first child a
  `1px dashed` border-top; none of the three `strip-slot`s has a
  `background-color` style; the 0-pt played slot has height 2 and a background colour. Fails if a
  non-played kind renders as a zero-height scale bar.
- **S8 last-3 emphasis.** Cells weeks 1–7: played, played, played, dnp, played, bye, played. Asserts
  `data-last3="true"` on exactly weeks 3, 5, 7 (count 3), not on 4 or 6, and the emphasis row's
  ticks at the same indices. Fails if "last 3" is taken as the last three weeks (5, 6, 7) or the
  last three slots.
- **S9a pending → neutral.** `percentileBasis={{ status: 'pending', basis: { WR: … } }}`: asserts
  no slot has an inline `background-color` and played bars carry `bg-dp-chip`, and that bar heights
  still render (> 0). Fails if pending colours with a stale basis or hides the bars.
- **S9b tooltip text.** Asserts `title`/`aria-label` `Wk 7 · 18.4 pts`, `Bye`, `Did not play`.

**`src/components/week/LineupTable.test.jsx`**

- Update fixtures l.19, l.29: delete `form: [null, null, null]`.
- Update `COLUMN_ORDER` l.150–151: last entry `'2026 WEEKS'` with `thisSeason={2026}` passed in
  that test (or `'WEEKS'` without); `IDS.usage` l.341: `col-last3` → `col-weeks`; existing T11 title l.347
  "LAST 3" → "WEEKS".
- **S10 strip wiring.** A row whose `slot` is `FLEX`, `position` `WR`;
  `stripByPlayer={{ p1: { position: 'WR', cells: [<played wk1, 15 pts>, <bye wk2>] } }}`;
  `percentileBasis` ready with a `WR` basis and a different `RB` basis (and no `FLEX` key). Asserts
  `col-weeks` contains `weekly-strip` with 2 `strip-slot`s, the played slot's
  `style.backgroundColor === scaleCss(percentileOf(WR.values, 15))` and its `data-pct`, and that no
  element in the table has text `LAST 3`. Fails if LineupRow passes `r.slot` (no basis → neutral,
  no colour), reads the wrong player key, or FormBars survives.
- **S11 trend placement.** `usageTrendByPlayer={{ p1: { snap: [0.5, null], share: [0.2, 0.3],
  shareKind: 'target' } }}`, WR row: asserts `usage-trend` inside `col-snap` and `col-target`, none
  in `col-rush`; for an RB fixture (`shareKind: 'rush'`) inside `col-rush`, not `col-target`; for an
  all-null series no `usage-trend`. Asserts SNAP's text still starts with the season `count · share`.
  Fails if the trend lands in the wrong column or replaces the printed number.
- **S12 ALLOWED / G keeps its bands (D1 guard).** Rows with `allowsRank` 28, 24, 15, 8, 3: asserts
  the value span's class contains `text-dp-up-text`, `text-dp-up`, `text-dp-text`, `text-dp-down`,
  `text-dp-down-text` respectively and has no inline `background-color`/`color` style; and that
  `col-implied`, `col-spread`, `col-yds`, `col-pace`, `col-proe` carry no inline style. Fails if the
  matchup columns are recoloured on the percentile scale.

**`src/components/week/SeasonGrid.test.jsx`** — mechanical: add a **module-level** helper named
`renderSeasonGrid({ starters = [], bench = [], reserve = [], weeklyMaps = [], failedWeeks = [],
scheduleIndex = null, projections = {}, scoringSettings = {}, currentWeek = 0, percentileBasis = null })`
that builds `grid` with `buildGridGroups` + `buildSeasonGrid` and renders
`<SeasonGrid grid={grid} percentileBasis={percentileBasis} />`. Replace the direct
`<SeasonGrid …>` renders at l.32, l.45, l.54 and l.137 with it. Keep the existing `renderGrid`
helper (l.64–68) with its signature, and change only its body to call `renderSeasonGrid`. Do not
add a second `renderGrid`. Assertions unchanged. Drop `form:` from `starterRow` (l.17). No red step
is needed (this is a non-behavioural move), but every existing assertion must stay as-is.

**`src/hooks/useWeeklyDecision.test.js`**

- Delete `buildLast3Form` from the import (l.5) and its `describe` (l.74–117).
- l.120–123: the `renderedPlayers` surplus-starter test stays as it is. It reads no usage/form map.
  Only its comment changes: "usage/form map" → "usage/trend maps".
- **S13 hook wiring.** Reuse the OURS-wiring `args` (l.198–219: `w1` WR on DAL, `currentWeek` 4,
  complete schedule with DAL games in weeks 1–3). Override `getWeeklyStatRows` with
  `mockImplementation((s, w) => Promise.resolve(w === 1 ? { w1: { team: 'DAL', stats: { gp: 1, rec: 3 } } } : {}))`,
  and restore the default in the test's own `finally` (or the file's `afterEach`):
  `getWeeklyStatRows.mockImplementation(() => Promise.resolve({}))`. `vi.clearAllMocks()` does not
  reset implementations, so without this the week-1 row leaks into later hook tests.
  Asserts `result.current.stripByPlayer.w1.cells` has length 3, each element `toBe` the
  corresponding cell of `result.current.seasonGrid` (group `starters`, row `w1`), kinds
  `['played', 'dnp', 'dnp']`. Also asserts
  `result.current.usageTrendByPlayer.w1.snap` has length 3 (the trend loop runs over the same
  rendered set). Fails if the hook builds the strip from a separate grid call: the cells would be
  equal but not identical. (Feeding `playedWeeklyMaps` to the grid is not distinguishable with this
  fixture; it is excluded by §4's explicit `weeklyMaps` instruction and checked in review.)

**`src/utils/weeklyLineup.test.js`** — l.85: delete the `form` assertion; l.290–301 describe
"form with fewer than three played weeks": delete (behaviour removed). Remove `formByPlayer` from
fixtures. **`src/utils/weeklyMatchup.test.js`** l.54: remove `formByPlayer: {}`.
**`src/components/week/DefencesFaced.test.jsx`** l.15, l.24 and **`src/components/week/WeekView.test.jsx`**
l.63: delete `form: [null, null, null]` from the row fixtures (the key no longer exists).

**Test numbering.** New tests are labelled S1–S13 in their `it(...)` titles (e.g.
`'S10 strip wiring …'`). They must not reuse the existing LineupTable `T10` (columns, l.153) or
`T11` (views, l.347) labels. Those two keep their T-labels and get only the edits listed above.

**`src/__tests__/` guards** — run `teamContextViewOnly`, `advStatsViewOnly`, `docsAvailabilityClaims`,
`crossRepoIndex`, `claudeMdSize` (all in `npm test`). No factors/stat-key change.

## Done-definition notes

- `grep -rn "PROVISIONAL(" src/` output in the hand-back (two new tags in `WeeklyStrip.jsx`).
- `grep -rn "buildLast3Form\|formByPlayer\|FormBars\|LAST 3\|col-last3\|form: \[null" src docs` → no hits.
- Lint 0, build clean.

## Screenshots (Session 2; preview config in `.claude/launch.json`)

Before (at `8281f3a`, captured first) and after, 1440×900 and 375×812, on This week in Matchup,
Usage & form and All; one lineup row zoomed whose strip contains a bye and a missed week; one
deuteranopia simulation of Usage & form using W2b-1's method (CSS/SVG filter on the page —
reuse whatever W2b-1's verification record names). A screenshot is not sign-off; report what was
seen (render, no `NaN`, no collapsed layout, phone frozen block unchanged).

## Out of scope

My Team (Brief M3 reuses `WeeklyStrip` later); Market; matchup-column colour (D1); W2a's phone
scroll window, edge shade, PROJ-in-All; W2b-2's widths; any data, scoring, snapshot or cross-repo
change. `docs/cross-repo-registry.md` has no entry for any file touched (grep at `8281f3a`); if
Session 2 finds one, stop and report. A design question this file does not answer → stop and ask.

Touches scoring / snapshot / cross-repo index: no.

## Fix pass 1

From the implementation-reviewer run (full depth) on `8281f3a..d51fd2e`. Tests only; no source
change. Each new or changed test must be shown red with its defect temporarily reintroduced, then
reverted.

1. **S12, a test that passed vacuously** (`src/components/week/LineupTable.test.jsx`, the
   `'S12 ALLOWED / G keeps its bands…'` test). It currently renders without `matchupCols`, so
   IMPLIED/SPREAD/YDS ALLOWED/PACE/PROE take their `DASH` early-return. Render the
   no-inline-style half of the test with
   `matchupCols={{ p1: { implied: 24, impliedBaseline: 22, impliedBaselineWeeks: 3, spread: -3, yards: { kind: 'pass', current: 231, prior: 240, priorSeason: 2025 }, pace: { value: 27.4, rank: 3, of: 32 }, proe: { value: 0.03, rank: 1, of: 32 } } }}`
   (using the row id the test already uses). First assert each of the five cells renders its
   value, not `—`. Then assert that no element inside `col-implied`, `col-spread`, `col-yds`,
   `col-pace` or `col-proe` (the td and all descendants) carries an inline `background-color` or
   `color`. Red step: temporarily add `style={{ backgroundColor: 'rgb(1, 2, 3)' }}` to the value
   div in `ImpliedCell`, confirm red, revert. Leave the ALLOWED / G band assertions as they are.
2. **The WeeklyStrip no-basis branch has no test** (`src/components/dp/WeeklyStrip.test.jsx`).
   Add `S9c`: `percentileBasis={{ status: 'ready', basis: { RB: { values: [0, 10, 20], n: 3, season: 2026, source: 'live' } } }}`,
   `position="WR"`, one played cell. Assert the bar carries `bg-dp-chip`, has no inline
   `background-color` and no `data-pct`, and has height > 0. Red step: temporarily make the branch
   fall back to any available basis (e.g. `Object.values(basis)[0]`), confirm red, revert.

Leave alone: all source files, every other test, and the docs.

Accepted, not fixed (sent to Anton):
- **Screenshots at about 800px, with a self-chosen colour-blindness filter.** The Browser pane
  cannot render 1440px here. The desktop-width look, and the colour-blindness check by W2b-1's
  method, go to Anton's in-app check in the sign-off request.
- **Deviation 4** (WeekView's failed-weeks notice still says "form"). It is still true in
  substance: a week that failed to load shows as a dashed slot in the strip. Left as is.

## Verification

Session 1 (opus), 2026-11-20.

- Implementation: `d51fd2e` (Session 2, sonnet). Fix pass 1: `b92e095` (fix-applier, tests only).
- implementation-reviewer, full depth (opus/high), on `8281f3a..d51fd2e`: 3 flags.
  - S12 matchup-colour guard passed vacuously (no `matchupCols`). Fixed in Fix pass 1, item 1.
  - The WeeklyStrip no-basis branch had no test. Fixed in Fix pass 1, item 2 (S9c).
  - Screenshots were taken at about 800px with a self-chosen colour-blindness filter. Accepted: the
    pane cannot render 1440px. Desktop width and the colour-blindness check go to Anton's in-app
    check.
- Fix-pass re-review, light depth, on `d51fd2e..b92e095`: no blocking issues found.
- Session 2's deviations: 1–3 accepted. 4 (WeekView's failed-weeks notice still says "form")
  accepted as is.
- Checks at `b92e095`: `npm test` 190 files / 3643 tests pass, lint 0 problems, build clean (the
  existing chunk-size notice only). Every new test was seen red, including S9c and the strengthened
  S12.
- Two new PROVISIONAL(no-data) tags (`WeeklyStrip.jsx`). No scoring, snapshot or cross-repo-index
  change. Backlog lines: none.

Signed off by Anton 2026-11-20
