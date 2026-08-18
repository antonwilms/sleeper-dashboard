# Design Brief v2 — the data-first dynasty terminal

**For:** the Claude Design project (`App design overhaul`), as the input brief for the next design round.
**From:** a repo-grounded research session, 2026-08-16.
**Baseline:** app `sleeper-dashboard` @ `3f55245` · data `sleeper-dashboard-data` @ `f0c1fc4`.

This is the successor to [`docs/design_handoff_dynasty_portfolio/README.md`](../design_handoff_dynasty_portfolio/README.md),
which was the *output* of the previous design round and has now been built (1b, Slices i–viii,
2026-08-10 → 2026-08-16). That document stays as the historical record of what was asked for; this
one says what to design next and why.

---

## 0. How to read this package

| File | What it is | Who reads it |
|---|---|---|
| **`README.md`** (this file) | The brief. Thesis, target IA, surface-by-surface design asks, constraints, open questions. | The designer. Self-contained — you can work from this alone. |
| [`01-data-inventory.md`](01-data-inventory.md) | Appendix A. Every data family and field the app can show today, with **verified** coverage and null rates, and where each should surface. | The designer, when deciding whether a proposed element is real. |
| [`02-research-basis.md`](02-research-basis.md) | Appendix B. What the predictive research says is worth showing, plus a competitor scan and the design implications of each. | The designer, for the "why this and not that" behind §5. |
| [`03-data-gaps.md`](03-data-gaps.md) | Appendix C. What is missing, ranked, with acquisition cost — including things the previous handoff assumed were impossible that are not. | Anton, for sequencing. Designer, to know what's off the table. |
| [`04-reconciliation.md`](04-reconciliation.md) | Appendix D. **Read this second.** A second independent research pass was run in Claude.ai Cowork; this cross-checks its numbers, records what each pass found that the other missed, resolves the divergences, and merges the open-question lists. | The designer, before starting. |
| [`05-round4-review.md`](05-round4-review.md) | Appendix E. Review of the **Round 4** design that came back against this brief (`App v2 - dark data`): one blocking finding, three correctness fixes, two deferred deliverables, and a list of what must **not** change while fixing them. | The designer, for the fix pass. |
| [`claude-ai-cowork-prompt.md`](claude-ai-cowork-prompt.md) | **Not part of the design handoff.** The prompt used for that second pass. | Anton only. |

**There is a companion document.** [`docs/design_target_state.md`](../design_target_state.md) is the
independent Cowork pass's own plan, written without reading this package. It is **not superseded** —
it is the stronger document on *what data goes where*, with per-element field citations, and its §7
should be read alongside this brief's §5. Appendix D §5 gives a reading order across both.

**Verification convention.** Claims in this package are marked where it matters:
**[data-checked]** = verified by reading the actual data files or source this session;
**[doc]** = taken from repo documentation without independent verification.
The repo's own `docs/signal-registry.md` set this precedent and it is worth keeping — several
things "everyone knows" about this codebase turned out to be stale (see §1.3).

---

## 1. Where the app actually is

### 1.1 What is live

| Surface | Route | State |
|---|---|---|
| **Market** | `/market` | Real. One table over ~600 rows. Three column sets (Value / Outlook / Production), position pills, twelve filter dimensions, free-text filter, saved presets, sort, pagination. **This is the app's centre of gravity and the current default landing.** |
| **Portfolio** | `/portfolio` | Real. Four metric tiles (roster value, weighted age, concentration, projected points), a value-by-age-band chart, a holdings table (ASSET / VALUE / 5-YR PPG / PROJ Δ / HORIZON). |
| **Player detail** | pop-up, no route | Real. Opens from any row on any surface. Up to 4 players open as tabs, with a 7-row compare matrix. Body = identity row, 4 tiles, career-PPG-plus-projection chart, "what drives the score", "why next season", right rail (portfolio share, signals, positional peers). |
| **Global search** | `⌘K` in the top bar | Real. Jumps to a player from anywhere. Desktop/tablet only. |
| **League** | `/league/{standings,schedule,rosters}` | Real, but untouched by the redesign — still on the old adaptive light/dark tokens. |
| **Draft board** | `/board` | **Gated placeholder.** Needs a marginal-value engine + season-phase classifier. Neither exists. |
| **Trade desk** | `/trade` | **Gated placeholder.** Same prerequisites. |
| **Rookies** | seasonal nav slot | Reserved Jan–May, **no screen behind it.** |

**The ACT group is 100% dead.** Draft board and Trade desk are both placeholders and Rookies is
empty. One third of the navigation currently leads nowhere. This is a design problem in itself
(§5.7).

### 1.2 What was deliberately left out of 1b

The 1b program ran under two standing directives from Anton (master plan §4a), and both still
govern:

> **§4a.1 — "the first prio is to visualise (or just show) all kinds of data for the nfl players.
> having computed scores and rankings is secondary to that."**

> **§4a.2 — "i would suggest to rather leave things out to have a clean first version of the new
> UI. anything that i feel that is missing then i will reiterate over then."**

Under §4a.2 the following were cut from the shipped design, on purpose: Portfolio's "needs a
decision" alert cards, the Holdings `CALL` verdict column, the three tile deltas, the
30-days/Season/All-time control, the header's "contending window open" clause, the Market `RISK`
Low/Med/High label, the 30-day KTC delta column, and the entire tooltip subsystem.

