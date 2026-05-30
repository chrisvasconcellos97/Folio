#!/usr/bin/env node
/**
 * Generate styled PDFs from every markdown doc in /docs.
 *
 * - Reads docs/*.md (skips the README index)
 * - Wraps each with a Folios-branded header (Pip logo + product name)
 * - Applies docs/pdf-style.css with @font-face declarations injecting
 *   local @fontsource fonts via file:// URLs (no CDN, per CLAUDE.md)
 * - Writes output to docs/pdf/*.pdf
 *
 * Run with: npm run docs:pdf
 *
 * Requires Chromium (downloaded automatically by puppeteer on first run).
 */
import { mdToPdf } from "md-to-pdf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

var __filename = fileURLToPath(import.meta.url);
var __dirname  = path.dirname(__filename);
var ROOT       = path.resolve(__dirname, "..");
var DOCS_DIR   = path.join(ROOT, "docs");
var OUT_DIR    = path.join(DOCS_DIR, "pdf");
var STYLE_PATH = path.join(DOCS_DIR, "pdf-style.css");
var LOGO_PATH  = path.join(DOCS_DIR, "assets", "pip-logo.svg");

// Skip the index README and any nested directories.
function listDocs() {
  return fs.readdirSync(DOCS_DIR)
    .filter(function (f) { return f.endsWith(".md") && f !== "README.md"; })
    .map(function (f) { return path.join(DOCS_DIR, f); });
}

// Inject local-font @font-face declarations into the stylesheet so the
// rendered PDF uses Fraunces / Inter / JetBrains Mono without a CDN call.
function buildFontFaceCss() {
  var base = path.join(ROOT, "node_modules", "@fontsource-variable");
  var faces = [
    {
      family: "Fraunces",
      file:   "fraunces/files/fraunces-latin-wght-normal.woff2",
      weight: "100 900",
      style:  "normal",
    },
    {
      family: "Inter",
      file:   "inter/files/inter-latin-wght-normal.woff2",
      weight: "100 900",
      style:  "normal",
    },
    {
      family: "JetBrains Mono",
      file:   "jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
      weight: "100 800",
      style:  "normal",
    },
  ];

  return faces.map(function (f) {
    var full = path.join(base, f.file);
    if (!fs.existsSync(full)) {
      console.warn("[build-docs-pdf] font missing: " + full + " — falling back to system");
      return "";
    }
    return [
      "@font-face {",
      "  font-family: '" + f.family + "';",
      "  src: url('file://" + full + "') format('woff2');",
      "  font-weight: " + f.weight + ";",
      "  font-style: "  + f.style  + ";",
      "  font-display: block;",
      "}",
    ].join("\n");
  }).filter(Boolean).join("\n\n");
}

function buildCss() {
  var base = fs.readFileSync(STYLE_PATH, "utf8");
  return buildFontFaceCss() + "\n\n" + base;
}

// Read the doc title from its first h1 line, then strip that h1 from the
// body so we can render our own branded header above it. Falls back to a
// titlecased filename if no h1 exists.
function extractTitleAndBody(mdPath) {
  var raw = fs.readFileSync(mdPath, "utf8");
  var match = raw.match(/^#\s+(.+)$/m);
  var title = match ? match[1].trim() : path.basename(mdPath, ".md");
  var body  = match ? raw.replace(match[0], "").trim() : raw;
  return { title: title, body: body };
}

// Build the HTML header that goes at the top of every PDF.
function headerHtml(title) {
  var logoData = fs.readFileSync(LOGO_PATH, "utf8");
  // Embed the SVG inline so we never depend on a file path at render time.
  return [
    '<div class="doc-header">',
    '  <div>' + logoData + '</div>',
    '  <div>',
    '    <div class="brand">' + escapeHtml(title) + '</div>',
    '    <div class="tag">Folios · folioshq.com</div>',
    '  </div>',
    '</div>',
  ].join("\n");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function build() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  var css = buildCss();
  var docs = listDocs();
  console.log("[build-docs-pdf] generating " + docs.length + " PDFs → " + OUT_DIR);

  for (var i = 0; i < docs.length; i++) {
    var mdPath = docs[i];
    var name   = path.basename(mdPath, ".md");
    var outPdf = path.join(OUT_DIR, name + ".pdf");
    var meta   = extractTitleAndBody(mdPath);

    // md-to-pdf accepts either { path } (file) or { content } (string).
    // We use content so we can prepend the branded header HTML.
    var content = headerHtml(meta.title) + "\n\n" + meta.body;

    var result = await mdToPdf(
      { content: content },
      {
        dest:          outPdf,
        css:           css,
        body_class:    ["folios-doc"],
        marked_options: { headerIds: false },
        launch_options: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
        pdf_options: {
          format:         "Letter",
          printBackground: true,
          margin: { top: "0in", bottom: "0in", left: "0in", right: "0in" },
          displayHeaderFooter: true,
          headerTemplate: '<div></div>',
          footerTemplate:
            '<div style="font-family: Inter, sans-serif; font-size: 8pt; color: #9aa39e; ' +
            'width: 100%; padding: 0 0.9in 0.4in; text-align: right; letter-spacing: 0.04em;">' +
            'Folios · <span class="pageNumber"></span> / <span class="totalPages"></span>' +
            '</div>',
        },
      }
    );

    if (result === false) {
      console.error("[build-docs-pdf] failed: " + name);
      continue;
    }
    console.log("  ✓ " + name + ".pdf");
  }

  console.log("[build-docs-pdf] done.");
}

build().catch(function (err) {
  console.error("[build-docs-pdf] error:", err);
  process.exit(1);
});
