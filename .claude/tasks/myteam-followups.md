# My Team follow-ups (F1–F5) — one slice

Review depth: light — view-only UI/copy; no scoring, snapshot, state-ownership or cross-repo trigger.
Trigger check (plan-reviewer §full list): nothing here feeds `projectedPPG`, the dynasty score, a `factors`
key or fantasy-point scoring (F1 display-only check, §1.1); no `docs/cross-repo-registry.md` site or `CR-NN`
contract is read or written in a new way (F1 reads `marketWindowStats.buildWindowStats`, already a
view-only module with existing consumers; F3 reads `teamcontext off.neutralSeconds/neutralGaps` through the
existing `environment.js` path, already rendered in season); no domain state moves, no new hook or
stateful module, no dependency; no `playerRows` step; no cache TTL; no `projectionSnapshot.js` change.

Session 2 runs on **sonnet**, effort medium. The change is visual: Session 2 runs the app from
`.claude/launch.json` (`sleeper-dashboard`), not a backgrounded `npm run dev`, and stops it when done.

Copied definitions created by this slice: **none** (F1 imports `buildInSeasonUsage` and `buildWindowStats`;
nothing is duplicated).

---

## 0. Pre-checks done in planning (Session 1, 2026-11-23)

- **F3 pace field present.** Data repo `nflverse/teamcontext/2025.json`: 544 REG team-games, every one with
  numeric `off.neutralSeconds` and `off.neutralGaps` (WAS 2025 → 34.58 s/play). App IndexedDB (`sleeper-dashboard`
  → `cache`): `nfl-teamcontext/2021`…`/2026` all carry both keys (2025: 570 occurrences each). Portfolio already
  computes `pace`/`paceRank` from `tcForSeason` in every phase (`Portfolio.jsx` ~L565 `rankMetricsTable(...,'pace')`,
  ~L963–964); only the render is gated. **F3 stays in.** No data-repo backlog line.
- **P3 left out** (see §6). Distinguishing "still loading" from "no data" on the strip and figures needs a new
  App → Portfolio signal (`liveSeasonTotals` is `null` both while loading and when unusable — App.jsx ~L1625
  `liveSeasonUsable ? currentSeasonTotals : null`) and separate pending flags for weekly rows and gamelogs.
  That is more than a render-time check of existing flags.

## 1. F1 — SHARE on the games-played basis everywhere

### 1.1 Display-only check (done; Session 2 re-runs the grep in §8)

Changed values: My Team's out-of-season `facts.share`/`facts.snap` (Portfolio-local memo) and the pop-up's
four share rows (UsageEfficiencySection-local memo). Neither leaves its component. `grep` of every
`PIPELINE` file in `src/__tests__/marketWindowStatsViewOnly.test.js` (incl. `App.jsx`) for
`outlookUsage|usageEfficiency|portfolioUsage|marketWindowStats|outlookPositionStats` finds no import
(`efficiencyMetrics.js:31` and `weeklyUsage.js:122` are comments). **Display-only — confirmed.** If Session 2's
re-run finds any pipeline import, stop and report (scoring-affecting → full review).

### 1.2 Consumer list and decision for each

