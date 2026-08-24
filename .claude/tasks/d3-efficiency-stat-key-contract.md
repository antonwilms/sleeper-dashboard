# D-3 — Put Market's Efficiency stat keys under contract

**Item:** D-3 from [data-repo-backlog.md](data-repo-backlog.md), second in the post-dp-v2 batch
(D-4 landed as data repo `02cf41d`).

Market's Efficiency column set (dp-v2 Slice 5b) reads season-totals stat keys that appear in **no
`CR-NN` entry and in no app-side contract test**, so a data-side rename or removal would break
shipped columns with nothing catching it in either repo.

Research turned up two things the backlog entry did not have: **there are five keys, not four**, and
**two of them fabricate a zero rather than degrading to `—`.**

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| **Five keys, not four.** `rush_yac`, `rush_btkl`, `rec_drop`, `pass_air_yd` — **plus `pass_sack`**, which the backlog entry missed | grep over `src/` |
| All five are absent from **`docs/cross-repo-registry.md`** (0 hits each) | measured |
| All five are absent from **`ALL_CONTRACT_KEYS`** in `statKeysContract.test.js` | `:47-78` |
| All five are live in the served data (2025): `rec_drop` 308 rows, `rush_yac` 303, `rush_btkl` 179, `pass_air_yd` 117, `pass_sack` 102 | measured |
| Efficiency-set consumers: `market/Market.jsx` `dropbacks :596`, `sackPct :597`, `ayPerAtt :598`, `yac :605`, `btkl :606`, `drops :616` | measured |
| **`pass_sack` has a SECOND, non-Market consumer** — `utils/outlookPositionStats.js:128` (`computeMetricValue`, the `sacks` metric), rendered by `dp/UsageEfficiencySection.jsx` **and** by Market's *Outlook* set. Planning's "consumers are all in the Efficiency set" was wrong | measured |
| `utils/usageEfficiency.js` `METRIC_META` names **all five**, across **six** lines — `:39` (`sacks`) and `:115` (`sackPct`) both point at `pass_sack`, plus `:121,145,151,169` | measured |
| **`utils/usageEfficiency.js` is ALREADY a named CR-11 trigger** (`:81`, plus `:87,93,148,157`) — planning claimed it was absent from the registry; that was wrong | `docs/cross-repo-registry.md:132` |
| **The fixture already carries all five** with finite values — `pass_sack` 70 rows, `pass_air_yd` 85, `rush_yac` 271, `rush_btkl` 147, `rec_drop` 276, of 2750. **No fixture extension needed** | `src/__fixtures__/season-totals-2025.json` |
| **CR-19 is confirmed the next free id** — CR-01…CR-18 exist contiguously in both repos | both registries |
| `statKeysContract.test.js`'s assertion is a real forcing function — it throws with an explicit missing-key list | `:79`+ |
| **`statKeysContract.test.js:73` says `pass_air_yd` is "out of scope (QB nulled per Q3)"** — true for the aDOT capture batch, **falsified by Slice 5b**, which renders it as `AY/ATT` | `:73` |
| The data-side write path is the generic `Object.entries(stats)` sum loop, `lib/sleeper.mjs` `aggregateWeeks:216` — the same trigger CR-11/12/13 name | data repo |

---

## 2. Three of five degrade correctly; two fabricate a zero

```js
_eff.sackPct  = (seasonStats && dropbacks > 0)   ? (seasonStats.pass_sack   ?? 0) / dropbacks           : null   // :597
_eff.ayPerAtt = (seasonStats?.pass_att > 0)      ? (seasonStats.pass_air_yd ?? 0) / seasonStats.pass_att : null   // :598
_eff.yac      = seasonStats?.rush_yac  ?? null   // :605
_eff.btkl     = seasonStats?.rush_btkl ?? null   // :606
_eff.drops    = seasonStats?.rec_drop  ?? null   // :616
```

`yac`/`btkl`/`drops` render `—` when the key is missing. **`sackPct` and `ayPerAtt` do not** — the
`?? 0` sits inside the numerator, so a missing key yields `0 / denominator = 0`, and the column shows
a confident **`0.0` for every QB**. Verified by direct evaluation: `pass_air_yd` absent with
`pass_att: 300` returns `0`, not `null`.

This is the exact failure the contract exists to describe, and it violates the repo's own standing
rule — *"render `—`/omit, never a fabricated fallback."* A reader cannot distinguish "this QB threw no
air yards" from "the key vanished upstream."

**Fix both in this change.** Move the null-guard outside the division: if the stat key is absent,
the metric is `null`, not `0`. Two expressions, and the rule is already established in the three
sibling lines directly beneath them.

