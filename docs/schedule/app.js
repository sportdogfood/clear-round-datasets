// app.js — CRT Daily Show (Legacy UI contract + Cards + Peaks + Schedule/Timeline modes)
//
// Data:
//   ./data/latest/watch_schedule.json (context scaffold)
//   ./data/latest/watch_trips.json    (truth overlay)
//
// Fixes in this drop:
// 1) Schedule click rules kept: class line -> class detail, horse -> horse detail, time -> timeline (#timeline)
// 2) Peakbar hash scroll offset increased so ring headers land BELOW peakbar
// 3) Bottom-nav “Schedule” stays active even when you open horse/rider detail FROM schedule
// 4) Schedule rollups are now WRAPPED grid (3 across) instead of horizontal scroller
// 5) Timeline gutter/horse column reduced to 60px + ellipsis; timeline cards de-dupe by same startMin
//
// Spec implemented:
// - Horse detail: schedule-style card scoped to horse; group rows + class rows + rider chips rollup
// - Class detail: schedule-style ring card scoped to class; entry blocks (2-line) per entry
// - Rider detail: same as class detail but scoped to rider; grouped by group/class; entry blocks

(function () {
  'use strict';

  // ----------------------------
  // CONFIG
  // ----------------------------
  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // If duration is unknown, assume per-trip duration:
  const DUR_PER_TRIP_SEC = 149; // 2m 29s

  // ----------------------------
  // DOM
  // ----------------------------
    let appEl, appMain, screenRoot, headerTitle, headerBack, headerAction, navRow;

  function mountShell() {
    const mount = document.getElementById('app');
    if (!mount) throw new Error('Missing #app mount');

    // Clear (idempotent)
    mount.innerHTML = '';

    // Header
    const header = document.createElement('header');
    header.className = 'app-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'header-back';
    backBtn.id = 'header-back';
    backBtn.type = 'button';
    backBtn.innerHTML = '<span>&larr;</span>';

    const title = document.createElement('h1');
    title.className = 'header-title';
    title.id = 'header-title';
    title.textContent = 'Start';

    const spacer = document.createElement('div');
    spacer.className = 'header-spacer';
    spacer.setAttribute('aria-hidden', 'true');

    header.appendChild(backBtn);
    header.appendChild(title);
    header.appendChild(spacer);

    // Main
    const main = document.createElement('main');
    main.className = 'app-main';
    main.id = 'app-main';

    const root = document.createElement('div');
    root.id = 'screen-root';
    root.className = 'list-column';
    main.appendChild(root);

    // Nav
    const nav = document.createElement('nav');
    nav.className = 'app-nav';

    const navScroller = document.createElement('div');
    navScroller.className = 'nav-scroller';

    const navRowEl = document.createElement('div');
    navRowEl.className = 'nav-row';
    navRowEl.id = 'nav-row';

    navRowEl.innerHTML = [
      '<button class="nav-btn" type="button" data-screen="start"><span class="nav-label">Start</span></button>',
      '<button class="nav-btn" type="button" data-screen="summary"><span class="nav-label">Summary</span></button>',
      '<button class="nav-btn" type="button" data-screen="horses"><span class="nav-label">Horses</span><span class="nav-agg" data-nav-agg="horses">0</span></button>',
      '<button class="nav-btn" type="button" data-screen="riders"><span class="nav-label">Riders</span><span class="nav-agg" data-nav-agg="riders">0</span></button>',
      '<button class="nav-btn" type="button" data-screen="schedule"><span class="nav-label">Schedule</span><span class="nav-agg" data-nav-agg="schedule">0</span></button>',    ].join('');

    navScroller.appendChild(navRowEl);
    nav.appendChild(navScroller);

    mount.appendChild(header);
    mount.appendChild(main);
    mount.appendChild(nav);

    // Refs
    appEl = mount;
    appMain = main;
    screenRoot = root;
    headerTitle = title;
    headerBack = backBtn;
    headerAction = document.getElementById('header-action'); // optional
    navRow = navRowEl;
  }

  mountShell();
  bindChromeScroll();

  function bindChromeScroll() {
    let lastTop = 0;
    const THRESH = 8;
    let ticking = false;

    function apply(dir, top) {
      if (top <= 4) {
        appEl.classList.remove('hide-header');
        appEl.classList.remove('hide-nav');
        return;
      }
      if (dir === 'down') {
        appEl.classList.add('hide-header');
        appEl.classList.add('hide-nav');
      } else if (dir === 'up') {
        appEl.classList.remove('hide-header');
        appEl.classList.remove('hide-nav');
      }
    }

    appMain.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const top = appMain.scrollTop || 0;
        const delta = top - lastTop;
        const dir = (delta > THRESH) ? 'down' : (delta < -THRESH) ? 'up' : null;
        if (dir) apply(dir, top);
        lastTop = top;
        ticking = false;
      });
    }, { passive: true });
  }


  // ----------------------------
  // STATE
  // ----------------------------
  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },

    screen: 'start',
    history: [],
    detail: null,

    // per-screen search
    search: {
      horses: '',
      rings: '',
      classes: '',
      riders: '',
      schedule: '',
    },

    filter: {
      horse: null,
      bucket: null
    },


    // list modes
    ridersMode: null,

    // optional: after render, scroll within main to an element id
    pendingScrollId: null
  };

  // ----------------------------
  // UTIL (DOM)
  // ----------------------------
  function el(tag, clsOrAttrs, text) {
    const n = document.createElement(tag);

    if (typeof clsOrAttrs === 'string') {
      if (clsOrAttrs) n.className = clsOrAttrs;
      if (text != null) n.textContent = text;
      return n;
    }

    if (clsOrAttrs && typeof clsOrAttrs === 'object') {
      const a = clsOrAttrs;

      if (a.className) n.className = a.className;
      if (a.text != null) n.textContent = a.text;
      if (a.html != null) n.innerHTML = a.html;

      if (a.id) n.id = a.id;
      if (a.href) n.setAttribute('href', a.href);
      if (a.type) n.setAttribute('type', a.type);
      if (a.placeholder) n.setAttribute('placeholder', a.placeholder);
      if (a.value != null) n.value = a.value;

      if (a.dataset && typeof a.dataset === 'object') {
        Object.keys(a.dataset).forEach(k => { n.dataset[k] = a.dataset[k]; });
      }

      if (a.style && typeof a.style === 'object') {
        Object.keys(a.style).forEach(k => { n.style[k] = a.style[k]; });
      }

      if (text != null) n.textContent = text;
      return n;
    }

    if (text != null) n.textContent = text;
    return n;
  }

  function normalizeStr(s) {
    return String(s || '').trim().toLowerCase();
  }

  function idify(s) {
    return normalizeStr(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }

  function clearRoot() {
    if (screenRoot) screenRoot.innerHTML = '';
  }

  function setHeader(title) {
    if (headerTitle) headerTitle.textContent = title || '';
    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
    if (headerAction) headerAction.hidden = true;
  }

  function setNavActive(primaryScreen) {
    if (!navRow) return;
    const btns = navRow.querySelectorAll('[data-screen]');
    btns.forEach(b => {
      const on = b.dataset.screen === primaryScreen;
      b.classList.toggle('nav-btn--primary', on);
    });
  }

  function setAgg(key, value) {
    const node = document.querySelector(`[data-nav-agg="${key}"]`);
    if (!node) return;
    node.textContent = String(value);
    node.classList.toggle('nav-agg--positive', Number(value) > 0);
  }

  // ----------------------------
  // UTIL (time)
  // ----------------------------
  function timeToMinutes(t) {
    if (!t) return null;
    const s0 = String(t).trim();
    if (!s0) return null;

    let m = s0.match(/^(\d{1,2}):(\d{2})\s*([AaPp])\s*([Mm])?$/);
    if (m) {
      let hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const ap = m[3].toUpperCase();
      if (ap === 'A') {
        if (hh === 12) hh = 0;
      } else {
        if (hh !== 12) hh += 12;
      }
      return hh * 60 + mm;
    }

    m = s0.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      if (hh < 0 || hh > 23) return null;
      if (mm < 0 || mm > 59) return null;
      return hh * 60 + mm;
    }

    return null;
  }

  function fmtTimeShort(t) {
    const mins = timeToMinutes(t);
    if (mins == null) return String(t || '').trim();

    const h24 = Math.floor(mins / 60) % 24;
    const m = mins % 60;

    const ap = h24 >= 12 ? 'P' : 'A';
    let h = h24 % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')}${ap}`;
  }

  function fmtClockFromMinutes(totalMinutes) {
    const mins = Math.max(0, Math.floor(totalMinutes));
    const h24 = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ap = h24 >= 12 ? 'P' : 'A';
    let h = h24 % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')}${ap}`;
  }

  function fmtStatus4(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    return s.toUpperCase().slice(0, 4);
  }

  // ----------------------------
  // UTIL (status)
  // ----------------------------
  function statusRank(statusText) {
    const s = String(statusText || '').toLowerCase();
    if (s.includes('underway')) return 3;
    if (s.includes('upcoming')) return 2;
    if (s.includes('complete')) return 1;
    return 0;
  }


  function safeNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback ?? null);
  }

  function fmtOogPair(lastOog, totalTrips) {
    const last = safeNum(lastOog, null);
    const total = safeNum(totalTrips, null);
    if (last == null) return '';
    if (total != null && total > 0) {
      if (last >= 1 && last <= total) return `${last}/${total}`;
      return '';
    }
    if (last >= 1) return String(last);
    return '';
  }

  function safeNumber(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;

    const s = String(v).trim();
    if (!s) return null;

    const n = Number(s.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function roundUpTo5Minutes(d) {
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(d.getTime() / ms) * ms);
  }

  function parseAmPmTimeToDate(dt, t) {
    const mins = timeToMinutes(t);
    if (mins == null) return null;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return new Date(`${dt}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);
  }

  function parseTripStartEnd(trip, opts) {
    const dt = (opts && opts.dt) ? opts.dt : (trip && trip.dt) ? String(trip.dt) : state.meta.dt;

    const startLabel = (trip && (trip.latestStart || trip.latestGO || trip.estimated_start_time))
      ? String(trip.latestStart || trip.latestGO || trip.estimated_start_time).trim()
      : '';
    if (!dt || !startLabel) return { start: null, end: null };

    const start = parseAmPmTimeToDate(dt, startLabel);
    if (!start) return { start: null, end: null };

    const tripsCount = safeNumber(trip && trip.total_trips);
    const nTrips = (tripsCount != null && tripsCount > 0) ? tripsCount : 1;

    const end = roundUpTo5Minutes(new Date(start.getTime() + (nTrips * DUR_PER_TRIP_SEC * 1000)));
    return { start, end };
  }

  // ----------------------------
  // SCROLL OFFSET FIX (peakbar)
  // ----------------------------
  function scrollToIdWithinMain(id) {
    if (!appMain) return;
    const target = document.getElementById(id);
    if (!target) return;

    const peakbar = appMain.querySelector('.peakbar');
    const offset = (peakbar ? peakbar.offsetHeight : 0) + 16;

    const mainRect = appMain.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const topInMain = (targetRect.top - mainRect.top) + appMain.scrollTop;
    const y = Math.max(0, topInMain - offset);

    appMain.scrollTo({ top: y, behavior: 'smooth' });
  }

  function applyPendingScroll() {
    if (!state.pendingScrollId) return;
    const id = state.pendingScrollId;
    state.pendingScrollId = null;
    scrollToIdWithinMain(id);
  }

  // ----------------------------
  // LOAD
  // ----------------------------
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.json();
  }


  function pickFirst(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
      if (obj[k] == null) continue;
      const v = obj[k];
      if (typeof v === 'string') {
        const s = v.trim();
        if (s) return s;
        continue;
      }
      return v;
    }
    return null;
  }

  function normalizeTripRecord(r) {
    if (!r || typeof r !== 'object') return null;
    const o = { ...r };

    const entryId = pickFirst(r, ['entry_id','entryId','entryID','entry']);
    if (entryId != null) o.entry_id = entryId;

    const horse = pickFirst(r, ['horseName','horse_name','horse_display','horse_name_display','horse_name_full','horse_full_name','horseFullName','horse_label','horseLabel','horse']);
    if (horse != null) {
      if (horse && typeof horse === 'object') {
        const hn = pickFirst(horse, ['horseName','horse_name','name','fullName','full_name','display','label','title']);
        if (hn != null) o.horseName = String(hn).trim();
      } else {
        o.horseName = String(horse).trim();
      }
    }

    // Guard: never display entry_id as a horse name
    if (o.horseName != null) {
      const hs = String(o.horseName).trim();
      const es = (entryId != null) ? String(entryId).trim() : '';
      if (!hs) {
        delete o.horseName;
      } else if (hs === '[object Object]') {
        delete o.horseName;
      } else if (/^horse\s*-/i.test(hs)) {
        delete o.horseName;
      } else if (/^\d+$/.test(hs) && es && hs === es) {
        delete o.horseName;
      }
    }
    
    const rider = pickFirst(r, ['riderName','rider_name','rider_display','rider_name_display','rider_full_name','riderFullName','rider_fullname','rider_label','riderLabel','rider']);
    const riderId = pickFirst(r, ['rider_id','riderId','riderID']);
    if (rider != null) {
      if (rider && typeof rider === 'object') {
        const rn = pickFirst(rider, ['riderName','rider_name','name','fullName','full_name','display','label','title']);
        if (rn != null) o.riderName = String(rn).trim();
      } else {
        o.riderName = String(rider).trim();
      }
    }

    // If riderName is split into parts, synthesize it
    if (o.riderName == null) {
      const fn = pickFirst(r, ['rider_first_name','riderFirstName','rider_first','riderFirst','rider_fname','riderFname','first_name','firstName']);
      const ln = pickFirst(r, ['rider_last_name','riderLastName','rider_last','riderLast','rider_lname','riderLname','last_name','lastName']);
      const name = `${(fn || '').toString().trim()} ${(ln || '').toString().trim()}`.trim();
      if (name) o.riderName = name;
    }

    // Guard: never display IDs / placeholders as rider names
    if (o.riderName != null) {
      const rs = String(o.riderName).trim();
      const rid = (riderId != null) ? String(riderId).trim() : '';
      if (!rs) {
        delete o.riderName;
      } else if (rs === '[object Object]') {
        delete o.riderName;
      } else if (/^rider\s*-/i.test(rs)) {
        delete o.riderName;
      } else if (/^\d+$/.test(rs) && rid && rs === rid) {
        delete o.riderName;
      }
    }
    
    const classId = pickFirst(r, ['class_id','classId','classID','class']);
    if (classId != null) o.class_id = safeNumber(classId) ?? classId;

    const groupId = pickFirst(r, ['class_group_id','classGroupId','classGroupID','group_id','groupId','groupID']);
    if (groupId != null) o.class_group_id = safeNumber(groupId) ?? groupId;

    const classNum = pickFirst(r, ['class_number','classNumber']);
    if (classNum != null) o.class_number = safeNumber(classNum) ?? classNum;

    const className = pickFirst(r, ['class_name','className','class_title']);
    if (className != null) o.class_name = String(className).trim();

    const groupName = pickFirst(r, ['group_name','class_group_name','groupName','division_name','group_title']);
    if (groupName != null) o.group_name = String(groupName).trim();

    const ringNum = pickFirst(r, ['ring_number','ringNumber','ring','ring_no','ringnum']);
    if (ringNum != null) o.ring_number = safeNumber(ringNum) ?? ringNum;

    const ringName = pickFirst(r, ['ringName','ring_name','ring_title','ringLabel']);
    if (ringName != null) o.ringName = String(ringName).trim();

    const latestStart = pickFirst(r, ['latestStart','latest_start','latest_start_time','estimated_start_time','estimatedStart24','estimatedStart','estimated_start','estimatedStartTime','start_time']);
    if (latestStart != null) o.latestStart = latestStart;

    const latestGO = pickFirst(r, ['latestGO','latest_go','latest_go_time','go_time','estimated_go_time','estimatedGo']);
    if (latestGO != null) o.latestGO = latestGO;

    const latestStatus = pickFirst(r, ['latestStatus','latest_status','status']);
    if (latestStatus != null) o.latestStatus = latestStatus;

    const lastOOG = pickFirst(r, ['lastOOG','last_oog','oog_last','last_oog_position','oog']);
    if (lastOOG != null) o.lastOOG = safeNumber(lastOOG) ?? lastOOG;

    const placing = pickFirst(r, ['latestPlacing','latest_placing','placing','place']);
    if (placing != null) o.latestPlacing = safeNumber(placing) ?? placing;

    const tripsCt = pickFirst(r, ['total_trips','trip_count','trips','totalTrips']);
    if (tripsCt != null) o.total_trips = safeNumber(tripsCt) ?? tripsCt;

    const dt = pickFirst(r, ['dt','date','sql_date','base_sql_date']);
    if (dt != null) o.dt = dt;

    const sid = pickFirst(r, ['sid','show_id','showId']);
    if (sid != null) o.sid = sid;

    return o;
  }

  async function fetchJsonFirst(urls) {
    let lastErr = null;
    for (const u of urls) {
      try { return await fetchJson(u); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('fetch failed');
  }


  async function loadAll() {
  // Decoupled loads:
  // - watch_trips.json must be able to refresh even if watch_schedule.json fails
  // - watch_schedule.json is optional scaffold for Schedule view
  let sched = null;
  let trips = null;
  let schedOk = false;
  let tripsOk = false;

  try {
    trips = await fetchJsonFirst([DATA_TRIPS_URL, '/schedule/data/latest/watch_trips.json', '../data/latest/watch_trips.json']);
    tripsOk = true;
  } catch (e) {
    // Keep prior state.trips on failure
    console.warn('load failed: watch_trips.json', e);
  }

  try {
    sched = await fetchJsonFirst([DATA_SCHEDULE_URL, '/schedule/data/latest/watch_schedule.json', '../data/latest/watch_schedule.json']);
    schedOk = true;
  } catch (e) {
    // Keep prior state.schedule on failure
    console.warn('load failed: watch_schedule.json', e);
  }

  const nextGenerated =
    (schedOk && sched && sched.meta && sched.meta.generated_at) ||
    (tripsOk && trips && trips.meta && trips.meta.generated_at) ||
    null;

  if (state.loaded && nextGenerated && state.meta.generated_at === nextGenerated) return;

  if (schedOk) state.schedule = Array.isArray(sched && sched.records) ? sched.records : [];
  if (tripsOk) {
    const raw = Array.isArray(trips && trips.records) ? trips.records : [];
    state.trips = raw.map(normalizeTripRecord).filter(Boolean);
  }

  const dtScope =
    (schedOk && sched && sched.meta && sched.meta.dt) ||
    (state.schedule[0] && state.schedule[0].dt) ||
    (tripsOk && trips && trips.meta && trips.meta.dt) ||
    (state.trips[0] && state.trips[0].dt) ||
    state.meta.dt ||
    null;

  const sidScope =
    (schedOk && sched && sched.meta && sched.meta.sid) ||
    (state.schedule[0] && state.schedule[0].sid) ||
    (tripsOk && trips && trips.meta && trips.meta.sid) ||
    (state.trips[0] && state.trips[0].sid) ||
    state.meta.sid ||
    null;

  state.meta = { dt: dtScope, sid: sidScope, generated_at: nextGenerated || state.meta.generated_at || null };
  state.loaded = state.loaded || schedOk || tripsOk;

  render();
}

  setInterval(() => { loadAll().catch(() => {}); }, REFRESH_MS);

  // ----------------------------
  // INDEXES (schedule scaffold + trips truth)
  // ----------------------------
  function buildScheduleIndex() {
    const ringMap = new Map();
    const classMap = new Map();

    for (const r of (state.schedule || [])) {
      if (!r) continue;

      const ringN = r.ring_number;
      const gid = r.class_group_id;
      const cid = r.class_id;

      if (ringN == null || gid == null || cid == null) continue;

      const ringKey = String(ringN);
      const ringName = r.ringName || (ringN != null ? `Ring ${ringN}` : 'Ring');

      if (!ringMap.has(ringKey)) {
        ringMap.set(ringKey, { ring_number: ringN, ringName, groups: new Map() });
      }
      const ringObj = ringMap.get(ringKey);

      const gidKey = String(gid);
      if (!ringObj.groups.has(gidKey)) {
        ringObj.groups.set(gidKey, {
          class_group_id: gid,
          group_name: r.group_name || r.class_name || '(Group)',
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null,
          classes: new Map()
        });
      }
      const gObj = ringObj.groups.get(gidKey);

      const cidKey = String(cid);
      if (!gObj.classes.has(cidKey)) {
        gObj.classes.set(cidKey, {
          class_id: cid,
          class_number: r.class_number,
          class_name: r.class_name || '(Class)',
          latestStart: r.latestStart || null,
          latestStatus: r.latestStatus || null
        });
      }

      if (!classMap.has(cidKey)) classMap.set(cidKey, r);
    }

    return { ringMap, classMap };
  }

  function pickBestTrip(tripsList) {
    if (!tripsList || tripsList.length === 0) return null;

    let best = null;
    let bestT = 999999;
    let bestO = 999999;

    for (const t of tripsList) {
      const goM = timeToMinutes(t && (t.latestGO || t.latestStart)) ?? 999999;
      const oog = (t && t.lastOOG != null) ? safeNum(t.lastOOG, 999999) : 999999;

      if (!best) {
        best = t; bestT = goM; bestO = oog;
        continue;
      }

      if (goM < bestT) { best = t; bestT = goM; bestO = oog; continue; }
      if (goM === bestT && oog < bestO) { best = t; bestT = goM; bestO = oog; continue; }
    }

    return best;
  }

  function buildTruthIndex() {
    const byEntryKey = new Map();
    const byHorse = new Map();
    const byRing = new Map();
    const byGroup = new Map();
    const byClass = new Map();
    const byRider = new Map();

    function pushKey(map, k, entryKey) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(entryKey);
    }

    for (const t of (state.trips || [])) {
      if (!t) continue;

      const horse = t.horseName ? String(t.horseName) : null;
      const cid = t.class_id != null ? String(t.class_id) : null;
      if (!horse || !cid) continue;

      const entryKey = `${cid}|${horse}`;

      if (!byEntryKey.has(entryKey)) byEntryKey.set(entryKey, []);
      byEntryKey.get(entryKey).push(t);

      pushKey(byHorse, horse, entryKey);
      if (t.ring_number != null) pushKey(byRing, String(t.ring_number), entryKey);
      if (t.class_group_id != null) pushKey(byGroup, String(t.class_group_id), entryKey);
      pushKey(byClass, cid, entryKey);

      if (t.riderName) pushKey(byRider, String(t.riderName), entryKey);
    }

    const entryBest = new Map();
    for (const [k, list] of byEntryKey.entries()) {
      entryBest.set(k, pickBestTrip(list));
    }

    function uniqKeys(arr) {
      const out = [];
      const seen = new Set();
      for (const k of (arr || [])) {
        if (!seen.has(k)) { seen.add(k); out.push(k); }
      }
      return out;
    }

    for (const [k, arr] of byHorse.entries()) byHorse.set(k, uniqKeys(arr));
    for (const [k, arr] of byRing.entries()) byRing.set(k, uniqKeys(arr));
    for (const [k, arr] of byGroup.entries()) byGroup.set(k, uniqKeys(arr));
    for (const [k, arr] of byClass.entries()) byClass.set(k, uniqKeys(arr));
    for (const [k, arr] of byRider.entries()) byRider.set(k, uniqKeys(arr));

    return { byEntryKey, entryBest, byHorse, byRing, byGroup, byClass, byRider };
  }

  // ----------------------------
  // RENDER HELPERS (cards + peaks)
  // ----------------------------
  function makeTagCount(n) {
    const t = el('div', 'row-tag row-tag--count', String(n));
    if (Number(n) > 0) t.classList.add('row-tag--positive');
    return t;
  }
  function fmtNextUpFromEntryKeys(entryKeys, tIdx) {
    const now = new Date();
    const nowM = now.getHours() * 60 + now.getMinutes();

    const candidates = [];
    for (const k of (entryKeys || [])) {
      const list = (tIdx && tIdx.byEntryKey) ? (tIdx.byEntryKey.get(k) || []) : [];
      if (!list || list.length === 0) continue;

      // eligible: exclude underway/complete
      const eligible = list.filter((t) => {
        const s = String(t && t.latestStatus ? t.latestStatus : t && t.status ? t.status : '').toLowerCase();
        if (s.includes('underway')) return false;
        if (s.includes('complete')) return false;
        return true;
      });
      if (!eligible.length) continue;

      // split by time relative to now
      let bestFuture = null;
      let bestFutureT = 999999;
      let bestFutureO = 999999;

      let bestPast = null;
      let bestPastT = -1;
      let bestPastO = -1;

      for (const t of eligible) {
        const goM = timeToMinutes(t && (t.latestGO || t.latestStart)) ?? -1;
        const oog = (t && t.lastOOG != null) ? safeNum(t.lastOOG, 999999) : 999999;

        if (goM >= nowM) {
          if (!bestFuture || goM < bestFutureT || (goM === bestFutureT && oog < bestFutureO)) {
            bestFuture = t; bestFutureT = goM; bestFutureO = oog;
          }
        } else if (goM >= 0) {
          // closest past (largest time)
          if (!bestPast || goM > bestPastT || (goM === bestPastT && oog > bestPastO)) {
            bestPast = t; bestPastT = goM; bestPastO = oog;
          }
        } else {
          // no parsable time: treat as future-ish fallback
          if (!bestFuture) bestFuture = t;
        }
      }

      candidates.push(bestFuture || bestPast);
    }

    if (!candidates.length) return '';

    // choose earliest future across candidates; fallback to closest past
    let chosen = null;
    let chosenFuture = false;

    let bestT = 999999;
    let bestO = 999999;

    let bestPastT = -1;
    let bestPastO = -1;
    let bestPastTrip = null;

    for (const t of candidates) {
      if (!t) continue;
      const goM = timeToMinutes(t && (t.latestGO || t.latestStart)) ?? -1;
      const oog = (t && t.lastOOG != null) ? safeNum(t.lastOOG, 999999) : 999999;

      if (goM >= nowM) {
        if (!chosenFuture || goM < bestT || (goM === bestT && oog < bestO)) {
          chosenFuture = true;
          chosen = t; bestT = goM; bestO = oog;
        }
      } else if (!chosenFuture && goM >= 0) {
        if (!bestPastTrip || goM > bestPastT || (goM === bestPastT && oog > bestPastO)) {
          bestPastTrip = t; bestPastT = goM; bestPastO = oog;
        }
      } else if (!chosenFuture && !bestPastTrip) {
        bestPastTrip = t;
      }
    }

    if (!chosen && bestPastTrip) chosen = bestPastTrip;
    if (!chosen) return '';

    const parts = [];
    if (chosen.ring_number != null && String(chosen.ring_number) !== '') {
      parts.push(`R${String(chosen.ring_number)}`);
    }
    const t = chosen.latestGO || chosen.latestStart || '';
    if (t) parts.push(fmtTimeShort(t));
    const n = safeNum(chosen.lastOOG, null);
    if (n != null && n >= 1) parts.push(String(n));

    return parts.join(' - ');
  }

  function ribbonCountFromEntryKeys(entryKeys, tIdx) {
    let c = 0;
    for (const k of (entryKeys || [])) {
      const best = tIdx && tIdx.entryBest ? tIdx.entryBest.get(k) : null;
      if (!best) continue;
      const pRaw = (best.latestPlacing != null ? best.latestPlacing : best.lastestPlacing);
      const p = safeNum(pRaw, null);
      if (p != null && p >= 1 && p <= 8) c++;
    }
    return c;
  }



  function renderSearch(screenKey, placeholder) {
    const wrap = el('div', 'state-search');
    const input = el('input', 'state-search-input');
    input.type = 'text';
    input.placeholder = placeholder || 'Search...';
    input.value = state.search[screenKey] || '';

    input.addEventListener('input', () => {
      state.search[screenKey] = input.value;
      render();
    });

    wrap.appendChild(input);
    return wrap;
  }

  function renderPeakBar(items) {
    const root = el('div', 'peakbar');
    const scroller = el('div', 'nav-scroller');
    const row = el('div', 'nav-row peakbar-row');

    items.forEach((it) => {
      if (typeof it.agg === 'number' && it.agg === 0) return;

      const a = el('a', 'nav-btn');
      a.href = it.href || '#';
      a.appendChild(el('span', 'nav-label', it.label));

      if (typeof it.agg === 'number') {
        const aggCls = 'nav-agg' + (it.agg > 0 ? ' nav-agg--positive' : '');
        a.appendChild(el('span', aggCls, String(it.agg)));
      }

      a.addEventListener('click', (ev) => {
        const href = it.href || '';
        const hash = href.split('#')[1] || '';
        if (!hash) return;
        ev.preventDefault();
        scrollToIdWithinMain(hash);
        history.replaceState(null, '', `#${hash}`);
      });

      row.appendChild(a);
    });

    scroller.appendChild(row);
    root.appendChild(scroller);
    return root;
  }

    // ----------------------------
  // Filterbottom (horse chips) — schedule only
  // ----------------------------
  function buildHorseChips(qRing, sIdx) {
    const q = normalizeStr(qRing || '');
    const map = new Map();

    for (const t of (state.trips || [])) {
      if (!t) continue;
      if (t.ring_number == null) continue;

      const ringName = (t.ringName ? String(t.ringName) : (sIdx && sIdx.ringMap && sIdx.ringMap.get(String(t.ring_number)) ? String(sIdx.ringMap.get(String(t.ring_number)).ringName || '') : `Ring ${t.ring_number}`));
      if (q && !normalizeStr(ringName).includes(q)) continue;

      const key = (t.entry_id != null) ? String(t.entry_id) : (t.horseName ? String(t.horseName) : null);
      if (!key) continue;

      const label = t.horseName ? String(t.horseName) : key;
      map.set(key, label);
    }

    const items = [...map.entries()].map(([key, label]) => ({ key, label }));
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
  }

  function clearFilterBottom() {
    const existing = document.getElementById('filterbottom');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function renderFilterBottom(items, activeKey) {
    // Only for schedule screen
    if (state.screen !== 'schedule') {
      clearFilterBottom();
      return;
    }

    clearFilterBottom();

    const bar = document.createElement('div');
    bar.className = 'filterbottom';
    bar.id = 'filterbottom';

    const row = document.createElement('div');
    row.className = 'filterbottom-row';

    function addChip(label, key) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-btn' + ((key === activeKey) ? ' is-active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.filter = state.filter || { horse: null };
        state.filter.horse = (key === activeKey) ? null : (key || null);
        render();
      });
      row.appendChild(btn);
    }

    // All chip (always)
    addChip('All', null);

    // If a horse is active, only show that horse (plus All)
    if (activeKey) {
      const found = items.find(x => x.key === activeKey);
      if (found) addChip(found.label, found.key);
    } else {
      items.forEach(it => addChip(it.label, it.key));
    }

    bar.appendChild(row);

    // Insert above nav
    const nav = appEl && appEl.querySelector('.app-nav');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav);
    else (appEl || document.body).appendChild(bar);
  }

  // ----------------------------
  // FILTERBOTTOM (time buckets) — detail + timeline screens
  // ----------------------------
  const BUCKET_FILTER_SCREENS = new Set(['horseDetail','riderDetail','classDetail']);

  function getTripStartMinutes(t) {
    if (!t) return null;
    // tolerate legacy typos (lastest*) and fallbacks
    return timeToMinutes(t.latestStart || t.lastestStart || t.latestGO || t.lastestGO || t.estimated_start_time || '');
  }

  function getTripBucketKey(t, bucketSizeMins) {
    const mins = getTripStartMinutes(t);
    if (mins == null) return null;
    const size = bucketSizeMins || 30;
    const b = Math.floor(mins / size) * size;
    return String(b);
  }

  function buildBucketChipsFromTrips(trips, bucketSizeMins) {
    const size = bucketSizeMins || 30;
    const counts = new Map(); // key (minutes as string) -> count
    for (const t of (trips || [])) {
      const key = getTripBucketKey(t, size);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const keys = [...counts.keys()].sort((a, b) => Number(a) - Number(b));
    const items = [{ key: null, label: 'All', agg: (trips || []).length }];

    for (const k of keys) {
      const mins = Number(k);
      items.push({
        key: k,
        label: fmtClockFromMinutes(mins),
        agg: counts.get(k) || 0
      });
    }
    return items;
  }

  function filterTripsByBucket(trips, bucketKey, bucketSizeMins) {
    const key = (bucketKey == null) ? null : String(bucketKey);
    if (!key) return (trips || []);
    const size = bucketSizeMins || 30;
    return (trips || []).filter(t => getTripBucketKey(t, size) === key);
  }

  function renderBucketFilterBottom(items, activeKey) {
    if (!BUCKET_FILTER_SCREENS.has(state.screen)) {
      clearFilterBottom();
      return;
    }

    clearFilterBottom();

    const bar = document.createElement('div');
    bar.className = 'filterbottom';
    bar.id = 'filterbottom';

    const row = document.createElement('div');
    row.className = 'filterbottom-row';

    function addChip(label, key) {
      const btn = document.createElement('button');
      btn.type = 'button';

      const k = (key == null || key === '') ? null : String(key);
      const a = (activeKey == null || activeKey === '') ? null : String(activeKey);

      const isOn = (k == null && a == null) || (k != null && a != null && k === a);
      btn.className = 'nav-btn' + (isOn ? ' is-active' : '');
      btn.textContent = String(label || '');

      btn.addEventListener('click', () => {
        state.filter = state.filter || { horse: null, bucket: null };
        state.filter.bucket = (isOn ? null : k);
        render();
      });

      row.appendChild(btn);
    }

    for (const it of (items || [])) {
      addChip(it.label, it.key);
    }

    bar.appendChild(row);

    // Insert above nav (same as schedule bottom filter)
    const nav = appEl && appEl.querySelector('.app-nav');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav);
    else (appEl || document.body).appendChild(bar);
  }

