// app.js — CRT Daily Show (Legacy UI contract + Cards + Peaks + Schedule/Timeline modes)
//
// FULL DROP — changes applied per your list:
//
// ✅ Removed ALL “unfollow / active set” functionality (no ON/OFF anywhere)
// ✅ Schedule (bottom nav) ALWAYS renders FULL (never filtered)
// ✅ Schedule: click horse chip → Horse detail (INLINE on Schedule page)
// ✅ Schedule: click class line → Class detail (INLINE on Schedule page)
// ✅ Schedule: tap ring card header → Ring detail (INLINE on Schedule page)
// ✅ Removed Next button logic (top-right) — no next screen cycling
// ✅ Fixed peak anchor offset so ring headers are not hidden under sticky peakbar
// ✅ Added clear “TARGET” comments for where each detail card is rendered/attached
//
// Data:
//   ./data/latest/watch_schedule.json (context scaffold)
//   ./data/latest/watch_trips.json    (truth overlay)

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
  const screenRoot = document.getElementById('screen-root');
  const appMain = document.getElementById('app-main');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const navRow = document.getElementById('nav-row');

  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    // primary nav
    screen: 'start',
    history: [],
    detail: null,

    // INLINE detail panel (shown at top of Schedule screen)
    inlineDetail: null, // { kind:'horse'|'class'|'ring'|'rider', key:string }

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

  function roundUpTo5Minutes(d) {
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(d.getTime() / ms) * ms);
  }

  function parseAmPmTimeToDate(dt, t) {
    const mins = timeToMinutes(t);
    if (mins == null) return null;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return new Date(`${dt}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);
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

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ----------------------------
  // INDEXES (schedule scaffold + trips truth)
  // ----------------------------
  function buildScheduleIndex() {
    const ringMap = new Map(); // ring_number string -> { ring_number, ringName, groups: Map }
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

  function pickBestTrip(tripsList) {
    if (!tripsList || tripsList.length === 0) return null;

    let best = null;
    let bestT = 999999;
    let bestO = 999999;

    for (const t of tripsList) {
      const goM = timeToMinutes(t && (t.latestGO || t.latestStart)) ?? 999999;
      const oog = (t && t.lastOOG != null) ? safeNum(t.lastOOG, 999999) : 999999;

      if (!best) { best = t; bestT = goM; bestO = oog; continue; }
      if (goM < bestT) { best = t; bestT = goM; bestO = oog; continue; }
      if (goM === bestT && oog < bestO) { best = t; bestT = goM; bestO = oog; continue; }
    }

    return best;
  }

  // FULL truth index (no Active filtering at all)
  function buildTruthIndex() {
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
      if (!t) continue;

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

    const entryBest = new Map();
    for (const [k, list] of byEntryKey.entries()) entryBest.set(k, pickBestTrip(list));

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

    return { byEntryKey, entryBest, byHorse, byRing, byGroup, byClass, byRider };
  }

  // ----------------------------
  // NAV / DETAILS
  // ----------------------------
  function goto(screen) {
    state.screen = screen;
    state.detail = null;
    state.history = [];
    if (screen !== 'rings') state.inlineDetail = null;
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

  function getPrimaryForScreen(screen) {
    const map = {
      start: 'start',
      horses: 'horses',
      rings: 'rings',
      schedule: 'rings',
      timeline: 'timeline',
      riders: 'riders',

      ringDetail: 'rings',
      groupDetail: 'rings',
      classDetail: 'rings',
      riderDetail: 'riders',
      horseDetail: 'horses'
    };
    return map[screen] || 'start';
  }

  function setInlineDetail(kind, key) {
    // Only used on Schedule (rings) screen.
    state.inlineDetail = { kind, key: String(key) };
    render();

    // Scroll to inline detail after render
    setTimeout(() => {
      const node = document.getElementById('inline-detail');
      if (!node || !appMain) return;
      const peakbar = document.querySelector('.peakbar');
      const offset = (peakbar ? peakbar.offsetHeight : 0) + 10;
      appMain.scrollTo({ top: Math.max(0, node.offsetTop - offset), behavior: 'smooth' });
    }, 0);
  }

  // ----------------------------
  // AGGS (truth only)
  // ----------------------------
  function renderAggs(_sIdx, tIdx) {
    setAgg('horses', tIdx.byHorse.size);
    setAgg('rings', tIdx.byRing.size);
    setAgg('riders', tIdx.byRider.size);
  }

  // ----------------------------
  // RENDER HELPERS (cards + peaks)
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

  function scrollToIdWithinMain(id) {
    if (!appMain) return;
    const target = document.getElementById(id);
    if (!target) return;
    const peakbar = document.querySelector('.peakbar');
    const offset = (peakbar ? peakbar.offsetHeight : 0) + 10;
    appMain.scrollTo({ top: Math.max(0, target.offsetTop - offset), behavior: 'smooth' });
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
        scrollToIdWithinMain(hash); // ✅ offset fix (no hidden ring header)
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

    if (aggValue != null && Number(aggValue) > 0) hdr.appendChild(makeTagCount(aggValue));

    card.appendChild(hdr);
    card.appendChild(el('div', 'card-body'));
    return card;
  }

  function addCardLine(card, leftTxt, midTxt, rightNode, onClick) {
    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    const l = el('div', 'c-time', leftTxt || '');
    const m = el('div', 'c-name', midTxt || '');

    line.appendChild(l);
    line.appendChild(m);

    const r = el('div', 'c-agg');
    if (rightNode) r.appendChild(rightNode);
    line.appendChild(r);

    if (onClick) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    }

    body.appendChild(line);
  }

  function addEntryRollup(card, bestTrips, onHorseClick) {
    if (!bestTrips || bestTrips.length === 0) return;

    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    line.appendChild(el('div', 'c-time', '')); // blank left

    const mid = el('div', 'c-name');
    const roll = el('div', 'entry-rollup');

    bestTrips.forEach((t) => {
      const horse = (t && t.horseName) ? String(t.horseName).trim() : '';
      const oog = (t && t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG).trim() : '';
      if (!horse || !oog) return;

      const chip = el('span', 'entry-chip', `${horse} - ${oog}`);
      if (typeof onHorseClick === 'function') {
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          onHorseClick(horse);
        });
      }
      roll.appendChild(chip);
    });

    if (!roll.childNodes.length) return;

    mid.appendChild(roll);
    line.appendChild(mid);

    line.appendChild(el('div', 'c-agg'));
    body.appendChild(line);
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
        try { await loadAll(); } catch (_) {}
      }
      goto('rings'); // start goes straight to Schedule
    });
    wrap.appendChild(btn);

    screenRoot.appendChild(wrap);
  }

  // ----------------------------
  // SCREEN: HORSES (list -> detail screen)
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

      const row = el('div', 'row row--tap');
      row.id = `horse-${idify(h)}`;

      row.appendChild(el('div', 'row-title', String(h)));
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

    if (!horse) return;

    // TARGET: HORSE DETAIL CARD (screen) -------------------------
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

    const card = makeCard(horse, bestTrips.length, true, null);
    addEntryRollup(card, bestTrips.slice(0, 60));
    screenRoot.appendChild(card);
  }

  // ----------------------------
  // INLINE DETAIL (Schedule top panel)
  // ----------------------------
  function renderInlineDetailPanel(sIdx, tIdx) {
    if (!state.inlineDetail) return null;

    const kind = state.inlineDetail.kind;
    const key = String(state.inlineDetail.key);

    const wrap = el('div', { id: 'inline-detail' });

    const closeRow = el('div', 'row row--tap');
    closeRow.appendChild(el('div', 'row-title', 'Clear Detail'));
    closeRow.appendChild(el('div', 'row-tag row-tag--count', 'X'));
    closeRow.addEventListener('click', () => {
      state.inlineDetail = null;
      render();
    });
    wrap.appendChild(closeRow);

    if (kind === 'horse') {
      // TARGET: HORSE DETAIL CARD (inline) -----------------------
      const entryKeys = (tIdx.byHorse.get(key) || []).slice();
      const bestTrips = entryKeys.map(k => tIdx.entryBest.get(k)).filter(Boolean);
      const card = makeCard(key, bestTrips.length, true, null);
      addEntryRollup(card, bestTrips.slice(0, 60));
      wrap.appendChild(card);
      return wrap;
    }

    if (kind === 'class') {
      // TARGET: CLASS DETAIL CARD (inline) -----------------------
      const schedRec = sIdx.classMap.get(key);
      const title = schedRec && schedRec.class_name ? String(schedRec.class_name) : `Class ${key}`;
      const cKeys = tIdx.byClass.get(key) || [];
      const bestTrips = cKeys.map(k => tIdx.entryBest.get(k)).filter(Boolean);
      const card = makeCard(title, bestTrips.length, true, null);
      addEntryRollup(card, bestTrips.slice(0, 80), (horse) => setInlineDetail('horse', horse));
      wrap.appendChild(card);
      return wrap;
    }

    if (kind === 'ring') {
      // TARGET: RING DETAIL CARD (inline) ------------------------
      const ringObj = sIdx.ringMap.get(key);
      if (!ringObj) return wrap;
      const ringEntryKeys = tIdx.byRing.get(key) || [];
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
        if (gKeys.length === 0) continue;

        addCardLine(
          card,
          fmtTimeShort(g.latestStart || ''),
          String(g.group_name),
          (fmtStatus4(g.latestStatus) ? el('div', 'row-tag row-tag--count', fmtStatus4(g.latestStatus)) : null),
          null
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
            () => setInlineDetail('class', cid)
          );

          const bestTrips = cKeys.map(k => tIdx.entryBest.get(k)).filter(Boolean).slice(0, 20);
          addEntryRollup(card, bestTrips, (horse) => setInlineDetail('horse', horse));
        }
      }

      wrap.appendChild(card);
      return wrap;
    }

    return wrap;
  }

  // ----------------------------
  // SCREEN: RINGS (Schedule)
  // ----------------------------
  function renderRings(sIdx, tIdx) {
    clearRoot();
    setHeader('Schedule');

    screenRoot.appendChild(renderSearch('rings', 'Search rings...'));

    // INLINE detail (top of Schedule)
    const inline = renderInlineDetailPanel(sIdx, tIdx);
    if (inline) screenRoot.appendChild(inline);

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

      // Tap ring card header -> INLINE ring detail
      const card = makeCard(String(r.ringName), ringEntryKeys.length, true, () => {
        setInlineDetail('ring', rk);
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
          (fmtStatus4(g.latestStatus) ? el('div', 'row-tag row-tag--count', fmtStatus4(g.latestStatus)) : null),
          null
        );

        const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
        for (const c of classes) {
          const cid = String(c.class_id);
          const cKeys = tIdx.byClass.get(cid) || [];
          if (cKeys.length === 0) continue;

          // Click class line -> INLINE class detail
          addCardLine(
            card,
            (c.class_number != null ? String(c.class_number) : ''),
            String(c.class_name || '').trim(),
            makeTagCount(cKeys.length),
            () => setInlineDetail('class', cid)
          );

          // Rollup chips -> INLINE horse detail
          const bestTrips = cKeys
            .map(k => tIdx.entryBest.get(k))
            .filter(Boolean)
            .sort((a, b) => {
              const ta = timeToMinutes(a.latestGO || a.latestStart) ?? 999999;
              const tb = timeToMinutes(b.latestGO || b.latestStart) ?? 999999;
              if (ta !== tb) return ta - tb;
              return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
            })
            .slice(0, 14);

          addEntryRollup(card, bestTrips, (horse) => setInlineDetail('horse', horse));
        }
      }

      screenRoot.appendChild(card);
    }
  }

  // ----------------------------
  // SCREEN: RIDERS (list -> detail screen)
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

      const row = el('div', 'row row--tap');
      row.id = `rider-${idify(name)}`;
      row.appendChild(el('div', 'row-title', String(name)));
      row.appendChild(makeTagCount(keys.length));
      row.addEventListener('click', () => {
        pushDetail('riderDetail', { kind: 'rider', key: String(name) });
      });
      screenRoot.appendChild(row);
    }
  }

  function renderRiderDetail(_sIdx, tIdx) {
    const rider = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader(rider || 'Rider');

    if (!rider) return;

    const keys = tIdx.byRider.get(rider) || [];
    if (keys.length === 0) return;

    // TARGET: RIDER DETAIL CARD (screen) -------------------------
    const card = makeCard(rider, keys.length, true, null);

    const bestTrips = keys
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

    addEntryRollup(card, bestTrips.slice(0, 60));
    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: TIMELINE (Full) — uses payload dt
  // ----------------------------
  function renderTimeline(_sIdx, tIdx) {
    clearRoot();
    setHeader('Timeline');

    const dt = state.meta.dt;
    if (!dt) {
      screenRoot.appendChild(el('div', 'row', 'No dt found in payload.'));
      return;
    }

    const DAY_START_MIN = 8 * 60;
    const DAY_END_MIN = 18 * 60;
    const SLOT_MIN = 30;

    const PX_PER_MIN = 4;
    const GUTTER_PX = 180;

    const root = el('div', 'screen');

    let horses = Array.from(tIdx.byHorse.keys());
    horses.sort((a, b) => String(a).localeCompare(String(b)));

    const viewport = el('div', 'timeline-viewport');
    const grid = el('div', 'timeline-grid');

    const dayWidth = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
    grid.style.width = `${GUTTER_PX + dayWidth}px`;

    const axis = el('div', 'timeline-axis');
    axis.appendChild(el('div', 'timeline-axis-left', 'Horse'));

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
        .map((k) => tIdx.entryBest.get(k))
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

      cards.forEach(({ it, startMin, endMin }) => {
        const c = el('div', 'timeline-card');
        c.style.left = `${(startMin - DAY_START_MIN) * PX_PER_MIN}px`;
        c.style.width = `${Math.max(70, (endMin - startMin) * PX_PER_MIN)}px`;

        const top = el('div', 'timeline-card-top');
        top.appendChild(el('span', 'timeline-card-class', (it.class_number != null ? String(it.class_number) : '—')));
        top.appendChild(el('span', 'timeline-card-ring', String(it.ringName || (it.ring_number != null ? `R${it.ring_number}` : ''))));
        c.appendChild(top);

        const mid = el('div', 'timeline-card-mid');
        const timeTxt = fmtTimeShort(it.latestGO || it.latestStart || '');
        if (timeTxt) mid.appendChild(el('span', 'timeline-card-time', timeTxt));
        const stTxt = fmtStatus4(it.latestStatus);
        if (stTxt) mid.appendChild(el('span', 'timeline-card-status', stTxt));
        c.appendChild(mid);

        c.addEventListener('click', () => {
          if (it.class_id != null) pushDetail('horseDetail', { kind: 'horse', key: String(it.horseName || '') });
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

    if (state.screen === 'start') return renderStart();
    if (state.screen === 'horses') return renderHorses(sIdx, tIdx);

    if (state.screen === 'rings' || state.screen === 'schedule') return renderRings(sIdx, tIdx);

    if (state.screen === 'timeline') return renderTimeline(sIdx, tIdx);

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

      let next = btn.dataset.screen;

      // Schedule always renders FULL and is the Rings/Schedule screen.
      if (next === 'schedule') next = 'rings';

      state.history = [];
      state.detail = null;
      if (next !== 'rings') state.inlineDetail = null;

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
