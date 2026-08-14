# Slice v — Player detail pop-up, full (tab strip + compare matrix)

**Status:** implementation-ready task file (handoff artifact), written 2026-08-14 against live
source at `571ed01`, then revised after a `plan-reviewer` pass that raised **11 flags — all verified
and all fixed** (see §13, worth reading first: one was an architectural hole, not a detail). Per the
[workflow convention](../../CLAUDE.md#workflow-convention), a **sonnet** session implements this
exactly as written; if anything is ambiguous or contradicts live code, stop and ask.

**Governing plan:** [dynasty-portfolio-1b.md](dynasty-portfolio-1b.md) — §4a (the two standing
directives), §2.4 (the `PROVISIONAL` convention), §6. **Predecessor to read before starting:**
`src/components/dp/PlayerDetailModal.jsx` (Slice ii, 424 lines) — this slice wraps and extends it.

**This slice:** upgrade the single-player pop-up to the full design — a tab strip for multiple open
players, a compare matrix when ≥2 are open, and the "+ Add player to compare" dropdown. This is the
last scheduled `1b` slice; after it, the redesign's committed scope is complete.

**Explicitly NOT this slice** — two retirements the master plan filed here that **cannot happen
yet**, both for the same reason (§6):
- **Retiring `ComparisonTray`'s standalone UI.** It is `/players`' only comparison affordance, and
  `/players` is frozen until Market reaches filter parity (Slice iii §1).
- **Deleting `SpiderChart.jsx`.** Master-plan §6 says to delete it "once it has zero remaining
  consumers" — **it has one** (§0). The precondition is not met.

Also not this slice: Market's filter panel, the dark-data slice, any chrome recolor.

---

## 0. Confirmed against live source

- `src/App.jsx:151-157` — the Slice ii pop-up state, with a comment already anticipating this
  slice: *"Singular now; Slice v widens it to tabs[]/activeTab."* Currently
  `detailPlayerId` + `openPlayerDetail(id)` + `closePlayerDetail()`.
- **`openPlayerDetail(id)`'s call sites do not change.** `Market.jsx` and `Portfolio.jsx` both
  receive it as `onOpenPlayerDetail` and call it with a `player_id`. Widening the state behind it
  is invisible to both — **do not touch either surface** (§2).
- `src/App.jsx:54` `LS_COMPARISON = 'comparison-list'`; `:125-149` `comparisonList` state (max-4,
  localStorage-persisted) and its three mutators; `:902` `clearComparison()` in the league-reset
  path; `:1046-1049` the only consumers — passed to `PlayersSurface`, i.e. **`/players` alone**.
- `src/components/PlayersTab.jsx:1396` — `ComparisonTray` is defined there and rendered at
  `:2236`, inside the `/players` subtree. Nothing else renders it.
- **`SpiderChart.jsx` has exactly one consumer**: `PlayersTab.jsx:3` (import) and `:905` (render).
  Verified 2026-08-14. It cannot be deleted while `/players` lives.
- `src/components/dp/PlayerDetailModal.jsx` (424 lines) — takes `{ playerId, onClose, myTeamName }`,
  calls `usePlayerProfile(playerId)` and `useProfileData()`, owns an `Escape`-to-close effect
  (`:41-45`).
  **Two structural facts the §3 split depends on:**
  - **The scrim + panel are rendered TWICE.** The null-`dynastyScore` early return (`:106-128`)
    carries its own complete scrim, panel and close `×`, duplicating the main return's (`:198-206`).
    Both wrappers and both close buttons are removed by the split; the early return becomes a
    body-only empty state. Its **ordering** — before any `dynastyScore` dereference — must survive.
  - **`usePlayerProfile` is a hook taking one `playerId`.** It cannot be called once per open tab.
    This is why §4.0 exists.
- `src/components/dp/PlayerDetailModal.test.jsx` — **two tests assert shell behaviour that the
  split deliberately relocates**: `onClose fires on scrim click`, which queries
  `container.querySelector('.z-40')`, and `onClose fires on Escape` (`:221-233`). They **move to
  the new wrapper's test file**; that is a correct split, not a warning sign. See §3's recalibrated
  tripwire.
- **`projectedGames` is NOT on `playerRowsWithProj`.** That memo merges `projectedPPG`,
  `projectedTotalPts` and `projectionConfidence` only (`App.jsx:554-579`); `projectedGames` lives on
  `seasonProjections[id]`, a separate `ProfileDataContext` key. §4.0 sources it from there.
- **Two different `currentSeasonPPG` values exist.** The **row** field is `0`, never null
  (`App.jsx:343-345`); the **modal's** local memo is `null`, never 0 (`PlayerDetailModal.jsx:59-62`).
  §4.0 fixes the matrix to the row field, so the `> 0` guard is the correct one.
- `src/components/dp/cells.jsx` (93 lines, Slice iv) — shared dp cells: `CareerBars`, `PlayerCell`,
  `ClickableRow`, `SortTh`, `DeltaCell`. The dropdown's suggestion rows should reuse `PlayerCell`
  rather than restyling a player row.
- **Design source:** `README.md` → *Screen: Player detail (pop-up)*, and
  `Sleeper Dashboard.dc.html:1020-1200` for the shell, `:1048-1075` for the compare matrix markup,
  **`:1717-1743`** for `compareOn` / `compareRows` / `compareHeads` — the metric list and its
  colouring predicates. See §4, where the mock's code and the README disagree.

---

## 1. `tabs[]` is NOT `comparisonList` — build separate state

Master-plan §3.1 proposed repurposing `comparisonList` as the tab strip's backing state and
retiring `ComparisonTray`. **Do not.** That plan predates Slice iii's decision to keep `/players`
alive, and the two pieces of state have genuinely different lifecycles:

| | `comparisonList` (existing) | `tabs[]` (new) |
|---|---|---|
| Lifetime | **Persisted** to `localStorage` across sessions | **Ephemeral** — open, compare, close |
| Owner | `/players`' Explorer tray | the pop-up, from any surface |
| Reset | `clearComparison()` on league switch (`App.jsx:902`) | closing the pop-up |

Conflating them would mean **clicking a row in Market silently mutates the Explorer's persisted
comparison tray** — a cross-surface side effect no user asked for, and one that would survive a
page reload. Keep them independent.

`comparisonList` and its three mutators are therefore **untouched** this slice, and `/players` keeps
its tray. Their convergence is a `/players`-retirement concern (§6).

---

## 2. App.jsx state migration

Replace the singular state (`:151-157`) with:

```js
const [tabs, setTabs] = useState([])            // player_ids, open order, max 4
const [activeTab, setActiveTab] = useState(null)
```

Behaviour:
- **`openPlayerDetail(id)` — signature unchanged.** If `id` is already open, just activate it.
  Otherwise append and activate. **At the cap (4), evict the OLDEST tab (FIFO) and append.**
  Update the comment at `:151-155`, which currently describes the singular state.

  An earlier draft said "replace the active tab", which was both destructive (it removes the tab
  the user is looking at) and inconsistent with §5, which hid the dropdown at the cap to avoid
  "silently swapping a tab". **FIFO eviction resolves both:** it is predictable, it never removes
  what the user is currently reading, the tab strip visibly changes so nothing is silent, and it
  applies identically to row clicks and dropdown picks. Neither path is hidden or disabled at the
  cap.
- **`closePlayerDetail()`** closes the whole pop-up: `setTabs([])`, `setActiveTab(null)`.
- **`closeTab(id)`** removes one tab. When it was the active one, activate its neighbour (prefer the
  one to the left). **Closing the last tab closes the pop-up** — per the design's Interactions table.
- Clear both alongside `clearComparison()` in the league-reset path (`:902`) — a stale
  `player_id` must not survive a league switch. Slice ii cleared `detailPlayerId` there; keep that
  behaviour for the new state.

**Cap at 4.** The design states no maximum, but the compare matrix puts one column per tab in a
fixed-width panel, and the existing comparison feature already uses 4 as its ceiling. Put it in a
named constant.

The mount condition in `App.jsx` becomes `tabs.length > 0 && careerStats` (replacing
`detailPlayerId && careerStats`).

---

## 3. Tab strip

New component wrapping the existing modal — recommend `src/components/dp/PlayerDetailTabs.jsx`,
which owns the shell (scrim, panel, tab strip, compare matrix) and renders
`PlayerDetailModal` for the active tab as its body.

### 3.1 The shell split — what actually moves, and a corrected tripwire

`PlayerDetailModal` becomes **body-only**. Three things move up into `PlayerDetailTabs`:

1. **Both scrim/panel wrappers.** They are duplicated — the main return (`:198-206`) *and* the
   null-`dynastyScore` early return (`:106-128`), which carries its own complete copy plus its own
   close `×`. An earlier draft said "leave the body markup untouched", which was not achievable:
   the early return's wrapper is part of that block. **It becomes a body-only empty state** —
   keep its position before any `dynastyScore` dereference, drop its scrim, panel and close button.
2. **The `Escape` effect** (`:41-45`) — now the shell's, and extended by §5's dropdown rule.
3. **The close `×` buttons** (both) — one lives in the tab strip's far right.

**Corrected tripwire.** An earlier draft required `PlayerDetailModal.test.jsx` to need "only
prop-shape changes" and told the session to stop otherwise. That is wrong and would have halted a
*correct* split: `onClose fires on scrim click` and `onClose fires on Escape` (`:221-233`) assert
exactly the behaviour being relocated. Use this instead:

- **Those two tests move to the new wrapper's test file**, essentially unchanged. Expected.
- **Every other test in that file — the body-content assertions — must pass untouched.** Those are
  the tiles, the empty states, the drivers panel, the rail. **If a body-content assertion needs
  editing, the split changed rendering: stop and report.**

Per the design (`.dc.html:1020-1047`): `p-[10px_16px_0]`, `bg-dp-canvas`, bottom border. One tab per
open player — mono position tag + name + `×`. Active tab `bg-dp-card`, `1px border-dp-border`, its
bottom border matching `card`, `-mb-px`, `rounded-t-[8px]`. Then the "+ Add player to compare"
control (§5). Far right, `ml-auto`: the close `×` for the whole pop-up.

**Keyboard:** tabs are buttons, reachable by Tab and activated by Enter/Space. `Escape` still closes
the entire pop-up (existing behaviour — do not change it to close one tab).

---

## 4. Compare matrix — renders only with ≥2 tabs

`p-[12px_22px]`, bottom border, `bg-dp-chrome`. A `COMPARE` mono label heads the left column; one
right-aligned column per open tab, headed by the player's name (`compareHeads`, `.dc.html:1739-1742`).

### 4.0 Where the matrix gets its data — read this before writing any of §4

**`usePlayerProfile(playerId)` cannot supply it.** It is a hook bound to a single player; calling it
once per open tab violates the rules of hooks. An earlier draft of §4.2 named its return fields
(`player.age`, `projection.projectedGames`, …) without saying where multi-player data comes from —
that was a hole, not a shorthand.

**All three sources come from `useProfileData()`, which the pop-up already consumes. No new props.**

| Need | Source | Notes |
|---|---|---|
| Dynasty score, Market value, Age, PPG now, PPG next | `playerRows.find(r => r.player_id === id)` | one lookup per tab; build a `Map` once rather than scanning per row × per tab |
| Games projected | `seasonProjections[id]?.projectedGames` | **not on the row** — `playerRowsWithProj` never merges it (§0) |
| Consistency (`±sd`) | `computeConsistency(careerStats, id)?.sd` | a **pure function**, so calling it per tab is fine — unlike a hook. Memoise on `[careerStats, tabs]` |

Build one `useMemo` producing `[{ playerId, name, meta, metrics: {...} }]` for the open tabs, and
render §4.1/§4.2 off that. This same memo feeds `compareHeads` (name + `pos · age · team`).

**Field-presence rules** (these decide the min/max in §4.1, so they are not cosmetic):
- Use `!= null` presence checks, never `=== null` — `ktcValue` and `projectedPPG` are **absent**,
  not null, when unavailable (established in Slice iv).
- **PPG now uses the ROW field, guarded `> 0`.** The row's `currentSeasonPPG` is `0` for a player
  with no most-recent season, and an unguarded `0` would render as a real value and be counted as
  the loser in min/max. Treat `!(x > 0)` as missing → `—`, excluded from min/max.

### 4.1 The design contradicts itself on colouring — resolve toward the README

The README says: *"Cell colour marks the winner: `up` better, `down` worse, `text-strong` when the
metric has no direction."* The mock's code does something different — **absolute per-player
thresholds** that ignore who else is open (`.dc.html:1722-1729`): `dyn >= 70`, `age <= 25`,
`projG >= 16`, `sd < 6`, and so on. Master-plan §8's "mirroring the mock's `good(p)` logic" was
written from the code, not the prose.

**Ship the README's reading: mark the winner, relative to the open tabs.** For a matrix whose
entire purpose is comparison, "is this player's age under 25" answers a question nobody asked;
"which of these two is younger" is the question. Absolute thresholds would also colour a cell green
in a one-sided comparison where that player is clearly the worse of the two.

Rules:
- **Higher-is-better** (Dynasty score, Market value, PPG now, PPG next, Games proj.) — best value
  gets `text-dp-up-text`, worst gets `text-dp-down-text`, any tie or middle gets `text-dp-text-strong`.
- **Lower-is-better** (Age, Consistency `±sd`) — inverted.
- **Ties across all open tabs** → every cell `text-dp-text-strong`. With no spread there is no winner.
- **Missing values never win or lose.** A tab whose metric is absent renders `—` in
  `text-dp-muted` and is excluded from the min/max entirely — otherwise a player with no KTC value
  "wins" Market value by being null.

Put the direction (`'higher' | 'lower'`) in the metric descriptor, not in per-metric branching.

### 4.2 Seven rows, not eight

All seven read through §4.0's memo — none from `usePlayerProfile`.

| Row | Source (all via `useProfileData()`) | Direction |
|---|---|---|
| Dynasty score | `row.dynastyScore?.score` | higher |
| Market value | `row.ktcValue` | higher |
| Age | `row.age` | lower |
| PPG now | `row.currentSeasonPPG`, **guarded `> 0`** → else `—` (§4.0) | higher |
| PPG next | `row.projectedPPG` | higher |
| Games proj. | `seasonProjections[id]?.projectedGames` — **not a row field** | higher |
| Consistency | `computeConsistency(careerStats, id)?.sd`, as `±N` — `—` for both the null-object and the null-`sd` branches | lower |

**Every row is directional, so the README's third case never fires.** The README describes
`text-strong` "when the metric has no direction", and the mock marks PPG now explicitly
directionless (`.dc.html:1725`). **Deliberate deviation:** in a comparison matrix a higher current
PPG is better, so it gets a direction like the rest. State this in a comment — otherwise a future
reader hunts for an unreachable branch. The only neutral path in v1 is an exact tie (§4.1), and
§9's tests should assert that rather than a directionless metric.

**The mock's eighth row, `Risk`, is cut.** It renders `riskLabel`/`riskN`, which this program cut
for want of thresholds (§4a.2, and Slices ii–iv all shipped `±sd` with no Low/Med/High word).
`Consistency` above already carries the same underlying number, so `Risk` would be a duplicate
wearing a label the app cannot produce.

Note the winner-marking resolution also removes the mock's dependency on `mk30dir` for Market
value's direction (`.dc.html:1723`) — the 30-day KTC delta this program cut everywhere. Under §4.1
that row is decided by `ktcValue` magnitude instead, so **no `PROVISIONAL` site is created** (§7).

---

## 5. "+ Add player to compare" dropdown

Dashed `border-dp-border-raised`, `text-dp-muted`; becomes `bg-dp-up-bg` when open. Opens a 250px
panel of suggestions, each row showing name, meta and a mono dynasty score.

**No search input — ship the design's behaviour.** An earlier draft specified "filter by a typed
substring against `full_name`", but **the design has no text input**: the control is a
click-to-open list of five suggestions with no query (`.dc.html:1030-1045`, `:1713-1716`). Adding
an input would mean inventing its placeholder, focus behaviour, empty-query state and result cap —
exactly the improvisation §4a.2 forbids. Ship the static list; a filter is a clean iteration if the
user asks for one.

- **Suggestions = top 5 by `dynastyScore.score`, excluding already-open tabs**, from `playerRows`
  via `useProfileData()`. Real data, no invented ranking. **No new props.**
- Reuse `PlayerCell` from `dp/cells.jsx` for each row.
- Picking one calls the same `openPlayerDetail(id)` as a row click (§2).
- Close on outside click and on `Escape`.

**Wire the identity row's inert "Compare" button to open this dropdown** (`PlayerDetailModal.jsx:220-222`).
It ships today as a dead ghost control — Slice ii had nothing to point it at. Leaving it inert once
a real compare affordance exists beside it is worse than either wiring or removing it, and wiring
costs one callback. (`Shop this asset` stays disabled — it is a `PROVISIONAL(no-data)` site with no
trade surface to reach, unchanged by this slice.) The button lives in the body while the dropdown
lives in the shell, so pass an `onCompare` callback down.

**Escape must be handled by ONE listener, not two.** The shell owns a `window` keydown handler
(§3.1). A second `window` listener in the dropdown does not give "Escape closes the dropdown only" —
both fire, and `stopPropagation` between two listeners on the same target is a no-op. **Lift
`dropdownOpen` into the shell** and branch inside the single handler: dropdown open → close the
dropdown; otherwise → close the pop-up. Comment it as the one intentional exception to §3's Escape
rule.

**At the 4-tab cap the control stays visible** — see §2's FIFO rule, which now applies identically
here and to row clicks. An earlier draft hid it at the cap while row clicks silently swapped a tab;
the two paths now behave the same.

---

## 6. What does not retire, and the consolidated `/players` debt

Master-plan §6 filed two retirements here. **Neither precondition holds:**

- **`ComparisonTray`** is `/players`' only comparison UI (§0). Retiring it removes function from a
  live surface — the same argument that kept `/players` alive in Slice iii §1.
- **`SpiderChart.jsx`** has one consumer, `PlayersTab.jsx:3`/`:905`. §6's own instruction is
  conditional on zero.

**Both carry forward.** Record in the hand-back that the `/players`-retirement slice now owes
**five** items, and update master-plan §6 to list them in one place rather than scattered across
slice entries:

1. `PlayersTab.jsx:369-373`'s hard-coded weight strings → `components[*].weight` (Slice ii).
2. `PlayersTab.jsx:864-881`'s inline signal-badge block → `dynastySignalBadges.js` (Slice ii).
3. The two `/players` `ProfileDataContext` providers → the App-level one (Slice ii).
4. `ComparisonTray`'s standalone UI → folded into the tab strip (this slice).
5. `SpiderChart.jsx` deletion (this slice).

All five are gated on the same thing: **Market reaching filter parity**, which is the real
precondition for retiring `/players`. That, not this slice, is the natural next piece of work.

---

## 7. `PROVISIONAL(...)` sites

**None added.** The two cut metrics (`Risk`, and Market value's `mk30dir` direction) are removed
rather than shipped degraded, per §4a.2. `grep -rn "PROVISIONAL(" src/` must still return **exactly
the three Slice ii sites**. A fourth candidate is a stop-and-ask.

## 8. Step sequence

1. Split the shell out of `PlayerDetailModal` into `PlayerDetailTabs` (§3, §3.1) — **and mount the
   wrapper in `App.jsx` in the same step, still on the singular `detailPlayerId` state.** The
   moment the modal is body-only, `App.jsx`'s existing mount (`:1058-1064`) would render a body with
   no scrim or panel; step 1 must leave the tree working, not broken until step 2. Run `npm test`:
   the two shell tests move to the wrapper's file, every body-content assertion passes untouched
   (§3.1's tripwire). **If a body-content assertion needs editing, stop and report.**
2. Widen the App.jsx state to `tabs[]`/`activeTab` (§2), replacing the singular state from step 1.
   `Market.jsx` and `Portfolio.jsx` are **not** touched — verify with `git diff --stat`. (App.jsx
   *is* touched in both steps 1 and 2; only the two surfaces are frozen.)
3. Tab strip rendering + close/activate behaviour (§3).
4. Compare matrix (§4), descriptor-driven with an explicit direction per metric.
5. The add-player dropdown (§5).
6. Tests (§9), docs (§10).
7. `npm test` green · `npm run lint` no **new** problems (5 pre-existing in
   `docs/design_handoff_dynasty_portfolio/support.js` are a vendored mock runtime) ·
   `npm run build` clean · `grep -rn "PROVISIONAL(" src/` returns exactly three.
8. Hand back for the user's visual smoke: open a player from Market, add a second via the dropdown,
   confirm the matrix appears and its colouring reads correctly; close tabs down to zero.

## 9. Tests to add / update

- **Compare-matrix colouring is the priority** — master-plan §8 calls it out, and §4.1 changes its
  semantics from the mock's. Cover each direction explicitly: a higher-is-better metric, a
  lower-is-better metric, an all-tie row (every cell neutral), and **a row where one tab's value is
  missing** (that cell renders `—` and is excluded from min/max — it must not win).
- **Tab behaviour:** opening an already-open id activates rather than duplicates; **at the 4-cap the
  oldest tab is evicted and the active tab survives** (§2's FIFO rule — assert the active tab is
  still open afterwards, which is the property that distinguishes FIFO from the rejected
  replace-active behaviour); closing the active tab activates its left neighbour; closing the last
  tab closes the pop-up; league reset clears tabs.
- **Matrix visibility:** absent at 1 tab, present at 2.
- **Matrix data sourcing (§4.0):** assert `Games proj.` renders — it comes from `seasonProjections`,
  not the row, so a naive row-only implementation would silently render `—` for every tab and still
  pass every other test in this file.
- **Dropdown:** suggestions exclude already-open players; **visible at the cap** (§5); `Escape`
  closes the dropdown without closing the pop-up, and `Escape` again closes the pop-up (§5's
  single-handler branch); the identity row's "Compare" button opens it.
- **`PlayerDetailModal.test.jsx`** — the two shell tests relocate to the wrapper's file; all
  body-content assertions must pass untouched (§3.1). Editing a body assertion means the split
  changed rendering.
- Do **not** re-test `usePlayerProfile`, `computeConsistency` or the projection pipeline.

## 10. Docs updates

- **`CLAUDE.md`** — `src/components/` table: add `dp/PlayerDetailTabs.jsx`, note
  `PlayerDetailModal` is now body-only. Note the pop-up supports up to 4 open players.
- **`docs/architecture.md`** — *State management*: `detailPlayerId` becomes `tabs`/`activeTab`.
- **`docs/ui.md`** — extend the pop-up section with the tab strip and matrix.
- **Master plan §6** — record the landed outcome, **and consolidate the five-item `/players` debt
  list** (§6 above) into one place, replacing the per-slice scatter.

## 11. Cross-repo impact

**None.** Client-side view state and presentation over row fields already in use; no new served-data
reader, no shape change, no `CR-NN` entry touched, no `Mirror` text to emit.

## 12. Done-definition checklist (this slice)

- [ ] **Both** scrim/panel wrappers removed from `PlayerDetailModal` (main return **and** the
      null-`dynastyScore` early return); it is body-only, its early return keeps its position
- [ ] Step 1 leaves the tree working — the wrapper is mounted in `App.jsx` on the singular state
      before step 2 widens it
- [ ] The two shell tests relocated; **every body-content assertion passes untouched** (§3.1)
- [ ] `tabs[]`/`activeTab` replace `detailPlayerId`; `openPlayerDetail(id)`'s signature unchanged
- [ ] `Market.jsx` and `Portfolio.jsx` **not modified** — confirmed by `git diff --stat`
- [ ] Cap of 4 in a named constant; **at cap the OLDEST tab is evicted (FIFO), the active tab
      survives**, and the rule is identical for row clicks and dropdown picks
- [ ] Closing the last tab closes the pop-up; league reset clears tabs and activeTab
- [ ] Compare matrix renders at ≥2 tabs only, **seven rows** (no `Risk`)
- [ ] **Matrix data comes from `useProfileData()` per §4.0 — never from `usePlayerProfile`** —
      with `projectedGames` read from `seasonProjections[id]` and PPG-now from the row, guarded `> 0`
- [ ] Colouring marks the **winner relative to open tabs** (§4.1), not absolute thresholds;
      ties neutral; missing values render `—` and are excluded from min/max
- [ ] Dropdown has **no text input** — top-5 by dynasty score, excluding open tabs; **visible at
      the cap**; the identity row's "Compare" button opens it
- [ ] `Escape` handled by **one** listener branching on `dropdownOpen` (§5) — not two listeners
- [ ] `comparisonList`, `ComparisonTray`, `SpiderChart.jsx` and the whole `/players` subtree
      **untouched**
- [ ] **No new `PROVISIONAL` sites** — grep returns exactly Slice ii's three
- [ ] `npm test` green · `npm run lint` no new problems · `npm run build` clean
- [ ] CLAUDE.md + `docs/architecture.md` + `docs/ui.md` updated; master-plan §6 carries the
      consolidated five-item `/players` debt list
- [ ] Hand-back states that Market filter parity is the gate for all five debts, and is the
      natural next piece of work

---

## 13. Revision note (post plan-review, 2026-08-14)

Reviewed by the `plan-reviewer` subagent against live source; it raised **11 flags, all verified
and all fixed above**. Grouped by what they changed:

**One was an architectural hole, not a detail.** §4 specified what the compare matrix renders
without ever saying where per-tab data comes from — and the fields it named are
`usePlayerProfile(playerId)`'s single-player return, which **cannot be called once per open tab**
(rules of hooks). **§4.0 is new** and specifies all three sources through `useProfileData()`:
`playerRows` by id, `seasonProjections[id]` for `projectedGames` (never merged onto rows), and
`computeConsistency` per tab (a pure function, so unlike a hook this is fine).

**Two were wrong field claims that would have produced silent wrong output:** `projectedGames` is
not on `playerRowsWithProj`, and the modal's local `currentSeasonPPG` is `null`-not-0 while the
*row* field is `0`-never-null — so the `—` rule and the min/max exclusion both depend on which
source the matrix reads. §4.0 fixes it to the row field with a `> 0` guard.

**Three concerned the shell split, which was under-specified and mis-tripwired:**
- The scrim and panel are rendered **twice** — the null-`dynastyScore` early return carries a
  complete duplicate — so "leave the body markup untouched" was never achievable (§3.1).
- The tripwire was calibrated backwards: two existing tests assert exactly the shell behaviour a
  correct split relocates, so "stop if the test needs behavioural edits" would have halted a
  session doing the right thing. Recalibrated to body-content assertions only (§3.1).
- Step 1 would have left the tree broken — a body-only modal mounted with no wrapper — until
  step 2. It now mounts the wrapper on the singular state in the same step (§8).

**Two were interaction contradictions.** §2 replaced the *active* tab at the cap while §5 hid the
dropdown to avoid "silently swapping a tab" — the same case, two answers, and the §2 behaviour
removed the tab the user was reading. Both now use **FIFO eviction**, identically. And `Escape`
"closes the dropdown only" was not implementable as two `window` listeners; it is now one handler
branching on a lifted `dropdownOpen` flag (§5).

**One was invented product logic.** §5 required substring filtering against a text input — **the
design has no input**, just a click-to-open list of five. Adding one would have meant inventing its
placeholder, focus behaviour and empty state, precisely what §4a.2 forbids. Now: top-5 by dynasty
score, excluding open tabs, no input.

**Two were loose ends:** the identity row's inert "Compare" ghost button, which would have sat dead
beside a real compare affordance (now wired to the dropdown, §5); and §4.1 assigning a direction to
all seven rows, making the README's "no direction" case unreachable — kept deliberately, but now
stated so nobody hunts for the branch (§4.2).

**Verified clean by review:** §0's citations, §1's separate-state call, §2's "signature unchanged /
no Market-Portfolio edits", the league-reset location, §6's two non-retirements, §7's
zero-new-`PROVISIONAL` claim, and §11's cross-repo "none".
