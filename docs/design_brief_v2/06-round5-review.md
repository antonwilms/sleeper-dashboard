# Appendix F — Round 5 review ("Teams, and the portfolio's missing halves")

**Reviewed:** 2026-08-18, against app `407b087` and the live data files.
**Design under review:** `App v2 - dark data.dc.html` — round-5 revision (1525 → 2033 lines,
596 changed lines) plus the updated `design_handoff_dynasty_portfolio/README-round4-dark-data.md`.
New blocks `5a` (Teams index), `5b` (Team detail), `5c` (Portfolio extensions + the F9 tab-slot
answer). Round-4 fixes applied in place inside `4a`/`4c`.

**Method.** Diffed against the round-4 revision reviewed in [Appendix E](05-round4-review.md)
rather than re-read cold, then verified each of the seven claimed fixes independently and traced
every element of the three new surfaces to a field in a served file. `support.js` unchanged.

**Verdict: accept.** One documentation fix (**G1**) should land before implementation; **G2–G5**
are four one-line corrections. §6 of Appendix E was preserved — stated in the README and confirmed
in the markup.

---

## 1. Fix audit

| # | Claimed | Verified |
|---|---|---|
| **F1** SNAP% | Removed (option 1) | ✅ Gone from `glHead`; absence stated in the game-log footer so it reads as deliberate |
| **F2** confidence | `high`, three pips | ✅ **Better than asked** — tile meta now reads `8 snaps · 84d`, exposing the count that drives the band instead of a bare window |
| **F3** Distribution | Pooled, 49 games | ✅ Buckets sum to 49; `16 of 49` over 20 and `9 of 49` under 10 both reconcile; 49 = 16+17+16, matching the availability grid exactly |
| **F4** Efficiency | Per-position | ✅ Columns adopted with the reasoning intact; coverage figures accurate — see §2 |
| **F5** KTC cap | Rebuilt in range | ✅ Nabers 9,994 in both sites, **and the sparkline delta recomputed** (+5.8% → +6.3%) |
| **F6** compBlendWeight | "Own line, with `compPPG`" | ⚠️ Removed from the multiplier column; no replacement line drawn — **G3** |
| **F7** 612 → 500 | Applied | ⚠️ Ranks card fixed; the tile was not — **G2** |

**On F4's coverage figures.** Appendix E doubted the RB numbers. That doubt was wrong: scoped to
the pool the column actually serves (≥40 carries, 2024), `rush_btkl` is **92%** and `rush_yac` is
**100%** — the design's 89% / 91% are if anything conservative. The earlier 29% figure was measured
across all skill rows, which is the wrong denominator. The design scoped correctly.

---

## 2. G1 — Three wrong field expressions in the Teams element table

**Significant despite its size.** Per-element source citation is this design's main safeguard —
it is how F1 was caught — and `DefinitionPopover` renders "the field expression" to users. Three of
the six expressions in `5b`'s element table do not evaluate to the metric they name.

| Metric | Design states | Actually evaluates to | Correct expression |
|---|---|---|---|
| **Success rate** | `off.successPlays ÷ off.plays` | **exactly `1.0000`, always** | `off.successes ÷ off.successPlays` |
| **Off EPA/play** | `off.epa ÷ off.plays` | **no `epa` field exists** | `off.epaSum ÷ off.epaPlays` |
| **Def EPA allowed** | `def.epa ÷ def.plays` | same — no `epa` field | `def.epaSum ÷ def.epaPlays` |
| **PROE** | `off.proeXpassSum ÷ off.proePlays` | `0.573` — the **expected** pass rate | `(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)` |

Verified against `nflverse/teamcontext/2025.json`, CIN week 1. The corrected expressions reproduce
the stored values to three decimals; the design's do not:

```
stored successRate 0.408   correct successes/successPlays = 0.4082   design successPlays/plays = 1.0000
stored epaPerPlay -0.109   correct epaSum/epaPlays       = -0.1089   design off.epa/off.plays  = undefined
stored proe       -0.002   correct passRate - xpassRate  = -0.0019   design xpassSum/proePlays = +0.5733
```

`successPlays` is the *denominator* field, so dividing it by `plays` returns a constant for every
team in every season. The PROE expression drops a whole term — it names the expected rate rather
than the difference that makes it PROE.

**The rendered values are all correct** (`+3.2`, `47.0%`, `+0.11`); only the stated derivations are
wrong. But an implementer following the citation would build a constant, a crash, and a 57% figure
respectively.

**Fix in two places:** `5b`'s element table and `4a`'s Environment rows, which carry the same PROE
expression.

