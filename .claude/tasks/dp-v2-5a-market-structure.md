# Slice 5a — Market: VOLUME rename, the TREND gutter, and ACT removal

**Program:** [dp-v2.md](dp-v2.md). Follows [dp-v2-4c-environment.md](dp-v2-4c-environment.md)
(landed `0d0207d`).
**Model:** sonnet. Fully specified below.
**Baseline:** app `468cae0` · data `f0c1fc4`.

**Design source is not in this repo** — Claude Design project only. Everything needed is restated here.

---

## 0. Slice 5 splits, on the seam that has worked three times

| | Scope | New data threading |
|---|---|---|
| **5a — this file** | `PRODUCTION` → `VOLUME`, the two-group set control, the persistent **TREND gutter**, the `TrendCell` name collision, **ACT removed from nav** | `ktcHistory` only |
| **5b — next** | The **Efficiency** column set (per-position) and the four **environment filters** | `gameLogsByYear` + `teamContextByYear` into Market |

5b's two halves share one plumbing change, so they belong together; 5a is everything that does not
need it.

**Note on the fourth set.** After 5a the set control shows **three** members in two groups —
`MODEL & MARKET [VALUE][OUTLOOK]` · `ON FIELD [VOLUME]`. `EFFICIENCY` joins the right-hand group in
5b. A group with one member is a legitimate intermediate state; the grouping is what 5a delivers.

---

## 1. Confirmed against live source (`468cae0`)

| Fact | Site |
|---|---|
| `COLUMN_SETS = ['value', 'outlook', 'production']`, persisted to `localStorage['market-column-set']` and validated on read — **an unrecognised value silently falls back to `'value'`** | `market/Market.jsx:26,84-86` |
| Market's props are exactly `playerRows, loaded, careerStats, playerMap, seasonProjections, myTeamName, onOpenPlayerDetail` — **no `ktcHistory`, no Slice 2/4c data** | `Market.jsx:235-238` |
| **A module-local `function TrendCell({ trend })` already exists** — the Outlook set's Snap/Opp trend cell, rendering latest-vs-prior share with an arrow and a % delta | `Market.jsx:182`, used `:563-564` |
| `dp/TrendCell.jsx` (Slice 1) is the primitive: series → signed delta with glyph → window label, three scales, sorts on delta | `dp/TrendCell.jsx` |
| `loadKtcHistory` returns `series[sleeperId]` — but its entries are **objects** `{date, value, positionRank, valueVsPosMedian}`, **not numbers** | `ktcHistory.js:216-223` |
| **`seasonProjection.js:307` already calls `computeKtcSignals`** per player and spreads all 13 `ktcHist*` keys onto `factors` (`:312`) | `seasonProjection.js:307,312` |
| **Market already receives `seasonProjections`** and already reads `seasonProjections?.[id]` when building rows | `Market.jsx:236,353` |
| `ktcHistDeltaPct` is a rounded **fraction** (`0.052`), and `ktcHistWindowSpanDays` a bare **integer** (`96`) | `ktcHistory.js:286-287` |
| **Sort already has a precedent for a non-scalar key**: `if (key === '_snapTrend' \|\| key === '_oppTrend') return compareNullsLast(a[key]?.delta …)` | `Market.jsx:420` |
| **The Production branch returns early** and resolves every key except `full_name` as `a._avg?.[key]` | `Market.jsx:429-433` |
| `colSpan` is set per active set in **three** places — `11`, `6 + …`, `2 + cols.length` — and feeds `MarketTable`'s empty-state row | `Market.jsx:459,523,583`; `MarketTable.jsx:65` |
| `ktcHistory` initialises to `null`, and `loadKtcHistory` can resolve with `series: {}` | `App.jsx:139`; `ktcHistory.js:161` |
| `computeKtcSignals(series)` returns `ktcHistDelta`, `ktcHistDeltaPct`, `ktcHistConfidence`, `ktcHistWindowSpanDays` (and more) | `ktcHistory.js:254-300` |
| `ktcHistory` is already App.jsx state and already flows into the projection | `App.jsx:139,525` |
| `computeKtcRecentDelta` remains deleted — **and is not needed**; `computeKtcSignals` supersedes it | `grep` → absent |
| **`NAV_GROUPS` references `PRIMARY_NAV` by ARRAY INDEX** (`PRIMARY_NAV[2]`, `[3]`) — the two lists are positionally coupled | `shell/navItems.js:22-26` |
| `PRIMARY_NAV` is the flat list `BottomTabBar` consumes, capped at 5 | `navItems.js:5-11` |
| `/board` and `/trade` are gated placeholders with live routes | `CLAUDE.md` routing table |

