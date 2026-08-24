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
| Consumers are all in `market/Market.jsx`'s Efficiency set: `sackPct :597`, `ayPerAtt :598`, `yac :605`, `btkl :606`, `drops :616` | measured |
| `utils/usageEfficiency.js` `METRIC_META` names four of them in `field:` strings (`:121,145,151,169`) — the pop-over's field expression | measured |
| **`utils/usageEfficiency.js` is absent from the cross-repo registry entirely** | measured |
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

> **Deliberate non-change:** a *present* `0` must still render `0.0`. A QB with a real zero-sack
> season is measured data. Guard on **key absence** (`== null`), never on falsiness — `!seasonStats.pass_sack`
> would collapse the real zero into `—` and swap one lie for another.

---

## 3. The registry entry — a dedicated one, not a CR-02 extension

Planning for the batch originally proposed extending CR-02. **Review corrected that**, and the
precedent is unambiguous: per-stat-key preservation gets a **standalone `data→app` entry** triggered
by the `aggregateWeeks:216` sum loop — **CR-11** (five usage keys), **CR-12** (`pass_cmp` alone),
**CR-13** (`rec_air_yd` alone), each deliberately *not* folded into CR-02. Follow that shape.

The coupling is not new in reality — these keys have been load-bearing since Slice 5b. Only the
*record* is new, so this is documenting an existing coupling and **stays in-repo**; no Claude.ai
round trip.

Draft, to land in **both** repos in the same change (next free id — verify it at implementation time,
do not assume):

> **CR-19 · Market Efficiency stat keys** · *Direction: `data→app`*
>
> **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`Object.entries(stats)`
> at `:216`) writing `nfl/season-totals/<year>.json`; the writer in `scripts/update-nfl.mjs:88`;
> `validateNflSeason` in `lib/validate.mjs`. These keys are preserved as-is and must never be stripped
> or filtered by any schema operation.
>
> **App side:** `src/components/market/Market.jsx`'s Efficiency column set (`:597,598,605,606,616`) and
> the `field:` expressions in `src/utils/usageEfficiency.js` `METRIC_META` (`:121,145,151,169`);
> enforced by `ALL_CONTRACT_KEYS` in `src/__tests__/statKeysContract.test.js`.
>
> **Keys:** `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`, `rec_drop`.
>
> **Invariant:** all five are season-total counting stats, sparsely populated by position and by
> games played (2025: 102–308 rows each). Sparsity is normal and is **not** a signal of breakage;
> absence of the **key across the corpus** is.
>
> **Mirror:** Do not remove, rename or filter these keys. They drive five columns of Market's
> Efficiency set — the app's primary surface — and **nothing in either repo fails when they vanish**.
> `rush_yac`, `rush_btkl` and `rec_drop` degrade to `—`, which reads as "this player has no data"
> rather than "the pipeline broke." `pass_sack` and `pass_air_yd` are worse: their call sites divide
> by a denominator that survives, so a missing key renders a confident **`0.0`** for every QB rather
> than blanking — fabricated data indistinguishable from a real zero. (The app hardened both call
> sites when this entry was written; the hazard is recorded because the *shape* invites the same bug
> in any future consumer.) These keys are also **view-only** — unlike CR-11/12/13 they never touch
> `projectedPPG`, the dynasty score or any `factors` entry, so a graded gate is not required for
> changes to them; the cost of losing them is silent display corruption, not silent scoring drift.

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

**Confirm the fixture carries all five** before adding them — the contract test asserts each key
appears with a finite value in `src/__fixtures__/season-totals-2025.json`. If any is missing, extend
the fixture in the same change; do not weaken the assertion.

---

## 5. Tests

- **The contract test covers all five** — the new block is included in the `ALL_CONTRACT_KEYS` union
  (check how the union is built; it dedupes).
- **Missing key → `—`, not `0`**, for `sackPct` and `ayPerAtt` specifically. A Market test with a QB
  row carrying `pass_att` but **no** `pass_air_yd` must assert the cell renders `—`. This is the
  regression guard for §2 and the most valuable test here.
- **A real zero still renders `0.0`** — a QB row with `pass_sack: 0` and a positive denominator.
  This is what stops the fix overshooting into falsiness-guarding.
- `Market.test.jsx:701-704` already builds Efficiency fixtures with four of the five keys; extend
  rather than fork.

---

## 6. Cross-repo impact

**The new entry (CR-19 draft, §3)** lands in `docs/cross-repo-registry.md` **and** the data repo's
`README.md` mirrored region, in the same change. Verify the next free id at implementation time.

**CR-18 · Signal registry rows** fires — five stat keys change classification from unrecorded to
contracted, and `docs/signal-registry.md` is the canonical inventory.

> **Mirror:** When a data-repo change adds, removes or reclassifies an ingested field, stat key or
> source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact
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
- [ ] Smoke: Market → Efficiency set, QB pill — `SACK%` and `AY/ATT` still show real values, not `0.0`

---

## 8. Hand-back should report

- Which id the new entry actually got, and confirmation it is byte-identical in both repos.
- Whether the fixture already carried all five or needed extending.
- The before/after of a QB row's `SACK%` and `AY/ATT` in the smoke, confirming the fix changed
  nothing for real data.
