# /week lineup cleanup (in-season notes P3)

Source: `future_plans/in-season-notes-plan.md` → P3. Planned 2026-10-02 against app **`eac0b5b`**
(P2 `defence-numbers-rebuild` implemented and verified on `main`, **unpushed** pending sign-off —
this slice builds on it). If P2 is amended before Session 2 starts, re-check every line anchor
below against the new HEAD before writing code.

View-only. Nothing here may reach `projectedPPG`, the dynasty score, or any `factors` entry.

## 0. Goal and fixed decisions — do not reopen

Six changes to `/week`'s lineup table and weight panel:

1. **Player rows open the player pop-up** (`openPlayerDetail(id)`), mouse and keyboard, via the
   existing `ClickableRow` (`src/components/dp/cells.jsx:41`). Empty starter slots stay inert.
2. **Usage cells show count plus share** — `22 · 37%`. The count is the share's own numerator over
   the same played-weeks window (carries, targets, carries + receptions, offensive snaps). Totals,
   not per-game: the count and the share must describe the same thing.
3. **Two red-zone columns, RZ RUSH and RZ TGT**, count plus share, same window and the same
   per-week team resolution as the other usage cells. Denominators: team `rush_rz_att` and team
   `pass_rz_att` from that week's `TEAM_<abbr>` row — `pass_rz_att` (not `rec_rz_tgt`) so RZ TGT
   matches TARGET's existing "targets ÷ team pass attempts" definition. Position gating copies
   RUSH/TARGET: RZ RUSH null for WR/TE, RZ TGT null for QB.
4. **The SNAP grey sub-line carries its season**: `2025 · 61%`.
5. **The depth-chart sub-label (`QB1`, `WR1`) is replaced** by
   `{lastSeason} {POS}{rank} · {thisSeason} {POS}{rank} · #{overall} overall`, every rank by
   **total points in league scoring** (Anton's spec; matches Sleeper's own convention). Overall is
   among QB/RB/WR/TE only. A segment with no value is omitted, never `—`; with no segments at all
   the line shows the bare position. A small `BACKUP` chip shows when
   `playerMap[id].depth_chart_order >= 2`; its `title` keeps the raw depth entry
   (`Depth chart: LWR2` — live WR entries are `LWR`/`RWR`/`SWR`) so the data is not lost.
6. **WeightPanel**: drop the three display-only rows (EPA, rates, pace — nothing computes them) and
   replace the false sentence. The blend shrinks toward the **same defence's** last season, not
   toward the league average.

Out of scope (decided): the opponent W-L record on the VS cell — P2 left a
`PROVISIONAL(no-data)` tag at `LineupTable.jsx:136-137` calling it "P3's call". Not wired here
(Defences you face already shows it); the tag stays, its fix clause is reworded in place (§6.1).

**Line-anchor constraint (avoids a mirrored-registry edit and a data sync while P2's D-57 is still
owed).** `docs/cross-repo-registry.md` cites `src/utils/weeklyUsage.js:135,138,139,141` (CR-11) and
`src/utils/weeklyLineup.js:29` (CR-16). This slice must not move those lines:
- `weeklyUsage.js`: **append-only** after the current last line (143). Lines 1–143 unchanged.
- `weeklyLineup.js`: **no new imports, no added or removed lines above line 31**; the only edits
  above line 31 are the in-place rewrites of lines 14 and 16 in §3.
- `src/App.jsx`: line count unchanged (§6.3 — CR-01 cites `:1407`).

## 1. Findings against live source (2026-10-02)

- **Live payload has the RZ keys.** `api.sleeper.com/stats/nfl/2026/{1,2,3}`: player rows carry
  `rush_rz_att`, `rec_rz_tgt`, `pass_rz_att`; `TEAM_*` rows carry the same three plus
  `rz_att`/`rz_conv`/`rz_pct`. For all 32 teams in each of weeks 1–3, the team row's
  `rush_rz_att`/`rec_rz_tgt` equal the sum over that team's `gp === 1` player rows exactly. A team
  row **omits** a key when it is zero (weeks 1–3: 3/5/3 teams had no `rush_rz_att`), and so do
  player rows — absent means 0, the same zero-omission rule `weeklyUsage.js`'s header documents for
  `off_snp`.
- **`careerStats` never holds the live season** (`docs/architecture.md` → `currentSeasonTotals`),
  so `deriveDataSeason(careerStats)` is last season (2025 now). `careerStats[s][id].fantasyPoints`
  is league-rescored (`rescoreSeasonTotals`).
