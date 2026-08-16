# Appendix B — Why show this and not that

The evidence behind [`README.md`](README.md) §5. Two halves: **what the research says is worth
showing** (§1) and **what the competition already shows** (§2), then the design implications that
fall out of both (§3).

This synthesises three things: the repo's own research review
(`docs/nfl_prediction_research.docx`), the repo's own evaluation of the app against it
(`docs/prediction-research-eval.md`) and grading record (`docs/advstats-grading-findings.md`), and
external sources gathered 2026-08-16 (§4).

**One methodological warning up front, because it governs everything below.** The repo's own
grading work established that *a signal's correlation in isolation is not its incremental value
over a full feature set*. WOPR is the worked example: it reads as a top-tier receiver metric in the
literature, and the repo's backtest found it collinearity-inflated because it bundles target share,
which the model already captures through volume. **Nothing here should be read as "wire this into
the projection."** This appendix is about what earns a place *on screen*, which is a lower and
different bar — the repo's own doctrine explicitly separates the two tracks: *"Stats can be shown
even if they have no predictive value."*

---

## 1. What the research says

### 1.1 The stickiness table

Year-over-year correlation of a metric with itself is the standard proxy for "can I project this
forward". The best public numbers, from SumerSports' 2021–2025 panel of players with 100+ key snaps
in consecutive seasons, plus the repo's own review:

| Metric | Position | YoY r | Verdict |
|---|---|---|---|
| **Target share** | WR/TE | **≈0.70** | The stickiest thing in football. |
| **Carry share** | RB | ≈0.65 | Clearest RB volume predictor. |
| **EPA per attempt** | QB | ≈0.60 | Most predictive QB season metric — *but it is a team stat.* |
| **Yards per route run** | WR/TE | 0.51–0.60+ | Solid. **Expected YPRR is stickier (0.67)** than realised YPRR. |
| Sack avoidance | QB | ≈0.50 | Moderate. |
| Rushing yards | RB | ≈0.45 | Moderate. |
| Receiving yards (raw) | WR/TE | ≈0.40 | Weak — raw production is much less stable than the usage that produced it. |
| Tackled-for-loss rate | RB | ≈0.40 | Described as "really a stretch". |
| EPA per rushing attempt | RB | ~0 | **Negligible.** |
| **Touchdowns** | all | **≈0.25** | Near-random. |

Two things a designer should take from this table rather than from the individual numbers:

1. **Rushing is structurally less predictable than receiving.** "Rushing stats, across the board,
   have some of the lowest year-over-year correlations." A UI that presents RB and WR metrics with
   identical visual confidence is misleading. This argues for position-specific column sets — which
   the app already does — and against a single cross-position "efficiency score".
2. **The gap between usage metrics (0.65–0.70) and production metrics (0.25–0.45) is the whole
   game.** Usage predicts usage; production is usage plus noise. Any hierarchy of what to show
   should put share-of-team ahead of yards, and yards ahead of touchdowns.

### 1.2 Level and trend are different things, and the app only shows one

The research anchors on the *level* of prior-year target/carry share. The app computes the level
(`computeHistoricalShares`) and then feeds only the *trend* (`computeShareTrend`) into the model,
anchoring instead on recency-weighted PPG.

That is a defensible modelling choice and the repo has correctly routed the question to grading
rather than changing it. **But for display it is simply a gap:** the single most predictive
quantity in the sport is computed on every row (`signals.targetShare`, `signals.carryShare`,
`signals.shareHistory` — five seasons of it) and appears on screen only as a trend arrow.

→ *Show the level. Show the five-season series. Show the trend as a property of the series, not as
a replacement for it.* (Brief §5.2, Usage & efficiency.)

### 1.3 Rookies: production and draft capital, nothing else

This is the most settled finding in the pre-draft literature and the app is already textbook-correct:

- Combine drills explain **<2% of career outcome variance** individually; linear models on combine
  data explain ~3–4% of in-game performance. ML on combine data predicts *whether a player makes
  the NFL* at 83% accuracy and **fails entirely** at predicting career success.
