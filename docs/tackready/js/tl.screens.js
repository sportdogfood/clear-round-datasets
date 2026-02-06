// tl.screens.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.screens = TL.screens || {};

  // -----------------------------
  // Local helpers (screen-only)
  // -----------------------------

  const TTL_MS_FALLBACK = 12 * 60 * 60 * 1000;

  function dom() {
    TL.dom = TL.dom || {};
    if (!TL.dom.screenRoot) TL.dom.screenRoot = document.getElementById('screen-root');
    return TL.dom;
  }

  function st() {
    TL.state = TL.state || {};
    return TL.state;
  }

  function nowMs() {
    return Date.now();
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

  function ensureSessionOrShowStartRow() {
    const S = st();
    if (TL.session && typeof TL.session.ensureSession === 'function') {
      TL.session.ensureSession();
      return true;
    }
    if (S.session) return true;

    // soft fail (won’t throw): show a single row guiding user to Start
    const root = dom().screenRoot;
    if (!root) return false;
    root.innerHTML = '';
    createRow('No session. Tap Start → New session.', {
      tagVariant: 'boolean',
      tagPositive: false,
      onClick: () => setScreen('start')
    });
    return false;
  }

  function touchSessionExpiry() {
    const S = st();
    if (!S.session) return;
    const ttl =
      (TL.cfg && Number(TL.cfg.SESSION_TTL_MS)) ||
      (TL.session && Number(TL.session.SESSION_TTL_MS)) ||
      TTL_MS_FALLBACK;

    S.session.expiresAt = new Date(nowMs() + ttl).toISOString();
  }

  function saveSession() {
    if (TL.session && typeof TL.session.saveSessionToStorage === 'function') {
      TL.session.saveSessionToStorage();
    }
  }

  function updateLastUpdated() {
    const S = st();
    if (!S.session) return;

    S.session.lastUpdated = new Date().toISOString();
    touchSessionExpiry();
    saveSession();
  }

  function findHorse(horseId) {
    const S = st();
    if (!S.session || !Array.isArray(S.session.horses)) return null;
    return S.session.horses.find((h) => h && h.horseId === horseId) || null;
  }

  function horseLabel(horse) {
    return horse.horseName + (horse.barnActive ? ' 🏷️' : '');
  }

  function sortBarnActiveThenName(list) {
    return list.slice().sort((a, b) => {
      const af = a.barnActive ? 1 : 0;
      const bf = b.barnActive ? 1 : 0;
      if (af !== bf) return bf - af;
      return a.horseName.localeCompare(b.horseName);
    });
  }

  function setScreen(screenKey) {
    if (TL.router && typeof TL.router.setScreen === 'function') {
      TL.router.setScreen(screenKey);
      return;
    }
    const S = st();
    S.currentScreen = screenKey;
    if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();
  }

  function createRow(label, options = {}) {
    const { tagText, tagVariant, tagPositive, active, onClick } = options;
    const root = dom().screenRoot;
    if (!root) return;

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

    root.appendChild(row);
  }

  // -----------------------------
  // Screen implementations
  // -----------------------------

  function renderStartScreen() {
    const S = st();
    const root = dom().screenRoot;
    if (!root) return;

    root.innerHTML = '';

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
    root.appendChild(logo);

    const hasSession = !!S.session;

    if (!hasSession) {
      createRow('New session', {
        tagVariant: 'boolean',
        tagPositive: false,
        onClick: () => {
          if (TL.session && typeof TL.session.clearSessionStorage === 'function') TL.session.clearSessionStorage();
          if (TL.session && typeof TL.session.createNewSession === 'function') TL.session.createNewSession();
          setScreen('state');
        }
      });

      const note = document.createElement('div');
      note.style.margin = '10px 10px 0';
      note.style.fontSize = '12px';
      note.style.color = 'rgba(209, 213, 219, 0.9)';
      note.style.lineHeight = '1.35';
      note.textContent = S.storageOk === false
        ? 'Autosave: OFF (storage blocked in this browser).'
        : 'Autosave: ON (device). Expires after 12 hours of inactivity.';
      root.appendChild(note);
      return;
    }

    const horses = S.session.horses || [];
    const activeCount = horses.filter((h) => h && h.state).length;

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
        if (TL.session && typeof TL.session.clearSessionStorage === 'function') TL.session.clearSessionStorage();
        if (TL.session && typeof TL.session.createNewSession === 'function') TL.session.createNewSession();
        setScreen('state');
      }
    });

    const lastSavedIso = S.session.lastUpdated || S.session.createdAt;
    const lastSaved = formatTimeShort(lastSavedIso);
    const expires = formatTimeShort(S.session.expiresAt);

    const note = document.createElement('div');
    note.style.margin = '10px 10px 0';
    note.style.fontSize = '12px';
    note.style.color = 'rgba(209, 213, 219, 0.9)';
    note.style.lineHeight = '1.35';

    if (S.storageOk === false) {
      note.textContent = 'Autosave: OFF (storage blocked in this browser).';
    } else {
      const parts = [];
      parts.push('Autosave: ON (device).');
      if (lastSaved) parts.push(`Last save: ${lastSaved}.`);
      if (expires) parts.push(`Expires: ${expires}.`);
      else parts.push('Expires after 12 hours of inactivity.');
      note.textContent = parts.join(' ');
    }

    root.appendChild(note);
  }

  function handleStateHorseClick(horseId) {
    const horse = findHorse(horseId);
    if (!horse) return;

    if (!horse.state) {
      horse.state = true;
    } else {
      const inAnyList =
        horse.lists && typeof horse.lists === 'object'
          ? Object.values(horse.lists).some(Boolean)
          : false;

      if (inAnyList) {
        const ok = window.confirm(
          'Removing this horse from Active Horses will also remove it from all lists. Continue?'
        );
        if (!ok) return;

        horse.state = false;
        if (horse.lists && typeof horse.lists === 'object') {
          Object.keys(horse.lists).forEach((k) => {
            horse.lists[k] = false;
          });
        }
      } else {
        horse.state = false;
      }
    }

    updateLastUpdated();
    if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();
  }

  function renderStateScreen() {
    const S = st();
    const root = dom().screenRoot;
    if (!root) return;

    if (!ensureSessionOrShowStartRow()) return;

    root.innerHTML = '';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'state-search';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'state-search-input';
    searchInput.placeholder = 'Search horses...';
    searchInput.value = S.stateFilter || '';

    searchInput.addEventListener('input', (e) => {
      S.stateFilter = e.target.value || '';
      if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();
    });

    searchWrap.appendChild(searchInput);
    root.appendChild(searchWrap);

    const sorted = sortBarnActiveThenName(S.session.horses || []);

    const term = (S.stateFilter || '').trim().toLowerCase();
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
      root.appendChild(label);

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
        root.appendChild(divider);
      }

      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Inactive';
      root.appendChild(label);

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
    if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();
  }

  function renderListGrouped(listKey) {
    const S = st();
    const root = dom().screenRoot;
    if (!root) return;

    if (!ensureSessionOrShowStartRow()) return;

    root.innerHTML = '';

    const activeStateHorses = sortBarnActiveThenName(
      (S.session.horses || []).filter((h) => h.state)
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
      root.appendChild(label);

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
        root.appendChild(divider);
      }

      const label = document.createElement('div');
      label.className = 'list-group-label';
      label.textContent = 'Not Packed';
      root.appendChild(label);

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
    const S = st();
    const root = dom().screenRoot;
    if (!root) return;

    if (!ensureSessionOrShowStartRow()) return;

    root.innerHTML = '';

    const horses = S.session.horses || [];
    const activeCount = horses.filter((h) => h.state).length;

    createRow((TL.lists && TL.lists.labelForKey ? TL.lists.labelForKey('state') : 'Active Horses') || 'Active Horses', {
      tagText: String(activeCount),
      tagVariant: 'count',
      tagPositive: activeCount > 0,
      onClick: () => setScreen('state')
    });

    const cfg = TL.lists && TL.lists.getListsConfig ? TL.lists.getListsConfig() : [];
    const listDefs =
      TL.lists && TL.lists.getListDefs ? TL.lists.getListDefs(cfg).filter((d) => d.inSummary !== false) : [];

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

  function buildShareTextPackedOrNotPacked(mode) {
    const S = st();
    if (!S.session) return '';

    const horses = S.session.horses || [];
    const activeHorses = horses
      .filter((h) => h.state)
      .slice()
      .sort((a, b) => a.horseName.localeCompare(b.horseName));

    const lines = [];
    const title = mode === 'notPacked' ? 'NOT PACKED' : 'PACKED';
    const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });

    lines.push(`** ${title} ** ${dateStr}`);

    const cfg = TL.lists && TL.lists.getListsConfig ? TL.lists.getListsConfig() : [];
    const listDefs =
      TL.lists && TL.lists.getListDefs ? TL.lists.getListDefs(cfg).filter((d) => d.inShare !== false) : [];

    let firstSection = true;

    for (const d of listDefs) {
      const listKey = d.key;
      const label = d.label || listKey;

      const members =
        mode === 'notPacked'
          ? activeHorses.filter((h) => !(h.lists && h.lists[listKey]))
          : activeHorses.filter((h) => !!(h.lists && h.lists[listKey]));

      if (!firstSection) lines.push('');
      firstSection = false;

      lines.push(`- ${label} -`);

      if (!members.length) lines.push('[none]');
      else members.forEach((h) => lines.push(h.horseName));
    }

    return lines.join('\n');
  }

  function handleShareClick(mode) {
    if (!ensureSessionOrShowStartRow()) return;
    const body = buildShareTextPackedOrNotPacked(mode);
    if (!body) return;

    const href = 'sms:?&body=' + encodeURIComponent(body);
    window.location.href = href;
  }

  function renderShareScreen() {
    const root = dom().screenRoot;
    if (!root) return;

    if (!ensureSessionOrShowStartRow()) return;

    root.innerHTML = '';

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

  // -----------------------------
  // Public: TL.screens.render()
  // -----------------------------

  TL.screens.render = function render(screenKey) {
    const scr = String(screenKey || 'start');

    if (scr === 'start') return renderStartScreen();
    if (scr === 'state') return renderStateScreen();
    if (scr === 'summary') return renderSummaryScreen();
    if (scr === 'share') return renderShareScreen();

    const p =
      TL.lists && typeof TL.lists.parseListScreen === 'function'
        ? TL.lists.parseListScreen(scr)
        : null;

    const isKnown =
      p &&
      TL.lists &&
      typeof TL.lists.isKnownListKey === 'function' &&
      TL.lists.isKnownListKey(p.key);

    if (isKnown) {
      if (p.isDetail) return renderListDetailScreen(p.key);
      return renderListScreen(p.key);
    }

    return renderStartScreen();
  };
})();
