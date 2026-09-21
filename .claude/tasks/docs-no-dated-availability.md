# Docs convention: no dated data-availability claims

Session 1 planning. Anton's brief 2026-09-21, after commit `0748a69` fixed three instances of the
class by hand and W0's review burned a round on a false flag caused by one.

**Nothing in this task changes behaviour.** Docs, one source comment, CLAUDE.md, and one guard test.

---

## §1 The failure this prevents

Three reference docs asserted the FPA blend's current-season term was "not yet populated" because
`nfl/season-totals/<live-year>.json` "doesn't exist until the data repo's weekly cron completes its
first run after week 1". True when written, false by 2026-09-15. The implementation-reviewer treats
in-repo docs as ground truth, so a stale availability claim reads as a contradiction against correct
code and costs a review round — that is exactly what happened on W0, where the surviving flag had
its premise inverted.

This is a **scheduled** failure, not a one-off. Several families are still accruing toward write
gates this season (teamcontext, `nflverse/depth`, `nflverse/gamelogs`) and `nflverse/snaps` does not
land in-season at all. Every sentence of the form "X doesn't exist yet" has a known date on which it
becomes wrong.

## §2 The convention

Reference docs state **capability and mechanism**, never **current availability**.

- **Banned:** any claim that a data file, family or season "doesn't exist yet", "is not yet
  populated", "will exist once `<job>` runs", or is otherwise described by its availability at the
  time of writing.
- **Required instead:** what the code reads, through which loader and gate, and what it renders when
  that read comes back empty — the graceful-absence path.
- Coverage floors and cron cadence are **mechanism** and may be documented (the gate exists and is
  N rows). They must not be phrased as a prediction about today's state.

Target phrasing: the three lines rewritten in `0748a69`.

**Scope of "reference docs" — this is the load-bearing definition, and the guard depends on it:**

| In scope | Out of scope |
|---|---|
| `CLAUDE.md`, `docs/navigation.md`, `docs/nav/*.md`, `docs/ui.md`, `docs/architecture.md`, `docs/integrations.md`, `docs/signal-registry.md`, `src/` comments | `docs/cross-repo-registry.md`, `docs/design_brief_v2/**`, `docs/design_*.md`, `docs/dynasty-*.md`, `docs/design_handoff_*/**` |

Two reasons for the exclusions, both non-negotiable:
- **`docs/cross-repo-registry.md` is a mirrored contract record and is excluded on that ground
  alone.** Lines `19`–`270` are byte-identity CI-enforced from the data side by CR-24, so the
  app repo cannot land a fix inside them. **CR-23** (`:260`, the team-season-summary pack — *not*
  CR-22, whose Mirror at `:252` carries no such clause) has a `**Not yet built (2026-09-07):**`
  line that is this class in substance, deliberately carrying its own date as the mitigation; leave
  it alone.
  *Correction to an earlier draft of this file, which claimed a guard over this file would "red
  permanently":* as measured it would not. Its only hit on the §5 pattern is `:7` ("a coupling that
  is not listed here does not exist for review purposes"), which sits **outside** the sentinels and
  is app-editable — and is definitional, i.e. a fourth allowlist entry. CR-23's "Not yet built" does
  not match the pattern at all ("built" is not in the alternation). The exclusion stands; the
  original reason for it did not.
- **Design and strategy docs are dated records of what was believed when a decision was made.**
  11 sentences there match the pattern. Rewriting them destroys the record rather than correcting an
  error. They are not read as ground truth about data.

---

## §3 Sweep results — the violation list

Full sweep run 2026-09-21 over `docs/` and `src/`. Five passes (explicit non-existence, "not yet"
availability, cron/job predictions, "currently/today" + availability, `<year>.json` phrasings).

### 3a — Confirmed false today. Fix these.

**V1 · `docs/nav/components.md:17` — the fourth instance of the clause `0748a69` fixed.**
> "today `nfl/season-totals/<live-year>.json` does not exist yet, so `currentSeasonTotals.complete`
> is false and the popover states the prior season alone rather than implying a blend."

