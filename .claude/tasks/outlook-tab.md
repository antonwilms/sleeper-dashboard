# Outlook tab — Players → Dynasty → Outlook (real table)

**Slice:** Players-surface rework #3b. Replace `OutlookPlaceholder` with a real
Outlook table over the same relevant player set the Value tab uses.
**Session model:** opus planned this file; **sonnet implements**. Do not improvise
architecture — if something here contradicts live code, stop and ask.
**Discipline:** display-only. Nothing in this slice may feed `projectedPPG`, the
dynasty score, or any `factors` entry (CLAUDE.md *Advstats are display-only* +
*Capture-only* invariants; `docs/ui.md` advstats rule). Shown
`projectedPPG`/confidence is read-only pipeline output.

---

## 0. Resolution against live source + cached data (done — trust these)

Verified, not assumed (grep + the data repo's on-disk `nfl/season-totals/<year>.json`,
which is what `dataStore.js` serves):

- **Opportunity share series already exists, precomputed.** `historicalShares` =
  `{ [player_id]: [{ season, share, gamesPlayed }] }`, oldest→newest, built by
  `computeHistoricalShares` (`src/utils/teamContext.js:219`). `share` = **carry share**
  (`rush_att / team rush_att`) for RB, **target share** (`rec_tgt / team rec_tgt`,
  falling back to `rec`) for WR/TE; **QBs are skipped**; entries gated at
  `gamesPlayed ≥ 8`. This reaches the app as the `historicalShares` prop
  (`App.jsx:1020`). **Reuse this — do not recompute share.**
- **Snap %: derive per-season from `careerStats`** — `off_snp / tm_off_snp` in
  `careerStats[season][pid].stats`. There is **no existing multi-season snap
  aggregator**: `usageMetrics.computeUsageFactors` (`src/utils/usageMetrics.js:128`)
  and `usePlayerProfile.snapShare` (`hooks/usePlayerProfile.js:179`,
  `projection.factors.snapShare`) both expose only the **most-recent** season. So the
  per-season snap series is the one new derivation in this slice.
- **Snap-field coverage (verified per season):** `off_snp` (player snaps) is present
  **2020→2025** and structurally **absent ≤2019** (0 finite rows 2012–2019, 1254 in
  2020 — matches `docs/signal-registry.md:13-14,46`). `tm_off_snp` is 2012+. So
  **snap % = `off_snp/tm_off_snp` is 2020+**. A snap *trend* needs ≥2 snap seasons →
  viable for any vet active 2021+; one-season players degrade to `—` (never crash).
- **Per-player season shape** (confirmed): `careerStats[season][pid]` =
  `{ gamesPlayed, fantasyPoints, gamesStarted, byeWeeks, dnpWeeks, weeklyPoints,
  weeklyStatus, availability, stats:{ off_snp, tm_off_snp, rush_att, rec, rec_tgt, … } }`.
- **The relevant set** = the `playerRows` prop already passed to the Value tab. App
  builds it as `playerRowsWithProj` (`App.jsx:532-557`), which is the
  relevance-gated (`isRelevantPlayer`) pipeline output carrying every field below.
  Outlook consumes it **as-is** (same source, same gate) — no pipeline change, no
  filter sidebar this slice.
- **Row fields already present** on each `playerRows` row (no threading needed):
  `player_id, position, full_name, age, nfl_team, years_exp, currentSeasonPPG,
  projectedPPG, projectionConfidence` (`'high'|'medium'|'low'|'rookie'`),
  `nextSeasonRank, dynastyScore, ktcValue, ownerTeamName, recentRank, movementLabel,
  careerSparkline`.
- **Props already forwarded.** `PlayersSurface` receives `playerRows, loaded,
  careerStats, playerMap, positionPeakPPG, ktcMap, ktcHistory, historicalShares,
  collegeStats, seasonProjections, enrichmentMap, advStats, myTeamName,
  fantasyTeamNames, comparisonList, addToComparison, removeFromComparison,
  clearComparison` (`App.jsx:1011-1032`) and currently spreads them only into
  `PlayersTab`. Outlook needs a subset of these — **no new props from App.jsx.**
- **Row-click → Profile wiring (live):** in `PlayersTab`, `<tr onClick={() =>
  setSelectedPlayerId(row.player_id)}>` (`PlayersTab.jsx:2068`) opens the panel; the
  compare cell stops propagation with `<td onClick={e => e.stopPropagation()}>`
  (`PlayersTab.jsx:2070`). The panel is `<ProfileDataContext.Provider value={{…}}>` +
  `<PlayerProfile>` (`PlayersTab.jsx:2219-2232`). **Outlook reproduces this exact
  pattern**: chevron cell stops propagation; rest-of-row opens the same
  `PlayerProfile`.
