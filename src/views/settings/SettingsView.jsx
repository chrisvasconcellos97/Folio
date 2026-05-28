import { useState, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { Card } from "../../components/Card";
import { FL } from "../../components/FieldLabel";
import { InputField } from "../../components/InputField";
import { AmberBtn } from "../../components/Buttons";
import { showToast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import { supabase } from "../../lib/supabase";
import { usePipFacts } from "../../hooks/usePipFacts";
import { usePipUsage } from "../../hooks/usePipUsage";
import { useActivity } from "../../hooks/useActivity";
import { useTheme } from "../../hooks/useTheme";
import { Mark } from "../../components/Mark";

var PIP_FACT_PLACEHOLDERS = [
  "Prefer concise replies",
  "I cover the West region",
  "Call Dan 'Dan-O'",
];

var ROLE_LABELS = { owner: "Owner", member: "Member", leadership: "Leadership (read-only)" };
var ROLE_COLORS = { owner: C.accent, member: C.blue, leadership: C.textSub };

function ProfileSection({ userMeta }) {
  var [name, setName]     = useState(userMeta ? userMeta.full_name || "" : "");
  var [title, setTitle]   = useState(userMeta ? userMeta.title || "" : "");
  var [saving, setSaving] = useState(false);

  function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    supabase.auth.updateUser({ data: { full_name: name.trim(), title: title.trim() } })
      .then(function (result) {
        setSaving(false);
        if (result.error) { showToast(result.error.message, "error"); return; }
        showToast("Profile saved");
      });
  }

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Profile</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FL>Full Name</FL>
          <InputField value={name} onChange={function (e) { setName(e.target.value); }} placeholder="Your name" />
        </div>
        <div>
          <FL>Title</FL>
          <InputField value={title} onChange={function (e) { setTitle(e.target.value); }} placeholder="e.g. Account Manager" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <AmberBtn onClick={handleSave} disabled={!name.trim() || saving} style={{ fontSize: 12 }}>
            {saving ? "Saving…" : "Save Profile"}
          </AmberBtn>
        </div>
      </div>
    </Card>
  );
}

export function CreateOrgSection({ onCreateOrg }) {
  var [orgName, setOrgName] = useState("");
  var [creating, setCreating] = useState(false);

  function handleCreate() {
    if (!orgName.trim() || creating) return;
    setCreating(true);
    onCreateOrg(orgName)
      .then(function () {
        showToast("Team created");
      })
      .catch(function (err) {
        setCreating(false);
        showToast(err.message || "Couldn't create team", "error");
      });
  }

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Team</div>
      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 14 }}>
        Create a team to collaborate with colleagues, share account access, and give leadership a read-only view of your portfolio.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <FL>Team Name</FL>
          <InputField
            value={orgName}
            onChange={function (e) { setOrgName(e.target.value); }}
            placeholder="e.g. OEC Account Team"
            onKeyDown={function (e) { if (e.key === "Enter") handleCreate(); }}
          />
        </div>
        <AmberBtn onClick={handleCreate} disabled={!orgName.trim() || creating} style={{ fontSize: 12, flexShrink: 0 }}>
          {creating ? "Creating…" : "Create Team"}
        </AmberBtn>
      </div>
    </Card>
  );
}

