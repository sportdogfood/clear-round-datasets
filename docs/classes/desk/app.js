// docs/classes/desk/app.js

(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";

  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";
// app.js — FULL REPLACEMENT (match on column N, payload from column 

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";

  // fetch full context so N/O exist
  const RANGE = "A2:O999";

  const STORAGE_KEY = "crt_live_data";

  function url() {
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

  function parse(v) {
    if (!v) return null;
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return null; }
  }

  async function run() {
    const res = await fetch(url(), {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });
    if (!res.ok) throw new Error("Rows fetch failed");

    const data = await res.json();

    const rows =
      data.items ||
      data.values ||
      (data.data?.rows || []).map(r =>
        Array.isArray(r.cells) ? r.cells.map(c => c.value) : []
      );

    const MATCH = "live_data"; // column N value

    let payload = null;

    for (const row of rows) {
      if (!row) continue;
      // N = index 13, O = index 14
      if (String(row[13] || "").trim() === MATCH) {
        payload = parse(row[14]);
        break;
      }
    }

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fetched_at: new Date().toISOString(),
        payload
      })
    );

    console.log("[CRT] live_data ready", payload);
  }

  run();
})();