- **My Team ranks by PPG, not total** — `seasonRanks.js`'s `rankPositionSeason` (used by
  `Portfolio.jsx:295`). /week will rank by total, so the same player can read `WR12` on My
  Team and `2025 WR14` here. The footnote states the basis (§4.3); reported to Anton (§11).
- **`rankPositionSeason` cannot be reused**: PPG basis, no ties, no overall rank.
- **`openPlayerDetail` is ready**: `App.jsx:139`, passed to Portfolio/Market already; the pop-up
  tolerates any player id (`PlayerDetailTabs.jsx:97`).
- **`SIGNAL_FAMILIES`' `dropWeek` field exists only for the three rows being removed**
  (`grep dropWeek src docs` hits only `blendWeights.js`, its test, `WeightPanel.jsx` and two nav rows).
- **Stale nav prose**: `docs/nav/components.md:10` still says "`role` has no source in this slice
  and renders nothing" — wrong since W2a; replaced in §8.
- **Pre-existing stale registry anchor, not this slice's:** CR-10's
  `src/hooks/useWeeklyDecision.js:254` (`loadTeamContext`) is now `:204` after P2. Reported (§11),
  not fixed — it needs a mirrored edit.

## 2. `src/utils/weeklyUsage.js` — append after line 143 only

Append one section with its own header comment (RZ basis, the zero-omission rule for RZ keys on
both player and `TEAM_*` rows, why the team row is read directly rather than through
`buildTeamAggregates` — the anchor constraint in §0). Three exports:

### 2.1 `accumulateRedZone(weeklyMaps, playerId)`
→ `{ played, rzRush, rzTgt, teamRzRush, teamRzPass }`. Same loop contract as `accumulateUsage`:
skip a week unless `rows[playerId].stats.gp === 1`; the player's team for week w is **that week's
row's** `team` (no team parameter — a traded player divides each week by the team he played for);
team stats are `wk.rows?.['TEAM_' + row.team]?.stats`. Sum `stats.rush_rz_att ?? 0`,
`stats.rec_rz_tgt ?? 0`, `teamStats?.rush_rz_att ?? 0`, `teamStats?.pass_rz_att ?? 0`.
`played` true once any week counts.

### 2.2 `computeRedZoneShares(totals, position)`
→ `{ rzRush, rzTarget }`. `rzRush` null for WR/TE, else `rzRush / teamRzRush` when played and
`teamRzRush > 0`, else null. `rzTarget` null for QB, else `rzTgt / teamRzPass` under the same rule.
(A team with zero red-zone attempts gives a null share beside a real count of 0 — `0 · —`.)

### 2.3 `computeUsageCounts(usageTotals, rzTotals, position)`
→ `{ rush, target, touch, snap, rzRush, rzTarget }`, integer counts or null.
- `usageTotals` is `accumulateUsage`'s output, unchanged.
- `rush` = `usageTotals.rushAtt` (null for WR/TE), `target` = `usageTotals.recTgt` (null for QB),
  `touch` = `rushAtt + rec`, all null when `!usageTotals.played`.
- `snap` = `usageTotals.offSnp` when `snapObservations > 0`, else null — the same null-vs-zero rule
  as `computeUsageShares` (an active player with zero snaps is `0`, not null).
- `rzRush` = `rzTotals.rzRush` (null for WR/TE), `rzTarget` = `rzTotals.rzTgt` (null for QB), both
  null when `!rzTotals.played`.

Gating is position-first, then played — so the count and its share are null together everywhere
except a zero denominator.

## 3. `src/utils/weeklyLineup.js`

- **Line 14 in place**: remove `role: null, ` from the line (it becomes
  `    slot, player_id: null, name: null, position: null, team: null,`).
- **Line 16 in place**: becomes
  `    weight: null, usage: null, form: [null, null, null], points: null, counts: null, ranks: null, depth: null, backup: false,`.
- `buildRow` gains `countsByPlayer, ranksByPlayer` in its destructured params. Replace the `role`
  block (`:87-90`) with:
  ```js
  const pmEntry = playerMap?.[id]
  const depth = pmEntry?.depth_chart_position && pmEntry?.depth_chart_order != null
    ? { position: pmEntry.depth_chart_position, order: pmEntry.depth_chart_order }
    : null
  const backup = depth != null && depth.order >= 2
  ```
  Return `counts: countsByPlayer?.[id] ?? null`, `ranks: ranksByPlayer?.[id] ?? null`, `depth`,
  `backup` in place of `role`.
- `buildWeeklyLineup` accepts `countsByPlayer`, `ranksByPlayer` and threads them through `rowArgs`.
- Update the header comment's last line to say the row carries the raw depth entry and a
  `backup` flag; no new comment lines above line 31.

