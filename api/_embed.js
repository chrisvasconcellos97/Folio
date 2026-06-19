// Shared embedding seam — the ONE place F6 talks to an embeddings provider.
//
// Default provider: OpenAI text-embedding-3-small (1536 dims), called via plain
// fetch (no SDK dependency). Server-side only (Vercel), so the corporate-proxy
// block that bans client-side third-party calls doesn't apply.
//
// KEY-OPTIONAL BY DESIGN (Sanity-Pass Rule #2): if OPENAI_API_KEY is unset, every
// function here returns null/empty rather than throwing. embed-sync no-ops and
// recall is skipped — Pip is never broken by F6, it just has no recall until the
// key is configured in Vercel.
//
// Swapping to Voyage AI (Anthropic's recommended partner) later is a change to
// this one file only.

export var EMBED_MODEL = process.env.PIP_EMBED_MODEL || "text-embedding-3-small";
export var EMBED_DIMS  = 1536;

var OPENAI_URL = "https://api.openai.com/v1/embeddings";
var MAX_BATCH  = 96;            // inputs per request (well under the API ceiling)
var FETCH_TIMEOUT_MS = 20000;

export function embeddingsConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

function fetchWithTimeout(url, opts, ms) {
  var ctrl = new AbortController();
  var to = setTimeout(function () { ctrl.abort(); }, ms);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
    .finally(function () { clearTimeout(to); });
}

// Embed an array of strings. Returns:
//   { vectors: number[][], usage: { input_tokens } }  on success
//   null                                                on any failure / no key
// Order of `vectors` matches the input order. Empty input → empty vectors.
export async function embedTexts(texts) {
  if (!embeddingsConfigured()) return null;
  var inputs = (Array.isArray(texts) ? texts : [])
    .map(function (t) { return typeof t === "string" ? t : ""; })
    .filter(function (t) { return t.length > 0; });
  if (!inputs.length) return { vectors: [], usage: { input_tokens: 0 } };

  var allVectors = [];
  var totalTokens = 0;
  try {
    for (var i = 0; i < inputs.length; i += MAX_BATCH) {
      var batch = inputs.slice(i, i + MAX_BATCH);
      var resp = await fetchWithTimeout(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
      }, FETCH_TIMEOUT_MS);
      if (!resp.ok) {
        var detail = "";
        try { detail = await resp.text(); } catch (e) { /* guard-ok: best-effort error body */ }
        console.error("[embed] provider error", resp.status, String(detail).slice(0, 200));
        return null;
      }
      var json = await resp.json();
      // data comes back in input order with an `index` field; sort to be safe.
      var data = (json && Array.isArray(json.data)) ? json.data.slice() : [];
      data.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
      data.forEach(function (d) { if (d && Array.isArray(d.embedding)) allVectors.push(d.embedding); });
      if (json && json.usage) totalTokens += (json.usage.prompt_tokens || json.usage.total_tokens || 0);
    }
  } catch (err) {
    console.error("[embed] request failed:", err && err.message);
    return null;
  }

  if (allVectors.length !== inputs.length) {
    console.error("[embed] vector count mismatch", allVectors.length, "vs", inputs.length);
    return null;
  }
  return { vectors: allVectors, usage: { input_tokens: totalTokens } };
}

// Embed a single string. Returns the vector (number[]) or null.
export async function embedOne(text) {
  var r = await embedTexts([text]);
  if (!r || !r.vectors || !r.vectors.length) return null;
  return r.vectors[0];
}
