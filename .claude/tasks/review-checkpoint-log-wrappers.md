# Review checkpoint log — parent-folder wrappers, bookkeeping and rule scope

Review depth: light — agent prompt, docs and config only; no scoring, snapshot, served-data or cross-repo contract change.

Planned by: Session 1, parent-folder, cross-repo, sonnet/medium (docs/config-only slice per the model table). Source files edited: none.
Implements in: Session 2 on **sonnet, effort medium**. Commits per repo separately (app, data) and reports the SHA per repo; the three parent-folder files (`../CLAUDE.md`, `../.claude/agents/plan-reviewer.md`, `../.claude/agents/implementation-reviewer.md`) have no git — report them as file diffs (`diff -u` of a before-copy saved in the scratchpad). Ends with its hand-back to Session 1; **sends no sign-off request**.

This is the follow-up to `review-checkpoint-log.md` (its Open item 5), plus two bookkeeping items from its verification.

## Goal

1. The parent-folder wrapper reviewers log and resume exactly like the repo reviewers, so a cross-repo review that is interrupted loses nothing.
2. Close the bookkeeping left by the previous slice: stale commit IDs in its task file, and its unfinished manual verification.
3. Close two rule gaps: an agent change that forgets the same-named agent elsewhere (plan-reviewer check), and a rebase rule too narrow to cover slices of agent/config/docs commits (which is how the stale IDs arose).

## Cross-repo index

**No cross-repo index entry is needed.** Every change here is prompt prose, docs or workflow rules. Nothing in `sleeper-dashboard/docs/cross-repo-registry.md` reads or writes an agent file, `CLAUDE.md`, `git-workflow.md` or a review log, and no data/app site, served file, manifest field or shared constant is touched. The repo reviewers and the wrappers share a protocol, not a contract between the repos' code.

**Copied definitions: none created by this slice.** The wrapper log text (Block W) is new prose in two files; it references the repos' Block R by pointer instead of restating it, so there is no duplicated definition and no equality test applies.

## Agent-location check (the new item-5 rule applied to this slice)

| Agent file | App | Data | Parent `../.claude/agents/` |
|---|---|---|---|
| plan-reviewer | edited (item 5 only) | edited (item 5 only) | edited (item 1) |
| implementation-reviewer | **not edited** — already carries Block R from the previous slice | **not edited** — same | edited (item 1) |

fix-applier, Explore, architecture-auditor, product-strategist and `future_plans/agent-backups/` (holds only the last two) are deliberately excluded.

## Scope — exactly these files

Parent folder (no git):
1. `../.claude/agents/plan-reviewer.md`
2. `../.claude/agents/implementation-reviewer.md`
3. `../CLAUDE.md`

App repo (`sleeper-dashboard/`, one commit):
4. `.claude/agents/plan-reviewer.md` (one added check)
5. `.claude/tasks/review-checkpoint-log.md` (citation fix only)
6. `.claude/tasks/review-checkpoint-log-wrappers.md` — this file; Session 1 commits it after approval and before Session 2 starts (it is not a Session 2 edit; `BASE_app` below is taken after that commit).

Data repo (`sleeper-dashboard-data/`, one commit):
7. `.claude/agents/plan-reviewer.md` (one added check)
8. `CLAUDE.md` (rule scope)
9. `git-workflow.md` (rule scope)

Out of scope (touch nothing): the repo implementation-reviewers, fix-applier, Explore, architecture-auditor, product-strategist, `future_plans/agent-backups/`, both `.gitignore` files (already ignore `.claude/reviews/`), `docs/cross-repo-registry.md`.

Working-tree note: the app repo has unrelated uncommitted files (`.claude/tasks/learned-projection-2b-weekly-models.md`, `.claude/tasks/learned-projection-2b1a-weekly-inputs.md`). Stage **only** the files listed above, by path — never `git add -A` / `git commit -a`. The data repo has an unrelated log `.claude/reviews/learned-projection-2b1a-weekly-inputs.plan-reviewer.md`; do not touch or delete it.

