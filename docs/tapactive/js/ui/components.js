function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function HeaderBar({ title, subtitle }) {
  return `
    <header class="app-header HeaderBar" id="appHeader">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle || "")}</p>
    </header>
  `;
}

export function BottomNav({ items, active }) {
  return `
    <nav class="bottom-nav BottomNav" aria-label="Bottom nav">
      ${items
        .map(
          (item) =>
            `<button type="button" class="row--tap bottom-nav__item BottomNav__item ${
              active === item.key ? "row--active bottom-nav__item--active BottomNav__item--active" : ""
            }" data-nav="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`
        )
        .join("")}
    </nav>
  `;
}

export function RowTap({ title, meta = "", right = "", active = false, attrs = "" }) {
  return `
    <button type="button" class="row row--tap RowTap ${active ? "row--active" : ""}" ${attrs}>
      <span class="row__left">${escapeHtml(title)}</span>
      ${meta ? `<span class="row__mid">${escapeHtml(meta)}</span>` : ""}
      ${right ? `<span class="row__right">${escapeHtml(right)}</span>` : ""}
    </button>
  `;
}

export function Card({ title = "", meta = "", dense = false, body = "", extraClass = "" }) {
  return `
    <article class="card Card ${dense ? "card--dense" : ""} ${extraClass}">
      ${title ? `<h2 class="card__title">${escapeHtml(title)}</h2>` : ""}
      ${meta ? `<div class="card__meta">${escapeHtml(meta)}</div>` : ""}
      ${body}
    </article>
  `;
}

export function HorseCard({ title, meta, body, attrs = "", active = false }) {
  return `
    <article class="card HorseCard ${active ? "row--active" : ""}" ${attrs}>
      <h3 class="card__title">${escapeHtml(title)}</h3>
      <div class="card__meta">${escapeHtml(meta || "")}</div>
      ${body || ""}
    </article>
  `;
}

export function PeakStrip({ items }) {
  return `
    <div class="peak-strip PeakStrip">
      ${items
        .map(
          (item) =>
            `<button type="button" class="row--tap" data-action="peak-jump" data-horse-id="${escapeHtml(item.id)}">${escapeHtml(
              item.label
            )}</button>`
        )
        .join("")}
    </div>
  `;
}

export function Tabs({ items, active }) {
  return `
    <div class="tabs Tabs">
      ${items
        .map(
          (item) =>
            `<button type="button" class="row--tap tab Tabs__tab ${
              active === item.key ? "row--active tab--active" : ""
            }" data-tab="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`
        )
        .join("")}
    </div>
  `;
}

export function Pills({ items, activeValue, action, attrs = "" }) {
  return `
    <div class="pills Pills">
      ${items
        .map((item) => {
          const value = String(item.value);
          const active = String(activeValue) === value;
          return `<button type="button" class="row--tap pill ${active ? "row--active pill--active" : ""}" data-action="${escapeHtml(
            action
          )}" data-value="${escapeHtml(value)}" ${attrs}>${escapeHtml(item.label)}</button>`;
        })
        .join("")}
    </div>
  `;
}

export function TimespanColumn({ blocks }) {
  return `
    <div class="time-grid TimespanColumn">
      ${blocks
        .map(
          (block) => `
        <section class="time-block TimespanColumn__block">
          <div class="time-block__label TimespanColumn__label">${escapeHtml(block.label)}</div>
          <div class="time-block__body TimespanColumn__body">${block.body || ""}</div>
        </section>
      `
        )
        .join("")}
    </div>
  `;
}

export { escapeHtml };
