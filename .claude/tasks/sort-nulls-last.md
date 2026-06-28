# Sort: null/missing values always sink to bottom

**Status:** planned  
**Scope:** display-only, no data-pipeline or projection changes  
**Cross-repo impact:** none

---

## Problem statement

Every sortable player table currently has a direction-sensitive null branch:

```js
// CURRENT (bug pattern in PlayersTab + OutlookTab)
if (va == null) return dir     // sinks in asc (+1), floats in desc (-1)
if (vb == null) return -dir    // symmetric
```

When a column is sorted descending (`dir = -1`), null values float to the top because they return `-dir = +1`... wait, no. When `dir = -1`:
- `if (va == null) return dir` returns `-1`, meaning `a` sorts before `b` → null `a` goes to the top
- `if (vb == null) return -dir` returns `+1`, meaning null `b` also goes to the top

So in descending order, null values float to the top of the table, outranking the highest real value. In ascending order the coincidental behavior is correct (null sinks). This is the reported bug.

**Correct mechanism:** the null/non-null branch must return a fixed value independent of direction:
```js
// CORRECT
if (va == null) return 1    // a always sinks, regardless of dir
if (vb == null) return -1   // b always sinks, regardless of dir
// only non-null vs non-null comparison is direction-sensitive:
return dir * (va - vb)
```

---

## Implementations in scope

### 1. Explorer (PlayersTab) — `src/components/PlayersTab.jsx`

**Sort function location:** anonymous comparator inside the `displayRows` useMemo, lines 1952–1964  
**Sort state:** `sortState` / `sortAsc` (via `sortState.direction === 'asc'`), persisted to `localStorage['explorer-sort']`  
**Sort column changed by:** `handleSort` at line 1861  
**Position-tab default sort:** `defaultSortForPosition(pos)` at line 1537 — ALL → `currentSeasonPPG` desc; specific position → `recentRank` asc

Current comparator (lines 1952–1964):
```js
const dir = sortAsc ? 1 : -1
return [...rows].sort((a, b) => {
  if (sortKey === 'trend')
    return dir * ((TREND_ORDER[a.trend] ?? 3) - (TREND_ORDER[b.trend] ?? 3))
  if (sortKey === 'dynastyScore')
    return dir * ((OUTLOOK_ORDER[a.dynastyScore?.label] ?? 99) - (OUTLOOK_ORDER[b.dynastyScore?.label] ?? 99))
  const va = a[sortKey], vb = b[sortKey]
  if (va == null && vb == null) return 0
  if (va == null) return dir      // BUG
  if (vb == null) return -dir     // BUG
  if (typeof va === 'string') return dir * va.localeCompare(vb)
  return dir * (va - vb)
})
```

**Nullable columns exposed by SortTh headers (lines 2043–2065):**
| Column key | Nullable? | Notes |
|---|---|---|
| `recentRank` | yes | null for Limited Data players (no qualifying season) |
| `full_name` | no | always a string |
| `currentSeasonPPG` | no | 0 for no data, not null |
| `projectedPPG` | yes | null for some players |
| `ceilingRank` | yes | null if player has no qualifying season records |
| `floorRank` | yes | same |
| `dynastyScore` (label) | yes | null/undefined for players with no computed score |
| `ktcValue` | yes | null for many players lacking KTC data |
| `ownerTeamName` | yes | null for free agents |

**Special branches:**
- `trend` (line 1953): dead branch — no `col="trend"` SortTh in the current table. The ordinal (`TREND_ORDER[a.trend] ?? 3`) conflates null trend with 'insufficient'. Fix anyway for correctness; does not affect any live user path.
- `dynastyScore` (line 1956): ordinal from `OUTLOOK_ORDER`. The `?? 99` sentinel works correctly in ascending order but floats null to top in descending. Additionally, the label 'N/A' (when `dynastyScore.confidence === 'none'`) is a real defined string not in `OUTLOOK_ORDER`, so it also gets ordinal 99 — this is pre-existing behavior for non-null rows and must be preserved.

### 2. OutlookTab — `src/components/players/OutlookTab.jsx`

**Sort function location:** anonymous comparator inside `displayRows` useMemo, lines 134–157  
**Sort state:** from `usePlayersTable({ storageKey: 'outlook-sort', defaultSort: DEFAULT_SORT })` where `DEFAULT_SORT = { column: 'projectedPPG', direction: 'desc' }`

