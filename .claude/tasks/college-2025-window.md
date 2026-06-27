# College CFBD ingest window — include the most recent completed season (2025+)

**Type:** single-feature, app-side ingest-window fix (cross-repo aware). Opus plan → Sonnet impl.
**Scope guard:** Change **only** the CFBD fetch window. Do **not** touch projection math, the rookie
path, `computeCollegeMetrics`, `matchCollegeToSleeper`, the factors contract, or any cache TTL.

---

## Problem

`loadCollegeStats()` in `src/api/cfbd.js` fetches a **hardcoded** year set
`COLLEGE_YEARS = [2017 … 2024]` (cfbd.js:8). Players whose final college season is 2025 (the 2026
rookie class — e.g. Kaelon Black, RB, Indiana) get **no** college rows, so the rookie path's
college signals (dominator, breakout age, production trend → `collegeContribution`) are blank for
the entire incoming class. The window must (a) include the most recent completed college season and
(b) advance automatically each year off the app's existing season anchor, not a literal that needs a
manual annual bump.

---

## Data-path determination (traced from live source — REQUIRED finding)

The app reads college stats via a **hybrid path**, not CFBD-API-direct. `getBulkPlayerStats(year, category)`
(`src/api/cfbd.js:21-62`) resolves in three tiers, in order:

1. **IndexedDB cache** — `cfbd-players/<year>/<category>` (permanent, TTL 999999). (cfbd.js:25-39)
2. **Data store (served files)** — `tryDataStore('college/<category>/<year>.json', { validate: isValidCFBDRows })`
   against `VITE_DATA_STORE_URL` (jsDelivr → `sleeper-dashboard-data`). (cfbd.js:42-52)
3. **Live CFBD API** — `GET {CFBD_BASE}/stats/player/season?year=&category=`, used only when 1 and 2 miss. (cfbd.js:54-61)

**Conclusion: the served-file path IS in use.** The data repo currently materializes only
`college/{receiving,rushing,passing}/2017…2024.json` (verified on disk in the sibling repo). Therefore
**Cross-repo impact is real** — the data repo must materialize 2025 (and onward) for the data-store
tier to serve it. Until it does, the app still obtains 2025 via the **live-API fallback (tier 3)**
provided `VITE_CFBD_API_KEY` is set, so the app change is independently functional; the data-repo
update is required to keep the served path complete and the documented coverage accurate, not to make
the fix work. (See Cross-repo impact.)

Overshoot safety (confirmed by tracing the cache/data-store/live tiers): if the upper bound ever names
a not-yet-completed season, CFBD returns `[]`; `isValidCFBDRows` rejects empty arrays so the data-store
tier falls through; the live tier caches `[]` with **empty meta** (`{}`), and on the next session that
empty entry has no `sourceLastModified`, so the `else` branch at cfbd.js:36-38 falls through and
**re-attempts** — i.e. an empty year self-heals once data exists and is never permanently trapped.
(In practice the chosen anchor never reaches a season before it has begun, so empty-overshoot is at
most a transient, harmless extra round-trip mid-NFL-season.)

---

## Season anchor decision

Use the **careerStats-derived current season** — `allSeasons[allSeasons.length - 1]` where
`allSeasons = Object.keys(careerStats).map(Number).sort()`. This is exactly the notion the task points
at: the same `currentSeason` value `computePositionalRanks` receives (App.jsx:475-476), and the same
anchor already used for the `collegeStats` memo (App.jsx:215-216) and the advstats load (App.jsx:873-874).

Why this anchor and not `nflState.season`:
- The careerStats anchor is the **last completed** NFL season (2025 now), which aligns with the last
  completed **college** season (college 2025 finished ~Jan 2026; NFL 2025 finished ~Feb 2026). It is
  2025 right now — exactly what we want.
- `nflState.season` is the **active/upcoming** season (2026 now, offseason). Using it would request
  college 2026 (not yet played) every offseason — a guaranteed one-year overshoot. Rejected.
- It is already in scope at the call site: the `loadCollegeStats` effect (App.jsx:826-837) already
  depends on `careerStats`, so no new effect dependency is introduced.

A clean anchor exists, so the primary mechanism is the anchor (auto-advancing). A **2025 floor**
constant is added only as a defensive net for a missing/invalid anchor (and to guarantee we never
regress below the 2026-class requirement). Its maintenance cost is ~zero: the anchor advances on its
own, so the floor never *needs* bumping; it is a `Math.max` lower bound, not the source of truth.

