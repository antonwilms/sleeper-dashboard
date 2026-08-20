# Dynasty Portfolio v2 — Master Plan (program-level)

**Status:** planning-only artifact. No source was edited to produce this and none may be edited by
it. Per [CLAUDE.md → Workflow convention](../../CLAUDE.md#workflow-convention) this is a cross-file
structural program spanning `App.jsx` + three unwired loaders + a new route group + a component
library — **opus** class work by the model-routing table. Authored in an opus session 2026-08-18.

**Baseline:** app `728c5f6` · data `f0c1fc4`. Successor program to
[`dynasty-portfolio-1b.md`](dynasty-portfolio-1b.md), which shipped as Slices i–viii
(2026-08-10 → 2026-08-16) and is complete.

**Design source (final, signed off).** Claude Design project `App design overhaul`
(`e4ed4731-0d72-4e11-9da7-50bc2a2bc362`), file `App v2 - dark data.dc.html` — blocks `4a` player
pop-up, `4b` the four cross-cutting systems, `4c` Market, `5a` Teams index, `5b` Team detail,
`5c` Portfolio extensions. Spec: `design_handoff_dynasty_portfolio/README-round4-dark-data.md`.
Reachable via the `DesignSync` MCP; **read it from there, not from a local copy** — nothing in this
repo mirrors it yet.

**Brief and reviews** (all in `docs/design_brief_v2/`): `README.md` is the input brief;
`01-data-inventory.md` is the verified field-level coverage substrate — **read it before deciding
any element is real**; `04-reconciliation.md` merges the two research passes;
`05-round4-review.md` and `06-round5-review.md` are the three review rounds, and
`06-round5-review.md` **§6 + §5** are load-bearing: they enumerate design decisions that must
survive implementation. `docs/design_target_state.md` is the companion Cowork plan, stronger on
per-element field citations.

---

## 1. What this program is

1b restructured the IA. **v2 fills it with the data the app already holds and never shows.**

| Family | State at `728c5f6` | After v2 |
|---|---|---|
| `teamContext` (PROE/pace/EPA/RZ, 2012–2025, **zero nulls**) | `loadTeamContext` has **zero call sites** | Teams index, Team detail, pop-up Environment, Market environment filters |
| `nflGameLogs` (per-game, 2012–2025) | `loadNflGameLogs` has **zero call sites** | pop-up Game log + Usage & efficiency, Market Efficiency set |
| `nflSchedule` (1999–2026, lines/roof/weather) | `loadNflSchedule` has **zero call sites** | pop-up Game log context block |
| `advStats` | loaded into `App.jsx`, **no renderer** | (superseded — gamelogs carries the same fields per game) |
| enrichment overlay | loaded into `App.jsx`, **no renderer** | coaching in Team detail |
| `ktcHist*` signals | computed, **nothing rendered** | `TrendCell` everywhere, market-value tile |
| `usePlayerProfile` | 35 keys returned, 12 destructured, **23 dark** | depth chart + share history reach the pop-up |

**Three loaders that have never been called** is the headline. Each already has a cache, a sparsity
gate and passing unit tests — this is a wiring-and-rendering program, not an ingestion one.

---

## 2. Pre-flight decisions — ALL RESOLVED (Anton, 2026-08-18)

### 2.1 The light theme is retired — the app is dark-only
> *"i dont mind if the app only supports dark theme for now."*

This is the strongest of the three options that were on the table, and it is also the **cheapest**,
for a reason worth stating precisely: `loadStoredTheme` is **already default-dark**, so forcing
`.dark` permanently renders the app exactly as the default user has always seen it. Every surface
Anton has smoke-tested through 1b was in this state. **No recoloring is required and nothing
regresses** — the change only removes the ability to opt *into* light.

Token facts, verified against `src/index.css` (they matter for Slice 0 and they contradict the docs):
- All **69 `--c-*` primitives** carry `.dark` overrides.
- **29** semantic `--color-*` tokens carry `.dark` overrides — the ground/chrome/text family
  (`canvas`, `surface`×5, `border`×3, `text`×8, `on-accent`, `scrim`, `tooltip`×2, `toast`×2,
  `phase`×3, `chart`×3).
- **35** semantic `--color-*` tokens carry **none**, deliberately — `accent-*`, `positive`/`negative`/
  `warning`/`caution`, `market-*`, `confidence-*`, `conf-dot-*`, `compare-*`, `sparkline`,
  `chart-above`/`below`/`recent`. Slice 1e verified these AA on both grounds. **`docs/ui.md`'s claim
  that the `.dark` block "contains dark-mode overrides for every token" is false** — see §7.

The `--color-dp-*` family (39 tokens, dark-only by design) needs no change at all: the distinction it
was invented to manage no longer exists after this slice, but the tokens remain valid and every
component consuming them is unaffected. **Do not attempt to merge the two families** — that is a
cosmetic refactor with real regression risk and zero user-visible benefit.

**Consequence worth taking:** 1b Slice vii dropped `CeilingFloorCell`'s tier-coloured rank badge
*solely* because its raw `--c-*` primitives follow the toggle while Market forces dark, so the badge
would render light-mode colours against a dark row whenever the toggle was off. With the toggle gone
that mismatch is impossible, and **the badge can be restored.** Scheduled as an optional extra in
Slice 5, not a requirement.

→ **New Slice 0** below. It goes first: every subsequent slice otherwise has to keep making a
"which token family, and does it need a `.dark` value" decision that no longer has a reason to exist.

### 2.2 `DEFAULT_ROUTE` stays `/market` — and is now settled, not temporary
> *"market sounds good."*

No code change. The value has carried a "temporary — re-evaluate when Portfolio ships real content"
note since 1b Slice iii; Portfolio has shipped and this is the answer. **Slice 0 deletes that note**
so a future reader does not re-open a closed question. Note the consequence for Slice 7: Portfolio
gains picks and a changed headline total while remaining one click from the landing surface rather
than on it.

### 2.3 Untraded picks price at **Mid**, with the Early–Late range in the definition popover
*(delegated to me; decided here.)*

KTC prices Early / Mid / Late separately and a future pick's tier depends on a finish nobody knows
yet. Verified: 36 pick rows = 3 years (2026–2028) × 3 tiers × 4 rounds.

Rejected: **projecting the tier from standings** — the league is `pre_draft` with no 2026 standings
at all, and 2027/2028 have no basis whatsoever, so the method is unavailable for exactly the picks
that matter most. Rejected: **carrying a range into the total** — Portfolio's roster value is a
scalar and a range cannot sum.

**Decided: Mid is the scalar; the range is disclosed adjacent.** Mid is the unbiased point estimate,
and the Early–Late spread lives in the `DefinitionPopover` where the uncertainty is stated rather
than hidden or faked. This is the same discipline the design already applies to the projection tile —
a point estimate with the spread shown elsewhere, never a fabricated interval around the number.

Known and accepted bias: Mid understates a rebuilding team's own 1st and overstates a contender's.
A later refinement could tier a **traded** pick by its original owner's projected finish, since that
team is known; out of scope for v2, and it does not apply to a team's own picks anyway.

### 2.4 `PROVISIONAL()` gains no new category — reuse `no-data`
*(delegated to me; decided here.)*

The design's five `DegradedBlock` kinds (`NOT YET — ACCRUING` / `NOT MEASURED THEN` /
`UNDEFINED HERE` / `NEVER AVAILABLE` / `NO BASELINE`) are a **UI** taxonomy: they tell a *user* which
kind of absence they are looking at. `PROVISIONAL()` is a **source-comment** taxonomy: it tells a
*maintainer* why a rendered value is not real and what would fix it. They answer different questions
and should not be forced into correspondence.

