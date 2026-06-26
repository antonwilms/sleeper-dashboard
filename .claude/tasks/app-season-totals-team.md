# App side of season-totals v3 — accept schemaVersion 3 + join the game log on per-season team

**Status:** planned (opus). Implementer: sonnet. Read this file first; do not improvise
architecture — if something here contradicts the code, stop and ask.

**One-line goal:** make the app support and consume the **v3** `nfl/season-totals/<year>.json`
contract — (1) accept `schemaVersion: 3` so v3 files load, and (2) join the NFL-stats
**game log** on each season's **per-season `team`** (`sd.team`) instead of the player's
current team. Display-only. No projection/scoring/pipeline touch.

This is the **mirror** of an already-planned data-repo change (data code is on `main`, not
yet backfilled/published). No NEW cross-repo contract is introduced here — but the rollout
ordering is load-bearing; see *Cross-repo impact*. Do not re-list CLAUDE.md invariants —
this plan references them (Advstats/schedule view-only decoupling; *App.jsx owns all state*;
*don't refactor working utilities*; Cross-repo contracts → season-totals schemaVersion +
nflverse-schedule rows).

---

## 0. The contract (what v3 adds) — read first

Per the data-repo change (matching this app PR):

- `nfl/season-totals/<year>.json` bumps `schemaVersion: 2 → 3`.
- Each per-player record gains **one additive field, `team`**: a string in the schedule
  `homeTeam`/`awayTeam` abbreviation domain (already normalized — e.g. `LAR` served as
  `LA`), **or `null`** when no team resolves. Source: Sleeper weekly `team`. Coverage
  2012–present. Reconstructable.
- Everything else is unchanged (the `pass_rtg` recompute is internal to the data repo and
  invisible here).

