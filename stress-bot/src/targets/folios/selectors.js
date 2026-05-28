// Folios-specific selectors. Centralized so they're easy to update when
// the UI changes — and so scenarios stay readable.
//
// Folios mostly uses inline styles + placeholder text rather than test IDs,
// so we lean on placeholders, button text, and role selectors.

export const S = {
  // Auth
  authEmail: 'input[placeholder="you@company.com"]',
  authPassword: 'input[placeholder="••••••••"]',
  authName: 'input[placeholder="Your name"]',
  authTitle: 'input[placeholder*="Regional Account Manager"]',
  authSubmit: 'button[type="submit"]',
  authToggleSignup: 'button:has-text("Create Account")',
  authToggleLogin: 'button:has-text("Sign In")',

  // Top-level nav (desktop sidebar — text matches in the sidebar buttons)
  navAccounts: 'button:has-text("Accounts"), a:has-text("Accounts")',
  navMeetings: 'button:has-text("Meetings"), a:has-text("Meetings")',
  navCadence: 'button:has-text("Cadence"), a:has-text("Cadence")',
  navPipeline: 'button:has-text("Pipeline"), a:has-text("Pipeline")',
  navRoutes: 'button:has-text("Routes"), a:has-text("Routes")',

  // Account list
  addAccount: 'button:has-text("Add Account"), button:has-text("+ Account")',
  accountCard: '[role="button"]',
  searchInput: 'input[placeholder*="Search"]',

  // Account create modal
  modalNameInput: 'input[placeholder*="Account name"], input[placeholder*="Name"]',
  modalSave: 'button:has-text("Save")',
  modalCancel: 'button:has-text("Cancel")',
  modalClose: 'button[aria-label="Close"]',

  // Logged-in markers
  loggedIn: 'button:has-text("Accounts"), button:has-text("Log Out")',
  loggedOut: 'input[placeholder="you@company.com"]',
};
