// Shared Pip usage logging — used by /api/pip, /api/ask-pip,
// /api/pip-state-refresh. Best-effort: a failed insert NEVER blocks the
// user-facing request, it just gets swallowed (console.error only).
//
// Two channels per call:
//   1. console.log("[pip-usage]", {...})   — structured stdout for Vercel logs
//   2. supabase.insert into folio_pip_usage — for the in-app spend tile
//
// Pricing reference (Anthropic public, per-million-token, May 2026):
//   claude-haiku-4-5-20251001 — input $1.00 / output $5.00
//     cache read  10% of input  → $0.10 / M
//     cache write 125% of input → $1.25 / M
//   claude-sonnet-4-6          — input $3.00 / output $15.00
//     cache read  $0.30 / M, cache write $3.75 / M
//
// Stored in **micro-cents** = cents × 10,000 to keep DB arithmetic in
// integers regardless of how small individual call costs are. Display side
// divides by 1,000,000 to render dollars.

// Cents per 1k tokens.
var COST_PER_K_TOK = {
  "claude-haiku-4-5-20251001":  { in: 0.0001, out: 0.0005 },
  "claude-sonnet-4-6":          { in: 0.0003, out: 0.0015 },
};
var CACHE_READ_DISCOUNT  = 0.1;
var CACHE_WRITE_PREMIUM  = 1.25;

export function estimateCostCents(model, usage) {
  if (!usage) return 0;
  var p = COST_PER_K_TOK[model];
  if (!p) return 0;
  var inputTokens  = usage.input_tokens || 0;
  var outputTokens = usage.output_tokens || 0;
  var cacheRead    = usage.cache_read_input_tokens || 0;
  var cacheCreate  = usage.cache_creation_input_tokens || 0;
  var billedInput  = inputTokens
                   + cacheRead   * CACHE_READ_DISCOUNT
                   + cacheCreate * CACHE_WRITE_PREMIUM;
  return (billedInput / 1000) * p.in + (outputTokens / 1000) * p.out;
}

// supabaseClient: user-scoped client (auth token attached) so the insert
// passes RLS. If logging fails we never raise — pricing visibility is a
// nice-to-have, not a request prerequisite.
export function logPipUsage(supabaseClient, userId, endpoint, mode, model, usage) {
  if (!usage) return;
  var costCents = estimateCostCents(model, usage);
  var costMicroCents = Math.round(costCents * 10000);

  // Structured stdout — searchable in Vercel logs.
  try {
    var hash = (userId || "").slice(0, 8);
    console.log("[pip-usage]", JSON.stringify({
      user_id_hash: hash,
      endpoint: endpoint,
      mode: mode,
      model: model,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_read_tokens: usage.cache_read_input_tokens || 0,
      cache_creation_tokens: usage.cache_creation_input_tokens || 0,
      total_cost_cents: Number(costCents.toFixed(6)),
    }));
  } catch (e) { /* swallow */ }

  // Fire-and-forget DB insert — must never block. If supabaseClient is null
  // (no auth client available for some reason), skip silently.
  if (!supabaseClient || !userId) return;
  try {
    supabaseClient
      .from("folio_pip_usage")
      .insert([{
        user_id:               userId,
        endpoint:              endpoint,
        mode:                  mode || null,
        model:                 model,
        input_tokens:          usage.input_tokens || 0,
        output_tokens:         usage.output_tokens || 0,
        cache_read_tokens:     usage.cache_read_input_tokens || 0,
        cache_creation_tokens: usage.cache_creation_input_tokens || 0,
        cost_micro_cents:      costMicroCents,
      }])
      .then(function (r) {
        if (r && r.error) console.error("[pip-usage] insert failed:", r.error.message);
      }, function (err) {
        console.error("[pip-usage] insert threw:", err && err.message);
      });
  } catch (err) {
    console.error("[pip-usage] insert outer threw:", err && err.message);
  }
}
