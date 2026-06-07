# Tier-0: Stat-label audit (Part A) + demote college breakout age to capture-only (Part B)

**Planning session (opus). Sonnet implements.** Two independent Tier-0 hygiene items.
Do them in sequence or split them — they do not entangle (verified below). Read this whole
file before touching code; if anything contradicts the source, stop and ask.

- **Part A** — verification + contract-test strengthening + doc tightening. **No change to computed outputs.**
- **Part B** — intentional behaviour change: `breakoutAgeFactor` becomes recorded-but-inert on the
  rookie path. Rookie `projectedPPG` shifts for any rookie whose `breakoutAgeFactor ≠ 1.0` **and**
  whose `collegeMult × breakoutAgeFactor` does not clamp to the same value as `collegeMult` alone.

### Do they entangle? — No. Recommendation: keep as one task file, two parts.
Part A touches `statKeysContract.test.js` + docs only; Part B touches `seasonProjection.js` +
`seasonProjection.test.js` + docs. The only shared file is `docs/projection.md` (Part A edits Step 5e /
aDOT prose; Part B edits the Rookie-path college-contribution block) — disjoint sections. No source-file
overlap. Part A surfaced **no real (non-doc) defect** (see A.3). Sonnet may land them in either order or
as two commits.

---

## Repos / file locations

- App repo: `sleeper-dashboard` (this repo).
- Data repo: `sleeper-dashboard-data` (sibling; this repo cannot edit it — Part A cross-repo wording is in
  the *Cross-repo impact* section, already largely present there).

Files in scope:
- `src/utils/seasonProjection.js` — Part B source edits (rookie path only).
- `src/utils/seasonProjection.test.js` — Part B test add/update.
- `src/__tests__/statKeysContract.test.js` — Part A optional strengthening.
- `docs/projection.md`, `docs/integrations.md`, `docs/ui.md`, `README.md`, `CLAUDE.md` — doc edits (both parts).

Files read but **not** edited: `efficiencyMetrics.js`, `usageMetrics.js`, `teamRzShare.js`,
`durabilitySignals.js`, `projectionSignals.js`, `fantasyPoints.js`, `momentum.js`, `regressionSignals.js`,
`dynastyScore.js`, `teamContext.js`, `collegeMetrics.js` (breakoutAge producer — **stays unchanged**),
`components/PlayersTab.jsx` (breakout-age chip — **stays unchanged**), `src/__tests__/factorsSchema.test.js`
(contract count unchanged), `src/__fixtures__/season-totals-2025.json`.

---

# PART A — Stat-label audit

## A.1 — Stat-key inventory (every key read by projection/scoring code)

Enumerated from: `seasonProjection.js`, `dynastyScore.js`, `efficiencyMetrics.js`, `usageMetrics.js`,
`teamRzShare.js`, `durabilitySignals.js`, `momentum.js`, `regressionSignals.js`, `fantasyPoints.js`,
`projectionSignals.js`, and `teamContext.js` (the RZ-denominator aggregator that feeds D3).

`momentum.js`, `regressionSignals.js`, `fantasyPoints.js` read **no raw Sleeper stat keys** — they operate
on PPG arrays / already-bucketed points, or (fantasyPoints) iterate `scoringSettings` generically. No keys
to audit there.

Legend: **Fixture** = present with a finite value in `src/__fixtures__/season-totals-2025.json`
(confirmed: `statKeysContract.test.js` "every contract key … present" + sub-tests are **green** today).
**Contract** = asserted by `statKeysContract.test.js` (set it lives in).

