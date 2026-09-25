# Weekly points display basis — the game log shows real half-PPR weeks, labelled

**Decision (Anton, made — not reopened here):** surfaces that *display* individual weeks show the
real half-PPR weekly points, labelled as half-PPR. Surfaces that only *aggregate* weeks keep the
scaled series.

**What this slice ships:** `rescoreSeasonTotals` preserves the served weekly series as
`sourceWeeklyPoints`; one resolver (`resolveDisplayWeeklyPoints`) picks the display series and its
basis per row; the pop-up's Game log `PTS` and Distribution histogram read it and say which basis
they show; `PROVISIONAL(heuristic)` tags come off those two sites and stay (with a reason) on every
aggregate site.

**What it must not do:** change `weeklyPoints` (the scaled series stays exactly as it is — every
aggregate consumer is untouched); change `buildGameLogRows`' contract; label a live-API row
half-PPR; label a week with a basis it does not have (unknown basis → omit, not guess).

Out of scope: exact league-scored weekly points (D-47 data side; or, for the live season only, the
Sleeper weekly rows `/week` already fetches — a later slice).

---

## §1 Verified facts (2026-09-26, live source + local data store)

1. **The brief's premise for requirement 4 is wrong, and the plan corrects for it.** Live-API rows
   are *not* skipped by the rescore: `loadCareerHistory` (`sleeperStats.js:405`) wraps
   `getSeasonTotals` in `rescoreSeasonTotals` on every path, including `live-api` and the cache-hit
   of a legacy live-API row (season-rescore.md §2.3a, "Live-API rows are rescored too"). So a
   live-API row **will** carry `sourceWeeklyPoints` after this slice — and those values are
   league-scored (`calculateFantasyPoints(stats, scoringSettings)`, `sleeperStats.js:262`), not
   half-PPR. **Presence of `sourceWeeklyPoints` therefore cannot select the label; the served basis
   label can.** A live-API row is built without a `scoringBasis` field (`sleeperStats.js:251-255`),
   so its `sourceScoringBasis` is `null` (`:346`); a store row's is `'half_ppr'`.
2. **Every served row carries `scoringBasis: 'half_ppr'`** — checked in the local data store:
   2014 (1,930/1,930), 2021 (2,846/2,846), 2025 (2,832/2,832), 2026 (2,443/2,443). **Cached rows
   too:** the label landed in data `a4d63da` (2026-05-19 01:09) and `weeklyStatus` in `135d8ac`
   (same day, 10:59); the only unlabelled store rows ever committed (`82235d2`, 2026-05-18) also lack
   `weeklyStatus`, and `getSeasonTotals` force-refetches any cache entry without it
   (`sleeperStats.js:174-175`). So no unlabelled store row survives in IndexedDB, and
   `sourceScoringBasis === null` ⇔ a live-API row. (`src/__fixtures__/season-totals-2025.json` is
   hand-shaped and has neither field — do not use it to reason about the label.)
2a. **A live-API row's weeks are scored with whatever league was selected when that season was first
   fetched**, not necessarily the current one: the cache key `season-totals/${season}`
   (`sleeperStats.js:167`) is not league-scoped, the TTL is permanent (`:294`), and a live-API cache
   entry is served again on a hit (`:188-196`), while `App.jsx` re-runs the load on a league switch.
   The `'league'` copy therefore claims only "league-scored when first loaded" (§4.3, §4.4).
3. **The consistency measure is not scale-invariant as consumed.** `computeConsistency` pools up to
   3 seasons; each season is scaled by its *own* ratio, so the pooled CV of the scaled series
   differs from the pooled CV of the source series whenever the window's ratios differ. Only a
   **single season's** CV (`computeSeasonConsistency().cv`) is invariant (up to the 2-dp rounding
   of scaled weeks). And no aggregate consumer *renders* a CV: they render mean and SD, which scale.
   The "keep scaled" call for them rests on *aggregate beside league-basis figures*, not invariance
   (§3). The one CV that renders is Distribution's, which moves to the source series in this slice.
4. **`usePlayerProfile.getSeasonData` has no consumer.** It returns `weeklyPoints`
   (`usePlayerProfile.js:98`), but no file destructures `getSeasonData` (grep over `src/`; the
   `dynastyScore.js` hit is the substring `targetSeasonData`).