function makeCard(title, aggValue, inverseHdr, onClick) {
    const card = el('div', 'card' + (onClick ? ' card--tap' : ''));
    if (onClick) card.addEventListener('click', onClick);

    const hdr = el('div', 'card-hdr' + (inverseHdr ? ' card-hdr--inverse' : ''));
    hdr.appendChild(el('div', 'card-title', title));

    if (aggValue != null && Number(aggValue) > 0) {
      hdr.appendChild(makeTagCount(aggValue));
    }

    card.appendChild(hdr);
    card.appendChild(el('div', 'card-body'));
    return card;
  }

  function addCardLine(card, leftTxt, midTxt, rightNode, handlers) {
    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    const l = el('div', 'c-time', leftTxt || '');
    const m = el('div', 'c-name', midTxt || '');
    const r = el('div', 'c-agg');
    if (rightNode) r.appendChild(rightNode);

    if (handlers && handlers.onLeft) {
      l.style.cursor = 'pointer';
      l.addEventListener('click', (e) => { e.stopPropagation(); handlers.onLeft(); });
    }
    if (handlers && handlers.onMid) {
      m.style.cursor = 'pointer';
      m.addEventListener('click', (e) => { e.stopPropagation(); handlers.onMid(); });
    }
    if (handlers && handlers.onRight) {
      r.style.cursor = 'pointer';
      r.addEventListener('click', (e) => { e.stopPropagation(); handlers.onRight(); });
    }
    if (handlers && handlers.onRow) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', () => handlers.onRow());
    }

    line.appendChild(l);
    line.appendChild(m);
    line.appendChild(r);
    body.appendChild(line);
  }

  function addCardLine4(card, aTxt, bTxt, cTxt, dNodeOrTxt, handlers) {
    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line4');

    const a = el('div', 'c4-a', aTxt || '');
    const b = el('div', 'c4-b', bTxt || '');
    const c = el('div', 'c4-c', cTxt || '');
    const d = el('div', 'c4-d');

    if (dNodeOrTxt && typeof dNodeOrTxt === 'object' && dNodeOrTxt.nodeType) {
      d.appendChild(dNodeOrTxt);
    } else if (dNodeOrTxt != null) {
      d.textContent = String(dNodeOrTxt);
    }

    if (handlers && handlers.onA) {
      a.style.cursor = 'pointer';
      a.addEventListener('click', (e) => { e.stopPropagation(); handlers.onA(); });
    }
    if (handlers && handlers.onB) {
      b.style.cursor = 'pointer';
      b.addEventListener('click', (e) => { e.stopPropagation(); handlers.onB(); });
    }
    if (handlers && handlers.onC) {
      c.style.cursor = 'pointer';
      c.addEventListener('click', (e) => { e.stopPropagation(); handlers.onC(); });
    }
    if (handlers && handlers.onD) {
      d.style.cursor = 'pointer';
      d.addEventListener('click', (e) => { e.stopPropagation(); handlers.onD(); });
    }
    if (handlers && handlers.onRow) {
      line.style.cursor = 'pointer';
      line.addEventListener('click', () => handlers.onRow());
    }

    line.appendChild(a);
    line.appendChild(b);
    line.appendChild(c);
    line.appendChild(d);
    body.appendChild(line);
  }

  function addEntryRollup(card, bestTrips, onChipClick) {
    if (!bestTrips || bestTrips.length === 0) return;

    const body = card.querySelector('.card-body');
    const line = el('div', 'card-line');

    line.appendChild(el('div', 'c-time', ''));

    const mid = el('div', 'c-name');
    const roll = el('div', 'entry-rollup-grid');

    bestTrips.forEach((t) => {
      const label = (typeof onChipClick === 'function')
        ? onChipClick(t, roll, card)
        : null;

      if (label === null) return;
    });

    if (!roll.childNodes.length) return;

    mid.appendChild(roll);
    line.appendChild(mid);
    line.appendChild(el('div', 'c-agg'));
    body.appendChild(line);
  }

  function addHorseChipsRollup(card, trips) {
    if (!trips || trips.length === 0) return;

    const sorted = trips.slice().sort((a, b) => {
      const oa = safeNum(a.lastOOG, 999999);
      const ob = safeNum(b.lastOOG, 999999);
      if (oa !== ob) return oa - ob;
      return String(a.horseName || '').localeCompare(String(b.horseName || ''));
    });

    addEntryRollup(card, sorted, (t, roll) => {
      const horse = (t && t.horseName) ? String(t.horseName).trim() : '';
      const oog = (t && t.lastOOG != null && String(t.lastOOG).trim() !== '') ? String(t.lastOOG).trim() : '';
      if (!horse || !oog) return null;

      const chip = el('button', { className: 'entry-chip', type: 'button', text: `${horse} - ${oog}` });
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        pushDetail('horseDetail', { kind: 'horse', key: horse });
      });

      roll.appendChild(chip);
      return '';
    });
  }

  function addRiderChipsRollup(card, trips) {
    if (!trips || trips.length === 0) return;

    const bestByRider = new Map();
    for (const t of trips) {
      const rn = t && t.riderName ? String(t.riderName).trim() : '';
      if (!rn) continue;
      const oog = safeNum(t.lastOOG, 999999);
      if (!bestByRider.has(rn) || oog < bestByRider.get(rn).oog) {
        bestByRider.set(rn, { riderName: rn, oog: oog, raw: t });
      }
    }

    const list = [...bestByRider.values()].sort((a, b) => {
      if (a.oog !== b.oog) return a.oog - b.oog;
      return String(a.riderName).localeCompare(String(b.riderName));
    });

    addEntryRollup(card, list, (it, roll) => {
      const riderName = it && it.riderName ? String(it.riderName).trim() : '';
      if (!riderName) return null;
      const oogTxt = (Number.isFinite(it.oog) && it.oog !== 999999) ? String(it.oog) : '';
      const chipTxt = oogTxt ? `${riderName} - ${oogTxt}` : riderName;

      const chip = el('button', { className: 'entry-chip', type: 'button', text: chipTxt });
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        pushDetail('riderDetail', { kind: 'rider', key: riderName });
      });

      roll.appendChild(chip);
      return '';
    });
  }

  // ----------------------------
  // NAV / DETAILS
  // ----------------------------
  function goto(screen) {
    state.screen = screen;
    state.detail = null;
    state.history = [];
    render();
  }

  function pushDetail(screen, detail) {
    const fromPrimary = getPrimaryForScreen(state.screen);
    const d = Object.assign({}, detail || {}, { _fromPrimary: fromPrimary });

    state.history.push({ screen: state.screen, detail: state.detail });
    state.screen = screen;
    state.detail = d;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return;
    state.screen = prev.screen;
    state.detail = prev.detail;
    render();
  }

  function getPrimaryForScreen(screen) {
    if (screen && /Detail$/.test(screen) && state.detail && state.detail._fromPrimary) {
      return state.detail._fromPrimary;
    }

    const map = {
      start: 'start',


      summary: 'summary',
      horses: 'horses',
      horseDetail: 'horses',

      rings: 'schedule',
      schedule: 'schedule',
      ringDetail: 'schedule',
      groupDetail: 'schedule',
      classDetail: 'schedule',

      riders: 'riders',
      riderDetail: 'riders',
    };
    return map[screen] || 'start';
  }

  // ----------------------------
  // AGGS (truth only)
  // ----------------------------
  function renderAggs(_sIdx, tIdx) {
    setAgg('horses', tIdx.byHorse.size);
    setAgg('riders', tIdx.byRider.size);
    setAgg('schedule', tIdx.byClass.size);
  }

  
  // ----------------------------
  // SCREEN: SUMMARY
  // ----------------------------
  function renderSummary(_sIdx, tIdx) {
    clearRoot();
    setHeader('Summary');

    // Classes: completed vs not completed (truth-only)
    let completed = 0;
    let notCompleted = 0;

    for (const [cid, entryKeys] of tIdx.byClass.entries()) {
      let maxRank = 0;
      for (const k of (entryKeys || [])) {
        const best = tIdx.entryBest.get(k);
        if (!best) continue;
        const r = statusRank(best.latestStatus);
        if (r > maxRank) maxRank = r;
      }
      if (maxRank === 1) completed++;
      else notCompleted++;
    }

    // Ribbons: count placings 1..8 (truth-only, per entryKey best)
    const ribbonByPlace = { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0 };
    for (const best of tIdx.entryBest.values()) {
      if (!best) continue;
      const pRaw = (best.latestPlacing != null ? best.latestPlacing : best.lastestPlacing);
      const p = safeNum(pRaw, null);
      if (p != null && p >= 1 && p <= 8) ribbonByPlace[p] = (ribbonByPlace[p] || 0) + 1;
    }
    const ribbonsTotal = Object.values(ribbonByPlace).reduce((a,b)=>a+b, 0);

    const grid = el('div', 'summary-grid');

    function tile(title, lines, onClick) {
      const card = el('div', 'card summary-tile');
      if (typeof onClick === 'function') {
        card.classList.add('summary-tile--tap');
        card.addEventListener('click', onClick);
      }
      const body = el('div', 'card-body summary-body');
      card.appendChild(body);

      body.appendChild(el('div', 'summary-title', title));

      const wrap = el('div', 'summary-lines');
      for (const line of (lines || [])) {
        const row = el('div', 'summary-line');
        row.appendChild(el('div', 'summary-k', String(line.k || '')));
        row.appendChild(el('div', 'summary-v', String(line.v || '')));
        wrap.appendChild(row);
      }
      body.appendChild(wrap);
      return card;
    }

    grid.appendChild(tile('Classes', [
      { k: 'Completed', v: completed },
      { k: 'Not Completed', v: notCompleted },
    ], () => { state.ridersMode = null; goto('schedule'); }));

    grid.appendChild(tile('Horses', [
      { k: 'Unique', v: tIdx.byHorse.size },
    ], () => { state.ridersMode = null; goto('horses'); }));

    grid.appendChild(tile('Riders', [
      { k: 'Unique', v: tIdx.byRider.size },
    ], () => { state.ridersMode = null; goto('riders'); }));

    const ribbonLines = [
      { k: 'Total', v: ribbonsTotal },
      { k: '1-4', v: (ribbonByPlace[1]+ribbonByPlace[2]+ribbonByPlace[3]+ribbonByPlace[4]) },
      { k: '5-8', v: (ribbonByPlace[5]+ribbonByPlace[6]+ribbonByPlace[7]+ribbonByPlace[8]) },
    ];

    grid.appendChild(tile('Ribbons (1-8)', ribbonLines, () => {
      state.ridersMode = 'ribbons';
      goto('riders');
    }));

    screenRoot.appendChild(grid);
  }

