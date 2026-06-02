# Task: Projection C4 — QB Efficiency via Passer Rating

Refine the **QB-only** efficiency composite in `src/utils/efficiencyMetrics.js`
(C1, Step 5e) to use the canonical NFL passer rating instead of three
hand-weighted percentile inputs (YPA / TD% / INT%). Internal refinement to an
existing factor — no new `factors` multipliers, no `combinedNewFactor` change, no
new args, rookie/RB/WR/TE paths untouched.

---

## ⚠️ Critical verification finding — `pass_rtg` is NOT usable raw

The brief's premise ("Sleeper provides `pass_rtg` directly, so just use it") **does
not hold against the data.** `sleeperStats.js` aggregates a season by summing
**every** weekly stat key (`totals[...].stats[key] = (… ?? 0) + val`). Sleeper's
`pass_rtg` is a **per-week** passer rating, so the stored season value is a **sum
of weekly ratings**, not a season rating:

- 2025 fixture, QBs with `pass_att ≥ 50` (n=56): `pass_rtg` median **813.2**,
  max **1952.8** — impossible for a 158.3-capped metric. Player 11564 = 1952.8 /
  17 gp ≈ 114.9 avg weekly rating. `cmp_pct` is likewise a weekly sum (1245 / 17 ≈
  73%).

Using the stored sum directly would conflate **rate with volume** (games played) —
double-counting durability (already handled by `durabilityFactor`) and corrupting
the per-opportunity intent of the efficiency factor.

**Two correct alternatives** (both verified against the fixture):

| Approach | What | Result |
|---|---|---|
| **A1 — compute canonical rating from season totals** | Standard NFL formula from summed `pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int` (all present, all correct sums) | clean season ratings: min 48.8, p10 68.1, **med 88.1**, p90 101.2, max 113.5 |
| **A2 — mean weekly rating** | stored `pass_rtg / gamesPlayed` | noisy for low-sample QBs; **diverges** from A1 (mean abs rank diff 6.1, max 33 over 56 QBs — e.g. player 7083: A1=103.1 on 67 att/5 gp vs A2=78.6) |

A1 is materially more correct (attempt-weighted, not week-averaged) and needs no
new stored field beyond `pass_cmp` (present for all 56 QBs). **Recommend A1.**
`pass_cmp` is the only new stat-key dependency.

This also **dissolves the "top compression" risk**: at season scale no QB reaches
the 158.3 cap (max in fixture = 113.5; only 2 of 56 within 5 pts of the max; 0
capped). Cohort-percentile normalization is appropriate and well-spread.

---

## 1. Verification findings (current source)

### `src/utils/efficiencyMetrics.js`
- **QB composite (current):** 3 metrics — `ypa` (w 0.55), `passTdRate` (w 0.20),
  `intRate` (w 0.25, `invert:true`); all `oppKey:'pass_att'`, `shrinkK:80`.
- **Cohort** built from `refSeason = max(careerStats seasons)`; QB pool gated by
  `playersMap[pid].position === 'QB'` **and** `pass_att ≥ MIN_COHORT_OPPS.pass_att
  = 50`. → **Cohort is correctly QB-only** (trick-play passers excluded).
- **Own-metric path** uses `POSITION_METRICS[position]`, so a WR who threw a pass
  uses the WR config — QB pass metrics never apply to non-QBs. Confirmed safe.
- **Aggregation:** `efficiencyIndex = Σ (weight/wSum)·sub`, `sub = (shrunkPct−50)/50
  ∈ [−1,1]`, `shrunkPct = (opps·pct + shrinkK·50)/(opps + shrinkK)`.
- **Multiplier:** `efficiencyFactor = clamp(1 + efficiencyIndex × 0.10, 0.90, 1.10)`.
- **Return:** `{ efficiencyFactor, efficiencyIndex, efficiencyMetrics }`;
  `efficiencyMetrics` is a **sub-object** `{ [metricName]: rawValue|null }`.
- **Cohort cache** keyed by `careerStats` identity (rebuilds once per session).

### `src/utils/seasonProjection.js`
- Call site (≈ line 391): `const { efficiencyFactor, efficiencyIndex,
  efficiencyMetrics } = computeEfficiencyFactor(position, lastSeasonRaw.stats,
  careerStats, playersMap)`.
- Records `efficiencyMetrics` **wholesale** into `factors` (≈ line 560–562). It
  passes the sub-object straight through. → **No `seasonProjection.js` change
  needed** even though the QB sub-object's inner keys change. (Constraint satisfied:
  edit only "if recording shape changes" — it doesn't; the recording is generic.)

### Contract tests
- `factorsSchema.test.js`: pins the **top-level** 61 vet / 42 rookie key sets and
  value types. `efficiencyMetrics` is one top-level key; it does **not** assert the
  sub-object's inner keys. → **top-level count stays 61; no count change.**
