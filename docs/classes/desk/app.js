// File: docs/classes/desk/app.js
// Session Start/Restart => Rows hydrate => sessionStorage datasets
// NO AUTO FETCH on refresh unless an ACTIVE session exists AND refresh timer fires.

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
    screenStart: document.getElementById("screen-start"),
    screenActive: document.getElementById("screen-active"),
    screenRender: document.getElementById("screen-render"),

    btnSessionStart: document.getElementById("btn-session-start"),
    btnSessionRestart: document.getElementById("btn-session-restart"),
    btnTrainer: document.getElementById("btn-trainer"),
    btnEntries: document.getElementById("btn-entries"),

    status: document.getElementById("session-status"),
    meta: document.getElementById("session-meta")
  };

  let refreshTimer = null;

  function nowIso() {
    return new Date().toISOString();
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

  function safeParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    const s = v.trim();
    if (!s) return s;
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
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

  function writeJson(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function uiShowStart() {
    if (els.screenStart) els.screenStart.hidden = false;
    if (els.screenActive) els.screenActive.hidden = true;
    if (els.screenRender) els.screenRender.hidden = true;
  }

  function uiShowActive() {
    if (els.screenStart) els.screenStart.hidden = true;
    if (els.screenActive) els.screenActive.hidden = false;
    if (els.screenRender) els.screenRender.hidden = true;
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text || "";
  }

  function setMeta(text) {
    if (els.meta) els.meta.textContent = text || "";
  }

  async function fetchRowsKeyValue() {
    const res = await fetch(buildUrl(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`Rows GET failed (${res.status})`);
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

  function writeDatasets(found) {
    // base datasets always overwrite if present
    ["schedule", "entries", "horses", "rings"].forEach((k) => {
      if (k in found) writeJson(k, found[k]);
    });

    if ("live_status" in found) writeJson("live_status", found.live_status);

    // live_data only written when live_status truthy AND live_data present
    if (isTrue(found.live_status) && "live_data" in found) {
      writeJson("live_data", found.live_data);
    } else {
      // do not destroy any prior live_data unless explicitly not-live
      // (keeps last known; entries module can decide)
      // If you want it cleared on false, uncomment:
      // sessionStorage.removeItem("live_data");
    }

    writeJson("_crt_meta", {
      active: true,
      fetched_at: nowIso(),
      refresh_ms: REFRESH_MS,
      keys_written: Object.keys(found)
    });
  }

  function deriveTrainerIfPresent() {
    if (typeof window.CRT_deriveTrainer === "function") {
      try { window.CRT_deriveTrainer(); } catch {}
    }
  }

  function dispatchHydrated() {
    try {
      window.dispatchEvent(new CustomEvent("crt:session-hydrated"));
    } catch {}
  }

  function snapshotMeta() {
    const meta = readJson("_crt_meta");
    const liveStatus = readJson("live_status");
    const keys = meta?.keys_written || [];
    return [
      `active: ${meta?.active ? "true" : "false"}`,
      `fetched_at: ${meta?.fetched_at || "-"}`,
      `refresh_ms: ${meta?.refresh_ms || REFRESH_MS}`,
      `live_status: ${String(liveStatus)}`,
      `keys: ${keys.join(", ")}`
    ].join("\n");
  }

  async function hydrateSession() {
    setStatus("Loading…");
    try {
      const found = await fetchRowsKeyValue();
      writeDatasets(found);
      deriveTrainerIfPresent();
      dispatchHydrated();

      setStatus("Session ready.");
      setMeta(snapshotMeta());
      return true;
    } catch (e) {
      setStatus("Rows load failed (see console).");
      // keep existing sessionStorage datasets
      console.error("[CRT] hydrate failed", e);
      setMeta(snapshotMeta());
      return false;
    }
  }

  function clearActiveFlagOnly() {
    const meta = readJson("_crt_meta") || {};
    meta.active = false;
    meta.fetched_at = meta.fetched_at || nowIso();
    writeJson("_crt_meta", meta);
  }

  function stopRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function startRefreshTimerFromMeta() {
    stopRefreshTimer();

    const meta = readJson("_crt_meta");
    if (!meta?.active) return;

    const fetchedAt = Date.parse(meta.fetched_at || "");
    const age = Number.isFinite(fetchedAt) ? (Date.now() - fetchedAt) : REFRESH_MS;
    const delay = Math.max(1000, REFRESH_MS - age);

    refreshTimer = setTimeout(async () => {
      // refresh and then schedule next
      await hydrateSession();
      startRefreshTimerFromMeta();
    }, delay);
  }

  async function onSessionStart() {
    uiShowStart();
    setStatus("Starting session…");
    const ok = await hydrateSession();
    if (ok) {
      uiShowActive();
      startRefreshTimerFromMeta();
    } else {
      uiShowStart();
    }
  }

  async function onSessionRestart() {
    uiShowActive();
    setStatus("Refreshing…");
    const ok = await hydrateSession();
    if (ok) {
      uiShowActive();
      startRefreshTimerFromMeta();
    }
  }

  function initFromStorage() {
    const meta = readJson("_crt_meta");
    if (meta?.active) {
      uiShowActive();
      setStatus("");
      setMeta(snapshotMeta());
      startRefreshTimerFromMeta();
    } else {
      uiShowStart();
      setStatus("");
      setMeta("");
    }
  }

  // Wire buttons
  if (els.btnSessionStart) {
    els.btnSessionStart.addEventListener("click", onSessionStart);
  }
  if (els.btnSessionRestart) {
    els.btnSessionRestart.addEventListener("click", onSessionRestart);
  }

  // Expose manual
  window.CRT_hydrateSession = hydrateSession;
  window.CRT_stopSession = () => {
    stopRefreshTimer();
    clearActiveFlagOnly();
    uiShowStart();
    setStatus("");
    setMeta("");
  };

  initFromStorage();
})();
