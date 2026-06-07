# Team-change handling (offseason free-agency / trades)

**Planning session (opus). Implementer: sonnet.** Read this whole file first. If
anything contradicts the code, stop and ask — do not improvise.

---

## 0. Detection-feasibility finding (read FIRST — gates everything below)

**Robust per-season team is NOT recoverable from currently-stored data. A team
change therefore cannot be reliably detected today. One best-effort signal does
exist (prior projection snapshots). The point-estimate design is split
accordingly: sub-A is unconditional; sub-B's behaviour changes fire only when the
best-effort detection actually returns a result.**

Evidence (inspected actual data, not just grep — per CLAUDE.md Field-existence rule):

1. **Season totals carry no team.** `careerStats[season][playerId]`
   (`src/__fixtures__/season-totals-2025.json`) has top-level keys
   `stats, gamesPlayed, gamesStarted, byeWeeks, dnpWeeks, weeklyPoints,
   weeklyStatus, fantasyPoints, availability` — **no `team`**, and no `team`
   inside `stats`. Confirmed against the fixture.

2. **All historical attribution keys off the *current* team.**
   `computeHistoricalTeamTotals` and `computeHistoricalShares`
   (`src/utils/teamContext.js:124,152`) group every season's stats by
   `playersMap[playerId].team`, which is the player's **current** team only.
   This is the documented data-quality limitation (`teamContext.js:120–123`,
   docs/projection.md Step 5h). A player who changed teams has *all* prior-season
   share/RZ history mis-attributed to their new team.

3. **Per-week team exists upstream but is discarded at ingestion.** The live
   Sleeper endpoint `GET https://api.sleeper.com/stats/nfl/{season}/{week}`
   returns `entry.team` at the row top-level (verified live: 2024 W1 returns
   `entry.team = "KC"` etc.). But `normalizeStatsResponse`
   (`src/api/sleeperStats.js:14–21`) keeps only `entry.stats`, dropping `team`,
   and `getSeasonTotals` (`:184–215`) sums **numeric stat keys only**. So
   per-week → per-season team is thrown away before caching.

**Recovering per-season team is a cross-repo data-source change (DEPENDENCY — out
of scope, see §6).** It requires: capture `entry.team` per week in
`normalizeStatsResponse`/`getSeasonTotals`; aggregate a per-season team (e.g. the
modal team across played weeks); bump season-totals `MAX_SUPPORTED_SCHEMA`
(`dataStore.js`); mirror the shape in `sleeper-dashboard-data` `lib/sleeper.mjs`;
and regenerate every stored season-totals file. Do **not** build this here.

**Best-effort detection available now: prior projection snapshots.**
`projectionSnapshot.js` already captures `players[playerId].nfl_team`
contemporaneously (per UTC day, ~1.9yr TTL). Comparing the **most recent prior
snapshot's** `nfl_team` against the **current** `playersMap[playerId].team`
detects an offseason team change. Limitations (state honestly in docs):
forward-only (no backfill before snapshots existed), first-league-of-day-wins
coverage, and a brand-new install has zero snapshots → detection returns `null`
for most players until snapshots accumulate. This is good enough to **capture**
the signal and to gate **conservative neutralizations**, but NOT good enough to
drive aggressive re-modelling.

### What Steps 7 / 7b do for a just-signed player (verified — no change needed)
- **Step 7 (team offense)** keys on `teamContext.teamOffense[player.team]` where
  `player.team` is the **new/current** team, and `teamOffense` is computed from
  **current-season** production grouped by **current** team
  (`computeTeamContext`, `teamContext.js:44`). Forward-looking and correct for a
  new signing — resolves to the new team's offense rank (or neutral rank 16 if
  unresolved). **No change.**
- **Step 7b (QB1 quality)** keys on `qbQualityByTeam[player.team]` (new team),
  built from current rostered QBs (`computeQBQualityByTeam`). Forward-looking and
  correct. Neutral 1.0 when the team is unresolved. **No change.**