Current comparator (lines 134–157):
```js
const dir = sortState.direction === 'asc' ? 1 : -1
return [...rows].sort((a, b) => {
  const key = sortState.column
  if (key === '_snapTrend' || key === '_oppTrend') {
    const va = a[key]?.delta ?? null
    const vb = b[key]?.delta ?? null
    if (va == null && vb == null) return 0
    if (va == null) return dir      // BUG
    if (vb == null) return -dir     // BUG
    return dir * (va - vb)
  }
  if (key === '_role') {
    const va = ROLE_ORDER[a._role] ?? 99
    const vb = ROLE_ORDER[b._role] ?? 99
    return dir * (va - vb)          // BUG: null _role gets 99, floats in desc
  }
  const va = a[key], vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return dir      // BUG
  if (vb == null) return -dir     // BUG
  if (typeof va === 'string') return dir * va.localeCompare(vb)
  return dir * (va - vb)
})
```

**Nullable columns:**
| Column key | Nullable? | Notes |
|---|---|---|
| `full_name` | no | always a string |
| `projectedPPG` | yes | null for some players |
| `_snapTrend` (delta) | yes | null for QB and players with <2 snap seasons |
| `_oppTrend` (delta) | yes | null for players with insufficient share history |
| `_role` | yes | null for QB, or when snap%/share is absent |

**Special branches:**
- `_snapTrend`/`_oppTrend` (lines 137–143): reads `?.delta ?? null`, already yields null correctly. Bug is in the `dir`/`-dir` branch.
- `_role` (lines 145–149): `ROLE_ORDER[a._role] ?? 99` conflates null `_role` with an unmapped string. Fix: propagate null explicitly when `a._role` is null/undefined, so `compareNullsLast` can sink it.

### 3. NflStatsTab — `src/components/players/NflStatsTab.jsx`

**Sort function location:** anonymous comparator inside `displayRows` useMemo, lines 248–266  
**Already correct** — explicitly uses `return 1` / `return -1` for null cases, independent of `dir`. The comment at line 262 even states "null sinks regardless of direction".

This tab should be updated to use `compareNullsLast` for unification, so the rule can't drift between implementations.

Current comparator:
```js
const dir = sortState.direction === 'asc' ? 1 : -1
return [...rows].sort((a, b) => {
  const key = sortState.column
  if (key === 'full_name') {
    const va = a.full_name ?? ''
    const vb = b.full_name ?? ''
    return dir * va.localeCompare(vb)
  }
  const va = a._avg[key] ?? null
  const vb = b._avg[key] ?? null
  if (va == null && vb == null) return 0
  if (va == null) return 1   // null sinks regardless of direction
  if (vb == null) return -1
  return dir * (va - vb)
})
```

**Nullable columns:** `_avg[key]` for any position stat is null when the player has no data for that season.

---

## Shared helper

Create `src/utils/sortUtils.js`:

```js
/**
 * Null-safe table sort comparator.
 *
 * null/undefined/NaN always sorts to the bottom (after all real values)
 * regardless of the ascending/descending direction multiplier. The direction
 * flip is applied ONLY to the non-null vs non-null comparison branch.
 *
 * Design note: the null/non-null branch returns a constant (1 or -1), never
 * `dir` or `-dir`. Multiplying by `dir` would make nulls float when descending.
 *
 * @param {*}      va   value from row a
 * @param {*}      vb   value from row b
 * @param {number} dir  1 for ascending, -1 for descending
 * @returns {number}    negative = a before b, positive = a after b, 0 = equal
 */
export function compareNullsLast(va, vb, dir) {
  const aNullish = va == null || (typeof va === 'number' && isNaN(va))
  const bNullish = vb == null || (typeof vb === 'number' && isNaN(vb))
  if (aNullish && bNullish) return 0
  if (aNullish) return 1    // a sinks, regardless of dir
  if (bNullish) return -1   // b sinks, regardless of dir
  if (typeof va === 'string') return dir * va.localeCompare(vb)
  return dir * (va - vb)
}
```

**Why NaN?** `a == null` does not catch `NaN`. NaN can arise if arithmetic is done on an undefined numeric field upstream. Checking `typeof va === 'number' && isNaN(va)` is cheap and defensive.

---

## Step sequence

### Step 1 — Create `src/utils/sortUtils.js`
New file. Export one function: `compareNullsLast(va, vb, dir)`. See signature and body above.

No imports. Pure function. No side effects.

### Step 2 — Create `src/utils/sortUtils.test.js`
See "Tests to add" section below.

