# Second-year players report as rookies with zero seasons — reporting fix

**Type:** bug fix, **reporting only**. No dynasty score changes.
**Model:** sonnet — the change is three lines plus copy; the analysis is done.
**Baseline:** app `890cb98` · data `f0c1fc4`.
**Found:** 2026-08-20, during Slice 3's smoke, when the pop-up's new coverage span read `0y` for a
player whose career chart showed a 2025 bar.

**Sequencing:** Anton's call — **before dp-v2 Slice 4**, because Slice 4 renders score components in
the new pop-up sections and would otherwise surface this cohort's null components far more
prominently than Slice 3 does.

---

## 1. The bug

`computeDynastyScore`'s **PATH A: True prospect** gate (`src/utils/dynastyScore.js:674-676`):

```js
const isTrueProspect =
  (yearsExp != null && yearsExp <= 1) ||
  (yearsExp != null && yearsExp <= 3 && seasonHistory.length === 0 && hasKTC)
```

The **second** clause requires `seasonHistory.length === 0` — no NFL track record. The **first does
not.** Sleeper's `years_exp` counts *completed* seasons, so `years_exp === 1` is a player who has
just finished his rookie year. Every one of them takes the prospect path, which hard-codes
(return block opens `:690`; the three fields are `:694`, `:695`, `:702`):

```js
isRookie:   true,          // false — they played last season
components: null,
seasonsOfData:  0,         // false — they have a qualifying season
```

**Verified against live data.** Ashton Jeanty (`sleeper_id` 12527) played **17 games for 217.6
points** in 2025 — 12.8 PPG, exactly what the pop-up's own chart plots — and the same pop-up reports
`0 seasons`.

**Cohort: at least 60 players.** Cross-referencing `nflverse/draft/draft_picks.json` 2025 against
`nfl/season-totals/2025.json`, 60 *drafted* 2025 players have a qualifying season (`gp >= 8`) and are
all currently scored as prospects with `seasonsOfData: 0` — Dart, Skattebo, Hampton, Jeanty, Ward,
Henderson, Judkins, McMillan, Egbuka, Sanders, Shough, Harvey among them. Undrafted second-year
players are additional. This is the top of an entire draft class, and in dynasty it is the most
actively traded cohort there is.

**`years_exp` semantics confirmed** from live rows: Smith-Njigba (2023 draftee) shows `3yr`, Loveland
(2025 draftee) shows `1yr`.

### 1.1 The code diverges from its own documented contract — found in review
`docs/dynasty-scoring.md:40` documents PATH A's condition as:

> **A — True prospect** | `years_exp === 0` OR (`years_exp ≤ 3` AND no qualifying seasons AND has KTC)

**`years_exp === 0`, not `≤ 1`.** The documentation describes exactly the behaviour the second clause
implies and the first clause fails to deliver. This is not a doc that drifted behind a deliberate
change — it is the original contract, and the code does not implement it.

That materially strengthens the read that `<= 1` is a defect rather than a modelling choice, and it is
plausibly *why the bug survived*: anyone checking the documented gate would have seen the right
condition. **It does not change this task's scope** — the gate still moves 60+ scores and stays
deferred — but §6 records it, and Anton should see it before treating that deferral as settled.

---

## 2. Scope: reporting only, and it is provably score-neutral

**Do not touch the gate.** Whether a second-year player with one qualifying season *should* score on
the prospect path is a genuine modelling judgment — one noisy rookie season versus draft capital plus
college production is a real trade-off, and changing it moves the score for 60+ players, which is
scoring-affecting work subject to the roadmap's D-1 gate. **Deferred deliberately** (§6).

This task fixes only what is factually false about the *output*.

**Why the change cannot move any score — verified, not assumed:**
- **`isRookie` has zero consumers.** `grep -rn "isRookie" src` returns only its own returns inside
  `dynastyScore.js`. (`isRookieSeason` in `navItems.js` is an unrelated function controlling the
  seasonal nav slot.) It is a dead field; changing it can affect nothing.
  **Second site, deliberately out of scope:** the exported `computeProspectScore` **also** hard-codes
  `isRookie: true` (`:565`). `computeDynastyScore` reads only `.score` / `.draftCapital` /
  `.gamesPlayed` / `.ktcInfluenced` from it, so that field is dead too and score-neutrality is
  unaffected. **Leave it.** It cannot be fixed the same way — `computeProspectScore`'s signature is
  `(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPercentile)` and it never
  receives `seasonHistory`, so correcting it means changing an exported signature and its direct unit
  tests (`dynastyScore.test.js:920`). Recorded so the next reader finds it explained rather than
  surprising.
- **`seasonsOfData` has exactly one consumer**, `PlayerDetailModal.jsx` — the DYNASTY SCORE tile note
  (`:211`) and Slice 3's index coverage span (`:118-127`). Display only.

Neither feeds `projectedPPG`, the composite, or any `factors` entry.

---

## 3. The change — PATH A only

