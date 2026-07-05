# Codebase + Data Audit — Cross-Repo Findings (Axes A–F)

**Date:** 2026-07-05 (planning session — audit substrate only; no source edits in either repo)

**Resolved HEADs (session-start discipline):**
- **App** `sleeper-dashboard`: `ae529f56a05f30fcf78e10f3bacc200b98a50a6d` = `origin/main` (verified via GitHub MCP `list_commits`; working tree clean). HEAD commit is *today's* "feat: team context loader and join".
- **Data** `sleeper-dashboard-data`: `a817d45b4a293728a53b7041698a00dbaa10f7dc` = `origin/main` (verified via GitHub MCP `list_commits`; working tree clean).

**Read method:** Both remote heads were resolved via the GitHub MCP and confirmed byte-identical to the clean local clones (`git rev-parse HEAD origin/main` equal on both). Data-repo claims below were verified against the local clone *at the MCP-verified SHA* — provably identical to live source. Every claim carries an exact file/line or asset-path anchor so a human can re-check it against the data repo directly.

**Out of scope (per task):** the projection-engine mechanism and its factor stack — assessed in `.claude/tasks/projection-model-assessment.md`; not re-audited here. Docs-vs-code drift is flag-only (axis F) — no doc corrections in this session.

---

## Top findings (global severity order)

| # | Finding | Axis | Severity | Disposition |
|---|---|---|---|---|
| 1 | Entire `ktcHist*` factor family + Explorer KTC Δ silently dead: app can never load any KTC snapshot because all are `inProgress: true` and `tryDataStore` rejects `inProgress` | A/C | **High** | fix-now |
| 2 | Two Monday KTC captures never ran (2026-05-25, 2026-06-08) — permanently lost weeks; no missed-cron detection exists | B | **High** | capture-gap-urgent |
| 3 | Projection-snapshot capture is visit-and-manual-import dependent; stalled 05-20→06-05 and 06-22→present; unexported days exist only in one browser's IndexedDB (~1.9-yr TTL) | B | **High** | capture-gap-urgent |
| 4 | Sleeper-native ephemeral fields (`depth_chart_order`, `status`, `injury_status`) have no server-side scheduled capture; `injury_status` is captured nowhere at all | B | **High** | capture-gap-urgent |
| 5 | advstats "capture-only factors in seasonProjection.js" claimed in both repos' docs — never implemented; no advstats keys exist in the 73-key factors contract or in any captured snapshot | E/F | **Med** | drift-route-to-reconcile |
| 6 | `nflverse/advstats/` path violates the documented ad-blocker-safe naming rule (known/parked); ad-blocker users silently lose the panel via graceful-absence | C | **Med** | defer (parked by design) |

Everything else is Med/Low and detailed per axis below.

---

## A. Cross-repo contract integrity

### A1. KTC snapshot `inProgress` semantics break the app's KTC-history loader — HIGH, fix-now
- **Issue:** the data repo deliberately registers **every** `ktc/snapshot-<date>.json` with `inProgress: true` ("current-value marker" — data `CLAUDE.md` Invariant 1/5; `scripts/update-ktc.mjs:212`; also codified in `data-catalog.md` §KTC "Manifest registration"). The app's `tryDataStore` unconditionally returns null for `inProgress` entries (`src/api/dataStore.js:80`). `loadKtcHistory` fetches every snapshot through `tryDataStore` (`src/utils/ktcHistory.js:141-146`) → all fetches null → empty history for every session.
- **Evidence (empirical, data repo):** in `snapshots/2026-06-11.json` and `snapshots/2026-06-21.json`, **every one of 794/803 players** has `ktcHistSampleSize: 0` and `ktcHistConfidence: 'none'`; zero non-null `ktcHistDelta` anywhere. By 06-21 three qualifying KTC snapshots (05-18, 06-01, 06-15) were banked and matched players should show sampleSize 3 / confidence 'low'. The feature has never worked in production.
- **Blast radius:** all 13 `ktcHist*` capture-only factor keys (contract-enforced in `src/__tests__/factorsSchema.test.js:63-66,87-90`) are recorded null in every daily snapshot; `computeKtcRecentDelta` (`src/utils/ktcHistory.js:334`) always null → the Explorer Value-tab ~30-day KTC Δ cell renders empty for everyone. Historical *factor-at-capture-time* values are lost as-scored, but the underlying KTC series is banked in `ktc/`, so the signals are recomputable post-fix — the loss is bounded.
- **Location:** app `src/api/dataStore.js:80`, `src/utils/ktcHistory.js:141`; data `scripts/update-ktc.mjs:209-213`, `manifest.json` (all 5 `ktc/snapshot-*` entries `inProgress: true`).
- **Severity:** high (silent correctness — a documented capture feature records nulls; docs on both sides assume it works).
- **Disposition:** fix-now.
- **Action:** one-line decision needed, either side works: (a) app-side — let the KTC-history path bypass/opt out of the `inProgress` rejection (KTC snapshots are append-only and immutable; the flag is a semantic marker, not a mutability signal), or (b) data-side — register KTC snapshots `inProgress: false` and retire the marker convention. Note `docs/integrations.md` ("skips `inProgress`") and data `CLAUDE.md` (app-read assumption for `ktc/`) both need the follow-up doc pass whichever way it goes.