---

## Scope summary

| Part | What | Conditional on detection? | Doable now? |
|---|---|---|---|
| **A** | Depth-chart staleness graceful degradation (Step 8) | **No** | **Yes — implement** |
| **B-capture** | `isTeamChange` / `prevTeam` / `newTeam` diagnostic factors via snapshot-diff | n/a (the capture *is* the detection) | **Yes — implement** |
| **B-neutralize** | When `isTeamChange === true`, neutralize OLD-team signals: Step 3 share trend + Step 5h team-RZ-share | **Yes** (fires only on a true detection) | **Yes — implement, gated** |
| **B-confidence** | Lower confidence for team-changers | — | **DEFER** (capture enables future; see §5) |
| **B-reanchor** | Re-anchor share/usage to new team's opportunity structure | — | **DEFER** (backtest-gated; see §6) |

Behaviour change for team-changing players (and for stale-depth players) is
intentional and correct.

---

## 1. Sub-A — Depth-chart staleness (Step 8), unconditional

### Problem
`depth_chart_order` is a current-roster field, frequently stale/wrong for
offseason signings. The **null** case is already handled (Step 8 falls through to
neutral `1.00`). The unhandled case is a **non-null but stale** order that applies
a wrong **penalty**: order 2 → ×0.88, order ≥3 → ×0.68 (a 32% cut) on a player
who is actually an established starter mis-tagged on a new roster.

### Fix (team-agnostic corroboration gate)
Use the player's own most-recent qualifying season as corroboration. We already
have `lastSeasonRaw = careerStats?.[lastQ.season]?.[playerId]` in scope; it
carries `gamesStarted` (confirmed present for all 2750 fixture players).

Rule (replaces the Step 8 depth block in `seasonProjection.js:518–523`):

```js
// ── Step 8: Depth chart (staleness-aware) ───────────────────────────────────
const depthOrder = depthMap?.[playerId]?.depthOrder ?? null
const recentStarterEvidence = (lastSeasonRaw.gamesStarted ?? 0) >= 8
// A penalty-tier order (≥2) on a player who clearly started last season is
// almost certainly a stale/unset offseason depth chart, not a real demotion.
// Suppress the penalty to neutral rather than apply a wrong multiplier.
const depthStale = depthOrder != null && depthOrder >= 2 && recentStarterEvidence
let depthFactor
if      (depthStale)            depthFactor = 1.00   // suspected stale → neutral
else if (depthOrder === 1)      depthFactor = 1.05
else if (depthOrder === 2)      depthFactor = 0.88
else if (depthOrder != null && depthOrder >= 3) depthFactor = 0.68
else                            depthFactor = 1.00
```

- The **starter boost** (order 1 → 1.05) is unchanged (low risk).
- A genuine backup last year (`gamesStarted < 8`) buried at order ≥2 still gets
  the penalty (`depthStale` false). Correct.
- A real demotion of a recent starter is also suppressed — accepted asymmetry:
  in the offseason (when this matters) depth charts are unreliable, a false
  penalty is worse and more common than a held-neutral, and a genuine job loss
  surfaces in next-season production anyway.

### Diagnostic factor
Add **one** vet-path factor key: `depthStale` (boolean). The raw order is already
captured per player in snapshots (`depthChartOrder`), so do **not** add a
`depthOrderRaw` key. `depthStale` is vet-path only.

### Adjustment summary
The existing `if (depthFactor < 0.90) push('Not confirmed starter ↓')` line now
correctly does NOT fire when a penalty is suppressed. Add a transparency line:

```js
if (depthStale) adjustmentSummary.push('Depth chart unconfirmed — penalty held')
```

(`depthFactor` moves, so this is not a capture-only factor; a summary line is
allowed.)

---

## 2. Sub-B-capture — Team-change diagnostic factors (best-effort, doable now)

