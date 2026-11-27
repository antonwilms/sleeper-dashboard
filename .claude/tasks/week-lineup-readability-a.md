# This Week lineup readability — Slice A: pace text, one view, taller player column (brief items 1, 5, 7)

Review depth: light — view-only UI, copy, docs and tests: no `projectedPPG`/dynasty/`factors`/scoring
input, no `docs/cross-repo-registry.md` site (grep of the registry for `metricGlossary`, `LineupTable`,
`cells.jsx`, `TeamOffences`, `EnvironmentSection`, `pace`, `neutralSeconds`: no hits), no state moved, no
new hook or dependency, no `playerRows` step, no TTL, no snapshot capture.

Source: Anton's handoff brief "This Week lineup table: readability & usage pass" (2026-11-27). App repo
only. Display-only. Sliced A → B → C per the brief; B and C are outlined at the end and planned only after
A is implemented and verified.

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a backgrounded `npm run dev`,
and stops it when done.

**Copied definitions created by this slice: none.** §1 removes two hand-written copies of the pace
definition (LineupTable header title, TeamOffences popover gloss) by importing `GLOSSARY.pace.definition`.
The LineupTable legend sentence is prose, reworded (not a copy) and guarded by T1b.

---

## 0. Pre-checks done in planning (Session 1, 2026-11-27, HEAD `d78e7ee`)

Every brief anchor re-read against live source:

- `src/utils/metricGlossary.js:99` — `pace: { label: 'Pace', definition: 'Seconds per play in neutral
  game situations (lower is faster).' }`. Confirmed.
- **Consumers of the pace *definition*** (grep `-i "seconds per play"` over `src/`, plus every importer of
  `metricGlossary`): exactly five sites —
  1. `metricGlossary.js:99` (the entry itself);
  2. `src/components/dp/EnvironmentSection.jsx:11,19–20` — `g('pace')` reads `GLOSSARY.pace.definition`
     as its `note` (player-detail Environment). Follows the glossary automatically;
  3. `src/components/week/LineupTable.jsx:458` — PACE header `title`, hand-written copy;
  4. `src/components/week/LineupTable.jsx:509` — legend sentence, hand-written prose;
  5. `src/components/portfolio/TeamOffences.jsx:136` — PACE header `DefinitionPopover` `gloss`,
     hand-written copy.
  The brief's "Market filter" is **not** a consumer of the definition: `market/FilterPanel.jsx:300` renders
  only the label `"Team pace"`, no text. `teams/TeamDetail.jsx:33–36` renders label `PACE` and
  `directionLabel: 'LOWER IS BETTER'`, no definition. Neither changes. (`docs/design_brief_v2/README.md:349`
  says "seconds per play" — a dated design doc, out of scope.)
- **Pace mechanism, verified in the sibling** (`sleeper-dashboard-data/lib/nflverse.mjs:1328–1347`, read
  only): a gap is `prev.gameSecondsRemaining − gameSecondsRemaining` between consecutive countable scrimmage
  snaps of the same offence **within one drive** (`paceKey = gameId|posteam|fixed_drive`), counted only
  when both snaps are neutral (`wp` 0.2–0.8, `qtr <= 3`, `half_seconds_remaining > 120`) and
  `5 <= gap <= 45`; any non-countable row breaks the chain. App side `environment.js:74` —
  `pace: ratio(sums.neutralSeconds, sums.neutralGaps)` (components summed, divided once). The new text below
  matches this.
- **Glossary rule** (`src/__tests__/metricGlossary.test.js:165–168`): every definition ends with `.` and
  contains no `". "` (one sentence). The new definition obeys both.
- **Lens anchors**: `LineupTable.jsx:2–3` imports `LensSwitch`, `lensHidden`; `:31–37` `LINEUP_LENSES`;
  `:403` `useState('matchup')`; `:405` `lens` in `rowProps`; `:414–416` `<LensSwitch …label="Lineup
  columns" />`; `lensHidden(...)` at `:52, 108, 116, 175, 368` and on headers `:433–474`; the `lens` prop is
  threaded through `UsageCell`, `AllowsCell`, `MatchupTd`, `ImpliedCell`, `SpreadCell`, `YardsCell`,
  `RankedCell`, `LineupRow`. `useState` has no other use in the file. `dp/lens.js` and `LensSwitch`
  (`dp/cells.jsx`) are also used by `portfolio/Portfolio.jsx` — both stay.