5. **Scaled weeks can be `null` where source weeks are finite** — when the season ratio is undefined
   (`sleeperStats.js:322-327`, e.g. served total ≤ 0 with a non-zero rescore), every scaled week is
   `null`. The two series can therefore have different finite-game counts; Distribution must count
   over the series it renders.
6. **The Distribution SD ≡ Overview ±SD equality is an existing, tested design claim**
   (`PlayerDetailModal.gameLogDistribution.test.jsx:220-231`, `docs/ui.md` §distribution,
   `docs/nav/components.md` DistributionSection row). This slice breaks it for rescored rows by
   design (§2.2).
7. Snapshots do not serialize `careerStats` rows (`projectionSnapshot.js` reads only
   `row.scoringBasis`, `:62`); `exportData.js` exports cache keys, and the cache holds raw rows.
   The new field reaches neither.

---

## §2 Decisions

### 2.1 Label by basis, resolved per row

`resolveDisplayWeeklyPoints(seasonData)` → `{ weeklyPoints, basis }`, `basis ∈ 'half_ppr' |
'league' | null`:

| Row state | `weeklyPoints` returned | `basis` |
|---|---|---|
| `seasonData` null/non-object | `null` | `null` |
| rescored (`sourceWeeklyPoints !== undefined`), `sourceScoringBasis === 'half_ppr'` | `sourceWeeklyPoints` | `'half_ppr'` |
| rescored, `sourceScoringBasis === null` (live-API, §1.1–2) | `sourceWeeklyPoints` | `'league'` |
| rescored, any other `sourceScoringBasis` string | `null` | `null` |
| not rescored (no `scoringSettings` — rows pass through raw), `scoringBasis === 'half_ppr'` | `weeklyPoints` | `'half_ppr'` |
| not rescored, `scoringBasis` absent/null (raw live-API row) | `null` | `null` |
| not rescored, `scoringBasis === 'league'` or any other string | `null` | `null` |

"Not rescored" means `scoringSettings` was `null`/`{}` (`App.jsx:891` passes
`selectedLeague.scoring_settings ?? {}`), so a raw live-API row's weeks were scored with empty or
unknown settings — omitted, not labelled. The `'league'`-without-source row cannot occur today (rows are rescored on read from raw cache);
if it ever does its weeks are the scaled synthetic series, so it is omitted rather than shown as
real. `sourceWeeklyPoints: null` (served row had no weekly series) returns `{ null, basis }` — the
basis is still known; callers render `—`.

### 2.2 Distribution moves wholly to the display series (the one judgment call)

The histogram places individual games into absolute 5-point buckets and counts games over 20 /
under 10 — that is a display of individual weeks, and a scaled week near a bucket edge lands in the
wrong bucket. So the **whole shape block** (histogram, mean, SD, CV, over-20, under-10, ±1 SD
markers, coverage pips) is computed from the display series, over `consistency.seasons` (the window
is still reused, not re-derived). Mixing a half-PPR histogram with league-basis mean/SD markers
would draw the markers in the wrong place.

**Cost:** for a rescored player, Distribution's SD no longer equals the Overview Floor-risk tile's
±SD (which stays league-scaled, §3). The caption says so, which makes the difference expected. The
Overview tile keeps the scaled SD because it sits beside league-basis PPG figures.
*Alternative rejected:* keep Distribution scaled and tagged — preserves the equality but keeps
showing synthetic per-game placement, which is exactly what the decision removes.

### 2.3 Mixed bases in one Distribution window

A 3-season window can mix a store season (half-PPR) with a live-API season (league) — a
store-disabled or legacy-cache session. The data is still shown; the caption lists which seasons are
which (§4.4). Seasons whose resolver returns `basis: null` contribute no points and are not listed.

### 2.4 `getSeasonData` is left alone

No consumer (§1.4); changing it changes nothing rendered. Classified, not edited. A future consumer
that renders its `weeklyPoints` per week must switch it to the resolver.

### 2.5 Idempotence

`rescoreSeasonTotals` passes a row through untouched when it already carries
`sourceFantasyPoints` **or** `sourceWeeklyPoints` (`!== undefined`). `sourceWeeklyPoints` is the
served `row.weeklyPoints` **by reference** (like `stats`, never mutated), or `null` when the served
row has none — so a rescored row always carries the key.

