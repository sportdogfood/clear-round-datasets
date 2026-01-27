// app.js — CRT Daily Show (Session Start -> Active Horses -> Rings)
// UI contract: legacy rows for lists, true cards for ring view.
// Data:
//   docs/schedule/data/latest/watch_schedule.json (full schedule context)
//   docs/schedule/data/latest/watch_trips.json    (truth for ACTIVE + all aggregates)

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  const DATA_SCHEDULE_URL = './docs/schedule/data/latest/watch_schedule.json';
  const DATA_TRIPS_URL    = './docs/schedule/data/latest/watch_trips.json';
  const REFRESH_MS        = 8 * 60 * 1000;

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const state = {
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    // session + selection
    sessionStarted: false,
    followedHorses: new Set(),      // truth gate (ACTIVE)
    horseSearch: '',

    // nav
    screen: 'start',                // start | horses | rings | classes | riders | (details later)
    history: [],

    // peak (on-page filter) — separate from selection/gating
    peak: {
      rings: new Set(),             // ring_number strings selected in peak bar
      classes: new Set(),
      riders: new Set(),
    }
  };

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const screenRoot  = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack  = document.getElementById('header-back');
  const headerNext  = document.getElementById('header-next');
  const navRow      = document.getElementById('nav-row');

  // ---------------------------------------------------------------------------
  // SMALL UTILS
  // ---------------------------------------------------------------------------

  function $(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function uniqStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const v of arr) {
      if (v == null) continue;
      const s = String(v);
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }

  function parseTimeToMinutes(timeStr) {
    // "8:05 AM" -> minutes since midnight
    if (!timeStr || typeof timeStr !== 'string') return null;
    const s = timeStr.trim();
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (ap === 'AM') { if (hh === 12) hh = 0; }
    else { if (hh !== 12) hh += 12; }
    return hh * 60 + mm;
  }

  function tripTimeSortKey(t) {
    // prioritize latestGO; fallback to lastOOG
    const go = t?.latestGO ? parseTimeToMinutes(t.latestGO) : null;
    if (go != null) return go;
    const oog = (t?.lastOOG == null) ? 999999 : Number(t.lastOOG);
    return 2000 * 60 + oog; // push OOG after time-based when time missing
  }

  // ---------------------------------------------------------------------------
  // LOAD
  // ---------------------------------------------------------------------------

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  }

  async function loadAll() {
    try {
      const [sched, trips] = await Promise.all([
        fetchJson(DATA_SCHEDULE_URL),
        fetchJson(DATA_TRIPS_URL),
      ]);

      state.schedule = Array.isArray(sched?.records) ? sched.records : [];
      state.trips    = Array.isArray(trips?.records) ? trips.records : [];

      const dtScope =
        sched?.meta?.dt ||
        sched?.records?.[0]?.dt ||
        trips?.records?.[0]?.dt ||
        null;

      const sidScope =
        sched?.records?.[0]?.sid ??
        trips?.records?.[0]?.sid ??
        null;

      state.meta = {
        dt: dtScope,
        sid: sidScope,
        generated_at: sched?.meta?.generated_at || trips?.meta?.generated_at || null
      };

      // Seed followed horses ONCE (default follow all active horses),
      // but do not re-add horses the user intentionally unfollowed.
      if (state.followedHorses.size === 0) {
        const horses = uniqStrings(state.trips.map(t => t?.horseName).filter(Boolean));
        for (const h of horses) state.followedHorses.add(h);
      } else {
        // prune horses that no longer exist in payload
        const seen = new Set(state.trips.map(t => t?.horseName).filter(Boolean));
        for (const h of [...state.followedHorses]) {
          if (!seen.has(h)) state.followedHorses.delete(h);
        }
      }

      render();
    } catch (_) {
      // silent
    }
  }

  setInterval(loadAll, REFRESH_MS);

  // ---------------------------------------------------------------------------
  // TRIPS TRUTH (ACTIVE) + AGGREGATES
  // ---------------------------------------------------------------------------

  function isFollowedHorse(name) {
    return state.followedHorses.has(String(name));
  }

  function activeTrips() {
    // truth dataset filtered by followed horses only
    return state.trips.filter(t => t?.horseName && isFollowedHorse(t.horseName));
  }

  function setNavAgg(key, value) {
    const el = document.querySelector(`.nav-agg[data-nav-agg="${key}"]`);
    if (!el) return;
    const n = Number(value || 0);
    el.textContent = String(n);
    el.classList.toggle('nav-agg--positive', n > 0);
  }

  function updateNavAggs() {
    const at = activeTrips();

    const horses = new Set(at.map(t => t?.horseName).filter(Boolean));
    const rings  = new Set(at.map(t => t?.ring_number).filter(v => v != null).map(v => String(v)));
    const classes = new Set(at.map(t => t?.class_id).filter(v => v != null).map(v => String(v)));
    const riders  = new Set(at.map(t => t?.riderName).filter(Boolean).map(v => String(v)));

    setNavAgg('horses', horses.size);
    setNavAgg('rings', rings.size);
    setNavAgg('classes', classes.size);
    setNavAgg('riders', riders.size);
  }

  function setPrimaryNav(screen) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('.nav-btn');
    btns.forEach(b => b.classList.remove('nav-btn--primary'));
    const active = navRow.querySelector(`.nav-btn[data-screen="${screen}"]`);
    if (active) active.classList.add('nav-btn--primary');
  }

  // ---------------------------------------------------------------------------
  // INDEXES (schedule scaffold + active overlays)
  // ---------------------------------------------------------------------------

  function buildScheduleScaffold() {
    // ring -> group -> class (from full schedule only)
    // structure is for context; overlays come from activeTrips only
    const rings = new Map(); // ring_number -> { ring_number, ringName, groups: Map(gid->groupObj) }

    for (const r of state.schedule) {
      const ringN = r?.ring_number;
      const ringName = r?.ringName;
      const gid = r?.class_group_id;
      const gname = r?.group_name;
      const cid = r?.class_id;
      const cnum = r?.class_number;
      const cname = r?.class_name;
      const start = r?.latestStart;

      if (ringN == null || gid == null || cid == null) continue;

      const rk = String(ringN);
      if (!rings.has(rk)) {
        rings.set(rk, {
          ring_number: ringN,
          ringName: ringName || `Ring ${ringN}`,
          groups: new Map()
        });
      }
      const ring = rings.get(rk);

      const gk = String(gid);
      if (!ring.groups.has(gk)) {
        ring.groups.set(gk, {
          class_group_id: gid,
          group_name: gname || '(group)',
          // groupStart = earliest start among its classes
          groupStartMin: null,
          classes: new Map()
        });
      }
      const group = ring.groups.get(gk);

      const mins = parseTimeToMinutes(start);
      if (mins != null) {
        if (group.groupStartMin == null || mins < group.groupStartMin) group.groupStartMin = mins;
      }

      const ck = String(cid);
      if (!group.classes.has(ck)) {
        group.classes.set(ck, {
          class_id: cid,
          class_number: cnum,
          class_name: cname || '(class)',
          firstStartMin: mins
        });
      }
    }

    return rings;
  }

  function buildActiveIndexes() {
    const at = activeTrips();

    const tripsByRing  = new Map(); // ring_number string -> trips[]
    const tripsByGroup = new Map(); // group_id string -> trips[]
    const tripsByClass = new Map(); // class_id string -> trips[]

    for (const t of at) {
      if (t?.ring_number != null) {
        const k = String(t.ring_number);
        if (!tripsByRing.has(k)) tripsByRing.set(k, []);
        tripsByRing.get(k).push(t);
      }
      if (t?.class_group_id != null) {
        const k = String(t.class_group_id);
        if (!tripsByGroup.has(k)) tripsByGroup.set(k, []);
        tripsByGroup.get(k).push(t);
      }
      if (t?.class_id != null) {
        const k = String(t.class_id);
        if (!tripsByClass.has(k)) tripsByClass.set(k, []);
        tripsByClass.get(k).push(t);
      }
    }

    return { tripsByRing, tripsByGroup, tripsByClass, at };
  }

  // ---------------------------------------------------------------------------
  // NAV + SESSION FLOW
  // ---------------------------------------------------------------------------

  function setScreen(next) {
    if (state.screen !== next) state.history.push(state.screen);
    state.screen = next;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return;
    state.screen = prev;
    render();
  }

  function canShowNext() {
    // Session flow: Start -> Horses -> Rings
    return state.screen === 'start' || state.screen === 'horses';
  }

  function doNext() {
    if (state.screen === 'start') {
      state.sessionStarted = true;
      setScreen('horses');
      return;
    }
    if (state.screen === 'horses') {
      setScreen('rings');
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // LEGACY ROW BUILDER (ONLY FOR LISTS)
  // ---------------------------------------------------------------------------

  function row(label, tagText, onClick, isActive) {
    const r = $('div', 'row row--tap');
    if (isActive) r.classList.add('row--active');

    const t = $('div', 'row-title', label);
    r.appendChild(t);

    if (tagText != null) {
      const tag = $('div', 'row-tag row-tag--count', String(tagText));
      r.appendChild(tag);
    }

    if (onClick) r.addEventListener('click', onClick);
    screenRoot.appendChild(r);
  }

  // ---------------------------------------------------------------------------
  // PEAK BAR (nav-btn look, sticky)
  // ---------------------------------------------------------------------------

  function peakBar(items, selectedSet, onToggle) {
    const sticky = $('div', 'peak-sticky');
    const rowEl = $('div', 'nav-row');

    for (const it of items) {
      const btn = $('button', 'nav-btn');
      btn.type = 'button';

      const label = $('span', 'nav-label', it.label);
      btn.appendChild(label);

      // optional agg
      if (it.agg != null) {
        const agg = $('span', 'nav-agg', String(it.agg));
        agg.classList.toggle('nav-agg--positive', Number(it.agg) > 0);
        btn.appendChild(agg);
      }

      if (selectedSet.has(it.key)) btn.classList.add('nav-btn--primary');

      btn.addEventListener('click', () => onToggle(it.key));
      rowEl.appendChild(btn);
    }

    sticky.appendChild(rowEl);
    return sticky;
  }

  // ---------------------------------------------------------------------------
  // CARD BUILDERS (TRUE CARDS)
  // ---------------------------------------------------------------------------

  function card(title, headerAgg) {
    const c = $('div', 'card');

    const h = $('div', 'card-header');
    const t = $('div', 'card-title', title);
    h.appendChild(t);

    if (headerAgg != null && Number(headerAgg) > 0) {
      const a = $('div', 'row-tag row-tag--count row-tag--positive', String(headerAgg));
      h.appendChild(a);
    }

    const b = $('div', 'card-body');
    c.appendChild(h);
    c.appendChild(b);

    return { el: c, header: h, body: b };
  }

  function cardLine(timeText, mainText, aggValue, onClick) {
    const line = $('div', 'card-line');
    if (onClick) line.classList.add('card-line--tap');

    const t = $('div', 'cell-time', timeText || '');
    const m = $('div', 'cell-main', mainText || '');
    const aWrap = $('div', 'cell-agg');

    line.appendChild(t);
    line.appendChild(m);

    if (aggValue != null && Number(aggValue) > 0) {
      const a = $('span', 'row-tag row-tag--count row-tag--positive', String(aggValue));
      aWrap.appendChild(a);
    } else {
      // keep grid aligned, but no visible pill
      aWrap.appendChild($('span', '', ''));
    }
    line.appendChild(aWrap);

    if (onClick) line.addEventListener('click', onClick);
    return line;
  }

  // ---------------------------------------------------------------------------
  // SCREEN: START (session start must exist)
  // ---------------------------------------------------------------------------

  function renderStart() {
    screenRoot.innerHTML = '';

    const wrap = $('div', 'list-column');

    const logo = $('div', 'start-logo');
    logo.appendChild($('div', 'start-logo-title', 'CRT Schedule'));
    const sub = [
      state.meta.sid ? `Show ${state.meta.sid}` : null,
      state.meta.dt ? `Date ${state.meta.dt}` : null,
      state.meta.generated_at ? `Updated ${state.meta.generated_at}` : null
    ].filter(Boolean).join(' • ');
    logo.appendChild($('div', 'start-logo-subtitle', sub || 'Loading…'));
    wrap.appendChild(logo);

    row('Start Session', null, () => {
      state.sessionStarted = true;
      setScreen('horses');
    }, false);

    wrap.appendChild($('div', 'start-logo-subtitle', 'Select horses to follow, then go to Rings.'));
    screenRoot.appendChild(wrap);
  }

  // ---------------------------------------------------------------------------
  // SCREEN: ACTIVE HORSES (legacy rows + state-search; no toggles)
  // ---------------------------------------------------------------------------

  function renderHorses() {
    screenRoot.innerHTML = '';

    // state-search (legacy)
    const ss = $('div', 'state-search');
    const input = document.createElement('input');
    input.className = 'state-search-input';
    input.placeholder = 'Search horses…';
    input.value = state.horseSearch || '';
    input.addEventListener('input', () => {
      state.horseSearch = input.value || '';
      render();
    });
    ss.appendChild(input);
    screenRoot.appendChild(ss);

    const all = uniqStrings(state.trips.map(t => t?.horseName).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    const q = (state.horseSearch || '').trim().toLowerCase();
    const visible = q ? all.filter(h => String(h).toLowerCase().includes(q)) : all;

    // per-horse trip counts (truth = trips dataset)
    const counts = new Map();
    for (const t of state.trips) {
      const h = t?.horseName;
      if (!h) continue;
      counts.set(h, (counts.get(h) || 0) + 1);
    }

    for (const horse of visible) {
      const isOn = isFollowedHorse(horse);
      const cnt = counts.get(horse) || 0;

      row(horse, cnt, () => {
        if (isOn) state.followedHorses.delete(horse);
        else state.followedHorses.add(horse);
        render();
      }, isOn);
    }
  }

  // ---------------------------------------------------------------------------
  // SCREEN: RINGS (true cards + sticky peak; aggregates from trips truth only)
  // ---------------------------------------------------------------------------

  function togglePeakRing(ringKey) {
    const set = state.peak.rings;
    if (set.has(ringKey)) set.delete(ringKey);
    else set.add(ringKey);
    render();
  }

  function renderRings() {
    screenRoot.innerHTML = '';

    const scaffold = buildScheduleScaffold();
    const idx = buildActiveIndexes();

    // Peak items (rings) — show ringName + agg(active trips)
    const ringArr = [...scaffold.values()].sort((a, b) => Number(a.ring_number) - Number(b.ring_number));
    const peakItems = ringArr.map(r => {
      const rk = String(r.ring_number);
      const trips = idx.tripsByRing.get(rk) || [];
      return { key: rk, label: r.ringName, agg: trips.length };
    });

    // Peak sticky
    screenRoot.appendChild(peakBar(peakItems, state.peak.rings, togglePeakRing));

    const visibleRings = state.peak.rings.size
      ? ringArr.filter(r => state.peak.rings.has(String(r.ring_number)))
      : ringArr;

    for (const ring of visibleRings) {
      const rk = String(ring.ring_number);

      const ringTrips = idx.tripsByRing.get(rk) || [];
      const ringAgg = ringTrips.length;

      const c = card(ring.ringName, ringAgg);

      // GROUP -> CLASS -> FIRST TRIP (only 1)
      const groups = [...ring.groups.values()].slice().sort((a, b) => {
        const aa = (a.groupStartMin == null) ? 999999 : a.groupStartMin;
        const bb = (b.groupStartMin == null) ? 999999 : b.groupStartMin;
        return aa - bb;
      });

      for (const g of groups) {
        const gid = String(g.class_group_id);
        const gTrips = idx.tripsByGroup.get(gid) || [];
        const gHorseCount = new Set(gTrips.map(t => t?.horseName).filter(Boolean)).size;

        // Group line: time | group name | agg(if >0)
        const gTime = (g.groupStartMin == null) ? '' : minutesToDisplay(g.groupStartMin);
        c.body.appendChild(cardLine(gTime, g.group_name, gHorseCount, null));

        // Classes inside group
        const classes = [...g.classes.values()].slice().sort((a, b) => Number(a.class_number || 0) - Number(b.class_number || 0));
        for (const cls of classes) {
          const cid = String(cls.class_id);
          const cTrips = (idx.tripsByClass.get(cid) || []);

          // Class label line (no agg)
          const classLabel = `${cls.class_number != null ? cls.class_number + ' ' : ''}${cls.class_name}`;
          c.body.appendChild(cardLine('', classLabel, null, null));

          // Only show the FIRST relevant trip for this class (per your rule)
          if (cTrips.length) {
            const pick = cTrips.slice().sort((a, b) => tripTimeSortKey(a) - tripTimeSortKey(b))[0];
            const time = pick?.latestGO || '';
            const horse = pick?.horseName || '';
            const oog = (pick?.lastOOG != null) ? `OOG ${pick.lastOOG}` : '';
            const main = oog ? `${horse} • ${oog}` : horse;

            // no agg pill here; this is informational
            c.body.appendChild(cardLine(time, main, null, null));
          }
        }
      }

      screenRoot.appendChild(c.el);
    }

    function minutesToDisplay(mins) {
      // best-effort display like "8:05 AM"
      const h24 = Math.floor(mins / 60);
      const mm = mins % 60;
      const ap = h24 >= 12 ? 'PM' : 'AM';
      let h = h24 % 12;
      if (h === 0) h = 12;
      return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
    }
  }

  // ---------------------------------------------------------------------------
  // PLACEHOLDER SCREENS (kept minimal, still functional nav)
  //   - These are ACTIVE-only lists derived from trips truth.
  // ---------------------------------------------------------------------------

  function renderClasses() {
    screenRoot.innerHTML = '';
    const at = activeTrips();
    const byClass = new Map();
    for (const t of at) {
      const cid = t?.class_id;
      if (cid == null) continue;
      const k = String(cid);
      if (!byClass.has(k)) byClass.set(k, { class_id: cid, class_number: t?.class_number, class_name: t?.class_name, trips: [] });
      byClass.get(k).trips.push(t);
    }
    const arr = [...byClass.values()].sort((a, b) => Number(a.class_number || 0) - Number(b.class_number || 0));
    for (const c of arr) {
      row(`${c.class_number != null ? c.class_number + ' ' : ''}${c.class_name || 'Class'}`, c.trips.length, null, false);
    }
  }

  function renderRiders() {
    screenRoot.innerHTML = '';
    const at = activeTrips();
    const by = new Map();
    for (const t of at) {
      const r = t?.riderName;
      if (!r) continue;
      const k = String(r);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(t);
    }
    const arr = [...by.keys()].sort((a, b) => a.localeCompare(b));
    for (const name of arr) {
      row(name, by.get(name).length, null, false);
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  function render() {
    if (!screenRoot || !headerTitle) return;

    updateNavAggs();
    setPrimaryNav(state.screen);

    // Header
    const titleMap = {
      start: 'Start',
      horses: 'Active Horses',
      rings: 'Rings',
      classes: 'Classes',
      riders: 'Riders',
    };
    headerTitle.textContent = titleMap[state.screen] || state.screen;

    // Back visibility
    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';

    // Next visibility
    if (headerNext) headerNext.hidden = !canShowNext();

    // Screens
    if (state.screen === 'start') return renderStart();
    if (state.screen === 'horses') return renderHorses();
    if (state.screen === 'rings') return renderRings();
    if (state.screen === 'classes') return renderClasses();
    if (state.screen === 'riders') return renderRiders();

    screenRoot.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  if (headerBack) headerBack.addEventListener('click', goBack);
  if (headerNext) headerNext.addEventListener('click', doNext);

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn[data-screen]');
      if (!btn) return;

      const next = btn.dataset.screen;

      // prevent skipping session flow via nav until session started
      if (!state.sessionStarted && next !== 'start') {
        state.screen = 'start';
        state.history = [];
        render();
        return;
      }

      // nav-to-nav does not push into history (legacy behavior)
      state.history = [];
      state.screen = next;

      // peak is per-screen; keep rings peak only for rings screen
      if (next !== 'rings') state.peak.rings = new Set();

      render();
    });
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------

  loadAll();
})();
