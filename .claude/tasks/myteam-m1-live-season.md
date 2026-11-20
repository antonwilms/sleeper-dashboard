# Brief M1 — My Team on the live season: usage, offences, factual header, bench, team name

Review depth: full — Portfolio.jsx size; state-placement decision against the App.jsx-owns-state invariant.

**Revision 1 (2026-11-20): plan-reviewer (full) flags 1–7 folded in** (Anton: "fold all flags in").
1 → import-guard test in touch list; 2 → picks cells/classes, three more changed tests in §4; 3 → ROS
popover stops propagation (T14); 4 → T7 uses `pre`; 5 → T9 mutation; 6 → architecture.md + loader header;
7 → render-site PROVISIONAL tag. Flag 8 not taken (`wc -c` ≈40.1 KB, under 40 KiB).
**Revision 2:** re-review flags folded in (Anton) — T20 bench count ≥1; ROS key stop narrowed to Enter/Space.

Session 1: opus, high. **Session 2: sonnet, medium.** Visual change — Session 2 runs the app; Anton judges.
Planned at app `60fd35c` (main == origin/main). Data repo read at `origin/main` `107e089` (local checkout
`7be344b`, 4 ahead / 2 behind, another session's uncommitted file — read only, untouched).
Design source: Claude.ai project doc `claude/ux-briefs-week-and-myteam.md` → Display rule, Season-order
convention, Brief M §1–4, Tests, Risks (pasted by Anton 2026-11-20; not on disk). M2/M3 outline at the end.

---

## 0. For Anton

In season My Team stops showing last season under this season's name: usage shows 2026 so far over grey
2025; offences use 2026 team data (2025 with a caption until it loads) and 2026 quarterbacks; the header
sentence leads with so far, then ROS, then a per-position rank line, no "weak spot"; ladders and weakest
slots show so far and ROS; picks get their own block; injured players sink; the meta line shows the team
name. Out of season only the bench split and team name change. View-only; in season it adds the 2026
team-context file (small) and 2026 game logs (~2–3.5 MB, already fetched by Market's Usage view), cached.

## 1. View-only statement

Nothing in this slice reaches `playerRows`, `projectedPPG`, the dynasty score, a snapshot, a `factors`
entry or `docs/cross-repo-registry.md`. The App effect writes only `teamContextByYear` (view-only;
`teamContextViewOnly.test.js` unaffected); usage reuses `buildWindowStats` (same CR-34 keys, no new one);
CR-09/CR-10 are shape/floor contracts, not consumer lists. **If Session 2 finds any of
this wrong, stop and report.**

## 2. Decisions (Session 2 does not revisit)

**D1 — Live usage source: `liveSeasonTotals` rows, through Market's `buildWindowStats`.** Not /week's
weekly layer (route-scoped to `useWeeklyDecision`; reading it would mean moving it to App). Field check:
- Fixture `season-totals-2025.json`: `stats.{off_snp, tm_off_snp, rec_tgt, rush_att}`, `weeklyStatus`
  (no `weeklyStats`; tests build their own rows).
- Served file `origin/main:nfl/season-totals/2026.json` (schemaVersion 4, `inProgress`, 2,734 rows) —
  what `loadCurrentSeasonTotals` caches, so it stands in for IndexedDB. Rows carry `stats, team,
  gamesPlayed, weeklyStatus, weeklyStats, weeklyPoints, fantasyPoints, …`; `off_snp` on 882 rows,
  `tm_off_snp` 1,991, `rec_tgt` 490, `rush_att` 313; `weeklyStats[w]` has `rec_tgt`/`rush_att`.
- *Optional for Anton:* DevTools → IndexedDB → key `${CURRENT_SEASON_TOTALS_CACHE_PREFIX}/2026`
  (`sleeperStats.js`) → a WR row has `stats.off_snp`, `stats.tm_off_snp`, `weeklyStats`.

**D2 — Share definition (in season, both the live value and the grey prior value): Market D2b's
games-played share** — Σ the player's weekly targets (WR/TE) or carries (RB) ÷ Σ his team's weekly totals
over the weeks he played, each week credited to that week's team (`SHARES` `tgtShare`/`carryShare`),
not the season-total share (`buildPerSeasonTeamShares`). SNAP = `usage.snapPct`, `null` for QBs. **Out of season SHARE/SNAP stay
on `buildUsageHistory`, unchanged** (the brief's "out-of-season unchanged" test) — see Open items.

**D3 — Live teamcontext loads in App.jsx, merged into the existing `teamContextByYear` map.** A new
effect beside the SOS-schedule effect (App.jsx ~L1428–1440 — the precedent, merging `dataSeason + 1`
into `nflScheduleByYear`) calls `loadTeamContext(dataSeason + 1)`. Why: (a) App owns it, invariant held,
no new state; every consumer indexes the map by an explicit season (checked Teams, TeamDetail,
EnvironmentSection, Market, Portfolio, useTeamHistoryLoader — none iterates keys); (b) a Portfolio hook
like `useWeeklyDecision` would put two route hooks on one file, outside App, for M2 to undo; (c) lifting
`useWeeklyDecision`'s `liveTeamContext` is M2's job. **This also decides M2** (it reads
`teamContextByYear[liveSeason]` and deletes the hook's copy). In season `dataSeason + 1 ===
phase.liveSeason`; Portfolio reads `[phaseLiveSeason]`, so a mismatch falls back with the caption.

**D4 — Live gamelogs (QB column, and exact week teams for the shares) load on demand through App's
existing `onNeedGameLogSeason`** (`useGameLogSeasonLoader`, Market's precedent, `Market.jsx` ~L313).
Portfolio gets the callback as a new prop and calls it in season for `phaseLiveSeason` when
`gameLogsByYear?.[phaseLiveSeason] === undefined` (`nflverse/gamelogs/2026.json` is in the manifest).
While absent/incomplete the QB cell reads `—` and shares credit the season team (`makeWeekTeam`); D9.

**D5 — ROS cell `17.0 · 30%`: the % moves into a per-cell popover.** It is model mechanics, needed only
when questioning the number, and inline beside SHARE/SNAP it reads like another share stat.

**D6 — Season-order convention.** Ladders: `{liveSeason} SO FAR` left of `ROS`. Stacked usage cells:
live value main, prior season grey sub-line naming its season (`2025 33%`). Summary sentence: so far,
then ROS.

**D7 — Bench "unavailable" = `OUT_STATUSES` (`Out, IR, PUP, Sus, DNR`) on `playerMap[id].injury_status`,
or the id is in my roster's `reserve` list.** /week's set. `weeklyDecisionViewOnly.test.js` forbids
importing `weeklyOwnProjection` here, so the constant **moves** to `injuryStatus.js` and is re-exported.

**D8 — Out-of-season scope.** §1–§2 changes are in-season only (`inSeasonLayout`). §3 (picks block, IR
sort) and §4 (team name) and nothing else apply in both phases.

**D9 — Unsplit caption.** In season, when `seasonsWithoutWeekTeams([phaseLiveSeason, dataSeason],
gameLogsByYear)` is non-empty, the Starting-ten legend appends Market's wording: ` Mid-season team
changes are not split for {years joined ", "}.`

## 3. Changes by file (touch list)

| File | Change |
|---|---|
| `src/utils/injuryStatus.js` | + `export const OUT_STATUSES = ['Out', 'IR', 'PUP', 'Sus', 'DNR']` (moved, D7) |
| `src/utils/weeklyOwnProjection.js` | Replace the definition with `import { OUT_STATUSES } from './injuryStatus'` + `export { OUT_STATUSES }` |
| `src/utils/lineup.js` | Hoist `ppgOf`; `buildPositionLadders` live fields; new `attachLiveSlotComparison` (§3.2) |
| `src/utils/portfolioUsage.js` | **New**, pure: `buildInSeasonUsage` (§3.1) |
| `src/components/portfolio/Portfolio.jsx` | §3.3 |
| `src/components/portfolio/LeagueLadders.jsx` | In-season props (§3.4) |
| `src/components/portfolio/WeakestSlots.jsx` | In-season props (§3.5) |
| `src/components/portfolio/TeamOffences.jsx` | `dataSeason` → `season`; in-season caption/labels (§3.6) |
| `src/App.jsx` | Live teamcontext effect; Portfolio props (§3.7) |
| `src/hooks/useWeeklyDecision.js` | Comment only, at the `liveTeamContext` declaration (§3.7) |
| `src/hooks/useGameLogSeasonLoader.js` | Header comment only: callers list adds My Team (live season, in season) |
| `src/__tests__/weeklyDecisionViewOnly.test.js` | `weeklyOwnProjection.js imports exactly ./nflStats` → `toEqual(['./nflStats', './injuryStatus'])` in source order, renamed `imports exactly ./nflStats and ./injuryStatus` (rev 1, flag 1) |
| Tests | §4 |
| Docs | §6 |

### 3.1 `src/utils/portfolioUsage.js` (new)

Header: view-only, pure; never feeds projection/scoring; imports `buildWindowStats` from
`./marketWindowStats` and `buildAvailabilityGrid` from `./availabilityGrid` only.

```js
/**
 * @param {{ ids: Iterable<string>, liveRows: object|null, liveSeason: number|null, careerStats: object|null,
 *   dataSeason: number|null, playerMap: object|null, gameLogsByYear: object|null }} args
 * @returns {Map<string, { live: UsageLine|null, prior: UsageLine|null }>}
 * UsageLine = { weeks: Array<'P'|'D'|'B'|'X'>|null, played: number|null, missed: number|null,
 *               share: number|null, snap: number|null }
 */
export function buildInSeasonUsage({ ids, liveRows, liveSeason, careerStats, dataSeason, playerMap, gameLogsByYear })
```
- Live stats: `liveRows != null && Number.isFinite(liveSeason)` →
  `buildWindowStats({ window: { id: 'live', kind: 'live', seasons: [liveSeason] }, careerStats,
  currentSeasonTotals: { season: liveSeason, complete: true, players: liveRows }, playerMap, gameLogsByYear })`;
  else no live lines (`live: null` for every id).
- Prior stats: `careerStats?.[dataSeason]` present →
  `buildWindowStats({ window: { id: String(dataSeason), kind: 'season', seasons: [dataSeason] }, careerStats,
  currentSeasonTotals: null, playerMap, gameLogsByYear })`; else `prior: null`.
- Per id and side, from that side's rows `R` (`liveRows` / `careerStats[dataSeason]`) and stats entry `E`
  (`stats.get(id)`), position `p = playerMap?.[id]?.position`:
  - `weeks`: `Array.isArray(R?.[id]?.weeklyStatus)` → `buildAvailabilityGrid({ [y]: R }, id, [y]).rows[0].weeks`,
    else `null`; `played` = count `'P'`, `missed` = count `'D'` (both `null` when `weeks` is null).
  - `share`: `p === 'RB'` → `E?.usage.carryShare ?? null`; `p` WR/TE → `E?.usage.tgtShare ?? null`; else `null`.
  - `snap`: `p` in RB/WR/TE → `E?.usage.snapPct ?? null`; else `null` (QB rule).
  - A side whose row is absent and `E` absent → that side is `null`.
- Never mutates its inputs.

### 3.2 `src/utils/lineup.js`

- Hoist `buildLeagueLineups`' inner `ppgOf(rows, player)` to module scope as
  `function ppgOf(rows, player)` — body byte-identical; `buildLeagueLineups` calls it as before.
- `buildPositionLadders(leagueLineups, myRosterId)`: when `leagueLineups.every(l => l.live != null)`,
  each entry also carries `liveMine, liveRank, liveMedian, liveAll, liveMove` — computed exactly as the
  `last*` fields from `valueOf(l, 'live')`, with `liveMove = projRank - liveRank` when both non-null,
  else `null`. When any lineup lacks `live`, these keys are **absent** (out-of-season shape unchanged).
- New export:
```js
// In-season companion to buildWeakestSlots: for each row (a slot of my `proj` lineup), the slot player's
// live PPG so far against the median of the OTHER teams' `live` lineup at the same slot index.
// mine = ppgOf(liveRows, { player_id: row.player_id }); median over others' l.live.slots[i].points
// (finite only, same median()); diff = mine − median. live: null when liveRows is null, either side null,
// or any lineup lacks `live`. Returns new row objects; input untouched.
export function attachLiveSlotComparison(weakRows, leagueLineups, myRosterId, liveRows)
// → Array<row & { live: { mine: number, median: number, diff: number } | null }>
```
Still a leaf module (imports nothing; `lineupViewOnly.test.js` stays green).

### 3.3 `src/components/portfolio/Portfolio.jsx`

Props: **remove** `username`; **add** `onNeedGameLogSeason = null`.

**§4 meta.** `metaParts`: `identity` becomes `myTeamName` (drop `username ??`). Header comment line
near `metaParts` names /week's meta line as the precedent.

**§1 usage.**
- `const inSeasonUsage = useMemo(() => (inSeasonLayout ? buildInSeasonUsage({ ids: <the same id set
  playerFactsById builds>, liveRows, liveSeason: phaseLiveSeason, careerStats, dataSeason, playerMap,
  gameLogsByYear }) : null), [...])`. Extract the id-set build (starters ∪ ownedRows) into a memo
  `factIds` used by both.
- `EMPTY_FACTS` and each facts entry gain `usage: null` / `usage: inSeasonUsage?.get(id) ?? null`.
  Existing `weeks/played/missed/share/snap` are untouched (out-of-season path).
- New cell `UsageStackCell({ main, sub, subSeason, format })`: main line `format(main)` or `—`; grey
  sub-line (`font-dp-mono text-[10.5px] text-dp-text-5`) `${subSeason} ${format(sub)}` only when `sub != null`.
  `format` for SHARE/SNAP: `v => `${Math.round(v * 100)}%``.
- New cell `LiveGamesCell({ live, prior, priorSeason })`: `GamesStripCell` of `live` (or `—` when
  `live?.weeks == null`), plus grey sub-line `${priorSeason} ${prior.played}/${prior.played + prior.missed}`
  when `prior?.weeks != null`.
- In season (both tables, player rows): `col-games` → `LiveGamesCell`, `col-share`/`col-snap` →
  `UsageStackCell` (`main = f.usage?.live?.share`, `sub = f.usage?.prior?.share`, `subSeason = dataSeason`).
  Pick and empty rows keep their literal `—`.
- Headers in season: `GAMES {phaseLiveSeason}`, `SHARE {phaseLiveSeason}`, `SNAP {phaseLiveSeason}`.
  Out of season: unchanged (`GAMES {dataSeason}`, `SHARE`, `SNAP`).
- Legend (in-season branch, ~L1108): replace the `GAMES, SHARE and SNAP are ${dataSeason}'s: …` sentence with
  `` `GAMES, SHARE and SNAP are ${phaseLiveSeason}'s so far, with ${dataSeason ?? '—'} in grey beneath. SHARE is the player's share of his team's targets (pass-catchers) or carries (backs) in the games he played, as on Market; SNAP is offensive snap share, not tracked for quarterbacks.` `` then D9's
  clause, then the existing dashed-week sentence. Out-of-season legend unchanged. One render-site tag
  beside the D9 clause (it covers the in-season SHARE cells too, Market.jsx:321 precedent):
  `// PROVISIONAL(heuristic): in-season SHARE credits a week to the season team when that season's gamelogs are not complete · makeWeekTeam's fallback · complete gamelogs for both seasons`.
- Request live gamelogs: `useEffect(() => { if (inSeasonLayout && Number.isInteger(phaseLiveSeason) &&
  phaseLiveSeason !== dataSeason && gameLogsByYear?.[phaseLiveSeason] === undefined && onNeedGameLogSeason)
  onNeedGameLogSeason(phaseLiveSeason) }, [...])` — no state write, so no `cancelled` flag.

**§1 offences.** Replace `const tcForSeason = teamContextByYear?.[dataSeason]` with:
```js
const liveTc = inSeasonLayout ? teamContextByYear?.[phaseLiveSeason] : null
const offenceSeason = liveTc?.complete ? phaseLiveSeason : dataSeason
const offenceFallback = inSeasonLayout && !liveTc?.complete   // caption in TeamOffences
const tcForSeason = teamContextByYear?.[offenceSeason]
```
`primaryPassers` and `efficiency` read `gameLogsByYear?.[offenceSeason]` and pass `offenceSeason` to
`computeSeasonEfficiency`. `teamMetrics`/`scriptByTeam` therefore follow `offenceSeason` (GAME SCRIPT
too). Update the D9 comment at ~L742: the gamelogs/teamcontext key sets are identical for every season
since 2020, which covers `dataSeason` and the live season. GAME SCRIPT popover gloss (both tables):
in season `` `… Team margin and pass rate are ${offenceSeason}'s regular season${offenceSeason === phaseLiveSeason ? ' so far' : ''}.` ``;
out of season unchanged text. `<TeamOffences>` gets `season={offenceSeason}`, `inSeason={inSeasonLayout}`,
`liveSeason={phaseLiveSeason}`, `fallback={offenceFallback}` (replaces `dataSeason=`); `priorSeason`
fallback becomes `?? dataSeason` unchanged.

**§2 header sentence.** `summarySentence` gets an in-season branch (`inSeasonLayout`); the existing body
becomes the out-of-season branch, byte-identical. In season, with `L = ladderBy.Lineup`:
- Clause 1 (when `L.liveMine != null && L.liveRank != null`): `'Your starting ten is scoring '` +
  mono-span `f1(L.liveMine)` + `` ` points a week in ${phaseLiveSeason} so far, ${ordinal(L.liveRank)} of ${teamCount}.` ``
- Clause 2 (when `L.projMine != null && L.projRank != null`): if `rosTileReady`:
  `' Rest-of-season projection '` + up-text span + `` `, ${ordinal(L.projRank)}.` ``; else
  `' Season projection '` + span + `` ` for ${projSeason}, ${ordinal(L.projRank)}.` ``. Without clause 1,
  clause 2 takes a subject: `"Your starting ten's rest-of-season projection is "` + span + `` `, ${ordinal(L.projRank)} of ${teamCount}.` ``
  (rosTileReady) or `"Your starting ten's season projection is "` + span + `` ` for ${projSeason}, ${ordinal(L.projRank)} of ${teamCount}.` ``.
- Clause 3 (factual line, when ≥1 of QB/RB/WR/TE has `liveRank != null`):
  `` ` So far by position: ${groups.map(g => `${g} ${ordinal(ladderBy[g].liveRank)}`).join(', ')}.` ``
- No carry/drag clause in season. Return `null` when clauses 1 and 2 are both absent. Never falls back
  to last season. All literal fragments stay JS strings (the existing whitespace comment applies).

**§2 ladders / weakest.** `<LeagueLadders … inSeason={inSeasonLayout} liveSeason={phaseLiveSeason}
rosReady={rosTileReady} />`. `const weakestRows = useMemo(() => inSeasonLayout ? attachLiveSlotComparison(
weakestSlots, leagueLineups, myRosterId, liveRows) : weakestSlots, …)`; `<WeakestSlots rows={weakestRows}
… inSeason={inSeasonLayout} liveSeason={phaseLiveSeason} />`.

**§2 ROS cell (D5).** `RosCell` renders `ros.value.toFixed(1)` only, wrapped in
`<DefinitionPopover term="Rest of season" gloss={`${Math.round(ros.weight * 100)}% of this estimate comes from this season's games; the rest is the preseason projection.`}>`,
the popover itself inside `<span onClick={stop} onKeyDown={stopActivate}>` with module-level
`const stop = e => e.stopPropagation()` (TwoYearRank.jsx precedent) and
`const stopActivate = e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }` — opening it
never fires `ClickableRow`'s `onOpen`, and Escape still reaches DefinitionPopover's document listener.
Header popover gloss drops "; the % is this season's share of the estimate" (both tables). Starting-ten
legend sentence `ROS is the preseason projection updated with this season's games` gains `` — open a ROS value for how much of it is this season``.

**§3 bench.**
- `myReserveIds = new Set((rosterTeams.find(t => t.rosterId === myRosterId)?.reserve ?? []).map(p => p.id))`.
- `unavailable(row) = OUT_STATUSES.includes(playerMap?.[row.player_id]?.injury_status) || myReserveIds.has(row.player_id)`.
- `benchRows` becomes players only: today's `[...withProj, ...withoutProj]` order applied to the
  available players, then the same order applied to the unavailable ones. `pickRows` = today's sorted
  picks (`{ kind: 'pick', row }`), its own memo.
- Bench header: `Bench · {n} player{s}` (picks count leaves it). Toggle/collapse counts players only.
  Empty-state text `'No bench players.'`.
- New block `data-testid="bench-picks"` directly after the Bench card, same card classes, title
  `Draft picks · {n}`, sub `sorted by KTC value · untraded picks price at Mid`, a two-column table
  `PICK` | `KTC` reusing `PickCell` and `PickValueCell` (no lens classes), inside `FrozenScroll`; cells
  keep `data-testid="col-player"` (classes `px-[10px] py-2 first:pl-[18px] ${FROZEN_FIRST} ${FROZEN_EDGE}
  bg-dp-card ${FROZEN_ROW_HOVER}`, as today) and `data-testid="col-ktc"`; no `col-script` or other cells.
  Rows keep `data-testid={`bench-${row.id}`}`. Rendered only when `pickRows.length > 0`.
- So-far PPG and rank on every bench player row: already true in season (`col-sofar` → `SeasonLineCell`);
  a test pins it (§4 T10).

### 3.4 `LeagueLadders.jsx`

Props add `inSeason = false, liveSeason = null, rosReady = false`. In season: column 1 header
`{liveSeason ?? '—'} · SO FAR`, ladder reads `l.liveRank`; column 2 header `rosReady ? 'ROS' :
`${projSeason ?? '—'} · PROJECTED``; MOVE reads `l.liveMove`; footnote second sentence:
`MOVE is how many places the ${rosReady ? 'rest-of-season projection' : `${projSeason} projection`} moves you from your ${liveSeason} rank so far.`
Out of season: unchanged. Header comment: note `live*` fields.

### 3.5 `WeakestSlots.jsx`

Props add `inSeason = false, liveSeason = null`. In season: subtitle
`vs the median starter at that slot · ${liveSeason} so far and ROS`; right column widens to `150px`;
it stacks two labelled blocks: `data-testid="weak-sofar"` — `${liveSeason} so far ${signed(live.diff)}`
over `${f1(live.mine)} vs med ${f1(live.median)}` (`—` when `row.live == null`); then
`data-testid="weak-ros"` — `ROS −${f1(loss)} ppg` over `${f1(mine)} vs med ${f1(median)}`. `signed`: `+`
for ≥ 0, `−` (U+2212) otherwise, one decimal. Up/down colour on the so-far diff (`text-dp-up-text` ≥ 0,
`text-dp-down-text` < 0). Rows stay ranked by ROS loss. Summary paragraph in season is prefixed
`'By rest-of-season projection: '` (first letter of the existing text lowercased). Out of season unchanged.

### 3.6 `TeamOffences.jsx`

Rename prop `dataSeason` → `season` (every use). Add `inSeason = false, liveSeason = null, fallback = false`.
- Subtitle: `` `${season} season${inSeason && season === liveSeason ? ' so far' : ''}, regular season only · …` ``.
- When `fallback`: `<div data-testid="offences-fallback-note" className="px-[18px] py-2 text-[11.5px] text-dp-muted-2 border-b border-dp-border-row">`
  `` `No ${liveSeason} team data loaded yet — this table shows ${season}, the last full season.` `` placed under the header.
- QB header `QB ${season} · EPA/ATT`; gloss in-season-live: `` `${season}'s passer with the most attempts so far, and his EPA per attempt.` ``; otherwise today's text.
- `fpaPriorSeason = priorSeason ?? season`.

### 3.7 `App.jsx` and `useWeeklyDecision.js`

New effect directly after the SOS schedule effect, comment explaining D3 and naming M2:
```js
useEffect(() => {
  if (!careerStats) return
  let cancelled = false
  const allSeasons = Object.keys(careerStats).map(Number).sort()
  const liveTcSeason = allSeasons[allSeasons.length - 1] + 1
  loadTeamContext(liveTcSeason)
    .then(r => { if (!cancelled) setTeamContextByYear(prev => ({ ...prev, [liveTcSeason]: r })) })
    .catch(err => console.warn('[teamContext] live load error:', err.message))
  return () => { cancelled = true }
}, [careerStats])
```
`<Portfolio>`: delete `username={…}`; add `onNeedGameLogSeason={onNeedGameLogSeason}`.
`useWeeklyDecision.js` ~L128–133 comment: replace "Route-scoped to `/week`, not merged into App.jsx's
`teamContextByYear` — do not widen that effect or `ENV_SEASONS` to cover this read." with "App.jsx also
loads the live season into `teamContextByYear` for My Team (`myteam-m1-live-season.md` D3); Brief M2 moves
this panel there and deletes this state. Do not widen `ENV_SEASONS`." No code change in the hook.

## 4. Tests

Every test names its defect, the red-step mutation Session 2 applies, and the fixture fact that makes it
bite. Fixture names refer to `Portfolio.test.jsx`'s describes.

**Shared fixture additions (Fixture M):** `LIVE_U` = `LIVE` with
`w1: { …LIVE.w1, team: 'DAL', weeklyStatus: W(3), stats: { rec_tgt: 9, off_snp: 120, tm_off_snp: 200 },
weeklyStats: { 1: { rec_tgt: 3 }, 2: { rec_tgt: 3 }, 3: { rec_tgt: 3 } } }`,
`w2: { …LIVE.w2, team: 'DAL', weeklyStatus: W(3), stats: { rec_tgt: 21 }, weeklyStats: { 1: { rec_tgt: 7 }, 2: { rec_tgt: 7 }, 3: { rec_tgt: 7 } } }`,
`q1: { gamesPlayed: 3, fantasyPoints: 60, team: 'DAL', weeklyStatus: W(3), stats: { off_snp: 60, tm_off_snp: 60 }, weeklyStats: {} }`.
`CS_U` = `careerStats` with 2025 `w1.stats = { off_snp: 900, tm_off_snp: 1000, rec_tgt: 30 }`,
`w1.weeklyStats` = weeks 1–15 each `{ rec_tgt: 2 }`; `w2.stats = { rec_tgt: 90 }`, `w2.weeklyStats` =
weeks 1–15 each `{ rec_tgt: 4 }`, weeks 16–17 each `{ rec_tgt: 15 }`. Facts: w1 live share 9/30 = **30%**,
live snap **60%**, live games **3/3**; prior games-played share 30/(30+60) = **33%**, season-total share
30/120 = **25%**, prior snap **90%**, prior games **15/17**.

| # | File | Asserts | Fails if | Red-step mutation | Fixture fact |
|---|---|---|---|---|---|
| T1 | Portfolio.test (Fixture M) | In season (`inSeasonProps`, `careerStats=CS_U`, `liveSeasonTotals=LIVE_U`): starter row 3 `col-share` main `30%` and sub `2025 33%`; `col-snap` main `60%`, sub `2025 90%`; `col-games` contains `3/3` and `2025 15/17` | usage reads `dataSeason` for the main value, or the prior sub-line uses the season-total share | in `buildInSeasonUsage` return `prior` as `live`; then separately swap the prior share to `buildUsageHistory`'s | live ≠ prior (30 vs 33, 60 vs 90); games-played ≠ season-total (33 vs 25) |
| T2 | Portfolio.test (Fixture M) | Same render: QB row 0 `col-snap` main `—` | QB snap leaks from `buildWindowStats` | drop the RB/WR/TE gate on `snap` | q1's live snaps 60/60 would read `100%` |
| T3 | Portfolio.test (Fixture M) | In season: Starting-ten and Bench headers contain `GAMES 2026`, `SHARE 2026`, `SNAP 2026`, not `SHARE 2025`; off-season (`nflState={ season: '2026', season_type: 'pre' }`, all live props passed): headers contain `GAMES 2025`, and neither `SHARE 2026` nor `GAMES 2026` | headers read the wrong season for the phase | in-season header back to `dataSeason`; then make the out-of-season header read `phaseLiveSeason` | live 2026 ≠ data 2025 |
| T4 | Portfolio.test (Fixture M) | In season legend contains `are 2026's so far, with 2025 in grey beneath`, `in the games he played`, and `not split for 2026, 2025`; with `gameLogsByYear={ 2025: {complete:true, players:{}}, 2026: {complete:true, players:{}} }` it does not contain `not split` | legend still claims dataSeason, or the caption ignores loaded logs | restore the old legend sentence; then drop the `seasonsWithoutWeekTeams` gate | Fixture M has no gamelogs → both seasons unsplit |
| T5 | Portfolio.test (Fixture M) | `onNeedGameLogSeason` spy: called with `2026` in season when `gameLogsByYear` lacks 2026; not called off-season (`pre`); not called in season when `gameLogsByYear[2026]` exists | live QB/week teams never requested, or requested off-season/repeatedly | delete the effect; then drop its `inSeasonLayout` guard | — |
| T6 | Portfolio.test (Slice D) | In season (`nflState=REG_WK4`, `teamContextByYear` adds `2026: { complete: true, teams: { DET: two tcGame(24, 20, 20), LA and CHI as in 2025 } }`, `gameLogsByYear` adds `2026: { complete: true, players: { qbNew: { games: [{ seasonType: 'REG', team: 'DET', attempts: 200, passingEpa: 20 }] } } }`, `playerMap.qbNew = { position: 'QB', full_name: 'Hendon Hooker' }`): `offence-DET` pts `24.0`, QB contains `Hendon Hooker` and `+0.100`; subtitle contains `2026 season so far`; header contains `QB 2026`; no `offences-fallback-note` | in season still reads dataSeason's teamcontext/gamelogs | revert `tcForSeason` to `teamContextByYear?.[dataSeason]` | 2026 DET 24.0 vs 2025 30.0; QB Hooker vs Goff |
| T7 | Portfolio.test (Slice D) | In season with `2026: { …, complete: false }`: `offence-DET` pts `30.0`; `offences-fallback-note` reads `No 2026 team data loaded yet — this table shows 2025, the last full season.`; off-season (`nflState={ season: '2026', season_type: 'pre' }`, so `phaseLiveSeason` is 2026) with the complete 2026 entry present: pts `30.0`, no note, subtitle `2025 season, regular season only` | fallback keys on presence not `complete`, or caption missing, or off-season picks up the live file | gate `offenceSeason` on `liveTc != null` instead of `liveTc?.complete`; then drop the `inSeasonLayout` guard on `liveTc` | incomplete 2026 entry is present as a key |
| T8 | Portfolio.test (Fixture S, `renderS()`) | `summary-sentence` textContent toBe `Your starting ten is scoring 60.0 points a week in 2026 so far, 1st of 4. Rest-of-season projection 56.0, 3rd. So far by position: QB 1st, RB 2nd, WR 1st, TE 3rd.`; not contain `carr`, `weak spot`, `keep it out` | in-season sentence leads with last season or keeps the projection-only verdict | make the in-season branch fall through to the old body | old body yields `scored 49.0 … last season` and appends `The quarterbacks carry it; …` (Fixture S test 11) |
| T9 | Portfolio.test (Fixture S) | `renderS(() => ({ liveSeasonTotals: null }))`: sentence toBe `Your starting ten's season projection is 56.0 for 2026, 3rd of 4.` (no live file → `rosTileReady` false, no clause 1 or 3); not contain `last season` | missing live file falls back to last season | in the in-season branch, substitute `L.lastMine`/`L.lastRank` when `liveMine`/`liveRank` are null (both, so clause 1's gate passes) | Fixture S last-season lineup = 49.0 |
| T10 | Portfolio.test (Fixture M) | In season, `LIVE_U` plus bench player `q3: { gamesPlayed: 3, fantasyPoints: 45, weeklyStatus: W(3) }`: q3's Bench row `col-sofar` contains `15.0` and `QB2` (q1 60 total > q3 45) | bench rows lose the so-far line | render `—` in Bench `col-sofar` | q3 has a live row |
| T11 | Portfolio.test (Fixture M) | Off-season and in-season: no row inside `bench` has a `data-testid` starting `bench-pick-`; `bench-picks` contains every pick row (reuse "picks on the bench" fixture: own + traded-in pick); Bench header reads `Bench · N players` without `pick` | picks still mixed into the bench | concatenate `pickRows` back into `benchRows` | fixture owns 2 picks |
| T12 | Portfolio.test (Fixture M) | `playerMap.q3.injury_status = 'IR'`: Bench player order (`col-player` text) is `Player r4`, `Player t2`, `Player q3`; a second render with q3 healthy and `rosterTeams[0].reserve = [{ id: 'r4', … }]` puts `Player r4` last | IR/Out or reserve players sort among healthy ones | remove the available/unavailable split | q3 has the highest bench projection (14) so it sorts first without the rule |
| T13 | Portfolio.test (Fixture S test 14) | With `username="Colts_420_Reloaded"` passed, meta reads `My Team · Dynasty 040 · 4-team 1QB · half-PPR` (second render unchanged) | meta shows the Sleeper username instead of the fantasy team name | restore `username ?? myTeamName` (keep the prop to show red) | username ≠ team name |
| T14 | Portfolio.test (Fixture M, P5b-2 update) | `col-ros` of row 3 textContent toBe `17.0`; clicking the cell's popover trigger shows `30% of this estimate comes from this season's games` and the `onOpenPlayerDetail` spy is not called | the % stays inline / is lost, or opening the popover opens the player | restore the inline ` · {pct}%` span; then remove the `stop` span | weight 0.3 |
| T15 | Portfolio.test (Fixture M) | **Out-of-season unchanged**, `nflState={ season: '2026', season_type: 'pre' }` with `CS_U`, `liveSeasonTotals=LIVE_U`, 2026 teamcontext/gamelogs passed: row 3 `col-share` `25%`, `col-snap` `90%`, `col-games` `15/17`; `col-ppg` present, `col-sofar` absent; ladders header contains `2025 · SCORED` and `2026 · PROJECTED`; no `weak-sofar`; legend equals today's out-of-season text | live data leaks into the off-season layout | make `buildInSeasonUsage` run when `!inSeasonLayout` and use it for the share | live values present but must be ignored (30%/60%/3/3) |
| T16 | LeagueLadders.test | `inSeason liveSeason={2026} rosReady` with a ladder `{ pos: 'RB', liveRank: 2, projRank: 4, liveMove: 2, lastRank: 3, … }`: header has `2026 · SO FAR` before `ROS`, `ladder-last` rank `2nd`, `ladder-move` `down 2`; `rosReady={false}` → header `2026 · PROJECTED` (projSeason 2026) | in season reads `lastRank`/`move` or loses season order | read `l.lastRank` in season | lastRank 3 ≠ liveRank 2; move unset (`null`) vs liveMove 2 |
| T17 | Portfolio.test (Fixture S) | `renderS()`: `ladder-row-RB` `ladder-last` rank `2nd`, `ladder-proj` `4th`, move `down 2` | Portfolio does not wire live ladders | pass `inSeason={false}` | live RB rank 2 vs last RB rank 3 |
| T18 | lineup.test | `buildPositionLadders` on lineups with `live` (values differ from `last`): RB entry `liveMine/liveRank/liveMedian/liveMove` equal the hand-computed values; on lineups without `live`, `'liveRank' in entry === false` for every entry | live fields read the `last` side, or appear out of season | `valueOf(l, 'last')` for the live values; then drop the `every(l => l.live != null)` guard | fixture live ≠ last |
| T19 | lineup.test | `attachLiveSlotComparison`: my proj slot RB `{ player_id: 'm-rb', points: 8 }`; others' `live` RB slots 14, 10, 8; `liveRows['m-rb'] = { gamesPlayed: 2, fantasyPoints: 24 }` → `live = { mine: 12, median: 10, diff: 2 }`; `liveRows = null` → `live: null`; input array unchanged (deep-equal to a clone) | median taken from the `proj` side, or mine from proj points, or input mutated | read `l.proj.slots[i]` for the median | others' proj RB 15, 12, 10 → median 12 |
| T20 | WeakestSlots.test | `inSeason liveSeason={2026}` row `{ …, loss: 4, mine: 8, median: 12, live: { mine: 12, median: 10, diff: 2 } }`: `weak-sofar` contains `2026 so far +2.0` and `12.0 vs med 10.0`; `weak-ros` contains `ROS −4.0 ppg` and `8.0 vs med 12.0`; summary starts `By rest-of-season projection: `; `live: null` row → `weak-sofar` contains `—`; out of season no `weak-sofar` | both bases not rendered or unlabelled | render `row.loss` in the so-far block | diff +2.0 ≠ −4.0 |
| T21 | Portfolio.test (Fixture S) | `renderS()`: `weak-row-1` (RB) `weak-sofar` contains `+2.0` and `12.0 vs med 10.0` | Portfolio passes un-augmented rows | pass `weakestSlots` instead of `weakestRows` | as T19 via the real lineups |
| T22 | TeamOffences.test | `season={2026} inSeason liveSeason={2026}` → subtitle `2026 season so far`; `season={2025} inSeason liveSeason={2026} fallback` → note text as T7; `fallback` false → no note | caption/labels ignore the props | drop the note render | — |
| T23 | injuryStatus.test (new or existing file) | `import { OUT_STATUSES as A } from './injuryStatus'`, `import { OUT_STATUSES as B } from './weeklyOwnProjection'` → `A === B` and `A` equals `['Out','IR','PUP','Sus','DNR']` | the move left two definitions | re-declare the array literal in `weeklyOwnProjection.js` | identity, not equality |
| T24 | `src/__tests__/portfolioLiveLoads.test.js` (new, source guard like `weeklyDecisionViewOnly.test.js`) | `App.jsx` source matches `/const liveTcSeason = allSeasons\[allSeasons\.length - 1\] \+ 1/`, `/loadTeamContext\(liveTcSeason\)/`, `/setTeamContextByYear\(prev => \(\{ \.\.\.prev, \[liveTcSeason\]: r \}\)\)/`; the `<Portfolio` JSX block (from `<Portfolio` to the next `/>`) contains `onNeedGameLogSeason={onNeedGameLogSeason}` and not `username=` | the live load or the callback wiring is dropped | delete the new effect | — |
| T25 | portfolioUsage.test (new) | `buildInSeasonUsage` on the T1 inputs returns w1 `{ live: { share: 0.3, snap: 0.6, played: 3, missed: 0 }, prior: { share: 30/90, snap: 0.9, played: 15, missed: 2 } }` (share to 3 dp); `liveRows: null` → `live: null`; inputs deep-equal clones after | unit-level guard of T1's numbers, and input mutation | return `usage.snapPct` for the share | as T1 |

**Existing tests that change (Session 2 updates them to assert the new outcome, not merely green):**
P5b-2 (`SHARE 2025` → `SHARE 2026`; `col-ros` per T14), P5b-4 (bench column counts without pick rows —
pick rows are counted in `bench-picks` instead), Fixture M 7 and the `picks on the bench` describe (query
`bench-picks`), Fixture M 15 / Fixture C 15 (collapse counts players only), Fixture S 14 (T13),
`TeamOffences.test.jsx` call sites (`dataSeason=` → `season=`); Slice D "the Bench GAME SCRIPT of a
draft-pick row stays a literal —" (~L996) → asserts the pick row is inside `bench-picks` and has no
`col-script` cell; T20 frozen columns (~L1218) → `bench-pick-` rows counted in `bench-picks` (≥1), their
`col-player` sticky `left-0`; the bench's own sticky `col-player` count becomes ≥1 (the fixture's one bench player, b1; the second was the pick row);
`picks on the bench` "unpriced round" (~L126) reads `col-ktc` inside `bench-picks`. Grep `bench-pick-`, `username`,
`dataSeason=` and `30%` in the three portfolio test files before editing.

## 5. Copied definitions

None created. Imported: `buildWindowStats`, `seasonsWithoutWeekTeams`, `buildAvailabilityGrid`,
`OUT_STATUSES` (moved; T23). `ppgOf` hoisted. The pre-existing inline so-far PPG (~L405) stays.

## 6. Docs

- `docs/ui.md` → *My Team*: header paragraph (meta = team name; in-season summary sentence wording and
  no verdict clause; out-of-season unchanged), Starting-ten usage paragraph (~L88–101: in-season
  GAMES/SHARE/SNAP live + grey prior, games-played share as on Market, unsplit caption; out-of-season
  season-total share unchanged), ROS cell popover, ladders and weakest-slots in-season columns,
  TeamOffences live season + fallback caption + QB, bench (picks block, unavailable sort). Leave the stale
  surfaces table and rail groups alone.
- `docs/nav/components.md` rows: `Portfolio.jsx` (props: `username` removed, `onNeedGameLogSeason`
  added; usage sources by phase; offences season; bench/picks), `TeamOffences.jsx` (props),
  `LeagueLadders.jsx`, `WeakestSlots.jsx`.
- `docs/nav/utils.md`: new `portfolioUsage.js` row; `lineup.js` row (`live*` ladder fields,
  `attachLiveSlotComparison`); `injuryStatus.js` (`OUT_STATUSES`); `weeklyOwnProjection.js` (re-export).
- `CLAUDE.md` → *State and data flow* `dataSeason` paragraph: append one sentence — "`teamContextByYear`
  and `nflScheduleByYear` also carry `dataSeason + 1`, the live season, for My Team's offences and SOS;
  `gameLogsByYear` widens per season on demand." (CLAUDE.md is 19,885 B; ceiling 25,000.)
- `docs/architecture.md` State table (~L74–76): `teamContextByYear` row adds the `dataSeason + 1` effect;
  `gameLogsByYear`/`nflScheduleByYear` rows add My Team to `useGameLogSeasonLoader`'s callers.
- Mechanism wording only (docsAvailabilityClaims rule): state what is read and what renders on
  `complete: false`, never whether a 2026 file exists today.
- PROVISIONAL inventory: one new render-site tag in Portfolio.jsx (§3.3 legend); the derivation tag is
  Market's existing `makeWeekTeam` one. Paste `grep -rn "PROVISIONAL(" src/` into the hand-back.

## 7. Smoke (Session 2)

Start the app from `.claude/launch.json` (preview_start), never a backgrounded `npm run dev`. Stop it after.
1. Before any edit: `/#/portfolio` at 1440×900 and 375px (`preset: mobile`, reload) — screenshot header,
   Starting ten (Usage), ladders + weakest, offences, bench.
2. After: same screens at 1440×900 **and** 375px. Report what you saw for each:
   - Header: meta starts with the team name; sentence "Your starting ten is scoring … in 2026 so far", a
     ROS clause, "So far by position: …", no "weak spot"/"carries".
   - Starting ten (Usage view): `GAMES/SHARE/SNAP 2026`; 2026 value over grey `2025 …`; no `NaN`; QB snap
     `—`; ROS one number, popover shows the %.
   - Legend wording; "not split" clause gone once `nflverse/gamelogs/2026.json` loads
     (`read_network_requests`; also `nflverse/teamcontext/2026.json`).
   - Ladders `2026 · SO FAR` left of `ROS`; weakest slots two labelled lines, name column intact at 375px.
   - Offences subtitle `2026 season so far`, 2026 QBs. Bench: no picks, injured last; Draft picks block.
3. `read_console_messages`: no new errors. Off-season is covered by T15 — do not alter nflState live.
Reset `resize_window` to `desktop` when done.

## 8. Session 2 handoff

Run on **sonnet** (medium). Implement exactly §3; stop and report on any unanswered design question.
Done-definition per `CLAUDE.md` (lint 0, clean build, smoke §7, commit before hand-back).

For each test in the task file, check every assertion it names is actually made.
For each new or changed test, apply the task file's named red-step mutation, show the test fail on it, then revert.

Hand-back per `../CLAUDE.md` Session 2, plus the `PROVISIONAL(` grep and smoke screenshots.

## 9. Open items (for Anton, not blocking)

1. SHARE is season-total out of season (and in the pop-up), games-played in season — the same 2025
   number can differ by month. Recommend a follow-up moving both to games-played.
2. The out-of-season sentence keeps its "carries it / weak spot" clause (brief's "unchanged" test).

## 10. Later slices (outline only — not planned)

- **M2 — §6.** Offences you own merges into `TeamOffences` (every metric of both, live, ranked); Defences
  you face becomes "Defences ahead" (this week + ROS schedule per starter); both leave /week in the same
  change; `useWeeklyDecision.liveTeamContext` is deleted for `teamContextByYear[liveSeason]` (D3). Needs M1.
- **M3 — §5 visuals.** `dp/WeeklyStrip.jsx` per row, shared `PlayerCell`, palette via App `percentileBasis`.
  Needs M1's layout; plan after M2 (same file).

## Fix pass 1

From implementation-reviewer (full) on `0ba520d..71b7694`; Anton approved 2026-11-20 ("Yes, fix pass 1").
Fixes flags 1, 2, 3, 5, 6, 7. Flag 4 (in-season weakest-slots layout at 375px never seen live) is
accepted: Anton checks it by eye at sign-off. Touch only what is named below; leave everything else alone,
including the `shareLogs` gate itself.

1. **Unsplit caption follows `shareLogs`** (flag 1). `Portfolio.jsx:529`: pass `shareLogs` instead of
   `gameLogsByYear` to `seasonsWithoutWeekTeams([phaseLiveSeason, dataSeason], …)` — Market's precedent
   (`Market.jsx` ~L318). While live logs are pending the legend then names both seasons, matching what the
   shares were computed with. Test: extend T4 — with `gameLogsByYear={ 2025: { complete: true, players: {} } }`
   (2026 absent), the legend contains `not split for 2026, 2025`. Fails if the caption reads raw
   `gameLogsByYear` (it would say `not split for 2026`). Red step: revert to `gameLogsByYear`.
2. **docs/ui.md:100** (flag 2): `` `ROS` (scored projection · this season's weight) `` →
   `` `ROS` (scored projection; this season's weight in a popover on the value) ``. No other docs change.
3. **Bench collapse counts players only** (flag 3). `Portfolio.test.jsx` 'Fixture C' test 15: give My Team
   at least one priced pick, reusing the 'picks on the bench' describe's pick props (`tradedPicks`,
   `ktcPickTable`, `firstLiveDraftSeason`, `draftRounds`, rosterId 1 = 'My Team'; hoist those constants to
   module scope in the test file if they are describe-local, unchanged). Assert, besides today's
   assertions: toggle still reads `show all 11 →`, `bench` has 10 then 11 rows, `bench-picks` exists.
   Fails if picks enter the bench count. Red step: in the toggle text use `benchRows.length + pickRows.length`.
4. **T11 red step re-run** (flag 5). Apply the mutation that matches T11's claimed defect: move the
   `pickRows` memo above `benchRows` and append `...pickRows` to `benchRows`' result. Show the
   `no bench-pick- row inside bench` assertion fail, then revert. No source change kept; if T11 stays green,
   strengthen its assertion until it reds, and report.
5. **So-far diff colour** (flag 6). `WeakestSlots.test.jsx` 'a negative so-far gap reads − and amber; live:
   null reads —' and the +2.0 case: assert the so-far diff element has `text-dp-down-text` on the negative
   row and `text-dp-up-text` on the +2.0 row. Fails if the colour rule is dropped or inverted. Red step:
   swap the two classes in `WeakestSlots.jsx`.
6. **RosCell keyboard** (flag 7). `Portfolio.test.jsx`, next to T14: on row 3's ROS popover trigger,
   `fireEvent.keyDown(trigger, { key: 'Enter' })` does not call the `onOpenPlayerDetail` spy; after opening
   the popover, `fireEvent.keyDown(document, { key: 'Escape' })` closes it (gloss text gone). If jsdom
   cannot exercise DefinitionPopover's Escape path, assert the Enter half only and report. Red steps:
   (a) remove `onKeyDown={stopActivate}` → spy called; (b) replace `stopActivate` with `stop` → Escape
   half fails (only if that half is asserted).

Done-definition applies (`npm test`, lint 0, clean build). No smoke needed (one legend clause + tests).
Commit as one commit on `main`, not pushed. Hand back: SHA, files, each test's red result, deviations.

## Verification

Verified 2026-11-20 by Session 1 (opus) on `0ba520d..9d425de` (two commits, `71b7694` + fix pass
`9d425de`, unpushed).

- **Review:** implementation-reviewer, depth full, round 1 — 7 low flags. Fix pass 1 fixed flags 1, 2,
  3, 5, 6, 7; flag 4 accepted (in-season weakest-slots layout at 375px not seen live — Anton checks it).
  Fix-pass re-review (light, `71b7694..9d425de`): no remaining flags; deviations (Escape fired on the
  trigger; T11 strengthened with a zero-`col-player` assertion; fix-pass text in the code commit) judged
  acceptable.
- **Diff read by Session 1:** 26 files, all inside §3/§4/§6's touch list; App.jsx effect and the
  `<Portfolio>` props match §3.7; no write to `playerRows`, projection, scoring, snapshot or registry.
- **Checks (re-run by Session 1 at `9d425de`):** `npm test` 192 files / 3686 tests passed · `npm run
  lint` 0 problems · `npm run build` clean apart from the pre-existing chunk-size notice.
- **Tests:** T1–T25 plus fix-pass T4 extension, Fixture C 15, T11 strengthening, WeakestSlots colour,
  T14k — each reported red by Session 2 / fix-applier on its named (or declared substitute) mutation,
  then restored. Substitutes declared: T1b, T3b, T11, T15 (Session 2); T14k Escape (fix-applier).
- **Smoke (Session 2, in season week 11, 1440×900 and 375px):** header, usage columns, ROS popover,
  ladders, offences, bench/picks as specified; no console errors. Weakest slots had no rows in this league.
  No 375px "before" screenshot.
- **Deviations:** listed above; `shareLogs` settle gate added by Session 2 (Market precedent).
  PROVISIONAL inventory 42 → 43 (`Portfolio.jsx` render-site tag). No scoring / snapshot / cross-repo
  index touch; no backlog line.

Signed off by Anton 2026-11-20
