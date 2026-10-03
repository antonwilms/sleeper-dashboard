# /week own weekly projection — OURS column (P4)

Session 1 (opus) task file, 2026-10-03. Package P4 of `future_plans/in-season-notes-plan.md`, plus that
file's "BACKUP tag noisy for WRs" follow-up, which it says to fold into P4 because both touch
`LineupTable`. Planned against app `819c406` (clean, `main...origin/main`) and data `bf697a5`.
Sonnet implements. **View-only. Nothing here may reach `projectedPPG`, `playerRows`, the dynasty score,
a snapshot or a `factors` entry.**

## 0. Goal and fixed decisions — do not reopen

Add an **OURS** column on This Week, between LAST 3 and Sleeper's PROJ: the engine's displayed season
projection (the rest-of-season posterior once in-season evidence applies) nudged by this week's Vegas
implied team total. Tag it `PROVISIONAL(heuristic)`.

**D1 — the formula is Vegas-only. Anton, 2026-10-03.** The plan text said "adjusted for the opponent
(P2's points allowed), optionally with Vegas". A Session 1 backtest (§1.6) found the opposite of what
that assumed: scaling by the opponent's points allowed at full strength made one-week predictions
*worse* than no adjustment in both 2024 and 2025 (at quarter or half strength it was a wash — slightly
better in 2025, slightly worse in 2024), while Vegas at half weight was best or near-best in both. Anton chose the
Vegas-adjusted version. ALLOWS stays displayed beside it and does not move the number. Do not add a
points-allowed term "because the plan said so".

```
ours = base × (1 + VEGAS_WEIGHT × (implied / baseline − 1))      VEGAS_WEIGHT = 0.5
base     = seasonProjections[id].projectedPPG     (App.jsx's scoredSeasonProjections — the displayed map)
implied  = this week's implied total for the player's team
baseline = mean implied total for that team over REG weeks < currentWeek with a line (≥ 2 required)
```

Other fixed decisions:
- **D2 — omit, don't approximate.** No number unless every input is real: no base → `—`; bye → `—`;
  no line this week → `—`; fewer than 2 earlier lined weeks (weeks 1–2, always) → `—` with the
  implied-total sub-line still shown; Sleeper lists the player `Out`/`IR`/`PUP`/`Sus`/`DNR` → `OUT`.
  Never fall back to the unadjusted base — a column that silently means two things is worse than a blank.
- **D3 — the baseline is the team's own lines, not the league's.** The base already reflects how good
  the player's offence is; dividing by the league-average implied total would count that twice.
- **D4 — `base` is the displayed map.** Pass `scoredSeasonProjections` (not raw `seasonProjections`) so
  OURS starts from the same number My Team and the pop-up show. Its `inSeason` key decides the tooltip
  wording (`Rest-of-season` vs `Season`). Read-only: this slice never writes a `projectedPPG`.
- **D5 — BACKUP for WR/TE.** Keep the chip only while current snap share is under 50%. Sleeper lists
  WRs by side (LWR/RWR/SWR), so a starter can be second at his spot (Tee Higgins RWR2 at 78% snaps).
  A null snap share (no played weeks) falls back to depth alone. QB/RB unchanged.
- **D6 — no registry text edit in this slice.** The registry is byte-mirrored (CR-24) and P2's D-57
  sync is still open, gated at exactly 16 lines. This slice emits its Mirror text (see
  `## Cross-repo impact`) and queues the additions on D-58, as P3 did.

## 1. Findings against live source (2026-10-03)

1.1 **Where the base lives.** `App.jsx:705-707` `scoredSeasonProjections = applyInSeasonProjection(...)`.
For ids with an in-season record, `projectedPPG` is the ROS posterior (`inSeasonScoring.js:309-316`,
rounded to 0.1, carries `inSeason`); every other id keeps its season projection unchanged. It is on
the league's scoring basis (`deriveProjectionBasis` → `'league'` since season-rescore), the same basis
as PROJ. `WeekView` does not receive it today (`App.jsx:1394-1404`). Portfolio and Market already
receive the same map as `seasonProjections`.

1.2 **The schedule's lines.** `nflverse/schedule/2026.json` at data `17c3f65` (2026-10-02): `spreadLine`
and `totalLine` are populated on every REG game for weeks 1–5 and null for weeks 6–18. Even the stale
CDN copy (`5f134ee`, 2026-09-25 — see P8) carries lines for weeks 1–4. So the current week normally has
a line, and future weeks never do. Both fields are in the loader's documented 15-field shape
(`src/api/nflSchedule.js:17-23`).

1.3 **Sign convention, checked.** `spreadLine` is **positive when the home team is favoured**. Over 285
scored 2025 games, sign(`result`) = sign(`spreadLine`) in 187 and the mean of `result − spreadLine` is
+0.6. So implied home = `totalLine/2 + spreadLine/2`, implied away = `totalLine/2 − spreadLine/2`.
Example, 2026 week 5: `TB @ DAL`, spread 9.5, total 47.5 → DAL 28.5, TB 19.0.

1.4 **`nflState` now:** `{ week: 4, season: "2026", season_type: "regular" }`. Week 4 has a line for all
16 games; weeks 1–3 give every team 3 earlier lined weeks (2 on a week-1–3 bye).

1.5 **Live injury values** (Sleeper `/players/nfl`, QB/RB/WR/TE with a team): `null` 692, `IR` 82,
`Out` 25, `Questionable` 20, `PUP` 7, `NA` 2, `DNR` 1. `Sus` and `Doubtful` are also Sleeper values,
absent today. Only Portfolio reads `injury_status` now (`Portfolio.jsx:337`, raw display).

1.6 **The backtest behind D1.** Script, method and full output:
`../analysis/p4-weekly-projection-backtest/` (outside both repos). 2024 and 2025, weeks 5–18,
≈2,170–2,200 QB/RB/WR/TE player-weeks per season, base = season-to-date PPG blended with prior-season
PPG at k = 3 (simpler than the engine). RMSE, all positions:

| adjustment | 2024 | 2025 |
|---|---|---|
| none | 7.063 | 7.115 |
| points-allowed ratio, full | 7.254 | 7.202 |
| points-allowed ratio, ×0.5 | 7.106 | 7.099 |
| Vegas ratio, ×0.5 | **7.031** | 7.073 |
| Vegas ratio, full | 7.064 | 7.116 |
| points allowed ×0.25 + Vegas ×0.5 | 7.051 | **7.067** |

On the subset with a Sleeper projection, MAE base 5.50 / 5.50, Vegas ×0.5 5.48 / 5.45, Sleeper PROJ
5.24 / 5.34. **OURS is not expected to beat PROJ.** The footer says so (§6.3).

1.7 **Constraints from earlier slices.** `weeklyLineup.js:29` is a CR-16 anchor and must not move: no
new imports and no lines added above line 29. `App.jsx`'s line count must not change (CR-01/08/10
anchors). Guard tests that must stay green unchanged: `opponentStrengthViewOnly.test.js` (exactly 3
`defenceAllowed={defenceAllowed}` lines in App.jsx), `inSeasonEvidenceViewOnly.test.js`
(`scoringPosteriors` sites; untouched here), `scheduleViewOnly.test.js`.

