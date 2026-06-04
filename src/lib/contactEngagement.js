// Pip Tier B — derive contact engagement from meeting attendees.
// Returns a map of contactName → { lastSeenAt, daysSince, meetingCount }.

export function computeContactEngagement(contacts, meetings) {
  // map keyed by canonical contact name (original case preserved)
  var map = {};
  var now = Date.now();

  // Build a lowercase → canonicalName reverse-lookup for case-insensitive matching.
  // Also supports nickname (if present) as an alternate match key.
  var lowerToName = {};

  (contacts || []).forEach(function (c) {
    if (!c.name) return;
    map[c.name] = { lastSeenAt: null, daysSince: null, meetingCount: 0 };
    lowerToName[c.name.toLowerCase().trim()] = c.name;
    if (c.nickname) {
      var nickLower = c.nickname.toLowerCase().trim();
      if (nickLower && !lowerToName[nickLower]) {
        lowerToName[nickLower] = c.name;
      }
    }
  });

  (meetings || []).forEach(function (m) {
    if (!m.attendees || !Array.isArray(m.attendees)) return;
    var meetingDate = m.date || m.meeting_date || m.created_at;
    if (!meetingDate) return;
    var t = new Date(meetingDate).getTime();
    m.attendees.forEach(function (attendee) {
      var aLower = (attendee || "").toLowerCase().trim();
      var canonicalName = lowerToName[aLower];
      if (!canonicalName || !map[canonicalName]) return;
      map[canonicalName].meetingCount++;
      if (!map[canonicalName].lastSeenAt || t > new Date(map[canonicalName].lastSeenAt).getTime()) {
        map[canonicalName].lastSeenAt = meetingDate;
      }
    });
  });

  Object.keys(map).forEach(function (name) {
    if (map[name].lastSeenAt) {
      map[name].daysSince = Math.floor((now - new Date(map[name].lastSeenAt).getTime()) / 86400000);
    }
  });

  return map;
}
