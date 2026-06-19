import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { MarkdownText } from "../../components/MarkdownText";
import { HexSignature } from "../../lib/hexMotif";
import { useMondayPack } from "../../hooks/useMondayPack";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

// Home teaser for the Monday 1:1 pack — read + count chips + "Open pack".
// Runs the same useMondayPack source as the full hub section (cache-gated, so no
// extra model call). Shown only in the Monday window (see shouldShowMondayCard).
export function MondayPackCard({ userId, cadence, accounts, profileProse, facts, personName, onOpen, isMobile }) {
  var pack = useMondayPack(userId, cadence, {
    accounts: accounts,
    profileProse: profileProse,
    facts: facts || [],
    personName: personName,
  });
  var s = pack.sections;
  if (!s) return null;

  var c = s.counts;
  var chips = [];
  if (c.slipped) chips.push({ label: c.slipped + " slipped", color: C.red });
  if (c.open)    chips.push({ label: c.open + " open", color: C.yellow });
  if (c.kept)    chips.push({ label: c.kept + " kept", color: C.green });
  if (pack.bossAsks.length) chips.push({ label: pack.bossAsks.length + " boss ask" + (pack.bossAsks.length > 1 ? "s" : ""), color: C.accent });
  if (c.owedMe)  chips.push({ label: c.owedMe + " owed you", color: C.textMuted });

  var teaser = pack.read
    ? pack.read.split("\n")[0]
    : (c.slipped || c.open
        ? "Here's where your word stands going into the 1:1."
        : "Quiet week — good time to get ahead of the boss's questions.");

  return (
    <div style={{
      maxWidth: 600,
      margin: isMobile ? "0 16px 12px" : "0 auto 12px",
      position: "relative",
      background: C.accentGlow, border: "1px solid " + C.accentLine,
      borderLeft: "3px solid " + C.accent, borderRadius: 12,
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <PipMark size={9} color={C.accent} glow pulse={pack.loading} />
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Monday 1:1 Pack{personName ? " · " + personName : ""}
        </div>
      </div>

      <MarkdownText text={teaser} style={{ fontSize: 14, color: C.text, lineHeight: 1.55, marginBottom: chips.length ? 10 : 12 }} />

      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {chips.map(function (ch, i) {
            return (
              <span key={i} style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 700,
                color: ch.color, background: C.surface,
                border: "1px solid " + C.rule, borderRadius: 20, padding: "3px 9px",
              }}>{ch.label}</span>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="cta-glow"
        style={{
          background: C.accentDeep, border: "1px solid " + C.accent, borderRadius: 8,
          padding: "8px 18px", fontSize: 13, fontWeight: 600, color: C.bg,
          fontFamily: INTER, cursor: "pointer",
        }}
      >
        Open the pack →
      </button>

      <HexSignature cells={5} peak={0.3} style={{ position: "absolute", right: -6, bottom: -10, pointerEvents: "none" }} />
    </div>
  );
}