- **College dominator rating** — share of team yards and TDs — is a statistically valid predictor
  for WR and QB. Its known limitation is that it ignores strength of schedule.
- **Draft capital** is the market's aggregated scouting opinion and carries real signal.
- Cognitive testing: the Wonderlic failed repeatedly and was discontinued in 2022. Newer
  instruments (AIQ) show early promise for QBs specifically but are not publicly available data.

The app uses dominator + actual NFL draft slot and **zero** combine inputs. It also correctly
demoted `breakoutAgeFactor` to capture-only.

→ *Design a Rookies surface out of production and capital. Do not draw an athleticism radar.*
(Brief §5.5, §10.)

### 1.4 Environment instability is the single biggest disruptor

Stated in the research as bluntly as anything in it: *"the position of quarterback creates enormous
variance for every other offensive player — a quarterback change is the single biggest disruptor of
receiver and running back production."* Full-season guidance is to adjust heavily for **new
quarterback, new offensive coordinator, major offensive line changes, and injury history**.

The app models QB *quality* and the player's *own* team change. It does not model QB change, OC
change, or OL change — and its own evaluation ranks this the second-highest-priority gap in the
system.

This is also why EPA carries an asterisk everywhere it appears: EPA is a **team** statistic. A QB's
EPA/attempt is partly his line, his scheme, and his receivers. That is an argument for showing EPA
*next to* team context, not instead of it.

→ *This is the case for the Teams surface and the Environment section.* (Brief §3.1, §5.3.)

### 1.5 Availability is the strongest season-long predictor

"Availability is the best ability" is the research maxim, and it holds: health and role stability
drive season outcomes more than any efficiency metric.

The app models this twice — projected games with injury-shape penalties, and a dynasty reliability
sub-score — but weights reliability at **10%** of the dynasty score, and displays availability as a
single `±SD` figure and a projected-games number.

Note the app's own honest caveat: `projectedPPG` is per-game and deliberately excludes availability
(correct — per-game rate and season total are different quantities). But that means **the headline
number a user sees says nothing about whether the player will be on the field**, and the season
total that does is not the headline.

→ *Availability deserves its own section with real history, not a scalar.* (Brief §5.2.)

### 1.6 Touchdowns are noise; red-zone usage is the structural signal

TD YoY correlation ≈0.25. Red-zone usage rate is the better structural signal for the same
underlying thing.

The app is *ahead* of the research here: it actively **penalises** TD-reliant production
(`tdRelianceFactor` ×0.93, dynasty reliability ×0.90) and uses two orthogonal red-zone signals
(own-rate and team-share). This is the system's single best agreement with best evidence.

**And none of it is visible.** `tdDependency`, `isTdReliant`, `rzUsageRate`, `rzUsageCategory`,
`teamRzShare` are all computed and none reach the screen. A user looking at a player who scored 14
TDs has no way to see that the model discounted him for it.

→ *TD reliance and red-zone usage are prime candidates for the pop-up's "why next season" panel
and for a Market column.* (Brief §5.1, §5.2.)

### 1.7 Age curves — the shape of dynasty value

Not in the repo's research doc, gathered externally, and directly relevant because Portfolio's
central visual is a value-by-age-band chart:

- **RB:** peak 23–26; **93.8% of peak RB seasons occur before age 29**; most decline 28–30;
  historical trade data shows RBs lose **35–50% of market value within 12 months of their peak
  season**; in-prime decline rate ≈15%/yr.
- **WR:** peak ≈24–28 (average peak ≈27); heaviest decline concentration 30–32; many remain elite
  into their early 30s; in-prime decline ≈10%/yr; **peak trade value held ~3.5–4 years longer than
  RBs.**

The app already computes per-position empirical age curves from its own data and exposes
`peakAge` / `yearsFromPeak` / `isLateCareer` per player — a better instrument than the league-wide
rules of thumb above, because it is fitted to the app's own scoring basis.

**But Portfolio's age-band chart is position-blind** (21–23 / 24–25 / 26–28 / 29–30 / 31+ with
fixed appreciating/peak/depreciating colouring), while the Holdings `HORIZON` pill is
position-relative. The repo documents this inconsistency as deliberate and defends it: aggregating
*value* across a roster is a position-blind question. That defence is sound, but the two will
visibly disagree for individual players, and the research above says the disagreement is largest
exactly where it matters most — a 29-year-old RB and a 29-year-old WR are not remotely the same
asset.