**Related, minor.** Pace cites `off.neutralSecPerPlay`, which does exist — but it is a per-game
rate, and this data repo's rule is that rates are never summed across games. A season figure needs
`Σ off.neutralSeconds ÷ Σ off.neutralGaps`. The design already says "recomputed from components"
generally; this row should say it specifically.

---

## 3. G2–G5 — four one-line corrections

**G2 — the pop-up contradicts itself on pool size.** F7 landed on the positional-ranks card
("Ranks are computed inside the priced KTC board — 500 rows, position-flat") but the Dynasty score
tile in the same Overview band still reads `WR2 of 612`. The declined-reading rationale in the
README is sound; it just did not reach the tile.

**G3 — F6's replacement line is not drawn.** `compBlendWeight` is correctly out of the `1.0xx`
column. But `compPPG` appears nowhere in the markup — only inside the fix-log string that claims it
is shown. Deleting the value rather than relocating it is defensible; the README should not say
otherwise.

**G4 — the roster-value tile's note is untrue as drawn.** The tile shows `68,412` with "Priced
holdings only. Two assets carry no price — see below." But `68,412` is **players only** — it
excludes seven assets (five priced picks plus the two unpriced). The picks block below is correct
(`79,404`, annotated `players 68,412 + picks 10,992`, with the `+ 2 UNPRICED ASSETS` chip), and the
README's §5c text also says the total renders as `79,404`. Either the tile becomes `79,404` — which
makes its note true and matches both — or the note becomes "Players only. Picks below."

**G5 — the pooled mean does not reconcile across sections.** Distribution states a pooled mean of
`17.4` over 2023–25. The Overview's own career bars give those seasons as 15.9 / 21.6 / 18.6 at
16 / 17 / 16 games, which pools to **18.8**. The histogram is internally consistent with 17.4 (its
bucket mass implies ≈17.0), so this is mock arithmetic rather than structure — but F3 was about
this exact class of mismatch, now one layer out.

---

## 4. One note, not a finding

**`CARRY SH` is not a field.** There is no carry-share field in the gamelogs family. The column
needs `gamelogs.games[].carries ÷ teamcontext.off.rushPlays`, joined on `(team, week)` — the only
column across the four Efficiency sets requiring a cross-family join rather than a read or an
in-row division. Buildable, and `teamcontext` has zero nulls, so the stated 97% is achievable; the
implementation cost simply differs from its neighbours and the citation should say so.

Worth noting positively: `teamcontext.off.rushPlays` includes QB scrambles and sneaks, which makes
it a **better** denominator than the app's existing share code, which builds rush denominators from
the skill cohort and therefore excludes QB carries — flagged in `advstats-grading-findings.md` §4.8
as inflating RB rushing shares.

---

## 5. What the new surfaces got right

Recorded so a later fix pass does not erode it, same purpose as Appendix E §6.

**`5a` Teams index**
- **`YOUR EXPOSURE`** — player count and share of roster value per team — is the strongest single
  addition across both rounds. It is the league-awareness bridge this brief exists to argue for,
  and no competitor has it: KTC and FantasyCalc do not know your league; Sleeper knows it and shows
  no analytics. Sourced from `resolvePlayerTeam`, already used by `4c`'s environment filters.
- **The league distribution strip**, re-drawn per sorted column, is what makes a single team's
  `+3.2` readable at all. Without it a team page is a number with no scale.
- **No coverage pips in the table body**, because the family has zero nulls across fourteen seasons
  and pipping 288 identical cells is noise. This is the coverage system used in the direction that
  *removes* marks — a system that only ever adds them is one nobody reads.
- **`DEF EPA ALL` polarity is correct in the markup** (negative → blue) and labelled rather than
  assumed.

**`5b` Team detail**
- **`SeriesBars` `signed` vs `scaled` axis modes.** An improvement on the brief. The reasoning is
  exactly right: a floored negative would render as the small positive stub reserved for a
  *measured zero*, which is the confusion the void slot exists to prevent. `signed` draws a real
  zero axis with negatives below it; `scaled` truncates but **states the floor on the card**
  (`AXIS 27.0–30.1s`).
- **Bar length always means more of the metric** — the component never silently inverts. Direction
  is carried by a label per card, including `VOLUME SIGNAL · NOT A QUALITY READ` for PROE.
- The percentile strip is a **raw-value** axis and says so, so for a lower-is-better metric the good
  end is the left one — which the direction label has already established.
- **`CareerBars` stays untouched**, with the fourteen-season case routed to the sibling exactly as
  Appendix E §6 required.

**`5c` Portfolio**
- **`NO BASELINE` as a state distinct from `NOT YET — ACCRUING`**, justified as "a storage
  decision, not a design one". Better than either option this brief offered (show two deltas, or
  hold all four): it shows the asymmetry and names it, applying the `DegradedBlock` grammar to a
  tile.
