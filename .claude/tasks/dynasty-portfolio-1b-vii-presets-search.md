# Slice vii — Presets, Market text filter, and global search

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `923465a`. Not yet `plan-reviewer`'d. Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md) — **§4a** (the two standing
directives) and **§6a** (the retirement arc). §2.4 for the `PROVISIONAL` convention.

**This slice:** the second of the three-slice arc that lets `/players` be deleted. It closes the
last two parity gaps — **saved presets** and **free-text player filtering** — and, per the user's
2026-08-14 decision, additionally **activates `TopBar`'s disabled search field** as a global
`⌘K` player navigator.

**Explicitly NOT this slice:**
- **Retiring `/players` or settling the five debts → slice viii.** `/players` stays behaviourally
  frozen, exactly as in Slices iii–vi.
- **Chrome recolor** — still unscheduled. See §5.2: the search dropdown deliberately uses the
  chrome's own token family, *not* `--color-dp-*`.
- **Non-player search results.** See §6.2 — the placeholder narrows to "Search players".
- Portfolio, the pop-up's internals, the column sets.

---

## 0. Confirmed against live source

- `src/components/shell/TopBar.jsx:18-25` — the search field, **`disabled`**, placeholder
  `"Search players, teams…"`, styled with the **old `--color-*` family** (`border-[var(--color-border)]`,
  `bg-[var(--color-surface)]`). It has been inert since Slice i, which deferred search behaviour
  entirely (master-plan §5.2). No `⌘K` keycap was ever built.
  **Its wrapper is `hidden sm:block`** (`:18`) — the field does not exist below the `sm` breakpoint.
  So global search is **desktop/tablet only**, and `⌘K` has no mobile equivalent. That is acceptable
  (a hardware shortcut implies a keyboard), but do **not** "fix" it by unhiding the field on mobile —
  it would crowd a bar that already carries the League link and two toggles at that width. Market's
  own text filter (§2) is in the page body and remains available on every breakpoint, so mobile
  keeps the parity-relevant capability.
- `src/components/shell/AppShell.jsx:5-30` — a **fixed, explicit prop list**; it does not forward
  unlisted props. Any new `TopBar` prop must be added to `AppShell`'s signature *and* its `<TopBar>`
  call, then passed from `App.jsx`. Slice i learned this the hard way with `currentWeek`.
- **Explorer presets** — `LS_PRESETS = 'explorer-presets'` (`PlayersTab.jsx:1501`), state at
  `:1811-1814`, and three handlers at `:1819-1828`:
  - save: `[...presets.filter(p => p.name !== name), { name, state: filterState }].slice(-5)` —
    name-replaces, then keeps the **last** five (oldest silently dropped). The save button is also
    `disabled={presets.length >= 5}` (`:1757`), so the cap is enforced twice.
  - apply: `setFilterState({ ...DEFAULT_FILTER_STATE, ...p.state })` — a **key-level** merge only.
  - delete: filter by name.
- **Explorer free-text search** — a separate `useState` (`:1777`), **not** part of `filterState`,
  therefore **not persisted**; applied inside `displayRows` at `:1927-1928`
  (`r.full_name.toLowerCase().includes(q)`), and page-resets via the effect at `:1808`.
- `src/utils/marketFilters.js` (Slice vi) — `DEFAULT_MARKET_FILTERS`, `applyMarketFilters`,
  `activeFilterCount`, **`normalizeFilters`** (per-key type/length/enum validation). §3 depends on
  `normalizeFilters` existing.
- `src/components/market/FilterBar.jsx` / `FilterPanel.jsx` (Slice vi) — the bar owns the panel's
  open/closed state; the panel is the 4-column grid. Presets attach to the bar's right-aligned slot,
  which Slice vi deliberately left empty for this slice.
- `src/components/dp/PlayerDetailTabs.jsx:59-67` — the pop-up's `Escape` handler is a **`window`
  keydown listener** branching on `dropdownOpen`. Relevant to §4.3: a second global key listener
  competes with it.
- `App.jsx` — `openPlayerDetail(id)` (`:168`) is the single entry point the navigator will call;
  `tabs`/`activeTab` (Slice v) are the pop-up's open state.

---

## 1. Two different features — do not merge them