---

## §3 Consumer classification (requirement 2)

| Consumer | What it does with weeks | Class | Series after this slice | Tag |
|---|---|---|---|---|
| `src/utils/gameLog.js` `buildGameLogRows` (`:130`, `pts` at `:148`) | Pure; renders whatever series the caller passes, one value per week | Series-agnostic helper | unchanged — caller decides | none (unchanged) |
| `src/components/dp/GameLogSection.jsx` (`:32-33`) | `PTS` column: one value per week | **Displays individual weeks** | resolver (`sourceWeeklyPoints`) + basis caption | **remove** `PROVISIONAL(heuristic)` |
| `src/components/dp/DistributionSection.jsx` (`:29-30`) | Per-game histogram, over-20/under-10 counts, mean/SD/CV | **Displays individual weeks** (§2.2) | resolver + basis caption | **remove** |
| `src/utils/outlookConsistency.js` `extractGamePoints` (`:17-22`) / `computeConsistency` | Pooled mean/SD/boom-bust feeding the aggregates below | **Aggregate** — mean/SD beside league PPG | scaled `weeklyPoints` (unchanged) | **keep**, reason reworded |
| `outlookConsistency.js` `computeSeasonConsistency` | Per-season mean/SD/CV; only its season list is consumed (by Distribution) | **Scale-invariant** (CV only; §1.3) | scaled (unchanged) | comment, no tag |
| `src/components/dp/PlayerDetailTabs.jsx` (`:89-90`) | Compare-matrix "consistency" = pooled SD beside ppgNow/ppgNext | **Aggregate** | scaled | **keep**, reason reworded |
| `src/components/market/Market.jsx` `:535-536` (`floorRiskSd`, Value set "±SD") | Pooled SD beside now/next PPG | **Aggregate** | scaled | **keep**, reason reworded |
| `src/components/market/Market.jsx` `:553-554` (`cons`, Outlook "PPG ± SD") | Pooled mean ± SD | **Aggregate** | scaled | **keep**, reason reworded |
| `src/components/dp/PlayerDetailModal.jsx:84-85` (`floorRiskSd`: Floor-risk tile `:283`, header line `:367`) | Pooled SD beside career avg / next-season PPG | **Aggregate** (not in the brief's list; found by grep) | scaled | **add** `PROVISIONAL(heuristic)` (render-site tag was missing) |
| `src/hooks/usePlayerProfile.js:98` (`getSeasonData`) | Returns the object; nothing consumes it | **Unconsumed** (§2.4) | scaled (unchanged) | none |
| `src/api/sleeperStats.js:309` (`rescoreSeasonTotals`) | Produces the scaled series | Producer | scaled + new `sourceWeeklyPoints` | **keep** |

"Reason reworded" = replace the existing tag line at that site with:

```js
// PROVISIONAL(heuristic): per-game SD/mean over weeklyPoints scaled by each season's league/half-PPR ratio · an aggregate shown beside league-basis PPG, so it must stay on the league basis, and the store has no per-week league values · per-week scoring keys in season-totals (D-47)
```

(`extractGamePoints`' tag says "per-game points" instead of "per-game SD/mean"; otherwise identical.)

---

## §4 Implementation

### 4.1 `src/api/sleeperStats.js` — `rescoreSeasonTotals` (CR-02 trigger)

- Passthrough condition (`:317`): add `|| row.sourceWeeklyPoints !== undefined`.
- Output row (`:341-347`): add `sourceWeeklyPoints: row.weeklyPoints ?? null` (reference, not a copy).
- Header comment (`:300-308`): append to the "Rescored rows carry…" sentence that they also carry
  `sourceWeeklyPoints` (the served weekly series, untouched), and that the passthrough keys on either
  source field. The existing `PROVISIONAL(heuristic)` line at `:309` stays verbatim.
- Nothing else in the file changes. `getSeasonTotals` untouched; the cache keeps raw rows.

### 4.2 `src/utils/outlookConsistency.js` — resolver + summary (view-only)

Add, exported:

```js
/**
 * The weekly series a surface that DISPLAYS individual weeks should render, and its basis.
 * weekly-points-display-basis.md §2.1. Never feeds an aggregate that must match a league-basis
 * season total — those read seasonData.weeklyPoints (scaled) via extractGamePoints.
 * @returns {{ weeklyPoints: object|Array|null, basis: 'half_ppr'|'league'|null }}
 */
export function resolveDisplayWeeklyPoints(seasonData)

/** Finite display-series points for one season, plus its basis (resolver over extractable values). */
export function extractDisplayGamePoints(seasonData) // → { points: number[], basis }

/**
 * Mean / population SD / CV over an arbitrary finite point list. sd is null below
 * MIN_POOLED_GAMES (the same floor computeConsistency applies to its pooled SD); cv null when
 * sd is null or mean ≤ 0.
 */
export function summarizeGamePoints(points) // → { games, mean, sd, cv }
```

Implement the resolver exactly per the §2.1 table. `extractDisplayGamePoints` filters with
`Number.isFinite` exactly like `extractGamePoints` (object or array; `null` series → `[]`).
`summarizeGamePoints` reuses the module's private `mean`/`populationStdDev`.

Also: reword `extractGamePoints`' tag (§3); add one comment line above `computeSeasonConsistency`:
`// Its cv is invariant under a uniform per-season scale (scaled and source series agree); the
// pooled cv in computeConsistency is not, when the window's seasons have different ratios.`
Update the module's JSDoc for `extractGamePoints` to say it reads the **scaled** series and is for
aggregates.

### 4.3 `src/components/dp/GameLogSection.jsx`

- `const display = resolveDisplayWeeklyPoints(seasonData)` (memo on `seasonData`); pass
  `weeklyPoints: display.weeklyPoints` to `buildGameLogRows`; delete the `PROVISIONAL` line.
- Below the `<table>` (inside the `overflow-x-auto` wrapper's parent — wrap both in a fragment or a
  `div`), render when `display.basis` is non-null **and** at least one built row has a finite `pts`
  (no caption under an all-`—` PTS column):
  `<p data-testid="game-log-basis" className="mt-2 text-[11px] text-dp-muted">{copy}</p>`
  - `'half_ppr'`: **"Weekly PTS are half-PPR — league scoring isn't available week by week. Season totals use league scoring, so these weeks won't necessarily add up to them."**
  - `'league'`: **"Weekly PTS are league-scored from Sleeper's weekly stats, with the scoring settings in effect when this season was first loaded."**
- Column header stays `PTS`. Degraded branches unchanged (no caption there).

### 4.4 `src/components/dp/DistributionSection.jsx`

- Replace `points` with a per-season pass over `seasons`:
  `const perSeason = seasons.map(s => ({ season: s.season, ...extractDisplayGamePoints(careerStats?.[s.season]?.[playerId]) }))`,
  `points = perSeason.flatMap(p => p.points)`.
- `const { games, mean, sd, cv } = summarizeGamePoints(points)` — these replace `consistency`'s
  `mean/sd/cv/pooledGames` everywhere in the render (shape rows, `X of N` denominators, ±1 SD
  markers, `coverageBand(games)`). Keep `window` and `seasons` from `consistency`.
  The `!consistency` degraded branch is unchanged.
- Delete the `PROVISIONAL` line. Update the header comment: the window is reused from
  `computeConsistency`; the values are the display series (§2.2), so the SD equals the Overview
  tile's only for rows whose weeks are league-scored.
- Caption under the shape block, `data-testid="dist-basis"`, `text-[11px] text-dp-muted`; bases =
  the distinct non-null `basis` values of `perSeason` entries with `points.length > 0`:
  - only `'half_ppr'`: **"Per-game points are half-PPR — league scoring isn't available week by week. The Overview's ±SD is measured on league-scaled weeks, so it differs from the SD here."**
  - only `'league'`: **"Per-game points are league-scored from Sleeper's weekly stats, with the scoring settings in effect when each season was first loaded."**
  - both: **"Per-game points mix scoring bases — half-PPR: {list} · league: {list}. League scoring isn't available week by week for stored seasons."** where each `{list}` is that basis's seasons ascending, joined `", "`.
  - none: no caption.

### 4.5 Tag-only edits

- `PlayerDetailTabs.jsx:89`, `Market.jsx:535`, `Market.jsx:553`: replace the tag line with §3's.
- `PlayerDetailModal.jsx:84`: add §3's tag line directly above the `consistency` memo.
- No logic change in any of these files.

---

## §5 Tests

1. **`src/api/sleeperStats.test.js`** (`describe('rescoreSeasonTotals')`):
   - *sourceWeeklyPoints preserves the pre-rescore weeks:* `wrRow()` → `out.w1.sourceWeeklyPoints`
     `toEqual({ 1: 4.25, 2: 4.25 })` **and** `toBe(input.w1.weeklyPoints)` (reference), while
     `out.w1.weeklyPoints[1]` is the scaled value (≠ 4.25). Array form: `[4.25, null, 4.25]`
     preserved as-is.
   - *absent weekly series:* the existing "weeklyPoints absent stays absent" test additionally
     asserts `sourceWeeklyPoints` is `null`.
   - *idempotence:* extend the existing deep-freeze test — `twice.w1` still `toBe(once.w1)`; and a
     row carrying only `sourceWeeklyPoints` (no `sourceFantasyPoints`) passes through by reference.
   - *live-API row:* `wrRow({ scoringBasis: undefined })` → `sourceScoringBasis` null and
     `sourceWeeklyPoints` equal to the input weeks.
2. **`src/utils/outlookConsistency.test.js`**:
   - `resolveDisplayWeeklyPoints`: one case per §2.1 row (7 rows + `sourceWeeklyPoints: null`).
   - `summarizeGamePoints`: known set (reuse the `[12,8,10,14,6,16,9,11]` numbers plus two more
     games to clear `MIN_POOLED_GAMES`) → hand-computed mean/sd/cv; 9 games → `sd`/`cv` null;
     `[]` → `{ games: 0, mean: null, sd: null, cv: null }`.
   - *Scale-invariance proof (brief test 4):* build a half-PPR row with ≥ 8 weeks, run it through
     the real `rescoreSeasonTotals` (import from `../api/sleeperStats`, as
     `inSeasonEvidence.test.js:10` does) with a league that yields a ratio ≠ 1;
     `computeSeasonConsistency(rescored).cv` `toBeCloseTo` the cv computed on
     `{ weeklyPoints: rescored.sourceWeeklyPoints }` to 3 dp, **and** the two `sd`s differ. Then a
     two-season pool with different ratios: `computeConsistency` on the rescored career vs on a
     career rebuilt from `sourceWeeklyPoints` — assert the pooled `cv`s **differ** (pins §1.3, so
     nobody later "simplifies" an aggregate onto the invariance argument).
3. **`src/components/dp/PlayerDetailModal.gameLogDistribution.test.jsx`** (existing fixture rows
   carry no `scoringBasis` and no source fields → resolver basis `'league'`):
   - *Game log renders the half-PPR week, not the scaled one:* a fixture season whose row has
     `scoringBasis: 'league'`, `sourceScoringBasis: 'half_ppr'`, `weeklyPoints: { 1: 20.0 }`,
     `sourceWeeklyPoints: { 1: 17.3 }` → week-1 `PTS` cell reads `17.3`, no cell reads `20.0`;
     `game-log-basis` contains `half-PPR` and `won't add up`.
   - *Live-API row labelled league-scored* (brief test 3, restated for §1.1 — a live-API row IS
     rescored, so it carries `sourceWeeklyPoints`): row with `scoringBasis: 'league'`,
     `sourceScoringBasis: null`, `weeklyPoints: { 1: 20.0 }`, `sourceWeeklyPoints: { 1: 19.1 }` →
     `PTS` reads `19.1`; `game-log-basis` reads the `'league'` copy and does **not** contain
     `half-PPR`. Second variant, the raw unrescored live-API row (no label, no source fields) →
     `PTS` is `—` and no `game-log-basis` renders (§2.1 row 6).
   - *No caption under an all-`—` column:* rescored half-PPR row with `sourceWeeklyPoints: null` →
     no `game-log-basis`.
   - *Distribution on rescored rows:* **its own fixture** — the existing window rows are constant
     (`makeWeekly(15, 14.0)`, `makeWeekly(16, 16.0)`) and give SD ≈ 0 on both series. Use two
     window seasons whose `sourceWeeklyPoints` are non-constant, and `weeklyPoints` = source × a
     season ratio (e.g. 1.3 and 1.1) with values chosen so the pooled source SD and the pooled scaled
     SD differ **after `toFixed(1)`** (assert the two strings differ in the test itself, not by
     eye). Then `dist-sd` equals the hand-computed source SD and differs from `tile-floor`'s
     ±value; `dist-basis` reads the half-PPR copy.
   - *Mixed window:* one half-PPR season + one live-API season → `dist-basis` lists each season
     under its basis.
   - Rename the existing `:220` test to say the equality holds **for league-scored weekly rows**;
     its assertions stay (they still hold — the fixture rows resolve to `'league'` and
     `sourceWeeklyPoints` is absent, so display = scaled).
4. **`gameLog.test.js`** — no change (`buildGameLogRows` unchanged).

Any other test that deep-equals a whole rescored row gains `sourceWeeklyPoints` — update it to assert
the new field's value, not delete the assertion.

---

## §6 Docs

- **`docs/ui.md:300`** (Game log `PTS` bullet) — replace with: `PTS` reads the display series from
  `outlookConsistency.resolveDisplayWeeklyPoints` — for a store season the served half-PPR week
  (`sourceWeeklyPoints`, since `rescoreSeasonTotals` rescales only season totals exactly), labelled
  half-PPR under the table; for a live-API season the league-scored week, labelled as league scoring;
  `—` when the row's basis is unknown. REG-only; every POST row's `PTS` is `—` by design.
- **`docs/ui.md:305`** (§distribution) — the window is `computeConsistency`'s own `seasons` (reused,
  never re-derived); every value — histogram, mean/SD/CV, counts, ±1 SD markers, pips — is computed
  over the display series via `extractDisplayGamePoints`/`summarizeGamePoints`, so its SD equals the
  Overview tile's `±SD` only for league-scored weekly rows; a caption states the basis (or the
  per-season mix). Drop "provably identical" and "bucket assignment is approximate".
