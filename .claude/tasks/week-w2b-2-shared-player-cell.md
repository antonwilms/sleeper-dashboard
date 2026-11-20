# Brief W2b-2 — shared player cell

**Status:** planning artifact (Session 1, opus/high). This session edited no source or doc files.
**Review depth: full — one shared component rewritten under five surfaces (This week, Market, My Team
Starting ten + Bench, team detail, pop-up compare), a frozen-column change on Market, and a column
reorder; touches Market and My Team tests.** No data, scoring, snapshot, pipeline or cross-repo change.
**Plan approved by Anton 2026-11-20** (Revision 2.1).
**Session 2:** sonnet, effort medium. Runs the app from `.claude/launch.json` (`sleeper-dashboard`)
for the measurements and screenshots in §6, stops it when done.

**Revision 2.1** (2026-11-20): round 2's two flags fixed — §2.3 edit range l.292–332; D11 flagged-row height and the T8 height gate. **Revision 2**: plan-reviewer round 1's six flags folded in — §1 D5/D9/D11/D12, §2.3, §2.4, §2.6, §2.7, §3 (T4b, T8, T13, T14b, T20), §6. Log: `.claude/reviews/`.

Planned against live source at app HEAD `d9af715`. Prior slices: W2a (`fcf0f37`, frozen columns,
`dp/FrozenScroll.jsx`, `dp/frozen.js`), W2b-1 (`52aff4e`), W2b-1q (`d9af715`).

**Design source:** the 2026-11-20 handoff brief restating `ux-briefs-week-and-myteam.md` §6 (Claude.ai
project, not on disk). Anton 2026-11-19: W2a's phone scroll window, edge shade, and PROJ scrolling away
in the All view are **not** reopened by this slice.

---

## 0. Facts read at `d9af715`

- `src/components/dp/cells.jsx:79` — `PlayerCell({ row, marker })`: 28px `PlayerHeadshot`, a 26px
  position chip, name (`truncate`; `marker` sits beside the truncating span), sub-line
  `text-[11px] text-dp-muted truncate`: `{age} · <TeamLogo 12px> {team|FA} · {years_exp}yr`.
- Consumers of `PlayerCell`: `market/FactTable.jsx:71` (`marker={playerMarker?.(row)}`),
  `portfolio/Portfolio.jsx:1074` (Starting ten) and `:1267` (Bench) (`marker={ageMarkerFor(row)}`),
  `teams/TeamDetail.jsx:341` (holdings list, inside a `flex justify-between` row),
  `dp/PlayerDetailTabs.jsx:195` (compare dropdown, `w-[250px]`, inside `flex-1 min-w-0`).
  `shell/TopBar.jsx` keeps local markup on purpose (header comment l.8, `docs/ui.md:198`) — **out of scope**.
- `week/LineupTable.jsx:288–331` — its own cell inside `td[data-testid=col-player]`
  (`${FROZEN_SECOND} bg-dp-card ${FROZEN_ROW_HOVER} ${FROZEN_EDGE}`): headshot 28px in
  `span.hidden.md:block`; a bordered chip holding `TeamLogo 12px` + abbr (`span.hidden.md:inline`); name
  block `min-w-0 max-w-[136px] md:max-w-none`; name line `text-[12.5px] … whitespace-nowrap flex` with
  `StatusChip`; rank line `text-[10.5px] text-dp-muted` with `title="Rank by total points…"` holding
  `rankLine(r, lastSeason, thisSeason)` and the BACKUP chip (`data-testid=backup-flag`) with its
  `PROVISIONAL(heuristic): BACKUP chip …` tag (l.310); the start/sit flag line
  (`data-testid=startsit-flag`, `text-dp-down-text`, `id=startsit-flag-{slotIndex}`) below it.
  The row shape is `r.player_id / r.name / r.position / r.team` (Sleeper-domain team, e.g. `LAR`).
- `dp/SleeperImages.jsx` — `PlayerHeadshot({ playerId, size, shapeClass, fallback, badge })` sizes the
  `<img>` and the fallback `<span>` with **inline** `style={{ width: size, height: size }}`;
  `TeamLogo({ team, size, className })` returns `null` for no URL or after `onError`, testid `team-logo`.
  `utils/sleeperImages.js` — `teamLogoUrl(team)` returns `null` unless `SLEEPER_LOGO_TEAMS.has(team)`.
- `dp/MarketTable.jsx:58` wraps the table in a plain `div.overflow-x-auto`; header row
  `bg-dp-card-quiet`, card `bg-dp-card-quiet`. Only `FactTable.jsx` imports it. `FactTable.jsx:71`'s
  player `td` is `px-[18px] py-3`, header is `<SortTh label="Player" col="full_name" …/>`; `SortTh`
  (cells.jsx:63) takes no `className`.
- `market/factViews.js:61` `OVERVIEW_SKILL = [G, m('fp'), m('fpPerG'), PREV_RANK, …]` and `:92` QB
  `[G, m('fp'), m('fpPerG'), PREV_RANK, OWNER, KTC, DYN]`. `docs/ui.md:533` — "Known exception:
  Market's `Prev rk` sits right of the current FP/G (to be reordered)." `docs/ui.md:202` lists
  Overview as "`G`, `FP`, `FP/G`, `Prev rk` …".