`no-data` already reads "the field is real in principle; the source is empty/missing/gated — render
`—`/omit, never substitute a placeholder number," which describes an unpriceable 5th-round pick
exactly. Adding a `never-available` category would fragment the `grep -rn "PROVISIONAL(" src/`
inventory for no behavioural difference — both categories imply the identical rule.

**One clarification to the convention, not a new category:** the tag's third slot is "what would make
it real." Where nothing will, write that plainly (`· nothing will — KTC prices rounds 1–4 only`). An
honest dead end is more useful to the next reader than an aspirational blank.

## 3. Two technical problems the design implies

Neither is a design fault; both need an implementation answer.

### 3.1 Team detail's 14-season chart needs 14 file fetches
`SeriesBars` on Team detail plots 14 seasons. `nflverse/teamcontext/<year>.json` is **per-season,
all 32 teams** — so a single team page needs all fourteen files. They are permanently cacheable
(completed seasons never change) and the existing loader already does per-year permanent IndexedDB
caching, so this is a **first-visit** cost only. Options: fetch all 14 in parallel on first Team
visit; fetch the current season eagerly and the tail lazily as the chart scrolls into view; or
precompute a season-summary pack in the data repo (**a cross-repo change — avoid for v2**).
Recommend parallel-on-first-visit, measured. `docs/integrations.md` load-performance patterns apply.

