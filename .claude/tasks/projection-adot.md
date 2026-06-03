# Task: Projection — aDOT (Average Depth of Target)

Incorporate aDOT, derived from existing Sleeper stat keys (`rec_air_yd` / `rec_tgt`
for receivers, `pass_air_yd` / `pass_att` for QBs), into the veteran projection.
The central design question — aDOT is a **role indicator, not a value indicator** —
is resolved empirically below.

---

## TL;DR recommendation

**Option A — capture-only, lean.** Record three diagnostics in `factors`
(`adot`, `adotDelta`, `adotSampleSize`), position-aware, on both vet and rookie
paths (null on rookie). **No multiplier, no `combinedNewFactor` change, no new
helper module, no envelope impact.** The data does not support an active monotonic
factor; capturing now (with full 2012–2025 coverage) builds the backtest dataset to
justify a future active variant (role-change trajectory, Option C; or variance
modulator, Option B). Vet keys 62→65, rookie 42→45.

---

## 1. Verification findings (real data: data-repo season-totals 2012–2025 + players map)

### Field coverage — **100%, back to 2012** (no drop-off)
`rec_air_yd` present for **every** qualifying receiver (`rec_tgt ≥ 50`) and
`pass_air_yd` for **every** qualifying QB (`pass_att ≥ 50`) in all seasons
2012–2025 (e.g. 2012: 151/151 receivers; 2025: 122/122; QBs 56/56). The brief's
feared pre-2018 drop-off does **not** exist. Graceful neutral fallback still
specified for safety, but coverage is a non-issue.

### Aggregation — **correct (C4 trap avoided)**
`rec_air_yd` is a per-week **sum** of air yards; dividing the summed value by summed
`rec_tgt` yields a sane season-level rate. Verified: Travis Kelce 4.0, CeeDee Lamb
6.4, McCaffrey 1.6, Gainwell −0.5 (negative = behind-LOS usage). No per-week-average
mis-aggregation (the `pass_rtg` failure mode). **Unlike C4, this field aggregates
correctly and is usable.**

### Calibration caveat — Sleeper `rec_air_yd` ≈ **half** published aDOT
Computed values run ~half of public aDOT figures (Jefferson 4.2, Chase 4.2, CeeDee
6.4 vs published ~8–11). This strongly suggests `rec_air_yd` counts air yards on a
**subset** (most likely receptions, not all targets), so `rec_air_yd / rec_tgt` is
**not** literally published aDOT. **The ranking is still valid** (RBs/checkdown <
possession < intermediate < deep), which is all a role-indicator needs — but the
field must be documented as "Sleeper air-yards-per-target," not "aDOT," to avoid a
false calibration claim.

### Per-position distribution (2019–2025, qualifying)
| cohort | p10 | p25 | med | p75 | p90 | max |
|---|---|---|---|---|---|---|
| WR (n=583) | 3.6 | 4.4 | **5.5** | 6.3 | 7.0 | 10.2 |
| TE (n=195) | 2.9 | 3.4 | **4.0** | 4.8 | 5.6 | 7.0 |
| RB (n=140) | −1.3 | −0.8 | **−0.3** | 0.3 | 0.7 | 2.5 |
| QB (n=255) | 3.0 | — | **3.7** | — | 4.6 | 5.7 |

RB receiving aDOT clusters near/below zero (behind-LOS) — near-zero information as a
spectrum. QB aDOT is highly compressed (3.0–4.6 p10–p90) — low information, mirroring
the QB-snap-share situation in D2.

### Non-monotonicity — **the headline check, confirmed**
WR aDOT vs next-season-irrelevant same-season PPG, pooled 2019–2025 (n=583):
- **Pearson corr = 0.289** — weak, positive, confounded (not flat, not a clean
  gradient).
- Bucket-median PPG: [3,4)→6.6, [4,5)→9.1, [5,6)→9.1, [6,7)→9.9, **[7,9)→11.6**,
  **[9,20)→9.1** — rises through the intermediate band then **falls** at the deep
  extreme (small n=5). `%elite (≥15 PPG)`: 2→3→6→**11**→9→**0**.
- **Elite WRs (PPG ≥ 17, n=17) span aDOT 4.0–7.8 (median 5.7)** — elite production
  occurs across a *band*, with low-aDOT elites (slot, 4.0) and higher-aDOT elites
  (7.8) both present, and **no** elite at the extremes.

**Interpretation:** aDOT is a role indicator whose weak positive correlation with
value is driven by role/volume confounds (a featured downfield WR has both high aDOT
and high volume) — not a causal value gradient. The "elite slot vs elite deep"
objection holds. Its marginal predictive content for *next-season* PPG, over what
`basePPG`, `efficiencyFactor` (YPR/YPT/catch-rate), and the usage factors already
encode, is approximately nil. **An active monotonic multiplier is indefensible and
would double-count volume/role.**

---

## 2. Design choice — **Option A (capture-only), lean**

