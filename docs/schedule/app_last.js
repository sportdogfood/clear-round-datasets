// app.js (FULL DROP) — legacy rows + sticky peakbar + ring cards (group/class/entry collapsed)
// Data:
//   ./data/latest/watch_schedule.json  (context scaffold)
//   ./data/latest/watch_trips.json     (truth overlay)
//
// Rules applied (per your notes):
// - Start is real entry; header has Next button.
// - Start -> Active Horses -> Next -> Rings
// - Active Horses: ONLY legacy .row contract; click row toggles follow/unfollow; no extra text.
// - Search input filters live (no rerender on each keystroke; fixes "1 character" issue).
// - Bottom nav includes Start + 4 tabs, uses legacy contract, aggs from watch_trips only.
// - Rings: sticky peakbar uses .nav-btn styling and scrolls horizontally.
// - Rings card:
//   - card-hdr--inverse is true inverse and flex
//   - group-line: 3 cols, group_name ellipsis, agg only if >0
//   - class-line: 3 cols, class_name ellipsis, agg only if >0
//   - entry-line: ONLY horseName + number (no "OOG", no rider line), deduped by (class_id|horseName), choose earliest GO then smallest OOG.

(function () {
  'use strict';

  // ------------------------------------------------------------
  // CONFIG
  // ------------------------------------------------------------

  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    // navigation
    screen: 'start',         // start | state | rings | classes | riders | classDetail | riderDetail
    history: [],             // stack for header back
    detail: null,            // { kind, key }

    // horses
    followedHorses: new Set(),
    horseSearch: '',

    // peak filters (separate, per screen)
    peak: {
      rings: new Set(),      // ring_number (string)
      classes: new Set(),    // class_group_id (string)
      riders: new Set()      // riderName (string)
    }
  };

  // ------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------

  const screenRoot = document.getElementById('screen-root');
  const headerTitle = document.getElementById('header-title');
  const headerBack = document.getElementById('header-back');
  const headerAction = document.getElementById('header-action');
  const navRow = document.getElementById('nav-row');

  // ------------------------------------------------------------
  // UTIL
  // ------------------------------------------------------------

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
  }

  function normalizeStr(s) {
    return String(s || '').trim().toLowerCase();
  }

  function uniqStrings(list) {
    const seen = new Set();
    const out = [];
    for (const v of list) {
      if (v == null) continue;
      const s = String(v);
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out;
  }

  function setAgg(key, value) {
    const node = document.querySelector(`[data-nav-agg="${key}"]`);
    if (!node) return;
    const v = Number(value) || 0;
    node.textContent = String(v);
    node.classList.toggle('nav-agg--positive', v > 0);
  }

  function setNavActive(screenKey) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('[data-screen]');
    btns.forEach((b) => {
      b.classList.toggle('nav-btn--primary', b.dataset.screen === screenKey);
    });
  }

  function setHeader(title, opts) {
    if (headerTitle) headerTitle.textContent = title || '';

    const showBack = !!(opts && opts.showBack);
    const backFn = opts && opts.onBack ? opts.onBack : null;

    if (headerBack) {
      headerBack.classList.toggle('is-hidden', !showBack);
      headerBack.style.visibility = showBack ? 'visible' : 'hidden';
      headerBack.style.pointerEvents = showBack ? 'auto' : 'none';
      headerBack.onclick = showBack && backFn ? backFn : null;
    }

    const actionLabel = opts && opts.actionLabel ? String(opts.actionLabel) : '';
    const actionFn = opts && opts.onAction ? opts.onAction : null;

    if (headerAction) {
      if (actionFn && actionLabel) {
        headerAction.hidden = false;
        headerAction.textContent = actionLabel;
        headerAction.onclick = actionFn;
      } else {
        headerAction.hidden = true;
        headerAction.textContent = '';
        headerAction.onclick = null;
      }
    }
  }

  function pushDetail(nextScreen, detail) {
    state.history.push({ screen: state.screen, detail: state.detail });
    state.screen = nextScreen;
    state.detail = detail || null;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return;
    state.screen = prev.screen;
    state.detail = prev.detail || null;
    render();
  }

  // Parse "h:mm AM" -> minutes since midnight (for ordering)
  function timeToMinutes(t) {
    if (!t || typeof t !== 'string') return null;
    const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = String(m[3]).toUpperCase();
    if (ap === 'AM') { if (hh === 12) hh = 0; }
    else { if (hh !== 12) hh += 12; }
    return hh * 60 + mm;
  }

  // ------------------------------------------------------------
  // LOAD
  // ------------------------------------------------------------

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.json();
  }

  async function loadAll() {
    const [sched, trips] = await Promise.all([
      fetchJson(DATA_SCHEDULE_URL),
      fetchJson(DATA_TRIPS_URL)
    ]);

    const nextGenerated =
      (sched && sched.meta && sched.meta.generated_at) ||
      (trips && trips.meta && trips.meta.generated_at) ||
      null;

    if (state.loaded && nextGenerated && state.meta.generated_at === nextGenerated) return;

    state.schedule = Array.isArray(sched && sched.records) ? sched.records : [];
    state.trips = Array.isArray(trips && trips.records) ? trips.records : [];

    const dtScope =
      (sched && sched.meta && sched.meta.dt) ||
      (state.schedule[0] && state.schedule[0].dt) ||
      (state.trips[0] && state.trips[0].dt) ||
      null;

    const sidScope =
      (sched && sched.meta && sched.meta.sid) ||
      (state.schedule[0] && state.schedule[0].sid) ||
      (state.trips[0] && state.trips[0].sid) ||
      null;

    state.meta = { dt: dtScope, sid: sidScope, generated_at: nextGenerated };

    // seed followed horses once (default: all horses in trips)
    if (state.followedHorses.size === 0) {
      const horses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
        .sort((a, b) => a.localeCompare(b));
      horses.forEach(h => state.followedHorses.add(h));
    }

    state.loaded = true;
    render();
  }

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ------------------------------------------------------------
  // INDEXES (schedule context + trips truth)
  // ------------------------------------------------------------

  function buildIndexes() {
    const schedule = state.schedule || [];
    const trips = state.trips || [];

    // schedule context:
    // ringMap: ring_number -> { ring_number, ringName, groups: Map(gid -> groupObj) }
    // groupObj: { class_group_id, group_name, groupStart, classes: Map(class_id -> classObj) }
    // classObj: { class_id, class_number, class_name, classStart }
    const ringMap = new Map();

    // helper to compute groupStart/classStart from schedule records
    function maybeSetEarlierTime(current, candidate) {
      if (!candidate) return current;
      if (!current) return candidate;
      const a = timeToMinutes(current);
      const b = timeToMinutes(candidate);
      if (a == null) return candidate;
      if (b == null) return current;
      return b < a ? candidate : current;
    }

    for (const r of schedule) {
      if (!r) continue;

      const ringN = r.ring_number;
      const ringKey = ringN != null ? String(ringN) : null;
      if (!ringKey) continue;

      const ringName = r.ringName || `Ring ${ringKey}`;
      const gid = r.class_group_id != null ? String(r.class_group_id) : null;
      const cid = r.class_id != null ? String(r.class_id) : null;
      if (!gid || !cid) continue;

      if (!ringMap.has(ringKey)) {
        ringMap.set(ringKey, { ring_number: ringN, ringName: ringName, groups: new Map() });
      }
      const ringObj = ringMap.get(ringKey);

      if (!ringObj.groups.has(gid)) {
        ringObj.groups.set(gid, {
          class_group_id: gid,
          group_name: r.group_name || '(Group)',
          groupStart: null,
          classes: new Map()
        });
      }
      const gObj = ringObj.groups.get(gid);

      // groupStart = earliest classStart seen for this group
      const classStart = r.latestStart || null;
      gObj.groupStart = maybeSetEarlierTime(gObj.groupStart, classStart);

      if (!gObj.classes.has(cid)) {
        gObj.classes.set(cid, {
          class_id: cid,
          class_number: r.class_number != null ? r.class_number : null,
          class_name: r.class_name || '(Class)',
          classStart: null
        });
      }
      const cObj = gObj.classes.get(cid);
      cObj.classStart = maybeSetEarlierTime(cObj.classStart, classStart);
    }

    // trips truth indexes (restricted to followed horses)
    const tripsIncluded = [];
    const tripsByRing = new Map();
    const tripsByGroup = new Map();
    const tripsByClass = new Map();
    const tripsByRider = new Map();
    const tripsByHorse = new Map();

    function push(map, key, val) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(val);
    }

    for (const t of trips) {
      if (!t) continue;
      const horse = t.horseName ? String(t.horseName) : null;
      if (!horse) continue;

      // "Active" truth is: only followed horses
      if (!state.followedHorses.has(horse)) continue;

      tripsIncluded.push(t);

      push(tripsByHorse, horse, t);

      if (t.ring_number != null) push(tripsByRing, String(t.ring_number), t);
      if (t.class_group_id != null) push(tripsByGroup, String(t.class_group_id), t);
      if (t.class_id != null) push(tripsByClass, String(t.class_id), t);
      if (t.riderName) push(tripsByRider, String(t.riderName), t);
    }

    return {
      ringMap,
      tripsIncluded,
      tripsByRing,
      tripsByGroup,
      tripsByClass,
      tripsByRider,
      tripsByHorse
    };
  }

  // ------------------------------------------------------------
  // AGGS (from trips truth only)
  // ------------------------------------------------------------

  function renderAggs(idx) {
    const horsesCount = state.followedHorses.size;

    const ringsCount = uniqStrings(idx.tripsIncluded.map(t => t && t.ring_number).filter(v => v != null).map(String)).length;
    const classesCount = uniqStrings(idx.tripsIncluded.map(t => t && t.class_group_id).filter(v => v != null).map(String)).length;
    const ridersCount = uniqStrings(idx.tripsIncluded.map(t => t && t.riderName).filter(Boolean).map(String)).length;

    setAgg('state', horsesCount);
    setAgg('rings', ringsCount);
    setAgg('classes', classesCount);
    setAgg('riders', ridersCount);
  }

  // ------------------------------------------------------------
  // PEAKBAR
  // ------------------------------------------------------------

  function renderPeakbar(items, selectedSet, onToggle) {
    if (!items || items.length === 0) return null;

    const peak = el('div', 'peakbar');
    const sc = el('div', 'peakbar-scroller');
    const row = el('div', 'peakbar-row');

    for (const it of items) {
      const b = el('button', 'nav-btn', it.label);
      b.type = 'button';
      b.classList.toggle('nav-btn--primary', selectedSet.has(it.key));
      b.addEventListener('click', () => onToggle(it.key));
      row.appendChild(b);
    }

    sc.appendChild(row);
    peak.appendChild(sc);
    return peak;
  }

  function togglePeak(set, key) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
    render();
  }

  // ------------------------------------------------------------
  // TAGS / ROWS
  // ------------------------------------------------------------

  function makeTag(text, positive) {
    const t = el('span', 'row-tag row-tag--count', String(text == null ? '' : text));
    if (positive) t.classList.add('row-tag--positive');
    return t;
  }

  function makeRow(title, tagNode, active, onClick) {
    const r = el('div', 'row row--tap');
    if (active) r.classList.add('row--active');

    const left = el('div', 'row-title', title);
    r.appendChild(left);
    if (tagNode) r.appendChild(tagNode);

    if (onClick) r.addEventListener('click', onClick);
    return r;
  }

  // ------------------------------------------------------------
  // RING CARD BUILD
  // ------------------------------------------------------------

  function chooseFirstTripForHorseClass(trips) {
    // select by earliest latestGO (time), then smallest lastOOG
    let best = null;
    for (const t of trips) {
      if (!t) continue;
      if (!best) { best = t; continue; }

      const ta = timeToMinutes(t.latestGO) ?? 999999;
      const tb = timeToMinutes(best.latestGO) ?? 999999;
      if (ta < tb) { best = t; continue; }
      if (ta > tb) continue;

      const oa = (t.lastOOG != null ? Number(t.lastOOG) : 999999);
      const ob = (best.lastOOG != null ? Number(best.lastOOG) : 999999);
      if (oa < ob) best = t;
    }
    return best;
  }

  function dedupeFirstEntriesForClass(trips) {
    // Dedup by class_id|horseName (NOT entryxclasses_uuid / trip_id)
    const byKey = new Map();
    for (const t of trips) {
      const cid = t && t.class_id != null ? String(t.class_id) : null;
      const h = t && t.horseName ? String(t.horseName) : null;
      if (!cid || !h) continue;
      const k = cid + '|' + h;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(t);
    }

    const out = [];
    for (const list of byKey.values()) {
      const best = chooseFirstTripForHorseClass(list);
      if (best) out.push(best);
    }

    // stable display order: by class_number (if present) then horse
    out.sort((a, b) => {
      const ca = a && a.class_number != null ? Number(a.class_number) : 999999;
      const cb = b && b.class_number != null ? Number(b.class_number) : 999999;
      if (ca !== cb) return ca - cb;
      return String(a.horseName || '').localeCompare(String(b.horseName || ''));
    });

    return out;
  }

  // ------------------------------------------------------------
  // SCREENS
  // ------------------------------------------------------------

  function renderStart(idx) {
    clearRoot();
    setNavActive('start');
    setHeader('Start', {
      showBack: false,
      actionLabel: 'Next',
      onAction: () => { state.screen = 'state'; render(); }
    });

    const wrap = el('div', '');
    const logo = el('div', 'start-logo');
    logo.appendChild(el('div', 'start-logo-title', 'CRT Daily Show'));

    const sub = state.loaded
      ? `sid ${state.meta.sid || '-'} • ${state.meta.dt || '-'}`
      : 'Loading schedule...';
    logo.appendChild(el('div', 'start-logo-subtitle', sub));

    if (state.meta.generated_at) {
      logo.appendChild(el('div', 'start-logo-subtitle', `generated ${state.meta.generated_at}`));
    }

    wrap.appendChild(logo);

    // Start session row (legacy)
    const startRow = makeRow(state.loaded ? 'Start Session' : 'Loading…', makeTag(state.loaded ? 'GO' : '…'), false, () => {
      state.screen = 'state';
      render();
    });
    wrap.appendChild(startRow);

    screenRoot.appendChild(wrap);
  }

  function renderState(idx) {
    clearRoot();
    setNavActive('state');

    setHeader('Active Horses', {
      showBack: true,
      onBack: () => { state.screen = 'start'; render(); },
      actionLabel: 'Next',
      onAction: () => { state.screen = 'rings'; render(); }
    });

    // Search (legacy)
    const ss = el('div', 'state-search');
    const input = el('input', 'state-search-input');
    input.type = 'text';
    input.placeholder = 'Search horses...';
    input.value = state.horseSearch || '';
    ss.appendChild(input);
    screenRoot.appendChild(ss);

    // Build horse rows once; filter by toggling [hidden]
    const horses = uniqStrings(state.trips.map(t => t && t.horseName).filter(Boolean))
      .sort((a, b) => a.localeCompare(b));

    const rowNodes = [];
    for (const h of horses) {
      const horseTripsAll = idx.tripsByHorse.get(String(h)) || [];
      const tag = makeTag(horseTripsAll.length, horseTripsAll.length > 0);

      const followed = state.followedHorses.has(String(h));
      const row = makeRow(String(h), tag, followed, () => {
        const key = String(h);
        if (state.followedHorses.has(key)) state.followedHorses.delete(key);
        else state.followedHorses.add(key);

        // update row style immediately
        row.classList.toggle('row--active', state.followedHorses.has(key));

        // update aggs without full rerender
        const nextIdx = buildIndexes();
        renderAggs(nextIdx);
      });

      screenRoot.appendChild(row);
      rowNodes.push({ horse: String(h), node: row });
    }

    function applyFilter(q) {
      const qq = normalizeStr(q);
      for (const item of rowNodes) {
        const ok = !qq || normalizeStr(item.horse).includes(qq);
        item.node.hidden = !ok;
      }
    }

    input.addEventListener('input', () => {
      state.horseSearch = input.value;
      applyFilter(state.horseSearch);
    });

    // apply initial filter if any
    applyFilter(state.horseSearch);
  }

  function renderRings(idx) {
    clearRoot();
    setNavActive('rings');

    setHeader('Rings', {
      showBack: true,
      onBack: () => { state.screen = 'state'; render(); },
      actionLabel: null,
      onAction: null
    });

    // Peakbar: rings present in truth (active rings)
    const ringKeys = uniqStrings(idx.tripsIncluded.map(t => t && t.ring_number).filter(v => v != null).map(String))
      .sort((a, b) => Number(a) - Number(b));

    const peakItems = ringKeys.map(k => ({ key: k, label: `Ring ${k}` }));
    const peakbar = renderPeakbar(peakItems, state.peak.rings, (k) => togglePeak(state.peak.rings, k));
    if (peakbar) screenRoot.appendChild(peakbar);

    const visibleRingKeys = state.peak.rings.size ? ringKeys.filter(k => state.peak.rings.has(k)) : ringKeys;

    for (const rk of visibleRingKeys) {
      const ringObj = idx.ringMap.get(String(rk)) || { ring_number: rk, ringName: `Ring ${rk}`, groups: new Map() };
      const ringTripsAll = idx.tripsByRing.get(String(rk)) || [];
      const ringTrips = dedupeFirstEntriesForClass(ringTripsAll);
      const ringCount = ringTrips.length;

      // card
      const card = el('div', 'ring-card');

      const hdr = el('div', 'card-hdr card-hdr--inverse');
      hdr.appendChild(el('div', 'card-hdr-title', ringObj.ringName || `Ring ${rk}`));
      if (ringCount > 0) hdr.appendChild(makeTag(ringCount, true));
      card.appendChild(hdr);

      const body = el('div', 'card-body');

      // groups from schedule context, but only those that have trips (truth)
      const groups = [];
      for (const g of ringObj.groups.values()) {
        groups.push(g);
      }
      groups.sort((a, b) => {
        const ta = timeToMinutes(a.groupStart) ?? 999999;
        const tb = timeToMinutes(b.groupStart) ?? 999999;
        if (ta !== tb) return ta - tb;
        return String(a.group_name || '').localeCompare(String(b.group_name || ''));
      });

      for (const g of groups) {
        const gTripsAll = idx.tripsByGroup.get(String(g.class_group_id)) || [];
        // keep only those in this ring
        const gTripsRing = gTripsAll.filter(t => t && String(t.ring_number) === String(rk));
        const gFirst = dedupeFirstEntriesForClass(gTripsRing);
        const gCount = gFirst.length;
        if (gCount === 0) continue;

        // group line (3 cols)
        const gl = el('div', 'group-line line-tap');
        const tcol = el('div', 'line-time', g.groupStart || '');
        const ncol = el('div', 'line-name', g.group_name || '(Group)');
        const acol = el('div', 'line-agg');
        if (gCount > 0) acol.appendChild(makeTag(gCount, true));
        gl.appendChild(tcol);
        gl.appendChild(ncol);
        gl.appendChild(acol);
        gl.addEventListener('click', () => {
          // jump to classes screen with peak set to this group
          state.peak.classes = new Set([String(g.class_group_id)]);
          state.screen = 'classes';
          render();
        });
        body.appendChild(gl);

        // classes under group
        const classes = [];
        for (const c of g.classes.values()) classes.push(c);
        classes.sort((a, b) => {
          const na = a.class_number != null ? Number(a.class_number) : 999999;
          const nb = b.class_number != null ? Number(b.class_number) : 999999;
          return na - nb;
        });

        for (const c of classes) {
          const cTripsAll = idx.tripsByClass.get(String(c.class_id)) || [];
          const cTripsRing = cTripsAll.filter(t => t && String(t.ring_number) === String(rk));
          const cFirst = dedupeFirstEntriesForClass(cTripsRing);
          const cCount = cFirst.length;
          if (cCount === 0) continue;

          const cl = el('div', 'class-line indent-1 line-tap');
          const ct = el('div', 'line-time', c.classStart || '');
          const cn = el('div', 'line-name', `${c.class_number != null ? c.class_number + ' ' : ''}${c.class_name || '(Class)'}`.trim());
          const ca = el('div', 'line-agg');
          if (cCount > 0) ca.appendChild(makeTag(cCount, true));
          cl.appendChild(ct);
          cl.appendChild(cn);
          cl.appendChild(ca);
          cl.addEventListener('click', () => pushDetail('classDetail', { kind: 'class', key: String(c.class_id) }));
          body.appendChild(cl);

          // entries collapsed: show ONLY first entry instance per (class_id|horseName)
          // entry-line: Name + number (no label, no rider)
          const bestEntries = cFirst.slice(0, 3); // keep rings readable; change if you want more
          for (const t of bestEntries) {
            const num = (t.lastOOG != null ? String(t.lastOOG) : (t.latestPlacing != null ? String(t.latestPlacing) : ''));
            const eline = el('div', 'entry-line indent-2');
            const et = el('div', 'line-time', '');
            const en = el('div', 'line-name', String(t.horseName || ''));
            const ea = el('div', 'line-agg');
            if (num) ea.appendChild(makeTag(num, false));
            eline.appendChild(et);
            eline.appendChild(en);
            eline.appendChild(ea);
            body.appendChild(eline);
          }
        }
      }

      card.appendChild(body);
      screenRoot.appendChild(card);
    }
  }

  function renderClasses(idx) {
    clearRoot();
    setNavActive('classes');

    setHeader('Classes', {
      showBack: true,
      onBack: () => { state.screen = 'rings'; render(); },
      actionLabel: null,
      onAction: null
    });

    // peak = active groups from truth
    const groupKeys = uniqStrings(idx.tripsIncluded.map(t => t && t.class_group_id).filter(v => v != null).map(String))
      .sort((a, b) => Number(a) - Number(b));

    const peakItems = groupKeys.map(gid => {
      // try to find name from schedule context
      let name = `Group ${gid}`;
      for (const r of idx.ringMap.values()) {
        const g = r.groups.get(String(gid));
        if (g && g.group_name) { name = g.group_name; break; }
      }
      return { key: String(gid), label: name };
    });

    const peakbar = renderPeakbar(peakItems, state.peak.classes, (k) => togglePeak(state.peak.classes, k));
    if (peakbar) screenRoot.appendChild(peakbar);

    const visible = state.peak.classes.size ? groupKeys.filter(k => state.peak.classes.has(k)) : groupKeys;

    for (const gid of visible) {
      const trips = idx.tripsByGroup.get(String(gid)) || [];
      const first = dedupeFirstEntriesForClass(trips);
      const count = first.length;

      // group row -> opens nothing; tap to clear peak is not requested; keep as detail-less header row
      let gname = `Group ${gid}`;
      for (const r of idx.ringMap.values()) {
        const g = r.groups.get(String(gid));
        if (g && g.group_name) { gname = g.group_name; break; }
      }

      const row = makeRow(gname, makeTag(count, count > 0), false, () => {
        // go to first class in this group if present
        const firstTrip = first[0];
        if (firstTrip && firstTrip.class_id != null) {
          pushDetail('classDetail', { kind: 'class', key: String(firstTrip.class_id) });
        }
      });
      screenRoot.appendChild(row);
    }
  }

  function renderRiders(idx) {
    clearRoot();
    setNavActive('riders');

    setHeader('Riders', {
      showBack: true,
      onBack: () => { state.screen = 'rings'; render(); },
      actionLabel: null,
      onAction: null
    });

    const riderKeys = uniqStrings(idx.tripsIncluded.map(t => t && t.riderName).filter(Boolean).map(String))
      .sort((a, b) => a.localeCompare(b));

    const peakItems = riderKeys.map(r => ({ key: r, label: r }));
    const peakbar = renderPeakbar(peakItems, state.peak.riders, (k) => togglePeak(state.peak.riders, k));
    if (peakbar) screenRoot.appendChild(peakbar);

    const visible = state.peak.riders.size ? riderKeys.filter(r => state.peak.riders.has(r)) : riderKeys;

    for (const rider of visible) {
      const trips = idx.tripsByRider.get(String(rider)) || [];
      const first = dedupeFirstEntriesForClass(trips);
      const count = first.length;

      const row = makeRow(String(rider), makeTag(count, count > 0), false, () => {
        pushDetail('riderDetail', { kind: 'rider', key: String(rider) });
      });
      screenRoot.appendChild(row);
    }
  }

  function renderClassDetail(idx) {
    const classId = state.detail && state.detail.key ? String(state.detail.key) : null;

    clearRoot();
    setNavActive('classes');
    setHeader('Class', {
      showBack: true,
      onBack: goBack,
      actionLabel: null,
      onAction: null
    });

    if (!classId) return;

    const tripsAll = idx.tripsByClass.get(String(classId)) || [];
    const first = dedupeFirstEntriesForClass(tripsAll);

    // title row (legacy)
    const title = `Class ${classId}`;
    screenRoot.appendChild(makeRow(title, makeTag(first.length, first.length > 0), false, null));

    // entries as rows: horse name + number (no OOG label)
    for (const t of first) {
      const num = (t.lastOOG != null ? String(t.lastOOG) : (t.latestPlacing != null ? String(t.latestPlacing) : ''));
      const row = makeRow(String(t.horseName || ''), makeTag(num, false), false, null);
      screenRoot.appendChild(row);
    }
  }

  function renderRiderDetail(idx) {
    const rider = state.detail && state.detail.key ? String(state.detail.key) : null;

    clearRoot();
    setNavActive('riders');
    setHeader(rider || 'Rider', {
      showBack: true,
      onBack: goBack,
      actionLabel: null,
      onAction: null
    });

    if (!rider) return;

    const tripsAll = idx.tripsByRider.get(String(rider)) || [];
    const first = dedupeFirstEntriesForClass(tripsAll);

    // entries as rows: horse + class_number
    for (const t of first) {
      const right = (t.class_number != null ? String(t.class_number) : (t.class_id != null ? String(t.class_id) : ''));
      const row = makeRow(String(t.horseName || ''), makeTag(right, false), false, null);
      screenRoot.appendChild(row);
    }
  }

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  function render() {
    if (!screenRoot || !headerTitle) return;

    const idx = buildIndexes();
    renderAggs(idx);

    // details keep their parent tab highlighted
    const primary = {
      start: 'start',
      state: 'state',
      rings: 'rings',
      classes: 'classes',
      riders: 'riders',
      classDetail: 'classes',
      riderDetail: 'riders'
    };
    setNavActive(primary[state.screen] || 'start');

    if (state.screen === 'start') return renderStart(idx);
    if (state.screen === 'state') return renderState(idx);
    if (state.screen === 'rings') return renderRings(idx);
    if (state.screen === 'classes') return renderClasses(idx);
    if (state.screen === 'riders') return renderRiders(idx);
    if (state.screen === 'classDetail') return renderClassDetail(idx);
    if (state.screen === 'riderDetail') return renderRiderDetail(idx);

    state.screen = 'start';
    renderStart(idx);
  }

  // ------------------------------------------------------------
  // EVENTS
  // ------------------------------------------------------------

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const next = btn.dataset.screen;

      // primary nav switch resets detail stack
      state.history = [];
      state.detail = null;

      // switching tabs does not clear peaks automatically (your previous preference);
      // keep as-is so peak choice persists across visits.

      state.screen = next;
      render();
    });
  }

  // ------------------------------------------------------------
  // BOOT
  // ------------------------------------------------------------

  loadAll().catch(() => {});
  render();
})();
