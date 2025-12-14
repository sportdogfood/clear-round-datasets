// app.js
// Desktop Session Shell — CRT
// Version: v2025-12-14-01
// Scope: session + screen routing ONLY (no Rows, no report logic)

(function () {
  'use strict';

  // ------------------------------------------------------------
  // DOM contract (LOCKED)
  // ------------------------------------------------------------

  const appRoot = document.getElementById('app');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerPrint = document.getElementById('header-print');
  const renderContainer = document.getElementById('render-container');

  if (!appRoot || !renderContainer) {
    console.error('[CRT] Required DOM elements missing.');
    return;
  }

  // ------------------------------------------------------------
  // Session state (minimal)
  // ------------------------------------------------------------

  const state = {
    sessionId: null,
    createdAt: null,
    screen: 'index', // index | trainer | entries | report
    history: []
  };

  // ------------------------------------------------------------
  // Session helpers
  // ------------------------------------------------------------

  function startSession() {
    state.sessionId = 'sess-' + Date.now();
    state.createdAt = new Date().toISOString();
  }

  function resetSession() {
    state.sessionId = null;
    state.createdAt = null;
    state.history = [];
    setScreen('index', false);
  }

  // ------------------------------------------------------------
  // Screen routing
  // ------------------------------------------------------------

  function setScreen(next, pushHistory = true) {
    if (pushHistory && state.screen !== next) {
      state.history.push(state.screen);
    }
    state.screen = next;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (prev) {
      state.screen = prev;
      render();
    }
  }

  // ------------------------------------------------------------
  // Header control
  // ------------------------------------------------------------

  function updateHeader() {
    headerBack.hidden = state.history.length === 0;
    headerPrint.hidden = state.screen === 'index';

    switch (state.screen) {
      case 'index':
        headerTitle.textContent = 'Session';
        break;
      case 'trainer':
        headerTitle.textContent = 'Trainer';
        break;
      case 'entries':
        headerTitle.textContent = 'Entries';
        break;
      case 'report':
        headerTitle.textContent = 'Report';
        break;
      default:
        headerTitle.textContent = '';
    }
  }

  // ------------------------------------------------------------
  // Render dispatcher (NO report logic)
  // ------------------------------------------------------------

  function render() {
    updateHeader();
    renderContainer.innerHTML = '';

    switch (state.screen) {
      case 'index':
        renderIndex();
        break;
      case 'trainer':
        renderTrainer();
        break;
      case 'entries':
        renderEntries();
        break;
      case 'report':
        renderReportPlaceholder();
        break;
    }
  }

  // ------------------------------------------------------------
  // Screen views (placeholders only)
  // ------------------------------------------------------------

  function renderIndex() {
    renderButton('Trainer', () => setScreen('trainer'));
    renderButton('Entries', () => setScreen('entries'));
    renderButton('Restart Session', resetSession);
  }

  function renderTrainer() {
    renderButton('Trainer Report A', () => setScreen('report'));
    renderButton('Trainer Report B', () => setScreen('report'));
  }

  function renderEntries() {
    renderButton('Entries Report', () => setScreen('report'));
  }

  function renderReportPlaceholder() {
    const el = document.createElement('div');
    el.className = 'report-placeholder';
    el.textContent = 'Report rendered here';
    renderContainer.appendChild(el);
  }

  // ------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------

  function renderButton(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'ui-button';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    renderContainer.appendChild(btn);
  }

  // ------------------------------------------------------------
  // Events
  // ------------------------------------------------------------

  headerBack.addEventListener('click', goBack);
  headerPrint.addEventListener('click', () => window.print());

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------

  startSession();
  render();
})();
