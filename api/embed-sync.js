// F6 — embed-on-write / backfill sweep for semantic recall.
//
// POST { accountIds?: string[] }  (JWT auth)
// → Loads the user's meeting notes / summaries / project notes / account updates
//   for those accounts (or all the caller's active accounts), embeds the ones
//   whose content changed since last time, and upserts into folio_embeddings.
//
// EMBED ONCE: each source row carries a content_fingerprint (fnv1a of its full
// content). A source whose stored fingerprint is unchanged is skipped — so the
// daily client sweep is a near-free catch-up after the one-time backfill.
//
// KEY-OPTIONAL: with no OPENAI_API_KEY (or any provider failure), this no-ops
// cleanly — recall simply stays empty. Pip is never broken by F6.
//
// DATA LINE: embeds user-authored text verbatim (notes, project notes, updates)
// + the already-generalized Pip meeting summary. See docs/data-handling.md.

import { createClient } from "@supabase/supabase-js";
import { embedTexts, embeddingsConfigured, EMBED_MODEL } from "./_embed.js";
import { logPipUsage } from "./_pipUsage.js";

export const config = { maxDuration: 60 };

var MAX_ACCOUNTS = 100;
var MAX_MEETINGS = 400;
var MAX_UPDATES  = 400;
var CHUNK_CHARS  = 1500;
var MAX_CHUNKS   = 8;
var MIN_CONTENT  = 24;     // skip trivially short content

// Per-user rate limit — cap embed sweeps so a client loop can't burn credits.
var rateLimitMap = new Map();
var RL_WINDOW_MS = 60 * 1000;
var RL_MAX       = 6;
function isRateLimited(userId) {
  var now = Date.now();
  var ts = (rateLimitMap.get(userId) || []).filter(function (t) { return now - t < RL_WINDOW_MS; });
  if (ts.length >= RL_MAX) return true;
  ts.push(now);
  rateLimitMap.set(userId, ts);
  return false;
}

