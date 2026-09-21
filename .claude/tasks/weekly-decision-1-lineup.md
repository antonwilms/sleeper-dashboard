# W1 — /week: route, weight panel, the lineup table

Parent: `.claude/tasks/weekly-decision-surface.md`. Read its §1 (data verification — especially the
`off_snp` null semantics and the `normalizeStatsResponse` finding), §3 (blend table) and §4
(invariants) first. Depends on **W0** being merged.

Delivers artboard 9a's first two panels on a live route. Panels 3–5 are W2. States 9b (mid-season)
and 9c (empty, next season week 1) are the same components with different data — **no separate code
paths**; if a branch on "is it early" appears anywhere but a copy string, it is wrong.

---

## §1 `src/api/sleeperStats.js` — two new exports, one shared helper

`normalizeStatsResponse` (:14) reduces each row to its `stats` object and discards `team`,
`opponent`, `game_id`. The upcoming week's opponent lives in those discarded fields. Add a
meta-preserving fetch **beside** the existing ones; do not widen `normalizeStatsResponse` — the
`Object.entries(stats)` sum loop in `getSeasonTotals` (`:102`, loop at `:201-203`) would start
summing non-stat keys and silently corrupt every career total.

**The new export must not route through `fetchStats` (`:23-32`).** That helper calls
`normalizeStatsResponse` on the network path *and* on the cache-hit path (`:25`), so reusing it
would strip exactly the metadata this export exists to keep — and would do so only on the second
load, which is the worst possible failure shape. Write a sibling fetch/cache helper that normalises
to the meta-preserving map instead. It may share `statsTTL` (`:34`); it shares nothing else.

```js
// Both return { [player_id]: { stats, team, opponent, gameId } } — the same payloads the existing
// pair fetches, with the row metadata kept. `team`/`opponent` are the SLEEPER domain (LAR, not LA),
// so the joins to TEAM_<abbr> aggregate rows and to playerMap[id].team are same-domain and need no
// CR-16 era remap. Distinct cache keys — `stat-rows/<s>/<w>` and `projection-rows/<s>/<w>` must NOT
// collide with `stats/<s>/<w>` / `projections/<s>/<w>`, which store the bare stats map.
export function getWeeklyStatRows(season, week, currentNflWeek)
export function getWeeklyProjectionRows(season, week, currentNflWeek)
```

**`/week` uses these two and does not call `getWeeklyStats` at all.** An earlier draft kept the
meta-preserving fetch for the current week's projections only and read played weeks through
`getWeeklyStats` — but that strips `team`, and **per-week team resolution is exactly what §3 and
W2 §3 depend on**. Without it both silently fall back to the player's *current* team and a traded
player's whole season is divided by, and byed against, the wrong franchise. One shared helper, two
exports, one rule.

- One private helper alongside `fetchStats`, differing only in what it keeps. Do **not** add a flag
  to `fetchStats` — see the warning below.
- Same TTL rule — reuse `statsTTL(week, currentNflWeek)` (current week 60 min, completed weeks
  7 days).
- A row with `opponent == null` means that team is on bye; `TEAM_*` rows appear in the **stats**
  payload (32 per week) but **not** in the projections payload (verified: 0 of 9421 week-3 rows).
  Both are normal, neither is an error.
- **No wasted fetch and no duplicate storage in practice.** `stat-rows/*` looks like it duplicates
  `stats/*`, but the two never cover the same week: `getSeasonTotals` populates `stats/*` only for
  seasons `2012..currentSeason-1` (`sleeperStats.js:102`, and `loadCareerHistory`'s
  `s < currentSeason` loop), while `/week` reads the in-progress season alone. Say so in the
  header, or a later reader will "dedupe" them and reintroduce the stripped-metadata bug.
- Volume is unchanged from the brief's estimate: weeks `1..currentWeek` — 2 calls today, 18 by
  season end, all but the current week served from cache at the 7-day TTL.

