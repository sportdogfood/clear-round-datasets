// docs/classes/desk/app.js
(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";

  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";

  const RANGES = {
    live_status: "N4:N4",
    live_data: "N5:N5",
    schedule: "N7:N7",
    entries: "N14:N14",
    horses: "N27:N27",
    rings: "N28:N28"
  };

  const STORAGE_KEYS = {
    index: "crt_desk_index",
    live_status: "crt_live_status",
    live_data: "crt_live_data",
    schedule: "crt_schedule",
    entries: "crt_entries",
    horses: "crt_horses",
    rings: "crt_rings"
  };

  function buildRowsUrl(range) {
    return [
      ROWS_API_BASE,
      "spreadsheets",
      encodeURIComponent(SHEET_ID),
      "tables",
      encodeURIComponent(TABLE_ID),
      "values",
      encodeURIComponent(range)
    ].join("/");
  }

  function safeJsonParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  function extractFirstCell(data) {
    if (!data) return null;

    if (Array.isArray(data.items)) {
      return data.items[0]?.[0] ?? null;
    }

    if (Array.isArray(data.values)) {
      return data.values[0]?.[0] ?? null;
    }

    if (data.data && Array.isArray(data.data.rows)) {
      const row = data.data.rows[0];
      if (row?.cells?.[0]?.value != null) {
        return row.cells[0].value;
      }
    }

    return null;
  }

  async function fetchRange(range) {
    const res = await fetch(buildRowsUrl(range), {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) return null;

    const data = await res.json();
    return safeJsonParse(extractFirstCell(data));
  }

  async function startSession() {
    Object.values(STORAGE_KEYS).forEach(k => sessionStorage.removeItem(k));

    const index = {
      session_id:
        "desk-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 7),
      created_at: new Date().toISOString(),
      payloads: {}
    };

    for (const key in RANGES) {
      const payload = await fetchRange(RANGES[key]);
      sessionStorage.setItem(STORAGE_KEYS[key], JSON.stringify(payload));
      index.payloads[key] = !!payload;
    }

    sessionStorage.setItem(STORAGE_KEYS.index, JSON.stringify(index));

    window.CRT_DESK_SESSION = {
      index,
      live_status: safeJsonParse(sessionStorage.getItem(STORAGE_KEYS.live_status)),
      live_data: safeJsonParse(sessionStorage.getItem(STORAGE_KEYS.live_data)),
      schedule: safeJsonParse(sessionStorage.getItem(STORAGE_KEYS.schedule)),
      entries: safeJsonParse(sessionStorage.getItem(STORAGE_KEYS.entries)),
      horses: safeJsonParse(sessionStorage.getItem(STORAGE_KEYS.horses)),
      rings: safeJsonParse(sessionStorage.getItem(STORAGE_KEYS.rings))
    };

    console.log("[CRT DESK] session ready", window.CRT_DESK_SESSION);
  }

  startSession();
})();
