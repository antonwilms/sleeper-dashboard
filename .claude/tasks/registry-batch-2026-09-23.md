# Registry batch: apply every open app-side registry item (D-21, D-28–D-39, D-41)

**Type:** docs-only, mechanical. **Model:** sonnet.
**Baseline:** app `c9cf117`. **File edited:** `docs/cross-repo-registry.md`, inside the
`CR-REGISTRY-BEGIN`/`END` span only, plus `.claude/tasks/data-repo-backlog.md` bookkeeping.

**Why.** Fifteen backlog items each propose a small edit to the mirrored registry. Applying them one
at a time would turn CR-24's daily `registry-mirror.yml` red fifteen times. This slice applies all of
them in one app commit. A data-repo session then copies the span byte-for-byte (§6), so there is one
red window instead of fifteen.

---

## §0 Rules

- **Every anchor below was re-derived with `grep -n` at `c9cf117`.** Where an anchor in this file and
  a backlog item's anchor disagree, this file wins; the backlog numbers are stale by construction.
  **Do not re-derive further.** If a quoted *old* string does not match the registry byte-for-byte,
  stop and report. Do not improvise a match.
- Edit **only** inside the sentinels. **Never** write the sentinel literals, or a `sed` range literal,
  inside any entry (the data repo's `indexOf` extractor and the doc-command parser both misread them).
- Every edit is either **replace** (exact old → exact new) or **insert** (exact new text at an exact
  point). Keep each entry field on the lines it already occupies. Several are single very long lines,
  so do not re-wrap them. CR-19's fields are hard-wrapped with two-space continuation; keep that.
- Registry prose is `docs/cross-repo-registry.md`, which CLAUDE.md's docs-availability rule scopes
  **out**. Even so, write no claim about what a store file currently contains.
- **Notation:** in single-backtick spans below, `\`` stands for a literal backtick (Markdown cannot
  nest them). Write plain backticks into the registry, never backslashes. Every quoted old string
  was checked by script at `c9cf117` and occurs **exactly once** in the registry.
- **Inserts "before ` ‖ `":** the registry separator is two spaces, `‖`, two spaces. Every such insert
  goes **directly after the named last token and before the first of those two spaces**, never
  between them. Each insert names its last token.
- **D-23 is superseded by D-30.** Do not apply D-23's text; §2's CR-20 edit uses D-30's
  call sites at current anchors.

## §1 Findings where the backlog and live source disagree

1. **D-39's CR-10 item is wrong.** It said `Portfolio.jsx:348-350` "is now `TeamOffences.jsx`". The
   `buildTeamMetricsTable(tcForSeason)` call is still at `portfolio/Portfolio.jsx:350`;
   `TeamOffences.jsx` only renders the result and makes no teamcontext read of its own. §2's CR-10
   edit lists `Portfolio.jsx:350`.
2. D-28's `buildRegWeekIndex:12` is now `:11`. D-30's `isDefenseRowId` import `:3` is now `:4`, with
   calls at `:45`/`:77` and `buildFpaTable`/`rankFpaTable` at `:284`/`:287`. D-34's `loadTeamContext`
   `:251` is now `:254`. D-31's `deriveStoreLag` normalize call `:79` is now `:80`. D-33's CR-21 `:231`
   is now `:284`. All are used as-is below.
3. **`src/utils/weeklyUsage.js`'s other snap reads (`:32`, `:78-80`) are not CR-11 readers.** They read
   Sleeper's live weekly endpoint (module header `:1-4`), not the served store. Only
   `priorSeasonSnapShare` (`:135`) reads served season-totals rows. D-37 is therefore complete as
   scoped.
4. **D-19 + D-20 are already resolved** (data `cf7d1fb`); they carry nothing to apply. Their "Optional
   wording" note (CR-11 and CR-02 Mirror sentences) remains an open, separate decision and is **out of
   scope** here.
5. **Not re-audited:** anchors in the ten entries below that no backlog item names (for example CR-02's
   `teamContext.js` line numbers) were **not** re-derived. Only the anchors this file quotes are
   verified. Say so in the hand-back so nobody reads this slice as a full anchor audit.

---

## §2 Edits, entry by entry

### CR-02 · season-totals schemaVersion & row composition (D-32, D-39)

**2.1 replace** (App side):
`(the \`nfl/season-totals/<season>.json\` path \`:146\`, the \`tryDataStore\` call \`:147\`, the \`entry.schemaVersion\` read \`:152\`, and the \`weeklyStatus\` staleness sniff \`:112\`)`
→
`(the \`nfl/season-totals/<season>.json\` path \`:209\`, the \`tryDataStore\` call \`:210\`, the \`entry.schemaVersion\` read \`:215\`, and the \`weeklyStatus\` staleness sniff \`:175\`)`

**2.2 replace** (Triggers):
`(\`dsPath:146\`, the \`tryDataStore\` call \`:147\`, the \`entry.schemaVersion\` read \`:152\`, the \`weeklyStatus\` sniff \`:112\`)`
→
`(\`dsPath:209\`, the \`tryDataStore\` call \`:210\`, the \`entry.schemaVersion\` read \`:215\`, the \`weeklyStatus\` sniff \`:175\`)`

**2.3 replace** (Triggers): `` `collectSeasonFpaRates:69` `` → `` `collectSeasonFpaRates:76` ``, and
`` `isDefenseRowId:32` `` → `` `isDefenseRowId:39` ``. Each occurs once in CR-02.

**2.4 insert** at the end of the App side line (after `` reads `careerStats[season][pid].team`) ``):
`; in \`src/hooks/useWeeklyDecision.js\`, \`maxDefGamesPlayed:40\` (the league-wide max DEF-row \`gamesPlayed\`, consumed by \`deriveGamesPlayed:52\` as the \`/week\` blend's \`n\`) and \`deriveStoreLag:66\` (its own per-team scan of DEF-row \`gamesPlayed\` — a freshness signal, not a rate)`