False on all three counts. The file is present (2330 player rows, 32 DEF rows, `KC` at
`gamesPlayed: 1`); `complete` is true; and the popover renders a real blend — W0's smoke captured
ARI's FPA-QB popover reading *"2026 carries 1 of 4 pseudo-games here (~25% of the blend)"*. This is
the highest-priority line in the sweep: it is the same sentence `0748a69` corrected in three
siblings and it was missed because it lives under `docs/nav/`.

**V2 · `docs/signal-registry.md:20`**
> "data-store files are 2017–2024 until the data repo materializes 2025 — until then 2025 resolves
> only where a CFBD API key is configured"

False: `college/passing/2025.json` is present in the data store (verified directly).

**V3 · `docs/signal-registry.md:62`** — the same claim in the CFBD stats row:
> "data-store files lag at 2017–2024 until the data repo adds 2025"

Same correction. V2 and V3 must be rewritten consistently; they are the same fact in two rows.

**V4 · `docs/ui.md:91` — stale on two counts, and needs a reality check before rewriting.**
> "`GAME SCRIPT` (`PROVISIONAL(no-data)` — the team-metrics slice hasn't landed, every cell renders `—`)"

The team-metrics slice **did** land — Portfolio Slice D, `d9db09f`, 2026-09-20 — and the cited
`PROVISIONAL(no-data)` tag is gone (the inventory has four sites, none for GAME SCRIPT).

**The replacement is determined; do not defer it to Session 2.** An earlier draft of this file told
Session 2 to "establish whether a GAME SCRIPT column exists" — that is the improvisation CLAUDE.md's
workflow convention exists to prevent, and it was unnecessary because the answer is already in the
repo. Verified:
- `src/utils/gameScript.js` exists and exports `describeGameScript` / `gameScriptFit`.
- `Portfolio.jsx:18` imports both; `:179-183` is the Slice D comment and the `gameScriptFit` call
  ("the team's margin/PROE descriptor, coloured by whether it suits THIS player's position — blue
  suits, amber works against, neutral is a split script"); the column header renders at `:808` and
  `:934`, i.e. on both tables.
- `Portfolio.test.jsx:708` already asserts the stale "Not built yet" gloss is **gone** from that
  header — so the test suite and this doc line currently disagree.

Rewrite `docs/ui.md:91` to that: GAME SCRIPT is `utils/gameScript.js`'s descriptor for the row's
team, position-coloured via `gameScriptFit`, and it renders `—` for a free agent, a team with no
metrics, or an absent teamContext — which is the **absence behaviour** the convention asks for, and
replaces the `PROVISIONAL(no-data)` framing entirely.

**V7 · `docs/integrations.md:213` — false on two counts.**
> "Manifest entries for `nfl/season-totals/<year>.json` currently ship at `schemaVersion: 3` (the
> only served family currently above v1). `dataStore.js` advertises `MAX_SUPPORTED_SCHEMA = 4` —
> raised ahead of F-24's stat-key prune, which will publish the first v4 files"

Verified against the live manifest: **every** `nfl/season-totals/<year>.json` entry ships
`schemaVersion: 4`, 2012 through 2026 (2026 additionally `inProgress: true`). And F-24's prune
landed 2026-08-24 (CR-02 data side), so "will publish the first v4 files" is a future-tense
prediction of a past event. Rewrite both clauses: the served version is a **fact to state**, and the
`MAX_SUPPORTED_SCHEMA = 4` ceiling is **mechanism** (it applies to every family read through
`tryDataStore`) — keep that sentence, drop the prediction.

**V8 · `docs/nav/components.md:18` — a third sibling of V5/V6, in the same `docs/nav/` blind spot.**
> "`loaded===true` + current season not yet loaded → `DegradedBlock` (`not-yet-accruing`)"

Same treatment as V5/V6: a branch condition written as today's weather. It also exposes a gap in the
§5 pattern — `loaded` was missing from the `not yet (…)` alternation, so the guard as first drafted
would not have caught this one either. §5's pattern is corrected.

### 3b — Currently-true state, wrongly phrased as a dated fact. Rewrite to mechanism.

