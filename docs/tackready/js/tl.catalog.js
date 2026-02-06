// tl.catalog.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.catalog = TL.catalog || {};

  function loadCatalogFromStorage() {
    const raw = TL.storage.get(TL.cfg.STORAGE_KEY_CATALOG);
    if (!raw) return null;

    const parsed = TL.storage.safeJSONParse(raw);
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
    TL.storage.set(
      TL.cfg.STORAGE_KEY_CATALOG,
      JSON.stringify({ savedAt: new Date().toISOString(), items })
    );
  }

  // ---------------------------------------------------------------------------
  // Catalog normalization (horses.json -> [{ horseName, barnActive }])
  // Barn Name + Horse_Active only
  // ---------------------------------------------------------------------------

  function buildFallbackCatalog() {
    return TL.fallback.HORSE_NAMES
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
      TL.state.catalog = cached;
      TL.state.catalogStatus = 'ready';
      if (TL.ui && TL.ui.render) TL.ui.render();

      // silent background refresh
      try {
        const res = await fetch(TL.cfg.HORSES_DATA_URL, { cache: 'no-store' });
        if (res && res.ok) {
          const raw = await res.json();
          const fresh = normalizeCatalogStrict(raw);
          if (fresh.length) {
            TL.state.catalog = fresh;
            TL.state.catalogStatus = 'ready';
            saveCatalogToStorage(fresh);
            if (TL.ui && TL.ui.render) TL.ui.render();
          }
        }
      } catch (_) {}
      return;
    }

    try {
      const res = await fetch(TL.cfg.HORSES_DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const raw = await res.json();
      const items = normalizeCatalogStrict(raw);

      if (items.length) {
        TL.state.catalog = items;
        TL.state.catalogStatus = 'ready';
        saveCatalogToStorage(items);
        if (TL.ui && TL.ui.render) TL.ui.render();
        return;
      }
      throw new Error('empty');
    } catch (_) {
      TL.state.catalog = buildFallbackCatalog();
      TL.state.catalogStatus = 'fallback';
      saveCatalogToStorage(TL.state.catalog);
      if (TL.ui && TL.ui.render) TL.ui.render();
    }
  }

  function getCatalog() {
    if (Array.isArray(TL.state.catalog) && TL.state.catalog.length) return TL.state.catalog;
    return buildFallbackCatalog();
  }

  // exports
  TL.catalog.loadCatalogFromStorage = loadCatalogFromStorage;
  TL.catalog.saveCatalogToStorage = saveCatalogToStorage;

  TL.catalog.buildFallbackCatalog = buildFallbackCatalog;
  TL.catalog.normalizeCatalogStrict = normalizeCatalogStrict;

  TL.catalog.loadCatalog = loadCatalog;
  TL.catalog.getCatalog = getCatalog;
})();
