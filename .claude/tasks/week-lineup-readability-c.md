# This Week lineup readability — Slice C: usage colouring by league-starter rank + TD column (brief items 4, 6)

Review depth: full — a new derived ranking pool (league starters' season usage shares by position) that
colours every usage cell; a wrong window, averaged rates or the wrong population colours players wrongly
with no visible error. Otherwise view-only: no `projectedPPG`/dynasty/`factors`/scoring input, no
`docs/cross-repo-registry.md` site (grep of the registry for `weeklyUsage`, `starterPercentiles`,
`percentileColour`, `LineupTable`, `useWeeklyDecision`, `WeekView`, `rush_td`, `rec_td`: no hits), no
snapshot capture, no `playerRows` step, no TTL, no new dependency, no state moved into a child.

Source: Anton's handoff brief "This Week lineup table: readability & usage pass" (2026-11-27), items 4 and 6,
and the Slice C outline at the end of `.claude/tasks/week-lineup-readability-b.md`. Slices A (`9520fdb`) and
B (`bba4f2b`) are signed off and pushed. App repo only. Display-only.

Session 2 runs on **sonnet**, effort **high** (the pool is the correctness risk). The change is visual:
Session 2 runs the app from `.claude/launch.json` (`sleeper-dashboard`) through the preview tool, not a
backgrounded `npm run dev`, and stops it when done.

**Copied definitions created by this slice: one** — `leagueStarterIds` (§2.2) restates
`buildStarterPool`'s league-starter membership rule (`src/utils/starterPercentiles.js:32–41`: id in
`starterWeeks[w].ids`, that week's row `stats.gp === 1`, position from `playerMap[id].position`), because
`buildStarterPool` returns points, not ids, and this slice does not edit `starterPercentiles.js`. It ships
with equality test **P8** (§7), which runs both on one fixture and names the original. Everything else is
shared, not copied: the pool's per-player share is the row's own share through one new helper
(`buildSeasonUsage`, §1.4) that both the row and the pool call; colour comes from the existing
`scaleCss`/`scaleInk` (`utils/percentileColour.js`) and rank from the existing `percentileOf`
(`utils/starterPercentiles.js`), imported.

---

## 0. Pre-checks done in planning (Session 1, 2026-11-27, HEAD `bba4f2b`)

### 0.1 Anchors (re-read against live source)

- `src/utils/weeklyUsage.js` (227 lines). `buildTeamAggregates` `:22–36` → `{ passAtt, rushAtt, offSnp }`
  (`?? null`). `accumulateUsage` `:52–86` (totals `played, rushAtt, rec, recTgt, teamRushAtt, teamPassAtt,
  offSnp, tmOffSnp, snapObservations`; skips a week unless `stats.gp === 1`; team via
  `wk.teamAggregates?.[row.team]`). `ratio` `:88–91` (null unless `played` and `denom > 0`).
  `computeUsageShares` `:107–119` → `{ rush, target, touch, snap }`. `accumulateRedZone` `:156–174`,
  `computeRedZoneShares` `:179–184`, `computeUsageCounts` `:190–203` → `{ rush, target, touch, snap, rzRush,
  rzTarget }`. `buildWeeklyUsageTrend` `:209–227`.
- **Stale comment** `weeklyUsage.js:146–148` says lines 1–143 "do not move (the cross-repo registry cites
  them)". The registry no longer names `weeklyUsage` (grep: no hits; CR-11 now cites `usageMetrics.js`).
  Extending `accumulateUsage`/`buildTeamAggregates` is therefore safe; §1.6 rewrites that comment.
- Consumers of `buildTeamAggregates`/`accumulateUsage`/`computeUsageShares`/`computeUsageCounts`: only
  `src/hooks/useWeeklyDecision.js` (`:166`, `:257–260`) and `src/utils/weeklyUsage.test.js`. No other
  importer (grep of `src/`).
- `src/hooks/useWeeklyDecision.js` (366 lines). Params `:98–114` (already has `playerMap`). `playedWeeklyMaps`
  `:212–215` (`week < currentWeek`). Usage memo `:250–264`. Return `:360–365`.
