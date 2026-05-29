# Task: Projection Snapshots v1

## Goal

Capture a daily, contemporaneous record of the inputs and outputs of the projection pipeline (Sleeper status / depth / KTC / per-player projection + per-team depth charts), keyed by UTC date, so future backtests have a real before-the-fact dataset to grade against. v1 ships the persistence and export path only — no consumer UI, no backtest logic. ADP/Vegas/injury-report enrichment is deferred.

---

## Inventory: existing IndexedDB → data-repo export flow

The export pipeline today lives in **`src/utils/exportData.js`** and is the only producer that walks IndexedDB into a downloadable ZIP. Key facts:

- Single entry point `exportAllData()` — opens DB `sleeper-dashboard`, store `cache`, reads all records.
- Filters by `isLive(record)` — keeps anything whose `expiresAt` is in the future, with permanent entries detected via the "more than 10 years out" heuristic (matches the `999999` minute TTL convention used by `setCache`).
- Classifies each cache key via `classifyKey(key)`:
  - `season-totals/<year>` → `nfl/season-totals/<year>.json`
  - `cfbd-players/<year>/<category>` → `college/<category>/<year>.json`
  - `ktc-values` → `ktc/snapshot-<YYYY-MM-DD>.json` (date stamped from `new Date().toISOString().slice(0,10)`)
  - default → `raw/<key-with-slashes-replaced>.json`
- Builds a `manifest.json` inside the ZIP: `{ exportedAt, source: 'indexeddb', files: { [zipPath]: { originalKey, recordCount } } }`.
- Triggers a browser download as `sleeper-dashboard-export-<YYYY-MM-DD>.zip`.

The data repo (`sleeper-dashboard-data`) then receives that ZIP by hand (no automated pipe) and the repo-side scripts (`bin/update.mjs`, `lib/manifest.mjs`) layer per-file `schemaVersion`, `lastModified`, and `inProgress` flags onto the manifest the next time an update script runs.

**Implication for this task:** the natural place to slot snapshots in is a new classification branch in `classifyKey`. The export still produces a single ZIP; the user-facing behaviour (one click, one ZIP, same filename pattern) does not change. The only new producer is `writeProjectionSnapshot` writing to IndexedDB under a new key prefix.

---

## Decisions

### 1. `scoringBasis` derivation

Source: `leagueData.scoringSettings` from the active league.

```js
function deriveScoringBasis(scoringSettings) {
  if (!scoringSettings) return 'unknown'
  const rec = scoringSettings.rec
  const bonusFD = scoringSettings.bonus_rec_fd ?? 0
  const tep = scoringSettings.bonus_rec_te ?? 0
  // Recognise TE-premium first because rec=1 alone otherwise looks like plain PPR.
  if (rec === 1   && tep > 0)   return 'te_premium'
  if (rec === 1   && bonusFD === 0 && tep === 0) return 'ppr'
  if (rec === 0.5 && tep === 0) return 'half_ppr'
  if (rec === 0   && tep === 0) return 'standard'
  return 'custom'
}
```

`'custom'` is the honest fallback for any league that doesn't match a recognised preset (e.g. half-PPR with TE premium, fractional FD bonuses, etc.). v1 just records the label — no downstream code consumes it yet, but the backtest will need it to know what scale the recorded `projectedPPG` lives on.

### 2. Data-repo commit path — **extend the existing export only; no new CLI subcommand**

- The export ZIP already represents "everything in IndexedDB worth shipping." A snapshot at key `projection-snapshots/<date>` slotting into `classifyKey` rides the same single-click flow.
- The repo-side `bin/update.mjs` is for **fetching from external APIs** (Sleeper, CFBD, KTC). Snapshots are produced by the *app*, not by a fetch — they belong in the export path, same as the KTC snapshot already does.
- Manifest registration on the repo side: the existing `updateManifestEntry` helper already handles per-file `schemaVersion` + `lastModified` + `inProgress`. The implementation session adds a tiny one-shot pass (either a manual `node bin/register-snapshot.mjs --date <YYYY-MM-DD>` or a folded step in the manual import workflow) that calls `updateManifestEntry` for every `snapshots/<date>.json` present but unregistered. **Recommended:** a new very small script `scripts/register-snapshots.mjs` callable as `node bin/update.mjs snapshots` that scans `snapshots/*.json` and registers any missing entries. No fetching, no validation beyond "file parses and has `schemaVersion` + `capturedAt`". This keeps the manifest contract intact without inventing a parallel registration path.
- Net: app-side change is the export extension; repo-side change is a one-file `register-snapshots.mjs` plus a `snapshots` subcommand entry in `bin/update.mjs` and a README section.

