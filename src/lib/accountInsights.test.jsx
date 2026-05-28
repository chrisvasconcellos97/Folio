import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPipInsight,
  buildInternalTeamInsight,
  buildPartnerInsight,
  buildCustomerInsight,
} from "./accountInsights.jsx";

// Helper — render the React node to a flat string so we can assert on copy.
function r(node) {
  return renderToStaticMarkup(node);
}

describe("buildInternalTeamInsight", function () {
  it("calls out overdue deliverables when any exist", function () {
    var account = { id: "a1", name: "Marketing", last_interaction_at: new Date().toISOString() };
    var items = [
      { done: false, due_date: "2020-01-01" },  // overdue
      { done: false, due_date: "2099-01-01" },  // future
    ];
    var html = r(buildInternalTeamInsight(account, items, [], {}));
    expect(html).toMatch(/overdue deliverable/);
  });
  it("falls back to 'Things are quiet' when there's no signal", function () {
    var account = {
      id: "a1", name: "Marketing",
      // Recent touch so daysSince < 21, no items
      last_interaction_at: new Date().toISOString(),
    };
    var html = r(buildInternalTeamInsight(account, [], [], {}));
    expect(html).toMatch(/quiet|square/);
  });
  it("mentions blocked projects in the tail", function () {
    var account = { id: "a1", name: "Marketing", last_interaction_at: new Date().toISOString() };
    var projects = [{ status: "blocked", title: "X" }];
    var html = r(buildInternalTeamInsight(account, [], projects, {}));
    expect(html).toMatch(/blocked/);
  });
});

describe("buildPartnerInsight", function () {
  it("flags an expired agreement", function () {
    var account = {
      id: "p1", name: "Acme",
      agreement_end_date: "2020-01-01",
      last_interaction_at: new Date().toISOString(),
    };
    var html = r(buildPartnerInsight(account, []));
    expect(html).toMatch(/expired/);
  });
  it("flags an upcoming renewal within 30 days", function () {
    var soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    var account = {
      id: "p1", name: "Acme",
      agreement_end_date: soon,
      last_interaction_at: new Date().toISOString(),
    };
    var html = r(buildPartnerInsight(account, []));
    expect(html).toMatch(/renewal in/);
  });
  it("returns 'good standing' fallback when no signal", function () {
    var account = {
      id: "p1", name: "Acme",
      last_interaction_at: new Date().toISOString(),
    };
    var html = r(buildPartnerInsight(account, []));
    expect(html.toLowerCase()).toMatch(/steady|good standing/);
  });
});

describe("buildCustomerInsight", function () {
  it("leads with a red-flag riff when status is red", function () {
    var account = {
      id: "c1", name: "BigCo",
      status: "red",
      last_interaction_at: new Date().toISOString(),
    };
    var html = r(buildCustomerInsight(account, [], [], [], [], {}));
    expect(html).toMatch(/attention|flagged|off with/);
  });
  it("calls out overdue items in the closing line", function () {
    var account = {
      id: "c1", name: "BigCo",
      status: "green",
      last_interaction_at: new Date().toISOString(),
    };
    var items = [{ done: false, due_date: "2020-01-01" }];
    var html = r(buildCustomerInsight(account, items, [], [], [], {}));
    expect(html).toMatch(/overdue/);
  });
});

describe("buildPipInsight dispatch", function () {
  it("dispatches to internal-team builder when account_type=internal_team", function () {
    var account = { id: "a1", name: "Ops", account_type: "internal_team", last_interaction_at: new Date().toISOString() };
    var html = r(buildPipInsight(account, [], [], [], [], {}));
    // Internal-team copy never mentions 'flagged' / status pills
    expect(html).not.toMatch(/flagged/);
  });
  it("dispatches to partner builder when account_type=partner", function () {
    var account = {
      id: "p1", name: "Acme",
      account_type: "partner",
      agreement_end_date: "2020-01-01",
      last_interaction_at: new Date().toISOString(),
    };
    var html = r(buildPipInsight(account, [], [], [], [], {}));
    expect(html).toMatch(/expired/);
  });
  it("defaults to customer builder when account_type is missing", function () {
    var account = { id: "c1", name: "BigCo", status: "green", last_interaction_at: new Date().toISOString() };
    var html = r(buildPipInsight(account, [], [], [], [], {}));
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });
});
