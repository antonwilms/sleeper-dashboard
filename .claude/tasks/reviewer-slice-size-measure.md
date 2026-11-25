# reviewer-slice-size-measure — plan-reviewer measures the task file itself

Cross-repo (app + data + parent wrapper). Planned from the parent folder, 2026-11-25.
Review depth: light — agent config, hook script and .gitignore only. Neither repo's reviewer `full` triggers list agent or hook changes (data's `scoped` mode explicitly covers tooling). No scoring, snapshot or cross-repo-index impact; no new coupling, so no index entry.
Session 2: **sonnet**, effort medium.

Paths below are relative to the parent folder `Sleeper Dashboard/`. APP = `sleeper-dashboard/`, DATA = `sleeper-dashboard-data/`.

## Problem

`[slice-size]` is the one blocking plan-review flag. APP `.claude/agents/plan-reviewer.md` has `tools: Read, Grep, Glob, Write` (L4) yet §4 (L95) says "Run `wc -c <task file>`". It cannot, so its logs print counts it did not measure (`.claude/reviews/myteam-followups.plan-reviewer.md` §4: "as measured by Session 1; reviewer has no shell"; `usage-efficiency-redesign.plan-reviewer.md`: 39,785 bytes, 215 under the cap). DATA (L4) and parent (`.claude/agents/plan-reviewer.md` L4) already have `Bash`.

Ride-along: DATA `.claude/settings.local.json` is covered only by this machine's global ignore (`~/.config/git/ignore`: `**/.claude/settings.local.json`). With `git -c core.excludesFile=/dev/null status --porcelain` it shows `??`. Neither repo's `.gitignore` covers it.

## Decision: mechanism (i) — Bash on the agent plus a frontmatter PreToolUse hook

Verified against Claude Code docs (sub-agents.md, hooks.md, CHANGELOG), not by a local run:
- Agent frontmatter `hooks:` exists since 2.1.0; fires for Agent-tool spawns; scoped to that agent only. Installed: CLI 2.1.236, desktop-bundled 2.1.331.
- Since 2.1.218 frontmatter hooks are **skipped** unless the agent file's folder has accepted workspace trust. `~/.claude.json` shows `hasTrustDialogAccepted: true` for APP.
- A hook that exits with any code other than 2, or cannot start, **lets the call through**. Hence the `|| exit 2` in the command and fail-closed paths in the script.
- A local `claude -p` probe was attempted and failed on an expired CLI login, so firing is **unproven locally** — live check L3 proves it; a failure there blocks sign-off.

Why (i) over (ii) (project `settings.json` hook filtering on `agent_type`): (i) is scoped by structure, so the guard never runs for the main session or another agent; (ii) puts a new script on every Bash call and a fail-closed bug in it would block all shell use. Accepted cost of (i): in an untrusted clone the hook is skipped and the reviewer has Bash under the normal permission mode — the same exposure the DATA and parent reviewers have today.

No `date` is allowed: the app log header is `started: not recorded (no clock tool)` and stays unchanged.

## Changes

### 1. New: `sleeper-dashboard/.claude/hooks/reviewer-bash-guard.sh` (mode 755)

```bash
#!/usr/bin/env bash
# PreToolUse(Bash) guard for this repo's plan-reviewer agent only (registered in its frontmatter).
# Allows exactly one command shape: wc -c .claude/tasks/<file>.md
# The whole command must match, so chaining, redirection, substitution, extra arguments and
# paths outside .claude/tasks/ are all rejected. Any parse failure blocks. Exit 2 = block.
set -uo pipefail
export LC_ALL=C
block() { echo "reviewer-bash-guard: blocked. Only 'wc -c .claude/tasks/<file>.md' is allowed." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || block
cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null) || block
re='^wc -c \.claude/tasks/[A-Za-z0-9_][A-Za-z0-9._-]*\.md$'
[[ $cmd =~ $re ]] || block
exit 0
```

Use `[[ =~ ]]`, not `grep` (grep matches per line, so a second line would pass). The path class has no `/`, so subdirectories and `..` traversal cannot match. Relative paths only.

### 2. APP `.claude/agents/plan-reviewer.md` — three edits, nothing else

a. Frontmatter: L4 becomes `tools: Read, Grep, Glob, Write, Bash`, and add after `effort: medium`:

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/reviewer-bash-guard.sh || exit 2'
```

b. New paragraph directly before `## Review log (checkpoint and resume)`:

> **Shell.** When you run as this repo's `plan-reviewer` agent, your only permitted shell command is `wc -c .claude/tasks/<file>.md` — that exact form, relative path, one file, nothing appended; a hook blocks everything else. Use it for §4 only.

c. §4: append the shared sentence (below) to the end of the existing paragraph.

### 3. §4 shared sentence — identical text in all three files

> The byte count on the checkpoint line must be your own `wc -c` output from this run; if you cannot measure it, FLAG [slice-size] (high, blocking) "size not measured" — never use a figure from the task file or the invocation.