| Stat key | Read by | Fixture | Contract set |
|---|---|---|---|
| `pass_att` | efficiency, usage(RZ denom), durability(QB vol), dynastyScore | ✅ | EFFICIENCY_KEYS |
| `pass_cmp` | efficiency (passerRating + completionPct capture) | ✅ | EFFICIENCY_KEYS |
| `pass_yd` | efficiency, dynastyScore | ✅ | EFFICIENCY_KEYS |
| `pass_td` | efficiency, TD-reliance | ✅ | EFFICIENCY_KEYS + TD_KEYS |
| `pass_int` | efficiency (passerRating) | ✅ | EFFICIENCY_KEYS |
| `pass_2pt` | TD-reliance | ✅ | TD_KEYS |
| `pass_rz_att` | usage (QB RZ own-rate) | ✅ | USAGE_KEYS |
| `rush_att` | efficiency, usage, teamRzShare, durability(RB vol), dynastyScore, teamContext | ✅ | EFFICIENCY_KEYS |
| `rush_yd` | efficiency, dynastyScore | ✅ | EFFICIENCY_KEYS |
| `rush_td` | efficiency, TD-reliance | ✅ | EFFICIENCY_KEYS + TD_KEYS |
| `rush_2pt` | TD-reliance | ✅ | TD_KEYS |
| `rush_rz_att` | usage, teamRzShare, teamContext (rushRz denom) | ✅ | USAGE_KEYS |
| `rec` | efficiency, dynastyScore, teamContext | ✅ | EFFICIENCY_KEYS |
| `rec_tgt` | efficiency, usage, teamRzShare, aDOT, durability(WR/TE vol), dynastyScore, teamContext | ✅ | EFFICIENCY_KEYS |
| `rec_yd` | efficiency, dynastyScore | ✅ | EFFICIENCY_KEYS |
| `rec_td` | efficiency, TD-reliance | ✅ | EFFICIENCY_KEYS + TD_KEYS |
| `rec_2pt` | TD-reliance | ✅ | TD_KEYS |
| `rec_rz_tgt` | usage, teamRzShare, teamContext (recRz denom) | ✅ | USAGE_KEYS |
| `rec_air_yd` | aDOT (Step 5, WR/TE) | ✅ | ADOT_KEYS |
| `off_snp` | usage(snap), durability(contributor evidence) | ✅ | USAGE_KEYS |
| `tm_off_snp` | usage(snap), durability(contributor evidence) | ✅ | USAGE_KEYS |
| `st_td` | TD-reliance | ✅ | TD_KEYS |
| `fum_rec_td` | TD-reliance | ✅ | TD_KEYS |
| `def_td` | TD-reliance (`statVal != null` guard skips on players) | ❌ (by design) | **excluded** (documented) |
| `def_st_td` | TD-reliance (same) | ❌ (by design) | **excluded** (documented) |

Non-player aggregate keys (derived team totals, **not** raw Sleeper player stats, so out of fixture-contract
scope): `historicalTeamTotals[season][team].rushRz` and `.recRz`, summed by `computeHistoricalTeamTotals`
from `rush_rz_att` / `rec_rz_tgt` (both already audited above). `teamRzShare.js` reads those team denominators
via `denomKey`, and reads player `rush_rz_att` / `rec_rz_tgt` / `rush_att` / `rec_tgt` (all ✅).

## A.2 — pass_rtg / cmp_pct / rec_air_yd confirmations (the field-confusion traps)

- **`pass_rtg` and `cmp_pct` are NOT consumed as season values.** Verified by grep across `src/`: they appear
  **only** inside WARNING comments in `efficiencyMetrics.js` (lines 28, 172). No code path reads them. The
  fixture contains them as weekly *sums* (e.g. `pass_rtg: 931.7`, `cmp_pct: 756.82`), which confirms why they
  are unusable as season-level metrics. The app computes canonical passer rating from
  `pass_cmp/att/yd/td/int` (`passerRating()` in `efficiencyMetrics.js`) and true completion rate from
  `pass_cmp/pass_att` (capture-only `completionPct`). **No code change.**
- **`rec_air_yd` runs ~½ published aDOT magnitude.** `seasonProjection.js` Step 5 computes
  `adot = rec_air_yd / rec_tgt` as **capture-only** (does not enter `combinedNewFactor`). Ranking preserved,
  absolute not. Already documented in `docs/projection.md` §"aDOT factors (capture-only)" → "Calibration
  caveat". **No code change.**

## A.3 — Gap diagnosis (the forcing question)

**There is NO key read in projection/scoring code that is missing from the fixture or uncovered by the
contract test.** Every key in A.1 is both present in the fixture (the contract test is green) and asserted by
`statKeysContract.test.js`. `def_td`/`def_st_td` are the only deliberate exclusions and are documented +
asserted-absent. **Part A surfaces no real (non-doc) defect; no fixture change and no `factors`/code change
is required.** This satisfies the constraint that Part A introduces no change to computed outputs.

## A.4 — Contract-test strengthening (optional hardening — recommended, low risk)

