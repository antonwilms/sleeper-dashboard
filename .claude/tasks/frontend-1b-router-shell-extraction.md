# Slice 1b — Router + Nav Shell + App.jsx Render Extraction

**Status:** implementation-ready task file (handoff artifact). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask. Per the
**model-routing table**, this is a cross-file render refactor + new structural components — high
churn but mechanical; sonnet-implementable from this spec.

**Governing plan:** [.claude/tasks/frontend-overhaul.md](frontend-overhaul.md). Slice **1a** (tokens
+ `ValueChip`, light default) is landed: tokens and the `@custom-variant dark` mechanism exist but
are **inert** (no `.dark` on `<html>`); the app is still entirely light.

**This slice (1b):** the structural skeleton — `react-router-dom` routing, the nav-shell IA, and the
App.jsx render-concern extraction. **End state: every existing surface still reachable, still light,
no behavior regression.**

**Explicitly NOT 1b (deferred, with owning slice):**
- **Dark activation + recolor of carried-forward surfaces → slice 1c.** Do not flip the theme; do
  not change any existing component's color classes. New shell chrome uses 1a tokens (so 1c flips it
  for free); extracted components keep their current Tailwind palette **untouched**.
- **Peek drawer/sheet → slice 2.** Row-click keeps opening the **existing** `PlayerProfile` slide-in
  inside `PlayersTab`, exactly as today.
- **`/players/:id` routed detail page → slice 6.** Not a route in 1b.
- **Filter/sort ↔ URL query sync → slice 3.** 1b does *surface* routing only; do not touch
  `PlayersTab`'s `filterState`/sort/localStorage.
- **Rookies board content → slice 7.** 1b only reserves the seasonal IA slot.
- **Radix / Vaul / cmdk → their consuming slices.** The **only** new dep in 1b is `react-router-dom`.

---

## 0. Confirmed against live `src/App.jsx` (the crux)

**Every inline component to be extracted is already a *module-scope* function that is *props-only*** —
they are defined **outside** `App()` (top-level in App.jsx), so **none closes over App's state**.
That changes the nature of this slice:

- Extraction is a **mechanical file move + import resolution**, not a closure-untangling exercise.
- The "dangling closure over App state" failure mode **does not exist here**. The real failure mode
  is a **missing module-level import** in the new file — a sibling component, the shared
  `POSITION_ORDER` constant, or a util/api import. §4 lists each file's exact imports to prevent it.

Confirmed prop interfaces and module-level dependencies (from live App.jsx):

| Component | Today's signature (unchanged by 1b) | Module-level deps it uses |
|---|---|---|
| `AppHeader` | `({ user, selectedLeague, onSwitch, tooltipsEnabled, onToggleTooltips })` | none |
| `StandingsTable` | `({ standings })` | none |
| `ScheduleGrid` | `({ standings, weeklyScores, weeks })` | none |
| `SlotBadge` | `({ slot })` | none |
| `RostersTab` | `({ rosterTeams })` | `SlotBadge`, `POSITION_ORDER` |
| `Sparkline` | `({ values })` | none |
| `PlayerCard` | `({ player, noStats })` | `Sparkline` |
| `MyTeamView` | `({ data, loading, error, projections })` | `PlayerCard`, `POSITION_ORDER`, local `useState('thisWeek')` (its own UI state — stays) |
| `CareerLoadProgressBar` | `({ progress })` | none |
| `ClearCacheButton` | `()` | local `useState`, `clearCache` (`utils/cache`), `invalidateManifest` (`api/dataStore`) |
| `ExportDataButton` | `()` | local `useState`, `exportAllData` (`utils/exportData`) |

- `POSITION_ORDER = ['QB','RB','WR','TE','K','DEF']` (App.jsx:93) — used by `RostersTab` + `MyTeamView`
  → must become a shared import (§4.0).
- `scoringLabel(rec)` (App.jsx:95) — used **only** by the onboarding league-select render, which is
  **not** extracted in 1b (it is App-state-coupled). It **stays in App.jsx**.
- `PlayersTab` already owns its own `PlayerProfile` slide-in (its `selectedPlayerId` state +
  `ProfileDataContext.Provider`). 1b does not touch it.
