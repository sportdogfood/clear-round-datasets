// File: trainer-render.js
// Purpose: Render Trainer Report HTML (paint-only)
// Scope: Desktop / Print
// Version: v2025-12-14-01
// Input: trainer-data-shape JSON from trainer-derive.js
// Output: Static HTML injected into render container

/* =========================
   RENDER TARGET
========================= */

const RENDER_ROOT_ID = "trainer-render-root";

function getRoot() {
  const el = document.getElementById(RENDER_ROOT_ID);
  if (!el) throw new Error("Trainer render root not found");
  return el;
}

/* =========================
   UTILITIES
========================= */

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || "Unknown";
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {});
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* =========================
   CORE RENDER
========================= */

export function renderTrainerReport(data) {
  const root = getRoot();
  root.innerHTML = "";

  const header = document.createElement("div");
  header.className = "report-header";
  header.innerHTML = `
    <div class="report-title">Trainer Schedule</div>
    <div class="report-meta">Generated: ${escapeHtml(data.generated_at)}</div>
    <div class="report-actions">
      <button onclick="window.history.back()">← Back</button>
      <button onclick="window.print()">Print</button>
    </div>
  `;
  root.appendChild(header);

  const ringGroups = groupBy(data.rings, "ring");

  const columns = document.createElement("div");
  columns.className = "report-columns";

  Object.keys(ringGroups).sort().forEach((ring) => {
    const ringBlock = document.createElement("div");
    ringBlock.className = "ring-block";

    ringBlock.innerHTML += `<h2 class="ring-title">Ring ${escapeHtml(ring)}</h2>`;

    const classGroups = groupBy(ringGroups[ring], "class_group");

    Object.keys(classGroups).forEach((group) => {
      const groupBlock = document.createElement("div");
      groupBlock.className = "class-group";

      groupBlock.innerHTML += `<h3 class="class-group-title">${escapeHtml(group)}</h3>`;

      classGroups[group]
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
        .forEach((row) => {
          const line = document.createElement("div");
          line.className = `class-line status-${row.status}`;

          line.innerHTML = `
            <span class="time">${escapeHtml(row.time)}</span>
            <span class="class">${escapeHtml(row.class_name)}</span>
            <span class="horse">${escapeHtml(row.horse)}</span>
            <span class="count">(${row.class_count})</span>
          `;

          groupBlock.appendChild(line);
        });

      ringBlock.appendChild(groupBlock);
    });

    columns.appendChild(ringBlock);
  });

  root.appendChild(columns);
}

/* =========================
   END FILE
========================= */
