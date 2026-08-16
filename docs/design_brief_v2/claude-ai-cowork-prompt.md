# Running the second pass in Claude.ai (Cowork)

**Not part of the design handoff.** This is for Anton.

The brief in this folder was written in a Claude Code session with direct filesystem access to both
repos, which is what made the data verification possible (row counts, null rates, actual field
lists). A Cowork session with repo access can do things that session could not: browse the
competitor tools rather than read reviews of them, search more widely, look at the app running, and
argue with the conclusions from a cold start.

**Run it in two parts, in this order.** Part A is an independent pass — it must not read
`README.md` / `01` / `02` / `03` in this folder, or it will simply agree with them. Part B is where
it reads the brief and attacks it.

---

## Setup

1. Open a Cowork session with access to **both** repos:
   `sleeper-dashboard` and `sleeper-dashboard-data`.
2. Optional but useful: have the app running and drop in 3–4 screenshots of Market, Portfolio and
   the player pop-up. The Claude Code session that wrote the brief was **not allowed to run the dev
   server** (repo convention: visual verification is the user's job), so it reasoned about the UI
   entirely from source and docs. A session that can actually see the screens has an advantage
   worth using.
3. Paste **Part A**. Let it run to completion and save its output.
4. Then paste **Part B** in the same session.

---

## Part A — the independent pass

```
You have access to two repos: `sleeper-dashboard` (a React/Vite dynasty fantasy football
dashboard) and `sleeper-dashboard-data` (the CDN data store it reads from).

I want a research-based plan for the optimal version of this app: what data should be
shown, where it should be shown, and what is missing that ought to be there. The output
will become a design handoff for a designer who will produce the actual screens.

IMPORTANT — do not read anything in `docs/design_brief_v2/`. A previous session wrote a
brief there and I want your independent conclusions first, not a review of theirs. You
will read it in a later step.

Work in this order:

1. GROUND YOURSELF IN THE APP AS IT IS.
   Read `CLAUDE.md`, `docs/ui.md`, `docs/architecture.md`, `docs/signal-registry.md`, and
   `.claude/tasks/dynasty-portfolio-1b.md` (the master plan for the redesign that just
   shipped — read §4a especially, it carries two standing product directives that override
   the design where they conflict). Then read the actual component source under
   `src/components/` for Market, Portfolio and the player detail pop-up, so you know
   precisely what is on screen today rather than what the docs say is on screen.

2. GROUND YOURSELF IN THE DATA.
   In `sleeper-dashboard-data`, read `data-catalog.md` and then OPEN THE ACTUAL DATA FILES.
   Do not trust coverage claims in documentation — several were stale when last checked.
   For each served family, establish: what fields it carries, which seasons exist, and how
   often each field is null. Pay particular attention to `nflverse/gamelogs/`,
   `nflverse/teamcontext/`, `nfl/players-state/`, `ktc/`, and `enrichment/`.

3. WORK OUT WHAT IS INGESTED BUT NOT SHOWN.
   Cross-reference: for every data family and every computed value in the app, is there a
   component that renders it? Grep for consumers. There is a meaningful amount of data that
   is loaded every session and displayed nowhere, and finding all of it is a core part of
   this task.

4. RESEARCH WHAT SHOULD BE SHOWN.
   (a) The repo contains its own research: `docs/nfl_prediction_research.docx`,
       `docs/prediction-research-eval.md`, `docs/advstats-grading-findings.md`. Read all
       three. Note that the third one records cases where the project's own backtesting
       CONTRADICTS the public literature — those overrides win.
   (b) Then research externally: what does the current evidence say actually predicts NFL
       fantasy performance over a season and over multiple seasons? What are the stability
       (year-over-year correlation) figures per metric per position, and how much do they
       differ between positions?
   (c) Then actually USE the competing products — KeepTradeCut, Dynasty Daddy, FantasyCalc,
       DynastyProcess, PlayerProfiler, Fantasy Points, Sleeper's own app. Browse them. Look
       at their player pages, their tables, their trade tools. I want to know what they
       show, how they lay it out, where they are genuinely good, and what none of them do.
       Reading a "best tools of 2026" listicle is not the same as looking at the product.

5. ANSWER THREE FEASIBILITY QUESTIONS I could not settle:
   - Does nflverse (or any free source) expose ROUTES RUN at player-season grain, joinable
     to `sleeper_id` via the existing gsis crosswalk? This gates yards-per-route-run, which
     the research rates highly and the app cannot compute.
   - What exactly does Sleeper's `/v1/league/<id>/traded_picks` endpoint return, and is it
     enough to reconstruct which manager holds which future rookie pick? The app models no
     picks at all today, which biases its roster-value numbers.
   - Does Sleeper expose PENDING trade offers made to a user anywhere in its public API, or
     only completed transactions?

6. THEN, AND ONLY THEN, WRITE THE PLAN. I want:
   - A one-line thesis for what this app should be.
   - A target information architecture: every surface, what question it answers, and why it
     exists. Include a verdict on the two uncommitted design directions in
     `docs/design_handoff_dynasty_portfolio/README.md` — `2a` (Decision desk: home as a
     ranked stack of calls) and `2b` (League map: assets plotted across all 12 rosters).
     Build, defer, or kill, with reasons.
   - A surface-by-surface specification of what data goes where, traceable to a real field
     in a real file.
   - A ranked list of missing data with acquisition cost.
   - The open product questions you cannot answer without me.

Constraints that are not up for debate:
   - Static SPA, no backend, no accounts, no push. `localStorage` and IndexedDB only.
   - Never fabricate a value. A number with no source renders as an em-dash or is omitted.
     No placeholder defaults, no baselines snapshotted at page load.
   - Desktop-only for now — but call out any decision that would make adding mobile later
     cheap or expensive, because I want the cheap version.
   - Several data families are under hard "display-only" invariants with tests enforcing
     them: they may be shown but must never influence the projection or the dynasty score.

Be concrete and be willing to say a thing is not worth building. I would rather have a
short plan I trust than a long one that hedges.
```

---

## Part B — the challenge pass

Paste this only after Part A has produced its plan.

```
Now read `docs/design_brief_v2/` in the app repo — README.md plus the three appendices.
That is a parallel plan written by a different session that had filesystem access to both
repos but could not browse the web as freely, could not run the app, and could not use the
competitor products directly.

Compare it against what you just concluded, and give me:

1. WHERE YOU DISAGREE, and which of you is right. Be specific — quote the claim. I am
   more interested in the disagreements than the overlaps.

2. FACTUAL ERRORS. That brief marks its claims [data-checked] or [doc]. Verify the
   [data-checked] ones you have reason to doubt — especially the coverage table in
   `01-data-inventory.md` §5 and the per-position null rates in §2.2. Anything wrong there
   propagates into design decisions.

3. WHAT IT MISSED. Either data it did not find, a surface it did not consider, or a
   research finding it did not weigh. You had access to the live competitor products and it
   did not — if that changed your view of what the app should show, say how.

4. THE 2a / 2b VERDICTS. It defers `2a` (Decision desk) on three grounds — that it inverts
   the product's stated priority of data over verdicts, that its central marginal-value
   input does not exist, and that one of its five card types needs data Sleeper does not
   expose. It recommends building a reduced `2b` (League map) on the grounds that the
   per-manager positional strength it needs is derivable rather than missing. Do you agree
   with both calls?

5. THE OPEN QUESTIONS. §11 of the brief lists seven decisions it wants from me, with
   recommendations. Tell me where you would answer differently and why. Do not just
   restate them.

Do not be agreeable. If the brief is broadly right, say so in a paragraph and spend the
rest of your effort on the parts that are wrong.
```

---

## What to bring back

Whatever Part B produces, the useful artifacts are:

- **Disagreements worth resolving** — merge them into the brief before it goes to the designer, or
  add them as an explicit "unresolved" section so the designer knows where the ground is soft.
- **Any factual correction** to `01-data-inventory.md` — that file is the one everything else
  leans on, and a wrong coverage figure turns into a designed element that cannot be built.
- **The three feasibility answers** (routes run / traded picks / pending offers) — these directly
  change the ranking in `03-data-gaps.md`.
- **Competitor screenshots or notes** — the brief's §2 competitor scan is built from reviews and
  documentation, not from using the products. First-hand observations should replace it.
