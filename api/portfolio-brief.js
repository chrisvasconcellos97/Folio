import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  var { snapshots, projects } = req.body || {};
  if (!snapshots || snapshots.length === 0) {
    return res.status(200).json({ brief: "", callouts: [] });
  }

  var atRisk   = snapshots.filter(function (s) { return s.health_status === "at_risk"; });
  var watching = snapshots.filter(function (s) { return s.health_status === "watching"; });

  var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  var stuckProjects = (projects || []).filter(function (p) { return p.status === "in_progress" && p.is_stuck; });
  var recentWins    = (projects || []).filter(function (p) { return p.status === "complete" && p.updated_at && p.updated_at > sevenDaysAgo; });

  // Build a specific, readable account list so Pip can reference real details
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

  var portfolioText = [
    snapshots.length + " accounts total.",
    flaggedLines.length > 0 ? "Flagged:\n" + flaggedLines.join("\n") : "No accounts flagged.",
    stuckProjects.length > 0 ? stuckProjects.length + " stuck project" + (stuckProjects.length > 1 ? "s" : "") + " (no progress in 7+ days)." : null,
    recentWins.length > 0 ? "Recent wins: " + recentWins.map(function (p) { return p.title; }).join(", ") + "." : "No recent wins.",
  ].filter(Boolean).join("\n");

  var systemPrompt = `You are Pip — a sharp, slightly dry field analyst who knows this account manager's portfolio inside and out. You're giving them a morning read the way a trusted colleague would: honest, specific, with a little personality. Not a report. Not a dashboard printout. Something they'd actually want to read.

Voice rules:
- Sound like a smart friend who's been watching their book — direct, a little dry, genuinely invested.
- You can have opinions: "that ratio isn't great," "worth a real look before Friday," "nothing alarming but don't let it slide." That's Pip.
- Name specific accounts and items. Never say "one account needs attention" when you know which one and why.
- No corporate words: not "warrants," "tension point," "resource-constrained," "unpacking," "flag before end-of-day." If it sounds like a consulting deck, cut it.
- Vary your sentence length — some short punches, some longer observations. Monotone rhythm is boring.
- 4-6 sentences. Enough to actually say something, not so much that it becomes a report.
- No bullet points. No markdown bold (**like this**). Plain prose.
- Don't start with "I" or "Here is" or "Daily Brief."
- Major-tier accounts carry the most revenue and relationship weight. Lead with them when surfacing risks, wins, or items needing attention. Don't bury a Major account issue behind Mid or Growth items.

Also return a JSON array called "callouts" — one object per specific account you mention. Each: { "account_name": exact name as given, "reason": one short phrase, "item": the specific overdue item text or null }.

Return ONLY valid JSON:
{ "brief": "...", "callouts": [...] }`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment." });
  }

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
