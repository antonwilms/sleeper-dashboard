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
| `LOWER_IS_BETTER = new Set(['pace'])` — its **only** consumers are `computeLeagueStanding` and `buildLeagueRankTable`, both in `environment.js` | `environment.js:84` |
| **`usePlayersTable`'s first-click direction is hard-coded** — `ascByDefault` is `full_name`/`ceilingRank`/`floorRank` only | `hooks/usePlayersTable.js:45` |
| **`nfl_team` is `playerMap[id].team ?? 'FA'` — the SLEEPER domain, including `LAR`**, and the literal string `'FA'` for free agents | `App.jsx:380` |
| **teamcontext keys the nflverse/era-accurate domain — `LA`, not `LAR`** (verified in the 2025 file) | data repo `f0c1fc4` |
| `normalizeTeamForSchedule` (`SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }`) exists for exactly this hop — CR-16 | `utils/nflStats.js:2-7` |
| `playerTeam.js`'s header states `playerMap[pid].team` is **deliberately never** fed in raw | `playerTeam.js:20-22` |
| **`dataSeason` is not App state and not a prop** — Market re-derives it locally | `Market.jsx:372-384` |
| Market and Portfolio both take `loaded={!!careerStats}` and render an explicit loading state | `App.jsx:1067,1075` |
| `navRouting.test.jsx` keeps its **own duplicate route table** | `navRouting.test.jsx` |
| `PRIMARY_NAV` is now `[portfolio, market]`; `NAV_GROUPS` resolves entries by **key** via `byKey()`, which throws on a miss | `shell/navItems.js` (5a) |
| Routes live in `App.jsx`; `/league/:view` is the precedent for a param route | `App.jsx:1059-1098` |
| `playerRows` carry `ownerTeamName`, `ktcValue`, `nfl_team`, `position`, `full_name` | `App.jsx` playerRows pipeline |
| Loader results are gated on **`complete`**, never key presence | every loader header; Slice 2 §3.3 |
| `resolvePlayerTeam` at season grain reads `careerStats[season][pid].team` and returns **era-accurate** codes | `utils/playerTeam.js:56-64` |

---

## 2. Scope

- New route `/teams`, new surface component, new nav entry.
- **No new prop plumbing beyond what Market already receives** — the index needs
  `teamContextByYear`, `playerRows`, `careerStats`, `myTeamName`, all available at the Route element
  in `App.jsx`.
- **Also take `loaded={!!careerStats}`**, matching Market and Portfolio. Without it the entire
  multi-minute career load renders as a *degraded* surface (§4) rather than a loading one — the data
  is not missing, it has not arrived.
- **`dataSeason` has no defined source.** It is not App state and not a prop, and Market re-derives it
  locally (`Market.jsx:372-384`). Do not add a **third** copy of that derivation: add a tiny exported
  helper (e.g. `deriveDataSeason(careerStats)`) and use it here. Leave Market and `App.jsx` alone —
  adopting it there is a follow-up, not this slice, but a helper stops the drift growing.
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
`computeTeamSeasonMetrics`) and memoise it in the surface.

**Do NOT add an optional prebuilt-table parameter to `buildLeagueRankTable`.** The earlier draft
proposed one to avoid a duplicate pass — but **this index consumes no ranks at all** (no column,
colour rule or strip uses one), and the only rank consumer, Market, holds its own loader result and
never mounts alongside Teams. The duplicate pass is never incurred, so the parameter would be unused
API plus a test for it.

### 3.2 `DEF EPA ALLOWED` — the surface owns its direction, and `LOWER_IS_BETTER` is not involved
The earlier draft proposed extending `LOWER_IS_BETTER` with `defEpaPerPlay`. **That is safe but a
no-op here.** That set's only consumers are `computeLeagueStanding` and `buildLeagueRankTable`, and
this index renders **values** and sorts them — it calls neither. Do not extend it; the change would
have no effect and would imply one.

**Sort direction and colour are the surface's own job, and both are inverted for this column:**
- **Sort.** `usePlayersTable`'s first-click direction is hard-coded (`ascByDefault` covers
  `full_name`, `ceilingRank`, `floorRank`). `DEF EPA ALL` is a *lower-is-better* number, so its first
  click should sort **ascending** — best defences first. Either add it to that set (additive, and the
  precedent is exactly the rank columns already there) or handle it in the surface's own comparator.
