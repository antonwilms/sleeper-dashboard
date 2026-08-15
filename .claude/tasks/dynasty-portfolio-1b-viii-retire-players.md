# Slice viii — Retire `/players`

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `5c98e71`, then revised after a `plan-reviewer` pass that raised **15 flags — all verified
and all fixed**, then through a **second** pass that raised 12 more — three of them gaps the first
round's fixes had introduced — also all fixed (see §12). Of the first round, two mattered a lot for
an irreversible slice: the tooltip subsystem was
wrongly listed as surviving, and three of five cross-repo entries were missing. Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md) — §4a, §6a.

> **This is the only irreversible slice in the program.** Everything before it added surfaces
> alongside the old one. This deletes the old one. **Precondition, already met:** slices vi and vii
> shipped and the user's pre-deletion parity smoke passed (2026-08-14). Do not start if that is not
> true.

**This slice:** delete the Explorer surface and everything that becomes unreachable with it, settle
the five convergence debts, and update the **six** cross-repo registry entries whose app-side
consumers disappear (§8).

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

**Plus two more, found in review — an earlier draft of this file got both wrong:**

- **`Tooltip.jsx` is orphaned, and the whole tooltip feature dies with it.** An earlier draft listed
  it as surviving "via TopBar, AppShell" — **false**. Those import `tooltipsEnabled` /
  `onToggleTooltips`, the *toggle props*; they never import the component. Its five importers
  — **five** of them: `PlayersTab.jsx:2`, `SpiderChart.jsx:1`, `AvailabilityHistory.jsx:2`,
  `ui/RankingsRow.jsx:1`, `players/OutlookTab.jsx:2` — are **all in the deletion set**.
  (`NflStatsTab` does *not* import it; only its test `vi.mock`s the path.) See §4a.
- **`nflStats.buildGameLog` and `computeHighLow`** — consumed only by `NflStatsTab`'s game log.
  `nflStats.js` survives for `normalizeTeamForSchedule` / `computeSeasonAverages` (Market uses
  both); these two functions do not. See §4.

**`ui/ValueChip.jsx` is already dead** — nothing but its own test references it, since Slice iii
declined to reuse it. Pre-existing orphan; sweep it here.

### 0.3 What survives — do not delete these

