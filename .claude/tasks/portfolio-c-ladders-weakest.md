# Slice C — League ladders and weakest slots

**Repo:** `sleeper-dashboard`. **Session 2 model:** sonnet.
**Depends on:** Slice A (`src/utils/lineup.js`, `.claude/tasks/lineup-engine.md` §2.3/§2.4) and
Slice B (`.claude/tasks/portfolio-b-starting-ten.md` — read §0 D6 and the tiles section for the
rank-colour and `—` conventions this slice follows).
**Design source:** `Portfolio v4 - football first.dc.html`, the *"Where you rank, out of twelve"* and
*"Weakest slots, in points"* blocks (the `<!-- ── vs the league, on points ── -->` grid). **Not in the
repo** — it is inside `~/Downloads/App design overhaul(1).zip`; extract to a scratch dir to read it.
Ignore `<x-dc>`/`support.js`; `<sc-for>` is a `.map()`. The `NFL offences` block in the same file is
**not** this slice.
**Not scoring-affecting.** View-layer only; no memo in the `playerRows` pipeline changes; no
`App.jsx` change. Two presentation blocks over data Slice A already computes.

---

## 0. Decision summary (read first — each departs from the originating brief or the design, with the reason)

| # | Brief / design said | This plan does | Why |
|---|---|---|---|
| C1 | Sparkline + "season: …" line under MOVE | **Cut**, per the brief. The caption also loses its trailing clause `; the line under it is how the gap to the median moved across 2025` — §2.1 gives the final caption verbatim. No placeholder, no empty column. | The brief cuts it. Leaving the clause would describe an element that is not there. MOVE's column narrows from the design's `120px` to `96px` as a result. |
| C2 | Design hard-codes twelve rungs and `rankC = r => r <= 4 ? UPT : r >= 9 ? DNT : …` | Rung count is `teamCount` (`leagueLineups.length`); the tone boundary is `third = Math.ceil(teamCount / 3)` → `r <= third` up, `r > teamCount - third` down. | At `teamCount === 12` this is **exactly** the design (`third` = 4 → `≤4` / `≥9`), and it is the boundary Slice B already uses for the tiles (`Portfolio.jsx:428`). A 10- or 14-team league would otherwise colour nonsense. The brief's stated boundaries are satisfied. |
| C3 | Copy is final: "out of twelve", "twelve rungs" | Count spelled from `teamCount` via a local `countWord` (2–20 word map, numeral beyond). Title `Where you rank, out of {countWord(teamCount)}`; caption `Each ladder has {countWord(teamCount)} rungs, …`. | The sentence is final; the number in it is data. At twelve teams the rendered strings are character-identical to the design. |
| C4 | Design: seasons written `2025 · SCORED` / `2026 · PROJECTED` | `{dataSeason} · SCORED` / `{projSeason} · PROJECTED`, `—` for a null season — the Slice B tile-label convention. | `dataSeason` is `deriveDataSeason(careerStats)`; hard-coding a year would go stale and contradict the tiles two blocks above. |
| C5 | Design's neutral rank colour `#f2f3f5` (`dp-text`); Slice B's `rankClass` neutral is `text-dp-text-5` | This block defines its **own** `rankTone` with neutral `text-dp-text`, and does not reuse `Portfolio.jsx`'s `rankClass`. Rung fill neutral is `bg-dp-text-strong` (`#e6e8eb`), one step off the number's — also the design. | The design's `rankC` is explicit and differs from the tiles'. Two near-identical helpers is the smaller cost; sharing one would silently restyle Slice B's tiles. |
| C6 | Ladder rows keyed by slot, design labels `RB1`/`RB2` | `buildWeakestSlots` gains a `position` field (§1); the weakest-slot row label numbers **repeated slot types** (`RB` ×2 → `RB1`, `RB2`; a slot type occurring once keeps its bare label). | `position` is already on the slot object `buildWeakestSlots` is reading (`lineup.js:40`, `:124`) — it just is not carried out. Returning it removes a `slots[slotIndex]` index-join in the view, which is exactly the "recomputing lineups here" the brief forbids. Numbering is needed because two rows would otherwise both read `RB`. |
| C7 | Design bar widths normalise by a literal `18` | `scaleMax` = the largest `median` across the **rendered** rows (`loss > 0` ⇒ `median > mine`, so `median` is always the row's larger number); widths clamped to `[0, 100]` and `mineW + lossW ≤ 100`. | `18` is an artboard constant. A scale taken from the rendered data can never overflow the track, which §3 of the brief requires. |
| C8 | Summary line "is computed, not written" | The rule in §2.4, over the rendered rows only. On the design's own numbers it reproduces the design's sentence **verbatim** — a test asserts that. | The design gives one sentence and no rule; the rule has to be inferred. Reproducing that sentence from the design's data is the only available check that the inference is right. |
| C9 | — | Two new presentational components with plain data props, not more code inside `Portfolio.jsx` | `Portfolio.jsx` is already 855 lines. Props-shaped components let the boundary tests (§4) build a twelve-team ladder directly instead of driving a twelve-roster `Portfolio`. |
| C10 | — | `SLOT_LABEL`/`slotLabel` move from `Portfolio.jsx` to a new `src/components/portfolio/slotLabel.js` | Both `Portfolio.jsx` (Starting ten) and `WeakestSlots.jsx` need it. Importing it from the sibling component would be a cycle. Pure move, no behaviour change. |
| C11 | — | Block order: header → Starting ten → **this row** → Bench | The design reads "who starts and what they score; how that lineup stacks up against the league; … who is behind them" (its closing note). Bench stays last. |

**Cross-repo impact: none.** This slice reads only in-app derived state and adds no data-store field,
no snapshot field and no served-file dependency. No `CR-NN` entry in
[docs/cross-repo-registry.md](docs/cross-repo-registry.md) is touched, so no `Mirror` text is owed.

**PROVISIONAL inventory: no new tags.** Every figure rendered here is engine output over real
`careerStats`/`seasonProjections`. Nothing is stood in for. Paste the output of
`grep -rn "PROVISIONAL(" src/` into the hand-back unchanged from `main`.

---

## 1. `src/utils/lineup.js` — one field added

In `buildWeakestSlots`, add `position` to the pushed object. Nothing else in the file changes; it
stays a leaf that imports nothing.

```js
results.push({
  slot: mine[i].slot, slotIndex: i, player_id: mine[i].player_id, name: mine[i].name,
  position: mine[i].position,
  mine: mine[i].points, median: med, loss,
})
```

Place `position` exactly where shown (after `name`, before `mine`) so the shape reads
slot → identity → points. Do not change the filter, the median rule, or the sort.

---

## 2. `src/components/portfolio/` — new files

### 2.0 `slotLabel.js` (pure move, C10)

```js
// Starting-slot display labels, shared by the Starting ten table and the weakest-slots list.
export const SLOT_LABEL = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLX', SUPER_FLEX: 'SF' }
export const slotLabel = s => SLOT_LABEL[s] ?? s
```

Delete both from `Portfolio.jsx` (`Portfolio.jsx:27-28`) and import them there instead. No other
change to how Starting ten renders its slot column.

### 2.1 `LeagueLadders.jsx`

```js
export function LeagueLadders({ ladders = [], teamCount = 0, dataSeason = null, projSeason = null })
```

**Card:** `bg-dp-card border border-dp-border rounded-[10px] px-[18px] pt-3.5 pb-3.5`,
`data-testid="league-ladders"`.

**Head** — `flex flex-wrap items-baseline gap-2.5`:
- `Where you rank, out of {countWord(teamCount)}` — `text-[13px] font-semibold text-dp-text-strong`.
  `teamCount === 0` → the bare `Where you rank`; never `out of zero`.
- `by points from the starters at each position` — `text-[11.5px] text-dp-muted`
- `1ST ← LADDER → {ordinal(teamCount).toUpperCase()}` — `ml-auto font-dp-mono text-[10px] tracking-[0.06em] text-dp-muted-2`. Omit this span when `teamCount === 0`.

`ordinal` is the same algorithm as `Portfolio.jsx:41`. Export it from `slotLabel.js`? **No** — keep
`Portfolio.jsx`'s copy where it is and write a local `ordinal` in this file. (Two five-line copies;
moving it would touch the pick rows, which are out of scope.)

