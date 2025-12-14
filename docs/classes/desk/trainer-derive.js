(() => {
  const root = document.getElementById("render-root");
  if (!root) return;

  function read(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  const schedule = read("schedule") || [];
  const entries = read("entries") || [];
  const horses = read("horses") || [];
  const rings = read("rings") || [];

  const horseById = {};
  horses.forEach(h => {
    if (h.horse) horseById[h.horse] = h;
  });

  const ringById = {};
  rings.forEach(r => {
    ringById[r.ring_id] = r;
  });

  const entriesByClass = {};
  entries.forEach(e => {
    const cid = e.class_id;
    if (!cid) return;
    if (!entriesByClass[cid]) entriesByClass[cid] = [];
    entriesByClass[cid].push(e);
  });

  const groups = {};

  schedule.forEach(cls => {
    const ringId = cls.ring;
    const groupId = cls.class_group_id || cls.class_groupxclasses_id;
    if (!ringId || !groupId) return;

    if (!groups[ringId]) groups[ringId] = {};
    if (!groups[ringId][groupId]) {
      groups[ringId][groupId] = {
        group_name: cls.class_name || "Class Group",
        rows: []
      };
    }

    const classEntries = entriesByClass[cls.class_id] || [];

    classEntries.forEach(ent => {
      groups[ringId][groupId].rows.push({
        time:
          cls.estimated_start_time ||
          cls.start_time_default ||
          cls.estimated_go_time ||
          "",
        class_name: cls.class_name || "",
        horse: ent.horse || "",
        order: ent.order_of_go ?? ""
      });
    });
  });

  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  root.innerHTML = "";

  Object.keys(groups).forEach(ringId => {
    const ringBlock = el("section", "ring-block");
    const ringName =
      ringById[ringId]?.ring_name || `Ring ${ringId}`;
    ringBlock.appendChild(el("h2", "ring-title", ringName));

    const groupMap = groups[ringId];

    Object.keys(groupMap).forEach(gid => {
      const g = groupMap[gid];
      const groupBlock = el("div", "class-group");

      groupBlock.appendChild(
        el("h3", "group-title", g.group_name)
      );

      const table = el("table", "trainer-table");
      const thead = el("thead");
      const trh = el("tr");
      ["Time", "Horse", "Class"].forEach(h =>
        trh.appendChild(el("th", null, h))
      );
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = el("tbody");

      g.rows.forEach(r => {
        const tr = el("tr");
        tr.appendChild(el("td", "t-time", r.time));
        tr.appendChild(el("td", "t-horse", r.horse));
        tr.appendChild(el("td", "t-class", r.class_name));
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      groupBlock.appendChild(table);
      ringBlock.appendChild(groupBlock);
    });

    root.appendChild(ringBlock);
  });

  // Back + Print
  const backBtn = document.getElementById("btn-back");
  if (backBtn) backBtn.onclick = () => history.back();

  const printBtn = document.getElementById("btn-print");
  if (printBtn) printBtn.onclick = () => window.print();
})();
