// Folio folder mark — three-quarter folder with orb on front cover.
// size controls width; height is always size * 0.818 (88:72 aspect ratio)

export function FolioIcon({ size = 40 }) {
  var h = Math.round(size * 0.818);
  return (
    <div className="folio-mark">
      <svg width={size} height={h} viewBox="0 0 88 72" aria-hidden="true">
        <rect className="fm-folder-back"  x="2"  y="12" width="84" height="56" rx="3"/>
        <path className="fm-folder-tab"   d="M 4 14 Q 4 8 10 8 L 30 8 Q 34 8 36 12 L 40 14 Z"/>
        <rect className="fm-folder-front" x="4"  y="22" width="80" height="44" rx="3"/>
        <line className="fm-folder-edge"  x1="6" y1="22" x2="82" y2="22"/>
        <circle className="fm-orb-glow"   cx="44" cy="44" r="11"/>
        <circle className="fm-orb-ring"   cx="44" cy="44" r="11"/>
        <circle className="fm-orb-head"   cx="44" cy="40" r="4"/>
        <circle className="fm-orb-tail"   cx="44" cy="48.5" r="2.8"/>
      </svg>
    </div>
  );
}
