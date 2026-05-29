# Task: Add QB college passing stats

## Context

QBs currently have no College Production section in the Player Profile. The cause is in the data pipeline, not the display:

- `loadCollegeStats()` fetches only `receiving` and `rushing` categories from CFBD.
- `matchCollegeToSleeper()` uses **receiving rows as the master iteration set** — every matched player must appear in receiving first, then rushing is attached if present.
- `computeCollegeMetrics()` explicitly returns `null` when `position === 'QB'` (line 50).

QBs barely appear in receiving (only as recipients of trick plays), so almost no QB gets a `collegeMatches` entry. Even if one did, metrics would return null.

The fix is to add the `passing` category end-to-end: fetch → match → metrics → display.

## Current data flow (verified)

| Step | File / location | Behaviour |
|---|---|---|
| Fetch | `src/api/cfbd.js` → `loadCollegeStats()` (lines 69–82) | Loops `COLLEGE_YEARS` (2017–2024), fetches `receiving` + `rushing` per year via `getBulkPlayerStats(year, category)`. Returns `{ receiving: {[year]: rows}, rushing: {[year]: rows} }`. Caches each category permanently under `cfbd-players/<year>/<category>` |
| Pivot | `src/api/cfbd.js` → `pivotStatRows()` (lines 40–55) | Category-agnostic. Groups rows by `playerId`, flattens `{ statType, stat }` pairs into `{ [statType]: float }`. Also captures `conference` |
| Team totals | `src/api/cfbd.js` → `computeTeamTotals()` (lines 58–67) | Sums `YDS` + `TD` per team. Category-agnostic |
| Match | `src/utils/collegeMatch.js` → `matchCollegeToSleeper()` (lines 95–189) | **Receiving-only iteration.** For each year, pivots receiving + rushing, then loops `pivotedRec`. Looks up Sleeper candidates by normalised name; disambiguates by college. Attaches matching rushing entry if present. Returns `{ [player_id]: [{ year, team, receiving, rushing, teamRecTotals, teamRushTotals }] }` |
| Metrics | `src/utils/collegeMetrics.js` → `computeCollegeMetrics()` (lines 43–132) | `if (!isRB && !isSkill) return null` — **QB excluded**. WR/TE use receiving dominator; RB uses rushing dominator. Returns `{ seasons, breakoutAge, peakDominator, finalYearDominator, productionTrend, seasonsPlayed }` |
| App-level wiring | `src/App.jsx` lines 460–461, 548–573, 1151–1170 | `rawCollegeData` + `collegeMatches` state; `collegeStats` memo applies `computeCollegeMetrics` per matched player; loaded in background after `careerStats` is ready |
| Display | `src/components/PlayersTab.jsx` → `CollegeSection` IIFE (lines 540 onward, inside `PlayerProfile`) | Renders breakout chip / peak dom chip / trend chip + per-season table. Per-season stat line is RB-specific (`rush yds / TD / car`) else WR/TE (`rec yds / TD / rec`) |

## Why QBs have no data

Two compounding gates: (1) `loadCollegeStats` never fetches passing rows, so they're absent from `rawCollegeData`; (2) even if QBs occasionally appear in receiving, `computeCollegeMetrics` short-circuits to `null` for `position === 'QB'`.

---

## Proposed changes

### 0. Verification step — CONFIRMED

Diagnostic was run; CFBD `passing` category returns these `statType` values:

```
YDS · TD · YPA · COMPLETIONS · INT · PCT · ATT
```

After `pivotStatRows`, a passing player object has these keys directly:

| Key | Meaning | Notes |
|---|---|---|
| `YDS` | passing yards | |
| `TD`  | passing TDs | |
| `INT` | interceptions | |
| `ATT` | pass attempts | |
| `COMPLETIONS` | completions | full word, not `COMP` |
| `YPA` | yards per attempt | already computed by CFBD — no need to derive |
| `PCT` | completion percentage | already computed by CFBD — no need to derive |

Paste this list as a comment block at the top of `collegeMetrics.js` for posterity. Remove the diagnostic logging block from `App.jsx` (currently around lines 1162–1165) before committing.

### 1. `src/api/cfbd.js` — add `passing` category to bulk fetch