## 4. New `src/utils/weeklyRanks.js`

Pure, no React, no I/O. Header: why total (not PPG, unlike `seasonRanks.js`), the overall
population, competition ranking, why the live season comes from Sleeper weekly rows (no data-store
dependency, like the rest of the lineup table).

```js
import { calculateFantasyPoints } from './fantasyPoints'
import { deriveDataSeason } from './environment'

export const OVERALL_POSITIONS = ['QB', 'RB', 'WR', 'TE']
```

### 4.1 `rankByTotalPoints(pointsById, playerMap)`
→ `Map<id, { posRank, overallRank }>`. Input `{ [id]: number }`; entries with non-finite points or
no `playerMap[id].position` are skipped. `posRank` ranks within `playerMap[id].position`;
`overallRank` ranks among `OVERALL_POSITIONS` and is null for any other position. Both descending
by points with **competition ranking** (equal points share a rank; the next rank skips — 1, 2, 2, 4).

**Population note (put in the module header).** Last season's population is whatever
`careerStats[dataSeason]` holds: every served row on the data-store path, but only `activePlayerIds`
(Active/IR/FA or rostered — `App.jsx:1022-1026`, filtered at `sleeperStats.js:247`) on the
live-API fallback. This season's population is every `gp === 1` weekly row, never filtered. On the
fallback path the two ranks therefore use different populations — accepted (the fallback is the
degraded mode, and My Team's rank already shares that population), stated, not corrected.

### 4.2 Season points
- `seasonPointsFromCareer(seasonRows)` → `{ [id]: fantasyPoints }` for rows with
  `gamesPlayed > 0` and finite `fantasyPoints`. `seasonRows` null → `{}`.
- `seasonPointsFromWeekly(playedWeeklyMaps, scoringSettings)` → sums
  `calculateFantasyPoints(row.stats, scoringSettings ?? {})` over every row with
  `row.stats.gp === 1`, across all weeks (all players in the payload, not just the roster). Keys
  starting `TEAM_` are skipped explicitly.

### 4.3 `buildLineupRanks({ rendered, careerStats, playedWeeklyMaps, playerMap, scoringSettings })`
→ `{ [id]: { lastPos, thisPos, thisOverall } }` for each rendered player's id; each field a number
or null. Last season is `careerStats[deriveDataSeason(careerStats)]`, derived **inside** (the
`buildPriorSnapByPlayer` rule — never `season - 1`, never a caller-supplied year, so the rank and
the SNAP sub-line always describe the same year). This season is
`seasonPointsFromWeekly(playedWeeklyMaps, …)`. A player who has not played this season has
`thisPos`/`thisOverall` null; with zero played weeks every this-season rank is null.

## 5. `src/hooks/useWeeklyDecision.js`

- Import `accumulateRedZone, computeRedZoneShares, computeUsageCounts` (extend the existing
  `weeklyUsage` import) and `buildLineupRanks` from `../utils/weeklyRanks`.
- In the usage/form memo (`:262-274`): per rendered player, also
  `const rz = accumulateRedZone(playedWeeklyMaps, id)`; set
  `usage[id] = { ...computeUsageShares(totals, p.position), ...computeRedZoneShares(rz, p.position) }`
  and `counts[id] = computeUsageCounts(totals, rz, p.position)`. Return `countsByPlayer` alongside.
- New memo: `const ranksByPlayer = useMemo(() => buildLineupRanks({ rendered, careerStats,
  playedWeeklyMaps, playerMap, scoringSettings }), [rendered, careerStats, playedWeeklyMaps,
  playerMap, scoringSettings])`.
- Pass `countsByPlayer`, `ranksByPlayer` into `buildWeeklyLineup` (add both to its dep array).
- Return value: unchanged except nothing new is required — rows carry counts and ranks. `dataSeason`
  is already returned.
- Header-comment touch: one clause noting usage now carries counts and red-zone usage, and the rows
  carry season ranks.

## 6. Components

### 6.1 `src/components/week/LineupTable.jsx`

- New props: `onOpenPlayerDetail = () => {}`, `lastSeason = null`, `thisSeason = null`.
- **Rows.** `LineupRow` renders `<ClickableRow row={r} onOpen={onOpenPlayerDetail}>` (import from
  `'../dp/cells'`) when `r.player_id != null`; an empty slot keeps the plain
  `<tr className="border-t border-dp-border-row">`. Cell content is identical in both branches.
- **Player sub-label** (replaces `:121-124`): a `title` attribute
  `"Rank by total points in this league's scoring; overall is among QB, RB, WR and TE"` on the line;
  text from a local `rankLine(r, lastSeason, thisSeason)` — `r.ranks` may be `null` (§3), so every
  read is `r.ranks?.…`:
  segments `${lastSeason} ${r.position}${r.ranks?.lastPos}` (when `r.ranks?.lastPos` and `lastSeason` are
  non-null), `${thisSeason} ${r.position}${r.ranks?.thisPos}` (same rule), `#${r.ranks?.thisOverall} overall`
  (when non-null), joined with ` · `; no segments → `r.position`. Then, when `r.backup`, a chip:
  `<span data-testid="backup-flag" title={`Depth chart: ${r.depth.position}${r.depth.order}`}
  className="ml-1.5 font-dp-mono text-[9px] tracking-[0.08em] text-dp-muted border border-dp-border-raised rounded px-1">BACKUP</span>`.
- **Usage cells.** Replace `ShareCell` with `UsageCell({ count, share, priorShare = null, priorSeason = null })`.
  Main line: both null → `—` (muted); otherwise `${count ?? '—'} · ${pctText(share)}`. Sub-line
  (SNAP only, `data-testid="prior-share"`, rendered only when `priorShare != null`):
  `${priorSeason} · ${pctText(priorShare)}` when `priorSeason != null`, else `pctText(priorShare)`.
  Keep the §1a comment block above it, updated for the season label.
- **Columns, in order**: RUSH, TARGET, TOUCH, RZ RUSH, RZ TGT, SNAP — reading `r.counts?.<k>` and
  `r.usage?.<k>` with keys `rush`, `target`, `touch`, `rzRush`, `rzTarget`, `snap`. SNAP passes
  `priorShare={priorSnapByPlayer?.[r.player_id] ?? null}` and `priorSeason={lastSeason}`.
- **Header**: group label `USAGE — COUNT · SHARE OF HIS OFFENCE`, `colSpan={6}`; new `<th>`s
  `RZ RUSH`, `RZ TGT` (same classes as `TOUCH`, `whitespace-nowrap`). The BENCH divider's
  `colSpan` becomes **12** (the table now has 12 columns; the current `11` is already one too many).
- **Footer usage paragraph**, replacing `:237-243`'s span text:
  > Each usage cell is a count over the weeks he played, then its share. RUSH is carries ÷ team rush
  > attempts, TARGET is targets ÷ team pass attempts, TOUCH is (carries + receptions) ÷ (team rush +
  > pass attempts) — attempts, not plays: they exclude sacks and include kneels. RZ RUSH and RZ TGT
  > are the same inside the opponent&rsquo;s 20: red-zone carries ÷ team red-zone rush attempts,
  > red-zone targets ÷ team red-zone pass attempts. SNAP is `off_snp` ÷ that player&rsquo;s own
  > `tm_off_snp`; the grey line beneath is {lastSeason ?? 'last season'}. All live and weekly from the
  > Sleeper stats endpoint.

  (keep the existing `font-dp-mono text-dp-text-4` spans on the two key names). Add a third footer
  span (same classes):
  > Under each name: position rank last season and this season, and overall rank this season among
  > QB, RB, WR and TE — all by total points in this league&rsquo;s scoring (My Team&rsquo;s RANK
  > uses points per game). BACKUP marks a player listed second or lower on his NFL depth chart.
- Header comment `:1-9`: replace the `role` sentence with the rank line + backup flag; mention the
  rows open the pop-up.
- Leave the ALLOWS cell, form bars and PROJ cell untouched. **Rewrite the `:136-137`
  `PROVISIONAL(no-data)` comment in place** — same category, same two lines, same position — so its
  fix clause no longer says "P3's call": `// PROVISIONAL(no-data): opponent W-L record · not rendered on
  this row · buildTeamRecords` / `// (weeklySchedule.js) supplies it; Defences you face renders it for starters — wire here if wanted`.

### 6.2 `src/components/week/WeekView.jsx`

- New prop `onOpenPlayerDetail = () => {}`. Destructure `dataSeason` from the hook.
- `<LineupTable … onOpenPlayerDetail={onOpenPlayerDetail} lastSeason={dataSeason} thisSeason={season} />`.
- `<WeightPanel weights={weights} n={n} season={season} priorSeason={priorSeason} />` —
  `priorSeason` is the hook's (the FPA blend's actual prior: `defenceAllowed.prior.season ?? dataSeason`).
