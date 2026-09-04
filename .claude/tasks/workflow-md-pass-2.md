# CLAUDE.md workflow pass 2 — mirrored workflow section, doc extractions, implementation-reviewer

**Session type.** Planned by opus, implemented by **sonnet** — every edit is a mechanical
text substitution at a stated anchor plus one new file written from the content given verbatim
below. No source files, no `src/` behaviour, no test logic changes.

**Why.** `CLAUDE.md` is 23,899 bytes against a 25,000-byte ceiling (`src/__tests__/claudeMdSize.test.js`).
Pass 1 (`claude-md-slimming.md`) took the easy prose. This pass trims a second time and spends the
freed room on three workflow changes: the loop grows a verification leg, a second review subagent
(`implementation-reviewer`) is introduced, and Session 2 gains a defined hand-back.

**Projected size: 20,398 bytes** — 4,602 under the ceiling, 602 under this task's 21,000 target.
Full accounting in §9. The ceiling is not raised.

---

## 1. Edit A — replace the whole `## Workflow convention` block

**Location:** `CLAUDE.md:164–228` — from `## Workflow convention` (`:164`) through the blank line
at `:228`, i.e. everything up to but not including the `---` at `:229`. This span currently holds
`## Workflow convention`, `### Plan review`, `### The Claude.ai project`, `### Which model for
which task` (the routing table), and the `**Sibling repo:**` line.

**Removed outright:** the `### Which model for which task` routing table and its trailing
sonnet-uncovers-a-design-question line. The routing rule survives, compressed, as the mirrored
block's "**Opus plans, sonnet implements, opus verifies.**" paragraph.

**Replace with the block below, verbatim.** This text is mirrored in `sleeper-dashboard-data`'s
`CLAUDE.md` and the two must not drift — **do not reword, re-wrap, or re-punctuate any of it**,
including the loop diagram's exact spacing. Two things in it are local and are marked as such:

- the two `*(app-only)*` bullets (Edit A2 below, part of the same paste), and
- the `**Sibling repo:**` line at the end, which sits *outside* the mirrored region and carries the
  registry anchor. The sibling's copy names *this* repo instead.

Copy everything between the four-backtick markers, not including them:

````
## Workflow convention

**The standard loop is fully in-repo.** Planning, review, approval, implementation and
verification all happen in this repository against live source. Nothing in it waits on a
chat held outside it.

```
Session 1 (planning, opus)
→ plan-reviewer subagent ← plan gate
→ human approval
Session 2 (implementation, sonnet)
→ done-definition ← machine gate
→ back to Session 1 to verify ← judgment gate
→ human sign-off
```

**Opus plans, sonnet implements, opus verifies.** A sonnet session that hits a design question
the task file did not anticipate stops and reports — it never improvises architecture.

- **Session 1** — read relevant code, decide signatures and data shapes, write
  `.claude/tasks/<feature>.md`. **Edit no source files.** Invoke plan-reviewer, report its flags
  verbatim, end the session.
- **Session 2** — read the task file first, implement exactly what it specifies, run the
  done-definition. If something is ambiguous or contradicts existing code, stop and ask. Hand back:
  **the commit SHA or diff range**, every file touched, every deviation from the task file, and
  what each new or changed test asserts.
- *(app-only)* Claude **may** run the app and should when a change is visual — start it from the
  `.claude/launch.json` preview config, not a backgrounded `npm run dev`, and stop it when done.
- *(app-only)* **A screenshot from Claude is not sign-off.** Claude catches what is *broken* (fails
  to render, `NaN`, collapsed layout); the user judges whether it is *good*.
- **Verification** — paste that hand-back into the still-open Session 1, which invokes
  implementation-reviewer on the diff. **Verification reads the diff, never the hand-back alone** —
  a self-report cannot show what it left out.

The task file is the handoff artifact, not chat history. A planning session that edits source has
broken the handoff.

### Reviews

Two subagents, both read-only and both **advisory** — flags are reported verbatim and never
auto-applied. The human decides; the next step starts only after approval.