Modify `loadCollegeStats()` only. No changes to `getBulkPlayerStats`, `pivotStatRows`, or `computeTeamTotals` — they are already category-agnostic.

```js
export async function loadCollegeStats() {
  const receiving = {}
  const rushing   = {}
  const passing   = {}  // ← new

  for (let i = 0; i < COLLEGE_YEARS.length; i++) {
    const year = COLLEGE_YEARS[i]
    receiving[year] = await getBulkPlayerStats(year, 'receiving')
    rushing[year]   = await getBulkPlayerStats(year, 'rushing')
    passing[year]   = await getBulkPlayerStats(year, 'passing')  // ← new
    console.log(`[cfbd] ${year} rec: ${receiving[year].length}, rush: ${rushing[year].length}, pass: ${passing[year].length}`)
    if (i < COLLEGE_YEARS.length - 1) await delay(400)
  }

  return { receiving, rushing, passing }
}
```

Cache key follows the existing pattern: `cfbd-players/<year>/passing`. Permanent TTL via `setCache(..., 999999)` — unchanged.

### 2. `src/utils/collegeMatch.js` — match QBs from passing rows

Restructure the per-year loop so that both receiving and passing serve as iteration sets, and the per-player merge is idempotent. Skill players (WR/TE/RB) still come from receiving; QBs come from passing. Matching key is unchanged: `normalizeName(player.player)` + college disambiguation via `normalizeCollege(player.team)`.

**Updated return shape per season entry:**

```js
{
  year:            number,
  team:            string,           // college team name
  receiving:       object | null,    // pivoted receiving row, or null
  rushing:         object | null,    // pivoted rushing row, or null
  passing:         object | null,    // NEW — pivoted passing row, or null
  teamRecTotals:   { YDS, TD },
  teamRushTotals:  { YDS, TD },
  teamPassTotals:  { YDS, TD },      // NEW
}
```

**Function signature** (unchanged):

```js
matchCollegeToSleeper(rawCollegeData, playersMap) → { [player_id]: SeasonEntry[] }
```

**Algorithm change (inside the `for (const year of years)` loop):**

```js
const recRows  = rawCollegeData.receiving[year] ?? []
const rushRows = rawCollegeData.rushing[year]   ?? []
const passRows = rawCollegeData.passing?.[year] ?? []  // optional-chain in case caller passes old shape

const pivotedRec  = pivotStatRows(recRows)
const pivotedRush = pivotStatRows(rushRows)
const pivotedPass = pivotStatRows(passRows)

const teamRecTotals  = computeTeamTotals(pivotedRec)
const teamRushTotals = computeTeamTotals(pivotedRush)
const teamPassTotals = computeTeamTotals(pivotedPass)

// Helper extracted from existing disambiguation logic
function resolveCandidate(cfbdPlayer) {
  const nameKey = normalizeName(cfbdPlayer.player)
  const candidates = nameMap[nameKey]
  if (!candidates || candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  const cfbdCollege = normalizeCollege(cfbdPlayer.team ?? '')
  const exact = candidates.find(c => c.college && c.college === cfbdCollege)
  if (exact) return exact
  return candidates.find(c => {
    if (!c.college) return false
    const cWords = c.college.split(' ')
    const fWords = cfbdCollege.split(' ')
    return cWords.some(w => w.length > 3 && fWords.includes(w))
  }) ?? null
}

// In-year accumulator keyed by player_id, so receiving / passing / rushing
// for the same player in the same year merge into one season entry.
const yearEntries = {}  // { [player_id]: SeasonEntry }

function upsert(playerId, fields) {
  if (!yearEntries[playerId]) {
    yearEntries[playerId] = {
      year,
      team:           fields.team,
      receiving:      null,
      rushing:        null,
      passing:        null,
      teamRecTotals:  teamRecTotals[fields.team]  ?? { YDS: 0, TD: 0 },
      teamRushTotals: teamRushTotals[fields.team] ?? { YDS: 0, TD: 0 },
      teamPassTotals: teamPassTotals[fields.team] ?? { YDS: 0, TD: 0 },
    }
  }
  Object.assign(yearEntries[playerId], fields.payload)
}

// Pass 1 — receiving-driven (skill players; existing logic)
for (const [cfbdId, recPlayer] of Object.entries(pivotedRec)) {
  const matched = resolveCandidate(recPlayer)
  if (!matched) continue
  const rushPlayer = pivotedRush[cfbdId] ?? null
  upsert(matched.player_id, {
    team: recPlayer.team,
    payload: { receiving: recPlayer, rushing: rushPlayer },
  })
}

// Pass 2 — passing-driven (QBs primarily). Skip rows that already merged via Pass 1.
for (const [, passPlayer] of Object.entries(pivotedPass)) {
  const matched = resolveCandidate(passPlayer)
  if (!matched) continue
  // Only attach passing to QBs — avoids accidentally pulling in WRs who threw a trick-play pass.
  if (matched.position !== 'QB') continue
  upsert(matched.player_id, {
    team: passPlayer.team,
    payload: { passing: passPlayer },
  })
}

// Flush into result
for (const [pid, entry] of Object.entries(yearEntries)) {
  if (!result[pid]) result[pid] = []
  result[pid].push(entry)
}
```