In the `isTrueProspect` return block (`dynastyScore.js:690-707`):

| Field | From | To |
|---|---|---|
| `isRookie` | `true` | `seasonHistory.length === 0` |
| `signals.seasonsOfData` | `0` | `seasonHistory.length` |

**Change nothing else in that block** — `score`, `label`, `confidence: 'prospect'` and
`components: null` all stay exactly as they are.

### 3.1 Do NOT touch the other two `seasonsOfData: 0` sites
Both are **tautologically correct** and changing them would be a regression:
- **PATH A2 "Unproven veteran"** (`:729`) gates on `yearsExp >= 2 && seasonHistory.length === 0`.
- **PATH A4 "Data gap"** (`:792`) gates on `seasonHistory.length === 0`.

In both, zero qualifying seasons is the entry condition, so `0` is the truth. Only PATH A's is a
hard-coded lie.

### 3.2 `components` stays null — fix the copy instead
It is tempting to populate `components` so the pop-up stops saying "not available". **Don't.** The
five weighted components describe the *veteran composite*; the prospect score comes from
`computeProspectScore` (draft capital × age × market percentile). Rendering veteran components beside
a prospect score would imply they produced it — precisely the kind of plausible-but-wrong display this
program exists to avoid.

The honest fix is in `PlayerDetailModal.jsx:416`, which currently reads:

> *Component breakdown not available for this player.*

That is true but uninformative — it reads like a data gap when it is a modelling choice. Replace it
with copy that says **why**, and surface the drivers the prospect path already carries in `signals`:
`draftCapital`, `ktcInfluenced`, `gamesPlayed`, `isProspect`.

Wording is yours, but it must convey: *this player is scored on the prospect path, from draft capital
and market value rather than weighted production components* — and where `draftCapital` is non-null,
show it. Keep it to one or two lines; do not build a new panel. **Do not** claim a component
breakdown exists.

**That copy is reached by SIX returns, not three** — the earlier draft undercounted. `components: null`
is returned at `dynastyScore.js:631, 695, 721, 751, 784, 952`:

| Line | Path | Distinguishing signal |
|---|---|---|
| `:695` | A — true prospect | `isProspect` |
| `:721` | A2 — unproven vet | `isUnprovenVet` |
| `:751` | A3 — stale data | `isStaleData` |
| `:784` | A4 — data gap | `isDataGap` |
| `:952` | non-finite guard | `isNonFinite` |
| `:631` | non-skill position | **`signals` is `null` entirely** |

Two consequences the fix must handle:

1. **A3 (stale data) and the non-finite guard have no branch in the three-way split** the earlier
   draft proposed. Either write one sentence that is honest for all of them, or branch on all five
   flags — but do not write a prospect-specific sentence and let four other paths render it.
2. **`signals` can be `null`, not merely sparse.** `:631` returns a **truthy** `dynastyScore` object
   with `signals: null`, so the modal's `!dynastyScore` guard does not catch it and a bare
   `signals.isProspect` **throws**. Optional-chain every read. This shape is already fixtured at
   `PlayerDetailModal.test.jsx:124`, so getting it wrong fails an existing test rather than production
   — but only if you run the suite.

---

## 4. Tests

- **`dynastyScore.test.js`** — a `years_exp === 1` player **with** a qualifying season (`gp >= 8`)
  returns `seasonsOfData: 1` and `isRookie: false`, **and still returns the same `score` and `label`
  as before** — assert the score explicitly, since score-neutrality is this task's whole safety claim.
- A `years_exp === 1` player with **no** qualifying season still returns `seasonsOfData: 0` and
  `isRookie: true`.
- **PATH A2 and A4 regression guards** — a `years_exp >= 2` player with no qualifying seasons, and a
  `years_exp == null` player, both still return `seasonsOfData: 0`.
- **`PlayerDetailModal.test.jsx`** — the null-components state renders the new copy; if you branched
  (§3.2), one test per branch.
- **No existing test encodes the bug — checked in review, so do not go looking.** No test drives
  PATH A with a qualifying season: `dynastyScore.test.js:812` uses `gp = 6`, below the `>= 8` gate, and
  the one-season golden master at `:447` is `years_exp: 2`, which routes to Path B. All five inline
  snapshots are Path B/C. Nothing needs updating; every existing assertion should stay green
  untouched, and one that goes red means the change reached further than specified.

---

## 5. Docs

| File | Edit |
|---|---|
| **`docs/dynasty-scoring.md:40`** | **Mandatory, and a correction in the opposite direction to the obvious one.** The row documents PATH A as `years_exp === 0`; the code does `years_exp <= 1` (§1.1). Since this task deliberately does **not** change the gate, the row must be corrected to describe what the code actually does — and must carry a short note that this diverges from the condition the row previously stated, pointing at §6. Do not silently rewrite it as though `<= 1` were always intended; the divergence is the finding |
| `docs/signal-registry.md` | **No change — checked in review.** Neither `seasonsOfData` nor `isRookie` appears anywhere in the registry (the nearest row covers `computeDynastyScore` as a whole, `:97`), and this task adds, removes and reclassifies no signal |

