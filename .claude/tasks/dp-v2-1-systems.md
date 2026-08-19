# Slice 1 — The four systems (+ the coverage util)

**Program:** [dp-v2.md](dp-v2.md). Second slice; follows
[dp-v2-0-retire-light-theme.md](dp-v2-0-retire-light-theme.md) (landed `b066b34`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `b066b34` · data `f0c1fc4`.
**Design source — NOT in this repo.** `App v2 - dark data.dc.html` (block `4b`, plus `5b`'s
`SeriesBars` axis modes) and `README-round4-dark-data.md` live only in the Claude Design project
`e4ed4731-0d72-4e11-9da7-50bc2a2bc362`, reachable via the `DesignSync` MCP. **Do not go looking for
them on disk** — `docs/design_handoff_dynasty_portfolio/` holds the *previous* round's bundle and has
no round-4/5 files. §0 below restates every dimension, colour and rule this slice needs, so no design
access is required to implement it. Reviews that *are* in the repo, and that list decisions which must
survive: `docs/design_brief_v2/05-round4-review.md` §6 and `06-round5-review.md` §5.

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
| **`TrendCell` already exists** — a module-local, unexported `function TrendCell({ trend })` rendering the Outlook set's Snap/Opp trend cells | `market/Market.jsx:182`, used at `:563-564` — see §7.1 |
| **No test renders `CareerBars`** — there is no `cells.test.jsx` | `grep -rln CareerBars src --include='*.test.*'` → none |
| `careerSparkline` appears in **7 test fixtures**, all encoding the current 0-padded meaning | `market/Market.test.jsx:61,68,75,82,89,119`; `portfolio/Portfolio.test.jsx:16` — see §6.4 |
| Vitest is `environment: 'node'` globally with **no `setupFiles`**; the 10 existing component tests each carry a `// @vitest-environment jsdom` pragma | `vitest.config.js:10,15` |
| **`@testing-library/user-event` is not a dependency** | `package.json` — see §11.1 |

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
--color-dp-muted-3:  #3f444c;   /* percentile-strip caption — one step below muted-2 */
--color-dp-pip-off:  #2b323c;   /* unfilled coverage pip; never a text colour */
```

Naming rationale: `#3f444c` is darker than `dp-muted-2` (`#4b5058`), so it extends that scale rather
than starting a new one. `dp-pip-off` is named for its single role because it is not on the text ramp
and must not be borrowed as one. Note `dp-muted-3`'s **only consumer this slice is §8's
percentile-strip caption** — the design also uses it for a void slot's dropped axis label, but
`CareerBars` renders no labels, so that use arrives with Slice 4's labelled charts.

---

## 3. `src/utils/coverageBand.js` — new, pure

The **single** source of the coverage vocabulary. Reuses `ktcHistory`'s thresholds rather than
inventing a parallel scale.

```js
export const COVERAGE_BANDS = ['none', 'low', 'medium', 'high']   // ascending

// n = a count of observations (snapshots, seasons, games — the caller decides the unit).
export function coverageBand(n) { … }        // 0 → 'none', 1-3 → 'low', 4-6 → 'medium', >=7 → 'high'
export function pipCount(band) { … }         // 'none' 0, 'low' 1, 'medium' 2, 'high' 3
```

**It does not mirror `ktcHistory` exactly, and the one difference is deliberate.**
`computeKtcSignals` returns `'none'` for `n < 2` (`ktcHistory.js:259-275`) — its floor is **2**, not
1, because every signal it emits is a *trend* and a trend needs two observations. `coverageBand`
describes whether a **value is readable**, which takes one observation, so `n = 1` is `'low'` here and
`'none'` there. Carry that as a comment naming both line ranges. The consequence is handled in §7.2:
`TrendCell` must never infer that a delta exists from the band.

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
export function SeriesBars({ values, height = 42, barWidth = 6, gap = 2, mode = 'scaled', domain })
```

### 5.1 `mode`
- **`'scaled'`** — min–max normalised over the finite values; bars grow from the baseline. Takes an
  optional **`domain`** prop (`[lo, hi]`); when omitted, computes min–max internally. A prop rather
  than an `onDomain` callback because the caller has to *print* the floor on the card
  (`AXIS 27.0–30.1s`), and a component that computes a number the caller must display is a component
  the caller has to re-derive. Passing it in keeps one source.
- **No `labels` prop.** This primitive draws bars only. The labelled variant is the Overview career
  chart, a Slice 4 concern — do not build it here on spec.
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
**Only `Number.isFinite(v)` counts as measured.** `null`, `undefined`, `NaN` and any non-number are
all void slots. Do not write the branch as `v === null` — a `NaN` reaching the measured-zero branch
would paint a filled stub that asserts a measurement that never happened, which is the precise failure
this change exists to prevent. (§5.2 closes the same hole in `SeriesBars`; close it here too.)

- **Void** (not finite) → no fill, `border-top: 1px dashed` in `dp-slate-2`, occupying the full
  `BAR_W` at the baseline. No number (`CareerBars` renders no labels).
- **Measured `0`** → a filled **2px** stub on the baseline. The design is explicit that a measured
  zero must stay *visible*.
- **`> 0`** → unchanged: `Math.max(3, round(v / max * H))`.
- `max` ignores non-finite entries (it already ignores non-positives).

**The highlight is positional, and this needs stating precisely because the original draft of this
section contradicted itself.** The last slot is the current season. So:
- Last slot `> 0` → `bg-dp-up`, as today.
- Last slot a **measured 0** → the 2px stub takes `bg-dp-up`, **not** `dp-slate`. It is still the
  current season; a 0.0 season should not silently lose the highlight.
- Last slot **void** → it renders as a void slot and **no bar carries `bg-dp-up` at all**. Do not
  shift the highlight back to the last non-null value: a player who missed 2025 must not have 2024
  painted as current.
- Priors, measured, any value → `bg-dp-slate`.

### 6.4 Seven test fixtures encode the old meaning — update them deliberately
`careerSparkline` appears in 7 fixtures (§0). They all use `0` for "this player has no season here",
which is exactly the ambiguity being removed. **The tests stay green either way**, so nothing will
catch that they now describe a shape the producer no longer emits — which makes this the one part of
this slice that has to be done on purpose rather than under test pressure.

- `[0, 0, 10, 14, 16]` and the other partial rows → `[null, null, 10, 14, 16]`: a player with three
  seasons of history in a five-season window.
- The all-zero rows (`Market.test.jsx:82,119`, `Portfolio.test.jsx:16`) → `[null, null, null, null, null]`.
  These are stand-in rows for players with no career data, not players who played and scored nothing.
  If any individual case is genuinely meant to be "played and scored 0.0", keep `0` there and say so
  in the hand-back — but do not leave a fixture ambiguous now that the shape can express the difference.

### 6.3 This is a visible change — call it out in the hand-back
Today a player with fewer than five seasons of data shows padded 3px `dp-border-row` stubs that read
as low-but-real seasons. After this they read as absent. That is the fix, and it will change how a
large share of Market rows look. Anton's smoke should look specifically at a **rookie or
second-year player** in Market and at a **player who missed a full season**.

---

## 7. `src/components/dp/TrendCell.jsx` — new

### 7.1 There is already a `TrendCell` — resolve it in Slice 5, not here
`market/Market.jsx:182` defines a module-local, unexported `function TrendCell({ trend })` for the
Outlook set's Snap/Opp trend cells (`:563-564`). It does not collide today — nothing imports across
that boundary — but **Slice 5 cannot import `dp/TrendCell` into `Market.jsx` without a redeclaration
error.**

Decision: the new primitive **keeps the name `TrendCell`** (it is the design's own name, and renaming
the primitive to dodge a narrow local would invite drift for the life of the program).
**Slice 1 does not touch `Market.jsx`.** Slice 5, when it wires the primitive in, either renames the
local to `UsageTrendCell` or — more likely correct — deletes it, since a snap-share trend *is*
series + delta + window. Recorded here so Slice 5 finds it rather than discovering it at build time.

### 7.2 API

```jsx
export function TrendCell({ values, delta, window: windowLabel, band, scale = 'cell', projectedIndex })
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
  - **Absent or unrecognised `band` → treat as `'none'`.** No default to `'high'`: this repo's
    direction on unknown input is to show less, not to assert more. Matches `CoveragePips` (§4) and
    `DegradedBlock` (§9).
- **The band never implies a delta exists.** `coverageBand` puts `n = 1` at `'low'` (§3), but a delta
  needs two observations — so a `'low'` cell can legitimately have `delta == null`. Render `—` for the
  delta whenever `delta == null`, independent of band. `TrendCell` never computes a delta; the caller
  passes it.
- A **projected** point is dashed and **never joins the delta calculation**. `projectedIndex` marks
  that bar dashed. Do not derive a projection from the values.
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
5. **`App.jsx:327-331` producer change, then `CareerBars`, then the 7 fixtures (§6.4)** — in that
   order, so the renderer is never built against a shape that does not exist yet. **`CareerBars` has
   no test today** — create `src/components/dp/cells.test.jsx` (new file, not an update) asserting the
   three-way behaviour.
6. `TrendCell` + tests.
7. `DefinitionPopover` + tests (click opens, Escape closes, focus returns, no hover dependency).
8. `DegradedBlock` + tests (all five kinds, unknown kind).
9. Docs (§12).
10. `npm test` → `npm run lint` → `npm run build`. Hand back for visual smoke.

---

## 11. Tests

### 11.1 Two environment constraints — check these before writing a line of test
- **Vitest is `environment: 'node'` globally with no `setupFiles`** (`vitest.config.js:10,15`). Every
  component test needs its own `// @vitest-environment jsdom` pragma on line 1 and must import
  `jest-dom` matchers itself — copy the header of any of the 10 existing component tests.
- **`@testing-library/user-event` is NOT a dependency, and adding it would breach the no-new-library
  invariant.** Write the `DefinitionPopover` interaction tests with `fireEvent` plus
  `document.activeElement` for the focus-return assertion. Do not install anything.

### 11.2 Per module

Every new module gets its own test file. Specifically required:

- **`coverageBand`** — table-driven across the boundaries (`0, 1, 3, 4, 6, 7, 12`) plus the whole
  junk set (`null`, `undefined`, `NaN`, `-1`, `'4'`, `{}`) all landing on `'none'`.
- **`CareerBars`** (new file `src/components/dp/cells.test.jsx`) — the three-way distinction is the
  point: a void slot, a measured `0`, and `> 0` all render differently, and **void ≠ measured zero**
  asserted explicitly — that is the bug being fixed. Plus: `NaN`/`undefined` render as void, not as a
  stub; `max` ignores non-finite entries; a measured `0` in the **last** slot still carries
  `bg-dp-up`; and when the last slot is **void**, **no bar carries `bg-dp-up`**.
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
| `docs/ui.md:76` | **Delete from the em-dash only.** The target is a trailing clause, not a sentence — the line reads "`5-YR PPG` reuses `dp/cells.jsx`'s `CareerBars` unchanged — `careerSparkline` 0-pads absent seasons, so …". The reuse fact before the dash is load-bearing and must survive; drop the clause after it and note that absent seasons now render as void slots |
| `docs/ui.md` | New "Systems" section: the coverage bands, the one trend treatment, definitions, the five degraded kinds, and the two normalisation regimes |
| **`docs/architecture.md:132`** | It **is** described, and the comment is already wrong today: `// [ppg × 5 seasons] — null padded at front if < 5 seasons` describes the *season list*, while the array emits `0`. Replace with something true of the new shape, e.g. `// [ppg × 5 league seasons] — null where no PPG exists (absent season or 0 games); 0 is a measured zero` |
| `README.md:130-134` | The component tree enumerates `dp/` files individually and describes `cells.jsx` as "(SortTh, PlayerCell, ClickableRow, CareerBars, DeltaCell)". Add the five new modules |

---

## 13. Cross-repo impact

**None.** No served family, no manifest field, no stat key, no shape crossing the boundary.
`careerSparkline` is computed in the app from `careerStats` and never written back. State this
explicitly in the hand-back per the registry rule.

---

## 14. Done-definition

- [ ] Two tokens added, single-value, **not** in the `.dark` block
- [ ] `coverageBand.js` does not import `ktcHistory.js`, and its comment names **both** `:283` and the `n < 2` early return at `:259-275`, plus the deliberate `n = 1` divergence (§3)
- [ ] `CoveragePips` renders no colour under any prop
- [ ] `SeriesBars` never pads and never substitutes `0` for a null
- [ ] `CareerBars` geometry unchanged (`6 / 2 / 22`); void ≠ zero asserted by test; non-finite treated
      as void, not as a measured zero
- [ ] A measured `0` in the last slot keeps `bg-dp-up`; a void last slot leaves no bar highlighted
- [ ] All 7 `careerSparkline` fixtures updated (§6.4) — tests were green before and after, so confirm
      this was done deliberately
- [ ] `Market.jsx` **untouched** — the `TrendCell` collision (§7.1) is Slice 5's to resolve
- [ ] Every new component test carries its own `// @vitest-environment jsdom` pragma
- [ ] **No new dependency** — `package.json` unchanged (`user-event` was not installed)
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
- Which of the 7 fixtures you changed and to what, and whether any was genuinely a measured zero (§6.4).
- Confirmation that `Market.jsx` has a zero diff.

---

## 16. Plan-review record (2026-08-18)

Fourteen flags; **all fourteen verified against live source and all fourteen applied.** Anton
delegated the fix decisions. The three that changed the shape of the work:

| Flag | Call |
|---|---|
| **`TrendCell` already exists** (`Market.jsx:182`, module-local, used at `:563-564`) — Slice 5 could not import the primitive without a redeclaration error | **§7.1 added.** The primitive keeps the design's name; Slice 5 renames or deletes the local. Slice 1 does not touch `Market.jsx`, and a done-definition item now enforces that |
| **`coverageBand` does not mirror `ktcHistory` at n=1** — `computeKtcSignals` floors at `n < 2` → `'none'`, because every signal it emits is a trend | **§3 rewritten.** The divergence is kept and justified (a level needs one observation, a trend needs two), and §7.2 now forbids `TrendCell` from inferring a delta from the band |
| **Seven fixtures encode the old 0-padded meaning, and tests stay green either way** | **§6.4 added.** The one part of the slice with no test pressure behind it, so it is specified per-site with an explicit "say so if any case is genuinely a measured zero" |

The rest: `CareerBars` has **no** existing test, so step 5 creates `cells.test.jsx` rather than
updating anything (the "7 new files" arithmetic was wrong); non-finite values would have fallen into
the measured-zero branch and painted a stub asserting a measurement that never happened, so the guard
is now `Number.isFinite`; "latest means the last slot even when null" contradicted the void rendering
three bullets above it, and is resolved positionally with the previously-unspecified measured-zero-in-
last-slot case pinned; `SeriesBars`' signature gained `domain` (which the prose selected but the
signature omitted) and lost `labels` (declared but never specified — the labelled chart is Slice 4);
`TrendCell`'s gained `projectedIndex` and an absent-band rule; `ui.md:76`'s target is a clause, not a
sentence, and deleting the sentence would have destroyed the reuse fact before the em-dash;
`architecture.md:132` describes the field and is *already* wrong, so §12 no longer hedges with "if";
`README.md:130-134` enumerates `dp/` files and was missing entirely; `user-event` is not a dependency
and the global Vitest environment is `node`, so §11.1 now pins both constraints before any test is
written; `dp-muted-3`'s stated "void-slot label" role has no consumer this slice; and the design-source
pointer named files that exist only in the Design project, which would have stalled a sonnet session
looking for them on disk.

**No `MIRROR` block — no cross-repo impact**, independently confirmed.

