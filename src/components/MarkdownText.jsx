import { PipGlyph, GLYPH_NAMES } from "./PipGlyph.jsx";

// Pip status glyph tokens (e.g. ":fire:") — only the whitelisted names match,
// so real text like "8:00" or "https://" is never touched.
var GLYPH_RE  = new RegExp(":(" + GLYPH_NAMES.join("|") + "):", "g");
var BOLD_ITAL = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*[^*\s]|[^*\s])\*)/g;

// Optional linkify(str, keyBase) lets a caller decorate plain text (e.g. wrap
// account names in <Glow> on the daily brief). Returns a node/array or null.
function applyLinkify(str, linkify, keyBase) {
  if (!linkify || !str) return str;
  var r = linkify(str, keyBase);
  return r == null ? str : r;
}

// Bold/italic pass over a plain (glyph-free) string; plain residuals run
// through linkify.
function renderFormatted(text, keyBase, linkify) {
  var out = [];
  var last = 0;
  var m;
  var k = 0;
  BOLD_ITAL.lastIndex = 0;
  while ((m = BOLD_ITAL.exec(text)) !== null) {
    if (m.index > last) out.push(applyLinkify(text.slice(last, m.index), linkify, keyBase + "-t" + k));
    if (m[2] != null) {
      out.push(<strong key={keyBase + "-b" + (k++)}>{applyLinkify(m[2], linkify, keyBase + "-bt" + k)}</strong>);
    } else {
      out.push(<em key={keyBase + "-i" + (k++)}>{applyLinkify(m[3], linkify, keyBase + "-it" + k)}</em>);
    }
    last = BOLD_ITAL.lastIndex;
  }
  if (last < text.length) out.push(applyLinkify(text.slice(last), linkify, keyBase + "-t" + k));
  return out;
}

function renderInline(text, keyBase, linkify) {
  var out = [];
  var last = 0;
  var m;
  var k = 0;
  GLYPH_RE.lastIndex = 0;
  while ((m = GLYPH_RE.exec(text)) !== null) {
    if (m.index > last) out = out.concat(renderFormatted(text.slice(last, m.index), keyBase + "-f" + k, linkify));
    out.push(<PipGlyph key={keyBase + "-g" + (k++)} name={m[1]} />);
    last = GLYPH_RE.lastIndex;
  }
  if (last < text.length) out = out.concat(renderFormatted(text.slice(last), keyBase + "-f" + k, linkify));
  return out.length ? out : text;
}

// Models don't reliably put real newlines inside a JSON string field — they
// often run "## Header - item - item" together on one line. Reconstruct line
// breaks from the inline markers so the structure renders no matter how the
// model spaced it. Already-newlined text passes through unchanged.
export function normalizeStructure(text) {
  return String(text)
    // a ## / ### header that isn't already starting a line
    .replace(/([^\n])[ \t]*(#{2,3}[ \t])/g, "$1\n$2")
    // a " - " bullet marker mid-line (spaces both sides → not "1-800" or em dash)
    .replace(/([^\n])[ \t]+-[ \t]+/g, "$1\n- ")
    // collapse runaway blank lines
    .replace(/\n{3,}/g, "\n\n");
}

export function MarkdownText({ text, style, linkify }) {
  if (!text) return null;
  var lines = normalizeStructure(text).split("\n");
  var blocks = [];
  var i = 0;
  while (i < lines.length) {
    var line  = lines[i];
    var trim  = line.trim();
    if (!trim) { i++; continue; }

    if (trim.indexOf("### ") === 0) {
      blocks.push({ t: "h3", v: trim.slice(4) }); i++;
    } else if (trim.indexOf("## ") === 0) {
      blocks.push({ t: "h2", v: trim.slice(3) }); i++;
    } else if (/^[-*]\s/.test(trim)) {
      var items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ t: "ul", v: items });
    } else {
      var para = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^[-*#]\s/.test(lines[i].trim()) &&
        !/^#{2,3}\s/.test(lines[i].trim())
      ) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push({ t: "p", v: para.join(" ") });
    }
  }

  return (
    <div style={style}>
      {blocks.map(function (b, idx) {
        if (b.t === "h2") {
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: "1.05em",
                fontWeight: 700,
                marginTop: idx ? 14 : 0,
                marginBottom: 6,
              }}
            >
              {renderInline(b.v, "h2-" + idx, linkify)}
            </div>
          );
        }
        if (b.t === "h3") {
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: "1em",
                fontWeight: 700,
                marginTop: idx ? 10 : 0,
                marginBottom: 4,
              }}
            >
              {renderInline(b.v, "h3-" + idx, linkify)}
            </div>
          );
        }
        if (b.t === "ul") {
          return (
            <ul
              key={idx}
              style={{ paddingLeft: 20, margin: idx ? "6px 0" : "0 0 6px" }}
            >
              {b.v.map(function (item, j) {
                return (
                  <li key={j} style={{ marginBottom: 3 }}>
                    {renderInline(item, "li-" + idx + "-" + j, linkify)}
                  </li>
                );
              })}
            </ul>
          );
        }
        return (
          <p key={idx} style={{ margin: idx ? "6px 0" : "0 0 6px" }}>
            {renderInline(b.v, "p-" + idx, linkify)}
          </p>
        );
      })}
    </div>
  );
}
