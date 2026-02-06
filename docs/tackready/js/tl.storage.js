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
      const c = TL.cfg;
      document.cookie = `${c.SESSION_COOKIE_NAME}=1; Max-Age=${c.SESSION_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    } catch (_) {}
  }

  function clearSessionCookie() {
    try {
      const c = TL.cfg;
      document.cookie = `${c.SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
    } catch (_) {}
  }

  function migrateLegacySessionStorage() {
    try {
      const c = TL.cfg;

      const legacySession = sessionStorage.getItem(c.STORAGE_KEY_SESSION);
      if (legacySession && !storageGet(c.STORAGE_KEY_SESSION)) storageSet(c.STORAGE_KEY_SESSION, legacySession);
      if (legacySession) sessionStorage.removeItem(c.STORAGE_KEY_SESSION);

      const legacyCatalog = sessionStorage.getItem(c.STORAGE_KEY_CATALOG);
      if (legacyCatalog && !storageGet(c.STORAGE_KEY_CATALOG)) storageSet(c.STORAGE_KEY_CATALOG, legacyCatalog);
      if (legacyCatalog) sessionStorage.removeItem(c.STORAGE_KEY_CATALOG);

      const legacyLists = sessionStorage.getItem(c.STORAGE_KEY_LISTS);
      if (legacyLists && !storageGet(c.STORAGE_KEY_LISTS)) storageSet(c.STORAGE_KEY_LISTS, legacyLists);
      if (legacyLists) sessionStorage.removeItem(c.STORAGE_KEY_LISTS);
    } catch (_) {}
  }

  TL.storage.nowMs = nowMs;
  TL.storage.safeJSONParse = safeJSONParse;
  TL.storage.get = storageGet;
  TL.storage.set = storageSet;
  TL.storage.remove = storageRemove;
  TL.storage.setSessionCookie = setSessionCookie;
  TL.storage.clearSessionCookie = clearSessionCookie;
  TL.storage.migrateLegacySessionStorage = migrateLegacySessionStorage;
})();
