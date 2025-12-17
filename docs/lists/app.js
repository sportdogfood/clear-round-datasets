// app.js
// TackLists.com – mobile horse tack lists
// Session persists in sessionStorage; refresh does NOT wipe state.
// Only New session and Restart session create a fresh session.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Paths / storage keys
  // ---------------------------------------------------------------------------

  // docs/lists/data/horses.json
  const HORSES_DATA_URL = './data/horses.json';

  const STORAGE_KEY_SESSION = 'tacklists_session_v1';
  const STORAGE_KEY_CATALOG = 'tacklists_horses_catalog_v1';

  // ---------------------------------------------------------------------------
  // Fallback (hardcoded) list — kept as backup
  // ---------------------------------------------------------------------------

  const HORSE_NAMES = [
    "Cervin",
    "Charly",
    "Coin",
    "Darcy",
    "Dino",
    "Dottie",
    "Doug",
    "Elliot",
    "Gaston",
    "Indy",
    "Kenny",
    "King",
    "Knox",
    "Krypton",
    "Lenny",
    "Maiki",
    "Milo",
    "Minute",
    "Navy",
    "Oddur",
    "Orion",
    "Paisley",
    "Pedro",
    "Peri",
    "Q",
    "Rimini",
    "Star",
    "Tank",
    "Titan",
    "Zen",
    "Munster",
    "Bernie",
    "Hurricane",
    "Winnie",
    "Caymus",
    "BB"
  ];

  const LIST_NAMES = [
    'Active Horses',     // state
    'Schooling Bridles', // list1
    'Show Bridles',      // list2
    'Schooling Girths',  // list3
    'Show Girths',       // list4
    'Saddles'            // list5
  ];

  const LIST_KEYS = ['state', 'list1', 'list2', 'list3', 'list4', 'list5'];

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
    shareMode: false,
    shareSelection: {
      state: true,
      list1: true,
      list2: true,
      list3: true,
      list4: true,
      list5: true
    },
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
  // Storage helpers
  // ---------------------------------------------------------------------------

  function safeJSONParse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function loadSessionFromStorage() {
    const raw = sessionStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;

    const parsed = safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.horses)) return null;

    // minimal shape checks
    parsed.horses = parsed.horses
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
          list5: !!(h.lists && h.lists.list5)
        }
      }))
      .filter((h) => h.horseId && h.horseName);

    if (!parsed.horses.length) return null;

    return {
      sessionId: String(parsed.sessionId || Date.now()),
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      lastUpdated: parsed.lastUpdated ? String(parsed.lastUpdated) : null,
      horses: parsed.horses
    };
  }

  function saveSessionToStorage() {
    if (!state.session) return;
    sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(state.session));
  }

  function clearSessionStorage() {
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
  }

  function loadCatalogFromStorage() {
    const raw = sessionStorage.getItem(STORAGE_KEY_CATALOG);
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

    if (!items.length) return null;

    return items;
  }

  function saveCatalogToStorage(items) {
    if (!Array.isArray(items) || !items.length) return;
    sessionStorage.setItem(
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
    // 1) try cached catalog first
    const cached = loadCatalogFromStorage();
    if (cached && cached.length) {
      state.catalog = cached;
      state.catalogStatus = 'ready';
      render();

      // optional background refresh (silent)
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
      } catch (_) {
        // silent
      }

      return;
    }

    // 2) fetch horses.json
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
      // 3) fallback
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
        list5: false
      }
    }));

    state.session = {
      sessionId: Date.now().toString(),
      createdAt: new Date().toISOString(),
      lastUpdated: null,
      horses
    };

    saveSessionToStorage();
  }

  function ensureSession() {
    if (!state.session) {
      createNewSession();
    }
  }

  function updateLastUpdated() {
    if (state.session) {
      state.session.lastUpdated = new Date().toISOString();
      saveSessionToStorage();
    }
  }

  function findHorse(horseId) {
    if (!state.session) return null;
    return state.session.horses.find((h) => h.horseId === horseId) || null;
  }

  function horseLabel(horse) {
    // Indicator only (B explicit). No auto-select.
    return horse.horseName + (horse.barnActive ? ' B' : '');
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

    if (newScreen !== 'summary') {
      state.shareMode = false;
    }

    render();
  }

  function goBack() {
    if (state.currentScreen === 'summary' && state.shareMode) {
      state.shareMode = false;
      render();
      return;
    }

    const prev = state.history.pop();
    if (prev) {
      state.currentScreen = prev;
    } else {
      state.currentScreen = 'start';
    }
    render();
  }

  function handleListPrevNext(direction) {
    const scr = state.currentScreen;
    const match = scr.match(/^list([1-5])(Detail)?$/);
    if (!match) return;

    let idx = Number(match[1]);

    if (direction === 'prev' && idx > 1) {
      setScreen(`list${idx - 1}`);
    } else if (direction === 'next') {
      if (idx < 5) {
        setScreen(`list${idx + 1}`);
      } else if (idx === 5) {
        setScreen('summary');
      }
    }
  }

  function titleForScreen(scr) {
    if (scr === 'start') return 'Start';
    if (scr === 'state') return LIST_LABELS.state;
    if (scr === 'summary') return 'Summary';

    const listMatch = scr.match(/^list([1-5])(Detail)?$/);
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

    const isListScreen = /^list[1-5](Detail)?$/.test(scr);

    if (scr === 'summary') {
      headerAction.hidden = false;
      headerAction.textContent = state.shareMode ? 'Send' : 'Text';
      headerAction.dataset.action = state.shareMode ? 'send-share' : 'enter-share';
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
    } else {
      const m = scr.match(/^list([1-5])(Detail)?$/);
      if (m) {
        activeKey = `list${m[1]}`;
      }
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
      list1: 0,
      list2: 0,
      list3: 0,
      list4: 0,
      list5: 0
    };

    ['list1', 'list2', 'list3', 'list4', 'list5'].forEach((listId) => {
      listCounts[listId] = horses.filter(
        (h) => h.state && h.lists[listId]
      ).length;
    });

    function setAgg(key, value) {
      const el = navRow.querySelector(`[data-nav-agg="${key}"]`);
      if (!el) return;
      const n = Number(value) || 0;
      el.textContent = String(n);
      if (n > 0) {
        el.classList.add('nav-agg--positive');
      } else {
        el.classList.remove('nav-agg--positive');
      }
    }

    setAgg('state', activeCount);
    setAgg('list1', listCounts.list1);
    setAgg('list2', listCounts.list2);
    setAgg('list3', listCounts.list3);
    setAgg('list4', listCounts.list4);
    setAgg('list5', listCounts.list5);

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
      if (tagVariant) {
        tagEl.classList.add(`row-tag--${tagVariant}`);
      }
      if (tagPositive) {
        tagEl.classList.add('row-tag--positive');
      }
      if (tagText != null) {
        tagEl.textContent = tagText;
      }
      row.appendChild(tagEl);
    }

    if (typeof onClick === 'function') {
      row.addEventListener('click', onClick);
    }

    screenRoot.appendChild(row);
  }

  // ---------------------------------------------------------------------------
  // Screen renderers
  // ---------------------------------------------------------------------------

  function renderStartScreen() {
    screenRoot.innerHTML = '';

    const logo = document.createElement('div');
    logo.className = 'start-logo';
    logo.innerHTML = `
      <div class="start-logo-mark">
        <img
          src="tacklists.png"
          class="start-logo-img"
          alt="TackLists.com logo"
        />
      </div>
      <div class="start-logo-text">
        <div class="start-logo-title">TackLists.com</div>
        <div class="start-logo-subtitle">
          Quick horse tack lists, on the fly.
        </div>
      </div>
    `;
    screenRoot.appendChild(logo);

    const hasSession = !!state.session;

    if (!hasSession) {
      createRow('New session', {
        tagVariant: 'boolean',
        tagPositive: false,
        onClick: () => {
          // New session is allowed to clear/overwrite any old storage
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
      onClick: () => {
        setScreen('state');
      }
    });

    createRow('Summary', {
      tagVariant: 'boolean',
      tagPositive: activeCount > 0,
      onClick: () => {
        setScreen('summary');
      }
    });

    createRow('Restart session', {
      tagVariant: 'boolean',
      tagPositive: false,
      onClick: () => {
        // Restart is the only other action that clears state
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

    const activeInList = activeStateHorses.filter((h) => h.lists[listId]);
    const inactiveInList = activeStateHorses.filter((h) => !h.lists[listId]);

    if (activeInList.length) {
      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Active in this list';
      screenRoot.appendChild(label);

      activeInList.forEach((horse) => {
        createRow(horseLabel(horse), {
          active: true,
          tagVariant: 'boolean',
          tagPositive: true,
          onClick: () => toggleListMembership(listId, horse.horseId)
        });
      });
    }

    if (inactiveInList.length) {
      if (activeInList.length) {
        const divider = document.createElement('div');
        divider.className = 'list-group-divider';
        screenRoot.appendChild(divider);
      }

      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Inactive in this list';
      screenRoot.appendChild(label);

      inactiveInList.forEach((horse) => {
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
    const activeHorses = horses.filter((h) => h.state);
    const activeCount = activeHorses.length;
    const inShare = state.shareMode;

    function handleRowClick(key) {
      if (!inShare) {
        if (key === 'state') {
          setScreen('state');
        } else if (key.startsWith('list')) {
          const num = key.replace('list', '');
          setScreen(`list${num}Detail`);
        }
      } else {
        state.shareSelection[key] = !state.shareSelection[key];
        render();
      }
    }

    const stateSelected = state.shareSelection.state;
    createRow(LIST_LABELS.state, {
      tagText: String(activeCount),
      tagVariant: 'count',
      tagPositive: activeCount > 0,
      active: inShare && stateSelected,
      onClick: () => handleRowClick('state')
    });

    for (let i = 1; i <= 5; i++) {
      const listId = `list${i}`;
      const label = LIST_LABELS[listId] || `List ${i}`;

      const members = horses.filter(
        (h) => h.state && h.lists[listId]
      );
      const listCount = members.length;

      const isFull = activeCount > 0 && listCount === activeCount;
      let displayCount = String(listCount);
      if (isFull && listCount > 0) {
        displayCount = `${listCount} ✔️`;
      }

      const selected = state.shareSelection[listId];

      createRow(label, {
        tagText: displayCount,
        tagVariant: 'count',
        tagPositive: listCount > 0,
        active: inShare && selected,
        onClick: () => handleRowClick(listId)
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Share / SMS
  // ---------------------------------------------------------------------------

  function buildShareText() {
    if (!state.session) return '';

    const horses = state.session.horses;
    const activeHorses = horses
      .filter((h) => h.state)
      .sort((a, b) => a.horseName.localeCompare(b.horseName));
    const activeCount = activeHorses.length;

    const lines = [];
    const order = ['state', 'list1', 'list2', 'list3', 'list4', 'list5'];

    function addSection(header, members) {
      if (lines.length > 0) lines.push('');
      lines.push(header);

      if (members.length === 0) {
        lines.push('[none]');
      } else {
        members.forEach((h) => lines.push(h.horseName));
      }
    }

    order.forEach((key) => {
      if (!state.shareSelection[key]) return;

      if (key === 'state') {
        const label = LIST_LABELS.state || 'State';
        const header = `${label} (${activeCount})`;
        addSection(header, activeHorses);
      } else {
        const listId = key;
        const label = LIST_LABELS[listId] || listId;

        const members = horses
          .filter((h) => h.state && h.lists[listId])
          .sort((a, b) => a.horseName.localeCompare(b.horseName));

        const listCount = members.length;
        const isFull = activeCount > 0 && listCount === activeCount;

        let header;
        if (activeCount > 0) {
          header = `${label} (${listCount}/${activeCount}`;
          if (isFull) header += ' ✔️';
          header += ')';
        } else {
          header = `${label} (${listCount})`;
        }

        addSection(header, members);
      }
    });

    return lines.join('\n');
  }

  function handleShareClick() {
    ensureSession();
    const body = buildShareText();
    if (!body) return;

    const href = 'sms:?&body=' + encodeURIComponent(body);
    window.location.href = href;
  }

  // ---------------------------------------------------------------------------
  // Render dispatcher
  // ---------------------------------------------------------------------------

  function render() {
    renderHeader();
    renderNav();
    updateNavAggregates();

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

    const listMatch = scr.match(/^list([1-5])(Detail)?$/);
    if (listMatch) {
      const listId = `list${listMatch[1]}`;
      if (listMatch[2]) {
        renderListDetailScreen(listId);
      } else {
        renderListScreen(listId);
      }
      return;
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
    const scr = state.currentScreen;

    if (scr === 'summary') {
      if (action === 'enter-share') {
        state.shareMode = true;
        render();
      } else if (action === 'send-share') {
        handleShareClick();
        state.shareMode = false;
        render();
      }
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
        setScreen('start'); // does NOT clear
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
      case 'list5': {
        ensureSession();
        const hasActive = state.session.horses.some((h) => h.state);
        if (!hasActive) {
          setScreen('state');
        } else {
          setScreen(key);
        }
        break;
      }

      default:
        break;
    }
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  // 1) Restore session (so refresh does not wipe state)
  state.session = loadSessionFromStorage();

  // 2) Render immediately
  render();

  // 3) Load catalog in background (used on New session / Restart session)
  loadCatalog();
})();