- The seam = App.jsx `return (...)` (~1258–1395): `AppHeader` → tab bar (`['standings','schedule',
  'rosters','my team','players']`, ~1343–1352) → per-`activeTab` branch → utility footer
  (`ClearCacheButton`/`ExportDataButton`) → `CareerLoadProgressBar`.
- **No `useState`/`useMemo`/`useEffect` moves anywhere in 1b** (*App.jsx owns all state*; the
  load-bearing pipeline order is untouched — master plan §1.2/§1.3). `activeTab` `useState` is
  **deleted** (replaced by the router/URL — URL is not React state). Surfaces receive props injected
  by App into the route elements.

---

## 1. Router choice + justification

**Use `HashRouter` (`react-router-dom` v7).**

Evidence from the repo:
- `vite.config.js` has **no `base`** (serves at `/`); `index.html` uses absolute root asset paths.
- **No committed SPA-rewrite/fallback config** exists: no `netlify.toml` (`_redirects`), no
  `vercel.json` rewrites, no GitHub-Pages `404.html` fallback, no `.github/workflows` deploy. Remote
  is `github.com/antonwilms/sleeper-dashboard`; deployment target is uncommitted (local
  `npm run preview` / static host / GH Pages are all plausible).

Under static hosting **without** a SPA rewrite, `BrowserRouter` deep-link refresh (e.g. reloading
`/players`) **404s** — the server looks for a `/players` file. `HashRouter` (`/#/players`) serves
everything from `index.html` at `/` and **never 404s on refresh or deep-link**, with **zero server
config**, under any host (GH Pages project sites included). Since deep-linkable surfaces are exactly
what this overhaul is adding, shipping a router that breaks on refresh is the wrong default.

Trade-off accepted: `/#/...` URLs are slightly less clean. When a host with committed SPA rewrites
exists, a later slice can switch to `BrowserRouter` — react-router makes this a one-line swap and the
route definitions are identical. **Recorded as a future option, not a 1b task.**

### Route table (1b)

| Path | Element (props injected by App) | Notes |
|---|---|---|
| `/` | `<Navigate to={DEFAULT_ROUTE} replace />` | interim landing (see below) |
| `/board` | `<Board />` | gated **placeholder** (no fake content) |
| `/roster` | `<MyTeamView data={myTeamData} loading={myTeamLoading} error={myTeamError} projections={seasonProjections} />` | the Roster surface = existing My Team (gated additions later) |
| `/players` | `<PlayersTab …existing 17 props… />` | existing Explorer (incl. its own PlayerProfile) |
| `/trade` | `<Trade />` | gated **placeholder** |
| `/league` | `<Navigate to="/league/standings" replace />` | secondary group entry |
| `/league/:view` | `<LeagueView leagueData={leagueData} />` | `view` ∈ standings\|schedule\|rosters |
| `*` | `<Navigate to={DEFAULT_ROUTE} replace />` | catch-all |

`/players/:id` is **not** a 1b route (slice 6). Rookies is **not** a route in 1b — offseason hides it
(see §2); slice 7 adds the route + board.

### Interim default landing: `DEFAULT_ROUTE = '/players'`

The master plan's eventual home is the Board, but it is gated (empty). The task forbids landing on an
empty gated surface. Choose **Players (the Explorer)**: it is the most complete, immediately-useful
working surface, works for any league regardless of whether the user is in it, and is where the 1a
value chip surfaces in slice 3 — the closest-to-"home" working surface today. (Roster/My-Team is the
runner-up but is thinner and shows a loading state until `myTeamData` + projections resolve.)
`DEFAULT_ROUTE` is a single exported constant (§4.5) so the Board slice flips the landing to
`/board` in one edit.

---

## 2. Nav shell IA

**Primary (always, post-league):** four permanent items — **Board, Roster, Players, Trade.**
**Seasonal:** **Rookies** — shown only Jan–May; **hidden now** (today `2026-06-19` is offseason).
**Secondary "League" group:** Standings, Schedule, Rosters (KEEP per master plan §3) — not a
top-level item; reached via a "League" entry → `/league/:view` with a segmented control.

- **Desktop — persistent left rail** (no hamburger, per master plan §4.3): the four primary at top,
  a divider, then a "League" link (secondary). Active item via `NavLink`/`useLocation`.
- **Mobile — bottom tab bar**, ≤5 items: the four primary (Rookies becomes a 5th *only in season*).
  The **League group is not a bottom-tab item** (it would break the 5-cap with seasonal Rookies and
  is secondary): expose it via a small "League" affordance in the top bar that navigates to
  `/league`. League sub-views are a secondary segmented control inside `/league/:view`.