The contract key lists are hand-maintained and organized by *source module* (`TD_KEYS`/`EFFICIENCY_KEYS`
from projectionSignals/efficiency, `USAGE_KEYS` from usageMetrics, `ADOT_KEYS`). They are currently complete,
but they do **not** name `teamRzShare.js`, `teamContext.js`, or `durabilitySignals.js` as consumers — those
modules' keys are covered only because they happen to overlap existing sets. To prevent silent drift if a
future edit narrows one of the overlapping sets, add an explicit subset assertion. This strengthens the
contract without changing what code reads (constraint-compliant).

Add to `src/__tests__/statKeysContract.test.js`:

```js
// D3 team-RZ-share (teamRzShare.js) + injury contributor-evidence (durabilitySignals.js) consume a
// subset of the keys already in the contract above. Pin that subset explicitly so a future narrowing of
// EFFICIENCY_KEYS / USAGE_KEYS can't silently drop a key these modules still read.
const D3_AND_DURABILITY_KEYS = [
  'rush_rz_att', 'rec_rz_tgt', 'rush_att', 'rec_tgt',  // teamRzShare numerators + opp gates
  'off_snp', 'tm_off_snp', 'pass_att',                 // durability contributor evidence + QB volume
]

it('teamRzShare + durability consumer keys are a subset of the contract (drift guard)', () => {
  const all = new Set(ALL_CONTRACT_KEYS)
  const missing = D3_AND_DURABILITY_KEYS.filter(k => !all.has(k))
  expect(missing, `consumer keys absent from ALL_CONTRACT_KEYS: ${missing.join(', ')}`).toHaveLength(0)
})

it('teamRzShare + durability consumer keys are all covered in the fixture', () => {
  if (!fixture) return
  const covered = coveredKeys(fixture)
  const missing = D3_AND_DURABILITY_KEYS.filter(k => !covered.has(k))
  expect(missing, `Missing teamRzShare/durability keys: ${missing.join(', ')}`).toHaveLength(0)
})
```

If sonnet prefers a comment-only change here, that is acceptable — the substantive Part A deliverable is the
verified inventory (A.1) + the doc tightening (A.5). The two tests above are the "strengthen the contract
assertion" resolution and should be the default.

## A.5 — Doc tightening (Part A) — see *Docs updates* section below

---

# PART B — Demote `breakoutAgeFactor` to capture-only (rookie path)

## B.1 — Current behaviour (src/utils/seasonProjection.js, `rookieProjection`)

```js
// line 137-145 — breakoutAge + factor (computed from collegeStats):
const breakoutAge = cm?.breakoutAge ?? null
let breakoutAgeFactor = 1.00
if (breakoutAge != null && breakoutAge >= 17 && breakoutAge <= 24) {
  breakoutAgeFactor = breakoutAge <= 19 ? 1.05
                    : breakoutAge === 20 ? 1.02
                    : breakoutAge === 21 ? 1.00
                    : breakoutAge === 22 ? 0.98
                    : 0.96   // 23–24
}

// line 148 — breakoutAgeFactor MOVES projectedPPG via the product:
const collegeContribution = clamp(collegeMult * breakoutAgeFactor, 0.75, 1.25)
// collegeContribution then enters rookieMultiplierProductRaw (line 165-166):
//   ageMult * ktcMult * collegeContribution * nflDraftMultiplier

// line 183-184 — adjustmentSummary lines driven by the factor:
if (breakoutAgeFactor > 1.0)  adjustmentSummary.push('Early college breakout ↑')
if (breakoutAgeFactor < 1.0)  adjustmentSummary.push('Late college breakout ↓')

// line 212-213 — recorded into factors (KEEP):
breakoutAge,
breakoutAgeFactor:    Math.round(breakoutAgeFactor * 1000) / 1000,
```

`collegeMult` is itself already clamped: `clamp(collegeBase + trendAdjust + finalYearAdjust, 0.80, 1.26)`
(line 134), so `collegeMult ∈ [0.80, 1.26]`.

## B.2 — Target behaviour

`breakoutAge` and `breakoutAgeFactor` are **still computed and still recorded** (factors contract unchanged:
48 rookie keys). `breakoutAgeFactor` **no longer moves `projectedPPG`** and **adds no `adjustmentSummary`
lines** — i.e. it becomes capture-only like `ktcHist*` / `positionMultiplicity*` / `adot*`. `breakoutAge`
stays available to the College-Production chip (which reads it from `collegeMetrics`, not from the projection
— see B.5).

