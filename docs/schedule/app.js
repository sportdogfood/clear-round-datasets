// app.js — CRT Daily Show (UI fidelity first)
// Data:
//   ./data/latest/watch_schedule.json  (full schedule scaffold/context)
//   ./data/latest/watch_trips.json     (truth overlay for aggregates + “active”)

(function () {
  'use strict';

  // -----------------------------
  // CONFIG
  // -----------------------------
  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  const LS_FOLLOWED = 'crt_followed_horses_v1';

  // -----------------------------
  // STATE
  // -----------------------------
  const state = {
    loaded: false,
    meta: { dt: null, sid: null, generated_at: null },

    schedule: [], // schedule.records
    trips: [],    // trips.records

    screen: 'start', // start | horses | rings | classes | riders

    horseSearch: '',
    followedHorses: new Set(), // truth selection (tap to toggle follow/unfollow)

    peakRing: null // ring_number string or null
  };

  // -----------------------------
  // DOM
  // -----------------------------
  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerNext = document.getElementById('header-next');
  const navRow = document.getElementById('nav-row');

  // -----------------------------
  // UTIL
  // -----------------------------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
  }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title || '';
  }

  function showBack(show) {
    if (!headerBack) return;
    headerBack.hidden = !show;
  }

  function showNext(show, label) {
    if (!headerNext) return;
    headerNext.hidden = !show;
    if (label) headerNext.textContent = label;
  }

  function setNavActive(screenKey) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('[data-screen]');
    btns.forEach((b) => {
      const on = b.dataset.screen === screenKey;
      b.classList.toggle('nav-btn--primary', on);
    });
  }

  function setAgg(key, value) {
    const node = document.querySelector(`[data-nav-agg="${key}"]`);
    if (!node) return;
    const v = Number(value) || 0;
    node.textContent = String(v);
    node.classList.toggle('nav-agg--positive', v > 0);
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

  // Parse "h:mm AM" -> minutes since midnight (ordering only)
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

  function loadFollowedFromLS() {
    try {
      const raw = localStorage.getItem(LS_FOLLOWED);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      state.followedHorses = new Set(arr.map(String));
    } catch (_) {}
  }

  function saveFollowedToLS() {
    try {
      localStorage.setItem(LS_FOLLOWED, JSON.stringify([...state.followedHorses]));
    } catch (_) {}
  }

  // -----------------------------
  // LOAD
  // -----------------------------
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
      (state.schedule[0] && state.schedule[0].sid) ||
      (state.trips[0] && state.trips[0].sid) ||
      null;

    state.meta = { dt: dtScope, sid: sidScope, generated_at: nextGenerated };

    // Followed horses seed:
    // - if LS present, keep it
    // - else default-follow ALL horses present in trips truth
    if (state.followedHorses.size === 0) {
      loadFollowedFromLS();
    }
    if (state.followedHorses.size === 0) {
      const horses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
        .sort((a, b) => a.localeCompare(b));
      horses.forEach(h => state.followedHorses.add(h));
      saveFollowedToLS();
    }

    state.loaded = true;
    render();
  }

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // -----------------------------
  // INDEXES
  // -----------------------------
  function buildIndexes() {
    // Schedule indexes: ring -> groups -> classes
    const ringMap = new Map(); // ringKey -> { ring_number, ringName, groups: Map(gid -> groupObj) }
    const groupMap = new Map(); // gid -> groupObj

    for (const r of state.schedule) {
      if (!r) continue;

      const ringN = r.ring_number;
      const gid = r.class_group_id;
      const cid = r.class_id;

      if (ringN == null || gid == null || cid == null) continue;

      const ringKey = String(ringN);
      if (!ringMap.has(ringKey)) {
        ringMap.set(ringKey, {
          ring_number: ringN,
          ringName: r.ringName || (ringN != null ? `Ring ${ringN}` : 'Ring'),
          groups: new Map()
        });
      }
      const ringObj = ringMap.get(ringKey);

      const gidKey = String(gid);
      if (!ringObj.groups.has(gidKey)) {
        const gObj = {
          class_group_id: gid,
          group_name: r.group_name || r.class_name || '(Group)',
          latestStart: r.latestStart || null,
          classes: new Map()
        };
        ringObj.groups.set(gidKey, gObj);
        groupMap.set(gidKey, gObj);
      }
      const gObj = ringObj.groups.get(gidKey);

      const cidKey = String(cid);
      if (!gObj.classes.has(cidKey)) {
        gObj.classes.set(cidKey, {
          class_id: cid,
          class_number: r.class_number,
          class_name: r.class_name || '(Class)'
        });
      }

      // Keep earliest group start (if schedule repeats)
      if (r.latestStart && gObj.latestStart) {
        const a = timeToMinutes(r.latestStart) ?? 999999;
        const b = timeToMinutes(gObj.latestStart) ?? 999999;
        if (a < b) gObj.latestStart = r.latestStart;
      } else if (r.latestStart && !gObj.latestStart) {
        gObj.latestStart = r.latestStart;
      }
    }

    // Trips indexes (truth)
    const tripsByHorse = new Map();
    const tripsByRing = new Map();
    const tripsByGroup = new Map();
    const tripsByClass = new Map();
    const tripsByRider = new Map();

    function push(map, key, val) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(val);
    }

    for (const t of state.trips) {
      if (!t) continue;
      const horse = t.horseName ? String(t.horseName) : null;
      const ring = (t.ring_number != null) ? String(t.ring_number) : null;
      const gid = (t.class_group_id != null) ? String(t.class_group_id) : null;
      const cid = (t.class_id != null) ? String(t.class_id) : null;
      const rider = t.riderName ? String(t.riderName) : null;

      if (horse) push(tripsByHorse, horse, t);
      if (ring) push(tripsByRing, ring, t);
      if (gid) push(tripsByGroup, gid, t);
      if (cid) push(tripsByClass, cid, t);
      if (rider) push(tripsByRider, rider, t);
    }

    return { ringMap, groupMap, tripsByHorse, tripsByRing, tripsByGroup, tripsByClass, tripsByRider };
  }

  // -----------------------------
  // TRUTH FILTERS
  // -----------------------------
  function includedTrips(idx) {
    return state.trips.filter(t => t && t.horseName && state.followedHorses.has(String(t.horseName)));
  }

  function ringAggCount(ringKey, idx, incTrips) {
    const arr = idx.tripsByRing.get(String(ringKey)) || [];
    let n = 0;
    for (const t of arr) {
      if (!t || !t.horseName) continue;
      if (state.followedHorses.has(String(t.horseName))) n++;
    }
    return n;
  }

  function groupAggCount(gidKey, idx) {
    const arr = idx.tripsByGroup.get(String(gidKey)) || [];
    let n = 0;
    for (const t of arr) {
      if (!t || !t.horseName) continue;
      if (state.followedHorses.has(String(t.horseName))) n++;
    }
    return n;
  }

  function classTripsIncluded(cidKey, idx) {
    const arr = idx.tripsByClass.get(String(cidKey)) || [];
    return arr.filter(t => t && t.horseName && state.followedHorses.has(String(t.horseName)));
  }

  // “First trip” rule for a class:
  // pick earliest latestGO, then smallest lastOOG
  function pickFirstTripForClass(tripsArr) {
    if (!tripsArr || tripsArr.length === 0) return null;
    const sorted = tripsArr.slice().sort((a, b) => {
      const ta = timeToMinutes(a && a.latestGO) ?? 999999;
      const tb = timeToMinutes(b && b.latestGO) ?? 999999;
      if (ta !== tb) return ta - tb;

      const oa = (a && a.lastOOG != null) ? Number(a.lastOOG) : 999999;
      const ob = (b && b.lastOOG != null) ? Number(b.lastOOG) : 999999;
      return oa - ob;
    });
    return sorted[0] || null;
  }

  // -----------------------------
  // AGGREGATES (BOTTOM NAV)
  // -----------------------------
  function renderAggs(idx) {
    const followedCount = state.followedHorses.size;

    const inc = includedTrips(idx);

    const rings = new Set();
    const groups = new Set();
    const riders = new Set();

    for (const t of inc) {
      if (t.ring_number != null) rings.add(String(t.ring_number));
      if (t.class_group_id != null) groups.add(String(t.class_group_id));
      if (t.riderName) riders.add(String(t.riderName));
    }

    setAgg('state', followedCount);
    setAgg('rings', rings.size);
    setAgg('classes', groups.size);
    setAgg('riders', riders.size);
  }

  // -----------------------------
  // SCREENS
  // -----------------------------
  function renderStart(idx) {
    clearRoot();
    setHeader('Start');
    showBack(false);
    showNext(true, 'Next');
    setNavActive('horses'); // after start, primary is horses

    const box = el('div', 'row');
    const left = el('div', 'row-left');
    left.appendChild(el('div', 'row-title', 'CRT Daily Show'));
    left.appendChild(el('div', 'row-sub', state.loaded
      ? `sid ${state.meta.sid || '-'} • ${state.meta.dt || '-'}`
      : 'Loading…'
    ));
    box.appendChild(left);

    const right = el('div', 'row-right');
    const tag = el('div', 'row-tag', state.loaded ? 'READY' : '…');
    if (state.loaded) tag.classList.add('row-tag--positive');
    right.appendChild(tag);
    box.appendChild(right);

    screenRoot.appendChild(box);

    const startRow = el('div', 'row row--tap');
    const l2 = el('div', 'row-left');
    l2.appendChild(el('div', 'row-title', 'Start Session'));
    l2.appendChild(el('div', 'row-sub', 'Select horses to follow, then Next → Rings.'));
    startRow.appendChild(l2);
    startRow.appendChild(el('div', 'row-tag', 'GO'));
    startRow.addEventListener('click', () => goto('horses'));
    screenRoot.appendChild(startRow);
  }

  function renderHorses(idx) {
    clearRoot();
    setHeader('Active Horses');
    showBack(false);
    showNext(true, 'Next');
    setNavActive('horses');

    // Search
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

    const allHorses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
      .sort((a, b) => a.localeCompare(b));

    const q = normalizeStr(state.horseSearch);
    const horses = q ? allHorses.filter(h => normalizeStr(h).includes(q)) : allHorses;

    for (const h of horses) {
      const horseKey = String(h);
      const truthTrips = idx.tripsByHorse.get(horseKey) || [];
      const followed = state.followedHorses.has(horseKey);

      const row = el('div', 'row row--tap' + (followed ? ' row--active' : ''));
      const left = el('div', 'row-left');
      left.appendChild(el('div', 'row-title', horseKey));
      left.appendChild(el('div', 'row-sub', followed ? 'FOLLOWING' : 'TAP TO FOLLOW'));
      row.appendChild(left);

      const right = el('div', 'row-right');
      const countTag = el('div', 'row-tag', String(truthTrips.length));
      if (followed && truthTrips.length > 0) countTag.classList.add('row-tag--positive');
      right.appendChild(countTag);
      row.appendChild(right);

      row.addEventListener('click', () => {
        if (state.followedHorses.has(horseKey)) state.followedHorses.delete(horseKey);
        else state.followedHorses.add(horseKey);
        saveFollowedToLS();
        render();
      });

      screenRoot.appendChild(row);
    }
  }

  function renderRings(idx) {
    clearRoot();
    setHeader('Rings');
    showBack(false);
    showNext(false);
    setNavActive('rings');

    const incTrips = includedTrips(idx);

    // Peak ring picker (sticky, scroll)
    const ringsSorted = [...idx.ringMap.values()].sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));

    const peak = el('div', 'peakbar');
    const peakRow = el('div', 'peakbar-row');

    for (const r of ringsSorted) {
      const ringKey = String(r.ring_number);
      const agg = ringAggCount(ringKey, idx, incTrips);

      const b = el('button', 'nav-btn', `${r.ringName} (${agg})`);
      const selected = (state.peakRing === ringKey);
      if (selected) b.classList.add('nav-btn--primary');
      b.addEventListener('click', () => {
        state.peakRing = (state.peakRing === ringKey) ? null : ringKey;
        render();
      });
      peakRow.appendChild(b);
    }

    peak.appendChild(peakRow);
    screenRoot.appendChild(peak);

    // Visible rings
    const visibleRings = state.peakRing
      ? ringsSorted.filter(r => String(r.ring_number) === String(state.peakRing))
      : ringsSorted;

    for (const r of visibleRings) {
      const ringKey = String(r.ring_number);
      const ringAgg = ringAggCount(ringKey, idx, incTrips);

      const card = el('div', 'card');

      // Header (inverse + flex)
      const hdr = el('div', 'card-hdr card-hdr--inverse');
      hdr.appendChild(el('div', 'card-title', r.ringName));
      if (ringAgg > 0) {
        const badge = el('div', 'card-badge card-badge--positive', String(ringAgg));
        hdr.appendChild(badge);
      }
      card.appendChild(hdr);

      const body = el('div', 'card-body');

      // Groups sorted by latestStart then name
      const groups = [...r.groups.values()].slice().sort((a, b) => {
        const ta = timeToMinutes(a.latestStart) ?? 999999;
        const tb = timeToMinutes(b.latestStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name || '').localeCompare(String(b.group_name || ''));
      });

      for (const g of groups) {
        const gidKey = String(g.class_group_id);
        const gAgg = groupAggCount(gidKey, idx);

        // Group 3-col line
        const line = el('div', 'line3');
        line.appendChild(el('div', 'c3-time', g.latestStart || ''));
        const nameWrap = el('div', 'c3-name');
        nameWrap.appendChild(el('div', 'gname', g.group_name || '(Group)'));
        line.appendChild(nameWrap);

        const aggWrap = el('div', 'c3-agg');
        if (gAgg > 0) {
          const tag = el('div', 'row-tag row-tag--positive', String(gAgg));
          aggWrap.appendChild(tag);
        }
        line.appendChild(aggWrap);

        body.appendChild(line);

        // Under group: classes and collapsed “first” trip per class
        const classes = [...g.classes.values()].slice().sort((a, b) => (Number(a.class_number) || 0) - (Number(b.class_number) || 0));

        for (const c of classes) {
          const cidKey = String(c.class_id);
          const cTrips = classTripsIncluded(cidKey, idx);
          if (cTrips.length === 0) continue; // only show classes that matter to trips truth

          // Class line
          const clsLine = el('div', 'class-line', `${c.class_number || ''} • ${c.class_name || ''}`.trim());
          body.appendChild(clsLine);

          // First trip (earliest GO / smallest OOG)
          const first = pickFirstTripForClass(cTrips);
          if (first) {
            const go = first.latestGO ? String(first.latestGO) : '';
            const horse = first.horseName ? String(first.horseName) : '';
            const oog = (first.lastOOG != null) ? `OOG ${first.lastOOG}` : '';

            const entry = el('div', 'entry-line');
            const a = el('div', null, `First: ${[go, horse].filter(Boolean).join(' • ')}${oog ? ` (${oog})` : ''}`.trim());
            entry.appendChild(a);

            // optional muted helper line
            const sub = [];
            if (first.riderName) sub.push(String(first.riderName));
            if (first.teamName) sub.push(String(first.teamName));
            if (sub.length) {
              const m = el('div', 'muted', sub.join(' • '));
              entry.appendChild(m);
            }

            body.appendChild(entry);
          }
        }
      }

      card.appendChild(body);
      screenRoot.appendChild(card);
    }
  }

  function renderClasses(idx) {
    clearRoot();
    setHeader('Active Classes');
    showBack(false);
    showNext(false);
    setNavActive('classes');

    const inc = includedTrips(idx);

    // group by class_group_id
    const byGroup = new Map();
    for (const t of inc) {
      if (!t || t.class_group_id == null) continue;
      const k = String(t.class_group_id);
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(t);
    }

    const items = [...byGroup.entries()].map(([gidKey, arr]) => {
      // find schedule group info (if present)
      const g = idx.groupMap.get(gidKey);
      return {
        gidKey,
        count: arr.length,
        latestStart: g && g.latestStart ? g.latestStart : '',
        name: g && g.group_name ? g.group_name : `Group ${gidKey}`
      };
    }).sort((a, b) => {
      const ta = timeToMinutes(a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.name).localeCompare(String(b.name));
    });

    for (const it of items) {
      const row = el('div', 'row');
      const left = el('div', 'row-left');
      left.appendChild(el('div', 'row-title', `${it.latestStart ? it.latestStart + ' • ' : ''}${it.name}`.trim()));
      left.appendChild(el('div', 'row-sub', `group ${it.gidKey}`));
      row.appendChild(left);

      const right = el('div', 'row-right');
      const tag = el('div', 'row-tag row-tag--positive', String(it.count));
      right.appendChild(tag);
      row.appendChild(right);

      screenRoot.appendChild(row);
    }
  }

  function renderRiders(idx) {
    clearRoot();
    setHeader('Active Riders');
    showBack(false);
    showNext(false);
    setNavActive('riders');

    const inc = includedTrips(idx);

    const byRider = new Map();
    for (const t of inc) {
      const r = t && t.riderName ? String(t.riderName) : null;
      if (!r) continue;
      if (!byRider.has(r)) byRider.set(r, []);
      byRider.get(r).push(t);
    }

    const riders = [...byRider.entries()].map(([name, arr]) => ({
      name,
      count: arr.length
    })).sort((a, b) => a.name.localeCompare(b.name));

    for (const it of riders) {
      const row = el('div', 'row');
      const left = el('div', 'row-left');
      left.appendChild(el('div', 'row-title', it.name));
      row.appendChild(left);

      const right = el('div', 'row-right');
      const tag = el('div', 'row-tag row-tag--positive', String(it.count));
      right.appendChild(tag);
      row.appendChild(right);

      screenRoot.appendChild(row);
    }
  }

  // -----------------------------
  // ROUTING
  // -----------------------------
  function goto(screenKey) {
    state.screen = screenKey;

    // peak ring is only relevant on Rings; leave it as-is when returning to Rings
    if (screenKey !== 'rings') {
      // no-op
    }
    render();
  }

  // -----------------------------
  // RENDER
  // -----------------------------
  function render() {
    if (!screenRoot || !headerTitle) return;

    const idx = buildIndexes();
    renderAggs(idx);

    // Header next behavior
    if (state.screen === 'start') {
      showNext(true, 'Next');
      headerNext.onclick = () => goto('horses');
    } else if (state.screen === 'horses') {
      showNext(true, 'Next');
      headerNext.onclick = () => goto('rings');
    } else {
      showNext(false);
      if (headerNext) headerNext.onclick = null;
    }

    // No back stack in this build (UI fidelity first)
    showBack(false);

    // Bottom nav active
    if (state.screen === 'horses') setNavActive('horses');
    else if (state.screen === 'rings') setNavActive('rings');
    else if (state.screen === 'classes') setNavActive('classes');
    else if (state.screen === 'riders') setNavActive('riders');
    else setNavActive('horses');

    if (state.screen === 'start') return renderStart(idx);
    if (state.screen === 'horses') return renderHorses(idx);
    if (state.screen === 'rings') return renderRings(idx);
    if (state.screen === 'classes') return renderClasses(idx);
    if (state.screen === 'riders') return renderRiders(idx);

    state.screen = 'start';
    renderStart(idx);
  }

  // -----------------------------
  // EVENTS
  // -----------------------------
  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;
      const next = btn.dataset.screen;

      // Bottom nav is session-only; start is not in nav by design.
      goto(next);
    });
  }

  // -----------------------------
  // BOOT
  // -----------------------------
  loadAll().catch(() => {});
  render();
})();
