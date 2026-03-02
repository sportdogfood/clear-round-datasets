/* CONTRACT (LOCKED)
   - Bottom nav label: Pro (view key remains "lite"; label changes only)
   - Horses screen active/inactive selection is source of truth for:
       • which horses render in Pro schedule
       • which horses appear in horsebar
   - Only show actionable anchors
       • peakbar rings are derived from "Visible Pro body"
       • horsebar horses are derived from "Visible Pro body"
   - "Visible Pro body" = watch_trips after applying:
       • inactive horses (Horses screen)
       • current global status filter (if any)
     excluding any single-horse focus (activeHorse)
*/
(function(){
  'use strict';

  // -------------------------------------------
  // DOM
  // -------------------------------------------
  const app = document.getElementById('app');
  const main = document.getElementById('main');

  const statusWrap = document.getElementById('statusWrap');
  const peaksWrap  = document.getElementById('peaksWrap');
  const horsesWrap = document.getElementById('horsesWrap');
  const peakbar = document.getElementById('peakbar');
  const horsebar = document.getElementById('horsebar');

  const topTitle = document.getElementById('topTitle');
  const btnBack = document.getElementById('btnBack');
  const btnRefresh = document.getElementById('btnRefresh');

  const views = {
    start: document.getElementById('view-start'),
    summary: document.getElementById('view-summary'),
    lite: document.getElementById('view-lite'),
    full: document.getElementById('view-full'),
    threads: document.getElementById('view-threads'),
    horses: document.getElementById('view-horses'),
  };

  const ringsLiteEl = document.getElementById('rings_container_lite');
  const ringsFullEl = document.getElementById('rings_container_full');
  const threadsEl = document.getElementById('threads_container');
  const horsesEl = document.getElementById('horses_container');

  const start_status = document.getElementById('start_status');
  const start_refresh = document.getElementById('start_refresh');
  const start_trips = document.getElementById('start_trips');
  const start_classes = document.getElementById('start_classes');
  const start_threads = document.getElementById('start_threads');

  const sum_underway = document.getElementById('sum_underway');
  const sum_upcoming = document.getElementById('sum_upcoming');
  const sum_completed = document.getElementById('sum_completed');

  const moversBody = document.getElementById('moversBody');

  // Flyup
  const fly = document.getElementById('fly');
  const flyTitle = document.getElementById('flyTitle');
  const flyBody = document.getElementById('flyBody');
  const flyClose = document.getElementById('flyClose');
  const flySMS = document.getElementById('flySMS');
  const flyBackdrop = document.getElementById('flyBackdrop');

  // ------------------------------------------------
  // State
  // ------------------------------------------------
  const state = {
    
    flySmsBody: '',activeView: 'start',
    globalStatus: '',   // '', 'U','L','C'
    activeHorse: '',    // '' or horseName
    horseSearch: '',    // horses view search
    trips: [],
    schedule: [],
    threads: [],
    inactiveHorses: new Set(), // lowercased horseName keys (Pro ignores)
    entriesById: new Map(),
    ringsIndex: [], // {ring_number, ringName}
    lastLoadedAt: null,
    errors: []
  };

  // ------------------------------------------------
  // Utilities
  // ------------------------------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

  function trunc6(s){
    const t = String(s ?? "").trim();
    if (!t) return "—";
    return t.length > 6 ? (t.slice(0,6) + "…") : t;
  }

  function fmtGoShort(s){
    const t = String(s ?? "").trim();
    if (!t || t === "—") return "—";
    let m = t.match(/^(\d{1,2}:\d{2})([AP])$/i);
    if (m) return m[1] + m[2].toUpperCase();
    m = t.match(/^(\d{1,2}:\d{2})\s*([AP])M$/i);
    if (m) return m[1] + m[2].toUpperCase();
    return t.replace(/\s+/g, "").replace(/AM$/i, "A").replace(/PM$/i, "P");
  }

  function fmtStartShort(s){
    const t = String(s ?? "").trim();
    if (!t || t === "—") return "—";
    let m = t.match(/^(\d{1,2}:\d{2})\s*([AP])M$/i);
    if (m) return m[1] + m[2].toUpperCase();
    m = t.match(/^(\d{1,2}:\d{2})([AP])$/i);
    if (m) return m[1] + m[2].toUpperCase();
    // tolerate '8:00 AM'
    m = t.match(/^(\d{1,2}:\d{2})\s*([AP])\s*M$/i);
    if (m) return m[1] + m[2].toUpperCase();
    return t.replace(/\s+/g, "").replace(/AM$/i, "A").replace(/PM$/i, "P");
  }

  function fmtTrips2(v){
    const s = String(v ?? "").trim();
    if (!s) return "—";
    return s.length > 3 ? s.slice(0,3) : s;
  }

  function fmtOog3(v){
    const s = String(v ?? "").trim();
    if (!s) return "—";
    return s.length > 3 ? s.slice(0,3) : s;
  }

  function epillInner(horseName, lastOOG, totalTrips, latestGO){
    const hn = trunc6(horseName || "");
    const oog = fmtOog3(lastOOG);
    const trp = fmtTrips2(totalTrips);
    const go  = fmtGoShort(latestGO);
    return `
      <div class="epill_top">
        <span class="epill_h">${esc(hn)}</span>
        <span class="epill_val">${esc(go)}</span>
      </div>
      <div class="epill_bot">
        <span class="epill_k">OOG ${esc(oog)}</span>
        <span class="epill_k">${esc(trp)} Trips</span>
      </div>
    `;
  }

  function icoClock(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>`;
  }
  function icoBolt(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 12-14h-7l1-6z"/></svg></span>`;
  }
  function icoCheckCircle(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l2 2 6-6"/></svg></span>`;
  }
  function statusIco(code){
    return code === 'U' ? icoClock() : code === 'L' ? icoBolt() : code === 'C' ? icoCheckCircle() : '';
  }


  function uniq(arr){
    return Array.from(new Set(arr));
  }

  function toStatusCode(latestStatus){
    const s = String(latestStatus || '').toLowerCase();
    if (s.includes('underway') || s.includes('live')) return 'L';
    if (s.includes('upcoming') || s.includes('soon')) return 'U';
    if (s.includes('complete') || s.includes('done')) return 'C';
    return ''; // unknown
  }

  function scrollToRing(sel){
    if (!sel) return;
    const el = document.querySelector(sel);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const wrapTop = main.getBoundingClientRect().top;
    const y = main.scrollTop + (top - wrapTop) - 10;
    main.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  // ------------------------------------------------
  // Sticky chrome hide on scroll
  // ------------------------------------------------
  let lastY = 0, ticking = false;
  function onScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = main.scrollTop || 0;
      const dy = y - lastY;
      if (Math.abs(dy) > 6){
        if (dy > 0) app.classList.add('chrome--hidden');
        else app.classList.remove('chrome--hidden');
      }
      lastY = y;
      ticking = false;
    });
  }
  main.addEventListener('scroll', onScroll, { passive: true });

  // ------------------------------------------------
  // Views / nav
  // ------------------------------------------------
  function setView(viewKey){
    state.activeView = viewKey;

    Object.keys(views).forEach(k => views[k].classList.toggle('is-active', k === viewKey));
    document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
      b.classList.toggle('is-active', b.getAttribute('data-view') === viewKey);
    });

    // Peaks + horses only for Lite/Full
    const showFilters = (viewKey === 'lite' || viewKey === 'full');
    statusWrap.hidden = !showFilters;
    peaksWrap.hidden = !showFilters;
    horsesWrap.hidden = !showFilters;
    app.classList.toggle('filters--on', showFilters);

    topTitle.textContent = viewKey === 'lite' ? 'Pro Schedule'
                       : viewKey === 'full' ? 'Full Schedule'
                       : viewKey === 'threads' ? 'Threads'
                       : viewKey === 'horses' ? 'Horses'
                       : viewKey === 'summary' ? 'Summary'
                       : 'Start';

    // close flyup when leaving Lite
    if (viewKey !== 'lite') closeFly();

    // re-render peaks active state, because scroll targets differ by view
    renderPeaks();
  }

  document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
    b.addEventListener('click', () => setView(b.getAttribute('data-view')));
  });

  btnRefresh.addEventListener('click', () => {
    app.classList.remove('chrome--hidden');
    setView('start');
    main.scrollTo({ top: 0, behavior: 'smooth' });
  });
  btnBack.addEventListener('click', () => { /* reserved */ });

  // ------------------------------------------------
  // Filters (global status + horse)
  // ------------------------------------------------
  function syncGlobalStatusButtons(){
    document.querySelectorAll('[data-global-status]').forEach(b => {
      b.classList.toggle('is-on', (b.getAttribute('data-global-status') === state.globalStatus) && !!state.globalStatus);
    });
    document.querySelectorAll('[data-ring-action]').forEach(b => {
      const act = b.getAttribute('data-ring-action');
      const code = act === 'soon' ? 'U' : act === 'now' ? 'L' : act === 'done' ? 'C' : '';
      b.classList.toggle('is-on', !!state.globalStatus && code === state.globalStatus);
    });
  }

  document.querySelectorAll('[data-global-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-global-status') || '';
      state.globalStatus = (state.globalStatus === v) ? '' : v;
      syncGlobalStatusButtons();
      renderLiteAndFull();
    });
  });

  function proVisibleTripsForAnchors(){
    // Visible Pro body (for anchors): trips after inactive + global status; ignores activeHorse focus
    return state.trips
      .filter(e => !isHorseInactive(e.horseName))
      .filter(e => !state.globalStatus || toStatusCode(e.latestStatus) === state.globalStatus);
  }