- `dp/cells.test.jsx:106–143` — `PlayerCellBefore`, a verbatim copy of the 9fe48dd cell, and a
  "renders identically to the pre-change cell" assertion. This slice changes that markup on purpose.
- Tokens (`src/index.css`, dark-only dp family): `dp-card #0e1014`, `dp-card-quiet #0b0d11`,
  `dp-row-self #14171d` (row hover/focus), `dp-text #eceef2`, `dp-text-4 #9da3ad`, `dp-muted #858b95`.
  `font-dp-mono` is JetBrains Mono (monospace → fixed-width figures). Contrast helpers exist:
  `utils/percentileColour.js` exports `hexToRgb`, `relativeLuminance`, `contrastRatio`.
- `dp/DefinitionPopover.jsx:55` (the age-caution marker's popover) is `absolute z-20` — the cell must
  not add `overflow-hidden` or `isolate` around `marker`. Inside a sticky `z-[2]` frozen cell the popover
  is also confined to that cell's stacking context — D12's `FROZEN_POPOVER_LIFT` handles that.

### Measured in the running app at `d9af715` (Dynasty 040, this session)

| Surface | Row height (1440×900) | First row top | Rows fully visible at load |
|---|---|---|---|
| This week lineup | 52px (66 with a start/sit flag line) | 519px | 7 |
| Market (Overview) | 61px | 287px | 10 |
| My Team Starting ten / Bench | 48px | 419px | 10 |

At 375×812: This week's player `td` is 188px wide (20px padding + 168px content = 26px logo chip +
6px gap + 136px name block); frozen block right edge **261px**; PROJ header right edge 323px. Phone
lineup rows are 52–122px tall (the rank line wraps). Market's player `td` is 237px at 375 (not frozen
today). My Team's frozen player column right edge 267/284px.

---

## 1. Decisions

**D1 — One component, slots, no variant.** `PlayerCell` keeps its `row` input (the `playerRows` shape:
`player_id, full_name, position, nfl_team, age, years_exp`) and gains layout props and content slots.
No `variant` switch, no surface names inside the component. This week maps its row shape into `row`.

**D2 — What the cell owns:** photo, position chip (optional), name, team abbr text, watermark, the
sub-line container (colour/size), and the name-line flex that keeps `marker` outside truncation.
**What surfaces supply:** the sub-line content (`sub`), nodes after the name (`marker`), and lines under
the sub-line (`footer`).

**D3 — Watermark technique: an absolutely positioned `<img>` via `TeamLogo`**, not a CSS
background-image. Reason: `TeamLogo` already carries the image rules (`referrerPolicy="no-referrer"`,
no `crossOrigin`, lazy/async, `onError` → render nothing), so a failed logo falls back to the plain
background for free and no surface builds a URL; a CSS `background-image` has no `onError` and no
referrer policy. Spec: wrapper `span[data-testid=team-watermark][aria-hidden=true]` with
`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none select-none` and the opacity class;
`TeamLogo size={44}` inside. Anchored to the **right edge of the cell root** (in a table the root fills
the `td`, so the logo sits at the column's right edge, behind the name's tail or empty space). The
wrapper is rendered only when `teamLogoUrl(row.nfl_team) != null` (FA, null, era codes such as `LA`,
lower-case → no wrapper); a load failure leaves an empty wrapper (no `<img>`) = plain background.
Paint order without z-index: the watermark is the root's **first** child; the photo, chip and text
column are `relative` and come after it, so they paint above it. No `isolate`, no `overflow-hidden`
(D-popover fact, §0).

**D4 — Opacity and contrast.** `WATERMARK_OPACITY = 0.12`, class literal `opacity-[0.12]`, both
exported from `dp/cells.jsx`. Worst case is a white logo pixel (light text on dark ground: brighter
composite = lower contrast). Composite of `#ffffff` at 0.12 over each ground, computed this session:

