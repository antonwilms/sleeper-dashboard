# Injury-season vs career-backup heuristic refinement

**Status:** planned (opus). Implement on sonnet per the two-session flow.
**Scope:** the durability + projected-games defect only. Do **not** touch the
absence-shape refinement, the absenceCause/ESPN cause-labeling work, or the
"active-but-unproductive (snaps, no points)" labeling question (see §Out of scope).

---

## Problem

Both scoring modules classify an injury season with one crude inline rule:

```js
gamesPlayed < 10 && dnpWeeks >= 3
```

This conflates **"couldn't play"** (injury / suspension / illness — a real
contributor who lost time) with **"wasn't the guy"** (a career backup / depth
player who dressed but never had a meaningful role). The Will Levis case: a
backup QB shows low `gamesPlayed` + DNP weeks, gets flagged as injured, and is
wrongly penalised on durability (dynasty) and projected games (projection).

The rule lives in exactly two places (confirmed — no other consumers):

- `src/utils/dynastyScore.js:788–790` — reliability → durability sub-score
  (`injurySeasonCount`; penalises `×0.85` for ≥2, `×0.70` for ≥3).
- `src/utils/seasonProjection.js:470–472` — Step 6 projected games
  (`injurySeasons`; penalises `×0.88` for ≥2, `×0.78` for ≥3).

## Goal

A season counts as injury-affected only when (a) the base low-games trigger
fires **and** (b) there is **positive per-season evidence the player was a
meaningful contributor** — in that season **or an adjacent (±1) season**. A
player who was never a contributor that season (career backup / near-zero snaps
when active) is **not** flagged, no matter how few games they played.

This is an intentional behaviour change. Affected players' durability scores and
projected games **will move, and that is correct.**

---

## Decision: shared helper

The injury-season *definition itself* is genuinely shared (identical rule in
both modules) — this is exactly the "only unify what is genuinely shared" case
from CLAUDE.md → Invariants. The surrounding scoring (penalty multipliers,
iteration scope, downstream use) stays per-module and is **not** unified.

Create a new leaf helper module `src/utils/durabilitySignals.js`, modelled on
`projectionSignals.js` (small, pure, shared by both `dynastyScore.js` and
`seasonProjection.js`). It imports nothing from either consumer.

---

## New module: `src/utils/durabilitySignals.js`

### Constants (signal thresholds — picked here, document in code)

```js
// Approx. games an NFL team plays in a season — used to convert the season-total
// team snap count into a per-game rate so we can estimate snap share among the
// games the player was actually active.
const TEAM_GAMES = 17

// Contributor-evidence thresholds (positive evidence the player had a real role).
const SNAP_CONTRIB_FLOOR = 0.50   // ≥50% of team snaps in the games he was active
const MIN_STARTS         = 4      // started ≥4 games → a real role, not a spot fill
const START_RATE_FLOOR   = 0.50   // OR started ≥50% of the games he was active
const VOLUME_FLOOR = {            // baseline starter volume per ACTIVE game
  QB: 15,   // pass_att / gp
  RB: 8,    // rush_att / gp
  WR: 4,    // rec_tgt  / gp
  TE: 3,    // rec_tgt  / gp
}
const VOLUME_KEY = { QB: 'pass_att', RB: 'rush_att', WR: 'rec_tgt', TE: 'rec_tgt' }
```

### Internal helpers

```js
// Snap share among active games (2021+ only — off_snp/tm_off_snp exist from ~2021).
// Returns null when the snap fields are absent (graceful pre-2021 degradation).
function activeSnapShare(stats, gp) {
  const snaps     = stats?.off_snp
  const teamSnaps = stats?.tm_off_snp
  if (snaps == null || teamSnaps == null || teamSnaps <= 0 || gp <= 0) return null
  const teamSnapsPerGame = teamSnaps / TEAM_GAMES
  if (teamSnapsPerGame <= 0) return null
  return (snaps / gp) / teamSnapsPerGame      // ≈ snap share in active weeks
}

// Per-active-game volume for the position's primary opportunity stat.
// Returns null when the volume key is absent.
function volumePerActiveGame(stats, position, gp) {
  const key = VOLUME_KEY[position]
  const v   = key ? stats?.[key] : null
  if (v == null || gp <= 0) return null
  return v / gp
}
```

