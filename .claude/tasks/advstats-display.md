# Advstats Display — Phase 1b (view-only)

**Model:** sonnet implements. opus planned this file. Read it top to bottom, then
implement exactly. If anything here contradicts existing code or is ambiguous,
**stop and ask** — do not improvise architecture (per CLAUDE.md → Workflow convention).

---

## 0. Goal & scope (read first)

Surface the advanced stats the data repo now serves (`nflverse/advstats/<year>.json`),
**view-only**, in the Player Profile. Two pieces:

1. A new data-store consumer `src/api/advStats.js` that loads the served file,
   re-asserts the `MIN_ADVSTATS_ROWS = 250` sparsity gate on `rowCount`, and exposes
   the per-player advstats keyed by `sleeper_id`.
2. A new **view-only** "Advanced & Usage" panel in the Stats tab of the Player
   Profile that displays the advstats metrics (`targetShare`, `airYardsShare`, `wopr`,
   `racr`) **plus** the already-computed in-app usage stats (snap share, carry/target
   share), per position, clearly labeled, with graceful null handling.

**Hard boundary — strictly view-only.** This must not feed `projectedPPG`, the dynasty
score, or any `factors` entry. Activation is deliberately parked (see the project's
"Advstats & Signal Grading — Findings and Open Items" doc). The decoupling is made
explicit in three places: (a) a module-header invariant comment in `advStats.js`;
(b) a new CLAUDE.md invariant; (c) an enforced import-guard test
(`src/__tests__/advStatsViewOnly.test.js`). Do not wire advstats into any pipeline module.

**Single source.** The served advstats file is the only source for the displayed
advstats values — no app-side recomputation of `targetShare`/`airYardsShare`/`wopr`/`racr`.
(The in-app snap/carry/target share shown alongside them is reused, not recomputed —
see §4.)

CLAUDE.md invariants (Strict Mode `cancelled` guard, App.jsx owns state, no new state
libs, factors contract) still apply — do not re-derive them here; obey them.

---

## 1. Cross-repo contract being consumed (Phase 1a, already shipped)

`sleeper-dashboard-data` already publishes `nflverse/advstats/<year>.json`. **No
data-repo change is required by this task** — this is purely the app side of an
established contract. The served shape (mirrors the roster file):

```jsonc
{
  "schemaVersion": 1,
  "season": 2025,
  "rowCount": 312,              // sleeper-id-bearing rows; re-asserted against MIN_ADVSTATS_ROWS
  "generatedAt": "2026-...Z",
  "inProgress": false,
  "players": {                 // keyed by sleeper_id; WR / TE / RB only
    "<sleeper_id>": {
      "position": "WR",
      "targetShare":   0.241,  // 0–1
      "airYardsShare": 0.305,  // 0–1; frequently null for RB
      "wopr":          0.62,   // weighted opportunity rating (ratio)
      "racr":          1.12,   // receiver air-conversion ratio; frequently null for RB / no-air-yards
      "components": { /* raw underlying counts; passed through, not rendered by default */ }
    }
  }
}
```

Sparsity constant (shared with the data-repo write-gate): `MIN_ADVSTATS_ROWS = 250`.

`schemaVersion: 1` is ≤ `dataStore.js` `MAX_SUPPORTED_SCHEMA` (2), so the generic
`tryDataStore` schema gate passes it unchanged — **do not bump `MAX_SUPPORTED_SCHEMA`.**
The advstats `schemaVersion` is its own contract dimension (like the snapshot schema);
a future v3+ would need cross-repo coordination, but v1 is in scope today.

---

## 2. Loader — `src/api/advStats.js` (new)

Mirror `src/api/nflRoster.js` almost exactly: single `<year>.json` sleeper-keyed file,
`rowCount` sparsity gate, `lastModified`-driven freshness over a permanent per-year cache,
year probe, graceful absence. The shape validator lives in `dataStore.js` alongside the
others.

### 2a. Validator — add to `src/api/dataStore.js`

Append next to `isValidRoster` / `isValidDraft` (after line 120):

```js
export function isValidAdvStats(p) {
  return p && typeof p === 'object' && typeof p.players === 'object'
    && p.players !== null && typeof p.rowCount === 'number';
}
```

### 2b. `src/api/advStats.js`

