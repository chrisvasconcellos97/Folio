import Anthropic from "@anthropic-ai/sdk";

var client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  var { snapshots, projects, cadencesToday } = req.body || {};
  if (!snapshots || snapshots.length === 0) {
    return res.status(200).json({ brief: "" });
  }

  // Build compressed portfolio state
  var atRisk   = snapshots.filter(function (s) { return s.health_status === "at_risk"; });
  var watching = snapshots.filter(function (s) { return s.health_status === "watching"; });
  var totalOverdue = snapshots.reduce(function (sum, s) { return sum + (s.overdue_item_count || 0); }, 0);

  var activeProjects = (projects || []).filter(function (p) {
    return p.status === "in_progress";
  });
  var stuckProjects = (projects || []).filter(function (p) {
    return p.status === "in_progress" && p.is_stuck;
  });
  var recentWins = (projects || []).filter(function (p) {
    return p.status === "complete" && p.completed_recently;
  });

  var portfolioText = [
    "PORTFOLIO SNAPSHOT (" + snapshots.length + " accounts):",
    atRisk.length   ? "At Risk: " + atRisk.map(function (s) { return s.account_name; }).join(", ") : null,
    watching.length ? "Watching: " + watching.map(function (s) { return s.account_name; }).join(", ") : null,
    totalOverdue    ? "Overdue items across portfolio: " + totalOverdue : null,
    activeProjects.length ? "Active projects: " + activeProjects.length : null,
    stuckProjects.length  ? "Stuck projects: " + stuckProjects.length  : null,
    recentWins.length     ? "Recent wins: " + recentWins.map(function (p) { return p.name; }).join(", ") : null,
    cadencesToday && cadencesToday.length ? "Meetings today: " + cadencesToday.join(", ") : null,
  ].filter(Boolean).join("\n");

  try {
    var msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: [
        {
          type: "text",
          text: "You are Pip, a loyal field analyst. Write a single-paragraph daily brief (3-5 sentences) for the account manager based on the portfolio snapshot below. Tone: direct, collegial, not alarming. Surface: what needs attention today, any wins worth mentioning, biggest risks. Do not use bullet points — prose only. Do not start with 'I' or 'Here is'.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: portfolioText },
      ],
    });

    var brief = msg.content[0].type === "text" ? msg.content[0].text : "";
    return res.status(200).json({ brief: brief });
  } catch (e) {
    console.error("[portfolio-brief]", e);
    return res.status(500).json({ error: e.message });
  }
}