## 2. New `src/utils/weeklyOwnProjection.js`

Pure, view-only, no React, no I/O. Imports **exactly** `normalizeTeamForSchedule` from `./nflStats`,
nothing else (a guard test pins this, §7.5). Header comment: what OURS is, D1's formula, D3's baseline
rule, the backtest pointer (`analysis/p4-weekly-projection-backtest/` in the parent folder, 2026-10-03,
with the two-season numbers), and that nothing here may reach `projectedPPG` — the module only reads
`seasonProjections`.

```js
// PROVISIONAL(heuristic): OURS weekly number · the engine's season projection × half the Vegas implied-total swing, not a weekly model · a weekly model fitted and graded against outcomes would make it real
export const VEGAS_WEIGHT = 0.5
export const MIN_VEGAS_BASELINE_WEEKS = 2
export const OUT_STATUSES = ['Out', 'IR', 'PUP', 'Sus', 'DNR']
```
Put the tag line directly above `buildOwnProjections` (the derivation site). The constants' comment
says where 0.5 came from (the coarse grid in §1.6: best or near-best of {0.25, 0.5, 0.75, 1} in both
seasons) and that it is not a fitted value.

### 2.1 `buildImpliedTotals(schedule)`
```
// schedule: a complete-gated loadNflSchedule result, or null (the same input buildRegWeekIndex takes).
// → Map<week:number, Map<eraTeam:string, number>> | null
```
- `null` schedule → `null`.
- Iterate `schedule.games ?? []`, as `buildRegWeekIndex` does (`weeklySchedule.js:14`). For each
  game: skip unless `gameType === 'REG'`; `home = normalizeTeamForSchedule(g.homeTeam)`,
  `away = normalizeTeamForSchedule(g.awayTeam)`, skip if either is falsy; skip unless
  `Number.isFinite(g.spreadLine) && Number.isFinite(g.totalLine)`.
- `home → totalLine/2 + spreadLine/2`, `away → totalLine/2 − spreadLine/2`. Comment the sign
  convention and how it was checked (§1.3) — a sign flip here inverts every adjustment silently.
- Does **not** call `buildRegWeekIndex` (that index has one call site, by design — CR-08 note in
  `useWeeklyDecision.js:245-247`).

### 2.2 `vegasFactor(impliedIndex, team, week)`
```
// team: SLEEPER domain (the row's roster team). Normalised here before lookup, as resolveTeamWeek does.
// → { implied, baseline, baselineWeeks, minBaselineWeeks, factor } | null
```
- `null` when `!impliedIndex`, `!team`, `team === 'FA'`, or this week's implied total for
  `normalizeTeamForSchedule(team)` is not finite.
