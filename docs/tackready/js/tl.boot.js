// tl.boot.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  const { headerBack, headerAction, navRow } = TL.dom;

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  headerBack.addEventListener('click', () => {
    if (headerBack.style.visibility === 'hidden') return;
    TL.ui.goBack();
  });

  headerAction.addEventListener('click', () => {
    const action = headerAction.dataset.action;

    if (TL.state.currentScreen === 'summary' && action === 'go-share') {
      TL.ui.setScreen('share');
      return;
    }

    if (action === 'go-first-list') {
      TL.session.ensureSession();
      const first = TL.lists.firstListKey();
      if (first) TL.ui.setScreen(first);
      else TL.ui.setScreen('summary');
      return;
    }

    if (action === 'next-list') {
      TL.ui.handleListPrevNext('next');
    }
  });

  if (navRow) {
    navRow.addEventListener('click', (evt) => {
      const btn = evt.target.closest('.nav-btn');
      if (!btn) return;

      const key = btn.dataset.screen;
      if (!key) return;

      if (key === 'start') {
        TL.ui.setScreen('start');
        return;
      }

      if (key === 'state') {
        TL.session.ensureSession();
        TL.ui.setScreen('state');
        return;
      }

      if (key === 'summary') {
        TL.session.ensureSession();
        TL.ui.setScreen('summary');
        return;
      }

      if (String(key).startsWith('list')) {
        TL.session.ensureSession();
        const hasActive = TL.state.session.horses.some((h) => h.state);
        if (!hasActive) TL.ui.setScreen('state');
        else if (TL.lists.isKnownListKey(key)) TL.ui.setScreen(key);
        else TL.ui.setScreen('summary');
        return;
      }
    });
  }

  // Extra safety: persist on tab hide/close (no state changes, just a save)
  window.addEventListener('pagehide', () => {
    TL.session.saveSessionToStorage();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      TL.session.saveSessionToStorage();
    }
  });

  // ---------------------------------------------------------------------------
  // Boot (mirrors original order/behavior)
  // ---------------------------------------------------------------------------

  TL.storage.migrateLegacySessionStorage();

  // Seed lists config synchronously so session load can normalize list keys
  TL.state.listsConfig = TL.lists.loadListsFromStorage() || TL.lists.buildFallbackLists();
  TL.state.listsStatus = (Array.isArray(TL.state.listsConfig) && TL.state.listsConfig.length) ? 'ready' : 'fallback';


  
  TL.state.session = TL.session.loadSessionFromStorage();

  // If we resumed a valid session, extend TTL for another 12 hours (no lastUpdated change)
  if (TL.state.session) {
    TL.lists.normalizeSessionListsToConfig();
    TL.storage.touchSessionExpiry();
    TL.session.saveSessionToStorage();
  }

  TL.ui.render();

  // background loads
  if (TL.lists && typeof TL.lists.loadListsConfig === 'function') TL.lists.loadListsConfig();
  if (TL.catalog && typeof TL.catalog.loadCatalog === 'function') TL.catalog.loadCatalog();

})();