- `src/utils/starterPercentiles.js`: `MIN_POOL_SAMPLES = 60` (`:11`, a player-week count), `LEGEND_POSITIONS =
  ['QB','RB','WR','TE']` (`:12`), `buildStarterPool` `:28–46` (membership: id in `starterWeeks[w].ids`, that
  week's row `stats.gp === 1`, position `playerMap[id].position`, weeks `<= throughWeek`), `percentileOf`
  `:89–98` (mid-rank, `null` on empty/null/NaN).
- `src/utils/percentileColour.js`: `scaleCss(p)` (comma `rgb(...)`), `scaleInk(p)` (black/white by contrast).
  `SCALE_STOPS` run dark purple (p=0) → light green (p=1).
- `src/App.jsx`: `leagueData.starterWeeks` built `:1021–1030` (weeks `1..nflState.week-1`, filled starter ids
  of every roster); `<WeekView …>` `:1571–1585` (no `starterWeeks` prop today).
- `src/components/week/WeekView.jsx`: props `:40–54`; hook destructure `:73–77`; `<LineupTable …>` `:162–179`.
- `src/components/week/LineupTable.jsx` (605 lines). `UsageCell` `:77–93`; row cells `:390–403` (RUSH, TARGET,
  TOUCH, RZ RUSH, RZ TGT, SNAP); `COLUMN_COUNT = 18` `:436`; headers `:500–505`; usage legend `<span>` ends
  `:559–560` ("… a short stub a real zero.").
- Tests: `src/utils/weeklyUsage.test.js` — exact-shape `toEqual`s that this slice changes: `:29–30`
  (`buildTeamAggregates`), `:113` (never-played shares), `:283` (`computeUsageCounts`).
  `src/components/week/LineupTable.test.jsx:393` lists the usage column ids. `src/__tests__/
  opponentStrengthViewOnly.test.js:64–66` (T25) guards percentile modules out of `PIPELINE`.

### 0.2 Team TD totals — verified on real data (brief item 6 "verify first")

Read-only fetch of `https://api.sleeper.com/stats/nfl/2026/<w>?season_type=regular`, weeks 1–11 (the exact
payload `getWeeklyStatRows` caches): every `TEAM_<abbr>` row carries `rush_td`/`rec_td` (and `pass_td`), and
**Sleeper omits the key when it is zero** (e.g. 2026 wk 3 `TEAM_GB`: `rec_td 2`, `pass_td 2`, no `rush_td`).
Cross-check over 326 team-weeks: `TEAM_*` `rush_td`/`rec_td` equal the sum of that week's `gp === 1` player
rows on that team in **every** team-week (0 mismatches). So `buildTeamAggregates` is extended (§1.1); no
player-row summing.

### 0.3 Pool sizes — current league data (brief item 4 "report before fixing the number")

League "Dynasty 040" (12 teams, QB/2RB/3WR/TE/2FLEX/SF), 2026 weeks 1–11, members per §2.1 (started at least
once in a week he played), position from the stats row's player record:

| Pos | members | ≥ 3 played weeks | e.g. SNAP share range (min · median · max) |
|---|---|---|---|
| QB | 40 | 38 | 0.54 · 0.98 · 1.00 |
| RB | 70 | 69 | 0.04 · 0.47 · 0.81 |
| WR | 94 | 92 | 0.05 · 0.70 · 0.92 |
| TE | 38 | 38 | 0.35 · 0.64 · 0.90 |

Every applicable share kind has the full member count at each position (TD share for RB/WR/TE included).
All clear the 15-player minimum by a wide margin, so planning does not stop. Early season (weeks 1–3) is the
only time a pool falls short; it renders neutral (§2.3).

---

## 1. `src/utils/weeklyUsage.js` — TD components, played weeks, one season helper

### 1.1 `buildTeamAggregates` (`:29–33`)

Add two fields: `rushTd: stats.rush_td ?? null, recTd: stats.rec_td ?? null`. Header comment `:18` gains
`rushTd, recTd` in the shape and one clause: "TD keys are omitted by Sleeper when zero, like every other key
— the accumulator below reads an absent one as 0."

### 1.2 `accumulateUsage` (`:53–83`)

Totals gain `passTd: 0, rushTd: 0, recTd: 0, teamRushTd: 0, teamRecTd: 0, playedWeeks: 0`. Inside the
played-week branch (after `totals.played = true`): `totals.playedWeeks += 1`; `totals.passTd += stats.pass_td
?? 0`; `totals.rushTd += stats.rush_td ?? 0`; `totals.recTd += stats.rec_td ?? 0`; `totals.teamRushTd +=
teamAgg?.rushTd ?? 0`; `totals.teamRecTd += teamAgg?.recTd ?? 0`. Summed across the window like every other
component; nothing divided here.

### 1.3 `computeUsageShares` (`:107–119`) and `computeUsageCounts` (`:190–203`)

- Shares gain `td`: `position === 'QB' ? null : ratio((totals?.rushTd ?? 0) + (totals?.recTd ?? 0),
  (totals?.teamRushTd ?? 0) + (totals?.teamRecTd ?? 0), played)`. A team TD denominator of 0 → `null`
  (through `ratio`), never `0` and never `NaN`. Return `{ rush, target, touch, snap, td }`. Definitions
  comment gains: `td = player (rush_td + rec_td) / team (rush_td + rec_td); null for QB (count only).`
- Counts gain `td`: `played ? (position === 'QB' ? (usageTotals.passTd ?? 0) + (usageTotals.rushTd ?? 0) :
  (usageTotals.rushTd ?? 0) + (usageTotals.recTd ?? 0)) : null`. Comment: QB counts passing + rushing TDs.

### 1.4 New `buildSeasonUsage(playedWeeklyMaps, playerId, position)` (append after `computeUsageCounts`)

```js
// The row's season usage — the ONE path both the lineup row and the league-starter usage pool
// (usagePercentiles.js) use, so a pool value is computed exactly like the share it is compared against.
// → { usage: { rush, target, touch, snap, td, rzRush, rzTarget }, counts: {…computeUsageCounts}, playedWeeks }
export function buildSeasonUsage(playedWeeklyMaps, playerId, position) {
  const totals = accumulateUsage(playedWeeklyMaps, playerId)
  const rz = accumulateRedZone(playedWeeklyMaps, playerId)
  return {
    usage: { ...computeUsageShares(totals, position), ...computeRedZoneShares(rz, position) },
    counts: computeUsageCounts(totals, rz, position),
    playedWeeks: totals.playedWeeks,
  }
}
```

### 1.5 `buildWeeklyUsageTrend` — unchanged (it reads only `snap` and `shareKind`).

### 1.6 Stale comment `:146–148`

Replace "Appended below the CR-11 readers on purpose: lines 1-143 do not move (the cross-repo registry cites
them), so this section neither extends `accumulateUsage` nor routes through `buildTeamAggregates`." with
"Red-zone usage reads the team row directly rather than through `buildTeamAggregates` (a history choice; no
cross-repo contract cites this module)."

