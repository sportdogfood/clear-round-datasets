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
    return `${ROWS_API_BASE}/spreadsheets/${SPREADSHEET_ID}/tables/${TABLE_ID}/values/${encodeURIComponent(range)}`;
  }

  async function fetchRange(range) {
    const res = await fetch(buildUrl(range), {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.values?.[0]?.[0] || null;
  }

  async function run() {
    const payload = { fetched_at: new Date().toISOString() };

    for (const k in RANGES) {
      const raw = await fetchRange(RANGES[k]);
      payload[k] = raw ? JSON.parse(raw) : null;
    }

    sessionStorage.setItem("crt_desk_payload", JSON.stringify(payload));
    window.CRT_PAYLOAD = payload;

    console.log("[CRT] payload ready", payload);
  }

  run();
})();