| Ground | name `dp-text` | sub-line `dp-text-4` | (today's `dp-muted`) |
|---|---|---|---|
| `dp-card` | 11.89 | 5.44 | 4.03 ✗ |
| `dp-card-quiet` | 12.38 | 5.67 | 4.19 ✗ |
| `dp-row-self` (hover) | 10.91 | 5.00 | 3.70 ✗ |

So the **sub-line moves from `text-dp-muted` to `text-dp-text-4`** (slightly lighter grey) on every
surface — `dp-muted` under a 0.12 watermark fails 4.5:1. The name keeps `text-dp-text`. No dark
overlay is needed. The guarantee is a fixed opacity cap checked by T4 against the tokens read from
`index.css`; the cap tolerates opacity up to ~0.15 before `dp-text-4` on `dp-row-self` drops to 4.5.

**D5 — Photo size.** 28px below `md`, **40px from `md` up**, on every surface, via a new optional
`sizeClass` prop on `PlayerHeadshot` (§2.1). This week additionally hides the photo below `md`
(today's phone behaviour) via `photoFromMd`. The photo wrapper is a **flex** box (`flex`, or
`hidden md:flex` with `photoFromMd`): the `<img>` is then a flex item (blockified), so there is no inline
baseline/descender gap under it and the photo slot is exactly 28/40px tall (plan-review R1 flag 4 — an
inline `<img>` inside a block span adds ~4px).

**D6 — Position chip:** stays on Market, My Team, team detail and compare (`showPosition` default
`true`); **dropped on This week** (`showPosition={false}`) — the slot column shows the slot, and the
rank line names the position in each segment (`2025 QB34`) and falls back to the bare position when
there are no ranks.

**D7 — Team abbr placement:** the cell renders the abbr as the **first segment of the sub-line**,
`span[data-testid=player-cell-team]`, text `row.nfl_team` unless null/`'FA'` → `'FA'`, followed by
` · ` and the surface sub when there is one. Default sub (no `sub` prop) is `{age} · {years_exp}yr`
with absent parts omitted — so Market/My Team/team detail/compare read `KC · 25 · 3yr` (today
`25 · [logo] KC · 3yr`; order changes so the cell-owned part is a fixed prefix). The 12px inline logo
is removed — the watermark replaces it. The abbr is shown at **every width**, including This week on
phone (today hidden there, where the 12px logo chip was the only team signal; with the chip gone the
abbr text must be the signal).

**D8 — Sub-line wraps, not truncates.** One sub-line element (≤ 1 grey sub-line), `leading-snug`, no
`truncate`, so This week's phone rank line keeps wrapping as today rather than losing `#42 overall`.
Market/My Team sub-lines are short and table auto-layout gives them their width; no visible change.

**D9 — This week's BACKUP chip moves from the rank line to the name line**, beside `StatusChip`, both
passed through `marker` (shrink-0, never truncated). Reason: the rank line is now the cell's wrapping
sub-line; availability flags read together on the name line. The `PROVISIONAL(heuristic): BACKUP chip`
comment moves with the chip and stays in `LineupTable.jsx`. The start/sit flag line goes through
`footer`. The chip's text moves `text-dp-muted` → `text-dp-text-4`: every text node over the watermark
meets 4.5:1, not only name and sub (plan-review R1 flag 3). `StatusChip` Questionable (outlined, text
`#fcd34d`) and the start/sit line (`dp-down-text #fdba74`) already clear it; severe chips are filled and
carry their own ground. T4b checks the three. The rank line's `title` survives on a span inside `sub`.

**D10 — Phone width for This week.** Below `md` the shared cell drops the photo (hidden), the position
chip (off) and the 32px logo chip (gone). This week passes `className="max-w-[168px] md:max-w-none"`
to the cell root, giving the freed 32px to the name block (136 → 168px), so the `td` stays
20 + 168 = 188px and the **frozen block right edge stays 261px** (acceptance 257–264, measured in §6).
Name size becomes the shared 13px (today 12.5px on This week).

**D11 — Row height cost (1440×900).** With D5's flex wrapper the photo slot is exactly 40px, so content height becomes max(40px photo, 13px name 19.5 + 11px
sub 16.5 = 36) = 40px.

| Surface | Before | After (expected) | Visible at load before → after |
|---|---|---|---|
| This week | 52 (66 flag) | 61 (≈70 flag: the start/sit line stacks in the text column beside the photo — name 19.5 + sub ≈15 + flag ≈16 ≈ 50px content; 68–72) | 7 → 6 |
| Market | 61 | 65 | 10 → 9 |
| My Team | 48 | 57 | 10 → 8 |

A 36px photo would cost 5px less per row on This week/My Team; this plan follows the brief's ~40px.

**D12 — Market frozen player column.** Market has no slot column, so the player column is the first
frozen column: `FROZEN_FIRST` + `FROZEN_EDGE` + `bg-dp-card-quiet` + `FROZEN_ROW_HOVER` on the `td`,
and `FROZEN_FIRST` + `FROZEN_EDGE` + `bg-dp-card-quiet` on the header `th`. `MarketTable`'s
`div.overflow-x-auto` becomes `<FrozenScroll>`. **Popover lift (plan-review R1 flag 2):** a sticky `td` with `z-[2]` is a stacking context per row, so
an age-caution `DefinitionPopover` (`absolute z-20`; on Market's Model view via `Market.jsx:221`
`modelPlayerMarker`) is confined to its row's cell and paints under every later row's frozen cell (same
`z-[2]`, later in the DOM). Fix: new `dp/frozen.js` constant
`FROZEN_POPOVER_LIFT = 'has-[[role=dialog]]:z-[3]'` — while a dialog is mounted inside the cell it rises
above its z-2 siblings; closed, it is z-2 as today. Applied to Market's player `td` and — because the same
defect exists today on My Team since W2a — to the Starting ten and Bench player `td`s (both carry
`ageMarkerFor`). Not applied to This week (no popover in its cell). No width cap on Market's player column (not asked);
at 375 it freezes ≈ 237px — reported in §6 as an open item for Anton, not changed.

**D13 — `Prev rk` sits immediately left of `FP/G`:** `[G, m('fp'), PREV_RANK, m('fpPerG'), …]` in
both `OVERVIEW_SKILL` and the QB list — prior-season rank directly before the current FP/G it ranks
(oldest left, pair kept adjacent).

**D14 — Clean columns (item 5), bounded to touched tables (LineupTable, FactTable).** Audit at
`d9af715`: every numeric `td` in both is `font-dp-mono` (monospace = fixed-width figures) and
`text-right`; no cell carries more than one grey sub-line (Lineup SNAP has one; FactTable has none —
`· median` and `#rank` are inline). **No change required**; Session 2 adds nothing here unless a
touched column fails this, in which case it stops and reports.

---

## 2. Changes (exact)

### 2.1 `src/components/dp/SleeperImages.jsx`

