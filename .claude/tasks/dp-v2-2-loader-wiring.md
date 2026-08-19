# Slice 2 — Wire the three dark loaders

**Program:** [dp-v2.md](dp-v2.md). Third slice; follows
[dp-v2-1-systems.md](dp-v2-1-systems.md) (landed `bc8a60d`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `f614788` · data `f0c1fc4`.

**No UI.** This slice makes three ingested-but-unreachable data families available to components and
proves the view-only contract still holds. Its acceptance is the guard tests plus one join test —
there is nothing to look at, which is exactly why it is separate from Slice 4.

**Design source is not needed for this slice** and is not in this repo (see
[dp-v2-1-systems.md](dp-v2-1-systems.md) §0). Nothing here renders.

---

## 0. Confirmed against live source (`f614788`)

| Fact | Site |
|---|---|
| `loadTeamContext(year)` → `{ teams, year, complete, rowCount }`; `EMPTY = { teams: {}, year: null, complete: false, rowCount: 0 }` | `src/api/teamContext.js:71,78` |
| `loadNflGameLogs(year)` → `{ players, … }`; `EMPTY = { players: {}, … }` | `src/api/nflGameLogs.js:59,66` |
| `loadNflSchedule(year)` → `{ games, … }`; `EMPTY = { games: [], … }` | `src/api/nflSchedule.js:47,60` |
| All three are **explicit-season, no probe**, and all three already do `lastModified`-aware permanent per-year IndexedDB caching and a sparsity re-assert | each loader, steps 2–5 |
| All three return a graceful empty shape on every failure path — **they never throw and never return `null`** | `if (!entry) return { ...EMPTY }` in each |
| `loadTeamContext` / `loadNflSchedule` have **zero call sites**; `loadNflGameLogs` has none either (only a docs comment, its own tests, and the guard) | `grep -rn` across `src/` |
| The closest precedent effect: `careerStats`-keyed, `cancelled`-flagged, `.catch` warns and swallows | `src/App.jsx:849-861` (`loadAdvStats`) |
| `resolvePlayerTeam({ careerStats, gameLogPlayers }, playerId, season, week = null)` — season grain reads `careerStats`, week grain reads `gameLogPlayers[pid].games[].team` | `src/utils/playerTeam.js:53-61` |
| `getTeamSeasonRows(loaded, team)` / `getTeamWeekRow(loaded, team, week)` take the **whole loader result**, not `.teams` | `src/api/teamContext.js:121,131` |
| The three guard tests exist and their `PIPELINE` lists are **projection/scoring modules only** — `App.jsx` is deliberately absent, so wiring there does not trip them | `src/__tests__/{teamContextViewOnly,gameLogsViewOnly,scheduleViewOnly}.test.js` |
| `ProfileDataContext` currently provides **ten** keys | `src/context/ProfileDataContext.jsx`; documented in `CLAUDE.md` |

**Data coverage that shapes the season decision** (from `sleeper-dashboard-data` @ `f0c1fc4`,
recorded in `docs/design_brief_v2/01-data-inventory.md`): `gamelogs` **2012–2025**, `teamcontext`
**2012–2025**, `schedule` **1999–2026**. There is **no 2026 gamelogs or teamcontext file** — the 2026
season has not been played.

---

## 1. Scope

**Delivers:** three loader calls, three pieces of `App.jsx` state, three new `ProfileDataContext`
keys, and one join test.

### 1.1 Must NOT do
- **No component reads any of this yet.** Slice 4 is the first consumer. Do not add a column, a
  section, or a chart.
- **Do not touch the guard tests' `PIPELINE` lists.** They enumerate projection/scoring modules; this
  slice adds none. Wiring to `App.jsx` and to the context is explicitly permitted by the contract —
  the point of the guards is that `seasonProjection.js` / `dynastyScore.js` never see this data, and
  they still do not.
- **Do not import any of the three into a `src/utils/` projection module**, and do not pass them into
  `computeNextSeasonProjection`, `computeDynastyScore`, or any `factors` computation. This is the
  invariant the whole program rests on.
- **Do not block first render on these fetches.** They are additive side-loads, exactly like
  `advStats`. No loading gate, no spinner, no `if (!teamContext) return null`.
- **Do not fetch more than one season per family.** The multi-season question is §5.

---

## 2. The season to load — `careerStats`-derived, **not** `nflState.season`

**This is the decision most likely to be got wrong, and getting it wrong makes every new surface
render as "no data" for a reason that has nothing to do with the code.**

Two season sources exist in `App.jsx` and they **differ**:
- `nflState.season` — the live NFL season (`'2026'` today). Used by `loadCurrentRoster`.
- `Object.keys(careerStats)` max — the most recent season with **data** (`2025` today). Used by
  `loadAdvStats`.

Take the **`careerStats`-derived** one, for all three families:

```js
const allSeasons = Object.keys(careerStats).map(Number).sort()
const dataSeason = allSeasons[allSeasons.length - 1]
```

**Why.** In the offseason — which is now — `nflState.season` is 2026, and there is no
`nflverse/gamelogs/2026.json` or `nflverse/teamcontext/2026.json` because those games have not been
played. Both loaders would correctly return their graceful empty shape, and every downstream section
would show a degraded state that is a bug in the season choice, not a fact about the data.

`schedule` is the one family that **does** have a 2026 file (the fixture list, 1999–2026 coverage).
Load it for `dataSeason` anyway, because its first consumer is Slice 4's game log, which annotates
**2025** games with the spread/total/roof/weather of the games that were actually played. A future
"next opponent" feature wants 2026 — §5's state shape makes that additive rather than a rewrite.

Name the variable `dataSeason`, not `currentSeason`. `App.jsx` already uses `currentSeason` for this
quantity in four other memos, and a fifth binding with the same name but a different meaning in a
neighbouring effect is how this gets confused later.

---

## 3. State — keyed by year from the start

Three new `useState` declarations, next to `advStats` (`App.jsx:144`):

```js
const [teamContext, setTeamContext] = useState({})   // { [year]: loaderResult }
const [gameLogs,    setGameLogs]    = useState({})   // { [year]: loaderResult }
const [nflSchedule, setNflSchedule] = useState({})   // { [year]: loaderResult }
```

**Keyed by year even though this slice populates exactly one key.** Slice 6's Team detail needs 14
seasons of `teamcontext`; if this slice stores a bare loader result, that slice has to restructure
state and re-thread every consumer. A year-keyed map costs nothing now and makes the later change
additive. `{}` rather than `null` as the initial value, so a consumer can always do
`teamContext[year]?.teams` without a two-level guard.

**Naming collision to avoid:** `src/utils/teamContext.js` is the *projection* module, already
imported into `App.jsx` (`:32`) for `computeTeamContext` / `computeQBQualityByTeam` /
`computeHistoricalTeamTotals` / `computeHistoricalShares` / `applyQBQualityModifier`. The new state
variable `teamContext` does **not** collide with those named imports, but it is one letter from
confusion. Import the loader as `loadTeamContext` (its real name) and put a one-line comment on the
state declaration naming the distinction — `src/api/teamContext.js` (this data) vs
`src/utils/teamContext.js` (the projection module). CLAUDE.md already flags this pair as distinct;
keep it flagged in source too.

---

## 4. Three effects — model them on `App.jsx:849-861`

One effect per family, each keyed on `[careerStats]`, each following the existing precedent exactly:

```js
useEffect(() => {
  if (!careerStats) return
  let cancelled = false
  const allSeasons = Object.keys(careerStats).map(Number).sort()
  const dataSeason = allSeasons[allSeasons.length - 1]
  loadTeamContext(dataSeason)
    .then(r => { if (!cancelled) setTeamContext(prev => ({ ...prev, [dataSeason]: r })) })
    .catch(err => console.warn('[teamContext] Load error:', err.message))
  return () => { cancelled = true }
}, [careerStats])
```

Non-negotiables, each of which the precedent already gets right:
- **The `cancelled` flag is required.** React Strict Mode double-fires every effect in dev; the
  invariant is explicit in CLAUDE.md. Check it before every setter.
- **`.catch` warns and swallows.** These are optional side-loads; a store outage must not surface as
  an error state or break the app. The loaders already return graceful empties for expected failures,
  so the `.catch` is for the unexpected.
- **Functional setter** (`prev => ({ ...prev, [year]: r })`), not `setTeamContext({ [year]: r })` —
  the year-keyed shape only pays off if writes merge.
- Log prefixes match the loaders' own (`[teamContext]`, `[nflGameLogs]`, `[nflSchedule]`).

**Three separate effects, not one combined effect.** They are independent, they fail independently,
and one slow fetch must not delay the other two. This also matches how every other side-load in the
file is written.

---

## 5. The 14-season question — decided: deferred, but made cheap

dp-v2 §3.1 flagged that Slice 6's Team detail needs all 14 `teamcontext` seasons, since each file
holds all 32 teams for one season.

**Decision: this slice loads one season only.** Slice 6 owns the multi-season fetch, because it is the
first thing that needs it and it is the only place that can measure the cost against a real screen.
What this slice does is make that addition **additive rather than structural**:
- state is year-keyed (§3), so more years are more keys;
- the setter merges, so a batch fetch can write several at once;
- the loaders already cache per year permanently, so a second visit costs nothing.

Record for Slice 6, so it is not re-derived: completed seasons never change, so the fourteen fetches
are a one-time per-browser cost, and `Promise.all` over the missing years is the obvious shape. The
option that would need a data-repo change (a precomputed season-summary pack) stays out of scope.

---

## 6. `ProfileDataContext` — extend it here, not in Slice 4

Add the three keys to the provider value in `App.jsx`, taking the count from ten to **thirteen**:

```
teamContextByYear, gameLogsByYear, nflScheduleByYear
```

**Why now, with no consumer.** The pop-up (`dp/PlayerDetailModal.jsx`, `dp/PlayerDetailTabs.jsx`) is
the first consumer and reads exclusively through `useProfileData()`. Threading the keys here means
Slice 4 is a pure rendering slice that touches no `App.jsx` state — which is the whole reason this
slice exists as a separate step. A Slice 4 that has to reach back into `App.jsx` for its data has
lost that separation.

**Use the `…ByYear` suffix in the context**, even though the state variables are unsuffixed. In the
context the value's shape is not visible at the use site, and `gameLogs.players` (wrong — that is
`gameLogs[year].players`) is an easy and silent mistake. The suffix makes the extra level explicit
where it needs to be.

