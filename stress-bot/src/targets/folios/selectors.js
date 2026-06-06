// Folios-specific selectors. Centralized so they're easy to update when
// the UI changes — and so scenarios stay readable.
//
// Folios mostly uses inline styles + placeholder text rather than test IDs,
// so we lean on placeholders, button text, and role selectors.
//
// Calibrated June 2026 against the live app: nav is state-based (no URL
// routes), "Meetings" is now "Calendar", and the account-name field has a
// stable id (#account-name) rather than a matchable placeholder.

export const S = {
  // Auth
  authEmail: 'input[placeholder="you@company.com"]',
  authPassword: 'input[placeholder="••••••••"]',
  authName: 'input[placeholder="Your name"]',
  authTitle: 'input[placeholder*="Regional Account Manager"]',
  authSubmit: 'button[type="submit"]',
  authToggleSignup: 'button:has-text("Create Account")',
  authToggleLogin: 'button:has-text("Sign In")',

  // Top-level nav (desktop sidebar / mobile bottom bar — label text lives in
  // the nav buttons). Labels per src/layout/DesktopLayout.jsx:
  //   Home · Accounts · Calendar · Cadence · Gauge
  navHome: 'button:has-text("Home")',
  navAccounts: 'button:has-text("Accounts")',
  navMeetings: 'button:has-text("Calendar")',   // "Meetings" view is labeled "Calendar"
  navCadence: 'button:has-text("Cadence")',
  navGauge: 'button:has-text("Gauge")',

  // Account list
  addAccount: 'button:has-text("Add Account"), button:has-text("+ Account")',
  accountCard: '[role="button"]',
  searchInput: 'input[placeholder*="Search"]',

  // Account create modal — #account-name is the stable id on the name field
  // (placeholder is "Company name", which the old [placeholder*="Name"] missed).
  modalNameInput: '#account-name',
  // Scoped to the modal panel (.modal-sheet) so it can't match the sidebar
  // "Add Account" pill that opened the modal.
  modalSave: '.modal-sheet button:has-text("Add Account"), .modal-sheet button:has-text("Add Department"), .modal-sheet button:has-text("Add Partner"), .modal-sheet button:has-text("Save")',
  modalCancel: '.modal-sheet button:has-text("Cancel")',
  modalClose: 'button[aria-label="Close"]',

  // Logged-in markers. When logged in the sidebar shows nav buttons; when
  // logged out the auth form shows the email field.
  loggedIn: 'button:has-text("Accounts"), button:has-text("Home")',
  loggedOut: 'input[placeholder="you@company.com"]',
};