### 3. Idempotency — **skip if exists, do not overwrite**

If `getCacheRecord('projection-snapshots/<date>')` returns a live record, `writeProjectionSnapshot` returns `{ written: false, reason: 'already-exists' }` without touching IndexedDB. Rationale: the snapshot is supposed to be *contemporaneous*. Same-day overwrites after a data refresh would silently move the timestamp; we'd rather have the first stable snapshot of the day. The "two browsers same date" risk (see Risks below) is also dampened by this rule — the first browser to write wins on its own machine, and the export step is what reconciles across machines.

### 4. Schema version

File-level `schemaVersion: 1`. Bumped if/when the per-player shape or top-level keys change incompatibly. Additive fields (e.g. new optional projection sub-fields) do not bump.

---

## Final data shape

Cache key: `projection-snapshots/<YYYY-MM-DD>` (UTC). ZIP path on export: `snapshots/<YYYY-MM-DD>.json`. Repo path after commit: `snapshots/<YYYY-MM-DD>.json`.

```json
{
  "schemaVersion": 1,
  "capturedAt":    "2026-05-19T14:23:11.812Z",
  "scoringBasis":  "half_ppr",
  "leagueId":      "1312015497465716736",
  "teamDepthCharts": {
    "BUF": {
      "QB": [
        { "playerId": "4984", "fullName": "Josh Allen",   "depthOrder": 1,  "status": "Active" }
      ],
      "RB": [
        { "playerId": "9509", "fullName": "James Cook",   "depthOrder": 1,  "status": "Active" },
        { "playerId": "9999", "fullName": "Ray Davis",    "depthOrder": 2,  "status": "Active" }
      ],
      "WR": [ … ],
      "TE": [ … ]
    },
    "SF": { … },
    …
  },
  "players": {
    "4984": {
      "nfl_team":       "BUF",
      "status":         "Active",
      "depthChartOrder": 1,
      "ktc": { "value": 9800, "positionPercentile": 99 },
      "projection": {
        "projectedPPG":      22.4,
        "projectedTotalPts": 380.8,
        "confidence":        "high",
        "adjustmentSummary": ["Age curve peak", "Elite KTC ↑"],
        "components": { … any inputs the projection emits … }
      }
    },
    "9509": { … },
    …
  }
}
```

Rules:
- A player is included **iff** `seasonProjections[player_id]` exists AND `playerMap[player_id].team` is non-null. No `nfl_team` or no projection → excluded.
- `status` mirrors Sleeper's `playerMap[id].status` (e.g. `"Active"`, `"Inactive"`, `"Injured Reserve"`, etc.). `null` if absent.
- `depthChartOrder` is `playerMap[id].depth_chart_order ?? null`.
- `ktc` is `null` if the player isn't in `ktcMap`; otherwise `{ value, positionPercentile }` computed via the existing `computeKTCPositionPercentile`.
- `projection` is the *entire* `seasonProjections[player_id]` object passed through verbatim — no field whitelist. Future projection fields ride along without code changes.
- `teamDepthCharts` is built once at snapshot time from `buildTeamDepthChart` for each `nfl_team` that appears in the snapshot's `players` set, then projected down to only the fields needed: `{ playerId, fullName, depthOrder, status }`. This is a deliberate narrowing — `buildTeamDepthChart` returns richer rows (dynasty score/label/KTC) which we don't need to duplicate at the team level since per-player rows already carry them.

---

## Function signatures

### `src/utils/projectionSnapshot.js` (new)

