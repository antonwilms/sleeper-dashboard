# Slice 5c — Market: the four environment filters

**Program:** [dp-v2.md](dp-v2.md). Follows
[dp-v2-5b-efficiency-set.md](dp-v2-5b-efficiency-set.md).
**Model:** sonnet. Fully specified below.
**Baseline:** app `0896069` (re-verify against the post-5b HEAD before starting).

**Design source is not in this repo** — Claude Design project only. Everything needed is restated here.

Adds four filters to Market's panel, marked `NEW`: **Team PROE · Team pace · Team off. EPA/play ·
Team RZ TD rate**. They join per player through `resolvePlayerTeam`, so a filter on the offence is a
filter on the player.

---

## 0. This slice exists because 5b's review found six problems in it

Split out of 5b after that slice drew twenty flags. All six findings below were verified against live
source **before** this file was written — function bodies, not export names, which is the failure
mode the last two drafts shared.

| Finding | Resolved in |
|---|---|
| `SERIES_METRICS` is not the filter set | §2 |
| `computeLeagueStanding` is O(all teams × all games) **per call** | §3 |
| `applyMarketFilters`' signature has no path for the data the join needs | §4.2 |
| Adding required keys to `isRestorableFilters` invalidates every saved preset | §5 |
| `32 = any` inverts the control direction | §4.1 |
| Two filter components were missing from the file list | §6 |

---

## 1. Confirmed against live source

| Fact | Site |
|---|---|
| **`computeTeamSeasonMetrics` DOES return `epaPerPlay`** — along with `proe`, `pace`, `successRate`, `rzTdRate`, `passEpaPerPlay`, `rushEpaPerPlay`, `playsPerGame`, `pointsPerGame`, `defEpaPerPlay`, `games` | `utils/environment.js:50-70` |
| **`SERIES_METRICS = ['proe','pace','successRate','rzTdRate']`** — the *pop-up's* four, **not** these filters' four | `environment.js:73` |
| `LOWER_IS_BETTER = new Set(['pace'])` — correct for this filter set too (`epaPerPlay` is higher-is-better) | `environment.js:74` |
| **`computeLeagueStanding(loaded, metricId, team)` re-runs `computeTeamSeasonMetrics` for ALL teams on every call**, to return one team's rank | `environment.js:92-110` |
| `applyMarketFilters(rows, filters, { playerMap, myTeamName, seasonProjections })` — **no ctx path for teamcontext, season or careerStats** | `utils/marketFilters.js:79` |
| Sentinel gating compares against `DEFAULT_MARKET_FILTERS`: `if (f.ageRange[0] !== d.ageRange[0] || …)` | `marketFilters.js:84-90` |
| **`isRestorableFilters` is a strict conjunction of per-key checks** — an absent key yields `undefined` and fails | `marketFilters.js:194-210` |
| `FilterBar.loadPresets` **drops** any stored preset failing that check | `FilterBar.jsx:30-35` |
| `buildPills(f)` is a hand-written per-key `if` chain comparing against defaults | `FilterBar.jsx:39+` |
| `FilterPanel` has a reusable `RangeSlider({ label, min, max, step, value, onChange, unit })`, already used single-valued for `minProjectedGames` | `FilterPanel.jsx:56,239-250` |
| `MAX_PROJECTED_GAMES` sets the precedent for a named bound constant | `marketFilters.js` |

---

## 2. The metric ids — a new list, not `SERIES_METRICS`

The four filters map to `computeTeamSeasonMetrics` keys:

| Filter | Metric id | Direction |
|---|---|---|
| Team PROE | `proe` | higher is better |
| Team pace | `pace` | **lower is better** |
| Team off. EPA/play | `epaPerPlay` | higher is better |
| Team RZ TD rate | `rzTdRate` | higher is better |

**Do not reuse `SERIES_METRICS`.** It is the pop-up Environment section's list — it carries
`successRate`, which is not a filter, and lacks `epaPerPlay`, which is. Declare a separate
`FILTER_METRICS` (additive export in `environment.js`), and add a comment at both constants saying
they are deliberately different sets so nobody "fixes" one to match the other.

`LOWER_IS_BETTER` already contains exactly `pace`, so the existing direction handling is correct for
this set. **Do not re-invert it** — a silently reversed pace rank is the least visible defect this
slice can ship.

---

## 3. A memoised rank table — the performance fix

