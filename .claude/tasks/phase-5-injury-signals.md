# Task: Phase 5 — Persistent Injury Signals

## Context

Phases 1–4 built the longitudinal data store and wired the app to read from it. Today the season-totals files contain `gamesPlayed`, `gamesStarted`, `byeWeeks`, `dnpWeeks`, plus `weeklyPoints` (a `{ week → pts_half_ppr }` map of *played* weeks only). That tells us how many games were missed but loses the temporal shape: were the misses consecutive? Mid-season or late? Did the player return and re-injure?

Phase 5 captures the per-week participation shape we can derive from existing Sleeper weekly stat dumps, persists it in the data store, surfaces it minimally in the app, and lays the groundwork for richer durability signals in a later phase. No new external data sources.

## Goal

Add week-level availability detail to `nfl/season-totals/<year>.json` (full 18-week status array + a small set of derived aggregates), backfill all historical years, and surface an "Availability History" table in the Player Profile Stats tab. Defer dynasty-score consumption to phase 6+.

---

## Decisions

### 1. What injury fields to capture per player-season — **week array + computed aggregates**

Store both:

- `weeklyStatus`: a length-18 array of one-character codes (or `null` for weeks before the player was in the league / not yet rostered enough to appear in any week's stat dump). Codes: `P` (played, `gp === 1`), `D` (DNP — team played, player did not, `gp === 0` and team in `teamsPlaying`), `B` (bye — team did not play that week), `X` (absent from response entirely — i.e. not rostered / inactive league-wide).
- A small `availability` object with derived aggregates so common queries don't have to re-scan the array:
  - `longestAbsence`: max run of consecutive `D` weeks (ignoring `B`/`X` between them? — see Algorithm below; we treat bye as breaking neither the run nor the active span; `X` weeks bracketed by `P`/`D` are treated as `D` for the run, otherwise ignored)
  - `absenceSegments`: array of `{ start, end, length }` for each `D` run after the player's first `P` of the season
  - `firstWeek` / `lastWeek`: first and last `P` week (lets us tell pre-debut/post-injury-ending-season apart from mid-season gaps)
  - `returnedFromAbsence`: boolean — did the player record any `P` week after their first `D` segment? (signals a real return vs. season-ending injury)
  - `absenceCause`: literal string `"unknown"` — placeholder for future enrichment (see decision 2)

Rationale: the week array is 18 bytes of text overhead per player per season — negligible. Storing it lets us answer future questions we haven't asked yet. The aggregates exist so the app and any future script can avoid re-parsing the array for the most common questions.

### 2. Detecting injury vs other absence reasons — **honest labelling, placeholder for future**

We cannot tell injury from suspension / healthy scratch / personal absence from Sleeper stats alone. The current `dnpWeeks` already silently conflates them; we will not paper over that.

- `weeklyStatus` codes are about **participation**, not cause. `D` means "team played, this player did not appear in the box score." Nothing more.
- `availability.absenceCause` is hardcoded `"unknown"` for every player-season. It exists so a later phase can write per-season cause values (from an injury report scrape, manual annotation, or another API) without a schema bump.
- README documents that an absence run >= 3 weeks is *suggestive* of injury but is not labelled as such by this script.

### 3. Where the data lives — **(a) extend per-season totals file**

Add the new fields directly to each player in `nfl/season-totals/<year>.json`:

```json
{
  "<player_id>": {
    "stats": { … },
    "gamesPlayed": 12,
    "gamesStarted": 12,
    "byeWeeks": 1,
    "dnpWeeks": 4,
    "weeklyPoints": { "1": 18.4, "2": 22.1, … },
    "fantasyPoints": 214.3,
    "scoringBasis": "half_ppr",
    "weeklyStatus": ["P","P","P","D","D","D","D","P","B","P","P","P","P","X","X","X","X","X"],
    "availability": {
      "longestAbsence": 4,
      "absenceSegments": [{ "start": 4, "end": 7, "length": 4 }],
      "firstWeek": 1,
      "lastWeek": 13,
      "returnedFromAbsence": true,
      "absenceCause": "unknown"
    }
  }
}
```

Rationale:
- The app already fetches season-totals files in one round trip per year. Splitting injury out doubles the fetch count for no gain.
- All data needed to compute these fields is the same per-week response we're already pulling for the existing totals — adding a separate file is just a different write path over identical inputs.
- File size grows ~5–10% per season file (mostly from the 18-char status string per player) — well within the ~2MB-per-file budget the data repo currently runs at.

### 4. Schema version handling — **strictly additive, file-level `schemaVersion` bump, no validator break**

- Bump `manifest.json` file-level `schemaVersion` from `1` → `2` for any season-totals file written with the new fields.
- Update the data store loader in the app (`src/api/dataStore.js`'s `tryDataStore`) to **accept both v1 and v2** files. v1 → fields are absent → app falls back to old behaviour (just won't show the Availability History table for that season). v2 → new fields available.
- The app validator (`tryDataStore` shape check) requires the existing fields only. It does **not** require `weeklyStatus`/`availability`, so older files keep working.
- The data repo's `validateNflSeason` in `lib/validate.mjs` is updated to *require* `weeklyStatus` (length 18) and an `availability` object on every player, and to check internal consistency (`gamesPlayed === count(P)`, `byeWeeks === count(B)`, `dnpWeeks === count(D)`). That validator only runs at write time, so it does not retroactively reject untouched v1 files — it just guarantees that anything newly written conforms.

Rationale: "additive + file-level version bump + dual-version reader" is the migration path that does not force a same-day backfill. Backfill happens at our pace (decision 6) and the app keeps working throughout.

### 5. App-side consumption — **pass-through + new Availability History UI; no dynasty-score change**

Phase 5 app work:
- `src/api/sleeperStats.js`'s `getSeasonTotals` (and the data-store path through it) preserves `weeklyStatus` and `availability` on each player record, alongside the existing fields.
- `src/api/sleeperStats.js`'s **live** weekly aggregation (`loadCareerHistory`/`getSeasonTotals`) is extended to compute the same fields, so the in-progress current season also gets them. The logic mirrors the data-repo `aggregateWeeks` so the live and stored shapes agree.
- A new `<AvailabilityHistory />` sub-component in `PlayerProfile` renders a compact table inside the Stats tab next to Role History: one row per season the player has data for, columns Season / Played / DNP / Longest Absence / Status sparkline (one cell per week, coloured by code).

Out of scope for phase 5:
- Any change to `dynastyScore.js`. The existing `injurySeason = gp < 10 && dnpWeeks >= 3` rule keeps using the unchanged aggregates.
- New durability sub-signals derived from `longestAbsence` or `absenceSegments`. Those need 2–3 seasons of accumulated data to be calibrated and belong to phase 6+.

### 6. Backfill — **run `--force` across all completed years once, oldest → newest, immediately after the script ships**

The data we need to reconstruct `weeklyStatus` is the same per-week Sleeper response the script already fetches. There is no reason to leave history empty.

- Order: 2012 → 2024 sequentially (2025 is `inProgress` and gets it on its next scheduled run).
- Run via `node bin/update.mjs nfl --year <Y> --force` per year. Each run touches one file plus one manifest entry. Commit per year so the diff stays reviewable.
- Pre-flight: `--dry-run` for one year first (2023, since CMC and Dobbins are the two spot-checks below), eyeball the diff summary, then proceed.
- Expected commit set: 13 commits, one per year, each ~2 MB diff.

Rationale: Sleeper's per-week endpoints work for all years back to at least 2012 in the existing script — the same fetch path produces the same data; we are just preserving more of it. There is no risk of a one-way migration: if a backfilled file looks wrong, re-running the script with the old code (or a `git revert`) restores it.

### 7. Profile UI surface — **yes, minimal: one new table on the Stats tab**

A small `AvailabilityHistory` table in the existing Player Profile Stats tab, sibling to Role History. Columns:

| Season | GP | DNP | Longest | Returned? | Week-by-week |
|---|---|---|---|---|---|
| 2023 | 12 | 4 | 4 | ✓ | `▮▮▮▯▯▯▯▮·▮▮▮▮········` |

- The "Week-by-week" column is a row of 18 small coloured cells (one per week), green for `P`, red for `D`, grey for `B`, hollow for `X`. Hover tooltip shows week number + status.
- No new context provider; reads from existing `careerStats` in `ProfileDataContext` (the new fields ride along on the same objects).

---

## Files to create

### App repo (`/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard/`)
- `src/components/AvailabilityHistory.jsx` — the new sub-component (rendered inside `PlayerProfile`'s Stats tab). Pure presentational; receives `{ careerStats, playerId }` as props.

### Data repo (`/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard-data/`)
- None — all logic lives in existing files.

## Files to modify

### App repo
- `src/api/sleeperStats.js` — `getSeasonTotals`'s live aggregation: maintain a per-player `weeklyStatus` array as weeks are scanned; after the loop, compute the `availability` aggregates; attach both to each player record. Mirror exactly what `lib/sleeper.mjs` in the data repo does (decision below in Algorithm). Update the stale-cache sentinel from `sample.dnpWeeks !== undefined` to `sample.weeklyStatus !== undefined` so cached pre-phase-5 entries get re-fetched.
- `src/api/dataStore.js` — `tryDataStore` shape validator: accept both schemaVersion 1 and 2 for `nfl/season-totals/*.json`. No required-field changes (new fields are optional).
- `src/components/PlayersTab.jsx` (or wherever `PlayerProfile`'s Stats tab is composed) — render `<AvailabilityHistory />` in the Stats tab, next to or below Role History.
- `README.md` — under "Career history loader": document the new fields and the v1/v2 dual-version reader behaviour. Under "Player profile / Stats tab": list the Availability History table.

### Data repo
- `lib/sleeper.mjs` — extend `aggregateWeeks`:
  1. While iterating each week, set `totals[playerId].weeklyStatus[week-1] = 'P' | 'D' | 'B'` (`'X'` is left in place from initialisation).
  2. Initialise each new player record with `weeklyStatus: Array(18).fill('X')`.
  3. After the main loop, for each player, compute the `availability` object (algorithm below).
- `lib/validate.mjs` — `validateNflSeason`: for every player record, assert `Array.isArray(weeklyStatus) && weeklyStatus.length === 18`, assert `availability` is present, and assert the three consistency invariants (`gamesPlayed === count('P')`, `byeWeeks === count('B')`, `dnpWeeks === count('D')`). Throw with a descriptive message on the first failure.
- `lib/manifest.mjs` — `updateManifestEntry` already accepts a `schemaVersion` field per entry per the existing manifest shape; update-nfl passes `schemaVersion: 2`.
- `scripts/update-nfl.mjs` — pass `schemaVersion: 2` into `updateManifestEntry`. No other changes.
- `README.md` — under `nfl/season-totals/<year>.json`: add the new fields and an example. Under `manifest.json`: note that season-totals files are now `schemaVersion: 2`.

---

## Function signatures

```js
// lib/sleeper.mjs — unchanged signature, expanded output
export function aggregateWeeks(weekData)
// per-player output gains:
//   weeklyStatus:  Array<'P' | 'D' | 'B' | 'X'>  (length 18)
//   availability:  {
//     longestAbsence:      number,
//     absenceSegments:     Array<{ start: number, end: number, length: number }>,
//     firstWeek:           number | null,
//     lastWeek:            number | null,
//     returnedFromAbsence: boolean,
//     absenceCause:        "unknown",
//   }
```

```js
// New helper in lib/sleeper.mjs, exported for unit-testability
export function computeAvailability(weeklyStatus)
//   weeklyStatus: Array<'P'|'D'|'B'|'X'> length 18
//   returns the availability object above
```

```jsx
// src/components/AvailabilityHistory.jsx
function AvailabilityHistory({ careerStats, playerId })
//   careerStats: { [season]: { [playerId]: { weeklyStatus?, availability?, gamesPlayed, dnpWeeks, ... } } }
//   playerId:    string
//   Returns: table; one row per season where careerStats[season][playerId] exists.
//   For seasons missing weeklyStatus (v1 file): show GP/DNP only, leave the sparkline blank.
```

---

## Algorithm — `computeAvailability(weeklyStatus)`

1. Find `firstWeek` = first index `i` where `weeklyStatus[i] === 'P'`, +1 for 1-based; `null` if none.
2. Find `lastWeek` analogously (scan from the end); `null` if none.
3. **Absence segments**: scan indices `firstWeek-1 .. lastWeek-1` inclusive (i.e. only weeks bracketed by the player's actual season). Within that range, group consecutive `D` weeks into segments. `B` and `X` weeks break a run.
4. `longestAbsence` = max `length` across segments, or `0` if none.
5. `returnedFromAbsence` = there exists a segment whose `end < lastWeek` (i.e. the player came back and played at least one more week after a `D` run).
6. `absenceCause` = `"unknown"`.

Edge cases:
- Player never appears (`firstWeek === null`): return `{ longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: "unknown" }`.
- Player has `firstWeek` but no `D` in range: empty segments, `longestAbsence: 0`, `returnedFromAbsence: false`.

---

## Data shapes (recap)

**Per-player season record after phase 5:**
```js
{
  stats:               { [statKey]: number },
  gamesPlayed:         number,
  gamesStarted:        number,
  byeWeeks:            number,
  dnpWeeks:            number,
  weeklyPoints:        { [week]: number },
  fantasyPoints:       number,
  scoringBasis:        "half_ppr",
  weeklyStatus:        Array<'P'|'D'|'B'|'X'>,   // length 18, NEW
  availability:        {                          // NEW
    longestAbsence:      number,
    absenceSegments:     Array<{ start: number, end: number, length: number }>,
    firstWeek:           number | null,
    lastWeek:            number | null,
    returnedFromAbsence: boolean,
    absenceCause:        "unknown",
  },
}
```

**Manifest entry (per file):** `schemaVersion: 2` for any season-totals file written by post-phase-5 update-nfl.

---

## Integration points

- The new fields ride on the existing `careerStats[season][playerId]` object that already flows through `ProfileDataContext`. No pipeline reordering, no new state in `App.jsx`.
- `playerRows` pipeline (steps 1–7 in CLAUDE.md) is **untouched**. `computeDynastyScore` still reads `gamesPlayed` and `dnpWeeks` only — that is intentional for phase 5.
- The Player Profile Stats tab is rendered by `PlayersTab.jsx` via `usePlayerProfile`. `AvailabilityHistory` is a presentational sibling; no hook changes needed.

---

## Acceptance criteria

- [ ] `node bin/update.mjs nfl --year 2023 --force --dry-run` prints a diff summary that adds `weeklyStatus` and `availability` for every player and changes nothing else (besides those two fields and the manifest's `schemaVersion` bump on actual write).
- [ ] After `--force` on 2023, the resulting `nfl/season-totals/2023.json` has, for every player:
  - `weeklyStatus.length === 18`
  - `weeklyStatus.filter(s => s === 'P').length === gamesPlayed`
  - `weeklyStatus.filter(s => s === 'D').length === dnpWeeks`
  - `weeklyStatus.filter(s => s === 'B').length === byeWeeks`
  - `availability` present with all six keys.
- [ ] `validateNflSeason` rejects (with a descriptive error) a totals object where any player lacks `weeklyStatus` or where the counts disagree.
- [ ] **CMC 2023 spot check** (Sleeper player_id `4034`): `gamesPlayed === 16`, `weeklyStatus` shows a single missed week. (CMC played 16 games in 2023 per public records.)
- [ ] **Dobbins 2023 spot check** (Sleeper player_id `6803`): `gamesPlayed === 1` (torn ACL in Week 1), `weeklyStatus[0] === 'P'` and `weeklyStatus[1..17]` is a long run of `D` (no return), `availability.longestAbsence === 17` (or 16 once bye is removed depending on bye placement), `availability.returnedFromAbsence === false`.
- [ ] **Jefferson 2023 spot check** (Sleeper player_id `6794`): `availability.returnedFromAbsence === true` (he missed 7 games to a hamstring then returned), `availability.longestAbsence` ≈ 7, `absenceSegments.length >= 1`.
- [ ] App build (`npm run build` in `sleeper-dashboard`) passes with no warnings.
- [ ] Loading a player profile in the app (e.g. CMC) shows an Availability History table with a row for 2023 and a 18-cell sparkline.
- [ ] Loading a player profile with only v1 season-totals files still works — Availability History renders rows with GP/DNP only and a blank sparkline.
- [ ] All 13 historical years backfilled and committed in `sleeper-dashboard-data`; `manifest.json` shows `schemaVersion: 2` on every `nfl/season-totals/*.json` entry.

---

## Out of scope

- Any change to `dynastyScore.js` or to the dynasty score itself.
- New durability sub-signals (`longestAbsence` etc.) feeding into Reliability.
- External injury data ingestion (injury reports, designations, types/severity).
- Per-week injury *cause* labelling (the `absenceCause` field stays `"unknown"`).
- Changes to `byeWeeks`/`dnpWeeks`/`gamesPlayed` semantics — those keep their current definitions exactly.
- Any change to the live `loadCareerHistory` ordering, cache TTLs, or fetch concurrency.

---

## Documentation

- `sleeper-dashboard/README.md`: update "Career history loader" section to document the new per-player fields and the v1/v2 dual reader; add a brief "Availability History" entry under Player Profile / Stats tab.
- `sleeper-dashboard-data/README.md`: update the `nfl/season-totals/<year>.json` schema example with the new fields and bump the documented schemaVersion to 2.

---

## Open questions / risks

- **Sleeper weekly endpoint completeness for old years.** The phase-4 aggregation already runs back to 2012; we are not changing the fetch, just preserving more of its output. Risk is low but not zero — the dry-run pre-flight on 2012 will catch any oddly-shaped historical week response.
- **Bye-week detection in the early playoff-format years.** Pre-2021 the NFL had 17 regular-season weeks, not 18. The existing code already iterates 1..18, and weeks that don't exist come back as empty entry arrays — those weeks will end up as `X` for every player. That's correct semantically (no team played that week), but it inflates `X` counts for old seasons. Optionally: in `computeAvailability`, treat trailing `X` weeks (after the last week any team played that season) as not part of the player's season window. **Decision: do not special-case in phase 5.** The aggregates already use `firstWeek..lastWeek` bounds, so this doesn't pollute `longestAbsence`. The sparkline UI just shows extra hollow cells for old seasons, which is honest.
- **`X` vs `D` ambiguity for low-usage players.** A practice-squad WR who never appears in any week's stat dump will be all `X` and have `gamesPlayed: 0`, which is correct. The app already filters by `gamesPlayed >= N` in most consumers, so this doesn't change behaviour.
- **Backfill churn in CI.** 13 sequential commits will fire the GitHub Action 13 times if it's wired to run on every push. Mitigation: do the backfill on a feature branch, squash-merge once.
- **Cache invalidation in deployed app.** The `tryDataStore` shape validator changes; existing user IndexedDB caches keyed by data-store path may still hold v1 payloads. The stale-cache sentinel update (`sample.weeklyStatus !== undefined`) addresses this for the live-API path but not for the data-store path. Confirm during implementation whether `dataStore.js` keys its cache in a way that survives a schemaVersion change — if not, add a sentinel check there too. **Flag this for the sonnet session as a must-resolve.**