- Failed-weeks banner (`:133`): `missing from usage and form below` → `missing from usage, ranks
  and form below`.

### 6.3 `src/App.jsx`

Append ` onOpenPlayerDetail={openPlayerDetail}` to the **end of the existing line 1403**
(`nflScheduleByYear={nflScheduleByYear}` → `nflScheduleByYear={nflScheduleByYear} onOpenPlayerDetail={openPlayerDetail}`).
**No line is added** — CR-01 cites `src/App.jsx:…,1382,1407` (`docs/cross-repo-registry.md:52`), so a
new line here would shift a registry anchor. Done-check: `wc -l src/App.jsx` unchanged from `eac0b5b`.

### 6.4 `src/utils/blendWeights.js` and `src/components/week/WeightPanel.jsx`

- `SIGNAL_FAMILIES` becomes the single `fpa` row, and the `dropWeek` field goes from the shape
  entirely (`{ key, label, k, dropGames }`); `buildWeightPanel` stops copying it. Rewrite the header
  comment: one family, `k`/`dropGames` still imported (never literals), and a line saying the
  EPA/rates/pace rows were removed because nothing computes them — re-add a row only alongside the
  code that blends it.
- `WeightPanel`: new prop `priorSeason = null`. `thresholdText` → `k ${w.k} · all ${w.dropGames} gm`
  when `dropGames != null`, else `k ${w.k}`. Replace the footer sentence with, when the `fpa` row
  exists (`weights.find(w => w.key === 'fpa')`):
  > Each defence&rsquo;s {season} points allowed per game are blended with its own
  > {priorSeason ?? 'last season'} rate, which counts as {k} games. From {dropGames} games played,
  > {season} stands alone.

  `k`/`dropGames` read from that row, never written as literals. No `fpa` row → no footer. Update
  the header comment (`:1-6`) accordingly.