Update the ten-key list in `CLAUDE.md` and `docs/architecture.md` in the same change — it is
documented in both.

---

## 7. One behavioural test: the join actually resolves

Everything else here is plumbing that the guard tests already cover. The one thing worth asserting is
that the **team-keyed** family and the **player-keyed** families can be joined, because that join is
the load-bearing assumption of Slices 4, 5 and 6, and it crosses an era-code boundary.

New test file `src/__tests__/teamContextJoin.test.js`:

- Build small fixtures: a `careerStats`-shaped object with one player carrying a per-season `team`, a
  `gameLogs` result whose `players[pid].games[]` carries a per-week `team`, and a `teamContext` result
  with `teams[abbr].games[]`.
- Assert `resolvePlayerTeam` at **season grain** returns the era-accurate code, and that the code it
  returns is a key in `teamContext.teams`.
- Assert the same at **week grain**, which is the path that goes through the era remap
  (gamelogs carry current-franchise codes, `teamcontext` is era-accurate — `playerTeam.js` remaps).
  **Use a player-season where the two domains genuinely differ** — an Oakland/Las Vegas, San
  Diego/LA Chargers, or St. Louis/LA Rams case — or the test passes for the wrong reason.
- Assert `getTeamWeekRow(loaded, team, week)` finds the row, and that it is called with the **whole
  loader result**, not `.teams` (§0).

