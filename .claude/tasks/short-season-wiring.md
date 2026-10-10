# Short-season games rule — wiring (L6c → app), Stage B

Session 1 (opus), 2026-10-10. This wires the L6 decision recorded in `../future_plans/in-season-notes-plan.md` → "L6 decision (2026-10-10)".

**Research it wires** (data repo, pushed):
- the verdict, `grading/2026-10-10-games-short-verdict.md`;
- the constants, `backtests/2026-10-10-games-short-constants.json` @ data `4fa76897d39b36c5fda685de128725d6fc10797a`;
- the task file, `.claude/tasks/games-calibration-short-only.md`.

Planned on app `ac26e0b` and data `98f07e6`, both clean and in sync with origin.

**Three stages, in this order:**

| stage | repo | task file | what |
|---|---|---|---|
| A | data | `.claude/tasks/short-season-wiring-data.md` §A | re-mirror `lib/durabilityMirror.mjs` (`rule: 'l6c'`); commit the in-season override check that justifies §0 D3; **push** |
| **B** | **app** | **this file** | the rule in `seasonProjection.js` Step 6, the in-season override in `applyInSeasonProjection`, the K pin, the PRIOR_MODEL_FROM bump, registry, docs and backlog; **push** |
| C | data | `short-season-wiring-data.md` §C | registry byte sync, anchor-policy boundary 8, and the mirror header's app SHA; **push the same day as B** |

**Stage B starts only after Stage A is pushed.** Stage A's check result (§0 D3) decides which in-season branch §2.3 implements.

## 0. What and decisions

**The rule.** A veteran's projected games stay as today when last season (the last completed season, `currentSeason`) qualified, i.e. `gamesPlayed ≥ 8`. Otherwise the pre-round games value is scaled by a pinned per-position k, with floor 0:

| last season | QB | RB | WR | TE |
|---|---|---|---|---|
| `short` (row present, gp < 8) | 0.50 | 0.51 | 0.52 | 0.53 |
| `none` (no row) | 0.50 | 0.50 | 0.50 | 0.55 |

- These are L6c's SOf0 full-sample k.
- `short` comes from the `pos|s` cells.
- `none`:
  - WR and TE come from `pos|s`;
  - QB and RB are thin cells, so they take the non-qualifying `pos` root (0.50).

**On 2026-10-07 veterans, L6c §7 shows:**
- 98 of 437 change;
- 33 fantasy-relevant players are cut by ≥ 4 games;
- Daniels, Garrett Wilson, Aiyuk and Ridley go 17 → 9.

**D1 — scope.** The rule applies on the veteran path only. Rookies are unchanged.
- A `chain` QB row's `projectedTotalPts` stays `qbStarterPPG × qbStartShare × games` (L6 limit). Its `projectedGames` still moves.
- `projectedPPG` never moves, because `durabilityFactor` scales totals only (signal registry). So the dynasty score, posteriors and lineups (which read PPG) do not move.