```js
/**
 * src/api/advStats.js
 *
 * VIEW-ONLY. Loads nflverse advanced stats (target share, air-yards share, WOPR,
 * RACR) from the data store and exposes them per sleeper_id for DISPLAY ONLY in the
 * Player Profile. These values MUST NOT feed projectedPPG, the dynasty score, or any
 * projection `factors` entry. Activation is parked — see the "Advstats & Signal
 * Grading — Findings and Open Items" doc. The decoupling is enforced by
 * src/__tests__/advStatsViewOnly.test.js. Do not import this module from any
 * projection/scoring file.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/advstats/<year>.json
 *         Produced server-side by sleeper-dashboard-data (Phase 1a). sleeper_id-keyed,
 *         WR/TE/RB. inProgress:false, schemaVersion:1.
 *
 * Cache: `nfl-advstats/<year>` per year, permanent TTL (999999 min). Freshness via the
 * manifest entry's `lastModified` stored in the cache record — a changed token
 * re-fetches.
 *
 * Probes currentSeason → currentSeason-1 (the most-recent COMPLETED season; in the
 * offseason the upcoming season's advstats are not yet published).
 * MIN_ADVSTATS_ROWS completeness gate: only trust a file with >= 250 rows (matches the
 * data-repo write-gate, shared constant).
 *
 * Graceful absence: store down / no qualifying year / shape mismatch →
 * { byId: null, year: null, complete: false, rowCount: 0 }. The panel then renders
 * nothing (no crash, no NaN).
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidAdvStats } from './dataStore'

// Shared with the data-repo write-gate. Files below this row count are preliminary
// and never trusted/cached as authoritative.
const MIN_ADVSTATS_ROWS = 250

/**
 * @param {number} currentSeason  most-recent COMPLETED season (careerStats-derived)
 * @returns {Promise<{
 *   byId: Object|null,    // { [sleeper_id]: { position, targetShare, airYardsShare, wopr, racr, components } }
 *   year: number|null,
 *   complete: boolean,
 *   rowCount: number,
 * }>}
 */
export async function loadAdvStats(currentSeason) {
  for (const year of [currentSeason, currentSeason - 1]) {
    const path = `nflverse/advstats/${year}.json`

    // 1. Manifest check — not in store yet → try next year
    const entry = await getManifestEntry(path)
    if (!entry) continue

    // 2. Cache check (lastModified-aware) — must still satisfy the sparsity gate
    const rec = await getCacheRecord(`nfl-advstats/${year}`)
    if (rec?.data?.rowCount >= MIN_ADVSTATS_ROWS && rec.data.lastModified === entry.lastModified) {
      console.log(`[advStats] year=${year} served from cache (rows=${rec.data.rowCount})`)
      return { byId: rec.data.byId, year, complete: true, rowCount: rec.data.rowCount }
    }

    // 3. Fetch from data store
    const json = await tryDataStore(path, { validate: isValidAdvStats })
    if (!json) continue  // store unavailable / inProgress / shape mismatch → next year

    // 4. Sparsity gate — re-assert MIN_ADVSTATS_ROWS on the served rowCount
    if (json.rowCount < MIN_ADVSTATS_ROWS) {
      console.log(`[advStats] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_ADVSTATS_ROWS}), skipping`)
      continue
    }

    // 5. Cache with lastModified for next-load freshness
    await setCacheWithMeta(`nfl-advstats/${year}`, {
      byId: json.players,
      season: json.season,
      rowCount: json.rowCount,
      lastModified: entry.lastModified,
    }, 999999, {})

    console.log(`[advStats] fetched year=${year} rows=${json.rowCount}`)
    return { byId: json.players, year, complete: true, rowCount: json.rowCount }
  }

  // No qualifying year → graceful absence (panel renders nothing)
  return { byId: null, year: null, complete: false, rowCount: 0 }
}
```

Failure modes mirrored from the dataStore contract: file absent (manifest miss → skip
year), sub-gate (`rowCount < MIN_ADVSTATS_ROWS` → skip), `inProgress`/shape mismatch
(`tryDataStore` returns null → skip), store down (all years skip → graceful empty).
Each path returns a stable-shaped object; the panel never sees `undefined`.

---

## 3. Wiring — App.jsx → PlayersTab → ProfileDataContext → hook

Thread `advStats` through the existing data path that already carries
`seasonProjections` / `collegeStats`. No new state library; App.jsx keeps owning state.

### 3a. `src/App.jsx`

- Import (next to the other loaders, ~line 18):
  ```js
  import { loadAdvStats } from './api/advStats'
  ```
- State (next to `nflRoster`, ~line 524):
  ```js
  const [advStats, setAdvStats] = useState(null)
  ```
