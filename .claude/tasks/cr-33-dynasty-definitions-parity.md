# CR-33 — parity for the dynasty definitions the app copies (B2, cohort age, age bands)

Cross-repo. Session 1: parent folder, opus, high. Session 2: **parent folder, sonnet, medium** — edits both repos,
runs git/npm from inside each repo directory, reads both repos' CLAUDE.md first.

Review depth: full — new CR-NN index entry (CR-33), a cross-repo copied definition, and an edit to the data repo's
S3b/S4a analysis scripts whose output must not move.

## Problem

Audit 2026-11-01, FLAG [cross-repo]. App commit `4333e39` (Model view: two-year-average rank and age caution) copied three
data-repo definitions from the S3/S4a verdicts with no index entry and no parity test:

| Definition | App copy | Data original(s) today |
|---|---|---|
| B2 two-year baseline: mean PPG of the seasons among {S−1, S} with `gamesPlayed >= 8` and finite `fantasyPoints`; null if none | `src/utils/twoYearBaseline.js` `twoYearAveragePPG` (S = `deriveDataSeason(careerStats)`) | `scripts/dynasty-history-run.mjs` `buildRows`, inline `ppgAt` / `q` → `row.B2[mode]` (~:452–461); **also** copied as `lib/dynastyRework.mjs` `level2Of` (:48) and inline again in `scripts/dynasty-rework-run.mjs` (~:201–209, runtime-checked `level2 !== B2` → throw) |
| Cohort age: whole years completed on `(S+1)-06-01` from birthdate (a birthday on June 1 counts as completed) | `cautionAge` (birthdate branch) | `scripts/dynasty-asof.mjs` `buildAsOfInputs`: `refDate = \`${S + 1}-06-01\`` (:194), `age: ageOn(entry?.birthdate, refDate)` (:245); `ageOn` wraps `lib/inSeasonEvidence.mjs` `ageOnDate` |
| Age bands: ≤ 24 and ≥ 31 (data also has 25–27, 28–30) | `AGE_CAUTION` (`under.maxAge: 24`, `over.minAge: 31`), `ageCaution` | `scripts/dynasty-history-run.mjs` `AGE_BANDS` (:61) + private `ageBand` (:488); **also** copied as `lib/dynastyRework.mjs` `ageBand` (:43, "Copy of … verbatim") and `scripts/dynasty-rework-run.mjs` `AGE_BANDS` (:58) |

S5 or a later refit can change the data side without the app noticing, and the data side already holds its own
untested copies.

## Outcome

1. The data repo has **one** definition site for each of the three, exported from `lib/dynastyBacktest.mjs` (the D-88
   shared lib — pure, no I/O, imports no `scripts/` file). S3b, S3a's as-of builder and S4a import it; S4a's lib copies
   become re-exports.
2. Index entry **CR-33** in `sleeper-dashboard/docs/cross-repo-registry.md`.
3. Each repo tests its own side against the **same literal fixture table** (CI checks out one repo; no file is read
   across repos). Each test names the other side's definition site.
4. A golden test (data) pins `buildRows` row values on the existing synthetic store, so the extraction is shown not to
   move S3b output; plus a one-off before/after full-run diff in the done-definition.

**No behaviour change anywhere.** The Model view shows exactly what it shows today; no app source logic changes;
nothing scoring-affecting; no verdict/panel regenerated; no data file or manifest touched.

## Out of scope

- The stale Sleeper `player.age` the dynasty score uses — data-backlog item "Age curves and age inputs read stale Sleeper
  ages". Do not touch `dynastyScore.js`, `ageCurve.js` or any age-curve input.
- **Deliberate, documented differences that the parity table must not cover** (record them in the app module header and
  the data lib JSDoc, one line each — do not "fix" them):
  - Birthdate source: app reads Sleeper `players[id].birth_date`; data reads `nflverse/playerids.json`
    `bySleeper[sid].birthdate`. CR-33 is about the formula, not the source.
  - Missing/unparsable birthdate: app falls back to Sleeper `age` (`source: 'sleeper'`); data yields `null` (row kept,
    counted `no-birthdate`, band `null`).
  - S: app derives S as `deriveDataSeason(careerStats)` (newest completed season key); data takes S as the cohort argument.
    The fixture makes the two agree by giving `careerStats` max key = S.
