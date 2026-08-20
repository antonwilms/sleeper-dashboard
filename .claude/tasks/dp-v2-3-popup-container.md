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
| `PlayerDetailTabs.jsx` has one testid, `compare-dropdown` | `PlayerDetailTabs.jsx:182` |
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
2. **The right rail moves inside the Overview section.** Today it is a sibling spanning the full body
   height; after, it is scoped to the Overview band and scrolls away with it. This is what makes the
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

**The two-up row becomes two stacked full-width sections.** Today *What drives the score* and *Why
next season* sit side by side; as index targets they must be separately scrollable-to, which a
two-column row defeats. This is the one visible change to existing content, and it is intended.

### 2.1 One source for the section list
Both the index and the section headings must read the **same** array — otherwise an id typo silently
produces an index entry that scrolls nowhere. Define it once, in `PlayerDetailModal.jsx`:

```js
const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'drivers',  label: 'Score drivers' },
  { id: 'why-next', label: 'Why next season' },
]
```

Section wrappers get `id={s.id}` and `scroll-mt-*` so a scrolled-to heading is not flush against the
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
- **Overview** — pips + span from a real count: the number of seasons this player has in
  `careerStats`, through `coverageBand(n)`. Span reads e.g. `5y`.
- **Score drivers / Why next season** — label only.

Pass this per-section, so Slice 4's measured sections supply their own counts the same way:

```js
{ id: 'overview', label: 'Overview', count: seasonsWithData, span: `${seasonsWithData}y` }
```

Entries with no `count` render no pips. Reuse `CoveragePips` from Slice 1 unchanged.

---

## 4. Responsive: the 1180px rule

- **At ≥1180px:** index 140px, main column, right rail 300px beside the Overview content.
- **Below 1180px:** the right rail **stacks under the tiles**, full width, losing its left border. The
  section index is **hidden**.

Tailwind has no 1180 breakpoint; use an arbitrary variant (`max-[1180px]:` / `min-[1180px]:`). This is
the first such variant in `src/` — keep the value in one place rather than repeating the literal
across several classNames.

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
- Add the two jsdom stubs (§5) wherever the modal is mounted.

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
- [ ] The panel keeps `overflow-hidden`; the background scroll lock still works
- [ ] Right rail lives **inside** `§overview` and scrolls with it
- [ ] Index is hidden and the rail stacks below 1180px, via a single-sourced arbitrary variant
- [ ] Clicking an index row scrolls; **no route, no hash, nothing unmounts**
- [ ] Model-derived sections render **no** coverage pips (§3.1)
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
