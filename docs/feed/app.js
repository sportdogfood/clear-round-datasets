// app.js — FeedBoard (legacy shell compatible)
// Canonical board JSON: ./data/latest/{board}.json  (default board: feed_board)
//
// Workflow as a state machine (no layout/CSS changes):
//   start   -> Start / Restart
//   state   -> Active Horses (toggle selection)
//   list1   -> FeedList (selected horses only)
//   detail  -> Horse Detail (edit + Save/Back)
//   summary -> Summary (selected horses only, chips + expandable note row)
//   list8   -> Text/Share (plain text output)
//   list2..list7 -> safe default route (Active Horses)

(function () {
  'use strict';

  // ----------------------------
  // DOM
  // ----------------------------
  const elTitle  = document.getElementById('header-title');
  const elBack   = document.getElementById('header-back');
  const elAction = document.getElementById('header-action');
  const elRoot   = document.getElementById('screen-root');

  // ----------------------------
  // CONFIG
  // ----------------------------
  const DEFAULT_BOARD_ID = 'feed_board';
  const DATA_BASE = './data/latest/';

  // local session: selection + drafts only
  const SESSION_VERSION = 'v1';
  const SESSION_PREFIX = 'feedboard_session__';

  // Field aliases (input JSON may use any of these)
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
    navScreen: 'start',

    boardId: DEFAULT_BOARD_ID,
    dataUrl: '',
    saveUrl: null,

    boardJson: null,
    horses: [],

    // local session
    session: { selected: {}, drafts: {} },

    // ui
    searchText: '',
    expandedNotes: {},

    // detail
    detailHorseId: null,
    showSlotPicker: false,
    errorMsg: ''
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
    while (elRoot && elRoot.firstChild) elRoot.removeChild(elRoot.firstChild);
  }

  function getAny(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== '') {
        return obj[k];
      }
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

  function stableHorseIdFromRow(row, fallbackIndex) {
    const id = getAny(row, FIELD.horse_id);
    if (id != null) return String(id).trim();
    const name = getAny(row, FIELD.horseName);
    if (name != null) return `name:${String(name).trim()}`;
    return `row:${String(fallbackIndex)}`;
  }

  function normalizeHorse(row, idx) {
    const horse_id = stableHorseIdFromRow(row, idx);
    const horseName = String(getAny(row, FIELD.horseName) || '(no horse)');
    const boardNumber = toInt(getAny(row, FIELD.boardNumber));
    const feed_display = String(getAny(row, FIELD.feed_display) || '').trim();
    const EEMix = toBool(getAny(row, FIELD.EEMix));
    const Positude = toBool(getAny(row, FIELD.Positude));
    const OM3GA = toBool(getAny(row, FIELD.OM3GA));
    const horse_feed_note = String(getAny(row, FIELD.horse_feed_note) || '').trim();

    return {
      horse_id,
      horseName,
      boardNumber,
      feed_display,
      EEMix,
      Positude,
      OM3GA,
      horse_feed_note
    };
  }

  function sortByBoardThenName(a, b) {
    const aN = (a && Number.isFinite(a.boardNumber)) ? a.boardNumber : null;
    const bN = (b && Number.isFinite(b.boardNumber)) ? b.boardNumber : null;
    if (aN != null && bN != null && aN !== bN) return aN - bN;
    if (aN != null && bN == null) return -1;
    if (aN == null && bN != null) return 1;
    return String(a.horseName || '').localeCompare(String(b.horseName || ''));
  }

  function sessionKey() {
    return `${SESSION_PREFIX}${SESSION_VERSION}__${state.boardId}`;
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(sessionKey());
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      state.session = {
        selected: obj.selected && typeof obj.selected === 'object' ? obj.selected : {},
        drafts: obj.drafts && typeof obj.drafts === 'object' ? obj.drafts : {}
      };
      state.expandedNotes = obj.expandedNotes && typeof obj.expandedNotes === 'object' ? obj.expandedNotes : {};
    } catch (_) {
      // ignore
    }
  }

  function saveSession() {
    try {
      const payload = {
        selected: state.session.selected || {},
        drafts: state.session.drafts || {},
        expandedNotes: state.expandedNotes || {}
      };
      localStorage.setItem(sessionKey(), JSON.stringify(payload));
    } catch (_) {
      // ignore
    }
  }

  function clearSession() {
    state.session = { selected: {}, drafts: {} };
    state.expandedNotes = {};
    state.searchText = '';
    state.detailHorseId = null;
    state.showSlotPicker = false;
    state.errorMsg = '';
    saveSession();
  }

  function selectedHorseIds() {
    const sel = state.session.selected || {};
    return Object.keys(sel).filter(k => !!sel[k]);
  }

  function selectedHorses() {
    const sel = state.session.selected || {};
    return (state.horses || []).filter(h => !!sel[h.horse_id]);
  }

  function setHeader(titleText) {
    if (!elTitle) return;
    elTitle.textContent = titleText;
  }

  function setBackVisible(isVisible) {
    if (!elBack) return;
    if (isVisible) {
      elBack.classList.remove('is-hidden');
      elBack.disabled = false;
    } else {
      elBack.classList.add('is-hidden');
      elBack.disabled = true;
    }
  }

  function setAction(label, isVisible) {
    if (!elAction) return;
    if (!isVisible) {
      elAction.hidden = true;
      elAction.textContent = '';
      return;
    }
    elAction.hidden = false;
    elAction.textContent = label;
  }

  function setNavActive(navKey) {
    const buttons = document.querySelectorAll('.nav-btn[data-screen]');
    buttons.forEach(btn => {
      const isActive = btn.getAttribute('data-screen') === navKey;
      if (isActive) btn.classList.add('nav-btn--primary');
      else btn.classList.remove('nav-btn--primary');
    });
  }

  function updateNavAgg() {
    const selectedCount = selectedHorseIds().length;
    const pairs = [
      ['state', selectedCount],
      ['list1', selectedCount],
      ['summary', selectedCount],
      ['list8', selectedCount]
    ];
    pairs.forEach(([k, v]) => {
      const els = document.querySelectorAll(`[data-nav-agg="${k}"]`);
      els.forEach(el => { el.textContent = String(v); });
    });
  }

  function initNavLabelsAndVisibility() {
    // Keep markup and CSS exactly; just repurpose the existing buttons.
    const map = {
      start:  { label: 'Start', show: true },
      state:  { label: 'Active', show: true },
      list1:  { label: 'List', show: true },
      summary:{ label: 'Summary', show: true },
      list8:  { label: 'Text', show: true },

      // legacy extra items -> hidden + safe route
      list2:  { show: false },
      list3:  { show: false },
      list4:  { show: false },
      list5:  { show: false },
      list6:  { show: false },
      list7:  { show: false }
    };

    const buttons = document.querySelectorAll('.nav-btn[data-screen]');
    buttons.forEach(btn => {
      const key = btn.getAttribute('data-screen');
      const cfg = map[key] || null;
      if (cfg && cfg.label) {
        const labelEl = btn.querySelector('.nav-label');
        if (labelEl) labelEl.textContent = cfg.label;
      }
      if (cfg && cfg.show === false) {
        btn.hidden = true;
      }
    });
  }

  // ----------------------------
  // DATA
  // ----------------------------
  async function loadBoard() {
    const boardRaw = qs('board') || qs('board_id') || qs('id') || DEFAULT_BOARD_ID;
    const boardId = String(boardRaw || '').trim() || DEFAULT_BOARD_ID;

    state.boardId = boardId;
    state.dataUrl = `${DATA_BASE}${boardId}.json`;

    // optional save endpoint (query param wins)
    const qSave = qs('save_url') || qs('save');
    state.saveUrl = qSave ? String(qSave).trim() : null;

    const bust = Date.now();
    const fetchUrl = `${state.dataUrl}?t=${bust}`;

    const resp = await fetch(fetchUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Fetch failed (${resp.status}) for ${state.dataUrl}`);

    const json = await resp.json();
    state.boardJson = json;

    // allow meta.save_url if not provided via query
    if (!state.saveUrl && json && json.meta && json.meta.save_url) {
      state.saveUrl = String(json.meta.save_url).trim();
    }

    // normalize horses
    const rows = Array.isArray(json) ? json : (json && Array.isArray(json.rows) ? json.rows : []);
    const byId = new Map();

    rows.forEach((r, idx) => {
      const h = normalizeHorse(r, idx);
      if (!byId.has(h.horse_id)) {
        byId.set(h.horse_id, h);
      } else {
        // prefer a record that has boardNumber set
        const cur = byId.get(h.horse_id);
        const curHas = cur && Number.isFinite(cur.boardNumber);
        const nextHas = h && Number.isFinite(h.boardNumber);
        if (!curHas && nextHas) byId.set(h.horse_id, h);
      }
    });

    state.horses = Array.from(byId.values());
    updateNavAgg();
  }

  // ----------------------------
  // NAV + ROUTING
  // ----------------------------
  function resolveScreenKey(screen) {
    if (!screen) return 'state';
    const s = String(screen);
    if (s === 'start' || s === 'state' || s === 'list1' || s === 'summary' || s === 'list8' || s === 'detail') {
      return s;
    }
    // list2..list7 safe default
    if (/^list[2-7]$/.test(s)) return 'state';
    return 'state';
  }

  function goto(screen) {
    const next = resolveScreenKey(screen);

    // nav highlights should stick to the last nav screen when in detail
    if (next !== 'detail') {
      state.navScreen = next;
      state.showSlotPicker = false;
      state.errorMsg = '';
    }

    state.screen = next;

    // header + action/back behavior
    if (state.screen === 'detail') {
      const h = findHorse(state.detailHorseId);
      setHeader(h ? h.horseName : 'Horse');
      setBackVisible(true);
      setAction('Save', true);
      setNavActive(state.navScreen);
    } else {
      if (state.screen === 'start') setHeader('Start');
      if (state.screen === 'state') setHeader('Active');
      if (state.screen === 'list1') setHeader('List');
      if (state.screen === 'summary') setHeader('Summary');
      if (state.screen === 'list8') setHeader('Text');

      setBackVisible(false);
      setAction('', false);
      setNavActive(state.screen);
    }

    render();
  }

  function bindNav() {
    const nav = document.getElementById('nav-row') || document;
    nav.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.nav-btn[data-screen]') : null;
      if (!btn) return;
      const screen = btn.getAttribute('data-screen');
      goto(screen);
    });
  }

  function bindHeader() {
    if (elBack) {
      elBack.addEventListener('click', () => {
        if (state.screen === 'detail') {
          discardDraft(state.detailHorseId);
          state.showSlotPicker = false;
          goto('list1');
          return;
        }
        goto('state');
      });
    }

    if (elAction) {
      elAction.addEventListener('click', async () => {
        if (state.screen !== 'detail') return;
        await saveDetail();
      });
    }
  }

  // ----------------------------
  // DRAFTS
  // ----------------------------
  function findHorse(horseId) {
    if (!horseId) return null;
    const id = String(horseId);
    return (state.horses || []).find(h => h.horse_id === id) || null;
  }

  function getDraft(horseId) {
    if (!horseId) return null;
    const id = String(horseId);
    const base = findHorse(id);
    if (!base) return null;

    const d = state.session.drafts && state.session.drafts[id] ? state.session.drafts[id] : null;
    if (!d) {
      return {
        horse_id: base.horse_id,
        horseName: base.horseName,
        boardNumber: base.boardNumber,
        feed_display: base.feed_display,
        EEMix: !!base.EEMix,
        Positude: !!base.Positude,
        OM3GA: !!base.OM3GA,
        horse_feed_note: base.horse_feed_note
      };
    }

    return {
      horse_id: base.horse_id,
      horseName: base.horseName,
      boardNumber: (d.boardNumber != null ? toInt(d.boardNumber) : base.boardNumber),
      feed_display: (d.feed_display != null ? String(d.feed_display) : base.feed_display),
      EEMix: (d.EEMix != null ? !!d.EEMix : !!base.EEMix),
      Positude: (d.Positude != null ? !!d.Positude : !!base.Positude),
      OM3GA: (d.OM3GA != null ? !!d.OM3GA : !!base.OM3GA),
      horse_feed_note: (d.horse_feed_note != null ? String(d.horse_feed_note) : base.horse_feed_note)
    };
  }

  function setDraftField(horseId, field, value) {
    const id = String(horseId);
    if (!state.session.drafts) state.session.drafts = {};
    if (!state.session.drafts[id]) state.session.drafts[id] = {};
    state.session.drafts[id][field] = value;
    saveSession();
  }

  function discardDraft(horseId) {
    if (!horseId) return;
    const id = String(horseId);
    if (state.session.drafts && state.session.drafts[id]) {
      delete state.session.drafts[id];
      saveSession();
    }
  }

  function computeChanges(base, draft) {
    const changes = {};
    if (!base || !draft) return changes;

    const keys = ['boardNumber', 'feed_display', 'EEMix', 'Positude', 'OM3GA', 'horse_feed_note'];
    keys.forEach(k => {
      const b = base[k];
      const d = draft[k];

      if (k === 'boardNumber') {
        const bN = Number.isFinite(b) ? b : null;
        const dN = Number.isFinite(d) ? d : null;
        if (bN !== dN) changes.boardNumber = dN;
        return;
      }

      if (typeof b === 'boolean' || typeof d === 'boolean') {
        if (!!b !== !!d) changes[k] = !!d;
        return;
      }

      const bS = String(b == null ? '' : b).trim();
      const dS = String(d == null ? '' : d).trim();
      if (bS !== dS) changes[k] = dS;
    });

    return changes;
  }

  // ----------------------------
  // SAVE
  // ----------------------------
  function usedSlotsMap(excludeHorseId) {
    const map = new Map();
    (state.horses || []).forEach(h => {
      if (!h) return;
      if (excludeHorseId && h.horse_id === excludeHorseId) return;
      if (Number.isFinite(h.boardNumber)) {
        map.set(h.boardNumber, h.horse_id);
      }
    });
    return map;
  }

  async function saveDetail() {
    const horseId = state.detailHorseId;
    const base = findHorse(horseId);
    const draft = getDraft(horseId);
    if (!base || !draft) return;

    state.errorMsg = '';

    // local uniqueness guard
    if (Number.isFinite(draft.boardNumber)) {
      const used = usedSlotsMap(base.horse_id);
      if (used.has(draft.boardNumber)) {
        const otherId = used.get(draft.boardNumber);
        const other = findHorse(otherId);
        state.errorMsg = `Slot ${draft.boardNumber} is already used${other ? ` by ${other.horseName}` : ''}.`;
        render();
        return;
      }
    }

    const changes = computeChanges(base, draft);
    if (!Object.keys(changes).length) {
      // nothing to do
      discardDraft(horseId);
      goto('list1');
      return;
    }

    if (!state.saveUrl) {
      state.errorMsg = 'Save endpoint not configured (missing save_url).';
      render();
      return;
    }

    // Server-mediated save (app never sees proxy key)
    const payload = {
      board: state.boardId,
      horse_id: base.horse_id,
      changes,
      requestedBoardNumber: ('boardNumber' in changes) ? changes.boardNumber : null
    };

    setAction('Saving…', true);

    try {
      const resp = await fetch(state.saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`Save failed (${resp.status})${txt ? `: ${txt}` : ''}`);
      }

      const json = await resp.json().catch(() => null);

      // If server returns board, hydrate; else re-fetch canonical board.
      if (json && (Array.isArray(json) || (json.rows && Array.isArray(json.rows)))) {
        state.boardJson = json;
        const rows = Array.isArray(json) ? json : json.rows;
        const byId = new Map();
        rows.forEach((r, idx) => {
          const h = normalizeHorse(r, idx);
          if (!byId.has(h.horse_id)) byId.set(h.horse_id, h);
        });
        state.horses = Array.from(byId.values());
      } else {
        await loadBoard();
      }

      discardDraft(horseId);
      setAction('Save', true);
      updateNavAgg();
      goto('list1');
    } catch (err) {
      state.errorMsg = String(err && err.message ? err.message : err);
      setAction('Save', true);
      render();
    }
  }

  // ----------------------------
  // RENDERERS
  // ----------------------------
  function renderErrorIfAny(col) {
    if (!state.errorMsg) return;
    const row = mk('div', 'row', `<div><div class="row-title">${esc(state.errorMsg)}</div></div>`);
    row.style.borderColor = '#ef4444';
    row.style.background = '#1f2937';
    col.appendChild(row);
  }

  function renderStart() {
    clearRoot();

    const col = mk('div', 'list-column');

    const logo = mk('div', 'start-logo', `
      <div class="start-logo-title">FeedBoard</div>
      <div class="start-logo-subtitle">board: ${esc(state.boardId)}</div>
    `);
    col.appendChild(logo);

    const btn = mk('div', 'row row--tap', `
      <div>
        <div class="row-title">New session / Restart</div>
        <div style="margin-top:6px; opacity:0.85; font-size:12px;">Clears local selection + drafts and reloads the latest board.</div>
      </div>
      <div class="row-tag row-tag--count">GO</div>
    `);

    btn.addEventListener('click', async () => {
      clearSession();
      try {
        await loadBoard();
        updateNavAgg();
        goto('state');
      } catch (err) {
        state.errorMsg = String(err && err.message ? err.message : err);
        render();
      }
    });

    col.appendChild(btn);

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function renderActiveHorses() {
    clearRoot();

    const col = mk('div', 'list-column');
    col.appendChild(mk('div', 'list-group-label', 'Active Horses'));

    // search
    const searchWrap = mk('div', 'state-search');
    const input = mk('input', 'state-search-input');
    input.type = 'text';
    input.placeholder = 'Search horses…';
    input.value = state.searchText || '';
    input.addEventListener('input', () => {
      state.searchText = input.value || '';
      render();
    });
    searchWrap.appendChild(input);
    col.appendChild(searchWrap);

    const q = (state.searchText || '').trim().toLowerCase();
    const horses = (state.horses || []).slice().sort((a, b) => String(a.horseName).localeCompare(String(b.horseName)));

    const visible = q
      ? horses.filter(h => String(h.horseName || '').toLowerCase().includes(q))
      : horses;

    if (!visible.length) {
      col.appendChild(mk('div', 'row', `<div><div class="row-title">No horses.</div></div>`));
      elRoot.appendChild(col);
      return;
    }

    visible.forEach(h => {
      const isSel = !!(state.session.selected && state.session.selected[h.horse_id]);
      const row = mk('div', `row row--tap${isSel ? ' row--active' : ''}`, `
        <div style="min-width:0;">
          <div class="row-title">${esc(h.horseName)}</div>
        </div>
        <div class="row-tag${isSel ? ' row-tag--positive' : ''}">${isSel ? 'ON' : 'OFF'}</div>
      `);

      row.addEventListener('click', () => {
        if (!state.session.selected) state.session.selected = {};
        state.session.selected[h.horse_id] = !isSel;
        saveSession();
        updateNavAgg();
        render();
      });

      col.appendChild(row);
    });

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function tagsForHorse(h) {
    const tags = [];
    if (h.feed_display) tags.push(h.feed_display);
    if (h.EEMix) tags.push('EEMix');
    if (h.Positude) tags.push('Positude');
    if (h.OM3GA) tags.push('OM3GA');
    return tags;
  }

  function rowTagsHtml(tags) {
    const clean = (tags || []).filter(Boolean).map(t => `<span class="row-tag">${esc(t)}</span>`);
    if (!clean.length) return '';
    return `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">${clean.join('')}</div>`;
  }

  function renderFeedList() {
    clearRoot();

    const col = mk('div', 'list-column');
    col.appendChild(mk('div', 'list-group-label', 'List'));

    const list = selectedHorses().slice().sort(sortByBoardThenName);
    if (!list.length) {
      col.appendChild(mk('div', 'row', `<div><div class="row-title">No selected horses. Use Active to select.</div></div>`));
      elRoot.appendChild(col);
      return;
    }

    list.forEach(h => {
      const tags = tagsForHorse(h);
      const left = `
        <div style="min-width:0;">
          <div class="row-title">${esc(h.horseName)}</div>
          ${rowTagsHtml(tags)}
        </div>`;

      const slot = Number.isFinite(h.boardNumber) ? String(h.boardNumber) : '-';
      const right = `<div class="row-tag row-tag--count">${esc(slot)}</div>`;

      const row = mk('div', 'row row--tap', left + right);
      row.addEventListener('click', () => {
        state.detailHorseId = h.horse_id;
        state.showSlotPicker = false;
        state.errorMsg = '';
        goto('detail');
      });
      col.appendChild(row);
    });

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function renderSlotPicker(col, base, draft) {
    const used = usedSlotsMap(base.horse_id);

    let maxUsed = 0;
    (state.horses || []).forEach(h => {
      if (h && Number.isFinite(h.boardNumber)) maxUsed = Math.max(maxUsed, h.boardNumber);
    });
    const slotMax = Math.min(Math.max(maxUsed + 5, 25), 99);

    col.appendChild(mk('div', 'list-group-label', 'Pick slot'));

    // Clear slot
    const clearRow = mk('div', 'row row--tap', `
      <div><div class="row-title">No Slot</div></div>
      <div class="row-tag">Clear</div>
    `);
    clearRow.addEventListener('click', () => {
      setDraftField(base.horse_id, 'boardNumber', null);
      state.showSlotPicker = false;
      render();
    });
    col.appendChild(clearRow);

    for (let n = 1; n <= slotMax; n++) {
      const takenBy = used.get(n) || null;
      const isMine = (Number.isFinite(draft.boardNumber) && draft.boardNumber === n);
      const disabled = !!takenBy;

      const right = disabled
        ? (() => {
            const other = findHorse(takenBy);
            const label = other ? other.horseName : 'Used';
            return `<div class="row-tag">${esc(label)}</div>`;
          })()
        : `<div class="row-tag${isMine ? ' row-tag--positive' : ''}">${isMine ? 'Current' : 'Select'}</div>`;

      const row = mk('div', `row row--tap${isMine ? ' row--active' : ''}`, `
        <div><div class="row-title">Slot ${n}</div></div>
        ${right}
      `);

      if (disabled) {
        row.style.opacity = '0.5';
        row.style.pointerEvents = 'none';
      } else {
        row.addEventListener('click', () => {
          setDraftField(base.horse_id, 'boardNumber', n);
          state.showSlotPicker = false;
          render();
        });
      }

      col.appendChild(row);
    }
  }

  function renderDetail() {
    clearRoot();

    const base = findHorse(state.detailHorseId);
    if (!base) {
      const col = mk('div', 'list-column');
      col.appendChild(mk('div', 'row', `<div><div class="row-title">Horse not found.</div></div>`));
      elRoot.appendChild(col);
      return;
    }

    const draft = getDraft(base.horse_id);

    const col = mk('div', 'list-column');
    col.appendChild(mk('div', 'list-group-label', 'Horse Detail'));

    // Slot picker
    const slotText = Number.isFinite(draft.boardNumber) ? String(draft.boardNumber) : '-';
    const slotRow = mk('div', 'row row--tap', `
      <div><div class="row-title">Slot</div></div>
      <div class="row-tag row-tag--count">${esc(slotText)}</div>
    `);
    slotRow.addEventListener('click', () => {
      state.showSlotPicker = !state.showSlotPicker;
      render();
    });
    col.appendChild(slotRow);

    if (state.showSlotPicker) {
      renderSlotPicker(col, base, draft);
    }

    // Feed
    col.appendChild(mk('div', 'list-group-label', 'Feed'));

    const feedInput = mk('input', 'state-search-input');
    feedInput.type = 'text';
    feedInput.placeholder = 'Feed (feed_display)…';
    feedInput.value = draft.feed_display || '';
    feedInput.addEventListener('input', () => setDraftField(base.horse_id, 'feed_display', feedInput.value));
    col.appendChild(feedInput);

    // Supplements
    col.appendChild(mk('div', 'list-group-label', 'Supplements'));

    const toggles = [
      ['EEMix', 'EEMix'],
      ['Positude', 'Positude'],
      ['OM3GA', 'OM3GA']
    ];

    toggles.forEach(([field, label]) => {
      const on = !!draft[field];
      const row = mk('div', `row row--tap${on ? ' row--active' : ''}`, `
        <div><div class="row-title">${esc(label)}</div></div>
        <div class="row-tag${on ? ' row-tag--positive' : ''}">${on ? 'ON' : 'OFF'}</div>
      `);
      row.addEventListener('click', () => {
        setDraftField(base.horse_id, field, !on);
        render();
      });
      col.appendChild(row);
    });

    // Note
    col.appendChild(mk('div', 'list-group-label', 'Note'));

    const note = mk('textarea', 'state-search-input');
    note.placeholder = 'horse_feed_note…';
    note.value = draft.horse_feed_note || '';
    note.rows = 3;
    note.style.minHeight = '92px';
    note.style.resize = 'vertical';
    note.addEventListener('input', () => setDraftField(base.horse_id, 'horse_feed_note', note.value));
    col.appendChild(note);

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function renderSummary() {
    clearRoot();

    const col = mk('div', 'list-column');
    col.appendChild(mk('div', 'list-group-label', 'Summary'));

    const list = selectedHorses().slice().sort(sortByBoardThenName);
    if (!list.length) {
      col.appendChild(mk('div', 'row', `<div><div class="row-title">No selected horses. Use Active to select.</div></div>`));
      elRoot.appendChild(col);
      return;
    }

    list.forEach(h => {
      const tags = [];
      if (h.feed_display) tags.push(h.feed_display);
      if (h.EEMix) tags.push('EEMix');
      if (h.Positude) tags.push('Positude');
      if (h.OM3GA) tags.push('OM3GA');

      const hasNote = !!(h.horse_feed_note && String(h.horse_feed_note).trim());
      const noteLabel = hasNote ? 'Note' : 'No Note';

      const noteChip = `<span class="row-tag${hasNote ? '' : ''}" style="cursor:pointer;" data-note="${esc(h.horse_id)}">${esc(noteLabel)}</span>`;

      const left = `
        <div style="min-width:0;">
          <div class="row-title">${esc(h.horseName)}</div>
          <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
            ${(tags.map(t => `<span class="row-tag">${esc(t)}</span>`)).join('')}
            ${noteChip}
          </div>
        </div>`;

      const slot = Number.isFinite(h.boardNumber) ? String(h.boardNumber) : '-';
      const right = `<div class="row-tag row-tag--count">${esc(slot)}</div>`;

      const row = mk('div', 'row', left + right);

      col.appendChild(row);

      if (state.expandedNotes && state.expandedNotes[h.horse_id] && hasNote) {
        const noteRow = mk('div', 'row', `<div style="min-width:0;"><div class="row-title">${esc(h.horse_feed_note)}</div></div>`);
        noteRow.style.opacity = '0.95';
        col.appendChild(noteRow);
      }

      // divider feel
      // (use existing gap; no extra)
    });

    // note toggle handler (delegated)
    col.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.getAttribute) return;
      const id = t.getAttribute('data-note');
      if (!id) return;
      if (!state.expandedNotes) state.expandedNotes = {};
      state.expandedNotes[id] = !state.expandedNotes[id];
      saveSession();
      render();
    }, { once: true });

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function buildTextBoard() {
    const list = selectedHorses().slice().sort(sortByBoardThenName);
    if (!list.length) return 'No selected horses.';

    const lines = [];
    list.forEach(h => {
      const slot = Number.isFinite(h.boardNumber) ? String(h.boardNumber).padStart(2, '0') : '--';
      const supp = [];
      if (h.EEMix) supp.push('EEMix');
      if (h.Positude) supp.push('Positude');
      if (h.OM3GA) supp.push('OM3GA');

      const feed = h.feed_display ? h.feed_display : '';
      const s = supp.length ? ` (${supp.join(', ')})` : '';
      const note = (h.horse_feed_note && String(h.horse_feed_note).trim()) ? ` — ${String(h.horse_feed_note).trim()}` : '';

      lines.push(`${slot}  ${h.horseName}${feed ? `: ${feed}` : ''}${s}${note}`);
    });

    return lines.join('\n');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // ignore
    }

    // fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  function renderText() {
    clearRoot();

    const col = mk('div', 'list-column');
    col.appendChild(mk('div', 'list-group-label', 'Text / Share'));

    const text = buildTextBoard();

    const ta = mk('textarea', 'state-search-input');
    ta.value = text;
    ta.rows = 10;
    ta.style.minHeight = '220px';
    ta.style.resize = 'vertical';
    col.appendChild(ta);

    const copyRow = mk('div', 'row row--tap', `
      <div><div class="row-title">Copy</div></div>
      <div class="row-tag row-tag--count">COPY</div>
    `);
    copyRow.addEventListener('click', async () => {
      const ok = await copyText(ta.value);
      state.errorMsg = ok ? '' : 'Copy failed.';
      render();
    });
    col.appendChild(copyRow);

    const smsRow = mk('div', 'row row--tap', `
      <div><div class="row-title">SMS</div></div>
      <div class="row-tag row-tag--count">OPEN</div>
    `);
    smsRow.addEventListener('click', () => {
      const body = encodeURIComponent(ta.value);
      // iOS + Android generally accept sms:?&body=
      window.location.href = `sms:?&body=${body}`;
    });
    col.appendChild(smsRow);

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function render() {
    updateNavAgg();

    if (state.screen === 'start') return renderStart();
    if (state.screen === 'state') return renderActiveHorses();
    if (state.screen === 'list1') return renderFeedList();
    if (state.screen === 'detail') return renderDetail();
    if (state.screen === 'summary') return renderSummary();
    if (state.screen === 'list8') return renderText();

    // safe default
    return renderActiveHorses();
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  async function boot() {
    try {
      initNavLabelsAndVisibility();
      bindNav();
      bindHeader();

      await loadBoard();
      loadSession();

      // If we have selections, land on List; otherwise Active.
      if (selectedHorseIds().length) {
        state.navScreen = 'list1';
        goto('list1');
      } else {
        state.navScreen = 'state';
        goto('start');
      }
    } catch (err) {
      state.errorMsg = String(err && err.message ? err.message : err);
      goto('start');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
