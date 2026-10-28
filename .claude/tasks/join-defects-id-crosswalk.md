# Join defects — ID-first KTC / draft / college joins via the nflverse crosswalk

Review depth: full — changes what feeds `projectedPPG`/`projectedGames` (rookie path) and the dynasty score, adds a data-store loader and a new cross-repo contract (CR-31), changes what `projectionSnapshot.js` captures (`inputStatus.playerIds`), bumps `PRIOR_MODEL_FROM`.

**Status:** approved by Anton 2026-10-25 with the 11 plan-review flags folded in (§11). After hand-back, Session 1 runs implementation-reviewer at **full** depth on both repos' diffs. **No push of anything before Anton's sign-off; §9.4 runs only after it.**

**Scope:** cross-repo, run from the parent folder. Session 1 (opus, 2026-10-25) edited no source. Session 2 runs on **sonnet**, commits in both repos, pushes **neither** until §9.

**Sources (read in full by Session 1):** data `.claude/tasks/app-repo-backlog.md` entries "Name-only matchers miss nickname and short-form name variants", "Same-name, different-person…", "nflDraftMatch rejects TE↔RB hybrids…", "Travis Hunter: Sleeper position `DB`…"; data `verification/2026-10-18-computed-stats-verification.{md,json}` §V3. Prototype that produced every number below: `.claude/tasks/join-defects-id-crosswalk.prototype/` (reference only — the spec below governs where they differ).

---

## 1. Findings that shape the design

