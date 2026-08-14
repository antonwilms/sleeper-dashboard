# Slice iii — Market screen, v1 (table only)

**Status:** implementation-ready task file (handoff artifact), written 2026-08-12 against live
source at `c210104`, then revised after a `plan-reviewer` pass that raised **16 items — 11 flags
plus 2 coverage gaps, all verified against source and all fixed** (see **§13, worth reading
first**: three were specification errors that would have shipped wrong sort behaviour, and two were
claims the draft made that were not true). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md). **Read §4a first** — the two
standing product directives reshaped this slice, and they override the design's emphasis where
they conflict. Then §2 (data contract), §2.4 (the `PROVISIONAL` convention), §3.0/§3.1 (reuse), §6.

**Predecessors:** Slice i (`e39ad20`) shipped the IA, tokens and the `/market` placeholder.
Slice ii (`21cb6bb`) shipped the detail pop-up, which **this slice gives its first entry point**.

**This slice:** replace the `/market` placeholder with a real table over `playerRowsWithProj` —
one table, a segmented **Value / Outlook / Production** column-set switch, position pills, sort,
pagination, and **row click → the Slice ii pop-up**. This is the first slice that produces
something the user can actually look at.

**Explicitly NOT this slice:**
- **Filter bar, filter panel, saved presets → deferred** (master-plan §6, per §4a.2). Position
  pills are the only filter in v1. `FilterSidebar`'s slider/preset reuse note still applies
  whenever they land.
- **Retiring `/players` → NOT this slice.** See §1 — the most important scoping decision here, and
  the branch master-plan §6 explicitly pre-authorised. §1.1 records what that costs in practice.
- **Portfolio → Slice iv.** Untouched, still a placeholder.
- **Pop-up tab strip / compare matrix → Slice v.** `comparisonList`, `addToComparison`,
  `removeFromComparison`, `clearComparison` and `ComparisonTray` stay untouched.
- **Chrome recolor → unscheduled.** `TopBar`/`NavRail`/`BottomTabBar` untouched.
- **Surfacing `teamContext` / `nflGameLogs`** (the two families with zero UI) → its own later
  slice, per master-plan §4a.1. Do not widen the Production column set to reach them here.

---

## 0. Confirmed against live source

- `src/components/market/Market.jsx` — the Slice i placeholder: no props, no state, wrapped in
  `bg-dp-canvas`. This slice replaces its body.
- `src/App.jsx:1011-1030` — the `/players` `PlayersSurface` call site, showing the full prop set
  Market's column sets will need. Note the range **includes** `fantasyTeamNames` (`:1025`) and the
  four comparison props (`:1026-1029`) that §8 step 5 says to subtract. `myTeamName` is already a
  shared memo (`:603`, Slice ii). `openPlayerDetail` exists at `:158-159` **with a bare
  `// eslint-disable-next-line no-unused-vars` above it** — see §5.
- `src/hooks/usePlayersTable.js` (68 lines) — pure view state, **zero styling**:
  `posFilter`, `sortState` (localStorage-persisted under a caller-supplied `storageKey`), `page`,
  `expanded`, `selectedPlayerId`, `sortProps`, and handlers.
  **Two constraints that shape §3.4, both load-bearing:**
  - **It exports no sort setter.** The return (`:64-67`) is `handleSort`/`handlePosFilter`/
    `toggleExpanded`/`setPage`/`setSelectedPlayerId`; `setSortState` is module-internal (`:24-30`).
    `handleSort(col)` is not a substitute — when `prev.column === col` it *toggles direction*
    (`:38-39`), so re-asserting a set's own default flips it to ascending.
  - **`handlePosFilter` resets sort to the single `defaultSort` the hook was constructed with**
    (`:47-51`), and `defaultSort` is a `useCallback` dependency (`:51`), so passing the *active*
    set's default makes the reset follow the active set.
- `src/components/players/PlayersDataTable.jsx` (87 lines) — the shared shell. `PAGE_SIZE = 50` at
  `:4`; the page-clamp arithmetic is `:11-16`. **Styled with the OLD token family throughout**
  (`bg-[var(--color-accent)]` pills `:26`, `bg-[var(--color-surface-2)]` header `:41`,
  `--color-surface-3/4`), and it mounts the old `PlayerProfile` + backdrop (`:70-84`). Shared with
  `OutlookTab`/`NflStatsTab`, so **recoloring it would recolor `/players`**. See §2.
- `SortTh` — exported from `src/components/PlayersTab.jsx`, old tokens. Same problem.
- **`ValueChip`/`DeltaPill` also use the old families** — `text-market-up`, `bg-market-up-bg`,
  `text-market-neutral`, `text-text-faint` (`src/components/ui/ValueChip.jsx:64`, `:77`, `:89`,
  `:119-120`), **not** `--color-dp-*`, and the component is rendered by `PlayersTab`. So it cannot
  be reused as-is and must not be recolored. See §2.
- **All `--color-dp-*` names this plan uses exist** in `src/index.css`'s `@theme` (verified
  2026-08-12: `dp-canvas`, `dp-card`, `dp-chip`, `dp-row-head`, `dp-row-self`, `dp-border`,
  `dp-border-row`, `dp-text`, `dp-text-4`, `dp-muted`, `dp-up-text`). A dp utility whose token does
  not exist fails silently as an unstyled element, so treat any *new* name as needing the same check.