**2.5 insert** in Triggers after the last token, the `outlookConsistency.js:18` clause's closing
`corrected here)` (before the separator):
`; the cross-row-summer call sites \`market/Market.jsx:486,490\` and \`dp/UsageEfficiencySection.jsx:24,28\` (\`buildTeamShareTotals\`/\`buildPerSeasonTeamShares\`) \`portfolio/Portfolio.jsx:300,304\` (the same pair), \`src/App.jsx:234,247\` (\`computeHistoricalTeamTotals\`, per-season and current-team), \`src/App.jsx:239,252\` (\`computeHistoricalShares\`, the same pair) and \`src/App.jsx:219\` (\`computeTeamContext\`) — \`[registry-stale]\`, reported by weekly-decision-2-panels.md's plan gate, corrected here; \`isDefenseRowId\` call sites \`src/hooks/useWeeklyDecision.js:45\` (inside \`maxDefGamesPlayed\`) and \`:77\` (inside \`deriveStoreLag\`)`

### CR-04 · Manifest contract (D-41)

**2.6 replace** (App side): `` `getManifestEntry:65` `` → `` `getManifestEntry:66` ``.

**2.7 insert** at the very end of CR-04's **Mirror** line (after its final `read it as blocking a *mislabeled* one.`), preceded by one space:
`A third \`allowInProgress: true\` opt-in exists since advstats-live-season-column.md — \`loadAdvStatsForSeason\` (CR-07), the live-season exact-year advstats read; same genuinely-incomplete case as season-totals, so a future \`inProgress: true\` on the live advstats file would still render.`

### CR-07 · nflverse advstats (view-only) (D-41)

**2.8 replace the whole App side line** (from `- **App side:** \`src/api/advStats.js\` \`loadAdvStats:46\`` to the end of that line) with:

