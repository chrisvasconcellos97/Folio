// Account Narrative Memory (the "knows my accounts cold" layer) — PURE helpers.
//
// Pip re-derives a structured 4-part STORY of each account from the evidence floor
// whenever the account materially changes, and surfaces it on the high-frequency
// surfaces (cadence pre-call brief, account page, daily brief; chat rides free via
// the shared builder). This module holds the deterministic pieces; the Sonnet
// synthesis pass lives in api/account-narrative.js (Stage 2).
//
// THE LOCKED DESIGN RULE: the narrative is RE-DERIVED, never accumulating. Each
// rebuild discards the prior story and reads the evidence fresh, so a wrong
// conclusion can't lodge as a permanent lens (bias-lock). validateNarrative()
// only defends the SHAPE; the freshness/correctness comes from re-derivation +
// the fingerprint gate (computeContextFingerprint in accountContext.js).
//
// Shape stored in folio_pip_account_state.narrative (jsonb):
//   { arc, standing, hinges_on, trajectory, trajectory_why, as_of }

export var NARRATIVE_TRAJECTORIES = { warming: 1, cooling: 1, steady: 1 };

function clean(s, max) {
  if (s == null) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  if (max && s.length > max) s = s.slice(0, max - 1) + "…";
  return s;
}

// Defend the model's output into a clean narrative object, or null. The CORE
// field is `standing` (where it stands now) — without it there's no story, so a
// narrative missing it is dropped rather than rendered half-empty.
export function validateNarrative(obj) {
  if (!obj || typeof obj !== "object") return null;
  var standing = clean(obj.standing, 400);
  if (!standing) return null;
  var traj = NARRATIVE_TRAJECTORIES[obj.trajectory] ? obj.trajectory : "steady";
  var asOf = /^\d{4}-\d{2}-\d{2}$/.test(obj.as_of || "") ? obj.as_of : null;
  return {
    arc:            clean(obj.arc, 400),
    standing:       standing,
    hinges_on:      clean(obj.hinges_on, 300),
    trajectory:     traj,
    trajectory_why: clean(obj.trajectory_why, 300),
    as_of:          asOf,
  };
}

// Parse the model's raw text into a validated narrative (or null). Strips code
// fences, tolerates prose-wrapped JSON via a {...} salvage, then runs the shape
// guard. Used by api/account-narrative.js; pure so it's unit-tested here.
export function parseNarrativeResponse(text) {
  if (!text) return null;
  var clean = String(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  var parsed = null;
  try { parsed = JSON.parse(clean); } catch (_) {
    var m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch (__) { parsed = null; } }
  }
  return validateNarrative(parsed);
}

// Render the stored narrative as a prompt block (for chat / brief surfaces).
// Returns "" when there's no usable narrative so the section simply omits.
// The account-page header UI reads the structured fields directly instead.
export function renderNarrativeBlock(narrative) {
  var n = validateNarrative(narrative);
  if (!n) return "";
  var head = "── ACCOUNT STORY (Pip's standing read" + (n.as_of ? " · as of " + n.as_of : "") + ") ──";
  var lines = [head];
  if (n.arc)       lines.push("How it got here: " + n.arc);
  lines.push("Where it stands: " + n.standing);
  if (n.hinges_on) lines.push("Hinges on: " + n.hinges_on);
  var traj = n.trajectory.charAt(0).toUpperCase() + n.trajectory.slice(1);
  lines.push("Trajectory: " + traj + (n.trajectory_why ? " — " + n.trajectory_why : ""));
  return lines.join("\n");
}
