# Slice iv — Portfolio screen, thinned

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `189aa49`, then revised after a `plan-reviewer` pass that raised **17 flags — all
verified against source and all fixed** (see §14, worth reading first: three of them were guards
that read correct and would have silently produced wrong numbers). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md). **Read §4a first** — the two
standing product directives shaped this slice more than any other, because Portfolio is the most
aggregate-heavy surface in the program and §4a.2 cut five of its design elements outright. Then
§2.4 (the `PROVISIONAL` convention) and §6.

**Predecessors:** Slice i (`e39ad20`) IA + tokens; Slice ii (`21cb6bb`) the detail pop-up;
Slice iii (`189aa49`) the Market table, which established every pattern this slice follows —
**read `src/components/market/Market.jsx` and `src/components/dp/MarketTable.jsx` before starting.**

**This slice:** replace the `/portfolio` placeholder with the thinned Portfolio screen — header,
four metric tiles, value-by-age-band chart, and a holdings table whose rows open the Slice ii
pop-up. Portfolio is the last of the two main surfaces; after this, `1b`'s structural work is done
except the pop-up's full version (Slice v).

**Explicitly NOT this slice — five elements CUT by §4a.2, plus one more found during scoping:**
- **"Needs a decision" alert cards** — closes §5.3. The §2.3 heuristic is **not built**.
- **Holdings `CALL` column** — closes §5.8.
- **The three tile deltas** (`▲3.2%`, `▲4.6%`, `+1,490 in 30 days`). Tile *values* all ship (§3).
- **30 days / Season / All time segmented control.**
- **Header's "contending window open" clause.**
- **NEW — the "· 3 rookie picks" clause in the subline.** Not a §4a.2 cut but a hard data gap
  discovered while scoping this file: it is not derivable (§0). Ship "N assets" alone.

Also not this slice: retiring `/players` (still gated on Market reaching filter parity — Slice iii
§1), the pop-up's tab strip/compare matrix (Slice v), and any chrome recolor.

---

## 0. Confirmed against live source

- `src/components/portfolio/Portfolio.jsx` — the Slice i placeholder: no props, already wrapped in
  `bg-dp-canvas`. Keep that wrapper (Slice i §1.1); replace the body.
- `src/App.jsx:1003` — `<Route path="/portfolio" element={<Portfolio />} />`, currently prop-less.
  **Mirror the `Market` call site at `:1005-1014`** for the prop-passing pattern; Portfolio needs a
  superset (§4).
- `src/App.jsx:601` — `myTeamName` memo (`rosterTeams.find(t => t.ownerId === user?.user_id)?.teamName`).
  Already threaded to Market; thread the same value here.
- `src/App.jsx:181` — `positionPeakAge` is computed by `computeEmpiricalAgeCurves` and is
  App-level state. **Do not pass it to Portfolio** — the pipeline already folds it into each row's
  `dynastyScore.signals` (below), which is the single source §5.1 uses.
- `src/App.jsx:747-758` — `rosterTeams` assembly. Each team carries **`starters`** (enriched
  player objects, slot `'Starter'`), `bench`, `reserve`. This makes the "Proj. points · starters
  only" tile derivable (§3.4), with the caveats there.
  **Critical: `enrichPlayer` (`:741-744`) keys the player as `id`, NOT `player_id`** — the returned
  shape is `{ id, slot, full_name, position, team, age }`. `seasonProjections[starter.player_id]`
  is `undefined` for every starter. Join on `starter.id`.
- **`currentSeasonPPG` is `0`, never `null`** (`App.jsx:342-345` — it falls back to `0` when
  `recent?.gamesPlayed` is not `> 0`). Any guard written as "null" against it never fires.
  `Market.jsx:452` guards correctly with `row.currentSeasonPPG > 0`; copy that.
- **`careerSparkline` is 0-padded** (`App.jsx:357-361`): absent seasons become `0`, so a missing
  season is **indistinguishable from a real 0.0 PPG season**. Any "render missing seasons
  differently" instruction is unimplementable — see §5.
