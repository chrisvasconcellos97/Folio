// Best-effort source-map decoder.
//
// The app ships MINIFIED, so a runtime crash stack looks like
//   at https://folioshq.com/assets/index-XXXX.js:258:663
// which is useless on its own. Folios is built with `sourcemap: "hidden"`
// (vite.config.js), so a matching `index-XXXX.js.map` is served next to the
// bundle — we fetch it and translate the frame back to the real source file
// + line (e.g. src/views/home/HomeView.jsx:142:8).
//
// EVERYTHING here is best-effort: if a map is missing (e.g. running against a
// build that predates the hidden-sourcemap change), or the network hiccups, or
// the `source-map` package isn't installed, we silently return the original
// text. Decoding must never break a stress run.

let SourceMapConsumer = null;
let smLoadTried = false;

async function loadSourceMap() {
  if (smLoadTried) return SourceMapConsumer;
  smLoadTried = true;
  try {
    const mod = await import("source-map");
    SourceMapConsumer = mod.SourceMapConsumer || (mod.default && mod.default.SourceMapConsumer) || null;
  } catch (_) {
    SourceMapConsumer = null; // package not installed — degrade gracefully
  }
  return SourceMapConsumer;
}

// Matches a frame like  https://host/assets/index-XXXX.js:258:663
const FRAME_RE = /(https?:\/\/[^\s)]+?\.js):(\d+):(\d+)/g;

const mapCache = new Map();   // jsUrl -> SourceMapConsumer | null

async function consumerFor(jsUrl) {
  if (mapCache.has(jsUrl)) return mapCache.get(jsUrl);
  const SMC = await loadSourceMap();
  if (!SMC) { mapCache.set(jsUrl, null); return null; }
  let consumer = null;
  try {
    const res = await fetch(jsUrl + ".map");
    if (res.ok) {
      const raw = await res.json();
      consumer = await new SMC(raw);
    }
  } catch (_) {
    consumer = null;
  }
  mapCache.set(jsUrl, consumer);
  return consumer;
}

// Decode every minified frame inside an arbitrary text blob (a stack trace,
// a cluster sample, etc). Appends "  →  src/file:line:col" after each frame
// it can resolve; leaves everything else untouched.
export async function decodeStack(text) {
  if (!text || typeof text !== "string") return text;
  const frames = [...text.matchAll(FRAME_RE)];
  if (frames.length === 0) return text;

  const seen = new Set();
  const additions = [];
  for (const f of frames) {
    const [whole, jsUrl, lineStr, colStr] = f;
    if (seen.has(whole)) continue;
    seen.add(whole);
    try {
      const consumer = await consumerFor(jsUrl);
      if (!consumer) continue;
      const pos = consumer.originalPositionFor({ line: Number(lineStr), column: Number(colStr) });
      if (pos && pos.source) {
        const clean = String(pos.source).replace(/^.*?\/src\//, "src/").replace(/^\.\.\//, "");
        additions.push(`${clean}:${pos.line}${pos.column != null ? ":" + pos.column : ""}${pos.name ? " (" + pos.name + ")" : ""}`);
      }
    } catch (_) { /* skip this frame */ }
  }
  if (additions.length === 0) return text;
  return text + "\n    ↳ decoded: " + additions.join("  ←  ");
}

// Free any wasm-backed consumers (source-map v0.7 holds native handles).
export function disposeSourceMaps() {
  for (const c of mapCache.values()) {
    try { if (c && c.destroy) c.destroy(); } catch (_) {}
  }
  mapCache.clear();
}