// ----------------------------
  // SCREEN: START
  // ----------------------------
  function renderStart() {
    clearRoot();
    setHeader('Start');

    const wrap = el('div', 'list-column');

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

    const btn = el('div', 'row row--tap');
    btn.appendChild(el('div', 'row-title', 'Start Session'));
    btn.appendChild(el('div', 'row-tag row-tag--count', 'GO'));
    btn.addEventListener('click', async () => {
      if (!state.loaded) {
        try { await loadAll(); } catch (_) {}
      }
      goto('schedule');
    });
    wrap.appendChild(btn);

    screenRoot.appendChild(wrap);
  }

  // ----------------------------
  // SCREEN: HORSES (list -> detail)
  // ----------------------------
  function renderHorses(_sIdx, tIdx) {
    clearRoot();
    setHeader('Horses');

    screenRoot.appendChild(renderSearch('horses', 'Search horses...'));

    const q = normalizeStr(state.search.horses);
    const horsesAll = [...tIdx.byHorse.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    const horses = q ? horsesAll.filter(h => normalizeStr(h).includes(q)) : horsesAll;

    for (const h of horses) {
      const keys = tIdx.byHorse.get(String(h)) || [];
      if (keys.length === 0) continue;

      const nextup = fmtNextUpFromEntryKeys(keys, tIdx);

      const row = el('div', 'row row--tap row--3col');
      row.id = `horse-${idify(h)}`;

      row.appendChild(el('div', 'row-title', String(h)));
      row.appendChild(el('div', 'row-mid', nextup || ''));
      row.appendChild(makeTagCount(keys.length));

      row.addEventListener('click', () => {
        pushDetail('horseDetail', { kind: 'horse', key: String(h) });
      });

      screenRoot.appendChild(row);
    }
  }

  function findGroupInSchedule(sIdx, gid) {
    const gidStr = String(gid);
    for (const r of sIdx.ringMap.values()) {
      if (r.groups.has(gidStr)) {
        return { ring: r, group: r.groups.get(gidStr) };
      }
    }
    return null;
  }

  function findClassInSchedule(sIdx, classId) {
    const cidStr = String(classId);
    for (const r of sIdx.ringMap.values()) {
      for (const g of r.groups.values()) {
        if (g.classes.has(cidStr)) {
          return { ring: r, group: g, cls: g.classes.get(cidStr) };
        }
      }
    }
    return null;
  }
  // ----------------------------
  // SCHEDULE-STYLE RING CARDS (shared)
  // ----------------------------
  function renderRingCardsFromTrips(trips, sIdx, opts) {
    const options = opts || {};
    const qRing = options.qRing ? normalizeStr(options.qRing) : '';
    const horseFilter = (options.horseFilter != null && String(options.horseFilter) !== '') ? String(options.horseFilter) : null;

    // Build hierarchy from watch_trips (flat -> dimensions)
    // ring_number -> group_id -> class_id -> class_number -> entry_id -> trips
    const ringMap = new Map();

    function ringSortKey(rn) { return safeNum(rn, 999999); }

    function statusRank(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 3;
      if (s.includes('upcoming')) return 2;
      if (s.includes('complete')) return 1;
      return 0;
    }

    function statusLetter(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 'L';
      if (s.includes('upcoming')) return 'S';
      if (s.includes('complete')) return 'C';
      return '';
    }

    function statusTintClass(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 'tint-L';
      if (s.includes('upcoming')) return 'tint-S';
      if (s.includes('complete')) return 'tint-C';
      return '';
    }

    function getRingNameFromTrip(t) {
      if (t && t.ringName) return String(t.ringName);
      const rn = t && t.ring_number != null ? String(t.ring_number) : null;
      const rObj = rn && sIdx && sIdx.ringMap ? sIdx.ringMap.get(rn) : null;
      if (rObj && rObj.ringName) return String(rObj.ringName);
      return rn ? `Ring ${rn}` : 'Ring';
    }

    function getOrInit(map, key, factory) {
      if (!map.has(key)) map.set(key, factory());
      return map.get(key);
    }

    for (const t of (trips || [])) {
      if (!t) continue;
      if (t.ring_number == null) continue;
      if (t.class_id == null) continue;

      // ring search filter (optional)
      const rnStr = String(t.ring_number);
      const ringName = getRingNameFromTrip(t);
      if (qRing && !normalizeStr(ringName).includes(qRing)) continue;

      // optional horse filter (entry_id preferred; fallback horseName)
      const entryKey = (t.entry_id != null) ? String(t.entry_id) : (t.horseName ? String(t.horseName) : null);
      if (!entryKey) continue;
      if (horseFilter && entryKey !== horseFilter) continue;

      const ringObj = getOrInit(ringMap, rnStr, () => ({
        ring_number: t.ring_number,
        ringName,
        classIdSet: new Set(),
        groups: new Map()
      }));

      ringObj.classIdSet.add(String(t.class_id));

      const gid = (t.class_group_id != null) ? String(t.class_group_id) : '__nogroup__';
      const groupObj = getOrInit(ringObj.groups, gid, () => ({
        class_group_id: gid,
        group_name: String(t.group_name || ''),
        latestStart: t.latestStart || '',
        latestStatus: t.latestStatus || '',
        statusRank: statusRank(t.latestStatus || ''),
        classes: new Map()
      }));

      // roll up group status and start
      if (statusRank(t.latestStatus || '') > groupObj.statusRank) {
        groupObj.latestStatus = t.latestStatus || '';
        groupObj.statusRank = statusRank(t.latestStatus || '');
      }
      // group start: keep earliest if possible
      const curM = timeToMinutes(groupObj.latestStart || '');
      const tM = timeToMinutes(t.latestStart || '');
      if (curM == null || (tM != null && tM < curM)) groupObj.latestStart = t.latestStart || groupObj.latestStart;

      const cid = String(t.class_id);
      const classObj = getOrInit(groupObj.classes, cid, () => ({
        class_id: cid,
        class_number: t.class_number,
        class_name: String(t.class_name || ''),
        class_type: t.class_type || '',
        schedule_sequencetype: t.schedule_sequencetype || '',
        classNumbers: new Map()
      }));

      // allow updates
      if (!classObj.class_name && t.class_name) classObj.class_name = String(t.class_name || '');
      if (classObj.class_number == null && t.class_number != null) classObj.class_number = t.class_number;
      if (!classObj.class_type && t.class_type) classObj.class_type = t.class_type;
      if (!classObj.schedule_sequencetype && t.schedule_sequencetype) classObj.schedule_sequencetype = t.schedule_sequencetype;

      const cnKey = (t.class_number != null) ? String(t.class_number) : '__noclassnum__';
      const classNumObj = getOrInit(classObj.classNumbers, cnKey, () => ({
        class_id: cid, // IMPORTANT: used by class row click
        class_number: t.class_number,
        latestStart: t.latestStart || '',
        latestStatus: t.latestStatus || '',
        total_trips: safeNum(t.total_trips, 0),
        entries: new Map()
      }));

      // roll up
      if (t.latestStart) classNumObj.latestStart = t.latestStart;
      if (t.latestStatus) classNumObj.latestStatus = t.latestStatus;
      if (t.total_trips != null) classNumObj.total_trips = Math.max(classNumObj.total_trips || 0, safeNum(t.total_trips, 0));

      const eKey = (t.entry_id != null) ? String(t.entry_id) : (t.entryNumber != null ? String(t.entryNumber) : entryKey);
      const entryObj = getOrInit(classNumObj.entries, eKey, () => ({
        entry_id: eKey,
        entryNumber: t.entryNumber != null ? String(t.entryNumber) : '',
        horseName: String(t.horseName || ''),
        trips: []
      }));

      if (!entryObj.horseName && t.horseName) entryObj.horseName = String(t.horseName || '');
      if (!entryObj.entryNumber && t.entryNumber != null) entryObj.entryNumber = String(t.entryNumber);

      entryObj.trips.push(t);
    }

    const ringsAll = [...ringMap.values()]
      .filter(r => r && r.groups && r.groups.size > 0)
      .sort((a, b) => ringSortKey(a.ring_number) - ringSortKey(b.ring_number));

    // Peakbar (ring anchors)
    const peakItems = ringsAll.map(r => ({
      key: String(r.ring_number),
      label: String(r.ringName || `Ring ${r.ring_number}`),
      agg: r.classIdSet ? r.classIdSet.size : 0
    }));

    if (!options.skipPeakBar) {
      screenRoot.appendChild(renderPeakBar(peakItems));
    }

    const ringContainer = el('div', 'list-column');
    ringContainer.dataset.kind = 'ringContainer';

    // Local helpers (matching schedule layout)
    let stripe = 0;

    const canClassNav = state.screen !== 'classDetail';
    const canHorseNav = state.screen !== 'horseDetail';
    const canRiderNav = state.screen !== 'riderDetail';

    function addLine4(parent, a, b, cNode, dNode, rowCls, extraCls, onClick) {
      const line = el(
        'div',
        'card-line4' +
          (rowCls ? (' ' + rowCls) : '') +
          (extraCls ? (' ' + extraCls) : '')
      );

      const cA = el('div', 'c4-a', a || '');
      const cB = el('div', 'c4-b', b || '');
      const cC = el('div', 'c4-c');
      const cD = el('div', 'c4-d');

      if (cNode) cC.appendChild(cNode);
      if (typeof dNode === 'string') cD.textContent = dNode;
      else if (dNode) cD.appendChild(dNode);

      line.appendChild(cA);
      line.appendChild(cB);
      line.appendChild(cC);
      line.appendChild(cD);

      if (onClick) {
        line.style.cursor = 'pointer';
        line.addEventListener('click', (e) => {
          e.preventDefault();
          onClick();
        });
      }

      parent.appendChild(line);
    }

    function makeBadge(txt, cls) {
      const letter = String(txt || '').trim();
      const base = String(cls || '').trim();
      const classes = ['badge'];
      if (base) classes.push(base);
      if (letter && base.includes('badge--status')) classes.push(`badge--status-${letter}`);
      if (letter && base.includes('badge--type')) classes.push(`badge--type-${letter}`);
      if (letter && base.includes('badge--seq')) classes.push(`badge--seq-${letter}`);
      return el('span', classes.join(' '), letter);
    }

    for (const r of ringsAll) {
      const rk = String(r.ring_number);
      if (!r.groups || r.groups.size === 0) continue;

      const card = el('div', 'card');
      card.id = `ring-${rk}`;
      const body = el('div', 'card-body');
      card.appendChild(body);

      // Ring header row (ringName | | | agg)
      addLine4(
        body,
        String(r.ringName),
        '',
        document.createTextNode(''),
        el('span', 'nav-agg nav-agg--positive', String(r.classIdSet ? r.classIdSet.size : 0)),
        'row--class row--ring-peak',
        'row-alt',
        null
      );

      // groups
      const groups = [...r.groups.values()].sort((a, b) => {
        if (a.statusRank !== b.statusRank) return b.statusRank - a.statusRank;
        return String(a.group_name || '').localeCompare(String(b.group_name || ''));
      });

      for (const g of groups) {
        if (!g.classes || g.classes.size === 0) continue;

        const gWrap = el('div', 'group-wrap ' + statusTintClass(g.latestStatus));
        body.appendChild(gWrap);

        const classes = [...g.classes.values()].sort((a, b) => {
          const aMin = Math.min(...[...a.classNumbers.values()].map(x => safeNum(x.class_number, 999999)));
          const bMin = Math.min(...[...b.classNumbers.values()].map(x => safeNum(x.class_number, 999999)));
          if (aMin !== bMin) return aMin - bMin;
          return String(a.class_name || '').localeCompare(String(b.class_name || ''));
        });

        for (const c of classes) {
          const classNums = [...c.classNumbers.values()].sort((a, b) => safeNum(a.class_number, 999999) - safeNum(b.class_number, 999999));

          for (const cn of classNums) {
            if (!cn.entries || cn.entries.size === 0) continue;

            // CLASS ROW
            const badges = [];
            if (c.class_type) badges.push(makeBadge(String(c.class_type).slice(0, 1).toUpperCase(), 'badge--type'));
            if (c.schedule_sequencetype) badges.push(makeBadge(String(c.schedule_sequencetype).slice(0, 1).toUpperCase(), 'badge--seq'));

            const statusL = statusLetter(cn.latestStatus);
            const statusNode = statusL ? makeBadge(statusL, 'badge--status') : document.createTextNode('');

            const badgeWrap = el('div', 'badge-wrap');
            if (statusNode) badgeWrap.appendChild(statusNode);
            for (const b of badges) badgeWrap.appendChild(b);

            stripe++;
            addLine4(
              gWrap,
              fmtTimeShort(cn.latestStart || ''),
              (cn.class_number != null ? String(cn.class_number) : ''),
              document.createTextNode(String(c.class_name || '').trim()),
              badgeWrap,
              'row--class',
              (stripe % 2 === 0 ? 'row-alt' : ''),
              canClassNav ? (() => pushDetail('classDetail', { kind: 'class', key: String(c.class_id) })) : null
            );

            // ENTRIES
            const entries = [...cn.entries.values()].sort((a, b) => {
              const ea = safeNum(a.entryNumber, 999999);
              const eb = safeNum(b.entryNumber, 999999);
              if (ea !== eb) return ea - eb;
              return String(a.horseName || '').localeCompare(String(b.horseName || ''));
            });

            for (const eObj of entries) {
              const best = pickBestTrip(eObj.trips || []);
                            const entryNo = eObj.entryNumber || (best && best.entryNumber != null ? String(best.entryNumber) : '');
              const go = best ? String(best.latestGO || best.latestStart || '') : '';
              const timeText = go ? fmtTimeShort(go) : '';
              const lastOog = best ? safeNum(best.lastOOG, null) : null;
              const totalTrips = cn.total_trips;
              const oogText = fmtOogPair(lastOog, totalTrips);
              const rider = (best && best.riderName) ? String(best.riderName) : '';
              const horseName = eObj.horseName ? String(eObj.horseName) : '';
              const lineText = [horseName, rider, oogText, timeText].filter(Boolean).join(' - ');

              stripe++;
              addLine4(
                gWrap,
                '',
                entryNo,
                document.createTextNode(lineText),
                '',
                'row--entry',
                (stripe % 2 === 0 ? 'row-alt' : ''),
                canHorseNav ? (() => pushDetail('horseDetail', { kind: 'horse', key: String(eObj.horseName || '') })) : null
              );
                            // TRIPS (child) removed per UI contract
}
          }
        }
      }

      ringContainer.appendChild(card);
    }

    screenRoot.appendChild(ringContainer);

    return { ringMap, ringsAll, peakItems };
  }



  function renderHorseDetail(sIdx, tIdx) {
    clearRoot();

    const horseName = String((state.detail && state.detail.key) || '');
    setHeader(horseName || 'Horse');

    const baseTrips = (state.trips || []).filter(t => String(t && t.horseName || '') === horseName);

    const bucketItems = buildBucketChipsFromTrips(baseTrips, 30);
    const activeBucket = (state.filter && state.filter.bucket != null) ? String(state.filter.bucket) : null;
    const hasActive = bucketItems.some(it => (it.key == null && !activeBucket) || (it.key != null && String(it.key) === String(activeBucket)));
    const bucketKey = hasActive ? activeBucket : null;

    const viewTrips = filterTripsByBucket(baseTrips, bucketKey, 30);

    renderRingCardsFromTrips(viewTrips, sIdx, { skipPeakBar: false });
    renderBucketFilterBottom(bucketItems, bucketKey);

    applyPendingScroll();
  }

  // ----------------------------
  // SCREEN: SCHEDULE (rings)
  // ----------------------------
    function renderSchedule(sIdx, tIdx) {
    clearRoot();
    setHeader('Schedule');

    // page-level controls
    screenRoot.appendChild(renderSearch('rings', 'Search rings...'));

    const qRing = normalizeStr(state.search.rings);
    const horseFilter = state.filter && state.filter.horse ? String(state.filter.horse) : null;
    const canClassNav = true; // schedule allows class nav


    // ----------------------------
    // Build hierarchy from watch_trips (flat -> dimensions)
    // ring_number -> group_id -> class_id -> class_number -> entry_id -> trips
    // ----------------------------
    const ringMap = new Map();

    function ringSortKey(rn) { return safeNum(rn, 999999); }

    function statusRank(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 3;
      if (s.includes('upcoming')) return 2;
      if (s.includes('complete')) return 1;
      return 0;
    }

    function statusLetter(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 'L';
      if (s.includes('upcoming')) return 'S';
      if (s.includes('complete')) return 'C';
      return '';
    }

    function statusTintClass(statusText) {
      const s = String(statusText || '').toLowerCase();
      if (s.includes('underway')) return 'tint-L';
      if (s.includes('upcoming')) return 'tint-S';
      if (s.includes('complete')) return 'tint-C';
      return '';
    }

    function getRingNameFromTrip(t) {
      if (t && t.ringName) return String(t.ringName);
      const rn = t && t.ring_number != null ? String(t.ring_number) : null;
      const rObj = rn && sIdx && sIdx.ringMap ? sIdx.ringMap.get(rn) : null;
      if (rObj && rObj.ringName) return String(rObj.ringName);
      return rn ? `Ring ${rn}` : 'Ring';
    }

    function getOrInit(map, key, factory) {
      if (!map.has(key)) map.set(key, factory());
      return map.get(key);
    }

    for (const t of (state.trips || [])) {
      if (!t) continue;
      if (t.ring_number == null) continue;
      if (t.class_id == null) continue;

      // ring search filter
      const rnStr = String(t.ring_number);
      const ringName = getRingNameFromTrip(t);
      if (qRing && !normalizeStr(ringName).includes(qRing)) continue;

      // horse filter (entry_id preferred; fallback horseName)
      const entryKey = (t.entry_id != null) ? String(t.entry_id) : (t.horseName ? String(t.horseName) : null);
      if (!entryKey) continue;
      if (horseFilter && entryKey !== horseFilter) continue;

      const ringObj = getOrInit(ringMap, rnStr, () => ({
        ring_number: t.ring_number,
        ringName,
        classIdSet: new Set(),
        groups: new Map()
      }));

      ringObj.classIdSet.add(String(t.class_id));

      const gid = (t.class_group_id != null) ? String(t.class_group_id) : '__nogroup__';
      const groupObj = getOrInit(ringObj.groups, gid, () => ({
        class_group_id: gid,
        group_name: t.group_name ? String(t.group_name) : '',
        statusRank: 0,
        latestStatus: '',
        classes: new Map()
      }));

      // group status (max rank)
      const rnk = statusRank(t.latestStatus);
      if (rnk > groupObj.statusRank) {
        groupObj.statusRank = rnk;
        groupObj.latestStatus = t.latestStatus || '';
      }

      const cid = String(t.class_id);
      const classObj = getOrInit(groupObj.classes, cid, () => ({
        class_id: cid,
        class_name: t.class_name ? String(t.class_name) : '',
        class_type: t.class_type ? String(t.class_type) : '',
        schedule_sequencetype: t.schedule_sequencetype ? String(t.schedule_sequencetype) : '',
        classNumbers: new Map()
      }));

      const classNumKey = (t.class_number != null) ? String(t.class_number) : '';
      const cn = (t.class_number != null) ? Number(t.class_number) : null;

      const classNumObj = getOrInit(classObj.classNumbers, classNumKey, () => ({
        class_number: cn,
        latestStart: t.latestStart || '',
        latestStatus: t.latestStatus || '',
        statusRank: statusRank(t.latestStatus),
        total_trips: t.total_trips != null ? t.total_trips : null,
        entries: new Map()
      }));

      // prefer stronger status for classNum
      const cnRank = statusRank(t.latestStatus);
      if (cnRank > classNumObj.statusRank) {
        classNumObj.statusRank = cnRank;
        classNumObj.latestStatus = t.latestStatus || '';
      }
      if (!classNumObj.latestStart && t.latestStart) classNumObj.latestStart = t.latestStart;

      const entryObj = getOrInit(classNumObj.entries, entryKey, () => ({
        entry_id: entryKey,
        entryNumber: t.entryNumber != null ? String(t.entryNumber) : '',
        horseName: t.horseName ? String(t.horseName) : '',
        trips: []
      }));

      if (!entryObj.entryNumber && t.entryNumber != null) entryObj.entryNumber = String(t.entryNumber);
      if (!entryObj.horseName && t.horseName) entryObj.horseName = String(t.horseName);

      entryObj.trips.push(t);
    }

    const ringsAll = [...ringMap.values()].sort((a, b) => ringSortKey(a.ring_number) - ringSortKey(b.ring_number));

    // Peakbar (anchors)
    const peakItems = ringsAll.map(r => {
      const rk = String(r.ring_number);
      return {
        key: rk,
        label: String(r.ringName),
        agg: (r.classIdSet ? r.classIdSet.size : 0),
        href: `#ring-${rk}`
      };
    });
    screenRoot.appendChild(renderPeakBar(peakItems));

    // Ring cards
    const ringContainer = el('div', 'list-column');
    ringContainer.dataset.kind = 'ringContainer';

    let stripe = 0;

    function addLine4(parent, a, b, cNode, dNode, rowClass, extraClass, onClick) {
      const line = el('div', 'card-line4' + (rowClass ? (' ' + rowClass) : '') + (extraClass ? (' ' + extraClass) : ''));
      const cA = el('div', 'c4-a', a || '');
      const cB = el('div', 'c4-b', b || '');
      const cC = el('div', 'c4-c');
      const cD = el('div', 'c4-d');

      if (cNode) cC.appendChild(cNode);
      if (typeof dNode === 'string') cD.textContent = dNode;
      else if (dNode) cD.appendChild(dNode);

      line.appendChild(cA);
      line.appendChild(cB);
      line.appendChild(cC);
      line.appendChild(cD);

      if (onClick) {
        line.style.cursor = 'pointer';
        line.addEventListener('click', onClick);
      }

      parent.appendChild(line);
    }

    function makeBadge(txt, cls) {
      const letter = String(txt || '').trim();
      const base = String(cls || '').trim();
      const classes = ['badge'];
      if (base) classes.push(base);
      if (letter && base.includes('badge--status')) classes.push(`badge--status-${letter}`);
      if (letter && base.includes('badge--type')) classes.push(`badge--type-${letter}`);
      if (letter && base.includes('badge--seq')) classes.push(`badge--seq-${letter}`);
      return el('span', classes.join(' '), letter);
    }

    function nodeWithBadges(badges, text) {
      const wrap = el('div', 'badge-wrap');
      for (const b of (badges || [])) wrap.appendChild(b);
      if (text) wrap.appendChild(document.createTextNode(text));
      return wrap;
    }

    for (const r of ringsAll) {
      const rk = String(r.ring_number);
      if (!r.groups || r.groups.size === 0) continue;

      const card = el('div', 'card');
      card.id = `ring-${rk}`;
      const body = el('div', 'card-body');
      card.appendChild(body);

      // Ring header row (ringName | | | agg)
      addLine4(
        body,
        String(r.ringName),
        '',
        document.createTextNode(''),
        el('span', 'nav-agg nav-agg--positive', String(r.classIdSet ? r.classIdSet.size : 0)),
        'row--class row--ring-peak',
        'row-alt',
        null
      );

      // groups
      const groups = [...r.groups.values()].sort((a, b) => {
        // stable: status rank desc then name
        if (a.statusRank !== b.statusRank) return b.statusRank - a.statusRank;
        return String(a.group_name || '').localeCompare(String(b.group_name || ''));
      });

      for (const g of groups) {
        if (!g.classes || g.classes.size === 0) continue;

        const gWrap = el('div', 'group-wrap ' + statusTintClass(g.latestStatus));
        body.appendChild(gWrap);

        const classes = [...g.classes.values()].sort((a, b) => {
          // sort by lowest class_number present, then name
          const aMin = Math.min(...[...a.classNumbers.values()].map(x => safeNum(x.class_number, 999999)));
          const bMin = Math.min(...[...b.classNumbers.values()].map(x => safeNum(x.class_number, 999999)));
          if (aMin !== bMin) return aMin - bMin;
          return String(a.class_name || '').localeCompare(String(b.class_name || ''));
        });

        for (const c of classes) {
          const classNums = [...c.classNumbers.values()].sort((a, b) => safeNum(a.class_number, 999999) - safeNum(b.class_number, 999999));

          for (const cn of classNums) {
            if (!cn.entries || cn.entries.size === 0) continue;

            // CLASS ROW
            const badges = [];
            if (c.class_type) badges.push(makeBadge(String(c.class_type).slice(0, 1).toUpperCase(), 'badge--type'));
            if (c.schedule_sequencetype) badges.push(makeBadge(String(c.schedule_sequencetype).slice(0, 1).toUpperCase(), 'badge--seq'));

            const statusL = statusLetter(cn.latestStatus);
            const statusNode = statusL ? makeBadge(statusL, 'badge--status') : document.createTextNode('');

            const classNameText = String(c.class_name || '').trim();
            const classNode = document.createTextNode(classNameText);

            // ALL badges in column D (status + type + seq)
            const badgeWrap = el('div', 'badge-wrap');
            if (statusNode) badgeWrap.appendChild(statusNode);
            for (const b of badges) badgeWrap.appendChild(b);

            stripe++;
            addLine4(
              gWrap,
              fmtTimeShort(cn.latestStart || ''),
              (cn.class_number != null ? String(cn.class_number) : ''),
              classNode,
              badgeWrap,
              'row--class',
              (stripe % 2 === 0 ? 'row-alt' : ''),
              canClassNav ? (() => pushDetail('classDetail', { kind: 'class', key: String(c.class_id) })) : null
            );

            // ENTRIES
            const entries = [...cn.entries.values()].sort((a, b) => {
              const ea = safeNum(a.entryNumber, 999999);
              const eb = safeNum(b.entryNumber, 999999);
              if (ea !== eb) return ea - eb;
              return String(a.horseName || '').localeCompare(String(b.horseName || ''));
            });

            for (const eObj of entries) {
              const best = pickBestTrip(eObj.trips || []);
                            const entryNo = eObj.entryNumber || (best && best.entryNumber != null ? String(best.entryNumber) : '');
              const go = best ? String(best.latestGO || best.latestStart || '') : '';
              const timeText = go ? fmtTimeShort(go) : '';
              const lastOog = best ? safeNum(best.lastOOG, null) : null;
              const totalTrips = cn.total_trips;
              const oogText = fmtOogPair(lastOog, totalTrips);
              const rider = (best && best.riderName) ? String(best.riderName) : '';
              const horseName = eObj.horseName ? String(eObj.horseName) : '';
              const lineText = [horseName, rider, oogText, timeText].filter(Boolean).join(' - ');

              stripe++;
              addLine4(
                gWrap,
                '',
                entryNo,
                document.createTextNode(lineText),
                '',
                'row--entry',
                (stripe % 2 === 0 ? 'row-alt' : ''),
                () => pushDetail('horseDetail', { key: String(eObj.horseName || '') })
              );
                            // TRIPS (child) removed per UI contract
}
          }
        }
      }

      ringContainer.appendChild(card);
    }

    screenRoot.appendChild(ringContainer);

    // Filterbottom (horse chips) OUTSIDE app-main, above nav
    const chips = buildHorseChips(state.search.rings, sIdx);
    renderFilterBottom(chips, horseFilter);

    applyPendingScroll();
  }

  function renderRingDetail(sIdx, tIdx) {
    const rk = state.detail && state.detail.key ? String(state.detail.key) : null;
    const ringObj = rk ? sIdx.ringMap.get(rk) : null;

    clearRoot();
    setHeader(ringObj ? ringObj.ringName : 'Ring');

    if (!ringObj) return;

    const ringEntryKeys = tIdx.byRing.get(rk) || [];
    if (ringEntryKeys.length === 0) return;

    const card = makeCard(ringObj.ringName, ringEntryKeys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'ring';

    const groups = [...ringObj.groups.values()].sort((a, b) => {
      const ta = timeToMinutes(a.latestStart) ?? 999999;
      const tb = timeToMinutes(b.latestStart) ?? 999999;
      if (ta !== tb) return ta - tb;
      return String(a.group_name).localeCompare(String(b.group_name));
    });

    for (const g of groups) {
      const gid = String(g.class_group_id);
      const gKeys = tIdx.byGroup.get(gid) || [];
      if (gKeys.length === 0) continue;

      addCardLine(
        card,
        fmtTimeShort(g.latestStart || ''),
        String(g.group_name),
        (fmtStatus4(g.latestStatus) ? el('div', 'row-tag row-tag--count', fmtStatus4(g.latestStatus)) : null),
        {
          onMid: () => pushDetail('groupDetail', { kind: 'group', key: gid })
        }
      );

      const classes = [...g.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
      for (const c of classes) {
        const cid = String(c.class_id);
        const cKeys = tIdx.byClass.get(cid) || [];
        if (cKeys.length === 0) continue;

        addCardLine(
          card,
          (c.class_number != null ? String(c.class_number) : ''),
          String(c.class_name || ''),
          makeTagCount(cKeys.length),
          { onRow: () => pushDetail('classDetail', { kind: 'class', key: cid }) }
        );

        const bestTrips = cKeys
          .map(k => tIdx.entryBest.get(k))
          .filter(Boolean)
          .sort((a, b) => {
            const oa = safeNum(a.lastOOG, 999999);
            const ob = safeNum(b.lastOOG, 999999);
            if (oa !== ob) return oa - ob;
            return String(a.horseName || '').localeCompare(String(b.horseName || ''));
          })
          .slice(0, 20);

        addHorseChipsRollup(card, bestTrips);
      }
    }

    screenRoot.appendChild(card);
  }

  function renderGroupDetail(sIdx, tIdx) {
    const gid = state.detail && state.detail.key ? String(state.detail.key) : null;
    clearRoot();
    setHeader('Group');

    if (!gid) return;

    let gObj = null;
    for (const r of sIdx.ringMap.values()) {
      if (r.groups.has(gid)) { gObj = r.groups.get(gid); break; }
    }
    if (!gObj) return;

    const gKeys = tIdx.byGroup.get(gid) || [];
    if (gKeys.length === 0) return;

    const title = `${fmtTimeShort(gObj.latestStart || '')} ${gObj.group_name || ''}`.trim();
    const card = makeCard(title, gKeys.length, true, null);
    card.id = 'detail-card';
    card.dataset.detail = 'group';

    const classes = [...gObj.classes.values()].sort((a, b) => (a.class_number || 0) - (b.class_number || 0));
    for (const c of classes) {
      const cid = String(c.class_id);
      const cKeys = tIdx.byClass.get(cid) || [];
      if (cKeys.length === 0) continue;

      addCardLine(
        card,
        (c.class_number != null ? String(c.class_number) : ''),
        String(c.class_name || ''),
        makeTagCount(cKeys.length),
        { onRow: () => pushDetail('classDetail', { kind: 'class', key: cid }) }
      );

      const bestTrips = cKeys
        .map(k => tIdx.entryBest.get(k))
        .filter(Boolean)
        .sort((a, b) => {
          const oa = safeNum(a.lastOOG, 999999);
          const ob = safeNum(b.lastOOG, 999999);
          if (oa !== ob) return oa - ob;
          return String(a.horseName || '').localeCompare(String(b.horseName || ''));
        })
        .slice(0, 20);

      addHorseChipsRollup(card, bestTrips);
    }

    screenRoot.appendChild(card);
  }

  // ----------------------------
  // SCREEN: RIDERS (list -> detail)
  // ----------------------------
  function renderRiders(_sIdx, tIdx) {
    clearRoot();
    setHeader('Riders');

    screenRoot.appendChild(renderSearch('riders', 'Search riders...'));

    const q = normalizeStr(state.search.riders);

    const mode = state.ridersMode || null; // null | 'ribbons'

    let ridersAll = [...tIdx.byRider.keys()];
    if (mode === 'ribbons') {
      ridersAll = ridersAll.filter((name) => {
        const keys = tIdx.byRider.get(name) || [];
        return ribbonCountFromEntryKeys(keys, tIdx) > 0;
      });
      ridersAll.sort((a, b) => {
        const ak = tIdx.byRider.get(a) || [];
        const bk = tIdx.byRider.get(b) || [];
        const ac = ribbonCountFromEntryKeys(ak, tIdx);
        const bc = ribbonCountFromEntryKeys(bk, tIdx);
        if (bc !== ac) return bc - ac;
        return String(a).localeCompare(String(b));
      });
    } else {
      ridersAll.sort((a, b) => String(a).localeCompare(String(b)));
    }

    for (const name of ridersAll) {
      const keys = tIdx.byRider.get(name) || [];
      if (keys.length === 0) continue;
      if (q && !normalizeStr(name).includes(q)) continue;

      const nextup = fmtNextUpFromEntryKeys(keys, tIdx);

      const row = el('div', 'row row--tap row--3col');
      row.id = `rider-${idify(name)}`;
      row.appendChild(el('div', 'row-title', String(name)));
      row.appendChild(el('div', 'row-mid', nextup || ''));

      const rightCount = (mode === 'ribbons') ? ribbonCountFromEntryKeys(keys, tIdx) : keys.length;
      row.appendChild(makeTagCount(rightCount));

      row.addEventListener('click', () => {
        pushDetail('riderDetail', { kind: 'rider', key: String(name) });
      });
      screenRoot.appendChild(row);
    }
  }

  function renderRiderDetail(sIdx, tIdx) {
    clearRoot();

    const riderName = String((state.detail && state.detail.key) || '');
    setHeader(riderName || 'Rider');

    const baseTrips = (state.trips || []).filter(t => String(t && t.riderName || '') === riderName);

    const bucketItems = buildBucketChipsFromTrips(baseTrips, 30);
    const activeBucket = (state.filter && state.filter.bucket != null) ? String(state.filter.bucket) : null;
    const hasActive = bucketItems.some(it => (it.key == null && !activeBucket) || (it.key != null && String(it.key) === String(activeBucket)));
    const bucketKey = hasActive ? activeBucket : null;

    const viewTrips = filterTripsByBucket(baseTrips, bucketKey, 30);

    renderRingCardsFromTrips(viewTrips, sIdx, { skipPeakBar: false });
    renderBucketFilterBottom(bucketItems, bucketKey);

    applyPendingScroll();
  }

  // ----------------------------
  // SCREEN: CLASS DETAIL
  // ----------------------------
  function renderClassDetail(sIdx, tIdx) {
    clearRoot();

    const classId = String((state.detail && state.detail.key) || '');
    const c = findClassInSchedule(sIdx, classId);

    const title =
      c && (c.class_number != null || c.class_name) ?
        `${(c.class_number != null ? String(c.class_number) : '')} ${String(c.class_name || '').trim()}`.trim() :
        (classId ? `Class ${classId}` : 'Class');

    setHeader(title);

    const baseTrips = (state.trips || []).filter(t => String(t && t.class_id || '') === classId);

    const bucketItems = buildBucketChipsFromTrips(baseTrips, 30);
    const activeBucket = (state.filter && state.filter.bucket != null) ? String(state.filter.bucket) : null;
    const hasActive = bucketItems.some(it => (it.key == null && !activeBucket) || (it.key != null && String(it.key) === String(activeBucket)));
    const bucketKey = hasActive ? activeBucket : null;

    const viewTrips = filterTripsByBucket(baseTrips, bucketKey, 30);

    renderRingCardsFromTrips(viewTrips, sIdx, { skipPeakBar: false });
    renderBucketFilterBottom(bucketItems, bucketKey);

    applyPendingScroll();
  }

  // ----------------------------
  // SCREEN: TIMELINE
  // ----------------------------
  function renderTimeline(sIdx, tIdx) {
    clearRoot();
    setHeader('Timeline');

    const baseTrips = (state.trips || []).slice();

    const bucketItems = buildBucketChipsFromTrips(baseTrips, 30);

    // Default timeline to the first real bucket if none selected
    let activeBucket = (state.filter && state.filter.bucket != null) ? String(state.filter.bucket) : null;
    const realBuckets = bucketItems.filter(it => it.key != null);
    if (!activeBucket && realBuckets.length) {
      activeBucket = String(realBuckets[0].key);
      state.filter.bucket = activeBucket;
    }

    // If active bucket is not present, fall back to null (All)
    const hasActive = bucketItems.some(it => (it.key == null && !activeBucket) || (it.key != null && String(it.key) === String(activeBucket)));
    const bucketKey = hasActive ? activeBucket : null;

    const viewTrips = filterTripsByBucket(baseTrips, bucketKey, 30);

    renderRingCardsFromTrips(viewTrips, sIdx, { skipPeakBar: false });
    renderBucketFilterBottom(bucketItems, bucketKey);

    applyPendingScroll();
  }

  // ----------------------------
  // ROUTER
  // ----------------------------
  function render() {
    if (!screenRoot || !headerTitle) return;

    
    clearFilterBottom();
const sIdx = buildScheduleIndex();
    const tIdx = buildTruthIndex();

    renderAggs(sIdx, tIdx);

    const primary = getPrimaryForScreen(state.screen);
    setNavActive(primary);

    if (headerBack) headerBack.style.visibility = state.history.length ? 'visible' : 'hidden';
    if (headerAction) headerAction.hidden = true;

    if (state.screen === 'schedule') {
      const hash = (location.hash || '').replace('#', '');
      if (hash && /^ring-\d+$/i.test(hash)) state.pendingScrollId = hash;
      else state.pendingScrollId = null;
    } else {
      state.pendingScrollId = null;
    }

    if (state.screen === 'start') return renderStart();
    if (state.screen === 'summary') return renderSummary(sIdx, tIdx);
    if (state.screen === 'horses') return renderHorses(sIdx, tIdx);
    if (state.screen === 'schedule' || state.screen === 'rings') return renderSchedule(sIdx, tIdx);
    if (state.screen === 'ringDetail') return renderRingDetail(sIdx, tIdx);
    if (state.screen === 'groupDetail') return renderGroupDetail(sIdx, tIdx);
    if (state.screen === 'classDetail') return renderClassDetail(sIdx, tIdx);

    if (state.screen === 'riders') return renderRiders(sIdx, tIdx);
    if (state.screen === 'riderDetail') return renderRiderDetail(sIdx, tIdx);

    if (state.screen === 'horseDetail') return renderHorseDetail(sIdx, tIdx);

    state.screen = 'start';
    renderStart();
  }

  // ----------------------------
  // EVENTS
  // ----------------------------
  if (headerBack) headerBack.addEventListener('click', goBack);

  if (navRow) {
    navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;

      const tapped = btn.dataset.screen;

      state.history = [];
      state.detail = null;

      state.ridersMode = null;

      if (tapped === 'schedule') state.screen = 'schedule';
      else if (tapped === 'rings') state.screen = 'schedule';
      else state.screen = tapped;

      render();
    });
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  loadAll().catch(() => {});
  render();
})();