**Context Session 2 will otherwise trip over:** `getWeeklyStats` and `getWeeklyProjections` have
**no call sites anywhere in `src/`** today (verified 2026-09-21). `getSeasonTotals` fetches the same
URL through its own inline `fetchStats` call (`:167,172`), not through the exported wrapper. So the
brief's "`getWeeklyStats`/`getWeeklyProjections` already exist with the right TTL behaviour" is true
about the *helpers*, not about a live call path — nothing regresses if `/week` does not use them.

**Do not delete them in this slice.** Removing dead exports is unrelated to the feature and would
put an unreviewed deletion in a diff that is already large. Note in the hand-back that the slice
leaves four weekly-fetch exports of which two have no callers, so it can be dispositioned on its
own.

---

## §2 `src/utils/blendWeights.js` — new, pure, leaf module

The weight panel's whole content. No React, no I/O.

```js
export const SIGNAL_FAMILIES = [
  { key: 'fpa',   label: 'Points allowed by position', k: 3, dropGames: 9,    dropWeek: null },
  { key: 'epa',   label: 'Offensive / defensive EPA',  k: 5, dropGames: null, dropWeek: 12 },
  { key: 'rates', label: 'Pass rate, PROE, red zone',  k: 7, dropGames: null, dropWeek: 14 },
  { key: 'pace',  label: 'Pace',                       k: 8, dropGames: null, dropWeek: 14 },
]

export function blendWeight(n, k)        // n/(n+k); null for n == null or k <= 0; 0 for n === 0
export function buildWeightPanel(n)      // → [{ key, label, k, dropGames, dropWeek, weight, pct }]
```

- `weight` is the fraction, `pct` the rounded whole percent the bar and label render.
- `n` is **games played**, not the week number. At week 2 with one game in the book, `n = 1`.
  Resolve it once in the hook (§5) and pass it down; do not let two panels compute it differently.
- `n = 0` (week 1 of a new season, artboard 9c) → every `pct` is 0. That is the 9c state and it is
  produced by the data, not by a branch.
- **`fpa` is the only enforced family, and its row must not be hand-written.** Set both fields from
  W0's exports — `k: PRIOR_WEIGHT_GAMES`, `dropGames: FPA_PRIOR_DROP_GAMES` — imported, never
  literals. Two tests, not one: `fpa.k === PRIOR_WEIGHT_GAMES` **and**
  `fpa.dropGames === FPA_PRIOR_DROP_GAMES`. A literal here is how W0's constant and this panel
  drift until the panel lies about the blend beneath it.
- **`dropGames` vs `dropWeek` is deliberate, not sloppy.** `fpa` drops on games played, because that
  is the axis `buildFpaTable` enforces on (W0 §2.2); rendering "all wk 10" over a nine-game rule is
  wrong for any defence with an early bye. The other three families carry `dropWeek` because they
  are **display-only today** (parent §3) — nothing computes them, so there is no enforced axis to
  match. The panel renders `all {dropGames} gm` or `all wk {dropWeek}`, whichever the row carries;
  never both, never a fabricated conversion between them. Say all of this in the module header.

---

## §3 `src/utils/weeklyUsage.js` — new, pure, leaf module

The four usage shares, all from one Sleeper weekly payload. This module is why the lineup panel has
**no data-store dependency** and cannot be blocked by an ingest job — state that in the header.