- **Several row fields are ABSENT, not null**, when unavailable: `ktcValue` is not merged onto rows
  at all when `ktcMap` is empty (`App.jsx:452-458`), and `projectedPPG` is absent when a player has
  no projection (`:556-566`). **Use `!= null` / presence checks, never `=== null`**, throughout
  §3–§5.
- **`dynastyScore.signals` already carries `yearsFromPeak` and `peakAge`** (`dynastyScore.js:641-642`
  computes them, `:1048-1049` attaches them), derived from the same `positionPeakAge` map **plus** a
  `derivePeakAge` fallback. This is why §5.1 reads the row rather than re-deriving. Note `signals`
  is `null` on the non-scored path (`:631`).
- `src/App.jsx:397` — `ownerTeamName` is set per row from `ownerMap`. Grouping
  `playerRowsWithProj` by it is how every league-comparison figure in §3 is derived.
- **`rookieDraftPicks` is NOT a set of owned future picks.** `App.jsx:764-775` builds
  `{ [player_id]: { round, pick } }` from `getDraftPicks` of the most recent rookie draft by
  season (no completion check — it takes the first after a season-descending sort) — i.e. it maps *already-drafted players* to the pick that selected them, and is consumed
  as draft-capital signal at `:381`. Sleeper's traded-picks endpoint is not loaded anywhere. There
  is therefore **no representation of unused/future rookie picks as tradeable assets**, so the
  design's "· 3 rookie picks" cannot be shown. Cut the clause (see "Explicitly NOT").
- `src/components/market/Market.jsx` (Slice iii) — the reference implementation for a dp surface:
  `usePlayersTable` usage (`:263-264`), `SORTABLE_KEYS` validation (`:277-280`), derived-row memo
  (`:324`), dp `SortTh` usage (`:440`). Portfolio's table is **much simpler** (no column sets, no
  season selector) but should read as a sibling of this file, not a different codebase.
- `src/components/dp/MarketTable.jsx` (102 lines) — the dp table shell + `SortTh`. **It cannot be
  reused as-is**: it hard-codes the ALL/QB/RB/WR/TE pill row and always renders it (`:40-52`), and
  its `PAGE_SIZE` is a module constant with a footer that renders whenever `totalCount > 0`
  (`:7`, `:77-98`). Portfolio has neither pills nor a pager. See §6.
- **Market's cell components are defined inline and unexported** — `CareerBars` (6px bars, 2px gap,
  22px tall), `PlayerCell`, `ClickableRow` and the Δ cell (`Market.jsx:147-166`, `:451-477`).
  §6 moves them to a shared module rather than letting Portfolio fork them.
- **All `--color-dp-*` names used below exist** in `src/index.css`'s `@theme` (verified against the
  Slice i block). A dp utility naming a non-existent token fails silently as an unstyled element.

---

## 1. Ownership is the whole screen's filter

Everything on Portfolio is scoped to rows where `ownerTeamName === myTeamName`. Derive that set
**once**, in a memo, and pass it to every section — the tiles, the chart and the table all read the
same array. Do not re-filter per section.

**When `myTeamName` is null** (the user's roster isn't resolvable — `App.jsx:601` returns null if
no roster matches `user.user_id`), Portfolio has nothing to show. Render a single explanatory empty
state, not four `—` tiles above an empty chart and table. This is a real state, not a defensive
nicety: it is what a user sees in a league they don't have a roster in.

---

## 2. Header

