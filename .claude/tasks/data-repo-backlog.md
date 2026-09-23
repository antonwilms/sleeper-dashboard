# Data-repo backlog — asks discovered from the app side

**What this is.** A running list of work that belongs in `sleeper-dashboard-data`, discovered while
building in **this** repo. The app repo cannot edit the data repo, so these accumulate here and are
executed in one batch rather than interrupting app slices.

**Decision (Anton, 2026-08-21):** batch these and do them **after dp-v2 Slice 7**, unless an item is
**truly blocking** — meaning an app slice cannot ship a correct result without it. Nothing currently
listed is blocking; each is either cosmetic or gates a feature that was deliberately cut rather than
shipped broken.

**How to use it.**
- **Appending** is part of every slice's done-definition. When a slice discovers a data-repo ask,
  add a row *in the same change*, with the commit that found it.
- **Do not fix these from the app repo.** If an app-side workaround exists, it belongs in the slice;
  if it does not, the item is what gets recorded.
- **When the batch runs**, this file is the *input*, not the plan. Each item gets transcribed into a
  proper task file in the data repo's own `.claude/tasks/`, planned under that repo's conventions
  (opus plans → plan-reviewer → sonnet), and then struck through here with its data-repo commit.
- **This is not the cross-repo contract registry.** `docs/cross-repo-registry.md` records *contracts
  that already exist*; this records *work that does not exist yet*. An item here may or may not end
  up touching a `CR-NN` entry — that gets decided when it is planned.

---

## Open

### D-41 · CR-07/CR-18/CR-19/CR-04: live-season RACR column — four registry entries triggered
**Found:** `55e1373` (advstats-live-season-column.md) · **Amended:** `a19b8a8` (racr-completed-target-floor.md) · **Blocking:** no · **Size:** small — four both-repos line additions inside the mirrored region, two-session route

Market's Efficiency set now renders a second RACR column for the live season, beside the existing
completed-season one, view-only throughout. No data-repo file, schema, floor, cadence or manifest
family changes — the obligation is emission only. Re-derive every anchor with `grep -n` on the
post-change tree before applying; the ones below were current as of `a19b8a8`.

