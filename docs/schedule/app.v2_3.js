/* tapactive-rings-v2.1 — app.v2_1.js
   - Data paths: RELATIVE (./data/latest/*) to avoid deployment-base issues
   - Views: Start | Summary | Lite | Full | Threads
   - Lite: interactive (class + entry flyups)
   - Full: read-only (no class/entry interactions), but SAME ring peaks + status + horse filters
*/
(function(){
  'use strict';

  // -----------------------------
  // Data paths (relative to THIS page)
  //   If this page is /schedule/, these resolve to /schedule/data/latest/...
  //   Matches the prior working app.js behavior.
  // -----------------------------

  // Data endpoints (try multiple bases so the app works from /schedule and /docs/schedule)
  const DATA_BASE_CANDIDATES = [
    './data/latest/',
    '/schedule/data/latest/',
    '/docs/schedule/data/latest/',
    './docs/schedule/data/latest/'
  ];

  function urlCandidates(filename){
    return DATA_BASE_CANDIDATES.map(base => new URL(base + filename, window.location.href).toString());
  }

  const URL_TRIPS    = urlCandidates('watch_trips.json');
  const URL_SCHEDULE = urlCandidates('watch_schedule.json');
  const URL_THREADS  = urlCandidates('threads.json');


  // Refresh cadence (6 minutes)
  const REFRESH_MS = 6 * 60 * 1000;

  // -----------------------------
  // DOM
  // -----------------------------
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
  };

  const ringsLiteEl = document.getElementById('rings_container_lite');
  const ringsFullEl = document.getElementById('rings_container_full');
  const threadsEl = document.getElementById('threads_container');

  const start_status = document.getElementById('start_status');
  const start_refresh = document.getElementById('start_refresh');
  const start_trips = document.getElementById('start_trips');
  const start_classes = document.getElementById('start_classes');
  const start_threads = document.getElementById('start_threads');

  const sum_underway = document.getElementById('sum_underway');
  const sum_upcoming = document.getElementById('sum_upcoming');
  const sum_completed = document.getElementById('sum_completed');

  // Flyup
  const fly = document.getElementById('fly');
  const flyTitle = document.getElementById('flyTitle');
  const flyBody = document.getElementById('flyBody');
  const flyClose = document.getElementById('flyClose');
  const flyBackdrop = document.getElementById('flyBackdrop');

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    activeView: 'start',
    globalStatus: '',   // '', 'U','L','C'
    activeHorse: '',    // '' or horseName
    trips: [],
    schedule: [],
    threads: [],
    entriesById: new Map(),
    ringsIndex: [], // {ring_number, ringName}
    lastLoadedAt: null,
    errors: []
  };

  // -----------------------------
  // Utilities
  // -----------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

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
    if (code === 'L') return 'Underway';
    if (code === 'C') return 'Completed';
    return 'Upcoming';
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

  // -----------------------------
  // Chrome hide/show on scroll
  // -----------------------------
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

  // -----------------------------
  // Views / nav
  // -----------------------------
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

    topTitle.textContent = viewKey === 'lite' ? 'Lite Schedule'
                       : viewKey === 'full' ? 'Full Schedule'
                       : viewKey === 'threads' ? 'Threads'
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

  btnRefresh.addEventListener('click', () => loadAll(true));
  btnBack.addEventListener('click', () => { /* reserved */ });

  // -----------------------------
  // Filters (global status + horse)
  // -----------------------------
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

  // -----------------------------
  // Peaks (rings)
  // -----------------------------
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

  // -----------------------------
  // Load + index data
  // -----------------------------
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
      if (!rings.has(key)) rings.set(key, { ring_number: n, ringName: ringName || `Ring ${n}` });
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
      buildHorseChips();
      renderPeaks();
      updateStartSummary();

      renderLiteAndFull();
      renderThreads();

      // auto switch to Lite once loaded (only if user hasn't navigated)
      if (!force && state.activeView === 'start') {
        // remain on Start
      }

    }catch(err){
      state.errors.push(String(err?.message || err));
      start_status.textContent = 'Failed';
    }
  }

  // -----------------------------
  // Render: Lite (from trips)
  // -----------------------------
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
          <div class="ring_actions">
            <button class="ring_btn" type="button" data-ring-action="top">Top</button>
            <button class="ring_btn" type="button" data-ring-action="clr">Clear</button>
          </div>
        </div>
        <div class="group_wrap"></div>
      `;

      const gw = ringSec.querySelector('.group_wrap');

      ringClasses.forEach(c => {
        const statusCode = toStatusCode(c.latestStatus);
        if (state.globalStatus && state.globalStatus !== statusCode) return;

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
            <div class="c_badge"><div class="badge ${badgeClass(statusCode)}">${esc(statusLabel(statusCode))}</div></div>
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
          btn.textContent = `${e.backNumber || e.entryNumber || '—'} • ${e.horseName || '—'} • ${e.riderName || '—'}`;
          sc.appendChild(btn);
        });

        // hide rollup line if no entries (should not happen in Lite, but safe)
        if (!entries.length) classCard.querySelector('.rollup_line').classList.add('is-hidden');

        gw.appendChild(classCard);
      });

      // ring actions
      ringSec.querySelector('[data-ring-action="top"]').addEventListener('click', () => {
        main.scrollTo({ top: 0, behavior: 'smooth' });
      });
      ringSec.querySelector('[data-ring-action="clr"]').addEventListener('click', () => {
        state.globalStatus = '';
        document.querySelectorAll('[data-global-status]').forEach(b => b.classList.remove('is-on'));
        state.activeHorse = '';
        Array.from(horsebar.querySelectorAll('.hchip')).forEach(x => x.classList.remove('is-on'));
        renderLiteAndFull();
      });

      // only add ring if it has visible classes
      if (gw.children.length) ringsLiteEl.appendChild(ringSec);
    });
  }

  // -----------------------------
  // Render: Full (from schedule + trip overlay)
  // -----------------------------
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
          <div class="ring_actions">
            <button class="ring_btn" type="button" data-ring-action="top">Top</button>
            <button class="ring_btn" type="button" data-ring-action="clr">Clear</button>
          </div>
        </div>
        <div class="group_wrap"></div>
      `;

      const gw = ringSec.querySelector('.group_wrap');

      ringRows.forEach(r => {
        const statusCode = toStatusCode(r.latestStatus);
        if (state.globalStatus && state.globalStatus !== statusCode) return;

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
            <div class="c_badge"><div class="badge ${badgeClass(statusCode)}">${esc(statusLabel(statusCode))}</div></div>
          </div>
          ${entries.length ? `<div class="rollup_line"><div class="rollup_scroller"></div></div>` : ``}
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
            pill.textContent = `${e.backNumber || e.entryNumber || '—'} • ${e.horseName || '—'} • ${e.riderName || '—'}`;
            scroller.appendChild(pill);
          });
        }

        gw.appendChild(classCard);
      });

      ringSec.querySelector('[data-ring-action="top"]').addEventListener('click', () => {
        main.scrollTo({ top: 0, behavior: 'smooth' });
      });
      ringSec.querySelector('[data-ring-action="clr"]').addEventListener('click', () => {
        state.globalStatus = '';
        document.querySelectorAll('[data-global-status]').forEach(b => b.classList.remove('is-on'));
        state.activeHorse = '';
        Array.from(horsebar.querySelectorAll('.hchip')).forEach(x => x.classList.remove('is-on'));
        renderLiteAndFull();
      });

      if (gw.children.length) ringsFullEl.appendChild(ringSec);
    });
  }

  function renderLiteAndFull(){
    renderLite();
    renderFull();
    renderPeaks();
  }

  // -----------------------------
  // Threads (simple list)
  // -----------------------------
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
      row.innerHTML = `<div>${esc(when)} • ${esc(title)}</div><div>${esc(t.level||'')}</div>`;
      threadsEl.appendChild(row);

      if (t.body){
        const body = document.createElement('div');
        body.className = 'panel__line';
        body.innerHTML = `<div style="opacity:.8">${esc(t.body)}</div><div></div>`;
        threadsEl.appendChild(body);
      }
    });
  }

  // -----------------------------
  // Flyups (Lite only)
  // -----------------------------
  function openFly(title, groups){
    flyTitle.textContent = title || 'Details';
    flyBody.innerHTML = '';

    groups.forEach(g => {
      const box = document.createElement('div');
      box.className = 'fly_group';

      g.rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'fly_row';
        row.innerHTML = `<div class="fly_l">${esc(r.l)}</div><div class="fly_r">${esc(r.r)}</div>`;
        box.appendChild(row);
      });

      flyBody.appendChild(box);
    });

    fly.classList.add('is-open');
  }

  function closeFly(){
    fly.classList.remove('is-open');
  }

  flyClose.addEventListener('click', closeFly);
  flyBackdrop.addEventListener('click', closeFly);

  // Event delegation for Lite clicks
  document.addEventListener('click', (e) => {
    if (state.activeView !== 'lite') return;

    const cls = e.target.closest('[data-open-class]');
    if (cls){
      const classId = cls.getAttribute('data-open-class');
      const one = state.trips.find(r => String(r.class_id) === String(classId));
      if (!one) return;

      const statusCode = toStatusCode(one.latestStatus);
      const groups = [
        { rows: [
          { l: 'Ring', r: one.ringName || `Ring ${one.ring_number||''}` },
          { l: 'Class', r: `${one.class_number || '—'} • ${one.class_name || '—'}` },
          { l: 'Status', r: statusLabel(statusCode) },
        ] }
      ];

      // conditional: show total_trips when present
      if (one.total_trips != null){
        groups[0].rows.push({ l: 'Trips', r: String(one.total_trips) });
      }

      // conditional: show type/sequence when present
      const meta = [one.class_type, one.schedule_sequencetype].filter(Boolean).join(' • ');
      if (meta) groups.push({ rows: [{ l: 'Type', r: meta }] });

      openFly(one.class_name || 'Class', groups);
      return;
    }

    const pill = e.target.closest('[data-open-entry]');
    if (pill){
      e.stopPropagation();
      const entryId = pill.getAttribute('data-open-entry');
      const r = state.entriesById.get(String(entryId));
      if (!r) return;

      // conditional display by class status
      const code = toStatusCode(r.latestStatus);
      const groups = [];

      const who = `${r.backNumber || r.entryNumber || '—'} • ${r.horseName || '—'}`;
      const who2 = `${r.riderName || '—'} • ${r.barnName || '—'}`.replace(/\s•\s—$/, '');
      groups.push({ rows: [
        { l: 'Entry', r: who },
        { l: 'Rider', r: who2 },
        { l: 'Status', r: statusLabel(code) },
      ]});

      // Progress (Underway/Completed)
      if (code === 'L' || code === 'C'){
        const prog = [];
        if (r.runningOOG != null) prog.push({ l: 'Running OOG', r: String(r.runningOOG) });
        if (r.lastOOG != null) prog.push({ l: 'Last OOG', r: String(r.lastOOG) });
        if (r.latestGO) prog.push({ l: 'Latest GO', r: String(r.latestGO) });
        if (prog.length) groups.push({ rows: prog });
      } else {
        // Upcoming: only show latestGO if present
        if (r.latestGO) groups.push({ rows: [{ l: 'Latest GO', r: String(r.latestGO) }] });
      }

      // Results (Completed only)
      if (code === 'C'){
        const res = [];
        if (r.lastPlace != null) res.push({ l: 'Place', r: String(r.lastPlace) });
        if (r.latestPlacing != null) res.push({ l: 'Placing', r: String(r.latestPlacing) });

        // score OR time (not both)
        if (r.lastScore != null && String(r.lastScore) !== '') res.push({ l: 'Score', r: String(r.lastScore) });
        else if (r.lastTime != null && String(r.lastTime) !== '') res.push({ l: 'Time', r: String(r.lastTime) });

        if (res.length) groups.push({ rows: res });
      }

      openFly(r.horseName || 'Entry', groups);
      return;
    }
  });

  // -----------------------------
  // Boot
  // -----------------------------
  setView('start');
  loadAll();

  // refresh loop
  setInterval(() => loadAll(true), REFRESH_MS);

})();