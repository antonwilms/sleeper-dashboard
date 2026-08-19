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
| All three return a graceful empty shape on every *expected* failure path and never return `null`. **They can still reject**: `getCacheRecord` → `getDB()` can throw when IndexedDB is unavailable (private mode, blocked storage), so §4's `.catch` is load-bearing, not decorative | `if (!entry) return { ...EMPTY }` in each; `src/utils/cache.js:39-41` |
| Each loader's header says explicitly: **"Consumers branch on `complete`, not `year`"** | `teamContext.js:65`, and the equivalent in the other two |
| **`const teamContext` ALREADY EXISTS in the same component body** — the `computeTeamContext` memo, current-team-pinned | `src/App.jsx:161`, consumed at `:355`, `:419`, `:504`, `:521` |
| That memo is passed into **`computeDynastyScore` (`:355`) and `computeNextSeasonProjection` (`:504`)** | see §3.1 — this is the slice's one real hazard |
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

## 3. State — year-keyed, and named to avoid a dangerous collision

### 3.1 STOP — `teamContext` is already taken, and the wrong fix is silent

**`src/App.jsx:161` already binds `const teamContext`** — the `computeTeamContext` memo, current-team-
pinned, passed into **`computeDynastyScore` (`:355`)** and **`computeNextSeasonProjection` (`:504`)**.

Declaring `const [teamContext, setTeamContext] = useState({})` in the same body is a redeclaration:
the build goes red, which is survivable because it is loud.

**The dangerous outcome is the quiet fix.** If you resolve the clash by renaming *the memo*, then
`teamContext` at `:355` and `:504` starts resolving to the raw `loadTeamContext` result — feeding the
view-only nflverse team-context pack **directly into the dynasty score and the projection**. That is
the one invariant this whole program rests on, and **no existing test catches it**: the three guard
tests scan only the 14 `src/utils/` `PIPELINE` modules, and `App.jsx` is deliberately absent from all
three (§0).

**So: rename the NEW state, never the memo.** `App.jsx:161`'s `teamContext` binding, and its use at
`:355`/`:419`/`:504`/`:521`, must come out of this slice byte-identical.

### 3.2 The three declarations

Next to `advStats` (`App.jsx:144`):

```js
// nflverse team-context pack (src/api/teamContext.js) — view-only, per-season, team-keyed.
// NOT src/utils/teamContext.js, whose `teamContext` memo at :161 feeds projection/scoring.
const [teamContextByYear, setTeamContextByYear] = useState({})   // { [year]: loaderResult }
const [gameLogsByYear,    setGameLogsByYear]    = useState({})   // { [year]: loaderResult }
const [nflScheduleByYear, setNflScheduleByYear] = useState({})   // { [year]: loaderResult }
```

The `…ByYear` suffix is now the name at every level — state, setter and context key (§6). The earlier
draft split the two, which bought nothing and cost a translation step.

### 3.3 Year-keyed, with `complete` as the consumer gate

Keyed by year even though this slice populates one key: Slice 6's Team detail needs 14 `teamcontext`
seasons, and a bare loader result would force it to restructure state and re-thread consumers. A
year-keyed map makes that additive. Initial `{}` rather than `null`.

**Consumers branch on `complete`, not on presence** — every loader header says so explicitly
(`teamContext.js:65`). The idiom to establish here, because Slice 4 will copy whatever this slice
models:

```js
const tc = teamContextByYear[dataSeason]
if (!tc?.complete) { /* degraded — DegradedBlock, never a fabricated zero */ }
```

`teamContextByYear[year]?.teams` is **not** sufficient: `{}` initial plus year-keyed writes means an
absent key cannot be distinguished from a resolved-but-empty one, so "still loading" and "no 2026 file
exists" — the exact case §2 exists to avoid — would read identically. Put this in a comment on the
state declarations.

## 4. Three effects — model them on `App.jsx:849-861`

One effect per family, each keyed on `[careerStats]`, each following the existing precedent exactly:

