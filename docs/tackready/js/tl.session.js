// tl.session.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.session = TL.session || {};

  function isExpired(expiresAt) {
    if (!expiresAt) return false;
    const t = Date.parse(String(expiresAt));
    if (!Number.isFinite(t)) return false;
    return t <= TL.storage.nowMs();
  }

  function touchSessionExpiry() {
    if (!TL.state.session) return;
    TL.state.session.expiresAt = new Date(TL.storage.nowMs() + TL.cfg.SESSION_TTL_MS).toISOString();
  }

  function loadSessionFromStorage() {
    const raw = TL.storage.get(TL.cfg.STORAGE_KEY_SESSION);
    if (!raw) return null;

    const parsed = TL.storage.safeJSONParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.horses)) return null;

    if (parsed.expiresAt && isExpired(parsed.expiresAt)) {
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
        for (const k of listKeys) lists[k] = !!(h.lists && h.lists[k]);

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
        barnActive: !!item.barnActive,
        state: false,
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
    touchSessionExpiry();
    saveSessionToStorage();
  }

  TL.session.isExpired = isExpired;
  TL.session.touchSessionExpiry = touchSessionExpiry;

  TL.session.loadSessionFromStorage = loadSessionFromStorage;
  TL.session.saveSessionToStorage = saveSessionToStorage;
  TL.session.clearSessionStorage = clearSessionStorage;

  TL.session.createNewSession = createNewSession;
  TL.session.ensureSession = ensureSession;
  TL.session.updateLastUpdated = updateLastUpdated;
})();