- Effect — load once careerStats is available, keyed on the most-recent COMPLETED
  season (same derivation as `seasonProjections` at ~line 850 and `collegeStats` at
  ~line 569). Strict-Mode `cancelled` guard is mandatory:
  ```js
  // Load nflverse advanced stats (view-only display in the Player Profile).
  // Keyed on the most-recent completed season (careerStats-derived), matching the
  // season whose stats the profile surfaces. NOT consumed by projection/scoring.
  useEffect(() => {
    if (!careerStats) return
    let cancelled = false
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const currentSeason = allSeasons[allSeasons.length - 1]
    loadAdvStats(currentSeason)
      .then(r => { if (!cancelled) setAdvStats(r) })
      .catch(err => console.warn('[advStats] Load error:', err.message))
    return () => { cancelled = true }
  }, [careerStats])
  ```
- Pass to `<PlayersTab>` (in the prop block at ~line 1342):
  ```jsx
  advStats={advStats}
  ```

### 3b. `src/components/PlayersTab.jsx`

- Add `advStats` to the `PlayersTab({ ... })` destructure (~line 1746).
- Add `advStats` to the `ProfileDataContext.Provider value={{ ... }}` (~line 2125):
  ```jsx
  value={{ careerStats, playersMap: playerMap, playerRows, positionPeakPPG, ktcMap,
           historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats }}
  ```

### 3c. `src/context/ProfileDataContext.jsx`

