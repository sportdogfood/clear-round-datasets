// tl.lists.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.lists = TL.lists || {};

  function buildFallbackLists() {
    return TL.fallback.FALLBACK_LISTS.slice();
  }

  function normalizeListsStrict(raw) {
    if (!Array.isArray(raw)) return [];

    const out = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;

      const key = String(row.key || '').trim();
      const label = String(row.label || '').trim();
      if (!key || !label) continue;

      const type = row.type === 'state' ? 'state' : 'list';

      out.push({
        key,
        label,
        type,
        inNav: row.inNav !== false,
        inSummary: row.inSummary !== false,
        inShare: row.inShare !== false
      });
    }

    // Ensure we always have a state definition (minimum)
    const hasState = out.some((d) => d.key === 'state' || d.type === 'state');
    if (!hasState) {
      out.unshift({
        key: 'state',
        label: 'Active Horses',
        type: 'state',
        inNav: true,
        inSummary: true,
        inShare: true
      });
    }

    return out;
  }

  function loadListsFromStorage() {
    const raw = TL.storage.get(TL.cfg.STORAGE_KEY_LISTS);
    if (!raw) return null;

    const parsed = TL.storage.safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.items)) return null;

    const items = normalizeListsStrict(parsed.items);
    return items.length ? items : null;
  }

  function saveListsToStorage(items) {
    if (!Array.isArray(items) || !items.length) return;
    TL.storage.set(
      TL.cfg.STORAGE_KEY_LISTS,
      JSON.stringify({ savedAt: new Date().toISOString(), items })
    );
  }

  function getListsConfig() {
    if (Array.isArray(TL.state.listsConfig) && TL.state.listsConfig.length) return TL.state.listsConfig;
    return buildFallbackLists();
  }

  function getStateDef(cfg) {
    return cfg.find((d) => d.type === 'state' || d.key === 'state') || {
      key: 'state',
      label: 'Active Horses',
      type: 'state',
      inNav: true,
      inSummary: true,
      inShare: true
    };
  }

  function getListDefs(cfg) {
    // "list" type only; preserve config order
    return cfg.filter((d) => d && d.type === 'list' && String(d.key || '').startsWith('list'));
  }

  function getListKeys(cfg) {
    return getListDefs(cfg).map((d) => d.key);
  }

  function getLabelMap(cfg) {
    const map = {};
    for (const d of cfg) {
      if (d && d.key) map[d.key] = d.label;
    }
    return map;
  }

  function labelForKey(key) {
    const k = String(key || '');
    if (k === 'start') return 'Start';
    if (k === 'summary') return 'Summary';
    if (k === 'share') return 'Share';

    const cfg = getListsConfig();
    const map = getLabelMap(cfg);
    return map[k] || '';
  }

  function parseListScreen(scr) {
    const s = String(scr || '');
    if (!s.startsWith('list')) return null;
    const isDetail = s.endsWith('Detail');
    const key = isDetail ? s.slice(0, -6) : s; // remove "Detail"
    return { key, isDetail };
  }

  function isKnownListKey(key) {
    const cfg = getListsConfig();
    const keys = getListKeys(cfg);
    return keys.includes(String(key || ''));
  }

  function firstListKey() {
    const cfg = getListsConfig();
    const keys = getListKeys(cfg);
    return keys.length ? keys[0] : null;
  }

  function normalizeSessionListsToConfig() {
    if (!TL.state.session || !Array.isArray(TL.state.session.horses)) return;

    const cfg = getListsConfig();
    const listKeys = getListKeys(cfg);

    let changed = false;

    for (const h of TL.state.session.horses) {
      if (!h || typeof h !== 'object') continue;

      if (!h.lists || typeof h.lists !== 'object') {
        h.lists = {};
        changed = true;
      }

      for (const k of listKeys) {
        const before = !!h.lists[k];
        if (!(k in h.lists)) {
          h.lists[k] = false;
          changed = true;
        } else {
          h.lists[k] = before;
        }
      }
    }

    if (changed) {
      // Save without modifying lastUpdated
      if (TL.session && typeof TL.session.saveSessionToStorage === 'function') {
        TL.session.saveSessionToStorage();
      }
    }
  }

  async function loadListsConfig() {
    const cached = loadListsFromStorage();
    if (cached && cached.length) {
      TL.state.listsConfig = cached;
      TL.state.listsStatus = 'ready';
      normalizeSessionListsToConfig();
      if (TL.ui && TL.ui.render) TL.ui.render();

      // silent background refresh
      try {
        const res = await fetch(TL.cfg.LISTS_DATA_URL, { cache: 'no-store' });
        if (res && res.ok) {
          const raw = await res.json();
          const fresh = normalizeListsStrict(raw);
          if (fresh.length) {
            TL.state.listsConfig = fresh;
            TL.state.listsStatus = 'ready';
            saveListsToStorage(fresh);
            normalizeSessionListsToConfig();

            // if user is on a now-missing list screen, send to summary
            const p = parseListScreen(TL.state.currentScreen);
            if (p && !isKnownListKey(p.key)) TL.state.currentScreen = 'summary';

            if (TL.ui && TL.ui.render) TL.ui.render();
          }
        }
      } catch (_) {}
      return;
    }

    try {
      const res = await fetch(TL.cfg.LISTS_DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const raw = await res.json();
      const items = normalizeListsStrict(raw);

      if (items.length) {
        TL.state.listsConfig = items;
        TL.state.listsStatus = 'ready';
        saveListsToStorage(items);
        normalizeSessionListsToConfig();
        if (TL.ui && TL.ui.render) TL.ui.render();
        return;
      }
      throw new Error('empty');
    } catch (_) {
      TL.state.listsConfig = buildFallbackLists();
      TL.state.listsStatus = 'fallback';
      saveListsToStorage(TL.state.listsConfig);
      normalizeSessionListsToConfig();
      if (TL.ui && TL.ui.render) TL.ui.render();
    }
  }

  // exports
  TL.lists.buildFallbackLists = buildFallbackLists;
  TL.lists.normalizeListsStrict = normalizeListsStrict;

  TL.lists.loadListsFromStorage = loadListsFromStorage;
  TL.lists.saveListsToStorage = saveListsToStorage;

  TL.lists.getListsConfig = getListsConfig;
  TL.lists.getStateDef = getStateDef;
  TL.lists.getListDefs = getListDefs;
  TL.lists.getListKeys = getListKeys;

  TL.lists.getLabelMap = getLabelMap;
  TL.lists.labelForKey = labelForKey;

  TL.lists.parseListScreen = parseListScreen;
  TL.lists.isKnownListKey = isKnownListKey;
  TL.lists.firstListKey = firstListKey;

  TL.lists.normalizeSessionListsToConfig = normalizeSessionListsToConfig;
  TL.lists.loadListsConfig = loadListsConfig;
})();
