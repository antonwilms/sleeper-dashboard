# Review checkpoint log — reviewers survive an interrupted run

Review depth: light — agent prompt + config only; no scoring, snapshot, served-data, or cross-repo contract change.

Planned by: Session 1, parent-folder, cross-repo, sonnet/medium (docs/config-only slice). Source files edited: none.
Implements in: Session 2 on **sonnet, effort medium**. Commits in each repo separately and reports the SHA per repo; `../CLAUDE.md` (parent folder) has no git — report it as a file diff.

## Goal

A reviewer run that is interrupted (user interrupt, crash, context limit) must not lose findings already made. Each reviewer writes a checkpoint to a log file after every check section; a re-run invoked with `resume` skips completed sections and finishes from the log.

## Cross-repo index

**No cross-repo index entry.** The two repos' reviewer prompts are independent files that happen to share a protocol; this is not a contract between the repos, nothing in `docs/cross-repo-registry.md` reads or writes it, and no data/app site is touched.

**Duplicated text is deliberate, not a "copied definition".** The Review-log block (Block R below) is repeated in four self-contained agent prompts because each agent loads only its own file. It is prompt prose, not a function/constant/formula, so the CLAUDE.md copy-equality-test rule does not apply; no test is added (see Tests).

## Scope — exactly these files

1. `sleeper-dashboard/.claude/agents/plan-reviewer.md`
2. `sleeper-dashboard/.claude/agents/implementation-reviewer.md`
3. `sleeper-dashboard-data/.claude/agents/plan-reviewer.md`
4. `sleeper-dashboard-data/.claude/agents/implementation-reviewer.md`
5. `sleeper-dashboard/.gitignore`, `sleeper-dashboard-data/.gitignore`
6. `../CLAUDE.md` (parent; not under version control — deliberate, small diff)

Out of scope (touch nothing): fix-applier, Explore, architecture-auditor, product-strategist, `future_plans/agent-backups/`, and the parent-folder wrapper agents (`.claude/agents/plan-reviewer.md`, `implementation-reviewer.md` in the parent folder — see Open items).

## Design decisions (settled; do not revisit in Session 2)