### Step 3 — Edit `src/components/PlayersTab.jsx`
**Import:** add `import { compareNullsLast } from '../utils/sortUtils'` at the top of the file (near the other utils imports, around lines 7–9).

**Edit the comparator at lines 1952–1964.** Replace the entire `.sort(...)` callback:

```js
// BEFORE (lines 1952–1964):
const dir = sortAsc ? 1 : -1
return [...rows].sort((a, b) => {
  if (sortKey === 'trend')
    return dir * ((TREND_ORDER[a.trend] ?? 3) - (TREND_ORDER[b.trend] ?? 3))
  if (sortKey === 'dynastyScore')
    return dir * ((OUTLOOK_ORDER[a.dynastyScore?.label] ?? 99) - (OUTLOOK_ORDER[b.dynastyScore?.label] ?? 99))
  const va = a[sortKey], vb = b[sortKey]
  if (va == null && vb == null) return 0
  if (va == null) return dir
  if (vb == null) return -dir
  if (typeof va === 'string') return dir * va.localeCompare(vb)
  return dir * (va - vb)
})

// AFTER:
const dir = sortAsc ? 1 : -1
return [...rows].sort((a, b) => {
  if (sortKey === 'trend') {
    const oa = a.trend != null ? (TREND_ORDER[a.trend] ?? 3) : null
    const ob = b.trend != null ? (TREND_ORDER[b.trend] ?? 3) : null
    return compareNullsLast(oa, ob, dir)
  }
  if (sortKey === 'dynastyScore') {
    const oa = a.dynastyScore?.label != null ? (OUTLOOK_ORDER[a.dynastyScore.label] ?? 99) : null
    const ob = b.dynastyScore?.label != null ? (OUTLOOK_ORDER[b.dynastyScore.label] ?? 99) : null
    return compareNullsLast(oa, ob, dir)
  }
  return compareNullsLast(a[sortKey], b[sortKey], dir)
})
```

**Key points:**
- `trend` branch: `a.trend != null` distinguishes a truly missing trend from 'insufficient' (ordinal 3). Real 'insufficient' stays in position; missing trend sinks.
- `dynastyScore` branch: `a.dynastyScore?.label != null` distinguishes null/undefined from any defined label (including 'N/A', which is a real value and keeps its ordinal 99 — pre-existing behavior preserved).
- Generic path collapses to one `compareNullsLast` call; string/number dispatch happens inside the helper.

### Step 4 — Edit `src/components/players/OutlookTab.jsx`
**Import:** add `import { compareNullsLast } from '../../utils/sortUtils'` near the top (after the existing imports, around lines 1–7).

**Edit the comparator at lines 134–157:**

```js
// BEFORE:
const dir = sortState.direction === 'asc' ? 1 : -1
return [...rows].sort((a, b) => {
  const key = sortState.column
  if (key === '_snapTrend' || key === '_oppTrend') {
    const va = a[key]?.delta ?? null
    const vb = b[key]?.delta ?? null
    if (va == null && vb == null) return 0
    if (va == null) return dir
    if (vb == null) return -dir
    return dir * (va - vb)
  }
  if (key === '_role') {
    const va = ROLE_ORDER[a._role] ?? 99
    const vb = ROLE_ORDER[b._role] ?? 99
    return dir * (va - vb)
  }
  const va = a[key], vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return dir
  if (vb == null) return -dir
  if (typeof va === 'string') return dir * va.localeCompare(vb)
  return dir * (va - vb)
})

// AFTER:
const dir = sortState.direction === 'asc' ? 1 : -1
return [...rows].sort((a, b) => {
  const key = sortState.column
  if (key === '_snapTrend' || key === '_oppTrend')
    return compareNullsLast(a[key]?.delta ?? null, b[key]?.delta ?? null, dir)
  if (key === '_role') {
    const oa = a._role != null ? (ROLE_ORDER[a._role] ?? 99) : null
    const ob = b._role != null ? (ROLE_ORDER[b._role] ?? 99) : null
    return compareNullsLast(oa, ob, dir)
  }
  return compareNullsLast(a[key], b[key], dir)
})
```

**Key points:**
- `_snapTrend`/`_oppTrend`: the `?.delta ?? null` correctly yields null when the trend object is absent; pass directly to the helper.
- `_role`: `a._role != null` distinguishes null QB role from a defined role string not in `ROLE_ORDER` (unlikely in practice, but safe). Null QB roles sink; any other defined role string gets ordinal 99 (pre-existing).
- Generic path: same as PlayersTab — one call, string/number dispatch inside the helper.

