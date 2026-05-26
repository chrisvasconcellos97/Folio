import { useState } from "react";
import { C } from "../../lib/colors";
import { Card } from "../../components/Card";
import { FL } from "../../components/FieldLabel";
import { InputField } from "../../components/InputField";
import { AmberBtn } from "../../components/Buttons";
import { showToast } from "../../components/Toast";
import { supabase } from "../../lib/supabase";

var ROLE_LABELS = { owner: "Owner", member: "Member", director: "Director (read-only)" };
var ROLE_COLORS = { owner: C.accent, member: C.blue, director: C.textSub };

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

function CreateOrgSection({ onCreateOrg }) {
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

function TeamSection({ org, role, members, pendingInvites, onInvite, onRevoke }) {
  var [email, setEmail]         = useState("");
  var [inviteRole, setInviteRole] = useState("member");
  var [inviting, setInviting]   = useState(false);
  var [revoking, setRevoking]   = useState(null);
  var canManage = role === "owner";

  function handleInvite() {
    if (!email.trim() || inviting) return;
    setInviting(true);
    onInvite(email, inviteRole)
      .then(function () {
        setInviting(false);
        setEmail("");
        showToast("Invite sent to " + email.trim());
      })
      .catch(function (err) {
        setInviting(false);
        showToast(err.message || "Couldn't send invite", "error");
      });
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
        {members.map(function (m) {
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
                <button
                  onClick={function () { handleRevoke(m.id, m.invited_email); }}
                  disabled={revoking === m.id}
                  style={{
                    background: "none", border: "1px solid " + C.border, borderRadius: 6,
                    padding: "4px 10px", fontSize: 11, color: C.red, cursor: "pointer",
                    fontFamily: "'Inter', system-ui, sans-serif", opacity: revoking === m.id ? 0.5 : 1,
                  }}
                >
                  {revoking === m.id ? "…" : "Remove"}
                </button>
              )}
            </div>
          );
        })}
      </div>

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
                <option value="director">Director (read-only)</option>
              </select>
            </div>
            <AmberBtn onClick={handleInvite} disabled={!email.trim() || inviting} style={{ fontSize: 12, flexShrink: 0 }}>
              {inviting ? "Sending…" : "Send Invite"}
            </AmberBtn>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            Members can log meetings and manage accounts. Directors get a read-only portfolio view.
          </div>
        </div>
      )}
    </Card>
  );
}

export function SettingsView({ userMeta, org, role, members, pendingInvites, onCreateOrg, onInvite, onRevoke }) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "8px 0 40px" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 20 }}>Settings</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ProfileSection userMeta={userMeta} />

        {org ? (
          <TeamSection
            org={org}
            role={role}
            members={members}
            pendingInvites={pendingInvites}
            onInvite={onInvite}
            onRevoke={onRevoke}
          />
        ) : (
          <CreateOrgSection onCreateOrg={onCreateOrg} />
        )}
      </div>
    </div>
  );
}
