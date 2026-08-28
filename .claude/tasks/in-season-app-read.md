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
| §2 shipped `hasNoData`, `shouldSkipCompletedSeason` and `setStepOutput` in `update-nfl.mjs` | data `697ae73` |
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
2. Cache check: serve from IndexedDB when the cached payload's stored `lastModified` equals the
   manifest's.
3. `tryDataStore(path, { validate: isValidSeasonTotals, allowInProgress: true })`.
4. `setCacheWithMeta(key, { players, lastModified: entry.lastModified }, 999999)` — **permanent TTL
   plus the `lastModified` compare**, exactly as `nflRoster.js` does. Do not substitute a short TTL;
   the parent plan framed these as alternatives and that was wrong.
5. Return `{ players, season, complete: true }` on success; `{ players: {}, season, complete: false }`
   otherwise.

**`allowInProgress: true` is scoped to this one call.** Do not change `tryDataStore`'s default —
`dataStore.test.js`'s `T1c` exists specifically to assert the allowlist does not become a bypass.

---

## 3. Wiring — additive, and provably isolated

- New `App.jsx` state `currentSeasonTotals`, loaded in its **own** effect keyed on `nflState.season`.
  Standard `cancelled` flag (Strict Mode double-fires).
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

Everything else in `opponentStrength.js` is unchanged — the `gamesPlayed <= 0` → `null` guard, the
`normalizeTeamForSchedule` join, the duplicate-row dedup, `PRIOR_WEIGHT_GAMES`, the ranking.

**The popover copy must change with it.** It currently names the single season in play and says the
current season is unavailable. Once both terms can fire it must state **which seasons and their
actual weights** — and it must keep saying so honestly in the window where the season has started but
no file exists yet.

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
- [ ] CR-02 and CR-04 mirrors carried out; **CR-04's Mirror gains §6.1's distinction**; CR-21 landed
      in both repos; drift check reports nothing

---

## 8. What this does not do

The blend's current term becomes **reachable**, not populated — `nfl/season-totals/2026.json` will
not exist until the cron's first successful run after week 1. Until then `/teams` shows exactly what
it shows today, and that is correct.

**Do not retrofit other surfaces.** Market's Efficiency set, the environment filters and Teams' other
columns all deliberately pin to `dataSeason`. Re-pointing any of them at a partial season is a
per-surface product decision, not a consequence of this loader — and each would need its own answer
to "what does this column mean in week 3?"