- **plan-reviewer** (`.claude/agents/plan-reviewer.md`) — end of Session 1, on the task file.
  Factual/mechanical, conformance to the Invariants, cross-repo intent.
- **implementation-reviewer** (`.claude/agents/implementation-reviewer.md`) — invoked by Session 1
  during verification, on Session 2's diff. Fidelity to the task file including scope beyond its
  touch list; conformance to invariants no test guards; whether new or changed tests assert real
  behaviour rather than having been bent green.

### How to talk to Anton

Anton owns *what* and *why*; you own *how*. Lead with outcome and stakes — what a change does for
the product, what it costs, what it risks — not with mechanism. Keep internal machinery out unless
it changes a decision; when a technical term is unavoidable, define it inline in one clause. Give a
clear recommendation with one sentence of justification, or for a real judgment call two options
and a pick. Never walk through code line by line unless asked.

**This governs prose addressed to Anton only.** Task files, hand-backs and review flags are
engineering artifacts — exact paths, function names, data shapes, line anchors. Do not let the
executive register make them vague, and do not let their precision leak into what you say to him.

### The Claude.ai project

**Out of the standard loop.** An exploration tool — open-ended thinking, cross-repo reading,
research that has not become a plan. Not a review gate, authors no task files, nothing waits on it.
Its one residual case is a **brand-new cross-repo coupling absent from the registry**, which no
repo-scoped subagent can reason about; its output is a draft registry entry that returns to
Session 1 and takes the normal gate. Extending an existing entry stays in-repo.

**These sections are mirrored in the sibling repo's CLAUDE.md and change together.**

**Sibling repo:** `sleeper-dashboard-data` — the data store this app consumes via jsDelivr and writes snapshots into. See [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard-data).
````

**Paste-artifact note.** The source brief wrapped this text in an outer ```` ```markdown ```` fence
with a stray `markdown` line above it. Those are paste artifacts and are **not** content. What lands
in `CLAUDE.md` is exactly what is between the four-backtick markers above: the loop diagram sits in a
plain three-backtick fence, and nothing else is fenced.

### Edit A2 — the two app-only rules (already in the paste)

The two `*(app-only)*` bullets are the compressed survivors of the old `- **Visual verification.**`
(`:179`) and `- **But a screenshot from Claude is not sign-off.**` (`:187`) bullets. They are already
positioned in the block above, immediately after the Session 2 bullet and before Verification, per
the brief. **Do not add them a second time.**

> **Note for the reviewer, not an instruction to change anything:** placing them mid-list means the
> mirrored region is no longer one contiguous span — a future drift check between the two repos has
> to skip two bullets in the middle rather than diff a single block. The `*(app-only)*` prefix is
> what makes that skip mechanical. Flagging the shape; the placement follows the brief.

---

## 2. Edit B — move the smoke recipe to `docs/architecture.md`

**Chosen file: `docs/architecture.md`.** It already owns the operational, dev-facing half of the
docs set — `## Vite configuration`, `## Sleeper API notes`, `## React Strict Mode` — and the recipe
is exactly that: how to get the app running and what to watch while it does. `docs/navigation.md` is
"where does a file live", `docs/integrations.md` is per-loader behaviour; neither is where someone
looks to start the app. README's `## Running locally` is the public-facing variant and deliberately
carries no personal league credentials.

**Remove** `CLAUDE.md:180–186` (the `- **How to smoke it.**` bullet) — already gone as part of the
Edit A span replacement. Nothing further to delete.

**Add** to `docs/architecture.md`, as a new `## Smoke-testing the running app` section inserted
immediately **after** the `## Vite configuration` section and **before** `## Sleeper API notes`:

```markdown
## Smoke-testing the running app

Done-definition step 6 sends you here for any user-visible change.

`preview_start` the `sleeper-dashboard` config from `.claude/launch.json`, or attach to an
already-running server on `:5173` rather than starting a second one. A fresh browser profile lands
on the username form: enter **`Colts_420_Reloaded`** and pick league **Dynasty 040**. The league
choice persists to `localStorage`, so later runs load straight in. First load runs the career fetch
— give it time before concluding a surface is empty. Check the console for errors and for the
loaders' own `[teamContext]`/`[nflGameLogs]`/`[nflSchedule]`/`[advStats]` lines, which name the
season they resolved.

Claude may run the app and should when a change is visual, but a screenshot from Claude is not
sign-off — see CLAUDE.md → *Workflow convention*.
```

**Add** to `README.md`'s `## Documentation` list, in the `docs/architecture.md` bullet
(`README.md:191–194`), appending to the existing sentence so the bullet ends:

`… Vite config, Sleeper API notes, React Strict Mode, and the app smoke-test recipe.`

**Edit B2 — retarget done-definition step 6.** `CLAUDE.md:158`, replace the whole line with:

```markdown
6. **Smoke the change in the running app if it is user-visible** — recipe in [docs/architecture.md](docs/architecture.md) → *Smoke-testing the running app*. Report what you looked at and what you saw. A slice with no visible surface (a loader-wiring or pure-util slice) can note that instead.
```

---

## 3. Edit C — move the playerRows enumeration out of `CLAUDE.md`

### 3.1 Deviation from the brief — read this before implementing

The brief says move the seven-step enumeration into `docs/navigation.md`. **This plan sends it to
`docs/architecture.md` instead, because it is already there.** `docs/architecture.md:99–188`
(`### playerRows pipeline`) carries the same seven memos as an arrow diagram plus a
`**Derived memos upstream of the pipeline:**` list, the full player-row shape, the player-ID
sources and the `isRelevantPlayer` table — strictly more than `CLAUDE.md` holds, and it opens with
"Steps must stay in this order." `CLAUDE.md:259–270` is a duplicate of it, not a unique record.

Writing it into `docs/navigation.md` would create a **third** copy and split the pipeline across two
docs, which is what the Self-maintenance section exists to prevent. So:

- The enumeration is **deleted** from `CLAUDE.md`, not relocated.
- Two clauses `CLAUDE.md` states that `docs/architecture.md` does not are **folded into**
  `docs/architecture.md` (§3.3) so nothing is lost.
- `docs/navigation.md` gets a **one-line pointer** (§3.4) so a reader who starts at the navigation
  map still lands on the pipeline. That is the part of the brief's intent that survives.

If Anton wants the enumeration in `docs/navigation.md` regardless, that is a one-line change to
§3.3/§3.4 — say so before Session 2 starts. Byte outcome in `CLAUDE.md` is identical either way.

### 3.2 Remove from `CLAUDE.md`

Delete `CLAUDE.md:258–270` — the blank line, the `### playerRows pipeline (all useMemo, must stay in
this order)` heading, steps 1–7, the `playerRowsWithRanks` terminal-output paragraph, and the
`Also upstream:` paragraph. The file then ends at `:257`, the `dataSeason` paragraph.

**Kept verbatim, untouched — both are traps:**

- the `> **App state & \`leagueData\` shape:**` blockquote (`:255`),
- the whole `**\`dataSeason\` — the loader-season choice.**` paragraph (`:257`), which carries both
  the `dataSeason`-vs-`nflState.season` rule and the branch-on-`loaderResult.complete`-not-key-presence
  rule. `## Traps` (`:59–60`) points at this section for exactly these two; that pointer stays valid.

### 3.3 The one surviving line, and what gets folded into `docs/architecture.md`

`CLAUDE.md` already has the "order is load-bearing" line — in `## Invariants` at `:132`. Keep it
there (do not add a second one in `## State and data flow`) and **replace `:132` with**:

```markdown
**playerRows pipeline order is load-bearing.** The seven memo steps, and the memos upstream of them, are in [docs/architecture.md](docs/architecture.md) → *playerRows pipeline*. Trace it there before changing any step — each depends on the previous one's output shape.
```

Two clauses exist only in `CLAUDE.md`'s copy. Fold them into `docs/architecture.md`'s arrow diagram
so the deletion loses nothing — append to the `playerRows (useMemo)` line's comment column:

```
    → playerRows (useMemo)          — computeDynastyScore called per player;
                                      share trend boost applied inside dynasty score;
                                      also adds positionRank (by currentSeasonPPG) and computes
                                      careerSparkline inline — not snapshotted, not scored, and no
                                      downstream pipeline step depends on it
```

The `careerSparkline` null-vs-zero semantics are already stated in that file's player-row shape
block; do not restate them here.

### 3.4 `docs/navigation.md` pointer

In `docs/navigation.md`'s `### src/` table, replace the `App.jsx` row's Responsibility cell with:

```markdown
| `App.jsx` | Root component; owns all state; builds playerRows pipeline (the seven memo steps and everything upstream of them: [architecture.md](architecture.md) → *playerRows pipeline*); renders the router + nav shell (`components/shell/AppShell`) and injects pipeline outputs into routed surfaces |
```

---

## 4. Edit D — dedupe the cross-repo mirror rule in `## Self-maintenance`

The mirror rule is currently stated in full **twice**: `CLAUDE.md:138` (under
`### Cross-repo contract registry`) and `CLAUDE.md:249` (under `## Self-maintenance`). Keep the
registry copy — it sits with the registry link, the "does not exist for review purposes" line, and
the plan-reviewer's own authority statement. Make Self-maintenance a pointer.

**One clause lives only in `:249`** and must not be lost: a genuinely new coupling's entry
"[lands in] **both** repos in the same change". Move it into the registry section rather than
dropping it. This preserves the rule's substance; it does not change it.

**D1 — `CLAUDE.md:140`**, append one sentence to the existing line (rest of the line unchanged):

```markdown
**A coupling that is not listed there does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see [Workflow convention](#workflow-convention). The resulting entry lands in **both** repos' registries in the same change.
```

**D2 — `CLAUDE.md:249`**, replace the whole paragraph with:

```markdown
Cross-repo mirroring is not restated here: the `Mirror`-emission rule and the new-coupling case are in [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard-data), and they apply to every change.
```

`:138` (the `**Rule.**` paragraph) is **not** touched. `docs/cross-repo-registry.md` is **not**
touched.

---

## 5. Edit E — new done-definition step 9

Insert after `CLAUDE.md:160` (`8. Fix anything red before declaring done.`), as step **9**:

```markdown
9. **Hand back to Session 1**: the commit SHA or diff range, every file touched, every deviation from the task file, and what each new or changed test asserts. Verification reviews the diff, not this summary.
```

Steps 1–8 keep their current numbering and text (step 6 is rewritten by Edit B2). Step 9 is last on
purpose — the hand-back is emitted after the suite is green, not before.

---

## 6. Edit F — new file `.claude/agents/implementation-reviewer.md`

Modelled on `.claude/agents/plan-reviewer.md` (5,409 bytes): same frontmatter keys, same
three-numbered-mandate shape, same "Output" contract with a fenced block and a closing
empty-case sentence. Differences from plan-reviewer: `Bash` is added to `tools`, and the output
carries a `SCOPE` block instead of `MIRROR`.

**Write exactly this file:**

````markdown
---
name: implementation-reviewer
description: Read-only reviewer for Session 2 implementation diffs — the verification gate. Invoke from the still-open Session 1 after Session 2 hands back a commit SHA or diff range. Checks the diff against the task file, against the prose-only invariants no test guards, and against whether new tests assert real behaviour.
tools: Read, Grep, Glob, Bash
model: opus
---

You are the verification gate for this repo's implementation sessions. A sonnet session has
implemented a task file and handed back a commit SHA or diff range. Your job is to find where the
diff and the task file disagree, before a human signs off.

**You are read-only. Do not edit, create, or delete any file, and do not fix anything you find.**
`Bash` is available for `git diff` and `git show` only — reading the diff, its stat summary, and the
file contents at a revision. Do not run the test suite, the build, the linter, `npm`, or any command
that writes, stages, commits, checks out, or stashes. Everything else you need comes from `Read`,
`Grep` and `Glob` on the live working tree.

