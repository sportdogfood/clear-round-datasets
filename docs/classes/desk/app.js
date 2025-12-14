(() => {
  // --------------------------------------------------
  // CONFIG
  // --------------------------------------------------
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

  // --------------------------------------------------
  // DOM
  // --------------------------------------------------
  const btnStart = document.getElementById("btn-session-start");
  const btnRestart = document.getElementById("btn-session-restart");
  const btnTrainer = document.getElementById("btn-trainer");
  const btnEntries = document.getElementById("btn-entries");

  const screenIndex = document.getElementById("screen-index");
  const screenRender = document.getElementById("screen-render");

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------
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

  // --------------------------------------------------
  // SESSION HYDRATION (ROWS INVOKE)
  // --------------------------------------------------
  async function hydrateSession() {
    const res = await fetch(buildUrl(), {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.error("[ROWS] fetch failed", res.status);
      return;
    }

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
      if (!ALLOWED_KEYS.has(key)) continue;
      found[key] = safeParse(row[1]);
    }

    // overwrite datasets
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

    // gate live_data
    if (isTrue(found.live_status) && "live_data" in found) {
      sessionStorage.setItem(
        "live_data",
        JSON.stringify(found.live_data)
      );
    } else {
      sessionStorage.removeItem("live_data");
    }

    sessionStorage.setItem(
      "_crt_meta",
      JSON.stringify({
        fetched_at: new Date().toISOString(),
        refresh_ms: REFRESH_MS
      })
    );

    console.log("[CRT] session hydrated", Object.keys(found));
  }

  // --------------------------------------------------
  // UI STATE
  // --------------------------------------------------
  function setSessionActive(active) {
    btnStart.hidden = active;
    btnRestart.hidden = !active;
    btnTrainer.hidden = !active;
    btnEntries.hidden = !active;
  }

  // --------------------------------------------------
  // EVENTS
  // --------------------------------------------------
  btnStart.addEventListener("click", async () => {
    await hydrateSession();
    setSessionActive(true);
  });

  btnRestart.addEventListener("click", async () => {
    await hydrateSession();
  });

  btnTrainer.addEventListener("click", () => {
    screenIndex.hidden = true;
    screenRender.hidden = false;

    if (window.CRT_renderTrainer) {
      window.CRT_renderTrainer();
    }
  });

  btnEntries.addEventListener("click", () => {
    screenIndex.hidden = true;
    screenRender.hidden = false;

    if (window.CRT_renderEntries) {
      window.CRT_renderEntries();
    }
  });

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------
  setSessionActive(false);

  // expose manual refresh (admin/debug)
  window.CRT_refreshSession = hydrateSession;
})();
