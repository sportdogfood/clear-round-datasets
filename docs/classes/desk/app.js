
// docs/classes/desk/app.js
(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SPREADSHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";

  const RANGES = {
    live_status: "N4:N4",
    live_data: "N5:N5",
    schedule: "N7:N7",
    entries: "N14:N14",
    horses: "N27:N27",
    rings: "N28:N28"
  };

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

  function extractCellValue(data) {
    if (!data) return null;

    // SAME LOGIC AS YOUR WORKING APP
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
    const res = await fetch(buildUrl(range), {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) return null;

    const data = await res.json();
    const cell = extractCellValue(data);

    if (!cell) return null;

    try {
      return typeof cell === "string" ? JSON.parse(cell) : cell;
    } catch {
      return null;
    }
  }

  async function run() {
    const payload = { fetched_at: new Date().toISOString() };

    for (const key in RANGES) {
      payload[key] = await fetchRange(RANGES[key]);
    }

    window.CRT_PAYLOAD = payload;
    sessionStorage.setItem("crt_desk_payload", JSON.stringify(payload));

    console.log("[CRT] payload ready", payload);
  }

  run();
})();