### 3.2 KTC pick rows are silently dropped today
Pick rows look like `{ name: "2027 Early 1st", team: "FA", value: 7096, position: null }`.
`matchKTCToSleeper` normalises to `{name, position, team, value}` and matches **name+position** or
**name+team** against Sleeper players — a pick has no Sleeper counterpart, so all 36 rows are
discarded before reaching `ktcMap`.

Slice 7 therefore needs a **second, parallel parse path**: recognise the
`<year> <Early|Mid|Late> <1st|2nd|3rd|4th>` pattern and build a pick-price table, bypassing player
matching entirely. Do **not** widen `matchKTCToSleeper` to accommodate picks — it exists to resolve
players and a pick is not one. New pure util, e.g. `src/utils/ktcPicks.js`.

---

## 4. Slice list (dependency-ordered)

Each slice ends with its own `npm test` / `npm run lint` / `npm run build` checkpoint per
CLAUDE.md's done-definition, and hands back for Anton's visual smoke. **Claude Code may run the app
itself** to check a visual change (revised 2026-08-18 — the earlier blanket prohibition is gone; see
CLAUDE.md → Workflow convention), but Anton's eyes remain the acceptance gate for anything aesthetic.

### Slice 0 — Retire the light theme
**Fully spec'd:** [dp-v2-0-retire-light-theme.md](dp-v2-0-retire-light-theme.md).

Small, behavioural, standalone, and first — it removes a decision every later slice would otherwise
have to make. **No recoloring:** the app already defaults to dark (§2.1).

- Force `.dark` on `<html>` permanently. `theme.js` keeps `applyThemeClass` (now called once with a
  constant) and loses `loadStoredTheme`/`persistTheme`, or reduces to a single `applyDarkTheme()` —
  the implementing slice picks the smaller diff. Drop the `localStorage['theme']` read/write.
- Remove `TopBar`'s toggle button and the `theme`/`onToggleTheme` props (`TopBar.jsx:42,45,179`),
  `App.jsx`'s `theme` state, `handleToggleTheme` (`App.jsx:910`), and the `applyThemeClass` effect
  (`App.jsx:106`). `AppShell`'s explicit prop list narrows accordingly.
- `theme.test.js` covers behaviour that is being deleted — **update it to assert the new outcome**
  (dark is applied unconditionally, nothing is persisted), do not delete it wholesale and do not
  edit it merely to go green.
- Delete the `DEFAULT_ROUTE` "temporary" note per §2.2. Same change, same reason: it is a closed
  question and the comment invites re-opening it.
- **Leave both token families in place.** `--color-dp-*` stays dark-only; the adaptive `--color-*`
  family stays as-is and simply always resolves to its dark branch. Merging them is out of scope.
- Docs in the same change: `CLAUDE.md`'s color-token note and `docs/ui.md`'s theming section — which
  also carries the false "overrides for every token" claim (§2.1) and should be corrected here while
  the file is open.

**Acceptance is Anton's eyes**, as CLAUDE.md requires for anything theming-related — but the bar is
unusually clear this time: the app should look **identical** to today's default-dark state, with one
fewer control in the header.

