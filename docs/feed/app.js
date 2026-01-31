// docs/feed/app.js
(function () {
  'use strict';

  // ---------------------------
  // CONFIG
  // ---------------------------

  const DEFAULT_BOARD_ID = 'feedboard_test';
  const DATA_DIR = './data/latest/';      // docs/feed/data/latest/
  const REFRESH_MS = 60 * 1000;          // 1 minute
  const FETCH_TIMEOUT_MS = 10 * 1000;

  // ---------------------------
  // DOM
  // ---------------------------

  const elTitle = document.getElementById('pageTitle');
  const elMeta = document.getElementById('pageMeta');
  const elCards = document.getElementById('cards');

  const elBoardInput = document.getElementById('boardInput');
  const elBtnLoad = document.getElementById('btnLoad');
  const elBtnRefresh = document.getElementById('btnRefresh');

  const elDot = document.getElementById('dot');
  const elStatusText = document.getElementById('statusText');

  // ---------------------------
  // STATE
  // ---------------------------

  const state = {
    boardId: DEFAULT_BOARD_ID,
    timer: null,
    lastOkAt: null,
    lastErr: null,
    data: null
  };

  // ---------------------------
  // HELPERS
  // ---------------------------

  function qs(name) {
    const u = new URL(window.location.href);
    const v = u.searchParams.get(name);
    return v && String(v).trim() ? String(v).trim() : '';
  }

  function setStatus(kind, text) {
    elDot.classList.remove('ok', 'bad');
    if (kind === 'ok') elDot.classList.add('ok');
    if (kind === 'bad') elDot.classList.add('bad');
    elStatusText.innerHTML = `<b>${escapeHtml(text)}</b>`;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function fmtTs(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function dataUrl(boardId) {
    // boardId => docs/feed/data/latest/<boardId>.json
    return `${DATA_DIR}${encodeURIComponent(boardId)}.json`;
  }

  function persistCache(boardId, data) {
    try {
      localStorage.setItem(`crt_feed_cache_${boardId}`, JSON.stringify({
        saved_at: new Date().toISOString(),
        data
      }));
    } catch { /* ignore */ }
  }

  function readCache(boardId) {
    try {
      const raw = localStorage.getItem(`crt_feed_cache_${boardId}`);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj && obj.data ? obj.data : null;
    } catch {
      return null;
    }
  }

  async function fetchJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      const text = await r.text();
      if (!r.ok) {
        const msg = text && text.length < 500 ? text : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      if (!text) throw new Error('empty_body');
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`invalid_json: ${e.message}`);
      }
    } finally {
      clearTimeout(t);
    }
  }

  function normalizeBoard(obj) {
    // Expected shape:
    // {
    //   board_id, generated_at, title,
    //   cards: [{ card_id, type, title, body, ts, ... }]
    // }
    if (!obj || typeof obj !== 'object') return null;

    const board_id = String(obj.board_id || '').trim() || null;
    const generated_at = obj.generated_at || obj.generatedAt || null;
    const title = String(obj.title || '').trim() || (board_id ? board_id : 'FeedBoard');
    const cardsRaw = Array.isArray(obj.cards) ? obj.cards : [];

    const cards = cardsRaw
      .filter(Boolean)
      .map((c, idx) => ({
        card_id: c.card_id || c.id || `card_${idx + 1}`,
        type: String(c.type || 'note'),
        title: String(c.title || c.subject || c.card_id || `Card ${idx + 1}`),
        body: c.body != null ? String(c.body) : (c.text != null ? String(c.text) : ''),
        ts: c.ts || c.time || c.created_at || null,
        _raw: c
      }));

    return { board_id, generated_at, title, cards, _raw: obj };
  }

  function render(board) {
    const b = board || { title: 'CRT Feed', cards: [] };

    const title = b.title || 'CRT Feed';
    elTitle.textContent = title;

    const parts = [];
    if (b.board_id) parts.push(`board: ${b.board_id}`);
    if (b.generated_at) parts.push(`generated: ${fmtTs(b.generated_at)}`);
    if (state.lastOkAt) parts.push(`last ok: ${fmtTs(state.lastOkAt)}`);
    elMeta.textContent = parts.length ? parts.join(' • ') : '—';

    const cards = Array.isArray(b.cards) ? b.cards : [];

    if (!cards.length) {
      elCards.innerHTML = `<div class="empty">No cards.</div>`;
      return;
    }

    // newest-first if ts present
    cards.sort((a, b) => {
      const at = a.ts ? new Date(a.ts).getTime() : 0;
      const bt = b.ts ? new Date(b.ts).getTime() : 0;
      return bt - at;
    });

    elCards.innerHTML = cards.map((c) => {
      const t = escapeHtml(c.title || '');
      const ty = escapeHtml(c.type || 'note');
      const ts = c.ts ? escapeHtml(fmtTs(c.ts)) : '';
      const body = escapeHtml(c.body || '');

      return `
        <div class="card" data-card-id="${escapeHtml(c.card_id)}">
          <div class="cardTop">
            <div style="min-width:0">
              <div class="cardTitle">${t}</div>
            </div>
            <div class="cardMeta">
              <span class="tag">${ty}</span>
              ${ts ? `<span class="ts mono">${ts}</span>` : ``}
            </div>
          </div>
          ${body ? `<div class="body">${body}</div>` : ``}
        </div>
      `;
    }).join('');
  }

  function renderError(msg, hint) {
    const m = escapeHtml(msg || 'error');
    const h = hint ? `<div class="body mono" style="margin-top:10px">${escapeHtml(hint)}</div>` : '';
    elCards.innerHTML = `<div class="error"><div class="mono">${m}</div>${h}</div>`;
  }

  async function loadBoard(boardId, opts) {
    const board = String(boardId || '').trim() || DEFAULT_BOARD_ID;
    state.boardId = board;
    elBoardInput.value = board;

    const url = dataUrl(board);

    setStatus('idle', 'loading');
    state.lastErr = null;

    try {
      const raw = await fetchJson(url);
      const normalized = normalizeBoard(raw);
      if (!normalized) throw new Error('unexpected_shape');

      // if file doesn't include board_id, inject from request
      if (!normalized.board_id) normalized.board_id = board;

      state.data = normalized;
      state.lastOkAt = new Date().toISOString();
      persistCache(board, normalized);

      setStatus('ok', 'ok');
      render(normalized);

      if (opts && opts.updateUrl) {
        const u = new URL(window.location.href);
        u.searchParams.set('board', board);
        history.replaceState({}, '', u.toString());
      }
    } catch (e) {
      state.lastErr = e && e.message ? e.message : String(e);

      // fallback to cache
      const cached = readCache(board);
      if (cached) {
        setStatus('bad', 'error (cached)');
        render(cached);
        renderError(
          `Fetch failed; showing cached board.`,
          `board=${board}\nurl=${url}\nerror=${state.lastErr}`
        );
      } else {
        setStatus('bad', 'error');
        renderError(
          `Fetch failed.`,
          `board=${board}\nurl=${url}\nerror=${state.lastErr}`
        );
      }
    }
  }

  function startAutoRefresh() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => {
      loadBoard(state.boardId, { updateUrl: false });
    }, REFRESH_MS);
  }

  // ---------------------------
  // EVENTS
  // ---------------------------

  elBtnLoad.addEventListener('click', () => {
    const b = String(elBoardInput.value || '').trim();
    loadBoard(b || DEFAULT_BOARD_ID, { updateUrl: true });
  });

  elBtnRefresh.addEventListener('click', () => {
    loadBoard(state.boardId, { updateUrl: false });
  });

  elBoardInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      elBtnLoad.click();
    }
  });

  // ---------------------------
  // INIT
  // ---------------------------

  (function init() {
    const fromQs = qs('board');
    const board = fromQs || DEFAULT_BOARD_ID;

    elBoardInput.value = board;
    setStatus('idle', 'idle');

    loadBoard(board, { updateUrl: true });
    startAutoRefresh();
  })();

})();
