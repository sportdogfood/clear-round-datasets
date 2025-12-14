// app.js (desk)
// Session Start -> fetch Rows once -> write sessionStorage -> show Session Active
// Session Restart -> fetch again -> overwrite sessionStorage -> remain Active
// Trainer -> derive + render
// Entries -> placeholder (for now) new

(() => {
  // ------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------
  const screenStart  = document.getElementById("screen-start");
  const screenActive = document.getElementById("screen-active");
  const screenRender = document.getElementById("screen-render");

  const btnSessionStart   = document.getElementById("btn-session-start");
  const btnSessionRestart = document.getElementById("btn-session-restart");
  const btnTrainer        = document.getElementById("btn-trainer");
  const btnEntries        = document.getElementById("btn-entries");

  const btnBack  = document.getElementById("btn-back");
  const btnPrint = document.getElementById("btn-print");
  const titleEl  = document.getElementById("desk-title");

  const uiSessionState = document.getElementById("ui-session-state");
  const uiFetchedAt    = document.getElementById("ui-fetched-at");

  const uiSessionId    = document.getElementById("ui-session-id");
  const uiFetchedAt2   = document.getElementById("ui-fetched-at-2");
  const uiLiveStatus   = document.getElementById("ui-live-status");
  const uiLoadedCounts = document.getElementById("ui-loaded-counts");

  const renderRoot = document.getElementById("render-root");

  // ------------------------------------------------------------
  // Rows config
  // ------------------------------------------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";
  const RANGE    = "N2:O9999";

  const ALLOWED_KEYS = new Set([
    "live_status",
    "live_data",
    "schedule",
    "entries",
    "horses",
    "rings"
  ]);

  const REFRESH_MS = 9 * 60 * 1000;

  // ------------------------------------------------------------
  // Storage helpers
  // ------------------------------------------------------------
  function safeJsonParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return v; }
  }

  function readJSON(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function writeJSON(key, obj) {
    try {
      sessionStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }

  function isTrue(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  }

  // ------------------------------------------------------------
  // Rows fetch
  // ------------------------------------------------------------
  function buildRowsUrl() {
    return [
      ROWS_API_BASE,
      "spreadsheets",
      encodeURIComponent(SHEET_ID),
      "tables",
      encodeURIComponent(TABLE_ID),
      "values",
      encodeURIComponent(RANGE)
    ].join("/");
  }

  function extractRows(data) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.values)) return data.values;

    const dr = data?.data?.rows;
    if (Array.isArray(dr)) {
      return dr.map(r => (Array.isArray(r.cells) ? r.cells.map(c => c.value) : []));
    }
    return [];
  }

  async function fetchRowsKeyValue() {
    const url = buildRowsUrl();

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.error("[ROWS] fetch failed", res.status);
      return null;
    }

    const data = await res.json();
    const rows = extractRows(data);

    const found = {};
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const key = String(row[0] || "").trim();
      if (!ALLOWED_KEYS.has(key)) continue;
      found[key] = safeJsonParse(row[1]);
    }
    return found;
  }

  // ------------------------------------------------------------
  // Session hydrate (ONLY called by session-start / session-restart)
  // ------------------------------------------------------------
  async function hydrateSession() {
    const found = await fetchRowsKeyValue();
    if (!found) return { ok: false };

    // ALWAYS overwrite the base datasets we care about
    ["schedule", "entries", "horses", "rings"].forEach(k => {
      if (k in found) writeJSON(k, found[k]);
    });

    // live_status always written if present
    if ("live_status" in found) writeJSON("live_status", found.live_status);

    // live_data only written when live_status is true
    if (isTrue(found.live_status) && ("live_data" in found)) {
      writeJSON("live_data", found.live_data);
    } else {
      try { sessionStorage.removeItem("live_data"); } catch {}
    }

    // meta
    const meta = {
      fetched_at: new Date().toISOString(),
      refresh_ms: REFRESH_MS,
      keys_written: Object.keys(found).filter(k => ALLOWED_KEYS.has(k))
    };
    writeJSON("_crt_meta", meta);

    // small counts
    const counts = {
      schedule: Array.isArray(found.schedule) ? found.schedule.length : null,
      entries:  Array.isArray(found.entries)  ? found.entries.length  : null,
      horses:   Array.isArray(found.horses)   ? found.horses.length   : null,
      rings:    Array.isArray(found.rings)    ? found.rings.length    : null,
      live_data: found.live_data ? 1 : 0
    };

    return { ok: true, meta, counts, live_status: found.live_status };
  }

  // ------------------------------------------------------------
  // UI state machine
  // ------------------------------------------------------------
  function showStartScreen() {
    screenStart.hidden = false;
    screenActive.hidden = true;
    screenRender.hidden = true;

    btnBack.hidden = true;
    btnPrint.hidden = true;
    titleEl.textContent = "Class Desk";

    const meta = readJSON("_crt_meta");
    uiSessionState.textContent = "not-started";
    uiFetchedAt.textContent = meta?.fetched_at ? meta.fetched_at : "—";
  }

  function showActiveScreen() {
    screenStart.hidden = true;
    screenActive.hidden = false;
    screenRender.hidden = true;

    btnBack.hidden = true;
    btnPrint.hidden = true;
    titleEl.textContent = "Class Desk";
  }

  function showRenderScreen(title) {
    screenStart.hidden = true;
    screenActive.hidden = true;
    screenRender.hidden = false;

    btnBack.hidden = false;
    btnPrint.hidden = false;
    titleEl.textContent = title || "Report";
  }

  function updateActiveMetaUI(hydrateResult) {
    const meta = readJSON("_crt_meta");
    const sid  = readJSON("_crt_session")?.session_id || "—";

    uiSessionId.textContent = sid;
    uiFetchedAt2.textContent = meta?.fetched_at ? meta.fetched_at : "—";
    uiLiveStatus.textContent =
      typeof hydrateResult?.live_status === "string"
        ? hydrateResult.live_status
        : JSON.stringify(hydrateResult?.live_status ?? readJSON("live_status"));

    const c = hydrateResult?.counts || {};
    uiLoadedCounts.textContent = `schedule:${c.schedule ?? "?"} entries:${c.entries ?? "?"} horses:${c.horses ?? "?"} rings:${c.rings ?? "?"}`;
  }

  // ------------------------------------------------------------
  // Session Start / Restart
  // ------------------------------------------------------------
  let refreshTimer = null;

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      // Only refresh when session is active
      if (readJSON("_crt_session")?.active !== true) return;
      const r = await hydrateSession();
      if (r.ok) updateActiveMetaUI(r);
    }, REFRESH_MS);
  }

  async function onSessionStart() {
    btnSessionStart.disabled = true;
    btnSessionStart.textContent = "Starting…";

    const session_id =
      "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

    const r = await hydrateSession();

    if (r.ok) {
      writeJSON("_crt_session", {
        active: true,
        session_id,
        started_at: new Date().toISOString()
      });

      showActiveScreen();
      updateActiveMetaUI(r);
      startAutoRefresh();
    } else {
      // stay on start screen
      showStartScreen();
    }

    btnSessionStart.disabled = false;
    btnSessionStart.textContent = "Session Start";
  }

  async function onSessionRestart() {
    btnSessionRestart.disabled = true;
    btnSessionRestart.textContent = "Restarting…";

    const r = await hydrateSession();
    if (r.ok) {
      const s = readJSON("_crt_session") || {};
      writeJSON("_crt_session", {
        active: true,
        session_id: s.session_id || ("sess-" + Date.now().toString(36)),
        started_at: s.started_at || new Date().toISOString(),
        restarted_at: new Date().toISOString()
      });

      showActiveScreen();
      updateActiveMetaUI(r);
    }

    btnSessionRestart.disabled = false;
    btnSessionRestart.textContent = "Session Restart";
  }

  // ------------------------------------------------------------
  // Trainer / Entries
  // ------------------------------------------------------------
  function clearRender() {
    if (renderRoot) renderRoot.innerHTML = "";
  }

  function onTrainer() {
    clearRender();
    showRenderScreen("Trainer Report");

    if (typeof window.CRT_trainerDerive === "function") {
      window.CRT_trainerDerive();
    }
    if (typeof window.CRT_trainerRender === "function") {
      window.CRT_trainerRender({ root: renderRoot });
    }
  }

  function onEntries() {
    clearRender();
    showRenderScreen("Entries");

    // placeholder until entries derive/render are added
    renderRoot.innerHTML = "<p style=\"opacity:.8;margin:0;padding:6px 0;\">Entries render not wired yet.</p>";
  }

  function onBack() {
    clearRender();
    showActiveScreen();
  }

  function onPrint() {
    window.print();
  }

  // ------------------------------------------------------------
  // Wire
  // ------------------------------------------------------------
  btnSessionStart?.addEventListener("click", onSessionStart);
  btnSessionRestart?.addEventListener("click", onSessionRestart);
  btnTrainer?.addEventListener("click", onTrainer);
  btnEntries?.addEventListener("click", onEntries);

  btnBack?.addEventListener("click", onBack);
  btnPrint?.addEventListener("click", onPrint);

  // Manual refresh hook
  window.CRT_refreshSession = onSessionRestart;

  // Boot: DO NOT auto-fetch. Show start unless a session is already active.
  const sess = readJSON("_crt_session");
  if (sess?.active === true) {
    // If already active, show active screen but DO NOT fetch until restart is clicked.
    showActiveScreen();
    const meta = readJSON("_crt_meta") || {};
    updateActiveMetaUI({ live_status: readJSON("live_status"), counts: {} , meta});
    startAutoRefresh();
  } else {
    showStartScreen();
  }
})();