---

## 2. `PRODUCTION` → `VOLUME`, and the migration the rename requires

The design renames the set because `VOLUME` is shorter and sharpens the contrast against
`EFFICIENCY` (5b). Rename the **key**, not just the label — `'production'` → `'volume'` — so the
persisted value and the code agree.

**This needs a one-time localStorage migration, and without it the bug is silent.**
`market-column-set` holds `'production'` for every user who has ever selected that set. The validated
read (`Market.jsx:84-86`) returns `'value'` for anything not in `COLUMN_SETS` — so after the rename
those users silently land on Value with no error and no indication their choice was dropped.

Map `'production'` → `'volume'` on read, once, and write the migrated value back. Do the same check for
**`market-production-season`**, the Production-set-only season selector key
(`CLAUDE.md` → `market/Market.jsx` row): decide whether to rename it to match or leave it, and say
which — but do not leave a key named for a set that no longer exists without a comment saying why.

**`market-sort` needs NO migration — settled in review.** Its stored payload is exactly
`{column, direction}` with **no set key** (`usePlayersTable.js:16-28`), and the existing effect
already falls back to the active set's default for a column the set does not carry. Production's sort
keys are stat keys from `columnDescriptors`, untouched by the set rename. Do not touch it.

**`market-production-season`: leave the key name alone.** Renaming it would silently drop every
user's stored season — the read is `Number(localStorage.getItem(...))` falling back to
`productionSeasons[0]` (`Market.jsx:89-95`), so a renamed key reads empty and resets. The rename buys
nothing but costs a silent data loss. **Add a one-line comment** saying the key is named for the set's
former name and is deliberately not migrated.

---

## 3. The two-group set control

```
MODEL & MARKET          ON FIELD
[ VALUE ][ OUTLOOK ]    [ VOLUME ]
```

Two labelled groups rather than four peers. The grouping is the point: it says the left pair is what
the model and the market think, and the right pair is what happened on the field. Mono micro-label
above each group, in the established uppercase style.

Adding a fifth set later should extend the right-hand group without touching the left.

---

## 4. The TREND gutter

**A gutter, not a set member.** It sits immediately right of `PLAYER`, inside its own hairline, and
**persists across every column set** — market movement is context for every other reading. Left of the
name it would compete with scanning; right of it, it reads as part of the identity.

### 4.1 Data — two sources, and only one of them is new
**The signals are already computed.** `seasonProjection.js:307` calls `computeKtcSignals` per player
and spreads all 13 `ktcHist*` keys onto `factors` (`:312`) — and **Market already takes
`seasonProjections` as a prop** and already reads `seasonProjections?.[id]` (`:236,353`). So:

| Needs | Source |
|---|---|
| delta, window, band | `seasonProjections[id].factors.ktcHistDeltaPct` / `.ktcHistWindowSpanDays` / `.ktcHistConfidence` — **already a prop** |
| sparkline values | `ktcHistory.series[id]` — **the only genuinely new thread** |

**Do not recompute `computeKtcSignals` per player in Market.** The earlier draft specified a
per-player memo doing exactly that, which would have created a second derivation site for a value with
one producer today. Read the factors.

**Two shape traps in the one thing you do thread:**
- **`series[id]` entries are objects, not numbers** — `{date, value, positionRank, valueVsPosMedian}`.
  `dp/TrendCell` keeps only `Number.isFinite(v)`, so passing them straight through renders **every bar
  as a void slot**. Map to `p.value` first.
- **`ktcHistory` can be `null`** (initial state) **and can resolve with `series: {}`** (no usable
  snapshot). Guard both; the column renders `—` until the post-`leagueData` effect resolves, which is
  correct rather than a bug.

