// app.js
// TackLists.com – mobile horse tack lists
// Session persists in localStorage (survives tab close).
// Session expires 12 hours after last save (sliding TTL).
// Only New session and Restart session force a fresh session.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Paths / storage keys
  // ---------------------------------------------------------------------------

  // docs/lists/data/horses.json
  const HORSES_DATA_URL = './data/horses.json';

  const STORAGE_KEY_SESSION = 'tacklists_session_v1';
  const STORAGE_KEY_CATALOG = 'tacklists_horses_catalog_v1';

  // 12-hour TTL
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 43200000
  const SESSION_COOKIE_NAME = 'tacklists_session';
  const SESSION_COOKIE_MAX_AGE = 12 * 60 * 60; // 43200 seconds

  // ---------------------------------------------------------------------------
  // Fallback (hardcoded) list — kept as backup
  // ---------------------------------------------------------------------------

  const HORSE_NAMES = [
    "Cervin","Charly","Coin","Darcy","Dino","Dottie","Doug","Elliot","Gaston","Indy",
    "Kenny","King","Knox","Krypton","Lenny","Maiki","Milo","Minute","Navy","Oddur",
    "Orion","Paisley","Pedro","Peri","Q","Rimini","Star","Tank","Titan","Zen",
    "Munster","Bernie","Hurricane","Winnie","Caymus","BB"
  ];

  const LIST_NAMES = [
    'Active Horses',     // state
    'Schooling Bridles', // list1
    'Show Bridles',      // list2
    'Schooling Girths',  // list3
    'Show Girths',       // list4
    'Saddles',           // list5
    'Trunks',            // list6
    'Supplements'        // list7
  ];

  const LIST_KEYS = ['state', 'list1', 'list2', 'list3', 'list4', 'list5', 'list6', 'list7'];

  const LIST_LABELS = Object.fromEntries(
    LIST_KEYS.map((key, i) => [key, LIST_NAMES[i]])
  );

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
    catalogStatus: 'loading' // 'loading' | 'ready' | 'fallback'
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
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
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

    const horses = parsed.horses
      .filter((h) => h && typeof h === 'object')
      .map((h) => ({
        horseId: String(h.horseId || ''),
        horseName: String(h.horseName || '').trim(),
        barnActive: !!h.barnActive,
        state: !!h.state,
        lists: {
          list1: !!(h.lists && h.lists.list1),
          list2: !!(h.lists && h.lists.list2),
          list3: !!(h.lists && h.lists.list3),
          list4: !!(h.lists && h.lists.list4),
          list5: !!(h.lists && h.lists.list5),
          list6: !!(h.lists && h.lists.list6),
          list7: !!(h.lists && h.lists.list7)
        }
      }))
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
    storageSet(STORAGE_KEY_SESSION, JSON.stringify(state.session));
    setSessionCookie();
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

    const horses = catalog.map((item, index) => ({
      horseId: `h${index + 1}`,
      horseName: item.horseName,
      barnActive: !!item.barnActive, // data indicator only
      state: false,                  // manual selection only
      lists: {
        list1: false,
        list2: false,
        list3: false,
        list4: false,
        list5: false,
        list6: false, // Trunks
        list7: false  // Supplements
      }
    }));

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
  }

  function updateLastUpdated() {
    if (!state.session) return;
    state.session.lastUpdated = new Date().toISOString();
    touchSessionExpiry(); // sliding 12h TTL on any meaningful change
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
    const scr = state.currentScreen;
    const match = scr.match(/^list([1-7])(Detail)?$/);
    if (!match) return;

    let idx = Number(match[1]);

    if (direction === 'prev' && idx > 1) {
      setScreen(`list${idx - 1}`);
    } else if (direction === 'next') {
      if (idx < 7) {
        setScreen(`list${idx + 1}`);
      } else if (idx === 7) {
        setScreen('summary');
      }
    }
  }

  function titleForScreen(scr) {
    if (scr === 'start') return 'Start';
    if (scr === 'state') return LIST_LABELS.state;
    if (scr === 'summary') return 'Summary';
    if (scr === 'share') return 'Share';

    const listMatch = scr.match(/^list([1-7])(Detail)?$/);
    if (listMatch) {
      const n = listMatch[1];
      const base = LIST_LABELS[`list${n}`] || `List ${n}`;
      if (listMatch[2]) return `${base} Detail`;
      return base;
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

    const isListScreen = /^list[1-7](Detail)?$/.test(scr);

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
      const m = scr.match(/^list([1-7])(Detail)?$/);
      if (m) activeKey = `list${m[1]}`;
    }

    const buttons = navRow.querySelectorAll('.nav-btn');
    buttons.forEach((btn) => {
      btn.classList.remove('nav-btn--primary');
      const key = btn.dataset.screen;
      if (activeKey && key === activeKey) {
        btn.classList.add('nav-btn--primary');
      }
    });
  }

  function updateNavAggregates() {
    const aggEls = navRow.querySelectorAll('[data-nav-agg]');
    if (!aggEls.length) return;

    const horses = state.session ? state.session.horses : [];
    const activeHorses = horses.filter((h) => h.state);
    const activeCount = activeHorses.length;

    const listCounts = {
      list1: 0, list2: 0, list3: 0, list4: 0, list5: 0, list6: 0, list7: 0
    };

    ['list1','list2','list3','list4','list5','list6','list7'].forEach((listId) => {
      listCounts[listId] = horses.filter((h) => h.state && h.lists[listId]).length;
    });

    function setAgg(key, value) {
      const el = navRow.querySelector(`[data-nav-agg="${key}"]`);
      if (!el) return;
      const n = Number(value) || 0;
      el.textContent = String(n);
      if (n > 0) el.classList.add('nav-agg--positive');
      else el.classList.remove('nav-agg--positive');
    }

    setAgg('state', activeCount);
    setAgg('list1', listCounts.list1);
    setAgg('list2', listCounts.list2);
    setAgg('list3', listCounts.list3);
    setAgg('list4', listCounts.list4);
    setAgg('list5', listCounts.list5);
    setAgg('list6', listCounts.list6);
    setAgg('list7', listCounts.list7);

    const listsWithAny = Object.values(listCounts).filter((c) => c > 0).length;
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

  // -------------------------------------------------------------------------
  // Start screen only: Autosave indicator (non-clickable)
  // NOTE: current code saves to sessionStorage, so this is "Tab" persistence.
  // -------------------------------------------------------------------------
  const statusRow = document.createElement('div');
  statusRow.className = 'row'; // no "row--tap" => not visually tappable/cursor pointer

  const statusTitle = document.createElement('div');
  statusTitle.className = 'row-title';

  const statusTag = document.createElement('div');
  statusTag.className = 'row-tag row-tag--count';

  if (!state.session) {
    statusTitle.textContent = 'Autosave: OFF (no session)';
    statusTag.hidden = true;
  } else {
    // show last saved time (uses lastUpdated if present, else createdAt)
    const iso = state.session.lastUpdated || state.session.createdAt || '';
    let timeText = '';
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        timeText = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }
    }

    // detect whether sessionStorage actually contains the session key
    let savedOk = false;
    try {
      savedOk = !!sessionStorage.getItem(STORAGE_KEY_SESSION);
    } catch (_) {
      savedOk = false;
    }

    statusTitle.textContent = `Autosave: ON (Tab)${timeText ? ' • ' + timeText : ''}`;
    statusTag.hidden = false;
    statusTag.textContent = savedOk ? 'Saved' : 'Not saved';

    if (savedOk) statusTag.classList.add('row-tag--positive');
    else statusTag.classList.remove('row-tag--positive');
  }

  statusRow.appendChild(statusTitle);
  statusRow.appendChild(statusTag);
  screenRoot.appendChild(statusRow);

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
}


  function handleStateHorseClick(horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;

    if (!horse.state) {
      horse.state = true;
    } else {
      const inAnyList = Object.values(horse.lists).some(Boolean);
      if (inAnyList) {
        const ok = window.confirm(
          'Removing this horse from Active Horses will also remove it from all lists. Continue?'
        );
        if (!ok) return;

        horse.state = false;
        horse.lists.list1 = false;
        horse.lists.list2 = false;
        horse.lists.list3 = false;
        horse.lists.list4 = false;
        horse.lists.list5 = false;
        horse.lists.list6 = false;
        horse.lists.list7 = false;
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

  function toggleListMembership(listId, horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;
    if (!horse.state) return;

    horse.lists[listId] = !horse.lists[listId];
    updateLastUpdated();
    render();
  }

  function renderListGrouped(listId) {
    ensureSession();
    screenRoot.innerHTML = '';

    const activeStateHorses = sortBarnActiveThenName(
      state.session.horses.filter((h) => h.state)
    );

    if (activeStateHorses.length === 0) {
      createRow('No active horses.', {});
      return;
    }

    const packed = activeStateHorses.filter((h) => h.lists[listId]);
    const notPacked = activeStateHorses.filter((h) => !h.lists[listId]);

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
          onClick: () => toggleListMembership(listId, horse.horseId)
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
          onClick: () => toggleListMembership(listId, horse.horseId)
        });
      });
    }
  }

  function renderListScreen(listId) {
    renderListGrouped(listId);
  }

  function renderListDetailScreen(listId) {
    renderListGrouped(listId);
  }

  function renderSummaryScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const horses = state.session.horses;
    const activeCount = horses.filter((h) => h.state).length;

    createRow(LIST_LABELS.state, {
      tagText: String(activeCount),
      tagVariant: 'count',
      tagPositive: activeCount > 0,
      onClick: () => setScreen('state')
    });

    for (let i = 1; i <= 7; i++) {
      const listId = `list${i}`;
      const label = LIST_LABELS[listId] || `List ${i}`;

      const members = horses.filter((h) => h.state && h.lists[listId]);
      const listCount = members.length;

      const isFull = activeCount > 0 && listCount === activeCount;
      let displayCount = String(listCount);
      if (isFull && listCount > 0) displayCount = `${listCount} ✔️`;

      createRow(label, {
        tagText: displayCount,
        tagVariant: 'count',
        tagPositive: listCount > 0,
        onClick: () => setScreen(`list${i}Detail`)
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

    const activeCount = activeHorses.length;
    const lines = [];
    const title = mode === 'notPacked' ? 'NOT PACKED' : 'PACKED';

    // Always include Active Horses section
    lines.push(`Active Horses (${activeCount})`);
    if (!activeHorses.length) lines.push('[none]');
    else activeHorses.forEach((h) => lines.push(h.horseName));

    for (let i = 1; i <= 7; i++) {
      const listId = `list${i}`;
      const label = LIST_LABELS[listId] || listId;

      const members = mode === 'notPacked'
        ? activeHorses.filter((h) => !h.lists[listId])
        : activeHorses.filter((h) => !!h.lists[listId]);

      const count = members.length;

      lines.push('');
      lines.push(`${label} — ${title} (${count}/${activeCount})`);

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

    const listMatch = scr.match(/^list([1-7])(Detail)?$/);
    if (listMatch) {
      const listId = `list${listMatch[1]}`;
      if (listMatch[2]) return renderListDetailScreen(listId);
      return renderListScreen(listId);
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
      setScreen('list1');
      return;
    }

    if (action === 'next-list') {
      handleListPrevNext('next');
    }
  });

  navRow.addEventListener('click', (evt) => {
    const btn = evt.target.closest('.nav-btn');
    if (!btn) return;

    const key = btn.dataset.screen;
    if (!key) return;

    switch (key) {
      case 'start':
        setScreen('start');
        break;

      case 'state':
        ensureSession();
        setScreen('state');
        break;

      case 'summary':
        ensureSession();
        setScreen('summary');
        break;

      case 'list1':
      case 'list2':
      case 'list3':
      case 'list4':
      case 'list5':
      case 'list6':
      case 'list7': {
        ensureSession();
        const hasActive = state.session.horses.some((h) => h.state);
        if (!hasActive) setScreen('state');
        else setScreen(key);
        break;
      }

      default:
        break;
    }
  });

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

  state.session = loadSessionFromStorage();

  // If we resumed a valid session, extend TTL for another 12 hours (no lastUpdated change)
  if (state.session) {
    touchSessionExpiry();
    saveSessionToStorage();
  }

  render();
  loadCatalog(); // background (used for New/Restart)
})();