`countWord(n)`: `['zero','one','two',…,'twenty'][n]` for `n` in `0…20`, else `String(n)`. Lower-case;
the title and caption both use it mid-sentence.

**Empty:** `ladders.length === 0` → head, then
`<p class="text-sm text-dp-muted py-6">No league lineups — league rosters or slots not loaded.</p>`,
and nothing else (no column header, no caption).

**Column header** — same grid template as a row, `font-dp-mono text-[9.5px] tracking-[0.08em]
text-dp-muted-2 mt-3`, cells: `''`, `{dataSeason ?? '—'} · SCORED`, `{projSeason ?? '—'} · PROJECTED`, `MOVE`.

**Grid template** (header row and every ladder row):
```
grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_72px] gap-x-3
 sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)_96px] sm:gap-x-[22px]
```
`minmax(0,1fr)` (not `1fr`) is load-bearing: it is what stops the rung strip forcing the page wider
than the viewport.

**Rows** — one per entry of `ladders`, in the array's own order (`QB, RB, WR, TE, Lineup`), keyed by
`pos`, `data-testid={`ladder-row-${pos}`}`, `items-center py-3 border-t border-dp-border-row`.

| Cell | Content |
|---|---|
| 1 | `{pos}` — `text-sm font-bold text-dp-text`; under it `{slotsLabel}` — `text-[10.5px] text-dp-muted mt-px` |
| 2 | rank + ladder for `lastRank` / `lastAll`, `data-testid="ladder-last"` |
| 3 | rank + ladder for `projRank` / `projAll`, `data-testid="ladder-proj"` |
| 4 | MOVE — §2.2 |