No code change (it's a passthrough `createContext`), but it now also carries `advStats` —
reflect that in the doc comment if you touch it; the provider value in PlayersTab is the
source of truth.

---

## 4. Hook — `src/hooks/usePlayerProfile.js`

Read `advStats` from context and derive three view-only outputs. **Reuse** the
already-computed snap/target/carry share — do not recompute.

- Add `advStats` to the `useProfileData()` destructure (line 19).
- Derive and return:

```js
// ── Advstats (view-only; served file is the single source) ────────────────
const advStatsRow    = advStats?.byId?.[playerId] ?? null
const advStatsSeason = advStats?.year ?? null

// ── Reused in-app usage stats (NOT recomputed) ────────────────────────────
// Snap share: most-recent qualifying season's off_snp/tm_off_snp, already computed
// in the projection pipeline (usageMetrics.computeUsageFactors) and surfaced on
// projection.factors.snapShare. null for QB / missing fields.
const snapShare = projection?.factors?.snapShare ?? null

// Carry/target share: most-recent entry of historicalShares (already in shareHistory).
// `share` is target share for WR/TE, carry share for RB.
const usageShare = (shareHistory && shareHistory.length > 0)
  ? { value: shareHistory[shareHistory.length - 1].share,
      season: shareHistory[shareHistory.length - 1].season }
  : null
```

Add to the returned object:

```js
// Advstats (view-only)
advStatsRow,
advStatsSeason,
snapShare,
usageShare,
```

Note: `projection` and `shareHistory` are already derived in this hook (lines 155 and
146). `snapShare` is read straight off `projection.factors.snapShare`
(seasonProjection.js line 708) — confirm that key is present on the projection object
before building the panel; if `projection` is null the value is null and the row is
omitted (graceful).

---

## 5. Panel — `src/components/AdvancedStatsPanel.jsx` (new, standalone)

A standalone presentational component (precedent: `AvailabilityHistory.jsx`, also a
standalone component rendered inside the Stats tab). Standalone — not an inline
`XxxSection` const — because (a) PlayersTab.jsx is already ~106 KB, (b) the
component/integration test mounts it directly, (c) the descriptor array (the
extensibility surface) lives in its own module.

**Pure & view-only:** props in, JSX out, no context reads, no side effects, returns no
value consumed by anything. It must not import any projection/scoring module.

### 5a. Extensibility model (descriptor-driven)

Adding a stat is **one descriptor entry** — never a rewrite. Each descriptor declares
where the value comes from, which positions it's valid for, and how to format it.

```jsx
import React from 'react'

// Formatters
const PCT   = v => `${(v * 100).toFixed(1)}%`   // 0–1 fractions (shares) → percent
const RATIO = v => v.toFixed(2)                  // WOPR / RACR ratios

// To add a view-only stat: append one row here. `from` selects the value source:
//   'adv'        → advStats[key]            (nflverse served file — single source)
//   'usageSnap'  → snapShare                (reused in-app, projection.factors.snapShare)
//   'usageShare' → usageShare.value         (reused in-app, historicalShares)
// `positions` gates position-appropriateness; a row is also dropped when its resolved
// value is null/undefined/non-finite (handles RB null racr/airYardsShare, etc.).
// A future descriptor can read raw underlying numbers via advStats.components.* by
// adding a small resolver branch — the served `components` object is passed through.
const ADV_STAT_ROWS = [
  // ── Advanced — nflverse advstats (served file) ──
  { key: 'targetShare',   group: 'advanced', label: 'Target share',    positions: ['WR','TE','RB'], format: PCT,   from: 'adv' },
  { key: 'airYardsShare', group: 'advanced', label: 'Air-yards share', positions: ['WR','TE'],      format: PCT,   from: 'adv' },
  { key: 'wopr',          group: 'advanced', label: 'WOPR',            positions: ['WR','TE'],      format: RATIO, from: 'adv' },
  { key: 'racr',          group: 'advanced', label: 'RACR',            positions: ['WR','TE'],      format: RATIO, from: 'adv' },
  // ── Usage — already computed in-app (reused, not recomputed) ──
  { key: 'snapShare',     group: 'usage',    label: 'Snap share',                                  positions: ['WR','TE','RB'], format: PCT, from: 'usageSnap' },
  { key: 'usageShare',    group: 'usage',    label: p => p === 'RB' ? 'Carry share' : 'Target share', positions: ['WR','TE','RB'], format: PCT, from: 'usageShare' },
]

const GROUPS = [
  { id: 'advanced', title: 'Advanced (nflverse)' },
  { id: 'usage',    title: 'Usage (in-app)' },
]

function resolveValue(row, { advStats, snapShare, usageShare }) {
  switch (row.from) {
    case 'adv':        return advStats ? advStats[row.key] : null
    case 'usageSnap':  return snapShare
    case 'usageShare': return usageShare?.value ?? null
    default:           return null
  }
}

const isShown = (v) => v != null && Number.isFinite(v)

export function AdvancedStatsPanel({ position, advStats, advStatsSeason, snapShare, usageShare }) {
  const ctx = { advStats, snapShare, usageShare }

  // Resolve every applicable, present row once.
  const resolved = ADV_STAT_ROWS
    .filter(r => r.positions.includes(position))
    .map(r => ({ row: r, value: resolveValue(r, ctx) }))
    .filter(({ value }) => isShown(value))

  if (resolved.length === 0) return null  // graceful absence — render nothing

  const renderGroup = (groupId) => {
    const rows = resolved.filter(({ row }) => row.group === groupId)
    if (rows.length === 0) return null
    const meta = GROUPS.find(g => g.id === groupId)
    return (
      <div key={groupId}>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{meta.title}</h4>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ row, value }) => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="py-1.5 text-gray-600">
                  {typeof row.label === 'function' ? row.label(position) : row.label}
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium text-gray-800">
                  {row.format(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Advanced &amp; Usage</h3>
        {advStatsSeason != null && (
          <span className="text-xs text-gray-400">{advStatsSeason} season</span>
        )}
      </div>
      <div className="space-y-4">
        {GROUPS.map(g => renderGroup(g.id))}
      </div>
    </section>
  )
}
```

Match the Tailwind idiom already used by the other profile sections (`<section>`,
`text-sm font-semibold text-gray-700` headings, `text-xs ... uppercase tracking-wide`
sub-headings, `tabular-nums` for numbers). Mirror the exact classes from neighbouring
sections rather than inventing new ones.

### 5b. Per-position behaviour (falls out of the descriptors)

| Position | Advanced group | Usage group |
|---|---|---|
| WR / TE | target share, air-yards share, WOPR, RACR (each omitted if its served value is null) | snap share, target share (in-app) |
| RB | target share only (air-yards/WOPR/RACR not in `positions` AND usually null) | snap share, carry share (in-app) |
| QB | — (no advstats served; not in any `positions`) → panel returns null | — |

Null handling is two-gated: (1) position-appropriateness via `positions`; (2) value
presence via `isShown`. No `NaN`/`null`/`undefined` ever reaches the DOM. A WR with a
null `racr` simply drops that one row; if every row drops, the group is omitted; if both
groups are empty, the panel renders nothing.

### 5c. Mounting in PlayerProfile (`src/components/PlayersTab.jsx`)

- Import at top of PlayersTab.jsx (next to the other component imports):
  ```js
  import { AdvancedStatsPanel } from './AdvancedStatsPanel'
  ```
- In `PlayerProfile`, pull the new values from the hook destructure (~line 254):
  ```js
  advStatsRow, advStatsSeason, snapShare, usageShare,
  ```
- Build the section const alongside the other `XxxSection` consts:
  ```jsx
  const AdvancedStatsSection = (
    <AdvancedStatsPanel
      position={player.position}
      advStats={advStatsRow}
      advStatsSeason={advStatsSeason}
      snapShare={snapShare}
      usageShare={usageShare}
    />
  )
  ```
  (The panel itself returns null when there's nothing to show, so no extra guard needed
  here — but it's fine to leave the JSX unconditional.)
- Insert into the **Stats tab** body (~line 1289-1294), between `{CareerSection}` (which
  contains Role/share history) and `{CollegeSection}` — keeps usage/role context together:
  ```jsx
  <div className="px-6 py-5 space-y-6 min-w-0">
    {CareerSection}
    {AdvancedStatsSection}
    {CollegeSection}
    {PositionContextSection}
    {CompsSection}
  </div>
  ```

---

## 6. Decoupling enforcement (the "view-only" guarantee)

Three layers, all required:

1. **Module-header comment** in `advStats.js` (in §2b) stating the view-only invariant
   and that no projection/scoring file may import it.
2. **CLAUDE.md invariant** (see §7d).
3. **Import-guard test** `src/__tests__/advStatsViewOnly.test.js` (see §8c) — reads the
   pipeline source files and fails if any imports advstats. This is the enforceable
   contract, in the spirit of `factorsSchema.test.js`.

Do **not**: import `advStats.js` / `AdvancedStatsPanel.jsx` from `seasonProjection.js`,
`dynastyScore.js`, `projectionSignals.js`, `usageMetrics.js`, `teamContext.js`, or any
other pipeline module; add advstats values to the `factors` object or
`adjustmentSummary`; let advstats influence any sort/rank used for scoring.

---

## 7. Docs updates

Make each edit to the real current text; where a quoted "before" can't be matched
verbatim, edit the live text to the specified end state.

### 7a. `docs/integrations.md` — new consumer entry

Insert a new section **between** the `### src/api/nflRoster.js` block (ends at the
`**Usage:**` bullet, ~line 307) and `### src/api/dataStore.js` (~line 309):

```md
### `src/api/advStats.js` — nflverse advanced stats (view-only)

- **Source:** `${VITE_DATA_STORE_URL}/nflverse/advstats/<year>.json` via `tryDataStore`/`getManifestEntry` in `dataStore.js`. `sleeper-dashboard-data` ingests nflverse advanced receiving stats server-side (Phase 1a) and publishes them as JSON via jsDelivr. `sleeper_id`-keyed; WR/TE/RB; `inProgress: false`, `schemaVersion: 1`.
- No API key, no auth.
- **View-only.** Loaded for **display/diagnostics only** in the Player Profile "Advanced & Usage" panel. **Never** consumed by projection or scoring — enforced by `src/__tests__/advStatsViewOnly.test.js`. Activation is parked (see the "Advstats & Signal Grading — Findings and Open Items" doc).
- **Served fields per player:** `targetShare`, `airYardsShare`, `wopr`, `racr` (plus raw `components`). `airYardsShare`/`racr` are frequently `null` for RBs.
- **Cache:** `nfl-advstats/<year>` per year, permanent TTL (999999 min). Each record stores `{ byId, season, rowCount, lastModified }`. Freshness is checked against the manifest `lastModified` — a changed token re-fetches.
- **Probe order:** `currentSeason → currentSeason−1`, where `currentSeason` is the most-recent completed season (careerStats-derived). In the offseason the upcoming season's advstats are not yet published, so the resolved year is typically the last completed season.
- **`MIN_ADVSTATS_ROWS = 250`** sparsity gate: only files with ≥ 250 sleeper-id rows are trusted (matches the data-repo write-gate). Sparse files are skipped, not cached.
- **Failure mode:** store down / no qualifying year / shape mismatch → `{ byId: null, year: null, complete: false, rowCount: 0 }`; the panel renders nothing (no crash, no NaN).
```

### 7b. `docs/ui.md` — panel + context + components

**(i) ProfileDataContext snippet** (lines 136-140). Add `advStats`:

Before:
```md
<ProfileDataContext.Provider value={{
  careerStats, playersMap: playerMap, playerRows,
  positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
  enrichmentMap,   // { coaching, scheme, injuries, notes } or null
}}>
```
After:
```md
<ProfileDataContext.Provider value={{
  careerStats, playersMap: playerMap, playerRows,
  positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
  enrichmentMap,   // { coaching, scheme, injuries, notes } or null
  advStats,        // { byId, year, complete, rowCount } or null — view-only advanced stats
}}>
```

**(ii) Stats tab section list** (lines 157-172). Insert a new numbered item after item 3
(Role History table), before the Availability History item, and renumber the rest:

```md
4. **Advanced & Usage panel** (`src/components/AdvancedStatsPanel.jsx`) — view-only. Two clearly-labeled groups: **Advanced (nflverse)** — target share, air-yards share, WOPR, RACR from the served `nflverse/advstats/<year>.json` (`advStats.js`); and **Usage (in-app)** — snap share (reused from `projection.factors.snapShare`) and carry/target share (reused from `historicalShares`). Per-position gating (RB shows target/carry + snap only; QB shows nothing) and graceful null omission — no NaN/null ever rendered. Descriptor-driven (`ADV_STAT_ROWS`): adding a stat is one entry. **Display only — never feeds projection or dynasty score.**
```

(Adjust the subsequent numbers 4→5 … 8→9, or leave them — the prose is what matters.)

**(iii) Components reference.** Add a short subsection near the SpiderChart/Tooltip
references (after the "Team depth chart" section, ~line 124) documenting
`AdvancedStatsPanel`:

```md
## AdvancedStatsPanel (`src/components/AdvancedStatsPanel.jsx`)

```jsx
<AdvancedStatsPanel position="WR" advStats={advStatsRow} advStatsSeason={2025}
                    snapShare={0.82} usageShare={{ value: 0.24, season: 2025 }} />
```

Pure presentational, view-only. Renders a descriptor-driven (`ADV_STAT_ROWS`) two-group
table of advanced (nflverse) and usage (in-app) metrics for one player. Returns `null`
when no applicable, present rows exist. No context reads, no projection coupling.
```

### 7c. `README.md`

**(i) Project structure** (lines 80-91). Add the two files:

Under `api/` (after the `nflRoster.js` line, ~87):
```md
    advStats.js         # nflverse advanced stats loader (view-only); sleeper_id-keyed; per-year permanent cache; MIN_ADVSTATS_ROWS gate; graceful fallback
```
Under `components/` (after `PlayersTab.jsx`, ~89):
```md
    AdvancedStatsPanel.jsx # View-only advanced/usage stats panel (descriptor-driven) for the Player Profile
```
And update the `ProfileDataContext.jsx` line (~94) to append `/advStats`:
```md
    ProfileDataContext.jsx  # Provides careerStats/playersMap/playerRows/positionPeakPPG/ktcMap/historicalShares/collegeStats/seasonProjections/advStats
```

**(ii) Documentation index** (lines 140-142). Append the new panel to the ui.md bullet:
```md
- [docs/ui.md](docs/ui.md) — Player Explorer (columns, filters, sort), the
  Player Profile panel and its tabs, the Advanced & Usage panel, SpiderChart,
  Tooltip, team depth chart, and the Features/tabs overview.
```
And append advstats to the integrations.md bullet (lines 136-139):
```md
- [docs/integrations.md](docs/integrations.md) — Sleeper stats & career-history
  loader, KTC (fetch/parse/match/history), CFBD, nflverse draft, nflverse advstats
  (view-only), data-store integration, enrichment overlay, cache, projection
  snapshots, and the API-layer tables.
```

No new docs *file* is added, so no new top-level index entry is required.

### 7d. `CLAUDE.md`

**(i) Navigation map → src/api/ table.** Add a row after `nflRoster.js`:
```md
| `advStats.js` | nflverse advanced stats (target/air-yards share, WOPR, RACR) — loaded from data store via `dataStore.js`; `sleeper_id`-keyed; `MIN_ADVSTATS_ROWS=250` gate; per-year permanent cache. **View-only** — never feeds projection/scoring (see Invariants) |
```

**(ii) Navigation map → src/components/ table.** Add a row after `PlayersTab.jsx`:
```md
| `AdvancedStatsPanel.jsx` | View-only advanced/usage stats panel (descriptor-driven `ADV_STAT_ROWS`) rendered in the Player Profile Stats tab |
```

**(iii) Invariants — new invariant.** Add after the "Capture-only factors do not move
projectedPPG" invariant:
```md
**Advstats are display-only.** `src/api/advStats.js` and `src/components/AdvancedStatsPanel.jsx` feed the Player Profile panel only. They must never influence `projectedPPG`, the dynasty score, or any `factors` entry. No projection/scoring module may import them. Enforced by `src/__tests__/advStatsViewOnly.test.js`. Activation is parked — see the "Advstats & Signal Grading — Findings and Open Items" doc.
```

**(iv) Cross-repo contracts.** Add a bullet to the
"### Cross-repo contracts (with sleeper-dashboard-data)" list:
```md
- **nflverse advstats (view-only):** `src/api/advStats.js` reads `nflverse/advstats/<year>.json`, produced by the data repo (Phase 1a). The served shape (`players` keyed by `sleeper_id`; per-player `targetShare`/`airYardsShare`/`wopr`/`racr`/`components`; `rowCount`; `schemaVersion: 1`; `inProgress: false`) and the `MIN_ADVSTATS_ROWS = 250` sparsity gate are the contract, re-asserted in `advStats.js`. This is the app side of an already-shipped data-repo contract — display-only, not wired into projection. Changing the served shape must be coordinated with the loader.
```

(Self-maintenance per CLAUDE.md: these edits land in the **same change** as the code,
since the feature adds two `src/` modules and a cross-repo contract row.)

---

## 8. Tests to add

### 8a. Unit — `src/api/advStats.test.js`

Mirror `src/api/nflDraft.test.js`: hoisted mocks of `./dataStore`
(`getManifestEntry`, `tryDataStore`, `isValidAdvStats`) and `../utils/cache`
(`getCacheRecord`, `setCacheWithMeta`).

Fixtures:
```js
const LAST_MODIFIED = '2026-06-01'
const ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }
const WR_ROW = { position: 'WR', targetShare: 0.241, airYardsShare: 0.305, wopr: 0.62, racr: 1.12, components: {} }
const RB_ROW = { position: 'RB', targetShare: 0.08,  airYardsShare: null,  wopr: null, racr: null, components: {} }
const makeJson = (rowCount = 312, players = { '111': WR_ROW, '222': RB_ROW }) =>
  ({ schemaVersion: 1, season: 2025, rowCount, generatedAt: '2026-06-01T00:00:00Z', inProgress: false, players })
```

Cases (assert behaviour, not just green):
1. **Fresh cache + matching lastModified + rowCount ≥ gate** → served from cache;
   `tryDataStore` not called; returns `{ byId, year, complete: true, rowCount }`.
2. **Cache miss** (`getCacheRecord` → null) → `tryDataStore` called once;
   `setCacheWithMeta` called with key `nfl-advstats/2025`, `data.lastModified === LAST_MODIFIED`,
   TTL `999999`; `byId` populated; `complete: true`.
3. **MIN_ADVSTATS_ROWS re-assertion** — served `rowCount: 200` (< 250) for both probe
   years → both skipped → returns `{ byId: null, year: null, complete: false, rowCount: 0 }`;
   nothing cached. (This is the core sparsity-gate test.)
4. **Stale cache lastModified** → re-fetch; re-cached with the new token.
5. **Store unavailable** (`tryDataStore` → null for both years) → graceful empty object;
   `setCacheWithMeta` not called.
6. **Missing-file / sub-gate graceful absence** — `getManifestEntry` → null for the
   first probe year, qualifying file for the second → resolves the second year.
7. **Null handling round-trip** — `RB_ROW` (null `airYardsShare`/`wopr`/`racr`) survives
   into `byId` unchanged; loader does not throw on nulls.
8. **Validator** (`isValidAdvStats`, tested directly like `dataStore.test.js`):
   true for a good object; false for `null`, an array, `{ players: null }`,
   `{ players: {} }` with non-number `rowCount`.

### 8b. Component/integration — `src/components/AdvancedStatsPanel.test.jsx`

Use the repo's existing component-test setup (Vitest + Testing Library; mirror an
existing `*.test.jsx` if present, else `render` from `@testing-library/react`).

Cases:
1. **WR full render** — `position="WR"`,
   `advStats={{ targetShare:0.25, airYardsShare:0.30, wopr:0.62, racr:1.10 }}`,
   `advStatsSeason={2025}`, `snapShare={0.82}`,
   `usageShare={{ value:0.24, season:2025 }}` → asserts the rows render with formatted
   values: `25.0%`, `30.0%`, `0.62`, `1.10`, `82.0%`, `24.0%`; both group headers
   ("Advanced (nflverse)", "Usage (in-app)") present; "2025 season" shown.
2. **RB graceful nulls** — `position="RB"`,
   `advStats={{ targetShare:0.08, airYardsShare:null, wopr:null, racr:null }}`,
   `snapShare={0.55}`, `usageShare={{ value:0.18, season:2025 }}` → target share +
   snap + **"Carry share"** render; air-yards/WOPR/RACR rows **absent**;
   `queryByText(/NaN|null|undefined/i)` is `null`.
3. **QB → null** — `position="QB"`, any props → `container` is empty (panel returns null).
4. **Total absence** — `advStats={null}`, `snapShare={null}`, `usageShare={null}`,
   `position="WR"` → `container` empty.
5. **Partial advstats** — WR with `racr: null` but the other three present → RACR row
   omitted, the other three render (per-row null gating, not all-or-nothing).
6. **Extensibility smoke** (optional but recommended) — assert the rendered row count
   for the WR case equals the number of applicable+present descriptors, so adding a
   descriptor is caught by an expected-count update rather than a silent miss.

### 8c. Import-guard — `src/__tests__/advStatsViewOnly.test.js`

Static decoupling contract (no rendering). Read each pipeline source file and assert it
does **not** import advstats:

```js
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const PIPELINE = [
  'src/utils/seasonProjection.js',
  'src/utils/dynastyScore.js',
  'src/utils/projectionSignals.js',
  'src/utils/usageMetrics.js',
  'src/utils/teamContext.js',
]

describe('advstats stay view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not import advStats / AdvancedStatsPanel`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*advStats['"]/)
      expect(src).not.toMatch(/AdvancedStatsPanel/)
      expect(src).not.toMatch(/loadAdvStats/)
    })
  }

  it('advStats.js imports nothing from projection/scoring', () => {
    const src = readFileSync('src/api/advStats.js', 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*(seasonProjection|dynastyScore|projectionSignals|usageMetrics)['"]/)
  })
})
```

This is the enforceable "never affects projection output" guarantee — there is no
projection input to vary (advstats is never passed to `computeNextSeasonProjection`), so
the meaningful assertion is the import graph.

### 8d. Done-definition (CLAUDE.md §Done-definition)

`npm test` green · `npm run lint` 0 problems · `npm run build` clean. `seasonProjection.js`
is untouched, so `factorsSchema.test.js` should be unaffected — run it anyway to confirm
the `factors` contract didn't move (it must not). No stat-key references change, so
`statKeysContract.test.js` is unaffected.

---

## 9. Cross-repo impact

- **Consumes** the Phase-1a served file `nflverse/advstats/<year>.json`. The data side
  already shipped — **no `sleeper-dashboard-data` change is required by this task.**
- **Mirrors** the contract (served shape + `MIN_ADVSTATS_ROWS = 250`) into the app's
  CLAUDE.md "Cross-repo contracts" table (§7d-iv) and re-asserts the sparsity gate in
  `advStats.js`.
- If a future task changes the served advstats shape or schema, it must be coordinated
  with `advStats.js` / `isValidAdvStats` (state it in that task's summary).

---

## 10. Step sequence (implementation order)

1. `src/api/dataStore.js` — add `isValidAdvStats`.
2. `src/api/advStats.js` — new loader (§2b).
3. `src/api/advStats.test.js` — unit tests (§8a); run, green.
4. `src/components/AdvancedStatsPanel.jsx` — new panel (§5).
5. `src/components/AdvancedStatsPanel.test.jsx` — component tests (§8b); run, green.
6. `src/hooks/usePlayerProfile.js` — read `advStats`, derive `advStatsRow` /
   `advStatsSeason` / `snapShare` / `usageShare` (§4).
7. `src/App.jsx` — import, state, effect, prop (§3a).
8. `src/components/PlayersTab.jsx` — props destructure, provider value, import + mount
   `AdvancedStatsSection` in the Stats tab (§3b, §5c).
9. `src/__tests__/advStatsViewOnly.test.js` — import-guard (§8c); run, green.
10. Docs: `docs/integrations.md`, `docs/ui.md`, `README.md`, `CLAUDE.md` (§7).
11. Done-definition: `npm test`, `npm run lint`, `npm run build` — all clean (§8d).

---

## 11. Open questions / stop-and-ask triggers (for the implementing session)

- If `projection.factors.snapShare` is **not** present on the projection object as read
  by the hook (verify against `seasonProjection.js` line ~708 and the `factors` schema),
  stop — do not recompute snap share; ask how to source it.
- If the repo has **no existing component-test harness** (no `*.test.jsx`, no
  `@testing-library/react` in `package.json`), stop and ask before adding the dependency
  rather than introducing a new test stack unprompted.
- If the served advstats file's actual shape differs from §1 (e.g. not `players`/
  `rowCount`-keyed), stop — the validator and loader assume the roster-mirrored shape.
