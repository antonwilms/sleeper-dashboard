# Pop-up "Usage & efficiency" card — three display fixes (one slice)

Review depth: light — view-only display fixes, no scoring/snapshot/cross-repo

Trigger check: nothing here touches `src/utils/usageEfficiency.js` or any computed value (ranks, pools,
percentiles, gates), `projectedPPG`, the dynasty score, a `factors` key, fantasy-point scoring,
`projectionSnapshot.js`, App.jsx state, or any `docs/cross-repo-registry.md` contract. The one shared-component
change (`DefinitionPopover`'s new opt-in `strategy` prop, §2) leaves every existing caller's rendered output
unchanged — its default branch is today's markup byte-for-byte.

Follow-up to `.claude/tasks/usage-efficiency-redesign.md` (shipped `b0d535f`). Decided by Anton 2026-11-25.

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a backgrounded `npm run dev`, and
stops it when done.

Copied definitions created by this slice: **none**. The `256` in §2.2 is the popover's own `w-64` width, read
in the same file; it is not a copy of a definition elsewhere.

---

## 0. Pre-checks done in planning (Session 1, 2026-11-25)

1. **Header vs legend source.** `PlayerDetailModal.jsx:182` builds
   `liveLabel = phase?.liveSeasonComplete ? String(usageLiveSeason) : \`${usageLiveSeason} so far\`` and passes it
   to `UsageEfficiencySection` (`PlayerDetailModal.jsx:736`). The legend (`UsageEfficiencySection.jsx:90–92`)
   ignores it and hard-codes `` `${liveColumn.season} so far: ${liveColumn.minGp}+ games (8 of 17, pro-rated to ${liveColumn.teamGames} team games played).` ``.
   `phase.liveSeasonComplete` comes from `seasonPhase.js:26–60` (`true` for `season_type` `'post'`, and for
   `'off'` once the live season's start date has passed).
2. **What `liveQualifyingGp` returns once the season is complete.** `usageEfficiency.js:204–219`:
   `teamGames = liveTeamGamesCompleted(currentSeasonTotals)` = the most `'P'`/`'D'` codes on any live row's
   18-entry `weeklyStatus` (regular-season weeks incl. the bye). After the regular season every team has 17
   games, so `teamGames = 17` and `minGp = max(1, ceil(8 / 17 × 17)) = 8` — the full-season gate, so the
   pro-rating clause says nothing. It is **not** hard-coded to 8: if the served live file lags the phase (e.g.
   `phase` says complete, file has T = 14), `minGp = ceil(6.59) = 7`. The legend therefore prints
   `liveColumn.minGp`, never a literal 8. No change to `usageEfficiency.js`.
3. **Why the card grows today.** `FrozenScroll.jsx:12` is `overflow-x-auto`; CSS forces `overflow-y` to a
   non-`visible` value when `overflow-x` is not `visible`, so an `absolute` popover inside it is clipped
   vertically. `UsageEfficiencySection.jsx:181–182` works round that with a wrapper
   `<div className="has-[[role=dialog]]:pb-40">` (160 px of padding while any dialog is open). `overflow-x: clip`
   would not clip vertically but cannot scroll, and the grid must scroll at 375 px — rejected.
4. **`position: fixed` escapes the clip here.** A fixed element ignores ancestor overflow clipping unless an
   ancestor creates a containing block for it (`transform`, `filter`, `backdrop-filter`, `perspective`,
   `contain: paint/layout`, `will-change: transform`). Checked the whole chain from the grid up:
   `FrozenScroll` (`overflow-x-auto` only), the §usage card (`PlayerDetailModal.jsx:724`), the scroll column
   (`PlayerDetailModal.jsx:476`, `overflow-y-auto`), and `PlayerDetailTabs.jsx:156–158` (`fixed inset-0`
   overlays, `overflow-hidden`, `shadow`) — none of those properties. So a fixed dialog left in place in the DOM
   escapes, and stays a DOM descendant of the sticky label `th`, which keeps `FROZEN_POPOVER_LIFT`
   (`has-[[role=dialog]]:z-[3]`, `frozen.js:14`) working and keeps the modal backdrop's click handler
   (`PlayerDetailTabs.jsx:156`, a sibling, not an ancestor) out of the way. A `createPortal` to `document.body`
   was rejected: it breaks `FROZEN_POPOVER_LIFT`'s `:has()` and every caller's `[&_[role=dialog]]:…` descendant
   override (e.g. `UsageEfficiencySection.jsx:173`, `Market.jsx:579–586`).
5. **`DefinitionPopover` callers** (`grep -rn "<DefinitionPopover" src`): `dp/UsageEfficiencySection.jsx:174`
   (role chip), `:198` (row labels); `dp/EnvironmentSection.jsx:122`; `dp/PlayerDetailModal.jsx:538`, `:740`;
   `dp/TwoYearRank.jsx:10`, `:21`, `:40` (rendered by Market's Model view, the pop-up and Portfolio);
   `teams/Teams.jsx:320`; `portfolio/TeamOffences.jsx:88`; `portfolio/Portfolio.jsx:133`, `:222`, `:1189`,
   `:1209`, `:1399`, `:1421`; `market/Market.jsx:586`. **Only `UsageEfficiencySection.jsx:198` passes the new
   prop.** Every other caller keeps the default (`'absolute'`), whose render path is unchanged — guarded by
   test D1 (§5).
6. **No existing test pins `has-[[role=dialog]]:pb-40`** (`grep -rn "pb-40" src` → only the source line).
   `Portfolio.test.jsx:1560` and `Market.factViews.test.jsx:678` pin `has-[[role=dialog]]:z-[3]` (the lift) —
   unaffected, the lift constant is not edited.
7. **Neutral fill token.** `src/index.css:193–238`. Candidates: `--color-dp-chip` `#1a1d24` (the raised chip
   surface, already used on this card by the role chip, `UsageEfficiencySection.jsx:175`) and
   `--color-dp-slate` `#2a2f38`. The rank/marker sub-lines are `text-dp-muted` `#858b95`: on `dp-card`
   `#0e1014` ≈ 5.4:1; on `dp-chip` ≈ 4.8:1 (AA for small text holds); on `dp-slate` ≈ 3.9:1 (fails AA at
   10.5 px). **Pick `bg-dp-chip`.** It is a near-neutral grey, distinct in hue and lightness from every
   `SCALE_STOPS` entry (`percentileColour.js:5`; darkest stop `#2A1B4D` is a saturated purple, next `#3B3F86`
   blue). Text classes are not changed. Session 2 does not substitute another token.

---

## 1. Fix 1 — legend drops "so far" once the live season is complete

`PlayerDetailModal.jsx` — pass one new prop to `UsageEfficiencySection` (next to `liveLabel`, `:736`):

```jsx
liveSeasonComplete={!!phase?.liveSeasonComplete}
```

The same `phase` object `liveLabel` reads at `:182`; no recomputation of season phase anywhere.

`UsageEfficiencySection.jsx`:
- Add `liveSeasonComplete` to the destructured props (`:99–102`) and pass it to `<Legend … />` (`:223`).
- `Legend({ position, liveColumn, liveSeasonComplete })` — the live line (`:90–92`) becomes:

```jsx
{liveColumn && (
  <span>{liveSeasonComplete
    ? `${liveColumn.season}: ${liveColumn.minGp}+ games.`
    : `${liveColumn.season} so far: ${liveColumn.minGp}+ games (8 of 17, pro-rated to ${liveColumn.teamGames} team games played).`}</span>
)}
```

The in-season string is unchanged (existing U4 assertion at `PlayerDetailModal.usageAvailability.test.jsx:452`
stays as is). With the season complete and T = 17 this reads `2026: 8+ games.` (§0.2).

## 2. Fix 2 — no card height change while a row definition is open

### 2.1 `DefinitionPopover.jsx` — new opt-in prop `strategy`

Signature: `DefinitionPopover({ term, scope, gloss, percentiles, band, span, field, strategy = 'absolute', children })`.

- `strategy === 'absolute'` (default): **the dialog's markup and classes are exactly today's**
  (`absolute z-20 mt-1 w-64 …`, no inline `style`). No new listeners.
- `strategy === 'fixed'`: the dialog's className is `fixed z-20 w-64 bg-dp-card border border-dp-border rounded-[12px] p-3 shadow-lg`
  (today's string with `absolute` → `fixed` and `mt-1` removed — the 4 px gap moves into `top`). Position is
  set imperatively in a `useLayoutEffect` (runs before paint; no state, so no `react-hooks/set-state-in-effect`
  disable is needed) keyed on `[open, strategy]`:

```js
// position: fixed escapes FrozenScroll's overflow clip; see .claude/tasks/usage-card-polish.md §0.3–0.4
const GAP = 4, EDGE = 8, POPOVER_W = 256 // POPOVER_W = w-64
useLayoutEffect(() => {
  if (!open || strategy !== 'fixed') return
  const el = popoverRef.current, trigger = triggerRef.current
  if (!el || !trigger) return
  const r = trigger.getBoundingClientRect()
  const h = el.getBoundingClientRect().height
  const below = r.bottom + GAP
  const above = r.top - GAP - h
  const top = below + h > window.innerHeight - EDGE && above >= EDGE ? above : below
  const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - POPOVER_W - EDGE))
  el.style.top = `${top}px`
  el.style.left = `${left}px`
}, [open, strategy])
```

  Opens below the trigger; flips above when below would run past the viewport bottom and above fits; if
  neither fits it stays below (the popover is short — term, one gloss, a field line). Left edge clamped so it
  never runs off either side (at 375 px: max left = 375 − 256 − 8 = 111).
- `strategy === 'fixed'` also closes on any scroll or resize, because a fixed popover would otherwise stay put
  while the modal's scroll column (or the grid's horizontal scroll) moves the trigger away. Inside the existing
  `useEffect` (`:12–34`), when `strategy === 'fixed'`, add
  `document.addEventListener('scroll', close, true)` (capture — scroll does not bubble, capture sees element
  scrolls) and `window.addEventListener('resize', close)`, with `close = () => setOpen(false)` (no focus
  return), removed in the same cleanup. Add `strategy` to that effect's dependency array. The default branch
  registers nothing new.
- The header comment gains one line: `strategy="fixed"` positions the panel against the viewport for callers
  inside a clipping scroll container; it stays a DOM descendant of the trigger's wrapper so `:has()` lifts and
  descendant overrides keep working.

### 2.2 `UsageEfficiencySection.jsx`

- Row-label popover (`:198–204`): add `strategy="fixed"`.
- Delete the wrapper `<div className="has-[[role=dialog]]:pb-40">` and its comment (`:181–182`, closing `</div>`
  `:213`); the `<table>` becomes `FrozenScroll`'s direct child. Replace the comment with:
  `{/* Row definitions open position:fixed (DefinitionPopover strategy), so the clipping scroll container never grows. */}`
- `LABEL_CELL` keeps `FROZEN_POPOVER_LIFT` (still needed: the dialog paints inside the sticky `th`'s stacking
  context, above the next rows' `z-[2]` sticky cells).
- The role chip (`:174`) is **not** changed — it sits outside `FrozenScroll` and is not clipped.

## 3. Fix 3 — neutral fill for uncoloured value cells

`UsageEfficiencySection.jsx` `GridCell` (`:56–62`): the value `<td>`'s className gains `bg-dp-chip` exactly
when `coloured` is false:

```jsx
className={`px-1.5 py-1.5 text-center align-top whitespace-nowrap ${coloured ? '' : 'bg-dp-chip'}`}
```

Covers all three uncoloured-with-value cases: unqualified (`<N g`), `lowVolume` (`low vol`), and
`metric.direction === 'neutral'` (Avg depth), plus a value with `percentile == null` for any other reason. The
inline `style` stays only on coloured cells. Text classes (`text-dp-text`, `text-dp-muted`) unchanged. Void
cells (`:50–53`, `data-void`) unchanged — still no background.

Legend (`:79–84`): after the bottom→top gradient span, add a sibling:

```jsx
<span data-testid="usage-legend-unranked" className="flex items-center gap-1.5">
  <span aria-hidden="true" className="inline-block h-2 w-3 rounded-sm bg-dp-chip border border-dp-border-raised" />
  <span>not ranked</span>
</span>
```

(the border keeps the small swatch visible against the card). The WR/TE line (`:93`) changes from
`Avg depth: uncoloured — a style, not better or worse.` to
`Avg depth: ranked, but grey — a style, not better or worse.` — the cell now has a fill, so "uncoloured" would
be false, and Avg depth does carry a rank, so the swatch's "not ranked" must not be read as covering it.

## 4. Docs in the same change

- `docs/nav/components.md:39` (`dp/DefinitionPopover.jsx` row): add — "Optional `strategy` (`'absolute'`
  default; `'fixed'` positions against the viewport below the trigger, flipping above near the bottom, left
  clamped to 8 px from either edge, closing on any scroll/resize — used by `UsageEfficiencySection`'s row
  labels inside `FrozenScroll`)."
- `docs/nav/components.md:47` (`dp/UsageEfficiencySection.jsx` row): props list gains `liveSeasonComplete`;
  "coloured by `percentileColour.js` (not for a neutral row)" → add "; an uncoloured value cell has the
  `bg-dp-chip` fill, shown in the legend as `not ranked`"; "the live threshold" → "the live threshold (without
  the pro-rating clause once `liveSeasonComplete`)".
- `docs/ui.md` §usage *Cells* paragraph (`:350–364`): "average depth is ranked but uncoloured" → "average
  depth is ranked but off the scale"; after "neither is ranked or coloured" add "; those cells (and average
  depth) take the neutral `dp-chip` fill, which the legend labels `not ranked`"; after "and the live
  threshold" add "(the bare `{season}: {N}+ games` once the season is complete)". After "frozen inside
  `FrozenScroll` for narrow screens" add "; a row's definition opens with `DefinitionPopover`'s
  `strategy="fixed"`, so the card does not grow while it is open."
- `docs/ui.md:526–531` (*Definitions*): append one sentence on `strategy="fixed"` (the same content as the
  nav row).
- No `CLAUDE.md`, signal-registry or cross-repo-registry change (no module added/renamed, no signal).

## 5. Tests (each names its defect and red step)

Use the existing helpers in `PlayerDetailModal.usageAvailability.test.jsx` (`open`, `usageCell`, `wrSeason`,
`wrMap`, `qbSeason`, `qbMap`, `row`) inside `describe('PlayerDetailModal — usage grid')`.

**L1 (fix 1) — extend `U4 labels a completed live season with the bare year` (`:455–460`).** Same fixture
(`w1` with `row(17, …)` → T = 17, `nflState` `season_type: 'post'`). Add: the `[data-testid="usage-legend"]`
text contains `2026: 8+ games.` and contains neither `so far` nor `pro-rated`. *Defect:* the legend stays
hard-coded to the in-season wording after the season ends while the header says the bare year. *Red:* restore
the hard-coded in-season string at the legend's live line → fails on `not.toContain('so far')`.

**L2 (fix 1, guard) — no new test; the existing U4 in-season assertion (`:452`) must stay green unchanged.**

**N1 (fix 3) — new `it('U12 uncoloured value cells take the neutral fill; void and coloured cells do not')`.**
- WR career `{ 2025: { w1: row(7, wrStats(30)), w2: row(16, wrStats(40)) } }`, open `w1`:
  `usageCell(…, 'targetShare', 2025)` has `data-unqualified="true"`, `classList` contains `bg-dp-chip`,
  `style.backgroundColor` is `''`.
- `open('w1', wrSeason, wrMap)`: `aDOT` 2025 cell (neutral direction) has `bg-dp-chip` and empty
  `style.backgroundColor`; `targetShare` 2025 cell (coloured) does **not** have `bg-dp-chip` and its
  `style.backgroundColor` is `scaleCss(percentile)` (as U5).
- `open('q3', qbSeason, qbMap)`: each of `cmpPct`/`passerRating`/`sackPct` 2025 has `data-low-volume="true"`
  and `bg-dp-chip`.
- Void: on a fixture with a void cell (`renderModal('wrVet')`, `snapShare` 2019 — `data-void="true"`, as the
  existing pre-2020 test), the cell does **not** have `bg-dp-chip`.
- Legend: `[data-testid="usage-legend-unranked"]` exists, contains text `not ranked`, and its first child has
  `bg-dp-chip`.

*Defect:* uncoloured cells render with no fill, reading as the dark bottom of the scale; or the fill leaks onto
void or coloured cells. *Red:* remove `bg-dp-chip` from `GridCell`'s className → the unqualified/neutral/low-vol
assertions fail.

**N2 (fix 3) — update `U8` (`:521`)** from `toContain('Avg depth: uncoloured')` to
`toContain('Avg depth: ranked, but grey')`. *Defect:* the legend still calls a filled cell uncoloured. *Red:*
revert the legend string → fails.

**H1 (fix 2) — new `it('U13 opening the last row\'s definition adds no padding and opens a fixed panel')`.**
`open('w1', wrSeason, wrMap)`; take the last `button` inside `[data-testid="usage-grid"] tbody` (the last
row's label), click it. Assert:
- no element under `#usage` has a className containing `pb-40` (`container.querySelector('#usage [class*="pb-40"]')` is `null`);
- the dialog (`screen.getByRole('dialog')`) has class `fixed` and not `absolute`;
- the dialog's closest `th` still has className containing `has-[[role=dialog]]:z-[3]` (lift intact).

*Defect:* the card grows while a definition is open (padding workaround), or the row popover is back on
`absolute` inside the clipping scroll container. *Red:* (a) restore the `has-[[role=dialog]]:pb-40` wrapper →
first assertion fails; (b) drop `strategy="fixed"` at the row label → second fails. Show both.

**D1–D5 (fix 2, shared component) — new `describe('DefinitionPopover — strategy')` in
`DefinitionPopover.test.jsx`.** Mock geometry with
`vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () { return this.getAttribute('role') === 'dialog' ? { top: 0, bottom: 150, left: 0, right: 256, width: 256, height: 150 } : TRIGGER })`
and `Object.defineProperty(window, 'innerWidth'|'innerHeight', { configurable: true, value })`; restore both in
`afterEach` (`vi.restoreAllMocks()`, and the saved original window sizes).
- **D1** default (no `strategy`): dialog className contains `absolute` and `mt-1`, not `fixed`; `style.top` and
  `style.left` are `''`; `fireEvent.scroll(document)` leaves it open. *Defect:* changing the shared default
  moves every other caller's popover (§0.5). *Red:* make `'fixed'` the default → fails.
- **D2** `strategy="fixed"`, TRIGGER `{ top: 100, bottom: 120, left: 40 }`, viewport 1024×800: `style.top` is
  `124px`, `style.left` `40px`, className contains `fixed`. *Defect:* fixed panel left unpositioned (renders at
  the viewport origin). *Red:* remove the `el.style.top/left` writes → fails.
- **D3** flip: TRIGGER `{ top: 700, bottom: 720, left: 40 }`, viewport 1024×800, dialog height 150: `style.top`
  is `546px` (700 − 4 − 150). *Defect:* the last row's definition runs off the bottom of the screen. *Red:*
  always use `below` → fails.
- **D4** phone clamp: viewport 375×800, TRIGGER `{ top: 100, bottom: 120, left: 300 }`: `style.left` is `111px`.
  *Defect:* at 375 px the panel runs off the right edge. *Red:* drop the `Math.min` clamp → `300px`, fails.
- **D5** `strategy="fixed"`: `fireEvent.scroll(document)` closes it (`queryByRole('dialog')` null); reopen,
  `fireEvent(window, new Event('resize'))` closes it. *Defect:* the fixed panel floats detached when the modal
  scrolls. *Red:* remove the scroll listener → fails.

All existing `DefinitionPopover.test.jsx`, `Portfolio.test.jsx`, `Market.factViews.test.jsx`,
`TwoYearRank.test.jsx`, `TeamOffences.test.jsx`, Teams and `PlayerDetailModal*.test.jsx` tests stay green
**unchanged** apart from U4 (extended) and U8 (`:521` updated).

## 6. Out of scope

- `EnvironmentSection.jsx:122`'s row popovers (also in a frozen table) keep the default; if they clip too, that
  is a separate slice — not observed or asked for.
- No change to `usageEfficiency.js`, `FrozenScroll.jsx`, `frozen.js`, `SCALE_STOPS`, any rank/pool/percentile, or
  the header's `liveLabel`.
- No PROVISIONAL tag added or removed (the existing void-cell tag at `:51` stays).

## 7. Done-definition and smoke

Per `CLAUDE.md` → *Done-definition*: every red step in §5 shown failing then reverted; `npm test`,
`npm run lint` (0 problems), `npm run build` (clean). No contract tests apply (`seasonProjection.js` and stat-key
references untouched). Commit before hand-back; paste `grep -rn "PROVISIONAL(" src/ | wc -l` before and after
(must be equal).

Smoke (`.claude/launch.json` → `sleeper-dashboard`, via the preview tool; stop it after), recipe in
`docs/architecture.md` → *Smoke-testing the running app*:
1. Pop-up for a WR with a < 8-game season on the axis: that cell has the grey fill, distinct from the dark
   purple bottom of the scale; legend shows the `not ranked` swatch.
2. Same WR: Avg depth row cells all grey-filled with ranks; void cells (dashed) still unfilled.
3. A QB with a low-vol season: `low vol` cells grey-filled.
4. Open the **last** row's definition at desktop width and at 375 px (`resize_window` mobile): the card's height
   does not change (compare the §usage card's `getBoundingClientRect().height` before and after opening via
   `javascript_tool`); the panel is fully visible (flips above if near the viewport bottom), not clipped, frozen
   column still frozen when scrolled right; scrolling the pop-up closes it.
5. If the live season is in progress or complete in the served data, read the legend's live line against the
   header (bare year ⇔ no "so far"). If it is not observable in today's data, say so; L1 covers it.
Report what was looked at and seen. A screenshot is not sign-off — Anton judges whether it looks good.

---

## Verification

Session 1, 2026-11-25. Diff `2b5abf2..2f68715` (one commit, `2f68715 Usage & efficiency card: three display fixes`,
Session 2 on sonnet). 7 files: `DefinitionPopover.jsx`/`.test.jsx`, `UsageEfficiencySection.jsx`,
`PlayerDetailModal.jsx`, `PlayerDetailModal.usageAvailability.test.jsx`, `docs/nav/components.md`, `docs/ui.md`.

- Plan review (light): one flag, `[mechanical]` test-id collision (`U10` already in use) — fixed before
  implementation by renaming the new tests to `U12`/`U13`.
- implementation-reviewer (light) on the diff: "No blocking issues found." Rounds 1, flags 0; no fix pass.
- Session 1 read the source diff: matches §1–§3 (default `absolute` branch markup unchanged; `strategy="fixed"`
  only on the usage row labels; `pb-40` wrapper removed; `bg-dp-chip` only when `!coloured`; legend live line
  branches on `liveSeasonComplete` from `phase`).
- Checks re-run by Session 1 at `2f68715`: `npm test` 197 files / 3747 tests passed; `npm run lint` 0 problems
  (a first run concurrent with the test/build run hit a transient file-read error; re-run alone, clean);
  `npm run build` clean apart from the "chunks larger than 500 kB" warning, which Session 2 showed is also
  printed at `2b5abf2` (pre-existing, not introduced here).
- Red steps (Session 2 hand-back): L1, U12, U8, U13 (a: `pb-40` restored; b: `strategy` dropped), D1–D5 each seen
  failing on the §5 mutation, then reverted. D1 passed before implementation by design (guards the unchanged
  default).
- Smoke (Session 2, preview config): WR short-season and Avg depth cells grey, void cells unfilled, `not ranked`
  swatch present; QB `low vol` cells grey; last-row definition: card height unchanged (desktop 523→523; 375 px
  803→803, 707→707), panel flips above near the bottom, fully on-screen at 375 px (76–332 px), frozen column
  intact, closes on scroll. Completed-season legend not observable (live season in progress) — covered by L1 only.
- PROVISIONAL count 49 before, 49 after.
- Deviations: none.
- Observed in passing, out of scope: at 375 px the Market page lays out 678 px wide (facts tab bar overflows).

Signed off by Anton 2026-11-26
