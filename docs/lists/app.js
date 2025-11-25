// app.js
// Mobile horse list app – single in-memory session

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config / data
  // ---------------------------------------------------------------------------

  const HORSE_NAMES = Array.from({ length: 25 }, (_, i) => `Horse ${i + 1}`);

  const state = {
    session: null,
    currentScreen: 'start',
    history: []
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
    render();
  }

  function goBack() {
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
    if (scr === 'state') return 'State';
    if (scr === 'summary') return 'Summary';
    const listMatch = scr.match(/^list([1-5])(Detail)?$/);
    if (listMatch) {
      const n = listMatch[1];
      if (listMatch[2]) return `List ${n} Detail`;
      return `List ${n}`;
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

    // Only show header action ("Text") on Summary
    if (scr === 'summary') {
      headerAction.hidden = false;
      headerAction.textContent = 'Text';
    } else {
      headerAction.hidden = true;
      headerAction.textContent = '';
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

  // State
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
          'Removing this horse from State will also remove it from all lists. Continue?'
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

    const inactive = horses.filter((h) => !h.state);
    const active = horses.filter((h) => h.state);

    if (inactive.length) {
      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Inactive (State)';
      screenRoot.appendChild(label);

      inactive.forEach((horse) => {
        createRow(horse.horseName, {
          onClick: () => handleStateHorseClick(horse.horseId)
        });
      });
    }

    if (active.length) {
      if (inactive.length) {
        const divider = document.createElement('div');
        divider.className = 'list-group-divider';
        screenRoot.appendChild(divider);
      }

      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Active (State)';
      screenRoot.appendChild(label);

      active.forEach((horse) => {
        createRow(horse.horseName, {
          active: true,
          onClick: () => handleStateHorseClick(horse.horseId)
        });
      });
    }

    if (!inactive.length && !active.length) {
      createRow('No horses found.', {});
    }
  }

  // List add view (FALSE in list, but state must be TRUE)
  function handleListHorseClick(listId, horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;

    // Only allow list membership if horse is active in state
    if (!horse.state) return;

    horse.lists[listId] = true;
    updateLastUpdated();
    render();
  }

  function renderListScreen(listId) {
    ensureSession();
    screenRoot.innerHTML = '';

    const horses = state.session.horses
      .filter((h) => h.state && !h.lists[listId])
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    if (horses.length === 0) {
      createRow('List complete.', {});
      return;
    }

    horses.forEach((horse) => {
      createRow(horse.horseName, {
        onClick: () => handleListHorseClick(listId, horse.horseId)
      });
    });
  }

  // List detail (grouped: inactive in list / active in list)
  function handleListDetailHorseClick(listId, horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;

    // Only list edits when globally active
    if (!horse.state) return;

    horse.lists[listId] = !horse.lists[listId];
    updateLastUpdated();
    render();
  }

  function renderListDetailScreen(listId) {
    ensureSession();
    screenRoot.innerHTML = '';

    const activeStateHorses = state.session.horses.filter((h) => h.state);

    const inactiveInList = activeStateHorses
      .filter((h) => !h.lists[listId])
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    const activeInList = activeStateHorses
      .filter((h) => h.lists[listId])
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    if (inactiveInList.length === 0 && activeInList.length === 0) {
      createRow('No active horses for this list.', {});
      return;
    }

    if (inactiveInList.length) {
      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Inactive in this list';
      screenRoot.appendChild(label);

      inactiveInList.forEach((horse) => {
        createRow(horse.horseName, {
          onClick: () => handleListDetailHorseClick(listId, horse.horseId)
        });
      });
    }

    if (activeInList.length) {
      if (inactiveInList.length) {
        const divider = document.createElement('div');
        divider.className = 'list-group-divider';
        screenRoot.appendChild(divider);
      }

      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Active in this list';
      screenRoot.appendChild(label);

      activeInList.forEach((horse) => {
        createRow(horse.horseName, {
          active: true,
          onClick: () => handleListDetailHorseClick(listId, horse.horseId)
        });
      });
    }
  }

  // Summary
  function renderSummaryScreen() {
    ensureSession();
    screenRoot.innerHTML = '';

    const horses = state.session.horses;
    const activeCount = horses.filter((h) => h.state).length;

    createRow('STATE', {
      tagText: String(activeCount),
      onClick: () => setScreen('state')
    });

    for (let i = 1; i <= 5; i++) {
      const listId = `list${i}`;
      const listCount = horses.filter(
        (h) => h.state && h.lists[listId]
      ).length;

      const isFull = activeCount > 0 && listCount === activeCount;
      const tagText = isFull ? `${listCount} ✔️` : String(listCount);

      createRow(`LIST ${i}`, {
        tagText,
        onClick: () => setScreen(`list${i}Detail`)
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Share / SMS
  // ---------------------------------------------------------------------------

  function buildShareText() {
    if (!state.session) return '';

    const horses = state.session.horses;
    const lines = [];

    // STATE
    lines.push('STATE');
    horses.forEach((h) => {
      if (h.state) lines.push(h.horseName);
    });
    lines.push('');

    // LIST 1..5 (only active horses)
    for (let i = 1; i <= 5; i++) {
      const listId = `list${i}`;
      lines.push(`LIST ${i}`);
      horses.forEach((h) => {
        if (h.state && h.lists[listId]) lines.push(h.horseName);
      });
      if (i < 5) lines.push('');
    }

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
    if (state.currentScreen === 'summary') {
      handleShareClick();
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
        ensureSession();
        setScreen(key);
        break;
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
