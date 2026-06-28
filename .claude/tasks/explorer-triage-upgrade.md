# Explorer triage upgrade — Recent provenance + Consistency column + inline Rankings expand

**Session model:** opus plans (this file) → sonnet implements. Planning only; no source was edited.
**Scope:** display-only / additive. No projection, dynasty score, or `factors` change. `recentRank` / `peakRank` / `consistencyRank` / `dynastyRank` VALUES are unchanged — only one additive field (`recentRankSeason`) plus new display + sort + a shared presentational component.

This is the **triage slice**: make the Explorer (Players → Dynasty → Value, `src/components/PlayersTab.jsx`) answer "who's established / rising / current-form" without forcing a full Profile-panel open. Three coherent pieces:

1. **Recent provenance** — `computePositionalRanks` returns the basis season per player; the Explorer Recent cell flags a fallback (non-current) basis.
2. **Consistency column** — promote the established-level rank to a sortable column (null-safe sort).
3. **Inline Rankings expand** — a stop-propagation chevron drops the Profile *Rankings-row* content in place; the rest-of-row click still opens the full Profile (two detail levels). The Rankings-row rendering is **extracted once and shared** — not forked.

---

## Decisions & recommendations (read first)

### Column-budget question — RESOLVED
**Recommendation: add Consistency as ONE new sortable data column, placed immediately after Recent. Do NOT introduce a display-tier system. Do NOT demote an existing column.**

Rationale:
- **Why not a display-tier refactor:** the Explorer has no tier mechanism today (columns are hardcoded in the `<thead>`/`<tbody>` at `PlayersTab.jsx:2043–2186`). Building one is a structural refactor that violates the CLAUDE.md invariant *"Do not refactor working … while implementing a feature"* and is disproportionate to adding one rank.
- **Why not demote a column:** each existing column is a distinct triage signal (Recent = current-form, Ceiling/Floor = range, Dynasty = outlook, PPG/Proj = level, Career = trajectory, KTC = market, Owner = roster context). Owner is the weakest, but the expand is dedicated to *Rankings-row* content — moving Owner there would be incoherent.
- **Why this isn't a data wall:** the genuinely *deep* standing detail — Peak rank, Role rank, Next-Szn rank, and the movement narrative — goes into the **expand**, not into columns. Only ONE new data column (Consistency) is added; it renders as a `PosRankBadge`, identical visual weight to Recent, and sits beside it so the two standing-rank signals scan together.

**Final cell layout (13 cells, was 11):**

| # | Cell | Kind | `<col>` width | Status |
|---|------|------|---------------|--------|
| 1 | chevron | chrome (stop-prop) | 32px | **NEW** |
| 2 | compare toggle | chrome (stop-prop) | 32px | existing |
| 3 | Recent | data | 72px | existing (+ provenance sub-label) |
| 4 | **Consist** | data (sortable) | 72px | **NEW** |
| 5 | Player | data | minWidth 200px | existing |
| 6 | PPG | data | 64px | existing |
| 7 | Proj | data | 72px | existing |
| 8 | Career | data | 100px | existing |
| 9 | Ceiling | data | 130px | existing |
| 10 | Floor | data | 110px | existing |
| 11 | Dynasty | data | 110px | existing |
| 12 | KTC | data | 72px | existing |
| 13 | Owner | data | 120px | existing |

`colSpan` changes **11 → 13** in two places (`PlayersTab.jsx:2189` empty-state row, and the new `ExpandableTableRow colSpan`).

### Recent cell provenance treatment — SPECIFIED
A muted sub-label beneath the rank badge (mirrors the existing KTC-delta sub-label at `PlayersTab.jsx:2164` and the Ceiling/Floor season tag at `PlayersTab.jsx:68`):

| `recentRankSeason` vs `currentSeason` | Treatment | Tooltip |
|---|---|---|
| `=== currentSeason` (current-form) | **no sub-label** (clean) | — |
| prior season (fallback) | `via '<YY>` muted | "Recent rank based on the `<season>` season — no qualifying games since." |
| `null` (no qualifying season in lookback) | `DNP` muted | "No qualifying season in the last 3 years — rank is not current." |

