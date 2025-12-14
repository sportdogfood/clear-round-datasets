// File: docs/classes/desk/app.js
// Session Start / Restart + Rows hydration (N=key, O=payload) -> sessionStorage
// UI: start -> active -> (trainer render) -> back

(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";
  const RANGE = "N2:O9999";

  const ALLOWED_KEYS = [
    "live_status",
    "live_data",
    "schedule",
    "entries",
    "horses",
    "rings"
  ];

  const REFRESH_MS = 9 * 60 * 1000;

  // -------------------------
  // DOM
  // -------------------------
  const screenStart = document.getElementById("screen-start");
  const screenActive = document.getElementById("screen-active");
  const screenRender = document.getElementById("screen-render");

  const startMeta = document.getElementById("start-meta");
  const activeMeta = document.getElementById("active-meta");

  const btnStart = document.getElementById("btn-session-start");
  const btnRestart = document.getElementById("btn-session-restart");
  const btnTrainer = document.getElementById("btn-trainer");
  const btnEntries = document.getElementById("btn-entries");

  const btnBack = document.getElementById("btn-back");
  const btnPrint = document.getElementById("btn-print");
  const titleEl = document.getElementById("desk-title");

  const renderRoot = document.getElementById("render-root");

  // -------------------------
  // Storage helpers
  // -------------------------
  function sset(k, v) {
    try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {}
  }
  function sget(k) {
    try {
      const v = sessionStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }
  function srm(k) {
    try { sessionStorage.removeItem(k); } catch {}
  }

  function safeParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    const t = v.trim();
    try { return JSON.parse(t); } catch { return t; }
  }

  function isTrue(v) {
    if (v === true) return true;
    if (v === 1) return true;
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      return t === "true" || t === "1" || t === "yes" || t === "y" || t === "t" || t === "TRUE".toLowerCase();
    }
    return false;
  }

  function buildUrl() {
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

  function normalizeRows(data) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.values)) return data.values;

    if (data?.data && Array.isArray(data.data.rows)) {
      return data.data.rows.map(r =>
        Array.isArray(r?.cells) ? r.cells.map(c => c?.value) : []
      );
    }

    return [];
  }

  function setMeta(meta) {
    sset("_crt_meta", meta);
    if (activeMeta) {
      activeMeta.textContent =
        `fetched_at: ${meta.fetched_at}\nrefresh: ${Math.round(meta.refresh_ms / 60000)} min`;
    }
    if (startMeta) {
      startMeta.textContent =
        `last_fetched_at: ${meta.fetched_at}\nrefresh: ${Math.round(meta.refresh_ms / 60000)} min`;
    }
  }

  // -------------------------
  // UI state
  // -------------------------
  function showStart() {
    screenStart.hidden = false;
    screenActive.hidden = true;
    screenRender.hidden = true;

    btnBack.hidden = true;
    btnPrint.hidden = true;
    titleEl.textContent = "Class Desk";

    const meta = sget("_crt_meta");
    if (meta && startMeta) {
      startMeta.textContent =
        `last_fetched_at: ${meta.fetched_at}\nrefresh: ${Math.round(meta.refresh_ms / 60000)} min`;
    } else if (startMeta) {
      startMeta.textContent = "";
    }
  }

  function showActive() {
    screenStart.hidden = true;
    screenActive.hidden = false;
    screenRender.hidden = true;

    btnBack.hidden = true;
    btnPrint.hidden = true;
    titleEl.textContent = "Session Active";

    const meta = sget("_crt_meta");
    if (meta && activeMeta) {
      activeMeta.textContent =
        `fetched_at: ${meta.fetched_at}\nrefresh: ${Math.round(meta.refresh_ms / 60000)} min`;
    }
  }

  function showRender(title) {
    screenStart.hidden = true;
    screenActive.hidden = true;
    screenRender.hidden = false;

    btnBack.hidden = false;
    btnPrint.hidden = false;
    titleEl.textContent = title || "Report";
  }

  // -------------------------
  // Hydration
  // -------------------------
  let refreshTimer = null;
  let hydrating = false;

  async function hydrateSession() {
    if (hydrating) return false;
    hydrating = true;

    try {
      const res = await fetch(buildUrl(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ROWS_API_KEY}`,
          Accept: "application/json"
        }
      });

      if (!res.ok) {
        hydrating = false;
        return false;
      }

      const data = await res.json();
      const rows = normalizeRows(data);

      const found = {};
      for (const row of rows) {
        if (!row || row.length < 2) continue;
        const key = String(row[0] ?? "").trim();
        if (!key) continue;
        if (!ALLOWED_KEYS.includes(key)) continue;
        found[key] = safeParse(row[1]);
      }

      // Always write base datasets if present, remove if missing to avoid stale
      for (const k of ["schedule", "entries", "horses", "rings"]) {
        if (k in found) sset(k, found[k]);
        else srm(k);
      }

      // live_status always stored if present
      if ("live_status" in found) sset("live_status", found.live_status);
      else srm("live_status");

      // gate live_data write
      if (isTrue(found.live_status) && ("live_data" in found)) {
        sset("live_data", found.live_data);
      } else {
        srm("live_data");
      }

      setMeta({
        fetched_at: new Date().toISOString(),
        refresh_ms: REFRESH_MS,
        keys: Object.keys(found)
      });

      sset("crt_session_active", true);
      if (!sget("crt_session_id")) {
        sset("crt_session_id", "sess-" + Date.now().toString(36));
      }

      hydrating = false;
      return true;
    } catch {
      hydrating = false;
      return false;
    }
  }

  function startRefreshTimer() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      const active = sget("crt_session_active");
      if (!active) return;
      await hydrateSession();
    }, REFRESH_MS);
  }

  // -------------------------
  // Actions
  // -------------------------
  async function onSessionStart() {
    const ok = await hydrateSession();
    if (!ok) return;
    startRefreshTimer();
    showActive();
  }

  async function onSessionRestart() {
    const ok = await hydrateSession();
    if (!ok) return;
    showActive();
  }

  function onTrainer() {
    if (typeof window.CRT_trainerDerive === "function") {
      window.CRT_trainerDerive();
    }
    if (typeof window.CRT_trainerRender === "function") {
      window.CRT_trainerRender(renderRoot);
    }
    showRender("Trainer Report");
  }

  function onEntries() {
    // placeholder (no entries logic yet)
    if (renderRoot) {
      renderRoot.innerHTML = "<p>Entries report not wired yet.</p>";
    }
    showRender("Entries");
  }

  function onBack() {
    showActive();
  }

  function onPrint() {
    window.print();
  }

  // -------------------------
  // Wire
  // -------------------------
  if (btnStart) btnStart.addEventListener("click", onSessionStart);
  if (btnRestart) btnRestart.addEventListener("click", onSessionRestart);
  if (btnTrainer) btnTrainer.addEventListener("click", onTrainer);
  if (btnEntries) btnEntries.addEventListener("click", onEntries);
  if (btnBack) btnBack.addEventListener("click", onBack);
  if (btnPrint) btnPrint.addEventListener("click", onPrint);

  // Initial screen state (no auto-fetch)
  const active = sget("crt_session_active");
  const meta = sget("_crt_meta");
  if (meta) setMeta(meta);

  if (active) {
    showActive();
    startRefreshTimer();
  } else {
    showStart();
  }

  // Manual refresh hook
  window.CRT_refreshSession = hydrateSession;
})();
