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
  let refreshTimer = null;

  const STORAGE_KEYS = {
    active: "_crt_session_active",
    meta: "_crt_meta"
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
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }

  function isTrue(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  }

  function setSessionActive(flag) {
    sessionStorage.setItem(STORAGE_KEYS.active, flag ? "1" : "0");
  }

  function isSessionActive() {
    return sessionStorage.getItem(STORAGE_KEYS.active) === "1";
  }

  async function hydrateSession() {
    if (!isSessionActive()) return;

    const res = await fetch(buildUrl(), {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) return;

    const data = await res.json();
    const rows =
      data.items ||
      data.values ||
      (data.data?.rows || []).map(r =>
        Array.isArray(r.cells) ? r.cells.map(c => c.value) : []
      );

    const found = {};

    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const key = String(row[0] || "").trim();
      if (!ALLOWED_KEYS.includes(key)) continue;
      found[key] = safeParse(row[1]);
    }

    // overwrite base datasets
    ["schedule", "entries", "horses", "rings"].forEach(k => {
      if (k in found) {
        sessionStorage.setItem(k, JSON.stringify(found[k]));
      }
    });

    // live_status
    if ("live_status" in found) {
      sessionStorage.setItem(
        "live_status",
        JSON.stringify(found.live_status)
      );
    }

    // gated live_data
    if (isTrue(found.live_status) && "live_data" in found) {
      sessionStorage.setItem(
        "live_data",
        JSON.stringify(found.live_data)
      );
    } else {
      sessionStorage.removeItem("live_data");
    }

    sessionStorage.setItem(
      STORAGE_KEYS.meta,
      JSON.stringify({
        fetched_at: new Date().toISOString(),
        refresh_ms: REFRESH_MS
      })
    );

    console.log("[CRT] session hydrated");
  }

  function startSession() {
    setSessionActive(true);
    hydrateSession();

    clearInterval(refreshTimer);
    refreshTimer = setInterval(hydrateSession, REFRESH_MS);
  }

  function restartSession() {
    ALLOWED_KEYS.forEach(k => sessionStorage.removeItem(k));
    sessionStorage.removeItem("live_data");
    startSession();
  }

  // expose controls
  window.CRT_sessionStart = startSession;
  window.CRT_sessionRestart = restartSession;
  window.CRT_refreshSession = hydrateSession;

})();
