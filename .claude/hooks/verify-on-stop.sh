#!/usr/bin/env bash
# Stop-hook gate: don't let the turn end while the done-definition is red.
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

output=$(npm test 2>&1 && npm run build 2>&1)
status=$?
if [ "$status" -ne 0 ]; then
  {
    echo "Done-definition failed (npm test / npm run build) — fix before finishing:"
    printf '%s\n' "$output" | tail -n 40
  } >&2
  exit 2   # exit 2 blocks the stop and feeds this back; exit 1 would be IGNORED
fi
exit 0