The Explorer's free-text search and a `⌘K` global search are **not the same thing**, and conflating
them would leave a parity hole that blocks slice viii:

| | Explorer's `search` | `⌘K` global search |
|---|---|---|
| Does | **Filters** the table to matching rows | **Navigates** — jumps to one player |
| Scope | The table you're looking at | Any surface |
| Parity item? | **Yes** — slice viii can't proceed without it | No, it's new |
| Result | A narrowed table | The detail pop-up opens |

**Both ship.** Market gets its own text filter (§2, parity) *and* `TopBar` activates (§4, new).

**Accepted redundancy:** on `/market` there will be two text inputs on screen — the filter-bar one
that narrows the table, and the chrome one that jumps to a player. They look different (inline in
the filter bar vs. in the bar with a `⌘K` keycap) and do different things. This is the same shape as
a repo file-filter alongside a global search in developer tools. **Do not try to unify them** by
making `TopBar` filter Market when Market is on screen — mode-dependent behaviour from one control
is worse than two clearly-scoped controls.

---

## 2. Market's free-text filter (parity)

Add a text input to the **filter bar** (`FilterBar.jsx`), left of the "+ Add filter" control.

- **Predicate:** `r.full_name.toLowerCase().includes(query.trim().toLowerCase())`, matching
  `PlayersTab.jsx:1927-1928` exactly. Empty/whitespace query filters nothing.
- **Apply it inside `applyMarketFilters`**, so all filtering stays in one pure function and one
  place in the pipeline. Add `search: ''` to `DEFAULT_MARKET_FILTERS` and handle it in
  `normalizeFilters` (coerce non-strings to `''`).
- **But do NOT persist it.** The Explorer deliberately keeps `search` out of its persisted
  `filterState` (§0), and returning to a table silently narrowed by a forgotten query is a bad
  surprise. **On read, `normalizeFilters` must force `search` back to `''`** regardless of what is
  in `localStorage`. Comment why — it is the one key that is intentionally not restored.
- **Counts as an active filter** for `activeFilterCount`, the pills and "Reset all", so it is
  visible and clearable like every other dimension.
- **Page resets on change**, as with every other filter (Slice vi §5).

## 3. Saved presets (parity)

Attach to `FilterBar`'s right-aligned slot. Mirror the Explorer's mechanism (§0) with two
corrections:

- **Storage key `market-filter-presets`** — a *new* key. Do **not** reuse `explorer-presets`: those
  payloads are `DEFAULT_FILTER_STATE`-shaped (ten keys, no `minProjectedGames`, no `search`) and
  would be silently wrong here. Slice viii deletes the Explorer's key along with its surface.
- **Cap at 5**, name-replaces on collision, same as the Explorer.
- **Apply MUST go through `normalizeFilters`, not a spread.** The Explorer does
  `{ ...DEFAULT_FILTER_STATE, ...p.state }` — a key-level merge that fills missing keys but
  **validates nothing**. A preset is exactly the stale-payload case Slice vi's review caught: saved
  today, then a bound or key changes, and it reapplies as active in a way the user never set —
  emptying the table with no visible cause. Run every applied preset through `normalizeFilters`.
  Same for presets read from `localStorage` at mount.
- Applying a preset **must not restore `search`** (§2) — normalize it to `''`.
- A preset with an unparseable payload is **dropped from the list**, not applied as defaults;
  silently applying "no filters" under a name the user saved is worse than the entry disappearing.

## 4. Global search — activating `TopBar`

### 4.1 Behaviour

- The field becomes enabled. **Placeholder narrows to `"Search players"`** (§6.2).
- A **`⌘K` / `Ctrl+K`** keycap renders inside the field's right edge — mono 11px, 1px border,
  `rounded-[4px]`, per the design. The shortcut focuses the field.
- Typing ≥2 characters opens a results dropdown: up to **8** players whose `full_name` matches
  (same case-insensitive substring test as §2), **ranked by `dynastyScore.score` descending**, nulls
  last. Each row reuses the shape of the pop-up's add-player dropdown — name, `pos · age · team`
  meta, mono score.
- Picking a result calls **`openPlayerDetail(id)`** — the same entry point Market and Portfolio use
  — and clears the query. It navigates; it changes no table.
