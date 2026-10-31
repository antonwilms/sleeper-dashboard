# Dynasty fallback · two-year-average rank and age caution (display-only)

**Status:** plan, Revision 2 (Session 1, parent folder, 2026-10-31) — approved by Anton. Follows S4a's `S4A-NO-WIN` (data `grading/2026-10-30-dynasty-rework-verdict.md`); Anton's brief of 2026-10-30; light-review flags folded (§12); My Team decided (§11).
**Review depth: light** — Anton's decision: view-only, no score, label, snapshot or projection change. (No `full` trigger: nothing reaches `projectedPPG`, the dynasty score, `factors`, snapshots or a cross-repo contract.)
**Session 2:** **sonnet**, effort **medium**. Run it **inside `sleeper-dashboard/`** (app-only slice).
**Anchors:** app `main` @ `2af88f2`; data store unchanged.
**Date:** live (pushed and seen in the app) by **Fri 2026-11-13**; league trade deadline Thu 2026-11-19.

---

## 0. What this is, for Anton

S3 and S4a showed the dynasty score ranks veterans no better than their plain two-year scoring average, and leans: it rates 31+ too high and 24-and-under too low. Instead of reworking the score before the deadline, this shows the two-year-average rank beside the score, so you can see where the two disagree. It also marks the two age groups the score historically misjudges. The score, its labels, projections and snapshots do not change.

---

## 1. Scope

**In:** a pure view-only module (`src/utils/twoYearBaseline.js`); a small render piece (`src/components/dp/TwoYearRank.jsx`); wiring into Market (Value column set), the player-detail pop-up (dynasty tile), and My Team (§11); a view-only guard test; tests; docs.

**Out:** any change to `computeDynastyScore`, `pickDynastyLabel`, `seasonProjection.js`, `projectionSnapshot.js`, `inSeasonScoring.js`, `App.jsx`'s pipeline memos, `PRIOR_MODEL_FROM`, the factors contract, snapshots, or the data repo. No new domain state in `App.jsx` (every derivation runs in the view from props/context it already has).

---

## 2. Touch list

| File | What |
|---|---|
| `src/utils/twoYearBaseline.js` **(new)** | §3 — pure, view-only |
| `src/utils/twoYearBaseline.test.js` **(new)** | §7 |
| `src/components/dp/TwoYearRank.jsx` **(new)** + `TwoYearRank.test.jsx` **(new)** | §4 — `TwoYearRankCell`, `AgeCautionMarker` |
| `src/components/dp/cells.jsx` | §5.0 — `PlayerCell` (`:26-38`) gains an optional `marker` prop (a node rendered after the name); absent → render byte-identical to today |
| `src/components/market/Market.jsx` | §5.1 — Value set: rank sub-line in the Dynasty score cell, marker by the name |
| `src/components/dp/PlayerDetailModal.jsx` | §5.2 — dynasty tile note line + marker |
| `src/components/portfolio/Portfolio.jsx` | §5.3 — per §11 |
| `src/__tests__/twoYearBaselineViewOnly.test.js` **(new)** | §6 |
| existing tests of the three surfaces | updated only where markup assertions need the new cell (§7) |
| `docs/nav/utils.md`, `docs/nav/components.md`, `docs/signal-registry.md` | §8 |

Nothing else.

---

## 3. `src/utils/twoYearBaseline.js` (pure; no imports from any projection/scoring module except as listed)

Header comment: "View-only. S3/S4a baseline B2 (data `grading/2026-10-30-dynasty-history-verdict.md` §4; `grading/2026-10-30-dynasty-rework-verdict.md`). Never feeds projection, the dynasty score, labels, factors or snapshots — `twoYearBaselineViewOnly.test.js`."

