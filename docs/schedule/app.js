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

  const STATUS_COMPLETED = 'Completed';

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

    // global mode for Schedule/Timeline (A/F)
    scopeMode: 'ACTIVE', // ACTIVE | FULL

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
    },

    // per-screen peak selections
    peak: {
      rings: new Set(),   // ring_number string
      classes: new Set(), // class_group_id string
      riders: new Set(),  // riderName string
      schedule: new Set() // ring_number string
    }
  };

  // ----------------------------
  // UTIL
  // ----------------------------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function normalizeStr(s) {
    return String(s || '').trim().toLowerCase();
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
    document.querySelectorAll('[data-mode-pill]').forEach(el => {
      const screen = el.getAttribute('data-mode-pill');
      if (screen === 'timeline') {
        el.textContent = 'A';
        el.classList.add('nav-agg--positive');
        return;
      }
      // scopeMode is stored on root state
      const isFull = state.scopeMode === 'FULL';
      el.textContent = isFull ? 'F' : 'A';
      el.classList.toggle('nav-agg--positive', !isFull);
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

  const DUR_PER_TRIP_SEC = 149; // 2 minutes 29 seconds

  function roundUpTo5Minutes(d) {
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(d.getTime() / ms) * ms);
  }

  function parseAmPmTimeToDate(dt, t) {
    // dt: 'YYYY-MM-DD', t: '12:15pm' or '12:15 PM'
    const mins = timeToMinutes(String(t).replace(/\s*([AaPp])\s*([Mm])?$/, (m,a)=>` ${a.toUpperCase()}M`));
    if (mins == null) return null;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return new Date(`${dt}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);
  }

  function parseTripStartEnd(trip, dtFallback) {
    // Prefer calendar fields if present, else use dt + latestStart + duration fallback
    const dt = dtFallback || trip.dt;
    let start = null;
    if (trip.latest_calendar_start) {
      // 'YYYY-MM-DD 12:15pm'
      const m = String(trip.latest_calendar_start).trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      start = m ? parseAmPmTimeToDate(m[1], m[2]) : null;
    }
    if (!start && dt && trip.latestStart) {
      start = parseAmPmTimeToDate(dt, trip.latestStart);
    }
    if (!start) return { start: null, end: null };

    let end = null;
    if (trip.latest_calendar_end) {
      const m = String(trip.latest_calendar_end).trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      end = m ? parseAmPmTimeToDate(m[1], m[2]) : null;
    }
    if (!end) {
      const trips = safeNumber(trip.total_trips, 1);
      const ms = trips * DUR_PER_TRIP_SEC * 1000;
      end = new Date(start.getTime() + ms);
    }
    end = roundUpTo5Minutes(end);
    return { start, end };
  }


  function safeNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback ?? null);
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
      const goM = timeToMinutes(t && t.latestGO) ?? 999999;
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

  function buildTruthIndex() {
    const includedTrip = (t) => {
      if (!t) return false;

      if (state.scopeMode === 'ACTIVE') {
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

    // do NOT block typing; update state then render
    input.addEventListener('input', () => {
      state.search[screenKey] = input.value;
      render();
    });

    wrap.appendChild(input);
    return wrap;
  }

  function renderPeakBar(items, selectedSet, onToggle) {
    const bar = el('div', 'peakbar');
    const scroller = el('div', 'nav-scroller');
    const row = el('div', 'nav-row');

    for (const it of items) {
      const b = el('button', 'nav-btn', null);
      b.type = 'button';

      const label = el('span', 'nav-label', it.label);
      const agg = el('span', 'nav-agg', String(it.agg ?? 0));
      if ((it.agg ?? 0) > 0) agg.classList.add('nav-agg--positive');

      b.appendChild(label);
      b.appendChild(agg);

      const on = selectedSet.has(it.key);
      b.classList.toggle('nav-btn--primary', on);

      b.addEventListener('click', () => onToggle(it.key));
      row.appendChild(b);
    }

    scroller.appendChild(row);
    bar.appendChild(scroller);
    return bar;
  }

  function toggleSet(set, key) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
    render();
  }

  function makeCard(title, aggValue, inverseHdr, onClick) {
    const card = el('div', 'card' + (onClick ? ' card--tap' : ''));
    if (onClick) card.addEventListener('click', onClick);

    const hdr = el('div', 'card-hdr' + (inverseHdr ? ' card-hdr--inverse' : ''));
    hdr.appendChild(el('div', 'card-title', title));

    // show agg only if >0
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
  function renderAggs(sIdx, tIdx) {
    // active horses count = size of active set (default all)
    setAgg('horses', state.activeHorses.size);

    // rings/classes/riders aggs from truth (deduped entries)
    const ringsCount = tIdx.byRing.size;
    const groupsCount = tIdx.byGroup.size;
    const ridersCount = tIdx.byRider.size;

    setAgg('rings', ringsCount);
    setAgg('classes', groupsCount);
    setAgg('riders', ridersCount);
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
  function renderHorses(sIdx, tIdx) {
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
      const active = state.activeHorses.has(String(h));
      if (active) row.classList.add('row--active');

      row.appendChild(el('div', 'row-title', String(h)));

      // count = number of deduped entries for this horse (in current mode)
      const keys = tIdx.byHorse.get(String(h)) || [];
      row.appendChild(makeTagCount(keys.length));

      row.addEventListener('click', () => {
        pushDetail('horseDetail', { kind: 'horse', key: String(h) });
      });

      screenRoot.appendChild(row);
    }
  }

  function renderHorseDetail(sIdx, tIdx) {
    const horse = state.detail && state.detail.key ? String(state.detail.key) : null;

    clearRoot();
    setHeader(horse || 'Horse');
    setHeaderAction('Next', true);

    if (!horse) return;

    // toggle row (ONLY place to change active)
    const toggle = el('div', 'row row--tap');
    toggle.appendChild(el('div', 'row-title', state.activeHorses.has(horse) ? 'Active' : 'Inactive'));
    toggle.appendChild(el('div', 'row-tag row-tag--count', state.activeHorses.has(horse) ? 'ON' : 'OFF'));
    toggle.addEventListener('click', () => {
      if (state.activeHorses.has(horse)) state.activeHorses.delete(horse);
      else state.activeHorses.add(horse);
      render();
    });
    screenRoot.appendChild(toggle);

    // list this horse's deduped entries
    const entryKeys = (tIdx.byHorse.get(horse) || []).slice();
    const bestTrips = entryKeys
      .map(k => tIdx.entryBest.get(k))
      .filter(Boolean)
      .sort((a, b) => {
        const ta = timeToMinutes(a.latestGO) ?? 999999;
        const tb = timeToMinutes(b.latestGO) ?? 999999;
        if (ta !== tb) return ta - tb;
        const ra = safeNum(a.ring_number, 999999);
        const rb = safeNum(b.ring_number, 999999);
        if (ra !== rb) return ra - rb;
        return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
      });

    for (const t of bestTrips) {
      const left = `${t.latestGO || ''} • Ring ${t.ring_number != null ? t.ring_number : ''} • ${t.class_number || ''}`.trim();
      const right = (t.lastOOG != null) ? String(t.lastOOG) : '';
      const row = el('div', 'row');
      row.appendChild(el('div', 'row-title', left || ' '));
      row.appendChild(el('div', 'row-tag row-tag--count', right || ''));
      screenRoot.appendChild(row);
    }
  }

  // ----------------------------
  // SCREEN: RINGS (summary + peak + cards)
  // ----------------------------
  function buildRingPeakItems(sIdx, tIdx, ringList) {
    // always build from schedule scaffold (so peaks never "disappear")
    return ringList.map(r => {
      const rk = String(r.ring_number);
      const entryKeys = tIdx.byRing.get(rk) || [];
      return { key: rk, label: String(r.ringName), agg: entryKeys.length };
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
    screenRoot.appendChild(renderPeakBar(peakItems, state.peak.rings, (k) => toggleSet(state.peak.rings, k)));

    const q = normalizeStr(state.search.rings);
    const visible = ringsAll
      .filter(r => ringVisibleInMode(tIdx, String(r.ring_number)))
      .filter(r => (state.peak.rings.size ? state.peak.rings.has(String(r.ring_number)) : true))
      .filter(r => (q ? normalizeStr(r.ringName).includes(q) : true));

    for (const r of visible) {
      const rk = String(r.ring_number);
      const ringEntryKeys = tIdx.byRing.get(rk) || [];
      const card = makeCard(String(r.ringName), ringEntryKeys.length, true, () => {
        pushDetail('ringDetail', { kind: 'ring', key: rk });
      });

      // groups sorted by start time
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

          // class line (3 cols) — name includes class number
          const classLabel = `${c.class_number || ''} ${c.class_name || ''}`.trim();
          addCardLine(card, c.latestStart || '', classLabel, makeTagCount(cKeys.length), () => {
            pushDetail('classDetail', { kind: 'class', key: cid });
          });

          // entry lines (collapsed: show best for each entryKey; display horseName + OOG number)
          // in rings card context: show up to 6 entries (more than before, still bounded)
          const bestTrips = cKeys
            .map(k => tIdx.entryBest.get(k))
            .filter(Boolean)
            .sort((a, b) => {
              const ta = timeToMinutes(a.latestGO) ?? 999999;
              const tb = timeToMinutes(b.latestGO) ?? 999999;
              if (ta !== tb) return ta - tb;
              return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
            })
            .slice(0, 6);

          for (const bt of bestTrips) {
            const horseName = bt.horseName ? String(bt.horseName) : '';
            const oog = (bt.lastOOG != null) ? String(bt.lastOOG) : '';
            // entry line uses card-line layout, but blank time col
            addCardLine(card, '', horseName, (oog ? makeTagCount(oog) : null), () => {
              // jump to horse detail (so they can toggle active there)
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
            const ta = timeToMinutes(a.latestGO) ?? 999999;
            const tb = timeToMinutes(b.latestGO) ?? 999999;
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

    // find group in schedule scaffold
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
  // SCREEN: CLASSES (peak + rows)
  // ----------------------------
  function renderClasses(sIdx, tIdx) {
    clearRoot();
    setHeader('Classes');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('classes', 'Search classes...'));

    // build group list from schedule scaffold
    const groupsAll = [];
    for (const r of sIdx.ringMap.values()) for (const g of r.groups.values()) groupsAll.push(g);

    // group peak items (label + agg)
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
        return { key: gid, label: String(g.group_name), agg: keys.length };
      });

    screenRoot.appendChild(renderPeakBar(peakItems, state.peak.classes, (k) => toggleSet(state.peak.classes, k)));

    const q = normalizeStr(state.search.classes);

    // visible groups (mode + peak + search)
    const visible = peakItems
      .filter(it => (state.scopeMode === 'FULL' ? true : (it.agg > 0)))
      .filter(it => (state.peak.classes.size ? state.peak.classes.has(it.key) : true))
      .filter(it => (q ? normalizeStr(it.label).includes(q) : true));

    for (const it of visible) {
      const row = el('div', 'row row--tap');
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
        const ta = timeToMinutes(a.latestGO) ?? 999999;
        const tb = timeToMinutes(b.latestGO) ?? 999999;
        if (ta !== tb) return ta - tb;
        return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
      });

    for (const bt of bestTrips) {
      const horseName = bt.horseName ? String(bt.horseName) : '';
      const oog = (bt.lastOOG != null) ? String(bt.lastOOG) : '';
      addCardLine(card, bt.latestGO || '', horseName, (oog ? makeTagCount(oog) : null), () => {
        if (horseName) pushDetail('horseDetail', { kind: 'horse', key: horseName });
      });
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: RIDERS (peak + rows)
  // ----------------------------
  function renderRiders(sIdx, tIdx) {
    clearRoot();
    setHeader('Riders');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('riders', 'Search riders...'));

    const ridersAll = [...tIdx.byRider.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    const peakItems = ridersAll.map(name => {
      const keys = tIdx.byRider.get(name) || [];
      return { key: String(name), label: String(name), agg: keys.length };
    });

    screenRoot.appendChild(renderPeakBar(peakItems, state.peak.riders, (k) => toggleSet(state.peak.riders, k)));

    const q = normalizeStr(state.search.riders);

    const visible = peakItems
      .filter(it => (state.scopeMode === 'FULL' ? true : (it.agg > 0)))
      .filter(it => (state.peak.riders.size ? state.peak.riders.has(it.key) : true))
      .filter(it => (q ? normalizeStr(it.label).includes(q) : true));

    for (const it of visible) {
      const row = el('div', 'row row--tap');
      row.appendChild(el('div', 'row-title', it.label));
      row.appendChild(makeTagCount(it.agg));
      row.addEventListener('click', () => {
        pushDetail('riderDetail', { kind: 'rider', key: it.key });
      });
      screenRoot.appendChild(row);
    }
  }

  function renderRiderDetail(sIdx, tIdx) {
    const rider = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader(rider || 'Rider');
    setHeaderAction('Next', true);

    if (!rider) return;

    const keys = tIdx.byRider.get(rider) || [];
    const card = makeCard(rider, keys.length, true, null);

    const pairs = keys
      .map(k => [k, tIdx.entryBest.get(k)])
      .filter(([,t]) => Boolean(t));

    // sort by GO time, then ring, then OOG
    pairs.sort(([,a], [,b]) => {
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
    const tripKeyOf = (k) => String(k);

    const firstPair = pairs.length ? pairs[0] : null;
    const nextPair = pairs.find(([,t]) => {
      const st = normStatus(t.latestStatus);
      return st && !st.startsWith('completed');
    }) || null;

    // Card header sublabel: Next ring • time
    if (nextPair) {
      const [,nt] = nextPair;
      const sub = el('div', 'card-hdr-sub', `Next: ${ringLabelOf(nt)} • ${timeLabelOf(nt)}`.trim());
      const hdr = card.querySelector('.card-hdr');
      if (hdr) hdr.appendChild(sub);
    }

    const body = card.querySelector('.card-body');
    if (body) {
      // 7-col header
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

        // row click -> class detail (primary)
        row.addEventListener('click', () => {
          if (t.class_id != null) pushDetail('classDetail', { kind: 'class', key: String(t.class_id) });
        });

        // cell clicks -> respective lists
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
        used.add(tripKeyOf(k));
      };

      // Next = next class not completed
      if (nextPair) {
        addLabel('Next');
        const [k,t] = nextPair;
        addEntryRow(k, t);
      }

      // First Up = first class on list (chronological)
      if (firstPair) {
        const [k,t] = firstPair;
        if (!used.has(tripKeyOf(k))) {
          addLabel('First Up');
          addEntryRow(k, t);
        }
      }

      // Remaining -> Morning / Afternoon
      const remaining = pairs.filter(([k]) => !used.has(tripKeyOf(k)));
      const morning = [];
      const afternoon = [];
      for (const [k,t] of remaining) {
        const mins = timeToMinutes(t.latestGO || t.latestStart);
        if (mins != null && mins < (12 * 60)) morning.push([k,t]);
        else afternoon.push([k,t]);
      }
      if (morning.length) {
        addLabel('Morning');
        for (const [k,t] of morning) addEntryRow(k, t);
      }
      if (afternoon.length) {
        addLabel('Afternoon');
        for (const [k,t] of afternoon) addEntryRow(k, t);
      }
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: SCHEDULE (template + A/F toggle in bottom nav)
  // - For now: ring cards overview (same contract as Rings), with optional ring peak
  // ----------------------------
  function renderSchedule(sIdx, tIdx) {
    clearRoot();
    setHeader(state.scopeMode === 'FULL' ? 'Schedule (Full)' : 'Schedule (Active)');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('schedule', 'Search schedule...'));

    const ringsAll = [...sIdx.ringMap.values()].sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));

    // ring peak for schedule (optional)
    const peakItems = buildRingPeakItems(sIdx, tIdx, ringsAll);
    screenRoot.appendChild(renderPeakBar(peakItems, state.peak.schedule, (k) => toggleSet(state.peak.schedule, k)));

    const q = normalizeStr(state.search.schedule);
    const visible = ringsAll
      .filter(r => ringVisibleInMode(tIdx, String(r.ring_number)))
      .filter(r => (state.peak.schedule.size ? state.peak.schedule.has(String(r.ring_number)) : true))
      .filter(r => (q ? normalizeStr(r.ringName).includes(q) : true));

    for (const r of visible) {
      const rk = String(r.ring_number);
      const ringEntryKeys = tIdx.byRing.get(rk) || [];
      const card = makeCard(String(r.ringName), ringEntryKeys.length, true, () => {
        pushDetail('ringDetail', { kind: 'ring', key: rk });
      });

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
      }

      screenRoot.appendChild(card);
    }
  }

  // ----------------------------
  // SCREEN: TIMELINE (template + A/F toggle in bottom nav)
  // - Feed of deduped entries sorted by GO, then ring
  // ----------------------------
  function renderTimeline(sIdx, tIdx) {
    clearRoot();
    setHeader(state.scopeMode === 'FULL' ? 'Timeline (Full)' : 'Timeline (Active)');
    setHeaderAction('Next', true);

    screenRoot.appendChild(renderSearch('timeline', 'Search timeline...'));

    const q = normalizeStr(state.search.timeline);

    // all entryBest trips
    const bestTrips = [...tIdx.entryBest.values()]
      .filter(Boolean)
      .filter(t => {
        if (!q) return true;
        const hay = `${t.horseName || ''} ${t.riderName || ''} ${t.teamName || ''} ${t.ring_number || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const ta = timeToMinutes(a.latestGO) ?? 999999;
        const tb = timeToMinutes(b.latestGO) ?? 999999;
        if (ta !== tb) return ta - tb;
        const ra = safeNum(a.ring_number, 999999);
        const rb = safeNum(b.ring_number, 999999);
        if (ra !== rb) return ra - rb;
        return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
      });

    for (const t of bestTrips) {
      const row = el('div', 'row row--tap');

      const left = `${t.latestGO || ''} • ${t.horseName || ''}`.trim();
      row.appendChild(el('div', 'row-title', left || ' '));

      // right tag shows ring number (not in parentheses)
      const tag = el('div', 'row-tag row-tag--count', t.ring_number != null ? `R${t.ring_number}` : '');
      row.appendChild(tag);

      row.addEventListener('click', () => {
        const horseName = t.horseName ? String(t.horseName) : null;
        if (horseName) pushDetail('horseDetail', { kind: 'horse', key: horseName });
      });

      screenRoot.appendChild(row);
    }
  }

  // ----------------------------
  // RENDER ROUTER
  // ----------------------------
  function render() {
    if (!screenRoot || !headerTitle) return;

    const sIdx = buildScheduleIndex();
    const tIdx = buildTruthIndex();

    // aggs + mode pills
    renderAggs(sIdx, tIdx);
    setModePills();

    // nav active
    const primary = getPrimaryForScreen(state.screen);
    setNavActive(primary);

    // header back visibility
    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';

    // route
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

    // fallback
    state.screen = 'start';
    renderStart();
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  if (headerBack) headerBack.addEventListener('click', goBack);

  if (headerAction) headerAction.addEventListener('click', () => {
    // Next is always a primary-tab advance
    nextPrimaryScreen();
  });

  // Bottom nav clicks + mode toggles for Schedule/Timeline
  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const modePill = e.target.closest('[data-mode-pill]');
      if (modePill) {
        // toggle A/F without changing current tab
        state.scopeMode = (state.scopeMode === 'ACTIVE') ? 'FULL' : 'ACTIVE';
        render();
        e.stopPropagation();
        return;
      }

      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const next = btn.dataset.screen;

      // switching primary tab: clear detail stack
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