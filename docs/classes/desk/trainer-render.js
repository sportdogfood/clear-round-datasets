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

    let currentRing = null;

    rows.forEach(r => {
      if (r.ring_name !== currentRing) {
        currentRing = r.ring_name;
        const h = document.createElement("h3");
        h.textContent = currentRing;
        h.style.marginTop = "16px";
        screenRender.appendChild(h);
      }

      const div = document.createElement("div");
      div.style.padding = "6px 0";
      div.style.borderBottom = "1px solid rgba(255,255,255,.1)";
      div.innerHTML = `
        <strong>${r.class_group_name}</strong><br/>
        ${r.time} · ${r.status}
      `;
      screenRender.appendChild(div);
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
