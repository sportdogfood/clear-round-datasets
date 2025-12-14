// app.js (Class Desk desktop)
// - Uses TackLists cadence: state + render() + createRow()
// - Requires: session-start + session-restart
// - Rows hydrate ONLY on session-start/session-restart (not on load)
// - Starts a 9-min refresh timer ONLY after session-start/restart
// - Trainer/Entries are screens; Print from header-action on those screens

(() => {
  "use strict";

  // ----------------------------
  // Config
  // ----------------------------
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

  const K = {
    sess: "_desk_session",
    meta: "_crt_meta",
    // datasets:
    live_status: "live_status",
    live_data: "live_data",
    schedule: "schedule",
    entries: "entries",
    horses: "horses",
    rings: "rings"
  };

  // ----------------------------
  // DOM refs
  // ----------------------------
  const headerTitle = document.getElementById("header-title");
  const headerBack = document.getElementById("header-back");
  const headerAction = document.getElementById("header-action");
  const screenRoot = document.getElementById("screen-root");

  if (!headerTitle || !headerBack || !headerAction || !screenRoot) return;

  // ----------------------------
  // State
  // ----------------------------
  const state = {
    currentScreen: "start", // start | active | trainer | entries
    history: [],
    refreshTimer: null,
    isHydrating: false
  };

  // ----------------------------
  // Storage helpers
  // ----------------------------
  function ssGetRaw(key) {
    return sessionStorage.getItem(key);
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
    try {
      sessionStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }

  function ssRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function isTrue(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  }

  function safeParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }

  // ----------------------------
  // Rows fetch
  // ----------------------------
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

  function normalizeRowsResponse(data) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.values)) return data.values;

    const dr = data?.data?.rows;
    if (Array.isArray(dr)) {
      return dr.map(r =>
        Array.isArray(r.cells) ? r.cells.map(c => c.value) : []
      );
    }
    return [];
  }

  async function fetchRowsKeyValue() {
    const res = await fetch(buildUrl(), {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.log("[DESK] rows fetch failed", res.status);
      return { ok: false, status: res.status, found: {} };
    }

    const data = await res.json();
    const rows = normalizeRowsResponse(data);

    const found = {};
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const key = String(row[0] || "").trim();
      if (!ALLOWED_KEYS.has(key)) continue;
      found[key] = safeParse(row[1]);
    }

    return { ok: true, status: 200, found };
  }

  // ----------------------------
  // Session cadence (start/restart)
  // ----------------------------
  function createNewSession() {
    const sess = {
      session_id: "desk-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
      started_at: nowISO(),
      last_hydrate_at: null
    };
    ssSet(K.sess, sess);
    return sess;
  }

  function ensureSession() {
    const s = ssGet(K.sess);
    if (s && s.session_id) return s;
    return createNewSession();
  }

  function clearDeskData() {
    // keep session object; clear datasets/meta (fresh pull overwrites anyway)
    [K.meta, K.live_status, K.live_data, K.schedule, K.entries, K.horses, K.rings, "trainer_rows"].forEach(ssRemove);
  }

  function startRefreshTimer() {
    if (state.refreshTimer) return;
    state.refreshTimer = setInterval(async () => {
      const sess = ssGet(K.sess);
      if (!sess?.session_id) return; // no session -> do nothing
      if (state.currentScreen === "start") return; // don't auto-fetch on start screen
      await hydrateSession(false);
      // don't change screens; just update current UI tags
      render();
    }, REFRESH_MS);
  }

  async function hydrateSession(deriveTrainer = true) {
    if (state.isHydrating) return;
    state.isHydrating = true;

    try {
      const sess = ensureSession();

      const { ok, found } = await fetchRowsKeyValue();
      if (!ok) return;

      // always overwrite base datasets if present
      ["schedule", "entries", "horses", "rings"].forEach(k => {
        if (k in found) ssSet(k, found[k]);
      });

      // store live_status as-is (string TRUE supported)
      if ("live_status" in found) ssSet(K.live_status, found.live_status);

      // gate live_data write
      if (isTrue(found.live_status) && "live_data" in found) {
        ssSet(K.live_data, found.live_data);
      } else {
        ssRemove(K.live_data);
      }

      sess.last_hydrate_at = nowISO();
      ssSet(K.sess, sess);

      // meta (for debug + tag)
      const meta = {
        fetched_at: sess.last_hydrate_at,
        refresh_ms: REFRESH_MS,
        keys: Object.keys(found),
        counts: {
          schedule: Array.isArray(found.schedule) ? found.schedule.length : null,
          entries: Array.isArray(found.entries) ? found.entries.length : null,
          horses: Array.isArray(found.horses) ? found.horses.length : null,
          rings: Array.isArray(found.rings) ? found.rings.length : null
        },
        live_status: found.live_status
      };
      ssSet(K.meta, meta);

      console.log("[DESK] hydrated", meta);

      // derive trainer rows if the file provides it
      if (deriveTrainer && typeof window.CRT_trainerDerive === "function") {
        const rows = window.CRT_trainerDerive();
        // CRT_trainerDerive already writes trainer_rows
        console.log("[DESK] trainer derive done", Array.isArray(rows) ? rows.length : null);
      }
    } finally {
      state.isHydrating = false;
    }
  }

  // ----------------------------
  // UI helpers (same cadence)
  // ----------------------------
  function createRow(label, options = {}) {
    const { tagText, tagVariant, tagPositive, active, onClick } = options;

    const row = document.createElement("div");
    row.className = "row row--tap";
    if (active) row.classList.add("row--active");

    const titleEl = document.createElement("div");
    titleEl.className = "row-title";
    titleEl.textContent = label;
    row.appendChild(titleEl);

    if (tagText != null || tagVariant) {
      const tagEl = document.createElement("div");
      tagEl.className = "row-tag";
      if (tagVariant) tagEl.classList.add(`row-tag--${tagVariant}`);
      if (tagPositive) tagEl.classList.add("row-tag--positive");
      if (tagText != null) tagEl.textContent = String(tagText);
      row.appendChild(tagEl);
    }

    if (typeof onClick === "function") row.addEventListener("click", onClick);

    screenRoot.appendChild(row);
  }

  function titleForScreen(scr) {
    if (scr === "start") return "Start";
    if (scr === "active") return "Session";
    if (scr === "trainer") return "Trainer";
    if (scr === "entries") return "Entries";
    return "Start";
  }

  function setScreen(newScreen, pushHistory = true) {
    if (pushHistory && state.currentScreen && state.currentScreen !== newScreen) {
      state.history.push(state.currentScreen);
    }
    state.currentScreen = newScreen;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    state.currentScreen = prev || "start";
    render();
  }

  function metaTag() {
    const meta = ssGet(K.meta);
    if (!meta?.fetched_at) return "no fetch";
    try {
      const t = new Date(meta.fetched_at).toLocaleTimeString();
      return t;
    } catch {
      return "fetched";
    }
  }

  // ----------------------------
  // Screens
  // ----------------------------
  function renderHeader() {
    headerTitle.textContent = titleForScreen(state.currentScreen);

    // back button cadence like TackLists: hide on start, show otherwise
    headerBack.style.visibility = (state.currentScreen === "start") ? "hidden" : "visible";

    if (state.currentScreen === "trainer" || state.currentScreen === "entries") {
      headerAction.hidden = false;
      headerAction.textContent = "Print";
      headerAction.dataset.action = "print";
    } else {
      headerAction.hidden = true;
      headerAction.textContent = "";
      delete headerAction.dataset.action;
    }
  }

  function renderStartScreen() {
    screenRoot.innerHTML = "";

    const logo = document.createElement("div");
    logo.className = "start-logo";
    logo.innerHTML = `
      <div class="start-logo-mark"></div>
      <div class="start-logo-title">Class Desk</div>
      <div class="start-logo-subtitle">Session-start → Trainer / Entries → Print</div>
    `;
    screenRoot.appendChild(logo);

    const hasSession = !!ssGet(K.sess)?.session_id;

    if (!hasSession) {
      createRow("Session start", {
        tagVariant: "boolean",
        tagPositive: false,
        onClick: async () => {
          console.log("[DESK] session-start click");
          createNewSession();
          clearDeskData();
          await hydrateSession(true);
          startRefreshTimer();
          setScreen("active");
        }
      });
      return;
    }

    createRow("In-session", {
      active: true,
      tagText: metaTag(),
      tagVariant: "count",
      tagPositive: true,
      onClick: () => setScreen("active")
    });

    createRow("Session restart", {
      tagVariant: "boolean",
      tagPositive: false,
      onClick: async () => {
        console.log("[DESK] session-restart click");
        createNewSession();
        clearDeskData();
        await hydrateSession(true);
        startRefreshTimer();
        setScreen("active");
      }
    });
  }

  function renderActiveScreen() {
    screenRoot.innerHTML = "";

    createRow("Trainer", {
      tagText: metaTag(),
      tagVariant: "count",
      tagPositive: true,
      onClick: async () => {
        // ensure trainer_rows exists at time of click
        if (typeof window.CRT_trainerDerive === "function") {
          window.CRT_trainerDerive();
        }
        setScreen("trainer");
      }
    });

    createRow("Entries", {
      tagText: ssGetRaw(K.live_data) ? "live" : "—",
      tagVariant: "count",
      tagPositive: !!ssGetRaw(K.live_data),
      onClick: () => setScreen("entries")
    });

    createRow("Session restart", {
      tagVariant: "boolean",
      tagPositive: false,
      onClick: async () => {
        console.log("[DESK] session-restart click (active)");
        createNewSession();
        clearDeskData();
        await hydrateSession(true);
        startRefreshTimer();
        render(); // stay on active
      }
    });

    const note = document.createElement("div");
    note.className = "report-note";
    const meta = ssGet(K.meta);
    note.textContent = meta?.counts
      ? `schedule:${meta.counts.schedule ?? "?"} entries:${meta.counts.entries ?? "?"} horses:${meta.counts.horses ?? "?"} rings:${meta.counts.rings ?? "?"} · live_status:${meta.live_status}`
      : "no meta";
    screenRoot.appendChild(note);
  }

  function renderTrainerScreen() {
    screenRoot.innerHTML = "";

    const rows = ssGet("trainer_rows") || [];
    const meta = ssGet(K.meta);

    const label = document.createElement("div");
    label.className = "report-title";
    label.textContent = `Trainer report · ${meta?.fetched_at ? new Date(meta.fetched_at).toLocaleTimeString() : "no fetch"} · rows:${rows.length}`;
    screenRoot.appendChild(label);

    const root = document.createElement("div");
    root.id = "render-root";
    screenRoot.appendChild(root);

    if (!rows.length) {
      const p = document.createElement("div");
      p.className = "report-note";
      p.textContent = "No trainer data.";
      root.appendChild(p);
      return;
    }

    if (typeof window.CRT_trainerRender === "function") {
      window.CRT_trainerRender(root, rows);
      return;
    }

    const p = document.createElement("div");
    p.className = "report-note";
    p.textContent = "trainer-render.js not loaded (CRT_trainerRender missing).";
    root.appendChild(p);
  }

  function renderEntriesScreen() {
    screenRoot.innerHTML = "";

    const live = ssGet(K.live_data);
    const meta = ssGet(K.meta);

    const label = document.createElement("div");
    label.className = "report-title";
    label.textContent = `Entries · ${meta?.fetched_at ? new Date(meta.fetched_at).toLocaleTimeString() : "no fetch"}`;
    screenRoot.appendChild(label);

    const root = document.createElement("div");
    root.id = "render-root";
    screenRoot.appendChild(root);

    if (!live) {
      const p = document.createElement("div");
      p.className = "report-note";
      p.textContent = "No live_data (live_status must be TRUE).";
      root.appendChild(p);
      return;
    }

    // placeholder: your entries renderer will replace this
    const p = document.createElement("div");
    p.className = "report-note";
    p.textContent = "live_data present (renderer pending).";
    root.appendChild(p);
  }

  function render() {
    renderHeader();

    if (state.currentScreen === "start") return renderStartScreen();
    if (state.currentScreen === "active") return renderActiveScreen();
    if (state.currentScreen === "trainer") return renderTrainerScreen();
    if (state.currentScreen === "entries") return renderEntriesScreen();

    state.currentScreen = "start";
    renderStartScreen();
  }

  // ----------------------------
  // Events
  // ----------------------------
  headerBack.addEventListener("click", () => {
    if (headerBack.style.visibility === "hidden") return;
    goBack();
  });

  headerAction.addEventListener("click", () => {
    if (headerAction.dataset.action === "print") window.print();
  });

  // ----------------------------
  // Initial render (NO auto hydrate)
  // ----------------------------
  render();
})();
