#!/bin/bash
# Blocks any git push to main — Claude must commit work and tell Chris it's
# ready. Chris approves the push manually. This prevents mid-batch or
# unreviewed deploys from reaching Vercel.

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

command=$(echo "$input" | jq -r '.tool_input.command // empty')

if echo "$command" | grep -qE 'git push.*(origin main|HEAD:main|origin HEAD:main|: main)'; then
  echo "🚫 Push to main is blocked. Finish building the complete batch, commit everything, then tell Chris it's ready to deploy. Chris approves all pushes to main." >&2
  exit 2
fi

exit 0
