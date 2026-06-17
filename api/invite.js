import { createClient } from "@supabase/supabase-js";

// Resend HTTP call — headroom over Vercel's 10s default.
export const config = { maxDuration: 15 };

// Per-user invite rate limit (in-memory, single instance): 10 per 10 min.
// Without it an authenticated user could flood arbitrary addresses via Resend.
var INVITE_RATE = new Map();
var INVITE_WINDOW_MS = 10 * 60 * 1000;
var INVITE_MAX = 10;

// Allowlist the app origin embedded in the invite email — never trust a
// client-supplied appUrl (phishing-link vector on Folios-branded mail).
var ALLOWED_APP_ORIGINS = ["https://folioshq.com", "http://localhost:5173"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  var authHeader = req.headers.authorization || "";
  var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  var { email, role, orgId, appUrl } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: "invalid email" });
  if (!orgId) return res.status(400).json({ error: "orgId required" });

  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "RESEND_API_KEY not configured" });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  try {
    var anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

    // Rate limit per user (sliding 10-min window).
    var nowTs = Date.now();
    var hist = (INVITE_RATE.get(user.id) || []).filter(function (t) { return nowTs - t < INVITE_WINDOW_MS; });
    if (hist.length >= INVITE_MAX) return res.status(429).json({ error: "Too many invites — try again in a bit." });
    hist.push(nowTs);
    INVITE_RATE.set(user.id, hist);

    var adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    var { data: org, error: orgError } = await adminClient
      .from("folio_orgs")
      .select("name, owner_id")
      .eq("id", orgId)
      .single();
    if (orgError || !org) return res.status(400).json({ error: "Org not found" });

    // Authorization: only the org owner or an accepted owner/member may invite.
    // Without this any authenticated user could send invite emails for any org.
    if (org.owner_id !== user.id) {
      var { data: membership } = await adminClient
        .from("folio_org_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .eq("accepted", true)
        .in("role", ["owner", "member"])
        .maybeSingle();
      if (!membership) return res.status(403).json({ error: "Not authorized to invite to this org" });
    }

    var orgName = org.name;
    var inviterEmail = user.email || "a teammate";
    var cleanedAppUrl = String(appUrl || "").replace(/\/$/, "");
    var signupUrl = (ALLOWED_APP_ORIGINS.indexOf(cleanedAppUrl) !== -1 ? cleanedAppUrl : "https://folioshq.com") + "/";
    var roleLabel = role === "leadership" ? "Leadership" : "Member";

    var subject = "You've been invited to " + orgName + " on Folios";
    var html = [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">',
      '<h1 style="font-size:22px;margin:0 0 16px;font-weight:600;">You\'re invited to ' + escapeHtml(orgName) + '</h1>',
      '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">',
      escapeHtml(inviterEmail) + ' added you to <strong>' + escapeHtml(orgName) + '</strong> on Folios as a <strong>' + roleLabel + '</strong>.',
      '</p>',
      '<p style="font-size:15px;line-height:1.6;margin:0 0 24px;">',
      'Sign up with this email address (<strong>' + escapeHtml(email) + '</strong>) and your invite will be waiting for you to accept.',
      '</p>',
      '<p style="margin:0 0 24px;">',
      '<a href="' + signupUrl + '" style="display:inline-block;background:#4A9B82;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">Open Folios</a>',
      '</p>',
      '<p style="font-size:13px;line-height:1.6;color:#666;margin:0;">Folios — year-round account management.</p>',
      '</div>',
    ].join("");

    var resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Folios <invites@folioshq.com>",
        to: [email],
        subject: subject,
        html: html,
      }),
    });

    if (!resendRes.ok) {
      var errBody = await resendRes.text();
      console.error("Resend error:", resendRes.status, errBody);
      return res.status(502).json({ error: "Email send failed" });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Invite error:", err);
    res.status(500).json({ error: "Invite failed" });
  }
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