- **Trend tokens already exist** (light+dark in `src/index.css`): up =
  `--color-positive-text` (:70), down = `--color-negative-text` (:73), neutral/flat =
  `--color-market-neutral`/`--color-text-faint` (:39/:24), empties =
  `--color-text-faintest`. **No new color tokens** — nothing to add a `.dark` value for.

---

## 1. End state (what ships)

A new **Outlook table** on Players → Dynasty → Outlook, over the same relevant set as
Value, with position tabs (ALL/QB/RB/WR/TE) + column sort + pagination (no filter
sidebar). Columns:

| Col | Content | Source | Empty → |
|---|---|---|---|
| _(chevron)_ | expand toggle | local state | always shown |
| **Player** | name + sub-line `POS · age · TEAM · Nyr` | row | — |
| **Proj** | `projectedPPG` styled by confidence + muted `POSn` (`nextSeasonRank`) | row | `—` |
| **Snap trend** | latest-vs-prior snap % — arrow + Δpp | `buildUsageHistory`→`computeUsageTrend('snapPct')` | `—` (QB / <2 snap seasons) |
| **Opp trend** | latest-vs-prior target(WR/TE)/carry(RB) share — arrow + Δpp | `computeUsageTrend('share')` | `—` (QB / <2 share seasons) |
| **Role** | descriptive usage classification badge | `classifyRole` (cohort-tertile) | `—` (QB / no share / thin cohort) |

