// File: docs/classes/desk/app.js
// DESK session-start / session-restart (Rows -> sessionStorage)
// NO auto-fetch on refresh. Fetch ONLY on button click.

(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";
  const RANGE = "N2:O9999";

  const ALLOWED_KEYS = new Set([
    "live_status",
    "live_data",
    "schedule",
    "entries",
    "horses",
    "rings"
  ]);

  const REFRESH_MS = 9 * 60 * 1000;

  const els = {
    title: document.getElementById("desk-title"),
    btnBack: document.getElementById("btn-back"),
    btnPrint: document.getElementById("btn-print"),

    screenStart: document.getElementById("screen-start"),
    screenActive: document.getElementById("screen-active"),
    screenRender: document.getElementById("screen-render"),
    renderRoot: document.getElementById("render-root"),

    btnSessionStart: document.getElementById("btn-session-start"),
    btnSessionRestart: document.getElementById("btn-session-restart"),
    btnTrainer: document.getElementById("btn-trainer"),
    btnEntries: document.getElementById("btn-entries"),

    startMeta: document.getElementById("start-meta"),
    activeMeta: document.getElementById("active-meta")
  };

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

  function safeParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return v; }
  }

  function isTrue(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  }

  function readJson(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, obj) {
    sessionStorage.setItem(key, JSON.stringify(obj));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function newSessionId() {
    return "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function sessionExists() {
    const sess = readJson("_crt_session");
    return !!(sess && sess.session_id);
  }

  function setHeader(mode) {
    // mode: "start" | "active" | "trainer" | "entries"
    if (mode === "start") {
      els.title.textContent = "Class Desk";
      els.btnBack.hidden = true;
      els.btnPrint.hidden = true;
      return;
    }
    if (mode === "active") {
      els.title.textContent = "Session Active";
      els.btnBack.hidden = true;
      els.btnPrint.hidden = true;
      return;
    }
    if (mode === "trainer") {
      els.title.textContent = "Trainer Report";
      els.btnBack.hidden = false;
      els.btnPrint.hidden = false;
      return;
    }
    if (mode === "entries") {
      els.title.textContent = "Entries";
      els.btnBack.hidden = false;
      els.btnPrint.hidden = false;
      return;
    }
  }

  function showScreen(which) {
    els.screenStart.hidden = which !== "start";
    els.screenActive.hidden = which !== "active";
    els.screenRender.hidden = which !== "render";
  }

  function setMetaText() {
    const sess = readJson("_crt_session");
    const meta = readJson("_crt_meta");

    const fetchedAt = meta?.fetched_at || null;
    const nextDue = meta?.next_refresh_due || null;

    if (!sessionExists()) {
      els.startMeta.hidden = false;
      els.startMeta.textContent = fetchedAt ? `Last fetch: ${fetchedAt}` : `No session yet.`;
      return;
    }

    const parts = [];
    if (sess?.session_id) parts.push(`session_id: ${sess.session_id}`);
    if (sess?.created_at) parts.push(`created: ${sess.created_at}`);
    if (fetchedAt) parts.push(`fetched: ${fetchedAt}`);
    if (nextDue) parts.push(`refresh_due: ${nextDue}`);

    els.activeMeta.textContent = parts.join(" · ");
  }

  async function fetchRowsKeyValue() {
    const url = buildUrl();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.error("[ROWS] fetch failed", res.status, url);
      return null;
    }

    const data = await res.json();
    const rows =
      data.items ||
      data.values ||
      (data.data?.rows || []).map((r) =>
        Array.isArray(r.cells) ? r.cells.map((c) => c.value) : []
      );

    const found = {};
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const key = String(row[0] || "").trim();
      if (!ALLOWED_KEYS.has(key)) continue;
      found[key] = safeParse(row[1]);
    }

    return found;
  }

  function writeDatasetsToSession(found) {
    // ALWAYS overwrite base datasets if present
    ["schedule", "entries", "horses", "rings"].forEach((k) => {
      if (k in found) {
        sessionStorage.setItem(k, JSON.stringify(found[k]));
      }
    });

    // store live_status raw
    if ("live_status" in found) {
      sessionStorage.setItem("live_status", JSON.stringify(found.live_status));
    }

    // gate ONLY the write of live_data
    if (isTrue(found.live_status) && "live_data" in found) {
      sessionStorage.setItem("live_data", JSON.stringify(found.live_data));
    } else {
      sessionStorage.removeItem("live_data");
    }
  }

  async function startOrRestartSession() {
    // create NEW session id every time (matches your cadence)
    const sessionObj = {
      session_id: newSessionId(),
      created_at: nowIso(),
      refresh_ms: REFRESH_MS
    };
    writeJson("_crt_session", sessionObj);

    // fetch rows
    const found = await fetchRowsKeyValue();
    if (!found) return false;

    writeDatasetsToSession(found);

    // meta
    writeJson("_crt_meta", {
      fetched_at: nowIso(),
      next_refresh_due: new Date(Date.now() + REFRESH_MS).toISOString(),
      keys: Object.keys(found)
    });

    // keep trainer_rows in sync after hydrate (derive only; render happens on click)
    if (typeof window.CRT_deriveTrainerRows === "function") {
      window.CRT_deriveTrainerRows();
    }

    setMetaText();
    setHeader("active");
    showScreen("active");
    return true;
  }

  // Expose simple navigation hooks for render modules
  window.CRT_goActive = () => {
    setHeader("active");
    showScreen("active");
  };

  // UI events
  els.btnSessionStart.addEventListener("click", async () => {
    els.btnSessionStart.disabled = true;
    els.btnSessionStart.textContent = "Starting…";
    try {
      await startOrRestartSession();
    } finally {
      els.btnSessionStart.disabled = false;
      els.btnSessionStart.textContent = "Session Start";
    }
  });

  els.btnSessionRestart.addEventListener("click", async () => {
    els.btnSessionRestart.disabled = true;
    els.btnSessionRestart.textContent = "Restarting…";
    try {
      await startOrRestartSession();
    } finally {
      els.btnSessionRestart.disabled = false;
      els.btnSessionRestart.textContent = "Session Restart";
    }
  });

  els.btnTrainer.addEventListener("click", () => {
    if (typeof window.CRT_deriveTrainerRows === "function") {
      window.CRT_deriveTrainerRows();
    }
    if (typeof window.CRT_renderTrainer === "function") {
      setHeader("trainer");
      showScreen("render");
      window.CRT_renderTrainer();
    } else {
      console.error("[CRT] CRT_renderTrainer not found");
    }
  });

  els.btnEntries.addEventListener("click", () => {
    // placeholder for entries module later
    setHeader("entries");
    showScreen("render");
    els.renderRoot.innerHTML = "<p>Entries (pending)</p>";
  });

  els.btnBack.addEventListener("click", () => {
    window.CRT_goActive();
  });

  els.btnPrint.addEventListener("click", () => window.print());

  // Initial screen (NO fetch)
  if (sessionExists()) {
    setHeader("active");
    showScreen("active");
  } else {
    setHeader("start");
    showScreen("start");
  }
  setMetaText();
})();
