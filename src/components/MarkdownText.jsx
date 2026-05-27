var BOLD_ITAL = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*[^*\s]|[^*\s])\*)/g;

function renderInline(text, keyBase) {
  var out = [];
  var last = 0;
  var m;
  var k = 0;
  while ((m = BOLD_ITAL.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] != null) {
      out.push(<strong key={keyBase + "-" + (k++)}>{m[2]}</strong>);
    } else {
      out.push(<em key={keyBase + "-" + (k++)}>{m[3]}</em>);
    }
    last = BOLD_ITAL.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

export function MarkdownText({ text, style }) {
  if (!text) return null;
  var lines = text.split("\n");
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
                fontSize: "1.05em",
                fontWeight: 700,
                marginTop: idx ? 14 : 0,
                marginBottom: 6,
              }}
            >
              {renderInline(b.v, "h2-" + idx)}
            </div>
          );
        }
        if (b.t === "h3") {
          return (
            <div
              key={idx}
              style={{
                fontSize: "1em",
                fontWeight: 700,
                marginTop: idx ? 10 : 0,
                marginBottom: 4,
              }}
            >
              {renderInline(b.v, "h3-" + idx)}
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
                    {renderInline(item, "li-" + idx + "-" + j)}
                  </li>
                );
              })}
            </ul>
          );
        }
        return (
          <p key={idx} style={{ margin: idx ? "6px 0" : "0 0 6px" }}>
            {renderInline(b.v, "p-" + idx)}
          </p>
        );
      })}
    </div>
  );
}
