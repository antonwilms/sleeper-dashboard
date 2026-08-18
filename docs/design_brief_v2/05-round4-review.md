# Appendix E — Round 4 review ("Dark data, surfaced")

**Reviewed:** 2026-08-18, against app `021a3ee` and the live data files.
**Design under review:** Claude Design project `App design overhaul`
(`e4ed4731-0d72-4e11-9da7-50bc2a2bc362`) —
`App v2 - dark data.dc.html` (blocks `4a`/`4b`/`4c`) and
`design_handoff_dynasty_portfolio/README-round4-dark-data.md`.

**Method.** Every element the design cites was traced to a field in a served file or a symbol in
`src/`. Coverage claims were re-measured rather than accepted. `support.js` was diffed against the
copy already checked into this repo — **byte-identical, 1911 lines**, so there is no new prototype
runtime to account for and the 1b handoff's "ignore the runtime entirely, it is not production
code" still applies unchanged.

**Overall:** accept with fixes. One element is unbuildable, three would become bugs, three are
cosmetic, and two of five requested deliverables were deferred. Everything else should ship as
drawn — §6 lists what must *not* be changed in the process of fixing the rest.

---

## 1. Findings at a glance

| # | Severity | Finding | Where |
|---|---|---|---|
| F1 | **Blocking** | Game log's `SNAP%` column has no source at any grain | `4a` game log · `glHead` |
| F2 | Correctness | `ktcHistConfidence` should be `high`, not `medium` | `4a` market-value tile · `workingB` |
| F3 | Correctness | Distribution histogram and the Consistency tile are two different quantities shown as one number | `4a` Distribution |
| F4 | Correctness | The Efficiency column set is receiver-shaped, but Market has four position pills | `4c` · README `4c` |
| F5 | Minor | A KTC value (`10,102`) exceeds the data repo's own validation range | `4a` value-adjacent · `4c` row 2 |
| F6 | Minor | `compBlendWeight` is a weight, listed among multiplicative factors | `4a` "why next season" |
| F7 | Minor | `612` player pool is a carried-over mock figure | `4a` positional ranks |
| F8 | Scope | Teams (index + detail) and Portfolio extensions not drawn | deliverables 2 and 4 |
| F9 | Scope | Mobile tab-bar slot nomination unanswered | mobile ask 6 |

---

## 2. F1 — Blocking: the game log's `SNAP%` column cannot be built

The design places `SNAP%` in the game log's context block, between the schedule fields and the
production fields (`glHead`, right of `WEATHER`, left of `TGT`).

**There is no snap field in the gamelogs family, at all.** Measured across `nflverse/gamelogs/`
2012, 2018 and 2025 — the union of every key present on every `games[]` entry contains no
snap-like field (searched `snp`, `snap`, `played`). Snap counts exist **only at season grain**, as
`off_snp` and `tm_off_snp` in `nfl/season-totals/<year>.json`, which is exactly how this design's
own *Usage & efficiency* section correctly sources them.

So per-game snap share is not a coverage-cliff case that `DegradedBlock`'s `NOT MEASURED THEN`
kind can absorb — it is unavailable for every player in every season, including the current one.

**Options, in preference order:**
1. **Remove the column** from the game log. The context block still carries opponent, result,
   spread, total, roof and weather, which is the point of it.
2. Keep a snap figure but move it out of the per-game table into the section header as a
   **season constant** ("Snap share, 2025: 94%"), labelled as season-grain so it cannot be read as
   a per-game value.

Option 1 is cleaner. Option 2 preserves the information at the cost of a mixed-grain section.

This is the one finding that must be resolved before implementation, because it is in the round's
flagship new section and it is the exact failure mode the no-fabrication rule exists to prevent.

---

## 3. Correctness findings

### F2 — `ktcHistConfidence` is `high`, not `medium`

The market-value tile reads `13w · medium`, and `workingB` lists
`ktcHistConfidence: 'medium'`.

Verified against `src/utils/ktcHistory.js`:

```
WINDOW_SIZE      = 8
MIN_SPACING_DAYS = 5
ktcHistConfidence = n >= 7 ? 'high' : n >= 4 ? 'medium' : 'low'
```

The eleven committed snapshots (2026-05-18 → 2026-08-10) are all spaced ≥5 days apart, so the
loader selects the full window of 8, `n = 8`, and the band is **`high`**.

This also contradicts the round-4 README's own band table, which sets `high` at "≥ 7 snapshots".
Three pips, not two.

*Note the derived figure is right:* `ktcHistWindowSpanDays: 84` matches 2026-05-18 → 2026-08-10
exactly. Only the band is wrong.

### F3 — Distribution and Consistency are different quantities

The Consistency tile shows `±8.1` at `3y · high`. The Distribution section is labelled
`16 games`, and its shape block reads `Population sd 8.1` alongside `Weeks over 20: 6 of 16` and
`Weeks under 10: 3 of 16`.

