// app.js
// HORSE SHOW SCHEDULE APP
// ⚠️ UI / CSS / cadence / DOM: IDENTICAL to TackLists app
// ⚠️ ONLY DATA SOURCE + DERIVATION CHANGED
// ⚠️ In-memory only session (reset on reload)
// ⚠️ Delete + add new on refresh

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DATA SOURCE (schedule payload)
  // ---------------------------------------------------------------------------

  const SCHEDULE_DATA_URL = './data/entries.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // ---------------------------------------------------------------------------
  // App state (UNCHANGED SHAPE)
  // ---------------------------------------------------------------------------

  const state = {
    currentScreen: 'start',
    history: [],
    stateFilter: '',
    trips: [],
    activeBarnNames: new Set()
  };

  // ---------------------------------------------------------------------------
  // DOM refs (UNCHANGED)
  // ---------------------------------------------------------------------------

  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const screenRoot = document.getElementById('screen-root');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // DATA LOAD / REFRESH
  // ---------------------------------------------------------------------------

  async function loadSchedule() {
    try {
      const res = await fetch(SCHEDULE_DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const raw = await res.json();

      // delete + add new
      state.trips = Array.isArray(raw) ? raw : [];

      render();
    } catch (_) {}
  }

  setInterval(loadSchedule, REFRESH_MS);

  // ---------------------------------------------------------------------------
  // DERIVED HELPERS
  // ---------------------------------------------------------------------------

  function uniqueBy(key) {
    const map = new Map();
    state.trips.forEach((t) => {
      const k = t[key];
      if (!map.has(k)) map.set(k, t);
    });
    return [...map.values()];
  }

  function horses() {
    return uniqueBy('barnName')
      .map(t => t.barnName)
      .sort((a, b) => a.localeCompare(b));
  }

  function riders() {
    return uniqueBy('teamName')
      .map(t => t.teamName)
      .sort((a, b) => a.localeCompare(b));
  }

  function rings() {
    return uniqueBy('ring_number')
      .sort((a, b) => a.ring_number - b.ring_number);
  }

  function classes() {
    return uniqueBy('class_id')
      .sort((a, b) => {
        if (a.latest_estimated_start_time_display < b.latest_estimated_start_time_display) return -1;
        if (a.latest_estimated_start_time_display > b.latest_estimated_start_time_display) return 1;
        return a.class_number - b.class_number;
      });
  }

  function isActiveTrip(t) {
    return state.activeBarnNames.has(t.barnName);
  }

  // ---------------------------------------------------------------------------
  // NAV / ROUTING (UNCHANGED BEHAVIOR)
  // ---------------------------------------------------------------------------

  function setScreen(scr, push = true) {
    if (push && state.currentScreen !== scr) {
      state.history.push(state.currentScreen);
    }
    state.currentScreen = scr;
    render();
  }

  function goBack() {
    state.currentScreen = state.history.pop() || 'start';
    render();
  }

  // ---------------------------------------------------------------------------
  // ROW BUILDER (UNCHANGED)
  // ---------------------------------------------------------------------------

  function createRow(label, opts = {}) {
    const row = document.createElement('div');
    row.className = 'row row--tap';
    if (opts.active) row.classList.add('row--active');

    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = label;
    row.appendChild(title);

    if (opts.tagText != null) {
      const tag = document.createElement('div');
      tag.className = 'row-tag row-tag--count';
      tag.textContent = opts.tagText;
      row.appendChild(tag);
    }

    if (opts.onClick) row.addEventListener('click', opts.onClick);

    screenRoot.appendChild(row);
  }

  // ---------------------------------------------------------------------------
  // SCREENS
  // ---------------------------------------------------------------------------

  function renderStart() {
    screenRoot.innerHTML = '';
    createRow('Start', {
      onClick: () => setScreen('horses')
    });
  }

  function renderHorses() {
    screenRoot.innerHTML = '';

    horses().forEach((name) => {
      const active = state.activeBarnNames.has(name);
      const count = state.trips.filter(t => t.barnName === name).length;

      createRow(name, {
        active,
        tagText: count,
        onClick: () => {
          if (active) state.activeBarnNames.delete(name);
          else state.activeBarnNames.add(name);
          render();
        }
      });
    });
  }

  function renderRiders() {
    screenRoot.innerHTML = '';

    riders().forEach((name) => {
      const count = state.trips.filter(
        t => t.teamName === name && isActiveTrip(t)
      ).length;

      createRow(name, {
        tagText: count
      });
    });
  }

  function renderClasses() {
    screenRoot.innerHTML = '';

    classes().forEach((c) => {
      const count = state.trips.filter(
        t => t.class_id === c.class_id && isActiveTrip(t)
      ).length;

      createRow(c.class_name, {
        tagText: count
      });
    });
  }

  function renderRings() {
    screenRoot.innerHTML = '';

    rings().forEach((r) => {
      const count = state.trips.filter(
        t => t.ring_number === r.ring_number && isActiveTrip(t)
      ).length;

      createRow(r.ringName, {
        tagText: count
      });
    });
  }

  function renderSummary() {
    screenRoot.innerHTML = '';

    const rows = state.trips
      .filter(isActiveTrip)
      .sort((a, b) => {
        if (a.ring_number !== b.ring_number) return a.ring_number - b.ring_number;
        if (a.latest_estimated_start_time_display !== b.latest_estimated_start_time_display) {
          return a.latest_estimated_start_time_display.localeCompare(b.latest_estimated_start_time_display);
        }
        if (a.class_number !== b.class_number) return a.class_number - b.class_number;
        return a.latest_oog_display - b.latest_oog_display;
      });

    rows.forEach((t) => {
      createRow(
        `${t.barnName} – ${t.teamName} – ${t.class_name}`,
        { tagText: t.latest_estimated_go_time_display }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // RENDER DISPATCH
  // ---------------------------------------------------------------------------

  function render() {
    headerTitle.textContent = state.currentScreen;

    if (state.currentScreen === 'start') return renderStart();
    if (state.currentScreen === 'horses') return renderHorses();
    if (state.currentScreen === 'riders') return renderRiders();
    if (state.currentScreen === 'classes') return renderClasses();
    if (state.currentScreen === 'rings') return renderRings();
    if (state.currentScreen === 'summary') return renderSummary();

    renderStart();
  }

  // ---------------------------------------------------------------------------
  // EVENTS (UNCHANGED)
  // ---------------------------------------------------------------------------

  headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      setScreen(btn.dataset.screen);
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------

  loadSchedule();
  render();
})();