`PlayerHeadshot` gains optional `sizeClass` (string). When `sizeClass` is given: the `<img>` and the
fallback `<span>` get `sizeClass` in their className and **no inline `style` width/height**; the `<img>`
keeps `width={size} height={size}` attributes. When absent: byte-identical to today. Update the header
comment (one line: `sizeClass` lets a caller size responsively; inline style would beat classes).

### 2.2 `src/components/dp/cells.jsx`

```js
export const WATERMARK_OPACITY = 0.12
export const WATERMARK_OPACITY_CLASS = 'opacity-[0.12]'   // literal — Tailwind must see it

export function PlayerCell({
  row, marker, sub, footer, showPosition = true, photoFromMd = false, className = '',
})
```

Structure (classes are the spec; order matters for paint):

```jsx
<div data-testid="player-cell" className={`relative flex items-center gap-2.5 min-w-0 ${className}`}>
  {teamLogoUrl(row.nfl_team) != null && (
    <span data-testid="team-watermark" aria-hidden="true"
      className={`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none select-none ${WATERMARK_OPACITY_CLASS}`}>
      <TeamLogo team={row.nfl_team} size={44} />
    </span>
  )}
  <span className={`relative shrink-0 ${photoFromMd ? 'hidden md:flex' : 'flex'}`}>
    <PlayerHeadshot playerId={row.player_id} size={40} sizeClass="size-7 md:size-10" />
  </span>
  {showPosition && (
    <span data-testid="player-cell-pos" className="relative font-dp-mono text-[10px] w-[26px] text-center py-0.5 rounded bg-dp-chip text-dp-text-3 shrink-0">
      {row.position}
    </span>
  )}
  <div className="relative min-w-0 flex-1">
    <div data-testid="player-cell-name" className="text-[13px] font-semibold text-dp-text flex items-center gap-1.5 min-w-0 whitespace-nowrap">
      <span className="truncate">{row.full_name}</span>
      {marker}
    </div>
    <div data-testid="player-cell-sub" className="text-[11px] leading-snug text-dp-text-4">
      <span data-testid="player-cell-team">{abbr}</span>
      {subContent != null && <> · {subContent}</>}
    </div>
    {footer}
  </div>
</div>
```

- `abbr = row.nfl_team && row.nfl_team !== 'FA' ? row.nfl_team : 'FA'`.
- `subContent = sub !== undefined ? sub : defaultSub(row)`; `defaultSub` joins present parts
  `[age, \`${years_exp}yr\`]` with ` · `, returning `null` when both absent. `sub={null}` → abbr alone.
- `marker` is rendered as given (callers wrap in `shrink-0`; `AgeCautionMarker` already is). Drop the
  old two-branch name line — one shape now.
- Import `teamLogoUrl` from `../../utils/sleeperImages` (gate only; no URL is built here).
- Update the file header line "PlayerCell renders the headshot and team logo" → names the watermark,
  slots, and the W2b-2 task file.

### 2.3 `src/components/week/LineupTable.jsx`

Replace l.292–332 — the body of the non-empty branch of `col-player`, from the
`<div className="min-w-0 flex items-start gap-1.5">` opener at l.292 through its closing `</div>` at l.332
(the name block closes at l.331). Keep l.291 `) : (` and l.333 `)}` — so the ternary reads
`r.player_id == null ? (<span …>Empty</span>) : (<PlayerCell … />)`:

```jsx
<PlayerCell
  row={{ player_id: r.player_id, full_name: r.name, position: r.position, nfl_team: r.team }}
  showPosition={false}
  photoFromMd
  className="max-w-[168px] md:max-w-none"
  marker={<span className="shrink-0 flex items-center gap-1.5">
    <StatusChip status={r.injuryStatus} bodyPart={r.injuryBodyPart} />
    {/* PROVISIONAL(heuristic): BACKUP chip … (moved verbatim) */}
    {r.backup && own?.qbRole !== 'starter' && (<span data-testid="backup-flag" … >BACKUP</span>)}
  </span>}
  sub={<span title="Rank by total points in this league's scoring; overall is among QB, RB, WR and TE">{rankLine(r, lastSeason, thisSeason)}</span>}
  footer={flag && (<div id=… data-testid="startsit-flag" …>{flagText(flag)}</div>)}
/>
```

- BACKUP chip: drop `ml-1.5` (the wrapper's gap spaces it) and change `text-dp-muted` → `text-dp-text-4`
  (it now sits over the watermark: `dp-muted` is 3.70 on `dp-row-self` under a 0.12 white pixel,
  `dp-text-4` 5.00). Border classes unchanged.
- The `td` classes, the `Empty` branch, every other column: unchanged.
- Imports: add `PlayerCell` from `../dp/cells`; `PlayerHeadshot` is no longer used here — remove it from
  the import; `TeamLogo` stays (VS column).
- Header comment, two edits: (a) l.16–17 "the under-name line is the season rank line (by total
  league-scored points, weeklyRanks.js) plus a BACKUP chip from the raw depth entry (weeklyLineup.js)" →
  "the under-name line is the season rank line (by total league-scored points, weeklyRanks.js); the BACKUP
  chip from the raw depth entry (weeklyLineup.js) sits on the name line beside the injury chip"; (b)
  l.20–21 "Player rows carry a headshot and team logos (sleeper-images.md)" → "Player rows use
  dp/cells.jsx's shared `PlayerCell` (W2b-2); the VS cell carries the opponent logo."

