import { useState } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { InputField, TextArea } from "../../components/InputField";
import { FL } from "../../components/FieldLabel";
import { detectRegion, detectMarketScope, STATE_NAMES } from "../../lib/regions";
import { ChipDropdown } from "../../components/ChipDropdown";

var REGION_GROUPS = [
  { label: "Northeast",     states: ["ME","NH","VT","MA","RI","CT","NY","NJ","PA"] },
  { label: "Mid-Atlantic",  states: ["MD","DE","DC","VA","WV"] },
  { label: "Southeast",     states: ["NC","SC","GA","FL","AL","MS","TN","KY"] },
  { label: "Midwest",       states: ["OH","IN","IL","MI","WI","MN","IA","MO","ND","SD","NE","KS"] },
  { label: "South Central", states: ["TX","OK","AR","LA"] },
  { label: "Mountain",      states: ["CO","UT","ID","MT","WY","NV","AZ","NM"] },
  { label: "West",          states: ["CA","OR","WA","AK","HI"] },
];
var ALL_STATES = Object.keys(STATE_NAMES);

var TIERS    = ["Major", "Mid", "Growth"];
var STATUSES = [
  { value: "green",  label: "Healthy" },
  { value: "yellow", label: "Watch"   },
  { value: "red",    label: "At Risk" },
];
var PRESET_TAGS = [];

function TagChip({ label, active, onClick, onRemove, color }) {
  var col = color || C.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "rgba(123,108,246,0.15)" : "rgba(123,108,246,0.04)",
        color: active ? col : C.textMuted,
        border: "1px solid " + (active ? "rgba(123,108,246,0.35)" : C.border),
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "'Inter', system-ui, sans-serif",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {onRemove && (
        <span
          onClick={function (e) { e.stopPropagation(); onRemove(); }}
          style={{ fontSize: 12, color: C.textMuted, lineHeight: 1 }}
        >
          ×
        </span>
      )}
    </button>
  );
}