```js
useEffect(() => {
  if (!careerStats) return
  let cancelled = false
  const allSeasons = Object.keys(careerStats).map(Number).sort()
  const dataSeason = allSeasons[allSeasons.length - 1]
  loadTeamContext(dataSeason)
    .then(r => { if (!cancelled) setTeamContextByYear(prev => ({ ...prev, [dataSeason]: r })) })
    .catch(err => console.warn('[teamContext] Load error:', err.message))
  return () => { cancelled = true }
}, [careerStats])
```

Non-negotiables, each of which the precedent already gets right:
- **The `cancelled` flag is required.** React Strict Mode double-fires every effect in dev; the
  invariant is explicit in CLAUDE.md. Check it before every setter.
- **`.catch` warns and swallows.** These are optional side-loads; a store outage must not surface as
  an error state or break the app. The loaders return graceful empties for *expected* failures, but
  `getCacheRecord` can genuinely reject when IndexedDB is unavailable (§0) — so this `.catch` is
  load-bearing, not defensive boilerplate.
- **Functional setter** (`prev => ({ ...prev, [year]: r })`), not `setTeamContextByYear({ [year]: r })` —
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

The `…ByYear` suffix carries through from the state names (§3.2) — at a `useProfileData()` call site
the value's shape is invisible, and `gameLogs.players` (wrong; it is `gameLogsByYear[year].players`)
is an easy and silent mistake.

**The ten-key list has two real sites, and `docs/architecture.md` is not one of them** — that file has
no key list at all, only a tree-diagram mention at `:109`. The two are `CLAUDE.md` (the `src/context/`
table **and** Patterns §2) and **`src/context/ProfileDataContext.jsx:3-4`**, the provider module's own
header comment. Update all three places.

---

## 7. One behavioural test: the join actually resolves

Everything else here is plumbing that the guard tests already cover. The one thing worth asserting is
that the **team-keyed** family and the **player-keyed** families can be joined, because that join is
the load-bearing assumption of Slices 4, 5 and 6, and it crosses an era-code boundary.

New test file `src/__tests__/teamContextJoin.test.js`:

- Build small fixtures: a `careerStats`-shaped object with one player carrying a per-season `team`, a
  `gameLogs` result whose `players[pid].games[]` carries a per-week `team`, and a `teamContext` result
  with `teams[abbr].games[]`.
- **Pin the input domain on both grains, not just one.** `resolvePlayerTeam` applies `eraTeam`
  unconditionally to whatever it reads (`playerTeam.js:65`), so the fixture's own codes decide whether
  the remap is exercised or merely passed through:
  - **Season grain** reads `careerStats[season][pid].team`, documented as **already era-accurate**.
    The fixture must carry the **era-accurate** code (e.g. `OAK` for a 2018 season), where `eraTeam` is
    an identity. If you put the current-franchise code (`LV`) there, the assertion passes *through* the
    remap and quietly asserts the opposite of the documented domain.
  - **Week grain** reads `gameLogPlayers[pid].games[].team`, which is **current-franchise**. The
    fixture must carry `LV`, and the assertion is that `resolvePlayerTeam` returns `OAK`.
  Use a season crossing a real boundary — `LA→STL` ≤2015, `LAC→SD` ≤2016, `LV→OAK` ≤2019 — or the test
  passes for the wrong reason on both grains.
- Assert the returned code is a key in the `teamContext` fixture's `teams`.
- Assert `getTeamWeekRow(loaded, team, week)` finds the row, and that it is called with the **whole
  loader result**, not `.teams` (§0).

Keep it a `node`-environment test — no rendering, so no jsdom pragma.

### 7.1 A second guard, for the §3.1 hazard
The redeclaration hazard is loud, but the rename-the-memo resolution is silent and no existing test
covers `App.jsx`. Add a static assertion — same `readFileSync` pattern as the existing guards — in a
new `src/__tests__/projectionInputsGuard.test.js`:

- `src/App.jsx` still contains `const teamContext = useMemo(` — the projection memo, not renamed.
- The argument lists passed to `computeDynastyScore(` and `computeNextSeasonProjection(` still contain
  a bare `teamContext,` — i.e. the memo, not `teamContextByYear`.
- `src/App.jsx` does **not** pass `teamContextByYear`, `gameLogsByYear` or `nflScheduleByYear` into
  either call.