`<YY>` = last two digits: `String(season).slice(2)` → `2023` ⇒ `'23`. Sub-label styling: `block text-[10px] text-[var(--color-text-faintest)] leading-none`.

### Shared Rankings-row component — SPECIFIED
Extract the Profile Rankings-row JSX into a new presentational component **`src/components/ui/RankingsRow.jsx`** (ui/ convention, like `ExpandableTableRow.jsx` / `ValueChip.jsx`). It is rendered by **both** the Profile header (ROW 3) and the Explorer expand `detail`. The chip array, the narrative logic, and the legend string all move *inside* it — a single source, no fork.

> Note: the expand's Recent chip does **not** show provenance — provenance is solely the dedicated Recent *column* concern (piece 1). `RankingsRow` is a faithful extraction of today's chip rendering, so both call sites stay identical.

### Equivalence / consumers — CONFIRMED
- Only consumer of `computePositionalRanks`: `src/App.jsx:476` (call) → result merged into rows at `App.jsx:488–491` via `{ ...row, ...r }` (so `recentRankSeason` reaches the rows automatically; **no App.jsx edit needed**). Downstream readers: `usePlayerProfile.js` (reads `playerRow.recentRank` etc.) and the Explorer cells.
- `recentRank` / `peakRank` / `consistencyRank` / `dynastyRank` / `rankMovement` / `movementLabel` are produced by the same code paths, unchanged. `recentRankSeason` is purely additive.

### Cross-repo — CONFIRMED none
`computePositionalRanks` output is **not** snapshotted (snapshots carry `computeNextSeasonProjection` output only — see CLAUDE.md → Cross-repo contracts → Snapshot shape). `recentRankSeason` is app-only, view-only. See "Cross-repo impact" below.

---

## File-by-file edits

### A. `src/utils/dynastyScore.js` — `computePositionalRanks` (def `dynastyScore.js:238`)

Read the Recent-rank block `dynastyScore.js:252–271` and the assemble loop `dynastyScore.js:336–354` only.

**A1.** In the Recent-rank block, track the basis season alongside the PPG. Add a `recentSeason` Map and populate it in both branches.

Current (`:252–269`):
```js
    const recentPPG = new Map()
    for (const row of rows) {
      const cd = careerStats[currentSeason]?.[row.player_id]
      if ((cd?.gamesPlayed ?? 0) >= 6) {
        recentPPG.set(row.player_id, row.currentSeasonPPG)
      } else {
        let fallback = null
        for (let i = allSeasons.length - 1; i >= 0; i--) {
          const s = allSeasons[i]
          if (s >= currentSeason) continue
          if (s < currentSeason - 3) break  // don't reach back more than 3 seasons
          const d = careerStats[s]?.[row.player_id]
          if (d && (d.gamesPlayed ?? 0) >= 8) { fallback = d.fantasyPoints / d.gamesPlayed; break }
        }
        recentPPG.set(row.player_id, fallback)
      }
    }
```
After:
```js
    const recentPPG = new Map()
    const recentSeason = new Map()   // basis season per player → recentRankSeason
    for (const row of rows) {
      const cd = careerStats[currentSeason]?.[row.player_id]
      if ((cd?.gamesPlayed ?? 0) >= 6) {
        recentPPG.set(row.player_id, row.currentSeasonPPG)
        recentSeason.set(row.player_id, currentSeason)
      } else {
        let fallback = null
        let fbSeason = null
        for (let i = allSeasons.length - 1; i >= 0; i--) {
          const s = allSeasons[i]
          if (s >= currentSeason) continue
          if (s < currentSeason - 3) break  // don't reach back more than 3 seasons
          const d = careerStats[s]?.[row.player_id]
          if (d && (d.gamesPlayed ?? 0) >= 8) { fallback = d.fantasyPoints / d.gamesPlayed; fbSeason = s; break }
        }
        recentPPG.set(row.player_id, fallback)
        recentSeason.set(row.player_id, fbSeason)   // null when no qualifying fallback
      }
    }
```
The `sortedRecent` / `recentRankMap` lines (`:270–271`) are **unchanged** — ranking still keys off `recentPPG` exactly as before.