**Most of those cuts were correct and should stay cut.** Two should now be revisited, because the
reason they were cut has expired — see §1.3.

### 1.3 Three facts that have changed since the cuts were made

These matter because they move real capability from "impossible" to "available", and the previous
handoff's data assumptions are stale on all three.

**(a) The KTC history gap is closed. [data-checked]**
The 30-day value delta was cut because the KTC snapshot series was broken — every snapshot was
registered `inProgress: true` and the app's data-store loader rejected `inProgress` entries, so
every `ktcHist*` signal came back null. That contract bug is **fixed** (`src/utils/ktcHistory.js`
now passes `allowInProgress: true` on this one read path). There are now **11 snapshots spanning
2026-05-18 → 2026-08-10**, weekly and unbroken since 2026-06-23, which clears the loader's own
`WINDOW_SIZE = 8` / `MIN_SPACING_DAYS = 5` requirement. `computeKtcSignals` produces delta,
delta %, volatility, trajectory slope + label, rank-vs-position-median trend, and a confidence
band — **all computed today, none rendered anywhere.**
→ *The app now has a time dimension for market value. It shows none of it.* (§5.6)

**(b) Player-level EPA is already ingested. [data-checked]**
The repo's own `docs/prediction-research-eval.md` names EPA/attempt as the single highest-priority
gap — "absent from the entire app", routed to a future data-repo ingest. That was true of `src/`,
and it is still true that nothing consumes it. But the data is **already in the store**:
`nflverse/gamelogs/<year>.json` carries per-game `passingEpa`, `rushingEpa`, `receivingEpa`,
`passingCpoe`, `racr`, `pacr`, `targetShare`, `airYardsShare`, `wopr`, air yards, YAC, first downs
and sacks — **2012–2025, every season, keyed by `sleeper_id`, QB/RB/WR/TE/FB**. Non-null rates on
the position that matters: QB `passingEpa` 95%, WR `receivingEpa` 86%, RB `rushingEpa` 86%,
TE `receivingEpa` 89% (2024 panel).
Team-level EPA is separately available per team-week in `nflverse/teamcontext/<year>.json`
(off/def, pass/rush splits, success rate, PROE, pace, red-zone), 2012–2025.
→ *The research's #1 metric is sitting in the CDN, fully loaded by nobody.* (§5.3, §5.4)

**(c) Per-manager positional strength is derivable, not missing.**
The previous handoff closed with: *"per-manager positional strength above replacement, for the
matrix … [does] not exist in the current app. `2b`'s matrix and `2a`'s offers card both depend on
them."* Half of that is wrong. Positional strength per manager is a **derivation over data the app
already has** — every roster, every player's dynasty score and KTC value, already in
`playerRowsWithProj` with `ownerTeamName` on each row. No ingest is required. Inbound trade offers
genuinely are unavailable.
→ *2b (League map) is substantially cheaper than the handoff assumed.* (§5.8)

### 1.4 The dark-data problem, stated plainly

The app **ingests far more than it shows**. Six data families reach the browser (or the store) and
render nowhere:

| Family | Grain / coverage | Status |
|---|---|---|
| `nflGameLogs` | player-game, 2012–2025 | Loader exists in `src/api/`. **Never called by `App.jsx`.** [data-checked] |
| `teamContext` | team-week, 2012–2025 | Loader exists. **Never called by `App.jsx`.** [data-checked] |
| `nflSchedule` | game, 1999–2026 | Loader exists. **Never called** since the Explorer's game log was deleted. [data-checked] |
| `advStats` | player-season, 2012–2025 | **Loaded every session**, cached, gated — and rendered nowhere since `AdvancedStatsPanel` was deleted. |
| Enrichment overlay | coaching 95 entries; scheme/injuries/notes **0 entries** [data-checked] | **Loaded every session**, rendered nowhere. |
| `collegeStats` | player-season, 2017–2025 | Feeds the rookie projection. No display consumer. |

Plus two capture-only families with no app loader at all: `nfl/players-state` (weekly
status/injury/depth/practice-participation, 4 captures so far, 2026-07-18 → 2026-08-08) and
`nflverse/oline` (team-week OL depth charts, 2026 only).

Plus three orphaned computations still running every session with no renderer: `depthChart` (full
team depth chart by position), `shareHistory`/`usageShare`, and `roleRank`.

Plus the projection's **73-key `factors` object** — the complete working of every adjustment the
model makes — of which the pop-up currently surfaces a handful of chips.

**This inventory is the raw material for v2.** Appendix A ([`01-data-inventory.md`](01-data-inventory.md))
enumerates it field by field with verified coverage.

### 1.5 The league is superflex, and the app does not know

Found 2026-08-17, after both research passes, and it shapes several surfaces below.

The real league (`Dynasty 040`, 12 teams, dynasty) has this lineup:

```
QB · RB · RB · WR · WR · WR · TE · FLEX · FLEX · SUPER_FLEX · BN ×18
```

Ten starters, of which **three slots are position-agnostic** — two FLEX and one **SUPER_FLEX**, so
the league can start up to two quarterbacks. Across twelve teams that is 36 of 120 starting slots.

- **The market data is correctly matched.** The KTC scraper requests `format=2`, which is KTC's
  superflex value set. Josh Allen at 9997 sitting level with the top RB and WR confirms it. No bug.