### Exported: `wasContributorSeason(seasonData, position)`

Positive per-season evidence the player had a meaningful role. **Signal priority
(first hit wins; falls through to the next when a higher-priority signal is
absent, NOT when it is merely below floor — see note):**

```js
export function wasContributorSeason(seasonData, position) {
  if (!seasonData) return false
  const gp = seasonData.gamesPlayed ?? 0
  if (gp <= 0) return false
  const stats = seasonData.stats ?? {}

  // Priority 1 — snap share when active (best signal, 2021+).
  const snap = activeSnapShare(stats, gp)
  if (snap != null && snap >= SNAP_CONTRIB_FLOOR) return true

  // Priority 2 — started games (all eras; gamesStarted present back through history).
  const gs = seasonData.gamesStarted
  if (gs != null && (gs >= MIN_STARTS || gs / gp >= START_RATE_FLOOR)) return true

  // Priority 3 — baseline per-active-game volume (pre-2021 fallback).
  const vol = volumePerActiveGame(stats, position, gp)
  if (vol != null && vol >= VOLUME_FLOOR[position]) return true

  return false
}
```

**Note on fall-through:** the function returns `true` on the *first positive*
signal and otherwise keeps checking. A high-priority signal that is *present but
below floor* (e.g. low snap share) does NOT short-circuit to `false` — a lower
signal can still establish contributor status, and (more importantly) an
adjacent season can rescue via `classifyInjurySeason`. Only the absence of *all*
positive evidence yields `false`. This is what makes a genuine backup (low
snaps, no starts, thin volume, in this season and both neighbours) come back
`false`, while a star hurt early (few snaps this year but a full role last year)
comes back injury-affected via the neighbour check.

### Exported: `classifyInjurySeason(careerStats, playerId, position, season)`

```js
export function classifyInjurySeason(careerStats, playerId, position, season) {
  const sd = careerStats?.[season]?.[playerId]
  if (!sd) return false
  const gp  = sd.gamesPlayed ?? 0
  const dnp = sd.dnpWeeks ?? 0
  if (!(gp < 10 && dnp >= 3)) return false   // unchanged base trigger

  // Positive contributor evidence in this OR an adjacent (±1) season.
  return wasContributorSeason(sd, position)
      || wasContributorSeason(careerStats?.[season - 1]?.[playerId], position)
      || wasContributorSeason(careerStats?.[season + 1]?.[playerId], position)
}
```

Pure, null-safe, no side effects. Returns `boolean`.

### Data shapes consumed (per `careerStats[season][playerId]`)

```
{ gamesPlayed, gamesStarted, dnpWeeks, byeWeeks, fantasyPoints,
  stats: { off_snp, tm_off_snp, rush_att, rec_tgt, pass_att, ... } }
```

Field-existence confirmed against `src/__fixtures__/season-totals-2025.json`:
`off_snp` & `tm_off_snp` present in 945/2750 entries (offensive players, ~2021+);
`gamesStarted` present 2750/2750; `rush_att`/`rec_tgt`/`pass_att` present in the
data historically. No new stat key is introduced — all five are already
referenced by existing projection code and already in the stat-key contract.

---

## Call-site changes

### `src/utils/dynastyScore.js`

Current (lines ~786–790, inside the durability block):

```js
    // A season is an injury season only when gp-confirmed absences (dnpWeeks ≥ 3) back up the low game count.
    // This prevents bye-heavy or low-sample rookie seasons from being flagged as injury seasons.
    injurySeasonCount = allPlayerSeasons.filter(({ gamesPlayed, dnpWeeks }) =>
      gamesPlayed < 10 && dnpWeeks >= 3
    ).length
```