Keep it a `node`-environment test — no rendering, so no jsdom pragma.

Existing tests: run all three guards explicitly and confirm green. Do not modify them.

---

## 8. Load-performance note

Three additional data-store fetches on first load, in parallel with the existing `advStats`,
`nflRoster`, `nflDraft`, `collegeStats` and KTC side-loads. Each is one JSON file for one season,
each is permanently cached per year, and none blocks render.

If any of the three turns out to be large enough to matter (`gamelogs` is the biggest — ~600 players
× ~17 games), report the observed size and time in the hand-back rather than optimising on
suspicion. `docs/integrations.md`'s load-performance section is the place any real finding belongs.

---

## 9. Step sequence

1. Three `useState` declarations next to `advStats`, with the naming comment (§3).
2. Three imports.
3. Three effects, modelled on `:849-861` (§4).
4. Extend the `ProfileDataContext.Provider` value with the three `…ByYear` keys (§6).
5. `src/__tests__/teamContextJoin.test.js` (§7).
6. Run the three guard tests explicitly; confirm green and unmodified.
7. Docs (§10).
8. `npm test` → `npm run lint` → `npm run build`.
9. Optional but useful now that it is permitted: run the app, open the console, and confirm the three
   `[teamContext] / [nflGameLogs] / [nflSchedule] year=… served|cached` lines appear with the
   **expected season (2025, not 2026)** and non-zero row counts. That is the cheapest possible proof
   this slice worked, and it is the only observable effect it has. Note a fresh browser profile lands
   on the username form — reaching a loaded league needs Anton's Sleeper login.