### New factors (BOTH paths): `isTeamChange`, `prevTeam`, `newTeam`
Computed **once, before the rookie/vet split**, and spread into both `factors`
objects — exactly mirroring how `ktcSignals` is computed once and spread
(`seasonProjection.js:286,291,685`).

### New input param
Add `priorTeamByPlayer = null` to the `computeNextSeasonProjection` destructured
options (`seasonProjection.js:245–262`). Shape: `{ [playerId]: string }` — the
NFL team abbreviation from the most-recent prior snapshot. `null` when no prior
snapshot is available.

### Detection logic (place right after `const player = ...`, before Step 1)
```js
const newTeam  = player.team ?? null
const prevTeam = priorTeamByPlayer?.[playerId] ?? null
// Only a confident, observed change counts. null prevTeam (no snapshot coverage)
// → isTeamChange null (unknown), NOT false — keeps "unknown" distinct from "same".
const isTeamChange =
  prevTeam == null || newTeam == null ? null
  : prevTeam !== newTeam ? true
  : false
const teamChangeFactors = { isTeamChange, prevTeam, newTeam }
```

- Spread `...teamChangeFactors` into the rookie return's `factors`
  (`seasonProjection.js:198`) and the vet return's `factors`
  (`seasonProjection.js:627`). On the rookie path `isTeamChange` is usually
  `null` (rookies have no prior snapshot); that is the correct "unknown" value.

### Plumbing (App.jsx + a small loader)

**New loader** — add to `src/utils/projectionSnapshot.js`:
```js
/**
 * Reads the most-recent projection snapshot strictly BEFORE today's UTC date
 * and returns { [playerId]: nfl_team } for team-change detection. Returns null
 * when no prior snapshot exists.
 * @param {Date} [now]
 * @returns {Promise<Object|null>}
 */
export async function loadPriorSnapshotTeams(now = new Date()) { … }
```
Implementation: enumerate cache records with prefix `projection-snapshots/`,
parse the trailing `YYYY-MM-DD`, pick the latest key whose date `< dateKeyUTC(now)`,
load it via `getCacheRecord`, and map `players[pid].nfl_team`. Skip any record
whose date is not strictly before today (don't diff against today's own snapshot).

**New cache helper** — `cache.js` exposes no key enumerator (only `clearCache`
walks a cursor internally). Add an additive export, modelled on `clearCache`'s
cursor walk (`cache.js:68–82`):
```js
// Returns live (non-expired) records whose key starts with prefix:
//   [{ key, data }]
export async function listCacheRecords(prefix) { … }
```

**App.jsx** — add state + effect (App.jsx owns all state; respect the Strict-Mode
`cancelled` guard invariant):
- New state `priorTeamByPlayer` (init `null`).
- New `useEffect` (mount): `const cancelled = …; loadPriorSnapshotTeams().then(m => { if (!cancelled) setPriorTeamByPlayer(m) })`; cleanup sets `cancelled = true`.
- Pass `priorTeamByPlayer` into the `seasonProjections` useMemo call to
  `computeNextSeasonProjection({ …, priorTeamByPlayer })`
  (call site ~`App.jsx:893`), and add it to that memo's dependency array
  (~`App.jsx:909`).

This reads **locally-written** snapshots only — no new external source, no
cross-repo read.

---

## 3. Sub-B-neutralize — Neutralize OLD-team signals when `isTeamChange === true`

Fires **only** when detection returned `true`. When `isTeamChange` is `null`
(unknown) or `false`, behaviour is byte-identical to today.

### Step 3 — Share trend (`seasonProjection.js` Step 4 block, ~`:319–337`)
The share history is mis-attributed to the new team and reflects OLD-team usage.
After computing `shareTrendMultiplier`, override:
```js
const shareTrendMultiplier = isTeamChange === true
  ? 1.0
  : 1.0 + (shareTrendRaw - 1.0) * shareVolatilityScale
```
Keep `shareTrendRaw`, `shareVolatilityLabel`, `shareVolatilityScale` recorded
as-is (diagnostic — shows what it *would* have been). The applied `shareTrend`
factor becomes `1.0`.