That last assertion is the one that matters: it makes the invariant this program rests on
mechanically checkable inside `App.jsx`, which the three `src/utils/`-scoped guards structurally
cannot reach. Write it as a scoped read of each call's argument text, not a whole-file regex, so it
does not false-positive on the state declarations sitting 200 lines above.

Existing tests: run all three view-only guards explicitly and confirm green. **Do not modify them.**

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
9. Now permitted, and worth doing — this slice has no other observable effect. Run the app, open the
   console, and look for the loaders' **actual** strings, which differ per path:
   - fetch path: `` [teamContext] fetched year=2025 rows=N `` (note: no `year=` prefix before `fetched`)
   - cache path: `` [teamContext] year=2025 served from cache (rows=N) ``
   - too-sparse path: `` [teamContext] year=2025 too sparse … skipping ``
   - **manifest-absent path: NOTHING.** `if (!entry) return { ...EMPTY }` logs nothing at all, so a
     wrong season (2026) shows up as **silence**, not as a wrong-season line. If you see no line for a
     family, that is the failure mode to suspect first — check the season, not the network tab.

   Confirm the season is **2025, not 2026**, and that row counts are non-zero. A fresh browser profile
   lands on the username form; reaching a loaded league needs Anton's Sleeper login, so ask rather
   than guess.

---

## 10. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` `src/api/` table | `teamContext.js`, `nflGameLogs.js`, `nflSchedule.js` rows — each currently says the loader has **no UI consumer** / "runs for nobody". All three become "loaded into `App.jsx` state, year-keyed, exposed via `ProfileDataContext`; still view-only". This is the single most stale claim the slice creates |
| `CLAUDE.md` `src/context/` table + Patterns §2 | Ten keys → **thirteen**; name the three |
| **`src/context/ProfileDataContext.jsx:3-4`** | The provider module's own header comment lists the ten keys — the real second site (`docs/architecture.md` has no key list, only a tree mention at `:109`) |
| **`docs/cross-repo-registry.md:104`** | CR-08's App side says of the schedule loader: "No app-side consumer as of 1b Slice viii … the loader still runs for nobody." **This slice falsifies it.** That prose is the app-side trigger cache §11 leans on, so it must not go stale |
| **`docs/cross-repo-registry.md:96`** | CR-07 names `src/App.jsx:893` as the `loadAdvStats` call site; the live site is **`:857`** — the very block §4 models the new effects on. A one-line correction in a file this slice already edits; do not leave a knowingly-wrong anchor |
| **`docs/design_target_state.md:73-75`** | Says of these loaders "Loader, cache, sparsity gate and tests all exist. Wiring is a call site." — true when written, wrong after this slice. Also `:85` carries the same `App.jsx:868` drift as CR-07 |
| `CLAUDE.md` State-and-data-flow section | The three new pieces of state and the `dataSeason` choice |
| `docs/architecture.md` | `useState` inventory gains three rows; the `ProfileDataContext` key list |
| `docs/signal-registry.md` | Three *Current use* cells change from view-only-with-no-consumer to view-only-reachable. **Required by CLAUDE.md's self-maintenance rule** whenever a signal's current-use status changes |
| `docs/integrations.md` | Only if §8 produced a real load-time finding |

Note `docs/ui.md` needs **no** change — nothing renders yet.

---

## 11. Cross-repo impact

**Not "none" — this slice touches CR-18.** The earlier draft said none, on the grounds that no served
shape changes. That is true of the *data* but not of the *registry*: §10 reclassifies three
`docs/signal-registry.md` **Current use** cells (view-only-with-no-consumer → view-only-reachable), and
that file is CR-18's sole app-side trigger. Per CLAUDE.md's rule, naming the contract in prose is not
enough — the `Mirror` text is the deliverable, so it is quoted in full below.

**CR-18 · Signal registry rows (`docs/signal-registry.md`) — Mirror:**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
> script the list above cannot already name. The listed sites are every one that exists today; a *new*
> one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side
> against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds,
> removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or
> reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must
> make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the
> family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo
> when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs
> snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later.
> The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Direction here is app→data-nothing:** the change originates in this repo and the data repo has no
counterpart edit to make (no coverage, source or ephemerality changed — only which app code reads the
family). So there is no instruction to send across; the obligation is satisfied by making the
`signal-registry.md` edit correctly and completely, in this slice, rather than deferring it.

