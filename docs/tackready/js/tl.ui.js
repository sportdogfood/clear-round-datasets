// tl.ui.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.ui = TL.ui || {};

  function titleForScreen(scr) {
    const s = String(scr || '');
    if (s === 'start') return 'Start';
    if (s === 'summary') return 'Summary';
    if (s === 'share') return 'Share';

    if (s === 'state') return TL.lists.labelForKey('state');

    const p = TL.lists.parseListScreen(s);
    if (p && TL.lists.isKnownListKey(p.key)) {
      const base = TL.lists.labelForKey(p.key) || p.key;
      return p.isDetail ? `${base} Detail` : base;
    }

    return '';
  }

  function renderHeader() {
    const scr = TL.state.currentScreen;
    TL.dom.headerTitle.textContent = titleForScreen(scr);

    const hideBack = TL.state.history.length === 0 && scr === 'start';
    TL.dom.headerBack.style.visibility = hideBack ? 'hidden' : 'visible';

    const p = TL.lists.parseListScreen(scr);
    const isListScreen = !!(p && TL.lists.isKnownListKey(p.key));

    const headerAction = TL.dom.headerAction;

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

    const buttons = TL.dom.navRow ? TL.dom.navRow.querySelectorAll('.nav-btn') : [];
    buttons.forEach((btn) => {
      btn.classList.remove('nav-btn--primary');
      const key = btn.dataset.screen;
      if (activeKey && key === activeKey) btn.classList.add('nav-btn--primary');
    });
  }

  function updateNavAggregates() {
    if (!TL.dom.navRow) return;

    const aggEls = TL.dom.navRow.querySelectorAll('[data-nav-agg]');
    if (!aggEls.length) return;

    const horses = TL.state.session ? TL.state.session.horses : [];
    const activeCount = horses.filter((h) => h.state).length;

    const cfg = TL.lists.getListsConfig();
    const listDefs = TL.lists.getListDefs(cfg);

    const listCounts = {};
    for (const d of listDefs) {
      const k = d.key;
      listCounts[k] = horses.filter((h) => h.state && h.lists && h.lists[k]).length;
    }

    function setAgg(key, value) {
      const el = TL.dom.navRow.querySelector(`[data-nav-agg="${key}"]`);
      if (!el) return;
      const n = Number(value) || 0;
      el.textContent = String(n);
      if (n > 0) el.classList.add('nav-agg--positive');
      else el.classList.remove('nav-agg--positive');
    }

    setAgg('state', activeCount);
    for (const d of listDefs) setAgg(d.key, listCounts[d.key] || 0);

    const summaryListDefs = listDefs.filter((d) => d.inSummary !== false);
    const listsWithAny = summaryListDefs
      .map((d) => listCounts[d.key] || 0)
      .filter((c) => c > 0).length;

    setAgg('summary', listsWithAny);
  }

  function render() {
    renderHeader();
    renderNav();
    updateNavAggregates();

    if (TL.screens && typeof TL.screens.render === 'function') {
      TL.screens.render(TL.state.currentScreen);
      return;
    }
  }
// ---------------------------------------------------------------------------
// Navigation helpers (used by tl.boot.js)
// ---------------------------------------------------------------------------
TL.ui.setScreen = function setScreen(newScreen, pushHistory = true) {
  const s = String(newScreen || 'start');

  if (pushHistory && TL.state.currentScreen && TL.state.currentScreen !== s) {
    TL.state.history.push(TL.state.currentScreen);
  }

  TL.state.currentScreen = s;
  TL.ui.render();
};

TL.ui.goBack = function goBack() {
  const prev = TL.state.history.pop();
  TL.state.currentScreen = prev || 'start';
  TL.ui.render();
};
TL.ui.handleListPrevNext = function handleListPrevNext(direction) {
  const p = TL.lists.parseListScreen(TL.state.currentScreen);
  if (!p) return;

  const cfg = TL.lists.getListsConfig();
  const listKeys = TL.lists.getListKeys(cfg);
  const idx = listKeys.indexOf(p.key);
  if (idx === -1) return;

  if (direction === 'prev' && idx > 0) {
    TL.ui.setScreen(listKeys[idx - 1]);
  } else if (direction === 'next') {
    if (idx < listKeys.length - 1) TL.ui.setScreen(listKeys[idx + 1]);
    else TL.ui.setScreen('summary');
  }
};

  TL.ui.titleForScreen = titleForScreen;
  TL.ui.renderHeader = renderHeader;
  TL.ui.renderNav = renderNav;
  TL.ui.updateNavAggregates = updateNavAggregates;
  TL.ui.render = render;
})();
