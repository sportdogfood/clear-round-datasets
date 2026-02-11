import { loadAll } from "./js/dataLoader.js";

/* Tap-Active BaseApp: placeholder script for future behavior. */
document.addEventListener("DOMContentLoaded", async () => {
  window.tapData = await loadAll();
  console.log("tapactive datasets loaded", Object.keys(window.tapData || {}));

  const routes = [
    "index.html",
    "pellettap/index.html",
    "tuneuptap/index.html",
    "lessonstap/index.html",
    "turnouttap/index.html",
    "taskstap/index.html",
    "tackuptap/index.html",
    "horsestap/index.html",
  ];

  const rows = document.querySelectorAll(".row--tap");
  rows.forEach((row, index) => {
    const route = routes[index];
    if (!route) return;

    row.addEventListener("click", () => {
      window.location.href = route;
    });
  });
});
