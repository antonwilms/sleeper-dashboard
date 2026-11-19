# Brief W — This week: matchup header, start/sit flags, status tags (W1); visuals (W2, outline)

**Status:** planning artifact (Session 1, opus). This session edited no source or doc files.
**Review depth: full — new network call (live-week `getMatchups`), new state in a route-scoped hook, route container layout change.**
**Session 2:** sonnet, effort medium. Runs the app from `.claude/launch.json` (`sleeper-dashboard`) for the visual check, stops it when done.
Brief written at app HEAD `9925193`; planned against live source at `6d6e160`. Every anchor below was re-read at `6d6e160`.

---

## Decisions recorded

**D1 — Strategy (Anton, 2026-11-19).** Own-roster start/sit moves from "deferred, gated on an
in-season model" to **"lightweight helper now"**. The flags compare Sleeper's weekly projection
(PROJ), with our OURS number shown beside it; they never auto-pick, and use no dynasty score, KTC or
ROS. Model-driven lineup advice stays deferred. Docs: §Docs updates 1–3.

**D2 — Display rule (Anton, 2026-11-14).** Facts lead. One-step aggregates are fine if checkable
from numbers on screen. Signals show the numbers behind them and never pick for the user. OURS stays
visible and labelled as ours beside the fact it predicts. Dynasty score and "vs market" never drive
a default sort, headline or flag.

**D3 — Status colour within the current palette (planner call, flag to Anton).** The brief asks for
Q amber, D/Out/IR red. The dp palette (`src/index.css` `@theme`, lines ~217–231) has only the
blue `dp-up-*` / orange `dp-down-*` pair — no red or amber dp token — and W2 §6 owns the new step
palette. W1 therefore separates severity by **fill**, not hue: Questionable = outlined orange chip;
Doubtful/Out/IR/PUP/Sus/other = filled orange chip (today's look). Readable without colour (the
label text differs). W2 may re-tone it with the new tokens.

**D4 — My side's totals come from the lineup table, the opponent's from the matchup row.** My PROJ
total is the sum of the PROJ cells of my starter rows (`lineup.starters[].points`), so it is
checkable against the table directly beneath. The opponent's starters come from the live matchup
row's `starters`. If Sleeper's roster cache and matchup cache disagree on my lineup, the header
follows the table; documented, not reconciled.

**D5 — Incomplete totals are labelled, never zero-filled.** Both PROJ and OURS totals sum only
values that exist and show `{valued} of {slots} projected` / `valued` when any slot lacks one (an
empty slot counts in `slots`, never in `valued`). The brief asked this for OURS; it is extended to
PROJ for the same `null ≠ 0` reason. The PROJ margin renders only when both sides are complete.

**D6 — Opponent OURS is out of scope** (not trivial: `buildOwnProjections` needs full lineup rows
with team/bye/QB role). The opponent's OURS cell renders `—` with a title saying OURS is computed
for your roster only.

**D7 — No scoring, snapshot or cross-repo impact (confirmed).** Nothing here reaches
`projectedPPG`, the dynasty score, `factors`, `rescoreSeasonTotals`, `projectionSnapshot.js` or a
`docs/cross-repo-registry.md` site. `getMatchups`'s existing TTLs are reused unchanged. Weekly
projections are scored with `calculateFantasyPoints(weekStats, scoringSettings)` through
`hasScoringProjection`'s gate — the per-week path the fantasy-points invariant allows.
`injury_status` is read live for display only, never captured.

**Plan-review round 1 → revision 1 (Anton, 2026-11-19).** Changed sections: §1b (header comment
names OI-1; `mine.ours` PROVISIONAL tag), §1d (`POINTS · Sleeper` row replaces `LIVE`; zero-flag copy
states what was checked; OURS-total tag), §2a (`via` field; rules 2–5 — the one-swap check), §2b
(swap flag text; OURS-clause tag; legend sentence), tests T4, T5b (new), T10, T11, T12b (new), T18–T19
(new `WeekView.test.jsx`), §W1 risks, Docs update 6 (`injuryStatus.js` row), Done-definition
PROVISIONAL line, and the new **Open items** section (OI-1). Everything else is unchanged.
Light re-review: one flag (T18 heading case), applied with the T5b(e) assertion fix; no further
round (Anton). **Plan approved by Anton 2026-11-19; kept as one file (~47 KB) by his decision.**

---

## W1 — scope and touch list

| File | Change |
|---|---|
| `src/utils/lineup.js` | export `SLOT_ELIGIBILITY` (one word: `const` → `export const`, line 8). Nothing else. |
| `src/utils/weeklyLineup.js` | export `projectedPoints(stats, scoringSettings)`; `buildRow` uses it; rows gain `injuryStatus`, `injuryBodyPart` |
| `src/utils/weeklyMatchup.js` | **new**, pure — pairing, opponent PROJ sum, header shape |
| `src/utils/weeklyStartSit.js` | **new**, pure — start/sit flags |
| `src/hooks/useWeeklyDecision.js` | live-week matchups effect; returns `matchup`, `startSit` |
| `src/components/week/MatchupHeader.jsx` | **new**, presentational |
| `src/components/week/WeekView.jsx` | new props; MatchupHeader in the right slot; WeightPanel into the legend |
| `src/components/week/LineupTable.jsx` | flag sub-line; status chip from the row; `legendLead` slot |
| `src/components/dp/cells.jsx` | new `StatusChip` |
| `src/App.jsx` | two props on `<WeekView>` (lines 1490–1500) |
| tests | see §W1 tests |
| docs | see §Docs updates |

Out of W1: anything in W2; Portfolio's own `StatusCell` (left as is — W2's shared player cell
consolidates); `DefencesFaced`, `OffencesOwned`, `SeasonGrid`; OURS math.

### Copied definitions

**None created.** Eligibility is imported from `lineup.js`; the empty-slot sentinel from
`rosterSlots.js`'s `isFilledSlotId`; projection scoring from `weeklyLineup.js`'s new
`projectedPoints`; the out-status list from `weeklyOwnProjection.js`'s `OUT_STATUSES` (imported by
the hook, which is already its only allowed importer, and passed in as a parameter).

---

## §1 Matchup header

### 1a. `src/utils/weeklyLineup.js`

Add, above `buildRow`, and use it in `buildRow` in place of the inline expression at lines 116–118:

```js
// The one scoring path for a weekly projection row, shared by the lineup rows and the matchup
// header's opponent total (weeklyMatchup.js) so the two can never score differently.
export function projectedPoints(stats, scoringSettings) {
  return hasScoringProjection(stats, scoringSettings)
    ? calculateFantasyPoints(stats, scoringSettings ?? {})
    : null
}
```
`buildRow`: `const points = projectedPoints(projRow?.stats, scoringSettings)`. Behaviour unchanged.

Rows also gain two fields (read from the `pmEntry` `buildRow` already resolves):
`injuryStatus: pmEntry?.injury_status || null`, `injuryBodyPart: pmEntry?.injury_body_part || null`.
`emptyRow` gains both as `null`. (Live display only; never captured.)

