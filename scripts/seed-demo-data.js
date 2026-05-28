#!/usr/bin/env node
// Seed the demo account with realistic fake data for stress-testing.
//
// Setup (one-time):
//   1. In Supabase Dashboard → Auth → Users → Add User, create:
//        email: demo-bot@folioshq.com  (or whatever you pick)
//        password: <something long>
//   2. Copy your Supabase URL + anon key into .env:
//        VITE_SUPABASE_URL=https://yrpdjmyfidhxlpmxasao.supabase.co
//        VITE_SUPABASE_ANON_KEY=eyJ...
//        DEMO_USER_EMAIL=demo-bot@folioshq.com
//        DEMO_USER_PASSWORD=...
//
// Run:    node scripts/seed-demo-data.js
// Wipe:   node scripts/seed-demo-data.js --wipe-only
// Reseed: node scripts/seed-demo-data.js   (always wipes first)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ─── Env loader (no dotenv dep) ────────────────────────────────────────
function loadEnv() {
  var envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  try {
    var raw = readFileSync(envPath, "utf8");
    raw.split("\n").forEach(function (line) {
      var m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    });
  } catch (_) {}
}
loadEnv();

var SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
var SUPABASE_KEY  = process.env.VITE_SUPABASE_ANON_KEY;
var DEMO_EMAIL    = process.env.DEMO_USER_EMAIL;
var DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;
var WIPE_ONLY     = process.argv.includes("--wipe-only");

if (!SUPABASE_URL || !SUPABASE_KEY || !DEMO_EMAIL || !DEMO_PASSWORD) {
  console.error("Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, DEMO_USER_EMAIL, DEMO_USER_PASSWORD");
  process.exit(1);
}

var supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Fake data pools ──────────────────────────────────────────────────
var COMPANY_PARTS = {
  prefix: ["Acme", "Bayside", "Iron Hill", "Lone Star", "Pacific", "Summit", "Granite", "Northwind", "Cascade", "Cedar", "Liberty", "Capitol", "Riverside", "Eastgate", "Westfield", "Highland", "Coastal", "Ridgeway", "Stonecrest", "Sunset", "Harbor", "Lakeshore", "Foothill", "Brookline", "Valley"],
  core:   ["Auto Parts", "Collision", "Body Works", "Service", "Group", "Automotive", "Industries", "Salvage", "Reman", "Aftermarket", "Distribution", "Logistics", "Holdings", "Motors"],
  suffix: ["", "LLC", "Inc", "Corp", "Co", "& Sons", "Partners"],
};

