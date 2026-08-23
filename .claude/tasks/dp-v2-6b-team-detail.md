# Slice 6b — Team detail

**Program:** [dp-v2.md](dp-v2.md). Follows [dp-v2-6a-teams-index.md](dp-v2-6a-teams-index.md)
(landed `e1bebfb`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `e1bebfb`.

**Design source is not in this repo** — Claude Design project only, block `5b`. Everything needed is
restated here.

Completes Slice 6: `/teams/:abbr`, four 14-season metric cards, team holdings, coaching, and the
row navigation 6a deliberately left off.

---

## 1. Confirmed against live source (`e1bebfb`)

| Fact | Site |
|---|---|
| `ENV_SEASONS = 5`; the effect loads `allSeasons.slice(-ENV_SEASONS)` and merges year-keyed | `App.jsx:61,898` |
| **teamcontext has exactly 14 seasons, 2012–2025** — so "the full window" is 14 | data repo `f0c1fc4` |
| **App.jsx is route-unaware** — no `useLocation`/`useNavigate`, and no existing on-demand load pattern | `grep` → none |
| `buildTeamMetricsTable(loaded)` and `deriveDataSeason(careerStats)` exist (6a); `computeLeagueStanding(loaded, metricId, team)` returns `{ median, rank, n }` | `utils/environment.js` |
| **`SeriesBars` colours by MODE**: `signed` uses `bg-dp-up`/`bg-dp-down` **by sign** (`:49`); `scaled` uses `bg-dp-slate-2` — already neutral (`:77`) | `dp/SeriesBars.jsx:49,77` |
| **Coaching entries are keyed `LAR`, not `LA`** — the Sleeper domain — and **every entry is year 2026** (32 teams, 95 entries) | data repo `enrichment/coaching.json` |
| `SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }` is **one-way**; no inverse exists | `utils/nflStats.js:2` |
| `getCoaching(payload, team, year)` → `{ HC, OC, DC }`, matching on `entry.team === team && entry.year === year` | `utils/enrichmentLookup.js:55-61` |
| `enrichmentMap` is App.jsx state and on `ProfileDataContext` | `App.jsx:135` |
| 6a's Teams index drives its rows from **teamcontext's own keys** — the era-accurate domain | `components/teams/Teams.jsx` |
| **`eraTeam(abbr, season)` exists** — `LA→STL` ≤2015, `LAC→SD` ≤2016, `LV→OAK` ≤2019 | `utils/playerTeam.js:32` |
| **Verified in the data:** teamcontext 2014 keys `STL` and `OAK`, not `LA`/`LV` | data repo `f0c1fc4` |
| **`TrendCell` does NOT import `SeriesBars`.** Its three live callers are `dp/EnvironmentSection.jsx`, `dp/UsageEfficiencySection.jsx`, `teams/Teams.jsx` | `dp/TrendCell.jsx` |
| **`DefinitionPopover`'s percentile strip is three text values**, not bars — it draws no colour at all | `dp/DefinitionPopover.jsx:41-75` |
| **`buildExposure`/`exposureForTeam` are module-local to `Teams.jsx` and unexported** | `teams/Teams.jsx:56,74` |
| **`ClickableRow` hard-codes `onOpen(row.player_id)`** — a team row has no `player_id` | `dp/cells.jsx:41-58` |
| **App state holds `loadEnrichment()`'s raw `{coaching, scheme, injuries, notes}`** — the payload is `enrichmentMap.coaching`, and **no routed surface receives it as a prop today** | `App.jsx:143`; `api/enrichment.js:44` |
| `computeLeagueStanding` returns `n` = teams with a **non-null** value — not guaranteed 32 | `environment.js:100-116` |
| `playerRows` is **relevance-gated** (`isRelevantPlayer`) — it is not every skill player | `utils/relevance.js:83`; `App.jsx:279-326` |
| `ENV_SEASONS` is `App.jsx:62`; the window slice `:899`; `enrichmentMap` `:143` | (the draft's `:61,898,135` were off) |

---

## 2. The 14-season window loads on demand

The index needs one season; **only this surface needs fourteen**. At ~1 MB per season that is ~9 MB
beyond the five 4c already loads — too much to pay on every app load for a surface many users never
open, and not something to fetch eagerly.

**App.jsx is route-unaware and there is no existing lazy pattern**, so add the smallest one that works:

- `App.jsx` holds `const [needFullTeamHistory, setNeedFullTeamHistory] = useState(false)`.
- Team detail calls an `onNeedTeamHistory()` prop **once on mount**.
- A new effect keyed on `[careerStats, needFullTeamHistory]` loads the seasons not already present and
  merges them through the **existing year-keyed setter**. Slice 2 built that shape explicitly so this
  addition would be additive.

Non-negotiables, all inherited from the Slice 2 effect this mirrors:
- **`Promise.allSettled`, not `Promise.all`** — one rejected season must not lose the batch.
- **`cancelled` flag** checked before the setter (Strict Mode double-fires).
- **One merged write**, not nine.
- **Track loaded-and-in-flight years in a `ref`, not by reading `teamContextByYear` in the effect.**
  Listing that state in the dep array makes the effect **re-run on its own merged write**; omitting it
  trips `react-hooks/exhaustive-deps`, and the done-definition requires **0** lint problems. A ref of
  requested years sidesteps both, and is the only shape that also closes the next point.
- **The double-fetch is real, not theoretical.** `needFullTeamHistory` can flip true *before* the
  eager 5-season effect resolves — at which point `teamContextByYear` is still `{}`, so a
  state-based diff would request all fourteen, including the five already in flight. `loadTeamContext`
  has **no in-flight dedupe** (`api/teamContext.js:82-116` checks the cache at entry and writes it
  only after the fetch), so those five would genuinely be fetched twice. The ref must record a year as
  requested when the fetch **starts**, not when it lands.
- **Leave the existing 5-season effect alone.** It stays the eager baseline; this widens it.

**Render what is loaded while the rest arrives.** The chart takes the seasons present and lets
`SeriesBars` void-slot the rest — do not gate the whole card behind a complete window, and do not
show a spinner over a chart that already has five real seasons.

**Report the observed size and time in the hand-back.** This is the one place in the program where a
load cost was predicted rather than measured; if 14 seasons is materially worse than 9 MB implies, say
so rather than shipping it silently.

---

## 3. The four metric cards

`PROE` · `PACE` · `SUCCESS RATE` · `OFF EPA / PLAY`. Each card carries: the current-season value, the
league median, the rank (`Nth of N` — use `computeLeagueStanding`'s returned `n`, which counts teams with a **non-null** value for that metric and is not guaranteed to be 32), a percentile strip, a 14-season `SeriesBars`, a direction
label, an axis label, and the field expression.

| Metric | Mode | Direction label | Axis label |
|---|---|---|---|
| PROE | `signed` | `VOLUME SIGNAL · NOT A QUALITY READ` | `ZERO BASELINE` |
| PACE | `scaled` | `LOWER IS BETTER` | `AXIS <lo>–<hi>s` |
| SUCCESS RATE | `scaled` | `HIGHER IS BETTER` | `AXIS <lo>–<hi>%` |
| OFF EPA / PLAY | `signed` | `HIGHER IS BETTER` | `ZERO BASELINE` |

**Field expressions — use these exactly.** They were corrected in design round 6 after three of them
were wrong, and `src/api/teamContext.js`'s header was itself corrected in 4c because it paired the
wrong denominator:

- PROE — `(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)`
- PACE — `Σ off.neutralSeconds ÷ Σ off.neutralGaps · never the stored per-game rate`
- SUCCESS RATE — `off.successes ÷ off.successPlays`
- OFF EPA / PLAY — `off.epaSum ÷ off.epaPlays`

`computeTeamSeasonMetrics` already implements all four correctly (4c) — **call it, do not re-derive**.
`scaled` mode must **state its floor on the card**, which is what the axis label is for.

### 3.0 The 14-season lookup MUST go through `eraTeam` — three franchises are wrong without it
teamcontext is keyed **era-accurately**, so the code for a franchise changes partway through the
window. Verified in the data: **2014 keys `STL` and `OAK`, not `LA`/`LV`.**

A chart for `/teams/LA` that looks up `LA` in every season finds **nothing for 2012–2015** and renders
four void slots as though the data were missing. Same for `/teams/LAC` (`SD` ≤2016) and `/teams/LV`
(`OAK` ≤2019). Three of thirty-two franchises, on the flagship chart, silently wrong.

**Resolve the key per season: `eraTeam(routeAbbr, season)`** (`playerTeam.js:32`) — it exists for
exactly this and already carries the three mappings.

**The route param is a CURRENT code**, matching what 6a's index links. Do **not** accept historical
codes as route params (`/teams/STL` stays unknown → degraded); supporting both domains in the URL
buys nothing and doubles the surface's identity.

### 3.1 The 14-season signed charts carry NO direction colour — and this fixes 6a too
The design's rule, from the `DefinitionPopover` spec and restated in the round-5 review:

> **No colour and no verdict** — further right is good for a receiver and bad for a runner, so the
> strip must not editorialise. Bar length always means more of the metric; **direction is carried by
> a label**.

**The element that editorialises is the 14-season `signed` chart, not a percentile strip.**
`DefinitionPopover`'s percentile strip is three **text** values and draws no bars and no colour at all
(`DefinitionPopover.jsx:41-75`) — a `SeriesBars` option cannot change it, and the draft's framing was
wrong about the target.

`SeriesBars`' **`scaled`** mode is already neutral (`bg-dp-slate-2`, `:77`). Its **`signed`** mode
colours by sign (`:49`) — so **PROE's and OFF-EPA/PLAY's charts** editorialise, and in 6a's
distribution strip the same mode actively contradicts the inverted `DEF EPA ALL` cell colours, which
is the follow-up 6a flagged.

**Add an additive neutral option to `SeriesBars`** (e.g. `colour="neutral"`, default unchanged) that
renders `signed` mode's real zero axis with `bg-dp-slate-2` bars. Then:
- use it for **this slice's two `signed` charts** (PROE, OFF EPA/PLAY), and
- **update 6a's `Teams.jsx` distribution strip to pass it**, closing that inconsistency.

Do not change either mode's default colouring. **`TrendCell` is NOT a consumer** — it does not import
`SeriesBars`, so a regression guard naming it would guard nothing. The three live callers are
`dp/EnvironmentSection.jsx`, `dp/UsageEfficiencySection.jsx` and `teams/Teams.jsx`; guard those.

---

## 4. Team holdings

The skill players on this team **that `playerRows` carries** — with position tag, name, KTC value, and
a meta line that differs by ownership:

- **Yours** → `N% of roster` (that player's `ktcValue` ÷ your total roster value), in `dp-up-text`.
- **Another manager's** → `owned by <manager>`, muted. *(The draft said `not owned · <manager>` —
  which asserts the opposite of the state it describes.)*
- **Unowned** → `not owned`, muted.

**Do not claim "every skill player on this team."** `playerRows` is **relevance-gated** —
`isRelevantPlayer` (`utils/relevance.js:83`) drops un-rostered non-rookies with no play in the last
two seasons and no KTC row. Label the block for what it holds (e.g. `ROSTERED & TRACKED`), and do not
present it as a depth chart.

**Empty state:** a team with no matching rows renders a muted one-liner, **not** an empty table and
not a `DegradedBlock` — this is a real, correctly-computed emptiness, not absent data.

Source from `playerRows`, filtered on **`normalizeTeamForSchedule(nfl_team) === abbr`** — the same
domain hop 6a established, since the route param is an era-accurate code. Sort by `ktcValue`
descending, nulls last.

**`buildExposure`/`exposureForTeam` are module-local to `Teams.jsx` and unexported** (`:56,74`), so
they cannot be reused as-is. **Extract them into `src/utils/teamExposure.js`** and have both 6a and 6b
import them — 6a's behaviour must not change (its tests stay green unedited). The same rule carries:
a null `ktcValue` is skipped in numerator and denominator, never zeroed.

---

## 5. Coaching — two traps, both silent

The block shows head coach, offensive and defensive coordinator. Both traps make it render empty for
some or all teams while nothing looks broken.

### 5.1 The team key is `LAR`, not `LA`
`enrichment/coaching.json` keys the **Sleeper** domain. The route param is **era-accurate** (`LA`).
`getCoaching(payload, 'LA', …)` therefore returns nothing for the Rams.

`SCHEDULE_TEAM_ALIAS` is **one-way** (`LAR → LA`) and no inverse exists. Add one — an additive
reverse lookup in `nflStats.js`, derived from the same constant so the two cannot drift — and map the
route param back before calling `getCoaching`. **`nflStats.js`'s alias is a named CR-16 app-side
trigger** (`Direction: both`); §10 emits its Mirror. **This is the exact mirror of the bug 6a caught in the
exposure join**; the domain boundary bites in both directions.

### 5.2 Every coaching entry is year **2026**; `dataSeason` is **2025**
So `getCoaching(payload, team, dataSeason)` returns `{HC: null, OC: null, DC: null}` for **every
team**.

**Mechanism — and where it must NOT live.** `getCoaching(payload, team, year)` matches on an exact
`entry.team === team && entry.year === year`, so something must pick the year. Derive it **in the
surface**: the max `year` among `coaching.entries` for the resolved team, falling back to the max
across all entries. **Do not add a year-resolving helper to `utils/enrichmentLookup.js`** — that file
is a **CR-03 definition site**, and a helper there widens the mirrored surface for no gain. `getCoaching`
stays unedited.

**The payload is `enrichmentMap.coaching`, not `enrichmentMap`.** App state holds `loadEnrichment()`'s
raw `{coaching, scheme, injuries, notes}` untransformed (`App.jsx:143`, `api/enrichment.js:44`).
**No routed surface receives `enrichmentMap` as a prop today** — only `ProfileDataContext` carries it.
Thread it to the team-detail surface as an **explicit prop** from `App.jsx`, the same way 6a receives
`playerRows`; do not make this surface a context consumer (Market/Portfolio/Teams are all props-only).

**Resolve the year by scoping the block to "now", not to the charted season.** Coaching is a current-state
question for a dynasty tool — who runs this offence *going forward* — not an attribute of the 2025
season the charts show. So:
- Query the year the enrichment actually covers, and
- **label the block with that year** so the reader knows it is not the chart's season.

Do **not** silently query `dataSeason` and render an empty block, and do **not** back-date the
enrichment. If the payload is empty for the resolved year too, render a `DegradedBlock` — the overlay
is hand-authored and `scheme`/`injuries`/`notes` are 0-entry scaffolds, so an empty coaching payload is
a realistic state.

---

## 6. Routing and the index

- New route `/teams/:abbr` in `App.jsx`, alongside `/league/:view`'s precedent.
- **The surface reads `:abbr` itself via `useParams`** — `App.jsx` is route-unaware (`useParams`
  appears only in `LeagueView.jsx`, which is the precedent to follow). App.jsx passes data; the
  surface reads the param.
- **6a's index rows become clickable in this slice** — that was the explicit deferral. Whole-row
  click plus keyboard (`Enter`/`Space`). **Do NOT reuse `dp/cells.jsx`'s `ClickableRow`** — it
  hard-codes `onOpen(row.player_id)` (`:41-58`) and a team row has `row.team` and no `player_id`, so
  it would fire `onOpen(undefined)`; making it generic would edit a component `Market.jsx` and
  `Portfolio.jsx` both depend on. Write the handler locally in `Teams.jsx`, matching `ClickableRow`'s
  keyboard semantics.
- **Loading and degraded are different states, as 6a established** (`Teams.jsx:143-165`). Before the
  eager effect resolves, `teamContextByYear` is `{}` and **every** abbr reads as unknown — so a valid
  team would flash the degraded state. Gate on `loaded` first: `loaded===false` → loading;
  `loaded===true` + abbr absent from the season's `teams` → degraded.
- An unknown `:abbr` (a hand-typed URL, or a historical code like `/teams/STL`) renders a degraded
  state, **not** a crash and not a redirect — the same treatment as any absent data.
- `navRouting.test.jsx` keeps its own duplicate route table and needs `/teams/:abbr` added.

---

## 7. Tests

- **The on-demand load fires once on mount**, requests only the missing seasons, and merges rather
  than replacing. Assert `Promise.allSettled` semantics: one rejected season still writes the others.
- **The chart renders with a partial window** — five seasons present, nine absent, void slots for the
  rest, no gating.
- **Era remap** — `/teams/LA`'s 14-season chart resolves `STL` for 2012–2015 and renders **real bars**
  there, not void slots. Assert with a synthetic two-era fixture. This is the highest-value test here.
- **On-demand load dedupe** — flipping `needFullTeamHistory` while the eager 5-season effect is still
  in flight requests each season **at most once**.
- **`SeriesBars` neutral option** — `signed` + neutral renders slate bars with the zero axis intact;
  the default `signed` colouring is unchanged. Regression-guard the three **real** callers —
  `dp/EnvironmentSection.jsx`, `dp/UsageEfficiencySection.jsx`, `teams/Teams.jsx`. **Not `TrendCell`**,
  which does not import `SeriesBars`.
- **`teamExposure.js` extraction is behaviour-preserving** — 6a's existing tests pass **unedited**.
- **Coaching domain** — a route param of `LA` resolves the `LAR` coaching entries. This is the
  6a-mirror bug; assert it explicitly with a synthetic Rams case.
- **Coaching year** — the block queries the enrichment's year, not `dataSeason`, and is labelled with
  it; an empty payload renders a `DegradedBlock`.
- **Holdings** — a `LAR` player appears on the `LA` team page; ownership meta differs correctly across
  yours / another manager's / unowned; null `ktcValue` skipped; a team with no matching rows renders
  the muted empty line, not a `DegradedBlock`.
- **Unknown `:abbr`** renders degraded; **`loaded===false`** renders loading, not degraded.
- **`navRouting.test.jsx` is the ONLY required existing-test edit** (it keeps a duplicate route table).
  `teams/Teams.test.jsx` contains **no** clickability assertion — its only `fireEvent.click` calls are
  on sort headers — so the draft's "any 6a test asserting rows are not clickable" had no referent.

---

## 8. Smoke

Per `CLAUDE.md` → Workflow convention:
- open a team from the index by clicking a row; the four cards render with 14 bars once the window
  loads — **watch the console for the extra `[teamContext]` lines and note how long they take**;
- **open the Rams (`LA`)** — the holdings list is populated and the coaching block shows real names.
  If either is empty, a domain hop is missing (§5.1, §4);
- PROE's strip is now **uncoloured**, and so is 6a's distribution strip on `DEF EPA ALL`;
- a `scaled` card states its axis floor;
- hand-type `/teams/ZZZ` and confirm a degraded state rather than a crash;
- no console errors.

---

## 9. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` routing table | `/teams/:abbr`; the `/teams` row's "Rows are **not** clickable" clause is now false — update it |
| `CLAUDE.md` `src/components/` + `src/utils/` tables | Team detail; `nflStats.js` gains the reverse alias; `SeriesBars` gains the neutral option; **new `src/utils/teamExposure.js`** |
| `docs/ui.md` | Team detail: the cards, the on-demand window, holdings, and the coaching block's **year and domain** caveats |
| `docs/signal-registry.md:63` | **The draft's premise was wrong in both directions.** The enrichment row's Current-use cell does **not** read "unrendered" — it reads *"view-only display (enrichment tooltips); not in projection/scoring"*, a claim **already false** since 1b Slice viii deleted the tooltip subsystem. So this edit is a **correction of a stale overstatement**, not a promotion from unrendered. Rewrite it to name coaching's real renderer |
| `docs/signal-registry.md:58` | teamcontext's Current-use cell — add 6b's consumers and note the window widened 5 → 14 seasons on demand |
| `docs/cross-repo-registry.md` | **Two staleness corrections found in review**, both fix-in-passing: CR-10's app-side `Triggers` omits Slice **6a**'s live consumers (`teams/Teams.jsx:8,105,113`; `utils/environment.js:172,187` — `docs/signal-registry.md:58` already records them, CR-10 does not), and its two line anchors are off by one at HEAD (`loadTeamContext` call site is `App.jsx:900`, entry says `:899`; the `ProfileDataContext` provider key is `App.jsx:583`, entry says `:582`) |

---

## 10. Cross-repo impact

Four entries fire. Their `Mirror` texts are emitted verbatim below — **this file is the Session-1
output, so the mirror text is the deliverable**; the draft deferred it to "determine in planning",
which is this.

**CR-03 · Enrichment schemas** (`Direction: both`). The registry's app-side reads *"**No UI consumer
as of 1b Slice viii** … nothing currently calls the lookups or renders their output"* — true at HEAD
(grep finds only `enrichmentLookup.test.js`) and **falsified by this slice**, which gives `getCoaching`
its first renderer. `enrichmentLookup.js` itself stays unedited (§5.2), but the entry's app-side
description must be updated.

> **Mirror:** Any field add, rename or removal must be mirrored in the app's loader and lookups.
> `injuries.segmentStartWeek` must continue to match an absence segment in the matching season-totals
> file; orphaned entries are validator-flagged and silently ignored app-side.

**CR-16 · Era-accurate team-code remap** (`Direction: both`). Fires **twice** here: §5.1 derives a
reverse alias from `SCHEDULE_TEAM_ALIAS` in `nflStats.js` (a named app-side trigger), and §3.0's
14-season lookup goes through `eraTeam`.

> **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in
> the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the
> schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's
> `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces
> silently empty joins rather than an error — the team key simply never matches. Note
> `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it
> names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so
> grepping it for the remap finds nothing.

**CR-10 · nflverse teamcontext (view-only)** (`Direction: data→app`). This slice adds a consumer and
widens the load window to 14 seasons.

> **Mirror:** Shape or floor changes land in both repos together. **First TEAM-keyed family** — row
> identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers.
> Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or
> average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly
> across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

**CR-18 · Signal registry rows** (`Direction: data→app` — *not* `app→data-nothing`).

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new
> ingest adds a script the list above cannot already name. The listed sites are every one that exists
> today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer
> re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When
> a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters
> its historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No data-repo work is created by this slice** — nothing to append to `data-repo-backlog.md`.

---

## 11. Done-definition

- [ ] On-demand load: fires once, fetches only missing seasons, `allSettled`, `cancelled` flag, one
      merged write; the 5-season effect untouched
- [ ] Chart renders a partial window without gating
- [ ] Four cards use `computeTeamSeasonMetrics`; no re-derived field expressions; `scaled` states its floor
- [ ] `SeriesBars` neutral option added; **6a's distribution strip updated to use it**; default
      colouring unchanged
- [ ] **14-season lookup goes through `eraTeam(abbr, season)`** — `/teams/LA` shows real bars for
      2012–2015, not void slots
- [ ] No double-fetch when the flag flips mid-load (ref of requested years, not a state diff)
- [ ] Coaching resolves `LA → LAR` via an additive reverse alias derived from `SCHEDULE_TEAM_ALIAS`;
      `enrichmentLookup.js` unedited; `enrichmentMap.coaching` threaded as an explicit prop
- [ ] Coaching queries the enrichment's own year and is **labelled** with it
- [ ] Holdings filter on `normalizeTeamForSchedule(nfl_team)`; exposure helpers **extracted** to
      `utils/teamExposure.js` with 6a's tests green unedited; empty state is a muted line, not a block
- [ ] Index rows clickable + keyboard (local handler, `ClickableRow` untouched); loading ≠ degraded
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] CR-03/CR-10/CR-16/CR-18 mirrors carried out; the two CR-10 staleness corrections applied
- [ ] Smoked per §8, **including the Rams**

---

## 12. Hand-back should report

- The observed size/time of the 14-season load, measured not estimated.
- What the Rams page showed — holdings count and coaching names. That single page exercises both
  domain hops.
- Whether the neutral strip landed in both places.
- Confirmation that `/teams/LA` renders real 2012–2015 bars (the era-remap fix), and
  `/teams/LAC` / `/teams/LV` likewise.
- The cross-repo edits made.
- Anything in §1 that had drifted.