---

## 10. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `src/api/` table | `teamContext.js`, `nflGameLogs.js`, `nflSchedule.js` rows — each currently says the loader has **no UI consumer** / "runs for nobody". All three become "loaded into `App.jsx` state, year-keyed, exposed via `ProfileDataContext`; still view-only". This is the single most stale claim the slice creates |
| `CLAUDE.md` `src/context/` table + Patterns §2 | Ten keys → **thirteen**; name the three |
| `CLAUDE.md` State-and-data-flow section | The three new pieces of state and the `dataSeason` choice |
| `docs/architecture.md` | `useState` inventory gains three rows; the `ProfileDataContext` key list |
| `docs/signal-registry.md` | Three *Current use* cells change from view-only-with-no-consumer to view-only-reachable. **Required by CLAUDE.md's self-maintenance rule** whenever a signal's current-use status changes |
| `docs/integrations.md` | Only if §8 produced a real load-time finding |

Note `docs/ui.md` needs **no** change — nothing renders yet.

---

## 11. Cross-repo impact

**None.** Three families already served, at shapes the loaders already parse and validate. No new
served path, no manifest field, no shape change, no coverage request. The relevant `CR-NN` entries
cover the shapes and gates, and this slice changes neither — it only starts calling code that already
existed. State "none" explicitly in the hand-back.

---

## 12. Done-definition

- [ ] Three loaders called; `grep -rn "loadTeamContext\|loadNflGameLogs\|loadNflSchedule" src/App.jsx`
      shows all three
- [ ] The season used is **`careerStats`-derived**, named `dataSeason`, and is **2025** not 2026 today
- [ ] State is year-keyed with merging functional setters, initial `{}`
- [ ] Every effect has a `cancelled` flag checked before its setter
- [ ] `ProfileDataContext` provides thirteen keys, the new three suffixed `…ByYear`
- [ ] **No `src/utils/` projection or scoring module imports any of the three** — the three guard
      tests pass, **unmodified** (`git diff --stat` on them is empty)
- [ ] No component reads the new context keys yet (Slice 4's job)
- [ ] `teamContextJoin.test.js` added, and its week-grain case uses a season where the era code and
      the current-franchise code genuinely differ
- [ ] `npm test` green · `npm run lint` 0 problems in `src/` · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect Slice ii's three, unchanged (this slice adds none: it
      renders nothing, so there is nothing to mark)
- [ ] Docs per §10, including `docs/signal-registry.md`

**Lint bar:** 0 problems **in `src/`**. Six pre-existing problems live in
`docs/design_handoff_dynasty_portfolio/support.js`, a vendored generated file untouched since
`bc159ad`; do not try to fix them.

---

## 13. Hand-back should report

- The console lines from §9 step 9 if you ran the app: which season each loader resolved, and the row
  counts.
- Confirmation that the three guard tests have a zero diff.
- The `teamContextJoin` week-grain fixture you chose, and which era boundary it crosses.
- Observed size/time of the `gamelogs` fetch, if notable (§8).
- Anything in §0 that had drifted from `f614788`.
