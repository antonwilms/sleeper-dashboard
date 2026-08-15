# Slice viii — Retire `/players`

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `5c98e71`. Not yet `plan-reviewer`'d. Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md) — §4a, §6a.

> **This is the only irreversible slice in the program.** Everything before it added surfaces
> alongside the old one. This deletes the old one. **Precondition, already met:** slices vi and vii
> shipped and the user's pre-deletion parity smoke passed (2026-08-14). Do not start if that is not
> true.

**This slice:** delete the Explorer surface and everything that becomes unreachable with it, settle
the five convergence debts, and update the two cross-repo registry entries whose app-side consumers
disappear.

---

## 0. Confirmed against live source

### 0.1 Exactly three real cross-boundary imports must be resolved first

Everything else that mentions the doomed files does so **in comments**. The real ones:

| Importer | Imports | From |
|---|---|---|
| `src/App.jsx:34` | `PlayersSurface` | `./components/players/PlayersSurface` |
| `src/utils/marketFilters.js:12` | `DYNASTY_GROUP_MAP`, `NFL_TEAMS` | `../components/PlayersTab` |
| `src/components/market/Market.jsx:14-15` | `COLUMNS as PRODUCTION_COLUMNS`, `POSITION_STAT_COLUMNS` | `../players/NflStatsTab`, `../players/OutlookTab` |

`usePlayersTable` lives in `src/hooks/` and **survives** — Market and Portfolio both use it.

### 0.2 The orphan cascade — six modules plus one function

`PlayersTab.jsx` is the **only non-test consumer** of each of these. They become unreachable the
moment it goes:

`AdvancedStatsPanel.jsx` · `AvailabilityHistory.jsx` · `ui/RankingsRow.jsx` ·
`ui/ExpandableTableRow.jsx` (its other consumers, `OutlookTab`/`NflStatsTab`, die too) ·
`SpiderChart.jsx` · `ktcHistory.computeKtcRecentDelta`

**`ui/ValueChip.jsx` is already dead** — nothing but its own test references it, since Slice iii
declined to reuse it. Pre-existing orphan; sweep it here.

### 0.3 What survives — do not delete these

