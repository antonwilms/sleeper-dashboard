# Rookie availability — projected games (calibration arc, slice 2)

**Opened:** 2026-09-09, after slice 1 (`rookie-calibration.md`) landed at app `9fe7346` and was verified on `origin/main`.
**Scope source:** slice 1 §3 item 7, which excluded this deliberately: "A 4th-string undrafted QB is over-projected in *availability* as much as in level, and the discount only addresses level… Next slice in this arc."
**Evidence base:** built in Session 1 from `sleeper-dashboard-data` `nfl/season-totals/{2012…2025}.json` (`gamesPlayed` per player-season) joined to `nflverse/playerids.json` `bySleeper` (draft round/pick, `undrafted`, entry year) with positions from its `ids` map — **3,848 rookie-path player-target-seasons, target years 2013–2025**, assembled under the app's own routing predicate. `nflverse/depth/{2013…2024}.json` was used to test one candidate refinement, then rejected (§1 Q3).
**Live reference:** `snapshots/2026-09-07.json` (288 rookie-path rows, captured **before** slice 1 landed) and `raw/-players-nfl.json` (`years_exp`, `age`).
**Review pass:** plan-reviewer 2026-09-09, 19 flags. All triaged in §10; one changed the design, one changed the deliverables, the rest corrected arithmetic and prose. Every figure below is post-flag.

**Slice 1 is not revisited.** Its PPG constants, `draftCapitalStatus`, the `[0.45, 1.85]` clamp and the calibration multiplier are inputs here, unchanged. The veteran path stays untouched.

---

## 1. The questions, resolved

### The defect

`rookieProjection` sets `projectedGames = 14` for every rookie-path player (`src/utils/seasonProjection.js:237`), and `projectedTotalPts = projectedPPG × projectedGames` (`:238`). Measured against realised games on the app's own population, that constant carries a **mean absolute error of 9.4 games per player**. It is the largest single miscalibration left in the projection.

**Where it is visible, stated precisely** (an earlier draft overstated this and the reviewer was right to flag it):

- `src/components/market/Market.jsx:537` — the Market table's projected-games column, currently a wall of identical 14s for every rookie.
- `src/components/dp/PlayerDetailModal.jsx:278` — the pop-up's "PPG · N games projected" note.
- `src/utils/marketFilters.js:152` — the `minProjectedGames` filter, which today excludes **no** rookie at any threshold up to 14.
- `src/components/dp/PlayerDetailTabs.jsx:111` — `gamesProj`.
- `src/components/portfolio/Portfolio.jsx:357-371` — a projected-points tile that is **starters-only**, so it moves only when a fringe rookie is in the starting lineup, not with the pool at large.
- `src/components/roster/MyTeamView.jsx:25` and `PlayerCard.jsx:42` — a roster total and a per-card total, both in `src/components/roster/`, which CLAUDE.md's navigation map lists as **dormant**.

So the pool-level figures in §5.5 describe the model, not a rendered total. The rendered defect is the games column, the note, and a filter that cannot filter.

The magnitude is not subtle. Mean games realised, by the draft grouping slice 1 already ships, debut seasons only (absence from season totals counted as 0 games, the honest denominator):

| group | n | mean games | median | % playing 0 | % reaching 14 |
|---|---|---|---|---|---|
| r1 | 127 | 12.8 | 14 | 4% | 54% |
| day-2 (r2–r3) | 276 | 12.3 | 14 | 5% | 55% |
| day-3 (r4–r7) | 632 | 8.0 | 9 | 23% | 29% |
| undrafted | 1,036 | 3.3 | 0 | 52% | 8% |

14 is roughly right for round 1 and day 2, and wrong by a factor of two to four below that. Position matters enormously inside a group and asymmetrically: a day-3 QB plays 1.9 games, a day-3 RB 9.9.

### Q1 · Grouping → **reuse slice 1's four groups; do not split round 1**

Splitting round 1 at pick 8 was tested and does not pay: on the shipped population pooled over experience, picks 1–8 mean **12.1** games (n=57) and picks 9–32 mean **12.3** (n=95). One grouping now serves both slices, which is worth more than 0.2 games.

### Q2 · Does experience belong in the key → **yes, and it reaches the population that justifies it**

The rookie path serves three populations, and the live mix is 123 rows at `years_exp` 0, 119 at 1, and **46 at ≥2** — journeymen who never established. Realised games collapse with experience wherever the cells are thick enough to measure:

| group × experience | mean games | n |
|---|---|---|
| day-3, debut | 8.0 | 632 |
| day-3, second year | 4.0 | 274 |
| day-3, third year or later | 3.4 | 213 |
| undrafted, debut | 3.3 | 1,036 |
| undrafted, second year | 2.5 | 785 |
| undrafted, third year or later | 4.2 | 396 |
| day-2, second year | 6.9 | 44 |
| day-2, third year or later | 4.0 | 40 |

A second-year day-3 RB plays 3.5 games where the experience-blind cell says 7.9. That is the case the key exists for, and — unlike the day-2 example an earlier draft used — the ladder actually reaches it. Verified against the live snapshot: of the 46 rows at `years_exp ≥ 2`, **40 resolve to an experience-keyed cell**, 5 fall through to an experience-blind one, and 1 has unknown draft status. Note the undrafted third-year figure is **not** monotone (4.2 against 2.5 in year two): an undrafted player still on a roster in year three has survived a selection. A scalar experience decay would get that backwards, which is why this is a keyed table and not a multiplier.

Leave-one-target-year-out, mean absolute error in games over all 3,848 rows, predictions rounded as they will ship:

| scheme | MAE |
|---|---|
| constant 14 (shipped) | 9.424 |
| group × position → group | 4.234 |
| **+ experience rungs (the ladder in §2.1)** | **4.055** |