- **Log path** — the only file a reviewer may write: `.claude/reviews/<task-file-stem>.<agent-name>.md` in the repo the reviewer runs in. `<task-file-stem>` = basename of the resolved task file without `.md`. Example: `.claude/reviews/lp-2b.implementation-reviewer.md`.
- **Writing mechanism.** Reviewers write the log with `Write` only, never through Bash (no redirects). `Write` replaces a whole file and requires an existing file to have been `Read` first, so "append" = `Read` the log, then `Write` its full prior contents plus the new section. A checkpoint counts only once that `Write` has returned. The log is git-ignored; reviewers never stage or commit it.
- **Clock.** `start time` comes from `date -u +%Y-%m-%dT%H:%MZ` via Bash. App plan-reviewer has no Bash and must not gain it, so it writes `started: not recorded (no clock tool)`. The three Bash-equipped reviewers add `date -u` to their allowed Bash commands (app implementation-reviewer's Bash is currently "`git diff` and `git show` only", so this needs an explicit edit).
- **A partly-done section is redone whole.** Only a written checkpoint marks completion; a section with no checkpoint is re-run from its start on resume.
- **Depth on resume.** Reuse the depth recorded in the log. If the invocation names a depth that differs from the log's, treat that as a mismatch (overwrite, as for a header mismatch).
- **Known limitation, accepted:** on resume, completed sections (including data implementation-reviewer's `npm test` / `npm run smoke` results) are taken from the log even if the working tree moved since. Resume is for the same, unmoved range.
- **Final output** is built from the log and keeps today's format byte-for-byte (FLAGS / SCOPE / TESTS blocks, `No blocking issues found.` when empty). The single permitted addition: if a `resume` invocation did not match the log and the log was overwritten, the output's first line is `NOTE: resume log did not match this invocation; started fresh.` followed by the normal output (the log-mismatch notice cannot be silent; this is the one place "No blocking issues found." is preceded by a line).

## Block R — the shared Review-log section

Insert as a new `## Review log (checkpoint and resume)` section **immediately before `## Review depth`** in each of the four reviewer files, substituting `{AGENT}` (`plan-reviewer` or `implementation-reviewer`), `{RANGE}` (implementation-reviewers only; delete the `diff range` fragments in plan-reviewers), `{SECTIONS}` and `{SKIPS}` from the per-file table below, and `{CLOCK}` (`run \`date -u +%Y-%m-%dT%H:%MZ\` with Bash` — or, app plan-reviewer only, `write \`not recorded (no clock tool)\``).

```
## Review log (checkpoint and resume)

You keep a log so an interrupted run loses nothing. **The log is the only file you may write:**
`.claude/reviews/<task-file-stem>.{AGENT}.md` in this repo, where `<task-file-stem>` is the resolved
task file's basename without `.md` (e.g. `.claude/reviews/lp-2b.{AGENT}.md`). Write it with `Write`
only — never through Bash. `Write` replaces the whole file and needs an existing file to have been
`Read` first, so to append: `Read` the log, then `Write` its full prior contents plus the new
section. A checkpoint exists only once that `Write` has returned. Never stage or commit the log; it
is git-ignored.

**Start of run.** Resolve the task file{ and diff range} first. The header below is written after
the depth decision (see Review depth).

- **Invocation without `resume`:** if a log already exists, `Read` it first (a `Write` over an
  unread file fails), then overwrite it with this header; if none exists, just write it. Then proceed:
  ```
  # Review log — {AGENT}
  task file: <path>
  {diff range: <range>}
  depth: <light|full> — <reason>
  started: <UTC time — {CLOCK}>
  ```
- **Invocation with `resume`:** read the log (no log = treat as a fresh run). If its header's task
  file{ and diff range} match this invocation, and the invocation names no depth different from the
  logged one, keep the log and skip every section it marks `complete` or
  `skipped` (do not re-read or re-judge them). Run the remaining sections, appending checkpoints as
  below. **Depth precedence on resume: the log's depth, then an explicit invocation depth (which, if it differs from the log, is a mismatch), and the task file's `Review depth:` line is not consulted** — you do not re-decide depth, and an edit to the task file's depth line between runs does not change a resumed run (re-invoke without `resume` to pick it up). If it does not match, `Read` the log, overwrite it as for a fresh run (re-deciding depth normally), and begin your final output with
  the single line `NOTE: resume log did not match this invocation; started fresh.` If the log
  already ends in `## DONE`, do no review work: build the final output from it.

**Checkpoints.** Sections run in order {SECTIONS}. After the header, and after each section, append
`## §N <section name> — complete` followed by that section's FLAG lines verbatim{ (and its SCOPE /
TESTS lines verbatim, where the Output block defines them)}, or `no flags`. Write the section's
checkpoint before starting the next section. A section skipped by depth gets
`## §N — skipped (depth: light)` instead: {SKIPS}. When the last section is done, append `## DONE`.

**Final output** is built from the log alone, in the existing Output format, byte for byte: all FLAG
lines in section order, then the SCOPE / TESTS blocks where defined, or exactly
"No blocking issues found." when empty. The log adds no output category.
```

(Brace fragments `{ … }` are per-file optional text; Session 2 resolves them, leaving no braces or placeholders in the shipped files.)

## Per-file edits

All "Replace" strings below are the exact current text; if one does not match, stop and report.

**Edit common to all four files — the empty-output sentence in `## Output`.** Current text is `output exactly: "No blocking issues found." and nothing else.` (app plan-reviewer, app implementation-reviewer — the latter's sentence reads `If both are empty, output exactly: …`) and `output exactly "No blocking issues found." and nothing else.` (both data files). In each, replace `and nothing else.` with `and nothing else — except that a resume \`NOTE:\` first line (see Review log) may precede it.` This resolves the conflict with Block R's NOTE exception.

### 1. `sleeper-dashboard/.claude/agents/plan-reviewer.md`

- Frontmatter: `tools: Read, Grep, Glob` → `tools: Read, Grep, Glob, Write`. **Do not add Bash.**
- `description:` — replace `Read-only reviewer for Session 1 task files` → `Reviewer (read-only except its own review log) for Session 1 task files`. Rest of the description unchanged.
- Insert Block R before `## Review depth`. `{AGENT}`=plan-reviewer; no diff range; `{CLOCK}` = the no-clock variant; `{SECTIONS}` = `§1 Factual / mechanical`, `§2 Strategic / principles` (at `light` this is the one-line shape check — checkpoint it as complete), `§3 Cross-repo`, `§4 Slice size`; `{SKIPS}` = §3 Cross-repo at `light`. No SCOPE/TESTS lines.
- `## Output`: replace `Do not edit any file. Your flags are advisory` → `Do not edit any file except your own review log. Your flags are advisory`. Add as the first sentence of `## Output`: `Build the output from your review log (see Review log).`

