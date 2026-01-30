// app.js — CRT Daily Show (Legacy UI contract + Cards + Peaks + Schedule/Timeline modes)
//
// Data:
//   ./data/latest/watch_schedule.json (context scaffold)
//   ./data/latest/watch_trips.json    (truth overlay)
//
// Fixes in this drop:
// 1) Schedule click rules kept: class line -> class detail, horse -> horse detail, time -> timeline (#timeline)
// 2) Peakbar hash scroll offset increased so ring headers land BELOW peakbar
// 3) Bottom-nav “Schedule” stays active even when you open horse/rider detail FROM schedule
// 4) Schedule rollups are now WRAPPED grid (3 across) instead of horizontal scroller
// 5) Timeline gutter/horse column reduced to 60px + ellipsis; timeline cards de-dupe by same startMin
//
// Spec implemented:
// - Horse detail: schedule-style card scoped to horse; group rows + class rows + rider chips rollup
// - Class detail: schedule-style ring card scoped to class; entry blocks (2-line) per entry
// - Rider detail: same as class detail but scoped to rider; grouped by group/class; entry blocks

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
    let appEl, appMain, screenRoot, headerTitle, headerBack, headerAction, navRow;

  function mountShell() {
    const mount = document.getElementById('app') || document.querySelector('.app');
    if (!mount) throw new Error('Missing #app mount');

    // Clear (idempotent)
    mount.innerHTML = '';

    // Header
    const header = document.createElement('header');
    header.className = 'app-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'header-back';
    backBtn.id = 'header-back';
    backBtn.type = 'button';
    backBtn.innerHTML = '<span>&larr;</span>';

    const title = document.createElement('h1');
    title.className = 'header-title';
    title.id = 'header-title';
    title.textContent = 'Start';

    const spacer = document.createElement('div');
    spacer.className = 'header-spacer';
    spacer.setAttribute('aria-hidden', 'true');

    header.appendChild(backBtn);
    header.appendChild(title);
    header.appendChild(spacer);

    // Main
    const main = document.createElement('main');
    main.className = 'app-main';
    main.id = 'app-main';

    const root = document.createElement('div');
    root.id = 'screen-root';
    root.className = 'list-column';
    main.appendChild(root);

    // Nav
    const nav = document.createElement('nav');
    nav.className = 'app-nav';

    const navScroller = document.createElement('div');
    navScroller.className = 'nav-scroller';

    const navRowEl = document.createElement('div');
    navRowEl.className = 'nav-row';
    navRowEl.id = 'nav-row';

    navRowEl.innerHTML = [
      '<button class="nav-btn" type="button" data-screen="start"><span class="nav-label">Start</span></button>',
      '<button class="nav-btn" type="button" data-screen="horses"><span class="nav-label">Horses</span><span class="nav-agg" data-nav-agg="horses">0</span></button>',
      '<button class="nav-btn" type="button" data-screen="riders"><span class="nav-label">Riders</span><span class="nav-agg" data-nav-agg="riders">0</span></button>',
      '<button class="nav-btn" type="button" data-screen="schedule"><span class="nav-label">Schedule</span></button>',
      '<button class="nav-btn" type="button" data-screen="timeline"><span class="nav-label">Timeline</span></button>'
    ].join('');

    navScroller.appendChild(navRowEl);
    nav.appendChild(navScroller);

    mount.appendChild(header);
    mount.appendChild(main);
    mount.appendChild(nav);

    // Refs
    appEl = mount;
    appMain = main;
    screenRoot = root;
    headerTitle = title;
    headerBack = backBtn;
    headerAction = document.getElementById('header-action'); // optional
    navRow = navRowEl;
  }

  mountShell();
  bindChromeScroll();

  function bindChromeScroll() {
    let lastTop = 0;
    const THRESH = 8;
    let ticking = false;

    function apply(dir, top) {
      if (top <= 4) {
        appEl.classList.remove('hide-header');
        appEl.classList.remove('hide-nav');
        return;
      }
      if (dir === 'down') {
        appEl.classList.add('hide-header');
        appEl.classList.add('hide-nav');
      } else if (dir === 'up') {
        appEl.classList.remove('hide-header');
        appEl.classList.remove('hide-nav');
      }
    }

    appMain.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const top = appMain.scrollTop || 0;
        const delta = top - lastTop;
        const dir = (delta > THRESH) ? 'down' : (delta < -THRESH) ? 'up' : null;
        if (dir) apply(dir, top);
        lastTop = top;
        ticking = false;
      });
    }, { passive: true });
  }


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

    filter: {
      horse: null
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
    if (headerAction) headerAction.hidden = true;
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
      const ap = m[3].toUpperCase();
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

    const startLabel = (trip && (trip.latestStart || trip.latestGO || trip.estimated_start_time))
      ? String(trip.latestStart || trip.latestGO || trip.estimated_start_time).trim()
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

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ----------------------------
  // INDEXES (schedule scaffold + trips truth)
  // ----------------------------
  function buildScheduleIndex() {
    const ringMap = new Map();
    const classMap = new Map();

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
    const byEntryKey = new Map();
    const byHorse = new Map();
    const byRing = new Map();
    const byGroup = new Map();
    const byClass = new Map();
    const byRider = new Map();

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
    for (const [k, list] of byEntryKey.entries()) {
      entryBest.set(k, pickBestTrip(list));
    }

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

    // ----------------------------
  // Filterbottom (horse chips) — schedule only
  // ----------------------------
  function buildHorseChips(qRing, sIdx) {
    const q = normalizeStr(qRing || '');
    const map = new Map();

    for (const t of (state.trips || [])) {
      if (!t) continue;
      if (t.ring_number == null) continue;

      const ringName = (t.ringName ? String(t.ringName) : (sIdx && sIdx.ringMap && sIdx.ringMap.get(String(t.ring_number)) ? String(sIdx.ringMap.get(String(t.ring_number)).ringName || '') : `Ring ${t.ring_number}`));
      if (q && !normalizeStr(ringName).includes(q)) continue;

      const key = (t.entry_id != null) ? String(t.entry_id) : (t.horseName ? String(t.horseName) : null);
      if (!key) continue;

      const label = t.horseName ? String(t.horseName) : key;
      map.set(key, label);
    }

    const items = [...map.entries()].map(([key, label]) => ({ key, label }));
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
  }

  function clearFilterBottom() {
    const existing = document.getElementById('filterbottom');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function renderFilterBottom(items, activeKey) {
    // Only for schedule screen
    if (state.screen !== 'schedule') {
      clearFilterBottom();
      return;
    }

    clearFilterBottom();

    const bar = document.createElement('div');
    bar.className = 'filterbottom';
    bar.id = 'filterbottom';

    const row = document.createElement('div');
    row.className = 'filterbottom-row';

    function addChip(label, key) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + ((key === activeKey) ? ' is-active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.filter = state.filter || { horse: null };

        // toggle: clicking the active chip clears the filter
        if (!key) {
          state.filter.horse = null;
        } else if (activeKey && String(activeKey) === String(key)) {
          state.filter.horse = null;
        } else {
          state.filter.horse = String(key);
        }

        render();
      });
      row.appendChild(btn);
    }

    // All chip (always)
    addChip('All', null);

    // If a horse is active, only show that horse (plus All)
    if (activeKey) {
      const found = items.find(x => x.key === activeKey);
      if (found) addChip(found.label, found.key);
    } else {
      items.forEach(it => addChip(it.label, it.key));
    }

    bar.appendChild(row);

    // Insert above nav
    const nav = appEl && appEl.querySelector('.app-nav');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav);
    else (appEl || document.body).appendChild(bar);
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

  function addCardLine4(card, aTxt, bTxt, cTxt, dNodeOrTxt, handlers) {
    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line4');

    const a = el('div', 'c4-a', aTxt || '');
    const b = el('div', 'c4-b', bTxt || '');
    const c = el('div', 'c4-c', cTxt || '');
    const d = el('div', 'c4-d');

    if (dNodeOrTxt && typeof dNodeOrTxt === 'object' && dNodeOrTxt.nodeType) {
      d.appendChild(dNodeOrTxt);
    } else if (dNodeOrTxt != null) {
      d.textContent = String(dNodeOrTxt);
    }

    if (handlers && handlers.onA) {
      a.style.cursor = 'pointer';
      a.addEventListener('click', (e) => { e.stopPropagation(); handlers.onA(); });
    }
    if (handlers && handlers.onB) {
      b.style.cursor = 'pointer';
      b.addEventListener('click', (e) => { e.stopPropagation(); handlers.onB(); });
    }
    if (handlers && handlers.onC) {
      c.style.cursor = 'pointer';
      c.addEventListener('click', (e) => { e.stopPropagation(); handlers.onC(); });
    }
    if (handlers && handlers.onD) {
      d.style.cursor = 'pointer';
      d.addEventListener('click', (e) => { e.stopPropagation(); handlers.onD(); });
    }
    if (handlers && handlers.onRow) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', () => handlers.onRow());
    }

    line.appendChild(a);
    line.appendChild(b);
    line.appendChild(c);
    line.appendChild(d);
    body.appendChild(line);
  }

  function addEntryRollup(card, bestTrips, onChipClick) {
    if (!bestTrips || bestTrips.length === 0) return;

    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    line.appendChild(el('div', 'c-time', ''));

    const mid = el('div', 'c-name');
    const roll = el('div', 'entry-rollup-grid');

    bestTrips.forEach((t) => {
      const label = (typeof onChipClick === 'function')
        ? onChipClick(t, roll, card)
        : null;

      if (label === null) return;
    });

    if (!roll.childNodes.length) return;

    mid.appendChild(roll);
    line.appendChild(mid);
    line.appendChild(el('div', 'c-agg'));
    body.appendChild(line);
  }

  function addHorseChipsRollup(card, trips) {
    if (!trips || trips.length === 0) return;

    const sorted = trips.slice().sort((a, b) => {
      const oa = safeNum(a.lastOOG, 999999);
      const ob = safeNum(b.lastOOG, 999999);
      if (oa !== ob) return oa - ob;
      return String(a.horseName || '').localeCompare(String(b.horseName || ''));
    });

    addEntryRollup(card, sorted, (t, roll) => {
      const horse = (t && t.horseName) ? String(t.horseName).trim() : '';
      const oog = (t && t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG).trim() : '';
      if (!horse || !oog) return null;

      const chip = el('button', { className: 'entry-chip', type: 'button', text: `${horse} - ${oog}` });
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        pushDetail('horseDetail', { kind: 'horse', key: horse });
      });

      roll.appendChild(chip);
      return '';
    });
  }

  function addRiderChipsRollup(card, trips) {
    if (!trips || trips.length === 0) return;

    const bestByRider = new Map();
    for (const t of trips) {
      const rn = t && t.riderName ? String(t.riderName).trim() : '';
      if (!rn) continue;
      const oog = safeNum(t.lastOOG, 999999);
      if (!bestByRider.has(rn) || oog < bestByRider.get(rn).oog) {
        bestByRider.set(rn, { riderName: rn, oog: oog, raw: t });
      }
    }

    const list = [...bestByRider.values()].sort((a, b) => {
      if (a.oog !== b.oog) return a.oog - b.oog;
      return String(a.riderName).localeCompare(String(b.riderName));
    });

    addEntryRollup(card, list, (it, roll) => {
      const riderName = it && it.riderName ? String(it.riderName).trim() : '';
      if (!riderName) return null;
      const oogTxt = (Number.isFinite(it.oog) && it.oog !== 999999) ? String(it.oog) : '';
      const chipTxt = oogTxt ? `${riderName} - ${oogTxt}` : riderName;

      const chip = el('button', { className: 'entry-chip', type: 'button', text: chipTxt });
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        pushDetail('riderDetail', { kind: 'rider', key: riderName });
      });

      roll.appendChild(chip);
      return '';
    });
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
        try { await loadAll(); } catch (_) {}
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

  function findGroupInSchedule(sIdx, gid) {
    const gidStr = String(gid);
    for (const r of sIdx.ringMap.values()) {
      if (r.groups.has(gidStr)) {
        return { ring: r, group: r.groups.get(gidStr) };
      }
    }
    return null;
  }

  function findClassInSchedule(sIdx, classId) {
    const cidStr = String(classId);
    for (const r of sIdx.ringMap.values()) {
      for (const g of r.groups.values()) {
        if (g.classes.has(cidStr)) {
          return { ring: r, group: g, cls: g.classes.get(cidStr) };
        }
      }
    }
    return null;
  }

  function renderHorseDetail(sIdx, tIdx) {
    const horse = state.detail && state.detail.key ? String(state.detail.key) : null;

    clearRoot();
    setHeader(horse || 'Horse');

    if (!horse) return;

    const entryKeys = (tIdx.byHorse.get(horse) || []).slice();
    if (!entryKeys.length) return;

    const bestTrips = entryKeys
      .map(k => tIdx.entryBest.get(k))
      .filter(Boolean);

    const card = makeCard(horse, entryKeys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'horse';

    const groupsMap = new Map();
    const classMap = new Map();

    for (const t of bestTrips) {
      const gid = t && t.class_group_id != null ? String(t.class_group_id) : null;
      const cid = t && t.class_id != null ? String(t.class_id) : null;
      if (gid) {
        if (!groupsMap.has(gid)) {
          const sg = findGroupInSchedule(sIdx, gid);
          groupsMap.set(gid, sg ? sg.group : {
            class_group_id: gid,
            group_name: (t.group_name || t.class_name || '(Group)'),
            latestStart: t.latestStart || null,
            latestStatus: t.latestStatus || null,
            classes: new Map()
          });
        }
      }
      if (cid) {
        if (!classMap.has(cid)) {
          const sc = findClassInSchedule(sIdx, cid);
          classMap.set(cid, sc ? sc.cls : {
            class_id: cid,
            class_number: t.class_number,
            class_name: t.class_name || '(Class)',
            latestStart: t.latestStart || null,
            latestStatus: t.latestStatus || null
          });
        }
      }
    }

    const groups = [...groupsMap.values()].sort((a, b) => {
      const ta = timeToMinutes(a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.group_name || '').localeCompare(String(b.group_name || ''));
    });

    for (const g of groups) {
      const gid = String(g.class_group_id);

      addCardLine(
        card,
        fmtTimeShort(g.latestStart || ''),
        String(g.group_name || ''),
        (fmtStatus4(g.latestStatus) ? el('div', 'row-tag row-tag--count', fmtStatus4(g.latestStatus)) : null),
        {
          onLeft: () => gotoTimeline(),
          onMid: () => pushDetail('groupDetail', { kind: 'group', key: gid })
        }
      );

      const classIdsForGroup = new Map();
      for (const k of entryKeys) {
        const t = tIdx.entryBest.get(k);
        if (!t) continue;
        if (t.class_group_id == null) continue;
        if (String(t.class_group_id) !== gid) continue;
        if (t.class_id == null) continue;
        const cid = String(t.class_id);
        if (!classIdsForGroup.has(cid)) classIdsForGroup.set(cid, 0);
        classIdsForGroup.set(cid, classIdsForGroup.get(cid) + 1);
      }

      const clsList = [...classIdsForGroup.entries()]
        .map(([cid, cnt]) => {
          const c = classMap.get(cid);
          return { cid, cnt, c };
        })
        .sort((a, b) => {
          const na = (a.c && a.c.class_number != null) ? Number(a.c.class_number) : 999999;
          const nb = (b.c && b.c.class_number != null) ? Number(b.c.class_number) : 999999;
          if (na !== nb) return na - nb;
          return String((a.c && a.c.class_name) || '').localeCompare(String((b.c && b.c.class_name) || ''));
        });

      for (const it of clsList) {
        const c = it.c || {};
        addCardLine(
          card,
          (c.class_number != null ? String(c.class_number) : ''),
          String(c.class_name || ''),
          makeTagCount(it.cnt),
          { onRow: () => pushDetail('classDetail', { kind: 'class', key: String(it.cid) }) }
        );
      }
    }

    addRiderChipsRollup(card, bestTrips);
    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: SCHEDULE (rings)
  // ----------------------------
    function renderSchedule(sIdx, tIdx) {
    clearRoot();
    setHeader('Schedule');

    // page-level controls
    screenRoot.appendChild(renderSearch('rings', 'Search rings...'));

    const qRing = normalizeStr(state.search.rings);
    const horseFilter = state.filter && state.filter.horse ? String(state.filter.horse) : null;

    // ----------------------------
    // Build hierarchy from watch_trips (flat -> dimensions)
    // ring_number -> group_id -> class_id -> class_number -> entry_id -> trips
    // ----------------------------
    const ringMap = new Map();

    function ringSortKey(rn) { return safeNum(rn, 999999); }

    function statusRank(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 3;
      if (s.includes('upcoming')) return 2;
      if (s.includes('complete')) return 1;
      return 0;
    }

    function statusLetter(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 'L';
      if (s.includes('upcoming')) return 'S';
      if (s.includes('complete')) return 'C';
      return '';
    }

    function statusTintClass(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 'tint-L';
      if (s.includes('upcoming')) return 'tint-S';
      if (s.includes('complete')) return 'tint-C';
      return '';
    }

    function getRingNameFromTrip(t) {
      if (t && t.ringName) return String(t.ringName);
      const rn = t && t.ring_number != null ? String(t.ring_number) : null;
      const rObj = rn && sIdx && sIdx.ringMap ? sIdx.ringMap.get(rn) : null;
      if (rObj && rObj.ringName) return String(rObj.ringName);
      return rn ? `Ring ${rn}` : 'Ring';
    }

    function getOrInit(map, key, factory) {
      if (!map.has(key)) map.set(key, factory());
      return map.get(key);
    }

    for (const t of (state.trips || [])) {
      if (!t) continue;
      if (t.ring_number == null) continue;
      if (t.class_id == null) continue;

      // ring search filter
      const rnStr = String(t.ring_number);
      const ringName = getRingNameFromTrip(t);
      if (qRing && !normalizeStr(ringName).includes(qRing)) continue;

      // horse filter (entry_id preferred; fallback horseName)
      const entryKey = (t.entry_id != null) ? String(t.entry_id) : (t.horseName ? String(t.horseName) : null);
      if (!entryKey) continue;
      if (horseFilter && entryKey !== horseFilter) continue;

      const ringObj = getOrInit(ringMap, rnStr, () => ({
        ring_number: t.ring_number,
        ringName,
        classIdSet: new Set(),
        groups: new Map()
      }));

      ringObj.classIdSet.add(String(t.class_id));

      const gid = (t.class_group_id != null) ? String(t.class_group_id) : '__nogroup__';
      const groupObj = getOrInit(ringObj.groups, gid, () => ({
        class_group_id: gid,
        group_name: t.group_name ? String(t.group_name) : '',
        statusRank: 0,
        latestStatus: '',
        classes: new Map()
      }));

      // group status (max rank)
      const rnk = statusRank(t.latestStatus);
      if (rnk > groupObj.statusRank) {
        groupObj.statusRank = rnk;
        groupObj.latestStatus = t.latestStatus || '';
      }

      const cid = String(t.class_id);
      const classObj = getOrInit(groupObj.classes, cid, () => ({
        class_id: cid,
        class_name: t.class_name ? String(t.class_name) : '',
        class_type: t.class_type ? String(t.class_type) : '',
        schedule_sequencetype: t.schedule_sequencetype ? String(t.schedule_sequencetype) : '',
        classNumbers: new Map()
      }));

      const classNumKey = (t.class_number != null) ? String(t.class_number) : '';
      const cn = (t.class_number != null) ? Number(t.class_number) : null;

      const classNumObj = getOrInit(classObj.classNumbers, classNumKey, () => ({
        class_number: cn,
        latestStart: t.latestStart || '',
        latestStatus: t.latestStatus || '',
        statusRank: statusRank(t.latestStatus),
        total_trips: t.total_trips != null ? t.total_trips : null,
        entries: new Map()
      }));

      // prefer stronger status for classNum
      const cnRank = statusRank(t.latestStatus);
      if (cnRank > classNumObj.statusRank) {
        classNumObj.statusRank = cnRank;
        classNumObj.latestStatus = t.latestStatus || '';
      }
      if (!classNumObj.latestStart && t.latestStart) classNumObj.latestStart = t.latestStart;

      const entryObj = getOrInit(classNumObj.entries, entryKey, () => ({
        entry_id: entryKey,
        entryNumber: t.entryNumber != null ? String(t.entryNumber) : '',
        horseName: t.horseName ? String(t.horseName) : '',
        trips: []
      }));

      if (!entryObj.entryNumber && t.entryNumber != null) entryObj.entryNumber = String(t.entryNumber);
      if (!entryObj.horseName && t.horseName) entryObj.horseName = String(t.horseName);

      entryObj.trips.push(t);
    }

    const ringsAll = [...ringMap.values()].sort((a, b) => ringSortKey(a.ring_number) - ringSortKey(b.ring_number));

    // Peakbar (anchors)
    const peakItems = ringsAll.map(r => {
      const rk = String(r.ring_number);
      return {
        key: rk,
        label: String(r.ringName),
        agg: (r.classIdSet ? r.classIdSet.size : 0),
        href: `#ring-${rk}`
      };
    });
    screenRoot.appendChild(renderPeakBar(peakItems));

    // Ring cards
    const ringContainer = el('div', 'list-column');
    ringContainer.dataset.kind = 'ringContainer';

    let stripe = 0;

    function addLine4(parent, a, b, cNode, dNode, rowClass, extraClass, handlers) {
      const line = el('div', 'card-line4' + (rowClass ? (' ' + rowClass) : '') + (extraClass ? (' ' + extraClass) : ''));
      const cA = el('div', 'c4-a', a || '');
      const cB = el('div', 'c4-b', b || '');
      const cC = el('div', 'c4-c');
      const cD = el('div', 'c4-d');

      if (cNode instanceof Node) cC.appendChild(cNode);
      else if (cNode != null) cC.textContent = String(cNode);

      if (dNode instanceof Node) cD.appendChild(dNode);
      else if (dNode != null) cD.textContent = String(dNode);

      line.appendChild(cA);
      line.appendChild(cB);
      line.appendChild(cC);
      line.appendChild(cD);

      let h = handlers;
      if (typeof h === 'function') h = { onRow: h };
      if (!h) h = {};

      const any = !!(h.onRow || h.onA || h.onB || h.onC || h.onD);
      if (any) line.style.cursor = 'pointer';

      if (h.onRow) line.addEventListener('click', h.onRow);

      function bindCell(cell, fn) {
        if (!fn) return;
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
      }

      bindCell(cA, h.onA);
      bindCell(cB, h.onB);
      bindCell(cC, h.onC);
      bindCell(cD, h.onD);

      parent.appendChild(line);
    }

    function makeBadge(txt, cls) {
      const b = el('span', 'badge' + (cls ? (' ' + cls) : ''), txt);
      return b;
    }

    function nodeWithBadges(badges, text) {
      const wrap = el('div', '');
      for (const b of badges) wrap.appendChild(b);
      if (badges.length) wrap.appendChild(el('span', '', ' '));
      wrap.appendChild(document.createTextNode(text || ''));
      return wrap;
    }

    for (const r of ringsAll) {
      const rk = String(r.ring_number);
      if (!r.groups || r.groups.size === 0) continue;

      const card = el('div', 'card');
      card.id = `ring-${rk}`;
      const body = el('div', 'card-body');
      card.appendChild(body);

      // Ring header row (ringName | | | agg)
      addLine4(
        body,
        String(r.ringName),
        '',
        document.createTextNode(''),
        String(r.classIdSet ? r.classIdSet.size : 0),
        'row--class',
        '',
        { onRow: () => pushDetail('ringDetail', { kind: 'ring', key: rk }) }
      );

      // groups
      const groups = [...r.groups.values()].sort((a, b) => {
        // stable: status rank desc then name
        if (a.statusRank !== b.statusRank) return b.statusRank - a.statusRank;
        return String(a.group_name || '').localeCompare(String(b.group_name || ''));
      });

      for (const g of groups) {
        if (!g.classes || g.classes.size === 0) continue;

        const gWrap = el('div', 'group-wrap ' + statusTintClass(g.latestStatus));
        body.appendChild(gWrap);

        const classes = [...g.classes.values()].sort((a, b) => {
          // sort by lowest class_number present, then name
          const aMin = Math.min(...[...a.classNumbers.values()].map(x => safeNum(x.class_number, 999999)));
          const bMin = Math.min(...[...b.classNumbers.values()].map(x => safeNum(x.class_number, 999999)));
          if (aMin !== bMin) return aMin - bMin;
          return String(a.class_name || '').localeCompare(String(b.class_name || ''));
        });

        for (const c of classes) {
          const classNums = [...c.classNumbers.values()].sort((a, b) => safeNum(a.class_number, 999999) - safeNum(b.class_number, 999999));

          for (const cn of classNums) {
            if (!cn.entries || cn.entries.size === 0) continue;

            // CLASS ROW
            const typeBadge = c.class_type ? makeBadge(String(c.class_type).slice(0, 1).toUpperCase(), 'badge--type') : null;
            const seqBadge = c.schedule_sequencetype ? makeBadge(String(c.schedule_sequencetype).slice(0, 1).toUpperCase(), 'badge--seq') : null;

            const statusL = statusLetter(cn.latestStatus);
            const statusBadge = statusL ? makeBadge(statusL, 'badge--status') : null;

            const classNameText = String(c.class_name || '').trim();

            // col C = name only; col D = ALL badges (status + type + seq)
            const badges = document.createDocumentFragment();
            if (statusBadge) badges.appendChild(statusBadge);
            if (typeBadge) badges.appendChild(typeBadge);
            if (seqBadge) badges.appendChild(seqBadge);

            stripe++;
            addLine4(
              gWrap,
              fmtTimeShort(cn.latestStart || ''),
              String(cn.class_number || ''),
              classNameText,
              badges,
              'row--class',
              (stripe % 2 === 0 ? 'row-alt' : ''),
              {
                onA: () => gotoTimeline(),
                onRow: () => pushDetail('classDetail', { kind: 'class', key: String(c.class_id) })
              }
            );

            // ENTRIES
            const entries = [...cn.entries.values()].sort((a, b) => {
              const ea = safeNum(a.entryNumber, 999999);
              const eb = safeNum(b.entryNumber, 999999);
              if (ea !== eb) return ea - eb;
              return String(a.horseName || '').localeCompare(String(b.horseName || ''));
            });

            for (const eObj of entries) {
              const best = pickBestTrip(eObj.trips || []);
              const entryNo = eObj.entryNumber || (best && best.entryNumber != null ? String(best.entryNumber) : '');
              const go = best ? (best.latestGO || '') : '';
              const lastOog = best ? safeNum(best.lastOOG, null) : null;
              const totalTrips = cn.total_trips != null ? String(cn.total_trips) : '';

              const oogText =
                (lastOog != null && totalTrips) ? `${lastOog}/${totalTrips}` :
                (lastOog != null) ? String(lastOog) :
                (totalTrips) ? `/${totalTrips}` : '';

              stripe++;
              addLine4(
                gWrap,
                fmtTimeShort(go),
                entryNo,
                document.createTextNode(eObj.horseName || ''),
                oogText,
                'row--entry',
                (stripe % 2 === 0 ? 'row-alt' : ''),
                {
                  onA: () => gotoTimeline(),
                  onRow: () => pushDetail('horseDetail', {
                    kind: 'horse',
                    key: String(eObj.horseName || eObj.entry_id || ''),
                    entry_id: (eObj.entry_id != null ? String(eObj.entry_id) : null)
                  })
                }
              );

              // TRIPS (child)
              const trips = (eObj.trips || []).slice().sort((a, b) => {
                const oa = safeNum(a.lastOOG, 999999);
                const ob = safeNum(b.lastOOG, 999999);
                if (oa !== ob) return oa - ob;
                return String(a.riderName || '').localeCompare(String(b.riderName || ''));
              });

              for (const t of trips) {
                const back = t.backNumber != null ? String(t.backNumber) : (t.entryNumber != null ? String(t.entryNumber) : '');
                const rider = t.riderName ? String(t.riderName) : '';
                const score = (t.latestScore != null && String(t.latestScore) !== '') ? String(t.latestScore) : '';
                const placing = (t.latestPlacing != null && String(t.latestPlacing) !== '') ? String(t.latestPlacing) : '';
                const right = score || placing || '';

                stripe++;
                addLine4(
                  gWrap,
                  '',
                  back,
                  document.createTextNode(rider),
                  right,
                  'row--trip',
                  (stripe % 2 === 0 ? 'row-alt' : ''),
                  {
                    onRow: () => pushDetail('riderDetail', { kind: 'rider', key: String(rider || '') })
                  }
                );
              }
            }
          }
        }
      }

      ringContainer.appendChild(card);
    }

    screenRoot.appendChild(ringContainer);

    // Filterbottom (horse chips) OUTSIDE app-main, above nav
    const chips = buildHorseChips(state.search.rings, sIdx);
    renderFilterBottom(chips, horseFilter);

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
        (fmtStatus4(g.latestStatus) ? el('div', 'row-tag row-tag--count', fmtStatus4(g.latestStatus)) : null),
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

        const bestTrips = cKeys
          .map(k => tIdx.entryBest.get(k))
          .filter(Boolean)
          .sort((a, b) => {
            const oa = safeNum(a.lastOOG, 999999);
            const ob = safeNum(b.lastOOG, 999999);
            if (oa !== ob) return oa - ob;
            return String(a.horseName || '').localeCompare(String(b.horseName || ''));
          })
          .slice(0, 20);

        addHorseChipsRollup(card, bestTrips);
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

      const bestTrips = cKeys
        .map(k => tIdx.entryBest.get(k))
        .filter(Boolean)
        .sort((a, b) => {
          const oa = safeNum(a.lastOOG, 999999);
          const ob = safeNum(b.lastOOG, 999999);
          if (oa !== ob) return oa - ob;
          return String(a.horseName || '').localeCompare(String(b.horseName || ''));
        })
        .slice(0, 20);

      addHorseChipsRollup(card, bestTrips);
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

  function renderRiderDetail(sIdx, tIdx) {
    const rider = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader(rider || 'Rider');

    if (!rider) return;

    const keys = tIdx.byRider.get(rider) || [];
    if (keys.length === 0) return;

    const bestTrips = keys
      .map(k => tIdx.entryBest.get(k))
      .filter(Boolean);

    const card = makeCard(rider, keys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'rider';

    const byGroup = new Map();
    for (const t of bestTrips) {
      const gid = (t && t.class_group_id != null) ? String(t.class_group_id) : '';
      const cid = (t && t.class_id != null) ? String(t.class_id) : '';
      if (!gid || !cid) continue;
      if (!byGroup.has(gid)) byGroup.set(gid, new Map());
      const byClass = byGroup.get(gid);
      if (!byClass.has(cid)) byClass.set(cid, []);
      byClass.get(cid).push(t);
    }

    const groupOrder = [...byGroup.keys()].sort((a, b) => {
      const ga = findGroupInSchedule(sIdx, a);
      const gb = findGroupInSchedule(sIdx, b);
      const ta = timeToMinutes(ga && ga.group && ga.group.latestStart) ?? 999999;
      const tb = timeToMinutes(gb && gb.group && gb.group.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String((ga && ga.group && ga.group.group_name) || '').localeCompare(String((gb && gb.group && gb.group.group_name) || ''));
    });

    for (const gid of groupOrder) {
      const sg = findGroupInSchedule(sIdx, gid);
      const gObj = sg ? sg.group : null;

      const gTitle = gObj ? String(gObj.group_name || '') : 'Group';
      const gTime = gObj ? fmtTimeShort(gObj.latestStart || '') : '';
      const gStatus = gObj ? fmtStatus4(gObj.latestStatus) : '';

      addCardLine(
        card,
        gTime,
        gTitle,
        (gStatus ? el('div', 'row-tag row-tag--count', gStatus) : null),
        {
          onLeft: () => gotoTimeline(),
          onMid: () => pushDetail('groupDetail', { kind: 'group', key: String(gid) })
        }
      );

      const byClass = byGroup.get(gid);
      const classIds = [...byClass.keys()].sort((a, b) => {
        const ca = findClassInSchedule(sIdx, a);
        const cb = findClassInSchedule(sIdx, b);
        const na = (ca && ca.cls && ca.cls.class_number != null) ? Number(ca.cls.class_number) : 999999;
        const nb = (cb && cb.cls && cb.cls.class_number != null) ? Number(cb.cls.class_number) : 999999;
        if (na !== nb) return na - nb;
        return String((ca && ca.cls && ca.cls.class_name) || '').localeCompare(String((cb && cb.cls && cb.cls.class_name) || ''));
      });

      for (const cid of classIds) {
        const sc = findClassInSchedule(sIdx, cid);
        const ringName = sc ? sc.ring.ringName : '';
        const clsNum = sc && sc.cls && sc.cls.class_number != null ? String(sc.cls.class_number) : '';
        const clsName = sc && sc.cls && sc.cls.class_name ? String(sc.cls.class_name) : '';
        const agg = (byClass.get(cid) || []).length;

        addCardLine(
          card,
          clsNum,
          clsName,
          makeTagCount(agg),
          { onRow: () => pushDetail('classDetail', { kind: 'class', key: String(cid) }) }
        );

        const entries = (byClass.get(cid) || []).slice().sort((a, b) => {
          const ga = timeToMinutes(a.latestGO) ?? 999999;
          const gbm = timeToMinutes(b.latestGO) ?? 999999;
          if (ga !== gbm) return ga - gbm;
          return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
        });

        for (const t of entries) {
          const col1 = fmtTimeShort(t.latestGO || t.latestStart || '');
          const col2 = (t.lastOOG != null ? String(t.lastOOG) : '');
          const col3 = String(t.horseName || '');
          const col4 = fmtStatus4(t.latestStatus);

          addCardLine4(
            card,
            col1,
            col2,
            col3,
            col4,
            {
              onA: () => gotoTimeline(),
              onC: () => pushDetail('horseDetail', { kind: 'horse', key: String(t.horseName || '') })
            }
          );

          const riderLine = String(t.riderName || rider);
          const team = t.teamName ? String(t.teamName) : '';
          const riderTxt = team ? `${riderLine} • ${team}` : riderLine;
          const backNum = (t.backNumber != null && String(t.backNumber).trim() !== '') ? String(t.backNumber).trim() : '';

          addCardLine4(
            card,
            '',
            '',
            riderTxt,
            backNum,
            {
              onC: () => pushDetail('riderDetail', { kind: 'rider', key: riderLine })
            }
          );
        }
      }
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: CLASS DETAIL
  // ----------------------------
  function renderClassDetail(sIdx, tIdx) {
    const classId = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Class');

    if (!classId) return;

    const cKeys = tIdx.byClass.get(classId) || [];
    if (cKeys.length === 0) return;

    const sc = findClassInSchedule(sIdx, classId);
    const ringName = sc ? sc.ring.ringName : '';
    const groupName = sc ? (sc.group.group_name || '') : '';
    const clsNum = sc && sc.cls && sc.cls.class_number != null ? String(sc.cls.class_number) : '';
    const clsName = sc && sc.cls && sc.cls.class_name ? String(sc.cls.class_name) : '';

    const title = (ringName && groupName)
      ? `${ringName} • ${groupName}`
      : (sc && sc.cls && sc.cls.class_name ? String(sc.cls.class_name) : `Class ${classId}`);

    const card = makeCard(title, cKeys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'class';

    if (sc && sc.group) {
      addCardLine(
        card,
        fmtTimeShort(sc.group.latestStart || ''),
        String(sc.group.group_name || ''),
        (fmtStatus4(sc.group.latestStatus) ? el('div', 'row-tag row-tag--count', fmtStatus4(sc.group.latestStatus)) : null),
        {
          onLeft: () => gotoTimeline(),
          onMid: () => pushDetail('groupDetail', { kind: 'group', key: String(sc.group.class_group_id) })
        }
      );
    }

    addCardLine(
      card,
      clsNum,
      clsName,
      makeTagCount(cKeys.length),
      {}
    );

    const bestTrips = cKeys
      .map(k => tIdx.entryBest.get(k))
      .filter(Boolean)
      .sort((a, b) => {
        const ga = timeToMinutes(a.latestGO) ?? 999999;
        const gb = timeToMinutes(b.latestGO) ?? 999999;
        if (ga !== gb) return ga - gb;
        return safeNum(a.lastOOG, 999999) - safeNum(b.lastOOG, 999999);
      });

    for (const t of bestTrips) {
      const col1 = fmtTimeShort(t.latestGO || t.latestStart || '');
      const col2 = (t.lastOOG != null ? String(t.lastOOG) : '');
      const col3 = String(t.horseName || '');
      const col4 = fmtStatus4(t.latestStatus);

      addCardLine4(
        card,
        col1,
        col2,
        col3,
        col4,
        {
          onA: () => gotoTimeline(),
          onC: () => pushDetail('horseDetail', { kind: 'horse', key: String(t.horseName || '') })
        }
      );

      const riderLine = String(t.riderName || '');
      const team = t.teamName ? String(t.teamName) : '';
      const riderTxt = team ? `${riderLine} • ${team}` : riderLine;
      const backNum = (t.backNumber != null && String(t.backNumber).trim() !== '') ? String(t.backNumber).trim() : '';

      addCardLine4(
        card,
        '',
        '',
        riderTxt,
        backNum,
        {
          onC: () => pushDetail('riderDetail', { kind: 'rider', key: riderLine })
        }
      );
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: TIMELINE
  // ----------------------------
  function renderTimeline(_sIdx, tIdx) {
    clearRoot();
    setHeader('Timeline');

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

          const goMin = timeToMinutes(it.latestGO) ?? 999999;
          const oog = safeNum(it.lastOOG, 999999);
          const cn = (it.class_number != null) ? Number(it.class_number) : 999999;
          const cname = String(it.class_name || '');

          return { it, startMin, endMin, goMin, oog, cn, cname };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.startMin !== b.startMin) return a.startMin - b.startMin;
          if (a.goMin !== b.goMin) return a.goMin - b.goMin;
          if (a.oog !== b.oog) return a.oog - b.oog;
          if (a.cn !== b.cn) return a.cn - b.cn;
          return a.cname.localeCompare(b.cname);
        });

      const seenStart = new Set();
      cards.forEach(({ it, startMin, endMin }) => {
        if (seenStart.has(startMin)) return;
        seenStart.add(startMin);

        const c = el('div', 'timeline-card');
        c.style.left = `${(startMin - DAY_START_MIN) * PX_PER_MIN}px`;
        c.style.width = `${Math.max(120, (endMin - startMin) * PX_PER_MIN)}px`;

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

    
    clearFilterBottom();
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
  loadAll().catch(() => {});
  render();
})();
