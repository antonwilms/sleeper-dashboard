# Players table shared scaffolding — `usePlayersTable` + `PlayersDataTable`

**Type:** Pure refactor (behaviour-preserving). De-duplicate the table scaffolding shared by
`OutlookTab` and `NflStatsTab` so the upcoming **Weekly** tab can adopt it as the third
consumer. **No new features, no column changes, no new data, no projection/scoring touch.**

**Model:** sonnet implements this file exactly. Opus planning session wrote it; no source was
edited. If anything below contradicts live source, **stop and report** — do not improvise.

This task realises the follow-up flagged in
[.claude/tasks/nfl-stats-tab.md §13](.claude/tasks/nfl-stats-tab.md) ("a shared
`usePlayersTable` hook or `PlayersDataTable` wrapper … once a third consumer lands").

---

## 0. Live-source anchors (read narrowly — do not open whole files)

| What | Where |
|---|---|
| Outlook tab (subject) | [OutlookTab.jsx](src/components/players/OutlookTab.jsx) — state/handlers `:98–141`, derivations `:143–201`, pagination+sortProps `:203–212`, JSX `:214–376` |
| NFL stats tab (subject) | [NflStatsTab.jsx](src/components/players/NflStatsTab.jsx) — state `:198–231`, NFL-only state `:233–245`, derivations `:253–280`, pagination+sortProps `:282–291`, handlers `:293–317`, schedule loader `:319–341`, JSX `:343–505` |
| Expand primitives (reuse as-is) | [ExpandableTableRow.jsx](src/components/ui/ExpandableTableRow.jsx) — `ExpandableTableRow`, `ExpandChevron` |
| `SortTh` / `PlayerProfile` / `projectionConfidenceClass` (reuse as-is) | [PlayersTab.jsx:88](src/components/PlayersTab.jsx), `:132`, `:295` |
| Profile context (reuse as-is) | [ProfileDataContext.jsx](src/context/ProfileDataContext.jsx) |
| Hook precedent (derivation-only, **0 `useState`**) | [usePlayerProfile.js](src/hooks/usePlayerProfile.js) |
| Surface that mounts the tabs (conditional `&&` → unmount/remount on tab switch) | [PlayersSurface.jsx:77–79](src/components/players/PlayersSurface.jsx) |
| View-only guard (must stay green; do **not** add new modules to PIPELINE) | [scheduleViewOnly.test.js](src/__tests__/scheduleViewOnly.test.js) |

CLAUDE.md invariants referenced (not re-listed): **App.jsx owns all state**, **React Strict
Mode double-fires** (cancelled-flag), **Advstats/schedule are display-only**. See
[CLAUDE.md](CLAUDE.md) → *Invariants*.

---

## 1. Decisions (resolved, with justification)

### 1.1 Hook **and** wrapper (not one or the other)

- **`usePlayersTable({ storageKey, defaultSort })`** — a custom hook owning the genuinely-shared
  *view-local table state*: `posFilter`, `sortState` (+ `localStorage` persistence under the
  caller's key), `page`, `expanded`, `selectedPlayerId`, and the identical handlers
  (`handlePosFilter`, `handleSort`, `toggleExpanded`) + a ready-made `sortProps`.
- **`PlayersDataTable`** — a **presentational, state-free** wrapper owning the byte-identical
  chrome: position pills (+ optional toolbar slot), the `!loaded` notice, the
  `overflow-x-auto`/table shell (parameterised `table-fixed`/`table-auto` + optional colgroup),
  the empty-state row, pagination (controls **and** the slice math), and the Profile panel +
  backdrop + `ProfileDataContext.Provider`. Columns (`header`) and body rows (`renderRow`) and
  the per-tab toolbar arrive via render-prop/slot so each tab keeps its own table shape and
  detail panel.

**Why both, and why this split.** The filter→sort pipeline (`displayRows`) genuinely diverges
between the tabs (different comparators, different null-handling — see §2 rows 25–26), so it
must stay in each tab. That forces a unidirectional flow: hook owns state → tab computes
`displayRows` from `posFilter`/`sortState` → wrapper renders chrome + paginates `displayRows`.
A wrapper-*only* design would have to own `sortState` yet hand it back up to the tab to compute
`displayRows`, then receive `displayRows` back to paginate — a circular data flow that a
render-prop can express but only awkwardly (pagination controls render *below* the table and
need the row count, so they cannot live inside the children that compute `displayRows`). The
hook removes the circularity cleanly; the wrapper stays dumb.

### 1.2 Reconciling with the **"App.jsx owns all state"** invariant

The invariant ([CLAUDE.md](CLAUDE.md) → *Invariants*): *"App.jsx owns all state. Do not move
state into child components or new hooks. Do not introduce Redux/Zustand/…"*. A state-owning
hook bumps the **literal** wording (the existing `usePlayerProfile` is derivation-only — **0
`useState`**). Resolution, with justification — the move is **compliant in intent**:

1. **No domain/pipeline state moves.** Every piece `usePlayersTable` owns
   (`posFilter`/`sortState`/`page`/`expanded`/`selectedPlayerId`) **already lives as
   component-local `useState` inside `OutlookTab`/`NflStatsTab` today** (Outlook `:98–115`, NFL
   `:198–217`). None of it is App.jsx-owned domain state, and none of the `playerRows` pipeline
   is touched. The hook **relocates already-component-local view state into a co-located
   helper the same component calls** — a code-organisation move, not an ownership move.
2. **Per-tab instance isolation is preserved.** `PlayersSurface` mounts each tab behind a `&&`
   ([:77–79](src/components/players/PlayersSurface.jsx)), so switching sub-tabs unmounts/remounts
   and resets this state today. Calling the hook *inside each tab* yields one independent state
   instance per tab → the remount-resets-state behaviour is unchanged. (Do **not** lift this
   state up into `PlayersSurface` — that would persist filter/sort across tab switches, a
   behaviour change.)
3. **No state library; idiomatic React; in-repo precedent.** The §13 flag — authored under
   these same invariants — explicitly names *"a shared `usePlayersTable` hook"* as the
   sanctioned follow-up.

**Invariant text:** do **not** edit the invariant (avoid scope creep). The new hook's intent is
captured in its CLAUDE.md `src/hooks` row ("owns **view-local** table UI state only — never
domain/pipeline state"). *Optional, implementer's discretion:* a one-line parenthetical on the
invariant ("…new hooks (view-local table UI state in `usePlayersTable` excepted)…"). Recommended
to keep the lighter touch (CLAUDE.md row only) unless the user asks.

### 1.3 File locations

- Hook: **`src/hooks/usePlayersTable.js`** (matches `src/hooks/usePlayerProfile.js`).
- Wrapper: **`src/components/players/PlayersDataTable.jsx`** (co-located with its consumers).
- `PAGE_SIZE = 50` moves to `PlayersDataTable.jsx` (the only place pagination now happens);
  delete it from both tabs.

### 1.4 View-only / decoupling

Neither new module imports `nflSchedule`/`loadNflSchedule`, advstats, or any projection/scoring
util. The lazy schedule loader **stays in `NflStatsTab`** (the StrictMode cancelled-flag effect
at NFL `:327–341` does not move). Do **not** add `usePlayersTable.js` or `PlayersDataTable.jsx`
to the `PIPELINE` list in `scheduleViewOnly.test.js`. Out of scope: the Explorer (`PlayersTab` /
Value tab) — its FilterSidebar/presets/ComparisonTray are the deferred filter-unification slice.

---

## 2. Divergence-reconciliation table (every shared-scaffolding difference → handling)

| # | Shared concern | OutlookTab | NflStatsTab | Resolution |
|---|---|---|---|---|
| 1 | sort default | `{projectedPPG, desc}` | `{fpPerG, desc}` | **Param** `defaultSort` → hook |
| 2 | sort `localStorage` key | `outlook-sort` | `nflstats-sort` | **Param** `storageKey` → hook (never collapsed to one key) |
| 3 | sort init read + validate (`column:string`, `direction∈{asc,desc}`) | identical | identical | **Unify** in hook |
| 4 | `setSortState` persist wrapper (functional-update + write) | identical | identical | **Unify** in hook |
| 5 | `handleSort` (same col → flip; else `full_name`→asc else desc; `setPage(1)`) | identical | identical | **Unify** in hook |
| 6 | `handlePosFilter` sort-reset target | `defaultSortForPosition()` → `{projectedPPG,desc}` (**ignores its `pos` arg**) | `{fpPerG,desc}` literal | **Unify**: reset to `defaultSort`. Outlook's `defaultSortForPosition` is a constant-returning function with a dead `pos` param → **dropped** (behaviour-preserving: it never read `pos`). |
| 7 | `posFilter` init `'ALL'` | same | same | **Unify** in hook |
| 8 | `page` init `1`; `expanded` init `new Set()`; `toggleExpanded` add/remove | same | same | **Unify** in hook |
| 9 | `selectedPlayerId` init `null` | same | same | **Unify** in hook |
| 10 | `sortProps = {sortKey, sortAsc, onSort}` | built **after** `handleSort` | built **before** `handleSort` (relies on hoisting) | Hook returns ready-made `sortProps`; declaration-order quirk normalised |
| 11 | pagination math (`PAGE_SIZE=50`, `totalPages`, `safePage` clamp, slice, `start`/`end`) | identical | identical | **Unify** in wrapper |
| 12 | position-pill `<button>` markup (`ALL/QB/RB/WR/TE`, active/inactive token classes) | identical | identical | **Unify** in wrapper |
| 13 | pills-row container class | `flex gap-1 mb-4` | `flex flex-wrap gap-1 mb-4 items-center` | **Param** `pillRowClassName` (tab passes its exact current string → byte-identical) |
| 14 | extra element in pills row | none | season `<select>` `<label className="ml-auto …">` | **Param** `toolbar` slot (Outlook passes `null` → no node) |
| 15 | `!loaded` notice (`<p>…Player data loading in background…</p>`) | identical | identical | **Unify** in wrapper |
| 16 | table shell | `table-fixed` + 6-col `<colgroup>` | `table-auto`, no colgroup | **Param** `tableClassName` + `colgroup` slot (NFL `null`) |
| 17 | thead `<tr className="border-b bg-[var(--color-surface-2)]">` + leading chevron `<th className="py-2 px-2"/>` | identical | identical | Wrapper owns the `<tr>` chrome; the leading `<th>` lives in the tab's `header` slot (1-line dup, **symmetric** with the body chevron `<td>` which is tab-owned). See §3.2. |
| 18 | column `<th>`s | fixed 6 (with tooltips) | `Player`,`G` + per-pill cols (no tooltips) | Tab-owned `header` slot |
| 19 | empty-state row text + colSpan | `colSpan={6}`, text `loaded ? 'No players match your filters.' : 'Loading player data…'` | `colSpan={3+cols.length}`, same text | **Param** `colSpan`; text identical → unified in wrapper |
| 20 | body row (`ExpandableTableRow` + cells + `detail`) | usage-history detail; fixed cells | game-log detail; per-pill cells | Tab-owned `renderRow(row)` render-prop |
| 21 | per-row chevron cell (`stopPropagation` cell wrapping `ExpandChevron`, reads `expanded`/`toggleExpanded`) | identical pattern | identical pattern | Inside `renderRow`; reads hook `expanded`/`toggleExpanded` (closure) |
| 22 | Profile panel + backdrop + `ProfileDataContext.Provider` value | 10-key value object | **same 10-key value object** (verified identical) | **Unify** in wrapper (`profileContextValue` + comparison props + `selectedPlayerId`/`onCloseProfile`/`onSelectPlayer`) |
| 23 | NFL-only state (`tableSeason`+`nflstats-season`, `logSeasonById`, `scheduleByYear`, `latestSeason`/`allSeasons`/`activeSeason`, `ensureSchedule`, schedule `useEffect`) | n/a | present | **Stays in NflStatsTab.** `setTableSeason` ([:227–231](src/components/players/NflStatsTab.jsx)) keeps its `setPage(1)` — now calls the hook's `setPage`. |
| 24 | Outlook-only derivations (`usageByPlayer`, `roleCohort`, `enrichedRows` with `_history`/`_snapTrend`/`_oppTrend`/`_role`) | present | n/a | **Stays in OutlookTab** |
| 25 | sort comparator + null-handling | trend (`?.delta`), `_role` (`ROLE_ORDER`), string `localeCompare`; **nulls sink by direction** (`return dir`/`-dir`) | `_avg[key]`; **nulls always sink** (`return 1`/`-1`) | **Not unified — genuinely divergent.** `displayRows` stays in each tab. |
| 26 | enriched-row shape | `_history`/`_snapTrend`/`_oppTrend`/`_role` | `_avg` | Tab-owned |

No silent behaviour changes: every unified item above is byte-identical in both tabs today
(verified against live source); every divergent item is parameterised or stays in the tab. The
only code *removed* is Outlook's dead `defaultSortForPosition` `pos` param (row 6), which the
function never read.

---

## 3. Shared-unit API (the contract sonnet implements)

### 3.1 `usePlayersTable.js`

```js
// src/hooks/usePlayersTable.js
import { useCallback, useState } from 'react'

/**
 * View-local table state shared by the Players → Dynasty table tabs (Outlook, NFL stats,
 * and the upcoming Weekly tab). Owns ONLY ephemeral view state — never App.jsx domain /
 * playerRows-pipeline state. One independent instance per consuming tab (each tab calls it),
 * which preserves the unmount-on-tab-switch reset behaviour of PlayersSurface.
 *
 * @param {object}  opts
 * @param {string}  opts.storageKey  localStorage key for sort persistence ('outlook-sort' | 'nflstats-sort')
 * @param {{column:string, direction:'asc'|'desc'}} opts.defaultSort  initial sort + the target handlePosFilter resets to
 */
export function usePlayersTable({ storageKey, defaultSort }) {
  const [posFilter, setPosFilter] = useState('ALL')

  const [sortState, setSortStateRaw] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey))
      if (v && typeof v.column === 'string' && (v.direction === 'asc' || v.direction === 'desc')) return v
    } catch { /* fall through */ }
    return defaultSort
  })
  const setSortState = useCallback(next => {
    setSortStateRaw(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      localStorage.setItem(storageKey, JSON.stringify(value))
      return value
    })
  }, [storageKey])

  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(() => new Set())
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)

  const handleSort = useCallback(col => {
    setSortState(prev => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      const ascByDefault = col === 'full_name'
      return { column: col, direction: ascByDefault ? 'asc' : 'desc' }
    })
    setPage(1)
  }, [setSortState])

  const handlePosFilter = useCallback(pos => {
    setPosFilter(pos)
    setSortState(defaultSort)
    setPage(1)
  }, [setSortState, defaultSort])

  const toggleExpanded = useCallback(id => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const sortProps = { sortKey: sortState.column, sortAsc: sortState.direction === 'asc', onSort: handleSort }

  return {
    posFilter, sortState, page, expanded, selectedPlayerId, sortProps,
    handlePosFilter, handleSort, toggleExpanded, setPage, setSelectedPlayerId,
  }
}
```

**Equivalence notes for the implementer:**
- `defaultSort` should be passed as a **stable** object (module-level constant in each tab — see
  §4.1/§4.2), so `handlePosFilter`'s `useCallback` dep is stable. (Functionally harmless if not,
  but keep it stable to avoid needless re-creation.) Using `useCallback` here is an
  implementation nicety; the originals used plain functions — behaviour is identical either way.
- The original Outlook/NFL `handleSort`/`handlePosFilter`/`toggleExpanded` were plain
  (non-memoised) functions; wrapping in `useCallback` changes nothing observable.

### 3.2 `PlayersDataTable.jsx`

State-free presentational wrapper. Owns the slice math (`PAGE_SIZE = 50`) and renders all
shared chrome. Props:

| Prop | Type | Notes |
|---|---|---|
| `posFilter` | string | active pill |
| `onPosFilter` | `(pos) => void` | = hook `handlePosFilter` |
| `pillRowClassName` | string | Outlook `'flex gap-1 mb-4'`; NFL `'flex flex-wrap gap-1 mb-4 items-center'` (row 13) |
| `toolbar` | ReactNode \| null | rendered as last child of the pills row (NFL season `<select>`; Outlook `null`) |
| `loaded` | bool | drives `!loaded` notice + empty-state text |
| `tableClassName` | string | `'table-fixed'` \| `'table-auto'` → appended to `'w-full text-sm '` |
| `colgroup` | ReactNode \| null | Outlook's 6-`<col>` group; NFL `null` |
| `header` | ReactNode | the `<th>` cells incl. the leading `<th className="py-2 px-2"/>` (rendered inside the shared `<tr className="border-b bg-[var(--color-surface-2)]">`) |
| `colSpan` | number | empty-state cell span (Outlook `6`; NFL `3 + cols.length`) |
| `displayRows` | array | full filtered+sorted rows (tab-computed) |
| `page` | number | = hook `page` (raw, unclamped) |
| `onPageChange` | `(updater\|number) => void` | = hook `setPage` |
| `renderRow` | `(row) => ReactNode` | returns an `<ExpandableTableRow>` (tab owns cells + detail; reads hook `expanded`/`toggleExpanded`/`setSelectedPlayerId`) |
| `selectedPlayerId` | string \| null | profile gate |
| `onCloseProfile` | `() => void` | = `() => setSelectedPlayerId(null)` |
| `onSelectPlayer` | `(id) => void` | = hook `setSelectedPlayerId` |
| `profileContextValue` | object | the 10-key `ProfileDataContext.Provider` value (tab assembles it; row 22) |
| `comparisonList` | array | passthrough to `PlayerProfile` |
| `addToComparison` / `removeFromComparison` | fn | passthrough to `PlayerProfile` |

**Internal structure (assembled verbatim from the two current JSX trees — must stay
byte-identical per tab):**

```jsx
const PAGE_SIZE = 50

export function PlayersDataTable({ posFilter, onPosFilter, pillRowClassName, toolbar = null,
  loaded, tableClassName, colgroup = null, header, colSpan, displayRows, page, onPageChange,
  renderRow, selectedPlayerId, onCloseProfile, onSelectPlayer, profileContextValue,
  comparisonList = [], addToComparison, removeFromComparison }) {

  const totalCount = displayRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const start = totalCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const end   = Math.min(safePage * PAGE_SIZE, totalCount)

  return (
    <div>
      {/* Pills row (+ optional toolbar) — verbatim button markup from OutlookTab :217–228 */}
      <div className={pillRowClassName}>
        {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
          <button key={pos} onClick={() => onPosFilter(pos)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              posFilter === pos
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'
            }`}>{pos}</button>
        ))}
        {toolbar}
      </div>

      {!loaded && (
        <p className="text-sm text-[var(--color-text-faint)] mb-3 italic">Player data loading in background…</p>
      )}

      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${tableClassName}`}>
          {colgroup}
          <thead>
            <tr className="border-b bg-[var(--color-surface-2)]">{header}</tr>
          </thead>
          <tbody>
            {pageRows.map(renderRow)}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-[var(--color-text-faint)]">
                  {loaded ? 'No players match your filters.' : 'Loading player data…'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalCount > 0 && (
        /* Pagination — verbatim from OutlookTab :344–355 */
        <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
          <span>Showing {start}–{end} of {totalCount} players</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onPageChange(p => p - 1)} disabled={safePage === 1}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Prev</button>
            <span className="px-2 tabular-nums">{safePage} / {totalPages}</span>
            <button onClick={() => onPageChange(p => p + 1)} disabled={safePage === totalPages}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Next</button>
          </div>
        </div>
      )}

      {selectedPlayerId && profileContextValue?.careerStats && (
        /* Profile panel + backdrop — verbatim from OutlookTab :358–375 (10-key value object) */
        <ProfileDataContext.Provider value={profileContextValue}>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={onCloseProfile} />
          <PlayerProfile
            key={selectedPlayerId}
            playerId={selectedPlayerId}
            onClose={onCloseProfile}
            onSelectPlayer={onSelectPlayer}
            comparisonList={comparisonList}
            addToComparison={addToComparison}
            removeFromComparison={removeFromComparison}
          />
        </ProfileDataContext.Provider>
      )}
    </div>
  )
}
```