| Option | Verdict |
|---|---|
| **A — Capture-only** | ✅ **Chosen.** Matches the data (role indicator, weak/confounded, redundant with existing signals). Zero non-monotonicity risk. Mirrors the `ktcHist*` / `positionMultiplicity*` capture-only precedent. Builds the backtest dataset (full 2012–2025) to justify a future active variant. |
| B — Variance modulator | Conceptually the most principled *eventual* use (high aDOT → higher outcome variance → widen comp-blend uncertainty), **but** requires modifying `compsIntegration.js` (**out of scope — forbidden this batch**) and the pipeline emits a point estimate, not a distribution. Deferred; the captured `adot` enables it later. |
| C — aDOT-change trajectory | The within-player YoY aDOT change *is* a monotonic-ish role-change signal and the **most likely future activation path** — but we have **no** evidence yet that aDOT-*change* predicts PPG-*change*, and activating on a hunch repeats the mistake the clamp-restructure batch warned against. Capture `adotDelta` now to make that activation trigger measurable. |
| D — Standalone curve | ✅❌ Rejected. corr 0.289 + elite band 4.0–7.8 + tail drop-off ⇒ curve-fitting would overfit and any monotonic mapping mis-penalizes elite slot or elite deep receivers. The brief's own prior leans away. |

**What capture-only does NOT capture (honest limitations):** it does not improve the
central PPG estimate today; it assumes (pending backtest) that aDOT's signal is
either redundant or better expressed as a future variance/role-change mechanic. It
records a Sleeper-specific air-yards-per-target rate, not true published aDOT.

**Hybrid framing:** Option A is the decision; `adotDelta` (the Option-C diagnostic)
is captured alongside so the future active trigger is directly testable from
snapshots. No percentile/cohort is computed now (see §4) — that infra is deferred to
the activation batch, and is reconstructable from the snapshot cross-section anyway.

---

## 3. Per-decision spec

### Signal definitions (most-recent qualifying season; mirror efficiency's `lastSeasonRaw.stats`)
- Receivers (WR/TE/RB): `adot = rec_air_yd / rec_tgt`.
- QB: `adot = pass_air_yd / pass_att`.
- `adotDelta = adot(mostRecentQ) − adot(secondMostRecentQ)`; null if fewer than 2
  qualifying seasons have the air-yards field.
- `adotSampleSize = rec_tgt` (or `pass_att` for QB) of the most-recent qualifying
  season — makes the captured `adot` interpretable and shrinkable in backtests
  (the snapshot stores factors, not raw stats, so sample must be recorded here).

### Position scope — **all four skill positions, position-aware, capture-only**
WR/TE/RB use receiving air-yards; QB uses passing air-yards. RB aDOT is low-info
(near-zero) and QB aDOT is compressed, but capture-only means no harm and possible
future value (pass-catching-RB / aggressive-QB diagnostics). Uniform capture, no
gating, no special-casing. (Active gating decisions are deferred to the activation
batch.)

### Pipeline location
**None.** Capture-only → recorded in the `factors` object only; does **not** enter
`combinedNewFactor`, `rawPPG`, or any multiplier. Envelope `[0.67, 1.50]` and the
9-factor stack are untouched; `combinedNewFactorRaw` is unaffected.

