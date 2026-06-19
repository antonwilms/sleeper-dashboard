# Dynasty Decision Engine — Frontend & UX Design Document

*The interface strategy for the product defined in `dynasty-decision-engine-design.md`. That document decided **what** the product does; this one decides how it should look, navigate, feel, and behave.*

> **How to read this.** This is a UX strategy, not a redesign of the current screens — it assumes the frontend doesn't exist yet. It takes positions. It inherits the product strategy's three governing principles (marginal not absolute; honest not precise; decisions not data) and the six surfaces it defined (Board, Roster, Players, Trade, Rookies, Explore), and it answers the question the product doc left open: what is the fastest, clearest, most trustworthy way to put that engine in front of a serious manager every week. The architecture — a no-backend React SPA over a CDN data repo with IndexedDB caching — is treated as a UX *advantage*: everything is local, so interaction can be instant.

---

## Executive Summary

The interface has one job: take the marginal-value engine and let a manager act on it in seconds, with full understanding of why. Every dynasty tool today fails this in the same way — they are **data surfaces that make you do the synthesis.** KTC shows you a value; you decide what it means for your roster. Dynasty Daddy shows you fifteen tools; you decide which answers your question. The user does the work the software should do.

This design inverts that. Two UX primitives carry the entire product:

1. **The value chip** — the atomic unit of the interface. Wherever a player appears, he appears as `{ value, market delta, confidence }` in a single compact chip. The edge (is the market wrong, which way, how much) and the confidence are visible *without a click, everywhere.* This is the "decisions, not data" and "honest, not precise" principles made physical.
2. **The player peek** — the universal interaction. Tapping any player name anywhere opens a drawer (desktop) or sheet (mobile) with the essentials and a one-tap "why," **without navigating away from what you were doing.** Research never costs you your place. This single pattern is the difference between a tool that feels fast and one that feels like a filing cabinet.

Around those two primitives sits an opportunity-led home (the Board — recommendations computed at load, not pushed), a research table for when you want to drive, a marginal-value trade evaluator that shows where it disagrees with the market, and a portfolio view that makes age-band risk legible at a glance.

The visual language is **premium through restraint, not decoration**: a dark, dense, typographically excellent surface that treats the user as a professional. The one rule that breaks ties: between looking impressive and helping a decision, always the decision.

---

## Frontend Vision

A front-office terminal that respects the user's time and intelligence: it surfaces the few moves that matter, prices them to *your* roster, shows its reasoning on demand, admits what it doesn't know, and gets out of the way. Fast enough to check between plays. Deep enough to plan a rebuild. Honest enough to trust.

It should feel less like a fantasy app and more like a well-built professional instrument — Linear, not ESPN; a trading terminal, not a scoreboard.

---

## Design Principles

Six, each with a concrete UX consequence. These are the tie-breakers for every later decision.

1. **The interface does the synthesis.** If the user has to mentally combine three numbers to reach a decision, the product has failed; combine them into one. → *Consequence: the value chip, the Board, the marginal-value output.*
2. **Depth on demand, never by default.** Show the answer; make the reasoning one tap away; never force the reasoning on someone who trusts it. → *Consequence: progressive disclosure via the "why" expander, not dense screens.*
3. **Never navigate to research.** Looking something up must not cost your place. → *Consequence: the peek drawer and the comparison tray, not page-jumps.*
4. **Instant is a feature.** The data is local; there is no excuse for a spinner on a sort, a filter, or a peek. → *Consequence: every in-page interaction is synchronous and immediate; loading states exist only for the initial snapshot fetch.*
5. **Honesty is visible.** Confidence and data-age are encoded in the UI, not buried in a methodology page. → *Consequence: confidence on every chip; "as of" labels; humility copy where the model extrapolates.*
6. **Opinionated defaults over configuration.** The product should have a point of view about what matters; offloading that to a customizable dashboard is an abdication. → *Consequence: no drag-and-drop dashboards, no "build your own view"; curated surfaces with good defaults.*

---

## User Questions the Product Must Answer

Ranked by frequency × stakes — this ranking *is* the IA. The interface is organized so the top questions are answered with zero or one interaction.

| # | Question | Where it's answered | Interactions |
|---|---|---|---|
| 1 | What should I do right now? | The Board (home) | 0 — it's the landing |
| 2 | Should I hold/sell/cut this player? | Player peek → Roster hold/sell/cut table | 1 |
| 3 | Is this trade good *for me*? | Trade | 1–2 |
| 4 | Is this player over/under-valued? | Value chip (delta), everywhere | 0 |
| 5 | What changed since I last looked? | Board "what changed" strip | 0 |
| 6 | How do A and B compare? | Comparison tray | 1 (add) + 1 (open) |
| 7 | Is my roster built right for my window? | Roster / Portfolio | 1 |
| 8 | What's this player's future outlook? | Player detail (curve + projection + confidence) | 1 |
| 9 | Who should I target / buy low on? | Discovery | 1 |
| 10 | Which rookies, how high? | Rookies *(seasonal)* | 1 |
| — | Who do I start this week? | *Deferred — the own-roster weekly-lineup job (a real second surface), built after the dynasty core. Lower dynasty stakes, so it ranks below the questions above; not rejected.* | — |

Anything past question 9 either lives behind a drill-down, is deferred to a later surface (the own-roster start/sit job, below), or doesn't get built. The discipline of this table is what keeps the surface from sprawling into the fifteen-tool mess of the competitors.