export function AddAccountModal({ userId, onSave, onClose, existing, accounts, defaultType, defaultParentId }) {
  var [name, setName]       = useState(existing ? existing.name : "");
  var [revenueAmount, setRevenueAmount] = useState(existing && existing.revenue_amount != null ? String(existing.revenue_amount) : "");
  var [revenueNote, setRevenueNote] = useState(existing && existing.revenue && existing.revenue_amount == null ? existing.revenue : "");
  var [tier, setTier]       = useState(existing ? (existing.tier || "Mid") : "Mid");
  var [status, setStatus]   = useState(existing ? (existing.status || "green") : "green");
  var [notes, setNotes]     = useState(existing ? (existing.objective || "") : "");
  var [tags, setTags]       = useState(existing ? (existing.tags || []) : []);
  var [customTag, setCustomTag] = useState("");
  var [states, setStates]       = useState(existing ? (existing.serviced_states || []) : []);
  var [statePickerOpen, setStatePickerOpen] = useState(false);
  var [parentAccountId, setParentAccountId] = useState(
    existing ? (existing.parent_account_id || '') : (defaultParentId || '')
  );
  var [accountType, setAccountType]     = useState(existing ? (existing.account_type || 'standard') : (defaultType || 'standard'));
  var [address, setAddress]             = useState(existing ? (existing.address || '') : '');
  var [accountNumber, setAccountNumber] = useState(existing ? (existing.account_number || '') : '');
  var [agreementEndDate, setAgreementEndDate] = useState(existing ? (existing.agreement_end_date || '') : '');
  var [scopeSummary, setScopeSummary]         = useState(existing ? (existing.scope_summary || '') : '');
  var [billingTerms, setBillingTerms]         = useState(existing ? (existing.billing_terms || '') : '');
  var [spendYtd, setSpendYtd]                 = useState(existing && existing.spend_ytd != null ? String(existing.spend_ytd) : '');
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  var isInternal = accountType === 'internal_team';
  var isPartner  = accountType === 'partner';
  var isCustomer = !isInternal && !isPartner;
  var modalTitle = existing
    ? (isInternal ? "Edit Department" : isPartner ? "Edit Partner" : "Edit Account")
    : (isInternal ? "Add Department" : isPartner ? "Add Partner" : "Add Account");
  var saveLabel = existing
    ? "Save Changes"
    : (isInternal ? "Add Department" : isPartner ? "Add Partner" : "Add Account");

  var region      = detectRegion(states);
  var marketScope = detectMarketScope(states);

  function toggleTag(t) {
    setTags(function (prev) {
      return prev.includes(t) ? prev.filter(function (x) { return x !== t; }) : prev.concat([t]);
    });
  }

  function addCustomTag() {
    var val = customTag.trim();
    if (val && !tags.includes(val)) setTags(function (prev) { return prev.concat([val]); });
    setCustomTag("");
  }

  function handleCustomTagKey(e) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addCustomTag(); }
  }

  function toggleState(s) {
    setStates(function (prev) {
      return prev.includes(s) ? prev.filter(function (x) { return x !== s; }) : prev.concat([s]);
    });
  }

  function geocodeAddress(addr) {
    return fetch(
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(addr),
      { headers: { "Accept-Language": "en", "User-Agent": "Folios/1.0" } }
    )
      .then(function(r) { return r.json(); })
      .then(function(results) {
        if (results && results.length > 0) {
          return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        }
        return null;
      })
      .catch(function() { return null; });
  }

  function handleSave() {
    if (!name.trim()) { setError("Account name is required."); return; }
    setLoading(true);
    setError(null);

    var parsedRev = revenueAmount.trim() === "" ? null : parseFloat(revenueAmount.replace(/[^0-9.]/g, ""));
    if (parsedRev !== null && isNaN(parsedRev)) parsedRev = null;
    var parsedSpend = spendYtd.trim() === "" ? null : parseFloat(spendYtd.replace(/[^0-9.]/g, ""));
    if (parsedSpend !== null && isNaN(parsedSpend)) parsedSpend = null;
    var data = {
      name:              name.trim(),
      revenue_amount:    isCustomer ? parsedRev : null,
      revenue:           isCustomer ? (revenueNote.trim() || (parsedRev !== null ? null : null)) : null,
      tier:              isCustomer ? tier : null,
      status:            status,
      objective:         notes.trim() || null,
      tags:              tags.length > 0 ? tags : null,
      serviced_states:   states.length > 0 ? states : null,
      region:            region || null,
      market_scope:      marketScope || null,
      parent_account_id: parentAccountId || null,
      account_type:      accountType || 'standard',
      address:           address.trim() || null,
      account_number:    accountNumber.trim() || null,
      agreement_end_date: isPartner ? (agreementEndDate || null) : null,
      scope_summary:      isPartner ? (scopeSummary.trim() || null) : null,
      billing_terms:      isPartner ? (billingTerms.trim() || null) : null,
      spend_ytd:          isPartner ? parsedSpend : null,
    };

    var needsGeocode = address.trim() && (!existing || existing.address !== address.trim()) && !(existing && existing.lat);
    var geoPromise = needsGeocode ? geocodeAddress(address.trim()) : Promise.resolve(null);

    geoPromise.then(function(coords) {
      if (coords) {
        data.lat = coords.lat;
        data.lng = coords.lng;
      }
      return onSave(data);
    })
      .then(function() { setLoading(false); onClose(); })
      .catch(function(err) { setLoading(false); setError(err.message); });
  }

  var typeOptions = [
    { value: "standard",      label: "Customer" },
    { value: "internal_team", label: "Department" },
    { value: "partner",       label: "Partner" },
  ];
  // Hide the type chooser when adding a shop sub-account or editing one.
  var showTypeChooser = !existing && defaultType !== 'shop';

  return (
    <Modal title={modalTitle} onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Workspace type — only when creating a new top-level record */}
        {showTypeChooser && (
          <div>
            <FL>Workspace Type</FL>
            <div style={{ display: "flex", gap: 5 }}>
              {typeOptions.map(function (opt) {
                var on = (opt.value === "standard")
                  ? (accountType === "standard" || accountType === "mso" || accountType === "shop")
                  : accountType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={function () { setAccountType(opt.value); }}
                    style={{
                      flex: 1,
                      background: on ? C.accentMid : "rgba(255,255,255,0.04)",
                      color: on ? C.accent : C.textMuted,
                      border: "1px solid " + (on ? C.accentRing : C.border),
                      borderRadius: 8, padding: "9px 6px", fontSize: 12,
                      fontWeight: on ? 700 : 400,
                      fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Name */}
        <div>
          <FL htmlFor="account-name">{isInternal ? "Department Name" : isPartner ? "Partner Name" : "Account Name"}</FL>
          <InputField id="account-name" value={name} onChange={function (e) { setName(e.target.value); }} placeholder={isInternal ? "e.g. Marketing" : isPartner ? "e.g. Acme Agency" : "Company name"} />
        </div>

        {/* Account Number */}
        <div>
          <FL htmlFor="account-number">Account # <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
          <InputField id="account-number" value={accountNumber} onChange={function (e) { setAccountNumber(e.target.value); }} placeholder="e.g. 10042" />
        </div>

        {/* Revenue — customer only */}
        {isCustomer && (
        <div>
          <FL htmlFor="account-revenue">Revenue (YTD)</FL>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              color: C.textMuted, fontSize: 14, pointerEvents: "none",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}>$</span>
            <InputField
              id="account-revenue"
              type="number"
              inputMode="decimal"
              value={revenueAmount}
              onChange={function (e) { setRevenueAmount(e.target.value); }}
              placeholder="4900000"
              style={{ paddingLeft: 24 }}
            />
          </div>
          <InputField
            id="account-revenue-note"
            value={revenueNote}
            onChange={function (e) { setRevenueNote(e.target.value); }}
            placeholder="Note (optional, e.g. ARR, estimated)"
            style={{ marginTop: 6, fontSize: 12 }}
          />
        </div>
        )}

        {/* Partner fields */}
        {isPartner && (
          <>
            <div>
              <FL htmlFor="partner-scope">Scope Summary</FL>
              <TextArea
                id="partner-scope"
                value={scopeSummary}
                onChange={function (e) { setScopeSummary(e.target.value); }}
                placeholder="What this partner does for us"
                rows={2}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FL htmlFor="partner-end">Agreement End Date</FL>
                <InputField
                  id="partner-end"
                  type="date"
                  value={agreementEndDate}
                  onChange={function (e) { setAgreementEndDate(e.target.value); }}
                />
              </div>
              <div>
                <FL htmlFor="partner-spend">Spend YTD</FL>
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                    color: C.textMuted, fontSize: 14, pointerEvents: "none",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}>$</span>
                  <InputField
                    id="partner-spend"
                    type="number"
                    inputMode="decimal"
                    value={spendYtd}
                    onChange={function (e) { setSpendYtd(e.target.value); }}
                    placeholder="120000"
                    style={{ paddingLeft: 24 }}
                  />
                </div>
              </div>
            </div>
            <div>
              <FL htmlFor="partner-billing">Billing Terms</FL>
              <InputField
                id="partner-billing"
                value={billingTerms}
                onChange={function (e) { setBillingTerms(e.target.value); }}
                placeholder="e.g. Net 30, monthly retainer"
              />
            </div>
          </>
        )}

        {/* Address */}
        <div>
          <FL htmlFor="account-address">Address <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
          <InputField
            id="account-address"
            value={address}
            onChange={function (e) { setAddress(e.target.value); }}
            placeholder="123 Main St, Chicago, IL 60601"
          />
        </div>

        {/* Tier + Status */}
        <div style={{ display: "grid", gridTemplateColumns: isCustomer ? "1fr 1fr" : "1fr", gap: 10 }}>
          {isCustomer && (
          <div>
            <FL>Tier</FL>
            <div style={{ display: "flex", gap: 5 }}>
              {TIERS.map(function (t) {
                var on = tier === t;
                return (
                  <button key={t} type="button" onClick={function () { setTier(t); }}
                    style={{
                      flex: 1,
                      background: on ? C.accentMid : "rgba(255,255,255,0.04)",
                      color: on ? C.accent : C.textMuted,
                      border: "1px solid " + (on ? C.accentRing : C.border),
                      borderRadius: 8, padding: "9px 6px", fontSize: 12,
                      fontWeight: on ? 700 : 400,
                      fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
                    }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          )}
          <div>
            <FL>Status</FL>
            <div style={{ display: "flex", gap: 5 }}>
              {STATUSES.map(function (s) {
                var on = status === s.value;
                var col = s.value === "green" ? C.accent : s.value === "yellow" ? C.yellow : C.red;
                var bgRgb = s.value === "green" ? "74,155,130" : s.value === "yellow" ? "232,168,56" : "224,92,92";
                return (
                  <button key={s.value} type="button" onClick={function () { setStatus(s.value); }}
                    style={{
                      flex: 1,
                      background: on ? "rgba(" + bgRgb + ",0.15)" : "rgba(255,255,255,0.04)",
                      color: on ? col : C.textMuted,
                      border: "1px solid " + (on ? "rgba(" + bgRgb + ",0.4)" : C.border),
                      borderRadius: 8, padding: "9px 4px", fontSize: 11,
                      fontWeight: on ? 700 : 400,
                      fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
                    }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* MSO toggle — customer-type only */}
        {defaultType !== 'shop' && isCustomer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={function () { setAccountType(function (t) { return t === 'mso' ? 'standard' : 'mso'; }); }}
              style={{
                width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: accountType === 'mso' ? C.accent : 'rgba(255,255,255,0.1)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: accountType === 'mso' ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>MSO Account</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>Has individual shops as sub-accounts</div>
            </div>
          </div>
        )}

        {/* Tags (free-form labels) */}
        <div>
          <FL>Tags <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {PRESET_TAGS.map(function (t) {
              return (
                <TagChip
                  key={t}
                  label={t}
                  active={tags.includes(t)}
                  onClick={function () { toggleTag(t); }}
                />
              );
            })}
          </div>
          {/* Custom tag input */}
          <div style={{ display: "flex", gap: 6 }}>
            <InputField
              value={customTag}
              onChange={function (e) { setCustomTag(e.target.value); }}
              onKeyDown={handleCustomTagKey}
              placeholder="Add a type, press Enter"
              style={{ flex: 1 }}
            />
          </div>
          {/* Custom tags */}
          {tags.filter(function (t) { return !PRESET_TAGS.includes(t); }).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {tags.filter(function (t) { return !PRESET_TAGS.includes(t); }).map(function (t) {
                return (
                  <TagChip
                    key={t}
                    label={t}
                    active
                    onRemove={function () { toggleTag(t); }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Serviced states — customer only */}
        {isCustomer && (
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <FL style={{ marginBottom: 0 }}>Serviced States</FL>
            {states.length > 0 && (
              <button
                type="button"
                onClick={function () { setStates([]); }}
                style={{ background: "none", border: "none", fontSize: 11, color: C.textMuted, cursor: "pointer", padding: 0 }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Trigger button */}
          <button
            type="button"
            onClick={function () { setStatePickerOpen(function (o) { return !o; }); }}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid " + (statePickerOpen ? C.accentBorder : C.border),
              borderRadius: 8,
              padding: "9px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 13,
              color: states.length > 0 ? C.text : C.textMuted,
            }}
          >
            <span>
              {states.length === 0 && "Select states..."}
              {states.length > 0 && states.length < 6 && states.join(", ")}
              {states.length >= 6 && states.length + " states selected"}
            </span>
            <span style={{ fontSize: 10, color: C.textMuted }}>{statePickerOpen ? "▲" : "▼"}</span>
          </button>

          {/* Dropdown panel */}
          {statePickerOpen && (
            <>
              <div
                onClick={function () { setStatePickerOpen(false); }}
                style={{ position: "fixed", inset: 0, zIndex: 10 }}
              />
              <div style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                background: "#1c1912",
                border: "1px solid " + C.border,
                borderRadius: 10,
                padding: 12,
                zIndex: 11,
                maxHeight: 320,
                overflowY: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}>
                {/* National quick-select */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={function () { setStates(states.length === ALL_STATES.length ? [] : ALL_STATES.slice()); }}
                    style={{
                      background: states.length === ALL_STATES.length ? C.accentMid : C.accentFaint,
                      color: C.accent,
                      border: "1px solid " + (states.length === ALL_STATES.length ? C.accentBorder : C.accentLine),
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "'Inter', system-ui, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    {states.length === ALL_STATES.length ? "✓ National" : "National (all)"}
                  </button>
                </div>

                {/* Region groups */}
                {REGION_GROUPS.map(function (group) {
                  var allSelected = group.states.every(function (s) { return states.includes(s); });
                  return (
                    <div key={group.label} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                          {group.label}
                        </span>
                        <button
                          type="button"
                          onClick={function () {
                            if (allSelected) {
                              setStates(function (prev) { return prev.filter(function (s) { return !group.states.includes(s); }); });
                            } else {
                              setStates(function (prev) {
                                var next = prev.slice();
                                group.states.forEach(function (s) { if (!next.includes(s)) next.push(s); });
                                return next;
                              });
                            }
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            fontSize: 10,
                            color: allSelected ? C.accent : C.textMuted,
                            cursor: "pointer",
                            padding: 0,
                            fontFamily: "'Inter', system-ui, sans-serif",
                          }}
                        >
                          {allSelected ? "deselect" : "select all"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {group.states.map(function (s) {
                          var on = states.includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={function () { toggleState(s); }}
                              style={{
                                background: on ? "rgba(124,92,191,0.2)" : "rgba(255,255,255,0.04)",
                                color: on ? C.purple : C.textMuted,
                                border: "1px solid " + (on ? "rgba(124,92,191,0.4)" : C.border),
                                borderRadius: 5,
                                padding: "4px 8px",
                                fontSize: 11,
                                fontWeight: on ? 700 : 400,
                                fontFamily: "'Inter', system-ui, sans-serif",
                                cursor: "pointer",
                                minWidth: 34,
                                textAlign: "center",
                              }}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Auto-detected region */}
          {region && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: C.textMuted }}>Auto-detected:</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, textShadow: "0 0 8px " + C.accent }}>
                {region}
              </span>
              {marketScope && (
                <span style={{ fontSize: 10, color: C.textMuted }}>· {marketScope}</span>
              )}
            </div>
          )}
        </div>
        )}

        {/* Parent account */}
        {!defaultParentId && accounts && accounts.length > 0 && (
          <div>
            <FL>Part of <span style={{ fontWeight: 400, color: C.textMuted }}>(optional)</span></FL>
            <ChipDropdown
              options={["None (standalone)"].concat(
                accounts
                  .filter(function (a) { return !existing || a.id !== existing.id; })
                  .filter(function (a) { return !a.parent_account_id; })
                  .map(function (a) { return a.name; })
              )}
              value={parentAccountId
                ? (accounts.find(function (a) { return a.id === parentAccountId; }) || {}).name || ""
                : "None (standalone)"}
              onSelect={function (name) {
                if (name === "None (standalone)") { setParentAccountId(""); return; }
                var acct = accounts.find(function (a) { return a.name === name; });
                if (acct) setParentAccountId(acct.id);
              }}
              placeholder="None (standalone)"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <FL htmlFor="account-notes">Notes</FL>
          <TextArea
            id="account-notes"
            value={notes}
            onChange={function (e) { setNotes(e.target.value); }}
            placeholder="Who they are, what they sell, any context worth knowing..."
            rows={2}
          />
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: C.red,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <AmberBtn style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : saveLabel}
          </AmberBtn>
          <SecBtn style={{ flex: 1 }} onClick={onClose}>Cancel</SecBtn>
        </div>
      </div>
    </Modal>
  );
}