- `statKeysContract.test.js`: `EFFICIENCY_KEYS` already includes `pass_att`,
  `pass_yd`, `pass_td`, `pass_int`. **`pass_cmp` is missing → must be added.**
  `pass_rtg`/`cmp_pct` are **not** consumed → do **not** add them.

### Fixture (`season-totals-2025.json`)
- `pass_cmp` present for **56/56** QB rows (`pass_att ≥ 50`). `pass_rtg`, `cmp_pct`
  also present but are weekly sums (unused). Canonical rating computable for all.
- Many extra passing keys exist (`pass_air_yd`, `pass_sack`, `pass_ypa`, …) — all
  weekly-derived; none used here.

### Distribution (canonical season rating, computed from totals, QB `pass_att ≥ 50`)
`n=56 · min 48.8 · p10 68.1 · p25 80.2 · med 88.1 · p75 94.8 · p90 101.2 · max
113.5`. No cap clustering. Good spread for percentile normalization.

### `docs/projection.md`
- Step table row **5e** (line 22) and the **5e paragraph** (line 33) describe the
  QB inputs as "YPA / TD% / INT%". Both need editing. No other docs reference the
  QB efficiency composite (the `docs/integrations.md` YPA/PCT hits are CFBD
  *college* stats — unrelated).

---

## 2. Composition choice — **Option A (Replace)**, implemented as A1

QB efficiency = **canonical passer-rating percentile only**. Drop `ypa`,
`passTdRate`, `intRate` as separate inputs.

**Rationale (data-grounded):**
- Passer rating already combines completion %, YPA, TD%, and INT% — the exact three
  current inputs **plus** completion % (new signal) — into the canonical league
  metric. Replacing is a strict consolidation, not a loss.
- One metric removes three hand-chosen weights (0.55/0.20/0.25) and the
  formula-derivation drift they represent.
- Clean, well-spread cohort distribution (§1); no top compression at season scale.
- **Option B (blend)** rejected: `pass_rtg` already contains YPA/TD%/INT%, so
  blending with the old composite double-counts and adds an arbitrary α.
- **Option C (all four separate)** rejected: worst double-counting, most arbitrary
  weighting.

Note the implementation computes the rating from season totals (A1), not the
broken stored `pass_rtg` (see ⚠️ above).

---

## 3. Per-decision spec

### Canonical passer-rating helper (private to `efficiencyMetrics.js`)
```js
// Standard NFL passer rating from season-total components. null if no attempts.
function passerRating(s) {
  const att = s.pass_att ?? 0
  const cmp = s.pass_cmp
  if (att <= 0 || cmp == null) return null
  const yd = s.pass_yd ?? 0, td = s.pass_td ?? 0, intc = s.pass_int ?? 0
  const cl = x => Math.max(0, Math.min(2.375, x))   // each component clamped [0, 2.375]
  const a = cl(((cmp / att) - 0.3) * 5)
  const b = cl(((yd  / att) - 3)   * 0.25)
  const c = cl((td  / att) * 20)
  const d = cl(2.375 - (intc / att) * 25)
  return ((a + b + c + d) / 6) * 100            // 0 – 158.3
}
```

### QB metric config (replaces the 3-entry QB array)
```js
QB: [
  { name: 'passerRating', weight: 1.0, oppKey: 'pass_att', shrinkK: 80,
    invert: false, ratio: passerRating },
],
```
- Single metric, `weight 1.0` → `efficiencyIndex = sub` directly.
- `oppKey:'pass_att'`, `shrinkK:80`, **unchanged** from the current QB shrink.
- `invert:false` (higher rating is better).

### Cohort gating / pool
- `buildCohortTable` QB branch: change the static init `QB: { ypa: [],
  passTdRate: [], intRate: [] }` → `QB: { passerRating: [] }`, and inside the
  `pos === 'QB'` block (still gated `pass_att ≥ 50`) push `passerRating(s)` —
  guard `null` (skip the push if the rating is null, i.e. missing `pass_cmp`).
- **Cohort stays QB-only** (existing `pos === 'QB'` gate) — trick-play passers and
  RB/WR throwers never enter the QB pool. Unchanged.