### Slice 1 — The four systems (+ the coverage util)
**Fully spec'd:** [dp-v2-1-systems.md](dp-v2-1-systems.md).

Five new presentational components, one pure util, two new tokens — plus, **superseding this entry's
original "no data changes" clause**, a four-line producer change in `App.jsx`. The void-slot fix
requires it: `careerSparkline` already collapses "season absent", "zero games played" and "played and
scored 0.0" into the same `0` (`App.jsx:327-331`), so no rendering change alone can separate them.
Shipping a void-slot branch that can never trigger would leave dead capability in the one component
every later slice must be able to trust. See the slice file's §1.1.

Everything after this assembles from these primitives, so it ships first and alone.

- `src/utils/coverageBand.js` — extend `ktcHistConfidence`'s existing `high|medium|low|none`
  vocabulary from snapshot counts to season counts. **Reuse the thresholds, do not invent a second
  scale** (`high ≥ 7`, `medium 4–6`, `low 1–3`, `none 0`).
- `dp/CoveragePips.jsx` — 3 pips, `band` prop, **never a colour** (blue/amber stay reserved for
  direction).
- `dp/SeriesBars.jsx` — arbitrary-length sibling to `CareerBars`, **never pads**; `signed` and
  `scaled` axis modes (`signed` draws a real zero axis with negatives below; `scaled` truncates and
  **states the floor on the card**). Bar length always means more of the metric — the component
  never silently inverts; direction is a per-card label.
- `dp/cells.jsx` → `CareerBars` **modify**: add void slots. Keeps its fixed 5-wide geometry — do not
  re-spec it (1b established this). **This fixes a live bug**: `careerSparkline` 0-pads absent
  seasons, so today a missing season and a real 0.0 render identically.
- `dp/TrendCell.jsx` — series → signed delta with glyph → window label, fixed order, three scales.
  Sorts on **delta**. Below `medium`: suppress the series, keep delta + window. Below `low`: `—`.
  A projected point is dashed and **never joins the delta calculation**.
- `dp/DefinitionPopover.jsx` — dotted underline visible at rest, **click not hover** (must survive
  touch + keyboard). Contents in order: term + scope → plain gloss → percentile strip (10th/50th/90th,
  subject marked, **no colour, no verdict**) → coverage pips + span → field expression. Scoped to the
  current surface, not global.
- `dp/DegradedBlock.jsx` — five kinds: `NOT YET — ACCRUING`, `NOT MEASURED THEN`, `UNDEFINED HERE`,
  `NEVER AVAILABLE`, `NO BASELINE`. Mono label, one sentence naming the boundary, then what renders
  instead. **Never a call to action** — the app is a static client over a CDN.

**Tests:** each component gets unit coverage; `coverageBand` gets a table-driven suite; the
`CareerBars` void-slot change is *changed behaviour* and its existing test must be updated to assert
the new outcome, not edited to go green.

### Slice 2 — Wire the three dark loaders
**Fully spec'd:** [dp-v2-2-loader-wiring.md](dp-v2-2-loader-wiring.md).

No UI. Makes the data reachable and proves the guards still hold.

- `loadTeamContext(year)`, `loadNflGameLogs(year)`, `loadNflSchedule(year)` into `App.jsx` state +
  effects, following the `loadAdvStats`/`loadEnrichment` precedent (`App.jsx:254-265`). Each is
  explicit-season, no probe. Respect the **Strict-Mode `cancelled`-flag invariant** on every async
  effect.
- Join via `utils/playerTeam.resolvePlayerTeam` — the single player→team resolution point. Note the
  domain trap: teamcontext is **era-accurate**, gamelogs `games[].team` is **current-franchise**;
  `resolvePlayerTeam` already remaps. Do not add a second remap.
- **Guard tests are the acceptance criterion.** `teamContextViewOnly.test.js`,
  `gameLogsViewOnly.test.js`, `scheduleViewOnly.test.js` and `advStatsViewOnly.test.js` assert that
  projection/scoring modules never import these families. Wiring to `App.jsx` and to components is
  allowed; **wiring to `seasonProjection.js`/`dynastyScore.js` is not.** Extend each guard's file
  list to cover the new consumers as display-only rather than weakening it.