### A2. Mirrored artifacts and shared constants — verified clean
- `lib/fantasyPoints.mjs` (data) vs `src/utils/fantasyPoints.js` (app): scoring loop is math-identical (skip null multiplier, skip null stat, 2-dp round). One deliberate divergence: data uses `stats?.[key]` (null-tolerant), app uses `stats[key]` (throws on null `stats`). All current call sites guard (`grade-snapshot.mjs:106` passes `rec.stats ?? {}`), so no behavioral risk today. Low; no action (the data-side header comment "keep it identical" is already slightly untrue — fold into the reconcile pass if touched).
- Shared floors byte-equal across repos: `MIN_SCHEDULE_GAMES 200` (app `dataStore.js:130` / data `lib/nflverse.mjs:45`), `MIN_PLAYERGAME_ROWS 3000` (`dataStore.js:145` / `nflverse.mjs:48`), `MIN_TEAMCONTEXT_ROWS 60` (`dataStore.js:164` / `nflverse.mjs:53`), `MIN_ADVSTATS_ROWS 250` (`advStats.js:35` / `nflverse.mjs:35`), `MIN_ROSTER_IDS 1500` (`nflRoster.js:38` / `nflverse.mjs:18`). ✔
- `eraTeam` app (`src/utils/playerTeam.js:32-37`) vs data (`lib/nflverse.mjs:942-947`): identical mappings (LA→STL ≤2015, LAC→SD ≤2016, LV→OAK ≤2019). ✔
- Manifest field contract: app consumes `files[path].{schemaVersion, inProgress, lastModified}`; data emits those + `recordCount` on every entry. Shape agreement ✔ (the *semantic* mismatch is A1).
- Snapshot schemaVersion: app writes v2 (`projectionSnapshot.js:191`); data registers whatever version with a minimal shape check (`register-snapshots.mjs:65-69`, `inProgress: false` ✔); grading prefers envelope `targetSeason` with a v1-only fallback. Agreement ✔.
- season-totals: data writes v3, app `MAX_SUPPORTED_SCHEMA = 3` (`dataStore.js:8`). ✔
- In-basis grading vs "fantasy points computed weekly": `buildInBasisOutcomes` (`scripts/grade-snapshot.mjs:84-116`) dot-products season-summed `stats` — equal to the app's summed weekly dot-products for additive keys (linearity); non-additive `RATE_KEYS` are excluded and surfaced (`excludedRateKeys`/`droppedTerms`). Healthy ✔.

---

## B. Data-pipeline capture integrity (data repo)

