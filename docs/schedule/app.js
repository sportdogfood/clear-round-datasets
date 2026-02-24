/* Ring Status — Lite + Full
   - Ring peaks show ringName
   - Class lines are 4 divs: time | class_number | class_name | badge
   - Rollup line only renders when entries exist (no empty line)
   - Full keeps ring + barn filters same as Lite
*/

(() => {
   const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
 

  const el = {
    topTitle: document.getElementById('topTitle'),
    peakbar: document.getElementById('peakbar'),
    horsebar: document.getElementById('horsebar'),
    rings: document.getElementById('rings_container'),
    navGrid: document.getElementById('navGrid'),
    fly: document.getElementById('fly'),
    flyTitle: document.getElementById('flyTitle'),
    flyRows: document.getElementById('flyRows'),
    flyClose: document.getElementById('flyClose'),
  };

  const state = {
    view: 'lite',
    activeRing: null, // ring_number
    activeBarn: null, // barnName
    data: { schedule: [], trips: [] },
    index: {
      rings: [],
      tripsByClass: new Map(), // class_id -> trips[]
      barns: [],
      scheduleByRing: new Map(), // ring_number -> schedule[]
    }
  };

  //////////////////////
  // Small utilities
  //////////////////////

  const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

  function statusCode(statusText){
    const s = String(statusText || '').toLowerCase();
    if (!s) return 'U';
    if (s.includes('complete')) return 'C';
    if (s.includes('live') || s.includes('underway') || s.includes('in progress')) return 'L';
    if (s.includes('running')) return 'L';
    return 'U';
  }

  function byRingAndTime(a,b){
    const ra = Number(a.ring_number||0), rb = Number(b.ring_number||0);
    if (ra !== rb) return ra - rb;

    // latestStart can be null; if present, sort by it (HH:MM AM)
    const ta = timeToMinutes(a.latestStart), tb = timeToMinutes(b.latestStart);
    if (ta !== tb) return ta - tb;

    // fallback: class_number numeric
    const ca = Number(a.class_number||0), cb = Number(b.class_number||0);
    return ca - cb;
  }

  function timeToMinutes(t){
    if (!t) return 9e9;
    const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!m) return 9e9;
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && hh !== 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    return hh*60 + mm;
  }

  function escapeHtml(str){
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function uniq(arr){
    return Array.from(new Set(arr));
  }

  //////////////////////
  // Data
  //////////////////////

  async function loadJSON(url){
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.json();
  }

  async function loadData(){
    const [schedule, trips] = await Promise.all([loadJSON(URL_SCHEDULE), loadJSON(URL_TRIPS)]);
    state.data.schedule = Array.isArray(schedule?.records) ? schedule.records : [];
    state.data.trips = Array.isArray(trips?.records) ? trips.records : [];
    buildIndex();
  }

  function buildIndex(){
    const schedule = state.data.schedule;
    const trips = state.data.trips;

    // trips by class
    const tmap = new Map();
    for (const t of trips){
      const cid = t.class_id;
      if (cid == null) continue;
      if (!tmap.has(cid)) tmap.set(cid, []);
      tmap.get(cid).push(t);
    }
    // stable sort within a class: latestGO then barnName
    for (const [cid, list] of tmap.entries()){
      list.sort((a,b) => {
        const ga = timeToMinutes(a.latestGO), gb = timeToMinutes(b.latestGO);
        if (ga !== gb) return ga - gb;
        return String(a.barnName||'').localeCompare(String(b.barnName||''));
      });
    }

    // schedule by ring
    const sByRing = new Map();
    for (const s of schedule){
      const rn = Number(s.ring_number || 0);
      if (!sByRing.has(rn)) sByRing.set(rn, []);
      sByRing.get(rn).push(s);
    }
    for (const [rn, list] of sByRing.entries()){
      list.sort(byRingAndTime);
    }

    // rings list (prefer schedule; fallback to trips)
    const ringTuples = [];
    for (const s of schedule){
      if (s.ring_number == null) continue;
      ringTuples.push({ ring_number: Number(s.ring_number), ringName: s.ringName || `Ring ${s.ring_number}` });
    }
    if (!ringTuples.length){
      for (const t of trips){
        if (t.ring_number == null) continue;
        ringTuples.push({ ring_number: Number(t.ring_number), ringName: t.ringName || `Ring ${t.ring_number}` });
      }
    }
    const ringMap = new Map();
    for (const r of ringTuples){
      if (!ringMap.has(r.ring_number)) ringMap.set(r.ring_number, r.ringName);
    }
    const rings = Array.from(ringMap.entries())
      .map(([ring_number, ringName]) => ({ ring_number, ringName }))
      .sort((a,b) => a.ring_number - b.ring_number);

    // barns list
    const barns = uniq(trips.map(t => String(t.barnName||'').trim()).filter(Boolean))
      .sort((a,b) => a.localeCompare(b));

    state.index.tripsByClass = tmap;
    state.index.scheduleByRing = sByRing;
    state.index.rings = rings;
    state.index.barns = barns;

    // Default active ring: first ring
    if (state.activeRing == null && rings.length) state.activeRing = rings[0].ring_number;
  }

  //////////////////////
  // Rendering
  //////////////////////

  function render(){
    el.topTitle.textContent = state.view === 'full' ? 'Full' : (state.view === 'lite' ? 'Lite' : capitalize(state.view));

    // nav
    for (const b of el.navGrid.querySelectorAll('.nav-btn')){
      b.classList.toggle('is-active', b.dataset.view === state.view);
    }

    renderPeaks();
    renderHorsebar();
    renderRings();
  }

  function capitalize(s){
    return String(s||'').slice(0,1).toUpperCase() + String(s||'').slice(1);
  }

  function renderPeaks(){
    const rings = state.index.rings;
    el.peakbar.innerHTML = rings.map(r => {
      const active = state.activeRing === r.ring_number ? ' is-active' : '';
      const label = escapeHtml(r.ringName || `Ring ${r.ring_number}`);
      return `<button class="pill${active}" type="button" data-ring="${r.ring_number}">${label}</button>`;
    }).join('');
  }

  function renderHorsebar(){
    const barns = state.index.barns;
    if (!barns.length){
      el.horsebar.innerHTML = '';
      return;
    }

    const btnAll = `<button class="pill${state.activeBarn ? '' : ' is-active'}" type="button" data-barn="">All</button>`;
    const btns = barns.map(name => {
      const active = state.activeBarn === name ? ' is-active' : '';
      return `<button class="pill${active}" type="button" data-barn="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
    }).join('');

    el.horsebar.innerHTML = btnAll + btns;
  }

  function renderRings(){
    const rings = state.index.rings;
    const sByRing = state.index.scheduleByRing;

    const parts = [];

    for (const r of rings){

      const ringSchedule = sByRing.get(r.ring_number) || [];

      // Lite: only classes that have trips, or have a status/time
      let classes = ringSchedule;
      if (state.view === 'lite'){
        classes = ringSchedule.filter(s => {
          const hasTrips = state.index.tripsByClass.has(s.class_id);
          const hasStatusOrTime = !isBlank(s.latestStatus) || !isBlank(s.latestStart);
          return hasTrips || hasStatusOrTime;
        });
      }

      // Apply barn filter at class-level (if set)
      if (state.activeBarn){
        classes = classes.filter(s => {
          const trips = (state.index.tripsByClass.get(s.class_id) || []).filter(t => t.barnName === state.activeBarn);
          return trips.length > 0;
        });
      }

      // If Full and no schedule records for ring, build from trips
      if (!ringSchedule.length){
        const tripClasses = buildClassesFromTrips(r.ring_number);
        classes = state.view === 'full' ? tripClasses : tripClasses;
      }

      const ringBody = classes.length ? classes.map(s => renderClassBlock(s)).join('')
                                     : `<div class="empty">No items for this ring.</div>`;

      parts.push(`
        <section class="ring" id="ring-${r.ring_number}">
          <div class="ring_top">
            <div class="ring_title">${escapeHtml(r.ringName || `Ring ${r.ring_number}`)}</div>
            <div></div>
          </div>
          <div class="ring_body">${ringBody}</div>
        </section>
      `);
    }

    el.rings.innerHTML = parts.join('') || `<div class="empty">No schedule data.</div>`;

    // click wiring (event delegation)
    wireRingsDelegated();
  }

  function buildClassesFromTrips(ringNumber){
    const trips = state.data.trips.filter(t => Number(t.ring_number||0) === Number(ringNumber||0));
    const byClass = new Map();
    for (const t of trips){
      const cid = t.class_id;
      if (!byClass.has(cid)){
        byClass.set(cid, {
          ring_number: Number(t.ring_number||0),
          ringName: t.ringName || `Ring ${t.ring_number}`,
          class_id: cid,
          class_number: t.class_number,
          class_name: t.class_name,
          latestStart: t.latestStart,
          latestStatus: t.latestStatus,
          total_trips: 0,
        });
      }
      byClass.get(cid).total_trips += 1;
    }
    return Array.from(byClass.values()).sort(byRingAndTime);
  }

  function renderClassBlock(s){
    const cid = s.class_id;
    const tripsAll = state.index.tripsByClass.get(cid) || [];
    const trips = state.activeBarn ? tripsAll.filter(t => t.barnName === state.activeBarn) : tripsAll;

    const sc = statusCode(s.latestStatus || (trips[0]?.latestStatus));
    const time = s.latestStart || '';
    const num = s.class_number || '';
    const name = s.class_name || s.group_name || '';

    const classLine = `
      <button class="class_line" type="button" data-kind="class" data-class-id="${cid}" data-status="${sc}">
        <div class="cl_time">${escapeHtml(time)}</div>
        <div class="cl_num">${escapeHtml(num)}</div>
        <div class="cl_name">${escapeHtml(name)}</div>
        <div class="cl_badge"><div class="badge_dot" aria-hidden="true"></div></div>
      </button>
    `;

    // Rollup: only render if there are entries
    const rollup = trips.length ? `
      <div class="rollup_line" data-kind="rollup" data-class-id="${cid}">
        <div class="rl_time"></div>
        <div class="rl_num"></div>
        <div class="rl_scroller">
          ${trips.map(t => {
            const label = `${t.barnName || ''} • ${t.lastOOG ?? ''} • ${t.latestGO || ''}`.replace(/\s+•\s+•\s+/g,' • ').trim();
            return `<button class="entry_pill" type="button" data-kind="entry" data-trip-id="${t.trip_id}">${escapeHtml(label)}</button>`;
          }).join('')}
        </div>
        <div class="rl_badge"></div>
      </div>
    ` : '';

    // In Full view: keep class line even if no rollup; rollup is empty string (no empty line)
    // In Lite view: same
    return classLine + rollup;
  }

  function wireRingsDelegated(){
    // Peaks
    el.peakbar.onclick = (e) => {
      const btn = e.target.closest('button[data-ring]');
      if (!btn) return;
      const ring = Number(btn.dataset.ring);
      state.activeRing = ring;
      // Update peaks only (avoid rebuilding the whole list just to highlight)
      for (const b of el.peakbar.querySelectorAll('button[data-ring]')){
        b.classList.toggle('is-active', Number(b.dataset.ring) === ring);
      }
      const target = document.getElementById(`ring-${ring}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Barn filter
    el.horsebar.onclick = (e) => {
      const btn = e.target.closest('button[data-barn]');
      if (!btn) return;
      const barn = btn.dataset.barn || '';
      state.activeBarn = barn ? barn : null;
      render();
    };

    // Class/Entry clicks
    el.rings.onclick = (e) => {
      const entryBtn = e.target.closest('button[data-kind="entry"]');
      if (entryBtn){
        if (state.view !== 'lite') return; // Full: no interactions
        const tripId = Number(entryBtn.dataset.tripId);
        const trip = state.data.trips.find(t => Number(t.trip_id) === tripId);
        if (trip) openEntryFly(trip);
        return;
      }

      const classBtn = e.target.closest('button[data-kind="class"]');
      if (classBtn){
        if (state.view !== 'lite') return; // Full: no interactions
        const cid = Number(classBtn.dataset.classId);
        const s = findScheduleByClassId(cid);
        if (s) openClassFly(s);
        else {
          // fallback from trips
          const trips = state.index.tripsByClass.get(cid) || [];
          if (trips.length) openClassFly({
            class_id: cid,
            ringName: trips[0].ringName,
            ring_number: trips[0].ring_number,
            class_number: trips[0].class_number,
            class_name: trips[0].class_name,
            latestStatus: trips[0].latestStatus,
            latestStart: trips[0].latestStart,
            total_trips: trips.length,
          });
        }
      }
    };
  }

  function findScheduleByClassId(classId){
    for (const s of state.data.schedule){
      if (Number(s.class_id) === Number(classId)) return s;
    }
    return null;
  }

  //////////////////////
  // Flyup
  //////////////////////

  function openFly(title, rows){
    el.flyTitle.textContent = title;
    el.flyRows.innerHTML = rows.map(r => {
      return `<div class="flyRow"><div class="flyLabel">${escapeHtml(r.label)}</div><div class="flyValue">${escapeHtml(r.value)}</div></div>`;
    }).join('');

    el.fly.classList.add('is-open');
    el.fly.setAttribute('aria-hidden','false');
  }

  function closeFly(){
    el.fly.classList.remove('is-open');
    el.fly.setAttribute('aria-hidden','true');
    el.flyRows.innerHTML = '';
  }

  function openEntryFly(t){
    const title = `${t.horseName || t.barnName || 'Entry'}${t.backNumber ? ` • ${t.backNumber}` : ''}`;
    const rows = [];

    addRow(rows, 'Class #', t.class_number);
    addRow(rows, 'Class', t.class_name);
    addRow(rows, 'Ring', t.ringName);
    addRow(rows, 'Barn', t.barnName);
    addRow(rows, 'Rider', t.riderName);
    addRow(rows, 'Last OOG', t.lastOOG);
    addRow(rows, 'Latest GO', t.latestGO);

    openFly(title, rows);
  }

  function openClassFly(s){
    const title = `${s.class_number || ''} ${s.class_name || s.group_name || ''}`.trim() || 'Class';
    const rows = [];

    addRow(rows, 'Group', s.group_name);
    addRow(rows, 'Ring', s.ringName || (s.ring_number ? `Ring ${s.ring_number}` : ''));
    addRow(rows, 'Class #', s.class_number);
    addRow(rows, 'Type', s.class_type);
    addRow(rows, 'Schedule', s.sequencetype);
    addRow(rows, 'Status', s.latestStatus);
    addRow(rows, 'Start', s.latestStart);
    addRow(rows, 'Trips', s.total_trips);

    openFly(title, rows);
  }

  function addRow(rows, label, value){
    if (value == null) return;
    const v = String(value).trim();
    if (!v) return;
    rows.push({ label, value: v });
  }

  //////////////////////
  // Nav
  //////////////////////

  function wireNav(){
    el.navGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-view]');
      if (!btn) return;
      const v = btn.dataset.view;
      state.view = (v === 'full') ? 'full' : (v === 'lite' ? 'lite' : v);
      render();
    });

    el.flyClose.addEventListener('click', closeFly);
    el.fly.addEventListener('click', (e) => {
      if (e.target === el.fly) closeFly();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.fly.classList.contains('is-open')) closeFly();
    });
  }

  //////////////////////
  // Boot
  //////////////////////

  wireNav();

  loadData()
    .then(() => render())
    .catch(() => {
      el.rings.innerHTML = '<div class="empty">Data load failed.</div>';
    });

})();