`PlayersDataTable.jsx` imports: `ProfileDataContext` (from `../../context/ProfileDataContext`),
`PlayerProfile` (from `../PlayersTab`). It does **not** import `ExpandableTableRow`/`SortTh` —
those are used by the tabs inside `header`/`renderRow`, not by the wrapper.

**Contract note (row 17):** `header` and `renderRow` are *symmetric* — the tab supplies **all**
`<th>`s (including the leading empty chevron `<th>`) and **all** `<td>`s (including the
`stopPropagation` chevron `<td>`). The wrapper never reaches into individual cells. This keeps
the wrapper agnostic to whether a future consumer has a chevron column.

---

## 4. Edits, grouped by file (each cites the symbol + line anchor)

### 4.1 NEW `src/hooks/usePlayersTable.js`
Create per §3.1.

### 4.2 NEW `src/components/players/PlayersDataTable.jsx`
Create per §3.2.

### 4.3 `src/components/players/OutlookTab.jsx`

- **`:1`** imports — add `import { usePlayersTable } from '../../hooks/usePlayersTable'` and
  `import { PlayersDataTable } from './PlayersDataTable'`. Drop `useCallback`/`useState` from the
  `react` import (no longer used); **keep `useMemo`**.
- **`:8`** delete `const PAGE_SIZE = 50` (moves to wrapper).
- **`:32–34`** delete `defaultSortForPosition` (row 6). Add a module-level
  `const DEFAULT_SORT = { column: 'projectedPPG', direction: 'desc' }` (stable ref for the hook).
