export const C = {
  bg:           "#12100A",
  bgCard:       "#1A1610",
  bgCardAlt:    "#211C12",
  bgDark:       "#0D0B07",
  bgPill:       "#2A2215",
  bgPillActive: "#3D3020",

  accent:      "#C8883A",
  accentDim:   "#8A5A22",
  accentGlow:  "rgba(200,136,58,0.12)",

  green:   "#4ADE80",
  yellow:  "#FBBF24",
  red:     "#F87171",
  blue:    "#67C8F9",
  purple:  "#7C5CBF",

  text:      "#F0EDE8",
  textSub:   "#9E9888",
  textMuted: "#4A4035",

  border: "#2A2215",
};

export function hexToRgb(hex) {
  if (!hex || hex[0] !== "#") return "0,0,0";
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return r + "," + g + "," + b;
}
