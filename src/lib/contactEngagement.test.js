import { describe, it, expect } from "vitest";
import { computeContactEngagement } from "./contactEngagement";

describe("computeContactEngagement", function () {
  var contacts = [
    { name: "Michael Smith" },
    { name: "Sarah Chen", nickname: "Sar" },
    { name: "Bob Jones" },
  ];

  it("matches a first-name-only attendee to the full-name contact (unambiguous)", function () {
    var meetings = [{ meeting_date: "2026-06-01", attendees: ["Michael"] }];
    var e = computeContactEngagement(contacts, meetings);
    expect(e["Michael Smith"].meetingCount).toBe(1);
  });

  it("matches case-insensitively and via nickname", function () {
    var meetings = [{ meeting_date: "2026-06-01", attendees: ["sar", "BOB JONES"] }];
    var e = computeContactEngagement(contacts, meetings);
    expect(e["Sarah Chen"].meetingCount).toBe(1);
    expect(e["Bob Jones"].meetingCount).toBe(1);
  });

  it("matches a longer attendee string that contains the contact name", function () {
    var meetings = [{ meeting_date: "2026-06-01", attendees: ["Michael Smith (IT)"] }];
    var e = computeContactEngagement(contacts, meetings);
    expect(e["Michael Smith"].meetingCount).toBe(1);
  });

  it("does not double-count one contact when two attendee strings resolve to them", function () {
    var meetings = [{ meeting_date: "2026-06-01", attendees: ["Michael", "Michael Smith"] }];
    var e = computeContactEngagement(contacts, meetings);
    expect(e["Michael Smith"].meetingCount).toBe(1);
  });

  it("does NOT first-name-match when ambiguous (two contacts share a first name)", function () {
    var ambiguous = [{ name: "Mike Adams" }, { name: "Mike Brown" }];
    var meetings = [{ meeting_date: "2026-06-01", attendees: ["Mike"] }];
    var e = computeContactEngagement(ambiguous, meetings);
    expect(e["Mike Adams"].meetingCount).toBe(0);
    expect(e["Mike Brown"].meetingCount).toBe(0);
  });
});
