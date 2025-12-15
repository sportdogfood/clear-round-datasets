/* trainer_render.js
 * Exposes: window.CRT_trainerRender(rootEl, trainerRows)
 * Default view: Ring → Group (horses combined) → Class lines
 * Detail view: Ring → Group → Horse sections (if >1 horse) → Class lines
 */
(() => {
  "use strict";

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function uniq(arr) {
    const s = new Set();
    const out = [];
    for (const x of arr || []) {
      const v = String(x || "").trim();
      if (!v) continue;
      if (!s.has(v)) {
        s.add(v);
        out.push(v);
      }
    }
    return out;
  }

  function fmtClassLine(c) {
    const t = c.time ? `${c.time} · ` : "";
    const num = c.class_number != null ? `${c.class_number} · ` : "";
    return `${t}${num}${c.class_name || "—"}`;
  }

  function groupByRing(rows) {
    const map = new Map();
    for (const r of rows || []) {
      const ring = r.ring != null ? r.ring : "—";
      if (!map.has(ring)) map.set(ring, []);
      map.get(ring).push(r);
    }
    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }

  function renderToolbar(root, mode, onMode) {
    const bar = el("div", "report-toolbar");
    const left = el("div", "report-toolbar-left", "View:");
    const btnA = el("button", "report-btn", "Default");
    const btnB = el("button", "report-btn", "Detail");

    btnA.type = "button";
    btnB.type = "button";

    if (mode === "default") btnA.classList.add("report-btn--active");
    if (mode === "detail") btnB.classList.add("report-btn--active");

    btnA.addEventListener("click", () => onMode("default"));
    btnB.addEventListener("click", () => onMode("detail"));

    bar.appendChild(left);
    bar.appendChild(btnA);
    bar.appendChild(btnB);
    root.appendChild(bar);
  }

  function renderDefaultRing(root, ring, groups) {
    const h = el("div", "ring-header", `Ring ${ring}`);
    root.appendChild(h);

    for (const g of groups) {
      const horses = uniq(g.horses);
      const head = el(
        "div",
        "group-header",
        horses.length ? `Group · ${horses.join(", ")}` : `Group`
      );
      root.appendChild(head);

      const list = el("div", "class-list");
      for (const c of g.classes || []) {
        list.appendChild(el("div", "class-line", fmtClassLine(c)));
      }
      root.appendChild(list);
    }
  }

  function buildHorseIndex(group) {
    const ix = new Map(); // horse -> class lines
    for (const c of group.classes || []) {
      const horses = uniq((c.entries || []).map(e => e.horse));
      if (horses.length === 0) {
        // still show in detail under a catchall if no barn entry for that class
        const k = "__all__";
        if (!ix.has(k)) ix.set(k, []);
        ix.get(k).push(c);
        continue;
      }
      for (const h of horses) {
        if (!ix.has(h)) ix.set(h, []);
        ix.get(h).push(c);
      }
    }
    return ix;
  }

  function renderDetailRing(root, ring, groups) {
    const h = el("div", "ring-header", `Ring ${ring}`);
    root.appendChild(h);

    for (const g of groups) {
      const horses = uniq(g.horses);
      const multi = horses.length > 1;

      const groupWrap = el("div", "group-wrap");
      const groupHead = el("div", "group-header", `Group`);
      groupWrap.appendChild(groupHead);

      if (!multi) {
        // behave like default when only one horse
        const list = el("div", "class-list");
        for (const c of g.classes || []) list.appendChild(el("div", "class-line", fmtClassLine(c)));
        groupWrap.appendChild(list);
        root.appendChild(groupWrap);
        continue;
      }

      // split by horse
      const ix = buildHorseIndex(g);

      for (const horse of horses) {
        const sub = el("div", "horse-block");
        sub.appendChild(el("div", "horse-header", horse));

        const list = el("div", "class-list");
        const cls = ix.get(horse) || [];
        for (const c of cls) list.appendChild(el("div", "class-line", fmtClassLine(c)));
        sub.appendChild(list);

        groupWrap.appendChild(sub);
      }

      root.appendChild(groupWrap);
    }
  }

  function renderInto(rootEl, rows, mode) {
    rootEl.innerHTML = "";

    renderToolbar(rootEl, mode, nextMode => {
      renderInto(rootEl, rows, nextMode);
    });

    const byRing = groupByRing(rows);
    for (const [ring, groups] of byRing) {
      if (mode === "detail") renderDetailRing(rootEl, ring, groups);
      else renderDefaultRing(rootEl, ring, groups);
    }
  }

  window.CRT_trainerRender = function (rootEl, trainerRows) {
    const rows = Array.isArray(trainerRows) ? trainerRows : [];
    const mode = "default";
    renderInto(rootEl, rows, mode);
  };
})();