Clicking the **chevron** toggles an inline full-width detail row: a per-season
**usage-history** table (Season · G · Snap% · Carry/Target Share · PPG, most-recent
first). Clicking **anywhere else on the row** opens the existing `PlayerProfile`
panel, exactly like Value. The chevron/detail mechanism is a **reusable**
`ExpandableTableRow` + `ExpandChevron` (slice #4's game log reuses it).

Graceful everywhere: <2 metric seasons → no trend (`—`); missing snap/share → `—`;
QB → `—` for snap/opp/role but still shows Proj; never `NaN`, never a crash.

---

## 2. New files

### 2a. `src/utils/outlookUsage.js` — view-only derivations (pure)

Header comment must state: *view-only; never feeds projection/dynasty score; pure.*
Cite precedents: share series = `teamContext.computeHistoricalShares`; the
latest-vs-prior delta convention = the Profile **Role-History** "vs Prior" cell
(`PlayersTab.jsx:546-563`); cohort-percentile discipline = `usageMetrics.js`
(`percentileRank` within position cohort, `:40-45,71-104`).

```js
const SNAP_POSITIONS = new Set(['RB', 'WR', 'TE'])   // QB snap omitted: near-constant (~0.95), no signal — usageMetrics.js gates it out the same way
const TREND_EPS = 0.01                               // ±1pp dead-band — matches the Profile Role-History "vs Prior" thresholds

// round helpers: r2 = ×100/100, r3 = ×1000/1000

/**
 * Per-season usage history for one player, oldest→newest.
 * Snap% derived from careerStats (no existing multi-season snap aggregator);
 * share REUSED from the precomputed historicalShares series (not recomputed).
 *
 * @param {string} playerId
 * @param {string} position         'QB'|'RB'|'WR'|'TE'
 * @param {Object} careerStats      { [season]: { [pid]: { gamesPlayed, fantasyPoints, stats:{off_snp,tm_off_snp} } } }
 * @param {Object} historicalShares { [pid]: [{ season, share, gamesPlayed }] }  (oldest→newest; RB/WR/TE; gp≥8)
 * @returns {Array<{ season:number, games:number, ppg:number,
 *                   snapPct:number|null, share:number|null, shareMetric:'carry'|'target'|null }>}
 */
export function buildUsageHistory(playerId, position, careerStats, historicalShares) { … }
```
Logic:
- `shareMetric` = `RB`→`'carry'`, `WR`/`TE`→`'target'`, else `null`.
- `shareBySeason` = `Map(season→share)` from `historicalShares?.[playerId] ?? []`.
- For each `season` in `Object.keys(careerStats).map(Number).sort()`:
  - `d = careerStats[season]?.[playerId]`; skip if `!d` or `(d.gamesPlayed ?? 0) < 1`.
  - `games = d.gamesPlayed`; `ppg = d.gamesPlayed > 0 ? r2(d.fantasyPoints / d.gamesPlayed) : 0`.
  - `snapPct`: if `SNAP_POSITIONS.has(position)` and `d.stats?.off_snp != null` and
    `d.stats?.tm_off_snp > 0` → `r3(off_snp / tm_off_snp)`, else `null`.
  - `share = shareBySeason.get(season) ?? null` (QB → always `null`).
  - push `{ season, games, ppg, snapPct, share, shareMetric }`.
- Guard: `careerStats` null/empty → `[]`.

```js
/**
 * Latest-vs-prior trend over one metric key. Only seasons where history[i][key] != null
 * are considered; needs ≥2 → else null (insufficient). Uniform shape for snapPct and share.
 * @param {Array} history  buildUsageHistory output (oldest→newest)
 * @param {'snapPct'|'share'} key
 * @returns {{ latest, prior, delta, direction:'up'|'down'|'flat', latestSeason, priorSeason } | null}
 */
export function computeUsageTrend(history, key) {
  const pts = (history ?? []).filter(h => h[key] != null)
  if (pts.length < 2) return null
  const a = pts[pts.length - 2], b = pts[pts.length - 1]
  const delta = b[key] - a[key]
  const direction = delta > TREND_EPS ? 'up' : delta < -TREND_EPS ? 'down' : 'flat'
  return { latest: b[key], prior: a[key], delta, direction, latestSeason: b.season, priorSeason: a.season }
}
```
> **Why not reuse `computeShareTrend`?** It computes a *weighted 3-season* prior and
> returns a label (`growing/expanding/stable/shrinking/declining`), not "latest vs
> prior" — different semantics from the spec — **and it is a dynasty-score input**
> (`docs/signal-registry.md:74`). Keep display decoupled from it; do not modify it.
> `computeUsageTrend` is used for **both** columns so snap and opp render identically.

```js
/**
 * Position-cohort tertile cutoffs for most-recent snap% and most-recent share,
 * over the supplied per-player usage histories. Data-defined (tertiles), not
 * hand-picked — mirrors usageMetrics' percentile-within-cohort discipline.
 * @param {Array}  rows         relevant rows ({ player_id, position })
 * @param {Map}    usageByPlayer player_id → buildUsageHistory output (precomputed; avoids rebuild)
 * @returns {{ [pos]: { snap:[t33,t67]|null, share:[t33,t67]|null } }}  null pool when <MIN_COHORT (=6)
 */
export function buildRoleCohort(rows, usageByPlayer) { … }

/**
 * Descriptive role label from the player's MOST-RECENT snap% + share, banded against
 * the cohort tertiles. Purely descriptive (not advice). null (→ '—') for QB, missing
 * share, or an unbanded (thin) cohort.
 * @returns {string|null}
 */
export function classifyRole({ position, snapPct, share }, cohort) { … }
```
`buildRoleCohort`: for each RB/WR/TE row take the **latest non-null** `snapPct` and
`share` from `usageByPlayer.get(pid)`; pool per position; `tertiles(pool)` =
`[quantile(0.33), quantile(0.67)]` (sort asc, linear index), or `null` if
`pool.length < 6`.
`classifyRole` decision tree (document each cutoff inline):
- **RB** (`share` vs `[c33,c67]`, `snap` vs `s67`): `share≥c67 && snap≥s67` →
  `"Every-down back"`; `share≥c67` → `"Lead back"`; `share≥c33` → `"Committee back"`;
  else → `"Rotational back"`.
- **WR/TE** (`share` vs `[t33,t67]`, `snap` vs `s67`): `share≥t67 && snap≥s67` →
  `"Every-down"`; `share≥t67` → `"Primary target"`; `share≥t33` →
  `"Secondary target"`; else → `"Rotational"`.
- `snap` missing → omit the snap qualifier (top band → `"Lead back"`/`"Primary
  target"`, never `"Every-down…"`).
- `position==='QB'` or `share == null` or cohort pool `null` → return `null`.

> **Metrics-discipline note (read before keeping/cutting Role).** The constraint says
> ship a role note only if thresholds are non-arbitrary, else **defer**. Decision:
> **keep**, because (a) the user named these exact labels as the target, (b)
> grounding the bands in **position-cohort tertiles** makes the cutoffs
> *data-defined*, not hand-picked — the same percentile-within-cohort discipline
> `usageMetrics.js` already uses, and (c) the label is strictly descriptive (usage
> shape), never a buy/sell/start-sit. The Role column is **cleanly isolable**: if the
> user prefers to defer it, drop only the Role `<th>`/`<td>`, `classifyRole`,
> `buildRoleCohort`, and their tests — the rest of the slice is unaffected.

### 2b. `src/components/ui/ExpandableTableRow.jsx` — reusable expander (presentational)

Generic, zero domain knowledge — slice #4 reuses it. Two named exports.

```jsx
/** Rotating ▸/▾ toggle button. Caller wraps it in a stop-propagation cell. */
export function ExpandChevron({ expanded, onClick, label = 'Toggle details' }) { … }
// <button aria-label={label} aria-expanded={expanded} onClick={onClick}
//   className="w-6 h-6 rounded flex items-center justify-center text-[var(--color-text-faintest)]
//              hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors">
//   <span className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'}>▸</span>

/**
 * A table row plus an optional full-width detail row beneath it (React fragment of
 * two <tr>s — valid inside <tbody>). Summary cells (incl. the chevron cell) are
 * `children`; expanded content is `detail`. Row-body click → onRowClick; the chevron
 * cell itself must stopPropagation (caller's responsibility, mirrors the Value compare cell).
 */
export function ExpandableTableRow({ expanded, onRowClick, colSpan, detailClassName, children, detail }) {
  return (
    <>
      <tr onClick={onRowClick}
          className="border-b hover:bg-[var(--color-surface-2)] cursor-pointer transition-colors">
        {children}
      </tr>
      {expanded && (
        <tr className="border-b bg-[var(--color-surface-2)]">
          <td colSpan={colSpan} className={detailClassName ?? 'px-4 py-3'}>{detail}</td>
        </tr>
      )}
    </>
  )
}
```
Place in `src/components/ui/` alongside `ValueChip.jsx`. No state of its own —
expansion state lives in the parent (per CLAUDE.md *App.jsx owns all state*; this is
local UI state, like PlayersTab's `selectedPlayerId`/`page`, not app/global state, and
not a new hook).

### 2c. `src/components/players/OutlookTab.jsx` — the tab

Accepts the same prop bag `PlayersSurface` forwards (subset used). Mirrors
`PlayersTab`'s table/sort/pagination idioms; reuses `SortTh`, `PlayerProfile`,
`projectionConfidenceClass` from `PlayersTab.jsx` (exported in §3b).

Props used: `playerRows, loaded, careerStats, historicalShares, playerMap,
positionPeakPPG, ktcMap, collegeStats, seasonProjections, enrichmentMap, advStats,
comparisonList, addToComparison, removeFromComparison`.

Local state: `posFilter` (`'ALL'`), `sortState` (own localStorage key
`outlook-sort`, default `{ column:'projectedPPG', direction:'desc' }`), `page`,
`expanded` (`useState(() => new Set())`), `selectedPlayerId`.

Memos (in order):
1. `usageByPlayer` = `Map(pid → buildUsageHistory(pid, row.position, careerStats,
   historicalShares))` over `playerRows`. Deps `[playerRows, careerStats,
   historicalShares]`. (~rows×seasons, memoized — cheap.)
2. `roleCohort` = `buildRoleCohort(playerRows, usageByPlayer)`.
3. `enrichedRows` = `playerRows.map(r => { const h = usageByPlayer.get(r.player_id);
   const latest = lastNonNull(h); return { ...r, _history:h,
   _snapTrend:computeUsageTrend(h,'snapPct'), _oppTrend:computeUsageTrend(h,'share'),
   _role:classifyRole({position:r.position, snapPct:latest?.snapPct ?? null,
   share:latest?.share ?? null}, roleCohort) } })`.
4. `displayRows` = position-filter (`posFilter !== 'ALL'`) → sort → (then paginate).
   Sort mirrors `PlayersTab.jsx:1943-1955` null-handling. Special keys:
   `_snapTrend`/`_oppTrend` → compare `?.delta` (null last); `_role` → `ROLE_ORDER`
   map (Every-down/Lead/Primary highest → Rotational lowest, null last);
   `projectedPPG`/`full_name` → generic numeric/string. `handleSort` +
   `defaultSortForPosition` (ALL→projectedPPG desc; specific pos→projectedPPG desc)
   mirror `PlayersTab.jsx:1852-1871`; persist to `outlook-sort`.
5. Pagination: local `const PAGE_SIZE = 50` (UI constant; matches Value); slice like
   `PlayersTab.jsx:1958-1963`.

Render:
- Position tabs (ALL/QB/RB/WR/TE) — reuse the exact pill markup of
  `PlayersTab.jsx:1970-1977`.
- `!loaded` → italic "Player data loading…" line (`PlayersTab.jsx:1997-1999`).
- `<table className="w-full text-sm table-fixed">` with `<colgroup>` + `<thead>` of
  `SortTh`s (chevron col blank `<th/>`; `Player full_name`; `Proj projectedPPG`;
  `Snap trend _snapTrend`; `Opp trend _oppTrend`; `Role _role`) + tooltips.
- Body: `pageRows.map(row => <ExpandableTableRow key={row.player_id}
  expanded={expanded.has(row.player_id)} colSpan={6}
  onRowClick={() => setSelectedPlayerId(row.player_id)}
  detail={<UsageHistoryPanel history={row._history} shareMetric={…} />}>` … cells …
  `</ExpandableTableRow>`.
  - **Chevron cell**: `<td onClick={e => e.stopPropagation()}><ExpandChevron
    expanded={expanded.has(id)} onClick={() => toggleExpanded(id)} /></td>`
    (`toggleExpanded` adds/removes id in a cloned Set).
  - **Player cell**: copy the name + sub-line block (`PlayersTab.jsx:2100-2111`).
  - **Proj cell**: `<span className={projectionConfidenceClass(row.projectionConfidence)}>
    {row.projectedPPG.toFixed(1)}</span>` then muted `{row.position}{row.nextSeasonRank}`
    when present; `—` when `projectedPPG == null`.
  - **Snap/Opp trend cells**: `<TrendCell trend={row._snapTrend} />` /
    `<TrendCell trend={row._oppTrend} />` (see below).
  - **Role cell**: neutral badge `bg-[var(--color-surface-3)]
    text-[var(--color-text-secondary)]` (deliberately *not* colored like a
    recommendation) or `—`.
  - Empty body (`pageRows.length === 0`) → colSpan=6 "No players…" / "Loading…"
    (`PlayersTab.jsx:2182-2188`).
- Pagination controls (`PlayersTab.jsx:2194-2205`).
- **Profile panel** (coexists with the expander): reproduce
  `PlayersTab.jsx:2219-2232` —
  ```jsx
  {selectedPlayerId && careerStats && (
    <ProfileDataContext.Provider value={{ careerStats, playersMap: playerMap, playerRows,
      positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
      enrichmentMap, advStats }}>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedPlayerId(null)} />
      <PlayerProfile key={selectedPlayerId} playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)} onSelectPlayer={setSelectedPlayerId}
        comparisonList={comparisonList} addToComparison={addToComparison}
        removeFromComparison={removeFromComparison} />
    </ProfileDataContext.Provider>
  )}
  ```
  Import `ProfileDataContext` from `../../context/ProfileDataContext` and
  `PlayerProfile`/`SortTh`/`projectionConfidenceClass` from `../PlayersTab`.
  (Comparison **tray** is out of scope — Outlook opens the profile and toggles
  history only; no `+`/compare column.)

Local presentational sub-components in this file:
- `TrendCell({ trend })`: `null` → `<span className="text-[var(--color-text-faintest)]
  text-xs">—</span>`; else arrow (`↑`/`↓`/`→`) + `{delta>0?'+':''}{Math.round(delta*100)}%`
  colored `up→--color-positive-text`, `down→--color-negative-text`,
  `flat→--color-market-neutral`. Tooltip: `"{latestSeason}: {round} vs {priorSeason}: {round}"`.
- `UsageHistoryPanel({ history, shareMetric })`: compact `text-xs` table (reuse the
  Profile Role-History/Career table styling, `PlayersTab.jsx:537-568`), columns
  **Season · G · Snap% · {Carry|Target} Share · PPG**, `[...history].reverse()`;
  `null` cells → `—`. Header label `Carry Share` when `shareMetric==='carry'` else
  `Target Share`. When `history.length === 0` → muted "No usage history."

`ROLE_ORDER` map + `lastNonNull(history)` helper are module-local to OutlookTab.

---

## 3. Edits to existing files

### 3a. `src/components/players/PlayersSurface.jsx` (the ONLY tab-shell edit)

No tab-state / localStorage / tab-list changes. Swap the placeholder for the real
component and forward props:
- Line 3: `import { OutlookPlaceholder } from './OutlookPlaceholder'` →
  `import { OutlookTab } from './OutlookTab'`.
- Line 78: `{dynastyTab === 'outlook'  && <OutlookPlaceholder />}` →
  `{dynastyTab === 'outlook'  && <OutlookTab {...props} />}`.

### 3b. `src/components/PlayersTab.jsx` (additive exports + one behavior-preserving extraction)

1. **Line 88** — `function SortTh(` → `export function SortTh(`. (Additive; reuse the
   exact sort header.)
2. **Line 286** — `function PlayerProfile(` → `export function PlayerProfile(`.
   (Additive; lets Outlook open the same panel. Closes over module scope — unchanged.)
3. **Extract `projectionConfidenceClass`** (the task mandates reusing the Explorer's
   confidence styling). Add near the other small helpers (after
   `dynastyLabelColor`, ~line 130):
   ```js
   export function projectionConfidenceClass(confidence) {
     return confidence === 'high'   ? 'font-bold text-[var(--color-text)]'
          : confidence === 'medium' ? 'text-[var(--color-text-strong)]'
          : confidence === 'low'    ? 'text-[var(--color-text-muted)]'
          : confidence === 'rookie' ? 'italic text-[var(--c-purple-700)] opacity-70'
          :                           'text-[var(--color-text-muted)]'
   }
   ```
   Then rewrite the Proj cell (`PlayersTab.jsx:2120-2130`) to
   `<span className={projectionConfidenceClass(row.projectionConfidence)}>` —
   **byte-identical output**, no Value-tab behavior change (guarded by the existing
   Value render + the new component test). This is the single-source path the
   "reuse, don't re-derive" constraint requires; the alternative (duplicating the
   5-case map in Outlook) is explicitly worse.

### 3c. `src/components/players/OutlookPlaceholder.jsx` — delete

Orphaned after 3a (sole importer was PlayersSurface). Remove the file and its two doc
references (§5: CLAUDE.md component table, README tree).

### 3d. `src/components/players/PlayersSurface.test.jsx` — update for the new wiring

The current test #2 asserts the placeholder heading (`getByRole('heading', { name:
'Outlook' })`) and renders `PlayersSurface` with no data props — a real `OutlookTab`
would crash. Mirror the existing `PlayersTab` mock:
```js
vi.mock('./OutlookTab', () => ({ OutlookTab: () => <div data-testid="outlook">outlook</div> }))
```
and change test #2's assertion from the heading to
`expect(screen.getByTestId('outlook')).toBeTruthy()` (keep the
`localStorage.getItem('players-dynasty-tab')==='outlook'` assertion). Tests #1/#3/#4
unchanged.

---

## 4. Step sequence (for the implementer)

1. `src/utils/outlookUsage.js` + `outlookUsage.test.js` → `npm test` green for the util.
2. `src/components/ui/ExpandableTableRow.jsx` + `.test.jsx`.
3. `PlayersTab.jsx` exports + `projectionConfidenceClass` extraction (3b).
4. `src/components/players/OutlookTab.jsx` + `OutlookTab.test.jsx`.
5. `PlayersSurface.jsx` swap (3a); delete `OutlookPlaceholder.jsx` (3c); update
   `PlayersSurface.test.jsx` (3d).
6. Docs (§5).
7. Done-definition: `npm test`, `npm run lint`, `npm run build` all clean. (No
   `factorsSchema`/`statKeysContract` impact — no projection/stat-key change.) Hand
   back for the user's manual smoke (do **not** run the dev server).

---

## 5. Docs updates (concrete before/after)

### `docs/ui.md`

**(a) Tab description, line 32** — Outlook is no longer a placeholder. Before:
> … **Value** is the default and is the Player Explorer (below). **Outlook** and **NFL stats** are labeled "coming soon" placeholders (later slices). **Weekly** is a gated placeholder …

After:
> … **Value** is the default and is the Player Explorer (below). **Outlook** is a next-season-projection + usage-trend table with an expandable per-season usage history (see *Outlook tab* below). **NFL stats** is a labeled "coming soon" placeholder (later slice). **Weekly** is a gated placeholder …

**(b) New section** after the Player Explorer block (before `## SpiderChart`, ~line 115):
```md
## Outlook tab (`src/components/players/OutlookTab.jsx`)

The **Players → Dynasty → Outlook** tab. Same relevant player set as the Explorer
(the `playerRows` prop), with ALL/QB/RB/WR/TE position tabs, column sort
(`localStorage['outlook-sort']`, default Proj ↓) and pagination — but **no filter
sidebar** this slice. **Display-only**: nothing here feeds projection or the dynasty
score.

| Column | Notes |
|---|---|
| _(chevron)_ | Toggles an inline per-season usage-history panel |
| **Player** | Name + sub-line `POS · age · TEAM · Nyr` |
| **Proj** | Next-season `projectedPPG` (confidence-styled, shared with the Explorer) + muted next-season positional rank |
| **Snap trend** | Latest-vs-prior snap % (`off_snp/tm_off_snp`), arrow + Δ percentage-points. RB/WR/TE, 2020+ data; `—` for QB or <2 snap seasons |
| **Opp trend** | Latest-vs-prior **target** (WR/TE) / **carry** (RB) share, arrow + Δpp; `—` for QB or <2 share seasons |
| **Role** | Descriptive usage class — RB: Every-down / Lead / Committee / Rotational back; WR/TE: Every-down / Primary / Secondary target / Rotational. Banded against position-cohort tertiles of the most-recent snap% + share. Purely descriptive (not advice); `—` for QB / no share / thin cohort |

**Trends & history.** Snap % is derived per season from `careerStats`
(`off_snp/tm_off_snp`); the target/carry **share series is reused** from
`historicalShares` (`computeHistoricalShares`) — not recomputed. `computeUsageTrend`
(`src/utils/outlookUsage.js`) takes latest vs the immediately-prior season **that has
the metric** (≥2 → else `—`); ±1pp dead-band, same convention as the Profile
Role-History "vs Prior" cell. Trend coloring uses the up/down/neutral semantic tokens.

**Row interactions.** The chevron (a stop-propagation cell, like the Explorer compare
cell) toggles the inline history panel — Season · G · Snap% · Carry/Target Share ·
PPG, most-recent first. Clicking the rest of the row opens the same **Player Profile**
panel as the Explorer. The expand mechanism is the reusable
`src/components/ui/ExpandableTableRow.jsx` (`ExpandableTableRow` + `ExpandChevron`).
```

