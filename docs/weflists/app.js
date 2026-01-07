/* TackLists.com — ultra-minimal iPhone web app (no build).
   - Local-only session storage (12h TTL)
   - Loads horses.json + lists.json (optional)
   - NEW: “show scope” loader (ring -> show_id/show_date) + schedule/my loader
*/
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const APP_TITLE = 'TackLists.com';
  const APP_SUBTITLE = 'Quick horse tack lists, on the fly.';

  const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

  const HORSES_DATA_URL = './data/horses.json';
  const LISTS_DATA_URL = './data/lists.json';

  const STORAGE_KEY_SESSION = 'tacklists_session_v1';
  const STORAGE_KEY_CATALOG = 'tacklists_catalog_v1';
  const STORAGE_KEY_LISTS_CONFIG = 'tacklists_lists_config_v1';

  // NEW (scope + schedule)
  const API_BASE = 'https://broad-tooth-b8ed.gombcg.workers.dev';
  const DEFAULT_CUSTOMER_ID = 15;
  const DEFAULT_TEAM_ID = 105;
  const STORAGE_KEY_SCOPE = 'tacklists_scope_v1';
  const STORAGE_KEY_SCHEDULE_MY = 'tacklists_schedule_my_v1';

  const LOCALSTORAGE_TEST_KEY = '__tacklists_test__';
  const FETCH_TIMEOUT_MS = 12000;

  // Fallback horse names if horses.json is missing/unreachable
  const HORSE_NAMES = [
    'APOLLO', 'BENTLEY', 'CHARLIE', 'CODY', 'COOPER',
    'DIESEL', 'DUKE', 'FINN', 'GUS', 'HANK',
    'JACK', 'JASPER', 'LEO', 'LUCKY', 'MAVERICK',
    'MAX', 'MILO', 'MOOSE', 'NASH', 'OAKLEY',
    'OLIVER', 'OSCAR', 'OTIS', 'REMY', 'RILEY',
    'ROCCO', 'ROCKY', 'RUSTY', 'SCOUT', 'TUCKER',
    'WALTER', 'WINSTON', 'ZEKE'
  ];

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const headerBack = document.getElementById('header-back');
  const headerTitle = document.getElementById('header-title');
  const headerAction = document.getElementById('header-action');
  const screenRoot = document.getElementById('screen-root');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const state = {
    storageOk: true,

    // data/config
    catalog: null,        // normalized horses catalog
    catalogStatus: 'idle', // idle|loading|ready|error
    listsConfig: null,
    listsStatus: 'idle',   // idle|loading|ready|fallback|error

    // session
    session: null,
    currentScreen: 'start',
    history: [],
    stateFilter: '',

    // NEW (scope + schedule)
    api: {
      customer_id: DEFAULT_CUSTOMER_ID,
      team_id: DEFAULT_TEAM_ID
    },
    scope: null,
    scopeStatus: 'idle',        // idle|loading|ready|error
    scheduleMy: null,
    scheduleMyStatus: 'idle'    // idle|loading|ready|error
  };

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------

  function testStorage() {
    try {
      localStorage.setItem(LOCALSTORAGE_TEST_KEY, '1');
      localStorage.removeItem(LOCALSTORAGE_TEST_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function safeJSONParse(s) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  function loadJSON(key) {
    if (!state.storageOk) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return safeJSONParse(raw);
  }

  function saveJSON(key, value) {
    if (!state.storageOk) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  // kept for backward compatibility if you previously used sessionStorage
  function migrateLegacySessionStorage() {
    if (!state.storageOk) return;
    try {
      const legacy = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (!legacy) return;
      if (!localStorage.getItem(STORAGE_KEY_SESSION)) {
        localStorage.setItem(STORAGE_KEY_SESSION, legacy);
      }
      sessionStorage.removeItem(STORAGE_KEY_SESSION);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  async function fetchJson(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---------------------------------------------------------------------------
  // Catalog (horses.json)
  // ---------------------------------------------------------------------------

  function normalizeCatalogStrict(raw) {
    const out = [];

    if (Array.isArray(raw)) {
      // expected rows: { Horse_Active, horseId, horseName, Barn Name, Horse Name, etc. }
      for (const row of raw) {
        if (!row || typeof row !== 'object') continue;

        const horseId =
          row.horseId != null ? String(row.horseId) :
          row.horse_id != null ? String(row.horse_id) :
          row.Horse_ID != null ? String(row.Horse_ID) :
          null;

        const horseName =
          row.horseName != null ? String(row.horseName) :
          row.horse_name != null ? String(row.horse_name) :
          row['Horse Name'] != null ? String(row['Horse Name']) :
          row.Horse != null ? String(row.Horse) :
          null;

        const barnName =
          row.barnName != null ? String(row.barnName) :
          row['Barn Name'] != null ? String(row['Barn Name']) :
          null;

        const active =
          row.Horse_Active != null ? !!row.Horse_Active :
          row.horse_active != null ? !!row.horse_active :
          true;

        if (!horseName) continue;

        out.push({
          horseId: horseId || horseName.toLowerCase().replace(/\s+/g, '-'),
          horseName,
          barnActive: !!barnName && active
        });
      }
    }

    // fallback if empty
    if (!out.length) {
      for (const name of HORSE_NAMES) {
        out.push({
          horseId: name.toLowerCase(),
          horseName: name,
          barnActive: false
        });
      }
    }

    // sort: barnActive first, then A→Z
    out.sort((a, b) => {
      const af = a.barnActive ? 1 : 0;
      const bf = b.barnActive ? 1 : 0;
      if (af !== bf) return bf - af;
      return a.horseName.localeCompare(b.horseName);
    });

    return out;
  }

  function loadCatalogFromStorage() {
    const wrapped = loadJSON(STORAGE_KEY_CATALOG);
    if (!wrapped || typeof wrapped !== 'object') return null;

    const fetchedAt = Number(wrapped.fetchedAt) || 0;
    if (!fetchedAt) return null;

    // keep cache for 24h
    const age = Date.now() - fetchedAt;
    if (age > 24 * 60 * 60 * 1000) return null;

    const data = wrapped.data;
    if (!Array.isArray(data)) return null;
    return data;
  }

  function saveCatalogToStorage(catalog) {
    return saveJSON(STORAGE_KEY_CATALOG, {
      fetchedAt: Date.now(),
      data: catalog
    });
  }

  async function loadCatalog() {
    if (state.catalogStatus === 'loading') return;

    const cached = loadCatalogFromStorage();
    if (cached) {
      state.catalog = cached;
      state.catalogStatus = 'ready';
      return;
    }

    state.catalogStatus = 'loading';
    try {
      const raw = await fetchJson(HORSES_DATA_URL);
      const catalog = normalizeCatalogStrict(raw);
      state.catalog = catalog;
      state.catalogStatus = 'ready';
      saveCatalogToStorage(catalog);
      // no forced rerender; start screen doesn’t need it immediately
    } catch (_) {
      state.catalog = normalizeCatalogStrict([]);
      state.catalogStatus = 'error';
    }
  }

  // ---------------------------------------------------------------------------
  // Lists config (lists.json)
  // ---------------------------------------------------------------------------

  function buildFallbackLists() {
    return [
      { key: 'state', label: 'Active Horses', inNav: true, inSummary: false },
      { key: 'list1', label: 'Schooling Bridles', inNav: true, inSummary: true },
      { key: 'list2', label: 'Show Bridles', inNav: true, inSummary: true },
      { key: 'list3', label: 'Schooling Girths', inNav: true, inSummary: true },
      { key: 'list4', label: 'Show Girths', inNav: true, inSummary: true },
      { key: 'list5', label: 'Saddles', inNav: true, inSummary: true },
      { key: 'list6', label: 'Trunks', inNav: true, inSummary: true },
      { key: 'list7', label: 'Supplements', inNav: true, inSummary: true },
      { key: 'list8', label: 'Sheets', inNav: true, inSummary: true }
    ];
  }

  function normalizeListsStrict(raw) {
    // Accepts an array of objects like:
    // { key:'list1', label:'Schooling Bridles', inNav:true, inSummary:true }
    if (!Array.isArray(raw)) return null;

    const out = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const key = row.key != null ? String(row.key) : null;
      const label = row.label != null ? String(row.label) : null;
      if (!key || !label) continue;

      out.push({
        key,
        label,
        inNav: row.inNav !== false,
        inSummary: row.inSummary !== false
      });
    }

    if (!out.length) return null;
    return out;
  }

  function loadListsFromStorage() {
    const wrapped = loadJSON(STORAGE_KEY_LISTS_CONFIG);
    if (!wrapped || typeof wrapped !== 'object') return null;

    const fetchedAt = Number(wrapped.fetchedAt) || 0;
    if (!fetchedAt) return null;

    // keep cache for 24h
    const age = Date.now() - fetchedAt;
    if (age > 24 * 60 * 60 * 1000) return null;

    const data = wrapped.data;
    if (!Array.isArray(data)) return null;
    return data;
  }

  function saveListsToStorage(cfg) {
    return saveJSON(STORAGE_KEY_LISTS_CONFIG, {
      fetchedAt: Date.now(),
      data: cfg
    });
  }

  async function loadListsConfig() {
    if (state.listsStatus === 'loading') return;

    const cached = loadListsFromStorage();
    if (cached) {
      state.listsConfig = cached;
      state.listsStatus = 'ready';
      render(); // labels depend on this
      return;
    }

    state.listsStatus = 'loading';
    try {
      const raw = await fetchJson(LISTS_DATA_URL);
      const cfg = normalizeListsStrict(raw) || buildFallbackLists();
      state.listsConfig = cfg;
      state.listsStatus = 'ready';
      saveListsToStorage(cfg);
      render();
    } catch (_) {
      state.listsConfig = buildFallbackLists();
      state.listsStatus = 'error';
      render();
    }
  }

  function getListsConfig() {
    return Array.isArray(state.listsConfig) && state.listsConfig.length
      ? state.listsConfig
      : buildFallbackLists();
  }

  function getListKeys(cfg) {
    return cfg
      .map((d) => d.key)
      .filter((k) => k !== 'state'); // state handled separately
  }

  function isKnownListKey(key) {
    const cfg = getListsConfig();
    return cfg.some((d) => d.key === key && d.key !== 'state');
  }

  function firstListKey() {
    const cfg = getListsConfig();
    const keys = getListKeys(cfg);
    return keys.length ? keys[0] : null;
  }

  function labelForKey(key) {
    const cfg = getListsConfig();
    const d = cfg.find((x) => x.key === key);
    return d ? d.label : key;
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  function nowIso() {
    return new Date().toISOString();
  }

  function touchSessionExpiry() {
    if (!state.session) return;
    state.session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  }

  function updateLastUpdated() {
    if (!state.session) return;
    state.session.lastUpdated = nowIso();
    touchSessionExpiry();
    saveSessionToStorage();
  }

  function createSessionFromCatalog(catalog) {
    const now = nowIso();

    return {
      createdAt: now,
      lastUpdated: now,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      horses: (catalog || []).map((h) => ({
        horseId: h.horseId,
        horseName: h.horseName,
        barnActive: !!h.barnActive,
        state: false,     // active horse toggle
        lists: {}         // listKey -> boolean
      }))
    };
  }

  function saveSessionToStorage() {
    if (!state.session) return false;
    return saveJSON(STORAGE_KEY_SESSION, state.session);
  }

  function loadSessionFromStorage() {
    const s = loadJSON(STORAGE_KEY_SESSION);
    if (!s || typeof s !== 'object') return null;

    const exp = Date.parse(String(s.expiresAt || ''));
    if (!Number.isFinite(exp)) return null;

    if (Date.now() > exp) {
      // expired: clear
      try { localStorage.removeItem(STORAGE_KEY_SESSION); } catch (_) {}
      return null;
    }

    // normalize horses shape
    if (!Array.isArray(s.horses)) s.horses = [];
    for (const h of s.horses) {
      if (!h || typeof h !== 'object') continue;
      if (!h.lists || typeof h.lists !== 'object') h.lists = {};
      if (typeof h.state !== 'boolean') h.state = !!h.state;
      if (typeof h.barnActive !== 'boolean') h.barnActive = !!h.barnActive;
    }

    return s;
  }

  function clearSessionStorage() {
    state.session = null;
    if (!state.storageOk) return;
    try { localStorage.removeItem(STORAGE_KEY_SESSION); } catch (_) {}
  }

  function ensureSession() {
    if (state.session) return;

    const catalog = state.catalog || loadCatalogFromStorage() || normalizeCatalogStrict([]);
    state.session = createSessionFromCatalog(catalog);
    saveSessionToStorage();
  }

  function createNewSession() {
    const catalog = state.catalog || loadCatalogFromStorage() || normalizeCatalogStrict([]);
    state.session = createSessionFromCatalog(catalog);
    saveSessionToStorage();
  }

  function findHorse(horseId) {
    if (!state.session) return null;
    return state.session.horses.find((h) => String(h.horseId) === String(horseId)) || null;
  }

  // ---------------------------------------------------------------------------
  // NEW: Scope + schedule
  // ---------------------------------------------------------------------------

  function yyyymmddFromISODate(iso) {
    const s = String(iso || '').slice(0, 10);
    return s.replace(/-/g, '');
  }

  function loadScopeFromStorage() {
    const s = loadJSON(STORAGE_KEY_SCOPE);
    if (!s || typeof s !== 'object') return null;
    return s;
  }

  function saveScopeToStorage(scopeObj) {
    return saveJSON(STORAGE_KEY_SCOPE, scopeObj);
  }

  function loadScheduleMyFromStorage() {
    const s = loadJSON(STORAGE_KEY_SCHEDULE_MY);
    if (!s || typeof s !== 'object') return null;
    return s;
  }

  function saveScheduleMyToStorage(obj) {
    return saveJSON(STORAGE_KEY_SCHEDULE_MY, obj);
  }

  function buildScopeFromRingPayload(payload) {
    const tz = (payload && payload.time_zone_date_time && typeof payload.time_zone_date_time === 'object')
      ? payload.time_zone_date_time
      : {};

    const showIdRaw =
      payload?.show_id ??
      payload?.show?.show_id ??
      payload?.shows?.show_id ??
      null;

    const show_id = Number(showIdRaw) || null;

    const show_date =
      (payload?.show_date ? String(payload.show_date) : '') ||
      (payload?.show?.show_date ? String(payload.show.show_date) : '') ||
      (tz?.sql_date ? String(tz.sql_date) : '');

    const showDateISO = show_date ? String(show_date).slice(0, 10) : null;

    const now_sql_date = tz?.sql_date ? String(tz.sql_date).slice(0, 10) : null;
    const now_time = tz?.time ? String(tz.time) : null;

    const dayKeyDate = showDateISO || now_sql_date;
    const show_key = show_id ? String(show_id) : null;
    const show_day_key = (show_id && dayKeyDate) ? `${show_id}-${yyyymmddFromISODate(dayKeyDate)}` : null;

    const scope = {
      show_id,
      show_date: showDateISO,
      now_sql_date,
      now_time,
      show_key,
      show_day_key,
      customer_id: state.api.customer_id,
      team_id: state.api.team_id,
      ring_url: `${API_BASE}/ring?customer_id=${encodeURIComponent(String(state.api.customer_id))}`,
      schedule_my_url:
        (show_id && dayKeyDate)
          ? `${API_BASE}/schedule/my?date=${encodeURIComponent(dayKeyDate)}&show_id=${encodeURIComponent(String(show_id))}&customer_id=${encodeURIComponent(String(state.api.customer_id))}&team_id=${encodeURIComponent(String(state.api.team_id))}`
          : null,
      fetched_at: nowIso()
    };

    return scope;
  }

  async function loadScope() {
    if (state.scopeStatus === 'loading') return;

    state.scopeStatus = 'loading';
    render();

    try {
      const url = `${API_BASE}/ring?customer_id=${encodeURIComponent(String(state.api.customer_id))}`;
      const payload = await fetchJson(url);
      const scope = buildScopeFromRingPayload(payload);

      if (!scope.show_id || !scope.show_date) {
        throw new Error('Could not determine show_id/show_date from ring payload');
      }

      state.scope = scope;
      state.scopeStatus = 'ready';
      saveScopeToStorage(scope);
      render();
    } catch (_) {
      state.scopeStatus = 'error';
      render();
    }
  }

  async function loadScheduleMy() {
    if (state.scheduleMyStatus === 'loading') return;

    // need scope first
    if (!state.scope || !state.scope.show_id || !state.scope.show_date) {
      await loadScope();
    }
    if (!state.scope || !state.scope.schedule_my_url) return;

    state.scheduleMyStatus = 'loading';
    render();

    try {
      const payload = await fetchJson(state.scope.schedule_my_url);
      const wrapped = {
        fetched_at: nowIso(),
        scope: {
          show_id: state.scope.show_id,
          show_date: state.scope.show_date,
          customer_id: state.scope.customer_id,
          team_id: state.scope.team_id
        },
        data: payload
      };

      state.scheduleMy = wrapped;
      state.scheduleMyStatus = 'ready';
      saveScheduleMyToStorage(wrapped);
      render();
    } catch (_) {
      state.scheduleMyStatus = 'error';
      render();
    }
  }

  async function copyToClipboard(text) {
    const s = String(text ?? '');
    if (!s) return false;

    try {
      await navigator.clipboard.writeText(s);
      return true;
    } catch (_) {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  function formatTimeShort(iso) {
    const t = Date.parse(String(iso || ''));
    if (!Number.isFinite(t)) return null;
    try {
      return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (_) {
      return null;
    }
  }

  function horseLabel(horse) {
    // No auto-select.
    return horse.horseName + (horse.barnActive ? ' 🏷️' : '');
  }

  // groupby barnActive (A→Z) then others (A→Z)
  function sortBarnActiveThenName(list) {
    return list.slice().sort((a, b) => {
      const af = a.barnActive ? 1 : 0;
      const bf = b.barnActive ? 1 : 0;
      if (af !== bf) return bf - af; // true first
      return a.horseName.localeCompare(b.horseName);
    });
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

  // ---------------------------------------------------------------------------
  // Navigation / routing
  // ---------------------------------------------------------------------------

  function parseListScreen(scr) {
    const s = String(scr || '');
    const m = s.match(/^(list\d+)(Detail)?$/);
    if (!m) return null;
    return {
      key: m[1],
      isDetail: !!m[2]
    };
  }

  function setScreen(newScreen, pushHistory = true) {
    if (pushHistory && state.currentScreen && state.currentScreen !== newScreen) {
      state.history.push(state.currentScreen);
    }
    state.currentScreen = newScreen;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    state.currentScreen = prev || 'start';
    render();
  }

  function handleListPrevNext(direction) {
    const p = parseListScreen(state.currentScreen);
    if (!p) return;

    const cfg = getListsConfig();
    const listKeys = getListKeys(cfg);
    const idx = listKeys.indexOf(p.key);
    if (idx === -1) return;

    if (direction === 'prev' && idx > 0) {
      setScreen(listKeys[idx - 1]);
    } else if (direction === 'next') {
      if (idx < listKeys.length - 1) setScreen(listKeys[idx + 1]);
      else setScreen('summary');
    }
  }

  function titleForScreen(scr) {
    const s = String(scr || '');
    if (s === 'start') return 'Start';
    if (s === 'summary') return 'Summary';
    if (s === 'share') return 'Share';

    if (s === 'state') return labelForKey('state');

    const p = parseListScreen(s);
    if (p && isKnownListKey(p.key)) {
      const base = labelForKey(p.key) || p.key;
      return p.isDetail ? `${base} Detail` : base;
    }

    return '';
  }

  // ---------------------------------------------------------------------------
  // Header / nav rendering
  // ---------------------------------------------------------------------------

  function renderHeader() {
    const scr = state.currentScreen;
    headerTitle.textContent = titleForScreen(scr);

    const hideBack = state.history.length === 0 && scr === 'start';
    headerBack.style.visibility = hideBack ? 'hidden' : 'visible';

    const p = parseListScreen(scr);
    const isListScreen = !!(p && isKnownListKey(p.key));

    if (scr === 'summary') {
      headerAction.hidden = false;
      headerAction.textContent = 'Text';
      headerAction.dataset.action = 'go-share';
    } else if (scr === 'state') {
      headerAction.hidden = false;
      headerAction.textContent = 'Next';
      headerAction.dataset.action = 'go-first-list';
    } else if (isListScreen && !p.isDetail) {
      headerAction.hidden = false;
      headerAction.textContent = 'Next';
      headerAction.dataset.action = 'next-list';
    } else {
      headerAction.hidden = true;
      headerAction.textContent = '';
      headerAction.dataset.action = '';
    }
  }

  function renderNav() {
    if (!navRow) return;

    // active highlighting
    const btns = navRow.querySelectorAll('.nav-btn');
    btns.forEach((b) => {
      const key = b.dataset.screen;
      if (!key) return;
      if (key === state.currentScreen) b.classList.add('nav-btn--primary');
      else b.classList.remove('nav-btn--primary');
    });

    if (!state.session) {
      // reset counters
      const aggs = navRow.querySelectorAll('[data-nav-agg]');
      aggs.forEach((a) => {
        a.textContent = '0';
        a.classList.remove('nav-agg--positive');
      });
      return;
    }

    const listDefs = getListsConfig().filter((d) => d.key !== 'state' && d.inNav !== false);
    const activeCount = state.session.horses.filter((h) => h.state).length;

    const listCounts = {};
    for (const d of listDefs) {
      const k = d.key;
      listCounts[k] = state.session.horses.filter((h) => h.state && h.lists && h.lists[k]).length;
    }

    function setAgg(key, value) {
      const el = navRow.querySelector(`[data-nav-agg="${key}"]`);
      if (!el) return;
      const n = Number(value) || 0;
      el.textContent = String(n);
      if (n > 0) el.classList.add('nav-agg--positive');
      else el.classList.remove('nav-agg--positive');
    }

    setAgg('state', activeCount);

    for (const d of listDefs) {
      setAgg(d.key, listCounts[d.key] || 0);
    }

    const summaryListDefs = listDefs.filter((d) => d.inSummary !== false);
    const listsWithAny = summaryListDefs
      .map((d) => listCounts[d.key] || 0)
      .filter((c) => c > 0).length;

    setAgg('summary', listsWithAny);
  }

  // ---------------------------------------------------------------------------
  // Screen handlers
  // ---------------------------------------------------------------------------

  function handleStateHorseClick(horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;
    horse.state = !horse.state;

    // if turned off, clear list memberships
    if (!horse.state && horse.lists && typeof horse.lists === 'object') {
      Object.keys(horse.lists).forEach((k) => { horse.lists[k] = false; });
    }

    updateLastUpdated();
    render();
  }

  function toggleListMembership(listKey, horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;
    if (!horse.state) return;

    if (!horse.lists || typeof horse.lists !== 'object') horse.lists = {};
    horse.lists[listKey] = !horse.lists[listKey];

    updateLastUpdated();
    render();
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  function renderStartScreen() {
    screenRoot.innerHTML = '';

    const logo = document.createElement('div');
    logo.className = 'start-logo';
    logo.innerHTML = `
      <div class="start-logo-mark">
        <img src="tacklists.png" class="start-logo-img" alt="TackLists.com logo" />
      </div>
      <div class="start-logo-text">
        <div class="start-logo-title">${APP_TITLE}</div>
        <div class="start-logo-subtitle">${APP_SUBTITLE}</div>
      </div>
    `;
    screenRoot.appendChild(logo);

    const hasSession = !!state.session;

    // Scope rows appear on start screen regardless of session
    const scopeTag = state.scopeStatus === 'loading' ? '…' : (state.scope ? 'ON' : '');
    createRow('Load scope (ring)', {
      tagVariant: 'boolean',
      tagPositive: !!state.scope,
      tagText: scopeTag || null,
      onClick: () => loadScope()
    });

    const scheduleCount =
      state.scheduleMy?.data?.entries && Array.isArray(state.scheduleMy.data.entries)
        ? state.scheduleMy.data.entries.length
        : null;

    createRow('Load schedule (my)', {
      tagVariant: scheduleCount != null ? 'count' : 'boolean',
      tagPositive: (scheduleCount != null && scheduleCount > 0) || false,
      tagText: scheduleCount != null ? String(scheduleCount) : (state.scheduleMyStatus === 'loading' ? '…' : null),
      onClick: () => loadScheduleMy()
    });

    if (state.scope) {
      createRow('Copy scope JSON', {
        tagVariant: 'boolean',
        tagPositive: true,
        onClick: async () => {
          await copyToClipboard(JSON.stringify(state.scope, null, 2));
        }
      });
    }

    if (!hasSession) {
      createRow('New session', {
        tagVariant: 'boolean',
        tagPositive: false,
        onClick: () => {
          clearSessionStorage();
          createNewSession();
          setScreen('state');
        }
      });

      const note = document.createElement('div');
      note.style.margin = '10px 10px 0';
      note.style.fontSize = '12px';
      note.style.color = 'rgba(209, 213, 219, 0.9)';
      note.style.lineHeight = '1.35';
      note.textContent = state.storageOk
        ? 'Autosave: ON (device). Expires after 12 hours of inactivity.'
        : 'Autosave: OFF (storage blocked in this browser).';
      screenRoot.appendChild(note);

      return;
    }

    const horses = state.session.horses;
    const activeCount = horses.filter((h) => h.state).length;

    createRow('In-session', {
      active: true,
      tagVariant: 'boolean',
      tagPositive: true,
      onClick: () => setScreen('state')
    });

    createRow('Summary', {
      tagVariant: 'boolean',
      tagPositive: activeCount > 0,
      onClick: () => setScreen('summary')
    });

    createRow('Restart session', {
      tagVariant: 'boolean',
      tagPositive: false,
      onClick: () => {
        clearSessionStorage();
        createNewSession();
        setScreen('state');
      }
    });

    // Start screen only: simple text under Restart (NOT a pill row)
    const lastSavedIso = state.session.lastUpdated || state.session.createdAt;
    const lastSaved = formatTimeShort(lastSavedIso);
    const expires = formatTimeShort(state.session.expiresAt);

    const note = document.createElement('div');
    note.style.margin = '10px 10px 0';
    note.style.fontSize = '12px';
    note.style.color = 'rgba(209, 213, 219, 0.9)';
    note.style.lineHeight = '1.35';

    if (!state.storageOk) {
      note.textContent = 'Autosave: OFF (storage blocked in this browser).';
    } else {
      const parts = [];
      parts.push('Autosave: ON (device).');
      if (lastSaved) parts.push(`Last saved: ${lastSaved}.`);
      if (expires) parts.push(`Expires: ${expires}.`);

      if (state.scope?.show_id && state.scope?.show_date) {
        parts.push(`Scope: show_id ${state.scope.show_id}, show_date ${state.scope.show_date}.`);
      }

      note.textContent = parts.join(' ');
    }

    screenRoot.appendChild(note);
  }

  function renderStateScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'state-search';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'state-search-input';
    searchInput.placeholder = 'Filter horses…';
    searchInput.value = state.stateFilter || '';
    searchInput.addEventListener('input', () => {
      state.stateFilter = searchInput.value || '';
      render();
    });

    searchWrap.appendChild(searchInput);
    screenRoot.appendChild(searchWrap);

    const sorted = sortBarnActiveThenName(state.session.horses);

    const term = (state.stateFilter || '').trim().toLowerCase();
    const filtered = term
      ? sorted.filter((h) => h.horseName.toLowerCase().includes(term))
      : sorted;

    const active = filtered.filter((h) => h.state);
    const inactive = filtered.filter((h) => !h.state);

    if (!active.length && !inactive.length) {
      createRow('No horses found.', {});
      return;
    }

    if (active.length) {
      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Active';
      screenRoot.appendChild(label);

      active.forEach((horse) => {
        createRow(horseLabel(horse), {
          active: true,
          tagVariant: 'boolean',
          tagPositive: true,
          onClick: () => handleStateHorseClick(horse.horseId)
        });
      });
    }

    if (inactive.length) {
      if (active.length) {
        const divider = document.createElement('div');
        divider.className = 'list-group-divider';
        screenRoot.appendChild(divider);
      }

      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Inactive';
      screenRoot.appendChild(label);

      inactive.forEach((horse) => {
        createRow(horseLabel(horse), {
          tagVariant: 'boolean',
          tagPositive: false,
          onClick: () => handleStateHorseClick(horse.horseId)
        });
      });
    }
  }

  function renderListGrouped(listKey) {
    ensureSession();
    screenRoot.innerHTML = '';

    const activeStateHorses = sortBarnActiveThenName(
      state.session.horses.filter((h) => h.state)
    );

    if (activeStateHorses.length === 0) {
      createRow('No active horses.', {});
      return;
    }

    const packed = activeStateHorses.filter((h) => h.lists && h.lists[listKey]);
    const notPacked = activeStateHorses.filter((h) => !(h.lists && h.lists[listKey]));

    if (packed.length) {
      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Packed';
      screenRoot.appendChild(label);

      packed.forEach((horse) => {
        createRow(horseLabel(horse), {
          active: true,
          tagVariant: 'boolean',
          tagPositive: true,
          onClick: () => toggleListMembership(listKey, horse.horseId)
        });
      });
    }

    if (notPacked.length) {
      if (packed.length) {
        const divider = document.createElement('div');
        divider.className = 'list-group-divider';
        screenRoot.appendChild(divider);
      }

      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Not packed';
      screenRoot.appendChild(label);

      notPacked.forEach((horse) => {
        createRow(horseLabel(horse), {
          tagVariant: 'boolean',
          tagPositive: false,
          onClick: () => toggleListMembership(listKey, horse.horseId)
        });
      });
    }
  }

  function renderListDetail(listKey) {
    ensureSession();
    screenRoot.innerHTML = '';

    const activeStateHorses = sortBarnActiveThenName(
      state.session.horses.filter((h) => h.state)
    );

    if (activeStateHorses.length === 0) {
      createRow('No active horses.', {});
      return;
    }

    activeStateHorses.forEach((horse) => {
      const checked = !!(horse.lists && horse.lists[listKey]);
      createRow(horseLabel(horse), {
        active: checked,
        tagVariant: 'boolean',
        tagPositive: checked,
        onClick: () => toggleListMembership(listKey, horse.horseId)
      });
    });
  }

  function renderListScreen(screenKey) {
    const p = parseListScreen(screenKey);
    if (!p) return;

    if (p.isDetail) {
      renderListDetail(p.key);
    } else {
      renderListGrouped(p.key);
    }
  }

  function buildShareText() {
    if (!state.session) return '';

    const cfg = getListsConfig();
    const activeHorses = sortBarnActiveThenName(state.session.horses.filter((h) => h.state));
    const listDefs = cfg.filter((d) => d.key !== 'state' && d.inSummary !== false);

    const lines = [];
    lines.push(`${APP_TITLE}`);
    lines.push('');

    if (state.scope?.show_id && state.scope?.show_date) {
      lines.push(`Show: ${state.scope.show_id} (${state.scope.show_date})`);
      lines.push('');
    }

    if (!activeHorses.length) {
      lines.push('No active horses selected.');
      return lines.join('\n');
    }

    lines.push(`Active horses (${activeHorses.length}):`);
    for (const h of activeHorses) lines.push(`- ${h.horseName}`);
    lines.push('');

    for (const d of listDefs) {
      const k = d.key;
      const packed = activeHorses.filter((h) => h.lists && h.lists[k]).map((h) => h.horseName);
      if (!packed.length) continue;

      lines.push(`${d.label}:`);
      for (const name of packed) lines.push(`- ${name}`);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  function renderSummaryScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const cfg = getListsConfig();
    const listDefs = cfg.filter((d) => d.key !== 'state' && d.inSummary !== false);
    const activeHorses = state.session.horses.filter((h) => h.state);

    createRow(`Active horses`, {
      tagVariant: 'count',
      tagPositive: activeHorses.length > 0,
      tagText: String(activeHorses.length),
      onClick: () => setScreen('state')
    });

    const listCounts = {};
    for (const d of listDefs) {
      listCounts[d.key] = activeHorses.filter((h) => h.lists && h.lists[d.key]).length;
    }

    for (const d of listDefs) {
      const c = listCounts[d.key] || 0;
      createRow(d.label, {
        tagVariant: 'count',
        tagPositive: c > 0,
        tagText: String(c),
        onClick: () => setScreen(`${d.key}Detail`)
      });
    }

    createRow('Text / share', {
      tagVariant: 'boolean',
      tagPositive: activeHorses.length > 0,
      onClick: () => setScreen('share')
    });
  }

  function renderShareScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const txt = buildShareText();

    const box = document.createElement('div');
    box.className = 'share-box';
    box.textContent = txt;
    screenRoot.appendChild(box);

    createRow('Copy to clipboard', {
      tagVariant: 'boolean',
      tagPositive: true,
      onClick: async () => {
        await copyToClipboard(txt);
      }
    });

    const smsLink = document.createElement('a');
    smsLink.className = 'share-sms';
    smsLink.href = `sms:&body=${encodeURIComponent(txt)}`;
    smsLink.textContent = 'Open Messages (SMS)';
    smsLink.rel = 'noopener';
    smsLink.target = '_blank';
    screenRoot.appendChild(smsLink);
  }

  function render() {
    renderHeader();
    renderNav();

    const scr = state.currentScreen;

    if (scr === 'start') {
      renderStartScreen();
      return;
    }
    if (scr === 'state') {
      renderStateScreen();
      return;
    }
    if (scr === 'summary') {
      renderSummaryScreen();
      return;
    }
    if (scr === 'share') {
      renderShareScreen();
      return;
    }

    const p = parseListScreen(scr);
    if (p && isKnownListKey(p.key)) {
      renderListScreen(scr);
      return;
    }

    // fallback
    state.currentScreen = 'start';
    renderStartScreen();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  headerBack.addEventListener('click', () => {
    if (headerBack.style.visibility === 'hidden') return;
    goBack();
  });

  headerAction.addEventListener('click', () => {
    const action = headerAction.dataset.action;

    if (state.currentScreen === 'summary' && action === 'go-share') {
      setScreen('share');
      return;
    }

    if (action === 'go-first-list') {
      ensureSession();
      const first = firstListKey();
      if (first) setScreen(first);
      else setScreen('summary');
      return;
    }

    if (action === 'next-list') {
      handleListPrevNext('next');
    }
  });

  if (navRow) {
    navRow.addEventListener('click', (evt) => {
      const btn = evt.target.closest('.nav-btn');
      if (!btn) return;

      const key = btn.dataset.screen;
      if (!key) return;

      if (key === 'start') {
        setScreen('start');
        return;
      }

      if (key === 'state') {
        ensureSession();
        setScreen('state');
        return;
      }

      if (key === 'summary') {
        ensureSession();
        setScreen('summary');
        return;
      }

      if (String(key).startsWith('list')) {
        ensureSession();
        const hasActive = state.session.horses.some((h) => h.state);
        if (!hasActive) setScreen('state');
        else if (isKnownListKey(key)) setScreen(key);
        else setScreen('summary');
        return;
      }
    });
  }

  // Extra safety: persist on tab hide/close (no state changes, just a save)
  window.addEventListener('pagehide', () => {
    saveSessionToStorage();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveSessionToStorage();
    }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  state.storageOk = testStorage();
  migrateLegacySessionStorage();

  // Seed lists config synchronously so session load can normalize list keys
  state.listsConfig = loadListsFromStorage() || buildFallbackLists();
  state.listsStatus = (Array.isArray(state.listsConfig) && state.listsConfig.length) ? 'ready' : 'fallback';

  // NEW: load prior scope/schedule if present
  state.scope = loadScopeFromStorage();
  state.scopeStatus = state.scope ? 'ready' : 'idle';

  state.scheduleMy = loadScheduleMyFromStorage();
  state.scheduleMyStatus = state.scheduleMy ? 'ready' : 'idle';

  state.session = loadSessionFromStorage();

  // If we resumed a valid session, extend TTL for another 12 hours (no lastUpdated change)
  if (state.session) {
    touchSessionExpiry();
    saveSessionToStorage();
  }

  render();

  // background loads
  loadListsConfig();
  loadCatalog(); // background (used for New/Restart)
})();