### 2. `sleeper-dashboard/.claude/agents/implementation-reviewer.md`

- Frontmatter: `tools: Read, Grep, Glob, Bash` → `tools: Read, Grep, Glob, Write, Bash`.
- `description:` — `Read-only reviewer for Session 2 implementation diffs` → `Reviewer (read-only except its own review log) for Session 2 implementation diffs`.
- Replace the read-only paragraph:
  - Old: `**You are read-only. Do not edit, create, or delete any file, and do not fix anything you find.**` / `` `Bash` is available for `git diff` and `git show` only — reading the diff, its stat summary, and the `` / `file contents at a revision.`
  - New first sentence: `**You are read-only, except for your own review log (see Review log). Do not edit, create, or delete any other file, and do not fix anything you find.**` Bash sentence becomes: `` `Bash` is available for `git diff`, `git show` and `date -u` only — reading the diff, its stat summary, the file contents at a revision, and the clock for the log header. `` All other prohibitions in that paragraph (no test suite, build, linter, npm, no command that writes/stages/commits/checks out/stashes) stay verbatim; "writes" there means via Bash — the log is written only with `Write`.
- Insert Block R before `## Review depth`. `{AGENT}`=implementation-reviewer; diff range included (`{RANGE}`); `{CLOCK}` = Bash variant; `{SECTIONS}` = `§1 Fidelity to the task file`, `§2 Invariant conformance`, `§3 Test honesty`, `§4 Cross-repo carry-over`; the SCOPE lines produced by §1 go in §1's checkpoint; `{SKIPS}` = §4 at `light` (§2 is **not** skipped at `light` — it runs the `PROVISIONAL(` grep only and is checkpointed `complete`). If no diff range was given the reviewer says so and stops without writing a log (existing rule).
- `## Output`: replace `Do not edit any file. Your flags are advisory` → `Do not edit any file except your own review log. Your flags are advisory`. Add first sentence: `Build the output from your review log (see Review log).`

### 3. `sleeper-dashboard-data/.claude/agents/plan-reviewer.md`

- Frontmatter: `tools: Read, Grep, Glob, Bash` → `tools: Read, Grep, Glob, Bash, Write`.
- `description:` — `Read-only reviewer for Session 1 task files in the data repo` → `Reviewer (read-only except its own review log) for Session 1 task files in the data repo`.
- Insert Block R before `## Review depth`. `{AGENT}`=plan-reviewer; no diff range; Bash clock variant; `{SECTIONS}` = `§1 Factual / mechanical`, `§2 Strategic / principles`, `§3 Cross-repo`, `§4 Slice size`; `{SKIPS}` = none (this reviewer runs all four sections at every depth; `scoped` narrows effort, not sections) — write that clause as "no section is skipped by depth in this reviewer". Leave the `<!-- Changelog … -->` comment untouched. Accepted limitation: this reviewer runs `npm test` inside §3 with no sub-checkpoint, so an interrupt during §3 redoes §3 whole, `npm test` included (harmless).
- `**Bash is for reading only.**` paragraph. Old: `Use it to run \`npm test\` and read-only inspection (\`git show\`, \`git log\`, \`sed -n\`, \`grep\`). Never edit, stage, commit, write a file, or run an ingest command that writes. You are a review gate, not an implementer.` New: `Use it to run \`npm test\` and read-only inspection (\`git show\`, \`git log\`, \`sed -n\`, \`grep\`, \`date -u\`). Never edit, stage, commit, or write any file other than your own review log (written with \`Write\`, never through Bash), and never run an ingest command that writes. You are a review gate, not an implementer.`
- `## Output`: `Do not edit any file.` (the first-paragraph sentence) → `Do not edit any file except your own review log.` Add first sentence: `Build the output from your review log (see Review log).` Categories line unchanged.

### 4. `sleeper-dashboard-data/.claude/agents/implementation-reviewer.md`