### 2.4 `src/components/dp/cells.jsx` `SortTh` + `dp/frozen.js` + `market/FactTable.jsx` + `dp/MarketTable.jsx`

- `dp/frozen.js`: add `export const FROZEN_POPOVER_LIFT = 'has-[[role=dialog]]:z-[3]'` with a one-line
  comment (a sticky cell is a stacking context; lift it while a popover dialog is open inside it — D12).

- `SortTh` gains optional `className = ''`, appended last to the `th` className. Absent → identical.
- `FactTable.jsx`: player `td` → `` `px-[18px] py-3 ${FROZEN_FIRST} ${FROZEN_EDGE} bg-dp-card-quiet ${FROZEN_ROW_HOVER} ${FROZEN_POPOVER_LIFT}` ``;
  header → `<SortTh label="Player" col="full_name" className={`${FROZEN_FIRST} ${FROZEN_EDGE} bg-dp-card-quiet`} … />`.
  Import the constants from `../dp/frozen`. No other FactTable change.
- `MarketTable.jsx`: `<div className="overflow-x-auto">` → `<FrozenScroll>` (import from `./FrozenScroll`).
  Update its header comment with one line naming the frozen player column (W2b-2).

### 2.5 `src/components/market/factViews.js`

`OVERVIEW_SKILL = [G, m('fp'), PREV_RANK, m('fpPerG'), m('snapPct'), OWNER, KTC, DYN]`; QB overview
`[G, m('fp'), PREV_RANK, m('fpPerG'), OWNER, KTC, DYN]`. Nothing else.

### 2.6 Other consumers

`TeamDetail.jsx:341`, `PlayerDetailTabs.jsx:195`: **no change** — they pick up the new cell.
`Portfolio.jsx:1074` and `:1267`: no call-site change; the only edit is appending `${FROZEN_POPOVER_LIFT}`
to each player `td`'s className (import it with the existing frozen constants). Nothing else in Portfolio.

### 2.7 Docs (same change)

- `docs/ui.md` season-order section: delete the sentence "Known exception: Market's `Prev rk` sits right
  of the current FP/G (to be reordered)." Frozen-columns paragraph (l.535): add Market's player column
  ("Market freezes its player column alone"). l.202: "`G`, `FP`, `Prev rk` (…), `FP/G`".
- `docs/ui.md`: one short paragraph under the Market or a shared section naming the shared player cell:
  photo 28/40px, abbr-first sub-line, team watermark at 0.12 behind the cell, slots `sub`/`marker`/`footer`.
- `docs/nav/components.md` rows: `dp/cells.jsx` (PlayerCell signature, `WATERMARK_OPACITY(_CLASS)`,
  `SortTh className`), `dp/SleeperImages.jsx` (`sizeClass`), `week/LineupTable.jsx` (uses shared cell;
  BACKUP on the name line), `market/FactTable.jsx` / `dp/MarketTable.jsx` (frozen player column), `dp/frozen.js` (`FROZEN_POPOVER_LIFT`).
- No CLAUDE.md, signal-registry or cross-repo-registry change.

### 2.8 Copies created: **none.** The contrast test imports `percentileColour.js`'s helpers and reads
`index.css`; it copies no definition.

---

## 3. Tests

Every new or changed test is shown red with the named defect reintroduced, then restored.

**`src/components/dp/cells.test.jsx`** — delete `PlayerCellBefore` and the "renders identically to the
pre-change cell" test (it pins the markup this slice replaces on purpose; say so in the hand-back).
Replace the "headshot and team logo" block with:

- **T1 shared root.** `PlayerCell` renders `[data-testid=player-cell]` containing the headshot.
  *Fails if* the root testid is dropped (every consumer test below keys on it).
- **T2 watermark present/absent.** Fixture facts: `'KC'` ∈ `SLEEPER_LOGO_TEAMS`; `'LA'` ∉ it (assert
  `SLEEPER_LOGO_TEAMS.has('LA') === false` in setup — the era code, CR-16). `nfl_team: 'KC'` →
  `team-watermark` holds an `img` whose src ends `/kc.png`, wrapper `aria-hidden="true"`; `'FA'`, `null`,
  `'LA'` → `queryByTestId('team-watermark')` is null; `'KC'` then `fireEvent.error` on the watermark
  img → no `team-logo` inside it. *Fails if* the `teamLogoUrl` gate is removed (FA renders a wrapper) or
  the watermark is built from a hard-coded URL.
- **T3 abbr text always rendered.** `player-cell-team` text is `'KC'` for KC, `'FA'` for `'FA'` and for
  `null`; for KC it is present alongside the watermark. *Fails if* the abbr span is removed or made
  phone-hidden (assert its className contains no `hidden`).
- **T4 contrast cap.** Read `src/index.css`; extract `--color-dp-card`, `--color-dp-card-quiet`,
  `--color-dp-row-self`, and the text tokens named by the rendered classes: take
  `player-cell-name`'s and `player-cell-sub`'s `text-dp-*` colour class (regex `/\btext-(dp-[a-z0-9-]+)\b/`
  excluding size classes like `text-[11px]`), look up `--color-<token>`. For each ground: composite
  `#ffffff` at `WATERMARK_OPACITY` over it; `contrastRatio(relativeLuminance(text), relativeLuminance(composite)) >= 4.5`
  for both name and sub. Also assert `WATERMARK_OPACITY_CLASS === \`opacity-[${WATERMARK_OPACITY}]\``
  and the rendered `team-watermark` className contains `WATERMARK_OPACITY_CLASS`.
  *Fails if* the sub-line reverts to `text-dp-muted` (3.70 on `dp-row-self`) or the opacity is raised
  to 0.3 (`dp-text-4` → < 4.5).
