# Dynasty Portfolio Redesign (1b) — Master Plan (program-level)

**Status:** planning-only artifact (no source edited to produce this or by this). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), this is a cross-file structural
change spanning App.jsx + shell + Players + a new pop-up — model-routing table says **opus** for
this class of work. This plan was authored in a **sonnet** session because that's what was
running when asked; treat it as a strong draft, not a rubber-stamped opus plan. It has been
through one `plan-reviewer` pass against live source, which found six real issues in Slice i
(App.jsx/AppShell prop-forwarding, dead-state lint failures, two tests that hard-code the old IA,
a `TopBar` null-guard regression, a mobile-navigation regression, and a chrome-recolor decision
that would have visually broken `League`/`Board`/`Trade` in light mode) plus two smaller
inaccuracies (transposed score-component weights, a font-package weight-coverage gap) — all fixed
in both files below.

**Revision 2 (2026-08-12).** Re-verified against live source after the user's read-through: **no
`src/` drift** since this plan was written (the only commits since are `.claude/tasks/`, `CLAUDE.md`
and the new `docs/cross-repo-registry.md`), and **no design drift** — the upstream Claude Design
project (`App design overhaul`, `e4ed4731-0d72-4e11-9da7-50bc2a2bc362`) was checked via the design
MCP and its `github.md` is byte-identical to the checked-in copy, last sync `2026-08-08T15:46:43Z`,
with `README.md` matching. The bundle in `docs/design_handoff_dynasty_portfolio/` **is** the current
design source; there is no newer material to import. Changes made in this revision:
- §2.1/§2.3 — the field audit had **omitted the Holdings table's `HORIZON` and `CALL` columns
  entirely**; both are now inventoried, and `CALL` turns out to be decision-engine output the app
  cannot produce (see §5.8). Four further not-real items added (header posture clause, horizon
  segmented control, tile deltas, "Shop this asset").
- **§2.4 (new)** — a required `PROVISIONAL(<category>)` source-comment convention for every
  datapoint not backed by real data, per the user's instruction (2026-08-12), plus a seeded index.
- **§3.0 (new)** — answers "should we rebuild the UI from scratch instead?"; short version: the
  plan already is greenfield where that's cheap, and the one genuine rewrite-vs-port call is
  deferred to Slice iv, correctly.
- §5.8 (new), §8, §9 updated to carry the above.

A further `plan-reviewer` pass is worth doing after these edits. A human read-through is still
recommended before Slice i implementation starts, given the open questions in §5 are genuine
product decisions, not just implementation trivia that review can catch.

**Source documents:**
- [docs/design_handoff_dynasty_portfolio/README.md](../../docs/design_handoff_dynasty_portfolio/README.md) — spec, tokens, copy (verbatim-ship).
- `docs/design_handoff_dynasty_portfolio/Sleeper Dashboard.dc.html` lines 679–1826 — the `1b` prototype markup + its mock-data/derived-state script. Read for layout/hex/copy only — the `<x-dc>`/`support.js` runtime is not real code.
- `docs/design_handoff_dynasty_portfolio/github.md` — repo pointer, confirms 1a/1b screen→file mapping.
- `1a` (same bundle) is a recreation of the *current* UI — reference only, not built from.

**What this plan does NOT cover:** `2a` (Decision desk) and `2b` (League map) are "under
consideration," not committed — this plan is 1b only, per the handoff's own recommended build
order.

---

## 1. What 1b replaces

