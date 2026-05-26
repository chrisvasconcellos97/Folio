import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  var authHeader = req.headers.authorization || "";
  var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  // Verify the inviting user is authenticated
  var anonClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  var { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

  var { email, role, orgId } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  var adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    var { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { org_id: orgId, invited_role: role },
    });
    if (inviteError) return res.status(400).json({ error: inviteError.message });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Invite error:", err);
    res.status(500).json({ error: "Invite failed" });
  }
}
