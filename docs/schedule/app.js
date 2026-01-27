// app.js — CRT Daily Show App (Option B: cards + legacy nav + session start)
// In-memory only • refresh reloads JSON • trips are truth, schedule is scaffold

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
  // DOM
  // ---------------------------------------------------------------------------
  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  const state = {
    sessionStarted: false,

    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    ui: {
      scopeMode: 'ACTIVE',   // ACTIVE (followed only) | FULL (show all)
      statusMode: 'ACTIVE',  // ACTIVE (hide Completed) | COMPLETED (show all)
    },

    followedHorses: new Set(),
    horseSearch: '',

    // Peak must be separate from toggles and per-screen
    peakByScreen: new Map(), // screen -> Set(keys)

    // nav
    currentScreen: 'start',
    history: [],
    detail: null,            // { kind, key }
    timerId: null
  };

  // ---------------------------------------------------------------------------
  // UTILS
  // ---------------------------------------------------------------------------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clearRoot() {
    screenRoot.innerHTML = '';
  }

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

  function getPeakSet(screen) {
    if (!state.peakByScreen.has(screen)) state.peakByScreen.set(screen, new Set());
    return state.peakByScreen.get(screen);
  }

  function resetPeak(screen) {
    state.peakByScreen.set(screen, new Set());
  }

  function togglePeak(screen, key) {
    const s = getPeakSet(screen);
    if (s.has(key)) s.delete(key);
    else s.add(key);
  }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title;
  }

  function setBackVisible(isVisible) {
    if (!headerBack) return;
    headerBack.style.visibility = isVisible ? 'visible' : 'hidden';
  }

  function setRefreshVisible(isVisible) {
    if (!headerAction) return;
    headerAction.hidden = !isVisible;
  }

  // ---------------------------------------------------------------------------
  // DATA LOAD
  // ---------------------------------------------------------------------------
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.json();
  }

  async function loadAll() {
    if (!state.sessionStarted) return;

    try {
      const [sched, trips] = await Promise.all([
        fetchJson(DATA_SCHEDULE_URL),
        fetchJson(DATA_TRIPS_URL),
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

      // Seed followed horses once
      if (state.followedHorses.size === 0) {
        const horses = uniqueStrings(state.trips.map(t => t?.horseName).filter(Boolean)).sort((a, b) => a.localeCompare(b));
        for (const h of horses) state.followedHorses.add(h);
      }
    } catch (_) {
      // silent
    }

    render();
  }

  function startTimer() {
    if (state.timerId) return;
    state.timerId = setInterval(loadAll, REFRESH_MS);
  }

  // ---------------------------------------------------------------------------
  // GATING (toggles)
  // ---------------------------------------------------------------------------
  function isHorseFollowed(horseName) {
    return state.followedHorses.has(String(horseName));
  }

  function passesStatusMode(latestStatus) {
    if (state.ui.statusMode === 'COMPLETED') return true;
    return String(latestStatus || '') !== STATUS_COMPLETED;
  }

  function tripIncluded(t) {
    if (!t) return false;

    if (state.ui.scopeMode === 'ACTIVE') {
      const h = t?.horseName;
      if (!h || !isHorseFollowed(h)) return false;
    }

    if (!passesStatusMode(t?.latestStatus)) return false;
    return true;
  }

  function scheduleIncluded(r) {
    if (!r) return false;
    if (!passesStatusMode(r?.latestStatus)) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // INDEXES (rebuild per render; can optimize later)
  // ---------------------------------------------------------------------------
  function indexData() {
    const trips = state.trips || [];
    const sched = state.schedule || [];

    const tripsByRing = new Map();   // ring_number -> trips[]
    const tripsByGroup = new Map();  // class_group_id -> trips[]
    const tripsByClass = new Map();  // class_id -> trips[]
    const tripsByHorse = new Map();  // horseName -> trips[]
    const tripsByRider = new Map();  // riderName -> trips[]
    const tripsByEntry = new Map();  // class_id|horseName -> trips[]

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
      if (cid != null && horse) pushMapArr(tripsByEntry, `${cid}|${horse}`, t);
    }

    // Scaffold: Rings -> Groups -> Classes
    const rings = new Map(); // ring_number -> { ring_number, ringName, groups: Map(gid -> groupObj) }
    for (const r of sched) {
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
          groups: new Map()
        });
      }
      const ringObj = rings.get(ringKey);

      const gidKey = String(gid);
      if (!ringObj.groups.has(gidKey)) {
        ringObj.groups.set(gidKey, {
          class_group_id: gid,
          group_name: gname || '(group)',
          latestStart: latestStart || '',
          latestStatus: latestStatus || '',
          classes: new Map()
        });
      }
      const gObj = ringObj.groups.get(gidKey);

      const cidKey = String(cid);
      if (!gObj.classes.has(cidKey)) {
        gObj.classes.set(cidKey, {
          class_id: cid,
          class_number: cnum,
          class_name: cname || '(class)',
          latestStart: latestStart || '',
          latestStatus: latestStatus || ''
        });
      }
    }

    return {
      tripsByRing,
      tripsByGroup,
      tripsByClass,
      tripsByHorse,
      tripsByRider,
      tripsByEntry,
      rings
    };
  }

  // ---------------------------------------------------------------------------
  // LEGACY UI CONTRACTS
  // ---------------------------------------------------------------------------
  function makeRowTag(text, variant) {
    const cls = ['row-tag'];
    if (variant) cls.push(variant);
    return el('span', cls.join(' '), String(text));
  }

  function makeCard(titleText, tagNodeOrNull, isActive, onTap) {
    const card = el('div', 'card');
    if (onTap) card.classList.add('card--tap');
    if (isActive) card.classList.add('card--active');

    const header = el('div', 'card-header');

    const title = el('div', 'card-title', titleText);
    header.appendChild(title);

    if (tagNodeOrNull) header.appendChild(tagNodeOrNull);

    if (onTap) header.addEventListener('click', onTap);

    card.appendChild(header);
    return card;
  }

  function cardLinesWrap() {
    return el('div', 'card-lines');
  }

  function makeCardLine(textLeft, tagNodeOrNull, onTap) {
    const line = el('div', 'card-line');
    if (onTap) line.classList.add('row--tap'); // reuse legacy tap feel
    const txt = el('div', 'card-line-text', textLeft);
    line.appendChild(txt);
    if (tagNodeOrNull) line.appendChild(tagNodeOrNull);
    if (onTap) line.addEventListener('click', onTap);
    return line;
  }

  function makeDivider() {
    return el('div', 'card-divider');
  }

  function makeStateSearchInput(value, onInput) {
    const wrap = el('div', 'state-search');
    const input = document.createElement('input');
    input.className = 'state-search-input';
    input.type = 'search';
    input.placeholder = 'Search horses...';
    input.value = value || '';
    input.addEventListener('input', () => onInput(String(input.value || '')));
    wrap.appendChild(input);
    return wrap;
  }

  // Toggle bar: two pill buttons only; no “Scope:” / “Status:” labels.
  // Primary indicates the ACTIVE gating is ON (otherwise off).
  function makeToggleBar() {
    const scroller = el('div', 'nav-scroller');
    const row = el('div', 'nav-row');

    // Scope: ACTIVE (primary) vs FULL (not primary)
    const bScope = el('button', 'nav-btn', state.ui.scopeMode);
    if (state.ui.scopeMode === 'ACTIVE') bScope.classList.add('nav-btn--primary');
    bScope.type = 'button';
    bScope.addEventListener('click', () => {
      state.ui.scopeMode = (state.ui.scopeMode === 'ACTIVE') ? 'FULL' : 'ACTIVE';
      render();
    });

    // Status: ACTIVE (primary) vs COMPLETED (not primary)
    const bStatus = el('button', 'nav-btn', state.ui.statusMode);
    if (state.ui.statusMode === 'ACTIVE') bStatus.classList.add('nav-btn--primary');
    bStatus.type = 'button';
    bStatus.addEventListener('click', () => {
      state.ui.statusMode = (state.ui.statusMode === 'ACTIVE') ? 'COMPLETED' : 'ACTIVE';
      render();
    });

    row.appendChild(bScope);
    row.appendChild(bStatus);
    scroller.appendChild(row);
    return scroller;
  }

  // Peak bar: separate area + separate state + separate handlers.
  function makePeakBar(screen, items) {
    const selected = getPeakSet(screen);

    const scroller = el('div', 'nav-scroller');
    const row = el('div', 'nav-row');

    for (const it of items) {
      const btn = el('button', 'nav-btn', it.label);
      btn.type = 'button';
      if (selected.has(it.key)) btn.classList.add('nav-btn--primary');

      btn.addEventListener('click', () => {
        togglePeak(screen, it.key);
        render();
      });

      row.appendChild(btn);
    }

    scroller.appendChild(row);
    return scroller;
  }

  // ---------------------------------------------------------------------------
  // NAV + ACTIVE BUTTON STATE
  // ---------------------------------------------------------------------------
  function setScreen(screen, detail, pushHistory) {
    if (pushHistory) {
      state.history.push({ screen: state.currentScreen, detail: state.detail });
    }
    state.currentScreen = screen;
    state.detail = detail || null;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) {
      setScreen('horses', null, false);
      return;
    }
    state.currentScreen = prev.screen;
    state.detail = prev.detail || null;
    render();
  }

  function setNavActive(screen) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('[data-screen]');
    btns.forEach(b => {
      const isActive = b.getAttribute('data-screen') === screen;
      b.classList.toggle('nav-btn--primary', isActive);
    });
  }

  function setNavAgg(key, value, positive) {
    if (!navRow) return;
    const elAgg = navRow.querySelector(`[data-nav-agg="${key}"]`);
    if (!elAgg) return;
    elAgg.textContent = String(value);
    elAgg.classList.toggle('nav-agg--positive', !!positive);
  }

  // ---------------------------------------------------------------------------
  // RENDER — START
  // ---------------------------------------------------------------------------
  function renderStart() {
    clearRoot();
    setHeader('Start');
    setBackVisible(false);
    setRefreshVisible(false);
    setNavActive('start');

    const logo = el('div', 'start-logo');
    logo.appendChild(el('div', 'start-logo-title', 'CRT Daily Show'));
    logo.appendChild(el('div', 'start-logo-subtitle',
      'Start session loads today’s schedule + trips and refreshes every 8 minutes.'
    ));
    screenRoot.appendChild(logo);

    const startBtn = el('div', 'row row--tap', null);
    startBtn.appendChild(el('div', 'row-title', 'Start Session'));
    startBtn.appendChild(makeRowTag('GO', 'row-tag--positive'));

    startBtn.addEventListener('click', () => {
      state.sessionStarted = true;
      setRefreshVisible(true);
      startTimer();
      setScreen('horses', null, false);
      loadAll();
    });

    screenRoot.appendChild(startBtn);
  }

  // ---------------------------------------------------------------------------
  // RENDER — HORSES
  // ---------------------------------------------------------------------------
  function renderHorses(idx) {
    clearRoot();
    setHeader('Active Horses');
    setBackVisible(state.history.length > 0);
    setRefreshVisible(true);
    setNavActive('horses');

    screenRoot.appendChild(makeToggleBar());
    screenRoot.appendChild(makeStateSearchInput(state.horseSearch, (v) => {
      state.horseSearch = v;
      render();
    }));

    const allHorses = uniqueStrings(state.trips.map(t => t?.horseName).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const query = String(state.horseSearch || '').trim().toLowerCase();
    const horses = query ? allHorses.filter(h => h.toLowerCase().includes(query)) : allHorses;

    // Update nav agg: followed horses
    setNavAgg('horses', state.followedHorses.size, state.followedHorses.size > 0);

    for (const horse of horses) {
      const tripsAll = idx.tripsByHorse.get(String(horse)) || [];
      const tripsIncluded = tripsAll.filter(tripIncluded);
      const followed = isHorseFollowed(horse);

      const tag = makeRowTag(tripsIncluded.length, 'row-tag--count');
      const card = makeCard(horse, tag, followed, () => {
        if (followed) state.followedHorses.delete(horse);
        else state.followedHorses.add(horse);
        render();
      });

      // Lines: show up to 4 upcoming-ish items (still full detail is on detail screen)
      const lines = cardLinesWrap();
      const sample = tripsIncluded
        .slice()
        .sort((a, b) => (a.calc_seconds ?? 999999999) - (b.calc_seconds ?? 999999999))
        .slice(0, 4);

      for (const t of sample) {
        const left = `${t.latestGO || t.latestStart || ''} • ${t.ringName || ''} • ${t.class_name || ''}`;
        const right = (t.lastOOG != null) ? `OOG ${t.lastOOG}` : (t.latestStatus || '');
        lines.appendChild(makeCardLine(left, right ? makeRowTag(right, 'row-tag--count') : null, () => {
          setScreen('horseDetail', { kind: 'horse', key: horse }, true);
        }));
      }

      if (sample.length) card.appendChild(lines);

      screenRoot.appendChild(card);
    }
  }

  function renderHorseDetail(idx) {
    clearRoot();
    const horse = state.detail?.key;
    setHeader(horse || 'Horse');
    setBackVisible(true);
    setRefreshVisible(true);

    screenRoot.appendChild(makeToggleBar());

    const tripsAll = idx.tripsByHorse.get(String(horse)) || [];
    const trips = tripsAll.filter(tripIncluded).slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));

    const tag = makeRowTag(trips.length, 'row-tag--count');
    const card = makeCard(horse, tag, isHorseFollowed(horse), () => {
      const followed = isHorseFollowed(horse);
      if (followed) state.followedHorses.delete(horse);
      else state.followedHorses.add(horse);
      render();
    });

    const lines = cardLinesWrap();
    for (const t of trips) {
      const left = `${t.latestGO || t.latestStart || ''} • ${t.ringName || ''} • ${t.class_name || ''} • ${t.riderName || ''}`;
      const right = (t.lastOOG != null) ? `OOG ${t.lastOOG}` : (t.latestStatus || '');
      lines.appendChild(makeCardLine(left, right ? makeRowTag(right, 'row-tag--count') : null, () => {
        if (t?.class_id != null && t?.horseName) {
          setScreen('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}` }, true);
        }
      }));
    }
    card.appendChild(lines);
    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // RENDER — RINGS
  // ---------------------------------------------------------------------------
  function renderRings(idx) {
    clearRoot();
    setHeader('Rings');
    setBackVisible(state.history.length > 0);
    setRefreshVisible(true);
    setNavActive('rings');

    screenRoot.appendChild(makeToggleBar());

    const ringArr = [...idx.rings.values()].sort((a, b) => a.ring_number - b.ring_number);
    const peakItems = ringArr.map(r => ({ key: String(r.ring_number), label: r.ringName }));
    screenRoot.appendChild(makePeakBar('rings', peakItems));

    const peak = getPeakSet('rings');
    const visible = peak.size ? ringArr.filter(r => peak.has(String(r.ring_number))) : ringArr;

    let visibleCount = 0;

    for (const ring of visible) {
      const ringTrips = (idx.tripsByRing.get(String(ring.ring_number)) || []).filter(tripIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && ringTrips.length === 0) continue;

      // ring shown
      visibleCount += 1;

      const tag = makeRowTag(ringTrips.length, 'row-tag--count');
      const card = makeCard(ring.ringName, tag, false, () => {
        setScreen('ringDetail', { kind: 'ring', key: String(ring.ring_number) }, true);
      });

      const lines = cardLinesWrap();
      const groups = [...ring.groups.values()].filter(scheduleIncluded);

      // show up to 4 groups as lines
      const showGroups = groups.slice(0, 4);
      for (const g of showGroups) {
        const gTrips = (idx.tripsByGroup.get(String(g.class_group_id)) || []).filter(tripIncluded);
        if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

        const left = `${g.latestStart || ''} • ${g.group_name}${g.latestStatus ? ' • ' + g.latestStatus : ''}`;
        const right = uniqueStrings(gTrips.map(t => t?.horseName).filter(Boolean)).length;
        lines.appendChild(makeCardLine(left, makeRowTag(right, 'row-tag--count'), () => {
          setScreen('groupDetail', { kind: 'group', key: String(g.class_group_id) }, true);
        }));
      }

      if (lines.childNodes.length) card.appendChild(lines);
      screenRoot.appendChild(card);
    }

    setNavAgg('rings', visibleCount, visibleCount > 0);
  }

  function renderRingDetail(idx) {
    clearRoot();
    const ringKey = state.detail?.key;
    const ringObj = idx.rings.get(String(ringKey));
    setHeader(ringObj?.ringName || 'Ring');
    setBackVisible(true);
    setRefreshVisible(true);

    screenRoot.appendChild(makeToggleBar());

    if (!ringObj) return;

    const groups = [...ringObj.groups.values()].filter(scheduleIncluded);
    const card = makeCard(ringObj.ringName, makeRowTag(groups.length, 'row-tag--count'), false, null);

    const lines = cardLinesWrap();

    for (const g of groups) {
      const gTrips = (idx.tripsByGroup.get(String(g.class_group_id)) || []).filter(tripIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

      const left = `${g.latestStart || ''} • ${g.group_name}${g.latestStatus ? ' • ' + g.latestStatus : ''}`;
      const right = uniqueStrings(gTrips.map(t => t?.horseName).filter(Boolean)).length;

      lines.appendChild(makeCardLine(left, makeRowTag(right, 'row-tag--count'), () => {
        setScreen('groupDetail', { kind: 'group', key: String(g.class_group_id) }, true);
      }));
    }

    card.appendChild(lines);
    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // RENDER — CLASSES (groups-first)
  // ---------------------------------------------------------------------------
  function allGroups(idx) {
    const out = [];
    for (const ring of idx.rings.values()) {
      for (const g of ring.groups.values()) out.push(g);
    }
    return out;
  }

  function renderClasses(idx) {
    clearRoot();
    setHeader('Classes');
    setBackVisible(state.history.length > 0);
    setRefreshVisible(true);
    setNavActive('classes');

    screenRoot.appendChild(makeToggleBar());

    const groups = allGroups(idx).filter(scheduleIncluded);
    groups.sort((a, b) => String(a.group_name).localeCompare(String(b.group_name)));

    const peakItems = groups.map(g => ({ key: String(g.class_group_id), label: g.group_name }));
    screenRoot.appendChild(makePeakBar('classes', peakItems));

    const peak = getPeakSet('classes');
    const visible = peak.size ? groups.filter(g => peak.has(String(g.class_group_id))) : groups;

    let visibleCount = 0;

    for (const g of visible) {
      const gTrips = (idx.tripsByGroup.get(String(g.class_group_id)) || []).filter(tripIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && gTrips.length === 0) continue;

      visibleCount += 1;

      const horses = uniqueStrings(gTrips.map(t => t?.horseName).filter(Boolean));
      const tag = makeRowTag(horses.length, 'row-tag--count');

      const card = makeCard(
        `${g.latestStart || ''} • ${g.group_name}`,
        tag,
        false,
        () => setScreen('groupDetail', { kind: 'group', key: String(g.class_group_id) }, true)
      );

      // show up to 4 classes
      const cls = [...(g.classes?.values?.() || [])].filter(scheduleIncluded);
      const lines = cardLinesWrap();
      for (const c of cls.slice(0, 4)) {
        const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIncluded);
        if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;
        const right = uniqueStrings(cTrips.map(t => t?.horseName).filter(Boolean)).length;
        lines.appendChild(makeCardLine(c.class_name, makeRowTag(right, 'row-tag--count'), () => {
          setScreen('classDetail', { kind: 'class', key: String(c.class_id) }, true);
        }));
      }
      if (lines.childNodes.length) card.appendChild(lines);

      screenRoot.appendChild(card);
    }

    setNavAgg('classes', visibleCount, visibleCount > 0);
  }

  function renderGroupDetail(idx) {
    clearRoot();
    setHeader('Group');
    setBackVisible(true);
    setRefreshVisible(true);

    screenRoot.appendChild(makeToggleBar());

    const gid = state.detail?.key;
    if (!gid) return;

    // locate group + ring name
    let found = null;
    let ringName = '';
    for (const ring of idx.rings.values()) {
      if (ring.groups.has(String(gid))) {
        found = ring.groups.get(String(gid));
        ringName = ring.ringName;
        break;
      }
    }
    if (!found) return;

    setHeader(found.group_name);

    const cls = [...(found.classes?.values?.() || [])].filter(scheduleIncluded);
    const card = makeCard(`${ringName} • ${found.group_name}`, makeRowTag(cls.length, 'row-tag--count'), false, null);

    const lines = cardLinesWrap();
    for (const c of cls) {
      const cTrips = (idx.tripsByClass.get(String(c.class_id)) || []).filter(tripIncluded);
      if (state.ui.scopeMode === 'ACTIVE' && cTrips.length === 0) continue;

      const right = uniqueStrings(cTrips.map(t => t?.horseName).filter(Boolean)).length;
      lines.appendChild(makeCardLine(`${c.latestStart || ''} • ${c.class_name}`, makeRowTag(right, 'row-tag--count'), () => {
        setScreen('classDetail', { kind: 'class', key: String(c.class_id) }, true);
      }));
    }
    card.appendChild(lines);
    screenRoot.appendChild(card);
  }

  function renderClassDetail(idx) {
    clearRoot();
    setBackVisible(true);
    setRefreshVisible(true);

    screenRoot.appendChild(makeToggleBar());

    const classId = state.detail?.key;
    if (!classId) return;

    const tripsAll = (idx.tripsByClass.get(String(classId)) || []);
    const trips = tripsAll.filter(tripIncluded);

    const title = tripsAll[0]?.class_name || `Class ${classId}`;
    setHeader(title);

    const card = makeCard(title, makeRowTag(trips.length, 'row-tag--count'), false, null);

    // entries by horse
    const byHorse = new Map();
    for (const t of trips) {
      const h = t?.horseName;
      if (!h) continue;
      if (!byHorse.has(h)) byHorse.set(h, []);
      byHorse.get(h).push(t);
    }

    const horses = [...byHorse.keys()].sort((a, b) => a.localeCompare(b));
    const lines = cardLinesWrap();

    for (const h of horses) {
      const ts = byHorse.get(h).slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));
      const first = ts[0];
      const rightText = first?.latestGO || ((first?.lastOOG != null) ? `OOG ${first.lastOOG}` : '');
      const right = rightText ? makeRowTag(rightText, 'row-tag--count') : null;

      lines.appendChild(makeCardLine(h, right, () => {
        setScreen('entryDetail', { kind: 'entry', key: `${classId}|${h}` }, true);
      }));
    }

    card.appendChild(lines);
    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // RENDER — RIDERS
  // ---------------------------------------------------------------------------
  function renderRiders(idx) {
    clearRoot();
    setHeader('Riders');
    setBackVisible(state.history.length > 0);
    setRefreshVisible(true);
    setNavActive('riders');

    screenRoot.appendChild(makeToggleBar());

    const includedTrips = state.trips.filter(tripIncluded);
    const riderNames = uniqueStrings(includedTrips.map(t => t?.riderName).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    const peakItems = riderNames.map(r => ({ key: r, label: r }));
    screenRoot.appendChild(makePeakBar('riders', peakItems));

    const peak = getPeakSet('riders');
    const visible = peak.size ? riderNames.filter(r => peak.has(r)) : riderNames;

    setNavAgg('riders', visible.length, visible.length > 0);

    for (const rider of visible) {
      const tripsAll = (idx.tripsByRider.get(String(rider)) || []);
      const trips = tripsAll.filter(tripIncluded);

      const tag = makeRowTag(trips.length, 'row-tag--count');
      const card = makeCard(rider, tag, false, () => {
        setScreen('riderDetail', { kind: 'rider', key: rider }, true);
      });

      const lines = cardLinesWrap();
      const sample = trips.slice().sort((a, b) => (a.calc_seconds ?? 999999999) - (b.calc_seconds ?? 999999999)).slice(0, 4);

      for (const t of sample) {
        const left = `${t.latestGO || t.latestStart || ''} • ${t.ringName || ''} • ${t.class_name || ''} • ${t.horseName || ''}`;
        const right = (t.lastOOG != null) ? `OOG ${t.lastOOG}` : (t.latestStatus || '');
        lines.appendChild(makeCardLine(left, right ? makeRowTag(right, 'row-tag--count') : null, () => {
          if (t?.class_id != null && t?.horseName) {
            setScreen('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}` }, true);
          }
        }));
      }

      if (lines.childNodes.length) card.appendChild(lines);
      screenRoot.appendChild(card);
    }
  }

  function renderRiderDetail(idx) {
    clearRoot();
    const rider = state.detail?.key;
    setHeader(rider || 'Rider');
    setBackVisible(true);
    setRefreshVisible(true);

    screenRoot.appendChild(makeToggleBar());

    const tripsAll = idx.tripsByRider.get(String(rider)) || [];
    const trips = tripsAll.filter(tripIncluded).slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));

    const card = makeCard(rider, makeRowTag(trips.length, 'row-tag--count'), false, null);
    const lines = cardLinesWrap();

    for (const t of trips) {
      const left = `${t.latestGO || t.latestStart || ''} • ${t.ringName || ''} • ${t.class_name || ''} • ${t.horseName || ''}`;
      const right = (t.lastOOG != null) ? `OOG ${t.lastOOG}` : (t.latestStatus || '');
      lines.appendChild(makeCardLine(left, right ? makeRowTag(right, 'row-tag--count') : null, () => {
        if (t?.class_id != null && t?.horseName) {
          setScreen('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}` }, true);
        }
      }));
    }

    card.appendChild(lines);
    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // RENDER — ENTRY DETAIL
  // ---------------------------------------------------------------------------
  function renderEntryDetail(idx) {
    clearRoot();
    setBackVisible(true);
    setRefreshVisible(true);

    screenRoot.appendChild(makeToggleBar());

    const k = state.detail?.key;
    if (!k || !String(k).includes('|')) return;

    const [classId, horse] = String(k).split('|');
    const trips = (idx.tripsByEntry.get(`${classId}|${horse}`) || []).filter(tripIncluded).slice().sort((a, b) => (a.lastOOG ?? 999999) - (b.lastOOG ?? 999999));

    const title = `${horse} • ${trips[0]?.class_name || ('Class ' + classId)}`;
    setHeader(title);

    const card = makeCard(title, makeRowTag(trips.length, 'row-tag--count'), isHorseFollowed(horse), () => {
      const followed = isHorseFollowed(horse);
      if (followed) state.followedHorses.delete(horse);
      else state.followedHorses.add(horse);
      render();
    });

    const lines = cardLinesWrap();
    for (const t of trips) {
      const left = `${t.riderName || ''} • ${t.ringName || ''}`;
      const right = t.latestGO || ((t.lastOOG != null) ? `OOG ${t.lastOOG}` : (t.latestStatus || ''));
      lines.appendChild(makeCardLine(left, right ? makeRowTag(right, 'row-tag--count') : null, null));
    }

    card.appendChild(lines);
    screenRoot.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // RENDER — SUMMARY
  // ---------------------------------------------------------------------------
  function renderSummary(idx) {
    clearRoot();
    setHeader('Summary');
    setBackVisible(state.history.length > 0);
    setRefreshVisible(true);
    setNavActive('summary');

    screenRoot.appendChild(makeToggleBar());

    const trips = state.trips.filter(tripIncluded).slice().sort((a, b) => {
      if ((a.ring_number ?? 0) !== (b.ring_number ?? 0)) return (a.ring_number ?? 0) - (b.ring_number ?? 0);
      return (a.calc_seconds ?? 999999999) - (b.calc_seconds ?? 999999999);
    });

    setNavAgg('summary', trips.length, trips.length > 0);

    // group by ringName
    const byRing = new Map();
    for (const t of trips) {
      const key = t?.ringName || (t?.ring_number != null ? `Ring ${t.ring_number}` : 'Ring');
      if (!byRing.has(key)) byRing.set(key, []);
      byRing.get(key).push(t);
    }

    const ringKeys = [...byRing.keys()].sort((a, b) => a.localeCompare(b));

    for (const rk of ringKeys) {
      const ringTrips = byRing.get(rk);

      const card = makeCard(rk, makeRowTag(ringTrips.length, 'row-tag--count'), false, () => {
        // best-effort: if we can map back to ring_number, go there
        const sample = ringTrips[0];
        if (sample?.ring_number != null) setScreen('ringDetail', { kind: 'ring', key: String(sample.ring_number) }, true);
      });

      const lines = cardLinesWrap();
      for (const t of ringTrips.slice(0, 12)) {
        const left = `${t.latestGO || t.latestStart || ''} • ${t.class_name || ''} • ${t.horseName || ''}`;
        const right = (t.lastOOG != null) ? `OOG ${t.lastOOG}` : (t.latestStatus || '');
        lines.appendChild(makeCardLine(left, right ? makeRowTag(right, 'row-tag--count') : null, () => {
          if (t?.class_id != null && t?.horseName) {
            setScreen('entryDetail', { kind: 'entry', key: `${t.class_id}|${t.horseName}` }, true);
          }
        }));
      }

      card.appendChild(lines);
      screenRoot.appendChild(card);
    }
  }

  // ---------------------------------------------------------------------------
  // MASTER RENDER
  // ---------------------------------------------------------------------------
  function render() {
    if (!screenRoot || !headerTitle) return;

    if (!state.sessionStarted) {
      renderStart();
      // nav aggs are still valid to show as 0s
      setNavAgg('horses', 0, false);
      setNavAgg('rings', 0, false);
      setNavAgg('classes', 0, false);
      setNavAgg('riders', 0, false);
      setNavAgg('summary', 0, false);
      return;
    }

    const idx = indexData();

    // Back behavior
    if (state.currentScreen === 'start') {
      renderStart();
      return;
    }

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
    renderHorses(idx);
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------
  if (headerBack) headerBack.addEventListener('click', () => {
    if (!state.sessionStarted) return;
    if (state.history.length === 0) return;
    goBack();
  });

  if (headerAction) headerAction.addEventListener('click', () => {
    loadAll();
  });

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const screen = btn.getAttribute('data-screen');

      // Start is always allowed
      if (screen === 'start') {
        state.sessionStarted = false;
        state.currentScreen = 'start';
        state.history = [];
        state.detail = null;
        render();
        return;
      }

      // Block other tabs until session started
      if (!state.sessionStarted) return;

      // Switching tabs clears history and resets peak for that tab
      state.history = [];
      state.detail = null;
      resetPeak(screen);

      state.currentScreen = screen;
      render();
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------
  state.currentScreen = 'start';
  render();
})();