**Review the diff, not the hand-back.** The hand-back is a claim about the diff and is exactly the
thing that cannot report its own omissions. Read the task file, then read the actual diff, then
compare. Where the two disagree, the diff is what happened.

Start by reading the task file named in the invocation (or the one the hand-back names), then get
the diff for the range you were given. If no range was given, say so and stop — do not guess at
`HEAD~1`.

Your mandate has three parts. Run all three on every review.

## 1. Fidelity to the task file

- A specified change that is missing, partial, or implemented somewhere other than where the task
  file put it.
- A signature, data shape, constant, or stat key that differs from what the task file specified,
  where the task file gave a concrete value.
- **Files touched that the task file's touch list does not name.** Diff the set of changed paths
  against the task file's own list of files. An unlisted file is not automatically wrong — it may be
  a necessary consequence the plan missed — but it is always worth a flag, because it is the shape
  scope creep takes and nobody else is looking for it.
- Behaviour the diff adds that no line of the task file asked for.

Do not flag a deviation the hand-back itself declared, unless the declared deviation is worse than
reported or has consequences the hand-back does not mention. Say so when that is the case.

## 2. Invariant conformance — the ones no test guards

Read the **Invariants** section of CLAUDE.md before judging this — read it, do not rely on memory,
and do not restate it in your output. Several invariants there are enforced by a test
(`factorsSchema`, `statKeysContract`, `advStatsViewOnly`, `teamContextViewOnly`) and a green suite
already covers them. These are the ones carried in prose alone, where this review is the only check:

- **App.jsx owns all domain/pipeline state.** Domain state moved into a child component or a new
  hook, or read from anywhere but props / `ProfileDataContext`. View-local table UI state in
  `usePlayersTable` is explicitly not domain state.
- **No state library, no TypeScript.** A new Redux/Zustand/Jotai/other store dependency or import,
  or a `.ts`/`.tsx` file.
- **Cache TTLs are not touched unless asked.** A changed TTL argument or default in `cache.js` or at
  any `setCache` call site, where the task file did not ask for it.
- **Working utilities are not refactored mid-feature.** Renames, signature changes, extractions or
  reorganisations of utility functions the feature did not require. Check this against the diff's
  own churn, not against taste.
- **`PROVISIONAL(...)` tagging.** Every site that renders or derives a value not backed by real data
  carries a single-line `PROVISIONAL(<category>)` comment, with `<category>` exactly one of
  `no-data`, `heuristic`, `mock-copy`, at the derivation *and* the render site where they differ.
  Run `grep -rn "PROVISIONAL(" src/` and compare against the diff: flag a new unbacked value with no
  tag, a malformed or invented category, and a tag left behind on a site whose real source this diff
  just wired up.

Flag the specific invariant by name. Do not flag stylistic preferences.

## 3. Test honesty

For **every** new or changed test in the diff, answer one question: does it assert the correct new
behaviour, or was it edited until it passed?

- A changed assertion whose new expected value was read off the new implementation's output rather
  than derived from what the behaviour should be.
- An assertion loosened to accommodate the change — a tightened tolerance widened, an exact value
  replaced by `toBeTruthy`/`toBeDefined`/`expect.any`, a specific error replaced by a bare `throws`.
- A test skipped, `.only`'d, deleted, or renamed out of the suite's path, and whether the diff says
  why.
- New behaviour in the diff with no test at all, where the change is behavioural. Renames, docs,
  lint and dead-code removal need none.
- A test that exercises the mock rather than the code — asserting on a stubbed return value that the
  implementation never transforms.

Name the test file and case. State what it asserts now and what it should assert instead.

## 4. Cross-repo carry-over

Two Session 1 obligations survive into the diff. Check both, from the task file and the diff only —
you cannot read the sibling repo, and must not try.

- If the task file has a `## Cross-repo impact` section quoting a `CR-NN` id and its `Mirror` text,
  confirm that text was actually emitted in Session 2's hand-back or commit message. A mirror
  instruction that stops at the plan never reaches the sibling.
