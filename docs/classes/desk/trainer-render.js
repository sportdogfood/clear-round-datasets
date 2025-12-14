// trainer-render.js
// Defines: window.CRT_trainerRender(renderRootEl, trainerRows)
// - NO FETCH. NO SESSION. NO EXPORTS.

(() => {
  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function group(rows, key) {
    const m = {};
    rows.forEach(r => {
      const k = (r[key] || "").trim() || "Unassigned";
      if (!m[k]) m[k] = [];
      m[k].push(r);
    });
    return m;
  }

  window.CRT_trainerRender = function CRT_trainerRender(root, rows) {
    if (!root) return;
    root.innerHTML = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      root.appendChild(el("p", "muted", "No trainer data."));
      return;
    }

    const byRing = group(rows, "ring_name");

    Object.keys(byRing).forEach(ringName => {
      root.appendChild(el("div", "report-h2", ringName));

      // group inside ring
      const byGroup = {};
      byRing[ringName].forEach(r => {
        const g = (r.group_name || "").trim() || "Class";
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(r);
      });

      Object.keys(byGroup).forEach(gname => {
        root.appendChild(el("div", "report-h3", gname));

        const table = el("table", "report-table");
        const thead = el("thead");
        const trh = el("tr");
        ["Time", "Horse", "Class"].forEach(h => trh.appendChild(el("th", null, h)));
        thead.appendChild(trh);
        table.appendChild(thead);

        const tbody = el("tbody");
        byGroup[gname].forEach(r => {
          const tr = el("tr");
          tr.appendChild(el("td", null, r.time || ""));
          tr.appendChild(el("td", null, r.horse || ""));
          tr.appendChild(el("td", null, r.class_name || ""));
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        root.appendChild(table);
      });
    });
  };
})();