### Cohort / shrinkage / multiplier shape
**Not applicable** (capture-only, lean). No cohort table, no percentile, no
shrinkage, no new helper module — recording is inline in `seasonProjection.js`. (The
constraint explicitly allows this: "If the design captures raw fields without
computing percentiles, no new helper module needed.") A future active variant would
add `src/utils/aDotMetrics.js` following the C1/D2 cohort-percentile-with-shrinkage
pattern; deferred.

---

## 4. Cross-batch interaction analysis

Because aDOT is capture-only, **there are no live interactions** — it cannot
double-count or compose with anything. Documenting for the future-activation batch:

- **Efficiency (`efficiencyMetrics.js`) catch-rate / YPR / YPT sub-scores:** the
  primary double-count risk. A deep-aDOT receiver structurally has lower catch rate
  but higher YPR — **both already in the efficiency composite.** A future active aDOT
  factor must not re-reward/re-penalize what efficiency captures; the cleanest future
  mechanic is therefore *aDOT-change* (role shift, Option C) or *variance*
  (Option B), neither of which overlaps efficiency's level metrics. Recording
  `adotDelta` now sets that up.
- **Usage (`usageMetrics.js`) snap share / RZ:** orthogonal (field time / scoring
  role vs target depth). No overlap even if activated.
- **Comp blend (`compsIntegration.js`):** no interaction now; the Option-B variance
  idea would touch it (out of scope this batch).

---

## 5. Step sequence

1. `seasonProjection.js` (vet path): after the existing multiplicity block (which
   already locates `lastSeasonRaw` and the qualifying-season list), compute inline:
   `adot` from the most-recent qualifying season's stats (position-aware),
   `adotDelta` (vs the second-most-recent qualifying season), `adotSampleSize`. All
   null-guarded (missing field or zero denominator → null).
2. Add `adot`, `adotDelta`, `adotSampleSize` to the vet `return.factors` block
   (rounded: adot/adotDelta 3dp; sampleSize integer).
3. Rookie path: add the same three keys as `null` sentinels (matches the
   `positionMultiplicity*` capture-only precedent of appearing on both paths).
4. Tests (§7).
5. Docs + CLAUDE.md (§6).
6. Done-definition: `npm test` green (esp. `factorsSchema`, `statKeysContract`,
   `seasonProjection`); `npm run build` clean.

No new module. No changes outside the `factors` recording. All listed out-of-scope
modules untouched.

---

## 6. Docs updates

**`docs/projection.md` (primary):** add an "aDOT (capture-only)" subsection next to
the existing "Historical KTC factors (capture-only)" and "Position multiplicity
factors (capture-only)" sections. Document: the three keys; position-aware
definition; that it is **diagnostic only — does not move `projectedPPG`** and adds no
`adjustmentSummary` lines; the **calibration caveat** (Sleeper `rec_air_yd` is
air-yards-per-target ≈ half published aDOT, ranking-valid not value-calibrated); and
the deferred-activation rationale (role indicator, weak/confounded corr 0.289, elite
band 4.0–7.8). Note keys appear on both paths (null on rookie).

**`README.md` (root):** no change.

**`CLAUDE.md` line 97 (Factors contract):** **62 → 65 vet**, **42 → 45 rookie**.
Navigation map: no change (no new module; `seasonProjection.js` responsibility
unchanged).

---

## 7. Tests to add / update

**`src/utils/seasonProjection.test.js`** (integration, `makeVet`, unique `playerId`s):
- WR with `rec_air_yd`/`rec_tgt` across 2 qualifying seasons → assert
  `factors.adot` = rec_air_yd/rec_tgt of the latest season (3dp), `adotDelta` =
  latest − prior, `adotSampleSize` = latest `rec_tgt`.
- QB with `pass_air_yd`/`pass_att` → `adot` computed from passing.
- RB → `adot` from receiving (low/negative ok).
- Missing `rec_air_yd` → `adot`, `adotDelta`, `adotSampleSize` all null.
- Single qualifying season → `adotDelta` null, `adot` still computed.
- **Regression guard:** a vet fixture without air-yards fields produces a
  `projectedPPG` byte-identical to pre-change (capture-only must not move the
  estimate).

**`src/__tests__/factorsSchema.test.js`:** add `adot`, `adotDelta`, `adotSampleSize`
to **both** `VET_FACTORS_KEYS` (→65) and `ROOKIE_FACTORS_KEYS` (→45); update counts
and comments; rookie value test asserts the three are null.

**`src/__tests__/statKeysContract.test.js`:** add `rec_air_yd` and `pass_air_yd`
(both present in fixture for many rows → passes). Do not add derived names.

**No helper-module unit test** (no helper module created).

---

## 8. Edge cases

- Missing `rec_air_yd`/`pass_air_yd` (any gap; none found 2012–2025 but be safe) →
  `adot`/`adotDelta`/`adotSampleSize` null.
- Zero denominator (`rec_tgt`/`pass_att` = 0) → null (division guard).
- `< 2` qualifying seasons with the field → `adotDelta` null.
- Position-other passers (RB/WR trick-play throws): `adot` for non-QB is always
  receiving; QB `adot` is always passing — position-keyed, so no contamination.
- RB near-zero/negative aDOT is recorded as-is (valid behind-LOS signal; capture-only
  so noise is harmless).

---

## 9. Cross-repo impact

`rec_air_yd` and `pass_air_yd` become consumed by projection — same pattern as the
D2 snap/RZ and C4 `pass_cmp` dependencies. **Flag (do not write this batch):** a
one-line addition to `sleeper-dashboard-data`'s CLAUDE.md noting the new field
dependency in `nfl/season-totals/*.json`. Both fields already flow through the
generic sum-all-keys aggregation and are present 2012–2025, so **no data-repo change
is required**; missing fields degrade to null capture.

Snapshot shape: `projection.factors` gains `adot`/`adotDelta`/`adotSampleSize`
(additive, backward-compatible; the importer stores the blob verbatim). Note for the
data repo's snapshot importer; no action needed.

---

## 10. Open questions

1. **Active vs capture-only (the design call).** Plan recommends **capture-only
   (Option A)** on the evidence (role indicator; weak confounded corr 0.289; elite
   band 4.0–7.8; redundant with existing signals; non-monotonicity risk). Confirm —
   or do you want an active variant now despite the data (Option C aDOT-change is the
   only defensible active mechanic, and even it lacks supporting backtest evidence
   yet)?
2. **Three keys vs two.** Plan includes `adotSampleSize` (so captured aDOT is
   interpretable/shrinkable in backtests, since snapshots don't store raw stats).
   Keep it, or drop to just `adot` + `adotDelta` (vet→64 / rookie→44)?
3. **RB / QB capture.** Plan captures all four positions uniformly (capture-only, no
   harm). Prefer to null-out RB (near-zero receiving aDOT) and/or QB (compressed) to
   keep the diagnostic focused on WR/TE? Default: capture all four.
4. **Calibration labeling.** Plan documents the field as "Sleeper air-yards-per-
   target (≈ half published aDOT)" rather than "aDOT." Confirm that naming, or prefer
   to keep the `adot` key name with a doc caveat only (current plan: `adot` key,
   caveat in docs).