---

## Edits

### File: `src/api/cfbd.js`

**Edit 1 — replace the hardcoded `COLLEGE_YEARS` const with a start + floor pair and a pure window helper.**
Anchor: line 8 (`const COLLEGE_YEARS = [2017, 2018, …, 2024]`).

Remove line 8. Add, in its place (module scope, near the other top-level consts):

```js
const COLLEGE_START_YEAR = 2017
// Defensive floor for the window's upper bound: the 2026 rookie class needs the
// 2025 college season. The live caller always passes the careerStats-derived
// current-season anchor (which auto-advances), so this floor only guards a
// missing/invalid anchor and a never-regress lower bound — it is not the source
// of truth and does not need an annual bump.
const COLLEGE_MIN_END_YEAR = 2025

// Inclusive CFBD season list, from the 2017 floor up through the later of
// COLLEGE_MIN_END_YEAR and the supplied season anchor. Pure — unit-tested.
export function collegeFetchYears(endYear) {
  const last = Math.max(
    COLLEGE_MIN_END_YEAR,
    Number.isFinite(endYear) ? endYear : COLLEGE_MIN_END_YEAR
  )
  const years = []
  for (let y = COLLEGE_START_YEAR; y <= last; y++) years.push(y)
  return years
}
```

**Edit 2 — make `loadCollegeStats` accept the anchor and drive the loop off `collegeFetchYears`.**
Anchor: `export async function loadCollegeStats()` (cfbd.js:96) and its `for` loop over `COLLEGE_YEARS`
(cfbd.js:101-108).

Change the signature to `loadCollegeStats(endYear)` and replace the `COLLEGE_YEARS` references with a
local `years = collegeFetchYears(endYear)`. The loop body, the per-year/category `getBulkPlayerStats`
calls, the `console.log`, and the `delay(400)` inter-year pacing are **unchanged** except that they
iterate `years` instead of `COLLEGE_YEARS`:

```js
export async function loadCollegeStats(endYear) {
  const receiving = {}
  const rushing   = {}
  const passing   = {}

  const years = collegeFetchYears(endYear)

  for (let i = 0; i < years.length; i++) {
    const year = years[i]
    receiving[year] = await getBulkPlayerStats(year, 'receiving')
    rushing[year]   = await getBulkPlayerStats(year, 'rushing')
    passing[year]   = await getBulkPlayerStats(year, 'passing')
    console.log(`[cfbd] ${year} rec: ${receiving[year].length}, rush: ${rushing[year].length}, pass: ${passing[year].length}`)
    if (i < years.length - 1) await delay(400)   // preserve inter-year rate-limit pacing
  }

  return { receiving, rushing, passing }
}
```

No change to `getBulkPlayerStats`, `pivotStatRows`, `computeTeamTotals`, the cache keys, or the data-store
path — adding 2025 only creates new `cfbd-players/2025/<category>` keys; existing cached years are
untouched (additive, no invalidation).

### File: `src/App.jsx`

**Edit 3 — pass the careerStats-derived current season into `loadCollegeStats`.**
Anchor: the college-load effect at App.jsx:826-837 (`loadCollegeStats()` call at line 829; effect deps
`[careerStats, leagueData]` at line 837).

Compute the anchor inside the effect (mirroring App.jsx:215-216 and App.jsx:873-874) and pass it:

```js
  // Load college stats in background once career history is ready, then match to Sleeper
  useEffect(() => {
    if (!careerStats || !leagueData?.playerMap) return
    let cancelled = false
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const currentSeason = allSeasons[allSeasons.length - 1]
    loadCollegeStats(currentSeason)
      .then(data => {
        if (cancelled) return
        setCollegeMatches(matchCollegeToSleeper(data, leagueData.playerMap))
      })
      .catch(err => console.warn('[cfbd] Load error:', err.message))
      .finally(() => { if (!cancelled) setCollegeSettled(true) })
    return () => { cancelled = true }
  }, [careerStats, leagueData])
```

The effect already depends on `careerStats`, so **no dependency-array change** is required. The
`.finally(setCollegeSettled)` snapshot-write gate (App.jsx:835) is preserved verbatim.