## Design decisions (settled; do not revisit in Session 2)

- **Same file as the repo reviewer.** A wrapper writes the same log its repo reviewer would write: `<repo>/.claude/reviews/<task-file-stem>.<agent-name>.md`, where `<agent-name>` is `plan-reviewer` or `implementation-reviewer` (the wrapper has the same name as the repo agent). Stem = resolved task file's basename without `.md`. Both repos' `.gitignore` already ignore `.claude/reviews/`.
- **Rules are not restated.** The wrapper's text points at each repo agent's `## Review log (checkpoint and resume)` section and says following it is part of "as if it were your own instructions"; it does not copy that section. Single source, no drift.
- **Cross-repo checkpoint lives in the app log**, after the app's `## DONE`, as `## Cross-repo (wrapper) — complete` + FLAG lines or `no flags`, followed by a last line `## DONE (wrapper)`. It is **not skipped at any depth** (the wrapper's cross-repo checks run at every depth today; unchanged).
- **App repo with no part in the invocation** (data-only plan/diff): no repo log exists for the app, so the wrapper creates the app log itself with a wrapper-only header (below) so the cross-repo checkpoint has a home.
- **Resume is per log.** Each repo's log resumes under that repo file's own rules. The cross-repo part is skipped on resume only if the app log already holds the `## Cross-repo (wrapper) — complete` checkpoint **and no repo log was overwritten as a mismatch on this run**; otherwise it is dropped and re-run (the cross-repo flags depend on both repos' results).
- **One NOTE line.** If any log (repo or cross-repo) did not match and was overwritten, the wrapper's final output begins with the single line `NOTE: resume log did not match this invocation; started fresh.` — the same text the repo reviewers use; emitted once.
- **Wrapper Bash.** The wrappers keep Bash, now also allowed `date -u +%Y-%m-%dT%H:%MZ` for the wrapper-only header. For each repo's part the wrapper stays within that repo agent file's own Bash limits (app implementation-reviewer: `git diff`/`git show`/`date -u` only; data: its listed commands). Logs are written with `Write` only, never through Bash.

## Required changes

All "Replace" strings are the exact current text; if one does not match, stop and report.

### 1. Wrappers get logging — `../.claude/agents/plan-reviewer.md` and `../.claude/agents/implementation-reviewer.md`

Apply to both files:

- **Frontmatter `tools:`** — `tools: Read, Grep, Glob, Bash` → `tools: Read, Grep, Glob, Bash, Write`.
- **`description:`** — replace the final words `Read-only.` with `Read-only except for the review logs.` Rest of the description unchanged.
- **Body, after the first paragraph** (the paragraph that ends `Never restate, paraphrase or override them.`) insert a new paragraph:
  > You are read-only except for the per-repo review log(s) described under "Review log" below. Never stage or commit them.
- **Step 2 (both files)** — append to the end of step 2 (after `do not improvise rules.`), as a continuation of that list item:
  > Following a repo's agent file "as if it were your own instructions" includes its `## Review log (checkpoint and resume)` section: you write and resume that repo's log exactly as it specifies (header, per-section checkpoints, `## DONE`, `resume`, the mismatch `NOTE:` line, any extra checkpoints it names). `Write` is now in your tools for exactly this. Where that section says "in this repo", the log is `<repo>/.claude/reviews/…` for the repo you are reviewing, resolved from the parent folder. See "Review log" below.
- **Step 4**
  - plan-reviewer: replace `Do not edit anything.` with `Do not edit anything except the review logs. Build the output from the logs (see "Review log").`
  - implementation-reviewer: replace `Advisory; do not edit anything.` with `Advisory; do not edit anything except the review logs. Build the output from the logs (see "Review log"), including each repo file's SCOPE / TESTS lines where it defines them.`
- **New final section** — append at the end of each file, with `{AGENT}` = `plan-reviewer` or `implementation-reviewer` and the `{diff range …}` lines (marked) present in the implementation-reviewer file only:

```
## Review log (checkpoint and resume)

**Per-repo logs.** For each repo you review, the log is
`<repo>/.claude/reviews/<task-file-stem>.{AGENT}.md` — `sleeper-dashboard/.claude/reviews/…` and/or
`sleeper-dashboard-data/.claude/reviews/…` — the same file that repo's own {AGENT} writes, with
`<task-file-stem>` the resolved task file's basename without `.md`. Follow that repo agent file's
`## Review log (checkpoint and resume)` rules exactly as written, applied to that repo's part only. If a repo's agent
file has no such section, say so and flag it, as for a missing agent file — do not improvise rules.
Write logs with `Write` only, never through Bash. `Write` replaces the whole file and needs an
existing file to have been `Read` first, so to append: `Read` the log, then `Write` its full prior
contents plus the new section. A checkpoint exists only once that `Write` has returned. A log that
contains a `## DONE` line counts as finished for that repo's own "log already ends in `## DONE`" rule,
even after the cross-repo checkpoint below has been appended after it.

**Cross-repo checkpoint.** When every repo you review has reached `## DONE` in its log, run the
cross-repo checks (step 3) — at every depth, never skipped — and append to the **app repo's** log
`sleeper-dashboard/.claude/reviews/<task-file-stem>.{AGENT}.md`, after its `## DONE`:

    ## Cross-repo (wrapper) — complete
    <the cross-repo FLAG lines verbatim, or `no flags`>
    ## DONE (wrapper)

Write it before producing any output. If the app repo has no part in this invocation (so no app log
exists), first create that log with `Write`:

    # Review log — {AGENT} (wrapper, cross-repo only)
    task file: <path>
    {diff range: <the data repo's range>}
    depth: <light|full> — <reason>
    started: <UTC time — run `date -u +%Y-%m-%dT%H:%MZ` with Bash>

and then append the checkpoint as above.

**Resume.** `resume` passed to you resumes each log independently: apply each repo file's own resume
rules to its own log (header match, depth precedence, skip completed sections, a finished log means
no work for that repo). The cross-repo part is skipped — its recorded FLAG lines are reused — only if
the app log already holds `## Cross-repo (wrapper) — complete` **and no repo log was overwritten as a
mismatch on this run**; otherwise `Read` the app log, `Write` it back without the
`## Cross-repo (wrapper) — complete` and `## DONE (wrapper)` lines, and re-run step 3. If any log
did not match and was overwritten, begin your final output with the single line
`NOTE: resume log did not match this invocation; started fresh.` (once).

**Final output** is built from the logs alone, in each repo file's Output format, grouped by repo
plus a `Cross-repo` group, flags only; when every group is empty, exactly
"No blocking issues found." The logs add no output category.
```

(The implementation-reviewer file's `{diff range: …}` line stays; in the plan-reviewer file delete that line. Resolve all `{…}` so no braces or placeholders ship.)

### 2. `../CLAUDE.md`, `### Reviews and fixes`

- Delete the sentence ` (Repo-scoped sessions only: the parent-folder wrapper reviewers do not log yet.)` from the paragraph `If a review is interrupted, re-invoke the same reviewer with `resume`; its log is in `.claude/reviews/`.` (the paragraph keeps its first sentence).
- fix-applier bullet: replace `The only agent in this loop that writes. Implements that section exactly and nothing` with `The only agent in this loop that writes source; the reviewers write only their own review logs. Implements that section exactly and nothing` (the line wraps — keep the existing wrap points sensible; no other change to the bullet).

No other edit to the file. Note (not changed here, see Open items): the Fix-pass bullet `the applier is the only writer` is left as briefed.

### 3. Real interrupt/resume test (manual verification — Session 2 runs it and reports it)

Edits 1 and 2 must exist first (subagent files are read at invocation). Record `git rev-parse --short HEAD` in each repo **before** Session 2's first commit; that is `BASE_app` / `BASE_data`. The ranges under review are `BASE_app..<app slice commit>` and `BASE_data..<data slice commit>` (commit first, then test). The parent-folder files are not in any range (no git); that is an accepted gap — Session 1 reads them directly in verification.

**3a. Parent-folder wrapper, real interrupt (Session 2, started from the parent folder).**
1. Invoke the real `implementation-reviewer` subagent — the parent wrapper; do **not** substitute a general-purpose agent — on this task file, `light` depth, with both ranges above. Run it in the background so it can be stopped.
2. Wait (Monitor with an until-loop on `grep -q '## §1' sleeper-dashboard/.claude/reviews/review-checkpoint-log-wrappers.implementation-reviewer.md`) until at least one checkpoint lands, then stop the run (TaskStop). If the reviewer finishes before a checkpoint can be observed and stopped, say "too fast to interrupt" — **do not hand-truncate a log and call it an interrupt**; if that happens, report it and stop; Session 1 decides.
3. Snapshot the logs (copy to scratchpad) at the moment of interrupt. Re-invoke the wrapper with `resume`, same task file, depth and ranges.
4. Report: which sections were already `complete` at interrupt (per log), which the resumed run skipped, which it re-ran, whether each log ends in `## DONE` (app log: `## DONE (wrapper)`), and whether the final output matches a clean run: invoke the wrapper once more **without** `resume` on the same ranges (logs overwritten) and compare the two final outputs (FLAGS/SCOPE/TESTS blocks must match; a legitimately different judgment call between two model runs is reported verbatim, not hidden — say which lines differ).
5. Delete the test logs afterwards: `sleeper-dashboard/.claude/reviews/review-checkpoint-log-wrappers.*.md` and `sleeper-dashboard-data/.claude/reviews/review-checkpoint-log-wrappers.*.md` **only** (the unrelated `learned-projection-2b1a-weekly-inputs.plan-reviewer.md` stays). Confirm `git status` in both repos shows no `.claude/reviews/` entry and no file beyond the slice's own.

**3b. Repo reviewer, repo-scoped (separate session).** A session started from the parent folder cannot run the repo agent, so this step needs a fresh **sonnet, effort medium** session started **inside `sleeper-dashboard/`** (Anton starts it; Session 2's hand-back says so, with the exact range `BASE_app..<app slice commit>` and the task-file path). Its whole job: invoke the repo `implementation-reviewer` once (`light`) on that app range, confirm `.claude/reviews/review-checkpoint-log-wrappers.implementation-reviewer.md` is written with a header and checkpoints ending in `## DONE`, report that, delete the log, and confirm `git status` is clean of it. It edits nothing else. Its report goes to Session 1 for the verification record.

## Required changes (continued)

### 4. Citation fix — `.claude/tasks/review-checkpoint-log.md` (app repo)

The data commits were rebased at push. Edit only these two lines (found by `grep -n "e7e804b\|19b6a5e"`; expected hits: `## Fix pass 1` Source line, `## Verification` Commits line):

- First occurrence of `e7e804b` (Fix pass 1 Source line) → `d7473b7 (pre-rebase id e7e804b)`.
- First occurrence of `19b6a5e` (Verification Commits line) → `938200e (pre-rebase id 19b6a5e)`.
- Every other occurrence of `e7e804b` → `d7473b7`, and of `19b6a5e` → `938200e` (known: the Verification Commits line's own `e7e804b`).
- Done when: `grep -n "e7e804b\|19b6a5e"` returns exactly the two `(pre-rebase id …)` parentheticals and nothing else; `git diff` shows changes on those two lines only. No other edit to that file.

### 5. Agent-location check — both repo plan-reviewers

Add one bullet as the **last bullet of `## 1. Factual / mechanical`**, after the existing `FLAG [copy]` bullet, in `sleeper-dashboard/.claude/agents/plan-reviewer.md` and in `sleeper-dashboard-data/.claude/agents/plan-reviewer.md` (data §1 heading is also `## 1. Factual / mechanical`):

```
- FLAG [mechanical]: the task file changes an agent file under .claude/agents/ but its touch list does not name, or say why it excludes, the same-named agent in the other repo and in the parent folder's ../.claude/agents/ (read the parent copy if present).
```

Nothing else in either file changes. (Do not touch the data file's `<!-- Changelog … -->` comment.)

### 6. Rebase-rule scope — data repo

- `sleeper-dashboard-data/CLAUDE.md`, "Session git workflow", the `**Pre-verification rebase.**` paragraph: replace `For a slice with code or task-file commits, Session 1 runs` with `For any slice with unpushed commits of its own — code, task file, agent, config or docs — Session 1 runs`. Leave the rest of the paragraph and the `**Cross-repo commit IDs.**` bullet unchanged. File is 23,535 bytes against a 25,000 ceiling (`test/claudeMdSize.test.mjs`); the edit adds ~45 bytes — fine, but confirm with `wc -c`.
- `sleeper-dashboard-data/git-workflow.md` item 2: replace `**Rebase before verification** (slices with code or task-file commits).` with `**Rebase before verification** (any slice with unpushed commits of its own — code, task file, agent, config or docs).` Rest of item 2 unchanged.

## Tests

**None.** Prompt/config/docs only; there is no executable behaviour to assert and nothing in either repo's suites reads agent prompts, `.claude/tasks/` files (beyond existence) or `git-workflow.md`. Item 3 is the verification. Session 2 still runs each repo's done-definition to confirm nothing regressed: app `npm test`, `npm run lint`, `npm run build`; data `npm run smoke`, `npm test` (the data one includes `claudeMdSize.test.mjs`). Results go in the hand-back.

## Git and rebase handling for this slice (item 6 applied to itself)

- Session 2 commits per repo separately, by path, unpushed. Suggested subjects: app `Review checkpoint log: wrappers, agent-location check, citation fix`; data `Rebase rule covers agent/config/docs slices; plan-reviewer agent-location check`.
- **Session 1 verification:** in the data repo run `git pull --rebase origin main` **before** writing `## Verification` (and again before the sign-off request if new captures landed); cite every data commit ID taken after that rebase. In the app repo the same applies if the slice's commits are rebased.
- **Push session:** if a push-time rebase still changes any cited ID, fix the citations in the same push session, before reporting done (data `CLAUDE.md`, "Cross-repo commit IDs"). Report the pushed SHAs.
- Sign-off: Session 1 only, per the template in `../CLAUDE.md`; the push-guard needs the `## Verification` section plus `Signed off by Anton YYYY-MM-DD` committed in this task file before the app push; the data repo's push follows the same sign-off.

## Hand-back must contain

- Commit SHA per repo (app, data) and the repo-by-repo list of files touched; for the three parent-folder files, the `diff -u` against the before-copies.
- Every deviation from this task file (text that did not match, a `{ }` fragment resolved differently, etc.).
- Tests: "none — prompt/config/docs only", plus the done-definition results per repo.
- Item 3a outcome in the five report points above; item 3b: the exact range and instruction for Anton to start the repo-scoped session (or its result, if already run).
- The item-4 grep result and the item-6 `wc -c` result.
- Confirmation that logs were deleted and that no `.claude/reviews/` file shows in either `git status`.

## Open items (not in this slice; for Anton)

1. `../CLAUDE.md` still says in the Fix-pass bullet "the applier is the only writer". That sentence is about source and is now slightly loose, same as the fix-applier line this slice corrects; the brief changed only the fix-applier bullet, so it is left alone. One-line tweak if you want it consistent.
2. This session's own plan-review runs on the wrapper **as it exists before this slice**, so it writes no log; the first logged wrapper review is the item-3a test.
3. Item 3b needs Anton to start one short repo-scoped session; Session 2 cannot do it from the parent folder.
4. The parent-folder files are outside any git range, so the wrapper test cannot review the wrapper edits themselves; Session 1 reads them directly during verification.