## 7. Tests

New or changed assertions; every one must fail against `eac0b5b`'s behaviour where it describes
new behaviour.

- **`weeklyUsage.test.js`** (append): `accumulateRedZone` — sums two played weeks; skips a
  `gp !== 1` week; a traded player divides week 1 by `TEAM_A` and week 2 by `TEAM_B` (fixture where
  a fixed team would give a different share); absent player and team RZ keys add 0.
  `computeRedZoneShares` — WR `rzRush` null, QB `rzTarget` null, zero team denominator → null,
  not played → null. `computeUsageCounts` — counts equal the totals; position gating; `snap` is `0`
  for played-with-`tm_off_snp`-but-no-`off_snp`, null with no `tm_off_snp` week; not played → all null.
- **New `weeklyRanks.test.js`**: competition ties (`[30, 20, 20, 10]` → 1, 2, 2, 4); posRank within
  position vs overallRank across positions; `K`/`DEF` get a posRank and `overallRank: null`; ids
  absent from `playerMap` skipped; `seasonPointsFromCareer` drops `gamesPlayed: 0`;
  `seasonPointsFromWeekly` counts only `gp === 1` rows, skips `TEAM_*`, scores with the passed
  settings (a fixture where half-PPR and PPR order two players differently);
  `buildLineupRanks` reads `careerStats[max season]` — fixture with seasons 2023 and 2025 (no
  2024), asserts 2025's rank is used; zero played weeks → `thisPos`/`thisOverall` null.
- **`weeklyLineup.test.js`**: a row carries `counts`/`ranks` from the maps; `playerMap` entry
  `{ depth_chart_position: 'LWR', depth_chart_order: 2 }` (the live WR shape — `LWR`/`RWR`/`SWR`, see
  `Portfolio.test.jsx:211`) → `depth: { position: 'LWR', order: 2 }, backup: true`; order 1 → false; no depth fields → `depth: null,
  backup: false`; no row carries `role`; the empty row has `counts: null, ranks: null, depth: null,
  backup: false`.
- **`LineupTable.test.jsx`**: update both fixtures (`role` → the new fields). Click on a player
  row and `Enter` on it call `onOpenPlayerDetail` with its `player_id`; an empty slot row has no
  `role="button"` and clicking it calls nothing. A RUSH cell renders `22 · 37%`; a WR's RUSH renders
  `—`; `count: 0, share: null` renders `0 · —`. RZ RUSH and RZ TGT headers exist; every player row and every empty-slot row (not the BENCH
  divider, which is one `colSpan` cell) has exactly as many `<td>` as the second header row has
  `<th>` (12), and the BENCH divider's `colSpan` is 12. SNAP sub-line renders `2025 · 42%`
  with `lastSeason={2025}` (replaces the bare `42%` assertion). Rank line: all three segments →
  `2025 WR14 · 2026 WR8 · #31 overall`; only `lastPos` → `2025 WR14`; `ranks: null` (not an object of nulls) → `WR`;
  with `depth: { position: 'LWR', order: 2 }` the string `LWR2` appears in no element's text content.
  `backup: true` renders `[data-testid="backup-flag"]` whose `title` is `Depth chart: LWR2`; `backup: false` renders none.
