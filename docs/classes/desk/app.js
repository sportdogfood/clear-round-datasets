// app.js (desk)
// - Session-start triggers Rows hydrate ON CLICK (not on load)
// - Session-restart re-hydrates + re-derives
// - Trainer uses derived trainer_rows

(() => {
  "use strict";

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";
  const KV_RANGE = "N2:O9999";

  const ALLOWED_KEYS = new Set([
    "live_status",
    "live_data",
    "schedule",
    "entries",
    "horses",
    "rings"
  ]);

  const REFRESH_MS = 9 * 60 * 1000;

  const STORAGE = {
    session: "_crt_session",
    meta: "_crt_meta",
    // datasets:
    live_status: "live_status",
    live_data: "live_data",
    schedule: "schedule",
    entries: "entries",
    horses: "horses",
    rings: "rings",
    // derived:
    trainer_rows: "trainer_rows"
  };

  // ------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------
  const headerBack = document.getElementById("header-back");
  const headerTitle = document.getElementById("header-title");
  const headerAction = document.getElementById("header-action");
  const screenRoot = document.getElementById("screen-root");

  if (!headerBack || !headerTitle || !headerAction || !screenRoot) return;

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  const state = {
    currentScreen: "start", // start | active | trainer
    history: [],
    isLoading: false
  };

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  function nowISO() {
    return new Date().toISOString();
  }

  function safeJsonParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return v; }
  }

  function ssGet(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return sessionStorage.getItem(key);
    }
  }

  function ssSet(key, obj) {
    try { sessionStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  function ssRemove(key) {
    try { sessionStorage.removeItem(key); } catch {}
  }

  function isTrue(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  }

  function buildRowsUrl(rangeA1) {
    return [
      ROWS_API_BASE,
      "spreadsheets",
      encodeURIComponent(SHEET_ID),
      "tables",
      encodeURIComponent(TABLE_ID),
      "values",
      encodeURIComponent(rangeA1)
    ].join("/");
  }

  function normalizeRowsResponse(data) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.values)) return data.values;

    const dr = data?.data?.rows;
    if (Array.isArray(dr)) {
      return dr.map(r => Array.isArray(r.cells) ? r.cells.map(c => c.value) : []);
    }
    return [];
  }

  function ensureSessionObject() {
    const existing = ssGet(STORAGE.session);
    if (existing && existing.session_id) return existing;

    const sess = {
      session_id: "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      started_at: nowISO(),
      last_fetch_at: null
    };
    ssSet(STORAGE.session, sess);
    return sess;
  }

  function updateSessionLastFetch() {
    const sess = ssGet(STORAGE.session) || ensureSessionObject();
    sess.last_fetch_at = nowISO();
    ssSet(STORAGE.session, sess);
  }

  function metaTagText() {
    const meta = ssGet(STORAGE.meta);
    const sess = ssGet(STORAGE.session);
    const fetched = meta?.fetched_at ? meta.fetched_at : null;
    const sid = sess?.session_id ? sess.session_id.slice(0, 12) + "…" : null;

    if (!sid && !fetched) return "no session";
    if (sid && !fetched) return sid;
    return `${sid || "session"} · ${new Date(fetched).toLocaleTimeString()}`;
  }

  function clearDatasets() {
    [STORAGE.live_status, STORAGE.live_data, STORAGE.schedule, STORAGE.entries, STORAGE.horses, STORAGE.rings, STORAGE.trainer_rows].forEach(ssRemove);
    ssRemove(STORAGE.meta);
  }

  // ------------------------------------------------------------
  // Rows hydrate (ONLY called by Start/Restart click)
  // ------------------------------------------------------------
  async function fetchRowsKeyValue() {
    const url = buildRowsUrl(KV_RANGE);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.log("[ROWS] fetch failed", res.status);
      return { ok: false, status: res.status, found: {} };
    }

    const data = await res.json();
    const rows = normalizeRowsResponse(data);

    const found = {};
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const key = String(row[0] || "").trim();
      if (!ALLOWED_KEYS.has(key)) continue;
      found[key] = safeJsonParse(row[1]);
    }

    return { ok: true, status: 200, found };
  }

  async function hydrateSession() {
    if (state.isLoading) return;
    state.isLoading = true;

    try {
      ensureSessionObject();

      const { ok, found } = await fetchRowsKeyValue();
      if (!ok) {
        state.isLoading = false;
        return;
      }

      // ALWAYS overwrite base datasets if present
      ["schedule", "entries", "horses", "rings"].forEach(k => {
        if (k in found) ssSet(k, found[k]);
      });

      // live_status
      if ("live_status" in found) ssSet(STORAGE.live_status, found.live_status);

      // live_data gated by live_status (string TRUE supported)
      if (isTrue(found.live_status) && "live_data" in found) {
        ssSet(STORAGE.live_data, found.live_data);
      } else {
        ssRemove(STORAGE.live_data);
      }

      // meta
      ssSet(STORAGE.meta, {
        fetched_at: nowISO(),
        refresh_ms: REFRESH_MS,
        keys: Object.keys(found)
      });

      updateSessionLastFetch();

      // derive trainer rows AFTER datasets exist
      if (typeof window.CRT_trainerDerive === "function") {
        window.CRT_trainerDerive(); // writes sessionStorage.trainer_rows
      }
    } finally {
      state.isLoading = false;
    }
  }

  // ------------------------------------------------------------
  // UI primitives (TackLists-like rows)
  // ------------------------------------------------------------
  function createRow(label, options = {}) {
    const { tagText, tagPositive, onClick } = options;

    const row = document.createElement("div");
    row.className = "row row--tap";

    const titleEl = document.createElement("div");
    titleEl.className = "row-title";
    titleEl.textContent = label;
    row.appendChild(titleEl);

    if (tagText != null) {
      const tag = document.createElement("div");
      tag.className = "row-tag";
      if (tagPositive) tag.classList.add("row-tag--positive");
      tag.textContent = String(tagText);
      row.appendChild(tag);
    }

    if (typeof onClick === "function") {
      row.addEventListener("click", onClick);
    }

    screenRoot.appendChild(row);
  }

  function setScreen(next, push = true) {
    if (push && state.currentScreen && state.currentScreen !== next) {
      state.history.push(state.currentScreen);
    }
    state.currentScreen = next;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    state.currentScreen = prev || "start";
    render();
  }

  // ------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------
  function renderHeader() {
    const scr = state.currentScreen;

    if (scr === "start") {
      headerTitle.textContent = "Class Desk";
      headerBack.hidden = true;
      headerAction.hidden = true;
      headerAction.textContent = "Print";
      return;
    }

    if (scr === "active") {
      headerTitle.textContent = "Session";
      headerBack.hidden = true;
      headerAction.hidden = true;
      headerAction.textContent = "Print";
      return;
    }

    if (scr === "trainer") {
      headerTitle.textContent = "Trainer Report";
      headerBack.hidden = false;
      headerAction.hidden = false;
      headerAction.textContent = "Print";
      return;
    }
  }

  function renderStart() {
    screenRoot.innerHTML = "";
    createRow("Session start", {
      tagText: metaTagText(),
      tagPositive: false,
      onClick: async () => {
        clearDatasets();
        await hydrateSession();
        setScreen("active");
      }
    });

    const sess = ssGet(STORAGE.session);
    if (sess?.session_id) {
      createRow("Session restart", {
        tagText: "refresh",
        tagPositive: false,
        onClick: async () => {
          clearDatasets();
          await hydrateSession();
          setScreen("active");
        }
      });
    }
  }

  function renderActive() {
    screenRoot.innerHTML = "";

    createRow("Trainer", {
      tagText: metaTagText(),
      tagPositive: true,
      onClick: () => setScreen("trainer")
    });

    createRow("Entries", {
      tagText: "soon",
      tagPositive: false,
      onClick: () => alert("Entries screen not wired yet.")
    });

    createRow("Session restart", {
      tagText: "refresh",
      tagPositive: false,
      onClick: async () => {
        await hydrateSession();
        render(); // refresh tag text
      }
    });
  }

  function renderTrainer() {
    screenRoot.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "report-wrap";
    wrap.innerHTML = `
      <div class="muted" style="margin:0 0 10px 0;">
        ${metaTagText()}
      </div>
      <div id="render-root"></div>
    `;
    screenRoot.appendChild(wrap);

    const rows = ssGet(STORAGE.trainer_rows) || [];
    if (!rows.length) {
      const rr = document.getElementById("render-root");
      if (rr) rr.innerHTML = `<p class="muted">No trainer data.</p>`;
      return;
    }

    if (typeof window.CRT_trainerRender === "function") {
      window.CRT_trainerRender(document.getElementById("render-root"), rows);
    }
  }

  function render() {
    renderHeader();

    if (state.currentScreen === "start") return renderStart();
    if (state.currentScreen === "active") return renderActive();
    if (state.currentScreen === "trainer") return renderTrainer();

    // fallback
    state.currentScreen = "start";
    renderStart();
  }

  // ------------------------------------------------------------
  // Events
  // ------------------------------------------------------------
  headerBack.addEventListener("click", () => goBack());

  headerAction.addEventListener("click", () => {
    if (state.currentScreen === "trainer") window.print();
  });

  // initial screen (do NOT auto-hydrate)
  const hasSession = !!ssGet(STORAGE.session)?.session_id;
  state.currentScreen = hasSession ? "start" : "start";
  render();
})();