### Seasonal Rookies handling

`isRookieSeason(now = new Date())` → `true` when month ∈ Jan–May (0–4). Exported from
`shell/navItems.js` (takes an optional `now` for testability). The Rookies nav item renders only when
`isRookieSeason()` is true (so **hidden in June**). No Rookies route in 1b; slice 7 owns the route +
board + the in-season item's destination.

### Gated placeholders (honest, no fake content)

- `Board` — states it is the home surface, gated on the **marginal-value engine + season-phase
  classifier** (name them), with one line on what unlocks it. No mock cards.
- `Trade` — states it is gated on the **marginal-/phase-aware trade evaluator**. No mock builder.

Both built with **1a tokens** (so 1c recolors them for free).

---

## 3. Composition shape (App.jsx return)

`activeTab` `useState` is removed. App becomes router + shell + composition; it still **owns all
state/pipeline** and **injects props** into route elements (the standard react-router pattern when
state lives in the parent — keeps data flow explicit, no new context, honors the invariant).

```jsx
return (
  <TooltipContext.Provider value={tooltipsEnabled}>
    <HashRouter>
      <AppShell
        user={user}
        selectedLeague={selectedLeague}
        onSwitch={handleSwitch}
        tooltipsEnabled={tooltipsEnabled}
        onToggleTooltips={handleToggleTooltips}
        showNav={!!leagueData}            // nav rail/tab bar only once a league is loaded
        showRookies={isRookieSeason()}
      >
        {(autoLoading || !nflState)
          ? <BootLoading … />              // existing inline loading JSX (stays in App)
          : !selectedLeague
            ? <Onboarding … />             // existing username form + league cards (stays in App)
            : !leagueData
              ? <LeagueLoading … />        // existing leagueLoading/leagueError JSX (stays in App)
              : (
                <>
                  <Routes>{/* the §1 route table; elements authored here so they close over App props */}</Routes>
                  <UtilityFooter>          {/* the existing mt-8 border-t footer */}
                    <ClearCacheButton />
                    <ExportDataButton />
                  </UtilityFooter>
                </>
              )}
      </AppShell>
    </HashRouter>
    <CareerLoadProgressBar progress={careerLoadProgress} />
  </TooltipContext.Provider>
)
```

- **`AppShell` renders the top bar always + the nav only when `showNav`** — so during boot/onboarding
  the header still shows (no regression) but the nav rail/tab bar appears only with a loaded league
  (matching today, where tabs appear only after `leagueData`).
- `BootLoading` / `Onboarding` / `LeagueLoading` are App-state-coupled → **stay inline in App.jsx**
  (not extracted; they are not in the §4 extraction list). `scoringLabel` stays with `Onboarding`.
- `CareerLoadProgressBar` stays at the App root (fixed-position bottom overlay, outside the shell
  frame), extracted to `shell/`.
- `UtilityFooter` is just the existing `<div className="mt-8 pt-4 border-t">` wrapper rendered after
  `<Routes>` (same position as today — below the active surface). It may be inline in App or a tiny
  shell helper; keep it inline for minimal churn.

---

## 4. Directory layout + per-file extraction spec

```
src/
  constants.js                         # NEW — shared POSITION_ORDER
  components/
    ui/                                # exists (ValueChip from 1a)
    shell/
      AppShell.jsx                     # NEW — frame: TopBar + (conditional) nav + content
      TopBar.jsx                       # NEW — extracted AppHeader content (always-on header)
      NavRail.jsx                      # NEW — desktop left rail
      BottomTabBar.jsx                 # NEW — mobile bottom tab bar
      navItems.js                      # NEW — nav config, DEFAULT_ROUTE, isRookieSeason()
      CareerLoadProgressBar.jsx        # EXTRACTED
      ClearCacheButton.jsx             # EXTRACTED
      ExportDataButton.jsx             # EXTRACTED
    league/
      LeagueView.jsx                   # NEW — segmented control + renders the :view sub-view
      StandingsTable.jsx               # EXTRACTED
      ScheduleGrid.jsx                 # EXTRACTED
      RostersTab.jsx                   # EXTRACTED
      SlotBadge.jsx                    # EXTRACTED
    roster/
      MyTeamView.jsx                   # EXTRACTED
      PlayerCard.jsx                   # EXTRACTED
      Sparkline.jsx                    # EXTRACTED
    board/
      Board.jsx                        # NEW — gated placeholder
    trade/
      Trade.jsx                        # NEW — gated placeholder
```