- Season scoping is a real decision here: current season eagerly, historical lazily. See §3.1.

### Slice 3 — Pop-up container: continuous scroll + section index
**Fully spec'd:** [dp-v2-3-popup-container.md](dp-v2-3-popup-container.md).

Container change only, **existing content re-laid out, no new sections.** Proves the D1 answer
against known content before five new sections land on it.

- `dp/SectionIndex.jsx` — `140px` fixed left rail; a **table of contents, not navigation**: clicking
  scrolls, it never swaps. Each entry carries that section's coverage pips + span, so it doubles as a
  coverage manifest.
- `PlayerDetailModal.jsx` → one continuous scroll. Modal `1320px`; index `140px` + main `1131px`.
  **The `300px` right rail exists only in the Overview band** and stacks under the tiles below
  `1180px` — this is what satisfies the mobile constraint by construction. Preserve that property.
- **No second tab row and no route.** The player tab strip (`PlayerDetailTabs.jsx`) stays above the
  modal chrome; the compare matrix remains the only element that changes with tab count.

### Slice 4 — Pop-up: the five new sections
The largest slice; consumes Slice 2's data through Slice 1's systems. Order within the slice:
Game log → Distribution → Usage & efficiency → Environment → Availability & role.

Rules from the spec that must survive (see `06-round5-review.md` §5):
- **No per-game snap column** — gamelogs carries no snap field at any grain. Snaps are season-grain
  (`off_snp ÷ tm_off_snp`) and belong to Usage & efficiency only.
- Bye weeks render as a **labelled row**, never a scoring zero — no row exists in the source.
- Weather renders `—` under a roof because `temp`/`wind` are honestly null indoors, not `0`.
- Usage & efficiency carries a `DISPLAY ONLY` badge, citing the guards.
- **The projection is a point estimate with no interval.** The visible spread is *historical*
  per-game variance and lives in Distribution. Do not draw a band around the projection.
- Distribution is **pooled over `computeConsistency`'s three qualifying seasons**, not one — so the
  histogram and the Consistency tile are one quantity in two views. `WINDOW_SEASONS = 3`.
- Score drivers do not multiply out to the composite for TD-reliant profiles (`effectiveReliability`
  is penalised, `components.reliability.value` is not). State it in the card; do not reconcile
  silently.
- "Why next season" splits **moved the number** from **observed only, moved nothing** — the latter
  is the capture-only invariant made visible. `compBlendWeight` is a *weight*, not a multiplier.
- Environment recomputes every rate from components. The four expressions, as corrected in round 6:
  `(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)` · `off.successes ÷ off.successPlays` ·
  `off.epaSum ÷ off.epaPlays` · `Σ off.neutralSeconds ÷ Σ off.neutralGaps`.

### Slice 5 — Market: Efficiency set, TREND gutter, environment filters
- **Fourth column set**, and the sets regroup as two pairs: `MODEL & MARKET [VALUE][OUTLOOK]` ·
  `ON FIELD [VOLUME][EFFICIENCY]`. `PRODUCTION` renames to **`VOLUME`**.
- Efficiency is **per-position**, like `VOLUME` already is via `market/columnDescriptors.js`'s
  `POSITION_STAT_COLUMNS` — a single receiver-shaped set is empty for QB. Per the round-5 spec:
  QB `EPA/ATT · CPOE · SACK% · AY/ATT · RUSH EPA`; RB `CARRY SH · TGT SH · RUSH EPA/ATT · YAC · BTKL`;
  WR/TE `TGT SH · AY SH · aDOT · EPA/TGT · RACR · RZ SH · SNAP% · DROPS`.
  **`CARRY SH` is the one column needing a cross-family join** — `gamelogs.carries ÷
  teamcontext.off.rushPlays` on `(team, week)`. That denominator counts QB scrambles, making it
  *better* than the app's cohort-built rush denominators (`advstats-grading-findings.md` §4.8).