```js
export function buildTeamAggregates(weekRows)
// weekRows is a getWeeklyStatRows map. Picks out the 32 `TEAM_<abbr>` rows →
// { [abbr]: { passAtt, rushAtt, offSnp } }, abbr WITHOUT the prefix, Sleeper domain.
// A team absent from the map did not play that week — that is the bye signal (W2 §5 reuses it).

export function accumulateUsage(weeklyMaps, playerId)
// weeklyMaps: [{ week, rows, teamAggregates }] for weeks 1..currentWeek-1 (played weeks only),
// where `rows` is a getWeeklyStatRows map — { [player_id]: { stats, team, opponent } }.
// Sums the player's carries/targets/receptions and the team's attempts/snaps ACROSS the window,
// then divides once. Never averages per-week shares — that is the same "never sum or average a
// stored rate" trap in its counting-component form.
//
// NO `team` PARAMETER. The player's team for week w is `rows[playerId].team` — that week's own row,
// which is why §1 fetches every week through getWeeklyStatRows rather than getWeeklyStats. A
// mid-season trade then divides each week's carries by the team he actually played for. Fixing one
// team across the window, or falling back to playerMap[id].team, silently divides a traded player's
// whole season by the wrong denominator — a wrong number, not an empty cell. W2 §3's bye rule reads
// the same field; keep the resolution in this one module and export it if the grid needs it.

export function computeUsageShares(totals, position)
// → { rush, target, touch, snap }, each number (0..1) | null
```

**Definitions** (Sleeper keys, all verified present in the week-1 2026 payload):
- `rush` = player `rush_att` ÷ team `rush_att`
- `target` = player `rec_tgt` ÷ team `pass_att`
- `touch` = (player `rush_att` + player `rec`) ÷ (team `rush_att` + team `pass_att`)
- `snap` = player `off_snp` ÷ player's own `tm_off_snp` (**not** the team aggregate row — the
  per-player `tm_off_snp` is the authoritative denominator and was verified identical across every
  player on a team, 0 teams disagreeing)

**Position gating**, matching the design: `rush` is `null` for WR/TE (the design renders `—` with no
"was" line); `target` is `null` for QB. Do not compute a share the design deliberately leaves blank.

**The null-vs-zero rule — parent §1.1, and the single most important line in this module:**

| player row state | `snap` |
|---|---|
| `off_snp` present, `tm_off_snp` present | the ratio |
| `off_snp` **absent**, `tm_off_snp` present, `gp === 1` | **`0`** — active, took zero offensive snaps |
| `gp` absent / no `tm_off_snp` | `null` — did not play, no observation |

36 week-1 skill rows are in the middle case. Rendering them `—` says "we don't know" about a player
we know was inactive on offence — the opposite reading for a start/sit call. Test all three rows
explicitly.

**Footnote copy the table must carry** (the design's own wording is wrong on two counts and this
supersedes it): `pass_att`/`rush_att` are **attempts, not plays** — they exclude sacks and include
kneels. Target share over team pass attempts is the conventional definition anyway; say that rather
than implying play-share precision. The design's footnote also says SNAP is dark because `off_snp`
is a yearly job; that is false for the Sleeper weekly payload (parent §1.1) and must not be shipped.

---

## §4 `src/utils/weeklyLineup.js` — new, pure, leaf module

Assembles the ten rows. Takes already-resolved inputs; fetches nothing.

```js
export function buildWeeklyLineup({
  myPlayers,        // [{ player_id, full_name, position, team }] — see the id-shape note below
  rosterPositions,  // league.roster_positions
  projections,      // getWeeklyProjectionRows result for the current week
  scoringSettings,
  usageByPlayer,    // { [id]: { rush, target, touch, snap } }
  formByPlayer,     // { [id]: [number|null, number|null, number|null] } last 3, oldest first
  fpaTable, fpaRanks,
})
// → { slots: [...], projSeasonWeek }
```

- **Map `id` → `player_id` before calling `buildBestLineup`.** `leagueData.rosterTeams[*]`'s
  enriched players key on **`id`** (`App.jsx:813`), while `buildBestLineup` reads **`p.player_id`**
  (`lineup.js:49-55`). Passing the roster shape through unmapped does not error — `player_id` is
  `undefined` for every entry, the `seen` Set dedupes on `undefined`, and **the whole roster
  collapses to a single player**. `buildLeagueLineups` (`lineup.js:174`) does this remap for exactly
  this reason; do it the same way and do not "simplify" it away.