- `scripts/dynasty-rework-run.mjs`'s inline B2 (~:201–209): leave it. Its existing runtime check against `level2Of`
  now compares it with the shared definition, so it cannot drift silently.
- The `asOfDate: '(S+1)-06-01'` label in `runDynastyHistory`'s meta (:652) and the verdict prose: display strings, leave.
- `lib/inSeasonEvidence.mjs` `ageOnDate` stays where it is (also used by the in-season dynasty work with a `-09-01` date).

## Data repo changes (`sleeper-dashboard-data/`)

### D1 · `lib/dynastyBacktest.mjs` — new exports (append a section `// ─── S3 definitions the app copies (CR-33) ───`)

```js
import { ageOnDate } from './inSeasonEvidence.mjs';   // already imports clusteredBootstrap from there — extend that import

/** S3's age bands (§8): ≤ 24, 25–27, 28–30, ≥ 31. The app copies the outer two as AGE_CAUTION (CR-33). */
export const AGE_BANDS = ['le24', '25-27', '28-30', 'ge31'];

/** Age (whole years) → its S3 band label; null age → null. Moved verbatim from scripts/dynasty-history-run.mjs. */
export const ageBand = (a) => (a == null ? null : a <= 24 ? 'le24' : a <= 27 ? '25-27' : a <= 30 ? '28-30' : 'ge31');

/** The date S3 measures a cohort-S player's age on: June 1 of S+1, 'YYYY-MM-DD'. */
export const ageAsOfDate = (S) => `${S + 1}-06-01`;

/** Whole years completed on ageAsOfDate(S) from a 'YYYY-MM-DD…' birthdate; missing/unparsable → null (CR-33). */
export const cohortAge = (birthdate, S) => ageOnDate(birthdate, ageAsOfDate(S));

/**
 * B2 (S3 §4): mean PPG of the qualifying seasons (gamesPlayed ≥ 8, finite fantasyPoints) among {S−1, S}; null if
 * neither qualifies. Never pads, never 0. The app copies this as src/utils/twoYearBaseline.js `twoYearAveragePPG` (CR-33).
 */
export function twoYearAveragePPG(careerStats, pid, S) { /* body = lib/dynastyRework.mjs level2Of, verbatim */ }
```