- **T5 marker outside truncation.** With `marker={<i data-testid="m">MARK</i>}`: `m` is a child of
  `player-cell-name`, not inside its `span.truncate`; `player-cell-name` text is `Some NameMARK`.
  *Fails if* the marker is moved inside the truncating span.
- **T6 sub-line.** Default: `player-cell-sub` text `KC · 25 · 3yr`; FA with no age: `FA · 3yr`;
  `sub={<b>X</b>}`: `KC · X` (age/yrs gone, abbr kept); `sub={null}`: `KC`. The sub-line className has
  no `truncate`. *Fails if* a `sub` override drops the abbr prefix, or truncate is re-added.
- **T7 position chip.** Default: `player-cell-pos` text `WR`; `showPosition={false}`: absent.
  *Fails if* `showPosition` is ignored.
- **T8 photo sizing and phone hide.** Default: the headshot's wrapper has no `hidden`; the `img` className
  contains `size-7` and `md:size-10` and has no inline `width` style. `photoFromMd`: wrapper className
  contains `hidden` and `md:flex`; the default wrapper className contains `flex`. *Fails if* `sizeClass` is
  not passed (inline 40px style present), `photoFromMd` is ignored, or the wrapper reverts to a non-flex span
  (the descender gap returns). §6 confirms the after-heights of rows **without** a start/sit flag match D11 (±1px; flagged rows are checked only against the 68–72 range); a ~4px excess means the gap
  is back — stop and report.
- **T8b SortTh className.** `SortTh` with `className="x-frozen"` → `th` className contains `x-frozen`;
  without it, className equals today's (assert no trailing `undefined`). *Fails if* the prop is dropped.