```js
/**
 * Pure builder: composes the snapshot object from already-loaded state.
 * Does not touch IndexedDB or the network. Deterministic given its inputs.
 *
 * @param {object} args
 * @param {Object} args.seasonProjections   { [player_id]: projection object }
 * @param {Object} args.playerMap           leagueData.playerMap
 * @param {Map}    args.ktcMap              Map<player_id, { value, confidence }>
 * @param {Array}  args.playerRows          playerRowsWithProj (used by buildTeamDepthChart)
 * @param {Object} args.scoringSettings     leagueData.scoringSettings
 * @param {string} args.leagueId
 * @param {Date}   [args.now]               Override for tests; defaults to new Date()
 * @returns {{
 *   schemaVersion: 1,
 *   capturedAt:    string,        // ISO
 *   scoringBasis:  string,        // 'half_ppr' | 'ppr' | 'standard' | 'te_premium' | 'custom' | 'unknown'
 *   leagueId:      string,
 *   teamDepthCharts: Object,
 *   players:       Object,
 * }}
 */
export function buildProjectionSnapshot({
  seasonProjections, playerMap, ktcMap, playerRows, scoringSettings, leagueId, now,
})

/**
 * Idempotent writer: checks for an existing same-date snapshot, builds and
 * stores one if absent. Permanent TTL via setCache(..., 999999).
 *
 * @param {object} args  same as buildProjectionSnapshot
 * @returns {Promise<{ written: boolean, reason?: string, key?: string, bytes?: number }>}
 */
export async function writeProjectionSnapshot(args)
```

### Internal helper (also in `projectionSnapshot.js`, not exported)

```js
function deriveScoringBasis(scoringSettings)   // see decision 1
function dateKeyUTC(date)                       // returns 'YYYY-MM-DD' from a Date, UTC slice
function buildPlayersBlock(seasonProjections, playerMap, ktcMap)
function buildTeamDepthChartsBlock(teamsInSnapshot, playerMap, playerRows)
```

`buildTeamDepthChartsBlock` calls the existing `buildTeamDepthChart(nflTeam, playerMap, playerRows)` from `src/utils/teamContext.js` for each team and reduces each entry to `{ playerId: full.player_id, fullName: full.full_name, depthOrder: full.depthOrder, status: playerMap[full.player_id]?.status ?? null }`.

### `src/utils/exportData.js` (extend `classifyKey`)

```js
// projection-snapshots/<date>  →  snapshots/<date>.json
const snapMatch = key.match(/^projection-snapshots\/(\d{4}-\d{2}-\d{2})$/)
if (snapMatch) {
  return { zipPath: `snapshots/${snapMatch[1]}.json` }
}
```

Insert this branch above the `raw/` fallback. No other change to `exportData.js`.

### `src/App.jsx` (new effect, near the existing post-pipeline effects)

```js
useEffect(() => {
  if (!seasonProjections || !leagueData?.playerMap || !ktcMap || !leagueData?.scoringSettings) return
  if (!selectedLeague?.league_id) return
  let cancelled = false
  ;(async () => {
    try {
      const result = await writeProjectionSnapshot({
        seasonProjections,
        playerMap:       leagueData.playerMap,
        ktcMap,
        playerRows:      playerRowsWithProj,
        scoringSettings: leagueData.scoringSettings,
        leagueId:        selectedLeague.league_id,
      })
      if (cancelled) return
      if (result.written) console.log(`[snapshot] wrote ${result.key} (${result.bytes} bytes)`)
      else                console.log(`[snapshot] skipped: ${result.reason}`)
    } catch (err) {
      if (!cancelled) console.warn('[snapshot] failed:', err)
    }
  })()
  return () => { cancelled = true }
}, [seasonProjections, leagueData?.playerMap, ktcMap, leagueData?.scoringSettings, selectedLeague?.league_id, playerRowsWithProj])
```

Notes:
- Effect runs only when *all four* of `seasonProjections`, `leagueData.playerMap`, `ktcMap`, `leagueData.scoringSettings` are populated, plus a league is selected. This satisfies the "no league" and "still loading" gates implicitly.
- `playerRowsWithProj` is included in the dep array so re-fires happen after the projection pipeline has produced its final rows. The idempotency check inside `writeProjectionSnapshot` ensures re-fires within the same UTC day are no-ops.
- Fire-and-forget pattern with `cancelled` mirrors existing async effects in `App.jsx`.

---

## Step sequence

App repo (`/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard/`):

