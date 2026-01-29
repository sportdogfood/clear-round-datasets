// app.js — CRT Daily Show (Legacy UI contract + Cards + Peaks + Schedule/Timeline modes)
//
// Data:
//   ./data/latest/watch_schedule.json (context scaffold)
//   ./data/latest/watch_trips.json    (truth overlay)
//
// This drop implements the detail rules discussed:
// - Global "next upcoming" selection (Completed-insensitive, earliest by latestStart else latestGO, tie: lastOOG, tie: ring_number)
// - Horse detail renders like Schedule, but rollups are RIDERS (wrapped grid)
// - Class detail renders like Schedule, but rollup replaced by ENTRY + RIDER line blocks
// - Rider detail renders like Schedule, but rollup replaced by ENTRY + RIDER line blocks
// - Horse/Rider list rows show next time tag + count tag
// - Keeps existing schedule click rules + peakbar scroll offset + schedule-tab retention from schedule-origin details
// - Timeline stays 60px horse col + de-dupe by startMin

(function () {
  'use strict';

  // ----------------------------
  // CONFIG
  // ----------------------------
  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // If duration is unknown, assume per-trip duration:
  const DUR_PER_TRIP_SEC = 149; // 2m 29s

  // ----------------------------
  // DOM
  // ----------------------------
  const appMain = document.getElementById('app-main');
  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action'); // always hidden (may not exist)
  const navRow = document.getElementById('nav-row');

  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    screen: 'start',
    history: [],
    detail: null,

    // per-screen search
    search: {
      horses: '',
      rings: '',
      classes: '',
      riders: '',
      schedule: '',
      timeline: ''
    },

    // optional: after render, scroll within main to an element id
    pendingScrollId: null
  };

  // ----------------------------
  // UTIL (DOM)
  // ----------------------------
  function el(tag, clsOrAttrs, text) {
    const n = document.createElement(tag);

    if (typeof clsOrAttrs === 'string') {
      if (clsOrAttrs) n.className = clsOrAttrs;
      if (text != null) n.textContent = text;
      return n;
    }

    if (clsOrAttrs && typeof clsOrAttrs === 'object') {
      const a = clsOrAttrs;

      if (a.className) n.className = a.className;
      if (a.text != null) n.textContent = a.text;
      if (a.html != null) n.innerHTML = a.html;

      if (a.id) n.id = a.id;
      if (a.href) n.setAttribute('href', a.href);
      if (a.type) n.setAttribute('type', a.type);
      if (a.placeholder) n.setAttribute('placeholder', a.placeholder);
      if (a.value != null) n.value = a.value;

      if (a.dataset && typeof a.dataset === 'object') {
        Object.keys(a.dataset).forEach(k => { n.dataset[k] = a.dataset[k]; });
      }

      if (a.style && typeof a.style === 'object') {
        Object.keys(a.style).forEach(k => { n.style[k] = a.style[k]; });
      }

      if (text != null) n.textContent = text;
      return n;
    }

    if (text != null) n.textContent = text;
    return n;
  }

  function normalizeStr(s) {
    return String(s || '').trim().toLowerCase();
  }

  function idify(s) {
    return normalizeStr(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
  }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title || '';
    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
    if (headerAction) headerAction.hidden = true; // ✅ always hidden
  }

  function setNavActive(primaryScreen) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('[data-screen]');
    btns.forEach(b => {
      const on = b.dataset.screen === primaryScreen;
      b.classList.toggle('nav-btn--primary', on);
    });
  }

  function setAgg(key, value) {
    const node = document.querySelector(`[data-nav-agg="${key}"]`);
    if (!node) return;
    node.textContent = String(value);
    node.classList.toggle('nav-agg--positive', Number(value) > 0);
  }

  // ----------------------------
  // UTIL (time)
  // ----------------------------
  function timeToMinutes(t) {
    if (!t) return null;
    const s0 = String(t).trim();
    if (!s0) return null;

    // "9:05A" / "9:05AM" / "9:05 AM"
    let m = s0.match(/^(\d{1,2}):(\d{2})\s*([AaPp])\s*([Mm])?$/);
    if (m) {
      let hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const ap = m[3].toUpperCase(); // A or P
      if (ap === 'A') {
        if (hh === 12) hh = 0;
      } else {
        if (hh !== 12) hh += 12;
      }
      return hh * 60 + mm;
    }

    // "HH:mm:ss" / "HH:mm"
    m = s0.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      if (hh < 0 || hh > 23) return null;
      if (mm < 0 || mm > 59) return null;
      return hh * 60 + mm;
    }

    return null;
  }

  function fmtTimeShort(t) {
    const mins = timeToMinutes(t);
    if (mins == null) return String(t || '').trim();

    const h24 = Math.floor(mins / 60) % 24;
    const m = mins % 60;

    const ap = h24 >= 12 ? 'P' : 'A';
    let h = h24 % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')}${ap}`;
  }

  function fmtClockFromMinutes(totalMinutes) {
    const mins = Math.max(0, Math.floor(totalMinutes));
    const h24 = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ap = h24 >= 12 ? 'P' : 'A';
    let h = h24 % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')}${ap}`;
  }

  function fmtStatus4(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    return s.toUpperCase().slice(0, 4);
  }

  function safeNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback ?? null);
  }

  function safeNumber(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;

    const s = String(v).trim();
    if (!s) return null;

    const n = Number(s.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function isCompletedStatus(v) {
    return normalizeStr(v) === 'completed';
  }

  // "Next upcoming" ordering:
  // - upcoming if latestStatus !== "Completed" (case-insensitive)
  // - sort key: latestStart (if present) else latestGO
  // - tie: lastOOG asc
  // - tie: ring_number asc
  function nextKeyMinutes(trip) {
    const hasStart = trip && trip.latestStart != null && String(trip.latestStart).trim() !== '';
    const t = hasStart ? trip.latestStart : (trip ? trip.latestGO : null);
    return timeToMinutes(t) ?? 999999;
  }

  function nextTieOOG(trip) {
    return safeNum(trip && trip.lastOOG, 999999);
  }

  function nextTieRing(trip) {
    return safeNum(trip && trip.ring_number, 999999);
  }

  function chooseNextTrip(tripsList) {
    if (!tripsList || tripsList.length === 0) return null;

    const upcoming = [];
    const all = [];

    for (const t of tripsList) {
      if (!t) continue;
      all.push(t);
      if (!isCompletedStatus(t.latestStatus)) upcoming.push(t);
    }

    function pick(list) {
      let best = null;
      let bestK = 999999;
      let bestO = 999999;
      let bestR = 999999;

      for (const t of list) {
        const k = nextKeyMinutes(t);
        const o = nextTieOOG(t);
        const r = nextTieRing(t);

        if (!best) { best = t; bestK = k; bestO = o; bestR = r; continue; }

        if (k < bestK) { best = t; bestK = k; bestO = o; bestR = r; continue; }
        if (k === bestK && o < bestO) { best = t; bestK = k; bestO = o; bestR = r; continue; }
        if (k === bestK && o === bestO && r < bestR) { best = t; bestK = k; bestO = o; bestR = r; continue; }
      }

      return best;
    }

    return pick(upcoming.length ? upcoming : all);
  }

  function roundUpTo5Minutes(d) {
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(d.getTime() / ms) * ms);
  }

  function parseAmPmTimeToDate(dt, t) {
    const mins = timeToMinutes(t);
    if (mins == null) return null;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return new Date(`${dt}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
  }

  function parseTripStartEnd(trip, opts) {
    const dt = (opts && opts.dt) ? opts.dt : (trip && trip.dt) ? String(trip.dt) : state.meta.dt;

    const startLabel = (trip && (trip.latestGO || trip.latestStart || trip.estimated_start_time))
      ? String(trip.latestGO || trip.latestStart || trip.estimated_start_time).trim()
      : '';
    if (!dt || !startLabel) return { start: null, end: null };

    const start = parseAmPmTimeToDate(dt, startLabel);
    if (!start) return { start: null, end: null };

    const tripsCount = safeNumber(trip && trip.total_trips);
    const nTrips = (tripsCount != null && tripsCount > 0) ? tripsCount : 1;

    const end = roundUpTo5Minutes(new Date(start.getTime() + (nTrips * DUR_PER_TRIP_SEC * 1000)));
    return { start, end };
  }

  // ----------------------------
  // SCROLL OFFSET FIX (peakbar)
  // ----------------------------
  function scrollToIdWithinMain(id) {
    if (!appMain) return;
    const target = document.getElementById(id);
    if (!target) return;

    const peakbar = appMain.querySelector('.peakbar');
    const offset = (peakbar ? peakbar.offsetHeight : 0) + 16;

    const mainRect = appMain.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const topInMain = (targetRect.top - mainRect.top) + appMain.scrollTop;
    const y = Math.max(0, topInMain - offset);

    appMain.scrollTo({ top: y, behavior: 'smooth' });
  }

  function applyPendingScroll() {
    if (!state.pendingScrollId) return;
    const id = state.pendingScrollId;
    state.pendingScrollId = null;
    scrollToIdWithinMain(id);
  }

  // ----------------------------
  // LOAD
  // ----------------------------
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.json();
  }

  async function loadAll() {
    const [sched, trips] = await Promise.all([
      fetchJson(DATA_SCHEDULE_URL),
      fetchJson(DATA_TRIPS_URL)
    ]);

    const nextGenerated =
      (sched && sched.meta && sched.meta.generated_at) ||
      (trips && trips.meta && trips.meta.generated_at) ||
      null;

    if (state.loaded && nextGenerated && state.meta.generated_at === nextGenerated) return;

    state.schedule = Array.isArray(sched && sched.records) ? sched.records : [];
    state.trips = Array.isArray(trips && trips.records) ? trips.records : [];

    const dtScope =
      (sched && sched.meta && sched.meta.dt) ||
      (state.schedule[0] && state.schedule[0].dt) ||
      (state.trips[0] && state.trips[0].dt) ||
      null;

    const sidScope =
      (sched && sched.meta && sched.meta.sid) ||
      (state.schedule[0] && state.schedule[0].sid) ||
      (state.trips[0] && state.trips[0].sid) ||
      null;

    state.meta = { dt: dtScope, sid: sidScope, generated_at: nextGenerated };
    state.loaded = true;

    render();
  }

  setInterval(() => { loadAll().catch(() => { }); }, REFRESH_MS);

  // ----------------------------
  // INDEXES (schedule scaffold + trips truth)
  // ----------------------------
  function buildScheduleIndex() {
    const ringMap = new Map();   // ring_number string -> { ring_number, ringName, groups: Map }
    const classMap = new Map();  // class_id string -> scheduleRec (first)

    for (const r of (state.schedule || [])) {
      if (!r) continue;

      const ringN = r.ring_number;
      const gid = r.class_group_id;
      const cid = r.class_id;

      if (ringN == null || gid == null || cid == null) continue;

      const ringKey = String(ringN);
      const ringName = r.ringName || (ringN != null ? `Ring ${ringN}` : 'Ring');

      if (!ringMap.has(ringKey)) {
        ringMap.set(ringKey, { ring_number: ringN, ringName, groups: new Map() });
      }
      const ringObj = ringMap.get(ringKey);

      const gidKey = String(gid);
      if (!ringObj.groups.has(gidKey)) {
        ringObj.groups.set(gidKey, {
          class_group_id: gid,
          group_name: r.group_name || r.class_name || '(Group)',
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null,
          classes: new Map()
        });
      }
      const gObj = ringObj.groups.get(gidKey);

      const cidKey = String(cid);
      if (!gObj.classes.has(cidKey)) {
        gObj.classes.set(cidKey, {
          class_id: cid,
          class_number: r.class_number,
          class_name: r.class_name || '(Class)',
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null
        });
      }

      if (!classMap.has(cidKey)) classMap.set(cidKey, r);
    }

    return { ringMap, classMap };
  }

  // Truth index:
  // - entryKey = `${class_id}|${horseName}` (dedupe per horse per class)
  // - entryTrips: all trip records for that entryKey
  // - entryNext: chosen by global next-upcoming rule
  function buildTruthIndex() {
    const entryTrips = new Map(); // entryKey -> trips[]
    const entryNext = new Map();  // entryKey -> chosen trip

    const byHorse = new Map();    // horseName -> entryKeys[]
    const byRing = new Map();     // ring_number string -> entryKeys[]
    const byGroup = new Map();    // class_group_id string -> entryKeys[]
    const byClass = new Map();    // class_id string -> entryKeys[]
    const byRider = new Map();    // riderName -> entryKeys[]

    function pushKey(map, k, entryKey) {
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(entryKey);
    }

    for (const t of (state.trips || [])) {
      if (!t) continue;

      const horse = t.horseName ? String(t.horseName).trim() : '';
      const cid = t.class_id != null ? String(t.class_id) : null;
      if (!horse || !cid) continue;

      const entryKey = `${cid}|${horse}`;

      if (!entryTrips.has(entryKey)) entryTrips.set(entryKey, []);
      entryTrips.get(entryKey).push(t);

      pushKey(byHorse, horse, entryKey);
      pushKey(byClass, cid, entryKey);

      if (t.ring_number != null) pushKey(byRing, String(t.ring_number), entryKey);
      if (t.class_group_id != null) pushKey(byGroup, String(t.class_group_id), entryKey);

      if (t.riderName) pushKey(byRider, String(t.riderName), entryKey);
    }

    // choose next per entryKey
    for (const [k, list] of entryTrips.entries()) {
      entryNext.set(k, chooseNextTrip(list));
    }

    function uniq(arr) {
      const out = [];
      const seen = new Set();
      for (const k of (arr || [])) {
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      }
      return out;
    }

    for (const [k, arr] of byHorse.entries()) byHorse.set(k, uniq(arr));
    for (const [k, arr] of byRing.entries()) byRing.set(k, uniq(arr));
    for (const [k, arr] of byGroup.entries()) byGroup.set(k, uniq(arr));
    for (const [k, arr] of byClass.entries()) byClass.set(k, uniq(arr));
    for (const [k, arr] of byRider.entries()) byRider.set(k, uniq(arr));

    return { entryTrips, entryNext, byHorse, byRing, byGroup, byClass, byRider };
  }

  // ----------------------------
  // RENDER HELPERS (cards + peaks)
  // ----------------------------
  function makeTagCount(n) {
    const t = el('div', 'row-tag row-tag--count', String(n));
    if (Number(n) > 0) t.classList.add('row-tag--positive');
    return t;
  }

  function makeTagText(txt) {
    return el('div', 'row-tag row-tag--count', String(txt || '').trim());
  }

  function makeRightTags(...nodes) {
    const wrap = el('div', null);
    wrap.style.display = 'inline-flex';
    wrap.style.gap = '6px';
    wrap.style.alignItems = 'center';
    nodes.filter(Boolean).forEach(n => wrap.appendChild(n));
    return wrap;
  }

  function renderSearch(screenKey, placeholder) {
    const wrap = el('div', 'state-search');
    const input = el('input', 'state-search-input');
    input.type = 'text';
    input.placeholder = placeholder || 'Search...';
    input.value = state.search[screenKey] || '';

    input.addEventListener('input', () => {
      state.search[screenKey] = input.value;
      render();
    });

    wrap.appendChild(input);
    return wrap;
  }

  function renderPeakBar(items) {
    const root = el('div', 'peakbar');
    const scroller = el('div', 'nav-scroller');
    const row = el('div', 'nav-row peakbar-row');

    items.forEach((it) => {
      if (typeof it.agg === 'number' && it.agg === 0) return;

      const a = el('a', 'nav-btn');
      a.href = it.href || '#';
      a.appendChild(el('span', 'nav-label', it.label));

      if (typeof it.agg === 'number') {
        const aggCls = 'nav-agg' + (it.agg > 0 ? ' nav-agg--positive' : '');
        a.appendChild(el('span', aggCls, String(it.agg)));
      }

      a.addEventListener('click', (ev) => {
        const href = it.href || '';
        const hash = href.split('#')[1] || '';
        if (!hash) return;
        ev.preventDefault();
        scrollToIdWithinMain(hash);
        history.replaceState(null, '', `#${hash}`);
      });

      row.appendChild(a);
    });

    scroller.appendChild(row);
    root.appendChild(scroller);
    return root;
  }

  function makeCard(title, aggValue, inverseHdr, onClick) {
    const card = el('div', 'card' + (onClick ? ' card--tap' : ''));
    if (onClick) card.addEventListener('click', onClick);

    const hdr = el('div', 'card-hdr' + (inverseHdr ? ' card-hdr--inverse' : ''));
    hdr.appendChild(el('div', 'card-title', title));

    if (aggValue != null && Number(aggValue) > 0) {
      hdr.appendChild(makeTagCount(aggValue));
    }

    card.appendChild(hdr);
    card.appendChild(el('div', 'card-body'));
    return card;
  }

  // Split-click line:
  // handlers: { onLeft, onMid, onRight, onRow }
  function addCardLine(card, leftTxt, midTxt, rightNode, handlers) {
    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    const l = el('div', 'c-time', leftTxt || '');
    const m = el('div', 'c-name', midTxt || '');
    const r = el('div', 'c-agg');
    if (rightNode) r.appendChild(rightNode);

    if (handlers && handlers.onLeft) {
      l.style.cursor = 'pointer';
      l.addEventListener('click', (e) => { e.stopPropagation(); handlers.onLeft(); });
    }
    if (handlers && handlers.onMid) {
      m.style.cursor = 'pointer';
      m.addEventListener('click', (e) => { e.stopPropagation(); handlers.onMid(); });
    }
    if (handlers && handlers.onRight) {
      r.style.cursor = 'pointer';
      r.addEventListener('click', (e) => { e.stopPropagation(); handlers.onRight(); });
    }
    if (handlers && handlers.onRow) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', () => handlers.onRow());
    }

    line.appendChild(l);
    line.appendChild(m);
    line.appendChild(r);
    body.appendChild(line);
  }

  // ✅ wrapped 3-across rollup grid (click chip => detail)
  function addChipRollup(card, chips, onChipClick) {
    if (!chips || chips.length === 0) return;

    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    line.appendChild(el('div', 'c-time', ''));

    const mid = el('div', 'c-name');
    const roll = el('div', 'entry-rollup-grid');

    chips.forEach((txt) => {
      const label = String(txt || '').trim();
      if (!label) return;

      const chip = el('button', { className: 'entry-chip', type: 'button', text: label });
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onChipClick) onChipClick(label);
      });

      roll.appendChild(chip);
    });

    if (!roll.childNodes.length) return;

    mid.appendChild(roll);
    line.appendChild(mid);
    line.appendChild(el('div', 'c-agg'));
    body.appendChild(line);
  }

  function entryKeyHorse(entryKey) {
    const parts = String(entryKey || '').split('|');
    return parts.length > 1 ? parts.slice(1).join('|') : '';
  }

  function getNextForEntryKeys(tIdx, entryKeys) {
    const trips = (entryKeys || [])
      .map(k => tIdx.entryNext.get(k))
      .filter(Boolean);
    return chooseNextTrip(trips);
  }

  // ----------------------------
  // NAV / DETAILS
  // ----------------------------
  function goto(screen) {
    state.screen = screen;
    state.detail = null;
    state.history = [];
    render();
  }

  // ✅ preserve originating primary tab for details opened from schedule
  function pushDetail(screen, detail) {
    const fromPrimary = getPrimaryForScreen(state.screen);
    const d = Object.assign({}, detail || {}, { _fromPrimary: fromPrimary });

    state.history.push({ screen: state.screen, detail: state.detail });
    state.screen = screen;
    state.detail = d;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return;
    state.screen = prev.screen;
    state.detail = prev.detail;
    render();
  }

  function gotoTimeline() {
    history.replaceState(null, '', '#timeline');
    state.pendingScrollId = null;
    state.history = [];
    state.detail = null;
    state.screen = 'timeline';
    render();
    if (appMain) appMain.scrollTop = 0;
  }

  function getPrimaryForScreen(screen) {
    if (screen && /Detail$/.test(screen) && state.detail && state.detail._fromPrimary) {
      return state.detail._fromPrimary;
    }

    const map = {
      start: 'start',

      horses: 'horses',
      horseDetail: 'horses',

      rings: 'schedule',
      schedule: 'schedule',
      ringDetail: 'schedule',
      groupDetail: 'schedule',
      classDetail: 'schedule',

      riders: 'riders',
      riderDetail: 'riders',

      timeline: 'timeline'
    };
    return map[screen] || 'start';
  }

  // ----------------------------
  // AGGS (truth only)
  // ----------------------------
  function renderAggs(_sIdx, tIdx) {
    setAgg('horses', tIdx.byHorse.size);
    setAgg('rings', tIdx.byRing.size);
    setAgg('classes', tIdx.byGroup.size);
    setAgg('riders', tIdx.byRider.size);
  }

  // ----------------------------
  // SCREEN: START
  // ----------------------------
  function renderStart() {
    clearRoot();
    setHeader('Start');

    const wrap = el('div', 'list-column');

    const logo = el('div', 'start-logo');
    logo.appendChild(el('div', 'start-logo-title', 'CRT Daily Show'));

    const sub = state.loaded
      ? `sid ${state.meta.sid || '-'} • ${state.meta.dt || '-'}`
      : 'Loading schedule...';
    logo.appendChild(el('div', 'start-logo-subtitle', sub));

    if (state.meta.generated_at) {
      logo.appendChild(el('div', 'start-logo-subtitle', `generated ${state.meta.generated_at}`));
    }

    wrap.appendChild(logo);

    const btn = el('div', 'row row--tap');
    btn.appendChild(el('div', 'row-title', 'Start Session'));
    btn.appendChild(el('div', 'row-tag row-tag--count', 'GO'));
    btn.addEventListener('click', async () => {
      if (!state.loaded) {
        try { await loadAll(); } catch (_) { }
      }
      goto('schedule');
    });
    wrap.appendChild(btn);

    screenRoot.appendChild(wrap);
  }

  // ----------------------------
  // SCREEN: HORSES (list -> detail)
  // ----------------------------
  function renderHorses(_sIdx, tIdx) {
    clearRoot();
    setHeader('Horses');

    screenRoot.appendChild(renderSearch('horses', 'Search horses...'));

    const q = normalizeStr(state.search.horses);
    const horsesAll = [...tIdx.byHorse.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    const horses = q ? horsesAll.filter(h => normalizeStr(h).includes(q)) : horsesAll;

    for (const h of horses) {
      const keys = tIdx.byHorse.get(String(h)) || [];
      if (keys.length === 0) continue;

      const next = getNextForEntryKeys(tIdx, keys);
      const nextTime = next ? fmtTimeShort(next.latestGO || next.latestStart || '') : '';

      const row = el('div', 'row row--tap');
      row.id = `horse-${idify(h)}`;

      row.appendChild(el('div', 'row-title', String(h)));

      const right = makeRightTags(
        nextTime ? makeTagText(nextTime) : null,
        makeTagCount(keys.length)
      );
      row.appendChild(right);

      row.addEventListener('click', () => {
        pushDetail('horseDetail', { kind: 'horse', key: String(h) });
      });

      screenRoot.appendChild(row);
    }
  }

  // Horse detail: Schedule-like, but rollups are RIDERS (wrapped grid).
  function renderHorseDetail(sIdx, tIdx) {
    const horse = state.detail && state.detail.key ? String(state.detail.key) : null;

    clearRoot();
    setHeader(horse || 'Horse');
    if (!horse) return;

    const entryKeys = (tIdx.byHorse.get(horse) || []).slice();
    if (!entryKeys.length) return;

    // ring buckets
    const ringBuckets = new Map(); // rk -> entryKeys[]
    for (const k of entryKeys) {
      const t = tIdx.entryNext.get(k);
      const rk = (t && t.ring_number != null) ? String(t.ring_number) : '—';
      if (!ringBuckets.has(rk)) ringBuckets.set(rk, []);
      ringBuckets.get(rk).push(k);
    }

    const ringOrder = [...ringBuckets.keys()].sort((a, b) => {
      const na = safeNum(a, 999999);
      const nb = safeNum(b, 999999);
      return na - nb;
    });

    for (const rk of ringOrder) {
      const ringObj = sIdx.ringMap.get(rk);
      const ringName = ringObj ? ringObj.ringName : (rk === '—' ? 'Ring' : `Ring ${rk}`);

      const keysInRing = ringBuckets.get(rk) || [];
      const card = makeCard(ringName, keysInRing.length, true, () => {
        if (rk !== '—') pushDetail('ringDetail', { kind: 'ring', key: rk });
      });
      card.id = `horse-ring-${rk === '—' ? 'x' : rk}`;

      if (!ringObj) {
        // No scaffold for this ring: show entry blocks only
        const trips = keysInRing.map(k => tIdx.entryNext.get(k)).filter(Boolean).sort((a, b) => {
          const ka = nextKeyMinutes(a);
          const kb = nextKeyMinutes(b);
          if (ka !== kb) return ka - kb;
          const oa = nextTieOOG(a);
          const ob = nextTieOOG(b);
          if (oa !== ob) return oa - ob;
          return nextTieRing(a) - nextTieRing(b);
        });

        for (const t of trips) {
          const entryLineLeft = fmtTimeShort(t.latestGO || t.latestStart || '');
          const entryLineMid = `${t.class_number != null ? t.class_number : ''} • ${t.class_name || ''}`.trim();
          const right = fmtStatus4(t.latestStatus);

          addCardLine(card, entryLineLeft, entryLineMid, right ? makeTagText(right) : null, {
            onLeft: () => gotoTimeline(),
            onMid: () => { if (t.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(t.class_id) }); }
          });

          if (t.riderName) {
            addCardLine(card, '', String(t.riderName), (t.lastOOG != null ? makeTagText(String(t.lastOOG)) : null), {
              onMid: () => pushDetail('riderDetail', { kind: 'rider', key: String(t.riderName) })
            });
          }
        }

        screenRoot.appendChild(card);
        continue;
      }

      // For each scaffold group in this ring, render only if horse has entries in that group
      const groups = [...ringObj.groups.values()].sort((a, b) => {
        const ta = timeToMinutes(a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      });

      for (const g of groups) {
        const gid = String(g.class_group_id);

        // entryKeys for this horse in this group
        const inGroup = keysInRing.filter((k) => {
          const t = tIdx.entryNext.get(k);
          return t && t.class_group_id != null && String(t.class_group_id) === gid;
        });
        if (!inGroup.length) continue;

        const gNext = getNextForEntryKeys(tIdx, inGroup);
        const gLeft = gNext ? fmtTimeShort(gNext.latestGO || gNext.latestStart || g.latestStart || '') : fmtTimeShort(g.latestStart || '');
        const gStatus = fmtStatus4((gNext && gNext.latestStatus) || g.latestStatus);

        addCardLine(
          card,
          gLeft,
          String(g.group_name),
          gStatus ? makeTagText(gStatus) : null,
          {
            onLeft: () => gotoTimeline(),
            onMid: () => pushDetail('groupDetail', { kind: 'group', key: gid })
          }
        );

        const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
        for (const c of classes) {
          const cid = String(c.class_id);

          const inClass = inGroup.filter((k) => {
            const t = tIdx.entryNext.get(k);
            return t && t.class_id != null && String(t.class_id) === cid;
          });
          if (!inClass.length) continue;

          addCardLine(
            card,
            (c.class_number != null ? String(c.class_number) : ''),
            String(c.class_name || '').trim(),
            makeTagCount(inClass.length),
            { onRow: () => pushDetail('classDetail', { kind: 'class', key: cid }) }
          );

          // Rider rollup chips for this horse+class (may be 1, but handle multiple)
          const riders = inClass
            .map(k => tIdx.entryNext.get(k))
            .filter(Boolean)
            .map(t => {
              const rn = t.riderName ? String(t.riderName).trim() : '';
              const oog = (t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG).trim() : '';
              if (!rn) return '';
              return oog ? `${rn} - ${oog}` : rn;
            })
            .filter(Boolean)
            .sort((a, b) => String(a).localeCompare(String(b)));

          addChipRollup(card, riders, (label) => {
            const name = String(label).split(' - ')[0].trim();
            if (name) pushDetail('riderDetail', { kind: 'rider', key: name });
          });
        }
      }

      screenRoot.appendChild(card);
    }
  }

  // ----------------------------
  // SCREEN: SCHEDULE (rings)
  // ----------------------------
  function renderSchedule(sIdx, tIdx) {
    clearRoot();
    setHeader('Schedule');

    screenRoot.appendChild(renderSearch('rings', 'Search rings...'));

    const ringsAll = [...sIdx.ringMap.values()]
      .sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));

    const q = normalizeStr(state.search.rings);

    const peakItems = ringsAll.map(r => {
      const rk = String(r.ring_number);
      const entryKeys = tIdx.byRing.get(rk) || [];
      return {
        key: rk,
        label: String(r.ringName),
        agg: entryKeys.length,
        href: `#ring-${rk}`
      };
    });

    screenRoot.appendChild(renderPeakBar(peakItems));

    for (const r of ringsAll) {
      const rk = String(r.ring_number);
      const ringEntryKeys = tIdx.byRing.get(rk) || [];
      if (ringEntryKeys.length === 0) continue;

      if (q && !normalizeStr(r.ringName).includes(q)) continue;

      const card = makeCard(String(r.ringName), ringEntryKeys.length, true, () => {
        pushDetail('ringDetail', { kind: 'ring', key: rk });
      });
      card.id = `ring-${rk}`;

      const groups = [...r.groups.values()].sort((a, b) => {
        const ta = timeToMinutes(a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      });

      for (const g of groups) {
        const gid = String(g.class_group_id);
        const gKeys = tIdx.byGroup.get(gid) || [];
        if (gKeys.length === 0) continue;

        addCardLine(
          card,
          fmtTimeShort(g.latestStart || ''),
          String(g.group_name),
          (fmtStatus4(g.latestStatus) ? makeTagText(fmtStatus4(g.latestStatus)) : null),
          {
            onLeft: () => gotoTimeline(),
            onMid: () => pushDetail('groupDetail', { kind: 'group', key: gid })
          }
        );

        const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
        for (const c of classes) {
          const cid = String(c.class_id);
          const cKeys = tIdx.byClass.get(cid) || [];
          if (cKeys.length === 0) continue;

          addCardLine(
            card,
            (c.class_number != null ? String(c.class_number) : ''),
            String(c.class_name || '').trim(),
            makeTagCount(cKeys.length),
            { onRow: () => pushDetail('classDetail', { kind: 'class', key: cid }) }
          );

          const bestTrips = cKeys
            .map(k => tIdx.entryNext.get(k))
            .filter(Boolean)
            .sort((a, b) => {
              const ka = nextKeyMinutes(a);
              const kb = nextKeyMinutes(b);
              if (ka !== kb) return ka - kb;
              const oa = nextTieOOG(a);
              const ob = nextTieOOG(b);
              if (oa !== ob) return oa - ob;
              return nextTieRing(a) - nextTieRing(b);
            })
            .slice(0, 14)
            .map(t => {
              const horse = (t && t.horseName) ? String(t.horseName).trim() : '';
              const oog = (t && t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG).trim() : '';
              if (!horse || !oog) return '';
              return `${horse} - ${oog}`;
            })
            .filter(Boolean);

          addChipRollup(card, bestTrips, (label) => {
            const horse = String(label).split(' - ')[0].trim();
            if (horse) pushDetail('horseDetail', { kind: 'horse', key: horse });
          });
        }
      }

      screenRoot.appendChild(card);
    }

    applyPendingScroll();
  }

  function renderRingDetail(sIdx, tIdx) {
    const rk = state.detail && state.detail.key ? String(state.detail.key) : null;
    const ringObj = rk ? sIdx.ringMap.get(rk) : null;

    clearRoot();
    setHeader(ringObj ? ringObj.ringName : 'Ring');

    if (!ringObj) return;

    const ringEntryKeys = tIdx.byRing.get(rk) || [];
    if (ringEntryKeys.length === 0) return;

    const card = makeCard(ringObj.ringName, ringEntryKeys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'ring';

    const groups = [...ringObj.groups.values()].sort((a, b) => {
      const ta = timeToMinutes(a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.group_name).localeCompare(String(b.group_name));
    });

    for (const g of groups) {
      const gid = String(g.class_group_id);
      const gKeys = tIdx.byGroup.get(gid) || [];
      if (gKeys.length === 0) continue;

      addCardLine(
        card,
        fmtTimeShort(g.latestStart || ''),
        String(g.group_name),
        (fmtStatus4(g.latestStatus) ? makeTagText(fmtStatus4(g.latestStatus)) : null),
        {
          onLeft: () => gotoTimeline(),
          onMid: () => pushDetail('groupDetail', { kind: 'group', key: gid })
        }
      );

      const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
      for (const c of classes) {
        const cid = String(c.class_id);
        const cKeys = tIdx.byClass.get(cid) || [];
        if (cKeys.length === 0) continue;

        addCardLine(
          card,
          (c.class_number != null ? String(c.class_number) : ''),
          String(c.class_name || ''),
          makeTagCount(cKeys.length),
          { onRow: () => pushDetail('classDetail', { kind: 'class', key: cid }) }
        );

        const chips = cKeys
          .map(k => tIdx.entryNext.get(k))
          .filter(Boolean)
          .sort((a, b) => {
            const ka = nextKeyMinutes(a);
            const kb = nextKeyMinutes(b);
            if (ka !== kb) return ka - kb;
            const oa = nextTieOOG(a);
            const ob = nextTieOOG(b);
            if (oa !== ob) return oa - ob;
            return nextTieRing(a) - nextTieRing(b);
          })
          .slice(0, 20)
          .map(t => {
            const horse = (t && t.horseName) ? String(t.horseName).trim() : '';
            const oog = (t && t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG).trim() : '';
            if (!horse || !oog) return '';
            return `${horse} - ${oog}`;
          })
          .filter(Boolean);

        addChipRollup(card, chips, (label) => {
          const horse = String(label).split(' - ')[0].trim();
          if (horse) pushDetail('horseDetail', { kind: 'horse', key: horse });
        });
      }
    }

    screenRoot.appendChild(card);
  }

  function renderGroupDetail(sIdx, tIdx) {
    const gid = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Group');

    if (!gid) return;

    let gObj = null;
    for (const r of sIdx.ringMap.values()) {
      if (r.groups.has(gid)) { gObj = r.groups.get(gid); break; }
    }
    if (!gObj) return;

    const gKeys = tIdx.byGroup.get(gid) || [];
    if (gKeys.length === 0) return;

    const title = `${fmtTimeShort(gObj.latestStart || '')} ${gObj.group_name || ''}`.trim();
    const card = makeCard(title, gKeys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'group';

    const classes = [...gObj.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
    for (const c of classes) {
      const cid = String(c.class_id);
      const cKeys = tIdx.byClass.get(cid) || [];
      if (cKeys.length === 0) continue;

      addCardLine(
        card,
        (c.class_number != null ? String(c.class_number) : ''),
        String(c.class_name || ''),
        makeTagCount(cKeys.length),
        { onRow: () => pushDetail('classDetail', { kind: 'class', key: cid }) }
      );

      const chips = cKeys
        .map(k => tIdx.entryNext.get(k))
        .filter(Boolean)
        .sort((a, b) => {
          const ka = nextKeyMinutes(a);
          const kb = nextKeyMinutes(b);
          if (ka !== kb) return ka - kb;
          const oa = nextTieOOG(a);
          const ob = nextTieOOG(b);
          if (oa !== ob) return oa - ob;
          return nextTieRing(a) - nextTieRing(b);
        })
        .slice(0, 20)
        .map(t => {
          const horse = (t && t.horseName) ? String(t.horseName).trim() : '';
          const oog = (t && t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG).trim() : '';
          if (!horse || !oog) return '';
          return `${horse} - ${oog}`;
        })
        .filter(Boolean);

      addChipRollup(card, chips, (label) => {
        const horse = String(label).split(' - ')[0].trim();
        if (horse) pushDetail('horseDetail', { kind: 'horse', key: horse });
      });
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: RIDERS (list -> detail)
  // ----------------------------
  function renderRiders(_sIdx, tIdx) {
    clearRoot();
    setHeader('Riders');

    screenRoot.appendChild(renderSearch('riders', 'Search riders...'));

    const q = normalizeStr(state.search.riders);
    const ridersAll = [...tIdx.byRider.keys()].sort((a, b) => String(a).localeCompare(String(b)));

    for (const name of ridersAll) {
      const keys = tIdx.byRider.get(name) || [];
      if (keys.length === 0) continue;
      if (q && !normalizeStr(name).includes(q)) continue;

      const next = getNextForEntryKeys(tIdx, keys);
      const nextTime = next ? fmtTimeShort(next.latestGO || next.latestStart || '') : '';

      const row = el('div', 'row row--tap');
      row.id = `rider-${idify(name)}`;
      row.appendChild(el('div', 'row-title', String(name)));

      const right = makeRightTags(
        nextTime ? makeTagText(nextTime) : null,
        makeTagCount(keys.length)
      );
      row.appendChild(right);

      row.addEventListener('click', () => {
        pushDetail('riderDetail', { kind: 'rider', key: String(name) });
      });
      screenRoot.appendChild(row);
    }
  }

  // Rider detail: Schedule-like, but under each class show ENTRY + RIDER line blocks (no rollup chips).
  function renderRiderDetail(sIdx, tIdx) {
    const rider = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader(rider || 'Rider');
    if (!rider) return;

    const entryKeys = (tIdx.byRider.get(rider) || []).slice();
    if (!entryKeys.length) return;

    // ring buckets
    const ringBuckets = new Map();
    for (const k of entryKeys) {
      const t = tIdx.entryNext.get(k);
      const rk = (t && t.ring_number != null) ? String(t.ring_number) : '—';
      if (!ringBuckets.has(rk)) ringBuckets.set(rk, []);
      ringBuckets.get(rk).push(k);
    }

    const ringOrder = [...ringBuckets.keys()].sort((a, b) => safeNum(a, 999999) - safeNum(b, 999999));

    for (const rk of ringOrder) {
      const ringObj = sIdx.ringMap.get(rk);
      const ringName = ringObj ? ringObj.ringName : (rk === '—' ? 'Ring' : `Ring ${rk}`);

      const keysInRing = ringBuckets.get(rk) || [];
      const card = makeCard(ringName, keysInRing.length, true, () => {
        if (rk !== '—') pushDetail('ringDetail', { kind: 'ring', key: rk });
      });
      card.id = `rider-ring-${rk === '—' ? 'x' : rk}`;

      if (!ringObj) {
        // No scaffold: just entry blocks
        const trips = keysInRing.map(k => tIdx.entryNext.get(k)).filter(Boolean).sort((a, b) => {
          const ka = nextKeyMinutes(a);
          const kb = nextKeyMinutes(b);
          if (ka !== kb) return ka - kb;
          const oa = nextTieOOG(a);
          const ob = nextTieOOG(b);
          if (oa !== ob) return oa - ob;
          return nextTieRing(a) - nextTieRing(b);
        });

        for (const t of trips) {
          addEntryBlock(card, t, { showRiderLine: true, riderName: rider });
        }

        screenRoot.appendChild(card);
        continue;
      }

      const groups = [...ringObj.groups.values()].sort((a, b) => {
        const ta = timeToMinutes(a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      });

      for (const g of groups) {
        const gid = String(g.class_group_id);

        const inGroup = keysInRing.filter((k) => {
          const t = tIdx.entryNext.get(k);
          return t && t.class_group_id != null && String(t.class_group_id) === gid;
        });
        if (!inGroup.length) continue;

        const gNext = getNextForEntryKeys(tIdx, inGroup);
        const gLeft = gNext ? fmtTimeShort(gNext.latestGO || gNext.latestStart || g.latestStart || '') : fmtTimeShort(g.latestStart || '');
        const gStatus = fmtStatus4((gNext && gNext.latestStatus) || g.latestStatus);

        addCardLine(card, gLeft, String(g.group_name), gStatus ? makeTagText(gStatus) : null, {
          onLeft: () => gotoTimeline(),
          onMid: () => pushDetail('groupDetail', { kind: 'group', key: gid })
        });

        const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
        for (const c of classes) {
          const cid = String(c.class_id);

          const inClass = inGroup.filter((k) => {
            const t = tIdx.entryNext.get(k);
            return t && t.class_id != null && String(t.class_id) === cid;
          });
          if (!inClass.length) continue;

          addCardLine(
            card,
            (c.class_number != null ? String(c.class_number) : ''),
            String(c.class_name || '').trim(),
            makeTagCount(inClass.length),
            { onRow: () => pushDetail('classDetail', { kind: 'class', key: cid }) }
          );

          // entry blocks
          const trips = inClass
            .map(k => tIdx.entryNext.get(k))
            .filter(Boolean)
            .sort((a, b) => {
              const ka = nextKeyMinutes(a);
              const kb = nextKeyMinutes(b);
              if (ka !== kb) return ka - kb;
              const oa = nextTieOOG(a);
              const ob = nextTieOOG(b);
              if (oa !== ob) return oa - ob;
              return nextTieRing(a) - nextTieRing(b);
            });

          for (const t of trips) {
            addEntryBlock(card, t, { showRiderLine: true, riderName: rider });
          }
        }
      }

      screenRoot.appendChild(card);
    }
  }

  // ----------------------------
  // ENTRY BLOCKS (for Class/Rider details)
  // ----------------------------
  function addEntryBlock(card, trip, opts) {
    if (!trip) return;

    // Entry row: time | horse • rider | status4
    const timeTxt = fmtTimeShort(trip.latestGO || trip.latestStart || '');
    const horse = (trip.horseName != null) ? String(trip.horseName).trim() : '';
    const rider = (trip.riderName != null) ? String(trip.riderName).trim() : '';
    const status4 = fmtStatus4(trip.latestStatus);

    const mid = `${horse}${(horse && rider) ? ' • ' : ''}${rider}`.trim();

    addCardLine(card, timeTxt, mid, status4 ? makeTagText(status4) : null, {
      onLeft: () => gotoTimeline(),
      onMid: () => { if (horse) pushDetail('horseDetail', { kind: 'horse', key: horse }); },
      onRight: () => { if (trip.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(trip.class_id) }); }
    });

    if (opts && opts.showRiderLine) {
      const rn = (opts.riderName || rider || '').trim();
      if (rn) {
        const tag = (trip.backNumber != null && String(trip.backNumber).trim() !== '')
          ? makeTagText(String(trip.backNumber).trim())
          : (trip.lastOOG != null && String(trip.lastOOG).trim() !== '') ? makeTagText(String(trip.lastOOG).trim()) : null;

        addCardLine(card, '', rn, tag, {
          onMid: () => pushDetail('riderDetail', { kind: 'rider', key: rn })
        });
      }
    }
  }

  // ----------------------------
  // SCREEN: CLASS DETAIL
  // ----------------------------
  function renderClassDetail(sIdx, tIdx) {
    const classId = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Class');

    if (!classId) return;

    const schedRec = sIdx.classMap.get(classId);

    const ringLabel = schedRec && schedRec.ringName ? String(schedRec.ringName) : '';
    const groupLabel = schedRec && schedRec.group_name ? String(schedRec.group_name) : '';
    const classNum = schedRec && schedRec.class_number != null ? String(schedRec.class_number) : '';
    const className = schedRec && schedRec.class_name ? String(schedRec.class_name) : `Class ${classId}`;

    const cKeys = tIdx.byClass.get(classId) || [];
    if (cKeys.length === 0) return;

    const title = `${classNum ? classNum + ' • ' : ''}${className}`.trim();
    const card = makeCard(title, cKeys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'class';

    // Add a schedule-like "context" line (ring/group)
    const ctx = `${ringLabel}${(ringLabel && groupLabel) ? ' • ' : ''}${groupLabel}`.trim();
    if (ctx) {
      addCardLine(card, '', ctx, null, {
        onMid: () => {
          const rk = (schedRec && schedRec.ring_number != null) ? String(schedRec.ring_number) : null;
          if (rk) pushDetail('ringDetail', { kind: 'ring', key: rk });
        }
      });
    }

    // Entries sorted by next-upcoming
    const trips = cKeys
      .map(k => tIdx.entryNext.get(k))
      .filter(Boolean)
      .sort((a, b) => {
        const ka = nextKeyMinutes(a);
        const kb = nextKeyMinutes(b);
        if (ka !== kb) return ka - kb;
        const oa = nextTieOOG(a);
        const ob = nextTieOOG(b);
        if (oa !== ob) return oa - ob;
        return nextTieRing(a) - nextTieRing(b);
      });

    // Replace rollup with ENTRY + RIDER line blocks
    for (const t of trips) {
      addEntryBlock(card, t, { showRiderLine: true });
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: TIMELINE
  // ----------------------------
  function renderTimeline(_sIdx, tIdx) {
    clearRoot();
    setHeader('Timeline');

    // timeline anchor hook
    const anchor = el('div', { id: 'timeline' });
    screenRoot.appendChild(anchor);

    const dt = state.meta.dt;
    if (!dt) {
      screenRoot.appendChild(el('div', 'row', 'No dt found in payload.'));
      return;
    }

    const DAY_START_MIN = 8 * 60;
    const DAY_END_MIN = 18 * 60;
    const SLOT_MIN = 30;

    const PX_PER_MIN = 4;

    // ✅ horse column max 60px
    const GUTTER_PX = 60;

    const root = el('div', 'screen');

    let horses = [...tIdx.byHorse.keys()];
    horses.sort((a, b) => String(a).localeCompare(String(b)));

    const viewport = el('div', 'timeline-viewport');
    const grid = el('div', 'timeline-grid');

    const dayWidth = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
    grid.style.width = `${GUTTER_PX + dayWidth}px`;

    const axis = el('div', 'timeline-axis');
    const axisLeft = el('div', 'timeline-axis-left', 'Horse');
    axis.appendChild(axisLeft);

    const axisRight = el('div', 'timeline-axis-right');
    axisRight.style.width = `${dayWidth}px`;

    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += SLOT_MIN) {
      const cell = el('div', 'timeline-axis-cell', fmtClockFromMinutes(m));
      cell.style.left = `${(m - DAY_START_MIN) * PX_PER_MIN}px`;
      cell.style.width = `${SLOT_MIN * PX_PER_MIN}px`;
      axisRight.appendChild(cell);
    }

    axis.appendChild(axisRight);
    grid.appendChild(axis);

    const rowsWrap = el('div', 'timeline-rows');

    horses.forEach((horseName) => {
      const entryKeys = tIdx.byHorse.get(String(horseName)) || [];
      if (!entryKeys.length) return;

      const row = el('div', 'timeline-row');

      const left = el('div', 'timeline-horse');
      left.appendChild(el('div', 'timeline-horse-name', String(horseName)));
      left.addEventListener('click', () => pushDetail('horseDetail', { kind: 'horse', key: String(horseName) }));
      row.appendChild(left);

      const lane = el('div', 'timeline-lane');
      lane.style.width = `${dayWidth}px`;

      const cards = entryKeys
        .map((k) => tIdx.entryNext.get(k))
        .filter(Boolean)
        .map((it) => {
          const t = parseTripStartEnd(it, { dt });
          if (!t || !t.start || !t.end) return null;

          const st = t.start.getHours() * 60 + t.start.getMinutes();
          const en = t.end.getHours() * 60 + t.end.getMinutes();

          const startMin = Math.max(DAY_START_MIN, st);
          const endMin = Math.min(DAY_END_MIN, Math.max(startMin + 5, en));

          if (endMin <= DAY_START_MIN || startMin >= DAY_END_MIN) return null;
          return { it, startMin, endMin };
        })
        .filter(Boolean)
        .sort((a, b) => (a.startMin - b.startMin) || (safeNum(a.it.lastOOG, 999999) - safeNum(b.it.lastOOG, 999999)));

      // ✅ de-dupe: only first card if same startMin
      const seenStart = new Set();
      cards.forEach(({ it, startMin, endMin }) => {
        if (seenStart.has(startMin)) return;
        seenStart.add(startMin);

        const c = el('div', 'timeline-card');
        c.style.left = `${(startMin - DAY_START_MIN) * PX_PER_MIN}px`;
        c.style.width = `${Math.max(120, (endMin - startMin) * PX_PER_MIN)}px`;

        // compact grid-like content
        const r1 = el('div', 'timeline-card-row');
        r1.appendChild(el('span', 'timeline-cell timeline-cell--num', (it.class_number != null ? String(it.class_number) : '—')));
        r1.appendChild(el('span', 'timeline-cell timeline-cell--name', String(it.class_name || '').trim()));
        r1.appendChild(el('span', 'timeline-cell timeline-cell--sp', ''));
        r1.appendChild(el('span', 'timeline-cell timeline-cell--st', fmtStatus4(it.latestStatus)));
        c.appendChild(r1);

        const r2 = el('div', 'timeline-card-row');
        r2.appendChild(el('span', 'timeline-cell timeline-cell--time', fmtTimeShort(it.latestStart || it.latestGO || '')));
        const ringTxt = String(it.ringName || (it.ring_number != null ? `Ring ${it.ring_number}` : '')).slice(0, 6);
        r2.appendChild(el('span', 'timeline-cell timeline-cell--ring', ringTxt));
        r2.appendChild(el('span', 'timeline-cell timeline-cell--go', fmtTimeShort(it.latestGO || '')));
        r2.appendChild(el('span', 'timeline-cell timeline-cell--oog', (it.lastOOG != null ? String(it.lastOOG) : '')));
        c.appendChild(r2);

        c.addEventListener('click', () => {
          if (it.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(it.class_id) });
        });

        lane.appendChild(c);
      });

      row.appendChild(lane);
      rowsWrap.appendChild(row);
    });

    grid.appendChild(rowsWrap);
    viewport.appendChild(grid);
    root.appendChild(viewport);
    screenRoot.appendChild(root);
  }

  // ----------------------------
  // ROUTER
  // ----------------------------
  function render() {
    if (!screenRoot || !headerTitle) return;

    const sIdx = buildScheduleIndex();
    const tIdx = buildTruthIndex();

    renderAggs(sIdx, tIdx);

    const primary = getPrimaryForScreen(state.screen);
    setNavActive(primary);

    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
    if (headerAction) headerAction.hidden = true;

    if (state.screen === 'schedule') {
      const hash = (location.hash || '').replace('#', '');
      if (hash && /^ring-\d+$/i.test(hash)) state.pendingScrollId = hash;
      else state.pendingScrollId = null;
    } else {
      state.pendingScrollId = null;
    }

    if (state.screen === 'start') return renderStart();
    if (state.screen === 'horses') return renderHorses(sIdx, tIdx);
    if (state.screen === 'schedule' || state.screen === 'rings') return renderSchedule(sIdx, tIdx);
    if (state.screen === 'timeline') return renderTimeline(sIdx, tIdx);

    if (state.screen === 'ringDetail') return renderRingDetail(sIdx, tIdx);
    if (state.screen === 'groupDetail') return renderGroupDetail(sIdx, tIdx);
    if (state.screen === 'classDetail') return renderClassDetail(sIdx, tIdx);

    if (state.screen === 'riders') return renderRiders(sIdx, tIdx);
    if (state.screen === 'riderDetail') return renderRiderDetail(sIdx, tIdx);

    if (state.screen === 'horseDetail') return renderHorseDetail(sIdx, tIdx);

    state.screen = 'start';
    renderStart();
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  if (headerBack) headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const tapped = btn.dataset.screen;

      state.history = [];
      state.detail = null;

      if (tapped === 'schedule') state.screen = 'schedule';
      else if (tapped === 'rings') state.screen = 'schedule';
      else state.screen = tapped;

      render();
    });
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  loadAll().catch(() => { });
  render();
})();