- **`:36–52` `TrendCell`, `:54–91` `UsageHistoryPanel`** — keep unchanged (Outlook detail/cell
  helpers).
- **`:98–141`** delete the whole state+handlers block (`posFilter`, `sortState`/`setSortState`,
  `page`, `expanded`, `selectedPlayerId`, `handleSort`, `handlePosFilter`, `toggleExpanded`).
  Replace with:
  ```js
  const { posFilter, sortState, page, expanded, selectedPlayerId, sortProps,
          handlePosFilter, toggleExpanded, setPage, setSelectedPlayerId } =
    usePlayersTable({ storageKey: 'outlook-sort', defaultSort: DEFAULT_SORT })
  ```
  (`handleSort` is consumed only through `sortProps`, so it need not be destructured.)
- **`:143–201`** keep `usageByPlayer`/`roleCohort`/`enrichedRows`/`displayRows` unchanged — they
  read `posFilter`/`sortState` from the hook (same names).
- **`:203–212`** delete the pagination math (`totalCount`…`end`) and the manual
  `sortKey`/`sortAsc`/`sortProps` (now from the hook).
- **`:214–376`** replace the returned JSX with a `<PlayersDataTable>` call:
  - `pillRowClassName="flex gap-1 mb-4"`, `toolbar={null}` (default), `loaded={loaded}`
  - `tableClassName="table-fixed"`, `colgroup={<colgroup>…6 cols…</colgroup>}` (move `:236–243`
    verbatim), `colSpan={6}`
  - `header={<>` leading `<th className="py-2 px-2" />` + the six `SortTh` cells `:247–255`
    verbatim (spreading `{...sortProps}`) `</>}`
  - `displayRows={displayRows}`, `page={page}`, `onPageChange={setPage}`
  - `renderRow={row => (` the `ExpandableTableRow` from `:262–329` verbatim — its `detail`
    (`UsageHistoryPanel`), chevron `<td>` (reads `expanded`/`toggleExpanded`), and the 5 data
    cells — with `onRowClick={() => setSelectedPlayerId(row.player_id)}` `)}`
  - `selectedPlayerId={selectedPlayerId}`, `onCloseProfile={() => setSelectedPlayerId(null)}`,
    `onSelectPlayer={setSelectedPlayerId}`
  - `profileContextValue={{ careerStats, playersMap: playerMap, playerRows, positionPeakPPG,
    ktcMap, historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats }}`
    (verbatim object from `:359–363`)
  - `comparisonList`/`addToComparison`/`removeFromComparison` passthrough.