The durability block iterates `allPlayerSeasons` (a derived array that has lost
the `season` key). To call `classifyInjurySeason` we need the season number, so
count over `allSeasons` directly instead of the derived array:

```js
    // A season is injury-affected only when the low-games trigger is backed by
    // positive evidence the player was a meaningful contributor (this season or
    // an adjacent one) — distinguishes "couldn't play" from "wasn't the guy".
    // See src/utils/durabilitySignals.js and docs/dynasty-scoring.md → Reliability.
    injurySeasonCount = allSeasons.filter(
      season => classifyInjurySeason(careerStats, playerId, position, season)
    ).length
```

- Add import at top: `import { classifyInjurySeason } from './durabilitySignals'`.
- `allSeasons`, `careerStats`, `playerId`, `position` are all already in scope.
- `injurySeasonCount` is still declared at line 782 and still gates the
  `×0.85 / ×0.70` durability penalty (lines 792–793) and is still emitted in
  `signals.injurySeasonCount` (line 933). No other change to the durability block.
- `weightedAvgGames` / `allPlayerSeasons` stay as-is (still used for base GP/17).

### `src/utils/seasonProjection.js`

Current (line 470):

```js
  const injurySeasons = qualifying.filter(s => s.gamesPlayed < 10 && s.dnpWeeks >= 3).length
```

Replace with:

```js
  // Injury-season count now requires positive contributor evidence (this season
  // or an adjacent one) so career backups aren't penalised. See durabilitySignals.js.
  const injurySeasons = qualifying.filter(
    s => classifyInjurySeason(careerStats, playerId, position, s.season)
  ).length
```

- Add import at top: `import { classifyInjurySeason } from './durabilitySignals'`.
- `careerStats`, `playerId`, `position` are all in scope; `qualifying` entries
  carry `.season`. The `×0.88 / ×0.78` penalty (lines 471–472) is unchanged.
- **Iteration scope is intentionally kept per-module** (dynasty counts over all
  gp>0 seasons; projection counts only over `qualifying` gp≥8 seasons). This is
  pre-existing divergence in the loop scope, not in the rule — `classifyInjurySeason`
  evaluates whatever season it is handed. Do not unify the iteration.

### New diagnostic factor: `injurySeasons` (vet path only)

Record the refined count in the projection `factors` object for backtesting /
snapshot visibility (without it, a moved `projectedGames` is invisible in the
factors contract). Add **one** key to the **vet** return block (near
`durabilityFactor` / `absenceShape`, lines ~629–635):

```js
      injurySeasons,
```

- This is a vet-only key. **Do NOT add it to the rookie path** (the rookie
  factors set is a separate, smaller set — same as `regressionFactorRaw`,
  `consistencyScore`, etc. which are vet-only).
- Capture-only: it is diagnostic and does not itself move `projectedPPG`
  (the existing `×0.88/×0.78` on `avgGames` is what moves `projectedGames`).
- Vet factors count goes **68 → 69**. Update the contract test and docs (below).

---

## Worked sanity checks

| Scenario | Base trigger | Contributor evidence | Result |
|---|---|---|---|
| Will Levis backup QB (gp 6, dnp≥3, gs 0, off_snp ~30/tm 900, pass_att ~20; neighbours also backup) | fires | snap ≈ 0.09 ✗, starts 0 ✗, pass_att/gp ≈ 3.3 ✗; neighbours ✗ | **not injury** ✓ (fix) |
| Star RB hurt mid-year (gp 7, dnp 5, gs 7, rush_att 140) | fires | startRate 1.0 ✓ | injury ✓ |
| Pre-2021 star hurt (no snap data, gs 7) | fires | starts ✓ (snap null → fall through) | injury ✓ (graceful) |
| Star hurt Week 2 (gp 8, dnp 6, gs 2, thin self stats) but full role prior year | fires | self ✗ → neighbour (prev) ✓ | injury ✓ (adjacent rescue) |
| Healthy 17-game starter | does not fire (gp≥10) | n/a | not injury ✓ (unchanged) |

