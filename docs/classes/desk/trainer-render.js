// docs/classes/desk/trainer-render.js
// NO EXPORTS — renders simple HTML

(function () {
  function renderTrainer(rows, el) {
    if (!el) return;
    el.innerHTML = "";

    rows.forEach(r => {
      const div = document.createElement("div");
      div.className = "trainer-row";
      div.textContent =
        `${r.time || "--"} | ${r.horse} | Ring ${r.ring} | ${r.class_name}`;
      el.appendChild(div);
    });
  }

  window.trainerRender = renderTrainer;
})();