- **`docs/nav/components.md:33-34`** — GameLogSection row: add "PTS from `resolveDisplayWeeklyPoints`,
  basis caption". DistributionSection row: replace "(reused, not re-derived, so its SD is provably
  the Overview tile's `±SD`)" with "(window reused, not re-derived; values from the display series,
  basis caption)".
- **`docs/nav/utils.md:36`** — add `resolveDisplayWeeklyPoints`, `extractDisplayGamePoints`,
  `summarizeGamePoints` to the export list; `extractGamePoints` reads the scaled series (aggregates);
  Distribution pools the display series over `computeConsistency`'s window.
- **`docs/signal-registry.md:45`** — in the Fantasy-scoring-core row's reconstructable cell, replace
  "`weeklyPoints` scaled by the season ratio." with "`weeklyPoints` scaled by the season ratio (for
  aggregates); the served weekly series survives as `sourceWeeklyPoints`, which the pop-up's Game log
  and Distribution display, labelled by basis."
- **`docs/signal-registry.md:115`** — Outlook-consistency row: source cell becomes "from in-memory
  `careerStats[...].weeklyPoints` (the scaled series)"; current-use cell adds "the pop-up's
  Distribution reuses only its season window and computes over the display series".
- Wording must state mechanism, not today's availability (`docsAvailabilityClaims.test.js`).
- CLAUDE.md: no change (the "one season seam" invariant still holds; no new module).

