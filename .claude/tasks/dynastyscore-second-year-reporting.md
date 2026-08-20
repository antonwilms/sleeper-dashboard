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

`computeDynastyScore`'s **PATH A: True prospect** gate (`src/utils/dynastyScore.js:673-676`):

```js
const isTrueProspect =
  (yearsExp != null && yearsExp <= 1) ||
  (yearsExp != null && yearsExp <= 3 && seasonHistory.length === 0 && hasKTC)
```

The **second** clause requires `seasonHistory.length === 0` — no NFL track record. The **first does
not.** Sleeper's `years_exp` counts *completed* seasons, so `years_exp === 1` is a player who has
just finished his rookie year. Every one of them takes the prospect path, which hard-codes
(`:694-703`):

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
- **`seasonsOfData` has exactly one consumer**, `PlayerDetailModal.jsx` — the DYNASTY SCORE tile note
  (`:211`) and Slice 3's index coverage span (`:118-127`). Display only.

Neither feeds `projectedPPG`, the composite, or any `factors` entry.

---

## 3. The change — PATH A only

In the `isTrueProspect` return block (`dynastyScore.js:692-707`):

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

Note this copy is reached by three distinct paths (prospect, unproven-vet, data-gap) whose reasons
differ. If one sentence cannot serve all three honestly, branch on `signals.isProspect` /
`isUnprovenVet` / `isDataGap`, which are already on the object.

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
- Check whether any existing test asserts `isRookie: true` or `seasonsOfData: 0` for a fixture that is
  a second-year player. If one does, it encoded the bug — **update it to assert the correct outcome**
  and say so in the hand-back, per the done-definition's "not merely edited to go green".

---

## 5. Docs

| File | Edit |
|---|---|
| `docs/dynasty-scoring.md` | The PATH A description, if it states the `years_exp <= 1` gate or claims prospects have no NFL seasons. Record that `seasonsOfData` now reports the real count on this path |
| `docs/signal-registry.md` | Only if `seasonsOfData` or `isRookie` appears as a listed signal — check; if it does, this is a *current use* correction, which is a **CR-18 trigger** and needs the `Mirror` text emitted |

`docs/ui.md` needs no change unless §3.2's copy is quoted there.

---

## 6. Explicitly deferred: the gate itself

Recorded so it is not re-litigated from scratch, and not silently forgotten.

**The question:** should `years_exp === 1` with a qualifying season take the veteran path instead of
the prospect path? The fix would be adding `&& seasonHistory.length === 0` to the first clause,
mirroring the second.

**For:** the second clause's explicit `seasonHistory.length === 0` suggests the intent throughout was
"development asset with no NFL track record", and the first clause omitting it looks like an
oversight. A 17-game, 217.6-point season is real evidence being discarded.

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

**None**, unless §5's `signal-registry.md` check finds a listed row — in which case that edit is a
**CR-18** trigger and the `Mirror` text must be emitted. Check before concluding "none".

---

## 8. Done-definition

- [ ] Only PATH A's `isRookie` / `seasonsOfData` changed; A2 and A4 untouched (§3.1)
- [ ] `score`, `label`, `confidence` and `components` unchanged on every path
- [ ] Score-neutrality asserted by test, not just claimed
- [ ] `:416`'s copy no longer implies a data gap where there is a modelling choice
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