---

## 2. New `src/utils/usagePercentiles.js` — the league-starter usage pool

Pure, view-only, no React, no I/O. Imports only `buildSeasonUsage` (`./weeklyUsage`) and `percentileOf`,
`LEGEND_POSITIONS` (`./starterPercentiles`).

### 2.1 Pool design (settled here)

- **Population.** A player is a member at position P when, in at least one week `w` present in
  `playedWeeklyMaps`, his id is in that week's `starterWeeks` entry (`ids`) **and** that week's row has
  `stats.gp === 1` — the same league-starter definition as `buildStarterPool`. P is `playerMap[id].position`,
  kept only if in `LEGEND_POSITIONS`. Restricting to weeks in `playedWeeklyMaps` keeps the in-progress week
  and any failed-fetch week out of membership, matching the row's own window. Live season only — no prior-
  season fallback (a prior pool would need a second season of weekly rows; below the minimum it is neutral).
- **Unit.** One value per member per share kind: his season-to-date share over **all** his played weeks
  (not only the weeks he was started), from `buildSeasonUsage(playedWeeklyMaps, id, P).usage[kind]` — the
  row's own computation: sum the components across the window, divide once. Never a mean of weekly shares.
  Not a player-week pool (it would compare a season share against noisier weekly shares and compress the
  colours).
- **Member floor.** A member counts only with `playedWeeks >= USAGE_POOL_MIN_WEEKS` (3) — a 1–2 game
  sample is not a usage profile and would put outliers at both ends. The same floor applies to the row being
  coloured (§2.3): a row player under 3 played weeks stays neutral even when the pool is full, since his own
  share is the same kind of outlier.
- **Pool minimum.** `USAGE_POOL_MIN_PLAYERS = 15` qualifying members with a non-null value for that
  (position, kind). Separate from `MIN_POOL_SAMPLES` (a player-week count). Below it → neutral.
- **Kinds.** `USAGE_SHARE_KINDS = ['snap', 'rush', 'target', 'touch', 'rzRush', 'rzTarget', 'td']`. A kind
  that is null for a position (rush/rzRush WR/TE, target/rzTarget/td QB) simply never fills, so those cells
  stay uncoloured by construction.

### 2.2 Exports

```js
export const USAGE_POOL_MIN_PLAYERS = 15
export const USAGE_POOL_MIN_WEEKS = 3
export const USAGE_SHARE_KINDS = ['snap', 'rush', 'target', 'touch', 'rzRush', 'rzTarget', 'td']

// → { [position]: string[] } member ids (sorted, deduped), positions in LEGEND_POSITIONS only.
export function leagueStarterIds({ starterWeeks, playedWeeklyMaps, playerMap })

// → { [position]: { [kind]: number[] ascending } } — qualifying members' (playedWeeks >= MIN_WEEKS) non-null values.
export function buildUsagePool({ starterWeeks, playedWeeklyMaps, playerMap })

// → { [kind]: number in [0,1] | null } for one row. null when: the share is null/non-finite, playedWeeks <
// USAGE_POOL_MIN_WEEKS, or pool[position]?.[kind] has fewer than USAGE_POOL_MIN_PLAYERS values; else
// percentileOf(pool[position][kind], share).
export function usagePercentiles(pool, position, usage, playedWeeks)
```

Header comment: what the pool is (§2.1 in three lines), "view-only: nothing here reaches projection,
scoring or a dynasty value", and the `PROVISIONAL(no-data)` line at the null-return derivation site:
`// PROVISIONAL(no-data): uncoloured usage share · fewer than USAGE_POOL_MIN_PLAYERS qualifying league starters at the position, or the player has fewer than USAGE_POOL_MIN_WEEKS played weeks · more completed weeks`

### 2.3 Neutral, never wrong

Every degraded input yields `null` (→ neutral render): empty/absent `starterWeeks` (week 1, or league data
without matchups), empty `playedWeeklyMaps`, a player missing from `playerMap`, a short pool, a short row
sample, a null share. Nothing throws on `null`/`undefined` inputs.

