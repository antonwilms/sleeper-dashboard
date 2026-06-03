# Task: `combinedNewFactor` Envelope Restructure

Restructure how the 9 secondary-signal factors combine into `combinedNewFactor`
in `src/utils/seasonProjection.js`. Pure architectural refactor with intentional
behavior change **at the extremes only**. No factor formulas, weights, or new
signals.

---

## ⚠️ Headline finding — the premise is empirically wrong

The brief (and the current in-code comment) claim the `[0.78, 1.30]` clamp "binds
for a meaningful tail of stackers." **It does not.** Running the real pipeline over
the full 2012–2025 history (1,504 qualifying vet projections), the pre-clamp
product distribution is:

```
min 0.755 · p5 0.82 · p10 0.838 · p25 0.888 · med 0.955 · p75 1.01 · p90 1.089 · p95 1.135 · max 1.328   (mean 0.959)
```

| bin | count | % |
|---|---|---|
| [0, 0.65) | 0 | 0.0% |
| [0.65, 0.78) | 13 | 0.9% |
| [0.78, 0.85) | 174 | 11.6% |
| [0.85, 0.95) | 540 | 35.9% |
| [0.95, 1.05) | 532 | 35.4% |
| [1.05, 1.15) | 176 | 11.7% |
| [1.15, 1.30) | 68 | 4.5% |
| [1.30, 1.50) | 1 | 0.1% |
| [1.50, ∞) | 0 | 0.0% |

**Clamp-hit rate: upper (>1.30) = 0.1% (1 player), lower (<0.78) = 0.9% (13), inside = 99.1%.**

The theoretical `[0.607, 1.685]` range is the product of every factor
simultaneously at its extreme — which essentially never co-occurs because the 9
factors are weakly correlated and several are usually exactly 1.0 (breakout,
bounceBack, tdReliance are binary; snap/rz/efficiency hug 1.0). Realized spread is
tight and centered at 0.96.

**Worked extremes (real players, full factor sets):**
- High: **Drake London 1.328** — momentum 1.08 × breakout 1.08 × trajectory 1.07 ×
  snap 1.042 × efficiency 1.019 × rz 1.002 (a genuine young-breakout WR). The
  *only* player above 1.30 in 14 seasons.
- Low: **Stevan Ridley 0.755**, Phillip Lindsay 0.761, Andre Johnson / Brandon
  Myers / Le'Veon Bell 0.765 — all stacking momentum 0.92 × trajectory 0.93 ×
  tdReliance/efficiency/rz penalties (declining-vet profiles).

**Measurement caveat:** `qbQualityFactor` was forced to 1.0 in this run
(`computeQBQualityByTeam` lives in the App.jsx pipeline, not reproducible
standalone). Its true range is `[0.95, 1.05]` and applies to non-QBs only, so real
non-QB tails are up to ±5% wider than measured — a high-stacker WR could reach
~1.39, a low-stacker RB ~0.72. Even generously, the clamp-hit rate stays in the low
single digits, and the conclusion only strengthens: **the `[0.78, 1.30]` clamp is
already, in practice, a near-never-fire guardrail — not an active moderator.**

**Implication for the design.** The architecture is *not* producing nonsensical
compounding today. The real risk is **future factor growth**: each added signal
widens the theoretical range and slowly fattens the realized tails. So this batch
should (a) re-role the clamp from "accidental moderator set too tight" to "explicit
sanity rail," (b) widen it to match that role, and (c) **instrument** the realized
distribution so the deeper restructure happens when data — not theory — says so.

---

## 1. Verification findings (current source)

`src/utils/seasonProjection.js` (lines 470–489):
```js
const combinedNewFactor = clamp(
  qbQualityFactor * momentumFactor * breakoutFactor * bounceBackFactor
    * tdRelianceFactor * trajectoryFactor * efficiencyFactor
    * snapShareFactor * rzUsageFactor,
  0.78, 1.30
)
const rawPPG = basePPG * ageDelta * shareTrendMultiplier * regressionFactor
             * teamFactor * depthFactor * combinedNewFactor
```
- **9 factors confirmed** (claim verified). Per-signal ranges (all verified against
  their modules): qbQuality `[0.95,1.05]`, momentum `[0.92,1.08]`, breakout
  `{1.0,1.08}`, bounceBack `{1.0,1.05}`, tdReliance `{0.93,1.0}`, trajectory
  `[0.93,1.07]`, efficiency `[0.90,1.10]`, snapShare `[0.94,1.06]`, rzUsage
  `[0.95,1.05]`. Theoretical product `[0.6075, 1.6846]` — confirmed exact.