### B1. KTC weekly capture: two silently missed Mondays; no dead-man detection — HIGH, capture-gap-urgent
- **Issue:** `weekly-ktc.yml` (cron `17 13 * * 1`) produced no commit at all — not even the "ran, no change" `ktc/last-checked.json` marker — for Mondays **2026-05-25** and **2026-06-08** (`git log -- ktc/`: snapshots 05-18, 06-01, 06-15, 06-23, 06-29 only; 06-23 is a Tuesday, evidently a manual/late catch-up for the missed 06-22). The script distinguishes "ran, identical" from "didn't run" precisely so this is detectable — and nothing watches for it. GitHub scheduled workflows are best-effort and can be skipped with zero trace.
- **Loss:** KTC history is ephemeral (registry row: "irrecoverable before capture"). Two weeks of market history are permanently gone; the `ktcHist*` window (once A1 is fixed) and `data-catalog.md`'s "weekly" coverage claim are both degraded.
- **Location:** data `.github/workflows/weekly-ktc.yml`; `ktc/` directory listing; `git log --oneline -- ktc/`.
- **Severity:** high (permanent capture loss, already occurred twice in 7 weeks).
- **Disposition:** capture-gap-urgent.
- **Action:** add missed-run detection — e.g. a cheap scheduled check (or a step in any other weekday Action) that fails red when `today − max(ktc/snapshot-*)` exceeds 8 days, and/or enable workflow-failure notifications; consider a second-chance cron later the same day.

### B2. Projection-snapshot capture: manual cadence stalled; unexported days at risk — HIGH, capture-gap-urgent
- **Issue:** `snapshots/` holds 2026-05-19 then 2026-06-06→06-21 (17 files, all manifest-registered ✔) and **nothing since 06-21** (14 days as of this audit). There are two stalls: 05-20→06-05 (no snapshots produced at all) and 06-22→present (produced-but-unimported at best). The capture chain requires (a) the user opening the app that UTC day (snapshot written to IndexedDB), and (b) a manual export-ZIP → `bin/import-snapshot.mjs` run. Days with no app visit are lost outright; days banked only in IndexedDB survive in exactly one browser profile with a ~1.9-year TTL (`projectionSnapshot.js:229-232`) and die with a cleared cache/machine loss.
- **Note:** the 06-20 settled-not-null write gate (`shouldWriteProjectionSnapshot`) does **not** explain the stall — 06-20/06-21 snapshots exist post-gate, and the gate's conditions (`projectionSnapshot.js:260-276`) are satisfiable offseason. The dependency is human cadence.
- **Location:** data `snapshots/` listing + `manifest.json`; app `src/utils/projectionSnapshot.js`, `bin/import-snapshot.mjs` (imports `snapshots/` entries only).
- **Severity:** high (each unvisited/unexported day of `depth_chart_order`/`status`/KTC-at-observation is unreconstructable).
- **Disposition:** capture-gap-urgent.
- **Action:** immediate — run an export + `bin/import-snapshot.mjs` now to bank 06-22→07-05 whatever exists in IndexedDB; structural — reduce dependence on daily visits/manual import (see B3, which would supersede most of this exposure server-side).

### B3. Sleeper-native ephemeral player state has no scheduled capture — HIGH, capture-gap-urgent
- **Issue:** the projection's actual ephemeral inputs come from Sleeper's `/players/nfl` map: `depth_chart_order` (feeds `depthMap` → `depthFactor`), `status`, and `injury_status`. Today they are captured **only** inside app-visit snapshots (see B2). `injury_status` (Questionable/Doubtful/Out/IR designation) is captured **nowhere** — `buildPlayersBlock` records `status` but not `injury_status` (`projectionSnapshot.js:85-92`), and `enrichment/injuries.json` is an empty scaffold (0 entries; catalog: "the manual path demonstrably doesn't fill them"). The data repo already fetches Sleeper server-side (`lib/sleeper.mjs`; one-time `raw/-players-nfl.json` dump exists as precedent), so a weekly players-state capture is cheap and entirely within existing infrastructure.
- **Mitigating context:** nflverse publishes archived `depth_charts` and `injuries` datasets (reconstructable later, weekly grain), which caps the loss for *team-level* depth and *official* injury reports — but Sleeper's own `depth_chart_order` is the input the projection consumes, and its history is reconstructable-only-going-forward.
- **Location:** data repo (no ingest exists — gap); app `src/utils/projectionSnapshot.js:85-92`; registry `docs/signal-registry.md` §3C (lists "injury designation" as unused/candidate with no capture path).
- **Severity:** high (permanent, ongoing loss of the highest-value ephemeral family the registry itself names).
- **Disposition:** capture-gap-urgent.
- **Action:** plan a small `sleeper players-state` ingest slice (weekly Action, content-hash dedup, per-date or per-week file keyed by `sleeper_id`, capturing `team`/`status`/`injury_status`/`depth_chart_order`); tag the registry row when it lands.

