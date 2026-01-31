// app.js — FeedBoard UI on TackLists shell (no deps)
// Data: ./data/latest/{board}.json
// Default board: feedboard_test (=> ./data/latest/feedboard_test.json)

(function () {
  'use strict';

  // -----------------------------
  // CONFIG
  // -----------------------------
  const DEFAULT_BOARD = 'feedboard_test'; // without .json
  const DATA_BASE = './data/latest/';
  const REFRESH_MS = 60 * 1000;

  // Map existing nav screens to card type filters (list1..list8)
  const TYPE_FILTER_BY_SCREEN = {
    list1: 'note',
    list2: 'task',
    list3: 'alert',
    list4: 'event',
    list5: 'link',
    list6: 'image',
    list7: 'status',
    list8: 'other'
  };

  // -----------------------------
  // DOM
  // -----------------------------
  const $root = document.getElementById('screen-root');
  const $title = document.getElementById('header-title');
  const $back = document.getElementById('header-back');
  const $action = document.getElementById('header-action');
  const $navRow = document.getElementById('nav-row');

  // -----------------------------
  // STATE
  // -----------------------------
  const state = {
    screen: 'start',
    history: [],
    boardParam: null,
    dataUrl: null,

    board_id: null,
    title: null,
    generated_at: null,
    cards: [],

    lastLoadedAt: null,
    loadError: null,

    // detail
    activeCard: null
  };

  // -----------------------------
  // INIT
  // -----------------------------
  function init() {
    state.boardParam = getBoardParam();
    state.dataUrl = buildDataUrl(state.boardParam);

    bindUI();
    loadBoard({ silent: true }).then(() => {
      updateNavAggs();
      render();
      startAutoRefresh();
    }).catch(() => {
      updateNavAggs();
      render();
      startAutoRefresh();
    });
  }

  function bindUI() {
    // bottom nav
    $navRow.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button[data-screen]') : null;
      if (!btn) return;
      const screen = btn.getAttribute('data-screen');
      goto(screen);
    });

    // header back
    $back.addEventListener('click', () => {
      goBack();
    });

    // header action
    $action.addEventListener('click', async () => {
      const label = ($action.textContent || '').trim().toLowerCase();
      if (label === 'refresh') {
        await loadBoard({ silent: false });
        updateNavAggs();
        render();
        return;
      }
      if (label === 'copy' && state.activeCard && state.activeCard.body) {
        try {
          await navigator.clipboard.writeText(String(state.activeCard.body));
          // tiny feedback without changing styling: just swap text briefly
          const prev = $action.textContent;
          $action.textContent = 'Copied';
          setTimeout(() => { $action.textContent = prev; }, 750);
        } catch (_) {
          // ignore
        }
        return;
      }
    });
  }

  function startAutoRefresh() {
    setInterval(async () => {
      // do not auto-refresh when user is on a detail screen (avoid jumpiness)
      if (state.screen === 'detail') return;
      await loadBoard({ silent: true });
      updateNavAggs();
      // only rerender list-like screens
      if (state.screen !== 'start') render();
    }, REFRESH_MS);
  }

  // -----------------------------
  // DATA
  // -----------------------------
  function getBoardParam() {
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('board') || sp.get('board_id') || null;
    } catch (_) {
      return null;
    }
  }

  function buildDataUrl(boardParam) {
    let b = (boardParam || DEFAULT_BOARD).trim();
    if (!b) b = DEFAULT_BOARD;
    if (!/\.json$/i.test(b)) b = b + '.json';
    return DATA_BASE + b;
  }

  async function loadBoard(opts) {
    state.loadError = null;

    const cacheBust = (Date.now()).toString(36);
    const url = state.dataUrl + (state.dataUrl.includes('?') ? '&' : '?') + 'v=' + cacheBust;

    try {
      const r = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();

      state.board_id = json.board_id || json.boardId || null;
      state.title = json.title || 'FeedBoard';
      state.generated_at = json.generated_at || json.generatedAt || null;

      const cards = Array.isArray(json.cards) ? json.cards : [];
      state.cards = normalizeCards(cards);

      state.lastLoadedAt = new Date().toISOString();
      if (!opts || !opts.silent) {
        // no-op (kept for future)
      }
    } catch (e) {
      state.loadError = String(e && e.message ? e.message : e);
      // keep existing data if any
    }
  }

  function normalizeCards(cards) {
    const out = [];
    for (const c of cards) {
      if (!c) continue;
      const card = {
        card_id: c.card_id || c.id || null,
        type: normalizeType(c.type),
        title: String(c.title || c.name || '(untitled)'),
        body: c.body == null ? '' : String(c.body),
        ts: c.ts || c.timestamp || c.created_at || null
      };
      out.push(card);
    }
    out.sort((a, b) => safeTime(b.ts) - safeTime(a.ts));
    return out;
  }

  function normalizeType(t) {
    const s = String(t || '').toLowerCase().trim();
    if (!s) return 'other';
    if (s === 'note' || s === 'notes') return 'note';
    if (s === 'task' || s === 'todo' || s === 'to-do') return 'task';
    if (s === 'alert' || s === 'warning') return 'alert';
    if (s === 'event') return 'event';
    if (s === 'link' || s === 'url') return 'link';
    if (s === 'image' || s === 'photo') return 'image';
    if (s === 'status') return 'status';
    return 'other';
  }

  function safeTime(ts) {
    if (!ts) return 0;
    const d = new Date(ts);
    const n = d.getTime();
    return Number.isFinite(n) ? n : 0;
  }

  // -----------------------------
  // NAV + ROUTING
  // -----------------------------
  function goto(screen) {
    if (!screen) return;

    // if user taps the current primary section, just render
    if (state.screen === screen) {
      render();
      return;
    }

    // push history (except when going to start)
    state.history.push({
      screen: state.screen,
      activeCard: state.activeCard
    });

    state.screen = screen;
    state.activeCard = null;

    render();
  }

  function goBack() {
    const last = state.history.pop();
    if (!last) {
      // default back target
      state.screen = 'start';
      state.activeCard = null;
      render();
      return;
    }
    state.screen = last.screen || 'start';
    state.activeCard = last.activeCard || null;
    render();
  }

  // -----------------------------
  // RENDER HELPERS
  // -----------------------------
  function clearRoot() {
    while ($root.firstChild) $root.removeChild($root.firstChild);
  }

  function setHeader(title, opts) {
    $title.textContent = title || '';

    const canBack = !!(opts && opts.canBack);
    $back.hidden = !canBack;

    if (opts && opts.actionLabel) {
      $action.textContent = opts.actionLabel;
      $action.hidden = false;
    } else {
      $action.textContent = '';
      $action.hidden = true;
    }
  }

  function setNavActive(screen) {
    const btns = $navRow.querySelectorAll('button[data-screen]');
    btns.forEach((b) => {
      const s = b.getAttribute('data-screen');
      if (s === screen) b.classList.add('nav-btn--primary');
      else b.classList.remove('nav-btn--primary');
    });
  }

  function addGroupLabel(text) {
    const div = document.createElement('div');
    div.className = 'list-group-label';
    div.textContent = text;
    $root.appendChild(div);
  }

  function addDivider() {
    const div = document.createElement('div');
    div.className = 'list-group-divider';
    $root.appendChild(div);
  }

  function addRow(opts) {
    const row = document.createElement('div');
    row.className = 'row';

    if (opts && opts.tap) row.classList.add('row--tap');
    if (opts && opts.active) row.classList.add('row--active');

    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = opts && opts.title ? opts.title : '';

    const tag = document.createElement('div');
    tag.className = 'row-tag';
    tag.textContent = opts && opts.tag != null ? String(opts.tag) : '';

    if (opts && opts.tagPositive) tag.classList.add('row-tag--positive');
    if (opts && opts.tagIsCount) tag.classList.add('row-tag--count');

    row.appendChild(title);
    row.appendChild(tag);

    if (opts && opts.tap && typeof opts.onClick === 'function') {
      row.addEventListener('click', opts.onClick);
    }

    $root.appendChild(row);
  }

  function addStartLogo() {
    const wrap = document.createElement('div');
    wrap.className = 'start-logo';

    const title = document.createElement('div');
    title.className = 'start-logo-title';
    title.textContent = state.title || 'FeedBoard';

    const sub = document.createElement('div');
    sub.className = 'start-logo-subtitle';
    sub.textContent = buildStartSubtitle();

    wrap.appendChild(title);
    wrap.appendChild(sub);
    $root.appendChild(wrap);
  }

  function buildStartSubtitle() {
    const parts = [];
    const boardFile = (state.dataUrl || '').split('/').pop() || '';
    if (boardFile) parts.push(boardFile);
    if (state.generated_at) parts.push('generated ' + fmtDateTime(state.generated_at));
    if (state.loadError) parts.push('load error: ' + state.loadError);
    return parts.join(' • ');
  }

  function fmtDateKey(ts) {
    if (!ts) return 'Unknown date';
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return 'Unknown date';
    // YYYY-MM-DD in local time
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // -----------------------------
  // SCREEN RENDERERS
  // -----------------------------
  function render() {
    setNavActive(state.screen);

    if (state.screen === 'detail' && state.activeCard) {
      renderDetail(state.activeCard);
      return;
    }

    if (state.screen === 'start') {
      renderStart();
      return;
    }

    if (state.screen === 'summary') {
      renderSummary();
      return;
    }

    // list screens
    if (state.screen === 'state') {
      renderFeedList({ title: 'Feed', cards: state.cards, canBack: true, actionLabel: 'Refresh' });
      return;
    }

    if (/^list[1-8]$/.test(state.screen)) {
      const type = TYPE_FILTER_BY_SCREEN[state.screen] || 'other';
      const filtered = state.cards.filter(c => c.type === type);
      renderFeedList({ title: type.toUpperCase(), cards: filtered, canBack: true, actionLabel: 'Refresh' });
      return;
    }

    // fallback
    renderStart();
  }

  function renderStart() {
    clearRoot();
    setHeader('Start', { canBack: false, actionLabel: 'Refresh' });

    addStartLogo();

    addRow({
      title: 'Open Feed',
      tag: String(state.cards.length),
      tagIsCount: true,
      tap: true,
      onClick: () => goto('state')
    });

    addRow({
      title: 'Board file',
      tag: (state.dataUrl || '').split('/').pop() || '',
      tap: false
    });

    addRow({
      title: 'Generated',
      tag: state.generated_at ? fmtDateTime(state.generated_at) : '—',
      tap: false
    });

    addRow({
      title: 'Last loaded',
      tag: state.lastLoadedAt ? fmtDateTime(state.lastLoadedAt) : '—',
      tap: false
    });

    if (state.loadError) {
      addDivider();
      addRow({
        title: 'Load error',
        tag: '!',
        tagPositive: false,
        tap: false
      });
      addRow({
        title: state.loadError,
        tag: '',
        tap: false
      });
    }
  }

  function renderFeedList(opts) {
    clearRoot();
    setHeader(opts.title || 'Feed', { canBack: true, actionLabel: 'Refresh' });

    const cards = Array.isArray(opts.cards) ? opts.cards : [];
    if (!cards.length) {
      addRow({ title: 'No cards', tag: '0', tap: false });
      return;
    }

    // group by date key
    let lastKey = null;
    for (const c of cards) {
      const key = fmtDateKey(c.ts);
      if (key !== lastKey) {
        if (lastKey !== null) addDivider();
        addGroupLabel(key);
        lastKey = key;
      }

      const time = fmtTime(c.ts);
      const left = (time ? (time + '  ') : '') + c.title;

      addRow({
        title: left,
        tag: c.type,
        tap: true,
        onClick: () => openCard(c)
      });
    }
  }

  function openCard(card) {
    state.history.push({
      screen: state.screen,
      activeCard: null
    });
    state.screen = 'detail';
    state.activeCard = card;
    render();
  }

  function renderDetail(card) {
    clearRoot();
    setHeader(card.title || 'Card', { canBack: true, actionLabel: (card.body ? 'Copy' : null) });

    addRow({ title: 'Type', tag: card.type || '—', tap: false });
    addRow({ title: 'Time', tag: card.ts ? fmtDateTime(card.ts) : '—', tap: false });

    addDivider();

    // body as multi-line: use multiple rows to keep the same pill style
    const body = String(card.body || '').trim();
    if (!body) {
      addRow({ title: '(no body)', tag: '', tap: false });
      return;
    }

    const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) {
      addRow({ title: '(no body)', tag: '', tap: false });
      return;
    }

    addGroupLabel('Body');
    for (const line of lines.slice(0, 40)) {
      addRow({ title: line, tag: '', tap: false });
    }
    if (lines.length > 40) {
      addRow({ title: '…', tag: String(lines.length - 40), tap: false });
    }
  }

  function renderSummary() {
    clearRoot();
    setHeader('Summary', { canBack: true, actionLabel: 'Refresh' });

    const total = state.cards.length;
    const byType = countByType(state.cards);

    addRow({ title: 'Total cards', tag: String(total), tagIsCount: true, tap: false });

    addRow({ title: 'Generated', tag: state.generated_at ? fmtDateTime(state.generated_at) : '—', tap: false });
    addRow({ title: 'Board', tag: state.board_id || state.boardParam || DEFAULT_BOARD, tap: false });

    addDivider();
    addGroupLabel('By type');

    const keys = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
    if (!keys.length) {
      addRow({ title: '—', tag: '0', tap: false });
      return;
    }

    for (const k of keys) {
      addRow({ title: k, tag: String(byType[k]), tagIsCount: true, tap: true, onClick: () => goto(screenForType(k)) });
    }
  }

  function countByType(cards) {
    const m = Object.create(null);
    for (const c of cards) {
      const k = c.type || 'other';
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }

  function screenForType(type) {
    // reverse lookup into TYPE_FILTER_BY_SCREEN
    const t = normalizeType(type);
    for (const k of Object.keys(TYPE_FILTER_BY_SCREEN)) {
      if (TYPE_FILTER_BY_SCREEN[k] === t) return k;
    }
    return 'list8';
  }

  // -----------------------------
  // NAV AGGS
  // -----------------------------
  function updateNavAggs() {
    const total = state.cards.length;

    // state = total
    setAgg('state', total);

    // list1..list8 = by type filter
    const byType = countByType(state.cards);
    for (const screen of Object.keys(TYPE_FILTER_BY_SCREEN)) {
      const t = TYPE_FILTER_BY_SCREEN[screen];
      setAgg(screen, byType[t] || 0);
    }

    // summary = total
    setAgg('summary', total);
  }

  function setAgg(key, value) {
    const el = document.querySelector(`[data-nav-agg="${key}"]`);
    if (!el) return;
    const n = Number.isFinite(value) ? value : 0;
    el.textContent = String(n);
    if (n > 0) el.classList.add('nav-agg--positive');
    else el.classList.remove('nav-agg--positive');
  }

  // -----------------------------
  // BOOT
  // -----------------------------
  init();

})();