Also add the two deliberate-difference lines (birthdate source; missing-birthdate → null vs the app's Sleeper fallback)
to the `cohortAge` JSDoc. Update the file header's first sentence to mention "and the S3 definitions the app copies
(CR-33)". Import-graph check: `lib/dynastyBacktest.mjs` already imports `./inSeasonEvidence.mjs`; it must still import
nothing from `lib/dynastyRework.mjs` or `scripts/`.

### D2 · `scripts/dynasty-history-run.mjs`

- Delete the local `export const AGE_BANDS = [...]` (:61) and the private `const ageBand = …` (:488).
- Add `import { AGE_BANDS, ageBand, twoYearAveragePPG } from '../lib/dynastyBacktest.mjs';` (merge into the existing
  `../lib/dynastyBacktest.mjs` import) and keep `AGE_BANDS` public: add it to the existing
  `export { MIN_ROWS, … } from '../lib/dynastyBacktest.mjs';` line.
- In `buildRows`, replace only the B2 computation:
  `const q = [pS1, pS].filter(x => x != null); row.B2[mode] = q.length ? … : null;`
  → `row.B2[mode] = twoYearAveragePPG(cs, pid, S);`
  Keep `ppgAt`, `pS`, `pS1` and `row.B1[mode] = pS ?? pS1;` unchanged (B1 is not copied by the app).
- Update the header "Public exports" block if it lists `AGE_BANDS` (it does not today — no change then).

### D3 · `scripts/dynasty-asof.mjs`

- `const refDate = \`${S + 1}-06-01\`;` → `const refDate = ageAsOfDate(S);` (refDate is still used in the
  deliberate-differences sentence at ~:328 — keep the variable).
- `age: ageOn(entry?.birthdate, refDate),` → `age: cohortAge(entry?.birthdate, S),`
- Import `ageAsOfDate, cohortAge` from `'../lib/dynastyBacktest.mjs'`. Keep the exported `ageOn` (tests and the header
  list it).

### D4 · `lib/dynastyRework.mjs` and `scripts/dynasty-rework-run.mjs` — collapse the copies

- `lib/dynastyRework.mjs` header (:5–6): after "…not a live coupling; K0 is guarded by T-PATHB." add: "Exception:
  `level2Of` (B2) and `ageBand` are re-exports of the live shared definitions in lib/dynastyBacktest.mjs (CR-33), not
  frozen copies — if S5 changes `twoYearAveragePPG`, an S4a re-run stops at `level2 !== B2` in
  scripts/dynasty-rework-run.mjs by design."
- `lib/dynastyRework.mjs`: delete the `ageBand` copy (:42–43) and the `level2Of` body (:47–56). Extend the existing
  `import { round6, meanOf } from './dynastyBacktest.mjs';` with `ageBand, twoYearAveragePPG`, then
  `export { ageBand };` and `export const level2Of = twoYearAveragePPG;` with the JSDoc "B2 under S4a's name — the shared
  definition (CR-33)". `level2Pool` keeps calling `level2Of`. Export names are unchanged, so `test/dynasty-rework.test.mjs`
  and `scripts/dynasty-rework-run.mjs` imports keep working.
- `scripts/dynasty-rework-run.mjs`: delete the local `export const AGE_BANDS = [...]` (:58); import `AGE_BANDS` from
  `'../lib/dynastyBacktest.mjs'` and re-export it (`export { AGE_BANDS };`). No other change to that file.

### D5 · Data tests

**D5a · new `test/dynasty-definitions.test.mjs`** — the data half of CR-33. Header comment: "Pins lib/dynastyBacktest.mjs
CR-33 definitions to the fixture table shared with the app's src/__tests__/twoYearBaselineParity.test.js. Change a row
only together with that file and the index entry." Imports only from `../lib/dynastyBacktest.mjs`,
`../lib/dynastyRework.mjs`, `../scripts/dynasty-history-run.mjs`, `../scripts/dynasty-rework-run.mjs`.

Fixture table (literal, identical rows in both repos; S = 2024, as-of date 2025-06-01):

`B2_CASES` — `careerStats` seasons 2022–2024, `{ gamesPlayed, fantasyPoints }`:

| id | 2022 | 2023 | 2024 | B2 |
|---|---|---|---|---|
| `both` | — | 16, 160 | 16, 192 | 11 |
| `eight-in-prior` | — | 8, 96 | 16, 160 | 11 |
| `seven-in-prior` | — | 7, 140 | 16, 160 | 10 |
| `seven-in-current` | — | 16, 160 | 7, 140 | 10 |
| `prior-missing` | — | — | 16, 192 | 12 |
| `current-missing` | — | 16, 192 | — | 12 |
| `neither` | — | 7, 70 | 7, 70 | null |
| `older-ignored` | 16, 320 | 16, 160 | 16, 160 | 10 |
| `nonfinite-prior` | — | 16, null | 16, 160 | 10 |

`AGE_CASES` — birthdate → age on 2025-06-01 → caution (`low` = ≤ 24, `high` = ≥ 31, `none`):

| birthdate | age | caution |
|---|---|---|
| `2001-06-01` | 24 | low |
| `2000-06-02` | 24 | low |
| `2000-06-01` | 25 | none |
| `2000-05-31` | 25 | none |
| `1994-06-02` | 30 | none |
| `1994-06-01` | 31 | high |

Data-side mapping of `caution`: `low` ⇔ `ageBand(age) === 'le24'`, `high` ⇔ `'ge31'`, `none` ⇔ neither.

Tests (each names its defect; each must be seen red with that defect reintroduced in the lib, then reverted):

1. `twoYearAveragePPG(cs, id, 2024)` equals the B2 column for every `B2_CASES` row (`assert.equal`; values are exact).
   Catches: `>= 8` → `> 8` (`eight-in-prior` → 10); `>= 8` → `>= 7` (`seven-in-*` → 15); window widened to S−2
   (`older-ignored` → 13.33…); missing-row → 0 padding (`prior-missing` → 6); `Number.isFinite` guard dropped
   (`nonfinite-prior` → 5: `null / 16` = 0 is pushed, then (0 + 10) / 2).
2. `ageAsOfDate(2024) === '2025-06-01'` and `cohortAge(birthdate, 2024)` equals the age column for every `AGE_CASES` row;
   `cohortAge(null, 2024) === null`. Catches: as-of year S instead of S+1 (all ages −1; defect put in
   `lib/dynastyBacktest.mjs` `ageAsOfDate`); June 1 birthday treated as not yet reached (`2001-06-01` → 23,
   `2000-06-01` → 24, `1994-06-01` → 30). That second defect lives in **`lib/inSeasonEvidence.mjs` `ageOnDate`**
   (`bd > rd` → `bd >= rd`, ~:712), not in lib/dynastyBacktest.mjs; when it is put back, expect the existing `ageOn`
   (`test/dynasty-asof.test.mjs`) and `ageOnDate` (`test/inseason-dyn.test.mjs`) tests to go red alongside — report all
   three.
3. For every `AGE_CASES` row, `ageBand(age)` maps to the caution column; plus `ageBand(25) === '25-27'`,
   `ageBand(28) === '28-30'`, `ageBand(null) === null`, `AGE_BANDS` deep-equals `['le24','25-27','28-30','ge31']`.
   Catches: `a <= 24` → `a < 24` (24 → `25-27`); `a <= 30` → `a <= 31` (31 → `28-30`).
4. Single-site identity (exported names only): `level2Of === twoYearAveragePPG` and `ageBand` (from
   `lib/dynastyRework.mjs`) `===` the lib's; `AGE_BANDS` exported by `scripts/dynasty-history-run.mjs` and by
   `scripts/dynasty-rework-run.mjs` are `===` the lib's array. Catches: an exported copy reintroduced in S4a's lib or
   either script's `AGE_BANDS` (shown red by temporarily restoring the old `level2Of` body in `lib/dynastyRework.mjs`).
   It does **not** see S3b's private `ageBand` or its inline B2 — test D5c covers those.

**D5c · extend `T-ONE-HOME` in `test/dynasty-rework.test.mjs`** (~:934, the existing source-text "no local copies"
guard) — catches a copy restored as source text where identity cannot see it:

- Add a `CR33_NAMES = ['AGE_BANDS', 'ageBand', 'twoYearAveragePPG', 'ageAsOfDate', 'cohortAge']` loop to the
  "no script or lib module defines a shared symbol of its own" test: `defines(src, n)` is false for each name in
  `scripts/dynasty-history-run.mjs`, `scripts/dynasty-rework-run.mjs` and `scripts/dynasty-asof.mjs` (read the third file
  the same way). For `lib/dynastyRework.mjs` assert `defines(lr, 'ageBand') === false` and
  `/function\s+level2Of\b/.test(lr) === false` — **not** `defines(lr, 'level2Of')`, which matches the new
  `export const level2Of = twoYearAveragePPG` re-export.
- Call-site checks for the two inline sites the `defines` regex cannot see: `scripts/dynasty-history-run.mjs` matches
  `/row\.B2\[mode\] = twoYearAveragePPG\(cs, pid, S\)/`, and `scripts/dynasty-asof.mjs` contains no
  `` `${S + 1}-06-01` `` template literal and matches `/cohortAge\(entry\?\.birthdate, S\)/`.
- Show red by: restoring `const ageBand = …` at column 0 in dynasty-history-run.mjs; restoring the inline `q` / `reduce`
  B2; restoring the `${S + 1}-06-01` literal in dynasty-asof.mjs. Each one separately, then revert.

**D5b · golden in `test/dynasty-history.test.mjs`** — the "S3b output unchanged" guard. In the existing
`describe('T-POP row set and the games modes', …)` (it already has `built = buildRows({ load: makeStore(), cohorts: [2019] })`),
add a test that also builds cohort 2021 and asserts, for `rows.map(r => [r.pid, r.S, r.age, r.B1.sleeper, r.B2.sleeper])`:

- cohort 2019 → `[['1', 2019, 28, 12, 12], ['2', 2019, 28, 10, 10], ['3', 2019, 28, 10, 10], ['4', 2019, 28, 16, 16]]`
- cohort 2021 → `[['1', 2021, 30, 10, 15], ['3', 2021, 30, 20, 20]]`

(Hand-derived from `makeStore`: birthdates `1992-05-01`; pid 1 = 192/16 in 2015–2019, 320/16 and 160/16 in 2020–2021;
pid 2 = 120/12; pid 3 = 160/16 to 2019, 320/16 after; pid 4 = 256/16; scoring `{ rec: 1 }` with `stats.rec = fp`.)
**Write and run this test first, against the unmodified code.** If any literal differs, stop and report — do not adjust
it. Then it must stay green through D1–D4. Catches: B2 wired to something other than the shared definition with
different semantics; refDate moved off S+1 (ages 27 / 29). Show red with `ageAsOfDate` temporarily returning
`` `${S}-06-01` ``, and with the lib's `>= 8` changed to `>= 13` (pid 2 → B2 null).

D5b is a readable subset of the **existing pinned-hash goldens**, which stay the primary output guard:
`T-GOLD-S3` (a)/(b) in `test/dynasty-history.test.mjs` (~:740–752; (b) = sha of `buildRows` over cohorts [2019, 2021])
and `T-GOLD-S4` (a)/(b) in `test/dynasty-rework.test.mjs` (~:895–900; (b) = sha of `buildReworkRows` over
[2015, 2018]). **These four must stay green with their pinned hashes unedited.** If any goes red, stop and report — never
re-pin a hash in this slice; a moved hash is exactly the drift this slice exists to catch. T-GOLD-S4 is the S4a
output guard for D4.

## App repo changes (`sleeper-dashboard/`)

### A1 · `src/__tests__/twoYearBaselineParity.test.js` (new) — the app half of CR-33

Header comment: "Pins src/utils/twoYearBaseline.js to the CR-33 fixture table shared with the data repo's
test/dynasty-definitions.test.mjs (originals: data lib/dynastyBacktest.mjs `twoYearAveragePPG`, `cohortAge`, `ageBand`).
Change a row only together with that file and the index entry." Same `B2_CASES` and `AGE_CASES` literals as D5a.

1. Build one `careerStats = { 2022: {...}, 2023: {...}, 2024: {...} }` from `B2_CASES` (each case id is a player id;
   always include the 2024 key, so `deriveDataSeason` = 2024). `twoYearAveragePPG(careerStats, id)` equals B2 for every
   row — `toBe` for the null row, `toBeCloseTo(x, 10)` otherwise. Catches: `>= 8` → `> 8`; window widened; zero-padding;
   finite guard dropped (`nonfinite-prior` → 5).
2. For every `AGE_CASES` row, `cautionAge({ birth_date }, careerStats)` deep-equals `{ age, source: 'birthdate' }`.
   Catches: `refYear = dataSeason` instead of `+ 1`; `d > 1` → `d >= 1` (June 1 birthday not counted).
3. For every `AGE_CASES` row, `ageCaution(vet, { birth_date }, careerStats)` is `'under'` for low, `'over'` for high,
   `null` for none, with `vet = { dynastyScore: { confidence: 'moderate', components: {} } }`; and
   `AGE_CAUTION.under.maxAge === 24`, `AGE_CAUTION.over.minAge === 31`. Catches: `over.minAge` 31 → 30, `under.maxAge`
   24 → 25, or `>=`/`<=` flipped to strict.

Each shown red with its defect temporarily put into `src/utils/twoYearBaseline.js`, then reverted.

### A2 · `src/utils/twoYearBaseline.js` — comments only

Add to the header block: `// Copies data lib/dynastyBacktest.mjs twoYearAveragePPG / cohortAge / ageBand (CR-33);
twoYearBaselineParity.test.js pins both to one fixture table.` and the two deliberate-difference lines (birthdate source;
Sleeper-age fallback where data yields null). No code change.

### A3 · `docs/cross-repo-registry.md` — CR-33, and the size cap

Append (exact text; the registry test parses this grammar):

```
#### CR-33 · Two-year baseline and age caution
- **Invariant:** B2 = mean PPG of the seasons in {S−1, S} with ≥ 8 games and finite points, else null; age = whole years on `(S+1)-06-01` from birthdate; caution bands ≤ 24 and ≥ 31. Both sides pin one fixture table.
- **App:** `src/utils/twoYearBaseline.js` (`twoYearAveragePPG`, `cautionAge`, `ageCaution`, `AGE_CAUTION`)
- **Data:** `lib/dynastyBacktest.mjs` (`twoYearAveragePPG`, `ageAsOfDate`, `cohortAge`, `ageBand`, `AGE_BANDS`); `scripts/dynasty-history-run.mjs` (`twoYearAveragePPG`, `ageBand`); `scripts/dynasty-asof.mjs` (`cohortAge`)
- **Tests:** `src/__tests__/twoYearBaselineParity.test.js`; `test/dynasty-definitions.test.mjs`; `test/dynasty-rework.test.mjs`
```

The index is 11,966 bytes against its 12,000-byte cap (`src/__tests__/crossRepoIndex.test.js` `CAP_BYTES`).
**Decided (Anton, 2026-11-02): raise `CAP_BYTES` to 13,000 and make the two redundant-clause cuts.**

- Cuts: CR-30's parenthetical " (raw is the family-file fallback, and after one jsDelivr failure it serves the rest of
  that session)" (restates CR-29's transport rule) and CR-31's last sentence " The app joins KTC (name alias), draft and
  college on them." (describes use, not the contract).