`usePlayerProfile.js` (the dp pop-up uses it) · `seasonRanks.js` (Market's Ceiling/Floor) ·
`outlookConsistency.js` / `outlookUsage.js` / `outlookPositionStats.js` / `nflStats.js` (Market's
column sets) · `Tooltip.jsx` (TopBar, AppShell) · `dynastySignalBadges.js` ·
`ktcHistory.computeKtcSignals` (feeds `seasonProjection.js`'s `ktcHist*` capture factors) ·
`collegeMetrics.js` / `collegeMatch.js` (feed the projection's rookie path — see §4).

### 0.4 `advStatsViewOnly.test.js` will break

It asserts every projection/scoring file matches neither `/advStats/` nor `AdvancedStatsPanel`
(`:28-32`). Deleting the panel does not break those assertions, but the test's *premise* — that the
panel exists as advstats' consumer — no longer holds. See §4.

---

## 1. The deletion set

Delete outright:

```
src/components/PlayersTab.jsx                 (+ its tests)
src/components/players/PlayersSurface.jsx     (+ tests)
src/components/players/OutlookTab.jsx         (+ tests)
src/components/players/NflStatsTab.jsx        (+ tests)
src/components/players/PlayersDataTable.jsx   (+ tests)
src/components/players/WeeklyPlaceholder.jsx
src/components/SpiderChart.jsx
src/components/AdvancedStatsPanel.jsx         (+ tests)
src/components/AvailabilityHistory.jsx
src/components/ui/RankingsRow.jsx             (+ tests)
src/components/ui/ExpandableTableRow.jsx      (+ tests)
src/components/ui/ValueChip.jsx               (+ tests)
```

Plus, inside surviving files:
- `App.jsx` — the `/players` route, the `PlayersSurface` import, and **the whole `comparisonList`
  block**: `LS_COMPARISON` (`:55`), the state (`:130-154`), `addToComparison` /
  `removeFromComparison` / `clearComparison`, and the `clearComparison()` call in the league-reset
  path. Nothing else consumes them once `/players` is gone (Slice v deliberately did **not** wire
  the pop-up's tab strip to `comparisonList` — see its §1).
- `ktcHistory.js` — `computeKtcRecentDelta` and its tests. **Keep `computeKtcSignals`.**

**`src/components/players/` and `src/components/ui/` both end up empty** — remove the directories.

## 2. Resolve the three imports BEFORE deleting anything

Do this first, as its own commit-able step, with `npm test` green in between. Deleting first and
fixing imports after means working through a broken build.

1. **`DYNASTY_GROUP_MAP` + `NFL_TEAMS` → `marketFilters.js`.** Move the literals in (they are ~10
   lines of data) and delete the `import` at `:12` plus the re-export. This also closes the
   dependency inversion noted after Slice vi: a `utils/` leaf currently imports from a large
   component module, dragging its whole graph into every test that touches filters.
2. **`COLUMNS` + `POSITION_STAT_COLUMNS` → a new `src/components/market/columnDescriptors.js`.**
   Move both maps verbatim. They are descriptor data with formatters (`levelFmt`, `deltaFmt`,
   `deltaEps`, `valence`, tooltips), not logic — keep them together and out of `Market.jsx`, which
   is already large. Update `Market.jsx:14-15` to import from the new module.
3. **`App.jsx`** — remove the `PlayersSurface` import and the `/players` route (§7).

After step 1–3, `npm test` must still be green **with the old files still on disk**. Only then delete.

## 3. The five convergence debts — settled by deletion

Master-plan §6a lists five. Four settle by the files ceasing to exist; confirm rather than "do":

1. `PlayersTab.jsx:369-373`'s hard-coded weight strings → gone with the file. `dynastyScore.components[*].weight` (Slice ii) remains the single source.
2. `PlayersTab.jsx:864-881`'s inline signal-badge block → gone. `dynastySignalBadges.js` remains the single source.
3. The two `/players`-scoped `ProfileDataContext` providers → gone. **The App-level provider becomes the only one** — update `ProfileDataContext.jsx`'s doc comment, which currently describes three.
4. `ComparisonTray` → gone with `PlayersTab.jsx`; its state goes with §1's `App.jsx` block.
5. `SpiderChart.jsx` → its precondition ("zero remaining consumers") is now met; delete.

## 4. Two families go dark on the display side — and they are not equivalent

**Decided by the user 2026-08-14**, on the reasoning that the data side is untouched and stats get
re-added once the new UI is sound. Both are recorded here so neither is rediscovered as a surprise.

| Family | After this slice | Still live? |
|---|---|---|
| **`advStats`** (target/air-yards share, WOPR, RACR) | `AdvancedStatsPanel` was its **only** consumer, and it is display-only by invariant | **Fully dark** — loaded, cached, gated, rendered nowhere, consumed by nothing |
| **`collegeStats`** (dominator rating, breakout age, production trend) | Its only *display* was `PlayersTab`'s college stat line | **Functionally live** — still feeds `seasonProjection.js`'s rookie path via `collegeMetrics`/`collegeMatch`. Invisible, not unused |

**Nothing on the data side changes.** The data repo still publishes both; `src/api/advStats.js` and
`src/api/cfbd.js` still load them; `App.jsx` still passes both into `ProfileDataContext`;
`usePlayerProfile` still derives `advStatsRow` / `advStatsSeason` / `snapShare` / `usageShare` /
`collegeMetrics`. Re-adding either is a **rendering** job, not a re-ingestion one — which is exactly
why this is an acceptable trade.

- **Keep** `advStats` and `collegeStats` in the context value and in `usePlayerProfile`'s return.
  Removing them would turn a rendering job back into a wiring job.
- **`advStatsViewOnly.test.js`** — keep it and keep its assertions; only its *premise* changed. Its
  `AdvancedStatsPanel` pattern check still passes trivially. Update its header comment to say
  advstats currently has **no** UI consumer and the guard exists to keep it out of
  projection/scoring whenever one returns.
- **Record both on the dark-data list** in master-plan §6a's closing note, alongside `teamContext`
  and `nflGameLogs`. That list is now four families, and it is the natural scope of the
  data-surfacing slice §6a already flags as unscheduled.

## 5. localStorage keys to retire

`players-view` · `players-dynasty-tab` · `explorer-sort` · `explorer-presets` · `nflstats-season` ·
`nflstats-sort` · `outlook-sort` · **`comparison-list`** (`LS_COMPARISON`, dying with §1's
`App.jsx` block)

**Do not write migration code.** These are view preferences; a stale key is inert and costs nothing.
Just stop referencing them, and list them in the hand-back so the user knows what is now dead in
their browser.

## 6. Routing

- Remove the `/players` route and the `PlayersSurface` import.
- **Redirect `/players` → `/market`**, matching how Slice i handled `/roster` → `/portfolio`. Old
  bookmarks and back-history must not 404, and `/players` was reachable by URL for six slices.
- `DEFAULT_ROUTE` stays `/market`. **Whether Portfolio reclaims it is the user's call, deliberately
  left alone** since Slice iv — do not change it here.
- `navRouting.test.jsx` — update: `/players` now redirects rather than rendering a stub. The
  `PlayersStub` in that file goes away.

## 7. Docs updates

- **`CLAUDE.md`** — this is the largest doc change of the program. The routing table, the
  Players-surface paragraph, the entire `/players`-stays-routed paragraph (including the five-debt
  list, now settled), and ~10 rows of the `src/components/` table. `ProfileDataContext`'s row drops
  from three providers to one. The *Component data access* pattern section loses its two-provider
  description.
- **The advstats Invariant** — reword: it currently says advstats "feed the Player Profile panel
  only". After this there is no panel. Keep the rule (never into projection/scoring), restate the
  fact (currently no UI consumer).
- **`docs/ui.md`** — remove the Explorer sections.
- **Master plan §6a** — record the arc as complete, and the four-family dark-data list (§4).

## 8. Cross-repo impact — **two entries touched** (the program's first)

Per CLAUDE.md, the `Mirror` text is the deliverable, quoted verbatim.

### CR-05 · CFBD college stats
This slice deletes `src/components/PlayersTab.jsx`, a named app-side trigger — specifically its
`PCT`/`COMPLETIONS` reads at `:681-683` and `CAR`/`REC` at `:691`/`:697`. **Remove those from
CR-05's app-side list and `Triggers`.** The remaining app-side consumers (`cfbd.js`, `dataStore.js`,
`collegeMatch.js`, `collegeMetrics.js`) are unaffected.

> **Mirror (CR-05):** Adding or removing a `statType` must be coordinated — the pivot silently drops
> unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it,
> and the blast radius differs by key: `YDS`/`TD`/`ATT` are read by name in
> `src/utils/collegeMetrics.js:69-124`, so renaming those nulls the dominator rating and the QB
> college score; `PCT` and `COMPLETIONS` are read only in `src/components/PlayersTab.jsx:682-683`,
> where `PCT ?? (COMPLETIONS / ATT)` builds the completion-% term — renaming both silently drops
> that term from the Player Profile college stat line, which still renders without it. No error, no
> test failure, in either case.

**Update the entry after mirroring:** the `PCT`/`COMPLETIONS` half of that blast-radius sentence
describes a consumer that no longer exists. `YDS`/`TD`/`ATT` via `collegeMetrics.js` remains the
live risk, and it is now the *only* one.

### CR-17 · KTC snapshots
This slice deletes `computeKtcRecentDelta` and its only consumer. **Remove it from CR-17's app-side
list and `Triggers`;** keep `computeKtcSignals`, which still feeds the projection's `ktcHist*`
capture factors.

> **Mirror (CR-17):** Keep the snapshot a **bare array** — wrapping it in the
> `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`,
> and the whole `ktcHist*` capture family plus the Explorer's ~30-day KTC Δ cell degrade to empty
> with **no error and no test failure**. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the
> app enumerates candidates by regex over manifest keys, so a path change makes every snapshot
> invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper`
> the same silent way. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be
> manifest-registered**.

**Update the entry after mirroring:** drop "plus the Explorer's ~30-day KTC Δ cell" — that consumer
is gone, so the `ktcHist*` capture family is the only thing that degrades. Note in passing that this
**closes the long-standing `ktcHist` empty-cell symptom** by removing the cell, not by fixing the
upstream series; the underlying sparse-snapshot issue is unchanged and still tracked separately.

## 9. Step sequence

1. §2's three import resolutions. `npm test` green **before** anything is deleted.
2. Delete the §1 file set + the `App.jsx` `comparisonList` block + `computeKtcRecentDelta`.
3. Remove the now-empty `players/` and `ui/` directories.
4. §6 routing + `navRouting.test.jsx`.
5. §7 docs, §8 registry edits.
6. `npm test` green · `npm run lint` **0 problems** (this slice should *reduce* the count if any
   pre-existing lint sat in deleted files — the 5 in
   `docs/design_handoff_dynasty_portfolio/support.js` are a vendored mock and stay) ·
   `npm run build` clean · `grep -rn "PROVISIONAL(" src/` returns exactly Slice ii's three.
7. **Grep for stale references before declaring done:** `grep -rn "PlayersTab\|PlayersSurface\|OutlookTab\|NflStatsTab\|PlayersDataTable\|SpiderChart\|ValueChip\|ComparisonTray\|AdvancedStatsPanel\|AvailabilityHistory\|RankingsRow\|ExpandableTableRow\|computeKtcRecentDelta" src/ docs/ CLAUDE.md`
   — every remaining hit must be a deliberate historical mention in prose, not a live reference.
8. Hand back for the user's smoke: `/market` and `/portfolio` unchanged, `/players` redirects,
   the pop-up still opens from both surfaces, `League`/`Board`/`Trade` unchanged in both themes.

## 10. Tests

- **Delete** the tests belonging to deleted modules (§1). Do **not** port them — they test surfaces
  that no longer exist.
- **`navRouting.test.jsx`** — `/players` redirects to `/market`; `PlayersStub` removed.
- **`importIntegrity.test.jsx`** — check what it still imports. It covers `RostersTab` (survives) and
  `MyTeamView` (dormant, survives). It should need no change; if it does, something in §1 went wider
  than intended — **stop and report**.
- **`advStatsViewOnly.test.js`** — keep, comment updated (§4).
- **Expect the total to drop.** That is correct. Report the before/after count in the hand-back so
  the delta is visible rather than looking like lost coverage.

## 11. Done-definition checklist

- [ ] §2's three imports resolved **and `npm test` green before any deletion**
- [ ] `DYNASTY_GROUP_MAP`/`NFL_TEAMS` now live in `marketFilters.js` — the `utils/`→component
      dependency inversion is gone
- [ ] `COLUMNS`/`POSITION_STAT_COLUMNS` moved to `market/columnDescriptors.js`
- [ ] Every file in §1 deleted; `players/` and `ui/` directories removed
- [ ] `comparisonList` block fully removed from `App.jsx`, including the league-reset call
- [ ] `computeKtcRecentDelta` deleted; **`computeKtcSignals` kept**
- [ ] `/players` redirects to `/market`; `DEFAULT_ROUTE` untouched
- [ ] `advStats`/`collegeStats` still in `ProfileDataContext` and `usePlayerProfile` (§4)
- [ ] `advStatsViewOnly.test.js` kept, premise comment updated
- [ ] CLAUDE.md advstats Invariant reworded — rule kept, "Player Profile panel" claim removed
- [ ] **CR-05 and CR-17 Mirror text emitted (§8) and both entries updated** in
      `docs/cross-repo-registry.md`
- [ ] Four-family dark-data list recorded in master-plan §6a
- [ ] §9 step 7's stale-reference grep is clean
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean · PROVISIONAL still 3
- [ ] Hand-back reports the test-count delta and the dead localStorage keys (§5)
