// True when a meeting title is a system-generated placeholder — a date-stamped
// or method-prefixed default like "Email — May 29" or "ACME — 2026-05-29" —
// rather than something the user or Pip deliberately wrote. Used to decide
// when it's safe to replace the title with a Pip-suggested short summary.
export function isDefaultMeetingTitle(title) {
  if (!title) return true;
  return /—\s*\w+\s+\d+$/.test(title)          // "— May 29"
      || /—\s*\d{4}-\d{2}-\d{2}$/.test(title)  // "— 2026-05-29"
      || /^(Email|Phone|In Person|Video|Conversation) — /.test(title); // method prefix
}
