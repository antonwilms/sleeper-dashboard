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
- **Do not re-fetch what is already loaded** — diff against `teamContextByYear`'s existing keys.
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
league median, the rank (`Nth of 32`), a percentile strip, a 14-season `SeriesBars`, a direction
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

### 3.1 The percentile strip carries NO colour — and this fixes 6a too
The design's rule, from the `DefinitionPopover` spec and restated in the round-5 review:

> **No colour and no verdict** — further right is good for a receiver and bad for a runner, so the
> strip must not editorialise. Bar length always means more of the metric; **direction is carried by
> a label**.

`SeriesBars`' **`scaled`** mode is already neutral (`bg-dp-slate-2`, `:77`). Its **`signed`** mode
colours by sign (`:49`), so a PROE or OFF-EPA strip would editorialise — and in 6a's distribution
strip it actively contradicts the inverted `DEF EPA ALL` cell colours, which is the follow-up 6a
flagged.

**Add an additive neutral option to `SeriesBars`** (e.g. `colour="neutral"`, default unchanged) that
renders `signed` mode's real zero axis with `bg-dp-slate-2` bars. Then:
- use it for **this slice's percentile strips**, and
- **update 6a's `Teams.jsx` distribution strip to pass it**, closing that inconsistency.

Do not change either mode's default colouring — `TrendCell` and the pop-up's Environment section both
depend on it.

---

## 4. Team holdings

Every skill player on this team, with: position tag, name, KTC value, and a meta line that differs by
ownership —

- **Yours** → `N% of roster` (that player's `ktcValue` ÷ your total roster value), in `dp-up-text`.
- **Someone else's** → `not owned · <manager>`, muted.
- **Unowned** → `not owned`, muted.

Source from `playerRows`, filtered on **`normalizeTeamForSchedule(nfl_team) === abbr`** — the same
domain hop 6a established, since the route param is an era-accurate code. Sort by `ktcValue`
descending, nulls last.

Reuse the roster-total denominator logic 6a built for `YOUR EXPOSURE` rather than recomputing it — and
the same rule applies: a null `ktcValue` is skipped, never treated as zero.

---

## 5. Coaching — two traps, both silent

The block shows head coach, offensive and defensive coordinator. Both traps make it render empty for
some or all teams while nothing looks broken.

### 5.1 The team key is `LAR`, not `LA`
`enrichment/coaching.json` keys the **Sleeper** domain. The route param is **era-accurate** (`LA`).
`getCoaching(payload, 'LA', …)` therefore returns nothing for the Rams.

`SCHEDULE_TEAM_ALIAS` is **one-way** (`LAR → LA`) and no inverse exists. Add one — an additive
reverse lookup in `nflStats.js`, derived from the same constant so the two cannot drift — and map the
route param back before calling `getCoaching`. **This is the exact mirror of the bug 6a caught in the
exposure join**; the domain boundary bites in both directions.

### 5.2 Every coaching entry is year **2026**; `dataSeason` is **2025**
So `getCoaching(payload, team, dataSeason)` returns `{HC: null, OC: null, DC: null}` for **every
team**.

**Resolve it by scoping the block to "now", not to the charted season.** Coaching is a current-state
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
- **6a's index rows become clickable in this slice** — that was the explicit deferral. Whole-row
  click plus keyboard (`Enter`/`Space`), reusing `dp/cells.jsx`'s `ClickableRow` pattern if it fits.
- An unknown or absent `:abbr` (a hand-typed URL, or a team not in the loaded season) renders a
  degraded state, **not** a crash and not a redirect — the same treatment as any absent data.
- `navRouting.test.jsx` keeps its own duplicate route table and needs `/teams/:abbr` added.

---

## 7. Tests

- **The on-demand load fires once on mount**, requests only the missing seasons, and merges rather
  than replacing. Assert `Promise.allSettled` semantics: one rejected season still writes the others.
- **The chart renders with a partial window** — five seasons present, nine absent, void slots for the
  rest, no gating.
- **`SeriesBars` neutral option** — `signed` + neutral renders slate bars with the zero axis intact;
  the default `signed` colouring is unchanged (a regression guard for `TrendCell` and Environment).
- **Coaching domain** — a route param of `LA` resolves the `LAR` coaching entries. This is the
  6a-mirror bug; assert it explicitly with a synthetic Rams case.
- **Coaching year** — the block queries the enrichment's year, not `dataSeason`, and is labelled with
  it; an empty payload renders a `DegradedBlock`.
- **Holdings** — a `LAR` player appears on the `LA` team page; ownership meta differs correctly across
  yours / another manager's / unowned; null `ktcValue` skipped.
- **Unknown `:abbr`** renders degraded, not a crash.
- Existing tests pass unedited except `navRouting.test.jsx` and any 6a test asserting rows are not
  clickable — both required updates.

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
| `CLAUDE.md` routing table | `/teams/:abbr` |
| `CLAUDE.md` `src/components/` + `src/utils/` tables | Team detail; `nflStats.js` gains the reverse alias; `SeriesBars` gains the neutral option |
| `docs/ui.md` | Team detail: the cards, the on-demand window, holdings, and the coaching block's **year and domain** caveats |
| `docs/signal-registry.md` | **Check** — the enrichment overlay's Current-use cell has read *unrendered* since 1b Slice viii; this slice gives coaching its **first renderer**, which changes it and fires **CR-18** |

---

## 10. Cross-repo impact

**Determine in planning.** Near-certain: **CR-18 fires** — the enrichment overlay's `docs/signal-registry.md`
row has read unrendered since the Explorer was deleted, and coaching gets its first renderer here.
Also check the teamcontext row, whose Current-use cell **enumerates consumers** (6a changed it), and
whether widening the window from 5 to 14 seasons is worth recording there.

**CR-10** covers teamcontext and this slice adds a consumer plus a load-window change — check its
app-side triggers.

Emit every firing entry's `Mirror` **verbatim**, and read each `Direction` field rather than assuming
— CR-18's is `data→app`.

---

## 11. Done-definition

- [ ] On-demand load: fires once, fetches only missing seasons, `allSettled`, `cancelled` flag, one
      merged write; the 5-season effect untouched
- [ ] Chart renders a partial window without gating
- [ ] Four cards use `computeTeamSeasonMetrics`; no re-derived field expressions; `scaled` states its floor
- [ ] `SeriesBars` neutral option added; **6a's distribution strip updated to use it**; default
      colouring unchanged
- [ ] Coaching resolves `LA → LAR` via an additive reverse alias derived from `SCHEDULE_TEAM_ALIAS`
- [ ] Coaching queries the enrichment's own year and is **labelled** with it
- [ ] Holdings filter on `normalizeTeamForSchedule(nfl_team)`; roster denominator reused from 6a
- [ ] Index rows clickable + keyboard; unknown `:abbr` degrades
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Cross-repo determined; `Mirror` texts quoted
- [ ] Smoked per §8, **including the Rams**

---

## 12. Hand-back should report

- The observed size/time of the 14-season load, measured not estimated.
- What the Rams page showed — holdings count and coaching names. That single page exercises both
  domain hops.
- Whether the neutral strip landed in both places.
- The cross-repo determination.
- Anything in §1 that had drifted.
