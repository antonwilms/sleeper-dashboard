# Frontend Overhaul — Master Plan (program-level)

**Status:** planning artifact. This is the governing plan for a full frontend overhaul. It does
**not** authorize any source edits by itself; it spawns individual two-session features (opus
plans the slice → sonnet implements it), one per slice in the ordered list below. See the
workflow convention in [CLAUDE.md](../../CLAUDE.md#workflow-convention).

**Inputs read for this plan:** `docs/dynasty-decision-engine-design.md` (product/ideal
framework — the six surfaces), `docs/dynasty-frontend-ux-design.md` (greenfield UX strategy),
live `src/App.jsx`, `src/components/PlayersTab.jsx`, `src/components/SpiderChart.jsx`,
`src/hooks/usePlayerProfile.js`, `src/utils/dynastyScore.js` (`computeMarketDivergence`),
`src/api/dataStore.js`, `package.json`, `docs/architecture.md`, `docs/ui.md`, `CLAUDE.md`, and
the data repo's `manifest.json`.

**One-line thesis.** This overhaul is **presentation-only**. Everything that can be built on the
data layer's *existing* outputs ships now (value chip, peek, Explorer migration, age-curve marker,
freshness label, search, rookies, comparison). Everything that needs *new compute* (marginal value,
phase classifier, the Board's opportunity ranking, a DCF present-value) is **engine-gated** — it is
out of scope here and blocks on separate compute tasks that, per the model-routing table, are
**opus** work touching `dynastyScore.js` / the pipeline. The clean split between "needs only a new
view" and "needs new math" *is* the gating analysis.

---

## 1. Logic / Presentation Boundary Contract

### 1.1 The data-layer outputs the new UI consumes (the contract)

The new UI is a pure consumer of the following App.jsx pipeline outputs and pure hooks. These are the
**only** surface the presentation layer is allowed to touch. Shapes are as documented in
[docs/architecture.md](../../docs/architecture.md) (player-row shape, `leagueData` shape) — verified
against live `src/App.jsx`.

| Output | Produced by | Shape / key fields the UI reads |
|---|---|---|
| `playerRowsWithProj` | App.jsx memo chain (`playerRows`→…→`playerRowsWithProj`) | Array of rows. Per row: `player_id, full_name, position, nfl_team, age, years_exp, ownerTeamName, currentSeasonPPG, careerSparkline, trend, dynastyScore{score,label,confidence,isRookie,components,signals}, positionRank, ktcValue, roleRank, recentRank, peakRank, consistencyRank, dynastyRank, rankMovement, movementLabel, divergenceSignal, divergencePct, dynRank, ktcRank, projectedPPG, projectedTotalPts, projectionConfidence, nextSeasonRank, rosterStatus, rosterYear` |
| `seasonProjections` | `computeNextSeasonProjection` per player | `{ [player_id]: { projectedPPG, projectedGames, projectedTotalPts, confidence, factors, adjustmentSummary } }` |
| `ktcMap` | `getKTCValues` + `matchKTCToSleeper` | `Map<player_id, { value, confidence }>` |
| `ktcHistory` | `loadKtcHistory` | assembled KTC snapshot time-series (drives the value-trend sparkline) |
| `enrichmentMap` | `loadEnrichment` | `{ coaching, scheme, injuries, notes }` or null |
| `advStats` | `loadAdvStats` | `{ byId, year, complete, rowCount }` or null — **view-only** |
| `historicalShares` | `computeHistoricalShares` | `{ [player_id]: [{ season, share, gamesPlayed }] }` |
| `collegeStats` | `computeCollegeMetrics` | `{ [player_id]: collegeMetricsObject }` |
| `empiricalCurves` / `positionPeakPPG` / `positionPeakAge` | `computeEmpiricalAgeCurves` | age-curve lookup tables — the data behind the **age-curve position marker** |
| `leagueData` | App.jsx league load | `{ standings, weeklyScores, weeks, rosterTeams, playerMap, rosteredIds, rookieDraftPicks, scoringSettings }` |
| Freshness metadata | `dataStore.js` (`loadManifest` / `getManifestEntry`) | manifest top-level `generatedAt` + per-entry `lastModified` — the **"as of"** source (see §9) |
| `usePlayerProfile(playerId)` | `src/hooks/usePlayerProfile.js` (pure, reads `ProfileDataContext`) | the entire peek/detail dataset: `player, dynastyScore, ownership, ktcValue, divergenceSignal, dynRank, ktcRank`, positional ranks, `careerHistory`, comps, shares, etc. |

### 1.2 OUT OF SCOPE — must-not-change

The overhaul touches **presentation only**. The following are invariant and may not be modified by
any overhaul slice:

- **The compute/data layer in `src/utils/`:** the projection pipeline (`seasonProjection.js` and its
  helpers `projectionSignals.js`, `compsIntegration.js`, `efficiencyMetrics.js`, `usageMetrics.js`,
  `momentum.js`, `regressionSignals.js`, `careerComps.js`, `teamContext.js`, `teamRzShare.js`,
  `durabilitySignals.js`, `ageCurve.js`), `dynastyScore.js` (all of it), and `relevance.js`.
- **The `playerRows` pipeline** — the ordered `useMemo` chain in App.jsx (`playerRows` →
  `playerRowsWithKTC` → `qbQualityByTeam` → `playerRowsWithQBMod` → `playerRowsFinal` → `playerRanks`
  → `playerRowsWithRanks` → `seasonProjections` → `playerRowsWithProj`). Order is load-bearing; the
  UI reads its output, never reorders or reaches into it.
- **The IndexedDB cache** (`cache.js`) and all TTLs.
- **The entire `sleeper-dashboard-data` repo** and every Cross-repo contract.

**Invariants that bind this overhaul** (named, not restated — see
[CLAUDE.md → Invariants](../../CLAUDE.md#invariants)): *Factors contract*, *Stat-key contract*,
*Fantasy points computed weekly*, *React Strict Mode double-fires*, *Capture-only factors do not move
projectedPPG*, *Advstats are display-only*, *Intentional divergence dynastyScore vs seasonProjection*,
*Ephemeral inputs snapshotted contemporaneously*, **App.jsx owns all state** (no Redux/Zustand/Jotai,
no new state-owning hooks, no TypeScript), *playerRows pipeline order load-bearing*. The
**model-routing table** governs which model plans each slice.

### 1.3 The App.jsx seam, and the only foundation extraction required

App.jsx today is two concerns in one file:

1. **State + orchestration (KEEP IN PLACE):** lines ~442–948 — every `useState`, every pipeline
   `useMemo`, every data-loading `useEffect`. The *App.jsx owns all state* invariant forbids moving
   any of this into child components or new hooks. **It stays exactly where it is.** The new UI does
   not refactor the pipeline; it re-renders its outputs.
2. **Render concern (THE SEAM — this is what the overhaul replaces):** lines ~1258–1395 — the
   `AppHeader`, the flat tab switcher (`['standings','schedule','rosters','my team','players']`), and
   the inline presentational components (`StandingsTable`, `ScheduleGrid`, `RostersTab`, `SlotBadge`,
   `MyTeamView`, `PlayerCard`, `Sparkline`, `CareerLoadProgressBar`, `ClearCacheButton`,
   `ExportDataButton`).

**The seam the new UI attaches to:** App.jsx's `return (...)`. The new nav shell + surfaces become
child components under `src/components/` that receive pipeline outputs as **props** — exactly the
pattern `PlayersTab` already uses (props-only, no state ownership). The tab switcher (App.jsx
~1343–1352) is replaced by the nav shell; each `activeTab ===` branch becomes a routed surface.

**The one render-concern extraction the overhaul requires as foundation:** lift the inline
presentational components out of App.jsx into their own files so App.jsx becomes
state+pipeline+composition only. This is render extraction, **not** state movement — it does not touch
any `useState`/`useMemo`. `App.css` (line `.counter`/`.hero` — leftover Vite scaffold, not imported)
is dead and should be deleted as part of this.

> **Note on "what surface is active" and filter state.** Which surface is showing, and the Explorer's
> filter/sort, are *view* state, not data state. Today `activeTab` and `filterState` live in App.jsx /
> PlayersTab as `useState` — that is fine and stays. Deep-linking (§4) reads/writes the URL, which is
> not React state; it does not violate the state-ownership invariant.

---

## 2. Stack Evaluation

**Recommendation: KEEP the current React 19 / Vite / Tailwind v4 stack. Add a small, accessible
primitive layer + a router + a tabular-figure typeface. No framework change.**

### 2.1 Can the current stack reach the target aesthetic?

Yes. The design target — "premium through restraint," dark-first, tabular figures, Linear/Vercel-grade
polish — is a **CSS-and-component-discipline** problem, not a framework-capability problem. Evidence
from the live code:

- The aesthetic gap is real but shallow: `index.css` is literally `@import "tailwindcss"` + one
  keyframe. There is **no design-token layer, no dark theme, no typographic system** — the app is
  light-mode Tailwind defaults (`bg-white`, `text-gray-900`). That is a *missing foundation*, not a
  *stack ceiling*. Tailwind v4's `@theme` block delivers exactly the token system the docs want.
- Tabular figures are already used ad hoc (`tabular-nums` appears in App.jsx/PlayersTab). The stack
  supports them today; what's missing is a typeface that ships real tabular figures and a global rule.
- The hard interaction targets — the peek drawer (desktop) / bottom sheet (mobile), the command
  palette, instant local sort/filter — are all standard React. The *instant* requirement is already
  met: the pipeline is local `useMemo` over in-memory rows; PlayersTab's `displayRows` filters/sorts
  synchronously today. The architecture is, as the UX doc argues, a *UX advantage* (no round-trips).

The only thing React/Vite/Tailwind cannot give for free is **accessible, polished overlay primitives**
(focus-trapped drawers, a command palette, a phase-explainer popover) — building those by hand to a
flawless bar (the UX doc calls the peek "make-or-break") is where teams lose months. That argues for a
primitive library, **not** a framework change.

### 2.2 Cost of a framework change (rejected)

A move to Next.js/Remix/SvelteKit would buy nothing here (no SSR need — it's a client-only SPA over a
CDN) and would cost the entire working logic integration: the App.jsx state model, the load-bearing
`useMemo` pipeline, the IndexedDB cache lifecycle, and React-Strict-Mode `cancelled`-flag discipline
would all have to be re-validated against a new render/runtime model — high risk against an explicit
*must-not-change* core, for zero aesthetic gain. Rejected.

### 2.3 Minimal additions (the only new dependencies)

| Addition | Why | Note |
|---|---|---|
| **Radix UI primitives** (`@radix-ui/react-dialog`, `-popover`, `-tabs`, optionally `-tooltip`) | Accessible, focus-trapped, keyboard-complete drawers/dialogs/popovers — the peek, the phase explainer, secondary tabs. Unstyled → fits Tailwind + the restraint aesthetic. | Hits the UX doc's keyboard-complete + a11y bar. |
| **Vaul** (`vaul`) | The mobile **bottom-sheet** peek (swipe-to-dismiss, thumb-reachable). Built on Radix Dialog → same a11y. | Desktop peek = Radix Dialog as a right drawer; mobile = Vaul sheet. |
| **cmdk** (`cmdk`) | The Tier-0 command palette / global search. Battle-tested, accessible, tiny. | Fuzzy player search + jump-to-surface. |
| **A router** — `react-router-dom` v7 (declarative/hash mode) | Deep-linkable surfaces + filters (the docs require it; see §4). | Not a state library — does not conflict with the state-ownership invariant. A ~40-line custom hash router is the fallback if we want zero deps; recommend react-router for a11y + ecosystem. |
| **Inter (variable), self-hosted** — `@fontsource-variable/inter` | A clean grotesque with **true tabular figures** (`font-feature-settings: "tnum"`). The single highest-impact visual decision per the UX doc. | Alternative matching the explicit "Vercel-grade" reference: Geist Sans + Geist Mono. Pick Inter for breadth; note Geist as the on-brand alternative. |

Explicitly **not** added: no charting library (the few honest visualizations — age-band heatmap,
diverging delta bar, age-curve marker, KTC sparkline — are hand-built SVG, as the app already does;
a chart lib invites the chart-junk the docs reject). No animation library (CSS transitions + the
drawer libs' built-in motion cover functional motion; respect `prefers-reduced-motion`). No state
library (invariant). No TypeScript (invariant).

---

## 3. Per-Surface / Per-Component Verdicts

Verdict legend: **keep** (carry forward ~as-is), **refactor** (reshape onto the new primitives),
**replace** (remove and rebuild differently), **defer** (decide later / gated).

### Current surfaces

| Surface (today) | Verdict | Rationale |
|---|---|---|
| Username form + League select | **keep** (restyle) | First-run flow ("connect league") survives; only re-themed onto tokens. UX doc keeps a single light first-run flow. |
| App header (`AppHeader`) | **refactor** | Becomes the shell top bar: hosts the **phase chip** (gated), the **"as of"** indicator, and the command-palette trigger. Tooltip toggle survives. |
| Tab switcher (`standings/schedule/rosters/my team/players`) | **replace** | Becomes the nav shell (left rail desktop / bottom tab bar mobile), reorganized by *question* into Board/Roster/Players/Trade (+seasonal Rookies). The flat 5-tab bar is the old IA. |
| Standings (`StandingsTable`) | **defer** | ⚠️ **Reconciliation gap** — the new IA has *no home* for league standings/schedule. It's a working league-management view the user may value; the greenfield doc simply dropped it. Decide: fold into a secondary "League" view or retire. Do not delete blind. |
| Schedule (`ScheduleGrid`) | **defer** | Same gap as Standings. |
| Rosters (all teams) (`RostersTab`) | **defer** | Same gap. Possibly subsumed by a league-wide view; not in the new IA's top level. |
| My Team (`MyTeamView`) | **refactor** | Becomes (part of) the **Roster / Portfolio** surface. The next-season PPG line + confidence badge already map to the value chip; the roster-total stays. Phase panel + age-band heatmap + hold/sell/cut are the *new* parts (heatmap buildable now; phase gated). |
| Player Explorer table (in `PlayersTab`) | **refactor** | Becomes the **Players/Explore** surface on the single shared table component (§4) with the value chip inline. Filter/sort/preset logic is reused; columns re-tiered (decision-moving primary, view-only secondary). |
| Filter sidebar (`FilterSidebar`) | **refactor** | Becomes the inline filter bar with the shared filter vocabulary (position, age band, availability, market-vs-model direction, value range). `marketSignal` filter already exists and maps directly to "delta direction." |
| Player Profile slide-in (`PlayerProfile`) | **refactor → peek + detail** | Split into the **peek** (drawer/sheet, the 80% case) and the full **Player detail** page (the deep 20%). `usePlayerProfile` is already a pure data hook → both consume it unchanged. |
| Comparison tray (`ComparisonTray`) | **keep** (restyle) | Already the correct pattern (cart-like tray + side-by-side). Carry forward; align rows; mark per-row winners. |
| KTC market-divergence display (in Profile) | **refactor** | Promote from a buried Profile blurb to the **value chip's market-delta**, visible everywhere. Data (`divergenceSignal`/`divergencePct`/`dynRank`/`ktcRank`) already computed league-wide. |

### Shared components

| Component | Verdict | Rationale |
|---|---|---|
| `SpiderChart.jsx` (5-axis radar) | **replace** | The design doc rejects radar charts categorically ("the genre's signature mistake … area is meaningless, axis order changes the shape"). Replace its job with the **age-curve position marker** + the **market-vs-model delta** (and aligned comparison rows for the compare case). Retire the file. |
| `AdvancedStatsPanel.jsx` (view-only) | **keep** | Already view-only and descriptor-driven; lives in Explore/detail as visually-secondary reference. Respects the *Advstats are display-only* invariant. |
| `AvailabilityHistory.jsx` | **keep** (restyle) | Honest, data-dense, decision-relevant (durability). Carry into detail. |
| `Tooltip.jsx` | **keep** | Portal + viewport-flip + a11y already solid; reused by chips and the why-expander. |
| `CareerSparkline` / `CareerBarChart` / `WeeklyBarChart` / `CompSparkline` (in PlayersTab) | **keep** (extract) | Honest hand-built SVG, on-strategy (no chart junk). Extract to `src/components/ui/charts/` for reuse; restyle to tokens. |
| `Sparkline` / `PlayerCard` (My Team, in App.jsx) | **refactor** | Fold into the Roster surface + the shared value chip. |
| `CareerLoadProgressBar` | **keep** (restyle) | The honest loading state for the initial career fetch (the one place a spinner is allowed per the UX doc). |
| `App.css` (Vite scaffold) | **replace/delete** | Dead, unimported. Remove during foundation. |

---

## 4. Foundation Spec (the substrate the vision needs and the app lacks)

All of this is greenfield — `index.css` has no theme today. Built once, in the first slice.

### 4.1 Design tokens (Tailwind v4 `@theme` in `src/index.css`)

- **Dark-first neutral base.** Define a neutral scale as the default surface; offer light via a
  `data-theme`/`class` toggle. Tailwind v4 dark variant.
- **Small semantic color scale — meaning, never decoration:**
  - *Market-vs-model* — a **two-direction** scale (undervalued / overvalued). Because the audience has
    elevated red-green color-blindness, **state is never carried by color alone**: pair with a
    direction glyph (▲/▼ or +/−), a sign on the number, and a text label. This is the one encoding the
    accessibility section calls load-bearing.
  - *Confidence* — a tier encoding (high / medium / low / rookie) as a consistent dot+label, not a hue
    alone.
  - *Phase* — a categorical set (Contending / Transitional / Rebuilding) with labels (gated; tokens
    defined now so the chip slots in later).
- **Radii, spacing, shadows** — restrained; "generous where decisions happen (cards), dense where
  research happens (tables)."

### 4.2 Typography

- Self-hosted **Inter variable**; enable **tabular figures globally on data** via
  `font-variant-numeric: tabular-nums` (and `"tnum"` feature). Tailwind's `tabular-nums` utility is
  already used in spots — make it systematic so every column and chip aligns. This is called out as the
  single highest-impact visual decision.

### 4.3 Nav shell

- **Left rail (desktop) / bottom tab bar (mobile).** Four permanent: **Board, Roster, Players, Trade**.
  One **seasonal: Rookies** (promoted Jan–May; today is offseason `2026-06-17`, so Rookies tucks into
  Players out of season). Never a hamburger on desktop; never >5 mobile tabs.
- Replaces the current flat tab bar. The deferred Standings/Schedule/Rosters views (§3) need a decided
  home before they can be wired into the shell — flagged, not resolved here.

### 4.4 Router decision (decide + justify)

**Add a router (`react-router-dom`, hash or browser history).** The UX doc explicitly requires
deep-linkable surfaces ("deep-linking carries [filter state]") and the command palette's
jump-to-surface. The current `activeTab` `useState` cannot deep-link or support back/forward. A router
is *routing*, not state management — it does not conflict with the *App.jsx owns all state* invariant
(routes are URL-derived; React data state stays in App.jsx). Routes: `/board`, `/roster`, `/players`
(with query-encoded filters), `/players/:id` (detail), `/trade`, `/rookies`. The peek is an overlay
**not** a route (it must never cost the user their place). *Fallback if we want zero new deps: a
~40-line custom hash router* — but react-router is recommended for keyboard/focus a11y and ecosystem
familiarity.

---

## 5. Gating Analysis — Unblocked-Now vs Engine-Gated

The dividing line follows directly from §1: this overhaul is presentation-only, so a surface is
**unblocked** iff it can be built from *existing* data-layer outputs, and **gated** iff it needs *new
compute* (which is separate opus work on the data layer, not part of this overhaul).

### 5.1 Unblocked NOW (existing outputs — verified against live source)

| Capability | Maps to existing output | Verified in |
|---|---|---|
| **Value chip** `{ value · market-delta · confidence }` | `value` ← `row.dynastyScore.score` (and/or `row.projectedPPG`); `market-delta` ← `row.divergenceSignal` / `row.divergencePct` / `row.dynRank` / `row.ktcRank`; `confidence` ← `row.projectionConfidence` (or `row.dynastyScore.confidence`) | `computeMarketDivergence` (`dynastyScore.js`: sets `divergenceSignal` at ±25% of position depth, plus `dynRank`/`ktcRank`); rows carry all three after `playerRowsFinal`/`playerRowsWithProj` |
| **Player peek + detail** | `usePlayerProfile(playerId)` returns the entire dataset already | `src/hooks/usePlayerProfile.js` (pure hook, no rewrite needed) |
| **Explorer migration** | `playerRowsWithProj` + existing `displayRows` filter/sort/preset logic | `PlayersTab.jsx` |
| **Age-curve position marker** (radar replacement) | `empiricalCurves` + `positionPeakAge` + `row.age` | App.jsx `empiricalCurves` memo |
| **KTC value-trend sparkline** | `ktcHistory` | App.jsx `ktcHistory` state |
| **"As of" freshness label** | manifest `generatedAt` / per-entry `lastModified` via `dataStore.js` | §9 |
| **Comparison tray + aligned side-by-side** | existing tray + `playerRows` | `ComparisonTray` |
| **Global search / command palette** | `playerRowsWithProj` (names, positions) | — |
| **Rookies board** | `collegeStats` (dominator/breakout age), `nflDraftMatches` (draft capital), KTC rookie values, `rookieDraftPicks` | App.jsx |
| **Why-expander (factor decomposition)** | `dynastyScore.components`/`signals` + `projection.factors`/`adjustmentSummary` | already rendered in the Profile Dynasty tab |
| **Age-band exposure heatmap — v1** | `row.age` × `row.position` × current value (`dynastyScore.score`/`projectedPPG`) for the user's roster | buildable as *current* concentration (see caveat below) |

### 5.2 Engine-gated (need NEW compute — NOT in this overhaul; prerequisite named)

| Capability | Prerequisite (separate task) | Routing |
|---|---|---|
| **The Board** (ranked opportunity cards) | A marginal-value engine **and** a season-phase classifier to rank "highest-leverage moves" | opus — new algorithm; consumes the pipeline |
| **Phase chip** (Tier 0) | Season-phase detection / roster-phase classifier (Contending/Transitional/Rebuilding) | opus — new model from roster + league settings |
| **Marginal-value outputs** (worth-to-this-roster) | The marginal-value (band-occupancy) engine | opus — new compute |
| **Trade evaluator verdict "for your roster"** | Marginal value + phase (the market contrast needs the *for-you* number, not just KTC sums) | opus — depends on the two above |
| **Discovery scan (need-aware)** | League-wide divergence *exists*, but "filtered to your roster's needs & phase" needs the phase + needs model | partial: a *generic* divergence scan is unblocked; the *need-aware* ranking is gated |
| **Age-band heatmap — "3 years out"** | A multi-season forward production stream (DCF). Current projection is **next-season only** (`projectedPPG`) | opus — V2 DCF model. *The current-value v1 heatmap (§5.1) ships now; the 3-yr-forward version is gated.* |
| **"What changed" strip** | A last-seen-snapshot diff store (new client state) | small, but new state in App.jsx — schedule as its own slice, not free |
| **Empirical confidence ranges** | Backtest residual variance by archetype (data-repo workflow) | gated; tiers ship now, ranges later |

> **Confidence vocabulary caveat (flag for every consumer).** Two vocabularies exist and must be
> normalized by the chip, not silently mixed: `projectionConfidence` = `{high, medium, low, rookie,
> null}`; `dynastyScore.confidence` = `{high, moderate, low, prospect, none}`. The first-slice chip
> defines a tiny normalizer (`moderate→medium`, `prospect→rookie`, `none→null`) and documents which
> source each surface passes.

---

## 6. Ordered Slice List

Each slice becomes its own two-session feature (opus plans → sonnet implements). Sequence honors the
UX doc's "build the chip, the peek, the Board — earn the rest," adjusted so gated surfaces wait on
their compute prerequisite.

1. **Foundation + Value chip** *(unblocked)* — tokens, dark-first theme, tabular figures, the nav
   shell scaffold, the router, render-concern extraction out of App.jsx, **and the value chip in
   isolation on real rows.** Spec'd to implementation detail in §6.1.
2. **Player peek** *(unblocked)* — Radix drawer (desktop) / Vaul sheet (mobile) over
   `usePlayerProfile`; why-expander collapsed by default; "as of" + confidence present. The
   make-or-break component — held to a flawless bar.
3. **Explorer migration** *(unblocked)* — the single shared table component, value chips inline,
   instant filter/sort reusing `displayRows`, columns re-tiered, view-only stats visually secondary.
4. **Freshness ("as of") + global search (command palette)** *(unblocked)* — Tier-0 plumbing; cheap,
   high-leverage; "as of" reads the manifest (§9).
5. **Comparison tray + aligned side-by-side** *(unblocked)* — carry forward + align rows + mark
   winners; retire any radar comparison path.
6. **Player detail page + age-curve marker + KTC sparkline** *(unblocked)* — the deep-20% page; the
   age-curve marker and sparkline are the SpiderChart replacement.
7. **Rookies board** *(unblocked, seasonal)* — college dominator/breakout age + draft capital + KTC
   rookie values, need-mapping deferred to when phase exists.
8. **Retire rejected components** *(unblocked)* — delete `SpiderChart.jsx`, `App.css`; remove the old
   tab switcher and any dead Profile-radar code once detail/peek/compare cover its job. Update docs.
9. **[GATE: phase classifier]** **Phase chip + Roster phase panel** — blocks on season-phase detection
   (opus compute task).
10. **[GATE: marginal-value engine]** **Marginal-value surfacing + age-band heatmap (3-yr-forward) +
    Roster hold/sell/cut (test-3 column)** — blocks on the marginal-value engine.
11. **[GATE: marginal value + phase]** **The Board** (+ "what changed" diff slice) — the home; blocks
    on 9 and 10.
12. **[GATE: marginal value + phase]** **Trade evaluator** (market-contrast verdict) and **need-aware
    Discovery** — block on the for-you number.

Slices 1–8 are the entire presentation overhaul on existing data and can proceed without any
data-layer work. Slices 9–12 are sequenced *behind* their compute prerequisites and are listed here
only so the IA reserves their place from day one (the nav shell ships with Board/Roster/Trade present
but thin, per the UX doc's "IA right from day one").

### 6.1 FIRST SLICE — Foundation + Value chip (spec'd to implementation detail)

This slice is two coherent halves that ship together: the **substrate** (so anything can look right)
and the **value chip** (the molecule everything else is made of, prototyped in isolation on real data
per the UX doc). It is responsibly sized as one slice; if the implementer finds the substrate alone
fills a session, split after §6.1.A and carry the chip (§6.1.B) as slice 1b — the chip's spec below
stands unchanged.

#### A. Substrate

**Files:**
- `src/index.css` *(edit)* — add the `@theme` token block (§4.1): neutral dark-first scale, semantic
  market/confidence/phase tokens, radii/spacing; enable dark mode variant; set
  `font-variant-numeric: tabular-nums` on the data base.
- `src/main.jsx` *(edit)* — import the self-hosted font (`@fontsource-variable/inter`).
- `package.json` *(edit)* — add deps: `@fontsource-variable/inter`, `react-router-dom`,
  `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-tabs`, `vaul`, `cmdk`. (Radix
  tooltip optional — existing `Tooltip.jsx` may stay.)
- `src/components/shell/AppShell.jsx` *(new)* — left rail (desktop) / bottom tab bar (mobile); renders
  `<Outlet/>`; hosts the top bar (phase-chip slot [gated/empty for now], "as of" slot, palette
  trigger). Receives nothing it owns — props only.
- `src/components/shell/` extractions *(new)* — move `StandingsTable`, `ScheduleGrid`, `RostersTab`,
  `MyTeamView`, `CareerLoadProgressBar`, `ClearCacheButton`, `ExportDataButton` out of `App.jsx` into
  their own files (render-concern extraction only; no state moves).
- `src/App.jsx` *(edit)* — replace the `return (...)` tab switcher with the router + `AppShell`;
  **leave every `useState`/`useMemo`/`useEffect` untouched.** Delete the dead `App.css` import path
  (none exists) and the file.
- `src/App.css` *(delete)* — dead Vite scaffold.

**Done-definition:** `npm run lint` + `npm run build` clean; app renders the existing surfaces inside
the new shell (Standings/Schedule/Rosters/My Team/Players still reachable while their new homes are
pending — they route under a temporary "League" group so nothing regresses). No pipeline behavior
change.

#### B. Value chip

**File:** `src/components/ui/ValueChip.jsx` *(new)*. Pure presentational, no context reads, no data
fetching — mirrors `AdvancedStatsPanel`'s view-only discipline.

**Props / data shape:**
```jsx
<ValueChip
  value={Number}            // headline model value. v1 source: row.dynastyScore.score (0–100).
                            //   (projectedPPG may render as a secondary line; true DCF present-value
                            //    is engine-gated — do NOT block the chip on it.)
  marketDelta={{            // the edge. null when no KTC match (row.ktcValue == null).
    signal: 'undervalued' | 'overvalued' | null,   // row.divergenceSignal
    pct:    Number | null,                          // row.divergencePct
    dynRank: Number | null,                         // row.dynRank
    ktcRank: Number | null,                         // row.ktcRank
  }}
  confidence={'high' | 'medium' | 'low' | 'rookie' | null}  // normalized (see normalizer below)
  ktcValue={Number | null}  // row.ktcValue — optional market-price display
  position={String}         // row.position — for "WR12 vs WR20" rank labels
  size={'sm' | 'md'}        // 'sm' = table cell; 'md' = card/peek header
/>
```

**Input sources (all already on every row — zero new compute):**
- `value` ← `row.dynastyScore.score` (peek/detail may also show `row.projectedPPG`).
- `marketDelta.*` ← `row.divergenceSignal`, `row.divergencePct`, `row.dynRank`, `row.ktcRank` — set by
  `computeMarketDivergence` in `dynastyScore.js` and merged at `playerRowsFinal`.
- `confidence` ← `row.projectionConfidence` (Explorer/Proj context) **or** `row.dynastyScore.confidence`
  (dynasty-value context), passed through the normalizer.
- `ktcValue` ← `row.ktcValue` (merged at `playerRowsWithKTC`).
- For the peek/detail, the identical fields come off `usePlayerProfile` (`divergenceSignal`, `dynRank`,
  `ktcRank`, `dynastyScore`, `ktcValue`).

**Confidence normalizer (in the chip file):**
`moderate→medium`, `prospect→rookie`, `none→null`; pass-through for `high/medium/low/rookie`.

**Rendering rules (from the visual + a11y sections):**
- **Never color alone.** Market delta shows a **direction glyph + signed value + color**:
  undervalued → ▲ + `+{pct}` (green token); overvalued → ▼ + `−{pct}` (red token); null/aligned →
  neutral dash, no color. Optionally the `POS{dynRank}` vs `POS{ktcRank}` label on hover.
- Confidence → consistent dot + short label (`High/Med/Low/Rookie`); never hidden, never a fake range.
- Tabular figures on every number. `size='sm'` is single-line for table cells; `size='md'` stacks
  value + delta + confidence for cards/peek.
- No motion beyond a hover state. Honors `prefers-reduced-motion`.

**Where it's wired this slice:** the chip is built and demonstrated **in isolation** (a throwaway
Players-table cell swap is enough to validate on real rows). Full Explorer adoption is slice 3; the
peek is slice 2. Prototyping the chip alone first is an explicit UX-doc directive.

---

## 7. Docs Updates

### 7.1 Index the two new design docs in README (they are currently orphaned)

The README **Documentation** section (`README.md` lines ~123–149) lists `architecture/projection/
dynasty-scoring/integrations/ui/signal-registry` but **not** the two new design docs. Add them.

**Mechanical edit — in `README.md`, immediately after the intro lines 124–126
("Deep behavioural docs live in `docs/`…"), insert these two bullets at the top of the list (before
the `docs/architecture.md` bullet):**

```markdown
- [docs/dynasty-decision-engine-design.md](docs/dynasty-decision-engine-design.md) — product /
  ideal framework: the six surfaces (Board, Roster, Players, Trade, Rookies, Explore), the
  marginal-value thesis, metrics display tiers, and the Ideal-vs-Current gap. The "what."
- [docs/dynasty-frontend-ux-design.md](docs/dynasty-frontend-ux-design.md) — frontend & UX strategy:
  the value chip, the peek, nav/IA, visual language (dark-first, tabular figures), and the
  rejected-patterns list. The "how it looks and behaves." See also
  [.claude/tasks/frontend-overhaul.md](.claude/tasks/frontend-overhaul.md) for the migration plan.
```

### 7.2 Add a CLAUDE.md nav pointer to the design docs (currently none)

CLAUDE.md's Navigation map (line 32) only says *"Deep behaviour is in the `docs/` directory (indexed
from README.md → Documentation)."* There is no pointer to the product/UX vision docs.

**Mechanical edit — in `CLAUDE.md`, replace the single line 32:**

> *before:*
> ```
> Deep behaviour is in the `docs/` directory (indexed from README.md → Documentation). Use this table to find which file to edit.
> ```
> *after:*
> ```
> Deep behaviour is in the `docs/` directory (indexed from README.md → Documentation). Use this table to find which file to edit. **Product/UX vision** (target product, not current behaviour) lives in `docs/dynasty-decision-engine-design.md` (the six surfaces + marginal-value thesis) and `docs/dynasty-frontend-ux-design.md` (UX/visual strategy); the frontend migration plan is `.claude/tasks/frontend-overhaul.md`.
> ```

### 7.3 Other doc edits the plan implies (per-slice, not now)

- When the foundation slice lands: update `README.md` **Project structure** (new `src/components/shell/`
  and `src/components/ui/` trees; extracted components) and `CLAUDE.md` **Navigation map** (new shell/ui
  modules), per the *Self-maintenance* rule.
- When `SpiderChart.jsx` is retired (slice 8): remove it from `README.md` structure, `CLAUDE.md`
  components table, and `docs/ui.md` (the SpiderChart section + the Dynasty-tab radar references).
- When the peek/detail split lands: update `docs/ui.md` Player-Profile section to describe peek vs
  detail.
- These are flagged so each slice's done-definition includes its own doc sync; none is part of the
  planning artifact.

---

## 8. Tests to Add

**For this planning artifact: none.** The only immediately-implementable output here is doc indexing
(§7), which is non-behavioural (Markdown), and per the Done-definition rule needs no tests.

**Tests come per-slice**, written in that slice's session:
- The value chip (slice 1) is the first testable unit: a component test (`@testing-library/react`)
  asserting the three render rules — direction glyph present for each `signal`, signed `pct`, the
  confidence normalizer (`moderate→medium`, `prospect→rookie`, `none→null`), and the never-color-alone
  guarantee (glyph/label present whenever a delta color is). Note the suite environment is `node`; a
  component test needs jsdom or the existing component-test setup used by
  `AdvancedStatsPanel.test.jsx` — follow that file's pattern.
- Later slices test their own pure helpers (e.g. any age-band bucketing, search ranking) the same way.
- The pipeline/compute layer is **not** retested by this overhaul (it doesn't change).

---

## 9. Cross-Repo Impact

**Verdict: NONE required for the "as of" label.**

The data repo's `manifest.json` **already exposes** the freshness timestamps the "as of" label needs,
at two granularities (verified against the live manifest):
- **Top-level `generatedAt`** (e.g. `"2026-06-16T18:12:20.949Z"`) — when the store was last published.
- **Per-entry `lastModified`** on every data-bearing file (46 entries: season-totals, nflverse
  roster/draft/advstats, ktc snapshots, etc.).

The app side already reads both: `dataStore.js` `loadManifest()` returns the whole manifest (incl.
`generatedAt`) and `getManifestEntry(relativePath)` returns the per-file entry (incl. `lastModified`).
No consumer currently *surfaces* this to the UI, but the data is present — the "as of" label is a
pure presentation-layer wiring task (slice 4), needing **no** data-repo change and **no** new
manifest field.

No other overhaul slice touches a Cross-repo contract: the UI consumes pipeline outputs and the
manifest read-only; it writes nothing the data repo ingests (snapshot writing via
`projectionSnapshot.js` is unchanged and out of scope). If a *later, gated* compute task (phase,
marginal value) ever needs a new persisted/served field, that is a data-repo coordination item for
*that* task — explicitly **not** this overhaul.

---

## Appendix — Greenfield-doc reconciliation flags

Places the UX doc assumes a surface/data that does not exist yet (build-aware, not build-blind):

1. **Marginal value, phase, the Board, the for-you trade verdict** — assumed throughout; require new
   compute. Gated (§5.2).
2. **Age-band heatmap "3 years out"** — assumes a multi-season forward stream; current projection is
   next-season only. v1 (current concentration) ships; 3-yr version gated.
3. **"What changed" strip** — assumes a last-seen-value diff store that doesn't exist; new client state.
4. **Standings / Schedule / Rosters (the reverse gap)** — these *exist and work today* but have **no
   home in the new six-surface IA**. The greenfield doc simply doesn't cover league-management views.
   Flagged as **defer** (§3) — decide between a secondary "League" view and retirement; do not delete
   blind.
5. **Empirical confidence ranges** — the doc wants tiers now, ranges later; ranges depend on the
   backtest harness (data-repo workflow), already parked. Tiers ship; ranges gated.
6. **Dark theme** — the doc assumes dark-first; the app is light-only today. Foundation work, not a gap
   in capability.
