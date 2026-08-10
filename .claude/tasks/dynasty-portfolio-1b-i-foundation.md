# Slice i — Foundation: tokens, chrome, nav & routing

**Status:** implementation-ready task file (handoff artifact) — revised after a `plan-reviewer`
pass (see §13 for what changed and why). Still pending user sign-off on the open questions in the
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
  `[leagueData, nflState, user, selectedLeague]` that calls `getWeeklyStats`/`getWeeklyProjections`)
- the now-unused `getWeeklyStats`/`getWeeklyProjections` imports (if nothing else in `App.jsx`
  calls them — check before removing; `calculateFantasyPoints` and other imports used elsewhere in
  the same effect must stay if they have other call sites)
- the `MyTeamView` import and its route element

**What stays, per master-plan §3 (dormant, not deleted):** the component *files*
`src/components/roster/MyTeamView.jsx`, `PlayerCard.jsx`, `Sparkline.jsx` — left on disk, unimported
by anything. This is narrower than earlier phrasing of this plan ("the fetch effect also stays")
— that phrasing was wrong; the effect cannot stay once its only consumer is removed without
becoming dead code that fails lint. Only the standalone component files persist unused, ready for
Weekly to re-wire later.

New placeholder components:

```jsx
// src/components/portfolio/Portfolio.jsx
export function Portfolio() {
  return (
    <div className="py-12 text-center">
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
    <div className="py-12 text-center">
      <h1 className="text-xl font-semibold text-dp-text mb-3">Market</h1>
      <p className="text-dp-muted text-sm max-w-sm mx-auto">Content lands in the next slice.</p>
    </div>
  )
}
```

(Mirrors `Board.jsx`/`Trade.jsx`'s existing placeholder shape — no props, no state. These use the
new `--color-dp-*` **content** tokens, consistent with §1's scoping — this is fine precisely
*because* they're full-page route content, not chrome.)

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
   *intentional* behavior change, not drift to chase down.
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
  Board/Roster/Players/Trade to the new grouped set (Portfolio/Market/Trade desk/Draft board).
  Check whatever it asserts about `TopBar` too, once `currentWeek` is threaded through — add
  coverage for the null-`nflState` case if the existing null-`user`/`selectedLeague` case
  (`TopBar.test.jsx:50-57`) doesn't already exercise it.
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

## 11. Cross-repo impact

None — confirmed in master-plan §7; this slice is pure client-side chrome/routing, no served-data
shape changes.

## 12. Done-definition checklist (this slice)

- [ ] New `--color-dp-*`/`--font-dp-*` tokens added, dark-only, scoped to content (not chrome)
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
- [ ] `myTeamData`/`myTeamLoading`/`myTeamError` state and the My-Team-stats effect removed from
      `App.jsx`; `MyTeamView.jsx`/`PlayerCard.jsx`/`Sparkline.jsx` files left on disk, unimported
- [ ] `navRouting.test.jsx` and `AppShell.test.jsx` updated to assert the new IA
- [ ] `npm test` green, `npm run lint` clean (0 problems), `npm run build` clean
- [ ] CLAUDE.md nav map updated in the same change
- [ ] Handed back for the user's manual visual smoke (dark for new placeholder content; light
      **and** dark for chrome + League/Board/Trade, since none of those changed palette)

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