```
- **App side:** `src/api/advStats.js` `loadAdvStats:95` and `loadAdvStatsForSeason:112` (exact-year, no fallback, `allowInProgress: true` — the live-season read) (`MIN_ADVSTATS_ROWS = 250` at `:41`), `src/api/dataStore.js` `isValidAdvStats:135`, `src/App.jsx:1001` (the completed-season `loadAdvStats` call site) and `:1017` (the live-season `loadAdvStatsForSeason` call, keyed on `nflState.season`), the `advStats` pass-throughs `src/App.jsx:641` (`profileContextValue`, deps `:648`) and `:1282` (Market prop, with its `advStatsLive` sibling at `:1283`) — `[registry-stale]`, the call-site anchor was `:878` and the pass-throughs were never listed, corrected here — `src/hooks/usePlayerProfile.js:172-173` (reads `advStats?.byId?.[playerId]` / `advStats?.year`), `src/utils/liveAdvStats.js` (`flooredRacr`, the `MIN_TARGETS` floor both RACR columns share, and `usableLiveAdvStats`/`liveRacrCell`, the live column's year check and cell), guarded by `src/__tests__/advStatsViewOnly.test.js`. **Rendered since dp-v2 Slice 5b** — `market/Market.jsx`'s Efficiency column set: the completed `RACR` column (WR/TE only, `advRow` gated on `advStats.complete` and `year === dataSeason`, floored via `flooredRacr` at `:645`) and, since advstats-live-season-column.md, the live `RACR <season>` column beside it (`usableLiveAdvStats` at `:381`, then `_eff.racrLive` via `liveRacrCell` at `:646-647`; hidden when no usable live load); the completed and live RACR columns additionally read `components.targets` by name, and the live column also reads `components.weeks`. `AdvancedStatsPanel.jsx`, the Explorer's original renderer, was deleted in 1b Slice viii, and `usePlayerProfile.js`'s own read still reaches no component (`dp/PlayerDetailModal.jsx` doesn't reference it) — `targetShare`/`airYardsShare`/`wopr` remain unrendered.
```

**2.9 replace** (Triggers, app side only — the text before ` ‖ `):
`` `src/api/advStats.js`, `MIN_ADVSTATS_ROWS` in `src/api/advStats.js`, `isValidAdvStats` in `src/api/dataStore.js`, `src/hooks/usePlayerProfile.js`, and (dp-v2 Slice 5b) `market/Market.jsx`'s `advStats?.byId?.[id]?.racr` read ``
→
`` `src/api/advStats.js`, `MIN_ADVSTATS_ROWS` and `loadAdvStatsForSeason` in `src/api/advStats.js`, `isValidAdvStats` in `src/api/dataStore.js`, `src/hooks/usePlayerProfile.js`, `src/utils/liveAdvStats.js`, and `market/Market.jsx`'s completed `RACR` read (`advRow` built with the `year === dataSeason` pin, floored via `flooredRacr`) and live `RACR <season>` read (`_eff.racrLive` via `usableLiveAdvStats`/`liveRacrCell`) ``

Leave CR-07's Invariant, Direction, Data side and Mirror unchanged.

### CR-08 · nflverse schedule (read-only) (D-28, D-33)

**2.10 replace** (App side), four substrings, each once:
- `` `loadNflSchedule:60`, `src/api/dataStore.js` `isValidSchedule:135` + `MIN_SCHEDULE_GAMES = 200` (`:130`) `` → `` `loadNflSchedule:60`, `src/api/dataStore.js` `isValidSchedule:148` + `MIN_SCHEDULE_GAMES = 200` (`:143`) ``
- `` `App.jsx:1047` — `[registry-stale]`, was `:930`, re-corrected here after Portfolio Slice D `` → `` `App.jsx:1079` — `[registry-stale]`, was `:930`, then `:1047`; re-corrected by the 2026-09-23 registry batch ``
- `` `App.jsx:639` — `[registry-stale]`, was `:584`, re-corrected here `` → `` `App.jsx:644` — `[registry-stale]`, was `:584`, then `:639`; re-corrected by the 2026-09-23 registry batch ``
- `` `App.jsx:1067` loads `sosSeason` `` → `` `App.jsx:1099` loads `sosSeason` ``

**2.11 insert** at the end of the App side line (after `` `resolvePlayerTeam`. ``), preceded by one space:
`**A third reader since weekly-decision-2a** — \`src/utils/weeklySchedule.js\`'s \`buildRegWeekIndex\` (the \`/week\` route's schedule index, read-only), fed by the \`:1099\` \`sosSeason\` load.`