export function TeamSection({ org, role, members, pendingInvites, onInvite, onRevoke, onArchiveMember, onReactivateMember }) {
  var [email, setEmail]         = useState("");
  var [inviteRole, setInviteRole] = useState("member");
  var [inviting, setInviting]   = useState(false);
  var [revoking, setRevoking]   = useState(null);
  var [confirmArchive, setConfirmArchive] = useState(null); // member id mid-confirm
  var [busyMember, setBusyMember] = useState(null);
  var canManage = role === "owner";

  var activeMembers   = (members || []).filter(function (m) { return !m.is_inactive; });
  var inactiveMembers = (members || []).filter(function (m) { return m.is_inactive; });

  function handleArchive(memberId, memberEmail) {
    if (!onArchiveMember) return;
    setBusyMember(memberId);
    onArchiveMember(memberId).then(function () {
      setBusyMember(null); setConfirmArchive(null);
      showToast("Archived " + (memberEmail || "member"));
    }).catch(function (err) {
      setBusyMember(null);
      showToast(err.message || "Couldn't archive — check your connection", "error");
    });
  }

  function handleReactivate(memberId, memberEmail) {
    if (!onReactivateMember) return;
    setBusyMember(memberId);
    onReactivateMember(memberId).then(function () {
      setBusyMember(null);
      showToast("Reactivated " + (memberEmail || "member"));
    }).catch(function (err) {
      setBusyMember(null);
      showToast(err.message || "Couldn't reactivate — check your connection", "error");
    });
  }

  function handleInvite() {
    if (!email.trim() || inviting) return;
    var sentTo = email.trim();
    setInviting(true);
    onInvite(email, inviteRole)
      .then(function (result) {
        setInviting(false);
        setEmail("");
        if (result && result.emailSent) {
          showToast("Invite sent to " + sentTo);
        } else {
          showToast("Invite saved — email didn't send, share the link manually", "warning");
        }
      })
      .catch(function (err) {
        setInviting(false);
        showToast(err.message || "Couldn't send invite", "error");
      });
  }

  function handleCopyLink(p) {
    var msg = "You've been invited to " + org.name + " on Folios. " +
      "Sign up at " + window.location.origin + " using " + p.invited_email +
      " and your invite will be waiting.";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).then(
        function () { showToast("Invite link copied"); },
        function () { showToast("Couldn't copy — check permissions", "error"); }
      );
    } else {
      showToast("Clipboard not available", "error");
    }
  }

  function handleRevoke(memberId, memberEmail) {
    setRevoking(memberId);
    onRevoke(memberId)
      .then(function () {
        setRevoking(null);
        showToast("Removed " + (memberEmail || "member"));
      })
      .catch(function (err) {
        setRevoking(null);
        showToast(err.message || "Couldn't remove member", "error");
      });
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{org.name}</div>
        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {ROLE_LABELS[role] || role}
        </div>
      </div>

      {/* Member list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {activeMembers.map(function (m) {
          var isConfirming = confirmArchive === m.id;
          return (
            <div
              key={m.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", background: C.bgCardAlt, borderRadius: 8,
                border: "1px solid " + C.border,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                  {m.invited_email || "Team member"}
                </div>
                <div style={{ fontSize: 11, color: ROLE_COLORS[m.role] || C.textSub, fontWeight: 600 }}>
                  {ROLE_LABELS[m.role] || m.role}
                </div>
              </div>
              {canManage && m.role !== "owner" && (
                isConfirming ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                    <button
                      onClick={function () { handleArchive(m.id, m.invited_email); }}
                      disabled={busyMember === m.id}
                      style={{
                        background: "none", border: "1px solid " + C.redLine, borderRadius: 6,
                        padding: "4px 10px", fontSize: 11, color: C.red, cursor: "pointer",
                        fontFamily: "'Inter', system-ui, sans-serif", opacity: busyMember === m.id ? 0.5 : 1,
                      }}
                    >
                      {busyMember === m.id ? "…" : "Archive"}
                    </button>
                    <button
                      onClick={function () { setConfirmArchive(null); }}
                      style={{
                        background: "none", border: "1px solid " + C.border, borderRadius: 6,
                        padding: "4px 10px", fontSize: 11, color: C.textSub, cursor: "pointer",
                        fontFamily: "'Inter', system-ui, sans-serif",
                      }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={function () { setConfirmArchive(m.id); }}
                    style={{
                      background: "none", border: "1px solid " + C.border, borderRadius: 6,
                      padding: "4px 10px", fontSize: 11, color: C.red, cursor: "pointer",
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    Archive
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Former team — inactive members, with reactivate */}
      {inactiveMembers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Former Team
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {inactiveMembers.map(function (m) {
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: C.bgCard, borderRadius: 7,
                    border: "1px solid " + C.border, opacity: 0.75,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: C.textSub }}>{m.invited_email || "Team member"}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>
                      Archived{m.inactivated_at ? " · " + new Date(m.inactivated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""} · {ROLE_LABELS[m.role] || m.role}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={function () { handleReactivate(m.id, m.invited_email); }}
                      disabled={busyMember === m.id}
                      style={{
                        background: "none", border: "1px solid " + C.accentBorder, borderRadius: 6,
                        padding: "4px 10px", fontSize: 11, color: C.accent, cursor: "pointer",
                        fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600,
                        opacity: busyMember === m.id ? 0.5 : 1,
                      }}
                    >
                      {busyMember === m.id ? "…" : "Reactivate"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Pending Invites
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pendingInvites.map(function (p) {
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: C.bgCard, borderRadius: 7,
                    border: "1px solid " + C.border, opacity: 0.75,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: C.textSub }}>{p.invited_email}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>Awaiting acceptance · {ROLE_LABELS[p.role]}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button
                      onClick={function () { handleCopyLink(p); }}
                      style={{
                        background: "none", border: "1px solid " + C.border, borderRadius: 6,
                        padding: "4px 10px", fontSize: 11, color: C.accent, cursor: "pointer",
                        fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600,
                      }}
                    >
                      Copy Link
                    </button>
                    {canManage && (
                      <button
                        onClick={function () { handleRevoke(p.id, p.invited_email); }}
                        style={{
                          background: "none", border: "none", color: C.textMuted,
                          fontSize: 11, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif",
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite form (owner only) */}
      {canManage && (
        <div style={{ borderTop: "1px solid " + C.border, paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            Invite Member
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FL>Email</FL>
              <InputField
                value={email}
                onChange={function (e) { setEmail(e.target.value); }}
                placeholder="colleague@company.com"
                type="email"
                onKeyDown={function (e) { if (e.key === "Enter") handleInvite(); }}
              />
            </div>
            <div style={{ minWidth: 130 }}>
              <FL>Role</FL>
              <select
                value={inviteRole}
                onChange={function (e) { setInviteRole(e.target.value); }}
                style={{
                  width: "100%", background: C.bgDropdown, border: "1px solid " + C.border,
                  borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text,
                  fontFamily: "'Inter', system-ui, sans-serif", outline: "none", cursor: "pointer",
                }}
              >
                <option value="member">Member</option>
                <option value="leadership">Leadership (read-only)</option>
              </select>
            </div>
            <AmberBtn onClick={handleInvite} disabled={!email.trim() || inviting} style={{ fontSize: 12, flexShrink: 0 }}>
              {inviting ? "Sending…" : "Send Invite"}
            </AmberBtn>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            Members can log meetings and manage accounts. Leadership gets a read-only portfolio view.
          </div>
        </div>
      )}
    </Card>
  );
}

function PipPrefsSection({ userId }) {
  var pipFacts = usePipFacts(userId);
  var [draft, setDraft] = useState("");
  var [saving, setSaving] = useState(false);

  function add() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    pipFacts.addFact(draft.trim())
      .then(function () { setDraft(""); setSaving(false); showToast("Pip will remember that"); })
      .catch(function (err) { setSaving(false); showToast(err.message || "Couldn't save", "error"); });
  }

  function remove(id) {
    pipFacts.removeFact(id).then(function () { showToast("Fact removed"); });
  }

  function toggle(row) {
    pipFacts.toggleFactActive(row.id, !row.active);
  }

  var placeholder = PIP_FACT_PLACEHOLDERS[Math.floor(Math.random() * PIP_FACT_PLACEHOLDERS.length)];

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Pip preferences</div>
      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 14 }}>
        Things Pip should remember about you. These are injected into every Pip prompt — keep them short and durable.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <FL>New preference</FL>
          <InputField
            value={draft}
            onChange={function (e) { setDraft(e.target.value); }}
            placeholder={placeholder}
            onKeyDown={function (e) { if (e.key === "Enter") add(); }}
          />
        </div>
        <AmberBtn onClick={add} disabled={!draft.trim() || saving} style={{ fontSize: 12, flexShrink: 0 }}>
          {saving ? "Saving…" : "Add"}
        </AmberBtn>
      </div>

      {pipFacts.facts.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic", padding: "8px 0" }}>
          Nothing yet — try a preference above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pipFacts.facts.map(function (f) {
            return (
              <div
                key={f.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px",
                  background: f.active ? C.bgCardAlt : "transparent",
                  borderRadius: 8,
                  border: "1px solid " + C.border,
                  opacity: f.active ? 1 : 0.55,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, textDecoration: f.active ? "none" : "line-through" }}>
                    {f.fact}
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', ui-monospace, monospace", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    {f.source === "pip_inferred" ? "Pip noted this" : "You told Pip"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={function () { toggle(f); }}
                    title={f.active ? "Pause this fact" : "Reactivate"}
                    aria-label={f.active ? "Pause this fact" : "Reactivate this fact"}
                    style={{
                      background: "none", border: "1px solid " + C.border, borderRadius: 6,
                      padding: "4px 10px", fontSize: 11, color: C.textSub, cursor: "pointer",
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    {f.active ? "✓" : "✗"}
                  </button>
                  <button
                    onClick={function () { remove(f.id); }}
                    aria-label="Delete this fact"
                    style={{
                      background: "none", border: "1px solid " + C.border, borderRadius: 6,
                      padding: "4px 10px", fontSize: 11, color: C.red, cursor: "pointer",
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PipUsageDetails({ userId, onClose }) {
  var [rows, setRows]       = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError]     = useState(null);

  useEffect(function () {
    if (!userId) return;
    var cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("folio_pip_usage")
      .select("endpoint, mode, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_micro_cents, created_at")
      .eq("user_id", userId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(function (r) {
        setLoading(false);
        if (r.error) { setError(r.error.message); return; }
        setRows(r.data || []);
      }, function (err) {
        setLoading(false);
        setError(err && err.message);
      });
  }, [userId]);

  var stats = useMemo(function () {
    // Calls per day (last 30) — keyed by ISO date string.
    var perDay = {};
    var endpointCost = {};
    var inputSum = 0, cacheReadSum = 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = [];
    for (var i = 29; i >= 0; i--) {
      var d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      var key = d.toISOString().slice(0, 10);
      perDay[key] = 0;
      days.push({ key: key, label: d });
    }
    rows.forEach(function (row) {
      var k = (row.created_at || "").slice(0, 10);
      if (k in perDay) perDay[k] += 1;
      var label = (row.endpoint || "?") + (row.mode ? ":" + row.mode : "");
      endpointCost[label] = (endpointCost[label] || 0) + (row.cost_micro_cents || 0);
      inputSum     += row.input_tokens || 0;
      cacheReadSum += row.cache_read_tokens || 0;
    });
    var dailyCounts = days.map(function (d) { return { key: d.key, count: perDay[d.key], label: d.label }; });
    var top = Object.keys(endpointCost)
      .map(function (k) { return { label: k, cost: endpointCost[k] }; })
      .sort(function (a, b) { return b.cost - a.cost; })
      .slice(0, 3);
    var cacheRatio = (inputSum + cacheReadSum) > 0 ? cacheReadSum / (inputSum + cacheReadSum) : 0;
    return { dailyCounts: dailyCounts, top: top, cacheRatio: cacheRatio, total: rows.length };
  }, [rows]);

  var maxDaily = stats.dailyCounts.reduce(function (m, d) { return d.count > m ? d.count : m; }, 1);

  return (
    <Modal title="Pip Usage — Last 30 Days" onClose={onClose} width={520}>
      {loading && <div style={{ fontSize: 13, color: C.textMuted, padding: 20, textAlign: "center" }}>Loading…</div>}
      {error && <div style={{ fontSize: 13, color: C.textSub, padding: 14, lineHeight: 1.5 }}>Couldn't load usage history — run supabase/phase3_pip_usage.sql if not yet done.</div>}
      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Sparkline */}
          <div>
            <div style={{ fontFamily: SETTINGS_MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Calls per day · {stats.total} total
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, paddingBottom: 4, borderBottom: "1px solid " + C.ruleSoft }}>
              {stats.dailyCounts.map(function (d) {
                var h = d.count === 0 ? 2 : Math.max(3, Math.round((d.count / maxDaily) * 52));
                return (
                  <div
                    key={d.key}
                    title={d.key + " · " + d.count + " call" + (d.count === 1 ? "" : "s")}
                    style={{
                      flex: 1, height: h,
                      background: d.count === 0 ? C.ruleSoft : C.accent,
                      opacity: d.count === 0 ? 0.4 : 0.85,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Top endpoints */}
          <div>
            <div style={{ fontFamily: SETTINGS_MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Most expensive endpoints
            </div>
            {stats.top.length === 0 && <div style={{ fontSize: 12, color: C.textMuted }}>No calls yet.</div>}
            {stats.top.map(function (t, idx) {
              var dollars = t.cost / 1000000;
              return (
                <div key={t.label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "7px 0",
                  borderTop: idx === 0 ? "none" : "1px solid " + C.ruleSoft,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 13,
                }}>
                  <span style={{ color: C.text }}>{t.label}</span>
                  <span style={{ color: C.textSub, fontVariantNumeric: "tabular-nums", fontFamily: SETTINGS_MONO, fontSize: 12 }}>
                    {dollars < 1 ? "$" + dollars.toFixed(3) : "$" + dollars.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Cache hit ratio */}
          <div>
            <div style={{ fontFamily: SETTINGS_MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Cache hit ratio
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                {Math.round(stats.cacheRatio * 100)}%
              </div>
              <div style={{ fontSize: 11, color: C.textMuted }}>
                cache reads vs. fresh inputs · higher = cheaper
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PipUsageSection({ userId }) {
  var usage = usePipUsage(userId);
  var [showDetails, setShowDetails] = useState(false);
  var now = new Date();
  var monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Format dollar amount with sensible precision: < $1 → 3 decimals,
  // ≥ $1 → 2 decimals. Keeps cheap usage from rendering as "$0.00".
  var spendText;
  if (usage.error) {
    spendText = "—";
  } else if (usage.spendUsd < 1) {
    spendText = "$" + usage.spendUsd.toFixed(3);
  } else {
    spendText = "$" + usage.spendUsd.toFixed(2);
  }

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Pip usage</div>
      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 14 }}>
        Estimated spend on Pip API calls this calendar month. Tracks every brief, summary, chat, and background state refresh.
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "baseline" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
            Calls
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {usage.loading ? "…" : usage.error ? "—" : usage.callCount}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
            Estimated spend
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {usage.loading ? "…" : spendText}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 12, fontFamily: "'JetBrains Mono', ui-monospace, monospace", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {monthLabel}
      </div>
      {usage.error && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          (Usage table not initialized yet — run supabase/phase3_pip_usage.sql.)
        </div>
      )}
      {!usage.error && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={function () { setShowDetails(true); }}
            style={{
              background: "none", border: "none", padding: 0,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12, color: C.accent,
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            View details →
          </button>
        </div>
      )}
      {showDetails && <PipUsageDetails userId={userId} onClose={function () { setShowDetails(false); }} />}
    </Card>
  );
}

var SETTINGS_MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SETTINGS_SERIF = "'Fraunces', Georgia, serif";

var EVENT_LABELS = {
  meeting_logged:     "Meeting logged",
  item_added:         "Item added",
  item_completed:     "Item completed",
  contact_added:      "Contact added",
  account_created:    "Account created",
  account_updated:    "Account updated",
  account_archived:   "Account archived",
  account_reactivated:"Account reactivated",
  account_merged:     "Account merged",
  gauge_status_changed: "Project status changed",
  cadence_set:        "Cadence set",
  note_saved:         "Note saved",
};

function formatEvent(type) {
  if (EVENT_LABELS[type]) return EVENT_LABELS[type];
  return type.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function ActivitySection({ userId, orgId, role, members, accounts }) {
  var isOwner = role === "owner";
  var [accountFilter,   setAccountFilter]   = useState(null);
  var [eventFilter,     setEventFilter]     = useState(null);
  var [userFilter,      setUserFilter]      = useState(null);
  var [rangeFilter,     setRangeFilter]     = useState("30d");

  // Memoized so the ISO string is stable across renders for the same
  // rangeFilter — otherwise Date.now() recomputes every render, filters
  // gets a new identity, useActivity refetches in a loop, and the dropdown
  // strobes.
  var fromDate = useMemo(function () {
    if (rangeFilter === "all") return null;
    var days = rangeFilter === "7d" ? 7 : rangeFilter === "30d" ? 30 : 90;
    return new Date(Date.now() - days * 86400000).toISOString();
  }, [rangeFilter]);

  var filters = useMemo(function () {
    return {
      accountId: accountFilter,
      eventType: eventFilter,
      userId:    userFilter,
      fromDate:  fromDate,
    };
  }, [accountFilter, eventFilter, userFilter, fromDate]);

  var { rows, loading, error, done, loadMore } = useActivity(orgId, userId, isOwner, filters);

  var accountById = useMemo(function () {
    var m = {};
    (accounts || []).forEach(function (a) { m[a.id] = a; });
    return m;
  }, [accounts]);

  var memberById = useMemo(function () {
    var m = {};
    (members || []).forEach(function (x) { if (x.user_id) m[x.user_id] = x; });
    return m;
  }, [members]);

  var eventTypes = useMemo(function () {
    var seen = {};
    rows.forEach(function (r) { seen[r.event_type] = true; });
    return Object.keys(seen).sort();
  }, [rows]);

  if (!orgId) {
    return (
      <Card>
        <FL>Activity</FL>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>
          Create or join an org to see the activity feed.
        </div>
      </Card>
    );
  }

  function clearFilters() {
    setAccountFilter(null); setEventFilter(null); setUserFilter(null);
  }
  var hasFilters = accountFilter || eventFilter || userFilter;

  var rangeChips = [
    { id: "7d",  label: "7d"   },
    { id: "30d", label: "30d"  },
    { id: "90d", label: "90d"  },
    { id: "all", label: "All"  },
  ];

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <FL style={{ marginBottom: 0 }}>Activity</FL>
        <div style={{ fontFamily: SETTINGS_MONO, fontSize: 10, color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {isOwner ? "Org-wide" : "Your actions"}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {rangeChips.map(function (c) {
          var active = rangeFilter === c.id;
          return (
            <button
              key={c.id}
              onClick={function () { setRangeFilter(c.id); }}
              style={{
                background: active ? C.accent : "transparent",
                color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule),
                borderRadius: 999, padding: "3px 10px",
                fontFamily: SETTINGS_MONO, fontSize: 10, cursor: "pointer",
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}
            >
              {c.label}
            </button>
          );
        })}

        <select
          value={accountFilter || ""}
          onChange={function (e) { setAccountFilter(e.target.value || null); }}
          aria-label="Filter by account"
          style={{
            background: C.surface, border: "1px solid " + C.rule, borderRadius: 6,
            padding: "3px 8px", color: C.textSoft, fontSize: 11, fontFamily: SETTINGS_MONO, cursor: "pointer",
          }}
        >
          <option value="">All accounts</option>
          {(accounts || []).map(function (a) {
            return <option key={a.id} value={a.id}>{a.name}</option>;
          })}
        </select>

        {eventTypes.length > 0 && (
          <select
            value={eventFilter || ""}
            onChange={function (e) { setEventFilter(e.target.value || null); }}
            aria-label="Filter by event type"
            style={{
              background: C.surface, border: "1px solid " + C.rule, borderRadius: 6,
              padding: "3px 8px", color: C.textSoft, fontSize: 11, fontFamily: SETTINGS_MONO, cursor: "pointer",
            }}
          >
            <option value="">All events</option>
            {eventTypes.map(function (e) {
              return <option key={e} value={e}>{formatEvent(e)}</option>;
            })}
          </select>
        )}

        {isOwner && members && members.length > 1 && (
          <select
            value={userFilter || ""}
            onChange={function (e) { setUserFilter(e.target.value || null); }}
            aria-label="Filter by user"
            style={{
              background: C.surface, border: "1px solid " + C.rule, borderRadius: 6,
              padding: "3px 8px", color: C.textSoft, fontSize: 11, fontFamily: SETTINGS_MONO, cursor: "pointer",
            }}
          >
            <option value="">All users</option>
            {members.map(function (m) {
              return <option key={m.user_id || m.id} value={m.user_id || ""}>{m.invited_email || "Team member"}</option>;
            })}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: "transparent", border: "none", color: C.textMuted,
              fontSize: 11, cursor: "pointer", fontFamily: SETTINGS_MONO, padding: "3px 8px",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div role="alert" style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{error}</div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ fontSize: 13, color: C.textMuted, padding: "16px 0", textAlign: "center" }}>
          No activity in this range.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(function (r) {
          var when = new Date(r.created_at);
          var dateLabel = when.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                          " · " + when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          var who = memberById[r.user_id];
          var whoLabel = who ? (who.invited_email || "Team member") : "Someone";
          var what = formatEvent(r.event_type);
          var acct = r.account_id ? accountById[r.account_id] : null;
          var payloadStr = r.payload && Object.keys(r.payload).length > 0
            ? Object.keys(r.payload).map(function (k) { return r.payload[k]; }).filter(Boolean).join(" · ")
            : null;
          return (
            <div key={r.id} style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
              padding: "8px 10px",
              background: C.surface,
              border: "1px solid " + C.rule,
              borderRadius: 6,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: C.text }}>
                  <span style={{ color: C.accent, fontWeight: 500 }}>{whoLabel}</span>
                  <span style={{ color: C.textSoft }}> {what.toLowerCase()}</span>
                  {acct && (
                    <>
                      <span style={{ color: C.textMuted }}> on </span>
                      <span style={{ color: C.textSoft }}>{acct.name}</span>
                    </>
                  )}
                </div>
                {payloadStr && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {payloadStr}
                  </div>
                )}
              </div>
              <div style={{ fontFamily: SETTINGS_MONO, fontSize: 10, color: C.textMuted, fontFeatureSettings: '"tnum"', whiteSpace: "nowrap" }}>
                {dateLabel}
              </div>
            </div>
          );
        })}
      </div>

      {!done && rows.length >= 50 && (
        <button
          onClick={loadMore}
          disabled={loading}
          style={{
            marginTop: 10, background: "transparent", border: "1px solid " + C.rule,
            borderRadius: 6, padding: "6px 14px", color: C.textSoft,
            fontFamily: SETTINGS_MONO, fontSize: 11, cursor: "pointer",
            opacity: loading ? 0.5 : 1, width: "100%",
          }}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </Card>
  );
}

function NotificationsSection() {
  var initialPerm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  var [perm, setPerm] = useState(initialPerm);
  var initialBanners = (function () {
    try { return localStorage.getItem("folio_meeting_banners_enabled") !== "0"; }
    catch (e) { return true; }
  })();
  var [banners, setBanners] = useState(initialBanners);

  function requestPerm() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") {
      setPerm(Notification.permission);
      return;
    }
    Notification.requestPermission().then(function (p) {
      try { localStorage.setItem("folio_meeting_notifications", p); } catch (e) {}
      try { localStorage.setItem("folio_meeting_notif_prompted", "1"); } catch (e) {}
      setPerm(p);
    });
  }

  function toggleBanners() {
    var next = !banners;
    setBanners(next);
    try { localStorage.setItem("folio_meeting_banners_enabled", next ? "1" : "0"); } catch (e) {}
  }

  var permLabel = perm === "granted" ? "Allowed"
    : perm === "denied" ? "Blocked"
    : perm === "unsupported" ? "Unsupported"
    : "Not asked";
  var permColor = perm === "granted" ? C.accent
    : perm === "denied" ? C.red
    : C.textSub;

  return (
    <Card>
      <div style={{ fontFamily: SETTINGS_SERIF, fontSize: 20, fontWeight: 400, color: C.text, marginBottom: 4 }}>
        Cadence Reminders
      </div>
      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 14 }}>
        I'll nudge you 30 min, 5 min, and at the start of your scheduled cadences.
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 0", borderTop: "1px solid " + C.rule, gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Browser notifications</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            System pop-ups when the tab is in the background.{" "}
            <span style={{ color: permColor, fontWeight: 600, fontFamily: SETTINGS_MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {permLabel}
            </span>
          </div>
        </div>
        {perm === "default" && (
          <button
            onClick={requestPerm}
            style={{
              background: C.accentSubtle, color: C.accent, border: "1px solid " + C.accentBorder,
              borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", flexShrink: 0,
            }}
          >
            Allow
          </button>
        )}
        {perm === "denied" && (
          <span style={{ fontSize: 11, color: C.textMuted, maxWidth: 180, textAlign: "right" }}>
            Allow in your browser's site settings.
          </span>
        )}
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 0", borderTop: "1px solid " + C.rule, gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>In-app banners</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            Show reminder bars at the top of Folios.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={banners}
          onClick={toggleBanners}
          style={{
            width: 44, height: 24, borderRadius: 999,
            background: banners ? C.accent : C.surface3,
            border: "1px solid " + (banners ? C.accent : C.rule),
            cursor: "pointer", position: "relative", flexShrink: 0,
            transition: "background 0.18s ease, border-color 0.18s ease",
          }}
        >
          <span style={{
            position: "absolute",
            top: 1, left: banners ? 21 : 1,
            width: 20, height: 20, borderRadius: "50%",
            background: "#fff",
            transition: "left 0.18s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </button>
      </div>
    </Card>
  );
}

function AppearanceSection() {
  var t = useTheme();
  var options = [
    { id: "dark",  label: "Dark",  hint: "Default — deep teal" },
    { id: "light", label: "Light", hint: "Cream paper" },
  ];
  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Appearance</div>
      <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 14 }}>
        Choose how Folios looks. Switches instantly, sticks across sessions.
      </div>
      <div role="radiogroup" aria-label="Theme" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {options.map(function (o) {
          var active = t.theme === o.id;
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={active}
              onClick={function () { t.setTheme(o.id); }}
              style={{
                textAlign: "left",
                background: active ? C.accentFaint : "transparent",
                border: "1px solid " + (active ? C.accentBorder : C.rule),
                borderRadius: 10,
                padding: "12px 14px",
                cursor: "pointer",
                fontFamily: "'Inter', system-ui, sans-serif",
                transition: "background 0.18s ease, border-color 0.18s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span aria-hidden="true" style={{
                  display: "inline-block", width: 14, height: 14, borderRadius: "50%",
                  background: o.id === "dark" ? "#0c1615" : "#f6f4ef",
                  border: "1px solid " + (o.id === "dark" ? "#1c2c2a" : "#e3ddcd"),
                  boxShadow: active ? "0 0 0 2px " + C.accentBorder : "none",
                }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: active ? C.accent : C.text }}>{o.label}</div>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: SETTINGS_MONO, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {o.hint}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function SettingsView({ userId, userMeta, orgId, role, members, accounts }) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "8px 0 40px" }}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
        <Mark tab="settings" size={52} />
        <div>
          <div style={{ fontFamily: SETTINGS_SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Settings
          </div>
          <div style={{ fontFamily: SETTINGS_MONO, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
            Appearance · Notifications · Profile · Pip · Activity
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <AppearanceSection />

        <NotificationsSection />

        <ProfileSection userMeta={userMeta} />

        {userId && <PipPrefsSection userId={userId} />}

        {userId && <PipUsageSection userId={userId} />}

        {orgId && (
          <ActivitySection
            userId={userId}
            orgId={orgId}
            role={role}
            members={members}
            accounts={accounts}
          />
        )}

      </div>
    </div>
  );
}
