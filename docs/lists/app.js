// app.js
// Mobile horse list app – single in-memory session with share selection mode

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config / labels
  // ---------------------------------------------------------------------------

  // Editable horse names
  const HORSE_NAMES = [
    'Elliot',
    'Gaston',
    'Indy',
    'Kenny',
    'Knox',
    'Lenny',
    'Maiki',
    'Milo',
    'Oddur',
    'Orion',
    'Paisley',
    'Pedro',
    'Peri',
    'Q',
    'Rimini',
    'Star',
    'Titan'
  ];

  // Editable list names (in order)
  const LIST_NAMES = [
    'Active Horses',     // state
    'Schooling Bridles', // list1
    'Show Bridles',      // list2
    'Schooling Girths',  // list3
    'Show Girths',       // list4
    'Saddles'            // list5
  ];

  // Fixed keys used by the app
  const LIST_KEYS = ['state', 'list1', 'list2', 'list3', 'list4', 'list5'];

  // Derived labels object used everywhere else
  const LIST_LABELS = Object.fromEntries(
    LIST_KEYS.map((key, i) => [key, LIST_NAMES[i]])
  );

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
    }
  };

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------

  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const screenRoot = document.getElementById('screen-root');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // Session helpers
  // ---------------------------------------------------------------------------

  function createNewSession() {
    const horses = HORSE_NAMES.map((name, index) => ({
      horseId: `h${index + 1}`,
      horseName: name,
      state: false,
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
  }

  function ensureSession() {
    if (!state.session) {
      createNewSession();
    }
  }

  function updateLastUpdated() {
    if (state.session) {
      state.session.lastUpdated = new Date().toISOString();
    }
  }

  function findHorse(horseId) {
    if (!state.session) return null;
    return state.session.horses.find((h) => h.horseId === horseId) || null;
  }

  // ---------------------------------------------------------------------------
  // Navigation / routing
  // ---------------------------------------------------------------------------

  function setScreen(newScreen, pushHistory = true) {
    if (pushHistory && state.currentScreen && state.currentScreen !== newScreen) {
      state.history.push(state.currentScreen);
    }
    state.currentScreen = newScreen;

    // Leaving Summary resets share mode
    if (newScreen !== 'summary') {
      state.shareMode = false;
    }

    render();
  }

  function goBack() {
    // In Summary share mode, back = exit share mode (stay on Summary)
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
    } else if (direction === 'next' && idx < 5) {
      setScreen(`list${idx + 1}`);
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
    } else if (isListScreen) {
      headerAction.hidden = false;
      headerAction.textContent = '→';
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

  // ---------------------------------------------------------------------------
  // Row helper
  // ---------------------------------------------------------------------------

  function createRow(label, options = {}) {
    const { tagText, active, onClick } = options;

    const row = document.createElement('div');
    row.className = 'row row--tap';
    if (active) row.classList.add('row--active');

    const titleEl = document.createElement('div');
    titleEl.className = 'row-title';
    titleEl.textContent = label;
    row.appendChild(titleEl);

    if (tagText != null) {
      const tagEl = document.createElement('div');
      tagEl.className = 'row-tag';
      tagEl.textContent = tagText;
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

  // Start
  function renderStartScreen() {
    screenRoot.innerHTML = '';

    if (!state.session) {
      createRow('New session', {
        onClick: () => {
          createNewSession();
          setScreen('state');
        }
      });
      return;
    }

    createRow('In-session', {
      onClick: () => {
        ensureSession();
        setScreen('state');
      }
    });

    createRow('Summary', {
      onClick: () => {
        ensureSession();
        setScreen('summary');
      }
    });

    createRow('Restart session', {
      onClick: () => {
        createNewSession();
        setScreen('state');
      }
    });
  }

  // State: grouped, active at top, inactive below
  function handleStateHorseClick(horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;

    if (!horse.state) {
      // FALSE -> TRUE
      horse.state = true;
    } else {
      // TRUE -> FALSE
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

    const horses = state.session.horses
      .slice()
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    const active = horses.filter((h) => h.state);
    const inactive = horses.filter((h) => !h.state);

    if (!active.length && !inactive.length) {
      createRow('No horses found.', {});
      return;
    }

    // Active at top
    if (active.length) {
      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Active';
      screenRoot.appendChild(label);

      active.forEach((horse) => {
        createRow(horse.horseName, {
          active: true,
          onClick: () => handleStateHorseClick(horse.horseId)
        });
      });
    }

    // Divider + Inactive below
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
        createRow(horse.horseName, {
          onClick: () => handleStateHorseClick(horse.horseId)
        });
      });
    }
  }

  // List membership toggle (used by all list screens)
  function toggleListMembership(listId, horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;

    // Only allow list edits when globally active
    if (!horse.state) return;

    horse.lists[listId] = !horse.lists[listId];
    updateLastUpdated();
    render();
  }

  // Shared grouped renderer for List 1..5:
  // - Only globally active horses
  // - Active in this list at top
  // - Inactive in this list below
  function renderListGrouped(listId) {
    ensureSession();
    screenRoot.innerHTML = '';

    const activeStateHorses = state.session.horses
      .filter((h) => h.state)
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    if (activeStateHorses.length === 0) {
      createRow('No active horses.', {});
      return;
    }

    const activeInList = activeStateHorses.filter((h) => h.lists[listId]);
    const inactiveInList = activeStateHorses.filter((h) => !h.lists[listId]);

    // Active in this list (top)
    if (activeInList.length) {
      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Active in this list';
      screenRoot.appendChild(label);

      activeInList.forEach((horse) => {
        createRow(horse.horseName, {
          active: true,
          onClick: () => toggleListMembership(listId, horse.horseId)
        });
      });
    }

    // Divider + Inactive in this list (bottom)
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
        createRow(horse.horseName, {
          onClick: () => toggleListMembership(listId, horse.horseId)
        });
      });
    }

    if (!activeInList.length && !inactiveInList.length) {
      createRow('No active horses for this list.', {});
    }
  }

  function renderListScreen(listId) {
    renderListGrouped(listId);
  }

  function renderListDetailScreen(listId) {
    renderListGrouped(listId);
  }

  // Summary
  function renderSummaryScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const horses = state.session.horses;
    const activeCount = horses.filter((h) => h.state).length;
    const inShare = state.shareMode;

    function handleRowClick(key) {
      if (!inShare) {
        // Normal navigation mode
        if (key === 'state') {
          setScreen('state');
        } else if (key.startsWith('list')) {
          const num = key.replace('list', '');
          setScreen(`list${num}Detail`);
        }
      } else {
        // Share selection mode: toggle include/exclude
        state.shareSelection[key] = !state.shareSelection[key];
        render();
      }
    }

    // STATE row
    const stateSelected = state.shareSelection.state;
    createRow(LIST_LABELS.state, {
      tagText: String(activeCount),
      active: inShare && stateSelected,
      onClick: () => handleRowClick('state')
    });

    // LIST 1..5 rows
    for (let i = 1; i <= 5; i++) {
      const listId = `list${i}`;
      const label = LIST_LABELS[listId] || `List ${i}`;

      const listCount = horses.filter(
        (h) => h.state && h.lists[listId]
      ).length;

      const isFull = activeCount > 0 && listCount === activeCount;
      const tagText = isFull ? `${listCount} ✔️` : String(listCount);

      const selected = state.shareSelection[listId];

      createRow(label, {
        tagText,
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
      // One blank line between sections, but not before the first
      if (lines.length > 0) {
        lines.push('');
      }

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

    // Fallback
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
        // Build + send SMS, then exit share mode and stay on Summary
        handleShareClick();
        state.shareMode = false;
        render();
      }
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
      case 'list5': {
        ensureSession();
        const hasActive = state.session.horses.some((h) => h.state);
        if (!hasActive) {
          // No active horses yet → send user to Active Horses first
          setScreen('state');
        } else {
          setScreen(key);
        }
        break;
      }

      case 'list-prev':
        handleListPrevNext('prev');
        break;

      case 'list-next':
        handleListPrevNext('next');
        break;

      default:
        break;
    }
  });

  // ---------------------------------------------------------------------------
  // Initial render
  // ---------------------------------------------------------------------------

  render();
})();
