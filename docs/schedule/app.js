// app.js — Daily Horse Show App (watch_schedule + watch_trips)
// CSS unchanged • legacy list/card UX • adds rollup ladders + toggles + peak row
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  // Set these to your committed JSON paths.
  // (No guessing: edit here once and keep stable.)
  const SCHEDULE_URL = './data/latest/watch_schedule.json';
  const TRIPS_URL    = './data/latest/watch_trips.json';

  const REFRESH_MS = 8 * 60 * 1000;

  // Business rule: “today” is admin-controlled; default uses schedule meta.dt in payload.
  // You can set this to force a day while testing (e.g. '2026-01-25'), or leave null.
  const ADMIN_DT_OVERRIDE = null;

  // ---------------------------------------------------------------------------
  // STATE (in-memory only)
  // ---------------------------------------------------------------------------

  const state = {
    schedule: [],  // watch_schedule.records
    trips: [],     // watch_trips.records

    // Active horse set is the gating truth. Keys are horseName.
    activeHorses: new Set(),

    // UI navigation
    currentScreen: 'start',
    history: [],
    detailKey: null,    // ring_number | class_id | horseName | riderName
    detailKey2: null,   // optional (e.g. ring_number + group_id)

    // Toggles (reused across templates)
    scopeMode: 'ACTIVE',      // ACTIVE | FULL  (list-level)
    statusMode: 'ACTIVE',     // ACTIVE | COMPLETED (status-level)

    // Peak filters (on-page filter)
    selectedPeak: new Set(),  // depends on screen: ring_number or class_group_id or riderName etc.
  };

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const navRow = document.getElementById('nav-row');
  const navHorses = document.getElementById('nav-horses');

  // ---------------------------------------------------------------------------
  // LOAD + REFRESH
  // ---------------------------------------------------------------------------

  async function loadAll() {
    try {
      const [schedRes, tripsRes] = await Promise.all([
        fetch(SCHEDULE_URL, { cache: 'no-store' }),
        fetch(TRIPS_URL, { cache: 'no-store' })
      ]);
      if (!schedRes.ok || !tripsRes.ok) return;

      const schedJson = await schedRes.json();
      const tripsJson = await tripsRes.json();

      state.schedule = Array.isArray(schedJson?.records) ? schedJson.records : [];
      state.trips = Array.isArray(tripsJson?.records) ? tripsJson.records : [];

      // Initialize active horses ONCE: all horses in trips payload are active by default.
      if (state.activeHorses.size === 0) {
        const all = uniqueBy(state.trips, t => t.horseName || '').map(t => t.horseName).filter(Boolean);
        all.forEach(h => state.activeHorses.add(h));
      }

      render();
    } catch (_) {}
  }

  setInterval(loadAll, REFRESH_MS);

  // ---------------------------------------------------------------------------
  // CORE HELPERS
  // ---------------------------------------------------------------------------

  function dtScope() {
    if (ADMIN_DT_OVERRIDE) return ADMIN_DT_OVERRIDE;
    const any = state.schedule[0] || state.trips[0];
    return any?.dt || null;
  }

  function isCompletedStatus(s) {
    return String(s || '').toLowerCase() === 'completed';
  }

  function tripIsIncludedByStatus(t) {
    if (state.statusMode === 'COMPLETED') return true;
    // ACTIVE mode excludes completed
    return !isCompletedStatus(t.latestStatus);
  }

  function scheduleIsIncludedByStatus(s) {
    if (state.statusMode === 'COMPLETED') return true;
    return !isCompletedStatus(s.latestStatus);
  }

  function isActiveHorse(horseName) {
    return state.activeHorses.has(horseName);
  }

  function tripIsActive(t) {
    // “Active horses is the root truth filter”
    return isActiveHorse(t.horseName) && tripIsIncludedByStatus(t);
  }

  function uniqueBy(arr, keyFn) {
    const m = new Map();
    for (const x of arr) {
      const k = keyFn(x);
      if (!m.has(k)) m.set(k, x);
    }
    return Array.from(m.values());
  }

  function sortByTimeLabel(a, b) {
    // latestStart is display label like "8:05 AM" (no seconds). For now sort lexically as fallback.
    // Primary correctness depends on your upstream ordering; this keeps a consistent deterministic sort.
    const ta = String(a.latestStart || '');
    const tb = String(b.latestStart || '');
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  }

  // ---------------------------------------------------------------------------
  // INDEXES (implemented)
  // ---------------------------------------------------------------------------

  function idxTripsByClassId() {
    const map = new Map();
    for (const t of state.trips) {
      const k = t.class_id;
      if (k == null) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return map;
  }

  function idxScheduleByRing() {
    const map = new Map();
    for (const s of state.schedule) {
      const k = s.ring_number;
      if (k == null) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    // stable order
    for (const [k, arr] of map) {
      arr.sort((a, b) => (a.class_number - b.class_number) || sortByTimeLabel(a, b));
      map.set(k, arr);
    }
    return map;
  }

  function buildRingsOverview() {
    const byRing = idxScheduleByRing();
    const tripsByClass = idxTripsByClassId();

    const rings = [];
    for (const [ring_number, schedRows] of byRing.entries()) {
      const ringName = schedRows[0]?.ringName || `Ring ${ring_number}`;

      // filter schedule rows by status toggle (completed vs active)
      const schedFiltered = schedRows.filter(scheduleIsIncludedByStatus);

      // FULL vs ACTIVE:
      // ACTIVE means ring has at least one active trip under it (via any class_id)
      const ringHasActiveTrips = schedFiltered.some(s => {
        const arr = tripsByClass.get(s.class_id) || [];
        return arr.some(tripIsActive);
      });

      if (state.scopeMode === 'ACTIVE' && !ringHasActiveTrips) continue;

      rings.push({
        ring_number,
        ringName,
        schedRows: schedFiltered
      });
    }

    rings.sort((a, b) => (a.ring_number - b.ring_number));
    return { rings, tripsByClass };
  }

  function buildGroupsWithinRing(ringSchedRows) {
    // group key: ring_number + class_group_id
    const groupsMap = new Map();
    for (const s of ringSchedRows) {
      const gid = s.class_group_id;
      if (gid == null) continue;
      if (!groupsMap.has(gid)) groupsMap.set(gid, []);
      groupsMap.get(gid).push(s);
    }

    const groups = [];
    for (const [gid, rows] of groupsMap.entries()) {
      rows.sort((a, b) => sortByTimeLabel(a, b) || (a.class_number - b.class_number));
      const head = rows[0];
      groups.push({
        class_group_id: gid,
        group_name: head?.group_name || '',
        latestStart: head?.latestStart || '',
        latestStatus: head?.latestStatus || null,
        classes: rows
      });
    }

    // sort groups by their first class time label
    groups.sort((a, b) => sortByTimeLabel(a, b));
    return groups;
  }

  function buildActiveHorsesList() {
    const all = uniqueBy(state.trips, t => t.horseName || '').map(t => t.horseName).filter(Boolean);
    all.sort((a, b) => a.localeCompare(b));
    return all;
  }

  function buildRidersList() {
    // Derived from trips under active horses.
    const riders = new Map(); // riderName -> trips count
    for (const t of state.trips) {
      if (!tripIsActive(t)) continue;
      const r = t.riderName || t.teamName || '';
      if (!r) continue;
      riders.set(r, (riders.get(r) || 0) + 1);
    }
    return Array.from(riders.entries())
      .map(([riderName, count]) => ({ riderName, count }))
      .sort((a, b) => a.riderName.localeCompare(b.riderName));
  }

  function buildClassesList() {
    // Derived from schedule (groups-first, then classes)
    // class list is only classes that exist in schedule payload.
    const rows = state.schedule.filter(scheduleIsIncludedByStatus);

    // build unique classes by class_id
    const classes = uniqueBy(rows, s => s.class_id).filter(s => s.class_id != null);

    const tripsByClass = idxTripsByClassId();

    const out = [];
    for (const c of classes) {
      const trips = (tripsByClass.get(c.class_id) || []).filter(tripIsActive);
      if (state.scopeMode === 'ACTIVE' && trips.length === 0) continue;
      out.push({
        class_id: c.class_id,
        class_name: c.class_name || '',
        class_number: c.class_number || 0,
        ringName: c.ringName || '',
        ring_number: c.ring_number,
        latestStart: c.latestStart || '',
        latestStatus: c.latestStatus || null,
        activeTripCount: trips.length
      });
    }

    // sort by start label then class_number
    out.sort((a, b) => sortByTimeLabel(a, b) || (a.class_number - b.class_number));
    return out;
  }

  // ---------------------------------------------------------------------------
  // UI BUILDERS (no new CSS; reuse existing classes)
  // ---------------------------------------------------------------------------

  function clearScreen() {
    screenRoot.innerHTML = '';
  }

  function row(label, tag, onClick, active, positiveTag) {
    const r = document.createElement('div');
    r.className = 'row row--tap';
    if (active) r.classList.add('row--active');

    const t = document.createElement('div');
    t.className = 'row-title';
    t.textContent = label;
    r.appendChild(t);

    if (tag != null) {
      const g = document.createElement('div');
      g.className = 'row-tag';
      if (positiveTag) g.classList.add('row-tag--positive');
      g.textContent = tag;
      r.appendChild(g);
    }

    if (onClick) r.addEventListener('click', onClick);
    screenRoot.appendChild(r);
  }

  function sectionNavRow(buttons) {
    // Reuse .nav-row and .nav-btn (existing CSS)
    const wrap = document.createElement('div');
    wrap.className = 'nav-row';
    wrap.style.padding = '2px 0 8px 0'; // inline only; no CSS file changes
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'nav-btn' + (b.primary ? ' nav-btn--primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      wrap.appendChild(btn);
    }
    screenRoot.appendChild(wrap);
  }

  // ---------------------------------------------------------------------------
  // NAV
  // ---------------------------------------------------------------------------

  function setScreen(screen, detail = null, detail2 = null, push = true) {
    if (push) state.history.push({ screen: state.currentScreen, detailKey: state.detailKey, detailKey2: state.detailKey2 });
    state.currentScreen = screen;
    state.detailKey = detail;
    state.detailKey2 = detail2;

    // reset peak selection when switching major screens
    state.selectedPeak.clear();
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) {
      state.currentScreen = 'start';
      state.detailKey = null;
      state.detailKey2 = null;
      render();
      return;
    }
    state.currentScreen = prev.screen;
    state.detailKey = prev.detailKey;
    state.detailKey2 = prev.detailKey2;
    render();
  }

  // ---------------------------------------------------------------------------
  // TOGGLES
  // ---------------------------------------------------------------------------

  function renderToggles() {
    sectionNavRow([
      {
        label: state.scopeMode === 'ACTIVE' ? 'ACTIVE (scope)' : 'FULL (scope)',
        primary: true,
        onClick: () => {
          state.scopeMode = (state.scopeMode === 'ACTIVE') ? 'FULL' : 'ACTIVE';
          render();
        }
      },
      {
        label: state.statusMode === 'ACTIVE' ? 'ACTIVE (status)' : 'COMPLETED+ (status)',
        primary: false,
        onClick: () => {
          state.statusMode = (state.statusMode === 'ACTIVE') ? 'COMPLETED' : 'ACTIVE';
          render();
        }
      }
    ]);
  }

  // ---------------------------------------------------------------------------
  // SCREENS
  // ---------------------------------------------------------------------------

  function renderStart() {
    clearScreen();

    const dt = dtScope();
    row(`Day scope`, dt || '—', null, false);

    const activeCount = state.activeHorses.size;
    row('Active Horses', String(activeCount), () => setScreen('horses'), false, activeCount > 0);

    // NextUp logic placeholder: derived from schedule ordering, excludes completed in ACTIVE status mode.
    // (You said “NextUp needs better logic”; this is not time-limited and won’t cap at 3.)
    const next = buildNextUp();
    if (next.length) {
      row('Next Up (classes)', String(next.length), () => setScreen('summary'), false, true);
    } else {
      row('Next Up (classes)', '0', () => setScreen('summary'), false, false);
    }

    renderFooterHint();
  }

  function buildNextUp() {
    // First upcoming schedule rows by start ordering; NOT time-limited; includes ties naturally.
    // Status gating controlled by statusMode (ACTIVE excludes Completed).
    const rows = state.schedule.filter(scheduleIsIncludedByStatus);
    // sort by latestStart label then class_number
    const sorted = rows.slice().sort((a, b) => sortByTimeLabel(a, b) || ((a.class_number || 0) - (b.class_number || 0)));

    // upcoming only: in ACTIVE statusMode we already filtered out Completed; in COMPLETED mode we keep all.
    // We do not have “now” time; so “upcoming” is “not Completed” when ACTIVE mode.
    if (state.statusMode === 'COMPLETED') return sorted;

    // ACTIVE mode: already not completed; return all (not capped).
    return sorted;
  }

  function renderFooterHint() {
    // Nothing else; keep UX minimal.
  }

  function renderHorses() {
    clearScreen();

    const all = buildActiveHorsesList();

    // Controls
    sectionNavRow([
      {
        label: 'Select All',
        primary: true,
        onClick: () => {
          all.forEach(h => state.activeHorses.add(h));
          render();
        }
      },
      {
        label: 'Clear All',
        primary: false,
        onClick: () => {
          state.activeHorses.clear();
          render();
        }
      }
    ]);

    all.forEach(horseName => {
      const active = isActiveHorse(horseName);
      const tripCount = state.trips.filter(t => (t.horseName === horseName)).length;

      row(horseName, String(tripCount), () => {
        active ? state.activeHorses.delete(horseName) : state.activeHorses.add(horseName);
        render();
      }, active);
    });
  }

  function renderRings() {
    clearScreen();
    renderToggles();

    const { rings, tripsByClass } = buildRingsOverview();

    // Peak row (horizontal) — ringPeak
    sectionNavRow(
      rings.map(r => ({
        label: r.ringName,
        primary: state.selectedPeak.has(r.ring_number),
        onClick: () => {
          if (state.selectedPeak.has(r.ring_number)) state.selectedPeak.delete(r.ring_number);
          else state.selectedPeak.add(r.ring_number);
          render();
        }
      }))
    );

    // ringsList — ringOverview cards
    const visible = state.selectedPeak.size
      ? rings.filter(r => state.selectedPeak.has(r.ring_number))
      : rings;

    visible.forEach(r => {
      const groups = buildGroupsWithinRing(r.schedRows);

      // ringOverview header
      row(`${r.ringName}`, String(groups.length), () => setScreen('ringDetail', r.ring_number), false);

      // group rollups inside ringOverview
      groups.forEach(g => {
        // count active trips under this group
        const classIds = g.classes.map(c => c.class_id).filter(x => x != null);
        let activeTripCount = 0;
        for (const cid of classIds) {
          const arr = tripsByClass.get(cid) || [];
          activeTripCount += arr.filter(tripIsActive).length;
        }

        if (state.scopeMode === 'ACTIVE' && activeTripCount === 0) return;

        const status = g.latestStatus ? ` • ${g.latestStatus}` : '';
        row(
          `${g.latestStart || ''} • ${g.group_name}${status}`,
          String(activeTripCount),
          () => setScreen('classGroupDetail', r.ring_number, g.class_group_id),
          false,
          activeTripCount > 0
        );
      });
    });
  }

  function renderRingDetail() {
    clearScreen();
    renderToggles();

    const ring_number = state.detailKey;
    const byRing = idxScheduleByRing();
    const ringRows = (byRing.get(ring_number) || []).filter(scheduleIsIncludedByStatus);
    const ringName = ringRows[0]?.ringName || `Ring ${ring_number}`;

    row(`${ringName}`, String(ringRows.length), null, false);

    const tripsByClass = idxTripsByClassId();
    const groups = buildGroupsWithinRing(ringRows);

    groups.forEach(g => {
      row(`${g.latestStart || ''} • ${g.group_name}`, null, null, false);

      // classes inside group
      g.classes.forEach(c => {
        const trips = (tripsByClass.get(c.class_id) || []).filter(tripIsActive);
        if (state.scopeMode === 'ACTIVE' && trips.length === 0) return;

        const status = c.latestStatus ? ` • ${c.latestStatus}` : '';
        row(
          `${c.class_name}${status}`,
          String(trips.length),
          () => setScreen('classDetail', c.class_id),
          false,
          trips.length > 0
        );

        // entry rollup under class: horses (active only)
        const horses = uniqueBy(trips, t => (t.entry_id ?? t.entryxclasses_uuid ?? '') + '|' + (t.horseName || ''))
          .map(t => t.horseName)
          .filter(Boolean);

        horses.slice(0, 6).forEach(h => {
          row(`↳ ${h}`, null, () => setScreen('entryDetail', h), false);
        });
      });
    });
  }

  function renderClassGroupDetail() {
    clearScreen();
    renderToggles();

    const ring_number = state.detailKey;
    const class_group_id = state.detailKey2;

    const ringRows = state.schedule
      .filter(s => s.ring_number === ring_number && s.class_group_id === class_group_id)
      .filter(scheduleIsIncludedByStatus)
      .slice()
      .sort((a, b) => sortByTimeLabel(a, b) || ((a.class_number || 0) - (b.class_number || 0)));

    const head = ringRows[0];
    const title = head?.group_name || `Group ${class_group_id}`;

    row(title, String(ringRows.length), null, false);

    const tripsByClass = idxTripsByClassId();

    ringRows.forEach(c => {
      const trips = (tripsByClass.get(c.class_id) || []).filter(tripIsActive);
      if (state.scopeMode === 'ACTIVE' && trips.length === 0) return;

      const status = c.latestStatus ? ` • ${c.latestStatus}` : '';
      row(
        `${c.latestStart || ''} • ${c.class_name}${status}`,
        String(trips.length),
        () => setScreen('classDetail', c.class_id),
        false,
        trips.length > 0
      );
    });
  }

  function renderClasses() {
    clearScreen();
    renderToggles();

    const classes = buildClassesList();

    // Peak row — class groups (derived)
    const groupMap = new Map(); // class_group_id -> label/count
    for (const c of classes) {
      const rowAny = state.schedule.find(s => s.class_id === c.class_id);
      const gid = rowAny?.class_group_id;
      const gname = rowAny?.group_name || '';
      if (gid == null) continue;
      if (!groupMap.has(gid)) groupMap.set(gid, { gid, gname, count: 0 });
      groupMap.get(gid).count += 1;
    }
    const groupPeak = Array.from(groupMap.values()).sort((a, b) => a.gname.localeCompare(b.gname));

    sectionNavRow(
      groupPeak.map(g => ({
        label: g.gname ? g.gname.slice(0, 18) : String(g.gid),
        primary: state.selectedPeak.has(g.gid),
        onClick: () => {
          if (state.selectedPeak.has(g.gid)) state.selectedPeak.delete(g.gid);
          else state.selectedPeak.add(g.gid);
          render();
        }
      }))
    );

    const visible = state.selectedPeak.size
      ? classes.filter(c => {
          const s = state.schedule.find(x => x.class_id === c.class_id);
          return s && state.selectedPeak.has(s.class_group_id);
        })
      : classes;

    visible.forEach(c => {
      const label = `${c.latestStart || ''} • ${c.class_name} • ${c.ringName}`;
      row(label, String(c.activeTripCount), () => setScreen('classDetail', c.class_id), false, c.activeTripCount > 0);
    });
  }

  function renderClassDetail() {
    clearScreen();
    renderToggles();

    const class_id = state.detailKey;
    const sched = state.schedule.find(s => s.class_id === class_id);
    const title = sched?.class_name || `Class ${class_id}`;
    row(title, null, null, false);

    const trips = state.trips
      .filter(t => t.class_id === class_id)
      .filter(tripIsActive)
      .slice()
      .sort((a, b) => (Number(a.lastOOG || 0) - Number(b.lastOOG || 0)));

    // entryOverview within class: horse -> trip meta
    trips.forEach(t => {
      // ignore derived backNumber/entryNumber mismatch; display is front-facing label later
      const go = t.latestGO ? ` • ${t.latestGO}` : '';
      const oog = (t.lastOOG != null) ? `#${t.lastOOG}` : '';
      row(
        `${t.horseName} • ${t.riderName || t.teamName || ''} • ${oog}${go}`,
        null,
        () => setScreen('entryDetail', t.horseName),
        false
      );
    });
  }

  function renderEntryDetail() {
    clearScreen();
    renderToggles();

    const horseName = state.detailKey;
    row(horseName, null, null, false);

    const trips = state.trips
      .filter(t => t.horseName === horseName)
      .filter(tripIsActive)
      .slice()
      .sort((a, b) => {
        // ring then class then OOG
        if ((a.ring_number || 0) !== (b.ring_number || 0)) return (a.ring_number || 0) - (b.ring_number || 0);
        const ta = String(a.latestStart || '');
        const tb = String(b.latestStart || '');
        if (ta !== tb) return ta.localeCompare(tb);
        return (Number(a.lastOOG || 0) - Number(b.lastOOG || 0));
      });

    trips.forEach(t => {
      const status = t.latestStatus ? ` • ${t.latestStatus}` : '';
      const go = t.latestGO ? ` • ${t.latestGO}` : '';
      row(
        `${t.ringName} • ${t.class_name}${status}`,
        `${t.lastOOG != null ? '#' + t.lastOOG : ''}${go}`,
        () => setScreen('riderDetail', (t.riderName || t.teamName || '')),
        false
      );
    });
  }

  function renderRiders() {
    clearScreen();
    renderToggles();

    const riders = buildRidersList();

    // Peak row — quick filter
    sectionNavRow(
      riders.map(r => ({
        label: r.riderName,
        primary: state.selectedPeak.has(r.riderName),
        onClick: () => {
          if (state.selectedPeak.has(r.riderName)) state.selectedPeak.delete(r.riderName);
          else state.selectedPeak.add(r.riderName);
          render();
        }
      }))
    );

    const visible = state.selectedPeak.size
      ? riders.filter(r => state.selectedPeak.has(r.riderName))
      : riders;

    visible.forEach(r => {
      row(r.riderName, String(r.count), () => setScreen('riderDetail', r.riderName), false, r.count > 0);
    });
  }

  function renderRiderDetail() {
    clearScreen();
    renderToggles();

    const riderName = state.detailKey;
    row(riderName, null, null, false);

    const trips = state.trips
      .filter(t => (t.riderName || t.teamName || '') === riderName)
      .filter(tripIsActive)
      .slice()
      .sort((a, b) => (Number(a.lastOOG || 0) - Number(b.lastOOG || 0)));

    trips.forEach(t => {
      const status = t.latestStatus ? ` • ${t.latestStatus}` : '';
      const go = t.latestGO ? ` • ${t.latestGO}` : '';
      row(
        `${t.class_name} • ${t.ringName}${status}`,
        `${t.horseName}${go}`,
        () => setScreen('entryDetail', t.horseName),
        false
      );
    });
  }

  function renderSummary() {
    clearScreen();
    renderToggles();

    // Summary = schedule truth joined with active trips
    const tripsByClass = idxTripsByClassId();
    const rows = state.schedule
      .filter(scheduleIsIncludedByStatus)
      .slice()
      .sort((a, b) => {
        if ((a.ring_number || 0) !== (b.ring_number || 0)) return (a.ring_number || 0) - (b.ring_number || 0);
        const ta = String(a.latestStart || '');
        const tb = String(b.latestStart || '');
        if (ta !== tb) return ta.localeCompare(tb);
        return (Number(a.class_number || 0) - Number(b.class_number || 0));
      });

    rows.forEach(s => {
      const trips = (tripsByClass.get(s.class_id) || []).filter(tripIsActive);
      if (state.scopeMode === 'ACTIVE' && trips.length === 0) return;

      row(
        `${s.ringName} • ${s.class_name}`,
        String(trips.length),
        () => setScreen('classDetail', s.class_id),
        false,
        trips.length > 0
      );

      // brief leaf preview
      trips.slice(0, 4).forEach(t => {
        const go = t.latestGO ? ` • ${t.latestGO}` : '';
        const oog = (t.lastOOG != null) ? `#${t.lastOOG}` : '';
        row(`↳ ${t.horseName} • ${oog}${go}`, null, () => setScreen('entryDetail', t.horseName), false);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // RENDER DISPATCH
  // ---------------------------------------------------------------------------

  function updateNavCounts() {
    if (!navHorses) return;
    navHorses.textContent = `Active Horses (${state.activeHorses.size})`;
  }

  function render() {
    updateNavCounts();

    // Header title
    const titleMap = {
      start: 'Start',
      horses: 'Active Horses',
      rings: 'Rings',
      ringDetail: 'Ring',
      classGroupDetail: 'Group',
      classes: 'Classes',
      classDetail: 'Class',
      entryDetail: 'Horse',
      riders: 'Riders',
      riderDetail: 'Rider',
      summary: 'Summary'
    };
    headerTitle.textContent = titleMap[state.currentScreen] || state.currentScreen;

    if (state.currentScreen === 'start') return renderStart();
    if (state.currentScreen === 'horses') return renderHorses();
    if (state.currentScreen === 'rings') return renderRings();
    if (state.currentScreen === 'ringDetail') return renderRingDetail();
    if (state.currentScreen === 'classGroupDetail') return renderClassGroupDetail();
    if (state.currentScreen === 'classes') return renderClasses();
    if (state.currentScreen === 'classDetail') return renderClassDetail();
    if (state.currentScreen === 'entryDetail') return renderEntryDetail();
    if (state.currentScreen === 'riders') return renderRiders();
    if (state.currentScreen === 'riderDetail') return renderRiderDetail();
    if (state.currentScreen === 'summary') return renderSummary();
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', e => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      // set primary button styling
      const all = navRow.querySelectorAll('[data-screen]');
      all.forEach(b => b.classList.remove('nav-btn--primary'));
      btn.classList.add('nav-btn--primary');

      setScreen(btn.dataset.screen, null, null, false);
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------

  loadAll();
})();
