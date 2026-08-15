# Slice vi — Market filters: bar + panel

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `3ea7655`, then revised after a `plan-reviewer` pass that raised **11 flags — all verified
and all fixed** (see §12). Per the
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
  the three column sets, `SORTABLE_KEYS` validation, and a derived-rows memo.
- **The position pills are rendered INSIDE `MarketTable`** (`dp/MarketTable.jsx:28-40`, hard-coded,
  always rendered). An earlier draft said the filter bar "sits beside those pills, not inside
  `MarketTable`" — **that is impossible as stated**: a bar mounted in `Market.jsx` above
  `<MarketTable>` lands *above* the pill row, not beside it. §3 resolves this, and the design
  actually wants them in one row.
- `dp/MarketTable.jsx:20-24` — the pager **already clamps** (`safePage = Math.min(page, totalPages)`),
  so a narrowing filter shows the last valid page, never a blank one. Relevant to §5's page reset,
  which is still correct behaviour for a different reason.
- `dp/MarketTable.jsx:57` — the "No players match your filters." empty state already exists.
- **`PlayersTab.jsx`'s `displayRows` memo (`:1883-1944`) holds all ten filter predicates**, applied
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
  sentinels above. **The slider bounds in `FilterSidebar` are these same numbers**
  (`:1652-1655`: Age `18–45`, Experience `0–20`; KTC `0–10000` at `:1718`) — §4 depends on that.
- `DYNASTY_GROUP_MAP` (`:1478-1483`) — `Prospects` / `Rising` / `Established` / `Declining` →
  label lists, 5+5+5+4 = 19 labels, matching `OUTLOOK_ORDER`'s label set (`:1525-1532`). Not
  currently exported; §2 exports it rather than copying.
- `NFL_TEAMS` (`:1471-1476`) — the Explorer's **hard-coded 32-team list**, used as the `nflTeams`
  multi-select's options. Relevant to §4: rows cannot supply this list correctly (see below).
- **Rows never carry a null NFL team** — `nfl_team: info.team ?? 'FA'` (`App.jsx:422`). So deriving
  team options from row values yields `FA` as a selectable "NFL team", overlapping the Availability
  radio's `nflFreeAgent` mode.
- `Market.jsx:373` — `totalCount = playerRows?.length ?? 0`, rendered at `:521` as
  "N players · every asset in the league, owned or not". **Filters never touch it** — see §5.
- `MultiSelect` (`:1572-1616`) — the Explorer's searchable option list: a text input filtering a
  fixed option array, plus a selected-chip list. `FilterSidebar` itself is at `:1618` — a fixed left
  slide-in (`w-[280px]`, old `--color-*` tokens), `CollapsibleSection`s, `RangeSlider`, and the
  preset block (slice vii). **Structurally wrong for the design's panel** (an inline 4-column grid
  below the filter bar), so this is a re-skin in the dp language, not a reuse — same call as
  `PlayersDataTable` in Slice iii.
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
export function applyMarketFilters(rows, filters, { playerMap, myTeamName, seasonProjections })
export function activeFilterCount(filters)   // for the bar's pills + "N active"
export function normalizeFilters(raw)        // stale-payload validation — see §5
```

Pure, no React, no styling — the same shape as `tabState.js` (Slice v) and testable without mounting.

### 2.1 Copy the predicates; IMPORT the data

These are two different decisions and an earlier draft wrongly gave them the same answer.

**Predicates — copy.** They also live inline in `PlayersTab.jsx`'s `displayRows`. Extracting them
*from* `PlayersTab` would restructure a surface three slices have kept frozen, for a file slice viii
deletes. Copy them into `marketFilters.js`, with a comment naming slice viii as the resolution.
**Do not refactor `PlayersTab` to use this module.**

**`DYNASTY_GROUP_MAP` and `NFL_TEAMS` — import.** Add `export` to both in `PlayersTab.jsx`
(`:1478`, `:1471`) and import them. This is the precedent Slice iii already set — it added `export`
keywords to these same frozen files so Market could "import, not copy", and an `export` keyword is
not a behavioural change. These are **data, not logic**: `DYNASTY_GROUP_MAP`'s 19 labels must stay
in lockstep with `dynastyScore`'s label set, and a forked copy diverges silently if a label is
added before slice viii. Slice viii moves both into `marketFilters.js` when `PlayersTab` is deleted.

**Semantics must match `displayRows` exactly**, including the sentinel gating (§0) and the
application order. §8's tests pin this.

---

## 3. Filter bar — one row WITH the position pills

**The design puts them in the same bar.** Its Filter-bar paragraph reads: position segmented
control, then active filter pills, then "+ Add filter", then a right-aligned saved-preset label —
one `flex; gap: 8px; flex-wrap: wrap` row. That also resolves §0's placement problem, since the
pills already live inside `MarketTable`.

**Implementation: add an optional `filterBar` render-prop to `MarketTable`**, rendered in the same
flex row as the existing pills (`dp/MarketTable.jsx:28-40`). Additive — when the prop is absent the
component renders exactly as today, so nothing else that uses it changes. Do **not** move the pills
out into `Market.jsx`; that would alter a committed, smoke-tested surface for no gain.

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

**Slider bounds are load-bearing — they must be exactly the sentinel values.** Age `18–45`,
Experience `0–20`, KTC `0–10000` (`PlayersTab.jsx:1652-1655`, `:1718`), `minProjectedGames` `0–17`.
The sentinel gate is a strict `!==` against those defaults, so **any other bound makes the "off"
state unreachable by dragging** — the filter stays permanently active and silently drops every
null-valued row. That is the §0 failure arriving through the control instead of the predicate.
Give each slider a step of `1`.

- **Range sliders** — 5px track `bg-dp-border-row`, `bg-dp-up` fill, 13px round `#e6e8eb` handles.
- **Checkboxes** — 13px squares, `rounded-[4px]`, `bg-dp-up` when checked, `border-dp-border-raised`
  when not.