Verified against `src/utils/outlookConsistency.js`:

```
QUALIFYING_GP    = 8   // a season counts toward the window
WINDOW_SEASONS   = 3   // pool the last N qualifying seasons
MIN_POOLED_GAMES = 10  // pooled games needed before an sd is emitted
```

`computeConsistency` returns **one pooled mean / sd / CV over the last three qualifying seasons** —
roughly 48 games, not 16. So a 3-year pooled sd and a single-season 16-game histogram cannot both
be `8.1`.

**Pick one and make it explicit:**
- **Pooled (recommended)** — the histogram covers the same three seasons as the tile, ~48 games,
  and the tile's number is the distribution's number. One quantity, two views. The section label
  becomes `3 seasons · 48 games`.
- **Single-season** — the histogram is 2025 only, and its shape block carries its *own* sd, which
  differs from the tile's. Both are then correct but they must not share a number.

The first is better: it keeps the tile and the section reconcilable, which is the whole argument
for showing a distribution next to a scalar.

### F4 — The Efficiency set is receiver-shaped; Market has four position pills

As specified — `TGT SH · AY SH · aDOT · EPA/TGT · RACR · RZ SH · SNAP% · DROPS` — the set works
for WR and TE and collapses for the other two. Non-null rates, `nflverse/gamelogs/2024.json`,
per position-game:

| Position | `racr` | `receivingEpa` | `passingEpa` | `passingCpoe` | `rushingEpa` |
|---|---|---|---|---|---|
| WR | 86% | 86% | 1% | 1% | 13% |
| TE | 88% | 89% | 0% | 0% | 3% |
| RB | 65% | 66% | 0% | 0% | **86%** |
| QB | 1% | 1% | **95%** | **95%** | 88% |

For **QB the set is empty**. For **RB**, `RACR` is populated at 65% but this project's own
backtest classified RB air-yards metrics as **noise** and named `target_share` the meaningful RB
metric — so showing RACR to RBs contradicts the same grading record the design correctly cites
when it excludes WOPR.

**Fix:** give the Efficiency set per-position columns, the way Market's Volume set already does
via `market/columnDescriptors.js`'s `POSITION_STAT_COLUMNS`. Suggested, all ≥86% populated:

| Pill | Columns |
|---|---|
| QB | `EPA/ATT · CPOE · SACK% · AY/ATT · RUSH EPA` |
| RB | `CARRY SH · TGT SH · RUSH EPA/ATT · YAC · BTKL` |
| WR / TE | as drawn (the current set) |
| ALL | the WR/TE set, or the lead metric only |

If per-position is out of scope for this round, the alternative is to label the set control
`EFFICIENCY (WR/TE)` and disable it under the QB and RB pills — honest, but it makes one of the
four sets conditional, which the two-groups-of-two framing was designed to avoid.

---

## 4. Minor findings

### F5 — `10,102` is outside KTC's valid range
`lib/validate.mjs:262` rejects any KTC row where `value < 0 || value > 9999`. The mock value
`10,102` for Malik Nabers (value-adjacent list and Market row 2) could not survive ingest. Cap
mock values at 9,999. *(For reference, the real 2026-08-10 top of board is Gibbs 9,999 /
Chase 9,989 / Allen 9,997.)*

### F6 — `compBlendWeight` is not a multiplier
`workingA` lists twelve factors that "moved the number", eleven of which are `1.0xx`-shaped
multipliers plus `ageDelta`. `compBlendWeight: 0.34` is the **weight** on the career-comp ensemble
blend, not a multiplicative factor — a reader scanning the column will read 0.34 as a 66%
reduction. Either move it to the observed-only column, or give it its own line with the blended
PPG it produced (`compPPG`, also a real key).

### F7 — `612` is a carried-over mock figure
"WR2 of 612" reuses the pool size from the 1b mock. The current KTC snapshot carries 500 rows and
`playerRows` is a different number again. Representative figures are explicitly allowed by the
handoff's own fidelity rule, so this is not an error — but the positional-rank card is the one
place a real pool size would strengthen the superflex caveat sitting next to it.

---

## 5. Scope: F8 and F9

**Teams (index + detail) and the Portfolio extensions were deliverables 2 and 4 of the round; both
are deferred to "Open for the next round".**

The partial defence for Teams is real: the pop-up's Environment section consumes
`teamContext.off.*` and `teamContext.def.*`, so the highest-coverage family in the app (14 seasons,
zero nulls) is no longer fully dark. What is missing is the 32-team comparative view — the thing
that makes any single team's PROE or pace interpretable.

Portfolio is the weaker omission. Two questions it was supposed to answer remain open: the
tile-delta asymmetry (two of four tiles have a real baseline, two do not) and picks as holdings,
including the fifth-round pick that has no KTC value. Neither is addressed anywhere in the round.