- `src/__tests__/crossRepoIndex.test.js`: `CAP_BYTES = 13000`; update the cap in the `it('stays at or under its
  12,000-byte cap', …)` title and the header comment ("under its 12,000-byte cap") to 13,000. The failure message reads
  `CAP_BYTES` and needs no edit.
- Measured by Session 1 against the live index: the CR-33 block above, with its blank-line separator, is ~730 bytes;
  after the cuts the index is ~12,535 bytes — ~465 under 13,000. Session 2 reports the measured `wc -c` in the
  hand-back.

### A4 · `docs/nav/utils.md`

`twoYearBaseline.js` row: append "Copies data definitions — CR-33, `twoYearBaselineParity.test.js`."

## Docs (data repo)

- `CLAUDE.md` nav row for `lib/backtest.mjs`: change "`lib/dynastyBacktest.mjs` the dynasty backtests' shared statistics
  (S3b/S4a/S5)" to "… shared statistics (S3b/S4a/S5) and the S3 definitions the app copies (CR-33)". The file is
  21,004 / 25,000 bytes.
- `README.md` → `#### lib/dynastyBacktest.mjs` (~:1473): one sentence listing `AGE_BANDS`, `ageBand`, `ageAsOfDate`,
  `cohortAge`, `twoYearAveragePPG` as the CR-33 definition site, imported by `dynasty-history-run.mjs`,
  `dynasty-asof.mjs` and `lib/dynastyRework.mjs` (whose `level2Of`/`ageBand` are now re-exports).