### B4. Manifest ↔ disk reconciliation — clean
- All 164 `manifest.json` entries exist on disk (including the 14 legacy `raw/` dumps — initially suspected phantom, verified present). No served-but-unlisted assets except the two run-marker files (`ktc/last-checked.json`, `nflverse/last-checked-roster.json`), which `data-catalog.md` explicitly exempts as "run markers, not data". `data-catalog.md`'s coverage reconcile block matches the manifest verbatim (advstats/gamelogs/teamcontext 2012–2025; roster 2016–2026; schedule 1999–2026). ✔ — but see F5/F6 for two wording conflicts this surfaced.

### B5. Known holes — states confirmed
- **advstats + gamelogs 2019/2025:** filled by B1 (2026-07-03); verified on disk *and* in manifest (`nflverse/gamelogs/2019.json` recordCount 5756; `nflverse/advstats/2019.json` recordCount 500) with the provenance split honestly documented in `data-catalog.md`. Closed ✔ (app-doc drift remains — F1).
- **roster 2012–2015:** documented-absent (below `MIN_ROSTER_IDS`; catalog §nflverse rosters, backlog slice §6). Honest hole ✔.
- **college pre-2017:** upstream-exists/unbackfilled (catalog, audit B18). Honest hole ✔.
- **season-totals 2025:** settled to `inProgress: false` on 2026-06-26 (manifest). Consistent with the grading calendar-block (~Jan 2027 for 2026 outcomes) ✔ — registry note is stale (F3).
- **KTC quarantine / Spearman guard:** implementation healthy — threshold 0.90 with empirical calibration, `KTC_MIN_OVERLAP 100`, baseline = last *good* snapshot (quarantine dir not scanned), guard skipped on dry-run/first-run, quarantine preserves data unregistered, and the workflow turns CI red *after* the commit step persists the quarantine file (`weekly-ktc.yml` step order ✔). Never tripped to date (`ktc/quarantine/` doesn't exist — created on demand). ✔
- **Cadence design:** the seven weekly Actions are day-staggered (Mon KTC / Tue roster / Wed playerids / Thu advstats / Fri schedule / Sat gamelogs / Sun teamcontext) with rebase-retry pushes, and all five season-keyed purge steps correctly use `steps.fetch.outputs.season` (never `date -u +%Y`) — the calendar-vs-season purge fix is landed and uniform ✔. The PR-CI smoke subset omits roster/draft/schedule/teamcontext dry-runs — a documented chosen scope (teamcontext commit message), not a gap.
- **Low:** `exportData.js` `classifyKey` labels the app's `ktc-values` cache as `ktc/snapshot-<export-date>.json` in the export ZIP — the date is the export day, not the scrape day (`src/utils/exportData.js:22-25`). Dormant (importer copies only `snapshots/`), but a mislabeled-provenance trap if anyone hand-copies from a ZIP. Disposition: defer; note in the reconcile pass.

---

## C. App data layer

### C1. Team-context loader + join helper — verified correct
- Cache identity: `nfl-teamcontext/<year>` per season with the TEAM-keyed `teams` object inside; row identity `(team, week)` resolved via `getTeamSeasonRows`/`getTeamWeekRow` — not forced through player-keyed helpers ✔ (`src/api/teamContext.js:86-111,121-135`).
- Floor triple-enforced (validator at `tryDataStore` boundary, cache-hit re-check, post-fetch re-assert) ✔; explicit-season signature (no probe) ✔; graceful empty shape with `complete` flag ✔; loader-only (no consumer yet) confirmed — `App.jsx` has no `loadTeamContext` reference ✔.
- `playerTeam.resolvePlayerTeam` is the declared single player→team resolution point; its one real consumer today is `outlookPositionStats.js` (view-only) ✔. Note: the NFL-stats game-log join (`nflStats.js` `buildGameLog`) predates it and takes the per-season team directly from callers (normalize-only, no `eraTeam`) — verified numerically equivalent because the season-totals domain is already era-accurate and `eraTeam` is an identity on it; not a correctness risk, just a second path to keep in mind if the join contract ever changes. Low; no action.

### C2. Freshness (`lastModified`-inside-data-record) convention — works; two conventions coexist
- All six nflverse loaders store the manifest `lastModified` **inside** the cache record and compare against the manifest on hit (spot-verified `advStats.js:56`, `teamContext.js:87`; pattern documented for roster/draft/schedule/gamelogs). Correct ✔.
- `sleeperStats.js`/`cfbd.js` use the *other* convention — the cache-record **meta** field `sourceLastModified` via `setCacheWithMeta` (`sleeperStats.js:113-152`, `cfbd.js:45-66`). Both correct; the split is a maintenance wart, not a bug. The nflverse loaders pass `{}` as meta, so `sourceLastModified`/`sourceSchemaVersion` are null for them; `sourceSchemaVersion` is **written but never read anywhere** (see E3 dead code).
- Nuance (low): "permanent" TTL is 999999 min ≈ 1.9 years — fine for loaders (silent refetch), but it is the survival horizon for unexported projection snapshots in IndexedDB (feeds B2).
- Nuance (low): the manifest is memoized in-module for the whole session (`dataStore.js:11,60`); the 60-min IDB TTL only matters across sessions. A tab left open across a weekly Action won't see new data until reload — acceptable SPA behavior; no action.

### C3. CORS / ad-blocker filename convention — one known violation, parked — MED, defer
- The data repo's rule: served paths avoid `adv`/`ad`/`ads`/`analytics`/`tracking` tokens (`data-catalog.md:11-13`). `nflverse/advstats/<year>.json` violates it and is explicitly parked ("do not propagate the pattern", catalog §nflverse advanced receiving). App-side consequence: for ad-blocker users the fetch is blocked and the loader's graceful-absence hides it (panel silently renders nothing; one `logOnce` in console). Display-only surface, so severity stays medium.
- **Action:** keep parked per the documented decision; if the panel's silent absence ever matters, a rename slice (`nflverse/recshare/` or similar) with a manifest alias window is the shape of the fix. All newer families (schedule/gamelogs/teamcontext) comply ✔.

### C4. jsDelivr purge discipline — healthy
- Workflow purges: manifest first, then exactly the changed season-keyed file, season sourced from `setStepOutput` ✔ (all five season-keyed workflows). Manual sessions covered by the data `CLAUDE.md` end-of-session sequence (purge exactly the changed files, manifest first) ✔. No findings.

---

## D. Display vs scoring decoupling

**Verdict: no coupling leak found in either direction.**

- Pipeline → view-only imports: grepped all 15 projection/scoring modules (`seasonProjection`, `dynastyScore`, `projectionSignals`, `momentum`, `regressionSignals`, `utils/teamContext`, `usageMetrics`, `efficiencyMetrics`, `compsIntegration`, `careerComps`, `teamRzShare`, `durabilitySignals`, `ageCurve`, `ktcHistory`, `relevance`) for imports of `seasonRanks`/`outlook*`/`nflStats`/`playerTeam`/`api/{advStats,nflSchedule,nflGameLogs,teamContext}` — zero hits (only a coincidental parameter named `playerTeam` in `teamRzShare.js:121` and a comment in `efficiencyMetrics.js:31`). ✔
- Reverse direction: view modules read scoring *outputs* (allowed) — e.g. `outlookPositionStats` reuses `efficiencyMetrics.passerRating` (pure fn, safe direction); no scoring path consumes a display-only transform. `App.jsx`'s `advStats` state feeds only component props (lines 168/877/1026), never a pipeline memo ✔.
- Guard tests exist and are structurally sound: `advStatsViewOnly`, `scheduleViewOnly`, `gameLogsViewOnly`, `teamContextViewOnly`, `outlookPositionStatsViewOnly` — import/name-regex checks over an explicit PIPELINE list, both directions for the newest family (`teamContextViewOnly.test.js:26-47`).
- **Structural notes (low, defer):** (a) the PIPELINE list is manually curated — a future scoring module missed from the list is a silent hole (the list header says as much); (b) enforcement is import-based — data could still reach scoring via `App.jsx` props without any banned import; the real backstops are the factors-contract test and the capture-only invariant. Worth remembering, not worth new machinery now.

---

## E. Signal & code inventory reconciliation

### E1. Captured-but-dormant map (with activation gates)

| Item | Where banked | Activation gate | Disposition |
|---|---|---|---|
| `ktcHist*` (13 keys, capture-only) | factors in daily snapshots — **currently all-null (A1)** | fix A1, then grading/backtest | fix-now (A1), then dormant-parked |
| `adot*`, `positionMultiplicity*`, rookie `breakoutAgeFactor` (capture-only factors) | factors in daily snapshots (verified present in the 73-key set) | grading — calendar-blocked until 2026 outcomes (~Jan 2027) | backtest-gated |
| `isTeamChange`/`prevTeam`/`newTeam`/`depthStale` (additive factors) | daily snapshots | grading consumers | dormant-parked |
| nflverse advstats served family | `nflverse/advstats/2012–2025` + Profile panel (view-only) | backtest (`bin/backtest.mjs` shipped; `backtests/` holds zero persisted runs) — activation parked per findings doc | dormant-parked |
| nflverse gamelogs loader | `src/api/nflGameLogs.js` — loader-only, no consumer | Outlook game-log slice (planned) | dormant-parked |
| nflverse teamcontext family + loader + `playerTeam` join | `nflverse/teamcontext/2012–2025` + `src/api/teamContext.js` (landed today, loader-only) | projection-engine refactor (its own task) | dormant-parked |
| `teamDepthCharts` snapshot envelope | daily snapshots | grading context | dormant-parked |
| enrichment `scheme`/`injuries`/`notes` | empty scaffolds (0 entries each) | manual path demonstrably doesn't fill them (catalog); injuries superseded by audit B5 route | defer (decide keep-vs-retire in the enrichment slice) |

### E2. Registry reconciliation (`docs/signal-registry.md`) — one substantive miss, several stale cells
- **Registered-but-absent (substantive):** registry §3A advstats row and data `CLAUDE.md` contract row both state advstats metrics are "recorded as capture-only factor in `seasonProjection.js` (WR/TE)". **False** — no `targetShare`/`airYardsShare`/`wopr`/`racr` key exists in `seasonProjection.js`, in the `factorsSchema.test.js` 73/51-key contract, or in any captured snapshot (verified against `snapshots/2026-06-21.json`: zero advstats-like factor keys). Since advstats are reconstructable per-season, nothing is permanently lost — but the registry is asserting a capture that doesn't happen. Severity: med. Disposition: drift-route-to-reconcile (correct the two doc rows); whether to *actually* wire the capture-only factors is a separate, backtest-gated decision (advstats activation is parked).
- **Captured-but-unregistered:** none found — teamcontext row was added in today's commit ✔; all served families have rows ✔.
- **Stale registry cells (flag-only → F3):** CFBD "data-store files are 2017–2024 until the data repo materializes 2025" (2025 files exist on disk *and* in manifest since 06-27); "NFL season-totals 2025 still `inProgress: true`" (false since 06-26); KTC "weekly Monday snapshots thereafter" (two Mondays missing — see B1).
- **Functionally-false-until-fixed:** the `ktcHist*` registry rows describe recorded signals; in practice every recorded value is null (A1). Reconcile after the fix.

### E3. Dead code (dead-safe-to-remove)
- `getPointsBreakdown` (`src/utils/fantasyPoints.js:25-39`): zero consumers outside its own tests; its comment claims "Used by the debug panel" — no such panel exists (the debug panel is cache-clear buttons, `docs/integrations.md` §Debug panel). Low. dead-safe-to-remove (keep the test-covered `getCategoryPoints` — it is live via `seasonProjection.js:12,423`).
- `sourceSchemaVersion` cache-meta field (`src/utils/cache.js:51,64`): written by `sleeperStats.js`/`cfbd.js`, read nowhere. Low. dead-safe-to-remove (or start consuming it; today it's inert).
- No other unreachable/unused modules found: `invalidateManifest` (ClearCacheButton), `getCacheRecord` meta path (sleeperStats/cfbd), `RATE_KEYS` (grade-snapshot), `spearmanRho`/`ktcOrderingGuard` (update-ktc + tests) all live ✔.

---

## F. Docs-vs-code drift signals (flag-only — route to the docs-drift reconcile workflow; no corrections in this session)

| # | Drift | Location | Disposition |
|---|---|---|---|
| F1 | "2019 absent upstream → graceful empty" / "live on the CDN for 2012–2024; 2019 absent upstream — a known gap" — stale since B1 filled 2019+2025 on 2026-07-03 (CDN is 2012–2025 complete) | app `CLAUDE.md:76` and `CLAUDE.md:187` (gamelogs bullet + contract row); `docs/integrations.md` §nflGameLogs ("Live on the CDN for 2012–2024; 2019 is absent upstream") | drift-route-to-reconcile |
| F2 | "Manifest entries … ship at `schemaVersion: 2`. `dataStore.js` advertises `MAX_SUPPORTED_SCHEMA = 2`" — actual is v3/3 | `docs/integrations.md:213` (§Schema versions (Phase 5)) | drift-route-to-reconcile |
| F3 | Registry coverage-table stale cells: CFBD "data-store files 2017–2024" (2025 exists); season-totals-2025 "still inProgress: true" (false since 06-26); KTC "weekly Monday snapshots thereafter" (two missed) | app `docs/signal-registry.md:20-23` | drift-route-to-reconcile |
| F4 | advstats "recorded as capture-only factor in seasonProjection.js (WR/TE)" — never implemented (see E2) | app `docs/signal-registry.md` §3A advstats row; data `CLAUDE.md` §Cross-repo contracts, "nflverse advstats" row | drift-route-to-reconcile |
| F5 | Invariant wording: "Every script-written file must be registered" vs the two deliberately-unregistered run markers (`ktc/last-checked.json`, `nflverse/last-checked-roster.json`) which `data-catalog.md` exempts | data `CLAUDE.md` Invariant 3 vs `data-catalog.md` §Non-served artifacts | drift-route-to-reconcile |
| F6 | "Non-served artifacts (no manifest entries…): `raw/` …" — the 14 `raw/` files **are** manifest-registered | data `data-catalog.md:191-196` | drift-route-to-reconcile |
| F7 | `getPointsBreakdown` comment claims a "debug panel" consumer that doesn't exist | app `src/utils/fantasyPoints.js:23-24` | drift-route-to-reconcile (or dies with E3 removal) |
| F8 | `lib/fantasyPoints.mjs` header "keep it identical to the app" vs the deliberate `stats?.[key]` divergence (A2) | data `lib/fantasyPoints.mjs:8` | drift-route-to-reconcile |
| F9 | `docs/integrations.md` KTC-history section describes `tryDataStore` fetching that "skips inProgress" without noting all KTC snapshots are inProgress — will need rewriting as part of the A1 fix, whichever side changes | app `docs/integrations.md` §Historical KTC signals | drift-route-to-reconcile (after A1) |

---

## What was checked and found clean (for completeness)

- Manifest ↔ disk: 164/164 entries present; no phantoms; only documented run-markers unlisted (B4).
- All five shared sparsity floors + `eraTeam` byte-equal across repos (A2).
- Snapshot v2 envelope agreement (writer ↔ registrar ↔ grader); season-totals v3 ↔ `MAX_SUPPORTED_SCHEMA=3` (A2).
- In-basis grading math (linearity + rate-key exclusion) (A2).
- KTC Spearman/quarantine guard implementation and workflow step-order (B5).
- Season-keyed CDN purge fix landed uniformly across all five season-keyed workflows (B5/C4).
- Team-context loader cache identity, floors, graceful shapes; loader-only status (C1).
- Display/scoring decoupling in both directions, including guard-test coverage (D).
- Signal registry has rows for every served family incl. today's teamcontext (E2).
- `data-catalog.md` coverage cells reconcile against `manifest.json` verbatim (B4).

## Suggested spawn order for follow-up task files (not implementation steps)

1. A1 fix decision + slice (app-or-data side) — unblocks the only silently-broken *active* feature.
2. B2 immediate bank (export + import today's IndexedDB snapshots) — zero-design, pure loss-stopper.
3. B3 Sleeper players-state ingest slice (weekly Action) — permanently closes the biggest ephemeral gap and de-risks B2 structurally.
4. B1 missed-cron dead-man check.
5. Docs-drift reconcile batch (F1–F9, incl. E2's registry rows).
6. E3 dead-code removal (bundle with any nearby slice).
