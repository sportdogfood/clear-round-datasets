// trainer-render.js
// Renders trainer report from sessionStorage.trainer_rows
// NO FETCH. NO EXPORTS.

(() => {
  const screenActive =
    document.getElementById("screen-active") ||
    document.getElementById("screen-index") ||
    null;

  const screenRender =
    document.getElementById("screen-render") ||
    document.getElementById("render-root") ||
    null;

  const btnTrainer =
    document.getElementById("btn-trainer") || null;

  const btnBack =
    document.getElementById("btn-back") || null;

  const btnPrint =
    document.getElementById("btn-print") || null;

  const titleEl =
    document.getElementById("desk-title") || null;

  function read(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function el(tag, txt) {
    const n = document.createElement(tag);
    if (txt != null) n.textContent = txt;
    return n;
  }

  function showTrainer() {
    if (typeof window.CRT_trainerDerive === "function") {
      window.CRT_trainerDerive();
    }

    const rows = read("trainer_rows") || [];

    if (titleEl) titleEl.textContent = "Trainer Report";
    if (btnBack) btnBack.hidden = false;
    if (btnPrint) btnPrint.hidden = false;

    if (screenActive) screenActive.hidden = true;
    if (!screenRender) return;

    screenRender.hidden = false;
    screenRender.innerHTML = "";

    if (!rows.length) {
      screenRender.appendChild(el("p", "No trainer data."));
      return;
    }

    let curRing = "";
    let curGroup = "";
    let table = null;
    let tbody = null;

    for (const r of rows) {
      if ((r.ring_name || "") !== curRing) {
        curRing = r.ring_name || "Unassigned";
        curGroup = "";
        table = null;
        tbody = null;

        const h2 = el("h2", curRing);
        h2.style.margin = "16px 0 8px";
        screenRender.appendChild(h2);
      }

      if ((r.class_group_name || "") !== curGroup) {
        curGroup = r.class_group_name || "Class";

        const h3 = el("h3", curGroup);
        h3.style.margin = "10px 0 6px";
        screenRender.appendChild(h3);

        table = document.createElement("table");
        table.className = "trainer-table";
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";

        const thead = document.createElement("thead");
        const trh = document.createElement("tr");

        ["Time", "Horse", "Class"].forEach((t) => {
          const th = el("th", t);
          th.style.textAlign = "left";
          th.style.padding = "6px 4px";
          th.style.borderBottom = "1px solid rgba(255,255,255,.15)";
          trh.appendChild(th);
        });

        thead.appendChild(trh);
        table.appendChild(thead);

        tbody = document.createElement("tbody");
        table.appendChild(tbody);

        screenRender.appendChild(table);
      }

      if (!tbody) continue;

      const tr = document.createElement("tr");

      const tdTime = el("td", r.time || "");
      const tdHorse = el("td", r.horse_label || "");
      const tdClass = el("td", r.class_name || "");

      [tdTime, tdHorse, tdClass].forEach((td) => {
        td.style.padding = "6px 4px";
        td.style.borderBottom = "1px solid rgba(255,255,255,.08)";
      });

      tr.appendChild(tdTime);
      tr.appendChild(tdHorse);
      tr.appendChild(tdClass);

      tbody.appendChild(tr);
    }
  }

  function goBack() {
    if (screenRender) {
      screenRender.hidden = true;
      screenRender.innerHTML = "";
    }
    if (screenActive) screenActive.hidden = false;

    if (btnBack) btnBack.hidden = true;
    if (btnPrint) btnPrint.hidden = true;
    if (titleEl) titleEl.textContent = "Class Desk";
  }

  if (btnTrainer) btnTrainer.addEventListener("click", showTrainer);
  if (btnBack) btnBack.addEventListener("click", goBack);
  if (btnPrint) btnPrint.addEventListener("click", () => window.print());
})();