- `baselineWeeks` = the count of weeks `w < week` whose map has a finite value for that team;
  `baseline` = their mean, or `null` when `baselineWeeks < MIN_VEGAS_BASELINE_WEEKS`.
- `minBaselineWeeks` = `MIN_VEGAS_BASELINE_WEEKS`, carried so the cell's tooltip needn't import the
  module (the §7.5 guard allows only the hook to import it).
- `factor` = `1 + VEGAS_WEIGHT * (implied / baseline - 1)` when `baseline` is non-null and `> 0`,
  else `null`.
- Returns the object (with `factor: null`) when the implied total exists but the baseline doesn't —
  the cell still shows the implied total (§6.2).

### 2.3 `buildOwnProjections({ rows, seasonProjections, impliedIndex, currentWeek, playerMap })`
```
// rows: lineup rows with a player_id (filled starters + bench). → { [player_id]: Own }
// Own = { value: number|null, reason: 'bye'|'out'|'no-base'|'no-line'|'no-baseline'|null,
//         base: number|null, baseKind: 'ros'|'season'|null, status: string|null,
//         vegas: ReturnType<vegasFactor> }
```
Per row (`id = row.player_id`; skip `id == null`), checks in this order, first match wins:
1. `row.bye` → `reason: 'bye'`, `vegas: null`.
2. `status = playerMap?.[id]?.injury_status ?? null`; `OUT_STATUSES.includes(status)` → `reason: 'out'`.
3. `proj = seasonProjections?.[id]`; `base = Number.isFinite(proj?.projectedPPG) ? proj.projectedPPG : null`;
   `baseKind = base == null ? null : (proj.inSeason ? 'ros' : 'season')`. `base == null` → `'no-base'`.
4. `vegas = vegasFactor(impliedIndex, row.team, currentWeek)`; `vegas == null` → `'no-line'`;
   `vegas.factor == null` → `'no-baseline'`.
5. Otherwise `value = base * vegas.factor`, `reason: null` (unrounded; the cell formats it).

Every reason other than `'bye'` still carries whatever `base`/`baseKind`/`status`/`vegas` it computed
(compute `status`, `base` and `vegas` up front, then pick the reason), so the tooltip can state them.
Never mutates `rows` or `seasonProjections`. `Questionable`/`Doubtful`/`NA` are valued normally.

## 3. `src/utils/weeklyLineup.js` — the BACKUP rule (D5)

Nothing above line 76 changes (line 29 is a CR-16 anchor). Directly above `function buildRow`, add:
```js
// week-own-projection.md D5 — Sleeper lists WRs by side (LWR/RWR/SWR), so a WR/TE starter can sit
// second at his spot. For WR/TE the BACKUP chip needs a current snap share under this as well as
// depth order ≥ 2; a null snap share (no played weeks yet) leaves depth alone to decide.
export const BACKUP_SNAP_SHARE = 0.5
```
Replace `const backup = depth != null && depth.order >= 2` (`:91`) with:
```js
  const snap = usageByPlayer?.[id]?.snap ?? null
  const sideListed = enriched.position === 'WR' || enriched.position === 'TE'
  const backup = depth != null && depth.order >= 2
    && !(sideListed && snap != null && snap >= BACKUP_SNAP_SHARE)
```
Update the file's header line 3 only if it describes the backup rule (it says "rows carry the raw
depth entry + `backup`" — leave it). The row shape is unchanged.

## 4. `src/hooks/useWeeklyDecision.js`

- Import `{ buildImpliedTotals, buildOwnProjections }` from `'../utils/weeklyOwnProjection'`.
- New param `seasonProjections = null`, after `priorSchedule = null`.
- After the `scheduleIndex` memo:
  ```js
  // week-own-projection.md §2.1 — implied team totals by week, from the same gated schedule.
  const impliedIndex = useMemo(() => buildImpliedTotals(schedule), [schedule])
  ```
- After the `lineup` memo (before `projectionGap`):
  ```js
  // OURS (week-own-projection.md) — over the rendered rows, empty starter slots excluded.
  const ownByPlayer = useMemo(
    () => buildOwnProjections({
      rows: [...lineup.starters.filter(r => r.player_id != null), ...lineup.bench],
      seasonProjections, impliedIndex, currentWeek, playerMap,
    }),
    [lineup, seasonProjections, impliedIndex, currentWeek, playerMap]
  )
  ```
- Add `ownByPlayer` to the returned object (end of the last line). Don't return `impliedIndex`.
- Extend the header paragraph's last sentence: rows also get an OURS value (`weeklyOwnProjection.js`).

## 5. `WeekView.jsx` and `App.jsx`

**App.jsx — no line-count change.** Line `:1403` becomes exactly:
```jsx
                          nflScheduleByYear={nflScheduleByYear} onOpenPlayerDetail={openPlayerDetail} seasonProjections={scoredSeasonProjections}
```
Touch nothing else in App.jsx. `wc -l src/App.jsx` stays 1514.