### 1b. `src/utils/weeklyMatchup.js` (new, pure, view-only)

Imports exactly: `./weeklyLineup` (`projectedPoints`), `./rosterSlots` (`isFilledSlotId`).
Header comment: cite this task file; state that the live week's matchups are read for display only
and that a missing pair is stated, never filled; and that `pairMatchup` intentionally differs from
App.jsx's completed-weeks `weeklyScores` grouping (which can pair two `null` matchup_ids) — open
item OI-1 in this task file, fixed separately.

```js
// rows: the Sleeper /league/{id}/matchups/{week} array — [{ roster_id, matchup_id, starters, players, points, ... }]
export function pairMatchup(rows, myRosterId)
// → { mine: row|null, opponent: row|null, reason: null | 'no-matchup' | 'unpaired' }
```
- `mine` = the row with `roster_id === myRosterId` (`null` if none).
- `mine == null` or `mine.matchup_id == null` → `{ mine, opponent: null, reason: 'no-matchup' }`.
  **A `null` matchup_id never pairs with another `null`** (bye / eliminated / median-only rows all
  carry `null`; grouping them by key would invent an opponent).
- `others` = rows with the same `matchup_id` and a different `roster_id`. Exactly one →
  `{ mine, opponent: others[0], reason: null }`; otherwise `{ mine, opponent: null, reason: 'unpaired' }`.
- Independent of array order.

```js
export function sumStarterProjection(starterIds, projections, scoringSettings)
// → { total: number|null, valued: int, slots: int }
```
- `slots = (starterIds ?? []).length`. For each id with `isFilledSlotId(id)`, `p = projectedPoints(projections?.[id]?.stats, scoringSettings)`;
  finite `p` adds to `total` and `valued`. `total` is `null` when `valued === 0`.
