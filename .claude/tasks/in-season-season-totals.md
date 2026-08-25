# In-season season-totals — close the live-season blind spot

Found by the FPA ranking's review (`.claude/tasks/fpa-defense-ranking.md` §0). **The app has no
in-progress-season data anywhere**, so it will render last-completed-season numbers on every surface
for the whole of a live season. Market's *"Fixed to the 2025 season"* header is that fact already
visible on the primary surface.

Spans both repos. **The central decision is §3: do NOT merge the live season into `careerStats`.**

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `loadCareerHistory` builds `for (let s = 2012; s < currentSeason; s++)` — strictly less-than, and it is the **only** writer of `setCareerStats` | `src/api/sleeperStats.js:240`; `App.jsx:854,858` |
| **No comment or doc justifies the exclusion** — it is not a recorded design decision | measured |
| `tryDataStore` defaults `allowInProgress: false`; the data repo marks the live year `inProgress: true` (`inProgress = year >= currentSeason`) | `dataStore.js:73,81`; `scripts/update-nfl.mjs:41` |
| **No workflow ingests `nfl/season-totals`.** Every other family has a weekly cron; this one's only invocation anywhere is `smoke-test.yml`'s `--dry-run` | data repo `.github/workflows/` |
| **All seven cron days are taken** — Mon KTC · Tue roster · Wed playerids · Thu advstats · Fri schedule · Sat gamelogs · Sun teamcontext. A new job shares a day at a different hour | `nflverse-teamcontext.yml:5-9` |
| `update-nfl.mjs` **overwrites an in-progress file freely** — it refuses only a *completed* season without `--force`, and content-hash dedup means no commit when unchanged | `scripts/update-nfl.mjs:60-85` |
| `dataSeason` = `max(Object.keys(careerStats))` and is **deliberately** careerStats-derived, not `nflState.season` — documented in CLAUDE.md and at three loader effects | `App.jsx:925-975`; CLAUDE.md |
| `careerStats` feeds the **entire scoring pipeline** — `computeDynastyScore`, `computeNextSeasonProjection`, `computeEmpiricalAgeCurves`, momentum, trajectory, comps | `App.jsx` playerRows pipeline |
| The app already side-loads four view-only families into their **own** state, never merged into `careerStats`: `advStats`, `teamContextByYear`, `gameLogsByYear`, `nflScheduleByYear` | `App.jsx` |
| A `gp >= 8` qualifying gate exists in `momentum.js`, `outlookConsistency.js` (`QUALIFYING_GP`) and `outlookPositionStats.js` — but it is **not universal** across the scoring path | measured |

---

## 2. Data repo — the missing cron

New workflow `nfl-season-totals.yml`, modelled on `nflverse-teamcontext.yml`:

- **Tuesday**, at an hour that does not collide with the roster job. Tuesday is right because MNF
  settles Monday night, so Tuesday is the first point the prior week is complete. **No ordering
  dependency** — season-totals reads only Sleeper's own API, no crosswalk and no nflverse input.
- Runs `node bin/update.mjs nfl --year <season>` **without** `--force`: the in-progress file is
  overwritten freely, and a completed season is correctly refused, so the job becomes a no-op the
  moment the season closes. That is the desired behaviour, not a limitation.
- **Resolve the season from the node step** (`setStepOutput('season', …)` → `${{ steps.fetch.outputs.season }}`),
  **never `date -u +%Y`** — Invariant 8, because calendar year and NFL season diverge Jan–Feb.
- Content-hash dedup already exists (`nflHash`), so an unchanged week produces no commit.
- **CDN purge** for the changed file and `manifest.json` (manifest first), per the session git
  workflow.
- Add the workflow to the dead-man's expectations — `bin/deadman.mjs` auto-discovers scheduled
  workflows, so this is automatic, but confirm it appears.

**One open question for implementation:** whether the weekly run should also refresh the *previous*
season for late stat corrections. Recommend **no** — Invariant 1 makes completed seasons append-only
and the job would refuse anyway. Note it rather than building it.

---

## 3. App repo — a separate slice, NOT `careerStats`

**This is the decision that matters.** The obvious move — widen the loop to `s <= currentSeason` — is
wrong, and would be a serious regression:

- **`careerStats` feeds the whole scoring pipeline.** A two-game 2026 season would read as a
  catastrophic collapse for every player: momentum, trajectory, empirical age curves and the
  projection all consume season rows. The `gp >= 8` gate exists in some helpers but **not
  universally**, so this cannot be waved through.
- **`dataSeason` would flip to 2026**, and it keys Market's Efficiency set, the environment filters,
  the Teams index and three loader windows. Every one would re-point at a season with one week of
  data.
- The app's own convention already answers this: **four view-only families are side-loaded into their
  own state and never merged into `careerStats`.** Follow that pattern exactly.

**So: a new view-only state slice, `currentSeasonTotals`.**

- Keyed on `nflState.season` (a **string** — coerce deliberately; `deriveDataSeason` returns a Number).
- Read with **`allowInProgress: true`** — the KTC path (`ktcHistory.js:147`) is the existing precedent
  for opting a single read into in-progress entries. Do **not** change `tryDataStore`'s default.
