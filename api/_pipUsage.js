// Shared Pip usage logging — used by all Pip API endpoints. Best-effort: a
// failed insert NEVER blocks the user-facing request, it just gets swallowed
// (console.error only).
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

// Cents per 1k tokens = $/M × 0.1.
// Haiku $1/M in, $5/M out → 0.1 / 0.5 cents per 1k.
// Sonnet $3/M in, $15/M out → 0.3 / 1.5 cents per 1k.
var COST_PER_K_TOK = {
  "claude-haiku-4-5-20251001":  { in: 0.1,  out: 0.5  },
  "claude-sonnet-4-6":          { in: 0.3,  out: 1.5  },
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

// Daily spend cap helper.
//
// Returns true when the user has already spent >= PIP_DAILY_SPEND_CAP_CENTS
// today (ET day boundary, same convention as operator-run). Callers should
// degrade Sonnet → Haiku when this returns true, never outright block.
//
// Uses a simple DB SUM query on folio_pip_usage. If the query fails (network,
// RLS, table missing) we return false (fail open) — better to overspend
// slightly than to break Pip for the user.
//
// Default cap: 200 cents = $2.00 / day. Override via PIP_DAILY_SPEND_CAP_CENTS
// env var (integer cents).
var DEFAULT_DAILY_CAP_CENTS = 200;

export async function overDailySpendCap(supabaseClient, userId) {
  if (!supabaseClient || !userId) return false;
  try {
    var cap = parseInt(process.env.PIP_DAILY_SPEND_CAP_CENTS || String(DEFAULT_DAILY_CAP_CENTS), 10);
    if (isNaN(cap) || cap <= 0) return false;
    // ET date (mirrors operator-run's local-date logic).
    var now    = new Date();
    var etDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    // Compute the actual ET offset (handles EST -05:00 vs EDT -04:00 automatically).
    var etOffset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", timeZoneName: "shortOffset",
    }).formatToParts(now).find(function (p) { return p.type === "timeZoneName"; }).value
      .replace("GMT", ""); // e.g. "-05:00" or "-04:00"
    // folio_pip_usage has a created_at timestamptz column. We filter to rows
    // where created_at falls within the current ET day.
    var dayStart = etDate + "T00:00:00" + etOffset;
    var dayEnd   = etDate + "T23:59:59" + etOffset;
    var r = await supabaseClient
      .from("folio_pip_usage")
      .select("cost_micro_cents")
      .eq("user_id", userId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);
    if (r.error) return false;
    var rows = r.data || [];
    var totalMicroCents = rows.reduce(function (s, row) { return s + (row.cost_micro_cents || 0); }, 0);
    var totalCents = totalMicroCents / 10000;
    if (totalCents >= cap) {
      console.log("[pip-spend-cap] user", userId.slice(0, 8), "at", totalCents.toFixed(4), "cents — cap", cap, "cents — degrading to Haiku");
      return true;
    }
    return false;
  } catch (err) {
    console.error("[pip-spend-cap] check failed:", err && err.message);
    return false; // fail open
  }
}
