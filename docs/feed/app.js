// app.js — FeedBoard (legacy shell compatible)
// Data: ./data/latest/{board}.json (default board: feed_board)
//
// Screen mapping (no markup/CSS changes):
//   start   -> Start / Restart
//   state   -> Active Horses (toggle selection)
//   list1   -> FeedList (selected horses only)
//   detail  -> Horse Detail (edit + Save/Back)
//   summary -> Summary (selected horses sorted by boardNumber)
//   list8   -> Text/Share
//   list2..list7 -> safe default route (Active Horses)

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
  const DATA_BASE = './data/latest/';

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
    screen: 'start',
    lastNonStart: 'state',
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
    const s = String(v).trim().toLowerCase();
    if (!s) return false;
    return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on' || s === '✓';
  }

  function toggleLikeOriginal(original, currentBool) {
    // Preserve original value type when possible
    if (typeof original === 'boolean') return !!currentBool;
    if (typeof original === 'number') return currentBool ? 1 : 0;
    if (original == null) return !!currentBool;

    // strings
    return currentBool ? 'Y' : '';
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
    const btns = document.querySelectorAll('.nav-btn[data-screen]');
    btns.forEach(btn => {
      const s = btn.getAttribute('data-screen');
      btn.classList.toggle('nav-btn--primary', s === activeScreen);
    });

    const sel = selectedCount();
    setNavAgg('state', sel);
    setNavAgg('list1', sel);
    setNavAgg('summary', sel);
    setNavAgg('list8', sel);

    // keep legacy others quiet
    for (let i = 2; i <= 7; i++) setNavAgg(`list${i}`, 0);
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
  function resolveSaveUrl(boardJson) {
    const fromQS = getQueryParam('save') || getQueryParam('save_url');
    if (fromQS) return fromQS;

    const meta = document.querySelector('meta[name="app-save-url"]');
    if (meta && meta.content) return meta.content.trim();

    // Accept config only if it already points to /feed/commit; otherwise ignore it.
    if (boardJson && typeof boardJson === 'object') {
      const cfg = boardJson.save_url || (boardJson.meta && boardJson.meta.save_url);
      if (cfg && typeof cfg === 'string') {
        const u = cfg.trim();
        if (/\/feed\/commit\/?$/.test(u)) return u;
      }
    }

    return '/feed/commit';
  }

async function loadBoard() {
    state.boardId = resolveBoardId();
    state.dataUrl = `${DATA_BASE}${state.boardId}.json`;

    const cacheBust = `cb=${Date.now()}`;
    const url = state.dataUrl + (state.dataUrl.includes('?') ? '&' : '?') + cacheBust;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Board GET failed (${res.status})`);

    const json = await res.json();
    state.boardJson = json;

    let rows = [];
    if (Array.isArray(json)) rows = json;
    else if (Array.isArray(json.rows)) rows = json.rows;
    else if (Array.isArray(json.board)) rows = json.board;
    else if (Array.isArray(json.data)) rows = json.data;

    state.rows = rows || [];
    state.horses = deriveHorses(state.rows);
    state.saveUrl = resolveSaveUrl(json);

    // after board load, hydrate local session for this board
    loadSession();

    // prune selection/drafts for missing horses
    const horseIds = new Set(state.horses.map(h => h.horse_id));
    Object.keys(state.session.selected).forEach(id => { if (!horseIds.has(id)) delete state.session.selected[id]; });
    Object.keys(state.session.drafts).forEach(id => { if (!horseIds.has(id)) delete state.session.drafts[id]; });
    persistSession();
  }

  // ----------------------------
  // ROUTING
  // ----------------------------
  function normalizeNavTarget(raw) {
    const s = raw || 'state';
    if (s === 'start' || s === 'state' || s === 'list1' || s === 'list8' || s === 'summary') return s;
    if (s === 'list2' || s === 'list3' || s === 'list4' || s === 'list5' || s === 'list6' || s === 'list7') return 'state';
    return 'state';
  }

  function gotoScreen(screen) {
    if (screen !== 'start' && screen !== 'detail') state.lastNonStart = screen;
    state.screen = screen;
    render();
  }

  // ----------------------------
  // RENDER: Start
  // ----------------------------
  function renderStart() {
    clearRoot();
    setHeader('Start');
    showBack(false);
    setHeaderAction(null);
    updateNavUI('start');

    // Logo block (existing CSS)
    const logo = mk('div', 'start-logo');
    logo.appendChild(mk('div', 'start-logo-title', esc('FeedBoard')));
    const subtitle = `Board: ${state.boardId} · Selected: ${selectedCount()} / ${state.horses.length}`;
    logo.appendChild(mk('div', 'start-logo-subtitle', esc(subtitle)));
    elRoot.appendChild(logo);

    // Restart
    elRoot.appendChild(
      mkRowTap('New session / Restart', tag('GO', true), async () => {
        await restartFlow();
      })
    );

    // Continue
    elRoot.appendChild(
      mkRowTap('Continue', tag('→', true), () => gotoScreen('state'))
    );

    elRoot.appendChild(divider());

    // Load board (manual)
    elRoot.appendChild(
      mkRowTap('Refresh board', tag('↻', false), async () => {
        try {
          await loadBoard();
          render();
        } catch (e) {
          setMessage(e && e.message ? e.message : String(e));
        }
      })
    );

    // Save endpoint status
    const saveStatus = state.saveUrl ? 'Save OK' : 'Save OFF';
    elRoot.appendChild(mkRowStatic('Save endpoint', tag(saveStatus, !!state.saveUrl)));
  }

  // ----------------------------
  // RENDER: Active Horses (state)
  // ----------------------------
  function renderActiveHorses() {
    clearRoot();
    setHeader('Active Horses');
    showBack(true);
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
    setHeader('Feed List');
    showBack(true);
    setHeaderAction(null);
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
      state.session.drafts[horseId] = {
        boardNumber: toInt(getAny(base, FIELD.boardNumber)),
        feed_display: (getAny(base, FIELD.feed_display) != null ? String(getAny(base, FIELD.feed_display)) : ''),
        EEMix: getAny(base, FIELD.EEMix),
        Positude: getAny(base, FIELD.Positude),
        OM3GA: getAny(base, FIELD.OM3GA),
        horse_feed_note: (getAny(base, FIELD.horse_feed_note) != null ? String(getAny(base, FIELD.horse_feed_note)) : '')
      };
      persistSession();
    }
    return state.session.drafts[horseId];
  }

  function discardDraft(horseId) {
    if (state.session.drafts[horseId]) {
      delete state.session.drafts[horseId];
      persistSession();
    }
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
    const base = baseForHorse(horseId) || {};
    const d = ensureDraft(horseId);

    const out = {};

    const baseBoard = toInt(getAny(base, FIELD.boardNumber));
    if ((d.boardNumber || null) !== (baseBoard || null)) out.boardNumber = d.boardNumber;

    const baseFeed = (getAny(base, FIELD.feed_display) != null ? String(getAny(base, FIELD.feed_display)) : '');
    if (String(d.feed_display || '') !== String(baseFeed || '')) out.feed_display = d.feed_display;

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

    const baseNote = (getAny(base, FIELD.horse_feed_note) != null ? String(getAny(base, FIELD.horse_feed_note)) : '');
    if (String(d.horse_feed_note || '') !== String(baseNote || '')) out.horse_feed_note = d.horse_feed_note;

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

    const draft = ensureDraft(horseId);
    const base = baseForHorse(horseId) || {};

    clearRoot();
    setHeader(horse.horseName);
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
          draft[fieldKey] = toggleLikeOriginal(orig, nextBool);
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

    if (!state.dataUrl) throw new Error('Board data URL not configured.');

    // Fetch latest board so we don't overwrite other updates.
    const latest = await fetchJson(`${state.dataUrl}${state.dataUrl.includes('?') ? '&' : '?'}cb=${cacheBust()}`);

    const rows = (() => {
      if (Array.isArray(latest)) return latest;
      if (latest && typeof latest === 'object') {
        if (Array.isArray(latest.rows)) return latest.rows;
        if (Array.isArray(latest.horses)) return latest.horses;
        if (Array.isArray(latest.items)) return latest.items;
        if (Array.isArray(latest.board)) return latest.board;
        if (latest.board && typeof latest.board === 'object') {
          if (Array.isArray(latest.board.rows)) return latest.board.rows;
          if (Array.isArray(latest.board.horses)) return latest.board.horses;
        }
      }
      return [];
    })();

    const idStr = String(horseId);
    const target = rows.find(r => String(getAny(r, FIELD.horse_id)) === idStr);
    if (!target) throw new Error('Horse not found in board.');

    // Uniqueness guard (use latest board, not local state)
    if (Object.prototype.hasOwnProperty.call(changes, 'boardNumber')) {
      const next = changes.boardNumber == null ? null : toInt(changes.boardNumber);
      if (next != null) {
        const used = new Set();
        rows.forEach(r => {
          const rid = String(getAny(r, FIELD.horse_id));
          if (rid === idStr) return;
          const bn = toInt(getAny(r, FIELD.boardNumber));
          if (Number.isFinite(bn)) used.add(bn);
        });
        if (used.has(next)) throw new Error(`Board slot ${next} is already used.`);
      }
      changes.boardNumber = next;
    }

    // Apply patch to latest board (client-side merge).
    Object.keys(changes).forEach(k => {
      target[k] = changes[k];
    });

    // Save via /feed/commit (POST) — fallback to it if config points somewhere invalid.
    const primary = state.saveUrl || '/feed/commit';
    const candidates = [primary];
    if (primary !== '/feed/commit') candidates.push('/feed/commit');

    setHeaderAction('Saving…', null);

    let lastErr = null;
    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ board: latest })
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          if (res.status === 405 && i + 1 < candidates.length) continue;
          throw new Error(`Save failed (${res.status})${txt ? ': ' + txt : ''}`);
        }

        // Success
        await loadBoard();
        discardDraft(horseId);
        state.showSlotPicker = false;
        gotoScreen('list1');
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error('Save failed.');
  }

  // ----------------------------
  // RENDER: Summary
  // ----------------------------
  function renderSummary() {
    clearRoot();
    setHeader('Summary');
    showBack(true);
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
    showBack(true);
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