**Formatting is yours, not the primitive's.** `ktcHistDeltaPct` is a rounded **fraction** — pass it
raw and the cell reads `▲ 0.052`. `ktcHistWindowSpanDays` is a bare **integer** — pass it raw and the
window label reads `96` with no unit. Format both at the call site (a percentage and a labelled
window, e.g. `13w`). Alternatively pass `ktcHistDelta`, the point delta, if a raw value reads better
than a percentage — state which you chose.

### 4.2 Use the Slice 1 primitive at `cell` scale
`dp/TrendCell` at `scale="cell"` (h14, bar 3px, gap 1px). Pass `values`, `delta`, `window` and `band`;
it owns the ordering and the band gating. **Do not** re-implement the encoding locally.

### 4.3 It sorts on delta — via a comparator branch, not a bare key
The earlier draft said "add a sort key to every set's `SORTABLE_KEYS`". That does not work, in two
different ways:

- The **Value and Outlook** branches resolve `a[key]` off the row, so the delta must actually be **on
  the row** — merged into each enriched-row memo — or reached by a comparator branch.
- The **Production/Volume** branch returns early and resolves everything except `full_name` as
  `a._avg?.[key]` (`Market.jsx:429-433`), so a gutter key there compares `undefined` for every row and
  **the sort is a silent no-op**.

**Follow the existing precedent.** `Market.jsx:420` already handles non-scalar keys:

```js
if (key === '_snapTrend' || key === '_oppTrend') return compareNullsLast(a[key]?.delta ?? null, …)
```

Add the gutter the same way — a comparator branch reading the delta — **and add it to the Production
branch too**, before its `_avg` fallback. Register the key in every set's `SORTABLE_KEYS` so it
survives the persisted-sort validation, but the comparator is what makes it work.

Nulls sink via `compareNullsLast`, as everywhere else.

### 4.3a `colSpan` — three sites, easy to miss
A persistent gutter adds a column to every set, so all three `colSpan` values need bumping:
`Market.jsx:459` (`11`), `:523` (`6 + …`) and `:583` (`2 + cols.length`). They feed `MarketTable`'s
empty-state row (`MarketTable.jsx:65`); getting one wrong shows a misaligned "no rows" cell only in
that set, which is easy to miss in a smoke that has rows.

### 4.4 Resolving the `TrendCell` collision
`Market.jsx:182` defines a module-local `TrendCell` for the Outlook set's Snap/Opp cells. Importing
`dp/TrendCell` into the same module is a redeclaration.

**Rename the local to `UsageTrendCell`.** Slice 1's task file offered "rename or — more likely correct
— delete it, since a snap-share trend *is* series + delta + window", but deleting means re-expressing
those two Outlook columns through the primitive, which changes what they look like and is not this
slice's scope. Rename now; converging them is a later, deliberate choice.

---

## 5. Remove the ACT group

The design: *"`ACT` is removed until it has a member. A rail with a dead third undermines the rest of
it."* Both members are gated placeholders — one third of the navigation currently leads nowhere.

- Remove the `act` group from `NAV_GROUPS`.
- Remove `trade` and `board` from `PRIMARY_NAV`, so they leave the mobile tab bar too.
- **Keep both routes.** `/trade` and `/board` still resolve and still render their gated placeholders;
  they simply are not linked. Do not add redirects — these are not retired routes like `/roster`, they
  are unbuilt ones.

**Fix the positional coupling while you are here.** `NAV_GROUPS` references `PRIMARY_NAV[2]` and
`[3]` by index, so removing entries from `PRIMARY_NAV` silently re-points the groups at whatever
shifts into those slots. Reference by `key` (a small lookup), not by index. This is the kind of
coupling that produces a wrong nav rather than an error.

**Only `AppShell.test.jsx:30-31` asserts nav structure** (`'Trade desk'` / `'Draft board'`); update
those to the new outcome. **`navRouting.test.jsx` does NOT** — it imports only `DEFAULT_ROUTE` and
asserts route→element mapping over its own local `TestRoutes`, so its `/board` and `/trade` cases pass
**unedited** and are exactly the "routes still resolve" evidence §6 asks for. Do not touch it.

---

## 6. Tests

- **Migration** — a stored `'production'` resolves to `'volume'` and is written back; an unrecognised
  value still falls back to `'value'`.
