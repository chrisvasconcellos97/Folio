import { useState, useMemo } from "react";
import { C, glass } from "../../lib/colors";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { Modal } from "../../components/Modal";
import { showToast } from "../../components/Toast";
import { supabase } from "../../lib/supabase";
import { Mark } from "../../components/Mark";

var RB_SERIF = "'Fraunces', Georgia, serif";
var RB_MONO  = "'JetBrains Mono', ui-monospace, monospace";

function haversine(lat1, lng1, lat2, lng2) {
  var R = 3958.8;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function totalDist(order, stops) {
  var d = 0;
  for (var i = 0; i < order.length - 1; i++) {
    var a = stops[order[i]], b = stops[order[i+1]];
    if (a && b && a.lat && b.lat) d += haversine(a.lat, a.lng, b.lat, b.lng);
  }
  return d;
}

function optimizeRoute(stops) {
  if (stops.length <= 1) return stops.map(function(_, i) { return i; });
  var n = stops.length;
  if (n <= 8) {
    var indices = stops.map(function(_, i) { return i; });
    function permute(arr) {
      if (arr.length <= 1) return [arr];
      var result = [];
      arr.forEach(function(el, i) {
        var rest = arr.slice(0, i).concat(arr.slice(i+1));
        permute(rest).forEach(function(p) { result.push([el].concat(p)); });
      });
      return result;
    }
    var best = null, bestD = Infinity;
    permute(indices).forEach(function(perm) {
      var d = totalDist(perm, stops);
      if (d < bestD) { bestD = d; best = perm; }
    });
    return best || indices;
  }
  var visited = new Array(n).fill(false);
  var order = [0];
  visited[0] = true;
  for (var step = 1; step < n; step++) {
    var last = order[order.length - 1];
    var nearest = -1, nearestD = Infinity;
    for (var j = 0; j < n; j++) {
      if (!visited[j]) {
        var d = (stops[last].lat && stops[j].lat) ? haversine(stops[last].lat, stops[last].lng, stops[j].lat, stops[j].lng) : 999999;
        if (d < nearestD) { nearestD = d; nearest = j; }
      }
    }
    if (nearest >= 0) { visited[nearest] = true; order.push(nearest); }
  }
  return order;
}

function buildMapsUrl(orderedStops) {
  if (orderedStops.length === 0) return null;
  var base = "https://www.google.com/maps/dir/";
  var waypoints = orderedStops.map(function(s) {
    if (s.lat && s.lng) return s.lat + "," + s.lng;
    return encodeURIComponent(s.address || s.name);
  });
  return base + waypoints.join("/");
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function RouteBuilder({ accounts, userId }) {
  var [selected, setSelected]          = useState([]);
  var [startTime, setStartTime]        = useState("09:00");
  var [visitDuration, setVisitDuration] = useState(45);
  var [optimized, setOptimized]        = useState(null);
  var [geocoding, setGeocoding]        = useState(false);
  var [saving, setSaving]              = useState(false);
  var [routeName, setRouteName]        = useState("");
  var [showSave, setShowSave]          = useState(false);

  var avgSpeedMph = 45;

  var eligibleAccounts = useMemo(function() {
    return accounts.filter(function(a) { return a.address; });
  }, [accounts]);

  function toggleAccount(id) {
    setSelected(function(prev) {
      return prev.includes(id) ? prev.filter(function(x) { return x !== id; }) : prev.concat([id]);
    });
    setOptimized(null);
  }

  function geocodeAddress(addr) {
    // Bound the call so a slow Nominatim doesn't hang Route Builder.
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    return fetch(
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(addr),
      { headers: { "Accept-Language": "en", "User-Agent": "Folios/1.0" }, signal: controller.signal }
    )
      .then(function(r) { clearTimeout(timer); return r.json(); })
      .then(function(results) {
        if (results && results.length > 0) return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        return null;
      })
      .catch(function() { clearTimeout(timer); return null; });
  }

  function handleBuildRoute() {
    var stops = selected.map(function(id) {
      var a = accounts.find(function(x) { return x.id === id; });
      return { id: id, name: a ? a.name : id, address: a ? a.address : "", lat: a ? a.lat : null, lng: a ? a.lng : null };
    });

    setGeocoding(true);
    var needsGeo = stops.filter(function(s) { return !s.lat && s.address; });
    var geoChain = Promise.resolve();
    needsGeo.forEach(function(s, idx) {
      geoChain = geoChain.then(function() {
        return new Promise(function(res) { setTimeout(res, idx === 0 ? 0 : 1100); });
      }).then(function() {
        return geocodeAddress(s.address).then(function(coords) {
          if (coords) {
            s.lat = coords.lat;
            s.lng = coords.lng;
            supabase.from("folio_accounts").update({ lat: coords.lat, lng: coords.lng }).eq("id", s.id).then(function(){}).catch(function(){});
          }
        });
      });
    });

    geoChain.then(function() {
      var order = optimizeRoute(stops);
      var orderedStops = order.map(function(i) { return stops[i]; });

      var parts = startTime.split(":");
      var h = parseInt(parts[0]); var min = parseInt(parts[1]);
      var cursor = new Date();
      cursor.setHours(h, min, 0, 0);
      var schedule = orderedStops.map(function(s, i) {
        var arriveTime = new Date(cursor);
        var departTime = new Date(cursor.getTime() + visitDuration * 60000);
        var distToNext = null;
        if (i < orderedStops.length - 1) {
          var next = orderedStops[i + 1];
          if (s.lat && next.lat) distToNext = haversine(s.lat, s.lng, next.lat, next.lng);
        }
        var travelMins = distToNext !== null ? Math.ceil((distToNext / avgSpeedMph) * 60) : 0;
        cursor = new Date(departTime.getTime() + travelMins * 60000);
        return {
          stop: s,
          arrive: arriveTime,
          depart: departTime,
          distToNext: distToNext,
          travelMins: travelMins,
        };
      });

      setOptimized({ stops: orderedStops, schedule: schedule, mapsUrl: buildMapsUrl(orderedStops) });
      setGeocoding(false);
    });
  }

  function handleSaveRoute() {
    if (!routeName.trim() || !optimized) return;
    setSaving(true);
    var stops = optimized.stops.map(function(s, i) {
      return { account_id: s.id, name: s.name, visit_duration: visitDuration, order: i };
    });
    supabase.from("folio_routes").insert([{
      user_id: userId,
      name: routeName.trim(),
      date: new Date().toISOString().split("T")[0],
      stops: stops,
    }]).then(function(r) {
      setSaving(false);
      if (r.error) { showToast(r.error.message || "Couldn't save", "error"); return; }
      showToast("Route saved: " + routeName.trim());
      setShowSave(false);
      setRouteName("");
    }).catch(function(err) { setSaving(false); showToast(err.message || "Error", "error"); });
  }

  var canBuild = selected.length >= 2;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark tab="route" size={52} />
          <div>
            <div style={{ fontFamily: RB_SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
              Route
            </div>
            <div style={{ fontFamily: RB_MONO, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
              Optimized Visit Routes · Field Schedules
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: optimized ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FL>Start Time</FL>
              <input
                type="time"
                value={startTime}
                onChange={function(e) { setStartTime(e.target.value); setOptimized(null); }}
                style={{ width: "100%", background: C.bgDropdown, border: "1px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FL>Visit Duration (min)</FL>
              <select
                value={visitDuration}
                onChange={function(e) { setVisitDuration(parseInt(e.target.value)); setOptimized(null); }}
                style={{ width: "100%", background: C.bgDropdown, border: "1px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", outline: "none" }}
              >
                {[15, 30, 45, 60, 90, 120].map(function(m) { return <option key={m} value={m}>{m} min</option>; })}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Select Stops ({selected.length} selected)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto", marginBottom: 12 }}>
            {eligibleAccounts.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: C.textMuted, fontSize: 13 }}>
                No accounts with addresses yet. Add an address when editing an account.
              </div>
            )}
            {eligibleAccounts.map(function(a) {
              var on = selected.includes(a.id);
              return (
                <div
                  key={a.id}
                  onClick={function() { toggleAccount(a.id); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={function(e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAccount(a.id); } }}
                  style={{
                    padding: "10px 12px",
                    background: on ? C.accentGlow : C.bgCard,
                    border: "1px solid " + (on ? C.accentLine : C.border),
                    borderRadius: 10,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px solid " + (on ? C.accent : C.border), background: on ? C.accent : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.address}</div>
                  </div>
                  {a.lat && <div style={{ fontSize: 9, color: C.accent, fontWeight: 700 }}>✓ geo</div>}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <AmberBtn
              onClick={handleBuildRoute}
              disabled={!canBuild || geocoding}
              style={{ fontSize: 12 }}
            >
              {geocoding ? "Geocoding…" : "Build Route"}
            </AmberBtn>
            {selected.length > 0 && (
              <SecBtn onClick={function() { setSelected([]); setOptimized(null); }} style={{ fontSize: 12 }}>
                Clear
              </SecBtn>
            )}
          </div>
        </div>

        {optimized && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Schedule</div>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href={optimized.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: C.bgCard, border: "1px solid " + C.border, borderRadius: 8,
                    padding: "5px 12px", fontSize: 11, fontWeight: 600, color: C.textSub,
                    textDecoration: "none", cursor: "pointer",
                  }}
                >
                  Open in Maps ↗
                </a>
                <button
                  onClick={function() { setShowSave(true); }}
                  style={{ background: "none", border: "1px solid " + C.border, borderRadius: 8, padding: "5px 12px", fontSize: 11, color: C.textMuted, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer" }}
                >
                  Save Route
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {optimized.schedule.map(function(item, i) {
                return (
                  <div key={i} style={Object.assign({}, glass, { borderRadius: 10, padding: "10px 12px" })}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: C.accentMid, border: "1px solid " + C.accentLine, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: C.accent }}>{i + 1}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.stop.name}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{item.stop.address}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>{formatTime(item.arrive)}</div>
                        <div style={{ fontSize: 10, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{"→ " + formatTime(item.depart)}</div>
                      </div>
                    </div>
                    {item.distToNext !== null && i < optimized.schedule.length - 1 && (
                      <div style={{ marginTop: 6, fontSize: 10, color: C.textMuted, paddingLeft: 28, fontVariantNumeric: "tabular-nums" }}>
                        {item.distToNext.toFixed(1)} mi · ~{item.travelMins} min drive
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showSave && (
        <Modal title="Save Route" onClose={function() { setShowSave(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <FL>Route Name</FL>
              <InputField value={routeName} onChange={function(e) { setRouteName(e.target.value); }} placeholder="e.g. Tuesday Midwest Run" />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <SecBtn onClick={function() { setShowSave(false); }}>Cancel</SecBtn>
              <AmberBtn onClick={handleSaveRoute} disabled={!routeName.trim() || saving} style={{ fontSize: 12 }}>
                {saving ? "Saving…" : "Save"}
              </AmberBtn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