**V5 · `docs/ui.md:279`** and **V6 · `src/components/teams/TeamDetail.jsx:209`** both read
"`loaded===true` but the current season's teamContext hasn't landed yet → `DegradedBlock`
(`not-yet-accruing`)". `teamcontext/2026.json` is genuinely absent today, so the *state* is true —
but the sentence describes a **branch condition**, and the branch fires whenever the load is absent
or incomplete, for any of the four reasons the loader collapses into one empty result. Rewrite as the
condition, not as today's weather. The `DegradedBlock` `kind` is literally named `not-yet-accruing`;
**do not rename it** — that is a code identifier and out of scope.

### 3c — Legitimate. Leave alone. Recorded so a later sweep does not "fix" them.

- `docs/ui.md:247` and `src/components/teams/Teams.jsx:154` — "would make the current-season term
  either never populate or populate against a file that does not exist". This explains *why*
  `dataSeason` and `nflState.season` are distinct derivations. Mechanism, not availability.
- `CLAUDE.md:123` ("an engine that doesn't exist", the `PROVISIONAL(heuristic)` definition) and
  `CLAUDE.md:147` ("a coupling that is not listed there does not exist for review purposes").
  Definitional uses of the words, not claims about data.
- `docs/integrations.md:204` ("anchor-tracked; currently 2017–2025"). A snapshot parenthetical on a
  self-updating mechanism; the anchor tracking is what keeps it true. **Borderline — flagged for
  Anton, not changed by this task.**

