# Players surface — tabbed research shell (slice #2)

**Model for implementation:** sonnet. Read this file first, implement exactly what it
specifies, run the done-definition (`npm test` / `npm run lint` / `npm run build`).
If anything is ambiguous or contradicts live code, stop and ask — do not improvise.

**Scope:** pure UI/navigation slice. Introduce a two-level tab shell inside the
Players surface. Build the skeleton + the default tab only; later slices fill the
other tabs. Do **not** touch the projection pipeline, dynasty scoring,
`ProfileDataContext` shape, or the Explorer's data computation. Do not build the
expandable-row mechanism, position-split tables, or any Outlook/NFL-stats/Weekly
data content — placeholders only.

---

## 1. End state

Inside the Players surface (route `/players`, unchanged):

- **Primary tabs** (underline-active style): `Dynasty` | `Weekly`.
- **`Dynasty` secondary tabs** (pill style): `Value` | `Outlook` | `NFL stats`.
  - `Value` is the **default** and renders the existing Explorer (`PlayersTab`)
    **unchanged** — same 9 columns, same filter sidebar, same sort/preset
    persistence, same row-click → Player Profile panel. Behaviorally identical to
    today because it is literally the same component with the same props.
  - `Outlook` and `NFL stats` render clearly-labeled **non-gated** placeholder
    states ("coming soon" + one-line description of future content). No data tables.
  - The secondary tab bar is shown **only** when the primary tab is `Dynasty`.
- **`Weekly`** is a single **gated** placeholder, reusing the Board/Trade gating
  pattern verbatim (centered `py-12` empty state, `<h1>` + prose naming the
  prerequisite). No secondary tabs under Weekly.
- The active primary tab **and** the active Dynasty sub-tab both persist across
  reload (independently — see §3).

---

## 2. Tab-state mechanism — decision: `localStorage`, not a `:view` URL param

**Chosen: component-local state in a new wrapper, persisted to `localStorage`.**
Two keys (§3). **Not** a `/players/:view` route param.

Justification (the task said default to localStorage unless the `/league/:view`
precedent is *clearly* cleaner — it is not, here):

1. **Consistency with the Explorer's own model.** The Explorer already persists all
   of its view preferences to `localStorage` (`explorer-sort`, `explorer-presets`,
   and the inline `setSortState` writer in `PlayersTab.jsx:1778-1784`). The tab
   selection is the same class of "view preference"; localStorage matches the
   surrounding idiom.
2. **The `:view` precedent does not transfer.** `LeagueView`
   (`src/components/league/LeagueView.jsx:7-42`) works as a `:view` param because
   its three sub-views (`StandingsTable`/`ScheduleGrid`/`RostersTab`) are
   lightweight, prop-light components. The Players `Value` tab is the 2157-line
   `PlayersTab` mounted with a **16-prop payload** (`App.jsx:1011-1031`). A
   `:view` route would force either nested routes (`/players/dynasty/value`, …)
   each re-declaring that payload, or a layout route + `Outlet` context — real
   router restructure for a skeleton slice.
3. **No route/URL churn.** The route stays exactly `/players`; the CLAUDE.md
   routing table and the nav shell (`navItems.js`) are untouched (these are
   intra-surface tabs, **not** nav-shell entries).
4. **Mount/remount behavior is no worse than today.** With conditional rendering,
   switching `Dynasty`↔`Weekly` (or sub-tab away from `Value`) unmounts `PlayersTab`;
   returning remounts it and re-reads `explorer-sort`/`explorer-presets` from
   localStorage. Transient state (search box text, page number, open profile panel)
   resets — exactly as it already does today when you route away to `/roster` and
   back. So this is not a regression. (Keeping `PlayersTab` permanently mounted and
   CSS-hiding it is deliberately out of scope — over-engineering for a skeleton.)

