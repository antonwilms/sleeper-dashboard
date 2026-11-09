# Team depth chart view (Brief T)

Review depth: full — first app consumer of a served data family (`nflverse/oline`), which creates a new cross-repo coupling (CR-35) and edits the contract index; new route-state (search param) on `/teams/:abbr`; new App.jsx side-load.

Session 2 runs on **sonnet**, effort medium.

## Goal

A "Depth chart" tab on `/teams/:abbr`, laid out like a formation: offence (QB, RB, LWR/SWR/RWR, TE, OL LT–RT), defence (DL, LB, DB), special teams (K, P, LS). Starter per slot prominent, backups underneath in order. QB/RB/WR/TE/K carry the fantasy layer (league owner, "yours" highlight, click → pop-up, injury marker). The player pop-up's team name/logo links to the team page with the depth chart open. The existing team-page content stays as the default "Overview" tab.

## Out of scope

Historical depth charts; defensive stats; pop-up layout rework (including the no-dynasty-data fallback header in `PlayerDetailModal.jsx`, which shows no team and stays unlinked); nflverse `depth` family (non-OL ESPN depth); any projection/scoring change; injury markers / clicks for defenders, P and LS; retiring or rewording any CR entry beyond the byte trims in §8.

## Facts checked at planning time (2026-11-09)

- **Players map is unfiltered.** `App.jsx:950` stores `getAllPlayers()` (`src/api/sleeper.js:43`, raw `/players/nfl`) straight into `leagueData.playerMap` (`App.jsx:1059`); `src/utils/cache.js` stores it whole. The brief's stop condition does not fire.
- Live `/players/nfl` (fetched 2026-11-09) `depth_chart_position` codes on rostered players: `QB, RB, LWR, SWR, RWR, TE, OL, LDE, LDT, NT, RDT, RDE, DL, LOLB, LILB, MLB, RILB, ROLB, SLB, LB, LCB, NB, RCB, SS, FS, DB, K, P, LS`. `WLB` is a known Sleeper code not seen today. Every Sleeper OL record carries only the generic `OL` code (so OL slots must come from oline). Codes are cross-position in places (DT at `RDE`, LB at `SS`, FB at `RB`, one DT at `OL`) — **the slot comes from the code, not from `position`.**
- `depth_chart_order` is an int or null; `injury_status` values seen: `IR, Out, Questionable, PUP, COV, NA, DNR` (plus `Doubtful`, `Sus` historically).
- `nflverse/oline/2026.json` (data repo, schemaVersion 1, ~3.1 MB): `{ schemaVersion, season, generatedAt, source, rowCount, teamCount, stateCount, teams }`; `teams[abbr].states[]` = `{ week, date, dt, ol: [{ slot, rank, name, gsisId, espnId }] }`. Team keys are the **schedule domain** (`LA`, not `LAR`) — the same domain as the `/teams/:abbr` route param. Slots seen: `LT LG C RG RT` only. States are oldest-first today, but this plan selects by max `dt`, not position.
- **OL id coverage is low.** Of 423 OL entries in the 2026-11-07 states, 107 (25%) resolve to a Sleeper id; 51 of 160 rank-1 starters. Sleeper's own `gsis_id`/`espn_id` fields cover every match the nflverse crosswalk (`nflverse/playerids.json`, CR-31) does — the crosswalk adds **zero** OL matches (data-catalog: "OL are largely absent from the DynastyProcess crosswalk"). One id hit is a cross-position record (Bill Murray, Sleeper `DT`) — kept, since the surname agrees.
- `docs/cross-repo-registry.md` is 12,885 bytes against a 13,000 cap and its header lists `nflverse/oline/` under "Not contracts". `src/api/dataStore.js:133` already lists `oline` in `ROW_COUNT_FAMILIES`.
- `PlayerDetailModal*.test.jsx` / `PlayerDetailTabs.test.jsx` render **without** a Router; `TeamDetail.test.jsx` uses `MemoryRouter` via `renderAt(path, props)`.

## Design decisions (fixed — do not revisit)

