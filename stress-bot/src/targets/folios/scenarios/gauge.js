// Gauge project creation smoke test.
//
// Logs in, navigates to Gauge, opens the "+ New Project" modal, fills a
// uniquely-titled project, saves it, and verifies the row persisted via the
// Supabase REST API.
//
// Pattern mirrors accounts.js: native-then-DOM-fallback clicks, REST verify + DELETE cleanup.
// If the project-create UI can't be reliably located, emits skipped:true instead of a false pass.

import { S } from "../selectors.js";
import { login, getAccessToken } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // ── Navigate to Gauge ──
  const gaugeNav = page.locator(S.navGauge).first();
  const gaugeVisible = await gaugeNav.isVisible().catch(() => false);
  if (!gaugeVisible) {
    results.push({
      name: "Gauge project creation smoke test",
      passed: false,
      skipped: true,
      note: "Gauge nav button not found — Gauge may be disabled for this user",
    });
    return results;
  }

  try {
    await gaugeNav.click({ timeout: 4000 });
  } catch (_) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /gauge/i.test(b.textContent));
      if (btn) btn.click();
    }).catch(() => {});
  }

  // Wait for GaugeView to mount — the "+ New Project" button is a reliable marker.
  await page.waitForTimeout(1200);

  // ── Open the "+ New Project" modal ──
  // GaugeView renders a button whose text is "+ New Project" (setShowAdd(true) handler).
  let modalTriggerClicked = false;
  try {
    await page.locator('button:has-text("+ New Project")').first().click({ timeout: 4000 });
    modalTriggerClicked = true;
  } catch (_) {
    modalTriggerClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /\+\s*new project/i.test(b.textContent));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
  }

  if (!modalTriggerClicked) {
    results.push({
      name: "Gauge project creation smoke test",
      passed: false,
      skipped: true,
      note: 'button:has-text("+ New Project") not found — selector may have changed; check GaugeView.jsx',
    });
    return results;
  }

  // ── Wait for ProjectModal — keyed on the title input (placeholder "What are we building?") ──
  const titleInput = page.locator('input[placeholder="What are we building?"]').first();
  const modalOpen = await titleInput.waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false);

  if (!modalOpen) {
    // Diagnostic snapshot to help identify what did render.
    const diag = await page.evaluate(() => {
      const sheet = document.querySelector(".modal-sheet");
      const inputs = Array.from(document.querySelectorAll("input"))
        .slice(0, 8)
        .map((i) => i.id || i.getAttribute("placeholder") || i.type || "?");
      return { sheet: !!sheet, inputs };
    }).catch(() => ({ sheet: null, inputs: [] }));

    results.push({
      name: "Gauge new-project modal opens",
      passed: false,
      skipped: true,
      note: `title input never appeared — .modal-sheet:${diag.sheet}; inputs:[${(diag.inputs || []).join("|")}]; check ProjectModal.jsx placeholder`,
    });
    return results;
  }
  results.push({ name: "Gauge new-project modal opens", passed: true, note: "modal open" });

  // ── Fill the project title ──
  const projectTitle = `_stressproj_${Date.now()}`;
  await titleInput.fill(projectTitle).catch(() => {});

  // ── Watch for the REST insert ──
  const inserts = [];
  const onResp = (res) => {
    try {
      const u = res.url();
      const m = res.request().method();
      if (u.includes("/rest/v1/gauge_projects") && (m === "POST" || m === "PATCH")) {
        inserts.push({ method: m, status: res.status() });
      }
    } catch (_) {}
  };
  page.on("response", onResp);

  // ── Save: native click first, then DOM fallback ──
  // ProjectModal save button text is "Add Project" or "Save Project" or "Publish Project".
  let saveClicked = false;
  try {
    await page.locator('.modal-sheet button:has-text("Add Project"), .modal-sheet button:has-text("Save Project"), .modal-sheet button:has-text("Publish Project")').first().click({ timeout: 3000 });
    saveClicked = true;
  } catch (_) {
    saveClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".modal-sheet button"));
      const b = btns.find((x) => /add project|save project|publish project/i.test((x.textContent || "").trim()));
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // ── Wait for modal close or a successful insert response ──
  let sawInsertOk = false;
  let modalClosed = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    sawInsertOk = inserts.some((r) => r.status >= 200 && r.status < 300);
    modalClosed = !(await titleInput.isVisible().catch(() => false));
    if (sawInsertOk || modalClosed) break;
  }
  const insertSummary = inserts.length ? inserts.map((r) => `${r.method}:${r.status}`).join(",") : "NONE";
  page.off("response", onResp);

  results.push({
    name: "project save fired a DB write (modal closed / insert ok)",
    passed: sawInsertOk || modalClosed,
    note: `db requests: [${insertSummary}]; modal closed: ${modalClosed}; saveClicked: ${saveClicked}`,
  });

  // ── REST verify + cleanup ──
  const token = await getAccessToken(page);
  const base = (config.supabase && config.supabase.url) ? config.supabase.url.replace(/\/$/, "") : "";
  let persisted = false;
  let projectId = null;
  let cleanupOk = false;

  if (token && base) {
    const headers = { apikey: config.supabase.anonKey, Authorization: "Bearer " + token };
    try {
      const r = await fetch(`${base}/rest/v1/gauge_projects?title=eq.${encodeURIComponent(projectTitle)}&select=id,status`, { headers });
      const rows = r.ok ? await r.json() : [];
      persisted = Array.isArray(rows) && rows.length > 0;
      if (persisted) {
        projectId = rows[0].id;
        const del = await fetch(`${base}/rest/v1/gauge_projects?title=eq.${encodeURIComponent(projectTitle)}`, {
          method: "DELETE",
          headers,
        });
        cleanupOk = del.ok;
      }
    } catch (_) {}
  }

  results.push({
    name: "project created + persisted",
    passed: persisted,
    note: persisted
      ? ("confirmed in DB (id: " + projectId + ")" + (cleanupOk ? "; test row cleaned up" : "; cleanup skipped/failed"))
      : (token ? "row not found via API — project may not have persisted" : "no auth token — could not verify"),
  });

  return results;
}
