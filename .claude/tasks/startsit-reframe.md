# Start/Sit Reframe — docs-only strategy correction

**Status:** planning artifact (opus). PLANNING ONLY — this session edited no source or doc files.
This is a **docs-only** change, so the plan below **is** the Docs-updates spec: every edit is given
as exact before/after text at a named location, so a **sonnet** implementer can apply it
mechanically (per [CLAUDE.md → Workflow convention](../../CLAUDE.md#workflow-convention)). No code,
no tests, no build behavior is touched.

**Model routing.** Docs-only mechanical edits → **sonnet** ("README / CLAUDE.md updates" /
docs-class work in the [routing table](../../CLAUDE.md#which-model-for-which-task)). Planned by
opus only because the *strategy call* (where the line sits between rejected-DFS and
deferred-own-roster, and the structural ripple) is the hard part; the edits themselves are
find/replace.

---

## The strategy correction (one statement, applied everywhere)

Both docs currently frame weekly **start/sit** as out-of-scope / uninteresting ("redraft job,"
"rounding error," "byproduct, never the point," "out of scope"). That is a **strategy reversal**:
the product serves **two management jobs**, and start/sit is the deferred second one — not a
rejected feature.

1. **Job 1 — the dynasty asset base (primary, built first).** Building/managing the roster as an
   asset portfolio: hold/sell/cut, trades, market-vs-model, phase, rookies. This stays the thesis,
   the moat, and the first thing built. **Unchanged.**
2. **Job 2 — own-roster weekly start/sit (real, deferred).** Helping the manager set **their own
   dynasty roster's** weekly lineup. A legitimate surface, **sequenced after the dynasty core** and
   gated on an in-season weekly-production model. Deferred, not dismissed.

**The line that must stay sharp (do NOT collapse it):**
- **Rejected (outright):** a **DFS / lineup-optimizer or betting-edge product for its own sake** —
  optimizing weekly points or chasing betting lines as the *point*. Different game, different
  horizon. The moat is dynasty asset decisions.
- **Deferred (intended):** the **own-roster** start/sit surface — a second management job built
  after the core.

**Tone rule for every edit:** deferral, not disparagement. Remove "rounding error," "never the
point," "out of scope," "not answered (redraft job)," "byproduct" *as applied to own-roster
start/sit*. Keep the dismissive language only where it targets DFS/betting-as-the-point.

### Structural-ripple decisions (so the docs aren't left self-contradictory)

- **Future nav home:** own-roster start/sit becomes a **seasonal (in-season) secondary tab inside
  the Roster surface** when built — *not* a new top-level tab. Rationale: the four-permanent-tab
  spine + seasonal Rookies already sit at the **5-tab mobile hard ceiling** (frontend doc lines
  120, 110–118); and the doc's own rule (line 122) is "secondary navigation = tabs inside a
  surface, never new top-level items," with Roster already hosting Overview / Hold-Sell-Cut /
  Decision Log. Setting your own lineup is roster management, so Roster is its conceptual home. It
  stays **out of nav until built**.
- **Roadmap placement:** it earns an explicit **deferred (post-core)** entry in the frontend doc's
  Version 2 list + Complete Roadmap, flagged as gated on an in-season weekly-production model
  (itself deferred model-depth work). It is sequenced *after* the dynasty core, never ahead of it.
- **Question-table (#11):** kept **below the ranked dynasty questions** (the `—` rank is honest:
  lower *dynasty* stakes), but its cell is reworded from "out of scope" → deferred second surface;
  the table's discipline note gets a one-clause carve-out so "deferred" isn't read as "doesn't get
  built."
- **The two docs stay consistent:** the frontend doc owns the surface/nav/roadmap treatment; the
  decision-engine doc owns the jobs/non-goals/reject treatment. Both name the same line.

### Anchor sweep result

Grepped both docs (and README/CLAUDE.md) for `start.?sit | who do i start | redraft | weekly.?
lineup | lineup | out of scope | this week | rounding error | never the point | byproduct | DFS |
betting | weekly.?optim`. **The six anchor spots named in the task are the complete set of
own-roster-start/sit mentions; no additional ones were missed.** The other hits are the "Optimizer"
*archetype* / "optimize around" / mobile-"this week" copy (unrelated) and three **betting/DFS-signal
rejections we deliberately keep** (decision-engine lines 23, 230, 466 — see "No-change" below). The
two roadmap additions and the one question-table discipline-note carve-out are the structural
ripple, not pre-existing anchors.

---

## Docs updates

### File A — `docs/dynasty-frontend-ux-design.md` (5 edits)

#### A1 — Question table, row #11 (line 61)

> **before:**
> ```
> | — | Who do I start this week? | *Not answered — out of scope (redraft job)* | — |
> ```
> **after:**
> ```
> | — | Who do I start this week? | *Deferred — the own-roster weekly-lineup job (a real second surface), built after the dynasty core. Lower dynasty stakes, so it ranks below the questions above; not rejected.* | — |
> ```

#### A2 — Question-table discipline note (line 63) — carve-out so "deferred" ≠ "not built"

> **before:**
> ```
> Anything past question 9 either lives behind a drill-down or doesn't get built. The discipline of this table is what keeps the surface from sprawling into the fifteen-tool mess of the competitors.
> ```
> **after:**
> ```
> Anything past question 9 either lives behind a drill-down, is deferred to a later surface (the own-roster start/sit job, below), or doesn't get built. The discipline of this table is what keeps the surface from sprawling into the fifteen-tool mess of the competitors.
> ```

#### A3 — "What is deliberately NOT in the navigation" (line 125)

> **before:**
> ```
> - A weekly-lineup / start-sit surface (out of scope).
> ```
> **after:**
> ```
> - A weekly-lineup / start-sit surface — *deferred, not rejected.* Setting your **own** dynasty roster's weekly lineup is a legitimate second job; it's simply built after the dynasty core, so it has no nav home *yet*. When built it lives **inside Roster** as a seasonal (in-season) secondary tab — never a new top-level item, so the four-permanent-tab spine and the 5-tab mobile ceiling stay intact. (A general DFS/lineup *optimizer* for its own sake stays rejected — see "Features and Patterns to Reject.")
> ```

#### A4 — Reject list entry (line 496) — reword to reject the DFS-flagship, point to the deferred surface

> **before:**
> ```
> - **A weekly-lineup / start-sit surface** — out of scope (redraft job).
> ```
> **after:**
> ```
> - **A DFS / weekly-lineup *optimizer* (or betting-edge chase) as a flagship** — optimizing weekly points or betting lines for their own sake is a different product with a different time horizon; the moat is dynasty *asset* decisions, not weekly scoring. *(This is not the deferred **own-roster** start/sit surface, which is a legitimate second job sequenced after the dynasty core — see "Version 2 Frontend" and the Complete Frontend Roadmap.)*
> ```

#### A5a — "Version 2 Frontend" list (after item 7, line 479) — add the deferred surface

Insert a new item **8** immediately after the current item 7 ("Empirical confidence ranges …"):

> **add:**
> ```
> 8. **Own-roster start/sit *(seasonal; deferred, gated)*** — a weekly-lineup helper for the user's **own** dynasty roster, living inside the Roster surface as an in-season secondary tab. It is the product's *second* management job (not the DFS optimizer the Reject list rules out), and it is gated on an in-season weekly-production model — itself deferred model-depth work — so it sequences *after* everything above and never ahead of the asset-decision core.
> ```

#### A5b — "Complete Frontend Roadmap", after the "Standing throughout" line (line 514) — mirror it on the roadmap

Add a new bolded line immediately after the **Standing throughout:** paragraph:

> **add:**
> ```
> **Deferred (post-core):** own-roster **start/sit** — a seasonal Roster sub-tab for setting your *own* lineup, sequenced after the dynasty core and gated on an in-season weekly-production model. Intended, not rejected; kept out of nav until built.
> ```

---

### File B — `docs/dynasty-decision-engine-design.md` (3 edits)

#### B1 — Explicit Non-Goals, the DFS scope boundary (line 63)

> **before:**
> ```
> - **Not a DFS or weekly-optimization product.** Optimizing weekly start/sit and chasing in-game betting edges is a different game with a different time horizon. Dynasty value is won on *asset* decisions over months. (A lightweight lineup helper can fall out for free from the in-season production model — but it's a byproduct, never the point.)
> ```
> **after:**
> ```
> - **Not a DFS or sports-betting product.** Chasing in-game betting edges, or optimizing weekly lineups *for their own sake* (the DFS game), is a different product with a different time horizon — dynasty value is won on *asset* decisions over months, and that asset-decision core is the moat and the thing built first. This is **distinct from** helping a manager set their **own** dynasty roster's weekly lineup, which is a legitimate *second* management job the product does intend to serve — **deferred** until after the dynasty core and supported by the in-season production model (see Core Jobs To Be Done #6). The line: the own-roster start/sit surface is deferred-not-rejected; DFS/betting-as-the-point is rejected outright.
> ```

#### B2 — Core Jobs To Be Done, item #6 (line 97)

> **before:**
> ```
> 6. *(Low priority for dynasty)* **"Who do I start this week?"** — a redraft job; a rounding error on dynasty outcomes.
> ```
> **after:**
> ```
> 6. **"Who do I start this week?"** *(the second management job — own-roster, deferred)* — setting the user's **own** weekly lineup. Lower dynasty stakes than the asset decisions above, so it is **built after the dynasty core**, not before — but it is a real job the product intends to serve (supported by the in-season production model), not a redraft afterthought. The DFS-style *optimizer for its own sake* remains out (see Explicit Non-Goals); this is the manager's own roster.
> ```

*(Note: the list header "Descending order of frequency × stakes — which is also the order to
optimize around" stays accurate — start/sit remains #6, last, i.e. built last. No header edit.)*

#### B3 — "Features That Should Be Rejected", bucket A (line 403)

> **before:**
> ```
> - **DFS / weekly-optimization as a flagship** — different game, different horizon; a lineup helper is at most a free byproduct of the in-season model.
> ```
> **after:**
> ```
> - **DFS / weekly-lineup-optimization (or betting edges) as a flagship or the product's point** — different game, different horizon; the moat is dynasty *asset* decisions. *(This rejects the optimizer-for-its-own-sake — **not** the deferred **own-roster** start/sit surface, which is a real second job sequenced after the dynasty core; see Core Jobs #6 and Explicit Non-Goals.)*
> ```

---

### No-change (reviewed; intentionally left as-is) — the betting/DFS-signal rejections we KEEP

Per the constraint "KEEP the rejection of DFS / sports-betting / weekly-optimization-as-flagship,"
these three hits target **betting-line signals / DFS-as-the-point**, *not* own-roster start/sit, and
must **not** be softened:

- `docs/dynasty-decision-engine-design.md:23` — "*distinct from DFS-style betting-line edges, which
  genuinely are low-value for dynasty*." This is the **event-signal vs. betting-signal** distinction
  (a Must-Have framing). Keep.
- `docs/dynasty-decision-engine-design.md:230` — Metrics-To-Avoid row "**DFS-style
  betting-line-movement edges**." This rejects a betting **metric/signal**, not a surface. Keep.
- `docs/dynasty-decision-engine-design.md:466` — "*Cut things that don't help a decision (narrative
  scoring, vanity stats, gamification, DFS-flavored features) on the merits…*." Here "DFS-flavored
  features" = the rejected optimizer/betting framing (consistent with B3), not the deferred
  own-roster surface. Keep as-is. *(If the implementer wants belt-and-suspenders, "DFS-flavored
  features" may read "DFS-flavored optimization features" — optional, non-essential; default is no
  change.)*

The Executive Summaries, Product Vision, Product Goals, and Roster/Board surface sections carry **no**
own-roster-start/sit framing and need no edits.

---

## README.md / CLAUDE.md

**None.** Confirmed by inspection:
- `README.md` Documentation index lists the two design docs with one-line descriptions ("the six
  surfaces / marginal-value thesis"; "the value chip, the peek, nav/IA, visual language") — neither
  references start/sit or the non-goals. Nothing to reconcile.
- `CLAUDE.md` Navigation-map pointer describes the docs by purpose only ("six surfaces +
  marginal-value thesis"; "UX/visual strategy") — no start/sit text. Nothing to reconcile.

No `src/` module, command, invariant, factors/stat-key contract, data shape, or signal-registry
entry is touched, so the [Self-maintenance](../../CLAUDE.md#self-maintenance) rule triggers no other
CLAUDE.md/registry edits.

---

## Tests to add

**None — docs-only.** No behavior, no code paths, no rendered surfaces change; these are Markdown
edits to strategy docs. Per the [Done-definition](../../CLAUDE.md#done-definition-for-code-tasks),
purely non-behavioural changes need no tests. `npm test` should still be run as a regression guard
per the done-definition, and must remain green unchanged.

---

## Cross-repo impact

**None.** No [Cross-repo contract](../../CLAUDE.md#cross-repo-contracts-with-sleeper-dashboard-data)
(snapshot shape, season-totals/manifest/enrichment schemas, nflverse/advstats shapes) is touched.
`sleeper-dashboard-data` needs no change.

---

## Implementer checklist (all docs-only, mechanical)

| # | File | Location | Action |
|---|---|---|---|
| A1 | `docs/dynasty-frontend-ux-design.md` | L61 (question table row #11) | reword cell → deferred second surface |
| A2 | `docs/dynasty-frontend-ux-design.md` | L63 (discipline note) | add "deferred to a later surface" carve-out |
| A3 | `docs/dynasty-frontend-ux-design.md` | L125 (NOT-in-navigation list) | reword → deferred; future home = seasonal Roster sub-tab |
| A4 | `docs/dynasty-frontend-ux-design.md` | L496 (Reject list) | reword → reject DFS-optimizer flagship; point to deferred surface |
| A5a | `docs/dynasty-frontend-ux-design.md` | after L479 (Version 2 Frontend) | add item 8 — own-roster start/sit (deferred, gated) |
| A5b | `docs/dynasty-frontend-ux-design.md` | after L514 (Complete Roadmap) | add "Deferred (post-core)" start/sit line |
| B1 | `docs/dynasty-decision-engine-design.md` | L63 (Non-Goals, DFS boundary) | reword → "Not a DFS or sports-betting product"; deferred second job |
| B2 | `docs/dynasty-decision-engine-design.md` | L97 (Core Jobs #6) | reword → second management job, deferred; drop "rounding error" |
| B3 | `docs/dynasty-decision-engine-design.md` | L403 (Reject bucket A) | reword → reject optimizer-for-its-own-sake; point to deferred surface |
| — | `docs/dynasty-decision-engine-design.md` | L23, L230, L466 | **leave as-is** (betting/DFS-signal rejections we keep) |

After edits: re-grep both docs for `rounding error | never the point | out of scope | redraft |
byproduct` and confirm **zero** remaining hits *as applied to own-roster start/sit* (the only
surviving "byproduct"/"redraft" usages should be gone; the betting-signal lines at L23/L230/L466 are
not those phrases). Then `npm test` (regression guard, unchanged). Hand back to the user — no dev
server / no browser smoke ([Workflow convention](../../CLAUDE.md#workflow-convention)).