- **The model is lineup-blind.** `SUPER_FLEX`, `superflex`, `FLEX` and `roster_positions` appear
  **nowhere** in `src/`. `POSITION_ORDER` is a flat `['QB','RB','WR','TE','K','DEF']`. Every
  positional rank, percentile and dynasty label is computed against a pool that knows nothing about
  what the league actually starts.

**What this means for the design:** any element that says "what this player is worth *in your
league*" is currently saying it without knowing the league starts two QBs. It is also the reason
Q9 ("what is above replacement?") was hard — see
[`04-reconciliation.md`](04-reconciliation.md) §7.1–7.2, which narrows it to a choice between two
named methods. Whether format-awareness should change the *dynasty score* or only the *display* is a
new open question, and a projection-track one rather than a design one.

---

## 2. The thesis for v2

**The app should be an evidence surface, not an oracle.**

Three things point the same direction:

1. **Anton's directive (§4a.1)** — show the data, the verdicts are secondary.
2. **The research** — the best models explain 50–70% of season variance; football's year-over-year
   correlations are structurally low because 22 players interact on every snap. A product that
   leads with a confident verdict is over-claiming its own accuracy. (Appendix B §1.)
3. **The competitive gap** — every dynasty tool on the market is a black box that hands you one
   number. KeepTradeCut's own crowd-sourced value, FantasyCalc's trade-derived value, Dynasty
   Daddy's calculator: all output-first, none show their inputs. The reviewers' stated weaknesses
   are the same every time — "lacks contextual analysis", "lacks definitive advice", "leans toward
   short-term sentiment". (Appendix B §2.)

So the differentiator is not a better number. It is **making the few genuinely predictive
quantities visible, comparable, and traceable over time, with honest coverage** — and letting the
manager form the verdict. That is also, conveniently, the only thing this app can honestly ship
today, since the marginal-value engine does not exist.

**The one-line brief:** *the dynasty terminal that shows its work.*

Concretely this means v2's job is to close the gap between what the app **knows** (§1.4) and what
it **shows**, in a form that a serious manager can read fast.

---

## 3. The two structural gaps

Everything in §5 traces back to one of these. Naming them separately because they are the two
whole *dimensions* the current UI has no representation of at all.

### 3.1 Environment — the player's team is invisible

The app shows a player's production and its own projection of it. It shows nothing about the
offence that produces it: no pass rate, no pass-rate-over-expected, no pace, no red-zone tendency,
no offensive or defensive efficiency, no line, no coaching, no depth chart.

The research is unambiguous that this is the biggest disruptor of multi-year outlook — a QB change,
a coordinator change, or an OL change resets a pass-catcher's projection more than anything the
player does himself. (Appendix B §1.4.) The app's own research evaluation ranks it the
**second-highest priority gap** in the system.

And the data is there: `teamContext` (2012–2025 team-week PROE / pace / EPA splits / red-zone /
defense-faced), `depthChart` (already computed), coaching (95 entries, one season), OL (2026 only).

### 3.2 Time — the app has no memory

Every number on screen is a point estimate of *now*. There is no "what changed", no value
trajectory, no usage trajectory rendered, no role-change history, no injury timeline, and no record
of whether the model's previous projections were any good.

This is what makes the current app feel like a spreadsheet rather than an instrument. It is also
where the honest, defensible differentiation lives: the app **banks** a weekly KTC snapshot, a
weekly Sleeper player-state capture, a daily-ish projection snapshot, and a grading harness that
scores past projections against realised outcomes. **No competitor has a track record. This one
does and hides it.**

---

## 4. Target information architecture

Current rail: **MANAGE** (Portfolio, Market) · **ACT** (Trade desk, Draft board) · **LEAGUE**
(Standings, Schedule, Rosters).

Proposed target:

```
MANAGE     Portfolio          what I own, how it is aging, what it is worth
           Market             every player, every metric, filterable          ← default landing
           Teams        NEW   the 32 offensive environments
LEAGUE     League map   NEW   assets × rosters; who needs what          (2b, reduced)
           Standings
           Schedule
           Rosters
ACT        Rookies            seasonal (Jan–May)                        (phase 2)
           Trade desk         gated — do not design yet
           Draft board        gated — do not design yet
—          Player detail      pop-up, mountable from every surface anywhere
—          Changes      NEW   a "what moved" feed                       (2a, reshaped)
```

Three deliberate moves:

- **Teams is a first-class surface, not a tab.** It is the missing half of every player judgment,
  it has 14 seasons of data behind it, and 32 rows is a screen, not a drawer.
- **League map moves under LEAGUE, not MANAGE.** It answers "who would want this" — a league
  question, not a portfolio one — and it makes the LEAGUE group substantive rather than a
  standings backwater.
- **Changes is not a home screen.** See §5.9 — the ranked-decisions concept from `2a` is deferred,
  but its genuinely-buildable core (what moved since you last looked) survives as a light surface.
  It should *not* become the landing page; that would re-invert the app back to verdict-first.

**Open question for Anton:** `DEFAULT_ROUTE` is still `/market`, set "temporarily" during Slice iii
when Portfolio was a placeholder. Portfolio is real now. Recommend **keep `/market` as the
landing** — it is the surface the thesis points at, and Portfolio is one click away. Flagged
because it was explicitly left as an open product call. (§11, Q1.)

