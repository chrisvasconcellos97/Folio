// LitPill — primary page CTA. Mist fill, teal border + glow, pulsing teal
// pip dot. CSS rules live in index.html (.lit-pill) so dark + light both
// theme correctly via token swap. Optionally hide the dot via showDot=false.
//
// Use this in place of AmberBtn when a button is meant to be THE primary
// action on the page (e.g. "Send to Pip", footer "+ Account").

export function LitPill({ onClick, children, style, disabled, showDot, type, title, ariaLabel }) {
  var dot = showDot === false ? null : <span className="pip-dot" aria-hidden="true" />;
  return (
    <button
      type={type || "button"}
      onClick={onClick}
      disabled={!!disabled}
      title={title}
      aria-label={ariaLabel}
      className="lit-pill"
      style={style}
    >
      {dot}
      <span>{children}</span>
    </button>
  );
}

export default LitPill;
