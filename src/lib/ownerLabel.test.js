import { describe, it, expect } from "vitest";
import { ownerLabel, ownerInitials, findOwner } from "./ownerLabel";

describe("ownerLabel", function () {
  it("returns 'Unowned' when member is null/undefined", function () {
    expect(ownerLabel(null)).toBe("Unowned");
    expect(ownerLabel(undefined)).toBe("Unowned");
  });
  it("returns the email local-part when only invited_email is present", function () {
    // Per the display-name rule, ownerLabel prefers full_name, then the email
    // local-part (not the full address), then "Team member".
    expect(ownerLabel({ invited_email: "chris@example.com" })).toBe("chris");
  });
  it("prefers full_name over the email local-part", function () {
    expect(ownerLabel({ full_name: "Chris V", invited_email: "chris@example.com" })).toBe("Chris V");
  });
  it("falls back to 'Team member' when no email", function () {
    expect(ownerLabel({ user_id: "uid-1" })).toBe("Team member");
  });
});

describe("ownerInitials", function () {
  it("returns '—' for null member", function () {
    expect(ownerInitials(null)).toBe("—");
  });
  it("returns '??' when there is no email local part", function () {
    expect(ownerInitials({ invited_email: "" })).toBe("??");
  });
  it("derives initials from dotted email local-parts (first.last → FL)", function () {
    expect(ownerInitials({ invited_email: "chris.vasconcellos@example.com" })).toBe("CV");
  });
  it("derives initials from hyphenated local-parts", function () {
    expect(ownerInitials({ invited_email: "jean-paul@example.com" })).toBe("JP");
  });
  it("derives initials from underscored local-parts", function () {
    expect(ownerInitials({ invited_email: "ann_marie@example.com" })).toBe("AM");
  });
  it("falls back to first two chars (uppercased) when no separator", function () {
    expect(ownerInitials({ invited_email: "chris@example.com" })).toBe("CH");
  });
});

describe("findOwner", function () {
  it("returns null when members is empty", function () {
    expect(findOwner([], "uid-1")).toBeNull();
  });
  it("returns null when ownerUserId is missing", function () {
    expect(findOwner([{ user_id: "uid-1" }], null)).toBeNull();
  });
  it("finds the matching member by user_id", function () {
    var members = [{ user_id: "a" }, { user_id: "b", invited_email: "b@x" }];
    expect(findOwner(members, "b").invited_email).toBe("b@x");
  });
  it("returns null when no member matches", function () {
    expect(findOwner([{ user_id: "a" }], "missing")).toBeNull();
  });
});
