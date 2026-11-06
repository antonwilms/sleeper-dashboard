# Age from birthdates, with a peak-age guard (cross-repo)

Review depth: full — scoring-affecting (dynasty score, projection Step 2, rookie age multiplier, labels); edits CR-32 and CR-15 definition sites and the CR index; cross-repo.

Session 2: **sonnet, effort high**, run from the **parent folder** (edits both repos). Read both repos' CLAUDE.md first; run git/npm inside each repo directory.

Source: data `.claude/tasks/app-repo-backlog.md` → "Age curves and age inputs read stale Sleeper ages" (incl. both appends); data `grading/2026-10-30-age-curve-gap.md`; S3b verdict `grading/2026-10-30-dynasty-history-verdict-rerun.md` §7; 2026-11-01 audit flag [shape] (Model view cautions on birthdate age while the score uses Sleeper age).

Planned at app `84246b1`, data `a5faf89`. Measurements below were made offline at those revisions with scratch scripts (not committed) against `raw/-players-nfl.json` (Sleeper capture 2026-05-18), completed season-totals 2012–2025 and the S3a golden inputs.

---

## 0. Gate 0 — ship timing (Anton)

`future_plans/calendar.md` lists this fix in the **off-season batch** ("projection-model changes ship together, with one PRIOR_MODEL_FROM bump, before the freeze starts at the 2027 kickoff").

- **Recommended:** Session 2 starts only after the 2027-01-15 January grading run is committed. Then no 2026 capture carries the new model, the 2026 season grade needs no new veteran segment, and the bump is the batch's.
- **If Anton wants it now:** Session 1 first appends `## Revision 1` adding (i) a `VETERAN_SEGMENTS` L7 entry + `grading/anchor-policy.md` boundary row/JSON for the new marker, and (ii) the vetReplay age keying in §7.3, both as required. Session 2 does not start on this file as written.

## 1. Decisions

**D1 — age source.** Sleeper's own `player.birth_date`, else Sleeper `player.age`. No crosswalk birthdate field: no `PLAYER_ID_INDEX_VERSION` bump, no CR-31 amendment. Gap check: every one of the **5,119** gp ≥ 10 skill curve-input rows 2012–2025 (as-of 2025 universe) has a Sleeper `birth_date`, so the crosswalk would fill **0** rows. Coverage elsewhere: skill players with `birth_date` — rostered 810/975, teamless 2,772/3,048; agrees with nflverse on 2,606/2,712.

**D2 — reference date: age in season Y = whole years on `Y-06-01`.**
- (a) Curve row for season S: whole years on `S-06-01`.
- (b) Scored age (score, projection, labels, badges, every display): whole years on `(dataSeason + 1)-06-01`, `dataSeason = deriveDataSeason(careerStats)`. This is exactly `cautionAge`/CR-33.
- Why: (b) is the age entering the season the score and projection look at. It is the S3/S3b/S4a harness's convention (`scripts/dynasty-asof.mjs`: playersMap `age = cohortAge(S)` on `(S+1)-06-01`, curve `currentYear = S+1`, which puts each curve row on `season-06-01`). So the historical graded check (§6) runs the shipped convention, and the Model-view caution and the score use one age. It also stops the age from moving with the capture date during a season.
- Fallbacks are today's behaviour, unchanged. Curve row: `Math.round(player.age − (currentYear − season))` with `currentYear = new Date().getFullYear()`, skipped when `player.age == null`. Scored: raw `player.age`.
- Expected side effect: a player born 2 June – capture date reads one year younger than Sleeper's live `age`. That includes `rookieAgeAtDraft` (captured factor) and the rookie age multiplier. This is intended: the June-1 age of the draft year is the draft-day age.

**D3 — peak-age guard.** In the peak search (the derived peak, before the cap), a curve point is eligible only if (i) `age ≥ PEAK_SEARCH_FLOOR[pos]` and (ii) its raw bucket has `≥ PEAK_GUARD_MIN_ROWS` rows.
- `PEAK_SEARCH_FLOOR = { QB: 29, RB: 22, WR: 25, TE: 26 }` (each cap − 3). `PEAK_GUARD_MIN_ROWS = MIN_BASIS_SCALE_ROWS` (30, the standing per-position minimum S3b §8.11 used).
- Derived peak = highest smoothed `medianPPG` among eligible points (strict `>`, so the youngest wins a tie). If no point is eligible, the derived peak = the cap. Then cap as today; `positionPeakPPG` = nearest-point rule as today. Curves themselves are unchanged.
- Property: the capped peak always lies in [cap − 3, cap], so `isLateCareer` (age ≥ peak + 5) can never fire before QB 34 / RB 27 / WR 30 / TE 31.
- Why the floor, not the row minimum alone: with true ages the median curve is U-shaped (young and old buckets hold only the players good enough to get 10+ games). Measured per as-of cohort S = 2015–2025 on birthdate curves:

| guard | QB peaks seen | RB peaks seen | WR peaks seen | TE peaks seen |
|---|---|---|---|---|
| none | 32 | 20 (2023–24), else 25 | 20 (2020, 2024, 2025), else 28 | 29 |
| rows ≥ 30 only (S3b's H) | 23–25 (2021–25), else 32 | 21 (2017–19, 2021–23) | 28 | 26 (2015), 28 (2016), else 29 |
| **rows ≥ 30 + floor (D3)** | **32** | **25** | **28** | 26 (2015), 28 (2016), else 29 |

On full data D3 lands on the cap for every position from 2017 on. On a small sample it can land on the floor (the 16-team golden, §5 A2: RB 22, TE 26). The floor is that worst case, by design.
- Considered and rejected: fixing the peak at the caps (drops the search entirely; the brief asked for a guard).
- The floor is hand-set → `PROVISIONAL(heuristic)` tag (text in §3.2).

**D4 — the `?? 23` defaults** (`computeProspectScore`, `rookieProjection`) stay. A player with neither `birth_date` nor `age` still gets 23. A non-finite non-null `age` now also gets 23. Sleeper's `age` is a number or null, so no live row changes.

**D5 — presence checks are not age reads.** `relevance.js:95` (`!info.age` ghost test) and `teamContext.js:394` (`!p.age && !rowById[pid]` ghost filter) stay as they are. They decide membership of the relevance set and of the snapshot's `teamDepthCharts`. Changing them would change captured content. They are allowlisted in the grep test (§4 A-T7).

## 2. Acceptance numbers (fixed before implementation)

**A1 — current players (gap-report population), via the mirror** (§6, check G1). Population: 387 rows (QB 42, RB 89, WR 156, TE 100), defined as in the gap report §5.2. (a) is today's app: Sleeper `age`, curve unguarded. FIX: `birth_date` + Sleeper `age` fallback, guarded curve.

| position | isLateCareer (a) | isLateCareer FIX | label changes (a → FIX) | FIX peak (a peak) |
|---|---:|---:|---:|---|
| QB | 4 | 4 | 4 | 32 (32) |
| RB | 8 | 8 | 7 | 25 (25) |
| WR | 10 | 1 | 17 | 28 (26) |
| TE | 2 | 2 | 17 | 29 (29) |
| pooled | 24 | 15 | 45 | |

Compare the unguarded true-age curve (gap report setting c): WR isLateCareer 128, 95 label changes, peak 20.
- WR 10 → 1 is explained by the peak moving 26 → 28 (the cap). Today's 26 came from stale ages.
- Label changes where the scored age itself is unchanged: QB 2/4, RB 6/7, WR 16/17, TE 17/17. They come from the corrected curve shape (TE most, as in the gap report §5.2), not from the age-20 artefact.
- Top transitions: Managed Decline → Solid Floor 7; Ascending Star → Elite 6; Solid Floor → Peak Window 4; Sell Now → Managed Decline 4. None is the artefact's mass "→ Veteran Producer".

**A2 — CR-32 golden after regeneration** (`expected-<S>.json`, per-season-team, Path B/C rows; B/C counts unchanged at 266 / 278). The inputs carry no `birth_date`, so only the guard moves them.

| S | positionPeakAge before → after | isLateCareer QB/RB/WR/TE before → after | label changes vs before (QB/RB/WR/TE) |
|---|---|---|---|
| 2019 | 32/25/20/29 → 32/22/27/26 | 4/11/90/3 → 4/28/8/13 | 0/8/43/3 |
| 2023 | 32/20/20/20 → 32/22/26/26 | 2/64/101/62 → 2/30/12/13 | 0/21/32/20 |

Any difference from A1 or A2 → **stop and report**: the implementation differs from the planned logic. Do not re-tune.

## 3. App changes (`sleeper-dashboard`)

### 3.1 New `src/utils/playerAge.js` — the one age helper

```js
// The single place a player's age is derived (CR-32, CR-15; CR-33's cautionAge delegates here).
// Age in season Y = whole years on `${Y}-06-01` from Sleeper `birth_date`, else Sleeper `age`.
import { deriveDataSeason } from './environment'

export const AGE_REFERENCE_MONTH_DAY = '06-01'

// Copy of data lib/inSeasonEvidence.mjs `ageOnDate` (CR-32; playerAge.test.js AGE_TABLE).
export function ageOnDate(birthDate, isoDate) { /* verbatim logic of the data function */ }

// Age for a season-S curve row. Fallback is today's estimate from the live Sleeper age.
export function curveRowAge(player, season, currentYear) {
  const a = ageOnDate(player?.birth_date, `${season}-${AGE_REFERENCE_MONTH_DAY}`)
  if (a != null) return a
  if (player?.age == null) return null
  return Math.round(player.age - (currentYear - Number(season)))
}

// The scored age: entering season dataSeason + 1. { age, source: 'birthdate'|'sleeper' } | null.
export function scoredAge(player, careerStats) {
  const ds = deriveDataSeason(careerStats)
  const a = ds != null ? ageOnDate(player?.birth_date, `${ds + 1}-${AGE_REFERENCE_MONTH_DAY}`) : null
  if (a != null) return { age: a, source: 'birthdate' }
  if (Number.isFinite(player?.age)) return { age: player.age, source: 'sleeper' }
  return null
}
```

`environment.js` imports nothing, so there is no cycle. The helper is a leaf; `twoYearBaseline.js` imports it (allowed by the view-only guard: the guard forbids pipeline → twoYearBaseline, not the reverse).

### 3.2 Site list — every age read (grep `\.age\b` at `84246b1`, complete)

| site | today | change |
|---|---|---|
| `src/utils/dynastyScore.js:84-89` `computeEmpiricalAgeCurves` | `round(player.age − (currentYear − season))` | `curveRowAge(player, season, currentYear)` (keep `currentYear = new Date().getFullYear()` once, outside the loops); also collect `counts[pos][age]` = rows per raw bucket |
| `dynastyScore.js:28-39` `derivePeakAge(curve, position)` | argmax of the curve | `derivePeakAge(curve, position, counts = null)` per D3. `counts == null` (the `computeDynastyScore` fallback for hand-built curves) applies the floor only. Add constants beside `PEAK_AGE_CAPS`: `PEAK_SEARCH_FLOOR`, `PEAK_GUARD_MIN_ROWS = MIN_BASIS_SCALE_ROWS` with `// PROVISIONAL(heuristic): peak-search floor = cap − 3 and 30-row bucket minimum, hand-set · stop a selection-biased young bucket becoming the peak once ages are true · S5's age-decline model`. Rewrite the header comment of `derivePeakAge` |
| `dynastyScore.js:117-124` builder call | `derivePeakAge(smoothed, pos)` | `derivePeakAge(smoothed, pos, counts[pos])`; dev-mode log text unchanged |
| `dynastyScore.js:555` `computeProspectScore` | `player.age ?? 23` | new **8th** parameter `age = null`; `const a = age ?? 23`. Both internal calls (`:736`, `:1002`) pass the scored age. Test calls in `dynastyScore.test.js` (`:1125-1130`) pass an explicit age equal to their player's `age` |
| `dynastyScore.js:681` `computeDynastyScore` | `player?.age ?? null` | `scoredAge(player, careerStats)?.age ?? null` |
| `src/utils/seasonProjection.js:726` `computeNextSeasonProjection` Step 2 | `player.age ?? null` | compute once near the top: `const age = scoredAge(player, careerStats)?.age ?? null`; use it in Step 2 |
| `seasonProjection.js:378` `rookieProjection` | `player.age ?? 23` | new last parameter `age = null`, `const a = age ?? 23`; caller `:711` passes the computed age |
| `src/App.jsx:317` college metrics | `p.age` | `scoredAge(p, careerStats)?.age ?? null` (`computeCollegeMetrics`'s internal offset unchanged) |
| `App.jsx:523` row `age` | `info.age ?? null` | `scoredAge(info, careerStats)?.age ?? null` |
| `App.jsx:1008-1009` `enrichPlayer` | `age: p.age` | `age: null`. Add an App memo `rosterTeamsWithAges` over `[leagueData, careerStats]`: maps every player array `enrichPlayer` builds (starters, bench, reserve, taxi) to `{ ...e, age: scoredAge(leagueData.playerMap[e.id], careerStats)?.age ?? null }`. Before career data loads this shows Sleeper's age, because `scoredAge` falls back. Route `/league/:view` → `<LeagueView leagueData={leagueData} rosterTeams={rosterTeamsWithAges} />`; `LeagueView` passes `rosterTeams ?? leagueData.rosterTeams` to `RostersTab` |
| `App.jsx:844` `searchablePlayers` | `r.age` (row) | none |
| `src/utils/teamContext.js:402` `buildTeamDepthChart` | `p.age ?? null` | `row?.age ?? null` (row age is the scored age; `:394` unchanged, D5) |
| `src/utils/dynastySignalBadges.js:70` | `player.age` | `signals.age` (on the components path, the only one with `ageCurveFactor != null`) |
| `src/components/dp/PlayerDetailModal.jsx:355` | `player.age` — `player` is the raw `playersMap` entry (`usePlayerProfile.js:23`) | `scoredAge(player, careerStats)?.age` (`careerStats` already comes from `useProfileData()` there) |
| `src/utils/twoYearBaseline.js:74-88` `cautionAge` | own birthdate logic | body becomes `return scoredAge(player, careerStats)`. CR-33's definition is unchanged; `twoYearBaselineParity.test.js` stays green with its fixture unedited |
| `relevance.js:95`, `teamContext.js:394` | presence checks | unchanged (D5) |
| display rows: `PlayerCard.jsx:20`, `RostersTab.jsx:32`, `TopBar.jsx:15`, `cells.jsx:43`, `PlayerDetailTabs.jsx:106`, `marketFilters.js:143`, `relevance.js:105` | read a row's `age` | none — each now receives the scored age |

`teamContext.js:132` and `dynastyLabel` read `signals.age`, so they follow automatically.

### 3.3 Model date

`src/utils/inSeasonConstants.js` `PRIOR_MODEL_FROM`: bump per the constant's own comment (the day after the app push, strictly later than `'2026-10-28'`), extending the comment's history with this slice. `MODEL_MARKER_FROM` unchanged.
- In `priorModelFrom.test.js`, add one fixture: a veteran WR with `birth_date: '1995-09-15'`, stale `age: 25`, `years_exp: 5`, built with `makeVet`. Today's fixtures carry no `birth_date`, so they exercise only the fallback.
- Re-record `GOLDEN.outputs`, and set `GOLDEN.recordedUnder` to the new value.

### 3.4 App docs

- `docs/nav/utils.md`: a new `playerAge.js` row; the `dynastyScore.js` row gains the peak guard; the `twoYearBaseline.js` row says that `cautionAge` delegates to `scoredAge`.
- `docs/signal-registry.md` row "Age delta (`ageDelta`) + empirical age curves": Source → `playerAge.js` (Sleeper `birth_date`, else `age`), peak guard.
- Grep `docs/` for "Sleeper age", "player.age" and "wall-clock" and correct any statement this slice makes false.

## 4. App tests (each fails on the stated defect; show red, then restore)

Shared fixture tables (copy verbatim into both repos' tests; each test's header names the other side's file):

**AGE_TABLE** — `player, season, currentYear, dataSeason → curveRowAge, scoredAge`. `dataSeason` means `careerStats = { [dataSeason]: {} }`; `null` means `{}`.

| # | player | season | currentYear | dataSeason | curveRowAge | scoredAge |
|---|---|---|---|---|---|---|
| 1 | `{ birth_date: '1990-09-15', age: 30 }` | 2015 | 2026 | 2025 | 24 | `{ age: 35, source: 'birthdate' }` |
| 2 | `{ birth_date: '1990-06-01', age: 30 }` | 2015 | 2026 | 2025 | 25 | `{ age: 36, source: 'birthdate' }` |
| 3 | `{ birth_date: '1990-06-02', age: 30 }` | 2015 | 2026 | 2025 | 24 | `{ age: 35, source: 'birthdate' }` |
| 4 | `{ birth_date: null, age: 30 }` | 2015 | 2026 | 2025 | 19 | `{ age: 30, source: 'sleeper' }` |
| 5 | `{ birth_date: 'n/a', age: null }` | 2015 | 2026 | 2025 | null | null |
| 6 | `{ birth_date: '1990-09-15', age: null }` | 2015 | 2026 | null | 24 | null |

**GUARD_TABLE** — built by `guardFixture(position, spec, season = 2020)`. For each `[age, n, ppg]` it adds n players `${pos}_${age}_${i}` = `{ position, birth_date: `${season − age}-01-15`, age: null, years_exp: 3, team: 'KC' }` and a row `careerStats[season][pid] = { gamesPlayed: 16, fantasyPoints: ppg × 16 }`.

| case | position | spec `[age, n, ppg]` | guarded peakAge / peakPPG | unguarded peakAge |
|---|---|---|---|---|
| G-WR (floor) | WR | [20,17,9.0] [21,30,8.0] [22,40,6.0] [23,40,5.5] [24,40,5.5] [25,40,6.0] [26,40,6.5] [27,40,7.0] [28,40,6.8] [29,40,6.4] [30,12,9.5] | 28 / 6.7333… (`(7.0+6.8+6.4)/3`) | 20 |
| G-RB (rows) | RB | [21,40,7.0] [22,40,6.5] [23,40,7.0] [24,10,12.0] [25,40,7.2] [26,40,6.8] | 25 / 8.6667… | 24 |
| G-QB (fallback) | QB | [24,20,18] [25,20,22] then [a,20,17] for a = 26…34 | 32 / 17 | 24 |

- **A-T1** `src/utils/playerAge.test.js` — AGE_TABLE row by row; also `cautionAge(p, cs)` deep-equals `scoredAge(p, cs)` on every row. Fails if: the reference date is not 06-01; a birthday on the reference date is not counted; the fallback formula changes; or the birthdate path needs a data season for curve rows (row 6).
- **A-T2** `dynastyScore.test.js` "teamless stale-age player is bucketed by birthdate": AGE_TABLE row 1 as a WR with `team: null`, one 2015 row gp 16, `Date` pinned to 2026 (same technique as `scripts/verify/lib/dynastyGolden.mjs` `withPinnedEnv`). Asserts the WR curve has an age-24 point and no age-19 point. Fails on today's code (19).
- **A-T3** same file, "missing birth_date falls back to Sleeper age": row 4 → age-19 point present. Fails if the fallback is dropped (row skipped) or altered.
- **A-T4** same file, GUARD_TABLE: `computeEmpiricalAgeCurves` `positionPeakAge`/`positionPeakPPG` per case. Also: curves deep-equal the curve built with the guard removed, so the guard touches only the peak. Fails on today's `derivePeakAge` (20 / 24 / 24), on a row minimum without the floor (G-WR → 21), on a floor without the row minimum (G-RB → 24) and on an unguarded fallback (G-QB → 24).
- **A-T5** same file, "late-career gate on the guarded peak": the G-WR fixture plus WR `P_LATE` = `{ birth_date: '1995-01-15', age: null, years_exp: 4, team: 'KC' }` with rows 2019 (gp 16, ppg 5.5) and 2020 (gp 16, ppg 6.0). These keep every bucket median unchanged. `computeDynastyScore` → `signals.age === 26`, `signals.isLateCareer === false`. Fails today (peak 20, so 26 − 20 ≥ 5).
- **A-T6** `seasonProjection` test, "rookie age at draft uses the scored age": rookie WR `{ birth_date: '2004-08-15', age: 19, years_exp: 0 }`, `careerStats` with dataSeason 2025 → `factors.rookieAgeAtDraft === 21`. Fails today (19).
- **A-T7** `src/__tests__/playerAgeReads.test.js` (grep-style). Scan `src/**/*.{js,jsx}`, excluding `*.test.*`, `__tests__/`, `__fixtures__/` and `src/utils/playerAge.js`.
  - Regex `/\b(player|info)\??\.age\b/g` everywhere, plus `/\bp\??\.age\b/g` in `src/App.jsx` and `src/utils/teamContext.js` (where `p` is a Sleeper player).
  - Exact allowlist with counts: `src/components/roster/PlayerCard.jsx` 2 (display row); `src/components/shell/TopBar.jsx` 1 (searchable row); `src/utils/relevance.js` 2 (`info.age` presence check, D5); `src/utils/teamContext.js` 1 (`p.age` presence check, D5).
  - Fails if any §3.2 site is reverted or a new raw read appears. Counts are exact, so an added read on an allowlisted file also fails.
- **A-T8** `dynastySignalBadges` test: the badge body shows `signals.age` (26) when `player.age` is a stale 30. Fails today.
- **A-T9** CR-33 untouched: `twoYearBaselineParity.test.js` with its fixture unedited stays green. Show the coupling by breaking `AGE_REFERENCE_MONTH_DAY` to `'09-01'`: the parity test reds; restore.
- **A-T10** `priorModelFrom.test.js` per §3.3. Reds if the bump or the re-record is missing.

Done-definition as app CLAUDE.md: `npm test`, `factorsSchema.test.js`, `npm run lint` 0, `npm run build` clean. Smoke-test the running app via the `.claude/launch.json` preview, then stop it:
- the Market Model view: an ages column; a teamless veteran's age now equals its caution band's age;
- the player pop-up: the header age and the "Age curve" badge show the same number;
- `/league/rosters`: ages present after load.

## 5. Data changes (`sleeper-dashboard-data`) — capture-only: no pipeline run, no snapshot/served-file/manifest edit

### 5.1 New `lib/playerAge.mjs` (mirror of the app helper)

Exports `AGE_REFERENCE_MONTH_DAY`, `curveRowAge(player, season, currentYear)` and `scoredAge(player, careerStats)`, with the same bodies as §3.1. `ageOnDate` is imported from `lib/inSeasonEvidence.mjs` (no new copy). `dataSeason` = the largest numeric key of `careerStats`, or null. The header names the app file and CR-32.

### 5.2 `lib/dynastyMirror.mjs` (CR-32)

- `derivePeakAge(curve, position, counts = null, { guard = true } = {})`: **exported**; D3 when `guard`, today's argmax when `!guard`. Export `PEAK_SEARCH_FLOOR` and `PEAK_GUARD_MIN_ROWS = MIN_BASIS_SCALE_ROWS` (same values as the app).
- `empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear, peakGuard = true })`: row age = `curveRowAge(player, season, currentYear)`; per-bucket counts; `derivePeakAge(smoothed, pos, counts[pos], { guard: peakGuard })`. `peakGuard: false` reproduces the pre-change builder exactly. It exists **only** so frozen research reports stay reproducible.
- Prospect mirror (`:637`): an 8th parameter `age = null`, `age ?? 23`.
- `dynastyScoreMirror` (`:738`): `scoredAge(player, careerStats)?.age ?? null`; passes it to the prospect mirror (both calls). The prospect mirror's fallback `derivePeakAge(curve, position)` keeps `counts = null` (floor only), as on the app side.
- Update the header's `dynastyScore.js` line anchors.

### 5.3 Research call sites keep their frozen outputs — pass `peakGuard: false`

- `scripts/dynasty-asof.mjs:292`: new `buildAsOfInputs` option `peakGuard` (default **false**) threaded to `empiricalAgeCurvesMirror`. The S3/S3b/S4a/S5 harness and `PEAK_TABLE` predate the guard.
- `scripts/age-curve-gap-run.mjs:112-113` (APP, BIRTH): `peakGuard: false`.
- `test/age-curve-variants.test.mjs`: the "minRows 0 deep-equals the mirror" comparison passes `peakGuard: false` to the mirror.

As-of playersMaps carry no `birth_date`, so their curve rows and scored ages go through the unchanged fallback. With `peakGuard: false`, every existing research output is byte-identical. Acceptance: every pre-existing data test is green with no fixture edited, except the §5.5 golden regeneration and the two §5.6 panel-fit tests.

### 5.4 CR-15 projection mirror (`lib/projectionFactors.mjs`, `lib/panel.mjs`)

- `ageAtSeason(birthdate, season)` becomes `ageOnDate(birthdate, `${season}-06-01`)`; it was `season − birthYear`.
- `reconstructAgeCurves(rows, birthdateOf, { peakGuard = true } = {})`: per-bucket counts; peak via the imported `derivePeakAge` from `lib/dynastyMirror.mjs`. Delete the local `PEAK_AGE_CAPS` copy if nothing else in the file reads it (grep). If something does, keep it and report.
- `lib/panel.mjs:1489` scored age: `ageAtSeason(birthdate, Y + 1)` (the app scores season Y + 1 from data through Y); it was `lastQSeason`.
- `lib/panel.mjs:2135` rookie `ageAtDraft`: `ageOnDate(birthdate, `${draftYear}-06-01`)`; it was `draftYear − birthYear`.
- `scripts/inseason-dyn-run.mjs:114`: `reconstructAgeCurves(rows, …, { peakGuard: false })`.
- Rewrite the DEVIATION comment at `projectionFactors.mjs:374-384`. Age now uses the app convention. The remaining difference: the birthdate source is nflverse `bySleeper[pid].birthdate`; the app reads Sleeper `birth_date`.
- `lib/vetReplay.mjs`: **unchanged** under Gate 0's recommended timing. Its `ageAt(capturedAt)` reconstructs 2026 captures, all of which predate the new model. See §7.3.

### 5.5 Golden regeneration — a named step, never silent

After the app commit:

```bash
cd sleeper-dashboard && node_modules/.bin/vite-node scripts/verify/dynasty-golden.mjs -- --data ../sleeper-dashboard-data
```

It rewrites `test/fixtures/dynasty-mirror-parity/expected-2019.json` and `expected-2023.json` (inputs untouched). The hand-back gives, per S and mode:
- `positionPeakAge` before → after;
- per-position isLateCareer counts before → after;
- the number of score values and label values changed;
- `sourceRev`.

Per-season-team must equal A2 exactly, or stop.

### 5.6 Data tests

- **D-T1** `test/player-age.test.mjs`: AGE_TABLE through `lib/playerAge.mjs`. Also a source scan: `lib/dynastyMirror.mjs` and `lib/projectionFactors.mjs` contain no `/\bplayer\??\.age\b/`. Fails if the mirror drifts from the app table, or if a raw age read is reintroduced.
- **D-T2** `test/dynasty-mirror.test.mjs`, new `T-G4`:
  - GUARD_TABLE through `empiricalAgeCurvesMirror` and through `reconstructAgeCurves` (rows mapped to `{pid, position, season, ppg, gamesPlayed}`, `birthdateOf` from the fixture), with the same expected peaks. `peakGuard: false` gives the unguarded column.
  - **Teamless-veteran parity**: AGE_TABLE row 1 as a WR, with rows 2015 and 2016 plus filler players so it scores Path B/C. Assert the curve has an age-24 point and `signals.age === scoredAge(...).age === 35`.
  - Fails on the pre-change mirror, or if either mirror skips the guard.
- **D-T3** `T-G5` golden bound: on the regenerated `expected-<S>.json` per-season-team, per-position isLateCareer counts equal A2, and every `positionPeakAge[pos] ≥ PEAK_SEARCH_FLOOR[pos]`. Fails if the guard regresses (unguarded 2023: RB/WR/TE 64/101/62, peaks 20).
- **D-T4** `test/panel-fit.test.mjs`:
  - `ageAtSeason('1995-07-01', 2020) === 24` (year-only gave 25), and `ageAtSeason('1995-06-01', 2020) === 25`. Rename the test.
  - The "age — computed, not asserted equal" test: call `ageAtSeason(birthdate, snapshot.targetSeason)` and rewrite its named-divergence text (birthdate source only). It stays non-asserting.
- **D-T5** `test/dynasty-history.test.mjs`: `computeMetrics(rows, { levelSubjects, deltaSpecs })` emits delta keys only for the given specs, and the defaults emit exactly today's key set. Fails if the parameters are ignored, or if the defaults change.
- **D-T6** `test/age-fix-check.test.mjs`: `buildAgeFixCheckMarkdown` on synthetic results. G2 with TE −0.030 → `STOP`; with −0.029 → pass; any QB/RB/WR `ablation-worse` → `STOP`; a G1 mismatch → `STOP`. Fails if a threshold is inverted or off by one.

Done-definition as data CLAUDE.md (`npm run smoke`, each new test shown red).

## 6. Graded check (current-plan rule 2) — `bin/backtest.mjs --age-fix-check [--write] [--json]`

New adapter `scripts/age-fix-check-run.mjs` exports `runAgeFixCheck({ load = DYNASTY_HISTORY_LOAD, resamples = BOOTSTRAP.resamples })`, `buildAgeFixCheckMarkdown(result)` and `ageFixCheckMain(...)`. It is offline, reads no outcome season beyond what S3b reads, and writes only `grading/<date>-age-fix-check-verdict.md` with `--write`. That file is unregistered, like other `<date>-*-verdict.md` files.

**§1 current players (G1).**
- `inputs = buildAsOfInputs(load, 2025, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' })`; `raw = load.loadRawPlayers()`.
- `appMap[pid] = { ...inputs.playersMap[pid], age: raw[pid]?.age ?? null }`; `fixMap[pid] = { ...appMap[pid], birth_date: raw[pid]?.birth_date ?? null }`.
- `APP = empiricalAgeCurvesMirror(careerStats, appMap, { currentYear: 2026, peakGuard: false })`; `FIX = empiricalAgeCurvesMirror(careerStats, fixMap, { currentYear: 2026 })`.
- Population and scoring call exactly as in `age-curve-gap-run.mjs:150-166` (B/C under (a) = APP/appMap).
- Report the A1 table and transitions. **G1 passes iff every A1 number matches.**

**§2 history (G2).** S3b's harness with one extra variant:
- `buildRows({ ..., extraVariants = [] })`. When `extraVariants` includes `'FIX'`, `cohortContext` adds `fix = empiricalAgeCurvesMirror(H.careerStats, H.playersMap, { currentYear: S + 1 })` (guard on). `scoreVariants` runs `run('FIX', mirrorCall(H, fix))`.
- `computeMetrics(rows, { ..., levelSubjects = LEVEL_SUBJECTS, deltaSpecs = DELTA_SPECS })`, threaded through every internal use. Defaults leave S3b's output unchanged.
- Call `computeMetrics(rows, { levelSubjects: ['H', 'A-AGE-APP', 'FIX'], deltaSpecs: [['FIX', 'A-AGE-APP', 'ablation'], ['FIX', 'H', 'ablation']] })`, with S3b's bootstrap (4000 player-clustered resamples, seed 12345).
- Do not call `runDynastyHistory`/`assertPreregistered`: this check's pre-registration is this section.
- FIX in history = birthdate curves + D3 guard + scored age on `(S+1)-06-01`, i.e. the shipped logic. Deliberate difference: a player with no nflverse birthdate has a null age here, where the app falls back to Sleeper's age.
- **G2 primary cell:** h3 (S = 2015–2022), M1, Sleeper games, ρ, `FIX~A-AGE-APP`, per position.
  - **Pass:** TE value ≥ −0.029, the lower bound of S3b's H~A-AGE-APP TE interval [−0.029, −0.001]. TE below −0.029 → **stop and report**.
  - QB/RB/WR: label ≠ `ablation-worse`. Otherwise **stop and report**.
- Also reported, not gated: the same cells under M2 and snaps; `FIX~H` for all; FIX peak / late share per cohort (as S3b §7.2). Every `A-AGE-APP` line carries S3b's `AGE_APP_LABEL`.
- Expectation, stated in advance and not a gate: FIX's TE peaks equal H's (2015 26, 2016 28, else 29), so TE ≈ S3b's −0.014; RB/QB should not do worse than H (H's RB 21 / QB 23–24 peaks are the artefact D3 removes).

Run it in the background (the S3b run is long). Push nothing in either repo until G1, G2 and A2 pass.

## 7. Cross-repo bookkeeping (same change)

### 7.1 `docs/cross-repo-registry.md` (app) — keep ≤ 13000 bytes (12537 at plan time; ≈ 360 added)

- **CR-32 Invariant**, append: ` Ages: a curve row is whole years on `S-06-01`, the scored age on `(dataSeason+1)-06-01`, from `birth_date`, else Sleeper `age`; the peak search ignores buckets under 30 rows or below cap − 3.`
- **CR-32 App** add `; `src/utils/playerAge.js` (`curveRowAge`, `scoredAge`)`; **Data** add `; `lib/playerAge.mjs` (`curveRowAge`, `scoredAge`)`; **Tests** add `; `src/utils/playerAge.test.js`; `test/player-age.test.mjs``.
- **CR-15 App** add `; `src/utils/playerAge.js` (`scoredAge`)`; **Data** `lib/projectionFactors.mjs` (`REGRESSION_MODELS`, `reconstructAgeCurves`).

If over the cap: **stop and report**. Do not prune other entries. Both index tests (`crossRepoIndex.test.js`, data `test/registry.test.mjs`) stay green.

### 7.2 Data docs

- `CLAUDE.md`: the Commands → Backtest row adds `--age-fix-check`. The `lib/backtest.mjs` row adds "`lib/playerAge.mjs` the mirror of the app's age helper (CR-32)". Stay under the 25,000-byte cap.
- `README.md` Module notes: `lib/playerAge.mjs`, the `--age-fix-check` mode, and the `peakGuard` options (research-only).

### 7.3 Backlogs and calendar

- Data `.claude/tasks/app-repo-backlog.md` entry "Age curves and age inputs read stale Sleeper ages": append `**Resolved** (<date>, app <sha>, data <sha>) — birthdates from Sleeper birth_date + peak guard; graded check grading/<date>-age-fix-check-verdict.md`.
- App `.claude/tasks/data-repo-backlog.md` `## Open`, new item **D-89 · vetReplay age keying under the age-fix model**. Found: this slice (app <sha>). Blocking: no (needed before the 2027 season grade replays captures carrying the new `projectionModelFrom`). Size: small. Text: captures from the new marker on derive age as whole years on `(dataSeason+1)-06-01`, not at the capture date. Key `buildAgeTable`/`qDrift`/the replay's `ageK`/`ageS` on that for those segments, and add the segment boundary to `grading/anchor-policy.md` + `VETERAN_SEGMENTS`.
- `future_plans/calendar.md`: strike the "Stale Sleeper ages" line with the ship date and SHAs.
- The 2026-11-01 audit flag [shape] is closed by this change. Say so in the hand-back.

## 8. Order of work (Session 2)

1. Data §5.1–5.4 + D-T1, D-T2, D-T4, D-T5 (`npm test`: only T-G1 golden parity may be red, pending §5.5; say so).
2. App §3 + §4. Full app done-definition, then commit.
3. §5.5 golden regeneration; D-T3; data `npm run smoke` green.
4. §6 graded check (background) + D-T6; write the verdict with `--write`.
5. §7 bookkeeping; data commit.
6. Hand-back per parent CLAUDE.md, with:
   - SHAs, every file touched, deviations;
   - for each test: what it asserts, the defect it catches, and the red-then-restore proof;
   - the §5.5 before/after summary; the A1/A2/G1/G2 numbers;
   - `grep -rn "PROVISIONAL(" src/` output.

   No push until Session 1 verifies.

## 9. Out of scope

- S5's forward-looking age-decline model.
- nflverse crosswalk birthdates in the app (D1).
- Any change to the age-caution bands or to `cautionAge`'s definition.
- `computeCollegeMetrics`'s internal offset.
- The ghost-filter presence checks (D5).
- The projection `ageDelta` formula.
- `vetReplay` (§7.3, D-89).
- Re-running or re-pinning any S3/S3b/S4a report.

## 10. Copies this slice creates

| copy | original | equality test |
|---|---|---|
| app `playerAge.js` `ageOnDate` | data `lib/inSeasonEvidence.mjs` `ageOnDate` | AGE_TABLE, A-T1 + D-T1 |
| app `curveRowAge`, `scoredAge` | data `lib/playerAge.mjs` (the cross-repo pair, CR-32) | AGE_TABLE, A-T1 + D-T1 |
| app `PEAK_SEARCH_FLOOR`, `PEAK_GUARD_MIN_ROWS`, guarded `derivePeakAge` | data `lib/dynastyMirror.mjs` (exported; `projectionFactors.mjs` imports it, no third copy) | GUARD_TABLE, A-T4 + D-T2; golden T-G1/T-G5 |

---

## Parked (Anton, 2026-11-06)

**Status: parked — not ready for Session 2.** Gate 0 decided: build after the 2027-01-15 January grading run, with the off-season batch's single `PRIOR_MODEL_FROM` bump. The full-depth plan review raised 22 flags (6 HIGH); they are not addressed in this file yet.

Decisions recorded for Revision 1:

- **(a) Frozen research.** Research scripts and past verdicts stay reproducible through a **legacy age option**, not just `peakGuard: false`. The option restores both the pre-change peak search and each research site's original age convention (`season − birthYear` in `ageAtSeason`, unguarded `reconstructAgeCurves`, the S3/S3b/S4a/S5 harness, `inseason-dyn-run`, the rookie draft-age scripts). Every research call site passes it explicitly. The CR-15 mirror path used by the app's projection takes the new convention.
- **(b) CR-25.** `K_DYN_*` (and the arm-A prospect prior they were fitted on) likely go stale under the new ages and peak guard. Refit them on the new ages in the off-season batch — data-repo backlog **D-89**.
- **(c) Revision 1 must:**
  1. address all 22 review flags (plan-reviewer report, this session, 2026-11-03);
  2. pin `nflverse/playerids.json` to a git rev for the §6 history check (G1/G2), as `scripts/dynasty-rework-run.mjs` pins raw players;
  3. split the work into two slices:
     - **slice A:** age helper + peak guard (app sites and the data mirrors);
     - **slice B:** the history check (§6) + the legacy age option.

     Each slice gets its own task file, under 40 KB, with a review depth line. Both slices ship together under one model bump.
  4. re-measure A1/A2 at the revision's revs before restating them.

Re-plan from the parent folder (opus, high), then plan-reviewer at full depth.