---

## Common UX Mistakes in Dynasty Fantasy Applications

The challenge phase — what the field gets wrong, stated before recommendations so the recommendations can be read as the fixes.

- **The Bloomberg-terminal dashboard.** Every metric, equal weight, on one screen. It looks authoritative and produces worse decisions, because signal drowns in noise and the user has no cue about what matters. *Fix: opinionated surfaces; the model ranks and the UI reflects the ranking.*
- **Metric soup.** Twenty advanced stats displayed with no indication of which are predictive and which are vanity. The user assumes that if it's shown, it matters. *Fix: the metrics framework's display tiers are a UX contract — decision-moving metrics are visually primary, view-only stats are visually secondary and physically separated.*
- **Comparison by browser tab.** The single most common research failure: to compare two players you open two pages and hold one in your head. Radar charts are the "sophisticated" version of the same failure — they look like comparison and actively mislead (area is not a meaningful quantity; axis order changes the shape). *Fix: a comparison tray and side-by-side aligned rows; no radar charts, ever.*
- **Navigation that loses your place.** Clicking a player navigates you off your roster / trade / table, and getting back is a chore, so you stop exploring. *Fix: the peek drawer — research overlays, never replaces.*
- **Buried decision support.** The data is present but the *recommendation* and the *why* aren't — the user still has to be the analyst. *Fix: the Board states the move; the "why" is one tap from any value.*
- **Black-box authority.** A number with no provenance, presented as fact. Serious users distrust it; casual users over-trust it. Both are bad. *Fix: every value expands to its factor decomposition.*
- **Fake precision.** A point projection with no uncertainty, or decorative error bars implying a calibration the model doesn't have. *Fix: confidence tiers, honestly labeled; no error bars until empirically earned.*
- **No freshness signal.** The user can't tell if a value is live or a week stale, so they either over-trust stale data or distrust fresh data. *Fix: "as of" labels tied to the manifest, on every data surface.*
- **Mobile as a cramped afterthought.** Desktop tables jammed onto a phone, unusable. Most weekly opens are mobile and reactive; treating mobile as second-class loses the most common session. *Fix: per-surface platform strategy (below), with mobile-native patterns for the reactive surfaces.*
- **Engagement theater.** Activity feeds, streaks, badges, playoff-odds confetti — borrowed from social apps, off-strategy for a decision tool, and a maintenance tax. *Fix: a "what changed" digest instead of a feed; no gamification.*
- **Modal stacking.** Decisions trapped behind modals-on-modals. *Fix: drawers and inline expansion; modals only for genuinely blocking confirmations.*

---

## Information Architecture

Three IA tiers, defined by interaction cost. Assigning each surface to a tier is the core IA decision.

**Tier 0 — always present, zero navigation:**
- **Global search** (command-palette, keyboard-invocable) — jump to any player or screen.
- **The phase chip** — your current roster phase, always visible in the header. It's the context for every recommendation; it must never be more than a glance away, and tapping it explains and lets you override.
- **The "as of" freshness indicator** — quiet, persistent, honest.
- **The value chip** — not a destination but a component that appears inline everywhere a player does.

**Tier 1 — one interaction (primary nav):**
- The Board, Roster, Players, Trade. (Rookies seasonally.)

**Tier 2 — one interaction from a Tier-1 surface (overlays, not pages):**
- The player peek drawer, the comparison tray, the "why" expander, filter panels. These are *summoned*, not navigated to, so they don't consume a place in the nav and don't cost the user their context.

**Tier 3 — drill-downs (full pages):**
- Player detail, the full Discovery scan, the decision log. Reached deliberately when the user wants to commit attention.

The principle: **the more frequent the need, the lower the tier.** Research (Tier 2 overlay) is more frequent than reading a full player page (Tier 3), so research must not require navigation while the full page may.

---

## Navigation Structure

**Top-level (primary):** four permanent destinations + one seasonal.

| Item | Why it's top-level | Seasonal? |
|---|---|---|
| **Board** | The home; the most frequent question ("what now?") | No (default) |
| **Roster** | The synthesis layer; second-most-frequent question | No |
| **Players** | Research home — unifies the Explore table, search results, and player detail | No |
| **Trade** | The headline tool; high-stakes recurring decision | No |
| **Rookies** | High stakes but seasonal (Jan–May); promoted to nav in season, tucked into Players out of season | Yes |