- **Reuse `buildBestLineup(players, rosterPositions, getPoints)` from `src/utils/lineup.js`.** It
  already solves the slot-fill optimally including `SUPER_FLEX`, returns
  `{ slot, player_id, name, position, points }` in `startingSlots(rosterPositions)` order, and
  handles `null` points (nulls last, ties by id). Do not re-implement slot eligibility and do not
  export `SLOT_ELIGIBILITY` — `buildBestLineup` is the better reuse and `SLOT_ELIGIBILITY` is
  private for a reason.
- `getPoints` scores the projection in **league settings** via
  `calculateFantasyPoints(row.stats, scoringSettings)` — **not** `stats.pts_half_ppr`. The
  projections payload carries full components (`pass_yd`, `rush_att`, `rec`, …; verified), so the
  league's own scoring applies, per the "Fantasy points computed weekly" invariant.
- **The missing-row branch must be explicit:**

  ```js
  const getPoints = p => {
    const row = projections[p.player_id]
    if (!row?.stats) return null          // no projection published — absent, not zero
    return calculateFantasyPoints(row.stats, scoringSettings)
  }
  ```

  `calculateFantasyPoints({}, scoring)` returns **`0`**, not `null` (`fantasyPoints.js:12-21` — it
  starts `total = 0` and skips absent keys). `0` is finite, so `buildBestLineup` sorts an
  unprojected player **above** every genuine `null` and can start him over a real option. Returning
  `null` explicitly is the only thing that makes the "nulls last" ordering mean what it says. Test
  this case; it is the flag most likely to survive into the running app unnoticed.
- **Opponent** comes from `projections[id].opponent`. Absent → that player's team is on bye this
  week: render the opponent cell as a bye, not as `—`, and keep the row in its slot.
- **ALLOWS** = `fpaTable[oppTeam]?.[position.toLowerCase()]`, rank from `fpaRanks`. `fpaTable` is
  keyed **era-accurate**; `opponent` from the projections payload is **Sleeper domain**. These
  differ for LAR/LAC/LV. Apply `normalizeTeamForSchedule` from `src/utils/nflStats.js` at this one
  join — do not hand-roll a remap, and do not skip it because 2026 codes happen to agree for 29 of
  32 teams. This is the CR-16 hazard in its silent form: an ungated join yields `—`, not an error.
- **Blend weight per row** = `blendWeight(fpaTable[oppTeam].weights[pos], PRIOR_WEIGHT_GAMES)`,
  clamped to 1 when `gCur >= FPA_PRIOR_DROP_GAMES`. Import both constants from `opponentStrength.js`;
  do not re-declare them.
- **Form** = the player's fantasy points in the last three *played* weeks, scored in league settings
  via `calculateFantasyPoints` on each week's raw stats. Fewer than three played weeks → leading
  `null`s, which the bars render as dashed outlines. Never pad with `0`.
- Every numeric field is `number | null`. No field is ever `0` standing in for absent.

---

## §5 `src/hooks/useWeeklyDecision.js` — new

The one orchestration point.

**Why a hook and not App.jsx state.** "App.jsx owns all domain/pipeline state" is an invariant, and
every nflverse side-load named beside it — `teamContextByYear`, `gameLogsByYear`,
`nflScheduleByYear`, `currentSeasonTotals` — is App.jsx-owned (`App.jsx:184-190,1009`). This hook is
**not** an exception to that rule; it is the same pattern as `src/hooks/useTeamHistoryLoader.js`,
the in-repo precedent for a route-scoped loader that no other surface consumes, extracted to a hook
so its dedupe/merge logic is unit-testable without mounting the whole app. Nothing it loads feeds
the `playerRows` pipeline, reaches another route, or outlives `/week`. Cite `useTeamHistoryLoader`
by name in the hook's header — unnamed, this reads as the invariant routed around rather than
followed, which is how a reviewer will read it too.

Inputs: `{ season, currentWeek, myPlayers, rosterPositions, scoringSettings, careerStats,
currentSeasonTotals }`.