### `docs/signal-registry.md`

Add three **view-only** rows to the 3B view-layer block, after line 97 (the KTC Δ row):
```md
| Outlook snap trend (latest-vs-prior `off_snp/tm_off_snp`) | computed factor (view-layer) | app: `src/utils/outlookUsage.js` (`buildUsageHistory`/`computeUsageTrend`), from in-memory `careerStats` | **2020+** (gated by `off_snp`) | **Reconstructable 2020+** (pure fn of season totals) | **view-only display** (Players Outlook tab; never moves `projectedPPG`/dynasty score) |
| Outlook opportunity trend (latest-vs-prior carry/target share) | computed factor (view-layer) | app: `src/utils/outlookUsage.js` `computeUsageTrend`, **reusing** `teamContext.computeHistoricalShares` | all seasons in `historicalShares` (gp≥8) | **Reconstructable** (pure fn of the share series) | **view-only display** (Players Outlook tab; never moves `projectedPPG`/dynasty score) |
| Outlook role note (cohort-tertile usage class) | computed factor (view-layer) | app: `src/utils/outlookUsage.js` (`buildRoleCohort`/`classifyRole`), from most-recent snap%+share | most-recent season per player | **Reconstructable** (descriptive; tertiles over the relevant set) | **view-only display** (Players Outlook tab; descriptive only — not a recommendation; never moves `projectedPPG`/dynasty score) |
```