- **D1 OL id join uses Sleeper's own id fields, not the nflverse crosswalk.** The brief says "existing ID crosswalk (gsis/espn → sleeper)". Sleeper's `playerMap[sid].gsis_id` / `.espn_id` *are* a gsis/espn → sleeper crosswalk, already in memory, and cover a superset of what `playerids.json` gives for OL (see facts). Using `playerids.json` would add a second 1 MB+ load and widen CR-31 (`ids[].sleeperId` is not in its invariant) for zero extra matches. The join is id-only; `surnameAgrees` (`src/utils/playerIdCrosswalk.js`) is a **guard** on an id hit (its header: ids carry wrong rows), never a match by itself. Session 1 flags this deviation to Anton.
- **D2 Sleeper's generic `OL` code is not rendered.** OL slots come only from oline. A Sleeper player whose `depth_chart_position === 'OL'` is excluded from every unit (incl. the one DT carrying it). This is the brief's "OL comes from the oline ranks", not a dropped generic code.
- **D3 Players with a null `depth_chart_position` are not on the chart.** They have no code to group; this is Sleeper saying "not on the depth chart", not a dropped code.
- **D4 Unknown codes are never dropped.** A code not in `SLOT_UNIT` resolves its unit from `position` via `POSITION_UNIT` into that unit's `other` list; if `position` also does not resolve, into `unplaced`. Generic `DL`/`LB`/`DB` go to that unit's `generic` list.
- **D5 Tab state lives in the URL**: `/teams/:abbr?view=depth` (react-router `useSearchParams`). Anything else (absent, unknown) = Overview. The pop-up deep-links to it.
- **D6 Depth view is independent of the overview's gates.** It renders whenever the abbr is a current team code (`CURRENT_TEAM_CODES`) — it does not wait for `careerStats` (`loaded`) or `teamContextByYear`. Its own loading state is `playersMap == null`.
- **D7 oline loads on demand, for the live season only.** `App.jsx` loads `nflverse/oline/<parseInt(nflState.season)>.json` only after the depth view first mounts (`onNeedOline`), once per app session. The loader caches only the latest state per team (≈50 KB, not 3 MB).
- **D8 No shared row floor.** `MIN_OLINE_ROWS` is data-internal ("not a cross-repo contract; no app counterpart" — data-catalog.md). `isValidOline` is structural only; CR-35 carries no floor.
- **D9 Pop-up link is a react-router `<Link to="/teams/<code>?view=depth">`.** `PlayerDetailModal` is always mounted inside `<HashRouter>` (`App.jsx:1374`), so production needs nothing; the six test files that render it without a Router (`PlayerDetailModal.test.jsx`, `.usageAvailability`, `.gameLogDistribution`, `.environment`, `.seasonPhase`, `PlayerDetailTabs.test.jsx`) wrap their render helper in `<MemoryRouter>` — "tests follow production shape, not set it" (`Teams.jsx:20-26` precedent). No raw `#/…` anchor. The `<Link>`'s `onClick` closes the pop-up (`onCloseAll`) so the route is visible.
- **D10 Link targets.** A Sleeper team code links iff `normalizeTeamForSchedule(team)` ∈ `CURRENT_TEAM_CODES` (= `NFL_TEAMS.map(normalizeTeamForSchedule)`, imported, not copied). `null`, `'FA'` and stale codes (`OAK` appears on stale Sleeper records) → no link.
- **D11 Fantasy layer is by slot, not position.** Slots `QB, RB, LWR, SWR, RWR, TE, K` (`FANTASY_SLOTS`) render name-as-button, owner, injury chip. A mapped OL renders name-as-button only (the brief's "link"); its pop-up is the existing no-dynasty fallback, which is accepted. Every other entry is plain text.
- **D12 Injury abbreviations move, not copy.** `Portfolio.jsx:54`'s private `ABBR` moves to `src/utils/injuryStatus.js` as `INJURY_ABBR` + `injuryShort`; Portfolio imports it. No copied definition is created by this slice.

## 1. `src/utils/injuryStatus.js` (new, pure)

```js
export const INJURY_ABBR = { Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUS' }
export function injuryShort(status) // null/'' → null; else INJURY_ABBR[status] ?? String(status).toUpperCase()
```

`src/components/portfolio/Portfolio.jsx`: delete the local `ABBR` (line 54); line 208's `(ABBR[status.status] ?? status.status.toUpperCase())` becomes `injuryShort(status.status)`. `INJURY_CLAUSES` stays where it is. No other Portfolio change.

## 2. `src/utils/teamLink.js` (new, pure)

```js
import { NFL_TEAMS } from './marketFilters'
import { normalizeTeamForSchedule } from './nflStats'
export const CURRENT_TEAM_CODES = new Set(NFL_TEAMS.map(normalizeTeamForSchedule)) // schedule domain, 32
export function teamPageCode(sleeperTeam)        // → schedule code if in CURRENT_TEAM_CODES, else null ('FA', null, 'OAK' → null; 'LAR' → 'LA')
export function teamDepthChartPath(sleeperTeam)  // → `/teams/${code}?view=depth` (router path, no '#') or null
```

## 3. `src/utils/depthChart.js` (new, pure; imports only `nflStats.normalizeTeamForSchedule`, `playerIdCrosswalk.surnameAgrees`, `rosterSlots.rosteredPlayers`)

Header comment states: Sleeper slot codes are the slot; `OL` excluded (D2); null code = not on chart (D3); unknown codes never dropped (D4); view-only.

**Not `buildTeamDepthChart`.** `src/utils/teamContext.js:379` (`buildTeamDepthChart`, a PIPELINE module used by `usePlayerProfile.js:157` and `projectionSnapshot.js`) already builds a per-team depth chart for the pop-up and snapshots — grouped by **position**, null order → 99, ties broken by PPG. `depthChart.js` is deliberately separate: grouped by Sleeper **slot code**, null order last, ties by name, no PPG. Do not import, reuse, modify or unify it (see CLAUDE.md "Two `teamContext` modules"); the header comment records this and the differing starter semantics.

```js
// Display order inside each unit is left → right on the formation.
export const UNITS = [
  { id: 'WR', side: 'offence', slots: ['LWR', 'SWR', 'RWR'] },
  { id: 'TE', side: 'offence', slots: ['TE'] },
  { id: 'OL', side: 'offence', slots: ['LT', 'LG', 'C', 'RG', 'RT'] },   // oline-sourced (§3b)
  { id: 'QB', side: 'offence', slots: ['QB'] },
  { id: 'RB', side: 'offence', slots: ['RB'] },
  { id: 'DL', side: 'defence', slots: ['LDE', 'LDT', 'NT', 'RDT', 'RDE'], optional: ['NT'], generic: 'DL' },
  { id: 'LB', side: 'defence', slots: ['LOLB', 'WLB', 'LILB', 'MLB', 'RILB', 'SLB', 'ROLB'], optional: ['WLB', 'LILB', 'RILB', 'SLB'], generic: 'LB' },
  { id: 'DB', side: 'defence', slots: ['LCB', 'NB', 'SS', 'FS', 'RCB'], generic: 'DB' },
  { id: 'ST', side: 'special', slots: ['K', 'P', 'LS'] },
]
export const SLEEPER_OL_CODE = 'OL'
export const FANTASY_SLOTS = new Set(['QB', 'RB', 'LWR', 'SWR', 'RWR', 'TE', 'K'])
// Derived from UNITS (not a literal): every non-OL slot code → its unit id; each unit's `generic` code → that unit.
export const SLOT_UNIT   // { QB:'QB', LWR:'WR', …, LDE:'DL', DL:'DL', LB:'LB', DB:'DB', K:'ST', … }
export const POSITION_UNIT = { QB:'QB', RB:'RB', FB:'RB', WR:'WR', TE:'TE', DE:'DL', DT:'DL', NT:'DL', DL:'DL',
  LB:'LB', ILB:'LB', OLB:'LB', CB:'DB', S:'DB', SS:'DB', FS:'DB', DB:'DB', K:'ST', P:'ST', LS:'ST' }
```

### 3a. `buildDepthChart({ playersMap, abbr })`

Players: every `[sid, p]` with `normalizeTeamForSchedule(p.team) === abbr`, `typeof p.depth_chart_position === 'string' && p.depth_chart_position !== ''`, and code `!== SLEEPER_OL_CODE`.

```js
Entry = { id, name, position, code, order /* number|null */, injuryStatus /* string|null */, injuryBodyPart /* string|null */ }
// name = p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(' ') || sid)   // parens required: ?? cannot mix with || unparenthesised
returns {
  slots:    { [slotCode]: Entry[] },     // one key per non-OL slot in UNITS, [] when empty
  generic:  { DL: Entry[], LB: Entry[], DB: Entry[] },
  other:    { [unitId]: Entry[] },       // unknown code, unit from POSITION_UNIT[p.position]; key present only when non-empty
  unplaced: Entry[],                     // unknown code and unknown position
}
```
Routing: code is a slot key in `slots` → `slots[code]`; code equals a unit's `generic` → `generic[unit]`; else `POSITION_UNIT[position]` → `other[unit]`; else `unplaced`. Every list sorted by `order` ascending (null last), then `name.localeCompare`, then `id`. `[0]` is the starter. `playersMap` null → all-empty shape.

### 3b. OL

```js
export function selectLatestOlineStates(teams) // { [abbr]: { dt, date, ol } } — per team, the state with max Date.parse(dt) (NaN dt → Date.parse(date)); teams with no states omitted; input null → {}
export function buildOlIdIndex(playersMap)     // { byGsis: Map, byEspn: Map } from String(p.gsis_id).trim() / String(p.espn_id).trim();
//   a record whose id is null, undefined or '' (after trim) contributes NO key to that map (never "null"/"undefined");
//   a key held by 2+ sids is removed from its map
export function resolveOlSleeperId(entry, index, playersMap)
//   g = entry.gsisId (non-empty) ? byGsis.get(String(entry.gsisId).trim()) : undefined
//   e = entry.espnId (non-null, non-empty) ? byEspn.get(String(entry.espnId).trim()) : undefined   — never look up "null"
//   g && e && g !== e → null; sid = g ?? e ?? null; !sid → null
//   !surnameAgrees(entry.name, playersMap[sid]?.full_name) → null; else sid
export function buildOlSlots(state, index, playersMap)
//   → { slots: { LT, LG, C, RG, RT: OlEntry[] }, other: OlEntry[] }   // other = an unrecognised slot string, never dropped
//   OlEntry = { name, rank, slot, sleeperId /* string|null */ }; each list sorted by rank asc; state null → all []
export function buildOwnerIndex(rosterTeams)   // Map<sid, teamName> over rosteredPlayers(team); null → empty Map
```

## 4. Loader — `src/api/nflOline.js` (new) + `isValidOline` in `src/api/dataStore.js`

Modelled line-for-line on `src/api/nflSchedule.js` (header comment: READ-ONLY / view-only, never imported by projection/scoring; served shape; graceful absence; consumers branch on `complete`).

```js
// dataStore.js, beside isValidTeamContext. Structural only — no row floor (D8).
export function isValidOline(p) // object, non-array; p.teams non-null object with ≥1 key; first team's states is a non-empty array; states[0].ol is an array
// nflOline.js
export const OLINE_EMPTY = Object.freeze({ latestByTeam: Object.freeze({}), year: null, complete: false, generatedAt: null })
export async function loadNflOline(year)
```
Every graceful-absence return is `{ ...OLINE_EMPTY }`. Steps: `getManifestEntry('nflverse/oline/${year}.json')` absent → empty. Cache `getCacheRecord('nfl-oline/${year}')` hit when `rec?.data?.lastModified === entry.lastModified && rec?.data?.latestByTeam` (optional chaining as `nflSchedule.js:69` — a cache miss must not throw) → `{ latestByTeam: rec.data.latestByTeam, year, complete: true, generatedAt: rec.data.generatedAt }`. Else `tryDataStore(path, { validate: isValidOline })` falsy → `{ ...OLINE_EMPTY }`. `latestByTeam = selectLatestOlineStates(json.teams)`. If `!wasServedStale(path)` → `setCacheWithMeta('nfl-oline/${year}', { latestByTeam, generatedAt: json.generatedAt, lastModified: entry.lastModified }, 999999)` (same permanent-TTL + lastModified pattern as `nflSchedule.js`; pass the TTL argument exactly as `nflSchedule.js` does). Return `{ latestByTeam, year, complete: true, generatedAt: json.generatedAt }`.

## 5. `App.jsx` wiring

Beside the `advStatsLive` effect (~line 1252):
```js
const [olineLive, setOlineLive] = useState(null)          // null = not requested / pending
const [olineRequested, setOlineRequested] = useState(false)
const onNeedOline = useCallback(() => setOlineRequested(true), [])
useEffect(() => {
  if (!olineRequested || !nflState?.season) return
  let cancelled = false
  loadNflOline(parseInt(nflState.season, 10))
    .then(r => { if (!cancelled) setOlineLive(r) })
    .catch(err => {
      console.warn('[nflOline] Load error:', err.message)
      if (!cancelled) setOlineLive({ ...OLINE_EMPTY })   // imported from src/api/nflOline.js — never a re-typed literal
    })
  return () => { cancelled = true }
}, [olineRequested, nflState])
```
`/teams/:abbr` route gains: `playersMap={leagueData?.playerMap ?? null}`, `rosterTeams={leagueData?.rosterTeams ?? null}`, `oline={olineLive}`, `onNeedOline={onNeedOline}`, `onOpenPlayerDetail={openPlayerDetail}`, `liveSeason={nflState?.season ? parseInt(nflState.season, 10) : null}`. No other App.jsx change; `playerRows` pipeline untouched.

## 6. Team page — `TeamDetail.jsx` + new `src/components/teams/DepthChart.jsx`

### 6a. TeamDetail.jsx
- New props (defaults null / no-op): `playersMap, rosterTeams, oline, onNeedOline, onOpenPlayerDetail, liveSeason`.
- `const [searchParams] = useSearchParams()`; `const view = searchParams.get('view') === 'depth' ? 'depth' : 'overview'` — at the top with the other hooks (all hooks stay above every early return).
- Local `function TeamTabs({ abbr, view })`: two react-router `<Link>`s, `Overview` → `/teams/${abbr}`, `Depth chart` → `/teams/${abbr}?view=depth`, `data-testid="team-tab-overview"` / `"team-tab-depth"`, active one `aria-current="page"` and `text-dp-text border-b-2 border-dp-up`, inactive `text-dp-muted`. Rendered directly under the `<h1>` in **every** return (the three existing early returns and the success return) and in the depth branch.
- Depth branch, placed **before** `if (!loaded)`: `if (view === 'depth')` → header (eyebrow, h1 `{abbr}`, `TeamTabs`) then: abbr ∉ `CURRENT_TEAM_CODES` → the existing `never-available` DegradedBlock copy; `playersMap == null` → `<p className="text-sm text-dp-muted italic">Player data loading…</p>`; else `<DepthChart …/>`.
- Overview content and gates unchanged.

### 6b. DepthChart.jsx
Props: `{ abbr, playersMap, rosterTeams, myTeamName, oline, onNeedOline, onOpenPlayerDetail, liveSeason }`. `useEffect(() => { onNeedOline?.() }, [onNeedOline])`. Memos: `buildDepthChart`, `buildOlIdIndex`, `buildOwnerIndex`, `olState = oline?.complete ? oline.latestByTeam[abbr] ?? null : null`, `buildOlSlots(olState, …)`.

- **Caption** (`data-testid="depth-caption"`, `text-[11px] text-dp-muted`): with `olState` → `Current depth chart (Sleeper; OL from ESPN via nflverse, as of ${olState.date})`; otherwise `Current depth chart (Sleeper)`.
- **OL unit states** (in place of the five OL cards): `oline == null` → muted "Loading offensive line…"; `oline.complete === false` → `DegradedBlock kind="not-yet-accruing"` "No offensive-line depth chart loaded for {liveSeason ?? 'this season'}."; complete but `olState == null` → `DegradedBlock kind="no-baseline"` "No offensive-line depth chart for {abbr}."
- **Layout** — three sections with headings `Offence`, `Defence`, `Special teams`; each row is `flex flex-wrap justify-center gap-[10px]` of fixed-width cards (`w-[150px]`), so phone width wraps rather than scrolls:
  - Offence row 1: `LWR, SWR, LT, LG, C, RG, RT, TE, RWR`; row 2: `QB`; row 3: `RB`; then `other.WR/TE/QB/RB` and OL `other` cards if non-empty.
  - Defence rows: DL, LB, DB — each unit's slots in `UNITS` order (an `optional` slot renders only when non-empty), then that unit's `generic` card labelled `DL`/`LB`/`DB` and its `other` card labelled `DL · other` etc., each only when non-empty.
  - Special teams row: `K, P, LS`, then `other.ST`.
  - `unplaced` non-empty → a final `Unplaced` card under all sections.
- **SlotCard** (`data-testid="dc-slot-${code}"`, generic `dc-generic-${unit}`, other `dc-other-${unit}`, unplaced `dc-unplaced`): `bg-dp-card border border-dp-border rounded-[10px] p-[10px]`; mono label (slot code); starter (`entries[0]`) `text-[13px] font-semibold text-dp-text`; backups `entries.slice(1)` as `text-[11.5px] text-dp-muted`, prefixed `2.`, `3.` … by list index. Canonical slot with no entry → starter line `—`.
- **Fantasy layer** (only entries in a `slots[code]` list whose code ∈ `FANTASY_SLOTS`; `other`/`generic`/`unplaced` entries are plain text): name is `<button type="button" data-testid="dc-player-${id}" onClick={() => onOpenPlayerDetail?.(id)}>`; owner under the name: owner `=== myTeamName` → `yours` in `text-dp-up-text` and the entry's row gets `bg-dp-up/10 rounded`; other owner → owner name `text-dp-muted`; unowned → nothing; injury: `injuryShort(injuryStatus)` non-null → `<span data-testid="dc-injury-${id}" title={status + (bodyPart ? ' · ' + bodyPart : '')} className="font-dp-mono text-[10px] text-dp-down-text ml-1">`.
- **OL entries**: `sleeperId` → `<button type="button" data-testid="dc-ol-${sleeperId}" onClick={() => onOpenPlayerDetail?.(sleeperId)}>{name}</button>`; else `<span data-testid="dc-ol-unmapped">{name}</span>`.
- Everything else plain text. Colour tokens only from `src/index.css` `@theme` (no literals).

## 7. Pop-up team link

- `PlayerDetailModal.jsx`: new prop `onNavigateAway = () => {}`. In the main header (`metaParts` render, ~line 486), when `i === teamPartIdx` and `teamDepthChartPath(player.team)` is non-null, wrap the `TeamLogo` + `part` in `<Link to={path} onClick={onNavigateAway} data-testid="popup-team-link" className="hover:underline">` (react-router-dom). Otherwise render exactly as today. The no-dynasty fallback header is untouched.
- `PlayerDetailTabs.jsx:236`: pass `onNavigateAway={onCloseAll}`.
- Wrap the render helper of each of the six test files listed in D9 in `<MemoryRouter>` (one-line change each; no assertion changes). Those files must stay green otherwise unchanged.

## 8. Cross-repo index and docs

**`docs/cross-repo-registry.md`** — apply exactly these replacements (each string occurs once), then append CR-35. Measured at planning: result is 12,990 bytes (cap 13,000). If `crossRepoIndex.test.js`'s cap test fails anyway, **stop and report** — do not trim anything else.

| Where | Old | New |
|---|---|---|
| header | ` Not contracts: \`nflverse/oline/\`.` | *(delete, incl. leading space)* |
| CR-01 | `The data repo also reads these per-player \`inSeason\` fields from app-written snapshots:` | `The data repo also reads these per-player \`inSeason\` snapshot fields:` |
| CR-01 | `From a season's last game until Sleeper's \`nflState.season\` rolls over, the just-completed season is outside \`seasons\` and not covered.` | `Until \`nflState.season\` rolls over, a just-completed season is outside \`seasons\`, uncovered.` |
| CR-29 | `family files read from \`VITE_DATA_STORE_URL\` first, raw GitHub on HTTP error/timeout/parse/network error` | `family files from \`VITE_DATA_STORE_URL\` first, raw GitHub on any fetch/parse failure` |
| CR-30 | `An in-place rewrite of a completed season-totals file ships with a \`SEASON_TOTALS_CACHE_REVISION\` bump, pushed after its purge verifies` | `Rewriting a completed season-totals file ships a \`SEASON_TOTALS_CACHE_REVISION\` bump, pushed once its purge verifies` |
| CR-31 | `` `espnId` is the CFBD athlete id, which keys`` | `` `espnId` is the CFBD athlete id, keying`` |

Appended (after CR-34, one blank line before):
```
#### CR-35 · nflverse oline
- **Invariant:** Team `states[]` of `{dt, date, ol[{slot, rank, name, gsisId, espnId}]}`; schedule abbrs.
- **App:** `src/api/dataStore.js` (`isValidOline`)
- **Data:** `lib/nflverse.mjs` (`aggregateOlineStates`)
```
`aggregateOlineStates` exists at `sleeper-dashboard-data/lib/nflverse.mjs:1556`, so the data repo's `test/registry.test.mjs` resolves it without a data-side change. Bump `MIN_LIVE_IDS` in `src/__tests__/crossRepoIndex.test.js` only if that test requires it (read it; do not change `CAP_BYTES`).

**`.claude/tasks/data-repo-backlog.md`** — under `## Open`, after D-90:
```
### D-91 · `nflverse/oline` now has an app consumer (CR-35)
**Found:** team-depth-chart (<this slice's commit>) · **Blocking:** no · **Size:** small
`data-catalog.md` → nflverse oline: "Consumption: capture-only — no app … path reads this family" is now false — the app's `/teams/:abbr?view=depth` reads the latest `states[]` entry per team (`src/api/nflOline.js`). Update that line to name the consumer and CR-35, and treat the `teams[abbr].states[].{dt, date, ol[].{slot, rank, name, gsisId, espnId}}` shape as a contract (`MIN_OLINE_ROWS` stays internal — the app has no floor). Also note: only ~25% of OL entries carry a `gsisId`/`espnId` Sleeper knows; if the data repo can add a `sleeperId` per OL entry, the app's `resolveOlSleeperId` would read it first (a separate app slice).
```

**Docs (same change):** `docs/signal-registry.md` oline row: last column → `**view-only, rendered (team depth chart)** — `src/api/nflOline.js` loads the live season on demand; `teams/DepthChart.jsx` renders each team's latest state's LT–RT ranks (CR-35); never feeds projection/scoring`. `docs/navigation.md` `src/api/` table: row for `nflOline.js`; its routing/IA row for `/teams/:abbr` (~line 26): add the Overview / Depth chart tabs and `?view=depth`. `docs/architecture.md` → *State management* `useState` inventory (beside `advStatsLive`/`gameLogsByYear`, ~lines 71–73): rows for `olineLive` (null = not requested/pending; loader result otherwise) and `olineRequested`. `docs/ui.md` "Team detail" section (~line 254): the tab strip and the depth-chart layout. `docs/nav/components.md`: new row `teams/DepthChart.jsx`; amend `teams/TeamDetail.jsx` row (tabs, `?view=depth`, new props); amend `dp/PlayerDetailModal.jsx` row (team link, `onNavigateAway`). `docs/nav/utils.md`: rows for `depthChart.js`, `teamLink.js`, `injuryStatus.js`. `CLAUDE.md` navigation table `src/api/` cell: add `nflOline.js` to the nflverse families list (`claudeMdSize.test.js` must stay green). All doc text states mechanism, not availability (`docsAvailabilityClaims.test.js`).

## 9. Tests to add

Every test below is shown failing with the named defect temporarily reintroduced, then reverted.

`src/utils/depthChart.test.js`
1. **LDE starter.** Two KC players at `LDE`, orders 2 and 1 (order-2 inserted first, alphabetically first) → `slots.LDE[0].id` is the order-1 player, `[1]` the order-2. *Fails if sort ignores `depth_chart_order` or keeps insertion order.*
2. **Generic DL kept.** KC player code `DL` → in `generic.DL`, absent from every `slots` list. *Fails if generic codes are dropped or forced into a canonical slot.*
3. **Unknown code by position; unplaced.** Code `PR` with position `CB` → `other.DB`; code `XX` with position `OT` → `unplaced`. *Fails if unknown codes are dropped.*
4. **Sleeper OL excluded; team domain.** A KC player with code `OL`, order 1 → absent from every list; a `LAR` player is placed when `abbr = 'LA'`, absent for `abbr = 'LAR'`. *Fails if the `OL` exclusion or the `normalizeTeamForSchedule` hop is removed.*
5. **Latest state by dt.** Three `states` whose max-`dt` state is in the **middle** (e.g. dts W40, W45, W42 in that order) → the W45 state is selected. *Fails if selection takes `states[0]` or `states.at(-1)`.*
6. **OL from oline ranks.** `buildOlSlots` over a state with LT ranks 2,1 → `slots.LT[0].rank === 1`, names from oline. *Fails if rank sort is removed.*
7. **OL id guard.** (a) gsis hit with agreeing surname → sid; (b) espn-only hit → sid; (c) gsis and espn pointing to different sids → null; (d) id hit whose Sleeper `full_name` surname disagrees → null; (e) a gsis id held by two Sleeper players → null. *Fails if any guard is removed, or a name-only fallback is added (case f: no ids, exact name match in `playersMap` → null).* (g) Null-id hygiene: `playersMap` holds two OL records with `espn_id: null` and one with `espn_id: ''`; `buildOlIdIndex` has no `'null'`, `'undefined'` or `''` key in either map, and an oline entry with `espnId: null` and no `gsisId` → null. *Fails if null/empty ids are stringified into keys.*

`src/utils/teamLink.test.js`
8. **Pop-up target team.** `teamDepthChartPath('LAR') === '/teams/LA?view=depth'`, `('KC') === '/teams/KC?view=depth'`. *Fails if the schedule-domain hop is dropped (`LAR` would 404 to the unknown-team state).*
9. **No link for FA/stale.** `null`, `'FA'`, `'OAK'` → `null`. *Fails if any non-current code produces a link.*
10. **32 codes.** `CURRENT_TEAM_CODES.size === 32`, contains `LA`, not `LAR`.

`src/utils/injuryStatus.test.js`
11. `expect(INJURY_ABBR).toEqual({ Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUS' })` (the whole object, pinned to `Portfolio.jsx:54` at HEAD `e841748`); `injuryShort('COV') === 'COV'`, `injuryShort(null) === null`. *Fails if the move changed, added or dropped any entry of Portfolio's mapping* (Portfolio's existing tests must also stay green unchanged).