**WeekView.jsx:** new prop `seasonProjections = null` (after `onOpenPlayerDetail`), passed to
`useWeeklyDecision`; destructure `ownByPlayer`; pass `ownByPlayer={ownByPlayer}` to `LineupTable`.
Header comment: one clause noting OURS. Nothing else.

## 6. `src/components/week/LineupTable.jsx`

### 6.1 Columns
- New prop `ownByPlayer = {}` (keyed by `player_id`, default `{}`); `rowProps` carries it;
  `LineupRow` passes `own={ownByPlayer?.[r.player_id] ?? null}` to a new `OwnCell`.
- Group header SCORING `colSpan={2}` → `colSpan={3}`. Header row: insert, between LAST 3 and PROJ,
  `<th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted" title="Our number: the season projection nudged by this week's Vegas implied team total. A heuristic, not a model.">OURS</th>`.
- Body cell order: … LAST 3, **OURS**, PROJ. PROJ stays the last `<td>` (existing tests target it).
- BENCH divider `colSpan={12}` → `colSpan={13}`.

### 6.2 `OwnCell({ own, thisSeason })`
Tag at the render site:
`// PROVISIONAL(heuristic): OURS cell · renders weeklyOwnProjection.js's heuristic, not a model verdict · a fitted, graded weekly model would make it real`

`<td className="px-2.5 py-2.5 text-right" title={ownTitle(own, thisSeason)}>` (no `title` when `own`
is null) containing:
- Top line, `font-dp-mono text-[13px]`:
  - `own?.value != null` → `own.value.toFixed(1)`, `text-dp-text-2` (not bold — PROJ keeps the emphasis);
  - `own?.reason === 'out'` → `OUT`, `text-[11px] text-dp-muted`;
  - otherwise `—`, `text-dp-muted`.
- Sub-line (`data-testid="own-implied"`, `font-dp-mono text-[10px] text-dp-muted-2`), only when
  `Number.isFinite(own?.vegas?.implied)`: `imp {implied.toFixed(1)}`, then — when `baseline` is finite —
  ` · +{d}` or ` · −{d}` (U+2212), `d = Math.abs(implied − baseline).toFixed(1)`; `+` when
  `implied ≥ baseline`. A bye row never has one (`vegas: null`).

`ownTitle(own, season)` — local to the component, exact strings (`{x}` → `toFixed(1)` unless noted;
`{season}` is `thisSeason`, the word "this season's" when null):
- `reason === null`: `{Rest-of-season|Season} projection {base} PPG × {factor.toFixed(2)} = {value}. The factor is half the percentage difference between this week's Vegas implied team total ({implied}) and his team's average over {baselineWeeks} earlier {season} games with a line ({baseline}). A heuristic, not a model.` (`Rest-of-season` when `baseKind === 'ros'`.)
- `'no-baseline'`: `Vegas implied team total {implied}, but fewer than {vegas.minBaselineWeeks} earlier {season} games with a line to compare it with — no number.` (from the `Own` object — LineupTable must **not** import `weeklyOwnProjection`).
- `'no-line'`: `No Vegas line for this game in the schedule file — no number.`
- `'no-base'`: `No season projection for this player — no number.`
- `'out'`: `Listed {status} in Sleeper — no number.`
- `'bye'`: `Bye week.`

### 6.3 Footer
- Add a fourth `<span>` with the same classes as the other three, text exactly:
  > OURS is a stand-in, not a model: our season projection (rest of season once this season's games
  > count), moved by half the percentage difference between this week's Vegas implied team total and
  > his team's average implied total in earlier weeks. In a 2024–25 backtest (weeks 5–18) that nudge
  > beat no nudge by under 1%, scaling fully by ALLOWS made it worse (so ALLOWS is shown but not
  > used), and Sleeper's PROJ was 2–4% more accurate. Blank when any input is missing; OUT when
  > Sleeper lists him out.