- **The three column sets, as they exist today:**
  - *Value* — `PlayersTab.jsx:2025-2047`: Recent · Consist · Player · PPG · Proj · **Career** ·
    Ceiling · Floor · Dynasty · KTC · Owner. **Career is a plain non-sortable `<th>`**
    (`:2034-2038`, rendering `CareerSparkline` at `:2160`) — the only non-sortable column in the
    set. Do not infer it is sortable.
  - **`dynastyScore` does NOT sort by score in the Explorer.** `row.dynastyScore` is an *object*
    (`{score, label, components, signals}`, `dynastyScore.js:691-696`); the Explorer's comparator
    sorts it by **label ordinal** against `OUTLOOK_ORDER` (`PlayersTab.jsx:1936-1939`, order map at
    `:1524-1527`) where **lower = better** — which is why the Explorer lists `dynastyScore` in its
    `ascByDefault` set (`:1839`). See §3.1: Market's `DYNASTY SCORE ↓` wants a different field.
  - *Outlook* — `OutlookTab.jsx:420-443`: Player · Proj · Δ vs now · Proj G · Signals · PPG ± SD,
    then position-conditional columns from `POSITION_STAT_COLUMNS` (`:152-172`), which read
    `outlookPositionStats.POSITION_STAT_METRICS` (`:9-14`). `ALL` keeps Snap trend / Opp trend /
    Role (`:434-438`).
  - *Production* — `NflStatsTab.jsx:310-314`: Player · G, then per-position descriptors from its
    own `COLUMNS` map (`:11-46`), selected by `posFilter` (`:284`).
- **Production is season-scoped; Value and Outlook are not.** `NflStatsTab` owns a `tableSeason`
  with its own `nflstats-season` localStorage key (`:207-218`), derived from `careerStats` keys.
  The design does not address this — see §3.3.
- `src/components/players/PlayersSurface.jsx` (86 lines) — the two-level tab shell this screen
  conceptually replaces. **Not deleted this slice** (§1). Its localStorage keys are
  `players-view` / `players-dynasty-tab`.
- **Design source:** `docs/design_handoff_dynasty_portfolio/README.md` → *Screen: Market*, and
  `Sleeper Dashboard.dc.html` (`1b` section, lines 679–1826). The design specifies **only the
  Value column set's** columns (PLAYER · DYNASTY SCORE ↓ · VS MARKET · CAREER PPG · NOW · NEXT ·
  RISK · OWNER); Outlook and Production are named but never drawn. See §3.

---

## 1. Scoping decision: `/players` stays, and the convergence debts do not settle here

Market v1 does **not** absorb `/players`, because v1 ships without the filter panel, saved presets,
and the comparison tray that the Explorer has today. Deleting it now would destroy working code to
no benefit.

**This is not a departure from the governing plan** — master-plan §6 pre-authorised exactly this
branch: *"Settle whichever this slice's absorption actually reaches — Market v1 may not retire
`/players` outright, so carry forward anything it doesn't"* (`dynasty-portfolio-1b.md:489-491`). An
earlier draft of this section framed it as overriding the plan; it is the plan's own conditional
resolving to its second case.

**So:**
- `/players` stays routed, unlinked from the nav (exactly as Slice i left it).
- `PlayersSurface`, `PlayersTab`, `OutlookTab`, `NflStatsTab`, `PlayersDataTable`, `SortTh` and
  `ValueChip` keep their **rendering and styling untouched**. Market gets its own dp-styled table
  (§2). Two narrow, non-behavioural exceptions, both required by §2's import decision:
  - add `export` to `COLUMNS` in `NflStatsTab.jsx:11`
  - add `export` to `POSITION_STAT_COLUMNS` in `OutlookTab.jsx:152`

  Adding `export` to a module-level const changes no behaviour and no pixels. `usePlayersTable`
  also gains one additive returned property (§3.4) — likewise non-breaking for its two existing
  consumers.
- **The three Slice ii convergence debts do NOT settle here.** They carry forward to whichever
  slice actually retires `/players`. Restate them in the hand-back so they are not lost:
  1. `PlayersTab.jsx:369-373`'s hard-coded weight strings → `components[*].weight`.
  2. `PlayersTab.jsx:864-881`'s inline signal-badge block → `src/utils/dynastySignalBadges.js`.
  3. The two `/players` `ProfileDataContext` providers → the App-level one.

  **Do fix the stale numeral** in the source comment at `PlayersTab.jsx:368-370` — it says
  "scheduled for Slice iv, when this table is absorbed into Market". The *substance* is still
  right; reword it to name the absorbing slice rather than a numeral, since the numbering swapped.

### 1.1 Be honest about what "keeping `/players`" buys, given §6

§6 flips `DEFAULT_ROUTE` to `/market`. Combined with `/players` having no nav entry
(`navItems.js`), that means **the Explorer's filters/presets/comparison become reachable only by
typing the URL**. So "keeping `/players`" preserves the *code*, not the user's practical access to
those features — and the two sections must not pretend otherwise.