- `teamFactor` and `depthFactor` are applied **outside** the clamp (downstream in
  `rawPPG`) — out of scope, untouched.
- All 9 factors are **recorded individually** in `factors`, so the pre-clamp product
  is reconstructable for tests/diagnostics without re-deriving anything.
- Rookie path has **no** `combinedNewFactor` key (separate factor set) — untouched.

Contract/doc state:
- `factorsSchema.test.js`: **61 vet** / 42 rookie; value test asserts
  `combinedNewFactor ∈ [0.78, 1.30]` (lines ~197–199).
- `CLAUDE.md` line 97: "61 vet keys / 42 rookie keys."
- `docs/projection.md` line 31: the `combinedNewFactor` paragraph states the false
  "binds for a meaningful tail … deliberate ceiling … add inside rather than
  widening." Must be rewritten.

*(Distribution produced by running the real `computeNextSeasonProjection` +
`computeEmpiricalAgeCurves` over `sleeper-dashboard-data/nfl/season-totals/2012–2025`
+ `raw/-players-nfl.json` via `vite-node`; pre-clamp product reconstructed from the
9 recorded factor fields. Throwaway script, no source touched.)*

---

## 2. Design choice — **Option A: preserve multiplicative form, widen the envelope to a sanity rail, add a capture-only diagnostic**

Rejecting B/C on the evidence:

- **Why not Option B (additive aggregate index)?** It's a principled symmetric form,
  but the data shows the multiplicative product is already well-behaved (tight,
  centered, sane extremes) — there is no compounding pathology to fix. Worse, an
  additive conversion changes **every** player's value (product ≠ `1 + Σδ` by the
  cross-terms `Σ_{i<j} δ_iδ_j`), directly conflicting with the constraint to keep
  typical-case behavior unchanged. Solving a ~1%-incidence extreme problem by
  perturbing 100% of projections is the wrong trade today.
- **Why not Option C (hybrid)?** Same universal-perturbation problem for the folded
  factors, plus added structural complexity, for benefit the data doesn't justify.
- **Why Option A?** It keeps the product math **byte-identical**, so **99.1% of vet
  projections are exactly unchanged**; only the ~14 currently-clamped players move —
  and they move to their *true, more reasonable* product (Drake London 1.30→1.328,
  Stevan Ridley 0.78→0.755). That is the cleanest possible realization of "no
  observable change in typical cases." It re-roles the clamp to the sanity-check it
  always should have been, and the new `combinedNewFactorRaw` diagnostic
  instruments the *real* (future) restructure decision.

**Option A is also the disciplined reading of "fix the architecture before adding
more":** widen so the next 3–5 queued factors aren't over-clamped, and instrument so
the additive-index restructure (the genuine Option B) is triggered by measured
realized spread rather than by theoretical-range anxiety.

---

## 3. Envelope choice — **`[0.67, 1.50]`**

```js
const combinedNewFactorRaw =
  qbQualityFactor * momentumFactor * breakoutFactor * bounceBackFactor
    * tdRelianceFactor * trajectoryFactor * efficiencyFactor
    * snapShareFactor * rzUsageFactor
const combinedNewFactor = clamp(combinedNewFactorRaw, 0.67, 1.50)
```

Rationale for the specific bounds:
- **Multiplicatively symmetric:** `1.50` and `1/1.50 ≈ 0.667`. The rail says "the
  aggregate of secondary signals may not move the projection more than +50% / −33%."
- **Beyond the realized distribution with headroom:** realized max 1.328 (≈1.39 with
  the qbQuality caveat), min 0.755 (≈0.72 with caveat). At `[0.67, 1.50]` the clamp
  fires on **0 of 1,504** current players — it is a true never-fire-in-practice rail,
  exactly its intended role.
- **Catches only arithmetic explosions:** bounds a pathological all-aligned stack
  (theoretical 1.685 today, growing as factors are added) to a plausible ±50%/−33%,
  preventing a runaway secondary-signal product from dominating the projection.

### Role of the envelope in the new design (documentation of intent)
A **sanity rail against arithmetic explosion**, *not* a moderator. Future batches
should **expect it not to fire** on real players, and should monitor
`combinedNewFactorRaw`'s realized p5/p95 (now captured) to decide when the deeper
additive-index restructure is warranted. The clamp's job is to bound the absurd, not
to shape the typical.