### 4.4 `src/components/players/NflStatsTab.jsx`

- **`:1`** imports — add the same two imports (`usePlayersTable`, `PlayersDataTable`). **Keep**
  `useCallback`/`useState`/`useMemo`/`useEffect` (still used by NFL-only state + schedule loader).
- **`:8`** delete `const PAGE_SIZE = 50`.
- **`:11–46` `COLUMNS`, `:48–52` `fmtCell`, `:57–188` `GameLogPanel`** — keep unchanged. Add a
  module-level `const DEFAULT_SORT = { column: 'fpPerG', direction: 'desc' }`.
- **`:198–217`** delete `posFilter`/`sortState`/`setSortState`/`page`/`expanded`/
  `selectedPlayerId`. Replace with:
  ```js
  const { posFilter, sortState, page, expanded, selectedPlayerId, sortProps,
          handlePosFilter, toggleExpanded, setPage, setSelectedPlayerId } =
    usePlayersTable({ storageKey: 'nflstats-sort', defaultSort: DEFAULT_SORT })
  ```
- **`:220–231`** keep `tableSeason`/`setTableSeason` (NFL-only); `setTableSeason`'s `setPage(1)`
  now calls the hook's `setPage` (same identifier in scope).
- **`:233–245`** keep `logSeasonById`/`scheduleByYear`/`latestSeason`/`allSeasons`.
- **`:248–280`** keep `activeSeason`/`enrichedRows`/`displayRows` (read hook `posFilter`/
  `sortState`).
