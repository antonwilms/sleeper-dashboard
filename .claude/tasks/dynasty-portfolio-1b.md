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

**Revision 3 (2026-08-12) — Slices i and ii are shipped, and the remaining order changed.**
Slice i (`e39ad20`) and Slice ii (`21cb6bb`) are committed and green. Two standing product
directives from the user then reshaped everything after them:
- **§4a (new)** — the two directives, in full: *showing player data outranks computing verdicts
  about it*, and *omit rather than approximate; iterate rather than guess*. Read §4a before
  scoping any remaining slice; it overrides the design's own emphasis where they conflict.
- **§6 resequenced — Market now precedes Portfolio**, and the two slices swapped numerals
  (iii = Market, iv = Portfolio). Market is the data-display surface the first directive points
  at, and it gives Slice ii's pop-up ~600 rows to open from instead of ~14. **Market v1 is scoped
  to the table only** — no filter bar, no filter panel, no saved presets.
- **§2.4 index rewritten** to name surfaces instead of numerals, and to mark as **CUT** the five
  design elements the second directive removes (Portfolio's alert cards, the Holdings `CALL`
  column, the header posture clause, the horizon control, the tile deltas). This closes §5.3 and
  §5.8 outright.
- **§2.1's weights row corrected.** It claimed the mock's component weights contradicted the live
  formula; they do not — only the row order differs. That error originated here and propagated
  into the Slice ii task file before being caught in review.

A further `plan-reviewer` pass is worth doing after these edits. Note the §5 open questions are
now mostly closed by §4a.2 rather than answered — "leave it out" is the standing default.

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
| `components` (5 weighted score drivers) | detail "What drives the score" | `row.dynastyScore.components` | **RESOLVED — shipped in Slice ii** (commit `21cb6bb`). `components[*]` now carries a `weight` key (0.28/0.25/0.22/0.10/0.15), read from the object by the detail modal's drivers panel. **Correction to this row's original claim:** it said the weights "do NOT match the mock's 28/25/22/15/10 ordering" and that the mock "swapped" reliability and opportunity. **That was wrong** — the mock labels Opportunity **15%** and Reliability **10%** (`.dc.html:1447-1448`, `:1784-1785`), identical to the formula; only the *row order* differs (the mock lists Opportunity above Reliability), and `PlayersTab.jsx:369-373` already shipped that order with correct labels. There was never a conflict to reconcile. Still true and still load-bearing: the composite uses `effectiveReliability` (TD-reliance-penalized, ×0.90 when `isTdReliant`, `dynastyScore.js:916-918`), **not** the `components.reliability.value` the object returns (`:1027`) — so `value × weight` does not reconcile against the score for TD-reliant players. Slice ii displays the pre-penalty `value` and carries a source comment saying so. |
| `comps` (closest career comps) | detail "Why next season" | `usePlayerProfile(playerId).comps` + `.projectedPPG` | `findCareerComps`/`compsProjectedPPG` — already built for the *old* `PlayerProfile`, same shape needed here |
| `peers` (rank-this-season rail) | detail right rail | `usePlayerProfile(playerId).positionPeers` | already top-5-by-position; mock's highlight-your-row styling is new CSS, not new data |
| `owner` / `mine` | Market OWNER, Portfolio filters | `row.ownerTeamName` compared to `myTeamName` (already passed into `PlayersSurface` today) | |
| `riskLabel`/`riskN` | Market RISK, detail Floor risk | derive from `sd` (or `row.dynastyScore.signals.durabilityScore`) — **needs a threshold decision**, not existing as a labelled field. Decided in the **Market slice** (§6). Per §4a.2, omitting the Low/Med/High word is a valid answer — Slice ii already ships `±sd` with no label. |
| `horizon` (Appreciating/Peak/Depreciating) | Portfolio HORIZON pill | **RESOLVED — shipped in Slice iv.** Position-blind bands are wrong (a 29-year-old QB is not a 29-year-old RB), so the pill reads `row.dynastyScore.signals.yearsFromPeak` — a quantity the pipeline already computes per-position (`dynastyScore.js`, with a `derivePeakAge` fallback), not re-derived in the component. **Correction to this row's original recommendation:** it proposed a component-local `age`/`position` read via `interpolateAgeCurve` or `ageCurve.js`; that would have been a second source of truth against the pipeline's own `yearsFromPeak`, which already exists and already has the fallback the prop-only version would have lacked. **Not `PROVISIONAL(heuristic)`** — the quantity is pipeline-computed from measured curves; the only judgment is the ±2-year display boundary over an already-real number. See the task file's §5.1. |