---

## Docs updates

### `docs/dynasty-scoring.md`
- **Line 100**, replace:
  `- Injury season = \`gamesPlayed < 10 AND dnpWeeks ≥ 3\``
  with:
  ```
  - Injury season = `gamesPlayed < 10 AND dnpWeeks ≥ 3` **AND** positive
    evidence the player was a meaningful contributor that season or an adjacent
    (±1) season (meaningful snap share when active, started games, or baseline
    per-active-game volume). Career backups who simply never had a role are not
    flagged. Shared definition: `src/utils/durabilitySignals.js`
    (`classifyInjurySeason` / `wasContributorSeason`). Signal priority: snap
    share when active (2021+) → games started → per-active-game volume (pre-2021
    fallback).
  ```
- **Line 99** (reliability durability bullet): append a clause —
  `… penalised ×0.85 for 2+ injury seasons, ×0.70 for 3+ (injury seasons now
  gated by contributor evidence — see below).`

### `docs/projection.md`
- **Line 26** (Step 6 table row), change the injury-season clause:
  `… ×0.88/×0.78 for injury-season count …`
  →
  `… ×0.88/×0.78 for injury-season count (each season gated by
  \`classifyInjurySeason\` from \`durabilitySignals.js\` — low games **and**
  contributor evidence in that or an adjacent season; career backups excluded) …`
- Add a short prose paragraph after the table (near the Step 5f/5g block, or
  immediately after the §Veteran pipeline table) documenting the shared helper
  and the new `injurySeasons` factor key:
  ```
  **Injury-season gate (Step 6):** `classifyInjurySeason` (`src/utils/durabilitySignals.js`,
  shared with `dynastyScore.js`) keeps the original low-games trigger
  (`gamesPlayed < 10 && dnpWeeks ≥ 3`) but only counts the season when there is
  positive evidence the player was a contributor — in that season or an adjacent
  one — via `wasContributorSeason`: snap share among active games
  (`off_snp/tm_off_snp` vs a 17-game team-snap rate, ≥0.50; 2021+), else games
  started (≥4 or ≥50% of active games), else per-active-game primary volume
  (`pass_att`/`rush_att`/`rec_tgt` ≥ position floor; pre-2021 fallback). The
  count is recorded as the vet-only `factors.injurySeasons` diagnostic
  (capture-only — it does not itself move `projectedPPG`). The absence-shape
  refinement below is unchanged.
  ```
- **Vet factors count:** if any "68"/"vet factors" count text exists in
  projection.md, bump to 69. (Current projection.md has no numeric vet-key count
  in prose; the canonical count lives in CLAUDE.md + factorsSchema.test.js.)

### `CLAUDE.md`
- **Line 102** (Factors contract): `68 vet keys / 48 rookie keys` → `69 vet keys
  / 48 rookie keys`.
- **src/utils navigation table** (after the `regressionSignals.js` row, ~line 89):
  add:
  ```
  | `durabilitySignals.js` | `classifyInjurySeason`, `wasContributorSeason` — injury-vs-backup season classification; shared by `dynastyScore.js` (durability) and `seasonProjection.js` (Step 6). Leaf module (imports nothing) |
  ```

### `docs/ui.md`
- **Line 188** references an "injury season badge". Meaning is unchanged
  (fewer false positives); **no edit required**. Mention in the task summary that
  the badge now shows fewer/no false-positive injury seasons for backups.

### `README.md`
- No injury/durability content (grep clean). **No edit required.**

---

## Tests to add

### New: `src/utils/durabilitySignals.test.js` (co-located unit)
Cover `wasContributorSeason` and `classifyInjurySeason` directly.

