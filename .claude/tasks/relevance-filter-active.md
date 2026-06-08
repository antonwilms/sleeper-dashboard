# Relevance filter — exclude retired / out-of-league players

**Planning session (opus). Implementer: sonnet.** Read this whole file first. If
anything contradicts the code, stop and ask — do not improvise.

---

## 0. Data-availability finding (read FIRST — gates the design)

I inspected REAL data (live Sleeper `/players/nfl`, live nflverse roster CSVs),
not just grep, per CLAUDE.md Field-existence rule. Today's date is **2026-06-08**,
so the **upcoming season is 2026** and we are in the **June offseason**.

### A. How reliable are the current Sleeper fields for retirement?

Checked known-retired skill players in the live Sleeper player payload:

| Player | `status` | `active` | `team` |
|---|---|---|---|
| Tom Brady | (absent/Active) | **true** | `null` |
| Matt Ryan | (absent/Active) | **true** | `null` |
| Ben Roethlisberger | (absent/Active) | **true** | **`PIT`** ← stale |
| Rob Gronkowski | … | **true** | `null` |
| Drew Brees / Rivers / Fitzgerald / Julio / Gore / Hopkins | … | **true** | `null` |
| Andrew Luck | … | false | `null` |

Findings:
- **`active` is useless** — `true` for ~all retirees (only Luck `false`).
- **`status`** (the app's `api.sleeper.app/v1` payload populates it, e.g.
  `'Active'`/`'Free Agent'`; the `api.sleeper.com` payload omits it entirely) is
  **unreliable for retirement** — confirmed by existing docs (Brady/Ryan show
  active) and by the v1 endpoint marking retirees `Active`. Do **not** build on it.
- **`team` is the most useful existing field but leaks**: most retirees correctly
  have `team: null`, **but some retain a stale team** (Roethlisberger → `PIT`,
  retired after 2021). This stale-team subset is exactly what leaks through
  **Rule 5** (`nfl_team set AND ktcMap.has(id)`).

**Which `isRelevantPlayer` rules leak, and how badly:**
- **Rule 5 (`onNflTeam && inKtc`) — PRIMARY LEAK.** A retiree with a stale Sleeper
  `team` plus a KTC value that lingers a season post-retirement satisfies both →
  kept. This is the clear, fixable case.
- **Rule 4 (`playedRecently`, last 2 seasons) — residual leak.** Anyone who played
  in either of the last 2 seasons is kept, including players who retired this
  offseason. This window is inherently bounded (they really did play recently) and
  cannot be tightened until the 2026 roster publishes — captured, not hard-fixed.
- Rules 1–3 (ghost / rostered / rookies) do not leak retirees.

### B. Is nflverse current-roster a viable better signal?

**Yes — with one important correction to the access pattern.**

- **nflverse moved data off `@master`.** The draft URL pinned in `nflDraft.js`
  (`cdn.jsdelivr.net/gh/nflverse/nflverse-data@master/data/draft_picks/draft_picks.csv`)
  now **404s** — datasets are published as **GitHub Release assets**, and jsDelivr
  does not serve release assets (`@rosters` tag → 404). The working pattern is the
  **release-download URL**:
  `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_<year>.csv`
  *(Flag: `nflDraft.js` likely also silently failing now — see §7 "Out of scope".)*
- **`roster_2025.csv` exists and is excellent for this:** 3137 rows, 36 columns,
  including a **`sleeper_id` column → direct join to `playerMap`, no fuzzy name
  matching**. Skill-position rows: 972; **86% (834) carry a `sleeper_id`**. Columns
  used: `season, team, position, full_name, status, gsis_id, sleeper_id`.
- **Retiree separation works:** Brady (167), Roethlisberger (138), Ryan (24),
  Gronkowski (515) are **entirely absent** from roster_2025. Active players present
  (Rodgers 96→PIT ACT, Hopkins 1426→BAL ACT).
- **Status column** values: `ACT, RES, INA, DEV, CUT, RET, TRD, TRC`. **Noise
  exists even among present rows** — Philip Rivers (331, retired 2020) appears as a
  stale `INA` row. So **presence is a keep-signal but is itself noisy; ABSENCE is
  the clean retiree signal** (the genuine retirees are fully absent).

### C. Offseason coverage of the **upcoming** (2026) roster — the critical gate

- **`roster_2026.csv` does NOT exist yet** (HTTP 504 / empty — not published in
  June). A 2026-roster-absence exclusion would hide **everyone**.
- `roster_2024.csv` returned a transient 504 at probe time but normally exists.

