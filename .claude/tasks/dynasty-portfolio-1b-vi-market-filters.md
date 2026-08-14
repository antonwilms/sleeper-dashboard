# Slice vi — Market filters: bar + panel

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `3ea7655`. Not yet `plan-reviewer`'d. Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md) — **§4a** (the two standing
directives) and **§6a** (the `/players` retirement arc, which this slice opens). §2.4 for the
`PROVISIONAL` convention.

**Why this slice exists.** `/players` is still live and duplicating Market because Market cannot yet
do what it does (Slice iii §1). Five convergence debts are blocked behind that. This is the first of
three slices that close it: **vi** filters, **vii** presets + search, **viii** retire `/players`.

**This slice:** the filter bar (active-filter pills, "+ Add filter") and the expandable filter panel
over Market's table — the union filter set from §6a **minus** presets and free-text search.

**Explicitly NOT this slice:**
- **Saved presets and free-text player search → slice vii.** Both are part of parity; both are
  separable, and folding them in would make this the largest slice of the program.
- **Retiring `/players` or settling any of the five debts → slice viii.** `/players` stays
  behaviourally frozen here, exactly as in Slices iii–v.
- **Portfolio, the pop-up, the chrome** — untouched.
- **The design's `Risk` filter group → cut.** It filters on the Low/Med/High label whose thresholds
  are still undefined (master-plan §5.4) and which every prior slice declined to invent. §4a.2's
  default applies: leave it out. `Min projected games` — the design's other Market-only group — **is**
  real and ships (§4).

---

## 0. Confirmed against live source

- `src/components/market/Market.jsx` (Slice iii) — owns `usePlayersTable({ storageKey: 'market-sort' })`,
  the three column sets, `SORTABLE_KEYS` validation, and a derived-rows memo. Its position pills live
  in `dp/MarketTable.jsx:40-52` (hard-coded, always rendered) — **the new filter bar sits above the
  table, beside those pills, not inside `MarketTable`.**
- **`PlayersTab.jsx`'s `displayRows` memo (`:1883-1945`) holds all ten filter predicates**, applied
  in order, as pure row-level tests. This is what to harvest. The exact semantics, which §2 requires
  be preserved:

  | Filter | Predicate | Note |
  |---|---|---|
  | `startersOnly` | `playerMap[id]?.depth_chart_order === 1` | needs `playerMap`, not just the row |
  | `rookiesOnly` | `r.years_exp === 0` | |
  | `ageRange` | `r.age != null && within` | **sentinel-gated** — see below |
  | `expRange` | `r.years_exp != null && within` | **sentinel-gated** |
  | `availability` | `'myRoster'` / `'available'` / `'nflFreeAgent'` | `available` = un-owned **and** on an NFL team; `nflFreeAgent` = `!r.nfl_team \|\| === 'FA'` |
  | `nflTeams` | `f.nflTeams.includes(r.nfl_team)` | multi-select |
  | `fantasyTeams` | `r.ownerTeamName && includes` | multi-select |
  | `dynastyGroups` | label ∈ `DYNASTY_GROUP_MAP[group]` | four groups, `:1478-1484` |
  | `marketSignal` | `r.divergenceSignal === 'undervalued' \| 'overvalued'` | |
  | `ktcRange` | `r.ktcValue != null && within` | **sentinel-gated** |

- **The sentinel behaviour is load-bearing and easy to lose.** Each range filter runs **only when the
  range differs from its default** (`if (f.ageRange[0] !== 18 || f.ageRange[1] !== 45)`). So a row
  with a null `age` **passes** an untouched Age slider and is **excluded** the moment the slider
  moves — even to a range that would include it if it had a value. Reimplementing these as
  always-on `within` tests silently drops every null-valued row on load. Preserve it exactly.
- `DEFAULT_FILTER_STATE` (`:1486-1497`) — the ten keys and their defaults, which double as the
  sentinels above.
- `DYNASTY_GROUP_MAP` (`:1478-1483`) — `Prospects` / `Rising` / `Established` / `Declining` →
  label lists. **Not currently exported.**
- `FilterSidebar` (`:1618`) — the Explorer's panel: a fixed left slide-in (`w-[280px]`, old
  `--color-*` tokens), `CollapsibleSection`s, `RangeSlider`, a searchable multi-select
  (`:1574-1600`), and the preset block (slice vii). **Structurally wrong for the design's panel**
  (which is an inline 4-column grid below the filter bar), so this is a re-skin in the dp language,
  not a reuse — same call as `PlayersDataTable` in Slice iii.
- `projectedGames` lives on `seasonProjections[id]`, **not** on the row (established in Slice v §0) —
  relevant to the `Min projected games` group.
- **Design source:** `README.md` → *Screen: Market* → **Filter bar** and **Filter panel**.

---

## 1. The filter set — the union, not the mock's seven

Per master-plan §6a, Market must reach **functional** parity before `/players` can go. Ship all ten
Explorer dimensions **plus** the design's `Min projected games`; cut only the design's `Risk`.