`Portfolio` at 22/700, subline in `text-dp-muted` 13px: **`N assets`** where N is the owned-row
count. **Caveat to word around, not ignore:** `playerRows` contains only QB/RB/WR/TE
(`App.jsx:340`), so N can never equal a Sleeper roster's size — K, DEF and any other rostered
player are absent. Label it in terms of what it is, e.g. `N skill players`, rather than `N assets`,
which implies a complete roster count. Nothing else — the posture clause and the rookie-pick clause are both cut ("Explicitly
NOT"), and the horizon segmented control is cut, so the header's right side is empty in v1.

---

## 3. The four metric tiles

`grid-cols-4 gap-[14px]`, each `bg-dp-card rounded-[10px] p-[14px_16px]`: mono 11px uppercase
`text-dp-muted` label, then a mono 24/600 `-0.02em` value, then a 12px `text-dp-muted` note.

**No deltas.** The design's coloured `▲3.2%` / `▼0.3` / `top 4` / `▲4.6%` are cut (§4a.2) — each
needs a prior snapshot of the same aggregate, which does not exist. The note line stays where it is
real.

All four values below are computed from live rows. Where a note compares against the league, derive
it by grouping **all** of `playerRows` by `ownerTeamName` — not just owned rows.

### 3.1 Roster value
`Σ ktcValue` over owned rows, skipping null `ktcValue`. Note: **`Nth of M`** — the rank of your
team's total among all teams' totals, descending. `M` is the number of distinct non-null
`ownerTeamName` values — i.e. teams holding at least one skill player, which is normally every
team but is not guaranteed. Skip rows whose `ktcValue` is absent (not "null" — see §0).

### 3.2 Weighted age
`Σ(age × ktcValue) / Σ ktcValue` over owned rows with **both** age and `ktcValue` non-null, to one
decimal. Note: **`League median N`** — the median of the same figure computed per team.
Render `—` when your own denominator is 0, **and exclude from the median any team whose
denominator is 0** (no valued rows with an age), or the median is `NaN`.

### 3.3 Concentration
Share of your total value held by your **top four** assets by `ktcValue`:
`Σ(top 4 ktcValue) / Σ(all owned ktcValue)`, as a whole percentage. Note: the design's
"Four assets hold most of your value" is a *claim*, not a label — reword to something always true,
e.g. `Top 4 of N assets by value`. Render `—` when fewer than four owned rows have a `ktcValue`.

### 3.4 Projected points
`Σ (projectedPPG × projectedGames)` over the **starters** of your `rosterTeams` entry
(`App.jsx:747-758`), matching the design's "Next season, starters only".

**Join on `starter.id`, not `starter.player_id`.** `enrichPlayer` (`App.jsx:741-744`) returns
`{ id, slot, full_name, position, team, age }` — there is no `player_id` on those objects, so
`seasonProjections[starter.player_id]` is `undefined` for **every** starter and the tile silently
sums to `0`. This is the single most likely way to ship a wrong-but-plausible number on this
screen.

**Three degenerate cases, all rendering `—`** — an earlier draft guarded only the first, which is
the one that never actually happens:
1. `starters` is empty or absent (offseason / lineup never set).
2. **`seasonProjections` is null** — it is null until its memo resolves (`App.jsx:517-518`), so a
   render during load would otherwise show `0.0`.
3. **No starter carried a projection** — i.e. the contributing-starter count is `0` after the join.
   This is the real failure mode the guard exists for: a full starters array whose players all lack
   projections sums to `0` and renders a completely plausible "0.0".

Track the contributing count explicitly and render `—` when it is `0`; do not infer from the sum,
since a genuine sum of zero and an empty join are indistinguishable. **Never fall back to summing
the whole roster** — that produces a number ~3× too large that looks entirely reasonable. Add a
source comment saying so.

---

## 4. Value by age band

Card, `p-[16px_18px]`. Header `Value by age band` 13/600 + `where your capital sits on the age
curve` 12px `text-dp-muted`.

Bars: `flex items-end gap-[14px] h-[190px]`, each band a `flex-1` column of mono 11px value → bar
(`w-full`, `rounded-t-[5px] rounded-b-[2px]`) → 11px `text-dp-muted` label.

Bands and colours per the design: `21–23`, `24–25` → `bg-dp-up`; `26–28` → `bg-dp-neutral`;
`29–30`, `31+` → `bg-dp-down`. **Make the first band lower-open (`≤23`, not `21–23`)** — a
21-and-under rookie would otherwise fall in no bucket and vanish from the chart while still
counting in §3.1's roster-value total, so the bars would not sum to the tile. Value per band = `Σ ktcValue` of owned rows whose age falls in it.
Bar heights are proportional to the largest band, not absolute pixel values from the mock.

Legend beneath: three 8px squares + `Appreciating (≤25)` / `Peak (26–28)` / `Depreciating (29+)`.

**Owned rows with a null age are excluded from every band** — do not bucket them into `31+`.
If that drops any rows, that is correct and needs no note.

---

## 5. Holdings table

Rows = owned rows, sorted by `ktcValue` descending by default. Reuse `usePlayersTable`
(`storageKey: 'portfolio-sort'`) exactly as Market does, including the `SORTABLE_KEYS` validation
pattern (`Market.jsx:277-280`) — Portfolio has one column set, so the set-switch machinery of
Slice iii §3.4a does **not** apply, but the restored-key validation still does.

Columns:

| Column | Content | Sort key |
|---|---|---|
| `ASSET` | reuse Market's `PlayerCell` (§6) — mono position tag + name over `age · team · Year N` meta | `full_name` |
| `VALUE` | 6px meter (track `bg-dp-border-row`, fill `bg-dp-up`) width = `ktcValue ÷ max owned ktcValue`, plus the mono number right-aligned. `—` when `ktcValue` is absent | `ktcValue` |
| `5-YR PPG` | reuse Market's `CareerBars` (§6) over `row.careerSparkline` — **do not respec its dimensions** | *(none — non-sortable)* |
| `PROJ Δ` | `projectedPPG − currentSeasonPPG`, mono, `↑ +N` / `↓ -N`, `text-dp-up-text` / `text-dp-down-text` | `projDelta` (materialized — see below) |
| `HORIZON` | outlined pill — see §5.1 | `yearsFromPeak` (materialized) |

**`PROJ Δ` guard — the obvious one is wrong.** `currentSeasonPPG` is `0`, never null (§0), so a
"null on either side" check never fires and a player with no prior season renders
`projectedPPG − 0`: a fabricated full-projection gain that looks like a breakout. **Guard with
`row.currentSeasonPPG > 0 && projectedPPG != null`**, exactly as `Market.jsx:452` does; otherwise
render `—`.

**`5-YR PPG` — drop the "missing seasons render as a 3px stub" instruction.** It is not
implementable: `careerSparkline` 0-pads absent seasons (§0), so a missing season and a genuine
0.0 PPG season are the same value. Market's `CareerBars` renders all five uniformly and conflates
them; match that rather than inventing a distinction the data cannot support.

**Both derived columns need materialized sort keys.** `usePlayersTable`'s comparator sorts on a row
property, so add `projDelta` and `yearsFromPeak` to the derived-row memo (the same place Market adds
`dynastyScoreValue` at `Market.jsx:324`), and list every sortable key in a `SORTABLE_KEYS` set so
the restored-key validation has something to validate against. Note `handleSort` defaults any
non-`full_name` column to `desc` (`usePlayersTable.js:41-42`) — fine for both of these.

Use `compareNullsLast` so rows missing either value sink regardless of direction.

**Cut from the design's column list:** `30D` (the 30-day KTC Δ) and `CALL`. `CALL` is a §4a.2 cut.
`30D` is the same broken `ktcHist` series Slice iii cut from Market — **cut it the same way, and do
not tag it.** Master-plan §6 says to "follow Slice ii's `PROVISIONAL` precedent" here; that
guidance predates Slice iii, which established the sharper precedent: a *tile* that ships with one
missing sub-value gets a tag (Slice ii), a whole *column* that cannot be populated gets cut (Slice
iii). Portfolio's 30D is a column. **This slice therefore adds no `PROVISIONAL` sites** (§8).

Row click and Enter/Space → `onOpenPlayerDetail(row.player_id)`, exactly as
`Market.jsx` does. Rows need `role="button"` and `tabIndex={0}`.

### 5.1 HORIZON — derived from the empirical age curve, not from fixed age bands

The design's pill is Appreciating / Peak / Depreciating. Master-plan §2.1 flagged that fixed
position-blind bands are wrong (a 29-year-old QB is not a 29-year-old RB) and recommended deriving
from the per-position curve.

**Read it off the row — do not re-derive it.** An earlier draft of this section specified
`age − positionPeakAge[position]` computed in the component from a new prop. That would have been a
**second source of truth**: the pipeline already computes exactly this and attaches it as
`row.dynastyScore.signals.yearsFromPeak` (with `.peakAge` alongside), using the same
`positionPeakAge` map **plus** a `derivePeakAge` fallback the prop-only version lacks
(`dynastyScore.js:641-642`, `:1048-1049`). The two would silently disagree for any player hitting
that fallback. So:

```
const yfp = row.dynastyScore?.signals?.yearsFromPeak ?? null
  yfp == null  → '—'
  yfp <= -2    → Appreciating   (up-border / up-text)
  -2 < yfp < 2 → Peak           (slate-2 / text-3)
  yfp >= 2     → Depreciating   (down-border / down-text)
```

`signals` is `null` on the non-scored path (`dynastyScore.js:631`), and `yearsFromPeak` is itself
null when `peakAge` or `age` is missing — both collapse to `—` via the optional chain above. Drop
`positionPeakAge` from the prop list entirely (§7).

**This is not a `PROVISIONAL(heuristic)`.** The quantity is computed by the pipeline from measured
per-position curves; the only judgment is the ±2 display boundary over an already-real number. Put
the thresholds in one named constant so they are trivial to tune. **Master-plan §2.4's index still
lists this pill as `heuristic` — amending that row is part of this slice** (§11).

**Note the deliberate inconsistency with §4's chart**, and comment it: the chart uses the design's
fixed age bands (correct — it aggregates *value* across a roster, where position-blind bands are
the point), while the per-player pill uses position-relative peak distance (correct — a per-player
judgment must account for position). They will occasionally disagree for one player, and that is
intended, not a bug.

---

## 6. Reuse `MarketTable`, or a new shell?

An earlier draft left this open ("reuse if it fits"). **It does not fit, and the answer is now
decided** — checking the file settles it:

- `MarketTable` **hard-codes the ALL/QB/RB/WR/TE position pill row and always renders it**
  (`MarketTable.jsx:40-52`). Portfolio has no position filter, so it cannot take the shell as-is.
- Its `PAGE_SIZE` is a **module constant, not a prop** (`:7`), and the pager footer renders whenever
  `totalCount > 0` (`:77-98`; Prev/Next merely disable). So the earlier "pass a page size large
  enough that the pager never renders" escape hatch is impossible.

**Decision — split the shared parts out rather than fork them:**

1. **Move the presentational cell components out of `Market.jsx` into `src/components/dp/cells.jsx`
   and export them:** `CareerBars`, `PlayerCell`, `ClickableRow`, and the Δ cell
   (`Market.jsx:147-166`, `:451-477`). Import them into both Market and Portfolio. Slice iii's own
   precedent is import-don't-copy; respeccing these cells in Portfolio would fork them, and the
   dimensions would already have drifted (Market's `CareerBars` is 6px/2px/22px, the earlier draft
   of §5 said 7px/gap-3/h-20).
2. **Move the dp `SortTh` into `dp/cells.jsx` too** if it is defined inside `MarketTable`.
3. **Give Portfolio its own thin shell** (`dp/PortfolioTable.jsx`, or inline in `Portfolio.jsx` if
   it stays short) — no pills, no pager. Do **not** add conditional-pill / conditional-pager props
   to `MarketTable`; that grows a shared component to serve two callers with different chrome,
   which is how `PlayersDataTable` ended up hard to reuse in the first place.

**Constraint on the move: Market's rendering must not change.** This is a pure relocation —
`Market.test.jsx`'s 47 tests must pass **untouched**. If any assertion needs editing to stay green,
the move altered behaviour: stop and report rather than adjusting the test.

This closes the fork risk rather than deferring it, so no new convergence debt is created.

---

## 7. Props from `App.jsx`

Mirror the `Market` call site (`:1005-1014`), adding what the tiles and chart need:

```jsx
<Portfolio
  playerRows={playerRowsWithProj}
  loaded={!!careerStats}
  careerStats={careerStats}
  rosterTeams={leagueData.rosterTeams}
  seasonProjections={seasonProjections}
  myTeamName={myTeamName}
  onOpenPlayerDetail={openPlayerDetail}
/>
```

`rosterTeams` is the only new one; it already exists at App level and requires no new state.
**`positionPeakAge` is deliberately absent** — §5.1 reads `yearsFromPeak` off the row instead.

**Default every prop the component dereferences**, not just two: `playerRows = []`, `loaded = false`,
`rosterTeams = []`, `seasonProjections = null`, `myTeamName = null`, `onOpenPlayerDetail = () => {}`.
An earlier draft defaulted only the first two, which would not have satisfied §10's
"mounts with no props" test — the tiles and chart dereference the rest.

---

## 8. `PROVISIONAL(...)` sites

**None.** Every element that lacks real data is cut rather than shipped degraded (§4a.2): the alert
cards, `CALL`, `30D`, the tile deltas, the horizon control, the posture clause, and the rookie-pick
clause. Everything that ships is computed from live rows.

`grep -rn "PROVISIONAL(" src/` must still return **exactly the three Slice ii sites**. A fourth
candidate is a stop-and-ask, not a tag.

**One inconsistency this slice must close, not inherit.** Master-plan §2.4's index still lists
`Holdings HORIZON pill | heuristic | Portfolio slice`, and §2.1 says "Either way it is
`PROVISIONAL(heuristic)`" — both written before it was established that the pipeline already
computes `yearsFromPeak` (§5.1). Since the pill now reads a real derived quantity off the row, it
is **not** a heuristic and gets no tag. **Amend both master-plan rows in this change** (§11), or the
greppable inventory (`src/`) and the program index (`§2.4`) disagree — exactly the drift the
convention exists to prevent.

---

## 9. Step sequence

1. Read `Market.jsx` and `MarketTable.jsx` end to end. This slice should look like their sibling.
2. **Do §6's cell move first, on its own**, and run `npm test` before writing any Portfolio code.
   It is a pure relocation of working components; verifying Market is still green at that point
   isolates any breakage from the new screen's bugs.
3. Build `Portfolio.jsx`: owned-rows memo (§1) → header (§2) → tiles (§3) → chart (§4) → table (§5),
   importing the shared cells from step 2.
4. `App.jsx` — pass the props in §7.
5. Tests (§10).
6. Docs (§11).
7. `npm test` green · `npm run lint` no **new** problems (5 pre-existing errors in
   `docs/design_handoff_dynasty_portfolio/support.js` are a vendored mock runtime, not yours) ·
   `npm run build` clean · `grep -rn "PROVISIONAL(" src/` returns exactly three.
8. Hand back for the user's visual smoke: `/portfolio` in dark, and confirm a holdings row opens
   the pop-up. Chrome + `League`/`Board`/`Trade` unchanged in both themes.

## 10. Tests to add / update

- **New `src/components/portfolio/Portfolio.test.jsx`.** Cover, with fixture rows:
  - the four tile values, each against a hand-computed expected number — these are the arithmetic
    most likely to be subtly wrong, and none is currently covered anywhere;
  - **`—` for each tile's degenerate case**: no owned rows with `ktcValue` (3.1/3.2/3.3), fewer
    than four valued assets (3.3), empty `starters` (3.4);
  - `myTeamName === null` renders the single empty state, not four `—` tiles (§1);
  - age-band bucketing: null-age rows excluded rather than bucketed into `31+`, **and an under-21
    row lands in the first band** rather than vanishing (§4);
  - HORIZON at each threshold boundary, its `—` case, **and the `signals === null` row** (§5.1);
  - **`PROJ Δ` renders `—` for a player with `currentSeasonPPG === 0`**, not a fabricated gain —
    this is the guard that reads correct and does nothing if written against null (§5);
  - **the projected-points tile renders `—` when starters exist but none carry a projection**, and
    when `seasonProjections` is null — the two cases that otherwise render a plausible "0.0" (§3.4);
  - **a starter joins on `id`** — a fixture whose starters carry `id` but no `player_id` must still
    produce a non-zero tile (§3.4). This is the bug most likely to ship silently;
  - row click **and** keyboard activation call `onOpenPlayerDetail` with the right `player_id`;
  - mounting with **no props at all** does not crash (§7).
- **`Market.test.jsx` must pass completely untouched** after §6's cell move. If any assertion needs
  editing, the move changed behaviour — stop and report rather than adjusting the test.
- **`navRouting.test.jsx`** — **two** cases depend on Portfolio's placeholder, not one:
  - `:44-48` `/portfolio renders the Portfolio placeholder` — asserts the heading **and**
    `/lands in the next slice/`, which stops being true.
  - `:55-58` `/roster redirects to /portfolio` — asserts Portfolio's heading as its proof the
    redirect landed. Easy to miss; it fails for a reason unrelated to what it tests.

  Fix both by swapping `<Portfolio />` at `:25` for a `PortfolioStub`, matching the
  `MarketStub`/`PlayersStub` pattern Slice iii established (stubs defined at `:17-19`, used at `:50-53`), and asserting the stub
  text. Routing tests should assert routing, not a data-dependent screen.

  `DEFAULT_ROUTE` is `/market` and **stays there** this slice; whether Portfolio reclaims it is a
  product call, not an implementation one — leave it alone and mention it in the hand-back.
- Do **not** re-test `computeConsistency`, `careerSparkline` or the projection pipeline; those are
  covered upstream. Test Portfolio's composition and its aggregate arithmetic.

## 11. Docs updates

- **`CLAUDE.md`** — routing table (`/portfolio` now a real surface); `src/components/` table (add
  `portfolio/Portfolio.jsx`, `dp/cells.jsx`, and `dp/PortfolioTable.jsx` if §6 produces one), and
  amend `market/Market.jsx`'s row to note its cells now live in `dp/cells.jsx`.
- **`docs/ui.md`** — add a Portfolio section alongside the Market one Slice iii added.
- **Master plan** — three edits, not one:
  - **§6** — record the landed outcome, including that the rookie-picks clause was cut for a *data
    gap* rather than by §4a.2. That is a **capability** gap someone may want to close later: it
    would need Sleeper's traded-picks endpoint, which the app does not load at all.
  - **§2.4's index row** for the Holdings `HORIZON` pill — reclassify from `heuristic` to not-
    provisional, with a pointer to this file's §5.1 (see §8).
  - **§2.1's `horizon` row** — same correction; it currently ends "Either way it is
    `PROVISIONAL(heuristic)`", which is no longer true.

## 12. Cross-repo impact

**None.** Presentation over `playerRowsWithProj` plus `leagueData.rosterTeams`; no new served-data
reader, no shape change, no `CR-NN` entry touched, no `Mirror` text to emit. As in Slice iii, this
holds **only if no stat-key derivation is inlined here** — Portfolio should compute nothing from
raw stat keys; every figure comes from already-derived row fields.

## 13. Done-definition checklist (this slice)

- [ ] `/portfolio` renders the real screen; the Slice i placeholder body is gone, `bg-dp-canvas`
      wrapper kept
- [ ] Owned-rows derived once and shared by tiles, chart and table (§1)
- [ ] `myTeamName === null` renders one explanatory empty state, not four `—` tiles
- [ ] Four tiles with **values only, no deltas**; each degenerate case renders `—`
- [ ] Proj-points tile joins on **`starter.id`**, and renders `—` for all three degenerate cases
      (empty starters · null `seasonProjections` · zero contributing starters) — **no whole-roster
      fallback** (§3.4)
- [ ] `PROJ Δ` guarded with `currentSeasonPPG > 0`, not a null check (§5)
- [ ] `5-YR PPG` reuses Market's `CareerBars` unchanged — no respecced dimensions, no
      missing-season distinction (§5)
- [ ] `projDelta` and `yearsFromPeak` materialized as sort keys, listed in `SORTABLE_KEYS` (§5)
- [ ] Age-band chart: first band lower-open (`≤23`) so under-21 rows appear; null-age rows excluded
- [ ] Holdings table: ASSET · VALUE · 5-YR PPG · PROJ Δ · HORIZON — **no `30D`, no `CALL`**
- [ ] HORIZON read from `row.dynastyScore.signals.yearsFromPeak` — **not re-derived** — with
      thresholds in one constant and the chart-vs-pill inconsistency commented (§5.1)
- [ ] Market's cells moved to `dp/cells.jsx` and imported by both screens; **`Market.test.jsx`
      passes untouched** (§6)
- [ ] Master-plan §2.1 and §2.4 amended so HORIZON is no longer listed as `heuristic` (§8/§11)
- [ ] Row click + keyboard open the pop-up via `onOpenPlayerDetail`
- [ ] `MarketTable` either reused unchanged or extended **additively** — Market's rendering
      unaltered (§6)
- [ ] **No new `PROVISIONAL` sites** — grep returns exactly Slice ii's three
- [ ] `Portfolio` defaults **every** prop it dereferences (§7); both `navRouting.test.jsx` cases
      that depend on the placeholder use a `PortfolioStub` (§10)
- [ ] `npm test` green · `npm run lint` no new problems · `npm run build` clean
- [ ] CLAUDE.md + `docs/ui.md` + master-plan §6 updated in the same change
- [ ] Hand-back notes that `DEFAULT_ROUTE` is still `/market` and that reclaiming it is the user's
      call

---

## 14. Revision note (post plan-review, 2026-08-14)

Reviewed by the `plan-reviewer` subagent against live source; it raised **17 flags, all verified
and all fixed above**. The pattern worth noting: this file's errors were not vague — they were
specific guards that *read* correct and would have done nothing, producing plausible wrong numbers
rather than crashes. That is the exact failure mode §4a.2 exists to prevent, arriving through the
back door.

**Three would have shipped wrong-but-believable values.**
1. **The starters join used `player_id`; enriched starter objects key on `id`**
   (`App.jsx:741-744`). Every starter would have missed, and the projected-points tile would have
   rendered `0.0` — with the "empty starters" guard not firing, because the array isn't empty (§3.4).
2. **`PROJ Δ`'s null guard never fires** — `currentSeasonPPG` is `0`, never null (`App.jsx:342-345`),
   so a player with no prior season showed `projectedPPG − 0` as a full-projection gain (§5).
3. **The "missing seasons render differently" sparkline rule is unimplementable** —
   `careerSparkline` 0-pads absent seasons, so missing and genuinely-zero are the same value (§5).

**Two were second-source-of-truth errors**, both against this program's own import-don't-copy rule.
4. **§5.1 re-derived `age − positionPeakAge[position]`** when the pipeline already attaches
   `dynastyScore.signals.yearsFromPeak`, with a `derivePeakAge` fallback the prop version lacked —
   the two could disagree. Now read off the row; `positionPeakAge` dropped from the props (§5.1, §7).
5. **§5 respecced cell renderers that already exist** in `Market.jsx` (and had already drifted:
   6px/2px/22px vs the draft's 7px/gap-3/h-20). §6 now moves them to `dp/cells.jsx` for both screens.

**§6's reuse question was left open and is now closed.** `MarketTable` hard-codes the position pills
and its `PAGE_SIZE` is a module constant, so neither "reuse it" nor "pass a huge page size" works.
Portfolio gets a thin shell; the shared *cells* move to `dp/cells.jsx`.

**Four were incomplete edge coverage:** absent-vs-null field semantics (`ktcValue`/`projectedPPG`
are absent, not null), under-21 rows falling in no age band, a `NaN` league median from teams with a
zero denominator, and `§7`'s prop defaults being narrower than `§10`'s own "mounts with no props"
test required.

**Two were counting caveats worth stating rather than fixing:** `playerRows` holds only QB/RB/WR/TE,
so the subline's asset count can never match a Sleeper roster's size, and the rank denominator
counts only teams holding a skill player.

**One was a convention drift:** §8's "no `PROVISIONAL` sites" contradicted master-plan §2.4's index,
which still lists HORIZON as `heuristic`. Amending both master-plan rows is now part of this slice
(§11) — the greppable inventory and the program index have to agree, which is the whole point of the
convention.

Plus citation fixes: the `navRouting` stub line reference, an orphaned `computeConsistency` citation
in §0 (nothing in this slice consumes `sd`), and the "most recent **completed** rookie draft"
wording (the code does no completion check — though the load-bearing claim, that it maps
already-drafted players rather than owned future picks, was confirmed).