var FIRST_NAMES = ["Sarah", "Mike", "Jennifer", "David", "Linda", "James", "Patricia", "Robert", "Susan", "John", "Lisa", "Mark", "Karen", "Steve", "Nancy", "Paul", "Amy", "Brian", "Kimberly", "Kevin", "Donna", "Jason", "Carol", "Eric", "Michelle", "Gary", "Rebecca", "Tom", "Laura", "Chris", "Angela", "Daniel", "Heather", "Anthony", "Christine", "Joshua"];
var LAST_NAMES  = ["Anderson", "Martinez", "Johnson", "Lee", "Brown", "Davis", "Wilson", "Garcia", "Rodriguez", "Lewis", "Walker", "Hall", "Allen", "Young", "King", "Scott", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell", "Roberts", "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins"];
var ROLES = ["Owner", "GM", "Operations Manager", "Parts Manager", "Service Manager", "Body Shop Manager", "Estimator", "VP Operations", "Director of Procurement", "Buyer", "Regional Manager", "President"];
var REGIONS = ["Northeast", "Mid-Atlantic", "Southeast", "Midwest", "South Central", "Mountain", "West", "National"];
var STATES_BY_REGION = {
  "Northeast": ["NY", "MA", "CT", "PA", "NJ"],
  "Mid-Atlantic": ["MD", "VA", "DC"],
  "Southeast": ["FL", "GA", "NC", "SC", "TN"],
  "Midwest": ["OH", "IL", "MI", "IN", "WI"],
  "South Central": ["TX", "OK", "AR", "LA"],
  "Mountain": ["CO", "AZ", "UT", "NM"],
  "West": ["CA", "OR", "WA"],
  "National": ["TX", "CA", "FL", "NY"],
};
var TIERS   = ["Major", "Mid", "Growth"];
var STATUSES = ["green", "yellow", "red"];
var ACCOUNT_TYPES = [
  { type: "standard",      weight: 12 },
  { type: "mso",           weight: 3  },
  { type: "shop",          weight: 6  },
  { type: "internal_team", weight: 3  },
  { type: "partner",       weight: 4  },
];
var PART_TAGS = ["aftermarket", "reman", "salvage", "OEM"];
var DEPT_NAMES = ["Marketing", "Sales Operations", "Product", "Customer Success", "Engineering", "Finance", "Procurement", "HR", "IT", "Legal"];
var PARTNER_NAMES = ["Acme Logistics", "Northstar Freight", "Capital Recovery Services", "Vendor Net", "RouteOne Logistics", "Beacon Insurance", "Apex Marketing Agency", "Cardinal Audit"];

var MEETING_TITLES = ["Quarterly Business Review", "Monthly Check-In", "Pricing Discussion", "New Product Launch", "Account Strategy", "Issue Resolution", "Renewal Conversation", "Discovery Call", "Onboarding Kickoff", "Status Update", "Roadmap Review", "Performance Review"];
var ITEM_TEXTS = ["Send updated pricing proposal", "Follow up on Q3 forecast numbers", "Confirm next quarter inventory needs", "Send sample parts for testing", "Schedule walkthrough at warehouse", "Connect IT teams on integration", "Send catalog update by Friday", "Review payment terms", "Confirm shipping address change", "Draft new MSA", "Get sign-off on scope changes", "Verify part numbers for new model year", "Submit credit application", "Send freight quote", "Confirm rebate program enrollment", "Update contact info in system"];
var PROJECT_TITLES = ["Migrate to new POS system", "Q4 menu refresh", "Warehouse expansion", "New website rollout", "Integration with Acme catalog", "Implement new pricing tiers", "Staff training program", "Onboard new product line", "Customer portal redesign", "Q3 marketing campaign"];

// ─── Helpers ──────────────────────────────────────────────────────────
function rng(seed) {
  var s = seed | 0;
  return function () { s = (s * 9301 + 49297) | 0; return ((s >>> 0) % 100000) / 100000; };
}
var rand = rng(42);
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function pickN(arr, n) { var copy = arr.slice(); var out = []; for (var i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]); return out; }
function weightedPick(items) {
  var total = items.reduce(function (s, x) { return s + x.weight; }, 0);
  var r = rand() * total;
  for (var i = 0; i < items.length; i++) { r -= items[i].weight; if (r < 0) return items[i].type; }
  return items[0].type;
}
function daysAgo(n) { return new Date(Date.now() - n * 86400000); }
function dateISO(d) { return d.toISOString().slice(0, 10); }
function genName(type) {
  if (type === "internal_team") return pick(DEPT_NAMES);
  if (type === "partner") return pick(PARTNER_NAMES);
  return (pick(COMPANY_PARTS.prefix) + " " + pick(COMPANY_PARTS.core) + " " + pick(COMPANY_PARTS.suffix)).trim();
}
function genPerson() { return { first: pick(FIRST_NAMES), last: pick(LAST_NAMES) }; }
function genPhone() { return "(" + (200 + Math.floor(rand() * 800)) + ") " + (100 + Math.floor(rand() * 900)) + "-" + (1000 + Math.floor(rand() * 9000)); }
function genEmail(first, last, company) {
  var domain = (company || "example").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) + ".com";
  return (first[0] + last).toLowerCase() + "@" + domain;
}

