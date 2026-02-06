// tl.storage.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.storage = TL.storage || {};

  function nowMs() {
    return Date.now();
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
      TL.state.storageOk = true;
      return true;
    } catch (_) {
      TL.state.storageOk = false;
      return false;
    }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function setSessionCookie() {
    try {
      document.cookie = `${TL.cfg.SESSION_COOKIE_NAME}=1; Max-Age=${TL.cfg.SESSION_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    } catch (_) {}
  }

  function clearSessionCookie() {
    try {
      document.cookie = `${TL.cfg.SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
    } catch (_) {}
  }

  function touchSessionExpiry() {
    if (!TL.state.session) return;
    TL.state.session.expiresAt = new Date(nowMs() + TL.cfg.SESSION_TTL_MS).toISOString();
  }

  function isExpired(expiresAt) {
    if (!expiresAt) return false;
    const t = Date.parse(String(expiresAt));
    if (!Number.isFinite(t)) return false;
    return t <= nowMs();
  }

  // Migrate legacy sessionStorage -> localStorage (one-time, best-effort)
  function migrateLegacySessionStorage() {
    try {
      const legacySession = sessionStorage.getItem(TL.cfg.STORAGE_KEY_SESSION);
      if (legacySession && !storageGet(TL.cfg.STORAGE_KEY_SESSION)) {
        storageSet(TL.cfg.STORAGE_KEY_SESSION, legacySession);
      }
      if (legacySession) sessionStorage.removeItem(TL.cfg.STORAGE_KEY_SESSION);

      const legacyCatalog = sessionStorage.getItem(TL.cfg.STORAGE_KEY_CATALOG);
      if (legacyCatalog && !storageGet(TL.cfg.STORAGE_KEY_CATALOG)) {
        storageSet(TL.cfg.STORAGE_KEY_CATALOG, legacyCatalog);
      }
      if (legacyCatalog) sessionStorage.removeItem(TL.cfg.STORAGE_KEY_CATALOG);

      const legacyLists = sessionStorage.getItem(TL.cfg.STORAGE_KEY_LISTS);
      if (legacyLists && !storageGet(TL.cfg.STORAGE_KEY_LISTS)) {
        storageSet(TL.cfg.STORAGE_KEY_LISTS, legacyLists);
      }
      if (legacyLists) sessionStorage.removeItem(TL.cfg.STORAGE_KEY_LISTS);
    } catch (_) {}
  }

  // exports
  TL.storage.nowMs = nowMs;
  TL.storage.safeJSONParse = safeJSONParse;
  TL.storage.get = storageGet;
  TL.storage.set = storageSet;
  TL.storage.remove = storageRemove;

  TL.storage.setSessionCookie = setSessionCookie;
  TL.storage.clearSessionCookie = clearSessionCookie;

  TL.storage.touchSessionExpiry = touchSessionExpiry;
  TL.storage.isExpired = isExpired;
  TL.storage.migrateLegacySessionStorage = migrateLegacySessionStorage;
})();
