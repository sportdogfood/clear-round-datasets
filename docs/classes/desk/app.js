
// app.js — FULL REPLACEMENT (match on column N, payload from column 
// app.js — FULL REPLACEMENT (N:O contract, sessionStorage-first, no ES modules)


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

  const REFRESH_MS = 9 * 60 * 1000; // 9 minutes

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

    // overwrite session state
    for (const key of ALLOWED_KEYS) {
      if (key in found) {
        sessionStorage.setItem(key, JSON.stringify(found[key]));
      } else {
        sessionStorage.removeItem(key);
      }
    }

    // live_data gate
    if (found.live_status !== true) {
      sessionStorage.removeItem("live_data");
    }

    sessionStorage.setItem(
      "_crt_meta",
      JSON.stringify({
        fetched_at: new Date().toISOString(),
        refresh_ms: REFRESH_MS
      })
    );

    console.log("[CRT] session ready", found);
  }

  // initial load
  hydrateSession();

  // timed refresh
  setInterval(hydrateSession, REFRESH_MS);

  // expose manual refresh
  window.CRT_refreshSession = hydrateSession;
})();


  fetchAll();
})();