---

## §7 Cross-repo impact

### 7.1 CR-02 · season-totals schemaVersion & row composition — **fires**

Triggers touched: `rescoreSeasonTotals` in `src/api/sleeperStats.js`; `extractGamePoints`'s module
`src/utils/outlookConsistency.js`; the served-`weeklyPoints` reader `src/components/dp/GameLogSection.jsx`;
`buildGameLogRows` in `src/utils/gameLog.js` (read, not edited — its input series changes).

Mirror (CR-02, verbatim):
> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry.

**Registry edit (app applies in Session 2; data syncs via D-43, §8):** this slice creates a new
data-side hazard — the app now renders served `weeklyPoints` verbatim and labels them from the
served `scoringBasis`. In `docs/cross-repo-registry.md` CR-02:

- **Triggers**, replace
  `the served-\`weeklyPoints\` readers \`src/components/dp/GameLogSection.jsx:32\` and \`src/hooks/usePlayerProfile.js:98\` (\`[registry-stale]\`, reported by season-rescore.md's plan gate, corrected here)`
  with
  `the served-\`weeklyPoints\` readers \`src/hooks/usePlayerProfile.js:98\` (\`[registry-stale]\`, reported by season-rescore.md's plan gate, corrected here) and \`resolveDisplayWeeklyPoints\` in \`src/utils/outlookConsistency.js\` (reads the served series as \`sourceWeeklyPoints\` and labels it by \`sourceScoringBasis\`; rendered by \`src/components/dp/GameLogSection.jsx\` and \`src/components/dp/DistributionSection.jsx\` — weekly-points-display-basis.md)`
