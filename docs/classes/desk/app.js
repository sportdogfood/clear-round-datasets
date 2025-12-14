(() => {
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  const SHEET_ID = "5ahMWHjNZcMFf3lYqYPfJ9";
  const TABLE_ID = "4f87331e-ee18-4f0c-9325-e3b5e247a907";
  const RANGE = "N2:O9999";
  const REFRESH_MS = 9 * 60 * 1000;

  const ALLOWED_KEYS = new Set([
    "live_status",
    "live_data",
    "schedule",
    "entries",
    "horses",
    "rings"
  ]);

  const els = {
    start: document.getElementById("screen-start"),
    index: document.getElementById("screen-index"),
    render: document.getElementById("screen-render"),
    title: document.getElementById("desk-title"),
    back: document.getElementById("btn-back"),
    print: document.getElementById("btn-print"),
    btnStart: document.getElementById("btn-session-start"),
    btnRestart: document.getElementById("btn-session-restart"),
    btnTrainer: document.getElementById("btn-trainer")
  };

  function buildUrl() {
    return [
      ROWS_API_BASE,
      "spreadsheets",
      SHEET_ID,
      "tables",
      TABLE_ID,
      "values",
      encodeURIComponent(RANGE)
    ].join("/");
  }

  function safeParse(v) {
    if (v == null) return null;
    try { return JSON.parse(v); } catch { return v; }
  }

  function isTrue(v) {
    return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
  }

  async function hydrateSession() {
    const res = await fetch(buildUrl(), {
      headers: { Authorization: `Bearer ${ROWS_API_KEY}` }
    });
    if (!res.ok) throw new Error("ROWS fetch failed");

    const data = await res.json();
    const rows = data.items || data.values || [];

    const found = {};
    rows.forEach(r => {
      if (!r || r.length < 2) return;
      const k = String(r[0]).trim();
      if (ALLOWED_KEYS.has(k)) found[k] = safeParse(r[1]);
    });

    ["schedule","entries","horses","rings"].forEach(k => {
      if (k in found) sessionStorage.setItem(k, JSON.stringify(found[k]));
    });

    if ("live_status" in found)
      sessionStorage.setItem("live_status", JSON.stringify(found.live_status));

    if (isTrue(found.live_status) && "live_data" in found)
      sessionStorage.setItem("live_data", JSON.stringify(found.live_data));

    sessionStorage.setItem("_crt_meta", JSON.stringify({
      fetched_at: new Date().toISOString(),
      refresh_ms: REFRESH_MS
    }));
  }

  function activateSession() {
    sessionStorage.setItem("session_active", "true");

    els.start.hidden = true;
    els.index.hidden = false;
    els.render.hidden = true;

    els.title.textContent = "Class Desk";
    els.back.hidden = true;
    els.print.hidden = true;
  }

  async function startSession() {
    await hydrateSession();
    activateSession();

    // derive AFTER hydrate
    if (window.dispatchEvent)
      window.dispatchEvent(new Event("storage"));
  }

  function restartSession() {
    [
      "schedule","entries","horses","rings",
      "live_status","live_data","trainer_rows"
    ].forEach(k => sessionStorage.removeItem(k));

    sessionStorage.removeItem("session_active");
    els.index.hidden = true;
    els.render.hidden = true;
    els.start.hidden = false;
    els.title.textContent = "Class Desk";
  }

  function showTrainer() {
    els.index.hidden = true;
    els.render.hidden = false;
    els.back.hidden = false;
    els.print.hidden = false;
    els.title.textContent = "Trainer Report";
  }

  els.btnStart.onclick = startSession;
  els.btnRestart.onclick = restartSession;
  els.btnTrainer.onclick = showTrainer;
  els.back.onclick = () => activateSession();
  els.print.onclick = () => window.print();

  // restore existing session
  if (sessionStorage.getItem("session_active") === "true") {
    activateSession();
  }
})();