---

## 5. Surface-by-surface design brief

Each subsection states: **purpose · what it must show · what is new · where the data comes from ·
the design questions we want answered.** Data claims are backed by Appendix A.

### 5.1 Market — add the fourth column set, and a trend column

**Purpose (unchanged):** every player, every metric, in one filterable table.

Market works and should not be restructured. Three additions:

1. **A fourth column set: `EFFICIENCY`.** The current three are Value (score/market/career/ceiling),
   Outlook (projection + signals), Production (raw counting stats by position). None of them carry
   the metrics the research says are stickiest. The new set, per position:
   - **QB** — EPA/attempt · CPOE · sack rate · pass air yards/attempt · rush EPA
   - **RB** — carry share · **target share** (the research's cleanest RB signal) · rush EPA/attempt ·
     yards after contact proxy (`rush_yac`) · broken tackles (`rush_btkl`)
   - **WR/TE** — target share · **air-yards share** · receiving EPA/target · RACR · aDOT ·
     drops (`rec_drop`) · YAC
   All of these are derivable from families already in the store (Appendix A §2, §3). None of them
   may feed the projection — this is a display set only, and the repo has hard invariants and tests
   enforcing that.

2. **A `TREND` column, available in every set.** Now that KTC history is populated (§1.3a): a
   compact value sparkline plus a signed delta over the available window. **The window is currently
   ~13 weeks and must be labelled as such** — this is the first place the coverage-honesty problem
   (§6.2) becomes visible.

3. **Team-environment as a filter dimension.** "Players on a top-10 PROE offence", "players whose
   team pace is bottom quartile". Filter chrome already exists; this is one more group in the
   existing panel.

**Design questions.** Four column sets is one more than a segmented control comfortably holds at
this width — does the control become a dropdown, a two-row segment, or does something merge?
Is `TREND` a column or a persistent left-of-`PLAYER` gutter element? How does a sparkline column
sort? *(Existing constraint: `dp/MarketTable.jsx` renders a fixed position-pill row + pager;
`PAGE_SIZE = 50`.)*

### 5.2 Player detail — the big one

**Purpose:** everything known about one player, without leaving where you were.

This pop-up is where the dark data has the most obvious home, and it is currently the app's
thinnest surface relative to what it could hold. Today: identity, four tiles, a career bar chart,
five score components, a few projection chips, three right-rail blocks.

**What it should hold in v2**, as sections (naming is the designer's call):

| Section | Content | Source | New? |
|---|---|---|---|
| Identity + headline tiles | as today | — | no |
| **Career & projection** | as today, plus the projection band made honest (see §6.2) | — | partly |
| **Game log** | week-by-week: opponent, result, snaps, targets/carries, yards, TD, fantasy points, **per-game EPA** — with the game's own context (spread, total, roof, weather) joined from the schedule | `nflGameLogs` + `nflSchedule` | **yes** |
| **Distribution** | the boom/bust histogram of per-game points, with mean and ±SD marked. The app already computes pooled mean / SD / CV / boom-bust rate at season grain (`outlookConsistency.js`) and shows only the `±sd` scalar. | `careerStats.weeklyPoints` + `nflGameLogs` | **yes** |
| **Usage & efficiency** | multi-season trajectory of snap share, target/carry share, air-yards share, red-zone share, aDOT, EPA, CPOE/RACR. Levels *and* trend — the research anchors on the level, the app currently only consumes the trend. | `nflGameLogs`, `advStats`, season-totals | **yes** |
| **Environment** | his team's PROE, pace, pass rate, offensive EPA split, red-zone rate, and defence-faced — over the last 3 seasons, with a marker for where his own tenure sits. Plus the team depth chart at his position (already computed, never rendered). | `teamContext`, `depthChart` | **yes** |
| **Availability & role** | games played / missed by season with the reason shape the app already classifies, plus the weekly status/injury/depth timeline once the players-state loader exists | `durabilitySignals`, `nfl/players-state` | **yes** |
| **What drives the score** | as today (5 weighted components) | — | no |
| **Why next season** | as today, **expanded** — the projection carries 73 `factors` keys; a "show the full working" affordance behind the chips is the transparency moat the strategy doc names | `seasonProjection.factors` | partly |
| **Comps** | as today | — | no |
| **Right rail** | portfolio share, signals, positional peers — as today | — | no |

**The structural design problem to solve.** The pop-up's tab strip is already spent on *multiple
open players* (up to 4, FIFO). A second tab row for *sections within one player* would put two tab
bars in one panel, which is the thing the original 1b redesign existed to eliminate. Options worth
drawing: a left section rail inside the panel body; accordion sections with a sticky section index;
a single long scroll with a scroll-spy rail; or a "detail level" control (Overview / Everything).
**We would like a recommendation, not a menu.**

Secondary: the panel is `max-width: 1320px`. Does a section-rail layout still fit alongside the
300px right rail, or does the right rail's content get absorbed into sections?

### 5.3 Teams — new surface

**Purpose:** the 32 offensive environments, as first-class objects.

**Index view.** 32 rows, sortable, one per team: pass rate, **PROE**, plays/game, seconds per play
(pace), offensive EPA/play with pass/rush split, success rate, red-zone trips and TD rate, points,
and the defence-faced mirror. All fields exist per team-week 2012–2025 and aggregate cleanly
(components are stored alongside rates precisely so rates are recomputed, never summed).

**Team detail.** One team: those metrics as a multi-season trajectory, the current depth chart by
position (already computed), the roster's fantasy-relevant players with their share of team
targets/carries/red-zone, coaching (HC/OC/DC where known), and the schedule.

**Why this earns a surface.** It is the only way the app can answer "is this player's environment
getting better or worse", which the research names as the dominant multi-year disruptor. It also
makes every player judgment in Market and the pop-up interpretable rather than absolute.

**Design questions.** Is the index a table or a small-multiples grid of 32 sparkline cards? How are
league-relative positions encoded — percentile bars, rank badges, or a distribution strip showing
where this team sits? Does a team open as a route or as a pop-up like players do? *(Recommendation:
route — a team is a destination, not a lookup.)*

### 5.4 Portfolio — reinstate the time dimension

**Purpose (unchanged):** what I own, what it is worth, how it is aging.

Portfolio was thinned hard under §4a.2, and correctly: every cut item needed either a prior
snapshot of the same aggregate or a decision engine. **The snapshot half of that is no longer
true.** With 11 KTC snapshots banked and growing weekly, the following become real:

- **Tile deltas** — roster value and concentration now have a genuine 13-week baseline. Weighted
  age and projected points do not (they need a banked aggregate, not a KTC series) — so this is a
  *partial* reinstatement, and the design must handle two tiles with deltas beside two without.
- **A `30D` / `TREND` column in Holdings** — the same treatment as Market's (§5.1.2).
- **Roster value over time** — one line chart, the window it actually has.

Two things stay cut and should not come back until the engine exists: the `CALL` verdict column
and the "needs a decision" alert cards.

**One genuine capability gap:** Portfolio cannot represent **rookie draft picks**, which are a
large fraction of real dynasty value. The app never loads Sleeper's traded-picks endpoint. This is
a cheap fix with high product value (Appendix C, rank 2) — worth designing for now even if it
ships in phase 2, because it changes what "roster value" and "concentration" mean.

**Design question.** Two tiles with deltas and two without looks broken. Options: show the window
length as part of the delta (`▲ 3.2% · 13w`), use a different tile treatment for aggregate-only
values, or hold all deltas until all four have a baseline. Recommendation wanted.

### 5.5 Rookies — the empty seasonal slot

**Purpose:** the incoming class, Jan–May.

There is a nav slot and no screen. The app has: college production 2017–2025 (dominator rating,
breakout age, production trend), actual NFL draft slot 2010+, KTC values including rookie picks,
and a purpose-built rookie projection path. Everything needed for a prospect table exists; nothing
renders it.

The research is specific and worth honouring in the design: **college dominator + actual draft
capital are the only defensible pre-NFL inputs; combine drills explain <2% of career outcome
variance.** The app has *zero* combine inputs today, which is a correct and unusual choice.
**Do not design a spider chart of athletic testing.** (Appendix B §1.3.)

**Design ask:** a prospect surface built on production and draft capital, with an explicit,
visible statement of the class's own uncertainty. Note the coverage boundary: college data starts
2017, so any player whose college career predates it has no dominator rating.

### 5.6 Changes — the reshaped `2a`

**Purpose:** what moved since you last looked.

See §5.9 for the verdict on `2a` as designed. What survives is the part that is evidence rather
than verdict, and that the app can populate today:

- **Value movers** — biggest KTC risers/fallers over the window, from the snapshot series.
- **Role changes** — depth-chart position/order changes, from the weekly players-state captures.
- **Status changes** — injury designation, practice participation, activation, team change. Same
  source; this is the only place the app can ever get this, since Sleeper exposes current state
  only and every uncaptured week is permanently lost.
- **Model movement** — players whose projection or dynasty score moved materially between banked
  projection snapshots.

**Constraint that shapes the design:** the players-state capture began **2026-07-18** and has
**4 weekly snapshots** [data-checked]. This surface will be thin for months and must look correct
when it has three items in it, not just when it has thirty.

**Design questions.** Feed, or grouped-by-type digest? Is "since you last looked" a real per-user
state (the app has no accounts, only `localStorage`) or a fixed window? What is the empty state of
a change feed in a quiet week — and how does it avoid the trap of manufacturing significance?

### 5.7 The gated surfaces — fix the dead-nav problem instead

Draft board and Trade desk are placeholders and Rookies is empty; the whole ACT group leads
nowhere. **Do not design Board or Trade desk** — both depend on a marginal-value engine that does
not exist and is not scheduled (§10).

**Do design the honest version of a gated destination.** A placeholder that says "coming soon" is
worse than a nav item that isn't there. Options: remove them from the rail until real; keep them
with an explicit disabled treatment and a one-line statement of what they are waiting on; or fold
the group away entirely and let ACT appear when it has a member. A rail with a permanently dead
third of its items undermines the whole "honest instrument" positioning.

### 5.8 League map — the reduced `2b`

**Verdict: build it, and it is cheaper than the original handoff assumed** (§1.3c).

**Keep** from the `2b` design:
- The **age × value scatter** with quadrant framing (Appreciating core / Sell window / Lottery
  tickets / Dead weight). Every input is on the row today.
- The **supply-and-need matrix** — 12 managers × QB/RB/WR/TE/PICKS. Derivable from rosters +
  dynasty scores; no ingest needed. *(Picks column needs the traded-picks endpoint — Appendix C
  rank 2.)*
- The **"who would want it"** list, driven off the matrix deficits.

**Cut:**
- **"Shape of a deal" (YOU SEND / YOU GET) and the value-gap meter.** These are marginal-value
  engine output. Under §4a.2 they get left out, not approximated.
- **Per-manager hand-written assessments.** These were authored prose in the mock, not derived
  text. Generating them would be fabrication.

**Design question.** With the deal-shaping cut, does the right-hand panel still earn 300px, or does
the surface become scatter-plus-matrix with selection state shown inline?

### 5.9 `2a` Decision desk — the verdict

> **SUPERSEDED — the verdict is KILL, not defer.** The independent Cowork pass reached the same
> conclusion by a stronger route, and the deciding argument is one this section under-weighted:
> the design's cards each carry a confidence readout on a meter (`conf 78`, `71`, `66`, `55`, `92`),
> **and the app computes no calibrated probability of anything.** Even with a marginal-value engine
> those numbers would be invented — so the specific artefact is unbuildable independent of the
> engine, and "defer" wrongly implies a future where it ships as drawn. Compounding it: the verb
> tags are the `CALL` column that §4a.2 already cut from Portfolio, and cutting it there while
> shipping a whole screen of it is incoherent. See [`04-reconciliation.md`](04-reconciliation.md)
> §4.1. The reasoning below stands as the record; the "revisit when" clause does not.

**Kill the concept; harvest the buildable third.**

Three independent reasons, in descending weight:

1. **It inverts the product thesis.** `2a` makes the home screen a ranked stack of verdicts and
   "demotes the dashboard to a sidebar". That is precisely the direction §4a.1 rules out. Shipping
   it would make the app's loudest surface its least defensible one.
2. **Its central input does not exist.** Every card needs a confidence-scored, roster-conditioned
   marginal value. That engine is what gates Board and Trade desk, and nothing is building it.
3. **Its data assumptions do not hold.** Of the five card archetypes: `SELL`/`BUY` reduce to
   restating the market-divergence chip in verb form (the pop-up already says it without pretending
   to be advice); `RISK` (positional concentration) is genuinely computable *today*; `CLAIM`
   requires waiver state the app does not load; `HOLD` requires **inbound trade offers, which
   Sleeper does not expose** — so one of the five is structurally impossible.

**What survives:** the "what changed" primitive (§5.6), and — worth stealing explicitly — the
**QUIET / NOTHING TO DO** card, which is the best idea in the whole `2a` design. Making silence
explicit ("these 9 assets are where the model and market agree") is honest, cheap, and a genuine
counterweight to a feed that would otherwise manufacture urgency.

~~**Revisit when:** the marginal-value engine exists *and* the app has ≥1 full season of graded
forward projections (~Jan 2027) to calibrate confidence against.~~ — retracted per the note above.
The engine would not rescue this design.

### 5.10 Model track record — the surface nobody else has

**Purpose:** how right has this thing been?

The app banks a projection snapshot per session, the data repo has 26 of them plus a grading
harness (`bin/grade.mjs`) that scores captured projections against realised outcomes, and the
first true forward grading run lands when the 2026 season settles (~Jan–Feb 2027).

**Every competitor is a black box; none of them will ever show you their hit rate.** A surface that
does — per position, per confidence band, per horizon, with the misses shown alongside the hits —
is the single strongest expression of "honest, not precise", and it is not buildable by anyone who
didn't start banking snapshots a year ago.

**This is a phase-3 surface** (the data is calendar-gated, not effort-gated) but it is worth
designing the shape of now, because knowing it is coming should influence how confidence is encoded
everywhere else (§6.2).

---

## 6. Cross-cutting systems to design

These are not screens. They are conventions that every screen needs and the app currently lacks.

### 6.1 A definition / tooltip system — explicitly requested

The tooltip subsystem was **deleted outright** in Slice viii, toggle and all, with the note:
*"I think I will want to bring tooltips back, but the ones we had before were not that helpful, so
let's not design them yet."*

Now is when. v2 puts PROE, EPA/play, CPOE, RACR, air-yards share, aDOT, WOPR and success rate on
screen. A data-dense surface that shows metrics like these **must** be able to explain them, or it
is only usable by someone who already knows everything on it.

**Design ask:** a definition affordance that scales from a column header to a chart axis to a
single cell, that says what the metric is, *what a good value looks like*, and *how much history
backs it* — without becoming a hover-dependent hunt. Note the standing rule from the previous
handoff, which still holds: **nothing may be hover-dependent for meaning.**

### 6.2 A coverage & confidence encoding

This is the hardest and most important system in the package.

The app's signals have wildly different histories, and the difference is invisible today:

| Signal | Real coverage [data-checked] |
|---|---|
| Fantasy scoring, per-season team | 2012–2025 |
| Target/carry/air-yards share, EPA, CPOE | 2012–2025 |
| Red-zone usage | 2012+ (thin 2012, full 2013+) |
| Team context (PROE/pace/EPA/RZ) | 2012–2025 |
| nflverse roster (team/status) | **2016–2026** — 2012–2015 absent |
| College production | **2017–2025** |
| **Snap share** | **2020+ only** — structurally absent before |
| **KTC value history** | **2026-05-18 → now (~13 weeks)** |
| **Weekly player state** | **2026-07-18 → now (4 captures)** |
| **OL composition** | **2026 only** |
| Coaching | 95 entries, **one season** — no change detection possible |
| Scheme / injuries / notes | **empty** |

A UI that renders a 14-season EPA trend and a 13-week value trend with the same visual weight is
lying by omission. The repo already enforces honesty at the source level — the `PROVISIONAL(...)`
comment convention, and a hard rule that a missing value renders `—` and **never** a fabricated
fallback — but there is no *visual* language for it.

**Design ask:** one consistent encoding, working at cell, tile, chart and section level, for
(a) how much history is behind this number, (b) how confident the model is where a model is
involved, and (c) the difference between *zero* and *unknown*. The last one is live today: the
career sparkline 0-pads absent seasons, so "missing season" and "genuine 0.0 PPG season" are
currently indistinguishable.

### 6.3 A trend treatment

Once §3.2 is addressed, most headline numbers acquire a history. There should be **one** answer to
"how do we show that this number is moving", used everywhere: sparkline, delta, direction glyph,
window label. Not five.

Existing constraint: `dp/cells.jsx`'s `CareerBars` is a fixed 5-wide 0-padded sparkline whose
dimensions are explicitly not to be re-spec'd per caller. Either it becomes the trend primitive or
it gets a sibling — that is a design call.

### 6.4 Empty and degraded states as a first-class set

Given §6.2, a large share of what this app renders is legitimately absent. The pop-up alone already
handles eight distinct empty cases explicitly. v2 multiplies this: a 2019 player has no snap share,
a 2015 player has no roster record, a pre-2017 college career has no dominator, a rookie has no
game log, a just-signed free agent has no team context.

These should be designed as a **set with a shared grammar**, not improvised per component.

---

## 7. Constraints — non-negotiable

**Tokens.** Two families coexist:
- `--color-dp-*` / `--font-dp-*` — **dark-only, no light override**. Used by Portfolio, Market and
  the pop-up. Every new surface in this brief should use these.
- `--color-*` — light/dark adaptive. Used by the shared chrome (`TopBar`/`NavRail`/`BottomTabBar`)
  and by League/Board/Trade.
Because the page `body` follows the theme toggle, **every dp surface must paint its own ground**
before using any `text-dp-*` class, or it is unreadable in light mode.

**The seam is now an open question** (§11, Q2). Adding Teams, League map and Changes as dp surfaces
leaves League as the only adaptive content surface, wrapped in adaptive chrome. Either commit the
whole app to dark-only, or derive light values for the dp family. It should not stay accidental.

**Typography.** Public Sans (UI, 400/500/600/700) + IBM Plex Mono (all numerals, all uppercase
micro-labels, 400/500/600). Every number a user compares is mono.

**Colour.** Blue (`up`, #4f8bff) / amber (`down`, #f2a13b) — deliberately colour-blind safe, no
red/green anywhere. **Direction is never carried by colour alone**; every up/down value pairs its
colour with a glyph or a word. The full token table is in the previous handoff and still applies.

**Assets.** None. No images, no icon fonts, no SVG illustration. Every glyph is a Unicode character;
every chart is CSS boxes or inline SVG. Fonts are self-hosted.

**Never fabricate.** The repo rule, and it is enforced by tests: a value with no source renders
`—` or is omitted. No "reasonable default", no baseline snapshotted at page load, no zero-as-if-
measured. If a design element needs a number that doesn't exist, the element does not ship.

**Nothing hover-dependent for meaning.** Hover may add affordance; it may never carry information.

**Display-only means display-only.** `advStats`, `nflSchedule`, `nflGameLogs`, `teamContext` and
`seasonRanks` are all under hard invariants (with tests) that they must never influence
`projectedPPG` or the dynasty score. A design may surface them freely; it may not imply they feed
the model.

---

## 8. Desktop-only now, mobile-cheap later

Per Anton: **design desktop only**, but make the decisions now that make mobile a port rather than
a redesign. Eight concrete asks — each costs almost nothing at design time and is expensive to
retrofit:

1. **Column priority order for every table.** State, per table, the order in which columns drop as
   width shrinks, and which two or three are the irreducible core. Desktop renders all of them; the
   order is documentation until it isn't.
2. **Specify the pop-up as a panel that can become a full-screen sheet.** No content may depend on
   the 300px right rail being *beside* the main column — specify the rail as sections that stack.
3. **The compare matrix needs a stacked fallback spec.** Four columns of metrics do not survive
   375px. One player per card, or a metric-paged view — decide now.
4. **Charts get intrinsic aspect ratios, not fixed pixel heights.** The current spec has `height:
   190px` / `200px` bars; ratios port, pixels don't.
5. **Filter panel: give the 1-column order.** The 4-column grid needs a defined linear sequence.
6. **Nominate the five mobile primaries.** `BottomTabBar` is capped at 5 and the target IA has
   eight-plus destinations. Which five, and how the rest are reached.
7. **Short number forms.** Specify `48.3k` / `+1.5k` variants alongside full forms so cells can
   narrow without re-deciding.
8. **Minimum touch target for row-level interactions.** Rows are already `role="button"`; state the
   floor (44px) so desktop row height doesn't get set below what mobile needs.

---

## 9. Phasing

Not a schedule — a dependency order. Each phase is buildable without waiting on the next.

**Phase 1 — surface what is already in the store.** No new ingest, no new derivation infrastructure.
- Player detail: game log, distribution, usage & efficiency, environment sections (§5.2)
- Market: `EFFICIENCY` column set + `TREND` column (§5.1)
- Teams surface (§5.3)
- Portfolio: value trend + tile deltas (§5.4)
- The definition system (§6.1), coverage encoding (§6.2), trend treatment (§6.3)

**Phase 2 — small ingests and derivations, still no engine.**
- Traded picks → picks as portfolio assets (Appendix C rank 2)
- Per-manager positional strength (derived) → League map (§5.8)
- Players-state loader → Changes surface (§5.6) and the availability timeline
- Rookies surface (§5.5)
- Coaching ≥2 seasons → change detection (Appendix C rank 4)

**Phase 3 — engine- and calendar-gated.**
- Marginal-value engine → Trade desk, Draft board, and only then a reconsidered `2a`
- Model track record (§5.10), once forward grading lands ~Jan 2027

---

## 10. What NOT to design

Stated explicitly so it does not get drawn and then cut, as happened with several elements in the
last round:

- **Trade desk and Draft board screens.** Both gate on a marginal-value engine that does not exist.
- **`2a`'s ranked decision cards.** §5.9.
- **Any per-player verdict** — "Sell high", "Cut bait", "Buy". The app cannot produce these
  honestly, and a wrong-but-confident verdict next to a player's name is worse than a missing
  column. This includes the Holdings `CALL` column, which was already cut once.
- **Combine / athleticism visualisations.** The research is unambiguous (<2% of variance) and the
  app deliberately ingests none. Do not add RAS, speed score, or a physical-testing radar.
- **A strength-of-schedule ranking presented as a dynasty signal.** SoS is a one-week predictor;
  the app's own research position is that it does not belong in a multi-year projection. Schedule
  data may appear as *context on a game log* — never as a season-long "easy schedule" badge.
- **A "projection interval" that the model does not produce.** The current chart header implies a
  ±band around the projection; the app has a *historical* per-game SD, which is a different
  quantity. Either the copy changes or the band goes.
- **Configurable dashboards / drag-and-drop widgets.** Standing product position: opinionated
  defaults over configuration.

---

## 11. Open questions for Anton

> **The merged list lives in [`04-reconciliation.md`](04-reconciliation.md) §6** — ten questions
> across both research passes, deduplicated. Three of them block design work: the pop-up container
> question (Q4 below), how an untraded future pick is priced (Q8), and what "above replacement"
> means for the 2b matrix (Q9). The seven below are this package's own, kept for their reasoning.

Decisions that change what gets designed. Recommendations given; none are decided.

| # | Question | Recommendation |
|---|---|---|
| **Q1** | `DEFAULT_ROUTE` — does Portfolio reclaim the landing now that it is real? | **Keep `/market`.** It is the surface the thesis points at. |
| **Q2** | The token seam — commit the whole app to dark-only, or derive light values for `--color-dp-*`? Adding three dp surfaces makes this urgent. | **Commit to dark-only app-wide**, recolour the chrome and League in the same round, retire the toggle. A trading terminal does not need a light mode; a half-and-half app does need an explanation. |
| **Q3** | Does Teams get its own route, or live as a tab in the player pop-up? | **Own route**, with an Environment *section* in the pop-up scoped to that player's team. Both, not either. |
| **Q4** | Should the pop-up grow section navigation, or should some sections become their own routes (a real player page)? | **Section navigation inside the pop-up.** "Never navigate to research" is the strongest UX commitment the app has made; breaking it for depth would undo the point of 1b. |
| **Q5** | Changes (§5.6) — build now against 4 weeks of capture, or wait until the series is thicker? | **Design now, build in phase 2.** The capture accrues either way, and designing against a thin series forces the honest empty state. |
| **Q6** | Is a "model track record" surface (§5.10) something you want publicly in the app, or a private diagnostic? | **In the app.** It is the differentiator no competitor can copy retroactively. |
| **Q7** | The dead ACT group (§5.7) — remove the items, or keep them with an honest gate treatment? | **Remove until real.** Re-add when there is something behind them. |

---

## 12. Assumptions this brief makes

Stated so they can be contested rather than inherited:

1. **The 1b structure is settled and not up for redesign.** Portfolio / Market / pop-up / grouped
   rail stay. v2 adds to that skeleton; it does not replace it. *(If that is wrong, most of §5
   needs rewriting.)*
2. **Single user, no accounts, no backend.** The app is a static SPA over a CDN data repo with
   IndexedDB caching. Anything requiring server state, push, or cross-device sync is out of scope.
3. **Half-PPR-ish single Sleeper league, dynasty format.** Scoring is read from the league; the
   projections and rankings are league-scored.
4. **Desktop is the real target.** Mobile is a port, planned for (§8) but not designed now.
5. **The data repo's cadence holds** — weekly KTC, weekly player state, weekly nflverse refreshes.
   Several v2 surfaces get better purely by the passage of time, and worse if a cron dies. *(A
   dead-man detector for this already exists in the data repo.)*