- If the change surfaced work belonging to the data repo, `.claude/tasks/data-repo-backlog.md` must
  be appended in the same change, naming the commit that found it and whether it blocks. Flag an
  append that is missing, and flag one that names no commit or no blocking status.

## Output

Stay silent on solid work. Do not restate or summarize the diff. Do not rewrite it. Do not propose
stylistic changes. Do not edit any file. Your flags are advisory — the human decides what gets
fixed, and nothing here is auto-applied.

Emit up to two blocks, in this order:

```
FLAGS
FLAG [category]: <one-line problem> — <file:symbol or line anchor>
…

SCOPE
<path> — touched by the diff, not named in the task file's touch list
…
```

Categories: `fidelity`, `scope`, `invariant`, `test-honesty`, `untested`, `cross-repo`, `backlog`.

Omit `FLAGS` if there are none. Omit `SCOPE` if every changed path is accounted for. If both are
empty, output exactly: "No blocking issues found." and nothing else.
````

---

## 7. Docs updates

| File | Change |
|---|---|
| `docs/architecture.md` | **New** `## Smoke-testing the running app` section between `## Vite configuration` and `## Sleeper API notes` (§2). Two clauses appended to the `playerRows (useMemo)` line of the pipeline diagram (§3.3). |
| `docs/navigation.md` | `### src/` table, `App.jsx` row — pointer to architecture.md's pipeline section (§3.4). |
| `README.md` | `## Documentation` list, `docs/architecture.md` bullet — append "and the app smoke-test recipe" (§2). |
| `docs/cross-repo-registry.md` | **Not touched.** |
| `docs/signal-registry.md` | **Not touched** — no signal, factor or capture changes, so the Self-maintenance signal-registry rule does not fire. |

**Known stale anchors, not fixed here.** Three archived task files link
`CLAUDE.md#which-model-for-which-task`, an anchor Edit A removes:
`.claude/tasks/startsit-reframe.md:10`, `.claude/tasks/token-efficiency.md:9`,
`.claude/tasks/frontend-1e-contrast-palette-width.md:13`. They are historical records of completed
work and Self-maintenance says nothing in the tree records history for its own sake; rewriting them
would falsify what those sessions were told. Leaving them. The `#workflow-convention` anchor that
~20 other task files link **survives** Edit A unchanged.

---

## 8. Tests to add

**None.** Every edit is prose, docs, or a subagent definition; no `src/` behaviour changes, so
done-definition step 1's "purely non-behavioural changes need none" applies.

The existing guard is sufficient and must stay green:

- `src/__tests__/claudeMdSize.test.js` — the 25,000-byte ceiling and the 3,000-byte `## Traps`
  sub-cap. Projected: **20,398** and **2,240**. Both pass with margin. **Do not touch this file**;
  in particular do not lower `CEILING` to fit the new number — the headroom is the point.

Verification for this task, in place of tests:

1. `npm test` green (the size test is the one that matters).
2. `npm run lint`, `npm run build` clean — both should be no-ops for a docs change; run them anyway,
   step 5 is not conditional.
3. `wc -c CLAUDE.md` — expect 20,398. A number more than ~50 bytes off means a paste went wrong.
4. `grep -n "^#\{2,3\} " CLAUDE.md` — expect exactly these headings in order: Commands, Navigation
   map, Traps, Invariants, Cross-repo contract registry, Field-existence rule, Done-definition for
   code tasks, Workflow convention, Reviews, How to talk to Anton, The Claude.ai project,
   Self-maintenance, State and data flow.
5. `grep -c "Which model for which task\|How to smoke it\|### playerRows pipeline" CLAUDE.md` → `0`.
6. Step 6 is docs-only with no visible surface — note that instead of smoking the app.

---

## 9. Byte accounting

