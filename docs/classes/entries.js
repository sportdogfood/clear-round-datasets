// entries.js
// Desktop Entries workflow (NO Rows logic yet)
// Responsible only for rendering Entries screens into #render-root

(function () {
  'use strict';

  const root = document.getElementById('render-root');
  const titleEl = document.getElementById('header-title');

  if (!root || !titleEl) {
    console.error('[entries.js] Required DOM elements not found');
    return;
  }

  // ---------------------------------------------------------------------------
  // Public API (used by app.js)
  // ---------------------------------------------------------------------------

  window.Entries = {
    showIndex,
    showReportDefault,
    showReportDetail
  };

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  function showIndex() {
    titleEl.textContent = 'Entries';
    root.innerHTML = '';

    createRow('Entries Report – Default', () => {
      showReportDefault();
    });

    createRow('Entries Report – Detail', () => {
      showReportDetail();
    });
  }

  function showReportDefault() {
    titleEl.textContent = 'Entries Report';
    root.innerHTML = '';

    createNotice('Default entries report (stub – print friendly, full width)');
    createDivider();

    // Stub rows – one row per horse/class grouping
    createRow('08:00 · KNOX · Children’s Hunter · Ring 3', null, '3 classes');
    createRow('09:45 · HALO · Adult Amateur Hunter · Ring 3', null, '2 classes');
    createRow('11:10 · ZEN · Medal · Ring 4', null, '1 class');
  }

  function showReportDetail() {
    titleEl.textContent = 'Entries Report (Detail)';
    root.innerHTML = '';

    createNotice('Detail view (internal use – notification flags only)');
    createDivider();

    // Stub detail rows – booleans only, no logic yet
    createDetailRow({
      time: '08:00',
      horse: 'KNOX',
      ring: '3',
      classGroup: 'Children’s Hunter',
      status: 'upcoming',
      class_notif30: true,
      class_notif60: false,
      go_notif30: false,
      go_notif60: false,
      live_now: false,
      completed_done: false
    });

    createDetailRow({
      time: '11:10',
      horse: 'ZEN',
      ring: '4',
      classGroup: 'Medal',
      status: 'completed',
      class_notif30: false,
      class_notif60: false,
      go_notif30: false,
      go_notif60: false,
      live_now: false,
      completed_done: true
    });
  }

  // ---------------------------------------------------------------------------
  // UI helpers
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

  function createDetailRow(obj) {
    const row = document.createElement('div');
    row.className = 'row';

    const left = document.createElement('div');
    left.className = 'row-title';
    left.textContent = `${obj.time} · ${obj.horse} · ${obj.classGroup} · Ring ${obj.ring}`;

    const right = document.createElement('div');
    right.className = 'row-tag';
    right.textContent = obj.status;

    row.appendChild(left);
    row.appendChild(right);

    root.appendChild(row);

    // flags row
    const flags = document.createElement('div');
    flags.style.fontSize = '11px';
    flags.style.opacity = '0.85';
    flags.style.margin = '4px 12px 10px';

    flags.textContent = [
      `class_notif30=${obj.class_notif30}`,
      `class_notif60=${obj.class_notif60}`,
      `go_notif30=${obj.go_notif30}`,
      `go_notif60=${obj.go_notif60}`,
      `live_now=${obj.live_now}`,
      `completed_done=${obj.completed_done}`
    ].join(' · ');

    root.appendChild(flags);
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