1. Fetch `getWeeklyStatRows(season, w, currentWeek)` for `w` in `1..currentWeek` — **not**
   `getWeeklyStats`, which strips the `team` field §3 and W2 §3 resolve per week (§1). Two calls
   today, 18 by season end, all but the current one served from cache at a 7-day TTL. Sequential or
   `Promise.allSettled` — **not** `Promise.all`; one rejected week must not lose the batch, the same
   reasoning as App.jsx's teamContext effect (:1000-1009).
2. Fetch `getWeeklyProjectionRows(season, currentWeek, currentWeek)` — one call.
3. Build `fpaTable`/`fpaRanks`. **Resolve both halves exactly as the two shipped call sites do** —
   `Teams.jsx:129,151-156` and `Portfolio.jsx:369-373` — or this slice re-creates the
   two-numbers-for-one-defence split W0 exists to close:

   ```js
   const dataSeason = deriveDataSeason(careerStats)                 // NOT season - 1
   const currentSeason = currentSeasonTotals?.complete ? currentSeasonTotals.season : null
   const fpaTable = buildFpaTable({
     priorRows: careerStats?.[dataSeason] ?? null,
     currentRows: currentSeason != null ? currentSeasonTotals.players : null,
   })
   ```

   Two things here are load-bearing and both were wrong in an earlier draft:
   - **`deriveDataSeason(careerStats)`, never `season - 1`.** They coincide today and diverge the
     moment a season is missing from `careerStats` — and the divergence is a different blended
     number for the same defence on `/week` than on `/teams`, with nothing on screen to explain it.
   - **Gate `currentRows` on `complete`, never on key presence.** An absent key and a
     resolved-but-empty year both read as "nothing there" (CLAUDE.md §State and data flow), and
     `currentSeasonTotals?.players ?? null` would pass `{}` through as though it were data.
     `complete` is the loader's own single answer; do not derive a second one locally — the comment
     at `Teams.jsx:136-144` explains what happened last time two derivations disagreed.

   **Pass row maps straight through. Never synthesise `{ ...careerStats, [season]: rows }`** — that
   is the exact coupling the signature exists to avoid (`opponentStrength.js` header;
   in-season-app-read.md §4).
4. Derive `n` = games played, once, for the weight panel: the max `gamesPlayed` across the DEF rows
   of `currentSeasonTotals.players`, falling back to `currentWeek - 1` when that map is empty.
   Document which it used — the panel's honesty depends on `n` being real.
5. Returns `{ weights, lineup, loading, error }` plus the raw weekly maps W2 will consume.

**React Strict Mode double-fires** — every async effect that writes state checks a `cancelled` flag
before the setter. This is an invariant, not a style note.

Degraded paths, all of which render rather than throw: no league selected, empty roster, Sleeper
fetch failure for one week (drop that week, keep the rest), `currentWeek === 1` with zero played
weeks (artboard 9c — weights all 0%, usage all `—`, lineup still fills and ranks on projection
alone).

---

## §6 Components — `src/components/week/`

Presentational, props-only, no fetching. Dark theme only; colour tokens from `index.css`'s `@theme`,
never literals from the design HTML.

- **`WeekView.jsx`** — route container. Header: "This week", then
  `Week {n} · {season} · {myTeamName} · {league format}`. Stacks the panels. W2 adds three more
  children here.
  **No `vs {opponent}` clause.** The design's header names the week's league matchup, but nothing in
  `leagueData` carries it: `weeklyScores` is built from completed weeks only (`App.jsx:790-805`) and
  neither `rosterTeams` nor `standings` holds a schedule. v1 omits it rather than adding a Sleeper
  matchups fetch for a line of chrome (Anton, 2026-09-21) — a deliberate departure from 9a, not an
  oversight. Do not substitute a placeholder, and do not add the fetch.