- `README.md` → `#### scripts/dynasty-history-run.mjs` (~:1484–1494): (i) "(`scripts/dynasty-asof.mjs`,
  `lib/dynastyMirror.mjs`; neither is changed)" is no longer true after D3 — reword to "(…; S3b does not change their
  scoring — `dynasty-asof.mjs` reads its as-of date and cohort age from lib/dynastyBacktest.mjs, CR-33)"; (ii) the
  re-export list "`MIN_ROWS`, `hitRate`, `cohortStats`, `percentileBias`" gains `AGE_BANDS`.
- `README.md` → `#### lib/dynastyRework.mjs and scripts/dynasty-rework-run.mjs` (~:1496): one sentence matching the D4
  header note — `level2Of` and `ageBand` follow the live shared definitions (CR-33), so a later change to
  `twoYearAveragePPG` makes an S4a re-run stop at `level2 !== B2` by design.

## Copies this slice creates

None new. It **removes** two intra-data copies (`lib/dynastyRework.mjs` `ageBand`, `level2Of` body; and the two
`AGE_BANDS` arrays) and covers the existing app→data copy (`twoYearAveragePPG`, `cautionAge`'s birthdate branch,
`AGE_CAUTION`) with the CR-33 index entry plus one test per side. `scripts/dynasty-rework-run.mjs`'s inline B2 remains a
copy, guarded at run time against `level2Of` (see Out of scope).

