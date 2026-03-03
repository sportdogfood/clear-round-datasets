/* tapactive-rings-v2.3 — app.v2_78.js
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


  // Refresh cadence (6 minutes)
  const REFRESH_MS = 6 * 60 * 1000;

  // ------------------------------------------------
  // DOM
  // ------------------------------------------------
  const app = document.getElementById('app');
  const main = document.getElementById('main');

  const statusWrap = document.getElementById('statusWrap');
  const peaksWrap = document.getElementById('peaksWrap');
  const horsesWrap = document.getElementById('horsesWrap');
  const peakbar = document.getElementById('peakbar');
  const horsebar = document.getElementById('horsebar');
  const groombar = document.getElementById('groombar');

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
  const startRowPro = document.getElementById('startRowPro');
  const startRowHorses = document.getElementById('startRowHorses');
  const startDetailsTap = document.getElementById('startDetailsTap');
  const timeContainer = document.getElementById('time_container');

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
    activeGroom: '',    // '' or groomName
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
    const tot = fmtTrips2(totalTrips);
    const go = fmtGoShort(latestGO || "");
    const oogTot = `${oog}/${tot}`;
    return "<span class=\"epill__name\">" + esc(hn) + "</span>"
         + "<span class=\"epill__sep\">•</span>"
         + "<span class=\"epill__oog\">" + esc(oogTot) + "</span>"
         + "<span class=\"epill__sep\">•</span>"
         + "<span class=\"epill__time\">" + esc(go) + "</span>";
  }


  
  function classTypeTag(classType){
    const s = String(classType || '').trim().toLowerCase();
    if (!s) return '';
    if (s.startsWith('hunter')) return 'HUN';
    if (s.startsWith('jumper')) return 'JMP';
    if (s.startsWith('equit')) return 'EQ';
    return String(classType).trim().slice(0,3).toUpperCase();
  }

  function badgeInner(statusCode){
    return statusIco(statusCode);
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

    // Bars:
    //  - Status only on Pro (lite)
    //  - Peaks on Pro + Full
    //  - Groom/Horse chips on Pro + Full + Time (summary)
    const showPeaks = (viewKey === 'lite' || viewKey === 'full');
    const showChips = (viewKey === 'lite' || viewKey === 'full' || viewKey === 'summary');
    statusWrap.hidden = (viewKey !== 'lite');
    peaksWrap.hidden  = !showPeaks;
    horsesWrap.hidden = !showChips;
    app.classList.toggle('filters--on', showChips);

    topTitle.textContent = viewKey === 'lite' ? 'Lite Schedule'
                       : viewKey === 'full' ? 'Full Schedule'
                       : viewKey === 'threads' ? 'Threads'
                       : viewKey === 'horses' ? 'Horses'
                       : viewKey === 'summary' ? 'Time'
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

  // Start quick actions
  if (startRowPro){
    const goPro = () => { setView('lite'); main.scrollTo({ top: 0, behavior: 'smooth' }); };
    startRowPro.addEventListener('click', goPro);
    startRowPro.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goPro(); } });
  }
  if (startRowHorses){
    const goHorses = () => { setView('horses'); main.scrollTo({ top: 0, behavior: 'smooth' }); };
    startRowHorses.addEventListener('click', goHorses);
    startRowHorses.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHorses(); } });
  }
  if (startDetailsTap){
    const toggleDetails = () => {
      if (fly.classList.contains('is-open')) { closeFly(); return; }
      openFly5('Start', [
        { c1:'Status', c2: start_status?.textContent || '—' },
        { c1:'Last refresh', c2: start_refresh?.textContent || '—' },
        { c1:'Trips', c2: start_trips?.textContent || '—' },
        { c1:'Full classes', c2: start_classes?.textContent || '—' },
        { c1:'Threads', c2: start_threads?.textContent || '—' },
      ]);
    };
    startDetailsTap.addEventListener('click', toggleDetails);
    startDetailsTap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDetails(); } });
  }

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

  function buildHorseChips(){
    // Visible Pro body base for selectors:
    // - always apply inactive horses
    // - apply global status only on Pro (lite)
    const applyStatus = (state.activeView === 'lite');
    let base = state.trips.filter(t => !isHorseInactive(t.horseName));
    if (applyStatus && state.globalStatus){
      base = base.filter(t => toStatusCode(t.latestStatus) === state.globalStatus);
    }

    // Groom chips (exclude activeGroom so selector remains usable; include activeHorse to stay relevant)
    let baseForGrooms = base;
    if (state.activeHorse){
      baseForGrooms = baseForGrooms.filter(t => String(t.horseName||'').trim() === state.activeHorse);
    }
    const grooms = uniq(baseForGrooms.map(t => String(t.groomName || t.groom_name || t.groom || '').trim()).filter(Boolean))
      .sort((a,b) => a.localeCompare(b));
    if (groombar){
      groombar.innerHTML = '';
      groombar.hidden = (grooms.length === 0);
      grooms.forEach(name => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hchip' + ((state.activeGroom === name && state.activeGroom) ? ' is-on' : '');
        b.textContent = name;
        b.setAttribute('data-groom-chip', name);
        b.addEventListener('click', () => {
          state.activeGroom = (state.activeGroom === name) ? '' : name;
          renderLiteAndFull();
        });
        groombar.appendChild(b);
      });
    }

    // Horse chips (exclude activeHorse so selector remains usable; include activeGroom to stay relevant)
    let baseForHorses = base;
    if (state.activeGroom){
      baseForHorses = baseForHorses.filter(t => String(t.groomName || t.groom_name || t.groom || '').trim() === state.activeGroom);
    }
    const horses = uniq(baseForHorses.map(t => String(t.horseName || '').trim()).filter(Boolean))
      .sort((a,b) => a.localeCompare(b));
    horsebar.innerHTML = '';
    horses.forEach(name => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hchip' + ((state.activeHorse === name && state.activeHorse) ? ' is-on' : '');
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
    // only meaningful in Lite/Full
    if (!(state.activeView === 'lite' || state.activeView === 'full')) return;
    const act = btn.getAttribute('data-ring-action') || '';
    const code = act === 'soon' ? 'U' : act === 'now' ? 'L' : act === 'done' ? 'C' : '';
    if (!code) return;
    state.globalStatus = (state.globalStatus === code) ? '' : code;
    syncGlobalStatusButtons();
    renderLiteAndFull();
  });

// ------------------------------------------------
  // Peaks (rings)
  // ------------------------------------------------
  function renderPeaks(){
    peakbar.innerHTML = '';

    const container = getActiveRingsContainer();
    const scope = container ? container.closest('.view') : null;
    if (!scope) return;

    const cards = Array.from(scope.querySelectorAll(`section.ring_card[id^="ring-${state.activeView}-"]`));
    cards.forEach((card, idx) => {
      const id = card.getAttribute('id') || '';
      const m = id.match(/ring-[^-]+-(\d+)/);
      const rn = m ? m[1] : '';
      if (!rn) return;
      const titleEl = card.querySelector('.ring_title');
      const label = (titleEl ? titleEl.textContent : `Ring ${rn}`).trim();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'peakbtn' + (idx===0 ? ' is-active' : '');
      btn.textContent = label;
      btn.setAttribute('data-peak-target', `#ring-${state.activeView}-${rn}`);
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
  // Pro horse ignores (derived from watch_trips)
  //   - Horses list = unique trips.horseName values (this schedule only)
  //   - Default: all ACTIVE
  //   - User toggles to INACTIVE; Pro (Lite) + Threads hide inactive horses
  // ------------------------------------------------
  const HORSE_IGNORE_LS_KEY = 'ta_horse_ignore_v1';

  function horseKey(name){
    return String(name || '').trim().toLowerCase();
  }

  function readInactiveHorses(){
    try{
      const txt = localStorage.getItem(HORSE_IGNORE_LS_KEY);
      const obj = txt ? JSON.parse(txt) : {};
      const arr = Array.isArray(obj.inactive) ? obj.inactive : [];
      return new Set(arr.map(horseKey).filter(Boolean));
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
    const k = horseKey(name);
    if (!k) return;
    setHorseInactive(name, !state.inactiveHorses.has(k));
  }

  function deriveHorseNames(){
    return uniq(state.trips.map(t => String(t.horseName || '').trim()).filter(Boolean))
      .sort((a,b) => a.localeCompare(b));
  }

  function icoCircle(){
    return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg></span>`;
  }

  function renderHorses(){
    if (!horsesEl) return;
    syncInactiveFromStorage();

    const q = String(state.horseSearch || '').trim().toLowerCase();
    let names = deriveHorseNames();
    if (q){
      names = names.filter(n => n.toLowerCase().includes(q));
    }

    const active = [];
    const inactive = [];
    names.forEach(n => (isHorseInactive(n) ? inactive : active).push(n));

    horsesEl.innerHTML = '';

    const sw = document.createElement('div');
    sw.className = 'horse_search';
    const inp = document.createElement('input');
    inp.className = 'horse_input';
    inp.type = 'search';
    inp.placeholder = 'Search horses…';
    inp.value = state.horseSearch || '';
    inp.addEventListener('input', () => {
      state.horseSearch = inp.value;
      renderHorses();
    });
    sw.appendChild(inp);
    horsesEl.appendChild(sw);

    if (!names.length){
      const empty = document.createElement('div');
      empty.className = 'panel__line';
      empty.textContent = 'No horses in this schedule.';
      horsesEl.appendChild(empty);
      return;
    }

    const makeGroup = (label, list, isOff) => {
      const h = document.createElement('div');
      h.className = 'horse_group_title';
      h.textContent = label;
      horsesEl.appendChild(h);

      const box = document.createElement('div');
      box.className = 'horse_list';

      list.forEach(name => {
        const row = document.createElement('div');
        row.className = 'horse_row';

        const nm = document.createElement('div');
        nm.className = 'horse_name';
        nm.textContent = name;
        const tg = document.createElement('div');
        tg.className = 'horse_toggle' + (isOff ? ' is-off' : ' is-on');
        const dot = document.createElement('div');
        dot.className = 'horse_dot';
        tg.appendChild(dot);

        row.appendChild(nm);
        row.appendChild(tg);

        row.addEventListener('click', () => {
          toggleHorseInactive(name);
          renderHorses();
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
    if (sum_underway) sum_underway.textContent = String(statusCounts.L || 0);
    if (sum_upcoming) sum_upcoming.textContent = String(statusCounts.U || 0);
    if (sum_completed) sum_completed.textContent = String(statusCounts.C || 0);

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
      const [tr, sc, th] = await Promise.allSettled([
        fetchJsonAny(URL_TRIPS),
        fetchJsonAny(URL_SCHEDULE),
        fetchJsonAny(URL_THREADS),
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

      state.lastLoadedAt = new Date().toISOString();

      indexEntriesById();
      indexRings();
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
        const entries = c.entries
          .filter(e => !isHorseInactive(e.horseName))
          .filter(e => !state.activeGroom || String(e.groomName || e.groom_name || e.groom || '').trim() === state.activeGroom)
          .filter(e => !state.activeHorse || String(e.horseName||'').trim() === state.activeHorse);
        if ((state.activeHorse || state.activeGroom) && entries.length === 0) return;

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
            </div>
            <div class="c_tag">${esc(classTypeTag(c.class_type))}</div>
            <div class="c_badge"><div class="badge ${badgeClass(statusCode)}">${badgeInner(statusCode)}</div></div>
          </div>
          ${entries.length ? `<div class="rollup_line"><div class="rollup_scroller"></div></div>` : ``}
        `;

        const sc = classCard.querySelector('.rollup_scroller');
        if (!sc) return classCard;

        entries.forEach(e => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'epill';
          btn.setAttribute('data-status', statusCode);
          btn.setAttribute('data-open-entry', String(e.entry_id || ''));
          btn.setAttribute('data-horse', String(e.horseName || '').trim());
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

        // Full ignores global status (watch_schedule has no class_status)

        const timeTxt = fmtStartShort(r.latestStart || '');
        const numTxt = r.class_number || '—';
        const nameTxt = r.class_name || '—';
        const subTxt = [r.class_type, r.schedule_sequencetype].filter(Boolean).join(' • ');

        // rollups: prefer rollup_entries, map to trips entries
        const rollIds = Array.isArray(r.rollup_entries) ? r.rollup_entries : [];
        const rollEntries = rollIds.map(id => state.entriesById.get(String(id))).filter(Boolean);

        // horse filter applies to rollups
        const filtered = rollEntries
          .filter(e => !state.activeGroom || String(e.groomName || e.groom_name || e.groom || '').trim() === state.activeGroom)
          .filter(e => !state.activeHorse || String(e.horseName||'').trim() === state.activeHorse);
        if ((state.activeHorse || state.activeGroom) && filtered.length === 0) return;
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
            </div>
            <div class="c_tag">${esc(classTypeTag(r.class_type))}</div>
            <div class="c_badge"><div class="badge ${badgeClass(statusCode)}">${badgeInner(statusCode)}</div></div>
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
            pill.setAttribute('data-status', statusCode);
            pill.setAttribute('data-horse', String(e.horseName||'').trim());
            pill.innerHTML = epillInner(e.horseName, e.lastOOG, (e.total_trips ?? r.total_trips), e.latestGO);
            scroller.appendChild(pill);
          });
        }

        gw.appendChild(classCard);
      });

      if (gw.children.length) ringsFullEl.appendChild(ringSec);
    });
  }

  function renderLiteAndFull(){
    buildHorseChips();
    renderLite();
    renderFull();

    // Time view (flattened Pro-like list, no ring grouping)
    if (timeContainer){
      timeContainer.innerHTML = '';
      const classes = groupTripsToClasses().slice();
      classes.sort((a,b) => {
        const ta = Number(a.time_sort || 0), tb = Number(b.time_sort || 0);
        if (ta !== tb) return ta - tb;
        const ra = Number(a.ring_number || 0), rb = Number(b.ring_number || 0);
        if (ra !== rb) return ra - rb;
        return String(a.class_number||'').localeCompare(String(b.class_number||''));
      });

      classes.forEach(c => {
        const statusCode = toStatusCode(c.latestStatus);
        const entries = c.entries
          .filter(e => !isHorseInactive(e.horseName))
          .filter(e => !state.activeGroom || String(e.groomName || e.groom_name || e.groom || '').trim() === state.activeGroom)
          .filter(e => !state.activeHorse || String(e.horseName||'').trim() === state.activeHorse);

        if (!entries.length) return;

        const classCard = document.createElement('div');
        classCard.className = 'class_card';
        classCard.setAttribute('data-class-id', String(c.class_id || ''));

        const timeTxt = fmtStartShort(c.latestStart || '');
        const numTxt = c.class_number || '—';
        const nameTxt = c.class_name || '—';
        const tagTxt = String(c.ring_number || '').trim() || '—';

        classCard.innerHTML = `
          <div class="class_line" data-open-class="${esc(c.class_id)}" data-status="${statusCode}">
            <div class="c_time">${esc(timeTxt)}</div>
            <div class="c_num">${esc(numTxt)}</div>
            <div class="c_name">
              <div class="c_name_main">${esc(nameTxt)}</div>
            </div>
            <div class="c_tag">${esc(tagTxt)}</div>
            <div class="c_badge"><div class="badge ${badgeClass(statusCode)}">${badgeInner(statusCode)}</div></div>
          </div>
          ${entries.length ? `<div class="rollup_line"><div class="rollup_scroller"></div></div>` : ``}
        `;

        const sc = classCard.querySelector('.rollup_scroller');
        if (sc){
          entries.forEach(e => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'epill';
            btn.setAttribute('data-status', statusCode);
            btn.setAttribute('data-open-entry', String(e.entry_id || ''));
            btn.setAttribute('data-horse', String(e.horseName || '').trim());
            btn.innerHTML = epillInner(e.horseName, e.lastOOG, (e.total_trips ?? c.total_trips), e.latestGO);
            sc.appendChild(btn);
          });
        }

        timeContainer.appendChild(classCard);
      });
    }

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

      let lines = [
        { c1:'RING', c2:(one.ring_number ?? '—'), c3:(one.ringName || '—'), c4:statusTxt, c5:(one.total_trips ?? '—') },
        { c1:'START', c2:(fmtStartShort(one.latestStart || '')), c3:(one.group_name || '—'), c4:minsTill, c5Html: nowHtml },
        { c1:'CLASS', c2:(one.class_number ?? '—'), c3:(one.class_name || '—'), c4:(one.class_type || '—'), c5:(one.schedule_sequencetype || '—') },
        { c1:'TRIPS', c2:(one.completed_trips ?? '—'), c3:(one.remaining_trips ?? '—'), c4:(one.estimated_end_time || '—'), c5:'' },
      ];

      const smsBody = [
        `*** ${statusTxt.toUpperCase()} ***`,
        `Start ${fmtStartShort(one.latestStart || '') || '—'} | ${String(one.ringName || ('Ring ' + (one.ring_number ?? '—')))} | #${String(one.class_number ?? '—')}`
      ].join('\n');

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

      const djGo = (r.dj_go_dt5 != null && String(r.dj_go_dt5) !== '') ? String(r.dj_go_dt5) : '';

      const entryNumber = (r.entryNumber != null && String(r.entryNumber) !== '') ? r.entryNumber : (r.entry_id ?? '—');
      const riderNumber = (r.backNumber != null && String(r.backNumber) !== '') ? r.backNumber : '—';

      const lastGoneInVal = (r.lastGoneIn != null && String(r.lastGoneIn) !== '') ? Number(r.lastGoneIn) : null;
      const stopDerives = (code === 'C') || (code === 'L' && lastGoneInVal === 1);

      let secondsTillTxt = '';
      if (!stopDerives && r.secondsTill != null && String(r.secondsTill) !== ''){
        const n = Number(r.secondsTill);
        if (Number.isFinite(n)) secondsTillTxt = String(Math.round(n));
      }

      // If derives are missing/invalid, leave blank (fail-soft)
      const nowHtml = (!stopDerives && code === 'L') ? icoBolt() : '';

      const metric = (r.lastTime != null && String(r.lastTime) !== '') ? r.lastTime
                   : (r.lastScore != null && String(r.lastScore) !== '') ? r.lastScore
                   : '—';

      const lines = [
        { c1:'RING', c2:(r.ring_number ?? '—'), c3:(r.ringName || '—'), c4:statusTxt, c5:(r.total_trips ?? '—') },
        { c1:'ENTRY', c2:entryNumber, c3:(r.horseName || '—'), c4:(r.class_type || '—'), c5:(r.schedule_sequencetype || '—') },
        { c1:'RIDER', c2:riderNumber, c3:(r.riderName || '—'), c4:(r.lastOOG ?? '—'), c5:(fmtGoShort(r.latestGO || '')) },
        { c1:'TRIPS', c2:(r.completed_trips ?? '—'), c3:(r.remaining_trips ?? '—'), c4:secondsTillTxt, c5Html: nowHtml },
        { c1:'RESULT', c2:(r.lastPosition ?? '—'), c3:(r.lastPlace ?? '—'), c4:metric, c5:(r.latestPlacing ?? '—') },
      ];
      if (djGo){
        // Insert DJ go diagnostic row above RESULT (fail-soft)
        lines = lines.slice(0,4).concat([{ c1:'DJGO', c2:'', c3:'', c4:djGo, c5:'' }], lines.slice(4));
      }

      const smsBody2 = [
        `*** ${statusTxt.toUpperCase()} ***`,
        `GO ${fmtGoShort(r.latestGO || '') || '—'} | ${String(r.ringName || ('Ring ' + (r.ring_number ?? '—')))} | ${String(r.horseName || '—')}`
      ].join('\n');

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