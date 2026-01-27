/*
CRT Daily Show — Single-file build (Option 1: sectioned app.js)

Edit rules:
- Keep this as ONE file (no bundler). No re-ordering unless explicitly required.
- Make changes inside the smallest relevant SECTION.

TABLE OF CONTENTS
01 CONFIG
02 STATE
03 DOM
04 UTIL
05 LOAD
06 INDEXES
07 GATING (toggles)
08 TOP CONTROLS (toggles + peak)
09 CARD BUILDERS
10 NAV + BACK
11 SCREENS (primary)
12 SCREENS (details)
13 RENDER
14 EVENTS
15 BOOT
*/

(function () {
  'use strict';

  // ============================================================
  // SECTION 01 — CONFIG
  // ============================================================

  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  const STATUS_COMPLETED = 'Completed';

  // ============================================================
  // SECTION 02 — STATE
  // ============================================================

  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    // global gating (toggles)
    ui: {
      scopeMode: 'ACTIVE',  // ACTIVE | FULL
      statusMode: 'LIVE'    // LIVE | ALL  (ALL includes completed)
    },

    // per-screen peak filters (must NOT share state with toggles)
    peak: {
      rings: new Set(),     // ring_number (string)
      classes: new Set(),   // class_group_id (string)
      riders: new Set()     // riderName (string)
    },

    // follow set (horses)
    followedHorses: new Set(),
    horseSearch: '',

    // nav
    screen: 'start',        // start | state | rings | classes | riders | summary | details...
    history: [],            // for back (details only)
    detail: null            // { kind, key }
  };

  // ============================================================
  // SECTION 03 — DOM
  // ============================================================

  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const navRow = document.getElementById('nav-row');

  // ============================================================
  // SECTION 04 — UTIL
  // ============================================================

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
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

  function normalizeStr(s) {
    return String(s || '').trim().toLowerCase();
  }

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
  }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title;
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

  // Parse "h:mm AM" into minutes since midnight (local display ordering only)
  function timeToMinutes(t) {
    if (!t || typeof t !== 'string') return null;
    const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = String(m[3]).toUpperCase();
    if (ap === 'AM') { if (hh === 12) hh = 0; }
    else { if (hh !== 12) hh += 12; }
    return hh * 60 + mm;
  }

  // ============================================================
  // SECTION 05 — LOAD
  // ============================================================

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.json();
  }

  async function loadAll() {
    const [sched, trips] = await Promise.all([fetchJson(DATA_SCHEDULE_URL), fetchJson(DATA_TRIPS_URL)]);

    const nextGenerated = (sched && sched.meta && sched.meta.generated_at) || (trips && trips.meta && trips.meta.generated_at) || null;
    if (state.loaded && nextGenerated && state.meta.generated_at === nextGenerated) return;

    state.schedule = Array.isArray(sched && sched.records) ? sched.records : [];
    state.trips = Array.isArray(trips && trips.records) ? trips.records : [];

    const dtScope =
      (sched && sched.meta && sched.meta.dt) ||
      (state.schedule[0] && state.schedule[0].dt) ||
      (state.trips[0] && state.trips[0].dt) ||
      null;

    const sidScope =
      (state.schedule[0] && state.schedule[0].sid) ||
      (state.trips[0] && state.trips[0].sid) ||
      null;

    state.meta = { dt: dtScope, sid: sidScope, generated_at: nextGenerated };

    // seed followed horses once
    if (state.followedHorses.size === 0) {
      const horses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean)).sort((a, b) => a.localeCompare(b));
      horses.forEach(h => state.followedHorses.add(h));
    }

    state.loaded = true;
    render();
  }

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ============================================================
  // SECTION 06 — INDEXES
  // ============================================================

  function buildIndexes() {
    const schedule = state.schedule || [];
    const trips = state.trips || [];

    const ringMap = new Map();      // ring_number -> { ring_number, ringName, groups: Map(gid->groupObj) }
    const groupMap = new Map();     // class_group_id -> groupObj
    const classMap = new Map();     // class_id -> scheduleRec (first)

    for (const r of schedule) {
      if (!r) continue;
      const ringN = r.ring_number;
      const ringName = r.ringName || (ringN != null ? `Ring ${ringN}` : 'Ring');
      const gid = r.class_group_id;
      const gname = r.group_name || r.class_name || '(Group)';
      const cid = r.class_id;

      if (ringN == null || gid == null || cid == null) continue;

      const ringKey = String(ringN);
      if (!ringMap.has(ringKey)) {
        ringMap.set(ringKey, { ring_number: ringN, ringName, groups: new Map() });
      }
      const ringObj = ringMap.get(ringKey);

      if (!ringObj.groups.has(String(gid))) {
        const gObj = {
          class_group_id: gid,
          group_name: gname,
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null,
          classes: new Map()
        };
        ringObj.groups.set(String(gid), gObj);
        groupMap.set(String(gid), gObj);
      }
      const gObj = ringObj.groups.get(String(gid));

      if (!gObj.classes.has(String(cid))) {
        const cObj = {
          class_id: cid,
          class_number: r.class_number,
          class_name: r.class_name || '(Class)',
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null,
          total_trips: r.total_trips || 0
        };
        gObj.classes.set(String(cid), cObj);
      }

      if (!classMap.has(String(cid))) classMap.set(String(cid), r);
    }

    const tripsByHorse = new Map();
    const tripsByRing = new Map();
    const tripsByGroup = new Map();
    const tripsByClass = new Map();
    const tripsByRider = new Map();
    const tripsByEntryKey = new Map(); // `${class_id}|${horseName}`

    function push(map, key, val) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(val);
    }

    for (const t of trips) {
      if (!t) continue;
      const horse = t.horseName ? String(t.horseName) : null;
      const ring = t.ring_number != null ? String(t.ring_number) : null;
      const gid = t.class_group_id != null ? String(t.class_group_id) : null;
      const cid = t.class_id != null ? String(t.class_id) : null;
      const rider = t.riderName ? String(t.riderName) : null;

      if (horse) push(tripsByHorse, horse, t);
      if (ring) push(tripsByRing, ring, t);
      if (gid) push(tripsByGroup, gid, t);
      if (cid) push(tripsByClass, cid, t);
      if (rider) push(tripsByRider, rider, t);
      if (cid && horse) push(tripsByEntryKey, `${cid}|${horse}`, t);
    }

    return { ringMap, groupMap, classMap, tripsByHorse, tripsByRing, tripsByGroup, tripsByClass, tripsByRider, tripsByEntryKey };
  }

  // ============================================================
  // SECTION 07 — GATING (toggles) — independent from peak
  // ============================================================

  function classIsCompleted(classId, idx) {
    const rec = idx.classMap.get(String(classId));
    const st = rec && rec.latestStatus;
    return st === STATUS_COMPLETED;
  }

  function tripIncluded(t, idx) {
    if (!t) return false;
    const horse = t.horseName ? String(t.horseName) : null;

    if (state.ui.scopeMode === 'ACTIVE') {
      if (!horse) return false;
      if (!state.followedHorses.has(horse)) return false;
    }

    if (state.ui.statusMode === 'LIVE') {
      if (t.class_id != null && classIsCompleted(t.class_id, idx)) return false;
    }

    return true;
  }

  function scheduleIncluded(rec) {
    if (!rec) return false;
    if (state.ui.statusMode === 'LIVE' && rec.latestStatus === STATUS_COMPLETED) return false;
    return true;
  }

  // ============================================================
  // SECTION 08 — TOP CONTROLS (toggles + peak)
  // ============================================================

  function renderToggleRow() {
    const scroller = el('div', 'top-scroller');
    const row = el('div', 'top-row');

    const btnScope = el('button', 'nav-btn', state.ui.scopeMode === 'ACTIVE' ? 'ACTIVE' : 'FULL');
    btnScope.classList.toggle('nav-btn--primary', true);
    btnScope.addEventListener('click', () => {
      state.ui.scopeMode = (state.ui.scopeMode === 'ACTIVE') ? 'FULL' : 'ACTIVE';
      render();
    });

    const btnStatus = el('button', 'nav-btn', state.ui.statusMode === 'LIVE' ? 'LIVE' : 'ALL');
    btnStatus.classList.toggle('nav-btn--primary', true);
    btnStatus.addEventListener('click', () => {
      state.ui.statusMode = (state.ui.statusMode === 'LIVE') ? 'ALL' : 'LIVE';
      render();
    });

    row.appendChild(btnScope);
    row.appendChild(btnStatus);
    scroller.appendChild(row);
    return scroller;
  }

  function renderPeakRow(items, selectedSet, onToggle) {
    if (!items || items.length === 0) return null;
    const scroller = el('div', 'top-scroller');
    const row = el('div', 'top-row');

    for (const it of items) {
      const b = el('button', 'nav-btn', it.label);
      b.classList.toggle('nav-btn--primary', selectedSet.has(it.key));
      b.addEventListener('click', () => onToggle(it.key));
      row.appendChild(b);
    }

    scroller.appendChild(row);
    return scroller;
  }

  function togglePeak(set, key) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
    render();
  }

  // ============================================================
  // SECTION 09 — CARD BUILDERS
  // ============================================================

  function makeTag(text, positive) {
    const t = el('div', 'row-tag row-tag--count', String(text));
    if (positive) t.classList.add('row-tag--positive');
    return t;
  }

  function makeCard(title, tagNode, active, onClick) {
    const c = el('div', 'card card--tap');
    if (active) c.classList.add('card--active');

    const hdr = el('div', 'card-header');
    const t = el('div', 'card-title', title);
    hdr.appendChild(t);
    if (tagNode) hdr.appendChild(tagNode);

    if (onClick) c.addEventListener('click', onClick);

    c.appendChild(hdr);
    return c;
  }

  function addLine(card, leftText, rightNode, onClick) {
    const line = el('div', 'card-line');
    const left = el('div', 'card-line-left', leftText);
    line.appendChild(left);
    if (rightNode) line.appendChild(rightNode);
    if (onClick) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    }
    let lines = card.querySelector('.card-lines');
    if (!lines) {
      lines = el('div', 'card-lines');
      card.appendChild(lines);
    }
    lines.appendChild(line);
  }

  // ============================================================
  // SECTION 10 — NAV + BACK
  // ============================================================

  function goto(screen) {
    // switching primary tabs: clear detail/back + peak for that screen only stays (legacy preference: keep; change if needed)
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

  // ============================================================
  // SECTION 11 — SCREENS (primary)
  // ============================================================

  function renderStart(idx) {
    clearRoot();
    setHeader('Start');
    setNavActive('start');

    const wrap = el('div', null);

    const logo = el('div', 'start-logo');
    logo.appendChild(el('div', 'start-logo-title', 'CRT Daily Show'));
    const sub = state.loaded
      ? `sid ${state.meta.sid || '-'} • ${state.meta.dt || '-'}`
      : 'Loading schedule...';
    const sub2 = state.meta.generated_at ? `generated ${state.meta.generated_at}` : '';
    logo.appendChild(el('div', 'start-logo-subtitle', sub));
    if (sub2) logo.appendChild(el('div', 'start-logo-subtitle', sub2));
    wrap.appendChild(logo);

    const btnRow = el('div', 'row row--tap');
    btnRow.appendChild(el('div', 'row-title', state.loaded ? 'Start Session' : 'Loading...'));
    btnRow.appendChild(makeTag(state.loaded ? 'GO' : '...'));
    btnRow.addEventListener('click', async () => {
      if (!state.loaded) {
        try { await loadAll(); } catch (_) {}
      }
      state.screen = 'state';
      render();
    });

    wrap.appendChild(btnRow);

    screenRoot.appendChild(wrap);
  }

  function renderState(idx) {
    clearRoot();
    setHeader('Active Horses');
    setNavActive('state');

    screenRoot.appendChild(renderToggleRow());

    // state-search (required)
    const ss = el('div', 'state-search');
    const input = el('input', 'state-search-input');
    input.type = 'text';
    input.placeholder = 'Search horses...';
    input.value = state.horseSearch || '';
    input.addEventListener('input', () => {
      state.horseSearch = input.value;
      render();
    });
    ss.appendChild(input);
    screenRoot.appendChild(ss);

    const allHorses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const q = normalizeStr(state.horseSearch);
    const horses = q ? allHorses.filter(h => normalizeStr(h).includes(q)) : allHorses;

    for (const h of horses) {
      const horseTripsAll = idx.tripsByHorse.get(String(h)) || [];
      const horseTrips = horseTripsAll.filter(t => tripIncluded(t, idx));
      const followed = state.followedHorses.has(String(h));

      const card = makeCard(
        String(h),
        makeTag(horseTrips.length),
        followed,
        () => {
          if (followed) state.followedHorses.delete(String(h));
          else state.followedHorses.add(String(h));
          render();
        }
      );

      // show 1-2 quick lines for context (next GO / OOG)
      const sorted = horseTrips.slice().sort((a, b) => {
        const ta = timeToMinutes(a && a.latestGO) ?? 999999;
        const tb = timeToMinutes(b && b.latestGO) ?? 999999;
        if (ta !== tb) return ta - tb;
        return (a && a.lastOOG != null ? a.lastOOG : 999999) - (b && b.lastOOG != null ? b.lastOOG : 999999);
      });

      const s0 = sorted[0];
      if (s0) {
        const left = `${s0.latestGO || ''} • ${s0.class_number || ''} ${s0.class_id || ''}`;
        const right = makeTag(s0.lastOOG != null ? `OOG ${s0.lastOOG}` : (s0.lastScore || ''));
        addLine(card, left.trim(), right);
      }

      screenRoot.appendChild(card);
    }
  }

  function renderRings(idx) {
    clearRoot();
    setHeader('Rings');
    setNavActive('rings');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    const rings = [...idx.ringMap.values()].sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));

    const peakItems = rings.map(r => ({ key: String(r.ring_number), label: String(r.ringName) }));
    const peakRow = renderPeakRow(peakItems, state.peak.rings, (k) => togglePeak(state.peak.rings, k));
    if (peakRow) screenRoot.appendChild(peakRow);

    const visible = state.peak.rings.size
      ? rings.filter(r => state.peak.rings.has(String(r.ring_number)))
      : rings;

    for (const r of visible) {
      // overlay count = trips in this ring (after gating)
      const ringTripsAll = idx.tripsByRing.get(String(r.ring_number)) || [];
      const ringTrips = ringTripsAll.filter(t => tripIncluded(t, idx));

      if (state.ui.scopeMode === 'ACTIVE' && ringTrips.length === 0) continue;

      const card = makeCard(
        String(r.ringName),
        makeTag(ringTrips.length, ringTrips.length > 0),
        ringTrips.length > 0,
        () => pushDetail('ringDetail', { kind: 'ring', key: String(r.ring_number) })
      );

      // show groups summary lines (time + group + overlay horses count)
      const groups = [...r.groups.values()].filter(scheduleIncluded).sort((a, b) => {
        const ta = timeToMinutes(a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      });

      for (const g of groups.slice(0, 6)) {
        const gTripsAll = idx.tripsByGroup.get(String(g.class_group_id)) || [];
        const gTrips = gTripsAll.filter(t => tripIncluded(t, idx));
        if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

        const left = `${g.latestStart || ''} • ${g.group_name}`;
        addLine(card, left.trim(), makeTag(gTrips.length, gTrips.length > 0), () => {
          pushDetail('groupDetail', { kind: 'group', key: String(g.class_group_id) });
        });
      }

      screenRoot.appendChild(card);
    }
  }

  function renderClasses(idx) {
    clearRoot();
    setHeader('Classes');
    setNavActive('classes');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    // Peak = groups
    const groupsAll = [];
    for (const r of idx.ringMap.values()) {
      for (const g of r.groups.values()) groupsAll.push(g);
    }
    const groups = groupsAll.filter(scheduleIncluded).sort((a, b) => {
      const ta = timeToMinutes(a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.group_name).localeCompare(String(b.group_name));
    });

    const peakItems = groups.map(g => ({ key: String(g.class_group_id), label: String(g.group_name) }));
    const peakRow = renderPeakRow(peakItems, state.peak.classes, (k) => togglePeak(state.peak.classes, k));
    if (peakRow) screenRoot.appendChild(peakRow);

    const visible = state.peak.classes.size
      ? groups.filter(g => state.peak.classes.has(String(g.class_group_id)))
      : groups;

    for (const g of visible) {
      const gTripsAll = idx.tripsByGroup.get(String(g.class_group_id)) || [];
      const gTrips = gTripsAll.filter(t => tripIncluded(t, idx));
      if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

      const card = makeCard(
        `${g.latestStart || ''} • ${g.group_name}`.trim(),
        makeTag(gTrips.length, gTrips.length > 0),
        gTrips.length > 0,
        () => pushDetail('groupDetail', { kind: 'group', key: String(g.class_group_id) })
      );

      const cls = [...g.classes.values()].filter(scheduleIncluded).sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
      for (const c of cls.slice(0, 8)) {
        const cTripsAll = idx.tripsByClass.get(String(c.class_id)) || [];
        const cTrips = cTripsAll.filter(t => tripIncluded(t, idx));
        if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

        addLine(card, `${c.class_number || ''} • ${c.class_name}`.trim(), makeTag(cTrips.length, cTrips.length > 0), () => {
          pushDetail('classDetail', { kind: 'class', key: String(c.class_id) });
        });
      }

      screenRoot.appendChild(card);
    }
  }

  function renderRiders(idx) {
    clearRoot();
    setHeader('Riders');
    setNavActive('riders');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    const includedTrips = state.trips.filter(t => tripIncluded(t, idx));
    const riders = uniqStrings(includedTrips.map(t => t && t.riderName).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    const peakItems = riders.map(r => ({ key: String(r), label: String(r) }));
    const peakRow = renderPeakRow(peakItems, state.peak.riders, (k) => togglePeak(state.peak.riders, k));
    if (peakRow) screenRoot.appendChild(peakRow);

    const visible = state.peak.riders.size ? riders.filter(r => state.peak.riders.has(String(r))) : riders;

    for (const r of visible) {
      const rTripsAll = idx.tripsByRider.get(String(r)) || [];
      const rTrips = rTripsAll.filter(t => tripIncluded(t, idx));
      if (state.ui.scopeMode === 'ACTIVE' && rTrips.length === 0) continue;

      const card = makeCard(String(r), makeTag(rTrips.length, rTrips.length > 0), rTrips.length > 0, () => {
        pushDetail('riderDetail', { kind: 'rider', key: String(r) });
      });

      const sorted = rTrips.slice().sort((a, b) => {
        const ta = timeToMinutes(a && a.latestGO) ?? 999999;
        const tb = timeToMinutes(b && b.latestGO) ?? 999999;
        if (ta !== tb) return ta - tb;
        return (a && a.lastOOG != null ? a.lastOOG : 999999) - (b && b.lastOOG != null ? b.lastOOG : 999999);
      });

      for (const t of sorted.slice(0, 6)) {
        const left = `${t.latestGO || ''} • ${t.horseName || ''} • ${t.class_number || ''}`.trim();
        const right = makeTag(t.lastOOG != null ? `OOG ${t.lastOOG}` : (t.lastScore || ''));
        addLine(card, left, right, () => {
          if (t.class_id != null && t.horseName) {
            pushDetail('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}` });
          }
        });
      }

      screenRoot.appendChild(card);
    }
  }

  function renderSummary(idx) {
    clearRoot();
    setHeader('Summary');
    setNavActive('summary');

    screenRoot.appendChild(renderToggleRow());

    const trips = state.trips.filter(t => tripIncluded(t, idx)).slice().sort((a, b) => {
      const ra = a && a.ring_number != null ? a.ring_number : 999999;
      const rb = b && b.ring_number != null ? b.ring_number : 999999;
      if (ra !== rb) return ra - rb;

      const ta = timeToMinutes(a && a.latestGO) ?? 999999;
      const tb = timeToMinutes(b && b.latestGO) ?? 999999;
      if (ta !== tb) return ta - tb;

      return (a && a.lastOOG != null ? a.lastOOG : 999999) - (b && b.lastOOG != null ? b.lastOOG : 999999);
    });

    for (const t of trips) {
      const title = `${t.ring_number != null ? 'Ring ' + t.ring_number : ''} • ${t.horseName || ''}`.trim();
      const card = makeCard(title, makeTag(t.latestGO || ''), true, () => {
        if (t.class_id != null && t.horseName) pushDetail('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}` });
      });

      const line1 = `${t.riderName || ''} • ${t.teamName || ''}`.trim();
      addLine(card, line1 || ' ', makeTag(t.lastOOG != null ? `OOG ${t.lastOOG}` : ''), null);

      const line2 = `${t.class_number || ''} • class ${t.class_id || ''}`.trim();
      addLine(card, line2 || ' ', makeTag(t.lastScore || ''), null);

      screenRoot.appendChild(card);
    }
  }

  // ============================================================
  // SECTION 12 — SCREENS (details)
  // ============================================================


  function renderRingDetail(idx) {
    const ringKey = state.detail && state.detail.key;
    clearRoot();
    const ringObj = idx.ringMap.get(String(ringKey));
    setHeader(ringObj ? ringObj.ringName : 'Ring');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    if (!ringObj) return;

    const groups = [...ringObj.groups.values()].filter(scheduleIncluded).sort((a, b) => {
      const ta = timeToMinutes(a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.group_name).localeCompare(String(b.group_name));
    });

    for (const g of groups) {
      const gTripsAll = idx.tripsByGroup.get(String(g.class_group_id)) || [];
      const gTrips = gTripsAll.filter(t => tripIncluded(t, idx));
      if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

      const card = makeCard(
        `${g.latestStart || ''} • ${g.group_name}`.trim(),
        makeTag(gTrips.length, gTrips.length > 0),
        gTrips.length > 0,
        () => pushDetail('groupDetail', { kind: 'group', key: String(g.class_group_id) })
      );

      const cls = [...g.classes.values()].filter(scheduleIncluded).sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
      for (const c of cls) {
        const cTripsAll = idx.tripsByClass.get(String(c.class_id)) || [];
        const cTrips = cTripsAll.filter(t => tripIncluded(t, idx));
        if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

        addLine(card, `${c.class_number || ''} • ${c.class_name}`.trim(), makeTag(cTrips.length, cTrips.length > 0), () => {
          pushDetail('classDetail', { kind: 'class', key: String(c.class_id) });
        });
      }

      screenRoot.appendChild(card);
    }
  }

  function renderGroupDetail(idx) {
    const gid = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Group');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    if (!gid) return;

    // find group object
    let gObj = null;
    for (const r of idx.ringMap.values()) {
      if (r.groups.has(gid)) { gObj = r.groups.get(gid); break; }
    }
    if (!gObj) return;

    const gTripsAll = idx.tripsByGroup.get(gid) || [];
    const gTrips = gTripsAll.filter(t => tripIncluded(t, idx));

    const card = makeCard(
      `${gObj.latestStart || ''} • ${gObj.group_name}`.trim(),
      makeTag(gTrips.length, gTrips.length > 0),
      gTrips.length > 0,
      null
    );

    const cls = [...gObj.classes.values()].filter(scheduleIncluded).sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
    for (const c of cls) {
      const cTripsAll = idx.tripsByClass.get(String(c.class_id)) || [];
      const cTrips = cTripsAll.filter(t => tripIncluded(t, idx));
      if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

      addLine(card, `${c.class_number || ''} • ${c.class_name}`.trim(), makeTag(cTrips.length, cTrips.length > 0), () => {
        pushDetail('classDetail', { kind: 'class', key: String(c.class_id) });
      });
    }

    screenRoot.appendChild(card);
  }

  function renderClassDetail(idx) {
    const classId = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Class');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    if (!classId) return;

    const allTrips = idx.tripsByClass.get(classId) || [];
    const trips = allTrips.filter(t => tripIncluded(t, idx));

    const schedRec = idx.classMap.get(classId);
    const title = schedRec && schedRec.class_name ? String(schedRec.class_name) : `Class ${classId}`;

    const card = makeCard(title, makeTag(trips.length, trips.length > 0), trips.length > 0, null);

    // entries by horse
    const byHorse = new Map();
    for (const t of trips) {
      const h = t && t.horseName ? String(t.horseName) : null;
      if (!h) continue;
      if (!byHorse.has(h)) byHorse.set(h, []);
      byHorse.get(h).push(t);
    }

    const horses = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
    for (const h of horses) {
      const ts = byHorse.get(h).slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));
      const s0 = ts[0];
      const right = makeTag(s0 && s0.latestGO ? s0.latestGO : (s0 && s0.lastOOG != null ? `OOG ${s0.lastOOG}` : ''), true);

      addLine(card, h, right, () => {
        pushDetail('entryDetail', { kind: 'entry', key: `${classId}|${h}` });
      });
    }

    screenRoot.appendChild(card);
  }

  function renderRiderDetail(idx) {
    const rider = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader(rider || 'Rider');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    if (!rider) return;

    const allTrips = idx.tripsByRider.get(rider) || [];
    const trips = allTrips.filter(t => tripIncluded(t, idx)).slice().sort((a, b) => {
      const ta = timeToMinutes(a && a.latestGO) ?? 999999;
      const tb = timeToMinutes(b && b.latestGO) ?? 999999;
      if (ta !== tb) return ta - tb;
      return (a && a.lastOOG != null ? a.lastOOG : 999999) - (b && b.lastOOG != null ? b.lastOOG : 999999);
    });

    const card = makeCard(rider, makeTag(trips.length, trips.length > 0), trips.length > 0, null);

    for (const t of trips) {
      const left = `${t.latestGO || ''} • ${t.horseName || ''} • ring ${t.ring_number != null ? t.ring_number : ''}`.trim();
      const right = makeTag(t.lastOOG != null ? `OOG ${t.lastOOG}` : (t.lastScore || ''));
      addLine(card, left, right, () => {
        if (t.class_id != null && t.horseName) pushDetail('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}` });
      });
    }

    screenRoot.appendChild(card);
  }

  function renderEntryDetail(idx) {
    const k = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Entry');

    screenRoot.appendChild(renderToggleRow());
    screenRoot.appendChild(el('div', 'top-sep'));

    if (!k || !k.includes('|')) return;
    const parts = k.split('|');
    const classId = parts[0];
    const horse = parts.slice(1).join('|');

    const list = (idx.tripsByEntryKey.get(`${classId}|${horse}`) || []).filter(t => tripIncluded(t, idx)).slice()
      .sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));

    const title = `${horse} • ${classId}`;
    const card = makeCard(title, makeTag(list.length, list.length > 0), list.length > 0, null);

    for (const t of list) {
      const left = `${t.riderName || ''} • ${t.teamName || ''}`.trim();
      const rightTxt = t.latestGO || (t.lastOOG != null ? `OOG ${t.lastOOG}` : '') || (t.lastScore || '');
      addLine(card, left || ' ', makeTag(rightTxt));
      const left2 = `entry ${t.entryNumber || t.backNumber || ''} • score ${t.lastScore || ''} • place ${t.latestPlacing || ''}`.trim();
      if (left2 && left2 !== 'entry  • score  • place') addLine(card, left2, null);
    }

    screenRoot.appendChild(card);
  }

  // ============================================================
  // SECTION 13 — RENDER
  // ============================================================

  function renderAggs(idx) {
    const followedCount = state.followedHorses.size;

    // trips included = overlay count for session
    const includedTrips = state.trips.filter(t => tripIncluded(t, idx));
    const tripsCount = includedTrips.length;

    const ringKeys = uniqStrings(state.schedule.map(r => r && r.ring_number).filter(v => v != null).map(v => String(v)));
    const ringsCount = ringKeys.length;

    const groupKeys = uniqStrings(state.schedule.map(r => r && r.class_group_id).filter(v => v != null).map(v => String(v)));
    const groupsCount = groupKeys.length;

    const ridersCount = uniqStrings(includedTrips.map(t => t && t.riderName).filter(Boolean)).length;

    setAgg('state', followedCount);
    setAgg('rings', ringsCount);
    setAgg('classes', groupsCount);
    setAgg('riders', ridersCount);
    setAgg('summary', tripsCount);
  }

  function render() {
    if (!screenRoot || !headerTitle) return;

    const idx = buildIndexes();
    renderAggs(idx);

    // primary screen highlight (details should keep their parent highlighted)
    const primaryMap = {
      start: 'start',
      state: 'state',
      rings: 'rings',
      classes: 'classes',
      riders: 'riders',
      summary: 'summary',
      ringDetail: 'rings',
      groupDetail: 'classes',
      classDetail: 'classes',
      riderDetail: 'riders',
      entryDetail: 'summary'
    };
    setNavActive(primaryMap[state.screen] || 'start');

    if (state.screen === 'start') return renderStart(idx);
    if (state.screen === 'state') return renderState(idx);
    if (state.screen === 'rings') return renderRings(idx);
    if (state.screen === 'classes') return renderClasses(idx);
    if (state.screen === 'riders') return renderRiders(idx);
    if (state.screen === 'summary') return renderSummary(idx);

    if (state.screen === 'ringDetail') return renderRingDetail(idx);
    if (state.screen === 'groupDetail') return renderGroupDetail(idx);
    if (state.screen === 'classDetail') return renderClassDetail(idx);
    if (state.screen === 'riderDetail') return renderRiderDetail(idx);
    if (state.screen === 'entryDetail') return renderEntryDetail(idx);

    // fallback
    state.screen = 'start';
    renderStart(idx);
  }

  // ============================================================
  // SECTION 14 — EVENTS
  // ============================================================

  if (headerBack) headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;
      const next = btn.dataset.screen;

      // primary nav switch (no back stack)
      state.history = [];
      state.detail = null;
      state.screen = next;
      render();
    });
  }

  // ============================================================
  // SECTION 15 — BOOT (session start required; data can load in background)
  // ============================================================

  loadAll().catch(() => {});
  render();
})();