Data shape returned by `loadCollegeStats` is unchanged:
`{ receiving: { [year]: rows[] }, rushing: { [year]: rows[] }, passing: { [year]: rows[] } }`, now with
an extra `2025` (and onward) key. `matchCollegeToSleeper` iterates `Object.keys(rawCollegeData.receiving)`
dynamically (collegeMatch.js:118) and `computeCollegeMetrics` uses `currentSeason` only for
`estimatedAge` and iterates whatever seasons are present (collegeMetrics.js:60-61) — both are purely
additive; no further app edits needed.

---

## Docs updates

App repo (in-scope for this implementer; apply mechanically):

1. **`docs/integrations.md` line 18** — CFBD `loadCollegeStats` description.
   - Before: `\`loadCollegeStats()\` fetches receiving + rushing + passing for years 2017–2024 sequentially (400 ms delay between years to respect rate limits). Returns …`
   - After: `\`loadCollegeStats(endYear)\` fetches receiving + rushing + passing for years 2017 through the season anchor (\`collegeFetchYears(endYear)\`, floored at 2025) sequentially (400 ms delay between years to respect rate limits). \`endYear\` is the careerStats-derived current season (the last completed season, e.g. 2025 for the 2026 rookie class), so the window advances automatically each year. Returns …` (keep the rest of the sentence unchanged).

2. **`docs/integrations.md` line 204** — College-coverage bullet.
   - Before: `- **College coverage:** CFBD college stats are loaded for **2017–2024 only** (see CFBD integration below), so the rookie path's college signals are blank for players whose college careers fall outside that window.`
   - After: `- **College coverage:** CFBD college stats are loaded for **2017 through the current completed season** (anchor-tracked; currently 2017–2025), so the rookie path's college signals are blank only for players whose college careers predate 2017.`

3. **`docs/signal-registry.md` line 20** — "Findings that correct or sharpen the docs" table, CFBD row.
   - Before: `| CFBD college (passing/receiving/rushing) | per-year | ✅ **2017–2024** (no earlier seasons ingested). |`
   - After: `| CFBD college (passing/receiving/rushing) | per-year | ✅ **2017–2025** (app fetch window now anchor-tracked; data-store files are 2017–2024 until the data repo materializes 2025 — app fills 2025 via the CFBD live-API fallback meanwhile; no earlier seasons ingested). |`

4. **`docs/signal-registry.md` line 58** — signal-inventory CFBD row, Coverage column.
   - Change the coverage cell `**2017–2024**` → `**2017–2025** (anchor-tracked; data-store files lag at 2017–2024 until the data repo adds 2025)`. Leave the rest of the row (`Reconstructable via CFBD API …`, `pre-2017 not ingested → breakout-age unavailable …`, consumer column) unchanged.
   - Lines 91 and 97 say "2017+" / "2017+ (CFBD floor)" — already correct, **no change**.

5. **`README.md` (app) line 13** — integrations bullet.
   - Before: `- **College Football Data API (CFBD)** — bulk player stats 2017–2024; requires \`VITE_CFBD_API_KEY\` …`
   - After: `- **College Football Data API (CFBD)** — bulk player stats 2017–present (window tracks the current-season anchor); requires \`VITE_CFBD_API_KEY\` …`

**No change needed:**
- **`CLAUDE.md`** (app) — the cfbd nav row says "bulk player stats by year/category" (no year literal) and
  the "CFBD pivot" cross-repo bullet is about `statType` sets, not the year window. Adding the
  `collegeFetchYears` export does not change the file's documented responsibility. Leave as-is.
- **`docs/projection.md`** — the rookie path references the "2017+ CFBD floor" only; the window change
  does not alter projection math or any factor. No edit.
- **`docs/integrations.md` line 293** ("Years loaded: 2017–current (matches CFBD coverage)" — nflDraft
  section) is already consistent and becomes more accurate. No edit.

---

## Tests to add

**New co-located unit test: `src/api/cfbd.test.js`** (no existing cfbd test; pure helper → fast, no
mocks, no network, no timers). Import `collegeFetchYears` from `./cfbd`. Cases:

| Input | Expected output | Asserts |
|---|---|---|
| `collegeFetchYears(2025)` | `[2017,2018,…,2025]` (length 9, last 2025) | anchor at the current completed season includes 2025 |
| `collegeFetchYears(2026)` | `[2017,…,2026]` (length 10, last 2026) | window tracks the anchor forward (auto-advance) |
| `collegeFetchYears(2024)` | `[2017,…,2025]` (length 9, last 2025) | 2025 floor prevents regression below the 2026 class |
| `collegeFetchYears(undefined)` | `[2017,…,2025]` | missing anchor falls back to the floor |
| `collegeFetchYears(NaN)` | `[2017,…,2025]` | non-finite anchor falls back to the floor |
| `collegeFetchYears('2025')` (string) | `[2017,…,2025]` | non-number anchor falls back to the floor (`Number.isFinite` guard) |

Also assert, for at least one case, that the array is **contiguous, strictly increasing, starts at
2017, and has no duplicates** (e.g. `years[0] === 2017` and every `years[i+1] === years[i] + 1`).

**Optional (lower priority), not required for done:** an integration test of `loadCollegeStats(endYear)`
asserting the returned object's `receiving`/`rushing`/`passing` key sets equal
`collegeFetchYears(endYear)` — would require mocking `../utils/cache` (`getCacheRecord` →
`{ data: [<one valid CFBD row>], sourceLastModified: '2999-01-01T00:00:00Z' }`) and `./dataStore`
(`getManifestEntry` → `null`) to force a clean cache-hit return, plus `vi.useFakeTimers()` to skip the
`delay(400)` gaps. The pure-helper test above already covers the window logic, so this is supplementary
only.

**Unaffected contract tests (no edits):** `factorsSchema.test.js` (no factor keys change),
`statKeysContract.test.js` (no new stat keys), `advStatsViewOnly.test.js`, `scheduleViewOnly.test.js`.

---

## Cross-repo impact

**Yes — touches the CFBD served-file contract with `sleeper-dashboard-data`.** The app's data-store tier
reads `college/<category>/<year>.json`; the sibling repo currently materializes only 2017–2024. To keep
the served path complete (rather than relying on the app's live-API fallback for the newest year), the
data repo must:

1. **Materialize 2025** — run the existing per-year subcommand for all three categories:
   `node bin/update.mjs cfbd --year 2025` (writes `college/{receiving,rushing,passing}/2025.json` via
   `scripts/update-cfbd.mjs` and registers the manifest entries). Commit the three JSON files **and** the
   manifest update. CFBD ingest is a manual/ad-hoc invocation there — there is **no scheduled CFBD
   workflow** (only `smoke-test.yml` runs a `--dry-run`), so this will not happen automatically; it must
   be run deliberately, and re-run each year as new completed seasons land (to mirror the app's
   auto-advancing window).
2. **`README.md` (data repo) line 32** — update the served-coverage note:
   `passing/ — CFBD passing stats per player per season (2017–2024)` → `(2017–2025)` (and likewise the
   `receiving/`/`rushing/` lines if they carry the same literal). No data-repo `CLAUDE.md` change (it
   carries no CFBD year literal).

The app side does **not** edit the data repo (cross-repo discipline). The two move in lockstep on the
documented coverage; the app's live-API fallback (key required) bridges the gap if the app ships first.
No shape/schema change — `college/<category>/<year>.json` row shape (`playerId`/`statType`/`stat`) and
the `pivotStatRows` `statType` sets are untouched; this is purely an additional year of the existing
shape.

---

## Verification (done-definition)

Implementer (Sonnet) runs, per CLAUDE.md:
1. `npm test` — full suite green (incl. the new `src/api/cfbd.test.js`).
2. `npm run lint` — 0 problems.
3. `npm run build` — clean, no warnings.

Do **not** start the dev server / browser smoke — visual/data verification (the 2026 class actually
receiving college signals, e.g. Kaelon Black) is the user's manual step after the build is clean.

---

## Risk notes

- **Permanent additive cache preserved.** New `cfbd-players/2025/<category>` keys only; 2017–2024 keys
  untouched. No TTL change.
- **Pacing preserved.** `delay(400)` between years retained; one extra inter-year gap (negligible).
- **Overshoot is safe and self-healing** (traced above) — empty years are rejected by the data-store
  validator and re-attempted on the live tier next session; never permanently trapped.
- **No projection/rookie-path/factors change** — `collegeFetchYears` is a pure ingest helper; downstream
  matching and metrics are year-set-agnostic.
