// tl.ui.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.ui = TL.ui || {};

  const { headerTitle, headerBack, headerAction, screenRoot, navRow } = TL.dom;

  // ---------------------------------------------------------------------------
  // Navigation / routing
  // ---------------------------------------------------------------------------

  function setScreen(newScreen, pushHistory = true) {
    if (pushHistory && TL.state.currentScreen && TL.state.currentScreen !== newScreen) {
      TL.state.history.push(TL.state.currentScreen);
    }
    TL.state.currentScreen = newScreen;
    render();
  }

  function goBack() {
    const prev = TL.state.history.pop();
    TL.state.currentScreen = prev || 'start';
    render();
  }

  function handleListPrevNext(direction) {
    const p = TL.lists.parseListScreen(TL.state.currentScreen);
    if (!p) return;

    const cfg = TL.lists.getListsConfig();
    const listKeys = TL.lists.getListKeys(cfg);
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
    if (s === 'state') return TL.lists.labelForKey('state');

    const p = TL.lists.parseListScreen(s);
    if (p && TL.lists.isKnownListKey(p.key)) {
      const base = TL.lists.labelForKey(p.key) || p.key;
      return p.isDetail ? `${base} Detail` : base;
    }

    return '';
  }

  // ---------------------------------------------------------------------------
  // Header / nav rendering
  // ---------------------------------------------------------------------------

  function renderHeader() {
    const scr = TL.state.currentScreen;
    headerTitle.textContent = titleForScreen(scr);

    const hideBack = TL.state.history.length === 0 && scr === 'start';
    headerBack.style.visibility = hideBack ? 'hidden' : 'visible';

    const p = TL.lists.parseListScreen(scr);
    const isListScreen = !!(p && TL.lists.isKnownListKey(p.key));

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
    const scr = TL.state.currentScreen;
    let activeKey = null;

    if (scr === 'start' || scr === 'state' || scr === 'summary') {
      activeKey = scr;
    } else if (scr === 'share') {
      activeKey = 'summary';
    } else {
      const p = TL.lists.parseListScreen(scr);
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

    const horses = TL.state.session ? TL.state.session.horses : [];
    const activeHorses = horses.filter((h) => h.state);
    const activeCount = activeHorses.length;

    const cfg = TL.lists.getListsConfig();
    const listDefs = TL.lists.getListDefs(cfg);

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

    const hasSession = !!TL.state.session;

    if (!hasSession) {
      createRow('New session', {
        tagVariant: 'boolean',
        tagPositive: false,
        onClick: () => {
          TL.session.clearSessionStorage();
          TL.session.createNewSession();
          setScreen('state');
        }
      });

      const note = document.createElement('div');
      note.style.margin = '10px 10px 0';
      note.style.fontSize = '12px';
      note.style.color = 'rgba(209, 213, 219, 0.9)';
      note.style.lineHeight = '1.35';
      note.textContent = TL.state.storageOk
        ? 'Autosave: ON (device). Expires after 12 hours of inactivity.'
        : 'Autosave: OFF (storage blocked in this browser).';
      screenRoot.appendChild(note);

      return;
    }

    const horses = TL.state.session.horses;
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
        TL.session.clearSessionStorage();
        TL.session.createNewSession();
        setScreen('state');
      }
    });

    // Start screen only: simple text under Restart (NOT a pill row)
    const lastSavedIso = TL.state.session.lastUpdated || TL.state.session.createdAt;
    const lastSaved = TL.session.formatTimeShort(lastSavedIso);
    const expires = TL.session.formatTimeShort(TL.state.session.expiresAt);

    const note = document.createElement('div');
    note.style.margin = '10px 10px 0';
    note.style.fontSize = '12px';
    note.style.color = 'rgba(209, 213, 219, 0.9)';
    note.style.lineHeight = '1.35';

    if (!TL.state.storageOk) {
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
    const horse = TL.session.findHorse(horseId);
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

    TL.session.updateLastUpdated();
    render();
  }

  function renderStateScreen() {
    TL.session.ensureSession();
    screenRoot.innerHTML = '';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'state-search';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'state-search-input';
    searchInput.placeholder = 'Search horses...';
    searchInput.value = TL.state.stateFilter || '';

    searchInput.addEventListener('input', (e) => {
      TL.state.stateFilter = e.target.value || '';
      render();
    });

    searchWrap.appendChild(searchInput);
    screenRoot.appendChild(searchWrap);

    const sorted = TL.session.sortBarnActiveThenName(TL.state.session.horses);

    const term = (TL.state.stateFilter || '').trim().toLowerCase();
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
        createRow(TL.session.horseLabel(horse), {
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
        createRow(TL.session.horseLabel(horse), {
          tagVariant: 'boolean',
          tagPositive: false,
          onClick: () => handleStateHorseClick(horse.horseId)
        });
      });
    }
  }

  function toggleListMembership(listKey, horseId) {
    const horse = TL.session.findHorse(horseId);
    if (!horse) return;
    if (!horse.state) return;

    if (!horse.lists || typeof horse.lists !== 'object') horse.lists = {};
    horse.lists[listKey] = !horse.lists[listKey];

    TL.session.updateLastUpdated();
    render();
  }

  function renderListGrouped(listKey) {
    TL.session.ensureSession();
    screenRoot.innerHTML = '';

    const activeStateHorses = TL.session.sortBarnActiveThenName(
      TL.state.session.horses.filter((h) => h.state)
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
        createRow(TL.session.horseLabel(horse), {
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
        createRow(TL.session.horseLabel(horse), {
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
    TL.session.ensureSession();
    screenRoot.innerHTML = '';

    const horses = TL.state.session.horses;
    const activeCount = horses.filter((h) => h.state).length;

    // State row (label driven by config)
    createRow(TL.lists.labelForKey('state') || 'Active Horses', {
      tagText: String(activeCount),
      tagVariant: 'count',
      tagPositive: activeCount > 0,
      onClick: () => setScreen('state')
    });

    const cfg = TL.lists.getListsConfig();
    const listDefs = TL.lists.getListDefs(cfg).filter((d) => d.inSummary !== false);

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
    if (!TL.state.session) return '';

    const horses = TL.state.session.horses;
    const activeHorses = horses
      .filter((h) => h.state)
      .slice()
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    const lines = [];
    const title = mode === 'notPacked' ? 'NOT PACKED' : 'PACKED';
    const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });

    // Styled header + date (ex: ** NOT PACKED ** Jan 8)
    lines.push(`** ${title} ** ${dateStr}`);

    const cfg = TL.lists.getListsConfig();
    const listDefs = TL.lists.getListDefs(cfg).filter((d) => d.inShare !== false);

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
    TL.session.ensureSession();
    const body = buildShareTextPackedOrNotPacked(mode);
    if (!body) return;

    const href = 'sms:?&body=' + encodeURIComponent(body);
    window.location.href = href;
  }

  function renderShareScreen() {
    TL.session.ensureSession();
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

    const scr = TL.state.currentScreen;

    if (scr === 'start') return renderStartScreen();
    if (scr === 'state') return renderStateScreen();
    if (scr === 'summary') return renderSummaryScreen();
    if (scr === 'share') return renderShareScreen();

    const p = TL.lists.parseListScreen(scr);
    if (p && TL.lists.isKnownListKey(p.key)) {
      if (p.isDetail) return renderListDetailScreen(p.key);
      return renderListScreen(p.key);
    }

    renderStartScreen();
  }

  // exports
  TL.ui.setScreen = setScreen;
  TL.ui.goBack = goBack;
  TL.ui.handleListPrevNext = handleListPrevNext;

  TL.ui.renderHeader = renderHeader;
  TL.ui.renderNav = renderNav;
  TL.ui.updateNavAggregates = updateNavAggregates;

  TL.ui.createRow = createRow;

  TL.ui.renderStartScreen = renderStartScreen;
  TL.ui.renderStateScreen = renderStateScreen;
  TL.ui.renderListScreen = renderListScreen;
  TL.ui.renderListDetailScreen = renderListDetailScreen;
  TL.ui.renderSummaryScreen = renderSummaryScreen;
  TL.ui.renderShareScreen = renderShareScreen;

  TL.ui.render = render;
})();