### Capture-only diagnostic — **add `combinedNewFactorRaw`** (+1 vet key → 62)
The pre-envelope product, rounded 3dp. Justification: it's the single number that
lets a backtest answer "is the envelope doing any work, and is the realized spread
approaching the rail as we add factors?" — i.e. it instruments the trigger for the
real restructure. One top-level key; vet 61→62, rookie unchanged at 42. Worth it.

---

## 4. Future-resilience analysis

Realized spread of a product of weakly-correlated near-1.0 factors grows like the
**std of the sum of log-deltas ≈ √n × σ_δ**, i.e. *slowly* — far slower than the
theoretical product bounds, which grow geometrically. Concretely, projecting the
queued signals (each ~±5–7%, mostly ≈1.0 per player):

| factors | theoretical max | est. realized p95 | est. realized max | fires at `[0.67,1.50]`? |
|---|---|---|---|---|
| 9 (today) | 1.685 | 1.135 | 1.328 | ~never (0/1504) |
| +aDOT (10) | ~1.80 | ~1.16 | ~1.39 | ~never |
| +RZ share (11) | ~1.93 | ~1.19 | ~1.43 | rare |
| +YAC (12) | ~2.06 | ~1.22 | ~1.47 | rare |
| +drops, +1st downs (14) | ~2.35 | ~1.27 | ~1.52 | occasional — **revisit** |

So `[0.67, 1.50]` comfortably absorbs the **entire current 5-signal queue** with the
rail rarely firing. The `combinedNewFactorRaw` diagnostic makes the revisit point
**measurable**: when realized p95 approaches ~1.40 (≈ factor #13–14), escalate to the
additive-index restructure (Option B, designed below) rather than widening again.

**Option B, designed for the future escalation (NOT implemented this batch):**
`combinedNewFactor = clamp(1 + (Σ(factor_i − 1)) × s, lo, hi)` with `s = 1.0`. To
first order this equals the product; it grows the center linearly and symmetrically,
and the scaling `s` (not the factor count) controls the effective range — so adding
factors no longer drifts the envelope. The cost (perturbs every value via dropped
cross-terms) is acceptable *once* and is the right move when the multiplicative tails
genuinely threaten the rail — but the data says that is several batches away.

---

## 5. Step sequence

1. `seasonProjection.js`: split the existing `clamp(...)` into `combinedNewFactorRaw`
   (the bare 9-factor product) and `combinedNewFactor = clamp(combinedNewFactorRaw,
   0.67, 1.50)`. The `rawPPG` line is unchanged (still multiplies by
   `combinedNewFactor`).
2. Add `combinedNewFactorRaw: Math.round(combinedNewFactorRaw * 1000) / 1000` to the
   vet `return.factors` block (next to `combinedNewFactor`). Rookie path untouched.
3. Update the in-code comment (lines 471–480): replace the now-false "binds for a
   meaningful tail / do not widen / shading toward per-signal cap" narrative with the
   sanity-rail intent + the realized-distribution facts + the
   `combinedNewFactorRaw`-monitoring escalation trigger.
4. Tests (§7).
5. Docs + CLAUDE.md (§6).
6. Done-definition: `npm test` green (esp. `factorsSchema`, `seasonProjection`),
   `npm run build` clean.

No changes outside `combinedNewFactor` assembly + its recording. Every other line of
`seasonProjection.js` and all out-of-scope modules untouched.

---

## 6. Docs updates

**`docs/projection.md` (line 31) — rewrite the paragraph.** New content must:
- Update the formula's clamp to `0.67, 1.50` and add `combinedNewFactorRaw` (the
  pre-envelope product) as a recorded diagnostic.
- State the **realized** distribution (mean ≈0.96; p5–p95 ≈ 0.82–1.135; max observed
  1.328) and that the envelope is a **sanity rail that fires ~0% on real players**,
  not a moderator.