→ *Worth a design decision: either make the chart position-aware, or make the two views'
different questions legible so the disagreement reads as intentional.* (Brief §5.4.)

### 1.8 The ceiling, and why it is a design constraint

Every strand of the research converges on the same limit: **the best models explain 50–70% of
season variance, and far less over shorter windows.** Football is a weak-link sport — 22 players
interact on every snap, games are ~60 offensive plays, and injuries break the patterns usage
metrics rely on. A 0.70 correlation, modest in baseball, is among the highest stable correlations
observed in football.

The research's own framing is worth quoting into the design: *"Uncertainty is not a failure of the
models; it is a genuine property of the sport."*

→ *This is the single strongest argument for the brief's thesis.* A product whose loudest element
is a confident verdict is misrepresenting a domain with a 50–70% ceiling. A product whose loudest
elements are the inputs, with their coverage and confidence attached, is telling the truth.
(Brief §2, §6.2.)

### 1.9 Where the repo's own findings override the literature

Recorded because a designer reading the public research would otherwise draw the wrong conclusions:

| Literature says | The repo's grading found | Consequence |
|---|---|---|
| **WOPR** (1.5×target share + 0.7×air-yards share) is a top-tier receiver opportunity metric; >0.60 elite | **Collinearity-inflated.** It contains target share, which the model already captures via volume. The orthogonal component is `air_yards_share`, not WOPR. | Show air-yards share. **Do not make WOPR a headline metric.** |
| Air-yards metrics are broadly useful for receivers | For **RBs**, `air_yards_share`/`racr` are frequently null or negative (behind-LOS targets) — **noise**. `target_share` is the meaningful RB metric. | Position-specific columns, not a shared receiver block. |
| Target share is the stickiest WR/TE metric | For WR/TE, `target_share` ≈ overall share (r≈0.9) — **redundant with volume** *for modelling purposes*. It remains the right thing to *display*. | Keep showing it; don't imply it is adding model signal. |
| — | Validated as genuinely orthogonal and marked "activate": **WR `air_yards_share` (β +0.218), TE `air_yards_share` (β +0.305), RB `target_share` (β +0.303)** | These three are the metrics with the strongest claim to prominence. |

### 1.10 One metric the app could derive and does not: expected fantasy points

Not in the repo at all, worth flagging because the components are already in the store.

**xFP** estimates what a player *should* have scored given the volume, depth and field position of
his opportunities — using historical completion, success and TD rates bucketed by air yards and
yard line. Comparing xFP to actual points is the standard way to separate real production from
lucky production, and it is how the analytics-first outlets (Fantasy Points, Sharp Football, ESPN,
Establish The Run) identify regression candidates.

The app has the inputs: per-target air yards, target-depth buckets (`rec_0_4` … `rec_40p`),
red-zone targets and carries, and per-game data 2012–2025. It does not have the historical
value-per-opportunity model, which would have to be fitted.

→ *Not a phase-1 item — it is a modelling project, not a rendering job. But it is the most
valuable derived metric the app is missing, and it fits the thesis exactly: it is an
opportunity-vs-outcome comparison, not a verdict.* (Appendix C, rank 5.)

---

## 2. What the competition shows

### 2.1 The category, in one paragraph

Every mainstream dynasty tool does the same three things: produce an **absolute** value per player,
let you sync your league, and add a package tax when you build a trade. KeepTradeCut crowdsources
that value from user comparisons (24M+ data points). FantasyCalc derives it from real trades.
Dynasty Daddy and Fantasy Draft Pros compute proprietary values with format adjustments.
FantasyPros and DLF layer expert rankings on top. **Nobody prices a player to your specific roster,
your competitive window, and what else occupies that player's position and age band** — a gap the
repo's own product doc identified and which still holds.

### 2.2 Tool by tool, with stated weaknesses

Weaknesses are as reported by reviewers, not editorialised:

| Tool | What it does well | Reported weakness |
|---|---|---|
| **KeepTradeCut** | Free; crowdsourced values at enormous sample; the de-facto market price; superflex/1QB | Values fluctuate; **no league sync**; *"sometimes leans toward short-term sentiment"* |
| **FantasyCalc** | Free; values derived from **real executed trades**; superflex | *"Simplistic"*; **lacks contextual analysis**; *"best used with other tools"* |
| **Dynasty Daddy** | Free; broad tool suite — league analyzer, trade calculator, rookie guides, personalised rankings, real-trade explorer | Breadth over depth; the user still does the synthesis |
| **Fantasy Draft Pros** | Proprietary values with **age-curve, superflex, TE-premium, scoring-format adjustments**; league import; power rankings; counter-offer suggestions | Values are a black box |
| **DLF Trade Analyzer** | Blends market value, ADP, rankings and trends; includes picks; league sync | Slow search; **"lacks definitive advice"** |
| **FantasyPros** | Expert rankings integrated with full roster/league context; trade finder surfaces mutually beneficial deals | Expert-consensus-driven rather than model-driven |
| **PlayerProfiler** | The closest thing to a *data* competitor: opportunity share, target rate (targets per route run), college dominator, breakout age, production premium, evaded tackles, contested-catch rate, mobile-optimised player snapshots | Redraft/best-ball oriented; player-page-first, no portfolio or league layer; much of the good data is paywalled |

### 2.3 What nobody does

Six things, in rough order of how defensible each would be:

1. **Show its own track record.** No dynasty tool publishes how accurate its past projections were.
   Retroactively impossible — you have to have been banking snapshots. The repo has 26 of them and
   a grading harness. *(Brief §5.10.)*
2. **Price to your roster and window.** The marginal-value thesis. Unbuilt here too, but it is the
   category's largest unsolved problem and it is worth not designing around as if it were solved.
3. **Show the environment alongside the player.** Team-context data is common in *analytics* tools
   (PROE and pace are standard at Sumer, Sharp, FantasyPoints) and essentially absent from *dynasty
   valuation* tools. The overlap is empty. *(Brief §5.3.)*
4. **Make coverage and confidence visible.** Every tool renders a 15-year metric and a 3-month
   metric with identical authority. *(Brief §6.2.)*
5. **Show the working.** KTC's own FAQ concedes its number is at best a gut check; none of them
   decompose their value into weighted components you can inspect. The app already does this in the
   pop-up and it is genuinely rare. *(Brief §5.2, "full working".)*
6. **Treat the league as a map.** DLF and Dynasty Daddy have league analyzers; none plot every asset
   in the league against age and value so you can see the fit. *(Brief §5.8.)*

**The honest read on positioning:** this app will never beat KTC on market value — KTC *is* the
market. It can beat everyone on *explaining* a player, because the explanation is the thing they
have all chosen not to build.

---

## 3. Design implications — the bridge to the brief

Each of these is a research conclusion turned into a UI instruction.