| Today | Becomes |
|---|---|
| `/board` (gated placeholder, nav label "Board") | `/board`, same component, nav label **"Draft board"**, moves under new **ACT** group |
| `/roster` (`MyTeamView`, weekly-lineup pipeline) | **retired as a route** — its portfolio-relevant content (what do I own, what's it worth) is superseded by the new **Portfolio** screen, which reads the *dynasty* pipeline (`playerRowsWithProj`), not the weekly-lineup pipeline. See §3 for why these are different data sources and why `MyTeamView` is not simply moved. |
| `/players` (Dynasty{Value\|Outlook\|NFL stats}\|Weekly tab shell) | **Value** tab ≈ becomes the **Market** screen's "Value" column set; **Outlook** tab ≈ "Outlook" column set; **NFL stats** ≈ "Production" column set. One table, one route (`/market`), a segmented control swaps columns instead of navigating. **Weekly** (already gated) is unaffected — it has no home in the new nav yet; see §5.6. |
| `/trade` (gated placeholder, nav label "Trade") | `/trade`, same component, nav label **"Trade desk"**, moves under **ACT** group |
| `/league/*` | unchanged — **LEAGUE** group, same routes, same components |
| Nav rail: flat list (Board/Roster/Players/Trade) + League link | Grouped: **MANAGE** (Portfolio, Market) · **ACT** (Trade desk, Draft board) · **LEAGUE** (Standings, Schedule, Rosters) |
| `DEFAULT_ROUTE = '/players'` | `DEFAULT_ROUTE = '/portfolio'` |
| Row click → inline `PlayerProfile` slide-in, scoped to whichever table rendered it | Row click → **pop-up** (modal overlay), mountable from Portfolio or Market, tab strip + compare matrix when ≥2 open |

**New routes:** `/portfolio`, `/market`. **Retired route:** `/roster` (redirect to `/portfolio` —
old bookmarks/back-history shouldn't 404).

---

## 2. Contract: what data this redesign consumes

The handoff's own closing section lists data it assumes exists and flags two gaps it *knows*
don't exist (per-manager positional strength, inbound trade offers — both are `2b`/`2a` concerns,
irrelevant to `1b`). This section verifies the remaining claims against **live source**, field by
field, for every mock field the `1b` prototype script (`renderVals()`/`buildRows()`/`detailFor()`)
produces.

### 2.1 Unblocked now — already computed, just needs wiring

| Mock field | Screen | Live source | Notes |
|---|---|---|---|
| `dyn` (dynasty score) | Portfolio, Market | `row.dynastyScore.score` | `App.jsx` → `playerRowsWithProj` |
| `label` (Elite/Ascending Star/…) | Market | `row.dynastyScore.label` | |
| `mkSignal` / `mkDir` ("▲ +12% under") | Portfolio VALUE bar, Market VS MARKET | `row.divergenceSignal` + `row.divergencePct` | `computeMarketDivergence`; **`ValueChip.jsx`'s `DeltaPill` already renders exactly this pattern** — reuse, don't reinvent (see §3.1) |
| `ktc` (market value) | Portfolio VALUE, detail tiles | `row.ktcValue` | null when KTC hasn't matched — render `—` |
| `proj` / `projG` (next season, games) | Portfolio PROJ Δ, detail tiles | `seasonProjections[id].projectedPPG` / `.projectedGames` | keyed by `player_id`, from `App.jsx`'s `seasonProjections` memo |
| `sd` (±SD, "Floor risk") | detail tiles, compare matrix | `computeConsistency(careerStats, playerId).sd` | `src/utils/outlookConsistency.js` — currently Outlook-tab-only, view-only, reusable as-is |
| `spark` (5-yr PPG bars) | Portfolio 5-YR PPG, detail career chart | `row.careerSparkline` | already 5-length, 0-padded — matches the bar-chart shape almost exactly |
| `snap` / `opp` (usage trend arrows) | detail "Why next season" adjustments | `outlookUsage.computeUsageTrend` output | Outlook-tab-only today, view-only, reusable |
| `components` (5 weighted score drivers) | detail "What drives the score" | `row.dynastyScore.components` | **values exist** (`ageAdjusted`, `trajectory`, `currentLevel`, `reliability`, `opportunityQuality`) — **weights are internal constants, not exposed on the object, and do NOT match the mock's 28/25/22/15/10 ordering.** Confirmed against `dynastyScore.js:921-927`: `ageAdjScore*0.28 + trajectoryScore*0.25 + currentLevelScore*0.22 + effectiveReliability*0.10 + opportunityScore*0.15` — i.e. **reliability is 10%, opportunityQuality is 15%** (the mock's row order has these two swapped). Also note the formula uses `effectiveReliability` (TD-reliance-penalized, ×0.90 when `isTdReliant`), **not** the raw `components.reliability.value` the object returns (line ~1027) — that field is the *pre-penalty* value. Exposing weights is a `dynastyScore.js` edit → **opus-reviewed**, additive-only (add a `weight` key per sub-object using the *correct* 28/25/22/10/15 mapping above; if displaying reliability's contribution, decide explicitly whether to show `value` or `effectiveReliability` — they can differ — rather than assuming they're the same number). Flagged again in Slice iii. |
| `comps` (closest career comps) | detail "Why next season" | `usePlayerProfile(playerId).comps` + `.projectedPPG` | `findCareerComps`/`compsProjectedPPG` — already built for the *old* `PlayerProfile`, same shape needed here |
| `peers` (rank-this-season rail) | detail right rail | `usePlayerProfile(playerId).positionPeers` | already top-5-by-position; mock's highlight-your-row styling is new CSS, not new data |
| `owner` / `mine` | Market OWNER, Portfolio filters | `row.ownerTeamName` compared to `myTeamName` (already passed into `PlayersSurface` today) | |
| `riskLabel`/`riskN` | Market RISK, detail Floor risk | derive from `sd` (or `row.dynastyScore.signals.durabilityScore`) — **needs a threshold decision**, not existing as a labelled field. Flag in Slice iv/v, not a blocker. |
| `horizon` (Appreciating/Peak/Depreciating) | Portfolio HORIZON pill | derive from age + position — the mock's own legend defines the bands (`≤25` appreciating, `26–28` peak, `29+` depreciating), and `row.age` exists. **Position-blind bands are wrong** (a 29-year-old QB is not a 29-year-old RB), so either apply the mock's bands verbatim as a v1 and mark it, or derive from `interpolateAgeCurve`'s per-position curve slope. Recommend the latter — it's a `src/utils/ageCurve.js` read, no edit, and it's the honest version. Either way it is **`PROVISIONAL(heuristic)`** until reviewed (§2.4). |