### 4.0 Shared constant

- `src/constants.js` — `export const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']`.
  (`scoringLabel` is **not** moved — it stays in App.jsx with the onboarding render.)

### 4.1 Extracted components (prop interface UNCHANGED; the change is location + imports)

For each: move the function verbatim, add `export`, and add the listed imports. **No prop signature
changes** (they were already props-only — §0).

| New file | Export | Required imports |
|---|---|---|
| `league/StandingsTable.jsx` | `StandingsTable({ standings })` | — |
| `league/ScheduleGrid.jsx` | `ScheduleGrid({ standings, weeklyScores, weeks })` | — |
| `league/SlotBadge.jsx` | `SlotBadge({ slot })` | — |
| `league/RostersTab.jsx` | `RostersTab({ rosterTeams })` | `{ SlotBadge }` from `'./SlotBadge'`; `{ POSITION_ORDER }` from `'../../constants'` |
| `roster/Sparkline.jsx` | `Sparkline({ values })` | — |
| `roster/PlayerCard.jsx` | `PlayerCard({ player, noStats })` | `{ Sparkline }` from `'./Sparkline'` |
| `roster/MyTeamView.jsx` | `MyTeamView({ data, loading, error, projections })` | `{ useState }` from `'react'`; `{ PlayerCard }` from `'./PlayerCard'`; `{ POSITION_ORDER }` from `'../../constants'` |
| `shell/CareerLoadProgressBar.jsx` | `CareerLoadProgressBar({ progress })` | — |
| `shell/ClearCacheButton.jsx` | `ClearCacheButton()` | `{ useState }` from `'react'`; `{ clearCache }` from `'../../utils/cache'`; `{ invalidateManifest }` from `'../../api/dataStore'` |
| `shell/ExportDataButton.jsx` | `ExportDataButton()` | `{ useState }` from `'react'`; `{ exportAllData }` from `'../../utils/exportData'` |

App.jsx then imports each from its new path and deletes the inline definition. (`MyTeamView`'s local
`sortMode` `useState` is component-local UI state that already exists — it is **not** App state and
moves with the component; this does not violate *App.jsx owns all state*.)

### 4.2 `shell/TopBar.jsx` (extracted from `AppHeader`)

`TopBar({ user, selectedLeague, onSwitch, tooltipsEnabled, onToggleTooltips })` — the current
`AppHeader` JSX verbatim (title, avatar/name, league name, Switch, Tooltips toggle). **Keep its
current color classes** (`bg-white`, `text-gray-*`) untouched — 1c recolors. Reserve empty slots
(comments) for the future phase-chip / "as of" / command-palette trigger (filled in later slices).
`AppHeader` is removed from App.jsx.

### 4.3 `shell/navItems.js`

```js
export const DEFAULT_ROUTE = '/players'
export const PRIMARY_NAV = [
  { key: 'board',   label: 'Board',   path: '/board'   },
  { key: 'roster',  label: 'Roster',  path: '/roster'  },
  { key: 'players', label: 'Players', path: '/players' },
  { key: 'trade',   label: 'Trade',   path: '/trade'   },
]
export const LEAGUE_NAV = [
  { key: 'standings', label: 'Standings', path: '/league/standings' },
  { key: 'schedule',  label: 'Schedule',  path: '/league/schedule'  },
  { key: 'rosters',   label: 'Rosters',   path: '/league/rosters'   },
]
export const ROOKIES_NAV = { key: 'rookies', label: 'Rookies', path: '/rookies' } // route added in slice 7
export function isRookieSeason(now = new Date()) {
  const m = now.getMonth()          // 0=Jan … 11=Dec
  return m >= 0 && m <= 4           // Jan–May
}
```

### 4.4 `shell/NavRail.jsx` + `shell/BottomTabBar.jsx`

- **NavRail** (desktop): renders `PRIMARY_NAV` as `NavLink`s (active styling from `useLocation`/
  `NavLink` `isActive`), a divider, then a "League" `NavLink` (to `/league`), and `ROOKIES_NAV` only
  when `showRookies`. Tokens-driven styling (new chrome — tokens OK).