- **T4b every text node over the watermark (`LineupTable.test.jsx`).** Same computation as T4 through a
  shared non-test helper `src/__tests__/watermarkContrast.js` (exports `minWatermarkContrast(el, cssText)`:
  reads the element's `text-dp-*` colour token, composites white at `WATERMARK_OPACITY` over `dp-card`,
  `dp-card-quiet` and `dp-row-self`, returns the minimum ratio; not matched by vitest's `*.test.*` include).
  T4 uses the same helper — no copy. Assert ≥ 4.5 for `backup-flag`, `startsit-flag` and a Questionable
  `status-flag`. *Fails if* the BACKUP chip keeps `text-dp-muted` (3.70).

**`src/components/dp/SleeperImages.test.jsx`**
- **T9** `sizeClass="size-7 md:size-10"`: img has the classes and `style.width === ''`; fallback (id
  `'p1'`) span has the classes and no inline width. Without `sizeClass`: `style.width === '28px'` (today).
  *Fails if* inline style is still set when `sizeClass` is given (it would beat the classes).

**`src/components/week/LineupTable.test.jsx`** — fixture `row()` has `player_id: 'p1'`, `team: 'KC'`.
- **T10 shared cell.** `col-player` of a filled row contains `player-cell`; an empty slot contains none.
  *Fails if* LineupTable keeps its own markup.
- **T11 chips and rank line inside the cell.** Row `injuryStatus: 'Out'`, `backup: true`,
  `depth: { position: 'WR', order: 2 }`, ranks set: `status-flag` and `backup-flag` are inside
  `player-cell-name`; the rank text (`2025 WR14 …` per the existing rank fixtures) is inside
  `player-cell-sub` and its span keeps the `Rank by total points…` title; a start/sit flag fixture puts
  `startsit-flag` inside `player-cell`. Update the existing rank-line / BACKUP tests' selectors to these
  testids (their assertions on text and on the qbRole rule stay). *Fails if* any of the three leaves the cell.
- **T12 PROVISIONAL tag survives.** `readFileSync('src/components/week/LineupTable.jsx')` contains
  `PROVISIONAL(heuristic): BACKUP chip`. *Fails if* the tag is dropped in the move.
- **T13 phone width classes (replaces T16 "mobile chip").** In `col-player`: `player-cell` className
  contains `max-w-[168px]` and `md:max-w-none`; no `player-cell-pos`; the headshot wrapper has `hidden`
  and `md:flex`; no element with class `border-dp-border-raised` holding a `team-logo` (the old chip);
  `player-cell-team` text `KC` with no `hidden`. *Fails if* the width cap is dropped or the old chip
  returns. (jsdom cannot measure; §6 measures 261px.)
- Update "headshots and team logos" (l.293–330): the player's KC logo is found inside `team-watermark`;
  the Rams test still finds two `lar.png` logos (watermark + VS), none `la.png`. T12-frozen (l.475) is
  unchanged and must still pass.

**Market** (`src/components/market/Market.test.jsx` or a new `FactTable.test.jsx`, Session 2's choice)
- **T14 shared cell + frozen.** Each body row's first `td` contains `player-cell` and its className
  contains `sticky`, `left-0`, `bg-dp-card-quiet`, `after:opacity-0`; the first header `th` contains
  `sticky`, `left-0`, `bg-dp-card-quiet`; the table is inside `[data-testid=frozen-scroll]`.
  *Fails if* `FROZEN_FIRST` is dropped from the td or `MarketTable` keeps the plain div.
- **T14b popover lift.** Market's player `td` className contains `has-[[role=dialog]]:z-[3]`
  (`FROZEN_POPOVER_LIFT`); same assertion in `Portfolio.test.jsx` on a Starting ten and a Bench
  `col-player` td. *Fails if* the constant is not applied. (jsdom does not paint; §6 opens the popover.)
- **T15 Prev rk order** (`factViews.test.js`): for `pos` in QB, RB, WR, TE, ALL with a window kind that
  shows Prev rk (`'season'`, as the existing l.90 test uses): `ids.indexOf('prevFpPerGRank') ===
  ids.indexOf('fpPerG') - 1`. *Fails if* the old order is restored.

- **T20 glossary label pins** (`src/__tests__/metricGlossary.test.js:21–22`, consumed at l.203): update
  `C0` to `["G","FP","Prev rk","FP/G","Owner","KTC","Dynasty"]` and `C1` to
  `["G","FP","Prev rk","FP/G","Snap%","Owner","KTC","Dynasty"]`; keep the "Captured from HEAD" comment and
  add one line: "C0/C1 reordered by W2b-2 (Prev rk left of FP/G)." A changed behaviour, asserted: red when
  D13's reorder is reverted (plan-review R1 flag 1 — this test pins overview labels for every pos ×
  statsMode × ros).

**My Team** (`src/components/portfolio/Portfolio.test.jsx`)
- **T16 shared cell, Starting ten and Bench.** Fixture: one starter and one bench player. Each
  `col-player` holds `player-cell`. *Fails if* either table stops using `PlayerCell`.
- **T17 age marker survives.** Fixture: a veteran row (`isVeteranRow` true) whose `playerMap` age is
  ≥ `AGE_CAUTION.over.minAge` → `▲ age` is inside `player-cell-name`, outside its `span.truncate`.
  *Fails if* Portfolio stops passing `marker` or the marker goes inside the truncating span.

**Team detail / compare**
- **T18** `TeamDetail.test.jsx`: `holding-<id>` contains `player-cell`. **T19**
  `PlayerDetailTabs.test.jsx`: `compare-dropdown` rows contain `player-cell`. *Fails if* either
  surface swaps in local markup.

Existing tests asserting the old sub-line text (`cells.test.jsx` `'25 · FA · 3yr'`) are updated to the
new order (`'FA · 25 · 3yr'`) — a changed behaviour, asserted, not merely edited green.

---

## 4. Done-definition specifics

`npm test` green; `npm run lint` 0; `npm run build` clean; `grep -rn "PROVISIONAL(" src/` pasted into
the hand-back (expect the BACKUP line to remain, unchanged text, in `LineupTable.jsx`). No
`factorsSchema`/`statKeysContract` relevance. No data-repo backlog line expected.

## 5. Stop-and-ask conditions (Session 2)

- §6's phone measurement of This week's frozen block right edge falls outside 257–264px: you may tune
  only the `max-w-[168px]` literal (range 150–180px, in both source and T13) to bring it inside; if no
  value in that range does, stop and report.
- Any consumer's layout breaks visibly (watermark overlapping the next column, marker popover clipped,
  compare dropdown rows overflowing 250px): stop and report — do not add `overflow-hidden` or any z-index beyond `FROZEN_POPOVER_LIFT`.
- Any test outside §3's list fails in a way that is not the sub-line order/markup change: stop.

## 6. Smoke and screenshots (Session 2)