- **`WeightPanel.test.jsx`**: exactly one row (`Points allowed by position`); text contains no
  `league average`, `Pace` or `EPA`; the footer names `priorSeason` and the row's `k`/`dropGames`
  (assert against `buildWeightPanel(3)[0]`'s values, not literals).
- **`blendWeights.test.js`**: `SIGNAL_FAMILIES` has length 1 and its row has no `dropWeek` key; the
  "other three families" test is deleted; `buildWeightPanel` length assertion 4 → 1; the
  every-row-carries test drops `dropWeek`.
- **`src/__tests__/weeklyDecisionViewOnly.test.js`**: add `weeklyRanks` to the PIPELINE import
  guard (regex line + the `it` title).

## 8. Docs (same commit as the code)

- `docs/nav/components.md`: rows `week/WeekView.jsx` (passes `onOpenPlayerDetail`, `lastSeason`/
  `thisSeason`, `priorSeason` to the weight panel), `week/WeightPanel.jsx` (one row, the
  `k`/`dropGames` threshold, the footer sentence), `week/LineupTable.jsx` (clickable rows; count ·
  share; RZ RUSH/RZ TGT; season-labelled SNAP sub-line; rank line + BACKUP chip; **delete** the
  stale "`role` has no source…" sentence).
- `docs/nav/utils.md`: rows `blendWeights.js` (one family, no `dropWeek`), `weeklyUsage.js` (the
  three appended exports), `weeklyLineup.js` (`counts`/`ranks`/`depth`/`backup` on each row), and a
  **new** `weeklyRanks.js` row after `weeklyLineup.js`.
- `docs/navigation.md`: the `/week` row (`:22` — "opponent/ALLOWS/usage/form/PROJ per row" gains
  counts, red-zone usage and season ranks; rows open the pop-up; weight panel is one row) and the
  `useWeeklyDecision.js` row (`:91` — counts, red-zone usage, `buildLineupRanks`).
- `docs/signal-registry.md`:
  - row "Sleeper weekly stat rows (live API, app-fetched)" (`:56`) — Current use: add "red-zone
    carries/targets and their shares (`rush_rz_att`, `rec_rz_tgt` over `TEAM_*` `rush_rz_att`/
    `pass_rz_att`), and this-season position/overall ranks by league-scored total points".
  - row "Depth-chart order" (`:131`) — Current use: add "`/week`'s lineup renders a BACKUP flag at
    `depth_chart_order >= 2` (raw entry in its tooltip)".
  - **new** 3B row: `Season position/overall rank by total league-scored points` · computed factor
    (view-layer) · app: `src/utils/weeklyRanks.js`, from `careerStats[dataSeason]` and the live
    season's Sleeper weekly rows · last season + live season · Reconstructable (pure function of
    season totals and weekly rows) · view-only display (`/week` lineup sub-label); never
    projection/scoring.
- Respect `docsAvailabilityClaims.test.js`: mechanism, never "is populated today".
- No `CLAUDE.md` change (no invariant, command or directory-level change).

## 9. Touch list, done-definition, commit

Source: `src/utils/weeklyUsage.js`, `src/utils/weeklyLineup.js`, `src/utils/weeklyRanks.js` (new),
`src/utils/blendWeights.js`, `src/hooks/useWeeklyDecision.js`,
`src/components/week/{LineupTable,WeekView,WeightPanel}.jsx`, `src/App.jsx`.
Tests: `src/utils/{weeklyUsage,weeklyLineup,weeklyRanks,blendWeights}.test.js`,
`src/components/week/{LineupTable,WeightPanel}.test.jsx`,
`src/__tests__/weeklyDecisionViewOnly.test.js`.
Docs: the four files in §8. **Not touched:** `docs/cross-repo-registry.md`,
`.claude/tasks/data-repo-backlog.md`, `CLAUDE.md`.

Done-definition (CLAUDE.md) plus these slice checks:
1. `git diff -U0 eac0b5b -- src/utils/weeklyUsage.js | grep '^@@'` — every hunk's old-side start
   is ≥ 143 (append-only).
2. `grep -n "normalizeTeamForSchedule(opponent)" src/utils/weeklyLineup.js` → line **29**;
   `grep -n "export function priorSeasonSnapShare" src/utils/weeklyUsage.js` → line **135**.
