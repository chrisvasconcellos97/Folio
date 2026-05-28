import { C } from "../../lib/colors";
import { NavMark } from "../../components/NavMark";
import { Card } from "../../components/Card";
import { TeamSection, CreateOrgSection } from "../settings/SettingsView";

var SERIF = "'Fraunces', Georgia, serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// Future home for the org-chart / reporting-structure view. Stays simple
// for v1 — surfaces the org card, members, invites, and a placeholder
// strip teasing where the org chart will live.
export function TeamView({
  org,
  role,
  members,
  pendingInvites,
  onCreateOrg,
  onInvite,
  onRevoke,
  onArchiveMember,
  onReactivateMember,
}) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "8px 0 40px" }}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, color: C.accent, flexShrink: 0 }}>
          <NavMark id="team" size={40} />
        </span>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Team
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
            Members · Invites · Structure
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {org ? (
          <TeamSection
            org={org}
            role={role}
            members={members}
            pendingInvites={pendingInvites}
            onInvite={onInvite}
            onRevoke={onRevoke}
            onArchiveMember={onArchiveMember}
            onReactivateMember={onReactivateMember}
          />
        ) : (
          <CreateOrgSection onCreateOrg={onCreateOrg} />
        )}

        <Card>
          <div style={{
            fontFamily: MONO, fontSize: 10, color: C.textMuted,
            textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8,
          }}>
            Org Structure · Coming soon
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 17, color: C.text, marginBottom: 6 }}>
            Reporting lines, not just a roster.
          </div>
          <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55 }}>
            Soon you'll be able to set who reports to whom and group members
            by department here. That structure will power assignment defaults,
            org-wide rollups, and a visual chart. For now, this is a
            placeholder so the team page knows where it's going.
          </div>
        </Card>
      </div>
    </div>
  );
}
