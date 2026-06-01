import Anthropic from "@anthropic-ai/sdk";

var RATE_MAP = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  var userId = req.body && req.body.userId;
  if (userId) {
    var now = Date.now();
    var last = RATE_MAP.get(userId) || 0;
    if (now - last < 10000) return res.status(429).json({ error: "rate_limited" });
    RATE_MAP.set(userId, now);
  }

  var { meetingSummary, actionItems, contactName, portfolioState } = req.body || {};
  if (!meetingSummary) return res.status(400).json({ error: "meetingSummary required" });

  var bossName = contactName || "your manager";

  var portfolioSection = "";
  if (portfolioState && portfolioState.length > 0) {
    var healthy  = portfolioState.filter(function (s) { return s.health_status === "green"; }).length;
    var watching = portfolioState.filter(function (s) { return s.health_status === "yellow"; }).length;
    var atRisk   = portfolioState.filter(function (s) { return s.health_status === "red"; }).length;
    portfolioSection = "Portfolio: " + portfolioState.length + " accounts — " +
      healthy + " healthy, " + watching + " watching, " + atRisk + " at risk.\n" +
      portfolioState.slice(0, 8).map(function (s) {
        return "- " + s.account_name + ": " + (s.health_status || "?") +
          (s.overdue_count > 0 ? " · " + s.overdue_count + " overdue" : "") +
          (s.stuck_project_count > 0 ? " · " + s.stuck_project_count + " stuck" : "");
      }).join("\n");
  }

  var systemPrompt = "You are Pip, a loyal field analyst for an account manager. " +
    "Write a concise, professional email from the AM to their manager summarizing a 1:1 check-in and the current portfolio state. " +
    "Tone: direct, confident, no fluff. Use plain text — no markdown headers or bullet stars. " +
    "Structure: short opening acknowledging the conversation, a brief recap section, a portfolio snapshot section if data is available, and a closing note on priorities. " +
    "Keep it under 250 words. Do not include a subject line. Start with 'Hi [name],' on the first line. " +
    "Major-tier accounts carry the most revenue and relationship weight. Lead with them when surfacing risks, wins, or items needing attention. Don't bury a Major account issue behind Mid or Growth items.";

  var userPrompt = "1:1 meeting summary:\n" + meetingSummary + "\n\n" +
    (actionItems && actionItems.length ? "Action items from the call:\n" + actionItems.map(function(a) { return "- " + a; }).join("\n") + "\n\n" : "") +
    (portfolioSection ? "Portfolio state:\n" + portfolioSection + "\n\n" : "") +
    "Write the email to " + bossName + ".";

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on this deployment." });
  }

  try {
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    var email = resp.content[0].type === "text" ? resp.content[0].text.trim() : "";
    return res.status(200).json({ email: email });
  } catch (err) {
    console.error("[leadership-readout]", err && err.message);
    return res.status(500).json({ error: "pip_error" });
  }
}