- `Escape` closes the dropdown and blurs. Clicking outside closes it.
- Fewer than 2 characters, or no matches: no dropdown. **Do not render an empty panel.**

### 4.2 Where the rows come from

`playerRows` — the same array the surfaces use. `TopBar` currently receives no data props, so
thread **one** new prop through `AppShell` (see §0 — its prop list is explicit and does not
forward): `searchablePlayers`, the minimal `{ player_id, full_name, position, age, nfl_team, score }`
projection, memoised in `App.jsx`. **Do not pass the full `playerRows`** into the chrome; the shell
has no business holding pipeline rows, and a narrow projection keeps that boundary honest.

When `playerRows` is empty (pre-league, or career data still loading), the field renders
**disabled** exactly as today. Search is not available before there is anything to search.

### 4.3 `⌘K` must not fight the pop-up

`PlayerDetailTabs` already owns a `window` keydown listener (`:59-67`). A second global listener
would compete, and a search overlay on top of an open modal is a three-layer stack.

**Decision: `⌘K` is inert while the pop-up is open.** The pop-up has its own "+ Add player to
compare" dropdown, which is the same need in that context. Implement by owning the `⌘K` listener in
`App.jsx` — which already holds `tabs` — and no-opping when `tabs.length > 0`. Do **not** add a
listener inside `TopBar` that has to guess at the pop-up's state.

## 5. Wiring

### 5.1 State ownership

- **Market's `search`** — part of `filters` in `Market.jsx` (view-local), per §2.
- **Global search query + dropdown-open** — **view-local in `TopBar`**, not `App.jsx`. It is
  ephemeral UI state with a single consumer, and the *App.jsx owns all state* invariant's carve-out
  covers exactly this. `App.jsx` owns only the `⌘K` listener (§4.3) and passes a focus signal.
- Clear the query on league switch — fold into the existing reset path alongside `closePlayerDetail()`.

### 5.2 Tokens — the dropdown stays on the chrome family

`TopBar` is shared chrome, the one surface Slice i deliberately kept on the light/dark-adaptive
`--color-*` family because it wraps `League`/`Board`/`Trade` in both themes. **A dark-only
`--color-dp-*` dropdown hanging off a theme-adaptive bar would render as a black panel under a
light bar.**

So the dropdown uses `--color-surface` / `--color-border` / `--color-text-*`, matching the field it
descends from. This is a deliberate exception to "new content is dp" — the control is chrome-adjacent,
and the alternative drags the unscheduled chrome-recolor decision forward. Comment it at the
component, or a future reader will "fix" it to dp tokens.

## 6. Calls made rather than asked

Both were flagged to the user 2026-08-14; both are recorded here so they are not re-litigated.

### 6.1 `⌘K` while the pop-up is open → inert
See §4.3. Avoids a third overlay layer and a second global key listener.

### 6.2 Non-player results → out of scope; placeholder narrows
The design's placeholder reads "Search players, teams, picks". **Picks do not exist as entities** —
Slice iv established there is no traded-picks endpoint and no representation of owned future picks.
**Teams** exist but have no detail surface to navigate to that this search would improve on. Per
§4a.2, ship what is real: players only, placeholder `"Search players"`. This is copy narrowing to
match capability, not a `PROVISIONAL` site — nothing fake renders.

## 7. `PROVISIONAL(...)` sites

**None.** Everything here reads real fields. `grep -rn "PROVISIONAL(" src/` must still return
**exactly Slice ii's three**. A fourth candidate is a stop-and-ask.

## 8. Step sequence

1. `marketFilters.js` — add `search` to `DEFAULT_MARKET_FILTERS`, the predicate in
   `applyMarketFilters`, `activeFilterCount`, and the **force-to-`''`** rule in `normalizeFilters`
   (§2). Extend its unit tests first.
2. Market's text input in `FilterBar` (§2).
3. Presets in `FilterBar`'s right slot (§3) — including the `normalizeFilters`-on-apply rule.
4. `TopBar` search (§4) + the `AppShell` prop threading + the `App.jsx` `⌘K` listener (§4.3, §5).
5. Tests (§9). 6. Docs (§10).
7. `npm test` green · `npm run lint` no **new** problems (5 pre-existing in
   `docs/design_handoff_dynasty_portfolio/support.js`, a vendored mock runtime) · `npm run build`
   clean · `grep -rn "PROVISIONAL(" src/` returns exactly three.
