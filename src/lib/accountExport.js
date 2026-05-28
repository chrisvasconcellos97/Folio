// Per-account JSON export — builds a single self-contained snapshot of an
// account and every entity tied to it, suitable for backup, hand-off to
// another tool, or "give me everything you have on X" requests.
//
// The shape is intentionally flat and human-readable:
//
//   {
//     folio_export_version: 1,
//     exported_at: "2026-05-28T18:30:00.000Z",
//     app: "Folios",
//     account: { ...folio_accounts row... },
//     meetings: [ ...folio_meetings rows... ],
//     items:    [ ...folio_items rows... ],
//     contacts: [ ...folio_contacts rows... ],
//     cadences: [ ...folio_cadences rows... ],
//     projects: [ ...gauge_projects rows... ],
//     notes:    { ...folio_account_notes row for this user...  } | null,
//     counts:   { meetings, items, contacts, cadences, projects }
//   }
//
// All collections default to []; the consumer can rely on them being
// arrays without null-checking. `notes` is a single object because the
// schema is one-row-per-(account,user).
//
// `buildAccountExport` is pure (no IO) so the test suite can snapshot
// the shape with a fixture. `downloadAccountExport` triggers the actual
// file download via an anchor click — browser-only, never used in tests.

export var FOLIO_EXPORT_VERSION = 1;

export function buildAccountExport({
  account,
  meetings,
  items,
  contacts,
  cadences,
  projects,
  notes,
  exportedAt,
}) {
  var safeMeetings = Array.isArray(meetings) ? meetings : [];
  var safeItems    = Array.isArray(items)    ? items    : [];
  var safeContacts = Array.isArray(contacts) ? contacts : [];
  var safeCadences = Array.isArray(cadences) ? cadences : [];
  var safeProjects = Array.isArray(projects) ? projects : [];

  return {
    folio_export_version: FOLIO_EXPORT_VERSION,
    exported_at: exportedAt || new Date().toISOString(),
    app: "Folios",
    account: account || null,
    meetings: safeMeetings,
    items:    safeItems,
    contacts: safeContacts,
    cadences: safeCadences,
    projects: safeProjects,
    notes:    notes || null,
    counts: {
      meetings: safeMeetings.length,
      items:    safeItems.length,
      contacts: safeContacts.length,
      cadences: safeCadences.length,
      projects: safeProjects.length,
    },
  };
}

// Slug an account name into a safe filename fragment. Keeps ASCII letters,
// numbers, dash and underscore; collapses everything else to dashes.
export function slugifyForFilename(name) {
  if (!name) return "account";
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "account";
}

export function exportFilename(account, date) {
  var d = date || new Date();
  var stamp =
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
  return "folios-" + slugifyForFilename(account && account.name) + "-" + stamp + ".json";
}

// Triggers a browser download of the export. Returns the filename used.
// Guards against SSR / non-browser environments — does nothing if there's
// no `document`.
export function downloadAccountExport(payload, account) {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;

  var json = JSON.stringify(payload, null, 2);
  var blob = new Blob([json], { type: "application/json" });
  var url  = URL.createObjectURL(blob);
  var name = exportFilename(account);

  var a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  // Defer cleanup so the browser has a chance to begin the download.
  setTimeout(function () {
    try { document.body.removeChild(a); } catch (_e) { /* already gone */ }
    try { URL.revokeObjectURL(url); } catch (_e) { /* already revoked */ }
  }, 0);

  return name;
}