- **BottomTabBar** (mobile): `PRIMARY_NAV` (+ `ROOKIES_NAV` when `showRookies`), capped ≤5. No League
  item here (reached via TopBar "League" affordance on mobile).
- Both pure presentational; props: `{ showRookies }` (and read location via router hooks). May be
  inlined into `AppShell`, but separate files are preferred for the routing test.

### 4.5 `shell/AppShell.jsx`

`AppShell({ user, selectedLeague, onSwitch, tooltipsEnabled, onToggleTooltips, showNav, showRookies,
children })`:
- Always renders `<TopBar … />`.
- When `showNav`: renders `<NavRail showRookies/>` (desktop, e.g. `hidden md:flex`) and
  `<BottomTabBar showRookies/>` (mobile, e.g. `md:hidden fixed bottom-0`).
- Renders `children` in the content area (the existing `max-w-5xl mx-auto px-8` container; preserve
  the comparison-tray bottom padding behavior PlayersTab relies on, or leave that padding to the
  surface as today — do not regress the tray spacing).
- Pure presentational; owns no app state. Tokens-driven chrome.

### 4.6 `league/LeagueView.jsx`

`LeagueView({ leagueData })`:
- Reads `useParams().view` (default `'standings'` for unknown values).
- Renders a segmented control (`NavLink`s to `/league/standings|schedule|rosters`).
- Switches on `view`: `standings` → `<StandingsTable standings={leagueData.standings} />`; `schedule`
  → `<ScheduleGrid standings={leagueData.standings} weeklyScores={leagueData.weeklyScores}
  weeks={leagueData.weeks} />`; `rosters` → `<RostersTab rosterTeams={leagueData.rosterTeams} />`.
- This avoids the Outlet-prop-injection problem by keeping `leagueData` an explicit prop and
  switching internally.

### 4.7 `board/Board.jsx`, `trade/Trade.jsx`

Pure placeholders (no props): a heading + one honest paragraph naming the gating prerequisite (§2).
Tokens-driven.

---

## 5. Step sequence (incremental; checkpoint = `npm run build` clean + `npm run dev` visual smoke)

Each checkpoint must confirm the app is **still light and every existing surface works** before
proceeding. High churn → small verified steps.

1. **Add dep.** `react-router-dom` to `dependencies`; `npm install`. *(No code change yet.)*
2. **Shared constant + zero-dep extractions.** Create `src/constants.js`. Extract the no-sibling-dep
   components: `StandingsTable`, `ScheduleGrid`, `SlotBadge`, `Sparkline`, `CareerLoadProgressBar`.
   Import them into App.jsx; delete the inline defs. **Checkpoint:** every current tab + the progress
   bar still render identically.
3. **Dependent extractions.** Extract `RostersTab` (→ SlotBadge, POSITION_ORDER), `PlayerCard`
   (→ Sparkline), `MyTeamView` (→ PlayerCard, POSITION_ORDER), `ClearCacheButton`, `ExportDataButton`.
   Import into App.jsx; delete inline defs. **Checkpoint:** Rosters, My Team, cache-clear, and export
   all still work (this step is where a missing module import would surface — §0 failure mode).
4. **Router wiring (temporary nav).** Wrap content in `<HashRouter>`; replace the `activeTab` tab bar
   + branches with the §1 `<Routes>` (elements with their existing props); remove `activeTab`
   `useState`. Temporarily keep a minimal set of `NavLink`s (reusing tab-style buttons) so each route
   is reachable. Add `Board`/`Trade` placeholders + `LeagueView`. **Checkpoint:** `/players`,
   `/roster`, `/board`, `/trade`, `/league/standings|schedule|rosters` all render; `/` and unknown →
   `/players`; **deep-link refresh works** (hash); no surface regressed.
5. **Nav shell chrome.** Build `navItems.js`, `NavRail`, `BottomTabBar`, `AppShell`; move the
   `AppHeader` JSX into `TopBar`; wire `AppShell` into App's return (`showNav={!!leagueData}`,
   `showRookies={isRookieSeason()}`). Remove the temporary nav and the old `AppHeader`. **Checkpoint:**
   left rail (desktop) + bottom bar (mobile); League group reachable; Rookies hidden (offseason);
   default lands on Players; header still shows during onboarding.