---

## 3. `src/hooks/useWeeklyDecision.js`

- New param `starterWeeks = []` (beside `leagueId`), with a one-line comment: "App.jsx's
  `leagueData.starterWeeks` — league starters per completed week, for the usage-colour pool only."
- Usage memo `:250–264`: replace the three per-player lines with `const su = buildSeasonUsage(playedWeeklyMaps,
  id, p.position)`; `usage[id] = su.usage`; `counts[id] = su.counts`; keep the trend line. Also collect
  `played[id] = su.playedWeeks` and return it from the memo as `playedWeeksByPlayer`. Update the import list
  (drop the now-unused `accumulateUsage`, `computeUsageShares`, `accumulateRedZone`, `computeRedZoneShares`,
  `computeUsageCounts` if lint flags them; keep `buildTeamAggregates`, `priorSeasonSnapShare`,
  `buildWeeklyUsageTrend`).
- New memo after it:
  ```js
  const usagePool = useMemo(
    () => buildUsagePool({ starterWeeks, playedWeeklyMaps, playerMap }),
    [starterWeeks, playedWeeklyMaps, playerMap]
  )
  const usagePctByPlayer = useMemo(() => {
    const out = {}
    for (const p of rendered) {
      if (p?.id == null) continue
      out[p.id] = usagePercentiles(usagePool, p.position, usageByPlayer[p.id], playedWeeksByPlayer[p.id])
    }
    return out
  }, [rendered, usagePool, usageByPlayer, playedWeeksByPlayer])
  ```
- Return gains `usagePctByPlayer`. Header comment `:44–45` gains: "Usage shares are coloured by rank among
  this league's starters at the position (usagePercentiles.js)."

## 4. Wiring

- `src/App.jsx` `<WeekView …>` (`:1571–1585`): add `starterWeeks={leagueData.starterWeeks ?? []}`. No other
  App.jsx change (the T25b line pins in `opponentStrengthViewOnly.test.js` cover `starterPercentiles` lines
  only; this line names none of its identifiers).
- `src/components/week/WeekView.jsx`: prop `starterWeeks = []`; pass to the hook; destructure
  `usagePctByPlayer`; pass `usagePctByPlayer={usagePctByPlayer}` to `<LineupTable>`. Header comment `:22`
  gains "and `usagePctByPlayer` (usage-share colour)".
- `src/components/week/LineupTable.jsx`: prop `usagePctByPlayer = {}` on `LineupTable`, through
  `LineupTableBody` and `rowProps` into `LineupRow` (same path as `usageTrendByPlayer`).

## 5. `LineupTable.jsx` rendering

### 5.1 `UsageCell` (`:77–93`) — colour the share, not the count

New prop `pct = null`. The non-empty line becomes:

```jsx
<>{count ?? '—'}<span className="text-dp-muted"> · </span><span
  data-testid="usage-share"
  data-pct={pct != null ? Math.round(pct * 100) : undefined}
  className={`rounded-[3px] px-1 ${pct != null ? '' : 'text-dp-muted'}`}
  style={pct != null ? { backgroundColor: scaleCss(pct), color: scaleInk(pct) } : undefined}
>{pctText(share)}</span></>
```

`px-1` on both states so coloured and neutral rows keep the same right edge. Visible text is unchanged
(`120 · 60%`). Import `scaleCss, scaleInk` from `../../utils/percentileColour`. The `UsageTrend` mini-bars
stay neutral (`bg-dp-slate-2`) — only the share chip is coloured. At the neutral branch add
`// PROVISIONAL(no-data): uncoloured usage share · pool below USAGE_POOL_MIN_PLAYERS or row below USAGE_POOL_MIN_WEEKS (usagePercentiles.js) · more completed weeks`.

### 5.2 Row cells (`:390–403`)

`const pc = usagePctByPlayer?.[r.player_id] ?? null` beside `t`/`s`. Pass `pct={pc?.rush ?? null}`,
`pc?.target`, `pc?.touch`, `pc?.rzRush`, `pc?.rzTarget`, `pc?.snap` to the six existing cells. New cell
between RZ TGT and SNAP:
`<UsageCell testId="col-td" count={r.counts?.td ?? null} share={r.usage?.td ?? null} pct={pc?.td ?? null} />`
(no `trend`, no `cells` — TDs per week are too sparse to read). A QB row renders `3 · —`, uncoloured.

`r.usage`/`r.counts` reach the row via `buildWeeklyLineup` (`src/utils/weeklyLineup.js:137` `usage =
usageByPlayer?.[id]`, `:142` `counts: countsByPlayer?.[id]` — whole objects, verified in planning), so `td`
arrives with no `weeklyLineup.js` change.

### 5.3 Header and column count

- `COLUMN_COUNT = 18` → `19`.
- New `<th>` between RZ TGT (`:504`) and SNAP (`:505`):
  `<th className={`${TH} text-right`} title="Rushing + receiving TDs · share of team rushing + receiving TDs (a QB: passing + rushing TDs, count only). TD share is noisy on small samples — the count beside it shows the sample.">TD</th>`