`usePlayerProfile.js` (the dp pop-up uses it) · `seasonRanks.js` (Market's Ceiling/Floor) ·
`outlookConsistency.js` / `outlookUsage.js` / `outlookPositionStats.js` / `nflStats.js` (Market's
column sets) · `dynastySignalBadges.js` ·
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
src/components/PlayersTab.jsx                 (no test file exists)
src/components/players/PlayersSurface.jsx     (+ tests)
src/components/players/OutlookTab.jsx         (+ tests)
src/components/players/NflStatsTab.jsx        (+ tests)
src/components/players/PlayersDataTable.jsx   (+ tests)
src/components/players/WeeklyPlaceholder.jsx
src/components/SpiderChart.jsx                (no test file)
src/components/AdvancedStatsPanel.jsx         (+ tests)
src/components/AvailabilityHistory.jsx        (no test file)
src/components/Tooltip.jsx                    (§4a — orphaned)
src/context/TooltipContext.jsx                (§4a)
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
- `nflStats.js` — `buildGameLog` and `computeHighLow` (and their tests). **Keep
  `normalizeTeamForSchedule` and `computeSeasonAverages`, but for two DIFFERENT reasons** — an
  earlier draft said "Market uses both", which is false and dangerous: Market imports only
  `computeSeasonAverages` (`Market.jsx:9`).
  - `computeSeasonAverages` → used by `Market.jsx` and `outlookPositionStats.js`.
  - `normalizeTeamForSchedule` → used by **`playerTeam.js:25,63`**, and it is a named **CR-16**
    app-side trigger (`cross-repo-registry.md:168,172`). Deleting it breaks a live cross-repo
    contract. An implementer who checks the old justification finds nothing in Market and could
    reasonably conclude it is dead — it is not.
- **The whole tooltip toggle chain (§4a):** `App.jsx`'s `tooltipsEnabled` state (`:103`),
  `handleToggleTooltips`, the `TooltipContext.Provider` wrapper (`:951`, `:1129`) and the import
  (`:3`); `AppShell.jsx`'s two props (`:9-10`, `:27-28`); `TopBar.jsx`'s toggle button
  (`:213-217`) and its two params (`:42`); **the `App.jsx`→`AppShell` prop pass at `:957-958`**
  (`tooltipsEnabled={tooltipsEnabled}` / `onToggleTooltips={handleToggleTooltips}`); and the
  corresponding entries in `AppShell.test.jsx` (`:16-17`) and `TopBar.test.jsx` (`:15-16`).

**`src/components/players/` and `src/components/ui/` both end up empty** — remove the directories.

## 2. Resolve the three imports BEFORE deleting anything

Do this first, as its own commit-able step, with `npm test` green in between. Deleting first and
fixing imports after means working through a broken build.

1. **`DYNASTY_GROUP_MAP` + `NFL_TEAMS` → `marketFilters.js`.** Move the literals in (they are ~10
   lines of data) and delete the `import` at `:12` plus the re-export. This also closes the
   dependency inversion noted after Slice vi: a `utils/` leaf currently imports from a large
   component module, dragging its whole graph into every test that touches filters.
2. **`COLUMNS` + `POSITION_STAT_COLUMNS` → a new `src/components/market/columnDescriptors.js`.**
   Move both maps — **plus two things a bare "move the maps" misses**:
   - the module-local helpers `POSITION_STAT_COLUMNS` spreads, `pctShareFmt` and `oneDecimalFmt`
     (`OutlookTab.jsx:142-151`) — without them the new module does not resolve;
   - the **TE alias statements, which sit OUTSIDE the object literals**:
     `POSITION_STAT_COLUMNS.TE = POSITION_STAT_COLUMNS.WR` (`OutlookTab.jsx:174`) and
     `COLUMNS.TE = COLUMNS.WR` (`NflStatsTab.jsx:48`). Miss these and **Market's TE pill silently
     loses its Outlook and Production columns** — no crash, no failing test.

   **The frozen files still consume these maps internally** (`OutlookTab.jsx:362,444,546`;
   `NflStatsTab.jsx:286`), so for the interim step they must **import them back** from
   `market/columnDescriptors.js`. Without that, §2's "green with the old files still on disk" gate
   cannot pass — an earlier draft specified the move and the gate without reconciling them. The
   import-back lives for exactly one step; step 2 deletes both files. They are descriptor data with formatters
   (`levelFmt`, `deltaFmt`, `deltaEps`, `valence`), not logic — keep them together and out of
   `Market.jsx`, which is already large. Update `Market.jsx:14-15` to import from the new module.
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
| **`collegeStats`** (dominator rating, breakout age, production trend) | Its only *display* was `PlayersTab`'s college stat line | **Functionally live** — still feeds `seasonProjection.js:106`'s rookie path via `collegeMetrics`/`collegeMatch`. Invisible, not unused |
| **`nflSchedule`** (results, opponents, Vegas lines) | `loadNflSchedule` has exactly **one** live call site, `NflStatsTab.jsx:275`, feeding the game-log panel | **Fully dark** — the loader runs for nobody, and `nflStats.buildGameLog`/`computeHighLow` lose their only consumer (deleted, §1) |

An earlier draft of this section counted **two** families. It is **three** — schedule was missed.
The master-plan §6a dark-data list therefore goes to **five** (`teamContext`, `nflGameLogs`,
`advStats`, `collegeStats` display-side, `nflSchedule`), which strengthens rather than weakens the
case for the data-surfacing slice §6a already flags as unscheduled.

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
- **Record all three on the dark-data list** in master-plan §6a's closing note, alongside `teamContext`
  and `nflGameLogs`. That list is now **five** families, and it is the natural scope of the
  data-surfacing slice §6a already flags as unscheduled.

## 4a. Tooltips are removed entirely, toggle included

**Decided by the user 2026-08-14:** *"I think I will want to bring tooltips back, but the ones we
had before were not that helpful, so let's not design them yet."*

So this is not a "keep the plumbing, lose the renderer" case. The old implementation is not the one
coming back, and a **visible `TopBar` control that provably does nothing** is worse than no control —
it is exactly the unreachable-code pattern the `roster/` dormant files already demonstrate. Remove
the whole chain (§1): `Tooltip.jsx`, `TooltipContext.jsx`, `App.jsx`'s `tooltipsEnabled` state and
provider, `AppShell`'s two props, `TopBar`'s toggle button.

Tooltips return as a **designed feature in their own slice** — new component, new content, and the
toggle re-added with them if it is still wanted. That is ~10 lines of re-wiring, and it is
deliberately deferred rather than half-kept.

**Record this in master-plan §6a** next to the dark-data list: not a data family, but a deliberately
removed capability with a stated intent to return.

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
  description. **Also these rows, which the tooltip and util deletions invalidate and which an
  earlier draft did not name:** the `src/components/` `Tooltip.jsx` row, the `src/context/`
  `TooltipContext.jsx` row, the `shell/` TopBar row's "tooltip toggle" clause, the `src/utils/`
  `nflStats.js` row (lists `buildGameLog`/`computeHighLow`) and its `ktcHistory.js` row (lists
  `computeKtcRecentDelta`).
- **The advstats Invariant** — reword: it currently says advstats "feed the Player Profile panel
  only". After this there is no panel. Keep the rule (never into projection/scoring), restate the
  fact (currently no UI consumer).
- **`docs/ui.md`** — remove the Explorer sections.
- **`docs/signal-registry.md`** — **required, not optional.** It carries live rows for two deleted
  capabilities: `:103` registers `computeKtcRecentDelta` as a current view-layer signal, and `:102`
  records Ceiling/Floor's current use as "Explorer Value tab" (now Market's Value set — Slice vii
  follow-up). CLAUDE.md → *Self-maintenance* requires this file updated in the same change whenever a
  signal is removed or its current use reclassified, and it is CR-18's app-side trigger (§8).
  **Scope is wider than those two rows** — four more row groups state a current use this slice
  deletes or reclassifies: `:46` (per-season `team` — names the `NflStatsTab` game-log join and
  `OutlookTab`'s share attribution), `:53` (advstats — "Player Profile 'Advanced & Usage'", which §4
  declares dark), `:56` (schedule — "NFL-stats game log — `NflStatsTab` shipped"), and `:104-107`
  (four Outlook view-layer rows whose use reads "Players Outlook tab", now Market's Outlook set).
- **`docs/architecture.md`** — its pipeline description still hands off to `PlayersTab` as live
  behaviour (`:108-109`, `:118`).
- **`docs/integrations.md`** — carries references to the deleted modules; §9 step 7's grep will
  surface them.
- **Master plan §6a** — record the arc as complete, and the four-family dark-data list (§4).

## 8. Cross-repo impact — **six entries touched** (the program's first, and its largest)

An earlier draft found only CR-05 and CR-17: it grepped the registry against the modules already
known to be dying, then never re-checked once the deletion set grew to include
`AdvancedStatsPanel`, `AvailabilityHistory` and `NflStatsTab`. **Re-verify against the final §1 set,
not an earlier one.** Per CLAUDE.md the `Mirror` text is the deliverable, quoted verbatim and in
full — the earlier draft also truncated two of them.

### CR-03 · Enrichment schemas
`src/components/AvailabilityHistory.jsx` is a named app-side trigger (the injury-payload consumer);
§1 deletes it. Remove that clause from `App side` and `Triggers`.

> **Mirror (CR-03):** Any field add, rename or removal must be mirrored in the app's loader and
> lookups. `injuries.segmentStartWeek` must continue to match an absence segment in the matching
> season-totals file; orphaned entries are validator-flagged and silently ignored app-side.

### CR-05 · CFBD `statType` keys
§1 deletes `src/components/PlayersTab.jsx`. **Remove the entire `PlayersTab.jsx` clause** from both
`App side` and `Triggers` — not just the `PCT`/`COMPLETIONS`/`CAR`/`REC` reads the earlier draft
named, but also the `YDS`/`TD`/`INT` reads at `:678-680` in the same clause.

> **Mirror (CR-05):** Adding or removing a `statType` must be coordinated — the pivot silently drops
> unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it,
> and the blast radius differs by key: `YDS`/`TD`/`ATT` are read by name in
> `src/utils/collegeMetrics.js:69-124`, so renaming those nulls the dominator rating and the QB
> college score; `PCT` and `COMPLETIONS` are read only in `src/components/PlayersTab.jsx:682-683`,
> where `PCT ?? (COMPLETIONS / ATT)` builds the completion-% term — renaming both silently drops
> that term from the Player Profile college stat line, which still renders without it. No error, no
> test failure, in either case. (Note the name list in `collegeMetrics.js:57-59` is a *comment*
> recording the confirmed 2023 field names; it is documentation, not a read.)

**After mirroring:** the `PCT`/`COMPLETIONS` half of that blast-radius sentence describes a consumer
that no longer exists. `YDS`/`TD`/`ATT` via `collegeMetrics.js` becomes the *only* live risk — and
note the closing `collegeMetrics.js:57-59` sentence guards **that** surviving consumer, so keep it.

### CR-07 · nflverse advstats (view-only)
`src/components/AdvancedStatsPanel.jsx` is a named trigger; §1 deletes it, leaving the family with
**no app-side consumer at all** (§4).

> **Mirror (CR-07):** Served-shape or sparsity-gate changes need the app loader updated in the same
> cycle. Ratios are recomputed season-level and never aggregated weekly. Activation into projection
> is parked — see the advstats grading-findings doc.

**After mirroring:** record in the entry that the family currently has no UI consumer — the loader
and its gate remain, so a served-shape change still breaks the loader silently.

### CR-08 · nflverse schedule (read-only)
`src/components/players/NflStatsTab.jsx` and `buildGameLog` in `src/utils/nflStats.js` are both
named triggers; §1 deletes the former and the function (§4).

> **Mirror (CR-08):** Shape or floor changes land in both repos together. Read-only — not wired into
> projection/scoring. The app-side consumer is `NflStatsTab`'s game log, joining on the per-season
> `team` from season-totals v3 (CR-02).

**After mirroring:** that Mirror sentence names a consumer this slice deletes — rewrite it to say
the family has no app-side consumer. Also fix the stale anchor while there: CR-08 cites
`NflStatsTab.jsx:273`; the live `loadNflSchedule` call is at `:275`.

### CR-17 · KTC value snapshots
§1 deletes `computeKtcRecentDelta` and its only consumer. Remove it from `App side` and `Triggers`;
**keep `computeKtcSignals`**, which still feeds the projection's `ktcHist*` capture factors.

> **Mirror (CR-17):** Keep the snapshot a **bare array** — wrapping it in the
> `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`,
> and the whole `ktcHist*` capture family plus the Explorer's ~30-day KTC Δ cell degrade to empty
> with **no error and no test failure**. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the
> app enumerates candidates by regex over manifest keys, so a path change makes every snapshot
> invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper`
> the same silent way — and note the record shape is constrained **twice** on the app side, since
> `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two
> scrapers are independent implementations of one shape, so a KTC markup change can break them
> separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual
> direction — the app deliberately opts this path in, so the change must be paired with revisiting
> `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must
> never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as
> if it were good data.

**After mirroring:** drop "plus the Explorer's ~30-day KTC Δ cell" — that consumer is gone, so
`ktcHist*` is the only thing that degrades. This **closes the long-standing `ktcHist` empty-cell
symptom by removing the cell**, not by fixing the sparse upstream series, which is unchanged and
still tracked separately.

### CR-18 · Signal registry rows
`docs/signal-registry.md` is CR-18's app-side trigger and §7 requires editing it — so CR-18 fires
too.

> **Mirror (CR-18):** This entry's data side is the one genuinely open set in the registry — a
> brand-new ingest adds a script the list above cannot already name. The listed sites are every one
> that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's
> reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this
> list. When a data-repo change adds, removes or reclassifies an ingested field, stat
> key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the
> exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

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
7. **Grep for stale references before declaring done** — extended for §4a's tooltip chain and §4's
   util deletions, which an earlier draft's list predated:
   `grep -rn "PlayersTab\|PlayersSurface\|OutlookTab\|NflStatsTab\|PlayersDataTable\|SpiderChart\|ValueChip\|ComparisonTray\|comparisonList\|comparison-list\|AdvancedStatsPanel\|AvailabilityHistory\|RankingsRow\|ExpandableTableRow\|WeeklyPlaceholder\|Tooltip\|TooltipContext\|useTooltipsEnabled\|tooltipsEnabled\|computeKtcRecentDelta\|buildGameLog\|computeHighLow" src/ docs/ CLAUDE.md README.md`
   — every remaining hit must be a deliberate historical mention in prose, not a live reference.
   **`README.md` is in scope**: `:166` lists `nflStats`'s four functions, two of which this slice
   deletes. Known live hits this grep must surface and you must fix: CLAUDE.md's `Tooltip.jsx` and
   `TooltipContext.jsx` table rows, the TopBar row's "tooltip toggle" clause, and that README line.
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
- **`src/utils/marketFilters.test.js:60`** — its test *name* asserts `DYNASTY_GROUP_MAP`/`NFL_TEAMS`
  are "imported from PlayersTab, not forked", which §2.1 deliberately makes false. **The assertions
  still pass**, so this goes green while documenting the opposite of the truth — rename it, and fix
  the same claim in `marketFilters.js:5-8`'s header comment.
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
- [ ] **Five-family** dark-data list recorded in master-plan §6a (`teamContext`, `nflGameLogs`,
      `advStats`, `collegeStats` display-side, `nflSchedule`)
- [ ] **Tooltip chain fully removed** (§4a) — `Tooltip.jsx`, `TooltipContext.jsx`, `App.jsx` state
      + provider, `AppShell`'s two props, `TopBar`'s toggle, and both test fixtures. No inert control
      left in the chrome
- [ ] `nflStats.buildGameLog`/`computeHighLow` deleted; `normalizeTeamForSchedule`/
      `computeSeasonAverages` **kept**
- [ ] `pctShareFmt`/`oneDecimalFmt` moved with `POSITION_STAT_COLUMNS` (§2.2)
- [ ] **All six CR entries mirrored and updated** — CR-03, CR-05, CR-07, CR-08, CR-17, CR-18 —
      Mirror text quoted **in full**, not truncated (CR-18's opens with two sentences that are easy
      to drop)
- [ ] `docs/signal-registry.md`, `docs/architecture.md`, `docs/integrations.md` updated (§7)
- [ ] `marketFilters.test.js:60`'s test name and `marketFilters.js:5-8`'s header no longer claim an
      import that §2.1 removed
- [ ] Master-plan §6a records the tooltip removal as a deliberately-removed capability with intent
      to return (§4a)
- [ ] `ProfileDataContext.jsx`'s doc comment updated from three providers to one (§3)
- [ ] §9 step 7's stale-reference grep is clean
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean · PROVISIONAL still 3
- [ ] Hand-back reports the test-count delta and the dead localStorage keys (§5)


---

## 12. Revision note (post plan-review, 2026-08-14)

Fifteen flags, all verified against live source and all fixed. On the one irreversible slice, two
categories mattered disproportionately.

**A whole subsystem was wrongly listed as surviving.** §0.3 claimed `Tooltip.jsx` lived on "via
TopBar, AppShell". It does not — those import `tooltipsEnabled`/`onToggleTooltips`, the *toggle
props*, never the component. All five of its importers are in the deletion set, so the tooltip
feature dies entirely, and `TooltipContext.Provider` plus a **visible `TopBar` control** would have
been left doing nothing. The audit had traced what `PlayersTab` consumes without tracing what
`Tooltip` is consumed *by*. **§4a is new**: the user wants tooltips back but not this design, so the
whole chain goes and they return as a designed feature in their own slice.

**Three of five cross-repo entries were missing, and two Mirror quotes were truncated.** §8 found
CR-05 and CR-17 by grepping the registry against the modules already known to be dying, then never
re-checked once the deletion set grew to include `AdvancedStatsPanel` (CR-07), `AvailabilityHistory`
(CR-03) and `NflStatsTab` (CR-08). CR-18 fires too, via the signal-registry edit §7 had omitted.
Both quoted Mirrors were also incomplete — for CR-05 the dropped sentence was precisely the one
guarding the *surviving* consumer. §8 is rewritten with all six, quoted in full.

**A third data family goes dark.** `loadNflSchedule` has exactly one live call site
(`NflStatsTab.jsx:275`), so nflverse schedule joins advstats and college-display — and
`nflStats.buildGameLog`/`computeHighLow` lose their only consumer. The dark-data list is **five**
families, not four.

**Three mechanical gaps:** `POSITION_STAT_COLUMNS` spreads two module-local helpers that must move
with it or the new module won't resolve; `marketFilters.test.js:60`'s test *name* asserts an import
§2.1 deliberately removes (assertions pass, so it would have gone green while documenting the
opposite of the truth); and `PlayersTab.jsx`/`SpiderChart.jsx`/`AvailabilityHistory.jsx` have no
test files, so three "(+ tests)" annotations had no referent.

**Verified clean:** the three cross-boundary imports really are exhaustive (no fourth static import,
no `vi.mock`, no dynamic import); the six-module orphan cascade and the already-dead `ValueChip`
both hold; both directories do empty out; the `comparisonList` block is consumed only via
`PlayersSurface`; `collegeStats` really does still feed `seasonProjection.js:106`; and
`importIntegrity.test.jsx` needs no change.


### 12.1 Second review pass (2026-08-14)

The revised file went back through the gate; it raised **12 more flags, all fixed**. Three were
**gaps the first round's own fixes introduced**, which is why the pass was run:

- **§2's ordering gate had become impossible.** Moving `COLUMNS`/`POSITION_STAT_COLUMNS` out of the
  frozen files while requiring a green suite "with the old files still on disk" cannot work, because
  those files still consume the maps (`OutlookTab.jsx:362,444,546`; `NflStatsTab.jsx:286`). §2.2 now
  requires them to import back for the single interim step.
- **The TE alias statements sit outside the object literals** (`OutlookTab.jsx:174`,
  `NflStatsTab.jsx:48`), so "move both maps and the two helpers" still dropped them — and Market's
  TE pill would have silently lost its Outlook and Production columns.
- **The `normalizeTeamForSchedule` justification was false.** It said "Market uses both"; Market
  imports only `computeSeasonAverages`. The real consumer is `playerTeam.js:25,63`, and it is a
  **CR-16** trigger — so an implementer verifying the stated reason would find nothing and could
  delete a function with a live cross-repo contract.

The rest were consistency debris from the first round's own editing: a sixth CR entry added under a
heading still reading "five", a fifth dark family added while two other places still said four,
CR-18's Mirror truncated in the very section that demands "verbatim and in full", §9's stale-grep
not extended for the tooltip chain it had just added, and §7/§11 not enumerating the CLAUDE.md rows
and two body-specified actions the deletions invalidate. §7's `signal-registry.md` scope also proved
too narrow — six row groups, not two.