| Consumer | Today | Decision |
|---|---|---|
| `Portfolio.jsx` ~L515 out-of-season SHARE/SNAP | `buildUsageHistory(...).find(season===dataSeason)` — season-total share, gp≥8 gate | **Change** to `buildInSeasonUsage(...).prior` (§1.3) |
| `Portfolio.jsx` in-season SHARE/SNAP | `buildInSeasonUsage` live + prior | Unchanged |
| `UsageEfficiencySection.jsx` share rows (`rushShare`, `rbTargetShare`, `targetShare`, `airYardsShare`) via `buildPositionStatSeries` | season-total, per-season-team | **Change** to games-played (§1.4) |
| `UsageEfficiencySection.jsx` ~L50 `buildUsageHistory` → snap-share row | `off_snp ÷ tm_off_snp` season sums | Unchanged (same sums either basis) |
| `UsageEfficiencySection.jsx` ~L60–65 role label (`buildRoleCohort`/`classifyRole`) | season-total share, whole-cohort tertiles | Unchanged value; gloss names the basis (§1.4 d) |
| `UsageEfficiencySection.jsx` red-zone row (`buildRzShareSeries`) | team red-zone totals, season | Unchanged — different denominator from Market's `rzTgtShare`/`rzRushShare`, not a twin; its glossary already says "over the season" |
| `outlookUsage.js` `buildUsageHistory` / `computeUsageTrend` / `buildRoleCohort` / `classifyRole` | — | **No code change**; output identical for all callers |
| `outlookPositionStats.js` `buildPositionStatSeries` | — | **No code change** (the pop-up stops reading its four share series; counting metrics still come from it) |
| `weeklyUsage.js` | does not call `buildUsageHistory` (comment only, L122) | Unchanged — `/week`'s own weekly basis |

### 1.3 My Team out of season (`src/components/portfolio/Portfolio.jsx`)