### 5.4 Legend copy (usage `<span>`, after "… a short stub a real zero." `:559–560`)

Append, exact text (JSX entities as in the neighbouring copy):

" TD is his rushing + receiving touchdowns over the weeks he played, then their share of his team&rsquo;s
rushing + receiving touchdowns in those weeks (a QB: passing + rushing touchdowns, count only) &mdash; noisy
on small samples, so read the count beside it. A coloured share is how it ranks among this league&rsquo;s
starters at his position this season, each compared on his own season share over the weeks he played:
light green the top, dark purple the bottom, the same scale as {thisSeason ?? 'this season'} WEEKS. A share
stays uncoloured until he has played {USAGE_POOL_MIN_WEEKS} games and at least {USAGE_POOL_MIN_PLAYERS}
league starters at his position have that share; a share that does not apply to his position reads —."

Import the two constants from `../../utils/usagePercentiles`. JSX drops the newline whitespace between an
expression and the next line's text, so wherever a source line ends with `{…}` (or a line starts with one)
put an explicit `{' '}` at the join, as the neighbouring copy does (`LineupTable.jsx:552–558`). The rendered
text must read "…the same scale as 2026 WEEKS. A share stays uncoloured until he has played 3 games and at
least 15 league starters at his position have that share; …" — L4 asserts those two joins.

---

## 6. View-only guard

`src/__tests__/opponentStrengthViewOnly.test.js` T25 (`:64–66`): regex becomes
`/from\s+['"][^'"]*(starterPercentiles|percentileColour|usagePercentiles)['"]/` and the `it` title names
`usagePercentiles` too. (Red step: add `import { USAGE_POOL_MIN_WEEKS } from './usagePercentiles'` to one
`PIPELINE` file, see T25 fail, revert.)

---

## 7. Tests (each names the defect it catches)

`src/utils/weeklyUsage.test.js`:

- **C1 TD share sums then divides once.** Two played weeks, RB, team KC: wk1 player `rush_td 1`, TEAM_KC
  `rush_td 1` (100%); wk2 player no TD, TEAM_KC `rush_td 2, rec_td 2` (0%). Asserts `td` ≈ `1/5 = 0.2` and
  not ≈ `0.5`. Fails if weekly TD shares are averaged. Red: in `computeUsageShares` temporarily compute `td`
  (`computeUsageShares` sees only window totals, so the mutation goes in `accumulateUsage`): temporarily
  replace the TD sums with per-week ratio accumulation — `totals.tdShareSum += teamTd > 0 ? playerTd /
  teamTd : 0` per played week — and have `computeUsageShares` return `tdShareSum / playedWeeks` for `td`
  (= `0.5` on this fixture). Test goes red; revert.
- **C2 TD zero denominator → null, count 0.** Played week, TEAM row with no TD keys (Sleeper zero-omission),
  player no TD. Asserts `shares.td === null` (not `0`, not `NaN`) and `counts.td === 0`. Fails if the team
  denominator 0 yields 0 or NaN. Red: replace `ratio(...)` for `td` with a raw division.
- **C3 QB TD is count only.** QB with `pass_td 2, rush_td 1`, team rows with TDs. Asserts `counts.td === 3`,
  `shares.td === null`. Fails if QB gets a share or the count omits `pass_td`. Red: drop the QB branch.
- **C4 `buildTeamAggregates` TD fields.** Update `:29–30` to `{ passAtt, rushAtt, offSnp: null, rushTd: null,
  recTd: null }`; add a team row with `rush_td 1, rec_td 2` → `rushTd 1, recTd 2`. Fails if TD fields are not
  read from `TEAM_` rows.
- **C5 `playedWeeks` counts gp===1 weeks only.** Three weeks: gp 1, gp 0, gp 1 → `playedWeeks === 2`. Fails if
  a gp 0 / absent week is counted (the member floor would then admit 1-game players).
- **C6 `buildSeasonUsage` equals the parts.** For a fixture RB, `buildSeasonUsage(...)` deep-equals
  `{ usage: {...computeUsageShares, ...computeRedZoneShares}, counts: computeUsageCounts(...), playedWeeks }`.
  Fails if the helper drifts from the per-function path.
- Update `:113` to include `td: null`, and `:283` — extend the `usage` fixture with `rushTd: 2, recTd: 1,
  passTd: 0` and expect `td: 3`.

New `src/utils/usagePercentiles.test.js` (small fixture built with a local `wk(week, rows)` helper using
`buildTeamAggregates`, like `weeklyUsage.test.js:305`):

- **P1 membership.** Asserts a player started in a week he played is a member; one started only in a week
  with `gp 0` is not; one rostered but never started is not; one started only in a week absent from
  `playedWeeklyMaps` (the current week) is not; a K started in a played week is not (position filter).
  Fails if membership ignores `gp`, uses rostered players, or counts the in-progress week. Red: drop the
  `gp === 1` check in `leagueStarterIds`.