- Replace the false "binds for a meaningful tail / deliberate ceiling / add inside
  rather than widening" lines with: the rail bounds pathological stacks to +50%/−33%;
  future batches should watch `combinedNewFactorRaw`'s realized p95 and escalate to a
  normalized additive index when it approaches the rail (≈ factor #13–14), rather
  than widening further.

**`README.md` (root):** no change (thin entry point).

**`CLAUDE.md`:**
- Line 97 (Factors contract invariant): **61 → 62** vet keys (rookie stays 42).
- Navigation map: no change (`seasonProjection.js` responsibility unchanged).
- Self-maintenance §: the count bump above satisfies "altered the factors contract."

---

## 7. Tests to add / update

**`src/utils/seasonProjection.test.js`:**
1. **Typical-case regression (exact-equality pins), 6 cases** — RB, WR, TE, QB across
   age/production profiles, each with a product comfortably inside `[0.78, 1.30]`
   (i.e. unaffected by either old or new bound). Assert `factors.combinedNewFactor`
   equals the existing pre-change value **exactly** (Option A leaves the product math
   identical, so these are byte-identical pins) and that `combinedNewFactor ===
   combinedNewFactorRaw` for these (no clamp). Use unique `playerId`s
   (compsCache/cohortCache isolation).
2. **Extreme high (was clamped up):** reuse `clampHiCareerStats` + `breakoutCurves`
   (the fixtures built for the old upper-clamp test). Previously pinned
   `combinedNewFactor === 1.30`; **update** to assert it now equals the true product
   (`combinedNewFactorRaw`, > 1.30 and ≤ 1.50, unclamped).
3. **Extreme low (was clamped down):** reuse `clampLoCareerStats`. Assert
   `combinedNewFactor === combinedNewFactorRaw`, < 0.78 and ≥ 0.67 (unclamped).
4. **Envelope bound (intent pin):** a hand-built factor set whose product exceeds
   1.50 → `combinedNewFactor === 1.50` and `combinedNewFactorRaw > 1.50`; and one
   below 0.67 → `combinedNewFactor === 0.67` with `combinedNewFactorRaw < 0.67`.
   (Construct via `makeVet` overrides that drive the signals to their stacked
   extremes; documents that the rail still exists and where it sits.)

**`src/__tests__/factorsSchema.test.js`:**
- Add `combinedNewFactorRaw` to `VET_FACTORS_KEYS`; bump the documented count
  **61 → 62** (comments lines 17–19, 38; assertion text line 171). Rookie set
  untouched.
- Update the value-range assertion (lines ~197–199): `combinedNewFactor ∈
  [0.78, 1.30]` → **`[0.67, 1.50]`**. Add a check that `combinedNewFactorRaw` is a
  positive number and that `combinedNewFactor === clamp(combinedNewFactorRaw,
  0.67, 1.50)`.

**`statKeysContract.test.js`:** no change (no new stat keys read).

---

## 8. Cross-repo impact

Adding `combinedNewFactorRaw` to the vet `factors` changes the **projection-snapshot
shape**: `projectionSnapshot.js` writes verbatim `computeNextSeasonProjection` output,
and `exportData.js` routes it to `snapshots/<date>.json` consumed by
`sleeper-dashboard-data`'s `bin/update.mjs snapshots`. The new key is **additive and
backward-compatible** (the importer stores the `projection` blob verbatim; no schema
field is removed or renamed). Per the CLAUDE.md cross-repo contract ("changing the
`factors` object … changes the exported snapshot"), **flag in the task summary** that
`projection.factors` gains `combinedNewFactorRaw` so the data repo is aware — but no
data-repo change is required, and this repo cannot edit it.

Also worth noting (no action): existing IndexedDB projection snapshots were captured
under the old `[0.78, 1.30]` clamp; pre/post backtests must account for the envelope
change for the ≤~3% of players who were clamped. Documentation-only.

---

## 9. Open questions

1. **The premise is empirically false — confirm direction.** Data shows the clamp
   fires ~1% today, not "a meaningful tail." Plan recommends **Option A** (widen to a
   `[0.67,1.50]` sanity rail + capture `combinedNewFactorRaw`, defer the additive
   restructure until the diagnostic shows it's needed). Acceptable, or do you want the
   principled **Option B** additive-index conversion *now* despite it perturbing 100%
   of projections to address a ~1%-incidence issue?
2. **Envelope bounds `[0.67, 1.50]`** — accept the multiplicatively-symmetric ±50%/−33%
   rail, or prefer tighter (e.g. `[0.70, 1.43]`, closer to realized extremes) or wider
   (`[0.60, 1.67]`, more future runway)?
3. **`combinedNewFactorRaw` diagnostic** — add (+1 vet key → 62, recommended for
   instrumentation), or keep the count at 61 and forgo the monitoring hook?
4. **qbQuality caveat** — the measured distribution forced `qbQualityFactor = 1.0`
   (not reproducible outside App.jsx). The conclusion is robust to this (±5% on
   non-QBs, hit-rate stays low single digits). Accept, or do you want a fuller run
   that reconstructs `computeQBQualityByTeam` before finalizing the bounds?
```