- **Lens tests**: only `LineupTable.test.jsx:380–415` (`describe('… column views and status beside the
  name')`, test `T11 Matchup is the default view…`, helpers `hidden`, `IDS`, `cellsOf`, `pick`). No
  `WeekView*.test.jsx` references the switch. Portfolio lens tests untouched.
- **Player cell**: `dp/cells.jsx:93–132` `PlayerCell({ row, marker, sub, footer, showPosition,
  photoFromMd, className, subTruncate, subTitle })`; watermark `<TeamLogo team={row.nfl_team} size={44} />`
  at `:106`. `TeamLogo` (`dp/SleeperImages.jsx:62`) sets `width`/`height` attrs and inline size from `size`.
  The sub-line `div` renders `{abbr}` then ` · {subContent}`.
- **This Week player cell today** (`LineupTable.jsx:293–327`): `sub={<RankLine …/>}`, `subTruncate`,
  `subTitle={`${team} · ${rankLineText} — rank by total points…`}`, `footer` = start/sit flag. The one-line
  truncating rank sub-line (up to `2025 WR14 · WR11/g · 2026 WR8 · WR5/g · #31 · #20/g overall`) is what
  sets the column's desktop width (`PLAYER_CELL_PHONE_CAP` = `max-w-[168px] md:max-w-none`).
