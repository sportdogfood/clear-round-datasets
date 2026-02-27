/* tapactive-rings-v2.3 — app.v2_74.js
   - Data paths: RELATIVE (./data/latest/*) to avoid deployment-base issues
   - Views: Start | Summary | Lite | Full | Threads | Horses
   - Lite: interactive (class + entry flyups)
   - Full: read-only (no class/entry interactions), but SAME ring peaks + status + horse filters
*/
(function(){
  'use strict';

  // ------------------------------------------------
  // Data paths (relative to THIS page)
  //   If this page is /schedule/, these resolve to /schedule/data/latest/...
  //   Matches the prior working app.js behavior.
  // ------------------------------------------------

  // Data endpoints (try multiple bases so the app works from /schedule and /docs/schedule)
  function computeSiteBasePrefix(){
  // Works for GH project pages (/REPO/...) and root sites (/...)
  const parts = (window.location.pathname || '/').split('/').filter(Boolean);
  const first = parts[0] || '';
  // If first segment is a known app folder, assume root deployment.
  const rootFolders = { docs: true, schedule: true };
  if (!first || rootFolders[first]) return '/';
  // Otherwise treat first segment as repo name.
  return '/' + first + '/';
}

const BASE_PREFIX = computeSiteBasePrefix();

const DATA_BASE_CANDIDATES = [
  // Preferred when index is in /docs/schedule/
  './data/latest/',
  // GH project pages (repo-aware absolute)
  BASE_PREFIX + 'docs/schedule/data/latest/',
  BASE_PREFIX + 'schedule/data/latest/',
  // Root absolute fallbacks (custom domain)
  '/docs/schedule/data/latest/',
  '/schedule/data/latest/',
  '/data/latest/',
];

function urlCandidates(fileName){
  return DATA_BASE_CANDIDATES.map(base => new URL(base + fileName, window.location.href).toString());
}
const URL_TRIPS    = urlCandidates('watch_trips.json');
  const URL_SCHEDULE = urlCandidates('watch_schedule.json');
  const URL_THREADS  = urlCandidates('threads.json');
  const URL_SHOW_ACTIVE = urlCandidates('show_active.json');


  // Refresh cadence (6 minutes)
  const REFRESH_MS = 6 * 60 * 1000;

  // ------------------------------------------------
  // DOM
  // ------------------------------------------------
  const app = document.getElementById('app');
  const main = document.getElementById('main');

  const peaksWrap = document.getElementById('peaksWrap');
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
    trips: [],
    schedule: [],
    threads: [],
    showActive: [],
    showActiveById: new Map(),
    showActiveByBarn: new Map(),
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

  function fmtOog3(v){
    const s = String(v ?? "").trim();
    if (!s) return "—";
    return s.length > 3 ? s.slice(0,3) : s;
  }

  function epillInner(horseName, lastOOG, latestGO){
    const hn = trunc6(horseName || "");
    const oog = fmtOog3(lastOOG);
    const go = fmtGoShort(latestGO || "");
    return "<span class=\"epill__name\">" + esc(hn) + "</span>"
         + "<span class=\"epill__sep\">•</span>"
         + "<span class=\"epill__oog\">" + esc(oog) + "</span>"
         + "<span class=\"epill__sep\">•</span>"
         + "<span class=\"epill__time\">" + esc(go) + "</span>";
  }


  // ------------------------------------------------
  // Icons (inline SVG, currentColor)
  // ------------------------------------------------
  function icoClock(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>`;
  }
  function icoBolt(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h7l-1 8 12-14h-7l1-6z"/></svg></span>`;
  }
  function icoCheckCircle(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l2 2 6-6"/></svg></span>`;
  }
  function icoId(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M8 11h4M8 15h8"/></svg></span>`;
  }
  function icoFence(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7v13M19 7v13"/><path d="M5 10h14M5 14h14M5 18h14"/></svg></span>`;
  }
  function icoHorse(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20v-5l3-3 4 1 3-3 2 2-4 4-3-1-2 2v3"/><path d="M10 7c1.2-2.2 3.2-3.5 6-3 0 2-1 4-3 5"/></svg></span>`;
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
    if (s.includes('complete')) return 'C';
    return 'U';
  }

  function statusLabel(code){
    if (code === 'L') return 'Now';
    if (code === 'C') return 'Done';
    return 'Soon';
  }

  function badgeClass(code){
    if (code === 'L') return 'badge--underway';
    if (code === 'C') return 'badge--completed';
    return 'badge--upcoming';
  }

  function fmtWhen(d){
    try{
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return '—';
      return dt.toLocaleString([], { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    }catch(_){ return '—'; }
  }

  function getActiveRingsContainer(){
    return state.activeView === 'full' ? ringsFullEl : ringsLiteEl;
  }

  // ------------------------------------------------
  // Chrome hide/show on scroll
  // ------------------------------------------------
  let lastY = 0;
  let ticking = false;

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
    peaksWrap.hidden = !showFilters;
    horsesWrap.hidden = !showFilters;
    app.classList.toggle('filters--on', showFilters);

    topTitle.textContent = viewKey === 'lite' ? 'Lite Schedule'
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
  document.querySelectorAll('[data-global-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-global-status') || '';
      state.globalStatus = (state.globalStatus === v) ? '' : v;
      document.querySelectorAll('[data-global-status]').forEach(b => {
        b.classList.toggle('is-on', (b.getAttribute('data-global-status') === state.globalStatus) && !!state.globalStatus);
      });
      renderLiteAndFull();
    });
  });

  function buildHorseChips(){
    const horses = uniq(state.trips.map(r => (r.horseName || '').trim()).filter(Boolean))
      .sort((a,b) => a.localeCompare(b));
    horsebar.innerHTML = '';
    horses.forEach(name => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hchip';
      b.textContent = name;
      b.setAttribute('data-horse-chip', name);
      b.addEventListener('click', () => {
        state.activeHorse = (state.activeHorse === name) ? '' : name;
        Array.from(horsebar.querySelectorAll('.hchip')).forEach(x => {
          x.classList.toggle('is-on', x.getAttribute('data-horse-chip') === state.activeHorse && !!state.activeHorse);
        });
        renderLiteAndFull();
      });
      horsebar.appendChild(b);
    });
  }

  // ------------------------------------------------
  // Peaks (rings)
  // ------------------------------------------------
  function renderPeaks(){
    peakbar.innerHTML = '';

    const rings = state.ringsIndex.slice().sort((a,b) => (a.ring_number||0) - (b.ring_number||0));
    rings.forEach((r, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'peakbtn' + (idx===0 ? ' is-active' : '');
      const label = (r.ringName || r.ring_name || (r.ring_number ? `Ring ${r.ring_number}` : 'Ring')).trim();
      btn.textContent = label;
      btn.setAttribute('data-peak-target', `#ring-${state.activeView}-${r.ring_number}`);
      btn.addEventListener('click', () => {
        Array.from(peakbar.querySelectorAll('.peakbtn')).forEach(x => x.classList.remove('is-active'));
        btn.classList.add('is-active');
        scrollToRing(btn.getAttribute('data-peak-target'));
      });
      peakbar.appendChild(btn);
    });
  }

  function scrollToRing(sel){
    const container = getActiveRingsContainer();
    const scope = container.closest('.view');
    const el = scope ? scope.querySelector(sel) : null;
    if (!el) return;

    const overlay = 48 + 74 + 28; // rough topbar+peaks+gap
    const mainRect = main.getBoundingClientRect();
    const elTopInMain = el.getBoundingClientRect().top - mainRect.top + main.scrollTop;
    main.scrollTo({ top: Math.max(0, elTopInMain - overlay), behavior: 'smooth' });
  }

  // ------------------------------------------------
  // Load + index data
  // ------------------------------------------------
  async function fetchJson(url){
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  function normalizeRecords(json){
    if (Array.isArray(json?.records)) return json.records;
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    return [];
  }

  // ------------------------------------------------
  // show_active.json (horse active list)
  //   Accepts array items with keys:
  //     "Horse Id" | "HorseID" | horse_id
  //     "Barn Name" | barnName | barn_name
  //     "Horse_Active" | horse_active | active
  // ------------------------------------------------
  const SHOW_ACTIVE_LS_KEY = 'ta_show_active_overrides_v1';

  function normalizeShowActive(raw){
    const arr = Array.isArray(raw) ? raw : [];
    const overrides = readShowActiveOverrides();
    return arr.map(r => {
      const horseId = r['Horse Id'] ?? r['HorseID'] ?? r.horse_id ?? r.horseId ?? r.id ?? null;
      const barnName = (r['Barn Name'] ?? r.barnName ?? r.barn_name ?? r.name ?? '').toString().trim();
      const rawActive = r['Horse_Active'] ?? r.horse_active ?? r.active ?? null;

      const keyId = horseId != null ? String(horseId) : '';
      const keyBarn = barnName ? barnName.toLowerCase() : '';
      const ov = (keyId && overrides.byId.has(keyId)) ? overrides.byId.get(keyId)
               : (keyBarn && overrides.byBarn.has(keyBarn)) ? overrides.byBarn.get(keyBarn)
               : null;

      const active = (ov != null) ? !!ov : !!rawActive;
      return { horseId: horseId != null ? String(horseId) : '', barnName, active };
    });
  }

  function readShowActiveOverrides(){
    try{
      const txt = localStorage.getItem(SHOW_ACTIVE_LS_KEY);
      const obj = txt ? JSON.parse(txt) : {};
      const byId = new Map(Object.entries(obj.byId || {}));
      const byBarn = new Map(Object.entries(obj.byBarn || {}));
      return { byId, byBarn };
    }catch(_){
      return { byId: new Map(), byBarn: new Map() };
    }
  }

  function writeShowActiveOverrides(byId, byBarn){
    try{
      const obj = {
        byId: Object.fromEntries(byId.entries()),
        byBarn: Object.fromEntries(byBarn.entries()),
      };
      localStorage.setItem(SHOW_ACTIVE_LS_KEY, JSON.stringify(obj));
    }catch(_){}
  }

  function indexShowActive(){
    state.showActiveById = new Map();
    state.showActiveByBarn = new Map();
    state.showActive.forEach(h => {
      if (h.horseId) state.showActiveById.set(String(h.horseId), h);
      if (h.barnName) state.showActiveByBarn.set(h.barnName.toLowerCase(), h);
    });
  }

  function toggleHorseActive(rec){
    if (!rec) return;
    rec.active = !rec.active;

    // persist overrides
    const cur = readShowActiveOverrides();
    if (rec.horseId) cur.byId.set(String(rec.horseId), rec.active ? 1 : 0);
    if (rec.barnName) cur.byBarn.set(rec.barnName.toLowerCase(), rec.active ? 1 : 0);
    writeShowActiveOverrides(cur.byId, cur.byBarn);

    renderHorses();
  }

  function renderHorses(){
    if (!horsesEl) return;
    const list = (state.showActive || []).slice().sort((a,b) => (a.barnName || '').localeCompare((b.barnName || '')));
    horsesEl.innerHTML = '';

    if (!list.length){
      const empty = document.createElement('div');
      empty.className = 'panel__line';
      empty.textContent = 'No horses loaded.';
      horsesEl.appendChild(empty);
      return;
    }

    list.forEach(h => {
      const row = document.createElement('div');
      row.className = 'panel__line';

      const left = document.createElement('div');
      left.textContent = h.barnName || (h.horseId ? `Horse ${h.horseId}` : 'Horse');

      const right = document.createElement('button');
      right.type = 'button';
      right.className = 'sbtn' + (h.active ? ' is-on' : '');
      right.textContent = h.active ? 'ON' : 'OFF';
      right.addEventListener('click', (e) => { e.stopPropagation(); toggleHorseActive(h); });

      row.addEventListener('click', () => toggleHorseActive(h));

      row.appendChild(left);
      row.appendChild(right);
      horsesEl.appendChild(row);
    });
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
      state.schedule.forEach(r => add(r.ring_number, r.ringName));
    } else {
      state.trips.forEach(r => add(r.ring_number, r.ringName));
    }

    state.ringsIndex = Array.from(rings.values()).filter(r => r.ring_number > 0);
  }

  function updateStartSummary(){
    const tripsN = state.trips.length;
    const classesN = state.schedule.length;
    const threadsN = state.threads.length;

    start_status.textContent = state.errors.length ? 'Loaded (with errors)' : 'Loaded';
    start_refresh.textContent = state.lastLoadedAt ? fmtWhen(state.lastLoadedAt) : '—';
    start_trips.textContent = String(tripsN);
    start_classes.textContent = String(classesN || '—');
    start_threads.textContent = String(threadsN || '—');

    // summary counts from schedule if available else trips grouped
    const statusCounts = { U:0, L:0, C:0 };
    const source = state.schedule.length ? state.schedule : state.trips;
    const seen = new Set();
    source.forEach(r => {
      const cid = r.class_id || (r.class_number + '|' + r.ring_number + '|' + r.class_name);
      if (seen.has(cid)) return;
      seen.add(cid);
      const code = toStatusCode(r.latestStatus);
      statusCounts[code] = (statusCounts[code] || 0) + 1;
    });
    sum_underway.textContent = String(statusCounts.L || 0);
    sum_upcoming.textContent = String(statusCounts.U || 0);
    sum_completed.textContent = String(statusCounts.C || 0);

    // Top movers (reference)
    if (moversBody){
      const byEntry = new Map();
      state.trips.forEach(t => {
        const id = String(t.entry_id || '');
        if (!id) return;
        if (!byEntry.has(id)) byEntry.set(id, t);
      });

      const rows = Array.from(byEntry.values());
      rows.sort((a,b) => {
        const ra = Number(a.ring_number || 0), rb = Number(b.ring_number || 0);
        if (ra !== rb) return ra - rb;
        const oa = Number(a.runningOOG || a.lastOOG || 0), ob = Number(b.runningOOG || b.lastOOG || 0);
        if (!Number.isNaN(oa) && !Number.isNaN(ob) && oa !== ob) return oa - ob;
        return String(a.horseName||'').localeCompare(String(b.horseName||''));
      });

      moversBody.innerHTML = '';
      rows.slice(0, 12).forEach(t => {
        const horse = String(t.horseName || '—');
        const ring = String(t.ring_number ?? '—');
        const oog = (t.runningOOG != null && String(t.runningOOG) !== '') ? String(t.runningOOG)
                 : (t.lastOOG != null && String(t.lastOOG) !== '') ? String(t.lastOOG)
                 : '—';
        const go  = (t.latestGO != null && String(t.latestGO) !== '') ? String(t.latestGO) : '—';

        const line = document.createElement('div');
        line.className = 'panel__line';
        line.style.display = 'grid';
        line.style.gridTemplateColumns = 'minmax(0,1fr) 44px 52px 80px';
        line.style.gap = '10px';
        line.innerHTML = `<div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(horse)}</div><div>${esc(ring)}</div><div>${esc(oog)}</div><div><span class="t-go">${esc(go)}</span></div>`;
        moversBody.appendChild(line);
      });
    }
  }

  async function loadAll(force=false){
    state.errors = [];
    start_status.textContent = 'Loading…';

    try{
      const [tr, sc, th, ha] = await Promise.allSettled([
        fetchJsonAny(URL_TRIPS),
        fetchJsonAny(URL_SCHEDULE),
        fetchJsonAny(URL_THREADS),
        fetchJsonAny(URL_SHOW_ACTIVE),
      ]);

      if (tr.status === 'fulfilled'){
        state.trips = normalizeRecords(tr.value.json);
      } else {
        state.trips = [];
        state.errors.push(`trips: ${tr.reason?.message || tr.reason}`);
      }

      if (sc.status === 'fulfilled'){
        state.schedule = normalizeRecords(sc.value.json);
      } else {
        state.schedule = [];
        state.errors.push(`schedule: ${sc.reason?.message || sc.reason}`);
      }

      if (th.status === 'fulfilled'){
        state.threads = normalizeRecords(th.value.json);
      } else {
        state.threads = [];
        state.errors.push(`threads: ${th.reason?.message || th.reason}`);
      }

      if (ha.status === 'fulfilled'){
        state.showActive = normalizeShowActive(ha.value.json);
      } else {
        state.showActive = [];
        // show_active is optional
      }

      state.lastLoadedAt = new Date().toISOString();

      indexEntriesById();
      indexRings();
      indexShowActive();
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
      ringSec.setAttribute('data-ring-number', String(rn));

      ringSec.innerHTML = `
        <div class="ring_line">
          <div class="ring_title">${esc(ringName)}</div>
          <div class="ring_actions" aria-label="Ring status">
            <button class="ring_btn ring_btn--icon" type="button" data-ring-action="soon" data-state="soon" aria-label="Soon" title="Soon">${icoClock()}</button>
            <button class="ring_btn ring_btn--icon" type="button" data-ring-action="now" data-state="now" aria-label="Now" title="Now">${icoBolt()}</button>
            <button class="ring_btn ring_btn--icon" type="button" data-ring-action="done" data-state="done" aria-label="Done" title="Done">${icoCheckCircle()}</button>
          </div>
        </div>
        <div class="group_wrap"></div>
      `;

      const gw = ringSec.querySelector('.group_wrap');

      ringClasses.forEach(c => {
        const statusCode = toStatusCode(c.latestStatus);

        // entry filter (horse)
        const entries = c.entries.filter(e => !state.activeHorse || String(e.horseName||'').trim() === state.activeHorse);
        if (state.activeHorse && entries.length === 0) return;

        const classCard = document.createElement('div');
        classCard.className = 'class_card';
        classCard.setAttribute('data-class-id', String(c.class_id || ''));

        const timeTxt = c.latestStart || '—';
        const numTxt = c.class_number || '—';
        const nameTxt = c.class_name || '—';
        const subTxt = [c.class_type, c.schedule_sequencetype].filter(Boolean).join(' • ');

        classCard.innerHTML = `
          <div class="class_line" data-open-class="${esc(c.class_id)}">
            <div class="c_time">${esc(timeTxt)}</div>
            <div class="c_num">${esc(numTxt)}</div>
            <div class="c_name">
              <div class="c_name_main">${esc(nameTxt)}</div>
            </div>
            <div class="c_badge"><div class="badge ${badgeClass(statusCode)}"><span>${esc(statusLabel(statusCode))}</span></div></div>
          </div>
          ${entries.length ? `<div class="rollup_line"><div class="rollup_scroller"></div></div>` : ``}
        `;

        const sc = classCard.querySelector('.rollup_scroller');
        if (!sc) return classCard;

        entries.forEach(e => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'epill';
          btn.setAttribute('data-open-entry', String(e.entry_id || ''));
          btn.setAttribute('data-horse', String(e.horseName || '').trim());
          btn.innerHTML = epillInner(e.horseName, e.lastOOG, e.latestGO);
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

    Array.from(byRing.keys()).sort((a,b)=>a-b).forEach(rn => {
      const ringRows = byRing.get(rn) || [];
      const ringName = ringRows[0]?.ringName || `Ring ${rn}`;

      const ringSec = document.createElement('section');
      ringSec.className = 'ring_card';
      ringSec.id = `ring-full-${rn}`;
      ringSec.setAttribute('data-ring-number', String(rn));

      ringSec.innerHTML = `
        <div class="ring_line">
          <div class="ring_title">${esc(ringName)}</div>
          <div class="ring_actions" aria-label="Ring status">
            <button class="ring_btn ring_btn--icon" type="button" data-ring-action="soon" data-state="soon" aria-label="Soon" title="Soon">${icoClock()}</button>
            <button class="ring_btn ring_btn--icon" type="button" data-ring-action="now" data-state="now" aria-label="Now" title="Now">${icoBolt()}</button>
            <button class="ring_btn ring_btn--icon" type="button" data-ring-action="done" data-state="done" aria-label="Done" title="Done">${icoCheckCircle()}</button>
          </div>
        </div>
        <div class="group_wrap"></div>
      `;

      const gw = ringSec.querySelector('.group_wrap');

      ringRows.forEach(r => {
        const statusCode = toStatusCode(r.latestStatus);

        const timeTxt = r.latestStart || '—';
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
          <div class="class_line" data-full-readonly="1">
            <div class="c_time">${esc(timeTxt)}</div>
            <div class="c_num">${esc(numTxt)}</div>
            <div class="c_name">
              <div class="c_name_main">${esc(nameTxt)}</div>
            </div>
            <div class="c_badge"><div class="badge ${badgeClass(statusCode)}"><span>${esc(statusLabel(statusCode))}</span></div></div>
          </div>
          <div class="rollup_line"><div class="rollup_scroller"></div></div>
        `;

        const rollLine = classCard.querySelector('.rollup_line');
        const scroller = classCard.querySelector('.rollup_scroller');

        // Only show rollup line if there is anything to show
        if (!filtered.length){
          rollLine.classList.add('is-hidden');
        } else {
          filtered.forEach(e => {
            const pill = document.createElement('div');
            pill.className = 'epill epill--disabled';
            pill.setAttribute('data-horse', String(e.horseName||'').trim());
            pill.innerHTML = epillInner(e.horseName, e.lastOOG, e.latestGO);
            scroller.appendChild(pill);
          });
        }

        gw.appendChild(classCard);
      });

      if (gw.children.length) ringsFullEl.appendChild(ringSec);
    });
  }

  function renderLiteAndFull(){
    renderLite();
    renderFull();
    renderPeaks();
  }

  // ------------------------------------------------
  // Threads (simple list)
  // ------------------------------------------------
  function renderThreads(){
    const items = state.threads.slice().sort((a,b) => String(b.observed_at||'').localeCompare(String(a.observed_at||'')));
    threadsEl.innerHTML = '';
    if (!items.length){
      threadsEl.innerHTML = '<div class="panel__line"><div>No threads</div><div>—</div></div>';
      return;
    }

    items.forEach(t => {
      const row = document.createElement('div');
      row.className = 'panel__line';
      const when = t.observed_at ? fmtWhen(t.observed_at) : '—';
      const title = t.title || t.thread_type || 'Thread';
      row.innerHTML = `<div>${esc(when)} • ${esc(title)}${t.level ? ' • ' + esc(t.level) : ''}</div>`;
      const rhs = document.createElement('div');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sbtn';
      b.textContent = 'SMS';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const lines = [];
        lines.push(`*** THREAD ${when} ***`);
        lines.push(title);
        if (t.body) lines.push(String(t.body));
        openSms(lines.join('\n'));
      });
      rhs.appendChild(b);
      row.appendChild(rhs);
      threadsEl.appendChild(row);

      if (t.body){
        const body = document.createElement('div');
        body.className = 'panel__line';
        body.innerHTML = `<div style="opacity:.8">${esc(t.body)}</div><div></div>`;
        threadsEl.appendChild(body);
      }
    });
  }

  // ------------------------------------------------
  // Flyups (Lite only)
  // -----------------------------
  function openSms(body){
    if (!body) return;
    const url = 'sms:?&body=' + encodeURIComponent(String(body));
    window.location.href = url;
  }
  function openFly5(title, lines, smsBody){
    flyTitle.textContent = title || 'Details';
    flyBody.innerHTML = '';
    state.flySmsBody = smsBody || '';

    const box = document.createElement('div');
    box.className = 'fly_lines';

    (lines || []).forEach((ln) => {
      const row = document.createElement('div');
      row.className = 'fly_line';

      const specs = [
        ['c1','fly_cell fly_cell--c1'],
        ['c2','fly_cell fly_cell--c2'],
        ['c3','fly_cell fly_cell--c3'],
        ['c4','fly_cell fly_cell--c4'],
        ['c5','fly_cell fly_cell--c5'],
      ];

      specs.forEach(([k, cls]) => {
        const d = document.createElement('div');
        d.className = cls;
        const html = ln && ln[k + 'Html'];
        const val = ln && ln[k];
        if (html != null) d.innerHTML = html;
        else d.textContent = (val == null ? '' : String(val));
        row.appendChild(d);
      });

      box.appendChild(row);
    });

    flyBody.appendChild(box);
    fly.classList.add('is-open');
  }


  function closeFly(){
    fly.classList.remove('is-open');
  }

  flyClose.addEventListener('click', closeFly);
  if (flySMS) flySMS.addEventListener('click', () => openSms(state.flySmsBody));
  flyBackdrop.addEventListener('click', closeFly);

  // Event delegation for Lite clicks
  document.addEventListener('click', (e) => {
    if (state.activeView !== 'lite') return;

    const cls = e.target.closest('[data-open-class]');
    if (cls){
      const classId = cls.getAttribute('data-open-class');
      const one = state.trips.find(r => String(r.class_id) === String(classId));
      if (!one) return;

      const code = toStatusCode(one.latestStatus);
      const statusTxt = statusLabel(code);

      // Non-blocking derives (hide if missing/invalid)
      let minsTill = '';
      if (one.minsTill != null && String(one.minsTill) !== ''){
        const n = Number(one.minsTill);
        if (Number.isFinite(n) && n >= 0) minsTill = String(Math.round(n));
      } else if (one.secondsTill != null && String(one.secondsTill) !== ''){
        const n = Number(one.secondsTill);
        if (Number.isFinite(n) && n >= 0) minsTill = String(Math.max(0, Math.ceil(n/60)));
      }
      const nowHtml = (code === 'L') ? icoBolt() : '';

      const lines = [
        { c1:'', c2:(one.ring_number ?? '—'), c3:(one.ringName || '—'), c4:statusTxt, c5:(one.total_trips ?? '—') },
        { c1:'', c2:(one.latestStart || '—'), c3:(one.group_name || '—'), c4:minsTill, c5Html: nowHtml },
        { c1:'', c2:(one.class_number ?? '—'), c3:(one.class_name || '—'), c4:(one.class_type || '—'), c5:(one.schedule_sequencetype || '—') },
        { c1:'', c2:(one.completed_trips ?? '—'), c3:(one.remaining_trips ?? '—'), c4:(one.estimated_end_time || '—'), c5:'' },
      ];

      const smsBody = [
        `*** ${statusTxt.toUpperCase()} ***`,
        `${String(one.latestStart || '—')} | Ring ${String(one.ring_number ?? '—')} | #${String(one.class_number ?? '—')} ${String(one.class_name || '—')}`,
        `${String(one.group_name || '—')} | Trips: ${String(one.total_trips ?? '—')}`
      ].join('
');

      openFly5(one.class_name || 'Class', lines, smsBody);
      return;
    }

    const pill = e.target.closest('[data-open-entry]');
    if (pill){
      e.stopPropagation();
      const entryId = pill.getAttribute('data-open-entry');
      const r = state.entriesById.get(String(entryId));
      if (!r) return;

      const code = toStatusCode(r.latestStatus);
      const statusTxt = statusLabel(code);

      const entryNumber = (r.entryNumber != null && String(r.entryNumber) !== '') ? r.entryNumber : (r.entry_id ?? '—');
      const riderNumber = (r.backNumber != null && String(r.backNumber) !== '') ? r.backNumber : '—';

      const lastGoneInVal = (r.lastGoneIn != null && String(r.lastGoneIn) !== '') ? Number(r.lastGoneIn) : null;
      const stopDerives = (code === 'C') || (code === 'L' && lastGoneInVal === 1);

      let secondsTillTxt = '';
      if (!stopDerives && r.secondsTill != null && String(r.secondsTill) !== ''){
        const n = Number(r.secondsTill);
        if (Number.isFinite(n) && n >= 0) secondsTillTxt = String(Math.round(n));
      }

      // If derives are missing/invalid, leave blank (fail-soft)
      const nowHtml = (!stopDerives && code === 'L') ? icoBolt() : '';

      const metric = (r.lastTime != null && String(r.lastTime) !== '') ? r.lastTime
                   : (r.lastScore != null && String(r.lastScore) !== '') ? r.lastScore
                   : '—';

      const lines = [
        { c1:'', c2:(r.ring_number ?? '—'), c3:(r.ringName || '—'), c4:statusTxt, c5:(r.total_trips ?? '—') },
        { c1:'', c2:entryNumber, c3:(r.horseName || '—'), c4:(r.class_type || '—'), c5:(r.schedule_sequencetype || '—') },
        { c1:'', c2:riderNumber, c3:(r.riderName || '—'), c4:(r.lastOOG ?? '—'), c5:(r.latestGO || '—') },
        { c1:'', c2:(r.completed_trips ?? '—'), c3:(r.remaining_trips ?? '—'), c4:secondsTillTxt, c5Html: nowHtml },
        { c1:'', c2:(r.lastPosition ?? '—'), c3:(r.lastPlace ?? '—'), c4:metric, c5:(r.latestPlacing ?? '—') },
      ];

      const smsBody2 = [
        `*** ${statusTxt.toUpperCase()} ***`,
        `${String(r.latestGO || '—')} | Ring ${String(r.ring_number ?? '—')} | #${String(r.class_number ?? '—')} ${String(r.class_name || '—')}`,
        `${String(r.horseName || '—')} (${String(entryNumber)}) | OOG ${String(r.lastOOG ?? '—')} | GO ${String(r.latestGO || '—')}`
      ].join('
');

      openFly5(r.horseName || 'Entry', lines, smsBody2);
      return;
    }
  });

  // ------------------------------------------------
  // Boot
  // ------------------------------------------------
  setView('start');
  loadAll();

  // refresh loop
  setInterval(() => loadAll(true), REFRESH_MS);

})();