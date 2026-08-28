# In-season app read — §3 of the live-season blind spot

Second half of `.claude/tasks/in-season-season-totals.md`. **§2 shipped** (data `697ae73`, corrected
`f788832`): the weekly cron now banks in-progress season-totals, the validator accepts a partial
season, the preseason no-ops and the season-close sealing bug is closed.

The data will exist. **The app still cannot read it.** This slice is the reader.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `careerStats` spans `2012 … currentSeason-1` and is the only `setCareerStats` writer — the live season is absent by construction | `sleeperStats.js:240`; `App.jsx:854,858` |
| `tryDataStore` defaults `allowInProgress: false`; the live year is marked `inProgress: true` | `dataStore.js:73,81`; data `update-nfl.mjs:41` |
| **`ktcHistory.js:147` is the only `allowInProgress: true` precedent** — `nflRoster.js` passes none | measured |
| **`nflRoster.js` is the freshness template**: `getManifestEntry` → compare `rec.data.lastModified === entry.lastModified` → `tryDataStore` → sparsity gate → `setCacheWithMeta(key, {…, lastModified}, 999999)`. **The TTL stays permanent; `lastModified` inside the cached payload is the invalidator** — they are layered, not alternatives | `nflRoster.js:55-101` |
| `buildFpaTable(careerStats, { priorSeason, currentSeason })` resolves **both** halves via `collectSeasonFpaRates(careerStats, season)` — so the current half can never fire while the live season is out of `careerStats` | `opponentStrength.js:116-118` |
| §2 shipped `hasNoData` (`:53`), `shouldSkipCompletedSeason` (`:65`) and `setStepOutput`; **`inProgress = year >= currentSeason` is at `:82`, not `:41`** | data `697ae73` |
| **`Teams.jsx` ALREADY owns a live-season gate** — a `currentSeasonAvailable` state + `getManifestEntry` effect feeding `currentSeason` straight into `buildFpaTable` (`:137-155`), with a comment saying it "always resolves false" until this prerequisite ships | measured |
| **`getSeasonTotals` already owns the cache key `season-totals/<season>`** and stores a **bare** players map there | `sleeperStats.js:104,112` |
| **`getManifestEntry` returns `null` for three distinct states** — file missing, `ENABLED === false`, and a failed manifest fetch (`sessionDisabled`) | `dataStore.js:65-70` |
| The guard that the default still rejects an `inProgress` season-totals entry is **`T1d`** (`:435`), not `T1c` (`:421`, which asserts the allowlist does not bypass the **schema ceiling**) | `dataStore.test.js` |
| **D-5 (new):** §2's skip returns at `update-nfl.mjs:85` **before** `updateManifestEntry` at `:148`, so a completed season's entry keeps `inProgress: true` forever — recorded in `data-repo-backlog.md` | measured |
| **CR-20 is the highest entry** — the next free id is **CR-21** | `docs/cross-repo-registry.md` |
| The scoring channels that a partial season WOULD corrupt (durability's ungated recency weighting, `classifyInjurySeason`, `mostRecentSeason`, the prospect blend, `computePositionalRanks`) are enumerated in the parent plan §3 | `dynastyScore.js:257,519-528,663-665,844-848,857-859` |

---

## 2. The loader — `loadCurrentSeasonTotals`

New function in `src/api/sleeperStats.js` (it already owns the season-totals path), **or** a small
sibling module if that file is too crowded — implementer's call, but it must not live inside
`loadCareerHistory`.

Follow `nflRoster.js:55-101` step for step:

1. `getManifestEntry('nfl/season-totals/<season>.json')` — **absent → return the empty shape, not an
   error.** Absent is the normal state before week 1 and between the season opening and the first
   cron run.
   **But `null` means three different things** (`dataStore.js:65-70`): the file is missing, the store
   is disabled (`ENABLED === false`), or the manifest fetch failed. Only the first is "not yet." Do
   **not** let the UI say "the live season isn't available yet" to an API-only-mode user whose store
   is simply off — distinguish store-disabled from file-absent, or word the copy so it is true in
   both.
2. Cache check: serve from IndexedDB when the cached payload's stored `lastModified` equals the
   manifest's.
3. `tryDataStore(path, { validate: isValidSeasonTotals, allowInProgress: true })`.
4. `setCacheWithMeta(key, { players, lastModified: entry.lastModified }, 999999)` — **permanent TTL
   plus the `lastModified` compare**, exactly as `nflRoster.js` does. Do not substitute a short TTL;
   the parent plan framed these as alternatives and that was wrong.
   **Use a DISTINCT cache key** — e.g. `season-totals-live/<season>`. `getSeasonTotals` already owns
   `season-totals/<season>` and stores a **bare** players map there; this loader stores a
   `{ players, lastModified }` wrapper. A collision makes the `weeklyStatus` staleness sniff
   (`sleeperStats.js:112`) read the wrapper's first key and silently force a re-fetch forever once
   that season later enters `careerStats`.
5. Return `{ players, season, complete: true }` on success; `{ players: {}, season, complete: false }`
   otherwise.

**`allowInProgress: true` is scoped to this one call.** Do not change `tryDataStore`'s default. The
guard for that is **`T1d`** (`dataStore.test.js:435`), which asserts the default still rejects an
`inProgress` **season-totals** entry — planning cited `T1c` (`:421`), which is about the **schema
ceiling**, not this.

---

## 3. Wiring — additive, and provably isolated

- New `App.jsx` state `currentSeasonTotals`, loaded in its **own** effect keyed on `nflState.season`.
  Standard `cancelled` flag (Strict Mode double-fires).
- **REPLACE `Teams.jsx`'s existing gate — do not add a second one.** `Teams.jsx:137-155` already runs
  its own `getManifestEntry` effect into `currentSeasonAvailable`, written by the FPA slice in
  anticipation of exactly this prerequisite. An App-level loader alongside it creates **two
  independent derivations of "is the live season available" that can disagree** — the manifest entry
  can exist while the fetch, the validator or the schema ceiling rejects it, and Teams would then
  render blend copy over a prior-season-only number. Delete the local effect and drive Teams off the
  loader's own `complete` flag, so there is exactly one answer.
- **`nflState.season` is a string; `deriveDataSeason` returns a Number.** Coerce deliberately at the
  boundary and say so in a comment — this is the exact mismatch the FPA review flagged.
- Thread to `Teams` as an explicit prop, alongside the existing list. Teams is props-only; do not
  route it through `ProfileDataContext`.

**The isolation guarantee, which is the whole point of the slice:**

> `careerStats` is not touched. `dataSeason` is not touched. No scoring module reads
> `currentSeasonTotals`.

Everything downstream of `careerStats` — the projection, the dynasty score, `dataSeason`'s three
loader windows, Market's Efficiency set, the environment filters — behaves exactly as before. §5 has
the regression test that proves it.

---

## 4. `buildFpaTable` — take rows, not a season key

Today both halves resolve through `collectSeasonFpaRates(careerStats, season)`, so handing it a
`currentSeason` yields nothing.

**Refactor `collectSeasonFpaRates` to take a row map** (`{ [rowId]: row }`) rather than
`(careerStats, season)`, and change the entry point to:

```js
buildFpaTable({ priorRows, currentRows })
```

Callers pass `careerStats[priorSeason]` and `currentSeasonTotals?.players ?? null`.

**Do not** synthesise `{ ...careerStats, [season]: currentSeasonTotals }` at the call site. The parent
plan's review named this specifically: a fabricated `careerStats` shape is the kind of thing a later
reader mistakes for the real one, and it re-creates the coupling this slice exists to avoid.

**`computeFpaPerGame` must change too** — planning said "everything else is unchanged" and that was
wrong. It is the function that performs the `careerStats?.[season]?.[team]` lookup
(`opponentStrength.js:52`) and is what `collectSeasonFpaRates` calls (`:84`); a row-map
`collectSeasonFpaRates` has no season key to hand it. Its guard semantics (`gamesPlayed <= 0` →
`null`) are preserved, only its input shape changes.

**This is not a one-test edit.** Live call sites: **12** `buildFpaTable` and **6** `computeFpaPerGame`
in `opponentStrength.test.js`, plus `Teams.jsx:154`. Enumerate and update them all.

Otherwise unchanged: the `normalizeTeamForSchedule` join, the duplicate-row dedup,
`PRIOR_WEIGHT_GAMES`, the ranking.

**The popover copy must change with it** — but **the per-team weights are not reachable as things
stand.** `buildFpaTable` returns bare numbers and `gCur` never escapes `blendFpaPerGame`
(`opponentStrength.js:99-108`); the weight is per-team-per-position. So either the table also returns
`gCur` (or the derived weight) per cell, **or** the copy states the seasons in play without claiming
exact weights. **Prefer returning it** — a blend the reader cannot decompose is the kind of number
this app's whole design argues against. Do not have Teams re-derive it from `currentRows`; that would
need a second `normalizeTeamForSchedule` hop and re-introduce a domain join the util already owns.

It must also stay honest in the window where the season has started but no file exists yet.

---

## 5. Tests

- **Isolation (the important one)**: with `currentSeasonTotals` populated, `careerStats` is unchanged
  and `deriveDataSeason` still returns the last completed season. This is the regression guard for §3
  of the parent plan and for every argument in it.
- **`allowInProgress` scoping**: this loader accepts an `inProgress` entry; the default path still
  rejects one. Assert both — a single-sided test would not catch the default being widened.
- **Freshness**: a changed manifest `lastModified` invalidates; an unchanged one serves from cache.
- **Absence**: no manifest entry → the empty shape, `complete: false`, no throw.
- **Blend engages**: `buildFpaTable({ priorRows, currentRows })` with both present moves the result
  toward the current rate by the documented weight; with `currentRows` null it is exactly the prior
  rate (the existing test, updated to the new signature).
- **Partial current season**: a team with `gamesPlayed: 0` in the current rows contributes nothing
  and does not produce `NaN` — the existing guard, re-asserted through the new path.

---

## 6. Cross-repo impact

**CR-02** fires (a new app-side reader of the family) and **CR-04** fires (a second `allowInProgress`
opt-in). Emit both Mirrors **verbatim from the live registry region** — the copies in older task files
are stale.

**CR-20 also fires** — planning missed it. Its Triggers are `FPA_POSITIONS`, the
`fan_pts_allow_${pos}` read inside `computeFpaPerGame`, and `isDefenseRowId` — all in the file §4
refactors, and `computeFpaPerGame` specifically must change.

> **CR-02 Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in
> the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via
> `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule changes app
> projections **with no app-side diff**. Treat such edits as scoring changes and route them through a
> graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion
> 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an
> allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key
> is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:**
> `aggregateWeeks` infers a single-team row's bye week(s) from the schedule and writes `'B'` into an
> `'X'` slot — this **falsifies a written app-side assumption with no app-side diff**
> (`availabilityGrid.js:4`, `gameLog.js:130-160`). Correct the app comment in the same change.

> **CR-04 Mirror:** New families are additive and need no app change (the app already keys by path).
> Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and
> needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a
> second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates
> `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache
> invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress`
> convention split: nflverse families register `inProgress: false` even while the current season
> mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate
> (CR-17).

> **CR-20 Mirror:** Do not remove, rename or filter `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/
> (total), and do not widen `prunePlayerStats`'s denylist (or replace it with an allowlist) without an
> explicit DEF-row exemption alongside the existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA
> QB/RB/WR/TE columns degrade silently to `—` across all 32 teams** if either the keys or the rows
> vanish — no error, no test failure, indistinguishable from the API-only-mode degraded state shown
> for an unrelated reason. This is the exact silent-degradation shape CR-11/12/13/19 exist to record,
> for a *row*, not merely a key.

### 6.1 CR-04 says this pattern should not be propagated — the exception, argued

CR-04's Mirror states KTC's `inProgress: true` is *"a legacy current-value marker, **not a pattern to
propagate**."* This slice proposes a second opt-in, so the exception must be argued rather than
assumed:

> **KTC's marker is a mislabel; season-totals' is accurate.** A KTC snapshot is a completed,
> immutable capture that was registered `inProgress: true` as a "current value" flag — the entry is
> wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely
> *should* be read while incomplete, because a partial season is the thing the reader wants. The
> convention CR-04 warns against is using `inProgress` to mean "latest"; using it to mean "not
> finished" is its actual meaning.

Add that distinction to CR-04's Mirror in the same change, so the next reader does not have to
re-derive it.

### 6.2 The genuinely new coupling — draft CR-21

No entry records the semantic hazard this slice creates: **the app cannot distinguish a partial-week
file from a complete season.** Both are the same shape; only the manifest's `inProgress` flag and the
row-level `gamesPlayed` distinguish them, and nothing enforces that the app checks either.

**Convention note, stated rather than glossed:** CLAUDE.md routes a genuinely new coupling to the
Claude.ai project for a draft entry returned to Session 1. **This draft was written in-repo instead**,
because planning here can read both trees — the same call made and flagged for the KTC pick-row
coupling earlier in this program, which review then correctly reclassified. If Anton wants the
Claude.ai round trip, this is the item to send.

> #### CR-21 · In-progress season-totals reads
> - **App side:** `loadCurrentSeasonTotals` in `src/api/sleeperStats.js` (the `allowInProgress: true`
>   call and its `lastModified` freshness compare), the `currentSeasonTotals` state and effect in
>   `src/App.jsx`, and `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js`.
> - **Data side:** `scripts/update-nfl.mjs` — `inProgress = year >= currentSeason` (`:41`),
>   `hasNoData` (`:53`), `shouldSkipCompletedSeason` (`:65`), and the weekly
>   `.github/workflows/nfl-season-totals.yml`.
> - **Invariant:** a season-totals file marked `inProgress: true` is **incomplete by design** and is
>   read as such. It carries the same shape as a completed season — the only signals that it is
>   partial are the manifest's `inProgress` flag and the rows' own `gamesPlayed`. The app must never
>   present an in-progress season as a completed one, and must never let it reach the scoring
>   pipeline.
> - **Direction:** both
> - **Triggers:** `loadCurrentSeasonTotals` and its `allowInProgress: true` call site, the
>   `currentSeasonTotals` effect in `src/App.jsx`, `buildFpaTable`'s `currentRows` parameter  ‖
>   `inProgress`/`hasNoData`/`shouldSkipCompletedSeason` in `scripts/update-nfl.mjs`,
>   `.github/workflows/nfl-season-totals.yml`, `validateNflSeason`'s self-calibrating full-season
>   floor in `lib/validate.mjs`
> - **Mirror:** If the weekly job stops running, starts writing partial weeks under a different
>   marking, or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will
>   render a half-season's rates as though they were a season's, with no error and no test failure.
>   The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a
>   partial season validates; that means **the validator no longer distinguishes "early season" from
>   "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any
>   change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change.

**Two defects in the CR-21 draft, to fix before landing it:**
- Its Data side and Triggers re-list `scripts/update-nfl.mjs` and `validateNflSeason`, which are
  already CR-02 data-side triggers (the latter also CR-20's). As drafted, **one data-side edit would
  fire three entries.** Scope CR-21's data side to what is genuinely its own: the weekly workflow's
  cadence, `hasNoData`/`shouldSkipCompletedSeason`, and the `inProgress` marking — not the shared
  script and validator wholesale.
- It names **no app-side validator**, though the registry's own format makes a shape's validator a
  trigger in its own right. `isValidSeasonTotals` is the shared one and currently sits only in CR-02;
  decide whether CR-21 references it or deliberately defers to CR-02, and say which.

Re-run the drift check afterwards; the region is byte-identical as of app `6e8ba32`.

---

## 7. Done-definition

- [ ] `loadCurrentSeasonTotals` follows `nflRoster.js`'s **layered** pattern — permanent TTL **plus**
      `lastModified` compare, not a short TTL
- [ ] `allowInProgress: true` scoped to this one call; `tryDataStore`'s default unchanged and `T1c`
      still green
- [ ] `currentSeasonTotals` is a separate slice — **the isolation test passes**: `careerStats`
      unchanged, `deriveDataSeason` still the last completed season
- [ ] `nflState.season` string/Number coercion is explicit and commented
- [ ] `buildFpaTable({ priorRows, currentRows })`; **no synthesised `careerStats` shape anywhere**
- [ ] The popover states the seasons in play **and their weights**, and stays honest in the
      file-absent window
- [ ] `npm test` green · lint 0 · build clean
- [ ] Smoke: `/teams` still renders 2025-only values today (no 2026 file exists yet) — confirm the
      copy says so, and that nothing regressed
- [ ] CR-02, CR-04 **and CR-20** mirrors carried out; **CR-04's Mirror gains §6.1's distinction**;
      CR-21's two draft defects fixed and the entry landed in both repos; drift check reports nothing
- [ ] **Four documented statements this change falsifies are corrected in the same change**
      (self-maintenance): `CLAUDE.md`'s `/teams` route row ("the blend's current-season term is
      always absent today"), `CLAUDE.md`'s `opponentStrength.js` row (which states the old
      `buildFpaTable(careerStats, {priorSeason, currentSeason})` signature **and** "the current-season
      term is always null today"), that module's own `§0` header comment, and
      `docs/signal-registry.md:54`'s `fan_pts_allow_*` current-use text
- [ ] `Teams.jsx`'s local `currentSeasonAvailable` effect is **removed**, not duplicated

---

## 8. What this does not do

The blend's current term becomes **reachable**, not populated — `nfl/season-totals/2026.json` will
not exist until the cron's first successful run after week 1. Until then `/teams` shows exactly what
it shows today, and that is correct.

**Do not retrofit other surfaces.** Market's Efficiency set, the environment filters and Teams' other
columns all deliberately pin to `dataSeason`. Re-pointing any of them at a partial season is a
per-surface product decision, not a consequence of this loader — and each would need its own answer
to "what does this column mean in week 3?"
