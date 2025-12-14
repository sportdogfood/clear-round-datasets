// trainer-render.js
// Renders trainer report from sessionStorage.trainer_rows
// Calls derive on-demand so session-start can hydrate first.

(() => {
  const screenIndex = document.getElementById("screen-index");
  const screenRender = document.getElementById("screen-render");
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

  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function showTrainer() {
    // IMPORTANT: derive AFTER session-start hydrated storage
    if (typeof window.CRT_trainerDerive === "function") {
      window.CRT_trainerDerive();
    }

    const rows = read("trainer_rows") || [];

    titleEl.textContent = "Trainer Report";
    btnBack.hidden = false;
    btnPrint.hidden = false;

    screenIndex.hidden = true;
    screenRender.hidden = false;
    screenRender.innerHTML = "";

    if (!rows.length) {
      screenRender.innerHTML = "<p>No trainer data.</p>";
      return;
    }

    // group: ring -> class_group
    let curRing = null;
    let curGroup = null;

    for (const r of rows) {
      if (r.ring_name !== curRing) {
        curRing = r.ring_name;
        curGroup = null;

        const ringH = el("h2", "ring-title", curRing);
        ringH.style.margin = "16px 0 8px";
        screenRender.appendChild(ringH);
      }

      if (r.class_group_name !== curGroup) {
        curGroup = r.class_group_name;

        const groupH = el("h3", "group-title", curGroup);
        groupH.style.margin = "10px 0 6px";
        screenRender.appendChild(groupH);

        const table = el("table", "trainer-table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";

        const thead = document.createElement("thead");
        const trh = document.createElement("tr");
        ["Time", "Horse", "Class"].forEach((h) => {
          const th = document.createElement("th");
          th.textContent = h;
          th.style.textAlign = "left";
          th.style.padding = "6px 4px";
          th.style.borderBottom = "1px solid rgba(255,255,255,.15)";
          trh.appendChild(th);
        });
        thead.appendChild(trh);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        table.appendChild(tbody);

        // attach tbody to group for subsequent rows
        table.dataset.crtGroupKey = curGroup;
        screenRender.appendChild(table);
      }

      // append to last table
      const tables = screenRender.querySelectorAll("table.trainer-table");
      const table = tables[tables.length - 1];
      const tbody = table ? table.querySelector("tbody") : null;
      if (!tbody) continue;

      const tr = document.createElement("tr");

      const tdTime = el("td", "t-time", r.time || "");
      const tdHorse = el("td", "t-horse", r.horse_label || "");
      const tdClass = el("td", "t-class", r.class_name || "");

      [tdTime, tdHorse, tdClass].forEach((td) => {
        td.style.padding = "6px 4px";
        td.style.borderBottom = "1px solid rgba(255,255,255,.08)";
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }
  }

  function goBack() {
    screenRender.hidden = true;
    screenIndex.hidden = false;
    btnBack.hidden = true;
    btnPrint.hidden = true;
    titleEl.textContent = "Class Desk";
  }

  if (btnTrainer) btnTrainer.addEventListener("click", showTrainer);
  if (btnBack) btnBack.addEventListener("click", goBack);
  if (btnPrint) btnPrint.addEventListener("click", () => window.print());
})();