| # | Research conclusion | Design instruction | Brief §|
|---|---|---|---|
| 1 | 50–70% variance ceiling; uncertainty is intrinsic | Evidence surface, not oracle. No confident per-player verdicts. | §2, §10 |
| 2 | Usage (0.65–0.70) ≫ production (0.25–0.45) | Rank the visual hierarchy: share-of-team → yards → touchdowns. | §5.1, §5.2 |
| 3 | The *level* of share is the anchor, not just the trend | Show the multi-season share series, not an arrow. | §5.2 |
| 4 | Rushing is structurally unpredictable; signal is position-specific | Position-specific column sets; never one cross-position efficiency score. | §5.1 |
| 5 | Team context is the biggest disruptor; EPA is a team stat | Teams as a first-class surface; environment beside every player. | §3.1, §5.3 |
| 6 | Availability is the strongest season-long predictor | Availability gets a section with history, not a scalar. | §5.2 |
| 7 | TDs ≈ random; RZ usage is the structural substitute | Surface TD-reliance and red-zone rate; never headline raw TDs. | §5.1, §5.2 |
| 8 | RB and WR age curves differ sharply (93.8% of RB peaks before 29) | Make the position-blind chart vs position-relative pill distinction legible. | §5.4 |
| 9 | Combine drills <2% of variance | No athleticism visualisations, ever. | §5.5, §10 |
| 10 | Dominator + draft capital are the only defensible rookie inputs | Rookies surface built on exactly those two. | §5.5 |
| 11 | Opponent quality / Vegas lines are 1-week signals | Schedule as game-log context only; no SoS badge. | §5.2, §10 |
| 12 | WOPR is collinearity-inflated; air-yards share is the orthogonal signal | Air-yards share gets the prominence; WOPR does not. | §5.1 |
| 13 | Competitors' universal weakness is "no context, no explanation" | The explanation *is* the product. Invest the design budget there. | §5.2 |
| 14 | Nobody shows a track record | Design the shape of it now even though the data lands 2027. | §5.10 |
| 15 | Progressive disclosure is the standard answer for dense financial UIs — number → breakdown → raw → export | Applies directly to the pop-up's section problem: headline tile → component bars → full `factors` working. | §5.2, §6.1 |

---

## 4. Sources

**In-repo (read this session):**
`docs/nfl_prediction_research.docx` · `docs/prediction-research-eval.md` ·
`docs/advstats-grading-findings.md` · `docs/signal-registry.md` ·
`docs/dynasty-decision-engine-design.md` · `sleeper-dashboard-data/data-catalog.md`

**External (gathered 2026-08-16):**

- [Sticky Football Stats: Predictive NFL Metrics — SumerSports](https://sumersports.com/the-zone/sticky-football-stats-predictive-nfl-metrics/)
- [Revisiting Yards Per Route Run — SumerSports](https://sumersports.com/the-zone/revisiting-yards-per-route-run/)
- [Best Dynasty Fantasy Football Trade Tools (2026) — FantasyPros](https://www.fantasypros.com/2026/05/best-dynasty-fantasy-football-trade-tools/)
- [Dynasty Daddy](https://dynasty-daddy.com/) · [KeepTradeCut Dynasty Rankings](https://keeptradecut.com/dynasty-rankings) · [Fantasy Draft Pros](https://fantasydraftpros.com/)
- [Advanced Stats Glossary — PlayerProfiler](https://www.playerprofiler.com/terms-glossary/)
- [Meet the Metric: Target Share vs Target Rate — PlayerProfiler](https://www.playerprofiler.com/article/meet-the-metric-target-share-vs-target-rate/)
- [Expected Fantasy Points Explained — Sharp Football Analysis](https://www.sharpfootballanalysis.com/fantasy/expected-fantasy-points/)
- [Expected fantasy points (xFP) 2025 WR leaderboard — ESPN](https://www.espn.com/fantasy/football/story/_/id/46168948/fantasy-football-2025-expected-fantasy-points-xfp-wr)
- [2025 Fantasy Regression Candidates — Fantasy Points](https://www.fantasypoints.com/nfl/articles/2025/fantasy-regression-candidates)
- [Dynasty Lifecycles: Age Cliff Concerns — The Fantasy Footballers](https://www.thefantasyfootballers.com/dynasty/dynasty-lifecycles-players-with-age-cliff-concerns-for-2025/)
- [When to Expect an Elite Wide Receiver to Decline — Footballguys](https://www.footballguys.com/article/2025-when-to-expect-an-elite-wide-receiver-to-decline-fantasy-football)
- [Production Curves: Breakouts, Prime Years, and Falloffs by Age — 4for4](https://www.4for4.com/2025/preseason/production-curves-positional-breakouts-prime-years-and-falloffs-age)
- [Roster Equity and Peak Ages — Roto Street Journal](https://www.rotostreetjournal.com/2026/07/18/dynasty-fantasy-football-strategy-using-roster-equity-and-peak-ages-to-build-monster-long-term-teams/)
- [Fintech Dashboard Design Patterns — WANDR](https://www.wandr.studio/blog/fintech-dashboard-design)
- [UX Strategies for Real-Time Dashboards — Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)
- [Dashboard Design Principles — UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