// Tiny FNV-1a string hash (same family as computeContextFingerprint). Change
// detection, not security.
function fnv1a(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

// Trim only — preserve internal whitespace + newlines (chunkContent splits on
// paragraph boundaries, and content is embedded ~verbatim).
function clean(s) {
  return typeof s === "string" ? s.trim() : "";
}

// Split content into <=CHUNK_CHARS pieces on paragraph boundaries, then hard-cut.
function chunkContent(text) {
  var t = clean(text);
  if (t.length <= CHUNK_CHARS) return [t];
  var paras = t.split(/\n\s*\n/);
  var chunks = [];
  var buf = "";
  paras.forEach(function (p) {
    if ((buf + "\n\n" + p).length > CHUNK_CHARS && buf) { chunks.push(buf); buf = p; }
    else { buf = buf ? buf + "\n\n" + p : p; }
  });
  if (buf) chunks.push(buf);
  // Hard-cut any oversized single paragraph.
  var out = [];
  chunks.forEach(function (c) {
    if (c.length <= CHUNK_CHARS) { out.push(c); return; }
    for (var i = 0; i < c.length; i += CHUNK_CHARS) out.push(c.slice(i, i + CHUNK_CHARS));
  });
  return out.slice(0, MAX_CHUNKS);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Not configured → succeed as a no-op so the client trigger never errors.
    if (!embeddingsConfigured()) {
      return res.status(200).json({ ok: true, embedded: 0, skipped: 0, note: "embeddings not configured" });
    }
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: "Supabase is not configured on this deployment." });
    }

    var authHeader = req.headers.authorization || "";
    var token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    var { data: authData, error: authError } = await supabase.auth.getUser(token);
    var user = authData && authData.user ? authData.user : null;
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

    if (isRateLimited(user.id)) {
      return res.status(429).json({ error: "Too many embed requests. Try again in a minute." });
    }

    // User-scoped client — the global Authorization header is what makes the
    // .from()/.insert()/.delete() calls run AS this user under RLS (not just getUser).
    var userClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: "Bearer " + token } },
        auth: { persistSession: false, autoRefreshToken: false } }
    );

    var body = req.body || {};
    var accountIds = Array.isArray(body.accountIds)
      ? body.accountIds.filter(function (x) { return typeof x === "string" && x.length > 0; })
      : null;

    // Resolve the account set. Fall back to the user's active accounts.
    if (!accountIds || !accountIds.length) {
      var accs = await userClient.from("folio_accounts")
        .select("id").eq("is_inactive", false).limit(MAX_ACCOUNTS);
      if (accs.error) throw accs.error;
      accountIds = (accs.data || []).map(function (a) { return a.id; });
    }
    accountIds = accountIds.slice(0, MAX_ACCOUNTS);
    if (!accountIds.length) return res.status(200).json({ ok: true, embedded: 0, skipped: 0 });

    // Load source rows + existing embeddings (just the keys/fingerprints).
    var pMtgs = userClient.from("folio_meetings")
      .select("id, account_id, notes, pip_summary, project_notes, meeting_date")
      .in("account_id", accountIds)
      .order("meeting_date", { ascending: false })
      .limit(MAX_MEETINGS);
    var pUpds = userClient.from("folio_account_updates")
      .select("id, account_id, title, description, update_date")
      .in("account_id", accountIds)
      .limit(MAX_UPDATES);
    var pProjTitles = userClient.from("gauge_projects")
      .select("id, title").limit(500);
    var pExisting = userClient.from("folio_embeddings")
      .select("source_type, source_id, content_fingerprint, chunk_index")
      .in("account_id", accountIds);

    var [mRes, uRes, ptRes, eRes] = await Promise.all([pMtgs, pUpds, pProjTitles, pExisting]);
    if (mRes.error) throw mRes.error;
    if (uRes.error) throw uRes.error;
    if (eRes.error) throw eRes.error;

    var meetings = mRes.data || [];
    var updates  = uRes.data || [];
    var projTitle = {};
    (ptRes.data || []).forEach(function (p) { projTitle[p.id] = p.title; });

    // Existing fingerprint per (source_type|source_id) — read from chunk 0.
    var existingFp = {};
    (eRes.data || []).forEach(function (e) {
      if (e.chunk_index === 0) existingFp[e.source_type + "|" + e.source_id] = e.content_fingerprint;
    });

    // Build the candidate source list.
    var sources = []; // { source_type, source_id, account_id, content }
    meetings.forEach(function (m) {
      var notes = clean(m.notes);
      if (notes.length >= MIN_CONTENT) sources.push({ source_type: "meeting_notes", source_id: m.id, account_id: m.account_id, content: notes });
      var summ = clean(m.pip_summary);
      if (summ.length >= MIN_CONTENT) sources.push({ source_type: "meeting_summary", source_id: m.id, account_id: m.account_id, content: summ });
      var pn = (m.project_notes && typeof m.project_notes === "object") ? m.project_notes : {};
      Object.keys(pn).forEach(function (projId) {
        var note = clean(pn[projId]);
        if (note.length < MIN_CONTENT) return;
        var title = projTitle[projId];
        var content = (title ? "Project: " + title + "\n" : "") + note;
        sources.push({ source_type: "project_note", source_id: m.id + ":" + projId, account_id: m.account_id, content: content });
      });
    });
    updates.forEach(function (u) {
      var content = clean([u.title, u.description].filter(Boolean).join("\n"));
      if (content.length >= MIN_CONTENT) sources.push({ source_type: "account_update", source_id: u.id, account_id: u.account_id, content: content });
    });

    // Fingerprint-gate: keep only changed/new sources.
    var changed = [];
    var skipped = 0;
    sources.forEach(function (s) {
      s.fp = fnv1a(s.content);
      var key = s.source_type + "|" + s.source_id;
      if (existingFp[key] && existingFp[key] === s.fp) { skipped++; return; }
      changed.push(s);
    });

    if (!changed.length) {
      return res.status(200).json({ ok: true, embedded: 0, skipped: skipped });
    }

    // Chunk every changed source, collect texts for one batched embed call.
    var chunkRecords = []; // { source, chunk_index, text }
    changed.forEach(function (s) {
      chunkContent(s.content).forEach(function (text, idx) {
        if (text && text.length) chunkRecords.push({ source: s, chunk_index: idx, text: text });
      });
    });
    if (!chunkRecords.length) {
      return res.status(200).json({ ok: true, embedded: 0, skipped: skipped });
    }

    var embedResult = await embedTexts(chunkRecords.map(function (c) { return c.text; }));
    if (!embedResult) {
      // Provider failure — degrade silently, nothing written.
      return res.status(200).json({ ok: true, embedded: 0, skipped: skipped, note: "embedding provider unavailable" });
    }
    logPipUsage(userClient, user.id, "embed-sync", "embed", EMBED_MODEL, { input_tokens: embedResult.usage.input_tokens, output_tokens: 0 });

    var nowIso = new Date().toISOString();
    var rows = chunkRecords.map(function (c, i) {
      return {
        user_id: user.id,
        source_type: c.source.source_type,
        source_id: c.source.source_id,
        account_id: c.source.account_id,
        chunk_index: c.chunk_index,
        content: c.text,
        content_fingerprint: c.source.fp,
        embedding: embedResult.vectors[i],
        updated_at: nowIso,
      };
    });

    // Delete stale chunks for the changed sources first (chunk counts can shrink),
    // grouped by source_type for a small number of .in() deletes.
    var byType = {};
    changed.forEach(function (s) {
      if (!byType[s.source_type]) byType[s.source_type] = [];
      byType[s.source_type].push(s.source_id);
    });
    for (var st in byType) {
      if (!Object.prototype.hasOwnProperty.call(byType, st)) continue;
      var del = await userClient.from("folio_embeddings")
        .delete().eq("source_type", st).in("source_id", byType[st]);
      if (del.error) throw del.error;
    }

    var ins = await userClient.from("folio_embeddings").insert(rows);
    if (ins.error) throw ins.error;

    return res.status(200).json({ ok: true, embedded: changed.length, chunks: rows.length, skipped: skipped });
  } catch (err) {
    console.error("embed-sync error:", err && err.message ? err.message : err);
    return res.status(500).json({ error: "embed-sync failed", detail: err && err.message ? err.message : String(err) });
  }
}