## Done-definition

Order: data repo first, then app, then the cross-checks.

1. **Before any source edit**, in `sleeper-dashboard-data/` on a clean tree, capture the full S3b run (~30 min; run it in
   the background): `node bin/backtest.mjs --dynasty-history --json > <scratch>/s3b-before.json`. Do not `git pull` in
   between before and after.
   In the same step, capture the real-data **rows** (`--json` prints only `{ meta, metrics, summary }`, never the rows
   that carry `B2` and `age`): a scratch script outside the repo that imports `buildRows`, `DYNASTY_HISTORY_LOAD` and
   `COHORTS` from `scripts/dynasty-history-run.mjs` by absolute path and writes the sha-256 of
   `JSON.stringify(buildRows({ load: DYNASTY_HISTORY_LOAD, cohorts: COHORTS }).rows)` to `<scratch>/s3b-rows-before.sha`.
2. D5b golden written and green on unmodified code (see D5b). Then D1–D4, D5a, D5c.
3. Data: `npm test` and `npm run smoke` green; each new or changed test shown red with its named defect, then reverted.
   `T-GOLD-S3` (a)/(b) and `T-GOLD-S4` (a)/(b) green with their pinned hashes **unedited** (`git diff` shows no change to
   those lines) — they are the S3b and S4a output guards.