> **Guard on key absence (`== null`), never on falsiness** — `!seasonStats.pass_sack` would also
> collapse a present `0`. Follow `outlookPositionStats.js:128`, which already does this correctly
> (`if (v == null || !Number.isFinite(v)) return null`); this change brings the Efficiency set into
> line with a pattern the codebase already has.
>
> **But do not oversell what the fix buys.** Review measured it: **zero rows in the served 2025 file
> carry a present `0` for any of the five keys** — Sleeper omits zero-valued counting stats
> entirely. So a genuinely sack-free QB and a vanished `pass_sack` key *both* arrive as absent, and
> after the fix both render `—`. The fix removes a **fabricated number**, which is the real win; it
> does **not** restore a distinction the data shape cannot express. **The corpus-wide-absence
> Invariant in the registry entry is what actually catches breakage** — not the cell rendering. The
> present-`0` branch is defensive only, against a future upstream that starts emitting explicit
> zeroes.

---

## 3. The registry entry — a dedicated one, not a CR-02 extension

Planning for the batch originally proposed extending CR-02. **Review corrected that**, and the
precedent is unambiguous: per-stat-key preservation gets a **standalone `data→app` entry** triggered
by the `aggregateWeeks:216` sum loop — **CR-11** (five usage keys), **CR-12** (`pass_cmp` alone),
**CR-13** (`rec_air_yd` alone), each deliberately *not* folded into CR-02. Follow that shape.

The coupling is not new in reality — these keys have been load-bearing since Slice 5b. Only the
*record* is new, so this is documenting an existing coupling and **stays in-repo**; no Claude.ai
round trip.

**CR-19 is confirmed the next free id** (CR-01…CR-18 exist contiguously in both repos).

**The registry's entry format is fixed — planning's draft violated it** (`docs/cross-repo-registry.md:21-33`:
*"Field order is fixed; no field is optional"*). It put `Data side` first, omitted `Triggers`
entirely — the app ‖ data field a reviewer actually evaluates — and invented a `Keys` field. Corrected
below. Land this verbatim in **both** repos in the same change:

> #### CR-19 · Market Efficiency stat keys
> - **App side:** `src/components/market/Market.jsx`'s Efficiency column set — `dropbacks:596`,
>   `sackPct:597`, `ayPerAtt:598`, `yac:605`, `btkl:606`, `drops:616`; the `field:` expressions in
>   `src/utils/usageEfficiency.js` `METRIC_META` (`:39`, `:115`, `:121`, `:145`, `:151`, `:169`);
>   **and `src/utils/outlookPositionStats.js:128`** (`computeMetricValue`'s `sacks` metric), a second
>   `pass_sack` reader rendered by `dp/UsageEfficiencySection.jsx` and Market's *Outlook* set.
>   Enforced by `EFFICIENCY_SET_KEYS` in `src/__tests__/statKeysContract.test.js`.
> - **Data side:** `nfl/season-totals/<year>.json`, written by the generic sum-all-keys loop in
>   `lib/sleeper.mjs` `aggregateWeeks` (`Object.entries(stats)` at `:216`) via the writer
>   `scripts/update-nfl.mjs:88`; `findNonFinite:69` in `lib/validate.mjs`; `RATE_KEYS` in
>   `lib/fantasyPoints.mjs:21` (the one key filter that exists on this data today, read-side — none
>   of these five is in it).
> - **Invariant:** all five are season-total **counting** stats, sparsely populated by position and
>   games played (2025: `pass_sack` 102, `pass_air_yd` 117, `rush_btkl` 179, `rush_yac` 303,
>   `rec_drop` 308 rows). **Sparsity is normal and is not a signal of breakage; absence of the key
>   across the whole corpus is.** Sleeper omits zero-valued counting stats, so a present `0` does not
>   occur — "absent" and "genuinely zero" are indistinguishable at the row level, which is why the
>   corpus-wide check is the only real guard.
> - **Direction:** data→app
> - **Triggers:** `market/Market.jsx`'s Efficiency-set call sites, `utils/usageEfficiency.js`'s
>   `METRIC_META` field strings, `utils/outlookPositionStats.js:128`, `EFFICIENCY_SET_KEYS` in
>   `src/__tests__/statKeysContract.test.js`  ‖  the `Object.entries(stats)` sum loop in
>   `lib/sleeper.mjs` `aggregateWeeks:216`, the writer `scripts/update-nfl.mjs:88`, `findNonFinite:69`
>   in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21`
> - **Mirror:** Do not remove, rename or filter `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`
>   or `rec_drop`. They drive five columns of Market's Efficiency set plus the Outlook `sacks` metric,
>   and **nothing in either repo fails when they vanish** — no error, no test failure. `rush_yac`,
>   `rush_btkl` and `rec_drop` degrade to `—`, which reads as "this player has no data" rather than
>   "the pipeline broke." `pass_sack` and `pass_air_yd` were worse until this entry was written: their
>   call sites divided by a denominator that survives the key's absence, so a missing key rendered a
>   confident **`0.0`** rather than blanking. Both were hardened in the same change; the hazard is
>   recorded because the *shape* invites the identical bug in any future consumer that divides by a
>   surviving denominator. These keys are **view-only** — unlike CR-11/12/13 they never touch
>   `projectedPPG`, the dynasty score or any `factors` entry, so changes need no graded gate; the cost
>   of losing them is silent display corruption, not silent scoring drift.

---

## 4. App-side contract

Add all five to `statKeysContract.test.js`. Follow the file's existing grouping convention with a new
block rather than appending to an unrelated one:

```js
// Market Efficiency-set stat keys (dp-v2 Slice 5b) — view-only, never projection/scoring.
// See CR-19. pass_sack and pass_air_yd additionally guard against the fabricated-zero
// failure mode described there.
const EFFICIENCY_SET_KEYS = [
  'pass_sack', 'pass_air_yd', 'rush_yac', 'rush_btkl', 'rec_drop',
]
```

**And correct the stale comment at `:73`.** It reads *"`rec_air_yd` is the only new dependency;
`pass_air_yd` is out of scope (QB nulled per Q3)"* — accurate for the aDOT capture batch, **false
since Slice 5b**, which renders `pass_air_yd` as `AY/ATT`. Leaving it would directly contradict the
line being added six lines below it.

**You must also edit the union at `statKeysContract.test.js:79`.** It is a **hand-written spread**,
not a scan of the module's consts — adding `EFFICIENCY_SET_KEYS` without adding it there leaves the
new block as **dead code, with the test still green while asserting nothing**. This is the whole
point of the item; getting it wrong produces a contract that does not exist.

**The fixture already carries all five** (verified: `pass_sack` 70 rows, `pass_air_yd` 85,
`rush_yac` 271, `rush_btkl` 147, `rec_drop` 276, of 2750) — **no fixture work needed**. The
assertion is a genuine forcing function: it throws with an explicit missing-key list.

---

## 5. Tests

- **The contract test covers all five** — the new block is included in the `ALL_CONTRACT_KEYS` union
  (check how the union is built; it dedupes).
- **Missing key → `—`, not `0`**, for `sackPct` and `ayPerAtt` specifically. A Market test with a QB
  row carrying `pass_att` but **no** `pass_air_yd` must assert the cell renders `—`. This is the
  regression guard for §2 and the most valuable test here.
- **A real zero still renders `0.0`** — a QB row with `pass_sack: 0` and a positive denominator.
  This is what stops the fix overshooting into falsiness-guarding.
- `Market.test.jsx:701-704` already builds Efficiency fixtures carrying **all five**
  (`pass_sack`/`pass_air_yd` `:701`, `rush_yac`/`rush_btkl` `:703`, `rec_drop` `:704`); extend rather
  than fork. Note `qb3` (`:836`) carries a **present `pass_sack: 0`** and must stay `0.0%` after the
  fix — it is the existing guard against overshooting into falsiness.

---

## 6. Cross-repo impact

**The new entry (CR-19 draft, §3)** lands in `docs/cross-repo-registry.md` **and** the data repo's
`README.md` mirrored region, in the same change. Verify the next free id at implementation time.

**CR-18 · Signal registry rows** fires — five stat keys change classification from unrecorded to
contracted, and `docs/signal-registry.md` is the canonical inventory.

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new
> ingest adds a script the list above cannot already name. The listed sites are every one that exists
> today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer
> re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When
> a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**This is a prerequisite for F-24.** Putting these five under contract *before* anything rewrites the
files they live in is the cheap safeguard — F-24's denylist must provably not touch them.

---

## 7. Done-definition

- [ ] Five keys (incl. **`pass_sack`**, which the backlog entry missed) in `ALL_CONTRACT_KEYS`
- [ ] The stale `:73` comment corrected in the same change
- [ ] Fixture carries all five with finite values; assertion not weakened
- [ ] `sackPct` / `ayPerAtt` null-guard moved outside the division; **a present `0` still renders `0.0`**
- [ ] CR-19 (or next free id) landed in **both** repos, modelled on CR-11/12/13, naming
      `utils/usageEfficiency.js` — currently absent from the registry entirely
- [ ] `docs/signal-registry.md` rows updated for all five (CR-18)
- [ ] `npm test` green · `npm run lint` 0 problems · `npm run build` clean
- [ ] Smoke: Market → Efficiency set, QB pill. **Expect visible change on low-attempt QBs** —
      measured on served 2025 data, **30 of the 128 rows with `pass_att>0` carry no `pass_sack`** and
      **11 carry no `pass_air_yd`**, so those cells correctly flip `0.0%`/`0.0` → `—`. All 77 rows at
      `pass_att≥100` carry both, so starters are unaffected. **Cells flipping to `—` is the fix
      working, not a regression.**

---

## 8. Hand-back should report

- Which id the new entry actually got, and confirmation it is byte-identical in both repos.
- Whether the fixture already carried all five or needed extending.
- The before/after of `SACK%`/`AY/ATT` for **a low-attempt QB** (one of the 30 rows lacking
  `pass_sack`) **and** a starter — the first should flip to `—`, the second should be unchanged.
  Planning originally predicted "changed nothing for real data"; review measured that wrong.
