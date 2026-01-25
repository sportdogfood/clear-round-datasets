// app.js — Daily Horse Show App (FINAL)
// In-memory only • delete + add new refresh • trip-truth model

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  const DATA_URL = './data/entries.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // ---------------------------------------------------------------------------
  // STATE (in-memory only)
  // ---------------------------------------------------------------------------

  const state = {
    trips: [],
    activeBarnNames: new Set(),
    currentScreen: 'horses',
    history: [],
    detailKey: null // rider | class | ring identifier
  };

  // ---------------------------------------------------------------------------
  // DOM (assumed existing)
  // ---------------------------------------------------------------------------

  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const navRow = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // LOAD + REFRESH
  // ---------------------------------------------------------------------------

  async function loadTrips() {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) return;

      const data = await res.json();
      state.trips = Array.isArray(data) ? data : [];

      render();
    } catch (_) {}
  }

  setInterval(loadTrips, REFRESH_MS);

  // ---------------------------------------------------------------------------
  // DERIVED HELPERS
  // ---------------------------------------------------------------------------

  const isActiveTrip = (t) => state.activeBarnNames.has(t.barnName);

  const unique = (key) =>
    [...new Map(state.trips.map(t => [t[key], t])).values()];

  const horses = () =>
    unique('barnName')
      .map(t => t.barnName)
      .sort((a, b) => a.localeCompare(b));

  const riders = () =>
    unique('teamName')
      .map(t => t.teamName)
      .sort((a, b) => a.localeCompare(b));

  const rings = () =>
    unique('ring_number')
      .sort((a, b) => a.ring_number - b.ring_number);

  const classes = () =>
    unique('class_id')
      .sort((a, b) => {
        if (a.latest_estimated_start_time_display < b.latest_estimated_start_time_display) return -1;
        if (a.latest_estimated_start_time_display > b.latest_estimated_start_time_display) return 1;
        return a.class_number - b.class_number;
      });

  // ---------------------------------------------------------------------------
  // NAV
  // ---------------------------------------------------------------------------

  function setScreen(screen, detail = null, push = true) {
    if (push && state.currentScreen !== screen) {
      state.history.push(state.currentScreen);
    }
    state.currentScreen = screen;
    state.detailKey = detail;
    render();
  }

  function goBack() {
    state.currentScreen = state.history.pop() || 'horses';
    state.detailKey = null;
    render();
  }

  // ---------------------------------------------------------------------------
  // ROW BUILDER (unchanged UX)
  // ---------------------------------------------------------------------------

  function row(label, tag, onClick, active) {
    const r = document.createElement('div');
    r.className = 'row row--tap';
    if (active) r.classList.add('row--active');

    const t = document.createElement('div');
    t.className = 'row-title';
    t.textContent = label;
    r.appendChild(t);

    if (tag != null) {
      const g = document.createElement('div');
      g.className = 'row-tag row-tag--count';
      g.textContent = tag;
      r.appendChild(g);
    }

    if (onClick) r.addEventListener('click', onClick);
    screenRoot.appendChild(r);
  }

  // ---------------------------------------------------------------------------
  // SCREENS
  // ---------------------------------------------------------------------------

  function renderHorses() {
    screenRoot.innerHTML = '';
    horses().forEach(name => {
      const trips = state.trips.filter(t => t.barnName === name);
      const active = state.activeBarnNames.has(name);

      row(name, trips.length, () => {
        active
          ? state.activeBarnNames.delete(name)
          : state.activeBarnNames.add(name);
        render();
      }, active);
    });
  }

  function renderRiders() {
    screenRoot.innerHTML = '';
    riders().forEach(name => {
      const trips = state.trips.filter(t =>
        t.teamName === name && isActiveTrip(t)
      );
      row(name, trips.length, () => setScreen('riderDetail', name));
    });
  }

  function renderRiderDetail() {
    screenRoot.innerHTML = '';
    state.trips
      .filter(t => t.teamName === state.detailKey && isActiveTrip(t))
      .sort((a, b) => a.calc_seconds - b.calc_seconds)
      .forEach(t => {
        row(
          `${t.class_name} • ${t.ringName}`,
          t.latest_estimated_go_time_display
        );
      });
  }

  function renderClasses() {
    screenRoot.innerHTML = '';
    classes().forEach(c => {
      const trips = state.trips.filter(
        t => t.class_id === c.class_id && isActiveTrip(t)
      );
      row(c.class_name, trips.length, () =>
        setScreen('classDetail', c.class_id)
      );
    });
  }

  function renderClassDetail() {
    screenRoot.innerHTML = '';
    state.trips
      .filter(t => t.class_id === state.detailKey)
      .sort((a, b) => a.latest_oog_display - b.latest_oog_display)
      .forEach(t => {
        row(
          `${t.barnName} • ${t.teamName}`,
          t.latest_estimated_go_time_display
        );
      });
  }

  function renderRings() {
    screenRoot.innerHTML = '';
    rings().forEach(r => {
      const trips = state.trips.filter(
        t => t.ring_number === r.ring_number && isActiveTrip(t)
      );
      row(r.ringName, trips.length, () =>
        setScreen('ringDetail', r.ring_number)
      );
    });
  }

  function renderRingDetail() {
    screenRoot.innerHTML = '';
    state.trips
      .filter(t => t.ring_number === state.detailKey && isActiveTrip(t))
      .sort((a, b) => a.calc_seconds - b.calc_seconds)
      .forEach(t => {
        row(
          `${t.class_name} • ${t.barnName}`,
          t.latest_estimated_go_time_display
        );
      });
  }

  function renderSummary() {
    screenRoot.innerHTML = '';
    state.trips
      .filter(isActiveTrip)
      .sort((a, b) => {
        if (a.ring_number !== b.ring_number) return a.ring_number - b.ring_number;
        if (a.latest_estimated_start_time_display !== b.latest_estimated_start_time_display) {
          return a.latest_estimated_start_time_display.localeCompare(b.latest_estimated_start_time_display);
        }
        if (a.class_number !== b.class_number) return a.class_number - b.class_number;
        return a.latest_oog_display - b.latest_oog_display;
      })
      .forEach(t => {
        row(
          `${t.ringName} • ${t.class_name} • ${t.barnName}`,
          t.latest_estimated_go_time_display
        );
      });
  }

  // ---------------------------------------------------------------------------
  // RENDER DISPATCH
  // ---------------------------------------------------------------------------

  function render() {
    headerTitle.textContent = state.currentScreen;

    if (state.currentScreen === 'horses') return renderHorses();
    if (state.currentScreen === 'riders') return renderRiders();
    if (state.currentScreen === 'riderDetail') return renderRiderDetail();
    if (state.currentScreen === 'classes') return renderClasses();
    if (state.currentScreen === 'classDetail') return renderClassDetail();
    if (state.currentScreen === 'rings') return renderRings();
    if (state.currentScreen === 'ringDetail') return renderRingDetail();
    if (state.currentScreen === 'summary') return renderSummary();
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', e => {
      const btn = e.target.closest('[data-screen]');
      if (btn) setScreen(btn.dataset.screen, null, false);
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------

  loadTrips();
})();
