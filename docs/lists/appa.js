// app.js
// TackLists.com – mobile horse tack lists
// Session persists in localStorage (survives tab close / refresh).
// Session expires 12 hours after last save (sliding TTL).
// Only New session and Restart session force a fresh session.
//
// Lists are now data-driven via: /data/lists.json
//   - state list: { key:"state", type:"state" } maps to horse.state
//   - list lists:  { key:"list1", type:"list" } maps to horse.lists[listKey]

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Paths / storage keys
  // ---------------------------------------------------------------------------

  // docs/lists/data/horses.json
  const HORSES_DATA_URL = './data/horses.json';

  // docs/lists/data/lists.json
  const LISTS_DATA_URL = './data/lists.json';

  const STORAGE_KEY_SESSION = 'tacklists_session_v1';
  const STORAGE_KEY_CATALOG = 'tacklists_horses_catalog_v1';
  const STORAGE_KEY_LISTS = 'tacklists_lists_catalog_v1';

  // 12-hour TTL
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 43200000
  const SESSION_COOKIE_NAME = 'tacklists_session';
  const SESSION_COOKIE_MAX_AGE = 12 * 60 * 60; // 43200 seconds

  // ---------------------------------------------------------------------------
  // Fallback (hardcoded) lists + horses — kept as backup
  // ---------------------------------------------------------------------------

  const HORSE_NAMES = [
    "Cervin","Charly","Coin","Darcy","Dino","Dottie","Doug","Elliot","Gaston","Indy",
    "Kenny","King","Knox","Krypton","Lenny","Maiki","Milo","Minute","Navy","Oddur",
    "Orion","Paisley","Pedro","Peri","Q","Rimini","Star","Tank","Titan","Zen",
    "Munster","Bernie","Hurricane","Winnie","Caymus","BB"
  ];

  // Fallback lists (used only if lists.json is missing/unavailable)
  const FALLBACK_LISTS = [
    { key: 'state', label: 'Active Horses', type: 'state', inNav: true, inSummary: true, inShare: true },
    { key: 'list1', label: 'Schooling Bridles', type: 'list', inNav: true, inSummary: true, inShare: true },
    { key: 'list2', label: 'Show Bridles', type: 'list', inNav: true, inSummary: true, inShare: true },
    { key: 'list3', label: 'Schooling Girths', type: 'list', inNav: true, inSummary: true, inShare: true },
    { key: 'list4', label: 'Show Girths', type: 'list', inNav: true, inSummary: true, inShare: true },
    { key: 'list5', label: 'Saddles', type: 'list', inNav: true, inSummary: true, inShare: true },
    { key: 'list6', label: 'Trunks', type: 'list', inNav: true, inSummary: true, inShare: true },
    { key: 'list7', label: 'Supplements', type: 'list', inNav: true, inSummary: true, inShare: true },
    { key: 'list8', label: 'Sheets', type: 'list', inNav: true, inSummary: true, inShare: true }
  ];

  // ---------------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------------

  const state = {
    session: null,
    currentScreen: 'start',
    history: [],
    stateFilter: '',

    // Catalog used ONLY when creating a new session (or restarting)
    catalog: null,
    catalogStatus: 'loading', // 'loading' | 'ready' | 'fallback'

    // Lists config (drives list screens, labels, counts)
    listsConfig: null,
    listsStatus: 'loading', // 'loading' | 'ready' | 'fallback'

    // storage health (for start-screen note)
    storageOk: true
  };

  // ---------------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------------

  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const screenRoot = document.getElementById('screen-root');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // Storage + cookie helpers
  // ---------------------------------------------------------------------------

  function nowMs() {
    return Date.now();
  }

  function safeJSONParse(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      state.storageOk = true;
      return true;
    } catch (_) {
      state.storageOk = false;
      return false;
    }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function setSessionCookie() {
    try {
      document.cookie = `${SESSION_COOKIE_NAME}=1; Max-Age=${SESSION_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    } catch (_) {}
  }

  function clearSessionCookie() {
    try {
      document.cookie = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
    } catch (_) {}
  }

  function touchSessionExpiry() {
    if (!state.session) return;
    state.session.expiresAt = new Date(nowMs() + SESSION_TTL_MS).toISOString();
  }

  function isExpired(expiresAt) {
    if (!expiresAt) return false;
    const t = Date.parse(String(expiresAt));
    if (!Number.isFinite(t)) return false;
    return t <= nowMs();
  }

  // Migrate legacy sessionStorage -> localStorage (one-time, best-effort)
  function migrateLegacySessionStorage() {
    try {
      const legacySession = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (legacySession && !storageGet(STORAGE_KEY_SESSION)) {
        storageSet(STORAGE_KEY_SESSION, legacySession);
      }
      if (legacySession) sessionStorage.removeItem(STORAGE_KEY_SESSION);

      const legacyCatalog = sessionStorage.getItem(STORAGE_KEY_CATALOG);
      if (legacyCatalog && !storageGet(STORAGE_KEY_CATALOG)) {
        storageSet(STORAGE_KEY_CATALOG, legacyCatalog);
      }
      if (legacyCatalog) sessionStorage.removeItem(STORAGE_KEY_CATALOG);

      const legacyLists = sessionStorage.getItem(STORAGE_KEY_LISTS);
      if (legacyLists && !storageGet(STORAGE_KEY_LISTS)) {
        storageSet(STORAGE_KEY_LISTS, legacyLists);
      }
      if (legacyLists) sessionStorage.removeItem(STORAGE_KEY_LISTS);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Lists config (lists.json)
  // ---------------------------------------------------------------------------

  function buildFallbackLists() {
    return FALLBACK_LISTS.slice();
  }

  function normalizeListsStrict(raw) {
    if (!Array.isArray(raw)) return [];

    const out = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;

      const key = String(row.key || '').trim();
      const label = String(row.label || '').trim();
      if (!key || !label) continue;

      const type = row.type === 'state' ? 'state' : 'list';

      out.push({
        key,
        label,
        type,
        inNav: row.inNav !== false,
        inSummary: row.inSummary !== false,
        inShare: row.inShare !== false
      });
    }

    // Ensure we always have a state definition (minimum)
    const hasState = out.some((d) => d.key === 'state' || d.type === 'state');
    if (!hasState) {
      out.unshift({
        key: 'state',
        label: 'Active Horses',
        type: 'state',
        inNav: true,
        inSummary: true,
        inShare: true
      });
    }

    return out;
  }

  function loadListsFromStorage() {
    const raw = storageGet(STORAGE_KEY_LISTS);
    if (!raw) return null;

    const parsed = safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.items)) return null;

    const items = normalizeListsStrict(parsed.items);
    return items.length ? items : null;
  }

  function saveListsToStorage(items) {
    if (!Array.isArray(items) || !items.length) return;
    storageSet(
      STORAGE_KEY_LISTS,
      JSON.stringify({ savedAt: new Date().toISOString(), items })
    );
  }

  function getListsConfig() {
    if (Array.isArray(state.listsConfig) && state.listsConfig.length) return state.listsConfig;
    return buildFallbackLists();
  }

  function getStateDef(cfg) {
    return cfg.find((d) => d.type === 'state' || d.key === 'state') || {
      key: 'state',
      label: 'Active Horses',
      type: 'state',
      inNav: true,
      inSummary: true,
      inShare: true
    };
  }

  function getListDefs(cfg) {
    // "list" type only; preserve config order
    return cfg.filter((d) => d && d.type === 'list' && String(d.key || '').startsWith('list'));
  }

  function getListKeys(cfg) {
    return getListDefs(cfg).map((d) => d.key);
  }

  function getLabelMap(cfg) {
    const map = {};
    for (const d of cfg) {
      if (d && d.key) map[d.key] = d.label;
    }
    return map;
  }

  function labelForKey(key) {
    const k = String(key || '');
    if (k === 'start') return 'Start';
    if (k === 'summary') return 'Summary';
    if (k === 'share') return 'Share';

    const cfg = getListsConfig();
    const map = getLabelMap(cfg);
    return map[k] || '';
  }

  function parseListScreen(scr) {
    const s = String(scr || '');
    if (!s.startsWith('list')) return null;
    const isDetail = s.endsWith('Detail');
    const key = isDetail ? s.slice(0, -6) : s; // remove "Detail"
    return { key, isDetail };
  }

  function isKnownListKey(key) {
    const cfg = getListsConfig();
    const keys = getListKeys(cfg);
    return keys.includes(String(key || ''));
  }

  function firstListKey() {
    const cfg = getListsConfig();
    const keys = getListKeys(cfg);
    return keys.length ? keys[0] : null;
  }

  function normalizeSessionListsToConfig() {
    if (!state.session || !Array.isArray(state.session.horses)) return;

    const cfg = getListsConfig();
    const listKeys = getListKeys(cfg);

    let changed = false;

    for (const h of state.session.horses) {
      if (!h || typeof h !== 'object') continue;

      if (!h.lists || typeof h.lists !== 'object') {
        h.lists = {};
        changed = true;
      }

      for (const k of listKeys) {
        const before = !!h.lists[k];
        if (!(k in h.lists)) {
          h.lists[k] = false;
          changed = true;
        } else {
          h.lists[k] = before;
        }
      }
    }

    if (changed) {
      // Save without modifying lastUpdated
      saveSessionToStorage();
    }
  }

  async function loadListsConfig() {
    const cached = loadListsFromStorage();
    if (cached && cached.length) {
      state.listsConfig = cached;
      state.listsStatus = 'ready';
      normalizeSessionListsToConfig();
      render();

      // silent background refresh
      try {
        const res = await fetch(LISTS_DATA_URL, { cache: 'no-store' });
        if (res && res.ok) {
          const raw = await res.json();
          const fresh = normalizeListsStrict(raw);
          if (fresh.length) {
            state.listsConfig = fresh;
            state.listsStatus = 'ready';
            saveListsToStorage(fresh);
            normalizeSessionListsToConfig();

            // if user is on a now-missing list screen, send to summary
            const p = parseListScreen(state.currentScreen);
            if (p && !isKnownListKey(p.key)) state.currentScreen = 'summary';

            render();
          }
        }
      } catch (_) {}
      return;
    }

    try {
      const res = await fetch(LISTS_DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const raw = await res.json();
      const items = normalizeListsStrict(raw);

      if (items.length) {
        state.listsConfig = items;
        state.listsStatus = 'ready';
        saveListsToStorage(items);
        normalizeSessionListsToConfig();
        render();
        return;
      }
      throw new Error('empty');
    } catch (_) {
      state.listsConfig = buildFallbackLists();
      state.listsStatus = 'fallback';
      saveListsToStorage(state.listsConfig);
      normalizeSessionListsToConfig();
      render();
    }
  }

  // ---------------------------------------------------------------------------
  // Session storage (localStorage)
  // ---------------------------------------------------------------------------

  function loadSessionFromStorage() {
    const raw = storageGet(STORAGE_KEY_SESSION);
    if (!raw) return null;

    const parsed = safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.horses)) return null;

    // If expired, treat as no session.
    if (parsed.expiresAt && isExpired(parsed.expiresAt)) {
      storageRemove(STORAGE_KEY_SESSION);
      clearSessionCookie();
      return null;
    }

    const cfg = getListsConfig();
    const listKeys = getListKeys(cfg);

    const horses = parsed.horses
      .filter((h) => h && typeof h === 'object')
      .map((h) => {
        const lists = {};
        for (const k of listKeys) {
          lists[k] = !!(h.lists && h.lists[k]);
        }

        return {
          horseId: String(h.horseId || ''),
          horseName: String(h.horseName || '').trim(),
          barnActive: !!h.barnActive,
          state: !!h.state,
          lists
        };
      })
      .filter((h) => h.horseId && h.horseName);

    if (!horses.length) return null;

    return {
      sessionId: String(parsed.sessionId || nowMs()),
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      lastUpdated: parsed.lastUpdated ? String(parsed.lastUpdated) : null,
      expiresAt: parsed.expiresAt ? String(parsed.expiresAt) : null,
      horses
    };
  }

  function saveSessionToStorage() {
    if (!state.session) return;
    const ok = storageSet(STORAGE_KEY_SESSION, JSON.stringify(state.session));
    if (ok) setSessionCookie();
  }

  function clearSessionStorage() {
    storageRemove(STORAGE_KEY_SESSION);
    clearSessionCookie();
  }

  // ---------------------------------------------------------------------------
  // Catalog storage (localStorage)
  // ---------------------------------------------------------------------------

  function loadCatalogFromStorage() {
    const raw = storageGet(STORAGE_KEY_CATALOG);
    if (!raw) return null;

    const parsed = safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.items)) return null;

    const items = parsed.items
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        horseName: String(x.horseName || '').trim(),
        barnActive: !!x.barnActive
      }))
      .filter((x) => x.horseName);

    return items.length ? items : null;
  }

  function saveCatalogToStorage(items) {
    if (!Array.isArray(items) || !items.length) return;
    storageSet(
      STORAGE_KEY_CATALOG,
      JSON.stringify({ savedAt: new Date().toISOString(), items })
    );
  }

  // ---------------------------------------------------------------------------
  // Catalog normalization (horses.json -> [{ horseName, barnActive }])
  // Barn Name + Horse_Active only
  // ---------------------------------------------------------------------------

  function buildFallbackCatalog() {
    return HORSE_NAMES
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .map((horseName) => ({ horseName, barnActive: false }));
  }

  function normalizeCatalogStrict(raw) {
    if (!Array.isArray(raw)) return [];

    const out = [];
    for (const row of raw) {
      const barnName = row && row['Barn Name'];
      const horseName = String(barnName || '').trim();
      if (!horseName) continue;

      out.push({
        horseName,
        barnActive: row && row.Horse_Active === true
      });
    }
    return out;
  }

  async function loadCatalog() {
    const cached = loadCatalogFromStorage();
    if (cached && cached.length) {
      state.catalog = cached;
      state.catalogStatus = 'ready';
      render();

      // silent background refresh
      try {
        const res = await fetch(HORSES_DATA_URL, { cache: 'no-store' });
        if (res && res.ok) {
          const raw = await res.json();
          const fresh = normalizeCatalogStrict(raw);
          if (fresh.length) {
            state.catalog = fresh;
            state.catalogStatus = 'ready';
            saveCatalogToStorage(fresh);
            render();
          }
        }
      } catch (_) {}
      return;
    }

    try {
      const res = await fetch(HORSES_DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const raw = await res.json();
      const items = normalizeCatalogStrict(raw);

      if (items.length) {
        state.catalog = items;
        state.catalogStatus = 'ready';
        saveCatalogToStorage(items);
        render();
        return;
      }
      throw new Error('empty');
    } catch (_) {
      state.catalog = buildFallbackCatalog();
      state.catalogStatus = 'fallback';
      saveCatalogToStorage(state.catalog);
      render();
    }
  }

  function getCatalog() {
    if (Array.isArray(state.catalog) && state.catalog.length) return state.catalog;
    return buildFallbackCatalog();
  }

  // ---------------------------------------------------------------------------
  // Session helpers
  // ---------------------------------------------------------------------------

  function createNewSession() {
    const catalog = getCatalog();
    const cfg = getListsConfig();
    const listKeys = getListKeys(cfg);

    const horses = catalog.map((item, index) => {
      const lists = {};
      for (const k of listKeys) lists[k] = false;

      return {
        horseId: `h${index + 1}`,
        horseName: item.horseName,
        barnActive: !!item.barnActive, // indicator only
        state: false,                  // manual selection only
        lists
      };
    });

    state.session = {
      sessionId: nowMs().toString(),
      createdAt: new Date().toISOString(),
      lastUpdated: null,
      expiresAt: new Date(nowMs() + SESSION_TTL_MS).toISOString(),
      horses
    };

    saveSessionToStorage();
  }

  function ensureSession() {
    if (!state.session) createNewSession();
    normalizeSessionListsToConfig();
  }

  function updateLastUpdated() {
    if (!state.session) return;
    state.session.lastUpdated = new Date().toISOString();
    touchSessionExpiry(); // sliding TTL on any meaningful change
    saveSessionToStorage();
  }

  function findHorse(horseId) {
    if (!state.session) return null;
    return state.session.horses.find((h) => h.horseId === horseId) || null;
  }

  function horseLabel(horse) {
    // Indicator only. No auto-select.
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

  function formatTimeShort(iso) {
    const t = Date.parse(String(iso || ''));
    if (!Number.isFinite(t)) return null;
    try {
      return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation / routing
  // ---------------------------------------------------------------------------

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

    // state label from config
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
    } else if (isListScreen) {
      headerAction.hidden = false;
      headerAction.textContent = 'Next';
      headerAction.dataset.action = 'next-list';
    } else {
      headerAction.hidden = true;
      headerAction.textContent = '';
      delete headerAction.dataset.action;
    }
  }

  function renderNav() {
    const scr = state.currentScreen;
    let activeKey = null;

    if (scr === 'start' || scr === 'state' || scr === 'summary') {
      activeKey = scr;
    } else if (scr === 'share') {
      activeKey = 'summary';
    } else {
      const p = parseListScreen(scr);
      if (p) activeKey = p.key;
    }

    const buttons = navRow ? navRow.querySelectorAll('.nav-btn') : [];
    buttons.forEach((btn) => {
      btn.classList.remove('nav-btn--primary');
      const key = btn.dataset.screen;
      if (activeKey && key === activeKey) btn.classList.add('nav-btn--primary');
    });
  }

  function updateNavAggregates() {
    if (!navRow) return;

    const aggEls = navRow.querySelectorAll('[data-nav-agg]');
    if (!aggEls.length) return;

    const horses = state.session ? state.session.horses : [];
    const activeHorses = horses.filter((h) => h.state);
    const activeCount = activeHorses.length;

    const cfg = getListsConfig();
    const listDefs = getListDefs(cfg);

    const listCounts = {};
    for (const d of listDefs) {
      const k = d.key;
      listCounts[k] = horses.filter((h) => h.state && h.lists && h.lists[k]).length;
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
  // Row helper
  // ---------------------------------------------------------------------------

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
        <div class="start-logo-title">TackLists.com</div>
        <div class="start-logo-subtitle">Quick horse tack lists, on the fly.</div>
      </div>
    `;
    screenRoot.appendChild(logo);

    const hasSession = !!state.session;

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
      if (lastSaved) parts.push(`Last save: ${lastSaved}.`);
      if (expires) parts.push(`Expires: ${expires}.`);
      else parts.push('Expires after 12 hours of inactivity.');
      note.textContent = parts.join(' ');
    }

    screenRoot.appendChild(note);
  }

  function handleStateHorseClick(horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;

    if (!horse.state) {
      horse.state = true;
    } else {
      const inAnyList = horse.lists && typeof horse.lists === 'object'
        ? Object.values(horse.lists).some(Boolean)
        : false;

      if (inAnyList) {
        const ok = window.confirm(
          'Removing this horse from Active Horses will also remove it from all lists. Continue?'
        );
        if (!ok) return;

        horse.state = false;
        if (horse.lists && typeof horse.lists === 'object') {
          Object.keys(horse.lists).forEach((k) => { horse.lists[k] = false; });
        }
      } else {
        horse.state = false;
      }
    }

    updateLastUpdated();
    render();
  }

  function renderStateScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'state-search';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'state-search-input';
    searchInput.placeholder = 'Search horses...';
    searchInput.value = state.stateFilter || '';

    searchInput.addEventListener('input', (e) => {
      state.stateFilter = e.target.value || '';
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

  function toggleListMembership(listKey, horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;
    if (!horse.state) return;

    if (!horse.lists || typeof horse.lists !== 'object') horse.lists = {};
    horse.lists[listKey] = !horse.lists[listKey];

    updateLastUpdated();
    render();
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
      label.textContent = 'Not Packed';
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

  function renderListScreen(listKey) {
    renderListGrouped(listKey);
  }

  function renderListDetailScreen(listKey) {
    renderListGrouped(listKey);
  }

  function renderSummaryScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const horses = state.session.horses;
    const activeCount = horses.filter((h) => h.state).length;

    // State row (label driven by config)
    createRow(labelForKey('state') || 'Active Horses', {
      tagText: String(activeCount),
      tagVariant: 'count',
      tagPositive: activeCount > 0,
      onClick: () => setScreen('state')
    });

    const cfg = getListsConfig();
    const listDefs = getListDefs(cfg).filter((d) => d.inSummary !== false);

    for (const d of listDefs) {
      const listKey = d.key;
      const label = d.label || listKey;

      const members = horses.filter((h) => h.state && h.lists && h.lists[listKey]);
      const listCount = members.length;

      const isFull = activeCount > 0 && listCount === activeCount;
      let displayCount = String(listCount);
      if (isFull && listCount > 0) displayCount = `${listCount} ✔️`;

      createRow(label, {
        tagText: displayCount,
        tagVariant: 'count',
        tagPositive: listCount > 0,
        onClick: () => setScreen(`${listKey}Detail`)
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Share / SMS (Packed vs Not Packed)
  // ---------------------------------------------------------------------------

  function buildShareTextPackedOrNotPacked(mode) {
    if (!state.session) return '';

    const horses = state.session.horses;
    const activeHorses = horses
      .filter((h) => h.state)
      .slice()
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    const lines = [];
    const title = mode === 'notPacked' ? 'NOT PACKED' : 'PACKED';
    const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Styled header + date (ex: ** NOT PACKED ** Jan 8)
    lines.push(`** ${title} ** ${dateStr}`);

    const cfg = getListsConfig();
    const listDefs = getListDefs(cfg).filter((d) => d.inShare !== false);

    let firstSection = true;

    for (const d of listDefs) {
      const listKey = d.key;
      const label = d.label || listKey;

      const members = mode === 'notPacked'
        ? activeHorses.filter((h) => !(h.lists && h.lists[listKey]))
        : activeHorses.filter((h) => !!(h.lists && h.lists[listKey]));

      if (!firstSection) lines.push('');
      firstSection = false;

      // Styled section header (ex: - Schooling Bridles -)
      lines.push(`- ${label} -`);

      if (!members.length) lines.push('[none]');
      else members.forEach((h) => lines.push(h.horseName));
    }

    return lines.join('\n');
  }

  function handleShareClick(mode) {
    ensureSession();
    const body = buildShareTextPackedOrNotPacked(mode);
    if (!body) return;

    const href = 'sms:?&body=' + encodeURIComponent(body);
    window.location.href = href;
  }

  function renderShareScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    createRow('Text Packed', {
      tagVariant: 'boolean',
      tagPositive: true,
      onClick: () => handleShareClick('packed')
    });

    createRow('Text Not Packed', {
      tagVariant: 'boolean',
      tagPositive: false,
      onClick: () => handleShareClick('notPacked')
    });
  }


  // ---------------------------------------------------------------------------
  // Render dispatcher
  // ---------------------------------------------------------------------------

  function render() {
    renderHeader();
    renderNav();
    updateNavAggregates();

    const scr = state.currentScreen;

    if (scr === 'start') return renderStartScreen();
    if (scr === 'state') return renderStateScreen();
    if (scr === 'summary') return renderSummaryScreen();
    if (scr === 'share') return renderShareScreen();

    const p = parseListScreen(scr);
    if (p && isKnownListKey(p.key)) {
      if (p.isDetail) return renderListDetailScreen(p.key);
      return renderListScreen(p.key);
    }

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

  migrateLegacySessionStorage();

  // Seed lists config synchronously so session load can normalize list keys
  state.listsConfig = loadListsFromStorage() || buildFallbackLists();
  state.listsStatus = (Array.isArray(state.listsConfig) && state.listsConfig.length) ? 'ready' : 'fallback';

  state.session = loadSessionFromStorage();

  // If we resumed a valid session, extend TTL for another 12 hours (no lastUpdated change)
  if (state.session) {
    normalizeSessionListsToConfig();
    touchSessionExpiry();
    saveSessionToStorage();
  }

  render();

  // background loads
  loadListsConfig();
  loadCatalog(); // background (used for New/Restart)
})();