The aggregate gain from experience is 0.18 games, the same marginal size as things rejected in slice 1 and in Q3 below. It is accepted here because the aggregate is the wrong yardstick for a rung whose job is a subpopulation: it introduces **no thin cells** (only cells at n≥30 ship), the key transfers exactly (`years_exp` is the same field in both repos, unlike Q3's depth), and on the rows it touches it halves a known bias rather than reducing noise. The rejections elsewhere are about constants that would be *wrong*; this is about constants that are *right but rare*.

### Q3 · Does the depth chart belong → **no, and the reason is a source mismatch, not a weak signal**

Week-1 depth order is the strongest single predictor of games — on the debut population it scores a leave-one-out MAE of 3.593 against 4.493 for draft group alone (both figures on that population and grouping, not the §Q2 panel's) — and D5 made it historically available. It is still rejected, on two findings:

1. **The powerful part does not transfer between sources.** Almost all of depth's power sits in the *off-chart* bucket (mean 2.2 games, 61% playing none). But "off the nflverse week-1 chart" and "Sleeper `depth_chart_order == null`" are different populations: the historical off-chart share is **52%**, the live Sleeper share on the comparable population is **31%**, because Sleeper's chart runs deeper. Fitting on one and applying to the other is the reconstruction-error trap that stopped the veteran constant in §8.1 of the analysis.
2. **The part that does transfer is weak.** Depth 1 and 2 mean the same thing in both sources — the top two at a position are the top two however deep the chart runs. Restricted to that source-invariant encoding, depth alone scores 5.144, worse than group × position, and added to the group ladder as a positive-only uplift it buys **0.155 games** (~3.6%).

There is also no rookie equivalent of the veteran staleness guard: `depthStale` keys on `gamesStarted ≥ 8` last season (`:629`), and a rookie has no last season, so a stale April chart is indistinguishable from a real September one. Draft capital never goes stale. Deferred with the figures recorded so no later session re-derives them.

### Q4 · Does this double-count slice 1's discount → **no, and the residual is bounded and quantified**

Slice 1's PPG constants were fitted on rows that reached a `gp ≥ 6` outcome gate, so shipped rookie PPG estimates points per game *given a real season*. Multiplying by unconditional mean games estimates expected total points as a product of two separately-fitted terms, which overstates when low-game players also score less per game — as they do. The overstatement is bounded by the share of a cohort's games contributed by its sub-6-game population, computed on the four shipped groups over the whole rookie-path population:

| group | n | mean games | mean games given ≥6 | share of games from the ≥6 population | implied overstatement |
|---|---|---|---|---|---|
| r1 | 152 | 12.2 | 13.8 | 98% | 2% |
| day-2 | 360 | 10.7 | 13.4 | 97% | 3% |
| day-3 | 1,119 | 6.2 | 12.3 | 90% | 10% |
| undrafted | 2,217 | 3.2 | 11.4 | 82% | **18%** |

Worst case: expected total points for undrafted rookies overstated by 18%, in the same direction as slice 1's own ~5% under-correction. Today's error on that same population is **+320%** (14 games against 3.2). Going from 320% to 18% is the trade; the residual is documented, not modelled, and the proper fix is named in §3 item 4.

### Q5 · Validation → **same gate as slice 1, with a weaker provenance story that is stated rather than glossed**

Session 1 ran leave-one-target-year-out (13 folds, one per target season, cells refit on the other 12); figures in Q2. Session 2 commits the panel as a fixture with a provenance test and an out-of-sample test (§5.3).

**The honest limitation.** Slice 1's fixture is a trimmed copy of a committed data-repo artifact at a named commit, so anyone with both repos can verify it by comparison. This panel has no committed artifact behind it — Session 1 assembled it from two live data-repo families — so §5.3's provenance test proves only that the constants match the fixture, not that the fixture's join and predicate were right. Nothing in the suite can falsify the derivation. Three consequences, all accepted deliberately:

- The fixture carries the derivation **recipe** in its `source` block, precise enough to re-derive by hand (§5.3), and integrity assertions that make it internally consistent and tamper-evident.
- The durable fix is a committed availability panel in the data repo, filed as §7 item 1 and **not planned here**.
- An earlier draft proposed shipping a generator script that reads the sibling working tree from an env path. That is dropped — see §10, it would have created an executable cross-repo reader no registry entry covers, for provenance it could not actually guarantee.

---

## 2. What changes

App-side only. **No new data input, no new loader, no new store family, no new cross-repo coupling.** Everything the ladder keys on (`draftCapitalStatus`, `nflDraftTier`, `position`, `yearsExp`) is already resolved inside `rookieProjection`.

### 2.1 `src/utils/seasonProjection.js`

**a. New module constants**, beside `ROOKIE_CALIBRATION`. Mean realised games, one decimal, `n` in a trailing comment. Every table below ships only cells that clear the floor stated for its rung, which is what makes the rung shippable.

```js
// Rookie availability (calibration arc slice 2). Mean realised games played by
// rookie-path players, target seasons 2013-2025, from data-repo
// nfl/season-totals + the playerids crosswalk. Ladder order and floors are in
// docs/projection.md → Rookie path → Projected games; the fixture that pins
// every value is src/__fixtures__/rookie-games-panel-2026-09-09.json.

// RUNG 1 — group x position x experience, floor n >= 30 (28 of 48 cells clear it).
const ROOKIE_GAMES_GPE = {
  'r1|QB|0': 11.5,        // n=41
  'r1|WR|0': 13.1,        // n=54
  'day2|RB|0': 12.3,      // n=71
  'day2|TE|0': 12.6,      // n=61
  'day2|WR|0': 13.5,      // n=117
  'day3|QB|0': 1.9,       // n=77
  'day3|QB|1': 2.2,       // n=64
  'day3|QB|2+': 2.0,      // n=103
  'day3|RB|0': 9.9,       // n=204
  'day3|RB|1': 3.5,       // n=65
  'day3|RB|2+': 4.0,      // n=34
  'day3|TE|0': 8.6,       // n=117
  'day3|TE|1': 5.8,       // n=47
  'day3|WR|0': 8.2,       // n=234
  'day3|WR|1': 4.7,       // n=98
  'day3|WR|2+': 3.8,      // n=53
  'undrafted|QB|0': 0.9,  // n=73
  'undrafted|QB|1': 0.7,  // n=66
  'undrafted|QB|2+': 2.8, // n=52
  'undrafted|RB|0': 4.4,  // n=290
  'undrafted|RB|1': 2.6,  // n=205
  'undrafted|RB|2+': 4.9, // n=69
  'undrafted|TE|0': 3.9,  // n=204
  'undrafted|TE|1': 3.8,  // n=151
  'undrafted|TE|2+': 4.7, // n=101
  'undrafted|WR|0': 2.8,  // n=469
  'undrafted|WR|1': 2.3,  // n=363
  'undrafted|WR|2+': 4.1, // n=174
}
// RUNG 2 — group x experience, floor n >= 30 (10 of 12 cells clear it). This rung
// exists because rung 3 is dominated by debut seasons (77-84% of the r1 and day2
// populations), so an experience-blind cell over-projects a second- or third-year
// player by roughly 2x. r1|1 (n=17) and r1|2+ (n=8) are below the floor and absent.
const ROOKIE_GAMES_GE = {
  'r1|0': 12.8,        // n=127
  'day2|0': 12.3,      // n=276
  'day2|1': 6.9,       // n=44
  'day2|2+': 4.0,      // n=40
  'day3|0': 8.0,       // n=632
  'day3|1': 4.0,       // n=274
  'day3|2+': 3.4,      // n=213
  'undrafted|0': 3.3,  // n=1036
  'undrafted|1': 2.5,  // n=785
  'undrafted|2+': 4.2, // n=396
}
// RUNG 3 — group x position, floor n >= 10 (all 16 clear it).
const ROOKIE_GAMES_GP = {
  r1:        { QB: 10.5, RB: 13.8, WR: 12.8, TE: 14.6 },   // n = 57 / 18 / 61 / 16
  day2:      { QB:  4.7, RB: 10.8, WR: 13.1, TE: 11.5 },   // n = 65 / 91 / 127 / 77
  day3:      { QB:  2.1, RB:  7.9, WR:  6.7, TE:  7.7 },   // n = 244 / 303 / 385 / 187
  undrafted: { QB:  1.3, RB:  3.8, WR:  2.9, TE:  4.0 },   // n = 191 / 564 / 1006 / 456
}
// RUNG 4 — group pooled, the last resort inside the group ladder.
const ROOKIE_GAMES_G = { r1: 12.2, day2: 10.7, day3: 6.2, undrafted: 3.2 }
// RUNG U — position x experience over the whole rookie-path population, used ONLY
// when draftCapitalStatus is 'unknown': his draft capital is unknown, so key on
// what is known. Every cell n >= 112.
const ROOKIE_GAMES_U = {
  QB: { '0': 3.9, '1': 2.3, '2+': 2.5, pooled: 3.0 },
  RB: { '0': 7.6, '1': 3.0, '2+': 4.5, pooled: 5.9 },
  WR: { '0': 6.3, '1': 3.0, '2+': 4.1, pooled: 5.0 },
  TE: { '0': 7.0, '1': 4.5, '2+': 5.2, pooled: 6.0 },
}
```

**b. New pure helper, exported for direct test:**

```js
export function resolveRookieGames({ position, draftCapitalStatus, nflDraftTier, yearsExp })
// → { projectedGames: number, rookieGamesBasis: string }
```

- **Group**, reusing slice 1's grouping exactly: status `'undrafted'` → `'undrafted'`; status `'matched'` → `'r1'` for tiers top-3/top-8/r1-mid/r1-late, `'day2'` for r2/r3, `'day3'` for r4–r7.
- **Experience bucket**: `yearsExp === 0` → `'0'`, `=== 1` → `'1'`, `>= 2` → `'2+'`, `null` → no bucket, which skips every experience-keyed rung.
- **Group ladder** (status `'matched'` or `'undrafted'`), first hit wins: `ROOKIE_GAMES_GPE[group|POS|bucket]` → `ROOKIE_GAMES_GE[group|bucket]` → `ROOKIE_GAMES_GP[group][POS]` → `ROOKIE_GAMES_G[group]`.
- **Unknown ladder** (status `'unknown'`): `ROOKIE_GAMES_U[POS][bucket]` → `ROOKIE_GAMES_U[POS].pooled`.
- **Defensive default**: unknown position, or a `nflDraftTier` mapping to no group while status is `'matched'` (unreachable today) → 14 games, basis `'default'`. Preserve today's behaviour rather than invent a number.
- Return `Math.max(0, Math.min(17, Math.round(value)))` and a basis naming the rung and cell: `'gpe:day3|WR|1'`, `'ge:day2|1'`, `'gp:r1|RB'`, `'g:day2'`, `'u:QB|2+'`, `'u:QB'`, `'default'`.

The `0` floor is unreachable from any shipped cell — the smallest is 0.7, which rounds to 1 — so no row is driven to zero projected points. It is kept as a domain guard, not as a live branch; §5.2 asserts the tables themselves round into `[1, 17]`, which is the assertion that would catch a bad future edit.

Rounding to whole games is deliberate and nearly free: it costs 0.006 MAE against the unrounded table, and both rendered surfaces read as counts.

**No lower clamp at 8.** The veteran path clamps games to `[8, 17]` (`:616`); that floor belongs to a player with a qualifying history and copying it would erase this slice's entire finding. Say so in a comment at the call site so it does not read as an omission.

**c. In `rookieProjection`** — replace `const projectedGames = 14` with the helper call, after `draftCapitalStatus` and `nflDraftTier` are resolved and before `projectedTotalPts`:

```js
const { projectedGames, rookieGamesBasis } = resolveRookieGames({ position, draftCapitalStatus, nflDraftTier, yearsExp })
```

`projectedTotalPts` keeps its formula and must keep multiplying the **unrounded** `projectedPPG`, exactly as today (`:238`), so no spurious drift appears in the first decimal. `durabilityFactor` keeps its definition (`projectedGames / 17`, recorded **unrounded** on the rookie path at `:272`, unlike the veteran path's 3dp at `:756` — leave that asymmetry alone, it is pre-existing); its rookie range simply widens from a constant `0.8235…` to roughly `0.0588…`–`0.8824…`, which is what it always claimed to measure.

**d. One new `factors` key** — `rookieGamesBasis` (string), rookie path only, taking the rookie key count from 54 to **55**. `projectedGames` is a top-level projection field, not a factors key, so the schema shape is otherwise unchanged.

**e. One new `adjustmentSummary` line**, gated on the games number rather than the basis string: `projectedGames <= 6` → `'Unlikely to play a full season ↓'`. Six is the threshold the PPG panel's own outcome gate used, and it separates the fringe cleanly (186 of 288 live rows land at 6 or below). Precedent for gating a line on a non-PPG quantity is `:710`'s `durabilityFactor < 0.85 → 'Injury history ↓'`.

### 2.2 No other source file changes

`src/App.jsx` needs nothing: `yearsExp` and `draftCapitalStatus` are already inside `rookieProjection`. `marketFilters.js` needs nothing: `minProjectedGames` defaults to 0, its slider already spans 0–`MAX_PROJECTED_GAMES` (17), and the filter simply starts working — a "min 8 games" setting currently excludes no rookie and would now exclude 207 of 288.

---

## 3. Deliberately not in this slice

1. **Any depth-chart input.** Q3. Rejected on a source mismatch plus a 0.155-game marginal gain.
2. **Any change to slice 1's PPG constants, `draftCapitalStatus`, or the product clamp.**
3. **Any veteran-path change**, including its `[8, 17]` games clamp and its `depthStale` guard.
4. **A conditional-PPG-plus-availability-probability reformulation.** The correct fix for Q4's 18% residual: project PPG given a real season, project the probability of playing, combine. It needs a second fitted model, a factors key pair, and a UI decision about which number the games column shows. Named so the residual is not mistaken for an oversight.
5. **`gamesStarted` as a second signal.** Present in season totals and plausibly sharper for a fringe player, but the app projects games *played* and nothing consumes a starts projection.
6. **A generator script for the fixture.** Dropped after review — see §10 and §5.3.

---

## 4. Docs/README updates

**`docs/projection.md` → Rookie path:** replace the bare "Projected games = 14" (`:143`) with a **Projected games** subsection carrying: the five rungs, their keys and their floors, in order; the rung-2, rung-3, rung-4 and rung-U tables in full with n; a pointer to `ROOKIE_GAMES_GPE` in source for the 28 rung-1 cells rather than duplicating them; the LOCO figures (9.424 → 4.055, and 4.234 for the experience-blind ladder); Q3's rejection with both its numbers; the rounding note; the explicit statement that the veteran `[8, 17]` clamp is not applied and why; Q4's overstatement table as a stated bias; and the two known residuals — the 5 live rows at `years_exp ≥ 2` that fall through to an experience-blind rung, and the non-monotone undrafted third-year cell with its survivorship explanation.

**`docs/signal-registry.md`:** two edits.
1. A new computed-factor row for `projectedGames` / `rookieGamesBasis` on the rookie path, classified **Reconstructable** — every input is a permanent record except `years_exp`, which is a current-value Sleeper field but recoverable from entry year; name that dependency in the row.
2. Correct the durability row at `:88`, which is wrong in two ways this slice makes consequential: its use column reads `active→projectedPPG`, but `durabilityFactor` appears in neither path's PPG (`rawPPG` at `:673-674`, rookie `projectedPPG` at `:236`) — it scales total points only; and its source column names `durabilitySignals.js`, while `durabilityFactor` itself is computed in `seasonProjection.js` (`:272` rookie, `:617` veteran). `injurySeasons` and `absenceShape*` do come from `durabilitySignals.js`, so split the row or qualify it rather than retargeting the whole thing.

**`docs/navigation.md`:** the `seasonProjection.js` row gains `resolveRookieGames`.

**`CLAUDE.md`:** the *Factors contract* invariant goes 54 → 55 rookie keys; the `src/__fixtures__/` row gains the availability panel. Re-check the 25,000-byte ceiling.

## 5. Tests to add

### 5.1 `src/__tests__/factorsSchema.test.js`

Add `rookieGamesBasis` to `ROOKIE_FACTORS_KEYS`; update the header note and both rookie test names to 55. In the rookie value-types case **add** (there is no rookie `projectedGames` assertion today, and the `>= 8` range checks at `:258-259` are the veteran path's — do not touch them):

- `rookieGamesBasis` matches `/^(gpe:|ge:|gp:|g:|u:|default$)/`.
- `projectedGames` is an integer in `[0, 17]`.
- The fixture is a WR at `years_exp: 0` with no draft matches and no window, so slice 1 resolves `draftCapitalStatus: 'unknown'` → rung U → `ROOKIE_GAMES_U.WR['0'] = 6.3` → **6 games**, basis `'u:WR|0'`.
- `projectedTotalPts === 44.1` — the unrounded PPG (`7 × 1.05 = 7.35`) × 6 games, rounded once. Slice 1's pinned `projectedPPG === 7.4` must stay green beside it: PPG does not move in this slice.

### 5.2 `src/utils/seasonProjection.test.js`

Direct unit tests on `resolveRookieGames`, one per rung and one per guard. `Math.round`'s half-up direction is load-bearing on the four `.5` values across the tables (`gpe:r1|QB|0` 11.5, `gp:r1|QB` 10.5, `gp:day2|TE` 11.5, `u:QB|2+` 2.5), so assert those explicitly.

| case | input | expected games / basis |
|---|---|---|
| rung 1 | undrafted, WR, `yearsExp 1` | 2 / `gpe:undrafted|WR|1` |
| rung 1, day-3 QB | matched `r6`, QB, `yearsExp 0` | 2 / `gpe:day3|QB|0` |
| rung 1, half-up | matched `r1-mid`, QB, `yearsExp 0` (11.5) | **12** / `gpe:r1|QB|0` |
| rung 2 (no rung-1 cell) | matched `r2`, QB, `yearsExp 1` | 7 / `ge:day2|1` |
| rung 3 (no rung-1 or rung-2 cell) | matched `top-3`, RB, `yearsExp 1` | 14 / `gp:r1|RB` |
| rung 3 via null experience | matched `r2`, TE, `yearsExp null` | 12 / `gp:day2|TE` |
| rung U, keyed | `'unknown'`, QB, `yearsExp 18` (2.5) | **3** / `u:QB|2+` |
| rung U, pooled | `'unknown'`, RB, `yearsExp null` | 6 / `u:RB` |
| default guard | matched, `nflDraftTier null`, WR, `yearsExp 0` | 14 / `default` |
| table sweep | iterate all five tables | every value rounds into `[1, 17]` |

Plus, through `computeNextSeasonProjection`:

- **Totals use the unrounded PPG.** A rookie whose PPG rounds (7.35 → 7.4) at 6 games must produce `44.1`, not `44.4`. This is the guard for the arithmetic most likely to be "simplified" later.
- **`durabilityFactor` tracks the games number** — equals `projectedGames / 17` on a rung-1 undrafted row, asserted against the unrounded value, so the two cannot drift.
- **The summary line** fires at 6 games and not at 7.
- **No veteran leakage** — the existing 5-season WR fixture keeps its history-derived `projectedGames`, and its factors carry no `rookieGamesBasis`.

### 5.3 `src/__tests__/rookieAvailability.test.js` (new file)

Fixture `src/__fixtures__/rookie-games-panel-2026-09-09.json`: the 3,848 rows trimmed to `{ p: position, g: group, e: expBucket, y: targetSeason, games }`, plus a `source` object that is the whole provenance story and must be written out in full, because nothing in the suite can re-derive it:

- the two data-repo families and the exact year ranges read (`nfl/season-totals/2012–2025`, `nflverse/playerids.json` `bySleeper` + `ids`);
- the join (crosswalk `bySleeper` keyed by Sleeper id, position from `ids` via `gsisId`, draft group from `draftRound`/`draftPick`, entry year from `draftYear`);
- the predicate, verbatim: for each crosswalk player with entry year ≥ 2013 and a skill position, walk target seasons forward from the entry year, stop at the first target season preceded by any season with `gamesPlayed >= 8`, and skip a row at `years_exp >= 2` when the player recorded zero games in both the target and the prior season (out of the league, so the app would have no row for him);
- absence from season totals counts as 0 games;
- the date assembled and the fact that no committed data-repo artifact backs it (§7 item 1).

1. **Fixture integrity.** 3,848 rows; group counts r1 152 / day2 360 / day3 1,119 / undrafted 2,217; experience counts 2,071 / 1,120 / 657; every `games` an integer in `[0, 17]`. These reconcile: the rung-3 n values sum to the group counts exactly, and the rung-1 experience cells close the rung-3 columns for six of the eight day-3 and undrafted position columns — assert that reconciliation too, so a truncated or duplicated fixture cannot pass.
2. **Provenance.** Recompute every shipped constant from the fixture and assert it matches source to one decimal, with the cell's n asserted as a **hardcoded expected value in the test** (slice 1's precedent at `rookieCalibration.test.js:107,121` — n lives only in `//` comments in source and is not machine-readable). Cover all 28 rung-1 cells, all 10 rung-2 cells and all 16 rung-3 cells with value and n; assert each clears its rung's floor; assert the two rung-2 cells that are *absent* (`r1|1` n=17, `r1|2+` n=8) genuinely fall below 30, so the floor is documented by a test rather than a comment. For rung 4 and rung U assert values only — their n is the group or position total already asserted in item 1.
3. **Out-of-sample gate.** Reimplement the ladder and leave-one-target-year-out (13 folds by `y`, cells refit per fold under the same floors, predictions rounded) and assert: ladder MAE beats the constant 14 by at least 4.5 games (measured 9.424 → 4.055) and beats the experience-blind ladder (measured 4.234). Loose bounds; sign, not float.
4. **The experience rungs stay in.** Assert the experience-blind ladder is *not* better, so a later session cannot strip the key on the argument that it only buys 0.18 games in aggregate. The docs carry the reason; this carries the guard.

### 5.4 Named live-row regression fixtures

Inputs from `snapshots/2026-09-07.json` with `years_exp`/`age` from `raw/-players-nfl.json`. **That snapshot predates slice 1**, so the PPG values below are the post-slice-1 ones recomputed by hand, and every total is `unrounded PPG × games` rounded once — the same arithmetic §5.2 pins. All four also assert `projectedPPG` unchanged from slice 1, so a regression in either slice reds here.

| player | pid | PPG after slice 1 (unrounded) | games | total points |
|---|---|---|---|---|
| Fernando Mendoza | 13269 | 24.05 (`13 × 1.85`) | 14 → **12** (`gpe:r1|QB|0`) | 336.7 → **288.6** |
| Luke Altmyer | 13314 | 10.343125 (`13 × 1.1875 × 0.67`) | 14 → **1** (`gpe:undrafted|QB|0`) | 144.8 → **10.3** |
| Bhayshul Tuten | 12490 | 8.377614 (`9 × 1.1635575 × 0.80`) | 14 → **4** (`gpe:day3|RB|1`) | 117.3 → **33.5** |
| Josh Johnson | 260 | 10.66 (`13 × 0.82`) | 14 → **3** (`u:QB|2+`) | 149.2 → **32.0** |

Josh Johnson is the case worth keeping. Slice 1 deliberately left him neutral because his draft status is unknown; rung U is what stops "unknown draft capital" from also meaning "assume a full season" for a 40-year-old fourth-string quarterback. His `projectedPPG` is unchanged by both slices.

### 5.5 Expected aggregate effect — pinned numbers for the smoke check

On the 288 rookie-path rows of `snapshots/2026-09-07.json`, with PPG held at its snapshot value so the games change is isolated:

| quantity | value |
|---|---|
| resolution rung | rung 1: 247 · rung 2: 30 · rung 3: 10 · rung 4: 0 · rung U: 1 · default: 0 |
| `projectedGames` before | 14 on all 288 |
| `projectedGames` after | range 1–15; 186 rows at 6 or below; 207 below 8 |
| sum of `projectedTotalPts` across rookie rows | 29,331 → **12,539** (−57%) |
| rookie share of all projected points in the pool | 43% → **24%** |
| rows failing a "min 8 games" market filter | 0 → **207** |

The pool-level figures describe the model, not a rendered total (§1). Smoke check: the Market games column shows a spread rather than a wall of 14s; the "min 8 games" filter now excludes fringe rookies; the pop-up note reads sensibly for a first-rounder and for a UDFA; the starters-only Portfolio tile moves only if a fringe rookie is started. Drift from the counts is expected on a live pool larger than the snapshot's; the ratios and the rung ordering are the invariants.

---

## 6. Cross-repo impact

Three entries fire. Text quoted verbatim, then what this change requires. **`docs/cross-repo-registry.md` is not edited** — no new coupling, so the mirrored region stays byte-identical and the drift check stays empty.

### CR-01 · Projection snapshot envelope

> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

**Under it.** One additive rookie-path `factors` key, `rookieGamesBasis` (string). **`schemaVersion` stays 3**, on the entry's additive-only Invariant.

**The consequential half is three pre-existing envelope fields changing distribution, not a new field.** `projection.projectedGames` has been the literal constant 14 on every rookie-path row in every snapshot ever captured; from the first snapshot after this lands it ranges 1–15, and `projectedTotalPts` and `durabilityFactor` move with it — the rookie-row total-points sum falls 57% on the pinned snapshot. Any grading, panel or ratio reading those three on rookie-path rows across the change date must **segment on it**. `rookieGamesBasis` present is the marker for a row on the new model and its value names the rung and cell; `rookieCalibrationMult` remains slice 1's marker. Veteran rows are untouched by either slice. Recording both change dates together in `grading/anchor-policy.md` is the natural home.

**One classification correction the data side should know:** `durabilityFactor` is documented app-side as `active→projectedPPG` and it is not — it appears in neither path's PPG computation and scales total points only. The app fixes its own row here; a data-side grader treating it as a PPG factor should stop.

### CR-15 · R3-FIT factor-multiplier mirror

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs:110` only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope.

**Under it.** `src/utils/seasonProjection.js` is a trigger. `lib/projectionFactors.mjs`'s `reconstructRookieProjection` returns no games figure, so nothing there is now wrong — but any future rookie panel grading *total points* rather than PPG must mirror all five tables and the rung order, or it will grade a 14-game model that no longer exists. The existing rookie PPG panel is unaffected: it grades PPG behind a `gp ≥ 6` gate and reads no games projection. As in slice 1, a re-fit must not run the ladder inside the predictor it is fitting.

### CR-18 · Signal registry rows (`docs/signal-registry.md`)

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Under it.** Fires on §4's two row edits. Nothing is owed back to the data repo: no ingested field, source or coverage changes here. Direction is data→app, so the app is the receiving side and the edits are its own.

### Registry work this slice cannot do

CR-01's app-side `Triggers` list has two gaps the review surfaced, both inside the mirrored sentinels and therefore a both-repos same-change edit no repo-scoped session can make alone. They extend slice 1's backlog item D-11 rather than opening a new one:

- The entry's `Triggers` narrow `seasonProjection.js` to "the `factors` object shape", but the fields this slice changes are top-level `projection` payload fields — `projectedGames` (`:237`, veteran `:616`) and `projectedTotalPts` (`:238`, veteran `:695`) — which the entry's own **App side** field calls "the verbatim `projection` payload" and which `projectionSnapshot.js:90` writes with no whitelist. The definition site of the changed field is uncovered.
- `Triggers` omit live consumers of both shapes: for `factors`, `usePlayerProfile.js:179` and `Market.jsx:439-446` (already in D-11); for the projection payload, `Market.jsx:537`, `PlayerDetailModal.jsx:278`, `PlayerDetailTabs.jsx:111`, `marketFilters.js:152`, `Portfolio.jsx:366-367`, `MyTeamView.jsx:25`, `PlayerCard.jsx:42`, `App.jsx:603`.

## 7. Data-repo asks — flagged, not planned

Append to `.claude/tasks/data-repo-backlog.md` with this slice's commit; D-8 through D-11 are already filed from slice 1, and D-11 is extended per §6.

1. **A committed rookie availability panel** — *does not block; closes this slice's provenance gap.* These constants are fitted on a panel Session 1 assembled from `nfl/season-totals/*` plus `nflverse/playerids.json`, with no committed artifact behind it, unlike slice 1's SHA-anchored fixture. A `backtests/<date>-rookie-availability-panel.json` produced by the harness under the app's own routing predicate, outcome `gamesPlayed`, **no `gp ≥ 6` gate**, would give them the same provenance and let the data repo re-fit as seasons are added. §5.3's `source` block is the interim substitute and is explicitly weaker.
2. **A total-points rookie panel, to retire the Q4 residual** — *does not block.* Slice 1's PPG constants are conditioned on `gp ≥ 6` while these games constants are unconditional, which is exactly why the product overstates by up to 18% for undrafted rookies. One panel reporting realised **total points** per rookie-path player-season on the pinned `half_ppr` basis would let a later slice fit the product directly instead of documenting the gap.

## 8. Done-definition

Standard `CLAUDE.md` list. Specifically: `factorsSchema.test.js` (`seasonProjection.js` changed); no `statKeysContract.test.js` run needed (`gamesPlayed` is already referenced by projection code and no new stat key is read); a real smoke run reporting the §5.5 rung split and the four rendered checks; the CLAUDE.md ceiling re-checked; both §7 asks appended and D-11 extended.

## 9. Hand-back should report

The commit SHA or diff range; every file touched; the LOCO figures the new test printed; the §5.5 rung split and counts observed in the running app; games and total points for the four named regression fixtures; and any deviation from the five tables in §2.1(a), which must be none.

---

## 10. Review pass — plan-reviewer flags and dispositions

19 flags, 2026-09-09. One changed the design, one changed the deliverables, twelve corrected arithmetic or prose, three are registry findings this slice cannot act on, two were declined.

**Changed the design.** The experience key's justification rested on a day-2 third-year example, and the reviewer showed the shipped ladder could not reach it: r1 and day-2 non-debut cells are all below the n≥30 floor, so those players fell through to an experience-blind cell. Checked against the live snapshot: 40 of the 46 third-year-plus rows did resolve to an experience-keyed cell, so the design was sound and the *justification* was wrong — but the check also exposed an unquantified residual, 30 live rows on a rung-3 cell that is 77–84% debut seasons and therefore over-projects them by roughly two-fold. **Added rung 2 (`group × experience`, floor n≥30)**, which catches 24 of those 30 with cells at n=44 and n=40, adds no thin cells, and costs one lookup. Aggregate MAE moves 4.061 → 4.055; the point is the per-row error on the rows it touches, and Q2 now says so.

**Changed the deliverables.** The proposed generator script under `src/__fixtures__/` was dropped. Three reasons, all the reviewer's: this repo's ESLint matches only `**/*.{js,jsx}` and vitest only `src/**/*.test.js{,x}`, so a `.mjs` there would be neither linted nor run and §9's "which directory and why" would have resolved by default rather than by judgment; nothing in the suite would have executed it, so it could not falsify the fixture it was meant to justify; and it would have been an executable local-filesystem reader of the sibling working tree, which no registry entry covers and which is genuinely distinct from slice 1's inert fixture copy. Replaced by the full derivation recipe in the fixture's `source` block plus reconciliation assertions, with the limitation stated outright in Q5 and the durable fix as §7 item 1.

**Corrected.** §5.4's four total-points rows were computed from rounded PPG, contradicting §5.2's own rule; all recomputed from unrounded PPG, and the "before" column recomputed from post-slice-1 PPG since the reference snapshot predates slice 1. "28 of 53 three-way cells" → 48. The claim that rung 1 covers all three experience buckets for day-3 and undrafted was false (`day3|TE|2+` is n=23); now stated with the exception. Q2's "group-pooled says 10.8" confused a rung-3 RB cell with the pooled value (10.7). Q1's round-1 split figures now cite the population they came from. Q4's table was computed on a five-group split and is recomputed on the four shipped groups, which moves r1 from 13.4 to 12.2 and its overstatement from 1% to 2%. Q3's 4.493 is labelled as belonging to the debut population, not §Q2's panel. §5.1 says "add" rather than "replace", since no rookie games assertion exists today and the `>= 8` checks nearby are the veteran path's. The `projectedGames` domain is stated once, `[0, 17]`, with the unreachable-zero note and a table-sweep assertion instead of a conflicting `[1, 17]`. `durabilityFactor`'s rookie value is recorded unrounded, so §2.1(c) gives the unrounded range. §5.3(2) now hardcodes expected n in the test rather than claiming to read source comments. §1 and §5.5 no longer describe the Portfolio tile as summing across holdings — it is starters-only, and the two other summers are in a dormant directory. The durability row fix in §4 now also corrects its source column.

**Registry findings, not actionable here.** CR-01's `Triggers` do not name the projection payload's definition site, and omit ten live consumers of the two shapes. Both are inside the mirrored region, so they extend D-11 (§6, last section) rather than being fixed in this change.

**Declined.** The reviewer noted CR-18's mirror text was referenced rather than quoted — accepted and quoted in §6, not declined. Genuinely declined: nothing. The two declines carried over from slice 1 (§10 there) stand unchanged and are not re-litigated here.

---

## Fix pass 1

implementation-reviewer on `ed027c7`, 2026-09-11. Seven flags; five are real and specified below, one is declined, one was Session 2 correcting the task file and it was right. The five tables in `src/utils/seasonProjection.js` are byte-identical to §2.1(a) and the ladder matches §2.1(b) — **the build is correct as landed and must not be touched except for the one export in item 1.**

### 1 · The table sweep tests a copy of the tables, so it cannot catch a bad edit

`src/utils/seasonProjection.test.js:1433-1481` re-declares all five tables as literals inside the test body. Editing `ROOKIE_GAMES_GP` or `ROOKIE_GAMES_G` in source leaves it green, which is the exact failure §2.1(b) assigned this test to prevent. The consequence the reviewer measured: 14 of 16 rung-3 values and all 4 rung-4 values are never compared against the shipped constants anywhere in the suite, and rung 2 is cross-checked at one cell.

There is a structural reason the obvious fix is not "probe each cell", and it needs recording because it is a property of the ladder rather than a gap in the tests: **a higher rung shadows a lower one, so some shipped cells are unreachable.** Rung 3 is reachable for every group and position by passing `yearsExp: null`, which skips both experience-keyed rungs. Rung 2 is reachable only where rung 1 has no cell for that position — `r1|0` (via RB or TE), `day2|0` (via QB), `day2|1`, `day2|2+`, and `day3|2+` (via TE, whose `2+` bucket is the n=23 gap). The other five rung-2 cells and **all of rung 4** cannot be reached through `resolveRookieGames` for any valid input, because rung 3 is fully populated. They are kept deliberately: if a future season pushes a rung-1 cell below its floor, its fallback becomes live. They are not dead code, they are cold code.

Replace the sweep with one that exercises the shipped constants:

- Add a single test-facing export to `src/utils/seasonProjection.js` — `export const ROOKIE_GAMES_TABLES = { gpe: ROOKIE_GAMES_GPE, ge: ROOKIE_GAMES_GE, gp: ROOKIE_GAMES_GP, g: ROOKIE_GAMES_G, u: ROOKIE_GAMES_U }` — with a comment saying it exists so tests can assert the shipped values and that it must hold **references** to the same objects, never copies. This is the only source change in this fix pass.
- Sweep `ROOKIE_GAMES_TABLES` itself: every value in all five tables is a finite number that rounds into `[1, 17]`.
- Cross-product sweep through `resolveRookieGames`: for all four groups × four positions × four experience buckets (`'0'`, `'1'`, `'2+'`, and `null`) under both `'matched'` and `'undrafted'` status as each group requires, plus all four positions × four buckets under `'unknown'`, assert every result is an integer in `[1, 17]` and every basis matches the rung prefix pattern.
- From that same sweep, build the map of which rung each combination resolves to and assert it exactly: all 16 rung-3 cells reached at `yearsExp: null` with their shipped values; the five reachable rung-2 cells with their shipped values; **no combination resolving to a `g:` basis**, which pins rung 4 as cold by construction rather than by accident.
- Leave the existing per-rung provenance assertions in `rookieAvailability.test.js` alone. For the five shadowed rung-2 cells and the four rung-4 values, fixture-derived comparison remains the only possible check, and that is a stated limit, not an oversight — say so in a comment there.

### 2 · The fixture's provenance block dates it two days after its filename

`src/__fixtures__/rookie-games-panel-2026-09-09.json` carries `source.assembledOn: "2026-09-11"` while the filename, the CLAUDE.md fixtures row and §5.3 all say 2026-09-09. §5.3 makes the assembly date part of the recipe, and this panel's `source` block is the only provenance it has, so the mismatch matters more here than it would elsewhere.

What happened is better than what the task file assumed, and the record should say so: Session 1 derived these numbers on 09-09, and Session 2 **independently re-derived the panel on 09-11** from the same two families and reproduced every pinned value, every n, and the 9.424 baseline. Q5 admitted this fixture's provenance is weaker than slice 1's because nothing can falsify the derivation; an independent second derivation matching the first is precisely the missing evidence.

- Keep the filename as it is — it is the fixture's stable identity and is referenced from two docs.
- Correct the `source` block to record both facts: `derivedOn: "2026-09-11"` by the implementing session, reproducing the Session 1 derivation dated `2026-09-09` that the filename carries, with one sentence saying the two agreed on every value, n, and the LOCO baseline.
- Add the same sentence to `docs/projection.md`'s provenance line for the panel.

### 3 · `docs/projection.md` attaches the Q4 figures to the wrong label

The doc reads "Bounded by the share of a cohort's games contributed by its `≥ 6`-game population: r1 2%, day2 3%, day3 10%, **undrafted 18%**". Those four numbers are the *implied overstatement*; the *share* is 98/97/90/82% (§1 Q4). The shipped numbers are right and the sentence describing them is wrong. Rewrite so the share and the overstatement are both stated and each is attached to its own figures.

### 4 · The veteran-leakage case asserts something the veteran path already guarantees

`src/utils/seasonProjection.test.js:1555-1569` asserts only that the veteran row's `projectedGames` lands in `[8, 17]`, which the pre-existing veteran test at `:196-198` already covers. A rookie-table value leaking into the veteran path would pass as long as it fell inside the clamp. §5.2 asked for "keeps its history-derived `projectedGames`".

Compare two calls instead: the same veteran fixture with and without `currentSeason`/`nflDraftYears` supplied, asserting `projectedGames`, `projectedTotalPts` and `durabilityFactor` are identical across the pair, and that neither result's `factors` contains `rookieGamesBasis`. Keep the `[8, 17]` assertion as a second line if you like; it is not the guard.

### 5 · Backlog entries name no SHA

`.claude/tasks/data-repo-backlog.md:96,110` — D-12 and D-13 record their origin as "this commit" where D-8 through D-11 name `f07d9be`. Replace with `ed027c7` in both, leaving the blocking status and the rest of each line untouched. The D-11 extension is correct as written.

### Declined — do not act

- **The commit message carries no Mirror text.** Same call as slice 1 §10, for the same reason: the convention places the Mirror text in the task file's `## Cross-repo impact` section, §6 carries all three entries verbatim, and that file is committed in this change. A commit message is not the required channel and a second copy would only drift.

### Done-definition for this fix pass

`npm test` green, `npm run lint` clean, `npm run build` clean. No smoke run — item 1's export changes no behaviour, and items 2 through 5 are a fixture field, a docs sentence, a test and two backlog lines. Hand back the fix commit SHA and confirm the cross-product sweep's reachability map matches the one described in item 1, reporting it if it does not.

---

## Fix pass 2

implementation-reviewer's single re-run on `ed027c7..1da02b7`, 2026-09-11. Items 2 to 5 of Fix pass 1 came back clean. Item 1 half-worked, and the half that failed is **a defect in the Fix pass 1 spec, not in the applier's work**: it said to assert the reachable cells "with their shipped values", and the only place to read a shipped value is the table under test, so those assertions compare the source to itself. Four flags, all one root cause. Test-only; no source change, and the tables must not be touched.

The principle Fix pass 1 should have stated: **the fixture is the independent truth and the source tables are the thing under test.** Every comparison must run source against fixture, never source against source. `ROOKIE_GAMES_TABLES` now makes that possible for all 74 cells, which is strictly simpler than what was built.

### 1 · Move every value assertion to the provenance test, and make it cover all 74 cells

`src/__tests__/rookieAvailability.test.js` already derives each cell's mean from the fixture. Extend each rung's block so it asserts the **shipped constant** against that fixture-derived mean, reading the constant from `ROOKIE_GAMES_TABLES`:

- Rung 1 (28 cells) and rung U (16): these already compare a hardcoded literal to the fixture. Add the third leg — the shipped constant equals the fixture mean to one decimal — so the literal, the fixture and source are all pinned to each other. The reviewer's point stands that a hand-copied literal never compared to source is the same copy-drift failure one file over.
- Rung 2 (10 cells), rung 3 (16), rung 4 (4): these have no source comparison at all today. Add one for every cell, on the same source-against-fixture basis. This closes the gap the original flag measured — 27 shipped constants currently checkable only against a hand copy — and it closes it for the nine shadowed rung-2 cells and all four rung-4 values too, which no runtime probe can reach.
- Keep the existing n assertions as they are. `n` lives only in source comments and cannot be read programmatically, so a hardcoded expectation remains the only option there; that limit is already stated in the file.
- Update the "cold by construction" comment: after this change those cells are unreachable at runtime but **fully value-pinned**, which is a narrower and more accurate limit than what it currently claims.

### 2 · Make the cross-product sweep purely structural

`src/utils/seasonProjection.test.js:1495-1525`. The sweep's job is rung *selection*, and values are now owned by item 1. Remove the circularity rather than dressing it up:

- Drop the value assertions that read from `ROOKIE_GAMES_TABLES` (`:1495-1503`, `:1516-1519`). Keep asserting that each result's `projectedGames` is an integer in `[1, 17]` — that is a property of the output, not a restatement of an input.
- Delete `expect(new Set(Object.values(REACHABLE_RUNG2)).size).toBe(5)` (`:1520`). It asserts a property of a literal declared three lines above and cannot fail.
- Make the rung-2 half **two-directional**, which is what Fix pass 1 meant by "assert it exactly". Collect from the sweep's own results every combination whose basis starts with `ge:`, and assert that collected set deep-equals the expected twelve combinations — `r1|0` via RB and TE, `day2|0` via QB, `day2|1` via all four positions, `day2|2+` via all four, `day3|2+` via TE. As written, deleting a rung-1 cell would silently add a reachable rung-2 cell and nothing would fail; after this it reds.
- Leave the rung-3 per-cell assertions and the exhaustive rung-4 scan alone. The reviewer confirms both are already exact.
- Keep the separate `ROOKIE_GAMES_TABLES` bounds sweep. Checking the shipped objects for finite values in `[1, 17]` is a real assertion about source and is the one part of Fix pass 1 item 1 that landed as intended.

### Done-definition

`npm test` green, `npm run lint` clean, `npm run build` clean. No smoke run — no behaviour changes. Hand back the fix commit SHA and confirm the count of shipped constants now pinned against the fixture, which should be all 74.