Notes:

- Pass 2 is gated by `matched.position === 'QB'` to keep WR/TE/RB driven purely by receiving as before.
- Pass 1 is unchanged behaviourally for skill players; only the upsert plumbing is new.
- Existing console.log at line 181–186 stays. Add a parallel line counting QB matches:
  ```js
  const qbCount = Object.values(result).filter(seasons =>
    seasons.some(s => s.passing != null)
  ).length
  console.log('[collegeMatch] QBs with passing data:', qbCount)
  ```

### 3. `src/utils/collegeMetrics.js` — QB metrics branch

Remove the `if (!isRB && !isSkill) return null` early-exit. Add an `isQB` branch that computes per-season passing metrics and a position-appropriate breakout/peak/trend triple.

**CFBD statType keys (confirmed in step 0):** `YDS`, `TD`, `INT`, `ATT`, `COMPLETIONS`, `YPA`, `PCT`. Read these directly off the pivoted passing object — do not alias inside `pivotStatRows`.

**Function signature** (unchanged):

```js
computeCollegeMetrics(seasons, position, currentAge, currentSeason) → metricsObject | null
```

**QB branch behaviour:**

```js
const isQB = position === 'QB'
// remove the early-return; widen the position gate:
if (!isQB && !isRB && !isSkill) return null
```

Inside the per-season `enriched` map, replace the dominator branch with a position switch:

```js
let domRating = null
let qbScore   = null   // NEW — only populated for QBs

if (isSkill) { /* existing receiving dominator */ }
else if (isRB) { /* existing rushing dominator */ }
else if (isQB) {
  const pass = s.passing
  if (pass?.ATT != null && pass.ATT > 0) {
    // Efficiency: CFBD provides YPA directly. Band: 4 YPA → 0, 9 YPA → 100
    const ypa = pass.YPA ?? (pass.YDS != null ? pass.YDS / pass.ATT : null)
    const eff = ypa != null ? Math.max(0, Math.min(100, (ypa - 4) * 20)) : 0
    // Volume proxy — total attempts (CFBD bulk stats have no GP). 200 att → 0, 800 att → 100
    const vol = Math.max(0, Math.min(100, (pass.ATT - 200) / 6))
    qbScore = eff * 0.55 + vol * 0.45
    // Touchdown bonus: cap at +10
    qbScore = Math.min(100, qbScore + Math.min(10, (pass.TD ?? 0) / 3))
  }
}
```

Apply the existing conference multiplier to `qbScore` the same way as `domRating`:

```js
const conference = s.receiving?.conference ?? s.rushing?.conference ?? s.passing?.conference ?? null
const confMultiplier = getConferenceMultiplier(conference)
if (domRating != null) domRating *= confMultiplier
if (qbScore   != null) qbScore   *= confMultiplier
```

Each per-season `enriched` row gains a `qbScore` field and a `passing` field (in addition to the existing `receiving`/`rushing`):

```js
return {
  year, conference, confMultiplier, estimatedAge,
  domRating: ...,                  // null for QBs
  qbScore:   qbScore != null ? Math.round(qbScore * 10) / 10 : null,  // null for non-QBs
  receiving: s.receiving ?? null,
  rushing:   s.rushing   ?? null,
  passing:   s.passing   ?? null,  // NEW
}
```

**Breakout detection for QBs:**

