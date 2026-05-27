import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  var authHeader = req.headers.authorization || "";
  var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  var anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  var { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

  var { email, role, orgId, appUrl } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  if (!orgId) return res.status(400).json({ error: "orgId required" });

  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  var adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    var { data: org, error: orgError } = await adminClient
      .from("folio_orgs")
      .select("name")
      .eq("id", orgId)
      .single();
    if (orgError || !org) return res.status(400).json({ error: "Org not found" });

    var orgName = org.name;
    var inviterEmail = user.email || "a teammate";
    var signupUrl = (appUrl || "https://folioshq.com").replace(/\/$/, "") + "/";
    var roleLabel = role === "director" ? "Director" : "Member";

    var subject = "You've been invited to " + orgName + " on Folio";
    var html = [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">',
      '<h1 style="font-size:22px;margin:0 0 16px;font-weight:600;">You\'re invited to ' + escapeHtml(orgName) + '</h1>',
      '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">',
      escapeHtml(inviterEmail) + ' added you to <strong>' + escapeHtml(orgName) + '</strong> on Folio as a <strong>' + roleLabel + '</strong>.',
      '</p>',
      '<p style="font-size:15px;line-height:1.6;margin:0 0 24px;">',
      'Sign up with this email address (<strong>' + escapeHtml(email) + '</strong>) and your invite will be waiting for you to accept.',
      '</p>',
      '<p style="margin:0 0 24px;">',
      '<a href="' + signupUrl + '" style="display:inline-block;background:#4A9B82;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">Open Folio</a>',
      '</p>',
      '<p style="font-size:13px;line-height:1.6;color:#666;margin:0;">Folio — year-round account management.</p>',
      '</div>',
    ].join("");

    var resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Folio <onboarding@resend.dev>",
        to: [email],
        subject: subject,
        html: html,
        reply_to: user.email || undefined,
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