**CR-07 · nflverse advstats (view-only): triggered.**
- **App side**, append: `` , `loadAdvStatsForSeason` (exact-year, no fallback) in `src/api/advStats.js`, its `src/App.jsx` call site keyed on `nflState.season` (the live season), and `src/utils/liveAdvStats.js` (`flooredRacr`, the `MIN_TARGETS` floor both RACR columns share, and `usableLiveAdvStats`/`liveRacrCell`, the live column's year check and cell) ``
- **App side**, correct: `src/App.jsx:878` → `src/App.jsx:1001` (`loadAdvStats(currentSeason)`, the post-change completed-season call site).
- **Triggers**, append on the app side: `` , `loadAdvStatsForSeason` in `src/api/advStats.js`, `src/utils/liveAdvStats.js`, the completed read `_eff.racr = flooredRacr(advRow)` (`Market.jsx:645`), and `market/Market.jsx`'s live-season read (`_eff.racrLive` via `usableLiveAdvStats`/`liveRacrCell`) ``
- **Invariant-adjacent sub-fields to name in App side:** the completed and live RACR columns read `components.targets` by name (the `MIN_TARGETS` floor, via `liveAdvStats.flooredRacr`); the live column also reads `components.weeks`, and both rely on their loader result's `year`. A data-side rename of any of these sub-fields silently blanks the affected cells, and CR-07's Invariant currently pins only `components` as a whole. Proposed App-side clause: `` ; the completed and live RACR columns additionally read `components.targets` by name, and the live column also reads `components.weeks` ``
- **Registry-stale, found by the plan gates of advstats-live-season-column.md and racr-completed-target-floor.md (the CR-07 trigger-text and `loadAdvStats`/`MIN_ADVSTATS_ROWS` anchor items are the latter's):** CR-07's trigger text "`market/Market.jsx`'s `advStats?.byId?.[id]?.racr` read" no longer matches source — propose the replacement "`market/Market.jsx`'s completed `RACR` read (`advRow` built with the `year === dataSeason` pin, floored via `flooredRacr`) and live `RACR <season>` read". CR-07 `isValidAdvStats:122` → `:135` (re-verify against live `src/api/dataStore.js` at sync time); CR-07's anchors `loadAdvStats:46` → `:95` and `MIN_ADVSTATS_ROWS … :35` → `:41` (in `src/api/advStats.js`) are also stale. CR-07 does not list the `advStats` pass-throughs at `src/App.jsx:641` (`profileContextValue`, deps `:648`) and `src/App.jsx:1282` (Market prop); the second of these now has an `advStatsLive` sibling at `:1283`. CR-04 `getManifestEntry:65` → `:66` (re-verify against live `src/api/dataStore.js`).
- **Data-side awareness (no data change):** the live season's advstats file now drives a visible column. The `MIN_ADVSTATS_ROWS` writer gate is load-bearing for it: the column stays hidden until the writer first clears 250 rows, and it updates through `lastModified`. Because the live loader opts in to `allowInProgress` (`src/api/advStats.js`'s `loadAdvStatsForSeason`), the `inProgress: false` convention is **not** load-bearing for visibility. Either flag value renders.

**CR-18 · Signal registry rows: triggered.** This slice edited the Current-use cell at
`docs/signal-registry.md:55` (app-owned; the edit itself is the app side). Nothing owed data-side
beyond awareness — see CR-18's existing Mirror text for what a future data-side ingest change to this
family owes.

**CR-19 · Market Efficiency stat keys: triggered** (no Sleeper stat key added/read/removed; emitted
for completeness per the Mirror). This slice's row-memo additions shift `Market.jsx`'s existing
anchors: `dropbacks:628`, `sackPct:629`, `ayPerAtt:630`, `yac:637`, `btkl:638`, `drops:651`
(re-derive with `grep -n` at sync — these drift on every subsequent Market.jsx edit).
`usageEfficiency.js`'s `METRIC_META` anchors do **not** shift — the new `racrLive` entry was added
last, after `drops`, by design.

**CR-04 · Manifest contract: triggered.** `loadAdvStatsForSeason` is a new `allowInProgress: true`
opt-in, the third after KTC's and `loadCurrentSeasonTotals`'s — the "genuinely incomplete family"
case the Mirror already permits (a live advstats file really is unfinished). Proposed sentence for
CR-04's Mirror: `` A third `allowInProgress: true` opt-in exists since advstats-live-season-column.md — `loadAdvStatsForSeason` (CR-07), the live-season exact-year advstats read; same genuinely-incomplete case as season-totals, so a future `inProgress: true` on the live advstats file would still render. ``

### D-34 · CR-10: add `OffencesOwned.jsx`'s new `loadTeamContext`/`getTeamWeekRow` call site to the mirrored App side / Triggers lists
**Found:** `eb72127` (weekly-decision-2-panels.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

`src/hooks/useWeeklyDecision.js` (`:251`) adds a NEW `loadTeamContext` call site keyed on the LIVE season (`nflState.season`, not `dataSeason` — a deliberate exception to every other consumer's keying, documented in the hook's own header), feeding `src/components/week/OffencesOwned.jsx`. That component is also the family's first WEEK-GRAIN reader — `getTeamWeekRow` (`api/teamContext.js:135`), called at `OffencesOwned.jsx:55` — where every prior consumer reads season-level aggregates only.

**Proposed text**, to be inserted into CR-10 verbatim once the sync runs:
- **App side**, append: `` , `src/hooks/useWeeklyDecision.js`'s `/week`-scoped `loadTeamContext(season)` call (live-season-keyed, not `dataSeason`) and `src/components/week/OffencesOwned.jsx` ``
- **Triggers**, append: `` , and `src/components/week/OffencesOwned.jsx:24,49,52,55` (`getTeamSeasonRows`, `buildTeamMetricsTable`, `normalizeTeamForSchedule`, `getTeamWeekRow` — the family's first week-grain read) ``

### D-35 · CR-20: add `DefencesFaced.jsx`'s new `computeFpaPerGame` call site to the mirrored App side / Triggers lists
**Found:** `eb72127` (weekly-decision-2-panels.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

`src/components/week/DefencesFaced.jsx:27-28` calls the already-exported `computeFpaPerGame(rows, team, pos)` directly, twice per filled starter, against the hook's `priorRows`/`currentRows` — the first render site to show the blend's two source halves unmixed rather than only the blended value `buildFpaTable` returns.

**Proposed text**, to be inserted into CR-20 verbatim once the sync runs:
- **App side**, append: `` , `src/components/week/DefencesFaced.jsx` ``
- **Triggers**, append: `` , and `src/components/week/DefencesFaced.jsx:27-28` (`computeFpaPerGame`, called directly rather than through `buildFpaTable`) ``

### D-36 · CR-21: add `DefencesFaced.jsx`'s `currentRows` read to the mirrored App side / Triggers lists
**Found:** `eb72127` (weekly-decision-2-panels.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

`DefencesFaced.jsx:28` passes the hook's `currentRows` (the same in-progress `currentSeasonTotals.players` read CR-21 already names for `buildFpaTable`) straight into a second, direct `computeFpaPerGame` call — a second in-progress-season read beside `buildFpaTable`'s own.

**Proposed text**, to be inserted into CR-21 verbatim once the sync runs:
- **App side**, append: `` , `src/components/week/DefencesFaced.jsx` (a second, direct read of the same `currentRows`) ``
- **Triggers**, append: `` , and `src/components/week/DefencesFaced.jsx:28` ``

### D-37 · CR-11: add `priorSeasonSnapShare` to the mirrored App side / Triggers lists
**Found:** `eb72127` (weekly-decision-2-panels.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

`src/utils/weeklyUsage.js:135` (`priorSeasonSnapShare`) is a new app-side reader of `off_snp`/`tm_off_snp` off stored prior-season rows, on the basis this entry already lists `outlookUsage.js:62-63` for — a DIFFERENT basis from that existing reader (the player's own `tm_off_snp`, not a summed team denominator), feeding `LineupTable.jsx`'s new grey prior-season SNAP sub-line.

**Proposed text**, to be inserted into CR-11 verbatim once the sync runs:
- **App side**, append: `` , `src/utils/weeklyUsage.js`'s `priorSeasonSnapShare` (`/week`'s prior-season SNAP sub-line, a different basis from `outlookUsage.js`'s) ``
- **Triggers**, append: `` , and `src/utils/weeklyUsage.js:135,139,141` (`priorSeasonSnapShare`, reading `gamesPlayed`/`tm_off_snp`/`off_snp`) ``

### D-38 · CR-16: add `OffencesOwned.jsx`'s `normalizeTeamForSchedule` call site to the mirrored App side / Triggers lists
**Found:** `eb72127` (weekly-decision-2-panels.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

`OffencesOwned.jsx:52` is a new call site of `normalizeTeamForSchedule` (roster team → teamcontext key), on the same basis W2a counted its own new call sites.

**Proposed text**, to be inserted into CR-16 verbatim once the sync runs:
- **App side**, append: `` , `src/components/week/OffencesOwned.jsx` ``
- **Triggers**, append: `` , and `src/components/week/OffencesOwned.jsx:52` ``

### D-39 · Registry staleness found by weekly-decision-2-panels.md's plan gate
**Found:** `eb72127` (weekly-decision-2-panels.md) · **Blocking:** no · **Size:** small — five line-anchor corrections, two-session route

Five items the plan gate found stale, none of them this slice's own change — recorded so the two-session sync can fix them. **Re-derive every anchor with `grep -n` at sync time rather than trusting any of the numbers below**, including this commit's own — the plan gate's numbers are already several commits old by the time this slice's own diff landed (D-30/D-33 hit the identical problem):
- **CR-02**: `sleeperStats.js` anchors have drifted — `:146/147/152/112` at plan-gate time (2026-09-21).
- **CR-02**: unlisted callers — `Market.jsx:454,458`, `UsageEfficiencySection.jsx:24,28`, `App.jsx:230,243`.
- **CR-10**: `App.jsx` anchors have drifted — `:1009/637` at plan-gate time; `loadTeamContext`'s call site is `:1018` as of this commit's own HEAD, so even the plan gate's "now" values are already stale.
- **CR-10**: an unlisted Portfolio consumer — `Portfolio.jsx:348-350` is now `TeamOffences.jsx` (the render moved into its own file).
- **CR-20**: `Teams.jsx` anchors have drifted — `:151,157` at plan-gate time; `buildFpaTable`'s call site is `:161` as of this commit's own HEAD.

### D-40 · `teamcontext/2026.json` absent at smoke — Offences you own ships empty
**Found:** `eb72127` (weekly-decision-2-panels.md, fix pass 1, item 1.7) · **Blocking:** no · **Size:** n/a — no app-side action, informational

`nflverse/teamcontext/2026.json` is absent from the store as of `eb72127`. `/week`'s "Offences you own" panel (`OffencesOwned.jsx`) correctly renders its documented empty state (`liveTeamContext.complete === false`) rather than erroring or showing a zero row — this is the graceful-absence path §4 specifies, not a bug. The panel fills on its own once the file lands; nothing here changes when it does.

### D-28 · CR-08: add `weeklySchedule.js`'s `buildRegWeekIndex` to the mirrored App side / Triggers lists
**Found:** `134acd0` (weekly-decision-2a-lineup-truth.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

`src/utils/weeklySchedule.js` (`buildRegWeekIndex`, `src/utils/weeklySchedule.js:12`) is a new reader of the served `gameType`/`homeTeam`/`awayTeam`/`week` fields — the third app-side reader, on exactly the basis `buildSosTable` (`strengthOfSchedule.js`) was already listed as the second. It also makes `/week` a consumer of `App.jsx`'s second `loadNflSchedule` call site (the `sosSeason` load), which until now fed only Portfolio's SOS column.

**Proposed text**, to be inserted into CR-08 verbatim once the sync runs:
- **App side**, append: `` , `src/utils/weeklySchedule.js`'s `buildRegWeekIndex` (the `/week` route's schedule index, read-only) ``
- **Triggers**, append: `` , and `src/utils/weeklySchedule.js:12` (`buildRegWeekIndex`, reading `gameType`/`homeTeam`/`awayTeam`/`week`) ``

### D-29 · CR-21: add `deriveStoreLag`/`maxDefGamesPlayed` to the mirrored App side / Triggers lists, and propose a Mirror amendment
**Found:** `134acd0` (weekly-decision-2a-lineup-truth.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

§5 reads the live file's DEF-row `gamesPlayed` as a per-team **freshness** signal (`src/hooks/useWeeklyDecision.js`'s `deriveStoreLag`/`maxDefGamesPlayed`) — the same in-progress read CR-21 already names for `buildFpaTable`'s `currentRows`, now put to a new use.

**Proposed text**, to be inserted into CR-21 verbatim once the sync runs:
- **App side**, append: `` , `deriveStoreLag`/`maxDefGamesPlayed` in `src/hooks/useWeeklyDecision.js` (a per-team freshness check against the live schedule, distinct from `buildFpaTable`'s rate use) ``
- **Triggers**, append: `` , and `src/hooks/useWeeklyDecision.js` — `maxDefGamesPlayed` and `deriveStoreLag` both read `currentSeasonTotals.players`' DEF rows' `gamesPlayed` ``

**Also propose this Mirror-text amendment** (the current text becomes partly false for `/week`):

> Current: "…the app has no way to tell." Proposed replacement: "…the app has no way to tell on `/teams` or `/portfolio`; `/week` compares each team's DEF-row `gamesPlayed` against that team's scheduled REG games through Sleeper's completed weeks and states the lag (weekly-decision-2a-lineup-truth.md §5), so a stopped job surfaces there as a lag notice that never clears."

### D-30 · CR-20: re-derive the three `/week` call-site line anchors (D-23's are stale)
**Found:** `134acd0` (weekly-decision-2a-lineup-truth.md) · **Blocking:** no · **Size:** small — line-anchor correction inside D-23's still-pending proposed text

D-23 (below) already asked for `buildFpaTable`/`rankFpaTable`/`isDefenseRowId` call sites in `src/hooks/useWeeklyDecision.js` to be added to CR-20. This slice moved those call sites again (the `isDefenseRowId` call inside `deriveGamesPlayed` became `maxDefGamesPlayed`, and a second `isDefenseRowId` call site was added inside `deriveStoreLag`). D-23's own anchors were already stale at its HEAD per its text; **re-derived against this slice's HEAD with `grep -n`, not shifted from the old numbers**:
- `isDefenseRowId` imported at `src/hooks/useWeeklyDecision.js:3`; called at `:44` (inside `maxDefGamesPlayed`, itself called from both `deriveGamesPlayed` and `deriveStoreLag`) and again directly at `:76` (inside `deriveStoreLag`).
- `buildFpaTable` called at `:231`.
- `rankFpaTable` called at `:237`.

D-23's proposed text should use these anchors, not its original `:37`/`:153`/`:159`, when the sync runs.

### D-31 · CR-16: add `weeklySchedule.js` and `deriveStoreLag` to the mirrored App side, and name `denormalizeTeamForSchedule`
**Found:** `134acd0` (weekly-decision-2a-lineup-truth.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

New call sites: `resolveTeamWeek` (team input, `src/utils/weeklySchedule.js:41`), `buildRegWeekIndex` (schedule codes, `:16-17`), `deriveStoreLag` (DEF keys, `src/hooks/useWeeklyDecision.js:79`), and `denormalizeTeamForSchedule` for the VS display (`src/utils/weeklySchedule.js:44`) — a schedule ↔ season-totals join, exactly CR-16's Invariant. `denormalizeTeamForSchedule` (`nflStats.js:18`) is itself unnamed in the registry's Triggers today.

**Proposed text**, to be inserted into CR-16 verbatim once the sync runs:
- **App side**, append: `` , `src/utils/weeklySchedule.js` and `src/hooks/useWeeklyDecision.js`'s `deriveStoreLag` ``
- **Triggers**, append: `` , `src/utils/weeklySchedule.js:16-17,41,44` (`buildRegWeekIndex`, `resolveTeamWeek`, and the first Triggers mention of `denormalizeTeamForSchedule`), and `src/hooks/useWeeklyDecision.js:79` (`deriveStoreLag`) ``

### D-32 · CR-02: add `maxDefGamesPlayed`/`deriveStoreLag` to the app-side reader list
**Found:** `134acd0` (weekly-decision-2a-lineup-truth.md) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

§5 moves the `isDefenseRowId` call inside `useWeeklyDecision.js` (now `maxDefGamesPlayed`, `src/hooks/useWeeklyDecision.js:44`) and puts the served DEF rows' `gamesPlayed` to a new use: a per-team freshness signal (`deriveStoreLag`, `:65`). `isDefenseRowId` is a named CR-02 Trigger.

**Proposed text**, to be inserted into CR-02 verbatim once the sync runs:
- **App side**, append: `` , `maxDefGamesPlayed`/`deriveStoreLag` in `src/hooks/useWeeklyDecision.js` (DEF-row `gamesPlayed` read as a per-team freshness signal, not a rate) ``

### D-33 · Registry staleness found by weekly-decision-2a-lineup-truth.md's plan gate
**Found:** `134acd0` (weekly-decision-2a-lineup-truth.md) · **Blocking:** no · **Size:** small — three line-anchor corrections, two-session route

Three items the plan gate found stale, none of them this slice's own change — recorded so the two-session sync can fix them:
- **CR-21**: its Trigger is `buildFpaTable`'s `currentRows`, but none of the three live call sites that pass it is listed (`src/hooks/useWeeklyDecision.js:231`, `teams/Teams.jsx:163`, `portfolio/Portfolio.jsx:372`).
- **CR-16**: several callers are unlisted (`src/utils/weeklyLineup.js:29`, surviving from W1 in the `unknown`-fallback branch; `opponentStrength.js:88`; `strengthOfSchedule.js:25-26`; `teamExposure.js:22`; `portfolio/Portfolio.jsx:606,851,975`; `teams/TeamDetail.jsx:180,192`).
- **CR-08**: the `loadNflSchedule` anchors have drifted (`App.jsx:1055` and `:1075` as of this commit — re-derive with `grep -n` at sync time rather than trusting any prior line number, including this one).

### D-22 · A stored `TEAM_*` pruning regression would degrade `/week` silently while every stored-path consumer keeps working
**Found:** `24bd916` (Weekly Decision Surface W1 — the lineup route) · **Blocking:** no · **Size:** small — awareness, not a code change

**Corrected 2026-09-21 (fix pass 1, item 1.10) — the original write-up's premise was factually
wrong.** It claimed `Teams.jsx`'s FPA columns, Portfolio's ladder and `buildFpaTable` were
stored-path consumers of `TEAM_*` rows that would degrade if `prunePlayerStats` ever dropped them,
concluding "two live app surfaces now depend on their presence through two different read paths."
**They do not read `TEAM_*` at all.** `isDefenseRowId` is `/^[A-Z]{2,3}$/`
(`src/utils/opponentStrength.js:39`), which `TEAM_CHI` and every other `TEAM_*` key fails;
`src/utils/teamContext.js`'s `isTeamAggregateId` and `src/utils/outlookPositionStats.js` both
*exclude* `TEAM_*` explicitly. Verified: **no stored-path consumer reads `TEAM_*` today — `/week`'s
live-API read (via `getWeeklyStatRows`, `src/utils/weeklyUsage.js`'s `buildTeamAggregates`) is the
only one in the app.**

The actually-interesting observation, which is what W1 §9 asked this item to record: if
`prunePlayerStats` (or any future data-repo change) ever dropped `TEAM_*` rows from the **stored**
`nfl/season-totals/<year>.json`, `/week` would break — its live-API read is the sole consumer — while
every stored-path FPA/ladder consumer keeps working unaffected, since none of them reads that row
shape. That makes the breakage **harder** to notice, not easier: the surfaces a data-repo engineer
would normally check for a `TEAM_*` regression (`Teams.jsx`, Portfolio's ladder) would look
completely fine.

This is still not a Mirror obligation — CR-20's invariant covers the store, not the live API, so a
data-repo change cannot break `/week` by itself, and no action is needed unless `prunePlayerStats`
(or an equivalent) is ever proposed. At that point, check that it does not silently drop `TEAM_*`
rows, on the understanding that `/week` alone — not two surfaces — depends on their presence.

### D-23 · CR-20: add the three `/week` call sites to the mirrored App side / Triggers lists
**Superseded by D-30 (anchors re-derived at 134acd0) — do not apply D-23's proposed text.**
**Found:** `weekly-decision-1-lineup.md` fix pass 1 (app, item 1.9) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

W1's fix pass 1 corrected §9's claim that CR-20 was untriggered — by the registry's own trigger
format, a call site *is* the trigger, the same basis CR-20 already uses for
`teams/Teams.jsx:151,157` and `portfolio/Portfolio.jsx:370,375,377`.
`src/hooks/useWeeklyDecision.js` adds a third `buildFpaTable`/`rankFpaTable` call site and the first
`isDefenseRowId` consumer outside `opponentStrength.js` itself. A repo-scoped session cannot write
`docs/cross-repo-registry.md`'s mirrored region (CR-24 byte-identity), so this is recorded here for
the two-session route (app emits this text → data repo applies it → data repo syncs the mirrored
region with the line-anchored diff) rather than edited directly.

**Proposed text**, to be inserted into CR-20 verbatim once the sync runs:
- **App side**, append: `` , `src/hooks/useWeeklyDecision.js` (the `/week` route's own `buildFpaTable`/`rankFpaTable` call and its `isDefenseRowId` use in the `n`-derivation) ``
- **Triggers**, append (same clause) after the existing `portfolio/Portfolio.jsx:370,375,377` mention: `` , and `src/hooks/useWeeklyDecision.js` — `isDefenseRowId` imported at `:3`, called at `:37` (inside `deriveGamesPlayed`); `buildFpaTable` called at `:153`; `rankFpaTable` called at `:159` ``

No other part of CR-20 changes — the **Data side**, **Invariant**, **Direction** and **Mirror**
fields are all still accurate as written; this is purely a Triggers/App-side naming gap the new
call site opened.

### D-21 · CR-21: add `FPA_PRIOR_DROP_GAMES` to the mirrored App side / Triggers lists
**Found:** `51b1d3d` (Weekly Decision Surface W0 — points-allowed blend k=3 app-wide) · **Blocking:** no · **Size:** small — one both-repos line addition inside the mirrored region, two-session route

W0 (`.claude/tasks/weekly-decision-0-k3-blend.md` §6) changed `src/utils/opponentStrength.js`'s
`blendFpaPerGame` to drop the prior season entirely once a defense has played
`FPA_PRIOR_DROP_GAMES = 9` current-season games, returning `current.rate` unblended rather than a
shrunk blend. CR-21 ("In-progress season-totals reads") already names `buildFpaTable`'s `currentRows`
parameter in both its **App side** and **Triggers** lists, because that parameter is exactly the
in-progress read this entry exists to protect — but the new constant, which states precisely how much
of that in-progress file's evidence is needed before the app trusts it alone, is not yet named
anywhere in the entry. A repo-scoped Session 2 cannot write `docs/cross-repo-registry.md`'s mirrored
region (`<!-- CR-REGISTRY-BEGIN -->`/`END`, CI-enforced byte-identical by CR-24's daily
`registry-mirror.yml`), so this is recorded here for the two-session route (app emits this text → data
repo applies it → data repo syncs the mirrored region with the line-anchored diff) rather than edited
directly.

**Proposed text**, to be inserted into CR-21 verbatim once the sync runs:
- **App side**, append: `` , `FPA_PRIOR_DROP_GAMES` in `src/utils/opponentStrength.js` (the current-season games-played threshold at which the prior term is dropped entirely rather than shrunk) ``
- **Triggers**, append (same clause) after the existing `buildFpaTable`'s `currentRows` parameter mention, so a future change to the constant's value is recognized as touching this entry.

No other part of CR-21 changes — the **Data side**, **Invariant**, **Direction** and **Mirror** fields
are all still accurate as written; this is purely a Triggers/App-side naming gap the new constant
opened.

### D-19 + D-20 · Sync `cross-repo-registry.md`'s mirrored region (ten line-pairs)
**Found:** `d2285f8` (Portfolio Slice B) + `d9db09f` (Portfolio Slice D) · **Blocking:** no, but CR-24's daily `registry-mirror.yml` is **red until this lands** — that red is this item, not a flake · **Size:** small — one verbatim copy, then the anchored diff
**✅ RESOLVED 2026-09-20** — data `cf7d1fb` closed it; the `CR-REGISTRY-BEGIN`/`END` span now diffs clean,
so CR-24's daily `registry-mirror.yml` is no longer red on this item. The "Optional wording" note at the
bottom is not part of the sync and stays open.

**App side applied `da3f82b` (2026-09-20).** D-19 and D-20 were two halves of one sync and are merged here; both ids are kept so nothing filed under either is lost.

The two-session route is at its last step. The data repo emitted D-20's corrections, the app has now
applied them (Slice B's own edits landed with `d2285f8`), and what remains is the data repo copying
the mirrored region verbatim and running the line-anchored sentinel diff. **Nothing further is owed
app-side.** Ten line-pairs differ inside the `<!-- CR-REGISTRY-BEGIN -->` / `<!-- CR-REGISTRY-END -->`
span today, and in every one **the app copy is the correct side**:

**From Slice B (`d2285f8`, was D-19) — three pairs, all `Triggers`:**
1. **CR-01** — the sole difference is that the app **dropped** `portfolio/Portfolio.jsx:366-367`.
   That screen was rebuilt lineup-first and has **no `projection` read at all** in live source
   (verified 2026-09-20); the data copy still lists it. This is a deletion to mirror, not an addition.
2. **CR-02** — the app adds three served-row readers: `portfolio/Portfolio.jsx` (the `GAMES` strip /
   `GAMES MISSED` tile via `buildAvailabilityGrid`, `rankPositionSeason` for `POS RANK`,
   `buildTeamShareTotals`/`buildPerSeasonTeamShares` for `SHARE`), `dp/AvailabilityRoleSection.jsx:25`,
   and `hooks/usePlayerProfile.js:80`.
3. **CR-11** — the app adds `portfolio/Portfolio.jsx`'s `buildUsageHistory` call site
   (`SNAP`/`SHARE` columns).

**From Slice D (`da3f82b`, was D-20) — seven pairs:** CR-08 `App side` and `Triggers`, CR-09
`App side`, CR-10 `App side` and `Triggers`, CR-20 `Triggers`, CR-23 `Invariant`. D-20's five facts
stand as originally stated except where live source disagreed with them, which is worth carrying
because this file was the source the data repo would have re-derived from:
- **Teams.jsx's FPA render opens at `:294`, not `:297`** — anchored `:151,157,294-297`.
- **CR-08 has a second `loadNflSchedule` call site**, `App.jsx:1067` — Slice D's forward `sosSeason`
  load into the same `nflScheduleByYear` map. D-20 did not carry it; a `Triggers` entry naming one of
  two call sites is the same defect D-20 exists to fix.
- CR-08's `gameLog.js` reader also touches `result`/`homeScore`/`awayScore` at `:99,103-104`, not only
  the three fields D-20 named.

**How it gets done.** Copy the app's mirrored region verbatim into this repo's root
`cross-repo-registry.md` — the span between the two sentinels only, never the repo-specific framing
outside them — then run `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` with
`../sleeper-dashboard` checked out on `main`. Empty diff = done. **Do not re-derive the app-side
anchors from this file's prose:** they are far-side authority for this repo's reviewer, and every one
was re-derived against live `src/` on 2026-09-20.

**Optional wording, carried forward from D-19 and still unapplied — both are `Mirror` text, so they
are both-repos edits in their own right and are not part of the verbatim copy above:**
- CR-11's Mirror blast-radius sentence may name My Team's `SNAP` column.
- CR-02's Mirror still says `availabilityGrid.js:4` asserts "never emit `'B'`" — that app comment
  was already corrected, so the sentence is stale.

### D-17 · CR-15: version the Step 4 regression mirror
**Found:** `7b5b055` (step4-upside, calibration arc final item) · **Blocking:** no, but blocks any further `--fit`/`--fullpipeline` run that claims to reproduce the app · **Size:** medium
**✅ RESOLVED 2026-09-14** — versioned mirror data `e802e73` (PR #10); the three registry corrections
below closed by app `05882d7` + data `85fd906` (PR #12).

`src/utils/seasonProjection.js`'s Step 4 regression bucket table now gates its up-side (`outlierRatio
< 0.85` → ×1.12/×1.05) to QB only — RB/WR/TE get ×1.00 instead — per
`grading/2026-09-06-fullpipeline-verdict.md` §E and the Session-1 clustered bootstrap in
`.claude/tasks/step4-upside.md` §1.2 (removal ΔMAE: RB −0.019 [−0.038, −0.001], WR −0.033 [−0.046,
−0.019], TE −0.012 [−0.024, +0.001]; QB +0.009 [−0.005, +0.025], and QB's fired rows realise 1.081×
shipped). `lib/projectionFactors.mjs:90-107` (`reconstructRegressionFactor`) mirrors the *old*
ungated table and needs the position gate, but **as a versioned addition, not a deletion** — three
data-side consumers still depend on the legacy table:

1. **Parity test T-F10** (`test/panel-fit.test.mjs` "parity gate") asserts `localRegressionFactorRaw`
   against `test/fixtures/r3fit-parity-2025/snapshot-2026-07-05.slim.json`, captured under the
   legacy (ungated) table — a deleted branch turns it red.
2. **`runStep4Verdict`** (`lib/panel.mjs:1797-1839`) — its "shipped" arm *is* the legacy table;
   re-mirror without a legacy mode and §E degenerates to ΔMAE ≡ 0 at RB/WR/TE and can never be
   reproduced.
3. **R3-FIT reproducibility** — `backtests/2026-08-09-r3fit-{fit,panel}.json` were computed under
   the legacy table.

`reconstructRegressionFactor` needs `position` and a model selector (`{ model: 'legacy' |
'step4-upside' }`); parity against pre-boundary snapshots keeps `legacy`, and the fit/full-pipeline
paths default to the app's current model. The slim parity fixture carries `factors` only with no
position — a new-model parity check needs a post-boundary snapshot plus a position join, and the
app's `regressionUpsideBasis` supplies the position suffix directly. Also add the clustered
bootstrap (Appendix A of `.claude/tasks/step4-upside.md`) to `runStep4Verdict`'s output, so §1.2's
confidence intervals are committed data-side rather than living only in the app-repo task file.

**Also carries three registry corrections deferred from this slice's plan review**
(`.claude/tasks/step4-upside.md` §4.6, §10 flags 4–5), all landing in both repos' registry copies in
the same change:
- ~~**CR-15 prose** (`docs/cross-repo-registry.md`) does not name the Step 4 bucket table or its
  position gate among `seasonProjection.js`'s enumerated elements — add it.~~ **Done** (data SHA
  `e802e73`; R1–R7 applied to `docs/cross-repo-registry.md` per `step4-mirror-version.md` §4.2).
- ~~**CR-01's unlisted consumers**: `PlayerDetailModal.jsx:119-120, :147-152, :275, :299, :580`;
  `MyTeamView.jsx:19`; `App.jsx:602-604`; `usePlayerProfile.js:151`.~~ **Done.**
- ~~**Stale `seasonProjection.js` anchors** in CR-02/CR-13/CR-17: `rec_air_yd` reads now at `:734`/
  `:742`, `resolveAttributedTeam` at `:777`, `computeKtcSignals` at `:596`. Every anchor should be
  recomputed against the landed commit, since this slice shifted them again.~~ **Done** — recomputed
  at `a61d938`: `:748`/`:756`, `:791`, `:602`.
  **Both applied app-side `05882d7` (plus new CR-24, the registry drift check); synced data-side in
  data PR #12, merge `85fd906`, where `test/registry-mirror.test.mjs` + `registry-mirror.yml` now
  enforce byte-identity of the two copies (first `main` run green, 2026-09-14).**

### D-18 · `grading/anchor-policy.md`: fourth model-change date (first veteran-path boundary)
**Found:** `7b5b055` (step4-upside, calibration arc final item) · **Blocking:** no — forward grading
is calendar-blocked to Jan–Feb 2027 — but writing the policy with three dates after this lands
repeats the D-15 failure mode · **Size:** small

`grading/anchor-policy.md` is currently scoped to rookie mechanisms, and its "Veteran-path rows are
unaffected" line becomes false at this commit. Content for the rewrite (`.claude/tasks/step4-
upside.md` §5, verbatim):

1. **Retitle/rescope**: "mechanism-version segmentation" covering both paths.
2. **Row-level detection rule (authoritative), veteran-path rows only.** First scope to rows with
   `projection.confidence !== 'rookie'` (rookie-path rows never carry `regressionUpsideBasis` on
   either side of the boundary, so a presence-only rule would misfile post-boundary rookie rows).
   Within that scope: `factors.regressionUpsideBasis` present → step4-upside model; absent → legacy
   Step 4 table. For fired rows, the suffix names the position and whether the up-side was retained
   or removed.
3. **Date table row 4**: `| 7b5b055 | 2026-09-13 HH:MM UTC (fill in from the commit) | step4-upside
   (veteran path; RB/WR/TE up-side removed, QB retained) |`, and "Three model changes" → "Four".
4. **Expected segments**: the first capture carrying `regressionUpsideBasis` is the first 16:29 UTC
   capture at or after the commit time. Verify against committed snapshots rather than assert, the
   way the existing three rows were.
5. **Replace "Veteran-path rows are unaffected"** with: rookie boundaries 1–3 are rookie-path only;
   boundary 4 is veteran-path only, affects only rows whose basis starts `removed:`, and a pooled
   veteran grade spanning it measures the mechanism change.

### D-14 · Publish the rookie ceiling quantiles in a verdict
**Found:** rookie-ceiling.md (calibration arc slice 3, `41f277e`) · **Blocking:** no · **Size:** small

The `ROOKIE_CEILING` knee (p90) / asymptote (p99) constants are fitted app-side from
`backtests/2026-09-11-rookie-panel.json` `debut.rows`, with the fit living only in
`src/__tests__/rookieCeiling.test.js`. Mirroring the quantile computation into `bin/panel.mjs
--rookie` would let both repos re-derive the same eight numbers independently — closing the same gap
D-9/D-12's own provenance discussion flagged for the calibration and availability fits.

### D-15 · `grading/anchor-policy.md` now has three model-change dates, not two
**Found:** rookie-ceiling.md (calibration arc slice 3, `41f277e`) · **Blocking:** no · **Size:** small

§9.3 item 2 of the calibration-arc review specified two model-change dates (calibration arc slices 1
and 2). This slice (3, the realisation ceiling) is a third: `projectedPPG`/`projectedTotalPts`
themselves change for rookie-path rows from this commit forward, and `rookieCeilingKnee` /
`rookieCeilingAsymptote` are captured on every rookie row specifically so a captured snapshot series
can be segmented by ceiling version from the row itself, without a date-to-model-version lookup
table. Writing `anchor-policy.md` with a stale two-date list is worse than not writing it yet.

### D-16 · A 2026-class debut outcome append, after the 2026 season completes
**Found:** rookie-ceiling.md (calibration arc slice 3, `41f277e`) · **Blocking:** no · **Size:** small, deferred until season end

The 2026 entry class is the first genuinely out-of-sample class for the shipped `ROOKIE_CEILING`
constants — the same re-fit-trap caution the calibration-arc verdict's own §F note applies to slice
1's constants applies here too. Expect the QB asymptote in particular to move; its leave-one-class-
year-out fold spread is 20.50–21.95 PPG on n=50, the thinnest cell in the fit.

### D-9 · Rookie-panel drop breakdown by tier and position
**Found:** rookie-calibration.md (calibration arc slice 1, f07d9be) · **Blocking:** no — does not block, materially improves the next fit · **Size:** small

`assembleRookiePanel` records `drops: { noOutcome: 1507 }` as a single scalar
(`lib/panel.mjs:1852`) — 1,507 of 2,563 assembled rows are dropped by the `gp ≥ 6` outcome gate, and
that gate is certainly not neutral across tiers: a day-3 or undrafted player failing to play six
games is the modal outcome, and a cell like `day3:QB` (n=31, raw ratio 1.10, held at 1.00 in the
shipped constants because it is survivor-selected) is survivor-selected in a way the current artifact
cannot quantify. A per-tier × position drop count would tell us how much, and would either justify or
retire the ≤1.00 clamp on that cell.

### D-10 · Record the app's dependency on `bySleeper.undrafted`
**Found:** rookie-calibration.md (calibration arc slice 1, f07d9be) · **Blocking:** no · **Size:** small

The rookie realisation calibration constants shipped in this slice (`ROOKIE_CALIBRATION` in
`src/utils/seasonProjection.js`) are fitted to exactly the population `nflverse/playerids.json`'s
`bySleeper.undrafted` flag defines — currently derived as `draftRound === null`
(`lib/nflverse.mjs:548`, with a 96.6%/0.2% presence argument in its docstring and a
`MAX_UNDRAFTED_RATE = 0.75` ceiling in `lib/validate.mjs`). If that derivation changes, or the
ceiling starts firing, the app's constants are fitted to a population that no longer exists and this
slice must be re-run — recorded in `docs/signal-registry.md`'s crosswalk row, and here so the data
repo carries the same awareness. Also note: `bySleeper.draftPick` is the within-round pick while
`draft_picks.json`'s `pick` is the overall selection — the two were compared during this slice and
must never be joined on.

### D-12 · A committed rookie availability panel
**Found:** rookie-availability.md (calibration arc slice 2, `ed027c7`) · **Blocking:** no — closes this slice's provenance gap · **Size:** medium

The rookie-availability ladder's constants are fitted on a panel Session 1 assembled from
`nfl/season-totals/*` plus `nflverse/playerids.json`, with no committed artifact behind it — unlike
calibration arc slice 1's SHA-anchored fixture. A `backtests/<date>-rookie-availability-panel.json`
produced by the harness under the app's own routing predicate (walk target seasons forward from
entry year, stop at the first one preceded by a `gamesPlayed ≥ 8` season, skip a row at
`years_exp ≥ 2` on a double-zero-game gap), outcome `gamesPlayed`, **no `gp ≥ 6` gate** (unlike the
PPG panel — this one measures availability itself, so gating on having played would be circular),
would give these constants the same provenance as slice 1's and let the data repo re-fit as seasons
are added. `src/__fixtures__/rookie-games-panel-2026-09-09.json`'s own `source` block is the interim
substitute and is explicitly weaker (see `.claude/tasks/rookie-availability.md` §5 Q5).

### D-13 · A total-points rookie panel, to retire the Q4 residual
**Found:** rookie-availability.md (calibration arc slice 2, `ed027c7`) · **Blocking:** no · **Size:** medium

Calibration arc slice 1's PPG constants are conditioned on a `gp ≥ 6` outcome gate; slice 2's games
constants are unconditional. Multiplying the two overstates expected total points wherever low-game
players also score less per game, as they do — bounded at up to 18% for undrafted rookies (§4 Q4 of
that slice's task file). One panel reporting realised **total points** per rookie-path player-season
on the pinned `half_ppr` basis (same predictor-year population as slice 1's PPG panel, no outcome
gate) would let a later slice fit the product directly instead of documenting the gap. The proper
fix this unblocks — project PPG given a real season, project the probability of playing, combine —
needs a second fitted model and a UI decision about which number the games column shows; deliberately
out of scope for slice 2 (`.claude/tasks/rookie-availability.md` §3 item 4).

### D-5 · A completed season's `inProgress` flag is never re-sealed
**Found:** in-season app-read planning review (`22ed5c1`) · **Blocking:** no (bites in ~a year) · **Size:** small
**✅ RESOLVED 2026-08-29** — data repo `c66ff88` (`manifest-truth.md` §2).

**Introduced by §2 of the in-season work** (data `697ae73`), so this is a regression to close, not a
pre-existing gap. `shouldSkipCompletedSeason` returns at `scripts/update-nfl.mjs:85`, **before**
`updateManifestEntry` at `:148` — the early return is only the *second* half of the defect, though.
The scheduled job runs with no `--year`, so `year` always resolves to `currentSeason` and `inProgress`
is therefore always `true` on that path — **`shouldSkipCompletedSeason` is never reached from cron at
all.** At rollover the scheduled path simply moves to the new season; the season that just closed is
never revisited by any automatic route, so its `inProgress: true` persists indefinitely. The *only*
route back to it was a manual `--year <closed>` run — and that is exactly the path that hit the early
return before the manifest write. The fix (data repo, `setManifestInProgress`) seals at two call
sites: the manual-correction skip path, and — since that path alone never fires automatically — the
scheduled path additionally seals `year - 1` on every normal run after a rollover.

**Why it bit, and why it was silent.** A year later that season enters the app's `careerStats`
window (`s < currentSeason`). `getSeasonTotals` reads with the **default** `allowInProgress: false`,
so `tryDataStore` rejects the entry, and **every user falls back to the 18-week live-API loop for
that season permanently** — on the league's own scoring basis rather than the store's `pts_half_ppr`,
i.e. a silent mixed-basis corpus. No error, no test failure.

**The fix:** on the skip path, still update the manifest entry's `inProgress` to `false` — a
metadata-only write with no data write. §2's fix closed the *write-refusal* half of the season-close
problem; this is the *flag* half, which it did not reach.

### D-1 · Byes never resolve in served season-totals
**Found:** dp-v2 Slice 4a (`855aded`) · **Blocking:** no · **Size:** small

The store-served `nfl/season-totals/<year>.json` never emits `weeklyStatus: 'B'`. Verified across all
**2,832 players** in the 2025 file: the distribution is `P`/`X`/`D` only, and **every** player's
`byeWeeks` is `0`. Real byes land as `'X'` (unresolved) — confirmed against
`nflverse/schedule/2025.json` for a team with a known bye.

The app's live-API path (`src/api/sleeperStats.js:205-213`) classifies byes correctly by checking the
set of teams playing that week, so the two paths disagree: the same player shows `'B'` in API-only
mode and `'X'` when served from the store. The data repo's generation script does not do the
equivalent resolution.

**Impact is cosmetic and bounded — proven, not assumed.** `computeAvailability` builds absence
segments **exclusively from `'D'` runs**, `absenceCause` is hard-coded `'unknown'`, and
`seasonProjection.js:514,524` reads only `absenceSegments` and `longestAbsence`. So `'B'` versus
`'X'` is *indistinguishable to every scoring path*. The only visible consequence is the pop-up's
Availability grid, which renders a `'no game recorded'` state where a bye belongs (dp-v2 Slice 4b,
`eab9fe7`, §4.1) and cannot show a bye legend under normal operation.

**✅ RESOLVED FORWARD-ONLY 2026-08-24 — data repo `2b06c5b`.** `aggregateWeeks` now infers a
single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot, forward
seasons only. **Completed 2012–2025 files keep `'X'` permanently, by decision** — a historical
rewrite would be an Invariant 1 exception, and D-1's own impact analysis (below) establishes
that `'B'` vs `'X'` is indistinguishable to every scoring path, so the rewrite buys a pop-up
legend at the cost of re-touching fourteen sealed seasons. Verified 2026-08-29: 2025 still reads
`P`/`X`/`D` with `byeWeeks: 0` across all 2,800 non-`TEAM_` rows — **correct behaviour, not an
outstanding bug.** The historical half is closed by decision; the forward half is shipped.

**Do not "fix" this app-side by reconstructing byes from the schedule.** The season-grain team is a
single *dominant* team per season (CR-02's `aggregateWeeks` rule), so a traded player would be given
phantom byes for his old team's weeks. That route is explicitly forbidden in Slice 4b's task file.

### D-2 · `advStats` carries no EPA
**Found:** dp-v2 (`fb8c2dd`) · **Blocking:** no · **Size:** medium

`nflverse/advstats/<year>.json` serves `targetShare`, `airYardsShare`, `wopr`, `racr` and their
components — but **no EPA**. It is the only cheap season-aggregated per-player family; `gamelogs`
carries EPA but at **8.2 MB/season**.

**Consequence:** *EPA per opportunity* (rec EPA ÷ target, rush EPA ÷ carry, pass EPA ÷ attempt) cannot
be shown as a per-season series without loading ~33 MB of gamelogs for five seasons. It was therefore
**cut** from the pop-up's Usage & efficiency section (Slice 4b) rather than deferred, and the same
constraint will apply to Market's Efficiency set in Slice 5.

**The ask:** add season-aggregated EPA to the advstats pack — `passingEpa`, `rushingEpa`,
`receivingEpa` summed per player-season, alongside the existing components, so a rate can be
recomputed app-side without summing stored rates.

This is the higher-value of the two: it unlocks a metric the project's own research
(`docs/prediction-research-eval.md` §D-1) rates as the single highest-priority gap, on both surfaces
that want it.

### D-6 · Snapshot schema v3 (`inputStatus`) needs data-repo mirroring
**Found:** D1a implementation (app `7466b2e`) · **Blocking:** no — the app ships v3
before the data repo acts · **Size:** small

The app's projection-snapshot envelope bumped `schemaVersion: 2 → 3`, adding one top-level
`inputStatus` key (six gated-input labels: `college`, `nflDraft`, `ktc`, `priorSnapshotTeams`,
`depthChart`, `careerStats`, each `{ loaded, count, detail? }`). This is CR-01's Mirror ask
(`docs/cross-repo-registry.md`), carried here per that entry's text:

- **`scripts/register-snapshots.mjs`** — its expectations should be updated for the new
  `schemaVersion`. *Hint to check first (Step 0 correction 3 of the app-side task file, an
  observation only, not authority): reading the sibling tree at `323a2b6` suggests the registrar
  already accepts any numeric `schemaVersion` and never gates on it — if that holds, this item
  closes cheaply; verify against live source rather than trusting this note.*
- **`scripts/grade-snapshot.mjs`** reads — same hint applies: neither this script nor `lib/panel.mjs`
  was observed to read the snapshot's `schemaVersion` at all, per the same reading. Verify before
  assuming no work is needed.
- **README snapshot section** — document the v3 shape and the new `inputStatus` field.
- **A v3 fixture** for the data repo's own snapshot-consuming tests/tools.
- **`data-catalog.md`** — the snapshots row needs its schema note bumped to v3.

**v3 is additive** — every v2 field keeps its name, type and meaning, so no migration is needed for
existing v1/v2 snapshot files. See `docs/integrations.md` → "Projection snapshots" (Schema v3
paragraph) for the full field list and the two legitimate-`false` cases (`priorSnapshotTeams` on the
first-ever snapshot; `nflDraft` in the pre-draft January–April window).

---

## Pre-existing data-repo backlog — recorded there, not here

These were known before dp-v2 and live in the data repo's own docs. Listed only so nobody re-discovers
them and files a duplicate:

- `nflverse/roster` 2012–2015 absent (upstream files fail the shared `MIN_ROSTER_IDS` gate).
- CFBD college files lag at 2017–2024 until 2025 is materialized.
- Enrichment overlay: `scheme.json` / `injuries.json` / `notes.json` are 0-entry scaffolds; only
  `coaching.json` is populated (~95 entries). The hand-authored path has demonstrably not filled them.
- A precomputed teamcontext season-summary pack was **considered and rejected** for dp-v2 (Slice 6's
  14-season fetch is permanently cached and first-visit only). Recorded so it is not re-proposed as
  new.

---

## Done

### ~~D-8 · Debut-season rookie panel~~
**Found:** rookie-calibration.md (calibration arc slice 1, f07d9be) · **Blocking:** no — blocked only the rookie ceiling, not slice 1 · **Size:** medium
**✅ RESOLVED 2026-09-11** — data repo `backtests/2026-09-11-rookie-panel.json` (verdict
`grading/2026-09-11-rookie-verdict.md`, data commit `f0a7d07`). `debut.rows` grades predictor = draft
year, outcome = the same season — a true debut panel, 2,071 entrants across 13 entry classes
2013–2025 — unblocking `.claude/tasks/rookie-calibration.md` §1 Q2's deferral and letting
`.claude/tasks/rookie-ceiling.md` (calibration arc slice 3) ship the realisation ceiling this item was
opened to unblock.

Every row of the *original* rookie panel (`assembleRookiePanel`, `lib/panel.mjs:1851-1905`) had
outcome = predictor year + 1 for a player who already appeared in the predictor year — it graded
**second** seasons and never a **debut** season, which is the case the live app's rookie path mostly
serves. A variant with predictor = draft year and outcome = the same season was the only instrument
that could answer Anton's stated goal ("never project a rookie to a level no rookie has reached") for
an actual debut season.

### ~~D-4 · `validateKtc` asserts nothing about the 36 pick rows~~
**Found:** dp-v2 Slice 7 planning review (`f3996a7`) · **Blocking:** no · **Size:** small
**✅ RESOLVED 2026-08-24** — data repo `02cf41d`. `validateKtc` now requires ≥1 pick row per round
1–4 and ≥24 total, matched on `/^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$/`. Deliberately a
**floor, not an equality**: 36 = 3 classes × 3 tiers × 4 rounds is upstream-controlled, so `=== 36`
would fail on good data the year KTC publishes a fourth draft class. Verified against a live scrape
(500 rows) and by four new tests. Planned in the data repo's
`.claude/tasks/post-dp-v2-data-batch.md` §6 (that file is local — `.claude/` is gitignored there).

`validateKtc` (`lib/validate.mjs`) asserts total row count (250–600), ≥5 rows each for QB/RB/WR/TE,
non-empty names, and a value range — **nothing about the 36 pick rows** (`<YYYY> <Early|Mid|Late>
<1st|2nd|3rd|4th>`, `position: null`, `team: "FA"`) that `src/utils/ktcPicks.js` started reading in
this slice (CR-17, extended).

**Why it matters now, not before:** before this slice nothing in `src/` read the pick rows, so their
silent disappearance had no consumer to notice. Now Portfolio's ROSTER VALUE headline and holdings
table read them directly. If KTC's DOM changed and all 36 pick rows vanished from a scrape,
`validateKtc`'s existing floors would still pass (500 → 464 rows is still ≥250, and every
position-count floor is untouched by losing rows with `position: null`) — the scrape would validate
clean and the app would silently show every pick as unpriced, with no error and no test failure on
either side.

**The fix** is in the data repo's KTC validator: add a pick-row floor (expect 36, or at minimum ≥1 per
round 1–4) alongside the existing player-row assertions.

**Why it is not blocking:** the app already renders an unpriced pick correctly (a dashed `—`, counted
into `+ N UNPRICED ASSETS`, `PROVISIONAL(no-data)`) — this is a detection gap for a scrape regression,
not a present incorrectness. Batched with D-1/D-2/D-3 per the file-level decision above.

### ~~D-3 · Four stat keys are load-bearing with no contract recording it~~
**Found:** dp-v2 Slice 5b planning (`d2f1a4f`) · **Blocking:** no · **Size:** small
**✅ RESOLVED 2026-08-24** — data repo `f3f10c8` — implemented per
`.claude/tasks/d3-efficiency-stat-key-contract.md`.
Research turned up a **fifth** key the entry below missed (`pass_sack`, with a second consumer at
`outlookPositionStats.js:128`) and a fabricated-zero bug in `sackPct`/`ayPerAtt` (missing key
divided a surviving denominator, rendering a confident `0.0` instead of `—`) — both fixed in the
same change. All five keys now enforced by `EFFICIENCY_SET_KEYS` in `statKeysContract.test.js`, and
recorded as **CR-19**, landed byte-identical in this repo's `docs/cross-repo-registry.md` and the
data repo's `README.md` mirrored region. `docs/signal-registry.md` gained a row for the five keys.
**Different in kind from D-1/D-2** — this is a *registry* gap, not an ingest change, and it lands in
**both** repos rather than only the data one.

`rush_yac`, `rush_btkl`, `rec_drop` and `pass_air_yd` have **zero** app-side readers today, appear in
**no** `docs/signal-registry.md` row, and are covered by **no** `CR-NN` entry. Slice 5b makes all four
load-bearing for a visible surface (Market's Efficiency set: `YAC`, `BTKL`, `DROPS`, `AY/ATT`).

CR-02 governs season-totals *schemaVersion and row composition*, not key preservation — which is
exactly why CR-11, CR-12 and CR-13 exist as per-key entries over the same `aggregateWeeks` path. These
four have no equivalent, so if the data repo ever renamed or filtered one, the app would lose a column
with **no error and no test failure**.

**Why it is not blocking:** the keys are read-only from the app's side and all four are present today.
The risk is future silent breakage, not present incorrectness.

**How it gets done** — and it is the one item here that does **not** start in the data repo. Per
CLAUDE.md's workflow convention, a coupling no registry entry covers is the single residual case that
routes to the **Claude.ai project**, which can hold both repos at once. Its output is a *draft*
`CR-NN` entry in the format at the top of `docs/cross-repo-registry.md`; that draft returns to a
normal in-repo planning session and lands in **both** registries in the same change.

### D-7 · Retroactive Mirror record for three commits that skipped it
**Found:** post-D1a registry audit (app `5821210`) · **Blocking:** no · **Action required in the data repo: none.** Recorded because the convention requires the Mirror to be emitted, and these three did not emit it.

Three commits landed in the D1a session as direct fixes rather than through a task file, and each touched a listed `CR-NN` trigger without emitting that entry's `Mirror` text. The omission is procedural: the rule attaches the duty to a task file's `## Cross-repo impact` section, and none of these had a task file. Recording the judgment here so a later reader does not have to re-derive it from three commit messages.

- **`c1ce924` — `nflDraft.js`, dynamic draft-year list. Touches CR-06** (`src/api/nflDraft.js` is a bare file-level trigger). CR-06's Mirror is about shape and sparsity-constant changes landing in both repos, and about `MIN_ROSTER_IDS` being declared twice. This commit changed neither: it removed an app-side year filter and derives the list from the store's own `picksByYear` keys. The store has served 2010+ throughout, so nothing on the data side was ever missing. **No data-side work.** CR-06's app-side description was stale as a result and has now been corrected in the registry (both copies).

- **`7613ceb` — `normalizeCollegeStats` made idempotent, cache namespace bumped to `cfbd-players-v2`. Touches CR-05** (`normalizeCollegeStats` is a named trigger). CR-05's Mirror is about coordinating `statType` additions, removals and renames. This commit changed no `statType`, no served container shape and no value type — it fixed an app-side double-normalization and lapsed the poisoned cache entries. **No data-side work.**

- **`b0e97cb` — `classifyKey` derives the college ZIP route from the namespace constant. Touches CR-05** (`classifyKey` in `src/utils/exportData.js` is a named trigger). This is the one with a genuine cross-repo surface, so it is worth stating precisely. Between `7613ceb` and `b0e97cb` the export ZIP stopped producing `college/<category>/<year>.json` and filed those entries under `raw/` instead. That is a data-repo-facing path, and had anyone exported and imported in that window the college family would have landed somewhere the data repo does not look. **In practice the consequence was latent, not actual:** `bin/import-snapshot.mjs` is the only importer and it handles snapshots only; college is ingested server-side by `scripts/update-cfbd.mjs` and never comes from an export ZIP. Both commits are also from the same session, so no export exists in the window. **No data-side work, and no re-import needed.**

**Standing consequence, worth one line.** The export ZIP's `college/` route has had no data-repo consumer for some time. It is dead weight in `classifyKey` that nonetheless reads as a live contract in CR-05's trigger list. Worth deciding, when the batch is next opened, whether to retire the route or record it as deliberately dormant. Not urgent, and not a defect.

### ~~D-11 · Two stale CR trigger lists (CR-06, CR-01)~~
**Found:** rookie-calibration.md (calibration arc slice 1, f07d9be) · **Blocking:** no · **Size:** small — but both-repos, same-change edits
**✅ RESOLVED 2026-09-12** — app `2c3e8a5`, which fixed both halves in one change: CR-06's
`Triggers` gained `matchNflDraftToSleeper` in `src/utils/nflDraftMatch.js`, and CR-01's were
rewritten from the `factors`-only narrowing to "the verbatim `projection` payload … (definition
site — includes the `factors` object shape and top-level fields such as `projectedGames` and
`projectedTotalPts`)" plus its live consumers. Verified against live source 2026-09-20. **No
data-repo work was ever owed by this item** — both trigger lists are app-side, and the mirrored
region is carried by the sync item under *Open*. One residue belongs there, not here: the data
copy still lists `portfolio/Portfolio.jsx:366-367` under CR-01, a `projection` read Portfolio
Slice B removed and which live `src/` no longer contains.

Two `docs/cross-repo-registry.md` trigger lists were found stale during this slice's review, and
neither can be fixed from a repo-scoped session since both are inside the mirrored
`<!-- CR-REGISTRY-BEGIN -->` sentinels (a one-sided edit is exactly what the drift check reports):

- **CR-06's `Triggers`** omits `matchNflDraftToSleeper` in `src/utils/nflDraftMatch.js` — a live
  consumer that reads served pick fields by name (`fullName`/`college`/`position`,
  `round`/`pick`/`team`/`age`), and this slice treats its `positionsCompatible` hard-skip as
  load-bearing evidence (the Robbie Ouzts residual, `docs/signal-registry.md` and
  `docs/projection.md` → Rookie path).
- **CR-01's `Triggers`** names the `factors` shape only at its definition site
  (`src/utils/seasonProjection.js`), while `src/hooks/usePlayerProfile.js:179` and
  `src/components/market/Market.jsx:439-446` consume that shape too and are not listed.

**Extended, rookie-availability.md (calibration arc slice 2), 2026-09-09.** Two more gaps in the same
mirrored region, found by that slice's review, both still inside the sentinels:

- **CR-01's `Triggers` narrow `seasonProjection.js` to "the `factors` object shape"**, but this slice
  changes top-level `projection` payload fields — `projectedGames` (`:237` rookie, `:616` vet) and
  `projectedTotalPts` (`:238` rookie, `:695` vet) — which the entry's own **App side** field calls
  "the verbatim `projection` payload", and which `projectionSnapshot.js:90` writes with no whitelist.
  The definition site of the changed field is uncovered.
- **`Triggers` omit live consumers of the projection payload** (as opposed to the `factors` shape,
  already covered above): `src/components/market/Market.jsx:537`,
  `src/components/dp/PlayerDetailModal.jsx:278`, `src/components/dp/PlayerDetailTabs.jsx:111`,
  `src/utils/marketFilters.js:152`, `src/components/portfolio/Portfolio.jsx:366-367`,
  `src/components/roster/MyTeamView.jsx:25`, `src/components/roster/PlayerCard.jsx:42`,
  `src/App.jsx:603`.

**Found:** docs-no-dated-availability.md (app `6e90a67`) · **Blocking:** no. Two asks, both
non-blocking.

- **Adopt the no-dated-availability-claims convention in the data repo's own `CLAUDE.md`, and sweep
  `data-catalog.md` and the README coverage rows for the same class of stale claim.** This app-side
  task fixed eight instances of reference docs asserting current data availability instead of
  capability/mechanism (e.g. "`X` doesn't exist yet") and added a guard test
  (`src/__tests__/docsAvailabilityClaims.test.js`) so the class doesn't recur here. `data-catalog.md`
  and the README coverage rows carry the identical rot risk on the data side and are CR-18's data-side
  trigger — a stale coverage claim there is exactly the failure mode this task fixed app-side (a
  dated claim reads as ground truth to a reviewer and eventually contradicts correct code). CR-18's
  `Mirror` clause for this trigger is the actionable instruction: "emit the exact
  `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
  reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
  data side in the same change."
- **`[registry-stale]`, recorded not fixed — CR-18's two halves disagree on scope.** CR-18's **App
  side** (`docs/cross-repo-registry.md` — mirrored region, CR-24 byte-identity, cannot be edited from
  this repo) names "the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*" as an app-side
  site, but its app-side `Triggers` list names only `docs/signal-registry.md`, not that sentence. This
  task added a new, separate rule to `Self-maintenance` without touching the signal-registry sentence,
  which is safe under the stricter (`Triggers`) reading, but the entry's two halves should be
  reconciled so a future session doesn't have to make the same judgment call.