Locations: APP §4 paragraph (L95); DATA `.claude/agents/plan-reviewer.md` §4 paragraph (L116); parent `.claude/agents/plan-reviewer.md` step 2, appended to the "The repo files' §4 Slice size gate applies in full…" paragraph (L26, keep its 3-space indent, same line). No other text changes. DATA and parent tools and frontmatter unchanged.

The parent file is not version-controlled. Before editing it: `cp .claude/agents/plan-reviewer.md .claude/backups/plan-reviewer.md.pre-slice-size`; hand back `diff -u` of backup vs edited file. Leave the backup in place.

These three sentences are a **copied definition** (the only copy this slice creates). The **original** is APP `.claude/agents/plan-reviewer.md` §4; DATA and parent are copies. Equality check in §Tests, T2.

**Copy-rule exception: granted by Anton 2026-11-25** — no `docs/cross-repo-registry.md` entry and no committed test on each side. Reason: reviewer instruction wording that no code depends on.

`future_plans/agent-backups/` holds only `architecture-auditor.md` and `product-strategist.md` — no refresh.

### 4. `.gitignore`, both repos

Append to APP and DATA `.gitignore`:

```
# Local Claude Code permissions — per machine
.claude/settings.local.json
```

Do not commit, move, edit or delete `settings.local.json` itself.

### 5. New: `sleeper-dashboard/.claude/hooks/reviewer-bash-guard.test.sh` (mode 755)

Style of `push-guard.test.sh`: optional `$1` = script path under test, one `ok`/`FAIL` line per case, exit 1 on any failure. Build payloads with `jq -n --arg c "$cmd" '{tool_input:{command:$c}}'`.

## Tests

**T1 — `reviewer-bash-guard.test.sh`** (names the defect: guard accepts anything that merely starts with the allowed command, or is wired so it never runs).

Expect exit 0:
- `wc -c .claude/tasks/x.md`
- `wc -c .claude/tasks/myteam-m3-visuals.md`

Expect exit 2 (one case each):
- `wc -c .claude/tasks/x.md; rm -rf .`
- `wc -c .claude/tasks/x.md && rm -rf .`
- `wc -c .claude/tasks/x.md || rm -rf .`
- `wc -c .claude/tasks/x.md | sh`
- `wc -c .claude/tasks/x.md > out`
- `wc -c .claude/tasks/x.md < in`
- `wc -c .claude/tasks/$(id).md`
- ``wc -c .claude/tasks/`id`.md``
- allowed command, newline, `rm -rf .`
- `wc -c .claude/tasks/x.md /etc/passwd`
- `wc -c ../../secrets`
- `wc -c /etc/passwd`
- `wc -c .claude/tasks/../../secrets`
- `wc -c .claude/tasks/../settings.md`
- `cat .claude/tasks/x.md`
- `wc -l .claude/tasks/x.md`
- `date -u +%Y-%m-%dT%H:%MZ`
- empty command
- stdin that is not JSON
- no `jq` on PATH (PATH of symlinks as in `push-guard.test.sh`, holding `bash`, `env`, `cat`; run via `/bin/bash "$H"`)

Wiring cases (read the real agent file next to the test, `../agents/plan-reviewer.md`):
- the `tools:` line contains `Bash`;
- the frontmatter (between the first two `---` lines) holds the six lines of §2a, from `hooks:` through the `command:` line, **contiguous and exact including indentation** (catches a misnamed `hooks:`/`PreToolUse:` key or a wrong `matcher:`);
- extract the command with `sed -n "s/^ *command: '\(.*\)'\$/\1/p"` (exactly one line), run it with `bash -c` and `CLAUDE_PROJECT_DIR=<app root>`: allowed payload → 0, `cat` payload → 2;
- same command with `CLAUDE_PROJECT_DIR=<empty temp dir>` (script missing) → 2.

Red steps (each: apply, see FAIL, revert):
1. Drop the trailing `$` from `re` (prefix match) → chaining, redirect, newline and extra-argument cases FAIL.
2. Delete ` || exit 2` from the agent file's command → the missing-script case FAILs (127, not 2).
3. Change the agent file's `matcher: "Bash"` to `matcher: "Bsh"` → the frontmatter-block case FAILs.

