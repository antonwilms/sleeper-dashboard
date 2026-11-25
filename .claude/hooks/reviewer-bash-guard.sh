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
