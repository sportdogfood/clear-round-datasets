// trainer-render.js
// Reads sessionStorage.trainer_rows and renders into provided root.
// NO FETCH. NO EXPORTS.

(() => {
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

  function esc(s) {
    return String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.CRT_trainerRender = function CRT_trainerRender({ root }) {
    const rows = read("trainer_rows") || [];
    if (!root) return;

    root.innerHTML = "";

    if (!rows.length) {
      root.innerHTML = "<p style=\"opacity:.85;margin:0;padding:6px 0;\">No trainer data.</p>";
      return;
    }

    // Group by ring -> group_name
    const byRing = {};
    rows.forEach(r => {
      const ring = r.ring_name || "Unassigned";
      if (!byRing[ring]) byRing[ring] = [];
      byRing[ring].push(r);
    });

    const ringNames = Object.keys(byRing).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    ringNames.forEach(ringName => {
      const ringBlock = el("section", "ring-block");
      ringBlock.appendChild(el("h2", "ring-title", ringName));

      const items = byRing[ringName];

      // secondary group by group_name
      const byGroup = {};
      items.forEach(r => {
        const g = r.group_name || "Class Group";
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(r);
      });

      const groupNames = Object.keys(byGroup).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      groupNames.forEach(gname => {
        const groupBlock = el("div", "class-group");
        groupBlock.appendChild(el("h3", "group-title", gname));

        // Table
        const table = el("table", "trainer-table");
        const thead = document.createElement("thead");
        const trh = document.createElement("tr");

        ["Time", "Order", "Horse", "Class"].forEach(h => {
          const th = document.createElement("th");
          th.textContent = h;
          trh.appendChild(th);
        });

        thead.appendChild(trh);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        byGroup[gname].forEach(r => {
          const tr = document.createElement("tr");

          const time = esc(r.time || "");
          const order = esc(r.order || "");
          const horse = esc(r.horse_name ? `${r.horse_name} (${r.horse})` : (r.horse || ""));
          const cls = esc(r.class_name || "");

          tr.innerHTML = `
            <td class="t-time">${time}</td>
            <td class="t-order">${order}</td>
            <td class="t-horse">${horse}</td>
            <td class="t-class">${cls}</td>
          `;
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        groupBlock.appendChild(table);
        ringBlock.appendChild(groupBlock);
      });

      root.appendChild(ringBlock);
    });
  };
})();