- **`:282–291`** delete pagination math + manual `sortProps`.
- **`:293–317`** delete `handleSort`/`handlePosFilter`/`toggleExpanded` (now from hook).
- **`:319–341`** keep `ensureSchedule` + the StrictMode-safe schedule `useEffect` **unchanged**
  (stays in this tab per §1.4).
- **`:343–344`** keep `cols`/`colSpan` derivation.
- **`:346–505`** replace the returned JSX with `<PlayersDataTable>`:
  - `pillRowClassName="flex flex-wrap gap-1 mb-4 items-center"`,
    `toolbar={` the season `<label>`+`<select>` from `:360–371` verbatim (Outlook-side is `null`) `}`
  - `loaded={loaded}`, `tableClassName="table-auto"`, `colgroup={null}` (default),
    `colSpan={colSpan}`
  - `header={<>` leading `<th className="py-2 px-2"/>` + `SortTh` `Player`/`G` + `cols.map(...)`
    `:383–387` verbatim `</>}`
  - `displayRows`, `page`, `onPageChange={setPage}`
  - `renderRow={row => {` the per-row block from `:392–457` verbatim — `playerSeasons`/
    `defaultLogSeason`/`logSeason` closures + the `ExpandableTableRow` with `GameLogPanel`
    `detail`, chevron `<td>`, player/G/stat cells; `onRowClick={() => setSelectedPlayerId(row.player_id)}` `}}`
  - profile props identical to Outlook (`profileContextValue` = the verbatim object from
    `:487–491`), plus comparison passthrough.