| Edit | Bytes |
|---|---|
| `CLAUDE.md` before | 23,899 |
| A — `:164–228` (5,737 bytes) → mirrored block + trailing blank line (4,173) | −1,564 |
| B2 — done-definition step 6 retarget (`:158`) | +28 |
| C — invariant pointer retarget (`:132`) | +103 |
| C — delete `:258–270` (2,113 bytes, plus the newline that joined them) | −2,114 |
| D1 — the both-repos clause appended to `:140` | +76 |
| D2 — Self-maintenance dedupe (`:249`) | −239 |
| E — done-definition step 9 | +209 |
| **Net** | **−3,501** |
| **`CLAUDE.md` after** | **20,398** |
| Headroom under the 25,000 ceiling | 4,602 |
| Under this task's 21,000 target by | 602 |

Every row was measured by applying that one edit alone to live `CLAUDE.md` and byte-counting the
result. The rows sum to the net exactly — byte-exact substitutions produce no rounding, so there is
no correction term. `## Traps` lands at 2,240 against its 3,000 sub-cap, unchanged by this pass.

**Edit A's trailing blank line is load-bearing for this number.** The replaced span `:164–228` ends
with the blank line at `:228`, and the §1 paste block ends at the `**Sibling repo:**` line. Leave
exactly one blank line between that line and the `---` at `:229`. Without it the file is 20,397
bytes and markdown reads the `---` as a setext H2 underline for the sibling-repo line.

**If a later edit pushes past 21,000**, the next things out, in order: (1) the `**Sibling repo:**`
line — 234 bytes, and `docs/integrations.md` → *Data store integration* already describes the
sibling; (2) the `## Navigation map` preamble's product/UX-vision sentence (`:34–37`, ~330 bytes) —
README's Documentation list carries the same two pointers; (3) the `## Commands` env-var paragraph
(`:20–26`, ~490 bytes) — duplicated almost verbatim in README's `## Running locally`. None of these
is needed to hit the target; they are the reserve.

---

## 10. Cross-repo impact

The sibling repo `sleeper-dashboard-data` makes the same mirrored-section change; see its own brief.
The `## Workflow convention` / `### Reviews` / `### How to talk to Anton` /
`### The Claude.ai project` text is identical in both files, and the two must land together — the
final line of the block asserts it. The sibling's `**Sibling repo:**` line names this repo, and its
copy carries no `*(app-only)*` bullets.

**No `CR-NN` entry is triggered.** Checked every entry's app-side triggers (left of `‖`) in
`docs/cross-repo-registry.md` against this task's touch list — `CLAUDE.md`, `docs/architecture.md`,
`docs/navigation.md`, `README.md`, `.claude/agents/implementation-reviewer.md`. No entry lists any
of them. The nearest miss is **CR-19 (signal registry)**, whose *data*-side triggers include "the
signal-registry and Sibling-repo pointers in `CLAUDE.md`" — that is the data repo's own `CLAUDE.md`,
not this one, and CR-19's app side is `docs/signal-registry.md` alone, which this task does not
touch. No `Mirror` text to emit.

---

## 11. Files touched

| File | Edits |
|---|---|
| `CLAUDE.md` | A (`:164–228`), B2 (`:158`), C (`:132`, `:258–270`), D1 (`:140`), D2 (`:249`), E (after `:160`) |
| `docs/architecture.md` | §2 new section, §3.3 diagram clauses |
| `docs/navigation.md` | §3.4 `App.jsx` row |
| `README.md` | §2 Documentation bullet |
| `.claude/agents/implementation-reviewer.md` | §6, new file |

Nothing under `src/` is touched. Line anchors are against `CLAUDE.md` **as it stands today at
23,899 bytes**. Apply the seven anchor points in strictly descending order, so that no edit shifts a
later one:

1. C — delete `:258–270`
2. D2 — replace `:249`
3. A — replace `:164–228` (keep the blank line before `:229`, per §9)
4. E — insert step 9 after `:160`
5. B2 — replace `:158`
6. D1 — append to `:140`
7. C — replace `:132`

Applying E first would push every anchor below it down by one line. If an anchor's quoted text does
not match what is on that line, stop and re-locate by the quoted text rather than trusting the
number.