- **`WeightPanel.jsx`** — "How much of this is 2026". One row per `SIGNAL_FAMILIES` entry: label,
  bar, percent, then the threshold cell — `k {k} · all {dropGames} gm` when the row carries
  `dropGames`, `k {k} · all wk {dropWeek}` when it carries `dropWeek`. **Never both, never a
  conversion between them, and never `all wk null`** — which is what a `dropWeek`-only row spec
  renders for the `fpa` family (§2). Header right: `n = {n} GAME(S) · w = n / (n + k)`.
  Footnote, from the design and true as written: the residual shrinks toward league average, not
  toward last year's team; a signal at its "all" week drops the prior term entirely.
- **`LineupTable.jsx`** — ten rows, column groups OPPONENT DEFENCE / USAGE / SCORING per 9a. Per row:
  slot, team chip + name + role, opponent + record, ALLOWS (value, rank of 32, weight bar), four
  usage shares each with last season's beneath in grey, last-3 form bars + text, PROJ.
  Two footnotes: the ALLOWS disclosure (Sleeper's half-PPR `fan_pts_allow_*` basis, **not** this
  league's scoring; rank 1 = toughest of 32) and the usage-definition footnote from §3.

**Colour bands, not gradients** — the design's `allowsC` buckets at rank ≥27 / ≥23 / ≤6 / ≤10 / else.
Season-long reliability of points-allowed is ~0.2; coarse bands are the honest encoding and the
weight bars are the feature's credibility. **Do not value-engineer either out.**

`role` ("WR1", "QB1 · rookie") has no source in this slice —
`PROVISIONAL(no-data)`, render nothing rather than a guess. Depth-chart order arrives around week 6.
Same for the opponent's W-L record if no source is wired: omit it rather than fabricate.

---

## §7 Route and nav

- `src/App.jsx`: `<Route path="/week" element={<WeekView … />} />`, placed with the other primary
  routes (before the `/board` block). Props-only, exactly as `/teams` is. Pass `careerStats`,
  `currentSeasonTotals`, `leagueData.rosterTeams`, `leagueData.rosterPositions`,
  `leagueData.scoringSettings`, `leagueData.playerMap`, `nflState`, `myTeamName`.
- `src/components/shell/navItems.js`: `{ key: 'week', label: 'This week', path: '/week' }` as the
  **first** entry in `PRIMARY_NAV` (`:6-10`) and first in the MANAGE group via `byKey('week')`
  (`:37`) — ahead of My Team. Four items, within `BottomTabBar`'s cap of 5.
  **`DEFAULT_ROUTE` is unchanged** (Anton, 2026-09-20). `NAV_GROUPS` uses `byKey` deliberately —
  do not index positionally; `byKey` throws on a missing key, which is the intended failure.

---

## §8 Tests

Unit (co-located `*.test.js`):
- `blendWeights.test.js` — `n/(n+k)` at n=0/1/8/17; `n = null`; **both** cross-checks from §2
  (`fpa.k === PRIOR_WEIGHT_GAMES` and `fpa.dropGames === FPA_PRIOR_DROP_GAMES`), and that the `fpa`
  row carries no `dropWeek` while the other three carry no `dropGames`.
- `sleeperStats` — `getWeeklyStatRows` preserves `team`/`opponent` on the **cache-hit** path as well
  as the network path (the `fetchStats` trap in §1 only bites on the second load, so a
  network-only test passes under the bug).
- `weeklyUsage.test.js` — the four definitions on a hand-built payload; the three-row snap table
  from §3 **each asserted separately**; position gating (`rush` null for WR, `target` null for QB);
  accumulation across a window equals summed-then-divided, **not** the mean of weekly shares (build
  a fixture where the two differ, or the test proves nothing); a team absent from the payload;
  **a player whose team changes mid-window** divides each week by that week's own team, read from
  that week's `rows[playerId].team` (build it so both a fixed-team implementation and a
  `playerMap`-fallback implementation give a visibly different answer).
