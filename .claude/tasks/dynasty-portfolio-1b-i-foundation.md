# Slice i — Foundation: tokens, chrome, nav & routing

**Status:** implementation-ready task file (handoff artifact) — revised after a `plan-reviewer`
pass (§13), then again on 2026-08-12 after the user's read-through and a fresh re-verification
against live source (**§13a — read this first; it contains one genuine rendering bug fix and one
instruction that was previously backwards**). Still pending user sign-off on the open questions in the
[master plan](dynasty-portfolio-1b.md#5-open-questions-needing-a-decision-beforewhile-building)
§5.1 (dark-only Portfolio/Market **content**, now resolved for the chrome — see §3 below), §5.6
(Trade desk badge), §5.7 (mobile). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md) — read §2–§5 before
implementing; this file assumes that context.

**This slice:** new design tokens (scoped to new *content*, not chrome — see §3), self-hosted
fonts, command-bar restructure (structural only, no recolor), nav-rail regroup (structural only,
no recolor), new `/portfolio` + `/market` routes (placeholder content), `/roster` retirement,
`DEFAULT_ROUTE` flip, `BottomTabBar` content update, `LeagueView`'s in-page sub-nav made
mobile-only (desktop now reaches each view via the rail directly). **End state: app builds and
routes cleanly under the new IA; Portfolio/Market are visually present but empty
("Portfolio content lands in Slice iii" placeholder text) — no dynasty-data wiring yet.**

**Explicitly NOT this slice (deferred, with owning slice):**
- **Portfolio screen content → Slice iii.** No tiles, no age-band chart, no holdings table.
- **Market screen content → Slice iv.** No table, no filters.
- **Player detail pop-up → Slice ii.** Row-click doesn't exist yet in this slice (no rows exist
  yet — Portfolio/Market are empty placeholders).
- **Chrome recolor (`TopBar`/`NavRail`/`BottomTabBar` going dark-first) → unscheduled, own future
  slice.** Master-plan §4/§5.1 revised this after plan-review: the shared chrome wraps every
  route, including `League`/`Board`/`Trade`, which stay on the current light/dark-adaptive token
  family. Recoloring the chrome now — before there's an answer for what happens to those surfaces
  in light mode — would visually break them. This slice touches the chrome's **structure** only
  (new nav groups, new routes, a search field, a freshness indicator); its colors are unchanged.
- **Red/green → blue/amber recolor of `PlayersTab`/`OutlookTab`/`NflStatsTab`/`ValueChip`'s
  underlying `--color-market-*` tokens → Slice iv**, when those surfaces are actually rebuilt as
  Market's column sets.
- **`MyTeamView.jsx`/`PlayerCard.jsx`/`Sparkline.jsx` file deletion.** Per master-plan §3, the
  *files* go dormant (unimported, left on disk), not deleted — Weekly may want them later. This
  is narrower than earlier drafts of this plan: the `myTeamData` **state and fetch effect in
  `App.jsx`** are *not* staying (see §5 — they'd be dead code that fails lint once `/roster` is
  gone). Only the component files themselves persist unused.
