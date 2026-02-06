// tl.core.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});

  // ---------------------------------------------------------------------------
  // Paths / storage keys
  // ---------------------------------------------------------------------------

  TL.cfg = TL.cfg || {};

  // docs/lists/data/horses.json
  TL.cfg.HORSES_DATA_URL = './data/horses.json';

  // docs/lists/data/lists.json
  TL.cfg.LISTS_DATA_URL = './data/lists.json';

  TL.cfg.STORAGE_KEY_SESSION = 'tacklists_session_v1';
  TL.cfg.STORAGE_KEY_CATALOG = 'tacklists_horses_catalog_v1';
  TL.cfg.STORAGE_KEY_LISTS = 'tacklists_lists_catalog_v1';

  // 12-hour TTL
  TL.cfg.SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 43200000
  TL.cfg.SESSION_COOKIE_NAME = 'tacklists_session';
  TL.cfg.SESSION_COOKIE_MAX_AGE = 12 * 60 * 60; // 43200 seconds

  // ---------------------------------------------------------------------------
  // Fallback (hardcoded) lists + horses — kept as backup
  // ---------------------------------------------------------------------------

  TL.fallback = TL.fallback || {};

  TL.fallback.HORSE_NAMES = [
    "Cervin","Charly","Coin","Darcy","Dino","Dottie","Doug","Elliot","Gaston","Indy",
    "Kenny","King","Knox","Krypton","Lenny","Maiki","Milo","Minute","Navy","Oddur",
    "Orion","Paisley","Pedro","Peri","Q","Rimini","Star","Tank","Titan","Zen",
    "Munster","Bernie","Hurricane","Winnie","Caymus","BB"
  ];

  // Fallback lists (used only if lists.json is missing/unavailable)
  TL.fallback.FALLBACK_LISTS = [
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

  TL.state = TL.state || {
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

  TL.dom = TL.dom || {
    headerTitle: document.getElementById('header-title'),
    headerBack: document.getElementById('header-back'),
    headerAction: document.getElementById('header-action'),
    screenRoot: document.getElementById('screen-root'),
    navRow: document.getElementById('nav-row')
  };
})();
