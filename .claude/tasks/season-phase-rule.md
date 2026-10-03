# Season-phase rule — one shared reading of `nflState` (P5a)

Session 1 (opus) task file, 2026-10-03. Package P5 part (a) of `future_plans/in-season-notes-plan.md`.
Planned against app `7ef012b` (clean tree) and data `bf697a5`. Sonnet implements. **Pure util +
tests + one nav row. No surface, no `App.jsx` change, nothing reaches `playerRows`, `projectedPPG`,
the dynasty score, a snapshot or a `factors` entry.**

## 0. Goal and fixed decisions

Every surface that will change in P5b (My Team columns) and P5c (pop-up header, game-log switcher)
needs the same answer to one question: **does "last season vs next season" lead, or does "this
season so far + rest of season" lead?** Today each place answers it differently or not at all:

| Site | How it decides today |
|---|---|
| `src/utils/opponentStrength.js:49` `defenceLoadPlan` | `nflState.season_type` (`regular` → `week - 1` completed weeks; `post` → full season; anything else → no live season) |
| `src/components/portfolio/Portfolio.jsx:271` | Never — fixed `projSeason = dataSeason + 1`, headers `{dataSeason} → {projSeason} PPG` |
| `src/components/dp/PlayerDetailModal.jsx:150`, `:401` | `projSeason = mostRecentSeason + 1`; "rest of season" vs "next season" from `projection.inSeason` (data-driven: is the live file usable) |
| `src/components/market/Market.jsx:703` | User picks the `inseason` column set; data gate is `usableLiveSeason` |
| `src/hooks/useWeeklyDecision.js:152` | `!season \|\| !currentWeek` → empty state |
| `src/App.jsx:1146` → `src/utils/inSeasonScoring.js:72` `selectFrozenPriorCandidate` | Reads `nflState.season_start_date` as a strict `YYYY-MM-DD` string key (string comparison) — not a phase decision, but the other reader of the field D4 uses. Not touched. |