a. Add, next to `shareLogs` (~L456):
```js
// Out of season SHARE/SNAP are the dataSeason line in-season shows in grey: Market's games-played share.
const priorShareLogs = useMemo(
  () => (!inSeasonLayout && gameLogsByYear?.[dataSeason] !== undefined ? gameLogsByYear : null),
  [inSeasonLayout, dataSeason, gameLogsByYear]
)
const outOfSeasonUsage = useMemo(
  () => (!inSeasonLayout
    ? buildInSeasonUsage({ ids: factIds, liveRows: null, liveSeason: null, careerStats, dataSeason, playerMap, gameLogsByYear: priorShareLogs })
    : null),
  [inSeasonLayout, factIds, careerStats, dataSeason, playerMap, priorShareLogs]
)
```
b. In `playerFactsById` replace the `buildUsageHistory` line and the two reads after it (~L515–517) with
`const prior = outOfSeasonUsage?.get(id)?.prior ?? null; const share = prior?.share ?? null; const snap = prior?.snap ?? null`.
Swap `perSeasonTeamShares` for `outOfSeasonUsage` in the memo deps.
c. Delete the now-unused `teamShareTotals`/`perSeasonTeamShares` memos (~L437–444) and the
`buildUsageHistory` and `buildTeamShareTotals, buildPerSeasonTeamShares` imports (L23, L26) **only if** lint
shows them unused after (b). Nothing else in Portfolio reads them (grep confirmed in planning).
d. Out-of-season legend (~L1324) — replace the SHARE sentence:
`SHARE is the player's share of his team's targets (pass-catchers) or carries (backs) in the games he played, as on Market.`
then append `${priorUnsplitClause}` where
`const priorUnsplitClause = !inSeasonLayout && seasonsWithoutWeekTeams([dataSeason], priorShareLogs).length > 0 ? \` Mid-season team changes are not split for ${dataSeason}.\` : ''`
(Market's wording; add a `// PROVISIONAL(heuristic):` line above it copying the in-season one at ~L546 with
"out-of-season" in place of "in-season"). The rest of the sentence ("POS RANK is …", "SNAP is …", "Dashed week …")
stays word for word. The "from seasons with 8+ games" clause goes: the new basis has no 8-game gate (same as
in-season's grey line and Market).
e. Update the header comment ~L56–61: out of season usage also reads Market's games-played share.
f. `portfolioUsage.js` header L1–4: replace "not the season-total share `buildUsageHistory` gives the
out-of-season layout" with "used in both phases: in season live + prior; out of season the prior line only".

### 1.4 Pop-up (`src/utils/usageEfficiency.js`, `src/components/dp/UsageEfficiencySection.jsx`, `PlayerDetailModal.jsx`)

a. **New export in `usageEfficiency.js`** (view-only, pure; imports `buildWindowStats` from `./marketWindowStats`,
`POSITION_STAT_METRICS` from `./outlookPositionStats`, `QUALIFYING_GP` from `./outlookConsistency`):
```js
// Market's games-played shares (marketWindowStats SHARES), one single-season window per axis season.
export const GP_SHARE_SOURCE = { rushShare: 'carryShare', rbTargetShare: 'tgtShare', targetShare: 'tgtShare', airYardsShare: 'aySh' }
/** @returns {{ [metricId]: Array<{ season:number, value:number }> }} oldest→newest; only this position's
 *  share metrics that have a GP_SHARE_SOURCE entry; a season appears when the player's
 *  careerStats[season][playerId].gamesPlayed >= QUALIFYING_GP and the value is finite. */
export function buildGamesPlayedShareSeries({ playerId, position, seasons, careerStats, playerMap, gameLogsByYear })
```
Body: for each `y` of `[...seasons].sort()`, skip unless the gp gate holds; `stats = buildWindowStats({ window: { id: String(y), kind: 'season', seasons: [y] }, careerStats, currentSeasonTotals: null, playerMap, gameLogsByYear })`;
`v = stats.get(playerId)?.usage[GP_SHARE_SOURCE[m]]`; push when `Number.isFinite(v)`. The gp≥8 gate keeps
the set of seasons that can show a value the same as today (`buildPerSeasonTeamShares` also gates gp≥8); only
the value's basis changes.

**Seasons without weekly coverage (Anton 2026-11-23: show "—").** `buildWindowStats` yields a share only when the
season is `covered` (every offence row has `weeklyStats`) and the share's keys are not `mismatched`
(`marketWeekly.buildTeamWeekTotals`); otherwise `usage[name]` is `null`. Such a season gets **no entry**, so the
row's slot is a void (`alignToAxis` → `null`, dashed baseline, `—`), even where today's season-total basis
showed a value. Never fall back to the season-total share — one row must not mix bases. Tag the push site:
`// PROVISIONAL(no-data): share slot is — for a season without weekly stats coverage · games-played share needs per-week team totals · weeklyStats on every offence row of that season`.

b. **`METRIC_META`** (usageEfficiency.js L47–76): `rushShare` → `...g('carryShare')`; `rbTargetShare` and
`targetShare` → `...g('tgtShare')`; `airYardsShare` → `...g('aySh')`. `field` strings become
`'Σ rush_att ÷ Σ team rush_att over his played weeks (week team)'`, `'Σ rec_tgt ÷ Σ team rec_tgt over his played weeks (week team)'` (both target rows),
`'Σ rec_air_yd ÷ Σ team rec_air_yd over his played weeks (week team)'`. Domain/format unchanged. Leave the
`rushShare`/`seasonTgtShare`/`seasonAySh` glossary entries in `metricGlossary.js` in place (no deletion this slice).
Visible effect: the RB row label reads "Carry share" (was "Rush share"); the other three labels are unchanged;
every note now ends "in the games he played".

c. **`UsageEfficiencySection.jsx`**: new explicit prop `gameLogsByYear` (fixed list, no spread — the header's rule).
`const gpShareSeries = useMemo(() => buildGamesPlayedShareSeries({ playerId, position, seasons: axisSeasons, careerStats, playerMap: playersMap, gameLogsByYear }), [playerId, position, axisSeasons, careerStats, playersMap, gameLogsByYear])`
— placed with the other hooks above every early return. In `rows`, a metric id in `GP_SHARE_SOURCE` reads
`gpShareSeries[id] ?? []` instead of `positionSeries[id]`. Add
`// PROVISIONAL(heuristic): pop-up share rows credit a week to the season team when that season's gamelogs are not loaded/complete · makeWeekTeam's fallback · complete gamelogs for every axis season`
above the memo. Header comment: note that the four share rows read Market's games-played share via
`buildGamesPlayedShareSeries`; the "Zero diff on outlookPositionStats.js / outlookUsage.js" constraint still holds.
Cost: ≤5 single-season `buildWindowStats` passes per pop-up open (the axis is `careerHistory.slice(-5)`),
re-run when `gameLogsByYear` widens — same cost class as Market's Career window. Accepted.

d. Role popover gloss (~L118): `"From the latest season's opportunity share (and snap share for the top band) over all his team's games, banded against every player at this position in the league's player list."`

e. **`PlayerDetailModal.jsx`** ~L718: pass `gameLogsByYear={gameLogsByYear}` (already destructured at ~L90).

## 2. F2 — drop the out-of-season verdict clause (`Portfolio.jsx` ~L740–786)

- Delete the whole `s3` block (`CARRY`, `DRAG_TOP`, `DRAG_WEAK`, carry/drag selection). Out of season the
  sentence becomes s1 + s2 + a factual per-position line built from data available out of season — each
  position ladder's `lastRank` (`buildPositionLadders`, `lineup.js` L283):
  `const lastGroups = ['QB','RB','WR','TE'].filter(g => ladderBy[g]?.lastRank != null)`;
  `byPosLast = lastGroups.length > 0 ? \` Last season by position: ${lastGroups.map(g => \`${g} ${ordinal(ladderBy[g].lastRank)}\`).join(', ')}.\` : null`.
  Render `{parts}{byPosLast}`. Only append `byPosLast` when `s1Ready` (the line describes last season, which s1
  states); with s1 absent the sentence ends after the projection's rank.
- The projection is labelled as ours: s2's two forms become `' Our projection: '` (after s1) and
  `'Our projection for your starting ten is '` (no s1), followed by the same span and the same
  `` ` for ${projSeason}, ${ordinal(...)}…` `` tails as today. Keep the plain-JS-string rule in the comment at ~L723.
- In-season branch (~L680–715): untouched.
- Update the header comment block and docs (§7).

## 3. F3 — PACE out of season (`src/components/portfolio/TeamOffences.jsx`)

- Header (~L135): render the PACE `th` unconditionally (drop `inSeason &&`). Cell (~L219): render
  `offence-pace` unconditionally. Rank tone unchanged (`toneClass(r.paceRank, false, …)`, lower = faster = 1).
- WEEK MARGIN header/cell: unchanged (in season only).
- Footer (~L273): `{inSeason ? ' WEEK MARGIN is the latest single game; PACE is seconds per neutral play, lower is faster.' : ' PACE is seconds per neutral play, lower is faster.'}`
- Header comment L19–20: "…and PACE … between PROE and PLAYS/G in every phase; out of season WEEK MARGIN does not render."
- Portfolio needs no change: out of season `offenceSeason = dataSeason` and `paceRank` already come from it.

## 4. F4 — polish

**P1 — This week sub-line on one line** (`src/components/dp/cells.jsx`, `src/components/week/LineupTable.jsx`).
- `PlayerCell` gains `subTruncate = false`. When true, the `player-cell-sub` div adds `truncate` (Tailwind:
  nowrap + hidden + ellipsis) and a `title` prop passed as `subTitle` (new, default `undefined`). Default
  callers render byte-identical markup.
- `LineupTable.jsx` (~L289): pass `subTruncate` and
  `subTitle={\`${r.nfl_team ?? 'FA'} · ${rankLine(r, lastSeason, thisSeason)} — rank by total points in this league's scoring; overall is among QB, RB, WR and TE\`}`;
  drop the inner span's `title` (it moves to the div). Content of the line is unchanged.
- Only `/week` opts in; My Team / Defences ahead / Weakest slots keep wrapping behaviour as today.
- Check at 1440 and 375 (§8).

**P2 — phone league name** (`src/components/shell/TopBar.jsx` ~L128–135, ~L186–189).
- Below `md` free width for the name without touching the cluster's `shrink-0`/`min-w-0` (M3 D9):
  the 2-letter initials square gets `hidden md:flex` (replacing `flex`), the `▾` caret `hidden md:inline`,
  and the user avatar `<img>` `hidden md:block`. `Switch` and `League` stay. The name span becomes
  `truncate max-w-[220px]` unchanged (its cap only bites on desktop).
- Expected gain ≈ 18+8 (initials) + 6+8 (caret) + 32+12 (avatar) ≈ 84px ≈ 11 more characters at 13px.
  Session 2 measures at 375: `document.documentElement.scrollWidth === 375` on `/portfolio` and `/week`
  (no overflow back) and reports the visible character count.

**P3** — out (§0, §6).

## 5. F5 — Rookies nav slot hidden until a route exists

- `src/components/shell/navItems.js`: replace the `ROOKIES_NAV` trailing comment with
  `// Shown only once App.jsx has a /rookies route: flip ROOKIES_ROUTE_LIVE in the same change that adds it.`
  and add `export const ROOKIES_ROUTE_LIVE = false`. `ROOKIES_NAV` and `isRookieSeason` unchanged.
- `NavRail.jsx` (~L68) and `BottomTabBar.jsx` (~L10): import `ROOKIES_ROUTE_LIVE`; the existing condition
  becomes `showRookies && ROOKIES_ROUTE_LIVE`. Positions unchanged (MANAGE group tail; tab-bar 5th via `slice(0, 5)`).
- `App.jsx` ~L1494 `showRookies={isRookieSeason()}`: unchanged (the gate is the constant, read by both consumers).
- Docs §7.

## 6. Out of scope / recorded

- P3 loading state (§0). Needs a "pending" signal from App for `currentSeasonTotals`, `defenceWeeklyByYear`
  and the live gamelogs; a later slice can add one prop and a three-state cell. Not a data-repo item.
- Bench rows red for healthy backups; games-missed tile vs strip source; in-season Weakest slots; a Rookies page.

## 7. Docs to update in the same change

- `docs/ui.md` L27 (My Team row: "Offences (PACE; in season also WEEK MARGIN)"), L39 (Rookies: hidden by
  `ROOKIES_ROUTE_LIVE = false` until a `/rookies` route exists; `isRookieSeason` still decides Jan–May once flipped;
  drop the `App.jsx:1688` catch-all sentence), L78 (replace the "carries it / weak spot" description with the
  "Last season by position" line and "Our projection" label), L117 (out of season SHARE/SNAP are the
  `{dataSeason}` games-played share — Market's — GAMES unchanged), L128 (PACE in every phase; WEEK MARGIN in season).
- `docs/navigation.md` L44 (Rookies item: same wording as ui.md L39).
- `docs/nav/components.md` rows `portfolio/Portfolio.jsx` (L14), `portfolio/TeamOffences.jsx` (L17),
  `dp/UsageEfficiencySection.jsx` (L47: share rows from `buildGamesPlayedShareSeries`, new `gameLogsByYear` prop),
  and the `shell/navItems.js` row (L5: add `ROOKIES_ROUTE_LIVE`).
- `docs/nav/utils.md` `usageEfficiency.js` row (L56: `buildGamesPlayedShareSeries`, `GP_SHARE_SOURCE`) and the
  `portfolioUsage.js` row (both phases).
- Phrase all of it as mechanism, never data availability (`docsAvailabilityClaims.test.js`).

## 8. Tests

Each test names what it asserts, the defect it catches, its red step, and the fixture fact that makes it bite.
Existing tests listed under "changes" have a changed correct outcome — update them to the new outcome, never
merely to green. Every other existing test, in particular every in-season F1–F3 test, stays green **unedited**.

### 8.1 F1 — My Team (`Portfolio.test.jsx`)

Fixture change (`buildFixtureS`, ~L211–233): give every 2025 offence row `weeklyStats` whose played-week sums
equal its `stats` (so `covered[2025]` is true and nothing is `mismatched`) — helper: put each stat key's total
in the row's first played week, except w1/w2 `rec_tgt`:
- w1 `W(15, 2)`, `rec_tgt` 25: weeks 1–10 → 2, weeks 11–15 → 1.
- w2 `W(17)`, `rec_tgt` 75: weeks 1–15 → 3, weeks 16–17 → 15.
Fixture fact: w1 played 15 of DAL's 17 games; DAL targets in w1's weeks = 25 + 45 = 70.
Games-played share = 25/70 = 35.7% → "36%"; season-total = 25/100 = "25%".
Session 2 first runs the existing suite on the extended fixture with **no source change** and confirms only the
tests listed below move (if any other test moves, stop and report).

- **F1-T1 (changes the existing out-of-season SHARE assertion at ~L309).** w1's row `col-share` reads `36%`
  (was `25%`); `col-snap` still `90%` (~L308, unchanged). Defect: out-of-season SHARE on the season-total basis.
  Red: restore the `buildUsageHistory(...).find(...)` line → `25%`.
- **F1-T2 (new).** Out of season, for every fact id, `facts.share` equals in-season's grey `prior.share` —
  rendered: w1's out-of-season `col-share` text equals the `sub` of the in-season `UsageStackCell` for w1 under
  the same careerStats (render both phases, compare). Defect: the two phases show different numbers for the same
  season. Red: same as T1.
- **F1-T3 (changes the legend assertion at ~L728).** Out-of-season legend contains
  "in the games he played, as on Market" and does not contain "8+ games". Defect: copy still names the old basis.
  Red: restore the old sentence.

### 8.2 F1 — pop-up

**Pop-up fixture (F1-T4, F1-T5).** A local careerStats for 2025 with the §8.1 w1/w2 shape — w1 WR DAL
`gamesPlayed` 15, `weeklyStatus` `W(15, 2)`, `stats.rec_tgt` 25 (weeks 1–10 → 2, 11–15 → 1); w2 WR DAL
`gamesPlayed` 17, `W(17)`, `rec_tgt` 75 (weeks 1–15 → 3, 16–17 → 15) — and **every** 2025 offence row in it
carrying `weeklyStats` whose played-week sums equal its `stats` (else `covered[2025]` is false and the share is
`null`). Plus a 2024 season where w1 has `gamesPlayed` 16 and `stats.rec_tgt` but **no** `weeklyStats` (2024
uncovered). `playerMap` gives each id its position. Fixture facts: 2025 games-played share 25/70, season-total
25/100; 2024 gp ≥ 8 but uncovered.

- **F1-T4 (new, `usageEfficiency.test.js`, `describe('buildGamesPlayedShareSeries')`).** On the pop-up fixture,
  `seasons: [2024, 2025]`: `targetShare` has exactly one entry, `{ season: 2025, value ≈ 25/70 }` (toBeCloseTo, 4),
  equal to `buildWindowStats({ window: { id: '2025', kind: 'season', seasons: [2025] }, … }).get('w1').usage.tgtShare`
  (import both); no 2024 entry. A third WR with `gamesPlayed` 6 in covered 2025 gets no entry. Defect: helper on
  the season-total basis, the gp gate dropped, or an uncovered season filled. Red: (a) return
  `buildPerSeasonTeamShares`'s share → 0.25; (b) delete the gp gate → the third WR's entry appears; (c) fall back to
  `buildPerSeasonTeamShares` when the window share is null → a 2024 entry appears.
- **F1-T5 (new or extend `PlayerDetailModal.usageAvailability.test.jsx`, the WR case ~L162).** On the pop-up
  fixture (axis 2024–2025), the Target share row's 2025 slot renders `pctFmt(25/70)` (not `pctFmt(0.25)`), and its
  2024 slot renders the void `—`. Defect: pop-up still on the season-total basis, `gameLogsByYear`/
  `buildGamesPlayedShareSeries` not wired, or a season-total fallback for uncovered seasons. Red: (a) revert the
  `rows` swap in §1.4c → 2025 shows `pctFmt(0.25)`; (b) the fallback in F1-T4 (c) → 2024 shows a value.
- **F1-T6 (changes `metricGlossary.test.js` L145 `POPUP_LABEL_PINS`).** `rushShare: "Carry share"` (was "Rush share");
  others unchanged. Test 3 ("one definition for the same quantity") now covers the four share rows with no edit.
  Defect: label still names the season basis. Red: revert `rushShare`'s glossary id.

### 8.3 F2 (`Portfolio.test.jsx`)

- **F2-T1 (changes test 13, ~L805–816).** `text` matches
  `/Our projection: 59\.0 for 2026, 2nd\. Last season by position: (QB|RB|WR|TE) \d+(st|nd|rd|th)(, (QB|RB|WR|TE) \d+(st|nd|rd|th))*\.$/`
  — Session 2 pins the exact string from the fixture after confirming it by hand; and for each of
  `['carr', 'weak spot', 'keep it out']` `not.toContain` (mirrors T8 ~L968). Defect: verdict clause returns. Red:
  restore the `s3` block.
- **F2-T2 (changes test 11, ~L773–784).** Exact `toBe` of
  `'Your starting ten scored 49.0 points a week last season, 2nd of 4. Our projection: 56.0 for 2026, 3rd. Last season by position: …'`
  (exact tail pinned from the fixture). Still shows the projection figure. Defect: projection dropped or not
  labelled as ours. Red: restore `'Projected '`.
- **F2-T3 (new).** No-s1 case (a fixture where `lastMine` is null): sentence is exactly
  `"Our projection for your starting ten is X for 2026, Nth of 4."` with no "Last season by position". Defect:
  a last-season line printed with no last-season sentence. Red: drop the `s1Ready` condition on `byPosLast`.
- T8/T9 (in season, ~L960–977): unedited, green.

### 8.4 F3

- **F3-T1 (changes `Portfolio.test.jsx` M2a T3, ~L1309–1319).** Out of season: `headTexts()` equals the 13
  columns `[..., 'PROE', 'PACE', 'PLAYS/G', ...]` without `WEEK MARGIN`; DET's `offence-pace` text is the 2025
  teamcontext's value (ensure the 2025 fixture's DET `neutralSeconds/neutralGaps` give a value different from
  `tc2026W()`'s 30.0 — add/adjust the 2025 fixture if needed) and its span carries the rank-tone class for its
  2025 rank; `offence-week-margin` absent; footer contains "PACE is seconds per neutral play" and not
  "WEEK MARGIN". Defect: PACE still in-season-gated, or out of season reading the live file. Red: restore
  `inSeason &&` on the PACE cell and header.
- **F3-T2 (new, `TeamOffences.test.jsx`).** `renderRows([...], { inSeason: false })` with a row
  `pace: 29.1, paceRank: 1` → `offence-pace` text `29.1`, class `text-dp-up-text`; no `offence-week-margin`.
  Defect: gate restored. Red: restore `inSeason &&` on the cell.
- In-season M2a T2 (~L1302) and T5a (~L177): unedited, green.

### 8.5 F5 (`AppShell.test.jsx` or new `src/components/shell/navRookies.test.jsx`)

- **F5-T1 (new).** `showRookies={isRookieSeason(new Date(2027, 0, 15))}` (true) → neither the rail
  (`nav[aria-label="Primary"]`) nor the tab bar (`nav[aria-label="Primary (mobile)"]`) contains a `Rookies`
  link; both item lists equal their non-Rookies lists. Defect: dead Rookies tab from January. Red: remove
  `&& ROOKIES_ROUTE_LIVE` in NavRail (rail fails), then separately in BottomTabBar (tab bar fails).
- **F5-T2 (new).** `isRookieSeason(new Date(2026, 10, 23))` (false): rail labels = MANAGE `This week, My Team,
  Market, Teams` + LEAGUE `Standings, Schedule, Rosters`; tab bar = the 4 `PRIMARY_NAV` labels. Defect: November
  nav changed. Red: append `ROOKIES_NAV` unconditionally in BottomTabBar.
- **F5-T3 (new, separate file with `vi.mock('./navItems', async o => ({ ...(await o()), ROOKIES_ROUTE_LIVE: true }))`).**
  With the flag on and `showRookies` true, Rookies is the last MANAGE item (after Teams) and the 5th tab.
  Defect: reserved position lost, so flipping the flag later does not re-enable it in one place. Red: drop
  `ROOKIES_NAV` from NavRail's MANAGE append.
- **Changes:** `AppShell.test.jsx` "Rookies label is present when showRookies=true" (~L93) now asserts absent
  (flag off) — its old outcome is the defect F5 removes. `isRookieSeason` tests (~L178–200) unedited.

### 8.6 F4

- **P1-T1 (new, `LineupTable.test.jsx`).** A starter row's `player-cell-sub` has class `truncate` and a `title`
  containing the full rank line (e.g. `2025 WR12`). A `PlayerCell` rendered without `subTruncate` has no
  `truncate` class on its sub div and no `title` (shared default unchanged). Defect: wrap returns, or every
  surface's sub-line truncated. Red: drop `subTruncate` from LineupTable (first assertion fails); default
  `subTruncate = true` (second fails).
- **P2-T1 (extend `TopBar.test.jsx`, next to TB1).** The initials square and the `▾` caret each carry
  `hidden` and `md:` display classes; the avatar `img` carries `hidden md:block`; TB1 (no `shrink-0`, `min-w-0`)
  unedited and green. Defect: phone league chip still spends width on decoration. Red: restore `flex` on the
  initials square.

## 9. Done-definition and smoke

`npm test`, `npm run lint` (0), `npm run build` (clean); no `seasonProjection.js` or stat-key change, so the
two contract tests just run in the suite. Re-run §1.1's grep and paste the result. `grep -rn "PROVISIONAL(" src/`
inventory in the hand-back (three new tags: §1.3d, §1.4a, §1.4c).

Smoke (preview config, stop when done), reporting what was seen:
1. `/portfolio` out of season is not reachable on today's date (2026-11-23 is in season); verify F1–F3's out-of-season
   rendering through the tests, and in the running app confirm the in-season My Team SHARE column, summary
   sentence and offences table look as before (PACE present, WEEK MARGIN present).
2. Open a pop-up (Market → a WR with missed 2025 games): Usage & efficiency's Target share row renders values, no
   `NaN`; RB pop-up shows "Carry share".
3. `/week` at 1440 and 375: every starter's grey sub-line is one line; hover shows the full line.
4. 375 wide on `/portfolio` and `/week`: `document.documentElement.scrollWidth` is 375; report how many league-name
   characters show.
5. Nav at today's date: no Rookies item (rail and tab bar).

Hand-back per `../CLAUDE.md` (SHA, files, deviations, each test's assertion/defect/red step seen failing).

## Fix pass 1

From implementation-reviewer on `c42eed4` (light). Two flags.

**Flag A — F3-T1 tone assertion is vacuous (fix).** `Portfolio.test.jsx` ~L1358 (M2a T3) asserts the DET
`offence-pace` span class `toMatch(/text-dp-/)`, which every `toneClass` result satisfies (neutral is `text-dp-text`).
In that fixture `rankMetricsTable` assigns distinct ranks `idx + 1` over 3 teams, so every ranked team is ≤ 8 and
reads `text-dp-up-text`; an unranked one (`paceRank: null`) reads `text-dp-text`.
- Change: replace that one assertion with
  `expect(cell('DET', 'offence-pace').querySelector('span').className).toContain('text-dp-up-text')`.
- Asserts: out of season the PACE cell carries a rank tone from the dataSeason ranking. Defect: rank tone not
  wired out of season (rank missing → neutral). Red step: in `Portfolio.jsx` (~L963–964 row assembly) set
  `paceRank: null` → the span reads `text-dp-text` → red; revert.
- Leave alone: every other line of M2a T3, `TeamOffences.jsx`, all other tests.

**Flag B — F2-T3's named red step cannot bite (accepted, no change).** The `s1Ready` guard on `byPosLast` is
redundant: `lineup.js` makes a lineup `total` null exactly when every position is null, so with no s1 there are no
`lastRank`s. This was a planning error in §8.3, not an implementation fault. The test still pins the exact no-s1
sentence (`toBe`) and went red on the substitute (revert the no-s1 label). Guard kept as harmless defence.