This `team` is the field the game-log join has been missing — see the existing
`nfl-stats-tab.md` plan §0.2 ("There is NO per-season / per-week team in the data … **the
one real constraint of the slice**"). v3 closes exactly that gap.

**Verified app-side state (today, pre-backfill):**
- `src/__fixtures__/season-totals-2025.json` records have **no `team` field** yet (confirmed
  by inspection) — the data isn't backfilled. The buildGameLog unit tests construct their
  own fixtures, so they don't depend on this; the component test must add `team` to its
  inline `careerStats` (see *Tests*).
- `MAX_SUPPORTED_SCHEMA = 2` ([src/api/dataStore.js:8](src/api/dataStore.js)); the gate
  `entry.schemaVersion > MAX_SUPPORTED_SCHEMA → return null` is at
  [src/api/dataStore.js:81](src/api/dataStore.js). **No test currently exercises that gate
  branch** (the manifest mock uses v2) — so the bump is currently uncovered; this plan adds
  a test.
- `buildGameLog`'s only consumer is `GameLogPanel` in `NflStatsTab.jsx`
  ([src/components/players/NflStatsTab.jsx:66](src/components/players/NflStatsTab.jsx)). The
  panel passes `playerTeam={row.nfl_team}` (current team) at
  [NflStatsTab.jsx:345](src/components/players/NflStatsTab.jsx) while `sd =
  careerStats?.[season]?.[playerId]` ([NflStatsTab.jsx:61](src/components/players/NflStatsTab.jsx))
  is already keyed by the **selected** log season — this mismatch is the latent bug in §1.

### The latent season-selector bug this also fixes
`sd` (hence `weeklyPoints`/`weeklyStatus`) is keyed by the panel's **selected season**, but
the join team (`row.nfl_team`) is the player's **current** team regardless of which season
the user selects. So for any player who changed teams since a viewed season, the join used
the wrong team — the season `<select>` was effectively ignored by the matchup join. Reading
the team from `sd.team` (same season key as the stats) makes the selector authoritative and
the join correct by construction. (Per-game fantasy points were already correct — they read
`sd.weeklyPoints`.)

### Behaviour for `team: null` / absent `team`
`sd?.team ?? null` collapses both "v3 unresolved (`null`)" and "v2 file, no field
(`undefined`)" to the same `null`. With a `null` join team the schedule index is empty →
every matchup cell degrades to the existing `—` convention. **Do NOT fall back to the
current team** — that reintroduces the wrong-opponent bug this change removes (per goal).

---

## 1. The guard decision (the one real call) — KEEP, repurposed as a join-sanity assertion

**Decision: KEEP the `teamConsistent` bye-week guard one cycle, with no logic/shape change —
but re-document its role.** Under the v2 current-team join the guard was a *team-change
detector*; under the v3 per-season join it is better understood as a **join-sanity /
data-integrity assertion**. Rationale below; it is honest about what the guard does and does
not solve.

### Precise behaviour under the v3 per-season join
Let `seasonTeam = sd.team`. The guard trips iff some **played (`P`)** week has **no game for
`seasonTeam`** in the loaded schedule (`weeklyStatus[w]==='P' && !weekMap.has(w)`), where
`weekMap` indexes `seasonTeam`'s REG games. Three cases:

| Case | `seasonTeam` | Guard | KEEP result | REMOVE result |
|---|---|---|---|---|
| **Common** (one team all year, resolved) | real | never trips (P weeks ⊆ team's games; the team's bye → status `B`, not `P`) | all matchups correct | **identical** (matchupTrusted either way) |
| **Unresolved** (v3 `null`, or v2 file) | `null` | trips (empty `weekMap`) | all cells `—` + note | all cells `—` (empty weekMap → else branch); no note |
| **Mid-season trade**, `team` = dominant team A | real | trips **only if** a played week lands on **A's bye** | if it trips → whole season `—`; else → A-weeks correct, the other-team weeks show **A's** (wrong) opponent | A-weeks correct, other-team weeks show A's (wrong) opponent; no note |

Two facts that matter and that sharpen the prompt's framing:
1. **When the guard does NOT trip, KEEP ≡ REMOVE** (cells identical). The options differ
   *only* in the tripping scenarios (unresolved team, or a played week on the joined team's
   bye).
2. **Neither option fully fixes mid-season trades.** A single per-season `team` can't be
   exact for a traded player: team A still plays every week (except its bye), so the
   minority-team weeks fall *inside* A's schedule and would render A's opponent — a wrong
   cell under **both** options. The guard only converts this to a full-season `—` in the
   narrow sub-case where a played week coincides with A's bye. The complete fix needs a
   per-*week* team, which the contract does not provide.

### Why KEEP wins anyway
- **Zero common-case cost.** For the 95%+ non-traded population the guard never trips →
  removing it changes nothing visible. KEEP carries no downside there.
- **Safe degrade on the cases it *can* catch.** It is exactly in the tripping cases
  (unresolved `team`; a trade that overlaps the joined team's bye) that REMOVE would surface
  wrong/blank matchups silently; KEEP degrades them to `—` + an explanatory note, upholding
  this panel's documented contract: *"those cells degrade to `—` rather than show a wrong
  opponent"* (docs/ui.md → NFL stats tab).
- **A cheap canary for the new contract.** During the v2→v3 bake, `teamConsistent === false`
  on a player you *know* didn't change teams is a visible tell that the served `team` is
  wrong/`null` — useful signal for one cycle at no cost.
- **REMOVE buys almost nothing.** Its only gain over KEEP is in the rare trade-overlaps-bye
  sub-case, where it shows A's (correct) weeks while still showing wrong cells on the
  minority weeks — i.e. it trades a clean `—` for a partly-wrong row. Not worth losing the
  safe degrade.

This matches the prompt's lean ("keep it one cycle as a cheap correctness assertion, then
revisit"). **Revisit trigger:** if the contract later gains a per-week team (or the data
repo documents how `team` is resolved for traded players), either remove the guard (if the
join becomes exact) or upgrade it to a per-week check.

### Exactly what this implies for `buildGameLog`
**Nothing in `buildGameLog`'s logic or return shape changes.** The guard
([nflStats.js:64-73](src/utils/nflStats.js)) stays; the return stays
`{ scheduleLoaded, teamConsistent, rows }`; the join already keys on the `playerTeam`
argument — the fix is at the **call site** (pass `sd.team`). The only `buildGameLog` edits
are **comment-only** (clarify that `playerTeam` is the per-season join team and the guard is
now a join-sanity assertion). The residual (mid-season trades) is unchanged and is
re-documented honestly in docs/ui.md.

> Note on the `playerTeam` parameter name: it is **kept** (not renamed to `seasonTeam`).
> Renaming would churn the `playerTeam:` key in all 10 existing `buildGameLog` tests for no
> behavioural reason and brushes against *don't refactor working utilities*. The meaning
> ("the team to join this season's games against") is documented in the comment instead. The
> caller-side local **is** named `seasonTeam` for clarity.

---

## 2. Exact edits, grouped by file

### A. `src/api/dataStore.js` — accept v3 (the load-bearing change)

**A1. Bump the constant + comment.** Anchor: [dataStore.js:5-8](src/api/dataStore.js).

Before:
```js
// Phase 5: nfl/season-totals files now ship at schemaVersion 2 (weeklyStatus + availability).
// v1 files still load — isValidSeasonTotals only requires the original fields — so the app
// degrades gracefully if some files are still on v1.
const MAX_SUPPORTED_SCHEMA = 2;
```
After:
```js
// nfl/season-totals files now ship at schemaVersion 3 (v3 adds an additive per-season `team`).
// Older files still load — isValidSeasonTotals only requires the original fields and `team`
// is consumed additively — so the app degrades gracefully against v1/v2 files too.
const MAX_SUPPORTED_SCHEMA = 3;
```

No other change in this file. The gate at [dataStore.js:81](src/api/dataStore.js)
(`entry.schemaVersion > MAX_SUPPORTED_SCHEMA`) is correct as-is once the constant is 3. With
`MAX = 3`, v1/v2/v3 all pass (`≤ 3`); a hypothetical v4 is still rejected.

**A2. `isValidSeasonTotals` — confirm, leave unchanged.** Anchor:
[dataStore.js:101-105](src/api/dataStore.js). It checks `gamesPlayed`/`fantasyPoints`/
`dnpWeeks` only. `team` is additive and not required for validity (and is sometimes `null`),
so adding it to the validator would be wrong. **No change.**

### B. `src/utils/nflStats.js` — comment-only (per the KEEP decision)

**B1. `buildGameLog` docstring.** Anchor: [nflStats.js:47-50](src/utils/nflStats.js).

Before:
```js
// Game log for one player-season.
// weeklyPoints / weeklyStatus from careerStats[season][id].
// scheduleGames = loadNflSchedule(season).games (raw 15-field rows) or [].
export function buildGameLog({ playerTeam, weeklyPoints, weeklyStatus, scheduleGames }) {
```
After:
```js
// Game log for one player-season.
// playerTeam = the team to join THIS season's games against — the caller passes the
//   per-season team (careerStats[season][id].team, schema v3+), NOT the player's current
//   team; null when the season has no resolved team → matchups degrade to `—`.
// weeklyPoints / weeklyStatus from careerStats[season][id].
// scheduleGames = loadNflSchedule(season).games (raw 15-field rows) or [].
export function buildGameLog({ playerTeam, weeklyPoints, weeklyStatus, scheduleGames }) {
```

**B2. Guard comment.** Anchor: [nflStats.js:64](src/utils/nflStats.js).

Before:
```js
  // Team-consistency guard: any played week not in the team's REG schedule → team change
```
After:
```js
  // Join-sanity guard: any played week with no game for the joined (per-season) team →
  // the team is unresolved/anomalous (or a played week on its bye) → suppress matchups.
```

No logic change in this file.

### C. `src/components/players/NflStatsTab.jsx` — read the join team from `sd.team`

**C1. `GameLogPanel` signature — drop the `playerTeam` prop.** Anchor:
[NflStatsTab.jsx:56](src/components/players/NflStatsTab.jsx).

Before:
```js
function GameLogPanel({ playerId, playerTeam, availableSeasons, season, onSeasonChange, careerStats, scheduleEntry, onNeedSeason }) {
```
After:
```js
function GameLogPanel({ playerId, availableSeasons, season, onSeasonChange, careerStats, scheduleEntry, onNeedSeason }) {
```

**C2. Derive the per-season team and pass it to the join.** Anchor:
[NflStatsTab.jsx:61-72](src/components/players/NflStatsTab.jsx).

Before:
```js
  const sd = careerStats?.[season]?.[playerId]
  const noGames = !sd || sd.gamesPlayed === 0

  const { rows, scheduleLoaded, teamConsistent } = noGames
    ? { rows: [], scheduleLoaded: false, teamConsistent: true }
    : buildGameLog({
        playerTeam,
        season,
        weeklyPoints: sd.weeklyPoints,
        weeklyStatus: sd.weeklyStatus,
        scheduleGames: scheduleEntry?.loaded ? scheduleEntry.games : [],
      })
```
After:
```js
  const sd = careerStats?.[season]?.[playerId]
  const noGames = !sd || sd.gamesPlayed === 0
  const seasonTeam = sd?.team ?? null   // per-season team (schema v3+); null → matchups degrade to —

  const { rows, scheduleLoaded, teamConsistent } = noGames
    ? { rows: [], scheduleLoaded: false, teamConsistent: true }
    : buildGameLog({
        playerTeam: seasonTeam,
        weeklyPoints: sd.weeklyPoints,
        weeklyStatus: sd.weeklyStatus,
        scheduleGames: scheduleEntry?.loaded ? scheduleEntry.games : [],
      })
```
(The vestigial `season,` argument is dropped — `buildGameLog` never read it.)

**C3. Note logic — use `seasonTeam`, add a null-team branch.** Anchor:
[NflStatsTab.jsx:76-86](src/components/players/NflStatsTab.jsx).

Before:
```js
  // Note priority: loading > unavailable > team-change
  let note = null
  if (!noGames) {
    if (scheduleEntry?.loading) {
      note = 'Loading schedule…'
    } else if (!scheduleLoaded) {
      note = `Schedule unavailable for ${season} — matchup details hidden.`
    } else if (scheduleLoaded && !teamConsistent) {
      note = `Couldn't verify ${playerTeam}'s ${season} schedule — matchup details hidden (possible team change).`
    }
  }
```
After:
```js
  // Note priority: loading > schedule-unavailable > no-team > team-change
  let note = null
  if (!noGames) {
    if (scheduleEntry?.loading) {
      note = 'Loading schedule…'
    } else if (!scheduleLoaded) {
      note = `Schedule unavailable for ${season} — matchup details hidden.`
    } else if (!seasonTeam) {
      note = `No team on record for ${season} — matchup details hidden.`
    } else if (!teamConsistent) {
      note = `Couldn't verify ${seasonTeam}'s ${season} schedule — matchup details hidden (possible team change).`
    }
  }
```
Two reasons for the `!seasonTeam` branch placed **before** `!teamConsistent`:
1. A `null` team trips the guard too — without the earlier branch the team-change label would
   interpolate `null` ("Couldn't verify null's…"). The `!seasonTeam` branch claims that case
   first and prevents `null`/`undefined` from rendering (keeps NflStatsTab test 7 green).
2. It honestly explains the `—` cells (consistent with the existing "Schedule unavailable"
   note) — relevant during the v2→v3 interim when every season is team-less (see *Cross-repo
   impact*). (Alternative considered: show no note for `null` and let the `—` cells speak for
   themselves — rejected as less honest and inconsistent with the sibling "unavailable"
   note. If the interim note proves too noisy in the user's smoke, it's a one-line revert to
   the silent form.)

**C4. Call site — remove the current-team prop.** Anchor:
[NflStatsTab.jsx:343-353](src/components/players/NflStatsTab.jsx). Delete the line:
```js
                playerTeam={row.nfl_team}
```
Leave every other prop as-is. (`position={row.position}` on the next line is a pre-existing
unused prop — out of scope; do not touch. `row.nfl_team` is still used correctly in the
row's player sub-line at [NflStatsTab.jsx:371-372](src/components/players/NflStatsTab.jsx) —
that is the current-team chip and must stay.)

---

## 3. Docs updates (same change — CLAUDE.md self-maintenance rule)

### D1. `docs/ui.md` → "NFL stats tab" — *Schedule join* paragraph
Anchor: [docs/ui.md:194-201](docs/ui.md).

Before (key sentences):
> **Schedule join.** Key `(team, week, season)` against `gameType === 'REG'` games. The
> player's team is the **current** `nfl_team` (the data has no per-season team), normalized
> Sleeper→nflverse (`LAR→LA`). A bye-week consistency guard hides matchup context for seasons
> where the current team's schedule doesn't fit the player's played weeks (likely team
> change) — those cells degrade to `—` rather than show a wrong opponent. …