**A2.** In the assemble loop, add one field to the `result.set(id, { … })` object (`:346–353`):
```js
      result.set(id, {
        recentRank,
        recentRankSeason: recentSeason.get(id) ?? null,   // NEW — additive
        peakRank:        peakRankMap.get(id)        ?? null,
        consistencyRank: consistencyRankMap.get(id) ?? null,
        dynastyRank:     dynastyRankMap.get(id)     ?? null,
        rankMovement,
        movementLabel,
      })
```
Update the comment block at `:235–236` to list the new field:
```js
// Returns a Map<player_id, { recentRank, recentRankSeason, peakRank, consistencyRank,
//                             dynastyRank, rankMovement, movementLabel }>
```

No other change in this file. `recentRankSeason` semantics: `currentSeason` (current-form basis) | a prior season ≤ `currentSeason−3` (fallback basis) | `null` (no qualifying season in the lookback window).

---

### B. `src/components/ui/RankingsRow.jsx` — NEW shared presentational component

Create this file. It is the single source for the Rankings-row chips + narrative + legend, extracted verbatim from today's Profile ROW 3 (`PlayersTab.jsx:1244–1281`), the narrative (`PlayersTab.jsx:1122–1130`), and the legend (`PlayersTab.jsx:1133–1139`). Pure/presentational — no hooks, no context. Default-exports nothing; `export function RankingsRow`.

**Props contract:**
```js
RankingsRow({
  position,             // 'QB'|'RB'|'WR'|'TE' — prefixes every chip value
  recentRank,           // number | null
  peakRank,             // number | null
  consistencyRank,      // number | null
  dynastyRank,          // number | null  → rendered as the "Outlook" chip
  roleRank,             // number | null
  nextSeasonRank,       // number | null
  movementLabel,        // 'up'|'down'|'stable'|null — colours + ↑/↓ suffix on Recent chip
  projectionConfidence, // 'high'|'medium'|'low'|'rookie'|null — colours the Next-Szn chip
})
```