### 2.2 Gated / degrades gracefully — real, but currently empty

| Mock field | Screen | Live source | Status |
|---|---|---|---|
| `mk30` / `mk30dir` (30-day value Δ) | Portfolio 30D, Market (implied) | `ktcHistory.computeKtcRecentDelta(series)` | **Function is correct and already used by the Explorer's KTC Δ cell** (per `sleeper-value-tab-enrichment-planned` memory), but the upstream KTC snapshot series is currently sparse/broken (`ktcHist` `inProgress` contract bug — tracked in the roadmap as a Tier-0 fix, not part of this plan). **1b's 30D column will render `—`/muted for most players until that upstream fix lands.** This is expected, not a bug in 1b's code — build the column to degrade gracefully (it already does; `computeKtcRecentDelta` returns `null` on <2 series points) and move on. |

### 2.3 Does not exist — needs a deliberate, scoped-down substitute

| Mock content | Screen | Why it doesn't map | Recommendation |
|---|---|---|---|
| "Needs a decision" alerts (3 hand-written cards: Sell-high Barkley, Buy-low Nabers, RB concentration risk) | Portfolio | These are **hand-authored copy** in the mock, not a general decision engine — that engine is `Board`'s prerequisite (marginal-value engine + phase classifier) and explicitly gated/not-yet-built. | Ship a **minimal heuristic**, clearly scoped as representative: (1) biggest `divergenceSignal === 'overvalued'` among rows the user owns with `dynastyScore.label` in a late-career bucket → SELL HIGH; (2) biggest `divergenceSignal === 'undervalued'` among **not**-owned rows → BUY LOW; (3) largest single-position share of owned roster value (age ≥ 29) → RISK. This is *not* the decision engine — say so in a code comment only if the distinction would otherwise mislead a future reader (CLAUDE.md's `Board` gate is the real thing; this is a v1 stand-in). |
| Market filter panel's **Dynasty label / Risk / Min projected games / saved presets** | Market | Filter *UI* doesn't exist yet, but the underlying fields (`dynastyScore.label`, age, `ktcValue`, `divergenceSignal`, ownership) all already exist on rows. | Build new filter UI against existing fields. **Reuse opportunity:** the current `FilterSidebar` (`PlayersTab.jsx:1614`) already has age/value range sliders and a **preset save/apply/delete** mechanism (`presets`, `onSavePreset`, `onApplyPreset`, `onDeletePreset`) — re-skin, don't reinvent, in Slice iv. |
| **`call`** — Holdings table's CALL column (`Hold` / `Buy` / `Sell` / `Sell high` / `Cut bait`) | Portfolio | **This is decision-engine output.** Confirmed hand-authored in the prototype: the `P` array carries a literal `call:` string per player (`.dc.html` lines ~536–578) and nothing derives it — `callFg` (line ~866) only picks a colour from the already-authored string. The marginal-value engine + phase classifier that would produce a real call is exactly what gates `Board`/`Trade` today. | **Do not ship a fabricated per-player verdict.** Two acceptable options, decide in Slice iii: (a) **omit the CALL column** until the engine exists — the honest default, and the table still works; (b) render it from the same minimal heuristic as the alerts above (overvalued+old → Sell high, undervalued+not-owned → Buy, else Hold), marked `PROVISIONAL(heuristic)` and visually distinguished so it doesn't read as a model verdict. **Recommend (a)** — a wrong-but-confident "Cut bait" next to a player's name is worse than a missing column, and (b) reduces to "restating `divergenceSignal` in verb form," which the VS MARKET pill already says without pretending to be advice. |
| Portfolio header's **"contending window open"** and the **30 days / Season / All time** segmented control | Portfolio | "Contending window" is season-phase/posture classification — the same gated prerequisite as `Board`. The horizon switch needs a per-horizon roster-value history; the only value series is KTC snapshots, which are currently sparse (§2.2). | Drop the posture clause from the subline (keep "N assets · N rookie picks", both real); ship the segmented control **disabled or omitted** in Slice iii rather than wiring three horizons to one broken series. Both `PROVISIONAL(no-data)`. |
| Tile deltas: Roster value `▲3.2%`, Proj. points `▲4.6%`, `+1,490 in 30 days` | Portfolio | Every one is a **change over time**, which needs a prior snapshot of the same aggregate. The app snapshots projection *inputs* (`projectionSnapshot.js`), not portfolio aggregates, and the KTC series that would back the 30-day figure is the §2.2 gap. | Render the tile **values** (all four are computable from live rows today) and omit the delta line until there's a series behind it. `PROVISIONAL(no-data)`. Do **not** compute a delta against a value snapshotted on first page load — that's a fabricated baseline. |
| Detail pop-up's **"Shop this asset"** primary action | Player detail | There is no trade surface to route to (`/trade` is a gated placeholder). | Ship the button **disabled** with the gate reason as its title, or drop it and keep only "Compare". `PROVISIONAL(no-data)`. Slice ii. |

**Net finding (revised — the original draft of this section undercounted).** The redesign is still
overwhelmingly a restructuring of fields the pipeline already produces, but it is **not** "one gap
plus one heuristic." The audit above now separates three distinct kinds of not-real:

1. **Real field, empty upstream** — 30-day KTC Δ (§2.2). Code is correct; data is missing pending a
   Tier-0 roadmap fix. Degrades to `—` on its own.
2. **No field, we invent one** — Portfolio's alert cards, `riskLabel`, `horizon`. Deliberate,
   scoped-down heuristics standing in for engines that don't exist.
3. **No field, and we should not invent one** — the Holdings `call` verdict, "contending window",
   the three horizon deltas, "Shop this asset". These are decision-engine or time-series outputs;
   the right move is to omit or disable, not to approximate.

The handoff's own framing ("it is the structural change") holds — but shipping category 3 as if it
were real would quietly turn a UI restructure into a fake decision engine, which is the one outcome
this program should not produce.

### 2.4 Marking convention for anything not backed by real data

**Requirement (user, 2026-08-12):** every datapoint the redesign shows that is not populated with
real data must be marked in the source, so it is trivially greppable which surfaces are honest and
which are standing in. Comment-level marking is sufficient — no dev-only UI badge is required.

**The tag.** At every site that renders or derives a not-real value, add a single-line comment:

```js
// PROVISIONAL(<category>): <what is fake> · <why> · <what would make it real>
```

`<category>` is exactly one of:

| Category | Means | Behaviour it implies |
|---|---|---|
| `no-data` | The field is real in principle; the source is empty/missing/gated. | Render `—`/omit. Never substitute a placeholder number. |
| `heuristic` | We invented a scoped-down stand-in for an engine that doesn't exist. | Ship it, but it must not be presented as a model verdict. |
| `mock-copy` | Handoff copy shipped verbatim with no data behind the claim. | Prefer rewording to something true over shipping the sentence. |

Rules:
- **One tag per site**, at the derivation *and* at the render site if they're in different files.
- **`no-data` must never fabricate.** No "reasonable default", no baseline snapshotted at page
  load, no zero-as-if-measured. `—` or absent.
- Tag strings are greppable by design: `grep -rn "PROVISIONAL(" src/` is the inventory, and every
  slice's done-definition includes pasting that grep's output into its hand-back summary.
- When a gap closes, the tag is deleted **in the same change** that wires the real source.

**Seeded index** (fill in as slices land; the `Where` column is the owning slice):

| Item | Category | Where |
|---|---|---|
| 30-day value Δ (`mk30`/`mk30dir`), Portfolio 30D column + any Market equivalent | `no-data` | iii / iv |
| Portfolio "Needs a decision" alert cards | `heuristic` | iii |
| Holdings `HORIZON` pill | `heuristic` | iii |
| Holdings `CALL` column — **recommended omitted entirely** (§2.3) | `heuristic` if shipped | iii |
| Portfolio header "contending window open" | `mock-copy` | iii |
| Portfolio 30 days / Season / All time segmented control | `no-data` | iii |
| Portfolio tile deltas (`▲3.2%`, `▲4.6%`, `+1,490 in 30 days`) | `no-data` | iii |
| Market `RISK` pips + Low/Med/High word (threshold undecided, §5.4) | `heuristic` | iv |
| Detail "Shop this asset" action | `no-data` | ii |
| Detail "Career PPG · projection band" `±3.4` — the mock labels this "SD of per-game points" (historical), but the chart header reads as a *projection* interval. The app has no projection interval. | `mock-copy` | ii |
| Trade desk nav count badge — not shipped at all (§5.6), no tag needed unless someone adds it | — | i |

Note that Slice i introduces **zero** provisional items — its placeholders render no data. The
convention lands in Slice i (documented, tokens in place) so Slices ii–v have one to follow.

---

## 3. Reuse inventory

### 3.0 "Should we just rebuild the UI from scratch?" (asked 2026-08-12)

Worth answering explicitly, because the honest answer is **the plan already does that, for the
parts where it makes sense** — and the parts it doesn't rewrite are the ones where a rewrite would
cost real money.

Split the app in two:

- **The pipeline and the maths** — `App.jsx`'s `playerRows` chain, `src/utils/*` (`dynastyScore`,
  `seasonProjection`, `careerComps`, `teamContext`, …), `src/api/*`. This is ~everything the repo
  is actually worth, it is covered by the invariants in CLAUDE.md and a large test suite, and
  **1b consumes it unchanged** — §7 confirms zero data-shape changes. Rewriting any of this is
  not on the table and 1b never asks to.
- **The presentation** — the JSX that turns those rows into pixels. This is the only layer 1b
  touches, and here the plan is *already* mostly greenfield: `Portfolio`, `Market`, and the
  detail pop-up are **new files written against the design, not ports**. Nothing is being
  "rewritten line by line" into the new look.

So the real question is narrower than it sounds, and it has exactly two live instances:

1. **`App.jsx`'s shell/routing (Slice i).** Incremental, deliberately. It's ~60 lines of route
   table and prop-threading inside a 1073-line file whose other 1000 lines are the pipeline.
   Rewriting the file to rewrite the routes would put the invariant-protected part at risk for no
   gain. **Keep incremental.**