- **Triggers**, replace
  `` `src/utils/outlookConsistency.js:18` (`extractGamePoints`, the served `weeklyPoints` reader — `[registry-stale]`, this list named `weeklyStatus` readers but no `weeklyPoints` reader until in-season-season-totals.md, corrected here); ``
  with
  `` `extractGamePoints` in `src/utils/outlookConsistency.js` (the scaled `weeklyPoints` reader — `[registry-stale]`, this list named `weeklyStatus` readers but no `weeklyPoints` reader until in-season-season-totals.md, corrected here), rendered through `computeConsistency` by `market/Market.jsx` (Value `±SD`, Outlook `PPG ± SD`), `dp/PlayerDetailTabs.jsx` and `dp/PlayerDetailModal.jsx` (Floor-risk tile) — `[registry-stale]`, call sites omitted until weekly-points-display-basis.md's plan gate, corrected here; ``
  (drops the `:18` anchor, which this slice's §4.2 edits move.)
- **Invariant**, append after the final sentence (`…the app detects emission per season by key presence.`):
  ` **Since weekly-points-display-basis.md**, served \`weeklyPoints\` are on the basis the row's \`scoringBasis\` names — the app displays them verbatim under that label.`
- **Mirror**, append after the final sentence:
  ` **Since weekly-points-display-basis.md the app displays served \`weeklyPoints\` verbatim** (the pop-up's Game log \`PTS\` and Distribution histogram) and labels them half-PPR from the row's served \`scoringBasis\`: changing the basis \`weeklyPoints\` is written on — D-47 included — without changing \`scoringBasis\` in the same change mislabels every displayed week, with no app-side diff and no failing test.`

Session 2 verifies each replaced span matches the live file exactly before editing; on any mismatch it
stops and reports.

### 7.2 CR-18 · Signal registry rows — **fires** (§6's `docs/signal-registry.md` edits)

Mirror (CR-18, verbatim):
> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

Data-side action: none beyond D-43's existing `data-catalog.md` check — no ingested field, coverage
or reconstructability changes; only the app's current-use text.

### 7.3 Checked, not fired

- **CR-21** (in-progress season-totals reads): its triggers are `loadCurrentSeasonTotals`'s
  `dsPath`/`allowInProgress` call, the App effect, `buildFpaTable` call sites, `inSeasonEvidence.js`
  and `useWeeklyDecision.js` readers — none edited. Live-season rows gain `sourceWeeklyPoints` via
  the shared seam (a CR-02 trigger), and no CR-21 reader reads it.
- **CR-01** (snapshot envelope): snapshots don't serialize `careerStats` rows (§1.7).
- **CR-14** (`calculateFantasyPoints` port): `fantasyPoints.js` untouched.
- **CR-15** (R3-FIT mirror): no projection/scoring module touched; every changed consumer is view-only.
- **CR-24** (registry byte-identity): fires only via the §7.1 edit, absorbed by D-43's pending sync —
  no additional red window (D-43's run is already red).

---

## §8 Backlog — `.claude/tasks/data-repo-backlog.md`

Append to **D-43**'s body (do not open a new entry):

> Also carries weekly-points-display-basis.md's CR-02 edit (Triggers: the `weeklyPoints` readers and
> their call sites; Invariant and Mirror: the display-basis sentences) — found at app
> `<Session 2 SHA>`. Same byte-copy, same sync; no separate run. Data-side check the new Invariant
> sentence against `lib/sleeper.mjs` (served `weeklyPoints` are `pts_half_ppr` per week, label
> `'half_ppr'` — true today).

Append to **D-47**'s body:

> Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim as half-PPR
> (Game log, Distribution). Serving per-week scoring keys lets the app show exact league weeks there
> and drop the basis caption; changing the basis of `weeklyPoints` itself must change `scoringBasis`
> in the same change (CR-02 Mirror).

---

## §9 Smoke (done-definition 6)

Open the pop-up for a rostered WR/TE with a store season as `mostRecentSeason`: Game log `PTS`
values are the half-PPR weeks (spot-check one against the store's `weeklyPoints` for that week), the
half-PPR caption renders once below the table; Distribution renders its caption, and its SD may
differ from the Floor-risk tile — expected. Market Value "±SD" and Outlook "PPG ± SD" unchanged
from before the slice. No `NaN`, no empty caption.

---

## §10 Touch list

| File | Change |
|---|---|
| `src/api/sleeperStats.js` | `sourceWeeklyPoints`, passthrough, header comment |
| `src/utils/outlookConsistency.js` | 3 new exports, tag reword, comments |
| `src/components/dp/GameLogSection.jsx` | resolver + caption, tag removed |
| `src/components/dp/DistributionSection.jsx` | display series + summary + caption, tag removed |
| `src/components/dp/PlayerDetailTabs.jsx` | tag reword |
| `src/components/market/Market.jsx` | two tag rewords |
| `src/components/dp/PlayerDetailModal.jsx` | tag added |
| `src/api/sleeperStats.test.js`, `src/utils/outlookConsistency.test.js`, `src/components/dp/PlayerDetailModal.gameLogDistribution.test.jsx` | §5 |
| `docs/ui.md`, `docs/nav/components.md`, `docs/nav/utils.md`, `docs/signal-registry.md` | §6 |
| `docs/cross-repo-registry.md` | §7.1 CR-02 edit |
| `.claude/tasks/data-repo-backlog.md` | §8 |

Not touched: `src/utils/gameLog.js`, `src/hooks/usePlayerProfile.js`, `getSeasonTotals`, any
projection/scoring module. Hand-back pastes `grep -rn "PROVISIONAL(" src/` (expect: two removed, one
added, net −1 from 26).

---

## Review records

### Plan review 1 (plan-reviewer, 2026-09-26) — 8 flags, each verified against live source; decisions by Session 1 (Anton delegates review calls)

| # | Flag (short) | Verdict | Resolution |
|---|---|---|---|
| 1 | `'league'` copy can be false: live-API weeks use the league selected at first fetch (cache key not league-scoped, permanent TTL) | correct (`sleeperStats.js:167,188-196,294`) | §1.2a added; both `'league'` captions now claim only "scoring settings in effect when this season was first loaded" |
| 2 | Unrescored + unlabelled row labelled `'league'`, but its weeks were scored with `{}` settings | correct (`App.jsx:891`, `sleeperStats.js:312`) | §2.1 row 6 → `{ null, null }` (omit); §5.3 variant asserts `—` and no caption |
| 3 | A pre-label store row in IndexedDB would read as live-API | **rejected** — the label (data `a4d63da`) predates `weeklyStatus` (`135d8ac`), and `getSeasonTotals` force-refetches any cache entry lacking `weeklyStatus` (`:174-175`); the only unlabelled commit (`82235d2`) has no `weeklyStatus` | evidence recorded in §1.2 |
| 4 | Half-PPR caption asserts "won't add up" unconditionally; renders under an all-`—` column | correct (ratio 1 for a half-PPR league) | copy → "won't necessarily add up"; caption gated on ≥ 1 finite `pts`; §5.3 test added |
| 5 | Distribution rescored-row test can't differ on the existing constant fixture | correct (`makeWeekly` constant) | §5.3 requires its own non-constant fixture and an in-test `toFixed(1)` difference assertion |
| 6 | New data obligation lives only in CR-02 `Mirror`, not `Invariant` | correct — the data reviewer checks `Invariant` | §7.1 adds an Invariant sentence; D-43 note asks the data side to check it against `lib/sleeper.mjs:200` (true today) |
| 7 | `outlookConsistency.js:18` anchor drifts in this very change | correct | §7.1 replaces it with a name-only reference |
| 8 | CR-02 omits `computeConsistency`'s rendering call sites | correct (`[registry-stale]`) | folded into the same §7.1 Triggers replacement, names not line anchors; rides D-43's pending sync |

Net registry churn stays inside D-43's already-open red window — no new mirror-run failure.
