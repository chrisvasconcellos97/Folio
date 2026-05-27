// Server-Sent Events consumer for /api/pip streaming responses.
// The server emits a simple custom protocol:
//   event: delta      data: { text: "..." }
//   event: meta       data: { mode, ... }
//   event: tool_use   data: { id, name, input }    (Phase 2 — native tool use)
//   event: done       data: { content, tool_calls, meta }
//   event: error      data: { error: "..." }
//
// Usage:
//   var stream = await streamPip(url, body, headers, onDelta, onToolUse);
//   // stream.content   -> full assistant text after stream ends
//   // stream.toolCalls -> array of { id, name, input } collected during the stream

function parseEvent(chunk) {
  // chunk is one full SSE event terminated by blank line.
  var lines = chunk.split(/\r?\n/);
  var event = "message";
  var dataLines = [];
  lines.forEach(function (line) {
    if (line.indexOf("event:") === 0) event = line.slice(6).trim();
    else if (line.indexOf("data:") === 0) dataLines.push(line.slice(5).trim());
  });
  if (dataLines.length === 0) return null;
  var dataStr = dataLines.join("\n");
  try {
    return { event: event, data: JSON.parse(dataStr) };
  } catch (e) {
    return { event: event, data: dataStr };
  }
}

export function streamPip(url, body, headers, onDelta, onToolUse) {
  return fetch(url, {
    method:  "POST",
    headers: headers,
    body:    JSON.stringify(body),
  }).then(function (res) {
    if (res.status === 429) {
      return Promise.reject(new Error("Pip is busy, try again in a moment"));
    }
    if (!res.ok) {
      return res.text().then(function (txt) {
        throw new Error("Pip proxy error: " + res.status + " " + txt);
      });
    }
    // If the server didn't actually stream, fall back to JSON parse.
    var ctype = res.headers.get("content-type") || "";
    if (ctype.indexOf("text/event-stream") === -1) {
      return res.json().then(function (j) {
        if (onDelta && j.content) onDelta(j.content);
        var toolCalls = Array.isArray(j.tool_calls) ? j.tool_calls : [];
        if (onToolUse) toolCalls.forEach(onToolUse);
        return { content: j.content || "", toolCalls: toolCalls, meta: j.meta || null };
      });
    }
    if (!res.body || !res.body.getReader) {
      // No ReadableStream support — buffer text.
      return res.text().then(function (txt) {
        return consumeBuffered(txt, onDelta, onToolUse);
      });
    }
    return readStream(res.body.getReader(), onDelta, onToolUse);
  });
}

function readStream(reader, onDelta, onToolUse) {
  var decoder = new TextDecoder();
  var buffer = "";
  var fullText = "";
  var meta = null;
  var toolCalls = [];
  function pump() {
    return reader.read().then(function (r) {
      if (r.done) return { content: fullText, toolCalls: toolCalls, meta: meta };
      buffer += decoder.decode(r.value, { stream: true });
      // Split on double-newline boundaries (SSE event separator).
      var parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop(); // last part may be incomplete
      parts.forEach(function (raw) {
        var evt = parseEvent(raw);
        if (!evt) return;
        if (evt.event === "delta" && evt.data && evt.data.text) {
          fullText += evt.data.text;
          if (onDelta) onDelta(evt.data.text);
        } else if (evt.event === "tool_use" && evt.data) {
          toolCalls.push(evt.data);
          if (onToolUse) onToolUse(evt.data);
        } else if (evt.event === "done" && evt.data) {
          if (evt.data.content) fullText = evt.data.content;
          if (Array.isArray(evt.data.tool_calls) && evt.data.tool_calls.length) {
            // Trust the `done` payload if it has tool calls — it's authoritative.
            toolCalls = evt.data.tool_calls;
          }
          if (evt.data.meta) meta = evt.data.meta;
        } else if (evt.event === "meta" && evt.data) {
          meta = evt.data;
        } else if (evt.event === "error" && evt.data) {
          throw new Error(evt.data.error || "Pip stream error");
        }
      });
      return pump();
    });
  }
  return pump();
}

function consumeBuffered(text, onDelta, onToolUse) {
  var chunks = text.split(/\r?\n\r?\n/);
  var fullText = "";
  var meta = null;
  var toolCalls = [];
  chunks.forEach(function (raw) {
    var evt = parseEvent(raw);
    if (!evt) return;
    if (evt.event === "delta" && evt.data && evt.data.text) {
      fullText += evt.data.text;
      if (onDelta) onDelta(evt.data.text);
    } else if (evt.event === "tool_use" && evt.data) {
      toolCalls.push(evt.data);
      if (onToolUse) onToolUse(evt.data);
    } else if (evt.event === "done" && evt.data) {
      if (evt.data.content) fullText = evt.data.content;
      if (Array.isArray(evt.data.tool_calls) && evt.data.tool_calls.length) {
        toolCalls = evt.data.tool_calls;
      }
      if (evt.data.meta) meta = evt.data.meta;
    }
  });
  return { content: fullText, toolCalls: toolCalls, meta: meta };
}
