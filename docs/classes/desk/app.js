
// app.js — FULL REPLACEMENT (match on column N, payload from column 
// app.js — FULL REPLACEMENT (N:O contract, sessionStorage-first, no ES modules)

(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";

  // N = label, O = payload
  const RANGE = "N2:O999";

  const REQUIRED_KEYS = [
    "live_status",
    "live_data",
    "schedule",
    "entries",
    "horses",
    "rings"
  ];

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

  async function fetchAll() {
    const res = await fetch(buildUrl(), {
      method: "GET",
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
      if (!key) continue;

      found[key] = safeParse(row[1]);
    }

    // write schedule, entries, horses, rings always
    ["schedule", "entries", "horses", "rings"].forEach(k => {
      if (k in found) {
        sessionStorage.setItem(k, JSON.stringify(found[k]));
      }
    });

    // live_status gate
    if ("live_status" in found) {
      sessionStorage.setItem("live_status", JSON.stringify(found.live_status));

      if (found.live_status === true && "live_data" in found) {
        sessionStorage.setItem(
          "live_data",
          JSON.stringify(found.live_data)
        );
      } else {
        sessionStorage.removeItem("live_data");
      }
    }

    sessionStorage.setItem(
      "_crt_meta",
      JSON.stringify({
        fetched_at: new Date().toISOString(),
        keys: Object.keys(found)
      })
    );

    console.log("[CRT] session hydrated", found);
  }

  fetchAll();
})();