> The toolbar `<select>` keeps `onChange={e => setTableSeason(Number(e.target.value))}` and reads
> `activeSeason`/`allSeasons` from the tab closure — unchanged.

---

## 5. Equivalence verification (behaviour-preserving — how we prove it for BOTH tabs)

**Existing tests that must pass UNCHANGED (no edits, no moves):**

- [OutlookTab.test.jsx](src/components/players/OutlookTab.test.jsx) — all 10 `it()` blocks:
  row-per-player, Proj cell (bold/`WR3`/`—`), snap/opp trend cells, rookie/QB `—`, chevron→usage
  history, row-click→profile (`wr1`) + chevron-no-profile, SortTh toggle `Proj ↓`→`Proj ↑`,
  no-NaN. These exercise the moved state (sort toggle, pos filter via the `WR` pill, expand,
  profile) through the public `OutlookTab` — green ⇒ hook+wrapper are equivalent.
- [NflStatsTab.test.jsx](src/components/players/NflStatsTab.test.jsx) — all 8 `it()` blocks:
  row-per-player, position-column switch (QB `Cmp%` / WR `Catch%`), FP/G formatting + `—`,
  **table-level season select** (`16.0`→`11.0`, persists `nflstats-season`), sort toggle `FP/G
  ↓`→`↑`, expansion→game log (`vs PIT`) + per-row season select, row-click→profile + chevron-no,
  no-NaN/undefined. Covers the NFL-only season select interacting with the hook's `setPage`.
- [PlayersSurface.test.jsx](src/components/players/PlayersSurface.test.jsx) — **unaffected**: it
  `vi.mock`s `OutlookTab`/`NflStatsTab`/`PlayersTab` wholesale, so internal refactors are
  invisible. Passes unchanged.
- [ExpandableTableRow.test.jsx](src/components/ui/ExpandableTableRow.test.jsx) — **unaffected**
  (primitive untouched). Passes unchanged.
- [scheduleViewOnly.test.js](src/__tests__/scheduleViewOnly.test.js) — **must stay green**. New
  modules are **not** added to `PIPELINE` and never import `nflSchedule`/`loadNflSchedule`.

