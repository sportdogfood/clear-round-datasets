// app.js — CRT Daily Show Follow (rings/classes/horses/riders) — 2-payload version
// CSS unchanged (uses existing classes). In-memory only. Refresh re-loads JSON.
// Truth: watch_trips (entryxclasses_uuid). Schedule scaffold: watch_schedule.

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
  // STATE (in-memory only)
  // ---------------------------------------------------------------------------

  const state = {
    // raw
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    // user gating
    activeHorseNames: new Set(),          // "followed" horses
    selectedPeakKeys: new Set(),          // per-screen filter
    ui: {
      scopeMode: 'ACTIVE',                // FULL | ACTIVE
      statusMode: 'ACTIVE',               // ACTIVE | COMPLETED
    },

    // nav
    currentScreen: 'horses',              // horses | rings | classes | riders | summary | (detail pages)
    history: [],
    detail: null                          // { kind, key, extra }
  };

  // ---------------------------------------------------------------------------
  // DOM (assumed existing)
  // ---------------------------------------------------------------------------

  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // TIME HELPERS (assume dt + latestStart is America/New_York local time)
  // ---------------------------------------------------------------------------

  function parseTimeToMinutes(timeStr) {
    // "8:05 AM" -> minutes since midnight
    if (!timeStr || typeof timeStr !== 'string') return null;
    const s = timeStr.trim();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'AM') {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return hh * 60 + mm;
  }

  function dtTimeToEpochMs(dt, timeStr) {
    // dt = "YYYY-MM-DD", timeStr="h:mm AM"
    const mins = parseTimeToMinutes(timeStr);
    if (!dt || mins == null) return null;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    // Interpret as local time (user runs in ET; requirement = assume ET)
    const isoLocal = `${dt}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
    const d = new Date(isoLocal);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  // ---------------------------------------------------------------------------
  // LOAD + REFRESH
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

      // Seed active horses (follow all on first load)
      if (state.activeHorseNames.size === 0) {
        const horses = uniqueStrings(state.trips.map(t => t?.horseName).filter(Boolean));
        horses.forEach(h => state.activeHorseNames.add(h));
      } else {
        // If new horses appear later, auto-follow them (does not re-follow manually unfollowed)
        const seen = new Set(state.trips.map(t => t?.horseName).filter(Boolean));
        for (const h of seen) {
          // Only auto-add if user has never interacted? We can't know; keep conservative:
          // do not auto-add if any horse has been unfollowed (active set smaller than seen).
          // If active set is empty (user unfollowed all), do not auto-add.
        }
      }

      render();
    } catch (_) {
      // fail silent
    }
  }

  setInterval(loadAll, REFRESH_MS);

  // ---------------------------------------------------------------------------
  // CORE GATING RULES
  // ---------------------------------------------------------------------------

  function isHorseActive(horseName) {
    return state.activeHorseNames.has(horseName);
  }

  function tripPassesStatusMode(trip) {
    if (state.ui.statusMode === 'COMPLETED') return true;
    return trip?.latestStatus !== STATUS_COMPLETED;
  }

  function schedulePassesStatusMode(rec) {
    if (state.ui.statusMode === 'COMPLETED') return true;
    return rec?.latestStatus !== STATUS_COMPLETED;
  }

  function tripIsIncluded(trip) {
    if (!trip) return false;
    if (state.ui.scopeMode === 'ACTIVE' && !isHorseActive(trip.horseName)) return false;
    if (!tripPassesStatusMode(trip)) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // INDEXES (recomputed each render)
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

  function indexData() {
    const trips = state.trips || [];
    const sched = state.schedule || [];

    // Trips by keys
    const tripsByRing = new Map();       // ring_number -> trips[]
    const tripsByGroup = new Map();      // class_group_id -> trips[]
    const tripsByClass = new Map();      // class_id -> trips[]
    const tripsByHorse = new Map();      // horseName -> trips[]
    const tripsByRider = new Map();      // riderName -> trips[]
    const tripsByEntryKey = new Map();   // class_id|horseName -> trips[] (entry-ish)

    for (const t of trips) {
      const ring = t?.ring_number;
      const gid = t?.class_group_id;
      const cid = t?.class_id;
      const horse = t?.horseName;
      const rider = t?.riderName;

      if (ring != null) pushMapArr(tripsByRing, String(ring), t);
      if (gid != null) pushMapArr(tripsByGroup, String(gid), t);
      if (cid != null) pushMapArr(tripsByClass, String(cid), t);
      if (horse) pushMapArr(tripsByHorse, String(horse), t);
      if (rider) pushMapArr(tripsByRider, String(rider), t);
      if (cid != null && horse) pushMapArr(tripsByEntryKey, `${cid}|${horse}`, t);
    }

    // Schedule scaffold: Groups within Rings, Classes within Groups
    const rings = new Map(); // ring_number -> { ring_number, ringName, groups: Map(gkey->groupObj), startMsMin }
    for (const r of sched) {
      // schedule rows are class-level records
      const ringN = r?.ring_number;
      const ringName = r?.ringName;
      const gid = r?.class_group_id;
      const gname = r?.group_name;
      const cid = r?.class_id;
      const cname = r?.class_name;
      const cnum = r?.class_number;
      const latestStart = r?.latestStart;
      const latestStatus = r?.latestStatus;

      if (ringN == null || gid == null || cid == null) continue;

      const ringKey = String(ringN);
      if (!rings.has(ringKey)) {
        rings.set(ringKey, {
          ring_number: ringN,
          ringName: ringName || `Ring ${ringN}`,
          startMsMin: null,
          groups: new Map()
        });
      }
      const ringObj = rings.get(ringKey);

      const gKey = `${ringKey}|${gid}`;
      if (!ringObj.groups.has(gKey)) {
        ringObj.groups.set(gKey, {
          ring_number: ringN,
          ringName: ringObj.ringName,
          class_group_id: gid,
          group_name: gname || '(group)',
          latestStart: latestStart || null,
          latestStatus: latestStatus || null,
          startMsMin: dtTimeToEpochMs(r?.dt || state.meta.dt, latestStart),
          classes: new Map()
        });
      }
      const gObj = ringObj.groups.get(gKey);

      // keep earliest group start
      const gStart = dtTimeToEpochMs(r?.dt || state.meta.dt, latestStart);
      if (gStart != null) {
        if (gObj.startMsMin == null || gStart < gObj.startMsMin) gObj.startMsMin = gStart;
        if (ringObj.startMsMin == null || gStart < ringObj.startMsMin) ringObj.startMsMin = gStart;
      }

      const cKey = `${gid}|${cid}`;
      if (!gObj.classes.has(cKey)) {
        gObj.classes.set(cKey, {
          class_group_id: gid,
          class_id: cid,
          class_number: cnum,
          class_name: cname || '(class)',
          latestStart: latestStart || null,
          latestStatus: latestStatus || null,
          startMs: dtTimeToEpochMs(r?.dt || state.meta.dt, latestStart)
        });
      }
    }

    return {
      tripsByRing,
      tripsByGroup,
      tripsByClass,
      tripsByHorse,
      tripsByRider,
      tripsByEntryKey,
      rings
    };
  }

  function pushMapArr(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  // ---------------------------------------------------------------------------
  // UI BUILDERS (CSS unchanged; use existing classes; multi-line via inline styles)
  // ---------------------------------------------------------------------------

  function clearRoot() {
    screenRoot.innerHTML = '';
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function makePill(text) {
    const p = el('div', 'row-tag row-tag--count', String(text));
    return p;
  }

  function makeCard() {
    const c = el('div', 'row');
    // allow multi-line content while keeping exact CSS file unchanged
    c.style.display = 'block';
    c.style.padding = '12px 16px';
    return c;
  }

  function makeCardHeader(titleText, countText, onClick) {
    const hdr = el('div', null);
    hdr.style.display = 'flex';
    hdr.style.alignItems = 'center';
    hdr.style.justifyContent = 'space-between';
    hdr.style.gap = '10px';

    const t = el('div', 'row-title', titleText);
    t.style.fontWeight = '600';
    t.style.fontSize = '14px';

    hdr.appendChild(t);

    if (countText != null) hdr.appendChild(makePill(countText));

    if (onClick) {
      hdr.style.cursor = 'pointer';
      hdr.addEventListener('click', onClick);
    }

    return hdr;
  }

  function makeSubline(text, rightText, onClick) {
    const line = el('div', null);
    line.style.display = 'flex';
    line.style.alignItems = 'center';
    line.style.justifyContent = 'space-between';
    line.style.gap = '10px';
    line.style.marginTop = '8px';

    const left = el('div', null, text);
    left.style.fontSize = '12px';
    left.style.opacity = '0.92';

    line.appendChild(left);

    if (rightText != null) {
      const r = makePill(rightText);
      r.style.fontSize = '10px';
      line.appendChild(r);
    }

    if (onClick) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', onClick);
    }

    return line;
  }

  function makeDivider() {
    const d = el('div', null);
    d.style.height = '1px';
    d.style.background = 'rgba(75,85,99,.55)';
    d.style.marginTop = '10px';
    return d;
  }

  function makePeakRow(items, selectedSet, onToggle) {
    // reuse nav-row + nav-btn for horizontal scroll
    const wrap = el('div', 'nav-row');
    wrap.style.marginBottom = '10px';
    wrap.style.padding = '2px 0';

    items.forEach(it => {
      const btn = el('button', 'nav-btn', it.label);
      if (selectedSet.has(it.key)) btn.classList.add('nav-btn--primary');

      btn.addEventListener('click', () => onToggle(it.key));
      wrap.appendChild(btn);
    });

    return wrap;
  }

  function makeToggleRow() {
    const wrap = el('div', 'nav-row');
    wrap.style.marginBottom = '10px';
    wrap.style.padding = '2px 0';

    const btnScope = el('button', 'nav-btn', `Scope: ${state.ui.scopeMode}`);
    btnScope.classList.add('nav-btn--primary');
    btnScope.addEventListener('click', () => {
      state.ui.scopeMode = (state.ui.scopeMode === 'ACTIVE') ? 'FULL' : 'ACTIVE';
      render();
    });

    const btnStatus = el('button', 'nav-btn', `Status: ${state.ui.statusMode}`);
    btnStatus.addEventListener('click', () => {
      state.ui.statusMode = (state.ui.statusMode === 'ACTIVE') ? 'COMPLETED' : 'ACTIVE';
      render();
    });

    wrap.appendChild(btnScope);
    wrap.appendChild(btnStatus);

    return wrap;
  }

  // ---------------------------------------------------------------------------
  // NAV
  // ---------------------------------------------------------------------------

  function setScreen(screen, detail = null, push = true) {
    if (push) state.history.push({ screen: state.currentScreen, detail: state.detail, peak: new Set(state.selectedPeakKeys), ui: { ...state.ui } });
    state.currentScreen = screen;
    state.detail = detail;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) {
      state.currentScreen = 'horses';
      state.detail = null;
      state.selectedPeakKeys = new Set();
      render();
      return;
    }
    state.currentScreen = prev.screen;
    state.detail = prev.detail;
    state.selectedPeakKeys = prev.peak || new Set();
    state.ui = prev.ui || state.ui;
    render();
  }

  function resetPeak() {
    state.selectedPeakKeys = new Set();
  }

  function togglePeak(key) {
    if (state.selectedPeakKeys.has(key)) state.selectedPeakKeys.delete(key);
    else state.selectedPeakKeys.add(key);
    render();
  }

  // ---------------------------------------------------------------------------
  // SCREEN: HORSES (Active Horses selector + Horse ladder)
  // ---------------------------------------------------------------------------

  function renderHorses(idx) {
    clearRoot();

    // Peak row: active horses (acts as quick filter on this screen too)
    const horseNames = uniqueStrings(state.trips.map(t => t?.horseName).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const peakItems = horseNames.map(h => ({ key: h, label: h }));
    const peakSelected = state.selectedPeakKeys.size ? state.selectedPeakKeys : new Set(); // if none selected, show all

    screenRoot.appendChild(makeToggleRow());
    screenRoot.appendChild(makePeakRow(peakItems, state.selectedPeakKeys, togglePeak));

    // List: Horse overview cards
    const list = el('div', 'list-column');
    const visibleHorses = peakSelected.size ? horseNames.filter(h => peakSelected.has(h)) : horseNames;

    for (const horse of visibleHorses) {
      const allTrips = (idx.tripsByHorse.get(String(horse)) || []);
      const includedTrips = allTrips.filter(tripIsIncluded);

      // ACTIVE mode (scope) is the follow set; still show all horses in FULL mode
      if (state.ui.scopeMode === 'ACTIVE' && !isHorseActive(horse)) {
        // show but visually inactive + count 0? No — selector must still allow re-follow.
      }

      const card = makeCard();

      const followed = isHorseActive(horse);
      const title = `${followed ? '●' : '○'} ${horse}`;

      card.appendChild(makeCardHeader(title, includedTrips.length, () => {
        followed ? state.activeHorseNames.delete(horse) : state.activeHorseNames.add(horse);
        render();
      }));

      // Level B: Classes under horse
      const byClass = new Map();
      for (const t of includedTrips) {
        const cid = t?.class_id;
        if (cid == null) continue;
        const key = String(cid);
        if (!byClass.has(key)) byClass.set(key, []);
        byClass.get(key).push(t);
      }

      const classKeys = [...byClass.keys()].sort((a, b) => {
        const aa = byClass.get(a)[0];
        const bb = byClass.get(b)[0];
        const ta = dtTimeToEpochMs(aa?.dt || state.meta.dt, aa?.latestStart);
        const tb = dtTimeToEpochMs(bb?.dt || state.meta.dt, bb?.latestStart);
        if (ta != null && tb != null && ta !== tb) return ta - tb;
        return Number(a) - Number(b);
      });

      for (const ck of classKeys) {
        const sample = byClass.get(ck)[0];
        const label = `${sample?.latestStart || ''} • ${sample?.class_name || '(class)'} • ${sample?.ringName || ''}`;
        const count = byClass.get(ck).length;
        card.appendChild(makeSubline(label, count, () => {
          setScreen('horseDetail', { kind: 'horse', key: horse });
        }));
      }

      list.appendChild(card);
    }

    screenRoot.appendChild(list);
  }

  function renderHorseDetail(idx) {
    clearRoot();
    const horse = state.detail?.key;
    if (!horse) return;

    screenRoot.appendChild(makeToggleRow());

    const card = makeCard();
    const allTrips = (idx.tripsByHorse.get(String(horse)) || []);
    const includedTrips = allTrips.filter(tripIsIncluded);

    card.appendChild(makeCardHeader(horse, includedTrips.length));

    // Level B: trips (leaf)
    const sorted = includedTrips.slice().sort((a, b) => {
      const ta = dtTimeToEpochMs(a?.dt || state.meta.dt, a?.latestGO || a?.latestStart);
      const tb = dtTimeToEpochMs(b?.dt || state.meta.dt, b?.latestGO || b?.latestStart);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      const oa = (a?.lastOOG ?? 999999);
      const ob = (b?.lastOOG ?? 999999);
      return oa - ob;
    });

    for (const t of sorted) {
      const left = `${t.latestGO || t.latestStart || ''} • ${t.ringName || ''} • ${t.class_name || ''} • ${t.riderName || ''}`;
      const right = t.lastOOG != null ? `OOG ${t.lastOOG}` : (t.latestStatus || '');
      card.appendChild(makeSubline(left, right));
    }

    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // SCREEN: RINGS (Ring -> Group -> Class -> Entries/Trips)
  // ---------------------------------------------------------------------------

  function renderRings(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    const ringArr = [...idx.rings.values()].sort((a, b) => {
      // ringPriority not provided; fallback ring_number
      if (a.ring_number !== b.ring_number) return a.ring_number - b.ring_number;
      return String(a.ringName).localeCompare(String(b.ringName));
    });

    // Peak: rings
    const peakItems = ringArr.map(r => ({ key: String(r.ring_number), label: r.ringName }));
    screenRoot.appendChild(makePeakRow(peakItems, state.selectedPeakKeys, togglePeak));

    const list = el('div', 'list-column');

    const visibleRings = state.selectedPeakKeys.size
      ? ringArr.filter(r => state.selectedPeakKeys.has(String(r.ring_number)))
      : ringArr;

    for (const ring of visibleRings) {
      // Apply status gating at group/class/entry level; ring is included if any descendant survives when ACTIVE scope/status
      const groupsArr = [...ring.groups.values()].filter(g => schedulePassesStatusMode(g));
      const ringTripsAll = (idx.tripsByRing.get(String(ring.ring_number)) || []);
      const ringTripsIncluded = ringTripsAll.filter(tripIsIncluded);

      if (state.ui.scopeMode === 'ACTIVE' && ringTripsIncluded.length === 0) continue;
      if (state.ui.statusMode === 'ACTIVE' && ringTripsIncluded.length === 0 && groupsArr.length === 0) continue;

      const card = makeCard();
      const groupCount = groupsArr.length;

      card.appendChild(makeCardHeader(`${ring.ringName}`, groupCount, () => {
        setScreen('ringDetail', { kind: 'ring', key: String(ring.ring_number) });
      }));

      // Level B: group rollups
      const sortedGroups = groupsArr.slice().sort((a, b) => {
        const ta = a.startMsMin ?? 0;
        const tb = b.startMsMin ?? 0;
        if (ta && tb && ta !== tb) return ta - tb;
        return String(a.group_name).localeCompare(String(b.group_name));
      });

      for (const g of sortedGroups) {
        const gid = String(g.class_group_id);
        const gTrips = (idx.tripsByGroup.get(gid) || []).filter(tripIsIncluded);
        if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

        const status = g.latestStatus || '';
        const time = g.latestStart || '';
        const line = `${time} • ${g.group_name} ${status ? '• ' + status : ''}`;

        // count: active horses within group (distinct horseName)
        const horses = uniqueStrings(gTrips.map(t => t?.horseName).filter(Boolean));
        card.appendChild(makeSubline(line, horses.length, () => {
          setScreen('groupDetail', { kind: 'group', key: `${ring.ring_number}|${gid}` });
        }));

        // Level C: classes within group
        const clsArr = [...g.classes.values()].filter(c => schedulePassesStatusMode(c));
        const sortedClasses = clsArr.sort((a, b) => {
          const ta = a.startMs ?? 0;
          const tb = b.startMs ?? 0;
          if (ta && tb && ta !== tb) return ta - tb;
          return (a.class_number ?? 0) - (b.class_number ?? 0);
        });

        for (const c of sortedClasses) {
          const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIsIncluded);
          if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

          const horsesInClass = uniqueStrings(cTrips.map(t => t?.horseName).filter(Boolean));
          const line2 = `↳ ${c.class_name}`;
          card.appendChild(makeSubline(line2, horsesInClass.length, () => {
            setScreen('classDetail', { kind: 'class', key: String(c.class_id) });
          }));

          // Entries under class (by horse) — no slicing
          const byHorse = new Map();
          for (const t of cTrips) {
            const h = t?.horseName;
            if (!h) continue;
            if (!byHorse.has(h)) byHorse.set(h, []);
            byHorse.get(h).push(t);
          }

          const horsesSorted = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
          for (const h of horsesSorted) {
            const ts = byHorse.get(h);
            // choose best display values
            const sample = ts[0];
            const oog = sample?.lastOOG != null ? `OOG ${sample.lastOOG}` : '';
            const go = sample?.latestGO || '';
            const entryLine = `   • ${h}${oog ? ' • ' + oog : ''}${go ? ' • ' + go : ''}`;
            card.appendChild(makeSubline(entryLine, null, () => {
              setScreen('entryDetail', { kind: 'entry', key: `${c.class_id}|${h}`, extra: { horse: h, class_id: c.class_id } });
            }));
          }
        }

        card.appendChild(makeDivider());
      }

      list.appendChild(card);
    }

    screenRoot.appendChild(list);
  }

  function renderRingDetail(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    const ringKey = state.detail?.key;
    const ringObj = idx.rings.get(String(ringKey));
    if (!ringObj) return;

    const card = makeCard();
    const groupsArr = [...ringObj.groups.values()].filter(g => schedulePassesStatusMode(g));

    card.appendChild(makeCardHeader(`${ringObj.ringName}`, groupsArr.length));

    const sortedGroups = groupsArr.slice().sort((a, b) => (a.startMsMin ?? 0) - (b.startMsMin ?? 0));
    for (const g of sortedGroups) {
      const gid = String(g.class_group_id);
      const gTrips = (idx.tripsByGroup.get(gid) || []).filter(tripIsIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

      const horses = uniqueStrings(gTrips.map(t => t?.horseName).filter(Boolean));
      const line = `${g.latestStart || ''} • ${g.group_name}${g.latestStatus ? ' • ' + g.latestStatus : ''}`;
      card.appendChild(makeSubline(line, horses.length, () => {
        setScreen('groupDetail', { kind: 'group', key: `${ringObj.ring_number}|${gid}` });
      }));

      // classes
      const clsArr = [...g.classes.values()].filter(c => schedulePassesStatusMode(c));
      const sortedClasses = clsArr.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
      for (const c of sortedClasses) {
        const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIsIncluded);
        if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

        const horsesInClass = uniqueStrings(cTrips.map(t => t?.horseName).filter(Boolean));
        card.appendChild(makeSubline(`↳ ${c.class_name}`, horsesInClass.length, () => {
          setScreen('classDetail', { kind: 'class', key: String(c.class_id) });
        }));
      }

      card.appendChild(makeDivider());
    }

    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // SCREEN: CLASSES (Groups-first: Group -> Class -> Entries/Trips)
  // ---------------------------------------------------------------------------

  function listAllGroups(idx) {
    const all = [];
    for (const ring of idx.rings.values()) {
      for (const g of ring.groups.values()) {
        all.push(g);
      }
    }
    return all;
  }

  function renderClasses(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    // Peak: groups
    const groups = listAllGroups(idx).filter(g => schedulePassesStatusMode(g));
    groups.sort((a, b) => {
      const ta = a.startMsMin ?? 0;
      const tb = b.startMsMin ?? 0;
      if (ta && tb && ta !== tb) return ta - tb;
      return String(a.group_name).localeCompare(String(b.group_name));
    });

    const peakItems = groups.map(g => ({ key: String(g.class_group_id), label: g.group_name }));
    screenRoot.appendChild(makePeakRow(peakItems, state.selectedPeakKeys, togglePeak));

    const list = el('div', 'list-column');

    const visibleGroups = state.selectedPeakKeys.size
      ? groups.filter(g => state.selectedPeakKeys.has(String(g.class_group_id)))
      : groups;

    for (const g of visibleGroups) {
      const gid = String(g.class_group_id);
      const gTrips = (idx.tripsByGroup.get(gid) || []).filter(tripIsIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

      const card = makeCard();
      const horses = uniqueStrings(gTrips.map(t => t?.horseName).filter(Boolean));
      card.appendChild(makeCardHeader(`${g.latestStart || ''} • ${g.group_name}`, horses.length, () => {
        setScreen('groupDetail', { kind: 'groupOnly', key: gid });
      }));

      // Classes under group
      const clsArr = [...g.classes.values()].filter(c => schedulePassesStatusMode(c));
      const sortedClasses = clsArr.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

      for (const c of sortedClasses) {
        const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIsIncluded);
        if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

        const horsesInClass = uniqueStrings(cTrips.map(t => t?.horseName).filter(Boolean));
        card.appendChild(makeSubline(`${c.class_name}`, horsesInClass.length, () => {
          setScreen('classDetail', { kind: 'class', key: String(c.class_id) });
        }));

        // Entries under class (by horse)
        const byHorse = new Map();
        for (const t of cTrips) {
          const h = t?.horseName;
          if (!h) continue;
          if (!byHorse.has(h)) byHorse.set(h, []);
          byHorse.get(h).push(t);
        }
        const horsesSorted = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
        for (const h of horsesSorted) {
          const sample = byHorse.get(h)[0];
          const oog = sample?.lastOOG != null ? `OOG ${sample.lastOOG}` : '';
          const go = sample?.latestGO || '';
          const entryLine = `↳ ${h}${oog ? ' • ' + oog : ''}${go ? ' • ' + go : ''}`;
          card.appendChild(makeSubline(entryLine, null, () => {
            setScreen('entryDetail', { kind: 'entry', key: `${c.class_id}|${h}`, extra: { horse: h, class_id: c.class_id } });
          }));
        }
      }

      list.appendChild(card);
    }

    screenRoot.appendChild(list);
  }

  function renderGroupDetail(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    const rawKey = state.detail?.key;
    if (!rawKey) return;

    // key can be "ring|gid" or "gid"
    const gid = String(rawKey).includes('|') ? String(rawKey).split('|')[1] : String(rawKey);

    // find group object
    let gObj = null;
    for (const ring of idx.rings.values()) {
      for (const g of ring.groups.values()) {
        if (String(g.class_group_id) === gid) { gObj = g; break; }
      }
      if (gObj) break;
    }
    if (!gObj) return;

    const card = makeCard();
    const gTrips = (idx.tripsByGroup.get(gid) || []).filter(tripIsIncluded);
    const horses = uniqueStrings(gTrips.map(t => t?.horseName).filter(Boolean));

    card.appendChild(makeCardHeader(`${gObj.latestStart || ''} • ${gObj.group_name}`, horses.length));

    // Classes -> entries -> trips context
    const clsArr = [...gObj.classes.values()].filter(c => schedulePassesStatusMode(c));
    const sortedClasses = clsArr.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

    for (const c of sortedClasses) {
      const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIsIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

      const horsesInClass = uniqueStrings(cTrips.map(t => t?.horseName).filter(Boolean));
      card.appendChild(makeSubline(`${c.class_name}`, horsesInClass.length, () => {
        setScreen('classDetail', { kind: 'class', key: String(c.class_id) });
      }));

      const byHorse = new Map();
      for (const t of cTrips) {
        const h = t?.horseName;
        if (!h) continue;
        if (!byHorse.has(h)) byHorse.set(h, []);
        byHorse.get(h).push(t);
      }
      const horsesSorted = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
      for (const h of horsesSorted) {
        const ts = byHorse.get(h);
        // show each trip row (leaf) for this entry (no slicing)
        for (const t of ts) {
          const left = `↳ ${h} • ${t.riderName || ''}`;
          const right = t.latestGO || (t.lastOOG != null ? `OOG ${t.lastOOG}` : '');
          card.appendChild(makeSubline(left, right, () => {
            setScreen('entryDetail', { kind: 'entry', key: `${c.class_id}|${h}`, extra: { horse: h, class_id: c.class_id } });
          }));
        }
      }

      card.appendChild(makeDivider());
    }

    screenRoot.appendChild(card);
  }

  function renderClassDetail(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    const classId = state.detail?.key;
    if (!classId) return;

    const cTripsAll = (idx.tripsByClass.get(String(classId)) || []);
    const cTrips = cTripsAll.filter(tripIsIncluded);

    // find a sample schedule record for name/time
    const sample = cTripsAll[0] || null;
    const title = sample?.class_name ? sample.class_name : `Class ${classId}`;

    const card = makeCard();
    card.appendChild(makeCardHeader(title, cTrips.length));

    // Entries by horse
    const byHorse = new Map();
    for (const t of cTrips) {
      const h = t?.horseName;
      if (!h) continue;
      if (!byHorse.has(h)) byHorse.set(h, []);
      byHorse.get(h).push(t);
    }

    const horsesSorted = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
    for (const h of horsesSorted) {
      const ts = byHorse.get(h).slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));
      const first = ts[0];
      const right = first?.latestGO || (first?.lastOOG != null ? `OOG ${first.lastOOG}` : '');
      card.appendChild(makeSubline(`${h}`, right, () => {
        setScreen('entryDetail', { kind: 'entry', key: `${classId}|${h}`, extra: { horse: h, class_id: Number(classId) } });
      }));

      // trips under entry (leaf) — no slicing
      for (const t of ts) {
        const left = `↳ ${t.riderName || ''} • ${t.ringName || ''}`;
        const r = t.latestGO || (t.lastOOG != null ? `OOG ${t.lastOOG}` : '') || (t.latestStatus || '');
        card.appendChild(makeSubline(left, r));
      }

      card.appendChild(makeDivider());
    }

    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // SCREEN: RIDERS (trips-first, derived from watch_trips)
  // ---------------------------------------------------------------------------

  function renderRiders(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    // Peak: riders (derived from included trips)
    const allTrips = state.trips.filter(tripIsIncluded);
    const riderNames = uniqueStrings(allTrips.map(t => t?.riderName).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const peakItems = riderNames.map(r => ({ key: r, label: r }));
    screenRoot.appendChild(makePeakRow(peakItems, state.selectedPeakKeys, togglePeak));

    const list = el('div', 'list-column');
    const visibleRiders = state.selectedPeakKeys.size ? riderNames.filter(r => state.selectedPeakKeys.has(r)) : riderNames;

    for (const rider of visibleRiders) {
      const rTripsAll = (idx.tripsByRider.get(String(rider)) || []);
      const rTrips = rTripsAll.filter(tripIsIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && rTrips.length === 0) continue;

      const card = makeCard();
      card.appendChild(makeCardHeader(rider, rTrips.length, () => {
        setScreen('riderDetail', { kind: 'rider', key: rider });
      }));

      // rollup: classes/rings under rider
      const byClass = new Map();
      for (const t of rTrips) {
        const cid = t?.class_id;
        if (cid == null) continue;
        const k = String(cid);
        if (!byClass.has(k)) byClass.set(k, []);
        byClass.get(k).push(t);
      }

      const classKeys = [...byClass.keys()].sort((a, b) => {
        const aa = byClass.get(a)[0];
        const bb = byClass.get(b)[0];
        const ta = dtTimeToEpochMs(aa?.dt || state.meta.dt, aa?.latestStart);
        const tb = dtTimeToEpochMs(bb?.dt || state.meta.dt, bb?.latestStart);
        if (ta != null && tb != null && ta !== tb) return ta - tb;
        return Number(a) - Number(b);
      });

      for (const ck of classKeys) {
        const sample = byClass.get(ck)[0];
        const label = `${sample?.latestStart || ''} • ${sample?.class_name || ''} • ${sample?.ringName || ''}`;
        card.appendChild(makeSubline(label, byClass.get(ck).length));
      }

      list.appendChild(card);
    }

    screenRoot.appendChild(list);
  }

  function renderRiderDetail(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    const rider = state.detail?.key;
    if (!rider) return;

    const rTripsAll = (idx.tripsByRider.get(String(rider)) || []);
    const rTrips = rTripsAll.filter(tripIsIncluded).slice().sort((a, b) => {
      const ta = dtTimeToEpochMs(a?.dt || state.meta.dt, a?.latestGO || a?.latestStart);
      const tb = dtTimeToEpochMs(b?.dt || state.meta.dt, b?.latestGO || b?.latestStart);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      return (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999);
    });

    const card = makeCard();
    card.appendChild(makeCardHeader(rider, rTrips.length));

    for (const t of rTrips) {
      const left = `${t.latestGO || t.latestStart || ''} • ${t.ringName || ''} • ${t.class_name || ''} • ${t.horseName || ''}`;
      const right = t.lastOOG != null ? `OOG ${t.lastOOG}` : (t.latestStatus || '');
      card.appendChild(makeSubline(left, right, () => {
        if (t?.class_id != null && t?.horseName) {
          setScreen('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}`, extra: { horse: t.horseName, class_id: t.class_id } });
        }
      }));
    }

    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // SCREEN: ENTRY DETAIL (class_id + horseName)
  // ---------------------------------------------------------------------------

  function renderEntryDetail(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    const k = state.detail?.key;
    if (!k || !String(k).includes('|')) return;
    const [classId, horse] = String(k).split('|');

    const trips = (idx.tripsByEntryKey.get(`${classId}|${horse}`) || []).filter(tripIsIncluded);
    const title = `${horse} • ${trips[0]?.class_name || 'Class ' + classId}`;

    const card = makeCard();
    card.appendChild(makeCardHeader(title, trips.length));

    const sorted = trips.slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));
    for (const t of sorted) {
      const left = `${t.riderName || ''} • ${t.ringName || ''}`;
      const right = t.latestGO || (t.lastOOG != null ? `OOG ${t.lastOOG}` : '') || (t.latestStatus || '');
      card.appendChild(makeSubline(left, right));
    }

    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // SCREEN: SUMMARY (ring -> group -> class -> entries/trips flattened)
  // ---------------------------------------------------------------------------

  function renderSummary(idx) {
    clearRoot();
    screenRoot.appendChild(makeToggleRow());

    // Summary uses ring scaffolding but only included trips affect visibility in ACTIVE scope
    const ringArr = [...idx.rings.values()].sort((a, b) => a.ring_number - b.ring_number);

    const list = el('div', 'list-column');

    for (const ring of ringArr) {
      const ringTrips = (idx.tripsByRing.get(String(ring.ring_number)) || []).filter(tripIsIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && ringTrips.length === 0) continue;

      const card = makeCard();
      card.appendChild(makeCardHeader(`${ring.ringName}`, ringTrips.length, () => {
        setScreen('ringDetail', { kind: 'ring', key: String(ring.ring_number) });
      }));

      // group rollups
      const groupsArr = [...ring.groups.values()].filter(g => schedulePassesStatusMode(g));
      groupsArr.sort((a, b) => (a.startMsMin ?? 0) - (b.startMsMin ?? 0));

      for (const g of groupsArr) {
        const gid = String(g.class_group_id);
        const gTrips = (idx.tripsByGroup.get(gid) || []).filter(tripIsIncluded);
        if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

        const line = `${g.latestStart || ''} • ${g.group_name}${g.latestStatus ? ' • ' + g.latestStatus : ''}`;
        card.appendChild(makeSubline(line, gTrips.length, () => {
          setScreen('groupDetail', { kind: 'group', key: `${ring.ring_number}|${gid}` });
        }));

        // classes under group
        const clsArr = [...g.classes.values()].filter(c => schedulePassesStatusMode(c));
        clsArr.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

        for (const c of clsArr) {
          const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIsIncluded);
          if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

          const horses = uniqueStrings(cTrips.map(t => t?.horseName).filter(Boolean));
          card.appendChild(makeSubline(`↳ ${c.class_name}`, horses.length, () => {
            setScreen('classDetail', { kind: 'class', key: String(c.class_id) });
          }));

          // entries list under class (horse + go)
          const byHorse = new Map();
          for (const t of cTrips) {
            const h = t?.horseName;
            if (!h) continue;
            if (!byHorse.has(h)) byHorse.set(h, []);
            byHorse.get(h).push(t);
          }
          const horsesSorted = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
          for (const h of horsesSorted) {
            const sample = byHorse.get(h)[0];
            const go = sample?.latestGO || '';
            const oog = sample?.lastOOG != null ? `OOG ${sample.lastOOG}` : '';
            const entryLine = `   • ${h}${oog ? ' • ' + oog : ''}${go ? ' • ' + go : ''}`;
            card.appendChild(makeSubline(entryLine, null, () => {
              setScreen('entryDetail', { kind: 'entry', key: `${c.class_id}|${h}`, extra: { horse: h, class_id: c.class_id } });
            }));
          }
        }

        card.appendChild(makeDivider());
      }

      list.appendChild(card);
    }

    screenRoot.appendChild(list);
  }

  // ---------------------------------------------------------------------------
  // RENDER DISPATCH
  // ---------------------------------------------------------------------------

  function render() {
    if (!screenRoot || !headerTitle) return;

    const idx = indexData();

    // Header title
    const titleMap = {
      horses: 'Active Horses',
      rings: 'Rings',
      classes: 'Classes',
      riders: 'Riders',
      summary: 'Summary',
      ringDetail: 'Ring',
      groupDetail: 'Group',
      classDetail: 'Class',
      horseDetail: 'Horse',
      riderDetail: 'Rider',
      entryDetail: 'Entry'
    };
    headerTitle.textContent = titleMap[state.currentScreen] || state.currentScreen;

    // Back button visibility
    if (headerBack) {
      headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
    }

    // Render
    if (state.currentScreen === 'horses') return renderHorses(idx);
    if (state.currentScreen === 'horseDetail') return renderHorseDetail(idx);

    if (state.currentScreen === 'rings') return renderRings(idx);
    if (state.currentScreen === 'ringDetail') return renderRingDetail(idx);

    if (state.currentScreen === 'classes') return renderClasses(idx);
    if (state.currentScreen === 'groupDetail') return renderGroupDetail(idx);
    if (state.currentScreen === 'classDetail') return renderClassDetail(idx);

    if (state.currentScreen === 'riders') return renderRiders(idx);
    if (state.currentScreen === 'riderDetail') return renderRiderDetail(idx);

    if (state.currentScreen === 'entryDetail') return renderEntryDetail(idx);

    if (state.currentScreen === 'summary') return renderSummary(idx);

    // fallback
    clearRoot();
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  if (headerBack) headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', e => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const next = btn.dataset.screen;

      // Switching primary screens resets peak selection (per-template)
      if (next !== state.currentScreen) {
        resetPeak();
      }

      state.currentScreen = next;
      state.detail = null;
      // do not push nav-to-nav into history
      state.history = [];
      render();
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------

  loadAll();
})();