- **P2 pool value = season share over all played weeks, summed then divided.** Member started only in wk1
  but played wk1–3 with carries/team carries `2/40, 18/20, 10/40` → pool value `30/100 = 0.30`; the mean of
  weekly shares (`(0.05 + 0.90 + 0.25) / 3 = 0.40`) and the started-weeks-only share (`0.05`) both differ.
  Asserts the pool's RB `rush` array contains `0.30` (`toBeCloseTo`) and no value near `0.40` or `0.05`. Fails if weekly shares
  are averaged, or if only started weeks are summed. Red: in `buildUsagePool` temporarily average
  `buildWeeklyUsageTrend`-style per-week shares instead of calling `buildSeasonUsage`.
- **P3 member floor.** A member with 2 played weeks is absent from every pool array; with 3 he is present.
  Fails if `USAGE_POOL_MIN_WEEKS` is not applied to members.
- **P4 below-minimum pool stays neutral.** A pool array of 14 values → `usagePercentiles(...)[kind] === null`
  for a valid share and `playedWeeks` 5; the same with 15 values → a number. Fails if a below-minimum pool
  still colours. Red: change the minimum check to `length > 0`.
- **P5 row floor and null share.** Full pool (15+), row `playedWeeks 2` → `null`; row `playedWeeks 3` with
  share `null` (e.g. `rush` for a WR) → `null`. Fails if a short-sample row or an inapplicable share colours.
- **P6 rank value.** A hand-built pool `{ WR: { target: [0.01, 0.02, …, 0.15] }, RB: { target: [0.5, …] } }`
  (15 ascending values each); a WR row with `target 0.08` (the 8th) → `0.5` (mid-rank `7.5/15`). Fails if the
  rank is taken against the wrong position's or kind's array (against RB's it would be `0`).
- **P7 degraded inputs.** `buildUsagePool({})`, `({ starterWeeks: null, playedWeeklyMaps: [] })` → `{}`;
  `usagePercentiles({}, 'RB', null, 0)` → every kind `null`; no throw.
- **P8 copied-definition equality — `leagueStarterIds` vs `buildStarterPool` (original:
  `src/utils/starterPercentiles.js:32–41`).** Imports both. One fixture of weekly rows used as both
  `playedWeeklyMaps` (via `wk(...)`) and `weeklyResult = { complete: true, weeks: [{ week, rows }] }`, with
  `scoringSettings = { rec: 1 }` and every candidate given a distinct `rec` in the one week he is started (so
  each `buildStarterPool` value maps back to exactly one id). Candidates cover: started + `gp 1` (in);
  started + `gp 0` (out); rostered never started (out); a K started + `gp 1` (out — `leagueStarterIds` keeps
  `LEGEND_POSITIONS`, so compare those positions only); one id in `playerMap` with no position (out).
  `throughWeek` = the last week in `playedWeeklyMaps`. Asserts, per position in `LEGEND_POSITIONS`, the id set
  recovered from `buildStarterPool`'s values equals `new Set(leagueStarterIds(...)[pos])`. Fails if either
  rule changes alone (e.g. one drops the `gp === 1` check). Red: drop the `gp === 1` check in
  `leagueStarterIds` only — the `gp 0` starter appears on one side; revert.

`src/components/week/LineupTable.test.jsx`:

- **L1 coloured share chip.** Row with `usage.snap 0.6`, `usagePctByPlayer={{ p1: { snap: 0.9 } }}` →
  `col-snap [data-testid="usage-share"]` has `style.backgroundColor === scaleCss(0.9)`, `data-pct="90"`, and
  the count text node is outside that span. Fails if the count is coloured or the pct is ignored.
- **L2 neutral share.** Same row, `usagePctByPlayer={}` → `usage-share` has no `backgroundColor`, has
  `text-dp-muted`. Fails if a missing pct renders a colour (e.g. `scaleCss(0)` dark purple).
- **L3 TD column.** `IDS.usage` (`:393`) gains `'col-td'` between `'col-rztgt'` and `'col-snap'`; header order
  check: the `thead th` texts include `RZ TGT`, `TD`, `SNAP` consecutively. A QB row with `counts.td 3`,
  `usage.td null` → `col-td` text `3 · —`, no `usage-trend`, no `backgroundColor`. Fails if the column is
  misplaced, a QB shows a share, or TD gets a trend.
- **L4 legend line.** Rendered with `thisSeason={2026}`, the `lineup-legend` text contains "A coloured share
  is how it ranks among this league’s starters at his position", "the same scale as 2026 WEEKS." and
  "uncoloured until he has played 3 games and at least 15 league starters at his position". Fails if the
  legend line is missing or a JSX join drops a space ("15league", "2026WEEKS"). Red: delete one `{' '}`.
- Existing `textContent.startsWith('120 · 60%')` (`:851`) must stay green unchanged.

`src/hooks/useWeeklyDecision.test.js`:

A new `describe('usage colour pool', …)` with its own fixture (the file's existing `args` mock
`getWeeklyStatRows` to `{}` and pass `playerMap: {}`, so they cannot exercise a pool):

- Fixture: `currentWeek: 4`; `myTeam` renders one WR `w1` (`starterSlots: ['w1']`, team `DAL`); 15 more WR
  ids `x1..x15`; `playerMap` gives all 16 `{ position: 'WR' }`. `getWeeklyStatRows.mockImplementation((s, w)
  => Promise.resolve(w <= 3 ? rowsFor(w) : {}))` where `rowsFor(w)` holds `TEAM_DAL: { stats: { pass_att: 30,
  rush_att: 20 } }` and, for each of the 16 ids, `{ team: 'DAL', stats: { gp: 1, rec_tgt: <distinct per id>,
  rec: 1, tm_off_snp: 60, off_snp: 40 } }` — so every one has 3 played weeks (clears both floors).
- **H1 no starters → no colour.** That fixture with no `starterWeeks` → every value in
  `result.current.usagePctByPlayer.w1` is `null`. Fails if the pool is built from every player in the
  weekly rows rather than league starters (with 16 qualifying WRs in the rows, that defect would colour).
- **H2 pool wired.** Same fixture with `starterWeeks: [{ week: 1, ids: ['w1', 'x1', …, 'x15'] }]` →
  `usagePctByPlayer.w1.target` is a number in [0,1] and `.rush` is `null` (WR). Fails if `starterWeeks` is
  not threaded into the pool.

`src/__tests__/opponentStrengthViewOnly.test.js`: §6.

---

## 8. Docs (same change)

- `docs/nav/utils.md` `weeklyUsage.js` row (`:77`): "four" → the usage shares; `buildTeamAggregates` shape
  gains `rushTd, recTd`; `accumulateUsage` sums TD components and counts `playedWeeks`; `computeUsageShares`
  → `{rush, target, touch, snap, td}` (`td` null for QB); counts gain `td` (QB passing + rushing); new
  `buildSeasonUsage` (the one path the row and the pool share). New row `usagePercentiles.js` after
  `starterPercentiles.js` (`:88`): §2.1 population/unit/floors, the three exports, constants, view-only
  (guarded by `opponentStrengthViewOnly.test.js` T25).
- `docs/navigation.md` `useWeeklyDecision.js` row (`:101`): `starterWeeks` param, `usagePctByPlayer` output.
- `docs/nav/components.md`: `week/LineupTable.jsx` row (`:11`) USAGE list gains TD (`count · share`, QB count
  only, no trend) and "each share chip coloured by league-starter rank at the position (`usagePctByPlayer`,
  `scaleCss`), neutral below the pool/row floors"; `week/WeekView.jsx` row (`:8`) gains `starterWeeks` in and
  `usagePctByPlayer` out.
