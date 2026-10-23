# Cross-repo contract index

Contracts shared with sleeper-dashboard-data. Ids are permanent; a retired id keeps its header. Rule: `../CLAUDE.md` → *Cross-repo rule*. Sites are `path` (`symbol`) groups joined by `; `; each repo's test checks its own side. Not contracts: `nflverse/playerids.json`, `nflverse/oline/`.

#### CR-01 · Projection snapshot envelope
- **Invariant:** The v3 envelope the app writes (`targetSeason`, `scoringSettings`, `inputStatus`, `projectionBasis`) is what the data gate and grader read.
- **App:** `src/utils/projectionSnapshot.js` (`writeProjectionSnapshot`)
- **Data:** `lib/snapshot-capture.mjs` (`evaluateSnapshotRecord`); `scripts/grade-snapshot.mjs` (`gradeSnapshot`)

#### CR-02 · season-totals schema & rows
- **Invariant:** App schema ceiling ≥ written version; rows are players, `TEAM_*` (never summed) and DEF; scoring keys survive.
- **App:** `src/api/dataStore.js` (`MAX_SUPPORTED_SCHEMA`, `isValidSeasonTotals`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`, `prunePlayerStats`)
- **Tests:** `test/sleeper.test.mjs`

#### CR-03 · Enrichment schemas
- **Invariant:** Every enrichment field the app reads exists, same shape.
- **App:** `src/utils/enrichmentLookup.js` (`getCoaching`)
- **Data:** `lib/enrichment.mjs` (`validateEntry`)

#### CR-04 · Manifest contract
- **Invariant:** Manifest field names are a public API; unknown families are ignored.
- **App:** `src/api/dataStore.js` (`getManifestEntry`, `listManifestPaths`)
- **Data:** `lib/manifest.mjs` (`updateManifestEntry`)

#### CR-05 · CFBD statType keys
- **Invariant:** The pivoted envelope and statType names match the app's normalizer.
- **App:** `src/api/cfbd.js` (`normalizeCollegeStats`)
- **Data:** `lib/cfbd.mjs` (`pivotCfbdRows`)

#### CR-06 · nflverse roster & draft
- **Invariant:** Shapes and `MIN_ROSTER_IDS = 1500` match.
- **App:** `src/api/nflRoster.js` (`MIN_ROSTER_IDS`)
- **Data:** `lib/nflverse.mjs` (`MIN_ROSTER_IDS`)

#### CR-07 · nflverse advstats
- **Invariant:** Shape and `MIN_ADVSTATS_ROWS = 250` match; never scored.
- **App:** `src/api/advStats.js` (`MIN_ADVSTATS_ROWS`)
- **Data:** `lib/nflverse.mjs` (`MIN_ADVSTATS_ROWS`)
- **Tests:** `src/__tests__/advStatsViewOnly.test.js`

#### CR-08 · nflverse schedule
- **Invariant:** Shape and `MIN_SCHEDULE_GAMES = 200` match.
- **App:** `src/api/dataStore.js` (`isValidSchedule`)
- **Data:** `lib/nflverse.mjs` (`MIN_SCHEDULE_GAMES`)
- **Tests:** `src/__tests__/scheduleViewOnly.test.js`

#### CR-09 · nflverse gamelogs
- **Invariant:** Shape (absent key = null) and `MIN_PLAYERGAME_ROWS = 3000` match.
- **App:** `src/api/dataStore.js` (`isValidGameLogs`)
- **Data:** `lib/nflverse.mjs` (`MIN_PLAYERGAME_ROWS`)
- **Tests:** `src/__tests__/gameLogsViewOnly.test.js`

#### CR-10 · nflverse teamcontext
- **Invariant:** Shape (era abbr keys) and `MIN_TEAMCONTEXT_ROWS = 60` match.
- **App:** `src/api/dataStore.js` (`isValidTeamContext`)
- **Data:** `lib/nflverse.mjs` (`MIN_TEAMCONTEXT_ROWS`)
- **Tests:** `src/__tests__/teamContextViewOnly.test.js`

#### CR-11 · Snap & red-zone usage stat keys
- **Invariant:** `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` survive aggregation.
- **App:** `src/utils/usageMetrics.js` (`computeUsageFactors`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)
- **Tests:** `test/sleeper.test.mjs`

#### CR-12 · `pass_cmp` stat key
- **Invariant:** `pass_cmp` survives aggregation.
- **App:** `src/utils/efficiencyMetrics.js` (`passerRating`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)

#### CR-13 · `rec_air_yd` stat key
- **Invariant:** `rec_air_yd` survives aggregation.
- **App:** `src/utils/outlookPositionStats.js` (`buildTeamShareTotals`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)

#### CR-14 · `calculateFantasyPoints` port
- **Invariant:** The data port scores exactly as the app, incl. pre-2022 first downs.
- **App:** `src/utils/fantasyPoints.js` (`calculateFantasyPoints`, `scoreSeasonStats`)
- **Data:** `lib/fantasyPoints.mjs` (`calculateFantasyPoints`, `scoreSeasonStats`)
- **Tests:** `test/fantasy-points-season.test.mjs`

#### CR-15 · R3-FIT factor-multiplier mirror
- **Invariant:** Mirrored factor constants, gates and models reproduce the app exactly.
- **App:** `src/utils/seasonProjection.js` (`computeNextSeasonProjection`)
- **Data:** `lib/projectionFactors.mjs` (`REGRESSION_MODELS`); `lib/panel.mjs` (`predictFullPipeline`)
- **Tests:** `test/step4-mirror.test.mjs`; `test/rookie-mirror.test.mjs`; `test/qb-mirror.test.mjs`

#### CR-16 · Era-accurate team-code remap
- **Invariant:** Both map an abbr to the same era code per season, alias first.
- **App:** `src/utils/playerTeam.js` (`eraTeam`); `src/utils/nflStats.js` (`SCHEDULE_TEAM_ALIAS`)
- **Data:** `lib/nflverse.mjs` (`eraTeam`); `lib/sleeper.mjs` (`SCHEDULE_TEAM_ALIAS`)

#### CR-17 · KTC value snapshots
- **Invariant:** A bare `{ name, team, value, position }` array; picks keyed by `name`.
- **App:** `src/utils/ktcHistory.js` (`isValidKtcSnapshot`)
- **Data:** `scripts/update-ktc.mjs` (`updateKtc`)

#### CR-18 · Signal registry rows
- **Invariant:** Every ingested field has a current signal-registry row.
- **App:** `docs/signal-registry.md`
- **Data:** `data-catalog.md`

#### CR-19 · Market Efficiency stat keys
- **Invariant:** `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`, `rec_drop` survive.
- **App:** `src/utils/usageEfficiency.js` (`METRIC_META`)
- **Data:** `lib/sleeper.mjs` (`aggregateWeeks`)
- **Tests:** `src/__tests__/statKeysContract.test.js`

#### CR-20 · `fan_pts_allow_*` DEF-row keys — retired 2026-10-02

#### CR-21 · In-progress season-totals reads
- **Invariant:** An `inProgress` season is partial; scored only via `inSeasonScoring.js`.
- **App:** `src/api/sleeperStats.js` (`loadCurrentSeasonTotals`)
- **Data:** `scripts/update-nfl.mjs` (`shouldSkipCompletedSeason`)

#### CR-22 · Data repo executes the app
- **Invariant:** `localStorage` keys, boot auto-load, `[snapshot] wrote` marker and IndexedDB layout stay fixed.
- **App:** `src/App.jsx` (`LS_USER`, `LS_LEAGUE`); `src/utils/cache.js` (`DB_NAME`)
- **Data:** `scripts/capture-snapshot.mjs`

#### CR-23 · Team-season summary pack (parked)
- **Invariant:** If built, values equal `sumRegOff`/`sumRegDef`.
- **App:** `src/utils/environment.js` (`sumRegOff`, `sumRegDef`)
- **Data:** none

#### CR-24 · Registry mirror drift check — retired 2026-10-17

#### CR-25 · In-season evidence and fitted k
- **Invariant:** Evidence definitions match; each `K_*` equals its pinned file.
- **App:** `src/utils/inSeasonConstants.js` (`IN_SEASON_CONSTANTS_SOURCE`)
- **Data:** `lib/inSeasonEvidence.mjs` (`fitK`)
- **Tests:** `src/__tests__/inSeasonConstants.test.js`; `test/inseason.test.mjs`

#### CR-26 · Snapshot read-back (frozen prior)
- **Invariant:** Snapshots are immutable, `inProgress: false`, carrying raw `projectedPPG`.
- **App:** `src/api/frozenPrior.js` (`loadFrozenPrior`)
- **Data:** `scripts/register-snapshots.mjs` (`registerSnapshots`)
- **Tests:** `src/__tests__/priorModelFrom.test.js`

#### CR-27 · QB takeover constants
- **Invariant:** QB features, coefficients and chain equal the pinned files.
- **App:** `src/utils/qbTakeoverConstants.js` (`QB_TAKEOVER_SOURCE`)
- **Data:** `lib/qbTakeover.mjs` (`expectedStarts`); `lib/qbRookieLevel.mjs` (`levelTable`)
- **Tests:** `src/__tests__/qbTakeoverConstants.test.js`; `test/qb-mirror.test.mjs`

#### CR-28 · Season-totals absence classification
- **Invariant:** `'D'` only in a played team-week; 2016+, a week the weekly roster lists is `'D'` only if rostered ACT/INA/RES/PUP, else `'X'`.
- **App:** `src/utils/durabilitySignals.js` (`classifyInjurySeason`)
- **Data:** `lib/absence.mjs` (`classifyAbsences`); `lib/durabilityMirror.mjs`
- **Tests:** `test/durability-mirror.test.mjs`; `test/absence.test.mjs`

#### CR-29 · Data-store transport
- **Invariant:** Manifest read raw-first; family files read from `VITE_DATA_STORE_URL` first, raw GitHub on HTTP error/timeout/parse error; jobs purge every family path, never the manifest.
- **App:** `src/api/dataStore.js` (`rawManifestUrl`, `loadManifest`, `rawBaseUrl`, `tryDataStore`)
- **Data:** `scripts/purge-cdn.mjs` (`purgeAndVerify`)
- **Tests:** `test/purge-cdn.test.mjs`; `src/api/dataStore.test.js`

#### CR-30 · Season-totals cache revision
- **Invariant:** An in-place rewrite of a completed season-totals file ships with a `SEASON_TOTALS_CACHE_REVISION` bump, pushed after its purge verifies.
- **App:** `src/api/sleeperStats.js` (`SEASON_TOTALS_CACHE_REVISION`)
- **Data:** `scripts/migrate-absence-role.mjs` (`migrateAbsenceRole`); `scripts/purge-cdn.mjs` (`purgeAndVerify`)
- **Tests:** `src/api/sleeperStats.test.js`