4. After: `node bin/backtest.mjs --dynasty-history --json > <scratch>/s3b-after.json`; compare with
   `jq -S 'del(.meta.generatedAt, .meta.dataRev)'` on both — **must be identical** (those two are the only
   nondeterministic fields: `goldenSourceRev` reads a committed fixture, the bootstrap is seeded, logs go to stderr).
   Re-run the rows script to `<scratch>/s3b-rows-after.sha` — **must match** `s3b-rows-before.sha`. Report both `cmp`
   results. Any difference: stop and report; do not commit. S4a has no real-data rerun here (T-GOLD-S4 covers it on
   the synthetic store; Anton ruled no S4a rerun under D-88).
5. App: A1–A4. `npm test`, `npm run lint` (0 problems), `npm run build` (clean). `crossRepoIndex.test.js` green (ids
   contiguous to CR-33, cap, App sites resolve). Each A1 test shown red with its defect, then reverted.
6. Data `test/registry.test.mjs` green with the sibling present (it reads the app's index — confirms CR-33's Data sites
   resolve).
7. No user-visible change, so no app smoke: state that in the hand-back. No `.claude/launch.json` preview needed.
8. `git status` in each repo shows only the files listed below. No data file, manifest, panel or verdict changed.
9. Commit each repo separately (data first). Do **not** push — push happens after verification, per each repo's
   CLAUDE.md, with `git pull --rebase` first.