1. **KTC rows carry no KTC id** (`ktc/snapshot-*.json` rows are `{ name, team, value, position }`), and `bySleeper[*].ktcId` is 7 % populated (data README: "do not plan a join on it"). An id join for KTC is impossible. But the crosswalk's `ids[gsisId].name` (DynastyProcess `name`) **is KTC's spelling**: for every top-400 row with a crosswalk entry, normalised crosswalk name = normalised KTC name (393/393, 0 differ). It is the KTC alias source.
2. **Draft has an id-quality key.** `bySleeper[sid].{draftYear, draftOvr}` → `draft_picks.json` `picksByYear[draftYear]` row with `pick === draftOvr` (`pick` is **overall**; `bySleeper.draftPick` is in-round — never join on it). Over every skill Sleeper id with `undrafted === false`, `draftYear ∈ [2017, 2026]`: 804 picks found, 799 name-agree, the 5 others are the same person under a name variant with the same college (Alizé Mack, Scott Miller, D'Wayne Eskridge, Josh Palmer, Andrew Ogletree).
3. **CFBD athlete id = ESPN id = `bySleeper.espnId`** (Caleb Williams 4431611 in `college/passing/2023.json`, etc.). College gets an id join.
4. **CFBD can re-issue an id on transfer** (Bo Nix: Auburn 2019–21 `4567218`, Oregon 2022–23 `4426338`; crosswalk holds the Oregon one). An id-only college join would drop real seasons, so name fallback must still fill years that have no id row.
5. **The crosswalk has wrong rows.** `bySleeper["11376"]` (Sleeper: Richard Gouraige, OL) carries Sam Hartman's gsis/espn ids. Every crosswalk-derived join needs a surname sanity check and a skill-position filter.
6. **Travis Hunter is excluded app-wide, not just by the matchers.** `App.jsx:424/435`, `seasonProjection.js:664` and `dynastyScore.js:76/685` all gate on `player.position ∈ {QB,RB,WR,TE}`; Sleeper says `DB`. Fixing the matchers gives him a KTC value, draft entry and college seasons, but no row, projection or dynasty score. Making him a WR app-wide is **out of this slice** (§11).
7. **`fantasy_positions` widening must stay off the name-fallback paths.** Widening the college name fallback pulls ~20 FBs (`fantasy_positions: ['RB']`) in by name and attaches wrong seasons (Taniela Tupou 2025 USC, Julian Allen 2025 Toledo). Widen only the id paths and KTC (where KTC's own position decides).
8. **`loadKtcHistory` caches matched series** under `ktc-history/v1` with `CACHE_TTL` 1440 min (one day), so old name-only series age out within a day. The series feed only capture-only `ktcHist*` factors, so no cache-key bump is needed (Anton, 2026-10-25).

## 2. Coverage of the crosswalk, top 400 (KTC `snapshot-2026-10-12`, playersMap fetched 2026-10-18, crosswalk generatedAt 2026-10-21)

| measure | rows |
|---|---|
| top-400 rows resolved to a Sleeper id (new matcher) | 400 |
| …with a `bySleeper` entry (and an `ids[gsis].name`, and an `espnId`) | 397 |
| …whose `espnId` appears in `college/*/2017–2025.json` | 350 |
| drafted 2017+ (draft id join applies) / undrafted / drafted before 2017 (outside the app's draft window by design) | 338 / 37 / 22 |

**Where there is no id:** the 3 rows without a crosswalk entry (Matthew Hibner 13324, Jack Strand 13602, CJ Daniels 13270) use the name fallback (Hibner resolves through the given-name alias and team agreement; CJ Daniels' seasons are unchanged). The 47 `espnId`s absent from the CFBD files are 2017-and-earlier draftees (college before the 2017 floor), lower-division players (D-78), and Baker Mayfield (id mismatch — his 2017 Oklahoma season still comes by name, unchanged). Draft: no id → today's name matcher over the picks no id claimed.

## 3. Measured join impact (prototype; old = app `01120b1` matchers on the same inputs)

**KTC** — 457 → 464 matched. 7 newly matched: D.J. Moore → 4983, Kenneth Gainwell → 7567, Chigoziem Okonkwo → 8210, Travis Hunter → 12530 (fantasy_positions), Matthew Hibner → 13324 (given-name alias + team), Gabriel Davis → 6943, Bam Knight → 8122. 2 reassigned: Kyle Williams 638 (retired, 2010 draftee) → 12547 (NE), Frank Gore Jr. 232 (retired) → 11573 (BUF), both by the team tie-break. No other KTC row changes target.
**Draft** — 778 → 806 matched; 804 by id, 2 by name. 30 gained (incl. Palmer, Higgins, Ouzts, Gainwell, Hunter, Eskridge, N'Keal Harry, Hakeem Butler), 1 reassigned (Ronald Jones duplicate 4955 → 5052, the crosswalk's id; same person, two Sleeper rows), 2 wrong matches dropped (Greg Little 835 ← a 2019 pick of another Greg Little; James Williams 6169 ← a 2024 pick of another James Williams).
**College** — 2104 → 2118 players with seasons; 160 players change (60 gain seasons from none, 46 lose all, 54 change). Season rows lost: 148 at/after the crosswalk draft year (another person), 6 before the window, 1 inside it (Isaiah Davis 2021 UTSA — another person), 5 replaced by the id row of the same year, 13 for players with no crosswalk entry (Sleeper duplicate rows, same-name collisions). Season rows gained: 204 by id, 26 by name.
**Top 400** — 28 players' college seasons change, every one a correction: Kenneth Walker (+Wake Forest), Caleb Williams (−2025 Pitt), Bucky Irving, KC Concepcion, Cam Skattebo, Cam Ward, Croskey-Merritt, Mike Washington, Woody Marks, Pat Bryant, Gainwell, Tank Dell, Okonkwo, Hunter, Palmer, Pacheco, Atwell, Lambert-Smith, Hibner (none → seasons), A.J. Brown (−2022 Ga. Southern), Mike Evans (−App State 2020–21), Brian Thomas Jr. (−2024–25), Daniel Jones (−2021 Navy), Justice Hill (−2024 Murray St), Isaiah Davis (UTSA/SFA → SDSU), Ray Davis (+Temple, Kentucky), Kyle Williams (+UNLV), Chris Brooks (Wisconsin → BYU). No previously-correct top-400 join changes.
**Simulated V3 after** (V3's own diagnose functions on the new outputs, before the harness changes in §6): ktc-unmatched 5 → 0, ktc-ambiguous 1 → 0, draft-missing 2 → 0, college-after-draft 9 → 0, college-none 20 → 7 (all lower-division, D-78: Watson NDSU, Goedert SDSU, E. Wilson Fort Valley St, Meyers Delta St, Bagent Shepherd, K. Johnson Barton, Strand MSU Moorhead), college-disagree 3 → 1 and college-name-collision 5 → 5 (all id-matched seasons the harness cannot yet tell from name matches — §6 fixes the diagnosis; expected 0 after), draft-out-of-window 24 → 23 (by design).

**Projection impact (pre-estimate; measured in §8):** only the rookie path (`yearsExp ≤ 1` or no qualifying season) reads these joins. Draft capital changes for 2 rookie-path rows (Robbie Ouzts, Tommy Mellott: `unmatched` → `matched` — calibration, games ladder and total factor move); college seasons change for 37 rookie-path players (20 active on a team: Kyle Williams, Woody Marks, Skattebo, Cam Ward, Croskey-Merritt, Lambert-Smith, Concepcion, Mike Washington, Hibner, Jam Miller, Jaydn Ott, …); `ktcMult` is continuous in the position percentile, so the 7 additions shift most KTC-valued rookie percentiles slightly. Expected veteran `projectedPPG`/`projectedGames` movement: **none** (veteran path reads none of the three; QB quality reads QB dynasty scores, and no QB's KTC/draft/college join changes). Dynasty score/label move for the newly KTC-matched veterans (D.J. Moore, Gainwell, Okonkwo, Gabe Davis, Bam Knight) and for rookies; the relevance filter may admit rows that now have KTC (Gabe Davis).

## 4. Shared module and loader (app)

### 4.1 `src/utils/playerIdCrosswalk.js` (new, pure, no imports from `src/api/`)

```js
export const PLAYER_ID_INDEX_VERSION = 1
// raw = parsed nflverse/playerids.json (schemaVersion 2). Returns a plain object (IndexedDB-cacheable):
// { version: 1, generatedAt, bySleeper: { [sid]: { name, cfbrefName, espnId, draftYear, draftOvr, undrafted, college } } }
// name = raw.ids[b.gsisId]?.name ?? null; cfbrefName = cfbrefId with /-\d+$/ removed and '-' → ' ' (null if absent);
// every other field copied verbatim (null stays null). Rows whose sid is '' are skipped.
export function buildPlayerIdIndex(raw)
// Skill positions from [player.position, ...(player.fantasy_positions ?? [])] ∩ {QB,RB,WR,TE}, primary first, deduped.
export function skillPositions(player)
// true iff both names have ≥ 2 tokens and the last token of either (collegeMatch normalizeName) is a non-first token of the other.
// "Keandre Lambert" ~ "KeAndre Lambert-Smith" true; "Sam Hartman" ~ "Richard Gouraige" false.
export function surnameAgrees(a, b)
export const GIVEN_NAME_ALIASES = [['matt','matthew'],['ken','kenny','kenneth'],['josh','joshua'],['cam','cameron'],
  ['mike','michael'],['chris','christopher'],['pat','patrick'],['nate','nathan'],['zach','zachary'],['will','william'],
  ['tony','anthony'],['dan','daniel'],['jon','jonathan'],['nick','nicholas'],['rob','robert'],['tom','thomas']]
// norm = an already-normalised name. Returns [norm, the form with leading single-letter initials joined
// ('d j moore' → 'dj moore'), and each of those with its first token swapped for every member of its alias group].
export function nameVariants(norm)
// Map<espnId, sid> over index rows whose sid is in playersMap with skillPositions(...).length > 0; an espnId held by
// two such sids is dropped from the map (neither gets the id join).
export function espnToSleeper(index, playersMap)
```

### 4.2 `src/api/playerIds.js` (new) — `export async function loadPlayerIds()`

Mirrors `nflDraft.js`'s freshness pattern, one record: cache key `nflverse/playerids`, TTL `999999`, record `{ index, lastModified }`. Flow: `getManifestEntry('nflverse/playerids.json')`; fresh cache (`index.version === PLAYER_ID_INDEX_VERSION` and (no entry or `lastModified` equal)) → return `index`; else `tryDataStore('nflverse/playerids.json', { validate: isValidPlayerIds })`; null → return the stale cached index if any (log once), else `null`; success → `buildPlayerIdIndex`, persist unless `wasServedStale(path)`, return it. Never throws (catch → `null`, `console.warn`). Add `export function isValidPlayerIds(p)` to `src/api/dataStore.js`: `p?.schemaVersion === 2 && p.ids && typeof p.ids === 'object' && p.bySleeper && typeof p.bySleeper === 'object'`. Do **not** add the path to `expectedRecordCount` (CR-29 untouched; the `generatedAt` skew check still applies). The raw 2 MB file is never cached — only the index.

## 5. Matcher specs (app)

All three gain an optional last parameter `playerIds` (the §4.1 index or `null`). `null` ⇒ the id paths are skipped and every other rule below still applies. Existing exports and return shapes stay; additions are listed.

### 5.1 `src/utils/ktcMatch.js`

- New export `resolveKtcRows(ktcPlayers, playersMap, playerIds = null)` → array, one entry per input row that passes the existing name/value/skill-position filters: `{ row, sid, path, candidates }`, `path ∈ 'exact' | 'exact-team' | 'alias-team' | 'ambiguous' | 'unmatched'`. `matchKTCToSleeper(ktcPlayers, playersMap, playerIds = null)` builds its `Map` from it (same value shape, same log line plus an `ambiguous` count). Pick rows still drop (Traps).
- **Index:** for each Sleeper player with `full_name` and `skillPositions(p).length > 0`: names = {`normalizeName(full_name)`} ∪ {`normalizeName(idx.name)` when `playerIds.bySleeper[sid].name` exists and `surnameAgrees(idx.name, full_name)`}. `exact[name|pos]` ∋ sid for every name × every skill position; `alias[v|pos]` ∋ sid for every `nameVariants(name)` × position. Keep the private `normalizeName` (do not unify with collegeMatch's).
- **Resolve** a row with KTC position `pos` (strategy 2's position-absent path is removed — every current KTC row has a position; a row without one is `unmatched`):
  1. `E = exact[norm|pos]`. One id → `exact`. Several → keep those whose Sleeper team equals the KTC team after `KTC_TEAM_ALIAS` (`{LVR:'LV',JAC:'JAX',KCC:'KC',SFO:'SF',NEP:'NE',NOS:'NO',TBB:'TB',GBP:'GB'}`, exported; a null Sleeper team and KTC `FA` both read `FA`); exactly one → `exact-team`; else `ambiguous` (no value — replaces `ids[0]`).
  2. `E` empty → union of `alias[v|pos]` over `nameVariants(norm)`, filtered to Sleeper team = aliased KTC team; exactly one → `alias-team`; else `unmatched`.
- Measured: §3 KTC list exactly; the two crosswalk names the surname guard rejects (Tony Jones/"Glenn Cadrez", Moritz Bohringer/"Moritz Boehringer") change nothing.

### 5.2 `src/utils/nflDraftMatch.js`

- Signature `matchNflDraftToSleeper(draftPicksByYear, playersMap, playerIds = null)`; return shape unchanged. Export `positionsCompatible` (harness imports it, §6).
- **Pass A (id), when `playerIds`:** for each sid in `playerIds.bySleeper` with `playersMap[sid]` and `skillPositions(...).length > 0`, `undrafted === false`, `draftYear` a loaded key of `draftPicksByYear`, `draftOvr != null`: `pick = picksByYear[draftYear].find(p => p.pick === draftOvr)`. Accept iff `pick` exists and (`normalizeName(pick.fullName)` equals `normalizeName` of the Sleeper `full_name` or of `idx.name`, **or** the pick's college agrees with `idx.college ?? player.college` by the existing exact-then-word-overlap rule). No position check on this pass (fixes TE↔RB hybrids and `DB` Hunter). Accepted → result entry (same fields as today) and the `(year, pick)` is **claimed**.
- **Pass B (name):** today's algorithm unchanged, run over the picks no Pass A claimed. A Pass B match is discarded when the sid already has a Pass A entry, or when `playerIds.bySleeper[sid]` exists and says `undrafted === true` or `draftYear !== pick.year`. Pass B keeps the primary-`position` guard and `positionsCompatible` as today (a hybrid with no crosswalk row stays skipped; update the header comment's Robbie Ouzts paragraph accordingly).
- Measured: §3 Draft list exactly.

### 5.3 `src/utils/collegeMatch.js`

- Signature `matchCollegeToSleeper(rawCollegeData, playersMap, playerIds = null)`. Each season entry gains `matchedBy: 'id' | 'name'` (`'id'` if any row merged into it came by id). Nothing else in the entry shape changes; Pass 1 stays receiving-driven, Pass 2 passing/QB-only.
- `espn = playerIds ? espnToSleeper(playerIds, playersMap) : new Map()`. `idSid(cfbdId, row)`: `s = espn.get(cfbdId)`; return `s` iff `surnameAgrees(row.player, n)` for some `n` of {Sleeper `full_name`, `idx.name`, `idx.cfbrefName`}; else null.
- `idYears`: sid → set of years in which **any** category (receiving, rushing, passing) has a row with `idSid(...) === sid`.
- **Name map (fallback universe):** players with primary `position ∈ SKILL` only (not `fantasy_positions`, finding 7). Keys per player: `nameVariants(normalizeName(full_name))`, plus `normalizeName(idx.name)` and `normalizeName(idx.cfbrefName)` when each passes `surnameAgrees` with `full_name`. Candidate: `{ player_id, college: normalizeCollege(p.college), colleges: [p.college, idx.college] (non-empty), position, draftYear: idx?.draftYear ?? null }`, deduped per key.
- **Resolve a row** (`cfbdId`, `row`, `year`): `idSid` hit → that sid, `'id'` (Pass 2 additionally requires `'QB' ∈ skillPositions`). Else candidates = `nameMap[normalizeName(row.player)]` minus those with `idYears.get(id).has(year)`, minus those with `draftYear != null && !(year < draftYear && year >= draftYear - 6)`. One left → it, `'name'`. Several → today's tie-break unchanged (first exact `college`, then first word-overlap > 3 chars), `'name'`. None → null.
- **Same-year collision guard (name rows only):** resolve every row of the year first. If one sid received name-matched rows with more than one distinct CFBD id **and** those rows' teams differ after `normalizeCollege`, keep only the row(s) whose team agrees (exact-or-word-overlap) with one of the candidate's `colleges`; if not exactly one id agrees, drop all of that sid's name rows for the year. Same team across ids (CFBD duplicate rows, e.g. La'Damian Webb 2022) → keep today's merge.
- Measured: §3 College numbers exactly.

### 5.4 `src/utils/ktcHistory.js`

`loadKtcHistory({ playersMap, playerIds = null, window })` passes `playerIds` to `matchKTCToSleeper`. `CACHE_KEY` stays `'ktc-history/v1'` and the cached record is unchanged (finding 8): a day-old cached series may still be name-matched, which touches only capture-only `ktcHist*` factors.

### 5.5 `src/App.jsx` (state stays here)

- `const [playerIds, setPlayerIds] = useState(null)`, `const [playerIdsSettled, setPlayerIdsSettled] = useState(false)`; a new **mount-only** effect (`[]` deps, like the `loadEnrichment`/`loadPriorSnapshotTeams` effects at `App.jsx:360/370`; `cancelled` flag) calls `loadPlayerIds()` and sets both in `.then`/`.finally`. **No reset** on league change — the crosswalk does not depend on the league, and a league-keyed effect would hand back a fresh index object and re-run the four dependent effects.
- The KTC effect (starts `:323`), the KTC-history effect (starts `:349`; `loadKtcHistory` call at `:352`), the college effect (starts `:1086`) and the draft effect (starts `:1106`) return early until `playerIdsSettled`, add it (and `playerIds`) to their deps, and pass `playerIds` to the matcher / loader. The snapshot write gate needs no new flag: `ktcMap`, `collegeSettled` and `nflDraftSettled` cannot be set before `playerIdsSettled`.
- The snapshot effect passes `playerIds` to `writeProjectionSnapshot` and adds it to its dependency array (`App.jsx:886–890`). `writeProjectionSnapshot(args)` forwards to `buildProjectionSnapshot`, whose fixed destructuring (`projectionSnapshot.js:344`) and JSDoc gain `playerIds` (default `null`); `src/utils/projectionSnapshot.js` adds (at the `inputStatus` literal, `:396`) `inputStatus.playerIds = { loaded: playerIds != null, count: playerIds ? Object.keys(playerIds.bySleeper).length : 0, detail: { generatedAt: playerIds?.generatedAt ?? null } }` (additive; no data-side reader, so CR-01 is unchanged — say so in the hand-back).

## 6. Verification harness (app `scripts/verify/`)

- `lib/v3Joins.mjs` `runV3`: build `idx = buildPlayerIdIndex(crosswalk)` and pass it to all three matchers. `diagnoseKtc` reads `resolveKtcRows` (delete `ktcNormalizeName` and `buildKtcResolver` — the "verbatim copy" is gone); reason `ktc-ambiguous-first-taken` → `ktc-ambiguous-unresolved` (path `ambiguous`); `ktc-team-fallback` → reported for `exact-team`/`alias-team` with `evidence.path` **as info, never a defect**: add it to the V3 KTC group's `ignoreOnly` in `scripts/verify/lib/report.mjs:47` (with `ktc-team-disagree`), and update `report.test.mjs` for it; keep the `TEAM_ALIAS` there as an import of `KTC_TEAM_ALIAS`. `missingSubReason` imports `positionsCompatible` (delete the local copy). `diagnoseCollege`: `college-name-collision` and `college-disagree` consider only seasons with `matchedBy === 'name'`.
- `computed-stats.mjs`: new `--dump-joins <path>` (valid with any `--only` containing v3) writes `{ inputs: { ktcFile, playersMapFetchedAt, crosswalkGeneratedAt, appHead }, rows: [{ rank, name, position, team, value, sid, ktcPath, draft: {year, round, pick} | null, college: [{ year, team, matchedBy }] }] }` for the top 400 (`ktcPath` and `matchedBy` are `null` when the code under test predates them).
- New `scripts/verify/compare-joins.mjs -- --before <f> --after <f> --out <md>`: pure `compareJoinDumps(before, after)` + CLI. Report: per join (KTC sid, draft, college seasons) the rows that gained / lost / changed, each listed with before → after; a final line "previously-matched joins changed: N" over rows where before had a value and after differs.
- Tests: update `scripts/verify/__tests__/v3Joins.test.mjs` for the renames and the `matchedBy` rule; new `compareJoins.test.mjs` (gain, loss, change, unchanged rows, count line).

## 7. Tests (app `src/`)

Synthetic fixtures (no network). Each test names the real case it pins.
- `playerIdCrosswalk.test.js`: `buildPlayerIdIndex` (name from `ids`, cfbref slug → name, nulls kept, version); `surnameAgrees` (Lambert ~ Lambert-Smith true; Hartman ~ Gouraige false; single-token false); `nameVariants` ('d j moore' → includes 'dj moore'; 'matt hibner' → includes 'matthew hibner'); `skillPositions` (DB + ['DB','WR'] → ['WR']); `espnToSleeper` drops duplicated espnIds and non-skill sids.
- `ktcMatch.test.js`: DJ Moore (KTC "D.J." vs Sleeper "DJ", plus a CB "DJ Moore" decoy) → WR sid; Gainwell via crosswalk name; Hibner via alias + team; Hibner-shaped row with a team mismatch → unmatched; Hunter via `fantasy_positions`; Kyle Williams (three candidates, one on NE) → NE sid; three candidates none on the KTC team → no value (`ambiguous`); crosswalk name failing `surnameAgrees` is not indexed; `playerIds = null` still resolves "D.J. Moore" (initials join). Existing assertions that change, each updated to the new outcome and listed old → new in the hand-back: any that asserted `ids[0]`; `ktcMatch.test.js:106` ("matches when position is absent … uses team instead" — the position-absent path is removed, so the row is now unmatched) and `:115` (team case-insensitivity on that path — re-pin case-insensitivity on the `exact-team` tie-break instead).
- `nflDraftMatch.test.js`: Pass A — Palmer (pick "Josh Palmer", Sleeper "Joshua Palmer"), Higgins/Ouzts hybrid (pick position `TE`, Sleeper `RB` — accepted by Pass A, still skipped by Pass B without a crosswalk row), Hunter (`DB`); `draftOvr` used, not in-round `draftPick` (a fixture where they differ); claimed pick not re-assigned by Pass B to a same-name sid; Pass B match dropped when crosswalk says `undrafted: true` (Greg Little shape) or a different `draftYear`; Pass A rejects a pick whose name and college both disagree.
- `collegeMatch.test.js`: Caleb Williams shape (a same-name row after `draftYear` not attached); A.J. Brown shape (lone candidate, out-of-window row rejected); Bo Nix shape (id row 2022–23, different-id same-name rows 2019–21 attached by name); Isaiah Davis shape (name row in a year with an id row in **rushing** only is rejected); Josh Johnson shape (three same-name ids, different teams, one agrees with Sleeper college → only it); Webb shape (two ids, same team → merged as today); Hartman shape (espnId mapped to a sid whose names fail `surnameAgrees` → not an id match); Hibner shape (CFBD "Matthew", Sleeper "Matt", no crosswalk); FB with `fantasy_positions: ['RB']` not in the name universe; `matchedBy` values; `playerIds = null` and no window keeps today's outcome on the existing fixtures.
- `ktcHistory.test.js`: `playerIds` reaches the matcher; cache key unchanged.
- `src/api/playerIds.test.js`: fresh cache → no fetch; stale `lastModified` → refetch and persist; `wasServedStale` → not persisted; store null → cached index returned, else `null`; invalid payload → `null`; version mismatch → refetch.
- `projectionSnapshot` test: `inputStatus.playerIds` present with `loaded`/`count`/`detail.generatedAt`, and `loaded: false, count: 0` for `null`.
- `priorModelFrom.test.js`: only `GOLDEN.recordedUnder` moves with the bump (§9); outputs must not change — if they do, stop and report.
- Untouched contracts: `factorsSchema.test.js` (no `factors` key added/renamed — `nflDraftMatchSource` keeps its two values) and `statKeysContract.test.js` (no stat key) must pass unmodified.

## 8. Proof run and impact verdict (Session 2, before hand-back)

**Order:** commit **0** = §6 `--dump-joins` + `compare-joins.mjs` only (matchers untouched). Then the §4–§5 commits.

1. **Join proof.** From the app checkout at commit 0: `node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- --data ../sleeper-dashboard-data --out ../sleeper-dashboard-data/verification --only v3 --dump-joins <scratch>/joins-before.json` (fetches today's players map into `node_modules/.cache/verify-computed-stats/<today>`). Record the before run's UTC date as `<D>`. At the final commit, the same with `--date <D> --no-fetch --dump-joins <scratch>/joins-after.json` — `--date` is pinned so the after run reads the same cached players map even if work crosses UTC midnight; never drop `--no-fetch` to recover a cache miss (stop and report instead). Read `<today>` below as `<D>`. Then `compare-joins.mjs` → `../sleeper-dashboard-data/verification/<today>-join-fix-diff.md`; copy both dumps beside it as `<today>-join-fix-joins-{before,after}.json`. The after run's `<today>-computed-stats-verification.{md,json}` is the V3 re-run (commit it; it carries only V3 — say so in its annotations if used, else leave it).
   **Pass conditions:** (a) every row named in the four backlog entries and in V3's ktc-unmatched / ktc-ambiguous / draft-missing / college-after-draft / college-disagree / college-name-collision tables is resolved, or appears in the diff report's "explained" list with one of: lower-division / D-78, pre-2017 draft (window by design), no crosswalk row + no name match; (b) "previously-matched joins changed" lists only rows whose before-value §3 identifies as wrong (Kyle Williams, Frank Gore Jr., Caleb Williams, A.J. Brown, Mike Evans, Brian Thomas Jr., Daniel Jones, Justice Hill, Isaiah Davis, Chris Brooks, Ray Davis/Kenneth Walker/Kyle Williams season additions) — any other entry → stop and report; (c) college-none ≤ 7 and every remaining one lower-division. Inputs will differ from 2026-10-18 (newer KTC/players map); the diff, not the old report, is the comparison.
2. **Impact verdict.** Data repo `scripts/absence-role-impact.mjs`: (a) `--title <text>` (default: today's D-76 string); (b) `FIELDS` += `['nflDraftMatchSource', (p) => get(p, ['projection', 'factors', 'nflDraftMatchSource']), false]`; (c) a **rookie/veteran split**: a row's path is `'rookie'` when the after row's `projection.confidence === 'rookie'` (the before row's when absent from after), else `'veteran'`; `diffCaptures` returns `countsByPath: { rookie: {field: n}, veteran: {field: n} }` and the "Rows moved" table gains `rookie` and `veteran` columns; (d) a "20 largest movers by |Δ projectedPPG|" section after the two existing mover sections, each mover row showing its path; (e) a "Rows whose `nflDraftMatchSource` changed" section listing every such row (id, name, position, path, before → after) — this list is the set the §9.3 anchor-policy cross-check compares against. Update `test/absence-role-impact.test.mjs`: existing assertions that change because of the added field/columns are updated (list old → new in the hand-back); new tests for the split, the PPG movers section and the draft-source section. The committed D-76 verdict file is not regenerated. Recipe = D-76 §C1c with the **data tree fixed** and the **app varying**: serve the data primary checkout (`main`, clean) on 8787; build two detached app worktrees — `<app-before>` = app `main` before this slice, `<app-after>` = the final slice commit — each `npm ci`, linked `.env.local`, `VITE_DATA_STORE_URL=http://localhost:8787`, preview on 4173 / 4174. Capture `before` (4173), `after` (4174), `before2` (4173) back to back with `SNAPSHOT_OUT_PATH` and `SNAPSHOT_LEAGUE_ID` = `leagueId` of the newest `snapshots/*.json`. `node scripts/absence-role-impact.mjs report --title "Join defects (ID crosswalk) — impact verdict" --before … --before2 … --after … --after-tree <data main> --out grading/<today>-join-fix-verdict.md`, plus a `--section "Join changes=<the §8.1 diff md>"`. Remove the worktrees.
   **Stop and report (no hand-back as done) if:** the noise floor is not empty; **any veteran-path row** moves `projectedPPG` or `projectedGames` (read from `countsByPath.veteran`) (that needs a veteran segment, §9.3); or rookie-path `projectedPPG` movers exceed 150.
3. Done-definition (app CLAUDE.md) in full; data `npm test`, `npm run smoke`.

## 9. Model pin, registry, docs, release

### 9.1 Model pin
This moves rookie `projectedPPG`/`projectedGames`/`projectedTotalPts`, so `PRIOR_MODEL_FROM` is bumped — but **in the release commit (§9.4), not in the reviewed commits**, because its value is the release date. Until then leave it and `GOLDEN.recordedUnder` at `'2026-10-23'`.

### 9.2 Cross-repo registry (`sleeper-dashboard/docs/cross-repo-registry.md`, cap 12,000 B; now 10,095 B)
- Header: drop `nflverse/playerids.json` from "Not contracts" (keep `nflverse/oline/`).
- New entry (≈ 600 B):
```
#### CR-31 · Player-id crosswalk
- **Invariant:** `nflverse/playerids.json` stays schemaVersion 2 with `ids[gsisId].name` and `bySleeper[sid].{gsisId, espnId, cfbrefId, draftYear, draftOvr, undrafted, college}`; `draftOvr` is the overall pick (`draft_picks.json` `pick`), `espnId` is the CFBD athlete id, which keys `college/<cat>/<year>.json` `players`. The app joins KTC (name alias), draft and college on them.
- **App:** `src/api/playerIds.js` (`loadPlayerIds`); `src/utils/playerIdCrosswalk.js` (`buildPlayerIdIndex`); `src/api/dataStore.js` (`isValidPlayerIds`)
- **Data:** `lib/nflverse.mjs` (`parsePlayerIdsCsv`); `lib/validate.mjs` (`validatePlayerIds`); `scripts/update-playerids.mjs` (`updatePlayerIds`); `lib/cfbd.mjs` (`pivotCfbdRows`)
- **Tests:** `test/nflverse.test.mjs`; `src/utils/playerIdCrosswalk.test.js`
```
Confirm `crossRepoIndex.test.js` and data `test/registry.test.mjs` both pass.

### 9.3 Docs
- App: `docs/nav/utils.md` (rows for `ktcMatch.js`, `collegeMatch.js`, `nflDraftMatch.js`, new `playerIdCrosswalk.js`), `docs/navigation.md` (`src/api/playerIds.js` row), `docs/architecture.md` (useState inventory: `playerIds`, `playerIdsSettled`; the four effects now wait on it), `docs/integrations.md` (data-store families: playerids loader, cache record, graceful null → name-only joins; the CR-01 envelope paragraph at `:436` — "six gated projection inputs" → seven, adding `playerIds`, a label only), `docs/signal-registry.md` (playerids row: now read by the app for joins, still no `factors` key), `docs/projection.md` (**Boundary 11** paragraph in the style of 9/10: an app-side join correction moving rookie-path `projectedPPG`, `projectedGames`, `projectedTotalPts` and dynasty scores; row-detectable through the envelope's `projectionModelFrom` and `inputStatus.playerIds`). Mechanism-only wording (`docsAvailabilityClaims.test.js`).
- Data: `README.md` and `data-catalog.md` playerids sections (remove "no app loader", "`bySleeper` is capture-only — nothing reads it yet", "not a cross-repo contract", "no app-side gate to keep in sync", "do not plan a join on it" stays for `ktcId` only; point to CR-31); `scripts/update-playerids.mjs` header bullet "internal-only family, no app loader"; data `CLAUDE.md:76` file-table row (`nflverse/playerids.json` — no longer "internal-only … never by the app": read server-side by the ingests **and** by the app's `loadPlayerIds`, CR-31); data `README.md:315` `inputStatus` paragraph ("Six labels" → seven, adding `playerIds`) and its example block at `:270`.
- Data `grading/anchor-policy.md`: intro count "eleven" → "twelve" with "once on the rookie path through an app-side join correction"; row 11 in the date table (filled at release, §9.4); a "### Rookie rows — boundary 11 (join correction)" section: what moves (rookie-path `projectedPPG`/`projectedGames`/`projectedTotalPts` through draft capital, college metrics and KTC percentile; veteran projection unmoved — measured, cite the verdict); detection by `projectionModelFrom` ≥ the boundary value (never a date lookup); cross-check (open) after the first post-push capture — exact on the set of rookie rows whose `factors.nflDraftMatchSource` changed vs the last pre-push capture (= the verdict's), report-only on `projectedPPG`/dynasty; and the "Boundaries by path" sentence. **No new veteran segment** (rookie-only, like boundaries 6 and 9) — but the new `PRIOR_MODEL_FROM` value **is registered as an L6 marker** at release (§9.4 step 3; boundary 9's `'2026-10-14'` on L5 is the precedent), else the release capture maps to no segment and the January grade stops. If §8.2 found a veteran mover, Session 2 has already stopped.
- Backlogs: data `.claude/tasks/app-repo-backlog.md` — strike the name-variant, same-name and TE↔RB entries with the app commit; the Hunter entry is **re-scoped, not struck** (matchers fixed; app-wide position parked, §11). App `.claude/tasks/data-repo-backlog.md` D-78: add the seven remaining lower-division names from §8.1. Travis Hunter's app-wide eligibility is parked in `../PARKED.md` ("Make DB/WR two-way players eligible as WR").

### 9.4 Release (after Session 1 verification and Anton's sign-off)
Daily capture cron: **16:29 UTC** (`daily-snapshot.yml`); captures build app `main`. One release session, same UTC day:
1. Before **15:30 UTC** (else wait for the next day). `git pull --rebase` in both repos.
2. App release commit: `PRIOR_MODEL_FROM = '<today UTC>'` (must be > `'2026-10-23'`), `GOLDEN.recordedUnder` the same, the comment in `inSeasonConstants.js` gains "join-defects-id-crosswalk, an app-side join correction — the first capture after the app push" at the head of its chain; `docs/projection.md` boundary 11 date. `npm test`, `npm run lint`, `npm run build`; push app.
3. Data commit: anchor-policy row 11 — `app <release SHA>` · `<push time> UTC (the **app push**, <range>)` · `rookie (QB/RB/WR/TE)` · `ID-first joins (KTC alias, draft id, college id) — CR-31`; **register the marker**: in `lib/seasonGrade.mjs` `VETERAN_SEGMENTS` L6, append `'<today UTC>'` to both `detector.markers` and `markers`; the byte-mirrored JSON block in `grading/anchor-policy.md` identically; `test/season-grade.test.mjs` — the `MARKER_SEGMENT` deep-equal (`:39`) gains `'<today UTC>': 'L6'`, and the L6 detector assertions (`:72–73`) gain a firing case for the new marker. Data `npm test` green; push data. No CDN purge (no served file changes).
4. After the 16:29 capture: `git pull` data; confirm `snapshots/<today>.json` has `projectionModelFrom` = the new value and `inputStatus.playerIds.loaded === true`; run `node bin/season-grade.mjs --rehearse` — exit 0 and the release capture classifies to L6. Record all three in the hand-back; a non-zero exit or another segment → stop and report. A capture without `loaded: true` → report (the boundary still holds by marker, but the joins fell back to name-only).

## 10. Touch list

App: `src/utils/playerIdCrosswalk.js` (new) + test; `src/api/playerIds.js` (new) + test; `src/api/dataStore.js` (`isValidPlayerIds`); `src/utils/{ktcMatch,nflDraftMatch,collegeMatch,ktcHistory,projectionSnapshot}.js` + tests; `src/App.jsx`; `scripts/verify/{computed-stats.mjs,compare-joins.mjs,lib/v3Joins.mjs,lib/report.mjs}` + tests; docs listed in §9.3; release only: `src/utils/inSeasonConstants.js`, `src/__tests__/priorModelFrom.test.js`.
Data: `scripts/absence-role-impact.mjs` + test; `README.md`; `data-catalog.md`; `CLAUDE.md` (playerids row); `scripts/update-playerids.mjs` (comment only); `grading/anchor-policy.md`; release only: `lib/seasonGrade.mjs` (`VETERAN_SEGMENTS` L6 markers), `test/season-grade.test.mjs`; `grading/<today>-join-fix-verdict.md` (new); `verification/<today>-*` (new); `.claude/tasks/app-repo-backlog.md`.
Not touched: `ktcHistory.js` `CACHE_KEY`, `seasonProjection.js`, `dynastyScore.js`, `App.jsx:424/435` position gates, `src/api/nflDraft.js`, `src/api/cfbd.js`, `src/api/ktc.js`, CR-01/CR-06/CR-17/CR-29 sites, any `factors` key, any TTL value.

## 11. Decisions (Anton, 2026-10-25)

- Plan approved with the 11 plan-review flags folded in as stated; no further review round.
- **Travis Hunter app-wide: out of scope.** Matchers resolve him; the row/projection/dynasty gates still read `position: 'DB'`. Parked in `../PARKED.md`. The data backlog entry is re-scoped, not struck.
- **KTC-history cache key: unchanged** (finding 8).

## 12. Hand-back (Session 2)

Every commit SHA per repo; files touched; deviations from this file; what each new/changed test asserts (and each pre-existing assertion that changed, old → new); the §8.1 diff summary and pass-condition verdicts; the §8.2 verdict's impact table — `projectedPPG`, `projectedGames`, dynasty score and label, each split rookie vs veteran — with distributions, label transitions, the three top-20 mover tables and the `nflDraftMatchSource` list; the V3 re-run summary; the `PROVISIONAL(` inventory; confirmation that nothing was pushed.

---

## Fix pass 1 (Session 1, 2026-10-28 — approved by Anton)

Applies to app `0d8938b` and data `42f9837`, from the implementation-reviewer's full-depth review. Review depth for the re-run: **light**, because no item touches scoring, a factor, a CR contract or captured fields. One commit per repo. **No push, no rebase, no §9.4 release step.** Do not touch `PRIOR_MODEL_FROM`, `GOLDEN.recordedUnder`, `lib/seasonGrade.mjs` or anchor-policy row 11.

### F1 · Boundary-11 wording: dynasty moves on both paths
Projections move for rookies only. Dynasty score and label move for both paths: the verdict shows 5 veteran dynasty-score movers and 1 veteran label change, all newly KTC-matched or reassigned.
- **Data `grading/anchor-policy.md`, `### Rookie rows — boundary 11 (join correction)`, first paragraph:**
  - Replace "(and dynasty scores with them)" by stating that `projectedPPG`, `projectedGames` and `projectedTotalPts` move on the rookie path only.
  - After "The veteran projection does not move — measured, …", add: "`dynasty.score` and `dynasty.label` move on **both** paths: the rookies above, and veterans whose KTC join changed (newly matched or reassigned) — 5 veteran dynasty-score movers and 1 veteran label change in the verdict."
- **Same file, line 230 ("Boundaries by path"):**
  - Change "Boundary 11 is rookie-only (…)" to "Boundary 11 is rookie-only for projections (…)".
  - Append before the final clause: "; it also moves `dynasty.score`/`label` on veteran rows whose KTC join changed, so a pooled veteran dynasty grade spanning it measures the join correction".
  - Line 234's "Boundaries 6, 9 and 11 are rookie-only and have no veteran segment" stays; it is about projection segments.
- **Data cross-check bullet (same section):** "Report-only on `projectedPPG` and `dynasty.score`/`label`" stays, with "(both paths for dynasty)" added after `label`.
- **App `docs/projection.md`, **Boundary 11** paragraph:**
  - Replace "— moving rookie-path `projectedPPG`, `projectedGames`, `projectedTotalPts` and dynasty scores. The veteran path reads none of the three joins." with "— moving rookie-path `projectedPPG`, `projectedGames` and `projectedTotalPts`. The veteran projection reads none of the three joins. The dynasty score and label move on both paths: rookies, and veterans whose KTC join changed (the KTC value feeds the dynasty market component)."
  - Mechanism-only wording; `docsAvailabilityClaims.test.js` must stay green.

### F2 · Pass B `draftYear` guard: accepted deviation, no code change
`src/utils/nflDraftMatch.js` Pass B vetoes on `cw.draftYear != null && cw.draftYear !== pick.year`. That is the intended reading: a null crosswalk `draftYear` has nothing to contradict. It has no measured effect (806 drafts, matching §3). The code stays as it is. Add one line to the comment above that check: "A null crosswalk draftYear does not veto (nothing to contradict) — accepted deviation from §5.2, Fix pass 1 F2."

### F3 · D-78 backlog line
App `.claude/tasks/data-repo-backlog.md`, the line starting `**Append (join-defects-id-crosswalk, 2026-10-25):**`. Insert right after that bold label: "found by app `0d8938b` · **Blocking:** no ·". Keep the rest of the line as it is.

### F4 · Bo Nix false `college-disagree` (V3 harness)
**Rule.** `scripts/verify/lib/v3Joins.mjs` `diagnoseCollege`, the `college-disagree` condition. Also require that **no** season of the player has `matchedBy === 'id'`. An id-anchored player's name-matched seasons are re-issued-id years (finding 4), so a different team there is a transfer, not another person. `college-name-collision` stays as it is: it already looks only at name seasons, and a same-year collision is still worth flagging.

**Test** (`scripts/verify/__tests__/v3Joins.test.mjs`, new):
- The Bo Nix shape is not flagged. Use id seasons 2022–23 at "Oregon" plus name seasons 2019–21 at "Auburn", with the Sleeper/crosswalk college "Oregon".
- A player with **only** name seasons at a disagreeing college is still flagged `college-disagree`. The existing test at `:139–146` already covers this; keep it green.

**Re-run V3** on the same inputs, so the committed report is regenerated, not appended. From `sleeper-dashboard/`:
```
node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- --data ../sleeper-dashboard-data --out ../sleeper-dashboard-data/verification --only v3 --date 2026-10-25 --no-fetch
```
- No `--dump-joins`: the joins are unchanged.
- Run it against the data checkout at `42f9837`, not rebased. The `2026-10-25` players-map cache is in `node_modules/.cache/verify-computed-stats/2026-10-25`. A cache miss means stop and report; never drop `--no-fetch`.
- **Expected outcome:** V3 college defects 8 → **7**, all `college-none` lower-division (Watson, Goedert, E. Wilson, Meyers, Bagent, K. Johnson, Strand); no `college-disagree`. Any other change means stop and report.
- Commit the regenerated `verification/2026-10-25-computed-stats-verification.{md,json}` in the data commit.

### Accepted without change
- **Elijah Moore** (rank 401 → 399 by KTC drift): his dropped 2024–25 Florida State seasons belong to another player (crosswalk draft year 2021). This is the §3 "another person" correction.
- **`src/api/dataStore.test.js`** was touched for the `isValidPlayerIds` cases; that is in scope.

### Done
- **App:** `npm test`, `npm run lint`, `npm run build`.
- **Data:** `npm test`.
- **Hand back:** both SHAs, the files touched, what the new test asserts, the V3 before → after counts, and confirmation that nothing was pushed.
