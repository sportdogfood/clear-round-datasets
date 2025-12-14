// trainer.js
// Desktop Trainer workflow (NO Rows logic yet)
// Responsible only for rendering Trainer screens into #render-root

(function () {
  'use strict';

  const root = document.getElementById('render-root');
  const titleEl = document.getElementById('header-title');

  if (!root || !titleEl) {
    console.error('[trainer.js] Required DOM elements not found');
    return;
  }

  // ---------------------------------------------------------------------------
  // Public API (used by app.js)
  // ---------------------------------------------------------------------------

  window.Trainer = {
    showIndex,
    showReportDefault,
    showReportAlt
  };

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  function showIndex() {
    titleEl.textContent = 'Trainer';
    root.innerHTML = '';

    createRow('Trainer Report – Default', () => {
      showReportDefault();
    });

    createRow('Trainer Report – Alternate View', () => {
      showReportAlt();
    });
  }

  function showReportDefault() {
    titleEl.textContent = 'Trainer Report';
    root.innerHTML = '';

    createNotice('Default trainer report (stub)');
    createDivider();

    // Stub rows – real data comes later
    createRow('Ring 3 · Children’s Hunter', null, '3 classes');
    createRow('Ring 3 · Adult Amateur Hunter', null, '2 classes');
    createRow('Ring 4 · Medal Classes', null, '5 classes');
  }

  function showReportAlt() {
    titleEl.textContent = 'Trainer Report (Alt)';
    root.innerHTML = '';

    createNotice('Alternate trainer report layout (stub)');
    createDivider();

    createRow('FORT KNOX', null, 'Ring 3');
    createRow('HALO', null, 'Ring 3');
    createRow('ZEN', null, 'Ring 4');
  }

  // ---------------------------------------------------------------------------
  // UI helpers (same visual language as mobile)
  // ---------------------------------------------------------------------------

  function createRow(label, onClick, tagText) {
    const row = document.createElement('div');
    row.className = 'row';

    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = label;

    row.appendChild(title);

    if (tagText) {
      const tag = document.createElement('div');
      tag.className = 'row-tag';
      tag.textContent = tagText;
      row.appendChild(tag);
    }

    if (typeof onClick === 'function') {
      row.addEventListener('click', onClick);
    }

    root.appendChild(row);
  }

  function createNotice(text) {
    const notice = document.createElement('div');
    notice.style.opacity = '0.85';
    notice.style.fontSize = '13px';
    notice.style.margin = '8px 4px 12px';
    notice.textContent = text;
    root.appendChild(notice);
  }

  function createDivider() {
    const div = document.createElement('div');
    div.style.height = '1px';
    div.style.background = 'rgba(75,85,99,0.8)';
    div.style.margin = '10px 4px';
    root.appendChild(div);
  }
})();