**Decision, recorded rather than left implicit:** accept it. The Explorer is parked, not deleted;
nothing is destroyed, and Market reaching filter parity is the gate for actually removing it. If
you want those features reachable in the interim, the escape hatch is one line — a temporary
`{ key: 'players', label: 'Explorer', path: '/players' }` entry in `PRIMARY_NAV` — but that adds
nav clutter the design does not have, so **do not add it unless the user asks**.

**Accept the transition state:** for now two surfaces render similar tables — `/market` (new, dp,
no filters) and `/players` (old, filters, URL-only). That is temporary and intended. Say so in a
comment at the top of `Market.jsx`, including the parity gate, so a future reader neither "fixes"
the duplication prematurely nor deletes the Explorer before Market can replace it.

---

## 2. What to reuse, what to build fresh

| Piece | Decision |
|---|---|
| `usePlayersTable` | **Reuse**, with one additive change (§3.4): export `setSortState` from its return. Call it with `storageKey: 'market-sort'` and — critically — the **active** column set's default sort, not a fixed one (§3.4). |
| `PlayersDataTable` | **Do not reuse.** Old tokens throughout, and it is shared with `/players` — recoloring it recolors that surface. Build `src/components/dp/MarketTable.jsx`, a dp-styled presentational shell in the same render-prop shape (`header` / `renderRow` / pagination), so the two can converge later when `/players` retires. |
| `SortTh` | **Do not reuse** (old tokens). Add a dp-styled `SortTh` inside `MarketTable.jsx`, same props (`label`, `col`, `sortKey`, `sortAsc`, `onSort`, `tooltip`). The design specifies the sorted header is `text-dp-text` with a `↓`, resting headers `text-dp-muted`. |
| Column *derivations* | **Harvest, don't re-derive.** Every cell's value logic already exists — `outlookPositionStats`, `nflStats.computeSeasonAverages`, `outlookConsistency`, `outlookUsage`, `seasonRanks`, `ktcHistory`. Import and reuse; only the presentation is new. **This rule is load-bearing beyond tidiness** — see §11. |
| Descriptor maps (`COLUMNS`, `POSITION_STAT_COLUMNS`) | **Import them; do not copy.** An earlier draft said to copy them into the Market module "so `/players` stays untouched" — that reasoning does not hold: adding `export` to a module-level const is non-behavioural and restyles nothing, and the repo already does exactly this (`SortTh`/`PlayerProfile` are imported out of `PlayersTab` by `NflStatsTab.jsx:2`). These maps carry **logic**, not just labels — `levelFmt`, `deltaFmt`, `deltaEps`, `valence`, tooltips — and both have silent failure modes when they drift: `COLUMNS` keys are `computeSeasonAverages` field names and `fmtCell` renders `—` for null (`NflStatsTab.jsx:48-52`), so a stale key yields a blank column with no error; `POSITION_STAT_COLUMNS` ids must track `POSITION_STAT_METRICS` (`outlookPositionStats.js:9-14`). Copying would also create a *fourth* convergence debt in the slice already carrying three (§1), and `dynastySignalBadges.js:1-6` exists precisely to stop a second drifting copy. |
| `ValueChip` / `DeltaPill` | **Do not reuse — mirror the logic.** Verified: it uses the old `market-*`/`text-*` token families (`ValueChip.jsx:64`, `:77`, `:89`, `:119-120`), and it is rendered by `PlayersTab`, so recoloring it would recolor `/players`. Reimplement the signal→glyph→colour mapping in dp tokens inside the Market module. Keep the *semantics* identical (master-plan §3.1) — see §3.1 for the four states, including the one `ValueChip` handles that the design's three-state list omits. |
| Pop-up | **Reuse Slice ii's** — row click calls `openPlayerDetail` (§5). Do **not** mount `PlayerProfile`. |

`Market.jsx` owns the column-set state; `MarketTable.jsx` is presentational and state-free.

---

## 3. The three column sets

### 3.1 Value (default)

The one set the design actually specifies. Columns, left to right:

`PLAYER` · `DYNASTY SCORE ↓` (mono number + 6px meter + `dynastyScore.label`) · `VS MARKET`
(see below) · `CAREER PPG` (`row.careerSparkline`, already 5-wide and 0-padded — **non-sortable**,
matching the Explorer's plain `<th>` at `PlayersTab.jsx:2034-2038`) · `NOW` (`currentSeasonPPG`) ·
`NEXT` (`seasonProjections[id].projectedPPG` + delta beneath) · `±SD` (see below) ·
`OWNER` (`ownerTeamName`, `text-dp-up-text` when it equals `myTeamName`).

**Default sort: `dynastyScore.score` descending — NOT the Explorer's `dynastyScore` key.** This is
a real trap (§0). `row.dynastyScore` is an object, and the Explorer's `dynastyScore` sort key means
"label ordinal, ascending, lower-is-better" (`PlayersTab.jsx:1936-1939`, `:1839`). Harvesting that
key would make the design's `DYNASTY SCORE ↓` surface the *worst* outlooks first, and a naive
`compareNullsLast(a.dynastyScore, b.dynastyScore, dir)` would compare objects. **Use a distinct
sort key** — e.g. `dynastyScoreValue` — whose accessor is `row.dynastyScore?.score ?? null`, sorted
descending, through `compareNullsLast` so missing scores sink regardless of direction.

**`VS MARKET` has four states, not three.** `divergenceSignal`/`divergencePct` are only populated
where a KTC rank exists (`dynastyScore.js:435-441`), and the Explorer renders a distinct fallback
for the null case (`PlayersTab.jsx:979`). Render:
`▲ under` / `≈ aligned` / `▼ over` / **`—` when there is no KTC value** — never "aligned" for a
player the market has not priced.

**Copy correction:** `divergencePct` is `(rankGap / positionDepth) * 100` (`dynastyScore.js:435`)
— a **rank-depth percentage, not a price delta**. The mock's "▲ +12% under" reads as a discount to
market value, which this number is not. Word it as rank distance (e.g. `▲ 12% under by rank`) or
show the glyph and word without the percentage. Do not ship copy implying a valuation gap.

**The `RISK` column ships as `±SD`, not Low/Med/High.** The design shows three pips plus a word,
but the Low/Med/High thresholds are still undefined (§5.4) and §4a.2 makes "omit the label" the
default answer — which is exactly what Slice ii already did for the pop-up's Floor-risk tile.
Show the real `computeConsistency(careerStats, playerId).sd` number, `—` when null **or when `sd`
is null on a non-null object** (`outlookConsistency.js:83` — the same trap Slice ii hit). No pips,
no word. Header `±SD`.

**Omit the KTC Δ cell** the Explorer carries. It is the 30-day KTC delta, whose series is the
redesign's one real upstream data gap (master-plan §2.2). Per §4a.2 it is left out of v1 rather
than shipped empty — so, unlike Slice ii's tile, there is no `PROVISIONAL` site here (§7).

### 3.2 Outlook

Harvest from `OutlookTab.jsx:420-443`, restyled: `PLAYER` · `PROJ` · `Δ VS NOW` · `PROJ G` ·
`SIGNALS` · `PPG ± SD`, then the position-conditional group — `ALL` keeps Snap trend / Opp trend /
Role; a specific position swaps in that position's `POSITION_STAT_COLUMNS` entry.

For `SIGNALS`, use **`src/utils/dynastySignalBadges.js`** (Slice ii) — this is the helper's second
consumer and the reason it was extracted with a semantic `tone` instead of Tailwind classes. Map
`tone` → dp tokens locally.

**This is deliberately NOT a like-for-like copy of `OutlookTab`'s signals cell, and the difference
is user-visible.** `OutlookTab.jsx:110-121` gates the age-curve glyph at `>= 1.05` / `<= 0.95` and
emits no injury signal; the helper (`dynastySignalBadges.js:57-73`) emits an age-curve chip whenever
`ageCurveFactor != null` and adds `⚠ Injury risk`. So Market shows a verbose chip
("Age curve ×1.12") on nearly every row where Outlook shows a single ↑/↓ or nothing.

**Resolution: take the helper's behaviour, and apply its own threshold gate.** Reuse the helper but
**skip the age-curve badge when `ageCurveFactor` is within `0.95–1.05`**, matching `OutlookTab`'s
gate — an "Age curve ×1.00" chip on every row is noise, not information. Do this by filtering the
helper's output in Market, **not** by editing the helper (Slice ii's pop-up depends on its current
behaviour, and §1 keeps shared modules behaviourally frozen). Keep `⚠ Injury risk`: it is real
information the Outlook cell simply lacks, and §4a.1 favours showing it.

**The sort key must count what Market actually renders.** `OutlookTab`'s `_signalCountSort`
(`:353-354`) counts a different subset; do not harvest it. Derive Market's signals sort from the
length of the (filtered) helper output for that row.

### 3.3 Production — and its season selector

Harvest from `NflStatsTab.jsx:310-314` + its `COLUMNS` map: `PLAYER` · `G` · per-position stat
columns.

**This set is season-scoped and the other two are not** (§0). The design's segmented control has no
season affordance, because the mock never drew this set. **Resolution:** when Production is the
active set, render a season `<select>` beside the segmented control, sourced from `careerStats`
keys (descending), persisted under `market-production-season`. Hide it for Value and Outlook.
Follow `NflStatsTab.jsx:207-218`'s pattern — including resetting `page` to 1 on change and
validating the stored value against the available seasons.

**Do not** include the per-game game-log expander. That is `NflStatsTab`'s row-expand
(schedule-joined, lazy-loading `loadNflSchedule`), and row click in Market opens the pop-up
instead. Row expansion is not part of Market v1; `/players` keeps it.

### 3.4 Column-set switching

Segmented control per the design: shell `bg-dp-card`, `1px border-dp-border`, `rounded-lg`,
`p-[3px]`; items `px-3 py-[5px] rounded-md`; active `bg-dp-chip text-dp-text font-semibold`,
inactive `text-dp-text-4`.

Persist the active set under `market-column-set` (`'value' | 'outlook' | 'production'`), validated
on read, defaulting to `'value'`.

**Per-set default sorts** — every key below is a real sortable column in its set:

| Set | Default sort key | Accessor |
|---|---|---|
| Value | `dynastyScoreValue` desc | `row.dynastyScore?.score ?? null` (§3.1 — **not** the Explorer's `dynastyScore` key) |
| Outlook | `projectedPPG` desc | as `OutlookTab.jsx:422` |
| Production | `games` desc | as `NflStatsTab.jsx:312` |

### 3.4a Making the sort reset actually work

Each set's sortable columns differ, so a sort key carried across a switch silently sorts by a
column that no longer exists. Two mechanisms are needed, and **the hook as it stands supports
neither** (§0) — an earlier draft of this section specified the behaviour without checking that:

1. **Switching sets must re-assert the new set's default sort.** `usePlayersTable` exports no sort
   setter, and `handleSort(col)` toggles direction when the column is unchanged (`:38-39`), so it
   cannot re-assert a default. **Add `setSortState` to the hook's return** (`:64-67`). This is
   purely additive — the value already exists as a module-internal `useCallback` (`:24-30`), and
   neither existing consumer destructures it, so nothing else changes. On switch, call
   `setSortState(DEFAULT_SORT[nextSet])` and `setPage(1)`.
2. **Position pills must reset to the *active* set's default, not a fixed one.**
   `handlePosFilter` resets sort to whatever `defaultSort` the hook was constructed with
   (`:47-51`). Constructing it once with the Value default means that, with Production active,
   clicking a pill sorts by `dynastyScoreValue` — a key Production has no column for, whose
   comparator reads `a._avg[key]` (`NflStatsTab.jsx:256`) and yields null for every row: arbitrary
   order, no sorted-header indicator, no error. **Pass `DEFAULT_SORT[activeSet]` as `defaultSort`**;
   it is a `useCallback` dependency (`:51`), so the reset follows the active set automatically.
3. **Validate the restored sort on mount.** `market-sort` persists one key across all three sets,
   so a reload can restore a key the active set has no column for. On mount, check the restored
   `sortState.column` against the active set's sortable-key set and fall back to that set's default
   if absent. Keep a `SORTABLE_KEYS` set per column set for this — it is also what §9's test
   asserts against.

---

## 4. Layout

Per `README.md` → *Screen: Market*. `gap: 16px`, column flow:

1. **Header row** — "Market" 22/700 + subline `` `${totalCount} players · every asset in the
   league, owned or not` `` in `text-dp-muted`. Right: the segmented control (§3.4), plus the
   Production season selector when applicable (§3.3).
2. **Position pills** — All / QB / RB / WR / TE. dp restyle of the existing pill row; active
   `bg-dp-chip text-dp-text`, inactive `text-dp-text-4 border border-dp-border`.
3. **Table** — header row `bg-dp-row-head`, header cells mono 10px `text-dp-muted` weight 500,
   `tracking-[0.08em]`, `px-3 py-[9px]` (edges `px-[18px]`). Body rows `border-t
   border-dp-border-row`, `cursor-pointer`, hover lift to `bg-dp-row-self`. Wrap in
   `overflow-x-auto` — the Production set is wide.
4. **Footer** — `` `${start}–${end} of ${total} · sorted by ${activeColumnLabel}` `` plus
   prev/next pager. Reuse `PlayersDataTable`'s `PAGE_SIZE = 50` and its page-clamping arithmetic
   (`:11-16`) — copy the logic, not the markup.

**Slice i §1.1 applies:** `Market.jsx`'s outermost element paints `bg-dp-canvas` before any
`text-dp-*` class. The placeholder already does this; keep it.

**Empty states:** `loaded === false` → the existing "Player data loading in background…" notice
(dp-styled); zero rows after filtering → "No players match your filters." in `text-dp-muted`.

---

## 5. Row click → the pop-up, and the lint debt

`Market.jsx` takes `onOpenPlayerDetail` as a prop; `App.jsx` passes `openPlayerDetail`. Row
`onClick` calls it with the row's `player_id`. That is the whole wiring — Slice ii already built
the modal, its state, and the provider.

**Delete the `// eslint-disable-next-line no-unused-vars` at `App.jsx:158`** in the same change.
It exists only because Slice ii defined `openPlayerDetail` with no caller (Slice ii §11.1). Once
Market calls it the suppression is not merely unnecessary but harmful — it would silently hide any
future unused variable declared on that line. **Verify by running `npm run lint` with the disable
removed**; if it passes, the debt is closed. Do this early, not as end-of-slice cleanup.

Rows must be keyboard-reachable: give each row `role="button"`, `tabIndex={0}` and an Enter/Space
handler, or make the player-name cell a real `<button>`. The design is mouse-only; do not ship a
table whose only interaction is a click handler on a `<tr>`.

**Do not** use `usePlayersTable`'s `selectedPlayerId`/`setSelectedPlayerId` — that is the old
in-table profile mechanism. Market's detail state lives in `App.jsx`. Leaving the hook's field
unused is fine (it is a returned property, not a declared variable, so it does not trip lint).

---

## 6. `DEFAULT_ROUTE`

`DEFAULT_ROUTE` is `/portfolio`, which is still a placeholder — so on this slice the app would
boot to "Content lands in the next slice" while a real surface sits one nav item away.

**Change `DEFAULT_ROUTE` to `/market` in this slice**, and note in `navItems.js` that it is
temporary pending the Portfolio slice, which re-evaluates. See **§1.1** for the consequence this
has for `/players`' discoverability — the two sections must be read together.

**This flip creates a prop contract that must be handled, not just a test edit.**
`navRouting.test.jsx:25` mounts the **real** `<Market />` with **no props**, and `:49-53` asserts
the placeholder heading and `/lands in the next slice/`. After the flip, `/` (`:77-81`) and
`/bogus` (`:83-86`) render that same prop-less `Market` too. So:

- **Swap in a `MarketStub`** in `navRouting.test.jsx`, matching how `PlayersStub` is already used
  for the heavy surface (`:14`). Routing tests should assert routing, not render a data-dependent
  table.
- **AND make `Market.jsx` survive prop-less mounting** — default `playerRows = []` and
  `loaded = false` in the signature, and never dereference `careerStats` without a guard. §4's
  empty states cover `loaded === false` but not `undefined` inputs. This is cheap insurance: the
  component is now reachable from three routes, and a crash there takes down the default landing
  page.

---

## 7. `PROVISIONAL(...)` sites

**This slice should add none.** Both candidates are resolved by omission under §4a.2 rather than by
shipping something degraded: the KTC Δ cell is left out (§3.1) and the Low/Med/High risk word is
left out in favour of the real `±SD` number (§3.1).

`grep -rn "PROVISIONAL(" src/` must still return **exactly the three Slice ii sites**. If
implementing surfaces a fourth candidate, that is a stop-and-ask — under §4a.2 the default answer
is to cut the element, not to tag it.

---

## 8. Step sequence

1. Delete the `eslint-disable` at `App.jsx:158` and confirm `npm run lint` still passes once
   Market calls `openPlayerDetail` (do this alongside step 5; verify at the end of it).
2. Add `setSortState` to `usePlayersTable`'s return (§3.4a) — one line, additive. Run
   `OutlookTab.test.jsx` / `NflStatsTab.test.jsx` immediately to confirm nothing shifted.
3. Add `export` to `COLUMNS` (`NflStatsTab.jsx:11`) and `POSITION_STAT_COLUMNS`
   (`OutlookTab.jsx:152`) — keyword only, no other edit to either file (§1, §2).
4. Build `src/components/dp/MarketTable.jsx` — presentational shell + dp `SortTh`, render-prop
   shape mirroring `PlayersDataTable`, `PAGE_SIZE = 50` (its value is at `PlayersDataTable.jsx:4`,
   the clamp arithmetic at `:11-16`).
5. Build `src/components/market/Market.jsx` — `usePlayersTable({ storageKey: 'market-sort',
   defaultSort: DEFAULT_SORT[activeSet] })`, column-set state, the three column-set definitions
   (§3), the Production season selector, mount-time sort validation (§3.4a.3), filter/sort/
   paginate, row click. Props default to `playerRows = []`, `loaded = false` (§6).
6. Restyle nothing under `/players`. Outside `dp/`, `market/` and `App.jsx`, the only edits are:
   the two `export` keywords (step 3), `usePlayersTable`'s added return property (step 2), and the
   stale-numeral comment fix at `PlayersTab.jsx:368-370` (§1).
5. `App.jsx` — pass the props Market needs plus `onOpenPlayerDetail={openPlayerDetail}`, mirroring
   the `PlayersSurface` prop list (`:1012-1024`) minus the comparison props.
6. `navItems.js` — `DEFAULT_ROUTE = '/market'` (§6).
7. Tests (§9).
8. Docs (§10).
9. `npm test` green · `npm run lint` 0 problems · `npm run build` clean ·
   `grep -rn "PROVISIONAL(" src/` returns exactly the three Slice ii sites.
10. **Hand back for the user's visual smoke — and this time it is real.** `/market` in dark
    (Portfolio/Market content is dark-only by design), plus the chrome and `League`/`Board`/`Trade`
    in **both** themes, since none of those changed palette. This is the first slice of the
    program with something to look at.

## 9. Tests to add / update

- **New `src/components/market/Market.test.jsx`** — render with fixture rows inside a
  `ProfileDataContext.Provider`. Cover: the three column sets render their own headers; position
  pills filter; sort toggles and persists to `market-sort`; pagination arithmetic at a boundary;
  **row click calls `onOpenPlayerDetail` with the right `player_id`**; keyboard activation does the
  same; the `loaded === false` and zero-row states; `±SD` renders `—` for both null-object and
  null-`sd` cases; **mounting with no props at all does not crash** (§6).
  **The three sort behaviours from §3.4a each need their own assertion** — they are the ones a
  reader would assume work and that silently degrade if they don't:
  1. switching sets re-asserts the new set's default sort (and resets page);
  2. clicking a position pill while **Production** is active resets sort to `games`, not to the
     Value set's default;
  3. a `market-sort` value restored from localStorage naming a column the active set lacks falls
     back to that set's default rather than sorting by nothing.
  Also assert Value's default sort is by `dynastyScore.score` **descending** — best scores first —
  since harvesting the Explorer's same-named key would invert it (§3.1).
- **New `MarketTable.test.jsx`** only if the shell ends up with logic worth isolating; if it stays
  purely presentational, cover it through `Market.test.jsx` rather than duplicating.
- **Update `src/components/shell/navRouting.test.jsx`** (§6) — three separate edits, not one:
  1. `DEFAULT_ROUTE` assertion becomes `/market`.
  2. `/` (`:77-81`) and `/bogus` (`:83-86`) now resolve to Market, not Portfolio's placeholder.
  3. **The `/market` case at `:48-53` currently asserts the placeholder text** and mounts the real
     `<Market />` prop-less (`:25`) — replace with a `MarketStub`, mirroring `PlayersStub` (`:14`).
  Also add one assertion that `Market` renders without crashing when mounted with **no props**
  (§6's prop contract) — put that one in `Market.test.jsx`, not here.
- **`usePlayersTable`** — its existing consumers must stay green after `setSortState` is added to
  the return (§3.4a). Purely additive, but run `OutlookTab.test.jsx` / `NflStatsTab.test.jsx` to
  confirm. No new test needed for the added property itself beyond Market's set-switch coverage.
- **Reuse, don't duplicate:** `OutlookTab.test.jsx` and `NflStatsTab.test.jsx` already cover the
  column *derivations* Market harvests. Test Market's own composition — set switching, filtering,
  sorting, row click — not the arithmetic those suites already pin.

## 10. Docs updates

- **`CLAUDE.md`** — routing table (`/market` now a real surface, `DEFAULT_ROUTE` temporarily
  `/market`); `src/components/` table (add `market/Market.jsx`, `dp/MarketTable.jsx`); a note that
  `/players` remains routed-but-unlinked and why (§1), so the duplication reads as intentional.
- **`docs/architecture.md`** — if it documents the route table or the Players tab shell, mirror
  the same points.
- **`docs/ui.md`** — this is where Slice i/ii recorded their surface notes; add Market.
- **Master plan §6** — record that the three convergence debts did *not* settle here and now
  belong to whichever slice retires `/players` (§1).

## 11. Cross-repo impact

**None.** No `CR-NN` entry's served contract is touched — this slice adds a presentation layer over
`playerRowsWithProj` and reads only families already loaded and already listed. No `Mirror` text to
emit. (`docs/cross-repo-registry.md` needs no edit this slice; Slice ii already corrected CR-07's
trigger list.) `PlayersTab.jsx` appears in CR-05's triggers, but only for its
`PCT`/`COMPLETIONS`/`CAR`/`REC` reads (`:678-697`), which this slice does not touch.

**This "none" is conditional on §2's harvest rule, so treat that rule as a contract, not a
preference.** The stat keys behind the Production and Outlook column sets are covered by CR-12
(`pass_cmp`) and CR-13 (`rec_air_yd`) **because their only app-side readers are the modules those
entries list** — `nflStats.js`, `efficiencyMetrics.js`, `seasonProjection.js`,
`outlookPositionStats.js` (re-verified by review, 2026-08-12). **If the implementer inlines any
rate recomputation into the Market module instead of calling `computeSeasonAverages` /
`outlookPositionStats`, it creates a new app-side reader those entries do not list — and this
section becomes wrong.** Recompute nothing; call the helpers.

## 12. Done-definition checklist (this slice)

- [ ] `/market` renders a real table; the Slice i placeholder body is gone
- [ ] Three column sets, switchable, persisted under `market-column-set`
- [ ] **All three sort behaviours from §3.4a work and are asserted:** set switch re-asserts the new
      set's default (via the added `setSortState`); position pills reset to the **active** set's
      default; a stale restored `market-sort` key falls back instead of sorting by nothing
- [ ] Value's default sort is `dynastyScore?.score` **descending** — not the Explorer's
      same-named label-ordinal key (§3.1)
- [ ] `CAREER PPG` is non-sortable, matching the Explorer
- [ ] `VS MARKET` renders **four** states — the `—` no-KTC case included — and its copy does not
      describe `divergencePct` as a price delta
- [ ] Production's season selector present for that set only, persisted, page-resetting
- [ ] Position pills, sort (persisted under `market-sort`), pagination at `PAGE_SIZE = 50`
- [ ] Row click **and** keyboard activation open the Slice ii pop-up via `onOpenPlayerDetail`
- [ ] `App.jsx:158`'s `eslint-disable` **deleted**, with `npm run lint` clean without it
- [ ] `Market` mounts without crashing with **no props** (`playerRows = []`, `loaded = false`
      defaults); `navRouting.test.jsx` uses a `MarketStub`, not the real component
- [ ] `±SD` column shows the real number, `—` for null-object *and* null-`sd`; no Low/Med/High word
- [ ] No KTC Δ cell; **no new `PROVISIONAL` sites** — grep returns exactly Slice ii's three
- [ ] `/players` **behaviourally unmodified**; the only edits there are two `export` keywords
      (`NflStatsTab.jsx:11`, `OutlookTab.jsx:152`) and the stale-numeral comment at
      `PlayersTab.jsx:368-370`
- [ ] Descriptor maps **imported, not copied**; no rate recomputation inlined into Market (§11)
- [ ] `dynastySignalBadges.js` reused for the SIGNALS column, with the age-curve badge filtered to
      `OutlookTab`'s `0.95–1.05` gate **in Market**, not by editing the shared helper
- [ ] `usePlayersTable` gains only the additive `setSortState` return; `OutlookTab.test.jsx` /
      `NflStatsTab.test.jsx` still green
- [ ] `DEFAULT_ROUTE = '/market'`; `navRouting.test.jsx` updated to assert it
- [ ] `Market.jsx` paints `bg-dp-canvas`; table uses dp tokens throughout
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] CLAUDE.md + `docs/ui.md` updated in the same change; master-plan §6 notes the carried-forward
      convergence debts
- [ ] Handed back for the user's visual smoke — `/market` in dark; chrome + League/Board/Trade in
      both themes

---

## 13. Revision note (post plan-review, 2026-08-12)

Reviewed by the `plan-reviewer` subagent against live source at `c210104`; **11 flags, all
verified accurate and all fixed above**, plus the two coverage gaps it flagged as unreached, now
closed. Grouped by what they changed:

**Three specification errors that would have shipped wrong behaviour.**
1. **§3.4's sort reset was not implementable.** `usePlayersTable` exports no sort setter
   (`:64-67`), and `handleSort` *toggles* direction when the column is unchanged (`:38-39`), so it
   cannot re-assert a default. Fixed in §3.4a by adding `setSortState` to the hook's return —
   additive, no existing consumer destructures it.
2. **A single `defaultSort` breaks pill filtering in two of three sets.** `handlePosFilter` resets
   to whatever the hook was constructed with (`:47-51`); with Production active that meant sorting
   by a key it has no column for, whose comparator yields null for every row — arbitrary order, no
   error. Fixed by passing `DEFAULT_SORT[activeSet]`.
3. **`dynastyScore` descending was wrong on both harvest paths.** `row.dynastyScore` is an object,
   and the Explorer's same-named sort key means *label ordinal, ascending, lower-is-better*
   (`PlayersTab.jsx:1936-1939`, `:1839`). Shipping "descending" would have surfaced the worst
   outlooks first. Fixed in §3.1: a distinct `dynastyScoreValue` key over `dynastyScore?.score`.

**Two things the plan asserted that were not true.**
4. **§1 misstated the governing plan.** Master-plan §6 (`:489-491`) already pre-authorised the
   carry-forward — "Market v1 may not retire `/players` outright". The draft framed a
   pre-authorised branch as a departure.
5. **Copying the descriptor maps was the wrong call**, and its stated reason did not hold: adding
   `export` to a const is non-behavioural, so "`/players` stays untouched" survives importing. The
   maps carry logic (`levelFmt`/`deltaFmt`/`deltaEps`/`valence`), both drift silently (a stale
   `COLUMNS` key renders `—`, not an error), and copying would have created a *fourth* convergence
   debt in the slice already carrying three. §2 now imports.

**One contradiction between sections.** §1 justified keeping `/players` to preserve the filter
panel, presets and comparison tray, while §6 made the featureless surface the default landing route
and left the full-featured one nav-less — so the preserved features became URL-only. §1.1 now
states this plainly, accepts it, records Market's filter parity as the gate for actually deleting
the Explorer, and notes the one-line escape hatch without recommending it.

**Two behavioural divergences the plan glossed.**
6. `dynastySignalBadges.js` is **not** a like-for-like swap for `OutlookTab`'s signals cell — it
   emits an age-curve chip whenever `ageCurveFactor != null` where the tab gates at `0.95–1.05`,
   and adds an injury badge the tab lacks. §3.2 now takes the helper but re-applies the gate in
   Market, and derives the sort key from what Market actually renders rather than harvesting
   `_signalCountSort`.
7. **`VS MARKET` has four states, not three** — `divergenceSignal` is null where no KTC rank exists
   (`dynastyScore.js:435-441`), and "≈ aligned" for an unpriced player would be a lie. Also:
   `divergencePct` is a rank-depth percentage, not a price delta, so the mock's "▲ +12% under"
   copy needed rewording.

**One missed test contract.** `navRouting.test.jsx:25` mounts the **real** `<Market />` prop-less,
and the `DEFAULT_ROUTE` flip points `/` and `/bogus` at it too. §6/§9 now require both a
`MarketStub` in that suite *and* prop defaults on the component, since a crash there would take
down the default landing page.

**Mechanical drift:** the Value harvest omitted the non-sortable Career column
(`PlayersTab.jsx:2034-2038`); the `PlayersSurface` prop range was `:1012-1024` (actually
`:1011-1030`, excluding `fantasyTeamNames` and the comparison props §8 says to subtract);
`PlayersDataTable` is 87 lines with `PAGE_SIZE` at `:4`.

**Coverage gaps closed by direct check** (the reviewer flagged these as unreached, not as
findings): all eleven `--color-dp-*` names used in §4 exist in `src/index.css`; and `ValueChip`
uses the **old** `market-*`/`text-*` families (`:64`, `:77`, `:89`, `:119-120`) while being
rendered by `PlayersTab` — so §2's conditional "reuse if its tokens permit" is now a definitive
*do not reuse, mirror the logic*.

**Cross-repo:** no `MIRROR` block — §11's "none" holds. The reviewer added one standing caveat, now
in §11: that "none" is *conditional on the harvest rule*, because inlining rate recomputation into
Market would create app-side readers of `pass_cmp` (CR-12) and `rec_air_yd` (CR-13) that those
entries do not list.
