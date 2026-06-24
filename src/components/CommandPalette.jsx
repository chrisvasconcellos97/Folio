import { useState, useEffect, useRef } from "react";
import { C } from "../lib/colors";
import { supabase } from "../lib/supabase";

export function CommandPalette({ accounts, contacts, userId, onSelectAccount, onSelectContact, onNavigate, onClose }) {
  var [query, setQuery] = useState("");
  var [idx, setIdx] = useState(0);
  var [contentResults, setContentResults] = useState([]);
  var inputRef = useRef(null);
  var searchTimerRef = useRef(null);
  var listRef = useRef(null);

  useEffect(function() { if (inputRef.current) inputRef.current.focus(); }, []);

  var NAV_ITEMS = [
    { label: "Accounts",    action: function() { onNavigate("accounts"); } },
    { label: "Meetings",    action: function() { onNavigate("meetings"); } },
    { label: "Cadence",     action: function() { onNavigate("cadence"); } },
    { label: "Commitments", action: function() { onNavigate("commitments"); } },
    { label: "Gauge",       action: function() { onNavigate("gauge"); } },
    { label: "Pip",         action: function() { onNavigate("pip"); } },
  ];

  var q = query.trim().toLowerCase();
  var accountResults = q
    ? (accounts || []).filter(function(a) {
        return (a.name || "").toLowerCase().includes(q)
          || (a.tags && a.tags.some(function(t) { return t.toLowerCase().includes(q); }))
          || (a.region && a.region.toLowerCase().includes(q));
      }).slice(0, 6).map(function(a) {
        var sub = a.tier || a.region || "";
        if (a.is_inactive) sub = (sub ? sub + " · " : "") + (a.merged_into_account_id ? "Merged" : "Inactive");
        return { label: a.name, sub: sub, group: "Accounts", action: function() { onSelectAccount(a); } };
      })
    : [];
  var contactResults = q && contacts && onSelectContact
    ? contacts.filter(function(c) {
        return (c.name && c.name.toLowerCase().includes(q))
          || (c.email && c.email.toLowerCase().includes(q))
          || (c.title && c.title.toLowerCase().includes(q));
      }).slice(0, 6).map(function(c) {
        var acct = (accounts || []).find(function(a) { return a.id === c.account_id; });
        return {
          label: c.name,
          sub: (c.title ? c.title : "") + (acct ? (c.title ? " · " : "") + acct.name : ""),
          group: "Contacts",
          action: function() { onSelectContact(c); },
        };
      })
    : [];
  var navResults = NAV_ITEMS.filter(function(n) { return !q || n.label.toLowerCase().includes(q); })
    .map(function(n) { return Object.assign({}, n, { group: "Navigate" }); });
  var results = accountResults.concat(contactResults).concat(navResults).concat(contentResults);

  // Debounced async full-text search across meeting notes and open items
  useEffect(function () {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!userId || !q || q.length < 3) {
      setContentResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(function () {
      var accountById = {};
      (accounts || []).forEach(function (a) { accountById[a.id] = a; });

      // Meeting notes via Postgres full-text (stemming + multi-word), single
      // vendor, computed on the fly — falls back to substring on any error so a
      // search never comes back empty due to a query quirk.
      var meetingSearch = supabase
        .from("folio_meetings")
        .select("id, account_id, meeting_date, notes, pip_short_title")
        .eq("user_id", userId)
        .textSearch("notes", q, { type: "websearch", config: "english" })
        .limit(3)
        .then(function (r) {
          if (r && r.error) {
            return supabase
              .from("folio_meetings")
              .select("id, account_id, meeting_date, notes, pip_short_title")
              .eq("user_id", userId)
              .ilike("notes", "%" + q + "%")
              .limit(3);
          }
          return r;
        });

      var itemSearch = supabase
        .from("folio_tasks")
        .select("id, account_id, title, created_at")
        .eq("user_id", userId)
        .is("project_id", null)
        .eq("done", false)
        .ilike("title", "%" + q + "%")
        .limit(3);

      Promise.all([meetingSearch, itemSearch]).then(function (results) {
        var rows = [];
        var meetings = results[0].data || [];
        var items = results[1].data || [];

        meetings.forEach(function (m) {
          var acct = accountById[m.account_id];
          if (!acct) return;
          // Extract excerpt around the match
          var notes = m.notes || "";
          var matchIdx = notes.toLowerCase().indexOf(q);
          var start = Math.max(0, matchIdx - 40);
          var end = Math.min(notes.length, matchIdx + q.length + 60);
          var excerpt = (start > 0 ? "…" : "") + notes.slice(start, end).trim() + (end < notes.length ? "…" : "");
          rows.push({
            label: acct.name,
            sub: (m.pip_short_title || (m.meeting_date ? m.meeting_date.slice(0, 10) : "Meeting")) + " · " + excerpt.slice(0, 80),
            group: "Notes",
            action: function () { onSelectAccount(acct); },
          });
        });

        items.forEach(function (item) {
          var acct = accountById[item.account_id];
          if (!acct) return;
          rows.push({
            label: acct.name,
            sub: "Open item · " + (item.title || "").slice(0, 80),
            group: "Items",
            action: function () { onSelectAccount(acct); },
          });
        });

        setContentResults(rows);
      });
    }, 300);
  }, [q, userId, accounts]);

  useEffect(function() { setIdx(0); }, [query]);

  function scrollActiveIntoView(newIdx) {
    if (!listRef.current) return;
    var el = listRef.current.querySelector("#command-palette-item-" + newIdx);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function handleKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      var next = Math.min(idx + 1, results.length - 1);
      setIdx(next);
      scrollActiveIntoView(next);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      var prev = Math.max(idx - 1, 0);
      setIdx(prev);
      scrollActiveIntoView(prev);
    }
    if (e.key === "Enter" && results[idx]) { results[idx].action(); onClose(); }
    if (e.key === "Escape") { onClose(); }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120,
      }}
    >
      <div
        onClick={function(e) { e.stopPropagation(); }}
        style={{
          background: C.bgCard, border: "1px solid " + C.borderBright, borderRadius: 14,
          width: "100%", maxWidth: 480, boxShadow: "0 24px 60px var(--c-overlay-shadow)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + C.border }}>
          <input
            ref={inputRef}
            value={query}
            onChange={function(e) { setQuery(e.target.value); }}
            onKeyDown={handleKey}
            placeholder="Jump to account or view…"
            role="combobox"
            aria-label="Search accounts, contacts, or navigate"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={results[idx] ? "command-palette-item-" + idx : undefined}
            aria-autocomplete="list"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontSize: 16, color: C.text, fontFamily: "'Inter', system-ui, sans-serif",
            }}
          />
        </div>
        <div ref={listRef} id="command-palette-results" role="listbox" aria-label="Search results" style={{ maxHeight: 320, overflowY: "auto" }}>
          {results.length === 0 && (
            <div style={{ padding: "20px 16px", color: C.textMuted, fontSize: 13, textAlign: "center" }}>No results</div>
          )}
          {results.map(function(r, i) {
            var active = i === idx;
            var prevGroup = i > 0 ? results[i - 1].group : null;
            var showHeader = r.group && r.group !== prevGroup;
            return (
              <div key={i}>
                {showHeader && (
                  <div style={{
                    padding: "8px 16px 2px", fontSize: 9.5, fontWeight: 700,
                    color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em",
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  }}>
                    {r.group}
                  </div>
                )}
                <div
                  id={"command-palette-item-" + i}
                  role="option"
                  aria-selected={active}
                  onClick={function() { r.action(); onClose(); }}
                  style={{
                    padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center",
                    gap: 10, background: active ? C.accentFaint : "transparent",
                    borderLeft: "2px solid " + (active ? C.accent : "transparent"),
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: C.text, fontWeight: active ? 500 : 400 }}>{r.label}</div>
                    {r.sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{r.sub}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid " + C.border, display: "flex", gap: 12 }}>
          <span style={{ fontSize: 10, color: C.textMuted }}>↑↓ navigate</span>
          <span style={{ fontSize: 10, color: C.textMuted }}>↵ select</span>
          <span style={{ fontSize: 10, color: C.textMuted }}>esc close</span>
        </div>
      </div>
    </div>
  );
}
