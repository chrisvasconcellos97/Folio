import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment." });
  }

  try {
    var authHeader = req.headers.authorization || "";
    var token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    var user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });
  } catch (authErr) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  var { snapshots, projects, overdueTasks, commitmentsDue, commitmentsOverdue, todayCadences } = req.body || {};
  snapshots = snapshots || [];

  var atRisk   = snapshots.filter(function (s) { return s.health_status === "at_risk"; });
  var watching = snapshots.filter(function (s) { return s.health_status === "watching"; });

  var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  var stuckProjects = (projects || []).filter(function (p) { return p.status === "in_progress" && p.is_stuck; });
  var recentWins    = (projects || []).filter(function (p) { return p.status === "complete" && p.updated_at && p.updated_at > sevenDaysAgo; });

  // Build account-level flagged lines for at_risk/watching accounts
  var flaggedLines = [];
  atRisk.concat(watching).forEach(function (s) {
    var parts = [s.account_name];
    if (s.health_status === "at_risk") parts.push("AT RISK");
    if (s.days_since_contact !== null && s.days_since_contact >= 14) parts.push(s.days_since_contact + " days since last contact");
    if (s.overdue_item_count > 0) {
      var label = s.overdue_item_count + " overdue item" + (s.overdue_item_count > 1 ? "s" : "");
      if (s.overdue_items && s.overdue_items.length > 0) {
        label += ": " + s.overdue_items.slice(0, 2).map(function (t) { return '"' + t + '"'; }).join(", ");
      }
      parts.push(label);
    }
    if (s.stuck_project_count > 0) parts.push(s.stuck_project_count + " stuck project" + (s.stuck_project_count > 1 ? "s" : ""));
    flaggedLines.push(parts.join(" — "));
  });

  // Workload section — this is what makes the brief feel real
  var workloadLines = [];
  if ((commitmentsOverdue || []).length > 0) {
    workloadLines.push("OVERDUE COMMITMENTS (" + commitmentsOverdue.length + "): " +
      commitmentsOverdue.slice(0, 3).map(function (c) { return '"' + c.text + '"'; }).join(", "));
  }
  if ((commitmentsDue || []).length > 0) {
    workloadLines.push("COMMITMENTS DUE THIS WEEK (" + commitmentsDue.length + "): " +
      commitmentsDue.slice(0, 3).map(function (c) { return '"' + c.text + '" by ' + c.due_date; }).join(", "));
  }
  if ((overdueTasks || []).length > 0) {
    workloadLines.push("OVERDUE TASKS (" + overdueTasks.length + " total): " +
      overdueTasks.slice(0, 4).map(function (t) { return '"' + t + '"'; }).join(", ") +
      (overdueTasks.length > 4 ? " (+" + (overdueTasks.length - 4) + " more)" : ""));
  }
  if ((todayCadences || []).length > 0) {
    workloadLines.push("CADENCES TODAY: " + todayCadences.join(", "));
  }
  if (stuckProjects.length > 0) {
    workloadLines.push(stuckProjects.length + " stuck project" + (stuckProjects.length > 1 ? "s" : "") + " (no stage progress in 7+ days)");
  }

  var portfolioText = [
    snapshots.length > 0 ? snapshots.length + " accounts total." : null,
    flaggedLines.length > 0 ? "Account flags:\n" + flaggedLines.join("\n") : "No accounts flagged at the account level.",
    workloadLines.length > 0 ? "Active workload:\n" + workloadLines.join("\n") : "No overdue tasks or upcoming commitments.",
    recentWins.length > 0 ? "Recent wins: " + recentWins.map(function (p) { return p.title; }).join(", ") + "." : "No recent project wins.",
  ].filter(Boolean).join("\n\n");

  // If there's genuinely nothing to report, return empty so the UI skips the card
  var hasAnything = flaggedLines.length > 0 || workloadLines.length > 0 || recentWins.length > 0;
  if (!hasAnything) {
    return res.status(200).json({ brief: "", callouts: [] });
  }

  var systemPrompt = `You are Pip — a sharp, slightly dry field analyst who knows this account manager's portfolio inside and out. You're giving them a morning read the way a trusted colleague would: honest, specific, with a little personality. Not a report. Not a dashboard printout. Something they'd actually want to read.

The "Active workload" section is the most important input — it shows overdue tasks, upcoming commitments, and today's meetings. Lead with what's most urgent from that section. An AM can be drowning in work even when their accounts all look healthy on paper — don't let a clean account health score distract you from a pile of overdue tasks.

Voice rules:
- Sound like a smart friend who's been watching their book — direct, a little dry, genuinely invested.
- You can have opinions: "that's a lot to carry," "worth clearing before Friday," "don't let this one slip." That's Pip.
- Name specific tasks and commitments when they're given. Never say "several overdue tasks" when you can say what they are.
- No corporate words: not "warrants," "tension point," "resource-constrained," "unpacking." If it sounds like a consulting deck, cut it.
- Vary your sentence length — some short punches, some longer observations. Monotone rhythm is boring.
- 4-6 sentences. Enough to actually say something, not so much that it becomes a report.
- No bullet points. No markdown bold (**like this**). Plain prose.
- Don't start with "I" or "Here is" or "Daily Brief."
- Major-tier accounts carry the most revenue and relationship weight. Lead with them when surfacing risks.

Also return a JSON array called "callouts" — one object per specific account or task you mention. Each: { "account_name": exact account name if applicable or null, "reason": one short phrase, "item": the specific task/commitment text or null }.

Return ONLY valid JSON:
{ "brief": "...", "callouts": [...] }`;

  try {
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: portfolioText }],
    });

    var raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

    // Strip markdown code fences if Haiku wraps in ```json
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      // Fallback: treat the whole thing as brief with no callouts
      parsed = { brief: raw, callouts: [] };
    }

    return res.status(200).json({
      brief:    (parsed.brief    || "").replace(/\*\*/g, ""),
      callouts: parsed.callouts  || [],
    });
  } catch (e) {
    console.error("[portfolio-brief]", e);
    return res.status(500).json({ error: e.message });
  }
}
