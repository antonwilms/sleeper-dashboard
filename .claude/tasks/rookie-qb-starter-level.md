# Rookie QB starter level — pinned group values replace the rookie-path level in `qbStarterPPG` (P12b)

Source: `future_plans/in-season-notes-plan.md` (parent folder) → *Sign-off 2026-10-04 14:20 local — P12a* and
data `grading/2026-10-04-qb-rookie-level-verdict.md` → *For P12b* item 1, option 1. Planned 2026-10-04 against
app `692df1e` (P11 verified, **unpushed**) and data `b7aa64f`. Session 1 (opus) wrote this; Session 2 (sonnet)
implements it exactly. **Parent-folder slice** (Anton's instruction): Session 2 writes both repos — app source,
app registry, and the data repo's registry span + `grading/anchor-policy.md`. Registry texts are in the
companion `.claude/tasks/rookie-qb-starter-level-registry.md`.

## 0. Goal and fixed decisions — do not reopen

**Problem.** A rookie QB's starter level (`factors.qbStarterPPG`) is the rookie-path level (`ceiledPPG`), which
was built for a rookie who starts and runs on KTC and college multipliers above 1 for top picks. Mendoza
(`13269`) sits at 23.2 league PPG (20.8 half-PPR) against a top-12 rookie history of 15.8 half-PPR. P12a
measured PPG in games rookie QBs actually started, by round-based draft group, 2013–2025, half-PPR, and the
group mean beat the shipped level out of sample (MAE 3.10 vs 3.74); a cap was NO-GAIN.

**Change.** For a rookie-path QB with `yearsExp === 0` and known draft capital, `qbStarterPPG` becomes the pinned
group value × `positionBasisScale.QB` (`rookieBasisScale`). Pinned at data `a443ea7`:

| group | rule (app draft match) | half-PPR | league (× 1.114 today) |
|---|---|---|---|
| `top12` | `nflDraftRound === 1 && nflDraftPick <= 12` | 15.801 | ≈ 17.60 |
| `r1` | `nflDraftRound === 1 && nflDraftPick >= 13` | 14.355 (thin, 9 rookies) | ≈ 15.99 |
| `day2` | `nflDraftRound` 2 or 3 | 13.303 | ≈ 14.82 |
| `day3+` | `nflDraftRound >= 4`, or `draftCapitalStatus === 'undrafted'` | 12.341 | ≈ 13.75 |

Decisions (Session 1, 2026-10-04):

- **D1 — what "projectedPPG unchanged" means (flag for Anton).** The rookie route's *unconditional* level is
  unchanged: every rookie-path row whose `qbTakeoverBasis` is not `'chain'` keeps `projectedPPG = ceiledPPG`
  byte-for-byte — that includes every row of `buildRookieDynastyPriors` (it passes no `qbTakeover`, so every
  QB there is `'not-evaluated'`), so the dynasty arm-B prior and the CR-25 2c k are untouched. A `'chain'` row's
  `projectedPPG` is by contract `qbStarterPPG × qbStartShare` (CR-01 Invariant, `docs/projection.md` Step 10,
  `weeklyOwnProjection.js` `qbStarterBase`, anchor-policy boundary 5), so it **follows** the new starter level:
  `projectedPPG = level × share`, `projectedTotalPts = level × share × games`. Keeping the old level there would
  break that identity for one row class and leave the preseason chain value inconsistent with the ROS the seam
  builds on `qbStarterPPG`. Option rejected: freeze chain `projectedPPG` on `ceiledPPG` (CR-01 amendment, a second
  definition of "starter level" on the same row). Anton can override; the override is a 3-line change in §2.3.
- **D2 — scope `yearsExp === 0` only.** The fit's "rookie" is `draftYear === S` (the rookie season). A
  `yearsExp` 1 QB on the rookie route, and a vet-path QB, keep their own level. `yearsExp` null → no group.
- **D3 — unknown capital keeps the current level** (verdict item 2): `draftCapitalStatus === 'unknown'`, or
  `'matched'` with a non-finite round, or round 1 with a non-finite pick → no group.
- **D4 — a new factors key `qbStarterBasis`, both paths.** `'rookie:top12' | 'rookie:r1' | 'rookie:day2' |
  'rookie:day3+'` when the group level applied; `'projection'` on every other QB row; `null` on non-QBs. Why:
  `grading/anchor-policy.md` requires row-level detection of a mechanism boundary ("never a date-to-version
  lookup"); without the key a captured rookie QB row cannot say which level its `qbStarterPPG` is. Factors
  contract 78/63 → **79/64**.
- **D5 — constants live in `seasonProjection.js`**, beside `ROOKIE_CEILING`, as exported
  `QB_ROOKIE_LEVEL_SOURCE` + `QB_ROOKIE_STARTER_PPG`, with a byte-copied provenance fixture and its own test.
  Not in `qbTakeoverConstants.js`: `inSeasonEvidenceViewOnly.test.js:117` pins that file's importers to
  `inSeasonScoring.js` and `qbTakeover.js`, and these are rookie-path constants (CR-15) whose provenance is CR-27.
- **D6 — one summary line, `chain` rows only.** `adjustmentSummary` explains `projectedPPG`; only a `chain` row's
  `projectedPPG` moves. Line: `` `Rookie QB starter level — ${label} history ${arrow}` `` with
  `label` = `{ top12: 'top-12 pick', r1: 'pick 13–32', day2: 'rounds 2–3', 'day3+': 'round 4+ or undrafted' }[group]`
  and `arrow` = `level < ceiledPPG ? '↓' : '↑'`. Pushed immediately before the existing `Backup QB — …` line.
- **D7 — `PRIOR_MODEL_FROM` → `'2026-10-06'`** (from `'2026-10-05'`): the first UTC capture date on the new model,
  assuming the app push lands on 2026-10-05 UTC at the latest. **Stop condition:** if the push happens on or after
  2026-10-06 UTC, set it (and `GOLDEN.recordedUnder`) to the push's UTC date + 1 in a commit before pushing.
  No 2026 effect beyond the record: every 2026 frozen prior is already refused since P6b (`model-changed`).
- **D8 — the seam is not changed.** `buildScoringPosteriors` already reads `qbStarterPPG` for start-state QBs
  (`kind` `'backup'`/`'starter'`), for `chain` rows on the non-start branch, and for every rookie QB's `next`
  prior. A rookie week-1 starter (`kind: 'original'`) keeps `projPrior` (= `projectedPPG`, the rookie-path level)
  as his ROS prior, as every original starter does — see §8. Only the stale comment at `inSeasonScoring.js:217`
  changes.
- **D9 — registry lands in this slice, both repos, same push** (parent folder), and folds in the two queued
  batches that edit the same entries: P12a's companion (D-61, data `.claude/tasks/qb-rookie-level-research-registry.md`)
  and P11's D-58 bullet (CR-26 + the CR-01 `trimFrozenSnapshot` parenthetical). The rest of D-58 stays queued.

## 1. Findings against live source (`692df1e`)

- `rookieProjection` (`src/utils/seasonProjection.js:321`): `applyRookieCeiling` → `ceiledPPG` (`:439-440`);
  `qbStarterPPG = isQB ? ceiledPPG : null` (`:449`); `projectedPPG = qbStartShare != null ? ceiledPPG * qbStartShare
  : ceiledPPG` (`:450`); `projectedTotalPts` on `chain` = `qbStarterPPG * qbStartShare * qbEntry.games` (`:461-463`);
  `Backup QB` summary line (`:492`); factors `qbStarterPPG` rounded 3 dp (`:546`). `basisScale` is the argument
  (`positionBasisScale?.[position] ?? 1`, `:634`), recorded as `rookieBasisScale` (`:542`).
- `draftCapitalStatus` (`:426`), `nflDraftRound`/`nflDraftPick` from `resolveNflDraftFactor` (`:167-196`). The
  app's pick is the nflverse **overall** pick (`lib/nflverse.mjs` `parseDraftCsv`, column `pick`); the fit's is
  within-round. They coincide in round 1, the only round whose pick is read. `R1_TIERS` cannot be used — `r1-mid`
  spans picks 9–15.
- Vet path: `qbStarterPPG = isQB ? blendedPPG : null` (`:956`), factors (`:1085`).
- Consumers of `qbStarterPPG`: `buildScoringPosteriors` (`inSeasonScoring.js:217-226`, starter prior; `:249-251` non-start
  branch for chain; `:268` `next` prior for QBs), `trimFrozenSnapshot` (`:120`), `weeklyOwnProjection.js:109-110`
  (chain base). `buildProspectLevel` and `dynastyScore.js` never read it. `qbQualityByTeam*` reads dynasty rows, not
  projections (`App.jsx:626-638`). So the dynasty score does not move.
- `buildRookieDynastyPriors` (`prospectPrior.js:9-17`) calls `computeNextSeasonProjection` without `qbTakeover` →
  every QB `'not-evaluated'` → `projectedPPG = ceiledPPG`, unchanged by this slice (D1).
- `priorModelFrom.test.js`'s GOLDEN records `projectedPPG`/`projectedGames` only; `rookieQB_backup`
  (round 5, share 0.232246, scale 1) moves 2.2 → **2.9** (= round1(12.341 × 0.232246)); every other entry is
  unchanged. `qbStarterPPG` is not guarded today although the frozen `starterPPG` pins it (CR-26) — §4.3 adds it.
- Data constants file at `a443ea7` = HEAD `b7aa64f` (no later change), 2443 bytes. Fixture rows re-derive every
  value: `round3(sumPts / games)` → 5514.6/349 = 15.801, 1162.72/81 = 14.355, 1649.62/124 = 13.303, 1678.32/136 = 12.341.

## 2. `src/utils/seasonProjection.js`

### 2.1 Constants — insert after `ROOKIE_CEILING` (after `:66`)

```js
// Rookie QB starter level (P12b). PPG in the games a rookie QB was his team's primary passer (P6a definition),
// 2013-2025, half-PPR, game-weighted, by round-based draft group — pinned from sleeper-dashboard-data @ a443ea7
// (P12a, grading/2026-10-04-qb-rookie-level-verdict.md). A selected subset for day-2/day-3 rookies: "PPG if he
// starts", the starter level the takeover chain multiplies — never a talent estimate, never projectedPPG.
// Never hand-edit: re-run `node bin/backtest.mjs --qb-rookie-level --write` and re-pin by byte copy (CR-27).
// qbRookieLevelConstants.test.js re-derives every value from the fixture. r1 is thin (9 rookies).
// PROVISIONAL(heuristic): half-PPR-calibrated · scaled at runtime by positionBasisScale · data-side custom-basis refit (D-45)
export const QB_ROOKIE_LEVEL_SOURCE = {
  file: 'sleeper-dashboard-data backtests/2026-10-04-qb-rookie-level-constants.json',
  commit: 'a443ea75fc15ca8786348795d5e8b20993c11fb6',
  generatedAt: '2026-10-04T11:59:17.593Z',
  fixture: 'src/__fixtures__/qb-rookie-level-constants-2026-10-04.json',
}
export const QB_ROOKIE_STARTER_PPG = { top12: 15.801, r1: 14.355, day2: 13.303, 'day3+': 12.341 }
```

### 2.2 Resolver — insert after `applyRookieCeiling` (after `:316`), with a header in the file's style

```js
// ---------------------------------------------------------------------------
// Rookie QB starter level (P12b)
//
// A yearsExp-0 QB with known draft capital takes the pinned group level as his
// starter level (qbStarterPPG). Groups are the fit's (round-based, D2 of P12a);
// the app's overall pick equals the within-round pick in round 1, the only round
// whose pick is read. Unknown capital, yearsExp != 0 or a non-QB → no group.
// ---------------------------------------------------------------------------
export function resolveRookieQbStarterLevel({ position, yearsExp, draftCapitalStatus, nflDraftRound, nflDraftPick, basisScale = 1 }) {
  let group = null
  if (position === 'QB' && yearsExp === 0) {
    if (draftCapitalStatus === 'undrafted') group = 'day3+'
    else if (draftCapitalStatus === 'matched' && Number.isInteger(nflDraftRound)) {
      if (nflDraftRound === 1) group = Number.isFinite(nflDraftPick) ? (nflDraftPick <= 12 ? 'top12' : 'r1') : null
      else if (nflDraftRound <= 3) group = 'day2'
      else group = 'day3+'
    }
  }
  return group == null
    ? { rookieQbGroup: null, rookieQbLevel: null }
    : { rookieQbGroup: group, rookieQbLevel: QB_ROOKIE_STARTER_PPG[group] * basisScale }
}
```

(`nflDraftRound` ≥ 2 reaching `<= 3` means 2 or 3; `resolveNflDraftFactor` only emits integer rounds ≥ 1 on a match.)

### 2.3 `rookieProjection` — replace `:449-450`

```js
  const { rookieQbGroup, rookieQbLevel } = resolveRookieQbStarterLevel({
    position, yearsExp, draftCapitalStatus, nflDraftRound, nflDraftPick, basisScale,
  })
  // P12b: the starter level is the pinned rookie group level when one applies; the unconditional rookie level
  // (every non-chain projectedPPG, incl. the dynasty prior's recomputation) stays ceiledPPG.
  const qbStarterPPG = !isQB ? null : (rookieQbLevel ?? ceiledPPG)
  const qbStarterBasis = !isQB ? null : rookieQbGroup != null ? `rookie:${rookieQbGroup}` : 'projection'
  const projectedPPG = qbStartShare != null ? qbStarterPPG * qbStartShare : ceiledPPG
```

Update the comment block above (`:441-442`) to say the share multiplies the starter level (`qbStarterPPG`).
`projectedTotalPts` (`:461-463`) is untouched — it already multiplies `qbStarterPPG`.

Summary (D6), immediately before the `Backup QB` push at `:492`:

```js
  if (qbTakeoverBasis === 'chain' && rookieQbGroup != null) {
    const label = { top12: 'top-12 pick', r1: 'pick 13–32', day2: 'rounds 2–3', 'day3+': 'round 4+ or undrafted' }[rookieQbGroup]
    adjustmentSummary.push(`Rookie QB starter level — ${label} history ${rookieQbLevel < ceiledPPG ? '↓' : '↑'}`)
  }
```

Factors: after `qbStarterPPG:` (`:546`) add `qbStarterBasis,` and extend the comment above the three P6b keys to
"P6b QB start share + P12b starter basis — both paths, every position (schema-consistent)".

### 2.4 Veteran path

After `:956` add `const qbStarterBasis = isQB ? 'projection' : null`; after `qbStarterPPG:` (`:1085`) add
`qbStarterBasis,`. Nothing else on the vet path changes.

## 3. Other source

- **`src/utils/inSeasonConstants.js`** — `PRIOR_MODEL_FROM = '2026-10-06'` (D7). Keep the comment's first sentence
  ("A freeze pins the projection MODEL…"); replace its second sentence ("First UTC capture date on the current
  projection model (P6b, …fitted against).", `:30-32`) with: "First UTC capture date on the current projection model (P12b, the rookie QB starter level — the
  day after the app push; before it P6b's QB start share, 2026-10-05, and before that 7b5b055, Step 4 up-side
  removal, 2026-09-12 22:27 UTC, the model these k were fitted against)." Keep the rest.
- **`src/utils/inSeasonScoring.js:217`** (comment only) — "Equals projPrior (to rounding) on every row the share
  never touched." → "Equals projPrior (to rounding) on every row the share never touched, except a `yearsExp` 0
  rookie QB with known draft capital, whose starter prior is the pinned rookie group level (P12b)."
- **`src/__fixtures__/qb-rookie-level-constants-2026-10-04.json`** (new) — byte copy, from the parent folder:
  `git -C sleeper-dashboard-data show a443ea7:backtests/2026-10-04-qb-rookie-level-constants.json > sleeper-dashboard/src/__fixtures__/qb-rookie-level-constants-2026-10-04.json`;
  confirm 2443 bytes and `cmp` against the data working-tree file.

## 4. Tests

Red-then-green: write §4.1–§4.4 first against unchanged source, run them, paste the failures (expected: the new
key absent, `qbStarterPPG` = ceiled level, GOLDEN `rookieQB_backup` 2.2), then apply §2–§3.

### 4.1 New `src/__tests__/qbRookieLevelConstants.test.js` (pattern: `qbTakeoverConstants.test.js:1-30`)

1. The fixture's `source` starts with `QB_ROOKIE_LEVEL_SOURCE.file`; `generatedAt` equal; `basis === 'half_ppr'`;
   `definitions.pickConvention` starts with `'within-round'`; `Object.keys(definitions.groups)` deep-equals
   `Object.keys(QB_ROOKIE_STARTER_PPG)` (order `top12, r1, day2, day3+`).
2. For each group, `QB_ROOKIE_STARTER_PPG[g] === fixture.starterPPG[g].value`.
3. Re-derivation: for each `fixture.fixture.rows` row `[group, players, games, sumPts]` (keys from
   `fixture.fixture.keys`), `Math.round(sumPts / games * 1000) / 1000 === QB_ROOKIE_STARTER_PPG[group]`, and
   `players`/`games` equal `starterPPG[group].players`/`.games`; exactly four rows.
4. `fixture.verification.rederiveFromFixture === 'exact'`.

### 4.2 `src/utils/seasonProjection.test.js`

**Key lists** at `:80` and `:117` — add `'qbStarterBasis'` beside the three P6b keys.

**Existing P6b rookie test** (`'rookie QB backup → the share is applied after the ceiling…'`, `:3144-3165`) — the
fixture is a round-5, `yearsExp` 0 matched QB, so the assertions that encoded "starter = ceiled level" change:
- replace `expect(round1(f.qbStarterPPG)).toBe(base.projectedPPG)` with
  `expect(f.qbStarterPPG).toBe(12.341)` and `expect(f.qbStarterBasis).toBe('rookie:day3+')`;
- keep `expect(r.projectedPPG).toBe(round1(f.qbStarterPPG * 0.232246))` and the total-points line (now 2.9 / 48.7 —
  also assert those two literals);
- add `expect(base.factors.qbStarterPPG).toBe(12.341)`, and that `base.projectedPPG` is the ceiled level:
  `expect(base.projectedPPG).toBe(round1(base.factors.rookieCeilingPPGPre))` (below the QB knee the ceiling is
  identity) — the unconditional level did not move;
- add `expect(r.adjustmentSummary).toContain('Rookie QB starter level — round 4+ or undrafted history ↑')` and
  `expect(base.adjustmentSummary.some(l => l.startsWith('Rookie QB starter level'))).toBe(false)`.
- Rename the test to `'rookie QB backup → the share multiplies the starter level; depthFactor stays 1.0; total = starter × share × games'`.

**Rookie WR test** (`:3175`): add `expect(r.factors.qbStarterBasis).toBeNull()`. **Vet tests**: in the
`'order 1 keeps ×1.05…'` test add `expect(r.factors.qbStarterBasis).toBe('projection')`; in the RB-order-2 test add
`expect(r.factors.qbStarterBasis).toBeNull()`.

**New `describe('rookie QB starter level (P12b)')`** after the P6b block. Import `resolveRookieQbStarterLevel`,
`QB_ROOKIE_STARTER_PPG`, `applyRookieCeiling`.
1. Resolver table (`basisScale` 1 unless stated) → `{ rookieQbGroup, rookieQbLevel }`:
   matched r1 pick 1 → top12 15.801; pick 12 → top12; pick 13 → r1 14.355; pick 32 → r1; round 1 pick null →
   null/null; round 2 → day2 13.303; round 3 → day2; round 4 → day3+ 12.341; round 7 → day3+; `'undrafted'` (no round)
   → day3+; `'unknown'` with round 1 pick 5 → null; `yearsExp` 1 → null; `yearsExp` null → null; position `'RB'` → null;
   matched round 1 pick 5 with `basisScale: 1.114` → level `15.801 * 1.114` (`toBeCloseTo(17.6023, 4)`).
2. Not-evaluated top-12 rookie QB (`makeRookie`, `player: { position: 'QB' }`, `nflDraftMatches: { [id]: { year: 2026,
   round: 1, pick: 3 } }`, `nflDraftYears: [2026]`, plus a KTC map — `const o = makeRookie(…).asOptions(); o.ktcMap = makeKtcMap(id, 'QB', 9999, o.playersMap)`
   (`factories.js:332`; it registers its pads in that `playersMap`) — the target sits at the 80th percentile of the five, `ktcMult` 1.18, so the pre-ceiling level (≈ 20.94; ceiled ≈ 19.99) clears the 17.80 knee): `qbTakeoverBasis 'not-evaluated'`, `qbStarterPPG 15.801`,
   `qbStarterBasis 'rookie:top12'`, `rookieCeilingBasis 'ceiling:QB'`, and `projectedPPG ===
   round1(applyRookieCeiling({ position: 'QB', projectedPPG: f.rookieCeilingPPGPre }).ceiledPPG)` — strictly
   greater than 15.801 (the unconditional level stays above the group level; the dynasty prior's row class).
   No `Rookie QB starter level` summary line.
3. The same player with a `chain` entry (`share: 0.1, games: 17`): `projectedPPG === round1(15.801 * 0.1)` (1.6),
   `projectedTotalPts === round1(15.801 * 0.1 * 17)` (26.9), summary contains `'Rookie QB starter level — top-12 pick history ↓'`.
4. `positionBasisScale: { QB: 1.114 }` through `computeNextSeasonProjection`'s argument (pass it in `asOptions()`'s
   result spread — the factory has no slot): `qbStarterPPG === round3(15.801 * 1.114)` (17.602),
   `rookieBasisScale === 1.114`.
5. Unknown capital (`makeRookie` QB, no `nflDraftMatches`, `nflDraftYears` null): `qbStarterBasis 'projection'`,
   `round1(qbStarterPPG) === projectedPPG`.
6. `yearsExp` 1 rookie-route QB (round 1 pick 3, `player: { position: 'QB', years_exp: 1 }`, `currentSeason` 2025,
   `nflDraftYears: [2025]`, draft match year 2025): `qbStarterBasis 'projection'`, `round1(qbStarterPPG) === projectedPPG`.
7. The dynasty prior is unmoved: `buildRookieDynastyPriors({ playerIds: [id], projectionArgs })` for case 2's inputs
   (without `ktcMap`/`collegeStats` — the function nulls them) returns the same number as
   `computeNextSeasonProjection({ ...args, ktcMap: null, collegeStats: null }).projectedPPG`, and that number is the
   ceiled level, not 15.801 (import from `./prospectPrior`).

### 4.3 `src/__tests__/priorModelFrom.test.js`

First, **on unchanged source**, extend the recorded outputs to `{ projectedPPG, projectedGames, qbStarterPPG }`
(`r.factors.qbStarterPPG`, `null` for non-QBs) and add one fixture `rookieQB_top12` (case 2 of §4.2's inputs; id
`P_PMF_ROO_QBT`). `fixtures()` holds factory objects and the loop calls `asOptions()` afresh, so build the KTC pads
into the factory: `const pads = {}; const ktcMap = makeKtcMap('P_PMF_ROO_QBT', 'QB', 9999, pads)` then
`makeRookie({ …, extraPlayers: pads, ktcMap })` (`factories.js:297`, `:306`) — pads outside the loop's `playersMap`
leave the percentile null and `ktcMult` 1.0 (pre-ceiling 17.745, below the knee). Assert in the test that this
fixture's `factors.rookieCeilingBasis === 'ceiling:QB'`. Record every value by running the test, and confirm the 9 existing projectedPPG/projectedGames
are unchanged — that recording is the pre-change characterisation; paste it into the hand-back. Then, after §2–§3:
re-record; **only** these may change, and only as stated — `rookieQB_day3.qbStarterPPG` → 12.341,
`rookieQB_backup.projectedPPG` 2.2 → 2.9 and `.qbStarterPPG` → 12.341, `rookieQB_top12.qbStarterPPG` → 15.801.
Any other movement is a stop condition. Set `recordedUnder: '2026-10-06'` and add one line to the comment above
GOLDEN: "Re-recorded 2026-10-0x for the rookie QB starter level (P12b): qbStarterPPG joins the record (the frozen
starterPPG pins it, CR-26); the rookie QB rows move, nothing else."

### 4.4 `src/__tests__/factorsSchema.test.js`

Add `'qbStarterBasis'` to both sets after `'qbStarterPPG'`; counts 78 → 79 and 63 → 64 everywhere in the file
(header `:18`, test names `:213`, `:225`; the comments at `:47` and `:81` also gain a term — "+ 3 P6b QB-start-share
 keys + 1 P12b `qbStarterBasis` = 79/64 total"). Add one test: on a vet QB, a vet RB, a rookie QB
(`yearsExp` 0, matched round 2) and a rookie WR, `qbStarterBasis` is `'projection'`, `null`, `'rookie:day2'`, `null`.

## 5. Docs (same commit as the code)

- **`CLAUDE.md`** — Invariants → *Factors contract*: "78 vet keys / 63 rookie keys" → "79 vet keys / 64 rookie keys".
- **`docs/projection.md`** — Step 10, second sentence: after "or after the realisation ceiling (rookie)" insert
  "— except a `yearsExp` 0 rookie QB with known draft capital, whose `qbStarterPPG` is the pinned rookie starter
  level (Rookie path → *Rookie QB starter level*)". New subsection after *Realisation ceiling*, `### Rookie QB
  starter level (P12b)`: the table of §0, "PPG if he starts" (selection: day-2/day-3 starters are a selected subset,
  so the value is a conditional level), applied to `qbStarterPPG` only — a `chain` row's `projectedPPG` and
  `projectedTotalPts` follow it, every other `projectedPPG` stays the ceiled level (the dynasty prior included);
  `qbStarterBasis` values; scaled by `positionBasisScale.QB`; unknown capital / `yearsExp` ≠ 0 keep the path level;
  provenance (data `a443ea7`, held-out MAE 3.10 vs 3.74, cap NO-GAIN); what it does not model (development within
  the season, offence, injuries). Under *Adjustment summary* add the new line and its gate.
- **`docs/projection.md:162`** — "For a QB the chain's start share (Step 10 above) is applied after the ceiling" →
  "For a QB the chain's start share (Step 10 above) is applied after the ceiling, to `qbStarterPPG` — the pinned
  rookie starter level when one applies (below)".
- **`docs/signal-registry.md:110`** (`positionBasisScale` row, *Current use*) — where it lists what the scale
  multiplies on the rookie path (`ROOKIE_BASELINE_PPG` and the `ROOKIE_CEILING` knee/asymptote), add
  "and `QB_ROOKIE_STARTER_PPG` (P12b)".
- **`docs/nav/utils.md:8`** — append "And `resolveRookieQbStarterLevel` + `QB_ROOKIE_STARTER_PPG` (P12b) — the pinned
  rookie QB starter level that replaces `qbStarterPPG` for a `yearsExp` 0 QB with known capital; see
  docs/projection.md → Rookie path → Rookie QB starter level".
- **`docs/navigation.md:57`** — add `qb-rookie-level-constants-2026-10-04.json` (rookie QB starter level —
  `qbRookieLevelConstants.test.js`) to the provenance-oracle list.
- **`docs/signal-registry.md`** — the QB start share row (`:95`): name `qbStarterBasis` in the signal cell and
  append to *Current use*: "; since P12b a `yearsExp` 0 rookie QB's `qbStarterPPG` is the pinned rookie starter
  level (`qbStarterBasis` `'rookie:<group>'`, CR-27)". Plus P12a's three appends from its companion (D-61), byte-exact.
- **`.claude/tasks/data-repo-backlog.md`** — §6 of the companion.

## 6. Touch list, commits, push

App: `src/utils/seasonProjection.js`, `src/utils/seasonProjection.test.js`, `src/utils/inSeasonConstants.js`,
`src/utils/inSeasonScoring.js` (comment only), `src/__tests__/qbRookieLevelConstants.test.js` (new),
`src/__tests__/priorModelFrom.test.js`, `src/__tests__/factorsSchema.test.js`,
`src/__fixtures__/qb-rookie-level-constants-2026-10-04.json` (new), `CLAUDE.md`, `docs/projection.md`,
`docs/nav/utils.md`, `docs/navigation.md`, `docs/signal-registry.md`, `docs/cross-repo-registry.md`,
`.claude/tasks/data-repo-backlog.md`, both task files. Data: `cross-repo-registry.md`, `grading/anchor-policy.md`.
**Not**: `src/App.jsx`, `src/utils/prospectPrior.js`, `src/utils/weeklyOwnProjection.js`, `src/utils/qbTakeover*.js`,
`src/utils/dynastyScore.js`, any data `lib/` or `scripts/` file.

Done-definition (CLAUDE.md): `npm test`, `npm run lint` (0), `npm run build` (only the pre-existing Vite chunk-size
notice). Data: `node --test`, `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`,
`node --test test/registry.test.mjs`. Report file/test counts.

Smoke (`.claude/launch.json` preview, Anton's league — `docs/architecture.md` → *Smoke-testing*): Mendoza's ROS
(Market In-season ROS cell and pop-up) ≈ 1.4 (was ≈ 1.9 at `692df1e` — record both); `13275` (LAR, r1) drops in
proportion (starter level ≈ 20.6 → ≈ 16.0); `/week` OURS for a backup QB still `—`; Mendoza's pop-up summary shows
`Rookie QB starter level — top-12 pick history ↓` above the `Backup QB` line; a veteran QB2's ROS unchanged. No new
console errors. A screenshot is not sign-off.

Commits (attribution trailer on each): app (1) code + tests + docs: `Rookie QB starter level: pinned P12a group
values replace qbStarterPPG for yearsExp-0 QBs; qbStarterBasis; PRIOR_MODEL_FROM 2026-10-06 (P12b)`; app (2) registry
span + backlog + task files; data (3) registry span byte copy + anchor-policy boundary 6. Push order: **P11
(`c804ada..692df1e`) must be signed off and pushed first, or ride the same push**; `git pull --rebase` in each repo,
push app, then data, same session (the CR-24 daily run reads both). After the push, data (4): fill boundary 6's
commit range and push time (companion §4.3), as `c2e3ce8` did for boundary 5. Check D7's date before pushing.

## Cross-repo impact

Full texts, old→new anchors and the Mirror quotes are in `.claude/tasks/rookie-qb-starter-level-registry.md`.
Touched contracts, each with its `Mirror` emitted there in full and answered:

- **CR-27** (QB takeover constants) — the rookie-level constants file joins it (P12a's drafted extension,
  finalised): app side, data side, triggers, invariant, mirror. Data action: none beyond the byte-sync; a re-fit
  re-pins by byte copy.
- **CR-15** (R3-FIT mirror) — a fourth rookie mechanism in `seasonProjection.js` and its place in the ordering.
  Data action: **mirror it into `lib/rookieMirror.mjs` as a new model** with the start share (appended to D-59) —
  not done here; nothing data-side fails meanwhile.
- **CR-01** (snapshot envelope) — additive `factors.qbStarterBasis`, no `schemaVersion` bump; rookie QB
  `qbStarterPPG` and `chain` `projectedPPG`/`projectedTotalPts` move at boundary 6. Data action: boundary 6 in
  `grading/anchor-policy.md` (this slice).
- **CR-26** (frozen read-back) — `qbStarterPPG` no longer equals `projectedPPG` on a non-chain rookie row with a
  group. Data action: none.
- **CR-25** (in-season k) — `PRIOR_MODEL_FROM` bumped; the 2c dynasty k untouched (arm-B prior unchanged, D1);
  rookie QB start-record and `next` priors move onto a level the QB k were not fitted on (joins D-59).
- **CR-18** (signal registry rows) — `docs/signal-registry.md` edited (app-side row; no ingest change). Data
  action: none.
- **Folded queued texts** (D9): P12a's companion (CR-01/08/09/14/15/16 data-side texts, CR-27 draft, three
  signal-registry appends — their Mirrors were emitted by P12a's Session 1) and P11's D-58 bullet (CR-26 + CR-01
  `trimFrozenSnapshot` parenthetical). Not touched: CR-24 (no file move, no drift-check wording).

Route: parent-folder session (Anton, 2026-10-04) — app span edited first, data span byte-copied in the same
session, both pushed together, so the CR-24 daily run never sees a mismatch.

## 7. Risks Session 2 should not "fix"

- A `'not-evaluated'` or `'incumbent'` rookie QB now carries `qbStarterPPG` ≠ `projectedPPG`. Intended (D1, D8).
- Day-2/day-3 rookies' starter level **rises** (12.3–13.3 half-PPR vs shipped ≈ 6–11): their ROS rises only in
  proportion to their small start share. Intended (verdict item 3).
- Do not apply the group level to `projectedPPG` of non-chain rows, to `buildRookieDynastyPriors`, or to the
  `kind: 'original'` ROS branch in the seam.
- Do not move the constants into `qbTakeoverConstants.js` (D5) or round the level before the share multiply
  (only the factors entry is rounded, 3 dp, as today).

## 8. Findings for Anton (reported, not acted on)

- **D1 is an interpretation** of "projectedPPG unchanged": backup rookie QBs' preseason `projectedPPG` (starter ×
  share) does move with the new starter level, because that is how the chain is defined everywhere. Their dynasty
  value does not.
- **A rookie who starts week 1** (`kind: 'original'`) keeps the old level for his ROS — the seam reads
  `projectedPPG` for original starters. In the 2026-10-03 snapshot (P12a Q4) every 2026 rookie QB sits at Sleeper
  depth order ≥ 3 except `13425` (TB, day3+, order 1) — Session 2's smoke records his live `kind` and ROS. Fixing it
  means either the seam reads `qbStarterPPG` for original rookies or the rookie `projectedPPG` changes — both
  P12c-sized.
- **P12c (deferred, as signed off):** Mendoza's dynasty value still rests on the rookie-path level.

## Review record — plan gate round 1 (2026-10-04)

`plan-reviewer` mandate run as a general-purpose opus agent (type not registered this session), read-only.
7 flags; each verified against live source by Session 1; Anton delegates the calls.

1. `[registry-stale]` CR-01 Triggers omit `buildScoringPosteriors`' reads of `factors.qbStarterPPG`/`qbTakeoverBasis`
   (`inSeasonScoring.js:224,230,249`); P10's queued `buildOwnProjections` text edits the same field. **Applied**:
   companion §3.1a, and P10's D-58 bullet folded in with P11's (§1.1, §6).
2. `[cross-repo]` CR-15 still says "three rookie mechanisms" in Invariant and Mirror. **Applied**: companion §3.2,
   three → four (one Invariant phrase, two Mirror phrases).
3. `[edge-case]` the `rookieQB_top12` GOLDEN fixture would lose its KTC pads (fresh `asOptions()` `playersMap`),
   so it would record a no-ceiling case. **Applied**: §4.3 builds the pads through `extraPlayers` + `ktcMap`
   and asserts the ceiling fires.
4. `[mechanical]` the pre-ceiling level is ≈ 20.94, not ≈ 23.1 (percentile 80 → `ktcMult` 1.18). **Applied** (§4.2).
5. `[mechanical]` the `PRIOR_MODEL_FROM` comment edit targeted the wrong sentence. **Applied** (§3: keep the
   design-rule sentence, replace the second).
6. `[mechanical]` anchors. **Applied**: `:321`, `:542`, factorsSchema's comment sums. **Rejected**: the
   companion's Mirror lines `:53/:276/:284` are correct; the cited `:54/:277/:285` are blank lines.
7. `[mechanical]` `docs/projection.md:162` and `docs/signal-registry.md:110` go stale. **Applied** (§5).

MIRROR block: all six entries match the live registry and are quoted. No `[registry-gap]`. Size: 28.7KB + 28.6KB
companion, each under 40KB.