### Step 5h — Team-RZ-share (`seasonProjection.js:464–466`)
The numerator is the player's OLD-team RZ work; the denominator is the NEW team's
total (current-roster attribution). The share is meaningless. After the
`computeTeamRzShareFactor` call, override:
```js
const teamRzShareNeutralized = isTeamChange === true
const teamRzShareFactorApplied = teamRzShareNeutralized ? 1.0 : teamRzShareFactor
const teamRzShareApplied        = teamRzShareNeutralized ? null : teamRzShare
```
Use `teamRzShareFactorApplied` in `combinedNewFactorRaw` (`:556–559`) and record
`teamRzShare: teamRzShareApplied`, `teamRzShareFactor: teamRzShareFactorApplied`
in `factors`. Keep `teamRzShareCategory` as computed.

> Implementer note: the simplest non-reordering edit is to reassign via `let`
> after the call, or wrap the two values. Do **not** move the Step 5h call or the
> combine block.

### Adjustment summary
```js
if (isTeamChange === true) adjustmentSummary.push('Team change — old-team signals neutralized')
```

**Not touched** (intentionally — these are player-intrinsic or new-team-correct):
base PPG, age curve, regression, momentum, efficiency, snap share, own-rate RZ
usage (D2), trajectory, breakout/bounce-back/TD-reliance, Steps 7/7b, comp blend.

---

## 4. Step 5h note (the backlog asked to examine it)
Even **without** detection, the Step 5h denominator mismatch for a team-changer is
**already partially bounded** by existing design: the player is grouped into their
own (new-team) denominator, `MIN_TEAM_DENOM = 20` guards thin denominators, and
shrinkage-to-50 + the ±5% clamp cap the distortion. The neutralization in §3 is
the clean fix when a change IS detected; no other Step 5h change is warranted now.

---

## 5. Confidence — DEFER (capture only)
Do **NOT** mutate the `confidence` label for team-changers in this task. The
label is a coarse sample-size band (`high/medium/low/rookie`) consumed widely
(comp blend `pipelineUncertainty`, UI, snapshots); repurposing it to also mean
"roster uncertainty" would conflate two axes and destabilize dependents.
`isTeamChange` is captured so a future, backtest-validated uncertainty adjustment
can be built deliberately. State this in docs.

---

## 6. Deferred / dependency flags (state in task summary)
1. **Per-season team recovery (DEPENDENCY).** Robust detection (and any
   retro/backtest of team-change handling) needs per-season team. That is a
   cross-repo data change in `sleeper-dashboard-data` + `sleeperStats.js`
   ingestion + season-totals schema bump + full regeneration. **Not in this task.**
2. **Full re-anchoring of share/usage to the new team (DEFER).** Re-projecting a
   changer's opportunity onto the new team's structure is a larger,
   backtest-gated modeling effort. This task only **neutralizes** distorted
   old-team signals — it does not re-anchor.
3. **Confidence/uncertainty adjustment (DEFER).** See §5.

---

## 7. Step sequence for the implementer (no pipeline reordering)
1. `cache.js`: add `listCacheRecords(prefix)`.
2. `projectionSnapshot.js`: add `loadPriorSnapshotTeams(now)`.
3. `seasonProjection.js`:
   a. add `priorTeamByPlayer = null` to options;
   b. compute `teamChangeFactors` before the rookie/vet split; spread into both
      `factors`;
   c. Step 4: gate `shareTrendMultiplier` on `isTeamChange`;
   d. Step 5h: neutralize `teamRzShareFactor`/`teamRzShare` on `isTeamChange`;
   e. Step 8: staleness-aware `depthFactor` + `depthStale`;
   f. add summary lines (depth-held, team-change).
4. `App.jsx`: `priorTeamByPlayer` state + mount effect + thread into
   `seasonProjections` memo (call + deps).
