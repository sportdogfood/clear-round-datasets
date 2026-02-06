// tl.session.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.session = TL.session || {};

  // ---------------------------------------------------------------------------
  // Session storage (localStorage)
  // ---------------------------------------------------------------------------

  function loadSessionFromStorage() {
    const raw = TL.storage.get(TL.cfg.STORAGE_KEY_SESSION);
    if (!raw) return null;

    const parsed = TL.storage.safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.horses)) return null;

    // If expired, treat as no session.
    if (parsed.expiresAt && TL.storage.isExpired(parsed.expiresAt)) {
      TL.storage.remove(TL.cfg.STORAGE_KEY_SESSION);
      TL.storage.clearSessionCookie();
      return null;
    }

    const cfg = TL.lists.getListsConfig();
    const listKeys = TL.lists.getListKeys(cfg);

    const horses = parsed.horses
      .filter((h) => h && typeof h === 'object')
      .map((h) => {
        const lists = {};
        for (const k of listKeys) {
          lists[k] = !!(h.lists && h.lists[k]);
        }

        return {
          horseId: String(h.horseId || ''),
          horseName: String(h.horseName || '').trim(),
          barnActive: !!h.barnActive,
          state: !!h.state,
          lists
        };
      })
      .filter((h) => h.horseId && h.horseName);

    if (!horses.length) return null;

    return {
      sessionId: String(parsed.sessionId || TL.storage.nowMs()),
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      lastUpdated: parsed.lastUpdated ? String(parsed.lastUpdated) : null,
      expiresAt: parsed.expiresAt ? String(parsed.expiresAt) : null,
      horses
    };
  }

  function saveSessionToStorage() {
    if (!TL.state.session) return;
    const ok = TL.storage.set(TL.cfg.STORAGE_KEY_SESSION, JSON.stringify(TL.state.session));
    if (ok) TL.storage.setSessionCookie();
  }

  function clearSessionStorage() {
    TL.storage.remove(TL.cfg.STORAGE_KEY_SESSION);
    TL.storage.clearSessionCookie();
  }

  // ---------------------------------------------------------------------------
  // Session helpers
  // ---------------------------------------------------------------------------

  function createNewSession() {
    const catalog = TL.catalog.getCatalog();
    const cfg = TL.lists.getListsConfig();
    const listKeys = TL.lists.getListKeys(cfg);

    const horses = catalog.map((item, index) => {
      const lists = {};
      for (const k of listKeys) lists[k] = false;

      return {
        horseId: `h${index + 1}`,
        horseName: item.horseName,
        barnActive: !!item.barnActive, // indicator only
        state: false,                  // manual selection only
        lists
      };
    });

    TL.state.session = {
      sessionId: TL.storage.nowMs().toString(),
      createdAt: new Date().toISOString(),
      lastUpdated: null,
      expiresAt: new Date(TL.storage.nowMs() + TL.cfg.SESSION_TTL_MS).toISOString(),
      horses
    };

    saveSessionToStorage();
  }

  function ensureSession() {
    if (!TL.state.session) createNewSession();
    TL.lists.normalizeSessionListsToConfig();
  }

  function updateLastUpdated() {
    if (!TL.state.session) return;
    TL.state.session.lastUpdated = new Date().toISOString();
    TL.storage.touchSessionExpiry(); // sliding TTL on any meaningful change
    saveSessionToStorage();
  }

  function findHorse(horseId) {
    if (!TL.state.session) return null;
    return TL.state.session.horses.find((h) => h.horseId === horseId) || null;
  }

  function horseLabel(horse) {
    // Indicator only. No auto-select.
    return horse.horseName + (horse.barnActive ? ' 🏷️' : '');
  }

  // groupby barnActive (A→Z) then others (A→Z)
  function sortBarnActiveThenName(list) {
    return list.slice().sort((a, b) => {
      const af = a.barnActive ? 1 : 0;
      const bf = b.barnActive ? 1 : 0;
      if (af !== bf) return bf - af; // true first
      return a.horseName.localeCompare(b.horseName);
    });
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

  // exports
  TL.session.loadSessionFromStorage = loadSessionFromStorage;
  TL.session.saveSessionToStorage = saveSessionToStorage;
  TL.session.clearSessionStorage = clearSessionStorage;

  TL.session.createNewSession = createNewSession;
  TL.session.ensureSession = ensureSession;
  TL.session.updateLastUpdated = updateLastUpdated;

  TL.session.findHorse = findHorse;
  TL.session.horseLabel = horseLabel;
  TL.session.sortBarnActiveThenName = sortBarnActiveThenName;
  TL.session.formatTimeShort = formatTimeShort;
})();