3. `grep -rn "PROVISIONAL(" src/` — paste into the hand-back; the count is unchanged from
   `eac0b5b` (22 — this slice adds and removes none; one is reworded in place).
   Also report the final line of `loadTeamContext(season)` in `useWeeklyDecision.js` (§11).
4. Smoke (`.claude/launch.json` → `sleeper-dashboard`, `Colts_420_Reloaded` / Dynasty 040), `/week`:
   no console errors; click one starter and one bench row → the pop-up opens on that player, and
   `Enter` on a focused row does the same; the weight panel shows one row and the new sentence; a
   RB's RZ RUSH count equals the sum of his `rush_rz_att` over played weeks from
   `api.sleeper.com/stats/nfl/<season>/<w>` (check one player by hand, report the numbers); the rank
   line and BACKUP chip render without `NaN`/`undefined`; the table scrolls horizontally rather than
   collapsing.

One commit: `/week lineup cleanup: clickable rows, usage counts, red-zone usage, season ranks, weight panel (P3)`.
Push only after Session 1 verification (and after P2 is pushed — this commit sits on top of it).

## Cross-repo impact

Touched contracts: **CR-02, CR-11, CR-16, CR-14, CR-18** — no registry text edit in this slice,
no data-repo action, no backlog entry. One registry addition is owed (CR-02, below) and deferred to
the next registry sync on purpose.

