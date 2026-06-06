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

  var { snapshots, projects, overdueTasks, commitmentsDue, commitmentsOverdue, todayCadences, coldAccounts, looseEnds, healthDeltas, relationshipSignals, toneSignals, anomalySignals, portfolioThemes, facts, profileProse } = req.body || {};
  snapshots = snapshots || [];

  var atRisk   = snapshots.filter(function (s) { return s.health_status === "at_risk"; });
  var watching = snapshots.filter(function (s) { return s.health_status === "watching"; });

  var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  var stuckProjects = (projects || []).filter(function (p) { return p.status === "in_progress" && p.is_stuck; });
  var recentWins    = (projects || []).filter(function (p) { return p.status === "complete" && p.updated_at && p.updated_at > sevenDaysAgo; });

  // Build account-level flagged lines for at_risk/watching accounts
  var flaggedLines = [];
  atRisk.concat(watching).forEach(function (s) {
    var parts = [];
    // Prefix tier badge for major accounts
    var accountLabel = (s.tier === "major" ? "[MAJOR] " : "") + s.account_name;
    parts.push(accountLabel);
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
    if (s.objective) parts.push('goal: "' + s.objective.slice(0, 80) + '"');
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
    workloadLines.push("CADENCES TODAY: " + todayCadences.map(function (c) {
      var parts = [c.account_name];
      if (c.meeting_time) parts.push("at " + c.meeting_time);
      if (c.label) parts.push("(" + c.label + ")");
      return parts.join(" ");
    }).join(", "));
  }
  if (stuckProjects.length > 0) {
    workloadLines.push("STUCK PROJECTS (" + stuckProjects.length + "): " +
      stuckProjects.map(function (p) {
        return (p.title || "Unnamed project") + (p.account_name ? " (" + p.account_name + ")" : "");
      }).join(", "));
  }
  if ((coldAccounts || []).length > 0) {
    workloadLines.push("COLD ACCOUNTS (no contact 30+ days): " +
      coldAccounts.map(function (a) {
        return (a.tier === "major" ? "[MAJOR] " : "") + a.name + " (" + a.days_since_contact + "d)";
      }).join(", "));
  }
  if ((looseEnds || []).length > 0) {
    workloadLines.push("UNSUMMARIZED MEETINGS (" + looseEnds.length + "): " +
      looseEnds.map(function (m) {
        return m.account_name + " — " + m.title + " (" + m.days_ago + "d ago)";
      }).join(", "));
  }
  if ((healthDeltas || []).length > 0) {
    var slipping   = healthDeltas.filter(function (d) { return d.direction === "slipping"; });
    var recovering = healthDeltas.filter(function (d) { return d.direction === "recovering"; });
    if (slipping.length > 0) {
      workloadLines.push("TRENDING WORSE: " + slipping.map(function (d) {
        return (d.tier === "major" ? "[MAJOR] " : "") + d.account_name + " (" + d.from + " → " + d.to + ")";
      }).join(", "));
    }
    if (recovering.length > 0) {
      workloadLines.push("RECOVERING: " + recovering.map(function (d) {
        return d.account_name + " (" + d.from + " → " + d.to + ")";
      }).join(", "));
    }
  }
  if ((toneSignals || []).length > 0) {
    var cooling = toneSignals.filter(function (t) { return t.trend === "cooling"; });
    var warming = toneSignals.filter(function (t) { return t.trend === "warming"; });
    if (cooling.length > 0) {
      workloadLines.push("COOLING TONE (last 3 meetings): " +
        cooling.map(function (t) { return (t.tier === "major" ? "[MAJOR] " : "") + t.account_name; }).join(", "));
    }
    if (warming.length > 0) {
      workloadLines.push("WARMING TONE: " + warming.map(function (t) { return t.account_name; }).join(", "));
    }
  }
  if ((anomalySignals || []).length > 0) {
    workloadLines.push("OFF-CADENCE vs their own rhythm: " +
      anomalySignals.map(function (a) {
        return (a.tier === "major" ? "[MAJOR] " : "") + a.account_name +
          " (usually every ~" + a.typical_days + "d, now " + a.days_since + "d)";
      }).join("; "));
  }
  if ((relationshipSignals || []).length > 0) {
    relationshipSignals.forEach(function (r) {
      var parts = [(r.tier === "major" ? "[MAJOR] " : "") + r.account_name];
      if (r.champions.length > 0) parts.push("champion: " + r.champions.join(", "));
      if (r.blockers.length > 0) parts.push("BLOCKER: " + r.blockers.join(", "));
      workloadLines.push("RELATIONSHIP: " + parts.join(" — "));
    });
  }

  var themesText = (portfolioThemes || []).length > 0
    ? "Portfolio-wide themes (appearing on 3+ accounts): " +
      portfolioThemes.map(function (t) {
        return t.theme + " (" + t.count + " accounts" +
          (t.accounts && t.accounts.length > 0 ? ": " + t.accounts.join(", ") : "") + ")";
      }).join("; ")
    : null;

  // What the user has taught Pip — profile narrative + glossary facts. Goes in
  // the (non-cached) user message so the cached system prompt stays byte-stable
  // across users. Lets the morning brief speak their vocabulary.
  var knownBlock = "";
  if (typeof profileProse === "string" && profileProse.trim()) {
    knownBlock += "WHO THIS PERSON IS:\n" + profileProse.trim() + "\n\n";
  }
  if (Array.isArray(facts) && facts.length) {
    knownBlock += "WHAT YOU'VE LEARNED (their vocabulary + preferences — use it, don't ask):\n" +
      facts.slice(0, 20).map(function (f) { return "- " + f; }).join("\n") + "\n\n";
  }

  var portfolioText = knownBlock + [
    snapshots.length > 0 ? snapshots.length + " accounts total." : null,
    flaggedLines.length > 0 ? "Account flags:\n" + flaggedLines.join("\n") : "No accounts flagged at the account level.",
    workloadLines.length > 0 ? "Active workload:\n" + workloadLines.join("\n") : "No overdue tasks or upcoming commitments.",
    recentWins.length > 0 ? "Recent wins: " + recentWins.map(function (p) { return p.title; }).join(", ") + "." : "No recent project wins.",
    themesText,
  ].filter(Boolean).join("\n\n");

  // If there's genuinely nothing to report, return empty so the UI skips the card
  var hasAnything = flaggedLines.length > 0 || workloadLines.length > 0 || recentWins.length > 0 || (portfolioThemes || []).length > 0;
  if (!hasAnything) {
    return res.status(200).json({ brief: "", callouts: [] });
  }

  var systemPrompt = `You are Pip — a sharp, slightly dry field analyst who knows this account manager's portfolio inside and out. You're giving them a morning read the way a trusted colleague would: honest, specific, with a little personality. Not a report. Not a dashboard printout.

Triage order — lead with the highest priority item first:
1. Overdue commitments to a named person (a broken promise is the worst outcome)
2. Active operational fires hitting a named customer
3. Overdue tasks on Major-tier accounts
4. Stuck projects (no stage progress in 7+ days) and today's meetings
5. Cold Major or Mid accounts gone quiet past their normal cadence
Wins and momentum go last — acknowledge them, but never open with them.

Length rule: match your length to the day. A clean day (nothing overdue, no fires) is a one-line headline plus maybe one short section — don't manufacture drama or empty sections. A heavy day (multiple overdue items, a fire, commitments slipping) gets the full set of sections so nothing important gets buried. Never pad. Never truncate something urgent.

Structure rule — write the brief in this markdown shape (the UI renders **bold**, bullets, and ## headers):
- Open with ONE bold headline line that captures the day in a sentence. No header on it. (e.g. "**Two commitments due this week — one's on fire.**")
- Then ONLY the sections below that actually have content, each as a "## " header prefixed with exactly one status glyph token:
  - "## :fire: Needs you today" — overdue commitments, active fires, Major-tier issues
  - "## :watch: This week" — important but not on fire: stuck projects, cold accounts, follow-ups
  - "## :win: Good news" — wins, recovering accounts, backlog clearing
  - "## :signal: Pattern" — a theme across 3+ accounts worth raising to management
- Under each header, use "- " bullets. Bold the account / person / task names. End an urgent bullet with the concrete next action ("→ pull the routing config").
- Glyph tokens: use ONLY :fire: :watch: :win: :signal:, ONLY immediately after "## ". Never anywhere else, never any other token, and never a unicode emoji.
- Skip any section with nothing in it. Order sections fire → watch → win → signal. Wins never go first.
- CRITICAL: put the headline, every "## " header, and every "- " bullet on its OWN line using a real newline character (\\n) inside the brief string. Never run a header or bullet inline after other text. Example of the exact shape:
  "**Two commitments due this week — one's on fire.**\\n\\n## :fire: Needs you today\\n- **Gerber (Major)** — orders auto-reassigning off Steve. → Pull the routing config today.\\n\\n## :win: Good news\\n- **Power Auto Parts** trending back to healthy."

Voice rules:
- Sound like a smart friend who's been watching their book — direct, a little dry, genuinely invested
- End urgent items with the next concrete physical action ("pull the routing config," "ping Trey before 2pm"), not just the diagnosis
- Name specific accounts, tasks, and people. Never say "one account" when you know which one
- You can have opinions: "that's a real fire," "worth a 15-minute sweep," "don't let this slide"
- No corporate words: not "warrants," "tension point," "resource-constrained," "flag before end-of-day"
- Vary sentence length — short punches and longer observations. Monotone rhythm is boring
- Major-tier accounts carry the most revenue. Lead with them when surfacing risks. Don't bury a Major issue behind Mid or Growth items
- When an account's tone is trending negative or a Major account has gone quiet, say so plainly
- When an account is trending worse (slipping from healthy to watching or at-risk), treat it as more urgent than a stable at-risk account. Momentum matters.
- When an account is recovering, briefly acknowledge the positive direction — it's worth noting.
- "COOLING TONE" means the last few meetings had mixed or negative sentiment — treat this as an early warning, especially on Major accounts. Mention it without alarm.
- "BLOCKER" in the relationship signals means someone is actively working against the deal or relationship — always surface a blocker if present.
- "Champion" means an advocate — useful context when discussing next steps on that account.
- "Portfolio-wide themes" means the same topic came up across multiple accounts in recent meetings. This is a signal worth naming — e.g., "pricing came up on 4 accounts this month" is a portfolio pattern worth raising to management.

Also return a "callouts" JSON array — one object per specific account or task worth a tap. Each object:
{
  "account_name": exact account name as given, or null if this is about a project/task with no single account,
  "tier": "major" | "mid" | "growth" | null,
  "priority": "now" | "this_week" | "watch",
  "action": "1-3 word verb phrase e.g. Diagnose routing / Call back / Unblock",
  "reason": "one short phrase",
  "item": "the specific task, project, or commitment text, or null"
}
Rules for callouts:
- Every callout MUST have either account_name or item populated — never both null
- If the callout is about a stuck project, set item to the project title so it isn't anonymous
- "now" = needs attention today. "this_week" = important but not on fire. "watch" = keep an eye on it
- Sort by priority: now first, then this_week, then watch

Return ONLY valid JSON: { "brief": "...", "callouts": [...] }`;

  try {
    var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    var msg = await client.messages.create({
      // Sonnet: the daily brief synthesizes risk/triage across the whole
      // portfolio once per day (cached) — reasoning-heavy, low-frequency.
      model: process.env.PIP_DAILY_BRIEF_MODEL || "claude-sonnet-4-6",
      // 1400 (was 600): Sonnet writes a fuller brief + richer callouts than
      // Haiku did. 600 truncated the JSON mid-array → parse failed → the raw
      // JSON string leaked into the UI. This comfortably fits brief + callouts.
      max_tokens: 1400,
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
      // Output was truncated or wrapped in stray prose. NEVER dump raw JSON
      // into the UI — salvage the "brief" string via regex and drop callouts
      // (the array is the part most likely cut off mid-element).
      var m = raw.match(/"brief"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      var salvaged = m ? m[1].replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim() : "";
      parsed = { brief: salvaged, callouts: [] };
    }

    return res.status(200).json({
      brief:    parsed.brief    || "",
      callouts: parsed.callouts || [],
    });
  } catch (e) {
    console.error("[portfolio-brief]", e);
    return res.status(500).json({ error: e.message });
  }
}
