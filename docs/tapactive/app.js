/* Tap-Active BaseApp: placeholder script for future behavior. */
document.addEventListener("DOMContentLoaded", () => {
  const routes = [
    "tacklists/index.html",
    "pellettap/index.html",
    "tackuptap/index.html",
    "taskstap/index.html",
    "turnouttap/index.html",
    "tuneuptap/index.html",
    "lessonstap/index.html",
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