### Step 5 — Edit `src/components/players/NflStatsTab.jsx`
**Import:** add `import { compareNullsLast } from '../../utils/sortUtils'` near the top (after the existing imports, around lines 1–7).

**Edit the comparator at lines 248–266:**

```js
// BEFORE:
const dir = sortState.direction === 'asc' ? 1 : -1
return [...rows].sort((a, b) => {
  const key = sortState.column
  if (key === 'full_name') {
    const va = a.full_name ?? ''
    const vb = b.full_name ?? ''
    return dir * va.localeCompare(vb)
  }
  const va = a._avg[key] ?? null
  const vb = b._avg[key] ?? null
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  return dir * (va - vb)
})

// AFTER:
const dir = sortState.direction === 'asc' ? 1 : -1
return [...rows].sort((a, b) => {
  const key = sortState.column
  if (key === 'full_name') return compareNullsLast(a.full_name, b.full_name, dir)
  return compareNullsLast(a._avg[key] ?? null, b._avg[key] ?? null, dir)
})
```

**Key points:**
- Behavior is unchanged (NflStatsTab was already correct). This change is unification only.
- `a.full_name` is never null in practice; `compareNullsLast` handles it safely even if it were.
- The `?? ''` fallback on full_name is dropped: `compareNullsLast` sinks null names rather than treating them as `''`. Since full_name is never null, there is no behavioral difference.
- The `?? null` on `a._avg[key]` is retained because `_avg` may return `undefined` for keys with no data; `compareNullsLast`'s `== null` check catches both `undefined` and `null`, so this is technically redundant but kept for clarity.

### Step 6 — Update `docs/ui.md` and `CLAUDE.md`
See "Docs updates" section below.

---

## Behavioral change summary (intended, not a regression)

| Scenario | Before | After |
|---|---|---|
| Sort desc, null PPG | floats to top | sinks to bottom ✓ |
| Sort asc, null rank | sinks to bottom | sinks to bottom (unchanged) |
| Sort desc, null rank | floats to top | sinks to bottom ✓ |
| Sort desc, null KTC | floats to top | sinks to bottom ✓ |
| Sort desc, null owner | floats to top | sinks to bottom ✓ |
| Sort desc, null Outlook trend | floats to top | sinks to bottom ✓ |
| Sort desc, null _role (QB) | floats to top | sinks to bottom ✓ |
| Default asc rank view (specific pos tab) | Limited Data players sink below rank-1 ✓ | unchanged ✓ |
| Non-null row relative order | baseline | unchanged ✓ |

The default ascending rank view already puts Limited Data players (null `recentRank`) at the bottom — this was coincidentally correct and remains correct after the fix.

---

## Docs updates

### `docs/ui.md` — Sort persistence section (around line 109)

Add one sentence to the end of the "Sort persistence" block:

**Before:**
```
**Default sort per position tab:** ALL → PPG descending; any specific position → Recent rank ascending.

**Sorting:** click any column header; click again to reverse.
```

**After:**
```
**Default sort per position tab:** ALL → PPG descending; any specific position → Recent rank ascending.

**Sorting:** click any column header; click again to reverse. Null/missing values always sort to the bottom regardless of direction.
```

### `CLAUDE.md` — src/utils/ table

Add a row for `sortUtils.js` to the `src/utils/` table. Place it alphabetically (after `seasonRanks.js`, before `teamChange` area — there is no `teamChange.js` exported module, only a test):

```
| `sortUtils.js` | `compareNullsLast(va, vb, dir)` — direction-independent null-sink comparator used by all three Players table sort paths (Explorer, Outlook, NFL stats) |
```

No other docs files need updating. The sort behavior is not documented in `docs/architecture.md`, `docs/dynasty-scoring.md`, `docs/projection.md`, or `docs/signal-registry.md`.

---

## Tests to add

### File: `src/utils/sortUtils.test.js` (co-located unit test)