- **`TREND` is a gutter, not a set member** — immediately right of `PLAYER`, inside its own hairline,
  persistent across all four sets, sorting on delta.
- Four **environment filters** (`NEW` in the panel): team PROE, pace, off. EPA/play, RZ TD rate —
  joined per player through `resolvePlayerTeam`. Extend `marketFilters.js`; keep the **sentinel
  gating** pattern (a range filters only when it differs from its default) and add each new key to
  `normalizeFilters` **and** `isRestorableFilters`, which share validators.
- `computeKtcRecentDelta` was deleted in 1b Slice viii and is needed again for `TrendCell`. Recover
  it from `3f55245^` (= `5b277b9`, `src/utils/ktcHistory.js:338`) rather than rewriting.
- **Optional, unlocked by Slice 0:** restore `CeilingFloorCell`'s tier-coloured rank badge. It was
  dropped in 1b Slice vii only because its raw `--c-*` primitives followed the theme toggle while
  Market forced dark; with the toggle gone that mismatch cannot occur (§2.1). Low value, near-zero
  cost — take it or leave it, but do not re-derive the reasoning.
- **Column priority, narrow to wide.** Irreducible core is `PLAYER · TREND · lead metric`; then drop
  right to left. This is the mobile-cheapness decision — implement it as data, not as ad-hoc CSS.

### Slice 6 — Teams: index, detail, routes, nav
- New routes `/teams` and `/teams/:abbr`. **Remove the `ACT` group** (Draft board + Trade desk are
  both placeholders; a rail with a dead third undermines the rest) and add Teams under `MANAGE`.
  `BottomTabBar` is capped at 5: `Portfolio · Market · Teams · League · Me`, with **Me out of scope
  as a designed surface** — it inherits `TopBar`'s existing controls.
- `5a` index: 32 rows, sortable, with a **league distribution strip re-drawn per sorted column** —
  that strip is what makes a single team's `+3.2` readable at all. **No coverage pips in the table
  body** (zero nulls across 14 seasons; pipping 288 identical cells is noise).
- **`YOUR EXPOSURE`** — player count + share of roster value per team, joined via
  `resolvePlayerTeam`. This is the league-awareness column no competitor has; treat it as the
  surface's reason to exist, not a nice-to-have.
- `5b` detail: 14-season `SeriesBars` per metric with the `signed`/`scaled` modes, percentile strip
  on a **raw-value axis**, direction label per card including `VOLUME SIGNAL · NOT A QUALITY READ`
  for PROE. Coaching from the enrichment overlay (95 entries, coaching only — `scheme`/`injuries`/
  `notes` are empty scaffolds and must degrade, not fabricate).

### Slice 7 — Portfolio extensions + picks as holdings
Last: the only slice needing a new external source, and the only one that changes a shipped
headline number.

- **New api module** for Sleeper `/v1/league/<id>/traded_picks`. Verified live: HTTP 200, 23 rows on
  the real league, shape `{ owner_id, previous_owner_id, roster_id, round, season }` — note `season`
  is a **string**. Reconstruct current ownership: every team starts with its own pick in each round
  × year, then apply the traded-pick deltas.
- **New pure util** `src/utils/ktcPicks.js` per §3.2 — parse the 36 name-only pick rows; do not
  widen `matchKTCToSleeper`.
- Tiles gain `NO BASELINE` where a delta has no prior aggregate. Roster value and concentration have
  a real 13-week KTC baseline; weighted age and projected points do not. **`NO BASELINE` is a
  storage fact, not a design choice** — that framing is the point.
- The roster-value total **includes picks and states its own incompleteness inline**
  (`players X + picks Y`, `+ N UNPRICED ASSETS`), not in a footnote. Unpriced renders as a dashed
  `—`, never `0` — zero would be a price.

---

## 5. Cross-repo impact

**None.** Every field these slices consume is already served by `sleeper-dashboard-data` at
`f0c1fc4`. No new served family, no shape change, no coverage request. The one new external source
(Sleeper `traded_picks`) is fetched **directly by the app**, like every other Sleeper endpoint, and
introduces no data-repo coupling.

