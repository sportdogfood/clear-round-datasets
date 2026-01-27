// app.js — Show Follow (LEGACY UI • rows-only • peak/list ladder)
//
// Data (local files):
//   ./data/latest/watch_schedule.json
//   ./data/latest/watch_trips.json
//
// Truth:
//   - Active horses (followed set) gates all other screens
//   - FULL vs ACTIVE toggle (list-level)
//   - ACTIVE vs COMPLETED toggle (status-level)
//   - Peak scroller is on-page filter (separate from toggles)

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  const SCHEDULE_URL = './data/latest/watch_schedule.json';
  const TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  const STORAGE_KEY_SESSION = 'crt_showfollow_session_v1';
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h sliding TTL

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const state = {
    // data
    schedule: [],
    trips: [],
    meta: { dt: null, generated_at: null },

    // session
    session: null, // { sessionId, createdAt, lastUpdated, expiresAt, unfollowed:[], search:'' }
    activeHorseNames: new Set(), // derived: all horses minus unfollowed

    // ui routing
    currentScreen: 'start',
    history: [],
    detailKey: null, // ring_number | class_id | horseName | riderName | group_id
    detailType: null, // 'ring' | 'class' | 'horse' | 'rider' | 'group'

    // toggles (global, reused)
    scopeMode: 'active',  // 'full' | 'active'
    statusMode: 'active', // 'active' | 'completed'

    // peak filters (per screen)
    peak: {
      rings: new Set(),
      classes: new Set(), // group_ids
      riders: new Set(),
    },

    // horses search (legacy state-search)
    horsesSearch: '',
  };

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const screenRoot = document.getElementById('screen-root');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // SAFE JSON + STORAGE
  // ---------------------------------------------------------------------------

  function nowMs() { return Date.now(); }

  function safeJSONParse(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function isExpired(expiresAt) {
    if (!expiresAt) return false;
    const t = Date.parse(String(expiresAt));
    if (!Number.isFinite(t)) return false;
    return t <= nowMs();
  }

  function touchSessionExpiry() {
    if (!state.session) return;
    state.session.expiresAt = new Date(nowMs() + SESSION_TTL_MS).toISOString();
  }

  function saveSession() {
    if (!state.session) return;
    storageSet(STORAGE_KEY_SESSION, JSON.stringify(state.session));
  }

  function loadSession() {
    const raw = storageGet(STORAGE_KEY_SESSION);
    if (!raw) return null;
    const parsed = safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.expiresAt && isExpired(parsed.expiresAt)) {
      storageRemove(STORAGE_KEY_SESSION);
      return null;
    }

    return {
      sessionId: String(parsed.sessionId || nowMs()),
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      lastUpdated: parsed.lastUpdated ? String(parsed.lastUpdated) : null,
      expiresAt: parsed.expiresAt ? String(parsed.expiresAt) : null,
      unfollowed: Array.isArray(parsed.unfollowed) ? parsed.unfollowed.map(String) : [],
      horsesSearch: String(parsed.horsesSearch || ''),
      scopeMode: parsed.scopeMode === 'full' ? 'full' : 'active',
      statusMode: parsed.statusMode === 'completed' ? 'completed' : 'active',
    };
  }

  function updateLastUpdated() {
    if (!state.session) return;
    state.session.lastUpdated = new Date().toISOString();
    touchSessionExpiry();
    saveSession();
  }

  // ---------------------------------------------------------------------------
  // TIME HELPERS
  // ---------------------------------------------------------------------------

  function parseTimeToMinutes(twelveHr) {
    // expects "8:05 AM" etc
    const s = String(twelveHr || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ap = String(m[3]).toUpperCase();
    if (hh === 12) hh = 0;
    if (ap === 'PM') hh += 12;
    return hh * 60 + mm;
  }

  function sortByStart(a, b) {
    const am = parseTimeToMinutes(a.latestStart);
    const bm = parseTimeToMinutes(b.latestStart);
    if (am == null && bm == null) return 0;
    if (am == null) return 1;
    if (bm == null) return -1;
    if (am !== bm) return am - bm;
    return Number(a.class_number || 0) - Number(b.class_number || 0);
  }

  // ---------------------------------------------------------------------------
  // DATA LOAD
  // ---------------------------------------------------------------------------

  async function loadData() {
    try {
      const [rs, rt] = await Promise.all([
        fetch(SCHEDULE_URL, { cache: 'no-store' }),
        fetch(TRIPS_URL, { cache: 'no-store' }),
      ]);

      if (rs.ok) {
        const json = await rs.json();
        state.schedule = Array.isArray(json?.records) ? json.records : [];
        // meta dt comes from records dt (single-day) — prefer first record
        state.meta.dt = state.schedule[0]?.dt || state.meta.dt;
        state.meta.generated_at = json?.meta?.generated_at || state.meta.generated_at;
      }

      if (rt.ok) {
        const json = await rt.json();
        state.trips = Array.isArray(json?.records) ? json.records : [];
        state.meta.dt = state.trips[0]?.dt || state.meta.dt;
        state.meta.generated_at = json?.meta?.generated_at || state.meta.generated_at;
      }

      ensureSessionFromData();
      render();
    } catch (_) {
      // keep last data
    }
  }

  setInterval(loadData, REFRESH_MS);

  // ---------------------------------------------------------------------------
  // DERIVED: ACTIVE HORSES (FOLLOW SET)
  // ---------------------------------------------------------------------------

  function allHorseNames() {
    const set = new Set();
    for (const t of state.trips) {
      const hn = String(t.horseName || '').trim();
      if (hn) set.add(hn);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function ensureSessionFromData() {
    // session:
    // - default: all horses followed (unfollowed empty)
    // - persists unfollowed set
    if (!state.session) {
      state.session = loadSession();
    }

    if (!state.session) {
      state.session = {
        sessionId: nowMs().toString(),
        createdAt: new Date().toISOString(),
        lastUpdated: null,
        expiresAt: new Date(nowMs() + SESSION_TTL_MS).toISOString(),
        unfollowed: [],
        horsesSearch: '',
        scopeMode: 'active',
        statusMode: 'active',
      };
      saveSession();
    } else {
      touchSessionExpiry();
      saveSession();
    }

    // restore modes/search
    state.horsesSearch = state.session.horsesSearch || '';
    state.scopeMode = state.session.scopeMode || 'active';
    state.statusMode = state.session.statusMode || 'active';

    // activeHorseNames derived
    const unf = new Set((state.session.unfollowed || []).map(String));
    state.activeHorseNames = new Set(allHorseNames().filter((h) => !unf.has(h)));

    // If data changed (new horses), they’re followed by default.
  }

  function isTripVisibleByStatus(t) {
    if (state.statusMode === 'completed') return true;
    return String(t.latestStatus || '').trim() !== 'Completed';
  }

  function isActiveTrip(t) {
    const hn = String(t.horseName || '').trim();
    if (!hn) return false;
    if (!state.activeHorseNames.has(hn)) return false;
    return isTripVisibleByStatus(t);
  }

  // ---------------------------------------------------------------------------
  // INDEXES (in-memory)
  // ---------------------------------------------------------------------------

  function groupTripsBy(keyFn) {
    const map = new Map();
    for (const t of state.trips) {
      if (!isTripVisibleByStatus(t)) continue; // status toggle should gate counts
      const k = keyFn(t);
      if (k == null) continue;
      const arr = map.get(k) || [];
      arr.push(t);
      map.set(k, arr);
    }
    return map;
  }

  function activeTripsOnly(arr) {
    return arr.filter(isActiveTrip);
  }

  function uniqueBy(arr, key) {
    const m = new Map();
    for (const x of arr) {
      const k = x && x[key];
      if (k == null) continue;
      if (!m.has(k)) m.set(k, x);
    }
    return Array.from(m.values());
  }

  function ringsList() {
    const rings = uniqueBy(state.schedule, 'ring_number')
      .map((r) => ({
        ring_number: Number(r.ring_number),
        ringName: String(r.ringName || `Ring ${r.ring_number}`),
      }))
      .filter((r) => Number.isFinite(r.ring_number))
      .sort((a, b) => a.ring_number - b.ring_number);

    return rings;
  }

  function groupsListForRing(ring_number) {
    const rows = state.schedule.filter((s) => Number(s.ring_number) === Number(ring_number));
    const uniq = uniqueBy(rows, 'class_group_id')
      .map((g) => ({
        ring_number: Number(ring_number),
        class_group_id: Number(g.class_group_id),
        group_name: String(g.group_name || ''),
        latestStart: String(g.latestStart || ''),
        latestStatus: g.latestStatus == null ? null : String(g.latestStatus),
      }))
      .filter((g) => Number.isFinite(g.class_group_id));

    uniq.sort(sortByStart);
    return uniq;
  }

  function classesListForGroup(class_group_id) {
    const rows = state.schedule.filter((s) => Number(s.class_group_id) === Number(class_group_id));
    const uniq = uniqueBy(rows, 'class_id')
      .map((c) => ({
        class_group_id: Number(class_group_id),
        class_id: Number(c.class_id),
        class_number: c.class_number,
        class_name: String(c.class_name || ''),
        class_type: c.class_type == null ? null : String(c.class_type),
        latestStart: String(c.latestStart || ''),
        latestStatus: c.latestStatus == null ? null : String(c.latestStatus),
        ring_number: c.ring_number,
        ringName: c.ringName,
      }))
      .filter((c) => Number.isFinite(c.class_id));

    uniq.sort(sortByStart);
    return uniq;
  }

  function tripsForClass(class_id) {
    return state.trips.filter((t) => Number(t.class_id) === Number(class_id));
  }

  // ---------------------------------------------------------------------------
  // LEGACY UI HELPERS (ROWS ONLY)
  // ---------------------------------------------------------------------------

  function clearScreen() {
    screenRoot.innerHTML = '';
  }

  function createRow(label, options = {}) {
    const { tagText, tagVariant, tagPositive, active, onClick } = options;

    const row = document.createElement('div');
    row.className = 'row row--tap';
    if (active) row.classList.add('row--active');

    const titleEl = document.createElement('div');
    titleEl.className = 'row-title';
    titleEl.textContent = label;
    row.appendChild(titleEl);

    if (tagText != null || tagVariant) {
      const tagEl = document.createElement('div');
      tagEl.className = 'row-tag';
      if (tagVariant) tagEl.classList.add(`row-tag--${tagVariant}`);
      if (tagPositive) tagEl.classList.add('row-tag--positive');
      if (tagText != null) tagEl.textContent = tagText;
      row.appendChild(tagEl);
    }

    if (typeof onClick === 'function') row.addEventListener('click', onClick);
    screenRoot.appendChild(row);
  }

  function createGroupLabel(text) {
    const el = document.createElement('div');
    el.className = 'list-group-label';
    el.textContent = text;
    screenRoot.appendChild(el);
  }

  function createDivider() {
    const el = document.createElement('div');
    el.className = 'list-group-divider';
    screenRoot.appendChild(el);
  }

  // Peak scroller (uses nav classes to look identical; no new CSS)
  function renderPeak(idKey, items, selectedSet, onToggle) {
    if (!Array.isArray(items) || !items.length) return;

    const scroller = document.createElement('div');
    scroller.className = 'nav-scroller';

    const row = document.createElement('div');
    row.className = 'nav-row';
    row.id = idKey;

    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-btn';

      const isOn = selectedSet.has(String(item.key));
      if (isOn) btn.classList.add('nav-btn--primary');

      const lab = document.createElement('span');
      lab.className = 'nav-label';
      lab.textContent = item.label;

      const agg = document.createElement('span');
      agg.className = 'nav-agg';
      agg.textContent = String(item.count || 0);
      if ((item.count || 0) > 0) agg.classList.add('nav-agg--positive');

      btn.appendChild(lab);
      btn.appendChild(agg);

      btn.addEventListener('click', () => onToggle(item.key));
      row.appendChild(btn);
    }

    scroller.appendChild(row);
    screenRoot.appendChild(scroller);

    // visual divider between peak and list
    createDivider();
  }

  // Toggle pills (also uses nav-btn so it looks like legacy; no "Scope:" labels)
  function renderToggles() {
    const scroller = document.createElement('div');
    scroller.className = 'nav-scroller';

    const row = document.createElement('div');
    row.className = 'nav-row';

    // FULL / ACTIVE
    const btnFull = document.createElement('button');
    btnFull.type = 'button';
    btnFull.className = 'nav-btn';
    if (state.scopeMode === 'full') btnFull.classList.add('nav-btn--primary');
    btnFull.textContent = 'FULL';
    btnFull.addEventListener('click', () => {
      state.scopeMode = 'full';
      if (state.session) state.session.scopeMode = 'full';
      updateLastUpdated();
      render();
    });

    const btnActive = document.createElement('button');
    btnActive.type = 'button';
    btnActive.className = 'nav-btn';
    if (state.scopeMode === 'active') btnActive.classList.add('nav-btn--primary');
    btnActive.textContent = 'ACTIVE';
    btnActive.addEventListener('click', () => {
      state.scopeMode = 'active';
      if (state.session) state.session.scopeMode = 'active';
      updateLastUpdated();
      render();
    });

    // COMPLETED / ACTIVE (status gating)
    const btnStatusActive = document.createElement('button');
    btnStatusActive.type = 'button';
    btnStatusActive.className = 'nav-btn';
    if (state.statusMode === 'active') btnStatusActive.classList.add('nav-btn--primary');
    btnStatusActive.textContent = 'ACTIVE';
    btnStatusActive.addEventListener('click', () => {
      state.statusMode = 'active';
      if (state.session) state.session.statusMode = 'active';
      updateLastUpdated();
      render();
    });

    const btnCompleted = document.createElement('button');
    btnCompleted.type = 'button';
    btnCompleted.className = 'nav-btn';
    if (state.statusMode === 'completed') btnCompleted.classList.add('nav-btn--primary');
    btnCompleted.textContent = 'COMPLETED';
    btnCompleted.addEventListener('click', () => {
      state.statusMode = 'completed';
      if (state.session) state.session.statusMode = 'completed';
      updateLastUpdated();
      render();
    });

    row.appendChild(btnFull);
    row.appendChild(btnActive);
    row.appendChild(btnStatusActive);
    row.appendChild(btnCompleted);

    scroller.appendChild(row);
    screenRoot.appendChild(scroller);

    createDivider();
  }

  // ---------------------------------------------------------------------------
  // NAV / ROUTING (LEGACY CADENCE)
  // ---------------------------------------------------------------------------

  function setScreen(screen, detailType = null, detailKey = null, pushHistory = true) {
    if (pushHistory && state.currentScreen !== screen) {
      state.history.push({ screen: state.currentScreen, detailType: state.detailType, detailKey: state.detailKey });
    }
    state.currentScreen = screen;
    state.detailType = detailType;
    state.detailKey = detailKey;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return setScreen('start', null, null, false);
    state.currentScreen = prev.screen;
    state.detailType = prev.detailType;
    state.detailKey = prev.detailKey;
    render();
  }

  function screenTitle() {
    if (state.currentScreen === 'start') return 'Start';
    if (state.currentScreen === 'horses') return 'Active Horses';
    if (state.currentScreen === 'rings') return 'Rings';
    if (state.currentScreen === 'classes') return 'Classes';
    if (state.currentScreen === 'riders') return 'Riders';
    if (state.currentScreen === 'summary') return 'Summary';

    if (state.currentScreen === 'detail') {
      if (state.detailType === 'ring') return 'Ring Detail';
      if (state.detailType === 'group') return 'Group Detail';
      if (state.detailType === 'class') return 'Class Detail';
      if (state.detailType === 'horse') return 'Horse Detail';
      if (state.detailType === 'rider') return 'Rider Detail';
    }

    return '';
  }

  function headerCadence() {
    // back + next like legacy
    headerTitle.textContent = screenTitle();

    const hideBack = state.history.length === 0 && state.currentScreen === 'start';
    headerBack.style.visibility = hideBack ? 'hidden' : 'visible';

    // Header "Next" progression (except Summary)
    const nextMap = {
      start: 'horses',
      horses: 'rings',
      rings: 'classes',
      classes: 'riders',
      riders: 'summary',
    };

    const isDetail = state.currentScreen === 'detail';
    if (isDetail) {
      headerAction.hidden = true;
      headerAction.textContent = '';
      delete headerAction.dataset.action;
      return;
    }

    const next = nextMap[state.currentScreen];
    if (next) {
      headerAction.hidden = false;
      headerAction.textContent = 'Next';
      headerAction.dataset.action = `go:${next}`;
    } else {
      headerAction.hidden = true;
      headerAction.textContent = '';
      delete headerAction.dataset.action;
    }
  }

  function setNavActive() {
    // bottom nav --primary
    const buttons = navRow ? navRow.querySelectorAll('.nav-btn') : [];
    buttons.forEach((btn) => {
      btn.classList.remove('nav-btn--primary');
    });

    const current = state.currentScreen === 'detail' ? inferPrimaryTabFromDetail() : state.currentScreen;
    const activeBtn = navRow ? navRow.querySelector(`.nav-btn[data-screen="${current}"]`) : null;
    if (activeBtn) activeBtn.classList.add('nav-btn--primary');
  }

  function inferPrimaryTabFromDetail() {
    if (state.detailType === 'ring') return 'rings';
    if (state.detailType === 'group') return 'classes';
    if (state.detailType === 'class') return 'classes';
    if (state.detailType === 'horse') return 'horses';
    if (state.detailType === 'rider') return 'riders';
    return 'summary';
  }

  function updateNavAggs() {
    if (!navRow) return;

    const allH = allHorseNames();
    const activeH = Array.from(state.activeHorseNames);

    // ring count (gated by active horses if scopeMode=active)
    const ringTrips = groupTripsBy((t) => String(t.ring_number));
    const ringCount = ringsList().filter((r) => {
      const arr = ringTrips.get(String(r.ring_number)) || [];
      const activeArr = activeTripsOnly(arr);
      return state.scopeMode === 'full' ? arr.length > 0 : activeArr.length > 0;
    }).length;

    // class count (use schedule classes, gate by active horses via trips)
    const classTrips = groupTripsBy((t) => String(t.class_id));
    const uniqueClasses = uniqueBy(state.schedule, 'class_id');
    const classCount = uniqueClasses.filter((c) => {
      const arr = classTrips.get(String(c.class_id)) || [];
      const activeArr = activeTripsOnly(arr);
      return state.scopeMode === 'full' ? arr.length > 0 : activeArr.length > 0;
    }).length;

    // riders count
    const riderTrips = groupTripsBy((t) => String(t.teamName || ''));
    const riderKeys = Array.from(riderTrips.keys()).filter(Boolean);
    const riderCount = riderKeys.filter((k) => {
      const arr = riderTrips.get(k) || [];
      const activeArr = activeTripsOnly(arr);
      return state.scopeMode === 'full' ? arr.length > 0 : activeArr.length > 0;
    }).length;

    // summary count = active trips total
    const activeTripCount = state.trips.filter(isActiveTrip).length;

    function setAgg(key, value) {
      const el = navRow.querySelector(`[data-nav-agg="${key}"]`);
      if (!el) return;
      const n = Number(value) || 0;
      el.textContent = String(n);
      if (n > 0) el.classList.add('nav-agg--positive');
      else el.classList.remove('nav-agg--positive');
    }

    setAgg('horses', activeH.length || 0);
    setAgg('rings', ringCount || 0);
    setAgg('classes', classCount || 0);
    setAgg('riders', riderCount || 0);
    setAgg('summary', activeTripCount || 0);
  }

  // ---------------------------------------------------------------------------
  // SCREENS
  // ---------------------------------------------------------------------------

  function renderStart() {
    clearScreen();

    const hasSession = !!state.session;

    if (!hasSession) {
      createRow('New session', {
        tagVariant: 'boolean',
        tagPositive: false,
        onClick: () => {
          storageRemove(STORAGE_KEY_SESSION);
          state.session = null;
          ensureSessionFromData();
          setScreen('horses', null, null, false);
        }
      });
      return;
    }

    createRow('In-session', {
      active: true,
      tagVariant: 'boolean',
      tagPositive: true,
      onClick: () => setScreen('horses', null, null, true)
    });

    createRow('Restart session', {
      tagVariant: 'boolean',
      tagPositive: false,
      onClick: () => {
        storageRemove(STORAGE_KEY_SESSION);
        state.session = null;
        ensureSessionFromData();
        setScreen('horses', null, null, false);
      }
    });
  }

  function toggleHorseFollow(horseName) {
    const hn = String(horseName || '').trim();
    if (!hn || !state.session) return;

    const unf = new Set((state.session.unfollowed || []).map(String));
    if (unf.has(hn)) unf.delete(hn);
    else unf.add(hn);

    state.session.unfollowed = Array.from(unf);
    state.session.horsesSearch = state.horsesSearch || '';
    updateLastUpdated();

    ensureSessionFromData();
    render();
  }

  function renderHorses() {
    clearScreen();

    // legacy state-search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'state-search';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'state-search-input';
    input.placeholder = 'Search horses...';
    input.value = state.horsesSearch || '';
    input.addEventListener('input', (e) => {
      state.horsesSearch = e.target.value || '';
      if (state.session) {
        state.session.horsesSearch = state.horsesSearch;
        saveSession();
      }
      render();
    });

    searchWrap.appendChild(input);
    screenRoot.appendChild(searchWrap);

    const horses = allHorseNames();
    const term = String(state.horsesSearch || '').trim().toLowerCase();
    const filtered = term ? horses.filter((h) => h.toLowerCase().includes(term)) : horses;

    const active = filtered.filter((h) => state.activeHorseNames.has(h));
    const inactive = filtered.filter((h) => !state.activeHorseNames.has(h));

    if (active.length) {
      createGroupLabel('Active');
      for (const h of active) {
        const count = state.trips.filter((t) => String(t.horseName) === h && isTripVisibleByStatus(t)).length;
        createRow(h, {
          active: true,
          tagText: String(count),
          tagVariant: 'count',
          tagPositive: count > 0,
          onClick: () => toggleHorseFollow(h)
        });
      }
    }

    if (inactive.length) {
      if (active.length) createDivider();
      createGroupLabel('Inactive');
      for (const h of inactive) {
        const count = state.trips.filter((t) => String(t.horseName) === h && isTripVisibleByStatus(t)).length;
        createRow(h, {
          tagText: String(count),
          tagVariant: 'count',
          tagPositive: false,
          onClick: () => toggleHorseFollow(h)
        });
      }
    }
  }

  // Rings template: Ring -> Group -> Class -> Entries (horse)
  function renderRings() {
    clearScreen();
    renderToggles();

    // peak: rings
    const rings = ringsList();
    const ringTripsMap = groupTripsBy((t) => String(t.ring_number));

    const peakItems = rings.map((r) => {
      const arr = ringTripsMap.get(String(r.ring_number)) || [];
      const activeArr = activeTripsOnly(arr);
      const count = state.scopeMode === 'full' ? arr.length : activeArr.length;
      return { key: String(r.ring_number), label: r.ringName, count };
    });

    renderPeak('ring-peak', peakItems, state.peak.rings, (key) => {
      const k = String(key);
      if (state.peak.rings.has(k)) state.peak.rings.delete(k);
      else state.peak.rings.add(k);
      render();
    });

    const ringFilterOn = state.peak.rings.size > 0;
    const ringsToShow = ringFilterOn
      ? rings.filter((r) => state.peak.rings.has(String(r.ring_number)))
      : rings;

    for (const r of ringsToShow) {
      // ring overview
      const groups = groupsListForRing(r.ring_number);
      const groupTripsMap = groupTripsBy((t) => `${t.ring_number}::${t.class_group_id}`);

      // gate ring in ACTIVE scope
      let ringHasActive = false;
      for (const g of groups) {
        const arr = groupTripsMap.get(`${r.ring_number}::${g.class_group_id}`) || [];
        if (activeTripsOnly(arr).length > 0) { ringHasActive = true; break; }
      }
      if (state.scopeMode === 'active' && !ringHasActive) continue;

      const groupCount = groups.length;

      createRow(`${r.ringName}`, {
        tagText: String(groupCount),
        tagVariant: 'count',
        tagPositive: groupCount > 0,
        onClick: () => setScreen('detail', 'ring', r.ring_number)
      });

      // group rollups under ring
      for (const g of groups) {
        const gKey = `${r.ring_number}::${g.class_group_id}`;
        const arr = groupTripsMap.get(gKey) || [];
        const activeArr = activeTripsOnly(arr);

        if (state.scopeMode === 'active' && activeArr.length === 0) continue;

        // status gate (for group label display only)
        const status = String(g.latestStatus || '') || (state.statusMode === 'active' ? 'Active' : '');
        const time = String(g.latestStart || '');
        const label = `${time ? time + ' • ' : ''}${g.group_name}${status ? ' • ' + status : ''}`;

        // count: active horses (distinct) under this group
        const horseSet = new Set(activeArr.map((t) => String(t.horseName || '').trim()).filter(Boolean));
        const horseCount = horseSet.size;

        createRow(`• ${label}`, {
          tagText: String(horseCount),
          tagVariant: 'count',
          tagPositive: horseCount > 0,
          onClick: () => setScreen('detail', 'group', g.class_group_id)
        });

        // classes under group
        const cls = classesListForGroup(g.class_group_id);
        const classTripsMap = groupTripsBy((t) => String(t.class_id));

        for (const c of cls) {
          const carr = classTripsMap.get(String(c.class_id)) || [];
          const cactive = activeTripsOnly(carr);
          if (state.scopeMode === 'active' && cactive.length === 0) continue;

          const chorses = new Set(cactive.map((t) => String(t.horseName || '').trim()).filter(Boolean));
          createRow(`  • ${c.class_name}`, {
            tagText: String(chorses.size),
            tagVariant: 'count',
            tagPositive: chorses.size > 0,
            onClick: () => setScreen('detail', 'class', c.class_id)
          });

          // entries (horses) under class
          const byHorse = new Map();
          for (const t of cactive) {
            const hn = String(t.horseName || '').trim();
            if (!hn) continue;
            const arrH = byHorse.get(hn) || [];
            arrH.push(t);
            byHorse.set(hn, arrH);
          }
          const horses = Array.from(byHorse.keys()).sort((a, b) => a.localeCompare(b));

          // FULL: show all horses under class; ACTIVE: same (already gated by active horse set)
          for (const hn of horses) {
            const t0 = byHorse.get(hn)[0];
            const oog = t0 && t0.lastOOG != null ? `#${t0.lastOOG}` : '';
            const go = String(t0 && t0.latestGO || '').trim();
            const tag = go ? `${oog ? oog + ' ' : ''}${go}` : (oog || '');

            createRow(`    • ${hn}`, {
              tagText: tag || '',
              tagVariant: tag ? 'count' : null,
              tagPositive: false,
              onClick: () => setScreen('detail', 'horse', hn)
            });
          }
        }
      }

      createDivider();
    }
  }

  // Classes template (groups-first): Group -> Classes -> Entries
  function renderClasses() {
    clearScreen();
    renderToggles();

    const groups = uniqueBy(state.schedule, 'class_group_id')
      .map((g) => ({
        class_group_id: Number(g.class_group_id),
        group_name: String(g.group_name || ''),
        latestStart: String(g.latestStart || ''),
        ring_number: g.ring_number,
        ringName: g.ringName,
        latestStatus: g.latestStatus == null ? null : String(g.latestStatus),
      }))
      .filter((g) => Number.isFinite(g.class_group_id))
      .sort(sortByStart);

    // peak: groups
    const groupTripsMap = groupTripsBy((t) => String(t.class_group_id));
    const peakItems = groups.map((g) => {
      const arr = groupTripsMap.get(String(g.class_group_id)) || [];
      const activeArr = activeTripsOnly(arr);
      const count = state.scopeMode === 'full' ? arr.length : activeArr.length;
      const label = `${g.latestStart ? g.latestStart + ' • ' : ''}${g.group_name}`.trim();
      return { key: String(g.class_group_id), label, count };
    });

    renderPeak('group-peak', peakItems, state.peak.classes, (key) => {
      const k = String(key);
      if (state.peak.classes.has(k)) state.peak.classes.delete(k);
      else state.peak.classes.add(k);
      render();
    });

    const groupFilterOn = state.peak.classes.size > 0;
    const groupsToShow = groupFilterOn
      ? groups.filter((g) => state.peak.classes.has(String(g.class_group_id)))
      : groups;

    for (const g of groupsToShow) {
      const arr = groupTripsMap.get(String(g.class_group_id)) || [];
      const activeArr = activeTripsOnly(arr);
      if (state.scopeMode === 'active' && activeArr.length === 0) continue;

      const label = `${g.latestStart ? g.latestStart + ' • ' : ''}${g.group_name}`;
      createRow(label, {
        tagText: String(new Set(activeArr.map((t) => String(t.horseName || '').trim()).filter(Boolean)).size),
        tagVariant: 'count',
        tagPositive: activeArr.length > 0,
        onClick: () => setScreen('detail', 'group', g.class_group_id)
      });

      const cls = classesListForGroup(g.class_group_id);
      const classTripsMap = groupTripsBy((t) => String(t.class_id));

      for (const c of cls) {
        const carr = classTripsMap.get(String(c.class_id)) || [];
        const cactive = activeTripsOnly(carr);
        if (state.scopeMode === 'active' && cactive.length === 0) continue;

        const horses = new Set(cactive.map((t) => String(t.horseName || '').trim()).filter(Boolean));
        createRow(`• ${c.class_name}`, {
          tagText: String(horses.size),
          tagVariant: 'count',
          tagPositive: horses.size > 0,
          onClick: () => setScreen('detail', 'class', c.class_id)
        });

        // entries under class
        const byHorse = new Map();
        for (const t of cactive) {
          const hn = String(t.horseName || '').trim();
          if (!hn) continue;
          const arrH = byHorse.get(hn) || [];
          arrH.push(t);
          byHorse.set(hn, arrH);
        }
        const horseNames = Array.from(byHorse.keys()).sort((a, b) => a.localeCompare(b));

        for (const hn of horseNames) {
          const t0 = byHorse.get(hn)[0];
          const oog = t0 && t0.lastOOG != null ? `#${t0.lastOOG}` : '';
          const go = String(t0 && t0.latestGO || '').trim();
          const tag = go ? `${oog ? oog + ' ' : ''}${go}` : (oog || '');

          createRow(`  • ${hn}`, {
            tagText: tag || '',
            tagVariant: tag ? 'count' : null,
            tagPositive: false,
            onClick: () => setScreen('detail', 'horse', hn)
          });
        }
      }

      createDivider();
    }
  }

  // Riders template: Rider -> Trips (class/ring)
  function renderRiders() {
    clearScreen();
    renderToggles();

    const tripsByRider = groupTripsBy((t) => String(t.teamName || '').trim());
    const riderKeys = Array.from(tripsByRider.keys()).filter(Boolean).sort((a, b) => a.localeCompare(b));

    // peak: riders
    const peakItems = riderKeys.map((k) => {
      const arr = tripsByRider.get(k) || [];
      const activeArr = activeTripsOnly(arr);
      const count = state.scopeMode === 'full' ? arr.length : activeArr.length;
      return { key: k, label: k, count };
    });

    renderPeak('rider-peak', peakItems, state.peak.riders, (key) => {
      const k = String(key);
      if (state.peak.riders.has(k)) state.peak.riders.delete(k);
      else state.peak.riders.add(k);
      render();
    });

    const riderFilterOn = state.peak.riders.size > 0;
    const ridersToShow = riderFilterOn ? riderKeys.filter((k) => state.peak.riders.has(k)) : riderKeys;

    for (const rider of ridersToShow) {
      const arr = tripsByRider.get(rider) || [];
      const activeArr = activeTripsOnly(arr);
      if (state.scopeMode === 'active' && activeArr.length === 0) continue;

      createRow(rider, {
        tagText: String((state.scopeMode === 'full' ? arr : activeArr).length),
        tagVariant: 'count',
        tagPositive: activeArr.length > 0,
        onClick: () => setScreen('detail', 'rider', rider)
      });
    }
  }

  // Summary template: Active trips sorted ring/time
  function renderSummary() {
    clearScreen();
    renderToggles();

    const list = state.trips
      .filter(isActiveTrip)
      .slice()
      .sort((a, b) => {
        const ar = Number(a.ring_number || 0);
        const br = Number(b.ring_number || 0);
        if (ar !== br) return ar - br;

        const am = parseTimeToMinutes(a.latestStart);
        const bm = parseTimeToMinutes(b.latestStart);
        if (am != null && bm != null && am !== bm) return am - bm;

        const ao = Number(a.lastOOG || 9999);
        const bo = Number(b.lastOOG || 9999);
        return ao - bo;
      });

    for (const t of list) {
      const hn = String(t.horseName || '').trim();
      const cn = String(t.class_name || '').trim();
      const rn = String(t.ringName || '').trim();
      const go = String(t.latestGO || '').trim();

      createRow(`${rn} • ${cn} • ${hn}`, {
        tagText: go || '',
        tagVariant: go ? 'count' : null,
        tagPositive: false,
        onClick: () => setScreen('detail', 'horse', hn)
      });
    }
  }

  // Details
  function renderDetail() {
    clearScreen();
    renderToggles();

    if (state.detailType === 'ring') {
      const ringNum = Number(state.detailKey);
      const ring = ringsList().find((r) => Number(r.ring_number) === ringNum);
      const title = ring ? ring.ringName : `Ring ${ringNum}`;
      createGroupLabel(title);

      // Show same ladder, but only this ring (no truncation)
      const groups = groupsListForRing(ringNum);
      const groupTripsMap = groupTripsBy((t) => `${t.ring_number}::${t.class_group_id}`);
      const classTripsMap = groupTripsBy((t) => String(t.class_id));

      for (const g of groups) {
        const gKey = `${ringNum}::${g.class_group_id}`;
        const arr = groupTripsMap.get(gKey) || [];
        const activeArr = activeTripsOnly(arr);
        if (state.scopeMode === 'active' && activeArr.length === 0) continue;

        const time = String(g.latestStart || '');
        const status = String(g.latestStatus || '') || (state.statusMode === 'active' ? 'Active' : '');
        const label = `${time ? time + ' • ' : ''}${g.group_name}${status ? ' • ' + status : ''}`;

        createRow(`• ${label}`, {
          tagText: String(new Set(activeArr.map((t) => String(t.horseName || '').trim()).filter(Boolean)).size),
          tagVariant: 'count',
          tagPositive: activeArr.length > 0,
          onClick: () => setScreen('detail', 'group', g.class_group_id)
        });

        const cls = classesListForGroup(g.class_group_id);
        for (const c of cls) {
          const carr = classTripsMap.get(String(c.class_id)) || [];
          const cactive = activeTripsOnly(carr);
          if (state.scopeMode === 'active' && cactive.length === 0) continue;

          const horses = new Set(cactive.map((t) => String(t.horseName || '').trim()).filter(Boolean));
          createRow(`  • ${c.class_name}`, {
            tagText: String(horses.size),
            tagVariant: 'count',
            tagPositive: horses.size > 0,
            onClick: () => setScreen('detail', 'class', c.class_id)
          });

          const byHorse = new Map();
          for (const t of cactive) {
            const hn = String(t.horseName || '').trim();
            if (!hn) continue;
            const arrH = byHorse.get(hn) || [];
            arrH.push(t);
            byHorse.set(hn, arrH);
          }
          const horseNames = Array.from(byHorse.keys()).sort((a, b) => a.localeCompare(b));
          for (const hn of horseNames) {
            const t0 = byHorse.get(hn)[0];
            const oog = t0 && t0.lastOOG != null ? `#${t0.lastOOG}` : '';
            const go = String(t0 && t0.latestGO || '').trim();
            const tag = go ? `${oog ? oog + ' ' : ''}${go}` : (oog || '');

            createRow(`    • ${hn}`, {
              tagText: tag || '',
              tagVariant: tag ? 'count' : null,
              tagPositive: false,
              onClick: () => setScreen('detail', 'horse', hn)
            });
          }
        }

        createDivider();
      }

      return;
    }

    if (state.detailType === 'group') {
      const groupId = Number(state.detailKey);
      const rows = state.schedule.filter((s) => Number(s.class_group_id) === groupId);
      const groupName = rows[0]?.group_name ? String(rows[0].group_name) : `Group ${groupId}`;

      createGroupLabel(groupName);

      const cls = classesListForGroup(groupId);
      const classTripsMap = groupTripsBy((t) => String(t.class_id));

      for (const c of cls) {
        const carr = classTripsMap.get(String(c.class_id)) || [];
        const cactive = activeTripsOnly(carr);
        if (state.scopeMode === 'active' && cactive.length === 0) continue;

        const horses = new Set(cactive.map((t) => String(t.horseName || '').trim()).filter(Boolean));
        createRow(`${c.class_name}`, {
          tagText: String(horses.size),
          tagVariant: 'count',
          tagPositive: horses.size > 0,
          onClick: () => setScreen('detail', 'class', c.class_id)
        });
      }
      return;
    }

    if (state.detailType === 'class') {
      const classId = Number(state.detailKey);
      const cRow = state.schedule.find((s) => Number(s.class_id) === classId);
      const className = cRow ? String(cRow.class_name || `Class ${classId}`) : `Class ${classId}`;
      createGroupLabel(className);

      const t = tripsForClass(classId