`slotsLabel` comes from Slice A verbatim (`ladders[i].slotsLabel`). Do not re-derive it and do not
hard-code "2 slots + 1 flex".

**Rank + ladder cell** — `flex items-center gap-2 sm:gap-3`:
- rank number: `font-dp-mono text-base sm:text-lg font-semibold w-[34px] sm:w-[44px] shrink-0`, class
  from `rankTone(rank, teamCount)`, text `ordinal(rank)`; `rank == null` → `—` in `text-dp-muted`.
  `data-testid="ladder-rank"`.
- rung strip: `flex gap-[2px] sm:gap-[3px] items-start h-3.5 flex-1 min-w-0`, containing `teamCount`
  rungs. Rung `i` (0-based): wrapper `flex-1 min-w-0 h-3.5`; inner `w-full rounded-[2px]`.
  - `rank != null && i + 1 === rank` → inner `h-3.5` (no top padding), background
    `rungFill(rank, teamCount)`, `data-testid="rung-mine"`.
  - otherwise → wrapper `pt-1`, inner `h-1.5 bg-dp-border`.

```js
const third = n => Math.ceil(n / 3)
// Design's rankC, generalised off 12 teams (C2). Used for the rank NUMBER.
const rankTone = (r, n) =>
  r == null ? 'text-dp-muted'
    : r <= third(n) ? 'text-dp-up-text'
    : r > n - third(n) ? 'text-dp-down-text'
    : 'text-dp-text'
// The rung FILL — one step stronger than the number, per the design.
const rungFill = (r, n) =>
  r <= third(n) ? 'bg-dp-up' : r > n - third(n) ? 'bg-dp-down' : 'bg-dp-text-strong'
```