Two things to watch rather than change:
- **KTC pick-row naming** (`"2027 Early 1st"`) becomes load-bearing for Slice 7. It is produced by
  the KTC scrape and is not currently in the registry. If Slice 7 depends on that format, it is a
  **genuinely new cross-repo coupling** and per CLAUDE.md must be drafted as a new `CR-NN` entry —
  the one case that routes to the Claude.ai project, since it needs both trees. **Do this during
  Slice 7 planning, not at implementation time.**
- §3.1's rejected option (a precomputed teamcontext season-summary pack) *would* be a cross-repo
  change. Kept out of scope deliberately.

State "none" explicitly in every slice's hand-back anyway, per the registry rule.

---

## 6. Program-level invariants and risks

- **`App.jsx` owns all domain state** and is already 1065 lines. Three loaders, picks, and Teams data
  all land there. No Redux/Zustand/Jotai, no TypeScript, no moving domain state into hooks —
  view-local table UI state may use `usePlayersTable`. If the file becomes unmanageable, that is a
  **separate extraction task**, not something a slice does in passing.
- **The view-only guards are the safety rail of this whole program.** v2 makes five previously-dark
  families visible; not one may reach `projectedPPG`, the dynasty score, or any `factors` key.
  Every slice touching a family runs that family's guard test.
- **`PROVISIONAL()` should shrink to near-zero.** Today's inventory is Slice ii's three sites. v2
  closes the 30-day-delta gap outright; the only additions should be `no-data` on genuinely absent
  sources (5th-round pick value). `grep -rn "PROVISIONAL(" src/` in every hand-back.
- **Test baseline:** 63 test files, 1080 tests at `3f55245`. Expect substantial growth in Slices 1
  and 4; a *drop* anywhere is a signal, not a saving.
- **Slice 4 is the largest and highest-risk** (five sections, two data families, one new container).
  If it needs splitting, the natural seam is Game log + Distribution (player-scoped) before
  Usage & efficiency + Environment (team-joined).

---

## 7. Docs updates this program implies

Deferred to the slice that lands each change, per the self-maintenance rule:
- `CLAUDE.md`: routing table (`/teams`, `/teams/:abbr`, `ACT` removal), `src/components/` table
  (~10 new files), `src/api/` table (three loaders gaining consumers, plus `tradedPicks`),
  `src/utils/` table (`coverageBand`, `ktcPicks`, restored `computeKtcRecentDelta`), and the
  loader-dark notes on `advStats`/`nflSchedule`/`nflGameLogs`/`teamContext`, which all become stale
  the moment Slice 2 lands.
- `docs/ui.md`: Market's fourth column set, Teams, the pop-up's new shape, Portfolio's tiles.
  **Two known doc bugs to fix in passing:** it calls the depth-chart hook key `depthChart` (it is
  `teamDepthChart`), and it claims the `.dark` block carries overrides for *every* token — 35 semantic
  tokens deliberately have none (§2.1). The second belongs to Slice 0, the first to Slice 4 or 6.
- `docs/signal-registry.md`: every family whose *Current use* changes from view-only-no-consumer to
  view-only-displayed — that is five rows.
- `docs/architecture.md`: `App.jsx` state inventory as Slice 2 and Slice 7 grow it.
- `docs/design_brief_v2/` and `design_handoff_dynasty_portfolio/` are **handoff artifacts, not living
  docs** — leave them as the record of what was asked for.

---

## 8. Next step

All four pre-flight questions are answered, so nothing blocks writing task files.

**Order:** Slice 0's task file, then Slice 1's. Slice 0 is small enough that its specification is
nearly the §4 entry above; Slice 1 needs the full treatment — exact signatures, prop shapes, token
names, and tests-to-add — following the `dynasty-portfolio-1b-i-foundation.md` precedent. Each then
goes through the `plan-reviewer` subagent and human approval before a sonnet session implements it.

**Do not batch Slices 0 and 1 into one session.** Slice 0 changes shared chrome and its acceptance is
visual; Slice 1 adds seven new modules and its acceptance is unit tests. Landing them together makes
a visual regression hard to attribute.