6. **Cleanup.** Delete dead `src/App.css` (unimported Vite scaffold — master plan §1.3). Run full
   `npm test`, `npm run lint`, `npm run build`. **Final checkpoint:** full visual smoke — all light,
   no layout breakage, every surface and utility works.

---

## 6. Tests to add

New component tests use the **jsdom opt-in pattern** (mirror `AdvancedStatsPanel.test.jsx`): first
line `// @vitest-environment jsdom`; `import * as jestDomMatchers from
'@testing-library/jest-dom/matchers'` + `expect.extend(jestDomMatchers)`; `render, screen, cleanup`
from `@testing-library/react`; wrap in `MemoryRouter` from `react-router-dom`; `afterEach(cleanup)`.

1. **`shell/AppShell.test.jsx`** — nav IA:
   - Inside `<MemoryRouter initialEntries={['/players']}>`, `<AppShell showNav showRookies={false}
     …minimal props…>child</AppShell>` renders the four primary nav labels (Board/Roster/Players/
     Trade) and a "League" affordance; the active item reflects the current route.
   - `showNav={false}` → no nav rail/tab bar; `child` still rendered (onboarding case).
   - Rookies seasonality via `isRookieSeason` (test the helper directly **and** through the shell):
     `isRookieSeason(new Date('2026-03-15'))` → true (item shown when `showRookies`),
     `isRookieSeason(new Date('2026-06-19'))` → false (item hidden). Assert the Rookies label is
     absent when `showRookies={false}`, present when `true`.
2. **`shell/navRouting.test.jsx`** — route → element mapping + redirects, using the real `<Routes>`
   shape with **lightweight stub elements** for the heavy surfaces (so the test doesn't pull in the
   App pipeline). Assert: `/players` renders the players stub; `/roster` the roster stub; `/board`
   the real `Board` placeholder text (and that it names its gating prerequisite); `/trade` the real
   `Trade` placeholder text; `/league` redirects to `/league/standings`; `/` and `/bogus` redirect to
   `DEFAULT_ROUTE` (`/players`).
3. **`league/LeagueView.test.jsx`** — with fixture `leagueData`, `/league/standings` renders the
   standings table, `/league/schedule` the schedule grid, `/league/rosters` the rosters view, and an
   unknown `:view` falls back to standings.
4. **Import-integrity smoke for the dependent extractions** (the §0 failure-mode guard): a render
   test that `RostersTab` (depends on extracted `SlotBadge` + `POSITION_ORDER`) and `MyTeamView`
   (depends on extracted `PlayerCard` + `Sparkline` + `POSITION_ORDER`) **mount without throwing** on
   representative fixture props (`rosterTeams` for the former; `data`/`projections` for the latter,
   including the `noRoster` and `noStatsYet` branches). No deep output assertions needed — prop
   interfaces did not change; this only catches a missing module import.

No new tests for the verbatim, zero-dep extractions (`StandingsTable`, `ScheduleGrid`, `SlotBadge`,
`Sparkline`, `CareerLoadProgressBar`) — their interfaces are unchanged and they have no sibling
imports; the build + the routing/LeagueView tests already exercise them. Per the **Done-definition**,
`npm test` / `npm run lint` / `npm run build` must be green. No contract tests apply (no
`seasonProjection.js`/stat-key changes).

---

## 7. Docs updates

Per the **Self-maintenance** rule, apply in the same change.

### 7.1 `CLAUDE.md`

- **Line 38** — App.jsx row, replace the trailing clause:
  > *before:* `| `App.jsx` | Root component; owns all state; builds playerRows pipeline; renders tab layout |`
  > *after:*  `| `App.jsx` | Root component; owns all state; builds playerRows pipeline; renders the router + nav shell (`components/shell/AppShell`) and injects pipeline outputs into routed surfaces |`
- **`src/components/` table** — add rows for the new homes:
  > ```
  > | `shell/AppShell.jsx` | App frame: always-on `TopBar` + (post-league) desktop `NavRail` / mobile `BottomTabBar` + content area; pure chrome, owns no state |
  > | `shell/navItems.js` | Nav config: `PRIMARY_NAV`, `LEAGUE_NAV`, `ROOKIES_NAV`, `DEFAULT_ROUTE`, `isRookieSeason()` |
  > | `shell/{TopBar,NavRail,BottomTabBar,CareerLoadProgressBar,ClearCacheButton,ExportDataButton}.jsx` | Shell chrome + extracted header/progress/utility components |
  > | `league/{LeagueView,StandingsTable,ScheduleGrid,RostersTab,SlotBadge}.jsx` | Secondary "League" group surfaces (extracted) |
  > | `roster/{MyTeamView,PlayerCard,Sparkline}.jsx` | Roster surface (extracted My Team) |
  > | `board/Board.jsx`, `trade/Trade.jsx` | Gated placeholders (marginal-value/phase prerequisites) |
  > ```
