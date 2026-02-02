// app.js — FeedBoard (legacy shell compatible)
// Canonical read:  /docs/feed/data/latest/{board}.json (default board: feed_board)
// Canonical write: POST https://items.clearroundtravel.com/feed/commit
//
// Screen mapping (bottom nav):
//   state   -> Horse List (toggle selection)
//   list1   -> Active List (selected horses only)
//   detail  -> Horse Detail (edit + Save/Back)
//   summary -> Summary (selected horses sorted by boardNumber)
//   list8   -> Text/Share

(function () {
  'use strict';

  // ----------------------------
  // DOM
  // ----------------------------
  const elTitle = document.getElementById('header-title');
  const elBack = document.getElementById('header-back');
  const elAction = document.getElementById('header-action');
  const elRoot = document.getElementById('screen-root');
  const elNavRow = document.getElementById('nav-row') || document;

  // ----------------------------
  // CONFIG
  // ----------------------------
  const DEFAULT_BOARD_ID = 'feed_board';

  const ITEMS_ORIGIN = 'https://items.clearroundtravel.com';
  const CANONICAL_READ_PATH = '/docs/feed/data/latest/';
  const DEFAULT_SAVE_URL = `${ITEMS_ORIGIN}/feed/commit`;

  // Local session (selection + drafts only)
  const SESSION_VERSION = 'v1';

  // Field aliases (accepts multiple input keys; draft/save uses canonical keys)
  const FIELD = {
    horse_id: ['horse_id', 'horseId', 'horseID', 'id'],
    horseName: ['horseName', 'horse_name', 'name', 'horse'],
    boardNumber: ['boardNumber', 'board_number', 'board_no', 'boardSlot', 'slot'],
    feed_display: ['feed_display', 'feedDisplay', 'feed', 'feed_name'],
    EEMix: ['EEMix', 'eeMix', 'eemix', 'EE_Mix'],
    Positude: ['Positude', 'positude'],
    OM3GA: ['OM3GA', 'om3ga', 'omega3', 'Omega3'],
    horse_feed_note: ['horse_feed_note', 'horseFeedNote', 'feed_note', 'note', 'notes']
  };

  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    screen: 'state',
    boardId: DEFAULT_BOARD_ID,

    boardJson: null,    // raw json
    rows: [],           // raw rows
    horses: [],         // derived horses

    // local-only
    session: { selected: {}, drafts: {} },
    expandedNotes: {},

    // ui filters
    searchText: '',

    // detail
    detailHorseId: null,
    showSlotPicker: false,

    // endpoints
    dataUrl: '',
    saveUrl: null
  };

  // ----------------------------
  // NAV COMPAT
  // ----------------------------
  // Normalize whatever bottom-nav tabs exist into canonical FeedBoard screens.
  // New shells should have: state, list1, summary, list8, (optional: start)
  // Legacy shells often have: list1, list2, list3, summary (with unrelated labels).
  const navCompat = {
    initialized: false,
    canonicalToActual: { state: 'state', list1: 'list1', summary: 'summary', list8: 'list8', start: 'start' },
    actualToCanonical: { state: 'state', list1: 'list1', summary: 'summary', list8: 'list8', start: 'start' }
  };

  function setNavLabel(btn, text) {
    if (!btn) return;
    const el = btn.querySelector('.nav-label');
    if (el) el.textContent = text;
  }

  function initNavCompat() {
    if (navCompat.initialized) return;
    navCompat.initialized = true;

    const btns = Array.from(document.querySelectorAll('.nav-btn[data-screen]'));
    if (!btns.length) return;

    const hasState = !!document.querySelector('.nav-btn[data-screen="state"]');
    const hasList8 = !!document.querySelector('.nav-btn[data-screen="list8"]');

    // New shell: just relabel.
    if (hasState && hasList8) {
      navCompat.canonicalToActual = { state: 'state', list1: 'list1', summary: 'summary', list8: 'list8', start: 'start' };
      navCompat.actualToCanonical = { state: 'state', list1: 'list1', summary: 'summary', list8: 'list8', start: 'start' };

      btns.forEach(btn => {
        const s = btn.getAttribute('data-screen');
        if (s === 'state') setNavLabel(btn, 'Horse List');
        else if (s === 'list1') setNavLabel(btn, 'Active List');
        else if (s === 'summary') setNavLabel(btn, 'Summary');
        else if (s === 'list8') setNavLabel(btn, 'Text');
        else if (s === 'start') setNavLabel(btn, 'Restart');
      });
      return;
    }

    // Legacy shell: pick the first 3 non-summary/non-start tabs in DOM order
    // and map them to Horse List, Active List, Text.
    const summaryBtn = btns.find(b => (b.getAttribute('data-screen') || '') === 'summary') || null;
    const startBtn = btns.find(b => (b.getAttribute('data-screen') || '') === 'start') || null;

    const candidates = btns.filter(b => {
      const ds = (b.getAttribute('data-screen') || '').trim();
      return ds && ds !== 'summary' && ds !== 'start';
    });

    const actualState = (candidates[0] && candidates[0].getAttribute('data-screen')) || 'list1';
    const actualActive = (candidates[1] && candidates[1].getAttribute('data-screen')) || (candidates[0] && candidates[0].getAttribute('data-screen')) || 'list2';
    const actualText = (candidates[2] && candidates[2].getAttribute('data-screen')) || (candidates[1] && candidates[1].getAttribute('data-screen')) || 'list3';

    navCompat.canonicalToActual = {
      state: actualState,
      list1: actualActive,
      summary: summaryBtn ? (summaryBtn.getAttribute('data-screen') || 'summary') : 'summary',
      list8: actualText,
      start: startBtn ? (startBtn.getAttribute('data-screen') || 'start') : 'start'
    };

    navCompat.actualToCanonical = {};
    Object.keys(navCompat.canonicalToActual).forEach(k => {
      const actual = navCompat.canonicalToActual[k];
      if (actual) navCompat.actualToCanonical[actual] = k;
    });

    // Relabel mapped tabs; hide any extra tabs.
    btns.forEach(btn => {
      const ds = (btn.getAttribute('data-screen') || '').trim();
      const canon = navCompat.actualToCanonical[ds] || null;
      if (!canon) {
        btn.style.display = 'none';
        return;
      }
      if (canon === 'state') setNavLabel(btn, 'Horse List');
      else if (canon === 'list1') setNavLabel(btn, 'Active List');
      else if (canon === 'summary') setNavLabel(btn, 'Summary');
      else if (canon === 'list8') setNavLabel(btn, 'Text');
      else if (canon === 'start') setNavLabel(btn, 'Restart');
    });
  }

  // ----------------------------
  // HELPERS
  // ----------------------------
  function qs(name) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch (_) {
      return null;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function mk(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function clearRoot() {
    while (elRoot.firstChild) elRoot.removeChild(elRoot.firstChild);
  }

  function getAny(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
    }
    return null;
  }

  function toInt(v) {
    if (v == null) return null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  function toBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (v == null) return false;
    if (typeof v === 'number') return v !== 0;
    const s = String(v).trim().toLowerCase();
    if (!s) return false;
    if (s === '0' || s === 'false' || s === 'no' || s === 'n' || s === 'off') return false;
    // Non-empty strings like "PM" or "AM  |  PM" are treated as ON.
    return true;
  }

  const SUPP_DEFAULTS = {
    EEMix: 'AM  |  PM',
    Positude: 'PM',
    OM3GA: 'PM'
  };

  function toggleLikeOriginal(original, nextBool, fieldKey) {
    // Preserve original value type when possible
    if (typeof original === 'boolean') return !!nextBool;
    if (typeof original === 'number') return nextBool ? 1 : 0;
    if (original == null) {
      if (!nextBool) return '';
      return SUPP_DEFAULTS[fieldKey] || 'Y';
    }
    if (typeof original === 'string') {
      if (!nextBool) return '';
      const s = original.trim();
      return s ? original : (SUPP_DEFAULTS[fieldKey] || 'Y');
    }
    return nextBool ? (SUPP_DEFAULTS[fieldKey] || 'Y') : '';
  }

  function stableHorseIdFromRow(r) {
    const hid = getAny(r, FIELD.horse_id);
    if (hid != null) return String(hid);
    const name = getAny(r, FIELD.horseName);
    if (name != null) return 'name:' + String(name).trim().toLowerCase();
    return null;
  }

  function deriveHorses(rows) {
    const byId = new Map();
    (rows || []).forEach(r => {
      const id = stableHorseIdFromRow(r);
      if (!id) return;
      if (!byId.has(id)) {
        byId.set(id, {
          horse_id: id,
          horseName: (getAny(r, FIELD.horseName) != null ? String(getAny(r, FIELD.horseName)) : '(unknown)') ,
          row: r
        });
      }
    });

    const list = Array.from(byId.values());

    // prefer stable display name if later rows have better one
    (rows || []).forEach(r => {
      const id = stableHorseIdFromRow(r);
      if (!id || !byId.has(id)) return;
      const name = getAny(r, FIELD.horseName);
      if (name != null && String(name).trim()) byId.get(id).horseName = String(name).trim();
    });

    // sort by boardNumber then name
    list.sort((a, b) => {
      const an = toInt(getAny(a.row, FIELD.boardNumber));
      const bn = toInt(getAny(b.row, FIELD.boardNumber));
      if (an != null && bn != null && an !== bn) return an - bn;
      if (an != null && bn == null) return -1;
      if (an == null && bn != null) return 1;
      return String(a.horseName).localeCompare(String(b.horseName));
    });

    return list;
  }

  function storageKey() {
    return `crt_feed_session_${SESSION_VERSION}:${state.boardId}`;
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.session.selected = (parsed.selected && typeof parsed.selected === 'object') ? parsed.selected : {};
        state.session.drafts = (parsed.drafts && typeof parsed.drafts === 'object') ? parsed.drafts : {};
      }
    } catch (_) {
      // ignore
    }
  }

  function persistSession() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        selected: state.session.selected,
        drafts: state.session.drafts
      }));
    } catch (_) {
      // ignore
    }
  }

  function clearSession() {
    state.session = { selected: {}, drafts: {} };
    state.expandedNotes = {};
    state.searchText = '';
    try { localStorage.removeItem(storageKey()); } catch (_) {}
  }

  function selectedCount() {
    let n = 0;
    for (let i = 0; i < state.horses.length; i++) {
      const hid = state.horses[i].horse_id;
      if (state.session.selected[hid]) n++;
    }
    return n;
  }

  function selectedHorses() {
    return state.horses.filter(h => state.session.selected[h.horse_id]);
  }

  function setHeader(titleText) {
    if (elTitle) elTitle.textContent = titleText || '';
  }

  function setHeaderAction(label, onClick) {
    if (!elAction) return;
    if (!label) {
      elAction.hidden = true;
      elAction.textContent = '';
      elAction.onclick = null;
      return;
    }
    elAction.hidden = false;
    elAction.textContent = label;
    elAction.onclick = onClick;
  }

  function showBack(show) {
    if (!elBack) return;
    elBack.classList.toggle('is-hidden', !show);
  }

  function setNavAgg(screen, value) {
    const el = document.querySelector(`.nav-agg[data-nav-agg="${screen}"]`);
    if (el) el.textContent = String(value == null ? '0' : value);
  }

  function updateNavUI(activeScreen) {
    const activeActual = (navCompat.canonicalToActual && navCompat.canonicalToActual[activeScreen]) || activeScreen;

    const btns = document.querySelectorAll('.nav-btn[data-screen]');
    btns.forEach(btn => {
      const s = (btn.getAttribute('data-screen') || '').trim();
      btn.classList.toggle('nav-btn--primary', s === activeActual);
    });

    const sel = selectedCount();
    const keep = new Set();

    // Show the same selection count on the mapped tabs.
    ['state', 'list1', 'summary', 'list8'].forEach(canon => {
      const actual = (navCompat.canonicalToActual && navCompat.canonicalToActual[canon]) || canon;
      if (actual) {
        keep.add(actual);
        setNavAgg(actual, sel);
      }
    });

    // Start/Restart (if present) shows no count.
    const startActual = navCompat.canonicalToActual && navCompat.canonicalToActual.start;
    if (startActual) {
      keep.add(startActual);
      setNavAgg(startActual, 0);
    }

    // Quiet any other legacy tabs that are still in the DOM.
    document.querySelectorAll('.nav-agg[data-nav-agg]').forEach(el => {
      const k = (el.getAttribute('data-nav-agg') || '').trim();
      if (k && !keep.has(k)) el.textContent = '0';
    });
  }

  function mkRowTap(title, tagsHtml, onClick, isActive) {
    const html = `
      <div class="row-title">${esc(title)}</div>
      <div>${tagsHtml || ''}</div>
    `;
    const row = mk('div', `row row--tap${isActive ? ' row--active' : ''}`, html);
    row.addEventListener('click', onClick);
    return row;
  }

  function mkRowStatic(title, tagsHtml) {
    const html = `
      <div class="row-title">${esc(title)}</div>
      <div>${tagsHtml || ''}</div>
    `;
    return mk('div', 'row', html);
  }

  function tag(text, positive, extraAttrs) {
    const cls = `row-tag${positive ? ' row-tag--positive' : ''}`;
    const attrs = extraAttrs || '';
    return `<span class="${cls}" ${attrs}>${esc(text)}</span>`;
  }

  function label(text) {
    return mk('div', 'list-group-label', esc(text));
  }

  function divider() {
    return mk('div', 'list-group-divider');
  }

  function setMessage(message) {
    clearRoot();
    setHeader('Error');
    showBack(false);
    setHeaderAction(null);
    updateNavUI(state.screen);
    elRoot.appendChild(mkRowStatic(String(message || 'Unknown error'), tag('!', true)));
  }

  // ----------------------------
  // DATA LOAD
  // ----------------------------
  function resolveBoardId() {
    const p = qs('board') || qs('board_id') || qs('b');
    const id = (p && String(p).trim()) ? String(p).trim() : DEFAULT_BOARD_ID;
    // only safe chars
    return id.replace(/[^a-zA-Z0-9_\-]/g, '');
  }

  function resolveReadBase() {
    const qp = String(qs('read_url') || qs('readUrl') || qs('read') || '').trim();
    if (qp) return qp.endsWith('/') ? qp : (qp + '/');

    // If running on the server domain, prefer relative paths.
    try {
      if (window.location.origin === ITEMS_ORIGIN) return CANONICAL_READ_PATH;
    } catch (_) {}

    return ITEMS_ORIGIN + CANONICAL_READ_PATH;
  }

  function resolveSaveUrl(json) {
    const qp = String(qs('save_url') || qs('saveUrl') || qs('save') || qs('endpoint') || '').trim();
    const meta = (json && (json.meta || json._meta)) || null;
    const fromJson = String(json && (json.save_url || json.saveUrl || json.save_endpoint) || '').trim();
    const fromMeta = String(meta && (meta.save_url || meta.saveUrl || meta.save_endpoint) || '').trim();
    const picked = String(qp || fromJson || fromMeta || '').trim();

    // Only accept endpoints that resolve to the canonical server + route.
    // This prevents accidental relative URLs like "/feed/commit" on a non-server origin.
    if (picked) {
      try {
        const u = /^https?:\/\//i.test(picked) ? new URL(picked) : new URL(picked, ITEMS_ORIGIN);
        if (u.origin === ITEMS_ORIGIN && u.pathname === '/feed/commit') return u.toString();
      } catch (_) {}
    }

    return DEFAULT_SAVE_URL;
  }

  function extractRowsFromBoardJson(json) {
    if (Array.isArray(json)) return json;
    if (!json || typeof json !== 'object') return [];
    if (Array.isArray(json.rows)) return json.rows;
    if (Array.isArray(json.board)) return json.board;
    if (Array.isArray(json.data)) return json.data;
    return [];
  }

  function isNewHorseId(horseId) {
    return typeof horseId === 'string' && horseId.startsWith('new:');
  }

  function buildRowFromDraft(horseId, draft) {
    const safeName = String(draft && draft.horseName ? draft.horseName : '').trim();
    const feedDisplay = String(draft && draft.feed_display ? draft.feed_display : '').trim();
    const note = String(draft && draft.horse_feed_note ? draft.horse_feed_note : '').trim();

    // Keep both top-level fields (used by UI) and nested objects (matches production shape).
    const EEMix = (draft && draft.EEMix != null) ? draft.EEMix : '';
    const Positude = (draft && draft.Positude != null) ? draft.Positude : '';
    const OM3GA = (draft && draft.OM3GA != null) ? draft.OM3GA : '';

    const row = {
      horseId,
      horseName: safeName,
      boardNumber: (draft && draft.boardNumber != null && draft.boardNumber !== '') ? Number(draft.boardNumber) : null,
      feed_display: feedDisplay,
      EEMix,
      Positude,
      OM3GA,
      horse_feed_note: note,
      feed: {
        feed_display: { raw: feedDisplay, value: feedDisplay }
      },
      supplements: {
        EEMix: { raw: EEMix, value: normalizeSupplementValue(EEMix) },
        Positude: { raw: Positude, value: normalizeSupplementValue(Positude) },
        OM3GA: { raw: OM3GA, value: normalizeSupplementValue(OM3GA) }
      },
      note: {
        horse_feed_note: { raw: note, value: note }
      }
    };
    return row;
  }

  function applyDraftToExistingRow(row, horseId, draft, changes) {
    const next = Object.assign({}, row || {});

    // Ensure stable identifiers
    if (horseId != null) next.horseId = horseId;

    const touchFeed = () => {
      if (!next.feed || typeof next.feed !== 'object') next.feed = {};
      if (!next.feed.feed_display || typeof next.feed.feed_display !== 'object') next.feed.feed_display = { raw: '', value: '' };
    };
    const touchSupp = () => {
      if (!next.supplements || typeof next.supplements !== 'object') next.supplements = {};
      ['EEMix', 'Positude', 'OM3GA'].forEach(k => {
        if (!next.supplements[k] || typeof next.supplements[k] !== 'object') next.supplements[k] = { raw: '', value: false };
      });
    };
    const touchNote = () => {
      if (!next.note || typeof next.note !== 'object') next.note = {};
      if (!next.note.horse_feed_note || typeof next.note.horse_feed_note !== 'object') next.note.horse_feed_note = { raw: '', value: '' };
    };

    if (changes && Object.prototype.hasOwnProperty.call(changes, 'horseName')) {
      const v = String(changes.horseName == null ? '' : changes.horseName).trim();
      next.horseName = v;
    }

    if (changes && Object.prototype.hasOwnProperty.call(changes, 'boardNumber')) {
      next.boardNumber = (changes.boardNumber == null || changes.boardNumber === '') ? null : Number(changes.boardNumber);
    }

    if (changes && Object.prototype.hasOwnProperty.call(changes, 'feed_display')) {
      const v = String(changes.feed_display == null ? '' : changes.feed_display).trim();
      next.feed_display = v;
      touchFeed();
      next.feed.feed_display.raw = v;
      next.feed.feed_display.value = v;
    }

    ['EEMix', 'Positude', 'OM3GA'].forEach(k => {
      if (changes && Object.prototype.hasOwnProperty.call(changes, k)) {
        const raw = changes[k];
        next[k] = raw;
        touchSupp();
        next.supplements[k].raw = raw;
        next.supplements[k].value = normalizeSupplementValue(raw);
      }
    });

    if (changes && Object.prototype.hasOwnProperty.call(changes, 'horse_feed_note')) {
      const v = String(changes.horse_feed_note == null ? '' : changes.horse_feed_note).trim();
      next.horse_feed_note = v;
      touchNote();
      next.note.horse_feed_note.raw = v;
      next.note.horse_feed_note.value = v;
    }

    // If we didn't touch nested objects but the draft exists for a new-ish row, still keep them consistent.
    if (draft && isNewHorseId(horseId)) {
      return buildRowFromDraft(horseId, draft);
    }

    return next;
  }

  function buildLocalNewRowsFromSession(session) {
    const drafts = session && session.drafts ? session.drafts : {};
    return Object.keys(drafts)
      .filter(isNewHorseId)
      .map((horseId) => buildRowFromDraft(horseId, drafts[horseId]));
  }

  function mergeRowsUniqueByHorseId(primaryRows, extraRows) {
    const out = [];
    const seen = new Set();

    const push = (r) => {
      const id = stableHorseIdFromRow(r);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(r);
    };

    (primaryRows || []).forEach(push);
    (extraRows || []).forEach(push);

    return out;
  }

  async function loadBoard() {
    state.boardId = resolveBoardId();
    state.dataUrl = `${resolveReadBase()}${state.boardId}.json`;

    // load local session early so we can merge unsaved local "new" horses into the UI
    loadSession();

    const cacheBust = `cb=${Date.now()}`;
    const url = state.dataUrl + (state.dataUrl.includes('?') ? '&' : '?') + cacheBust;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Board GET failed (${res.status})`);

    const json = await res.json();
    state.boardJson = json;

    const canonicalRows = extractRowsFromBoardJson(json);
    const localRows = buildLocalNewRowsFromSession(state.session);
    state.rows = mergeRowsUniqueByHorseId(canonicalRows, localRows);
    state.horses = deriveHorses(state.rows);
    state.saveUrl = resolveSaveUrl(json);

    // prune selection/drafts for missing horses (keep local "new:" drafts)
    const horseIds = new Set(state.horses.map(h => h.horse_id));
    Object.keys(state.session.selected).forEach(id => {
      if (!horseIds.has(id)) delete state.session.selected[id];
    });
    Object.keys(state.session.drafts).forEach(id => {
      if (!horseIds.has(id) && !isNewHorseId(id)) delete state.session.drafts[id];
    });
    persistSession();
  }

  // ----------------------------
  // ROUTING
  // ----------------------------
  function normalizeNavTarget(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'state';

    // If a legacy tab is clicked (e.g., list2/list3), map it to a canonical screen.
    const mapped = (navCompat.actualToCanonical && navCompat.actualToCanonical[s]) || s;
    if (mapped === 'state' || mapped === 'list1' || mapped === 'summary' || mapped === 'detail' || mapped === 'list8' || mapped === 'start') return mapped;
    return 'state';
  }

  function gotoScreen(screen) {
    state.screen = screen;
    render();
  }

  // ----------------------------
  // RENDER: Active Horses (state)
  // ----------------------------
  function renderActiveHorses() {
    clearRoot();
    setHeader('Horse List');
    showBack(false);
    setHeaderAction(null);
    updateNavUI('state');

    const wrap = mk('div', 'state-search');
    const input = mk('input', 'state-search-input');
    input.type = 'search';
    input.placeholder = 'Search horses…';
    input.value = state.searchText || '';
    input.addEventListener('input', () => {
      state.searchText = input.value || '';
      renderActiveHorses();
    });
    wrap.appendChild(input);
    elRoot.appendChild(wrap);

    const q = (state.searchText || '').trim().toLowerCase();
    const horses = q
      ? state.horses.filter(h => String(h.horseName).toLowerCase().includes(q))
      : state.horses.slice();

    if (!horses.length) {
      elRoot.appendChild(mkRowStatic('No horses found.', tag('0', false)));
      return;
    }

    horses.forEach(h => {
      const isSel = !!state.session.selected[h.horse_id];
      const boardNo = toInt(getAny(h.row, FIELD.boardNumber));
      const tags = [tag(isSel ? 'ON' : 'OFF', isSel)];
      if (boardNo != null) tags.unshift(tag(String(boardNo), false));

      const row = mkRowTap(h.horseName, tags.join(''), () => {
        state.session.selected[h.horse_id] = !isSel;
        persistSession();
        renderActiveHorses();
        // keep nav aggs live
        updateNavUI('state');
      }, isSel);

      elRoot.appendChild(row);
    });
  }

  // ----------------------------
  // RENDER: FeedList (list1)
  // ----------------------------
  function renderFeedList() {
    clearRoot();
    setHeader('Active List');
    showBack(false);
    setHeaderAction('Add', createNewHorse);
    updateNavUI('list1');

    const sel = selectedHorses();
    if (!sel.length) {
      elRoot.appendChild(mkRowStatic('No active horses selected.', tag('!', true)));
      elRoot.appendChild(mkRowTap('Go select horses', tag('→', true), () => gotoScreen('state')));
      return;
    }

    sel.forEach(h => {
      const boardNo = toInt(getAny(h.row, FIELD.boardNumber));
      const feed = getAny(h.row, FIELD.feed_display);
      const tags = [
        tag(boardNo != null ? String(boardNo) : '—', false),
        tag(feed != null && String(feed).trim() ? String(feed).trim() : 'feed', false)
      ].join('');

      elRoot.appendChild(
        mkRowTap(h.horseName, tags, () => openDetail(h.horse_id))
      );
    });
  }

  // ----------------------------
  // DETAIL DRAFT
  // ----------------------------
  function baseForHorse(horseId) {
    const h = state.horses.find(x => x.horse_id === horseId);
    return h ? h.row : null;
  }

  function ensureDraft(horseId) {
    if (!state.session.drafts[horseId]) {
      const base = baseForHorse(horseId) || {};
      const baseFields = {
        boardNumber: toInt(getAny(base, FIELD.boardNumber)),
        horseName: (getAny(base, FIELD.horseName) != null ? String(getAny(base, FIELD.horseName)) : ''),
        feed_display: (getAny(base, FIELD.feed_display) != null ? String(getAny(base, FIELD.feed_display)) : ''),
        EEMix: (getAny(base, FIELD.EEMix) != null ? String(getAny(base, FIELD.EEMix)) : ''),
        Positude: (getAny(base, FIELD.Positude) != null ? String(getAny(base, FIELD.Positude)) : ''),
        OM3GA: (getAny(base, FIELD.OM3GA) != null ? String(getAny(base, FIELD.OM3GA)) : ''),
        horse_feed_note: (getAny(base, FIELD.horse_feed_note) != null ? String(getAny(base, FIELD.horse_feed_note)) : '')
      };
      state.session.drafts[horseId] = Object.assign({ _base: Object.assign({}, baseFields) }, baseFields);
      persistSession();
    }
    return state.session.drafts[horseId];
  }

  function discardDraft(horseId) {
    if (state.session.drafts[horseId]) {
      delete state.session.drafts[horseId];
      if (isNewHorseId(horseId)) {
        delete state.session.selected[horseId];
        state.rows = (state.rows || []).filter(r => stableHorseIdFromRow(r) !== horseId);
        state.horses = deriveHorses(state.rows);
      }
      persistSession();
    }
  }

  function createNewHorse() {
    const newId = `new:${Date.now()}`;
    state.session.selected[newId] = true;
    state.session.drafts[newId] = {
      _base: {
        boardNumber: null,
        horseName: '',
        feed_display: '',
        EEMix: '',
        Positude: '',
        OM3GA: '',
        horse_feed_note: ''
      },
      boardNumber: null,
      horseName: '',
      feed_display: '',
      EEMix: '',
      Positude: '',
      OM3GA: '',
      horse_feed_note: ''
    };
    persistSession();

    const localRow = buildRowFromDraft(newId, state.session.drafts[newId]);
    state.rows = mergeRowsUniqueByHorseId(state.rows || [], [localRow]);
    state.horses = deriveHorses(state.rows);

    state.detailHorseId = newId;
    gotoScreen('detail');
  }

  function computeUsedSlots(exceptHorseId) {
    const used = new Set();
    state.horses.forEach(h => {
      if (h.horse_id === exceptHorseId) return;
      const n = toInt(getAny(h.row, FIELD.boardNumber));
      if (n != null) used.add(n);
    });
    return used;
  }

  function slotOptions(exceptHorseId) {
    // Derive a reasonable list of slots: 1..max+5 (min 20)
    let max = 0;
    state.horses.forEach(h => {
      const n = toInt(getAny(h.row, FIELD.boardNumber));
      if (n != null && n > max) max = n;
    });
    max = Math.max(max, 20);
    return Array.from({ length: max + 5 }, (_, i) => i + 1);
  }

  function draftChanges(horseId) {
    const d = ensureDraft(horseId);
    const base = (d && d._base) ? d._base : {};

    const out = {};

    const baseBoard = toInt(getAny(base, FIELD.boardNumber));
    if ((d.boardNumber || null) !== (baseBoard || null)) out.boardNumber = d.boardNumber;

    const baseName = (getAny(base, FIELD.horseName) != null ? String(getAny(base, FIELD.horseName)) : '');
    if (String(d.horseName || '') !== String(baseName || '')) out.horseName = d.horseName;

    const baseFeed = (getAny(base, FIELD.feed_display) != null ? String(getAny(base, FIELD.feed_display)) : '');
    if (String(d.feed_display || '') !== String(baseFeed || '')) out.feed_display = d.feed_display;

    const baseNote = (getAny(base, FIELD.horse_feed_note) != null ? String(getAny(base, FIELD.horse_feed_note)) : '');
    if (String(d.horse_feed_note || '') !== String(baseNote || '')) out.horse_feed_note = d.horse_feed_note;

    // toggles: compare via boolean interpretation
    const baseE = getAny(base, FIELD.EEMix);
    const baseP = getAny(base, FIELD.Positude);
    const baseO = getAny(base, FIELD.OM3GA);

    const dE = d.EEMix;
    const dP = d.Positude;
    const dO = d.OM3GA;

    if (toBool(dE) !== toBool(baseE)) out.EEMix = dE;
    if (toBool(dP) !== toBool(baseP)) out.Positude = dP;
    if (toBool(dO) !== toBool(baseO)) out.OM3GA = dO;

    return out;
  }

  // ----------------------------
  // RENDER: Horse Detail
  // ----------------------------
  function renderDetail() {
    const horseId = state.detailHorseId;
    const horse = state.horses.find(h => h.horse_id === horseId);
    if (!horse) {
      gotoScreen('list1');
      return;
    }

    const isNew = isNewHorseId(horseId);

    const draft = ensureDraft(horseId);
    const base = baseForHorse(horseId) || {};

    clearRoot();
    const titleName = isNew ? (String(draft.horseName || '').trim() || 'New Horse') : horse.horseName;
    setHeader(titleName);
    showBack(true);

    setHeaderAction('Save', async () => {
      try {
        await saveDraft(horseId);
      } catch (e) {
        alert(e && e.message ? e.message : String(e));
      }
    });

    // Highlight List tab while in detail (keeps bottom-nav cadence)
    updateNavUI('list1');

    // Horse Name (new only)
    if (isNew) {
      elRoot.appendChild(label('Horse'));
      elRoot.appendChild(
        mkRowTap('Horse Name', tag(String(draft.horseName || '').trim() || '—', false), () => {
          const next = prompt('Horse name:', draft.horseName || '');
          if (next == null) return;
          draft.horseName = String(next);
          persistSession();
          renderDetail();
        })
      );
      elRoot.appendChild(divider());
    }

    // Board Slot
    elRoot.appendChild(label('Board Slot'));

    const slotTag = tag(draft.boardNumber != null ? String(draft.boardNumber) : '—', false);
    elRoot.appendChild(
      mkRowTap('Board Number', slotTag, () => {
        state.showSlotPicker = !state.showSlotPicker;
        renderDetail();
      })
    );

    if (state.showSlotPicker) {
      const used = computeUsedSlots(horseId);
      const opts = slotOptions(horseId);

      elRoot.appendChild(mkRowTap('Clear slot', tag('×', false), () => {
        draft.boardNumber = null;
        persistSession();
        renderDetail();
      }));

      opts.forEach(n => {
        const isUsed = used.has(n);
        const isCurrent = (draft.boardNumber === n);
        const t = tag(String(n), isCurrent, isUsed ? 'data-used="1"' : '');

        if (isUsed && !isCurrent) {
          elRoot.appendChild(mkRowStatic(`Slot ${n} (used)`, t));
        } else {
          elRoot.appendChild(
            mkRowTap(`Slot ${n}`, t, () => {
              draft.boardNumber = n;
              persistSession();
              renderDetail();
            }, isCurrent)
          );
        }
      });

      elRoot.appendChild(divider());
    }

    // Feed
    elRoot.appendChild(label('Feed'));

    elRoot.appendChild(
      mkRowTap('Feed', tag(draft.feed_display && String(draft.feed_display).trim() ? String(draft.feed_display).trim() : '—', false), () => {
        const next = prompt('Feed (feed_display):', draft.feed_display || '');
        if (next == null) return;
        draft.feed_display = String(next);
        persistSession();
        renderDetail();
      })
    );

    // Supplements
    elRoot.appendChild(label('Supplements'));

    const toggleRow = (labelText, fieldKey, baseVal) => {
      const current = toBool(draft[fieldKey]);
      const t = tag(labelText, current);
      elRoot.appendChild(
        mkRowTap(labelText, t, () => {
          const nextBool = !current;
          const orig = baseVal;
          draft[fieldKey] = toggleLikeOriginal(orig, nextBool, fieldKey);
          persistSession();
          renderDetail();
        }, current)
      );
    };

    toggleRow('EEMix', 'EEMix', getAny(base, FIELD.EEMix));
    toggleRow('Positude', 'Positude', getAny(base, FIELD.Positude));
    toggleRow('OM3GA', 'OM3GA', getAny(base, FIELD.OM3GA));

    // Notes
    elRoot.appendChild(label('Note'));

    const noteWrap = mk('div', 'state-search');
    const note = mk('textarea', 'state-search-input');
    note.rows = 4;
    note.placeholder = 'horse_feed_note…';
    note.value = draft.horse_feed_note || '';
    note.addEventListener('input', () => {
      draft.horse_feed_note = note.value;
      persistSession();
    });
    noteWrap.appendChild(note);
    elRoot.appendChild(noteWrap);

    // Show unsaved status
    const changes = draftChanges(horseId);
    const hasChanges = Object.keys(changes).length > 0;
    elRoot.appendChild(
      mkRowStatic(hasChanges ? 'Unsaved changes' : 'No changes', tag(hasChanges ? '●' : '○', hasChanges))
    );

    // Safety note
    if (!state.saveUrl) {
      elRoot.appendChild(mkRowStatic('Save is disabled (no endpoint)', tag('OFF', false)));
    }
  }

  // ----------------------------
  // SAVE
  // ----------------------------
  async function saveDraft(horseId) {
    const changes = draftChanges(horseId);
    if (!Object.keys(changes).length) return;

    const draft = ensureDraft(horseId);

    // local uniqueness guard (current in-memory board)
    if (Object.prototype.hasOwnProperty.call(changes, 'boardNumber')) {
      const used = computeUsedSlots(horseId);
      const slotLocal = toInt(changes.boardNumber);
      if (slotLocal != null && used.has(slotLocal)) {
        throw new Error(`Board slot ${slotLocal} is already used.`);
      }
    }

    // Always pin to the canonical endpoint (never current-origin /feed/commit).
    state.saveUrl = resolveSaveUrl(state.boardJson || {});

    setHeaderAction('Saving…', null);

    // Fetch latest board for a safe merge, then commit the full updated board.
    const freshUrl = (() => {
      try {
        const u = new URL(state.dataUrl, window.location.href);
        u.searchParams.set('_ts', String(Date.now()));
        return u.toString();
      } catch (_) {
        const sep = state.dataUrl.includes('?') ? '&' : '?';
        return state.dataUrl + sep + '_ts=' + Date.now();
      }
    })();

    const latestRes = await fetch(freshUrl, { cache: 'no-store' });
    if (!latestRes.ok) throw new Error(`Board fetch failed (${latestRes.status})`);
    const latestJson = await latestRes.json();

    // Extract rows (supports array boards or object boards with rows/board/data).
    let rows = extractRowsFromBoardJson(latestJson) || [];
    rows = rows.slice();

    let containerKey = null;
    if (!Array.isArray(latestJson) && latestJson && typeof latestJson === 'object') {
      if (Array.isArray(latestJson.rows)) containerKey = 'rows';
      else if (Array.isArray(latestJson.board)) containerKey = 'board';
      else if (Array.isArray(latestJson.data)) containerKey = 'data';
      else containerKey = 'rows'; // default if wrapper exists without a rows array
    }

    const horseKey = String(horseId);
    let idx = rows.findIndex(r => String(getAny(r, FIELD.horse_id) || '') === horseKey);
    const isNew = idx < 0;

    if (isNew && !String(draft && draft.horseName ? draft.horseName : '').trim()) {
      throw new Error('Horse name is required for a new horse.');
    }

    // Extra uniqueness guard (latest board, for concurrency).
    if (Object.prototype.hasOwnProperty.call(changes, 'boardNumber')) {
      const slot = toInt(changes.boardNumber);
      if (slot != null) {
        const conflict = rows.find((r, i) => i !== idx && toInt(getAny(r, FIELD.boardNumber)) === slot);
        if (conflict) throw new Error(`Board slot ${slot} is already used. Refresh and pick another slot.`);
      }
    }

    // Apply patch (or add a new row).
    if (isNew) {
      rows.push(buildRowFromDraft(horseId, draft));
      idx = rows.length - 1;
    } else {
      rows[idx] = applyDraftToExistingRow(rows[idx], horseId, draft, changes);
    }

    // Rebuild board envelope preserving meta fields.
    let updatedBoard = null;
    if (Array.isArray(latestJson)) {
      updatedBoard = rows;
    } else if (latestJson && typeof latestJson === 'object') {
      const key = containerKey || 'rows';
      updatedBoard = { ...latestJson, [key]: rows };
    } else {
      updatedBoard = { rows };
    }

    const commitPayload = {
      board: updatedBoard,
      message: `feedboard: save ${horseId}`,
      overwrite: true
    };

    const url = String(state.saveUrl || DEFAULT_SAVE_URL);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commitPayload)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (res.status === 409) {
        throw new Error('Duplicate board slot. Pick another slot and try Save again.');
      }
      if (res.status === 405) {
        throw new Error(`Save endpoint rejected (405). Expected POST ${DEFAULT_SAVE_URL}. You are posting to: ${url}`);
      }
      throw new Error(`Save failed (${res.status})${txt ? ': ' + txt : ''}`);
    }

    // Success: clear draft, reload canonical board, return to list.
    discardDraft(horseId);
    state.showSlotPicker = false;
    toast('Saved.');
    await loadBoard();
    gotoScreen('list1');
  }

  // ----------------------------
  // RENDER: Summary
  // ----------------------------
  function renderSummary() {
    clearRoot();
    setHeader('Summary');
    showBack(false);
    setHeaderAction(null);
    updateNavUI('summary');

    const sel = selectedHorses();
    if (!sel.length) {
      elRoot.appendChild(mkRowStatic('No active horses selected.', tag('!', true)));
      elRoot.appendChild(mkRowTap('Go select horses', tag('→', true), () => gotoScreen('state')));
      return;
    }

    // Sort by boardNumber then name
    sel.sort((a, b) => {
      const an = toInt(getAny(a.row, FIELD.boardNumber));
      const bn = toInt(getAny(b.row, FIELD.boardNumber));
      if (an != null && bn != null && an !== bn) return an - bn;
      if (an != null && bn == null) return -1;
      if (an == null && bn != null) return 1;
      return String(a.horseName).localeCompare(String(b.horseName));
    });

    sel.forEach(h => {
      const base = h.row || {};
      const boardNo = toInt(getAny(base, FIELD.boardNumber));
      const feed = getAny(base, FIELD.feed_display);
      const eemix = toBool(getAny(base, FIELD.EEMix));
      const posit = toBool(getAny(base, FIELD.Positude));
      const om = toBool(getAny(base, FIELD.OM3GA));
      const note = getAny(base, FIELD.horse_feed_note);

      const noteKey = h.horse_id;
      const noteOpen = !!state.expandedNotes[noteKey];

      const tags = [
        tag(boardNo != null ? String(boardNo) : '—', false),
        tag(feed != null && String(feed).trim() ? String(feed).trim() : 'feed', false),
        tag('EEMix', eemix),
        tag('Positude', posit),
        tag('OM3GA', om),
        tag('NOTE', !!(note && String(note).trim()), 'data-note="1" style="cursor:pointer"')
      ].join('');

      const row = mkRowTap(h.horseName, tags, (evt) => {
        // Only toggle note when NOTE chip is clicked
        const target = evt && evt.target;
        const noteChip = target && target.closest ? target.closest('[data-note="1"]') : null;
        if (noteChip) {
          state.expandedNotes[noteKey] = !noteOpen;
          renderSummary();
          return;
        }
        // otherwise open detail
        openDetail(h.horse_id);
      });

      elRoot.appendChild(row);

      if (noteOpen) {
        const txt = (note != null ? String(note) : '').trim();
        elRoot.appendChild(mkRowStatic(txt || '(no note)', tag('note', false)));
      }
    });
  }

  // ----------------------------
  // RENDER: Text/Share (list8)
  // ----------------------------
  function buildPlainText() {
    const sel = selectedHorses();
    sel.sort((a, b) => {
      const an = toInt(getAny(a.row, FIELD.boardNumber));
      const bn = toInt(getAny(b.row, FIELD.boardNumber));
      if (an != null && bn != null && an !== bn) return an - bn;
      if (an != null && bn == null) return -1;
      if (an == null && bn != null) return 1;
      return String(a.horseName).localeCompare(String(b.horseName));
    });

    const lines = [];
    sel.forEach(h => {
      const r = h.row || {};
      const boardNo = toInt(getAny(r, FIELD.boardNumber));
      const feed = getAny(r, FIELD.feed_display);
      const eemix = toBool(getAny(r, FIELD.EEMix));
      const posit = toBool(getAny(r, FIELD.Positude));
      const om = toBool(getAny(r, FIELD.OM3GA));
      const note = getAny(r, FIELD.horse_feed_note);

      const parts = [];
      if (feed != null && String(feed).trim()) parts.push(String(feed).trim());
      if (eemix) parts.push('EEMix');
      if (posit) parts.push('Positude');
      if (om) parts.push('OM3GA');

      const head = `${boardNo != null ? boardNo + '.' : '-.'} ${h.horseName}`;
      const mid = parts.length ? ' — ' + parts.join(' · ') : '';
      const tail = (note != null && String(note).trim()) ? `\n  Note: ${String(note).trim()}` : '';

      lines.push(head + mid + tail);
    });

    return lines.join('\n');
  }

  function renderText() {
    clearRoot();
    setHeader('Text');
    showBack(false);
    setHeaderAction(null);
    updateNavUI('list8');

    const sel = selectedHorses();
    if (!sel.length) {
      elRoot.appendChild(mkRowStatic('No active horses selected.', tag('!', true)));
      elRoot.appendChild(mkRowTap('Go select horses', tag('→', true), () => gotoScreen('state')));
      return;
    }

    const text = buildPlainText();

    elRoot.appendChild(label('Share'));

    elRoot.appendChild(
      mkRowTap('Copy to clipboard', tag('COPY', true), async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            alert('Copied.');
          } else {
            prompt('Copy:', text);
          }
        } catch (_) {
          prompt('Copy:', text);
        }
      })
    );

    elRoot.appendChild(
      mkRowTap('Open SMS', tag('SMS', true), () => {
        const body = encodeURIComponent(text);
        // sms: scheme varies; this is the most compatible pattern
        const url = `sms:?&body=${body}`;
        window.location.href = url;
      })
    );

    elRoot.appendChild(divider());

    const boxWrap = mk('div', 'state-search');
    const box = mk('textarea', 'state-search-input');
    box.rows = 10;
    box.readOnly = true;
    box.value = text;
    boxWrap.appendChild(box);
    elRoot.appendChild(boxWrap);
  }

  // ----------------------------
  // FLOW: Restart
  // ----------------------------
  async function restartFlow() {
    clearSession();
    await loadBoard();
    gotoScreen('state');
  }

  // ----------------------------
  // DETAIL NAV
  // ----------------------------
  function openDetail(horseId) {
    state.detailHorseId = horseId;
    state.showSlotPicker = false;
    gotoScreen('detail');
  }

  // ----------------------------
  // MAIN RENDER
  // ----------------------------
  function render() {
    // Back button behavior
    if (elBack) {
      elBack.onclick = () => {
        if (state.screen === 'detail') {
          // discard draft + return to FeedList
          discardDraft(state.detailHorseId);
          state.detailHorseId = null;
          state.showSlotPicker = false;
          gotoScreen('list1');
          return;
        }
        // from any main screen -> Start
        gotoScreen('start');
      };
    }

    if (state.screen === 'start') return renderStart();
    if (state.screen === 'state') return renderActiveHorses();
    if (state.screen === 'list1') return renderFeedList();
    if (state.screen === 'summary') return renderSummary();
    if (state.screen === 'list8') return renderText();
    if (state.screen === 'detail') return renderDetail();

    // fallback
    gotoScreen('state');
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  function bindNav() {
    elNavRow.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.nav-btn[data-screen]') : null;
      if (!btn) return;

      const raw = btn.getAttribute('data-screen');
      if (raw === 'start' && state.screen === 'start') {
        // Start/Restart behavior
        restartFlow().catch(err => setMessage(err && err.message ? err.message : String(err)));
        return;
      }

      const target = normalizeNavTarget(raw);
      if (target === 'start') gotoScreen('start');
      else gotoScreen(target);
    });
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  async function boot() {
    try {
      initNavCompat();
      bindNav();
      await loadBoard();
      gotoScreen('start');
    } catch (err) {
      setMessage(err && err.message ? err.message : String(err));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
