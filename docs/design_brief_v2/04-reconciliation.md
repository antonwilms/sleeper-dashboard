# Appendix D — Reconciling the two independent passes

Two sessions researched this question without reading each other:

| | Written | Method | Blind spot |
|---|---|---|---|
| **This package** (`design_brief_v2/`) | 2026-08-16, Claude Code | Filesystem access to both repos; counted nulls in the served files; web search for literature and competitors | Could not run the app (repo convention forbids it) or use the competitor products — the competitive read is from reviews and docs |
| **[`docs/design_target_state.md`](../design_target_state.md)** | 2026-08-16, Claude.ai Cowork | Same repo access; verified 56 of 56 cited fields; fetched KTC, PlayerProfiler and FantasyCalc live | Dynasty Daddy and Fantasy Points are client-rendered and could not be inspected |

The Cowork pass explicitly did not read this package, so **where the two agree, the agreement is
evidence, not an echo.** This file records the cross-check, the corrections in both directions, and
what a designer should actually read.

**All numeric claims below were re-verified against the live files on 2026-08-17.**

---

## 1. Cross-check of the Cowork pass

Every quantitative claim in `design_target_state.md` that this session could test:

| Claim | Verdict |
|---|---|
| KTC snapshots contain **36 pick rows** — 2026/2027/2028 × Early/Mid/Late × rounds 1–4, as `{name, team:"FA", position:null, value}` | ✅ **Exact.** 36 rows, 36 distinct names, all `team: "FA"` |
| **473 of ~500** players appear in all eleven snapshots; **491** in ≥8 | ✅ **Exact.** 500 rows in the latest, 537 distinct names across the series |
| gamelogs: **6,357 game rows in 2025** | ✅ **Exact** |
| `passingEpa` + `passingCpoe` **100%** present for QB games with ≥10 attempts | ✅ **Exact** — 527/527 (2012), 544/544 (2019), 587/587 (2025) |
| `receivingEpa` **100%** for WR/TE games with ≥3 targets | ✅ **Exact** — 1773/1773, 2002/2002, 2131/2131 |
| `roster_positions` appears nowhere in `src/` | ✅ **Confirmed** — a real blocking dependency for the 2b matrix |
| `getLeagueDrafts` / `getDraftPicks` already exist in `src/api/sleeper.js` | ✅ **Confirmed** — the plumbing precedent is real |
| Five view-only guard tests, named exactly | ✅ **Confirmed** — `advStatsViewOnly`, `gameLogsViewOnly`, `outlookPositionStatsViewOnly`, `scheduleViewOnly`, `teamContextViewOnly` |
| `enrichmentLookup.js` has zero consumers anywhere in `src/` | ✅ **Confirmed** |
| `off_snp` 0% for 2012–2019 | ✅ **Confirmed** (matches this package's own check) |
| `usePlayerProfile` returns 30 keys; the modal destructures 13; 22 dark | ❌ **Understated.** Actually **35 returned / 12 destructured / 23 dark** |
| `computeKtcRecentDelta` recoverable from commit `3f55245` | ❌ **Off by one.** `3f55245` is the commit that *deleted* it. It lives at `3f55245^` (= `5b277b9`), `src/utils/ktcHistory.js:338` |

**Two corrections, both in the same direction as their argument** — the dark-data gap is slightly
larger than they said, and the recovery command needs a caret. Nothing material was wrong.

### The EPA coverage figure — both numbers are right

This package reported `passingEpa` at **95%** of QB-games; Cowork reported **100%**. Both are
correct at different filters, and the difference matters for design:

- **95%** = all QB-position game rows, unfiltered. The missing 5% are backups who took the field
  without attempting a pass.
- **100%** = QB-games with ≥10 attempts.

**Cowork's framing is the more useful one.** The gap is not missing data — it is games where the
metric is undefined because nothing happened. A design should show `—` there, not treat it as a
coverage weakness. Appendix A has been updated to carry both figures.

---

## 2. Corrections to *this* package (and to `docs/ui.md`)

- **`01-data-inventory.md` §4.3 called the depth-chart key `depthChart`.** The actual key
  `usePlayerProfile` returns is **`teamDepthChart`** — `depthChart` appears nowhere in the hook.
  This package inherited the error from `docs/ui.md`, which states *"`usePlayerProfile.js` still
  computes this as `depthChart`"*. **`docs/ui.md` is wrong and should be fixed** in whichever slice
  next touches that file. Cowork had it right.
- **`03-data-gaps.md` ranked routes-run as `INVESTIGATE`** with a note that it would "jump to rank
  2" if nflverse turned out to have it. Cowork actually checked. It does not. Superseded — see §4.
- **`03-data-gaps.md` ranked traded picks #2.** It is #1. See §4.

---

## 3. Where the two passes converge

Independently reached, which is the strongest signal in this whole package:

| Conclusion | Both agree |
|---|---|
| The app's core problem is that it **ingests far more than it shows** | ✅ |
| `nflGameLogs`, `teamContext` and `nflSchedule` have working loaders that **`App.jsx` never calls** — so lighting them up costs a call site, not an ingest project | ✅ |
| The **KTC series is healthy**, and the 30-day delta cut during 1b is buildable today | ✅ |
| **Player-level EPA is already ingested**, answering a question the research eval routes to a future sourcing session | ✅ |
| **Traded picks are reconstructable** and their absence makes roster value and concentration *wrong*, not merely incomplete | ✅ |
| **Pending trade offers are unavailable** — not deferred, unavailable | ✅ |
| **Build `2b` reduced** — scatter + supply/need matrix + selected panel; cut both prose panels, the deal-shaping blocks and the offer button | ✅ (identical cut list) |
| **Do not ship `2a` as designed**; harvest its "what changed" instinct as an event feed | ✅ |
| **A Teams surface** lighting `teamContext` is a cheap large win | ✅ |
| **`DEFAULT_ROUTE` stays `/market`** | ✅ |
| **Do not show WOPR**, despite the literature — the project's own backtest says it is collinearity-inflated | ✅ |
| **No verdict columns, no risk Low/Med/High, no invented confidence numbers** | ✅ |
| The **pop-up section-navigation problem** is the hardest open design question | ✅ (both raise it; neither solves it) |

---

## 4. Where they diverge, and the resolution

### 4.1 `2a` Decision desk — **resolved: kill, not defer**

This package said *defer, revisit when the engine exists and a season of grading has landed*.
Cowork said *kill*.

**Cowork is right.** Their third argument is the decisive one and this package under-weighted it:
the design's cards each carry a confidence readout (`conf 78`, `71`, `66`, `55`, `92`) on a meter,
**and the app computes no calibrated probability of anything.** Even with a marginal-value engine,
those numbers would be invented. "Defer" implies a future in which the design ships roughly as
drawn; that future does not exist, because the specific artefact is unbuildable independent of the
engine. Their fourth point compounds it: the verb tags are the `CALL` column that §4a.2 already cut
from Portfolio, and cutting it there while shipping a screen of it is incoherent.

→ **`README.md` §5.9 is superseded: kill.** What survives is `/changes`, which both passes describe
almost identically.

### 4.2 Routes run / YPRR — **resolved: do not build**

This package ranked it `INVESTIGATE` and flagged it as potentially jumping to rank 2. Cowork
checked properly:

- True routes run is proprietary (PFF; PlayerProfiler licenses it).
- nflverse **FTN charting** (2022+) is play-level with **no player identifiers** — useless as a
  per-player denominator.
- nflverse **participation data** (2023+, post-season only, no in-season refresh) does carry
  `offense_players` and would join via the existing crosswalk — but counting pass plays a player
  was on the field for yields **pass snaps, not routes**. It cannot distinguish a route from pass
  protection or a chip release.

→ **Settled: do not build, and do not label any approximation "YPRR."** The honest substitute
already exists at 100% coverage back to 2012: `receivingEpa` per target from gamelogs.

### 4.3 Traded picks — **resolved: rank 1, and cheaper than this package assumed**

Both passes independently identified picks as a high-value gap. Cowork found the piece this package
missed: **KTC pick values are already ingested** (§1). So the valuation half is solved the moment
ownership is known, and the reconstruction is mechanical — seed every roster with its own pick per
round per season, then overlay each `traded_picks` row.

→ **Promoted to rank 1** in `03-data-gaps.md`. One unauthenticated `GET` plus ~40 lines.

**The one honest gap remains open** and is a decision for Anton (§6, Q8): KTC prices Early/Mid/Late
separately, and which tier a future pick lands in depends on a finish nobody knows. Cowork
recommends showing a **range** (Late→Early) because it fabricates nothing; the cost is that a range
does not sum cleanly into a roster-value total.

### 4.4 What each pass has that the other does not

Not disagreements — coverage gaps. Both sets should survive into the design.

**Only in `design_target_state.md`:**
- **First-hand competitor observation.** KTC's player page carries value-history charts with
  1mo/3mo/6mo/1yr/All toggles, separate overall- and positional-rank history, and a **"Value
  Adjacent"** list of the players immediately above and below — the cheapest good idea on their
  site, because it converts an abstract number into "you'd have to give up roughly this." Their
  trade calculator reports **Value Dispersion** and **6-Month Value Span** — i.e. whether you are
  consolidating or spreading — which survives without a decision engine.
- **FantasyCalc's redraft/dynasty split.** Their public API returns `value`, `redraftValue` and
  `redraftDynastyValueDifference` keyed by `sleeperId`. **Neither pass developed this, and it is
  worth developing:** this app has both halves already — `projectedPPG` is win-now, `dynastyScore`
  is multi-year — so a "how much of this price is win-now vs future" read is derivable with no new
  data. Flagged as a new idea, not a recommendation.
- The `roster_positions` blocking dependency, the `getTradedPicks` plumbing precedent, and the
  35/12/23 hook-key gap.
- A sharper thesis line, adopted into `README.md` §2.

**Only in this package:**
- **Verified coverage across every family**, with the per-signal cliff list (`01-data-inventory.md`
  §5). Cowork verified the fields it cited; this file inventories what exists whether or not it is
  cited, which is what stops a designer proposing something unbuildable.
- **The cross-cutting systems** (`README.md` §6): the definition/tooltip system, the
  coverage-and-confidence encoding, one trend treatment, and empty states as a designed set.
  `design_target_state.md` does not cover these, and they are the parts that are *actually design
  work* rather than data placement. The tooltip system in particular is an explicit standing ask —
  the subsystem was deleted in Slice viii with "I will want tooltips back, but not these."
- **The research basis** (`02-research-basis.md`): the position-asymmetry finding (rushing metrics
  are structurally less predictable than receiving — so RB and WR columns must not carry equal
  visual confidence), RB/WR age-curve asymmetry against Portfolio's position-blind chart, the xFP
  concept, and the table of where the repo's own grading **overrides** the public literature.
- **Two surfaces Cowork does not propose:** a **Rookies** screen for the empty seasonal nav slot
  (§5.5), and the **model track record** (§5.10) — the one thing no competitor can retroactively
  copy, since it requires having banked snapshots for a year.
- **The dead-ACT-nav problem** (§5.7) and the **token-seam decision** (§11 Q2).

### 4.5 The shared weak spot

**Neither pass inspected Dynasty Daddy or Fantasy Points.** Cowork was blocked by client-side
rendering with no browser tooling; this package used reviews and documentation. Both competitive
reads are soft on those two specifically. If the competitive framing is load-bearing for the
design, that is the gap to close — and it is closable in an hour with a browser.

---

## 5. What the designer should read

`design_target_state.md` is **not superseded** and should not be merged away — it is the stronger
document on *what data goes where*, with per-element field citations. This package is stronger on
*what needs designing* and *what the numbers mean*.

Suggested order:

1. **`README.md`** §1–§4 — state of the app, thesis, target IA.
2. **`docs/design_target_state.md`** §7 — the surface-by-surface field-level spec.
3. **`README.md`** §6 — the cross-cutting systems, which exist nowhere else.
4. **`01-data-inventory.md`** §5–§6 — the coverage table and placement map, as a reality check on
   any proposed element.
5. **`02-research-basis.md`** §3 — the fifteen research-to-design instructions.
6. **This file** §4 — the resolved divergences, so nothing gets designed twice.

---

## 6. The merged open-question list

Both passes produced open questions. Deduplicated, with the recommendation each pass gave.

| # | Question | Recommendation | Source |
|---|---|---|---|
| Q1 | `DEFAULT_ROUTE` — does Portfolio reclaim the landing? | **Keep `/market`.** Revisit only if `/changes` ships | both agree |
| Q2 | The token seam — commit the app to dark-only, or derive light `--color-dp-*` values? | **Dark-only app-wide**, recolour chrome and League in the same round | this package |
| Q3 | Teams as a route or a pop-up tab? | **Both** — `/team/:abbr` route *and* a Context section in the pop-up | converged |
| Q4 | **Is the pop-up the right container for four tabs of dense charts?** Or does player detail become a real route with the pop-up as preview? | Keep the pop-up — *"never navigate to research"* is the strongest commitment 1b made. But both passes flag this as the hardest call, and neither is confident | **both — the top design question** |
| Q5 | When to build `/changes`, given 4 weeks of player-state history? | **Design now, build in phase 2.** The archive grows either way | both agree |
| Q6 | Is the model track record user-facing or a private diagnostic? | **User-facing** — no competitor can copy it retroactively | this package |
| Q7 | The dead ACT nav group — remove, or keep with an honest gate? | **Remove until real** | this package |
| Q8 | **How is an untraded future pick priced?** Early/Mid/Late depends on an unknown finish | **A range (Late→Early)** — fabricates nothing. Cost: a range does not sum cleanly into the roster-value tile, which changes a shipped headline number | Cowork |
| Q9 | **What is "above replacement"?** Blocks the 2b matrix | Undecided by both. Options: Nth-best at position where N = starters × 12 (needs `roster_positions` threaded through `App.jsx`); a fixed positional rank; or a value threshold. Each yields a different matrix | Cowork |
| Q10 | Should EPA be shown while grading is parked? Showing a metric the model ignores invites *"why doesn't the score reflect this?"* | **Yes, show it.** The display-only invariant answers it technically; §4a.1 answers it as product direction | Cowork raised; this package answers |

**Q4, Q8 and Q9 are the three that block design work.** The rest can be answered as the design
proceeds. §7 below narrows Q8 and Q9 substantially.

---

## 7. Gaps closed, 2026-08-17

Follow-up session. Five of the loose ends from §4.5 and §6 are now settled or narrowed.

### 7.1 The league is **superflex**, and the app is lineup-blind

The most consequential thing found in this pass, and neither research pass caught it.

**Verified** [live league config, `raw/-league-1312015497465716736.json`]: league `Dynasty 040`,
12 teams, `settings.type: 2` (dynasty), `pick_trading: 1`, `draft_rounds: 5`, taxi 4 / reserve 3, and

```
roster_positions: QB · RB · RB · WR · WR · WR · TE · FLEX · FLEX · SUPER_FLEX · BN ×18
```

So **10 starters, of which 3 slots are position-agnostic** (2 FLEX + 1 SUPER_FLEX) — 36 of the
league's 120 starting slots.

**The market side is correctly matched.** `lib/ktc.mjs` scrapes
`keeptradecut.com/dynasty-rankings?…&format=2`, and `format=2` is KTC's **superflex** value set. The
values corroborate it: Josh Allen 9997 sits level with Gibbs 9999 and Chase 9989 at the top of the
board, and six QBs clear 7000 — a superflex profile, not a 1QB one. **This is not a bug**; the
scraped format matches the league.

**The model side knows nothing about it.** `grep` for `SUPER_FLEX`, `superflex`, `FLEX` and
`roster_positions` across `src/` returns **nothing**. `POSITION_ORDER` is a flat
`['QB','RB','WR','TE','K','DEF']`. Every positional rank, percentile and dynasty label is computed
against a lineup-blind pool.

**Why it matters to the design, stated carefully:** the market half of the market-vs-model chip is
format-aware and the model half is not. Whether that actually biases `divergenceSignal` at QB is a
projection/grading question, not a design one — **it is not asserted here, and a first attempt to
quantify it from raw cross-position PPG was discarded as meaningless** (QBs out-score every position
per game by construction, which is exactly why the app uses positional percentiles). What *is* a
design fact: any surface that says "this player is worth X in your league" is currently saying it
without knowing your league starts up to two quarterbacks.

**A competitor has already productised this.** Dynasty Daddy ships a *League Format Tool* —
"identify positional advantages for your league by looking at historical quality starts,
opportunities, and spike weeks for your league's scoring settings" — and its Power Rankings
distinguish **overall value from starter value** (§7.4). Both are the format-awareness this app
lacks.

→ **Recommend adding this to the brief's constraints and to §5's Portfolio and League-map sections.**
It is also a candidate open question in its own right: *should the app become format-aware, and if
so does that change the dynasty score or only the display?*

### 7.2 Q9 "above replacement" — narrowed to one real decision

The blocker is not vagueness. With the real `roster_positions` in hand, replacement level per
position is fully determined **except** for how the 36 flex slots are allocated:

| Position | Dedicated starting slots, league-wide | Plus a share of… |
|---|---|---|
| QB | 12 | 12 SUPER_FLEX |
| RB | 24 | 24 FLEX + 12 SUPER_FLEX |
| WR | 36 | 24 FLEX + 12 SUPER_FLEX |
| TE | 12 | 24 FLEX + 12 SUPER_FLEX |

So "starters × 12" gives QB 12 / RB 24 / WR 36 / TE 12 as a **floor**, and the only judgment left is
how the flex pool is split. Two defensible answers: allocate flex slots **empirically** (by how
they are actually filled across the league) or **by expected value** (each flex goes to whichever
position's next-best player is worth most). In superflex the QB floor of 12 is clearly too shallow —
real superflex leagues start ~1.5–2 QBs, so QB replacement sits nearer rank 18–24.

**Still Anton's call**, but it is now a choice between two named methods, not an open-ended
definition. **Implementation note stands:** `App.jsx` must start threading
`selectedLeague.roster_positions` through, the way it already threads `scoring_settings`.

### 7.3 Q8 pick pricing — the endpoint is confirmed live, and there is a fifth-round problem

**`GET /v1/league/1312015497465716736/traded_picks` → HTTP 200, 23 rows** [live call, 2026-08-17].
Shape confirmed exactly as Cowork described:

```json
{ "round": 1, "season": "2026", "roster_id": 1, "owner_id": 6, "previous_owner_id": 11 }
```

Two implementation details worth having before design: **`season` is a string**, not an integer, and
the traded set spans **2026 (15 rows) and 2027 (8 rows)** across rounds 1–5, from 8 distinct
original owners. Reconstruction is confirmed viable.

**The new problem:** this league drafts **5 rounds** (`settings.draft_rounds: 5`) and three of the
23 traded picks are **round 5** — but **KTC prices only rounds 1–4** (§1: the 36 pick rows are
`2026/2027/2028 × Early/Mid/Late × rounds 1–4`). So a fifth-round pick is a real, tradeable,
ownership-known asset with **no market value available**.

→ This is a `PROVISIONAL(no-data)` case by the repo's own convention: render `—`, never zero. It
also means a roster-value total that includes picks is **incomplete by a known, nameable amount**,
which the design should be able to say out loud rather than hide.

### 7.4 Dynasty Daddy and Fantasy Points — the §4.5 weak spot, now first-hand

Both were fetched live this session. The earlier read of each was wrong in a different direction.

**Dynasty Daddy is far broader than "breadth over depth" suggested** — 18 tools, free, with real
scale behind them (2.69M leagues, 6.43M trades, 620k drafts, 98.2M draft picks indexed). The ones
that matter competitively:

| Tool | Why it matters here |
|---|---|
| **League Format Tool** | Positional advantage for *your* scoring settings, via historical quality starts, opportunities and spike weeks. **Directly the gap in §7.1.** |
| **Power Rankings — overall value *and* starter value** | The starter-value split *is* Q9, already productised |
| **Player Comparison Tool** | "Player metrics and value **through time**" — the trend dimension again, which this app computes and hides |
| **Trade Database** | 1M+ real trades from 200k leagues — a market signal neither this app nor KTC exposes in that form |
| **ADP Daddy** | Values derived from 620k real drafts with exponential-decay weighting — a second market opinion, which §Appendix C rank 8 wanted |
| **Fantasy Portfolio** | Player exposure **across** leagues. This app is single-league by design |
| Playoff Calculator | 10k-season simulation using elo + schedule + starting lineup |

**Fantasy Points is not a tool competitor at all.** It is a subscription **content** business —
expert articles, videos, podcasts, DFS projections and betting analysis, with "Fantasy Points Data"
as a separate paid product. It should be reclassified in `02-research-basis.md` §2.2: it competes
for attention and analysis, not for the roster-management job.

**Revised competitive read.** The claim "nobody connects on-field evidence to your league's
ownership map" **survives**, but it is narrower than stated: Dynasty Daddy connects *format and
market* to your league (format tool, starter value, power rankings) without deep on-field data;
PlayerProfiler has the on-field data with no league awareness. The unoccupied position is
specifically **per-game on-field evidence × your league's ownership and lineup rules** — and §7.1
shows this app currently has the first half and is blind to the second.

### 7.5 The win-now / future split — developed into a proposal

Cowork observed that FantasyCalc publishes `value`, `redraftValue` and
`redraftDynastyValueDifference` keyed by `sleeperId`, and that neither pass developed it. Developing
it:

**The app already has both halves.** `seasonProjections[id].projectedPPG` is a next-season
(win-now) quantity; `dynastyScore.score` is an explicitly multi-year one built from an age curve,
trajectory and years-from-peak. A ratio or difference between the two — normalised within position —
is a *"how much of this asset is next year versus the years after"* read, computed from data already
on every row, with **no new source and no new model**.

**Why it is worth designing:** it is the single most legible expression of the one thing dynasty
managers actually trade — time. It also composes with everything already on screen: a
contending roster wants win-now skew, a rebuilding one wants the inverse, and the Portfolio
concentration tile plus the 2b scatter both become readable through it.

**Two cautions.** It must be presented as a *composition* read, not a verdict — "72% of this
player's value is beyond next season" is a description; "sell him" is not. And the two inputs are
on different scales and different bases (`projectedPPG` is per-game points; `dynastyScore` is a
0–100 composite), so the normalisation is a real modelling choice and the raw ratio is meaningless.
**Recommend: a design element, gated on someone specifying the normalisation.** Not phase 1.

### 7.6 Still open

- **Q4 (the pop-up container) is untouched** and remains the top design question. Nothing in this
  session bears on it; it needs a designer's recommendation.
- **`docs/ui.md` fixed** — the `depthChart` → `teamDepthChart` error recorded in §2 is corrected in
  that file as of this session.