`wasContributorSeason`:
1. **Snap contributor (2021+):** `{ gamesPlayed: 8, gamesStarted: 0, stats: { off_snp: 450, tm_off_snp: 900 } }`, WR → activeSnapShare = (450/8)/(900/17) ≈ 1.06 ≥ 0.50 → `true`.
2. **Snap backup:** `{ gamesPlayed: 6, gamesStarted: 0, stats: { off_snp: 30, tm_off_snp: 900, pass_att: 20 } }`, QB → snap ≈ 0.09 ✗, starts 0 ✗, pass_att/gp ≈ 3.3 ✗ → `false`.
3. **Started role (all eras), no snap data:** `{ gamesPlayed: 7, gamesStarted: 7, stats: {} }`, RB → startRate 1.0 → `true`.
4. **Few starts but all of active games:** `{ gamesPlayed: 2, gamesStarted: 2, stats: {} }`, QB → startRate 1.0 → `true`.
5. **Volume fallback (pre-2021, no snap, low starts):** `{ gamesPlayed: 8, gamesStarted: 0, stats: { rush_att: 90 } }`, RB → rush_att/gp = 11.25 ≥ 8 → `true`.
6. **Thin volume backup:** `{ gamesPlayed: 8, gamesStarted: 0, stats: { rush_att: 20 } }`, RB → 2.5 < 8, no snap, no starts → `false`.
7. **No data at all:** `{ gamesPlayed: 5, gamesStarted: null, stats: {} }` → `false` (no positive evidence).
8. **gp 0 / null season:** `wasContributorSeason(null, 'RB')` and `{ gamesPlayed: 0 }` → `false`.
9. **Snap below floor but starts rescue same season:** `{ gamesPlayed: 8, gamesStarted: 6, stats: { off_snp: 100, tm_off_snp: 900 } }` → snap ≈ 0.24 ✗ → falls through → gs 6 ≥ 4 → `true` (asserts no false short-circuit).

`classifyInjurySeason` (build a small `careerStats` map):
10. **Base trigger off (gp≥10):** season gp 12, dnp 5 → `false` regardless of evidence.
11. **Base trigger off (dnp<3):** gp 6, dnp 1 → `false`.
12. **Injury contributor:** gp 7, dnp 5, gamesStarted 7 → `true`.
13. **Backup, all seasons backup:** target gp 6/dnp 3/gs 0/thin stats, neighbours likewise → `false`.
14. **Adjacent rescue (prev):** target gp 8/dnp 4/gs 1/thin stats (self ✗) but season-1 a full starter → `true`.
15. **Adjacent rescue (next):** symmetric, season+1 is the contributor → `true`.
16. **Missing season / missing player:** `classifyInjurySeason(cs, 'nobody', 'RB', 2024)` → `false`.