**Implementation (move logic in, don't fork):**
```jsx
import Tooltip from '../Tooltip'

const RANKINGS_LEGEND =
  'Recent: current-form rank vs ACTIVE players, by most-recent qualifying PPG (this season ≥6 GP, else last ≤3 seasons ≥8 GP) — mixed-season, not a single-season finish\n' +
  'Peak: best-season rank within the active-player pool (differs from the Explorer Ceiling column, which uses the full-field single-season finish)\n' +
  'Consist: Weighted avg rank across last 3 seasons — reliability (50/30/20%)\n' +
  'Outlook: Forward-looking rank by dynasty score\n' +
  'Role: Rank by multi-season carry/target share\n' +
  'Next Szn: Projected rank by next season PPG'

export function RankingsRow({
  position, recentRank, peakRank, consistencyRank, dynastyRank,
  roleRank, nextSeasonRank, movementLabel, projectionConfidence,
}) {
  // Narrative — identical thresholds to the former Profile inline logic.
  let narrative = null
  if (recentRank != null && dynastyRank != null) {
    const gap = dynastyRank - recentRank
    if (gap >= 5) narrative = 'Performing above long-term projection — potential sell window while value is high'
    else if (gap <= -5) narrative = 'Long-term projection stronger than current output — potential buy-low target'
  }

  const chips = [
    { label: 'Recent',  value: recentRank,
      color: movementLabel === 'up' ? 'text-[var(--c-green-600)]'
        : movementLabel === 'down' ? 'text-[var(--c-orange-500)]'
        : 'text-[var(--color-text-secondary)]',
      suffix: movementLabel === 'up' ? '↑' : movementLabel === 'down' ? '↓' : '' },
    { label: 'Peak',    value: peakRank,        color: 'text-[var(--color-text-secondary)]' },
    { label: 'Consist', value: consistencyRank, color: 'text-[var(--color-text-secondary)]' },
    { label: 'Outlook', value: dynastyRank,     color: 'text-[var(--color-text-secondary)]' },
    { label: 'Role',    value: roleRank,
      color: roleRank != null ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-faintest)]' },
    { label: 'Next Szn', value: nextSeasonRank,
      color: nextSeasonRank == null ? 'text-[var(--color-text-faintest)]'
        : projectionConfidence === 'high' ? 'text-[var(--color-accent-text)]'
        : projectionConfidence === 'medium' ? 'text-[var(--color-accent)]'
        : projectionConfidence === 'rookie' ? 'text-[var(--c-purple-600)]'
        : 'text-[var(--color-text-muted)]' },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {chips.map(({ label, value, color, suffix }) => (
          <div key={label} className="flex flex-col items-center">
            <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wide leading-none mb-0.5">{label}</span>
            <span className={`text-sm font-semibold tabular-nums ${color}`}>
              {value != null ? `${position}${value}${suffix ?? ''}` : '—'}
            </span>
          </div>
        ))}
        <Tooltip content={RANKINGS_LEGEND} position="bottom">
          <span className="text-[var(--color-text-faintest)] hover:text-[var(--color-text-muted)] cursor-help text-xs ml-1">ⓘ</span>
        </Tooltip>
      </div>
      {narrative && (
        <p className="text-xs italic text-[var(--color-text-muted)] mt-2">{narrative}</p>
      )}
    </>
  )
}
```
The component renders only the chips flex + legend + narrative (no outer section padding) — each call site supplies its own wrapper.

---

### C. `src/components/PlayersTab.jsx`

Anchors confirmed: imports `:1–10`; private helpers `PosRankBadge :44`, `CeilingFloorCell :61`, `SortTh :89`; `PlayerProfile :296` (ranks destructured `:305–309`); narrative IIFE local `:1122–1130`; legend local `:1133–1139`; Profile ROW 3 `:1244–1281`; `PlayersTab` def `:1803`; state `:1808–1830`; `handleSort :1862`; memos `:1883–1902`; sort comparator `:1955–1965`; `sortProps :1975`; colgroup `:2030–2042`; thead `:2043–2068`; row map `:2070–2186`; empty-state `:2187–2193`; Profile provider `:2224–2237`.

**C1 — imports (`:1–10`).** Add:
```js
import { ExpandableTableRow, ExpandChevron } from './ui/ExpandableTableRow'
import { RankingsRow } from './ui/RankingsRow'
```

**C2 — Profile ROW 3 uses the shared component (`PlayerProfile`).**
- Delete the inline `narrative` local (`:1122–1130`) and the `rankingsLegend` local (`:1133–1139`) — both now live inside `RankingsRow`.
- Replace the ROW 3 body (`:1244–1281`) — keep the existing conditional + padding wrapper, swap the inner chips/narrative for the component:
```jsx
            {/* ROW 3 — Rankings */}
            {(recentRank != null || dynastyRank != null) && (
              <div className="px-6 py-2.5">
                <RankingsRow
                  position={player.position}
                  recentRank={recentRank}
                  peakRank={peakRank}
                  consistencyRank={consistencyRank}
                  dynastyRank={dynastyRank}
                  roleRank={roleRank}
                  nextSeasonRank={nextSeasonRank}
                  movementLabel={movementLabel}
                  projectionConfidence={projection?.confidence}
                />
              </div>
            )}
```
(`recentRank`, `peakRank`, `consistencyRank`, `dynastyRank`, `roleRank`, `nextSeasonRank`, `movementLabel`, `projection` are already destructured from `usePlayerProfile` at `:305–321`; `player` at `:296`-region. No new locals.)

**C3 — expand state (`PlayersTab`, near `:1828–1830`).** Add (mirrors `usePlayersTable.js:33,53–60`):
```js
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleExpanded = useCallback(id => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
```
(`useState`/`useCallback` already imported at `:1`.)

**C4 — `currentSeason` memo (near the other memos, after `:1886`).** Add (matches App.jsx's `allSeasons[allSeasons.length-1]` — the max season key, the same value passed to `computePositionalRanks`):
```js
  const currentSeason = useMemo(() => {
    const ks = Object.keys(careerStats ?? {}).map(Number)
    return ks.length ? Math.max(...ks) : null
  }, [careerStats])
```
(`careerStats` is already a prop — `:1803`.)

**C5 — sort: NO code change required.**
- `handleSort` (`:1868–1870`) **already** lists `consistencyRank` in the asc-by-default set — verified at `:1869`.
- The comparator default branch `return compareNullsLast(a[sortKey], b[sortKey], dir)` (`:1965`) already routes any plain row field — including `consistencyRank` — through `compareNullsLast`. Limited-Data players have `consistencyRank == null`, which sinks correctly. No special-case needed.

**C6 — colgroup (`:2030–2042`).** Prepend a chevron col and insert a Consist col after Recent → 13 `<col>`:
```jsx
          <colgroup>
            <col style={{ width: '32px'  }} />   {/* chevron  (NEW) */}
            <col style={{ width: '32px'  }} />   {/* compare */}
            <col style={{ width: '72px'  }} />   {/* Recent */}
            <col style={{ width: '72px'  }} />   {/* Consist  (NEW) */}
            <col style={{ minWidth: '200px' }} /> {/* Player */}
            <col style={{ width: '64px'  }} />   {/* PPG */}
            <col style={{ width: '72px'  }} />   {/* Proj */}
            <col style={{ width: '100px' }} />   {/* Career */}
            <col style={{ width: '130px' }} />   {/* Ceiling */}
            <col style={{ width: '110px' }} />   {/* Floor */}
            <col style={{ width: '110px' }} />   {/* Dynasty */}
            <col style={{ width: '72px'  }} />   {/* KTC */}
            <col style={{ width: '120px' }} />   {/* Owner */}
          </colgroup>
```

**C7 — thead (`:2044–2067`).** Prepend an empty chevron `<th>` before the existing empty compare `<th>` (`:2045`), and insert the Consist `SortTh` immediately after the Recent `SortTh` (`:2046–2047`):
```jsx
            <tr className="border-b bg-[var(--color-surface-2)]">
              <th className="py-2 px-2" />   {/* chevron (NEW) */}
              <th className="py-2 px-2" />   {/* compare */}
              <SortTh label="Recent" col="recentRank" {...sortProps}
                tooltip="…unchanged…" />
              <SortTh label="Consist" col="consistencyRank" {...sortProps}
                tooltip="Established-level rank vs ACTIVE players: weighted average of the last 3 completed seasons' positional ranks (50/30/20). Needs ≥2 qualifying seasons — Limited-Data players sort to the bottom." />
              {/* …Player, PPG, Proj, Career, Ceiling, Floor, Dynasty, KTC, Owner unchanged… */}
```

**C8 — row body: wrap in `ExpandableTableRow`, add chevron cell + provenance + Consist cell (`:2070–2186`).** Replace the `<tr …>` wrapper and add cells. The `isSelected` / `listFull` / `ownerShort` locals (`:2071–2075`) stay; the row body returns:
```jsx
              <ExpandableTableRow
                key={row.player_id}
                expanded={expanded.has(row.player_id)}
                colSpan={13}
                onRowClick={() => setSelectedPlayerId(row.player_id)}
                detail={
                  <RankingsRow
                    position={row.position}
                    recentRank={row.recentRank}
                    peakRank={row.peakRank}
                    consistencyRank={row.consistencyRank}
                    dynastyRank={row.dynastyRank}
                    roleRank={row.roleRank}
                    nextSeasonRank={row.nextSeasonRank}
                    movementLabel={row.movementLabel}
                    projectionConfidence={row.projectionConfidence}
                  />
                }
              >
                {/* chevron (NEW, stop-prop) */}
                <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                  <ExpandChevron expanded={expanded.has(row.player_id)} onClick={() => toggleExpanded(row.player_id)} />
                </td>

                {/* + (compare) — existing cell, unchanged (already stop-prop at :2081) */}
                <td className="py-2 px-2" onClick={e => e.stopPropagation()}> … </td>

                {/* Recent — existing cell + provenance sub-label (NEW) */}
                <td className="py-2 px-3 whitespace-nowrap">
                  {row.recentRank != null ? (
                    <>
                      <span className="inline-flex items-center gap-0.5">
                        <PosRankBadge position={row.position} rank={row.recentRank} />
                        {row.movementLabel === 'up'   && <Tooltip content="Moved up 3+ positions vs prior season" position="top"><sup className="text-[var(--c-green-600)] text-[10px] font-bold leading-none">↑</sup></Tooltip>}
                        {row.movementLabel === 'down' && <Tooltip content="Dropped 3+ positions vs prior season" position="top"><sup className="text-[var(--c-orange-500)] text-[10px] font-bold leading-none">↓</sup></Tooltip>}
                      </span>
                      {row.recentRankSeason != null && row.recentRankSeason !== currentSeason && (
                        <Tooltip content={`Recent rank based on the ${row.recentRankSeason} season — no qualifying games since.`} position="top">
                          <span className="block text-[10px] text-[var(--color-text-faintest)] leading-none">via '{String(row.recentRankSeason).slice(2)}</span>
                        </Tooltip>
                      )}
                      {row.recentRankSeason == null && (
                        <Tooltip content="No qualifying season in the last 3 years — rank is not current." position="top">
                          <span className="block text-[10px] text-[var(--color-text-faintest)] leading-none">DNP</span>
                        </Tooltip>
                      )}
                    </>
                  ) : <span className="text-[var(--color-text-faintest)] text-xs">—</span>}
                </td>

                {/* Consist (NEW) */}
                <td className="py-2 px-3 whitespace-nowrap">
                  {row.consistencyRank != null
                    ? <PosRankBadge position={row.position} rank={row.consistencyRank} />
                    : <span className="text-[var(--color-text-faintest)] text-xs">—</span>}
                </td>

                {/* Player, PPG, Proj, Career, Ceiling, Floor, Dynasty, KTC, Owner — existing cells, unchanged */}
              </ExpandableTableRow>
```
Mechanical notes for the implementer:
- The old `<tr key={row.player_id} className="… cursor-pointer …" onClick={() => setSelectedPlayerId(row.player_id)}>` (`:2077–2079`) is **replaced** by `ExpandableTableRow` — it provides that same `<tr>` className and wires `onRowClick`. Move `key` onto `ExpandableTableRow`; drop the manual `<tr>`.
- Keep every existing data `<td>` (Player `:2110`, PPG `:2124`, Proj `:2129`, Career `:2138`, Ceiling `:2141`, Floor `:2144`, Dynasty `:2147`, KTC `:2156`, Owner `:2173`) verbatim — only their position shifts right by the two new leading cells + the inserted Consist cell.
- The Recent cell gains the provenance block; `currentSeason` (C4) is in scope.

**C9 — empty-state colSpan (`:2189`).** `colSpan={11}` → `colSpan={13}`.

---

### D. `src/hooks/usePlayerProfile.js` — NO required change

Anchors: ranks destructured `:132–138`; returns "Positional ranks" group `:198–204`. The Profile gets its Rankings-row data through `usePlayerProfile`, and `RankingsRow` does **not** consume `recentRankSeason` (provenance is column-only). So no edit is required here.

Optional (additive parity, only if the Profile is later given provenance): add `const recentRankSeason = playerRow?.recentRankSeason ?? null` (`:133`-region) and `recentRankSeason,` to the returns (`:199`-region). **Not part of this slice** — leave out to avoid an unused return.

---

## Step sequence (for the implementer)

1. **dynastyScore.js** (A1, A2) — add `recentRankSeason`. Run the new provenance unit test (Tests §1) — must pass before touching UI.
2. **ui/RankingsRow.jsx** (B) — create the shared component. Run its unit test (Tests §2).
3. **PlayersTab.jsx** imports (C1) + Profile ROW 3 swap (C2) — confirm the Profile renders via `RankingsRow` (no behaviour change; `npm run build`).
4. **PlayersTab.jsx** expand state (C3) + `currentSeason` memo (C4).
5. **PlayersTab.jsx** colgroup/thead/row/colSpan (C6, C7, C8, C9) — chevron + Consist column + provenance + `ExpandableTableRow`. (C5 = no-op; verify.)
6. Docs updates (below).
7. `npm test` → `npm run lint` → `npm run build`, all clean. Hand back for the user's manual smoke (visual verification is the user's job).

---

## Docs updates

**`docs/ui.md`:**

1. **"### Columns (11 total)" heading (`docs/ui.md:58`)** → `### Columns (13 total)`.
2. **Columns table (`docs/ui.md:60–72`)** — add a `_(chevron)_` row at the top and a **Consist** row after **Recent**; extend the **Recent** row note with provenance:
   - New first row: `| _(chevron)_ | Toggles an inline Rankings strip (Recent / Peak / Consist / Outlook / Role / Next-Szn ranks + movement narrative) — the Profile Rankings-row content, in place, without opening the full panel |`
   - Recent row append: *"Sub-label flags a fallback basis: `via '<YY>` when the rank is from a prior season, `DNP` when no season qualified in the lookback window (no sub-label when it is the current season)."*
   - New row after Recent: `| **Consist** | Established-level rank vs **active** players — weighted average of the last 3 completed seasons' positional ranks (50/30/20). Needs ≥2 qualifying seasons; Limited-Data players are null and sort to the bottom. Same active-pool, mixed-season scope as Recent |`
3. **"### Player Profile panel" → "Panel layout" → Rankings row bullet (`docs/ui.md:332`)** — append a sentence: *"The Rankings-row chips + narrative render via the shared `src/components/ui/RankingsRow.jsx`, reused by the Explorer's inline row-expand."*
4. **"## Player Explorer" body or "### Sort persistence" (around `docs/ui.md:113–116`)** — add a short paragraph documenting the new row interactions (mirrors the Outlook "Row interactions" note at `docs/ui.md:157–161`):
   > **Row interactions.** A leading chevron (a stop-propagation cell, like the compare cell) toggles an inline **Rankings** strip — the same Recent / Peak / Consist / Outlook / Role / Next-Szn chips + movement narrative shown in the Player Profile header, rendered via the shared `src/components/ui/RankingsRow.jsx`. Clicking the rest of the row still opens the full Player Profile panel (two detail levels). Expand mechanism: `src/components/ui/ExpandableTableRow.jsx`.

**`docs/architecture.md`:**

5. **`buildRow` shape comment (`docs/architecture.md:130–136`)** — add the additive field under "Positional ranks":
   ```
   recentRankSeason,     // season the Recent rank is based on (currentSeason | prior fallback | null)
   ```
6. **"## Positional ranks (`computePositionalRanks`)" (`docs/architecture.md:178–193`)** — update the return-type line (`:180`) to include the new field, and add a sentence after the **Recent** table row (`:186`):
   - Return type: `Map<player_id, { recentRank, recentRankSeason, peakRank, consistencyRank, dynastyRank, rankMovement, movementLabel }>`.
   - After the table: *"`recentRankSeason` records which season the Recent rank used — `currentSeason` for a current-form basis, a prior season (≤ 3 back) for a fallback, or `null` when no season qualified. Additive and view-only; the Explorer Recent cell flags a non-current basis. Does not affect `recentRank`."*

**`CLAUDE.md`:**

7. **`### src/components/` table** — add a row for the new file (after the `ui/ExpandableTableRow.jsx` row):
   `| `ui/RankingsRow.jsx` | Pure presentational Rankings-row strip (Recent / Peak / Consist / Outlook / Role / Next-Szn rank chips + movement narrative + legend). Shared by the Player Profile header (ROW 3) and the Explorer inline row-expand — single source, no fork. Display-only. |`
8. **`PlayersTab.jsx` row in the same table** — append to its description: *"Explorer adds a Consistency column + a Recent-cell fallback-season flag (`recentRankSeason`) + an inline `ExpandableTableRow` row-expand reusing `ui/RankingsRow.jsx`."*

> No `factors`-object, stat-key, snapshot, season-totals schema, or signal-registry change → **`docs/signal-registry.md`, `docs/projection.md`, `docs/integrations.md`, `docs/dynasty-scoring.md`, and `README.md` need no edits.** (`recentRankSeason` is a display-only positional-rank field, not a signal/factor.)

---

## Tests to add

**§1 — `src/utils/dynastyScore.test.js` (co-located unit).** New `describe('computePositionalRanks — recentRankSeason provenance')`. The file has **no** existing `computePositionalRanks` tests (confirmed), so this is purely additive.

Fixture — one position (WR), `currentSeason = 2025`, `careerStats` keys `2021,2022,2023,2024,2025`:
- `playerRows`: four WRs `a,b,c,d` each `{ player_id, position:'WR', currentSeasonPPG, dynastyScore:{score} }`.
- `a`: `careerStats[2025].a = { gamesPlayed:10, fantasyPoints:150 }`, `row.currentSeasonPPG = 15` → recent basis = current.
- `b`: `careerStats[2025].b = { gamesPlayed:3, fantasyPoints:30 }` (gp<6); `careerStats[2024].b = { gamesPlayed:12, fantasyPoints:120 }` (PPG 10) → fallback 2024.
- `c`: `careerStats[2025].c = { gamesPlayed:2, fantasyPoints:18 }` (gp<6); `careerStats[2024].c = { gamesPlayed:4, fantasyPoints:40 }` (gp<8, skip); `careerStats[2023].c = { gamesPlayed:16, fantasyPoints:144 }` (PPG 9) → fallback 2023.
- `d`: `careerStats[2025].d = { gamesPlayed:2, fantasyPoints:10 }`; nothing ≥8 GP in 2024/2023/2022; `careerStats[2021].d = { gamesPlayed:16, fantasyPoints:200 }` (beyond the 3-season cap → not reached) → basis `null`.

Expected (assert exact integers):
- **Equivalence (recentRank VALUES unchanged):** `recentRank` → `a:1, b:2, c:3, d:4` (d sinks: `recentPPG` null). This proves the additive field did not perturb ranking.
- **Provenance:** `recentRankSeason` → `a:2025, b:2024, c:2023, d:null`.
- Edge: `computePositionalRanks([], {}, 2025)` and `computePositionalRanks(rows, careerStats, null)` → empty `Map` (guard at `dynastyScore.js:239`).
- Edge (boundary): a 5th WR `e` whose only ≥8-GP season is exactly `currentSeason−3 = 2022` → `recentRankSeason === 2022` (the `s < currentSeason - 3` break is exclusive, so 2022 is in-window). Optional but recommended — it pins the lookback boundary.

**§2 — `src/components/ui/RankingsRow.test.jsx` (co-located unit; new file).** Uses `@testing-library/react` (same setup as `ExpandableTableRow.test.jsx:1–5`). Render `<RankingsRow .../>` (wrap in `<>` only — it's not a table cell). Cases:
- All ranks present, `position:'WR'` → the six chip values render position-prefixed: `WR3` (Recent), `WR1` (Peak), `WR5` (Consist), `WR4` (Outlook), `WR6` (Role), `WR2` (Next Szn). Pick distinct numbers per chip so assertions are unambiguous.
- `movementLabel:'up'` → Recent chip text contains `↑`; `'down'` → contains `↓`; `'stable'`/null → neither.
- `consistencyRank:null` (and `roleRank:null`, `nextSeasonRank:null`) → those chips render `—`.
- Narrative: `recentRank:10, dynastyRank:20` (gap +10 ≥5) → sell-window text present; `recentRank:20, dynastyRank:10` (gap −10 ≤−5) → buy-low text present; `recentRank:10, dynastyRank:12` (gap +2) → no `<p>` narrative (assert neither narrative string present).
- Legend ⓘ present (one `cursor-help` ⓘ span).

**§3 — Recent-cell provenance + expand coexistence (Explorer):** no new Explorer-level integration test required.
- The provenance *data* is covered by §1; the cell rendering is a thin conditional with no logic beyond the §1 field.
- The expand mechanism (chevron stop-prop vs row-body click, `colSpan`, detail row) is already covered by `src/components/ui/ExpandableTableRow.test.jsx:74–96`.
- The Consist sort routes through `compareNullsLast`, covered by `src/utils/sortUtils.test.js`.
- There is no existing `PlayersTab.test.jsx`, and the Explorer's private presentational helpers (`PosRankBadge`, `CeilingFloorCell`) are untested by convention; adding a full PlayersTab harness for a thin display change is out of proportion. (Optional, if desired: a focused render test asserting `via '24` appears for a row with `recentRankSeason:2024` and `DNP` for `recentRankSeason:null` — but this duplicates §1 + trivial JSX.)

---

## Cross-repo impact

**None.** `computePositionalRanks` output is never serialized to the data repo — projection snapshots carry only `computeNextSeasonProjection` output (CLAUDE.md → Cross-repo contracts → "Snapshot shape"). `recentRankSeason` is an app-local, view-only positional-rank field; `RankingsRow`, the Consistency column, and the inline expand are all UI. No manifest, season-totals schema, enrichment, advstats, schedule, or snapshot contract is touched. The sibling repo `sleeper-dashboard-data` needs no change.
