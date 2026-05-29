# Task: 2-year inactivity rule for Player Explorer

## Goal

Tighten the `isRelevantPlayer` filter so players who haven't played in the last 2 NFL seasons are excluded, unless they are currently on an NFL team **and** present in KTC. Rookies and rostered players remain unconditionally included. The current 1-season lookback lets recently-retired players (e.g. veterans who sat out last year but were on a roster spot in Sleeper's `playerMap`) leak into the table.

## Current state (read before editing)

### Where `isRelevantPlayer` lives

- **File:** `src/App.jsx`
- **Defined:** inline function inside the `playerRows` useMemo, lines **698–720**
- **Called:** line **722** as `rows.filter(isRelevantPlayer)`
- It is a closure over the useMemo's scope — it reads `leagueData`, `careerStats`, `ktcMap`, `mostRecentSeason` directly without parameters

### Candidate pool sources (lines 605–621)

The `playerIdSet` is built from three sources in order:

1. **Every player_id in every season of `careerStats`** — `for (const seasonData of Object.values(careerStats)) for (const id of Object.keys(seasonData))` (lines 606–609)
2. **Every player_id in `ownerMap`** (every rostered player across all fantasy teams, built at line 598–601 from `leagueData.rosterTeams`) — line 610
3. **Active skill-position rookies with no career stats** — `years_exp === 0`, position in `['QB','RB','WR','TE']`, status in `['Active', 'Injured_Reserve', 'Free Agent']` (lines 613–621)

After the set is built, line 627 hard-filters to skill positions (`QB/RB/WR/TE`).

### How `rosteredIds` is derived

- **Built:** line **1008** during the league-load `useEffect`:
  ```js
  const rosteredIds = new Set(rosters.flatMap(r => r.players ?? []))
  ```
- **Stored on:** `leagueData.rosteredIds` (line 1028)
- **Used inside `isRelevantPlayer`:** `leagueData.rosteredIds.has(row.player_id)` at line 708

Note: `rosteredIds` and `ownerMap` cover similar ground but differ — `rosteredIds` is a flat Set of player IDs from `roster.players[]` (the full roster including taxi/IR). `ownerMap` is derived from the assembled `rosterTeams[].{starters, bench, reserve}` arrays. For the filter, `rosteredIds` is the authoritative "is on a fantasy roster" signal.

### How `careerStats` and `ktcMap` are in scope

Both are top-level component state in `App()`:
- `careerStats` — populated by the career history loader, captured by the useMemo's closure
- `ktcMap` — populated by the KTC fetch effect, captured by the useMemo's closure

Both are already declared in the useMemo dependency array at line **736**:
```js
}, [careerStats, leagueData, empiricalCurves, positionPeakPPG, ktcMap, teamContext, depthMap, historicalShares])
```

No changes needed to dependencies.

### Current filter conditions (evaluated in order, first match wins)

| # | Condition | Result |
|---|---|---|
| 1 | Ghost: no age (or age 0), no team, no years_exp, no full_name | **exclude** |
| 2 | `leagueData.rosteredIds.has(player_id)` | **include** |
| 3 | `years_exp === 0 && age > 0` | **include** (rookie with known age) |
| 4 | `nfl_team` set and not `'FA'` | **include** |
| 5 | `ktcMap?.has(player_id)` | **include** |
| 6 | `gamesPlayed > 0` in `mostRecentSeason` OR `mostRecentSeason - 1` | **include** |
| 7 | (default) | **exclude** |

The leak: rules 4 and 5 each independently keep players. A retired veteran whose `team` field still has an old value (or who lingers in KTC) gets through even with zero recent games.

## Proposed changes

### New filter conditions (evaluated in order)

| # | Condition | Result |
|---|---|---|
| 1 | Ghost: no age (or age 0), no team, no years_exp, no full_name | **exclude** |
| 2 | `leagueData.rosteredIds.has(player_id)` | **include** (rostered always wins) |
| 3 | `years_exp === 0 && age > 0` | **include** (rookie with known age) |
| 4 | `gamesPlayed > 0` in any of the last 2 seasons (`mostRecentSeason`, `mostRecentSeason - 1`) | **include** |
| 5 | `nfl_team` set and not `'FA'` **AND** `ktcMap?.has(player_id)` | **include** (active-and-market-known exception) |
| 6 | (default) | **exclude** |

Key differences from current:
- Old rules 4 and 5 (on NFL team alone, in KTC alone) are removed.
- New rule 5 combines both signals with `AND` — a player must be on an NFL team **and** in KTC to bypass the activity check.
- The activity window stays at 2 seasons (`mostRecentSeason` and `mostRecentSeason - 1`), which already exists at lines 714–716 — no change to the lookback.

### Helper function

Extract the activity check into a small inline helper inside the useMemo (above `isRelevantPlayer`, so it sits in the same closure scope):

```js
// True if player has gamesPlayed > 0 in any of the last `lookback` seasons.
function playedRecently(playerId, lookback = 2) {
  for (let i = 0; i < lookback; i++) {
    const season = mostRecentSeason - i
    if ((careerStats[season]?.[playerId]?.gamesPlayed ?? 0) > 0) return true
  }
  return false
}
```