- **CR-02** (season-totals schemaVersion & row composition) — `weeklyRanks.js`'s
  `seasonPointsFromCareer`/`buildLineupRanks` rank the whole `careerStats[dataSeason]` row set
  (rescored `fantasyPoints`, `gamesPlayed`), the same class of cross-row reader CR-02 already lists
  (`buildSeasonPositionRanks`, `rankPositionSeason` over `careerStats[dataSeason]`). **Owed, not done
  here:** add `` `src/utils/weeklyRanks.js` (`seasonPointsFromCareer`/`buildLineupRanks` — whole-season
  ranks over `careerStats[dataSeason]` for `/week`'s rank line) `` to CR-02's App side/Triggers.
  Deferred because the registry is byte-mirrored (CR-24) and P2's D-57 sync is still open and gated
  at an exact line count; folding into it would re-gate an already-verified sync. Record in §11 and
  take it in the next registry pass. Mirror, quoted in full: "A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry. **Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim** (the pop-up's Game log `PTS` and Distribution histogram) and labels them half-PPR from the row's served `scoringBasis`: changing the basis `weeklyPoints` is written on — D-47 included — without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test." Practically for this slice: a dropped or zero-filled scoring key would silently reorder the `/week` last-season ranks too.

- **CR-11** (Snap & red-zone usage stat keys) — `weeklyUsage.js` is a trigger. The new reads
  (`rush_rz_att`, `rec_rz_tgt`, `pass_rz_att`) are of Sleeper's **live weekly endpoint**, not served
  data, and the served-data reads at `:135,138,139,141` do not move (§0). Mirror, quoted: "Do not
  remove, rename or filter these keys. **The projection degrades silently to neutral when they are
  absent** — no error, no test failure, no visible symptom. The blast radius is wider than the
  projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ
  denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and —
  since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the
  data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at
  runtime; this registry entry is the only thing recording it." Nothing new owed.
- **CR-16** (era-accurate team-code remap) — `weeklyLineup.js:29` is a listed call site; it stays
  at `:29` and unchanged. The new RZ join (`'TEAM_' + row.team`) is Sleeper-domain on both sides, no
  remap — the same as `buildTeamAggregates`. Nothing owed.
- **CR-14** (`calculateFantasyPoints` port) — `weeklyRanks.js` becomes a caller; callers are
  explicitly not triggers. Nothing owed.
- **CR-18** (signal registry rows) — `docs/signal-registry.md` changes (§8: two Current-use cells,
  one new 3B row). App-originated, so the data repo owes no row edit; its Mirror is quoted for the
  rule: "When a data-repo change adds, removes or reclassifies an ingested field, stat key or
  source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the
  exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
  reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
  data side in the same change. **Nothing fails in either repo when this drifts** — the registry
  simply becomes wrong, and since it is the inventory that governs snapshot-capture and
  grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
  cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable." (Its
  opening sentences concern the data side's open script set and do not bear on this slice.)

## 10. Risks Session 2 should not "fix"

- Do not route RZ through `buildTeamAggregates` or extend `accumulateUsage` — both move CR-11's
  anchors (§0). The small duplication of the per-week loop is deliberate.
- Do not reuse `rankPositionSeason` (PPG, no ties) or feed `currentSeasonTotals` into the ranks (a
  data-store read; this table must not wait on an ingest job).
- Do not compute ranks over the roster only — the population is every player in the source.
- Do not render `—` for a missing rank segment; omit it.

## 11. Findings for Anton (reported, not acted on)

- Rank basis differs from My Team: /week ranks by total points (your spec), My Team's RANK by
  points per game, so one player can show two different "2025" ranks. The footnote says so; aligning
  My Team is a separate one-line decision.
- The opponent's W-L record could sit under VS on each row (P2 deferred it here); left out because
  Defences you face already shows it for starters. Bench rows don't get it anywhere.
- Registry items for the next sync (none blocks this slice): CR-02 owes the `weeklyRanks.js` addition
  (Cross-repo impact); CR-10's `useWeeklyDecision.js:254` is stale (P2 moved it to `:204`, and this
  slice's new import moves it again — Session 2 reports the final line); the plan gate also found
  pre-existing stale anchors in CR-01 (`App.jsx:699-733,…,1382,1407` → memo now `:705-736`, display
  consumers `:764`, `:1413`, `:1438`) and CR-02 (`sleeperStats.js` `:209/:210/:215/:175` each one
  late → `:208/:209/:214/:174`; `App.jsx` `:219` → `:238`, `:234/:247` → `:253/:266`,
  `:239/:252` → `:258/:271`).

## Review record — plan gate round 1 (2026-10-02)

13 flags; each checked against live source, all applied or recorded.

- **App.jsx line anchor (medium) — applied.** Confirmed CR-01 cites `App.jsx:…,1382,1407`. §6.3 now
  appends the prop to line 1403 instead of adding a line; §0 and the done-checks carry it.
- **CR-02 missing (medium) — applied as a recorded deferral.** Confirmed CR-02 names
  `rankPositionSeason` over `careerStats[dataSeason]`, so `weeklyRanks.js` belongs in its trigger
  list. Not edited here: the registry is byte-mirrored and P2's D-57 sync is still open with an
  exact line-count gate. The owed text is written out in Cross-repo impact; its Mirror is quoted.
- **CR-18 Mirror truncated — applied** (full instruction text quoted).
- **Stale anchors in CR-01/CR-02/CR-10 — recorded** in §11 for the next registry pass, not fixed
  (pre-existing, and fixing them is a mirrored edit).
- **Portfolio anchor `:318-320` → `:295` — applied.**
- **Population difference on the live-API fallback — applied** as an explicit, accepted note in §4.
- **`r.ranks` null-safety and a `ranks: null` test — applied.**
- **Column-count test vs the BENCH divider — applied** (player/empty rows only; divider colSpan
  asserted separately).
- **Live WR depth shape `LWR`/`RWR`/`SWR` — applied** to the examples and fixtures.
- **PROVISIONAL fix clause — applied**: reworded in place, same category and line count.

## Verification record (Session 1, 2026-10-03, `eac0b5b..5139ca4`)

implementation-reviewer on the diff: 3 flags; every §0 anchor constraint, the view-only guard, and
the §8 docs checked out. Triage:

- **Cross-repo obligations live only in an uncommitted file (medium) — fix 1.2.** The owed CR-02
  addition and the §11 stale-anchor list must be committed before push.
- **WeightPanel "exactly one row" asserts the input, not the render (low) — fix 1.1.**
- **No hook-level test of the usage/counts/ranks wiring in `useWeeklyDecision.js:267-317` (low) —
  not fixed.** §7 did not ask for one, each piece is unit-tested, and the smoke test exercised the
  wiring end to end (Hubbard RZ RUSH `5 · 50%` hand-checked against the API; rank lines rendered).
  Recorded here, not owed.

Hand-back fact for §11: `loadTeamContext(season)` is now `src/hooks/useWeeklyDecision.js:209`.

## Fix pass 1

### 1.1 `src/components/week/WeightPanel.test.jsx:24-31`

In the test "renders exactly one row, and no display-only family or league-average claim":
- add `getAllByText` to the destructured render result;
- replace `expect(weights).toHaveLength(1)` (line 26) with
  `expect(getAllByText(/^k \d+/)).toHaveLength(1)` — one rendered threshold cell per rendered row.
  (Against `eac0b5b` this finds 4 and fails; that is the point.)
Change nothing else in the file.

### 1.2 Commit the task file

`git add .claude/tasks/week-lineup-cleanup.md` in the same commit as 1.1, so the Cross-repo
impact section (owed CR-02 addition, quoted Mirrors) and the §11 stale-anchor list are durable.

Done-definition: `npm test`, `npm run lint`, `npm run build` clean. One commit:
`Fix pass 1: /week lineup cleanup — WeightPanel row-count test, task file`. Do not push.