- `docs/signal-registry.md` "Sleeper weekly stat rows" row (`:58`): add "touchdowns and their shares
  (`rush_td`, `rec_td`, `pass_td` over `TEAM_*` `rush_td`/`rec_td`), and the league-starter usage-share
  colour (usagePercentiles.js)" to the view-only consumer list.
- CLAUDE.md: no change (no new directory, invariant or command; `src/utils/` row already covers it). Check
  the size test stays green regardless.

## 9. Nothing else

No change to `weeklyLineup.js`, `starterPercentiles.js`,
`percentileColour.js`, `WeeklyStrip.jsx`, `WeekSlot.jsx`, `SeasonGrid.jsx`, Portfolio, the season grid, TTLs,
or any data-store loader. No prior-season usage pool. No colouring of the mini-bar trends.

## 10. Smoke (Session 2) and what Anton checks in the app

Session 2, `/week` in the running app: usage share chips coloured on starters past week 3; a clear workhorse
(high SNAP/TARGET share) reads green, a part-timer purple; a WR's RUSH/RZ RUSH and a QB's TARGET/RZ TGT read
`—` uncoloured; TD column sits between RZ TGT and SNAP, a QB's TD cell is `n · —` uncoloured; no `NaN`, no
clipped cells, header and body column counts match (bench divider spans the table). Console clean. Report
the `grep -rn "PROVISIONAL(" src/` output.

Anton checks: the colours read right on players he knows; the TD column; grey (uncoloured) cells are
explained by the legend line.

## 11. Open items to surface at sign-off

- The 3-game row floor means a returning starter's chips stay grey for his first two games back.
- QB TOUCH and RUSH shares are coloured among QBs (QB touch is small for everyone; the colour is relative).
- No prior-season fallback: weeks 1–3 of a season show no usage colour at all.

---

## Plan review

plan-reviewer, depth full (opus, high), 2026-11-27, six flags: [copy] (medium) `leagueStarterIds` restates
`buildStarterPool`'s membership rule with no equality test; [edge-case] (medium) H1 could not catch its
defect against the file's empty mocks; [edge-case] (low) H2 fixture under-specified; [edge-case] (low) P2's
averaged value miscomputed (0.40, not 0.3667); [mechanical] (low) C1's red step named in a function that
only sees totals; [edge-case] (low) §5.4 legend JSX join could render "15league". Anton: "fix all six"
(2026-11-27). All six fixed in this file: copied-definition line + P8; H1/H2 own fixture; P2 negative pinned
to 0.40; C1 mutation moved to `accumulateUsage`; §5.4 `{' '}` joins + L4 asserts them. Review depth stays
`full` (no new trigger). Approved by Anton 2026-11-27.

