/* app.js (FULL DROP)
   Fixes implemented:
   - WHITE UI compatible with index.html
   - Schedule always FULL (no nav mode toggle)
   - No "unfollow horse" anywhere
   - Uses schedule day (meta.dt / dt) for all time parsing (not today's date)
   - Schedule layout matches Rings layout: 3-tier lines + entry rollup chips
   - Tap horse/class/ring anywhere => INLINE detail card on SAME page (no click-through)
   - Riders / Classes / Horses screens also show INLINE detail card (no click-through)
   - If agg == 0 => do not render that line/chip
*/

(function () {
  'use strict';

  // -----------------------------
  // CONFIG
  // -----------------------------
  const DATA_SCHEDULE_URL = './data/latest/watch_schedule.json';
  const DATA_TRIPS_URL = './data/latest/watch_trips.json';
  const REFRESH_MS = 8 * 60 * 1000;

  // -----------------------------
  // DOM
  // -----------------------------
  const el = {
    headerBack: document.getElementById('header-back'),
    headerTitle: document.getElementById('header-title'),
    appMain: document.getElementById('app-main'),
    screenRoot: document.getElementById('screen-root'),
    navRow: document.getElementById('nav-row'),
  };

  // -----------------------------
  // STATE
  // -----------------------------
  const state = {
    loaded: false,
    schedule: [],
    trips: [],
    meta: { dt: null, sid: null, generated_at: null },
    ui: {
      screen: 'schedule',
      query: '',
      detail: null, // { type:'horse'|'rider'|'class'|'ring', key:'...', label:'...' }
    },
    idx: null, // built indexes
  };

  // -----------------------------
  // UTIL formatting (your rules)
  // -----------------------------
  function safeStr(v) { return (v === null || v === undefined) ? '' : String(v); }

  function fmtTimeA(raw) {
    // raw can be:
    // - ISO datetime
    // - "HH:mm:ss"
    // - "HH:mm"
    // If only time -> assume scope dt (handled in parseToEpoch)
    const d = parseToDate(raw);
    if (!d) return '';
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? 'P' : 'A';
    h = h % 12; if (h === 0) h = 12;
    const mm = String(m).padStart(2, '0');
    return `${h}:${mm}${ap}`;
  }

  function capFirstN(s, n) {
    const t = safeStr(s).trim();
    if (!t) return '';
    return t.toUpperCase().slice(0, n);
  }

  // status = caps first 4 chars
  function fmtStatus4(s) { return capFirstN(s, 4); }

  // ring = caps first 6
  function fmtRing6(s) { return capFirstN(s, 6); }

  // -----------------------------
  // Time parsing (IMPORTANT: use schedule dt, not "today")
  // -----------------------------
  function scopeDt() {
    // prefer meta dt from schedule file; fallback infer from first record's dt
    if (state.meta && state.meta.dt) return state.meta.dt;
    const s0 = state.schedule && state.schedule[0];
    if (s0 && s0.dt) return s0.dt;
    // last resort: keep null
    return null;
  }

  function parseToDate(raw) {
    if (!raw) return null;
    const t = safeStr(raw).trim();
    if (!t) return null;

    // ISO
    const iso = Date.parse(t);
    if (!Number.isNaN(iso) && (t.includes('T') || t.includes('-'))) {
      return new Date(iso);
    }

    // time-only "HH:mm:ss" or "HH:mm"
    const dt = scopeDt();
    if (!dt) return null;
    const timePart = t.length === 5 ? `${t}:00` : t; // HH:mm -> HH:mm:ss
    const isoLocal = `${dt}T${timePart}`;
    const ms = Date.parse(isoLocal);
    if (Number.isNaN(ms)) return null;
    return new Date(ms);
  }

  function parseToEpoch(raw) {
    const d = parseToDate(raw);
    return d ? d.getTime() : null;
  }

  // -----------------------------
  // DATA LOAD
  // -----------------------------
  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
    return r.json();
  }

  async function loadAll() {
    const [scheduleJson, tripsJson] = await Promise.all([
      fetchJson(DATA_SCHEDULE_URL),
      fetchJson(DATA_TRIPS_URL),
    ]);

    // Expect shape: either { meta, rows } OR already array
    const schedMeta = scheduleJson && scheduleJson.meta ? scheduleJson.meta : {};
    const schedRows = Array.isArray(scheduleJson) ? scheduleJson : (scheduleJson.rows || scheduleJson.data || []);
    const tripsMeta = tripsJson && tripsJson.meta ? tripsJson.meta : {};
    const tripsRows = Array.isArray(tripsJson) ? tripsJson : (tripsJson.rows || tripsJson.data || []);

    state.schedule = Array.isArray(schedRows) ? schedRows : [];
    state.trips = Array.isArray(tripsRows) ? tripsRows : [];

    // dt: keep schedule dt even if it's old (your requirement)
    state.meta.sid = schedMeta.sid || tripsMeta.sid || null;
    state.meta.dt = schedMeta.dt || (state.schedule[0] && state.schedule[0].dt) || tripsMeta.dt || (state.trips[0] && state.trips[0].dt) || null;
    state.meta.generated_at = schedMeta.generated_at || tripsMeta.generated_at || null;

    state.idx = buildIndexes();
    state.loaded = true;
  }

  // -----------------------------
  // INDEXES (rings, classes, riders, horses)
  // -----------------------------
  function buildIndexes() {
    const byRing = new Map();     // ringKey -> { ring_number, ringName, lines:[], entries:[] }
    const byClass = new Map();    // classKey -> { class_id, class_number, class_name, lines:[], entries:[] }
    const byRider = new Map();    // riderKey -> { riderName, lines:[], entries:[] }
    const byHorse = new Map();    // horseKey -> { horseName, lines:[], entries:[] }

    // schedule rows: ring_number, ringName, group_name, class_name, latestStart/latestStatus, total_trips, class_id/class_number
    for (const r of state.schedule) {
      const ring_number = r.ring_number ?? r.ringNumber ?? null;
      const ringName = r.ringName ?? r.ring_name ?? '';
      const ringKey = ring_number !== null ? `ring:${ring_number}` : `ring:${ringName}`;

      const class_id = r.class_id ?? null;
      const class_number = r.class_number ?? r.classNumber ?? null;
      const class_name = r.class_name ?? r.className ?? ''; // IMPORTANT: class_name
      const classKey = class_id ? `class:${class_id}` : `class:${class_number || class_name}`;

      const t = r.latestStart ?? r.lastestStart ?? r.estimated_start_time ?? r.estimatedStart ?? '';
      const status = r.latestStatus ?? r.latest_status ?? r.status ?? '';
      const agg = Number(r.total_trips ?? r.agg ?? 0) || 0;

      // ring aggregator card lines (we render class lines for rings/schedule layout)
      if (!byRing.has(ringKey)) byRing.set(ringKey, { ring_number, ringName, lines: [], entryMap: new Map() });
      byRing.get(ringKey).lines.push({
        kind: 'class',
        timeRaw: t,
        time: fmtTimeA(t),
        title: class_name || safeStr(r.group_name || ''),
        agg,
        classKey,
        ringKey,
        class_id,
        class_number,
      });

      // classes list lines
      if (!byClass.has(classKey)) byClass.set(classKey, { class_id, class_number, class_name, lines: [], entryMap: new Map() });
      byClass.get(classKey).lines.push({
        kind: 'ring',
        timeRaw: t,
        time: fmtTimeA(t),
        title: (ringName || `Ring ${ring_number ?? ''}`).trim(),
        agg,
        ringKey,
        classKey,
      });
    }

    // trips rows: horseName, riderName, ringName, ring_number, class_name, class_id, entryNumber/backNumber, latestGO, lastestPlacing, etc.
    for (const tr of state.trips) {
      const horseName = tr.horseName ?? tr.horse_name ?? '';
      const riderName = tr.riderName ?? tr.rider_name ?? '';
      const ring_number = tr.ring_number ?? tr.ringNumber ?? null;
      const ringName = tr.ringName ?? tr.ring_name ?? '';
      const ringKey = ring_number !== null ? `ring:${ring_number}` : `ring:${ringName}`;

      const class_id = tr.class_id ?? null;
      const class_number = tr.class_number ?? tr.classNumber ?? null;
      const class_name = tr.class_name ?? tr.className ?? '';
      const classKey = class_id ? `class:${class_id}` : `class:${class_number || class_name}`;

      const horseKey = `horse:${horseName || tr.entry_id || tr.entryNumber || ''}`;
      const riderKey = `rider:${riderName || tr.rider_id || ''}`;

      const oogRaw = tr.latestGO ?? tr.last_order_of_go ?? tr.lastGO ?? tr.oog ?? tr.order_of_go ?? null;
      const oog = oogRaw === null || oogRaw === undefined ? null : String(oogRaw).replace(/^OOG\s*/i, '').trim();

      const goTime = tr.last_estimated_go_time ?? tr.latest_estimated_go_time ?? tr.latestStart ?? tr.lastestStart ?? tr.estimated_start_time ?? '';
      const aggOne = 1; // a trip contributes as 1 "active" entry for rollups

      // Ensure containers exist
      if (!byRing.has(ringKey)) byRing.set(ringKey, { ring_number, ringName, lines: [], entryMap: new Map() });
      if (!byClass.has(classKey)) byClass.set(classKey, { class_id, class_number, class_name, lines: [], entryMap: new Map() });
      if (!byHorse.has(horseKey)) byHorse.set(horseKey, { horseName, lines: [], entryMap: new Map() });
      if (!byRider.has(riderKey)) byRider.set(riderKey, { riderName, lines: [], entryMap: new Map() });

      // Entry rollup chips: "Pedro - 14" (horseName - oogNumber)
      const chipLabel = `${horseName || '—'} - ${oog || '—'}`.trim();
      const chipKey = `${horseName}|${oog || ''}|${classKey}|${ringKey}`;

      // Dedup rule: earliest GO / smallest OOG
      upsertChip(byRing.get(ringKey).entryMap, chipKey, { label: chipLabel, horseKey, riderKey, classKey, ringKey, oog, goTime }, goTime, oog);
      upsertChip(byClass.get(classKey).entryMap, chipKey, { label: chipLabel, horseKey, riderKey, classKey, ringKey, oog, goTime }, goTime, oog);
      upsertChip(byHorse.get(horseKey).entryMap, chipKey, { label: chipLabel, horseKey, riderKey, classKey, ringKey, oog, goTime }, goTime, oog);
      upsertChip(byRider.get(riderKey).entryMap, chipKey, { label: chipLabel, horseKey, riderKey, classKey, ringKey, oog, goTime }, goTime, oog);

      // Horses list line: time | class_name | agg
      byHorse.get(horseKey).lines.push({
        kind: 'class',
        timeRaw: goTime,
        time: fmtTimeA(goTime),
        title: class_name || '—',
        agg: aggOne,
        horseKey, riderKey, classKey, ringKey,
      });

      // Riders list line
      byRider.get(riderKey).lines.push({
        kind: 'class',
        timeRaw: goTime,
        time: fmtTimeA(goTime),
        title: class_name || '—',
        agg: aggOne,
        horseKey, riderKey, classKey, ringKey,
      });
    }

    // Sort lines by time
    for (const m of [byRing, byClass, byHorse, byRider]) {
      for (const v of m.values()) {
        v.lines.sort((a,b) => (parseToEpoch(a.timeRaw) || 0) - (parseToEpoch(b.timeRaw) || 0));
      }
    }

    return { byRing, byClass, byHorse, byRider };
  }

  function upsertChip(map, key, obj, timeRaw, oog) {
    if (!map.has(key)) {
      map.set(key, obj);
      return;
    }
    const cur = map.get(key);

    // Compare earliest GO time
    const curT = parseToEpoch(cur.goTime) || Number.POSITIVE_INFINITY;
    const newT = parseToEpoch(timeRaw) || Number.POSITIVE_INFINITY;

    // Compare smallest OOG
    const curO = cur.oog ? Number(cur.oog) : Number.POSITIVE_INFINITY;
    const newO = oog ? Number(oog) : Number.POSITIVE_INFINITY;

    if (newT < curT || (newT === curT && newO < curO)) {
      map.set(key, obj);
    }
  }

  // -----------------------------
  // RENDER HELPERS
  // -----------------------------
  function clearRoot() { el.screenRoot.innerHTML = ''; }

  function setTitle(t) { el.headerTitle.textContent = t; }

  function navAggSet(name, n) {
    const node = document.querySelector(`[data-nav-agg="${name}"]`);
    if (!node) return;
    node.textContent = String(n || 0);
  }

  function makePeakbar(peaks) {
    // peaks = [{label, agg, onClick}]
    const bar = document.createElement('div');
    bar.className = 'peakbar';

    const sc = document.createElement('div');
    sc.className = 'nav-scroller';

    const row = document.createElement('div');
    row.className = 'nav-row';

    for (const p of peaks) {
      if (!p || !p.agg || p.agg <= 0) continue; // don't display agg=0
      const b = document.createElement('button');
      b.className = 'nav-btn';
      b.type = 'button';
      b.innerHTML = `<span class="nav-label">${safeStr(p.label)}</span><span class="nav-agg">${p.agg}</span>`;
      b.addEventListener('click', p.onClick);
      row.appendChild(b);
    }

    sc.appendChild(row);
    bar.appendChild(sc);
    return bar;
  }

  function makeCard(title, id) {
    const card = document.createElement('div');
    card.className = 'card';
    if (id) card.id = id;

    const hdr = document.createElement('div');
    hdr.className = 'card-hdr';
    hdr.innerHTML = `<div class="card-title">${safeStr(title)}</div>`;

    const body = document.createElement('div');
    body.className = 'card-body';

    card.appendChild(hdr);
    card.appendChild(body);
    return { card, body };
  }

  function addLine(body, time, name, agg, clickHandler) {
    if (!agg || agg <= 0) return; // global rule
    const line = document.createElement('div');
    line.className = 'card-line';

    const timeEl = document.createElement('div');
    timeEl.className = 'c-time';
    timeEl.textContent = safeStr(time);

    const nameEl = document.createElement('div');
    nameEl.className = 'c-name';
    nameEl.textContent = safeStr(name);
    if (clickHandler) {
      nameEl.style.cursor = 'pointer';
      nameEl.addEventListener('click', clickHandler);
    }

    const aggEl = document.createElement('div');
    aggEl.className = 'c-agg';
    aggEl.textContent = safeStr(agg);

    line.appendChild(timeEl);
    line.appendChild(nameEl);
    line.appendChild(aggEl);
    body.appendChild(line);
  }

  function addEntryRollup(body, chips) {
    // chips: array of {label, horseKey, riderKey, classKey, ringKey}
    const wrap = document.createElement('div');
    wrap.className = 'entry-rollup';

    for (const c of chips) {
      const chip = document.createElement('span');
      chip.className = 'entry-chip';
      chip.textContent = c.label;
      chip.addEventListener('click', () => {
        // Tap chip shows horse detail (primary), with ring/class context in the detail card
        openDetail('horse', c.horseKey, c.label);
      });
      wrap.appendChild(chip);
    }

    body.appendChild(wrap);
  }

  // -----------------------------
  // INLINE DETAIL CARD (TARGET THIS MARKUP)
  // -----------------------------
  function renderDetailCard() {
    // DETAIL CARD TARGET:
    // Edit this function to change the detail card layout/markup for all entity types.
    const d = state.ui.detail;
    if (!d) return null;

    const wrap = document.createElement('div');
    wrap.className = 'detail-wrap';

    const note = document.createElement('div');
    note.className = 'detail-note';
    note.textContent = `DETAIL: ${d.type.toUpperCase()} — ${d.label || d.key}`;
    wrap.appendChild(note);

    const { card, body } = makeCard(`${d.label || d.key}`);

    // Populate detail lines based on entity type
    const lines = detailLinesFor(d.type, d.key);
    for (const ln of lines.slice(0, 30)) {
      addLine(body, ln.time, ln.title, ln.agg, ln.onClick);
    }

    // For detail, also show rollup chips when available
    const chips = detailChipsFor(d.type, d.key);
    if (chips.length) addEntryRollup(body, chips);

    wrap.appendChild(card);
    return wrap;
  }

  function openDetail(type, key, label) {
    state.ui.detail = { type, key, label: label || key };
    render();
  }

  function closeDetail() {
    state.ui.detail = null;
    render();
  }

  function detailLinesFor(type, key) {
    const out = [];
    if (!state.idx) return out;
    if (type === 'ring') {
      const ring = state.idx.byRing.get(key);
      if (!ring) return out;
      for (const l of ring.lines) {
        out.push({
          time: fmtTimeA(l.timeRaw),
          title: l.title,
          agg: l.agg || 0,
          onClick: () => openDetail('class', l.classKey, l.title),
        });
      }
      return out;
    }
    if (type === 'class') {
      const cls = state.idx.byClass.get(key);
      if (!cls) return out;
      for (const l of cls.lines) {
        out.push({
          time: fmtTimeA(l.timeRaw),
          title: l.title,
          agg: l.agg || 0,
          onClick: () => openDetail('ring', l.ringKey, l.title),
        });
      }
      return out;
    }
    if (type === 'horse') {
      const h = state.idx.byHorse.get(key);
      if (!h) return out;
      for (const l of h.lines) {
        out.push({
          time: fmtTimeA(l.timeRaw),
          title: l.title,
          agg: l.agg || 0,
          onClick: () => openDetail('class', l.classKey, l.title),
        });
      }
      return out;
    }
    if (type === 'rider') {
      const r = state.idx.byRider.get(key);
      if (!r) return out;
      for (const l of r.lines) {
        out.push({
          time: fmtTimeA(l.timeRaw),
          title: l.title,
          agg: l.agg || 0,
          onClick: () => openDetail('class', l.classKey, l.title),
        });
      }
      return out;
    }
    return out;
  }

  function detailChipsFor(type, key) {
    const out = [];
    if (!state.idx) return out;

    let entryMap = null;
    if (type === 'ring') entryMap = state.idx.byRing.get(key)?.entryMap;
    if (type === 'class') entryMap = state.idx.byClass.get(key)?.entryMap;
    if (type === 'horse') entryMap = state.idx.byHorse.get(key)?.entryMap;
    if (type === 'rider') entryMap = state.idx.byRider.get(key)?.entryMap;

    if (!entryMap) return out;
    for (const v of entryMap.values()) out.push(v);

    // Prefer smallest OOG then earliest time
    out.sort((a,b) => {
      const ao = a.oog ? Number(a.oog) : 999999;
      const bo = b.oog ? Number(b.oog) : 999999;
      if (ao !== bo) return ao - bo;
      return (parseToEpoch(a.goTime) || 0) - (parseToEpoch(b.goTime) || 0);
    });

    return out.slice(0, 40);
  }

  // -----------------------------
  // SCREENS
  // -----------------------------
  function renderStart() {
    clearRoot();
    setTitle('Start');

    const r1 = rowButton('Schedule (Full)', 'Open full schedule', () => goto('schedule'));
    const r2 = rowButton('Timeline', 'Horses by time buckets', () => goto('timeline'));
    const r3 = rowButton('Horses', 'Active horses', () => goto('horses'));
    const r4 = rowButton('Riders', 'Active riders', () => goto('riders'));

    el.screenRoot.appendChild(r1);
    el.screenRoot.appendChild(r2);
    el.screenRoot.appendChild(r3);
    el.screenRoot.appendChild(r4);
  }

  function rowButton(title, tag, onClick) {
    const row = document.createElement('div');
    row.className = 'row row--tap';
    row.innerHTML = `<div class="row-title">${safeStr(title)}</div><div class="row-tag">${safeStr(tag)}</div>`;
    row.addEventListener('click', onClick);
    return row;
  }

  function renderSchedule() {
    clearRoot();
    setTitle('Schedule');

    // Inline detail card on top (if open)
    const detail = renderDetailCard();
    if (detail) el.screenRoot.appendChild(detail);

    // Peaks = rings with agg count (only >0)
    const peaks = [];
    const rings = [...state.idx.byRing.entries()]
      .map(([k,v]) => {
        const agg = v.entryMap ? v.entryMap.size : 0;
        return { key:k, ring_number:v.ring_number, ringName:v.ringName, agg };
      })
      .sort((a,b) => (a.ring_number ?? 999) - (b.ring_number ?? 999));

    for (const r of rings) {
      if (!r.agg || r.agg <= 0) continue;
      peaks.push({
        label: r.ringName ? r.ringName : `Ring ${r.ring_number ?? ''}`,
        agg: r.agg,
        onClick: () => {
          location.hash = `#schedule-${r.key.replace(':','-')}`;
        }
      });
    }

    if (peaks.length) el.screenRoot.appendChild(makePeakbar(peaks));

    // Ring cards
    for (const r of rings) {
      if (!r.agg || r.agg <= 0) continue; // global rule
      const ringObj = state.idx.byRing.get(r.key);

      const anchorId = `schedule-${r.key.replace(':','-')}`;
      const title = ringObj.ringName ? ringObj.ringName : `Ring ${ringObj.ring_number ?? ''}`;

      const { card, body } = makeCard(title, anchorId);

      // class line: time | class_name | STATUS(4)
      for (const ln of ringObj.lines.slice(0, 40)) {
        const time = fmtTimeA(ln.timeRaw);
        const name = ln.title; // class_name preferred (already set)
        const status = fmtStatus4(ln.agg > 0 ? 'COMP' : ''); // not ideal; keep agg on right
        addLine(body, time, name, ln.agg || 0, () => openDetail('class', ln.classKey, name));
      }

      // entry rollup chips (deduped)
      const chips = [...ringObj.entryMap.values()];
      if (chips.length) addEntryRollup(body, chips);

      el.screenRoot.appendChild(card);
    }

    // Click-ins: Rings + Classes remain accessible inside schedule via detail
    // (tap a class line => class detail; class detail lines let you open ring detail)
  }

  function renderHorses() {
    clearRoot();
    setTitle('Horses');

    const detail = renderDetailCard();
    if (detail) el.screenRoot.appendChild(detail);

    const horses = [...state.idx.byHorse.entries()]
      .map(([k,v]) => ({ key:k, name:v.horseName, agg: v.entryMap ? v.entryMap.size : 0 }))
      .filter(x => x.agg > 0)
      .sort((a,b) => b.agg - a.agg || a.name.localeCompare(b.name));

    navAggSet('horses', horses.length);

    // Simple list as cards (rings layout)
    for (const h of horses) {
      const obj = state.idx.byHorse.get(h.key);
      const { card, body } = makeCard(h.name || '—');

      // time | class_name | agg(=1 per trip line)
      for (const ln of obj.lines.slice(0, 20)) {
        addLine(body, ln.time, ln.title, ln.agg, () => openDetail('class', ln.classKey, ln.title));
      }

      // entry rollup
      const chips = [...obj.entryMap.values()];
      if (chips.length) addEntryRollup(body, chips);

      card.addEventListener('click', (e) => {
        // avoid double-open if click on inner elements
        if (e.target && (e.target.classList.contains('entry-chip') || e.target.classList.contains('c-name'))) return;
        openDetail('horse', h.key, h.name);
      });

      el.screenRoot.appendChild(card);
    }
  }

  function renderRiders() {
    clearRoot();
    setTitle('Riders');

    const detail = renderDetailCard();
    if (detail) el.screenRoot.appendChild(detail);

    const riders = [...state.idx.byRider.entries()]
      .map(([k,v]) => ({ key:k, name:v.riderName, agg: v.entryMap ? v.entryMap.size : 0 }))
      .filter(x => x.agg > 0)
      .sort((a,b) => b.agg - a.agg || a.name.localeCompare(b.name));

    navAggSet('riders', riders.length);

    for (const r of riders) {
      const obj = state.idx.byRider.get(r.key);
      const { card, body } = makeCard(r.name || '—');

      for (const ln of obj.lines.slice(0, 20)) {
        addLine(body, ln.time, ln.title, ln.agg, () => openDetail('class', ln.classKey, ln.title));
      }

      const chips = [...obj.entryMap.values()];
      if (chips.length) addEntryRollup(body, chips);

      card.addEventListener('click', (e) => {
        if (e.target && (e.target.classList.contains('entry-chip') || e.target.classList.contains('c-name'))) return;
        openDetail('rider', r.key, r.name);
      });

      el.screenRoot.appendChild(card);
    }
  }

  function renderTimeline() {
    clearRoot();
    setTitle('Timeline');

    const detail = renderDetailCard();
    if (detail) el.screenRoot.appendChild(detail);

    // Build simple hour buckets based on scope day and all trip goTimes
    const dt = scopeDt();
    if (!dt) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="row-title">No dt found</div><div class="row-tag">—</div>`;
      el.screenRoot.appendChild(row);
      return;
    }

    const all = [];
    for (const [hk, hv] of state.idx.byHorse.entries()) {
      // pick earliest go time from chips if available
      for (const chip of hv.entryMap.values()) {
        const ms = parseToEpoch(chip.goTime);
        if (!ms) continue;
        all.push({ horseKey: hk, horseName: hv.horseName, ms, label: chip.label, classKey: chip.classKey, ringKey: chip.ringKey });
      }
    }

    all.sort((a,b) => a.ms - b.ms);

    // Bucket by hour
    const buckets = new Map(); // "9:00A" -> []
    for (const it of all) {
      const d = new Date(it.ms);
      d.setMinutes(0,0,0);
      const key = fmtTimeA(d.toISOString());
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }

    // Peaks = hour buckets
    const peaks = [];
    for (const [k, arr] of buckets.entries()) {
      if (!arr.length) continue;
      peaks.push({
        label: k,
        agg: arr.length,
        onClick: () => { location.hash = `#bucket-${k.replace(':','').replace('A','A').replace('P','P')}`; }
      });
    }
    if (peaks.length) el.screenRoot.appendChild(makePeakbar(peaks));

    // Bucket cards: title = hour
    for (const [k, arr] of buckets.entries()) {
      const anchor = `bucket-${k.replace(':','').replace('A','A').replace('P','P')}`;
      const { card, body } = makeCard(k, anchor);

      // Each line: time | horseName | agg(=1)
      for (const it of arr.slice(0, 50)) {
        addLine(body, fmtTimeA(new Date(it.ms).toISOString()), it.horseName, 1, () => openDetail('horse', it.horseKey, it.horseName));
      }

      el.screenRoot.appendChild(card);
    }
  }

  // -----------------------------
  // NAV + ROUTER
  // -----------------------------
  function goto(screen) {
    state.ui.screen = screen;
    // do NOT clear detail automatically; you wanted detail on-page
    render();
    highlightNav();
  }

  function highlightNav() {
    const btns = el.navRow.querySelectorAll('.nav-btn');
    btns.forEach(b => {
      const s = b.getAttribute('data-screen');
      if (!s) return;
      b.classList.toggle('nav-btn--primary', s === state.ui.screen);
    });
  }

  function render() {
    // if detail is open, allow back button to close detail first
    el.headerBack.onclick = () => {
      if (state.ui.detail) { closeDetail(); return; }
      goto('start');
    };

    if (!state.loaded) {
      clearRoot();
      setTitle('Loading…');
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="row-title">Loading data…</div><div class="row-tag">—</div>`;
      el.screenRoot.appendChild(row);
      return;
    }

    switch (state.ui.screen) {
      case 'start': renderStart(); break;
      case 'horses': renderHorses(); break;
      case 'riders': renderRiders(); break;
      case 'timeline': renderTimeline(); break;
      case 'schedule':
      default: renderSchedule(); break;
    }
  }

  // -----------------------------
  // INIT
  // -----------------------------
  async function init() {
    // nav clicks
    el.navRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      const screen = btn.getAttribute('data-screen');
      if (!screen) return;
      goto(screen);
    });

    await loadAll();
    // initial counts
    navAggSet('horses', [...state.idx.byHorse.values()].filter(v => v.entryMap && v.entryMap.size > 0).length);
    navAggSet('riders', [...state.idx.byRider.values()].filter(v => v.entryMap && v.entryMap.size > 0).length);

    goto('schedule');

    // refresh loop
    setInterval(async () => {
      try {
        await loadAll();
        render();
      } catch (err) {
        // keep UI; do not crash
        // eslint-disable-next-line no-console
        console.warn('Refresh failed', err);
      }
    }, REFRESH_MS);
  }

  init().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    clearRoot();
    setTitle('Error');
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="row-title">Failed to load data</div><div class="row-tag">ERR</div>`;
    el.screenRoot.appendChild(row);
  });
})();