After:
> **Schedule join.** Key `(team, week, season)` against `gameType === 'REG'` games. The join
> team is the **per-season `team`** from season-totals v3 (`careerStats[season][id].team`,
> keyed by the selected log season), normalized Sleeper→nflverse (`LAR→LA`); when a season
> has no resolved team (`null`, or a pre-v3 file) the matchup cells degrade to `—`. A
> join-sanity guard hides matchup context for a season whose joined team has no game in a
> played week (unresolved team, or a played week on the team's bye) — those cells degrade to
> `—` rather than show a wrong opponent. …

(Keep the existing `result`/`spreadLine` sentence and the pure-helpers sentence.)

### D2. `docs/ui.md` → "NFL stats tab" — *Known limitations / future*
Anchor: [docs/ui.md:206-209](docs/ui.md).

Before:
> **Known limitations / future.** No per-season historical team → team-change seasons hide
> matchup context. …

After:
> **Known limitations / future.** Per-season team comes from season-totals v3
> (`team`); the residual is **mid-season trades** — a single per-season team can't be exact
> for a traded player, so the minority-team weeks may show `—` or, when they fall inside the
> dominant team's schedule, a wrong opponent (a per-*week* team would be needed to fix this).
> …

(Keep the existing DvP and advstats-column sentences.)

### D3. `docs/signal-registry.md` — NEW row for per-season `team`
Place adjacent to the season-totals fantasy-core row ([signal-registry.md:45](docs/signal-registry.md)).
New row (match the existing 6-column format: Field | Type | Source | Coverage |
Reconstructable | Usage):

> `| NFL per-season team (`team`) | raw ingested data | data: `nfl/season-totals/<year>.json` (schema v3) ← Sleeper weekly `team` | **2012–present** | **Reconstructable** — Sleeper weekly source; backfillable per season | **view-only display** (NFL-stats game-log schedule join — `NflStatsTab`); never feeds projection/scoring |`

(The existing nflverse-schedule row at [signal-registry.md:55](docs/signal-registry.md) needs
no change — it already reads "view-only display (NFL-stats game log)".)

### D4. `CLAUDE.md` → Cross-repo contracts
**season-totals schemaVersion bullet** — before:
> **season-totals schemaVersion:** `src/api/dataStore.js` advertises `MAX_SUPPORTED_SCHEMA=2`
> and re-fetches v1 cache entries lacking `weeklyStatus`; the data repo writes v2. Coordinate
> any version bump.

After:
> **season-totals schemaVersion:** `src/api/dataStore.js` advertises `MAX_SUPPORTED_SCHEMA=3`
> and re-fetches v1 cache entries lacking `weeklyStatus`; the data repo writes v3 (v3 adds an
> additive per-season `team`, consumed view-only by the NFL-stats game log). v1/v2 files still
> load (validator + additive consumption). Coordinate any version bump.

**nflverse-schedule bullet, last sentence** — before:
> … The app-side consumer is `NflStatsTab` (game log); the join uses the player's *current*
> team because season-totals carry no per-season team — a known app-side gap, not a schedule
> contract change.

After:
> … The app-side consumer is `NflStatsTab` (game log); the join uses the **per-season `team`**
> from season-totals v3 (degrading to `—` when absent/`null`) — the former current-team gap is
> closed.

**Optional (nice-to-have, same change):** the `nflStats.js` one-liner in the `src/utils/`
table (CLAUDE.md) calls the guard "bye-week team-consistency guard"; may be updated to
"join-sanity guard" for consistency with the code comment. Not required.

---

## 4. Tests to add / update

### Unit — `src/utils/nflStats.test.js` (`buildGameLog`)
**T1 (new) — the join keys on the passed per-season team, ignoring any other team.** Build a
schedule with games for **two** teams in week 1 (e.g. `DAL` vs `PIT`, and `SF` vs `SEA`);
call `buildGameLog({ playerTeam: 'DAL', weeklyPoints: { 1: 20 }, weeklyStatus:
makeStatus({ 1: 'P' }), scheduleGames: [dalGame, sfGame] })`; assert `rows[0].opponent ===
'PIT'` (DAL's opponent) and `homeAway`/`spread` follow the DAL game — proving the opponent
follows the *passed* team and that the function consults no "current team". (This is the
unit-level proof of the team-change-season fix; the season-selector half is proven at the
component level in T4.)

**T2 (new) — null season team degrades to `—`, FP intact, guard trips.** Call
`buildGameLog({ playerTeam: null, weeklyPoints: { 1: 24, 2: 20 }, weeklyStatus:
makeStatus({ 1: 'P', 2: 'P' }), scheduleGames: [game1] })` (a **loaded** schedule). Assert:
`scheduleLoaded === true`; `teamConsistent === false` (the KEEP guard); every `rows[*].opponent
=== null` and `result`/`score === null`; and `rows[*].fantasyPoints` are intact (24, 20).
This is the new `null`-team path (a newly-possible input) and the guard's behaviour on it.

**T3 — existing guard test stays.** `'team-change/inconsistent: P week on KC bye → teamConsistent
false, matchup null'` ([nflStats.test.js:218-232](src/utils/nflStats.test.js)) still asserts
the KEEP behaviour verbatim — **leave it unchanged** (it now reads as the join-sanity
assertion). All other existing `buildGameLog` tests pass unchanged: they pass `playerTeam:
'<team>'`, which under v3 simply *is* the per-season team — semantics preserved, no edits.

### Component — `src/components/players/NflStatsTab.test.jsx`
**T4a (update existing test 5) — add `team` to the inline `careerStats` so the v3 join
resolves.** Test 5 ([NflStatsTab.test.jsx:168-186](src/components/players/NflStatsTab.test.jsx))
asserts `vs PIT` appears for `wr1`'s 2024 log. Under the new join the opponent comes from
`sd.team`, not `row.nfl_team` — so add `team: 'DAL'` to `wr1`'s **2024** `careerStats` entry
(and `team: 'DAL'` to the 2023 entry for consistency). Anchor:
[NflStatsTab.test.jsx:43-58](src/components/players/NflStatsTab.test.jsx). Justification:
this reflects the corrected behaviour — the game log now joins on the per-season team. Without
it, the join correctly yields `—` (no team on record), which would (correctly) fail the old
assertion. The mocked schedule already has the DAL/PIT week-1 game.

**T4b (new) — the join follows the per-season team, NOT the current team (latent-bug proof).**
Construct a player whose current team and per-season team **diverge**, with a schedule
containing a game for *each* in the same week, and assert the opponent shown is the
**season-team's**:
- `playerRows`: one player, `player_id: 'tx'`, `position: 'WR'`, `nfl_team: 'SF'` (current).
- `careerStats[2024]['tx']`: `gamesPlayed > 0`, `team: 'DAL'` (per-season), `weeklyPoints:
  { 1: 16 }`, `weeklyStatus: makeStatus({ 1: 'P' })`, WR `stats`.
- Mock `loadNflSchedule(2024)` to return **two** week-1 REG games: `DAL` vs `PIT` and `SF`
  vs `SEA`.
- Expand the row → assert `vs PIT` (DAL's opponent) is shown and `@SEA`/`vs SEA` (SF's
  opponent) is **not** — i.e. the current team `SF` is ignored, the selector/season team
  `DAL` wins. (If a single shared schedule mock is awkward across tests, scope this to its own
  `describe`/`vi.mock` block; the existing module-level mock returns only the DAL game, which
  already suffices for T4a.)

### API — `src/api/dataStore.test.js` (guard the v3 bump)
**T5 (new) — `tryDataStore` accepts v3 and still rejects too-new.** The schema-gate branch is
currently uncovered. Add a `describe('season-totals schema gate')` that, per the file's
existing pattern (`vi.stubEnv('VITE_DATA_STORE_URL', '…validuser…')`, then dynamic
`import('./dataStore.js')` after `vi.resetModules`):
- **accepts v3:** mock `fetch` so the first call (manifest) resolves
  `{ files: { 'nfl/season-totals/2023.json': { schemaVersion: 3, inProgress: false,
  lastModified: '2026-01-01' } } }` and the second call (the file) resolves a minimal valid
  season-totals object; assert `await tryDataStore('nfl/season-totals/2023.json', { validate:
  isValidSeasonTotals })` returns the file object (gate passes, file fetched). Use
  `fetchSpy.mockResolvedValueOnce(manifest).mockResolvedValueOnce(file)`.
- **rejects v4:** same manifest but `schemaVersion: 4`; assert the result is `null` and that
  **only the manifest** was fetched (`fetchSpy` called once — no file fetch), i.e. the
  too-new branch short-circuits before the file request.

No test is needed for `isValidSeasonTotals` (unchanged) or `scheduleViewOnly.test.js` (no new
module; nothing added to its PIPELINE list — confirm it stays green).

---

## 5. Cross-repo impact + rollout ordering

**No NEW contract.** This PR is the app mirror of the already-planned data-repo v3 change
(season-totals `schemaVersion: 3` + additive `team`). Still, call it out in the task summary
per the Cross-repo-contracts rule, and **the rollout order is load-bearing:**

1. **Ship this app PR FIRST** (live before the data repo publishes/backfills v3). The
   `MAX_SUPPORTED_SCHEMA` bump is the reason: if the data repo published v3 while the app
   still advertised `MAX = 2`, the gate at [dataStore.js:81](src/api/dataStore.js) would
   reject **every** season-totals file (`3 > 2`) → API-only fallback → repo-wide ~7-minute
   career-load regression on every visit. The app must accept v3 before any v3 file exists.
2. **Then the data repo publishes the v3 backfill** promptly.

**The app is forward/backward compatible across the window:** with `MAX = 3` it still accepts
v1/v2 files (`≤ 3`), and the join reads `team` only if present (`sd?.team ?? null`), so it
works against both team-less (v2) and team-bearing (v3) files.

**Honest interim consequence:** between (app live) and (data backfilled), all served files are
still v2 → `sd.team` is `null` for everyone → the game-log **matchup cells show `—`** (with
the "No team on record" note) for every player/season. This is the *intended* conservative
degrade — FP and the rest of the table are unaffected, and we explicitly do **not** fall back
to current-team (which would show wrong opponents). It resolves the moment the v3 backfill
lands. Keep the interim short by sequencing the data backfill right after this PR is live.

---

## 6. Step sequence (for the implementer)

1. `src/api/dataStore.js` — A1 (bump `MAX_SUPPORTED_SCHEMA` 2→3 + comment); confirm A2 (no
   `isValidSeasonTotals` change).
2. `src/utils/nflStats.js` — B1/B2 (comment-only).
3. `src/components/players/NflStatsTab.jsx` — C1 (drop prop), C2 (`seasonTeam` + join arg),
   C3 (note branches), C4 (remove `playerTeam={row.nfl_team}`).
4. Tests — T1, T2 (nflStats.test.js); T4a, T4b (NflStatsTab.test.jsx); T5 (dataStore.test.js).
5. Docs — D1–D4.
6. `npm test` → `npm run lint` → `npm run build`; all green/clean (done-definition).
7. Hand back for the user's manual smoke (do not run the dev server). In the summary, state
   the **Cross-repo impact** and **rollout ordering** from §5 explicitly so
   `sleeper-dashboard-data` is sequenced correctly.

---

## 7. Out of scope / do-not-touch
- No projection/scoring/`factors`/pipeline change; `team` is consumed **view-only**. Do not
  add `nflStats.js` (or any module) to `scheduleViewOnly.test.js`'s PIPELINE list.
- Do not rename `buildGameLog`'s `playerTeam` parameter (see §1 note).
- Do not change `isValidSeasonTotals`, cache TTLs, or the schedule loader.
- Do not fall back to the current team for a `null`/absent per-season team.
- Do not touch the pre-existing unused `position={row.position}` prop or the current-team
  chip at [NflStatsTab.jsx:371-372](src/components/players/NflStatsTab.jsx).