**2.12 insert** in Triggers after the last token `` deliberately neither truthiness nor `result`) `` (before the separator):
`, and (weekly-decision-2a) \`src/utils/weeklySchedule.js:11\` (\`buildRegWeekIndex\`, reading \`gameType\`/\`homeTeam\`/\`awayTeam\`/\`week\`, and \`homeScore\` at \`:20\` as the same played/unplayed gate — it feeds \`deriveStoreLag\`'s expected-games count, so a rename silently skews the lag notice) via \`src/components/week/WeekView.jsx:61-62\` (the \`/week\` read of \`nflScheduleByYear[season]\`, gated on \`complete\`)`

### CR-10 · nflverse teamcontext (view-only) (D-34, D-39)

**2.13 replace** (App side), four substrings, each once:
- `` `getTeamSeasonRows:121` / `getTeamWeekRow:131` `` → `` `getTeamSeasonRows:125` / `getTeamWeekRow:135` ``
- `` `isValidTeamContext:171` + `MIN_TEAMCONTEXT_ROWS = 60` (`:164`) `` → `` `isValidTeamContext:184` + `MIN_TEAMCONTEXT_ROWS = 60` (`:177`) ``
- `` `loadTeamContext` call site `App.jsx:1009` — `[registry-stale]`, was `:899`, then `:961`, then `:1002`; re-corrected here after Portfolio Slice D shifted `App.jsx` `` → `` `loadTeamContext` call site `App.jsx:1041` — `[registry-stale]`, was `:899`, then `:961`, then `:1002`, then `:1009`; re-corrected by the 2026-09-23 registry batch ``
- `` `App.jsx:637` — `[registry-stale]`, was `:582`, then `:617`, then `:631`; re-corrected here after Portfolio Slice D `` → `` `App.jsx:642` — `[registry-stale]`, was `:582`, then `:617`, then `:631`, then `:637`; re-corrected by the 2026-09-23 registry batch ``

**2.14 insert** at the end of the App side line, preceded by one space:
`**Sixth use since weekly-decision-2** — \`src/hooks/useWeeklyDecision.js\`'s \`/week\`-scoped \`loadTeamContext(season)\` call (\`:254\`, live-season-keyed, not \`dataSeason\`) feeding \`src/components/week/OffencesOwned.jsx\`, the family's first **week-grain** reader (\`getTeamWeekRow\`). **Portfolio** — \`portfolio/Portfolio.jsx:350\` (\`buildTeamMetricsTable\`, rendered by \`portfolio/TeamOffences.jsx\`) — \`[registry-stale]\`, previously omitted, corrected here.`

**2.15 replace** (Triggers):
`` the `loadTeamContext` call site `App.jsx:1009` and the `ProfileDataContext` provider key `App.jsx:637` (both `[registry-stale]`, were `:1002`/`:631`, corrected here) ``
→
`` the `loadTeamContext` call site `App.jsx:1041` and the `ProfileDataContext` provider key `App.jsx:642` (both `[registry-stale]`, were `:1009`/`:637`, corrected by the 2026-09-23 registry batch) ``

**2.16 insert** in Triggers after the last token `` `src/hooks/useTeamHistoryLoader.js`'s on-demand load `` (before the separator):
`, \`src/hooks/useWeeklyDecision.js:254\` (\`loadTeamContext\`, live-season-keyed), \`src/components/week/OffencesOwned.jsx:24,49,52,55\` (\`getTeamSeasonRows\`, \`buildTeamMetricsTable\`, \`normalizeTeamForSchedule\`, \`getTeamWeekRow\` — the family's first week-grain read), and \`portfolio/Portfolio.jsx:350\` (\`buildTeamMetricsTable\`)`

### CR-11 · Snap & red-zone usage stat keys (D-37)

**2.17 insert** at the end of the App side line (after `` `src/utils/outlookUsage.js:62-63` (view-only per-season snap%) ``):
`, \`src/utils/weeklyUsage.js\`'s \`priorSeasonSnapShare:135\` (\`/week\`'s prior-season SNAP sub-line — the player's own \`tm_off_snp\`, a different basis from \`outlookUsage.js\`'s summed team denominator)`