- Third span's last sentence becomes: `BACKUP marks a player listed second or lower on his NFL depth
  chart — for WR and TE only while his snap share this season is under 50%, since Sleeper lists
  receivers by side.`
- File header comment: add one sentence for OURS and update the BACKUP clause.

## 7. Tests

7.1 **New `src/utils/weeklyOwnProjection.test.js`:**
- `buildImpliedTotals`: `null` → `null`; home favoured (`spreadLine 9.5, totalLine 47.5`) → home 28.5,
  away 19.0; negative spread → away favoured; a game with a null `spreadLine` or `totalLine` is
  skipped; non-REG skipped; a `homeTeam: 'LAR'` game lands under `LA` (`SCHEDULE_TEAM_ALIAS` is
  `{ LAR: 'LA' }`, `nflStats.js:2`).
- `vegasFactor`: `minBaselineWeeks === MIN_VEGAS_BASELINE_WEEKS` on every non-null return; baseline averages only weeks `< week` (a later week's line must not count — put
  one in the fixture); `baselineWeeks < 2` → `factor: null` with `implied` set; arithmetic
  (implied 27, earlier 24 and 24 → `factor` 1.0625); Sleeper `LAR` finds the `LA` entry; `'FA'`,
  `null` team, `null` index, no line this week → `null`.
- `buildOwnProjections`: value = base × factor (e.g. 14.2 × 1.0625); `baseKind` `'ros'` iff the
  projection carries `inSeason`; each reason, including precedence (a bye row whose player is `Out`
  → `'bye'`; an `Out` player with no line → `'out'`); `Questionable` is valued; `'no-baseline'` keeps
  `vegas.implied` and `base`; `player_id: null` rows are skipped; `Object.freeze`d inputs don't throw
  and come back unchanged.

7.2 **`weeklyLineup.test.js`** — extend the backup `describe`: WR `RWR` order 2 with `snap: 0.78` →
`backup: false`; WR order 2 with `snap: 0.3` → `true`; WR order 2 with no usage → `true`; TE order 2
with `snap: 0.6` → `false`; QB order 2 with `snap: 0.9` → `true`; exactly 0.5 → `false`. Plus one
assertion that `BACKUP_SNAP_SHARE === 0.5`. The existing test at `:373` must pass unchanged.

7.3 **`LineupTable.test.jsx`:**
- The column-count test (`:151`): 13 headers, 13 `td` per player/empty row, BENCH divider `colSpan`
  13, and an `OURS` header. Update its title and the `// cells:` comment at `:141` (OURS at index 11,
  PROJ 12). Changed behaviour → the test asserts the new count, not a loosened one.
- New: a row with `own = { value: 14.791666, reason: null, base: 14.2, baseKind: 'ros', vegas: { implied: 26, baseline: 24, baselineWeeks: 3, minBaselineWeeks: 2, factor: 1.0416667 } }`
  renders `14.8`, sub-line `imp 26.0 · +2.0`, and a `title` starting `Rest-of-season projection 14.2 PPG × 1.04 = 14.8`.
  (Fixture values avoid exact two-decimal ties such as 1.0625, whose `toFixed(2)` is engine-sensitive.)
- `reason: 'out', status: 'IR'` → `OUT`, title `Listed IR in Sleeper — no number.`;
  `'no-baseline'` → `—` plus sub-line `imp 27.0` (no delta) and a title containing `fewer than 2 earlier`; `'bye'` → `—`, no sub-line;
  `own` absent → `—`, no `title`; an `implied < baseline` row shows `−` (U+2212).
- PROJ is still the last cell (the existing PROJ tests stay green unedited).

7.4 **`useWeeklyDecision.test.js`** — one hook-level wiring test (the gap P3 accepted; this slice's
whole value is the wiring). `renderHook` with the existing mocks, `season: 2026, currentWeek: 4`,
`rosterPositions: ['WR']`, a `myTeam` with one WR starter (`starterSlots: ['w1']`,
`starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }]`, empty bench/taxi), a
`schedule` of shape `{ games: [...] }` (never a bare array) whose REG games give DAL lines in weeks 1–4, and `seasonProjections: { w1: { projectedPPG: 14.2, inSeason: {} } }`.
Assert `result.current.ownByPlayer.w1.value` equals 14.2 × the expected factor (`toBeCloseTo`), and
that `seasonProjections: null` gives `reason: 'no-base'`. Check `buildRegWeekIndex` treats the
fixture as `game`, not `bye`, for DAL in week 4 (needs both teams and `gameType: 'REG'`).

7.5 **Guards — `src/__tests__/weeklyDecisionViewOnly.test.js`:**
- Add `weeklyOwnProjection` to the PIPELINE forbidden list (one more `not.toMatch` line, and the
  test-title string).
- New `describe('OURS stays view-only (week-own-projection.md)')`:
  - the only non-test file in `src/` importing `weeklyOwnProjection` is `src/hooks/useWeeklyDecision.js`;
  - `weeklyOwnProjection.js`'s module specifiers are exactly `['./nflStats']` (reuse the
    `MODULE_SPEC_RE` approach from `inSeasonEvidenceViewOnly.test.js` — copy the regex, don't import
    across test files);
  - `weeklyOwnProjection.js` never writes `projectedPPG`: no match for `/\bprojectedPPG\s*:/` or
    `/\.projectedPPG\s*=(?!=)/`.

## 8. Docs (same commit as the code)

- `docs/nav/utils.md` — new row `weeklyOwnProjection.js` (after `weeklyLineup.js`): the three
  exports, the formula, the reason order, the constants, `PROVISIONAL(heuristic)`, view-only and its
  guard. Update the `weeklyLineup.js` row's ``backup` = `depth.order >= 2``` clause to D5's rule.
- `docs/nav/components.md` — `LineupTable.jsx` row: the OURS column (value, sub-line, OUT, tooltip,
  footer), the 13-column layout, the BACKUP rule. `WeekView.jsx` row: the `seasonProjections` prop
  and `ownByPlayer` pass-through.
- `docs/navigation.md` — `/week` row: add OURS to the per-row list ("…form/OURS/PROJ…") with one
  clause on what it is; `useWeeklyDecision.js` row: the new param, the `impliedIndex`/`ownByPlayer`
  memos, and `ownByPlayer` in the returned-keys list.