### Changed contract test: `src/__tests__/factorsSchema.test.js`
- Add `'injurySeasons'` to `VET_FACTORS_KEYS` (the test's "68" comment/count → 69).
- Update the header comment count `68 vet / 48 rookie` → `69 vet / 48 rookie` and
  the inline `(55 explicit + 13 ktcSignals)` note → `(56 explicit + 13 ktcSignals)`.
- Update test titles `…emits exactly the documented 68 factors keys…` → `69`.
- Add a value assertion in the vet "value types" test:
  `expect(typeof r.factors.injurySeasons).toBe('number')` and
  `expect(r.factors.injurySeasons).toBeGreaterThanOrEqual(0)`.
  (The vet fixture has all healthy seasons → `injurySeasons === 0`.)
- **Do not** add `injurySeasons` to `ROOKIE_FACTORS_KEYS`.

### New behavioural tests in `src/utils/seasonProjection.test.js`
Add a describe block exercising Step 6:
- **Backup not penalised:** vet WR with `qualifying` seasons including one gp 8 /
  dnp 4 / gamesStarted 0 / thin stats (no off_snp), neighbours also backup →
  assert `factors.injurySeasons === 0` and `projectedGames` is **not** reduced
  by the injury multiplier (compare to the same series with that season healthy).
- **Real injury still penalised:** same low-games season but `gamesStarted` high
  (or strong snap share) → `factors.injurySeasons ≥ 1`; with ≥2 such seasons,
  assert `projectedGames` is lower than the all-healthy control.
- Use existing `makeSeasonEntry` / `makeVet` factories; set `gamesStarted` and
  `dnpWeeks` explicitly (factories default `dnpWeeks: 0`).

### New behavioural test in `src/utils/dynastyScore.test.js`
- **Backup durability not penalised:** construct a player whose career includes a
  low-games/high-dnp **backup** season (gs 0, thin stats) → assert
  `signals.injurySeasonCount === 0` and `components.reliability.durabilityScore`
  is **not** reduced by the `×0.85/0.70` injury penalty (vs an equivalent series
  where that season is a started/injury season → `injurySeasonCount ≥ 1` and a
  lower `durabilityScore`).

### Existing tests whose expected values change
- **None.** Verified: no existing test in `dynastyScore.test.js` or
  `seasonProjection.test.js` exercises a qualifying/low-games season that the old
  rule flags — every durability snapshot already has `injurySeasonCount: 0` and
  full-GP seasons, and the only low-games fixtures (e.g. `P_ROO_Y4` gp 4) are
  sub-qualifying and never entered the count. The factorsSchema test changes are
  contract-count updates (above), not value corrections.
- Run `npm test`, plus `factorsSchema.test.js` and `statKeysContract.test.js`
  explicitly (per CLAUDE.md done-definition). `statKeysContract` should stay
  green — no new stat key is introduced (all five already referenced + present in
  the fixture) — but run it to confirm the contract scanner picks up the new
  module cleanly.

---

## Cross-repo impact

`sleeper-dashboard-data` (snapshot contract): adding the vet-only
`factors.injurySeasons` key changes the verbatim `computeNextSeasonProjection`
output that `projectionSnapshot.js` writes into `projection-snapshots/<date>`
(exported by `classifyKey` → `snapshots/<date>.json`). The change is **additive
and non-breaking** — the data repo stores the snapshot verbatim and does not
validate `factors` keys — but new snapshots will carry the extra field. **Action
for the sibling repo: none required**; note it in the task summary so any
snapshot schema/analytics there is aware of the additional field. No
`season-totals` schemaVersion bump, no enrichment/manifest/CFBD change.

---

## Out of scope (flag, do not build)

- **Absence-shape refinement** (`seasonProjection.js` Step 6 continued, lines
  ~474–503): uses `availability.absenceSegments` / `longestAbsence`, a *different*
  signal — not the injury-season rule. A pure backup's non-play weeks could in
  principle trip `recurringAbsenceSeasons` / `hiddenAbsenceSeasons`, but gating
  that on contributor evidence is a separate, non-trivial change with its own
  thresholds. **Flagged as a follow-up; not built here.**
- **"Active-but-unproductive" labeling** (snaps but ~no points): explicitly out
  of scope per the task; not trivially adjacent.
- **True cause labeling** (injury vs suspension vs scratch): waits on the ESPN
  integration and the `availability.absenceCause` placeholder (currently
  `"unknown"`). Do not attempt cause-labeling here.

---

## Step sequence (for the implementer)

1. Create `src/utils/durabilitySignals.js` with constants, internal helpers, and
   exported `wasContributorSeason` + `classifyInjurySeason`.
2. Write `src/utils/durabilitySignals.test.js`; run it green.
3. Wire `dynastyScore.js`: import, replace the `injurySeasonCount` computation,
   update the inline comment.
4. Wire `seasonProjection.js`: import, replace the `injurySeasons` computation,
   add the `injurySeasons` vet factor key.
5. Update `factorsSchema.test.js` (add key, counts, titles, value assertion).
6. Add the behavioural tests to `seasonProjection.test.js` and `dynastyScore.test.js`.
7. Update docs (`dynasty-scoring.md`, `projection.md`) and `CLAUDE.md`
   (factors count + nav table row).
8. `npm test` green; `npm run build` clean. Fix anything red before done.
9. In the task summary, call out the cross-repo snapshot note and the
   absence-shape follow-up.
