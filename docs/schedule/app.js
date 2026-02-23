/* app.js (FULL DROP) */
/* tapactive-rings-v2_1 — app.js
   - Uses your v2.1 template UI (same CSS grammar)
   - Data: watch_trips.json + watch_schedule.json + threads.json
   - Pages: Start | Summary | Lite | Full | Threads
   - Lite = interactive (filters + flyups)
   - Full = view-only (no flyups / no filters)
*/
(function(){
  'use strict';

  //////////////////////
  // 0) DOM refs
  //////////////////////
  const app = document.getElementById('app');
  const main = document.getElementById('main');

  const topTitle = document.getElementById('topTitle');

  const peaksWrap = document.getElementById('peaksWrap');
  const peakbar = document.getElementById('peakbar');

  const horsesWrap = document.getElementById('horsesWrap');
  const horsebar = document.getElementById('horsebar');

  const startContainer = document.getElementById('start_container');
  const summaryContainer = document.getElementById('summary_container');
  const liteContainer = document.getElementById('lite_container');
  const fullContainer = document.getElementById('full_container');
  const threadsContainer = document.getElementById('threads_container');

  const aggStart = document.getElementById('aggStart');
  const aggSummary = document.getElementById('aggSummary');
  const aggLite = document.getElementById('aggLite');
  const aggFull = document.getElementById('aggFull');
  const aggThreads = document.getElementById('aggThreads');

  //////////////////////
  // 1) Config
  //////////////////////
  const REFRESH_MS = 6 * 60 * 1000;

  // Primary (your current working convention)
  const URL_TRIPS_PRIMARY = './data/latest/watch_trips.json';
  const URL_SCHEDULE_PRIMARY = './data/latest/watch_schedule.json';
  const URL_THREADS_PRIMARY = './data/latest/threads.json';

  // Fallbacks (so local testing works without moving files)
  const URL_TRIPS_FALLBACK = './watch_trips.json';
  const URL_SCHEDULE_FALLBACK = './watch_schedule.json';
  const URL_THREADS_FALLBACK = './threads.json';

  //////////////////////
  // 2) State
  //////////////////////
  let page = 'start'; // start | summary | lite | full | threads

  let globalStatus = ''; // '', 'U', 'L', 'C' (Lite only)
  let activeHorse = '';  // '' or horse name (Lite only)
  const ringFilters = new Map(); // ringNumber -> '', 'U'|'L'|'C' (Lite only)

  let dataTrips = null;     // { meta, records[] }
  let dataSchedule = null;  // { meta, records[] }
  let dataThreads = null;   // { meta, records[] }

  let lastRefreshAt = 0;

  //////////////////////
  // 3) Helpers
  //////////////////////
  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function uniq(arr){
    const set = new Set(arr);
    return Array.from(set);
  }

  function statusToCode(latestStatus){
    // watch_trips.json uses: Upcoming / Underway / Completed
    const s = String(latestStatus || '').toLowerCase();
    if (s === 'underway' || s === 'live') return 'L';
    if (s === 'completed' || s === 'complete') return 'C';
    if (s === 'upcoming') return 'U';
    return ''; // unknown
  }

  function fmtTimeLike(v){
    // Keep what Airtable already provides (often "8:05A", "11:15 AM").
    // If ISO string, format to h:mmA (no seconds).
    const s = String(v ?? '').trim();
    if (!s) return '';
    if (s.includes('T') && s.includes(':')){
      const d = new Date(s);
      if (!isNaN(d.getTime())){
        const hh = d.getHours();
        const mm = String(d.getMinutes()).padStart(2,'0');
        const ap = hh >= 12 ? 'P' : 'A';
        const h12 = ((hh + 11) % 12) + 1;
        return `${h12}:${mm}${ap}`;
      }
    }
    return s;
  }

  function cacheBust(url){
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${Date.now()}`;
  }

  async function fetchJsonWithFallback(primaryUrl, fallbackUrl){
    const tryFetch = async (u) => {
      const res = await fetch(cacheBust(u), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${u}`);
      return res.json();
    };
    try{
      return await tryFetch(primaryUrl);
    }catch(_e){
      return await tryFetch(fallbackUrl);
    }
  }

  //////////////////////
  // 4) Chrome hide/show on scroll (down hides, up shows)
  //////////////////////
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

  //////////////////////
  // 5) Flyups (shared)
  //////////////////////
  const fly = document.getElementById('fly');
  const flyTitle = document.getElementById('flyTitle');
  const flyBody = document.getElementById('flyBody');
  const flyClose = document.getElementById('flyClose');
  const flyBackdrop = document.getElementById('flyBackdrop');

  function openFly(title, blocks){
    flyTitle.textContent = String(title || 'Details');
    flyBody.innerHTML = '';

    (blocks || []).forEach(({k,v}) => {
      const box = document.createElement('div');
      box.className = 'fly_kv';
      box.innerHTML = '<div class="fly_k"></div><div class="fly_v"></div>';
      box.querySelector('.fly_k').textContent = String(k || '');
      box.querySelector('.fly_v').textContent = String(v ?? '—');
      flyBody.appendChild(box);
    });

    fly.classList.add('is-open');
  }

  function closeFly(){
    fly.classList.remove('is-open');
  }

  flyClose.addEventListener('click', closeFly);
  flyBackdrop.addEventListener('click', closeFly);

  //////////////////////
  // 6) Data shaping
  //////////////////////
  function buildTripsIndex(trips){
    const recs = (trips && trips.records) ? trips.records : [];

    const byClass = new Map(); // class_id -> { classFields, entries[] }
    const rings = new Map();   // ring_number -> { ring_number, ringName, groups: Map(group_id -> {...}) }

    recs.forEach(r => {
      const ringNum = Number(r.ring_number || 0);
      const ringName = String(r.ringName || (ringNum ? `Ring ${ringNum}` : 'Ring')).trim() || (ringNum ? `Ring ${ringNum}` : 'Ring');

      const classId = String(r.class_id || '').trim() || `class-${esc(r.class_number||'')}-${esc(r.class_name||'')}-${ringNum}`;
      const groupId = String(r.group_id || '').trim() || `group-${ringNum}-${String(r.group_name||'').trim()}`;
      const groupName = String(r.group_name || '').trim() || 'Group';

      const cls = byClass.get(classId) || {
        class_id: classId,
        ring_number: ringNum,
        ringName,
        group_id: groupId,
        group_name: groupName,
        class_number: String(r.class_number || '').trim(),
        class_name: String(r.class_name || '').trim(),
        class_type: String(r.class_type || '').trim(),
        schedule_sequencetype: String(r.schedule_sequencetype || '').trim(),
        latestStatus: String(r.latestStatus || '').trim(),
        latestStart: r.latestStart,
        latest_calendarStart: r.latest_calendarStart,
        latest_calendarEnd: r.latest_calendarEnd,
        class_total: r.class_total,
        entries: []
      };

      cls.entries.push(r);
      byClass.set(classId, cls);

      if (!rings.has(ringNum)){
        rings.set(ringNum, { ring_number: ringNum, ringName, groups: new Map() });
      }
      const ring = rings.get(ringNum);
      if (!ring.groups.has(groupId)){
        ring.groups.set(groupId, { group_id: groupId, group_name: groupName, classIds: [] });
      }
      const grp = ring.groups.get(groupId);
      if (!grp.classIds.includes(classId)) grp.classIds.push(classId);
    });

    return { byClass, rings };
  }

  function buildScheduleIndex(schedule){
    const recs = (schedule && schedule.records) ? schedule.records : [];

    const byClass = new Map(); // class_id -> schedule record
    const rings = new Map();   // ring_number -> { ring_number, ringName, groups: Map(group_id->...) }

    recs.forEach(r => {
      const ringNum = Number(r.ring_number || 0);
      const ringName = String(r.ringName || (ringNum ? `Ring ${ringNum}` : 'Ring')).trim() || (ringNum ? `Ring ${ringNum}` : 'Ring');

      const classId = String(r.class_id || '').trim() || `class-${esc(r.class_number||'')}-${esc(r.class_name||'')}-${ringNum}`;
      const groupId = String(r.group_id || '').trim() || `group-${ringNum}-${String(r.group_name||'').trim()}`;
      const groupName = String(r.group_name || '').trim() || 'Group';

      byClass.set(classId, r);

      if (!rings.has(ringNum)){
        rings.set(ringNum, { ring_number: ringNum, ringName, groups: new Map() });
      }
      const ring = rings.get(ringNum);
      if (!ring.groups.has(groupId)){
        ring.groups.set(groupId, { group_id: groupId, group_name: groupName, classIds: [] });
      }
      const grp = ring.groups.get(groupId);
      if (!grp.classIds.includes(classId)) grp.classIds.push(classId);
    });

    return { byClass, rings };
  }

  //////////////////////
  // 7) UI builders
  //////////////////////
  function buildRingCardHTML({ ringNum, ringName, groups, byClass, mode }){
    // mode: 'lite' or 'full'
    const ringFilter = ringFilters.get(ringNum) || '';

    // ring head eyelid only in Lite
    const eyelid = (mode === 'lite')
      ? `<div class="ring_eyelid" aria-label="${esc(ringName)} status filter">
          <button class="sbtn" type="button" data-ring-status="U" data-ring="${ringNum}" title="Upcoming">U</button>
          <button class="sbtn" type="button" data-ring-status="L" data-ring="${ringNum}" title="Live">L</button>
          <button class="sbtn" type="button" data-ring-status="C" data-ring="${ringNum}" title="Completed">C</button>
        </div>`
      : `<div class="ring_eyelid" aria-hidden="true"></div>`;

    const groupBlocks = Array.from(groups.values()).map(grp => {
      const classCards = (grp.classIds || []).map(classId => {
        const cls = byClass.get(classId);
        if (!cls) return '';

        const statusCode = statusToCode(cls.latestStatus);
        const classTime = fmtTimeLike(cls.latestStart || cls.latest_calendarStart || '');
        const classLabelRaw = [
          cls.class_number ? cls.class_number : '',
          cls.class_name ? cls.class_name : ''
        ].filter(Boolean).join(' ');
        const classLabel = classLabelRaw || 'Class';

        // entries pills
        const entries = (cls.entries || []);

        // Pill label contract: barnName • lastOOG • latestGO
        const pillNodes = entries.map((e, idx) => {
          const barnName = String(e.barnName || '').trim() || String(e.barn || '').trim();
          const lastOOG = (e.lastOOG !== undefined && e.lastOOG !== null && String(e.lastOOG).trim() !== '') ? String(e.lastOOG) : '';
          const latestGO = fmtTimeLike(e.latestGO || e.runningGO || e.running_go_time || e.latest_go_time || '');

          const left = barnName || '—';
          const mid = lastOOG || '—';
          const right = latestGO || '—';

          const pillText = `${left} • ${mid} • ${right}`;

          const sharedAttrs =
            `data-horse="${esc(e.horseName || e.horse || '')}"
             data-rider="${esc(e.riderName || e.rider || '')}"
             data-trn="${esc(e.barnName || '')}"
             data-ogo="${esc(e.lastOOG ?? '')}"
             data-eta="${esc(latestGO)}"
             data-entry-number="${esc(e.backNumber ?? e.entry_number ?? '')}"
             data-running-ogo="${esc(e.runningOOG ?? '')}"
             data-running-go="${esc(fmtTimeLike(e.runningGO ?? ''))}"
             data-place="${esc(e.place ?? '')}"
             data-score="${esc(e.score ?? '')}"
             data-time="${esc(e.time ?? '')}"`;

          if (mode === 'lite'){
            const entryId = String(e.entry_id || e.record_id || `e-${classId}-${idx}`);
            return `<button class="epill" type="button" data-open-entry="${esc(entryId)}" ${sharedAttrs}>${esc(pillText)}</button>`;
          }
          // Full view: no interactions
          return `<div class="epill" aria-disabled="true" ${sharedAttrs}>${esc(pillText)}</div>`;
        }).join('');

        const entriesRow = `
          <div class="row--tap row--line line--entries">
            <div class="row__l"></div>
            <div class="line__m">
              <div class="entries_scroller">
                ${pillNodes || ''}
              </div>
            </div>
            <div class="line__r" aria-hidden="true"></div>
          </div>
        `;

        const classLineAttrs = (mode === 'lite')
          ? `data-open-class="${esc(cls.class_id)}"`
          : '';

        const classCard = `
          <div class="class_card" data-status="${esc(statusCode || 'U')}"
               data-class-id="${esc(cls.class_id)}"
               data-class-number="${esc(cls.class_number || '')}"
               data-class-total="${esc(cls.class_total ?? '')}"
               data-class-name="${esc(classLabel)}"
               data-class-time="${esc(classTime)}"
               data-ring-number="${esc(ringNum)}"
               data-ring-name="${esc(ringName)}"
               data-group-name="${esc(grp.group_name)}"
               data-class-type="${esc(cls.class_type || '')}"
               data-seq="${esc(cls.schedule_sequencetype || '')}"
               data-latest-status="${esc(cls.latestStatus || '')}">
            <div class="row--tap row--line line--class" ${classLineAttrs}>
              <div class="row__l">${esc(classTime || '')}</div>
              <div class="line__m">${esc(classLabel)}</div>
              <div class="line__r" aria-hidden="true"></div>
            </div>
            ${entriesRow}
          </div>
        `;
        return classCard;
      }).join('');

      return `
        <div class="class_group_id" data-group-id="${esc(grp.group_id)}">
          ${classCards}
        </div>
      `;
    }).join('');

    return `
      <section class="ring_card" id="ring-${esc(ringNum)}" data-ring-number="${esc(ringNum)}" data-ring-filter="${esc(ringFilter)}">
        <div class="ring_line">
          <div class="ring_title">${esc(ringName)}</div>
          ${eyelid}
        </div>
        ${groupBlocks}
      </section>
    `;
  }

  function renderLite(){
    const trips = dataTrips || { records: [] };
    const idx = buildTripsIndex(trips);

    // build peaks + horses (Lite only)
    buildRingPeaks(Array.from(idx.rings.keys()).sort((a,b)=>a-b));
    buildHorseChipsFromTrips(trips);

    // default ringFilters map initialization
    Array.from(idx.rings.keys()).forEach(rn => { if (!ringFilters.has(rn)) ringFilters.set(rn, ''); });

    const ringsSorted = Array.from(idx.rings.values()).sort((a,b)=>a.ring_number-b.ring_number);
    const html = ringsSorted.map(ring => buildRingCardHTML({
      ringNum: ring.ring_number,
      ringName: ring.ringName,
      groups: ring.groups,
      byClass: idx.byClass,
      mode: 'lite'
    })).join('');

    liteContainer.innerHTML = html || buildEmptyCard('No trips in watch_trips.json');
    wireRingFilterButtons(); // per ring eyelids
    applyLiteFilters();
  }

  function renderFull(){
    const schedule = dataSchedule || { records: [] };
    const schedIdx = buildScheduleIndex(schedule);
    const tripsIdx = buildTripsIndex(dataTrips || { records: [] });

    // Merge: for each schedule class, attach entries from trips if any
    const byClassMerged = new Map();
    schedIdx.byClass.forEach((rec, classId) => {
      const ringNum = Number(rec.ring_number || 0);
      const ringName = String(rec.ringName || (ringNum ? `Ring ${ringNum}` : 'Ring')).trim() || (ringNum ? `Ring ${ringNum}` : 'Ring');

      const merged = {
        class_id: String(rec.class_id || classId),
        ring_number: ringNum,
        ringName,
        group_id: String(rec.group_id || ''),
        group_name: String(rec.group_name || ''),
        class_number: String(rec.class_number || '').trim(),
        class_name: String(rec.class_name || '').trim(),
        class_type: String(rec.class_type || '').trim(),
        schedule_sequencetype: String(rec.schedule_sequencetype || '').trim(),
        latestStatus: String(rec.latestStatus || '').trim(),
        latestStart: rec.latestStart || rec.class_start || rec.class_time || rec.classTime || rec.start_time || rec.start,
        latest_calendarStart: rec.latest_calendarStart,
        latest_calendarEnd: rec.latest_calendarEnd,
        class_total: rec.class_total,
        entries: []
      };

      const tripClass = tripsIdx.byClass.get(String(rec.class_id || classId));
      if (tripClass && Array.isArray(tripClass.entries)) merged.entries = tripClass.entries;

      if ((!merged.class_total || merged.class_total === '') && tripClass && tripClass.class_total) merged.class_total = tripClass.class_total;

      // status preference: if schedule doesn't have it, use tripClass.latestStatus
      if (!merged.latestStatus && tripClass && tripClass.latestStatus) merged.latestStatus = tripClass.latestStatus;
      if (!merged.latestStart && tripClass && tripClass.latestStart) merged.latestStart = tripClass.latestStart;

      byClassMerged.set(String(rec.class_id || classId), merged);
    });

    const ringsSorted = Array.from(schedIdx.rings.values()).sort((a,b)=>a.ring_number-b.ring_number);
    const html = ringsSorted.map(ring => buildRingCardHTML({
      ringNum: ring.ring_number,
      ringName: ring.ringName,
      groups: ring.groups,
      byClass: byClassMerged,
      mode: 'full'
    })).join('');

    fullContainer.innerHTML = html || buildEmptyCard('No classes in watch_schedule.json');
  }

  function renderStart(){
    const tripsCount = (dataTrips && dataTrips.records) ? dataTrips.records.length : 0;
    const schedCount = (dataSchedule && dataSchedule.records) ? dataSchedule.records.length : 0;
    const threadCount = (dataThreads && dataThreads.records) ? dataThreads.records.length : 0;

    const ringsTrips = uniq((dataTrips?.records || []).map(r => Number(r.ring_number || 0)).filter(Boolean)).length;
    const ringsSched = uniq((dataSchedule?.records || []).map(r => Number(r.ring_number || 0)).filter(Boolean)).length;

    const last = lastRefreshAt ? new Date(lastRefreshAt) : null;
    const lastStr = last ? last.toLocaleString() : '—';

    startContainer.innerHTML = `
      <section class="ring_card">
        <div class="ring_line"><div class="ring_title">Status</div><div class="ring_eyelid" aria-hidden="true"></div></div>
        <div class="class_group_id">
          <div class="class_card" data-status="U">
            <div class="row--tap row--line line--class">
              <div class="row__l">Trips</div>
              <div class="line__m">${esc(tripsCount)} (${esc(ringsTrips)} rings)</div>
              <div class="line__r" aria-hidden="true"></div>
            </div>
          </div>
          <div class="class_card" data-status="U">
            <div class="row--tap row--line line--class">
              <div class="row__l">Sched</div>
              <div class="line__m">${esc(schedCount)} (${esc(ringsSched)} rings)</div>
              <div class="line__r" aria-hidden="true"></div>
            </div>
          </div>
          <div class="class_card" data-status="U">
            <div class="row--tap row--line line--class">
              <div class="row__l">Threads</div>
              <div class="line__m">${esc(threadCount)}</div>
              <div class="line__r" aria-hidden="true"></div>
            </div>
          </div>
          <div class="class_card" data-status="U">
            <div class="row--tap row--line line--class">
              <div class="row__l">Refresh</div>
              <div class="line__m">${esc(lastStr)}</div>
              <div class="line__r" aria-hidden="true"></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderSummary(){
    const recs = (dataTrips && dataTrips.records) ? dataTrips.records : [];
    const idx = buildTripsIndex({ records: recs });

    // pick one row per class (dedupe)
    const classes = Array.from(idx.byClass.values()).map(cls => {
      const status = String(cls.latestStatus || '');
      const statusCode = statusToCode(status) || 'U';
      const time = fmtTimeLike(cls.latestStart || cls.latest_calendarStart || '');
      const label = [cls.class_number || '', cls.class_name || ''].filter(Boolean).join(' ') || 'Class';
      const ringLabel = cls.ring_number ? `R${cls.ring_number}` : '';
      return { ...cls, status, statusCode, time, label, ringLabel, class_total: (cls.class_total ?? (cls.entries && cls.entries[0] ? cls.entries[0].class_total : '')) };
    });

    const live = classes.filter(c => c.statusCode === 'L').sort((a,b)=>a.ring_number-b.ring_number);
    const up = classes.filter(c => c.statusCode === 'U').sort((a,b)=>a.ring_number-b.ring_number);
    const done = classes.filter(c => c.statusCode === 'C').sort((a,b)=>a.ring_number-b.ring_number);

    function block(title, arr){
      const rows = arr.slice(0, 25).map(c => `
        <div class="class_card" data-status="${esc(c.statusCode)}"
             data-class-id="${esc(c.class_id)}"
             data-class-number="${esc(c.class_number || '')}"
             data-class-total="${esc(c.class_total ?? '')}"
             data-class-name="${esc(c.label)}"
             data-class-time="${esc(c.time)}"
             data-ring-number="${esc(c.ring_number)}"
             data-ring-name="${esc(c.ringName)}"
             data-group-name="${esc(c.group_name)}"
             data-class-type="${esc(c.class_type || '')}"
             data-seq="${esc(c.schedule_sequencetype || '')}"
             data-latest-status="${esc(c.latestStatus || '')}">
          <div class="row--tap row--line line--class" data-open-class="${esc(c.class_id)}">
            <div class="row__l">${esc(c.time || '')}</div>
            <div class="line__m">${esc((c.ringLabel ? `[${c.ringLabel}] ` : '') + c.label)}</div>
            <div class="line__r" aria-hidden="true"></div>
          </div>
        </div>
      `).join('');

      return `
        <section class="ring_card">
          <div class="ring_line"><div class="ring_title">${esc(title)}</div><div class="ring_eyelid" aria-hidden="true"></div></div>
          <div class="class_group_id">
            ${rows || `<div class="row--tap row--line"><div class="row__l"></div><div class="line__m">—</div><div class="line__r" aria-hidden="true"></div></div>`}
          </div>
        </section>
      `;
    }

    summaryContainer.innerHTML = [
      block('Live', live),
      block('Upcoming', up),
      block('Completed', done)
    ].join('');
  }

  function renderThreads(){
    const recs = (dataThreads && dataThreads.records) ? dataThreads.records : [];
    const items = recs.slice(0, 50).map(r => {
      const title = String(r.title || r.thread_title || r.name || 'Thread');
      const body = String(r.body || r.message || r.text || '').trim();
      const ts = String(r.ts || r.timestamp || r.time || '').trim();
      const left = ts ? fmtTimeLike(ts) : '';
      const mid = body ? body : '—';
      return `
        <div class="class_card" data-status="U">
          <div class="row--tap row--line">
            <div class="row__l">${esc(left)}</div>
            <div class="line__m">${esc(title)}${body ? ` — ${esc(mid)}` : ''}</div>
            <div class="line__r" aria-hidden="true"></div>
          </div>
        </div>
      `;
    }).join('');

    threadsContainer.innerHTML = `
      <section class="ring_card">
        <div class="ring_line"><div class="ring_title">Threads</div><div class="ring_eyelid" aria-hidden="true"></div></div>
        <div class="class_group_id">
          ${items || `<div class="row--tap row--line"><div class="row__l"></div><div class="line__m">No threads</div><div class="line__r" aria-hidden="true"></div></div>`}
        </div>
      </section>
    `;
  }

  function buildEmptyCard(msg){
    return `
      <section class="ring_card">
        <div class="ring_line"><div class="ring_title">${esc(msg)}</div><div class="ring_eyelid" aria-hidden="true"></div></div>
        <div class="class_group_id"></div>
      </section>
    `;
  }

  //////////////////////
  // 8) Lite-only controls (peaks + chips + filters)
  //////////////////////
  function buildRingPeaks(ringNums){
    peakbar.innerHTML = '';
    ringNums.forEach((rn, idx) => {
      const b = document.createElement('button');
      b.className = 'peakbtn' + (idx === 0 ? ' is-active' : '');
      b.type = 'button';
      b.textContent = `R${rn}`;
      b.setAttribute('data-peak-target', `#ring-${rn}`);
      b.addEventListener('click', () => {
        setActivePeak(b);
        scrollToTarget(b.getAttribute('data-peak-target'));
      });
      peakbar.appendChild(b);
    });
  }

  function setActivePeak(btn){
    Array.from(peakbar.querySelectorAll('.peakbtn')).forEach(b => b.classList.toggle('is-active', b === btn));
  }

  function scrollToTarget(sel){
    const el = document.querySelector(sel);
    if (!el) return;

    const overlay =
      (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 48) +
      (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peaks-h')) || 74) +
      28;

    const mainRect = main.getBoundingClientRect();
    const elTopInMain = el.getBoundingClientRect().top - mainRect.top + main.scrollTop;

    main.scrollTo({ top: Math.max(0, elTopInMain - overlay), behavior: 'smooth' });
  }

  function buildHorseChipsFromTrips(trips){
    const horses = uniq(Array.from((trips.records || []))
      .map(r => String(r.horseName || r.horse || '').trim())
      .filter(Boolean)
    ).sort((a,b)=>a.localeCompare(b));

    horsebar.innerHTML = '';

    horses.forEach(name => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hchip';
      b.textContent = name;
      b.setAttribute('data-horse-chip', name);
      b.addEventListener('click', () => {
        activeHorse = (activeHorse === name) ? '' : name;
        Array.from(horsebar.querySelectorAll('.hchip')).forEach(x => x.classList.toggle('is-on', x.getAttribute('data-horse-chip') === activeHorse && !!activeHorse));
        applyLiteFilters();
      });
      horsebar.appendChild(b);
    });
  }

  function wireGlobalStatusButtons(){
    const globalBtns = Array.from(document.querySelectorAll('[data-global-status]'));
    globalBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (page !== 'lite') return;
        const v = btn.getAttribute('data-global-status') || '';
        globalStatus = (globalStatus === v) ? '' : v;
        globalBtns.forEach(b => b.classList.toggle('is-on', (b.getAttribute('data-global-status') === globalStatus) && !!globalStatus));
        applyLiteFilters();
      });
    });
  }

  function wireRingFilterButtons(){
    // set button on/off to match ringFilters
    Array.from(document.querySelectorAll('[data-ring-status][data-ring]')).forEach(btn => {
      const rn = Number(btn.getAttribute('data-ring') || 0);
      const v = btn.getAttribute('data-ring-status') || '';
      const cur = ringFilters.get(rn) || '';
      btn.classList.toggle('is-on', !!cur && cur === v);
      btn.onclick = (e) => {
        e.stopPropagation();
        if (page !== 'lite') return;
        const current = ringFilters.get(rn) || '';
        const next = (current === v) ? '' : v;
        ringFilters.set(rn, next);

        // update only within that ring card
        const ring = document.querySelector(`.ring_card[data-ring-number="${rn}"]`);
        if (ring){
          ring.setAttribute('data-ring-filter', next);
          Array.from(ring.querySelectorAll('[data-ring-status]')).forEach(b => {
            b.classList.toggle('is-on', (b.getAttribute('data-ring-status') === next) && !!next);
          });
        }
        applyLiteFilters();
      };
    });
  }

  function applyLiteFilters(){
    if (page !== 'lite') return;

    const ringCards = Array.from(liteContainer.querySelectorAll('.ring_card'));
    ringCards.forEach(ring => {
      const ringNum = Number(ring.getAttribute('data-ring-number') || 0);
      const ringFilter = ringFilters.get(ringNum) || '';

      const classes = Array.from(ring.querySelectorAll('.class_card'));
      let anyVisibleClass = false;

      classes.forEach(cls => {
        const clsStatus = (cls.getAttribute('data-status') || '').trim();

        const statusOk =
          (!globalStatus || clsStatus === globalStatus) &&
          (!ringFilter || clsStatus === ringFilter);

        // Horse filtering happens at entry-pill level
        const pills = Array.from(cls.querySelectorAll('.epill[data-horse]'));
        let anyVisiblePill = false;

        pills.forEach(p => {
          const h = (p.getAttribute('data-horse') || '').trim();
          const show = (!activeHorse || h === activeHorse);
          p.classList.toggle('is-hidden', !show);
          if (show) anyVisiblePill = true;
        });

        const showClass = statusOk && (activeHorse ? anyVisiblePill : true);
        cls.classList.toggle('is-hidden', !showClass);
        if (showClass) anyVisibleClass = true;
      });

      ring.classList.toggle('is-hidden', !anyVisibleClass);
    });
  }

  //////////////////////
  // 9) Flyups (Lite + Summary only)
  //////////////////////
  document.addEventListener('click', (e) => {
    const clsLine = e.target.closest('[data-open-class]');
    if (!clsLine) return;

    if (!(page === 'lite' || page === 'summary')) return;

    const card = clsLine.closest('.class_card');
    if (!card) return;

    const name = card.getAttribute('data-class-name') || 'Class';
    const time = card.getAttribute('data-class-time') || '—';

    // Contract fields requested (class fly)
    openFly(name, [
      { k: 'Group', v: card.getAttribute('data-group-name') || '—' },
      { k: 'Ring', v: card.getAttribute('data-ring-name') || '—' },
      { k: 'Class #', v: card.getAttribute('data-class-number') || '—' },
      { k: 'Class Type', v: card.getAttribute('data-class-type') || '—' },
      { k: 'Schedule Type', v: card.getAttribute('data-seq') || '—' },
      { k: 'Status', v: card.getAttribute('data-latest-status') || '—' },
      { k: 'Total Trips', v: card.getAttribute('data-class-total') || '—' },
      { k: 'Estimated Start', v: time },
      { k: 'Time till Start', v: '—' }
    ]);
  });

  document.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-open-entry]');
    if (!pill) return;

    if (page !== 'lite') return;

    e.stopPropagation();

    const horse = pill.getAttribute('data-horse') || 'Horse';

    openFly(horse, [
      { k: 'Entry #', v: pill.getAttribute('data-entry-number') || '—' },
      { k: 'Horse', v: pill.getAttribute('data-horse') || '—' },
      { k: 'Rider', v: pill.getAttribute('data-rider') || '—' },
      { k: 'Order of Go', v: pill.getAttribute('data-ogo') || '—' },
      { k: 'Estimated Go', v: pill.getAttribute('data-eta') || '—' },
      { k: 'Time till Go', v: '—' },
      { k: 'Running OOG', v: pill.getAttribute('data-running-ogo') || '—' },
      { k: 'Running Go', v: pill.getAttribute('data-running-go') || '—' },
      { k: 'Placing', v: pill.getAttribute('data-place') || '—' },
      { k: 'Score', v: pill.getAttribute('data-score') || '—' },
      { k: 'Time', v: pill.getAttribute('data-time') || '—' }
    ]);
  });

  //////////////////////
  // 10) Navigation / Pages
  //////////////////////
  function setPage(next){
    page = next;

    // page panels
    Array.from(document.querySelectorAll('.page')).forEach(p => p.classList.remove('is-active'));
    const el = document.getElementById(`page-${next}`);
    if (el) el.classList.add('is-active');

    // title
    topTitle.textContent = ({
      start: 'Start',
      summary: 'Summary',
      lite: 'Lite',
      full: 'Full',
      threads: 'Threads'
    }[next] || 'Rings');

    // peaks + horses only on Lite
    const showOverlays = (next === 'lite');
    peaksWrap.hidden = !showOverlays;
    horsesWrap.hidden = !showOverlays;

    // adjust main padding so non-lite pages don't reserve overlay space
    if (showOverlays){
      main.style.paddingTop = '';
      main.style.paddingBottom = '';
    }else{
      main.style.paddingTop = `calc(env(safe-area-inset-top) + var(--topbar-h) + 18px)`;
      main.style.paddingBottom = `calc(env(safe-area-inset-bottom) + var(--nav-h) + 18px)`;
      // reset lite filters when leaving lite
      globalStatus = '';
      activeHorse = '';
      Array.from(document.querySelectorAll('[data-global-status]')).forEach(b => b.classList.remove('is-on'));
      Array.from(horsebar.querySelectorAll('.hchip')).forEach(b => b.classList.remove('is-on'));
    }

    // render the selected page
    renderCurrent();

    // scroll to top
    main.scrollTo({ top: 0, behavior: 'auto' });
  }

  function renderCurrent(){
    if (page === 'start') renderStart();
    else if (page === 'summary') renderSummary();
    else if (page === 'lite') renderLite();
    else if (page === 'full') renderFull();
    else if (page === 'threads') renderThreads();

    // nav visual state
    document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('is-active'));
    const activeBtn = document.querySelector(`.nav-btn[data-nav="${page}"]`);
    if (activeBtn) activeBtn.classList.add('is-active');
  }

  Array.from(document.querySelectorAll('.nav-btn[data-nav]')).forEach(b => {
    b.addEventListener('click', () => setPage(b.getAttribute('data-nav')));
  });

  //////////////////////
  // 11) Aggregates (bottom nav pills)
  //////////////////////
  function updateAggs(){
    const trips = (dataTrips && dataTrips.records) ? dataTrips.records : [];
    const schedule = (dataSchedule && dataSchedule.records) ? dataSchedule.records : [];
    const threads = (dataThreads && dataThreads.records) ? dataThreads.records : [];

    const tripClasses = uniq(trips.map(r => String(r.class_id || '')).filter(Boolean)).length;

    aggStart.textContent = String(trips.length || '—');
    aggSummary.textContent = String(tripClasses || '—');
    aggLite.textContent = String(tripClasses || '—');
    aggFull.textContent = String(schedule.length || '—');
    aggThreads.textContent = String(threads.length || '—');
  }

  //////////////////////
  // 12) Load + refresh
  //////////////////////
  async function loadAll(){
    const [trips, sched, threads] = await Promise.all([
      fetchJsonWithFallback(URL_TRIPS_PRIMARY, URL_TRIPS_FALLBACK).catch(() => ({ meta:{}, records:[] })),
      fetchJsonWithFallback(URL_SCHEDULE_PRIMARY, URL_SCHEDULE_FALLBACK).catch(() => ({ meta:{}, records:[] })),
      fetchJsonWithFallback(URL_THREADS_PRIMARY, URL_THREADS_FALLBACK).catch(() => ({ meta:{}, records:[] })),
    ]);

    dataTrips = trips;
    dataSchedule = sched;
    dataThreads = threads;
    lastRefreshAt = Date.now();

    updateAggs();
    renderCurrent();
  }

  //////////////////////
  // 13) Init
  //////////////////////
  wireGlobalStatusButtons();
  loadAll();
  setInterval(loadAll, REFRESH_MS);

})();