```js
let breakoutAge = null
for (const s of enriched) {
  let meetsThreshold = false
  if (isSkill)      meetsThreshold = (s.domRating >= 20) || (s.receiving?.YDS ?? 0) >= 800
  else if (isRB)    meetsThreshold = (s.domRating >= 30) || (s.rushing?.YDS ?? 0) >= 700
  else if (isQB)    meetsThreshold = (s.passing?.YDS ?? 0) >= 2500 || (s.passing?.TD ?? 0) >= 20
  if (meetsThreshold) { breakoutAge = s.estimatedAge; break }
}
```

**Peak / trend for QBs** — reuse the existing field name `peakDominator` but populate it from `qbScore` when position is QB, so the display layer doesn't have to learn a new shape:

```js
const validRatings = enriched.map(s => isQB ? s.qbScore : s.domRating).filter(r => r != null)
const peakDominator      = validRatings.length > 0 ? Math.max(...validRatings) : null
const finalYearDominator = (isQB
  ? enriched[enriched.length - 1]?.qbScore
  : enriched[enriched.length - 1]?.domRating) ?? null
```

Production trend ratio logic is unchanged.

The returned object is the same shape as today plus the new fields on each `seasons[i]` entry. No new top-level fields.

### 4. `src/components/PlayersTab.jsx` — QB-aware College Production display

Modify `CollegeSection` (around line 540) to branch on `player.position === 'QB'`.

**Chips row** — only the "Peak: XX.X%" chip changes. For QBs, render `Peak: XX.X score` and update the tooltip text:

```jsx
{peakDominator != null && (
  <Tooltip
    content={
      player.position === 'QB'
        ? 'Best single-season passing quality score — efficiency (YPA) blended with volume (attempts). Conference-adjusted.'
        : 'Best single-season share of team production. >25% WR/TE or >35% RB = clear feature role.'
    }
    position="bottom"
  >
    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium cursor-default">
      Peak: {peakDominator.toFixed(1)}{player.position === 'QB' ? ' score' : '%'}
    </span>
  </Tooltip>
)}
```

**Per-season table — `Dom%` column header** stays for non-QB; rename to `Score` for QB:

```jsx
<th className="pb-1.5 text-right font-medium">{player.position === 'QB' ? 'Score' : 'Dom%'}</th>
```

Cell value: read `s.qbScore` for QB, `s.domRating` otherwise. Format unchanged (`{val.toFixed(1)}{isQB ? '' : '%'}`).

**Per-season `Key stats` line** — add a QB branch above the existing isRB/else branches:

```jsx
const isQBdisp = player.position === 'QB'
const pass = s.passing
let statLine = '—'

if (isQBdisp && pass) {
  const parts = []
  if (pass.YDS != null) parts.push(`${Math.round(pass.YDS).toLocaleString()} pass yds`)
  if (pass.TD  != null) parts.push(`${pass.TD} TD`)
  if (pass.INT != null) parts.push(`${pass.INT} INT`)
  // CFBD provides PCT directly (completion percentage)
  if (pass.PCT != null) parts.push(`${pass.PCT.toFixed(1)}%`)
  statLine = parts.join(' · ') || '—'
} else if (isRB && rush) { /* existing */ }
else if (rec) { /* existing */ }
```

**Dynasty score summary** (PlayersTab.jsx line 1070) — the `College ${peakDominator.toFixed(0)}% dom` string should be QB-aware:

```js
if (collegeMetrics?.peakDominator != null) {
  out.push(player.position === 'QB'
    ? `College ${collegeMetrics.peakDominator.toFixed(0)} pass score`
    : `College ${collegeMetrics.peakDominator.toFixed(0)}% dom`)
}
```

Confirm `player` is in scope at that point during implementation; if not, derive `isQB` from another visible field.

### 5. README updates

`README.md` → "College metrics" section:

- Update the **Dominator rating** table to include a QB row pointing to the new quality score.
- Add a **QB quality score** subsection documenting the efficiency-and-volume composite.
- Update the **Breakout detection** table with the QB threshold (`passing YDS ≥ 2500 OR passing TD ≥ 20`).
- Note that each `seasons[i]` entry now includes a `passing` payload and a `qbScore` field.
- Update the cache section: `cfbd-players/<year>/passing` is now also written under the same permanent TTL.

## Files modified

