# Slice vii — Presets, Market text filter, and global search

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `923465a`, then revised after a `plan-reviewer` pass that raised **11 flags — all verified
and all fixed** (see §13; one was a logical contradiction, not a detail). Per the
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
  **Its wrapper is `flex-1 max-w-md hidden sm:block` with no `relative`** (`:18`) — so an
  absolutely-positioned dropdown would anchor to the `sticky` `<header>` (`:6`), not the field. §4.1
  requires adding `relative`. The `hidden sm:block` half — the field does not exist below the `sm` breakpoint.
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
    `disabled={presets.length >= 5}` (`:1757`).
    **Those two rules are mutually exclusive at the cap** — once five presets exist the button is
    disabled, so the name-replace branch is unreachable and an existing preset can never be
    overwritten. That is a dead end; §3 fixes it rather than copying it.
  - apply: `setFilterState({ ...DEFAULT_FILTER_STATE, ...p.state })` — a **key-level** merge only.
  - delete: filter by name.
- **Explorer free-text search** — a separate `useState` (`:1777`), **not** part of `filterState`,
  therefore **not persisted**; the predicate is at **`:1929`** (`:1927` is the `if (search.trim())`
  guard, `:1928` binds `q`), and it page-resets via the effect at `:1808`.
  **Note it is unguarded**: `r.full_name.toLowerCase()` throws on a null/absent `full_name`. The
  Explorer survives that because it runs inside a component memo over rows it controls; a pure util
  unit-tested with hand-built fixtures does not. See §2.
- `src/utils/marketFilters.js` (Slice vi) — `DEFAULT_MARKET_FILTERS`, `applyMarketFilters`,
  `activeFilterCount`, **`normalizeFilters`** (per-key type/length/enum validation). §3 depends on
  `normalizeFilters` existing.
- `src/components/market/FilterBar.jsx` (Slice vi) — returns a **bare fragment** into
  `MarketTable`'s flex-wrap row and owns the panel's open/closed state. **There is no "right-aligned
  slot"** — an earlier draft of this file claimed Slice vi left one empty; it did not. The only
  right-alignment is `ml-auto` on the **conditionally rendered** "Reset all" button (`:59-87`,
  rendered only when `pills.length > 0`). §3 specifies where presets go and how they coexist with
  that `ml-auto`.
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

- **Predicate:** `(r.full_name ?? '').toLowerCase().includes(query.trim().toLowerCase())`.
  Semantically the Explorer's (`PlayersTab.jsx:1929`) **plus a null guard** — do not copy it
  verbatim. The Explorer is safe only because it runs over rows it controls; this lands in a pure
  util that §9 unit-tests with hand-built fixtures, where a row without `full_name` is a normal
  test case, not an anomaly. Empty/whitespace query filters nothing.
- **Apply it inside `applyMarketFilters`**, so all filtering stays in one pure function and one
  place in the pipeline. Add `search: ''` to `DEFAULT_MARKET_FILTERS` and handle it in
  `normalizeFilters` (coerce non-strings to `''`).
- **But do NOT persist it — and that takes TWO changes, not one.** `Market.jsx`'s `setFilters`
  serializes the whole `filters` object on every change (`:252-257`), so putting `search` inside
  `filters` writes it to `localStorage` on **every keystroke**. An earlier draft specified only the
  read side, which would have left the query persisted-but-ignored.
  - **Write:** `setFilters` persists `{ ...next, search: '' }` — the in-memory value still drives
    the table; only the serialized copy is blanked.
  - **Read:** `normalizeFilters` forces `search` to `''` regardless of payload.

  Both, deliberately. Comment why: it is the one key intentionally not restored, because returning
  to a table silently narrowed by a forgotten query is a bad surprise — the same reason the Explorer
  keeps `search` out of its persisted `filterState`.
- **Counts as an active filter** for `activeFilterCount`, the pills and "Reset all", so it is
  visible and clearable like every other dimension.
- **Page resets on change**, as with every other filter (Slice vi §5).

## 3. Saved presets (parity)

Mirror the Explorer's mechanism (§0) with the corrections below.

**Placement.** `FilterBar` has no right-aligned slot (§0). Wrap the preset control **and** the
existing "Reset all" button in a single `ml-auto` group, and move `ml-auto` from the button to that
wrapper — otherwise two `ml-auto` siblings fight, and the preset control disappears from the right
edge whenever `pills.length === 0` hides Reset all. The group renders whenever presets exist or any
filter is active.

