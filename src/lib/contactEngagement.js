// Pip Tier B — derive contact engagement from meeting attendees.
// Returns a map of contactName → { lastSeenAt, daysSince, meetingCount }.
//
// Attendees are free-text and logged informally ("Mike", "mike s.", "Michael
// Smith"), so exact-string matching badly under-reports engagement. We resolve
// an attendee to a contact via: exact (case-insensitive, incl. nickname) →
// substring containment either direction → unambiguous first-name match.

// Resolve one attendee string to a canonical contact name, or null.
export function resolveAttendeeToContact(attendee, index) {
  var a = (attendee || "").toLowerCase().trim();
  if (!a) return null;
  if (index.exact[a]) return index.exact[a];
  var multiWord = a.indexOf(" ") !== -1;
  for (var i = 0; i < index.list.length; i++) {
    var c = index.list[i];
    // Attendee is the MORE specific string and contains a full contact name
    // ("Michael Smith (IT)" ⊃ "michael smith") — always safe.
    if (a.indexOf(c.lower) !== -1) return c.name;
    // Contact name contains the attendee fragment — only trust this for a
    // multi-word fragment ("michael s" ⊂ "michael smith"); a bare single token
    // like "mike" must go through the unambiguous first-name path below so it
    // doesn't greedily match "Mike Adams" over "Mike Brown".
    if (multiWord && c.lower.indexOf(a) !== -1) return c.name;
  }
  // Unambiguous first-name match (only when exactly one contact has that first name).
  var aFirst = a.split(/\s+/)[0];
  if (aFirst.length >= 3 && index.firstNameCounts[aFirst] === 1) {
    return index.firstNameOwner[aFirst];
  }
  return null;
}

export function buildContactIndex(contacts) {
  var index = { exact: {}, list: [], firstNameCounts: {}, firstNameOwner: {} };
  (contacts || []).forEach(function (c) {
    if (!c || !c.name) return;
    var lower = c.name.toLowerCase().trim();
    index.exact[lower] = c.name;
    if (c.nickname) {
      var nick = c.nickname.toLowerCase().trim();
      if (nick && !index.exact[nick]) index.exact[nick] = c.name;
    }
    index.list.push({ name: c.name, lower: lower });
    var first = lower.split(/\s+/)[0];
    if (first) {
      index.firstNameCounts[first] = (index.firstNameCounts[first] || 0) + 1;
      index.firstNameOwner[first] = c.name;
    }
  });
  return index;
}

export function computeContactEngagement(contacts, meetings) {
  // map keyed by canonical contact name (original case preserved)
  var map = {};
  var now = Date.now();

  (contacts || []).forEach(function (c) {
    if (!c || !c.name) return;
    map[c.name] = { lastSeenAt: null, daysSince: null, meetingCount: 0 };
  });

  var index = buildContactIndex(contacts);

  (meetings || []).forEach(function (m) {
    if (!m.attendees || !Array.isArray(m.attendees)) return;
    var meetingDate = m.date || m.meeting_date || m.created_at;
    if (!meetingDate) return;
    var t = new Date(meetingDate).getTime();
    var seenThisMeeting = {};
    m.attendees.forEach(function (attendee) {
      var canonicalName = resolveAttendeeToContact(attendee, index);
      if (!canonicalName || !map[canonicalName]) return;
      // Don't double-count one contact if two attendee strings resolve to them.
      if (seenThisMeeting[canonicalName]) return;
      seenThisMeeting[canonicalName] = true;
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