1. **Create** `src/utils/projectionSnapshot.js` with: `buildProjectionSnapshot`, `writeProjectionSnapshot`, the helpers above, and the `deriveScoringBasis` mapping table.
2. **Modify** `src/utils/exportData.js`: add the `projection-snapshots/...` branch to `classifyKey`. No other changes.
3. **Modify** `src/App.jsx`: add the effect that calls `writeProjectionSnapshot`. Place it after the `playerRowsWithProj` memo and any existing post-pipeline effects. No changes to projection logic, dynasty score, or ranking.
4. **Smoke test in dev**: load the app with a real league, wait for projections to log, check `console.log('[snapshot] wrote …')`. Open IndexedDB devtools → confirm `projection-snapshots/<today>` record. Reload — confirm subsequent log says `skipped: already-exists`.
5. **Export test**: click the existing export button, unzip, confirm `snapshots/<today>.json` is present, opens, has the documented shape, and `manifest.json` inside the ZIP includes the snapshot path with a sane `recordCount` (= number of player ids in the snapshot).
6. **No source edits to** `seasonProjection.js`, `dynastyScore.js`, `teamContext.js` (the latter is read-only — we *call* `buildTeamDepthChart`, we don't change it).

Data repo (`/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard-data/`):

7. **Create** `scripts/register-snapshots.mjs` — scans `snapshots/*.json`, for each file that isn't already in the manifest (or whose `lastModified` predates the file's mtime), calls `updateManifestEntry({ path, recordCount: Object.keys(parsed.players).length, inProgress: false, schemaVersion: parsed.schemaVersion ?? 1 })`.
8. **Modify** `bin/update.mjs` — add a `snapshots` subcommand that imports and calls `registerSnapshots()`. No `--year`, no `--force` needed. Optional `--dry-run` mirrors the other subcommands.
9. **Modify** `README.md` — add a `snapshots/<date>.json` section under "File schemas" mirroring the style of `nfl/season-totals/<year>.json` and `ktc/snapshot-<date>.json`. Document the file-level wrapper (schemaVersion, capturedAt, scoringBasis, leagueId, teamDepthCharts, players), the per-player shape, and the manual workflow: extract the ZIP, copy `snapshots/<date>.json` into the repo, run `node bin/update.mjs snapshots`, commit.
10. **No changes to** `lib/sleeper.mjs`, `lib/validate.mjs`, or any existing subcommand. `validateNflSeason` etc. stay as-is. Adding a snapshot-specific validator is deferred to v2.

---

## Edge cases

| Case | Behaviour |
|---|---|
| User has no league selected | Effect's gate fails (`selectedLeague?.league_id` is null), nothing runs. No snapshot. |
| `leagueData.scoringSettings` is null mid-load | Effect gate fails. Effect re-fires when scoringSettings populates. |
| `ktcMap` not yet loaded but projections done | Effect gate fails until KTC arrives. (KTC failures that leave `ktcMap` as a populated-but-empty Map are fine — players just get `ktc: null`.) |
| Same UTC date, projection re-runs (e.g. user changes leagues) | Idempotency guard: `getCacheRecord` finds the existing snapshot, writer returns `{ written: false, reason: 'already-exists' }`. **Note:** if the user switches to a *different* league on the same day, the snapshot already captured the first league's `leagueId`. This is a known v1 limitation — see Risks. |
| `seasonProjections[id]` exists but `playerMap[id].team` is null | Player excluded from `players` block. Not in `teamDepthCharts` either (no team to key under). |
| Date rollover at UTC midnight while app is open | Next projection re-fire after midnight produces a new key `projection-snapshots/<new-date>`. Previous day's snapshot stays under its own key. |
| IndexedDB write fails | `console.warn('[snapshot] failed:', err)`. No throw bubbles up; pipeline unaffected. |
| Export run on a day with no snapshot yet (e.g. user clicks export before projections finish) | No `snapshots/...` file in ZIP. Other exported files unaffected. |
| Multi-position player (rare; e.g. `WR/RB`) | `buildTeamDepthChart` keys by `playerMap[id].position` only — same behaviour as today. No new code path. |
| Old snapshot keys with `999999` TTL accumulating | Permanent. Cleanup is a v2 concern (e.g. `clearCache('projection-snapshots/')` from an admin UI). Estimated ~1MB/year is acceptable for now. |

---

## Risks

