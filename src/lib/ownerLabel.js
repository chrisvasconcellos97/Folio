// Owner-display helpers used by the account header, list cards, and modals.
// Member shape: { user_id, invited_email, role } from folio_org_members.

export function ownerLabel(member) {
  if (!member) return "Unowned";
  return member.invited_email || "Team member";
}

export function ownerInitials(member) {
  if (!member) return "—";
  var src = member.invited_email || "";
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