- `export const VETERAN_CONFIDENCE = new Set(['low', 'moderate', 'high'])` — the dynasty score's Path B/C confidences (`dynastyScore.js:998-1007`); S3's veteran population.
- `export function isVeteranRow(row)` → `VETERAN_CONFIDENCE.has(row?.dynastyScore?.confidence) && row?.dynastyScore?.components != null`. This is S3's population with no extra filter: `computeDynastyScore` sends every `years_exp ≤ 1` player down Path A (`confidence: 'prospect'`), so a Path B/C confidence already implies `years_exp ≥ 2`; the in-season `inSeasonLevel`/`prospectLevel` inputs change a row's level, not its path.
- Assumption (state it in the header comment): `careerStats` holds completed seasons only — the live season arrives separately as `currentSeasonTotals` (`App.jsx:241`), which is what makes `deriveDataSeason` the last completed season. This module never reads `currentSeasonTotals`.
- `export function twoYearAveragePPG(careerStats, playerId)` — B2 exactly: `dataSeason = deriveDataSeason(careerStats)` (`src/utils/environment.js:223`, the last completed season; `careerStats` holds completed seasons only). For y ∈ {dataSeason − 1, dataSeason}, a season *qualifies* when `d = careerStats[y]?.[playerId]` exists, `d.gamesPlayed >= 8` and `Number.isFinite(d.fantasyPoints)`; PPG = `d.fantasyPoints / d.gamesPlayed` (league basis — `fantasyPoints` comes from `rescoreSeasonTotals`). Returns the mean PPG of the qualifying seasons, or `null` when neither qualifies. Never pads, never substitutes 0.
- `export function buildTwoYearRanks(playerRows, careerStats, playersMap)` → `Map<playerId, { rank, poolSize, ppg }>`. Pool per position (`playersMap[id].position`, as `seasonRanks.js` uses): every row with `isVeteranRow(row)` and a non-null `twoYearAveragePPG`. Sort by ppg descending, then `player_id` ascending; rank = 1 + number of pool members with strictly higher ppg (ties share a rank). Rows outside the pool are absent from the map.
- `export const AGE_CAUTION = { over: { minAge: 31, text: 'The score has historically rated this age group too high.' }, under: { maxAge: 24, text: 'The score has historically rated this age group too low.' } }`.
- `export function cautionAge(player, careerStats)` — S3's age: whole years on `${dataSeason + 1}-06-01` from `player.birth_date` (`YYYY-MM-DD`; the S3 `ageOnDate` rule, data `lib/inSeasonEvidence.mjs:705`: year difference, minus 1 if the birthday falls after that date). If `birth_date` is missing or unparsable, fall back to `player.age` (Sleeper's), and return `{ age, source: 'sleeper' }`; else `{ age, source: 'birthdate' }`; `null` when neither. `playerMap` is the raw Sleeper `/players/nfl` response (`src/api/sleeper.js:43-46`), which carries `birth_date` (Session 1 checked the data repo's committed copy of that response, `raw/-players-nfl.json`: 810 of 975 rostered QB/RB/WR/TE carry it). Session 2 confirms the field on one real `playerMap` entry during the smoke run and reports the share of veterans falling back to `source: 'sleeper'`.
- `export function ageCaution(row, player, careerStats)` → `'over' | 'under' | null`: `null` unless `isVeteranRow(row)`; else `'over'` when age ≥ 31, `'under'` when age ≤ 24.
- Mark the derivation: `// PROVISIONAL(heuristic): two-year-average rank and age-band caution · stand-in for a forward-looking dynasty score (S5, off-season) · S3/S4a: the score does not beat the two-year average and leans toward veterans; a score that passes S4a's test replaces this`.

---

## 4. `src/components/dp/TwoYearRank.jsx`

Both components use the existing `DefinitionPopover` (`src/components/dp/DefinitionPopover.jsx:7`; props `{ term, scope, gloss, … , children }`; it opens on **click**). Each wraps its trigger in a `<span onClick={e => e.stopPropagation()}>` so a click on it inside Market's clickable row or a Portfolio row does not also open the player pop-up (test it).
- `TwoYearRankCell({ entry, position })` — `entry` from `buildTwoYearRanks`. Renders `2-yr avg {position}{rank}` (e.g. `2-yr avg WR14`) in `text-[11px] text-dp-muted font-dp-mono` as the popover's `children`, with `term="2-yr avg rank"` and `gloss` = "Rank among veterans at this position by points per game, averaged over the last two completed seasons with 8+ games (league scoring). In the dynasty history tests (S3/S4a, seasons 2015–2022) the dynasty score did not beat this ranking." `entry == null` → `—`, same `term`, `gloss` = "Not ranked: needs a veteran dynasty score and at least one 8-game season in the last two completed seasons." Never a fabricated rank.
- `AgeCautionMarker({ kind, ageSource })` — `kind` `'over' | 'under' | null`; `null` renders nothing. Otherwise a small inline marker: `▲ age` for `over`, `▼ age` for `under`, in `text-dp-down-text` (the amber caution token, `src/index.css:221-228`, documented as the caution pair at `docs/ui.md:511`), `aria-label` = `AGE_CAUTION[kind].text`, `term="Age caution"`, `gloss` = `AGE_CAUTION[kind].text` + " Heuristic, from the dynasty history test (S3, seasons 2015–2022): 31+ over-rated and 24-and-under under-rated at every position." + (when `ageSource === 'sleeper'`) " Age from Sleeper (no birthdate on file)." The render site carries the §3 `PROVISIONAL(heuristic)` line.

---

## 5. Wiring (view memos only; no new App state)

### 5.0 The name cell
`PlayerCell` (`src/components/dp/cells.jsx:26-38`) is shared by every column set and table. Add one optional prop `marker` (a React node) rendered inline after the name; when absent the markup is unchanged. Only Market's Value set (§5.1) and Portfolio (§5.3) pass it; every other call site is untouched.

### 5.1 Market — Value column set
In `Market.jsx`, the `valueRows` memo (`:552-571`): compute `const twoYear = buildTwoYearRanks(playerRows, careerStats, playerMap)` once in its own `useMemo` (guarded to `columnSet === 'value'`, like `seasonRanksData`), and add to each row `twoYearRank: twoYear.get(r.player_id) ?? null`, `ageCaution: ageCaution(r, playerMap?.[r.player_id], careerStats)`. The Dynasty score cell (`:843-852`) is a single-row flex (score, bar, label) at `w-[230px]`: wrap that row in a column container and add `TwoYearRankCell` as a second line under it (only when `row.dynastyScoreValue != null`); the first row's markup is unchanged. Pass `AgeCautionMarker` as `PlayerCell`'s `marker` in the Value set's name cell. Update `Market.test.jsx` assertions on that cell only if the wrapper breaks them. No new sortable column, no change to sort keys or `MARKET_SORTS`.

### 5.2 Player-detail pop-up
In `PlayerDetailModal.jsx`, from `ProfileDataContext` (`careerStats`, `playersMap`, `playerRows` — already read at `:81`): `useMemo` the same `buildTwoYearRanks` and pick this player's entry and `ageCaution`. In the `dynasty` tile (`:329-338`), keep the seasons-of-data text and make `note` a node (the tile renders `note` at `:467` and accepts a node): the existing text, then `TwoYearRankCell` on its own line; put `AgeCautionMarker` next to the tile's label. Only when `dynastyScore` is truthy (the existing early return at `:293` already guards this).

### 5.3 My Team (Portfolio) — decided (Anton, 2026-10-31)
In the Starting ten table and the Bench table, a `2-YR RANK` column (header text exactly `2-YR RANK`, `TH_CLASS`) immediately after `KTC` (`:997`, `:1183`) rendering `TwoYearRankCell` per row, and `AgeCautionMarker` passed as `PlayerCell`'s `marker` (§5.0). `buildTwoYearRanks` runs once in a `useMemo` over the `playerRows`, `careerStats`, `playerMap` props Portfolio already receives — the pool is league-wide, never the user's roster alone. Not sortable. Rows with no player (empty slots, picks) render nothing in the new cell.

---

## 6. View-only guard — `src/__tests__/twoYearBaselineViewOnly.test.js`

Copy `outlookPositionStatsViewOnly.test.js`'s `PIPELINE` list verbatim and add `src/utils/projectionSnapshot.js`, `src/utils/inSeasonScoring.js`, `src/utils/dynastySignalBadges.js`, `src/App.jsx`. For each file assert it does not match `/from\s+['"][^'"]*twoYearBaseline['"]/` and `/from\s+['"][^'"]*TwoYearRank['"]/`. Also assert `twoYearBaseline.js` imports only from `./environment` (for `deriveDataSeason`), and `TwoYearRank.jsx` imports only from `./DefinitionPopover`, `../../utils/twoYearBaseline` and `react`.

---

## 7. Tests

- `twoYearBaseline.test.js` (hand-built `careerStats`, literals):
  - `twoYearAveragePPG`: both seasons qualify → mean; only dataSeason qualifies; only dataSeason−1; a 7-game season does not qualify; neither → `null`; a season older than dataSeason−1 is ignored; `gamesPlayed` 0 never divides.
  - `buildTwoYearRanks`: pool excludes prospects (`confidence: 'prospect'`), `'none'`, and veterans with `null` B2; per-position pools; ties share a rank; `poolSize` correct; ordering ppg desc then `player_id`.
  - `cautionAge`: birthdate on/after/before June 1 of dataSeason+1; missing birthdate → Sleeper `age` with `source: 'sleeper'`; both missing → `null`.
  - `ageCaution`: 31 → `over`; 30 → `null`; 25 → `null`; 24 → `under`; non-veteran → `null`.
- `TwoYearRank.test.jsx`: cell text `2-yr avg WR14`; `null` entry → `—` with the not-ranked text; marker renders nothing for `null`, the right glyph/aria-label/gloss for each kind, and the Sleeper-age sentence only when `ageSource === 'sleeper'`; a click on either trigger inside a parent with an `onClick` spy does not reach the spy.
- `cells.test.jsx`: `PlayerCell` without `marker` renders exactly as before (snapshot or markup equality); with `marker` the node appears after the name.
- `twoYearBaseline.test.js` also: a `playerMap` fixture entry carrying `birth_date` drives `source: 'birthdate'`; a `years_exp: 1` row with `confidence: 'prospect'` is outside the pool.
- Surface tests: Market Value set shows the sub-line and the marker for a fixture veteran aged 32; the pop-up dynasty tile shows the rank line; Portfolio's Starting ten and Bench each have a `2-YR RANK` header directly after `KTC`, a veteran row shows `2-yr avg <POS><rank>` ranked against the league-wide pool (a fixture where a non-rostered player outranks him), and a 23-year-old veteran shows the `under` marker. Assert that the dynasty score value and label text on each surface are unchanged from before.
- Guard: §6.

---

## 8. Docs

- `docs/nav/utils.md`: row for `twoYearBaseline.js` — "pure, view-only B2 rank and age-band caution (S3/S4a baseline); never feeds projection/scoring".
- `docs/nav/components.md`: row for `dp/TwoYearRank.jsx`.
- `docs/signal-registry.md`: in the fantasy scoring core row (`:45`), append to *Current use*: "the two-year-average rank (`twoYearBaseline.js`) reads completed seasons' `gamesPlayed`/`fantasyPoints` (view-only display)". Sleeper player `birth_date` is read view-only by `twoYearBaseline.cautionAge`; add it to the row that covers Sleeper player fields if one exists, else note it in the hand-back for Session 1 (do not add a new row unprompted).
- Reference-doc wording **and the in-app popover copy** (both in scope of `src/__tests__/docsAvailabilityClaims.test.js`) follow the "capability and mechanism, never current data availability" rule: no "today", "currently", or claims that a season is populated. Citing S3/S4a's tested seasons (2015–2022) is a dated result, not an availability claim; keep it worded as "in the history tests (…seasons 2015–2022)".

---

## 9. Done-definition and hand-back

The app CLAUDE.md done-definition, in full: tests green (`npm test`), `npm run lint` 0, `npm run build` clean, **smoke the change in the running app** via `.claude/launch.json` (Market Value set, the pop-up of a 31+ and a ≤24 veteran, My Team) and report what you saw; `grep -rn "PROVISIONAL(" src/` output in the hand-back. Commit; **push only after Session 1's verification is clean and Anton signs off** (`git pull --rebase origin main`, never `--force`). Hand-back: SHA range, files touched, deviations, what each test asserts, screenshots of the three surfaces.

---

## 10. Stops

- Any need to touch a §1 Out file, add App state, or change a sort key.
- `playerMap` entries carry no `birth_date` at all in the running app (report the fallback share; do not ship on Sleeper ages silently).
- Any design question this file does not answer.

---

## 11. Open for Anton

**Decided (Anton, 2026-10-31):** My Team gets the `2-YR RANK` column after `KTC` in Starting ten and Bench, with the age marker next to the name (§5.3, §7). Nothing is open. **Approved for Session 2.**

## 12. Revision record

Revision 1 → light plan review (2026-10-31): 9 mechanical flags folded without another round — token `text-dp-down-text` (§4, stop removed); `DefinitionPopover` `term`/`gloss`, click-to-open, `stopPropagation` (§4, §7); `PlayerCell` `marker` prop + `cells.jsx` in the touch list (§2, §5.0); `birth_date` provenance, smoke check and Sleeper-age gloss (§3, §4, §10); Market cell anchor and layout (§5.1); pop-up `note` as a node (§5.2); veteran pool = S3's (§3); completed-seasons assumption stated (§3); guard covers `TwoYearRank.jsx` (§6); availability-claims rule for popover copy (§8).
