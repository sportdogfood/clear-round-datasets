// app.js — CRT Feed (board table -> grouped list)
// Data: ./data/latest/{board}.json (default board: feed_board)

(function () {
  'use strict';

  // ----------------------------
  // DOM
  // ----------------------------
  const elHeaderTitle = document.getElementById('header-title');
  const elHeaderBack  = document.getElementById('header-back');
  const elHeaderAction= document.getElementById('header-action');
  const elRoot        = document.getElementById('screen-root');

  const elAggHorses = document.getElementById('aggHorses');
  const elAggRiders = document.getElementById('aggRiders');
  const elAggRings  = document.getElementById('aggRings');
  const elAggRows   = document.getElementById('aggRows');

  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    screen: 'horses',
    board: null,
    url: null,
    meta: null,
    rows: [],
    counts: { horses: 0, riders: 0, rings: 0, rows: 0 },
  };

  // ----------------------------
  // HELPERS
  // ----------------------------
  function qs(name) {
    try { return new URLSearchParams(window.location.search).get(name); }
    catch (_) { return null; }
  }

  function cleanBoardId(raw) {
    if (!raw) return '';
    let v = String(raw).trim();
    v = v.replace(/\.json$/i, '');
    v = v.replace(/[^a-zA-Z0-9_-]/g, '');
    return v;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uniqCount(rows, key) {
    const set = new Set();
    rows.forEach(r => {
      const v = (r && r[key]) ? String(r[key]).trim() : '';
      if (v) set.add(v);
    });
    return set.size;
  }

  function getAny(row, keys) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (row && row[k] != null && String(row[k]).trim() !== '') return row[k];
    }
    return null;
  }

  function parseTimeMaybe(v) {
    if (!v) return NaN;
    const t = Date.parse(v);
    if (!isNaN(t)) return t;
    const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?/);
    if (m) return Date.parse(m[1] + 'T' + m[2] + ':00');
    return NaN;
  }

  function sortByLatest(rows) {
    return rows.slice().sort((a, b) => {
      const aT = parseTimeMaybe(getAny(a, ['latestStart', 'lastestStart', 'latestGO', 'lastOOG']));
      const bT = parseTimeMaybe(getAny(b, ['latestStart', 'lastestStart', 'latestGO', 'lastOOG']));
      if (!isNaN(aT) && !isNaN(bT)) return aT - bT;
      return 0;
    });
  }

  function setHeader(main, sub) {
    const mainEl = elHeaderTitle ? elHeaderTitle.querySelector('.header-title-main') : null;
    const subEl  = elHeaderTitle ? elHeaderTitle.querySelector('.header-subtitle') : null;
    if (mainEl) mainEl.textContent = main || 'Feed';
    if (subEl)  subEl.textContent  = sub  || '';
  }

  function clearRoot() {
    while (elRoot && elRoot.firstChild) elRoot.removeChild(elRoot.firstChild);
  }

  function mk(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function renderEmpty(msg) {
    clearRoot();
    const col = mk('div', 'list-column');
    const row = mk('div', 'row', `<div><div class="row-title">${escapeHtml(msg)}</div></div>`);
    col.appendChild(row);
    elRoot.appendChild(col);
  }

  // ----------------------------
  // DATA LOAD
  // ----------------------------
  async function loadBoard() {
    const boardRaw = qs('board') || qs('board_id') || qs('id') || 'feed_board';
    const board = cleanBoardId(boardRaw) || 'feed_board';
    const url = `./data/latest/${board}.json`;

    state.board = board;
    state.url = url;

    setHeader('Feed', `board: ${board}`);

    const bust = Date.now();
    const fetchUrl = `${url}?t=${bust}`;

    const resp = await fetch(fetchUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Fetch failed (${resp.status}) for ${url}`);

    const json = await resp.json();

    state.meta = (json && json.meta) ? json.meta : null;
    const rows = Array.isArray(json) ? json : (json && Array.isArray(json.rows) ? json.rows : []);
    state.rows = rows;

    state.counts = {
      horses: uniqCount(rows, 'horseName'),
      riders: uniqCount(rows, 'riderName'),
      rings:  uniqCount(rows, 'ringName'),
      rows:   rows.length
    };

    if (elAggHorses) elAggHorses.textContent = String(state.counts.horses);
    if (elAggRiders) elAggRiders.textContent = String(state.counts.riders);
    if (elAggRings)  elAggRings.textContent  = String(state.counts.rings);
    if (elAggRows)   elAggRows.textContent   = String(state.counts.rows);

    const generatedAt = state.meta && state.meta.generated_at ? state.meta.generated_at : null;
    if (generatedAt) setHeader('Feed', `board: ${board} • ${generatedAt}`);
  }

  // ----------------------------
  // RENDERERS
  // ----------------------------
  function rowTagsHtml(tags) {
    const clean = tags.filter(Boolean).map(t => `<span class="row-tag">${escapeHtml(t)}</span>`);
    if (!clean.length) return '';
    return `<div>${clean.join('')}</div>`;
  }

  function buildSummaryTags(r) {
    const rider = getAny(r, ['riderName', 'rider_name']);
    const ring  = getAny(r, ['ringName', 'ring_name', 'ring_number']);
    const clsNo = getAny(r, ['class_number', 'classNumber']);
    const status= getAny(r, ['latestStatus', 'status', 'latest_status']);
    const time  = getAny(r, ['latestStart', 'lastestStart', 'estimated_start_time', 'latestGO']);

    const tags = [];
    if (rider) tags.push(String(rider));
    if (ring)  tags.push(String(ring));
    if (clsNo) tags.push(`Class ${clsNo}`);
    if (status)tags.push(String(status));
    if (time)  tags.push(String(time));
    return tags;
  }

  function renderGrouped(groupField, titleMain, emptyMsg) {
    const rows = state.rows || [];
    if (!rows.length) return renderEmpty(emptyMsg);

    const map = new Map();
    rows.forEach(r => {
      const k = (r && r[groupField]) ? String(r[groupField]).trim() : '';
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });

    const groups = Array.from(map.entries()).map(([k, rs]) => ({ k, rs: sortByLatest(rs) }));
    groups.sort((a, b) => {
      const aT = parseTimeMaybe(getAny(a.rs[0], ['latestStart','lastestStart','latestGO','lastOOG']));
      const bT = parseTimeMaybe(getAny(b.rs[0], ['latestStart','lastestStart','latestGO','lastOOG']));
      if (!isNaN(aT) && !isNaN(bT)) return aT - bT;
      return a.k.localeCompare(b.k);
    });

    clearRoot();
    const col = mk('div', 'list-column');
    col.appendChild(mk('div', 'list-group-label', escapeHtml(titleMain)));

    groups.forEach(g => {
      const first = g.rs[0] || {};
      const tags = buildSummaryTags(first);
      const agg = g.rs.length;

      const left = `<div>
        <div class="row-title">${escapeHtml(g.k)}</div>
        ${rowTagsHtml(tags)}
      </div>`;
      const right = `<div class="row-tag row-tag--count">${escapeHtml(String(agg))}</div>`;
      col.appendChild(mk('div', 'row', left + right));
    });

    elRoot.appendChild(col);
  }

  function renderAll() {
    const rows = state.rows || [];
    if (!rows.length) return renderEmpty('No rows in board.');

    const sorted = sortByLatest(rows);

    clearRoot();
    const col = mk('div', 'list-column');
    col.appendChild(mk('div', 'list-group-label', 'All rows'));

    sorted.forEach(r => {
      const horse = getAny(r, ['horseName', 'horse_name']) || '(no horse)';
      const tags  = buildSummaryTags(r);

      const left = `<div>
        <div class="row-title">${escapeHtml(String(horse))}</div>
        ${rowTagsHtml(tags)}
      </div>`;

      const tripCount = getAny(r, ['total_trips', 'trips', 'count']);
      const right = tripCount != null ? `<div class="row-tag row-tag--count">${escapeHtml(String(tripCount))}</div>` : '';
      col.appendChild(mk('div', 'row', left + right));
    });

    elRoot.appendChild(col);
  }

  function render() {
    // active = nav-btn--primary
    const buttons = document.querySelectorAll('.nav-btn[data-screen]');
    buttons.forEach(btn => {
      const isActive = btn.getAttribute('data-screen') === state.screen;
      if (isActive) btn.classList.add('nav-btn--primary');
      else btn.classList.remove('nav-btn--primary');
    });

    if (state.screen === 'horses') return renderGrouped('horseName', 'Horses', 'No horses in board.');
    if (state.screen === 'riders') return renderGrouped('riderName', 'Riders', 'No riders in board.');
    if (state.screen === 'rings')  return renderGrouped('ringName',  'Rings',  'No rings in board.');
    return renderAll();
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  function bindNav() {
    const nav = document.getElementById('nav-row') || document;
    nav.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.nav-btn[data-screen]') : null;
      if (!btn) return;
      state.screen = btn.getAttribute('data-screen') || 'horses';
      render();
    });
  }

  function bindHeader() {
    if (elHeaderAction) {
      elHeaderAction.addEventListener('click', async () => {
        try { await loadBoard(); render(); }
        catch (err) { renderEmpty(String(err && err.message ? err.message : err)); }
      });
    }
    if (elHeaderBack) {
      elHeaderBack.addEventListener('click', () => { state.screen = 'horses'; render(); });
    }
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  async function boot() {
    try {
      bindNav();
      bindHeader();
      await loadBoard();
      render();
    } catch (err) {
      renderEmpty(String(err && err.message ? err.message : err));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