`docs/ui.md` needs no change unless §3.2's copy is quoted there.

---

## 6. Explicitly deferred: the gate itself

Recorded so it is not re-litigated from scratch, and not silently forgotten.

**The question:** should `years_exp === 1` with a qualifying season take the veteran path instead of
the prospect path? The fix would be adding `&& seasonHistory.length === 0` to the first clause,
mirroring the second.

**For:** the second clause's explicit `seasonHistory.length === 0` suggests the intent throughout was
"development asset with no NFL track record", and the first clause omitting it looks like an
oversight. A 17-game, 217.6-point season is real evidence being discarded. **And, found in review
(§1.1): `docs/dynasty-scoring.md:40` documents the gate as `years_exp === 0`.** The intended contract
is on record and the code does not implement it, which makes "deliberate modelling choice" much harder
to sustain.

**Against:** one rookie season is a small, noisy sample; draft capital and college production may
genuinely predict year 3+ better than year-1 production does, and the market (KTC) prices second-year
players largely on pedigree. The prospect path may be right on the merits.

**Why it is not decided here:** it moves the dynasty score for 60+ players, which is scoring-affecting
work, and the roadmap's **D-1** open decision governs the gate form for scoring changes before the
2027 grading window. It is also exactly the kind of question the parked joint-model grading exists to
answer empirically rather than by argument. Revisit with that track, or as its own opus-planned task
with a stated gate.

---

## 7. Cross-repo impact

**None — determined here, in Session 1, as CLAUDE.md requires** (the `Mirror` text is a Session 1
deliverable, not something to hand to the implementer). Neither `seasonsOfData` nor `isRookie` appears
in `docs/signal-registry.md`, and this task adds, removes or reclassifies no signal, no served field
and no stat key. **CR-18 does not trigger**, so there is no `Mirror` text to emit.

---

## 8. Done-definition

- [ ] Only PATH A's `isRookie` / `seasonsOfData` changed; A2 and A4 untouched (§3.1)
- [ ] `score`, `label`, `confidence` and `components` unchanged on every path
- [ ] Score-neutrality asserted by test, not just claimed
- [ ] `:416`'s copy no longer implies a data gap where there is a modelling choice, and is honest for
      **all six** returns that reach it — with every `signals` read optional-chained (§3.2)
- [ ] `docs/dynasty-scoring.md:40` corrected, with the divergence noted rather than silently rewritten
- [ ] `computeProspectScore:565`'s `isRookie` left alone, deliberately (§2)
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] `grep -rn "PROVISIONAL(" src/` — expect Slice ii's three, unchanged
- [ ] Smoked per `CLAUDE.md`: open **Ashton Jeanty** in Market — the index and the DYNASTY SCORE tile
      should both read **1 season**, not 0, and the drivers panel should explain the prospect path
      rather than reporting a gap. Also open a genuine 2026 rookie (**Fernando Mendoza**) and confirm
      he still reads 0 seasons and `isRookie` true

---

## 9. Hand-back should report

- The before/after `score` for a second-year fixture, proving nothing moved.
- Whether any existing test had encoded the bug (§4).
- The new copy, quoted, and whether you branched it three ways.
- What Jeanty and Mendoza each showed in the smoke.

---

## 10. Plan-review record (2026-08-20)

Seven flags; **all seven verified against live source and applied.** One changed the argument rather
than the work.

**`docs/dynasty-scoring.md:40` documents the gate as `years_exp === 0`.** The code does
`years_exp <= 1`. So the intended contract was already on record, and the implementation does not
match it — which is plausibly why the bug survived, since anyone auditing the documented gate would
have seen the correct condition. This does not widen the scope Anton set, but it does weaken the
"deliberate modelling choice" reading in §6 considerably, and §1.1 now records it.

The rest were precision failures in the earlier draft. The null-components copy is reached by **six**
returns, not three — A3 (stale data) and the non-finite guard had no branch in the proposed split, and
`:631` returns a **truthy** score object with `signals: null`, so a bare `signals.isProspect` throws
on a shape that is already fixtured in the tests. `computeProspectScore` carries a **second**
hard-coded `isRookie: true` at `:565`, dead like the first but unfixable without changing an exported
signature, so it is left with the reason recorded. Two questions the draft deferred to Session 2 were
answerable now and are answered: **no existing test encodes the bug** (`:812` uses `gp = 6`, under the
gate; `:447` is `years_exp: 2` → Path B), and **CR-18 does not trigger** — which mattered procedurally,
since CLAUDE.md makes the `Mirror` determination a Session 1 deliverable. And the block anchors were
off by two lines (return block opens `:690`, gate is `:674-676`), though every field line the fix
depends on was correct and `seasonHistory` (declared `:647`) is in scope at the return site.

