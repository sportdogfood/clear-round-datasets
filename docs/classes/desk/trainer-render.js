// File: docs/classes/desk/trainer-render.js
// Renders trainer report from sessionStorage.trainer_rows
// Expects index.html IDs from the desk UI. Guards all null refs.

(() => {
  const screenStart = document.getElementById("screen-start");
  const screenActive = document.getElementById("screen-active");
  const screenRender = document.getElementById("screen-render");
  const renderRoot = document.getElementById("render-root");

  const btnTrainer = document.getElementById("btn-trainer");
  const btnBack = document.getElementById("btn-back");
  const btnPrint = document.getElementById("btn-print");
  const titleEl = document.getElementById("desk-title");

  function read(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function showActiveScreen() {
    if (screenStart) screenStart.hidden = true;
    if (screenActive) screenActive.hidden = false;
    if (screenRender) screenRender.hidden = true;
    if (btnBack) btnBack.hidden = true;
    if (btnPrint) btnPrint.hidden = true;
    if (titleEl) titleEl.textContent = "Class Desk";
  }

  function showRenderScreen(title) {
    if (screenStart) screenStart.hidden = true;
    if (screenActive) screenActive.hidden = true;
    if (screenRender) screenRender.hidden = false;
    if (btnBack) btnBack.hidden = false;
    if (btnPrint) btnPrint.hidden = false;
    if (titleEl) titleEl.textContent = title || "Report";
  }

  function el(tag, text) {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    return n;
  }

  function renderTrainer() {
    // always derive right before read
    if (typeof window.CRT_deriveTrainer === "function") {
      try { window.CRT_deriveTrainer(); } catch {}
    }

    const rows = read("trainer_rows") || [];

    showRenderScreen("Trainer Report");

    if (!renderRoot) return;

    renderRoot.innerHTML = "";

    if (!rows.length) {
      renderRoot.appendChild(el("p", "No trainer data."));
      return;
    }

    let currentRing = "";
    let currentGroup = "";

    for (const r of rows) {
      const ring = r.ring_name || "Unassigned";
      const group = r.group_name || "Class Group";

      if (ring !== currentRing) {
        currentRing = ring;
        currentGroup = "";
        const h2 = el("h2", currentRing);
        h2.style.margin = "16px 0 8px";
        renderRoot.appendChild(h2);
      }

      if (group !== currentGroup) {
        currentGroup = group;
        const h3 = el("h3", currentGroup);
        h3.style.margin = "10px 0 6px";
        h3.style.opacity = "0.95";
        renderRoot.appendChild(h3);

        const headerRow = document.createElement("div");
        headerRow.style.display = "grid";
        headerRow.style.gridTemplateColumns = "90px 1fr 1fr";
        headerRow.style.gap = "10px";
        headerRow.style.fontSize = "12px";
        headerRow.style.opacity = "0.8";
        headerRow.style.padding = "6px 0";
        headerRow.style.borderBottom = "1px solid rgba(255,255,255,.12)";
        headerRow.appendChild(el("div", "Time"));
        headerRow.appendChild(el("div", "Horse"));
        headerRow.appendChild(el("div", "Class"));
        renderRoot.appendChild(headerRow);
      }

      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "90px 1fr 1fr";
      row.style.gap = "10px";
      row.style.padding = "6px 0";
      row.style.borderBottom = "1px solid rgba(255,255,255,.08)";
      row.style.fontSize = "13px";

      row.appendChild(el("div", r.time || ""));
      row.appendChild(el("div", r.horse || ""));
      row.appendChild(el("div", r.class_name || ""));

      renderRoot.appendChild(row);
    }
  }

  // Buttons
  if (btnTrainer) btnTrainer.addEventListener("click", renderTrainer);
  if (btnBack) btnBack.addEventListener("click", showActiveScreen);
  if (btnPrint) btnPrint.addEventListener("click", () => window.print());

  // If session is active on load, ensure UI is correct
  try {
    const meta = read("_crt_meta");
    if (meta && meta.active) showActiveScreen();
  } catch {}
})();
