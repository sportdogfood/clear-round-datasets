// app.js
// CRT Desktop App – Trainer / Entries launcher
// Version: v2025-12-14
// Scope: Desktop-only wiring (Trainer end-to-end)

import { deriveTrainerData } from './trainer-derive.js';
import { renderTrainerReport } from './trainer-render.js';

// --------------------------------------------------
// State
// --------------------------------------------------

const state = {
  sessionId: null,
  activeView: 'index', // index | trainer | entries
  lastRefresh: null
};

// --------------------------------------------------
// DOM refs (desktop)
// --------------------------------------------------

const root = document.getElementById('app-root');
const btnTrainer = document.getElementById('btn-trainer');
const btnEntries = document.getElementById('btn-entries');
const btnBack = document.getElementById('btn-back');
const btnPrint = document.getElementById('btn-print');
const btnRefresh = document.getElementById('btn-refresh');
const statusEl = document.getElementById('session-status');

// --------------------------------------------------
// Session helpers
// --------------------------------------------------

function ensureSession() {
  if (!state.sessionId) {
    state.sessionId = 'sess-' + Date.now();
    state.lastRefresh = new Date();
    updateStatus('Session started');
  }
}

function updateStatus(msg) {
  if (!statusEl) return;
  const ts = new Date().toLocaleTimeString();
  statusEl.textContent = `${msg} · ${ts}`;
}

// --------------------------------------------------
// View helpers
// --------------------------------------------------

function setView(view) {
  state.activeView = view;

  document.body.dataset.view = view;

  if (view === 'index') {
    btnBack.hidden = true;
    btnPrint.hidden = true;
    btnRefresh.hidden = true;
  } else {
    btnBack.hidden = false;
    btnPrint.hidden = false;
    btnRefresh.hidden = false;
  }
}

// --------------------------------------------------
// Trainer flow
// --------------------------------------------------

async function runTrainer() {
  ensureSession();
  setView('trainer');
  updateStatus('Loading trainer data');

  try {
    const data = await deriveTrainerData();
    state.lastRefresh = new Date();
    renderTrainerReport(data, root);
    updateStatus('Trainer report ready');
  } catch (err) {
    console.error('[Trainer] error', err);
    updateStatus('Trainer error');
  }
}

// --------------------------------------------------
// Entries flow (stub for now)
// --------------------------------------------------

async function runEntries() {
  ensureSession();
  setView('entries');
  root.innerHTML = '<div class="placeholder">Entries view (pending)</div>';
  updateStatus('Entries placeholder');
}

// --------------------------------------------------
// Controls
// --------------------------------------------------

btnTrainer?.addEventListener('click', runTrainer);
btnEntries?.addEventListener('click', runEntries);

btnBack?.addEventListener('click', () => {
  setView('index');
  root.innerHTML = '';
  updateStatus('Back to index');
});

btnPrint?.addEventListener('click', () => {
  window.print();
});

btnRefresh?.addEventListener('click', () => {
  if (state.activeView === 'trainer') {
    runTrainer();
  }
});

// --------------------------------------------------
// Init
// --------------------------------------------------

function init() {
  setView('index');
  updateStatus('Ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