- `docs/signal-registry.md`:
  - `:60` (NFL schedule) Current-use cell, append: `**Fifth consumer (week-own-projection):**
    `src/utils/weeklyOwnProjection.js`'s `buildImpliedTotals` reads `spreadLine`/`totalLine` (with
    `week`/`gameType`/`homeTeam`/`awayTeam`) off the live-season entry for `/week`'s OURS column and
    its implied-total sub-line, reading `spreadLine` as positive = home favoured — view-only,
    `PROVISIONAL(heuristic)`, never `projectedPPG``.
  - `:70` (injury designation) Current-use cell, append: `; `/week`'s OURS cell renders `OUT` for
    `Out`/`IR`/`PUP`/`Sus`/`DNR` (week-own-projection)`.
  - `:132` (depth-chart order) Current-use cell: replace "`/week`'s lineup renders a BACKUP flag at
    `depth_chart_order >= 2`" with "`/week`'s lineup renders a BACKUP flag at `depth_chart_order >= 2`
    — for WR/TE only while current-season snap share is under 50% (week-own-projection)".
  - `:56` (Sleeper weekly stat rows) Current-use cell, before `; never projection/scoring`, append:
    `, and current-season snap share gating the WR/TE BACKUP chip (week-own-projection)`.
  - `:138` (Vegas / injury / coaching / scheme) Current-use cell, append: `. nflverse's
    `spreadLine`/`totalLine` are a separate, reconstructable source (the schedule row above), rendered
    on `/week` (OURS) and not captured`.
- Reference-doc wording rule (`docsAvailabilityClaims.test.js`): describe what the code reads and what
  it renders when a line is null; never claim which weeks currently carry lines.
- `CLAUDE.md` — no change (no new module directory, invariant or command).

## 9. Touch list, done-definition, commit

Touch exactly: `src/utils/weeklyOwnProjection.js` (new), `src/utils/weeklyOwnProjection.test.js` (new),
`src/utils/weeklyLineup.js`, `src/utils/weeklyLineup.test.js`, `src/hooks/useWeeklyDecision.js`,
`src/hooks/useWeeklyDecision.test.js`, `src/components/week/WeekView.jsx`,
`src/components/week/LineupTable.jsx`, `src/components/week/LineupTable.test.jsx`, `src/App.jsx`
(the one line), `src/__tests__/weeklyDecisionViewOnly.test.js`, `docs/nav/utils.md`,
`docs/nav/components.md`, `docs/navigation.md`, `docs/signal-registry.md`,
`.claude/tasks/data-repo-backlog.md` (§Cross-repo impact bullet), and this task file (commit it).
Not `docs/cross-repo-registry.md`.

Done-definition (CLAUDE.md): `npm test`, `npm run lint` (0), `npm run build` (no warnings). Also:
`wc -l src/App.jsx` → 1514; `sed -n 29p src/utils/weeklyLineup.js` unchanged from `819c406`;
`grep -rn "PROVISIONAL(" src/` pasted into the hand-back (two new lines). Smoke (§6 of the
done-definition, the `.claude/launch.json` preview, Anton's league): on This Week check that OURS
renders a number for players whose team has a week-4 line, that the sub-line reads `imp NN.N · ±N.N`,
that any `Out`/`IR` player shows `OUT`, that the table still fits (horizontal scroll is fine), and
that Tee Higgins / Marvin Harrison Jr. no longer carry BACKUP if their snap share is ≥ 50%. Report
three sample rows (base, implied, baseline, value) and whether they match the formula by hand.

Commit: one code commit, message
`/week OURS column: season projection nudged by Vegas implied total; WR/TE backup rule (P4)`, with the
attribution trailer. Push only after verification is clean (CLAUDE.md step 9).

## Cross-repo impact

Touched contracts: **CR-01, CR-08, CR-10 (anchor only), CR-16, CR-18** (CR-14: `calculateFantasyPoints` callers are not
triggers; untouched). **No registry text edit in this slice** (D6). Session 2 appends one bullet to
D-58 in `.claude/tasks/data-repo-backlog.md`:

> - Also pending from P4 (week-own-projection.md, `<sha>`): CR-01 Triggers — add
>   `buildOwnProjections` in `src/utils/weeklyOwnProjection.js` (reads `seasonProjections[id].projectedPPG`
>   and the presence of `inSeason`, from the scored map passed to `<WeekView` at `src/App.jsx:1403`).
>   CR-08 App side and Triggers — add `buildImpliedTotals` in the same file (reads
>   `spreadLine`/`totalLine`/`homeTeam`/`awayTeam`/`week`/`gameType`; `spreadLine` read as positive =
>   home favoured), and append to CR-08's Mirror the sentence quoted in this task file's
>   `## Cross-repo impact`. CR-16 App side and Triggers — add `src/utils/weeklyOwnProjection.js`
>   (`buildImpliedTotals`, `vegasFactor`) to the `normalizeTeamForSchedule` call sites. Re-derive the
>   CR-10 `useWeeklyDecision.js` `loadTeamContext` anchor (already stale at `:254`; this slice adds one
>   import line above it). `[registry-stale]`, found by this slice's plan gate: CR-08 Triggers omit
>   `src/utils/gameLog.js:142-143`, the pop-up's own `spreadLine`/`totalLine` reads (SPREAD/TOTAL
>   cells) — add them. Data side: no action beyond the byte-sync.

