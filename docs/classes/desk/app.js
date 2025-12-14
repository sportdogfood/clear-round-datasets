(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY || "rows-1lpXw***";

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

  function safeParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return { __parse_error: true, raw: v };
    }
  }

  async function fetchRange(label, range) {
    const url = buildUrl(range);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      console.error(`[ROWS] ${label} failed`, res.status);
      return;
    }

    const data = await res.json();

    let cell;
    if (Array.isArray(data.values)) {
      cell = data.values[0]?.[0];
    } else if (Array.isArray(data.items)) {
      cell = data.items[0]?.[0];
    } else if (data.data?.rows) {
      cell = data.data.rows[0]?.cells?.[0]?.value;
    }

    const parsed = safeParse(cell);

    console.group(`ROWS PAYLOAD: ${label}`);
    console.log("range:", range);
    console.log("raw:", cell);
    console.log("parsed:", parsed);
    console.groupEnd();

    return parsed;
  }

  async function run() {
    const results = {};
    for (const [label, range] of Object.entries(RANGES)) {
      results[label] = await fetchRange(label, range);
    }

    // expose for inspection
    window.__TRAINER_ROWS__ = results;

    const pre = document.getElementById("debug");
    if (pre) {
      pre.textContent = JSON.stringify(results, null, 2);
    }
  }

  run();
})();