- **Colour.** Negative is **good** (blue), positive is bad (amber) — the **inverse** of `OFF EPA/PL`.
  Get this backwards and the best defences render as the worst, with nothing in the table looking
  broken.

### 3.3 `YOUR EXPOSURE` — the column that justifies the surface
Two values per team: **how many of your players are on it**, and **what share of your roster value
they represent**.

- Scope to rows where `ownerTeamName === myTeamName`, group by **`normalizeTeamForSchedule(nfl_team)`**.
  **Not raw `nfl_team`.** That field is `playerMap[id].team` — the **Sleeper** domain, which uses
  `LAR` — while teamcontext keys the era-accurate domain, which uses `LA`. Ungated, every Rams player
  lands in an unmatched bucket and the LA row reads `none`. `normalizeTeamForSchedule`
  (`nflStats.js:2-7`) exists for precisely this hop, and `playerTeam.js`'s header records that
  `playerMap[pid].team` must never be fed in raw. This is CR-16's domain boundary.
- Share = `Σ ktcValue` for your players on that team ÷ `Σ ktcValue` across your whole roster. Skip
  rows with a null `ktcValue` in **both** numerator and denominator — do not treat absent as zero.
- A team you have nobody on renders **`none`** and `—`, muted — not `0 players` / `0%`.
- **`nfl_team` is the literal string `'FA'` for a free agent, not null.** Such a player is a real
  asset and belongs in the roster-value **denominator**, but has no team bucket. So team shares sum to
  **≤ 100%**, with the remainder being value held in players not on an NFL roster. That is correct;
  state it in the UI if the gap is ever large, and **do not** normalise the shares to 100% — that
  would silently redistribute value the user does not have on any of these teams.
- **The 32 rows are driven by teamcontext's own `teams` keys**, not by `marketFilters.NFL_TEAMS`
  (which carries `LAR`). Using the loader's keys makes the join domain-consistent by construction.
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

Two distinct states — do not collapse them:

- **`loaded === false`** (career load in progress) → the surface's **loading** state, as Market and
  Portfolio render. The data is not missing; it has not arrived.
- **`loaded === true` but `teamContextByYear[dataSeason]` absent or `complete: false`** → a
  whole-surface `DegradedBlock` of kind **`not-yet-accruing`**. One state for the whole screen —
  unlike the pop-up's per-section degradation, there is nothing else here to show.

**Name the `kind` explicitly.** `DegradedBlock` falls through to
`String(kind ?? '').toUpperCase()` for an unrecognised value, which renders an **empty label** rather
than failing.

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
- **`YOUR EXPOSURE` domain join** — a player whose `nfl_team` is `LAR` counts toward the **`LA`** row.
  Assert this explicitly; without the normalisation the LA row reads `none` and nothing else looks
  wrong.
- **`'FA'` players** are in the denominator but no team bucket, so team shares sum to **≤ 100%** and
  are **not** normalised up. Assert the shares are not rescaled.
- A team with your players shows count + share; a team without shows `none`/`—`, not zeros; a null
  `ktcValue` is skipped rather than zeroed; `myTeamName` null renders `—` throughout.
- **`DEF EPA ALL` first-click sorts ascending** (best defences first) while `OFF EPA/PL` sorts
  descending — assert both, plus the inverted colour rule.
- **Loading vs degraded are distinct** — `loaded=false` renders the loading state, not a
  `DegradedBlock`.
- Incomplete/absent loader result renders the `DegradedBlock`, not an empty table.
- Nav: `/teams` routes; `PRIMARY_NAV` and `NAV_GROUPS` both carry Teams. **`navRouting.test.jsx`
  keeps its own duplicate route table** and needs `/teams` added there too — a required update.

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
| `docs/ui.md` | A Teams section: columns, the exposure join (incl. the `LAR→LA` normalisation and the `'FA'` remainder), the distribution strip, the no-pips decision |
| **`docs/signal-registry.md:58`** | **Required — CR-18 fires (§9).** That Current-use cell **enumerates consumers** ("consumed by `dp/EnvironmentSection.jsx` … second consumer since 5b … third use since 5c"), so a fourth changes it |

---

## 9. Cross-repo impact — settled here, two entries fire

The earlier draft left this to Session 2. It resolves now, and both entries fire.