`src/api/nflOline.test.js` (mirror `nflSchedule.test.js`'s mocking — `tryDataStore` is mocked wholesale, so the validator is **not** exercised here)
12. Manifest entry absent → `complete: false`. `tryDataStore` resolves `null` → `complete: false`. Valid body → `complete: true`, `latestByTeam.KC.date` = the max-`dt` state's date, and the cached payload holds `latestByTeam` only (no `states`). Cache miss (`getCacheRecord` → `null`) does not throw. The `catch` path in `App.jsx` is covered by `OLINE_EMPTY` being the only empty literal (test 12 also asserts the absent-manifest result `toEqual({ ...OLINE_EMPTY })`). *Fails if the loader treats absence as complete, caches the raw file, or dereferences a missing cache record.* No invalid-shape case here — that belongs to test 13.

`src/api/dataStore.test.js` (extend; call `isValidOline` directly, unmocked)
13. **Accepts** a real-shaped fixture `{ schemaVersion: 1, season: 2026, rowCount: 2, teams: { KC: { states: [{ week: '2026-W45', date: '2026-11-07', dt: '2026-11-07T07:00:00Z', ol: [{ slot: 'LT', rank: 1, name: 'A B', gsisId: '00-1', espnId: '1' }] }] } } }` → `true`. **Rejects** `null`, an array, `{ teams: {} }`, a team with empty `states`, a state without `ol` → `false`. *Fails if the validator always returns false (every team would render the "not loaded" block) or always true.*

`src/components/teams/DepthChart.test.jsx` (inside `MemoryRouter`)
14. **LDE renders as starter.** The order-1 LDE player's name is the starter line inside `dc-slot-LDE`; the order-2 player is in its backup list. *Fails if the card renders `entries` unsorted or treats `[1]` as starter.*
15. **Generic DL visible.** `dc-generic-DL` exists and contains the `DL`-coded player. *Fails if the generic card is not rendered.*
16. **OL from oline, not Sleeper.** With oline complete: `dc-slot-LT`'s starter is the oline rank-1 name; the Sleeper `OL`-coded player's name appears nowhere. *Fails if Sleeper OL players are rendered into OL cards.*
17. **Unmapped OL has no link.** An oline entry with no resolvable id renders as `dc-ol-unmapped` text and there is no button with its name; a mapped one renders `dc-ol-${sid}` and clicking calls `onOpenPlayerDetail(sid)`. *Fails if unmapped entries render a button.*
18. **Fantasy layer.** A QB owned by `myTeamName` shows `yours`; a WR owned by another team shows that team name; clicking `dc-player-${qb}` calls `onOpenPlayerDetail(qb)`; a `Questionable` TE shows `dc-injury-${te}` with text `Q`; an `LDE` player has no button and no injury chip. Slot/position disagreement: a `position: 'FB'` player at code `RB` **gets** `dc-player-${fb}`; a `position: 'WR'` player at unknown code `KR` (routed to `other.WR`) renders as plain text with **no** `dc-player-` button; a `position: 'DT'` player at code `RDE` with `injury_status: 'Out'` has no injury chip. *Fails if the layer is keyed on position rather than slot code, or applied to defenders.*
19. **Caption + oline states.** Complete oline → caption ends `as of 2026-11-07)`; `oline = null` → "Loading offensive line…", caption `Current depth chart (Sleeper)`; `{ complete: false }` → `NOT YET — ACCRUING` block. `onNeedOline` called on mount.

`src/components/teams/TeamDetail.test.jsx` (extend; existing tests untouched)
20. `renderAt('/teams/KC?view=depth', { playersMap, loaded: false, teamContextByYear: {} })` → `depth-caption` present, "Rostered & tracked" absent. *Fails if the depth branch sits behind the overview's `loaded`/teamContext gates (D6).* `/teams/LAR?view=depth` → `NEVER AVAILABLE`. `/teams/KC` (no param) → existing overview, `team-tab-depth` link `href` ends `/teams/KC?view=depth`.

`src/components/dp/PlayerDetailModal.test.jsx` (extend; render helper now wrapped in `MemoryRouter` — D9)
21. **Pop-up team link targets the right team.** Player `team: 'LAR'` → `popup-team-link` `getAttribute('href') === '/teams/LA?view=depth'` (MemoryRouter renders router paths without `#`); clicking it calls `onNavigateAway`. *Fails if the path uses the raw Sleeper code.*
22. **Free agent shows no link.** `team: null` and `team: 'FA'` → no `popup-team-link`; the header text still reads `FA`. *Fails if FA gets a link.*

`src/components/dp/PlayerDetailTabs.test.jsx` (extend; `MemoryRouter`-wrapped)
22b. **Team link closes the pop-up.** Render with one open tab for a player with `team: 'KC'`; click `popup-team-link` → `onCloseAll` called once. *Fails if `PlayerDetailTabs` does not pass `onNavigateAway={onCloseAll}` (the default no-op would leave the pop-up open over the team page).*

`src/__tests__/olineViewOnly.test.js`
23. Copy `scheduleViewOnly.test.js`'s `PIPELINE` list; assert no PIPELINE file imports `nflOline`/`depthChart` or names `loadNflOline`, and `nflOline.js`/`depthChart.js` import nothing from PIPELINE. **Copied definition:** the test also reads `src/__tests__/scheduleViewOnly.test.js` as text, extracts its `PIPELINE` array literal, and asserts it equals this file's copy (names the original). *Fails if a projection module imports the loader, or if the two lists drift.*

## Files touched

New: `src/utils/injuryStatus.js`, `src/utils/teamLink.js`, `src/utils/depthChart.js`, `src/api/nflOline.js`, `src/components/teams/DepthChart.jsx`, their tests (above), `src/__tests__/olineViewOnly.test.js`.
Edited: `src/api/dataStore.js` (`isValidOline`), `src/api/dataStore.test.js` (test 13), `src/App.jsx` (§5), `src/components/teams/TeamDetail.jsx`, `src/components/teams/TeamDetail.test.jsx`, `src/components/dp/PlayerDetailModal.jsx`, `src/components/dp/PlayerDetailTabs.jsx`, the six `MemoryRouter`-wrapped test files in D9 (`PlayerDetailModal.test.jsx`, `PlayerDetailModal.usageAvailability.test.jsx`, `PlayerDetailModal.gameLogDistribution.test.jsx`, `PlayerDetailModal.environment.test.jsx`, `PlayerDetailModal.seasonPhase.test.jsx`, `PlayerDetailTabs.test.jsx`), `src/components/portfolio/Portfolio.jsx` (§1 only), `docs/cross-repo-registry.md`, `src/__tests__/crossRepoIndex.test.js` (only if `MIN_LIVE_IDS` requires), `docs/signal-registry.md`, `docs/navigation.md`, `docs/architecture.md`, `docs/ui.md`, `docs/nav/components.md`, `docs/nav/utils.md`, `CLAUDE.md`, `.claude/tasks/data-repo-backlog.md`.
Not touched: `src/utils/teamContext.js` (`buildTeamDepthChart` — see §3).
Copies created: one — `olineViewOnly.test.js`'s `PIPELINE` (equality-tested against `scheduleViewOnly.test.js`, test 23). The empty oline result is **not** a copy: `App.jsx` imports `OLINE_EMPTY` from `nflOline.js`.

## Done-definition notes

- Full CLAUDE.md done-definition. No `factors`/stat-key change, so the two contract tests just need to stay green.
- Smoke (`.claude/launch.json` preview): `/teams/KC?view=depth` and `/teams/LA?view=depth` — formation renders, starter/backups, caption date, OL names, one owned player highlighted; click a QB → pop-up; in the pop-up click the team → page switches to that team's depth chart with the pop-up closed; `/teams/KC` overview unchanged; a phone-width (375px) check that rows wrap with no horizontal scroll. Screenshot is not sign-off — Anton judges the layout.
- `grep -rn "PROVISIONAL(" src/` output in the hand-back (this slice should add none).

## Plan review — round 1 (2026-11-09, opus/high, full)

Nine flags, all accepted by Anton and folded in above: F1 validator tested directly with an accepting fixture (tests 12–13); F2 slot/position disagreement cases (test 18); F3 pop-up link is a router `<Link>`, six test files wrapped in `MemoryRouter` (D9, §7); F4 `OLINE_EMPTY` exported and imported, not re-typed (§4–5); F5 `docs/architecture.md`, `docs/navigation.md` routing row, `docs/ui.md` added (§8); F6 null/empty ids never become map keys, optional-chained cache hit (§3b, §4, test 7g); F7 `??`/`||` parenthesised (§3a); F8 tests 5 and 11 tightened, test 22b added; F9 `buildTeamDepthChart` named and fenced off (§3).