**Therefore the design must target the most-recent *available* roster year**
(probe `currentSeason` → fall back downward), and must **degrade gracefully**:
if no roster resolves, or the resolved file is clearly incomplete, fall back to
exactly today's behavior. Using `roster_2025` during the 2026 offseason means a
player who played 2025 then retires in 2026 is still present in 2025 → kept
(acceptable; that's Rule 4's bounded residual leak, not ours to fix yet).

### Design conditionality (driven by the finding)

The roster signal is **viable and authoritative for absence**, but **noisy for
presence** and **unavailable for the upcoming season in-offseason**. So:
- Use roster **absence** to **tighten the primary leak (Rule 5)** only.
- Use roster **presence** as a **new, purely-additive keep-signal** (never excludes).
- **Always** keep rostered players and current rookies regardless of roster data.
- When roster data is unavailable/incomplete → **`'unknown'` → behave exactly as
  today** (no exclusions added).
- **Capture-first**: record per-row roster status from day one so accuracy can be
  sanity-checked; the only behavior change is the conservative Rule-5 tightening.

---

## 1. New source module — `src/api/nflRoster.js` (modeled on `nflDraft.js`)

Purely app-side. No data-repo involvement (see Cross-repo §). Direct nflverse
**release-download** CDN fetch, per-year permanent IndexedDB cache, graceful failure.

```js
// Release-asset base (NOT @master jsDelivr — that no longer serves nflverse data).
const NFLVERSE_ROSTER_URL = year =>
  `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${year}.csv`

// A resolved roster is "complete enough" to trust absences only above this many
// sleeper-id-bearing rows. roster_2025 has ~2141; a preliminary file has a few hundred.
const MIN_ROSTER_IDS = 1500

// Status values treated as "out of the league" → excluded from activeIds.
// Permissive by design (bias against false exclusion): only explicit RET is dropped.
const OUT_STATUSES = new Set(['RET'])
```

### `parseRosterCsv(csvText)` — pure, exported (testable)
Reuse the `splitCsvLine` CSV approach from `nflDraft.js` (quoted-field safe).