### Clamp decision (the outer clamp on collegeContribution) — **Option A: keep the clamp**

Use:
```js
const collegeContribution = clamp(collegeMult, 0.75, 1.25)
```

Rationale:
- The `[0.75, 1.25]` bound is the documented "total college effect bounded to ±25%" envelope of the rookie
  path. Keeping it preserves that contract verbatim and confines the behaviour change to exactly one thing:
  removing the `× breakoutAgeFactor` term. (Dropping the clamp — Option B, `collegeContribution = collegeMult`
  — would be a *second*, separate behaviour change: it would let `collegeContribution` reach 1.26 instead of
  capping at 1.25. We do not want a second change in a "demote one factor" task.)
- Since `collegeMult ∈ [0.80, 1.26]`, after the change the **lower** bound `0.75` becomes unreachable (dead),
  and the **upper** bound `1.25` still binds for the `collegeMult = 1.26` corner. This is intentional and
  harmless; retain `0.75` so the documented symmetric ±25% envelope reads cleanly and a future widening of
  `collegeMult`'s lower clamp can't silently blow past it.

**Effect on the factors contract / capture-only invariant:** none on the count (`collegeContribution`,
`breakoutAge`, `breakoutAgeFactor` all remain recorded → 48 rookie keys unchanged). `breakoutAgeFactor` moves
from "active rookie multiplier" to "capture-only", which the *Capture-only factors* invariant must now name
(see Docs updates → CLAUDE.md).

> Alternative considered — **Option B** (`collegeContribution = collegeMult`, drop the outer clamp): rejected
> because it changes the upper-bound behaviour (1.26 vs 1.25) on top of the intended demotion and weakens the
> documented ±25% envelope. If the implementer has a reason to prefer B, **stop and ask** — it changes Test 15's
> arithmetic (see Tests) and the docs wording.

## B.3 — Exact source edits (src/utils/seasonProjection.js)

1. **Comment at line 136** — change
   `// breakoutAge — separate (independent) factor.`
   →
   `// breakoutAge / breakoutAgeFactor — CAPTURE-ONLY: computed and recorded into factors for backtesting,`
   `// but does NOT move projectedPPG (not in collegeContribution) and adds no adjustmentSummary lines.`
   Keep the `breakoutAge` + `breakoutAgeFactor` computation block (lines 137-145) **byte-identical** otherwise.

2. **Line 147-148** — change the collegeContribution comment + product:
   - before:
     ```js
     // collegeContribution — total college effect, explicitly bounded to ±25%.
     const collegeContribution = clamp(collegeMult * breakoutAgeFactor, 0.75, 1.25)
     ```
   - after:
     ```js
     // collegeContribution — total college effect, explicitly bounded to ±25%.
     // breakoutAgeFactor is capture-only (demoted) and intentionally NOT multiplied in here.
     // collegeMult is already clamped to [0.80, 1.26]; the lower 0.75 bound is unreachable but
     // retained to keep the documented ±25% envelope explicit.
     const collegeContribution = clamp(collegeMult, 0.75, 1.25)
     ```

3. **Lines 183-184** — **delete** both adjustmentSummary pushes (required to satisfy the capture-only invariant
   "adds no adjustmentSummary lines"):
   ```js
   if (breakoutAgeFactor > 1.0)          adjustmentSummary.push('Early college breakout ↑')
   if (breakoutAgeFactor < 1.0)          adjustmentSummary.push('Late college breakout ↓')
   ```

4. **Lines 212-213** — **leave unchanged** (still record `breakoutAge` and `breakoutAgeFactor`).

No other edits. Do not touch `collegeMetrics.js`, the playerRows pipeline, or any other factor.

## B.4 — Why no factorsSchema change

`factorsSchema.test.js` `ROOKIE_FACTORS_KEYS` includes `breakoutAge` and `breakoutAgeFactor` (and
`collegeContribution`). All three remain emitted → still exactly 48 rookie keys. **Do not edit
`factorsSchema.test.js`.**

## B.5 — Confirm no other consumer of breakoutAge / breakoutAgeFactor

Grep results (`grep -rn breakoutAge src/`):
- `collegeMetrics.js` — **producer** of `breakoutAge`; unchanged.
- `components/PlayersTab.jsx` lines 544-558 — College-Production **breakout-age chip**, reads `breakoutAge`
  directly from `collegeMetrics` (`Early/Breakout/Late breakout · Age N`); **independent of the projection**,
  keeps working. Unchanged.