function buildHorseChips(){
    const base = proVisibleTripsForAnchors();
    const horses = uniq(base.map(r => (r.horseName || '').trim()).filter(Boolean))
      .sort((a,b) => a.localeCompare(b));

    // If focus horse is no longer available under Pro-visible rules, clear it
    if (state.activeHorse && !horses.includes(state.activeHorse)) state.activeHorse = '';

    horsebar.innerHTML = '';
    horses.forEach(name => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hchip' + ((state.activeHorse === name) ? ' is-on' : '');
      b.textContent = name;
      b.setAttribute('data-horse-chip', name);
      b.addEventListener('click', () => {
        state.activeHorse = (state.activeHorse === name) ? '' : name;
        renderLiteAndFull();
      });
      horsebar.appendChild(b);
    });
  }

  
  // Ring eyelid status filter (mirrors global status)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ring-action]');
    if (!btn) return;

    // Only active within Lite/Full
    if (!(state.activeView === 'lite' || state.activeView === 'full')) return;

    const act = btn.getAttribute('data-ring-action');
    const v = act === 'soon' ? 'U' : act === 'now' ? 'L' : act === 'done' ? 'C' : '';
    state.globalStatus = (state.globalStatus === v) ? '' : v;

    syncGlobalStatusButtons();
    renderLiteAndFull();
  });

  // ------------------------------------------------
  // Horse ignore (Horses view toggles)
  // Default: all ACTIVE
  //   - User toggles to INACTIVE; Pro (Lite) + Threads hide inactive horses
  // ------------------------------------------------
  const HORSE_IGNORE_LS_KEY = 'ta_horse_ignore_v1';

  function horseKey(name){
    return String(name || '').trim().toLowerCase();
  }

  function readInactiveHorses(){
    try{
      const txt = localStorage.getItem(HORSE_IGNORE_LS_KEY);
      const obj = txt ? JSON.parse(txt) : null;
      const arr = Array.isArray(obj?.inactive) ? obj.inactive : [];
      const set = new Set(arr.map(horseKey).filter(Boolean));
      return set;
    }catch(_){
      return new Set();
    }
  }

  function writeInactiveHorses(set){
    try{
      const obj = { inactive: Array.from(set.values()) };
      localStorage.setItem(HORSE_IGNORE_LS_KEY, JSON.stringify(obj));
    }catch(_){ }
  }

  function syncInactiveFromStorage(){
    state.inactiveHorses = readInactiveHorses();
  }

  function isHorseInactive(name){
    const k = horseKey(name);
    if (!k) return false;
    return state.inactiveHorses.has(k);
  }

  function setHorseInactive(name, inactive){
    const k = horseKey(name);
    if (!k) return;
    if (inactive) state.inactiveHorses.add(k);
    else state.inactiveHorses.delete(k);
    writeInactiveHorses(state.inactiveHorses);
  }

  function toggleHorseInactive(name){
    const inactive = isHorseInactive(name);
    setHorseInactive(name, !inactive);
  }

  // ------------------------------------------------
  // Data loading
  // ------------------------------------------------
  async function fetchJson(url){
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    return data;
  }

  async function fetchJsonAny(urls){
    let lastErr = null;
    for (const u of urls){
      try{
        const json = await fetchJson(u);
        return { url: u, json };
      }catch(e){
        lastErr = e;
      }
    }
    throw (lastErr || new Error('All candidate URLs failed'));
  }

  function indexEntriesById(){
    state.entriesById = new Map();
    state.trips.forEach(r => {
      if (r.entry_id) state.entriesById.set(String(r.entry_id), r);
    });
  }

  function indexRings(){
    const rings = new Map();
    const add = (ring_number, ringName) => {
      const n = ring_number == null ? 0 : Number(ring_number);
      const key = String(n);
      const name = String(ringName || '').trim();
      if (!rings.has(key)) {
        rings.set(key, { ring_number: n, ringName: name || `Ring ${n}` });
        return;
      }
      // prefer non-empty + longer (more complete) ringName
      const cur = rings.get(key);
      const curName = String(cur?.ringName || '').trim();
      if (name && (!curName || name.length > curName.length)) {
        cur.ringName = name;
      }
    };

    // prefer schedule (full)
    if (state.schedule.length){
      state.schedule.forEach(r => add(r.ring_number, r.ringName || r.ring_name));
    }
    // fall back to trips
    state.trips.forEach(r => add(r.ring_number, r.ringName || r.ring_name));

    state.ringsIndex = Array.from(rings.values()).filter(r => Number(r.ring_number||0) > 0);
  }

  function normalizeTripRow(r){
    // Defensive normalization so rendering doesn't blow up.
    // Expect fields like:
    //  horseName, ring_number, ringName, class_id, class_name, class_number, latestStart, latestGO, lastOOG, total_trips, latestStatus
    const o = Object.assign({}, r || {});
    o.horseName = (o.horse || o.horseName || o.horse_name || '').toString().trim();
    o.ring_number = Number(o.ring_number || o.ring || o.ringNo || 0);
    o.ringName = (o.ringName || o.ring_name || o.ring_title || '').toString().trim();
    o.class_id = o.class_id ?? o.classId ?? o.class ?? '';
    o.class_number = o.class_number ?? o.classNo ?? '';
    o.class_name = o.class_name ?? o.classTitle ?? '';
    o.class_type = o.class_type ?? o.type ?? '';
    o.schedule_sequencetype = o.schedule_sequencetype ?? o.sequence_type ?? o.sequence ?? '';
    o.latestStart = (o.latestStart || o.estimated_start_time || o.latest_estimated_start_time || o.start_time || '').toString().trim();
    o.latestGO = (o.latestGO || o.calculated_go_time || o.latest_estimated_go_time || o.go_time || '').toString().trim();
    o.lastOOG = (o.lastOOG || o.last_order_of_go || o.oog || '').toString().trim();
    o.total_trips = o.total_trips ?? o.trips ?? '';
    o.latestStatus = (o.latestStatus || o.class_status || o.status || '').toString().trim();
    o.time_sort = o.time_sort ?? o.sort ?? 0;
    o.group_name = (o.group_name || o.group || '').toString().trim();
    o.class_group_id = o.class_group_id ?? o.group_id ?? '';
    o.entry_id = o.entry_id ?? o.entryId ?? '';
    o.entryxclasses_uuid = o.entryxclasses_uuid ?? o.entry_uuid ?? '';
    o.observed_at = o.observed_at ?? o.observedAt ?? '';
    o.message = (o.message || '').toString();
    return o;
  }

  function normalizeScheduleRow(r){
    const o = Object.assign({}, r || {});
    o.ring_number = Number(o.ring_number || o.ring || 0);
    o.ringName = (o.ringName || o.ring_name || '').toString().trim();
    o.class_id = o.class_id ?? o.classId ?? '';
    o.class_number = o.class_number ?? '';
    o.class_name = o.class_name ?? '';
    o.class_type = o.class_type ?? '';
    o.schedule_sequencetype = o.schedule_sequencetype ?? '';
    o.latestStart = (o.latestStart || o.estimated_start_time || o.latest_estimated_start_time || '').toString().trim();
    o.latestStatus = (o.latestStatus || o.class_status || o.status || '').toString().trim();
    o.time_sort = o.time_sort ?? o.sort ?? 0;
    // overlay list of entry_ids for this class (if provided)
    o.rollup_entries = Array.isArray(o.rollup_entries) ? o.rollup_entries : (Array.isArray(o.entries) ? o.entries : []);
    return o;
  }

  function normalizeThreadRow(r){
    const o = Object.assign({}, r || {});
    o.horseName = (o.horse || o.horseName || '').toString().trim();
    o.observed_at = (o.observed_at || o.time || o.ts || '').toString().trim();
    o.message = (o.message || o.text || '').toString();
    o.ringName = (o.ringName || o.ring_name || '').toString().trim();
    o.ring_number = Number(o.ring_number || o.ring || 0);
    return o;
  }

  async function loadData(force){
    start_status.textContent = 'Loading...';
    try{
      const base = './data/latest/';

      const tripsUrlCandidates = [
        base + 'watch_trips.json',
        base + 'watch_trips.latest.json',
      ];
      const scheduleUrlCandidates = [
        base + 'watch_schedule.json',
        base + 'watch_schedule.latest.json',
      ];
      const threadsUrlCandidates = [
        base + 'watch_threads.json',
        base + 'watch_threads.latest.json',
      ];

      const tripsRes = await fetchJsonAny(tripsUrlCandidates);
      const schedRes = await fetchJsonAny(scheduleUrlCandidates);
      const thrRes   = await fetchJsonAny(threadsUrlCandidates);

      const tripsJson = tripsRes.json;
      const scheduleJson = schedRes.json;
      const threadsJson = thrRes.json;

      state.trips = Array.isArray(tripsJson) ? tripsJson.map(normalizeTripRow)
                  : Array.isArray(tripsJson?.records) ? tripsJson.records.map(normalizeTripRow)
                  : [];
      state.schedule = Array.isArray(scheduleJson) ? scheduleJson.map(normalizeScheduleRow)
                    : Array.isArray(scheduleJson?.records) ? scheduleJson.records.map(normalizeScheduleRow)
                    : [];
      state.threads = Array.isArray(threadsJson) ? threadsJson.map(normalizeThreadRow)
                   : Array.isArray(threadsJson?.records) ? threadsJson.records.map(normalizeThreadRow)
                   : [];

      state.lastLoadedAt = new Date();

      // index overlays
      indexEntriesById();
      indexRings();

      // restore ignores
      syncInactiveFromStorage();
      buildHorseChips();
      renderPeaks();
      updateStartSummary();

      renderLiteAndFull();
      renderThreads();
      renderHorses();

      // auto switch to Lite once loaded (only if user hasn't navigated)
      if (!force && state.activeView === 'start') {
        // remain on Start
      }

      start_status.textContent = 'Loaded';
    }catch(err){
      state.errors.push(String(err?.message || err));
      start_status.textContent = 'Failed';
    }
  }

  // ------------------------------------------------
  // Render: Lite (from trips)
  // ------------------------------------------------
  function groupTripsToClasses(){
    const byClass = new Map();
    state.trips.forEach(r => {
      const classId = String(r.class_id ?? '');
      if (!classId) return;
      if (!byClass.has(classId)){
        byClass.set(classId, {
          ring_number: Number(r.ring_number || 0),
          ringName: r.ringName || `Ring ${r.ring_number || ''}`.trim(),
          class_group_id: r.class_group_id,
          group_name: r.group_name,
          class_id: r.class_id,
          class_number: r.class_number,
          class_name: r.class_name,
          class_type: r.class_type,
          schedule_sequencetype: r.schedule_sequencetype,
          latestStart: r.latestStart,
          latestStatus: r.latestStatus,
          total_trips: r.total_trips,
          time_sort: r.time_sort,
          entries: []
        });
      }
      byClass.get(classId).entries.push(r);
    });

    const classes = Array.from(byClass.values());
    classes.sort((a,b) => {
      const ta = Number(a.time_sort || 0), tb = Number(b.time_sort || 0);
      if (ta !== tb) return ta - tb;
      return String(a.class_number||'').localeCompare(String(b.class_number||''));
    });
    return classes;
  }

  function renderLite(){
    const classes = groupTripsToClasses();

    // group by ring
    const byRing = new Map();
    classes.forEach(c => {
      const rn = Number(c.ring_number || 0);
      if (!byRing.has(rn)) byRing.set(rn, []);
      byRing.get(rn).push(c);
    });

    const rings = Array.from(byRing.keys()).sort((a,b)=>a-b);

    ringsLiteEl.innerHTML = '';
    rings.forEach(rn => {
      const ringClasses = byRing.get(rn) || [];
      const ringName = ringClasses[0]?.ringName || `Ring ${rn}`;

      const ringSec = document.createElement('section');
      ringSec.className = 'ring_card';
      ringSec.id = `ring-lite-${rn}`;
      ringSec.setAttribute('data-ring', String(rn));
      ringSec.innerHTML = `
        <div class="ring_line">
          <div class="ring_title">${esc(ringName)}</div>
          <div class="ring_actions" aria-label="Ring status">
            <button class="ring_btn ring_btn--icon${state.globalStatus==='U'?' is-on':''}" type="button" data-ring-action="soon" data-state="soon" aria-label="Soon" title="Soon">${icoClock()}</button>
            <button class="ring_btn ring_btn--icon${state.globalStatus==='L'?' is-on':''}" type="button" data-ring-action="now" data-state="now" aria-label="Now" title="Now">${icoBolt()}</button>
            <button class="ring_btn ring_btn--icon${state.globalStatus==='C'?' is-on':''}" type="button" data-ring-action="done" data-state="done" aria-label="Done" title="Done">${icoCheckCircle()}</button>
          </div>
        </div>
        <div class="group_wrap"></div>
      `;

      const gw = ringSec.querySelector('.group_wrap');

      ringClasses.forEach(c => {
        const statusCode = toStatusCode(c.latestStatus);

        // global status filter
        if (state.globalStatus && statusCode !== state.globalStatus) return;

        // entry filter (Pro ignores + optional single-horse focus)
        const baseEntries = c.entries
          .filter(e => !isHorseInactive(e.horseName));
        if (!baseEntries.length) return;

        const entries = baseEntries
          .filter(e => !state.activeHorse || String(e.horseName||'').trim() === state.activeHorse);
        if (state.activeHorse && entries.length === 0) return;

        const classCard = document.createElement('div');
        classCard.className = 'class_card';
        classCard.setAttribute('data-class-id', String(c.class_id || ''));

        const timeTxt = fmtStartShort(c.latestStart || '');
        const numTxt = c.class_number || '—';
        const nameTxt = c.class_name || '—';
        const subTxt = [c.class_type, c.schedule_sequencetype].filter(Boolean).join(' • ');

        classCard.innerHTML = `
          <div class="class_line" data-open-class="${esc(c.class_id)}" data-status="${statusCode}">
            <div class="c_time">${esc(timeTxt)}</div>
            <div class="c_num">${esc(numTxt)}</div>
            <div class="c_name">
              <div class="c_name_main">${esc(nameTxt)}</div>
              <div class="c_name_sub">${esc(subTxt || '')}</div>
            </div>
          </div>
          <div class="epills"></div>
          <div class="rollup_line">
            <span class="pill">${statusIco(statusCode)} <span style="opacity:.85">${esc(statusCode||'—')}</span></span>
            <span class="pill">${esc(entries.length)} Horses</span>
          </div>
        `;

        const sc = classCard.querySelector('.epills');
        entries.forEach(e => {
          const btn = document.createElement('div');
          btn.className = 'epill';
          btn.setAttribute('data-open-entry', String(e.entry_id || ''));
          btn.setAttribute('data-horse', String(e.horseName||'').trim());
          btn.innerHTML = epillInner(e.horseName, e.lastOOG, (e.total_trips ?? c.total_trips), e.latestGO);
          sc.appendChild(btn);
        });

        // hide rollup line if no entries (should not happen in Lite, but safe)
        if (!entries.length) classCard.querySelector('.rollup_line').classList.add('is-hidden');

        gw.appendChild(classCard);
      });

      // only add ring if it has visible classes
      if (gw.children.length) ringsLiteEl.appendChild(ringSec);
    });
  }

  // ------------------------------------------------
  // Render: Full (from schedule + trip overlay)
  // ------------------------------------------------
  function renderFull(){
    ringsFullEl.innerHTML = '';

    const records = state.schedule.slice();
    records.sort((a,b) => {
      const ra = Number(a.ring_number||0), rb = Number(b.ring_number||0);
      if (ra !== rb) return ra - rb;
      const ta = Number(a.time_sort||0), tb = Number(b.time_sort||0);
      if (ta !== tb) return ta - tb;
      return String(a.class_number||'').localeCompare(String(b.class_number||''));
    });

    // group by ring
    const byRing = new Map();
    records.forEach(r => {
      const rn = Number(r.ring_number || 0);
      if (!byRing.has(rn)) byRing.set(rn, []);
      byRing.get(rn).push(r);
    });

    const rings = Array.from(byRing.keys()).sort((a,b)=>a-b);

    rings.forEach(rn => {
      const ringRows = byRing.get(rn) || [];
      if (!ringRows.length) return;

      const ringName = ringRows[0]?.ringName || `Ring ${rn}`;

      const ringSec = document.createElement('section');
      ringSec.className = 'ring_card';
      ringSec.id = `ring-full-${rn}`;
      ringSec.setAttribute('data-ring', String(rn));
      ringSec.innerHTML = `
        <div class="ring_line">
          <div class="ring_title">${esc(ringName)}</div>
          <div class="ring_actions" aria-label="Ring status">
            <button class="ring_btn ring_btn--icon${state.globalStatus==='U'?' is-on':''}" type="button" data-ring-action="soon" data-state="soon" aria-label="Soon" title="Soon">${icoClock()}</button>
            <button class="ring_btn ring_btn--icon${state.globalStatus==='L'?' is-on':''}" type="button" data-ring-action="now" data-state="now" aria-label="Now" title="Now">${icoBolt()}</button>
            <button class="ring_btn ring_btn--icon${state.globalStatus==='C'?' is-on':''}" type="button" data-ring-action="done" data-state="done" aria-label="Done" title="Done">${icoCheckCircle()}</button>
          </div>
        </div>
        <div class="group_wrap"></div>
      `;

      const gw = ringSec.querySelector('.group_wrap');

      ringRows.forEach(r => {
        const statusCode = toStatusCode(r.latestStatus);

        // global status filter
        if (state.globalStatus && statusCode !== state.globalStatus) return;

        const timeTxt = fmtStartShort(r.latestStart || '');
        const numTxt = r.class_number || '—';
        const nameTxt = r.class_name || '—';
        const subTxt = [r.class_type, r.schedule_sequencetype].filter(Boolean).join(' • ');

        // rollups: prefer rollup_entries, map to trips entries
        const rollIds = Array.isArray(r.rollup_entries) ? r.rollup_entries : [];
        const rollEntries = rollIds.map(id => state.entriesById.get(String(id))).filter(Boolean);

        // horse filter applies to rollups
        const filtered = rollEntries.filter(e => !state.activeHorse || String(e.horseName||'').trim() === state.activeHorse);

        // If horse filter is ON and no matching, hide whole class (matches Lite behavior)
        if (state.activeHorse && filtered.length === 0) return;

        const classCard = document.createElement('div');
        classCard.className = 'class_card';

        classCard.innerHTML = `
          <div class="class_line" data-full-readonly="1" data-status="${statusCode}">
            <div class="c_time">${esc(timeTxt)}</div>
            <div class="c_num">${esc(numTxt)}</div>
            <div class="c_name">
              <div class="c_name_main">${esc(nameTxt)}</div>
              <div class="c_name_sub">${esc(subTxt || '')}</div>
            </div>
          </div>
          <div class="epills"></div>
          <div class="rollup_line">
            <span class="pill">${statusIco(statusCode)} <span style="opacity:.85">${esc(statusCode||'—')}</span></span>
            <span class="pill">${esc(filtered.length)} Horses</span>
          </div>
        `;

        const scroller = classCard.querySelector('.epills');
        filtered.slice(0, 18).forEach(e => {
          const pill = document.createElement('div');
          pill.className = 'epill';
          pill.setAttribute('data-open-entry', String(e.entry_id || ''));
          pill.setAttribute('data-horse', String(e.horseName||'').trim());
          pill.innerHTML = epillInner(e.horseName, e.lastOOG, (e.total_trips ?? r.total_trips), e.latestGO);
          scroller.appendChild(pill);
        });

        gw.appendChild(classCard);
      });

      if (gw.children.length) ringsFullEl.appendChild(ringSec);
    });
  }

  function renderLiteAndFull(){
    buildHorseChips();
    renderLite();
    renderFull();
    renderPeaks();
    syncGlobalStatusButtons();
  }

  // ------------------------------------------------
  // Threads (simple list)
  // ------------------------------------------------
  function renderThreads(){
    const items = state.threads
      .slice()
      .filter(t => !t.horseName || !isHorseInactive(t.horseName))
      .sort((a,b) => String(b.observed_at||'').localeCompare(String(a.observed_at||'')));

    threadsEl.innerHTML = '';
    items.forEach(t => {
      const row = document.createElement('div');
      row.className = 'thread_row';

      const timeTxt = (t.observed_at || '').toString().replace('T',' ').slice(0,16) || '—';
      const meta = [t.ringName || (t.ring_number ? `Ring ${t.ring_number}` : ''), t.horseName].filter(Boolean).join(' • ');

      row.innerHTML = `
        <div class="thread_top">
          <div class="thread_time">${esc(timeTxt)}</div>
          <div class="thread_meta">${esc(meta)}</div>
        </div>
        <div class="thread_txt">${esc(t.message || '')}</div>
      `;
      threadsEl.appendChild(row);
    });
  }

  // ------------------------------------------------
  // Horses view (Active/Inactive list)
  // ------------------------------------------------
  function renderHorses(){
    const horses = uniq(state.trips.map(r => (r.horseName || '').trim()).filter(Boolean))
      .sort((a,b) => a.localeCompare(b));

    const active = horses.filter(h => !isHorseInactive(h));
    const inactive = horses.filter(h => isHorseInactive(h));

    horsesEl.innerHTML = '';

    const makeGroup = (title, list, isInactiveGroup) => {
      if (!list.length) return;
      const box = document.createElement('div');
      box.className = 'horse_group';

      const h = document.createElement('div');
      h.className = 'horse_group_title';
      h.textContent = title;
      box.appendChild(h);

      list.forEach(name => {
        const row = document.createElement('div');
        row.className = 'horse_row ' + (isInactiveGroup ? 'is-inactive' : 'is-active');
        row.setAttribute('data-horse-row', name);

        const nm = document.createElement('div');
        nm.className = 'horse_name';
        nm.textContent = name;

        const tg = document.createElement('div');
        tg.className = 'horse_tag';
        const dot = document.createElement('div');
        dot.className = 'horse_dot';
        tg.appendChild(dot);

        row.appendChild(nm);
        row.appendChild(tg);

        row.addEventListener('click', () => {
          toggleHorseInactive(name);
          renderHorses();
          buildHorseChips();
          renderLite();
          renderThreads();
          renderPeaks();
        });

        box.appendChild(row);
      });

      horsesEl.appendChild(box);
    };

    makeGroup('Active', active, false);
    makeGroup('Inactive', inactive, true);
  }

  // ------------------------------------------------
  // Peaks (rings)
  // ------------------------------------------------
  function renderPeaks(){
    peakbar.innerHTML = '';

    const base = proVisibleTripsForAnchors();

    // Build rings from Visible Pro body (after Pro filters/ignores)
    const ringsMap = new Map();
    base.forEach(r => {
      const rn = Number(r.ring_number || 0);
      if (!rn) return;
      const key = String(rn);
      const name = String(r.ringName || r.ring_name || '').trim();
      if (!ringsMap.has(key)) {
        ringsMap.set(key, { ring_number: rn, ringName: name || `Ring ${rn}` });
        return;
      }
      const cur = ringsMap.get(key);
      const curName = String(cur?.ringName || '').trim();
      if (name && (!curName || name.length > curName.length)) cur.ringName = name;
    });

    const rings = Array.from(ringsMap.values()).sort((a,b) => (a.ring_number||0) - (b.ring_number||0));
    rings.forEach((r, idx) => {
      const target = `#ring-${state.activeView}-${r.ring_number}`;

      // Only show actionable anchors (must exist in the current visible view)
      if (!document.querySelector(target)) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'peakbtn' + (idx===0 ? ' is-active' : '');
      const label = (r.ringName || (r.ring_number ? `Ring ${r.ring_number}` : 'Ring')).trim();
      btn.textContent = label;
      btn.setAttribute('data-peak-target', target);
      btn.addEventListener('click', () => {
        Array.from(peakbar.querySelectorAll('.peakbtn')).forEach(x => x.classList.remove('is-active'));
        btn.classList.add('is-active');
        scrollToRing(btn.getAttribute('data-peak-target'));
      });
      peakbar.appendChild(btn);
    });
  }

  // ------------------------------------------------
  // Start + Summary
  // ------------------------------------------------
  function updateStartSummary(){
    const tripsCount = state.trips.filter(r => !isHorseInactive(r.horseName)).length;
    const classCount = uniq(state.trips.filter(r => !isHorseInactive(r.horseName)).map(r => String(r.class_id||'')).filter(Boolean)).length;
    const threadsCount = state.threads.filter(t => !t.horseName || !isHorseInactive(t.horseName)).length;

    start_trips.textContent = `Trips: ${tripsCount}`;
    start_classes.textContent = `Classes: ${classCount}`;
    start_threads.textContent = `Threads: ${threadsCount}`;

    // Summary counts by status (from trips)
    const norm = state.trips.filter(r => !isHorseInactive(r.horseName));
    const under = norm.filter(r => toStatusCode(r.latestStatus) === 'L').length;
    const up = norm.filter(r => toStatusCode(r.latestStatus) === 'U').length;
    const done = norm.filter(r => toStatusCode(r.latestStatus) === 'C').length;

    sum_underway.textContent = `Underway: ${under}`;
    sum_upcoming.textContent = `Upcoming: ${up}`;
    sum_completed.textContent = `Completed: ${done}`;

    // Movers (recent threads)
    moversBody.innerHTML = '';
    state.threads
      .slice()
      .filter(t => !t.horseName || !isHorseInactive(t.horseName))
      .sort((a,b) => String(b.observed_at||'').localeCompare(String(a.observed_at||'')))
      .slice(0, 8)
      .forEach(t => {
        const row = document.createElement('div');
        row.className = 'thread_row';
        const timeTxt = (t.observed_at || '').toString().replace('T',' ').slice(0,16) || '—';
        const meta = [t.ringName || (t.ring_number ? `Ring ${t.ring_number}` : ''), t.horseName].filter(Boolean).join(' • ');
        row.innerHTML = `
          <div class="thread_top">
            <div class="thread_time">${esc(timeTxt)}</div>
            <div class="thread_meta">${esc(meta)}</div>
          </div>
          <div class="thread_txt">${esc(t.message || '')}</div>
        `;
        moversBody.appendChild(row);
      });
  }

  // ------------------------------------------------
  // Flyup (Lite clicks)
  // ------------------------------------------------
  function openFly(title, rows, smsBody){
    flyTitle.textContent = title || 'Detail';
    flyBody.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'fly_grid';
    (rows || []).forEach(({ k, v }) => {
      const kv = document.createElement('div');
      kv.className = 'kv';
      kv.innerHTML = `<div class="kv_k">${esc(k)}</div><div class="kv_v">${esc(v)}</div>`;
      grid.appendChild(kv);
    });
    flyBody.appendChild(grid);

    state.flySmsBody = smsBody || '';
    fly.classList.add('is-open');
  }
  function closeFly(){
    fly.classList.remove('is-open');
    state.flySmsBody = '';
  }

  flyClose.addEventListener('click', closeFly);
  flyBackdrop.addEventListener('click', closeFly);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFly();
  });

  // SMS (Lite only)
  // -----------------------------
  function openSms(body){
    if (!body) return;
    const url = `sms:?&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }
  flySMS.addEventListener('click', () => openSms(state.flySmsBody));

  // Open class or entry from Lite view
  document.addEventListener('click', (e) => {
    // Only allow open fly from Lite view interactions
    if (state.activeView !== 'lite') return;

    const classLine = e.target.closest('[data-open-class]');
    const entryPill = e.target.closest('[data-open-entry]');

    if (classLine){
      const classId = classLine.getAttribute('data-open-class');
      const status = classLine.getAttribute('data-status') || '';
      const classes = groupTripsToClasses();
      const c = classes.find(x => String(x.class_id) === String(classId));
      if (!c) return;

      // Build SMS body (compact)
      const ringTxt = c.ringName || (c.ring_number ? `Ring ${c.ring_number}` : 'Ring');
      const line1 = `*** ${status==='L'?'Underway':status==='U'?'Upcoming':status==='C'?'Completed':'Class'} ***`;
      const line2 = `${fmtStartShort(c.latestStart)} | ${ringTxt} | ${c.class_number || ''} ${c.class_name || ''}`.trim();
      const horses = c.entries.map(r => r.horseName).filter(Boolean).join(', ');
      const sms = [line1, line2, horses].filter(Boolean).join('\n');

      openFly(
        `Class ${c.class_number || ''}`.trim(),
        [
          { k:'Ring', v: ringTxt },
          { k:'Status', v: status || '—' },
          { k:'Start', v: c.latestStart || '—' },
          { k:'Name', v: c.class_name || '—' },
          { k:'Type', v: [c.class_type, c.schedule_sequencetype].filter(Boolean).join(' • ') || '—' },
        ],
        sms
      );
      return;
    }

    if (entryPill){
      const entryId = entryPill.getAttribute('data-open-entry') || '';
      if (!entryId) return;

      // Find the entry row (from trips)
      const r = state.entriesById.get(String(entryId));
      if (!r) return;

      const ringTxt = r.ringName || (r.ring_number ? `Ring ${r.ring_number}` : 'Ring');
      const status = toStatusCode(r.latestStatus);
      const line1 = `*** ${status==='L'?'Underway':status==='U'?'Upcoming':status==='C'?'Completed':'Entry'} ***`;
      const line2 = `${fmtStartShort(r.latestStart)} | ${ringTxt} | ${r.class_number || ''} ${r.class_name || ''}`.trim();
      const line3 = `${r.horseName || ''} (${r.lastOOG || '—'})`.trim();
      const sms = [line1, line2, line3].filter(Boolean).join('\n');

      openFly(
        r.horseName || 'Entry',
        [
          { k:'Horse', v: r.horseName || '—' },
          { k:'Ring', v: ringTxt },
          { k:'Status', v: status || '—' },
          { k:'Start', v: r.latestStart || '—' },
          { k:'GO', v: r.latestGO || '—' },
          { k:'OOG', v: r.lastOOG || '—' },
          { k:'Trips', v: String(r.total_trips ?? '—') },
          { k:'Class', v: `${r.class_number || ''} ${r.class_name || ''}`.trim() || '—' },
          { k:'Entry ID', v: String(r.entry_id || '—') },
        ],
        sms
      );
      return;
    }
  });

  // ------------------------------------------------
  // Init
  // ------------------------------------------------
  start_refresh.addEventListener('click', () => loadData(true));

  // Restore ignores and load data
  syncInactiveFromStorage();
  buildHorseChips();
  renderPeaks();
  syncGlobalStatusButtons();

  loadData(false);

})();