```js
import { describe, it, expect } from 'vitest'
import { compareNullsLast } from './sortUtils'

describe('compareNullsLast', () => {
  // null/undefined nullish detection
  it('null vs null → 0', () => expect(compareNullsLast(null, null, 1)).toBe(0))
  it('undefined vs undefined → 0', () => expect(compareNullsLast(undefined, undefined, 1)).toBe(0))
  it('null vs null desc → 0', () => expect(compareNullsLast(null, null, -1)).toBe(0))

  // NaN nullish detection
  it('NaN vs NaN → 0', () => expect(compareNullsLast(NaN, NaN, 1)).toBe(0))
  it('NaN vs number → sinks (> 0) asc', () => expect(compareNullsLast(NaN, 5, 1)).toBeGreaterThan(0))
  it('NaN vs number → sinks (> 0) desc (key test — fails without NaN guard)', () => {
    expect(compareNullsLast(NaN, 5, -1)).toBeGreaterThan(0)
  })
  it('number vs NaN → -1', () => expect(compareNullsLast(5, NaN, 1)).toBeLessThan(0))

  // THE CORE BUG TEST: null must sink in both directions
  it('null vs number → sinks (> 0) ascending', () => {
    expect(compareNullsLast(null, 5, 1)).toBeGreaterThan(0)
  })
  it('null vs number → sinks (> 0) descending — would fail with `return dir` bug', () => {
    expect(compareNullsLast(null, 5, -1)).toBeGreaterThan(0)
  })
  it('number vs null → rises (< 0) ascending', () => {
    expect(compareNullsLast(5, null, 1)).toBeLessThan(0)
  })
  it('number vs null → rises (< 0) descending — would fail with `return -dir` bug', () => {
    expect(compareNullsLast(5, null, -1)).toBeLessThan(0)
  })
  it('undefined vs number → sinks (> 0) descending', () => {
    expect(compareNullsLast(undefined, 3, -1)).toBeGreaterThan(0)
  })

  // Numeric non-null comparison is direction-sensitive
  it('1 vs 2 ascending → negative (1 before 2)', () => {
    expect(compareNullsLast(1, 2, 1)).toBeLessThan(0)
  })
  it('1 vs 2 descending → positive (2 before 1)', () => {
    expect(compareNullsLast(1, 2, -1)).toBeGreaterThan(0)
  })
  it('equal numbers → 0', () => expect(compareNullsLast(5, 5, 1)).toBe(0))

  // String comparison is direction-sensitive
  it('string "a" vs "b" ascending → negative', () => {
    expect(compareNullsLast('a', 'b', 1)).toBeLessThan(0)
  })
  it('string "a" vs "b" descending → positive', () => {
    expect(compareNullsLast('a', 'b', -1)).toBeGreaterThan(0)
  })
  it('null vs string → sinks (> 0) descending', () => {
    expect(compareNullsLast(null, 'Mahomes', -1)).toBeGreaterThan(0)
  })
})
```

**Edge cases covered:**
- Both null → 0 (no NaN from arithmetic)
- NaN treated as nullish (not caught by `== null`)
- Core directional invariant: `compareNullsLast(null, X, -1)` must be `> 0` (this is the bug case)
- String dispatch is direction-sensitive
- Numeric dispatch is direction-sensitive

No additional integration tests are required. Both PlayersTab and OutlookTab sort pipelines are `useMemo` callbacks inside the component; their correctness flows entirely from `compareNullsLast`. The existing `usePlayersTable.test.js` tests cover sort-state mechanics (toggle, persistence, reset) and do not need updating.

---

## Cross-repo impact

**None.** This change is purely display-side comparator logic inside `useMemo` sort pipelines. No playerRows pipeline fields, projection values, dynasty scores, data shapes, API calls, snapshot contracts, or manifest entries are affected. The data-repo (`sleeper-dashboard-data`) requires no changes.

---

## Risks and notes

1. **`trend` sort is dead code** in PlayersTab (no SortTh with `col="trend"` exists in the current table). The fix is included for correctness and to eliminate a future footgun if the column is ever added. Behavioral change from fixing it: null trend sinks instead of being treated as 'insufficient' (ordinal 3). This is unreachable in the live UI.

2. **`dynastyScore` descending sort** is not a user-accessible default (the column defaults to ascending on first click), but a user who clicks the Dynasty header twice will currently see null-labeled players float to the top. After fix: they sink.

3. **NflStatsTab `full_name` branch** drops the `?? ''` fallback. Since `full_name` is always a non-null string in `playerRows`, there is no behavioral difference. If a row with a null `full_name` were ever introduced, the new behavior (sink to bottom) is better than the old (treat as empty string, sort first in ascending).

4. **`ROLE_ORDER` ordinal 99** for unknown role strings is preserved as a real value, not treated as null. If `classifyRole` ever returns an unexpected string, it will sort after all known roles in ascending order (ordinal 99 > 3), and before all known roles in descending order. This is a pre-existing quirk that the fix does not change for non-null values.
