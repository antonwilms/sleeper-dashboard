# Raise `MAX_SUPPORTED_SCHEMA` to 4 (F-24 prerequisite)

Third item in the post-dp-v2 batch (D-4 → data `02cf41d`; D-3 → app `c72e170` / data `f3f10c8`).

F-24 bumps `nfl/season-totals` to **schemaVersion 4**. The app hard-gates on
`MAX_SUPPORTED_SCHEMA = 3` and skips any file above it, so **this must ship and be deployed before
the first v4 file is published.** Small change, but it inverts a test and touches a contract.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `MAX_SUPPORTED_SCHEMA = 3` | `src/api/dataStore.js:8` |
| The gate lives **inside `tryDataStore`** and therefore applies to **every family**, not just season-totals | `src/api/dataStore.js:81` |
| **season-totals is the only family above v1.** Every other served family is v1; snapshots are v1–2 and have no `tryDataStore` reader (only `ktc/snapshot-*`, via `ktcHistory.js:147`) | `sleeper-dashboard-data/manifest.json`, 187 entries |
| **`T5b` explicitly asserts schemaVersion 4 is REJECTED** — the bump inverts it | `src/api/dataStore.test.js:357` |
| **`T1c` ALSO pins v4 as rejected** — a third test the draft missed. It asserts the `allowInProgress` allowlist does not bypass the ceiling, on a KTC snapshot, with `toHaveBeenCalledTimes(1)`; at ceiling 4 the gate stops firing, the file is fetched, and the call count fails | `:404` |
| **`MAX_SUPPORTED_SCHEMA` is the only VERSION gate** — `sourceSchemaVersion` is written (`sleeperStats.js:152`) and never read anywhere | verified |
| **But two FIELD-PRESENCE gates also stand between a v4 file and the app** — `isValidSeasonTotals` requires `gamesPlayed`/`fantasyPoints`/`dnpWeeks` on the first row **and a flat player map**; `sleeperStats.js:112` re-fetches any cached row set lacking `weeklyStatus` | `dataStore.js:101`, `sleeperStats.js:112` |
| `T5a` asserts v3 is accepted and fetched | `:340` |
| Missing a file to the gate is **not** a hard failure — `tryDataStore` returns `null` and the caller falls through to live Sleeper | `:81-84`, `src/api/sleeperStats.js:146-158` |
| **`docs/integrations.md:213` is stale** — claims season-totals "ship at `schemaVersion: 2`" and the app "advertises `MAX_SUPPORTED_SCHEMA = 2`". Both were true two bumps ago | measured |
| **`docs/cross-repo-registry.md:53` repeats the wrong scoping claim** — "independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals only)" | measured |
| The data repo's **Invariant 4** carries the same wrong claim — "which gates only season-totals files" | `sleeper-dashboard-data/CLAUDE.md:223` |
| `MAX_SUPPORTED_SCHEMA` is a named **CR-02** app-side entry *and* a named CR-02 Trigger | `docs/cross-repo-registry.md:56,60` |

---

## 2. The change

**`src/api/dataStore.js:8` — `3` → `4`.** Update the comment above it too: it currently explains v3
as "adds an additive per-season `team`", which stops being the newest version.

**Do not make the gate per-family.** Considered and rejected, recorded here so it is not re-opened:

- The gate has been family-blind since it was written. Raising the ceiling does not make it newly
  blind — it widens an existing blindness by one version.
- Every other family is at **v1**. For the wider gate to bite, a family would have to jump v1→v4 in a
  single change, which would require app-side work anyway and is not a realistic silent failure.
- Reshaping a shared loader path immediately before F-24 adds risk to the one code path every family
  depends on, in exchange for guarding a hypothetical.

**The correct fix for the mismatch is to make the docs describe the code**, not to reshape the code to
match a doc that was always wrong. Three places say the gate is season-totals-scoped; all three are
false and all three get corrected (§4).

---

## 3. Tests

- **`T5a`** — retarget to **schemaVersion 4** accepted and fetched.
- **`T5b`** — retarget to **schemaVersion 5** rejected without fetching the file. Keep the test's
  intent exactly: *one above the ceiling short-circuits*. Do not delete it, and do not weaken it into
  "some high number is rejected."
- **`T1c` (`:404`) — retarget to v5 as well.** Review caught this one; the draft missed it. Its intent
  is *"the `allowInProgress` allowlist does NOT bypass the schema ceiling"*, which is still worth
  asserting — it just needs a version that is actually above the ceiling. Preserve the
  `toHaveBeenCalledTimes(1)` short-circuit assertion.
- **Add a v3 regression case** — v3 files must still load after the bump (older seasons stay v3 until
  F-24 rewrites them, and F-24 may land forward-only for a while). Neither existing test covers
  "below the ceiling still works" once the ceiling moves.

---

## 3a. The version gate is not the only gate — a constraint F-24 must respect

Bumping the ceiling is necessary but **not sufficient** for the app to accept a v4 file. Two
field-presence checks are independent of the version number:

- **`isValidSeasonTotals`** (`dataStore.js:101`) requires `gamesPlayed`, `fantasyPoints` and
  `dnpWeeks` on `Object.values(parsed)[0]`, and therefore also requires the payload to stay a **flat
  player map**. Wrapping v4 in the `{schemaVersion, season, …}` envelope every other family uses
  would fail this validator — silently, via the same `null`-and-fall-back path.
- **`sleeperStats.js:112`** re-fetches any cached row set whose first row lacks `weeklyStatus`.