```js
/**
 * @param {string} csvText
 * @returns {{
 *   activeIds: Set<string>,          // sleeper_ids with status ∉ OUT_STATUSES
 *   byId: { [sleeperId]: { team, position, status, fullName } },
 *   season: number|null,
 *   rowCount: number                 // sleeper-id-bearing rows parsed
 * }}
 * Column-defensive: requires `sleeper_id` + `status`; if missing, logs once and
 * returns an empty result (activeIds: empty Set, rowCount: 0).
 */
export function parseRosterCsv(csvText) { … }
```
Notes: skip rows with empty `sleeper_id` (can't join). Trim values. `season` from
the first data row's `season` column (file is single-season).

### `loadCurrentRoster(currentSeason)` — exported loader
```js
/**
 * Resolves the most-recent AVAILABLE roster, probing currentSeason downward.
 * @param {number} currentSeason   e.g. 2026 (nflState season)
 * @returns {Promise<{
 *   activeIds: Set<string>|null,   // null when nothing usable resolved
 *   year: number|null,             // the resolved roster year (e.g. 2025)
 *   complete: boolean,             // rowCount >= MIN_ROSTER_IDS
 *   byId: object|null,
 * }>}
 *
 * Flow (mirrors nflDraft.js cache+fetch+graceful-catch):
 *   for year of [currentSeason, currentSeason-1, currentSeason-2]:
 *     1. cache `nfl-roster/<year>` (getCacheRecord) — permanent TTL
 *     2. else fetch NFLVERSE_ROSTER_URL(year) with 5s AbortController timeout
 *        - non-200 (incl. 504 for unpublished year) → try next year
 *        - parse; if rowCount >= MIN_ROSTER_IDS → cache + return {complete:true}
 *        - if parsed but rowCount < MIN_ROSTER_IDS (preliminary/sparse) → do NOT
 *          cache as complete; try the next (older) year instead
 *   if no year yields a complete roster → return { activeIds:null, year:null,
 *     complete:false, byId:null }  // caller falls back to current behavior
 */
export async function loadCurrentRoster(currentSeason) { … }
```
Cache shape stored per year: `{ activeIds: string[] (serialized Set), byId,
season, rowCount }` — serialize the Set as an array for IndexedDB; rehydrate to a
Set on read. (Mirror `nflDraft.js` permanent-TTL `setCacheWithMeta`.)

Caching subtlety: only cache a year when `rowCount >= MIN_ROSTER_IDS`, so a
sparse preliminary `roster_2026` is never persisted as authoritative.

---

## 2. Wiring into App.jsx (no pipeline reorder)

### 2a. State + load effect (mirror the nflDraft effect at App.jsx:1226–1238)
- New state near line 525–527: `const [nflRoster, setNflRoster] = useState(null)`.
- New `useEffect` keyed on `[leagueData, nflState]` (needs `nflState.season` for
  `currentSeason`; if `nflState` not yet loaded, key on what gives the season —
  confirm the season source already used by the projection pipeline). Strict-Mode
  `cancelled` guard (CLAUDE.md invariant):
```js
useEffect(() => {
  if (!leagueData?.playerMap || !currentSeason) return
  let cancelled = false
  loadCurrentRoster(currentSeason)
    .then(r => { if (!cancelled) setNflRoster(r) })
    .catch(err => console.warn('[nflRoster] Load error:', err.message))
  return () => { cancelled = true }
}, [leagueData, currentSeason])
```

### 2b. Thread into the `playerRows` memo (opens App.jsx:627, deps at :790)
- Add `nflRoster` to the dependency array at line 790.
- Inside the memo, derive once:
```js
const rosterIds      = nflRoster?.activeIds ?? null
const rosterComplete = nflRoster?.complete === true && rosterIds != null
const rosterYear     = nflRoster?.year ?? null
```

### 2c. Extract the relevance helpers to a pure module (testability)
`isRelevantPlayer` / `playedRecently` are currently inner functions (App.jsx:740–774)
and cannot be unit-tested. **Extract to `src/utils/relevance.js`** as pure
functions called at the SAME point (line 776) — this is not a pipeline reorder,
just hoisting pure logic out of the closure.

```js
// src/utils/relevance.js

/** True if gamesPlayed > 0 in any of the last `lookback` seasons. */
export function playedRecently(careerStats, playerId, mostRecentSeason, lookback = 2) { … }

/**
 * Roster membership for a player.
 * @returns {'present'|'absent'|'unknown'}
 *   'unknown' when roster unavailable/incomplete → callers must fall back.
 */
export function rosterStatusOf(playerId, rosterIds, rosterComplete) {
  if (!rosterComplete || !rosterIds) return 'unknown'
  return rosterIds.has(playerId) ? 'present' : 'absent'
}

/**
 * @param {object} args {
 *   row, playerMap, rosteredIds, ktcMap, careerStats, mostRecentSeason,
 *   rosterIds, rosterComplete
 * }
 * @returns {boolean} keep?
 */
export function isRelevantPlayer(args) { … }
```

### 2d. New `isRelevantPlayer` logic (the only behavior change)
Evaluation order — **rostered & rookies always kept BEFORE any roster gate**:
```
1. Ghost entry          → exclude        (unchanged)
2. rosteredIds.has(id)  → KEEP           (unchanged — guarantee)
3. rookie (yrs_exp===0 && age>0) → KEEP  (unchanged — guarantee)

   rs = rosterStatusOf(id, rosterIds, rosterComplete)

4. NEW keep — roster presence:
   if (rs === 'present') → KEEP          (additive; catches Sleeper-FA-but-rostered)
5. Played last 2 seasons → KEEP          (unchanged; Rule-4 residual leak captured)
6. TIGHTENED Rule 5:
   onNflTeam && inKtc && rs !== 'absent' → KEEP
   (when rs === 'absent' the stale-team+KTC combo no longer rescues a retiree;
    when rs === 'unknown' this is byte-identical to today)
7. else → exclude
```
Net effect vs today: the **only** players newly excluded are those who (a) are not
rostered, (b) are not current rookies, (c) did not play in the last 2 seasons, (d)
are kept today **solely** by Rule 5 (stale team + KTC), AND (e) are definitively
**absent from a complete current roster**. That is the Roethlisberger-class clear
retiree. Everyone with a real signal is retained. When roster is unknown/incomplete
→ **zero** behavior change.

### 2e. Capture-first field on each row
When building rows (App.jsx:717 `rows.push({…})`), add:
```js
rosterStatus: rosterStatusOf(playerId, rosterIds, rosterComplete),  // 'present'|'absent'|'unknown'
rosterYear,                                                          // number|null
```
Add a one-line diagnostic after filtering (near the existing `[perf][memo]` log):
```js
console.info('[relevance] rosterYear=%s complete=%s newlyExcluded≈%d',
  rosterYear, rosterComplete, /* count of rows failing only due to rs==='absent' */ …)
```
This lets the signal’s accuracy be eyeballed before trusting it. The row field is
internal to `playerRows` (not the `factors` contract); low-risk to add.

---

## 3. Step sequence for the implementer
1. `src/api/nflRoster.js`: `parseRosterCsv`, `loadCurrentRoster` (+ constants).
2. `src/utils/relevance.js`: `playedRecently`, `rosterStatusOf`, `isRelevantPlayer`.
3. `src/App.jsx`: `nflRoster` state + load effect; thread into `playerRows` memo
   (deps + derive `rosterIds`/`rosterComplete`/`rosterYear`); replace inner
   `isRelevantPlayer`/`playedRecently` with calls to the new module; add
   `rosterStatus`/`rosterYear` row fields + diagnostic log.
4. Tests (§Tests). 5. Docs (§Docs). 6. `npm test` + `npm run build`.

Do **not** change the candidate-pool construction (App.jsx:646–662) or any memo
order. `currentSeason`: reuse whatever the file already uses to derive the current
NFL season for the projection pipeline (confirm the exact variable when wiring;
do not introduce a second source of truth).

---

## 4. Docs updates (apply mechanically)

### `docs/architecture.md`
1. **Relevance-filter table (lines 125–133)** — add a row after the Rule-5 row and
   amend the closing paragraph. New row:
   `| nflverse current-roster **presence** (`rosterStatusOf === 'present'`) | Authoritative "on an NFL roster" keep-signal; additive — never excludes |`
   Amend the Rule-5 row's rationale to:
   `Both signals required, AND the player is not definitively absent from a complete current nflverse roster — closes the stale-team + lingering-KTC retiree leak (e.g. Roethlisberger shows team PIT but is absent from roster_2025).`
   Append to the closing paragraph (after line 133): a sentence stating roster
   **absence** only tightens Rule 5 and only when a complete roster resolved;
   when the roster feed is unavailable or incomplete (e.g. the upcoming-season
   file in the offseason), the filter falls back to the prior behavior, and
   rostered players and current rookies are always kept regardless.
2. **Player ID sources (lines 115–119)** — no change (candidate pool unchanged);
   leave as-is.
3. **`leagueData`/state shape (~lines 30–50)** — add a line documenting the new
   `nflRoster` state: `{ activeIds: Set<sleeper_id>|null, year, complete, byId }`,
   loaded from nflverse roster CSV; null until the loader resolves.

### `docs/integrations.md`
- Add a subsection **"nflverse current rosters (`src/api/nflRoster.js`)"** modeled
  on the existing "nflverse draft picks" section. State: source =
  `releases/download/rosters/roster_<year>.csv` (release asset — **not** the
  `@master` jsDelivr path, which nflverse no longer serves); has a `sleeper_id`
  column → direct join (no fuzzy match); ~86% sleeper_id coverage of skill rows;
  per-year permanent IndexedDB cache `nfl-roster/<year>`; probes
  `currentSeason → -1 → -2`; `MIN_ROSTER_IDS` completeness gate; graceful failure →
  `'unknown'` → relevance filter falls back. Note the offseason reality: the
  upcoming-season roster is unpublished until ~late summer, so in-offseason the
  resolved year is `currentSeason − 1`.

### `README.md`
- If README enumerates data sources / integrations, add nflverse rosters alongside
  nflverse draft picks. If it has no such list, **no change** — state so in the PR.

### `CLAUDE.md`
1. **`src/api/` table** — add a row:
   `| `nflRoster.js` | nflverse current-season roster loader (release-asset CSV); `sleeper_id`-keyed active-roster Set; per-year permanent cache; graceful fallback |`
2. **`src/utils/` table** — add a row:
   `| `relevance.js` | `isRelevantPlayer`, `playedRecently`, `rosterStatusOf` — pure candidate-pool relevance gate (extracted from App.jsx); roster-absence tightens the stale-team+KTC rule |`
3. **Patterns → Caching** or a nearby note: optionally record that nflverse data is
   now fetched via **release-download URLs**, not `@master` (the `@master` path
   404s). Keep thin.

---

## 5. Tests to add

### New unit tests — `src/api/nflRoster.test.js` (co-located)
`parseRosterCsv`:
1. **Happy path** — small CSV with header + 3 rows (one ACT, one RES, one RET) →
   `activeIds` contains the ACT and RES sleeper_ids, **excludes the RET id**;
   `rowCount === 3`; `byId` shape correct; `season` parsed.
2. **Empty sleeper_id row** — a row with blank `sleeper_id` is skipped (not in
   `activeIds`, not counted in rowCount).
3. **Missing required column** (`sleeper_id` absent) → empty result, logs once,
   `activeIds.size === 0`, `rowCount === 0`.
4. **Quoted name with comma** (`"Smith, Jr."`) parses without splitting.

`loadCurrentRoster` (mock `fetch` + cache):
5. **Upcoming-season unpublished** — `fetch(2026)` → 504, `fetch(2025)` → complete
   CSV (rowCount ≥ MIN_ROSTER_IDS) ⇒ resolves `{ year: 2025, complete: true,
   activeIds: non-null }`.
6. **All years fail** (network throws / all 504) ⇒ `{ activeIds: null, year: null,
   complete: false }` (graceful).
7. **Sparse/preliminary file** — `fetch(2026)` returns a CSV with rowCount <
   MIN_ROSTER_IDS ⇒ NOT treated as complete, falls through to 2025; the sparse
   2026 file is **not cached** as authoritative.
8. **Cache hit** — `nfl-roster/2025` present in cache ⇒ no fetch; Set rehydrated
   from stored array.

### New unit tests — `src/utils/relevance.test.js` (co-located)
Use minimal `playerMap`/`careerStats`/`rosteredIds`/`ktcMap` fixtures.
9. **Guarantee: rostered always kept** — player absent from roster, no recent play,
   but `rosteredIds.has(id)` ⇒ keep (even with `rosterComplete: true, absent`).
10. **Guarantee: current rookie always kept** — `years_exp 0, age 21`, absent from
    roster ⇒ keep.
11. **Primary fix: stale-team + KTC retiree excluded** — not rostered, not rookie,
    no play in last 2 seasons, `nfl_team:'PIT'`, `ktcMap.has(id):true`,
    `rosterComplete:true`, `rs:'absent'` ⇒ **exclude** (was kept before).
12. **Fallback: roster unknown ⇒ no behavior change** — same inputs as #11 but
    `rosterComplete:false` (rs `'unknown'`) ⇒ **keep** (Rule 5 still fires) —
    proves graceful degradation never hides players.
13. **Roster presence keep** — Sleeper `team:null` (or `'FA'`), not in KTC, no
    recent play, but `rs:'present'` ⇒ keep (new additive signal).
14. **Played-recently still keeps** — absent from roster, `rosterComplete:true`,
    but `gamesPlayed>0` last season ⇒ keep (Rule 4 untouched).
15. **Ghost entry excluded** — no age/team/years_exp/full_name ⇒ exclude regardless.
16. **`rosterStatusOf`** — present/absent/unknown mapping incl. `rosterComplete:false`
    and `rosterIds:null` both ⇒ `'unknown'`.
17. **`playedRecently`** — boundary: gp in season `mostRecentSeason-1` true; gp only
    in `mostRecentSeason-2` ⇒ false at lookback 2.

### Existing tests whose expected values change
- **None expected.** `isRelevantPlayer`/`playedRecently` are not currently exported
  or unit-tested (grep: referenced only in `src/App.jsx`), so extraction adds no
  failing assertions. App.jsx integration is not under test (per README Scope).
  **Action for implementer:** after extraction, run `npm test` — if any snapshot or
  integration fixture references the inner functions or row shape, update it to the
  new `rosterStatus`/`rosterYear` row fields and report it; otherwise state "no
  existing tests changed."

---

## 6. Cross-repo impact

**None.** This is purely app-side: `nflRoster.js` fetches directly from the
nflverse GitHub release CDN (same external-source pattern as `nflDraft.js`), caches
in the app's own IndexedDB, and adds no field to the snapshot/season-totals/
enrichment/manifest contracts with `sleeper-dashboard-data`. The new `rosterStatus`
row field lives only in the in-memory `playerRows` and is not exported to any
snapshot. No sibling-repo mirroring required.

---

## 7. Out of scope / flagged
- **Latent bug (separate task):** `nflDraft.js`'s pinned
  `@master/data/draft_picks/draft_picks.csv` URL now **404s** (nflverse moved data
  to release assets) — draft-slot matching is likely silently failing. Worth its
  own fix to the release-download URL; do **not** bundle it into this change.
- **Rule-4 residual leak** (offseason retirees who played last season) — not fixable
  until `roster_<upcoming>` publishes; captured via `rosterStatus` for later.
- **nflverse presence noise** (e.g. stale `INA` rows like Rivers) — intentionally
  not used to exclude; only absence excludes, only presence keeps.