### `CLAUDE.md`

1. **Navigation map, line 32** — change "Outlook/NFL stats are placeholders, Weekly is
   gated" to "Outlook is a projection/usage-trend table (`OutlookTab`), NFL stats is a
   placeholder, Weekly is gated."
2. **Component table** — split the combined placeholder row. Before:
   > `players/{OutlookPlaceholder,NflStatsPlaceholder}.jsx` | Non-gated "coming soon" placeholders for the Dynasty Outlook / NFL-stats sub-tabs (later slices).

   After (two rows):
   > `players/OutlookTab.jsx` | Players → Dynasty → Outlook table: next-season projection + snap/opportunity usage trends + descriptive role note, with a reusable expandable per-season usage-history row. Display-only (never feeds projection/dynasty). Reuses `PlayerProfile`/`SortTh`/`projectionConfidenceClass` (exported from `PlayersTab.jsx`) and `historicalShares`.
   > `players/NflStatsPlaceholder.jsx` | Non-gated "coming soon" placeholder for the Dynasty NFL-stats sub-tab (later slice).
3. **Component table** — add a `ui/ExpandableTableRow.jsx` row:
   > `ui/ExpandableTableRow.jsx` | Reusable table-row expander (`ExpandableTableRow` + `ExpandChevron`) — a row plus an optional full-width detail row; presentational, state-free. Used by the Outlook usage-history panel (slice #4 game log reuses it).
4. **utils** — add an `outlookUsage.js` row:
   > `outlookUsage.js` | `buildUsageHistory`, `computeUsageTrend`, `buildRoleCohort`, `classifyRole` — view-only Outlook usage derivations (per-season snap%/share history, latest-vs-prior trends, cohort-tertile role note). Reuses `historicalShares`; never feeds projection/scoring.
5. Note PlayersTab's row description already says "PlayerProfile panel" — add "(`PlayerProfile`, `SortTh`, `projectionConfidenceClass` now exported for the Outlook tab)" to the `PlayersTab.jsx` row.

### `README.md`

- Component tree (lines 122-130): replace the `OutlookPlaceholder.jsx` line with
  `OutlookTab.jsx  # Players → Dynasty → Outlook table (projection + snap/opp usage trends + role note; expandable per-season usage history)`; add under `ui/`:
  `ExpandableTableRow.jsx  # Reusable table-row expander (ExpandableTableRow + ExpandChevron); presentational`.
- Utils tree (after line 155): add
  `outlookUsage.js     # buildUsageHistory / computeUsageTrend / buildRoleCohort / classifyRole — view-only Outlook usage derivations`.

---

## 6. Tests to add

### `src/utils/outlookUsage.test.js` (node env; plain vitest, like `seasonRanks.test.js`)
Fixtures: hand-built `careerStats` (3 seasons) + `historicalShares`.
- **buildUsageHistory**
  - WR with snap+share across 2 seasons → rows oldest→newest; `ppg` =
    `round2(fp/gp)`; `snapPct` = `round3(off_snp/tm_off_snp)`; `share` pulled from
    `historicalShares` (assert it equals the series value, **not** a recompute);
    `shareMetric==='target'`.
  - RB → `shareMetric==='carry'`.
  - QB → every `snapPct` and `share` is `null`.
  - Season with `gamesPlayed:0` → omitted.
  - `off_snp` present but `tm_off_snp:0`/missing → `snapPct:null` (no NaN/Infinity).
  - Player absent from `historicalShares` → `share:null` (no throw).
  - Empty/null `careerStats` → `[]`.
- **computeUsageTrend**
  - 2+ snap seasons → correct `delta`/`direction`; boundary: `delta=+0.01` → `flat`,
    `+0.011` → `up`, `-0.011` → `down`.
  - 1 metric season → `null`; 0 → `null`.
  - Gap season (middle season missing the metric) → uses the last two **with** the
    metric; `latestSeason`/`priorSeason` reflect that.
  - Same fn drives `'snapPct'` and `'share'` (both asserted).
- **buildRoleCohort / classifyRole**
  - Cohort with ≥6 RBs → tertiles produce `Every-down back` (top share+snap),
    `Lead back` (top share, mid snap), `Committee back` (mid), `Rotational back` (low).
  - WR/TE → `Every-down` / `Primary target` / `Secondary target` / `Rotational`.
  - `snapPct:null` at top share → qualifier dropped (`Lead back`/`Primary target`).
  - QB → `null`; missing share → `null`; pool `<6` → cohort `null` → `classifyRole`
    returns `null`.

### `src/components/ui/ExpandableTableRow.test.jsx` (jsdom; render/screen/fireEvent + jest-dom, like `ValueChip.test.jsx`)
Wrap in `<table><tbody>…</tbody></table>`.
- `expanded={false}` → detail not in DOM; summary cells present.
- `expanded={true}` → detail row present; its `<td>` has `colSpan` = passed value.
- `ExpandChevron` `onClick` fires; `aria-expanded` reflects `expanded`.
- **Coexistence**: clicking the chevron (inside a stop-propagation cell) does **not**
  call `onRowClick`; clicking the row body **does** (the canonical bug this guards).

### `src/components/players/OutlookTab.test.jsx` (jsdom)
`vi.mock('../PlayersTab', …)` to stub `PlayerProfile`
(`({playerId}) => <div data-testid="profile">{playerId}</div>`) while keeping real
`SortTh`/`projectionConfidenceClass` (re-export them from the mock, or mock only
`PlayerProfile` via `importActual`). Small real-shaped props: 3–4 rows incl. one WR
(2 snap+share seasons), one 1-season rookie, one QB.
- Renders a row per relevant player (post position-filter).
- Proj cell shows `projectedPPG.toFixed(1)` with the high-confidence class
  (`font-bold`); `nextSeasonRank` shown; null projection → `—`.
- WR row: snap/opp trend cells show an arrow + `%`; rookie row: both `—`; QB row:
  snap/opp/role `—` but Proj shown.
- Clicking the chevron expands → usage-history panel rows visible (Season/Snap%/Share).
- Clicking the row body → `data-testid="profile"` appears with the right `playerId`;
  chevron click does **not** open it.
- Clicking a `SortTh` reorders (e.g. Proj asc/desc).
- No `NaN`/empty-crash with the 1-season and QB rows.

### `src/components/players/PlayersSurface.test.jsx` — updated (§3d), not new.

---

## 7. Cross-repo impact

**None — entirely app-side.** Every field consumed is already served and verified:
`historicalShares` is computed in-app from `careerStats`; the per-season snap inputs
`off_snp`/`tm_off_snp` are already present in the served
`nfl/season-totals/<year>.json` (`off_snp` 2020+, `tm_off_snp` 2012+ — verified
against the data repo on disk and `docs/signal-registry.md:13-14,46`). No served
shape, manifest field, schema version, or snapshot contract changes. No
`sleeper-dashboard-data` change required.