**Storage key `market-filter-presets`** — a *new* key. Do **not** reuse `explorer-presets`: those
payloads are `DEFAULT_FILTER_STATE`-shaped (ten keys, no `minProjectedGames`, no `search`) and would
be silently wrong here. Slice viii deletes the Explorer's key with its surface.

**Cap at 5 — but fix the Explorer's dead end.** It disables the save button at
`presets.length >= 5` *and* name-replaces on collision (§0), which makes the replace branch
unreachable at the cap: with five saved you cannot overwrite one. **Disable saving only when the
list is full AND the typed name is new.** Re-saving an existing name must always work.

### 3.1 Dropping an invalid preset needs a predicate `normalizeFilters` cannot provide

An earlier draft said to route every applied preset through `normalizeFilters` *and* to drop invalid
ones. **Those are incompatible.** `normalizeFilters` never fails — it salvages per-key and always
returns a full valid object (`marketFilters.js:130-155`; its own comment says each key "falls back
to its own default"). A preset saved with `ageRange: ["18","45"]` would normalize to the default
range and apply as *no age filter* — precisely the "silently applying 'no filters' under a name the
user saved" outcome this section calls worse than the entry disappearing.

**Add a strict companion to `marketFilters.js`:**

```js
// True only if `raw` needs no salvaging — every key already valid.
export function isRestorableFilters(raw)
```

Implement it against the same per-key rules `normalizeFilters` uses (share the validators; do not
write a second copy of the logic).

**Two payloads, two policies — this distinction is the point:**

| Payload | Policy | Why |
|---|---|---|
| `market-filters` (live, unnamed) | **Salvage** — `normalizeFilters` | Losing every filter because one key drifted is worse than quietly repairing that key. Nothing is promised about it. |
| A **named preset** | **Strict** — drop when `!isRestorableFilters(p.state)` | The user named it. A preset that silently means something other than what they saved is a broken promise, and there is no way for them to notice. |

So: filter the stored preset list through `isRestorableFilters` at mount, dropping entries that
fail; apply survivors through `normalizeFilters` (a no-op for them by definition, but it keeps one
path). Applying a preset **must not restore `search`** (§2) — force it to `''`.

## 4. Global search — activating `TopBar`

### 4.1 Behaviour

- The field becomes enabled. **Placeholder narrows to `"Search players"`** (§6.2).
- A **`⌘K` / `Ctrl+K`** keycap renders inside the field's right edge — mono 11px, 1px border,
  `rounded-[4px]`, per the design. The shortcut focuses the field.
- **Add `relative` to the field's wrapper** (`TopBar.jsx:18`). It is currently
  `flex-1 max-w-md hidden sm:block` with no positioned ancestor nearer than the `sticky` `<header>`,
  so an absolutely-positioned dropdown would anchor to the whole bar rather than the field.
- Typing ≥2 characters opens a results dropdown: up to **8** players whose `full_name` matches
  (same guarded substring test as §2), **ranked by `dynastyScore.score` descending**, nulls last.
  Each row shows name, `pos · age · team` meta, and a mono score.
  **Do NOT import `PlayerCell` from `dp/cells.jsx`.** It carries dp tokens, and §5.2 puts this
  dropdown on the chrome family — a dp-styled row inside a chrome-styled panel is the seam this
  slice is specifically avoiding. Match the *layout* of the pop-up's add-player row; write the
  markup locally with chrome tokens.
- Picking a result calls **`openPlayerDetail(id)`** — the same entry point Market and Portfolio use
  — and clears the query. It navigates; it changes no table.
- `Escape` closes the dropdown and blurs. Clicking outside closes it.
- Fewer than 2 characters, or no matches: no dropdown. **Do not render an empty panel.**

### 4.2 Where the rows come from

`playerRows` — the same array the surfaces use. `TopBar` currently receives no data props, so
thread **two** new props through `AppShell` (see §0 — its prop list is explicit and does not
forward):
- `searchablePlayers` — the minimal `{ player_id, full_name, position, age, nfl_team, score }`
  projection, memoised in `App.jsx`.
- `popupOpen` — `tabs.length > 0`, for §4.3's `⌘K` gate.

Both must be added to `AppShell`'s signature **and** its `<TopBar>` call. **Do not pass the full `playerRows`** into the chrome; the shell
has no business holding pipeline rows, and a narrow projection keeps that boundary honest.

When `playerRows` is empty (pre-league, or career data still loading), the field renders
**disabled** exactly as today. Search is not available before there is anything to search.

### 4.3 `⌘K` must not fight the pop-up

`PlayerDetailTabs` already owns a `window` keydown listener (`:59-67`). A second global listener
would compete, and a search overlay on top of an open modal is a three-layer stack.

**Decision: `⌘K` is inert while the pop-up is open.** The pop-up has its own "+ Add player to
compare" dropdown, which covers the same need in that context.

**Corrected implementation.** An earlier draft put the `⌘K` listener in `App.jsx` (which holds
`tabs`) and had it "pass a focus signal" to `TopBar`. That needs a *second* new prop, and a boolean
signal cannot re-fire on a repeated `⌘K` — it would need a counter or an imperative ref, neither of
which was specified. Simpler and correct:

**`TopBar` owns the listener and focuses its own ref; `App.jsx` passes `popupOpen={tabs.length > 0}`
and the handler early-returns when it is true.** One boolean, no signal plumbing, no ref forwarding.

Note the click path is *already* blocked — the pop-up's scrim is `z-40`
(`PlayerDetailTabs.jsx:155`) over `TopBar`'s `z-30` (`TopBar.jsx:6`), so the field is unreachable by
mouse while the pop-up is open. `popupOpen` exists only because a keydown listener is not blocked by
a scrim. This decision is therefore consistent with what the DOM already enforces, not a new rule.

## 5. Wiring

### 5.1 State ownership

- **Market's `search`** — part of `filters` in `Market.jsx` (view-local), per §2.
- **Global search query + dropdown-open** — **view-local in `TopBar`**, including the `⌘K`
  listener (§4.3). `App.jsx` contributes only the two props in §4.2.

  **On the invariant:** the *App.jsx owns all domain/pipeline state* rule forbids moving **domain**
  state out of `App.jsx`; its explicit carve-out names view-local *table* state in
  `usePlayersTable`, which is not this. The right authority is the established precedent for
  ephemeral chrome/view state with a single consumer — `Market.jsx`'s `filters`/`columnSet`,
  `FilterBar`'s panel-open flag, `PlayerDetailTabs`' `dropdownOpen`. An earlier draft cited the
  `usePlayersTable` carve-out, which does not reach chrome state.
- **Clear the query on league switch from inside `TopBar`** — a `useEffect` on
  `selectedLeague?.league_id` (already a prop) resetting query and dropdown. An earlier draft said to
  fold this into `handleSwitch` (`App.jsx:925-932`); that cannot work, because `handleSwitch` has no
  handle on `TopBar`-local state and `AppShell` renders `TopBar` unconditionally (`AppShell.jsx:20`),
  so it never unmounts on a switch.

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
- **`isRestorableFilters`** (§3.1) — true for a clean payload, false for each per-key corruption
  `normalizeFilters` would otherwise salvage (`ageRange: ["18","45"]`, a 1-element range, an unknown
  `availability`). This is the predicate the "drop" behaviour rests on.
- **Presets** — save/apply/delete round-trip; **re-saving an existing name works at the 5-cap**
  (the Explorer's dead end, §3); **a preset failing `isRestorableFilters` is dropped from the list
  rather than applied**; **applying a preset does not restore `search`**. Each is a silent failure
  if wrong.
- **`search` is not persisted, at both ends** (§2) — `setFilters` writes `search: ''` no matter the
  in-memory value, and `normalizeFilters` forces `''` on read. Two separate assertions; an earlier
  draft specified only the read side.
- **`TopBar.test.jsx`** — field disabled when `searchablePlayers` is empty; ≥2 chars opens results;
  <2 chars and zero-match render no dropdown; picking a result calls `openPlayerDetail` with the
  right id; `Escape` closes.
- **`⌘K` is inert when `popupOpen`** (§4.3) — assert in `TopBar.test.jsx`, which now owns the
  listener.
- **`AppShell.test.jsx`** — **both** new props reach `TopBar` (the Slice i `currentWeek` lesson).
- **The query clears when `selectedLeague` changes** (§5.1) — the league-switch path.

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
- [ ] `search` blanked at **both** ends — `setFilters` persists `{ ...next, search: '' }` and
      `normalizeFilters` forces `''` on read; both tested
- [ ] The search predicate is **null-guarded** (`(r.full_name ?? '')`), not copied verbatim
- [ ] Presets under **`market-filter-presets`** (not `explorer-presets`), cap 5, and **re-saving an
      existing name works at the cap** — the Explorer's dead end not reproduced
- [ ] **`isRestorableFilters` added** (§3.1), sharing validators with `normalizeFilters`; presets
      failing it are **dropped at mount**, survivors applied through `normalizeFilters`
- [ ] Preset control and "Reset all" share one `ml-auto` wrapper — no duelling `ml-auto` siblings
- [ ] `TopBar` field enabled, placeholder `"Search players"`, `⌘K` keycap, `⌘K`/`Ctrl+K` focuses
- [ ] Results: ≥2 chars, max 8, ranked by dynasty score desc, nulls last; no empty panel; picking
      calls `openPlayerDetail(id)`
- [ ] Field **disabled when `searchablePlayers` is empty**
- [ ] **Two** new props threaded `App.jsx` → `AppShell` → `TopBar` — `searchablePlayers` (a narrow
      projection, **not** `playerRows`) and `popupOpen`
- [ ] **`⌘K` listener lives in `TopBar`** and early-returns on `popupOpen` — no focus-signal prop,
      no counter, no ref forwarding
- [ ] The field's wrapper gains `relative` so the dropdown anchors to the field, not the header
- [ ] **`PlayerCell` is NOT imported into `TopBar`** — result rows are local markup on chrome tokens
- [ ] Query clears on league switch from a `TopBar` effect on `selectedLeague?.league_id`
- [ ] Dropdown uses the **chrome `--color-*` family**, not `--color-dp-*`, with the reason commented
- [ ] `/players` behaviourally frozen — confirm with `git diff --stat`
- [ ] No new `PROVISIONAL` sites — grep returns exactly Slice ii's three
- [ ] `npm test` green · `npm run lint` no new problems · `npm run build` clean
- [ ] CLAUDE.md + `docs/ui.md` + master-plan §6a updated, §6a stating parity is met and slice viii
      unblocked
- [ ] Handed back for the user's visual smoke, framed as the pre-deletion parity check


---

## 13. Revision note (post plan-review, 2026-08-14)

Eleven flags, all verified against live source and all fixed.

**One was a contradiction in the same section.** §3 required every applied preset to go through
`normalizeFilters` *and* required invalid presets to be dropped. `normalizeFilters` never fails — it
salvages per-key and always returns a full valid object — so a preset with a corrupt range would
have normalized to the default and applied as *no filter*, exactly the outcome §3 called worse than
the entry disappearing. §9 then asked for a test that could not pass. **§3.1 is new**: a strict
`isRestorableFilters` companion, sharing validators with `normalizeFilters`, plus the reasoning for
why the live payload and a *named* preset get opposite policies — salvage the unnamed one, drop the
named one, because only the named one carries a promise the user can't check.

**Three described things that do not exist or would not work:**
- `FilterBar` has no "right-aligned slot" — it returns a bare fragment, and its only `ml-auto` is on
  a *conditionally rendered* Reset-all button. §3 now specifies a shared `ml-auto` wrapper.
- The `TopBar` field's wrapper has no `relative`, so the dropdown would anchor to the `sticky`
  header rather than the field (§4.1).
- The Explorer's preset cap and name-replace are **mutually exclusive at 5** — the save button
  disables, making the replace branch unreachable. §3 fixes it instead of copying it.

**Two were wiring errors:** §5.1 put the query in `TopBar` while clearing it from `handleSwitch`,
which has no handle on it and never unmounts `TopBar`; and §4.2 promised one new prop while §5.1
needed a second "focus signal" that a boolean could not even re-fire. Both resolved by giving
`TopBar` the `⌘K` listener and `App.jsx` a plain `popupOpen` boolean — which also matches what the
DOM already enforces, since the pop-up's `z-40` scrim covers `TopBar`'s `z-30`.

**One was a persistence hole:** "do NOT persist `search`" specified only the read side, while
`setFilters` serializes the whole object on every keystroke. Now blanked at both ends.

**Two were consistency slips:** §4.1 said to reuse the pop-up's add-player row, which is built on
dp-token `PlayerCell`, directly against §5.2's chrome-token rule; and §5.1 cited the
`usePlayersTable` carve-out as authority for chrome state, which it does not reach.

**One was a copied hazard:** `r.full_name.toLowerCase()` is unguarded in the Explorer and safe only
because it runs over rows that surface controls. Copied into a pure util with fixture-built tests it
throws — now `(r.full_name ?? '')`.

Plus a line anchor cited three times as an exactness claim: the predicate is at `PlayersTab.jsx:1929`.

**Verified clean:** §1's two-features claim, §4.3's listener-ownership reasoning, and §11's
cross-repo "none". One note carried to **slice viii**: `PlayersTab.jsx` is a named app-side trigger
in CR-05, and `marketFilters.js:12` imports `DYNASTY_GROUP_MAP`/`NFL_TEAMS` from it — so that
dependency has a cross-repo dimension when the file is deleted.
