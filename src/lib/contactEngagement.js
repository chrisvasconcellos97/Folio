// Pip Tier B — derive contact engagement from meeting attendees.
// Returns a map of contactName → { lastSeenAt, daysSince, meetingCount }.

export function computeContactEngagement(contacts, meetings) {
  var map = {};
  var now = Date.now();

  (contacts || []).forEach(function (c) {
    map[c.name] = { lastSeenAt: null, daysSince: null, meetingCount: 0 };
  });

  (meetings || []).forEach(function (m) {
    if (!m.attendees || !Array.isArray(m.attendees)) return;
    var meetingDate = m.date || m.meeting_date || m.created_at;
    if (!meetingDate) return;
    var t = new Date(meetingDate).getTime();
    m.attendees.forEach(function (name) {
      if (!map[name]) return;
      map[name].meetingCount++;
      if (!map[name].lastSeenAt || t > new Date(map[name].lastSeenAt).getTime()) {
        map[name].lastSeenAt = meetingDate;
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