- **Picks as holdings.** Unpriced renders as a dashed `—`, never `0`, because "zero would be a
  price; a dash is the absence of one." The incompleteness chip is **inline in the total** rather
  than a footnote, so a reader who never scrolls still knows the total is short and by how many
  assets.
- **F9 closed: Teams takes the fifth tab slot**, argued on dependency — the pop-up's Environment
  section and Market's four environment filters both read `teamContext`, and neither is
  interpretable without the distribution behind it.

**Scope note:** the tab answer introduces **"Me"** (`Portfolio · Market · Teams · League · Me`) as
a fifth destination consolidating what `TopBar` does on desktop. A reasonable mobile pattern, but a
new surface not specified anywhere.

---

## 6. Verification log

| Claim | Method | Result |
|---|---|---|
| SNAP% removed | grep `glHead` for snap columns | **absent** |
| `ktcHistConfidence` | `workingB` value + tile meta | `high`, `8 snaps · 84d` |
| Histogram pooled to 49 | bucket sum; cross-check vs availability grid | 3+6+11+13+9+5+0+2 = **49** = 16+17+16 |
| Distribution self-consistency | ≥20 buckets vs "16 of 49"; <10 vs "9 of 49" | both **match** |
| Pooled mean vs career bars | (15.9·16 + 21.6·17 + 18.6·16) ÷ 49 | **18.8**, design says 17.4 → G5 |
| RB `rush_btkl` / `rush_yac` | ≥40-carry pool, 2024 | **92% / 100%** — design conservative |
| Carry share is a field | union of all `games[]` keys, 2024 | **absent** → §4 |
| Teams field expressions | evaluated all six vs stored values, CIN 2025 wk 1 | **3 wrong** → G1 |
| KTC cap | grep `10,102` / `9,994` | only survivor is the fix-log text |
| `612` | grep | **survives on the Dynasty score tile** → G2 |
| `compPPG` | grep | **only in the fix-log text** → G3 |
| Roster total | tile vs picks block vs README | `68,412` / `79,404` → G4 |
| §6 preserved | `CareerBars` geometry, void slots, sibling split | **intact** |
| `support.js` | unchanged from round 4 | byte-identical to the repo copy |

---

## 7. Addendum — Round 6 (2026-08-18): all findings closed, design signed off

**Reviewed:** the round-6 revision (2033 → 2060 lines, 59 changed lines), diffed against round 5.
`support.js` unchanged. **No findings. The design package is complete.**

| # | Fix | Verified |
|---|---|---|
| **G1** | All four expressions corrected | ✅ `off.successes ÷ off.successPlays` · `off.epaSum ÷ off.epaPlays` · `(off.passPlays ÷ off.plays) − (off.proeXpassSum ÷ off.proePlays)` · pace now `Σ off.neutralSeconds ÷ Σ off.neutralGaps · never the stored per-game rate`. PROE fixed in **both** sites (`5b` table + `4a` Environment row). No bad expression survives anywhere. |
| **G2** | `612` → the 500-row board | ✅ Four consistent sites, no survivor |
| **G3** | `compPPG` line drawn | ✅ `compPPG 19.6` on its own row beneath the two factor columns |
| **G4** | Roster tile | ✅ Now `79,404`, annotated `players 68,412 + picks 10,992`, `+ 2 UNPRICED ASSETS` chip inline |
| **G5** | Pooled mean reconciled | ✅ Career bars moved (2023 `15.9→14.2`, 2024 `21.6→19.4`) — re-derived: **17.44 over 49 games**, CV **0.464 → 0.47** correctly updated. Histogram independently checks out: n=49, midpoint mean 16.99, `≥20 = 16`, `<10 = 9`. |

Also closed: the `CARRY SH` citation now states the cross-family join *and* the QB-scramble advantage;
**Me** is explicitly out of scope, inheriting `TopBar`'s controls; `Wireframes - lineup & league
map.dc.html` is confirmed to predate round 4 and is not part of the handoff; and §6 is stated
untouched, which the markup confirms.

**One declined finding, accepted.** F7 asked for a real pool size; the designer declined a WR count
in favour of naming the 500-row KTC board, on the grounds that a positional rank computed inside a
position-flat board is what the app actually does, and naming the board is what makes the superflex
caveat legible. That reasoning is better than the original request — the rank was never "of N WRs".

**Design status: final.** Rounds 4–6 answered every deliverable in this brief. Implementation is
planned in [`.claude/tasks/dp-v2.md`](../../.claude/tasks/dp-v2.md).
