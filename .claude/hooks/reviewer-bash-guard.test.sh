#!/usr/bin/env bash
# Hook tests: one ok/FAIL line per case; optional $1 = guard script under test.
DIR="$(cd "$(dirname "$0")" && pwd)"; H="${1:-$DIR/reviewer-bash-guard.sh}"; AGENT="$DIR/../agents/plan-reviewer.md"
ROOT="$(cd "$DIR/../.." && pwd)"; fail=0; W=$(mktemp -d)
ok(){ echo "ok   $1"; }
ko(){ echo "FAIL $1"; fail=1; }
payload(){ jq -n --arg c "$1" '{tool_input:{command:$c}}'; }
eq(){ if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 (got $2 want $3)"; fi; }
chk(){ payload "$2" | "$H" 2>/dev/null; eq "$1" $? "$3"; }

chk "allowed: short name" 'wc -c .claude/tasks/x.md' 0
chk "allowed: hyphenated name" 'wc -c .claude/tasks/myteam-m3-visuals.md' 0
chk "semicolon chain" 'wc -c .claude/tasks/x.md; rm -rf .' 2
chk "and chain" 'wc -c .claude/tasks/x.md && rm -rf .' 2
chk "or chain" 'wc -c .claude/tasks/x.md || rm -rf .' 2
chk "pipe" 'wc -c .claude/tasks/x.md | sh' 2
chk "output redirect" 'wc -c .claude/tasks/x.md > out' 2
chk "input redirect" 'wc -c .claude/tasks/x.md < in' 2
chk "dollar substitution" 'wc -c .claude/tasks/$(id).md' 2
chk "backtick substitution" 'wc -c .claude/tasks/`id`.md' 2
chk "newline chain" $'wc -c .claude/tasks/x.md\nrm -rf .' 2
chk "extra argument" 'wc -c .claude/tasks/x.md /etc/passwd' 2
chk "relative escape" 'wc -c ../../secrets' 2
chk "absolute path" 'wc -c /etc/passwd' 2
chk "traversal from tasks" 'wc -c .claude/tasks/../../secrets' 2
chk "traversal to sibling md" 'wc -c .claude/tasks/../settings.md' 2
chk "cat" 'cat .claude/tasks/x.md' 2
chk "wc -l" 'wc -l .claude/tasks/x.md' 2
chk "date" 'date -u +%Y-%m-%dT%H:%MZ' 2
chk "empty command" '' 2
echo 'not json' | "$H" 2>/dev/null; eq "non-JSON stdin" $? 2
mkdir -p "$W/nojq"; for b in bash env cat; do ln -sf "$(command -v $b)" "$W/nojq/$b"; done
payload 'wc -c .claude/tasks/x.md' | PATH="$W/nojq" /bin/bash "$H" 2>/dev/null; eq "no-jq fails closed" $? 2

# Wiring: the real agent file must register the guard.
if grep -q '^tools:.*Bash' "$AGENT"; then ok "tools line has Bash"; else ko "tools line has Bash"; fi
want=$(cat <<'YAML'
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/reviewer-bash-guard.sh || exit 2'
YAML
)
front=$(awk '/^---$/{n++; next} n==1' "$AGENT")
if [[ $'\n'"$front"$'\n' == *$'\n'"$want"$'\n'* ]]; then ok "frontmatter hook block exact"; else ko "frontmatter hook block exact"; fi
hook=$(sed -n "s/^ *command: '\(.*\)'\$/\1/p" "$AGENT")
if [ -n "$hook" ] && [ "$(printf '%s\n' "$hook" | wc -l | tr -d ' ')" = 1 ]; then
  ok "exactly one hook command"
  payload 'wc -c .claude/tasks/x.md' | CLAUDE_PROJECT_DIR="$ROOT" bash -c "$hook" 2>/dev/null; eq "wired: allowed passes" $? 0
  payload 'cat .claude/tasks/x.md' | CLAUDE_PROJECT_DIR="$ROOT" bash -c "$hook" 2>/dev/null; eq "wired: cat blocked" $? 2
  mkdir -p "$W/empty"
  payload 'wc -c .claude/tasks/x.md' | CLAUDE_PROJECT_DIR="$W/empty" bash -c "$hook" 2>/dev/null; eq "wired: missing script blocks" $? 2
else
  ko "exactly one hook command"
fi
rm -rf "$W"
exit $fail
