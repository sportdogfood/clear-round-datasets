(function () {
  'use strict';

  // ----------------------------
  // CONFIG & STATE
  // ----------------------------
  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;
  const DUR_PER_TRIP_SEC = 149; // 2m 29s per trip

  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },
    scopeMode: 'ACTIVE', // ACTIVE | FULL
    screen: 'start',
    history: [],
    detail: null,
    activeHorses: new Set(),
    search: { horses: '', rings: '', classes: '' },
    peak: { rings: new Set(), classes: new Set() }
  };

  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const navRow = document.getElementById('nav-row');

  // ----------------------------
  // UTILS & TIME PARSING
  // ----------------------------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function normalizeStr(s) { return String(s || '').trim().toLowerCase(); }

  function safeNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback ?? null);
  }

  function timeToMinutes(t) {
    if (!t) return null;
    const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])\s*([Mm])?$/);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'A' && hh === 12) hh = 0;
    else if (ap === 'P' && hh !== 12) hh += 12;
    return hh * 60 + mm;
  }

  function clearRoot() { if (screenRoot) screenRoot.innerHTML = ''; }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title || '';
    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
  }

  function setHeaderAction(label, show) {
    if (!headerAction) return;
    headerAction.hidden = !show;
    if (show) headerAction.textContent = label;
  }

  // ----------------------------
  // DATA INDEXING
  // ----------------------------
  function buildScheduleIndex() {
    const ringMap = new Map();
    const classMap = new Map();
    state.schedule.forEach(r => {
      if (!r.ring_number || !r.class_id) return;
      const rk = String(r.ring_number);
      if (!ringMap.has(rk)) {
        ringMap.set(rk, { ring_number: r.ring_number, ringName: r.ringName || `Ring ${rk}`, groups: new Map() });
      }
      const ring = ringMap.get(rk);
      const gk = String(r.class_group_id);
      if (!ring.groups.has(gk)) {
        ring.groups.set(gk, { class_group_id: r.class_group_id, group_name: r.group_name || 'Group', latestStart: r.latestStart, classes: new Map() });
      }
      const group = ring.groups.get(gk);
      group.classes.set(String(r.class_id), { class_id: r.class_id, class_number: r.class_number, class_name: r.class_name, latestStart: r.latestStart });
      classMap.set(String(r.class_id), r);
    });
    return { ringMap, classMap };
  }

  function buildTruthIndex() {
    const byHorse = new Map(), byRing = new Map(), byGroup = new Map(), byClass = new Map(), entryBest = new Map();
    state.trips.forEach(t => {
      const h = String(t.horseName || '');
      if (state.scopeMode === 'ACTIVE' && !state.activeHorses.has(h)) return;
      const ek = `${t.class_id}|${h}`;
      if (!entryBest.has(ek)) entryBest.set(ek, t);
      
      const addToMap = (map, key) => { 
        if (!map.has(key)) map.set(key, new Set()); 
        map.get(key).add(ek); 
      };

      if (h) addToMap(byHorse, h);
      if (t.ring_number) addToMap(byRing, String(t.ring_number));
      if (t.class_group_id) addToMap(byGroup, String(t.class_group_id));
      if (t.class_id) addToMap(byClass, String(t.class_id));
    });
    return { byHorse, byRing, byGroup, byClass, entryBest };
  }

  // ----------------------------
  // SCREEN RENDERS
  // ----------------------------
  function render() {
    if (!state.loaded) { renderStart(); return; }
    const sIdx = buildScheduleIndex(), tIdx = buildTruthIndex();
    
    // Update Nav Aggregates
    const horseBtn = document.querySelector('[data-nav-agg="horses"]');
    if (horseBtn) horseBtn.textContent = state.activeHorses.size;
    
    const ringBtn = document.querySelector('[data-nav-agg="rings"]');
    if (ringBtn) ringBtn.textContent = tIdx.byRing.size;

    const classBtn = document.querySelector('[data-nav-agg="classes"]');
    if (classBtn) classBtn.textContent = tIdx.byGroup.size;

    // Update Mode Pills (A/F)
    document.querySelectorAll('[data-mode-pill]').forEach(el => {
      el.textContent = state.scopeMode === 'FULL' ? 'F' : 'A';
    });

    switch (state.screen) {
      case 'start': renderStart(); break;
      case 'horses': renderHorses(sIdx, tIdx); break;
      case 'horseDetail': renderHorseDetail(sIdx, tIdx); break;
      case 'rings': renderRings(sIdx, tIdx); break;
      case 'classes': renderClasses(sIdx, tIdx); break;
      case 'groupDetail': renderGroupDetail(sIdx, tIdx); break;
      case 'classDetail': renderClassDetail(sIdx, tIdx); break;
      case 'schedule': renderTimeline(sIdx, tIdx); break;
      default: renderStart();
    }
  }

  function renderStart() {
    clearRoot(); setHeader('Start'); setHeaderAction('Next', true);
    const logo = el('div', 'start-logo');
    logo.append(el('div', 'start-logo-title', 'CRT Daily Show'), el('div', 'start-logo-subtitle', state.loaded ? `Session: ${state.meta.sid}` : 'Loading Data...'));
    const btn = el('div', 'row row--tap');
    btn.append(el('div', 'row-title', 'Launch Session'), el('div', 'row-tag row-tag--positive', 'GO'));
    btn.onclick = () => goto('horses');
    screenRoot.append(logo, btn);
  }

  function renderHorses(sIdx, tIdx) {
    clearRoot(); setHeader('Horses');
    const horses = [...new Set(state.trips.map(t => t.horseName))].sort();
    horses.forEach(h => {
      const row = el('div', 'row row--tap');
      if (state.activeHorses.has(h)) row.classList.add('row--active');
      const count = tIdx.byHorse.get(h)?.size || 0;
      row.append(el('div', 'row-title', h), el('div', 'row-tag', count));
      row.onclick = () => pushDetail('horseDetail', { key: h });
      screenRoot.append(row);
    });
  }

  function renderHorseDetail(sIdx, tIdx) {
    const h = state.detail.key;
    clearRoot(); setHeader(h);
    const toggle = el('div', 'row row--tap');
    const isActive = state.activeHorses.has(h);
    toggle.append(el('div', 'row-title', isActive ? 'Active (Following)' : 'Inactive'), el('div', 'row-tag', isActive ? 'ON' : 'OFF'));
    toggle.onclick = () => { isActive ? state.activeHorses.delete(h) : state.activeHorses.add(h); render(); };
    screenRoot.append(toggle);
  }

  function renderTimeline(sIdx, tIdx) {
    clearRoot(); setHeader('Timeline');
    const activeTrips = state.trips.filter(t => state.scopeMode === 'FULL' || state.activeHorses.has(t.horseName));
    
    let min = 1440, max = 0;
    activeTrips.forEach(t => {
      const m = timeToMinutes(t.latestGO);
      if (m !== null) { min = Math.min(min, m); max = Math.max(max, m + 15); }
    });
    
    const bounds = { start: Math.max(0, min - 30), total: (max - min + 60) || 1 };
    const rings = [...new Set(activeTrips.map(t => t.ring_number))].sort();

    rings.forEach(rn => {
      const section = el('div', 'timeline-section');
      section.innerHTML = `<div style="color:var(--accent); font-size:11px; margin:15px 0 5px 0;">Ring ${rn}</div>`;
      activeTrips.filter(t => t.ring_number === rn).forEach(t => {
        const start = timeToMinutes(t.latestGO);
        const bar = el('div', 'timeline-bar');
        const offset = ((start - bounds.start) / bounds.total) * 100;
        bar.style.cssText = `margin-left:${offset}%; width:4%; height:10px; background:var(--accent); border-radius:4px; margin-bottom:4px; cursor:pointer;`;
        bar.onclick = () => pushDetail('horseDetail', { key: t.horseName });
        section.append(bar);
      });
      screenRoot.append(section);
    });
  }

  function renderRings(sIdx, tIdx) {
    clearRoot(); setHeader('Rings');
    sIdx.ringMap.forEach(r => {
      const card = el('div', 'card');
      const hdr = el('div', 'card-hdr card-hdr--inverse');
      hdr.append(el('div', 'card-title', r.ringName));
      card.append(hdr);
      r.groups.forEach(g => {
        const line = el('div', 'card-line');
        const count = tIdx.byGroup.get(String(g.class_group_id))?.size || 0;
        line.innerHTML = `<div class="c-time">${g.latestStart || '--'}</div><div class="c-name">${g.group_name}</div>`;
        const agg = el('div', 'c-agg');
        if (count > 0) agg.append(el('div', 'row-tag row-tag--positive', count));
        line.append(agg);
        line.onclick = () => pushDetail('groupDetail', { key: g.class_group_id });
        card.append(line);
      });
      screenRoot.append(card);
    });
  }

  function renderClasses(sIdx, tIdx) {
    clearRoot(); setHeader('Classes');
    sIdx.ringMap.forEach(r => {
      r.groups.forEach(g => {
        const row = el('div', 'row row--tap');
        const count = tIdx.byGroup.get(String(g.class_group_id))?.size || 0;
        row.append(el('div', 'row-title', g.group_name), el('div', 'row-tag', count));
        row.onclick = () => pushDetail('groupDetail', { key: g.class_group_id });
        screenRoot.append(row);
      });
    });
  }

  function renderGroupDetail(sIdx, tIdx) {
    const gid = String(state.detail.key);
    clearRoot(); setHeader('Classes');
    let group;
    sIdx.ringMap.forEach(r => { if (r.groups.has(gid)) group = r.groups.get(gid); });
    group.classes.forEach(c => {
      const row = el('div', 'row row--tap');
      const count = tIdx.byClass.get(String(c.class_id))?.size || 0;
      row.append(el('div', 'row-title', `${c.class_number} ${c.class_name}`), el('div', 'row-tag', count));
      row.onclick = () => pushDetail('classDetail', { key: c.class_id });
      screenRoot.append(row);
    });
  }

  function renderClassDetail(sIdx, tIdx) {
    const cid = String(state.detail.key);
    clearRoot(); setHeader('Entries');
    const cRec = sIdx.classMap.get(cid);
    const card = el('div', 'card');
    card.innerHTML = `<div class="card-hdr"><div class="card-title">${cRec.class_number} ${cRec.class_name}</div></div>`;
    const grid = el('div', 'list-column');
    grid.style.marginTop = '10px';
    const entries = tIdx.byClass.get(cid) || [];
    entries.forEach(ek => {
      const t = tIdx.entryBest.get(ek);
      const row = el('div', 'entry-grid-row');
      row.innerHTML = `<span>${t.latestGO || '-'}</span><span>${t.horseName}</span><span class="entry-pill">${t.lastOOG || '-'}</span>`;
      row.onclick = () => pushDetail('horseDetail', { key: t.horseName });
      grid.append(row);
    });
    screenRoot.append(card, grid);
  }

  // ----------------------------
  // NAV & INITIALIZATION
  // ----------------------------
  function goto(s) { state.screen = s; state.history = []; state.detail = null; render(); }
  function pushDetail(s, d) { state.history.push({ screen: state.screen, detail: state.detail }); state.screen = s; state.detail = d; render(); }
  function goBack() { const p = state.history.pop(); if (p) { state.screen = p.screen; state.detail = p.detail; render(); } }

  navRow.onclick = (e) => {
    const b = e.target.closest('[data-screen]');
    if (!b) return;
    const s = b.dataset.screen;
    if (s === state.screen && s === 'schedule') {
      state.scopeMode = state.scopeMode === 'ACTIVE' ? 'FULL' : 'ACTIVE';
      render();
    } else goto(s);
  };
  headerBack.onclick = goBack;
  headerAction.onclick = () => {
    const order = ['start', 'horses', 'rings', 'classes', 'schedule'];
    const idx = order.indexOf(state.screen);
    goto(order[(idx + 1) % order.length]);
  };

  async function loadAll() {
    try {
      const [s, t] = await Promise.all([
        fetch(DATA_SCHEDULE_URL).then(r => r.json()),
        fetch(DATA_TRIPS_URL).then(r => r.json())
      ]);
      state.schedule = s.records; state.trips = t.records; state.meta = s.meta;
      if (state.activeHorses.size === 0) {
        [...new Set(state.trips.map(x => x.horseName))].forEach(h => state.activeHorses.add(h));
      }
      state.loaded = true; render();
    } catch (e) { console.error("Data Load Error", e); }
  }

  loadAll();
  setInterval(loadAll, REFRESH_MS);
})();