- `seasonProjection.js` — the only place `breakoutAgeFactor` exists (edited above).
- Tests reference both (see Tests section).

No other runtime consumer. The chip does **not** read `factors.breakoutAge*`, so demotion does not affect UI.

---

# Docs updates

Apply mechanically. Sections that need **no** change are called out explicitly.

## docs/projection.md

**(B) Rookie path — `collegeContribution` formula (line 79).** Replace:
> **College contribution** — `collegeContribution = clamp(collegeMult × breakoutAgeFactor, 0.75, 1.25)` (bounded ±25%):

with:
> **College contribution** — `collegeContribution = clamp(collegeMult, 0.75, 1.25)` (bounded ±25%). `breakoutAgeFactor` is **capture-only** (recorded in `factors`, does **not** move `projectedPPG`) — see below:

**(B) Rookie path — `breakoutAgeFactor` bullet (line 85).** Replace:
> - **breakoutAgeFactor** — breakout age ≤ 19 → 1.05, 20 → 1.02, 21 → 1.00, 22 → 0.98, 23–24 → 0.96; neutral (1.00) if null or implausible

with:
> - **breakoutAgeFactor** (capture-only) — breakout age ≤ 19 → 1.05, 20 → 1.02, 21 → 1.00, 22 → 0.98, 23–24 → 0.96; neutral (1.00) if null or implausible. **Recorded for backtesting only — it does not enter `collegeContribution` and does not move `projectedPPG`** (demoted; see "College breakout-age factor (capture-only)" below). `breakoutAge` is still computed and still drives the College-Production chip in the Profile panel.

**(B) Rookie path — `projectedPPG` line (line 66).** **No change** — the formula
`ROOKIE_BASELINE_PPG[pos] × ageMult × ktcMult × collegeContribution` is still correct (`collegeContribution`
remains a factor; only its internal definition changed).

**(B) New capture-only subsection.** After the "aDOT factors (capture-only)" section (ends ~line 182), add:
> ### College breakout-age factor (capture-only)
>
> The rookie path records `breakoutAge` and `breakoutAgeFactor` for backtesting. They are **diagnostic only —
> they do not move `projectedPPG`** and add no `adjustmentSummary` lines. `breakoutAge` is computed by
> `computeCollegeMetrics` (`src/utils/collegeMetrics.js`) and also feeds the College-Production breakout-age
> chip (see docs/ui.md). `breakoutAgeFactor` was an active rookie multiplier in earlier batches; it was demoted
> to capture-only (breakout age's standalone predictive signal was weak once `collegeMult` and NFL draft slot
> were in the model). Vet path does not compute these keys.

**(A) Step 5e prose (line 34).** Already states passer rating is computed from season totals "not the stored
per-week `pass_rtg` (which Sleeper reports weekly and the loader sums)". **Tighten** by appending one clause so
the `cmp_pct` twin is named too. Replace the final sentence:
> QB passer rating is computed from season totals, **not** the stored per-week `pass_rtg` (which Sleeper reports weekly and the loader sums); `completionPct` is recorded in `factors.efficiencyMetrics` for backtesting but does not feed the factor.

with:
> QB passer rating is computed from season totals, **not** the stored per-week `pass_rtg`; likewise `completionPct` is computed from `pass_cmp/pass_att`, **not** the stored per-week `cmp_pct`. Both `pass_rtg` and `cmp_pct` are weekly values the loader **sums**, so they are unusable as season-level metrics and are **never consumed** by projection code. `completionPct` is recorded in `factors.efficiencyMetrics` for backtesting but does not feed the factor.

**(A) aDOT "Calibration caveat" (lines 164-171).** Already accurate (rec_air_yd ≈ ½ published aDOT; ranking
preserved, absolute not). **No change required** — it is the canonical statement; leave as-is.

## docs/integrations.md

**(A) "Why more datapoints in some years" — new note in Career history loader.** In §"Career history loader
(`src/api/sleeperStats.js`)", after the existing "Usage stat keys (D2)" paragraph (line 199), add:

> **Why some seasons carry more stat fields than others (stated fact, not a bug).** Field coverage differs by
> era and is expected:
> - **Snap & red-zone keys** (`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) exist in
>   Sleeper data from **~2021 onward**. Pre-2021 seasons lack them, so the D2 snap-share / RZ-usage factors,
>   D3 team-RZ-share, and the durability snap-share contributor signal all **degrade to neutral** for those
>   seasons (by design — see `usageMetrics.js`, `teamRzShare.js`, `durabilitySignals.js`).
> - **Season length:** pre-2021 NFL had **17 regular-season weeks**; those seasons store `X` at week 18 for
>   every player (see `sleeper-dashboard-data/README.md → nfl/season-totals`).
> - **College coverage:** CFBD college stats are loaded for **2017–2024 only** (see CFBD integration below),
>   so the rookie path's college signals are blank for players whose college careers fall outside that window.

**(A) CFBD integration — coverage years.** §"Fetching (`src/api/cfbd.js`)" line 18 already states "years
2017–2024". **No change** beyond the cross-reference added above. (If sonnet wants to make the back-reference
concrete, it may append "(see Career history loader → coverage note)" — optional.)

**(B) College metrics return-shape `breakoutAge` comment (line 99).** Optional tighten — append capture-only
note. Replace:
> `  breakoutAge,          // integer age or null`

with:
> `  breakoutAge,          // integer age or null — drives the Profile breakout chip; projection records it capture-only`

## docs/ui.md

**(B) College Production section (lines 163-164).** The breakout-age chip is unchanged and keeps working.
**No change required.** (Optional: append "(descriptive — breakout age does not affect the projection)" to the
line 164 chip description if sonnet wants to forestall the question; not required.)

## README.md

**No change required for Part A or Part B.**
Note (pre-existing, out of scope): README line 70 says "all 56 vet / 42 rookie factors keys" — this is already
**stale** (current contract is 69 vet / 48 rookie, per `factorsSchema.test.js`). It is **not** caused by this
task (neither part changes the counts). Leave it, or fix it as a drive-by only if explicitly desired — flag it
to the user rather than silently editing.

## CLAUDE.md (app)

**(B) Invariants → "Capture-only factors do not move projectedPPG."** Replace:
> **Capture-only factors do not move projectedPPG.** `ktcHist*` and `positionMultiplicity*` keys are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines.

with:
> **Capture-only factors do not move projectedPPG.** `ktcHist*`, `positionMultiplicity*`, `adot*` (all paths) and the rookie-path `breakoutAgeFactor` are diagnostic only — they must not affect `projectedPPG` and must add no `adjustmentSummary` lines. (`breakoutAge`/`breakoutAgeFactor` are still computed and recorded; `breakoutAge` drives the Profile breakout chip.)

**(A) Cross-repo contracts.** The `pass_rtg`/`cmp_pct` and `rec_air_yd` notes live in the **data repo's**
CLAUDE.md (already present — see Cross-repo impact). The app CLAUDE.md "Cross-repo contracts" section needs
**no change** for Part A (the field-confusion facts are documented in `docs/projection.md` per above).

**(self-maintenance)** `seasonProjection.js` line-reference in CLAUDE.md navigation table ("13-step vet
pipeline (10 `combinedNewFactor` signals) + comp blend + rookie path") is unaffected — no update needed.

---

# Tests to add

All in `src/utils/seasonProjection.test.js` (integration tests on `computeNextSeasonProjection`), in the
existing `describe('computeNextSeasonProjection — rookie path integration', …)` block. Use the existing
`makeRookie({...}).asOptions()` builder (see Tests 7-19 for the pattern).

### T-B1 (Part B) — breakoutAgeFactor is capture-only: same projectedPPG, recorded factor differs

The decisive new test. Two rookies **identical except `breakoutAge`**, with a **mid-range `collegeMult`** so
the difference would be observable if it still moved PPG.

Setup (shared):
- `player: { position: 'WR', age: 22, years_exp: 0, team: 'KC' }`, `ktcMap: null` (ktcMult = 1.0),
  `nflDraftMatches: null` (nflDraftMultiplier = 1.0).
- College for rookie **EARLY**: `{ peakDominator: 22, productionTrend: 'peak-final', finalYearDominator: 22,
  seasonsPlayed: 1, breakoutAge: 19 }` → `collegeBase = 1.08`, trendAdjust 0.0, finalYearAdjust 0.0
  (seasonsPlayed < 2) → `collegeMult = clamp(1.08, 0.80, 1.26) = 1.08`; `breakoutAgeFactor = 1.05`.
- College for rookie **NEUTRAL**: identical but `breakoutAge: 21` → `breakoutAgeFactor = 1.00`; same
  `collegeMult = 1.08`.

Expected (after Part B, Option A):
- `rEarly.factors.collegeContribution === rNeutral.factors.collegeContribution` and **both ≈ 1.08**
  (`clamp(1.08, 0.75, 1.25)`), to 3 dp. *(Pre-Part-B this test would FAIL: EARLY would be
  `clamp(1.08×1.05)=1.134` vs NEUTRAL `1.08` — which is exactly the behaviour being removed.)*
- `rEarly.projectedPPG === rNeutral.projectedPPG` (byte-identical — capture-only).
- `rEarly.factors.breakoutAgeFactor` ≈ **1.05**; `rNeutral.factors.breakoutAgeFactor` ≈ **1.00**
  (still recorded — proves "recorded but inert").
- `rEarly.factors.breakoutAge === 19`; `rNeutral.factors.breakoutAge === 21`.

Model on Test 5 (line 297, "ktcHistory signals are capture-only: projectedPPG identical …").

### T-B2 (Part B) — no adjustmentSummary line from breakout age

- Rookie with `breakoutAge: 19` (factor 1.05): `expect(r.adjustmentSummary).not.toContain('Early college breakout ↑')`.
- Rookie with `breakoutAge: 24` (factor 0.96): `expect(r.adjustmentSummary).not.toContain('Late college breakout ↓')`.

(There is **no** existing test asserting these strings *are* present — verified by grep — so deleting the
pushes breaks nothing; T-B2 pins their absence going forward.)

### T-A1 / T-A2 (Part A, optional hardening) — see A.4

The two `statKeysContract.test.js` tests in §A.4 ("teamRzShare + durability consumer keys are a subset of the
contract (drift guard)" and "… all covered in the fixture"). Default to including them.

---

# Existing tests whose expectations change

### `src/utils/seasonProjection.test.js`

- **Test 15 (line 791, "D1 clamp above").** Under **Option A** the **assertion is unchanged and still passes**:
  `collegeMult = clamp(1.28) = 1.26`; new `collegeContribution = clamp(1.26, 0.75, 1.25) = 1.25` — *the same
  1.25* the old `clamp(1.26×1.05, …)` produced — so `rookieMultiplierProduct` still clamps to **1.85** and
  `projectedPPG ≤ 13.0` still holds. **Only the explanatory comment is stale.** Update the comment block
  (lines 795-798) by removing the `× breakoutAge=19 (×1.05)` term:
  - before: `// college: peakDom=32 (1.20) + improving (+0.05) + finalYr=32/32 ratio≥0.85 (+0.03) + breakoutAge=19 (×1.05)`
            `//   collegeMult = clamp(1.28, 0.80, 1.26) = 1.26; collegeContribution = clamp(1.26×1.05, 0.75, 1.25) = 1.25`
  - after:  `// college: peakDom=32 (1.20) + improving (+0.05) + finalYr=32/32 ratio≥0.85 (+0.03) [breakoutAge=19 → factor 1.05 recorded but capture-only, not in product]`
            `//   collegeMult = clamp(1.28, 0.80, 1.26) = 1.26; collegeContribution = clamp(1.26, 0.75, 1.25) = 1.25`
  The `collegeStats` fixture in this test keeps `breakoutAge: 19` (so the recorded factor is still exercised).
  **No assertion edit.** (Under Option B this test's arithmetic would change — another reason to use Option A.)

- **Test 7 (line 595, "year-1 rookie").** `collegeMult = 1.26` here too, so `collegeContribution` is **1.25
  both before and after** (both clamp at the top) → `projectedPPG` is **unchanged**; the existing assertions
  (`collegeBase ≈ 1.20`, `breakoutAgeFactor ≈ 1.05`, `projectedPPG ∈ (0,40)`) all still pass. **No edit.**
  (Note: this test does *not* demonstrate the behaviour change — that is what T-B1 is for, with a mid-range
  `collegeMult`.)

- **Test 16 (line 842), Test 17 (line 877), Test 19 (line 926), Test 10 (line 941).** `breakoutAge` is `null`
  or college is absent → `breakoutAgeFactor = 1.0` → `collegeContribution` identical before/after. **No edit.**
  (Test 16's comment line 846 already says "no breakoutAge (1.0)" and "collegeContribution = clamp(0.80, …)" —
  still correct.)

### `src/__tests__/factorsSchema.test.js`
**No change** — 48 rookie keys unchanged (B.4).

### `src/__tests__/statKeysContract.test.js`
**No expectation change** — Part A adds tests (A.4) but changes none. All 10 existing tests stay green.

### Build / suite
`npm test` (full suite green) + `npm run build` (clean) per CLAUDE.md done-definition. Run
`factorsSchema.test.js` (seasonProjection changed) and `statKeysContract.test.js` (contract touched).

---

# Cross-repo impact

**Part A:** the field-confusion facts are **already mirrored in `sleeper-dashboard-data`** — no data-repo edit
is strictly required. For reference, the existing data-repo wording to keep in sync is:

- `sleeper-dashboard-data/CLAUDE.md` (Cross-repo contracts table):
  - **`pass_cmp` row** — already notes: *"stored `pass_rtg` and `cmp_pct` fields are weekly sums (not reliable
    season-level metrics) and are NOT consumed by the app — preserve as-is, no action needed"* and that the app
    computes canonical passer rating from `pass_cmp/pass_att/pass_yd/pass_td/pass_int`. ✅ matches app A.2.
  - **`rec_air_yd` row** — already notes: *"values run ~½ industry aDOT magnitude (likely air yards on completed
    receptions only, not all targets) — ranking is preserved, absolute magnitude is not industry-standard; this
    is the app's concern, not the data repo's"* and that it is WR/TE capture-only, does not affect
    `projectedPPG`. ✅ matches app A.2.
- `sleeper-dashboard-data/README.md` line 93 — already states the **pre-2021 17-week** fact. ✅

The only fact **not yet explicit** in the data repo is the "**snap/RZ keys exist ~2021+**" coverage note (the
data-repo Cross-repo contract row for snap/RZ keys says they are "preserved as-is" but does not state the
era-start). **Optional** data-repo mirror (call out in the task summary so the data repo *can* be updated; this
app-side task does not block on it). Suggested exact wording to add to the
`sleeper-dashboard-data/README.md → nfl/season-totals/<year>.json` section (after the `weeklyStatus`/pre-2021
note, line ~93):

> **Snap & red-zone field coverage:** `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` are
> present in Sleeper data from **~2021 onward**; seasons before then omit them. They flow through the generic
> sum-all-keys aggregation unchanged — the app degrades the dependent projection factors to neutral for older
> seasons (see sibling repo `usageMetrics.js` / `teamRzShare.js` / `durabilitySignals.js`).

**Part B:** **No cross-repo impact.** `breakoutAgeFactor` is computed entirely in the app from `collegeStats`;
it is not a data-repo field. The snapshot shape (`projection` field = verbatim `computeNextSeasonProjection`
output) is unaffected: the same 48 rookie `factors` keys are emitted; only the *value* of
`collegeContribution` / `projectedPPG` shifts for affected rookies (and `adjustmentSummary` loses two possible
lines). No schema/manifest/validator change.

---

# Step sequence (for the implementer)

**Part A** (no computed-output change):
1. (Optional, recommended) Add the two drift-guard tests to `statKeysContract.test.js` (§A.4). Run it green.
2. Apply docs/projection.md Step-5e tighten + aDOT (no-op) per Docs updates.
3. Apply docs/integrations.md "why more datapoints" note.
4. (Optional) docs/integrations.md breakoutAge comment, docs/ui.md note.
5. `npm test`, `npm run build`.

**Part B** (intentional behaviour change):
1. Edit `seasonProjection.js` per B.3 (comment 136; product 148; delete summary 183-184; keep 212-213).
2. Add T-B1 + T-B2 to `seasonProjection.test.js`.
3. Update Test 15's stale comment (lines 795-798); confirm Tests 7/10/16/17/19 still pass untouched.
4. Apply docs/projection.md Rookie-path edits + new capture-only subsection; CLAUDE.md invariant edit.
5. `npm test` (esp. `factorsSchema.test.js` + the rookie integration block), `npm run build`.
6. In the task summary, note: (a) intentional rookie projection shift for `breakoutAgeFactor ≠ 1.0` rookies;
   (b) the optional data-repo snap/RZ era-coverage mirror (Cross-repo impact).