| File | Change |
|---|---|
| `src/api/cfbd.js` | `loadCollegeStats()` — add `passing` per year, return three-key object |
| `src/utils/collegeMatch.js` | Refactor per-year loop into receiving-driven Pass 1 + passing-driven QB-only Pass 2 with an upsert merge into a year-scoped accumulator. Extend season entry with `passing`, `teamPassTotals` |
| `src/utils/collegeMetrics.js` | Remove QB null-gate. Add `isQB` branch with `qbScore` calculation. Apply conference multiplier. Extend `enriched` rows with `qbScore` and `passing`. Update breakout / peak / trend to use `qbScore` for QBs |
| `src/components/PlayersTab.jsx` | `CollegeSection` — QB-aware chips, column header, per-season stat line. Update dynasty summary string (line ~1070) |
| `README.md` | College metrics section: QB dominator alternative, breakout threshold, cache key |

## Files created

None.

## Out of scope

- Do not change `getBulkPlayerStats`, `pivotStatRows`, or `computeTeamTotals` — all are already category-agnostic.
- Do not change the `collegeStats` memo in `App.jsx` (line 548) — its inputs and outputs are unchanged.
- Do not change `ProfileDataContext.jsx` — the shape it provides is unchanged.
- Do not change `usePlayerProfile.js` — `collegeMetrics` already flows through verbatim.
- Do not adjust dominator thresholds for WR/TE/RB; do not touch conference multipliers.
- Do not add new top-level fields to the metrics object (use position-aware values inside existing fields like `peakDominator`).

## Acceptance criteria

- [ ] Step-0 diagnostic log block removed from `App.jsx`. Confirmed statType list (`YDS · TD · YPA · COMPLETIONS · INT · PCT · ATT`) pasted as a comment in `collegeMetrics.js`.
- [ ] `loadCollegeStats()` returns `{ receiving, rushing, passing }` and `passing[year]` has > 0 rows for at least 6 of the 8 years.
- [ ] `matchCollegeToSleeper` returns at least one season entry with a non-null `passing` field for known college QBs (Bryce Young, C.J. Stroud, Caleb Williams).
- [ ] `computeCollegeMetrics` returns a non-null result for a known college QB, with `peakDominator` > 0 and `seasons[i].qbScore` populated.
- [ ] Player Profile → College Production section renders for a QB with: breakout chip, "Peak: XX.X score" chip, per-season passing stat line (yds · TD · INT · %), correct year-by-year score column.
- [ ] WR / TE / RB profiles render unchanged — no regression in chip text, column header, or per-season stat line.
- [ ] No new top-level `null` warnings in console; CeeDee Lamb verification log still prints.
- [ ] `npm run build` passes with no new warnings.
- [ ] README "College metrics" section updated with QB rows.

## Open questions

1. **YPA bands** — the proposed efficiency band is `4 YPA → 0` / `9 YPA → 100`. Volume band is `200 att → 0` / `800 att → 100`. These are reasonable college-football defaults but not data-driven. Acceptable, or compute league-wide distributions first?
2. **Rushing QBs** — players like Jalen Hurts and Lamar Jackson have meaningful college rushing volume. Should `qbScore` blend in rushing production, or stay pure passing? Recommend: pure passing for v1.
3. **Single-source-of-truth for "Peak" field** — proposal reuses `peakDominator` as the position-appropriate peak. Alternative is adding `peakQBScore` and branching in the display. Recommend: reuse.

## Verification

1. Step 0 already ran — keys confirmed (`YDS · TD · YPA · COMPLETIONS · INT · PCT · ATT`). Remove the `[cfbd diag]` block from `App.jsx` as part of the implementation.
2. With a fresh cache (`clearCache('cfbd-players/')`), reload the app. Confirm `loadCollegeStats` fetches all three categories per year (logs `rec / rush / pass` counts).
3. Search Explorer for "Caleb Williams" (or another known college QB in your league). Open profile. Expect: College Production section with USC, breakout chip, "Peak: XX.X score", and per-season rows for 2021/2022/2023.
4. Open a WR profile (e.g. CeeDee Lamb). Confirm display is identical to current — `Peak: 35.x%`, `Dom%` column, `rec yds · TD · rec` stat line.
5. Run `npm run build`. No new warnings.