**CR-18 fires.** `docs/signal-registry.md:58`'s teamcontext Current-use cell **enumerates its
consumers** by name and slice — so a fourth consumer, and the first surface built entirely on the
family, changes it.

**CR-10 fires.** `src/utils/environment.js` is a named app-side trigger and this slice adds
`buildTeamMetricsTable` plus a new rendering surface over `off.*` / `def.*`.

Emit **both** `Mirror` texts **verbatim** from `docs/cross-repo-registry.md` in the hand-back. Read
each entry's own `Direction` field rather than assuming — **CR-18's is `data→app`**, which this
program has written wrong twice.

The reviewer re-verified CR-10's and CR-16's app-side trigger lists against live `src/`: **no
`[registry-stale]` and no `[registry-gap]`** this slice.

## 10. Done-definition

- [ ] `/teams` routes; Teams in `PRIMARY_NAV` and MANAGE; rows **not** clickable
- [ ] `buildTeamMetricsTable` added; **`buildLeagueRankTable` untouched** (no unused parameter)
- [ ] `LOWER_IS_BETTER` **not** extended — the surface owns direction and colour
- [ ] `DEF EPA ALL` first-click sorts ascending and colours inverted vs `OFF EPA/PL`
- [ ] `YOUR EXPOSURE` buckets on **`normalizeTeamForSchedule(nfl_team)`**; `'FA'` in the denominator
      only; shares **not** rescaled to 100%; rows driven by teamcontext's own keys
- [ ] `loaded` prop taken; loading and degraded are distinct states; `DegradedBlock` `kind` named
- [ ] `dataSeason` from a shared helper, not a third local derivation
- [ ] Whole-surface `DegradedBlock` when the season is absent or incomplete
- [ ] No coverage pips in the table body
- [ ] No new prop plumbing beyond what already exists; `environment.js` additive only
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] **CR-10 and CR-18 `Mirror` texts both quoted** in the hand-back (§9)
- [ ] Smoked per §7, including the DEF EPA direction check

---

## 11. Hand-back should report

- What `YOUR EXPOSURE` showed for your top three teams by share.
- The DEF EPA sort direction, checked against a known-good defence.
- Whether the distribution strip reused `SeriesBars` or was built locally, and why.
- The cross-repo determination.
- Anything in §1 that had drifted.

---

## 12. Plan-review record (2026-08-21)

Nine flags — the fewest since the review gate started catching structural problems, and the reviewer
verified more as clean than on any prior slice. Two changed the design.

**The exposure join crossed a team-code domain boundary.** `nfl_team` is `playerMap[id].team`, the
**Sleeper** domain including `LAR`, while teamcontext keys the era-accurate domain using **`LA`** —
verified in the 2025 file. Ungated, **every Rams player lands in an unmatched bucket**, the LA row
reads `none`, and nothing else on screen looks wrong. `normalizeTeamForSchedule` exists for exactly
this hop and `playerTeam.js`'s header already warns that `playerMap[pid].team` must never be fed in
raw. Also caught: `nfl_team` is the literal `'FA'` for free agents, so the draft's "shares sum to
~100%" was wrong — they sum to ≤100%, and normalising them up would silently redistribute value.

**§3.2 was solving the wrong problem.** Extending `LOWER_IS_BETTER` with `defEpaPerPlay` is safe but a
**no-op** — that set's only consumers are `computeLeagueStanding` and `buildLeagueRankTable`, and this
index calls neither. Sort direction and colour are the surface's own job, and `usePlayersTable`'s
first-click direction is hard-coded regardless.

**And §3.1 was optimising a cost that is never incurred.** The proposed prebuilt-table parameter had
no caller: the index consumes no ranks, and Market never mounts alongside Teams. Dropped rather than
shipped as unused API with a test attached.

The rest: no `loaded` prop, so the whole multi-minute career load would have rendered as *degraded*
rather than *loading*; the `DegradedBlock` `kind` was unnamed and falls through to an empty label;
`dataSeason` had no defined source and would have become its third local derivation; and
`navRouting.test.jsx` keeps a duplicate route table needing `/teams`.

**Cross-repo settled in planning rather than deferred:** CR-18 fires because the teamcontext
Current-use cell **enumerates consumers** by name and slice, and CR-10 fires because
`environment.js` is a named trigger. No `[registry-stale]` or `[registry-gap]` this slice — the first
time in several.