- **`comparisonList`/`ComparisonTray` changes → Slice v.**
- **Exposing `dynastyScore.js` component weights → Slice iii** (only needed once Portfolio/the
  pop-up actually render weighted-component bars). Master-plan §2.1 has the corrected weight
  mapping (28/25/22/**10**/**15** for age-adjusted/trajectory/current-level/reliability/
  opportunity — reliability and opportunity are swapped from the mock's row order) for whenever
  that slice reads this file.

---

## 0. Confirmed against live source

- `src/index.css` — Tailwind v4, `@theme` block is the color source of truth (lines 6–187), `.dark`
  overrides (190–323). Existing tokens are light-default with a dark flip.
- `src/theme.js` — load/persist/apply-class helpers only, no color values. The handoff's "add
  these to theme.js" instruction is superseded by the above; not followed literally.
- `src/main.jsx:1` — `import '@fontsource-variable/inter'` is the only font import. Confirmed on
  npm: `@fontsource-variable/public-sans` and `@fontsource/ibm-plex-mono` both exist (latest
  `5.3.0`). **Important asymmetry confirmed during review:** `public-sans` is a *variable* package
  (root import carries the full weight axis, same as `inter`); `ibm-plex-mono` is a *static*
  package whose root import ships **400 only** — see §2.
- `index.html` — no `<link>` font tags; theme class is set pre-hydration via an inline script
  reading `localStorage['theme']`, defaulting to `dark`. Untouched by this slice.
- `src/components/shell/AppShell.jsx` (46 lines) — renders `TopBar`, `NavRail`, `BottomTabBar`,
  passing each a **fixed, explicit prop list** — it does not forward arbitrary/unlisted props.
  **Any new `TopBar` prop must be added to `AppShell`'s own signature and threaded through
  explicitly**, or it never arrives (confirmed by plan-review: the first draft of this file added
  `currentWeek` at the `App.jsx`→`AppShell` call site without touching `AppShell.jsx` itself,
  which would have silently dropped it).
- `src/components/shell/TopBar.jsx` (63 lines) — today: app name (static text, no logo), then a
  right-hand cluster: mobile-only League link (`showLeagueLink`, `md:hidden`), user info + Switch
  **guarded behind `{user && …}`**, theme toggle button, tooltip toggle button. **No search field,
  no command bar visual language at all.** `TopBar` is rendered **unconditionally** by `AppShell`
  (before a league is even selected — `user`/`selectedLeague` are `null` during onboarding), and
  `TopBar.test.jsx:50-57` covers that null case explicitly. Any restructure must preserve the
  existing `{user && …}` / `{selectedLeague && …}` guards, not just move the elements around.
- `src/components/shell/NavRail.jsx` (39 lines) — flat `PRIMARY_NAV.map(...)`, plus one hardcoded
  "League" `NavLink` to `/league` (not per-view). Desktop-only (`hidden md:flex`), width `w-40`
  (160px).
- `src/components/shell/BottomTabBar.jsx` (31 lines) — imports `PRIMARY_NAV`/`ROOKIES_NAV` directly,
  caps at 5 items (`.slice(0, 5)`). **Zero code changes needed here** — only `navItems.js`'s
  `PRIMARY_NAV` content changes. It has **no League entry today** — mobile reaches League only via
  `TopBar`'s `showLeagueLink` link to `/league` (→ `/league/standings`). This matters for §6.
- `src/components/shell/navItems.js` (22 lines) — `DEFAULT_ROUTE`, `PRIMARY_NAV` (4 flat items),
  `LEAGUE_NAV` (3 items, paths already `/league/standings` etc. — reusable as-is), `ROOKIES_NAV`,
  `isRookieSeason()`.
- `src/components/league/LeagueView.jsx` (43 lines) — renders its **own** underline sub-nav from
  `LEAGUE_NAV` (lines 13–29). On desktop, once the rail links directly to `/league/standings`,
  `/league/schedule`, `/league/rosters`, this is a redundant second affordance. **But it is
  currently the *only* way mobile reaches `/league/schedule` and `/league/rosters`** (confirmed by
  plan-review — `BottomTabBar` has no League entry, and `TopBar`'s mobile link only reaches
  `/league` → `/league/standings`). Deleting it outright breaks mobile navigation. See §6 for the
  corrected fix (hide on desktop, keep on mobile — not delete).
- `src/App.jsx` routes (~1018–1055): `/`, `/board`, `/roster` (→`MyTeamView`), `/players`
  (→`PlayersSurface`), `/trade`, `/league`, `/league/:view`, `*`. `DEFAULT_ROUTE` used at `/` and
  `*` (imported from `navItems.js`). `myTeamData`/`myTeamLoading`/`myTeamError` state
  (`App.jsx:86-88`) and the My-Team-stats-loading `useEffect` (`App.jsx:~758-807`) have **no other
  reader** besides the `<MyTeamView>` element this slice removes — see §5.
- `src/components/board/Board.jsx`, `src/components/trade/Trade.jsx` — 12-line gated placeholders,
  no props. Untouched by this slice except their nav **label**.
- **Existing tests that hard-code the current IA and will need updating, not just tolerating red:**
  `src/components/shell/navRouting.test.jsx` (asserts `DEFAULT_ROUTE === '/players'`, `/roster` →
  a roster stub, `/`/`/bogus` → players-surface) and `src/components/shell/AppShell.test.jsx`
  (asserts nav labels Board/Roster/Players/Trade). Both encode exactly the behavior this slice
  intentionally changes — see §9.

---

## 1. Design tokens — `src/index.css`

**Scope correction from the original draft:** these tokens are for **new content** (the
Portfolio/Market placeholders in this slice; full Portfolio/Market screens in Slices iii/iv; the
pop-up in Slices ii/v) — **not** for `TopBar`/`NavRail`, which keep their current tokens (§0, §3,
§4). Add a new block appended to the existing `@theme { ... }` for a single source of truth.
**Dark-only: no `.dark` override for any `--color-dp-*` token** — this is deliberately scoped to
wholesale-new surfaces with no light-mode legacy to clash with (master-plan §5.1); it does not
extend to shared chrome.

```css
/* ── Dynasty Portfolio redesign (1b) — dark-only CONTENT tokens, not chrome. See
     docs/design_handoff_dynasty_portfolio. TopBar/NavRail do NOT use this family. ── */
--color-dp-canvas:            #0b0c0e;
--color-dp-chrome:            #0f1114;
--color-dp-card:               #131519;
--color-dp-card-quiet:         #101215;
--color-dp-row-head:           #16191e;
--color-dp-row-self:           #181b21;
--color-dp-row-active:         #1a2230;
--color-dp-chip:                #22262d;

--color-dp-border:             #23262c;
--color-dp-border-row:         #1c1f25;
--color-dp-border-raised:      #2e333b;
--color-dp-gridline:           #191c21;
--color-dp-axis:                #2e333b;

--color-dp-text:               #f2f3f5;
--color-dp-text-strong:        #e6e8eb;
--color-dp-text-2:             #d4d6db;
--color-dp-text-3:             #b8bec7;
--color-dp-text-4:             #9aa0aa;
--color-dp-text-5:             #8b919b;
--color-dp-muted:              #6b7079;
--color-dp-muted-2:            #4b5058;

--color-dp-up:                 #4f8bff;
--color-dp-up-text:            #9dbcff;
--color-dp-up-bg:              #12203a;
--color-dp-up-bg-strong:       #1a3560;
--color-dp-up-bg-soft:         #16283f;
--color-dp-up-border:          #2f4a7a;

--color-dp-down:               #f2a13b;
--color-dp-down-text:          #f5c483;
--color-dp-down-body:          #cbb99f;
--color-dp-down-bg:            #2e2415;
--color-dp-down-bg-strong:     #402d13;
--color-dp-down-bg-soft:       #2c2216;
--color-dp-down-border:        #6b4a1d;
--color-dp-down-border-soft:   #34291a;

--color-dp-neutral:            #7c8ea8;
--color-dp-slate:              #2f3945;
--color-dp-slate-2:            #3a414d;
--color-dp-proj:               #1d3a6b;

--font-dp-sans: 'Public Sans Variable', system-ui, sans-serif;
--font-dp-mono: 'IBM Plex Mono', monospace;
```

This generates Tailwind utilities (`bg-dp-canvas`, `text-dp-up-text`, `border-dp-border-raised`,
`font-dp-mono`, …) usable directly in new content markup — prefer these short-form utilities over
`bg-[var(--color-dp-x)]` bracket syntax (matches `ValueChip.jsx`'s convention).

### 1.1 Load-bearing rule: dark-only content must paint its own background

**Added 2026-08-12 — this is a real rendering bug in the first draft, not a style preference.**

`--color-dp-*` has no `.dark` override *and* the shell it sits inside still respects the theme
toggle. `body` paints `background-color: var(--color-canvas)` (`src/index.css:331`), which is
**`#f6f4f0` in light mode** (`:6-10`) and `#08090c` in dark (`:194`). `AppShell`'s `<main>` sets no
background of its own. So a dark-only component that sets only *text* colors renders
near-white-on-near-white the moment the user is in light mode — `--color-dp-text` is `#f2f3f5`
against a `#f6f4f0` page.

**Rule for every `--color-dp-*` surface, this slice and all later ones:** the outermost element of
any dark-only surface must set its own ground — `bg-dp-canvas` for a full-route body,
`bg-dp-card`/`bg-dp-chrome` for a panel — before any `text-dp-*` class is used inside it. Never
rely on the page background being dark. This is the price of the §5.1 dark-only-content decision
and applies until (and unless) a future slice commits the whole app to dark.

Radii/shadows from the handoff table are one-off values — express as Tailwind arbitrary values at
point of use (`rounded-[11px]`, `shadow-[0_8px_28px_rgba(0,0,0,0.35)]`) rather than new tokens.

## 2. Fonts

```bash
npm install @fontsource-variable/public-sans @fontsource/ibm-plex-mono
```

`src/main.jsx` — add alongside the existing Inter import:
```js
import '@fontsource-variable/inter'
import '@fontsource-variable/public-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
```

**Correction from the original draft:** `@fontsource/ibm-plex-mono`'s root import is a *static*
package that ships **weight 400 only** — it does not carry a full axis the way
`@fontsource-variable/inter`/`@fontsource-variable/public-sans` do. Importing just the root would
silently fall back to synthesized (faux) 500/600 weight in browsers, not the actual IBM Plex Mono
Medium/SemiBold the handoff specifies for numerals and mono micro-labels. Import the three weight
subpaths explicitly, as above.

## 3. Command bar — `src/components/shell/TopBar.jsx` + `AppShell.jsx`

**Structural changes only — no color/token changes.** Keep every existing `bg-[var(--color-x)]`/
`text-[var(--color-x)]` class exactly as today; this slice does not touch the chrome's palette
(see the "Explicitly NOT this slice" note above). Add, left to right, using the **existing** token
set (`--color-surface`, `--color-border`, `--color-text-*`, etc.) for anything new:

- 18×18 rounded-square logo (`bg-[var(--color-accent)]` — reuse the existing accent token, not a
  new one) + league name. **Preserve the existing guards**: today `TopBar` renders unconditionally
  during onboarding (`user`/`selectedLeague` both `null`), covered by `TopBar.test.jsx:50-57` — any
  restructure must keep the league name behind the same `{selectedLeague && …}` check it has today
  (currently implicit via the `{user && (...)}` block at lines 24-36; make sure the new layout
  doesn't hoist `selectedLeague.name` outside that guard). Use `selectedLeague.name`, not the
  mock's hardcoded "Dynasty Degenerates" — the mock's copy is illustrative. The `▾` chevron: no
  league-switcher menu exists today (switching is the "Switch" text link, which resets to the
  picker) — keep `▾` non-interactive in this slice, don't build a new menu.
- Center: search input, visual only per master-plan §5.2 — no keydown listener, no results
  dropdown, no state. Style with existing tokens (`border-[var(--color-border)]`,
  `bg-[var(--color-surface)]`, placeholder text in `text-[var(--color-text-muted)]`).
- Right: freshness dot + "Data current · Week {N}". `nflState.week` is available in `App.jsx` but
  not currently passed down. **This needs a prop threaded through `AppShell`, not just `TopBar`**:
  `AppShell.jsx`'s signature (line 5) must add `currentWeek`, its `<TopBar .../>` call (line ~19)
  must forward it, and *then* `App.jsx`'s `<AppShell currentWeek={nflState?.week ?? null} ...>`
  call actually reaches `TopBar`. Render nothing when null — don't fabricate a week number. Then
  the existing theme toggle, **unchanged** (the mock's "Dark" pill is dropped per the handoff's own
  note: *"drop it if the app has a theme control elsewhere"* — the existing toggle button already
  is that control). Then the existing avatar. Then, preserved exactly as today: the mobile-only
  League `NavLink` (`showLeagueLink`) and the tooltip toggle.

**Prop changes:** `AppShell` gains `currentWeek` (passed through to `TopBar`). `TopBar` gains
`currentWeek`. No other prop signatures change. Update both the `AppShell.jsx` internals and the
`App.jsx` call site (`<AppShell currentWeek={nflState?.week ?? null} ...>`).

## 4. Nav rail — `src/components/shell/navItems.js` + `NavRail.jsx`

**`navItems.js`** — replace the flat `PRIMARY_NAV` with a grouped structure for the rail, while
keeping a flat list for `BottomTabBar` (which has no room for group headings):

```js
export const DEFAULT_ROUTE = '/portfolio'

// Flat — consumed by BottomTabBar (mobile), capped at 5 items there already.
export const PRIMARY_NAV = [
  { key: 'portfolio', label: 'Portfolio',   path: '/portfolio' },
  { key: 'market',    label: 'Market',      path: '/market'    },
  { key: 'trade',     label: 'Trade desk',  path: '/trade'     },
  { key: 'board',     label: 'Draft board', path: '/board'     },
]

export const LEAGUE_NAV = [
  { key: 'standings', label: 'Standings', path: '/league/standings' },
  { key: 'schedule',  label: 'Schedule',  path: '/league/schedule'  },
  { key: 'rosters',   label: 'Rosters',   path: '/league/rosters'   },
]

export const ROOKIES_NAV = { key: 'rookies', label: 'Rookies', path: '/rookies' }

// Grouped — consumed by NavRail (desktop). Mirrors the handoff's MANAGE/ACT/LEAGUE sections.
export const NAV_GROUPS = [
  { key: 'manage', label: 'MANAGE', items: [PRIMARY_NAV[0], PRIMARY_NAV[1]] },
  { key: 'act',    label: 'ACT',    items: [PRIMARY_NAV[2], PRIMARY_NAV[3]] },
  { key: 'league', label: 'LEAGUE', items: LEAGUE_NAV },
]

export function isRookieSeason(now = new Date()) {
  const m = now.getMonth()
  return m >= 0 && m <= 4
}
```

(Indexing into `PRIMARY_NAV` keeps the two lists trivially in sync; write it as literal objects
instead if that indexing reads as too clever during implementation.)

**No count badge on "Trade desk"** — per master-plan §5.6, there's no real number to show yet.
Model a future badge slot as `count: null` and skip rendering when null if wanted; don't hardcode
the mock's `3`.

**`NavRail.jsx`** — render `NAV_GROUPS`, each as a mono 10px section heading followed by its
items; append `ROOKIES_NAV` to the `manage` group's items when `showRookies` (closest thematic
fit — the handoff doesn't address Rookies since it's an existing feature outside the redesign).

**Explicit, added 2026-08-12 — delete the standalone League affordance.** Today `NavRail.jsx:24-36`
renders a `border-t` divider followed by a single hardcoded `<NavLink to="/league">League</NavLink>`,
*outside* the `PRIMARY_NAV.map(...)`. The new `NAV_GROUPS` `league` group covers those destinations
with three direct links (Standings/Schedule/Rosters), so **both the divider and that `NavLink` are
removed** — the group heading replaces them. Leaving them in produces a duplicate League entry
beneath the LEAGUE group. (Note this is desktop only: `TopBar`'s mobile-only `showLeagueLink`
`NavLink` to `/league` at `TopBar.jsx:12-23` is **unchanged and still required** — see §6.)
**Structural/spacing changes only** — width can move toward the handoff's `184px` (dimension, not
color, so it's low-risk; use `w-46` if Tailwind v4's dynamic spacing scale resolves it to
11.5rem/184px, else `w-[184px]`), section-heading and item padding can match the handoff's spacing
values. **Colors stay on the existing tokens**: active-item style keeps
`bg-[var(--color-accent-subtle-bg)] text-[var(--color-accent)]` (today's `NavRail.jsx:16`), resting
keeps `text-[var(--color-text-semi-muted)]` — do **not** introduce `--color-dp-*` here.

## 5. Routing — `src/App.jsx`

Route table changes:

| Path | Element | Change |
|---|---|---|
| `/` | `<Navigate to={DEFAULT_ROUTE} replace />` | unchanged mechanism, `DEFAULT_ROUTE` now `/portfolio` |
| `/portfolio` | `<Portfolio />` (new, placeholder) | **new route** |
| `/market` | `<Market />` (new, placeholder) | **new route** |
| `/roster` | `<Navigate to="/portfolio" replace />` | **was** `<MyTeamView .../>` — redirect old bookmarks/back-history instead of a hard 404 |
| `/players` | *(unchanged for now)* | `PlayersSurface` stays reachable at its existing path — no nav entry anymore, but the route isn't deleted until Slice iv absorbs its content into Market |
| `/board` | `<Board />` | unchanged element, nav label becomes "Draft board" |
| `/trade` | `<Trade />` | unchanged element, nav label becomes "Trade desk" |
| `/league`, `/league/:view` | unchanged | |
| `*` | `<Navigate to={DEFAULT_ROUTE} replace />` | unchanged mechanism |

**Correction from the original draft, per plan-review:** the `MyTeamView` route element is
removed, and with it goes its **only remaining reader** of `myTeamData`/`myTeamLoading`/
`myTeamError` and the My-Team-stats-loading `useEffect` (`App.jsx:86-88`, `~758-807`) —
these become genuinely dead (not "dormant") the moment nothing renders `<MyTeamView>`, and would
fail `no-unused-vars` under this repo's lint config. **Remove, in `App.jsx` only:**
- the `myTeamData`/`myTeamLoading`/`myTeamError` `useState` declarations
- the My-Team-stats `useEffect` that populates them (the one keyed on
  `[leagueData, nflState, user, selectedLeague]` that calls `getWeeklyStats`/`getWeeklyProjections`),
  including its `// eslint-disable-next-line react-hooks/set-state-in-effect` comment at
  `App.jsx:761`, which has no other purpose
- **three now-orphaned imports — all verified 2026-08-12 to have no other call site in `App.jsx`:**
  - `getWeeklyStats`, `getWeeklyProjections` (`App.jsx:16`) — used only at `:780-781`
  - `calculateFantasyPoints` (`App.jsx:26`) — used only at `:788`, `:790`, `:795`

  **Correction to the previous draft of this bullet,** which said *"`calculateFantasyPoints` and
  other imports used elsewhere in the same effect must stay if they have other call sites."* That
  reads as an instruction to keep it. It has **no** other call site in `App.jsx` and must be
  removed, or `npm run lint` fails on `no-unused-vars`. (The function itself stays in
  `src/utils/fantasyPoints.js` — it has plenty of consumers elsewhere in the repo. This is only
  about `App.jsx`'s import.)
- **What must NOT be removed from the same import line:** `loadCareerHistory` shares `App.jsx:16`
  with the two `getWeekly*` functions but is still called at `App.jsx:828`. Narrow the import, don't
  delete the line.
- the `MyTeamView` import and its route element

**What stays, per master-plan §3 (dormant, not deleted):** the component *files*
`src/components/roster/MyTeamView.jsx`, `PlayerCard.jsx`, `Sparkline.jsx` — left on disk, no longer
reached from `App.jsx`. This is narrower than earlier phrasing of this plan ("the fetch effect also
stays") — that phrasing was wrong; the effect cannot stay once its only consumer is removed without
becoming dead code that fails lint. Only the standalone component files persist, ready for Weekly to
re-wire later.

**Correction added 2026-08-12 — a third test file this plan had not accounted for.** Earlier drafts
said these files end up "unimported by anything." That is false:
`src/components/shell/importIntegrity.test.jsx:11` imports `MyTeamView` directly and renders it in
three branches with hand-built fixture props (`:38-83`), which in turn exercises `PlayerCard` and
`Sparkline`.

- **Do not delete, skip, or gut `importIntegrity.test.jsx`.** It is what keeps the three dormant
  files compiling and honest while they have no route; without it they could rot silently until
  Weekly tries to revive them.
- **It should pass completely unchanged.** It renders `MyTeamView` with literal props and never
  touches `App.jsx`, the router, or `myTeamData` — none of this slice's removals reach it. If it
  goes red, something in the slice went wider than intended: **stop and investigate rather than
  editing the test.**
- It is therefore *not* in §9's "tests to update" list, unlike `navRouting.test.jsx` and
  `AppShell.test.jsx`. Three shell test files mention the old IA; only two of them encode behaviour
  this slice intentionally changes.

New placeholder components:

```jsx
// src/components/portfolio/Portfolio.jsx
export function Portfolio() {
  return (
    // bg-dp-canvas is required, not decorative — see §1.1. The page ground still follows the
    // theme toggle, so a dark-only surface that sets only text colors is invisible in light mode.
    <div className="bg-dp-canvas rounded-lg py-12 text-center">
      <h1 className="text-xl font-semibold text-dp-text mb-3">Portfolio</h1>
      <p className="text-dp-muted text-sm max-w-sm mx-auto">Content lands in the next slice.</p>
    </div>
  )
}
```
```jsx
// src/components/market/Market.jsx
export function Market() {
  return (
    // bg-dp-canvas is required, not decorative — see §1.1.
    <div className="bg-dp-canvas rounded-lg py-12 text-center">
      <h1 className="text-xl font-semibold text-dp-text mb-3">Market</h1>
      <p className="text-dp-muted text-sm max-w-sm mx-auto">Content lands in the next slice.</p>
    </div>
  )
}
```

(Mirrors `Board.jsx`/`Trade.jsx`'s existing placeholder shape — no props, no state. These use the
new `--color-dp-*` **content** tokens, consistent with §1's scoping — this is fine precisely
*because* they're full-page route content, not chrome. The `bg-dp-canvas` on each is **mandatory**
per §1.1; without it these two screens render white-on-white for any user in light mode, which is
exactly the seam §5.1 accepted and must therefore be handled at every dark-only surface.)

## 6. `LeagueView.jsx` — desktop-redundant, mobile-essential sub-nav

**Correction from the original draft:** do not delete the sub-nav outright. `BottomTabBar` has no
League entry and `TopBar`'s mobile link only reaches `/league/standings` — deleting
`LeagueView`'s own tab strip would leave mobile with no way to reach `/league/schedule` or
`/league/rosters` (confirmed by plan-review). Instead: **hide it on desktop, where the rail now
covers the same three links; keep it on mobile, where nothing else does.**

Wrap the existing sub-nav block (lines 13–29) in `md:hidden` (add the class to that block's
existing `className`, alongside its current `flex gap-1 mb-4 border-b`), rather than removing it.
Keep everything else — `useParams`, the `activeView` fallback logic, the three conditional
renders — unchanged.

## 7. `BottomTabBar.jsx`

No code changes. Confirm after `navItems.js` changes that it renders Portfolio/Market/Trade desk/
Draft board (+Rookies when in-season) — five items, same cap as today.

## 8. Step sequence

1. Add `--color-dp-*`/`--font-dp-*` tokens to `src/index.css` (§1). Build should stay clean —
   pure additive CSS.
2. `npm install` the two font packages; add the three IBM Plex Mono weight-subpath imports plus
   the Public Sans import to `main.jsx` (§2).
3. Rewrite `navItems.js` (§4) — `DEFAULT_ROUTE`, `PRIMARY_NAV` content, new `NAV_GROUPS`,
   `LEAGUE_NAV`/`ROOKIES_NAV`/`isRookieSeason` unchanged in shape.
4. Restructure `NavRail.jsx` to consume `NAV_GROUPS`, keeping existing color tokens (§4).
5. Create `Portfolio.jsx`, `Market.jsx` placeholders (§5).
6. Update `App.jsx`: add `/portfolio`, `/market` routes; change `/roster` to a redirect; remove
   the `MyTeamView` route element, its import, `myTeamData`/`myTeamLoading`/`myTeamError` state,
   and the My-Team-stats effect (and now-orphaned imports) (§5).
7. Add `currentWeek` to `AppShell.jsx`'s signature and its `<TopBar>` call; restructure
   `TopBar.jsx` itself (§3), preserving existing null-guards; update the `App.jsx` call site to
   pass `currentWeek={nflState?.week ?? null}` to `AppShell`.
8. Wrap `LeagueView.jsx`'s sub-nav in `md:hidden` (§6).
9. Update `navRouting.test.jsx` and `AppShell.test.jsx` to assert the new IA (§9) — this is an
   *intentional* behavior change, not drift to chase down. **Leave `importIntegrity.test.jsx`
   alone** (§5) — it must stay green unchanged.
9a. Add the `PROVISIONAL(...)` convention to `CLAUDE.md` (§10). No code sites in this slice.
10. `npm run build` — must be clean. `npm test` — full suite green, including the two updated
    test files. Any *other* red test is unexpected — stop and investigate rather than editing it,
    since nothing in this slice should touch `playerRows`/scoring/projection logic. `npm run
    lint` — 0 problems (the myTeamData removal in step 6 is specifically to satisfy this).
11. Hand back for the user's manual visual smoke: new placeholder content in dark; `League`/
    `Board`/`Trade` (and the chrome wrapping them) in **both** light and dark, since neither the
    chrome nor those surfaces changed palette in this slice and both must keep respecting the
    toggle exactly as today.

## 9. Tests to add / update

- **Update `src/components/shell/navRouting.test.jsx`**: `DEFAULT_ROUTE` assertion becomes
  `/portfolio`; `/roster` now asserts a redirect to `/portfolio` (not a rendered roster stub);
  `/` and `/bogus` assertions resolve to Portfolio's placeholder content instead of the players
  surface. This is a required update per CLAUDE.md's done-definition ("any changed behaviour gets
  its test updated to assert the correct new outcome"), not an incidental fix.
- **Update `src/components/shell/AppShell.test.jsx`**: nav-label assertions change from
  Board/Roster/Players/Trade to the new grouped set (Portfolio/Market/Trade desk/Draft board) —
  that's `:30-34` and the `queryByText` pair at `:53-54`. Check whatever it asserts about `TopBar`
  too, once `currentWeek` is threaded through — add coverage for the null-`nflState` case if the
  existing null-`user`/`selectedLeague` case (`TopBar.test.jsx:50-57`) doesn't already exercise it.

  **Watch the League assertion specifically (`AppShell.test.jsx:34`).** It currently reads
  `expect(screen.getAllByText('League').length).toBeGreaterThan(0)`. After §4 removes `NavRail`'s
  standalone League link, the only remaining exact-match `'League'` node is `TopBar`'s mobile link —
  which jsdom renders regardless of its `md:hidden` class. **So this assertion keeps passing while
  no longer covering the rail at all.** Replace it with assertions on the new rail: the `LEAGUE`
  group heading plus `Standings`/`Schedule`/`Rosters`. Same trap in reverse at `:53-54`, where the
  `showNav={false}` case queries for `'Board'`/`'Roster'` — under the new IA those strings are gone
  from the rail *anyway*, so the assertion would pass vacuously; re-point it at the new labels
  (`Portfolio`, `Market`), which are the ones that must actually disappear when `showNav` is false.
- **New routing smoke coverage**: `/portfolio` and `/market` render their placeholder text;
  `/roster` redirects. Fold into `navRouting.test.jsx` rather than a new file, since that's
  already the home for this kind of assertion.
- No new test needed for the token/font/CSS changes (non-behavioral) or the nav-rail markup
  restructure (no logic, just JSX shape) beyond the label assertions above.

## 10. Docs updates

- `CLAUDE.md` navigation map: routing table (new `/portfolio`, `/market`; `/roster` now a
  redirect), nav-shell paragraph (grouped rail, new labels), `src/components/` table (add
  `portfolio/Portfolio.jsx`, `market/Market.jsx`; note `MyTeamView`/`PlayerCard`/`Sparkline` are
  dormant/unimported, and that their former `App.jsx` state/effect is gone), color-tokens note
  (mention the new `--color-dp-*` family, that it's dark-only by design, and that — unlike the
  original draft of this plan — it applies to new route **content**, not to `TopBar`/`NavRail`,
  which are unchanged and still respect the light/dark toggle via the existing `--color-*`
  family).
- `docs/architecture.md`: if it documents the route table or nav IA anywhere, mirror the same
  changes (check before assuming).
- **`CLAUDE.md` — add the `PROVISIONAL(...)` convention** (master-plan §2.4), under *Patterns* or
  *Invariants*. It is a standing rule for Slices ii–v, not a one-off note, so it lands here in the
  foundation slice even though **Slice i itself introduces zero provisional sites** (the
  placeholders render no data). Copy the rule verbatim from master-plan §2.4:

  ```js
  // PROVISIONAL(<category>): <what is fake> · <why> · <what would make it real>
  ```

  with `<category>` ∈ `no-data` | `heuristic` | `mock-copy`, the "`no-data` must never fabricate"
  rule (render `—`/omit — no default value, no page-load baseline, no zero-as-if-measured), and the
  fact that `grep -rn "PROVISIONAL(" src/` is the canonical inventory. Requested by the user
  2026-08-12: every datapoint the redesign shows that is not populated with real data must be
  identifiable from the source.

## 11. Cross-repo impact

None — confirmed in master-plan §7; this slice is pure client-side chrome/routing, no served-data
shape changes.

## 12. Done-definition checklist (this slice)

- [ ] New `--color-dp-*`/`--font-dp-*` tokens added, dark-only, scoped to content (not chrome)
- [ ] Every dark-only surface paints its own ground (`bg-dp-canvas`/`bg-dp-card`) per §1.1 — for
      this slice that means both placeholders. Verified by the light-mode half of the manual smoke:
      Portfolio/Market must be legible with the theme toggle set to **light**, not just dark
- [ ] Fonts self-hosted via `@fontsource`; IBM Plex Mono imported as explicit 400/500/600
      weight subpaths, not the (400-only) package root
- [ ] `AppShell.jsx` accepts and forwards `currentWeek`; `TopBar` renders it from real `nflState`,
      with all existing null-guards (`user`, `selectedLeague`) preserved
- [ ] `TopBar`/`NavRail`/`BottomTabBar` unchanged in color/tokens — structural changes only
- [ ] `NavRail` renders grouped `NAV_GROUPS`; `BottomTabBar` shows new `PRIMARY_NAV` content with
      no code changes to the component itself
- [ ] `/portfolio`, `/market` routed to placeholders; `/roster` redirects; `DEFAULT_ROUTE` is
      `/portfolio`; `/players` still reachable (unlinked)
- [ ] `LeagueView`'s sub-nav is `md:hidden` (present on mobile, hidden on desktop) — not deleted
- [ ] `NavRail`'s standalone `/league` `NavLink` **and** its `border-t` divider (`:24-36`) deleted,
      replaced by the LEAGUE group — no duplicate League entry in the rail
- [ ] `myTeamData`/`myTeamLoading`/`myTeamError` state and the My-Team-stats effect removed from
      `App.jsx`, **plus all three orphaned imports** (`getWeeklyStats`, `getWeeklyProjections`,
      `calculateFantasyPoints`) — while `loadCareerHistory` on the same line is kept;
      `MyTeamView.jsx`/`PlayerCard.jsx`/`Sparkline.jsx` files left on disk
- [ ] `navRouting.test.jsx` and `AppShell.test.jsx` updated to assert the new IA — including
      `AppShell.test.jsx:34`'s League assertion, re-pointed at the LEAGUE group rather than left to
      pass off `TopBar`'s mobile link
- [ ] `importIntegrity.test.jsx` **untouched and still green**
- [ ] `npm test` green, `npm run lint` clean (0 problems), `npm run build` clean
- [ ] CLAUDE.md nav map updated in the same change, **and** the `PROVISIONAL(...)` convention added
      (§10) — `grep -rn "PROVISIONAL(" src/` returns nothing this slice, which is the correct result
- [ ] Handed back for the user's manual visual smoke (dark for new placeholder content; light
      **and** dark for chrome + League/Board/Trade, since none of those changed palette)

## 13a. Revision 2 (2026-08-12) — post user read-through, re-verified against live source

Re-checked every §0 claim against `main` (`a466fab`). **No `src/` drift** since this file was
written: the only commits since touch `.claude/tasks/`, `CLAUDE.md`, `.claude/agents/` and the new
`docs/cross-repo-registry.md`. **No design drift** either — the upstream Claude Design project was
read via the design MCP and its `github.md` is byte-identical to the checked-in copy (last sync
`2026-08-08T15:46:43Z`), so `docs/design_handoff_dynasty_portfolio/` is still the current source.
Every anchor in §0 re-verified accurate (`LeagueView` sub-nav `:13-29`, `NavRail` active style
`:16`, `TopBar` guards, `TopBar.test.jsx:50-57`, `App.jsx:86-88`, routes `:1018-1055`). File line
counts in §0 are each one high (`AppShell` 45 not 46, `TopBar` 62 not 63, `navItems` 21 not 22,
`LeagueView` 42 not 43) — cosmetic, left as-is since every cited line number is correct.

Five substantive fixes, all above:
1. **§1.1 (new) — a real rendering bug.** The placeholders set `text-dp-*` with no background; the
   page ground follows the theme toggle and is `#f6f4f0` in light mode, so both new screens would
   have rendered near-white-on-near-white for any light-mode user. Dark-only surfaces must paint
   their own ground. Placeholder snippets in §5 fixed; checklist and manual-smoke updated.
2. **§5 — `calculateFantasyPoints` must be removed too.** The previous bullet's phrasing implied
   keeping it. Verified: `App.jsx:26` import, called only at `:788/:790/:795`, all inside the
   deleted effect → `no-unused-vars`. `loadCareerHistory` (same import line as the `getWeekly*`
   pair) stays — still called at `:828`.
3. **§5 — a third test file was unaccounted for.** `importIntegrity.test.jsx:11` imports and renders
   `MyTeamView`, so "unimported by anything" was wrong. It must be left untouched and stay green;
   it is what keeps the dormant files compiling.
4. **§4 — deleting `NavRail`'s standalone League link made explicit.** The hardcoded `NavLink` +
   divider at `:24-36` sit outside the `.map()`; leaving them yields a duplicate League entry.
5. **§9 — `AppShell.test.jsx:34` would have passed for the wrong reason**, matching `TopBar`'s
   mobile link (jsdom ignores `md:hidden`) instead of the rail. Re-pointed at the LEAGUE group;
   same vacuous-pass trap noted at `:53-54`.

Also added: the `PROVISIONAL(...)` marking convention (master-plan §2.4) is documented in
`CLAUDE.md` as part of this slice (§10, step 9a) even though Slice i introduces no provisional
sites — Slices ii–v need the rule in place before they start rendering not-yet-real data.

## 13. Revision note (post plan-review)

This file was revised after a `plan-reviewer` pass against live source found six issues in the
first draft, all fixed above: (1) `currentWeek` couldn't reach `TopBar` without an `AppShell.jsx`
change; (2) removing `/roster` makes `myTeamData`/etc. genuinely dead, not dormant, which fails
lint; (3) two existing tests hard-code the old IA and need updating, not preserving; (4) the
original `TopBar` restructure risked dropping the null-guards around `user`/`selectedLeague`; (5)
deleting `LeagueView`'s sub-nav outright would break mobile navigation to Schedule/Rosters; (6)
making the *shared chrome* dark-only would visually break `League`/`Board`/`Trade` in light mode —
scope narrowed to new content only, chrome recolor unscheduled. Two smaller corrections: the
mock's component-weight ordering (28/25/22/15/10) doesn't match the live formula (28/25/22/**10
reliability**/**15 opportunity**), and `@fontsource/ibm-plex-mono`'s root import is 400-only, not
a full weight axis.