**Invariant note (read before implementing):** the *"App.jsx owns all state"*
invariant governs the **data pipeline** state. Component-local **view** state is
already owned by components — `PlayersTab` owns `filterState`, `sortState`,
`search`, `page`, `selectedPlayerId` itself (`PlayersTab.jsx:1767-1789`). The new
tab state follows that exact precedent and lives in the new wrapper. Do **not** lift
it into `App.jsx`, and do **not** extract a custom hook (the *"no new hooks"* clause)
— inline the `useState` + `useCallback` persisted-setter pairs, mirroring
`PlayersTab.jsx:1778-1784`'s `setSortState`.

---

## 3. Tab-state shape & persistence keys

Two independent string-enum keys (one concern per key, matching `explorer-sort` /
`explorer-presets`):

| Key | Values | Default | Meaning |
|---|---|---|---|
| `players-view` | `'dynasty'` \| `'weekly'` | `'dynasty'` | primary tab |
| `players-dynasty-tab` | `'value'` \| `'outlook'` \| `'nflStats'` | `'value'` | Dynasty sub-tab |

Two keys (not one combined) so the Dynasty sub-tab is **remembered when you toggle
to Weekly and back** — e.g. on `Outlook`, click `Weekly`, click `Dynasty` → still on
`Outlook`. Read with validation against the allowed set and fall back to the default
on any unknown/garbage value (mirrors `LeagueView`'s `['standings','schedule',
'rosters'].includes(view)` guard at `LeagueView.jsx:9`). Plain strings — no
`JSON.parse` needed.

---

## 4. Component structure

New directory `src/components/players/` (mirrors `board/`, `trade/`, `roster/`,
`league/`). `PlayersTab.jsx` **stays where it is** (`src/components/PlayersTab.jsx`)
— do not move it (avoid churn + a wide import rewrite).

```
src/components/players/
  PlayersSurface.jsx        # tab shell: owns tab state, renders tab chrome,
                            #   forwards all props to PlayersTab on the Value tab
  OutlookPlaceholder.jsx    # non-gated "coming soon" placeholder
  NflStatsPlaceholder.jsx   # non-gated "coming soon" placeholder
  WeeklyPlaceholder.jsx     # gated placeholder (Board/Trade pattern)
  PlayersSurface.test.jsx   # co-located unit test (§8)
```

Separate files per placeholder (not inlined) **on purpose**: each later slice fills
exactly one of these files, so reserving them now keeps later diffs narrow.

**Render hierarchy** (in `PlayersSurface`):

```
<div>
  PrimaryTabBar  (Dynasty | Weekly — underline style)
  primaryView === 'dynasty':
      SecondaryTabBar  (Value | Outlook | NFL stats — pill style)
      dynastyTab === 'value'    → <PlayersTab {...props} />   (Explorer + its own
                                                               controls/sidebar/panel)
      dynastyTab === 'outlook'  → <OutlookPlaceholder />
      dynastyTab === 'nflStats' → <NflStatsPlaceholder />
  primaryView === 'weekly':
      <WeeklyPlaceholder />