**D2 — guard.** When `careerStats?.[currentSeason]` is not a **non-empty** object, the rule does not fire: state `null`, k `null`, no change. An empty row-set (API-only mode's `getSeasonTotals` returns `{}` when every week fails, `src/api/sleeperStats.js:226-305`) would otherwise read every veteran as `none` and halve them all. Partial-week failures in API-only mode can still under-count gp. API-only mode already diverges from the store (CR-28); this is recorded as a limit.
- In the app `currentSeason` is the last key of `careerStats`, so the guard never fires there.
- The test factories pass `currentSeason: 2025` with careerStats ending 2024 (`src/__fixtures__/factories.js:265,308`). Without the guard every existing fixture would read as `none` and be cut.

**D3 — the in-season rule (Anton's hard requirement).** The research is S → full S+1. In-season, the app shows `projectedTotalPts = pointsSoFar + projectedPPG × max(0, projectedGames − n)` (`src/utils/inSeasonScoring.js:548`), where n is live games played. With a cut `projectedGames` of 9, a player who has played 5 healthy games would show 4 more games. That is the failure Anton named.

**Rule:** in the displayed (scored) copy, a cut row whose live season so far shows **`gamesPlayed ≥ 1` and `dnpWeeks === 0`** uses `projectedGamesBase` (the uncut value) for remaining games and for its displayed `projectedGames`. Any missed week (`dnpWeeks ≥ 1`) keeps the cut.

**The check (Session 1 probe; Stage A commits it as a pre-registered harness section).**
- Population: L6c's 723 out-of-sample non-qualifying rows (S 2018–2024).
- At week checkpoints w, it predicts remaining games played with `max(0, G − n)`, where:
  - n = `'P'` slots in weeks 1..w of S+1;
  - "healthy" = no `'D'` slot so far and n ≥ 1 (the app's exact test);
  - G is either the cut games (SOf0) or the base games (C0).

| w | healthy n | MAE, cut | MAE, base | bias, cut / base | missed-a-week n | MAE, cut | MAE, base |
|---|---|---|---|---|---|---|---|
| 1 | 224 | 5.74 | **3.92** | −4.61 / +1.35 | 0 | — | — |
| 2 | 192 | 6.09 | **3.62** | −5.28 / +0.64 | 65 | **3.60** | 5.29 |
| 4 | 166 | 6.43 | **3.45** | −5.83 / +0.14 | 146 | **3.55** | 5.41 |
| 6 | 146 | 6.70 | **3.51** | −6.03 / −0.12 | 210 | **3.61** | 5.50 |
| 8 | 132 | 6.48 | **3.38** | −5.84 / −0.39 | 266 | **3.52** | 5.71 |
| 10 | 124 | 5.78 | **3.60** | −4.81 / −0.23 | 314 | **3.41** | 5.89 |
| 12 | 109 | 4.51 | **3.38** | −3.67 / −0.40 | 348 | **3.17** | 5.94 |

**What the check shows:**
- For **healthy** players, the uncut base is better from week 1 on. The cut under-projects by 4–6 games.
- Injured stars (the star cohort) show the same: week-4 MAE is 3.26 for the base vs 6.31 for the cut.
- For players who **missed a week**, the cut is better: bias −0.8 vs +4.8 at w = 4.
- Players with no game yet (`record.n` 0; `buildScoringPosteriors` still writes a record) fail `n ≥ 1`, so they keep the cut.
- **Known lag (limit).** A week's gameday inactives reach `'D'` in the live file one season-totals run after the games (CR-21, CR-28). A cut player who sat out Sunday reads healthy, and shows uncut games, until the next run classifies the week. The check ran on sealed, fully classified seasons, so it does not measure this. It is stated in the function's header comment and in the CR-21 Mirror (§4.1 item 4). A stronger test (live `gamesPlayed` = the team's games) is deferred: team changes mid-season make it a design question.

So the override is a binary switch on observed 2026 health, not a decay, and it is right at every checkpoint.

Stage A pre-registers the decision: **`override`** if, at every w, healthy base MAE < healthy cut MAE and (where missed n ≥ 30) missed cut MAE < missed base MAE; otherwise **`preseason-only`**. §2.3 implements whichever result Stage A pushes.

**D4 — model pin.**
- `PRIOR_MODEL_FROM` = the UTC date of the app push **+ 1 day** (the "day after the app push" convention, `inSeasonConstants.js:29-35`). If the push slips past the planned day, amend the date before pushing.
- Re-record `GOLDEN` in `src/__tests__/priorModelFrom.test.js` with two new fixtures (§3).
- No `K_*` moves: the in-season k fits read `projectedPPG`, which is unchanged (CR-25).

**D5 — constants pin by byte copy, never by hand** (CR-27 pattern). Copy with `git -C ../sleeper-dashboard-data show 4fa76897d39b36c5fda685de128725d6fc10797a:backtests/2026-10-10-games-short-constants.json > src/__fixtures__/games-short-constants-2026-10-10.json`. **Never copy from the data working tree:** Stage A's `--write` may rewrite that file's `generatedAt`/`panelRev`. A test re-derives `SHORT_SEASON_K` from it.

## 1. Facts this plan relies on (checked against live source)

- **Step 6** (`seasonProjection.js:879-923`): `avgGames` is built from the `recent` qualifying seasons (gp ≥ 8, `:656-680`) × the injury-season and absence-shape multipliers. Then `projectedGames = Math.round(clamp(avgGames, 8, 17))` and `durabilityFactor = projectedGames / 17` (`:922-923`).
  - `projectedTotalPts` = `projectedPPG × projectedGames`, except on `chain` rows (`:1015-1017`).
  - `'Injury history ↓'` fires at `durabilityFactor < 0.85` (`:1033`).
- **Inputs.** `computeNextSeasonProjection` receives `careerStats` (completed seasons only) and `currentSeason` = its last key (`App.jsx:1307`, `:685-708`). The live season reaches the scored copy only, through `applyInSeasonProjection` (`App.jsx:735-737`), and display consumers read that copy (`App.jsx:798,1461,1471,1498`).
- **`applyInSeasonProjection`** (`inSeasonScoring.js:530-552`):
  - the `record.start` branch (QB chain) never reads `projectedGames`;
  - the other branch reads `currentSeasonTotals.players[id]` for `fantasyPoints` and uses `proj.projectedGames - record.n`;
  - `record.n` = live `gamesPlayed` when it is > 0, else 0 (`:193`).
- **`dnpWeeks`** is required on every season-totals row (`dataStore.js:122` validator; CR-02/CR-28). The live file is the served in-progress season-totals file (CR-21).
- **The mirror's state.** `sState` = no S row → `none`; `(gamesPlayed ?? 0) >= 8` → `qual`; else `short`. This is `scripts/games-cause-run.mjs` `causeVeterans` / `enrichRow`. The app must use the identical expression.
- **The golden guard** (`priorModelFrom.test.js`) has only qualifying veterans (all factory careers end with a gp-14 season), so it would stay green without new fixtures.

## 2. Code

### 2.1 `src/utils/shortSeasonConstants.js` (new)

```js
// Short-season games rule (L6c → short-season-wiring). Pinned by byte copy from the data repo — never hand-edit.
export const SHORT_SEASON_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-10-10-games-short-constants.json',
  commit: '4fa76897d39b36c5fda685de128725d6fc10797a',
  candidate: 'SOf0',
}
// k on the pre-round games value when the last completed season is short (row, gp < 8) or none (no row).
export const SHORT_SEASON_K = {
  short: { QB: 0.50, RB: 0.51, WR: 0.52, TE: 0.53 },
  none:  { QB: 0.50, RB: 0.50, WR: 0.50, TE: 0.55 },
}
```

Header comment: the derivation rule is `cells['pos|s'][`${pos}|${state}`] ?? cells.pos[pos]` over `candidates.SOf0.k`, plus the CR-28 pointer.

### 2.2 `src/utils/seasonProjection.js` Step 6

Replace `:922-923` with:

```js
  const projectedGamesBase = Math.round(clamp(avgGames, 8, 17))
  // Short-season rule (short-season-wiring; L6c): last completed season short (gp < 8) or absent → scale the
  // pre-round games by the pinned k, floor 0. Guard: no non-empty careerStats row-set for currentSeason → rule off.
  const lastSeasonRows = careerStats?.[currentSeason]
  const shortSeasonState = (lastSeasonRows && typeof lastSeasonRows === 'object' && Object.keys(lastSeasonRows).length > 0)
    ? (!lastSeasonRows[playerId] ? 'none' : (lastSeasonRows[playerId].gamesPlayed ?? 0) >= 8 ? 'qual' : 'short')
    : null
  const shortSeasonK = (shortSeasonState === 'short' || shortSeasonState === 'none')
    ? (SHORT_SEASON_K[shortSeasonState][position] ?? null) : null
  const projectedGames = shortSeasonK != null ? Math.round(clamp(avgGames * shortSeasonK, 0, 17)) : projectedGamesBase
  const durabilityFactor = projectedGames / 17
```

Then:
- **`'Injury history ↓'` (`:1033`)** keeps its meaning. Change its test to `projectedGamesBase / 17 < 0.85`, so the injury-and-absence history alone drives it and a cut row is not labelled injury-prone twice (a `'none'` row may be a suspension). `durabilityFactor` itself stays `projectedGames / 17`.
- **Adjustment summary**, after `'Injury history ↓'`:
  ```js
  if (shortSeasonK != null) adjustmentSummary.push(shortSeasonState === 'none' ? 'No games last season — projected games cut ↓' : 'Under 8 games last season — projected games cut ↓')
  ```
- **Veteran `factors`**, next to `durabilityFactor`: `shortSeasonState`, `shortSeasonK`, `projectedGamesBase`.
- **Rookie path `factors`** (`:552` block): `shortSeasonState: null, shortSeasonK: null, projectedGamesBase: null`. Both paths always carry the keys, so a row is detectable at anchor-policy boundary 8, and absence means a pre-boundary capture.
- Import `SHORT_SEASON_K`.

Nothing else in Step 6 changes.

### 2.3 `src/utils/inSeasonScoring.js` `applyInSeasonProjection`

**If Stage A's pushed check result is `override`** (expected), the non-`start` branch becomes:

```js
    const live = currentSeasonTotals?.players?.[id]
    const pointsSoFar = Number.isFinite(live?.fantasyPoints) ? live.fantasyPoints : 0
    // short-season-wiring D3: a cut row whose live season shows ≥ 1 game and no missed week drops the cut
    // (L6c in-season check: the base wins for healthy players at every checkpoint; the cut wins once a week is missed).
    const base = proj.factors?.projectedGamesBase
    const healthy = proj.factors?.shortSeasonK != null && Number.isFinite(base)
      && record.n >= 1 && live?.dnpWeeks === 0
    const games = healthy ? base : proj.projectedGames
    const remainingGames = Math.max(0, games - record.n)
    out[id] = { ...proj, projectedGames: games, projectedPPG, projectedTotalPts: r1(pointsSoFar + projectedPPG * remainingGames), inSeason: record }
```

- **If the result is `preseason-only`:** `healthy` becomes `proj.factors?.shortSeasonK != null && Number.isFinite(base)`, so every scored cut row uses the base in-season. Report this in the hand-back.
- **Update the function's header comment:**
  - `projectedGames` is the full-season figure, except that a healthy cut row shows `projectedGamesBase`;
  - the snapshot keeps the raw value, because `writeProjectionSnapshot` reads the raw map.
- **The header comment also states the one-run `'D'` lag** (D3).
- **Leave alone:**
  - the `start` branch;
  - every other function;
  - ids without a record, and records with n = 0. They keep the raw cut projection.

### 2.4 Nothing else in `src/`

`Market.jsx`, `PlayerDetailModal.jsx`, `PlayerDetailTabs.jsx`, `marketFilters.js` and `MyTeamView.jsx` already read `projectedGames`/`projectedTotalPts` from whatever map they are handed. No edit.

## 3. Tests

**1. `src/__tests__/shortSeasonConstants.test.js` (new).**
- The fixture's `sha1` equals the data file's at `4fa7689`. Session 2 records the hash in the test.
- `SHORT_SEASON_SOURCE.commit` is a 40-hex string.
- For every state × position, `SHORT_SEASON_K` equals the derivation rule over `fixture.candidates.SOf0.k`.
- `fixture.candidates.SOf0.fitRows === 'non-qual'` and `floor === 0`.

**2. `src/utils/seasonProjection.test.js`, a new `describe('short-season rule')`.** Build careers with `makeVet` overrides so that `careerStats` contains `currentSeason`.
- **(a) Qualifying last season:** `projectedGames === factors.projectedGamesBase`, `shortSeasonState 'qual'`, `shortSeasonK null`.
- **(b) Last season gp 4 (WR):**
  - `shortSeasonState 'short'`, `shortSeasonK 0.52`;
  - `projectedGames === Math.round(clamp(avgGames × 0.52, 0, 17))`. Recover avgGames from a sibling run without the S row, or state the hand-computed value;
  - `projectedTotalPts === round1(projectedPPG × projectedGames)`;
  - `projectedPPG` equals the PPG of the **same inputs with `currentSeason` set to a season absent from careerStats**. That switches only the rule off: the veteran path reads `currentSeason` nowhere else (`:224-229`, `:464` and `:683` are rookie-only). Do not alter the S row's gp, which would change `qualifying`.
  - the summary contains `'Under 8 games last season — projected games cut ↓'`, and contains `'Injury history ↓'` only if the base run does.
- **(c) No S row (TE):** `shortSeasonState 'none'`, `shortSeasonK 0.55`.
- **(d) A cut below 8 is kept**, i.e. floor 0. Use a career whose avgGames × k < 7.5.
- **(e) Guard:** `currentSeason` not in careerStats, **and** `careerStats[currentSeason] = {}`, each give `shortSeasonState null` and an unchanged `projectedGames`. The existing factory default exercises the first.
- **(f) Rookie path:** all three keys are `null`.
- **(g) QB `chain` row with a short S:** `projectedGames` is cut, and `projectedTotalPts` is unchanged from the base run.

**3. `src/utils/inSeasonScoring.test.js`, `applyInSeasonProjection`:**
- **(a) Healthy cut row** (live `gamesPlayed 5`, `dnpWeeks 0`, base 17, cut 9): scored `projectedGames 17`, and `projectedTotalPts = pts + ppg × 12`.
- **(b) Missed a week** (`dnpWeeks 1`): `projectedGames 9`, remaining 4.
- **(c) A qualifying row** with `dnpWeeks 0` is unchanged from today's formula.
- **(d) The `start` branch** is unaffected by `shortSeasonK`.
- **(e) Live row without a finite `dnpWeeks`:** the cut is kept.
- **(f) No mutation:** the input `seasonProjections[id]` still has `projectedGames 9`.

**4. `src/__tests__/priorModelFrom.test.js`:**
- Add `vetWR_short` (last season gp 4) and `vetTE_none` (no last-season row), both with `currentSeason` set to the career's last season key.
- Re-record `GOLDEN`, with `recordedUnder` set to the new `PRIOR_MODEL_FROM`. The ten existing entries must not change; assert that in the hand-back.
- Extend the comment's re-record history with one line.

**5. `src/__tests__/factorsSchema.test.js`.** The factors contract grows to 82 veteran keys and 67 rookie keys (+3 each: `shortSeasonState`, `shortSeasonK`, `projectedGamesBase`). Update the test, and update the two numbers in CLAUDE.md → Invariants → "Factors contract" in the same commit. That is a 4-byte change, and CLAUDE.md stays under 25,000 bytes.

**6. Registry symbols.** There is **no** app-side registry symbol test (`src/__tests__/registry.test.js` does not exist). The check runs in the data repo at Stage C (`test/registry.test.mjs`). So in Stage B, grep every bare symbol §4.1 names against its named file, paste the result into the hand-back, and stop on any miss. The data-side names (`SHORT_CANDIDATES`, `enrichRow`, `accountWeeks`, `causeVeterans`, `scripts/games-short-run.mjs`) exist at data `98f07e6`.

## 4. Registry, docs, backlog (app side; data byte-syncs in Stage C)

### 4.1 `docs/cross-repo-registry.md`

Make the edits inside the CR-REGISTRY span **exactly as below**. Append each one at the end of the named field's line, except CR-28 App side, which gets **one new sub-bullet line**. Expected span diff: **10 modified lines + 1 added line** (CR-01 ×3, CR-21 ×2, CR-25, CR-26, CR-28 ×3 modified, plus CR-28's new sub-bullet). Stage C gates on this count.

1. **CR-01 Invariant** (`:50`), append:
   > **Since short-season-wiring (still v3, no bump)** both paths' `factors` carry `shortSeasonState` (`'qual'`/`'short'`/`'none'` on the veteran path — the last completed season's row has `gamesPlayed` ≥ 8 / < 8 / is absent; `null` on the rookie path or when `careerStats` lacks that season), `shortSeasonK` (the pinned k, or `null`) and `projectedGamesBase` (the pre-rule games, `null` on the rookie path). On a `'short'`/`'none'` veteran row `projectedGames` = round(clamp(pre-round games × `shortSeasonK`, 0, 17)) — it can be below 8 — and `projectedTotalPts` moves with it except on `chain` rows; `projectedPPG` does not move. In the displayed scored copy a cut row whose live season shows `gamesPlayed` ≥ 1 and `dnpWeeks` 0 carries `projectedGames` = `projectedGamesBase`; the snapshot `projection` stays the raw output. Additive only.
1b. **CR-01 Triggers** (`:52`). In the `applyInSeasonProjection` parenthetical, change "read `seasonProjections[id].projectedPPG`/`projectedGames`" to also name `factors.shortSeasonK`/`factors.projectedGamesBase`, and add "and, since short-season-wiring, rewrites `projectedGames` on a healthy cut row".
2. **CR-01 Mirror** (`:53`), append:
   > **short-season-wiring:** additive keys, no version bump. `projectedGames`/`projectedTotalPts` on `'short'`/`'none'` veteran rows move at `grading/anchor-policy.md` boundary 8 — segment by `factors.shortSeasonState` (absent = pre-boundary capture).
3. **CR-21 App side** (the line holding `applyInSeasonProjection` in its App side field), append:
   > Since short-season-wiring `applyInSeasonProjection` also reads the live row's `dnpWeeks` (the healthy-so-far test that lifts the short-season cut, CR-28).
4. **CR-21 Mirror** (`:244`), append:
   > **short-season-wiring:** a live `dnpWeeks` that is missing, renamed or marked differently silently changes which cut rows count as healthy — a missing value keeps the cut on every remaining-games total; and because a week's `'D'` lands one run after the games, a cut player who sat out reads healthy (uncut games) until that run.
5. **CR-25 Mirror** (`:276`), append:
   > **short-season-wiring** bumped `PRIOR_MODEL_FROM` for a `projectedGames`-only change: no `K_*` moves and no re-fit is owed — the fits read `projectedPPG`, which the short-season rule does not touch.
6. **CR-26 Mirror** (`:284`), append:
   > **short-season-wiring** bumped `PRIOR_MODEL_FROM` again; as since 2026-10-05, every pre-kickoff 2026 capture predates the epoch and is refused (`model`), so the live prior stands in — no new consequence.
7. **CR-28 App side**, add one sub-bullet after the last existing sub-bullet:
   > `- the short-season rule in \`computeNextSeasonProjection\` Step 6 (\`src/utils/seasonProjection.js\` — \`shortSeasonState\` from the last completed season's served \`gamesPlayed\`; \`SHORT_SEASON_K\` in \`src/utils/shortSeasonConstants.js\`, pinned by byte copy \`src/__fixtures__/games-short-constants-2026-10-10.json\`) and \`applyInSeasonProjection\`'s live \`dnpWeeks\` read in \`src/utils/inSeasonScoring.js\``

   Write it as **one unwrapped physical line**, with the existing sub-bullets' indentation, ending with `.`. **Do not touch the previous last sub-bullet**, which keeps its period; changing it would break Stage C's count. The backslashes above are for this file only; write plain backticks.
8. **CR-28 Data side** (`:311`), append:
   > Since short-season-wiring, `lib/durabilityMirror.mjs` `rule: 'l6c'` (`SHORT_SEASON_K`) mirrors the short-season rule, and `scripts/games-short-run.mjs` (`bin/backtest.mjs --games-calibration --short`) holds its fit and the in-season override check.
9. **CR-28 Triggers** (`:323`). Add `src/utils/shortSeasonConstants.js`, `src/__fixtures__/games-short-constants-2026-10-10.json` and `applyInSeasonProjection` in `src/utils/inSeasonScoring.js` to the app list. Add `scripts/games-short-run.mjs`, `SHORT_CANDIDATES` / `enrichRow` / `accountWeeks` in `lib/gamesCalibration.mjs` and `causeVeterans` in `scripts/games-cause-run.mjs` to the data list, after `‖`. In the same line's `computeNextSeasonProjection` parenthetical, add `shortSeasonState`.
10. **CR-28 Mirror** (`:324`), append:
    > **short-season-wiring:** the last completed season's served `gamesPlayed` now also sets the short-season state (≥ 8 / < 8 / absent), and the live `dnpWeeks` lifts the cut in-season — so a served-data correction that moves a last-season `gamesPlayed` across 8 moves that player's `projectedGames` by about half, with no app diff (an anchor-policy boundary, as boundary 7). A change to the 8-game line, the k table or the healthy test is a model change: re-run `node bin/backtest.mjs --games-calibration --short --write`, re-pin `SHORT_SEASON_K` by byte copy with the data SHA, re-mirror `rule: 'l6c'`, bump `PRIOR_MODEL_FROM` and add a `grading/anchor-policy.md` boundary.

Never write the sentinel literals inside an entry.

### 4.2 Docs

- **`docs/projection.md`, row 6 "Projected games" (`:28`).** Append a sentence giving the rule, the k table by reference to `shortSeasonConstants.js`, floor 0 for cut rows, and the in-season healthy override.
- **`docs/signal-registry.md`** (CR-18):
  - add a row, **Short-season games rule (`shortSeasonState`, `shortSeasonK`, `projectedGamesBase`)**: computed factor; `seasonProjection.js` Step 6 + `shortSeasonConstants.js`; 2012+; Reconstructable; L6c verdict pointer;
  - in the `durabilityFactor` row (`:93`), add "now includes the short-season cut".

### 4.3 Backlog (`.claude/tasks/data-repo-backlog.md`)

- **D-52:** append a paragraph:
  > **L6 (2026-10-10):** the 2026 actual games of veterans with `factors.shortSeasonState` `'short'`/`'none'` (boundary-8 captures) are the **first independent check** of the L6c rule — it was chosen and gated on the same 2015–2025 panel. Grade raw `projectedGames` against 2026 `gamesPlayed`, with `projectedGamesBase` as the counterfactual, by state and for the rel3 cohort; grade the in-season healthy override separately (remaining games, by checkpoint).
- **New D-67 · DM parity on the short-season rule.** Found: short-season-wiring. Blocking: no. Size: small. After the first post-boundary-8 capture:
  - rebuild a DM parity fixture from it;
  - run DM-1 under `rule: 'l6c'`, expecting ≥ 99%;
  - confirm anchor-policy boundary 8's cross-check.

  The id assumes D-66 is the pending data-side list; Session 2 verifies it is the next free id.

## 5. Touch list, done-definition, commits

**Touch list:**
- `src/utils/shortSeasonConstants.js` (new);
- `src/__fixtures__/games-short-constants-2026-10-10.json` (new, byte copy);
- `src/utils/seasonProjection.js` (§2.2);
- `src/utils/inSeasonScoring.js` (§2.3);
- `src/utils/inSeasonConstants.js` (`PRIOR_MODEL_FROM` and its comment chain only);
- tests (§3);
- `docs/cross-repo-registry.md`, `docs/projection.md`, `docs/signal-registry.md` (§4);
- `src/__tests__/factorsSchema.test.js` and the CLAUDE.md factors-contract counts (§3.5);
- `docs/nav/utils.md`:
  - a row for `shortSeasonConstants.js`;
  - fix `:48`: `applyInSeasonProjection` now rewrites `projectedGames` on a healthy cut row;
- `docs/projection.md:250`: the veteran clamp is `[8, 17]`, except cut rows at `[0, 17]`;
- the `factorsSchema.test.js` header comments (`:18`, `:48`, `:82`);
- `docs/navigation.md`: add `games-short-constants-2026-10-10.json` to the `src/__fixtures__/` provenance-oracle list;
- `.claude/tasks/data-repo-backlog.md`.

**Done-definition:**
1. `npm test` and `npm run lint` must be green, and `npm run build` must succeed.
2. **Smoke test** (CLAUDE.md → Workflow convention recipe; Anton's league):
   - The live season is on, so every surface shows the scored copy; there is no preseason toggle. Check, and report each case:
     - a cut player (`shortSeasonState` `short`/`none`) who has played every 2026 game with no missed week shows **uncut** games and a total consistent with them;
     - a cut player who has missed a week still shows the cut;
     - a cut player with no 2026 game yet still shows the cut.
   - Read the raw values from the console: `factors.shortSeasonState` / `projectedGamesBase` on the raw `seasonProjections` map. Daniels, G. Wilson, Aiyuk and Ridley must have raw `projectedGames` 9.
   - Console has no errors. Report these numbers; a screenshot is not sign-off.
3. In the hand-back, list:
   - the registry span diff line count (must be 10 modified + 1 added);
   - the §3.6 symbol grep;
   - the new `PRIOR_MODEL_FROM`;
   - which §2.3 branch was implemented, with Stage A's pushed result cited.

**Commits** (pull with rebase, then plain push):
1. `short-season-wiring B1: pin L6c K (data 4fa7689), Step 6 short-season rule, in-season healthy override, PRIOR_MODEL_FROM <date>`: code and tests.
2. `short-season-wiring B2: registry CR-01/21/25/26/28, projection + signal-registry docs, D-52 note, D-67`.

Push both. **Between this push and Stage C, the daily CR-24 mirror run goes red.** Stage C runs the same day.

**Hand-back:**
- SHAs and the UTC push time (Stage C writes it into the anchor-policy table);
- files touched;
- deviations;
- what each new test asserts;
- smoke numbers.

## Cross-repo impact

Mirror text is emitted for every entry this slice touches. Each **existing** Mirror is quoted by its opening sentence and points at its field in `docs/cross-repo-registry.md`, because the full texts are 3–6 KB each (the L6b precedent). The **new** text this slice adds is quoted in full in §4.1.

- **CR-01** (snapshot envelope; the `factors` shape and `projectedGames` are definition-site triggers).
  - Existing Mirror opens: "State the new envelope shape and whether the snapshot `schemaVersion` bumped."
  - New text: §4.1 items 1–2.
  - **Data action:** grading segments at boundary 8 (Stage C anchor policy). No importer or grader change: additive keys, no bump.
- **CR-21** (in-progress season-totals reads; `applyInSeasonProjection` gains a `dnpWeeks` read).
  - Existing Mirror opens: "If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell…**"
  - New text: items 3–4.
  - **Data action:** none.
- **CR-25** (`PRIOR_MODEL_FROM` lives in `inSeasonConstants.js`).
  - Existing Mirror opens: "An app-side change to any mirrored definition stales every fitted k: … never hand-edit a `K_*`."
  - New text: item 5.
  - **Data action:** none; no re-fit.
- **CR-26** (the frozen-prior epoch).
  - Existing Mirror opens: "This is the one place the app reads its own captures back."
  - New text: item 6.
  - **Data action:** none.
- **CR-28** (Step 6 and the `dnpWeeks` reader are triggers; `lib/durabilityMirror.mjs` re-mirrors).
  - Existing Mirror opens: "Changing the status set, the team-played source, the 2016 floor or the slot rule changes app `projectedGames`/`projectedTotalPts`, …"
  - New text: items 7–10.
  - **Data action:** Stage A re-mirror (`rule: 'l6c'`); Stage C anchor-policy boundary 8 and the registry sync; D-67 parity.
- **CR-18** (a signal-registry row is added).
  - Existing Mirror opens: "This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name."
  - **Data action:** none. No served field and no data-catalog row change.
- **CR-15** fires on its trigger (`seasonProjection.js` is one of its twelve listed modules).
  - Existing Mirror opens: "Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation**…"
  - **Data action: none.** The short-season rule changes `projectedGames` only, never a PPG factor multiplier that `lib/projectionFactors.mjs` reconstructs. The games rule is mirrored under CR-28 by `lib/durabilityMirror.mjs` (Stage A). No R3-FIT or in-season re-fit is owed.
- **Not touched:** CR-27 (QB `chain` totals unchanged), and CR-02/CR-22 (they do not fire on their Triggers).
- **Existing Mirrors are quoted by opening sentence only** (plan-gate flag 12, advisory). Quoting all of them in full would push this file past 40 KB; the precedent is L6b.
- **Route:** two-session (memory `sleeper-registry-edit-route`): the app applies, then data syncs by byte copy in Stage C.

## Plan gate (plan-reviewer, app side, 2026-10-10) — decisions

There were 13 flags. Session 1 checked each one and applied 12; flag 12 is recorded as advisory. The data-side gate (11 flags) is recorded in `short-season-wiring-data.md`. Its flags 1, 4 and 10 changed this file too: §4.1 item 7's form, D5's commit-pinned copy, and item 9's extra Triggers.

| # | flag | decision |
|---|---|---|
| 1 | `src/__tests__/registry.test.js` does not exist | Applied: §3.6 grep in B; the symbol test runs in data Stage C |
| 2 | An empty last-season row-set halves every veteran | Applied: the guard requires non-empty; test (e); the mirror (data A.1) matches |
| 3 | The live `'D'` lag lets a sat-out player read healthy for about a run | Applied: stated as a limit in D3, the header comment and the CR-21 Mirror; the stronger team-games test is deferred |
| 4 | `'Injury history ↓'` double-fires on cut rows | Applied: keyed to `projectedGamesBase` |
| 5 | CR-15 fires on its trigger | Applied: no-op Mirror emitted |
| 6 | Sub-bullet punctuation and wrap break the count | Applied: one unwrapped line; the previous bullet is untouched |
| 7 | The smoke "preseason view" does not exist in-season | Applied: three live cases plus raw values from the console |
| 8 | `nav/utils.md:48` and `projection.md:250` become false | Applied |
| 9 | "No game yet → no record" is wrong | Applied: n = 0 records exist; `n ≥ 1` handles them |
| 10 | §3.2(b) form left to Session 2 | Applied: the absent-`currentSeason` form |
| 11 | CR-01 Triggers / CR-28 parenthetical stale | Applied: items 1b and 9; the count is now 10 + 1 |
| 12 | Existing Mirrors not quoted in full | Advisory; kept as opening sentences (40 KB limit, L6b precedent) |
| 13 | Data-side symbols cannot be checked from the app | Confirmed present at data `98f07e6`; Stage C's `registry.test.mjs` gates |
