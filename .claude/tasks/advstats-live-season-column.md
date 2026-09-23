# Advstats: a live-season RACR column beside the completed season's

**Type:** small feature on a shipped surface. **Model:** sonnet.
**Baseline:** app `89a2342`. **Surface:** Market → Efficiency column set (WR / TE / ALL).

**What this slice does.** Market's Efficiency set shows `RACR` for the most recent *completed* season
(`dataSeason`). The live season's advstats file is in the store but no code reads it. This slice
loads it and renders a second column, `RACR <liveSeason>`, beside the existing one. Each live value
carries the weeks it rests on, e.g. `2.45 · 3 wks`. The slice is view-only: the live file never
reaches projection, scoring or grading.

---

## §0 Decisions already made — do not reopen

- The live season's values are shown **side by side** with the completed season's, never instead of
  them. Each live value is labelled with the weeks it rests on.
- View-only. The live file does not feed `projectedPPG`, the dynasty score, any `factors` entry,
  snapshots or grading.
- **Market is the only surface** (see §1.2 for why the Player Profile is out).

---

## §1 Findings against live source (where the brief and the repo disagree)

**1.1 — The live file is indistinguishable from a completed one at the manifest level.** The data
repo registers every advstats file `inProgress: false`, including the live season's file, which
mutates weekly (data `CLAUDE.md` Invariant 5, `lib/seasonIngest.mjs`; registry CR-07's Invariant pins
it). So `tryDataStore`'s `inProgress` gate lets the live file through with no `allowInProgress`, and
`complete: true` from the loader says nothing about whether the season is over. Freshness comes from
`lastModified`-keyed cache invalidation, which `loadAdvStats` already does. **Consequence:** the only
thing that marks a value as "live" is which season it was loaded for. That is why §2's exact-year
loader and §4's `year === liveSeason` check are both needed.