- **Radios** — render as a 3-up/4-up segmented control, matching the column-set switch's styling
  (`Market.jsx`'s existing segmented control) rather than inventing a radio style.
- **Multi-selects** (`nflTeams`, `fantasyTeams`) — the Explorer's searchable list
  (`PlayersTab.jsx:1572-1616`) re-skinned. **This one has a text input**, and that is fine: it is a
  filter-local search over a fixed option list, not the global player search deferred to slice vii.
  **Options:** `nflTeams` uses the **imported `NFL_TEAMS`** 32-team constant (§2.1), *not* distinct
  row values — rows default to `nfl_team: 'FA'` when a player has no team (`App.jsx:422`), so
  deriving from rows would list `FA` as a selectable NFL team, duplicating the Availability radio's
  `nflFreeAgent` mode. `fantasyTeams` uses the distinct non-null `ownerTeamName` values in
  `playerRows`; **`Market` is NOT passed `fantasyTeamNames`** (that prop goes only to
  `PlayersSurface`), and deriving from rows avoids a new prop while matching what the table can
  actually show.

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
  to `localStorage` under `market-filters`, and validate on read with `normalizeFilters` (§2) —
  **per-key type/length/enum, not key presence.** Because the sentinels are strict numeric `!==`
  comparisons, a stale payload like `ageRange: ["18","45"]` or a 1-element array passes a
  key-presence check and reads as **active**, emptying the table with no visible cause. Coerce or
  discard per key, falling back to that key's default.
- Apply filters **before** the existing sort and pagination, and **after** the position-pill filter —
  matching `displayRows`' order.
- **Reset `page` to 1 whenever `filters` changes**, exactly as the column-set switch does
  (`Market.jsx:211-214`, and the production-season selector at `:230`). **Note the reason is not
  "otherwise you land on an empty page"** — `MarketTable` already clamps (`:20-24`), so you'd land
  on the last valid page. The reason is that staying on page 4 of a freshly-narrowed result set is
  disorienting: the user changed the query and expects to see the top of the new answer.
- `Market` needs `playerMap` and `seasonProjections` for the predicates. **Both are already props**
  (`playerMap` at `App.jsx:1050`, `seasonProjections` at `:1051`, in the `<Market>` call site
  `:1046-1054`) — no new prop threading.
- The empty state ("No players match your filters.") already exists in `MarketTable`
  (`dp/MarketTable.jsx:57`); verify it renders when filters exclude everything.

### 5.1 The header count must follow the filters

`Market.jsx:373` computes `totalCount = playerRows?.length ?? 0` and `:521` renders
**"N players · every asset in the league, owned or not"**. Filters never touch either. Left alone,
a filtered Market shows **three different numbers on one screen** — the header, the pager's
"X–Y of Z", and the Apply button's count — and the "every asset" copy becomes false.

**Fix both:**
- Point the header count at the **filtered** row count, the same array the table and pager consume.
- Make the copy conditional: unfiltered keeps
  `` `${n} players · every asset in the league, owned or not` ``; filtered becomes something true,
  e.g. `` `${n} of ${total} players · N filters active` ``.

This is a small edit to a committed surface, and it is in scope — the slice creates the
inconsistency, so the slice fixes it.

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
  - **Multiple dimensions compose** — predicates AND, per `displayRows`. Every other case here
    exercises one dimension at a time, which would not catch a reducer that replaces rather than
    narrows.
  - **`normalizeFilters` rejects stale payloads** — `ageRange: ["18","45"]`, a 1-element array, an
    unknown `availability` enum, a missing key — each falling back to that key's default (§5). §5
    makes this validation a requirement; without a test it is the kind of thing that silently
    regresses.
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
- **`docs/cross-repo-registry.md`** — CR-17's app-side anchor for the Explorer's KTC Δ consumer
  reads `PlayersTab.jsx:9`/`:1873`; the live call is at `:1878`. File-level coverage is correct, so
  this is anchor drift, not an uncovered consumer — fix it in passing while the file is open.

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
- [ ] Slider bounds are exactly the sentinel defaults (Age `18–45`, Exp `0–20`, KTC `0–10000`) so
      the "off" state is reachable by dragging
- [ ] `nflTeams` options come from the imported 32-team `NFL_TEAMS` — **`FA` is not selectable**
- [ ] `normalizeFilters` validates per-key type/length/enum, not key presence, with a test
- [ ] The header count follows the filters and its copy stops claiming "every asset" when filtered
- [ ] `DYNASTY_GROUP_MAP` and `NFL_TEAMS` are **imported** (two `export` keywords added), not copied;
      only the predicates are copied
- [ ] `/players` **behaviourally frozen** — `PlayersTab.jsx` not refactored onto the new module
      (slice viii deletes it); confirm with `git diff --stat`
- [ ] No new `PROVISIONAL` sites — grep returns exactly Slice ii's three
- [ ] `npm test` green · `npm run lint` no new problems · `npm run build` clean
- [ ] CLAUDE.md + `docs/ui.md` + master-plan §6a updated in the same change
- [ ] Handed back for the user's visual smoke


---

## 12. Revision note (post plan-review, 2026-08-14)

Eleven flags, all verified against live source and all fixed.

**One instruction was impossible as written.** §0 said the filter bar "sits beside those pills, not
inside `MarketTable`" — but the pills are rendered *inside* `MarketTable`, so a bar mounted above
`<MarketTable>` lands above the pill row, not beside it. There was no way to satisfy it. §3 now adds
an additive `filterBar` render-prop slot rendered in the pills' own flex row — which is also what
the design's Filter-bar paragraph describes.

**Three would have shipped silently wrong output:**
- The header count (`totalCount = playerRows?.length`) never follows filters, so a filtered Market
  would show three different numbers and claim "every asset in the league" (§5.1).
- `nflTeams` options derived from row values would list **`FA`** as a selectable NFL team, since
  rows default `nfl_team: info.team ?? 'FA'`. The Explorer avoids this with a hard-coded 32-team
  list (§4).
- The `market-filters` restore validated key *presence*, so a stale `ageRange: ["18","45"]` passes
  and — because the sentinels are strict `!==` — reads as **active**, emptying the table with no
  visible cause (§5).

**One was the same trap I wrote a whole section warning about, arriving through a different door.**
§0 warns that the *predicates* must preserve sentinel gating; §4 then specified the *controls* with
no bounds. A slider whose range isn't exactly `[18,45]` / `[0,20]` / `[0,10000]` makes the "off"
state unreachable by dragging, leaving the filter permanently active and silently dropping every
null-valued row (§4).

**One contradicted the precedent this file relies on.** §2 copied `DYNASTY_GROUP_MAP` along with the
predicates, but Slice iii already established that adding `export` to a frozen `/players` file is
non-behavioural, and the map is *data* whose 19 labels must track `dynastyScore`'s label set. Split
in §2.1: predicates copied, `DYNASTY_GROUP_MAP` and `NFL_TEAMS` imported.

**One justification was simply wrong.** §5 said the page reset prevents landing on an empty page;
`MarketTable` already clamps (`:20-24`). The reset is still right, for a different reason.

**Two coverage gaps and line drift:** §8 pinned the sentinels but not multi-dimension composition or
stale-payload rejection — both failure modes this file itself creates. §0's `displayRows`,
`MultiSelect` and `DYNASTY_GROUP_MAP` anchors were each off by a line or two, and CR-17's registry
anchor has drifted a few lines (file-level coverage still correct — §9).

**Verified clean:** the sentinel-gating claim for all three ranges, all ten predicates including the
`available` vs `nflFreeAgent` distinction, every backing field, `projectedGames` sourcing, all named
`--color-dp-*` tokens, the props at Market's call site, the page-reset precedents, the PROVISIONAL
count, and `filters` as view-local state sitting inside the *App.jsx owns all state* carve-out.
