// app.js — CRT Daily Show (Legacy UI contract + Cards + Peaks + Schedule/Timeline modes)
//
// Data:
//   ./data/latest/watch_schedule.json (context scaffold)
//   ./data/latest/watch_trips.json    (truth overlay)
//
// Bottom nav:
//   Start, Active Horses, Schedule(A/F), Timeline(A/F), Rings, Classes, Riders
//
// Notes (per spec):
// - Aggs computed from trips truth only.
// - Schedule is context only; does not affect aggs.
// - Active Horses list taps into Horse Detail; toggle active only in detail.
// - Peaks are sticky + horizontally scrollable; each peak shows agg count.
// - Ring cards:
//   group-line: time | group_name | agg
//   class-line: time | class_name | agg
//   entry-line: horseName | oogNumber (just "31", not "OOG 31"), deduped (earliest GO / smallest OOG)

(function () {
  'use strict';

  // ----------------------------
  // CONFIG
  // ----------------------------
  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // ----------------------------
  // DOM
  // ----------------------------
  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const navRow = document.getElementById('nav-row');

  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    // global mode for Rings/Classes/Riders (A/F)
    scopeMode: 'ACTIVE',   // ACTIVE | FULL

    // schedule-only mode
    scheduleMode: 'ACTIVE', // ACTIVE | FULL

    // primary nav
    screen: 'start',
    history: [], // detail stack
    detail: null, // { kind, key }

    // followed horses (active set) — defaults to all
    activeHorses: new Set(),

    // per-screen search
    search: {
      horses: '',
      rings: '',
      classes: '',
      riders: '',
      schedule: '',
      timeline: ''
    }
  };

  // ----------------------------
  // UTIL
  // ----------------------------

  // Flexible element helper:
  // - el('div','cls','text')
  // - el('div',{ className:'cls', text:'hi', id:'x', attrs:{...} })
  function el(tag, clsOrOpts, text) {
    const n = document.createElement(tag);

    if (clsOrOpts && typeof clsOrOpts === 'object' && !Array.isArray(clsOrOpts)) {
      const o = clsOrOpts;
      if (o.className) n.className = o.className;
      if (o.text != null) n.textContent = o.text;
      if (o.id) n.id = o.id;
      if (o.href != null) n.setAttribute('href', o.href);
      if (o.type) n.setAttribute('type', o.type);
      if (o.placeholder != null) n.setAttribute('placeholder', o.placeholder);
      if (o.value != null) n.value = o.value;
      if (o.hidden != null) n.hidden = !!o.hidden;
      if (o.attrs && typeof o.attrs === 'object') {
        for (const [k, v] of Object.entries(o.attrs)) {
          if (v == null) continue;
          n.setAttribute(k, String(v));
        }
      }
      return n;
    }

    if (clsOrOpts) n.className = clsOrOpts;
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

  function uniqStrings(list) {
    const out = [];
    const seen = new Set();
    for (const v of list) {
      if (v == null) continue;
      const s = String(v);
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
  }

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
  }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title || '';
    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
  }

  function setHeaderAction(label, show) {
    if (!headerAction) return;
    headerAction.hidden = !show;
    if (show) headerAction.textContent = label || 'Next';
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

  function setModePills() {
    document.querySelectorAll('[data-mode-pill]').forEach(pill => {
      const screen = pill.getAttribute('data-mode-pill');
      if (screen === 'timeline') {
        pill.textContent = 'A';
        pill.classList.add('nav-agg--positive');
        return;
      }
      const isFull = state.scheduleMode === 'FULL' && state.screen === 'schedule'
        ? true
        : (state.scopeMode === 'FULL');

      // Schedule has its own mode; others use scopeMode
      if (state.screen === 'schedule') {
        const sFull = state.scheduleMode === 'FULL';
        pill.textContent = sFull ? 'F' : 'A';
        pill.classList.toggle('nav-agg--positive', !sFull);
      } else {
        const full = state.scopeMode === 'FULL';
        pill.textContent = full ? 'F' : 'A';
        pill.classList.toggle('nav-agg--positive', !full);
      }
    });
  }

  // Parse "h:mm AM" into minutes since midnight (for ordering)
  function timeToMinutes(t) {
    if (!t) return null;
    const s = String(t).trim();
    // Accept: '12:15 PM', '12:15PM', '12:15pm', '12:15p'
    const m = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp])\s*([Mm])?$/);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'A') {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return hh * 60 + mm;
  }

  function fmtClockDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function fmtClockFromMinutes(totalMinutes) {
    const mins = Math.max(0, Math.floor(totalMinutes));
    const h24 = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    let h = h24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  // Normalize / display time strings (accepts "HH:mm:ss", "HH:mm", or "h:mm AM/PM")
  function fmtTime(t) {
    const s = String(t || '').trim();
    if (!s) return '';
    // Already AM/PM
    if (/(AM|PM)$/i.test(s)) {
      return s.replace(/\s+/g, ' ').trim();
    }
    // 24h "HH:mm:ss" or "HH:mm"
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return s;
    let hh = parseInt(m[1], 10);
    const mm = m[2];
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${mm} ${ampm}`;
  }

  // Parse dt + time (time may be "h:mm AM/PM" or "HH:mm(:ss)")
  function parseLocalDateTime(dt, timeStr) {
    const dtS = String(dt || '').trim();
    const tS = String(timeStr || '').trim();
    if (!dtS || !tS) return null;

    // AM/PM
    const mins = timeToMinutes(fmtTime(tS));
    if (mins != null) {
      const hh = Math.floor(mins / 60);
      const mm = mins % 60;
      const d = new Date(`${dtS}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
      return isNaN(d.getTime()) ? null : d;
    }

    // 24h
    const m = tS.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const d = new Date(`${dtS}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  const DUR_PER_TRIP_SEC = 149; // 2 minutes 29 seconds

  function roundUpTo5Minutes(d) {
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(d.getTime() / ms) * ms);
  }

  function safeNumber(v, fallback = null) {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;

    const s = String(v).trim();
    if (!s) return fallback;

    const n = Number(s.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function safeNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback ?? null);
  }

  function parseTripStartEnd(trip, dtFallback, opts) {
    // Back-compat: if caller passed (trip, {preferCalendar:true}) by mistake
    let dt = dtFallback;
    let options = opts || {};
    if (dtFallback && typeof dtFallback === 'object') {
      options = dtFallback;
      dt = null;
    }

    // Always prefer dataset dt (single-day app)
    const dtScope = String((dt || trip.dt || state.meta.dt || '')).trim();

    let start = null;

    if (options && options.preferCalendar && trip.latest_calendar_start) {
      // 'YYYY-MM-DD 12:15pm'
      const m = String(trip.latest_calendar_start).trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      start = m ? parseLocalDateTime(m[1], m[2]) : null;
    }

    if (!start && dtScope && (trip.latestStart || trip.latestGO)) {
      // prefer latestGO for timing if present; fallback latestStart
      const t = trip.latestGO || trip.latestStart;
      start = parseLocalDateTime(dtScope, fmtTime(t));
    }

    if (!start) return { start: null, end: null };

    let end = null;

    if (options && options.preferCalendar && trip.latest_calendar_end) {
      const m = String(trip.latest_calendar_end).trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      end = m ? parseLocalDateTime(m[1], m[2]) : null;
    }

    if (!end) {
      const tripsCount = safeNumber(trip.total_trips, 1);
      const ms = tripsCount * DUR_PER_TRIP_SEC * 1000;
      end = new Date(start.getTime() + ms);
    }

    end = roundUpTo5Minutes(end);
    return { start, end };
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
      (trips && trips.meta && trips.meta.dt) ||
      (state.trips[0] && state.trips[0].dt) ||
      null;

    const sidScope =
      (sched && sched.meta && sched.meta.sid) ||
      (state.schedule[0] && state.schedule[0].sid) ||
      (trips && trips.meta && trips.meta.sid) ||
      (state.trips[0] && state.trips[0].sid) ||
      null;

    state.meta = { dt: dtScope, sid: sidScope, generated_at: nextGenerated };

    // seed active horses once (default all active)
    if (state.activeHorses.size === 0) {
      const horses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
        .sort((a, b) => a.localeCompare(b));
      horses.forEach(h => state.activeHorses.add(h));
    }

    state.loaded = true;
    render();
  }

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ----------------------------
  // INDEXES (schedule scaffold + trips truth)
  // ----------------------------
  function buildScheduleIndex() {
    const ringMap = new Map(); // ring_number string -> { ring_number, ringName, groups: Map }
    const groupMap = new Map(); // class_group_id string -> groupObj
    const classMap = new Map(); // class_id string -> scheduleRec (first)

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
        const gObj = {
          class_group_id: gid,
          group_name: r.group_name || r.class_name || '(Group)',
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null,
          classes: new Map()
        };
        ringObj.groups.set(gidKey, gObj);
        groupMap.set(gidKey, gObj);
      }
      const gObj = ringObj.groups.get(gidKey);

      const cidKey = String(cid);
      if (!gObj.classes.has(cidKey)) {
        const cObj = {
          class_id: cid,
          class_number: r.class_number,
          class_name: r.class_name || '(Class)',
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null
        };
        gObj.classes.set(cidKey, cObj);
      }

      if (!classMap.has(cidKey)) classMap.set(cidKey, r);
    }

    return { ringMap, groupMap, classMap };
  }

  // Dedup entries by (class_id|horseName), choosing earliest GO then smallest OOG
  function pickBestTrip(tripsList) {
    if (!tripsList || tripsList.length === 0) return null;

    let best = null;
    let bestT = 999999;
    let bestO = 999999;

    for (const t of tripsList) {
      const goM = timeToMinutes(t && (t.latestGO || t.latestStart)) ?? 999999;
      const oog = (t && t.lastOOG != null) ? safeNum(t.lastOOG, 999999) : 999999;

      if (!best) {
        best = t; bestT = goM; bestO = oog;
        continue;
      }

      if (goM < bestT) { best = t; bestT = goM; bestO = oog; continue; }
      if (goM === bestT && oog < bestO) { best = t; bestT = goM; bestO = oog; continue; }
    }

    return best;
  }

  function buildTruthIndex(opts = {}) {
    const mode = (opts.mode ?? state.scopeMode);
    const ignoreActive = !!opts.ignoreActive;

    const includedTrip = (t) => {
      if (!t) return false;

      if (!ignoreActive && mode === 'ACTIVE') {
        const h = t.horseName ? String(t.horseName) : null;
        if (!h) return false;
        if (!state.activeHorses.has(h)) return false;
      }
      return true;
    };

    // group trips by entryKey
    const byEntryKey = new Map(); // `${class_id}|${horseName}` -> trips[]
    const byHorse = new Map();    // horseName -> entryKey[]
    const byRing = new Map();     // ring_number string -> entryKey[]
    const byGroup = new Map();    // class_group_id string -> entryKey[]
    const byClass = new Map();    // class_id string -> entryKey[]
    const byRider = new Map();    // riderName -> entryKey[]

    function pushKey(map, k, entryKey) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(entryKey);
    }

    for (const t of (state.trips || [])) {
      if (!includedTrip(t)) continue;

      const horse = t.horseName ? String(t.horseName) : null;
      const cid = t.class_id != null ? String(t.class_id) : null;
      if (!horse || !cid) continue;

      const entryKey = `${cid}|${horse}`;

      if (!byEntryKey.has(entryKey)) byEntryKey.set(entryKey, []);
      byEntryKey.get(entryKey).push(t);

      pushKey(byHorse, horse, entryKey);

      if (t.ring_number != null) pushKey(byRing, String(t.ring_number), entryKey);
      if (t.class_group_id != null) pushKey(byGroup, String(t.class_group_id), entryKey);
      pushKey(byClass, cid, entryKey);

      if (t.riderName) pushKey(byRider, String(t.riderName), entryKey);
    }

    // best trip per entryKey
    const entryBest = new Map();
    for (const [k, list] of byEntryKey.entries()) {
      entryBest.set(k, pickBestTrip(list));
    }

    // de-dupe entryKey lists
    function uniqKeys(arr) {
      const out = [];
      const seen = new Set();
      for (const k of (arr || [])) {
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      }
      return out;
    }

    for (const [k, arr] of byHorse.entries()) byHorse.set(k, uniqKeys(arr));
    for (const [k, arr] of byRing.entries()) byRing.set(k, uniqKeys(arr));
    for (const [k, arr] of byGroup.entries()) byGroup.set(k, uniqKeys(arr));
    for (const [k, arr] of byClass.entries()) byClass.set(k, uniqKeys(arr));
    for (const [k, arr] of byRider.entries()) byRider.set(k, uniqKeys(arr));

    return { includedTrip, byEntryKey, entryBest, byHorse, byRing, byGroup, byClass, byRider };
  }

  // ----------------------------
  // RENDER HELPERS
  // ----------------------------
  function makeTagCount(n) {
    const t = el('div', 'row-tag row-tag--count', String(n));
    if (Number(n) > 0) t.classList.add('row-tag--positive');
    return t;
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

  // Peak bar = ANCHOR navigation
  function renderPeakBar(items, _selectedSet, onToggle) {
    const root = el('div', 'peakbar');
    const scroller = el('div', 'nav-scroller');
    const row = el('div', 'nav-row peakbar-row');

    (items || []).forEach((it) => {
      const cls = 'nav-btn' + (it.primary ? ' nav-btn--primary' : '');
      const href = it.href || (it.key ? `#${String(it.key)}` : '#');
      const a = el('a', { className: cls, href });

      a.appendChild(el('span', { className: 'nav-label', text: it.label }));

      if (typeof it.agg === 'number') {
        const aggCls = 'nav-agg' + (it.agg > 0 ? ' nav-agg--positive' : '');
        a.appendChild(el('span', { className: aggCls, text: String(it.agg) }));
      }

      a.addEventListener('click', (ev) => {
        if (typeof onToggle === 'function') {
          ev.preventDefault();
          onToggle(it.key);
          return;
        }
        const hash = (href || '').split('#')[1] || '';
        if (!hash) return;
        ev.preventDefault();
        const target = document.getElementById(hash);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function addCardLine(card, timeTxt, nameTxt, aggNode, onClick) {
    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    const t = el('div', 'c-time', timeTxt || '');
    const n = el('div', 'c-name', nameTxt || '');

    line.appendChild(t);
    line.appendChild(n);

    const a = el('div', 'c-agg');
    if (aggNode) a.appendChild(aggNode);
    line.appendChild(a);

    if (onClick) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    }

    body.appendChild(line);
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

  function pushDetail(screen, detail) {
    state.history.push({ screen: state.screen, detail: state.detail });
    state.screen = screen;
    state.detail = detail;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return;
    state.screen = prev.screen;
    state.detail = prev.detail;
    render();
  }

  function nextPrimaryScreen() {
    const order = ['start', 'horses', 'rings', 'classes', 'riders', 'timeline', 'schedule'];
    const primary = getPrimaryForScreen(state.screen);
    const i = order.indexOf(primary);
    const next = order[(i + 1 + order.length) % order.length];
    goto(next);
  }

  function getPrimaryForScreen(screen) {
    const map = {
      start: 'start',
      horses: 'horses',
      schedule: 'schedule',
      timeline: 'timeline',
      rings: 'rings',
      classes: 'classes',
      riders: 'riders',

      ringDetail: 'rings',
      groupDetail: 'rings',
      classDetail: 'classes',
      riderDetail: 'riders',
      horseDetail: 'horses'
    };
    return map[screen] || 'start';
  }

  // ----------------------------
  // AGGS (truth only)
  // ----------------------------
  function renderAggs(_sIdx, tIdx) {
    setAgg('horses', state.activeHorses.size);
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
    setHeaderAction('Next', true);

    const wrap = el('div', 'list-column');

    const logo = el('div', 'start-logo');
    logo.appendChild(el('div', 'start-logo-title', 'CRT Daily Show'));
    const sub = state.loaded ? `sid ${state.meta.sid || '-'} • ${state.meta.dt || '-'}` : 'Loading schedule...';
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
        try { await loadAll(); } catch (_) {}
      }
      goto('horses');
    });
    wrap.appendChild(btn);

    screenRoot.appendChild(wrap);
  }

  // ----------------------------
  // SCREEN: ACTIVE HORSES (list -> detail)
  // ----------------------------
  function renderHorses(_sIdx, tIdx) {
    clearRoot();
    setHeader('Active Horses');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('horses', 'Search horses...'));

    const q = normalizeStr(state.search.horses);
    const horsesAll = uniqStrings((state.trips || []).map(t => t && t.horseName).filter(Boolean))
      .sort((a, b) => a.localeCompare(b));

    const horses = q ? horsesAll.filter(h => normalizeStr(h).includes(q)) : horsesAll;

    for (const h of horses) {
      const row = el('div', 'row row--tap');
      row.id = `horse-${idify(h)}`;
      const active = state.activeHorses.has(String(h));
      if (active) row.classList.add('row--active');

      row.appendChild(el('div', 'row-title', String(h)));

      const keys = tIdx.byHorse.get(String(h)) || [];
      row.appendChild(makeTagCount(keys.length));

      row.addEventListener('click', () => {
        pushDetail('horseDetail', { kind: 'horse', key: String(h) });
      });

      screenRoot.appendChild(row);
    }
  }

  function renderHorseDetail(_sIdx, tIdx) {
    const horse = state.detail && state.detail.key ? String(state.detail.key) : null;

    clearRoot();
    setHeader(horse || 'Horse');
    setHeaderAction('Next', true);

    if (!horse) return;

    const toggle = el('div', 'row row--tap');
    toggle.appendChild(el('div', 'row-title', state.activeHorses.has(horse) ? 'Active' : 'Inactive'));
    toggle.appendChild(el('div', 'row-tag row-tag--count', state.activeHorses.has(horse) ? 'ON' : 'OFF'));
    toggle.addEventListener('click', () => {
      if (state.activeHorses.has(horse)) state.activeHorses.delete(horse);
      else state.activeHorses.add(horse);
      render();
    });
    screenRoot.appendChild(toggle);

    const entryKeys = (tIdx.byHorse.get(horse) || []).slice();
    const bestTrips = entryKeys
      .map(k => tIdx.entryBest.get(k))
      .filter(Boolean)
      .sort((a, b) => {
        const ta = timeToMinutes(a.latestGO || a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestGO || b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        const ra = safeNum(a.ring_number, 999999);
        const rb = safeNum(b.ring_number, 999999);
        if (ra !== rb) return ra - rb;
        return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
      });

    for (const t of bestTrips) {
      const left = `${t.latestGO || t.latestStart || ''} • Ring ${t.ring_number != null ? t.ring_number : ''} • ${t.class_number || ''}`.trim();
      const right = (t.lastOOG != null) ? String(t.lastOOG) : '';
      const row = el('div', 'row');
      row.appendChild(el('div', 'row-title', left || ' '));
      row.appendChild(el('div', 'row-tag row-tag--count', right || ''));
      screenRoot.appendChild(row);
    }
  }

  // ----------------------------
  // SCREEN: RINGS
  // ----------------------------
  function buildRingPeakItems(sIdx, tIdx, ringList) {
    return ringList.map(r => {
      const rk = String(r.ring_number);
      const entryKeys = tIdx.byRing.get(rk) || [];
      return { key: rk, label: String(r.ringName), agg: entryKeys.length, href: `#ring-${rk}`, primary: entryKeys.length > 0 };
    });
  }

  function ringVisibleInMode(tIdx, ringNumberStr) {
    if (state.scopeMode === 'FULL') return true;
    const entryKeys = tIdx.byRing.get(String(ringNumberStr)) || [];
    return entryKeys.length > 0;
  }

  function renderRings(sIdx, tIdx) {
    clearRoot();
    setHeader('Rings');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('rings', 'Search rings...'));

    const ringsAll = [...sIdx.ringMap.values()].sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));

    const peakItems = buildRingPeakItems(sIdx, tIdx, ringsAll);
    screenRoot.appendChild(renderPeakBar(peakItems, null, null));

    const q = normalizeStr(state.search.rings);
    const visible = ringsAll
      .filter(r => ringVisibleInMode(tIdx, String(r.ring_number)))
      .filter(r => (q ? normalizeStr(r.ringName).includes(q) : true));

    for (const r of visible) {
      const rk = String(r.ring_number);
      const ringEntryKeys = tIdx.byRing.get(rk) || [];
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
        if (state.scopeMode === 'ACTIVE' && gKeys.length === 0) continue;

        addCardLine(card, g.latestStart || '', String(g.group_name), makeTagCount(gKeys.length), () => {
          pushDetail('groupDetail', { kind: 'group', key: gid });
        });

        const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
        for (const c of classes) {
          const cid = String(c.class_id);
          const cKeys = tIdx.byClass.get(cid) || [];
          if (state.scopeMode === 'ACTIVE' && cKeys.length === 0) continue;

          const classLabel = `${c.class_number || ''} ${c.class_name || ''}`.trim();
          addCardLine(card, c.latestStart || '', classLabel, makeTagCount(cKeys.length), () => {
            pushDetail('classDetail', { kind: 'class', key: cid });
          });

          const bestTrips = cKeys
            .map(k => tIdx.entryBest.get(k))
            .filter(Boolean)
            .sort((a, b) => {
              const ta = timeToMinutes(a.latestGO || a.latestStart) ?? 999999;
              const tb = timeToMinutes(b.latestGO || b.latestStart) ?? 999999;
              if (ta !== tb) return ta - tb;
              return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
            })
            .slice(0, 6);

          for (const bt of bestTrips) {
            const horseName = bt.horseName ? String(bt.horseName) : '';
            const oog = (bt.lastOOG != null) ? String(bt.lastOOG) : '';
            addCardLine(card, '', horseName, (oog ? makeTagCount(oog) : null), () => {
              if (horseName) pushDetail('horseDetail', { kind: 'horse', key: horseName });
            });
          }
        }
      }

      screenRoot.appendChild(card);
    }
  }

  function renderRingDetail(sIdx, tIdx) {
    const rk = state.detail && state.detail.key ? String(state.detail.key) : null;
    const ringObj = rk ? sIdx.ringMap.get(rk) : null;

    clearRoot();
    setHeader(ringObj ? ringObj.ringName : 'Ring');
    setHeaderAction('Next', true);

    if (!ringObj) return;

    const ringEntryKeys = tIdx.byRing.get(rk) || [];
    const card = makeCard(ringObj.ringName, ringEntryKeys.length, true, null);

    const groups = [...ringObj.groups.values()].sort((a, b) => {
      const ta = timeToMinutes(a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.group_name).localeCompare(String(b.group_name));
    });

    for (const g of groups) {
      const gid = String(g.class_group_id);
      const gKeys = tIdx.byGroup.get(gid) || [];
      if (state.scopeMode === 'ACTIVE' && gKeys.length === 0) continue;

      addCardLine(card, g.latestStart || '', String(g.group_name), makeTagCount(gKeys.length), null);

      const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
      for (const c of classes) {
        const cid = String(c.class_id);
        const cKeys = tIdx.byClass.get(cid) || [];
        if (state.scopeMode === 'ACTIVE' && cKeys.length === 0) continue;

        const classLabel = `${c.class_number || ''} ${c.class_name || ''}`.trim();
        addCardLine(card, c.latestStart || '', classLabel, makeTagCount(cKeys.length), () => {
          pushDetail('classDetail', { kind: 'class', key: cid });
        });

        const bestTrips = cKeys
          .map(k => tIdx.entryBest.get(k))
          .filter(Boolean)
          .sort((a, b) => {
            const ta = timeToMinutes(a.latestGO || a.latestStart) ?? 999999;
            const tb = timeToMinutes(b.latestGO || b.latestStart) ?? 999999;
            if (ta !== tb) return ta - tb;
            return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
          });

        for (const bt of bestTrips) {
          const horseName = bt.horseName ? String(bt.horseName) : '';
          const oog = (bt.lastOOG != null) ? String(bt.lastOOG) : '';
          addCardLine(card, '', horseName, (oog ? makeTagCount(oog) : null), () => {
            if (horseName) pushDetail('horseDetail', { kind: 'horse', key: horseName });
          });
        }
      }
    }

    screenRoot.appendChild(card);
  }

  function renderGroupDetail(sIdx, tIdx) {
    const gid = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Group');
    setHeaderAction('Next', true);

    if (!gid) return;

    let gObj = null;
    for (const r of sIdx.ringMap.values()) {
      if (r.groups.has(gid)) { gObj = r.groups.get(gid); break; }
    }
    if (!gObj) return;

    const gKeys = tIdx.byGroup.get(gid) || [];
    const card = makeCard(`${gObj.latestStart || ''} ${gObj.group_name || ''}`.trim(), gKeys.length, true, null);

    const classes = [...gObj.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
    for (const c of classes) {
      const cid = String(c.class_id);
      const cKeys = tIdx.byClass.get(cid) || [];
      if (state.scopeMode === 'ACTIVE' && cKeys.length === 0) continue;

      const classLabel = `${c.class_number || ''} ${c.class_name || ''}`.trim();
      addCardLine(card, c.latestStart || '', classLabel, makeTagCount(cKeys.length), () => {
        pushDetail('classDetail', { kind: 'class', key: cid });
      });
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: CLASSES
  // ----------------------------
  function renderClasses(sIdx, tIdx) {
    clearRoot();
    setHeader('Classes');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('classes', 'Search classes...'));

    const groupsAll = [];
    for (const r of sIdx.ringMap.values()) for (const g of r.groups.values()) groupsAll.push(g);

    const peakItems = groupsAll
      .sort((a, b) => {
        const ta = timeToMinutes(a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      })
      .map(g => {
        const gid = String(g.class_group_id);
        const keys = tIdx.byGroup.get(gid) || [];
        return { key: gid, label: String(g.group_name), agg: keys.length, href: `#group-${gid}`, primary: keys.length > 0 };
      });

    screenRoot.appendChild(renderPeakBar(peakItems, null, null));

    const q = normalizeStr(state.search.classes);
    const visible = peakItems
      .filter(it => (state.scopeMode === 'FULL' ? true : (it.agg > 0)))
      .filter(it => (q ? normalizeStr(it.label).includes(q) : true));

    for (const it of visible) {
      const row = el('div', 'row row--tap');
      row.id = `group-${idify(it.key)}`;
      row.appendChild(el('div', 'row-title', it.label));
      row.appendChild(makeTagCount(it.agg));
      row.addEventListener('click', () => {
        pushDetail('groupDetail', { kind: 'group', key: it.key });
      });
      screenRoot.appendChild(row);
    }
  }

  function renderClassDetail(sIdx, tIdx) {
    const classId = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Class');
    setHeaderAction('Next', true);

    if (!classId) return;

    const schedRec = sIdx.classMap.get(classId);
    const title = schedRec && schedRec.class_name ? String(schedRec.class_name) : `Class ${classId}`;

    const cKeys = tIdx.byClass.get(classId) || [];
    const card = makeCard(title, cKeys.length, true, null);

    const bestTrips = cKeys
      .map(k => tIdx.entryBest.get(k))
      .filter(Boolean)
      .sort((a, b) => {
        const ta = timeToMinutes(a.latestGO || a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestGO || b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
      });

    for (const bt of bestTrips) {
      const horseName = bt.horseName ? String(bt.horseName) : '';
      const oog = (bt.lastOOG != null) ? String(bt.lastOOG) : '';
      addCardLine(card, bt.latestGO || bt.latestStart || '', horseName, (oog ? makeTagCount(oog) : null), () => {
        if (horseName) pushDetail('horseDetail', { kind: 'horse', key: horseName });
      });
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: RIDERS
  // ----------------------------
  function renderRiders(_sIdx, tIdx) {
    clearRoot();
    setHeader('Riders');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('riders', 'Search riders...'));

    const ridersAll = [...tIdx.byRider.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    const peakItems = ridersAll.map(name => {
      const keys = tIdx.byRider.get(name) || [];
      return { key: String(name), label: String(name), agg: keys.length, href: `#rider-${idify(name)}`, primary: keys.length > 0 };
    });

    screenRoot.appendChild(renderPeakBar(peakItems, null, null));

    const q = normalizeStr(state.search.riders);
    const visible = peakItems
      .filter(it => (state.scopeMode === 'FULL' ? true : (it.agg > 0)))
      .filter(it => (q ? normalizeStr(it.label).includes(q) : true));

    for (const it of visible) {
      const row = el('div', 'row row--tap');
      row.id = `rider-${idify(it.key)}`;
      row.appendChild(el('div', 'row-title', it.label));
      row.appendChild(makeTagCount(it.agg));
      row.addEventListener('click', () => {
        pushDetail('riderDetail', { kind: 'rider', key: it.key });
      });
      screenRoot.appendChild(row);
    }
  }

  function renderRiderDetail(_sIdx, tIdx) {
    const rider = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader(rider || 'Rider');
    setHeaderAction('Next', true);

    if (!rider) return;

    const keys = tIdx.byRider.get(rider) || [];
    const card = makeCard(rider, keys.length, true, null);

    const pairs = keys
      .map(k => [k, tIdx.entryBest.get(k)])
      .filter(([, t]) => Boolean(t));

    pairs.sort(([, a], [, b]) => {
      const ta = timeToMinutes(a.latestGO || a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestGO || b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      const ra = safeNum(a.ring_number, 999999);
      const rb = safeNum(b.ring_number, 999999);
      if (ra !== rb) return ra - rb;
      return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
    });

    const normStatus = (v) => normalizeStr(v || '');
    const ringLabelOf = (t) => (t.ringName ? String(t.ringName) : (t.ring_number != null ? `Ring ${t.ring_number}` : 'Ring'));
    const timeLabelOf = (t) => String(t.latestGO || t.latestStart || '').trim();

    const firstPair = pairs.length ? pairs[0] : null;
    const nextPair = pairs.find(([, t]) => {
      const st = normStatus(t.latestStatus);
      return st && !st.startsWith('completed');
    }) || null;

    if (nextPair) {
      const [, nt] = nextPair;
      const sub = el('div', 'card-hdr-sub', `Next: ${ringLabelOf(nt)} • ${timeLabelOf(nt)}`.trim());
      const hdr = card.querySelector('.card-hdr');
      if (hdr) hdr.appendChild(sub);
    }

    const body = card.querySelector('.card-body');
    if (body) {
      const hdrRow = el('div', 'entry-grid-hdr');
      hdrRow.appendChild(el('div', 'entry-cell entry-cell--muted', 'Time'));
      hdrRow.appendChild(el('div', 'entry-cell entry-cell--muted', 'Ring'));
      hdrRow.appendChild(el('div', 'entry-cell entry-cell--muted', '#'));
      hdrRow.appendChild(el('div', 'entry-cell entry-cell--muted', 'Horse'));
      hdrRow.appendChild(el('div', 'entry-cell entry-cell--muted', 'Status'));
      hdrRow.appendChild(el('div', 'entry-cell entry-cell--muted', 'Place'));
      hdrRow.appendChild(el('div', 'entry-cell entry-cell--muted entry-cell--right', 'OOG'));
      body.appendChild(hdrRow);

      const used = new Set();

      const addLabel = (txt) => {
        const lab = el('div', 'list-group-label', txt);
        lab.style.margin = '6px 6px 2px';
        body.appendChild(lab);
      };

      const addEntryRow = (k, t) => {
        const row = el('div', 'entry-grid-row');
        row.tabIndex = 0;

        const timeCell = el('div', 'entry-cell', timeLabelOf(t) || '');
        const ringCell = el('div', 'entry-cell entry-cell--tap', ringLabelOf(t));
        const classCell = el('div', 'entry-cell entry-cell--tap', (t.class_number != null ? String(t.class_number) : ''));
        const horseCell = el('div', 'entry-cell entry-cell--tap', (t.horseName ? String(t.horseName) : ''));
        const statusCell = el('div', 'entry-cell', (t.latestStatus ? String(t.latestStatus) : ''));
        const placeVal = (t.lastestPlacing != null ? t.lastestPlacing : (t.lastPlacing != null ? t.lastPlacing : ''));
        const placeCell = el('div', 'entry-cell entry-cell--right', (placeVal != null && String(placeVal).trim() !== '' ? String(placeVal) : ''));

        const oogVal = (t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG) : '';
        const oogCell = el('div', 'entry-cell entry-cell--right');
        if (oogVal) {
          const pill = el('span', 'entry-pill entry-pill--positive', oogVal);
          oogCell.appendChild(pill);
        }

        row.addEventListener('click', () => {
          if (t.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(t.class_id) });
        });

        ringCell.addEventListener('click', (e) => {
          e.stopPropagation();
          if (t.ring_number != null) pushDetail('ringDetail', { kind: 'ring', key: String(t.ring_number) });
        });
        classCell.addEventListener('click', (e) => {
          e.stopPropagation();
          if (t.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(t.class_id) });
        });
        horseCell.addEventListener('click', (e) => {
          e.stopPropagation();
          if (t.horseName) pushDetail('horseDetail', { kind: 'horse', key: String(t.horseName) });
        });

        row.appendChild(timeCell);
        row.appendChild(ringCell);
        row.appendChild(classCell);
        row.appendChild(horseCell);
        row.appendChild(statusCell);
        row.appendChild(placeCell);
        row.appendChild(oogCell);

        body.appendChild(row);
        used.add(String(k));
      };

      if (nextPair) {
        addLabel('Next');
        const [k, t] = nextPair;
        addEntryRow(k, t);
      }

      if (firstPair) {
        const [k, t] = firstPair;
        if (!used.has(String(k))) {
          addLabel('First Up');
          addEntryRow(k, t);
        }
      }

      const remaining = pairs.filter(([k]) => !used.has(String(k)));
      const morning = [];
      const afternoon = [];
      for (const [k, t] of remaining) {
        const mins = timeToMinutes(t.latestGO || t.latestStart);
        if (mins != null && mins < (12 * 60)) morning.push([k, t]);
        else afternoon.push([k, t]);
      }
      if (morning.length) {
        addLabel('Morning');
        for (const [k, t] of morning) addEntryRow(k, t);
      }
      if (afternoon.length) {
        addLabel('Afternoon');
        for (const [k, t] of afternoon) addEntryRow(k, t);
      }
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: SCHEDULE (single-day, use state.meta.dt)
  // ----------------------------
  function renderSchedule(sIdx, tIdxBase) {
    clearRoot();
    const mode = state.scheduleMode === 'FULL' ? 'FULL' : 'ACTIVE';
    const tIdx = (mode === 'FULL') ? buildTruthIndex({ mode: 'FULL' }) : tIdxBase;

    setHeader(`Schedule (${mode === 'FULL' ? 'Full' : 'Active'})`);
    setHeaderAction('Next', true);

    // Rings from schedule scaffold (ringMap)
    const ringsAll = [...sIdx.ringMap.values()];

    function ringAgg(rk) {
      const arr = tIdx.byRing.get(String(rk));
      return arr ? arr.length : 0;
    }

    function ringEarliestGroupStartMin(r) {
      const dt = String(state.meta.dt || '').trim();
      let best = 99999;
      const groups = r ? [...r.groups.values()] : [];
      groups.forEach((g) => {
        const t = String(g && (g.latestStart || '')).trim();
        if (!dt || !t) return;
        const d = parseLocalDateTime(dt, fmtTime(t));
        if (!d) return;
        const mins = d.getHours() * 60 + d.getMinutes();
        if (mins < best) best = mins;
      });
      return best;
    }

    // Sort: earliest group start, then ring_number
    ringsAll.sort((a, b) => {
      const ea = ringEarliestGroupStartMin(a);
      const eb = ringEarliestGroupStartMin(b);
      if (ea !== eb) return ea - eb;
      return safeNum(a && a.ring_number, 999) - safeNum(b && b.ring_number, 999);
    });

    const peakItems = ringsAll
      .map((r) => {
        const rk = String(r && r.ring_number);
        const label = String(r && (r.ringName || `Ring ${rk}`));
        const agg = ringAgg(rk);
        return { key: rk, label, agg, href: `#schedule-ring-${rk}`, primary: agg > 0 };
      })
      .filter((it) => (mode === 'FULL' ? true : (it.agg || 0) > 0));

    // Optional search filter on ring name
    screenRoot.appendChild(renderSearch('schedule', 'Search schedule rings...'));
    const q = normalizeStr(state.search.schedule);

    screenRoot.appendChild(renderPeakBar(peakItems, null, null));

    for (const r of ringsAll) {
      const rk = String(r && r.ring_number);
      const label = String(r && (r.ringName || `Ring ${rk}`));
      const agg = ringAgg(rk);

      if (mode !== 'FULL' && agg === 0) continue;
      if (q && !normalizeStr(label).includes(q)) continue;

      const card = makeCard(label, agg, true, () => {
        pushDetail('ringDetail', { kind: 'ring', key: rk });
      });
      card.id = `schedule-ring-${rk}`;

      // Groups list (context-only)
      const groups = r ? [...r.groups.values()] : [];
      groups
        .sort((a, b) => {
          const ta = timeToMinutes(a.latestStart) ?? 999999;
          const tb = timeToMinutes(b.latestStart) ?? 999999;
          if (ta !== tb) return ta - tb;
          return String(a.group_name).localeCompare(String(b.group_name));
        })
        .forEach((g) => {
          const st = g.latestStart ? fmtTime(g.latestStart) : '—';
          const name = String(g.group_name || 'Group').trim();
          addCardLine(card, st, name, null, () => {
            pushDetail('groupDetail', { kind: 'group', key: String(g.class_group_id) });
          });
        });

      // Next-up entries (truth-derived) — bounded
      const entryKeys = (tIdx.byRing.get(String(rk)) || []).slice();
      const rows = entryKeys
        .map((k) => tIdx.entryBest.get(k))
        .filter(Boolean)
        .map((it) => {
          const t = parseTripStartEnd(it, state.meta.dt, { preferCalendar: true });
          const startMin = t && t.start ? (t.start.getHours() * 60 + t.start.getMinutes()) : 99999;
          return { it, startMin };
        })
        .sort((a, b) => a.startMin - b.startMin);

      // Table header row using existing classes (if present)
      const table = el('div', 'table7');
      const hdrRow = el('div', 'table7-hdr');
      ['Time', 'Ring', 'Class', 'Horse', 'Status', 'Place', ''].forEach((t) => {
        hdrRow.appendChild(el('div', 'table7-cell table7-cell--hdr', t));
      });
      table.appendChild(hdrRow);

      rows.slice(0, 25).forEach(({ it }) => {
        const t = parseTripStartEnd(it, state.meta.dt, { preferCalendar: true });
        const timeTxt = t && t.start ? fmtClockDate(t.start) : (it.latestGO ? fmtTime(it.latestGO) : (it.latestStart ? fmtTime(it.latestStart) : '—'));
        const statusTxt = String(it.latestStatus || '').trim() || '—';
        const placeVal = (it.lastestPlacing != null ? it.lastestPlacing : (it.lastPlacing != null ? it.lastPlacing : ''));
        const placeTxt = (placeVal != null && String(placeVal).trim() !== '') ? String(placeVal) : '';

        const row = el('div', 'table7-row');

        const cTime = el('div', 'table7-cell table7-link', timeTxt);
        cTime.addEventListener('click', () => {
          if (it.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(it.class_id) });
        });
        row.appendChild(cTime);

        const cRing = el('div', 'table7-cell table7-link', label);
        cRing.addEventListener('click', () => pushDetail('ringDetail', { kind: 'ring', key: String(rk) }));
        row.appendChild(cRing);

        const cClass = el('div', 'table7-cell table7-link', it.class_number != null ? String(it.class_number) : '—');
        cClass.addEventListener('click', () => {
          if (it.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(it.class_id) });
        });
        row.appendChild(cClass);

        const cHorse = el('div', 'table7-cell table7-link', String(it.horseName || '—'));
        cHorse.addEventListener('click', () => {
          if (it.horseName) pushDetail('horseDetail', { kind: 'horse', key: String(it.horseName) });
        });
        row.appendChild(cHorse);

        row.appendChild(el('div', 'table7-cell', statusTxt));
        row.appendChild(el('div', 'table7-cell', placeTxt));
        row.appendChild(el('div', 'table7-cell', ''));

        table.appendChild(row);
      });

      card.querySelector('.card-body').appendChild(table);
      screenRoot.appendChild(card);
    }
  }

  // ----------------------------
  // SCREEN: TIMELINE (single-day, ALWAYS ACTIVE)
  // ----------------------------
  function renderTimeline(_sIdx, _tIdxBase) {
    clearRoot();
    const tIdx = buildTruthIndex({ mode: 'ACTIVE' });

    setHeader('Timeline (Active)');
    setHeaderAction('Next', true);

    const dtScope = String(state.meta.dt || '').trim(); // dataset day

    const DAY_START_MIN = 8 * 60;
    const DAY_END_MIN = 18 * 60;
    const SLOT_MIN = 30;

    const PX_PER_MIN = 4;     // 30 min => 120px
    const GUTTER_PX = 180;    // horse label column
    const ROW_H = 54;         // per-horse lane height

    const root = el('div', { className: 'screen' });

    // Horses (active set)
    let horses = Array.from(state.activeHorses || []);
    if (!horses.length) horses = Array.from(tIdx.byHorse.keys());
    horses.sort((a, b) => String(a).localeCompare(String(b)));

    const viewport = el('div', { className: 'timeline-viewport' });
    const grid = el('div', { className: 'timeline-grid' });

    const dayWidth = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
    grid.style.width = `${GUTTER_PX + dayWidth}px`;

    // Axis (sticky)
    const axis = el('div', { className: 'timeline-axis' });
    axis.appendChild(el('div', { className: 'timeline-axis-left', text: 'Horse' }));

    const axisRight = el('div', { className: 'timeline-axis-right' });
    axisRight.style.width = `${dayWidth}px`;

    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += SLOT_MIN) {
      const label = fmtClockFromMinutes(m);
      const cell = el('div', { className: 'timeline-axis-cell', text: label });
      cell.style.left = `${(m - DAY_START_MIN) * PX_PER_MIN}px`;
      cell.style.width = `${SLOT_MIN * PX_PER_MIN}px`;
      axisRight.appendChild(cell);
    }

    // Now marker ONLY if system date matches dataset date (otherwise misleading)
    const todayISO = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    })();

    if (dtScope && todayISO === dtScope) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN) {
        const nowLine = el('div', { className: 'timeline-now' });
        nowLine.style.left = `${(nowMin - DAY_START_MIN) * PX_PER_MIN}px`;
        axisRight.appendChild(nowLine);

        const nowLbl = el('div', { className: 'timeline-now-label', text: 'Now' });
        nowLbl.style.left = `${(nowMin - DAY_START_MIN) * PX_PER_MIN}px`;
        axisRight.appendChild(nowLbl);
      }
    }

    axis.appendChild(axisRight);
    grid.appendChild(axis);

    // Rows
    const rowsWrap = el('div', { className: 'timeline-rows' });

    horses.forEach((horseName) => {
      const row = el('div', { className: 'timeline-row' });

      const left = el('div', { className: 'timeline-horse' });
      left.appendChild(el('div', { className: 'timeline-horse-name', text: String(horseName) }));
      left.addEventListener('click', () => pushDetail('horseDetail', { kind: 'horse', key: String(horseName) }));
      row.appendChild(left);

      const lane = el('div', { className: 'timeline-lane' });
      lane.style.width = `${dayWidth}px`;
      lane.style.height = `${ROW_H}px`;

      const entryKeys = tIdx.byHorse.get(String(horseName)) || [];
      const cards = entryKeys
        .map((k) => tIdx.entryBest.get(k))
        .filter(Boolean)
        .map((it) => {
          const t = parseTripStartEnd(it, dtScope, { preferCalendar: true });
          if (!t || !t.start || !t.end) return null;

          const st = t.start.getHours() * 60 + t.start.getMinutes();
          const en = t.end.getHours() * 60 + t.end.getMinutes();

          const startMin = Math.max(DAY_START_MIN, st);
          const endMin = Math.min(DAY_END_MIN, Math.max(startMin + 5, en));
          if (endMin <= DAY_START_MIN || startMin >= DAY_END_MIN) return null;

          return { it, startMin, endMin };
        })
        .filter(Boolean)
        .sort((a, b) => a.startMin - b.startMin);

      cards.forEach(({ it, startMin, endMin }) => {
        const c = el('div', { className: 'timeline-card' });
        c.style.left = `${(startMin - DAY_START_MIN) * PX_PER_MIN}px`;
        c.style.width = `${Math.max(70, (endMin - startMin) * PX_PER_MIN)}px`;

        const top = el('div', { className: 'timeline-card-top' });
        const cn = it.class_number != null ? String(it.class_number) : '—';
        top.appendChild(el('span', { className: 'timeline-card-class', text: cn }));
        top.appendChild(el('span', { className: 'timeline-card-ring', text: String(it.ringName || (it.ring_number != null ? `Ring ${it.ring_number}` : '')) }));
        c.appendChild(top);

        const mid = el('div', { className: 'timeline-card-mid' });
        const timeTxt = it.latestGO ? fmtTime(it.latestGO) : (it.latestStart ? fmtTime(it.latestStart) : '');
        if (timeTxt) mid.appendChild(el('span', { className: 'timeline-card-time', text: timeTxt }));
        const stTxt = String(it.latestStatus || '').trim();
        if (stTxt) mid.appendChild(el('span', { className: 'timeline-card-status', text: stTxt }));
        c.appendChild(mid);

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
    setModePills();

    const primary = getPrimaryForScreen(state.screen);
    setNavActive(primary);

    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';

    if (state.screen === 'start') return renderStart();
    if (state.screen === 'horses') return renderHorses(sIdx, tIdx);
    if (state.screen === 'schedule') return renderSchedule(sIdx, tIdx);
    if (state.screen === 'timeline') return renderTimeline(sIdx, tIdx);

    if (state.screen === 'rings') return renderRings(sIdx, tIdx);
    if (state.screen === 'classes') return renderClasses(sIdx, tIdx);
    if (state.screen === 'riders') return renderRiders(sIdx, tIdx);

    if (state.screen === 'ringDetail') return renderRingDetail(sIdx, tIdx);
    if (state.screen === 'groupDetail') return renderGroupDetail(sIdx, tIdx);
    if (state.screen === 'classDetail') return renderClassDetail(sIdx, tIdx);
    if (state.screen === 'riderDetail') return renderRiderDetail(sIdx, tIdx);
    if (state.screen === 'horseDetail') return renderHorseDetail(sIdx, tIdx);

    state.screen = 'start';
    renderStart();
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  if (headerBack) headerBack.addEventListener('click', goBack);

  if (headerAction) headerAction.addEventListener('click', () => {
    nextPrimaryScreen();
  });

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const modePill = e.target.closest('[data-mode-pill]');
      if (modePill) {
        if (state.screen === 'schedule') {
          state.scheduleMode = (state.scheduleMode === 'FULL') ? 'ACTIVE' : 'FULL';
          render();
        } else {
          state.scopeMode = (state.scopeMode === 'FULL') ? 'ACTIVE' : 'FULL';
          render();
        }
        return;
      }

      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const next = btn.dataset.screen;
      state.history = [];
      state.detail = null;
      state.screen = next;
      render();
    });
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  loadAll().catch(() => {});
  render();
})();