**F9:** the mobile ask to nominate which single new surface takes the last `BottomTabBar` slot went
unanswered. Largely moot — no new nav-level surface shipped, and removing `ACT` frees rail slots —
but it returns the moment Teams or Changes is drawn.

---

## 6. Do not change these while fixing the above

Listed because a fix pass can easily erode what worked.

- **The D1 answer.** Continuous scroll + a `140px` section index, no second tab row, no route.
  It solves the two-tab-rows problem without breaking "never navigate to research", and
  **the index doubling as a coverage manifest** is better than anything the brief asked for — the
  set of what is known about a player is readable before scrolling.
- **Scoping the 300px right rail to the Overview band** so it stacks at 1180px. This satisfies the
  mobile constraint by construction rather than by promise. Keep that property.
- **`SeriesBars` as a new sibling** rather than re-speccing `CareerBars`. The brief made
  `CareerBars`' fixed 5-wide geometry non-negotiable and this respects it exactly.
- **The void slot.** Dashed rule at the axis, no fill, `—` for the number, axis label dropped —
  versus a filled 2px stub for a measured zero. This fixes a **live bug**: `CareerBars` currently
  0-pads absent seasons, so a missing season and a real 0.0 render identically today.
- **Reusing `ktcHistConfidence`'s four-band vocabulary** for coverage, extended from snapshot
  counts to season counts. Exactly as asked. (F2 is a misapplication of this, not a fault in it.)
- **The four-kind empty-state taxonomy.** `NOT YET — ACCRUING` / `NOT MEASURED THEN` /
  `UNDEFINED HERE` / `NEVER AVAILABLE` is sharper than the brief's ask, and "never a call to
  action — the app is a static client over a CDN; it cannot fetch what is missing" is the correct
  architectural read.
- **Definitions: click not hover, scoped to the surface, percentile strip with no colour and no
  verdict, and "only mark what needs marking."** The judgement that `DROPS` needs no underline is
  right — measured at **88%** populated on the ≥20-target pool, it earns the `high` band and needs
  no pip either.
- **The "moved the number" vs "observed only, moved nothing" split** on the 73 factors. This is
  the capture-only invariant made visible, and keeping the inert column present but separate is
  the right call.
- **Two data-semantics details that are easy to get wrong and are right here:** weather renders
  `—` under a roof because `temp`/`wind` are honestly null indoors, and a bye is a labelled row
  rather than a scoring zero because no row exists in the source.
- **Every prohibition respected** — no WOPR, no YPRR, no verdict or `CALL` column, no risk
  Low/Med/High, no band around the projection, no combine data, `ACT` removed until it has a
  member.
- **The superflex caveat**, picked up from README §1.5 and stated once in the positional-ranks
  card rather than repeated. Correct handling of a fact the app cannot yet act on.
- **`PRODUCTION` → `VOLUME`** and the two-groups-of-two set control. The rename does sharpen the
  contrast against Efficiency, and grouping model-and-market against on-field is a better mental
  model than four peers.
- **`TREND` as a persistent gutter** right of `PLAYER`, sorting on delta, rather than a member of
  one set.

---

## 7. Verification log

What was checked, and how — so a later reader can re-run it rather than trust it.

| Claim | Method | Result |
|---|---|---|
| Gamelogs carries no snap field | Union of all `games[]` keys, 2012/2018/2025 | **Confirmed absent** |
| `rec_drop` coverage | Share of ≥20-target players carrying the key, 2024 | 241/274 = **88%** |
| RACR / EPA per position | Non-null rate per position-game, 2024 | table in F4 |
| KTC value range | `lib/validate.mjs:262` | `[0, 9999]`, rejects 10,102 |
| KTC window + confidence | `src/utils/ktcHistory.js:15,16,283` | `n = 8` → `high` |
| Consistency window | `src/utils/outlookConsistency.js:3–6` | 3 pooled seasons |
| Score-driver weights | `src/utils/dynastyScore.js:1023–1031` | 0.28 / 0.25 / 0.22 / 0.15 / 0.10 — **design matches, order included** |
| `workingA` / `workingB` keys | `src/__tests__/factorsSchema.test.js` | all 18 are real `factors` keys |
| `ktcHistWindowSpanDays: 84` | 2026-05-18 → 2026-08-10 | **correct** |
| `support.js` | `diff` against `docs/design_handoff_dynasty_portfolio/support.js` | **byte-identical**, 1911 lines |

**Not reviewed:** `Wireframes - lineup & league map.dc.html`, also present in the project. The
League map was explicitly out of scope for this round and "lineup" refers to the retired `/roster`
concept, so it is assumed to predate round 4. Confirm it is not intended as part of this handoff.
