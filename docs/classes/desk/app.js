// docs/classes/desk/app.js
// FULL REPLACEMENT — NO MODULES, NO EXPORTS
// Fetch ONE payload row from Rows and expose it on window.CRT_PAYLOAD

(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SPREADSHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";

  // ONE ROW that contains JSON cells in fixed order
  // [ live_status, live_data, schedule, entries, horses, rings ]
  const RANGE = "A2:F2";

  const STORAGE_KEY = "crt_desk_payload";

  function buildUrl(range) {
    return [
      ROWS_API_BASE,
      "spreadsheets",
      encodeURIComponent(SPREADSHEET_ID),
      "tables",
      encodeURIComponent(TABLE_ID),
      "values",
      encodeURIComponent(range)
    ].join("/");
  }

  function safeParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  async function fetchPayload() {
    const url = buildUrl(RANGE);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.error("[ROWS] failed", res.status);
      return null;
    }

    const data = await res.json();

    let rows = [];
    if (Array.isArray(data.items)) rows = data.items;
    else if (Array.isArray(data.values)) rows = data.values;
    else if (data.data && Array.isArray(data.data.rows)) {
      rows = data.data.rows.map(r =>
        Array.isArray(r.cells) ? r.cells.map(c => c.value) : []
      );
    }

    if (!rows.length || !rows[0]) return null;

    const row = rows[0];

    const payload = {
      fetched_at: new Date().toISOString(),
      live_status: safeParse(row[0]),
      live_data: safeParse(row[1]),
      schedule: safeParse(row[2]),
      entries: safeParse(row[3]),
      horses: safeParse(row[4]),
      rings: safeParse(row[5])
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.CRT_PAYLOAD = payload;

    console.log("[CRT] payload ready", payload);
    return payload;
  }

  async function init() {
    await fetchPayload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
