// Owner-display helpers used by the account header, list cards, and modals.
// Member shape: { user_id, invited_email, full_name, role } from folio_org_members.
// full_name is patched in by useOrg from Supabase Auth user metadata when available.

export function ownerLabel(member) {
  if (!member) return "Unowned";
  return member.full_name || (member.invited_email || "").split("@")[0] || "Team member";
}

export function ownerInitials(member) {
  if (!member) return "—";
  if (member.full_name) {
    var words = member.full_name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return "??";
  }
  var src = (member.invited_email || "");
  var local = src.split("@")[0] || "";
  if (!local) return "??";
  var parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function findOwner(members, ownerUserId) {
  if (!members || !ownerUserId) return null;
  return members.find(function (m) { return m.user_id === ownerUserId; }) || null;
}

// Resolve an assignee stored as an email-or-name string to a display name by
// matching it against org members. One shared copy (was duplicated verbatim in
// FlatTaskQueue + StandingBoardView — App Coherence Rule). Returns the raw
// string unchanged when no member matches (handles free-text + contact names).
export function resolveAssignee(emailOrName, members) {
  if (!emailOrName) return null;
  var m = (members || []).find(function (x) {
    return (x.invited_email || x.email || "") === emailOrName;
  });
  if (m) return m.full_name || m.display_name || emailOrName;
  return emailOrName;
}
