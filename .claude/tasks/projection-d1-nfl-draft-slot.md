# Projection D1 — NFL draft slot in rookie projection

## Goal

Wire actual NFL draft capital (round + pick) into the rookie path of `computeNextSeasonProjection` as a new multiplicative factor. This is the first Thread D batch, so it also sets the pattern that future Thread D batches (nflverse snap counts, Vegas win totals, RAS, contracts) will copy: API module shape, matching utility, cache strategy, App.jsx loader effect. Vet path, dynastyScore, and per-league rookie-pick proxy are untouched.

## Files to create

- `src/api/nflDraft.js` — annual NFL draft-class loader with IndexedDB caching. Mirrors `src/api/cfbd.js` structure.
- `src/utils/nflDraftMatch.js` — `matchNflDraftToSleeper(draftPicks, playersMap)`. Name + college matching, suffix/alias-aware. Reuses `normalizeName` / `normalizeCollege` from `collegeMatch.js` via re-export.
- `src/__fixtures__/nfl-draft-2024-sample.json` — small hand-curated fixture (10–20 picks across all rounds + one duplicate-name case) used by unit tests.

## Files to modify

- `src/utils/seasonProjection.js` — `rookieProjection` gains a new parameter `nflDraftMatches` and computes `nflDraftMultiplier` + diagnostic factors. `computeNextSeasonProjection`'s signature gains a trailing optional argument and threads it through.
- `src/App.jsx` — new state `nflDraftMatches`, new loader effect (parallel to CFBD's), pass it to `computeNextSeasonProjection`.

## Files NOT to modify

`src/utils/dynastyScore.js`, `src/utils/careerComps.js`, `src/utils/collegeMetrics.js`, `src/utils/teamContext.js`, `src/utils/momentum.js`, `src/utils/projectionSignals.js`, `src/utils/regressionSignals.js`, `src/utils/compsIntegration.js`, `src/utils/efficiencyMetrics.js`, `src/utils/ktcHistory.js`, `src/utils/projectionSnapshot.js`, `src/api/cfbd.js`, `src/api/sleeper.js`, `src/api/sleeperStats.js`, `src/api/dataStore.js` (not yet — see §Source choice).

---

## Architectural decisions

### Source choice: nflverse direct via jsDelivr CDN

Three options were considered:

1. **nflverse via jsDelivr CDN** — `https://cdn.jsdelivr.net/gh/nflverse/nflverse-data@master/data/draft_picks/...`. Public GitHub releases, mirrored on jsDelivr, no API key, no CORS, gzipped, cacheable.
2. **Pro Football Reference HTML scrape** — stable structure but scraping is fragile, slower, and ties D1 to corsproxy.io. PFR is a fine *fallback validation* source but not a production fetch path.
3. **Commit to `sleeper-dashboard-data` repo** — matches the KTC snapshot pattern; CI fetches nflverse once a year and commits the JSON; app reads via `dataStore.js`.

**Decision: nflverse direct via jsDelivr.** Rationale:
- One-shot annual data, tiny payloads (~30 KB / year per round subset), no CORS proxy, no API key. The CFBD model fits this cleanly minus the API key.
- The data-store-repo route is cleaner architecturally and is the right *long-term* home (it lets the export bundle include draft data for backtests), but it requires CI scripting in a different repo. **Defer to a separate batch (e.g. "D1b: migrate nflverse draft to sleeper-dashboard-data")** — not D1.
- PFR scraping is explicitly rejected — too fragile for a foundational signal.

nflverse releases draft data as `draft_picks.csv` (one file containing every year). The app fetches the whole CSV once, parses it, and slices per year in-memory. This avoids the annual fetch loop that CFBD uses and is simpler.

**Source URL** (pin to a release tag for reproducibility):

```
https://cdn.jsdelivr.net/gh/nflverse/nflverse-data@master/data/draft_picks/draft_picks.csv
```

(If reliability becomes a concern, pin to a release tag like `@release-draft_picks-2025-04-29`; see Risks.)

**CSV columns used** (subset of nflverse's schema):

| Column | Used as |
|---|---|
| `season` | year |
| `round` | round |
| `pick` | overall pick |
| `team` | NFL team abbreviation |
| `pfr_player_name` (primary) / `cfb_player_name` (fallback) | display name for matching |
| `position` | position |
| `college` | college name for disambiguation |
| `age` | optional, captured into factors for transparency |

All other columns are dropped at parse time to keep the cached payload small.

### Year range: 2017–current

Rationale:
- Matches CFBD coverage (College Football Data API starts at 2017 for the dataset the app uses).
- Dynasty rosters are dominated by ≤ 8-year vets; anyone drafted before 2017 is a year-9+ vet who won't hit the rookie projection path anyway.
- nflverse's CSV is ~120 rows × 8 years = ~1,000 picks. Trivial.
- New years pick up automatically because the CSV contains everything; only the `currentSeason` cap changes per app run.

Implementation reads the CSV once, then for each year ≥ 2017 produces a `{ [year]: pickEntry[] }` object.

### Cache strategy: per-year IndexedDB keys with permanent TTL

Matches CFBD precedent. Key shape: `nfl-draft/<year>`. TTL `999999` minutes (permanent). The full-CSV fetch happens at most once per session; results are partitioned by year before caching so a future single-year refetch is possible without re-downloading the whole CSV.

```
nfl-draft/2017 → DraftPick[]
nfl-draft/2018 → DraftPick[]
...
nfl-draft/2024 → DraftPick[]
```

Plus one auxiliary key for the most-recent-year version stamp:

```
nfl-draft/csv-etag → { etag, fetchedAt }
```

This lets the loader skip the fetch if the CSV hasn't changed since the last load. (jsDelivr returns standard `Last-Modified` / `ETag` headers.)

### Failure handling: graceful degradation

When `nflDraftMatches` is `null`/missing for a player, the projection sets `nflDraftMultiplier = 1.0` and writes all NFL-draft diagnostic keys as `null` sentinels. The rookie projection still runs and returns a valid number. No throws, no console errors.

Three failure modes, all handled identically at the projection layer:

1. CSV fetch fails (offline / CDN down). App state `nflDraftMatches = null` → no match for anyone → neutral multiplier.
2. CSV parses but a specific rookie's name doesn't match any draft entry. → no match for that player → neutral.
3. Player is a verified UDFA — see UDFA section below.

---

## API module spec — `src/api/nflDraft.js`

```js
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

const NFLVERSE_DRAFT_URL =
  'https://cdn.jsdelivr.net/gh/nflverse/nflverse-data@master/data/draft_picks/draft_picks.csv'

const DRAFT_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

// Per-pick row, after parsing.
//   { year, round, pick, team, fullName, position, college, age }
```

### Exports

```js
/**
 * Loads NFL draft picks for DRAFT_YEARS. Returns:
 *   { [year]: DraftPick[] }
 *
 * Behaviour:
 *   1. For each year, try cache (`nfl-draft/<year>`) first.
 *   2. If any year is missing from cache, fetch the full CSV once, parse, and
 *      cache each year independently.
 *   3. On fetch failure, return whatever cached years exist (possibly an
 *      empty object).
 */
export async function loadNflDraftPicks() { ... }

/** Parses the nflverse CSV string into the per-year object. */
export function parseDraftCsv(csvText) { ... }
```

### `parseDraftCsv` details

- Simple `csvText.split('\n').map(splitCsvLine)` parser. nflverse CSVs are well-formed (no embedded commas in unquoted fields for the columns we use; quoted fields contain commas only in `season_type` style metadata we ignore). Defensive: handle `"..."`-quoted fields if encountered.
- Header row gives column index; fail-soft if any required column is missing (log once, return `{}`).
- Coerce `season`, `round`, `pick`, `age` to numbers; drop rows where coercion fails.
- Skip rows with `round` ∈ {NA, supplemental} — those don't fit the round table.

### `loadNflDraftPicks` flow

```
For each year in DRAFT_YEARS:
  try cache 'nfl-draft/<year>' → if hit, accumulate
If any year missing:
  fetch CSV (5s timeout) → parseDraftCsv → bucket by year
  For each missing year:
    setCacheWithMeta('nfl-draft/<year>', bucket[year], 999999, {})
On fetch error:
  log once, return cached-only object
Returns: { [year]: DraftPick[] }
```

No `dataStore.js` integration in D1 — the data-store-repo migration is the deferred follow-up.

---

## Matching utility spec — `src/utils/nflDraftMatch.js`

### Exports

```js
import { normalizeName, normalizeCollege } from './collegeMatch'

/**
 * @param {Object} draftPicksByYear  { [year]: DraftPick[] } from loadNflDraftPicks
 * @param {Object} playersMap        Sleeper playerMap { [player_id]: SleeperPlayer }
 * @returns {{ [player_id]: NflDraftMatch }}
 *
 * NflDraftMatch shape:
 *   { year, round, pick, team, college, position, ageAtDraft }
 *
 * Only the most recent matching draft entry per Sleeper player is kept
 * (in the rare case of a duplicate-name re-entry, which essentially never
 * happens for actively-rostered dynasty players but is handled defensively).
 */
export function matchNflDraftToSleeper(draftPicksByYear, playersMap) { ... }
```

### Algorithm

1. Build a name lookup from Sleeper `playersMap`, QB/RB/WR/TE only:

   ```
   nameMap: normalizeName(full_name) → [{ player_id, college, position, years_exp }]
   ```

2. For each draft year (ascending), for each draft pick:
   - Compute `nameKey = normalizeName(pick.fullName)` and `pickCollegeKey = normalizeCollege(pick.college)`.
   - Look up candidates in `nameMap[nameKey]`. If none, skip.
   - If exactly one candidate, match it (subject to position cross-check below).
   - If multiple candidates, disambiguate by college (exact match, then word-overlap) — same algorithm as `collegeMatch.js` `resolveCandidate`. Then by position match. If still ambiguous, **skip** (logged once).
   - **Position cross-check**: skip the match if `pick.position` and `candidate.position` are both present and incompatible. Tolerate `'FB'→'RB'`, `'HB'→'RB'`, and `pick.position` blanks. Hard-skip on e.g. `pick.position === 'OT'` for any skill candidate (defensive: nflverse occasionally has linemen labelled with skill names).
   - On match, write `result[player_id] = { year, round, pick, team, college: pick.college, position: pick.position, ageAtDraft: pick.age ?? null }`.

3. **Year recency rule**: when iterating ascending, a later year *overwrites* an earlier match for the same `player_id`. In practice this never fires for real rookies; the rule simply ensures deterministic behaviour if a future fixture has a re-entry.

### Disambiguation rules (explicit)

| Case | Action |
|---|---|
| 1 candidate, position matches | match |
| 1 candidate, position incompatible | skip (log once per player_id) |
| 2+ candidates, exact normalized-college match | use exact |
| 2+ candidates, word-overlap college match | use overlap |
| 2+ candidates, no college disambiguation possible | skip (log once) |
| Pick name doesn't appear in `nameMap` | skip silently — common for late-round picks who never made an NFL roster |

### UDFA handling: D1 implements "no data" case only

The draft CSV by definition does not include UDFAs. From the projection's perspective, a UDFA looks identical to a draftee who failed to match: no entry in `nflDraftMatches`.

**Decision: D1 treats both cases as `nflDraftMultiplier = 1.0` (neutral) with `nflDraftMatchSource = 'unmatched'`.** A "verified UDFA" multiplier (×0.55 below) is *spec'd* in the multiplier table but **not implemented in D1**.

Rationale:
- Distinguishing "true UDFA" from "match miss" requires a separate UDFA list — Sleeper carries this in `metadata.rookie_year` and `years_exp === 0 && no draft entry`, but that conflates UDFAs with match misses.
- A wrong UDFA classification (e.g. flagging a draft-class player whose name didn't match as a UDFA) would *demote* a player who should be neutral. Asymmetric downside.
- Deferring lets D1 ship the high-leverage drafted-rookie signal first. A future "D1.5 UDFA" batch can introduce a verified-UDFA list.

`nflDraftMatchSource` field captures the distinction for forensics:
- `'matched'` — found in draft CSV, has round/pick.
- `'unmatched'` — no draft entry. Could be UDFA or could be a match miss. Multiplier 1.0.
- `'unsupported-position'` — non-skill rookie (defensive sentinel, normally won't fire because the projection already filters to skill positions).

---

## Projection wiring

### Multiplier table

```
Round 1, picks 1–3    : ×1.30   (top-3 capital — generational dynasty asset)
Round 1, picks 4–8    : ×1.18
Round 1, picks 9–15   : ×1.10
Round 1, picks 16–32  : ×1.02
Round 2               : ×0.92
Round 3               : ×0.82
Round 4               : ×0.74
Round 5               : ×0.68
Round 6               : ×0.62
Round 7               : ×0.58
Unmatched / UDFA      : ×1.00   (neutral; see UDFA section)
(Future) verified UDFA: ×0.55   (NOT implemented in D1)
```

**Justification**:
- Top-3 ×1.30 anchors to "first-overall NFL talent" expectation; matches the most aggressive `breakoutAgeFactor` (1.05) × `collegeBase` (1.20) stack tier from B1b's college multiplier system in scale.
- R1 mid-tier ×1.10 is roughly the dynastic equivalent of "high KTC percentile" — comparable in magnitude to `ktcMult` at the 60th-pct point (`0.70 + 0.60 × 0.60 = 1.06`).
- R2 ×0.92 reflects that R2 dynasty rookies hit at materially lower rates than R1.
- Late-round monotonic decline from R3 to R7 is gentle (0.82 → 0.58); these picks rarely break out, but the projection should not zero them out. Late-round hits exist and the model should leave room.
- Splits between R4–R7 are finer than the prompt's suggestion (×0.72 / ×0.65) to better reflect the steep dropoff. Late-R7 picks have measurably worse outcomes than R4 picks; collapsing them loses signal.

### Pipeline location in `rookieProjection`

Current rookie product:

```
projectedPPG = baseline × ageMult × ktcMult × collegeContribution
```

Post-D1:

```
projectedPPG = baseline × ageMult × ktcMult × collegeContribution × nflDraftMultiplier
```

Then clamped to `[0, 40]` as today.

Exact insertion point in `rookieProjection`:

```js
// (existing) collegeContribution block computes collegeContribution
// (existing) breakoutAgeFactor block

// ── NEW: NFL draft slot (D1) ────────────────────────────────────────────
const draftMatch = nflDraftMatches?.[playerId] ?? null
const { nflDraftMultiplier, nflDraftRound, nflDraftPick,
        nflDraftTier, nflDraftMatchSource } = resolveNflDraftFactor(draftMatch, position)

// updated product:
const projectedPPG = clamp(
  baseline * ageMult * ktcMult * collegeContribution * nflDraftMultiplier,
  0, 40
)
```

Where `resolveNflDraftFactor` is a local helper (kept inside `seasonProjection.js`, not exported; the multiplier table is a private constant):

```js
function resolveNflDraftFactor(draftMatch, position) {
  if (!draftMatch) {
    return {
      nflDraftMultiplier: 1.0,
      nflDraftRound: null, nflDraftPick: null,
      nflDraftTier: null, nflDraftMatchSource: 'unmatched',
    }
  }
  const { round, pick } = draftMatch
  let mult, tier
  if (round === 1 && pick <= 3)      { mult = 1.30; tier = 'top-3' }
  else if (round === 1 && pick <= 8) { mult = 1.18; tier = 'top-8' }
  else if (round === 1 && pick <= 15){ mult = 1.10; tier = 'r1-mid' }
  else if (round === 1)              { mult = 1.02; tier = 'r1-late' }
  else if (round === 2)              { mult = 0.92; tier = 'r2' }
  else if (round === 3)              { mult = 0.82; tier = 'r3' }
  else if (round === 4)              { mult = 0.74; tier = 'r4' }
  else if (round === 5)              { mult = 0.68; tier = 'r5' }
  else if (round === 6)              { mult = 0.62; tier = 'r6' }
  else                                { mult = 0.58; tier = 'r7' }
  return {
    nflDraftMultiplier: mult,
    nflDraftRound: round, nflDraftPick: pick,
    nflDraftTier: tier, nflDraftMatchSource: 'matched',
  }
}
```

### Cumulative-effect cap: NEW clamp on the rookie path

Without a cap, the rookie product's natural range becomes wide:
- Max: `13 (QB baseline) × 1.15 (ageMult) × 1.30 (ktcMult) × 1.25 (collegeContribution) × 1.30 (nflDraftMultiplier) = 31.6 PPG` — already saturating the existing `[0, 40]` clamp at the top.
- Min: `5 (TE baseline) × 0.82 × 0.70 × 0.75 × 0.58 = 1.25 PPG`.

The pre-D1 envelope was:
- Max: `13 × 1.15 × 1.30 × 1.25 = 24.3 PPG`
- Min: `5 × 0.82 × 0.70 × 0.75 = 2.15 PPG`

D1 widens the envelope by ~30% on each side. Without a cap, a stacked-positive rookie (top-3 pick + high KTC + dominant college) could land at projected ~32 PPG — believable for a Bijan-Robinson-level rookie. Without that ceiling, the model could project unrealistic figures for noisy stacks.

**Decision: introduce a `rookieMultiplierEnvelope` clamp of `[0.45, 1.85]` applied to the product of the four non-baseline multipliers** (`ageMult × ktcMult × collegeContribution × nflDraftMultiplier`).

Justification:
- Theoretical max product: `1.15 × 1.30 × 1.25 × 1.30 = 2.43`. Clamp at 1.85 means the most-stacked positive case is capped ~24% below the theoretical max. For QB baseline 13, this caps at `13 × 1.85 = 24.05 PPG` — a believable elite-rookie projection.
- Theoretical min product: `0.82 × 0.70 × 0.75 × 0.58 = 0.249`. Clamp at 0.45 prevents the pile-on negative case from collapsing to ~0.6 PPG — a reasonable floor for any drafted skill player.
- Mirrors the vet-path `combinedNewFactor` clamp pattern from B1a/B1b/B2/C1 (a genuine cap that binds for a tail, not a never-bind guardrail).

The clamped product is captured in `factors` as `rookieMultiplierProduct` (raw) and the clamp endpoints are not separately reported — if the raw product exceeds the clamp, the post-clamp value visibly differs in `factors`, which is the diagnostic signal.

Implementation:

```js
const rookieMultiplierProductRaw =
  ageMult * ktcMult * collegeContribution * nflDraftMultiplier
const rookieMultiplierProduct = clamp(rookieMultiplierProductRaw, 0.45, 1.85)
const projectedPPG = clamp(baseline * rookieMultiplierProduct, 0, 40)
```

### `factors` keys added (D1)

Added to the rookie path's `factors` object. None are removed; B1a–C3 keys all stay.

| Key | Type | Meaning |
|---|---|---|
| `nflDraftMultiplier` | number ∈ {0.58, 0.62, 0.68, 0.74, 0.82, 0.92, 1.00, 1.02, 1.10, 1.18, 1.30} | The multiplier itself |
| `nflDraftRound` | number\|null | 1–7 or null when unmatched |
| `nflDraftPick` | number\|null | overall pick or null |
| `nflDraftTier` | string\|null | 'top-3' / 'top-8' / 'r1-mid' / 'r1-late' / 'r2' / 'r3' / 'r4' / 'r5' / 'r6' / 'r7' / null |
| `nflDraftMatchSource` | string | 'matched' / 'unmatched' / 'unsupported-position' |
| `rookieMultiplierProduct` | number | post-clamp `ageMult × ktcMult × collegeContribution × nflDraftMultiplier` (rounded to 3 dp) |

Vet path's `factors` is unchanged — none of these keys appear there.

### `adjustmentSummary` lines added (D1)

```js
if (nflDraftTier === 'top-3')       adjustmentSummary.push('Top-3 NFL draft pick ↑↑')
if (nflDraftTier === 'top-8' ||
    nflDraftTier === 'r1-mid')      adjustmentSummary.push('Early Round 1 NFL pick ↑')
if (nflDraftTier === 'r1-late' ||
    nflDraftTier === 'r2')          adjustmentSummary.push('Day 2 NFL capital ↑')  // r1-late slightly positive, r2 slightly negative; group as "Day 2 capital noted"
if (nflDraftTier === 'r6' ||
    nflDraftTier === 'r7')          adjustmentSummary.push('Late-round NFL pick ↓')
```

Refine the wording on review: the r1-late + r2 grouping is borderline. Alternative: split into two lines (`'Late R1 NFL pick'` neutral-up, `'R2 NFL pick'` neutral-down). The plan picks the grouped form for brevity; the implementer may split if it reads better in the actual UI.

No summary line for `unmatched` — silence is correct (we don't know if it's a UDFA or a match miss).

### `computeNextSeasonProjection` signature change

Current:

```js
computeNextSeasonProjection(
  playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, historicalShares, depthMap,
  teamContext, scoringSettings, ktcMap, collegeStats,
  currentSeason, qbQualityByTeam = null, ktcHistory = null
)
```

Post-D1 — **append at the end** (preserves all existing call sites' positional arguments):

```js
computeNextSeasonProjection(
  playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, historicalShares, depthMap,
  teamContext, scoringSettings, ktcMap, collegeStats,
  currentSeason, qbQualityByTeam = null, ktcHistory = null,
  nflDraftMatches = null               // NEW (D1)
)
```

Passed through to `rookieProjection` as a new positional arg:

```js
function rookieProjection(player, playerId, yearsExp, ktcMap, playersMap,
                          collegeStats, positionPeakPPG, nflDraftMatches) { ... }
```

The vet path ignores `nflDraftMatches` entirely. The call site for `rookieProjection` inside `computeNextSeasonProjection` passes the new argument.

---

## App.jsx wiring

### State additions

```js
const [nflDraftPicks, setNflDraftPicks] = useState(null)        // { [year]: DraftPick[] } | null
const [nflDraftMatches, setNflDraftMatches] = useState(null)    // { [player_id]: NflDraftMatch } | null
```

### Loader effect

Mirrors the existing `loadCollegeStats` effect (around line 1211). Place immediately after it for grouping. Runs once `leagueData.playerMap` is available — does **not** depend on `careerStats` (independent fetch path, mirrors KTC).

```js
useEffect(() => {
  if (!leagueData?.playerMap) return
  let cancelled = false
  loadNflDraftPicks()
    .then(data => {
      if (cancelled) return
      setNflDraftPicks(data)
      const matched = matchNflDraftToSleeper(data, leagueData.playerMap)
      if (!cancelled) setNflDraftMatches(matched)
      console.log('[nflDraft] years loaded:', Object.keys(data).length,
                  '— matched players:', Object.keys(matched).length)
    })
    .catch(err => console.warn('[nflDraft] Load error:', err.message))
  return () => { cancelled = true }
}, [leagueData])
```

### Projection call site

`seasonProjections` `useMemo` adds `nflDraftMatches` to:
1. its dependency array;
2. the `computeNextSeasonProjection` argument list (trailing position).

```js
const proj = computeNextSeasonProjection(
  row.player_id, leagueData.playerMap, careerStats, empiricalCurves,
  positionPeakPPG, historicalShares, depthMap, teamContext,
  leagueData.scoringSettings, ktcMap, collegeStats, currentSeason,
  qbQualityByTeam, ktcHistory, nflDraftMatches,
)
```

Dependency array gains `nflDraftMatches` (last position).

### Import additions at top of App.jsx

```js
import { loadNflDraftPicks } from './api/nflDraft'
import { matchNflDraftToSleeper } from './utils/nflDraftMatch'
```

### Snapshot side-effect note

`projectionSnapshot.js`'s `buildProjectionSnapshot` reads `projection` verbatim (no field whitelist), so the new `factors` keys ride along automatically into daily snapshots with no code change. This is the intended behaviour per the Thread A design.

---

## Cross-batch interaction analysis

### vs `ktcMult`

KTC market consensus *partly incorporates* NFL draft slot — a top-3 pick generally has a top-5 rookie KTC value the day after the draft. But KTC also bakes in college performance, athletic testing, NFL team / situation, and consensus dynasty-analyst takes. The overlap with draft slot is partial, not complete.

**Worked example** — top-3 RB with high KTC and dominant college:
- baseline (RB) = 9
- ageMult (age 22, year-1) = 1.05
- ktcMult (95th pct → 0.70 + 0.60×0.95 = 1.27)
- collegeContribution (30+ peakDom, improving trend, early breakout) ≈ 1.25
- nflDraftMultiplier (R1.1) = 1.30
- Raw product: 1.05 × 1.27 × 1.25 × 1.30 = 2.166
- Post-clamp [0.45, 1.85]: **1.85** (clamp binds)
- projectedPPG: 9 × 1.85 = **16.65** (rounded to 16.7)

Pre-D1 same player: 9 × 1.05 × 1.27 × 1.25 = **15.0**

D1 adds ~+11% to the top-end case. KTC + college already saturate most of the upside; draft capital adds a measurable but bounded extra signal. This is the intended overlap behaviour — the clamp prevents triple-counting from running away.

### vs `collegeContribution`

Draft slot is strongly correlated with college production but not identical (combine performance, age, NFL team needs, off-field concerns all influence draft slot independently of college stats).

**Worked example** — top-15 WR with mediocre college peakDominator (e.g., 19):
- collegeContribution ≈ 0.95 (peakDominator < 20 → collegeBase 0.92; modest tilt)
- nflDraftMultiplier (R1.10) = 1.10
- Combined contribution from these two: 0.95 × 1.10 = **1.045**

This is the "NFL teams saw something the college stats missed" case (small-school, combine standout, etc.). The model now reflects that signal mildly positive instead of mildly negative. Good.

Conversely: a R5 pick with a dominant college peakDom of 35 gets `1.20 × 0.68 = 0.816` — the model correctly tempers the college signal when NFL teams demonstrably valued the player less.

### vs `breakoutAgeFactor` (B1b)

Both reflect "young high-ceiling rookie" but operate on different inputs (college age at breakout vs. NFL draft slot). The overlap is real but partial — a player can have an early college breakout and still slip in the NFL draft due to size, athleticism, or scheme concerns.

**Worked example** — early breakout + early R1 pick: `breakoutAgeFactor 1.05 × nflDraftMultiplier 1.10 = 1.155`. About +15% combined uplift. With the 1.85 clamp, this stacks with KTC and college up to but not past the cap. Bounded.

### vs `nflDraftMatchSource` / unmatched

Unmatched rookies (mostly UDFAs in practice) get `nflDraftMultiplier = 1.0`. They retain their KTC and college signals. This is correct: a UDFA in the league's roster pool was deemed dynasty-worthy by *someone* (the manager who drafted them in their rookie draft), and KTC reflects that. Demoting all unmatched rookies via UDFA penalty without verifying the UDFA status would systematically punish match misses.

### vs Dynasty score's per-league rookie pick proxy

`dynastyScore.js` (untouched) uses `leagueData.rookieDraftPicks[playerId]` (per-league pick) for its `draftMultiplier` in prospect scoring. **D1 introduces a divergence**: projection uses NFL slot, dynasty uses per-league. This is the expected end-state per Thread B precedent. Future task can unify if desired. Document the divergence in README's "Dynasty score vs. projection" subsection (see README updates).

---

## Stacking analysis — post-D1 rookie envelope

| Case | ageMult | ktcMult | collegeContrib | nflDraftMult | Raw product | Clamped | Baseline (QB=13) | ProjectedPPG |
|---|---|---|---|---|---|---|---|---|
| Stacked positive (top-3) | 1.15 | 1.30 | 1.25 | 1.30 | 2.43 | **1.85** | 13 | **24.05** |
| Strong R1 mid | 1.05 | 1.15 | 1.15 | 1.10 | 1.527 | 1.527 | 13 | 19.85 |
| Median R2 | 1.00 | 1.00 | 1.00 | 0.92 | 0.920 | 0.920 | 13 | 11.96 |
| Late R6 | 0.95 | 0.85 | 0.92 | 0.62 | 0.461 | 0.461 | 13 | 5.99 |
| Stacked negative R7 | 0.82 | 0.70 | 0.75 | 0.58 | 0.249 | **0.45** | 13 | 5.85 |
| Unmatched UDFA-equivalent | 0.95 | 0.95 | 1.00 | 1.00 | 0.9025 | 0.9025 | 13 | 11.73 |

The clamp binds at both ends for the most-stacked cases (~1–3% of rookies in expected practice) and is inactive in the middle 95%. This matches the design intent — a real cap that binds for a tail.

---

## Step sequence for implementation

Each step ends with `npm test` and `npm run build` passing before the next starts.

1. **API module** — create `src/api/nflDraft.js` with `parseDraftCsv` and `loadNflDraftPicks`. No App.jsx changes yet. Run `npm run build` to confirm it imports cleanly.
2. **API tests** — add `src/api/nflDraft.test.js` (parse + cache-hit/miss flow with `vi.mock` of `../utils/cache`).
3. **Matching utility** — create `src/utils/nflDraftMatch.js`. Reuse `normalizeName` / `normalizeCollege` from `collegeMatch.js` via import.
4. **Matching tests** — `src/utils/nflDraftMatch.test.js` using the small hand-curated fixture `src/__fixtures__/nfl-draft-2024-sample.json`.
5. **Projection wiring** — modify `src/utils/seasonProjection.js`:
   - Append `nflDraftMatches = null` to `computeNextSeasonProjection` signature.
   - Add `nflDraftMatches` arg to `rookieProjection`.
   - Add the `resolveNflDraftFactor` helper, the clamp on `rookieMultiplierProduct`, and the new `factors` keys + `adjustmentSummary` lines.
   - Vet path UNTOUCHED.
6. **Projection tests** — extend `src/utils/seasonProjection.test.js` with rookie integration cases using `makeRookie` (see Tests section). Also extend `src/__tests__/factorsSchema.test.js` `ROOKIE_FACTORS_KEYS` set with the 6 new D1 keys.
7. **App.jsx wiring** — import, state, effect, thread `nflDraftMatches` into `computeNextSeasonProjection`.
8. **Manual smoke test** — load the app, console-check `[nflDraft]` log lines, find the top rookie in the verification log, confirm `factors.nflDraftMultiplier` and friends are populated.
9. **README updates** — apply mechanically per §README updates.

---

## Edge cases

| Case | Behaviour |
|---|---|
| CSV fetch fails (network down) | `loadNflDraftPicks` returns whatever's in cache (possibly `{}`). `matchNflDraftToSleeper({}, playersMap)` returns `{}`. Every rookie's `nflDraftMatchSource: 'unmatched'`, multiplier 1.0. |
| CSV parses but malformed row | Skip the row, don't throw. Log once. |
| Player not in CSV (UDFA or match miss) | `nflDraftMatchSource: 'unmatched'`, multiplier 1.0. No `adjustmentSummary` line. |
| Player has draft entry but `position` mismatch ('OT' for a WR Sleeper entry) | Skip the match. `nflDraftMatchSource: 'unmatched'`. Logged once. |
| `pick.age` missing in CSV | `ageAtDraft: null`. Doesn't affect multiplier (we use round/pick). |
| Year-4 player routed to rookie path (`years_exp === 3`, no qualifying seasons) | Their draft entry is from 4 years ago; it still matches by name+college. Multiplier applies. Verify in integration test 4 below. |
| Year-N rookie's draft year is more recent than `currentSeason - 8` cutoff | All years 2017–current are loaded, so this is not a real edge case. |
| Two Sleeper players with same name+college (rare; usually a generational name) | Skip both. Log once per player. |
| `playersMap` is null | `matchNflDraftToSleeper` returns `{}`. |
| `draftPicksByYear` is null/empty | Returns `{}`. |
| `nflDraftMatches` is `null` at projection time (loader still pending) | `rookieProjection` receives `null`, `?.[playerId]` returns `undefined`, `resolveNflDraftFactor(null)` returns the unmatched defaults. Projection runs fine. |
| Future year `currentSeason = 2027` and CSV only has through 2024 (offseason gap) | Newly drafted rookies for 2025–2027 don't match. They get neutral multiplier. App still works. Refresh procedure documented in README. |
| Vet path is invoked | `nflDraftMatches` is unused. No new `factors` keys appear. Vet schema contract test unchanged. |

---

## README updates

### Section: "Tech stack" (line 6)

No change required — Vite + React + Tailwind unchanged.

### Section: "Running locally" (line 15)

No change — no new env var required (nflverse needs no API key).

### Section: "Project structure" (line 31)

Add to the `src/api/` table:

```
| `nflDraft.js` | nflverse draft-picks CSV loader; per-year IndexedDB cache; permanent TTL |
```

Add to the `src/utils/` table:

```
| `nflDraftMatch.js` | Name+college matching from nflverse draft picks to Sleeper player IDs; reuses normalisation helpers from `collegeMatch.js` |
```

### Section: "API layer" (line 948)

Add a new subsection at the end:

```markdown
### nflverse draft picks (`src/api/nflDraft.js`)

- Source: `https://cdn.jsdelivr.net/gh/nflverse/nflverse-data@master/data/draft_picks/draft_picks.csv`
- No API key, no auth, gzipped, CDN-cached.
- Years loaded: 2017–current (matches CFBD coverage). Older draft classes are exclusively year-9+ vets who don't hit the rookie projection path.
- Cache: `nfl-draft/<year>` per year, permanent TTL.
- Failure mode: returns whatever's in cache (possibly empty). Projection degrades gracefully — `nflDraftMultiplier = 1.0` for every player when data unavailable.
- Refresh: change the source URL's `@master` to a pinned release tag when nflverse cuts a new release; or clear the `nfl-draft/*` cache keys to force a refetch.
```

### Section: "Next-season projections (`src/utils/seasonProjection.js`)" (line 652)

Find the rookie-path description and add (after the `collegeContribution` and `breakoutAgeFactor` description):

```markdown
**NFL draft slot (D1).** Actual NFL draft capital provides a league-independent rookie signal. Multiplier table:

| Tier            | Multiplier |
|-----------------|-----------|
| R1 picks 1–3    | ×1.30 |
| R1 picks 4–8    | ×1.18 |
| R1 picks 9–15   | ×1.10 |
| R1 picks 16–32  | ×1.02 |
| R2              | ×0.92 |
| R3              | ×0.82 |
| R4              | ×0.74 |
| R5              | ×0.68 |
| R6              | ×0.62 |
| R7              | ×0.58 |
| Unmatched (incl. UDFA) | ×1.00 |

The product `ageMult × ktcMult × collegeContribution × nflDraftMultiplier` is clamped to `[0.45, 1.85]` (`rookieMultiplierProduct`). This cap binds at the extremes (~top 1–3% stacked positive and bottom 1–3% stacked negative) and is inactive in the middle 95% of rookies.

UDFAs and match misses are both treated as unmatched (×1.00). Distinguishing them requires a verified-UDFA list, deferred to a future batch.
```

### Section: "Dynasty scoring (`src/utils/dynastyScore.js`)" (line 525)

Append a paragraph at the end of the section:

```markdown
**Note (post-D1):** Dynasty score still uses the per-league rookie-pick proxy (`leagueData.rookieDraftPicks`) for prospect scoring; the next-season projection (`src/utils/seasonProjection.js`) uses actual NFL draft slot instead. This is intentional — Thread B / C / D batches do not modify `dynastyScore.js`. A future batch may unify if needed.
```

### Section: "Testing" (added in slice-3 / test-infra-setup)

If the slice-3 plan has shipped its Testing section already, add a sub-bullet under "Scope":

```markdown
- D1 NFL draft slot: `src/api/nflDraft.test.js`, `src/utils/nflDraftMatch.test.js`, rookie integration cases in `src/utils/seasonProjection.test.js`.
```

If the Testing section is not yet present, the test-infra-setup batch's section already covers the structure and no D1-specific text is required.

---

## Tests to add

### `src/api/nflDraft.test.js`

`parseDraftCsv`:
1. **Happy path** — small CSV string with header + 3 rows across 2 years. Assert returned `{ 2023: [...], 2024: [...] }` shape, correct types (round/pick/age as numbers, year as number).
2. **Missing required column** — header missing `round`. Assert returns `{}` and logs warning.
3. **Bad row coercion** — row with `round = "NA"`. Assert row skipped, other rows preserved.
4. **Empty CSV** → `{}`.
5. **Quoted fields with commas** — `"Smith, Jr."` style names. Parser handles correctly.
6. **`supplemental` round** — row with `round = "supplemental"` skipped.

`loadNflDraftPicks` (with `vi.mock('../utils/cache')` for `getCacheRecord`/`setCacheWithMeta` and `vi.spyOn(global, 'fetch')`):
7. **All years cached** — getCacheRecord returns hits for every year. `fetch` is never called. Returns assembled `{ [year]: ... }`.
8. **Cache miss + fetch success** — cache empty, fetch returns CSV. Assert `setCacheWithMeta` called once per year. Returns full structure.
9. **Partial cache + fetch success** — half years cached, other half missing. Single fetch fills the missing.
10. **Fetch failure with cache** — fetch rejects, but some years cached. Returns cached-only.
11. **Fetch failure with no cache** — fetch rejects, no cache. Returns `{}`.

### `src/utils/nflDraftMatch.test.js`

Fixture: `src/__fixtures__/nfl-draft-2024-sample.json`. Shape:

```json
{
  "2024": [
    { "year": 2024, "round": 1, "pick": 4, "team": "ARI",  "fullName": "Marvin Harrison Jr.", "position": "WR", "college": "Ohio State", "age": 21 },
    { "year": 2024, "round": 1, "pick": 8, "team": "ATL",  "fullName": "Michael Penix",       "position": "QB", "college": "Washington", "age": 23 },
    { "year": 2024, "round": 7, "pick": 232, "team": "LAR","fullName": "Joe Smith",            "position": "RB", "college": "Some State", "age": 23 },
    { "year": 2024, "round": 2, "pick": 33, "team": "CAR", "fullName": "Joe Smith",            "position": "WR", "college": "Other Tech", "age": 22 }
  ]
}
```

Tests:
1. **Single-candidate happy path** — playersMap has Marvin Harrison Jr. (Ohio State, WR). Match returns `{ year: 2024, round: 1, pick: 4, tier-info, ... }`.
2. **Suffix normalisation** — Sleeper's `full_name` is "Marvin Harrison" (no suffix). Match still succeeds because `normalizeName` strips suffixes.
3. **Duplicate-name disambiguation** — two "Joe Smith" picks (different colleges). Sleeper has one "Joe Smith" with college "Some State" → matched to R7 entry, not R2.
4. **Duplicate-name unresolvable** — Sleeper "Joe Smith" with college "" (empty). Both picks remain candidates → no match recorded, logged once.
5. **Position cross-check** — draft entry says position `"OT"` but Sleeper has WR by same name → no match (skipped).
6. **No match** — pick name not in Sleeper map. Returns `{}` for that pick (silent).
7. **Position normalisation** — pick `"HB"` resolves to RB candidate.
8. **Empty inputs** — `matchNflDraftToSleeper({}, {})` → `{}`. `(null, null)` → `{}`.
9. **Year recency** — fixture extended with the same player in 2023 and 2024 entries (synthetic). Later year wins.
10. **Skill-only filter** — playersMap includes a kicker with the same name → never matched.

### `src/utils/seasonProjection.test.js` — rookie integration extensions

Use the `makeRookie` factory from `src/__fixtures__/factories.js`. Extend it (if not already present) to accept `nflDraftMatches` in overrides and to append it as the 15th argument.

1. **Top-3 rookie** — `makeRookie({ player: { age: 21, years_exp: 0 }, nflDraftMatches: { P1: { year: 2024, round: 1, pick: 1 } } })`. Assert `factors.nflDraftMultiplier === 1.30`, `factors.nflDraftTier === 'top-3'`, `factors.nflDraftRound === 1`, `factors.nflDraftPick === 1`, `factors.nflDraftMatchSource === 'matched'`. Assert `adjustmentSummary` includes 'Top-3 NFL draft pick ↑↑'.
2. **Unmatched rookie** — `makeRookie({ nflDraftMatches: {} })`. Assert `factors.nflDraftMultiplier === 1.0`, `nflDraftTier === null`, `nflDraftMatchSource === 'unmatched'`. No NFL-draft `adjustmentSummary` line.
3. **`nflDraftMatches` null at projection time** — `makeRookie({ nflDraftMatches: null })`. Same neutral defaults as case 2.
4. **Year-4 rookie-path hit** — `makeRookie({ player: { years_exp: 3, age: 25 }, careerStats: {}, nflDraftMatches: { P1: { year: 2021, round: 5, pick: 150 } } })`. Routes to rookie path (no qualifying seasons). Assert `nflDraftMultiplier === 0.68`, `nflDraftTier === 'r5'`. Confirms the multiplier still applies to year-N rookie-path hits.
5. **Clamp binds from above** — `makeRookie` with `player.age = 21` (ageMult 1.15), KTC pct 99 (ktcMult ≈ 1.29), collegeStats with peakDom 32 + improving trend + early breakout (collegeContribution ≈ 1.25), `nflDraftMatches` top-3 (1.30). Raw product 1.15 × 1.29 × 1.25 × 1.30 = 2.41. Assert `factors.rookieMultiplierProduct === 1.85` (clamp binds). Assert `projectedPPG` ≤ baseline × 1.85.
6. **Clamp binds from below** — older rookie (ageMult 0.82), low KTC (ktcMult 0.70), weak college (collegeContribution 0.75), R7 (nflDraftMultiplier 0.58). Raw product 0.249. Assert `factors.rookieMultiplierProduct === 0.45`.
7. **Mid-pack (no clamp)** — average everything. Raw product ≈ 1.0. Assert `factors.rookieMultiplierProduct === rookieMultiplierProductRaw` (clamp inactive); assert it's not 1.85 and not 0.45.
8. **Vet path unaffected** — `makeVet({ nflDraftMatches: { 'P1': { round: 1, pick: 1 } } })`. Result has the same vet `factors` keys as before. None of the D1 keys appear in vet `factors`. (This is also covered by the schema contract test, but assert here explicitly as a localised guard.)
9. **`factors` rookie schema extension** — assert the rookie result has exactly the keys in the updated `ROOKIE_FACTORS_KEYS` set (42 keys after D1 = 23 pre-D1 + 13 KTC + 6 NFL-draft).

### `src/__tests__/factorsSchema.test.js` — update

Update `ROOKIE_FACTORS_KEYS` to add the 6 new D1 keys:

```js
const ROOKIE_FACTORS_KEYS = new Set([
  // ... existing 23 keys
  // ... existing 13 ktcHist* keys
  // NEW (D1):
  'nflDraftMultiplier', 'nflDraftRound', 'nflDraftPick',
  'nflDraftTier', 'nflDraftMatchSource', 'rookieMultiplierProduct',
])
```

Vet set is **unchanged**. Confirm this in a comment in the test file so future maintainers don't mistakenly add the D1 keys to the vet set.

---

## Open questions

1. **nflverse URL pin** — pin to `@master` for always-current data, or pin to a dated release tag (`@release-draft_picks-2025-04-29` or whatever the latest is) for reproducibility? Recommendation: `@master`. Drift risk is low because the loader's column-defensive parsing tolerates added columns; missing-column behaviour is graceful. Confirm OK to pin to master.
2. **R7 multiplier of 0.58** — is the late-R7 / R6 split (0.62 / 0.58) too fine? The expected backtest effect is small. Alternative: collapse R6+R7 to a single ×0.60. Recommendation: keep the finer split — preserves signal until backtesting says otherwise.
3. **`rookieMultiplierProduct` clamp endpoints `[0.45, 1.85]`** — picked from the stacking analysis. If backtesting later shows the cap binds too often (or too rarely), tighten. Confirm the chosen endpoints look right.
4. **UDFA penalty deferral** — D1 treats verified UDFA as unmatched (×1.00). Confirm OK to defer the ×0.55 UDFA multiplier to a future batch with a verified-UDFA list.
5. **`adjustmentSummary` grouping for r1-late + r2** — should the line group these ("Day 2 NFL capital ↑") or split into per-tier lines? Recommendation: group for brevity; implementer may split during implementation if it reads better.
6. **Data-store-repo migration** — D1 fetches nflverse directly. The cleaner long-term home is `sleeper-dashboard-data`. Confirm OK to defer this to "D1b" follow-up batch.
7. **Sleeper's `years_exp` reliability** — rookies show `years_exp === 0` on Sleeper before the season, but during the offseason transition Sleeper's data sometimes lags. The rookie-path gate (`years_exp <= 1 || qualifying.length === 0`) is robust to lag in practice. Confirm no action needed.