10. Hand-back: both SHAs, every file touched, every deviation, the before/after `cmp` result, and for each new test what
    it asserts, the defect it catches, and confirmation it was seen red with that defect.

## Touch list

Data: `lib/dynastyBacktest.mjs`, `lib/dynastyRework.mjs`, `scripts/dynasty-history-run.mjs`, `scripts/dynasty-asof.mjs`,
`scripts/dynasty-rework-run.mjs`, `test/dynasty-definitions.test.mjs` (new), `test/dynasty-history.test.mjs` (D5b
only — T-GOLD lines untouched), `test/dynasty-rework.test.mjs` (D5c, T-ONE-HOME only — T-GOLD lines untouched),
`CLAUDE.md`, `README.md`.

App: `src/__tests__/twoYearBaselineParity.test.js` (new), `src/utils/twoYearBaseline.js` (comments only),
`docs/cross-repo-registry.md`, `src/__tests__/crossRepoIndex.test.js` (cap → 13,000), `docs/nav/utils.md`,
this task file (hand-back / fix-pass sections only).

## Plan review (full, opus) — 2026-11-02

Ten flags (2 medium, 8 low), all accepted by Anton and folded in above: T-GOLD-S3/S4 named as unedited output guards;
D5a test 4 narrowed + D5c source-text guard for S3b's private/inline sites; real-data row hash added to the before/after
diff; S4a covered by T-GOLD-S4; `nonfinite-prior` defect value corrected to 5; June-1 defect located in
`lib/inSeasonEvidence.mjs` `ageOnDate`; README :1484/:1494 lines added; dynastyRework header + README :1496 note the
live re-exports; byte figures re-measured with cap 13,000; CR-33 sites gain `ageCaution`, `ageAsOfDate`, `AGE_BANDS`.

## Verification (implementation-reviewer, full, opus) — 2026-11-02

Reviewed data 68554de (parent b7370a5) and app a152f09 (parent e939bea). No blocking flags; three low:
(1) the D5c `CR33_NAMES` assertions landed as a separate test in `T-ONE-HOME` rather than inside the existing one — same
assertions, each D5c defect seen red; no change. (2) Plan error: "Out of scope" lists three deliberate differences but D1/A2
said "the two", so the S-choice difference is recorded on neither side — fixed by Fix pass 1. (3) The task file was
committed whole (it was untracked) — correct, it is the record; no change. Reviewer independently confirmed the real-data
rows hash (4829 rows, `b1b4b02d…`) and the normalised before/after `--json` sha; T-GOLD-S3/S4 untouched.

## Fix pass 1

Comments only, one sentence per repo. Review depth for the re-run: light (no `full` trigger — no code, test, contract or
index change).

**Data — `sleeper-dashboard-data/lib/dynastyBacktest.mjs`**, directly below the section rule
`// ─── S3 definitions the app copies (CR-33) ───…` (:193), add one comment line:

```js
// S is the cohort argument here; the app derives S as `deriveDataSeason(careerStats)` (its newest completed season) — a deliberate difference, not in the parity table.
```

**App — `sleeper-dashboard/src/utils/twoYearBaseline.js`**, in the header's "Deliberate differences, not in the table:"
list, after the line ending `// a missing/unparsable birthdate falls back to Sleeper \`age\` here (data yields null).`,
add one line:

```js
// S is `deriveDataSeason(careerStats)` here (data: S is the cohort argument to each function).
```

Leave alone: every other line in both files, all tests, docs, the registry, and the task file outside this section.
Done when: data `npm test` green; app `npm test` green and `npm run lint` 0 problems (comment-only; no build needed beyond
lint). Commit each repo separately (`docs: CR-33 fix pass 1 — record the S-choice difference`), data first; do not push.
Report both SHAs and the two-line diff.