## Fix pass 1

Source: implementation-reviewer, depth full (opus, high), 2026-11-27, on `bba4f2b..9252cbc`: two low flags,
both test gaps (no source defect found). Both accepted. Review depth for the re-run: light (test-only, no
trigger). **Touch only the two test files below; no source change.**

### FP1-a `src/components/week/LineupTable.test.jsx` — L5, every column's pct wiring

In `describe('LineupTable — usage colour and TD column', …)` (`:1018`) add:

- **L5 each usage column reads its own kind.** One RB row with `usage: { ...FULL_USAGE, td: 0.25 }`,
  `counts: { ...FULL_COUNTS, td: 4 }`, and `usagePctByPlayer={{ p1: { rush: 0.11, target: 0.22, touch: 0.33,
  rzRush: 0.44, rzTarget: 0.55, td: 0.66, snap: 0.77 } }}`. Assert `chipIn(container, id).getAttribute('data-pct')`
  is `'11'` for `col-rush`, `'22'` `col-target`, `'33'` `col-touch`, `'44'` `col-rzrush`, `'55'` `col-rztgt`,
  `'66'` `col-td`, `'77'` `col-snap`. Fails if any cell is fed another kind's pct or none. Red: in
  `LineupTable.jsx` `LineupRow`, temporarily pass `pct={pc?.touch ?? null}` to the TARGET cell — L5 red on
  `col-target`; revert. Then drop `pct` from the TD cell — red on `col-td`; revert.

### FP1-b `src/hooks/useWeeklyDecision.test.js` — H3, the in-progress week stays out of the pool

In `describe('usage colour pool', …)` (`:293`) add:

- **H3 the current week is excluded from pool and row.** Same fixture and `starterWeeks: [{ week: 1, ids }]`,
  but the mock also returns, for `w === 4` (= `currentWeek`), `TEAM_DAL: { stats: { pass_att: 300 } }` and
  every `x1..x15` with `{ team: 'DAL', stats: { gp: 1, rec_tgt: 0, rec: 0 } }` (no `w1` row). Excluding week 4,
  `w1` (`rec_tgt 1` per week) has the lowest of 16 equal-denominator target shares, so
  `usagePctByPlayer.w1.target` is `0.5 / 16` (`toBeCloseTo(0.03125, 6)`). Fails if the pool is built from
  `weeklyMaps` (which includes `currentWeek`) instead of `playedWeeklyMaps` — the x-players' shares would drop
  below w1's and his pct would rise. Red: in `useWeeklyDecision.js` temporarily pass `weeklyMaps` to
  `buildUsagePool`; see H3 red; revert.

Leave P1 as is (a pure function can only see the maps it is given; H3 now carries the "in-progress week"
defect at the wiring site).

### FP1-c Done-definition

`npm test`, `npm run lint`, `npm run build` (the >500 kB chunk warning is pre-existing). Commit both test
files in one commit on `main`, not pushed. Hand back the SHA, the two red steps seen failing and reverted.

## Verification

Session 1, 2026-11-27. Implementation `9252cbc` (Session 2, sonnet high) + fix pass 1 `fc72319` (fix-applier,
sonnet), both on `main`, unpushed.

- implementation-reviewer, depth full (opus, high), on `bba4f2b..9252cbc`: two low flags — [untested] only
  SNAP's pct wiring asserted; [test-honesty] the in-progress-week defect unexercised at the wiring site. No
  source defect. Both accepted → `## Fix pass 1` (L5, H3).
- Fix-pass re-review, depth light (sonnet), on `9252cbc..fc72319`: no flags; test-only, exactly the two
  files named.
- Session 2 deviations accepted: T10 column-order test updated for 19 columns; P2 red averaged per-week
  `buildSeasonUsage` shares (same defect, gave 0.40); several red steps split or substituted, each seen red;
  pre-existing >500 kB build chunk warning (also on `bba4f2b`).
- Session 1 re-ran at `fc72319`: `npm test` 202 files / 3821 tests green; `npm run lint` 0 problems.
- Smoke (Session 2, week 12, Dynasty 040): 19 columns, TD between RZ TGT and SNAP, workhorse green /
  part-timer purple, inapplicable shares `—`, QB TD count only, no console errors. Joe Milton's uncoloured
  row checked by Session 1: 2 played weeks (wk 9, 11) — below `USAGE_POOL_MIN_WEEKS`, correct.
- `PROVISIONAL(` inventory: two new `no-data` tags (`usagePercentiles.js:64`, `LineupTable.jsx:85`).
- Cross-repo index: untouched. Data-repo backlog: nothing added.

Final outcome: clean.

Signed off by Anton 2026-11-27
