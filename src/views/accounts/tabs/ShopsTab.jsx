import { C, glass } from "../../../lib/colors";
import { AmberBtn } from "../../../components/Buttons";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch", red: "At Risk" };

export function ShopsTab({ shops, onAddShop, onSelectShop }) {
  var today = new Date().toISOString().split("T")[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {shops.length} {shops.length === 1 ? "Shop" : "Shops"}
        </div>
        <AmberBtn onClick={onAddShop} style={{ fontSize: 11, padding: "5px 12px" }}>
          + Add Shop
        </AmberBtn>
      </div>

      {shops.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
          <div style={{ marginBottom: 12 }}>No shops added yet.</div>
          <AmberBtn onClick={onAddShop} style={{ fontSize: 12 }}>+ Add First Shop</AmberBtn>
        </div>
      )}

      {shops.map(function (shop) {
        var statusColor = STATUS_COLORS[shop.status] || C.textSub;
        var lastDate    = shop.last_interaction_at
          ? shop.last_interaction_at.split("T")[0]
          : shop.last_meeting;
        var daysLabel, daysColor;
        if (!lastDate) {
          daysLabel = "not met"; daysColor = C.purple;
        } else {
          var days  = Math.floor((new Date(today + "T00:00:00") - new Date(lastDate + "T00:00:00")) / 86400000);
          daysLabel = days === 0 ? "today" : days + "d";
          daysColor = days <= 14 ? C.green : days <= 45 ? C.accent : C.red;
        }

        return (
          <div
            key={shop.id}
            onClick={function () { onSelectShop(shop); }}
            style={Object.assign({}, glass, {
              borderLeft: "3px solid " + statusColor,
              borderRadius: 12,
              padding: "12px 14px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            })}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: shop.address ? 3 : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shop.name}
              </div>
              {shop.address && (
                <div style={{ fontSize: 11, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shop.address}
                </div>
              )}
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>
                {STATUS_LABELS[shop.status] || "—"}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: daysColor, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {daysLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}
