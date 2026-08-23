# Slice 6a — Teams index

**Program:** [dp-v2.md](dp-v2.md). Follows Slice 5 (5a/5b/5c) and the denominator-floor fix
(`261f1c3`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `261f1c3`.

**Design source is not in this repo** — Claude Design project only, block `5a`. Everything needed is
restated here.

---

## 0. Slice 6 splits on the data-dependency seam

| | Scope | New data |
|---|---|---|
| **6a — this file** | The 32-team index, `/teams`, nav | **None.** Uses the season already loaded plus `playerRows` |
| **6b — next** | Team detail `/teams/:abbr`, 14-season charts, holdings, coaching | **A 14-season `teamContext` window**, loaded on demand |

**Only team detail needs the long window.** The index reads one season — `teamContextByYear[dataSeason]`,
already loaded since Slice 2 and widened to five by 4c. So 6a costs **zero** new fetching, and the
14-season question belongs entirely to 6b.

**Rows are not clickable in 6a.** `/teams/:abbr` does not exist yet, and this program does not ship
dead links or placeholder routes (`ACT` was removed in 5a for exactly that). 6b adds the route and row
navigation in the same change.

---

## 1. Confirmed against live source (`261f1c3`)

| Fact | Site |
|---|---|
| **`computeTeamSeasonMetrics(games)` returns every column this index needs** — `proe`, `pace`, `successRate`, `epaPerPlay`, `rzTdRate`, `defEpaPerPlay`, `pointsPerGame`, plus `passEpaPerPlay`, `rushEpaPerPlay`, `playsPerGame`, `games` | `utils/environment.js:50-70` |
| It is **REG-only** internally (`sumRegOff`/`sumRegDef`) — no caller-side filtering needed | `environment.js:50-52` |
| `buildLeagueRankTable(loaded, metricIds)` (5c) computes `computeTeamSeasonMetrics` **once per team** and returns `{ [metricId]: { [team]: rank } }`, honouring `LOWER_IS_BETTER` | `environment.js` (5c addition) |
| `LOWER_IS_BETTER = new Set(['pace'])` — **`defEpaPerPlay` is NOT in it** (see §3.2) | `environment.js:74` |
| `PRIMARY_NAV` is now `[portfolio, market]`; `NAV_GROUPS` resolves entries by **key** via `byKey()`, which throws on a miss | `shell/navItems.js` (5a) |
| Routes live in `App.jsx`; `/league/:view` is the precedent for a param route | `App.jsx:1059-1098` |
| `playerRows` carry `ownerTeamName`, `ktcValue`, `nfl_team`, `position`, `full_name` | `App.jsx` playerRows pipeline |
| Loader results are gated on **`complete`**, never key presence | every loader header; Slice 2 §3.3 |
| `resolvePlayerTeam` at season grain reads `careerStats[season][pid].team` and returns **era-accurate** codes | `utils/playerTeam.js:56-64` |

---

## 2. Scope

- New route `/teams`, new surface component, new nav entry.
- **No new prop plumbing beyond what Market already receives** — the index needs
  `teamContextByYear`, `playerRows`, `careerStats`, `myTeamName`, all already threaded to Market and
  available in `App.jsx`.
- **Do not modify `environment.js` beyond additive exports** (§3.1).
- **Do not add `/teams/:abbr`**, a placeholder for it, or clickable rows.

---

## 3. The index

Columns, in order — default sort **PROE descending**:

`TEAM · PROE ↓ · PACE · SUCC% · OFF EPA/PL · RZ TD% · DEF EPA ALL · PTS/G · YOUR EXPOSURE`

Every column except `TEAM` and `YOUR EXPOSURE` comes straight off `computeTeamSeasonMetrics`. All 32
teams, one row each, sortable on every column.

### 3.1 One metrics pass, and the duplication to avoid
The index needs metric **values**; 5c's `buildLeagueRankTable` needs **ranks** and computes the same
per-team metrics internally. Computing both independently means two full passes.

Add an additive `buildTeamMetricsTable(loaded)` → `{ [team]: metricsObject }` (32 calls to
`computeTeamSeasonMetrics`), and **give `buildLeagueRankTable` an optional prebuilt-table parameter**
so a caller that already has the table does not recompute it. Additive: existing callers pass nothing
and behave exactly as today.

Memoise the table in the Teams surface on `teamContextByYear[dataSeason]`.

### 3.2 `DEF EPA ALLOWED` is lower-is-better, and `LOWER_IS_BETTER` does not know that
`LOWER_IS_BETTER` contains only `pace`. That is correct for its current users — 4c's Environment
section and 5c's filters, neither of which ranks `defEpaPerPlay`.

**This index does rank it, and a defence allowing *less* EPA is better.** So either extend
`LOWER_IS_BETTER` with `defEpaPerPlay` (check nothing else depends on its current membership — 4c's
`SERIES_METRICS` and 5c's `FILTER_METRICS` both exclude `defEpaPerPlay`, so extending is safe) or pass
direction explicitly. **Extending is preferred** — one source for "which way is good" beats a second
convention.

**Colour follows the same logic and is easy to get backwards:** for `DEF EPA ALL`, negative is
**good** (blue), positive is bad (amber) — the inverse of `OFF EPA/PL`. Getting this wrong makes the
best defences look worst, and nothing in the table will look obviously broken.

### 3.3 `YOUR EXPOSURE` — the column that justifies the surface
Two values per team: **how many of your players are on it**, and **what share of your roster value
they represent**.

- Scope to rows where `ownerTeamName === myTeamName`, group by `nfl_team`.
- Share = `Σ ktcValue` for your players on that team ÷ `Σ ktcValue` across your whole roster. Skip
  rows with a null `ktcValue` in **both** numerator and denominator — do not treat absent as zero.
- A team you have nobody on renders **`none`** and `—`, muted — not `0 players` / `0%`.
- `myTeamName` null (the user has no roster in this league) → render the column as `—` throughout
  rather than hiding it; Portfolio's precedent for a null `myTeamName` is an explicit empty state, not
  a silently different layout.

**Use `nfl_team` off the row, not `resolvePlayerTeam`.** Exposure is a question about *now* — which
NFL team your players are currently on — not about historical attribution. `resolvePlayerTeam` answers
a per-season question and would return an era-accurate historical code, which is wrong here.

### 3.4 The league distribution strip
Beneath the header, a strip showing the distribution of the **currently sorted** column across all 32
teams, re-drawn when the sort changes. It is what makes a single team's `+3.2` readable.

Reuse `SeriesBars`' visual language if it fits; if the shape genuinely differs (a distribution is not
a time series), build it locally rather than bending the primitive — and say which you did.

### 3.5 No coverage pips in the table body
The family has **zero nulls across fourteen seasons**, so pipping 288 identical cells is noise. This is
the coverage system used in the direction that *removes* marks; a system that only ever adds them is
one nobody reads. A single span in the header stating the season is enough.

---

## 4. Degraded state

`teamContextByYear[dataSeason]` absent or `complete: false` → the whole surface renders a
`DegradedBlock`, not an empty table. One state, whole-surface: unlike the pop-up's per-section
degradation, there is nothing else on this screen to show.

---

## 5. Nav and routing

- `PRIMARY_NAV` gains `{ key: 'teams', label: 'Teams', path: '/teams' }`.
- `NAV_GROUPS`' **MANAGE** group gains `byKey('teams')` — after Market.
- `App.jsx` gains `<Route path="/teams" element={…} />`.

The mobile tab bar is capped at 5 and currently holds two (plus seasonal Rookies), so Teams fits with
room. **Do not** add a `Me` entry or reorganise the tab bar — that was declared out of scope.

`byKey()` throws on a missing key, so a typo fails loudly at import rather than silently dropping a
nav item.

---

## 6. Tests

- All 32 teams render; sorting each column reorders correctly.
- **`DEF EPA ALL` sorts and colours inverted relative to `OFF EPA/PL`** — assert both directions
  explicitly. This is the defect nothing else surfaces.
- **Pace still sorts lower-is-better** after any `LOWER_IS_BETTER` change — a regression guard for
  5c's filters, which share that set.
- `YOUR EXPOSURE`: a team with your players shows count + share; a team without shows `none`/`—`, not
  zeros; shares sum to ~100% across teams; a null `ktcValue` is skipped rather than zeroed;
  `myTeamName` null renders `—` throughout.
- Incomplete/absent loader result renders the `DegradedBlock`, not an empty table.
- `buildLeagueRankTable`'s existing callers are unaffected by the new optional parameter.
- Nav: `/teams` routes; `PRIMARY_NAV` and `NAV_GROUPS` both carry Teams.

---

## 7. Smoke

Per `CLAUDE.md` → Workflow convention:
- sort by **PROE** — the top should be pass-heavy offences;
- sort by **DEF EPA ALL** ascending — the top should be **good** defences (most negative). If the
  worst defences are on top, the direction is inverted;
- **`YOUR EXPOSURE`** shows real counts against your Dynasty 040 roster, and the shares look
  plausible — this is the column the surface exists for;
- a team you have nobody on reads `none`, not `0 players`;
- Teams appears in the rail under MANAGE and in the mobile tab bar;
- no console errors.

---

## 8. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` routing table + nav paragraph | `/teams`; Teams under MANAGE |
| `CLAUDE.md` `src/components/` table | The new surface |
| `CLAUDE.md` `src/utils/` table | `environment.js` gains `buildTeamMetricsTable` and an optional param on `buildLeagueRankTable` |
| `docs/ui.md` | A Teams section: columns, the exposure join, the distribution strip, the no-pips decision |

---

## 9. Cross-repo impact

**Determine it in planning, not at implementation time** — this program has had CR-18 fire on five
slices that expected nothing.

`teamContext`'s `docs/signal-registry.md` Current-use cell already reads *rendered* (4c) and already
names Market (5b/5c). **This slice adds a third consumer and the first surface built entirely on the
family** — check whether the cell's wording enumerates consumers; if it does, it changes and **CR-18
fires**, and CR-10's app-side trigger list gains the new call sites regardless.

Emit any firing entry's `Mirror` **verbatim**, and read its own `Direction` field rather than assuming
— CR-18's is `data→app`.

---

## 10. Done-definition

- [ ] `/teams` routes; Teams in `PRIMARY_NAV` and MANAGE; rows **not** clickable
- [ ] One metrics pass — `buildTeamMetricsTable` additive, `buildLeagueRankTable` given an optional
      prebuilt table, existing callers unchanged
- [ ] `DEF EPA ALL` ranks **and colours** inverted vs `OFF EPA/PL`; pace unaffected
- [ ] `YOUR EXPOSURE` uses `nfl_team`, skips null `ktcValue`, renders `none` not `0`
- [ ] Whole-surface `DegradedBlock` when the season is absent or incomplete
- [ ] No coverage pips in the table body
- [ ] No new prop plumbing beyond what already exists; `environment.js` additive only
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Cross-repo determination made (§9), `Mirror` quoted if it fires
- [ ] Smoked per §7, including the DEF EPA direction check

---

## 11. Hand-back should report

- What `YOUR EXPOSURE` showed for your top three teams by share.
- The DEF EPA sort direction, checked against a known-good defence.
- Whether the distribution strip reused `SeriesBars` or was built locally, and why.
- The cross-repo determination.
- Anything in §1 that had drifted.