5. Update tests (§Tests). 6. Update docs (§Docs). 7. `npm test` + `npm run build`.

---

## Factors contract change (exact)

Baseline (current code, asserted by `factorsSchema.test.js`): **69 vet / 48 rookie.**

- **Vet** adds 4: `isTeamChange`, `prevTeam`, `newTeam`, `depthStale` → **73 vet**.
- **Rookie** adds 3: `isTeamChange`, `prevTeam`, `newTeam` (NOT `depthStale`) → **51 rookie**.

On the rookie path set these in `rookieProjection`'s returned `factors` (or via
the shared spread): `isTeamChange` (typically `null`), `prevTeam`, `newTeam`.
`depthStale` is **vet-only** — do not add it to the rookie key set (mirrors how D1
keys are rookie-only).

---

## Docs updates (apply mechanically)

### `docs/projection.md`
1. **Step 8 row** (line 29) — replace:
   `| 8 | **Depth chart** | Starter ×1.05, Backup ×0.88, Depth 3+ ×0.68 |`
   with:
   `| 8 | **Depth chart** | Starter ×1.05, Backup ×0.88, Depth 3+ ×0.68. **Staleness guard:** a penalty-tier order (≥2) on a player who started ≥8 games last qualifying season is treated as a stale offseason depth chart → held neutral (1.0), `depthStale=true`. Null order → neutral (unchanged). |`
