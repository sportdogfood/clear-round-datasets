// app.js — CRT Schedule (legacy UX contract + true cards + session start)
// Data:
//   docs/schedule/data/latest/watch_schedule.json  (full show scaffold)
//   docs/schedule/data/latest/watch_trips.json     (truth: active entries)
// Rules:
//   - Start -> Active Horses (no toggles)
//   - Active Horses = legacy rows + state-search
//   - Toggles only after horses (scope FULL/ACTIVE, status LIVE/ALL)
//   - Peak is separate state from toggles (per-screen)
//   - Aggs are based on trips only (not full schedule)
//   - Rings view renders schedule scaffold with trips overlay (cards)

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  const STATUS_COMPLETED = 'Completed';

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const state = {
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    // follow set (horseName)
    followedHorses: new Set(),

    // per-screen peak selections (never share keys with toggles)
    peak: {
      rings: new Set(),
      classes: new Set(),
      riders: new Set()
    },

    // horses screen search
    horseSearch: '',

    // toggles (global gating)
    ui: {
      scopeMode: 'ACTIVE', // ACTIVE | FULL  (ACTIVE gates to followedHorses)
      statusMode: 'LIVE'   // LIVE | ALL     (LIVE excludes Completed)
    },

    // navigation
    currentScreen: 'start', // start | horses | rings | classes | riders | (detail later)
    history: []
  };

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // LOAD
  // ---------------------------------------------------------------------------

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.json();
  }

  async function loadAll() {
    try {
      const [sched, trips] = await Promise.all([
        fetchJson(DATA_SCHEDULE_URL),
        fetchJson(DATA_TRIPS_URL)
      ]);

      state.schedule = Array.isArray(sched?.records) ? sched.records : [];
      state.trips = Array.isArray(trips?.records) ? trips.records : [];

      const dtScope =
        sched?.meta?.dt ||
        sched?.records?.[0]?.dt ||
        trips?.records?.[0]?.dt ||
        null;

      const sidScope =
        sched?.records?.[0]?.sid ??
        trips?.records?.[0]?.sid ??
        null;

      state.meta = {
        dt: dtScope,
        sid: sidScope,
        generated_at: sched?.meta?.generated_at || trips?.meta?.generated_at || null
      };

      // Seed followed horses on first load (follow all horses seen in trips)
      if (state.followedHorses.size === 0) {
        const horses = uniqueStrings(state.trips.map(t => t?.horseName).filter(Boolean));
        horses.forEach(h => state.followedHorses.add(h));
      }

      render();
      updateNavAggs();
    } catch (_) {
      // silent
    }
  }

  setInterval(loadAll, REFRESH_MS);

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  function uniqueStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const v of arr) {
      if (v == null) continue;
      const s = String(v);
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }

  function pushMapArr(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const s = timeStr.trim();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'AM') { if (hh === 12) hh = 0; }
    else { if (hh !== 12) hh += 12; }
    return hh * 60 + mm;
  }

  function dtTimeToEpochMs(dt, timeStr) {
    const mins = parseTimeToMinutes(timeStr);
    if (!dt || mins == null) return null;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const isoLocal = `${dt}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
    const d = new Date(isoLocal);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  // ---------------------------------------------------------------------------
  // GATING (toggles)
  // ---------------------------------------------------------------------------

  function isFollowedHorse(horseName) {
    return state.followedHorses.has(String(horseName || ''));
  }

  function tripPassesStatusMode(trip) {
    if (state.ui.statusMode === 'ALL') return true;
    return trip?.latestStatus !== STATUS_COMPLETED;
  }

  function tripIsIncluded(trip) {
    if (!trip) return false;

    // Scope: ACTIVE means only followed horses; FULL means all trips still allowed
    if (state.ui.scopeMode === 'ACTIVE') {
      if (!isFollowedHorse(trip.horseName)) return false;
    }

    // Status: LIVE excludes Completed; ALL includes everything
    if (!tripPassesStatusMode(trip)) return false;

    return true;
  }

  // ---------------------------------------------------------------------------
  // INDEXES
  // ---------------------------------------------------------------------------

  function buildIndexes() {
    const trips = state.trips || [];
    const sched = state.schedule || [];

    const tripsByRing = new Map();   // ring_number -> trips[]
    const tripsByGroup = new Map();  // class_group_id -> trips[]
    const tripsByClass = new Map();  // class_id -> trips[]
    const tripsByRider = new Map();  // riderName -> trips[]
    const tripsByHorse = new Map();  // horseName -> trips[]

    for (const t of trips) {
      const ring = t?.ring_number;
      const gid = t?.class_group_id;
      const cid = t?.class_id;

      if (ring != null) pushMapArr(tripsByRing, String(ring), t);
      if (gid != null) pushMapArr(tripsByGroup, String(gid), t);
      if (cid != null) pushMapArr(tripsByClass, String(cid), t);
      if (t?.riderName) pushMapArr(tripsByRider, String(t.riderName), t);
      if (t?.horseName) pushMapArr(tripsByHorse, String(t.horseName), t);
    }

    // Schedule scaffold: ring -> group -> class (keep order by start time)
    const rings = new Map(); // ring_number -> ringObj
    for (const r of sched) {
      const ringN = r?.ring_number;
      const ringName = r?.ringName;
      const gid = r?.class_group_id;
      const gname = r?.group_name;
      const cid = r?.class_id;
      const cnum = r?.class_number;
      const cname = r?.class_name;
      const latestStart = r?.latestStart;

      if (ringN == null || gid == null || cid == null) continue;

      const rk = String(ringN);
      if (!rings.has(rk)) {
        rings.set(rk, {
          ring_number: ringN,
          ringName: ringName || `Ring ${ringN}`,
          startMsMin: null,
          groups: new Map()
        });
      }
      const ringObj = rings.get(rk);

      const gk = String(gid);
      if (!ringObj.groups.has(gk)) {
        ringObj.groups.set(gk, {
          class_group_id: gid,
          group_name: gname || '(group)',
          startMsMin: null,
          classes: new Map()
        });
      }
      const groupObj = ringObj.groups.get(gk);

      const gStart = dtTimeToEpochMs(r?.dt || state.meta.dt, latestStart);
      if (gStart != null) {
        if (groupObj.startMsMin == null || gStart < groupObj.startMsMin) groupObj.startMsMin = gStart;
        if (ringObj.startMsMin == null || gStart < ringObj.startMsMin) ringObj.startMsMin = gStart;
      }

      const ck = String(cid);
      if (!groupObj.classes.has(ck)) {
        groupObj.classes.set(ck, {
          class_id: cid,
          class_number: cnum,
          class_name: cname || `(Class ${cid})`,
          latestStart: latestStart || null,
          startMs: dtTimeToEpochMs(r?.dt || state.meta.dt, latestStart)
        });
      }
    }

    return {
      tripsByRing,
      tripsByGroup,
      tripsByClass,
      tripsByRider,
      tripsByHorse,
      rings
    };
  }

  // ---------------------------------------------------------------------------
  // DOM BUILDERS (legacy contract)
  // ---------------------------------------------------------------------------

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function makeRow(label, tagText, onClick, isActive) {
    const r = el('div', 'row row--tap');
    if (isActive) r.classList.add('row--active');

    const title = el('div', 'row-title', label);
    r.appendChild(title);

    if (tagText != null) {
      const tag = el('div', 'row-tag row-tag--count', String(tagText));
      r.appendChild(tag);
    }

    if (onClick) r.addEventListener('click', onClick);
    return r;
  }

  function makeStateSearch(placeholder, value, onInput) {
    const wrap = el('div', 'state-search');
    const input = document.createElement('input');
    input.className = 'state-search-input';
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value || '';
    input.addEventListener('input', () => onInput(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  function makeToggleBar() {
    // Two buttons only. No labels. Primary indicates selected mode.
    const bar = el('div', 'nav-row');
    bar.classList.add('sticky-bar');

    // Scope: ACTIVE/FULL
    const btnScope = document.createElement('button');
    btnScope.type = 'button';
    btnScope.className = 'nav-btn';
    btnScope.textContent = state.ui.scopeMode; // ACTIVE or FULL
    if (state.ui.scopeMode === 'ACTIVE') btnScope.classList.add('nav-btn--primary');
    btnScope.addEventListener('click', () => {
      state.ui.scopeMode = (state.ui.scopeMode === 'ACTIVE') ? 'FULL' : 'ACTIVE';
      render();
      updateNavAggs();
    });

    // Status: LIVE/ALL
    const btnStatus = document.createElement('button');
    btnStatus.type = 'button';
    btnStatus.className = 'nav-btn';
    btnStatus.textContent = state.ui.statusMode; // LIVE or ALL
    if (state.ui.statusMode === 'LIVE') btnStatus.classList.add('nav-btn--primary');
    btnStatus.addEventListener('click', () => {
      state.ui.statusMode = (state.ui.statusMode === 'LIVE') ? 'ALL' : 'LIVE';
      render();
      updateNavAggs();
    });

    bar.appendChild(btnScope);
    bar.appendChild(btnStatus);
    return bar;
  }

  function makePeakBar(screenKey, items, getAgg, onToggle) {
    // Peak is separate from toggles and sticks under toggle bar (or top if no toggles).
    const wrap = el('div', 'sticky-bar');
    const row = el('div', 'nav-row');

    const selected = state.peak[screenKey];

    for (const it of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-btn';
      if (selected.has(it.key)) btn.classList.add('nav-btn--primary');

      const label = el('span', 'nav-label', it.label);
      btn.appendChild(label);

      const agg = getAgg ? getAgg(it.key) : 0;
      if (agg > 0) {
        const pill = el('span', 'nav-agg nav-agg--positive', String(agg));
        btn.appendChild(pill);
      }

      btn.addEventListener('click', () => onToggle(it.key));
      row.appendChild(btn);
    }

    wrap.appendChild(row);
    return wrap;
  }

  function togglePeak(screenKey, key) {
    const s = state.peak[screenKey];
    if (s.has(key)) s.delete(key);
    else s.add(key);
    render();
  }

  // Cards (true card DOM + CSS from index.html)
  function makeCard() {
    return el('div', 'card');
  }

  function makeCardHeader(titleText, aggCount) {
    const hdr = el('div', 'card-header');
    const title = el('div', 'card-title', titleText);
    hdr.appendChild(title);

    // show agg only if >0
    if (aggCount != null && Number(aggCount) > 0) {
      const pill = el('div', 'row-tag row-tag--count row-tag--positive', String(aggCount));
      hdr.appendChild(pill);
    }

    return hdr;
  }

  function makeCardBody() {
    return el('div', 'card-body');
  }

  function makeCardLine(timeText, mainText, aggCount) {
    const line = el('div', 'card-line');

    const t = el('div', 'card-time', timeText || '');
    const m = el('div', 'card-main', mainText || '');
    const a = el('div', 'card-agg');

    if (aggCount != null && Number(aggCount) > 0) {
      const pill = el('div', 'row-tag row-tag--count', String(aggCount));
      a.appendChild(pill);
    }

    line.appendChild(t);
    line.appendChild(m);
    line.appendChild(a);

    return line;
  }

  function makeCardDivider() {
    return el('div', 'card-divider');
  }

  // ---------------------------------------------------------------------------
  // NAV
  // ---------------------------------------------------------------------------

  function pushHistory(fromScreen) {
    state.history.push(fromScreen);
  }

  function setScreen(nextScreen, push = true) {
    if (push) pushHistory(state.currentScreen);
    state.currentScreen = nextScreen;
    render();
    updateNavAggs();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) {
      state.currentScreen = 'start';
    } else {
      state.currentScreen = prev;
    }
    render();
    updateNavAggs();
  }

  // ---------------------------------------------------------------------------
  // NAV AGGS (trips only)
  // ---------------------------------------------------------------------------

  function includedTrips() {
    return (state.trips || []).filter(tripIsIncluded);
  }

  function updateNavAggs() {
    const btns = navRow ? Array.from(navRow.querySelectorAll('.nav-btn')) : [];
    const setPrimary = (screen) => {
      for (const b of btns) {
        const isMatch = b.dataset.screen === screen;
        b.classList.toggle('nav-btn--primary', isMatch);
      }
    };

    const trips = includedTrips();

    const horsesAgg = uniqueStrings(trips.map(t => t?.horseName).filter(Boolean)).length;
    const ringsAgg = uniqueStrings(trips.map(t => t?.ring_number).filter(v => v != null)).length;
    const classesAgg = uniqueStrings(trips.map(t => t?.class_id).filter(v => v != null)).length;
    const ridersAgg = uniqueStrings(trips.map(t => t?.riderName).filter(Boolean)).length;

    const setAgg = (key, value) => {
      if (!navRow) return;
      const span = navRow.querySelector(`[data-nav-agg="${key}"]`);
      if (!span) return;
      const n = Number(value || 0);
      span.textContent = String(n);
      span.hidden = !(n > 0);
      span.classList.toggle('nav-agg--positive', n > 0);
    };

    setAgg('horses', horsesAgg);
    setAgg('rings', ringsAgg);
    setAgg('classes', classesAgg);
    setAgg('riders', ridersAgg);

    // On start screen, no primary
    if (state.currentScreen === 'start') {
      for (const b of btns) b.classList.remove('nav-btn--primary');
    } else {
      setPrimary(state.currentScreen);
    }
  }

  // ---------------------------------------------------------------------------
  // SCREENS
  // ---------------------------------------------------------------------------

  function renderStart() {
    clearRoot();

    const logo = el('div', 'start-logo');
    logo.appendChild(el('div', 'start-logo-title', 'CRT Schedule'));
    logo.appendChild(el('div', 'start-logo-subtitle', state.meta.dt ? `Today: ${state.meta.dt}` : ''));
    screenRoot.appendChild(logo);

    // A simple start instruction row
    const r1 = makeRow('Select horses to follow', null, () => setScreen('horses'), false);
    screenRoot.appendChild(r1);

    const r2 = makeRow('Proceed to Rings', null, () => setScreen('rings'), false);
    screenRoot.appendChild(r2);
  }

  function renderHorses(idx) {
    clearRoot();

    // State search (legacy)
    screenRoot.appendChild(
      makeStateSearch('Search horses…', state.horseSearch, (v) => {
        state.horseSearch = v || '';
        render();
      })
    );

    const tripsAll = state.trips || [];
    const horseNames = uniqueStrings(tripsAll.map(t => t?.horseName).filter(Boolean))
      .sort((a, b) => a.localeCompare(b));

    const q = state.horseSearch.trim().toLowerCase();
    const visible = q ? horseNames.filter(h => String(h).toLowerCase().includes(q)) : horseNames;

    for (const horse of visible) {
      const isOn = isFollowedHorse(horse);

      // Count for this horse = trips passing status toggle (and scope toggle should NOT hide horses screen)
      const count = tripsAll
        .filter(t => t?.horseName === horse)
        .filter(tripPassesStatusMode)
        .length;

      screenRoot.appendChild(
        makeRow(
          horse,
          count,
          () => {
            if (isOn) state.followedHorses.delete(horse);
            else state.followedHorses.add(horse);
            render();
            updateNavAggs();
          },
          isOn
        )
      );
    }
  }

  function renderRings(idx) {
    clearRoot();

    // Toggles (sticky)
    screenRoot.appendChild(makeToggleBar());

    // Peak (rings) (sticky under toggles)
    const ringArrAll = [...idx.rings.values()].sort((a, b) => {
      const ta = a.startMsMin ?? 0;
      const tb = b.startMsMin ?? 0;
      if (ta && tb && ta !== tb) return ta - tb;
      return a.ring_number - b.ring_number;
    });

    const ringAgg = (ringKey) => {
      const trips = (idx.tripsByRing.get(String(ringKey)) || []).filter(tripIsIncluded);
      return trips.length;
    };

    const peakItems = ringArrAll.map(r => ({ key: String(r.ring_number), label: r.ringName }));
    screenRoot.appendChild(
      makePeakBar('rings', peakItems, ringAgg, (k) => togglePeak('rings', k))
    );

    // Visible rings after peak filter
    const peakSet = state.peak.rings;
    const ringArr = peakSet.size
      ? ringArrAll.filter(r => peakSet.has(String(r.ring_number)))
      : ringArrAll;

    // Cards
    for (const ring of ringArr) {
      const ringKey = String(ring.ring_number);
      const ringTripsIncluded = (idx.tripsByRing.get(ringKey) || []).filter(tripIsIncluded);

      // Card header: show agg only if >0
      const card = makeCard();
      card.appendChild(makeCardHeader(ring.ringName, ringTripsIncluded.length));

      const body = makeCardBody();

      // Groups sorted by earliest start
      const groupsArr = [...ring.groups.values()].slice().sort((a, b) => (a.startMsMin ?? 0) - (b.startMsMin ?? 0));

      for (const g of groupsArr) {
        const gid = String(g.class_group_id);
        const gTrips = (idx.tripsByGroup.get(gid) || []).filter(tripIsIncluded);

        // Group time = first class latestStart in that group (from any class record)
        // We can pick the earliest class start in this group:
        let groupTime = '';
        let groupTimeMs = null;
        for (const c of g.classes.values()) {
          const ms = c.startMs ?? dtTimeToEpochMs(state.meta.dt, c.latestStart);
          if (ms != null && (groupTimeMs == null || ms < groupTimeMs)) {
            groupTimeMs = ms;
            groupTime = c.latestStart || '';
          }
        }

        // Group line: time | group name | agg (only if >0)
        body.appendChild(makeCardLine(groupTime, g.group_name, gTrips.length));

        // Classes under group:
        const clsArr = [...g.classes.values()].slice().sort((a, b) => {
          const ta = a.startMs ?? 0;
          const tb = b.startMs ?? 0;
          if (ta && tb && ta !== tb) return ta - tb;
          return (a.class_number ?? 0) - (b.class_number ?? 0);
        });

        for (const c of clsArr) {
          const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIsIncluded);

          // Only show first trip for that class (by OOG, then latestGO)
          let firstTrip = null;
          if (cTrips.length) {
            firstTrip = cTrips.slice().sort((a, b) => {
              const oa = (a.lastOOG ?? 999999);
              const ob = (b.lastOOG ?? 999999);
              if (oa !== ob) return oa - ob;
              const ta = parseTimeToMinutes(a.latestGO || '') ?? 999999;
              const tb = parseTimeToMinutes(b.latestGO || '') ?? 999999;
              return ta - tb;
            })[0];
          }

          // Class line: time = firstTrip.latestGO, main = "#class_number horse (OOG)"
          const tTime = firstTrip?.latestGO || '';
          const horse = firstTrip?.horseName || '';
          const oog = firstTrip?.lastOOG != null ? `(${firstTrip.lastOOG})` : '';
          const classNum = (c.class_number != null) ? String(c.class_number) : String(c.class_id);

          const main = firstTrip
            ? `${classNum} • ${horse} ${oog}`.trim()
            : `${classNum}`;

          body.appendChild(makeCardLine(tTime, main, null));
        }

        body.appendChild(makeCardDivider());
      }

      card.appendChild(body);
      screenRoot.appendChild(card);
    }
  }

  function renderClasses(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleBar());

    // Peak (groups)
    const groupsAll = [];
    for (const ring of idx.rings.values()) {
      for (const g of ring.groups.values()) groupsAll.push(g);
    }

    groupsAll.sort((a, b) => (a.startMsMin ?? 0) - (b.startMsMin ?? 0));

    const groupAgg = (gid) => {
      const trips = (idx.tripsByGroup.get(String(gid)) || []).filter(tripIsIncluded);
      return trips.length;
    };

    const peakItems = groupsAll.map(g => ({ key: String(g.class_group_id), label: g.group_name }));
    screenRoot.appendChild(makePeakBar('classes', peakItems, groupAgg, (k) => togglePeak('classes', k)));

    const peakSet = state.peak.classes;
    const visibleGroups = peakSet.size
      ? groupsAll.filter(g => peakSet.has(String(g.class_group_id)))
      : groupsAll;

    for (const g of visibleGroups) {
      const gid = String(g.class_group_id);
      const gTrips = (idx.tripsByGroup.get(gid) || []).filter(tripIsIncluded);

      const card = makeCard();
      card.appendChild(makeCardHeader(g.group_name, gTrips.length));

      const body = makeCardBody();
      const clsArr = [...g.classes.values()].slice().sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

      for (const c of clsArr) {
        const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIsIncluded);
        let firstTrip = null;
        if (cTrips.length) {
          firstTrip = cTrips.slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999))[0];
        }
        const classNum = (c.class_number != null) ? String(c.class_number) : String(c.class_id);
        const tTime = firstTrip?.latestGO || '';
        const horse = firstTrip?.horseName || '';
        const oog = firstTrip?.lastOOG != null ? `(${firstTrip.lastOOG})` : '';
        const main = firstTrip ? `${classNum} • ${horse} ${oog}`.trim() : `${classNum}`;
        body.appendChild(makeCardLine(tTime, main, null));
      }

      card.appendChild(body);
      screenRoot.appendChild(card);
    }
  }

  function renderRiders(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleBar());

    const trips = includedTrips();
    const riders = uniqueStrings(trips.map(t => t?.riderName).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    // Peak (riders)
    const riderAgg = (name) => (idx.tripsByRider.get(String(name)) || []).filter(tripIsIncluded).length;
    const peakItems = riders.map(r => ({ key: r, label: r }));
    screenRoot.appendChild(makePeakBar('riders', peakItems, riderAgg, (k) => togglePeak('riders', k)));

    const peakSet = state.peak.riders;
    const visible = peakSet.size ? riders.filter(r => peakSet.has(r)) : riders;

    for (const rider of visible) {
      const count = riderAgg(rider);
      screenRoot.appendChild(makeRow(rider, count, null, false));
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  function render() {
    if (!screenRoot || !headerTitle) return;

    const idx = buildIndexes();

    // Header title
    const titleMap = {
      start: 'Start',
      horses: 'Active Horses',
      rings: 'Rings',
      classes: 'Classes',
      riders: 'Riders'
    };
    headerTitle.textContent = titleMap[state.currentScreen] || state.currentScreen;

    // Back button
    if (headerBack) {
      headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
    }

    // Header action (session flow)
    if (headerAction) {
      headerAction.hidden = true;
      headerAction.onclick = null;

      if (state.currentScreen === 'start') {
        headerAction.hidden = false;
        headerAction.textContent = 'Proceed';
        headerAction.onclick = () => setScreen('horses');
      } else if (state.currentScreen === 'horses') {
        headerAction.hidden = false;
        headerAction.textContent = 'Next';
        headerAction.onclick = () => setScreen('rings');
      }
    }

    // Render screen
    if (state.currentScreen === 'start') return renderStart();
    if (state.currentScreen === 'horses') return renderHorses(idx);
    if (state.currentScreen === 'rings') return renderRings(idx);
    if (state.currentScreen === 'classes') return renderClasses(idx);
    if (state.currentScreen === 'riders') return renderRiders(idx);

    // fallback
    clearRoot();
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  if (headerBack) headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const next = btn.dataset.screen;
      if (!next) return;

      // nav switches do not build long history
      state.history = [];
      state.currentScreen = next;

      render();
      updateNavAggs();
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------

  loadAll();
})();
