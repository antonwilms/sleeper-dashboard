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
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

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