2. **New subsection** after the veteran-pipeline table (before "Per-opportunity
   efficiency"), titled **"Team-change handling (offseason)"**, stating: per-season
   team is not stored (only current team via `playersMap`), so robust detection is
   unavailable; best-effort detection diffs the most-recent prior projection
   snapshot's `nfl_team` vs current team (`priorTeamByPlayer`), forward-only with
   the snapshot coverage limitations; on a confirmed change (`isTeamChange===true`)
   the Step 3 share-trend and Step 5h team-RZ-share signals (old-team-attributed)
   are neutralized to 1.0 while player-intrinsic and new-team (Steps 7/7b) signals
   are kept; confidence is intentionally NOT changed; full re-anchoring and
   per-season-team recovery are deferred. List new factors keys
   `isTeamChange`, `prevTeam`, `newTeam` (both paths) and `depthStale` (vet only).
3. **Step 5h paragraph** (the "Data-quality limitation" note, ~line 55) — append a
   sentence: team-changers' Step 5h share is additionally neutralized to 1.0 when a
   team change is detected (see Team-change handling).

### `README.md`
- **Scope line** (line 70): the count is currently **stale** at `56 vet / 42
  rookie`. Current code is `69 vet / 48 rookie`; **this task lands at `73 vet / 51
  rookie`**. Update the line to `73 vet / 51 rookie`.

### `CLAUDE.md`
1. **Factors contract** (line 103): `69 vet keys / 48 rookie keys` →
   `73 vet keys / 51 rookie keys`.
2. **`teamContext.js` row** (line 79) — no signature change; optionally note the
   current-team attribution limitation is now surfaced via team-change capture
   (leave as-is unless trivially clarifying).
3. **Cross-repo contracts → Snapshot shape** (line 125): note that the snapshot
   `projection.factors` object gains `isTeamChange`/`prevTeam`/`newTeam`/`depthStale`
   (additive; no `schemaVersion` bump). See Cross-repo §.
4. If `listCacheRecords` is added to `cache.js`, update the `cache.js` row
   (line 73) to mention it.

If, after implementing, any of the above is already accurate, leave it. None are
"none" — all listed files need edits.

---

## Tests

### New tests
Co-locate a unit test `src/utils/teamChange.test.js` (or extend an existing
seasonProjection integration test) exercising `computeNextSeasonProjection`:

1. **Depth staleness — penalty suppressed.** Vet WR, `depthMap` order 3, most-recent
   qualifying season `gamesStarted: 15` → `factors.depthFactor === 1.0`,
   `factors.depthStale === true`, and `adjustmentSummary` includes
   `'Depth chart unconfirmed — penalty held'`.
2. **Depth staleness — penalty applies.** Same but `gamesStarted: 2` →
   `depthFactor === 0.68`, `depthStale === false`.
3. **Depth null — unchanged.** No depthMap entry → `depthFactor === 1.0`,
   `depthStale === false`.
4. **Starter boost unaffected.** order 1 → `depthFactor === 1.05`,
   `depthStale === false`.
5. **Team change detected → neutralize.** `priorTeamByPlayer = { [id]: 'GB' }`,
   `playersMap[id].team = 'NYJ'`, with non-trivial share history AND a non-neutral
   `teamRzShareFactor` setup → `factors.isTeamChange === true`,
   `factors.prevTeam === 'GB'`, `factors.newTeam === 'NYJ'`,
   `factors.shareTrend === 1.0`, `factors.teamRzShareFactor === 1.0`,
   `factors.teamRzShare === null`, summary includes `'Team change — old-team signals neutralized'`.
6. **Team change unknown (no prior snapshot).** `priorTeamByPlayer = null` →
   `isTeamChange === null`, `prevTeam === null`, `newTeam === player.team`, and
   share/RZ factors equal the un-neutralized values (byte-identical to baseline).
7. **Same team → no neutralize.** `priorTeamByPlayer = { [id]: player.team }` →
   `isTeamChange === false`, signals untouched.
8. **Rookie path team-change keys present.** Rookie fixture → `factors` contains
   `isTeamChange` (null), `prevTeam`, `newTeam`; does NOT contain `depthStale`.
9. **`loadPriorSnapshotTeams`** unit (mock `listCacheRecords`/`getCacheRecord`):
   picks the latest date strictly before `now`; returns `null` when none precede
   `now`; maps `players[pid].nfl_team` correctly.

### Existing tests that must change
- **`src/__tests__/factorsSchema.test.js`**:
  - `VET_FACTORS_KEYS`: add `isTeamChange`, `prevTeam`, `newTeam`, `depthStale`.
  - `ROOKIE_FACTORS_KEYS`: add `isTeamChange`, `prevTeam`, `newTeam`.
  - Update header/count comments (`:16–18`, `:68`) and the two `it(...)` titles
    (`:185` "69 factors keys" → "73"; rookie equivalent → "51").
  - Any `SHARED_OPTIONS`/`ROOKIE_OPTIONS` calls need no new field (`priorTeamByPlayer`
    defaults to `null` → `isTeamChange` null, schema still satisfied). Confirm the
    vet fixture (`gamesStarted` absent in `vetSeason`) yields `depthStale === false`
    (order 1 in fixture anyway) — no value assertions there beyond the key set.
- **Snapshot-related tests** (if any assert the exact `factors` key set inside a
  built snapshot's `projection`): update to include the four new keys. Grep
  `src/__tests__` / co-located snapshot tests for hard-coded factors key lists.

No other existing expected values change (the new behaviour is gated: `depthStale`
only flips on order≥2 + recent starter; neutralization only on a true detection).

---

## Cross-repo impact

**`sleeper-dashboard-data`.** The projection `factors` object is embedded
verbatim in `projection-snapshots/<date>` → exported to `snapshots/<date>.json`.
This task **adds four factors keys** (`isTeamChange`, `prevTeam`, `newTeam`,
`depthStale`; rookie path omits `depthStale`). This is **additive** — no snapshot
`schemaVersion` bump is required. If the data repo's snapshot README or
`scripts/register-snapshots.mjs` **enumerates or validates** the factors key set,
mirror the four additions there. If it stores the projection blob opaquely, no
change is needed — but **call this out explicitly in the task summary** so the
data repo owner can confirm.

The deferred per-season-team recovery (§6.1) is a **separate, larger** cross-repo
contract (season-totals schema bump + `lib/sleeper.mjs`) — not touched here.