2. **The three Players tabs → one Market table (Slice iv).** This is the genuine
   rewrite-vs-port call, and it is deferred to Slice iv on purpose. The lean there should be
   **rewrite the table, harvest the column definitions** — `usePlayersTable`/`PlayersDataTable`
   were built as shared shells and the per-tab column logic (`outlookPositionStats`,
   `nflStats`, the Explorer's cells) is where the real accumulated knowledge lives. Copy the cell
   derivations, don't try to bend three tab components into one.

**Practical consequence for sequencing: none.** The slice order in §6 already reflects this — Slice
i is small and incremental because it must be; ii/iii are greenfield because they're new surfaces;
iv is the one that needs its own scoping pass before anyone writes code. If Slice iv scopes out
badly, "delete the three tabs and write Market fresh against `playerRowsWithProj`" is a legitimate
plan-B, and it costs nothing extra to decide that at Slice iv rather than now.

### 3.1 What to reuse

Don't rebuild what exists with new visual skin:

| New 1b piece | Existing thing to reuse | File |
|---|---|---|
| Market "VS MARKET" pill, Portfolio VALUE-bar color | `ValueChip`'s `DeltaPill` logic (signal→▲/▼/≈, color, rank tooltip) | `src/components/ui/ValueChip.jsx` |
| Player detail pop-up tab strip + compare matrix | The **existing comparison feature** — `comparisonList` (max-4 array, `LS_COMPARISON` localStorage key), `addToComparison`/`removeFromComparison`/`clearComparison` in `App.jsx`, rendered today by `ComparisonTray` (`PlayersTab.jsx:1392`). 1b's "tabs" are this same concept, merged into the modal instead of a separate tray. **Repurpose the state, retire `ComparisonTray`'s standalone UI** (folded into the pop-up's tab strip). | `App.jsx` state + `PlayersTab.jsx:1392` |
| Player detail pop-up main body (career chart, drivers, comps, peers) | `usePlayerProfile(playerId)` hook — already returns `careerHistory`, `dynastyScore`, `comps`/`projectedPPG`, `positionPeers`, `projection`, `divergenceSignal` | `src/hooks/usePlayerProfile.js` |
| Player detail pop-up mount point | The existing pattern in `PlayersDataTable.jsx:70-84` (backdrop + `ProfileDataContext.Provider` + `PlayerProfile`) — same idea, needs to move **above** the router (App.jsx or a new provider wrapping it) instead of living inside one table | `src/components/players/PlayersDataTable.jsx` |
| Market table's 3 column sets | `OutlookTab.jsx` (Outlook set), `NflStatsTab.jsx` (Production set), `PlayersTab.jsx` Explorer table (Value set) — plus the shared `usePlayersTable` hook and `PlayersDataTable` shell they already use | `src/components/players/*` |
| Portfolio 5-YR PPG bars | `row.careerSparkline` — already exists, already 5-wide | `App.jsx` playerRows pipeline |
| Portfolio/detail "Floor risk"/consistency | `outlookConsistency.computeConsistency` | `src/utils/outlookConsistency.js` |
| Market filter panel sliders/presets | `FilterSidebar` (`PlayersTab.jsx:1614`) — range sliders, checkboxes, preset save/apply/delete already built | `src/components/PlayersTab.jsx` |

**What gets dropped**, per the handoff's explicit repo-mapping notes:
- `SpiderChart.jsx` — not used in the redesign (replaced by the weighted-component bars, which show the weights the radar hid). Confirm zero other consumers before deleting (Slice v).
- Red/green literals (`#22c55e`, `#ef4444`, `#86efac`, `#fecaca`, `LABEL_COLORS` greens) — replaced by the blue/amber pair everywhere they appear in files this redesign rebuilds (Portfolio/Market/pop-up content). **Scope note, revised after plan-review (§4):** the **shared shell** (`TopBar`/`NavRail`/`BottomTabBar`) is explicitly *not* included in this recolor — it keeps its current palette until a dedicated, not-yet-scheduled chrome-recolor slice. Do not do a repo-wide red/green sweep as part of 1b — `League`, `Board`/`Trade` placeholders, the shared shell, and anything else not rebuilt keep their current palette until their own migration.

**What becomes dormant, not deleted** (revised after plan-review — see Slice i §5, §13): only the
component **files** `MyTeamView.jsx`, `PlayerCard.jsx`, `Sparkline.jsx` go dormant (left on disk,
unimported). The `myTeamData`/`myTeamLoading`/`myTeamError` state and its fetch effect in
`App.jsx` do **not** stay — once Slice i removes the `/roster` route, that effect has no remaining
reader and becomes dead code that fails `no-unused-vars` lint, so it's removed in the same slice.
Nothing in `1b` needs weekly-lineup data; the gated **Weekly** primary tab (`WeeklyPlaceholder`)
may want the *components* later, but re-wiring them means writing a new fetch effect at that
point, not resurrecting this one. This is narrower than the original draft of this plan, which
incorrectly proposed keeping the effect alive with no reader.

---

## 4. Design-token strategy

The handoff says "Add these to `src/theme.js`" — but `src/theme.js` is a light
load/persist/apply-class helper, not where color tokens live; **`src/index.css`'s `@theme` block
is the actual color source of truth** per CLAUDE.md. Deviating from the handoff's literal file
name, following the codebase's actual convention.

**Namespacing decision:** the handoff's suggested names (`canvas`, `chrome`, `card`, `border`,
`text`, `up`, `down`, …) collide with tokens that **already exist** (`--color-canvas`,
`--color-border`, `--color-text`, …) at **different hex values**, because those existing tokens
are the *light-default, dark-flippable* ramp that `League`/gated-`Board`/gated-`Trade` still use.
Reusing the bare names would either collide or silently change untouched surfaces.

**Decision: new tokens live in the `--color-dp-*` namespace** (`dp` = this design bundle's own
folder prefix), e.g. `--color-dp-canvas: #0b0c0e`, `--color-dp-up: #4f8bff`, `--color-dp-up-text:
#9dbcff`, etc. — one CSS custom property per row of the handoff's token tables (Surfaces / Borders
/ Text / Signal colours), ~37 total. Tailwind v4's `@theme` block auto-generates matching
utilities (`bg-dp-canvas`, `text-dp-up-text`, `border-dp-border`, …), so new components can use
short-form utility classes (matches `ValueChip.jsx`'s convention) instead of `bg-[var(--color-x)]`
bracket syntax (the older shell-component convention) — prefer the short form in new 1b code.

**Open question — light theme, and where dark-only applies (revised after plan-review — see
§5.1):** the handoff specifies **dark hex values only**, no light equivalents anywhere in the doc.
The original draft of this plan proposed making `--color-dp-*` dark-only and using it for the
**shared chrome** (`TopBar`/`NavRail`) as well as new content. `plan-reviewer` caught the flaw:
`TopBar`/`NavRail` wrap **every** route, including `League`/`Board`/`Trade`, which stay on the
existing light-default/dark-flippable token family. Making the chrome dark-only means a light-mode
user would see a permanently-dark bar and rail wrapped around light-mode League/Board/Trade content
— a half-migrated seam, not a design choice.

**Revised decision, and it mirrors this repo's own precedent:** the original frontend overhaul hit
the identical problem and solved it by keeping new shell chrome on inert, both-themes-defined
tokens until a **dedicated later slice** (`1c`) flipped dark on globally (see
`frontend-1b-router-shell-extraction.md`'s own "Explicitly NOT 1b" list: *"Dark activation + recolor
of carried-forward surfaces → slice 1c... New shell chrome uses 1a tokens (so 1c flips it for
free)"*). Following that:

- **`--color-dp-*` is scoped to new CONTENT only** — Portfolio/Market screen bodies (Slices
  iii/iv) and the player-detail pop-up (Slices ii/v). These are wholesale-new surfaces with no
  light-mode legacy to clash with, so shipping them dark-only is a clean, contained choice (still
  flagged for sign-off below — it's product-visible — but no longer creates a rendering seam).
- **`TopBar`/`NavRail`/`BottomTabBar` (shared chrome) keep their current tokens and current
  light/dark-adaptive behavior in this slice.** Slice i's chrome changes are **structural only**
  (new nav groups, new routes, a search field, a freshness indicator) — zero color/token changes
  to the chrome itself. Recoloring the chrome to match the new dark aesthetic is explicitly
  **not scheduled** by this plan; it's a future decision that needs its own answer to "what
  happens to League/Board/Trade's light mode" first (retire them, give them light equivalents, or
  commit the whole app to dark) — don't presume that answer now.

**Typography:** add `@fontsource-variable/public-sans` (variable weight axis, matches the existing
`@fontsource-variable/inter` root-import pattern — see `src/main.jsx:1`) and
`@fontsource/ibm-plex-mono` — but note the mono package is **not** variable: its root import
(`@fontsource/ibm-plex-mono`) ships **400 only**, so importing just the root would silently
synthesize the 500/600 weights the handoff calls for (numerals, mono micro-labels). Import the
specific weight subpaths instead: `@fontsource/ibm-plex-mono/400.css`,
`@fontsource/ibm-plex-mono/500.css`, `@fontsource/ibm-plex-mono/600.css`. Add
`--font-dp-sans: 'Public Sans Variable', system-ui, sans-serif` and `--font-dp-mono: 'IBM Plex
Mono', monospace` tokens. Do **not** replace `--font-sans` (Inter) — that stays the font for
untouched surfaces.

---

## 5. Open questions needing a decision before/while building

These are genuine product calls, not implementation trivia — flagging rather than guessing.

### 5.1 Light theme for the new surfaces (resolved for chrome, still open for content)
The handoff gives dark hex only. §4 above resolves the risky half of this (shared chrome stays on
the existing adaptive tokens, unchanged, until its own future recolor slice — no seam). **Still
open:** Portfolio/Market/pop-up content itself ships dark-only, ignoring the app's theme toggle
entirely for those screens. Confirm that's acceptable — a user in light mode would see a light
chrome wrapping a dark Portfolio page, which is a smaller, more contained version of the same
seam, deliberately accepted for wholesale-new surfaces rather than derived light equivalents.
**CLAUDE.md flags theming/palette acceptance as user-eyes-only** — this is exactly that kind of
decision, and it deserves a explicit yes/no, not an inferred one.

### 5.2 Command-bar search
The mock shows a search field + `⌘K` keycap, but the Interactions table in the handoff never
specifies search *behavior* (no results dropdown, no keybinding spec). Recommendation: ship as a
visual element only in Slice i (focus affordance at most), real search deferred — the app has no
global search today, and inventing its behavior isn't this redesign's job.

### 5.3 Portfolio's "Needs a decision" alerts
Covered in §2.3 — recommend a minimal, explicitly-scoped heuristic, not a decision engine.
Flagging again here because it's the one place this plan invents product logic rather than
reusing/reskinning something that exists.

### 5.4 Risk label thresholds
`riskLabel`/`riskN` (Low/Med/High) appear in Market and the detail tiles with no defined
Low/Med/High cutoff. Needs a threshold against `sd` (or `dynastyScore.signals.durabilityScore`) —
propose in Slice iv/v against real `sd` distributions, not guessed upfront.

### 5.5 `/roster` retirement
Covered in §3 — recommend keeping the component files (unrouted) but removing the `App.jsx` state
and fetch effect that fed them, since that state has no reader once the route is gone (see Slice
i §5, §13 — this was corrected after plan-review; the first draft incorrectly proposed keeping
the effect alive too). Confirm this reading is what's wanted, since it means Weekly will need a
new fetch effect written when it's eventually unblocked, not a revived old one.

### 5.6 Trade desk's "3" badge
The mock shows a count badge on "Trade desk" (mirrors 2a's badge convention). No real data source
exists (no decision engine, `Trade` is gated). Recommendation: ship the nav item **without** a
count in Slice i; add one only when there's a real number behind it. Don't fabricate.

### 5.7 Mobile / responsive
The handoff is a fixed 1440px desktop mock with no mobile spec. Recommendation: keep
`BottomTabBar` functional (update its item set to match the new primary surfaces — see Slice i),
but don't attempt a from-scratch responsive redesign of Portfolio/Market/the pop-up as part of
1b; use the app's existing responsive patterns (e.g. `overflow-x-auto` table wrappers) as a
floor, not a design goal.

### 5.8 Holdings `CALL` column — omit, or ship a marked heuristic? (new 2026-08-12)
Surfaced by the §2.3 re-audit; the original field inventory had missed this column entirely. The
mock's per-player verdict (`Hold`/`Buy`/`Sell`/`Sell high`/`Cut bait`) is hand-authored mock data
with nothing deriving it, and a real one is decision-engine output — the same prerequisite that
gates `Board`/`Trade`. **Recommendation: omit the column in Slice iii** and revisit when that engine
exists. This is a product call — it removes a column from a design the handoff calls "final,
high-fidelity" — so it needs an explicit yes, not an inferred one. The same question, at lower
stakes, applies to the header's "contending window open" clause, the 30 days / Season / All time
control, the three tile deltas, and "Shop this asset" (all §2.3, all `PROVISIONAL` per §2.4).

---

## 6. Ordered slice list

Mirrors this repo's own precedent (the original frontend overhaul shipped as 1a→1b→1c→1e rather
than one drop). Each slice should get its own `npm test`/`npm run lint`/`npm run build` checkpoint
before the next starts, per CLAUDE.md's done-definition.

1. **Slice i — Foundation: tokens, chrome, nav & routing.** New `--color-dp-*` tokens, fonts,
   command-bar rework (`TopBar`), nav-rail regroup (`NavRail`/`navItems`), new routes
   (`/portfolio`, `/market`), `/roster` retirement, `DEFAULT_ROUTE` flip, `BottomTabBar` item
   update, and the `PROVISIONAL(...)` marking convention (§2.4) documented in CLAUDE.md. Ends with
   **placeholder** Portfolio/Market screens (routing provably works; content is
   Slices iii/iv). **Fully spec'd:**
   [dynasty-portfolio-1b-i-foundation.md](dynasty-portfolio-1b-i-foundation.md).
2. **Slice ii — Player detail pop-up, minimal.** Hoist a detail overlay above the router
   (mountable from anywhere), backed by the *existing* `usePlayerProfile` data + a hoisted
   `ProfileDataContext` provider, with the 1b visual redesign (identity row, 4 tiles, career
   chart, drivers/adjustments panels, right rail) but **single-player only** — no tab strip /
   compare matrix yet, and `comparisonList`/`ComparisonTray` untouched (those are Slice v).
   Sequenced *before* Portfolio/Market content so those slices have a real click-through target
   instead of a stub — with the consequence that **nothing opens the pop-up during Slice ii
   itself**; its acceptance is by test, and visual acceptance lands with Slice iii. **Also absorbs
   the `dynastyScore.js` weight exposure**, which Slice i's notes had deferred to Slice iii —
   wrongly, since the drivers panel this slice builds is the first consumer. **Fully spec'd:**
   [dynasty-portfolio-1b-ii-detail-popup.md](dynasty-portfolio-1b-ii-detail-popup.md).
3. **Slice iii — Portfolio screen.** Header, 4 metric tiles, value-by-age-band chart, "needs a
   decision" alerts (§2.3/§5.3 heuristic), holdings table (filtered `playerRowsWithProj` by
   ownership). Wires into Slice ii's pop-up. Not yet detailed.
4. **Slice iv — Market screen.** Unify Value/Outlook/Production into one table with a
   segmented column-set switch (absorbing `OutlookTab`/`NflStatsTab`/Explorer columns), new
   filter bar + filter panel (reusing `FilterSidebar`'s sliders/presets). Largest single slice —
   likely wants its own sub-slicing once scoped in detail. Not yet detailed.
   **Convergence debts inherited from Slice ii, to settle here** (Slice ii deliberately left
   `/players` unmodified, which duplicated two things):
   - `PlayersTab.jsx:369-373`'s hard-coded component-weight strings (`'28%'`…`'10%'`) retire in
     favour of `dynastyScore.components[*].weight`, which Slice ii exposes.
   - `PlayersTab.jsx:864-881`'s inline signal-badge block converges on
     `src/utils/dynastySignalBadges.js`, the pure helper Slice ii extracts from it.
   - The two `/players` `ProfileDataContext` providers (`PlayersTab.jsx:2243`,
     `PlayersDataTable.jsx:72`) retire in favour of Slice ii's App-level one.
   - §5.4's risk-label thresholds are decided here — Slice ii ships `±sd` with no Low/Med/High
     word precisely because this slice owns that decision.
5. **Slice v — Player detail pop-up, full.** Tab strip (multi-open), compare matrix (≥2 tabs),
   "+ Add player to compare" search dropdown — upgrading Slice ii to the full spec. Retire
   `ComparisonTray`'s standalone UI once its state is fully absorbed here. Confirm `SpiderChart.jsx`
   has zero remaining consumers before deleting. Not yet detailed.

**Why this order:** ii before iii/iv so Portfolio/Market don't ship with a dead click target;
iii before iv because Portfolio is materially smaller (no 3-way tab merge) and exercises the new
chrome/tokens end-to-end sooner; v last because it's additive on top of ii and depends on both
surfaces existing as real entry points to be worth compare-testing.

---

## 7. Cross-repo impact

**None.** Every field in §2.1/§2.2 is already computed/served by the app today (or, for the 30-day
delta, already has a correct client-side function waiting on an upstream fix that's tracked
separately). This plan adds no new `sleeper-dashboard-data` dependency and changes no served
shape. State this in each slice's summary anyway, per CLAUDE.md's cross-repo-contract rule — "none"
is worth confirming explicitly, not assuming.

---

## 8. Tests strategy (program-level; specifics per slice)

- Token/CSS additions: no test (non-behavioral), but `npm run build` must stay clean.
- Routing changes (Slice i): a smoke test that `/roster` redirects to `/portfolio`, `DEFAULT_ROUTE`
  resolves, and gated placeholders still render under their new nav labels.
- Any heuristic that picks Portfolio's alerts (Slice iii) needs unit coverage — it's new logic,
  not a reskin, so it gets the same test bar as any other new behavior per CLAUDE.md's
  done-definition.
- Market's column-set unification (Slice iv) should reuse whatever tests already cover
  `OutlookTab`/`NflStatsTab`/Explorer column rendering rather than duplicating them from scratch —
  check existing `__tests__` coverage before writing new suites.
- Compare-matrix "winner" coloring (Slice v) needs unit coverage per metric direction (higher-is-
  better vs lower-is-better vs directionless), mirroring the mock's `good(p)` logic.
- **`PROVISIONAL(no-data)` sites need a null-path test** (§2.4): assert the cell renders `—`/absent
  when the source is empty, since "empty upstream" is the *normal* state for several of them and a
  fabricated fallback is the specific failure this convention exists to prevent. `heuristic` sites
  get ordinary unit coverage of the heuristic; `mock-copy` sites need none (non-behavioural).

---

## 9. Docs updates this program implies

Deferred to the slice that lands the relevant change (not done now, since no source has moved
yet):
- `CLAUDE.md` navigation map: routing table, nav-shell description, `src/components/` table
  (new/moved/retired files), color-tokens note (new `--color-dp-*` family), and the
  `PROVISIONAL(...)` convention (§2.4) — that one belongs under *Patterns* or *Invariants*, since
  it's a standing rule for every subsequent slice, not a one-off note. Lands in Slice i.
- `docs/architecture.md`: `leagueData`/state-management sections if `comparisonList`'s role
  changes (Slice v) or new App-level pop-up state is introduced (Slice ii).
- `docs/design_handoff_dynasty_portfolio/README.md` itself is a handoff artifact, not living
  documentation — leave it as-is (historical record of what was asked for), don't edit it to
  match what actually got built.