| Group (panel section) | Controls |
|---|---|
| **Player** | `startersOnly`, `rookiesOnly` checkboxes; `ageRange`, `expRange` range sliders |
| **Availability** | `availability` radio — All / My roster / Available / NFL free agent |
| **Team** | `nflTeams` multi-select, `fantasyTeams` multi-select |
| **Dynasty** | `dynastyGroups` chips (4), `marketSignal` radio, `ktcRange` slider |
| **Projection** | `minProjectedGames` — mono number + slider, per the design |

`minProjectedGames` is the one new dimension: default `0` (inactive), predicate
`seasonProjections[id]?.projectedGames >= n`. **Rows with no projection are excluded once `n > 0`** —
consistent with the sentinel pattern above. Default `0` means "off", so it must not filter at all
at rest.

This is more groups than the mock draws. That is the deliberate consequence of §6a's decision and
should not be "corrected" toward the design.

---

## 2. Extract the predicates into a pure module

Create `src/utils/marketFilters.js`:

```js
export const DEFAULT_MARKET_FILTERS = { /* the ten keys + minProjectedGames */ }
export const DYNASTY_GROUP_MAP = { /* copied from PlayersTab.jsx:1478-1483 */ }
export function applyMarketFilters(rows, filters, { playerMap, myTeamName, seasonProjections })
export function activeFilterCount(filters)   // for the bar's pills + "N active"
```

Pure, no React, no styling — the same shape as `tabState.js` (Slice v) and testable without mounting.

**On duplication:** this copies predicates that also live inline in `PlayersTab.jsx`. Slice iii's
rule was import-don't-copy, and this is a deliberate exception with a stated end date: `/players`
is **deleted in slice viii**, so the inline copy has weeks to live, and extracting it *from*
`PlayersTab` now would modify a surface three slices have kept frozen — for a file about to be
removed. **Do not refactor `PlayersTab` to use this module.** Note the duplication in a comment at
the top of `marketFilters.js`, naming slice viii as the resolution.

**Semantics must match `displayRows` exactly**, including the sentinel gating (§0) and the
application order. §8's tests pin this.

---

## 3. Filter bar

Per the design: `flex gap-2 flex-wrap`, sitting between the position pills and the table.

- **Active-filter pills** — one per non-default dimension, `rounded-full px-[11px] py-[5px]` 12px,
  `bg-dp-up-bg text-dp-up-text border border-dp-up-border`. Each shows a short label
  (`Age 24–28`, `RB only`, `My roster`) and an `×` clearing that dimension alone.
- **"+ Add filter"** — dashed `border-dp-border-raised text-dp-muted`; becomes solid `bg-dp-up-bg`
  while the panel is open. Toggles the panel.
- Right-aligned: **"Reset all"**, shown only when at least one filter is active.

The design's right-aligned "Saved: Buy-low WRs" belongs to presets → **slice vii**. Leave the slot
empty.

---

## 4. Filter panel

Per the design: a card below the bar, `p-[18px_20px]`, `grid-cols-4 gap-[22px_26px]`. Each group is
a mono 10px `text-dp-muted` label above its control. Controls per the design:

- **Range sliders** — 5px track `bg-dp-border-row`, `bg-dp-up` fill, 13px round `#e6e8eb` handles.
- **Checkboxes** — 13px squares, `rounded-[4px]`, `bg-dp-up` when checked, `border-dp-border-raised`
  when not.