- Frontmatter: `tools: Read, Grep, Glob, Bash` → `tools: Read, Grep, Glob, Bash, Write`.
- `description:` — `Read-only reviewer for Session 2 diffs in the data repo` → `Reviewer (read-only except its own review log) for Session 2 diffs in the data repo`.
- Insert Block R before `## Review depth`. `{AGENT}`=implementation-reviewer; diff range included; Bash clock variant; `{SECTIONS}` = `§1 Fidelity to the task file`, `§2 Invariant conformance`, `§3 Test honesty`, `§4 Cross-repo`; SCOPE-equivalent: this reviewer has no SCOPE block — its out-of-plan files are FLAGs in §1; its TESTS lines go in §3's checkpoint; `{SKIPS}` = §2 and §4 at `light`. **Extra §3 rule** (add one sentence after Block R's Checkpoints paragraph in this file only): `` `npm test` and `npm run smoke` each get their own checkpoint, written as soon as that command finishes: `## §3a npm test — pass` / `## §3a npm test — red: <failing test names>`, and `## §3b npm run smoke — pass` / `… — red: <summary>`. The `## §3 Test honesty — complete` checkpoint follows, carrying the FLAG lines and TESTS lines. On resume a recorded §3a/§3b is not re-run. A red is reported in the final output exactly as it is today — which means the `## §3 Test honesty — complete` checkpoint must copy a FLAG line for any red §3a/§3b (same FLAG form and category the reviewer used for a red before this change; no new category), and §3 is not marked complete without it, because the final output is built from FLAG lines only. ``
- `## Bash is for reading only`. Old: `**Never** edit, stage, commit, push, or write any file.` New: `**Never** edit, stage, commit, push, or write any file other than your own review log (written with \`Write\`, never through Bash).` Add `` `date -u` `` to the list `Use Bash for \`git show\`, … \`npm run smoke\`.` Everything else in that section stays verbatim, including: never run `bin/update.mjs`, `bin/enrich.mjs`, `bin/import-snapshot.mjs`, any `scripts/update-*.mjs` or `scripts/migrate-*.mjs`, or any command that fetches, writes a data file, or touches `manifest.json` (including with `--dry-run`).
- `## Output`: `Do not edit any file.` → `Do not edit any file except your own review log.` Add first sentence: `Build the output from your review log (see Review log).`

### 5. `.gitignore` (both repos)

Append at the end of each file (leave a blank line first):

```
# Reviewer run logs (checkpoint/resume) — local only
.claude/reviews/
```

### 6. `../CLAUDE.md` (parent folder, no git)

Under `### Reviews and fixes`:
- Replace `The two reviewers are read-only and **advisory**` → `The two reviewers are read-only except for their own review log, and **advisory**` (rest of that sentence unchanged).
- Add one new line as its own paragraph immediately after the `Three subagents. …` paragraph, before the bullet list: `If a review is interrupted, re-invoke the same reviewer with \`resume\`; its log is in \`.claude/reviews/\`. (Repo-scoped sessions only: the parent-folder wrapper reviewers do not log yet.)`
No other edit to this file.

## Tests

**None.** Prompt/config-only change; there is no executable behaviour to assert and nothing in either repo's suite reads agent prompts or `.gitignore`. Each repo's done-definition (`npm test` / `npm run smoke`) is still run to confirm nothing regressed (app: `npm test`, `npm run lint`, `npm run build`; data: `npm run smoke`, `npm test`), results in the hand-back.

## Manual verification (Session 2 runs this and reports it in the hand-back)

Edits must exist first; subagent files are read at invocation, so a freshly edited reviewer is available to the next invocation.

1. In `sleeper-dashboard`, pick any recent commit range `A..B` and a task file it implemented. Invoke **implementation-reviewer** (app) on it with `light` depth. Let it run until `## §1 … — complete` appears in `.claude/reviews/<stem>.implementation-reviewer.md`, then interrupt it (Esc).
2. Confirm the log has the header (task file, range, depth, `started:`) and a complete §1 checkpoint (flags or `no flags`).
3. Re-invoke with `resume`, same task file and range. Confirm: §1 is not re-read or re-judged (no new §1 checkpoint; §1 section text unchanged in the log), the log ends in `## DONE`, and §2/§3 (and §4 skipped at light) are present.
4. Run the same range once cleanly without `resume` (log overwritten); diff the two final outputs — they must match, byte for byte, in the FLAGS/SCOPE blocks.
5. Confirm `git status` in `sleeper-dashboard` shows no `.claude/reviews/` file (ignored) and no other file touched by the reviewer.
6. Confirm the `.gitignore` line works: `git check-ignore -v .claude/reviews/<stem>.implementation-reviewer.md` in both repos.
7. Report one line saying whether `Write` created `.claude/reviews/` itself on the first run (if not, stop and report — the plan then needs a mkdir path).

Steps 1–7 cover the app implementation-reviewer only; the three other prompts share Block R but are not exercised end-to-end here (accepted).

## Hand-back must contain