Four permanent items is deliberate: it fits a mobile bottom tab bar comfortably (five is the hard ceiling, and the seasonal Rookies slot only appears when it's relevant), and it forces discipline — every permanent tab maps to a top-three user question.

**Secondary (within-surface) navigation:** tabs or segmented controls *inside* a surface, never new top-level items. Examples: Roster has tabs for *Overview / Hold-Sell-Cut / Decision Log*; Players has a search + filter bar, not sub-pages; Trade has *Builder / History*. This keeps the top-level shallow and the depth contextual.

**What is deliberately NOT in the navigation:**
- A weekly-lineup / start-sit surface — *deferred, not rejected.* Setting your **own** dynasty roster's weekly lineup is a legitimate second job; it's simply built after the dynasty core, so it has no nav home *yet*. When built it lives **inside Roster** as a seasonal (in-season) secondary tab — never a new top-level item, so the four-permanent-tab spine and the 5-tab mobile ceiling stay intact. (A general DFS/lineup *optimizer* for its own sake stays rejected — see "Features and Patterns to Reject.")
- A playoff simulator (engagement candy).
- An activity feed (replaced by the Board's "what changed").
- A settings-heavy "customize your dashboard" area (against the opinionated-defaults principle).
- A separate "rankings" page — rankings are an artifact, not a destination; the value chips and the Explore table *are* the rankings, in context.

**Rationale.** The competitors' navigation is a tool drawer — KTC's left rail lists a dozen tools; Dynasty Daddy's nav is a feature catalog. That structure makes the user choose a tool before they've framed their question. This nav is organized by *question*, not by *tool*: you don't pick "trade calculator," you go to Trade because you have a trade question, and the surface already knows your roster and phase.

---

## Core Screens

Six surfaces, each detailed below using a consistent template — *purpose, questions answered, key components, information hierarchy, interaction model, why it exists.* The named "experience" sections that follow are these same six, treated in depth; this is the orienting map.

1. **Board** → *Homepage / Landing Experience*
2. **Players** → *Player Research Experience* + *Search Experience*
3. **Player detail** → *Player Detail Page*
4. **(tray)** → *Comparison Experience*
5. **Trade** → *Trade Analysis Experience*
6. **Roster** → *Roster Analysis Experience*
7. **Discovery** → *Discovery / Opportunity-Finding Experience*

---

## Homepage / Landing Experience *(the Board)*

**Purpose.** Answer "what should I do right now?" in five seconds, ranked and defensible.

**User questions answered.** What are my highest-leverage moves? What changed since I last looked? Is my roster structurally healthy?

**Key components.**
- **"What changed" strip** (top, dismissible) — value movements and new opportunities since last visit, diffed client-side against the last cached snapshot. One line: *"3 new opportunities · your RB room's value down 6% on Monday's update."*
- **The opportunity stack** — ~5 cards max, ranked by expected value of acting. Each card: the move (Sell / Buy / Flag), the player(s) as value chips, the magnitude of the edge, a one-line why, and a "why" expander + a one-tap route into the relevant tool (a sell-high card opens the player peek; a roster-health card opens the portfolio view).
- **Phase chip** (header) — context for all of it.

**Information hierarchy.** Action verb first (Sell / Buy / Flag), then who, then how much, then why. The card is readable as a headline; detail is disclosed on tap. Nothing on this screen is a raw stat — everything is a *decision*.

**Interaction model.** Cards are not just information; each is a launchpad. Tap the player → peek. Tap "why" → inline expansion of the factor decomposition. Tap the card's primary action → the relevant surface, pre-loaded. Dismiss a card → it's acknowledged, not deleted (it returns if the condition persists).

**Why it deserves to exist.** It's the product. Every competitor makes the user initiate; this initiates for them, and does so by composing the three things only this product computes together (marginal value, phase, market-vs-model). It is also the answer to the ideas doc's "alert engine" — minus the push notifications the architecture can't support and the dependency loop they'd create. Computed at load, it's honest, offline-capable, and non-nagging.

---

## Player Research Experience *(Players / Explore)*

**Purpose.** Answer "let me look at the field on my own terms" — the surface for users who want to drive.

**User questions answered.** Who's trending? Who's undervalued at a position? Who fits a gap? Sortable, filterable, scannable.

**Key components.**
- **A dense data table.** Dynasty research is tabular work, and the right tool for tabular work is a great table — not a wall of cards. Sticky header, frozen player column, **value chips inline in cells**, sortable on every column, row-hover reveals a peek affordance.
- **A filter bar** — position, age band, phase-fit, market-vs-model direction, value range. Filters apply *instantly* (data is local) with no submit button and no spinner.
- **Tabs/segments** for common pre-filtered views: *All / My Roster / Available (FA) / Buy-low candidates / Sell-high candidates.*

**Information hierarchy.** The table leads with identity (name + position + age + team) and the value chip; advanced columns are addable but off by default (the metrics framework's display tiers govern which columns are primary vs. opt-in). View-only stats (snap share, route participation, raw target share) live here and *only* here — visible for research, visually secondary, never promoted to a decision surface.

**Interaction model.** Sort/filter is synchronous and immediate. Any row → peek (overlay, keeps your place). Select rows → add to comparison tray. Column chooser for power users; sane defaults for everyone else.

**Why it deserves to exist.** The Board is push (the model's agenda); Explore is pull (the user's agenda). A decision tool needs both. And a genuinely fast local table — instant sort on 600 players with no round-trip — is a concrete advantage the server-bound competitors can't match. This is where the no-backend architecture becomes a UX win.

---

## Player Detail Page

**Purpose.** Answer "what is this player worth, why, and how sure are we?" — the full-attention version of the peek.

**User questions answered.** Absolute and marginal value? Where on the age curve? Market over/under-pricing? What's driving the number? How confident?

**Key components.**
- **Value header** — the big number(s): absolute value, marginal value to *your* roster (with the gap made explicit), market delta, confidence tier. This is the value chip, expanded and annotated.
- **Factor decomposition** — the "why," fully expanded here: which factors moved the value, direction and magnitude. The trust anchor.
- **Age-curve position** — a small, honest visualization: this player as a marker on his position's age curve, with runway to peak/decline. Not a decorative chart — a single legible "where is he, how much road is left."
- **KTC trend sparkline** — market value over time, for the buy-low/sell-high narrative.
- **Projection + confidence** — projected production with its confidence tier (and, later, an empirical range), never a bare point.

**Information hierarchy.** Value → marginal value → why → outlook. The market delta and confidence sit beside the value, not below the fold. Raw stats are at the bottom, clearly demarcated as reference, not decision input.

**Interaction model.** Reached from a peek's "full page" link or from search. Add-to-comparison and add-to-trade are one tap from here. The "why" is expanded by default on this page (unlike everywhere else, where it's collapsed) — because someone who navigated here wants the depth.

**Why it deserves to exist.** The peek answers 80% of player questions in context; this page answers the deep 20% without compromise. It's also the home of the transparency moat — the place that most visibly differentiates an explainable value from KTC's crowdsource and Draft Sharks' projection, both opaque.

---

## Comparison Experience *(the tray)*

**Purpose.** Answer "how do these players stack up?" — the single most-botched workflow in the category, done right.

**User questions answered.** A vs. B (vs. C). On value, marginal fit, age/runway, projection, confidence.

**Key components.**
- **A persistent comparison tray** — like a cart. Add players from anywhere (peek, table, search) without leaving your flow; a small indicator shows the count.
- **A side-by-side panel** — aligned rows, one column per player. Each row is a single comparable dimension (value, marginal value, age-curve position, projection, confidence, key validated metric). The best value per row is marked; the deltas are explicit.

**Information hierarchy.** Decision-moving dimensions first (value, marginal fit, runway), then projection + confidence, then the few validated metrics, then optional view-only rows. Same display-tier discipline as everywhere.

**Interaction model.** Add-as-you-browse (tray), open when ready (side-by-side). Swap a player, add a third, jump from any column header to that player's peek or detail. Never a "comparison mode" you have to enter and exit — it accretes alongside normal use.

**Why it deserves to exist.** Comparison is the second-most-common research act and universally bad in the field — two-tab juggling or misleading radar charts. Aligned side-by-side rows with marked winners and explicit deltas is the honest, scannable form. The tray pattern removes the friction that makes people not bother. **No radar/spider charts** — they are the genre's signature mistake.

---

## Trade Analysis Experience

**Purpose.** Answer "is this trade good *for me*?" — where the marginal-value wedge becomes legible in one screen.

**User questions answered.** Does this improve my roster given my phase and existing assets? (Not "is it fair by community averages.")

**Key components.**
- **Two sides, built fast** — add assets to "I get" / "I give" via search or from the comparison tray; players render as value chips.
- **The verdict** — a clear, single read: good / marginal / bad *for your roster*, with the marginal-value math (what you receive is worth X to you because it fills a hole; what you give is worth Y because it's your fourth in that age band).
- **The market contrast** — explicit, first-class: *"KTC: roughly even. For your roster & window: clear win."* This contrast is the product's thesis in one component; it is not a footnote.
- **Structural consequences** — the age-band/concentration effect of the swap, shown as the before/after change to the relevant band, not just a point delta.

**Information hierarchy.** Verdict → the for-you reasoning → the market contrast → structural effects. The point-value sum (what the competitors lead with) is present but explicitly subordinate to the marginal read.

**Interaction model.** Build both sides without leaving (search overlays, tray hand-off). Every asset is peekable. Adjust and the verdict updates instantly (local compute). A trade can be saved to the decision log to track the outcome.

**Why it deserves to exist.** Highest-stakes recurring decision, and the screen that proves the wedge. Every competitor — KTC, Dynasty Daddy, Dynasty Nerds — sums absolute values and applies a package tax; none evaluates against the specific roster the trade lands on. The market-contrast component is the single clearest demonstration that this product does something the others structurally cannot.

---

## Roster Analysis Experience

**Purpose.** Answer "is my roster built correctly for my window?" — the synthesis layer.

**User questions answered.** What's my phase, and why? Where is my production concentrated by position and age? Where am I fragile? Which assets fail the hold/sell/cut test?

**Key components.**
- **Phase panel** — *Contending / Transitional / Rebuilding*, stated with its reasoning and **overridable**, and explicitly allowed to say *"Transitional — ambiguous, here's why."* The most poorly served state in the market gets first-class honest treatment.
- **Age-band exposure heatmap** — a grid of position × age band, shaded by share of expected production three years out. This is the component that makes concentration risk *visible*: four WRs in the same 24–26 band lights up as a hot, fragile cluster you'd never see player-by-player. A grid, not a chart — it reads instantly.
- **Hold / Sell / Cut table** — the three-part test applied to every asset, sortable by which test each fails. The third column (fit-with-phase) is the one no competitor surfaces.

**Information hierarchy.** Phase (the lens) → exposure (the structure) → the per-asset actions (the to-do). Top-down: context, then shape, then tasks.

**Interaction model.** Override phase and the whole surface (and the Board) recomputes. Tap a heatmap cell → the players in that band. Tap a hold/sell/cut row → peek. The Decision Log lives here as a tab.

**Why it deserves to exist.** It operationalizes the product's core thesis into one screen and is the home of the Portfolio Manager archetype. The heatmap in particular is a genuine "I couldn't see this before" moment — the kind of legibility that earns weekly opens.

---

## Discovery / Opportunity-Finding Experience

**Purpose.** Answer "what should I go *get*?" — distinct from the Board, which is "act on what you own."

**User questions answered.** Where is the market mispricing players I *don't* own? Who's a buy-low target that fits my needs? Which available/FA players matter?

**Key components.**
- **A league-wide market-vs-model scan** — players (rostered elsewhere or available) where the model and KTC most disagree, filtered to *fit your roster's needs and phase* (a rebuilder's buy-low list differs from a contender's).
- **Need-aware framing** — surfaced against your roster gaps from the portfolio view, so it's not a generic mispricing list but "targets that fix *your* holes."
- **Availability context** — for FA/waiver-relevant players, who's actually gettable.

**Information hierarchy.** Fit-to-your-needs first, then size of the mispricing, then availability. A buy-low that doesn't fit your roster is correctly ranked below one that does — marginal logic applied to acquisition, not just retention.

**Interaction model.** A scannable list (cards or a focused table), each item peekable, each with a one-tap route into Trade (pre-loaded as a target) or a watch action.

**Why it deserves to exist.** The Board handles your assets; acquisition is the other half of portfolio management and the highest skill-expression act in dynasty (finding what the market has wrong before others do). Keeping it distinct from the Board prevents the home screen from sprawling and gives the "go get value" job its own honest home.

---

## Search Experience

**Purpose.** Zero-navigation access to any player or screen.

**Key components.** A command-palette (Cmd/Ctrl-K on desktop, prominent search affordance on mobile): fuzzy player search with inline value chips in results, plus jump-to-screen commands ("Trade," "my Roster").

**Interaction model.** Invoked from anywhere, keyboard-first on desktop. A result opens the peek by default (in-context), with a modifier/secondary tap to go to the full page. Search is Tier 0 — it never costs you your place.

**Why it deserves to exist.** Power users live in search; it's the fastest path to any player and the connective tissue that makes the four-tab nav feel limitless. Implementing it as a peek-by-default reinforces the "never navigate to research" principle.

---

## Filtering and Sorting Framework

A single, consistent model everywhere tabular:

- **Instant, no-submit.** Data is local; every filter and sort applies synchronously with zero latency and no spinner. This is non-negotiable and is the architecture's gift — never reintroduce a round-trip.
- **Filters are scoping, sorts are ordering** — kept visually and conceptually distinct. Filters narrow the set (position, age band, availability, phase-fit, delta direction); sorts order it (value, delta, age, projection, confidence).
- **Sane defaults, deep optionality.** Default columns and a default sort that answer the common case; a column chooser and advanced filters for the Optimizer. Never make the casual user configure; never cap the power user.
- **State persists within a session, resets predictably.** Returning to Explore remembers your last filter; deep-linking carries it. No surprise resets, no surprise stickiness across unrelated surfaces.
- **The same filter vocabulary across surfaces.** "Age band," "phase-fit," "market-vs-model direction" mean the same thing and look the same on Explore, Discovery, and the hold/sell/cut table. One mental model.

---

## Mobile UX Strategy

Reason from sessions, not dogma. Dynasty managers do two kinds of work, and they happen on different devices:

- **Reactive sessions** (the majority of weekly opens): checking the Board, reacting to a trade offer mid-league-chat, glancing at a player someone mentioned, seeing what changed. Short, frequent, one-handed, often mobile.
- **Constructive sessions** (fewer, higher-stakes): building a multi-leg trade, planning a rebuild, doing roster surgery, deep research. Longer, focused, often desktop.

**Therefore mobile is first-class for the reactive surfaces and must be genuinely native there, not a shrunk desktop:**
- **The Board** is the mobile home — a vertical card stack is already the ideal mobile form. This is the most important mobile screen and should be designed mobile-first.
- **The peek** becomes a bottom sheet — thumb-reachable, swipe-to-dismiss, the natural mobile expression of depth-on-demand.
- **Single-offer trade evaluation** — "someone offered me X for Y, is it good?" — must be fast on mobile: search, add two sides, read the verdict. This is a top mobile use case.
- **Search** — a prominent affordance, peek-by-default.

**Information density adapts honestly, it doesn't degrade:**
- The Explore table on mobile becomes a **sorted card list** (one player per row-card with the value chip and key fields) or a **frozen-first-column horizontally-scrollable table** — chosen per the user's intent, never a table with eight columns crushed to illegibility.
- The age-band heatmap stays a grid (grids scale down well) but with tap-to-expand cells.
- The comparison side-by-side becomes a **swipeable two-up** or a stacked aligned view, preserving the row-alignment that makes comparison work.

**What's desktop-only or desktop-degraded on mobile:** multi-leg trade *construction* (fine to do on mobile, better on desktop), the full Explore table with many columns, and dense portfolio analysis. These are explicitly constructive-session surfaces; a good-enough mobile version plus an excellent desktop version is the right allocation.

---

## Desktop UX Strategy

Desktop earns its keep through **density and parallelism** — showing more at once and letting the user work two things side by side.

- **Persistent left nav rail** + a wider content area. The four tabs as a rail, not a hamburger — visible, one-click, no hidden navigation on the device where screen real estate is abundant.
- **The peek as a right-side drawer** (not a sheet) — so you can keep your table/roster/trade visible on the left while inspecting a player on the right. Parallelism is the desktop advantage; the drawer exploits it.
- **The Explore table in full** — many columns, dense rows, sticky header, frozen player column. This is where serious research happens and where the local-data speed shines.
- **Multi-leg trade builder** — room for both sides, the verdict, the market contrast, and the structural effects on one screen without scrolling.
- **Keyboard-first** — command palette, keyboard sort/filter, j/k row navigation in tables. The Optimizer archetype is a keyboard user; reward them.

The mistake to avoid on desktop is the inverse of mobile's: don't waste the space on a sea of padding and one giant chart (the Dribbble-dashboard trap). Density is appropriate here — use it.

---

## Visual Design Philosophy

**Premium through restraint.** The signal of seriousness in a professional tool is not gradients and glows — it's typography, alignment, and the absence of decoration. Reference points: Linear, Vercel, a Bloomberg terminal's information density without its visual chaos. Not ESPN, not a sportsbook.

- **Dark-first.** The audience is male-skewed, evening-use, data-focused; a well-built dark theme reduces eye strain over long research sessions and reads as professional. Offer light, default dark.
- **Typography is the design.** A first-rate type system with **tabular (monospaced) figures** for all numerics so columns align and values are scannable — this is the single highest-impact visual decision in a numbers product. A clean grotesque for text, tabular figures for data.
- **A small, semantic color palette.** Neutral base. Color carries *meaning*, never decoration: a two-direction scale for market-vs-model (over/under-valued), a tier encoding for confidence, a categorical set for phase. Because the audience has elevated red-green color-blindness rates, **semantic state is never carried by color alone** — direction (arrows, signs), position, and labels carry it too.
- **Generous where decisions happen, dense where research happens.** The Board breathes (each card is a considered decision); the Explore table is dense (scanning is the job). Density is a function of task, not a global setting.
- **Motion is functional only.** Transitions that aid spatial continuity (the drawer sliding in, a row expanding) are good; decorative animation, count-up numbers, and confetti are noise. Respect `prefers-reduced-motion`.
- **No chart junk.** No 3D, no gauges, no skeuomorphism, no decorative sparklines that don't carry data. Every pixel of ink is data or it's removed.

The tie-breaker, restated because it's the one that matters: when a choice trades clarity for impressiveness, choose clarity.

---

## Design System Recommendations

A small, opinionated component set. The discipline is *few components used consistently*, not many components used once.

**Components (the atoms that matter):**
- **Value chip** — the keystone. `{ value · delta · confidence }` in one compact, consistent unit. Appears in tables, cards, peeks, trade sides, comparison rows. Get this one component right and the whole product coheres.
- **Phase chip** — the persistent context indicator.
- **"As of" label** — the freshness primitive.
- **Why-expander** — the progressive-disclosure pattern for factor decomposition; identical behavior everywhere (collapsed by default, except on the player detail page).

**Tables:** sticky header, frozen identity column, tabular figures, inline value chips, instant client-side sort/filter, row-level peek affordance, optional columns governed by the metrics display tiers. One table component, configured per surface. Tables are for *scanning and comparison*; that's their entire job.

**Cards:** for *discrete decisions and opportunities* — the Board, Discovery. A card is a thing you act on; a table row is a thing you scan. That boundary (card = decision/action, row = comparison/scan) is the philosophy that decides which to use, and it should never blur.

**Modals:** reserved for genuinely blocking confirmations (e.g., "remove this league?"). Decisions and detail never go in modals — they go in drawers and inline expansions. Modal-stacking is banned.

**Drawers / sheets:** the workhorse of depth-on-demand. **Drawer** on desktop (right side, preserves parallelism), **bottom sheet** on mobile (thumb-reachable, swipe-dismiss). The peek lives here; it is the most-used pattern in the product and must be flawless — fast open, no layout shift, scroll-locked behind, escape/swipe to close.

**Navigation:** left rail (desktop), bottom tab bar (mobile), four permanent + one seasonal. Never a hamburger on desktop. Never more than five mobile tabs.

**Filters:** an inline filter bar (not a modal), instant-apply, with the shared filter vocabulary. A "filters active" indicator and a one-tap clear.

**Charts:** minimal and purpose-built (see next section). There is no general-purpose charting component because the product needs only a handful of specific, honest visualizations — building each deliberately beats a flexible chart library that invites chart junk.

---

## Data Visualization Recommendations

The bar: a visualization must answer a decision question faster than a number or a table would. If it doesn't, it's decoration.

### Visualizations Worth Using

| Visualization | Why it earns its place |
|---|---|
| **Age-band exposure heatmap** (position × age grid, shaded by production share) | Makes concentration risk instantly legible — the single most valuable viz in the product. Reading "fragile cluster" off a grid is faster than any table. |
| **Market-vs-model delta** (a small diverging bar or a signed chip) | Encodes direction + magnitude of the edge in one glance, inline, everywhere. The buy-low/sell-high primitive made visual. |
| **Age-curve position marker** (player as a dot on his position's curve) | Answers "how much runway" spatially and honestly in one small graphic. |
| **KTC value sparkline** (trend over time) | Tiny, data-dense, gives the buy-low/sell-high *narrative* (is this a spike or a slide) at a glance. |
| **Confidence as visual tier** (consistent encoding on the chip) | Uncertainty made ambient without fake precision. |

### Visualizations To Avoid

| Visualization | Why it's rejected |
|---|---|
| **Radar / spider charts** | The genre's signature mistake. Area is meaningless, axis order changes the shape, and they *look* like comparison while misleading. The comparison tray's aligned rows are strictly better. |
| **Pie / donut charts** | Humans compare angles poorly; a bar or a number is always clearer. |
| **Gauges / speedometers** | Low data-to-ink, imply precision, waste space. A number with context beats a gauge. |
| **Dense multi-series line charts** | The "analytics dashboard" cliché; rarely answers a specific decision, usually buries it. |
| **Decorative error bars / fabricated distributions** | Imply a calibration the model doesn't have (per the findings file). Use confidence *tiers* until empirical variance is earned. |
| **Anything 3D or animated-for-effect** | Pure decoration; violates the clarity-over-impressiveness tie-breaker. |
| **Dual-axis charts** | Invite false correlation reading; almost always misleading. |

---

## Trust and Transparency Features

The UX expression of the product's "honest, not precise" principle — and a moat, because every competitor is opaque.

- **The "why" is always one tap from any value** — factor decomposition with direction and magnitude. Never a separate page; inline expansion.
- **Confidence on every value** — tier + (later) range, consistently encoded, never hidden, never faked.
- **"As of" everywhere** — the freshness primitive on every data surface; the user always knows how stale the number is.
- **Honesty copy where the model extrapolates** — year-four projections, re-estimated curves, unvalidated factors are *labeled as such* in plain language. The Optimizer rewards this.
- **Phase reasoning + override** — the classifier shows its work and yields to the user; a recommendation engine that can't be corrected isn't trustworthy.
- **An optional "how this works" surface** — out of the critical path, present for the user who wants to audit the engine. Casual users ignore it; serious users need it to trust the whole thing.
- **The market contrast** (in Trade) — showing where the product disagrees with KTC *and why* is itself a trust feature: it demonstrates the product isn't just reskinning the market.

---

## Accessibility Considerations

Not an afterthought — several of these are load-bearing for *this specific audience*.

- **Never color alone.** The audience has elevated red-green color-blindness rates and the most important encoding (market-vs-model) is exactly the red-green case. Direction (arrows/signs), labels, and position must carry meaning alongside color. This is correctness, not compliance.
- **Contrast that survives dark mode** — data text especially; dark themes routinely fail contrast on secondary text. Hold WCAG AA on all data, AAA where feasible on primary numbers.
- **Keyboard-complete** — the command palette, table navigation (j/k, sort, filter), drawer escape, and trade building all reachable without a mouse. Helps power users and screen-reader users alike.
- **Semantic tables** — real table semantics (headers, scope) so the dense research surface is navigable by assistive tech, not a div soup.
- **Touch targets** ≥ 44px on mobile; the peek sheet and card actions sized for thumbs.
- **`prefers-reduced-motion`** respected — drawer/expansion transitions reduce to instant.
- **Respect system text scaling** — the tabular-figure layout must not break when the user bumps font size.

---

## UX Risks and Trade-Offs

- **The peek/drawer pattern is make-or-break.** It's used constantly; if it's janky (layout shift, slow open, scroll bleed) the whole product feels cheap. *Mitigation: invest disproportionately in the peek's polish; it's the most-used component.*
- **Density vs. approachability.** A dense professional tool can intimidate the Casual-Serious archetype. *Mitigation: opinionated defaults and the Board hide the density until wanted; depth is opt-in via Explore and the why-expander. Don't dumb down — layer.*
- **The value chip carries enormous load.** Three pieces of information in a small space risks clutter or illegibility. *Mitigation: ruthless typographic and spatial design of this one component; prototype it first, in isolation, on real data.*
- **"What changed" requires client-side diffing.** Storing last-seen values in IndexedDB and diffing on load is feasible but adds state complexity. *Mitigation: keep it simple (diff the served snapshot against the last cached one); degrade gracefully to "no changes detected" if state is missing.*
- **Showing uncertainty can read as the product hedging.** Confidence tiers everywhere might feel like the tool won't commit. *Mitigation: the Board still makes a clear recommendation; confidence modulates it, it doesn't replace it. Honest ≠ wishy-washy.*
- **Opinionated defaults vs. user control.** Refusing customizable dashboards will frustrate a minority who want to build their own view. *Mitigation: accept the trade — the Bloomberg-dashboard failure mode is worse than mild frustration; offer column choosing and filters as the controlled outlet for that impulse.*
- **Mobile-constructive sessions.** Some users will want to build complex trades on mobile despite it being a desktop-optimized task. *Mitigation: make it possible and good-enough on mobile, excellent on desktop; don't block, but don't over-invest.*

---

## MVP Frontend

What ships first, mapped to the product MVP (the wedge). The principle: **build the two primitives and the one screen that proves the thesis, before anything else.**

1. **The value chip** — the keystone component. Everything depends on it; build and harden it first, in isolation, on real data.
2. **The player peek (drawer/sheet)** — the universal interaction. Without it the product feels like a filing cabinet.
3. **The Board** — opportunity cards + "what changed," computed at load. The home and the proof of "decisions, not data."
4. **The Explore table** — instant local sort/filter, value chips inline. The research surface and the showcase for local-data speed.
5. **The Roster surface** — phase chip (with override + reasoning), age-band heatmap, hold/sell/cut table. The synthesis layer.
6. **The why-expander + confidence tiers + "as of" labels** — the transparency layer, shipped *with* the above, not after. The wedge isn't trusted without it.
7. **Global search (command palette)** — Tier-0 access; cheap and high-leverage.

Navigation at MVP: the four-tab spine (Board, Roster, Players, Trade), even if Trade and Rookies are thin — the IA should be right from day one so later surfaces slot in.

If forced to cut: drop the full Explore table polish and the Discovery scan before touching the chip, the peek, or the transparency layer. Those three *are* the product's feel.

---

## Version 2 Frontend

1. **The Trade analysis experience, in full** — the market-contrast component, structural effects, multi-leg builder. The headline feature; depends on the V2 marginal-value-aware evaluator.
2. **The comparison tray + side-by-side** — the honest comparison workflow.
3. **The Discovery surface** — need-aware league-wide mispricing scan.
4. **The Rookies board** *(seasonal)* — analytics-led, need-mapped.
5. **The Player detail page, enriched** — age-curve viz, projection ranges as confidence tiers mature.
6. **The Decision Log** — lean, per-device, honest about limits; lives in the Roster surface.
7. **Empirical confidence ranges** — upgrade tiers to honest distributions once the backtest work lands; a viz change, not a new surface.
8. **Own-roster start/sit *(seasonal; deferred, gated)*** — a weekly-lineup helper for the user's **own** dynasty roster, living inside the Roster surface as an in-season secondary tab. It is the product's *second* management job (not the DFS optimizer the Reject list rules out), and it is gated on an in-season weekly-production model — itself deferred model-depth work — so it sequences *after* everything above and never ahead of the asset-decision core.

---

## Features and Patterns to Reject

Named so they don't reappear under new clothes.

- **Customizable drag-and-drop dashboards** — the Bloomberg trap; abdicates the product's point of view. Column choosing and filters are the controlled alternative.
- **Radar / spider charts** — misleading comparison theater.
- **Activity feeds** — engagement, not decisions; replaced by the Board's "what changed" digest.
- **Gamification (streaks, badges, confetti)** — off-strategy borrowing from social apps; a maintenance tax.
- **Carousels** — hide content, low engagement, poor on both platforms.
- **Modal-heavy flows / modal stacking** — drawers and inline expansion instead.
- **Push notifications** — no backend to push from, and the dependency loop the ideas doc itself questions; the computed-at-load Board is the honest substitute.
- **A chatbot as the primary interface** — high-friction for repeatable, structured, loggable decisions; the ideas doc is right to reject it (a narrow Q&A affordance later is fine, but never the spine).
- **Onboarding tours / coach-mark overlays everywhere** — a self-evident UI beats a guided one; reserve a single light first-run flow (connect league → phase → Board).
- **A DFS / weekly-lineup *optimizer* (or betting-edge chase) as a flagship** — optimizing weekly points or betting lines for their own sake is a different product with a different time horizon; the moat is dynasty *asset* decisions, not weekly scoring. *(This is not the deferred **own-roster** start/sit surface, which is a legitimate second job sequenced after the dynasty core — see "Version 2 Frontend" and the Complete Frontend Roadmap.)*
- **A playoff simulator** — engagement candy, not a decision-mover.
- **Sportsbook/ticker aesthetics, skeuomorphism, decorative motion** — violate the clarity-over-impressiveness tie-breaker.
- **A separate "rankings" page** — rankings are an artifact surfaced in context (chips, table), not a destination.

---

## Complete Frontend Roadmap

**Phase 1 — the primitives and the proof** *(with the product MVP / the wedge).*
Value chip → player peek → Board (+ "what changed") → Explore table → Roster (phase chip + heatmap + hold/sell/cut) → transparency layer (why-expander, confidence tiers, "as of") → global search. Four-tab nav scaffolded. Mobile-first on the Board and peek; desktop dense on Explore.

**Phase 2 — the headline tool and the workflows** *(with the V2 model).*
Full Trade experience (market contrast, structural effects, builder) → comparison tray + side-by-side → Discovery scan → Rookies board (seasonal) → Player detail enriched → Decision Log.

**Phase 3 — credibility and refinement** *(with the calibration work).*
Empirical confidence ranges replacing tiers → age-curve viz upgrades → keyboard-power-user layer (j/k nav, palette commands) → accessibility hardening pass → performance pass on the local table at scale.

**Standing throughout:** the peek is held to a flawless bar at every phase; no surface ships without "as of" + confidence; no chart ships that fails the decision-question test.

**Deferred (post-core):** own-roster **start/sit** — a seasonal Roster sub-tab for setting your *own* lineup, sequenced after the dynasty core and gated on an in-season weekly-production model. Intended, not rejected; kept out of nav until built.

---

## Final Recommendation

If I rebuilt this frontend from scratch, I would build it inside-out from two components and one screen, and I would not let anything else ship until those felt perfect.

The **value chip** first, alone, on real data — because it's the molecule the entire product is made of, and if `{ value · marginal delta · confidence }` isn't legible and beautiful in a small space, nothing downstream works. Then the **player peek** — because the difference between this product feeling like a fast instrument and feeling like a database is entirely whether you can inspect any player from anywhere without losing your place. Those two patterns, done right, are 70% of the perceived quality of the whole thing. Then the **Board**, because it's the embodiment of the entire strategic thesis: a tool that does the synthesis and hands you decisions, not a dashboard that hands you data and makes you the analyst.

Everything else — the tables, the trade evaluator, the heatmap — is excellent and necessary, but it's downstream of getting those three right. The competitors have all the surfaces; what none of them have is a coherent *feel* built from a small set of perfect primitives, plus the honesty to show confidence and the respect to never make you navigate to look something up.

The visual North Star is restraint: a dark, dense, typographically excellent professional instrument that treats the user as a serious decision-maker. Tabular figures everywhere. Color that means something and never works alone. Motion only where it aids continuity. No radar charts, no gauges, no confetti, no customizable dashboard — the product has an opinion, and the interface expresses it.

Build the chip. Build the peek. Build the Board. Make those three perfect. Earn the rest.