- **Depth**: `weeklyLineup.js:118–120` builds `r.depth = { position: depth_chart_position, order:
  depth_chart_order }` (null unless both are set). **Brief correction:** the brief says existing consumers
  use the "position+order" form — they use the *slot code*: `Portfolio.jsx:528–529` ROLE renders
  `${depth_chart_position}${depth_chart_order}` (e.g. `LWR2`), and the BACKUP chip title
  (`LineupTable.jsx:305`) is `Depth chart: ${r.depth.position}${r.depth.order}`. Per Anton's decision in the
  brief, the new label uses the **fantasy position** (`r.position`) + `r.depth.order`, matching only their
  *formatting* (concatenated, no space: `WR2`). The existing test `LineupTable.test.jsx:323–330` ("the raw
  depth entry never appears in text") already asserts `LWR2` never shows as text — it stays and now also
  guards this decision.
- **Rank-line tests that read the sub-line** (all in `LineupTable.test.jsx`): `P1-T1` (`:265–280`, asserts
  `truncate` + title), `lineOf` helper (`:283`) used by `LT-1`, `LT-2`, `LT-3`, `T4c` (`:303–313`),
  `T9` (`:511–521`), `T11` (`:676–702`, `sub.textContent` contains the rank line). These are rewritten in §4
  because the rank line intentionally moves.
- **Width tests that must stay green unchanged**: `W-fix F2` (`:722–737`), `T13` (`:742–757`), `M3 W2`
  (`:900–909`) — `PlayerCell` root keeps `min-w-0 max-w-[168px] md:max-w-none`, text column keeps
  `min-w-0 flex-1` and no `max-w-`/`w-[`.

---

## 1. Pace definition (brief item 1)

### 1.1 `src/utils/metricGlossary.js:99`

Replace the `pace` definition with exactly:

```
Game-clock seconds between a team's consecutive snaps within a drive while the game is close (win probability 20–80%, quarters 1–3, over two minutes left in the half) — lower is faster, so more plays; compare ranks, not raw seconds, which run a few seconds above public pace stats.
```

(One sentence, ends with `.`, no `". "`. Label `Pace` unchanged — `ENV_LABEL_PINS` stays green.)

### 1.2 `src/components/week/LineupTable.jsx` PACE header (`:456–461`)

Import `GLOSSARY` from `../../utils/metricGlossary`. Title becomes:

```js
title={`His team's pace, ${thisSeason ?? 'this season'} so far (nflverse team context): ${GLOSSARY.pace.definition} Rank 1 is the fastest.`}
```

The cell format (`${v.toFixed(1)}s`, `RankedCell`) is unchanged.

### 1.3 LineupTable legend (`:509–510`)

Replace `PACE is his team&rsquo;s seconds per play in neutral situations and PROE its pass rate over
expected` with `PACE is the game-clock seconds between his team&rsquo;s snaps within a drive while the game
is close (lower is faster; compare the rank, not the seconds) and PROE its pass rate over expected`. Rest of
the paragraph unchanged.

### 1.4 `src/components/portfolio/TeamOffences.jsx:136`

Import `GLOSSARY` from `../../utils/metricGlossary`. `gloss` becomes
`` `${GLOSSARY.pace.definition} Blue = the eight fastest.` ``. `field` unchanged.

Nothing else reads the definition (§0). `EnvironmentSection.jsx` and `TeamDetail.jsx` are not edited.

---

## 2. Only the "All" view on This Week (brief item 5)

All edits in `src/components/week/LineupTable.jsx`:

- Delete `LINEUP_LENSES` (`:31–37`) and its comment.
- Imports: drop `LensSwitch` from the `../dp/cells` import (keep `ClickableRow`, `PlayerCell`,
  `StatusChip`); delete the `lensHidden` import (`:3`); `import { Fragment } from 'react'` (drop `useState`).
- `LineupTableBody`: delete `const [lens, setLens] = useState('matchup')`, drop `lens` from `rowProps`,
  delete the `<div className="ml-auto"><LensSwitch …/></div>` block (`:414–416`). The header row keeps the
  title and the subtitle span.
- Remove the `lens` parameter and every `${lensHidden(…, lens)}` interpolation from `UsageCell`,
  `AllowsCell` (both branches), `MatchupTd`, `ImpliedCell`, `SpreadCell`, `YardsCell`, `RankedCell`,
  `LineupRow` (signature and every `lens={lens}` it passes) and the `col-weeks` `<td>`; and from every
  `<th>` (`:433–474`). Remove the trailing space each interpolation leaves inside the `className` template
  (e.g. `` `px-2.5 py-2.5 text-right ${lensHidden('usage', lens)}` `` → `"px-2.5 py-2.5 text-right"`).
  No column, header text, column order or `COLUMN_COUNT` (18) changes.
- Header comment (`:16–29`): replace "then one column view at a time — Matchup (…) / Usage & form / All
  (LINEUP_LENSES below; week-w2a-lineup-matchup-layout.md)" with "then the matchup columns (IMPLIED, SPREAD,
  ALLOWED / G, YDS ALLOWED, PACE, PROE) and the usage columns, all always shown (one view since
  week-lineup-readability-a.md)". Delete the `:31–32` "Column views…" comment with `LINEUP_LENSES`.
- `dp/lens.js` and `dp/cells.jsx`'s `LensSwitch` are **not** edited.

---

## 3. Player column — taller, narrower, depth label (brief item 7)

### 3.1 `src/components/dp/cells.jsx` `PlayerCell` — opt-in watermark size

Add prop `watermarkSize = 44` to the destructured signature (after `subTitle`), and pass it:
`<TeamLogo team={row.nfl_team} size={watermarkSize} />`. Nothing else in `PlayerCell` changes; no other
call site passes it, so every other table renders exactly as before.

### 3.2 `src/components/week/LineupTable.jsx` — new pieces

```js
// Brief item 7 — the depth label: fantasy position + Sleeper depth order (e.g. WR2), never the
// slot code (LWR/SWR/RWR), which would read as a formation role. Null when the row has no depth.
export const DEPTH_LABEL_TITLE = "Sleeper's current depth chart — can change week to week; up to a day old."
function depthLabel(r) {
  return r.depth != null && r.position != null ? `${r.position}${r.depth.order}` : null
}
export const LINEUP_WATERMARK_SIZE = 64
```

(`DEPTH_LABEL_TITLE` and `LINEUP_WATERMARK_SIZE` are exported only so tests can import them; nothing else
imports them.)

`RankLine` becomes `RankLines` — one block per segment, stacked:

```jsx
function RankLines({ r, lastSeason, thisSeason }) {
  const segs = rankSegments(r, lastSeason, thisSeason)
  const title = `${rankLineText(r, lastSeason, thisSeason)} — rank by total points, then by points per game (min ${PPG_RANK_MIN_GAMES} games), in this league's scoring; overall is among QB, RB, WR and TE`
  return (
    <div data-testid="rank-lines" title={title} className="text-[11px] leading-snug text-dp-text-4">
      {segs.length === 0
        ? <div data-testid="rank-line" className="truncate">{r.position}</div>
        : segs.map(s => (
          <div key={s.key} data-testid="rank-line" className="truncate">
            {s.label}
            <RankPair prefix={s.prefix} rank={s.rank} rankPpg={s.rankPpg} title={null} rankClassName="text-dp-text-2" ppgClassName="text-dp-text-4" />
            {s.tail}
          </div>
        ))}
    </div>
  )
}
```

`rankSegments` and `rankLineText` are unchanged. `Fragment` stays imported only if still used; if not,
drop it (lint will say).

### 3.3 The `PlayerCell` call (`:293–327`)

- `sub`: `depthLabel(r) != null ? <span data-testid="depth-label" title={DEPTH_LABEL_TITLE}>{depthLabel(r)}</span> : null`.
  With `null` the sub-line shows only the team abbreviation (`PlayerCell` renders `{abbr}` and skips
  ` · ` when `subContent` is `null`).
- Delete `subTruncate` and `subTitle` from the call (the sub-line is now short; the rank tooltip moves to
  `rank-lines`).
- `watermarkSize={LINEUP_WATERMARK_SIZE}`.
- `footer`: a fragment — `<RankLines …/>` first, then the existing start/sit flag block unchanged (same
  `id`, test id, classes `text-[10.5px] text-dp-down-text w-0 min-w-full`, title, and its W-fix D1
  comment). Add `mt-0.5` to the flag's `className` only if the smoke shows it touching the last rank line —
  otherwise leave classes exactly as they are (tests pin `w-0`/`min-w-full`).
- `marker` (status chip, BACKUP chip with its PROVISIONAL tag and `Depth chart: ${r.depth.position}${r.depth.order}`
  title) unchanged.

Result per filled row: name + chips · `KC · WR2` · one line per rank segment · start/sit flag. The column's
desktop width is now the widest of the name line and the single rank segments (`#31 · #20/g overall`),
not the joined line. `PLAYER_CELL_PHONE_CAP` and `className={PLAYER_CELL_PHONE_CAP}` unchanged; on phone
the per-line `truncate` keeps each rank line inside the 168px cap.

### 3.4 Legend (`:534–541`)

In the "Under each name" paragraph, after the first sentence's `(the same basis as My Team’s position
ranks).`, insert: `Beside the team, his spot on Sleeper&rsquo;s current depth chart at his position (WR2 is
his team&rsquo;s second WR) &mdash; it can change week to week and may be up to a day old.` Rest unchanged.

---

## 4. Tests

All in existing files unless stated. Each names the defect it catches and its red step. Session 2 shows
each new/changed test red on that mutation, then reverts.

**T1a — new file `src/__tests__/paceDefinition.test.js`.** `import { GLOSSARY } from
'../utils/metricGlossary'`. Asserts `GLOSSARY.pace.definition` contains `between`, `snaps`, `within a
drive`, `20–80%` and `compare ranks`, and does not match `/per play/i`. *Fails if* the old "seconds per
play" meaning survives. *Red:* restore the old definition string.

**T1b — same file.** Walks every `.js`/`.jsx` under `src/` (node `fs`, recursive), skipping
`*.test.*` files and `src/__fixtures__/`, and asserts none matches `/seconds per play/i` (report the
offending paths). *Fails if* any hand-written copy of the old wording remains (LineupTable header or legend,
TeamOffences gloss). *Red:* restore `TeamOffences.jsx:136`'s old gloss.

**T1c — `LineupTable.test.jsx`, new `describe('LineupTable — pace text reads the glossary')`.** Renders
`<LineupTable starters={[row()]} bench={[]} thisSeason={2026} />`; the `<th>` whose text is `PACE` has a
`title` containing `GLOSSARY.pace.definition` and `Rank 1 is the fastest`; the legend text (whitespace
collapsed) contains `between his team’s snaps within a drive`. *Fails if* the header keeps its own copy or
the legend keeps the old sentence. *Red:* restore the old header title.

**T1d — `TeamOffences.test.jsx`, new `it` in a new `describe('TeamOffences — PACE gloss reads the
glossary')`.** `renderRows([baseRow()], { inSeason: true, liveSeason: 2025 })`;
`fireEvent.click(screen.getByRole('button', { name: /^PACE/ }))`; `screen.getByRole('dialog').textContent`
contains `GLOSSARY.pace.definition` and `Blue = the eight fastest.` *Fails if* the popover keeps a
hand-written definition. *Red:* restore the old gloss literal. (If `name: /^PACE/` matches more than one
button, Session 2 stops and reports rather than loosening the query.)

**T2 — replaces `T11 Matchup is the default view…` (`LineupTable.test.jsx:393–415`).** New name: `T11
one view: no column switch; every cell and header is visible`. Keep `hidden`, `IDS`, `cellsOf`; delete
`pick`. Render the same fixture (`r1()` + `matchupCols`). Assert: `queryByRole('group', { name: 'Lineup
columns' })` is `null`; no element in the table has an `aria-pressed` attribute; for every id in
`[...IDS.fixed, ...IDS.matchup, ...IDS.usage]` the body cell exists and `hidden(cell)` is `false`; every
`thead th` has `hidden(th) === false`. Rename the enclosing `describe` to `'LineupTable — one view and status
beside the name'`. *Fails if* a lens is reintroduced, or any group still starts hidden. *Red (two, each shown):* (i) append ` hidden` to `MatchupTd`'s
class string — the visibility loop fails; (ii) restore the `<LensSwitch …/>` block with a local
`useState('all')` — the `queryByRole` assertion fails.

**T3 — `P1-T1` (`:265–280`) rewritten.** Rename the `describe` to `'LineupTable — sub-line is team and
depth only'` and the `it` to `P1-T1 the starter sub-line does not truncate and carries no rank title; a
default PlayerCell is unchanged`. For the starter: `sub.classList.contains('truncate')` is `false`,
`sub.hasAttribute('title')` is `false`, `sub.textContent` does not contain `2025`. Keep the plain
`PlayerCell` half exactly. *Fails if* the rank line stays in the sub-line. *Red:* pass `subTruncate` back
on the This Week call.

**T4 — `lineOf` helper and LT-1/LT-2/LT-3/T4c/T9/T11 updated to the stacked lines.** Replace `lineOf` with
`const linesOf = c => [...c.querySelectorAll('[data-testid="rank-lines"] [data-testid="rank-line"]')].map(el => el.textContent)`.
- LT-1: `linesOf` equals `['2025 WR14 · WR11/g', '2026 WR8 · WR5/g', '#31 · #20/g overall']`;
  `rank-lines` holds 3 `rank-pair`s. *Fails if* segments stay on one line or reorder. *Red:* render all
  segments into a single `rank-line` div.
- LT-2: one-segment case → `['2025 WR14 · —/g']`; `ranks: null` → `['WR']`.
- LT-3: `rank-lines`'s `title` starts with `linesOf(...).join(' · ')`, contains `rank by total points, then
  by points per game`, and `rank-lines` contains no descendant with a `title`. *Fails if* the tooltip
  drifts from the visible lines.
- T4c: same contrast loop over the pairs under `[data-testid="rank-lines"]` (3 pairs, 2 spans each), plus
  the `rank-lines` wrapper itself (the `rank-line` divs carry no colour class and inherit its
  `text-dp-text-4`, so the wrapper is the element `minWatermarkContrast` can read) clears 4.5:1. *Fails if* a rank line uses a token
  that fails over the bigger watermark. *Red:* change the wrapper to `text-dp-muted-2`.
- T9: index of `2025 ` precedes `2026 ` in `linesOf(...).join(' | ')`.
- T11 (`:676–702`): replace the `sub.textContent` / `sub` title assertions with: `rank-lines` text equals
  the three lines above, and the start/sit flag follows `rank-lines` in document order
  (`rankLines.compareDocumentPosition(flag) & Node.DOCUMENT_POSITION_FOLLOWING`). Every other assertion in
  T11 unchanged.

**T5 — new `describe('LineupTable — depth label (brief item 7)')` in `LineupTable.test.jsx`.**
- a) `row({ position: 'WR', depth: { position: 'LWR', order: 2 } })` → `depth-label` text is `WR2`, its
  `title` equals `DEPTH_LABEL_TITLE`, it is inside `player-cell-sub`, and the sub-line text is `KC · WR2`.
  *Fails if* the label uses the slot code or lands outside the sub-line. *Red:* render
  `${r.depth.position}${r.depth.order}`.
- b) `row({ depth: null })` → no `depth-label`; sub-line text is exactly `KC`. *Fails if* a fabricated
  label or a dangling ` · ` renders. *Red:* make `depthLabel` return `` `${r.position}?` `` for null depth.
- c) a bench row with depth (`row({ slot: 'BN', player_id: 'b1', position: 'RB', depth: { position: 'RB',
  order: 1 } })` in `bench`) renders `RB1`. *Fails if* the label is starters-only.

**T6 — watermark size.**
- `LineupTable.test.jsx`: a filled row's `[data-testid="team-watermark"] [data-testid="team-logo"]` has
  `width` attribute `String(LINEUP_WATERMARK_SIZE)` and `LINEUP_WATERMARK_SIZE > 44`. *Fails if* This Week
  keeps the default size. *Red:* drop `watermarkSize` from the call.
- `src/components/dp/cells.test.jsx`, new `it` beside T2: a default `<PlayerCell row={{ full_name: 'X',
  nfl_team: 'KC', position: 'WR' }} />` watermark logo has `width="44"`. *Fails if* the default changes for
  the ~20 other call sites. *Red:* change the default to 64.

**Unchanged and must stay green:** W-fix F1/F2, T13, M3 W2, T12, T10 (18 columns), T4b, "the raw depth
entry never appears in text", "backup:false renders no chip", `metricGlossary.test.js` (one-sentence rule),
Portfolio lens tests, EnvironmentSection tests.

---

## 5. Docs (same change)

- `docs/nav/components.md:11` (`week/LineupTable.jsx` row): delete "in the usage group so it shows in
  Usage & form and All" and the sentence "A `LensSwitch` (`dp/cells.jsx`) shows Matchup (the default),
  Usage & form or All — every cell stays in the DOM with `hidden` on the inactive groups, the switch's state
  is view-local."; add "Every column always shows (one view)." Replace the "Under each name: …the
  sub-line's tooltip carries the full line)" description with: the sub-line is the team abbreviation and,
  when `depth` is set, the depth label `{position}{order}` (fantasy position, e.g. `WR2`; tooltip says it is
  Sleeper's current depth chart, up to a day old); below it the rank segments stacked one per line
  (`rank-lines`, same segment rules, tooltip carries the joined line), then the start/sit flag; the team
  watermark is `LINEUP_WATERMARK_SIZE` (64px). Replace "the rank line is the cell's sub-line and the
  start/sit flag its footer" with "the depth label is the cell's sub-line; the rank lines and the start/sit
  flag are its footer".
- `docs/nav/components.md:30` (`dp/cells.jsx` row): add `watermarkSize` (default 44) to the `PlayerCell`
  signature and "the team's logo as a 0.12-opacity watermark (`watermarkSize`, default 44px)".
- `docs/nav/components.md:31` (`dp/lens.js` row): "Used by `Portfolio.jsx` and `week/LineupTable.jsx`" →
  "Used by `Portfolio.jsx`".
- No CLAUDE.md, signal-registry or cross-repo-registry change (no module added/renamed, no signal).
- `npm test` includes `docsAvailabilityClaims.test.js`; the new doc text states mechanism only.

---

## 6. Nothing else

No change to `weeklyLineup.js` (depth already reaches the row), `dp/lens.js`, `LensSwitch`, `Portfolio.jsx`,
`EnvironmentSection.jsx`, `TeamDetail.jsx`, `FilterPanel.jsx`, `WeeklyStrip.jsx`, `UsageCell`'s content or
any usage/matchup computation. No `PROVISIONAL(` tag added or removed (the BACKUP and OURS tags stay).

---

## 7. Smoke (Session 2) and what Anton checks in the app

Session 2: `/week` loads with no console errors; no column switcher; all 18 columns present with the
frozen slot + player columns scrolling correctly; a filled row shows name · `TEAM · WRn` · stacked rank
lines; an empty slot still reads `Empty`; PACE header tooltip shows the new text; My Team's offences PACE
popover and the player pop-up's Environment "Pace" note show the new text; phone width (375) keeps PROJ in
view. Report what was seen.

Anton checks:
- No column switcher on This Week; every column visible, player column frozen.
- Player column narrower, rows taller, team logo bigger, depth label (e.g. `WR2`) beside the team for
  starters.
- PACE tooltip (This Week header, My Team offences, player pop-up) explains it as seconds between snaps.

---

## 8. Open items to surface at sign-off

- The depth label deliberately differs from My Team's ROLE column and the BACKUP chip title, which show the
  slot code (`LWR2`). Unifying them is not in this slice.

---

## Later slices (outline only — plan after Slice A is implemented and verified)

**Slice B — week strips (brief items 2, 3). Medium; independent of A, sequenced after it.**
`src/components/dp/WeeklyStrip.jsx` (also rendered by `portfolio/Portfolio.jsx` — intended): dnp → small red
× on a new faint baseline; bye → short hatched stub on the baseline; played bars on a fixed per-position
height scale from `percentileBasis` (a high quantile via `starterPercentiles.js`'s `quantile`, clamped;
own-max fallback when the basis is pending/absent — quantile chosen when planning B); last-3 ticks replaced
or dropped (keep `data-last3` semantics if tests rely on it); WEEKS header title states the colour meaning.
`UsageCell`'s share trend (`weeklyUsage.js`'s `buildWeeklyUsageTrend`, `SeriesBars`) gains the same slot
vocabulary, slot kinds sourced from the same `weeklySeasonGrid.js` cells as the strip; fixed 0–100% domain;
`gp !== 1` never renders a 0 bar. Depends on nothing in A except the lens-free `UsageCell` signature.

**Slice C — usage colouring + TD column (brief items 4, 6). Largest; likely `full` (new derived ranking
pool).** League-starter percentile colouring of SNAP/RUSH/TARGET/TOUCH/RZ RUSH/RZ TGT shares: a new
per-position, per-share-kind basis over league starters' season-to-date shares (same played-weeks window,
sum components and divide once, `MIN_POOL_SAMPLES`, neutral when the pool is small, `scaleCss`), shares that
don't apply uncoloured, one legend line. New TD column: RB/WR/TE `rush_td + rec_td` · share of team
rush + receiving TDs; QB `pass_td + rush_td` count only. Team TD totals via `buildTeamAggregates` only after
verifying `TEAM_<abbr>` rows carry `rush_td`/`rec_td` in cached data or a fixture, else summed player rows.
Extends `accumulateUsage`/`computeUsageShares`/`computeUsageCounts`. Depends on Slice B only for cell layout
(B changes `UsageCell`'s trend), so plan after B.

---

## Plan review

plan-reviewer, depth light (sonnet, frontmatter), 2026-11-27: "No blocking issues found." Size 25,504
bytes. Log: `.claude/reviews/week-lineup-readability-a.plan-reviewer.md`. Approved by Anton 2026-11-27.

## Verification

Session 1, 2026-11-27, on `065f53d` (diff `d78e7ee..065f53d`).

- **implementation-reviewer**, depth light (sonnet, frontmatter), round 1 on the diff: "No blocking
  issues found." No fix pass; no re-review needed.
- **Session 1 diff read**: `metricGlossary.js` pace entry, `TeamOffences.jsx` gloss, `cells.jsx`
  `watermarkSize`, and `LineupTable.jsx` (no `lens` left in the file; `RankLines`, `depthLabel`,
  `DEPTH_LABEL_TITLE`, `LINEUP_WATERMARK_SIZE`, footer order rank lines → flag) match §1–§3.
- **Checks re-run by Session 1**: `npm test` 199 files / 3782 tests green · `npm run lint` 0 problems ·
  `npm run build` clean apart from the pre-existing >500 kB chunk notice.
- **Deviations accepted**: Session 2 ran on Opus (model picked on the session card, not by the plan; no
  effect on the work); T11 (W2b-2) and T4c assert slightly more than specified; `mt-0.5` not added to the
  start/sit flag (no flags this week to judge spacing — Anton checks when one appears). Substitute red steps
  for LT-2, LT-3, T9, T11 (W2b-2) and T5c each trigger the named defect.
- **PROVISIONAL inventory**: 49 lines, unchanged from `d78e7ee`.
- **Smoke (Session 2)**: `/week` — no switcher, 18 headers, nothing hidden, rows read `WAS · QB1` with
  three stacked rank lines and a 64px logo, player column 267px, no console errors, PROJ in view at 375px.
  New pace text seen in the This Week header, My Team offences popover and pop-up Environment popover.
- **Open items**: depth label `WR2` differs from My Team ROLE / BACKUP tooltip slot codes (`LWR2`) by
  design; bench QB Joe Milton shows `PHI · QB1`, which is what Sleeper's depth entry says.