**No existing test moves or changes.** If any of the 18 tab assertions above would need editing
to pass, the refactor has changed behaviour — **stop and report** rather than editing the test
to go green (per CLAUDE.md Done-definition #1).

**Build gates** (CLAUDE.md Done-definition): `npm test` green · `npm run lint` 0 problems ·
`npm run build` clean, no warnings. Watch for: unused `useState`/`useCallback` imports left in
the tabs (lint), and the `react-refresh/only-export-components` rule — `usePlayersTable.js` is a
hook-only module (fine); `PlayersDataTable.jsx` exports only the component (fine).

---

## 6. Tests to add

### 6.1 NEW `src/hooks/usePlayersTable.test.js` (`@vitest-environment jsdom`, `renderHook` from `@testing-library/react`)

`afterEach(() => localStorage.clear())`. `const DS = { column: 'fpPerG', direction: 'desc' }`.

| Case | Input / action | Expected |
|---|---|---|
| initial state | `renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))` | `posFilter==='ALL'`, `sortState===DS` value, `page===1`, `expanded` is empty `Set`, `selectedPlayerId===null`, `sortProps==={sortKey:'fpPerG',sortAsc:false,onSort:fn}` |
| init reads valid persisted sort | preset `localStorage['k']='{"column":"rec","direction":"asc"}'` then mount | `sortState==={column:'rec',direction:'asc'}` |
| init ignores invalid persisted sort | preset `localStorage['k']='garbage'` (and a `{direction:'sideways'}` case) | falls back to `DS` |
| `handleSort` new column | `act(handleSort('rushYd'))` from default `fpPerG` | `{column:'rushYd',direction:'desc'}`, `page` reset to 1, `localStorage['k']` written |
| `handleSort` same column flips | call `handleSort('fpPerG')` twice | `desc`→`asc` (then `asc`→`desc`) |
| `handleSort` full_name asc-default | `handleSort('full_name')` | `{column:'full_name',direction:'asc'}` |
| `handlePosFilter` | set page>1 + change sort, then `handlePosFilter('QB')` | `posFilter==='QB'`, `sortState===DS`, `page===1`, persisted write === `DS` |
| persistence key isolation | two hooks, keys `'outlook-sort'` vs `'nflstats-sort'`; sort one | only that key's `localStorage` entry changes |
| `toggleExpanded` | `toggleExpanded('a')` then again | adds `'a'` to set, then removes it |
| `setPage` / `setSelectedPlayerId` | call setters | values update |

Edge cases: empty/absent `localStorage` (default), malformed JSON (default), `direction` not in
`{asc,desc}` (default).

### 6.2 NEW `src/components/players/PlayersDataTable.test.jsx` (`@vitest-environment jsdom`)

Mock `PlayerProfile` like the tab tests (`vi.mock('../PlayersTab', …)` → `PlayerProfile` =
`<div data-testid="profile">{playerId}</div>`). Feed a simple `displayRows` (e.g. 120 fake
rows) + a trivial `renderRow={r => <tr key={r.player_id}><td>{r.full_name}</td></tr>}` +
`header={<th>H</th>}`.

| Case | Action | Expected |
|---|---|---|
| pills render + click | click `QB` pill | `onPosFilter` called with `'QB'` |
| active pill class | `posFilter='RB'` | `RB` button has `bg-[var(--color-accent)]` class |
| toolbar slot | pass `toolbar={<div data-testid="tb"/>}` | `tb` present; with `toolbar` omitted → not present |
| `pillRowClassName` | pass `'flex gap-1 mb-4'` | pills container has exactly that class string |
| `!loaded` notice | `loaded={false}` vs `true` | notice present only when `false` |
| colgroup slot | pass a `<colgroup>` vs `null` | `<col>` present / absent |
| `tableClassName` | `'table-auto'` | `<table>` className === `'w-full text-sm table-auto'` |
| pagination present | 120 rows (PAGE_SIZE 50) | `Showing 1–50 of 120`; `3` total pages; Prev disabled; first 50 `renderRow`s rendered |
| Next advances | click `Next` | `onPageChange` called with a functional updater (assert by invoking it: `updater(1)===2`) |
| page clamp | `page={9}`, 10 rows | `safePage` clamps to 1 → `Showing 1–10 of 10`, Prev+Next disabled |
| empty-state | `displayRows={[]}`, `colSpan={6}`, `loaded` true/false | one `<td colSpan=6>` with `No players match your filters.` / `Loading player data…`; no pagination block |
| profile open | `selectedPlayerId='wr1'` + `profileContextValue={{careerStats:{}}}` | `profile` testid shows `wr1`; clicking backdrop (`.fixed.inset-0`) calls `onCloseProfile` |
| profile gated | `selectedPlayerId='wr1'` + `profileContextValue={{careerStats:null}}` | no `profile` (the `&& careerStats` guard) |

This directly asserts the render-prop contract (`header`, `renderRow`) renders, plus the pos
filter / pagination / profile open-close transitions at the wrapper level — complementing the
hook test (which covers sort toggle + persistence + expand transitions).

---

## 7. Docs updates (concrete before/after)

### 7.1 `CLAUDE.md` → `src/components/` table — add a row (after the `players/WeeklyPlaceholder.jsx` row)

> **Add:**
> `| `players/PlayersDataTable.jsx` | Presentational, state-free wrapper for the shared Players → Dynasty table chrome (position pills + optional toolbar, `!loaded` notice, table shell, pagination, empty-state, Player Profile panel + backdrop). Columns (`header`) and rows (`renderRow`) arrive via render-props; per-tab filter→sort + detail panels stay in the consuming tab. Consumed by `OutlookTab`/`NflStatsTab` (Weekly next). |`

### 7.2 `CLAUDE.md` → `players/OutlookTab.jsx` and `players/NflStatsTab.jsx` rows — append one clause each

> **OutlookTab row — append:** "… Consumes the shared `usePlayersTable` hook + `PlayersDataTable` wrapper for pills/sort/pagination/profile chrome; the usage-trend columns + per-season history panel stay here."
>
> **NflStatsTab row — append:** "… Consumes the shared `usePlayersTable` + `PlayersDataTable`; the season selector, per-pill columns, lazy schedule load, and game-log panel stay here."

### 7.3 `CLAUDE.md` → `src/hooks/` table — add a row

> **Add:**
> `| `usePlayersTable.js` | View-local table UI state shared by the Players → Dynasty table tabs (`posFilter`, `sortState` + `localStorage` persistence under a caller key, `page`, `expanded`, `selectedPlayerId`, handlers, `sortProps`). One instance per tab. Owns **view-local** state only — never App.jsx domain/`playerRows`-pipeline state (see *App.jsx owns all state*). |`

### 7.4 `docs/ui.md` — add a short shared-unit subsection + cross-reference the two tab sections

- **New subsection** (insert just before `## Outlook tab`, [docs/ui.md:117](docs/ui.md)):
  > `## Shared players table (`usePlayersTable` + `PlayersDataTable`)`
  > The Outlook and NFL-stats tabs share their table chrome through
  > `src/hooks/usePlayersTable.js` (view-local state: ALL/QB/RB/WR/TE pill filter, `SortTh` sort
  > + `localStorage` persistence under a per-tab key, pagination page, expand `Set`, selected
  > profile id) and `src/components/players/PlayersDataTable.jsx` (presentational wrapper: pills
  > + optional toolbar, `!loaded` notice, `overflow-x-auto` table shell, 50-row pagination,
  > empty-state, and the Player Profile panel + backdrop). Each tab supplies its own columns
  > (`header`), rows (`renderRow` → an `ExpandableTableRow`), filter→sort pipeline, and detail
  > panel; the Weekly tab is the planned third consumer. Display-only; never feeds
  > projection/scoring.
- **Outlook tab** ([:117–145](docs/ui.md)) — change "with ALL/QB/RB/WR/TE position tabs, column
  sort (`localStorage['outlook-sort']`, default Proj ↓) and pagination" to note these now come
  from the shared unit: e.g. append "(pills/sort/pagination/profile via the shared
  `usePlayersTable`/`PlayersDataTable` — see above)."
