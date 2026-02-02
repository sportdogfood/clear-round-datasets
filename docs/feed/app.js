// app.js — FeedBoard (legacy shell, nav repurposed; no markup/CSS edits)
// Data: ./data/latest/{board}.json (default board=feed_board)

(function () {
  'use strict';

  // ----------------------------
  // DOM
  // ----------------------------
  const elRoot = document.getElementById('screen-root');
  const elHeaderTitle = document.getElementById('header-title');
  const elHeaderBack = document.getElementById('header-back');
  const elHeaderAction = document.getElementById('header-action');
  const elNavRow = document.getElementById('nav-row');

  if (!elRoot || !elHeaderTitle || !elHeaderBack || !elHeaderAction || !elNavRow) return;

  // ----------------------------
  // CONFIG
  // ----------------------------
  const DEFAULT_BOARD = 'feed_board';
  const DEFAULT_DATA_DIR = './data/latest/';

  // Save endpoint discovery (only used when meta/query param is not provided)
  const DEFAULT_SAVE_CANDIDATES = [
    '/feed/save',
    '/feed/patch',
    '/api/feed/save',
    '/api/feed/patch',
    '/api/feedboard/save',
    '/api/feedboard/patch'
  ];

  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    board: DEFAULT_BOARD,
    dataDir: DEFAULT_DATA_DIR,
    rows: [],
    meta: {},

    // local session
    session: {
      selected: {},     // horse_id -> true
      drafts: {},       // horse_id -> draft object
      expanded: {}      // horse_id -> true (summary note expanded)
    },

    // routing
    screen: 'start',    // start | state | list1 | detail | summary | list8
    currentHorseId: null,

    // ui
    errorMsg: '',
    headerBack: null,
    headerAction: null
  };

  // ----------------------------
  // HELPERS
  // ----------------------------
  function qs(key) {
    const url = new URL(window.location.href);
    const val = url.searchParams.get(key);
    return val == null ? '' : String(val);
  }

  function sessionKey() {
    return `feed_session_v1:${state.board}`;
  }

  function safeText(v) {
    return v == null ? '' : String(v);
  }

  function toBool(v) {
    if (v === true || v === false) return v;
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return false;
    if (['1', 'true', 't', 'y', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'f', 'n', 'no', 'off'].includes(s)) return false;
    return Boolean(v);
  }

  function toIntOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return i;
  }

  function mk(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function clearRoot() {
    elRoot.innerHTML = '';
  }

  function setHeader({ title, backVisible, actionText, actionVisible, actionDisabled }) {
    elHeaderTitle.textContent = title || '';

    elHeaderBack.hidden = !backVisible;
    elHeaderAction.hidden = !actionVisible;

    if (actionVisible) {
      elHeaderAction.textContent = actionText || '';
      elHeaderAction.disabled = Boolean(actionDisabled);
    }
  }

  function setNavAgg(screenKey, count, positive) {
    const el = document.querySelector(`[data-nav-agg="${screenKey}"]`);
    if (!el) return;
    el.textContent = String(count);
    el.classList.toggle('nav-agg--positive', Boolean(positive));
  }

  function updateNavAgg() {
    const total = state.rows.length;
    const sel = selectedHorseIds().length;

    setNavAgg('state', total, total > 0);
    setNavAgg('list1', sel, sel > 0);
    setNavAgg('summary', sel, sel > 0);
    setNavAgg('list8', sel, sel > 0);
  }

  function setActiveNavBtn(screenKey) {
    const btns = elNavRow.querySelectorAll('.nav-btn[data-screen]');
    btns.forEach((b) => b.classList.remove('nav-btn--primary'));

    const b = elNavRow.querySelector(`.nav-btn[data-screen="${screenKey}"]`);
    if (b) b.classList.add('nav-btn--primary');
  }

  function selectedHorseIds() {
    return Object.keys(state.session.selected || {}).filter((k) => state.session.selected[k]);
  }

  function getHorseById(horseId) {
    return state.rows.find((r) => String(r.horse_id) === String(horseId)) || null;
  }

  function normalizeBoard(json) {
    let rows = [];
    let meta = {};

    if (Array.isArray(json)) {
      rows = json;
    } else if (json && typeof json === 'object') {
      if (Array.isArray(json.rows)) rows = json.rows;
      else if (Array.isArray(json.horses)) rows = json.horses;
      else if (Array.isArray(json.board)) rows = json.board;
      meta = json.meta && typeof json.meta === 'object' ? json.meta : {};
      // also allow top-level meta-ish fields
      ['dt', 'sid', 'generated_at', 'save_url'].forEach((k) => {
        if (json[k] != null && meta[k] == null) meta[k] = json[k];
      });
    }

    const out = [];
    rows.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const horse_id = raw.horse_id ?? raw.horseId ?? raw.id;
      const horseName = raw.horseName ?? raw.horse_name ?? raw.name ?? raw.horse ?? '';

      if (horse_id == null) return; // hard requirement for selection + save

      const boardNumber =
        raw.boardNumber ?? raw.board_number ?? raw.board_no ?? raw.slot ?? raw.board;

      out.push({
        horse_id: String(horse_id),
        horseName: safeText(horseName),
        boardNumber: toIntOrNull(boardNumber),
        feed_display: safeText(raw.feed_display ?? raw.feedDisplay ?? raw.feed ?? ''),
        EEMix: toBool(raw.EEMix ?? raw.eeMix ?? raw.ee_mix ?? false),
        Positude: toBool(raw.Positude ?? raw.positude ?? false),
        OM3GA: toBool(raw.OM3GA ?? raw.om3ga ?? false),
        horse_feed_note: safeText(raw.horse_feed_note ?? raw.note ?? raw.horseNote ?? '')
      });
    });

    return { rows: out, meta };
  }

  function saveSession() {
    try {
      localStorage.setItem(sessionKey(), JSON.stringify(state.session));
    } catch (_) {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(sessionKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.session.selected = parsed.selected && typeof parsed.selected === 'object' ? parsed.selected : {};
        state.session.drafts = parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {};
        state.session.expanded = parsed.expanded && typeof parsed.expanded === 'object' ? parsed.expanded : {};

        // drop selections that no longer exist
        const valid = new Set(state.rows.map((r) => r.horse_id));
        Object.keys(state.session.selected).forEach((k) => {
          if (!valid.has(k)) delete state.session.selected[k];
        });

        // drop drafts that no longer exist
        Object.keys(state.session.drafts).forEach((k) => {
          if (!valid.has(k)) delete state.session.drafts[k];
        });
      }
    } catch (_) {}
  }

  function clearSession() {
    state.session = { selected: {}, drafts: {}, expanded: {} };
    try { localStorage.removeItem(sessionKey()); } catch (_) {}
  }

  function sortByBoardThenName(list) {
    return [...list].sort((a, b) => {
      const an = a.boardNumber == null ? 1e9 : a.boardNumber;
      const bn = b.boardNumber == null ? 1e9 : b.boardNumber;
      if (an !== bn) return an - bn;
      return String(a.horseName).localeCompare(String(b.horseName));
    });
  }

  function buildTextBoard() {
    const selected = sortByBoardThenName(state.rows.filter((r) => state.session.selected[r.horse_id]));
    const lines = selected.map((h) => {
      const slot = h.boardNumber == null ? '-' : String(h.boardNumber);
      const supp = [h.EEMix ? 'EE' : '', h.Positude ? 'POS' : '', h.OM3GA ? 'OM' : ''].filter(Boolean).join(' ');
      const feed = h.feed_display ? h.feed_display : '';
      const note = h.horse_feed_note ? ` — ${h.horse_feed_note}` : '';
      const mid = [feed, supp].filter(Boolean).join(' | ');
      return `${slot}) ${h.horseName}${mid ? ' — ' + mid : ''}${note}`;
    });
    return lines.join('\n');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  // ----------------------------
  // DATA
  // ----------------------------
  function boardUrl() {
    const dir = state.dataDir.endsWith('/') ? state.dataDir : state.dataDir + '/';
    const file = `${state.board}.json`;
    const bust = `v=${Date.now()}`;
    return `${dir}${file}?${bust}`;
  }

  async function loadBoard() {
    const res = await fetch(boardUrl(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Board GET failed (${res.status})`);
    const json = await res.json();
    const norm = normalizeBoard(json);
    state.rows = norm.rows;
    state.meta = norm.meta || {};
  }

  function getSaveUrlCandidates() {
    const q = qs('save_url') || qs('saveUrl') || qs('save');
    const m = state.meta && (state.meta.save_url || state.meta.saveUrl || state.meta.save);

    const out = [];
    if (q) out.push(q);
    if (m && !out.includes(m)) out.push(m);

    DEFAULT_SAVE_CANDIDATES.forEach((u) => {
      if (!out.includes(u)) out.push(u);
    });

    return out;
  }

  function diffDraft(base, draft) {
    const keys = ['boardNumber', 'feed_display', 'EEMix', 'Positude', 'OM3GA', 'horse_feed_note'];
    const patch = {};
    keys.forEach((k) => {
      if (draft[k] !== base[k]) patch[k] = draft[k];
    });
    return patch;
  }

  function parseBoardFromResponse(json) {
    if (Array.isArray(json)) return normalizeBoard(json);
    if (json && typeof json === 'object') {
      if (Array.isArray(json.rows) || Array.isArray(json.horses) || Array.isArray(json.board)) return normalizeBoard(json);
      if (json.data && (Array.isArray(json.data.rows) || Array.isArray(json.data.horses))) return normalizeBoard(json.data);
    }
    return null;
  }

  async function saveDraft(horseId) {
    const base = getHorseById(horseId);
    const draft = state.session.drafts[horseId];
    if (!base || !draft) return;

    const patch = diffDraft(base, draft);
    if (!Object.keys(patch).length) {
      // nothing changed
      delete state.session.drafts[horseId];
      saveSession();
      goto('list1');
      return;
    }

    const payload = {
      board: state.board,
      horse_id: horseId,
      patch,
      requestedBoardNumber: patch.boardNumber,
      client_ts: new Date().toISOString()
    };

    const candidates = getSaveUrlCandidates();
    const attempts = [];

    for (const url of candidates) {
      for (const method of ['PATCH', 'POST']) {
        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          attempts.push(`${method} ${url} -> ${res.status}`);

          if (res.status === 404) continue; // try next URL
          if (res.status === 405) continue; // try next method/URL

          if (!res.ok) {
            let msg = `Save failed (${res.status})`;
            try {
              const j = await res.json();
              if (j && (j.error || j.message)) msg += `: ${j.error || j.message}`;
            } catch (_) {}
            throw new Error(msg);
          }

          let nextJson = null;
          try { nextJson = await res.json(); } catch (_) {}

          const parsed = nextJson ? parseBoardFromResponse(nextJson) : null;
          if (parsed) {
            state.rows = parsed.rows;
            state.meta = parsed.meta || state.meta;
          } else {
            // fallback: re-GET board
            await loadBoard();
          }

          // clear draft, persist session
          delete state.session.drafts[horseId];
          saveSession();

          goto('list1');
          return;
        } catch (err) {
          // network / non-404 errors stop here
          state.errorMsg = String(err && err.message ? err.message : err);
          state.errorMsg += `\nTried: ${attempts.slice(-6).join(' | ')}`;
          render();
          return;
        }
      }
    }

    state.errorMsg = `Save failed: no endpoint matched. Tried: ${attempts.join(' | ')}`;
    render();
  }

  // ----------------------------
  // NAV + HEADER BINDINGS
  // ----------------------------
  function initNavLabelsAndVisibility() {
    const btns = elNavRow.querySelectorAll('.nav-btn[data-screen]');

    btns.forEach((btn) => {
      const ds = btn.getAttribute('data-screen');
      const labelEl = btn.querySelector('.nav-label');

      // default: hide non-feed tabs, but keep markup
      if (['list2', 'list3', 'list4', 'list5', 'list6', 'list7'].includes(ds)) {
        btn.classList.add('is-hidden');
        return;
      }

      if (!labelEl) return;

      if (ds === 'state') labelEl.textContent = 'Active';
      if (ds === 'list1') labelEl.textContent = 'List';
      if (ds === 'summary') labelEl.textContent = 'Summary';
      if (ds === 'list8') labelEl.textContent = 'Text';
      if (ds === 'start') labelEl.textContent = 'Start';
    });
  }

  function bindNav() {
    elNavRow.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.nav-btn[data-screen]') : null;
      if (!btn) return;
      const ds = btn.getAttribute('data-screen');

      // leaving detail discards draft for that horse (unless saved)
      if (state.screen === 'detail') {
        // discard by default
        const hid = state.currentHorseId;
        if (hid && state.session.drafts[hid]) delete state.session.drafts[hid];
        state.currentHorseId = null;
        saveSession();
      }

      if (ds === 'start') {
        goto('start');
        setActiveNavBtn('start');
        return;
      }
      if (ds === 'state') {
        goto('state');
        setActiveNavBtn('state');
        return;
      }
      if (ds === 'list1') {
        goto('list1');
        setActiveNavBtn('list1');
        return;
      }
      if (ds === 'summary') {
        goto('summary');
        setActiveNavBtn('summary');
        return;
      }
      if (ds === 'list8') {
        goto('list8');
        setActiveNavBtn('list8');
        return;
      }

      // safe default for any other legacy tab
      goto('state');
      setActiveNavBtn('state');
    });
  }

  function bindHeader() {
    elHeaderBack.addEventListener('click', () => {
      if (typeof state.headerBack === 'function') state.headerBack();
    });
    elHeaderAction.addEventListener('click', () => {
      if (typeof state.headerAction === 'function') state.headerAction();
    });
  }

  // ----------------------------
  // SCREEN RENDERERS
  // ----------------------------
  function renderErrorIfAny(container) {
    if (!state.errorMsg) return;
    const row = mk('div', 'row', `
      <div style="display:flex;flex-direction:column;gap:6px;width:100%">
        <div class="row-title" style="white-space:normal;overflow:visible;text-overflow:clip">${safeText(state.errorMsg)}</div>
      </div>
    `);
    container.appendChild(row);
  }

  function renderStart() {
    state.headerBack = null;
    state.headerAction = null;

    setHeader({ title: 'Start', backVisible: false, actionVisible: false });

    clearRoot();
    const col = mk('div', 'list-column');

    const logo = mk('div', 'start-logo', `
      <div class="start-logo-title">FeedBoard</div>
      <div class="start-logo-subtitle">${safeText(state.board)}${state.meta && state.meta.dt ? ' • ' + safeText(state.meta.dt) : ''}</div>
    `);
    col.appendChild(logo);

    const restart = mk('div', 'row row--tap', `
      <div><div class="row-title">New session / Restart</div></div>
      <div class="row-tag row-tag--count">GO</div>
    `);
    restart.addEventListener('click', async () => {
      state.errorMsg = '';
      clearSession();
      await loadBoard();
      goto('state');
      setActiveNavBtn('state');
    });
    col.appendChild(restart);

    const cont = mk('div', 'row row--tap', `
      <div><div class="row-title">Continue</div></div>
      <div class="row-tag row-tag--count">OPEN</div>
    `);
    cont.addEventListener('click', () => {
      goto('state');
      setActiveNavBtn('state');
    });
    col.appendChild(cont);

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function renderActiveHorses() {
    state.headerBack = null;
    state.headerAction = null;

    setHeader({ title: 'Active', backVisible: false, actionVisible: false });

    clearRoot();
    const col = mk('div', 'list-column');

    // search
    const searchWrap = mk('div', 'state-search');
    const input = mk('input', 'state-search-input');
    input.type = 'search';
    input.placeholder = 'Filter horses…';
    searchWrap.appendChild(input);
    col.appendChild(searchWrap);

    let filter = '';
    function rerenderList() {
      // remove existing horse rows after search
      const existing = col.querySelectorAll('[data-horse-row="1"]');
      existing.forEach((n) => n.remove());

      const term = filter.trim().toLowerCase();
      const list = state.rows.filter((h) => !term || h.horseName.toLowerCase().includes(term));

      list.forEach((h) => {
        const selected = Boolean(state.session.selected[h.horse_id]);
        const slot = h.boardNumber == null ? '-' : String(h.boardNumber);

        const row = mk('div', `row row--tap${selected ? ' row--active' : ''}`, `
          <div><div class="row-title">${safeText(h.horseName)}</div></div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="row-tag row-tag--count">${slot}</span>
            <span class="row-tag row-tag--boolean${selected ? ' row-tag--positive' : ''}"></span>
          </div>
        `);
        row.setAttribute('data-horse-row', '1');
        row.addEventListener('click', () => {
          state.errorMsg = '';
          state.session.selected[h.horse_id] = !selected;
          saveSession();
          updateNavAgg();
          rerenderList();
        });
        col.appendChild(row);
      });

      renderErrorIfAny(col);
    }

    input.addEventListener('input', () => {
      filter = input.value || '';
      rerenderList();
    });

    rerenderList();

    elRoot.appendChild(col);
  }

  function renderFeedList() {
    state.headerBack = null;
    state.headerAction = null;

    setHeader({ title: 'List', backVisible: false, actionVisible: false });

    clearRoot();
    const col = mk('div', 'list-column');

    const selected = sortByBoardThenName(state.rows.filter((h) => state.session.selected[h.horse_id]));

    if (!selected.length) {
      const empty = mk('div', 'row', `
        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div class="row-title" style="white-space:normal;overflow:visible;text-overflow:clip">No horses selected.</div>
        </div>
      `);
      col.appendChild(empty);
      elRoot.appendChild(col);
      return;
    }

    selected.forEach((h) => {
      const slot = h.boardNumber == null ? '-' : String(h.boardNumber);
      const row = mk('div', 'row row--tap', `
        <div><div class="row-title">${safeText(h.horseName)}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="row-tag row-tag--count">${slot}</span>
          ${h.feed_display ? `<span class="row-tag row-tag--count">FEED</span>` : ''}
        </div>
      `);
      row.addEventListener('click', () => openDetail(h.horse_id));
      col.appendChild(row);
    });

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function openDetail(horseId) {
    const base = getHorseById(horseId);
    if (!base) return;

    state.errorMsg = '';
    state.currentHorseId = horseId;

    // seed draft from base
    state.session.drafts[horseId] = {
      horse_id: base.horse_id,
      horseName: base.horseName,
      boardNumber: base.boardNumber,
      feed_display: base.feed_display,
      EEMix: base.EEMix,
      Positude: base.Positude,
      OM3GA: base.OM3GA,
      horse_feed_note: base.horse_feed_note
    };

    saveSession();
    goto('detail');
  }

  function renderDetail() {
    const horseId = state.currentHorseId;
    const base = horseId ? getHorseById(horseId) : null;
    const draft = horseId ? state.session.drafts[horseId] : null;

    if (!horseId || !base || !draft) {
      state.currentHorseId = null;
      goto('list1');
      return;
    }

    state.headerBack = () => {
      // discard draft
      delete state.session.drafts[horseId];
      state.currentHorseId = null;
      saveSession();
      goto('list1');
    };

    state.headerAction = async () => {
      state.errorMsg = '';
      render();
      await saveDraft(horseId);
    };

    setHeader({ title: draft.horseName || 'Horse', backVisible: true, actionVisible: true, actionText: 'Save', actionDisabled: false });

    clearRoot();
    const col = mk('div', 'list-column');

    // Slot picker (prompt)
    col.appendChild(mk('div', 'list-group-label', 'Slot'));

    const used = new Set(
      state.rows
        .filter((h) => h.horse_id !== horseId)
        .map((h) => h.boardNumber)
        .filter((n) => n != null)
    );

    const slotText = draft.boardNumber == null ? '-' : String(draft.boardNumber);

    const slotRow = mk('div', 'row row--tap', `
      <div><div class="row-title">Board Number</div></div>
      <div class="row-tag row-tag--count">${slotText}</div>
    `);
    slotRow.addEventListener('click', () => {
      const raw = window.prompt('Board Number (unique):', slotText === '-' ? '' : slotText);
      if (raw == null) return;
      const cleaned = String(raw).trim();
      const next = cleaned === '' ? null : toIntOrNull(cleaned);
      if (cleaned !== '' && next == null) {
        state.errorMsg = 'Invalid board number.';
        render();
        return;
      }
      if (next != null && used.has(next)) {
        state.errorMsg = `Board number ${next} is already used.`;
        render();
        return;
      }
      draft.boardNumber = next;
      state.errorMsg = '';
      saveSession();
      render();
    });
    col.appendChild(slotRow);

    // Feed fields
    col.appendChild(mk('div', 'list-group-label', 'Feed'));

    const feedRow = mk('div', 'row row--tap', `
      <div><div class="row-title">Feed Display</div></div>
      <div class="row-tag row-tag--count">${draft.feed_display ? 'SET' : '—'}</div>
    `);
    feedRow.addEventListener('click', () => {
      const next = window.prompt('Feed Display:', draft.feed_display || '');
      if (next == null) return;
      draft.feed_display = String(next).trim();
      state.errorMsg = '';
      saveSession();
      render();
    });
    col.appendChild(feedRow);

    col.appendChild(mk('div', 'list-group-label', 'Supplements'));

    function toggleRow(key, label) {
      const on = Boolean(draft[key]);
      const row = mk('div', `row row--tap${on ? ' row--active' : ''}`, `
        <div><div class="row-title">${label}</div></div>
        <div class="row-tag row-tag--boolean${on ? ' row-tag--positive' : ''}"></div>
      `);
      row.addEventListener('click', () => {
        draft[key] = !on;
        state.errorMsg = '';
        saveSession();
        render();
      });
      return row;
    }

    col.appendChild(toggleRow('EEMix', 'EEMix'));
    col.appendChild(toggleRow('Positude', 'Positude'));
    col.appendChild(toggleRow('OM3GA', 'OM3GA'));

    col.appendChild(mk('div', 'list-group-label', 'Note'));

    const ta = mk('textarea', 'state-search-input');
    ta.value = draft.horse_feed_note || '';
    ta.rows = 6;
    ta.style.minHeight = '140px';
    ta.style.resize = 'vertical';
    ta.addEventListener('input', () => {
      draft.horse_feed_note = ta.value;
      saveSession();
    });
    col.appendChild(ta);

    // show current base snapshot for reference
    const ref = mk('div', 'row', `
      <div style="display:flex;flex-direction:column;gap:6px;width:100%">
        <div class="row-title" style="white-space:normal;overflow:visible;text-overflow:clip">Current on-board:</div>
        <div style="white-space:normal;overflow:visible;text-overflow:clip;font-size:12px;color:#d1d5db;opacity:.9">
          Slot: ${base.boardNumber == null ? '-' : base.boardNumber} • Feed: ${safeText(base.feed_display || '—')} • EE: ${base.EEMix ? 'Y' : 'N'} • POS: ${base.Positude ? 'Y' : 'N'} • OM: ${base.OM3GA ? 'Y' : 'N'}
        </div>
      </div>
    `);
    col.appendChild(ref);

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function renderSummary() {
    state.headerBack = null;
    state.headerAction = null;

    setHeader({ title: 'Summary', backVisible: false, actionVisible: false });

    clearRoot();
    const col = mk('div', 'list-column');

    const selected = sortByBoardThenName(state.rows.filter((h) => state.session.selected[h.horse_id]));

    if (!selected.length) {
      col.appendChild(mk('div', 'row', `
        <div style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div class="row-title" style="white-space:normal;overflow:visible;text-overflow:clip">No horses selected.</div>
        </div>
      `));
      elRoot.appendChild(col);
      return;
    }

    selected.forEach((h) => {
      const slot = h.boardNumber == null ? '-' : String(h.boardNumber);
      const hasNote = Boolean(h.horse_feed_note && String(h.horse_feed_note).trim());
      const isExpanded = Boolean(state.session.expanded[h.horse_id]);

      const tags = mk('div');
      tags.style.display = 'flex';
      tags.style.gap = '6px';
      tags.style.alignItems = 'center';

      const chipSlot = mk('span', 'row-tag row-tag--count');
      chipSlot.textContent = slot;
      tags.appendChild(chipSlot);

      if (h.feed_display) {
        const chip = mk('span', 'row-tag row-tag--count');
        chip.textContent = h.feed_display.length > 10 ? 'FEED' : h.feed_display;
        tags.appendChild(chip);
      }

      if (h.EEMix) { const c = mk('span', 'row-tag row-tag--count'); c.textContent = 'EE'; tags.appendChild(c); }
      if (h.Positude) { const c = mk('span', 'row-tag row-tag--count'); c.textContent = 'POS'; tags.appendChild(c); }
      if (h.OM3GA) { const c = mk('span', 'row-tag row-tag--count'); c.textContent = 'OM'; tags.appendChild(c); }

      if (hasNote) {
        const noteChip = mk('span', 'row-tag row-tag--count');
        noteChip.textContent = 'NOTE';
        noteChip.style.cursor = 'pointer';
        noteChip.addEventListener('click', (e) => {
          e.stopPropagation();
          state.session.expanded[h.horse_id] = !isExpanded;
          saveSession();
          render();
        });
        tags.appendChild(noteChip);
      }

      const row = mk('div', 'row', '');
      const left = mk('div', '');
      left.innerHTML = `<div class="row-title">${safeText(h.horseName)}</div>`;
      row.appendChild(left);
      row.appendChild(tags);
      col.appendChild(row);

      if (hasNote && isExpanded) {
        const noteRow = mk('div', 'row', `
          <div style="display:flex;flex-direction:column;gap:6px;width:100%">
            <div class="row-title" style="white-space:normal;overflow:visible;text-overflow:clip">${safeText(h.horse_feed_note)}</div>
          </div>
        `);
        col.appendChild(noteRow);
      }
    });

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function renderText() {
    state.headerBack = null;
    state.headerAction = null;

    setHeader({ title: 'Text', backVisible: false, actionVisible: false });

    clearRoot();
    const col = mk('div', 'list-column');

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
      window.location.href = `sms:?&body=${body}`;
    });
    col.appendChild(smsRow);

    renderErrorIfAny(col);

    elRoot.appendChild(col);
  }

  function goto(screenKey) {
    state.screen = screenKey;
    updateNavAgg();
    render();
  }

  function render() {
    // reset header handlers; each screen sets what it needs
    state.headerBack = null;
    state.headerAction = null;

    if (state.screen === 'start') return renderStart();
    if (state.screen === 'state') return renderActiveHorses();
    if (state.screen === 'list1') return renderFeedList();
    if (state.screen === 'detail') return renderDetail();
    if (state.screen === 'summary') return renderSummary();
    if (state.screen === 'list8') return renderText();

    // safe default
    state.screen = 'state';
    return renderActiveHorses();
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  async function boot() {
    state.board = qs('board') || DEFAULT_BOARD;
    state.dataDir = qs('data_dir') || DEFAULT_DATA_DIR;

    initNavLabelsAndVisibility();
    bindNav();
    bindHeader();

    state.errorMsg = '';
    await loadBoard();
    loadSession();

    updateNavAgg();

    // Start screen first, but highlight based on whether there are selections
    if (selectedHorseIds().length) setActiveNavBtn('list1');
    else setActiveNavBtn('start');

    goto('start');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