</div>
```

### Filter button / sidebar / Player Profile panel on placeholder tabs — decision

The task's lean was "keep the filter button mounted but inert on placeholders." We
**deviate, with justification:** the filter button (`⚙ Filters`,
`PlayersTab.jsx:1924-1936`), the position tabs, the search box, the `FilterSidebar`,
and the `PlayerProfile` panel are all **Explorer-scoped** — they live *inside*
`PlayersTab` and only make sense against the Explorer table. Because `PlayersTab`
mounts only on the `Value` sub-tab, those controls are simply **absent** on
`Outlook` / `NFL stats` / `Weekly` — not "mounted but inert." This keeps the `Value`
tab byte-for-byte today's behavior and avoids a meaningless dead control on
placeholder tabs. The secondary tab bar sits **above** `PlayersTab`'s own controls
row, giving a clean three-level hierarchy: primary tabs → secondary tabs → Explorer
controls + table.

---

## 5. File-by-file edits

### 5a. `src/App.jsx` (2 edits, mechanical)

- **Import swap — line 34.**
  - Before: `import { PlayersTab } from './components/PlayersTab'`
  - After:  `import { PlayersSurface } from './components/players/PlayersSurface'`
  - (`PlayersTab` is referenced nowhere else in `App.jsx` — only at the route below.
    `PlayersTab` is now imported by `PlayersSurface` instead.)

- **Route element — line 1012.** In the `<Route path="/players" element={…}>` block
  (`App.jsx:1011-1031`), change the opening tag component name from `<PlayersTab`
  to `<PlayersSurface`. **Leave all 16 props exactly as-is** (`playerRows`,
  `loaded`, `careerStats`, `playerMap`, `positionPeakPPG`, `ktcMap`,
  `historicalShares`, `collegeStats`, `seasonProjections`, `enrichmentMap`,
  `advStats`, `myTeamName`, `fantasyTeamNames`, `comparisonList`, `addToComparison`,
  `removeFromComparison`, `clearComparison`). `PlayersSurface` forwards them
  unchanged to `PlayersTab`.

No other `App.jsx` changes. `navItems.js` is **unchanged** (intra-surface tabs are
not nav-shell entries).

### 5b. `src/components/players/PlayersSurface.jsx` (new)

```jsx
import { useState, useCallback } from 'react'
import { PlayersTab } from '../PlayersTab'
import { OutlookPlaceholder } from './OutlookPlaceholder'
import { NflStatsPlaceholder } from './NflStatsPlaceholder'
import { WeeklyPlaceholder } from './WeeklyPlaceholder'

const LS_VIEW = 'players-view'
const LS_DYNASTY_TAB = 'players-dynasty-tab'

const PRIMARY_TABS = [
  { key: 'dynasty', label: 'Dynasty' },
  { key: 'weekly',  label: 'Weekly'  },
]
const DYNASTY_TABS = [
  { key: 'value',    label: 'Value'     },
  { key: 'outlook',  label: 'Outlook'   },
  { key: 'nflStats', label: 'NFL stats' },
]