### Sample-size gate
- Keep `MIN_COHORT_OPPS.pass_att = 50` (verified: canonical rating is stable at
  50+ attempts; the fixture's QB cohort is exactly this set).
- Own-value path still computed for any QB with `pass_att > 0`; low-sample QBs are
  pulled toward neutral by `shrinkK=80` (e.g. a 50-att QB at the 90th pct →
  shrunkPct ≈ 65 → factor ≈ 1.03).

### Multiplier mechanics — **unchanged envelope**
- `efficiencyFactor = clamp(1 + efficiencyIndex × 0.10, 0.90, 1.10)`. Single metric
  ⇒ `efficiencyIndex ∈ [−1,1]` ⇒ factor ∈ [0.90, 1.10]. **±10% preserved.**

### Cohort-cache invalidation
- Still keyed by `careerStats` identity — no change. Only the pool **contents**
  change (`passerRating` instead of the 3 metrics); the cache key/mechanism is
  untouched. Static pool-init object must be updated as above so the new pool array
  exists.

---

## 4. `factors.efficiencyMetrics` shape decision

QB sub-object changes from `{ ypa, passTdRate, intRate }` to:
```js
{ passerRating: <computed, 1dp>, completionPct: <pass_cmp/pass_att, 3dp> }
```
- `passerRating` — the computed season rating; **feeds** the calc (the one config
  metric).
- `completionPct` — **capture-only** (recorded, not weighted). Use the *computed*
  true rate `pass_cmp / pass_att`, **not** the stored weekly-summed `cmp_pct`
  (which is misleading). Useful later for a CPOE-style signal. Recorded as `null`
  when `pass_att = 0`.

Implementation note: the config loop only records `rawMetrics[m.name]` for config
metrics. To record `completionPct` (not a config metric), add it explicitly to the
QB branch after the loop, e.g. `if (position === 'QB' && lastSeasonStats?.pass_att)
rawMetrics.completionPct = round(pass_cmp/pass_att, 3)`. Keep it out of `available`
so it never affects `efficiencyIndex`.

RB/WR/TE `efficiencyMetrics` sub-objects are **unchanged**.

**Top-level `factors` keys unchanged → no `factorsSchema` count change.** Optionally
pin the QB inner shape with a focused assertion (see Tests).

---

## 5. Step sequence

1. `efficiencyMetrics.js`: add private `passerRating(s)` helper.
2. Replace the QB `POSITION_METRICS.QB` array with the single `passerRating` entry.
3. Update `buildCohortTable`: QB pool init `{ passerRating: [] }`; push
   `passerRating(s)` (null-guarded) inside the `pass_att ≥ 50` QB block.
4. Add the `completionPct` capture-only recording in the QB branch of
   `computeEfficiencyFactor`.
5. `statKeysContract.test.js`: add `pass_cmp` to `EFFICIENCY_KEYS`.
6. Update `efficiencyMetrics.test.js` QB tests (existing fixtures lack `pass_cmp`
   — must add it and recompute expectations) + add new passer-rating cases.
7. Add a QB integration case to `seasonProjection.test.js`.
8. `docs/projection.md`: edit the 5e row + paragraph (§Docs).
9. Done-definition: `npm test` green (esp. `efficiencyMetrics`, `factorsSchema`,
   `statKeysContract`, `seasonProjection`); `npm run build` clean.

No changes to `seasonProjection.js`, `factorsSchema.test.js` key sets, or any
out-of-scope module.

---

## 6. Edge cases

- **Weekly-sum trap (the headline):** never read stored `pass_rtg`/`cmp_pct`;
  compute from totals. Documented in code comment so a future reader doesn't
  "simplify" back to the stored field.
- **Top compression:** non-issue at season scale (max 113.5; no cap clustering).
- **Low-sample QB:** `shrinkK=80` pulls toward neutral; `MIN 50` keeps the cohort
  reference clean.
- **Missing `pass_cmp` (older seasons / data-store files):** `passerRating` →
  `null` → QB metric skipped → `available` empty → `NEUTRAL` (factor 1.0), exactly
  like a QB with no passing data today. Cohort pool simply omits null-rating QBs.
  Graceful, no errors. (Live cohort uses the most-recent season, which has the field.)
- **Position-other passers (RB/WR trick plays):** excluded from QB cohort
  (`pos === 'QB'` gate) and never scored as QBs (position-based config). Verified —
  38 non-QB rows carry `pass_rtg` in the fixture and are correctly ignored.
- **`pass_att = 0`:** existing `opps <= 0` guard skips the metric → neutral;
  `completionPct` recorded `null`.

---

## 7. Docs updates

**`docs/projection.md` — two edits (only file needing changes):**

- **Row 5e (line 22)** — change the QB portion:
  - before: "…percentiles of YPC / YPA / YPT / YPR / catch rate / TD rates (and INT% inverted)…"
  - after: "…percentiles of YPC (RB), YPT / YPR / catch rate / TD rates (WR/TE), and **passer rating (QB)**…"
- **5e paragraph (line 33)** — change the QB clause:
  - before: "…YPA / TD% / INT% (QB) — ranks each as a percentile…"
  - after: "…**and the canonical passer rating computed from season-total
    pass_cmp/att/yd/td/int (QB)** — ranks each as a percentile…"
  - Add one sentence: "QB passer rating is computed from season totals, **not** the
    stored per-week `pass_rtg` (which Sleeper reports weekly and the loader sums);
    `completionPct` is recorded in `factors.efficiencyMetrics` for backtesting but
    does not feed the factor."

**`README.md` (root):** no change (thin entry point; deep behaviour lives in docs).

**`CLAUDE.md` self-maintenance:** **no change.** Factors-contract counts unchanged
(61 vet / 42 rookie — `efficiencyMetrics` is a sub-object). Navigation-map entry for
`efficiencyMetrics.js` ("per-opportunity efficiency composite") still accurate. No
invariant or command affected.

---

## 8. Tests to add / update

**`src/utils/efficiencyMetrics.test.js` (update existing + add):**
- **UPDATE required:** `makeQBCareerStats()` cohort QBs currently lack `pass_cmp`.
  After the switch they'd produce `null` ratings and drop out of the cohort. Add a
  realistic `pass_cmp` to each cohort QB (e.g. completion % ≈ 60–70% of `pass_att`)
  and to each `lastSeasonStats` in the QB tests; recompute expected
  factor directions. The existing intent survives: poor QB → factor < 1.0; elite
  QB → factor > 1.05; median QB → ≈ 1.0.
- **New cases:**
  - High passer rating (high cmp%, ypa, td, low int) → `efficiencyFactor > 1.05`,
    `efficiencyMetrics.passerRating` high.
  - Low passer rating → factor < 0.95.
  - Missing `pass_cmp` (rating null) with `pass_att > 0` → `NEUTRAL`
    (`efficiencyFactor === 1.0`, `efficiencyIndex === null`).
  - Low-sample QB (`pass_att = 55`, elite rate) → shrunk toward neutral
    (factor noticeably < the same rates at 500 att).
  - `efficiencyMetrics` inner-shape pin: QB sub-object has exactly
    `{ passerRating, completionPct }`; both numeric (or `completionPct` null when
    `pass_att = 0`).
- **Regression:** an RB/WR case unchanged (confirm non-QB composites untouched).

**`src/utils/seasonProjection.test.js` (integration, `makeVet`):**
- One QB shell (`player.position:'QB'`, unique `playerId`, a QB cohort in
  `careerStats` so the pool is non-trivial) computed twice — great `pass_*`
  (high cmp/yd/td, low int) vs poor `pass_*` — asserting the great line yields a
  **meaningfully higher** `factors.efficiencyFactor` and higher `projectedPPG`.
  (Mirror the existing `makeQBCareerStats` cohort approach so percentiles aren't
  degenerate with a single QB.)

**`src/__tests__/factorsSchema.test.js`:** no key-set/count change (top-level
unchanged). Optional: add a targeted assertion that QB `factors.efficiencyMetrics`
contains `passerRating` (keeps the sub-object honest); not strictly required.

**`src/__tests__/statKeysContract.test.js`:** add `pass_cmp` to `EFFICIENCY_KEYS`
(present in fixture → passes). Do **not** add `pass_rtg`/`cmp_pct`.

---

## 9. Cross-repo impact

Minimal but non-empty. Projection now reads **`pass_cmp`** (new dependency) for the
QB passer-rating computation. As with D2's snap/RZ fields, `pass_cmp` flows through
the generic stat-summing aggregation and is already produced for the live and
fixture paths; `sleeper-dashboard-data`'s `lib/sleeper.mjs` mirrors the same
sum-all-keys behaviour, so generated season-totals files should already carry it.

**Action:** in the task summary, note for `sleeper-dashboard-data` that the app's
projection now depends on `pass_cmp` in `nfl/season-totals/*.json` (one-line
addition alongside the D2 snap/RZ note), and explicitly that the app does **not**
consume the stored `pass_rtg`/`cmp_pct` (weekly sums). No data-repo schema change is
required; missing `pass_cmp` degrades gracefully to a neutral QB efficiency factor.
This repo cannot edit the data repo — flag only.

---

## 10. Open questions

1. **A1 vs A2 (the real choice).** Plan commits to **A1** (canonical rating from
   season totals; needs `pass_cmp`). A2 (`pass_rtg/gp`) uses the stored field with
   no formula but is noisier and attempt-blind. Confirm A1. *(The brief's "use
   pass_rtg directly" is not viable — it's a weekly sum.)*
2. **Capture `completionPct`?** Plan records it (computed, capture-only) for future
   CPOE work. Drop it to keep the sub-object minimal? Default: keep.
3. **Optional inner-shape assertion** on `factors.efficiencyMetrics` (QB) — add the
   pin, or rely on the dedicated `efficiencyMetrics.test.js` coverage? Default: add
   the lightweight pin.