- **Intro line 3** — update the parenthetical "children receive data as props or read from context"
  is still true; add one clause that surface routing is via `react-router-dom` (HashRouter). Add a
  short **"Routing / IA"** note near the Navigation map with the §1 route table and "four primary
  (Board/Roster/Players/Trade) + seasonal Rookies + secondary League group; `DEFAULT_ROUTE=/players`
  until the Board lands."
- **`src/constants.js`** — add a one-line entry to the src/ table (`POSITION_ORDER` shared constant).

### 7.2 `README.md`

- **Tech stack** — add: `- **react-router-dom** — client-side routing (HashRouter; no server rewrite needed)`.
- **Project structure** — replace the single `components/`+`App.jsx` block to show the new
  `shell/ league/ roster/ board/ trade/ ui/` trees and `constants.js`; update the `App.jsx` line to
  "All UI state; orchestrates the pipeline; renders the router + nav shell."

### 7.3 `docs/ui.md`

- **Line 15 section** `### Standings · Schedule · Rosters · My Team` — rewrite the Features/nav
  overview to the new IA:
  > *new:* a "Navigation & surfaces" section describing the left-rail (desktop) / bottom-tab (mobile)
  > shell; the four primary surfaces — **Board** (gated placeholder; names its prerequisite),
  > **Roster** (the former My Team; gated additions pending), **Players** (the Explorer), **Trade**
  > (gated placeholder); the **seasonal Rookies** slot (Jan–May; hidden offseason; board in slice 7);
  > and the secondary **League** group (Standings / Schedule / Rosters) at `/league/:view`. Keep the
  > My-Team-enhancements detail under the Roster surface.
- Leave the Explorer/Profile/SpiderChart sections unchanged (owned by later slices).

### 7.4 `docs/architecture.md`

- No existing tab-switcher/return description to rewrite (it documents state + the pipeline). **Add** a
  short **"Routing & shell"** subsection: App.jsx wraps content in `HashRouter` and renders
  `AppShell`; surfaces are routed and receive pipeline outputs as **props injected by App** (state
  still lives only in App.jsx — routing is URL-derived, not React state); list the §1 route table.

---

## 8. Cross-repo impact

**None.** Routing, the nav shell, and the render extraction are pure app-side presentation. No data
shape, manifest field, snapshot, or `sleeper-dashboard-data` contract is touched; surfaces consume
the same pipeline outputs as today, only relocated and routed.

---

## 9. Done-definition checklist (this slice)

- [ ] `react-router-dom` added to `dependencies`; **no** Radix/Vaul/cmdk added.
- [ ] All §4.1 components extracted to their new files with the exact imports listed; inline defs
      removed from App.jsx; `src/constants.js` created.
- [ ] `AppHeader` → `shell/TopBar`; `activeTab` `useState` removed; **no** `useState`/`useMemo`/
      `useEffect` moved; pipeline order untouched.
- [ ] `HashRouter` + the §1 route table; `DEFAULT_ROUTE='/players'`; `/`+catch-all redirect; deep-link
      refresh verified.
- [ ] Nav shell: desktop rail + mobile bottom bar, four primary + League group; Rookies hidden
      (offseason); header persists during onboarding.
- [ ] Board/Trade are honest gated placeholders (no fake content); LeagueView hosts the three
      existing views.
- [ ] Theme still **light**; no existing component recolored; no visual/behavior regression on any
      surface (manual smoke per the step checkpoints).
- [ ] Peek **not** added (row-click still opens existing PlayerProfile); `/players/:id` not a route;
      PlayersTab `filterState`/sort untouched.
- [ ] Dead `src/App.css` deleted.
- [ ] Tests in §6 added and green; `npm test` / `npm run lint` / `npm run build` all clean.
- [ ] README, CLAUDE.md, docs/ui.md, docs/architecture.md updated per §7.