1. **Two browsers, same UTC date, different snapshots.** Each browser keeps its own IndexedDB snapshot. The first ZIP imported into the data repo wins; a later import overwriting `snapshots/<date>.json` from a different browser is a silent data loss event on the repo side. v1 accepts this — single-user, single-session is the normal mode. Mitigations for later: include a deterministic content hash in the filename, or refuse to overwrite during `register-snapshots.mjs` without `--force`.
2. **League switch mid-day captures only the first-selected league.** `writeProjectionSnapshot` is keyed by date, not by `leagueId`, and idempotency skips the second write. Acceptable v1 trade-off because the projection inputs that vary by league are scoring-rule-dependent and the recorded `scoringBasis` makes that detectable retrospectively. v2 could key on `<date>-<leagueId>` if we ever want true multi-league capture.
3. **Same-day refreshes that update inputs after the first snapshot.** With "skip if exists" we deliberately freeze the first stable snapshot of the day. If KTC refreshes at 11pm UTC with different values, those are not captured. This is the right call for "contemporaneous" semantics, but worth knowing during backtest design.
4. **File size budget.** Rough estimate:
   - ~500 skill-position players × ~12 fields each (averaging ~80 bytes after JSON quoting, including nested projection) ≈ 40 KB.
   - 32 teams × 4 positions × ~6 depth entries × ~80 bytes ≈ 60 KB.
   - File-level wrapper ≈ 0.2 KB.
   - **Total per snapshot ≈ 100 KB uncompressed**, ~20–30 KB gzipped on the wire. A year of daily snapshots is ~35 MB uncompressed in the repo — well within jsDelivr's typical limits and git's comfortable range. No rotation needed for years.
5. **Snapshot effect dep instability.** `playerRowsWithProj` is rebuilt by a `useMemo` upstream; its identity changes whenever the pipeline re-runs. Combined with the idempotency guard this is fine, but it does mean `writeProjectionSnapshot` may be invoked many times per session. Each invocation past the first is an IndexedDB read + same-day-key check + early return. Cheap, but worth flagging.
6. **Scoring basis "custom" hides real changes.** A league whose `rec` is `0.5` but with a `bonus_rec_fd` non-zero shows as `'custom'` and the recorded label loses information. v2 should record the full `scoringSettings` blob if backtests need it; v1 deliberately keeps the file small.

---

## To confirm before implementation

- **Effect location in `App.jsx`.** The implementation session should place the new effect immediately after the `playerRowsWithProj` memo (around line ~932) and verify there is no existing post-pipeline async effect with overlapping deps that would interleave oddly. The existing pattern (cancellation flag, fire-and-forget) is well-established; just confirm placement.
- **`exportData.js` `isLive` permanence check.** Snapshots are written with TTL 999999 minutes. `isLive`'s `TEN_YEARS` heuristic admits them. Confirm no edge case in cache.js's `expiresAt` math truncates ahead of `TEN_YEARS` — at TTL 999999 min, `expiresAt - Date.now() ≈ 1900 years`, comfortably above the threshold.
- **Repo manifest registration UX.** Decision 2 picks the `bin/update.mjs snapshots` subcommand. Confirm with the user before adding a subcommand vs. a one-shot script — both are tiny, and the subcommand keeps the surface uniform. (Defaulting to the subcommand approach in the plan.)
- **`buildTeamDepthChart` requires `playerRows` for richer fields we then discard.** We could call it with `playerRows = []` and still get team/position/depthOrder. Slight perf win but loses the "exclude ghost entries" filter (which relies on `rowById[pid]`). Recommend passing the real `playerRowsWithProj` to keep ghost-filter behaviour intact; document this in `buildTeamDepthChartsBlock`.
- **`selectedLeague` shape.** Confirm `selectedLeague.league_id` is the field name (vs. `leagueId`); per CLAUDE.md's leagueData notes and Sleeper's REST conventions it's `league_id`, but verify in `App.jsx` before relying on it.

---

## Out of scope (v1)

- Any UI that reads or displays snapshot data.
- Backtest logic that joins a past snapshot with realised stats.
- ADP, Vegas, and live injury-report capture.
- Cross-league snapshotting (only the active league is captured).
- Snapshot rotation / retention policy.
- A validator for snapshot files in the data repo (`lib/validate.mjs` untouched).
- Per-player history within a snapshot (each snapshot is a single point-in-time observation).

## Documentation

- App repo `README.md`: under "Cache → data store export" (or wherever `exportAllData` is documented), add a one-paragraph note that `projection-snapshots/<date>` keys are produced once per UTC day by the projection pipeline and ride the export.
- Data repo `README.md`: new "snapshots/<date>.json" subsection under "File schemas" (decision 2 / step 9 above).