- **`lastModified`-driven freshness, not a long TTL.** The file mutates weekly, so the completed-season
  path's `setCache(…, 999999)` is wrong here. `nflRoster.js` is the template — it handles exactly this
  "weekly-mutable current-season file" case.
- Graceful absence: before the season starts, and between the season opening and the first cron run,
  there is no file. Return the empty shape; **every consumer must branch on the result's own flag,
  never on key presence** — the same rule CLAUDE.md states for the other view-only families.
- Exposed as an explicit prop / context value alongside the others.

**Explicitly NOT in scope:** making the scoring pipeline in-season aware. Whether a partial season
should ever inform `projectedPPG` or the dynasty score is a real question with a graded-gate answer,
and it must not ride along on a loader change. `careerStats`, `dataSeason` and every scoring module
are **untouched** by this slice.

---

## 4. What it unlocks

- **The FPA blend's current-season term becomes reachable** — `opponentStrength.js` already has the
  shape and the constant; it needs the season handed to it. This is the immediate payoff.
- Any future in-season surface (a real start/sit view, live usage, week-over-week trend) has a
  supported data path instead of needing its own.

**Do not retrofit other surfaces in this slice.** Market's Efficiency set, the environment filters and
Teams all deliberately pin to `dataSeason`; re-pointing any of them at a partial season is a product
decision per surface, not a consequence of this loader.

---

## 5. Tests

- **Loader**: `allowInProgress: true` is passed; a manifest entry marked `inProgress` is **accepted**
  here while the default path still rejects it (assert both, so the opt-in is provably scoped).
- **Freshness**: a newer `lastModified` invalidates the cache; an unchanged one serves from cache.
- **Absence**: no file → the graceful empty shape, and consumers branch on the flag, not key presence.
- **Isolation — the important one**: `careerStats` and `dataSeason` are **unchanged** when
  `currentSeasonTotals` is populated. Assert `deriveDataSeason` still returns the last completed
  season. This is the regression guard for §3's whole argument.
- **FPA**: with a current-season slice present, the blend's second term engages and the result moves
  toward the current rate; with it absent, the result is exactly the prior rate (the existing test).

---

## 6. Cross-repo impact

**CR-02 · season-totals schemaVersion & row composition** fires — this adds an app-side reader of the
family and a data-side producer cadence. Emit its Mirror **verbatim from the live registry region**
(`docs/cross-repo-registry.md`), not from an older task file; it was extended by F-24 and the copy in
`post-dp-v2-data-batch.md` is stale.

**Consider a new entry for the in-progress read contract.** The app opting into `inProgress: true`
for season-totals creates a coupling that does not exist today: if the data repo ever flipped the
live-year marking, or started writing partial weeks the app cannot distinguish from a complete
season, the app would serve partial data as if it were whole — with no error. CR-17's Mirror already
records the analogous hazard for KTC (*"flipping the manifest entry to `inProgress: false` is
breaking in the unusual direction — the app deliberately opts this path in"*). **Recommend drafting
the equivalent for season-totals**; decide during implementation and land it in both repos.

**`data-catalog.md`** — the season-totals row gains its refresh cadence, which it has never had.

Re-run the drift check at the end; the region is byte-identical as of data `199fa4d`.

---

## 7. Done-definition

- [ ] Weekly cron added, Tuesday, no collision; season resolved from the node step, never `date -u +%Y`
- [ ] The job is a no-op on a completed season (no `--force`), and dedup means no commit when unchanged
- [ ] CDN purge wired, manifest first; the workflow appears in the dead-man's discovery
- [ ] App: `currentSeasonTotals` is a **separate** view-only slice — `careerStats`, `dataSeason` and
      every scoring module are provably untouched
- [ ] `allowInProgress: true` is scoped to this one read; `tryDataStore`'s default is unchanged
- [ ] `lastModified`-driven freshness, not a 999999 TTL
- [ ] The isolation test (§5) passes — `deriveDataSeason` still returns the last completed season
- [ ] FPA's current-season term engages when the slice is present
- [ ] `npm test` green · `npm run lint` 0 · `npm run build` clean; data repo `npm run smoke` green
- [ ] CR-02 mirror carried out; the in-progress read entry decided and, if taken, landed in both repos
- [ ] `data-catalog.md` cadence row; drift check reports nothing

---

## 8. Timing

The 2026 season starts in roughly two weeks.

**There is no data-loss cliff — planning first claimed one and it was wrong.** `fetchSeasonWeeks`
loops weeks 1–18 unconditionally and aggregates from scratch every run, so a job first run in week 5
still yields weeks 1–5. **A missed or late cron costs staleness, not data.**

So the urgency is ordinary, not sharp: until the cron runs, the app keeps showing 2025 — which is
exactly today's behaviour, so nothing regresses by being late. §2 is still the half worth doing
first, because it is small and it is the piece with a real-world clock on it; §3 can follow whenever.
