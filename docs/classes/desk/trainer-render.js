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

  function showTrainer() {
    const rows = read("schedule_derived") || [];

    titleEl.textContent = "Trainer Report";
    btnBack.hidden = false;
    btnPrint.hidden = false;

    screenIndex.hidden = true;
    screenRender.hidden = false;
    screenRender.innerHTML = "";

    if (!rows.length) {
      screenRender.innerHTML = "<p>No schedule data.</p>";
      return;
    }

    const byRing = {};

    rows.forEach(r => {
      const ring = r.ring || "Unassigned";
      byRing[ring] = byRing[ring] || [];
      byRing[ring].push(r);
    });

    Object.keys(byRing).forEach(ring => {
      const h = document.createElement("h3");
      h.textContent = ring;
      screenRender.appendChild(h);

      byRing[ring].forEach(cls => {
        const div = document.createElement("div");
        div.style.padding = "6px 0";
        div.style.borderBottom = "1px solid rgba(255,255,255,.1)";
        div.innerHTML = `
          <strong>${cls.class_group_name || cls.class_name || "Class"}</strong><br/>
          ${cls.start_time_default || ""} · ${cls.status}
        `;
        screenRender.appendChild(div);
      });
    });
  }

  function goBack() {
    screenRender.hidden = true;
    screenIndex.hidden = false;
    btnBack.hidden = true;
    btnPrint.hidden = true;
    titleEl.textContent = "Class Desk";
  }

  btnTrainer.addEventListener("click", showTrainer);
  btnBack.addEventListener("click", goBack);
  btnPrint.addEventListener("click", () => window.print());
})();