**No other entry is touched.** CR-07 and CR-08's shapes, gates and served paths are unchanged — only
their app-side *prose* about having no consumer, which §10 corrects.

## 12. Done-definition

- [ ] Three loaders called; `grep -rn "loadTeamContext\|loadNflGameLogs\|loadNflSchedule" src/App.jsx`
      shows all three
- [ ] The season used is **`careerStats`-derived**, named `dataSeason`, and is **2025** not 2026 today
- [ ] State is year-keyed with merging functional setters, initial `{}`, and named `…ByYear`
- [ ] **`App.jsx:161`'s `const teamContext` memo is byte-identical**, and `:355`/`:419`/`:504`/`:521`
      still reference it — verify by reading the diff, not by assuming (§3.1)
- [ ] `projectionInputsGuard.test.js` added and passing (§7.1)
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
- [ ] Docs per §10 — including `docs/signal-registry.md`, `ProfileDataContext.jsx`'s own header, both
      `cross-repo-registry.md` corrections, and `design_target_state.md`
- [ ] A `## Cross-repo impact` section in the hand-back quoting **CR-18** and its `Mirror` text (§11)

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
- Confirmation that the `teamContext` memo and its four use sites are untouched (§3.1).
- Anything in §0 that had drifted from `f614788`.

---

## 14. Plan-review record (2026-08-19)

Nine flags; **all nine verified against live source and applied.** Two changed the design.

| Flag | Call |
|---|---|
| **`const teamContext` already exists** at `App.jsx:161` — the `computeTeamContext` memo, fed into `computeDynastyScore` (`:355`) and `computeNextSeasonProjection` (`:504`). §3 had checked the wrong binding: it verified no clash with the *named imports* at `:32` and missed the local memo one letter away | **§3.1 added, state renamed to `…ByYear`.** The redeclaration is loud, but the reviewer's second flag is the real one: resolving it by renaming the *memo* would silently feed a view-only family into the dynasty score and the projection, and the three guard tests are `src/utils/`-scoped so none of them can see `App.jsx`. **§7.1 adds a static guard** making that invariant mechanically checkable inside `App.jsx` for the first time |
| **§11 said "none" but the slice touches CR-18** — `docs/signal-registry.md` is that entry's sole app-side trigger, and §10 reclassifies three Current-use cells | **§11 rewritten** with CR-18's `Mirror` text quoted in full, plus the reasoning that the obligation here is discharged by making the registry edit completely rather than by sending an instruction across |

The rest: the loaders' own headers say **"Consumers branch on `complete`, not `year`"**, and §3's
`[year]?.teams` rationale taught the opposite idiom — one that cannot separate "still loading" from
"no 2026 file exists", the exact case §2 exists to avoid, so §3.3 now models the `complete` gate for
Slice 4 to copy. §7 pinned the week-grain fixture against a false pass but not the season-grain one,
even though `eraTeam` applies unconditionally to both (`playerTeam.js:65`) — both domains are now
specified explicitly. §9's console strings did not match live source, and the case it was meant to
catch (wrong season → absent manifest entry) **logs nothing at all**, so the guidance now says silence
is the symptom. §0's "never throw" was imprecise — `getCacheRecord` can reject when IndexedDB is
unavailable, making §4's `.catch` load-bearing. §6 claimed the ten-key list is documented in
`docs/architecture.md`, which has no key list at all; the real second site is the provider module's own
header at `ProfileDataContext.jsx:3-4`. And §10 missed four sites this slice falsifies, including
`cross-repo-registry.md:104` (CR-08: the schedule loader "runs for nobody") — the trigger cache §11
itself depends on.

**One `[registry-stale]` finding, fixed rather than deferred:** CR-07 names `src/App.jsx:893` as the
`loadAdvStats` call site; the live site is `:857` — the exact block §4 models the new effects on. Same
drift at `design_target_state.md:85`. The reviewer's mandate is to report and not fix; Anton delegated
the calls, and leaving a knowingly-wrong anchor in a file this slice already edits helps nobody.