- Reads **only** `starterIds` (the matchup row's `starters`), never `players`.

```js
export function sumRows(rows, valueOf)
// → { total: number|null, valued: int, slots: int } — slots = rows.length; finite valueOf(row) sums; null when none
```
(Used for my PROJ — `r => r.points` — and my OURS — `r => ownByPlayer[r.player_id]?.value`; an empty
row has `player_id: null` and contributes to `slots` only.)

```js
export function buildMatchupHeader({
  matchups,          // { status: 'idle'|'loading'|'loaded'|'failed', rows: [] }
  myRosterId, rosterTeams, standings,
  starters,          // lineup.starters
  ownByPlayer, projections, scoringSettings, week,
})
```
returns
```js
{
  week,
  status: 'loading' | 'ready',                 // 'loading' iff matchups.status === 'loading'
  reason: null | 'no-league' | 'fetch-failed' | 'no-matchup' | 'unpaired',
  mine: Side,
  opponent: Side | null,                       // non-null iff reason === null
  live: boolean,                               // either side's points finite and !== 0
  projMargin: number | null,                   // mine.proj.total − opponent.proj.total, only when both
                                               // sides have valued === slots (and opponent non-null)
}
Side = {
  rosterId, teamName: string|null, record: { wins, losses, ties } | null,
  proj: { total, valued, slots },
  ours: { total, valued, slots } | null,       // null for the opponent (D6)
  points: number | null,                       // the matchup row's `points`; null without a row
}
```
- `matchups.status === 'idle'` (no league id / roster id) → `reason: 'no-league'`; `'failed'` →
  `'fetch-failed'`; `'loaded'` → `pairMatchup`'s reason.
- Names from `rosterTeams.find(t => t.rosterId === id)?.teamName`; record from
  `standings.find(s => s.rosterId === id)` → `{ wins, losses, ties }`.
- `mine.proj = sumRows(starters, r => r.points)`; `mine.ours = sumRows(starters, r => ownByPlayer?.[r.player_id]?.value)`.
  The `mine.ours` line carries
  `// PROVISIONAL(heuristic): OURS starters' total · sums weeklyOwnProjection.js's heuristic values, not a model verdict · a fitted, graded weekly model would make it real`.
- `opponent.proj = sumStarterProjection(opponentRow.starters, projections, scoringSettings)`.

### 1c. `src/hooks/useWeeklyDecision.js`

New params (defaults keep existing callers/tests working): `leagueId = null`, `rosterTeams = []`,
`standings = []`. `myRosterId = myTeam?.rosterId ?? null`.

New state `const [matchups, setMatchups] = useState({ status: 'idle', rows: [] })` and a third
effect, same pattern as the stat-rows effect (nested async `load`, `cancelled` flag checked before
**every** setter, cleanup sets it):
- `!leagueId || myRosterId == null || !currentWeek` → `setMatchups({ status: 'idle', rows: [] })`, return.
- else `setMatchups({ status: 'loading', rows: [] })`, then
  `getMatchups(leagueId, currentWeek, currentWeek)` (from `../api/sleeper`; the third argument makes
  it the live week → the existing 60-min TTL) → `{ status: 'loaded', rows: Array.isArray(r) ? r : [] }`;
  rejection → `{ status: 'failed', rows: [] }`.
- deps `[leagueId, myRosterId, currentWeek]`.
- A matchups failure does not touch `error`, `loading` or `failedWeeks` — the lineup renders regardless.

Memos (after `ownByPlayer`):
```js
const matchup = useMemo(() => buildMatchupHeader({ matchups, myRosterId, rosterTeams, standings,
  starters: lineup.starters, ownByPlayer, projections, scoringSettings, week: currentWeek }), [...])
const startSit = useMemo(() => buildStartSitFlags({ starters: lineup.starters, bench: lineup.bench,
  ownByPlayer, unavailableStatuses: START_SIT_UNAVAILABLE }), [lineup, ownByPlayer])
```
with, at module level, `import { ..., OUT_STATUSES } from '../utils/weeklyOwnProjection'` and
`export const START_SIT_UNAVAILABLE = [...OUT_STATUSES, 'Doubtful']` (comment: a starter listed
Doubtful or worse is flagged when a bench player has PROJ; a bench player listed so is never offered).

Return object gains `matchup`, `startSit`. Header comment's "Degraded paths" paragraph gains: no
league id / no head-to-head pair / matchups fetch failure → the header states why and shows my side
only.

### 1d. `src/components/week/MatchupHeader.jsx` (new, presentational, props-only)

Props: `{ matchup, startSit, loading }`. Card styled like the other `/week` cards
(`bg-dp-card border border-dp-border rounded-[12px]`). `data-testid="matchup-header"`.

- Title row: `Week {week} matchup`. `matchup.status === 'loading'` → one muted line `Loading matchup…`
  and nothing else.
- Two columns, mine (`data-testid="matchup-mine"`) and opponent (`data-testid="matchup-opponent"`,
  **rendered only when `matchup.opponent` is non-null**). Each: team name; record `W-L` or `W-L-T`
  (ties > 0), `—` when `record` null; then labelled rows:
  - `PROJ · Sleeper` — `total.toFixed(1)`, or `—` when `total` null; when `valued < slots` a muted
    sub-line `{valued} of {slots} projected`.
  - `OURS · ours` — mine as PROJ (sub-line `{valued} of {slots} valued`); opponent `—` with
    `title="OURS is computed for your roster only"`. The render site carries
    `// PROVISIONAL(heuristic): OURS total in the matchup header · renders the sum of weeklyOwnProjection.js's heuristic, not a model verdict · a fitted, graded weekly model would make it real`.
  - `POINTS · Sleeper` row (`data-testid="matchup-live"`) only when `matchup.live`: each side's
    `points.toFixed(1)`, with one muted sub-line under the row: `Sleeper's matchup points as of the last load — can be up to an hour old`.
    The word `LIVE` is not used (the read is cached up to 60 min and stays shown after games are
    final). The TTL is unchanged.
- `projMargin != null` → one line `PROJ margin {+|−}{abs.toFixed(1)}` (U+2212 for minus), neutral
  text colour (a checkable difference of the two totals above it, not a verdict).
- `matchup.reason != null` → muted line (`data-testid="matchup-reason"`):
  - `no-league` — `No league selected — opponent not shown.`
  - `fetch-failed` — `This week's league matchups didn't load — opponent not shown.`
  - `no-matchup` — `Sleeper lists no head-to-head opponent for you this week (bye, eliminated, or median-only).`
  - `unpaired` — `Sleeper's matchup for you this week has no single opponent — not shown.`
- Lineup-flags line (`data-testid="startsit-summary"`), hidden while `loading` (the lineup's own
  loading flag):
  - `flags.length > 0` → a `<button type="button">` `{n} lineup flag{n===1?'':'s'}` + muted
    ` · basis: Sleeper PROJ`. Click: `document.getElementById(\`startsit-flag-${flags[0].slotIndex}\`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
  - `0` flags and `startSit.basisAvailable` → states what was checked, not a verdict:
    `No bench player projects higher (Sleeper PROJ) for a slot he can fill, directly or with one starter moved`
    plus, when `uncheckedSlots.length`, ` · ${uncheckedSlots.join(', ')} not checked`.
  - `!basisAvailable` → `No Sleeper projections loaded — lineup not checked.`
- No word "favoured", "start", "sit", "should" or "recommend" anywhere in its copy.

### 1e. `src/components/week/WeekView.jsx`

- New props `leagueId = null`, `standings = []`; pass `leagueId`, `rosterTeams`, `standings` to the hook.
- Destructure `matchup`, `startSit` from the hook.
- Right slot (line 151, `w-full xl:w-[420px] shrink-0`): `<MatchupHeader matchup={matchup} startSit={startSit} loading={loading} />` replaces `<WeightPanel …/>`.
- `<LineupTable … startSit={startSit} legendLead={<WeightPanel weights={weights} n={n} season={season} priorSeason={priorSeason} />} />` — WeightPanel's props and content unchanged.
- `ProjectionGapNotice` stays where it is.
- Replace the header comment's "No "vs {opponent}" clause…" paragraph (lines 21–25) with: the
  header card names this week's league opponent from a live-week `getMatchups` read in
  `useWeeklyDecision` (this task file), states why when there is none, and the weight panel now
  sits in the lineup's "How to read these columns" legend.

### 1f. `src/App.jsx` (lines 1490–1500)

Add `leagueId={selectedLeague?.league_id ?? null}` and `standings={leagueData.standings}` to
`<WeekView>`. No new App state.

---

## §2 Start/sit flags

### 2a. `src/utils/weeklyStartSit.js` (new, pure, view-only)

Imports exactly: `./lineup` (`SLOT_ELIGIBILITY`). Must not reference `buildBestLineup`. Header
comment: compares Sleeper PROJ only, OURS shown alongside; no combined score, no swap, no
recommendation; dynasty score, KTC and ROS are never read.

```js
export function buildStartSitFlags({ starters, bench, ownByPlayer, unavailableStatuses })
// → { flags: Flag[], uncheckedSlots: string[], basisAvailable: boolean }
Flag = {
  slotIndex,             // index into starters
  slot, starterId, starterName,
  kind: 'higher' | 'unavailable',
  cause: null | 'bye' | 'status' | 'no-proj',   // null iff kind === 'higher'
  status: string | null,                        // starter's injuryStatus when cause === 'status'
  starterProj: number | null,
  starterOurs: number | null,
  bench: { id, name, proj, ours: number | null },
  ours: null | 'agree' | 'disagree' | 'level',  // only for 'higher' with both OURS finite
  via: null | {          // set only for a one-swap flag (rule 3): the starter who would change slots
    moveId, moveName, moveProj: number | null,
    fromSlot, fromSlotIndex, // the slot the moving starter holds now (the bench player would take it)
    toSlot,                  // = this flag's `slot`
  },
}
```
Rules (`unavailable = new Set(unavailableStatuses ?? [])`, `oursOf = id => finite(ownByPlayer?.[id]?.value) ? value : null`,
`available(row)` = `row.player_id != null && !row.bye && !unavailable.has(row.injuryStatus)`):
1. `basisAvailable` = some filled starter or bench row has `points != null`.
2. **Direct check.** For each starter `s` at index `i` with `s.player_id != null`:
   - `eligible = SLOT_ELIGIBILITY[s.slot]`. Undefined (K, DEF, IDP or other flex variants) → push
     `s.slot` to `uncheckedSlots` (deduped, first-seen order) and skip.
   - candidates = bench rows `b` with `available(b)`, `eligible.includes(b.position)`,
     `b.points != null`. Best = highest `points`; ties keep bench order (already points desc,
     name asc). No candidate → go to rule 3.
   - `cause` = first of: `s.bye` → `'bye'`; `unavailable.has(s.injuryStatus)` → `'status'`;
     `s.points == null` → `'no-proj'`. A non-null cause → `kind: 'unavailable'`.
   - else `best.points > s.points` (strict) → `kind: 'higher'`; equal or lower → go to rule 3.
3. **One-swap check** — only for a starter `s` (slot `B`, index `i`, eligibility defined) that got
   no direct flag. It asks: if one other starter moved into `B`, would a bench player fit the slot he
   leaves? For every other starter `x` at index `j ≠ i` in slot `A` with `SLOT_ELIGIBILITY[A]`
   defined, `available(x)`, and `SLOT_ELIGIBILITY[B].includes(x.position)`; and every bench `z` with
   `available(z)`, `z.points != null`, `SLOT_ELIGIBILITY[A].includes(z.position)` and
   `!SLOT_ELIGIBILITY[B].includes(z.position)` (a `z` eligible for `B` is the direct check's job):
   - `s` has a `cause` (rule 2's list) → candidate `kind: 'unavailable'`;
   - else `z.points > s.points` (strict) → candidate `kind: 'higher'`.
   Best candidate = highest `z.points`; ties → lowest `j`, then bench order. The flag sits on `s`,
   `bench` = `z`, `via = { moveId: x.player_id, moveName: x.name, moveProj: x.points, fromSlot: A, fromSlotIndex: j, toSlot: B }`.
   The comparison is `z` against `s` only — `x` keeps starting, so his own PROJ is shown, not compared.
   Only one move of a starter is considered (no chains).
4. `ours` for `'higher'` (direct or swap) when `oursOf(bench.id)` and `oursOf(s.player_id)` are both
   finite: `>` agree, `<` disagree, `===` level. The `oursOf`/`ours` derivation carries
   `// PROVISIONAL(heuristic): OURS agree/disagree in a lineup flag · compares weeklyOwnProjection.js's heuristic values, not a model verdict · a fitted, graded weekly model would make it real`.
   OURS never decides whether a flag exists — only PROJ does.
5. At most one flag per starter row (direct wins over swap). One bench player may appear in several
   flags — each is a comparison per slot, not an assignment. Nothing is reordered: the function
   returns flags only, and no caller changes row order or slot contents from them.

### 2b. `src/components/week/LineupTable.jsx`

- New props `startSit = null`, `legendLead = null`; thread through `LineupTable` →
  `LineupTableBody` → `LineupRow` as `flag` (starters only: `flagsBySlot.get(i)`, built once from
  `startSit?.flags`; bench rows get `null`).
- In the PLAYER cell, after the rank-line `<div>`, when `flag`:
  `<div id={\`startsit-flag-${flag.slotIndex}\`} data-testid="startsit-flag" title="Comparison by Sleeper's weekly projection (PROJ); OURS shown alongside. Not a recommendation." className="text-[10.5px] text-dp-down-text">{flagText(flag)}</div>`
- `flagText` (exact strings; numbers `toFixed(1)`; `·` U+00B7):
  - higher: `PROJ · {bench.name} {bench.proj} on bench > {starterProj}`, then when `ours` non-null
    ` · OURS {bench.ours} vs {starterOurs} · ` + `PROJ and OURS agree` | `PROJ and OURS disagree` | `OURS level`.
  - unavailable: prefix `BYE` | `{status}` (Sleeper's full word, e.g. `Doubtful`) | `No PROJ`, then
    ` · {bench.name} {bench.proj} PROJ on bench`.
  - **swap** (`via` non-null) — both moves, each with its PROJ; slot labels through the existing
    `SLOT_LABEL` map (`FLEX` → `FLX`, `SUPER_FLEX` → `SF`); `moveProj` null renders `—`:
    - higher: `PROJ · two moves: {via.moveName} {moveProj} {fromLabel} → {toLabel}, {bench.name} {bench.proj} bench → {fromLabel}; {bench.proj} > {starterProj}`,
      then the same OURS clause as a direct flag.
    - unavailable: `{BYE|status|No PROJ} · two moves: {via.moveName} {moveProj} {fromLabel} → {toLabel}, {bench.name} {bench.proj} bench → {fromLabel}`.
  - The OURS clause carries
    `// PROVISIONAL(heuristic): OURS comparison in a lineup flag · compares weeklyOwnProjection.js's heuristic values, not a model verdict · a fitted, graded weekly model would make it real`
    at its render site in `flagText`.
- Legend `<details>` (line 358): render `legendLead` first inside it (above the existing flex row);
  add one paragraph: `Lineup flags compare Sleeper's weekly projection (PROJ) only: a flag marks a
  starter when a bench player eligible for that slot projects higher, or when the starter is on a
  bye, listed Doubtful or worse, or has no PROJ while an eligible bench player has one. OURS is shown
  beside it, and whether the two agree. A "two moves" flag is the same comparison when it only works
  if one starter changes slots first (e.g. a WR in FLEX moves to WR so a bench RB can take FLEX);
  only one such move is checked. A bench player can appear in more than one flag. Nothing is
  swapped, reordered or recommended.`
- Columns stay 13; no new `<td>`.

---

## §3 Status tags

### 3a. `src/components/dp/cells.jsx` — `StatusChip`

```js
import { injuryShort } from '../../utils/injuryStatus'
// Sleeper injury designation chip (live display only, never captured). Questionable is outlined,
// everything else filled — severity readable from the label and the fill, not hue alone (W1 D3).
export function StatusChip({ status, bodyPart = null }) {
  const label = injuryShort(status)
  if (label == null) return null
  const severity = status === 'Questionable' ? 'caution' : 'severe'
  …<span data-testid="status-flag" data-severity={severity}
        title={bodyPart ? `${status} · ${bodyPart}` : status}
        className="font-dp-mono text-[9.5px] tracking-[0.04em] font-medium rounded px-1.5 py-px text-dp-down-text " +
          (severity === 'caution' ? 'border border-dp-down-border' : 'bg-dp-down-bg')>{label}</span>
}
```
Portfolio's `StatusCell` is not touched.

### 3b. `src/components/week/LineupTable.jsx`

Replace the gated chip (lines 210–216, `own?.reason === 'out' && own.status && …`) with
`<StatusChip status={r.injuryStatus} bodyPart={r.injuryBodyPart} />` (import from `../dp/cells`).
The OURS cell's `OUT` rendering is unchanged.

---

## W1 tests

Each: what it asserts, the defect it catches, its red step (temporarily reintroduce, confirm red,
revert), and the fixture fact asserted in setup so the red bites.

**`src/utils/weeklyMatchup.test.js` (new)**

T1 — *pairMatchup picks the other roster in my matchup_id.* Rows in this order:
`[{roster_id:3,matchup_id:2}, {roster_id:1,matchup_id:1}, {roster_id:4,matchup_id:2}, {roster_id:2,matchup_id:1}]`, me = 3 → opponent 4; and the same rows reversed → opponent 4.
Setup asserts: `rows[1].roster_id !== 4` and `rows[1].roster_id !== 3` (the first non-me row is in
another matchup). Fails if the opponent is the first non-me row (returns 1) or my own row.
Red: change the filter to `r => r.roster_id !== myRosterId` (drop the matchup_id test).

T2 — *no pair → no opponent, reason stated.* (a) Rows `[{roster_id:3,matchup_id:null},{roster_id:5,matchup_id:null},{roster_id:1,matchup_id:1},{roster_id:2,matchup_id:1}]`, me = 3 → `{opponent:null, reason:'no-matchup'}`. Setup asserts two rows carry `matchup_id: null`. (b) me absent from rows → `'no-matchup'`. (c) three rows sharing my `matchup_id` → `'unpaired'`.
Fails if two `null` matchup_ids pair (fabricated opponent 5) or `opponent` is `undefined`.
Red: delete the `mine.matchup_id == null` guard → (a) returns roster 5.

T3 — *opponent PROJ = sum of the opponent's starters only.* Opponent row
`{ starters: ['a', '0', 'b', null], players: ['a','b','c'] }`; projections give `a`, `b`, `c` scoring
stats and also a key `'0'` with scoring stats; `d`-style ADP-only rows are covered by T3b.
Setup asserts `projectedPoints(projections.c.stats, s) > 0` and `projectedPoints(projections['0'].stats, s) > 0`.
Expect `{ total: pts(a)+pts(b), valued: 2, slots: 4 }`. Fails if `players` (bench `c`) or the `'0'`
sentinel is summed. Red: (i) iterate `row.players`; (ii) drop the `isFilledSlotId` check.

T3b — *opponent scoring is the lineup's scoring path.* Fixture with an ADP-only row
(`{ adp_dd_ppr: 40 }`) among opponent starters, and the same ids as my starters through
`buildWeeklyLineup`: assert `sumStarterProjection(ids).total` equals the sum of
`buildWeeklyLineup(...).starters[].points` (finite) and the ADP-only id is not `valued`. Setup
asserts `calculateFantasyPoints(adpRow, s) === 0` (the trap). Fails if `weeklyMatchup.js` scores
with `calculateFantasyPoints` directly. Red: replace `projectedPoints` with `calculateFantasyPoints`.

T4 — *buildMatchupHeader states, never fabricates.* `matchups.status` `'idle'` → `reason:'no-league'`,
`opponent:null`; `'failed'` → `'fetch-failed'`; `'loading'` → `status:'loading'`. Loaded pair →
names/records from `rosterTeams`/`standings` (record `{wins:7,losses:4,ties:0}`), `live` false when
both `points` are `0`, true when one is `54.3`; `projMargin` null when my side has `valued < slots`.
Incomplete-side fixture: my starters 10 slots, 9 with finite `points` (one empty slot), opponent
starters all projected. Setup asserts `mine.proj.total` and `opponent.proj.total` are both finite
numbers, `mine.proj.valued < mine.proj.slots`, and `opponent.proj.valued === opponent.proj.slots` —
so a margin guarded only on non-null totals would be non-null. A second, complete fixture asserts
`projMargin === mine.proj.total − opponent.proj.total`.
Fails if an incomplete side yields a margin or a zero-point week reads live.
Red: compute `projMargin` with only a `total != null` guard (no completeness check) → non-null.

**`src/utils/weeklyStartSit.test.js` (new)**

T5 — *eligibility gates the comparison.* Starters: `WR` slot WR `s1` points 8.7; `FLEX` slot TE `s2`
points 7.0. Bench: QB `q` 20.0, RB `b` 9.0. Expect exactly one flag: `slotIndex 1`, `kind 'higher'`,
`bench.id 'b'`. Setup asserts `q.points > s1.points` and `!SLOT_ELIGIBILITY.WR.includes('QB')` and
`!SLOT_ELIGIBILITY.FLEX.includes('QB')`. Fails without the eligibility check (WR flagged by `q`, FLEX
cites `q`). Red: drop `eligible.includes(b.position)`.
(Fixture note: the QB `q` is ineligible for both slots, so rule 3 cannot reach him either.)

T5b — *one-swap check (the reviewer's case).* Starters: `WR` slot (index 0) WR `y` 4.0; `FLEX` slot
(index 1) WR `x` 12.0. Bench: RB `z` 8.0. Expect exactly one flag: `slotIndex 0`, `kind 'higher'`,
`bench.id 'z'`, `via { moveId 'x', moveProj 12.0, fromSlot 'FLEX', fromSlotIndex 1, toSlot 'WR' }`.
Setup asserts `!SLOT_ELIGIBILITY.WR.includes('RB')` (no direct flag is possible),
`SLOT_ELIGIBILITY.FLEX.includes('RB')`, `SLOT_ELIGIBILITY.WR.includes('WR')`, and `z.points < x.points`
(so the FLEX starter is not directly flagged). Also: (b) bench RB 3.0 → no flag (3 < 4);
(c) add bench WR 9.0 → the WR-slot flag is the direct one citing the WR, `via: null` (direct wins);
(d) SUPER_FLEX case — `QB` slot QB 10.0, `SUPER_FLEX` QB 25.0, bench WR 15.0 → flag on the QB slot
with `via.fromSlot 'SUPER_FLEX'`; (e) the moving starter `x` listed `Out` → no flag on `y`'s row
(slotIndex 0) and no flag anywhere with a non-null `via` — assert those, not "zero flags": `x`
himself may still carry a direct `unavailable` flag;
(f) the input `starters`/`bench` arrays are deep-equal to a pre-call clone afterwards (never reordered).
Fails if a slot-change improvement goes unflagged (a, d), a hurt starter is moved (e), or swap
outranks direct (c). Red: (i) delete the rule-3 loop → (a)(d) unflagged; (ii) run rule 3 before
rule 2 → (c) `via` non-null; (iii) drop `available(x)` → (e) flagged.

T6 — *BYE / Doubtful-or-worse / no-PROJ starters.* (a) WR starter `bye:true, points:null`, bench WR
5.0 → `kind 'unavailable', cause 'bye'`. (b) WR starter `injuryStatus:'Out', points:3.0`, bench WR
2.0 → `cause 'status'`; setup asserts bench points < starter points (so only the unavailable branch
can flag it). (c) `'Doubtful'` flagged the same; `'Questionable'` with a lower bench → no flag.
(d) unavailable starter whose only eligible bench player is `injuryStatus:'Out'` → no flag.
`unavailableStatuses` passed as `[...OUT_STATUSES, 'Doubtful']` (import `OUT_STATUSES` from
`weeklyOwnProjection` — tests are outside the importer guard). Fails if the unavailable path is
missing or a hurt bench player is offered. Red: delete the `cause` branch → (a)(b) unflagged.

T7 — *summary fields.* K starter with a higher bench K → no flag, `uncheckedSlots: ['K']`; all
`points` null → `basisAvailable false`; OURS 9.6 vs 7.8 → `ours 'agree'`, 7.0 vs 7.8 → `'disagree'`.
Fails if an unmapped slot is silently counted as checked. Red: drop the `uncheckedSlots` push.

T8 — *eligibility is imported, not copied.* Read `src/utils/weeklyStartSit.js`: matches
`/import\s*\{[^}]*\bSLOT_ELIGIBILITY\b[^}]*\}\s*from\s*['"]\.\/lineup['"]/` and does not match
`/\bFLEX\s*:/`. Red: paste a local `const SLOT_ELIGIBILITY = { …FLEX: [...] }`.

**`src/components/week/MatchupHeader.test.jsx` (new, jsdom)**

T9 — *no pair renders my side and the reason, no opponent.* `matchup` with `opponent:null,
reason:'no-matchup'` → `matchup-mine` present, `queryByTestId('matchup-opponent')` null,
`matchup-reason` text contains `no head-to-head opponent`, and the card's text contains neither
`undefined` nor `null`. Red: render the opponent column unconditionally with `matchup.opponent?.teamName`.

T10 — *totals and incompleteness.* Mine `proj {total:98.4, valued:9, slots:10}` → text `98.4` and
`9 of 10 projected`; opponent OURS renders `—`; `live:false` → no `matchup-live`; `live:true` → both
points render, the row label is `POINTS · Sleeper`, the sub-line contains `up to an hour old`, and the
card text does not contain `LIVE`. Red: drop the `valued < slots` sub-line; separately relabel the row `LIVE`.

T11 — *flags summary.* 2 flags → button `2 lineup flags`; clicking calls
`Element.prototype.scrollIntoView` (stub with `vi.fn()` — jsdom lacks it) on the element with id
`startsit-flag-{first slotIndex}` rendered in the test; 0 flags + basis + `uncheckedSlots:['K']` →
`No bench player projects higher (Sleeper PROJ) for a slot he can fill, directly or with one starter moved · K not checked`,
and the card text does not contain `matches`; no basis → `lineup not checked`;
`loading:true` → no `startsit-summary`. Red: render the zero-flag sentence when `basisAvailable` is false.

**`src/components/week/LineupTable.test.jsx` (extend)**

T12 — *flag text cites both PROJ numbers.* Starter (FLEX, PROJ 8.7) with a `higher` flag citing bench
`Chase White` 9.8 and OURS 9.6 vs 7.8 → `getByTestId('startsit-flag').textContent` contains `9.8`,
`8.7`, `Chase White`, `OURS 9.6 vs 7.8`, `PROJ and OURS agree`; it carries `id="startsit-flag-{slotIndex}"`.
Setup asserts the bench player is not rendered as a row in the fixture (so `9.8` can only come from
the flag) and that `8.7` is the starter's own PROJ. Scope the assertion to the flag element (the PROJ
cell also shows 8.7). Fails if only names render. Red: render `PROJ · {bench.name} on bench`.

T12b — *a swap flag shows both moves with their numbers.* WR-slot starter `Wes Low` 4.0 with a
`higher` flag whose `via` is `{ moveName 'Max High', moveProj 12.0, fromSlot 'FLEX', toSlot 'WR' }` and
`bench` `Ron Bench` 8.0 → the flag text contains `two moves`, `Max High 12.0 FLX → WR`,
`Ron Bench 8.0 bench → FLX`, `8.0 > 4.0`. Setup asserts neither `Max High` nor `Ron Bench` is a row in
the fixture. Fails if the moving starter or a number is dropped. Red: omit the `via.moveName …`
segment.

T13 — *Q and D render; the old OURS gate is gone.* Rows with `injuryStatus` `Questionable`,
`Doubtful`, `Out`, `null`; `ownByPlayer = {}`. Setup asserts no `ownByPlayer` entry has
`reason:'out'`. Expect `status-flag` texts `['Q','D','OUT']`, the Q chip `data-severity="caution"`,
the D chip `"severe"`. Red: restore `own?.reason === 'out' && own.status` → zero chips.
**Update** the existing test at line 367 (`a player Sleeper lists out carries the status chip…`):
its fixture moves the status onto the row (`injuryStatus: 'IR'`); it still asserts `['IR']` and
that a row without a status carries none.

T14 — *weight panel sits in the legend.* `legendLead={<div data-testid="lead">x</div>}` → `lead` is a
descendant of `lineup-legend`. Red: render `legendLead` outside the `<details>`.

**`src/utils/weeklyLineup.test.js` (extend)**

T15 — *rows carry the live status.* `playerMap[id].injury_status = 'Questionable'`,
`injury_body_part = 'Knee'` → row `injuryStatus 'Questionable'`, `injuryBodyPart 'Knee'`; an empty
slot row has both `null`; `projectedPoints(adpOnlyStats, s)` is `null`. Red: omit the two fields.

**`src/hooks/useWeeklyDecision.test.js` (extend)**

Add `vi.mock('../api/sleeper', () => ({ getMatchups }))` with a hoisted `getMatchups` mock.

T16 — *the hook reads the live week and degrades.* With `leagueId 'L1'`, `myTeam.rosterId 3`,
`currentWeek 9`: `getMatchups` called once with `('L1', 9, 9)`; a resolved pair → `matchup.opponent.rosterId`
is the paired roster; a rejection → `matchup.reason 'fetch-failed'` while `lineup.starters` still
has its slots and `error` stays `null`. Without `leagueId` → `getMatchups` not called,
`reason 'no-league'`. Red: pass `currentWeek - 1` as the third argument (asserts the args), and
separately let the rejection set `error`.

**`src/__tests__/weeklyDecisionViewOnly.test.js` (extend)**

T17 — *new modules stay view-only.* In the PIPELINE loop add
`expect(src).not.toMatch(/from\s+['"][^'"]*weeklyMatchup['"]/)` and the same for `weeklyStartSit`
(and extend the `it` title). Add `'src/utils/weeklyStartSit.js'` and `'src/utils/weeklyMatchup.js'`
to the `buildBestLineup` files list. `MatchupHeader.jsx` is covered by the existing week-folder
import test automatically. Red: temporarily add `import { buildStartSitFlags } from './weeklyStartSit'`
to `src/utils/seasonProjection.js` → red; revert.

**`src/components/week/WeekView.test.jsx` (new, jsdom)** — closes the wiring gap (no WeekView test
exists today).

T18 — *WeekView passes the league inputs to the hook and lays out the card.* `vi.mock('../../hooks/useWeeklyDecision', …)`
with a hoisted `useWeeklyDecision = vi.fn(() => STUB)`, where `STUB` supplies every field WeekView
destructures: `weights: []`, `lineup: { starters: [], bench: [] }`, `n: 0`, `scheduleIndex: null`,
`loading: false`, `error: null`, `failedWeeks: []`, `weeklyMaps: []`, `projections: {}`,
`priorAllowed: null`, `currentAllowed: null`, `priorSeason: 2025`, `currentSeason: 2026`,
`priorSnapByPlayer: {}`, `dataSeason: 2025`, `priorRecords: {}`, `currentRecords: {}`,
`defenceFailedWeeks: []`, `liveTeamContext: { teams: {}, year: null, complete: false, rowCount: 0 }`,
`projectionGap: null`, `ownByPlayer: {}`, and a `matchup` with `reason: 'no-matchup'`, `opponent: null`
plus `startSit: { flags: [], uncheckedSlots: [], basisAvailable: false }`. (Session 2: if a child
needs another field to render, add it to `STUB` and list it in the hand-back; do not change WeekView.)
Render `<WeekView leagueId="L1" rosterTeams={[{ rosterId: 3, teamName: 'Me', starters: [], starterSlots: [], bench: [], reserve: [], taxi: [] }]} standings={[{ rosterId: 3, wins: 7, losses: 4, ties: 0 }]} myTeamName="Me" nflState={{ season: '2026', week: 9 }} />`.
Assert: the hook's first call argument has `leagueId: 'L1'`, the same `rosterTeams` and `standings`
array references, and `myTeam.rosterId === 3`; `matchup-header` is rendered and is **not** inside
`lineup-legend`; the WeightPanel (its heading, matched with `/HOW MUCH OF THIS IS/i` — WeightPanel.jsx:18 renders it uppercase) **is** inside
`lineup-legend`. Fails if WeekView drops `leagueId`/`standings`/`rosterTeams` (the header would
read `no-league` forever with the suite green) or leaves WeightPanel in the right slot.
Red: (i) omit `leagueId` from the hook call; (ii) render WeightPanel in the right slot again.

T19 — *App passes the two new props.* Source guard, the `src/__tests__/*ViewOnly.test.js` precedent
of reading `src/App.jsx`: put it in `WeekView.test.jsx`. Extract the `<WeekView … />` element text
with `/<WeekView[\s\S]*?\/>/` and assert it matches `/leagueId=\{selectedLeague\?\.league_id/` and
`/standings=\{leagueData\.standings\}/`. Red: delete either prop from App.jsx.

---

## W1 risks

- **New live-week fetch.** One `getMatchups` per `/week` mount, 60-min cache; a failure only hides
  the opponent. Leagues without head-to-head pairs, byes, playoffs and median-only weeks all reach
  `no-matchup`/`unpaired` and render my side with a stated reason.
- **Roster vs matchup cache skew** (D4) — header follows the table.
- **Slots without eligibility** (K, DEF, IDP, `WRRB_FLEX`, `REC_FLEX`…) are listed as not checked
  rather than claimed as matching.
- **Coverage of the check.** Direct comparisons plus one starter moving slots; longer chains (two
  or more moves) are not checked, and the zero-flag line says only what was checked.
- **Matchup points can lag** up to the 60-min cache; labelled `POINTS · Sleeper` with that stated.
- **Strict Mode** double-fires the new effect; the `cancelled` flag guards every setter.
- No scoring, snapshot or cross-repo impact (D7).

---

## Docs updates (same change)

1. `docs/dynasty-frontend-ux-design.md` — after the **Deferred (post-core):** line (line 517) add:
   `**Decision 2026-11-19 (Anton):** a lightweight own-roster start/sit *helper* ships now on /week — flags comparing Sleeper's weekly projection, with our OURS number beside it, never auto-picking and never using dynasty score, KTC or ROS. Model-driven lineup advice stays deferred as above.`
2. `docs/dynasty-decision-engine-design.md` — directly after Core Jobs item 6 (line 97), as an
   indented continuation line of that item:
   `   *Decision 2026-11-19 (Anton): a lightweight helper ships now (Sleeper-projection comparisons on /week, OURS beside them, no auto-pick, no dynasty score/KTC/ROS); model-driven lineup advice stays deferred.*`
3. `../future_plans/in-season-notes-plan.md` (parent folder, not under git — no commit) — append
   `## 2026-11-19 — Own-roster start/sit: lightweight helper now` with one line restating D1.
4. `docs/navigation.md` line 22 (`/week` row): replace the closing "No `vs {opponent}` clause …
   (a deliberate v1 omission, not a gap to fill later)" with the matchup header (live-week
   `getMatchups` in `useWeeklyDecision`, my side vs the paired opponent, PROJ/OURS totals, a stated
   reason when there is no pair) and the start/sit flags (Sleeper PROJ basis, OURS beside); weight
   panel now in the lineup legend. Line 101 (`useWeeklyDecision.js` row): new params, the matchups
   effect, and `matchup`/`startSit` in the return list.
5. `docs/nav/components.md` — `week/WeekView.jsx` row (drop the "No vs {opponent}" sentence; new
   props; MatchupHeader in the right slot; WeightPanel via `legendLead`); `week/WeightPanel.jsx` row
   (now rendered inside the lineup legend); `week/LineupTable.jsx` row (status chip from
   `injuryStatus` for every designation, flag sub-line, `legendLead`); new `week/MatchupHeader.jsx`
   row; `dp/cells.jsx` row (`StatusChip`).
6. `docs/nav/utils.md` — new rows `weeklyMatchup.js`, `weeklyStartSit.js`; `weeklyLineup.js` row
   (`projectedPoints`, `injuryStatus`/`injuryBodyPart`); `lineup.js` row (`SLOT_ELIGIBILITY` exported,
   imported by `weeklyStartSit.js`); `injuryStatus.js` row — add `dp/cells.jsx`'s `StatusChip` as a
   third consumer of `injuryShort` beside `Portfolio.jsx` and `DepthChart.jsx`.
7. `docs/signal-registry.md` line 72 (injury designation) consumer cell: add `/week`'s lineup status
   chip (every designation) and the start/sit flags (Doubtful or worse marks a starter unavailable;
   such a bench player is never offered). Display-only, unchanged class.
8. `CLAUDE.md` line 47 (`src/components/week/` row): "the weight panel, the lineup table" → "the
   matchup header (opponent, PROJ/OURS totals, lineup flags), the lineup table (weight panel in its
   legend)". Stays under the 25,000-byte ceiling (currently 19,773).

All doc phrasing states mechanism, not today's data availability (`docsAvailabilityClaims.test.js`).

## Done-definition notes for Session 2

- `npm test`, `npm run lint`, `npm run build` clean. No factors/stat-key contract change.
- Smoke: `/week` on `Colts_420_Reloaded` / Dynasty 040 (docs/architecture.md → *Smoke-testing*):
  report the header card (opponent or reason), the flag count vs flag sub-lines, a Q chip if present,
  the weight panel inside the legend, and the console free of errors. Screenshot at 1440×900 and at
  mobile width (375). A screenshot is not sign-off.
- `grep -rn "PROVISIONAL(" src/` in the hand-back. **Exactly four new `PROVISIONAL(heuristic)` tags
  expected**, one per OURS derivation/render site: `weeklyMatchup.js` (`mine.ours`),
  `MatchupHeader.jsx` (OURS total), `weeklyStartSit.js` (`oursOf`/`ours`), `LineupTable.jsx`
  (`flagText`'s OURS clause). Everything else here is a real Sleeper value.
- No data-repo backlog line expected; record "none" if none surfaced.

---

## Open items

**OI-1 — App.jsx `weeklyScores` pairing can pair two `null` matchup_ids (fix separately, not in W1;
Anton 2026-11-19).** `App.jsx` lines 994–1005 group completed weeks' matchup rows by
`m.matchup_id` with no `null` guard, so two rosters with `matchup_id: null` in the same week (bye,
eliminated, median-only) form a "pair" and each gets a fabricated `{ opponentRosterId, won }`
entry. W1's `pairMatchup` deliberately differs (a `null` never pairs). W1 does **not** change
App.jsx's grouping and does **not** make it call `pairMatchup`; the two pairing rules coexist until
the separate fix. `weeklyMatchup.js`'s header comment names this divergence and OI-1. The fix is its
own task (likely reuse `pairMatchup` there, with a test on a week holding two `null` rows); it
touches `leagueData.weeklyScores`, which feeds League standings/schedule views, so it is planned on
its own.

---

## W2 — outline only (plan after W1 is verified)

Depends on W1: the header card and status chip exist; W2 restyles and consolidates them.

**§4 Visuals in rows.** Weekly score strip replaces LAST 3 (bars + text): every played week this
season as a bar (league-scored, from `weeklyMaps`), bye/DNP void (`null ≠ 0`), median line, last 3
emphasised, tooltip week + points, header `{season} WEEKS`, ≤ 18 bars. Usage trend in the Usage view:
per-week snap share (+ target share WR/TE, carry share RB) beside the season `count · share`; season
value stays printed; per-week variant of `weeklyUsage.js` helpers, season aggregates unchanged. One
shared `dp/WeeklyStrip.jsx` (reused by My Team later), void/zero semantics as `SeriesBars`/`TrendCell`.
Depends on: nothing beyond W1. Likely `full` (new shared primitive).

**§5 Copy and layout.** Fix the legend's "My Team's RANK uses points per game" (Portfolio ranks by
total points, `rankByTotalPoints`). Mobile (< 768 px): header card first; PROJ visible without
horizontal scroll. Depends on W1's header card.

**§6 Visual pass (Anton, 2026-11-19).** Team logo as a faded watermark in the name cell (name text
≥ 4.5:1 on the composite; abbr stays as text; FA/missing → plain; sticky mobile column keeps an
opaque base). Photos 28 → ~40 px with rows-visible counts at 1440×900 before/after. One shared player
cell in `dp/cells.jsx` (variants: rank line, status tag — W1's `StatusChip`, BACKUP chip) adopted by
This week, Market, My Team, team detail and the pop-up compare (Portfolio's `StatusCell` folds in
here). Clean columns: right-aligned tabular figures, consistent decimals, ≤ 1 grey sub-line per cell,
aligned group dividers, every column in the glossary. Colour: replace `SeasonGrid`'s
`playedCellStyle` gradient with a few discrete steps with a stated meaning and a legend, colour-blind
safe, never red/green alone, text ≥ 4.5:1 on every step; same steps for the weekly strip and ALLOWS
bands; tokens in `index.css @theme` (this is where W1 D3's status tones may move to the new palette).
Before/after screenshots desktop + mobile for Anton. Depends on §4 (strip) for the shared palette.
Probably splits: §6 cross-surface player cell is its own slice.

**W2 out of scope:** OURS model; auto-lineup; DefencesFaced/OffencesOwned content (palette aside);
Market/My Team content beyond adopting the shared player cell; projection track record.

---

## Fix pass 1

Source: implementation-reviewer (full) on `33e2f03..9593d84`, five flags, all triaged should-fix.
Session 1 checked `weeklyStartSit.js` lines 53–82: rule 2 `return`s before rule 3 runs, so
direct-wins is already correct; item 1.3 only strengthens its test. Touch only what each item names.

**1.1 — Hook header comment (fidelity, §1c).** `src/hooks/useWeeklyDecision.js`, the header's
"Degraded paths" paragraph (lines ~27–37): append one sentence — no league id, no head-to-head pair,
or a matchups fetch failure → the matchup header states why and shows my side only; the lineup still
renders. Comment only; leave the inline comment above the effect as is.

**1.2 — "0 of N" when nothing is valued (fidelity, §1d / D5).** `src/components/week/MatchupHeader.jsx`
`TotalRow`: render the sub-line whenever `valued < slots`, regardless of `total` (so a side with no
values shows `—` and `0 of 10 projected`). Test, in `MatchupHeader.test.jsx`: opponent
`proj { total: null, valued: 0, slots: 10 }` → the opponent column's text contains `0 of 10 projected`.
Setup asserts `total === null`. Red: restore the `total != null &&` guard.

**1.3 — T5b(c) must make the swap candidate the higher one (test honesty).**
`src/utils/weeklyStartSit.test.js`, case (c): change the direct bench WR from 9.0 to **6.0** (swap RB
stays 8.0, WR-slot starter 4.0, FLEX WR 12.0). Expect the WR-slot flag `bench.id` = the bench WR,
`via: null`, `kind 'higher'`. Setup asserts the RB's `points` > the bench WR's `points` > the
starter's `points` (so a "pick the higher of direct and swap" bug would cite the RB). Red: in rule 2,
replace the direct `return` with collecting the direct candidate and letting rule 3 override it when
its `z.points` is higher → (c) cites the RB with non-null `via`. Revert.

**1.4 — Render test for `kind: 'unavailable'` flag text (untested).** `LineupTable.test.jsx`, three
starter rows with flags: (a) direct `cause 'bye'` → text starts `BYE · ` and contains
`{bench.name} {proj} PROJ on bench`; (b) direct `cause 'status'`, `status 'Doubtful'` → starts
`Doubtful · `; (c) swap `cause 'no-proj'` with `via` → starts `No PROJ · two moves: ` and contains
both moves' names and numbers. Each scoped to its own `startsit-flag` element. Red: render the
`higher` text for every kind → (a)–(c) fail.

**1.5 — Render test for the margin line and W-L-T (untested).** `MatchupHeader.test.jsx`:
`projMargin: 4.25` → text contains `PROJ margin +4.3`; `projMargin: -3` → contains
`PROJ margin −3.0` (U+2212, and not `-3.0`); `projMargin: null` → no `PROJ margin`. A record
`{ wins: 6, losses: 5, ties: 1 }` → `6-5-1`; `ties: 0` → `7-4`. Red: format the minus with a hyphen →
the second case fails; drop the ties branch → `6-5-1` fails. (If a 0 margin is reachable, it renders
`+0.0`; assert that too.)

Leave alone: everything else in the diff, incl. the reported red-step deviations (T3b, T5b(ii), T14)
and the `MemoryRouter` wrapper — accepted. Done-definition as before (`npm test`, lint, build);
no smoke needed (no visual change beyond the 1.2 sub-line, covered by its test). Commit on `main`,
unpushed.

---

## Verification

Session 1 (opus), 2026-11-19, against the diff `33e2f03..9a6ac17`, not the hand-back.

- **Implementation:** `9593d84` (Session 2, sonnet). Reported deviations accepted: the T3b, T5b(ii)
  and T14 red steps were done differently but each test is still shown red; `WeekView.test.jsx`
  needs a `MemoryRouter`.
- **Review:** implementation-reviewer at full depth (opus, high) raised 5 flags, all triaged
  should-fix. All 5 fixed in Fix pass 1, `9a6ac17` (fix-applier):
  - hook header comment;
  - "0 of N" sub-line when nothing is valued;
  - T5b(c) fixture now makes the swap candidate the higher one;
  - `unavailable` flag-text render test;
  - margin and W-L-T render test.
- **Fix-pass re-review:** implementation-reviewer at light depth — "No blocking issues found."
- **Checks at `9a6ac17` (re-run by Session 1):**
  - `npm test`: 3538/3538.
  - `npm run lint`: 0 problems.
  - `npm run build`: succeeds. Its only output is Vite's chunk-size advisory; none of these changes
    touches chunking, and the advisory was not compared against the base commit.
- **PROVISIONAL:** exactly four new `PROVISIONAL(heuristic)` tags, at:
  - `weeklyMatchup.js:73`
  - `weeklyStartSit.js:13`
  - `MatchupHeader.jsx:42`
  - `LineupTable.jsx:156`
- **Smoke (Session 2):** `/week` on Dynasty 040, week 11, at 1440×900 and 375 wide, with no console
  errors.
  - Header: 6-4 vs 6-4, PROJ 147.5 vs 115.2. OURS shows on my side only. The opponent shows "9 of 10
    projected", so no margin.
  - Zero flags, so the "what was checked" sentence shows.
  - Status chips: Q outlined, IR and OUT filled.
  - The weight panel is inside the legend.
  - On mobile the header card comes first and PROJ is visible without horizontal scroll.
  - The flag sub-line was not seen in the app; it is covered by T12, T12b and T12c.
- **Not touched:** scoring, snapshots, the cross-repo index. Data-repo backlog: none.
- **Open:** OI-1 (the App.jsx `weeklyScores` null-pairing bug) is to be fixed separately. W2 is still
  to plan.
