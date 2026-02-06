// tl.catalog.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.catalog = TL.catalog || {};

  // docs/lists/data/horses.json
  const HORSES_DATA_URL = './data/horses.json';

  const STORAGE_KEY_CATALOG = 'tacklists_horses_catalog_v1';

  // Fallback horses (backup only)
  const HORSE_NAMES = [
    'Cervin','Charly','Coin','Darcy','Dino','Dottie','Doug','Elliot','Gaston','Indy',
    'Kenny','King','Knox','Krypton','Lenny','Maiki','Milo','Minute','Navy','Oddur',
    'Orion','Paisley','Pedro','Peri','Q','Rimini','Star','Tank','Titan','Zen',
    'Munster','Bernie','Hurricane','Winnie','Caymus','BB'
  ];

  function state() {
    TL.state = TL.state || {};
    return TL.state;
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
      const S = state();
      S.storageOk = true;
      return true;
    } catch (_) {
      const S = state();
      S.storageOk = false;
      return false;
    }
  }

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

  function buildFallbackCatalog() {
    return HORSE_NAMES
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .map((horseName) => ({ horseName, barnActive: false }));
  }

  // horses.json -> [{ horseName, barnActive }]
  // Barn Name + Horse_Active only
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

  TL.catalog.getCatalog = function () {
    const S = state();
    if (Array.isArray(S.catalog) && S.catalog.length) return S.catalog;
    return buildFallbackCatalog();
  };

  TL.catalog.loadCatalog = async function () {
    const S = state();

    const cached = loadCatalogFromStorage();
    if (cached && cached.length) {
      S.catalog = cached;
      S.catalogStatus = 'ready';
      if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();

      // silent background refresh
      try {
        const res = await fetch(HORSES_DATA_URL, { cache: 'no-store' });
        if (res && res.ok) {
          const raw = await res.json();
          const fresh = normalizeCatalogStrict(raw);
          if (fresh.length) {
            S.catalog = fresh;
            S.catalogStatus = 'ready';
            saveCatalogToStorage(fresh);
            if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();
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
        S.catalog = items;
        S.catalogStatus = 'ready';
        saveCatalogToStorage(items);
        if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();
        return;
      }
      throw new Error('empty');
    } catch (_) {
      S.catalog = buildFallbackCatalog();
      S.catalogStatus = 'fallback';
      saveCatalogToStorage(S.catalog);
      if (TL.ui && typeof TL.ui.render === 'function') TL.ui.render();
    }
  };
})();