*(`docs/integrations.md:213` was in this list in an earlier draft, classified as "a schema version
rather than availability". That was wrong — it is false today and has been promoted to V7 in §3a.)*

---

## §4 CLAUDE.md placement — one trap

Add the §2 convention to **`## Self-maintenance`** (line ~264), which already owns the
docs-authoring rules ("Per-file detail belongs in `docs/navigation.md`, not here"). Keep it to three
or four lines: the ban, the required form, and the in-scope file list by reference to the guard.

**Placement is not free.** `CLAUDE.md` is 23,193 bytes against a 25,000-byte ceiling enforced by
`src/__tests__/claudeMdSize.test.js` — **1,807 bytes of headroom.**

**The budget is ~1,200 bytes, and if it does not fit, do not prune** *(Anton, 2026-09-21 — this
overrides CLAUDE.md's own "prunes in the same commit" line for this change)*. 1,807 bytes is not much
for a convention that needs a banned form, a required form and an example to be applicable without
judgment calls, and a convention compressed past the point of being self-applying is worth less than
the rules it displaced.

So: write the convention to fit ~1,200 bytes in `Self-maintenance`. **If it cannot be stated
applicably in that budget**, put the full convention in a new `docs/docs-conventions.md` and leave a
**three-line pointer** in `Self-maintenance` — the ban in one clause, the required form in one, and
the link. Add the new file to README.md's `## Documentation` index (`:176`), which is how `docs/` is
discovered.

**Do not prune unrelated rules to make room, in either branch.** A pruning diff tangled into a
convention commit is how the next reviewer loses the thread, and it trades enforceable rules for an
unenforceable one. If you find yourself deciding which existing rule matters least, you are in the
wrong branch — take the `docs/` pointer instead. The guard (§5) is what actually enforces this
convention; CLAUDE.md's job here is discoverability, not completeness.

**Do not put it above line 258.** Everything from `## Workflow convention` to the end of
`### The Claude.ai project` is marked *"These sections are mirrored in the sibling repo's CLAUDE.md
and change together"* — placing an app-only convention there makes it a two-repo change.
`Self-maintenance` sits after that boundary and is app-scoped.

**Do not touch the signal-registry sentence inside `Self-maintenance`.** CR-18 names that specific
sentence as a mirrored site on both sides (§6). Adding a new, separate rule to the same section does
not touch it; editing it would pull a second contract into this task.

---

## §5 The automated guard — recommended, with measured numbers

**Recommendation: build it.** Measured against the live tree, not estimated.

| Variant | Rule | Hits | Allowlist needed | Structural misses |
|---|---|---|---|---|
| A | availability phrase **and** a data-artifact token in the same sentence | 2 | 0 | V2, V3, V4, V7, V8 |
| B | availability phrase alone, alternation widened per §3 | **10** | **3** | V6 only |

Variant A's zero-allowlist cleanliness is bought by the artifact requirement, and that is exactly
what loses five of the seven real violations: "the team-metrics slice hasn't landed", "data-store
files are 2017–2024 until…", "which will publish the first v4 files" and both `not yet loaded`
branch descriptions name no artifact path.

**Ship variant B.** Its 10 hits are the 7 real violations (V1, V2, V3, V4, V5, V7, V8) plus 3
sentences that are legitimate and stable: `CLAUDE.md:123` ("an engine that doesn't exist" — the
`PROVISIONAL(heuristic)` definition), `CLAUDE.md:147` ("a coupling that is not listed there does not
exist for review purposes" — definitional), and `docs/ui.md:247` (mechanism: why `dataSeason` and
`nflState.season` are distinct derivations). Not a growing tail — seed the allowlist with those
three and the guard runs clean with full coverage of the class.

**V6 is a structural miss in both variants and that is deliberate.** `src/` comments are not in the
guard's file set — scoping a comment-only matcher cheaply is not worth it. V6 is fixed by hand and
the convention covers future cases by review. *(An earlier draft claimed variant B missed "none of
V1–V6"; that contradicted this same section's file-set rule and was wrong.)*

### Pattern

Case-insensitive, matched **per sentence, not per line** — these docs have 400-character table cells
and a line-level match cannot say which clause is at fault:

`does not exist` · `doesn't exist` · `won't exist` · `will not exist` ·
`not yet (populated|available|landed|ingested|present|written|live|loaded)` ·
`hasn't landed` · `haven't landed` · `yet to land` · `until the data repo` · `cron completes` ·
`first run after week` · `will publish` · `will land` · `will exist` · `once <…> (lands|runs|publishes)`

`loaded` and the four future-tense branches were added after the first draft missed V7 and V8.

*(An earlier draft asserted the pattern had to handle curly apostrophes because V4 would otherwise be
missed "a real bug found while prototyping". That was wrong on both halves: there are no `’`
characters in any in-scope file — the only three in the repo are in two `src/utils/*Match.test.js`
files — and variant A's miss of V4 was the artifact requirement, not the apostrophe. Straight
apostrophes are sufficient. Do not add the alternative unless a file introduces one.)*

### Allowlist key

**Not `file:line`** — it drifts on nearly every edit to `docs/ui.md` or `CLAUDE.md`, and a drifted
entry either suppresses a future real violation that lands on the reused anchor or reds spuriously.

Key on the **file plus a distinctive verbatim substring** of the allowed sentence — long enough to be
unique in that file, short enough to survive unrelated rewording around it.

**Every entry carries a one-line justification, in the seed list itself, and the field is mandatory**
*(Anton, 2026-09-21)*. This is the difference between a guard and a formality, and the reasoning is
worth stating in the test file so it survives:

> File-plus-substring seeding makes the guard pass today, but it is also a **silencing mechanism**.
> The next session that trips this guard on a legitimately definitional sentence will add a seed —
> and that session is the same kind of agent that was fooled by the stale clause this guard exists to
> prevent. Without a justification in the list, a future reader cannot tell a definitional exception
> from a silenced violation, and the second one is indistinguishable from the first at a glance.

Shape it so the justification cannot be omitted or left empty — an entry is a `{ file, substring,
why }` object and the test asserts `why` is a non-empty string, not an optional field a hurried
session skips. Seed the three §5 entries with real justifications, not placeholders:
`CLAUDE.md:123` is the `PROVISIONAL(heuristic)` definition, `CLAUDE.md:147` defines what an unlisted
coupling means for review, and `docs/ui.md:247` explains why `dataSeason` and `nflState.season` are
deliberately distinct derivations. Each of those says *why the words appear*, which is the test a new
seed has to pass.

Also assert that every entry still matches something: a stale entry whose sentence was deleted must
fail, or the allowlist rots exactly the way the docs did.

Sentence splitting is the one fiddly part, and the reason the key must not be a whole quoted
sentence: a naive split on `.` breaks inside backticked paths (`Market.jsx`, `off.*`) and on `e.g. `
(`CLAUDE.md:290`). Split on `(?<=[.;])\s+` as prototyped, accept that it over-splits on those, and
keep the key a substring so over-splitting cannot invalidate it.

### Test

New `src/__tests__/docsAvailabilityClaims.test.js`. Reads the §2 in-scope list, asserts no sentence
matches except allowlisted ones, and **excludes the §2 out-of-scope list explicitly** —
`docs/cross-repo-registry.md` above all. The failure message must quote the offending sentence with
`file:line` and point at this task file for the required form; a guard that only says "pattern
matched" gets suppressed rather than fixed.

## §6 Cross-repo impact

**One entry is triggered. The brief expected none; it was close but not right.**

**CR-18 · Signal registry rows (`docs/signal-registry.md`).** V2 and V3 edit that file, which is the
entry's sole app-side trigger. Its App side also names "the signal-registry sentence in `CLAUDE.md`
→ *Self-maintenance*" — §4 forbids touching that sentence, so only the rows are in play. No
data-repo file changes.

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new
> ingest adds a script the list above cannot already name. The listed sites are every one that exists
> today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer
> re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When
> a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters
> its historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

Note the direction: V2/V3 correct *coverage* text app-side for a change the data repo already made
(it published `college/*/2025.json`). That is CR-18 drift being repaid, not new drift.

**`[registry-stale]`, recorded not fixed.** CR-18's **App side** (`:184`) names "the signal-registry
sentence in `CLAUDE.md` → *Self-maintenance*", but its app-side `Triggers` (left of `‖`, `:188`) name
only `docs/signal-registry.md`. §4's safety argument — that adding a new rule to *Self-maintenance*
is app-scoped so long as that sentence is untouched — rests on the Triggers list being the complete
app-side set, and the entry's two halves disagree. The argument still holds on the stricter reading
(we touch neither the sentence nor anything else CR-18 names), so this does not block. It cannot be
fixed here regardless: the text is inside the mirrored region (CR-24). Add it to the data-repo
backlog item below.

**Do not edit `docs/cross-repo-registry.md`** — mirrored region, CR-24 byte-identity.

**Follow-up for the data repo, not this task.** `data-catalog.md` and the README coverage rows carry
the identical rot risk, and `data-catalog.md` is CR-18's data-side trigger. Append to
`.claude/tasks/data-repo-backlog.md`: the data repo should adopt the same convention in its own
CLAUDE.md and sweep those two files. Non-blocking. **Do not edit the sibling from here.**

---

## §7 Done-definition

Standard (CLAUDE.md), plus:
- `npm test` green including the new guard **and** `claudeMdSize.test.js` — the CLAUDE.md addition
  must fit the 25,000-byte ceiling or prune in the same commit.
- The new guard must **fail** if one of V1–V5/V7/V8's original sentences is reintroduced (V6 is a
  documented structural miss — `src/` is outside the guard). Demonstrate it once: revert one line
  locally, watch it red, restore. Say so in the hand-back — a guard nobody has watched fail is not
  known to work.
- The guard must also fail on a **stale allowlist entry** whose sentence no longer exists. Verify
  that too, the same way.
- Eight violations to fix: V1–V5, V7, V8 in docs, V6 in one `src/` comment. Confirm the count in the
  hand-back; an earlier draft of this file listed only six.
- No behaviour change: no source logic, no test changes beyond the new guard. `git diff --stat`
  should show docs, CLAUDE.md, one `src/` comment, and one new test file.
- V4 needs no reality check — §3a now carries the verified answer and the replacement prose. If the
  source disagrees with what §3a states about `gameScript.js` or `Portfolio.jsx:179-183,808,934`,
  **stop and report** rather than writing your own version.

---

## Fix pass 1

From implementation-reviewer on `6e90a67` (2026-09-21). Nine flags, all actionable. **Change only
what this section names.** If an item looks wrong or reaches beyond what is written, stop and report.

### 1.1 — V1's replacement introduces a fresh false claim *(highest priority)*

`docs/nav/components.md:17`. The rewrite lists "still in progress" as a reason
`currentSeasonTotals.complete` is false. It is not: `loadCurrentSeasonTotals` passes
`allowInProgress: true` (`src/api/sleeperStats.js:267`), and the live `nfl/season-totals/2026.json`
entry is `inProgress: true` **with** `complete === true` — which is the very fact V1 was fixed for.

**This is the class the task exists to remove, re-introduced inside the sentence that removed it.**
Replace with the accurate set, which that loader's own header states at `:248-251`: a null manifest
entry (file missing / store disabled / manifest fetch failed), or `tryDataStore` returning null
(validator or schema-ceiling rejection). Do not enumerate "in progress" among them.

### 1.2 — V7 leaves a second dated claim standing in the sentence it rewrote

`docs/integrations.md:213`. The two clauses §3 named are correctly fixed, but the parenthetical
"(the only served family **currently** above v1)" survives and is false:
`college/{passing,receiving,rushing}/<year>.json` ship `schemaVersion: 2` (data
`manifest.json:746-751`). Either state the fact without the "only/currently" framing or drop the
parenthetical. §3's own pass 4 should have caught this; it did not.

### 1.3 — Guard: restore the bound on the `once …` branch

`src/__tests__/docsAvailabilityClaims.test.js:43` uses `\bonce\b[\s\S]*?\b(?:lands|runs|publishes)\b`
— unbounded — where §5 specified `once <…30 chars> (lands|runs|publishes)`. The bound was the
mitigation and dropping it is a live false-positive surface: `docs/nav/components.md:18` already has
"prop once on mount" and "lands here" on one line and survives only on a sentence-split accident, and
`\bruns\b` matches inside "re-runs", so ordinary memo prose ("computed once per render, then re-runs
on filter change") would red. Restore the 30-character bound.

### 1.4 — Guard: hard-wrapped lines defeat it *(systematic false negative)*

`:70` reads the file, splits on `\n`, then splits each line into sentences. `CLAUDE.md`,
`docs/ui.md`, `docs/architecture.md` and `docs/integrations.md` are hard-wrapped at ~100 columns, so
any banned phrase straddling a wrap — "the team-metrics slice hasn't\nlanded", "not yet\npopulated" —
is never seen. **Four of the eight in-scope files are wrapped prose, so this is most of the guard's
surface.**

Join wrapped lines into paragraphs before sentence-splitting: split the file on blank lines, collapse
internal newlines to single spaces within each block, then sentence-split. Table rows are single
logical lines and are unaffected. **Keep a usable line number in the failure message** — report the
line the matched sentence starts on, not the paragraph index; a guard that cannot point at a line is
one nobody acts on.

### 1.5 — Guard: scope is hardcoded where §2 specified a glob

`:26-35` lists `docs/nav/components.md` and `docs/nav/utils.md` individually; §2 scopes
`docs/nav/*.md`. A future `docs/nav/<new>.md` is silently unguarded and nothing reds — and §2 is the
definition this test is supposed to implement. Glob it.

Likewise, four of §2's out-of-scope patterns (`docs/design_*`, `docs/dynasty-*`,
`docs/design_handoff_*/**`, `docs/design_brief_v2/**`) exist only as a comment while `EXCLUDED_FILES`
names the registry alone. With a glob in place the exclusions become load-bearing — express all of
them as patterns so the in-scope set is derived, not transcribed.

### 1.6 — Guard: `hasn't completed` is uncovered, and the convention self-evades

The pattern has `cron completes` and `hasn't landed` but no "completed" form, so
"the weekly job hasn't completed yet" passes clean — and the convention's own ban wording at
`CLAUDE.md:286` ("a job that has or hasn't completed") is therefore stated in words its own guard
cannot catch.

Add `(hasn't|has not|not yet) completed` to the alternation. Then **reword the convention line so it
does not self-trip** — do not allowlist it (1.8 explains why a seed inside CLAUDE.md is the wrong
tool). Verify by running the guard, not by inspection.

### 1.7 — Guard: no positive coverage. This is the one that makes it a formality.

Nothing asserts the pattern **matches** a known violation. 13 of its 15 alternatives — including every
branch added for V1, V7 and V8 — have zero positive coverage; only `does not exist`/`doesn't exist`
are incidentally exercised via the allowlist test. **A typo neutering any other alternative leaves the
whole suite green and the guard silently blind.**

Add a table-driven test: one representative sentence per alternative, asserted to match. Use the real
sentences this sweep found where one exists (V1, V4, V5, V7, V8 all supply one from §3) and a
plausible synthetic where it does not. Also assert a short list of sentences that must **not** match —
the three allowlisted ones plus the 1.3 false-positive cases ("computed once per render, then re-runs
on filter change") — so the bound stays bounded.

### 1.8 — The missing example, and where it goes

The landed convention (`CLAUDE.md:284-292`) has the banned form and the required form but **no
example**, which was an explicit human constraint ("a banned form, a required form, and an example to
be applicable without judgment"). Session 2's first draft quoted the banned phrases literally, tripped
its own guard, and dropped the examples rather than resolving it. The cost is demonstrated by 1.2: the
abstract ban under-determined whether a "currently" parenthetical was in the class, inside this very
diff.

Do **both** of these:

- **The guard's failure message (`:120-127`) carries a worked banned→required pair.** The test file is
  not in `IN_SCOPE_FILES`, so quoting banned phrases there trips nothing — already proven by the
  allowlist `why` at `:60`, which contains "an engine that doesn't exist" unpunished. Zero CLAUDE.md
  bytes, and it delivers the example at the one moment someone needs it, which is the red. Use a real
  pair, e.g. banned: "`teamcontext/2026.json` doesn't exist yet, so the block renders degraded";
  required: "the surface branches on `loaderResult.complete`; an absent or incomplete load renders
  `DegradedBlock(not-yet-accruing)`".
- **CLAUDE.md gains one compact example of the REQUIRED form only.** Not the banned form — that is
  what would self-trip, and it is also the weaker half: someone writing a sentence needs the shape to
  imitate. A required-form example quotes nothing banned and trips nothing. There are 1,028 bytes
  spare against the ceiling; this is well within them. **Still no pruning** (§4).

**Do not add a fourth allowlist seed for the convention's own text.** Keying a seed on a literal
banned phrase opens a permanent suppression window inside CLAUDE.md for exactly the phrases most
likely to be reintroduced there, and a genuine future violation landing in the same sentence fragment
would be swallowed silently. **Do not cite `0748a69` from CLAUDE.md either** — `Self-maintenance`
itself says "Nothing here records history … `git log` holds the rest", so a SHA there contradicts the
adjacent rule and rots when those lines are next rewritten.

### 1.9 — Backlog entry: wrong provenance field, and the Mirror clause is not reproduced

`.claude/tasks/data-repo-backlog.md:505` names the task file and date
("**docs-no-dated-availability.md, 2026-09-21.**") where that file's own convention (`:453`, `:466`)
and CLAUDE.md's done-definition item 7 require **the commit that found it** — "**Found:** … (app
`<sha>`) · **Blocking:** no". Use `6e90a67`. Blocking status is already present and correct.

While there: the entry names CR-18 as the data-side trigger but does not reproduce the actionable half
of its `Mirror` — the "emit the exact `docs/signal-registry.md` row edit the app must make (layer ·
source · coverage · reconstructable-vs-ephemeral · current use), and update the family's
`data-catalog.md` row on the data side in the same change" clause. The data repo reads this backlog;
a trigger id without the instruction is the "naming the contract in prose is not enough" failure one
level down. Quote that clause. §6 of this file remains the Session 1 emission of record — this is
about the backlog being actionable on its own.

### Done-definition for this fix pass

Full standard done-definition. Plus:
- `npm test` green including `claudeMdSize.test.js` and the guard's **new positive-coverage** tests.
- Re-demonstrate both guard failures from §7 after the 1.4 rewrite, since joining lines changes the
  matcher's input: revert a fixed sentence, watch it red, restore; corrupt a seed substring, watch the
  stale-entry test red, restore.
- **Additionally demonstrate the 1.4 fix**: introduce a banned phrase deliberately split across a hard
  wrap, confirm the guard now catches it, and remove it. That is the flag with no existing coverage and
  the one most likely to be "fixed" without being verified.
- Report the final CLAUDE.md byte count and confirm no deletion anywhere in it.
- No smoke test. No behaviour change. Commit; **do not push**.