- Commit SHA per repo (app, data) and the repo-by-repo list of files touched; for `../CLAUDE.md`, the file diff.
- Every deviation from this task file (a no-op `{ }` fragment resolved differently, text that did not match, etc.).
- Tests: "none — prompt/config only", plus the repo done-definition results.
- Manual-verification outcome, steps 1–7.

## Open items (not in this slice; for Anton)

1. **Parent-folder wrapper agents** (`.claude/agents/plan-reviewer.md`, `implementation-reviewer.md`) delegate to each repo's reviewer instructions but have `tools: Read, Grep, Glob, Bash` — no `Write`. They will not write a log until given `Write` and the same rule; out of scope as briefed. Say if you want a follow-up slice.
2. `../CLAUDE.md` still says of fix-applier "The only agent in this loop that writes" and "the applier is the only writer". With reviewer logs that is no longer strictly true (the claim is about source). Not edited here; wording tweak is Anton's call.
3. App plan-reviewer cannot record a start time (no Bash by instruction) — header says `not recorded (no clock tool)`.
4. The `NOTE:` first line on a resume/log mismatch is the one deliberate exception to byte-for-byte output.
5. **Follow-up slice:** give parent-folder wrapper reviewers (`../.claude/agents/plan-reviewer.md`, `implementation-reviewer.md`) the Write tool and checkpoint-log rules; remove the "Repo-scoped sessions only" sentence and update the fix-applier "only agent that writes" line in `../CLAUDE.md`; run a real interrupt/resume on the actual reviewer.

## Fix pass 1

Source: implementation-reviewer on bc1c99c (app) and e7e804b (data), light depth — two cosmetic `fidelity` flags, same slip in two files. Commit each repo separately.

- `sleeper-dashboard/.claude/agents/plan-reviewer.md` and `sleeper-dashboard-data/.claude/agents/plan-reviewer.md`, `## Review log` → "Invocation with `resume`" bullet: the text reads `If its header's task file match this invocation`. Change `match` → `matches` (the `{ and diff range}` fragment was correctly dropped for plan-reviewers, leaving a singular subject). Verify the same bullet in both implementation-reviewer files still reads `task file and diff range match` — leave those unchanged.
- Leave everything else alone: no other wording, no other file, no push, nothing under `.claude/reviews/`.
- Done when: `grep -n "task file match this" ` returns nothing in either file, and each repo has one new commit touching only that file. Re-review: none needed (one-word grammar fix; a `git diff` showing only that word is the check).

## Verification

Session 1 verification, 2026-11-17. Reads the diffs, not the hand-back.

- Commits (unpushed): app `bc1c99c` + fix `1dd9198`; data `e7e804b` + fix `19b6a5e`. `../CLAUDE.md` (no git) edited per spec; compared by implementation-reviewer against edit 6.
- Review: depth light; rounds 1; flags 2 (both `fidelity`, cosmetic: "task file match" → "matches" in the plan-reviewer resume bullet, app and data) — both fixed in Fix pass 1. SCOPE: none. No cross-repo flags.
- Fix-pass re-review: none needed (one-word change; each fix commit's diff is that one word, shown by the fix-applier and confirmed via `git show --stat`).
- Checks (Session 2's report, not re-run here): app `npm test` 3504 passed · lint clean · build clean; data `npm run smoke` exit 0 · `npm test` 2150 pass, 1 skipped, 0 fail.
- Tests new/changed: none — prompt/config only.
- Deviations (Session 2, accepted): brace fragments resolved per file (SCOPE lines for app implementation-reviewer, TESTS for data); app plan-reviewer header writes `started: not recorded (no clock tool)` directly; data plan-reviewer skip clause worded "no section is skipped by depth in this reviewer".
- Manual verification: **partial, by stand-in.** Session 2 started in the parent folder, where `implementation-reviewer` resolves to the parent wrapper (no `Write`), so the real app agent was never run. A general-purpose agent following the app prompt wrote the log; the log was hand-truncated to header + §1 (the run finished in ~19 s, too fast to interrupt); a `resume` run skipped §1 without re-judging it, ran §2/§3, skipped §4 at light, ended `## DONE`. `.claude/reviews/` was created by `Write` (no mkdir needed); `.gitignore` line verified with `git check-ignore` in both repos. Not covered: a real interrupt, a byte-for-byte clean-vs-resumed diff, the real `implementation-reviewer` with `Write`, and the other three prompts. Close this from a repo-scoped session on the next real review (re-invoke with `resume` after an interrupt).

Signed off by Anton 2026-11-17