- **CR-01** (projection snapshot envelope) — a new live consumer of the verbatim `projection` payload's
  `projectedPPG` (and `inSeason`). Read-only; no envelope change, no `schemaVersion` bump, no data
  action. Mirror, quoted: "State the new envelope shape and whether the snapshot `schemaVersion` bumped.
  On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the
  README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader
  beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed
  snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as
  in-basis grading. Since in-season-evidence-2b-1 snapshots **have** a `tryDataStore` reader (CR-26 —
  the frozen-prior read-back), so the snapshot `schemaVersion` is no longer independent of
  `dataStore.js` `MAX_SUPPORTED_SCHEMA`: raise that ceiling before any snapshot bump above it, never
  after (data CLAUDE.md Invariant 4). The per-player `inSeason` field is additive and did not bump the
  version; graders that ignore unknown per-player keys need no change. Additive `factors` keys
  (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version." Envelope shape
  unchanged; no bump.
- **CR-08** (nflverse schedule) — first app reader of `spreadLine`/`totalLine` outside the pop-up's
  display-only SPREAD/TOTAL cells, and the first to depend on the **sign** of `spreadLine`. A sign flip
  in `scripts/update-schedule.mjs` would not blank anything: it would silently invert every OURS
  adjustment. Current Mirror, quoted: "Shape or floor changes land in both repos together. Read-only on
  the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a
  (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent
  loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** —
  `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for
  `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a
  `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written,
  with no validator to catch it (this family stays read-only/view-only on the app side regardless).
  **Since defence-numbers-rebuild `homeScore`/`awayScore` also drive `/week`'s RECORD column** — a
  rename or reshape blanks it to `—` with no error." **Sentence to append at the next sync:** "**Since
  week-own-projection `spreadLine`/`totalLine` drive `/week`'s OURS column**, and the app reads
  `spreadLine` as positive = home favoured (nflverse's convention): a rename or null-fill blanks OURS
  to `—`, and a sign flip silently inverts every adjustment with no error." Data side: no code action;
  `scripts/update-schedule.mjs` must keep nflverse's sign.
- **CR-10** (nflverse teamcontext) — anchor only: one new import line in `useWeeklyDecision.js` shifts
  the already-stale `:254` `loadTeamContext` anchor (live `:209` → `:210`); queued on D-58, no
  behaviour change. Mirror, quoted: "Shape or floor changes land in both repos together. **First
  TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through
  player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays`
  components, never sum or average stored rates. **`rushPlays` is a counting component, not a rate —
  safe to sum directly across weeks**, unlike its rate siblings. View-only on both sides. Team-key
  domain is CR-16." Nothing owed beyond the anchor.
- **CR-16** (era-accurate team-code remap) — new `normalizeTeamForSchedule` call sites (schedule codes
  and the roster's Sleeper code). No mapping change. Mirror, quoted: "A future franchise move (or any
  change to an existing mapping) updates **both repos in the same change** — and there are **two**
  mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21`
  says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A
  one-sided edit to either produces silently empty joins rather than an error — the team key simply
  never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the
  teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via
  `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new
  consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's
  already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that
  isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in
  addition to the pre-existing teamcontext/schedule join failures this entry already covers." Nothing
  owed beyond the call-site listing.
- **CR-18** (signal registry rows) — `docs/signal-registry.md` changes (§8, five Current-use cells).
  App-originated; the data repo owes no row edit. Mirror, quoted: "This entry's data side is the one
  genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already
  name. The listed sites are every one that exists today; a *new* one is caught by the near-side
  re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and
  `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an
  ingested field, stat key or source — or alters its historical coverage or
  reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must
  make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the
  family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo
  when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs
  snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months
  later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole
  deliverable."

## 10. Risks Session 2 should not "fix"

- **Don't add a points-allowed term** or reuse `fpaTable` in the formula (D1).
- **Don't fall back to the unadjusted base** when a line or baseline is missing (D2).
- **Don't divide by the league-average implied total** (D3) or count the current week in the baseline.
- **Don't round `value` in the util** — the cell formats; tests compare with `toBeCloseTo`.
- **Don't edit `docs/cross-repo-registry.md`** (D6) or add lines to `App.jsx` / above `weeklyLineup.js:29`.
- **Don't widen `getWeeklyProjectionRows` or touch Sleeper's PROJ** — OURS sits beside it, not in it.
- Lines exist only for the current and next week, so OURS blanks for future weeks by construction —
  correct, not a bug. Weeks 1–2 always blank (no baseline) — correct.
- If the schedule in the browser is stale (P8), OURS uses whatever lines that copy has; don't add a
  freshness check here.

## 11. Findings for Anton (reported, not acted on)

- **OURS will usually be a worse weekly number than Sleeper's PROJ** (2–4% in the backtest). Its use is
  as a cross-check: a big gap between OURS and PROJ is worth a look. The footer says this.
- **Points allowed is a weak one-week signal.** P2's numbers are right as data; they just don't
  predict next week's points. That also bears on Portfolio's SOS column and `/teams`' FPA columns,
  which present the same numbers as matchup quality. Not changed here.
- **Weeks 3–4 are outside the backtest's evidence** (it scored weeks 5–18, with ≥ 3 earlier games).
  OURS still renders from week 3 on a 2-week baseline; accepted knowingly — the footer says "weeks 5–18".
- **The Vegas nudge is small by design.** At half weight the 1st–99th percentile of the raw ratio
  (0.64–1.29) becomes a factor of about 0.82–1.15; most players move a few percent. A fitted weekly model is the real version; it would need the grading
  calendar the data track already parks.

## Review record — plan gate round 1 (2026-10-03)

plan-reviewer: 9 flags. Each checked against live source and the backtest output; all applied.
1. HIGH — LineupTable importing `MIN_VEGAS_BASELINE_WEEKS` would fail §7.5's single-importer guard.
   Applied: `vegasFactor` carries `minBaselineWeeks`; the tooltip reads it; LineupTable imports nothing
   from the module (§2.2, §6.2, §7.1).
2. MEDIUM — `(1.0625).toFixed(2)` tie. Reviewer said it prints `1.07`; V8 here prints `1.06` — the
   point stands either way (engine-sensitive tie). Applied: fixture moved to implied 26 / baseline 24
   (factor 1.0417 → `1.04`, value `14.8`) (§7.3).
3. MEDIUM — signal-registry `:132` (BACKUP at order ≥ 2) becomes false; `:56` gains the snap-share use.
   Applied (§8).
4. MEDIUM — footer and D1 overstated the backtest (ALLOWS hurts only at full weight; PROJ's edge is
   2–4%, not ~4%). Confirmed against `output-2026-10-03.txt`. Applied (§0 D1, §6.3).
5. LOW — "half the gap" read as an absolute gap. Applied: "half the percentage difference" (§6.2, §6.3).
6. LOW — container unnamed. Applied: iterate `schedule.games ?? []`; fixtures `{ games: [...] }` (§2.1, §7.4).
7. LOW — weeks 3–4 outside the evidence. Accepted knowingly; recorded in §11; footer names weeks 5–18.
8. LOW — CR-10 anchor shift unlisted. Applied: listed as touched (anchor only), Mirror quoted.
9. registry-stale — CR-08 Triggers omit `gameLog.js:142-143`. Verified; added to the D-58 bullet.

## Verification record (Session 1, 2026-10-03, `819c406..2d8baeb`)

implementation-reviewer: no fidelity, scope or invariant flags; three low flags. Session 2's build
notice (Vite "chunks larger than 500 kB") predates this slice — Session 1 built `819c406` in a
scratch worktree and got the same notice — so it is not a P4 regression.
1. D-58 bullet still reads `<sha>` → Fix pass 1, item 1.1.
2. Commit message / D-58 bullet carry no CR-08 Mirror sentence → no change. The bullet points at this
   committed task file's `## Cross-repo impact`, which quotes the sentence; that is what §Cross-repo
   impact specified.
3. The `'out'` LineupTable test checks only `startsWith('OUT')` → Fix pass 1, item 1.2.
Recorded, not acted on: the §7.5 write-guard regex misses the shorthand `{ ...p, projectedPPG }` and
bracket writes, and false-positives on a ternary read (Session 2's `const ppg` deviation is the
accepted workaround). A stronger regex would false-positive on reads; the frozen-input unit test
covers in-place writes. Revisit only if the module grows.

## Fix pass 1

1.1 `.claude/tasks/data-repo-backlog.md:867` — in the D-58 "Also pending from P4" bullet, replace
`` `<sha>` `` with `` `2d8baeb` ``. Nothing else on that line.

1.2 `src/components/week/LineupTable.test.jsx`, test "'out' renders OUT with the Sleeper status in
the title" (`:200-204`): replace `expect(ours.textContent.startsWith('OUT')).toBe(true)` with two
assertions — `expect(ours.textContent).toBe('OUTimp 26.0 · +2.0')` and
`expect(ours.querySelector('[data-testid="own-implied"]').textContent).toBe('imp 26.0 · +2.0')` —
pinning that an OUT row keeps the implied-total sub-line (§6.2: shown whenever `vegas.implied` is
finite). If the fixture's `vegas` yields a different string, stop and report rather than editing the
expectation to match.

Leave everything else alone. Done-definition: `npm test`, `npm run lint`. One commit:
`Fix pass 1: /week OURS — D-58 SHA, OUT-cell test pins the sub-line`, with the attribution trailer.
Do not push.