// ─── Main ─────────────────────────────────────────────────────────────
(async function main() {
  console.log("→ Signing in as " + DEMO_EMAIL);
  var auth = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (auth.error) { console.error("Auth failed:", auth.error.message); process.exit(1); }
  var userId = auth.data.user.id;
  console.log("  user_id =", userId);

  console.log("→ Wiping existing demo data");
  // Cascade does most of it via FK on delete cascade from folio_accounts.
  // Quick tasks and gauge projects with null account_id won't cascade, so handle directly.
  await supabase.from("folio_quick_tasks").delete().eq("user_id", userId);
  await supabase.from("gauge_projects").delete().eq("user_id", userId);
  await supabase.from("folio_accounts").delete().eq("user_id", userId);
  console.log("  ok");

  if (WIPE_ONLY) { console.log("→ --wipe-only: done."); process.exit(0); }

  console.log("→ Generating accounts…");
  var accounts = [];
  for (var i = 0; i < 50; i++) {
    var type = weightedPick(ACCOUNT_TYPES);
    var region = pick(REGIONS);
    var isCustomer = type === "standard" || type === "mso" || type === "shop";
    var tier = isCustomer ? pick(TIERS) : null;
    var status = pick(STATUSES);
    var revenue = isCustomer ? Math.round((10000 + rand() * 4990000) / 1000) * 1000 : null;
    var name = genName(type);
    accounts.push({
      user_id: userId,
      name: name,
      tier: tier,
      status: status,
      revenue_amount: revenue,
      region: isCustomer ? region : null,
      account_type: type,
      tags: isCustomer ? pickN(PART_TAGS, 1 + Math.floor(rand() * 3)) : null,
      serviced_states: isCustomer ? pickN(STATES_BY_REGION[region] || ["TX"], 1 + Math.floor(rand() * 2)) : null,
      address: isCustomer ? (100 + Math.floor(rand() * 9000)) + " Main St, " + pick(["Austin", "Dallas", "Atlanta", "Chicago", "Phoenix", "Denver", "Boston", "Tampa"]) + ", " + (STATES_BY_REGION[region] || ["TX"])[0] : null,
      account_number: isCustomer ? "ACC-" + (10000 + Math.floor(rand() * 89999)) : null,
      agreement_end_date: type === "partner" ? dateISO(daysAgo(-Math.floor(rand() * 365))) : null,
      scope_summary: type === "partner" ? pick(["Freight + LTL across all 50 states", "Marketing campaign management Q1-Q4", "Annual SOC 2 audit", "Recovery services on totaled units"]) : null,
      billing_terms: type === "partner" ? pick(["Net 30", "Net 60", "Quarterly retainer"]) : null,
      spend_ytd: type === "partner" ? Math.round((5000 + rand() * 195000) / 100) * 100 : null,
      owner_user_id: userId,
      is_inactive: rand() < 0.08, // ~4 accounts inactive
      inactivated_at: null,
      last_interaction_at: daysAgo(Math.floor(rand() * 90)).toISOString(),
      last_meeting: dateISO(daysAgo(Math.floor(rand() * 60))),
      next_meeting: rand() < 0.4 ? dateISO(daysAgo(-Math.floor(rand() * 30))) : null,
    });
  }
  var acctRes = await supabase.from("folio_accounts").insert(accounts).select();
  if (acctRes.error) { console.error(acctRes.error); process.exit(1); }
  var saved = acctRes.data;
  console.log("  " + saved.length + " accounts");

  // Set parent relationships — some MSO → shop parenting
  console.log("→ Linking MSO parents to shops…");
  var msos  = saved.filter(function (a) { return a.account_type === "mso"; });
  var shops = saved.filter(function (a) { return a.account_type === "shop"; });
  for (var s = 0; s < shops.length; s++) {
    var parent = msos[s % msos.length];
    if (parent) await supabase.from("folio_accounts").update({ parent_account_id: parent.id }).eq("id", shops[s].id);
  }

  // Activate timestamps on inactive accounts
  var inactive = saved.filter(function (a) { return a.is_inactive; });
  for (var inact of inactive) {
    await supabase.from("folio_accounts").update({ inactivated_at: daysAgo(Math.floor(rand() * 180) + 30).toISOString() }).eq("id", inact.id);
  }

  console.log("→ Generating contacts…");
  var contacts = [];
  saved.forEach(function (a) {
    var n = 1 + Math.floor(rand() * 4);
    for (var k = 0; k < n; k++) {
      var p = genPerson();
      contacts.push({
        user_id: userId, account_id: a.id,
        name: p.first + " " + p.last,
        title: pick(ROLES),
        phone: rand() < 0.7 ? genPhone() : null,
        email: rand() < 0.8 ? genEmail(p.first, p.last, a.name) : null,
        is_poc:     k === 0,
        is_leader:  k === 0 && a.account_type === "internal_team",
        is_primary: k === 0,
      });
    }
  });
  // batch insert to avoid hitting payload limits
  for (var i2 = 0; i2 < contacts.length; i2 += 200) {
    await supabase.from("folio_contacts").insert(contacts.slice(i2, i2 + 200));
  }
  console.log("  " + contacts.length + " contacts");

  console.log("→ Generating meetings…");
  var meetings = [];
  saved.forEach(function (a) {
    var n = 2 + Math.floor(rand() * 12); // 2-13 meetings per account
    for (var k = 0; k < n; k++) {
      var ago = Math.floor(rand() * 730); // up to 2 years back
      var hasSummary = rand() < 0.4;
      meetings.push({
        user_id: userId, account_id: a.id,
        title: pick(MEETING_TITLES),
        meeting_date: dateISO(daysAgo(ago)),
        method: pick(["phone", "email", "video", "in_person"]),
        status: rand() < 0.92 ? "summarized" : "draft",
        notes: pick(["Discussed Q3 forecast and inventory pulls. They expect 15% growth.", "Walked through new product launch. Pricing pushback on premium tier.", "Renewal conversation. They want better terms on freight.", "Status check. No issues to report. They're happy.", "Issue: missing shipment from last Tuesday. Replacement going out today.", "Quick touch base. They asked about cross-docking pilot."]),
        action_items: rand() < 0.6 ? pick(ITEM_TEXTS) + "\n" + pick(ITEM_TEXTS) : null,
        follow_up_date: rand() < 0.3 ? dateISO(daysAgo(-(1 + Math.floor(rand() * 30)))) : null,
        attendees: [genPerson().first + " " + genPerson().last],
        pip_summary: hasSummary ? "Pip summary: account looks healthy, expected uplift Q4, two open items to track." : null,
        pip_email: hasSummary ? "Hi team,\n\nThanks for the time today...\n\nBest,\nChris" : null,
      });
    }
  });
  for (var i3 = 0; i3 < meetings.length; i3 += 200) {
    await supabase.from("folio_meetings").insert(meetings.slice(i3, i3 + 200));
  }
  console.log("  " + meetings.length + " meetings");

  console.log("→ Generating items…");
  var items = [];
  saved.forEach(function (a) {
    var n = 1 + Math.floor(rand() * 12);
    for (var k = 0; k < n; k++) {
      var done = rand() < 0.5;
      var due = rand() < 0.7 ? dateISO(daysAgo(-Math.floor(rand() * 60) + 30)) : null;
      items.push({
        user_id: userId, account_id: a.id,
        text: pick(ITEM_TEXTS),
        due_date: done ? null : due,
        owner: rand() < 0.3 ? pick(FIRST_NAMES) : null,
        done: done,
        closed_at: done ? daysAgo(Math.floor(rand() * 90)).toISOString() : null,
      });
    }
  });
  for (var i4 = 0; i4 < items.length; i4 += 200) {
    await supabase.from("folio_items").insert(items.slice(i4, i4 + 200));
  }
  console.log("  " + items.length + " items");

  console.log("→ Generating cadences…");
  var cadences = [];
  saved.filter(function (a) { return !a.is_inactive && rand() < 0.5; }).forEach(function (a) {
    var freq = pick(["weekly", "biweekly", "monthly", "quarterly"]);
    cadences.push({
      user_id: userId, account_id: a.id,
      type: "meeting", frequency: freq,
      day_of_week:  (freq === "weekly" || freq === "biweekly") ? Math.floor(rand() * 5) + 1 : null,
      day_of_month: (freq === "monthly" || freq === "quarterly") ? 1 + Math.floor(rand() * 28) : null,
      meeting_time: rand() < 0.7 ? (9 + Math.floor(rand() * 7)) + ":00" : null,
    });
  });
  if (cadences.length > 0) await supabase.from("folio_cadences").insert(cadences);
  console.log("  " + cadences.length + " cadences");

  console.log("→ Generating Gauge projects…");
  var projects = [];
  saved.filter(function (a) { return !a.is_inactive && rand() < 0.4; }).forEach(function (a) {
    projects.push({
      user_id: userId, account_id: a.id,
      title: pick(PROJECT_TITLES),
      description: "Auto-generated demo project for stress testing.",
      status: pick(["planned", "in_progress", "in_progress", "blocked", "complete", "on_hold"]),
      priority: pick(["high", "medium", "medium", "low"]),
      due_date: dateISO(daysAgo(-Math.floor(rand() * 90) + 30)),
      start_date: dateISO(daysAgo(Math.floor(rand() * 60))),
      assignee: DEMO_EMAIL,
      scope: "personal",
      stages: [
        { title: "Discovery",          completed_at: rand() < 0.7 ? new Date().toISOString() : null },
        { title: "Implementation",     completed_at: rand() < 0.4 ? new Date().toISOString() : null },
        { title: "QA",                 completed_at: rand() < 0.2 ? new Date().toISOString() : null },
        { title: "Launch",             completed_at: rand() < 0.1 ? new Date().toISOString() : null },
      ],
    });
  });
  if (projects.length > 0) await supabase.from("gauge_projects").insert(projects);
  console.log("  " + projects.length + " projects");

  console.log("→ Generating quick tasks…");
  var tasks = [];
  for (var t = 0; t < 25; t++) {
    var attachAcct = rand() < 0.7;
    tasks.push({
      user_id: userId,
      account_id: attachAcct ? pick(saved).id : null,
      title: pick(["Call back about quote", "Email proposal", "Follow up on shipment", "Confirm meeting time", "Review contract terms", "Send price list", "Check stock availability"]),
      notes: rand() < 0.4 ? "Quick note about this task — fake demo data." : null,
      done: rand() < 0.3,
      reminder_at: rand() < 0.5 ? daysAgo(-Math.floor(rand() * 14)).toISOString() : null,
    });
  }
  await supabase.from("folio_quick_tasks").insert(tasks);
  console.log("  " + tasks.length + " quick tasks");

  console.log("\n✓ Demo data seeded.");
  console.log("  Accounts: " + saved.length + " (" + saved.filter(function (a) { return a.is_inactive; }).length + " inactive)");
  console.log("  Contacts: " + contacts.length);
  console.log("  Meetings: " + meetings.length);
  console.log("  Items:    " + items.length);
  console.log("  Cadences: " + cadences.length);
  console.log("  Projects: " + projects.length);
  console.log("  Tasks:    " + tasks.length);
  process.exit(0);
})().catch(function (err) {
  console.error("Failed:", err);
  process.exit(1);
});