**1.2 — The Player Profile does not render advstats.** `usePlayerProfile.js:172-173` computes
`advStatsRow`/`advStatsSeason`, but nothing consumes them: `dp/PlayerDetailModal.jsx` is the hook's
only caller and reads neither field. Registry CR-07 already records this ("still reaches no
component"). The profile's `Target share` / `Air-yards share` rows (`UsageEfficiencySection`) come from
`outlookPositionStats.buildPositionStatSeries`. That is a careerStats-derived computation with Sleeper
team-share denominators, not the nflverse advstats ratios. Putting an nflverse live value beside that
series would pair two different definitions under one label. **The profile is out of scope.** Leave
`usePlayerProfile.js` and `ProfileDataContext` untouched, and do not add `advStatsLive` to the context.

**1.3 — Market's RACR has no gp<8 gate today.** `Market.jsx:613` is `_eff.racr = advRow?.racr ?? null`,
with no games or targets floor. The `gp<8` in the comment at `:127` and the banner at `:916-918`
belongs to the share columns (`TGT SH`/`AY SH`/`aDOT`/`RZ SH`/`SNAP%`) only. So the live column cannot
inherit a full-season gate by accident, because there is none. It still needs its own display rule
(§4.2), because RACR is a per-opportunity rate. It is also the one Efficiency rate that
`efficiency-rate-denominator-floors.md` did not floor. §4.2 floors only the live column. The
completed column's missing floor is reported in the hand-back, not changed here.

**1.4 — `dataSeason + 1` and `nflState.season` do not diverge.** `loadCareerHistory` builds
`s = 2012 … s < nflState.season` (`sleeperStats.js:340`). So `dataSeason` is always
`nflState.season − 1`, and `App.jsx:1062-1066` says so in writing. The brief's Jan–Feb divergence does
not happen in this repo. **Key the live load on `nflState.season` anyway**, following the
`currentSeasonTotals` effect (`App.jsx:972-987`). That source is semantically correct and does not
depend on that construction staying true.

**1.5 — The existing `loadAdvStats` fallback also affects the completed column.** `App.jsx:990-1001`
calls `loadAdvStats(dataSeason)`, which silently returns `dataSeason − 1` if `dataSeason`'s file is
missing or below the row floor. Market then renders that under a banner that says "Fixed to the
`dataSeason` season". §4.1 closes that gap with the same `year` check (one condition).

**1.6 — Writer-side floor.** The data repo does not write an advstats file below
`MIN_ADVSTATS_ROWS = 250`, and the app loader re-asserts that floor. So for the first weeks of a
season there may be no live file at all, and the loader returns `complete: false`. §4.3 hides the
column in that case. This is mechanism only; per §7's docs rule, do not write it as a claim about
today's store.

---

## §2 `src/api/advStats.js` — an exact-year loader

Refactor steps 1–5 of the loop body (`:47-81`) into a module-private
`async function loadAdvStatsYear(year, { allowInProgress = false } = {})`, which forwards
`allowInProgress` to its `tryDataStore` call (`:64`). It returns
`{ byId, year, complete: true, rowCount }` on success and `null` on every `continue` path. Behaviour,
logs and cache keys stay byte-for-byte what they are now.

- `loadAdvStats(currentSeason)` becomes `for (const year of [currentSeason, currentSeason - 1]) { const r = await loadAdvStatsYear(year); if (r) return r }`,
  then the existing graceful-absence return. **Its external behaviour is unchanged**, and every
  existing test in `advStats.test.js` must pass without edits.
- **New export `loadAdvStatsForSeason(year)`** returns
  `(await loadAdvStatsYear(year, { allowInProgress: true })) ?? EMPTY`. It opts in to
  `allowInProgress` because a live file *is* in progress. Today the data repo registers it
  `inProgress: false` (§1.1), but if that flag were ever corrected to `true`, the default
  `tryDataStore` gate would silently hide the column. This is the legitimate opt-in that CR-04's
  Mirror describes (§8). `loadAdvStats` keeps the default `false`.
  where `EMPTY` is the same `{ byId: null, year: null, complete: false, rowCount: 0 }` literal
  (hoist it to a module constant and use it in both loaders). **It never probes another year.**
- Both loaders share the `nfl-advstats/<year>` cache key. That is intended: a year has one file and
  one cache record, whichever loader asked for it.
- **Header comment.** Add a paragraph that documents both entry points:
  - `loadAdvStats` probes down one year and serves the completed-season column.
  - `loadAdvStatsForSeason` is exact-year with no fallback and serves the live-season column. A
    caller must never pass the live season to `loadAdvStats`, because the fallback would return the
    previous season's numbers under the live season's label.
  - A live file registers `inProgress: false` like every advstats file (§1.1). Weekly change is
    picked up through `lastModified`.

  The existing line "Probes currentSeason → currentSeason-1 … in the offseason the upcoming season's
  advstats are not yet published" states data availability. Rewrite it as mechanism only (§7 rule):
  "`loadAdvStats` probes `currentSeason → currentSeason − 1` and returns the first year that passes
  the manifest, shape and `MIN_ADVSTATS_ROWS` gates." Update the `@param` wording on `loadAdvStats`
  to match. Do not add any sentence about whether a live file exists or how many weeks it holds.
  **Also fix two stale consumer statements in the same header:** `:4-6` ("for DISPLAY ONLY in the
  Player Profile") and `:25-27` ("The panel then renders nothing"). Both describe the Explorer panel
  deleted in 1b Slice viii. The consumer is Market's Efficiency set, and an absent load renders `—`
  (completed column) or hides the column (live).

---

## §3 `src/App.jsx` — load the live season

- New state beside `advStats` (`:180`): `const [advStatsLive, setAdvStatsLive] = useState(null)`.
  Before adding it, confirm with `grep -n` that `advStatsLive` and `liveSeason` are unbound in
  `App.jsx`. They are unbound at baseline.
- New effect immediately after the `advStats` effect (`:990-1001`), modelled on the
  `currentSeasonTotals` effect (`:972-987`): guard `if (!nflState?.season) return`, a `cancelled`
  flag (Strict Mode), `const season = parseInt(nflState.season, 10)`,
  `loadAdvStatsForSeason(season)`, and set on resolve. **On reject, `console.warn('[advStatsLive] …')`
  and also set the graceful-absence literal** `{ byId: null, year: null, complete: false, rowCount: 0 }`
  (guarded by `cancelled`). That way `advStatsLive === null` always means *pending* and never *failed*,
  which §4.3's stale-sort rule depends on. Deps `[nflState]`. Comment: view-only, keyed on the live season (not `dataSeason`), exact-year
  loader so a missing live file can never render last season's numbers, and consumed only by
  Market's live RACR column.
- **Do not touch the existing `advStats` effect's code.** Rewrite only its comment (`:988-990`):
  "view-only display in the Player Profile" is stale (§2), so change it to Market's Efficiency set.
  "most-recent completed season" stays true. Add one clause saying the live season uses
  `loadAdvStatsForSeason` in the next effect.
- Market (`:1249-1262`): pass `advStatsLive={advStatsLive}` and
  `liveSeason={nflState?.season ? parseInt(nflState.season, 10) : null}`.
- **Do not add `advStatsLive` to `profileContextValue` or its deps** (§1.2).
- `projectionInputsGuard.test.js` and `advStatsViewOnly.test.js` must stay green unchanged. The new
  state does not reach `computeDynastyScore` or `computeNextSeasonProjection`, and no `src/utils/`
  pipeline module imports the loader.

---

## §4 Market — the live column

### 4.1 Completed column: pin to `dataSeason` (finding 1.5)

`Market.jsx:590` becomes
`const advRow = (advStats?.complete && advStats.year === dataSeason) ? (advStats.byId?.[id] ?? null) : null`.
Extend the comment at `:127` ("absent this season, gated out at gp<8, or advStats incomplete") with
"or loaded for a different season than `dataSeason`".

### 4.2 Display rule — new pure util `src/utils/liveAdvStats.js`

This util is view-only and has no React. It imports `MIN_TARGETS` from `./seasonEfficiency`.

```js
// Returns the live-season advstats map when, and only when, it was loaded for exactly liveSeason
// and liveSeason is later than the completed season the table is pinned to. Otherwise null.
export function usableLiveAdvStats(advStatsLive, liveSeason, dataSeason)
// → advStatsLive?.complete && Number.isFinite(liveSeason) && advStatsLive.year === liveSeason
//   && (dataSeason == null || liveSeason > dataSeason) ? advStatsLive.byId ?? null : null

// One player's live RACR cell. Returns null (renders "—") unless ALL hold: racr finite,
// components.targets finite and >= MIN_TARGETS, components.weeks a finite integer >= 1.
export function liveRacrCell(row)   // row = byId[id] or undefined
// → { racr: number, weeks: number, targets: number } | null
```

**Rule: `MIN_TARGETS` (25), the floor `EPA/TGT` already uses**, applied to the live file's own
`components.targets`. The reasons:

- RACR is a per-target rate. The repo floors per-opportunity rates and does not floor shares
  (`efficiency-rate-denominator-floors.md` §2). Reusing that floor gives one number for "per-target
  rate" across the set, rather than a second floor that someone has to defend.
- On the live file at `2026-09-19` (WR/TE only), a 1-target floor admitted RACR from −2.0 to 18.0,
  and those values would sort to the top of the column. At 5 targets the range was 0.20–3.33 across
  76 players. At 25 targets almost no one qualifies until about week 3–4. **The column is therefore
  mostly `—` for the first weeks of a season. That is intended ("omit rather than approximate"), and
  the popover says why.** Record this measurement in the task file only. It must not appear in any
  code comment or doc (§7).
- **A value is never rendered without its weeks.** If `weeks` is missing or non-finite, the cell is
  `null` and renders `—`, never a bare number.

`src/utils/liveAdvStats.test.js` covers:
- `usableLiveAdvStats` returns null for each of: `complete: false`; `year !== liveSeason` (the
  fallback case: a result with `year: 2025` passed with `liveSeason: 2026` must return **null**);
  `liveSeason` null or NaN; and `liveSeason <= dataSeason`. It returns `byId` when every condition
  holds.
- `liveRacrCell` returns null at 24 targets and a cell at 25 (the boundary). It returns null for
  `racr: null`, for `weeks` missing, for `weeks: 0`, and for an undefined row.

### 4.3 Column descriptor, visibility, sort

- `columnDescriptors.js` `EFFICIENCY_COLUMNS.WR`: insert `{ key: 'racrLive', metricId: 'racrLive' }`
  **directly after** the `racr` entry. TE and ALL alias WR, so they inherit it.
  `EFFICIENCY_SORTABLE_KEYS_BY_POS` (`Market.jsx:86-88`) picks the key up automatically.
- `usageEfficiency.js` `METRIC_META`: add `racrLive` as the **last** entry, after `drops`. It must go
  after `drops` so that CR-19's `METRIC_META` line anchors (`:169` and earlier) do not shift.
  - `label: 'RACR'` (the header appends the season; see below).
  - `format`/`deltaFormat` the same as `racr`.
  - `field: 'live-season advstats racr (nflverse advanced receiving, served precomputed), exact-year load'`
  - `note:` states the rule. Suggested wording: "Live season to date. Shown only at ≥ 25 targets
    (the EPA/target floor); each value shows the weeks it rests on. Blank below the floor." The
    implementer should read `MIN_TARGETS` rather than hard-code 25 if the note is built dynamically.
    Otherwise keep the literal and add a comment tying it to `MIN_TARGETS`. The note must say nothing
    about how many weeks exist now.
- **In Market:** `const liveById = useMemo(() => usableLiveAdvStats(advStatsLive, liveSeason, dataSeason), [...])`
  and `const showLiveRacr = liveById != null`.
  - **Visible columns:** everywhere the Efficiency set reads `EFFICIENCY_COLUMNS[posFilter] ?? …ALL`
    for rendering (the header/row branch at `:843`), filter out `racrLive` when `!showLiveRacr`.
    Derive `colSpan` from the filtered list. The column is **hidden** rather than shown as all dashes
    when no usable live file exists: offseason, a live file that has not yet reached the loader's row
    floor, or a load that failed.
  - **Header label:** `racrLive` renders as `` `RACR ${liveSeason}` ``. Use one helper,
    `efficiencyColumnLabel(c, liveSeason)`, for the header's `METRIC_META` label map (`:852-856`) and
    for `activeColumnLabel` (`:695-699`) so the two cannot disagree. When `liveSeason` is null the
    helper returns `'RACR (live)'`, never `RACR null`. Add `liveSeason` to `activeColumnLabel`'s deps
    (`:701`). The tooltip comes from `METRIC_META.racrLive` as for
    every other column.
  - **Row memo (`:568-624`):** in the WR/TE branch, after `_eff.racr`:
    `const live = liveRacrCell(liveById?.[id])`, `_eff.racrLive = live?.racr ?? null`,
    `_eff.racrLiveWeeks = live?.weeks ?? null`. Add `liveById` to the deps. Leave `racrLiveWeeks` out
    of `EFFICIENCY_COLUMNS`; it is carried for the cell only. QB/RB rows get no `racrLive`
    (`undefined` → `—`, matching today's handling of WR-only keys).
  - **Cell:** for `c.key === 'racrLive'` with a non-null value, render
    `` `${fmtEfficiencyValue(v, 'racrLive')} · ${weeks} ${weeks === 1 ? 'wk' : 'wks'}` ``. Null
    renders `—`. There is no code path that prints the value without the weeks suffix.
  - **Sort:** the existing efficiency comparator (`_eff?.[key]`, `compareNullsLast`) already handles
    `racrLive`; below-floor rows sink. **Stale sort on a hidden column:** in the validity effect
    (`:351-362`), also treat
    `sortState.column === 'racrLive' && advStatsLive != null && !showLiveRacr` as invalid, which
    falls back to `getEfficiencyDefaultSort(posFilter)`. Add `advStatsLive` and `showLiveRacr` to that
    effect's deps. **The `advStatsLive != null` term is load-bearing:** the live load is async, so on
    first render `showLiveRacr` is false. `setSortState` persists to localStorage
    (`usePlayersTable.js:23-26`), so without that term a saved `racrLive` sort would be overwritten on
    every in-season page load. `null` means pending (§3 guarantees a failed load sets the absence
    literal, not `null`). Without the rule as a whole, a restored `market-sort` of `racrLive` in the
    offseason sorts by a column that has no header, which is the §3.4a trap.
- **Banner (`:914-920`):** when `showLiveRacr`, append one sentence: "`RACR <liveSeason>` is the live
  season to date (≥ 25 targets), shown beside the completed season's." When the column is hidden,
  leave the banner unchanged.
- **Props:** add `advStatsLive`, `liveSeason` to the signature (`:310`). Extend the comment at
  `:305-307` to name them.

---

## §5 Tests

**Each new test must fail without the change it guards.** In the hand-back, show each one going red
when its guarded line is reverted: the `year === liveSeason` check, the floor, the weeks suffix, the
hidden-column rule, the filtered `colSpan`, the stale-sort fallback, the `advStatsLive != null`
pending term, the no-fallback loader and the §4.1 `year === dataSeason` pin.

- `src/api/advStats.test.js`, `loadAdvStatsForSeason`:
  - When the manifest has no entry for `year` but does for `year − 1`, it returns `complete: false`,
    and `getManifestEntry` is called **only** with `year`'s path. This is the no-fallback guarantee.
  - On success it returns `year === requested`.
  - A sparse file (below `MIN_ADVSTATS_ROWS`) returns `complete: false` and does not probe
    `year − 1`.
  - Every existing `loadAdvStats` test passes with no edits.
- `src/utils/liveAdvStats.test.js`: see §4.2.
- `Market.test.jsx` (extend the existing `renderEfficiency` harness at `:778-786`; its fixture
  `careerStats` gives `dataSeason`):
  - With a usable live fixture (`{ complete: true, year: dataSeason + 1, byId: { wr1: { racr: 2.45, components: { targets: 30, weeks: 3 } } } }`
    and `liveSeason: dataSeason + 1`), the header `RACR <dataSeason+1>` is present and the WR row
    shows `2.45 · 3 wks`. The completed `RACR` column still shows `1.15`.
  - Singular form: `weeks: 1` renders `· 1 wk`.
  - Below the floor (`targets: 24`), the cell renders `—`, not `2.45`.
  - `advStatsLive` with `year: dataSeason` (the fallback case) → the `RACR <year>` header is
    **absent**. Also absent for `complete: false`, and for `liveSeason: null`.
  - **Stale sort, settled-absent.** Seed **both** `market-column-set = 'efficiency'` and
    `market-sort = { column: 'racrLive', … }` in localStorage before mount, following the pattern at
    `Market.test.jsx:321-323`. Render with `advStatsLive: { complete: false, byId: null, year: null, rowCount: 0 }`
    and **no clicks**: the mount-time pill is `ALL`, and clicking Efficiency or a pill would reset the
    sort through `handleSelectColumnSet`/`handleSelectPosFilter` and pass without the new rule. Assert
    that the sort fell back to `getEfficiencyDefaultSort('ALL')`, via the sorted-by label or the
    persisted `market-sort`.
  - **Stale sort, pending.** Same seed with `advStatsLive: null`. The persisted `market-sort` must
    **still** be `racrLive`. This guards the `advStatsLive != null` term.
  - **colSpan.** For WR with a usable live fixture, the table's `colSpan` (or its header cell count)
    is one more than without it. The only existing `colSpan` test uses QB (`:989-994`) and cannot
    catch an unfiltered `cols`.
  - §4.1: `advStats` with `year: dataSeason − 1` → the completed RACR cell renders `—`, not `1.15`.
    **The existing fixture at `:778` has no `year`**, so update it to `year: <dataSeason>`, or the
    existing test `'RACR renders from advStats for WR…'` (`:924`) goes red for the right reason.
    That is a fixture correction, not a behavioural edit to the test; say so in the hand-back.
- Guards: `projectionInputsGuard.test.js` stays green unchanged. **`advStatsViewOnly.test.js` gains
  one assertion** in its per-module loop: `expect(src).not.toMatch(/liveAdvStats|loadAdvStatsForSeason/)`.
  The existing regex (`:36`) is case-sensitive and does not match `'./liveAdvStats'`, so today a
  pipeline import of the new util would pass the guard. Add **no** entry to `PIPELINE`, because
  `liveAdvStats.js` is a view util.
- `docsAvailabilityClaims.test.js` and `claudeMdSize.test.js` must stay green (§7).

---

## §6 Smoke

Recipe: `docs/architecture.md` → *Smoke-testing the running app*. Market → Efficiency → WR:
- Record whether `RACR <nflState.season>` is present.
  - If present: at least one row shows `x.xx · N wk(s)` and below-floor rows show `—`. Sort the
    column descending and check the top isn't a tiny-sample outlier. Check that the completed `RACR`
    column still shows values.
  - If absent: confirm in the console that `[advStatsLive]` or `[advStats]` logs explain it (no live
    file, or below the row floor). Both are the §4.3 hidden path and are correct.
- The live load's fallback-free behaviour can't be seen on the network, because
  `liveSeason − 1 === dataSeason` and the completed load fetches that file legitimately (§1.4).
  Instead, read the `[advStats] … year=` console lines and confirm that every line the live load
  emits names `year=<liveSeason>` and nothing else.
- Open a WR's pop-up: no change (§1.2).

---

## §7 Docs (same change)

**Rule (CLAUDE.md :285-291, "Reference docs state capability and mechanism"):** no doc or comment may
state whether a live advstats file currently exists, how many weeks it holds, or how many players
clear the floor today. State what is read, through which loader and gate, and what renders when the
read comes back empty (the column is hidden). This applies to code comments too.

- `CLAUDE.md:109-114` (*Advstats are display-only*): **minimal edit only.** The file is 24,471 of a
  25,000-byte ceiling (`claudeMdSize.test.js`), and Self-maintenance puts per-file detail in
  `docs/navigation.md`. Change "reads `RACR`" to "reads `RACR` for the completed and the live season",
  about 30 bytes. The loader name, floor, weeks suffix and hidden rule go in `docs/navigation.md` (below).
- `docs/integrations.md:309-317` (`advStats.js` section): document `loadAdvStatsForSeason`. Rewrite
  `:316` ("Probe order … In the offseason the upcoming season's advstats are not…") into
  mechanism-only form, and state that the live season uses the exact-year entry point. `:313` says it
  is loaded for "the Player Profile 'Advanced & Usage' panel", a panel deleted in 1b Slice viii.
  Correct that to Market's Efficiency set (stale, found in passing).
- `docs/ui.md:207` (the `RACR` bullet): add the live column, the floor, the weeks suffix, the hidden
  rule, and the §4.1 `dataSeason` pin.
- `docs/architecture.md:68` (state table): add an `advStatsLive` row with the same shape as
  `advStats`, loaded by `loadAdvStatsForSeason(nflState.season)`, consumed only by Market.
- `docs/navigation.md:73` (`advStats.js` row): name both entry points, the exact-year and no-fallback
  rule, and the `allowInProgress` opt-in. Add a `liveAdvStats.js` row to `docs/nav/utils.md`.
- `docs/nav/components.md:22` (the `market/Market.jsx` row): it lists the Efficiency props and the
  RACR read. Add `advStatsLive`/`liveSeason`, the `RACR <season>` column, the `MIN_TARGETS` floor, the
  weeks suffix, the hidden rule and the stale-sort pending rule.
- `docs/integrations.md:318` ("the panel renders nothing"): same stale-panel fix as `:313`.
- `docs/signal-registry.md:55` (advanced receiving row, **Current use** cell, CR-18): add "Market's
  Efficiency set also renders the **live** season's `racr` as a separate `RACR <season>` column
  (`loadAdvStatsForSeason`, exact-year; ≥ `MIN_TARGETS` targets; weeks shown)". **In the same cell,
  delete** "Recorded as **capture-only factor** in `seasonProjection.js` (WR/TE) — never moves
  `projectedPPG`". `seasonProjection.js` has no advstats, `racr` or `wopr` reference (verified by
  grep at planning), and the claim contradicts the display-only invariant. Replace it with "Never
  read by `seasonProjection.js` or any scoring module (`advStatsViewOnly.test.js`)". **Do not edit the
  coverage cells** (`:18`, `:55` "2012–2025"). A live-season coverage claim would break the docs rule
  above, and coverage belongs to CR-18's data→app direction.

---

## §8 Cross-repo impact

The brief expected none. **Four entries are triggered.** The first draft had two; the plan gate
added CR-19 and CR-04. All four follow the "a new call site is a trigger" rule that
`weekly-decision-2a-lineup-truth.md` §9 applied. **No data-repo file, schema, floor,
cadence or manifest family changes.** The obligation is emission. **Do not edit
`docs/cross-repo-registry.md`**, because it is a mirrored region under CR-24 byte-identity. Registry
corrections go to `.claude/tasks/data-repo-backlog.md` (next free id: **D-41**) with the commit SHA,
marked non-blocking, for the two-session route.

**CR-07 · nflverse advstats (view-only): triggered.** Its app-side Triggers name
`src/api/advStats.js` (edited, §2) and Market's `advStats?.byId?.[id]?.racr` read (edited, §4.1, and
joined by a second read of a second load). New near-side facts the entry does not list:
`loadAdvStatsForSeason`, the second `App.jsx` call site keyed on `nflState.season`, and
`src/utils/liveAdvStats.js`. The entry's `src/App.jsx:878` call-site anchor was already stale at
baseline (the `loadAdvStats` call is at `:997`).

Backlog **D-41** (Session 2 writes it with the real SHA; re-derive every anchor with `grep -n` on the
post-change tree):
- **App side**, append: `` , `loadAdvStatsForSeason` (exact-year, no fallback) in `src/api/advStats.js`, its `src/App.jsx` call site keyed on `nflState.season` (the live season), and `src/utils/liveAdvStats.js` (`usableLiveAdvStats`/`liveRacrCell` — the live column's year check and `MIN_TARGETS` floor, feeding Market's `RACR <season>` column) ``
- **App side**, correct: `src/App.jsx:878` → the post-change `loadAdvStats` line.
- **Triggers**, append on the app side: `` , `loadAdvStatsForSeason` in `src/api/advStats.js`, `src/utils/liveAdvStats.js`, and `market/Market.jsx`'s live-season read (`_eff.racrLive` via `usableLiveAdvStats`/`liveRacrCell`) ``
- **Invariant-adjacent sub-fields to name in App side:** the live column reads
  `components.targets` (the floor) and `components.weeks` (the label) **by name**, and relies on the
  loader result's `year`. A data-side rename of either sub-field silently blanks every live cell,
  and CR-07's Invariant currently pins only `components` as a whole. Proposed App-side clause:
  `` ; the live column additionally reads `components.targets` and `components.weeks` by name ``
- **Registry-stale, found by this slice's plan gate:** CR-07 `isValidAdvStats:122` → `:135`. CR-07
  does not list the `advStats` pass-throughs at `src/App.jsx:638` (`profileContextValue`, deps
  `:645`) and `:1259` (Market prop); the second of these now has an `advStatsLive` sibling. CR-04
  `getManifestEntry:65` → `:66`.
- **Data-side awareness (no data change):** the live season's advstats file now drives a visible
  column. The `MIN_ADVSTATS_ROWS` writer gate is load-bearing for it: the column stays hidden until
  the writer first clears 250 rows, and it updates through `lastModified`. Because the live loader
  opts in to `allowInProgress` (§2), the `inProgress: false` convention is **not** load-bearing for
  visibility. Either flag value renders.

> **Mirror:** Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**CR-18 · Signal registry rows: triggered.** §7 edits the Current-use cell at
`docs/signal-registry.md:55`, which is CR-18's app-side Trigger. The app owns this file, so the edit
itself is the app side. Nothing is owed data-side beyond awareness.

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**CR-19 · Market Efficiency stat keys: triggered.** *(The first draft said "not triggered" because no
Sleeper stat key changes. The plan gate overturned that: CR-19's app-side Triggers literally name
"`market/Market.jsx`'s Efficiency-set call sites" and "`utils/usageEfficiency.js`'s `METRIC_META`
field strings", and this slice adds one of each: the `racrLive` row-memo read and
`METRIC_META.racrLive.field`.)* No Sleeper stat key is added, read or removed, and the Mirror is
emitted for completeness. §3's prop additions and §4's row-memo lines also shift `Market.jsx`'s
`dropbacks:596` … `drops:616` anchors. §4.3 puts `METRIC_META.racrLive` last so that the
`usageEfficiency.js` anchors do **not** shift. Add to D-41: "CR-19 `Market.jsx` anchors drifted by
this commit; re-derive `dropbacks`/`sackPct`/`ayPerAtt`/`yac`/`btkl`/`drops` with `grep -n` at sync."

```text
- **Mirror:** Do not remove, rename or filter `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`
  or `rec_drop`. They drive five columns of Market's Efficiency set plus the Outlook `sacks` metric,
  and **nothing in either repo fails when they vanish** — no error, no test failure. `rush_yac`,
  `rush_btkl` and `rec_drop` degrade to `—`, which reads as "this player has no data" rather than
  "the pipeline broke." `pass_sack` and `pass_air_yd` were worse until this entry was written: their
  call sites divided by a denominator that survives the key's absence, so a missing key rendered a
  confident **`0.0`** rather than blanking. Both were hardened in the same change; the hazard is
  recorded because the *shape* invites the identical bug in any future consumer that divides by a
  surviving denominator. These keys are **view-only** — unlike CR-11/12/13 they never touch
  `projectedPPG`, the dynasty score or any `factors` entry, so changes need no graded gate; the cost
  of losing them is silent display corruption, not silent scoring drift.
```

**CR-04 · Manifest contract: triggered.** *(The first draft listed it as "checked, not triggered". The
plan gate overturned that.)* §2's `loadAdvStatsForSeason` is a new `allowInProgress: true` opt-in, the
third after KTC's and `loadCurrentSeasonTotals`'s. This is the "genuinely incomplete family" case the
Mirror explicitly permits: a live advstats file really is unfinished. Add to D-41 a proposed
sentence for CR-04's Mirror: `` A third `allowInProgress: true` opt-in exists since advstats-live-season-column.md — `loadAdvStatsForSeason` (CR-07), the live-season exact-year advstats read; same genuinely-incomplete case as season-totals, so a future `inProgress: true` on the live advstats file would still render. ``

> - **Mirror:** New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one.

**Checked, not triggered:** CR-21 (in-progress season-totals: a different family).

---

## §9 Done-definition

CLAUDE.md's ten steps. Also:
- `advStats.test.js`'s existing `loadAdvStats` cases pass **unedited**.
- `grep -rn "advStatsLive" src/` shows only `App.jsx` and `market/Market.jsx` (and tests). There is no
  `ProfileDataContext` or `usePlayerProfile` hit.
- The extended `advStatsViewOnly.test.js` (§5) covers all 14 `PIPELINE` modules. No separate grep
  is needed.
- `node -e "console.log(require('fs').statSync('CLAUDE.md').size)"` is under 25,000.
- `grep` the diff for comments or docs mentioning a specific week count, "currently", "not yet
  published", or "2026" as a claim about the store. There must be none (§7 rule).
- `data-repo-backlog.md` gets D-41 in the same commit.
- Hand-back: the SHA, the files touched, deviations, the red-under-revert evidence (§5), and the smoke
  result (§6).

---

## Plan review record (plan-reviewer, 2026-09-23)

The gate raised 16 flags. Each was verified against live source before it was applied. Applied:

| # | Flag | Decision |
|---|---|---|
| 1 | The stale-sort reset fires before the async live load settles, and the reset persists | **Applied** (§3, §4.3). A reject sets the absence literal, `null` means pending, and the rule requires `advStatsLive != null`. |
| 2 | The stale-sort test passes without the rule, because clicks reset the sort | **Applied** (§5). Seed both localStorage keys, make no clicks, and add a pending-case test. |
| 3 | D-41 omits the `components.targets`/`weeks` by-name reads and the Market live read | **Applied** (§8). |
| 4 | CR-19 is triggered by its literal trigger text | **Applied**. Verified at `cross-repo-registry.md` CR-19 Triggers. The Mirror is emitted. |
| 5 | CR-04: the live column's visibility depends on the `inProgress:false` convention | **Applied** as the `allowInProgress: true` opt-in (§2), which removes the dependency. The Mirror is emitted. |
| 6 | The view-only guard regex misses `liveAdvStats` | **Applied** (§5). One assertion is added to the guard. |
| 7 | The CLAUDE.md size ceiling | **Applied**. Verified at 24,471 bytes. The CLAUDE.md edit is cut to about 30 bytes, and the detail moves to `docs/navigation.md`. |
| 8 | `docs/nav/components.md:22`, stale "Profile/panel" text in the `advStats.js` header, `App.jsx:988-990`, `integrations.md:318` | **Applied** (§2, §3, §7). |
| 9 | `signal-registry.md:55`'s "capture-only factor in `seasonProjection.js`" is false | **Applied** (§7). Verified: `grep racr\|wopr\|advstat src/utils/seasonProjection.js` finds nothing. |
| 10 | The smoke network check can't discriminate | **Applied** (§6). The smoke now reads the console `year=` lines instead. |
| 11 | `activeColumnLabel` deps and the null-`liveSeason` label | **Applied** (§4.3). |
| 12 | No WR `colSpan` test | **Applied** (§5). |
| 13 | Header anchor `:849-852` → `:852-856` | **Applied**. |
| 14–16 | Registry-stale: CR-07 `isValidAdvStats:122`, the unlisted `App.jsx:638/:1259` pass-throughs, CR-04 `getManifestEntry:65` | **Applied** as D-41 lines (§8). The registry is not edited (CR-24). |

None were rejected.

---

## Implementation review record (implementation-reviewer on `89a2342..55e1373`, 2026-09-23)

Seven flags. Each was verified against the committed tree. Six are fixed in Fix pass 1; one is dismissed:

- **Dismissed: "the commit message emits no Mirror text."** The rule (CLAUDE.md → *Cross-repo contract
  registry*) makes the Mirror a **Session 1 output in the task file's `## Cross-repo impact`
  section**. §8 of this file quotes all four (CR-07, CR-18, CR-19, CR-04) verbatim, and the file is
  committed in `55e1373`. Nothing is owed in the commit message.
- Session 2's deviation (a), re-deriving the D-41 anchors, was verified sound by the reviewer.
  Deviation (b), the orphaned `b35dc45`, is fixed in 1.1 below.

## Fix pass 1

Scope: exactly the six items below. **Touch no other line.** Commit as one follow-up commit on top of
`55e1373` with the message `Advstats live column fix pass 1: doc accuracy, null-season test, D-41 provenance`.
Do not amend `55e1373`.

**1.1 — D-41 provenance.** `.claude/tasks/data-repo-backlog.md`, D-41's `**Found:**` line: replace
`` `b35dc45` `` with `` `55e1373` ``. `b35dc45` is the pre-amend commit that no branch contains, and it
will be garbage-collected. Because this is a follow-up commit, `55e1373` is final and stable. This
follows the D-34 precedent: found in `eb72127`, recorded by a later commit.

**1.2 — `docs/navigation.md:73`, the reason for `allowInProgress` is inverted.** Replace the parenthetical
"(a live file registers `inProgress: false` like every advstats file, so the default gate would
otherwise let it through unguarded if that flag were ever corrected)" with:
"(a live file registers `inProgress: false` like every advstats file; the opt-in keeps the column
rendering if that flag is ever set to `true`, which the default `tryDataStore` gate would otherwise
hide)". Leave the rest of the row unchanged.

