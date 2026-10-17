#!/usr/bin/env bash
# Stop-hook gate: don't let the turn end while the done-definition is red.
# Skip rule: a fingerprint (tree hash) of the full working state is stamped in
# .git/verify-on-stop.ok after a green run; an unchanged state is not re-verified.
set -uo pipefail
input=$(cat)

# Loop guard — REQUIRED. If Claude is already continuing from a prior Stop block, let it stop.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only gate when there's actual work to verify (skips Q&A / planning turns with no changes).
# A session that committed its own work is still dirty relative to origin/main even with a
# clean working tree, so check both — skip only when neither shows unverified work.
if [ -z "$(git status --porcelain 2>/dev/null)" ] && [ -z "$(git log origin/main..HEAD 2>/dev/null)" ]; then
  exit 0
fi

# Fingerprint of the full working state (tracked edits, staged, untracked non-ignored),
# computed against a temp copy of the index so the real index is never touched.
# Empty fingerprint → never skip, fall through to the checks.
gitdir=$(git rev-parse --git-dir 2>/dev/null)
stamp="$gitdir/verify-on-stop.ok"
tmp=$(mktemp)
cp "$gitdir/index" "$tmp" 2>/dev/null
fp=$(GIT_INDEX_FILE="$tmp" git add -A >/dev/null 2>&1 && GIT_INDEX_FILE="$tmp" git write-tree 2>/dev/null)
rm -f "$tmp"

if [ -n "$fp" ] && [ -f "$stamp" ] && [ "$(cat "$stamp" 2>/dev/null)" = "$fp" ]; then
  exit 0
fi

output=$(npm test 2>&1 && npm run build 2>&1)
status=$?
if [ "$status" -ne 0 ]; then
  rm -f "$stamp"
  {
    echo "Done-definition failed (npm test / npm run build) — fix before finishing:"
    printf '%s\n' "$output" | tail -n 40
  } >&2
  exit 2   # exit 2 blocks the stop and feeds this back; exit 1 would be IGNORED
fi
[ -n "$fp" ] && printf '%s' "$fp" > "$stamp"
exit 0