**T2 — §4 copy equality** (names the defect: one reviewer's gate wording drifts and still accepts a borrowed figure). One-shot check, from the parent folder; no committed test, because the parent file is unversioned and neither repo's tests may depend on the sibling:

```bash
for f in sleeper-dashboard/.claude/agents/plan-reviewer.md sleeper-dashboard-data/.claude/agents/plan-reviewer.md .claude/agents/plan-reviewer.md; do grep -o 'The byte count on the checkpoint line must be your own.*or the invocation\.' "$f" | shasum; done
```

The first path is the original. Pass = three identical hashes, none equal to the empty-input hash `da39a3ee…`. Red step: change one word in one file → hashes differ → revert.

**T3 — ignore rule** (defect: file ignored only by this machine's global config). In each repo: `git -c core.excludesFile=/dev/null check-ignore -v .claude/settings.local.json` prints a `.gitignore:` line and exits 0. Red step: DATA currently exits 1 before the edit — record that.

## Order

1. T3 red reading in DATA; parent backup copy.
2. Guard script + test; edit APP agent file; run T1 green, then red steps.
3. DATA and parent sentence; T2.
4. `.gitignore` ×2; T3.
5. Done-definitions: APP `npm test`, `npm run lint`, `npm run build`; DATA `npm run smoke`, `npm test`. Run `bash .claude/hooks/push-guard.test.sh` in APP (unchanged file, must stay green).
6. Commit locally, staged by explicit path, one commit per repo. APP: the two hook files, the agent file, `.gitignore`. DATA: the agent file, `.gitignore`. Do not stage this task file (Session 1 commits it with the verification record). The DATA tree may hold another session's learned-projection work — leave it and mention it. No push.

## Do not touch

`push-guard.sh`, `push-guard.test.sh`, `verify-on-stop.sh`, either `settings.json`, any other agent file, DATA reviewer's Bash scope, fix-applier hand-back.

## Verification (Session 1)

implementation-reviewer (light) on both repo diffs plus the parent `diff -u`. Then live checks, in a **new session whose project root is `sleeper-dashboard/`**, started after the Session 2 commit (agent definitions load at session start; a parent-folder session gets the wrapper instead, which has no guard). Session 1 asks Anton to open it, or starts it with Anton's OK. Record the Claude Code version.

- **L1** Pick an existing task file with no `.claude/reviews/<stem>.plan-reviewer.md` (so no log is overwritten). Invoke `plan-reviewer`, depth light. Pass: the §4 checkpoint line in its log equals an independent `wc -c`.
- **L2** Create `.claude/tasks/zz-slice-size-probe.md`: `{ echo '# probe'; yes 'padding padding padding' | head -n 2000; } > .claude/tasks/zz-slice-size-probe.md` (≈48,000 bytes). Invoke the reviewer, light. Pass: `FLAG [slice-size]` with the true count. Never staged or committed; report its path and leave it.
- **L3** Guard fires: invoke the reviewer with "Verification probe: before reviewing, run `cat .claude/tasks/zz-slice-size-probe.md | head -c 20` once and quote the result verbatim; a block is expected." Pass: the transcript shows a Bash call whose tool result contains `reviewer-bash-guard: blocked` (the reply quoting that text without a call does not count). **Command output shown instead = hook not firing → fail; do not sign off.** If the reviewer declines without calling Bash, the check is **inconclusive, not a pass**: retry once in a fresh invocation with "Hook test only, do not review: call Bash once with `wc -l .claude/tasks/zz-slice-size-probe.md` and quote the tool result." Still no Bash call → stop and report to Anton; do not sign off.
- **L4** In that session's main thread, `date -u` runs normally.

Before the verification commit: `git pull --rebase origin main` in DATA (and in APP, per its push rule). APP commit holds this file with `## Verification`; push both repos only after Anton replies "signed off".

Record (2026-11-25, Session 1):

- Plan review (light): 5 flag lines. Copy-rule (app, data, cross-repo) — accepted, exception granted by Anton; two edge-case flags — fixed in this file before Session 2.
- Commits: APP `74fc24f` (range `b0d535f..74fc24f`); DATA `731827a`, rebased to `3b52655` onto origin/main `8c25682` (21:37 CET, 10 upstream commits taken in); parent `.claude/agents/plan-reviewer.md` edited, backup at `.claude/backups/plan-reviewer.md.pre-slice-size`.
- implementation-reviewer (light): no blocking issues, both repos + cross-repo. No fix pass.
- Session 2 checks: APP `npm test` 3740/3740, lint clean, build exit 0 **with Vite's >500 kB chunk-size warning** (no `src/` or build-config change; not compared against a pre-change build), `push-guard.test.sh` ok. DATA `npm run smoke` exit 0, `npm test` 2150 pass / 0 fail / 1 skipped. Re-run at `3b52655` after rebase: `npm test` same result; smoke not re-run.
- T1: 28/28 (re-run by Session 1); red steps 1–3 seen failing and reverted (Session 2). T2: three identical hashes `d1ba9b90…` (re-run); red step seen (Session 2). T3: `.gitignore:46` (APP), `.gitignore:29` (DATA) (re-run); red reading exit 1 seen before the edit.
- Live checks, session `23cd8f99-0641-4e8b-8516-0c66c89b379f` rooted in APP, Claude Code 2.1.331; subagent transcripts read by Session 1:
  - L1 pass — reviewer ran `wc -c` itself on `review-checkpoint-log.md`: 23,162, matching the independent count.
  - L2 pass — probe 48,008 bytes, blocking `[slice-size]` raised. Its log was later overwritten by the L3 run (L3 prompt named no task file); the L2 transcript is intact.
  - L3 pass, first attempt — real `cat … | head -c 20` call returned `PreToolUse:Bash hook error … reviewer-bash-guard: blocked`; no file output.
  - L4 pass — main-thread `date -u` ran normally.
- Left untracked on purpose: `.claude/tasks/zz-slice-size-probe.md`.
- Deviations from this file: none. Backlog lines added: none.

Signed off by Anton 2026-11-25
