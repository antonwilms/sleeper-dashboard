# Denominator floors for Market's per-opportunity rates

**Type:** small fix to a shipped surface. **Model:** sonnet.
**Baseline:** app `cc6487b`.
**Origin:** a spec omission in [dp-v2-5b-efficiency-set.md](dp-v2-5b-efficiency-set.md) — the task
file specified every rate as "sum components, then divide" and never asked for a sample floor. The
implementation is correct against what it was given; this closes the gap.

---

## 1. The problem

`src/utils/seasonEfficiency.js`'s `ratio(num, den)` guards only `den > 0`, so **all four
per-opportunity rates emit at a denominator of 1**:

| Column | Emitted from | Emitted at |
|---|---|---|
| `EPA/ATT` | `passingEpa ÷ attempts` | 1 attempt |
| `CPOE` | `Σ(passingCpoe × attempts) ÷ Σattempts` | 1 attempt |
| `RUSH EPA/ATT` | `rushingEpa ÷ carries` | 1 carry |
| `EPA/TGT` | `receivingEpa ÷ targets` | 1 target |

The **values are arithmetically correct** — Slice 5b verified the CPOE weighting by hand against raw
gamelogs. The defect is presentational and shows up under **sorting**: a 3-attempt backup reading
`CPOE +29pp` sorts above a 600-attempt starter at `+2.2pp`, as though they were comparable. On a
sortable column the top of the sort is the most-read part of the table, and it is currently noise.

**This is the repo's own established discipline, not a new idea.** `computeConsistency` returns a
**null** `sd` below `MIN_POOLED_GAMES = 10` rather than a noisy one; `QUALIFYING_GP = 8` gates the
share series for the same reason. Efficiency's rates are the outlier.

---

## 2. Rates need floors; shares do not

**Apply floors only to the four per-opportunity rates above.** Do **not** floor `CARRY SH`, `TGT SH`,
`AY SH`, `RZ SH` or `SNAP%`.

A share at a small denominator is not noise — it is a true small share. A back with 1 carry genuinely
has ~0.3% of the team's carries, and that is information. A *rate* at a small denominator is an
estimate with an enormous confidence interval presented as a point value, which is the thing that
misleads.

---

## 3. The floors, and the evidence for them

Measured over `nflverse/gamelogs/2025.json`, REG only, players with a non-zero denominator:

| Denominator | Floor | Players kept | Rationale |
|---|---|---|---|
| Pass attempts | **100** | 45 of 76 QBs (59%) | Excludes backups and wildcat throws; a genuine starter clears it by week 5 |
| Carries | **25** | 83 of 139 RBs (60%) | A committee back clears it; a returner or emergency back does not |
| Targets | **25** | 119 of 220 WRs (54%), 55 of 121 TEs (45%) | Same shape one tier down |

**A single shared floor would be wrong**, which is why they differ: `100` keeps 59% of QBs but would
blank **87% of WRs** and 93% of TEs, because target volume is an order of magnitude below attempt
volume. Floors belong to the denominator, not to the set.

**These are display floors, not stability claims.** 25 targets does not make an EPA/target estimate
statistically stable; it makes it not-noise. The claim is only that below the floor the number
misleads more than it informs. Record the kept-percentage in a comment beside each constant so the
choice stays auditable when someone revisits it.

---

## 4. The change

In `src/utils/seasonEfficiency.js`:

- Add three named exported constants — e.g. `MIN_PASS_ATTEMPTS = 100`, `MIN_CARRIES = 25`,
  `MIN_TARGETS = 25` — each with its kept-percentage in a trailing comment.
- Gate the four rates on their own denominator. `null` below the floor; the existing render path
  already turns `null` into `—`, so **no component change should be needed** — confirm that rather
  than assuming.
- Leave `ratio()` itself alone; it is used by the share paths too. Gate at the call site, or add a
  separate floored helper. Do not add a floor parameter that defaults to 1 — a default that reproduces
  today's behaviour invites a caller that silently skips the floor.

**Do not touch `rushEpaTotal`** — it is a season **total**, not a rate, and needs no floor.

---

## 5. Sorting

`compareNullsLast` already sinks nulls, so floored-out players fall to the bottom of an ascending sort
and off the top of a descending one. That is the whole point of the fix — **verify it**, because it is
the behaviour the change exists to produce.

---

## 6. Tests

- Each of the four rates returns `null` one below its floor and a number at it. Assert the boundary
  on both sides, per denominator.
- **Shares are unaffected** — a 1-carry back still has a `CARRY SH`. Assert this explicitly; it is the
  distinction §2 turns on and the easiest thing for a later change to erode.
- `rushEpaTotal` is unaffected.
- Sorting by a floored rate puts real starters at the top and floored players last.
- Existing `seasonEfficiency` and `Market` tests: any that assert a rate for a low-denominator fixture
  encoded the old behaviour and must be **updated to the correct new outcome**, not deleted. Say which
  you changed.

---

## 7. Smoke

- Sort Market's Efficiency set by `CPOE` descending under the QB pill: the top should be real
  starters, **not** a 3-attempt backup. This is the one check that proves the fix.
- Same for `EPA/TGT` under WR.
- Confirm roughly the expected share of each position still shows a value (§3) — if far more or fewer
  are blank than the table predicts, the floor is being applied to the wrong denominator.

---

## 8. Docs

| File | Edit |
|---|---|
| `docs/ui.md` → *Market* Efficiency set | The floors, their values, and that shares are deliberately unfloored |
| `CLAUDE.md` `src/utils/` table | `seasonEfficiency.js` row gains the floors |

---

## 9. Cross-repo impact

**None.** No served shape, no stat key, no coverage claim, no Current-use change — the same keys are
read by the same code; only a display gate is added. Confirm `docs/signal-registry.md` needs no edit
rather than assuming, per this program's record with CR-18.

---

## 10. Done-definition

- [ ] Three named constants with kept-percentage comments
- [ ] Only the four **rates** floored; the five **shares** untouched; `rushEpaTotal` untouched
- [ ] `ratio()` unchanged, or the floor added without a permissive default
- [ ] Boundary tests on both sides of each floor
- [ ] Floored players sort last, verified
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Smoked per §7 — CPOE descending under QB tops out on real starters