### 2.2 Gated / degrades gracefully — real, but currently empty

| Mock field | Screen | Live source | Status |
|---|---|---|---|
| `mk30` / `mk30dir` (30-day value Δ) | Portfolio 30D, Market (implied) | `ktcHistory.computeKtcRecentDelta(series)` | **Function is correct and already used by the Explorer's KTC Δ cell** (per `sleeper-value-tab-enrichment-planned` memory), but the upstream KTC snapshot series is currently sparse/broken (`ktcHist` `inProgress` contract bug — tracked in the roadmap as a Tier-0 fix, not part of this plan). **1b's 30D column will render `—`/muted for most players until that upstream fix lands.** This is expected, not a bug in 1b's code — build the column to degrade gracefully (it already does; `computeKtcRecentDelta` returns `null` on <2 series points) and move on. |

### 2.3 Does not exist — needs a deliberate, scoped-down substitute

| Mock content | Screen | Why it doesn't map | Recommendation |
|---|---|---|---|
| "Needs a decision" alerts (3 hand-written cards: Sell-high Barkley, Buy-low Nabers, RB concentration risk) | Portfolio | These are **hand-authored copy** in the mock, not a general decision engine — that engine is `Board`'s prerequisite (marginal-value engine + phase classifier) and explicitly gated/not-yet-built. | Ship a **minimal heuristic**, clearly scoped as representative: (1) biggest `divergenceSignal === 'overvalued'` among rows the user owns with `dynastyScore.label` in a late-career bucket → SELL HIGH; (2) biggest `divergenceSignal === 'undervalued'` among **not**-owned rows → BUY LOW; (3) largest single-position share of owned roster value (age ≥ 29) → RISK. This is *not* the decision engine — say so in a code comment only if the distinction would otherwise mislead a future reader (CLAUDE.md's `Board` gate is the real thing; this is a v1 stand-in). |
| Market filter panel's **Dynasty label / Risk / Min projected games / saved presets** | Market | Filter *UI* doesn't exist yet, but the underlying fields (`dynastyScore.label`, age, `ktcValue`, `divergenceSignal`, ownership) all already exist on rows. | Build new filter UI against existing fields. **Reuse opportunity:** the current `FilterSidebar` (`PlayersTab.jsx:1614`) already has age/value range sliders and a **preset save/apply/delete** mechanism (`presets`, `onSavePreset`, `onApplyPreset`, `onDeletePreset`) — re-skin, don't reinvent — but **deferred out of Market v1** per §4a.2 (§6). Applies whenever the filter UI is actually built. |
| **`call`** — Holdings table's CALL column (`Hold` / `Buy` / `Sell` / `Sell high` / `Cut bait`) | Portfolio | **This is decision-engine output.** Confirmed hand-authored in the prototype: the `P` array carries a literal `call:` string per player (`.dc.html` lines ~536–578) and nothing derives it — `callFg` (line ~866) only picks a colour from the already-authored string. The marginal-value engine + phase classifier that would produce a real call is exactly what gates `Board`/`Trade` today. | **CUT per §4a.2 — the column is not built** (closes §5.8). The reasoning, kept for the record; two options were on the table: (a) **omit the CALL column** until the engine exists — the honest default, and the table still works; (b) render it from the same minimal heuristic as the alerts above (overvalued+old → Sell high, undervalued+not-owned → Buy, else Hold), marked `PROVISIONAL(heuristic)` and visually distinguished so it doesn't read as a model verdict. **Recommend (a)** — a wrong-but-confident "Cut bait" next to a player's name is worse than a missing column, and (b) reduces to "restating `divergenceSignal` in verb form," which the VS MARKET pill already says without pretending to be advice. |
| Portfolio header's **"contending window open"** and the **30 days / Season / All time** segmented control | Portfolio | "Contending window" is season-phase/posture classification — the same gated prerequisite as `Board`. The horizon switch needs a per-horizon roster-value history; the only value series is KTC snapshots, which are currently sparse (§2.2). | Drop the posture clause from the subline (keep "N assets · N rookie picks", both real); **both CUT per §4a.2** — the posture clause is dropped from the subline (keeping "N assets · N rookie picks", both real) and the segmented control is not built. |
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
**Numbering note:** slices iii and iv **swapped surfaces** on 2026-08-12 (§6) — iii is now
**Market**, iv is now **Portfolio**. This table names surfaces rather than numerals to stay
correct; older prose elsewhere in this file that says "Slice iii/iv" means the surface it was
describing at the time, not the numeral.