`computeLeagueStanding` re-runs `computeTeamSeasonMetrics` for **all 32 teams** (each summing ~17 REG
rows) to return **one** team's rank. Called inside a filter predicate that is ~600 rows × 4 metrics,
that is roughly 2,400 full-league recomputations per keystroke.

**Build the table once.** New additive export in `environment.js`:

```js
buildLeagueRankTable(loaded, metricIds) → { [metricId]: { [team]: rank } }   // 1 = best
```

One pass: `computeTeamSeasonMetrics(t.games)` per team (32 calls total), then rank each metric,
honouring `LOWER_IS_BETTER`. Teams with a `null` metric are unranked and absent from that map.

Memoise it in `Market.jsx` on `teamContextByYear[dataSeason]`, and pass the table — not the loader —
into the filter. **Leave `computeLeagueStanding` alone**; the pop-up's single-team use is fine at one
call per render, and refactoring it to share this table is a cleanup, not this slice's job.

---

## 4. The four filter keys

### 4.1 Sentinel: `32` means "any", and the control's floor is `1`
```js
envProeTop:  32,   // 32 = any = inactive
envPaceTop:  32,
envEpaTop:   32,
envRzTdTop:  32,
```

A player passes when his team's rank for that metric is `<= N`.

**This is the first filter whose off-state is its maximum.** Every existing one is off at a minimum
(`minProjectedGames` off = `0`) or at a full span (ranges). The sentinel *gating* convention still
holds — filter only when the value differs from the default — but the control reads inverted, so:
- the `RangeSlider`'s `min` must be **`1`**, not `0`. `0` would mean "no team passes", which is not a
  state the user should be able to reach.
- the label reads `top N of 32`, and at `32` it reads **`any`**.

Use a named constant (`LEAGUE_TEAM_COUNT = 32`) rather than a literal, and derive the slider's `max`
and the sentinel from it — the value appears in the default, the predicate, the pill label and the
panel bound, and four copies of a magic number is how they drift.

### 4.2 `applyMarketFilters` needs a wider ctx
Its third argument is `{ playerMap, myTeamName, seasonProjections }` — none of which reaches
teamcontext. Widen it additively:

```js
applyMarketFilters(rows, filters, { playerMap, myTeamName, seasonProjections, rankTable, careerStats, season })
```

`rankTable` is §3's memo; `careerStats` + `season` are what `resolvePlayerTeam` needs at season grain.
**Additive only** — every existing caller keeps working, and the new keys are read defensively.

### 4.3 Predicate rules
- Join at **season grain**: `resolvePlayerTeam({ careerStats }, playerId, season)`. Season grain reads
  `careerStats[season][pid].team` and needs no gamelogs — do **not** use the week grain here.
- **A player with no resolved team, or a team with no rank, passes at rest and is dropped only once
  the control moves.** That is the same graceful-null rule every existing range filter follows.
- **If `rankTable` is absent entirely** (no teamcontext for the season), the four filters are
  **inert** — they must not empty the table. State what you did in the hand-back.
- Each counts toward `activeFilterCount` and renders a pill.

---

## 5. Saved presets: absent ≠ invalid

**Adding four required clauses to `isRestorableFilters` would silently delete every saved preset.**
It is a strict conjunction (`marketFilters.js:194-210`); a pre-5c preset has no `envProeTop`, so the
check yields `undefined`, fails, and `FilterBar.loadPresets` **drops the whole preset**. The user
loses named presets with no message.

**The strict-drop policy is right for corrupted values and wrong for absent new ones.** Its stated
reason is that silently applying a salvaged preset would mean something other than what the user
saved — but a key that did not exist when they saved it carries no such ambiguity: its absence means
exactly what they saved, since the dimension was not offered.

So:
- In **`isRestorableFilters`**, accept absent env keys: `raw.envProeTop === undefined || isValidEnvTop(raw.envProeTop)`.
- In **`normalizeFilters`**, default an absent env key to `32` rather than rejecting the payload.
- Keep the strict behaviour for a **present but invalid** value — that is genuine corruption.

**The test that matters is the migration one**, not the round-trip. Saving a new preset and reloading
it passes either way; the assertion that catches this is *a stored pre-5c preset payload survives and
applies*. Write that one explicitly.

---

## 6. The two components the earlier draft missed

- **`FilterBar.buildPills(f)`** (`:39+`) is a hand-written per-key `if` chain. Add four clauses, each
  gated on `f.envXTop !== d.envXTop`, labelled e.g. `PROE top 10`.
