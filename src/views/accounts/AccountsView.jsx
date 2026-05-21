import { useState } from "react";
import { C } from "../../lib/colors";
import { Pill } from "../../components/Pill";
import { InputField } from "../../components/InputField";
import { Card } from "../../components/Card";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch",  red: "At Risk" };
var TIER_COLORS   = { Major: C.blue,   Mid: C.purple,    Growth: C.green };

var FILTERS = ["All", "Major", "Mid", "Growth", "At Risk"];

export function AccountsView({ accounts, onSelect }) {
  var [search, setSearch]   = useState("");
  var [filter, setFilter]   = useState("All");

  var filtered = accounts.filter(function (a) {
    var matchSearch = a.name.toLowerCase().includes(search.toLowerCase());
    var matchFilter =
      filter === "All" ||
      (filter === "At Risk" ? a.status === "red" : a.tier === filter);
    return matchSearch && matchFilter;
  });

  var atRisk       = accounts.filter(function (a) { return a.status === "red"; }).length;
  var totalRevenue = accounts.length + " accounts";

  return (
    <div>
      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { l: "Accounts",  v: accounts.length,  c: C.text },
          { l: "Watching",  v: accounts.filter(function(a){ return a.status === "yellow"; }).length, c: C.yellow },
          { l: "At Risk",   v: atRisk,            c: C.red },
        ].map(function (s) {
          return (
            <div
              key={s.l}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: s.c,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.v}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: C.textMuted,
                  marginTop: 3,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {s.l}
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <InputField
        value={search}
        onChange={function (e) { setSearch(e.target.value); }}
        placeholder="Search accounts..."
        style={{ marginBottom: 10 }}
      />

      {/* Filter pills */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 14,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {FILTERS.map(function (f) {
          var active = filter === f;
          return (
            <button
              key={f}
              onClick={function () { setFilter(f); }}
              style={{
                background: active ? C.bgPillActive : C.bgPill,
                color: active ? C.accent : C.textMuted,
                border: "1px solid " + (active ? "rgba(200,136,58,0.3)" : C.border),
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Account list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: C.textMuted,
              fontSize: 13,
            }}
          >
            No accounts found.
          </div>
        )}

        {filtered.map(function (a) {
          var statusColor = STATUS_COLORS[a.status] || C.textSub;
          return (
            <div
              key={a.id}
              onClick={function () { onSelect(a); }}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderLeft: "3px solid " + statusColor,
                borderRadius: 12,
                padding: "13px 15px",
                cursor: "pointer",
                boxShadow:
                  a.status === "red"
                    ? "0 0 18px rgba(248,113,113,0.07)"
                    : "none",
                transition: "opacity 0.12s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                      {a.name}
                    </div>
                    {a.tier && (
                      <Pill color={TIER_COLORS[a.tier] || C.textSub}>{a.tier}</Pill>
                    )}
                    <Pill color={statusColor}>
                      {STATUS_LABELS[a.status] || a.status}
                    </Pill>
                  </div>

                  {a.revenue && (
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: C.accent,
                        marginBottom: 6,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {a.revenue}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {a.last_meeting && (
                      <div style={{ fontSize: 10, color: C.textMuted }}>
                        {"Last: " +
                          new Date(a.last_meeting).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                      </div>
                    )}
                    {a.next_meeting && (
                      <div style={{ fontSize: 10, color: C.textSub }}>
                        {"Next: " +
                          new Date(a.next_meeting).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 14, color: C.textMuted, flexShrink: 0, paddingTop: 2 }}>
                  →
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
