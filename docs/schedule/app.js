// app.js — UI fidelity pass A–F (Start -> Horses -> Rings), truth = watch_trips
// Data:
//   ./data/latest/watch_schedule.json  (context scaffold only; never used for aggs)
//   ./data/latest/watch_trips.json     (truth overlay; used for aggs + active screens)

(function () {
  'use strict';

  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  const state = {
    loaded: false,
    sessionStarted: false,

    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    screen: 'start', // start | horses | rings | classes | riders | classDetail | riderDetail
    history: [],

    followedHorses: new Set(),
    horseSearch: '',

    // Peak (filter) — isolated, rings-only for now
    peak: {
      rings: new Set() // ring_number (string)
    }
  };

  // DOM
  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerNext = document.getElementById('header-next');
  const navRow = document.getElementById('nav-row');

  // ----------------------------
  // Utilities
  // ----------------------------

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
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

  function setAgg(key, value) {
    const node = document.querySelector(`[data-nav-agg="${key}"]`);
    if (!node) return;
    node.textContent = String(value);
    node.classList.toggle('nav-agg--positive', Number(value) > 0);
  }

  function setNavPrimary(screenKey) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('[data-screen]');
    btns.forEach(b => b.classList.toggle('nav-btn--primary', b.dataset.screen === screenKey));
  }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title;
  }

  function showHeaderNext(show, label) {
    if (!headerNext) return;
    headerNext.hidden = !show;
    headerNext.textContent = label || 'Next';
  }

  function showHeaderBack(show) {
    if (!headerBack) return;
    headerBack.style.visibility = show ? 'visible' : 'hidden';
  }

  // Parse "h:mm AM" into minutes since midnight (display ordering only)
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

  function makeCountTag(n) {
    const t = el('div', 'row-tag row-tag--count', String(n));
    if (Number(n) > 0) t.classList.add('row-tag--positive');
    return t;
  }

  // ----------------------------
  // Data load
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
      (trips && trips.meta && trips.meta.generated_at) ||
      (sched && sched.meta && sched.meta.generated_at) ||
      null;

    if (state.loaded && nextGenerated && state.meta.generated_at === nextGenerated) return;

    state.schedule = Array.isArray(sched && sched.records) ? sched.records : [];
    state.trips = Array.isArray(trips && trips.records) ? trips.records : [];

    const dtScope =
      (trips && trips.meta && trips.meta.dt) ||
      (state.trips[0] && state.trips[0].dt) ||
      (state.schedule[0] && state.schedule[0].dt) ||
      null;

    const sidScope =
      (state.trips[0] && state.trips[0].sid) ||
      (state.schedule[0] && state.schedule[0].sid) ||
      null;

    state.meta = { dt: dtScope, sid: sidScope, generated_at: nextGenerated };

    // Seed followed horses once (default follow all horses in truth)
    if (state.followedHorses.size === 0) {
      const horses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
        .sort((a, b) => a.localeCompare(b));
      horses.forEach(h => state.followedHorses.add(h));
    }

    state.loaded = true;
    render();
  }

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ----------------------------
  // Indexes (schedule context + truth overlays)
  // ----------------------------

  function buildScheduleIndex() {
    // ring -> group -> classes (context only)
    const ringMap = new Map(); // ringN(str) => { ring_number, ringName, groups: Map(gid->gObj) }

    for (const r of state.schedule) {
      if (!r) continue;
      const ringN = r.ring_number;
      const gid = r.class_group_id;
      const cid = r.class_id;

      if (ringN == null || gid == null || cid == null) continue;

      const ringKey = String(ringN);
      const ringName = r.ringName || `Ring ${ringN}`;
      if (!ringMap.has(ringKey)) {
        ringMap.set(ringKey, { ring_number: ringN, ringName, groups: new Map() });
      }

      const ringObj = ringMap.get(ringKey);
      const gKey = String(gid);

      if (!ringObj.groups.has(gKey)) {
        ringObj.groups.set(gKey, {
          class_group_id: gid,
          group_name: r.group_name || r.class_name || '(Group)',
          // group time = earliest latestStart among its classes
          _timeMin: null,
          timeText: null,
          classes: new Map()
        });
      }

      const gObj = ringObj.groups.get(gKey);
      const tMin = timeToMinutes(r.latestStart);
      if (tMin != null && (gObj._timeMin == null || tMin < gObj._timeMin)) {
        gObj._timeMin = tMin;
        gObj.timeText = r.latestStart || null;
      } else if (!gObj.timeText && r.latestStart) {
        gObj.timeText = r.latestStart;
      }

      const cKey = String(cid);
      if (!gObj.classes.has(cKey)) {
        gObj.classes.set(cKey, {
          class_id: cid,
          class_number: r.class_number,
          class_name: r.class_name || '(Class)'
        });
      }
    }

    return { ringMap };
  }

  function includedTrips() {
    // truth-only inclusion: must be followed horse
    const out = [];
    for (const t of state.trips) {
      if (!t) continue;
      const horse = t.horseName ? String(t.horseName) : null;
      if (!horse) continue;
      if (!state.followedHorses.has(horse)) continue;
      out.push(t);
    }
    return out;
  }

  function buildTruthIndex(tripsList) {
    const byHorse = new Map();
    const byRing = new Map();
    const byGroup = new Map();
    const byClass = new Map();
    const byRider = new Map();

    function push(map, key, val) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(val);
    }

    for (const t of tripsList) {
      const horse = t.horseName ? String(t.horseName) : null;
      const ring = t.ring_number != null ? String(t.ring_number) : null;
      const gid = t.class_group_id != null ? String(t.class_group_id) : null;
      const cid = t.class_id != null ? String(t.class_id) : null;
      const rider = t.riderName ? String(t.riderName) : null;

      if (horse) push(byHorse, horse, t);
      if (ring) push(byRing, ring, t);
      if (gid) push(byGroup, gid, t);
      if (cid) push(byClass, cid, t);
      if (rider) push(byRider, rider, t);
    }

    return { byHorse, byRing, byGroup, byClass, byRider };
  }

  // Collapsed “first” trip rule:
  // 1) per horse in class: pick earliest GO; tie -> smallest OOG
  // 2) from those, pick overall earliest GO; tie -> smallest OOG
  function pickFirstTripForClass(classTrips) {
    if (!classTrips || classTrips.length === 0) return null;

    const bestByHorse = new Map(); // horse -> bestTrip

    for (const t of classTrips) {
      const horse = t && t.horseName ? String(t.horseName) : null;
      if (!horse) continue;

      const cur = bestByHorse.get(horse);
      if (!cur) { bestByHorse.set(horse, t); continue; }

      const ta = timeToMinutes(t.latestGO) ?? 999999;
      const tb = timeToMinutes(cur.latestGO) ?? 999999;
      if (ta < tb) { bestByHorse.set(horse, t); continue; }
      if (ta > tb) continue;

      const oa = t.lastOOG != null ? Number(t.lastOOG) : 999999;
      const ob = cur.lastOOG != null ? Number(cur.lastOOG) : 999999;
      if (oa < ob) bestByHorse.set(horse, t);
    }

    const candidates = [...bestByHorse.values()];
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const ta = timeToMinutes(a.latestGO) ?? 999999;
      const tb = timeToMinutes(b.latestGO) ?? 999999;
      if (ta !== tb) return ta - tb;
      const oa = a.lastOOG != null ? Number(a.lastOOG) : 999999;
      const ob = b.lastOOG != null ? Number(b.lastOOG) : 999999;
      return oa - ob;
    });

    return candidates[0] || null;
  }

  // ----------------------------
  // Aggregates (truth only)
  // ----------------------------

  function renderAggs(truthTrips) {
    const horses = state.followedHorses.size;

    const rings = new Set();
    const classes = new Set();
    const riders = new Set();

    for (const t of truthTrips) {
      if (t.ring_number != null) rings.add(String(t.ring_number));
      if (t.class_id != null) classes.add(String(t.class_id));
      if (t.riderName) riders.add(String(t.riderName));
    }

    setAgg('horses', horses);
    setAgg('rings', rings.size);
    setAgg('classes', classes.size);
    setAgg('riders', riders.size);
  }

  // ----------------------------
  // Navigation helpers
  // ----------------------------

  function goto(screen) {
    state.history = [];
    state.screen = screen;
    render();
  }

  function push(screen) {
    state.history.push(state.screen);
    state.screen = screen;
    render();
  }

  function goBack() {
    if (state.history.length) {
      state.screen = state.history.pop();
      render();
      return;
    }

    // primary back path (legacy feel)
    if (state.screen === 'rings') return goto('horses');
    if (state.screen === 'horses') return goto('start');
    if (state.screen === 'classes' || state.screen === 'riders') return goto('rings');
    return goto('start');
  }

  // ----------------------------
  // Screens
  // ----------------------------

  function renderStart() {
    clearRoot();
    setHeader('Start');
    showHeaderBack(false);
    showHeaderNext(true, 'Next');
    setNavPrimary('horses');

    const logo = el('div', 'start-logo');
    logo.appendChild(el('div', 'start-logo-title', 'CRT Daily Show'));
    const sub = state.loaded
      ? `sid ${state.meta.sid || '-'} • ${state.meta.dt || '-'}`
      : 'Loading...';
    logo.appendChild(el('div', 'start-logo-subtitle', sub));
    if (state.meta.generated_at) {
      logo.appendChild(el('div', 'start-logo-subtitle', `generated ${state.meta.generated_at}`));
    }
    screenRoot.appendChild(logo);

    const row = el('div', 'row row--tap');
    row.appendChild(el('div', 'row-title', state.loaded ? 'Start Session' : 'Loading...'));
    row.appendChild(makeCountTag(state.loaded ? 'GO' : '...'));
    row.addEventListener('click', () => {
      state.sessionStarted = true;
      goto('horses');
    });
    screenRoot.appendChild(row);
  }

  function renderHorses(idxTruthAll) {
    clearRoot();
    setHeader('Active Horses');
    showHeaderBack(true);
    showHeaderNext(true, 'Next');
    setNavPrimary('horses');

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

    // list = horses from ALL truth (not filtered by followed)
    const allHorses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
      .sort((a, b) => a.localeCompare(b));

    const q = normalizeStr(state.horseSearch);
    const horses = q ? allHorses.filter(h => normalizeStr(h).includes(q)) : allHorses;

    for (const horse of horses) {
      const followed = state.followedHorses.has(horse);
      const tripCount = (idxTruthAll.byHorse.get(horse) || []).length;

      const row = el('div', 'row row--tap');
      if (followed) row.classList.add('row--active');

      row.appendChild(el('div', 'row-title', horse));
      row.appendChild(makeCountTag(tripCount));

      row.addEventListener('click', () => {
        if (followed) state.followedHorses.delete(horse);
        else state.followedHorses.add(horse);
        render();
      });

      screenRoot.appendChild(row);
    }
  }

  function renderPeakRings(rings, idxTruthIncluded) {
    const peak = el('div', 'peakbar');
    const sc = el('div', 'peakbar-scroller');
    const row = el('div', 'peakbar-row');

    const sorted = rings.slice().sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));

    for (const r of sorted) {
      const key = String(r.ring_number);
      const activeCount = (idxTruthIncluded.byRing.get(key) || []).length;

      // "Grand (0)" style (ring picker)
      const label = `${r.ringName} (${activeCount})`;
      const b = el('button', 'nav-btn', label);
      b.classList.toggle('nav-btn--primary', state.peak.rings.has(key));
      b.addEventListener('click', () => {
        if (state.peak.rings.has(key)) state.peak.rings.delete(key);
        else state.peak.rings.add(key);
        render();
      });

      row.appendChild(b);
    }

    sc.appendChild(row);
    peak.appendChild(sc);
    return peak;
  }

  function renderRings(idxSched, idxTruthIncluded) {
    clearRoot();
    setHeader('Rings');
    showHeaderBack(true);
    showHeaderNext(false);
    setNavPrimary('rings');

    const ringsAll = [...idxSched.ringMap.values()];
    const ringsWithTrips = ringsAll.filter(r => (idxTruthIncluded.byRing.get(String(r.ring_number)) || []).length > 0);

    // Peak (sticky) — rings picker
    screenRoot.appendChild(renderPeakRings(ringsAll, idxTruthIncluded));

    const visible = state.peak.rings.size
      ? ringsAll.filter(r => state.peak.rings.has(String(r.ring_number)))
      : (ringsWithTrips.length ? ringsWithTrips : ringsAll);

    for (const ring of visible) {
      const ringKey = String(ring.ring_number);
      const ringTrips = idxTruthIncluded.byRing.get(ringKey) || [];
      const ringCount = ringTrips.length;

      const card = el('div', 'card');

      const hdr = el('div', 'card-hdr card-hdr--inverse');
      hdr.appendChild(el('div', 'card-title', ring.ringName));
      if (ringCount > 0) hdr.appendChild(makeCountTag(ringCount));
      card.appendChild(hdr);

      const body = el('div', 'card-body');

      // groups: sorted by group earliest time, then name
      const groups = [...ring.groups.values()].sort((a, b) => {
        const ta = a._timeMin != null ? a._timeMin : 999999;
        const tb = b._timeMin != null ? b._timeMin : 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      });

      for (const g of groups) {
        const gKey = String(g.class_group_id);
        const gTrips = idxTruthIncluded.byGroup.get(gKey) || [];
        const gCount = gTrips.length;

        // group line: time | group name | agg (only if >0)
        const line = el('div', 'ring-line');
        line.appendChild(el('div', 'ring-time', g.timeText || ''));
        line.appendChild(el('div', 'ring-text', g.group_name));
        line.appendChild(gCount > 0 ? makeCountTag(gCount) : el('div', 'muted', ''));
        body.appendChild(line);

        // under group: class lines, then first entry per class (collapsed)
        const sub = el('div', 'ring-sub');

        const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));

        for (const c of classes) {
          const cKey = String(c.class_id);
          const cTrips = idxTruthIncluded.byClass.get(cKey) || [];

          // class line
          const cl = el('div', 'ring-subline');
          cl.appendChild(el('div', null, `${c.class_number || ''} • ${c.class_name}`.trim()));
          cl.appendChild(cTrips.length > 0 ? makeCountTag(cTrips.length) : el('div', 'muted', ''));
          sub.appendChild(cl);

          // first entry line per your rule
          if (cTrips.length > 0) {
            const first = pickFirstTripForClass(cTrips);
            if (first) {
              const oog = first.lastOOG != null ? `OOG ${first.lastOOG}` : '';
              const go = first.latestGO ? String(first.latestGO) : '';
              const txt = `${go}${go && oog ? ' • ' : ''}${first.horseName || ''}${oog ? ' (' + oog + ')' : ''}`.trim();

              const entryLine = el('div', 'ring-subline');
              entryLine.appendChild(el('div', 'muted', `First: ${txt}`));
              entryLine.appendChild(el('div', 'muted', ''));
              sub.appendChild(entryLine);
            }
          }
        }

        body.appendChild(sub);
      }

      card.appendChild(body);
      screenRoot.appendChild(card);
    }
  }

  function renderClasses(idxSched, idxTruthIncluded) {
    clearRoot();
    setHeader('Active Classes');
    showHeaderBack(true);
    showHeaderNext(false);
    setNavPrimary('classes');

    // list active classes from truth; label from schedule when available
    const classIds = [...idxTruthIncluded.byClass.keys()];
    classIds.sort((a, b) => Number(a) - Number(b));

    // build lookup from schedule: class_id -> {class_number, class_name}
    const classLabel = new Map();
    for (const r of state.schedule) {
      if (!r || r.class_id == null) continue;
      const k = String(r.class_id);
      if (!classLabel.has(k)) {
        classLabel.set(k, {
          class_number: r.class_number,
          class_name: r.class_name || r.group_name || `Class ${k}`
        });
      }
    }

    for (const cid of classIds) {
      const trips = idxTruthIncluded.byClass.get(cid) || [];
      const info = classLabel.get(cid) || { class_number: '', class_name: `Class ${cid}` };

      const row = el('div', 'row row--tap');
      row.appendChild(el('div', 'row-title', `${info.class_number || ''} • ${info.class_name}`.trim()));
      row.appendChild(makeCountTag(trips.length));

      row.addEventListener('click', () => {
        state._detailClassId = cid;
        push('classDetail');
      });

      screenRoot.appendChild(row);
    }
  }

  function renderClassDetail(idxTruthIncluded) {
    clearRoot();
    setHeader('Class');
    showHeaderBack(true);
    showHeaderNext(false);
    setNavPrimary('classes');

    const cid = state._detailClassId ? String(state._detailClassId) : null;
    if (!cid) return;

    const trips = (idxTruthIncluded.byClass.get(cid) || []).slice();
    trips.sort((a, b) => {
      const ta = timeToMinutes(a.latestGO) ?? 999999;
      const tb = timeToMinutes(b.latestGO) ?? 999999;
      if (ta !== tb) return ta - tb;
      const oa = a.lastOOG != null ? Number(a.lastOOG) : 999999;
      const ob = b.lastOOG != null ? Number(b.lastOOG) : 999999;
      return oa - ob;
    });

    const titleRow = el('div', 'row');
    titleRow.appendChild(el('div', 'row-title', `Class ${cid}`));
    titleRow.appendChild(makeCountTag(trips.length));
    screenRoot.appendChild(titleRow);

    // one per horse (collapsed)
    const byHorse = new Map();
    for (const t of trips) {
      const h = t.horseName ? String(t.horseName) : null;
      if (!h) continue;
      if (!byHorse.has(h)) byHorse.set(h, []);
      byHorse.get(h).push(t);
    }

    const horses = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
    for (const h of horses) {
      const first = pickFirstTripForClass(byHorse.get(h));
      if (!first) continue;

      const row = el('div', 'row');
      row.appendChild(el('div', 'row-title', `${h}`));
      const right = first.lastOOG != null ? `OOG ${first.lastOOG}` : (first.latestGO || '');
      row.appendChild(makeCountTag(right || ''));
      screenRoot.appendChild(row);
    }
  }

  function renderRiders(idxTruthIncluded) {
    clearRoot();
    setHeader('Active Riders');
    showHeaderBack(true);
    showHeaderNext(false);
    setNavPrimary('riders');

    const riders = [...idxTruthIncluded.byRider.keys()].sort((a, b) => a.localeCompare(b));

    for (const rider of riders) {
      const trips = idxTruthIncluded.byRider.get(rider) || [];

      const row = el('div', 'row row--tap');
      row.appendChild(el('div', 'row-title', rider));
      row.appendChild(makeCountTag(trips.length));

      row.addEventListener('click', () => {
        state._detailRider = rider;
        push('riderDetail');
      });

      screenRoot.appendChild(row);
    }
  }

  function renderRiderDetail(idxTruthIncluded) {
    clearRoot();
    setHeader(state._detailRider || 'Rider');
    showHeaderBack(true);
    showHeaderNext(false);
    setNavPrimary('riders');

    const rider = state._detailRider ? String(state._detailRider) : null;
    if (!rider) return;

    const trips = (idxTruthIncluded.byRider.get(rider) || []).slice();
    trips.sort((a, b) => {
      const ta = timeToMinutes(a.latestGO) ?? 999999;
      const tb = timeToMinutes(b.latestGO) ?? 999999;
      if (ta !== tb) return ta - tb;
      const oa = a.lastOOG != null ? Number(a.lastOOG) : 999999;
      const ob = b.lastOOG != null ? Number(b.lastOOG) : 999999;
      return oa - ob;
    });

    for (const t of trips) {
      const row = el('div', 'row');
      const left = `${t.latestGO || ''} • ${t.horseName || ''} • Ring ${t.ring_number != null ? t.ring_number : ''}`.trim();
      row.appendChild(el('div', 'row-title', left));
      const right = t.lastOOG != null ? `OOG ${t.lastOOG}` : (t.lastScore || '');
      row.appendChild(makeCountTag(right || ''));
      screenRoot.appendChild(row);
    }
  }

  // ----------------------------
  // Render root
  // ----------------------------

  function render() {
    if (!screenRoot || !headerTitle) return;

    const truthAll = buildTruthIndex(state.trips || []);
    const truthIncludedList = includedTrips();
    const truthIncluded = buildTruthIndex(truthIncludedList);
    const sched = buildScheduleIndex();

    renderAggs(truthIncludedList);

    if (state.screen === 'start') {
      renderStart();
      return;
    }

    if (state.screen === 'horses') {
      renderHorses(truthAll);
      return;
    }

    if (state.screen === 'rings') {
      renderRings(sched, truthIncluded);
      return;
    }

    if (state.screen === 'classes') {
      renderClasses(sched, truthIncluded);
      return;
    }

    if (state.screen === 'classDetail') {
      renderClassDetail(truthIncluded);
      return;
    }

    if (state.screen === 'riders') {
      renderRiders(truthIncluded);
      return;
    }

    if (state.screen === 'riderDetail') {
      renderRiderDetail(truthIncluded);
      return;
    }

    // fallback
    state.screen = 'start';
    renderStart();
  }

  // ----------------------------
  // Events
  // ----------------------------

  if (headerBack) headerBack.addEventListener('click', goBack);

  if (headerNext) {
    headerNext.addEventListener('click', () => {
      if (state.screen === 'start') {
        state.sessionStarted = true;
        goto('horses');
        return;
      }
      if (state.screen === 'horses') {
        goto('rings');
        return;
      }
    });
  }

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;
      const next = btn.dataset.screen;

      // legacy: switching primary tabs clears detail stack
      state.history = [];
      if (next === 'horses' || next === 'rings' || next === 'classes' || next === 'riders') {
        state.screen = next;
        render();
      }
    });
  }

  // ----------------------------
  // Boot
  // ----------------------------

  loadAll().catch(() => {});
  render();
})();