**2.18 insert** in Triggers after the last token `` (`SNAP`/`SHARE` columns) `` (before the separator):
`; \`src/utils/weeklyUsage.js:135,138,139,141\` (\`priorSeasonSnapShare\`, reading \`gamesPlayed\`/\`tm_off_snp\`/\`off_snp\` off served rows — the module's other snap reads are Sleeper's live weekly endpoint, not served data)`

### CR-16 · Era-accurate team-code remap (D-31, D-33, D-38)

**2.19 insert** at the end of the App side line (after `` which `playerTeam.js:63` composes with `eraTeam` ``):
`; the reverse hop \`denormalizeTeamForSchedule\` (\`src/utils/nflStats.js:18\`); the \`eraTeam\` loop call sites \`teams/TeamDetail.jsx:133,150\`; and the normalize/denormalize call sites \`src/utils/weeklySchedule.js:16-17,41,44\` (\`buildRegWeekIndex\`, \`resolveTeamWeek\`, and the VS display's \`denormalizeTeamForSchedule\`), \`src/hooks/useWeeklyDecision.js:80\` (\`deriveStoreLag\`), \`src/components/week/OffencesOwned.jsx:52\`, \`src/utils/weeklyLineup.js:29\`, \`src/utils/opponentStrength.js:88\`, \`src/utils/strengthOfSchedule.js:25-26\`, \`src/utils/teamExposure.js:22\`, \`portfolio/Portfolio.jsx:606,851,975\`, \`teams/TeamDetail.jsx:180,192\` — \`[registry-stale]\`, most omitted since the slices that added them, corrected here`

**2.20 replace** (Triggers, the app-side occurrence, which is the one ending in `src/utils/nflStats.js`):
`` `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` in `src/utils/nflStats.js` ``
→
`` `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` / `denormalizeTeamForSchedule` in `src/utils/nflStats.js`, and their call sites in `src/utils/weeklySchedule.js`, `src/hooks/useWeeklyDecision.js` (`deriveStoreLag`), `src/components/week/OffencesOwned.jsx`, `src/utils/weeklyLineup.js`, `src/utils/opponentStrength.js`, `src/utils/strengthOfSchedule.js`, `src/utils/teamExposure.js`, `portfolio/Portfolio.jsx` and `teams/TeamDetail.jsx` (incl. its `eraTeam` loop) ``

### CR-19 · Market Efficiency stat keys (D-41)

**2.21 replace** (App side, first two hard-wrapped lines):
```
- **App side:** `src/components/market/Market.jsx`'s Efficiency column set — `dropbacks:596`,
  `sackPct:597`, `ayPerAtt:598`, `yac:605`, `btkl:606`, `drops:616`; the `field:` expressions in
```
→
```
- **App side:** `src/components/market/Market.jsx`'s Efficiency column set — `dropbacks:628`,
  `sackPct:629`, `ayPerAtt:630`, `yac:637`, `btkl:638`, `drops:651`; the `field:` expressions in
```
The `usageEfficiency.js` anchors (`:39`, `:115`, `:121`, `:145`, `:151`, `:169`) are verified current. Leave them.

### CR-20 · `fan_pts_allow_*` DEF-row key preservation (D-30, D-35, D-39)

**2.22 replace** (Triggers): `` `teams/Teams.jsx:151,157,294-297` `` → `` `teams/Teams.jsx:161,167,304` `` (`:304` is where the four-column render opens).
Leave the parenthetical after it unchanged.

**2.23 insert** in Triggers after the last token `` `rankFpaTable` over the result `` (before the separator):
`; \`src/hooks/useWeeklyDecision.js\` — \`isDefenseRowId\` imported at \`:4\`, called at \`:45\` (inside \`maxDefGamesPlayed\`) and \`:77\` (inside \`deriveStoreLag\`), \`buildFpaTable\` at \`:284\`, \`rankFpaTable\` at \`:287\`; and \`src/components/week/DefencesFaced.jsx:27-28\` (\`computeFpaPerGame\`, called directly rather than through \`buildFpaTable\`)`