Report numbers, not impressions. At 1440×900 and 375×812, on `/week`, `/market` (Overview), `/portfolio`:
- before (at `d9af715`, or cite §0's table) and after screenshots;
- after: row heights and rows visible at load (compare with D11); at 375: This week frozen right edge
  (expected 261), PROJ header right edge (expected 323, unchanged), Market frozen player column right
  edge (report; open item), My Team frozen right edge;
- zoomed single rows: a long name over its watermark; an FA player (plain background, `FA` text); a
  light/silver logo (e.g. `LV`, `DAL`, `NE`) where contrast is tightest; one row hovered;
- Market scrolled right at 1440 on Stats (WR) — player column stays, edge shade appears;
- open the age-caution popover (`▲ age` / `▼ age`) on a Market Model-view row near the top and on a My Team
  Starting ten row: screenshot that it paints over the rows below, not under their frozen player cells;
- pop-up compare dropdown open; `/teams/KC` holdings; no console errors.

## 7. Out of scope

Strips, usage trend, matchup-column colour (W2b-3); `TopBar`; W2a's phone scroll window, edge shade,
All-view PROJ; Market phone width cap; any data, scoring, snapshot or cross-repo change (none expected —
stop and flag if found); glossary or decimals audit beyond §1 D14.

## Verification

- **Commits:** `6d968c5` (implementation, Session 2 sonnet), `e0aa865` (Fix pass 1 spec), `941b75a` (Fix pass 1, fix-applier).
- **Review:** depth full (opus/high) on `d9af715..6d968c5` — 4 flags: (1) flagged This week row 81px → **fixed** (F1);
  (2) popover lift unproven in a browser → **resolved by evidence** (Session 1 hit test, Fix pass 1 preamble), no code
  change; (3) My Team 375 frozen edge 296px from the shared 13px name → **accepted, open item for Anton**; (4) doubled
  name-to-marker gap → **fixed** (F2). Scope items (task file, `marketWindowStatsViewOnly.test.js` whitelist,
  `Market.factViews.test.jsx`) accepted as required by D12/T14.
- **Fix-pass re-review:** light (sonnet) on `e0aa865..941b75a` — no flags.
- **Checks (Session 1, at `941b75a`):** `npm test` 189 files / 3631 passed · `npm run lint` 0 problems · `npm run build`
  passes with the pre-existing >500 kB chunk notice. Fix-pass assertions seen red by Session 1 (start/sit nowrap,
  marker wrapper `ml-1.5`; name-line `gap-` red in the stop-hook run), then restored.
- **App (Session 1, Dynasty 040, at `941b75a`):** 1440×900 — This week rows 61px, flagged row 67px (flag on one line,
  player `td` 368px); Market 65px; My Team 57px (Session 2). 375×812 — This week frozen right edge 261px, PROJ header
  323px (unchanged from W2a). Age-caution popover on Market Model and My Team Starting ten: cell `z-index: 3`,
  `elementFromPoint` inside the dialog returns the dialog. Screenshots of This week and Market at 1440 render cleanly
  (watermark at the player column's right edge, abbr-first sub-line). No console errors in the buffered messages.
- **Deviations accepted:** no Session 2 screenshots (pane hidden; Session 1 took them); Market Stats (WR) does not
  overflow at 1440 (freeze checked at 375); `PlayerCellBefore` removed per plan.
- **Open items for Anton:** My Team phone frozen edge 296px of 375; Market phone frozen player column ≈ 254px right edge
  (no width cap, per plan).
- **Cross-repo / scoring / snapshot:** none. **Backlog lines:** none.

## Fix pass 1

Triage of implementation-reviewer round 1 on `6d968c5` (full depth). Session 1 measured in the running
app at 1440×900 before writing this:
- `/week` flagged row: `tr` 81px, player `td` 343px (was 407px at `d9af715`), text column 273px, the
  start/sit line wraps to 2 lines (28px). Cause: the player column auto-sizes to its widest content and
  lost the ~44px bordered logo chip, so the long flag line (`PROJ · Josh Downs 7.6 on bench > 5.1 · OURS …`)
  no longer fits on one line. Not the descender gap (unflagged rows are exactly 61px).
- Popover lift: on `/portfolio` Starting ten and `/market` Model, opening `▲/▼ age` puts the cell at
  computed `z-index: 3`, and `document.elementFromPoint` at three points inside the open dialog (including its
  lower part, over later rows) returns the dialog every time. Tailwind emits the `has-[[role=dialog]]:z-[3]`
  variant. Reviewer flag 2 is resolved by this evidence; no code change.

### F1 — start/sit line on one line from `md` up
`src/components/week/LineupTable.jsx`, the `footer` div with `data-testid="startsit-flag"`: className
`text-[10.5px] text-dp-down-text` → `text-[10.5px] text-dp-down-text md:whitespace-nowrap`. Below `md` it keeps
wrapping (the phone cap D10 is unchanged). Expected flagged-row height at 1440: 68–72px (D11).
Test (LineupTable.test.jsx, beside T11): the `startsit-flag` className contains `md:whitespace-nowrap` and
no bare `whitespace-nowrap`. *Fails if* the class is dropped, or applied at every width (phone would overflow).

### F2 — one gap between name and marker, not two
`src/components/dp/cells.jsx` `player-cell-name`: remove `gap-1.5` (keep every other class). Reason:
`AgeCautionMarker` (`dp/TwoYearRank.jsx`) already carries `ml-1.5`, so the gap doubled to 12px on Market and
My Team. `src/components/week/LineupTable.jsx`: the marker wrapper `shrink-0 flex items-center gap-1.5` →
`ml-1.5 shrink-0 flex items-center gap-1.5` (keeps This week's 6px name-to-chip spacing).
Do **not** touch `AgeCautionMarker` (it is also used outside the cell, in `Market.jsx`, `PlayerDetailModal.jsx`
and `Portfolio.jsx`).
Test (cells.test.jsx, extend T5): `player-cell-name` className contains no `gap-` class. LineupTable.test.jsx:
the `status-flag`'s wrapper (its parent span) className contains `ml-1.5`. *Fails if* `gap-1.5` returns to the
name line, or the This week wrapper loses its margin.

### Leave alone
- My Team phone width (frozen edge 296px at 375): the cause is the shared `text-[13px]` name, which replaces the 12px
  that Portfolio's `text-xs` table used to give it. It is the brief's "same on every tab" intent, so it goes to Anton as an
  open item, not as a code change.
- Deviations 2 (`marketWindowStatsViewOnly.test.js` whitelist gains `../dp/frozen`, required by D12), 4 (Market Stats
  does not overflow at 1440; checked at 375) and 5 (`PlayerCellBefore` removed per plan): accepted.
- Scope items (task file itself, `marketWindowStatsViewOnly.test.js`, `Market.factViews.test.jsx`): accepted — the
  tests were updated by necessity for D12/T14.
- Screenshots: Session 1 takes them during verification after this fix pass.

Done-definition for the fix: `npm test`, lint, build green; each new assertion shown red with its defect
reintroduced and then reverted; one commit on main, unpushed.

Signed off by Anton 2026-11-20