- **`FilterPanel`** (`:180+`) is a hand-written group grid. Add a group with four `RangeSlider`s,
  `min={1} max={LEAGUE_TEAM_COUNT}`, marked **`NEW`** per the design.

Neither is data-driven, so neither picks up a new key automatically — this is exactly why they were
worth naming.

---

## 7. Tests

- **`32` is inert; `10` keeps only top-10 teams.** Assert both.
- **Pace direction** — a known-fast team ranks 1. This is the invisible one; assert it explicitly
  rather than trusting `LOWER_IS_BETTER`.
- **`epaPerPlay` is rankable** — it is absent from `SERIES_METRICS`, so a test that only exercises
  that list would miss it entirely.
- **Graceful nulls** — a player with no resolved team, and a team with no rank, both survive at rest
  and drop once the control moves; an absent `rankTable` leaves all four inert.
- **Preset migration (§5)** — a stored payload with **no** env keys survives `isRestorableFilters`,
  loads, and applies with the four defaulting to `32`. A payload with a *present but invalid* env
  value is still dropped.
- **Rank table is built once** — assert `computeTeamSeasonMetrics` is not called per row (spy, or
  assert the memo's identity is stable across a filter change).
- Existing filter tests pass unedited.

---

## 8. Smoke

Per `CLAUDE.md` → Workflow convention:
- set **Team pace** to top 10 and confirm the survivors are **fast** offences, not slow ones — this is
  the check that catches a reversed rank, and nothing else will;
- set **Team PROE** to top 10 and confirm they are pass-heavy;
- combine two environment filters and confirm the count falls sensibly rather than to zero;
- **before rebuilding, save a preset on the current build**, then rebuild and confirm it still loads —
  §5's failure is invisible to a fresh profile;
- the panel's `NEW` markers show, and the pills read `top N`;
- no console errors.

---

## 9. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `market/Market.jsx` + `marketFilters.js` rows | Twelve dimensions → sixteen; the rank table; the widened `applyMarketFilters` ctx |
| `docs/ui.md` → *Market* filter bar/panel | The four filters, the `32 = any` sentinel, the preset-compatibility rule |
| `CLAUDE.md` `src/utils/` table | `environment.js` gains `FILTER_METRICS` + `buildLeagueRankTable` |

---

## 10. Cross-repo impact

**Verify against the post-5b state rather than assuming.** 5b already makes Market a `teamContext`
consumer (carry share), so by the time this lands `docs/signal-registry.md`'s teamcontext row may
already name Market — in which case **no Current-use cell changes and CR-18 does not fire**.

What is near-certain: **CR-10's app-side trigger list gains this slice's call sites**
(`buildLeagueRankTable`, the filter predicate). Extending a trigger list is in-repo work.

**Do the check in planning, not at implementation time** — CLAUDE.md makes the `Mirror` text a
Session-1 deliverable, and this program has now had CR-18 fire on five slices that expected nothing.
If a cell does change, emit CR-18's `Mirror` verbatim from `docs/cross-repo-registry.md`, and note
that **its `Direction` field is `data→app`** — this program has written that wrong twice.

---

## 11. Done-definition

- [ ] `FILTER_METRICS` is its own list; `SERIES_METRICS` untouched, both commented as deliberately different
- [ ] `buildLeagueRankTable` built **once** per season in a memo; `computeLeagueStanding` not called per row
- [ ] `computeLeagueStanding` left unchanged
- [ ] `LEAGUE_TEAM_COUNT` named once and derived everywhere; slider `min={1}`
- [ ] `applyMarketFilters` ctx widened **additively**; existing callers unchanged
- [ ] Graceful nulls: unresolved team, unranked team, and absent `rankTable` all pass at rest
- [ ] **Pre-5c presets still load** — absent env keys accepted, present-but-invalid still dropped
- [ ] `buildPills` and `FilterPanel` both updated; `NEW` markers present
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Cross-repo determination made in planning (§10), with `Mirror` text if it fires
- [ ] Smoked per §8, including the saved-preset survival check

---

## 12. Hand-back should report

- Which teams survived a `top 10` **pace** filter, by name — the proof the direction is right.
- That a preset saved before the change still loads and applies.
- What happens with no teamcontext for the season.
- The cross-repo determination and, if it fired, the `Mirror` text.
- Anything in §1 that had drifted.