**2.24 insert** at the end of the App side line (after `` `docs/signal-registry.md`'s `fan_pts_allow_*` row ``):
`, \`src/hooks/useWeeklyDecision.js\` (the \`/week\` route's own \`buildFpaTable\`/\`rankFpaTable\` call and its \`isDefenseRowId\` uses), \`src/components/week/DefencesFaced.jsx\` (the blend's two halves shown unmixed)`

**2.28 replace** (CR-20 **Mirror**, which understates the blast radius now that the entry lists more consumers):
`**\`teams/Teams.jsx\`'s FPA QB/RB/WR/TE columns degrade silently to \`—\` across all 32 teams** if either`
→
`**\`teams/Teams.jsx\`'s FPA QB/RB/WR/TE columns degrade silently to \`—\` across all 32 teams** — and with them Portfolio's SOS column, \`/week\`'s Defences-you-face panel and the lineup's blended FPA — if either`

### CR-21 · In-progress season-totals reads (D-21, D-29, D-33, D-36)

**2.25 insert** at the end of the App side line (after `` `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js` ``):
`, \`FPA_PRIOR_DROP_GAMES\` (\`:33\`) in the same file (the current-season games-played threshold at which the prior term is dropped entirely rather than shrunk), \`maxDefGamesPlayed\` in \`src/hooks/useWeeklyDecision.js\` (the league-wide max DEF-row \`gamesPlayed\`, which becomes the \`/week\` blend's \`n\` via \`deriveGamesPlayed\`) and \`deriveStoreLag\` in the same file (a per-team freshness check against the live schedule), \`src/components/week/DefencesFaced.jsx\` (a second, direct read of the same \`currentRows\`)`

**2.26 replace** (Triggers, matched by its unique continuation):
`` `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js` — the app-side shape validator ``
→
`` `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js` and its three live `buildFpaTable` call sites `src/hooks/useWeeklyDecision.js:284`, `teams/Teams.jsx:161`, `portfolio/Portfolio.jsx:370` (`[registry-stale]`, reported by weekly-decision-2a-lineup-truth.md's plan gate, corrected here), `FPA_PRIOR_DROP_GAMES` in `src/utils/opponentStrength.js` (`:33`) and its readers `src/utils/weeklyLineup.js:100`, `src/utils/blendWeights.js:23`, `teams/Teams.jsx:77,82`, `maxDefGamesPlayed`/`deriveStoreLag` in `src/hooks/useWeeklyDecision.js` (both read `currentSeasonTotals.players`' DEF rows' `gamesPlayed`), `src/components/week/DefencesFaced.jsx:28` — the app-side shape validator ``

**2.27 replace** (Mirror — D-29's amendment):
`**the app has no way to tell** — it will render a half-season's rates as though they were a season's, with no error and no test failure.`
→
`**the app has no way to tell on \`/teams\` or \`/portfolio\`** — it will render a half-season's rates as though they were a season's, with no error and no test failure. \`/week\` compares each team's DEF-row \`gamesPlayed\` against that team's scheduled REG games through Sleeper's completed weeks and states the lag (\`deriveStoreLag\`), so a stopped job surfaces there as a lag notice that never clears.`

---

## §3 Backlog bookkeeping (`.claude/tasks/data-repo-backlog.md`, same commit)

- For each of **D-21, D-28, D-29, D-30, D-31, D-32, D-33, D-34, D-35, D-36, D-37, D-38, D-39, D-41**,
  add one line directly under its `**Found:**` line:
  `**App side applied:** \`<this commit's SHA>\` (registry-batch-2026-09-23.md) — data sync owed.`
  If the SHA isn't known before committing, write `registry-batch-2026-09-23` in its place and have
  the app-side Done commit at the end of §6 (not the data repo's commit, which cannot edit this file) replace it with the real SHA. **Do not amend.**
- **D-23:** add `**Closed:** superseded by D-30, applied via registry-batch-2026-09-23.md.`
- **D-39:** also add `**Correction:** the CR-10 item's claim that \`Portfolio.jsx:348-350\` "is now \`TeamOffences.jsx\`" is wrong — the \`buildTeamMetricsTable\` call is still \`Portfolio.jsx:350\`; applied as such.`
- Do not move items to *Done*. That happens when the data sync lands (§6).

## §4 Checks (done-definition)

- `git diff --stat` touches only `docs/cross-repo-registry.md`, `.claude/tasks/data-repo-backlog.md`
  and this task file.
- **Outside-span check:** `git diff -U0 docs/cross-repo-registry.md` shows only hunks between the two
  sentinel lines. Confirm by line number against `grep -n 'CR-REGISTRY-' docs/cross-repo-registry.md`.
- The sentinel literals still occur exactly once each (`grep -c`).
- Count the edits: 2.1–2.28 is 28 items. Where an item has several substrings (2.3, 2.10, 2.13), count
  each one. Report the applied count against the expected count (**35 substring edits**).
- `npm test` (includes `docsAvailabilityClaims.test.js`; the registry is out of its scope, so this
  only proves nothing else broke), `npm run lint` (0 problems).
- **Local mirror check, expected red:**
  `cd ../sleeper-dashboard-data && REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`
  must now **fail**, and its diff must show exactly the lines changed here. Paste the summary line.
- Commit: `Registry batch: apply D-21, D-28–D-39, D-41 app-side (data sync owed)`. **Do not push**;
  Session 1 verifies first. Push and the data sync happen together, the same day (§6).

## §5 Cross-repo impact

This slice **is** the app half of the two-session registry route (memory: registry edits are
two-session, not parent-folder; plan-reviewer flags on that basis are overridden per the 2026-09-13
decision). Entries whose text changes: CR-02, CR-04, CR-07, CR-08, CR-10, CR-11, CR-16, CR-19,
CR-20, CR-21. **Two of them change `Mirror` text** (CR-04 §2.7, CR-21 §2.27), and the data repo's
reviewers read those. CR-24 (registry mirroring itself) is **triggered by process, not by edit**: the
span stops being byte-identical from this commit until §6's sync lands. The daily
`registry-mirror.yml` and `cron-deadman` go red for that window. No file, sentinel, or *Drift check*
`sed` line moves, so CR-24's own text does not change.

## §6 Data-side step (after Session 1 verifies this commit)

Session 1 pushes this commit, then hands a data-repo session this prompt the same day:

> In `sleeper-dashboard-data`: copy the app's mirrored registry region verbatim into this repo's root
> `cross-repo-registry.md`. Copy only the span between the two sentinel lines, never the repo-specific
> framing outside them. Source: `../sleeper-dashboard/docs/cross-repo-registry.md` at `<app SHA>`, on
> `main`. Then run `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` — it must pass with an
> empty diff. Do not re-derive or edit any app-side anchor: the app side is far-side authority for
> this repo. Commit `docs: mirror registry batch 2026-09-23 (app <SHA>)`, push, and confirm the next
> `registry-mirror.yml` run is green.

When that lands, an app commit moves the 14 items plus D-23 to *Done* with the data SHA.

---

## Plan review record (plan-reviewer, 2026-09-23)

The gate raised 15 flags. All anchors were confirmed. Every flag was verified against live source and applied:
- **Substantive:** `maxDefGamesPlayed` is league-wide and feeds `deriveGamesPlayed`'s `n`; only
  `deriveStoreLag` is per-team freshness (2.4, 2.5, 2.25 reworded). D-30's text claimed both callers use
  it, which is wrong. CR-08 gained `homeScore :20` and `WeekView.jsx:61-62` (2.12). CR-20's Mirror is
  widened (new 2.28).
- **Placement:** the separator rule plus named last tokens (§0, 2.5, 2.12, 2.16, 2.18, 2.23). "Same
  file" references now name the file explicitly (2.19, 2.26).
- **Anchors:** `usableLiveAdvStats :381` (2.8). One convention for the `buildFpaTable` call lines
  (2.26: `:284/:161/:370`). The Teams render opens at `:304` (2.22).
- **Coverage, flagged as advisory but taken because each is one clause:** CR-02 gained
  `App.jsx:219,239,252` and `Portfolio.jsx:300,304`. CR-16 gained `TeamDetail.jsx:133,150` (`eraTeam`),
  and its Triggers are made concrete rather than "every call site listed in App side". CR-21 gained
  the `FPA_PRIOR_DROP_GAMES` readers.
- **Bookkeeping:** §3's SHA backfill is moved to the app-side Done commit.