export function PlayersSurface(props) {
  const [primaryView, setPrimaryViewRaw] = useState(() => {
    const v = localStorage.getItem(LS_VIEW)
    return v === 'weekly' ? 'weekly' : 'dynasty'
  })
  const setPrimaryView = useCallback(v => {
    setPrimaryViewRaw(v)
    localStorage.setItem(LS_VIEW, v)
  }, [])

  const [dynastyTab, setDynastyTabRaw] = useState(() => {
    const v = localStorage.getItem(LS_DYNASTY_TAB)
    return ['value', 'outlook', 'nflStats'].includes(v) ? v : 'value'
  })
  const setDynastyTab = useCallback(v => {
    setDynastyTabRaw(v)
    localStorage.setItem(LS_DYNASTY_TAB, v)
  }, [])

  return (
    <div>
      {/* Primary tabs — underline-active (matches LeagueView sub-nav) */}
      <div className="flex gap-1 mb-4 border-b">
        {PRIMARY_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setPrimaryView(t.key)}
            className={`px-4 py-2 text-sm transition-colors ${
              primaryView === t.key
                ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)] font-medium'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {primaryView === 'dynasty' && (
        <>
          {/* Secondary tabs — pill style (matches Explorer position tabs) */}
          <div className="flex gap-1 mb-4">
            {DYNASTY_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setDynastyTab(t.key)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  dynastyTab === t.key
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {dynastyTab === 'value'    && <PlayersTab {...props} />}
          {dynastyTab === 'outlook'  && <OutlookPlaceholder />}
          {dynastyTab === 'nflStats' && <NflStatsPlaceholder />}
        </>
      )}

      {primaryView === 'weekly' && <WeeklyPlaceholder />}
    </div>
  )
}
```

Notes for the implementer:
- The underline classes are copied from `LeagueView.jsx:20-23`; the pill classes are
  copied from the Explorer position tabs at `PlayersTab.jsx:1919`. Use those exact
  tokens — no raw Tailwind palette classes, no new tokens (per
  `docs/ui.md` → "Color token system"; every token used here already exists with a
  `.dark` value).
- `{...props}` forwarding is intentional (all 16 props are Explorer-only; spreading
  keeps the wrapper DRY). Do not enumerate or filter them.

### 5c. `src/components/players/OutlookPlaceholder.jsx` (new)

```jsx
export function OutlookPlaceholder() {
  return (
    <div className="py-12 text-center">
      <h2 className="text-xl font-semibold text-[var(--color-text-strong)] mb-3">Outlook</h2>
      <p className="text-[var(--color-text-muted)] text-sm max-w-sm mx-auto">
        Coming soon. This tab will hold next-season projection, snap and opportunity
        trend, and multi-season usage expansion for each player.
      </p>
    </div>
  )
}
```

### 5d. `src/components/players/NflStatsPlaceholder.jsx` (new)

```jsx
export function NflStatsPlaceholder() {
  return (
    <div className="py-12 text-center">
      <h2 className="text-xl font-semibold text-[var(--color-text-strong)] mb-3">NFL stats</h2>
      <p className="text-[var(--color-text-muted)] text-sm max-w-sm mx-auto">
        Coming soon. This tab will hold position-split season averages and expandable
        game logs.
      </p>
    </div>
  )
}
```

### 5e. `src/components/players/WeeklyPlaceholder.jsx` (new — gated, mirrors `Board.jsx`)

```jsx
export function WeeklyPlaceholder() {
  return (
    <div className="py-12 text-center">
      <h1 className="text-xl font-semibold text-[var(--color-text-strong)] mb-3">Weekly</h1>
      <p className="text-[var(--color-text-muted)] text-sm max-w-sm mx-auto">
        This view is gated on the <strong>weekly rankings &amp; matchup engine</strong>{' '}
        powered by Sleeper projections. Once that prerequisite lands, Weekly will
        surface weekly rankings, matchup context, and recent form.
      </p>
    </div>
  )
}
```

**Heading levels are deliberate:** `Weekly` is a top-level surface view → `<h1>`
(verbatim Board/Trade gating pattern). `Outlook` / `NFL stats` are sub-sections of
the Dynasty surface → `<h2>`. **Distinct copy by type:** gated (Weekly) uses
"gated on **<prerequisite>**"; non-gated (Outlook/NFL stats) uses "Coming soon." so
the two read differently.

---

## 6. Step sequence

1. Create `src/components/players/` and the four component files (§5b–5e).
2. Swap the `App.jsx` import + route element (§5a).
3. Add the co-located test (§8) and run `npm test`.
4. Apply the docs updates (§7).
5. Run the full done-definition: `npm test`, `npm run lint`, `npm run build` — all
   green/clean. (No projection/factors code touched, so the contract tests
   `factorsSchema.test.js` / `statKeysContract.test.js` are unaffected; the full
   `npm test` run still covers them.)
6. Hand back for the user's manual light/dark smoke (Claude does **not** run the dev
   server — see CLAUDE.md → Workflow convention).

---

## 7. Docs updates

### 7a. `docs/ui.md`

**(i) "Navigation & surfaces" — append a paragraph** immediately after the seasonal
Rookies line (`docs/ui.md:30`), before the `### Roster surface (formerly My Team)`
heading (`:32`):

> The **Players** surface hosts a two-level intra-surface tab shell: primary tabs
> **Dynasty** | **Weekly** (underline-active), and under Dynasty the secondary tabs
> **Value** | **Outlook** | **NFL stats** (pill). **Value** is the default and is the
> Player Explorer (below). **Outlook** and **NFL stats** are labeled "coming soon"
> placeholders (later slices). **Weekly** is a gated placeholder (weekly rankings &
> matchup engine, Sleeper projections). Both tab selections persist to
> `localStorage` — `players-view` and `players-dynasty-tab` — and the route stays
> `/players` (these are not nav-shell entries). Implemented by
> `src/components/players/PlayersSurface.jsx`.

**(ii) "Player Explorer" — insert a lead note** right under the `## Player Explorer`
heading (`docs/ui.md:50`), before "Searchable, filterable, sortable…":

> The Explorer is the **Players → Dynasty → Value** tab (the default tab of the
> Players surface). It renders `PlayersTab` unchanged; everything below describes
> that tab.

### 7b. `CLAUDE.md`

**(i) Routing / IA — add a note after the routing table** (after the `*` redirect
row, before the "Nav chrome:" paragraph):

> The **Players** surface (`/players`) hosts a two-level intra-surface tab shell —
> primary **Dynasty** | **Weekly**, with Dynasty sub-tabs **Value** | **Outlook** |
> **NFL stats** — persisted to `localStorage` (`players-view`,
> `players-dynasty-tab`); **Value** renders the Explorer (`PlayersTab`); Outlook/NFL
> stats are placeholders, Weekly is gated. These are **not** nav-shell entries —
> `navItems.js` is unchanged. See `src/components/players/PlayersSurface.jsx`.

**(ii) `src/components/` table — add rows and amend the `PlayersTab.jsx` row:**

- Amend the existing `PlayersTab.jsx` row description to: `Player Explorer table,
  FilterSidebar, PlayerProfile panel, ComparisonTray. Rendered as the Players →
  Dynasty → Value tab (mounted by PlayersSurface).`
- Add:
  - `players/PlayersSurface.jsx` — `Players-surface tab shell: Dynasty {Value|Outlook|NFL stats} | Weekly; owns localStorage-persisted tab state (players-view, players-dynasty-tab); forwards all props to PlayersTab on the Value tab. Route element for /players.`
  - `players/{OutlookPlaceholder,NflStatsPlaceholder}.jsx` — `Non-gated "coming soon" placeholders for the Dynasty Outlook / NFL-stats sub-tabs (later slices).`
  - `players/WeeklyPlaceholder.jsx` — `Gated placeholder for the Weekly primary tab (weekly rankings/matchup engine prerequisite); mirrors board/Board.jsx.`

### 7c. `README.md`

In the `components/` source tree, insert a `players/` block right after the
`trade/` block (`README.md:118-119`) and before the top-level `PlayersTab.jsx`
line (`:120`); also amend the `PlayersTab.jsx` comment:

```
    players/
      PlayersSurface.jsx    # Players-surface tab shell (Dynasty {Value|Outlook|NFL stats} | Weekly); localStorage-persisted; route element for /players
      OutlookPlaceholder.jsx   # "Coming soon" placeholder (Dynasty → Outlook, later slice)
      NflStatsPlaceholder.jsx  # "Coming soon" placeholder (Dynasty → NFL stats, later slice)
      WeeklyPlaceholder.jsx    # Gated placeholder (Weekly primary tab)
    PlayersTab.jsx      # Player Explorer (Players → Dynasty → Value tab) — table + FilterSidebar + PlayerProfile panel + ComparisonTray
```

No other `README.md` changes (the existing `docs/ui.md` pointer at `README.md:181`
still points to the right section).

---

## 8. Tests to add

One co-located unit test: **`src/components/players/PlayersSurface.test.jsx`**.

**Setup (mirror `LeagueView.test.jsx` / `navRouting.test.jsx`):**
- First line `// @vitest-environment jsdom`.
- Import `{ describe, it, expect, afterEach, beforeEach, vi }` from `vitest`;
  `* as jestDomMatchers from '@testing-library/jest-dom/matchers'`;
  `{ render, screen, cleanup, fireEvent } from '@testing-library/react'`.
- `expect.extend(jestDomMatchers)`; `afterEach(() => { cleanup(); localStorage.clear() })`.
- **Mock the heavy Explorer** so the test isolates the shell:
  `vi.mock('../PlayersTab', () => ({ PlayersTab: (props) => <div data-testid="explorer">explorer{props.loaded ? ':loaded' : ''}</div> }))`.
  Render `PlayersSurface` with a minimal sentinel prop set, e.g. `{ loaded: true }`
  (the real props don't matter once `PlayersTab` is mocked).
- **Query discipline (important):** the tab buttons and the placeholder headings
  share label text (e.g. "Weekly" appears as both a tab button and the placeholder
  `<h1>`; "Outlook"/"NFL stats" likewise). Use **role-scoped** queries:
  `getByRole('button', { name })` for tabs, `getByRole('heading', { name })` for
  placeholders, and `getByTestId('explorer')` for the mocked Value tab.

**Cases:**

| # | Name | Inputs | Expected |
|---|---|---|---|
| 1 | default tab on first load | empty localStorage; render | `getByTestId('explorer')` present; Dynasty + Value buttons marked active (assert via class substring `border-[var(--color-accent)]` on Dynasty button and `bg-[var(--color-accent)]` on Value button, or simply that Explorer is shown and no placeholder heading exists: `queryByRole('heading')` is null) |
| 2 | secondary switch Value→Outlook | render; `fireEvent.click(getByRole('button',{name:'Outlook'}))` | `getByRole('heading',{name:'Outlook'})` present; `queryByTestId('explorer')` null; `localStorage.getItem('players-dynasty-tab') === 'outlook'` |
| 3 | secondary switch Value→NFL stats | click `button` "NFL stats" | `getByRole('heading',{name:'NFL stats'})` present; Explorer gone; `localStorage` key === `'nflStats'` |
| 4 | primary switch to Weekly (gating) | click `button` "Weekly" | `getByRole('heading',{name:'Weekly'})` present; `getByText(/weekly rankings/i)` present; **secondary tabs gone** (`queryByRole('button',{name:'Value'})` null, same for Outlook/NFL stats); Explorer gone; `localStorage.getItem('players-view') === 'weekly'` |
| 5 | persistence across reload — primary | `localStorage.setItem('players-view','weekly')` before render | on mount, Weekly placeholder shown (`getByRole('heading',{name:'Weekly'})`), no secondary tabs |
| 6 | persistence across reload — sub-tab | `localStorage.setItem('players-dynasty-tab','outlook')` before render | on mount, Dynasty active + `getByRole('heading',{name:'Outlook'})` shown |
| 7 | invalid persisted value → default | `localStorage.setItem('players-view','garbage')` and `players-dynasty-tab','garbage'` before render | falls back to Dynasty + Value: `getByTestId('explorer')` present, no placeholder heading |
| 8 | sub-tab remembered across primary toggle | render; click Outlook; click Weekly; click Dynasty | after returning to Dynasty, `getByRole('heading',{name:'Outlook'})` still shown (sub-tab preserved via the independent key) |
| 9 | Value-tab parity / prop forwarding | render with sentinel props `{ loaded: true, foo: 'bar' }` and a mock that records props | Explorer renders on default load and the mock received the forwarded props (e.g. text `explorer:loaded`, confirming `props.loaded` passed through). Guards "behaviorally identical" at the wiring level; the Explorer's own behavior is unchanged because it is the same component. |

Edge cases explicitly covered: default-on-first-load (1), tab switch (2,3,4),
persistence across reload (5,6), Weekly gating (4,5), Value-tab parity/forwarding
(1,9), invalid-value fallback (7), sub-tab memory (8).

**No separate placeholder test files** — the three placeholders are trivial and are
exercised through the surface switch cases above; adding standalone tests would be
redundant. (`navRouting.test.jsx` already stubs the `/players` route element with its
own `PlayersStub`, so swapping the real route to `PlayersSurface` does **not** require
changes there.)

---

## 9. Cross-repo impact

**None.** App-repo-only. No snapshot/manifest/enrichment/season-totals/nflverse
shape is touched; no `factors` key changes; no data-store contract is affected.

---

## 10. Out of scope (do not build this slice)

Outlook content (next-season projection / snap-opportunity trend / multi-season
usage expansion), NFL-stats content (position-split season averages / expandable
game logs), Weekly content (weekly rankings / matchup / recent form), the
expandable-row mechanism, any change to the projection pipeline, dynasty scoring,
`ProfileDataContext` shape, or the Explorer's data computation. Placeholders + tab
skeleton only.
