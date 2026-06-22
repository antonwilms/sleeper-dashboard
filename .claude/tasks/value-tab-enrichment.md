# Value-tab enrichment — Ceiling/Floor seasons + KTC Δ (Players → Dynasty → Value)

**Model for implementation:** sonnet. Read this file first; implement exactly what it
specifies; run the done-definition. If anything is ambiguous or contradicts live code,
stop and ask — do not guess. Reference (don't relist) CLAUDE.md invariants.

**Scope:** enrich the **Value tab only** (the Explorer / `PlayersTab`). Do not touch
the Outlook / NFL-stats / Weekly placeholders or `PlayersSurface` tab logic. Pure
**display-only** enrichment — it must never feed the projection pipeline or dynasty
score (same rule as advstats; see CLAUDE.md → *Advstats are display-only*). Do **not**
build the buy/sell "Signal" column (deferred marginal-value engine). Keep
filter/sort/preset/comparison/profile-panel behavior intact.

---

## 0. Research conclusions (resolved against live source + cached/served data)

**Q1 — Does a "positional-rank average" reference exist, or must it be derived?**
It must be **derived**. `positionPeakPPG` (`dynastyScore.js:91-127`) is a single peak
PPG per position `{QB,RB,WR,TE}` — not a per-rank average. The served season-totals
file carries a raw `stats.pos_rank_ppr` per player
(`src/__fixtures__/season-totals-2025.json`), **but it is PPR-fixed** and the app
deliberately ranks by **league-scored PPG** (see `historicalRanks`,
`usePlayerProfile.js:74-87`). So do **not** use `pos_rank_ppr`. The reference is
derivable app-side from the in-memory `careerStats`
(`{ [season]: { [playerId]: { fantasyPoints, gamesPlayed, … } } }`): for each
(position, rank), average the season **total fantasyPoints** of the players who
finished at that rank, across seasons.

**Q2 — Cross-repo determinant.** The pos-rank reference is computed **app-side from
already-served career/season data** → **Cross-repo impact: none.** No new precomputed
table from the data repo is required. (See §9.)

**Q3 — Is banked KTC snapshot history consumable?** **Yes.** `loadKtcHistory`
(`ktcHistory.js:84`) already loads a window of `ktc/snapshot-YYYY-MM-DD.json` files
(`WINDOW_SIZE=8`, `MIN_SPACING_DAYS=5` → ~40-day span) into App.jsx state `ktcHistory`
(`App.jsx:156,243-244`), producing `ktcHistory.series[playerId] = [{ date, value,
positionRank, valueVsPosMedian }]` ascending. It is currently threaded only to the
projection memo (`App.jsx:517`), **not** to `PlayersTab`. So the 30-day Δ is in-scope:
**no new loader** — just thread the existing prop + add a pure delta helper. Renders
only when ≥2 snapshots exist for the player (graceful null otherwise).

**Ranking basis vs magnitude basis (the insight).** Rank is by **PPG** (reuse
existing). Displayed points + the reference are **season total fantasyPoints**. A
top-PPG season cut short by injury has fewer total points than the typical finisher at
that rank → **negative delta** (injury-deflated). A genuinely strong full season →
**positive delta**. This rate-vs-volume mismatch is deliberate and is the entire
signal.

---

## 1. End state

Two new **additive** Explorer columns (9 → **11**), placed after **Career**:

`… | Proj | Career | `**`Ceiling`**` | `**`Floor`**` | Dynasty | KTC | Owner`

- **Ceiling** = the player's best (lowest-number) career positional finish.
  **Floor** = the worst (highest-number). Each is a compact stacked cell:
  - **top line:** `PosRankBadge` (`WR1`) + season year (`2023`)
  - **bottom line:** that season's total fantasy points + a signed delta vs the
    rank's average, colored up/down/neutral (e.g. `342  +18`, green).
- Both columns are **sortable** by rank (consistent with existing column-sort).
- **KTC cell** gains a signed, colored ~30-day Δ beneath the value (annotation only —
  the KTC column still sorts by value, not Δ).
- All graceful-empty: single-season players, players with no qualifying season, and
  missing references render the Explorer's `—` convention; never NaN, never a crash.

---

## 2. Architecture decision — compute in the VIEW layer, not the pipeline

Ceiling/Floor is derived in **`PlayersTab` via `useMemo`** from its existing
`careerStats` + `playerMap` props, using a new pure util (`seasonRanks.js`). It is
**not** added to the `playerRows` pipeline (App.jsx). Rationale: keeps it cleanly
display-only (mirrors `AdvancedStatsPanel`), leaves the load-bearing pipeline
untouched (CLAUDE.md → *playerRows pipeline order is load-bearing*), and the per-rank
reference needs a one-time global aggregation that doesn't fit the per-player `.map`.
KTC Δ is likewise derived in `PlayersTab` from the threaded `ktcHistory` prop.

---

## 3. File-by-file edits

### 3a. `src/utils/seasonRanks.js` (NEW — pure leaf module, imports nothing)

Three exports. `rankPositionSeason` is the **verbatim extraction** of the ranking in
`usePlayerProfile.js:79-84` (same filter, same `fantasyPoints/gamesPlayed`, same
desc sort, same 1-based rank) — this is the "reuse, do not re-derive" the task
requires; repo precedent for extract-for-reuse: `ageCurve.js`,
`teamContext.applyQBQualityModifier`.

```js
// Ranks players of `position` within ONE season by league-scored PPG
// (fantasyPoints/gamesPlayed), descending; gamesPlayed>0 only.
// Returns Map<playerId, { rank, points, ppg }>  (rank is 1-based).
export function rankPositionSeason(seasonData, playersMap, position) {
  const peers = Object.entries(seasonData)
    .filter(([id, d]) => playersMap?.[id]?.position === position && d.gamesPlayed > 0)
    .map(([id, d]) => ({ id, ppg: d.fantasyPoints / d.gamesPlayed, points: d.fantasyPoints }))
    .sort((a, b) => b.ppg - a.ppg)
  const out = new Map()
  peers.forEach((p, i) => out.set(p.id, { rank: i + 1, points: p.points, ppg: p.ppg }))
  return out
}

// Global pass over careerStats. Returns:
//   ranksByPlayer: Map<playerId, Array<{ season:number, rank:number, points:number }>>
//   refByPosRank:  { [position]: { [rank:number]: number } }  // avg total points at that finish
export function buildSeasonPositionRanks(careerStats, playersMap) {
  const ranksByPlayer = new Map()
  const acc = {}                                  // pos -> rank -> { sum, n }
  for (const [seasonStr, seasonData] of Object.entries(careerStats || {})) {
    const season = Number(seasonStr)
    const positions = new Set()
    for (const id of Object.keys(seasonData)) {
      const pos = playersMap?.[id]?.position
      if (pos) positions.add(pos)
    }
    for (const pos of positions) {
      for (const [id, { rank, points }] of rankPositionSeason(seasonData, playersMap, pos)) {
        if (!ranksByPlayer.has(id)) ranksByPlayer.set(id, [])
        ranksByPlayer.get(id).push({ season, rank, points })
        acc[pos] ??= {}
        acc[pos][rank] ??= { sum: 0, n: 0 }
        acc[pos][rank].sum += points
        acc[pos][rank].n   += 1
      }
    }
  }
  const refByPosRank = {}
  for (const [pos, byRank] of Object.entries(acc)) {
    refByPosRank[pos] = {}
    for (const [rank, { sum, n }] of Object.entries(byRank)) refByPosRank[pos][rank] = sum / n
  }
  return { ranksByPlayer, refByPosRank }
}

// Picks ceiling (best/min rank) and floor (worst/max rank) from one player's
// season list and decorates with the per-rank reference delta.
// Tie rule: ceiling tie -> higher points (best version); floor tie -> lower points.
// Returns { ceiling, floor } | null. Each season:
//   { season, rank, points, refAvg:number|null, delta:number|null }
export function computeCeilingFloor(playerSeasons, position, refByPosRank) {
  if (!playerSeasons || playerSeasons.length === 0) return null
  let ceiling = playerSeasons[0], floor = playerSeasons[0]
  for (const s of playerSeasons) {
    if (s.rank < ceiling.rank || (s.rank === ceiling.rank && s.points > ceiling.points)) ceiling = s
    if (s.rank > floor.rank   || (s.rank === floor.rank   && s.points < floor.points))   floor = s
  }
  const decorate = s => {
    const refAvg = refByPosRank?.[position]?.[s.rank] ?? null
    return { season: s.season, rank: s.rank, points: s.points, refAvg,
             delta: refAvg == null ? null : Math.round(s.points - refAvg) }
  }
  return { ceiling: decorate(ceiling), floor: decorate(floor) }
}
```
Single-season player → `ceiling === floor` (same season; both cells render
identically — accurate: their best and worst season are the same).

### 3b. `src/utils/ktcHistory.js` — add `computeKtcRecentDelta` (additive export)

Place next to `computeKtcSignals` (after `:251`). Pure; reuses the dated series. Do
**not** modify `computeKtcSignals` or `loadKtcHistory`.

```js
/**
 * ~N-day KTC value delta for one player's ascending dated series.
 * Picks the latest point and the latest point on-or-before (latest - days).
 * If the window is shorter than `days`, falls back to the oldest point (so it
 * degrades to "Δ over {spanDays}d"). Returns null for <2 points / null series.
 * @returns { delta, deltaPct, spanDays, fromDate, toDate } | null
 */
export function computeKtcRecentDelta(series, days = 30) {
  const n = series?.length ?? 0
  if (n < 2) return null
  const latest = series[n - 1]
  const cutoff = new Date(latest.date).getTime() - days * 86400000
  let ref = series[0]                                   // fallback: oldest
  for (let i = n - 1; i >= 0; i--) {
    if (new Date(series[i].date).getTime() <= cutoff) { ref = series[i]; break }
  }
  const delta = latest.value - ref.value
  return {
    delta,
    deltaPct: Math.round((delta / Math.max(ref.value, 1)) * 1000) / 1000,
    spanDays: Math.round((new Date(latest.date) - new Date(ref.date)) / 86400000),
    fromDate: ref.date,
    toDate:   latest.date,
  }
}
```

### 3c. `src/hooks/usePlayerProfile.js` — reuse the extracted primitive

Behavior-preserving (identical output). Add import at top:
`import { rankPositionSeason } from '../utils/seasonRanks'`. Replace the
`historicalRanks` body (`:74-87`):

```js
const historicalRanks = useMemo(() => {
  const position = player.position
  if (!position || !careerStats) return {}
  const ranks = {}
  for (const [season, seasonData] of Object.entries(careerStats)) {
    ranks[season] = rankPositionSeason(seasonData, playersMap, position).get(playerId)?.rank ?? null
  }
  return ranks
}, [careerStats, playerId, playersMap, player.position])
```
(There is no `usePlayerProfile.test.js`; the ranking semantics are covered by
`seasonRanks.test.js`. The Profile "Pos Rank" column is unchanged — confirm via the
full suite + the user's smoke.)

### 3d. `src/components/PlayersTab.jsx`

**Imports (top, `:1-7`):**
```js
import { buildSeasonPositionRanks, computeCeilingFloor } from '../utils/seasonRanks'
import { computeKtcRecentDelta } from '../utils/ktcHistory'
```

**Props (`:1762-1766`):** add `ktcHistory` to the destructure (e.g. after
`seasonProjections`).

**New inline cell component** (near `PosRankBadge`, after `:55`, before `SortTh`):
```jsx
// Compact stacked Ceiling/Floor cell. `data` = decorated season from computeCeilingFloor.
function CeilingFloorCell({ position, data }) {
  if (!data) return <span className="text-[var(--color-text-faintest)] text-xs">—</span>
  const { season, rank, points, delta, refAvg } = data
  return (
    <div className="leading-tight">
      <div className="flex items-center gap-1 whitespace-nowrap">
        <PosRankBadge position={position} rank={rank} />
        <span className="text-[10px] text-[var(--color-text-faint)] tabular-nums">{season}</span>
      </div>
      <div className="text-xs tabular-nums whitespace-nowrap">
        <span className="text-[var(--color-text-secondary)]">{Math.round(points)}</span>
        {delta != null && delta !== 0 && (
          <Tooltip content={`vs ${position}${rank} avg (${Math.round(refAvg)} pts)`} position="top">
            <span className={`ml-1 ${delta > 0
              ? 'text-[var(--color-positive-text)]'
              : 'text-[var(--color-negative-text)]'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
```

**Derived memos** (inside `PlayersTab`, before `displayRows` at `:1842`):
```js
const seasonRanks = useMemo(
  () => buildSeasonPositionRanks(careerStats, playerMap),
  [careerStats, playerMap]
)   // { ranksByPlayer, refByPosRank }; careerStats may be null early → guarded in util

const enrichedRows = useMemo(() => {
  const { ranksByPlayer, refByPosRank } = seasonRanks
  return playerRows.map(r => {
    const cf = computeCeilingFloor(ranksByPlayer.get(r.player_id), r.position, refByPosRank)
    return { ...r,
      _ceiling: cf?.ceiling ?? null, _floor: cf?.floor ?? null,
      ceilingRank: cf?.ceiling?.rank ?? null, floorRank: cf?.floor?.rank ?? null }
  })
}, [playerRows, seasonRanks])

const ktcDeltaById = useMemo(() => {
  const m = new Map()
  if (ktcHistory?.series) {
    for (const [id, s] of Object.entries(ktcHistory.series)) m.set(id, computeKtcRecentDelta(s))
  }
  return m
}, [ktcHistory])
```

**`displayRows` (`:1842-1902`):** change the source from `playerRows` to
`enrichedRows` (first line `let rows = enrichedRows`) and swap `playerRows` →
`enrichedRows` in the deps array. The sort comparator is unchanged — `ceilingRank` /
`floorRank` are numbers handled by the default numeric branch, and `null` ranks sort
to the end via the existing `va == null` guards. (Filter logic is unaffected — it
references the same ids/fields.)

**`handleSort` first-click defaults (`:1827-1830`):** add `'ceilingRank'` and
`'floorRank'` to the `ascByDefault` set (rank 1 is best → ascending first click).

**`<colgroup>` (`:1965-1975`):** insert two `<col style={{ width: '110px' }} />`
between the Career `<col>` (`:1972`, width 130px) and the Dynasty `<col>` (`:1973`).

**`<thead>` (`:1986-1995`):** after the Career `<th>` (`:1986-1990`), add:
```jsx
<SortTh label="Ceiling" col="ceilingRank" {...sortProps}
  tooltip="Best career positional finish (by PPG). Shows rank · season · that season's total points and the gap vs the average points for that finish (green = above, red = below — flags injury-shortened seasons)." />
<SortTh label="Floor" col="floorRank" {...sortProps}
  tooltip="Worst career positional finish (by PPG). Same stacked format as Ceiling." />
```

**`<tbody>` cells:** after the Career sparkline `<td>` (`:2074`), add:
```jsx
<td className="py-2 px-3"><CeilingFloorCell position={row.position} data={row._ceiling} /></td>
<td className="py-2 px-3"><CeilingFloorCell position={row.position} data={row._floor} /></td>
```
And modify the **KTC** `<td>` (`:2086-2088`) to append the Δ:
```jsx
<td className="py-2 px-3 tabular-nums text-[var(--color-text-semi-muted)] text-sm">
  {row.ktcValue != null ? row.ktcValue.toLocaleString() : ''}
  {(() => {
    const kd = ktcDeltaById.get(row.player_id)
    if (!kd || kd.delta == null || kd.delta === 0) return null
    return (
      <Tooltip content={`KTC change over ${kd.spanDays}d`} position="left">
        <span className={`block text-[10px] ${kd.delta > 0
          ? 'text-[var(--color-positive-text)]' : 'text-[var(--color-negative-text)]'}`}>
          {kd.delta > 0 ? '+' : ''}{kd.delta.toLocaleString()}
        </span>
      </Tooltip>
    )
  })()}
</td>
```

**Empty-state colSpan (`:2106`):** `colSpan={9}` → `colSpan={11}`.

> Leave the ComparisonTray (`:2131`) and the ProfileDataContext provider (`:2142`)
> passing the **base** `playerRows` prop — ceiling/floor is Explorer-table-only.

### 3e. `src/App.jsx` — thread the existing KTC history prop

In the `/players` route element (`:1011-1031`, now `<PlayersSurface …>`), add
`ktcHistory={ktcHistory}` alongside `ktcMap`. `ktcHistory` state already exists
(`:156`). `PlayersSurface` forwards it via `{...props}` (`PlayersSurface.jsx:77`), so
no `PlayersSurface` edit is needed. No other App.jsx change (no pipeline change).

---

## 4. Step sequence

1. Add `src/utils/seasonRanks.js` (§3a) + its test (§8). Run `npm test`.
2. Add `computeKtcRecentDelta` to `ktcHistory.js` (§3b) + its tests (§8).
3. Refactor `usePlayerProfile.js` `historicalRanks` (§3c).
4. Edit `PlayersTab.jsx` (§3d): imports, prop, cell component, memos, headers, cells,
   colgroup, colSpan, sort defaults.
5. Thread `ktcHistory` in `App.jsx` (§3e).
6. Docs (§7).
7. Done-definition: `npm test`, `npm run lint`, `npm run build` — all green/clean. No
   projection/`factors`/stat-key code is touched, so `factorsSchema.test.js` /
   `statKeysContract.test.js` are unaffected (still run via full suite). Hand back for
   the user's light/dark smoke (do not start the dev server).

---

## 5. Token discipline

Existing tokens only (CLAUDE.md → *Color tokens*). Delta coloring reuses the semantic
up/down/neutral tokens already in `src/index.css`: `--color-positive-text`
(`:70`), `--color-negative-text` (`:73`); empties use `--color-text-faintest`
(`:25`, dark `:209`). Season year / muted points use `--color-text-faint` /
`--color-text-secondary`. `PosRankBadge` is reused as-is (already tier-colored with
existing tokens). **No new tokens** are introduced (so no `.dark` additions needed).

---

## 6. Display-only guarantee

Neither `seasonRanks.js` nor `computeKtcRecentDelta` is imported by any
projection/scoring module (`seasonProjection.js`, `dynastyScore.js`, or any `factors`
producer). They are consumed only by `PlayersTab.jsx` (Explorer view) and — for the
shared primitive `rankPositionSeason` — `usePlayerProfile.js` (Profile view). This
preserves the advstats-style display-only contract.

---

## 7. Docs updates

### 7a. `docs/ui.md` — "Player Explorer"

**(i)** Heading `### Columns (9 total)` → `### Columns (11 total)`. In that table
(`:56-66`), insert two rows after the **Career** row:

| Column | Notes |
|---|---|
| **Ceiling** | Best career positional finish (by PPG): rank · season + that season's total pts and signed delta vs the per-rank average |
| **Floor** | Worst career positional finish (by PPG): same stacked format |

**(ii)** Append a new subsection after "Proj column confidence styling:" (`:68`):

> **Ceiling & Floor seasons.** For each player the Explorer derives their best
> (Ceiling) and worst (Floor) career season by **positional finish rank** — ranked by
> league-scored PPG, the same per-season ranking shown in the Player Profile "Pos
> Rank" column (`src/utils/seasonRanks.js`, shared with `usePlayerProfile`). Each cell
> stacks the positional-rank badge + season year over that season's **total** fantasy
> points and a signed delta vs the **average total points for that finish** across
> seasons. Because rank is by PPG but the delta is by total points, an injury-
> shortened top-PPG season reads **negative** (below the typical finisher) while a
> full strong season reads **positive** — the delta is the insight. Single-season
> players show the same season for both; players with no qualifying season show `—`.
> **Display-only** — never feeds projection or dynasty score.

**(iii)** Update the **KTC** row note (`:65`) to:
`| **KTC** | KeepTradeCut dynasty value, with a signed ~30-day value Δ beneath it (green up / red down; tooltip shows the exact span). Δ shows only when ≥2 banked snapshots exist. |`

### 7b. `docs/signal-registry.md` — add two **view-only** rows to §3B

The registry's scope is "every signal that feeds, could feed, **or is displayed**"
(`:3`), with a **view-only display** classification already used for advstats/coaching.
Add to **### 3B. Computed factors (`sleeper-dashboard`)** (`:64`):

```
| Ceiling/Floor career-season finish (best/worst positional finish by PPG + total-points delta vs per-rank average) | computed factor (view-layer) | app: `src/utils/seasonRanks.js`, from in-memory `careerStats` | all seasons in `careerStats` (Sleeper weekly → season totals) | **Reconstructable** (pure function of career/season totals) | **view-only display** (Explorer Value tab; never moves `projectedPPG`/dynasty score) |
| KTC ~30-day value Δ (`computeKtcRecentDelta`) | computed factor (view-layer) | app: `src/utils/ktcHistory.js`, from served `ktc/snapshot-*.json` window | recent window (≤8 snapshots, ≥5d apart, ~40d span) | **Reconstructable** from banked KTC snapshots | **view-only display** (Explorer KTC cell; never moves `projectedPPG`/dynasty score) |
```

### 7c. `docs/dynasty-scoring.md` — **no change**

Ceiling/Floor and KTC Δ are display-only and are not dynasty-score components; this
doc describes the score's inputs/weights and is unaffected.

### 7d. `CLAUDE.md`

- **src/utils table** — add:
  `| `seasonRanks.js` | `rankPositionSeason` (per-season positional ranking by league-scored PPG — extracted from `usePlayerProfile`/shared), `buildSeasonPositionRanks` (global ranks + per-rank points reference), `computeCeilingFloor` — pure, **view-only** (Explorer Ceiling/Floor cells); never feeds projection/scoring |`
- **`ktcHistory.js` row** — append to its description:
  `; `computeKtcRecentDelta` (≈30-day value Δ for the Explorer KTC cell — view-only)`.
- **src/components `PlayersTab.jsx` row** — append:
  `Value tab adds display-only Ceiling/Floor career-finish cells (`seasonRanks.js`) and a ~30-day KTC Δ (`ktcHistory.computeKtcRecentDelta`).`

### 7e. `README.md`

- In the `utils/` tree, add:
  `    seasonRanks.js      # rankPositionSeason / buildSeasonPositionRanks / computeCeilingFloor — per-season positional ranks + Ceiling/Floor (view-only)`
- `ktcHistory.js` (if listed) / `PlayersTab.jsx` comment — optionally note the
  Ceiling/Floor + KTC-Δ enrichment. (No structural README change.)

---

## 8. Tests to add

### 8a. `src/utils/seasonRanks.test.js` (NEW)

Pattern: plain `import { describe, it, expect } from 'vitest'` (pure util, no jsdom).
Build small inline `careerStats` + `playersMap` (or reuse `makeSeasonEntry` from
`src/__fixtures__/factories.js`).

**`rankPositionSeason`:**
- Two WRs in a season (PPG 20 vs 12, both gp>0) → ranks 1 and 2; points = each
  season total.
- A WR with `gamesPlayed: 0` → excluded (not in the returned Map).
- Position filter: an RB in the same season is not ranked among WRs.

**`buildSeasonPositionRanks`:**
- Multi-season, multi-player fixture → `ranksByPlayer.get(id)` has the right
  `{season,rank,points}` per season; `refByPosRank.WR[1]` equals the mean of the
  rank-1 WRs' total points across seasons.
- Null/empty `careerStats` → `{ ranksByPlayer: empty Map, refByPosRank: {} }` (no
  throw).

**`computeCeilingFloor`:**
- Player with seasons ranked [3, 1, 5] (points e.g. [220, 300, 140]) and a ref where
  WR1 avg=320, WR5 avg=180 → ceiling = {rank:1, season of the rank-1, points:300,
  delta: round(300-320) = -20}; floor = {rank:5, points:140, delta: 140-180 = -40}.
- **Single-season** player → `ceiling.season === floor.season`, both decorated.
- **No qualifying season** (`[]` / undefined) → returns `null`.
- **Tie on rank** (two seasons both rank 2, points 250 and 210) → ceiling picks 250,
  floor picks 210.
- **Missing reference** (`refByPosRank` lacks that position/rank) → `delta: null`,
  `refAvg: null`, but `season`/`rank`/`points` still present (graceful).
- **Injury-deflation case**: a rank-1-by-PPG season with low total points (short
  season) vs a ref avg above it → `delta < 0` (asserts the core insight).

### 8b. `src/utils/ktcHistory.test.js` (ADD a `describe('computeKtcRecentDelta')`)

Import is already `from './ktcHistory.js'`; reuse the existing `makePoint(date,value)`
helper.
- Series spanning > 30 days (points at day 0, 20, 35, 45) → delta = latest − the
  point on-or-before (latest−30d); `spanDays ≈ 30+` and matches the chosen ref's date.
- Series spanning < 30 days (points at day 0 and 10) → falls back to oldest;
  `spanDays === 10`, delta = latest − oldest.
- 1 point → `null`. `null`/`undefined` series → `null`.
- Sign: rising values → positive delta; falling → negative.

No component/render tests are required (the cells are trivial presentational wrappers;
the derivations carry the logic and are unit-tested). Existing `PlayersSurface.test.jsx`
is unaffected (it mocks `PlayersTab`).

---

## 9. Cross-repo impact

**None.** The pos-rank-average reference is computed app-side from already-served
career/season data (`careerStats`), and the KTC Δ reuses already-served
`ktc/snapshot-*.json` files that `loadKtcHistory` already consumes. No new served
shape, no manifest/snapshot/season-totals contract change. (If a future slice wanted a
league-agnostic, precomputed cross-season rank-average table for consistency across
users, *that* would warrant a small data-repo slice first — but it is **not** needed
here and is explicitly out of scope.)

---

## 10. Out of scope

The buy/sell "Signal" column / marginal-value engine; any new KTC snapshot loader;
Outlook / NFL-stats / Weekly content; `PlayersSurface` tab logic; any projection /
dynasty-score / `factors` change; pipeline reordering.
