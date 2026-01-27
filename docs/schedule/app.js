// app.js — CRT Daily Show (UI fidelity first)
// Data:
//   ./data/latest/watch_schedule.json  (full schedule scaffold)
//   ./data/latest/watch_trips.json     (truth overlay for aggs + entries)
//
// Contract implemented:
// - Start is session entry, header Next
// - Active Horses uses ONLY .row.row--tap + .row--active + .row-tag
// - No toggles on Start/Horses
// - Bottom nav includes Start + 4 active tabs, correct aggs, correct routing
// - Rings: sticky peak bar uses .nav-btn styling + horizontal scroll
// - Rings: true cards (not .row), 3-col group/class lines, ellipsis names
// - Entry line shows "Name 31" (no "First:", no rider trip-line), deduped per horse

(function () {
  'use strict';

  // ----------------------------
  // CONFIG
  // ----------------------------
  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    loaded: false,
    meta: { dt: null, sid: null, generated_at: null },
    schedule: [],
    trips: [],

    screen: 'start',       // start | horses | rings | classes | riders
    history: [],

    followedHorses: new Set(),  // truth scope for aggs + overlay
    horseSearch: '',

    // Rings peak: single selection (ring_number string) or null for all
    peakRing: null
  };

  // ----------------------------
  // DOM
  // ----------------------------
  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerNext = document.getElementById('header-next');
  const navRow = document.getElementById('nav-row');

  // view cache (prevents input being destroyed, fixes 1-char bug)
  const view = {
    horses: {
      mounted: false,
      root: null,
      input: null,
      list: null
    }
  };

  // ----------------------------
  // DOM helpers
  // ----------------------------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clearRoot() {
    screenRoot.innerHTML = '';
  }

  function normalizeStr(s) {
    return String(s || '').trim().toLowerCase();
  }

  function uniqStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const v of arr) {
      if (v == null) continue;
      const s = String(v);
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
  }

  function setHeader(title, { backVisible, nextVisible, nextLabel } = {}) {
    headerTitle.textContent = title;

    headerBack.style.visibility = backVisible ? 'visible' : 'hidden';
    headerNext.style.visibility = nextVisible ? 'visible' : 'hidden';
    if (nextLabel) headerNext.textContent = nextLabel;
  }

  function setNavActive(screen) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('[data-screen]');
    btns.forEach(b => b.classList.toggle('nav-btn--primary', b.dataset.screen === screen));
  }

  function setAgg(key, value) {
    const node = document.querySelector(`[data-nav-agg="${key}"]`);
    if (!node) return;
    const v = Number(value) || 0;
    node.textContent = String(v);
    node.classList.toggle('nav-agg--positive', v > 0);
  }

  // Parse "h:mm AM" into minutes since midnight
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

    if (state.loaded && nextGenerated && state.meta.generated_at === nextGenerated) {
      return; // no change
    }

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

    // Seed followed horses ONCE from trips truth
    if (state.followedHorses.size === 0) {
      const horses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
        .sort((a, b) => a.localeCompare(b));
      horses.forEach(h => state.followedHorses.add(h));
    }

    state.loaded = true;

    // If peak ring points to a ring that no longer exists, clear it
    const ringKeys = new Set(uniqStrings(state.schedule.map(r => r && r.ring_number).filter(v => v != null).map(String)));
    if (state.peakRing && !ringKeys.has(state.peakRing)) state.peakRing = null;

    // Update aggs + current screen
    render();
  }

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ----------------------------
  // INDEXES (schedule scaffold + trips truth)
  // ----------------------------
  function buildIndex() {
    const schedule = state.schedule || [];
    const trips = state.trips || [];

    // Schedule: ring -> group -> class
    const rings = new Map(); // ringKey -> { ring_number, ringName, groups: Map(gid->gObj) }

    for (const r of schedule) {
      if (!r) continue;
      const ringN = r.ring_number;
      const ringKey = ringN != null ? String(ringN) : null;
      if (!ringKey) continue;

      const ringName = r.ringName || `Ring ${ringKey}`;
      if (!rings.has(ringKey)) {
        rings.set(ringKey, { ring_number: ringN, ringName, groups: new Map() });
      }
      const ringObj = rings.get(ringKey);

      const gid = r.class_group_id != null ? String(r.class_group_id) : null;
      const groupName = r.group_name || r.class_name || '(Group)';
      if (!gid) continue;

      if (!ringObj.groups.has(gid)) {
        ringObj.groups.set(gid, {
          class_group_id: gid,
          group_name: groupName,
          // groupStart computed later (min latestStart across classes)
          classes: new Map()
        });
      }
      const groupObj = ringObj.groups.get(gid);

      const cid = r.class_id != null ? String(r.class_id) : null;
      if (!cid) continue;

      if (!groupObj.classes.has(cid)) {
        groupObj.classes.set(cid, {
          class_id: cid,
          class_number: r.class_number || null,
          class_name: r.class_name || '(Class)',
          latestStart: r.latestStart || null
        });
      } else {
        // keep earliest/latestStart if needed
        const cur = groupObj.classes.get(cid);
        if (!cur.latestStart && r.latestStart) cur.latestStart = r.latestStart;
      }
    }

    // Compute groupStart (min latestStart minutes) using its classes
    for (const ringObj of rings.values()) {
      for (const g of ringObj.groups.values()) {
        let best = null;
        let bestMin = 999999;
        for (const c of g.classes.values()) {
          const m = timeToMinutes(c.latestStart);
          if (m != null && m < bestMin) {
            bestMin = m;
            best = c.latestStart;
          }
        }
        g.groupStart = best; // can be null
      }
    }

    // Trips truth indexes (filtered by followed horses at usage time)
    const tripsByRing = new Map();    // ringKey -> trips[]
    const tripsByGroup = new Map();   // gid -> trips[]
    const tripsByClass = new Map();   // cid -> trips[]
    const tripsByRider = new Map();   // rider -> trips[]
    const tripsByHorse = new Map();   // horse -> trips[]

    function push(map, key, val) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(val);
    }

    for (const t of trips) {
      if (!t) continue;
      const ringKey = t.ring_number != null ? String(t.ring_number) : null;
      const gid = t.class_group_id != null ? String(t.class_group_id) : null;
      const cid = t.class_id != null ? String(t.class_id) : null;
      const rider = t.riderName ? String(t.riderName) : null;
      const horse = t.horseName ? String(t.horseName) : null;

      if (ringKey) push(tripsByRing, ringKey, t);
      if (gid) push(tripsByGroup, gid, t);
      if (cid) push(tripsByClass, cid, t);
      if (rider) push(tripsByRider, rider, t);
      if (horse) push(tripsByHorse, horse, t);
    }

    return { rings, tripsByRing, tripsByGroup, tripsByClass, tripsByRider, tripsByHorse };
  }

  // Included trips (truth-only + followed horses scope)
  function includedTrips(idx) {
    return (state.trips || []).filter(t => {
      const h = t && t.horseName ? String(t.horseName) : null;
      if (!h) return false;
      return state.followedHorses.has(h);
    });
  }

  // ----------------------------
  // AGGS (truth-only)
  // ----------------------------
  function renderAggs(idx) {
    const inc = includedTrips(idx);

    const horsesCount = state.followedHorses.size;

    const ringsCount = new Set(
      inc.map(t => (t && t.ring_number != null) ? String(t.ring_number) : null).filter(Boolean)
    ).size;

    // "Active Classes" = distinct class_group_id (per your earlier usage)
    const classesCount = new Set(
      inc.map(t => (t && t.class_group_id != null) ? String(t.class_group_id) : null).filter(Boolean)
    ).size;

    const ridersCount = new Set(
      inc.map(t => (t && t.riderName) ? String(t.riderName) : null).filter(Boolean)
    ).size;

    setAgg('horses', horsesCount);
    setAgg('rings', ringsCount);
    setAgg('classes', classesCount);
    setAgg('riders', ridersCount);
  }

  // ----------------------------
  // NAV / HISTORY
  // ----------------------------
  function goto(screen, { push } = {}) {
    if (push) state.history.push(state.screen);
    state.screen = screen;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return;
    state.screen = prev;
    render();
  }

  // Header Next behavior (screen-specific)
  function handleNext() {
    if (state.screen === 'start') return goto('horses', { push: true });
    if (state.screen === 'horses') return goto('rings', { push: true });
    // no default
  }

  // ----------------------------
  // SCREEN: START
  // ----------------------------
  function renderStart(idx) {
    clearRoot();

    setHeader('Start', { backVisible: false, nextVisible: true, nextLabel: 'Next' });
    setNavActive('start');

    const row = el('div', 'row row--tap');
    const left = el('div', 'row-left');
    left.appendChild(el('div', 'row-title', 'Start Session'));
    left.appendChild(el('div', 'row-sub muted', state.loaded
      ? `sid ${state.meta.sid || '-'} • ${state.meta.dt || '-'}`
      : 'Loading schedule...'
    ));
    row.appendChild(left);

    const right = el('div', 'row-right');
    const tag = el('div', 'row-tag', state.loaded ? 'GO' : '...');
    right.appendChild(tag);
    row.appendChild(right);

    row.addEventListener('click', () => {
      if (!state.loaded) return;
      goto('horses', { push: true });
    });

    screenRoot.appendChild(row);
  }

  // ----------------------------
  // SCREEN: ACTIVE HORSES (NO RE-RENDER ON INPUT)
  // ----------------------------
  function mountHorsesView(idx) {
    const root = el('div', null);

    // search
    const ss = el('div', 'state-search');
    const input = el('input', 'state-search-input');
    input.type = 'text';
    input.placeholder = 'Search horses...';
    input.autocomplete = 'off';
    ss.appendChild(input);

    // list container
    const list = el('div', null);

    root.appendChild(ss);
    root.appendChild(list);

    view.horses.mounted = true;
    view.horses.root = root;
    view.horses.input = input;
    view.horses.list = list;

    // input handler: filter only (no full render)
    input.addEventListener('input', () => {
      state.horseSearch = input.value;
      updateHorseList(idx);
      // aggs depend on followed set; search doesn't, so no agg update needed
    });

    return root;
  }

  function updateHorseList(idx) {
    const list = view.horses.list;
    if (!list) return;

    list.innerHTML = '';

    const allHorses = uniqStrings((state.trips || []).map(t => t && t.horseName).filter(Boolean))
      .sort((a, b) => a.localeCompare(b));

    const q = normalizeStr(state.horseSearch);
    const horses = q ? allHorses.filter(h => normalizeStr(h).includes(q)) : allHorses;

    for (const h of horses) {
      const horse = String(h);
      const followed = state.followedHorses.has(horse);

      // Count trips for this horse (truth-only, followed scope is irrelevant for per-row count)
      const tripsForHorse = (idx.tripsByHorse.get(horse) || []);
      const count = tripsForHorse.length;

      const row = el('div', 'row row--tap');
      if (followed) row.classList.add('row--active');

      const left = el('div', 'row-left');
      left.appendChild(el('div', 'row-title', horse));
      row.appendChild(left);

      const right = el('div', 'row-right');
      right.appendChild(tagCount(count));
      row.appendChild(right);

      // click toggles follow/unfollow (must work)
      row.addEventListener('click', () => {
        if (state.followedHorses.has(horse)) state.followedHorses.delete(horse);
        else state.followedHorses.add(horse);

        // update row state + nav aggs + (optional) rings peak counts depend on followed set, so full render if we're on rings
        row.classList.toggle('row--active', state.followedHorses.has(horse));
        renderAggs(idx);
      });

      list.appendChild(row);
    }
  }

  function tagCount(n) {
    const t = el('div', 'row-tag', String(Number(n) || 0));
    if ((Number(n) || 0) > 0) t.classList.add('row-tag--positive');
    return t;
  }

  function renderHorses(idx) {
    // Header + nav
    setHeader('Active Horses', { backVisible: true, nextVisible: true, nextLabel: 'Next' });
    setNavActive('horses');

    // mount once, then only update list
    if (!view.horses.mounted) {
      clearRoot();
      screenRoot.appendChild(mountHorsesView(idx));
    } else {
      clearRoot();
      screenRoot.appendChild(view.horses.root);
    }

    // ensure input reflects state (without breaking typing)
    if (view.horses.input && view.horses.input.value !== state.horseSearch) {
      view.horses.input.value = state.horseSearch || '';
    }

    updateHorseList(idx);
  }

  // ----------------------------
  // SCREEN: RINGS
  // ----------------------------
  function renderPeakBarRings(idx) {
    const peak = el('div', 'peakbar');
    const row = el('div', 'peakbar-row');

    const inc = includedTrips(idx);
    const ringCountMap = new Map(); // ringKey -> count (distinct horses)
    for (const t of inc) {
      const ringKey = (t && t.ring_number != null) ? String(t.ring_number) : null;
      const horse = (t && t.horseName) ? String(t.horseName) : null;
      if (!ringKey || !horse) continue;
      if (!ringCountMap.has(ringKey)) ringCountMap.set(ringKey, new Set());
      ringCountMap.get(ringKey).add(horse);
    }

    const rings = [...idx.rings.values()].sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));

    for (const r of rings) {
      const ringKey = String(r.ring_number);
      const cnt = ringCountMap.has(ringKey) ? ringCountMap.get(ringKey).size : 0;

      const btn = el('button', 'nav-btn');
      btn.type = 'button';
      btn.classList.toggle('nav-btn--primary', state.peakRing === ringKey);

      const label = el('span', null, r.ringName);
      btn.appendChild(label);

      // badge only if >0 (per your rule)
      if (cnt > 0) {
        const badge = el('span', 'nav-agg nav-agg--positive', String(cnt));
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => {
        state.peakRing = (state.peakRing === ringKey) ? null : ringKey;
        render(); // safe (does not affect horses input typing since different screen)
      });

      row.appendChild(btn);
    }

    peak.appendChild(row);
    return peak;
  }

  function renderRings(idx) {
    clearRoot();

    setHeader('Rings', { backVisible: true, nextVisible: false });
    setNavActive('rings');

    // sticky peak bar
    screenRoot.appendChild(renderPeakBarRings(idx));

    const rings = [...idx.rings.values()].sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));
    const visible = state.peakRing ? rings.filter(r => String(r.ring_number) === state.peakRing) : rings;

    // truth-only overlay counts
    const inc = includedTrips(idx);

    // ring -> group -> class -> horse dedupe
    // pre-index: groupCounts / classCounts / classHorseBestTrip
    const groupHorseSet = new Map(); // gid -> Set(horse)
    const classHorseTrips = new Map(); // cid -> Map(horse -> bestTrip)
    for (const t of inc) {
      const gid = (t && t.class_group_id != null) ? String(t.class_group_id) : null;
      const cid = (t && t.class_id != null) ? String(t.class_id) : null;
      const horse = (t && t.horseName) ? String(t.horseName) : null;
      if (!horse) continue;

      if (gid) {
        if (!groupHorseSet.has(gid)) groupHorseSet.set(gid, new Set());
        groupHorseSet.get(gid).add(horse);
      }

      if (cid) {
        if (!classHorseTrips.has(cid)) classHorseTrips.set(cid, new Map());
        const m = classHorseTrips.get(cid);
        const prev = m.get(horse) || null;

        // choose best trip = earliest GO, else smallest OOG
        const prevGO = prev ? timeToMinutes(prev.latestGO) : null;
        const nextGO = timeToMinutes(t.latestGO);
        const prevO = prev && prev.lastOOG != null ? Number(prev.lastOOG) : 999999;
        const nextO = t.lastOOG != null ? Number(t.lastOOG) : 999999;

        let keep = false;
        if (!prev) keep = true;
        else if (prevGO == null && nextGO != null) keep = true;
        else if (prevGO != null && nextGO != null && nextGO < prevGO) keep = true;
        else if ((prevGO == null && nextGO == null) && nextO < prevO) keep = true;
        else if (prevGO != null && nextGO != null && nextGO === prevGO && nextO < prevO) keep = true;

        if (keep) m.set(horse, t);
      }
    }

    function ringAggCount(ringKey) {
      const set = new Set();
      for (const t of inc) {
        const rk = (t && t.ring_number != null) ? String(t.ring_number) : null;
        const horse = (t && t.horseName) ? String(t.horseName) : null;
        if (rk === ringKey && horse) set.add(horse);
      }
      return set.size;
    }

    // render ring cards
    for (const r of visible) {
      const ringKey = String(r.ring_number);

      const card = el('div', 'card');

      // card header (inverse, flex) + agg only if >0
      const hdr = el('div', 'card-hdr card-hdr--inverse');
      const title = el('div', 'card-hdr-title', r.ringName);
      hdr.appendChild(title);

      const rAgg = ringAggCount(ringKey);
      if (rAgg > 0) {
        const badge = el('div', 'row-tag row-tag--positive', String(rAgg));
        hdr.appendChild(badge);
      }
      card.appendChild(hdr);

      const body = el('div', 'card-body');

      // groups sorted by groupStart then name
      const groups = [...r.groups.values()].sort((a, b) => {
        const ta = timeToMinutes(a.groupStart) ?? 999999;
        const tb = timeToMinutes(b.groupStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      });

      for (const g of groups) {
        const gid = String(g.class_group_id);
        const gAgg = groupHorseSet.has(gid) ? groupHorseSet.get(gid).size : 0;

        // group line (3 cols), agg only if >0
        const gLine = el('div', 'group-line');
        gLine.appendChild(el('div', 'col-time', g.groupStart || ''));
        gLine.appendChild(el('div', 'col-name', g.group_name));
        gLine.appendChild(gAgg > 0 ? tagCount(gAgg) : el('div', null, ''));
        body.appendChild(gLine);

        // classes under group
        const classes = [...g.classes.values()].sort((a, b) => (Number(a.class_number) || 0) - (Number(b.class_number) || 0));

        for (const c of classes) {
          const cid = String(c.class_id);
          const horsesMap = classHorseTrips.get(cid) || null;
          const cAgg = horsesMap ? horsesMap.size : 0;

          const cLine = el('div', 'class-line');
          cLine.appendChild(el('div', 'class-num', c.class_number != null ? String(c.class_number) : ''));
          cLine.appendChild(el('div', 'class-name', c.class_name));
          cLine.appendChild(cAgg > 0 ? tagCount(cAgg) : el('div', null, ''));
          body.appendChild(cLine);

          // entries: only if this class has active overlay
          if (horsesMap && horsesMap.size) {
            // stable ordering: by best trip GO then OOG then name
            const rows = [];
            for (const [horse, trip] of horsesMap.entries()) rows.push({ horse, trip });

            rows.sort((a, b) => {
              const ta = timeToMinutes(a.trip && a.trip.latestGO) ?? 999999;
              const tb = timeToMinutes(b.trip && b.trip.latestGO) ?? 999999;
              if (ta !== tb) return ta - tb;
              const oa = a.trip && a.trip.lastOOG != null ? Number(a.trip.lastOOG) : 999999;
              const ob = b.trip && b.trip.lastOOG != null ? Number(b.trip.lastOOG) : 999999;
              if (oa !== ob) return oa - ob;
              return String(a.horse).localeCompare(String(b.horse));
            });

            for (const it of rows) {
              const oog = it.trip && it.trip.lastOOG != null ? String(it.trip.lastOOG) : '';
              const entryLine = el('div', 'entry-line');
              entryLine.appendChild(el('div', 'entry-name', it.horse));
              // show only "31" (no "OOG 31")
              entryLine.appendChild(el('div', 'row-tag', oog || ''));
              body.appendChild(entryLine);
            }
          }
        }
      }

      card.appendChild(body);
      screenRoot.appendChild(card);
    }
  }

  // ----------------------------
  // SCREEN: CLASSES (truth-only list)
  // ----------------------------
  function renderClasses(idx) {
    clearRoot();

    setHeader('Active Classes', { backVisible: true, nextVisible: false });
    setNavActive('classes');

    const inc = includedTrips(idx);

    // distinct group ids (active)
    const groupMap = new Map(); // gid -> { gid, ring_number, group_name, groupStart, count }
    // Use schedule scaffold to name groups
    const scheduleByGroup = new Map(); // gid -> { group_name, ringKey, groupStart }
    for (const ring of idx.rings.values()) {
      const ringKey = String(ring.ring_number);
      for (const g of ring.groups.values()) {
        const gid = String(g.class_group_id);
        scheduleByGroup.set(gid, { group_name: g.group_name, ringKey, groupStart: g.groupStart || '' });
      }
    }

    const gidHorseSet = new Map();
    for (const t of inc) {
      const gid = (t && t.class_group_id != null) ? String(t.class_group_id) : null;
      const horse = (t && t.horseName) ? String(t.horseName) : null;
      if (!gid || !horse) continue;
      if (!gidHorseSet.has(gid)) gidHorseSet.set(gid, new Set());
      gidHorseSet.get(gid).add(horse);
    }

    for (const [gid, set] of gidHorseSet.entries()) {
      const s = scheduleByGroup.get(gid) || {};
      groupMap.set(gid, {
        gid,
        group_name: s.group_name || `Group ${gid}`,
        groupStart: s.groupStart || '',
        ringKey: s.ringKey || '',
        count: set.size
      });
    }

    const list = [...groupMap.values()].sort((a, b) => {
      const ta = timeToMinutes(a.groupStart) ?? 999999;
      const tb = timeToMinutes(b.groupStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.group_name).localeCompare(String(b.group_name));
    });

    for (const g of list) {
      const row = el('div', 'row');
      const left = el('div', 'row-left');
      left.appendChild(el('div', 'row-title', g.group_name));
      left.appendChild(el('div', 'row-sub muted', `${g.groupStart || ''} • Ring ${g.ringKey || ''}`.trim()));
      row.appendChild(left);

      const right = el('div', 'row-right');
      right.appendChild(tagCount(g.count));
      row.appendChild(right);

      screenRoot.appendChild(row);
    }
  }

  // ----------------------------
  // SCREEN: RIDERS (truth-only list)
  // ----------------------------
  function renderRiders(idx) {
    clearRoot();

    setHeader('Active Riders', { backVisible: true, nextVisible: false });
    setNavActive('riders');

    const inc = includedTrips(idx);
    const riderHorseSet = new Map(); // rider -> Set(horse)
    for (const t of inc) {
      const rider = (t && t.riderName) ? String(t.riderName) : null;
      const horse = (t && t.horseName) ? String(t.horseName) : null;
      if (!rider || !horse) continue;
      if (!riderHorseSet.has(rider)) riderHorseSet.set(rider, new Set());
      riderHorseSet.get(rider).add(horse);
    }

    const list = [...riderHorseSet.entries()]
      .map(([rider, set]) => ({ rider, count: set.size }))
      .sort((a, b) => a.rider.localeCompare(b.rider));

    for (const r of list) {
      const row = el('div', 'row');
      const left = el('div', 'row-left');
      left.appendChild(el('div', 'row-title', r.rider));
      row.appendChild(left);

      const right = el('div', 'row-right');
      right.appendChild(tagCount(r.count));
      row.appendChild(right);

      screenRoot.appendChild(row);
    }
  }

  // ----------------------------
  // RENDER
  // ----------------------------
  function render() {
    const idx = buildIndex();
    renderAggs(idx);

    // Screen mapping for nav highlighting
    setNavActive(state.screen);

    // Header handlers
    if (state.screen === 'start') headerNext.onclick = handleNext;
    else if (state.screen === 'horses') headerNext.onclick = handleNext;
    else headerNext.onclick = null;

    // Screen render
    if (state.screen === 'start') return renderStart(idx);
    if (state.screen === 'horses') return renderHorses(idx);
    if (state.screen === 'rings') return renderRings(idx);
    if (state.screen === 'classes') return renderClasses(idx);
    if (state.screen === 'riders') return renderRiders(idx);

    // fallback
    state.screen = 'start';
    renderStart(idx);
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  headerBack.addEventListener('click', () => {
    if (state.screen === 'start') return;
    goBack();
  });

  headerNext.addEventListener('click', () => handleNext());

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;
      const next = btn.dataset.screen;

      // bottom nav is direct (no stack)
      state.history = [];
      state.screen = next;

      // prevent horses search losing typing due to nav click is a re-render anyway
      render();
    });
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  loadAll().catch(() => {});
  render();
})();
