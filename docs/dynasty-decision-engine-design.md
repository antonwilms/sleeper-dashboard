# Dynasty Decision Engine — Product Design Document *(Ideal Framework)*

*A strategic blueprint for what a dynasty decision-support product **should be** — used to evaluate and improve the Sleeper Dashboard against an ideal, not a description of what the current app can build.*

> **How to read this — important.** This is an **ideal framework**: a north star for what the product should become, deliberately **not** bounded by what the current backendless React SPA can build today. The current architecture appears in exactly **one** place — the *Ideal vs. Current* gap section — and there it is the *delta to improve against*, never a reason to remove a capability from the vision.
>
> Two kinds of exclusion appear below, and they are kept rigorously distinct:
> - **Excluded on the merits** — no decision value, no empirical support (per the project's own `advstats-grading-findings.md`), or wrong for dynasty as a domain. These stay out *at any architecture*.
> - **Not yet supported by the current stack** — these are *in* the framework, with the infrastructure they'd require noted as build-out, not as a ceiling.
>
> The discipline is unchanged from a constrained design: **maximize decision value, not features.** An ideal framework is a sharper target, not a feature dump — everything below still has to earn its place by improving a hold / sell / trade / draft decision.

---

## Executive Summary

Every dynasty tool on the market — KeepTradeCut, Dynasty Daddy, Dynasty Nerds, Draft Sharks, Dynasty Scout — does the same three things: ingests or crowdsources an **absolute** value for each player, lets you sync your league, and adds a "package tax" when you build a trade. KTC's own FAQ admits this is at best a gut check, because value is owner-, roster-, and window-specific and a single number can't capture that. Dynasty Nerds gets closest with a binary "Dynasty / Contender" toggle. **Nobody prices a player to your specific roster, given your competitive window and what else occupies that player's position and age band.**

That is the core of the ideal product: a **roster-phase-conditioned marginal-value engine**, wrapped in a transparency layer that shows its work. It is the single largest *unsolved decision-value gap* in the category. (It is also, conveniently, mostly buildable on the current stack — but that's a sequencing bonus, not the reason it's central. It would be the centerpiece even if it required a full rebuild.)

The full ideal is larger than that engine, and the previous version of this document wrongly shrank it to fit the current architecture. The complete framework also includes:

- **Real-time awareness of dynasty-relevant events** — injuries, role/depth-chart/coaching changes — because these are exactly what *open* buy-low and sell-high windows. (This is distinct from DFS-style betting-line edges, which genuinely *are* low-value for dynasty — see Non-Goals.)
- **Proactive guidance** — the product reaches you when something material changes, rather than waiting for you to remember to check.
- **A genuine outcome-feedback loop** — realized outcomes recalibrating the models and surfacing where you (and the model) systematically err.
- **Account-backed, cross-device personal calibration** — your decision history as a durable, syncable asset.

Several of those require infrastructure the current app lacks (a backend, real-time ingest, accounts, a calibration pipeline). That is not a reason to omit them — it is precisely what this framework exists to justify building toward, *when* the decision value of each warrants it.

Three principles govern everything, and none depends on architecture:

1. **Marginal, not absolute.** Value is relative to your roster and your window. This is the product's reason to exist.
2. **Honest, not precise.** Inherit the findings file's humility, not unearned confidence. Credibility comes from showing why a number is what it is and how confident it is — a moat, since every competitor is a black box.
3. **Decisions, not data.** A capability earns its place only if it changes a hold / sell / trade / draft decision. Stats with viewing value can be displayed; they may never silently move a projection.

---

## Product Vision

A front-office operations system for managing a multi-season fantasy roster as an asset portfolio under uncertainty — one that watches the league for you, tells you (for *your* roster and *your* window) what to do next and why, learns from how its calls actually turn out, and is honest about how sure it is.

Not a stats dashboard. Not a chatbot. A decision engine that surfaces a short, ranked list of the highest-leverage moves available right now, each one defensible down to the factors that produced it, each one informed by the most current information available about the players involved.

---

## Product Goals

1. **Compute marginal value** — what each player is worth *to this roster*, not in the abstract. The headline differentiator.
2. **Classify roster phase** and let that classification change the output of every other model, not merely annotate it.
3. **Surface the edge** — wherever the model and the market disagree, expose the gap, its direction, and its magnitude. The buy-low/sell-high primitive.
4. **React to material events fast** — capture injuries, role changes, and news as they happen, because that's when mispricings appear and windows open.
5. **Guide proactively** — tell the manager *when* a decision becomes available, not just *if* they think to look.
6. **Quantify and show uncertainty** — never present a value or projection as a bare point estimate without a confidence signal.
7. **Be transparent** — every number traces back to the factors that produced it.
8. **Learn from outcomes** — close the loop so the models improve from realized results and the product knows where its own and the manager's judgment diverge.

---

## Explicit Non-Goals

These are genuine non-goals — excluded on the merits, domain, or strategic focus, **not** because of the current stack. (Capabilities excluded only by today's architecture are *not* here; they're in the framework, in *Ideal vs. Current*.)

- **Not a DFS or sports-betting product.** Chasing in-game betting edges, or optimizing weekly lineups *for their own sake* (the DFS game), is a different product with a different time horizon — dynasty value is won on *asset* decisions over months, and that asset-decision core is the moat and the thing built first. This is **distinct from** helping a manager set their **own** dynasty roster's weekly lineup, which is a legitimate *second* management job the product does intend to serve — **deferred** until after the dynasty core and supported by the in-season production model (see Core Jobs To Be Done #6). The line: the own-roster start/sit surface is deferred-not-rejected; DFS/betting-as-the-point is rejected outright.
- **Not a content, community, or media platform.** Dynasty Nerds' real moat is its community and film room. Different business. Compete on decision quality, not engagement.
- **Not chasing the hot-takes content consumer.** The product serves managers who want to *decide better*, not fans who want opinions to argue about.
- **Not a maximal-stat surface.** Coverage for its own sake is bloat. Display only what aids a decision or has genuine standalone viewing value. This is a display-discipline rule, and it holds at any scale.

Two items that the *previous* draft wrongly listed as non-goals, corrected here:
- **Broad multi-platform sync is not a non-goal** — it's table-stakes breadth, valuable to users, just not a *differentiator*. It belongs in the ideal; it's sequenced, not skipped.
- **An independent market-value signal is not forbidden** — consuming a third-party crowdsource is the pragmatic source, but owning the market signal (to reduce third-party dependence and bias) is a legitimate long-term ideal. It's hard (network effects), not undesirable.

---

## User Archetypes

Three, in priority order. Design for the first two.

**1. The Optimizer (primary).** Plays in one to three competitive leagues, takes it seriously, already uses KTC and maybe a spreadsheet, suspects the market is exploitable but lacks the time to model it. Wants an edge and wants to understand it — distrusts black boxes. The entire reason the transparency layer is non-negotiable. *Most of the value accrues here.*

**2. The Portfolio Manager (primary).** Plays in several leagues, thinks in windows and asset allocation, makes frequent moves, and feels the cognitive load of tracking age bands and sell windows across rosters. Wants the synthesis layer — the portfolio view, the phase classifier, the cross-league decision log — more than any single-player stat.

**3. The Casual-Serious (secondary, do not over-index).** Enjoys dynasty, wants better-than-gut decisions, won't read a methodology page. Benefits from the same engine with a simpler surface. Serve them with good defaults and optional explanations, not by dumbing down the model.

The archetype this product explicitly does **not** chase: the content consumer who wants film breakdowns and hot takes. Different company.

---

## Core Jobs To Be Done

Descending order of frequency × stakes — which is also the order to optimize around:

1. **"Should I hold, sell, or cut this player?"** — the continuous, highest-frequency decision. The ideal product asks it *continuously, for every asset*, and proactively flags when the answer changes.
2. **"Is this trade good for me?"** — high stakes, lower frequency. Where the marginal-value wedge cashes out: not "fair in the abstract" but "good *for my roster after the swap*."
3. **"Where is the market wrong right now?"** — the buy-low / sell-high hunt; the highest skill-expression act, and the one most amplified by fast event awareness.
4. **"Is my roster built correctly for my window?"** — age-band exposure, positional concentration, window timing.
5. **"Which rookies should I target, and how high?"** — seasonal, high stakes, currently dominated by narrative and noise.
6. **"Who do I start this week?"** *(the second management job — own-roster, deferred)* — setting the user's **own** weekly lineup. Lower dynasty stakes than the asset decisions above, so it is **built after the dynasty core**, not before — but it is a real job the product intends to serve (supported by the in-season production model), not a redraft afterthought. The DFS-style *optimizer for its own sake* remains out (see Explicit Non-Goals); this is the manager's own roster.

---

## Decision Framework For Dynasty Managers

Every asset decision reduces to a three-part test (the ideas doc's strongest operational contribution, §9.5, and the spine of the product):

1. **Age-curve position** — where does this player sit relative to position-specific peak, and how much runway is left?
2. **Market vs. model** — is the current price above, at, or below the model's value? (The sell-high/buy-low signal, *independent of your roster*.)
3. **Fit with roster phase** — does this player's age/value profile match what your current phase should be optimizing for, *independent of whether he's good in the abstract*?

The third test is the one intuition skips. "Good and undervalued" passes tests one and two and feels complete; it's two-thirds of an argument. An undervalued 28-year-old RB on a rebuilding roster is still a sell. **The product's core job is to force test three into every recommendation** — it's the one humans omit, so it's the one with the most edge.

---

## Information Architecture

The home screen is a ranked list of *actions*, not a wall of data. Both obvious alternatives fail: a dashboard buries signal in noise (the Bloomberg-terminal failure mode), and a chatbot is high-friction for repeatable, structured, loggable decisions.

In the ideal, that action surface is **proactive** — it reaches the manager when a material change creates a decision — *and* it presents a computed, ranked list whenever opened. Being told *when* beats having to remember to check. (Where no notification channel exists, the surface degrades gracefully to compute-on-open; that degradation is an implementation state, not the design.)

The causal network from the ideas doc (§5) holds and should be honored architecturally: roster construction is the synthesis layer; trade evaluation outputs roster changes re-evaluated holistically; recent performance and events generate the signal that surfaces buy-low/sell-high; rookie drafting is roster construction with a different asset class. Shared state and models, not siloed features.

---

## Recommended Navigation Structure

Six surfaces, ranked deliberately.

1. **The Board** *(home)* — ranked, proactive actions for your roster.
2. **Roster / Portfolio** — the synthesis layer: phase, age-band exposure, hold/sell/cut, decision log.
3. **Trade** — marginal-, phase-aware trade evaluator.
4. **Player** — detail, value decomposition, confidence, age-curve position, event history.
5. **Rookies / Draft** *(seasonal)* — analytics-led prospect board mapped to your needs.
6. **Explore** *(utility)* — sortable, filterable league-wide research table.

(Full interaction/IA treatment lives in the companion frontend doc; this section fixes the surface set.)

---

## Core Screens

Each surface, by *purpose · questions answered · required data · functionality · why it exists*.

### 1. The Board (home)
**Purpose.** Answer "what should I do right now?" in seconds, ranked and defensible — and surface it proactively when events demand.
**Questions.** What are my highest-leverage moves? What just changed for players I own? Is my roster structurally healthy?
**Required data.** Roster; market values; computed dynasty values; phase; marginal values; age-curve positions; **and a real-time event feed** (injuries, role/depth/coaching changes) in the full ideal.
**Functionality.** ~5 ranked opportunity cards (sell-high, buy-low, roster-health), each with the move, the edge magnitude, a one-line *why* expandable to the full decomposition, and a route into the relevant tool. In the ideal, material events trigger a proactive alert ("a player you own was just ruled out for the season; here's the value impact and the sell/hold read"), designed to be *material-only and explainable* so it informs rather than nags.
**Why it exists.** It's the product. Every competitor makes you initiate; this initiates for you, composing the three things only this product computes together (marginal value, phase, market-vs-model) and acting on the freshest information available.

### 2. Roster / Portfolio
**Purpose.** Answer "is my roster built correctly for my window?"
**Questions.** What's my phase, and why? Where is my expected production concentrated by position and age? Where am I fragile? Which assets fail the three-part test?
**Required data.** Roster; per-player value, age, position; age-curve models; phase classifier output (ideally informed by an empirical season/playoff simulation); marginal values.
**Functionality.** Phase classification stated plainly, **overridable**, allowed to say *"Transitional — ambiguous, here's why."* An age-band exposure heatmap (production share by position × age band) that makes concentration risk legible. A hold/sell/cut table applying the three-part test continuously, sortable by which test each player fails. The decision log lives here.
**Why it exists.** It operationalizes the central thesis (marginal + phase) into one screen and is home to the Portfolio Manager.

### 3. Trade
**Purpose.** Answer "is this trade good *for me*?"
**Questions.** Does this improve my roster given my phase and existing assets?
**Required data.** Both sides' assets; market and model values; *your* post-trade roster; phase; marginal values; age-band exposure before/after.
**Functionality.** Evaluate the post-trade roster holistically. Surface the marginal read (what you receive is worth X *to you*; what you give is worth Y). **Show the divergence from the market explicitly** ("market: even; for your roster & window: clear win"). Show structural consequences, not just point deltas.
**Why it exists.** Highest-stakes recurring decision and the proof of the wedge. Every competitor sums absolute values and taxes packages; none evaluates against the roster the trade lands on.

### 4. Player
**Purpose.** Answer "what is this player worth, and why, and how sure are we?"
**Questions.** Absolute and marginal value? Age-curve position? Market over/under-pricing? What's driving the number? How confident? What recently happened to him?
**Required data.** Value (absolute + marginal); projected production + confidence; market value + trend; age-curve position; factor decomposition; activated advstats (position-specific); **event/news history** in the full ideal.
**Functionality.** Value decomposition ("why"); confidence signal; market-vs-model with trend; age-curve marker; a timeline of material events and how each moved value.
**Why it exists.** The trust anchor and the most visible differentiator from opaque crowdsource/projection competitors.

### 5. Rookies / Draft *(seasonal)*
**Purpose.** Answer "which incoming players should I target, and how high?"
**Questions.** Who projects well on *validated* signals (not narrative)? How do prospects map to my needs and window?
**Required data.** Draft capital; college dominator rating; breakout age; landing spot; market rookie values; roster needs.
**Functionality.** Prospect board ranked on draft capital + dominator + breakout age, mapped to roster gaps and window (rebuilder and contender see different boards). No narrative/film-grade scoring as a scored input.
**Why it exists.** High-stakes and currently dominated by the eye test and recency bias — the systematic errors the product exists to correct.

### 6. Explore *(utility)*
**Purpose.** Free-form research — the sortable, filterable league-wide table.
**Functionality.** Sort/filter every player on any metric; the home of view-only stats (snap share, route participation, raw target share, SoS) — visible for research, never wired into a value.
**Why it exists.** The Optimizer wants raw access sometimes; it's also where view-only stats belong, keeping them out of the decision surfaces.

---

## Metrics Framework

Two principles from `advstats-grading-findings.md` govern this, and both are *evidence-based, not architecture-based*: (a) a metric's **viewing value and projection value are different things**, and the served data is the source of truth for both; (b) **signal is position-specific** — WR/TE derive value from *depth of role* (`air_yards_share`), RB from *existence of a receiving role* (`target_share`).

### Must-Have Metrics *(decision-moving; earn a place in the model)*
| Metric | Why it earns its place |
|---|---|
| **Market value** (the price) | The benchmark the model is measured against. |
| **Computed dynasty value** (present-value) | The model's price; the core output. |
| **Market-vs-model delta** | The edge — the buy-low/sell-high primitive. |
| **Marginal value** (worth-to-this-roster) | The differentiator. No competitor computes it. |
| **Roster phase** | The context that changes every other recommendation. |
| **Age-curve position** (position-specific) | Runway — the biggest driver of value trajectory. |
| **Projected production** | The input the dynasty value discounts forward. |
| **Confidence tier / range** | Uncertainty as a first-class input. |
| **Material events** (injury, role, depth, coaching) | Open and close mispricing windows; high decision value. *(Requires real-time ingest — see Ideal vs. Current.)* |
| **Draft capital** *(rookies)* | One of the strongest documented rookie predictors; systematically underweighted by managers. |
| **College dominator rating + breakout age** *(rookies)* | Defensible predictors, strongest for WR. |
| **WR/TE `air_yards_share`; RB `target_share`** | The only advstats the project's own backtest validated as incrementally predictive — injected as an *incremental* adjustment, per-position, never raw (findings §4.7). |

### Nice-To-Have Metrics *(genuine viewing value; not model inputs)*
| Metric | Why view-only |
|---|---|
| Snap share, route participation, raw target share | Useful to *see* role; redundant with volume or unvalidated as inputs. |
| Market value trend | Context for the buy-low/sell-high narrative; not itself a driver. |
| Strength of schedule | An **in-season** signal; weak in the offseason (defensive turnover). Capture-first; display in-season. *(Evidence call, not architecture.)* |
| Speed score *(rookies)* | Mixed validity, more RB-relevant; show, don't lean on. |

### Internal-Only Metrics *(compute; don't surface)*
| Metric | Why hidden |
|---|---|
| Backtest βs, collinearity flags, panel coverage | Analyst-facing calibration artifacts. |
| Raw pre-calibration factor contributions | Intermediate; only the calibrated decomposition is user-facing. |
| Discount-rate internals | Expose the *slider*, not the math. |

### Metrics To Avoid *(excluded on the evidence/domain — out at any architecture)*
| Metric | Why avoided |
|---|---|
| **`wopr`** | Contains `target_share` (≈ volume); partial β collinearity-inflated everywhere. Use `air_yards_share`. |
| **`racr`** | Efficiency mean-reverts; untested in the harness. Don't scoreboard. |
| **aDOT** | Volume-confounded, non-monotonic, r≈0.29 with PPG. View-only at most. |
| **RB `air_yards_share`** | Flat / noise per the project's own backtest. |
| **Raw WR/TE `target_share`** | Redundant with volume (r≈0.9). View-only. |
| **BMI → "injury durability"** | Overstated validity here and in the literature. Display body metrics if you must; don't grade with them. |
| **"Eye test" / film / narrative grades** | No documented predictive validity. Evidence-gated — revisit only if a validated film-derived metric emerges; until then, never a scored input. |
| **Bare point-estimate projections** | Manufacture false certainty. Always pair with confidence. |
| **DFS-style betting-line-movement edges** | A weekly/in-game edge, low value for dynasty's time horizon. *(This is a domain call — distinct from real-time **event** signals, which are high-value and in the Must-Haves.)* |

**On showing uncertainty without faking it.** The instinct to put ranges on projections is right; fabricated standard deviations are not, because the findings file shows most active factors were activated on domain reasoning, not validation. **Start with confidence tiers** (High/Med/Low) from observable role-stability proxies (target/route-share stability, depth-chart security, injury history, sample size, age-curve volatility) plus a qualitative range. **Upgrade to empirical distributions** once the backtest harness produces calibrated residual variance by archetype. (A modeling sequence, not an architecture limit.)

---

## Player Evaluation Framework

Value is a forward-looking present value, not a backward-looking box score. The model should:
1. **Project a forward production stream** (by season), with decline driven by the **position-specific age curve**.
2. **Discount the stream** for time value and uncertainty.
3. **Adjust for incremental, per-position signal**, calibrated to the incremental effect over volume — never raw.
4. **Compute both absolute and marginal value.**
5. **Attach confidence and a factor decomposition** to every output.
6. **Revise on material events** — an injury, a role change, or a depth-chart move updates the stream and the value, fast.

Age curves are **dynamic priors, not constants** — re-estimable from the longitudinal store as the league's passing environment shifts, gated behind the calibration work rather than hand-tuned on intuition.

---

## Trade Evaluation Framework

The mechanism for the absolute-vs-marginal gap, made concrete:
1. **Value each asset two ways** — absolute (market comparison) and marginal (worth to *your* roster given position/age-band occupancy).
2. **Evaluate the post-trade roster holistically** — the delta in expected wins across your window, not a difference of value sums.
3. **Condition on phase** via a manager-adjustable discount rate (steep for contenders, shallow for rebuilders).
4. **Show the divergence from the market** — the clearest demonstration of the thesis.
5. **Surface structural consequences** — concentration and age-band effects.

What it does **not** do: sum absolute values and apply a package tax. That's the incumbent approach and exactly what this beats.

---

## Roster Construction Framework

The synthesis layer. The reframe (ideas doc §9.1): roster construction is *how to build and manage a multi-year asset portfolio that maximizes expected wins across a window* — not "who's good."

Two structural ideas:
1. **Age-weighted exposure, not player-by-player.** The question is "what share of my expected production three years out sits in steep-decline assets, and is that right for my window." Contending RB rooms skew 22–26; an RB past 27 is a depreciating asset to sell opportunistically. WRs hold longer because the *metrics* soften before production craters — that gap is the sell window.
2. **Positional concentration risk.** Four WRs in the same 24–26 band looks fine player-by-player and is structurally fragile. The target is strong players *spread* across age bands within each position.

The phase classifier is the hinge — and in the ideal it's informed by an **empirical season/playoff simulation** that gives a real title probability rather than a heuristic:
- **Contending** — sell aging assets aggressively at peak; you need one good year, not three; cliff risk is asymmetric.
- **Rebuilding** — sell almost anyone past ~26 (RB) / ~29 (WR) regardless of production; accumulate 21–24 and picks; optionality dominates point-in-time production.
- **Transitional** — say "ambiguous" out loud. Don't force a recommendation. Flag the specific risk: holding aging assets a year too long against the metrics.

---

## Filtering, Sorting, and Comparison Workflows

Features, not screens. Sort/filter lives on Explore and the hold/sell/cut table; comparison is an overlay (a tray + aligned side-by-side), never a mode you enter and exit. What gets a screen is a *job with a decision*; what gets a filter/sort/panel is a *way of slicing* one. (Detailed in the frontend doc.)

---

## Data, Signals, and Freshness

The ideal ingests each signal at the cadence it demands:
- **Real-time / near-real-time** — material events (injuries, role/depth/coaching changes, transactions). This is where buy-low/sell-high windows open; speed is edge. *(Requires backend ingest — see Ideal vs. Current.)*
- **Daily** — market values.
- **Weekly** — usage and advstats.
- **Yearly** — draft capital.

Two obligations survive from the data layer, both *integrity* concerns independent of architecture:
- **Single-source rule.** The served advstats file is the source for both display and activation, so a displayed value can never diverge from the value that eventually feeds a projection.
- **Ephemeral-capture obligation.** Reconstructable signals (advstats, usage, age, breakout) can be rebuilt anytime; **ephemeral** signals (depth-chart order, injury designation, coaching/scheme) are lost forever if not captured at snapshot time. Capture them *now*, regardless of what's activated. The faster the event cadence becomes, the more this matters.

Freshness must be **shown** — an "as of" signal on every data surface — so the manager never over-trusts stale data or distrusts fresh data. Most dynasty *value* moves slowly; the *windows to act on it* move on events, and the ideal captures both.

---

## Trust and Transparency Features

The UX expression of "honest, not precise," and a moat because every competitor is opaque:
- **The "why" one tap from any value** — factor decomposition with direction and magnitude.
- **Confidence on every value** — tier (then range), never hidden, never faked.
- **"As of" everywhere** — freshness made visible.
- **Model-humility copy where extrapolating** — year-four projections, re-estimated curves, unvalidated factors labeled as such.
- **Phase reasoning + override** — the classifier shows its work and yields to the user.
- **An optional "how it works" surface** — out of the critical path, present for auditors.
- **The market contrast** (in Trade) — demonstrating the product isn't reskinning the market.
- **Outcome honesty** (in the ideal) — the decision log shows where the model's calls (and yours) actually paid off, which is the deepest form of transparency: the product is accountable to results, not just to its own internal logic.

---

## What This Framework Requires *(build-out, not constraints)*

An honest accounting of the infrastructure the ideal implies. This is *not* a list of reasons to shrink the vision — it's the engineering the north star justifies, to be built **when the decision value of each capability warrants it.**

- **A backend / server component.** Required for real-time ingest, proactive notifications, accounts, and the feedback loop. The current backendless SPA cannot do these; reaching the ideal means adding one. This is the headline architectural implication, and naming it honestly is the point of the framework.
- **Real-time / near-real-time signal ingest.** Events, news, injuries, depth charts — the feed that powers fast buy-low/sell-high and proactive alerts.
- **Accounts + cross-device persistence.** For the decision log, watch lists, preferences, and (with consent) aggregate calibration.
- **A calibration / feedback pipeline.** Realized outcomes flowing back to recalibrate models — the genuine version of the ideas doc's feedback loop. (The current offline backtest harness is the parked, partial approximation; the ideal is a live loop.)
- **A market-price signal.** Pragmatically a third-party crowdsource; ideally an owned/independent signal long-term to reduce dependence and bias.
- **The dynasty-value model evolution.** DCF/present-value with a phase-defaulted discount rate, plus per-position incremental activation discipline. *(Architecture-agnostic model work; achievable on the current stack.)*

None of this implies the current app is *wrong*. It implies the north star is bigger than the current stack, and the gap between them is the improvement roadmap — which is exactly the next section.

---

## Ideal vs. Current: The Gap *(how to use this framework to evaluate and improve the app)*

This is the instrument. Each ideal capability is mapped to where the current backendless app stands, the gap, and what closing it takes. Read top-to-bottom, it's a prioritized improvement backlog: the top block is high-value *and* reachable now; the lower block is high-value but gated on infrastructure.

| Ideal capability | Current app status | What closing the gap takes | Reachable on current stack? |
|---|---|---|---|
| **Marginal value** (worth-to-this-roster) | Absent | Client-side compute from values + roster | ✅ Now |
| **Roster phase classifier** | Absent | Client-side from roster + league settings | ✅ Now |
| **Market-vs-model delta surfaced** | Inputs exist (market value + score), not surfaced as an edge | Wire and display the delta | ✅ Now |
| **Age-band exposure / portfolio view** | Absent | Client-side aggregation + viz | ✅ Now |
| **The Board (compute-on-open)** | Absent | Client-side ranking of opportunities | ✅ Now |
| **Transparency (decomposition + confidence tiers + "as of")** | Partial / absent | Surface factor contributions; tier from role-stability proxies | ✅ Now |
| **DCF / present-value model + discount rate** | Static-ish dynasty score | Evolve `computeDynastyScore` | ✅ Now (model work) |
| **Confidence ranges (empirical)** | Point estimates | Backtest harness → residual variance by archetype | ◑ Model/data work |
| **Phase informed by a season/playoff sim** | Absent | A simulator feeding the classifier | ◑ Compute-heavy but client-side-feasible |
| **Real-time event awareness** (injury/role/news) | Weekly CDN snapshots only | Backend + real-time ingest | ⛔ Needs backend |
| **Proactive alerts** (push/email when material) | At-open only | Backend + notification channel + accounts | ⛔ Needs backend |
| **Outcome feedback loop** (models learn from results) | Offline harness, parked | Backend + persistence + pipeline | ⛔ Needs backend |
| **Cross-device decision log + aggregate calibration** | Per-device IndexedDB only | Accounts + backend | ⛔ Needs backend |
| **Broad multi-platform sync** | Sleeper-first | Per-platform adapters | ◑ Incremental |
| **Independent market signal** | Consumes third-party | Owned crowdsource / trade-data model | ⛔ Network effects; long-term |

The decision rule the previous draft got wrong and this one makes explicit: **cut a capability only for lack of decision value — never for lack of current capability.** When something is high-value but gated on infrastructure (the bottom block), the right response is to *plan the infrastructure*, not to delete the capability from the vision.

---

## MVP Priorities

The near-term slice of the ideal that needs **no new infrastructure** — and, not coincidentally, the highest-value-per-effort work available. The app already has projections, dynasty scoring, market values, synced rosters, caching, college data, advstats, snapshots, and a backtest harness; the MVP turns that into decision support via the wedge.

1. **Market-vs-model delta**, surfaced per player.
2. **Roster phase classifier** (with "ambiguous" for transitional).
3. **Marginal-value adjustment** (band-occupancy discount). *The differentiator; prioritize over polish.*
4. **Portfolio / age-band exposure view.**
5. **The Board** (compute-on-open ranked actions).
6. **Transparency layer** (decomposition + confidence tiers) — shipped *with* the above.
   *Standing in parallel:* continue ephemeral-signal capture into snapshots.

Items 1–3 are irreducible. If forced to cut, cut 4–5 before the marginal-value engine or the transparency layer.

---

## Version 2 Priorities

Model depth, still mostly client-side:
1. **DCF / present-value dynasty model** with phase-defaulted discount rate.
2. **Confidence tiers from role-stability proxies.**
3. **Marginal- and phase-aware Trade Evaluator** — the headline feature.
4. **Rookie / Draft board** (capital + dominator + breakout age).
5. **Season/playoff simulator** feeding the phase classifier (empirical title probability).

---

## Advanced Features Worth Considering

Higher-value capabilities, several gated on the infrastructure step-up:
- **Real-time event ingest + proactive alerts** — the largest single jump in the product's usefulness as a *decision* tool, because it turns "check when you remember" into "told when it matters." Requires the backend.
- **A genuine outcome-feedback loop** — realized results recalibrating the models, and surfacing where managers (and the model) systematically err. The ideas doc's feedback ambition, done for real. Requires backend + pipeline; the parked grading harness is the seed.
- **Account-backed, cross-device decision log** with consented aggregate calibration — your decision history as a durable asset, and a population-level signal for where the market and managers misprice.
- **Empirical projection variance by archetype** — upgrade confidence tiers to honest distributions, from the snapshot backtests.
- **Independent market signal** — reduce third-party dependence; faces network-effect barriers.
- **Discount-rate inference from revealed behavior** (ideas doc §10) — infer a manager's implicit discount rate from roster/trade history rather than asking. Genuinely hard; frontier.

---

## Features That Should Be Rejected

Split into two clearly-labeled buckets — the distinction the previous draft failed to make.

### A. Rejected on the merits / evidence / domain *(out at any architecture)*
- **Narrative / "eye test" / film-grade scoring as a quantitative input** — no documented predictive validity. Evidence-gated: revisit only if a validated film-derived metric emerges.
- **Vanity advstats wired into projections** — `wopr`, `racr`, aDOT, RB `air_yards_share`, raw WR/TE `target_share`. The project's own backtest: noise/redundant/collinearity. Display where useful; never let them move a value. (Re-evaluated via the joint model.)
- **BMI → injury-durability as a scored signal** — overstated validity.
- **Bare point-estimate projections without confidence** — a quality rule.
- **DFS / weekly-lineup-optimization (or betting edges) as a flagship or the product's point** — different game, different horizon; the moat is dynasty *asset* decisions. *(This rejects the optimizer-for-its-own-sake — **not** the deferred **own-roster** start/sit surface, which is a real second job sequenced after the dynasty core; see Core Jobs #6 and Explicit Non-Goals.)*
- **Gamification (streaks, badges, confetti)** — no decision value.
- **A chatbot as the primary interface** — high-friction for repeatable structured decisions; a narrow Q&A affordance is fine, never the spine.
- **Recreating a market crowdsource as a near-term priority** — pragmatic to consume; network-effect barrier makes it a long-term option, not an MVP.

### B. *Previously* rejected on architecture grounds — corrected: these belong in the ideal
The earlier draft cut these for lack of a backend. That was the error this revision fixes. They are **in** the framework; what they need is build-out (see *Ideal vs. Current*), not deletion.
- **Real-time dynasty-relevant event/news signals** (injuries, role/depth/coaching changes) — high decision value; open buy-low/sell-high windows.
- **Proactive alerts / notifications** — being told *when* beats remembering to check; design material-only and explainable.
- **A genuine outcome-feedback loop** — models learning from realized results.
- **Cross-device, account-backed decision log + consented aggregate calibration.**
- **Broad multi-platform sync.**
- **A season/playoff simulator** *as an input to the phase classifier* — reconsidered on the merits: valuable because it makes phase empirical, not as standalone confetti.

---

## Technical Considerations

- **The architectural decision is binary and consequential: add a backend or not.** The framework's high-value frontier (events, alerts, feedback loop, accounts) lives on the far side of that decision. The recommendation is *not* "build a backend now," nor "never" — it's "build it **when** a backend-dependent capability's decision value justifies the cost," most likely the proactive-alerts + feedback-loop bundle, which together change what the product *is*.
- **The dynasty-value model is the central evolving artifact** (`src/utils/dynastyScore.js → computeDynastyScore`), and most model evolution (DCF, discount rate, incremental activation, simulator) is achievable on the current stack — so it's the right place to invest *before* the architecture step-up.
- **Activation discipline.** Any advstat wired in rides on top of the volume-driven projection as an *incremental*, per-position adjustment — never raw (findings §4.7).
- **Calibration today is an offline data-repo workflow**; the *ideal* is a live loop. Treat the current harness as the seed of the future pipeline, not the end state.
- **Snapshot persistence is the long-term moat** — what makes curve re-estimation, empirical variance, and the feedback loop possible. The ephemeral-capture obligation protects it now.
- **The current stack is not sacred.** Reaching the ideal will mean revisiting the backendless architecture; that's the framework working as intended, not a failure of the current app.

---

## Risks and Trade-Offs

- **Marginal value is genuinely hard** — that's the moat and the risk. Mitigate by shipping a transparent, legible v1 (band-occupancy discount) and improving it empirically.
- **Model maturity vs. product confidence** — the model can't present more certainty than it has; the transparency layer and confidence tiers turn that into a credibility advantage.
- **The phase classifier can be wrong**, poisoning everything downstream — mitigate with transparency, override, and a willingness to say "ambiguous." A season simulator improves it but adds its own modeling risk.
- **The backend decision is a real cost/benefit, not a freebie.** The risk runs both ways: under-building leaves the high-value frontier (alerts, feedback) permanently out of reach; over-building a backend before a capability justifies it is wasted effort and maintenance load. Tie the decision to specific high-value capabilities, not to ambition.
- **Proactive alerts can create unhealthy dependency** (ideas doc §10) — mitigate by making alerts *material-only*, always explainable, and paired with the decision log so the manager sees where their own judgment beat the model. Recommendation + transparency + accountability is healthier than a black-box oracle *or* a pure data dump.
- **Data cadence vs. expectation** — until real-time ingest exists, be honest with "as of" labels; compete on decision quality, not the illusion of freshness.
- **Sequencing under finite effort** — the ideal is large; the risk is spreading thin. Mitigate with the roadmap's strict ordering: highest value × lowest cost first (the wedge), infrastructure only when a capability earns it.

---

## Roadmap *(the ideal, sequenced — architecture upgrade is a step, not a ceiling)*

**Phase 1 — the wedge (no new infrastructure; highest value-per-effort).**
Market-vs-model delta · phase classifier · marginal value · age-band portfolio view · the compute-on-open Board · transparency layer. *Standing:* ephemeral-signal capture.

**Phase 2 — model depth (still mostly client-side).**
DCF/present-value + discount rate · confidence tiers · marginal-/phase-aware Trade Evaluator · rookie board · season/playoff simulator feeding phase.

**Phase 3 — the infrastructure step-up (introduce a backend; the framework's inflection point).**
Real-time event ingest + proactive alerts · accounts + cross-device decision log · the genuine outcome-feedback/calibration loop · broad platform sync. *This is where the backendless constraint is deliberately revisited, justified by the decision value of these capabilities.*

**Phase 4 — frontier.**
Empirical projection distributions · population-level mispricing/error models from aggregate data · independent market signal · discount-rate inference from revealed behavior.

---

## Final Recommendation

The north star is a **front-office system with real-time awareness, proactive guidance, marginal- and phase-aware valuation, honest uncertainty, and a learning loop.** That is the ideal, and it is deliberately bigger than what the current app can build today. The job of this framework is to hold that target steady so the app can be measured against it — which is the correction the previous draft needed: I had quietly shrunk the target to fit the stack.

On sequencing, the advice is unchanged, but the *reasoning* is now clean. **Start with the wedge** — the roster-phase-conditioned marginal-value engine, surfaced transparently — not because the architecture limits you, but because it is simultaneously the highest decision-value capability in the category *and* the cheapest to reach. Highest value × lowest cost is an unambiguous first move, and it happens to need no new infrastructure. Build it, and the app already does something no competitor does.

Then make the **architecture decision deliberately, not by default.** The product's most transformative capabilities — being told *when* a player you own gets hurt and what it means, and a model that actually learns whether its sell-high calls paid off — live on the far side of adding a backend. Don't build that backend for its own sake, and don't pretend it's never worth it. Build it when the proactive-alerts-plus-feedback-loop bundle's value is the next-highest thing on the board. The *Ideal vs. Current* table is the tool for that judgment: work down it, top block first.

And keep the subtraction discipline — but aim it correctly. Cut things that don't help a decision (narrative scoring, vanity stats, gamification, DFS-flavored features) on the merits, at any architecture. Never cut a high-value capability because today's stack can't reach it. That single distinction is the difference between a north star and a description of the status quo.

Build the wedge. Aim at the whole front office. Add infrastructure when the value earns it. Cut only for lack of decision value — never for lack of current capability.