**So four row-level fields are load-bearing for v4 acceptance: `gamesPlayed`, `fantasyPoints`,
`dnpWeeks`, `weeklyStatus`.** F-24's denylist is `idp_*`/`punt*`, which live *inside* each row's
`stats` object, so it does not touch them — but that is now a stated constraint rather than a
coincidence, and F-24 must keep the flat map and those four fields. Record it in F-24's task file
when that is planned.

---

## 4. Docs

| File | Edit |
|---|---|
| `src/api/dataStore.js:5-7` | Comment: v4 is the ceiling; say what v4 is (F-24's field prune) and that older files still load |
| `docs/integrations.md:213` | **Stale, pre-existing** — says v2 / `MAX_SUPPORTED_SCHEMA = 2`. Correct to v4, and note the gate applies to every family |
| `docs/integrations.md:177` | Row is correct; confirm it still reads true |
| `docs/cross-repo-registry.md:53` | Drop the "(season-totals only)" parenthetical — the snapshot-vs-`MAX_SUPPORTED_SCHEMA` independence claim is right, the scoping is wrong |
| `CLAUDE.md` | If it states the ceiling anywhere, update; otherwise no change |
| **data repo** `CLAUDE.md:223` | Invariant 4: "which gates only season-totals files" → the gate applies to **every** family read through `tryDataStore`; season-totals is simply the only one above v1 |

---

## 5. Cross-repo impact

**CR-02 · season-totals schemaVersion & row composition** fires — `MAX_SUPPORTED_SCHEMA` is both a
named app-side entry and a named Trigger.

> **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app
> since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via
> `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks;
> ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections
> **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate.
> Renaming the `TEAM_` pseudo-id scheme is breaking.

**This change does not touch `aggregateWeeks` or per-season `team`** — it only widens what the app
will accept. The Mirror is emitted because the entry is touched, not because a scoring risk is
present here; that risk belongs to F-24's rewrite pass, which is where the `team`-field diff gate is
required.

**Three CR-02 staleness fixes found in review, to make in the same change:**
- The entry does **not** name the season-totals loader itself — `src/api/sleeperStats.js` (the
  `nfl/season-totals/<season>.json` path `:146`, the `tryDataStore` call `:147`, the
  `entry.schemaVersion` read `:152`, and the `weeklyStatus` staleness sniff `:112`).
- Nor `isValidSeasonTotals` (`dataStore.js:101`), the family's shape validator — though the
  registry's own format rule names validators as triggers in their own right.
- Anchor drift: `computeHistoricalTeamTotals` is `:240` (entry says `:242-246`);
  `buildTeamShareTotals` is `outlookPositionStats.js:36` (entry says `:38-40`).

**Update CR-02's app side** to read `MAX_SUPPORTED_SCHEMA = 4`, in **both** repos' mirrored regions in
the same change. The region is byte-identical as of data repo `0b5294d` — re-run the documented drift
check afterwards and confirm it still reports nothing:

```sh
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
```

---

## 6. Ordering — the whole point of doing this now

**Ship and deploy this before F-24 publishes any v4 file.** Planning's original argument for why was
wrong in three ways; review corrected all three, and the real reason is stronger.

**What actually happens if a v4 file lands first:** `tryDataStore` returns `null`, and
`sleeperStats.js` falls through to the live 18-week Sleeper loop (`:161`). That is not a hard failure.

**It also self-heals** — planning claimed it would not. Every `nfl/season-totals/*` manifest entry is
`inProgress: false`, and a live-API-sourced cache entry carries no `sourceLastModified`, so
`sleeperStats.js:124-136` routes it down the *"data store has a usable entry — migrating"* branch on
**every** load. Pre-bump that means a full 18-week refetch each session (slow, not stale);
post-deploy it migrates on the next load. The genuinely non-self-healing case is an
`inProgress: true` entry, and none exists for this family.

**The basis point was backwards too.** The store serves `pts_half_ppr` verbatim; the live loop applies
the league's own `scoringSettings`, which is what the *"Fantasy points computed weekly"* invariant
prescribes. The live path is the more correct one in isolation. The defect is a **mixed basis across
seasons** — some served, some live-recomputed — not that the live path is wrong.

**The real cost, and the strongest ordering argument: a live-aggregated season carries no per-season
`team`.** `teamContext.js:1-8` documents exactly this case — `per-season-team` attribution *"falls
back to the current team when the season record carries no team (live-API-aggregated seasons, v1/v2
cache entries, API-only mode)"*. So any season that falls through to the live loop **silently reverts
to current-team attribution**, and `computeHistoricalTeamTotals` also loses the `TEAM_*` rows
`isTeamAggregateId` exists to exclude. That is a **scoring change with no app-side diff** — precisely
the hazard CR-02's own Mirror warns about, arriving through a side door rather than through an
`aggregateWeeks` edit.

Raising the ceiling early is safe and inert: no v4 file exists yet, so nothing changes until F-24
lands. The cost of raising it late is a silent attribution flip on whichever seasons F-24 rewrites
first.

---

## 7. Done-definition

- [ ] `MAX_SUPPORTED_SCHEMA = 4`; comment rewritten
- [ ] `T5a` accepts v4; `T5b` rejects v5; new case proves v3 still loads
- [ ] All three "season-totals only" claims corrected (§4), including the data repo's Invariant 4
- [ ] `docs/integrations.md:213`'s two-bumps-stale numbers fixed
- [ ] CR-02 app side updated in **both** repos; drift check reports nothing
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `T1c` retargeted too — three tests move, not two
- [ ] No smoke needed — nothing user-visible changes until a v4 file exists. Say so in the hand-back
      rather than claiming a smoke was done