| 30-day value Δ (`mk30`/`mk30dir`) — Portfolio 30D column, Market equivalent | `no-data` | Market + Portfolio slices · **precedent already set** on the detail modal's Market-value tile (Slice ii) |
| Market `RISK` pips + Low/Med/High word (threshold undecided, §5.4) | `heuristic` | Market slice — **§4a.2 makes "omit the label" a valid answer**, as Slice ii already did |
| ~~Holdings `HORIZON` pill~~ | — | **RESOLVED, not provisional** — Slice iv reads `row.dynastyScore.signals.yearsFromPeak` (pipeline-computed) rather than shipping a heuristic; see §2.1's row and the Slice iv task file §5.1 |
| ~~Portfolio "Needs a decision" alert cards~~ | — | **CUT** per §4a.2 — not built |
| ~~Holdings `CALL` column~~ | — | **CUT** per §4a.2, closing §5.8 |
| ~~Portfolio header "contending window open"~~ | — | **CUT** per §4a.2 |
| ~~Portfolio 30 days / Season / All time control~~ | — | **CUT** per §4a.2 |
| ~~Portfolio tile deltas (`▲3.2%`, `▲4.6%`, `+1,490 in 30 days`)~~ | — | **CUT** per §4a.2 — tile *values* still ship, all four are real |
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
2. **The three Players tabs → one Market table (the Market slice — now §6's slice iii).** This is
   the genuine rewrite-vs-port call. The lean there should be
   **rewrite the table, harvest the column definitions** — `usePlayersTable`/`PlayersDataTable`
   were built as shared shells and the per-tab column logic (`outlookPositionStats`,
   `nflStats`, the Explorer's cells) is where the real accumulated knowledge lives. Copy the cell
   derivations, don't try to bend three tab components into one.

**Practical consequence for sequencing: none.** The slice order in §6 already reflects this — Slice
i is small and incremental because it must be; ii/iii are greenfield because they're new surfaces;
the Market slice is the one that needs its own scoping pass before anyone writes code. If it scopes out
badly, "delete the three tabs and write Market fresh against `playerRowsWithProj`" is a legitimate
plan-B, and it costs nothing extra to decide that when scoping that slice rather than now.

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

## 4a. Standing product priorities (user, 2026-08-12) — read before scoping any slice

Two directives that override the design's own emphasis wherever they conflict. They were given
after Slices i–ii landed and they reshaped §6's order; they apply to every remaining slice.

### 4a.1 Showing player data beats computing verdicts about it

> *"the first prio is to visualise (or just show) all kinds of data for the nfl players. having
> computed scores and rankings is secondary to that."*

The `1b` design leads with the opposite emphasis — Portfolio's tiles are portfolio aggregates,
Market's default sort is dynasty score, the pop-up opens on a score and its drivers. **Build the
design, but when a slice offers a choice between surfacing more real player data and surfacing
another derived verdict, take the data.** Concretely this is why §6 now runs Market before
Portfolio.

Worth knowing while scoping: this app ingests more than it shows. **Two whole families currently
have zero UI consumers** — `teamContext` (pbp-derived PROE / pace / red-zone / defense-faced,
backfilled 2012–2025; `loadTeamContext` appears nowhere outside its own file) and `nflGameLogs`
(per-game rows; `NflStatsTab`'s game log is built from `careerStats.weeklyPoints` + schedule, not
from this family). `advStats`, `collegeStats` and `nflSchedule` each reach exactly one consumer,
buried inside the profile panel.

**Decided 2026-08-12: stay inside the design first.** Market v1 ships the three column sets the
mock specifies, sourced from data already displayed somewhere in the app. Surfacing the dark
families is a **separate, later slice** — not a widening of Market v1 — because it needs new column
decisions the handoff does not make. Recorded here so it is not forgotten: it is the most direct
expression of §4a.1 and should be scheduled once the Market shell is proven.

### 4a.2 Omit rather than approximate; iterate rather than guess

> *"i would suggest to rather leave things out to have a clean first version of the new UI.
> anything that i feel that is missing then i will reiterate over then."*

This settles, in one stroke, most of §5's open questions and most of §2.4's `heuristic` entries:
**when a design element has no real data behind it, leave it out of v1.** Do not ship a
scoped-down heuristic to fill the hole, do not approximate, do not fabricate a baseline. A missing
column invites a specific request; a plausible-looking wrong one does not.

Consequences, applied in §6:
- Holdings `CALL` column — **omitted** (this closes §5.8).
- Portfolio's "needs a decision" alerts — **omitted** from v1 (this closes §5.3; the §2.3
  heuristic is not built).
- Portfolio tile deltas, the 30-day/Season/All-time control, "contending window open" — **omitted**.
- Risk Low/Med/High label — **omitted** until thresholds exist (§5.4), as Slice ii already did.
- Market filter bar, filter panel and saved presets — **deferred out of Market v1** (§6).

`PROVISIONAL(no-data)` and `PROVISIONAL(mock-copy)` tags still apply to things that ship in a
degraded state (a tile that renders `—`, reworded copy). `PROVISIONAL(heuristic)` should now be
rare-to-absent: under this directive an invented heuristic is usually just cut instead.

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
propose in the **Market slice** against real `sd` distributions, not guessed upfront — and per §4a.2, omitting the label entirely is the default answer unless a threshold is genuinely defensible.

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
gates `Board`/`Trade`. **DECIDED 2026-08-12 (§4a.2): the column is omitted.** Revisit when that engine
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
3. **Slice iii — Market screen, v1 (table only).** *Resequenced ahead of Portfolio on 2026-08-12
   per §4a.1 — Market is the data-display surface, Portfolio is mostly derived aggregates.* One
   table over `playerRowsWithProj` with a segmented **Value / Outlook / Production** column-set
   switch (absorbing the Explorer / `OutlookTab` / `NflStatsTab` column definitions), position
   pills, sort, pagination, and **row click → Slice ii's pop-up**. Not yet detailed.

   **Deliberately out of v1, per §4a.2** — add on reiteration once the shell is proven, not now:
   the filter bar, the expandable filter panel (sliders/checkboxes), and saved presets. §2.3's
   `FilterSidebar` reuse note still applies whenever those land.

   **This is the slice that first makes the redesign visible.** Slices i–ii shipped chrome and an
   unreachable modal; this one gives both a real surface and a real entry point.

   **Owed from Slice ii — do this in the same change that adds the first caller:**
   `App.jsx:158-159` carries a bare `// eslint-disable-next-line no-unused-vars` above
   `openPlayerDetail`, because Slice ii defined the callback while deliberately shipping no
   consumer (Slice ii §1.2 vs §1.4 — a genuine conflict in that task file, patched rather than
   resolved). **Delete that disable comment** as soon as a Market row calls `openPlayerDetail`;
   the moment it has a caller the suppression is not just unnecessary but actively harmful, since
   it would silently hide any *future* unused variable declared on that line. Verify with
   `npm run lint` after wiring the row handler — if it passes without the disable, the debt is
   closed. **Check this first when scoping**, not as end-of-slice cleanup.

   **Convergence debts inherited from Slice ii** (which deliberately left `/players` unmodified,
   duplicating three things). Settle whichever this slice's absorption actually reaches — Market
   v1 may not retire `/players` outright, so carry forward anything it doesn't:
   - `PlayersTab.jsx:369-373`'s hard-coded weight strings (`'28%'`…`'10%'`) retire in favour of
     `dynastyScore.components[*].weight`, exposed in Slice ii. A source comment already sits at
     that line; **it says "Slice iv" and now means this slice** — correct the numeral in passing.
   - `PlayersTab.jsx:864-881`'s inline signal-badge block converges on
     `src/utils/dynastySignalBadges.js`, the pure helper Slice ii extracted from it.
   - The two `/players` `ProfileDataContext` providers (`PlayersTab.jsx:2243`,
     `PlayersDataTable.jsx:72`) retire in favour of Slice ii's App-level one.

   **§5.4's risk-label thresholds are this slice's call** — Slice ii ships `±sd` with no
   Low/Med/High word precisely because this slice owns the decision. Per §4a.2, "omit the label"
   remains a valid answer.

   **Landed (2026-08-14).** Shipped the three column sets, all §3.4a sort mechanics (`setSortState`
   added to `usePlayersTable`, per-active-set `defaultSort`, mount-time `SORTABLE_KEYS`
   validation), and row click/keyboard → `openPlayerDetail`. `±sd` shipped with no Low/Med/High
   word, closing §5.4 for this slice as "omit" (no new open question). **The eslint-disable debt
   is closed** — deleted the same change Market started calling `openPlayerDetail`. **The three
   convergence debts above did NOT settle here**, per the plan's own "carry forward" clause — `/players`
   stays behaviourally frozen (only the two `export` keywords + the stale-numeral comment fix
   landed there). They now belong to whichever slice actually retires `/players`; see CLAUDE.md's
   `/players` routing note for the live list. Zero new `PROVISIONAL` sites — the KTC Δ cell and the
   risk-label word were both omitted outright per §4a.2, not shipped degraded.
4. **Slice iv — Portfolio screen, thinned.** Header, the four metric tiles, value-by-age-band
   chart, holdings table (filtered `playerRowsWithProj` by ownership), rows opening the pop-up.
   Not yet detailed.

   **Cut from the design per §4a.2, decided 2026-08-12 — do not build these:** the "needs a
   decision" alert cards (closes §5.3 — the §2.3 heuristic is not built), the Holdings `CALL`
   column (closes §5.8), the three tile deltas, the 30-days/Season/All-time segmented control, and
   the header's "contending window open" clause. What remains is all real: roster value, weighted
   age, concentration and projected points are each computable from live rows today.

   Follow Slice ii's `PROVISIONAL` precedent for the 30-day KTC Δ — already tagged
   `PROVISIONAL(no-data)` on the detail modal's Market-value tile, and Portfolio's 30D column is
   the same figure from the same broken series. Don't invent a second convention.

   **Landed (2026-08-14).** Shipped header/tiles/chart/holdings table, all reading `ownerTeamName
   === myTeamName` rows derived once and shared across sections. **The 30D column ended up cut
   entirely, not tagged** — by the time this slice landed, Slice iii had already established the
   sharper precedent that a *whole column* with no populatable data gets cut, while a *tile* that
   ships with one missing sub-value gets a `PROVISIONAL` tag (Slice ii). Superseding this entry's
   own "follow Slice ii's precedent" instruction above, which predates Slice iii. **HORIZON
   shipped as a real pipeline read, not a heuristic** — see the §2.1/§2.4 corrections. **The
   "· N rookie picks" subline clause was cut for a capability gap, not a §4a.2 call**: the app
   never loads Sleeper's traded-picks endpoint, so there is no representation of unused/future
   rookie picks as tradeable assets. Closing this gap — if wanted later — needs that endpoint
   loaded and a new `rosterTeams`-shaped field for it; nothing in this slice built toward it.
   Zero new `PROVISIONAL` sites — grep still returns exactly Slice ii's three. Market's
   presentational cells (`CareerBars`/`PlayerCell`/`ClickableRow`/`DeltaCell`/`SortTh`) moved to
   `dp/cells.jsx` so Portfolio could import rather than fork them; `Market.test.jsx` passed
   unedited after the move. `DEFAULT_ROUTE` stayed `/market` — reclaiming it for Portfolio was
   left as an explicit product call, not decided by this slice.
5. **Slice v — Player detail pop-up, full.** Tab strip (multi-open), compare matrix (≥2 tabs),
   "+ Add player to compare" search dropdown — upgrading Slice ii to the full spec. Retire
   `ComparisonTray`'s standalone UI once its state is fully absorbed here. Confirm `SpiderChart.jsx`
   has zero remaining consumers before deleting. Not yet detailed.

**Why this order** (revised 2026-08-12 — Market and Portfolio swapped): ii before both so neither
surface ships with a dead click target. **Market before Portfolio** because §4a.1 makes showing
player data the first priority and Market *is* that surface, while Portfolio is largely derived
aggregates — and because Market gives the Slice ii pop-up ~600 rows to open from instead of ~14,
which exercises it far harder. The original rationale for the opposite order was that Portfolio is
smaller; §4a.2's cuts to Portfolio and the deferral of Market's filter UI substantially close that
gap, and size is the weaker argument against priority. v stays last: additive on top of ii, and
worth compare-testing only once both surfaces exist as real entry points.

**Also unscheduled but recorded** (§4a.1): a slice whose job is surfacing the ingested families
that currently have **no UI at all** — `teamContext` and `nflGameLogs` — plus lifting `advStats` /
`collegeStats` / `nflSchedule` out of the single buried consumer each has today. This is the most
direct expression of the stated priority, but it sits outside the `1b` handoff (the design makes no
column decisions for it), so it waits until the Market shell is proven.

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
- ~~Portfolio's alert heuristic needs unit coverage~~ — **moot: the alerts are CUT** (§4a.2). The
  general rule stands for any heuristic that does ship: new logic gets the same test bar as any
  other new behaviour per CLAUDE.md's done-definition.
- Market's column-set unification (§6's slice iii) should reuse whatever tests already cover
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