Keep it inline rather than module-scope — it depends on `careerStats` and `mostRecentSeason` from the closure, and only this useMemo uses it.

### Updated `isRelevantPlayer`

Replace the function body at lines **698–720** with:

```js
function isRelevantPlayer(row) {
  // 1. Ghost entry — no meaningful identity data
  const info = leagueData.playerMap[row.player_id] ?? {}
  if (
    (!info.age || info.age === 0) &&
    !info.team &&
    !info.years_exp &&
    !info.full_name
  ) return false

  // 2. Rostered players are always relevant
  if (leagueData.rosteredIds.has(row.player_id)) return true

  // 3. Current rookies with a known age are always relevant
  if (row.years_exp === 0 && row.age && row.age > 0) return true

  // 4. Played in any of the last 2 seasons
  if (playedRecently(row.player_id, 2)) return true

  // 5. Exception: on an active NFL team AND tracked by KTC
  //    (catches offseason free agents the market still values)
  const onNflTeam = row.nfl_team && row.nfl_team !== 'FA'
  const inKtc = ktcMap?.has(row.player_id) ?? false
  if (onNflTeam && inKtc) return true

  return false
}
```

### Diagnostic log

The existing `console.log` at line 723 stays useful — keep it as-is. Optionally extend it to log a sample of excluded players' names for tuning:

```js
const filteredRows = rows.filter(isRelevantPlayer)
const excluded = rows.filter(r => !isRelevantPlayer(r))
console.log('[players] Before filter:', rows.length, '→ After filter:', filteredRows.length,
            '· excluded:', excluded.length)
if (excluded.length > 0 && excluded.length < 30) {
  console.log('[players] Excluded sample:', excluded.slice(0, 10).map(r => `${r.full_name} (${r.position})`))
}
```

This is optional — include only if comfortable with the diagnostic noise. Drop if not.

## Files to modify

- **`src/App.jsx`** — single-file change. Only the `playerRows` useMemo body (specifically lines 694–723) is affected.

## Files to create

None.

## Function signatures

```js
// New helper, declared inside the `playerRows` useMemo, above isRelevantPlayer
function playedRecently(playerId: string, lookback?: number = 2): boolean

// Existing function, body replaced
function isRelevantPlayer(row: PlayerRow): boolean
```

`PlayerRow` is the shape pushed at lines 676–691: `{ player_id, full_name, position, nfl_team, age, years_exp, ownerTeamName, currentSeasonPPG, ... }`.

## Integration points

- No change to the candidate pool (lines 605–621) — the pool intentionally over-includes; the filter does the trimming.
- No change to the useMemo dependency array (line 736) — all signals consumed (`careerStats`, `leagueData`, `ktcMap`) are already declared.
- No change to downstream pipeline (`playerRowsWithKTC`, `playerRowsFinal`, ranks, projections) — they all operate on whatever `playerRows` returns and don't care about filter logic.

## Acceptance criteria

- [ ] `isRelevantPlayer` matches the 6-rule table above; old rules 4 and 5 are gone, replaced by combined rule 5.
- [ ] `playedRecently(playerId, lookback)` helper exists inside the `playerRows` useMemo.
- [ ] Rostered players (any player in `leagueData.rosteredIds`) appear in the Explorer regardless of activity.
- [ ] Rookies (`years_exp === 0`, `age > 0`) appear in the Explorer regardless of stats.
- [ ] A player with no games in the last 2 seasons, on an NFL team but **not** in KTC, is **excluded**.
- [ ] A player with no games in the last 2 seasons, in KTC but **not** on an NFL team, is **excluded**.
- [ ] A player with no games in the last 2 seasons, on an NFL team **and** in KTC, is **included**.
- [ ] A player who played in `mostRecentSeason - 1` but not `mostRecentSeason` is **included**.
- [ ] Build passes: `npm run build` with no new warnings.
- [ ] Manual smoke test: open Explorer with no filters, scroll the QB tab — no obvious retirees (Brady, Ryan, Rivers, Rodgers if retired, etc.) appear.

## Out of scope

- Do not change the candidate pool logic (lines 605–621). It intentionally over-collects; the filter is the gate.
- Do not change `rosteredIds` derivation (line 1008).
- Do not refactor the useMemo into a custom hook or extract helpers to a util file. This is a one-file change.
- Do not adjust the activity lookback window beyond 2 seasons.
- Do not modify `playerRowsWithKTC` / `playerRowsFinal` / ranks pipeline.

## Documentation

Update `README.md`:

- Section: **"Relevance filter (`isRelevantPlayer`)"** (currently around lines 169–183 of README).
- Replace the table with the new 6-rule table from this task.
- Update the prose explanation to reflect the AND-combined NFL team + KTC exception and the 2-season activity window.

## Open questions

1. Should the 2-season window include the current in-progress season (when one is live) or only completed seasons? Current code uses `mostRecentSeason` from `Object.keys(careerStats).sort()`, which is whatever the career loader has populated — typically the last completed season during offseason. Recommend keeping the existing semantics; this matches today's offseason state.
2. Should the optional diagnostic excluded-sample log ship, or stay out? Recommend ship for one round, then remove in a follow-up.