- **Radios** — render as a 3-up/4-up segmented control, matching the column-set switch's styling
  (`Market.jsx`'s existing segmented control) rather than inventing a radio style.
- **Multi-selects** (`nflTeams`, `fantasyTeams`) — the Explorer's searchable list
  (`PlayersTab.jsx:1574-1600`) re-skinned. **This one has a text input**, and that is fine: it is a
  filter-local search over a fixed option list, not the global player search deferred to slice vii.
  Options for `nflTeams` come from the distinct `nfl_team` values in `playerRows`; `fantasyTeams`
  from the distinct non-null `ownerTeamName` values in `playerRows`. **Note `Market` is NOT passed
  `fantasyTeamNames`** — that prop goes only to `PlayersSurface`; deriving from the rows avoids a
  new prop and cannot drift from what the table can actually show.

Last grid cell, bottom-right: **"Reset"** (ghost) and **"Apply · N players"** (`bg-dp-up`,
`text-dp-canvas`, 600). Both collapse the panel, per the design's Interactions table.

**Filters apply live, not on Apply.** The count on the Apply button must reflect the current
selection, which means the filtered count is computed continuously anyway; making Apply the commit
point would mean holding a second draft copy of filter state for no benefit. Apply just closes.

**The panel is `bg-dp-card` and paints its own ground** (Slice i §1.1).

---

## 5. Wiring into `Market.jsx`

- `filters` state lives in `Market.jsx` (view-local, like `columnSet`), **not** `App.jsx` — it is not
  domain state, and the *App.jsx owns all state* invariant's carve-out covers exactly this. Persist
  to `localStorage` under `market-filters`, validated on read against `DEFAULT_MARKET_FILTERS`'s
  keys so a stale shape can't poison the surface.
- Apply filters **before** the existing sort and pagination, and **after** the position-pill filter —
  matching `displayRows`' order.
- **Reset `page` to 1 whenever `filters` changes**, exactly as the column-set switch does
  (`Market.jsx:211-214`, and the production-season selector at `:230`). Without it, a filter that shrinks the result set below the current page
  leaves the user on an empty page.
- `Market` needs `playerMap` and `seasonProjections` for the predicates. **Both are already props**
  (`playerMap` at `App.jsx:1050`, `seasonProjections` at `:1051`, in the `<Market>` call site
  `:1046-1054`) — no new prop threading.
- The empty state ("No players match your filters.") already exists in `MarketTable`; verify it
  renders when filters exclude everything.

---

## 6. `PROVISIONAL(...)` sites

**None.** Every shipped filter reads a real field. The one design element without real data — the
`Risk` group — is cut (§4a.2), not tagged.

`grep -rn "PROVISIONAL(" src/` must still return **exactly Slice ii's three**.

---

## 7. Step sequence

1. `src/utils/marketFilters.js` (§2) + its tests (§8) **first**, before any UI. The predicates are
   the part that must be exactly right; get them green in isolation.
2. Filter panel (§4) and bar (§3) as components under `src/components/market/`.
3. Wire into `Market.jsx` (§5).
4. Docs (§9).
5. `npm test` green · `npm run lint` no **new** problems (5 pre-existing in
   `docs/design_handoff_dynasty_portfolio/support.js` are a vendored mock runtime) ·
   `npm run build` clean · `grep -rn "PROVISIONAL(" src/` returns exactly three.
6. Hand back for the user's visual smoke: `/market` in dark — open the panel, exercise each group,
   confirm pills appear and clear individually, confirm the row count and Apply-button count agree.

## 8. Tests to add / update

- **New `src/utils/marketFilters.test.js`** — the priority. Cover each of the eleven dimensions
  independently, plus:
  - **the sentinel behaviour for all three range filters**: a null-`age` row survives an untouched
    Age slider and is dropped once it moves. Same for `expRange`/null-`years_exp` and
    `ktcRange`/null-`ktcValue`. This is the single most likely thing to get silently wrong.
  - `minProjectedGames = 0` filters nothing, including rows with no projection at all.
  - `availability` — all four modes, especially `available` (un-owned **and** on an NFL team) vs
    `nflFreeAgent`.
  - `activeFilterCount` counts exactly the non-default dimensions.
- **New `Market.test.jsx` cases** — panel opens/closes; a filter narrows the rendered rows; a pill's
  `×` clears one dimension and leaves the others; "Reset all" restores defaults; **changing a filter
  resets `page` to 1**; the Apply-button count matches the rendered row count.
- **Do not** re-test the Explorer's `displayRows` — it is unchanged and about to be deleted.

## 9. Docs updates

- **`CLAUDE.md`** — `src/components/` entry for Market (filters added), new `src/utils/`
  row for `marketFilters.js`, and the routing-section paragraph that currently says Market "ships
  without the filter panel" — that sentence becomes wrong with this slice.
- **`docs/ui.md`** — extend the Market section.
- **Master plan §6a** — record slice vi as landed and note anything parity-relevant it deferred.

## 10. Cross-repo impact

**None.** Client-side filtering over `playerRowsWithProj` plus `seasonProjections`; no new served
reader, no shape change, no `CR-NN` entry touched, no `Mirror` text. As in Slices iii–v this holds
**only if no stat-key derivation is inlined** — the filters read already-derived row fields and
`projectedGames`, and must compute nothing from raw stat keys.

## 11. Done-definition checklist (this slice)

- [ ] `marketFilters.js` is pure (no React, no styling), exports `DEFAULT_MARKET_FILTERS`,
      `DYNASTY_GROUP_MAP`, `applyMarketFilters`, `activeFilterCount`
- [ ] **Sentinel gating preserved on all three range filters** — null-valued rows survive an
      untouched slider, drop once it moves — with tests pinning each
- [ ] All eleven dimensions ship; `Risk` is **not** built
- [ ] `minProjectedGames` defaults to `0` and filters nothing at rest
- [ ] Filter bar: per-dimension pills with individual `×`, "+ Add filter" toggling the panel,
      "Reset all" only when something is active; the presets slot left empty
- [ ] Panel is `bg-dp-card`, 4-column grid, dp tokens throughout; Apply and Reset both collapse it
- [ ] Filters apply live; Apply's count matches the rendered row count
- [ ] `filters` is view-local in `Market.jsx`, persisted under `market-filters`, validated on read
- [ ] **`page` resets to 1 on any filter change**
- [ ] `/players` **behaviourally frozen** — `PlayersTab.jsx` not refactored onto the new module
      (slice viii deletes it); confirm with `git diff --stat`
- [ ] No new `PROVISIONAL` sites — grep returns exactly Slice ii's three
- [ ] `npm test` green · `npm run lint` no new problems · `npm run build` clean
- [ ] CLAUDE.md + `docs/ui.md` + master-plan §6a updated in the same change
- [ ] Handed back for the user's visual smoke