**1.3 — `src/api/advStats.js`, the `loadAdvStatsForSeason` JSDoc (`:105`), states the present.** Reword
the sentence beginning "Today the data repo registers it" into mechanism form: "A live file registers
`inProgress: false` (the data repo's convention for every advstats file); opting in keeps an
`inProgress: true` registration readable rather than hidden by the default gate." This is a comment
change only. There is no code change.

**1.4 — `Market.test.jsx:1069-1073`, the null-season test cannot fail.** With `liveSeason: null` the helper
would label the column `'RACR (live)'`, which `/^RACR \d+$/` never matches. Rewrite the test body so
that it:
- renders the no-live baseline (`renderEfficiency()` → `goToEfficiency('WR')`) and records
  `getAllByRole('columnheader').length`, then runs `cleanup()`, following the colSpan test at `:1075-1081`;
- renders `{ advStatsLive: usableLive, liveSeason: null }` → `goToEfficiency('WR')`;
- asserts the header count equals the baseline **and**
  `queryByRole('columnheader', { name: /^RACR (\(live\)|\d+)$/ })` is not in the document.

In the hand-back, show the test going red when `usableLiveAdvStats`'s `Number.isFinite(liveSeason)`
term is removed, then restored.

**1.5 — `docs/nav/components.md:22` (the `market/Market.jsx` row).** Two fixes, both confined to that row:
- In the Efficiency column list, change
  `` WR/TE `TGT SH`/`AY SH`/`aDOT`/`EPA/TGT`/`RACR`/`RZ SH`/`SNAP%`/`DROPS` `` to
  `` WR/TE `TGT SH`/`AY SH`/`aDOT`/`EPA/TGT`/`RACR`/`RACR <season>` (live; hidden when unusable)/`RZ SH`/`SNAP%`/`DROPS` ``.
- Repair the broken splice "…never `RACR null`. and `TGT SH`/`AY SH`/…". The live-column sentences were
  inserted into the middle of the "Three derivations back it" list, which cut off its third item.
  Move the whole inserted live-column passage (from where it begins through "…never `RACR null`.") so
  that it sits **after** the end of the "Three derivations back it" list. Restore the list's original
  wording exactly: take it from `git show 89a2342:docs/nav/components.md`. Do not reword either
  passage beyond the move.

**1.6 — `docs/nav/utils.md` (the `usageEfficiency.js` row).** Change "12 entries" to "13 entries" and append
`` /`racrLive` `` after `` `drops` `` in that row's entry list. Add a short clause: `racrLive` is the
live-season RACR column's metadata, appended last so CR-19's line anchors hold.

**Done-definition for this pass:** `npm test` (all green), `npm run lint` (0), `npm run build` (clean).
`docsAvailabilityClaims.test.js` and `claudeMdSize.test.js` stay green. No smoke is needed, because
nothing is user-visible. Hand back the SHA, the diff stat and the 1.4 red-under-revert evidence.
**Do not push**: verification re-runs once on the fix diff first.
