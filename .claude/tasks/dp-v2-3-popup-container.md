# Slice 3 — Player detail pop-up: continuous scroll + section index

**Program:** [dp-v2.md](dp-v2.md). Fourth slice; follows
[dp-v2-2-loader-wiring.md](dp-v2-2-loader-wiring.md) (landed `4eb9fdf`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `6507fc1` · data `f0c1fc4`.

**Container change only.** The existing content is re-laid out; **no new sections and no new data.**
Slice 4 adds the five new sections on top of the structure this slice proves. Doing it in this order
means the container is validated against content that already works, so a layout regression cannot
hide behind five simultaneously-new sections.

**Design source is not in this repo** (Claude Design project only — see
[dp-v2-1-systems.md](dp-v2-1-systems.md) §0). Everything needed is restated below.

---

## 0. Confirmed against live source (`6507fc1`)

| Fact | Site |
|---|---|
| Shell: scrim `z-40` + panel `z-50`, `max-w-[1320px]`, `p-[26px]` outer, `flex flex-col overflow-hidden` | `dp/PlayerDetailTabs.jsx:155-157` |
| The panel renders tab strip → compare matrix (≥2 tabs) → `<PlayerDetailModal>` as the body | `PlayerDetailTabs.jsx:159,209,233-240` |
| **Body root today is a side-by-side row that owns the scroll**: `<div className="flex-1 min-w-0 flex overflow-auto">` | `dp/PlayerDetailModal.jsx:190` |
| Main column: `flex-1 min-w-0 px-7 pb-6 flex flex-col gap-5` — identity row, four tiles, career chart, then a two-up of *What drives the score* / *Why next season* | `PlayerDetailModal.jsx:192-340` |
| **Right rail today spans the whole body height** as a sibling of the main column: `w-[300px] shrink-0 border-l border-dp-border bg-dp-chrome px-5 py-[22px] … overflow-y-auto` | `PlayerDetailModal.jsx:342` |
| Rail contents: `POSITION IN PORTFOLIO`, `SIGNALS`, `RANK THIS SEASON` | `PlayerDetailModal.jsx:344+` |
| Background scroll is locked while the pop-up is open | `PlayerDetailModal.jsx:46-50` |
| **Only generated testid in the modal:** ``data-testid={`tile-${t.key}`}`` → `tile-dynasty`, `tile-market`, `tile-next`, `tile-floor` | `PlayerDetailModal.jsx:221` |
| Modal tests use **`getByTestId` (4 ids) and text queries only** — no `container.querySelector`, so DOM restructuring is low-risk if ids and copy survive | `PlayerDetailModal.test.jsx` |
| `PlayerDetailTabs.jsx` has **two** testids — ``data-testid={`tab-${playerId}`}`` and `compare-dropdown` | `PlayerDetailTabs.jsx:34,182` |
| **`PlayerDetailTabs.test.jsx` is a second site that mounts the body** (asserts `tile-dynasty` at `:164`) and uses one structural selector, `container.querySelector('.z-40')` at `:125` — shell-only, so it survives, but that file needs §5's stubs too | `PlayerDetailTabs.test.jsx:125,164` |
| **`seasonsOfData` is already on screen inside Overview** — `dynastyScore.signals?.seasonsOfData` renders as the DYNASTY SCORE tile's note, `"N seasons"` | `PlayerDetailModal.jsx:121,142` |
| `CoveragePips` with **neither** `band` nor `count` resolves to `'none'` and still renders three unfilled pips | `dp/CoveragePips.jsx:9-11` |
| The whole-modal empty state **returns before any body markup** — a plain `px-6 pt-4 pb-8` div | `PlayerDetailModal.jsx:107-119` |
| Slice 1 shipped `CoveragePips` and `coverageBand` | `dp/CoveragePips.jsx`, `utils/coverageBand.js` |
| **No arbitrary-breakpoint variant (`max-[…px]:`) exists anywhere in `src/` yet** — this slice introduces the first | `grep -rohE '(max\|min)-\[[0-9]+px\]:' src/` → none |

---

## 1. Target layout

```
panel (unchanged: max-w-[1320px], flex-col, overflow-hidden)
├── tab strip            ← untouched
├── compare matrix       ← untouched (≥2 tabs)
└── body  ─ flex row, does NOT scroll
    ├── SectionIndex   140px, fixed width, own column, never scrolls with content
    └── scroll column  flex-1, overflow-y-auto  ← the single continuous scroll
        ├── §overview           main content  ┊  right rail 300px
        ├── §drivers            full width
        └── §why-next           full width
```

The two structural moves:
1. **Scroll ownership moves inward.** Today `overflow-auto` sits on the row holding main + rail
   (`:190`). It moves to the new scroll column, so the index can sit beside a scrolling region without
   scrolling itself. The panel keeps `overflow-hidden`.

   **`min-h-0` on the body row is mandatory, and its absence is a silent failure.** The body is a
   `flex-1` child of the panel's `flex flex-col overflow-hidden` (`PlayerDetailTabs.jsx:157`). A flex
   child defaults to `min-height: auto`, so it refuses to shrink below its content — today the body's
   own `overflow-auto` is the only thing establishing the constraint. Strip that without adding
   `min-h-0` and the row grows to full content height, the panel clips it, and the new inner
   `overflow-y-auto` column never has anything to overflow. **Nothing scrolls and no error appears.**
   Add `min-h-0` to the body row, and to the scroll column as well.
2. **The right rail moves inside the Overview section.** Today it is a sibling spanning the full body
   height; after, it is scoped to the Overview band and scrolls away with it. **Drop its
   `overflow-y-auto`** at the same time — once the rail sits inside the scrolling band its height is
   content-driven, so that property can never fire and only invites a nested scrollbar later. This is what makes the
   design's mobile answer work by construction rather than by promise — see §4.

---

## 2. Sections in this slice — three, not nine

The design's full list is Overview → Game log → Distribution → Usage & efficiency → Environment →
Availability & role → Score drivers → Why next season → Comps. **Six of those have no content yet.**

This slice indexes only what exists:

| id | Heading | Content (moved, not rewritten) |
|---|---|---|
| `overview` | Overview | identity row, four tiles, career-PPG chart, **and the right rail** |
| `drivers` | Score drivers | the existing *What drives the score* panel |
| `why-next` | Why next season | the existing *Why next season* panel, **including its career-comps block** |

**Do not split Comps into its own section.** It lives inside *Why next season* today; separating it is
content restructuring and belongs to Slice 4 with the rest. Three entries is enough to prove the
mechanism.

### 2.0 Section labels render in the index only
The `label` values are the index's copy. **Do not render them as visible headings in the body** — the
*Why next season* card already carries that exact title (`:296`), so a section heading above it would
print it twice, and "Score drivers" above a card titled "What drives the score" (`:271`) would be new
copy, which §6 forbids. The existing card titles stay exactly as they are and serve as the visible
headings; the section wrappers contribute only an `id` and scroll margin.

**The two-up row becomes two stacked full-width sections.** Today *What drives the score* and *Why
next season* sit side by side; as index targets they must be separately scrollable-to, which a
two-column row defeats. This is the one visible change to existing content, and it is intended.

### 2.1 One source for the section list
Both the index and the section headings must read the **same** array — otherwise an id typo silently
produces an index entry that scrolls nowhere. Define it once, in `PlayerDetailModal.jsx`:

```js
// Module-level: ids and labels only — these are static.
const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'drivers',  label: 'Score drivers' },
  { id: 'why-next', label: 'Why next season' },
]
```

**Coverage is per-player, so it cannot live in the const** (§3.1). Decorate inside the component:

```js
const indexSections = useMemo(
  () => SECTIONS.map(sec =>
    sec.id === 'overview' && seasonsOfData != null
      ? { ...sec, count: seasonsOfData, span: `${seasonsOfData}y` }
      : sec),
  [seasonsOfData])
```

The const stays the single source of ids and labels — the section wrappers read **the const**, the
index reads the decorated memo, and neither hard-codes an id string. That preserves what §2.1 exists
to prevent (an index entry scrolling nowhere) without a second hand-maintained list.

Section wrappers get `id={s.id}` and `scroll-mt-*` so a scrolled-to section is not flush against the
top edge.

---

## 3. `dp/SectionIndex.jsx` — new

```jsx
export function SectionIndex({ sections, activeId, onSelect })
```

- `140px` fixed width, own column, `border-r border-dp-border`, `bg-dp-chrome` to match the panel.
- One row per section: label at `13px`, `padding: 7px 10px`, radius `7px`.
  - Resting: `text-dp-text-4`, transparent background.
  - Active: `bg-dp-row-active`, `text-dp-up-text`, weight 600.
- **It is a table of contents, not navigation.** Clicking scrolls; it never swaps content, never
  unmounts a section, and never filters. Rows are `<button>`s so keyboard works.
- **No route, no hash, no `window.location`.** The pop-up is deliberately routeless — that *is* the
  answer the design gave to the container question. "Deep-linkable" in the spec means in-modal anchor
  targets, nothing more. Adding a route or writing a fragment to the URL would undo the whole slice.

### 3.1 Coverage pips — only where a real count exists
The design shows coverage pips + a span on every index entry, including model-derived ones
(`['Score drivers', 'model', 'high']`). **Deviate deliberately: model output gets no pips.** A
coverage band describes how much measured data stands behind a value; the dynasty-score components are
computed from the pipeline, not observed, so a band over them is meaningless and the mock's `high` is
a fudge. Showing three filled pips there would train the reader to ignore pips everywhere else.

So in this slice:
- **Overview** — pips + span from `dynastyScore.signals.seasonsOfData`, already bound at
  `PlayerDetailModal.jsx:121`.
- **Score drivers / Why next season** — label only.

**Use `seasonsOfData`, not a fresh count.** There are already three different definitions of
"seasons of data" in this codebase — `seasonsOfData` (`gamesPlayed >= 8`), `careerHistory.length`
(`gp >= 1`), and the length of `careerSparkline`. `seasonsOfData` is the one **already rendered inside
this very section**, as the DYNASTY SCORE tile's `"N seasons"` note (`:142`). Deriving a fourth count
for the index would put two visibly different season numbers a few centimetres apart in the same band.
If `seasonsOfData` is null, the Overview entry carries no pips like the other two.

**`SectionIndex` must omit the `CoveragePips` element entirely when there is no count** — do not rely
on passing nothing. With neither `band` nor `count`, `CoveragePips` resolves to `'none'` and still
renders three unfilled pips (`CoveragePips.jsx:9-11`), which is a visible artefact and would fail §7's
assertion. Reuse `CoveragePips` unchanged; gate it at the call site.

---

## 4. Responsive: the 1180px rule

- **At ≥1180px:** index 140px, main column, right rail 300px beside the Overview content.
- **Below 1180px:** the right rail **stacks below the Overview content**, full width, losing its left
  border **and its now-dead `overflow-y-auto`** (see below). The section index is **hidden**.

  **Deviation from the design's wording, deliberate.** The spec says the rail stacks "under the
  tiles". It cannot, without restructuring: the rail is a sibling of the single main column
  (`:192`), which wraps identity → tiles → chart → panels as one unit, so a CSS-repositioned rail can
  only land *after* that column's content, i.e. below the career chart. Putting it between the tiles
  and the chart would require flattening Overview into a grid of four siblings — content reflow, not a
  container change, and out of scope here. Landing it below the Overview content still satisfies the
  intent (stacked rather than beside) at zero structural cost. Slice 4 restructures Overview anyway and
  can revisit.

Tailwind has no 1180 breakpoint. **Do not try to single-source it from a JS constant** — Tailwind v4
scans class names as literal strings, so `` `max-[${BP}px]:hidden` `` emits no CSS at all and the
breakpoint silently never applies. The working form is a **named breakpoint token** in
`src/index.css`'s `@theme`:

```css
--breakpoint-dpwide: 1180px;   /* pop-up: index + main + right rail all fit above this */
```

which generates the `dpwide:` and `max-dpwide:` variants. That is the single source; use the named
variants everywhere and never the literal. This is a new token but not a colour token, so Slice 0's
single-value/no-`.dark` rule is satisfied trivially — just do not add it to the `.dark` block.

**Hiding the index below 1180px is a decision, not an oversight.** At that width 140 + 1131 does not
fit, and the sections remain reachable by scrolling. Revisit in Slice 4, when there are nine sections
rather than three and the cost of losing the index is higher.

Rail-stacking is the property that satisfies the design's mobile answer *by construction*. Do not
implement it by duplicating the rail markup at two breakpoints — one rail, CSS-repositioned.

---

## 5. Active-section highlight

Use `IntersectionObserver` on the section wrappers, observed against the scroll column as `root`. The
topmost intersecting section is active; on first render, `overview`.

**Two jsdom gotchas that will bite the tests:**
- **jsdom implements neither `IntersectionObserver` nor `Element.scrollIntoView`.** Both need stubbing
  in any test that mounts the modal — a `vi.stubGlobal('IntersectionObserver', …)` returning a no-op
  `observe`/`disconnect`, and `Element.prototype.scrollIntoView = vi.fn()`. Without them the existing
  modal tests will start throwing, and the failure will look unrelated to this slice.
- Put the stubs in the test files that need them, not in a global setup — `vitest.config.js` has **no
  `setupFiles`** and this slice should not add one.

Keep the observer logic thin and the cleanup real (`disconnect()` on unmount). If it proves awkward,
falling back to click-only highlighting is acceptable — say so in the hand-back rather than shipping a
half-working observer.

---

## 6. What must not change

- **The tab strip, the compare matrix, and `App.jsx`'s `tabs[]`/`activeTab` state.** This slice touches
  the body only. `PlayerDetailTabs.jsx` changes only if the body's new root needs a different wrapper —
  and if it does, say so explicitly in the hand-back.
- **The whole-modal empty state keeps its current shape.** `PlayerDetailModal.jsx:107-119` returns
  before any body markup when `dynastyScore` is null, and it stays that way: **that branch renders no
  index and no scroll column.** §11's "body is a non-scrolling row + scroll column" describes the
  normal branch only. Leave the branch's markup alone — it is short, it cannot overflow, and giving it
  an index listing three sections it does not have would be worse than the asymmetry.
- **All four `tile-*` testids and every string the tests assert on.** The modal's eight empty states
  (null `dynastyScore`, null `.components`, null `.signals`, null `projection`, null `ktcValue`, null
  consistency object, non-null consistency with null `sd`, empty comps) must render exactly as before —
  they are covered by `PlayerDetailModal.test.jsx` and none of them should need editing.
- **The background scroll lock** at `:46-50`.
- **No new data.** Nothing reads the Slice 2 context keys yet.
- **No styling changes to the moved content** beyond what re-parenting requires. Same tokens, same
  spacing, same copy.

---

## 7. Tests

- **`SectionIndex`** (new file, needs the jsdom pragma): renders one row per section; the active row
  carries the active classes; clicking calls `onSelect` with the id; rows are buttons and are
  keyboard-reachable; an entry **without** a `count` renders no pips, one **with** a count renders
  `CoveragePips`.
- **`PlayerDetailModal`**: add coverage that the three sections render with their ids present, and
  that the right rail's three headings still appear. **Existing tests should pass unedited** — if any
  needs changing, that is a signal the restructure went further than specified, so report it rather
  than editing to green.
- Add the two jsdom stubs (§5) to **both** files that mount the body — `PlayerDetailModal.test.jsx`
  **and `PlayerDetailTabs.test.jsx`** (which asserts `tile-dynasty` at `:164`). Missing the second is
  the likely cause of a confusing unrelated-looking failure.

---

## 8. Smoke (now required — `CLAUDE.md` done-definition step 6)

Run the app per `CLAUDE.md` → Workflow convention. Open a player from Market and check:
- the index lists three entries and highlights Overview on open;
- clicking `Why next season` scrolls rather than swapping — the Overview content stays mounted above;
- the right rail sits beside the Overview content and **scrolls away with it**, rather than pinning
  full-height as it does today;
- narrowing the window below 1180px stacks the rail and hides the index;
- opening a second player still shows the compare matrix, and the index still works on the new tab;
- no console errors.

---

## 9. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `src/components/` table | New `dp/SectionIndex.jsx` row; update the `PlayerDetailModal.jsx` row — it is now a continuous scroll with a section index, and the right rail is scoped to the Overview band |
| `docs/ui.md` → *Player detail pop-up* | Rewrite the body description: the index, the three sections, the rail's new scope, the 1180px rule, and that clicking the index scrolls rather than swaps |

---

## 10. Cross-repo impact

**None.** No served data, no shape, no stat key, no signal-registry row — nothing in this slice
changes what data exists or how it is classified, only how existing content is arranged. State it in
the hand-back anyway.

---

## 11. Done-definition

- [ ] `SECTIONS` is defined once and drives both the index and the section ids (§2.1)
- [ ] Body is a non-scrolling row: index column + a single `overflow-y-auto` scroll column
- [ ] **`min-h-0` on the body row and the scroll column** — without it nothing scrolls, silently (§1)
- [ ] The `!dynastyScore` empty-state branch is unchanged and renders no index (§6)
- [ ] Section labels appear in the index only — no new visible headings, no duplicated card titles
- [ ] The panel keeps `overflow-hidden`; the background scroll lock still works
- [ ] Right rail lives **inside** `§overview` and scrolls with it
- [ ] Index hidden and rail stacked below 1180px via the **`--breakpoint-dpwide` token** in `@theme`
      and its named variants — never an interpolated literal (§4)
- [ ] The rail's `overflow-y-auto` is dropped
- [ ] Clicking an index row scrolls; **no route, no hash, nothing unmounts**
- [ ] Model-derived sections render **no** coverage pips — the element is omitted, not passed empty
- [ ] Overview's count is `dynastyScore.signals.seasonsOfData`, not a fourth season definition
- [ ] Four `tile-*` testids intact; all eight empty states unchanged; **existing modal tests pass
      unedited**
- [ ] jsdom stubs for `IntersectionObserver` and `scrollIntoView` added where needed, **not** via a new
      `setupFiles`
- [ ] `npm test` green · `npm run lint` **0 problems** (the vendored-file exemption is gone as of
      `6507fc1` — the bar is a literal zero again) · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect Slice ii's three, unchanged
- [ ] Smoked per §8, with what you saw reported
- [ ] Docs per §9

---

## 12. Hand-back should report

- What the smoke showed, especially the rail's scroll behaviour and the sub-1180px stack.
- Whether `PlayerDetailTabs.jsx` needed any change, and why.
- Whether any existing modal test needed editing (it should not).
- Whether `IntersectionObserver` worked cleanly or you fell back to click-only highlighting (§5).
- Anything in §0 that had drifted from `6507fc1`.

---

## 13. Plan-review record (2026-08-19)

Ten flags; **all ten verified against live source and applied.** Three changed the design.

| Flag | Call |
|---|---|
| **`min-h-0` is required and its absence is silent.** Moving `overflow-auto` off the body row without it leaves the row growing to content height under the panel's `overflow-hidden`, so the new inner scroll column never overflows — nothing scrolls, no error | **§1 expanded**, plus a done-definition item. The single most likely way this slice ships broken |
| **Tailwind v4 cannot single-source a breakpoint from JS** — class names are scanned as literals, so an interpolated `max-[${BP}px]:` emits no CSS and the breakpoint silently never applies | **§4 rewritten** around a `--breakpoint-dpwide` token in `@theme`, which the plan now authorises explicitly |
| **The rail cannot stack "under the tiles"** as the design words it — it is a sibling of the single main column, so CSS repositioning can only land it after the career chart; doing better needs Overview flattened into a grid, which is content reflow | **§4 records the deviation**: below the Overview content, not between tiles and chart. Intent preserved at zero structural cost; Slice 4 restructures Overview anyway |

The rest: §2.1's module-level const could not carry §3.1's per-player counts, and the obvious fix
reintroduces the two-list drift the const exists to prevent — resolved by keeping ids/labels in the
const (which the section wrappers read) and decorating in a memo (which the index reads). §3.1's
proposed season count would have been a **fourth** definition of "seasons of data", visibly
disagreeing with `seasonsOfData` rendered as the DYNASTY SCORE tile's note a few centimetres away in
the same section — now reuses it. `CoveragePips` with no props renders three unfilled pips rather than
nothing, so the element must be omitted at the call site or §7's assertion fails. The whole-modal
empty state returns before any body markup, so §11's unconditional wording was wrong and that branch
now explicitly owns no index. Section labels are pinned to the index only — rendering them as body
headings would print "Why next season" twice and put new copy above "What drives the score", which §6
forbids. The rail's `overflow-y-auto` becomes dead once it sits inside the scrolling band. And §0 had
two errors: `PlayerDetailTabs.jsx` has two testids, not one, and `PlayerDetailTabs.test.jsx` is a
second site that mounts the body — so it needs the jsdom stubs too, which is exactly the kind of
omission that produces a confusing unrelated-looking failure.

**No `MIRROR` block — no cross-repo impact**, independently confirmed: none of the touched artifacts
appears in any `CR-NN` app-side trigger list, and the slice reads no served field or stat key.

