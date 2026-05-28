import { describe, it, expect } from "vitest";
import {
  buildAccountExport,
  exportFilename,
  slugifyForFilename,
  FOLIO_EXPORT_VERSION,
} from "./accountExport";

var FIXTURE_ACCOUNT = {
  id: "acc-1",
  name: "Acme Auto Group",
  tier: "Major",
  status: "green",
  revenue_amount: 1250000,
};

var FIXTURE_MEETINGS = [
  { id: "m-1", account_id: "acc-1", meeting_date: "2026-05-10", notes: "Q2 review" },
  { id: "m-2", account_id: "acc-1", meeting_date: "2026-04-15", notes: "kickoff" },
];

var FIXTURE_ITEMS    = [{ id: "i-1", account_id: "acc-1", text: "Send pricing", done: false }];
var FIXTURE_CONTACTS = [{ id: "c-1", account_id: "acc-1", name: "Jane Doe", email: "jane@acme.com" }];
var FIXTURE_CADENCES = [{ id: "cd-1", account_id: "acc-1", frequency: "monthly", day_of_month: 15 }];
var FIXTURE_PROJECTS = [{ id: "p-1", account_id: "acc-1", title: "Repair lane refresh", status: "in_progress" }];
var FIXTURE_NOTES    = { account_id: "acc-1", user_id: "u-1", notes: "loyal customer, prefers Wed calls" };

describe("buildAccountExport", function () {
  it("packages every entity into the canonical shape", function () {
    var payload = buildAccountExport({
      account:  FIXTURE_ACCOUNT,
      meetings: FIXTURE_MEETINGS,
      items:    FIXTURE_ITEMS,
      contacts: FIXTURE_CONTACTS,
      cadences: FIXTURE_CADENCES,
      projects: FIXTURE_PROJECTS,
      notes:    FIXTURE_NOTES,
      exportedAt: "2026-05-28T00:00:00.000Z",
    });

    expect(payload).toEqual({
      folio_export_version: 1,
      exported_at: "2026-05-28T00:00:00.000Z",
      app: "Folios",
      account:  FIXTURE_ACCOUNT,
      meetings: FIXTURE_MEETINGS,
      items:    FIXTURE_ITEMS,
      contacts: FIXTURE_CONTACTS,
      cadences: FIXTURE_CADENCES,
      projects: FIXTURE_PROJECTS,
      notes:    FIXTURE_NOTES,
      counts: {
        meetings: 2,
        items:    1,
        contacts: 1,
        cadences: 1,
        projects: 1,
      },
    });
  });

  it("defaults missing collections to empty arrays", function () {
    var payload = buildAccountExport({ account: FIXTURE_ACCOUNT });
    expect(payload.meetings).toEqual([]);
    expect(payload.items).toEqual([]);
    expect(payload.contacts).toEqual([]);
    expect(payload.cadences).toEqual([]);
    expect(payload.projects).toEqual([]);
    expect(payload.notes).toBeNull();
    expect(payload.counts).toEqual({ meetings: 0, items: 0, contacts: 0, cadences: 0, projects: 0 });
  });

  it("tolerates a null account", function () {
    var payload = buildAccountExport({ account: null });
    expect(payload.account).toBeNull();
    expect(payload.folio_export_version).toBe(FOLIO_EXPORT_VERSION);
  });

  it("ignores non-array inputs by falling back to []", function () {
    var payload = buildAccountExport({
      account:  FIXTURE_ACCOUNT,
      meetings: null,
      items:    undefined,
      contacts: "not an array",
    });
    expect(payload.meetings).toEqual([]);
    expect(payload.items).toEqual([]);
    expect(payload.contacts).toEqual([]);
  });

  it("stamps an exported_at when omitted", function () {
    var payload = buildAccountExport({ account: FIXTURE_ACCOUNT });
    expect(typeof payload.exported_at).toBe("string");
    expect(payload.exported_at.length).toBeGreaterThan(10);
  });
});

describe("slugifyForFilename", function () {
  it("lowercases and replaces non-alphanumerics with dashes", function () {
    expect(slugifyForFilename("Acme Auto Group, Inc.")).toBe("acme-auto-group-inc");
  });
  it("returns 'account' for empty input", function () {
    expect(slugifyForFilename("")).toBe("account");
    expect(slugifyForFilename(null)).toBe("account");
  });
  it("strips leading and trailing dashes", function () {
    expect(slugifyForFilename("!!Acme!!")).toBe("acme");
  });
});

describe("exportFilename", function () {
  it("uses account name + ISO date stamp", function () {
    var name = exportFilename(FIXTURE_ACCOUNT, new Date("2026-05-28T12:00:00Z"));
    expect(name).toMatch(/^folios-acme-auto-group-\d{4}-\d{2}-\d{2}\.json$/);
  });
  it("falls back to 'account' when name is missing", function () {
    var name = exportFilename({}, new Date("2026-01-02T00:00:00Z"));
    expect(name).toBe("folios-account-2026-01-02.json");
  });
});
