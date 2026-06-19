#!/usr/bin/env bash
# Stop hook — keep the shared brain (CLAUDE.md) current.
# If this session changed CODE on a feature branch but did NOT touch CLAUDE.md,
# block the stop and tell Claude to write/refresh a Session Handoff first.
# Fail-safe by design: any error or ambiguity -> exit 0 (allow stop). Never trap a session.
set -uo pipefail

allow() { exit 0; }                                   # exit 0 = let the session stop
block() { printf '{"decision":"block","reason":"%s"}\n' "$1"; exit 0; }

command -v git >/dev/null 2>&1 || allow
root="$(git rev-parse --show-toplevel 2>/dev/null)" || allow
[ -z "$root" ] && allow
cd "$root" 2>/dev/null || allow

branch="$(git branch --show-current 2>/dev/null)" || allow
[ -z "$branch" ] && allow            # detached HEAD — don't enforce
[ "$branch" = "main" ] && allow      # main itself is exempt

# Everything that changed this session: commits ahead of origin/main + staged + unstaged + untracked
changed="$(
  {
    git diff --name-only origin/main...HEAD 2>/dev/null
    git diff --name-only HEAD 2>/dev/null
    git diff --name-only --cached 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | sort -u
)"

[ -z "$changed" ] && allow                                   # nothing changed
printf '%s\n' "$changed" | grep -qx "CLAUDE.md" && allow     # already documented

# Code changed without a CLAUDE.md update -> nudge (block the stop)
if printf '%s\n' "$changed" | grep -qE '^(src/|api/|supabase/|scripts/)'; then
  block "You changed code this session but did not update CLAUDE.md. Add or refresh a Session Handoff entry (what shipped / which branch / current state) before ending — it keeps the shared brain current so the next chat picks up cleanly. If this change genuinely needs no handoff, say so and stop again."
fi

allow
