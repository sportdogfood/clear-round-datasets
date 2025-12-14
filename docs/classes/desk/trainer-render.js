// trainer-render.js
// Renders trainer report from sessionStorage.trainer_rows
// NO EXPORTS. Safe across differing HTML IDs.

(() => {
  const pick = (...ids) =>
    ids.map((id) => document.getElementById(id)).find(Boolean) || null;

  const screenIndex = pick("screen-index", "screen-active");
  const screenRender = pick("screen-render", "render-root", "render-container");
  const btnTrainer = pick("btn-trainer", "trainer-btn");
  const btnBack = pick("btn-back", "btn-back-render");
  const btnPrint = pick("btn-print", "btn-print-render");
  const titleEl = pick("desk-title", "header-title", "title");

  function readJson(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function setHidden(el, hidden) {
    if (el) el.hidden = !!hidden;
  }

  function setTitle(t) {
    if (titleEl) titleEl.textContent = t;
    if (!titleEl) document.title = t;
  }

  function clearRender() {
    if (!screenRender) return;
    screenRender.innerHTML = "";
  }

  function ensureRenderHost() {
    if (!screenRender) return null;

    // If screenRender *is* the root container (e.g., render-root), use it.
    // Otherwise create a dedicated root for consistent injection.
    let host = screenRender.querySelector("#render-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "render-root";
      screenRender.appendChild(host);
    }
    return host;
  }

  function renderEmpty(msg) {
    const host = ensureRenderHost();
    if (!host) return;
    host.innerHTML = `<p style="margin:12px 0;opacity:.9;">${msg}</p>`;
  }

  function showTrainer() {
    // Toggle chrome safely
    setTitle("Trainer Report");
    setHidden(btnBack, false);
    setHidden(btnPrint, false);

    setHidden(screenIndex, true);
    setHidden(screenRender, false);
    clearRender();

    const rows =
      readJson("trainer_rows") ||
      readJson("schedule_derived") ||
      readJson("trainerRows") ||
      [];

    if (!Array.isArray(rows) || rows.length === 0) {
      renderEmpty("No trainer data.");
      return;
    }

    // Normalize + sort for stable output
    const norm = rows
      .map((r) => ({
        ring_name: r.ring_name || r.ring || "Unassigned",
        class_group_name: r.class_group_name || r.class_name || "Class",
        time: r.time || r.start_time_default || r.estimated_start_time || "",
        status: r.status || ""
      }))
      .sort((a, b) => {
        const ar = String(a.ring_name).localeCompare(String(b.ring_name));
        if (ar !== 0) return ar;
        return String(a.time).localeCompare(String(b.time));
      });

    const byRing = {};
    for (const r of norm) {
      (byRing[r.ring_name] = byRing[r.ring_name] || []).push(r);
    }

    const host = ensureRenderHost();
    if (!host) return;

    Object.keys(byRing).forEach((ringName) => {
      const h = document.createElement("h3");
      h.textContent = ringName;
      h.style.margin = "16px 0 8px";
      host.appendChild(h);

      byRing[ringName].forEach((r) => {
        const div = document.createElement("div");
        div.style.padding = "6px 0";
        div.style.borderBottom = "1px solid rgba(255,255,255,.10)";
        div.innerHTML = `
          <strong>${r.class_group_name}</strong><br/>
          ${r.time}${r.status ? ` · ${r.status}` : ""}
        `;
        host.appendChild(div);
      });
    });
  }

  function goBack() {
    setHidden(screenRender, true);
    setHidden(screenIndex, false);
    setHidden(btnBack, true);
    setHidden(btnPrint, true);
    setTitle("Class Desk");
    clearRender();
  }

  // Wire events (safe)
  if (btnTrainer) btnTrainer.addEventListener("click", showTrainer);
  if (btnBack) btnBack.addEventListener("click", goBack);
  if (btnPrint) btnPrint.addEventListener("click", () => window.print());
})();
