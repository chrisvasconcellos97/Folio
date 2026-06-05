import { C } from "../lib/colors";
import { LitPill } from "./LitPill";

var btnBase = {
  cursor: "pointer",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: 600,
  fontSize: 12,
  borderRadius: 24,
  padding: "8px 16px",
  border: "none",
  transition: "opacity 0.15s",
};

// Primary CTA — solid teal fill + teal glow (.cta-glow). THE main action on
// a screen / the confirm action in a modal. The glow ties it into the same
// family as the secondary CTA and the rail's lit-pill so users learn
// "teal glow = action" everywhere.
// NOTE: type defaults to "button" (avoids accidental form submits). If you use
// this as a form's submit control, you MUST pass type="submit" — otherwise the
// click does nothing. (This bit AuthView's Sign In after the CTA refactor.)
export function AmberBtn({ onClick, children, style, disabled, type, title, ariaLabel }) {
  return (
    <button
      type={type || "button"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="cta-glow"
      style={Object.assign({}, btnBase, {
        background: disabled ? C.accentDim : C.accent,
        color: "#fff",
        opacity: disabled ? 0.5 : 1,
      }, style || {})}
    >
      {children}
    </button>
  );
}

// Secondary CTA — mist fill + teal border + soft glow, no pulse dot. For
// supporting positive actions (Brief Me, Edit, + Add). One notch below the
// primary: framed, not filled. (The rail's "+ Account" keeps its pulsing
// dot via LitPill directly — the dot signals a standing invitation, which
// is not what a normal secondary button means.)
export function SecondaryCTA({ onClick, children, style, disabled, type, title, ariaLabel }) {
  return (
    <LitPill
      onClick={onClick}
      disabled={disabled}
      showDot={false}
      type={type}
      title={title}
      ariaLabel={ariaLabel}
      style={style}
    >
      {children}
    </LitPill>
  );
}

export function SecBtn({ onClick, children, style, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={Object.assign({}, btnBase, {
        background: C.bgCardAlt,
        color: C.textSub,
        border: "1px solid " + C.border,
        opacity: disabled ? 0.5 : 1,
      }, style || {})}
    >
      {children}
    </button>
  );
}

export function DangerBtn({ onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={Object.assign({}, btnBase, {
        background: C.redFaint,
        color: C.red,
        border: "1px solid " + C.redLine,
      }, style || {})}
    >
      {children}
    </button>
  );
}

export { AmberBtn as AccentBtn };