- `weeklyLineup.test.js` — slot fill matches `buildBestLineup`; **a roster passed in the
  `rosterTeams` `id` shape fills all ten slots rather than collapsing to one** (the §4 remap — assert
  the slot count, which is what an unmapped shape destroys); **a player with no projections row
  scores `null`, not `0`, and is started only when no projected player is eligible** (assert the
  ordering against a projected player scoring `0.0`, or the case passes under the bug); a bye opponent renders as a bye not `—`; the `normalizeTeamForSchedule`
  hop resolves an LAR opponent against the era-accurate `fpaTable` (assert a real value, not `—`);
  weight clamps to 1 at `gCur >= FPA_PRIOR_DROP_GAMES`; form with one played week yields two leading
  `null`s and no zeros.

Guard — **`src/__tests__/weeklyDecisionViewOnly.test.js`**, new. Model on
`currentSeasonTotalsIsolation.test.js`: read each pipeline module's source and assert it references
none of `blendWeights`, `weeklyUsage`, `weeklyLineup`, `useWeeklyDecision`, `getWeeklyStatRows`,
`getWeeklyProjectionRows`. **Both** new exports, not just the projections one — `getWeeklyStatRows`
is the fetch every played week now goes through, so omitting it leaves the widest new surface
unguarded.
**Reuse that file's `PIPELINE` list verbatim** (14 modules) — a missed module is a hole in the
contract. Also assert no `src/components/week/` module is imported outside `src/components/week/`,
`src/App.jsx` and its own tests.

---

## §9 Cross-repo impact

**CR-21 · In-progress season-totals reads is triggered by this slice.** An earlier draft claimed no
contract was touched; the plan gate corrected it (2026-09-21). §5.3 passes
`currentSeasonTotals.players` into `buildFpaTable`'s `currentRows` — a named Trigger
(`docs/cross-repo-registry.md:243`) — and §5.4 reads the DEF rows' own `gamesPlayed` as the
partial-season signal, which is the other half of the same entry's invariant. No data-repo file,
schema, floor, cadence or manifest family changes; the obligation is emission.

> **Mirror:** If the weekly job stops running, starts writing partial weeks under a different
> marking, or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will
> render a half-season's rates as though they were a season's, with no error and no test failure.
> The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a
> partial season validates; that means **the validator no longer distinguishes "early season" from
> "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any
> change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See
> CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that
> entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

Do **not** edit `docs/cross-repo-registry.md` to add this call site — mirrored region, CR-24
byte-identity, see W0 §6. Backlog it.

Beyond CR-21, this slice adds no data-store reader at all — every other byte it reads comes from the
live Sleeper API.

One adjacency worth recording, which is **not** a Mirror obligation: this slice makes the app a
consumer of `TEAM_<abbr>` aggregate rows and (via W0's table) `fan_pts_allow_*` on the **live API**,
which is the same shape CR-20 protects in the **stored** `nfl/season-totals/<year>.json`. CR-20's
invariant covers the store, not the API, so a data-repo change cannot break this panel — but the
converse is worth noting in the hand-back: if `prunePlayerStats` ever drops `TEAM_*` rows from the
store, `/week` would keep working while every stored-path consumer degraded, which makes the
breakage *harder* to notice, not easier. Append that observation to
`.claude/tasks/data-repo-backlog.md` per done-definition item 7. It blocks nothing.

CR-20 is **not** triggered here: W0 already made every change to `opponentStrength.js` and emitted
that Mirror, and this slice only calls the functions it exports.

---

## §10 Done-definition

Standard (CLAUDE.md), plus:
- Smoke `/week` in the running app via `.claude/launch.json`, not a backgrounded `npm run dev`.
  Today is **2026 week 2**, so this is artboard 9a exactly: expect `n = 1`, the fpa weight at
  `1/(1+3) = 25%`, one-game usage shares, form bars with two dashed and one filled. Report the ten
  slots, one full row's numbers, and confirm no `NaN`, no `—` where a value was verified present,
  and no collapsed layout. A screenshot from Claude is not sign-off.
- Verify the SNAP column renders real percentages for a named starter and `0%` (not `—`) for a
  known special-teamer — that is the parent §1.1 finding, and it is the one thing most likely to
  ship wrong.
- `grep -rn "PROVISIONAL(" src/` output in the hand-back.
