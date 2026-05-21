import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { Pill } from "../../components/Pill";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch", red: "At Risk" };
var TIER_COLORS   = { Major: C.blue, Mid: C.purple, Growth: C.green };

function parseRevenue(str) {
  if (!str) return 0;
  var n = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (str.toUpperCase().includes("B")) return n * 1000;
  if (str.toUpperCase().includes("M")) return n;
  if (str.toUpperCase().includes("K")) return n / 1000;
  return n;
}

function pipAnalysis(accounts) {
  var atRisk = accounts.filter(function (a) { return a.status === "red"; });
  var total  = accounts.reduce(function (sum, a) { return sum + parseRevenue(a.revenue); }, 0);
  if (atRisk.length === 0) {
    return "Book looks clean right now. All accounts are healthy or on watch. I'd keep an eye on the Watch ones but nothing's on fire.";
  }
  var names = atRisk.map(function (a) { return a.name; }).join(" and ");
  var pct   = total > 0
    ? Math.round(
        (atRisk.reduce(function (s, a) { return s + parseRevenue(a.revenue); }, 0) / total) * 100
      )
    : 0;
  return (
    atRisk.length +
    " account" +
    (atRisk.length > 1 ? "s" : "") +
    " at risk — " +
    names +
    ". That's " +
    pct +
    "% of your book. Worth prioritizing before things slip further."
  );
}

export function PipelineView({ accounts, loading }) {
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 13 }}>
        Loading pipeline...
      </div>
    );
  }

  var sorted = accounts
    .slice()
    .sort(function (a, b) { return parseRevenue(b.revenue) - parseRevenue(a.revenue); });

  var max = sorted.length > 0 ? parseRevenue(sorted[0].revenue) : 1;
  if (max === 0) max = 1;

  return (
    <div>
      {/* Pip analysis */}
      <div
        style={{
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <PipMark size={9} color={C.accent} glow pulse />
          <div
            style={{
              fontSize: 10,
              color: C.accent,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Pip — Pipeline Health
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>
          {pipAnalysis(accounts)}
        </div>
      </div>

      {/* Revenue bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: C.textMuted,
              fontSize: 13,
            }}
          >
            No accounts yet.
          </div>
        )}

        {sorted.map(function (a) {
          var rev        = parseRevenue(a.revenue);
          var barWidth   = max > 0 ? (rev / max) * 100 : 0;
          var statusColor = STATUS_COLORS[a.status] || C.textSub;

          return (
            <div
              key={a.id}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                  gap: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: C.text,
                      marginBottom: 4,
                    }}
                  >
                    {a.name}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {a.tier && (
                      <Pill color={TIER_COLORS[a.tier] || C.textSub} style={{ fontSize: 9 }}>
                        {a.tier}
                      </Pill>
                    )}
                    <Pill color={statusColor} style={{ fontSize: 9 }}>
                      {STATUS_LABELS[a.status] || a.status}
                    </Pill>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.accent,
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {a.revenue || "—"}
                </div>
              </div>

              <div
                style={{
                  height: 5,
                  background: C.bgDark,
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: barWidth + "%",
                    height: "100%",
                    background: statusColor,
                    borderRadius: 3,
                    opacity: 0.75,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