- **Gutter persistence** — the TREND column renders under all three sets, and is sortable from each.
- **Gutter encoding** — `low` band suppresses the series but keeps delta + window; `none` renders `—`;
  a null series renders `—` rather than an empty sparkline.
- **Sort** — sorting by TREND orders on delta with nulls last.
- **`UsageTrendCell`** — the Outlook Snap/Opp cells render exactly as before the rename (a rename
  should be behaviour-preserving; assert it).
- **Nav** — `NAV_GROUPS` has no `act`; `PRIMARY_NAV` excludes trade/board; `/trade` and `/board` still
  route to their placeholders (`navRouting.test.jsx`'s existing cases already prove this — leave them).
- **Sort actually sorts in every set**, Production/Volume included — the branch that returns early on
  `_avg` is where a gutter sort silently no-ops.
- **Null paths** — `ktcHistory === null` and `series: {}` both render `—` without throwing.
- **Series mapping** — an object-shaped series renders real bars, not voids (the `.map(p => p.value)`
  step); assert bars exist, since forgetting it produces a plausible-looking all-void column.
- Existing Market tests pass unedited except where they assert the old set key or the old nav — those
  are required updates, and should assert the correct new outcome.

---

## 7. Smoke

Per `CLAUDE.md` → Workflow convention:
- the set control shows two labelled groups; switching sets keeps the TREND column in place;
- a player with a healthy KTC series shows a sparkline + signed delta + window; one with a short
  series shows delta + window and no sparkline; one with none shows `—`;
- sorting by TREND puts the biggest risers together;
- the rail has no ACT group, and navigating directly to `/trade` still shows its placeholder;
- reload with a previously-selected Production set and confirm you land on **Volume**, not Value;
- no console errors.

---

## 8. Docs

| File | Edit |
|---|---|
| `CLAUDE.md` routing table + nav-chrome paragraph | ACT removed; `/board` and `/trade` are route-only |
| `CLAUDE.md` `market/Market.jsx` row | The set rename, the migration, the TREND gutter, the `ktcHistory` prop |
| `docs/ui.md` → *Market* | Same, plus the two-group control and the `UsageTrendCell` rename |
| **`docs/signal-registry.md:62,99`** | **Mandatory — CR-18 fires (§9).** Both cells read "**capture-only factor** (`ktcHist*` family, 13 keys) — never moves `projectedPPG`", which becomes incomplete once Market renders the family: it is capture-only **and displayed** |
| **`docs/cross-repo-registry.md`** | **CR-17 goes stale.** Its `Mirror` asserts `ktcHist*` "is now the only thing that degrades" if a served snapshot goes bad, and its app-side names `seasonProjection.js:11,307` as the only consumers. Both become wrong here, and the failure mode changes from a silent diagnostic gap to a **silently blank visible column**. Extending an existing entry stays in-repo |
| `.claude/tasks/data-repo-backlog.md` | Only if this slice surfaces a new data-repo ask (done-definition step 7) |

---

## 9. Cross-repo impact

**CR-18 fires.** The earlier draft left this open; review settled it. `docs/signal-registry.md:62` and
`:99` both carry the Current-use cell "**capture-only factor** (`ktcHist*` family, 13 keys) — never
moves `projectedPPG`". That stays true and becomes **incomplete**: after this slice the family is
capture-only *and* rendered. Per CLAUDE.md the `Mirror` text is a Session-1 deliverable:

**CR-18 · Signal registry rows (`docs/signal-registry.md`) — Mirror:**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
> script the list above cannot already name. The listed sites are every one that exists today; a *new*
> one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side
> against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds,
> removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or
> reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must
> make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the
> family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo
> when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs
> snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later.
> The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

Direction is **app→data-nothing** — nothing about coverage, source or ephemerality changes, only which
app code renders the family.

**CR-17 needs extending, not mirroring.** Its `Mirror` says `ktcHist*` "is now the only thing that
degrades" when a served KTC snapshot goes bad, and its app-side trigger list names
`seasonProjection.js:11,307` as the only `computeKtcSignals` consumers — accurate at HEAD, both stale
after this slice. More than bookkeeping: the **failure mode changes**. A bad snapshot used to produce
a silent diagnostic gap in `factors`; now it produces a **visibly blank column** in the app's primary
surface. Extending an existing entry stays in-repo (CLAUDE.md's residual-case rule covers only
genuinely *new* couplings), so do it here.

## 10. Done-definition

- [ ] `'production'` → `'volume'` everywhere, **with the localStorage migration** and the
      `market-production-season` decision stated
- [ ] Two-group set control
- [ ] TREND gutter right of `PLAYER`, present under **every** set, sortable from each, using
      `dp/TrendCell` at `cell` scale
- [ ] Delta/window/band read from **`seasonProjections[id].factors`** — `computeKtcSignals` is **not**
      called in Market
- [ ] `ktcHistory` threaded as an explicit prop **for the series only**; Market still props-only
- [ ] Series mapped to numbers (`p.value`) before reaching `dp/TrendCell`
- [ ] Delta and window **formatted** at the call site — no bare `0.052`, no unitless `96`
- [ ] Gutter sort works in **all three** sets via a comparator branch, Production included
- [ ] All three `colSpan` values bumped
- [ ] `market-sort` untouched; `market-production-season` left named, with a comment
- [ ] Local `TrendCell` renamed `UsageTrendCell`; Outlook cells behaviourally unchanged
- [ ] `ACT` gone from rail and tab bar; `/trade` and `/board` still route
- [ ] `NAV_GROUPS` references `PRIMARY_NAV` by key, not index
- [ ] `docs/signal-registry.md` and CR-17 updated (§8, §9)
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect the standing three
- [ ] Smoked per §7

---

## 11. Hand-back should report

- What you did with `market-production-season`, and why.
- Confirmation that the Outlook Snap/Opp columns are visually unchanged by the rename.
- The three TREND states you saw in the smoke (full / delta-only / `—`) and on whom.
- The `signal-registry.md` / CR-18 determination.
- Anything in §1 that had drifted from `468cae0`.

---

## 12. Plan-review record (2026-08-21)

Twelve flags, all verified and applied; §4 was rewritten. The most useful one removed work rather
than adding it.

**The signals are already computed.** `seasonProjection.js:307` calls `computeKtcSignals` per player
and spreads all 13 `ktcHist*` keys onto `factors`, and Market **already takes `seasonProjections` as a
prop**. The draft's per-player memo would have been a second derivation site for a value with one
producer. Only the sparkline's raw series genuinely needs threading.

**Two shape traps in the one thing still threaded.** `series[id]` entries are objects
`{date, value, …}`, not numbers — and `dp/TrendCell` keeps only finite values, so passing them
straight through renders **every bar as a void slot**, which looks like sparse data rather than a bug.
And `ktcHistDeltaPct` is a rounded fraction while `ktcHistWindowSpanDays` is a bare integer, so
unformatted they read `▲ 0.052` and `96`.

**The sort spec was wrong twice.** Value/Outlook resolve `a[key]` off the row, so a key alone does not
reach a nested delta; and the Production branch returns early on `a._avg?.[key]`, where a gutter key
compares `undefined` and the sort is a **silent no-op**. There is an existing precedent for exactly
this — `_snapTrend`/`_oppTrend` at `:420` — so the fix is a comparator branch in both paths.

**`colSpan` is set in three places** and feeds the empty-state row; a persistent column needs all
three bumped, and getting one wrong only shows up in a set with no rows.

**Two migration questions resolved in the other direction from the draft.** `market-sort` needs **no**
migration — its payload carries no set key. And `market-production-season` should **not** be renamed:
the read falls back to `productionSeasons[0]`, so a renamed key silently drops every stored season.

**One test claim was simply wrong:** `navRouting.test.jsx` does not assert nav structure at all — it
tests route→element mapping over its own local routes, so its `/board` and `/trade` cases pass
unedited and are the evidence that the routes survive. Only `AppShell.test.jsx:30-31` needs updating.

**Cross-repo:** CR-18 fires (settled, `Mirror` quoted) — the fourth slice in this program to do so
after expecting none. And **CR-17 goes stale in a way that matters**: its `Mirror` claims `ktcHist*`
is "the only thing that degrades" on a bad snapshot, and the failure mode changes here from a silent
diagnostic gap to a visibly blank column on the app's primary surface.

