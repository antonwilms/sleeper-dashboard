# Slice 1 — The four systems (+ the coverage util)

**Program:** [dp-v2.md](dp-v2.md). Second slice; follows
[dp-v2-0-retire-light-theme.md](dp-v2-0-retire-light-theme.md) (landed `b066b34`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `b066b34` · data `f0c1fc4`.
**Design source:** `App v2 - dark data.dc.html` block **`4b`** (+ `5b`'s `SeriesBars` axis modes),
via the `DesignSync` MCP on project `e4ed4731-0d72-4e11-9da7-50bc2a2bc362`. Spec:
`design_handoff_dynasty_portfolio/README-round4-dark-data.md` → "The four systems". Reviews:
`docs/design_brief_v2/05-round4-review.md` §6 and `06-round5-review.md` §5 list decisions that must
survive — read both.

**Why this is one slice, and first.** Every remaining v2 surface assembles from these primitives. If
they land per-surface they will diverge, and the coverage/degraded vocabulary only works if there is
exactly one of it. Nothing here has a route or a data loader, so it can be accepted on unit tests
plus one visual check of the two live tables.

---

## 0. Confirmed against live source (`b066b34`)

| Fact | Site |
|---|---|
| `CareerBars` geometry is `BAR_W=6, GAP=2, H=22`, min bar height 3 | `src/components/dp/cells.jsx:63-82` |
| `CareerBars` is zero-based: `max` over `v > 0`, and `v <= 0` renders a 3px `bg-dp-border-row` stub | `cells.jsx:66,71,76` |
| `careerSparkline` is produced **once** and collapses three cases to `0` | `src/App.jsx:327-331` |
| Its slots are the **last 5 league seasons**, contiguous and identical for every player (`Object.keys(careerStats)`), `null`-padded only if the store holds fewer than 5 | `src/App.jsx:268-273` |
| `careerSparkline` has exactly **two** consumers, both `<CareerBars values={…}/>` | `market/Market.jsx:500`, `portfolio/Portfolio.jsx:310` |
| It is **not** snapshotted, **not** scored, and no test asserts on it | `grep -rn careerSparkline src/utils src/api` → none |
| KTC confidence bands already exist: `n >= 7 ? 'high' : n >= 4 ? 'medium' : 'low'`, window 8, spacing 5 days | `src/utils/ktcHistory.js:15-16,283` |
| 39 `--color-dp-*` tokens exist; the design's palette is fully tokenised **except two hexes** | `src/index.css:190-233` |
| `#2b323c` (unfilled pip) and `#3f444c` (void label / strip caption) have **no token** | `grep -c` → 0 each |
| New tokens take a **single value** and must **not** be added to the `.dark` block | `CLAUDE.md:65` / `docs/ui.md:195`, as amended by Slice 0 |

**Design geometry, read from the `4b`/`5b` markup — use these, do not re-derive:**

| Primitive | Geometry |
|---|---|
| Pips | 3 spans, `width:3px`, heights **4 / 6 / 8px** (a staircase), `gap:1.5px`, container `align-items:flex-end; height:8px` |
| `TrendCell` cell scale | `h=14`, bar `3px`, gap `1px` |
| `TrendCell` tile scale | `h=22`, bar `6px`, gap `2px` — **identical to `CareerBars`**; do not invent a third geometry |
| `TrendCell` section scale | `h=40`, bar `14px`, gap `5px` |
| `DegradedBlock` | `bg-dp-card-quiet`, `1px dashed` (colour per kind), radius `10px`, padding `15px 17px`; label mono `9.5px`/`0.08em`; rule `12px` `dp-text-3` mt-8; copy `12px` `dp-muted` mt-10, inset `10px 12px` on `bg-dp-canvas` radius `7px`, `text-wrap: pretty`; applies-line mono `9.5px` `dp-muted-2` mt-10 |
| Percentile strip caption | mono `9px`, `letter-spacing:0.06em`, the new void token |

---

## 1. Scope

**Delivers:** two tokens, one pure util, five new components, one modified component, and the
four-line producer change the modified component requires.

### 1.1 Deviation from dp-v2 §4 — this slice does touch `App.jsx`

The master plan framed Slice 1 as "pure presentational components … **no data changes**." That is
wrong, and §6 explains why: **`CareerBars` cannot implement void slots from its current input.**
`careerSparkline` already collapses "season absent", "zero games played" and "played and scored 0.0"
into the same `0`, so no rendering change can separate them. `docs/ui.md:76` already documents this
as a known limitation.

So the producer changes here, in the same slice as the renderer. The alternative — ship a void-slot
capability that can never trigger until a later slice — would put a dead branch in the one component
every later slice is supposed to be able to trust. **This entry supersedes dp-v2 §4's "no data
changes" clause for this slice only.**

The change is contained: one `map` inside one memo, no pipeline reordering, two consumers, not
snapshotted, not scored. It is nonetheless a **visible change for real users** (see §6.3), so this
slice needs a visual smoke like any other.

### 1.2 Must NOT do
- **No new surface, no route, no loader.** Nothing here fetches or is fetched for.
- **Do not re-spec `CareerBars`' geometry.** `BAR_W=6, GAP=2, H=22` is fixed by 1b and reaffirmed by
  `05-round4-review.md` §6. Void slots are additive to it.
- **Do not merge `CareerBars` and `SeriesBars`.** They use different normalisations on purpose (§5.3).
- **Do not wire any primitive into Market or Portfolio beyond what §6 requires.** `TrendCell`,
  `CoveragePips`, `DefinitionPopover` and `DegradedBlock` ship **unused** this slice, exercised only
  by their tests. That is deliberate: their first real consumers are Slices 4–7, which will have real
  data behind them.
- **No colour on pips.** Blue and amber are reserved for direction, permanently.

---

## 2. Two new tokens — `src/index.css`

Add inside the existing `--color-dp-*` block (`:190-233`), grouped with the neutrals. **Single value
each; do not add either to the `.dark` block** — per the rule as amended by Slice 0.

```css
--color-dp-muted-3:  #3f444c;   /* void-slot label, percentile-strip caption — one step below muted-2 */
--color-dp-pip-off:  #2b323c;   /* unfilled coverage pip; never a text colour */
```

Naming rationale: `#3f444c` is darker than `dp-muted-2` (`#4b5058`), so it extends that scale rather
than starting a new one. `dp-pip-off` is named for its single role because it is not on the text
ramp and must not be borrowed as one.

---

## 3. `src/utils/coverageBand.js` — new, pure

The **single** source of the coverage vocabulary. Reuses `ktcHistory`'s thresholds rather than
inventing a parallel scale.

```js
export const COVERAGE_BANDS = ['none', 'low', 'medium', 'high']   // ascending

// n = a count of observations (snapshots, seasons, games — the caller decides the unit).
// Thresholds mirror ktcHistory.js:283 exactly, extended with an explicit 'none' at 0.
export function coverageBand(n) { … }        // 0 → 'none', 1-3 → 'low', 4-6 → 'medium', >=7 → 'high'
export function pipCount(band) { … }         // 'none' 0, 'low' 1, 'medium' 2, 'high' 3
```

- `coverageBand` must return `'none'` for `null`, `undefined`, `NaN`, negatives and non-numbers —
  every "we do not know" input collapses to the band that renders `—`. Do not throw.
- `pipCount` returns `0` for an unrecognised band, not `undefined` (it feeds a render loop).
- **Do not** import `ktcHistory.js` — that module does data-store I/O. Duplicate the three
  thresholds and carry a comment naming `ktcHistory.js:283` as the source of truth they mirror, so a
  future change to one is findable from the other. (This is a deliberate, named 2-line duplication,
  not a fork of logic.)

---

## 4. `src/components/dp/CoveragePips.jsx` — new

```jsx
export function CoveragePips({ band, count, className })
```

- Takes **either** `band` (a `COVERAGE_BANDS` member) **or** `count` (a raw `n`, converted via
  `coverageBand`). If both are given, `band` wins. If neither, render the `'none'` state.
- Three spans, `width: 3px`, heights `4 / 6 / 8`, `gap: 1.5px`, container
  `flex items-end` with `height: 8px`.
- Filled = `bg-dp-text-5`. Unfilled = `bg-dp-pip-off`. **No other colour, ever, under any prop.**
- Accessibility: the pips are decorative alongside a span label in every real use, so give the
  container `aria-hidden="true"` and require callers to carry the span in text. **Do not** invent an
  `aria-label` here — a screen reader hearing "coverage: medium" with no unit is worse than the
  visible span the caller already renders.

---

## 5. `src/components/dp/SeriesBars.jsx` — new

The arbitrary-length sibling to `CareerBars`. **Never pads.**

```jsx
export function SeriesBars({ values, height = 42, barWidth = 6, gap = 2, mode = 'scaled', labels })
```

### 5.1 `mode`
- **`'scaled'`** — min–max normalised over the finite values; bars grow from the baseline. The
  caller **must** be able to state the floor, so `SeriesBars` returns nothing about it: expose the
  computed `[lo, hi]` via an optional `onDomain` callback, or accept an explicit `domain` prop. Pick
  **`domain`** — a prop is testable and keeps the component pure. When `domain` is omitted, compute
  min–max internally.
- **`'signed'`** — a real zero axis: positives above, negatives below, with a 1px `bg-dp-muted-2`
  rule at zero. Required for PROE and EPA, where a floored negative would render as the small
  positive stub that means *measured zero* — the exact confusion void slots exist to prevent
  (`06-round5-review.md` §5).

### 5.2 Null handling
A `null`/`undefined`/non-finite entry is a **void slot**, rendered exactly as §6.2 specifies. It is
excluded from the domain computation. `SeriesBars` never substitutes `0`.

### 5.3 The normalisation rule — state it in a comment at the top of both files
`CareerBars` is **zero-based** (`max` over positives, bars proportional to absolute value).
`SeriesBars`/`TrendCell` are **min–max normalised**. This is not an inconsistency to fix:

- A PPG series is meaningful against zero, so zero-based is right and 0.0 must look like nothing.
- A market-value series `9781 → 9989` is **flat** under zero-based scaling; only min–max shows the
  movement the column exists to show.

Therefore: **never render a value series with `CareerBars`, and never render a PPG series with
`SeriesBars`/`TrendCell` in `'scaled'` mode without a stated domain.** Put this rule in a comment in
`cells.jsx` and `SeriesBars.jsx` both — it is the kind of thing that gets "tidied" into a bug.

Note the design uses `dp-slate-2` for prior bars in `TrendCell`/`SeriesBars` but `CareerBars` uses
`dp-slate`. Ship as drawn; the lighter prior reads correctly against a min–max series' compressed
range.

---

## 6. `CareerBars` void slots — `cells.jsx` **and** `App.jsx`

### 6.1 The producer — `src/App.jsx:327-331`
Replace the three-way collapse with an explicit three-way distinction:

```js
const careerSparkline = paddedLast5.map(season => {
  if (season == null) return null                       // slot outside the loaded window
  const d = careerStats[season]?.[playerId]
  if (!d || !(d.gamesPlayed > 0)) return null           // no row, or 0 games → PPG has no denominator
  return Math.round((d.fantasyPoints / d.gamesPlayed) * 100) / 100   // may legitimately be 0
})
```

`null` = "no value exists". A number, **including `0`**, = "measured". Keep the comment at `:271`
honest — it currently says "padded with 0 at front"; it is now `null`.

### 6.2 The renderer — `cells.jsx:63-82`
- `null` → **void slot**: no fill, `border-top: 1px dashed` in `dp-slate-2`, occupying the full
  `BAR_W` at the baseline. No number (`CareerBars` renders no labels).
- `0` (finite, measured) → a filled **2px** stub in `dp-slate` on the baseline. This is the one place
  the design is explicit that a measured zero must still be *visible*.
- `> 0` → unchanged: `Math.max(3, round(v / max * H))`, latest `bg-dp-up`, priors `bg-dp-slate`.
- `max` computation must ignore `null` (it already ignores non-positives).
- "Latest" means the **last slot**, whether or not it is null — do not shift the highlight to the
  last *non-null* value. A player who missed 2025 should not have 2024 painted as current.

### 6.3 This is a visible change — call it out in the hand-back
Today a player with fewer than five seasons of data shows padded 3px `dp-border-row` stubs that read
as low-but-real seasons. After this they read as absent. That is the fix, and it will change how a
large share of Market rows look. Anton's smoke should look specifically at a **rookie or
second-year player** in Market and at a **player who missed a full season**.

---

## 7. `src/components/dp/TrendCell.jsx` — new

```jsx
export function TrendCell({ values, delta, window: windowLabel, band, scale = 'cell' })
```

Fixed order at every scale, no exceptions: **series → signed delta with glyph → window label.**

- `scale` ∈ `'cell' | 'tile' | 'section'` → the three geometries in §0. Implement as a lookup
  object, not three components.
- **Delta** carries a glyph first, colour second: `▲` positive `dp-up-text`, `▼` negative
  `dp-down-text`, `→` flat `dp-text-5`. Mono, `12px`, weight 600 at tile/section.
- **Window label is not optional.** If `windowLabel` is absent, that is a caller bug — render the
  cell but omit nothing else, and document that the label is what distinguishes a 13-week market
  trend from a 14-season usage trend. Do not default it to a guess.
- **Band gating**, per the round-4 spec:
  - `high` / `medium` → series + delta + window.
  - `low` → **suppress the series**, keep delta + window.
  - `none` → render `—` only.
- A **projected** point is dashed and **never joins the delta calculation**. `TrendCell` does not
  compute the delta — the caller passes it — so enforce this by documenting it and by accepting an
  optional `projectedIndex` that marks that bar dashed. Do not derive a projection from the values.
- Sorting is the caller's job and sorts on **delta**, never on shape. State it in the comment.

---

## 8. `src/components/dp/DefinitionPopover.jsx` — new

```jsx
export function DefinitionPopover({ term, scope, gloss, percentiles, band, span, field, children })
```

- `children` is the underlined trigger — dotted underline **visible at rest**
  (`border-bottom: 1px dotted dp-muted`).
- **Click, never hover.** Must work by keyboard: the trigger is a `<button>`, `Escape` closes, and
  focus returns to the trigger. Hover-only would fail touch and keyboard both.
- Content order, exactly: term + scope → one-sentence gloss → **percentile strip** → coverage pips +
  span → field expression (mono, `word-break: break-all` — some expressions are long).
- **Percentile strip:** ticks at league 10th / 50th / 90th with the subject marked. **No colour and
  no verdict** — further right is good for a receiver and bad for a runner, so the strip must not
  editorialise. Caption: `LEAGUE 10th → 90th · RAW VALUE, NOT RANK`, mono `9px`, `0.06em`,
  `text-dp-muted-3`.
- Only one popover open at a time. Own that with local state per instance plus a click-outside
  handler; **do not** add a context or a provider for this — no shared state is required and this
  repo keeps view-local state view-local.

---

## 9. `src/components/dp/DegradedBlock.jsx` — new

```jsx
export function DegradedBlock({ kind, children })
```

`kind` ∈ the **five** kinds (the fifth arrived in round 5):

| `kind` | Meaning | Border / label |
|---|---|---|
| `not-yet-accruing` | Capability real, history has not happened | `dp-border-raised` / `dp-text-5` |
| `not-measured-then` | Hard coverage cliff at a date | `dp-border-raised` / `dp-text-5` |
| `undefined-here` | No denominator for this player-game | `dp-border-raised` / `dp-text-5` |
| `never-available` | No source exists, none coming | **`dp-down-border` / `dp-down-text`** |
| `no-baseline` | The value is real; no prior snapshot to diff against | `dp-border-raised` / `dp-text-5` |

- Label text is the kind rendered as the design's uppercase mono string (`NOT YET — ACCRUING` etc.);
  map it internally so callers pass the slug, not the copy.
- Shape per §0. `children` is the one-sentence body.
- **Never a call to action.** No "check back soon", no retry, no link. The app is a static client
  over a CDN and cannot fetch what is missing. The only permitted forward-looking sentence is a
  cadence ("one column per week"). Put this in the file's header comment — it is the rule most likely
  to be violated by someone writing copy later.
- An unrecognised `kind` should render the neutral border with the slug uppercased, not crash.

---

## 10. Step sequence

1. `src/index.css` — the two tokens (§2). Nothing else in that file.
2. `src/utils/coverageBand.js` + its tests. Pure, no deps — do it first so the components can use it.
3. `CoveragePips` + tests.
4. `SeriesBars` + tests (both modes, null handling, explicit `domain`).
5. **`App.jsx:327-331` producer change, then `CareerBars`** — in that order, so the renderer is never
   built against a shape that does not exist yet. Update `CareerBars`' existing test to assert the
   new three-way behaviour (**not** edited to go green — it must assert void ≠ zero ≠ value).
6. `TrendCell` + tests.
7. `DefinitionPopover` + tests (click opens, Escape closes, focus returns, no hover dependency).
8. `DegradedBlock` + tests (all five kinds, unknown kind).
9. Docs (§12).
10. `npm test` → `npm run lint` → `npm run build`. Hand back for visual smoke.

---

## 11. Tests

Every new module gets its own test file. Specifically required:

- **`coverageBand`** — table-driven across the boundaries (`0, 1, 3, 4, 6, 7, 12`) plus the whole
  junk set (`null`, `undefined`, `NaN`, `-1`, `'4'`, `{}`) all landing on `'none'`.
- **`CareerBars`** — the three-way distinction is the point: `null` renders a void slot, `0` renders
  a visible stub, `> 0` renders a scaled bar, and **`null` and `0` render differently**. Assert that
  last one explicitly; it is the bug being fixed. Plus: `max` ignores `null`; the highlight is on the
  last slot even when that slot is null.
- **`SeriesBars`** — `'signed'` puts negatives below a zero rule; `'scaled'` honours an explicit
  `domain`; nulls are excluded from the domain and never become `0`; arbitrary length with no padding.
- **`TrendCell`** — the three scales pick the right geometry; band gating (`low` suppresses the
  series, `none` renders `—`); glyph precedes colour for all three directions; `projectedIndex` marks
  a dashed bar.
- **`DefinitionPopover`** — opens on click, closes on `Escape` with focus returned, is **not**
  hover-dependent, and renders the content in the specified order.
- **`DegradedBlock`** — each of the five kinds renders its label and border; `never-available` gets
  the amber pair; an unknown kind degrades rather than throwing.
- **No test asserts on colour hex.** Assert on the token class name (`bg-dp-pip-off`) — the repo's
  convention is tokens, and a hex assertion breaks on any retint.

Test-count expectation: this slice **adds** substantially (7 new files). A drop anywhere is a signal.

---

## 12. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `src/components/` table | Five new `dp/*` rows; note `CareerBars` gained void slots and that `cells.jsx` now carries the normalisation rule |
| `CLAUDE.md` `src/utils/` table | `coverageBand.js` row — name it the single source of the coverage vocabulary, mirroring `ktcHistory.js:283` |
| `CLAUDE.md` colour-tokens note | The two new tokens; reaffirm single-value (Slice 0's amended rule) |
| `CLAUDE.md` playerRows pipeline section | `careerSparkline` now emits `null` for absent — it is a documented field shape |
| `docs/ui.md:76` | **Delete the known-limitation sentence** ("`careerSparkline` 0-pads absent seasons, so 'missing season' and 'genuine 0.0 PPG season' are the same value and cannot be rendered differently") — this slice fixes exactly that |
| `docs/ui.md` | New "Systems" section: the coverage bands, the one trend treatment, definitions, the five degraded kinds, and the two normalisation regimes |
| `docs/architecture.md` | `careerSparkline`'s shape, if it is described there |

---

## 13. Cross-repo impact

**None.** No served family, no manifest field, no stat key, no shape crossing the boundary.
`careerSparkline` is computed in the app from `careerStats` and never written back. State this
explicitly in the hand-back per the registry rule.

---

## 14. Done-definition

- [ ] Two tokens added, single-value, **not** in the `.dark` block
- [ ] `coverageBand.js` does not import `ktcHistory.js`, and carries the comment naming `:283`
- [ ] `CoveragePips` renders no colour under any prop
- [ ] `SeriesBars` never pads and never substitutes `0` for a null
- [ ] `CareerBars` geometry unchanged (`6 / 2 / 22`); void ≠ zero asserted by test
- [ ] `App.jsx:327-331` emits `null`; the `:271` comment updated
- [ ] `TrendCell` renders series → delta → window in that order at all three scales
- [ ] `DefinitionPopover` works by keyboard alone
- [ ] `DegradedBlock` has all five kinds and no call to action anywhere in it
- [ ] The normalisation rule is commented in **both** `cells.jsx` and `SeriesBars.jsx`
- [ ] `npm test` green · `npm run lint` 0 problems **in `src/`** (see below) · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` pasted — expect Slice ii's three, unchanged
- [ ] Docs per §12, including the `ui.md:76` deletion
- [ ] Hand back for visual smoke. **Do not run the dev server.**

**Known pre-existing lint noise:** `npm run lint` reports 6 problems in
`docs/design_handoff_dynasty_portfolio/support.js`, a vendored generated prototype runtime, unchanged
since `bc159ad`. CLAUDE.md's "0 problems" is currently unachievable because of it. **Treat the bar as
0 problems in `src/`** and do not attempt to fix `support.js`. A separate one-line change adding
`docs/design_handoff_dynasty_portfolio/**` to `eslint.config.js`'s `globalIgnores` is queued outside
this slice.

---

## 15. Hand-back should report

- Confirmation that `CareerBars`' geometry constants are untouched.
- The `CareerBars` test assertion that proves `null` and `0` render differently, quoted.
- Which Market rows changed appearance and how (§6.3) — name a rookie you checked.
- Whether anything in §0 had drifted from `b066b34`.
- New test count, per file.