P5a adds the single rule. It does **not** adopt it anywhere (that is 5b/5c), so it changes nothing on
screen. "Proving the rule" (Anton's brief: no surface changes beyond what is needed to prove it) is
done with tests: a table over every `season_type`, the live payload captured today verbatim, and an
agreement test against the one existing `season_type` reader, `defenceLoadPlan`.

**D1 — three phases, defined by NFL calendar only (recommended; Anton to confirm).**
- `offseason` — no regular-season game of the live season is complete: `season_type` `off` or `pre`.
- `in-season` — `season_type === 'regular'`.
- `late-season` — the live season's regular season is over: `season_type === 'post'` (NFL playoffs).

The alternative was to start "late season" at **this league's fantasy playoffs**
(`leagueData` `settings.playoff_week_start`). Rejected for 5a because the brief says "from
`nflState`" and a league-aware rule needs `leagueData`, making it a different function signature
for every caller. If Anton wants fantasy-playoff awareness, it is an additive second input later
(`seasonPhase(nflState, { now, playoffWeekStart })`) — record it in §6, do not build it.

**D2 — `lead` is gated on completed weeks, not just phase.** `lead` is `'current-plus-ros'` only
when `phase === 'in-season'` **and** `completedWeeks >= 1`. In week 1 (`week: 1` → 0 completed
weeks) there are no actuals at all, so a "so far" column would be all `—`; `lead` stays
`'last-vs-next'` until the first week completes. `phase` still reads `in-season` (the /week surface
is live). Omit rather than approximate.

**D3 — `late-season` leads `'last-vs-next'`, with the live season as "last".** During `post` the
fantasy regular season is over and ROS is empty; the meaningful view is "the season just played vs
next season". So `lastCompleteSeason = liveSeason`, next = `liveSeason + 1`.

**D4 — the pre-flip offseason is detected by `season_start_date`.** Sleeper's `season` does not
necessarily roll to the new year the day after the Super Bowl — the data repo's own fallback
(`lib/sleeper.mjs:48–50`) assumes a ~March rollover. In that window `season_type` is `off` but
`season` is the **finished** season. The tell is `season_start_date` already in the past **and in the live season's own year**. So for
`season_type === 'off'`: if `Date.parse(nflState.season_start_date) <= now` **and** that date's UTC
year equals `liveSeason` → the live season is complete (`liveSeasonComplete: true`, `lastCompleteSeason = liveSeason`); otherwise (future date,
missing or unparsable date, or a date from another year) → the live season is upcoming (`lastCompleteSeason = liveSeason - 1`).
Missing date falls to "upcoming" because that is what every existing reader already assumes
(`App.jsx:1014` passes `parseInt(nflState.season)` to `loadCareerHistory`, which builds seasons
`s < currentSeason`, `src/api/sleeperStats.js:395`). The year guard covers the opposite rollover
order: if Sleeper rolls `season` to 2027 before it updates `season_start_date` (still `2026-09-09`),
a bare date test would call 2027 complete; with the guard it reads as upcoming. Plan-gate round 1. `pre` never takes the date
branch (pre-season is by definition before kickoff). `now` is an explicit argument so the function
stays pure and tests are deterministic. `now` is **epoch ms**; a `Date` object fails
`Number.isFinite` and is treated as absent (pinned by a test, §3.10b) — callers pass `Date.now()`.

**D5 — the rule names calendar seasons, never a loader key.** CLAUDE.md → *State and data flow* and
the "two season sources" hazard: loaders key on `dataSeason` (`deriveDataSeason(careerStats)`) and
the live file on `parseInt(nflState.season)`. `lastCompleteSeason` is a **third** season-valued
field, and it can disagree with `dataSeason` (D4's pre-flip window, D3's `post` window — in both,
`careerStats` stops at `liveSeason - 1`). It exists to decide **what leads and how to label it**,
never which file to fetch. The module header must say so in one sentence; 5b/5c own reconciling a
mismatch (render it as degraded, never relabel `dataSeason` data with `lastCompleteSeason`).

**D6 — unknown input returns `null`.** `nflState` null/undefined, `season` not parseable to a finite
integer, or `season_type` not one of `off|pre|regular|post` → `null`. Callers treat `null` as "phase
unknown" and keep their current behaviour. No guessing from the calendar.

## 1. Findings against live source (2026-10-03)

1. **Live payload** (`GET https://api.sleeper.app/v1/state/nfl`, fetched 2026-10-03), verbatim — use
   as a test fixture:
   ```json
   {"week":4,"leg":4,"season":"2026","season_type":"regular","league_season":"2026","previous_season":"2025","season_start_date":"2026-09-09","display_week":4,"league_create_season":"2026","season_has_scores":true}
   ```
   `season` is a **string**; `week` is a number. `getNFLState` (`src/api/sleeper.js:16`) caches it
   60 min (default TTL). Fields no `src/` code reads today: `previous_season`, `league_season`,
   `display_week`, `leg`, `season_has_scores`. The rule does **not** read them either — their
   semantics across the rollover are unverified, and `season_type` + `season_start_date` suffice.
2. **Completed-weeks convention is `week - 1`**, clamped to the regular season. Established by
   `defenceLoadPlan` (`opponentStrength.js:58`) and `useWeeklyDecision`'s played-weeks rule. The rule
   reuses it for every integer `week`. **Deliberate divergence:** `defenceLoadPlan` does
   `(week ?? 0) - 1`, so a string `'4'` coerces to 3; `seasonPhase` requires `Number.isInteger(week)`
   and treats anything else as 0 completed weeks. Sleeper sends a number (§1.1); a non-integer week
   is malformed input, and omitting beats coercing. Not in the §3.16 matrix for that reason.
3. **`regWeeks(season)`** (`season >= 2021 ? 18 : 17`) exists only as a private function in
   `opponentStrength.js:38`. The new module defines and exports its own `regularSeasonWeeks`.
   **Do not** change `opponentStrength.js` to import it (CLAUDE.md: no refactoring working utilities
   while implementing a feature); the agreement test in §3 pins the two together instead.
4. **No cross-repo surface.** `nflState` is a Sleeper API read in the app; it is not a data-store
   family. `grep -n "nflState\|season_type" docs/cross-repo-registry.md docs/signal-registry.md`
   → two hits, both about the season *key*, neither about phase logic: `signal-registry.md:62` (the
   teamcontext row: `/week` keys `loadTeamContext` on `parseInt(nflState.season, 10)`) and
   `cross-repo-registry.md:96` (CR-07 advstats: the live-season advstats call "keyed on
   `nflState.season`") — it names the season *key*, not phase logic, and this slice touches neither
   `advStats.js` nor that call. Not a signal or factor → no row; CR-18 not fired.
5. **CLAUDE.md is at 24,881 / 25,000 bytes.** Do not touch it. The doc row goes in
   `docs/nav/utils.md` only.

## 2. New `src/utils/seasonPhase.js`

Pure, no React, no I/O, **no imports**. Header comment (≤ 8 lines): what the module answers, that
it is the one shared phase rule for P5b/P5c adopters, and D5's sentence (calendar seasons, never a
loader key; reconcile against `dataSeason` at the call site).

### 2.1 `regularSeasonWeeks(season)`

```js
export function regularSeasonWeeks(season) {
  return season >= 2021 ? 18 : 17
}
```

### 2.2 `seasonPhase(nflState, { now } = {})`

```js
/**
 * @param {object|null} nflState  Sleeper GET /state/nfl payload (season is a string)
 * @param {{ now?: number }} [opts]  epoch ms; only read for season_type 'off' (D4)
 * @returns {null | {
 *   phase: 'offseason' | 'in-season' | 'late-season',
 *   lead: 'last-vs-next' | 'current-plus-ros',
 *   liveSeason: number,            // parseInt(nflState.season, 10)
 *   liveSeasonComplete: boolean,   // the live season's regular season is over
 *   lastCompleteSeason: number,    // liveSeasonComplete ? liveSeason : liveSeason - 1  (calendar, D5)
 *   completedWeeks: number,        // regular-season weeks of liveSeason complete, 0..regularWeeks
 *   regularWeeks: 17 | 18,
 *   currentWeek: number | null,    // nflState.week while season_type is 'regular', else null
 * }}
 */
```

Algorithm, in order:

1. `nflState == null` → `null`.
2. `liveSeason = parseInt(nflState.season, 10)`; not `Number.isFinite` → `null`. (Accepts both
   `"2026"` and `2026`.)
3. `regularWeeks = regularSeasonWeeks(liveSeason)`; `type = nflState.season_type`.
4. Branch on `type`:
   - `'regular'`: `w = Number.isInteger(nflState.week) ? nflState.week : 0`;
     `completedWeeks = Math.max(0, Math.min(w - 1, regularWeeks))` (inline — no `clamp` helper, no imports); `phase = 'in-season'`;
     `liveSeasonComplete = false`; `currentWeek = Number.isInteger(nflState.week) ? nflState.week : null`.
   - `'post'`: `completedWeeks = regularWeeks`; `phase = 'late-season'`; `liveSeasonComplete = true`;
     `currentWeek = null`.
   - `'off'`: `start = Date.parse(nflState.season_start_date)` (only if it is a non-empty string);
     `kickedOff = Number.isFinite(start) && Number.isFinite(now) && now >= start
       && new Date(start).getUTCFullYear() === liveSeason` (D4's year guard).
     `phase = 'offseason'`; `liveSeasonComplete = kickedOff`;
     `completedWeeks = kickedOff ? regularWeeks : 0`; `currentWeek = null`.
   - `'pre'`: `phase = 'offseason'`; `liveSeasonComplete = false`; `completedWeeks = 0`;
     `currentWeek = null`.
   - anything else → `null` (D6).
5. `lastCompleteSeason = liveSeasonComplete ? liveSeason : liveSeason - 1`.
6. `lead = phase === 'in-season' && completedWeeks >= 1 ? 'current-plus-ros' : 'last-vs-next'`.
7. Return the object. Plain object, not frozen.

Notes for Session 2 — do not "improve":
- `now` missing on an `off` payload means **no date branch** (upcoming season), by D4. Do not
  default `now` to `Date.now()` inside the function; the caller passes it.
- `'regular'` with `week` ≥ 19 clamps to `completedWeeks = regularWeeks` but stays `in-season` and
  `liveSeasonComplete: false` — Sleeper flips to `post` after week 18; the rule does not
  second-guess `season_type`.
- `'regular'` with `week: 0` or missing `week` → `completedWeeks 0`, `currentWeek` per the rule
  above (`0` stays `0` since it is an integer; missing → `null`), `lead 'last-vs-next'`.

## 3. Tests — new `src/utils/seasonPhase.test.js`

Vitest, same style as `opponentStrength.test.js`. Each case asserts the **whole returned object**
with `toEqual` (not individual fields), so an unspecified extra key or a wrong field fails. Cases
below list only the fields that differ from these two bases; every other field takes the base value
(a local `const IN_2026 = {...}` / `const OFF_2026 = {...}` spread is fine):

```js
// regular-season base (season '2026')
{ phase: 'in-season', lead: 'current-plus-ros', liveSeason: 2026, liveSeasonComplete: false,
  lastCompleteSeason: 2025, completedWeeks: <week-1>, regularWeeks: 18, currentWeek: <week> }
// offseason base (season '2026', upcoming)
{ phase: 'offseason', lead: 'last-vs-next', liveSeason: 2026, liveSeasonComplete: false,
  lastCompleteSeason: 2025, completedWeeks: 0, regularWeeks: 18, currentWeek: null }
```

1. **Live payload (§1.1 verbatim)**, `now = Date.parse('2026-10-03T12:00:00Z')` →
   `{ phase: 'in-season', lead: 'current-plus-ros', liveSeason: 2026, liveSeasonComplete: false,
   lastCompleteSeason: 2025, completedWeeks: 3, regularWeeks: 18, currentWeek: 4 }`.
2. **Week 1** (`regular`, `week: 1`) → `in-season`, `completedWeeks: 0`, `lead: 'last-vs-next'` (D2).
3. **Week 2** → `completedWeeks: 1`, `lead: 'current-plus-ros'` (the D2 boundary).
4. **Week 18** (`regular`, 2026) → `completedWeeks: 17`, still `in-season`.
5. **Week 19 under `regular`** → `completedWeeks: 18` (clamped), `in-season`, `liveSeasonComplete: false`.
6. **2020 season, `regular`, week 17** → `regularWeeks: 17`, `completedWeeks: 16`.
7. **`post`** (season `"2026"`, week 2) → `late-season`, `lead: 'last-vs-next'`,
   `liveSeasonComplete: true`, `lastCompleteSeason: 2026`, `completedWeeks: 18`, `currentWeek: null` (D3).
8. **`off`, post-flip**: season `"2026"`, `season_start_date: "2026-09-09"`,
   `now = Date.parse('2026-05-01')` → `offseason`, `lastCompleteSeason: 2025`, `completedWeeks: 0`,
   `liveSeasonComplete: false`.
9. **`off`, pre-flip** (D4): season `"2025"`, `season_start_date: "2025-09-04"`,
   `now = Date.parse('2026-02-20')` → `offseason`, `liveSeasonComplete: true`,
   `lastCompleteSeason: 2025`, `completedWeeks: 18`, `lead: 'last-vs-next'`.
10. **`off` with no `now`** (same payload as 9, `seasonPhase(state)`) → offseason base with
    `liveSeason: 2025`, `lastCompleteSeason: 2024` — pins that the date branch needs an explicit `now`.
10b. **`now` as a `Date`** (payload 9, `{ now: new Date('2026-02-20') }`) → same as case 10 (D4: epoch
    ms only; a `Date` is treated as absent).
10c. **Stale prior-year date after rollover** (D4 year guard): season `"2027"`, `season_type: 'off'`,
    `season_start_date: "2026-09-09"`, `now = Date.parse('2027-03-15')` → offseason base with
    `liveSeason: 2027`, `lastCompleteSeason: 2026`, `liveSeasonComplete: false`. Without the guard this
    returns `lastCompleteSeason: 2027` — the test must fail on a guard-less implementation.
11. **`off` with missing / `null` / unparsable `season_start_date`** (`'TBD'`), `now` given →
    upcoming (`liveSeasonComplete: false`). One `it` per input or an `it.each`.
12. **`pre`** with `season_start_date` in the past relative to `now` → still `offseason`,
    `liveSeasonComplete: false` (pre never takes the date branch).
13. **Numeric season** (`season: 2026`) → same as the string form.
14. **`null` cases** (D6), `it.each`: `null`, `undefined`, `{}`, `{ season: 'abc', season_type: 'regular', week: 3 }`,
    `{ season: '2026', season_type: 'playoffs', week: 1 }`, `{ season: '2026' }` (no type).
15. **`regularSeasonWeeks`**: 2020 → 17, 2021 → 18, 2026 → 18.
16. **Agreement with `defenceLoadPlan`** — the proof that this rule matches the one existing phase
    reader. For each `nflState` in a matrix of `season_type` ∈ {`regular` weeks 1, 2, 4, 18, 19;
    `post`; `pre`; `off` (no `season_start_date`)} with `season: '2026'`, call
    `defenceLoadPlan({ dataSeason: 2025, nflState })` and `seasonPhase(nflState)`, and assert:
    the plan's live-season entry (`season === 2026`) exists **iff** `completedWeeks >= 1`, and when
    it exists its `throughWeek === completedWeeks`. Import `defenceLoadPlan` from
    `./opponentStrength` — do **not** modify that module or its tests. (The `off` pre-flip case is
    deliberately outside the matrix: `defenceLoadPlan` has no date branch, and that disagreement is
    5b's to resolve, not a test to bend — see §6.)

## 4. Docs (same commit)

`docs/nav/utils.md` — one new row, placed directly after the `opponentStrength.js` row (`:55`):

```
| `seasonPhase.js` | The one shared season-phase rule. Pure, no imports. `seasonPhase(nflState, { now })` → `null` (unknown input) or `{ phase: 'offseason'\|'in-season'\|'late-season', lead: 'last-vs-next'\|'current-plus-ros', liveSeason, liveSeasonComplete, lastCompleteSeason, completedWeeks, regularWeeks, currentWeek }`. `phase` is calendar-only (`season_type`; `off` with a past `season_start_date` is the finished season); `lead` is `current-plus-ros` only in-season with ≥ 1 completed week. `lastCompleteSeason` is a calendar label, never a loader key — loaders key on `dataSeason` and the live file. `regularSeasonWeeks(season)`. No consumers yet. |
```

Wording is a guide; it must state mechanism, not availability (`docsAvailabilityClaims.test.js`).
**"No consumers yet"** is a code fact, allowed; drop it in 5b. No CLAUDE.md change (§1.5). No
`signal-registry.md` change (§1.4).

## 5. Touch list, done-definition, commit

Touch list — exactly:
- `src/utils/seasonPhase.js` (new)
- `src/utils/seasonPhase.test.js` (new)
- `docs/nav/utils.md` (one row)

Not touched: `App.jsx`, any component, `opponentStrength.js` and its test, `CLAUDE.md`, both registries.

Done-definition (CLAUDE.md): `npm test` green; `npm run lint` 0 problems; `npm run build` clean. No
contract tests apply (`seasonProjection.js` and stat keys untouched). **No app smoke** — no visible
surface. Instead, prove the rule against the live API once and paste the output into the hand-back:

```bash
node -e "import('./src/utils/seasonPhase.js').then(async m => { const s = await (await fetch('https://api.sleeper.app/v1/state/nfl')).json(); console.log(JSON.stringify(s)); console.log(m.seasonPhase(s, { now: Date.now() })) })"
```

Expected at hand-back time (week 4 or 5 of 2026): `phase 'in-season'`, `lead 'current-plus-ros'`,
`completedWeeks = week - 1`. If it is anything else, stop and report — do not adjust the rule.

`grep -rn "PROVISIONAL(" src/utils/seasonPhase.js` must be empty — nothing here is a stand-in.

Commit message: `Season-phase rule: one shared nflState reading for P5b/P5c (P5a)`. Push per
CLAUDE.md step 9 only after Session 1 verification.

## Cross-repo impact

None. `nflState` is a Sleeper API read, not a data-store family; no registry entry lists it; no
`CR-NN` trigger file is touched (`opponentStrength.js` is imported by a test, not edited). No
`docs/signal-registry.md` cell changes (CR-18 not fired). Nothing for `data-repo-backlog.md`.

## 6. Findings for Anton (reported, not acted on) and hand-offs to 5b/5c

1. **The post-season / pre-rollover gap.** `careerStats` is built from seasons before
   `parseInt(nflState.season)` (`App.jsx:1014` → `src/api/sleeperStats.js:395`). So in the NFL playoffs (`post`) and in any
   February–March window before Sleeper rolls `season` over, the season just played is **not** in
   `careerStats` — `dataSeason` stays a year behind and My Team's `{dataSeason} → {projSeason}`
   headers would read "2025 → 2026" while 2026 is finished. The rule now names this
   (`liveSeasonComplete: true`, `lastCompleteSeason = liveSeason`); 5b decides whether "last season"
   in those windows reads from the live season-totals file or renders degraded. Not fixed here.
2. **`defenceLoadPlan` has no pre-rollover branch** (it pushes nothing for `off`). Harmless today
   (it still loads `dataSeason`), but in the D4 window the season just played would be missing from
   the defence tables. Candidate adopter of `seasonPhase` in 5b; not changed here.
3. **Fantasy-playoff "late season"** (D1 alternative) is an additive option if Anton wants My Team to
   pivot to next season once his league's playoffs start rather than at the NFL's.
4. **Adoption guidance for 5b/5c** (to restate in their task files): layout follows `lead`; cells
   follow data (`liveSeasonUsable` / `complete`). When `lead === 'current-plus-ros'` but the live
   file is unusable, render the in-season layout with no-data cells — do not silently fall back to
   the last-vs-next layout. When `seasonPhase` returns `null`, keep today's behaviour. Pass
   `{ now: Date.now() }` (epoch ms, not a `Date`).
5. **The rule assumes Sleeper's `season_start_date` belongs to the season it ships with** (the D4
   year guard makes a stale prior-year date harmless). If the first real rollover (Feb–Mar 2027)
   shows something else, revisit D4 then — worth a one-line check of `/state/nfl` in March.

## Review record — plan gate round 1 (2026-10-03)

plan-reviewer: 7 flags (1 medium, 6 low). All verified against live source; all applied.

| # | Flag | Decision |
|---|---|---|
| 1 | (medium) D4 date test misfires if `season` rolls before `season_start_date` | Applied: UTC-year guard in D4/§2.2, test 10c, risk §6.5 |
| 2 | Non-integer `week` diverges from `defenceLoadPlan` | Applied: stated as deliberate in §1.2 (omit > coerce); kept out of the agreement matrix |
| 3 | `now` as a `Date` silently skips the date branch | Applied: D4 states epoch ms; test 10b pins it; §6.4 guidance |
| 4 | `signal-registry.md:62` does mention `nflState.season` | Applied: §1.4 corrected; conclusion unchanged |
| 5 | `careerStats` anchor wrong (`App.jsx:1013`) | Applied: `App.jsx:1014` → `sleeperStats.js:395` (verified) |
| 6 | `selectFrozenPriorCandidate` also reads `season_start_date` | Applied: added to the §0 table, not touched |
| 7 | Partial expected objects / undefined `clamp` | Applied: §3 base objects; inline `Math.max/min` |