8. Hand back for the user's visual smoke — and note explicitly that this slice is the **last one
   before `/players` is deleted**, so the smoke should include a deliberate comparison: everything
   the Explorer can do, Market can now do.

## 9. Tests to add / update

- **`marketFilters.test.js`** — the `search` predicate (match, no-match, whitespace-only, case
  insensitivity); `search` counted by `activeFilterCount`; and **`normalizeFilters` forcing `search`
  to `''`** even when `localStorage` holds a non-empty one (§2) — that rule is invisible and would
  never be noticed if it regressed.
- **Presets** — save/apply/delete round-trip; the 5-cap replacing by name; **a preset whose payload
  is stale or invalid is dropped rather than applied**; **applying a preset does not restore
  `search`**. These are the §3 corrections and each is a silent failure if wrong.
- **`TopBar.test.jsx`** — field disabled when `searchablePlayers` is empty; ≥2 chars opens results;
  <2 chars and zero-match render no dropdown; picking a result calls `openPlayerDetail` with the
  right id; `Escape` closes.
- **`⌘K` is inert while the pop-up is open** (§4.3) — assert at whatever level owns the listener.
  This is the one cross-component interaction in the slice.
- **`AppShell.test.jsx`** — the new prop reaches `TopBar` (the Slice i `currentWeek` lesson).

## 10. Docs updates

- **`CLAUDE.md`** — `TopBar`'s row (search now live, chrome-token dropdown, `⌘K`), Market's row
  (text filter + presets), `marketFilters.js`'s row (`search` key and its no-restore rule), and the
  routing paragraph's claim that Market "ships without … saved presets", which becomes wrong here.
- **`docs/ui.md`** — Market's filter section; a short global-search entry.
- **Master plan §6a** — record slice vii as landed; **state explicitly that parity is now met and
  slice viii is unblocked**, since that is this slice's whole purpose.

## 11. Cross-repo impact

**None.** Client-side filtering and navigation over `playerRowsWithProj`; no new served reader, no
shape change, no `CR-NN` entry touched, no `Mirror` text to emit. As in Slices iii–vi this holds
only if nothing is recomputed from raw stat keys — this slice reads `full_name` and
`dynastyScore.score`, both already-derived row fields.

## 12. Done-definition checklist (this slice)

- [ ] `search` in `DEFAULT_MARKET_FILTERS`, applied inside `applyMarketFilters`, counted by
      `activeFilterCount`, page-resetting like every other dimension
- [ ] **`normalizeFilters` forces `search` to `''` on read** — never restored from `localStorage`,
      with a comment and a test
- [ ] Presets under **`market-filter-presets`** (not `explorer-presets`), cap 5, name-replacing
- [ ] **Every applied preset goes through `normalizeFilters`** — not a key-level spread; an
      invalid preset is dropped, not applied as defaults
- [ ] `TopBar` field enabled, placeholder `"Search players"`, `⌘K` keycap, `⌘K`/`Ctrl+K` focuses
- [ ] Results: ≥2 chars, max 8, ranked by dynasty score desc, nulls last; no empty panel; picking
      calls `openPlayerDetail(id)`
- [ ] Field **disabled when `searchablePlayers` is empty**
- [ ] One new prop threaded `App.jsx` → `AppShell` → `TopBar`, carrying a **narrow projection**,
      not `playerRows`
- [ ] **`⌘K` inert while the pop-up is open**, via the `App.jsx`-owned listener — no second global
      key listener
- [ ] Dropdown uses the **chrome `--color-*` family**, not `--color-dp-*`, with the reason commented
- [ ] `/players` behaviourally frozen — confirm with `git diff --stat`
- [ ] No new `PROVISIONAL` sites — grep returns exactly Slice ii's three
- [ ] `npm test` green · `npm run lint` no new problems · `npm run build` clean
- [ ] CLAUDE.md + `docs/ui.md` + master-plan §6a updated, §6a stating parity is met and slice viii
      unblocked
- [ ] Handed back for the user's visual smoke, framed as the pre-deletion parity check