- **NFL stats tab** ([:149–195](docs/ui.md)) — same one-clause cross-reference after its
  "ALL/QB/RB/WR/TE position pills, column sort (`localStorage['nflstats-sort']`…), pagination"
  sentence.

### 7.5 `README.md` → component tree ([README.md:121–137](README.md)) — two additions

- Under `players/` (after the `NflStatsTab.jsx` line `:124`):
  > `      PlayersDataTable.jsx  # Shared Dynasty-table chrome (pills/sort/pagination/profile) for Outlook + NFL stats (Weekly next); presentational, render-prop columns/rows`
- Under `hooks/` (after `usePlayerProfile.js` `:137`):
  > `    usePlayersTable.js     # View-local table state (pos filter, sort+persistence, page, expand, selected) shared by the Dynasty table tabs`

### 7.6 Not changed (stated explicitly)
- `docs/architecture.md` — no hooks/components enumeration touched here (no match for these
  symbols); **no change**.
- `docs/signal-registry.md`, `docs/projection.md` — no signal/factor/projection change; **no
  change**.
- CLAUDE.md *Invariants* text — **no change** (see §1.2; the reconciliation lives in the new
  hook's table row, not the invariant).

---

## 8. Cross-repo impact

**None — app-side only.** No change to any [Cross-repo contract](CLAUDE.md): no snapshot/schema,
no manifest, no nflverse roster/draft/advstats/**schedule** served-shape, no `factors`/projection
output. The schedule loader is untouched and stays in `NflStatsTab`. No `sleeper-dashboard-data`
coordination required. Confirmed.

---

## 9. Step sequence (suggested implementation order)

1. Create `src/hooks/usePlayersTable.js` (§3.1) + its test (§6.1); run the hook test green.
2. Create `src/components/players/PlayersDataTable.jsx` (§3.2) + its test (§6.2); run green.
3. Refactor `OutlookTab.jsx` (§4.3); run `OutlookTab.test.jsx` — must pass **unchanged**.
4. Refactor `NflStatsTab.jsx` (§4.4); run `NflStatsTab.test.jsx` — must pass **unchanged**.
5. Full gates: `npm test` (incl. `scheduleViewOnly`, `PlayersSurface`, `ExpandableTableRow`) ·
   `npm run lint` · `npm run build`.
6. Docs (§7) in the **same change**.
7. Hand back for the user's manual smoke (visual verification is the user's job — do not start
   the dev server).
