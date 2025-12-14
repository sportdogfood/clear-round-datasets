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

  // ---------------- DOM ----------------
  const idle = document.getElementById("screen-idle");
  const active = document.getElementById("screen-active");
  const render = document.getElementById("screen-render");

  const btnStart = document.getElementById("btn-session-start");
  const btnRestart = document.getElementById("btn-session-restart");
  const btnTrainer = document.getElementById("btn-trainer");
  const btnBack = document.getElementById("btn-back");
  const btnPrint = document.getElementById("btn-print");
  const title = document.getElementById("desk-title");

  // ---------------- HELPERS ----------------
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
    try { return JSON.parse(v); } catch { return v; }
  }

  function isTrue(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  }

  function setActiveUI() {
    idle.hidden = true;
    active.hidden = false;
    render.hidden = true;
    btnBack.hidden = true;
    btnPrint.hidden = true;
    title.textContent = "Class Desk";
    sessionStorage.setItem("session_active", "1");
  }

  function setIdleUI() {
    idle.hidden = false;
    active.hidden = true;
    render.hidden = true;
    btnBack.hidden = true;
    btnPrint.hidden = true;
    title.textContent = "Class Desk";
    sessionStorage.removeItem("session_active");
  }

  // ---------------- SESSION FETCH ----------------
  async function hydrateSession() {
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
      if (!ALLOWED_KEYS.has(key)) continue;
      found[key] = safeParse(row[1]);
    }

    ["schedule","entries","horses","rings"].forEach(k => {
      sessionStorage.setItem(k, JSON.stringify(found[k] || []));
    });

    sessionStorage.setItem("live_status", JSON.stringify(found.live_status));
    if (isTrue(found.live_status)) {
      sessionStorage.setItem("live_data", JSON.stringify(found.live_data || null));
    } else {
      sessionStorage.removeItem("live_data");
    }

    sessionStorage.setItem("_crt_meta", JSON.stringify({
      fetched_at: new Date().toISOString()
    }));

    // derive trainer rows immediately
    if (window.CRT_deriveTrainer) {
      window.CRT_deriveTrainer();
    }
  }

  // ---------------- EVENTS ----------------
  btnStart.onclick = async () => {
    await hydrateSession();
    setActiveUI();
  };

  btnRestart.onclick = async () => {
    await hydrateSession();
    setActiveUI();
  };

  btnTrainer.onclick = () => {
    title.textContent = "Trainer Report";
    btnBack.hidden = false;
    btnPrint.hidden = false;
    active.hidden = true;
    render.hidden = false;
    window.CRT_renderTrainer && window.CRT_renderTrainer();
  };

  btnBack.onclick = () => {
    setActiveUI();
  };

  btnPrint.onclick = () => window.print();

  // ---------------- INIT ----------------
  if (sessionStorage.getItem("session_active") === "1") {
    setActiveUI();
  } else {
    setIdleUI();
  }
})();