`lastAll` / `projAll` are **not** read for geometry. The ladder is positioned by rank alone —
rungs are evenly spaced whatever the point gaps are (the brief's stated intent). The arrays stay in
the props only so a later slice can add hover detail without a signature change; if Session 2 finds
itself indexing them, it has misread this paragraph.

**Caption** — `text-[11px] text-dp-muted leading-normal mt-1 pt-2.5 border-t border-dp-border-row`,
`text-wrap:pretty` via `[text-wrap:pretty]`:

> Each ladder has {countWord(teamCount)} rungs, one per team, best on the left. The tall rung is you. MOVE is how many places the {projSeason} projection shifts you.

`projSeason == null` → `the projection shifts you` (drop the year and its space, keep the rest).

### 2.2 MOVE cell

`data-testid="ladder-move"`, `font-dp-mono text-xs font-semibold`.

| `move` | Text | Class |
|---|---|---|
| `< 0` | `up {−move}` | `text-dp-up-text` |
| `> 0` | `down {move}` | `text-dp-down-text` |
| `=== 0` | `no change` | `text-dp-text-5` |
| `null` | `—` | `text-dp-muted` |

`move = projRank − lastRank` is Slice A's, already signed so that **negative is better**
(`lineup.js` header comment above `buildPositionLadders`). Do not re-derive or re-sign it.

### 2.3 `WeakestSlots.jsx`

```js
export function WeakestSlots({ rows = [], slots = [] })
```

`rows` is `buildWeakestSlots(...)` output **unsliced**; the component renders
`rows.slice(0, WEAKEST_ROW_LIMIT)` with `const WEAKEST_ROW_LIMIT = 4`, and the summary (§2.4) is
computed over those rendered rows only. `slots` is `myLineup.slots` — used for labels only.

**Card:** `bg-dp-card border border-dp-border rounded-[10px] px-[18px] pt-3.5 pb-3`,
`data-testid="weakest-slots"`.

**Head** — `flex flex-wrap items-baseline gap-2.5`:
- `Weakest slots, in points` — `text-[13px] font-semibold text-dp-text-strong`
- `vs the median starter at that slot` — `text-[11.5px] text-dp-muted`

**Row labels.** Build once from `slots`: for index `i`, base = `slotLabel(slots[i].slot)`; if that
slot **type** occurs more than once in `slots`, append its 1-based occurrence number among slots of
that same type (`RB,RB` → `RB1`,`RB2`; `FLEX,FLEX` → `FLX1`,`FLX2`; a lone `TE` stays `TE`). A row
whose `slotIndex` is out of range for `slots` falls back to `slotLabel(row.slot)`.

**Rows** — `grid grid-cols-[34px_minmax(0,1fr)_110px] gap-2.5 items-center py-[9px]
border-t border-dp-border-row`, `data-testid={`weak-row-${row.slotIndex}`}`, keyed by `slotIndex`.

1. label — `font-dp-mono text-[11px] font-semibold text-dp-text`
2. `min-w-0`:
   - name — `text-xs text-dp-text-2 truncate`; `name == null` → `—` in `text-dp-muted`
   - bar — wrapper `relative h-2 mt-[5px]`; mine `absolute left-0 top-px h-1.5 rounded-[2px] bg-dp-slate`; loss `absolute top-px h-1.5 rounded-r-[2px] bg-dp-down opacity-85`, `left` = `mineW%`
3. `text-right`:
   - `−{f1(loss)} ppg` — `font-dp-mono text-xs font-semibold text-dp-down-text` (U+2212, the Slice B minus)
   - `{f1(mine)} vs med {f1(median)}` — `font-dp-mono text-[10px] text-dp-muted`

**Bar widths** (C7), over the rendered rows:
```js
const scaleMax = Math.max(...rendered.map(r => r.median), 0)
const pct = v => (scaleMax > 0 ? Math.max(0, Math.min(100, (v / scaleMax) * 100)) : 0)
const mineW = pct(r.mine)              // negative points clamp to 0
const lossW = Math.min(pct(r.loss), 100 - mineW)
```
`f1 = v => v.toFixed(1)`; a `null` never reaches these (`buildWeakestSlots` filters non-finite
`mine` and null medians before it pushes).

**Empty:** `rendered.length === 0` → head, then the summary paragraph alone (§2.4's step 1 or 2
text). No rows, no divider, no zero-height bar.

**Unloaded is not the same as healthy.** `buildWeakestSlots` returns `[]` both when no slot is
losing and when there is no lineup at all (`lineup.js:288-289`, a missing roster or empty
`leagueLineups`). `slots` is the discriminator: `slots.length === 0` means there is no lineup, and
the summary paragraph reads `No starting lineup — league slots or roster not loaded.` — it is
§2.4's step 1, the same single `<p data-testid="weak-summary">` with the same classes, not a second
node. Only a non-empty `slots` with no losing row may claim nothing is losing.

### 2.4 The computed summary

`data-testid="weak-summary"`, `text-[11px] text-dp-muted leading-normal mt-2 pt-2.5
border-t border-dp-border-row [text-wrap:pretty]`. One paragraph, built in this order:

```js
const POS_NOUN = {
  QB: ['quarterback', 'quarterbacks'], RB: ['running back', 'running backs'],
  WR: ['wide receiver', 'wide receivers'], TE: ['tight end', 'tight ends'],
}
const COUNT_WORD = ['zero', 'one', 'two', 'three', 'four']
```

1. `slots.length === 0` → **`No starting lineup — league slots or roster not loaded.`** Stop.
   (Never the next line: an unloaded league has not been measured.)
2. `rendered.length === 0` → **`No starting slot is losing points to a median lineup.`** Stop.
3. `total = Σ loss`. `Math.round(total) < 1` → **`No starting slot costs you as much as a point a week against a median lineup.`** Stop.
4. **Dominant set `P`** — the shortest prefix of `rendered` (already sorted by loss desc) whose
   cumulative loss is `>= 0.6 * total`. Always non-empty.
5. Group `P` by `position`, in first-appearance order. Phrase group `g` of size `n` as
   `${COUNT_WORD[n]} ${POS_NOUN[g][n === 1 ? 0 : 1]}`; capitalise the **first** group's count word
   only; join groups with ` and `. A `position` outside `POS_NOUN` (it cannot be, Slice A filters to
   `LINEUP_POSITIONS`) falls back to `${COUNT_WORD[n]} ${g} slot${n === 1 ? '' : 's'}`.
6. `cost = Math.round(Σ loss over P)`; verb `P.length === 1 ? 'costs' : 'cost'`; unit
   `cost === 1 ? 'point' : 'points'`.
   → `` `${groups} ${verb} you about ${cost} ${unit} a week against a median lineup.` ``
7. Tail over `R = rendered` minus `P`:
   - `R` empty → no tail.
   - `Math.max(...R.loss) < 3` → ` Everything else is within a field goal.`
   - else → `` ` The rest adds another ${Math.round(Σ R loss)} points a week.` ``

**Check against the design.** Its four rows are `RB1 11.8 / 15.4`, `RB2 12.1 / 14.3`,
`FLX 10.9 / 12.6`, `SF 15.8 / 17.1` → losses `3.6, 2.2, 1.7, 1.3`, total `8.8`, threshold `5.28`.
Prefix `[3.6]` = 3.6 is short; `[3.6, 2.2]` = 5.8 clears it → `P` = both RBs, `cost = 6`; `R` max is
1.7 < 3. Output:

> Two running backs cost you about 6 points a week against a median lineup. Everything else is within a field goal.

Character-identical to the design's line. §4 asserts exactly this.

---

## 3. `Portfolio.jsx` — wiring

1. Import `buildWeakestSlots` alongside the existing four `lineup.js` imports; import
   `LeagueLadders`, `WeakestSlots`, and `slotLabel`/`SLOT_LABEL` from their new files; delete the
   local `SLOT_LABEL`/`slotLabel` pair.
2. New memo, beside the existing `slotMedians` memo (`Portfolio.jsx:270`):
   ```js
   const weakestSlots = useMemo(() => buildWeakestSlots(leagueLineups, myRosterId), [leagueLineups, myRosterId])
   ```
3. Insert **between the Starting ten block's closing `</div>` and the Bench block** (C11):
   ```jsx
   {/* ── Where you rank / Weakest slots ── */}
   <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-[18px] items-start">
     <LeagueLadders ladders={ladders} teamCount={teamCount} dataSeason={dataSeason} projSeason={projSeason} />
     <WeakestSlots rows={weakestSlots} slots={myLineup?.slots ?? []} />
   </div>
   ```
   Inside the existing `myTeamName != null` return, a sibling of the Starting ten and Bench blocks
   under the same `flex flex-col gap-[18px]` wrapper.

Nothing else in `Portfolio.jsx` changes. `ladders`, `ladderBy`, `teamCount`, `dataSeason`,
`projSeason`, `myLineup` all already exist; do not duplicate or re-memo them, and do not touch the
summary sentence, tiles, Starting ten or Bench.

---

## 4. Tests

`npm test` green, `npm run lint` 0 problems, `npm run build` clean.

### 4.1 `src/utils/lineup.test.js` — extend `describe('buildWeakestSlots')`
- A returned row carries `position` matching the player's own position, including a FLEX-filled slot
  (slot `FLEX`, position `RB`) — the join C6 removes depends on it.

### 4.2 `src/components/portfolio/LeagueLadders.test.jsx` (new)

Build `ladders` props directly — no `Portfolio`, no twelve rosters. One helper:
```js
const row = (pos, lastRank, projRank, over = {}) => ({
  pos, slotsLabel: '2 slots + 1 flex',
  lastMine: 30, lastRank, lastMedian: 32, lastAll: [],
  projMine: 31, projRank, projMedian: 33, projAll: [],
  move: lastRank != null && projRank != null ? projRank - lastRank : null,
  ...over,
})
```

- **Rank-tone boundaries at `teamCount = 12`** (the brief's named cases). For `projRank` 4 / 5 / 8 / 9,
  assert the `ladder-proj` rank span's class and the `rung-mine` fill together:
  | rank | number | rung |
  |---|---|---|
  | 4 | `text-dp-up-text` | `bg-dp-up` |
  | 5 | `text-dp-text` | `bg-dp-text-strong` |
  | 8 | `text-dp-text` | `bg-dp-text-strong` |
  | 9 | `text-dp-down-text` | `bg-dp-down` |
  Assert `text-dp-up-text` is **absent** from the 5th-place number, so a substring match on a
  longer class string cannot pass the test by accident.
- **MOVE, all three directions plus null**: `(last 6, proj 3)` → `up 3` + `text-dp-up-text`;
  `(3, 6)` → `down 3` + `text-dp-down-text`; `(4, 4)` → `no change` + `text-dp-text-5`;
  `(null, 4)` and `(4, null)` → `—` + `text-dp-muted`.
- **Rung count follows `teamCount`**: `teamCount = 10` → each ladder cell has 10 rung wrappers and
  exactly one `rung-mine`; `rank == null` → zero `rung-mine` and the rank reads `—`.
- **Copy**: `teamCount = 12` → title `Where you rank, out of twelve`, meta `1ST ← LADDER → 12TH`,
  caption `Each ladder has twelve rungs, one per team, best on the left. The tall rung is you. MOVE is how many places the 2026 projection shifts you.` (with `projSeason = 2026`), and the caption contains
  **no** `season:` / `gap` clause. `teamCount = 10` → `out of ten` / `ten rungs`.
- **Season labels**: `dataSeason = 2025, projSeason = 2026` → `2025 · SCORED`, `2026 · PROJECTED`;
  both null → `— · SCORED`, `— · PROJECTED`, and the caption's `the projection shifts you`.
- **`slotsLabel` is rendered from the prop**, not derived: a row with `slotsLabel: '3 slots + 1 flex'`
  shows that string.
- **Empty**: `ladders = []`, `teamCount = 0` → the `No league lineups` line, no column header, no
  caption, title is the bare `Where you rank`, and the `LADDER` meta span is absent. Assert the
  rendered card contains neither `out of` nor `zero`.

### 4.3 `src/components/portfolio/WeakestSlots.test.jsx` (new)

- **The design's four rows reproduce the design's summary verbatim** (§2.4's worked example), and
  each row shows its `−{loss} ppg` and `{mine} vs med {median}`.
- **Empty state** (the brief's named case): `rows = []` with a **non-empty** `slots` →
  `No starting slot is losing points to a median lineup.`, and no `weak-row-*` node. Assert this is
  what `buildWeakestSlots` actually returns for a roster that loses nowhere: build a two-team
  `leagueLineups` where my slots all beat the other team's, call `buildWeakestSlots`, expect `[]`,
  and render that result against that lineup's own `slots`.
- **Unloaded is distinguished from healthy**: `rows = []` **and** `slots = []` → `weak-summary`
  reads `No starting lineup — league slots or roster not loaded.`, the healthy sentence is absent,
  and there is exactly one `weak-summary` node.
- **Sub-point losses**: rows whose total rounds below 1 → the `as much as a point a week` line.
- **Row cap**: six losing rows → four `weak-row-*` nodes, and the summary's arithmetic uses only
  those four.
- **Slot numbering**: `slots` `['QB','RB','RB','TE','FLEX','FLEX']` → rows at index 1/2 read `RB1`/`RB2`,
  index 4/5 read `FLX1`/`FLX2`, index 3 reads `TE`.
- **Bar widths never overflow**: for every rendered row, `mineW + lossW <= 100` and each is `>= 0`,
  read off the inline `style.width`/`style.left`. Include a row with `mine` negative → `mineW === 0`.
- **Singular grammar**: one losing slot of 4.0 against a 1.0 second row → `One running back costs you
  about 4 points a week …`.
- **Two positions**: a set whose dominant prefix is 2 RB + 1 TE → `Three running backs and one tight
  end …` is wrong; assert the actual grouped form `Two running backs and one tight end cost you
  about N points a week against a median lineup.`

### 4.4 `src/components/portfolio/Portfolio.test.jsx` — integration only
- In `Fixture M`, both `league-ladders` and `weakest-slots` are in the document, and `league-ladders`
  renders five `ladder-row-*` rows (`QB`, `RB`, `WR`, `TE`, `Lineup`). No re-testing of tone or copy
  here — 4.2/4.3 own that.
- `myTeamName = null` → neither testid is present (the existing empty-state test's file, one
  added assertion).

---

## 5. Done

Done-definition in `CLAUDE.md`, including the smoke-test: run the app from `.claude/launch.json`,
open `/portfolio`, and report what the two new blocks show — rung positions against the rank
numbers, the MOVE column, the weakest-slots bars and the generated summary sentence. A ladder whose
tall rung disagrees with its ordinal, or a summary naming a position that is not in the list above
it, is a failure even with tests green.

**Files touched:** `src/utils/lineup.js`, `src/utils/lineup.test.js`,
`src/components/portfolio/slotLabel.js` (new), `LeagueLadders.jsx` (new), `LeagueLadders.test.jsx`
(new), `WeakestSlots.jsx` (new), `WeakestSlots.test.jsx` (new), `Portfolio.jsx`,
`Portfolio.test.jsx`, `docs/nav/components.md` (rows for the three new modules; amend the
`Portfolio.jsx` row to name the two blocks and where `slotLabel` now lives),
`docs/nav/utils.md` (the `lineup.js` row's `buildWeakestSlots` clause gains `position`, and its
closing "Rendered by" clause gains the two new components).
