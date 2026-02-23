/* Ring Status — TapActive Rings v2.1 (Flyups)
   Screens: Start | Summary | Lite | Full | Threads
   - Lite uses watch_trips.json (interactive + flyups)
   - Full uses watch_schedule.json (read-only rollups)
   - Threads uses threads.json (read-only)

   Data URLs must match your published structure:
     ./data/latest/watch_trips.json
     ./data/latest/watch_schedule.json
     ./data/latest/threads.json
*/

(() => {
  'use strict';

  //////////////////////
  // Config
  //////////////////////
  const URL_TRIPS = './data/latest/watch_trips.json';
  const URL_SCHEDULE = './data/latest/watch_schedule.json';
  const URL_THREADS = './data/latest/threads.json';

  // Refresh every 6 minutes (360_000 ms)
  const REFRESH_MS = 6 * 60 * 1000;

  //////////////////////
  // DOM helpers
  //////////////////////
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('data-')) n.setAttribute(k, v);
      else if (k === 'style') n.setAttribute('style', v);
      else if (k === 'aria') {
        for (const [ak, av] of Object.entries(v || {})) n.setAttribute(`aria-${ak}`, av);
      } else n.setAttribute(k, v);
    }
    for (const c of (children || [])) {
      if (c == null) continue;
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  };

  const safe = (v, fallback = '—') => {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    return s ? s : fallback;
  };

  //////////////////////
  // Time helpers
  //////////////////////
  // Accepts: "8:05A", "8:05AM", "8A", "12:00P".
  function parseClock12(s) {
    if (!s) return null;
    const t = String(s).trim().toUpperCase();
    const m = t.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*([AP])M?\s*$/);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2] || '0', 10);
    const ap = m[3];
    if (hh === 12) hh = 0;
    if (ap === 'P') hh += 12;
    return { hh, mm };
  }

  function dateFromDtAndClock(dt, clockStr) {
    const p = parseClock12(clockStr);
    if (!dt || !p) return null;
    // Local time
    return new Date(`${dt}T${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}:00`);
  }

  function fmtInMinutes(ms) {
    const mins = Math.round(ms / 60000);
    if (!Number.isFinite(mins)) return null;
    const abs = Math.abs(mins);
    if (abs < 1) return 'now';
    if (abs < 60) return mins > 0 ? `in ${abs}m` : `${abs}m ago`;
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const tail = m ? `${h}h ${m}m` : `${h}h`;
    return mins > 0 ? `in ${tail}` : `${tail} ago`;
  }

  //////////////////////
  // Status mapping
  //////////////////////
  function statusCode(statusRaw) {
    const s = String(statusRaw || '').toLowerCase();
    if (!s) return 'U';
    if (s.startsWith('under') || s.startsWith('live') || s.startsWith('running')) return 'L';
    if (s.startsWith('comp') || s.startsWith('done') || s.startsWith('final')) return 'C';
    return 'U';
  }

  function statusLabel(code) {
    if (code === 'L') return 'Underway';
    if (code === 'C') return 'Completed';
    return 'Upcoming';
  }

  //////////////////////
  // Data normalize
  //////////////////////
  function groupByRingsFromTrips(tripRecords) {
    const rings = new Map();

    for (const r of tripRecords) {
      const rn = Number(r.ring_number ?? r.ringNumber);
      if (!Number.isFinite(rn)) continue;

      const ringKey = String(rn);
      if (!rings.has(ringKey)) {
        rings.set(ringKey, {
          ring_number: rn,
          ringName: r.ringName || r.ring_name || `Ring ${rn}`,
          classes: new Map(),
        });
      }
      const ring = rings.get(ringKey);

      const cid = String(r.class_id ?? r.classId ?? `${rn}-${r.class_number ?? r.classNumber ?? ''}-${r.class_name ?? r.className ?? ''}`);
      if (!ring.classes.has(cid)) {
        const code = statusCode(r.latestStatus ?? r.status);
        ring.classes.set(cid, {
          class_id: cid,
          ring_number: rn,
          ringName: ring.ringName,
          class_group_id: r.class_group_id ?? r.classGroupId ?? null,
          group_name: r.group_name ?? r.groupName ?? null,
          class_number: r.class_number ?? r.classNumber ?? null,
          class_name: r.class_name ?? r.className ?? null,
          class_type: r.class_type ?? r.classType ?? null,
          schedule_sequencetype: r.schedule_sequencetype ?? r.scheduleSequenceType ?? null,
          latestStatus: r.latestStatus ?? r.status ?? null,
          status_code: code,
          latestStart: r.latestStart ?? r.estimated_start_time ?? r.estimatedStart ?? null,
          time_sort: r.time_sort ?? null,
          estimated_end_time: r.estimated_end_time ?? null,
          total_trips: r.total_trips ?? null,
          dt: r.dt ?? null,
          entries: [],
        });
      }

      const cls = ring.classes.get(cid);
      // Ensure most recent status/time wins if records differ
      const code = statusCode(r.latestStatus ?? r.status);
      if (code === 'L' && cls.status_code !== 'L') cls.status_code = 'L';
      if (code === 'C' && cls.status_code === 'U') cls.status_code = 'C';
      if (r.latestStart) cls.latestStart = r.latestStart;
      if (r.time_sort != null) cls.time_sort = r.time_sort;
      if (r.total_trips != null) cls.total_trips = r.total_trips;

      const entry = {
        entry_id: String(r.entry_id ?? r.entryId ?? ''),
        backNumber: r.backNumber ?? r.entryNumber ?? r.back_number ?? null,
        barnName: r.barnName ?? r.barn_name ?? null,
        horseName: r.horseName ?? r.horse_name ?? null,
        riderName: r.riderName ?? r.rider_name ?? null,
        teamName: r.teamName ?? null,
        runningOOG: r.runningOOG ?? null,
        lastOOG: r.lastOOG ?? null,
        latestGO: r.latestGO ?? null,
        lastGoneIn: r.lastGoneIn ?? null,
        lastPlacing: r.lastPlacing ?? r.latestPlacing ?? null,
        latestPlacing: r.latestPlacing ?? null,
        lastPosition: r.lastPosition ?? null,
        lastPlace: r.lastPlace ?? null,
        lastScore: r.lastScore ?? null,
        lastTime: r.lastTime ?? null,
        score1: r.score1 ?? null,
        score2: r.score2 ?? null,
        score3: r.score3 ?? null,
        time_one: r.time_one ?? null,
        time_two: r.time_two ?? null,
        time_three: r.time_three ?? null,
        dt: r.dt ?? cls.dt ?? null,
        class_type: cls.class_type,
        schedule_sequencetype: cls.schedule_sequencetype,
        class_id: cls.class_id,
        ring_number: rn,
      };
      // Entry-level "gone in" is independent of class completion.
      entry.goneIn = Boolean(entry.lastPosition || entry.lastScore || entry.lastTime || entry.lastPlace || entry.latestPlacing);

      cls.entries.push(entry);
    }

    const ringArr = Array.from(rings.values());
    ringArr.sort((a, b) => a.ring_number - b.ring_number);

    for (const ring of ringArr) {
      ring.classesArr = Array.from(ring.classes.values());
      ring.classesArr.sort((a, b) => {
        const ta = (a.time_sort == null ? 1e15 : Number(a.time_sort));
        const tb = (b.time_sort == null ? 1e15 : Number(b.time_sort));
        if (ta !== tb) return ta - tb;
        const na = Number(a.class_number ?? 1e15);
        const nb = Number(b.class_number ?? 1e15);
        return na - nb;
      });
    }

    return ringArr;
  }

  function groupByRingsFromSchedule(scheduleRecords) {
    const rings = new Map();
    for (const r of scheduleRecords) {
      const rn = Number(r.ring_number ?? r.ringNumber);
      if (!Number.isFinite(rn)) continue;
      const ringKey = String(rn);
      if (!rings.has(ringKey)) {
        rings.set(ringKey, {
          ring_number: rn,
          ringName: r.ringName || r.ring_name || `Ring ${rn}`,
          classes: [],
        });
      }
      const ring = rings.get(ringKey);

      ring.classes.push({
        class_id: String(r.class_id ?? r.classId ?? `${rn}-${r.class_number ?? ''}-${r.class_name ?? ''}`),
        ring_number: rn,
        ringName: ring.ringName,
        class_group_id: r.class_group_id ?? null,
        group_name: r.group_name ?? null,
        class_number: r.class_number ?? null,
        class_name: r.class_name ?? null,
        class_type: r.class_type ?? null,
        schedule_sequencetype: r.schedule_sequencetype ?? null,
        status_raw: r.latestStatus ?? r.status ?? null,
        status_code: statusCode(r.latestStatus ?? r.status),
        estStart: r.latestStart ?? r.estimated_start_time ?? r.estimated_start ?? null,
        time_sort: r.time_sort ?? null,
        estimated_end_time: r.estimated_end_time ?? null,
        total_trips: r.total_trips ?? null,
        rollup_horses: Array.isArray(r.rollup_horses) ? r.rollup_horses : [],
      });
    }

    const ringArr = Array.from(rings.values());
    ringArr.sort((a, b) => a.ring_number - b.ring_number);
    for (const ring of ringArr) {
      ring.classes.sort((a, b) => {
        const ta = (a.time_sort == null ? 1e15 : Number(a.time_sort));
        const tb = (b.time_sort == null ? 1e15 : Number(b.time_sort));
        if (ta !== tb) return ta - tb;
        const na = Number(a.class_number ?? 1e15);
        const nb = Number(b.class_number ?? 1e15);
        return na - nb;
      });
    }
    return ringArr;
  }

  //////////////////////
  // UI state
  //////////////////////
  const state = {
    screen: 'start',
    lastRefreshAt: null,
    lastError: null,

    tripsRaw: [],
    scheduleRaw: [],
    threadsRaw: [],

    ringsLite: [],
    ringsFull: [],

    filters: {
      status: 'ALL',
      horse: null,
    },

    // Per-ring eyelid filters: { [ring_number]: 'ALL'|'U'|'L'|'C' }
    ringFilters: {},

    horses: [],
  };

  //////////////////////
  // Flyup
  //////////////////////
  const fly = {
    root: null,
    title: null,
    body: null,
    closeBtn: null,
  };

  function flyOpen(title, kvPairs) {
    fly.title.textContent = title || 'Details';
    fly.body.innerHTML = '';

    const kv = el('div', { class: 'kv' });
    for (const { k, v } of kvPairs) {
      kv.appendChild(
        el('div', { class: 'kv__item' }, [
          el('div', { class: 'kv__k', text: k }),
          el('div', { class: 'kv__v mono', text: safe(v) }),
        ])
      );
    }

    fly.body.appendChild(kv);

    fly.root.classList.add('is-on');
    fly.root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function flyClose() {
    fly.root.classList.remove('is-on');
    fly.root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  //////////////////////
  // Render helpers
  //////////////////////
  function setTop(title, sub) {
    qs('#topTitle').textContent = title;
    qs('#topSub').textContent = sub || '';
  }

  function setView(screen) {
    state.screen = screen;

    const map = {
      start: ['Start', statusSub()],
      summary: ['Summary', statusSub()],
      lite: ['Lite', statusSub()],
      full: ['Full', statusSub()],
      threads: ['Threads', statusSub()],
    };

    const [t, s] = map[screen] || ['Ring Status', statusSub()];
    setTop(t, s);

    // Views
    for (const v of qsa('.view')) v.classList.remove('is-on');
    const viewEl = qs(`#view${screen.charAt(0).toUpperCase()}${screen.slice(1)}`);
    if (viewEl) viewEl.classList.add('is-on');

    // Nav
    for (const b of qsa('.nav-btn')) b.classList.toggle('is-on', b.dataset.screen === screen);

    // Peaks + horses visibility
    const peaksWrap = qs('#peaksWrap');
    const horsesWrap = qs('#horsesWrap');

    if (screen === 'lite') {
      peaksWrap.style.display = '';
      horsesWrap.style.display = '';
    } else if (screen === 'full') {
      peaksWrap.style.display = '';
      horsesWrap.style.display = 'none';
    } else {
      peaksWrap.style.display = 'none';
      horsesWrap.style.display = 'none';
    }

    // Render current
    render();
  }

  function statusSub() {
    const t = state.lastRefreshAt ? new Date(state.lastRefreshAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
    return `Last refresh ${t}`;
  }

  function renderEmpty(msg) {
    return el('div', { class: 'empty', text: msg });
  }

  function render() {
    if (state.screen === 'start') renderStart();
    if (state.screen === 'summary') renderSummary();
    if (state.screen === 'lite') renderLite();
    if (state.screen === 'full') renderFull();
    if (state.screen === 'threads') renderThreads();
  }

  function renderStart() {
    const root = qs('#viewStart');
    root.innerHTML = '';

    const counts = computeCountsFromTrips();

    root.appendChild(
      el('div', { class: 'stack' }, [
        el('div', { class: 'card' }, [
          el('div', { class: 'card__hd' }, [
            el('div', { class: 'card__title', text: 'System' }),
            el('div', { class: 'card__meta', text: state.lastError ? 'Partial' : 'OK' }),
          ]),
          el('div', { class: 'rows' }, [
            infoRow('Trips', `${counts.totalEntries} entries / ${counts.totalClasses} classes`),
            infoRow('Underway', `${counts.underway}`),
            infoRow('Upcoming', `${counts.upcoming}`),
            infoRow('Completed', `${counts.completed}`),
            infoRow('Error', state.lastError ? state.lastError : '—'),
          ])
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card__hd' }, [
            el('div', { class: 'card__title', text: 'Quick' }),
            el('div', { class: 'card__meta', text: 'Open screens' }),
          ]),
          el('div', { class: 'rows' }, [
            navRow('Summary', 'At-a-glance', 'summary'),
            navRow('Lite', 'Your trips + flyups', 'lite'),
            navRow('Full', 'All classes (read-only)', 'full'),
            navRow('Threads', 'Refresh log', 'threads'),
          ])
        ])
      ])
    );
  }

  function renderSummary() {
    const root = qs('#viewSummary');
    root.innerHTML = '';

    const counts = computeCountsFromTrips();
    const live = listClassesFromTrips({ status: 'L', limit: 8 });
    const up = listClassesFromTrips({ status: 'U', limit: 8 });

    root.appendChild(
      el('div', { class: 'stack' }, [
        el('div', { class: 'card' }, [
          el('div', { class: 'card__hd' }, [
            el('div', { class: 'card__title', text: 'At a glance' }),
            el('div', { class: 'card__meta', text: `${counts.totalEntries} entries` }),
          ]),
          el('div', { class: 'rows' }, [
            infoRow('Underway', `${counts.underway}`),
            infoRow('Upcoming', `${counts.upcoming}`),
            infoRow('Completed', `${counts.completed}`),
          ])
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card__hd' }, [
            el('div', { class: 'card__title', text: 'Live now' }),
            el('div', { class: 'card__meta', text: live.length ? '' : '—' }),
          ]),
          live.length ? el('div', { class: 'rows' }, live.map(c => classRow(c, true))) : el('div', { style: 'padding:12px' }, [renderEmpty('No underway classes in trips feed.')])
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card__hd' }, [
            el('div', { class: 'card__title', text: 'Next up' }),
            el('div', { class: 'card__meta', text: up.length ? '' : '—' }),
          ]),
          up.length ? el('div', { class: 'rows' }, up.map(c => classRow(c, true))) : el('div', { style: 'padding:12px' }, [renderEmpty('No upcoming classes in trips feed.')])
        ])
      ])
    );
  }

  function renderLite() {
    buildPeaks(state.ringsLite);
    buildStatusFilters();
    buildHorseChips();

    const root = qs('#viewLite');
    root.innerHTML = '';

    if (!state.ringsLite.length) {
      root.appendChild(renderEmpty('No trips data loaded.'));
      return;
    }

    root.appendChild(
      el('div', { class: 'stack', id: 'liteStack' }, state.ringsLite.map(r => ringCardLite(r)))
    );
  }

  function renderFull() {
    buildPeaks(state.ringsFull);
    buildStatusFilters();

    const root = qs('#viewFull');
    root.innerHTML = '';

    if (!state.ringsFull.length) {
      root.appendChild(renderEmpty('No schedule data loaded.'));
      return;
    }

    root.appendChild(
      el('div', { class: 'stack', id: 'fullStack' }, state.ringsFull.map(r => ringCardFull(r)))
    );
  }

  function renderThreads() {
    const root = qs('#viewThreads');
    root.innerHTML = '';

    const rows = Array.isArray(state.threadsRaw) ? state.threadsRaw : [];
    if (!rows.length) {
      root.appendChild(renderEmpty('No threads yet.'));
      return;
    }

    const cards = el('div', { class: 'stack' });

    for (const t of rows.slice(0, 200)) {
      const when = t.observed_at ? new Date(t.observed_at).toLocaleString() : '—';
      const title = t.title || 'Update';
      const body = t.body || '';
      const meta = [];
      if (t.ring_number) meta.push(`Ring ${t.ring_number}`);
      if (t.class_id) meta.push(`Class ${t.class_id}`);
      if (t.entry_id) meta.push(`Entry ${t.entry_id}`);

      cards.appendChild(
        el('div', { class: 'card' }, [
          el('div', { class: 'card__hd' }, [
            el('div', { class: 'card__title', text: title }),
            el('div', { class: 'card__meta', text: when }),
          ]),
          el('div', { class: 'rows' }, [
            el('div', { class: 'row' }, [
              el('div', { class: 'row__l', text: safe(t.level, 'info') }),
              el('div', { class: 'row__m' }, [
                el('div', { class: 'line1', text: body || '—' }),
                el('div', { class: 'line2', text: meta.join(' • ') || '—' }),
              ]),
              el('div', { class: 'row__r', text: '' }),
            ])
          ])
        ])
      );
    }

    root.appendChild(cards);
  }

  function infoRow(k, v) {
    return el('div', { class: 'row' }, [
      el('div', { class: 'row__l', text: k }),
      el('div', { class: 'row__m' }, [
        el('div', { class: 'line1', text: v }),
      ]),
      el('div', { class: 'row__r', text: '' }),
    ]);
  }

  function navRow(title, subtitle, screen) {
    const r = el('div', { class: 'row row--tap', 'data-screen': screen }, [
      el('div', { class: 'row__l', text: '' }),
      el('div', { class: 'row__m' }, [
        el('div', { class: 'line1', text: title }),
        el('div', { class: 'line2', text: subtitle }),
      ]),
      el('div', { class: 'row__r', text: '' }),
    ]);
    r.addEventListener('click', () => setView(screen));
    return r;
  }

  function classRow(cls, interactive) {
    const left = safe(cls.latestStart, '—');
    const right = statusLabel(cls.status_code);
    const mid1 = `${safe(cls.class_number)} • ${safe(cls.class_name)}`;
    const mid2 = `${safe(cls.group_name)} • ${safe(cls.class_type)} • ${safe(cls.schedule_sequencetype)}`;

    const r = el('div', { class: `row ${interactive ? 'row--tap' : ''}` }, [
      el('div', { class: 'row__l mono', text: left }),
      el('div', { class: 'row__m' }, [
        el('div', { class: 'line1', text: mid1 }),
        el('div', { class: 'line2', text: mid2 }),
      ]),
      el('div', { class: 'row__r', text: right }),
    ]);

    if (interactive) {
      r.addEventListener('click', () => openClassFly(cls));
    }

    return r;
  }

  function ringCardLite(ring) {
    const card = el('div', { class: 'card', id: `ring-${ring.ring_number}` });

    const underwayCount = ring.classesArr.filter(c => c.status_code === 'L').length;
    const upcomingCount = ring.classesArr.filter(c => c.status_code === 'U').length;
    const completedCount = ring.classesArr.filter(c => c.status_code === 'C').length;

    card.appendChild(
      el('div', { class: 'card__hd' }, [
        el('div', { class: 'card__title', text: safe(ring.ringName, `Ring ${ring.ring_number}`) }),
        el('div', { class: 'card__meta', text: `U:${upcomingCount} • L:${underwayCount} • C:${completedCount}` }),
      ])
    );

    // Ring eyelid filter
    card.appendChild(ringFilterBar(ring.ring_number));

    const rows = el('div', { class: 'rows' });

    const filtered = applyClassFilters(ring.classesArr, ring.ring_number);
    for (const cls of filtered) {
      // class row
      const cr = classRow(cls, true);
      // status shading at card-level is by class; we apply via data-status on an inner wrapper.
      const classWrap = el('div', { class: 'card', 'data-status': cls.status_code, style: 'margin:10px; overflow:hidden;' });
      classWrap.appendChild(el('div', { class: 'rows' }, [cr, entryRowLite(cls)]));
      rows.appendChild(classWrap);
    }

    if (!filtered.length) {
      rows.appendChild(el('div', { style: 'padding:12px' }, [renderEmpty('No classes match filters.') ]));
    }

    card.appendChild(rows);
    return card;
  }

  function ringCardFull(ring) {
    const card = el('div', { class: 'card', id: `ring-${ring.ring_number}` });

    const underwayCount = ring.classes.filter(c => c.status_code === 'L').length;
    const upcomingCount = ring.classes.filter(c => c.status_code === 'U').length;
    const completedCount = ring.classes.filter(c => c.status_code === 'C').length;

    card.appendChild(
      el('div', { class: 'card__hd' }, [
        el('div', { class: 'card__title', text: safe(ring.ringName, `Ring ${ring.ring_number}`) }),
        el('div', { class: 'card__meta', text: `U:${upcomingCount} • L:${underwayCount} • C:${completedCount}` }),
      ])
    );

    // Ring eyelid filter
    card.appendChild(ringFilterBar(ring.ring_number));

    const rows = el('div', { class: 'rows' });

    const filtered = applyClassFilters(ring.classes, ring.ring_number);
    for (const cls of filtered) {
      const classWrap = el('div', { class: 'card', 'data-status': cls.status_code, style: 'margin:10px; overflow:hidden;' });
      classWrap.appendChild(el('div', { class: 'rows' }, [classRow(cls, false), entryRowFull(cls)]));
      rows.appendChild(classWrap);
    }

    if (!filtered.length) {
      rows.appendChild(el('div', { style: 'padding:12px' }, [renderEmpty('No classes match filters.') ]));
    }

    card.appendChild(rows);
    return card;
  }

  function applyClassFilters(classesArr, ringNumber) {
    const ringWant = state.ringFilters[String(ringNumber)] || 'ALL';
    const want = ringWant !== 'ALL' ? ringWant : state.filters.status;
    const horse = state.filters.horse;

    return classesArr.filter(c => {
      if (want !== 'ALL' && c.status_code !== want) return false;
      if (horse && c.entries) {
        // Lite only
        const has = c.entries.some(e => (e.horseName || '').toLowerCase() === horse.toLowerCase());
        if (!has) return false;
      }
      return true;
    });
  }

  function ringFilterBar(ringNumber) {
    const rn = String(ringNumber);
    if (!state.ringFilters[rn]) state.ringFilters[rn] = 'ALL';

    const wrap = el('div', { style: 'padding:8px 12px; border-bottom:1px solid rgba(148,163,184,.14); background:rgba(2,6,23,.22);' });
    const bar = el('div', { class: 'filterbar' });
    const opts = [
      { k: 'ALL', label: 'All' },
      { k: 'U', label: 'U' },
      { k: 'L', label: 'L' },
      { k: 'C', label: 'C' },
    ];

    for (const o of opts) {
      const b = el('button', { class: 'fbtn', type: 'button', text: o.label });
      if (state.ringFilters[rn] === o.k) b.classList.add('is-on');
      b.addEventListener('click', () => {
        state.ringFilters[rn] = o.k;
        render();
      });
      bar.appendChild(b);
    }

    wrap.appendChild(bar);
    return wrap;
  }

  function entryRowLite(cls) {
    const pills = el('div', { class: 'pills' });

    const entries = Array.isArray(cls.entries) ? cls.entries : [];
    if (!entries.length) {
      pills.appendChild(el('span', { class: 'pill', text: '—', 'aria-disabled': 'true' }));
    } else {
      for (const e of entries) {
        const label = `${safe(e.barnName || e.horseName)} • ${safe(e.lastOOG)} • ${safe(e.latestGO)}`;
        const pill = el('button', {
          class: 'pill',
          type: 'button',
          text: label,
          'data-open-entry': e.entry_id,
        });
        const placing = Number(e.latestPlacing ?? e.lastPlacing ?? e.lastPlace);
        if (Number.isFinite(placing) && placing >= 1 && placing <= 8) pill.setAttribute('data-place', String(placing));
        pill.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openEntryFly(e, cls);
        });
        pills.appendChild(pill);
      }
    }

    return el('div', { class: 'row row--entries' }, [
      el('div', { class: 'row__l', text: '' }),
      el('div', { class: 'row__m' }, [pills]),
      el('div', { class: 'row__r', text: '' }),
    ]);
  }

  function entryRowFull(cls) {
    const pills = el('div', { class: 'pills' });

    const horses = Array.isArray(cls.rollup_horses) ? cls.rollup_horses : [];
    if (!horses.length) {
      pills.appendChild(el('span', { class: 'pill', text: '—', 'aria-disabled': 'true' }));
    } else {
      for (const h of horses.slice(0, 12)) {
        const pill = el('span', { class: 'pill', text: safe(h), 'aria-disabled': 'true' });
        pills.appendChild(pill);
      }
      if (horses.length > 12) pills.appendChild(el('span', { class: 'pill', text: `+${horses.length - 12}`, 'aria-disabled': 'true' }));
    }

    return el('div', { class: 'row row--entries' }, [
      el('div', { class: 'row__l', text: '' }),
      el('div', { class: 'row__m' }, [pills]),
      el('div', { class: 'row__r', text: '' }),
    ]);
  }

  //////////////////////
  // Flyup content
  //////////////////////
  function openClassFly(cls) {
    const dt = cls.dt;
    const startClock = cls.latestStart;
    const startDate = dateFromDtAndClock(dt, startClock);
    const tt = startDate ? fmtInMinutes(startDate.getTime() - Date.now()) : null;

    flyOpen(
      `Class ${safe(cls.class_number)} • ${safe(cls.class_name)}`,
      [
        { k: 'Ring', v: cls.ringName },
        { k: 'Ring #', v: cls.ring_number },
        { k: 'Group', v: safe(cls.group_name) },
        { k: 'Group ID', v: safe(cls.class_group_id) },
        { k: 'Class Type', v: safe(cls.class_type) },
        { k: 'Sequence', v: safe(cls.schedule_sequencetype) },
        { k: 'Status', v: safe(cls.latestStatus ?? statusLabel(cls.status_code)) },
        { k: 'Total Trips', v: safe(cls.total_trips) },
        { k: 'Est Start', v: safe(cls.latestStart) },
        { k: 'Time Till', v: tt || '—' },
      ]
    );
  }

  function openEntryFly(entry, cls) {
    const dt = entry.dt;
    const goClock = entry.latestGO;
    const goDate = dateFromDtAndClock(dt, goClock);
    const ttGo = goDate ? fmtInMinutes(goDate.getTime() - Date.now()) : null;

    const classType = (entry.class_type || cls?.class_type || '').toLowerCase();
    const seq = (entry.schedule_sequencetype || cls?.schedule_sequencetype || '').toLowerCase();
    const isJumpers = classType.includes('jump');
    const isFlat = seq.includes('saddle') || seq.includes('flat');

    const scoreOrTimeKey = isJumpers ? 'Time' : 'Score';
    const scoreOrTimeVal = isJumpers ? (entry.lastTime ?? entry.time_one ?? entry.time_two ?? entry.time_three) : (entry.lastScore ?? entry.score1 ?? entry.score2 ?? entry.score3);

    // Placing preference: latestPlacing (1-8) first, then lastPlace/lastPosition.
    const placing = entry.latestPlacing ?? entry.lastPlacing ?? entry.lastPlace ?? entry.lastPosition;

    flyOpen(
      `${safe(entry.backNumber)} • ${safe(entry.horseName)} • ${safe(entry.riderName)}`,
      [
        { k: 'Barn', v: safe(entry.barnName) },
        { k: 'Class', v: `${safe(cls?.class_number)} • ${safe(cls?.class_name)}` },
        { k: 'Ring', v: safe(cls?.ringName) },
        { k: 'Order (Target)', v: safe(entry.lastOOG) },
        { k: 'Order (Running)', v: safe(entry.runningOOG) },
        { k: 'GO (Est)', v: safe(entry.latestGO) },
        { k: 'Time Till GO', v: ttGo || '—' },
        { k: 'Placing', v: safe(placing) },
        { k: scoreOrTimeKey, v: isFlat ? safe(scoreOrTimeVal, '—') : safe(scoreOrTimeVal, '—') },
        { k: 'Gone In', v: entry.goneIn ? 'Yes' : 'No' },
      ]
    );
  }

  //////////////////////
  // Peaks + Filters + Horses
  //////////////////////
  function buildPeaks(rings) {
    const peaks = qs('#peaks');
    peaks.innerHTML = '';

    for (const r of rings) {
      const b = el('button', { class: 'peak', type: 'button', text: `Ring ${r.ring_number}` });
      b.addEventListener('click', () => {
        // Scroll to ring card anchor
        const target = qs(`#ring-${r.ring_number}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // UI on-state
        for (const p of qsa('.peak', peaks)) p.classList.remove('is-on');
        b.classList.add('is-on');
      });
      peaks.appendChild(b);
    }
  }

  function buildStatusFilters() {
    const bar = qs('#statusFilters');
    bar.innerHTML = '';

    const opts = [
      { k: 'ALL', label: 'All' },
      { k: 'U', label: 'Upcoming' },
      { k: 'L', label: 'Underway' },
      { k: 'C', label: 'Completed' },
    ];

    for (const o of opts) {
      const b = el('button', { class: 'fbtn', type: 'button', text: o.label, 'data-k': o.k });
      if (state.filters.status === o.k) b.classList.add('is-on');
      b.addEventListener('click', () => {
        state.filters.status = o.k;
        buildStatusFilters();
        render();
      });
      bar.appendChild(b);
    }
  }

  function buildHorseChips() {
    const wrap = qs('#horses');
    wrap.innerHTML = '';

    const all = el('button', { class: 'chip', type: 'button', text: 'All Horses' });
    all.classList.toggle('is-on', !state.filters.horse);
    all.addEventListener('click', () => {
      state.filters.horse = null;
      buildHorseChips();
      render();
    });
    wrap.appendChild(all);

    for (const h of state.horses) {
      const b = el('button', { class: 'chip', type: 'button', text: h });
      b.classList.toggle('is-on', state.filters.horse === h);
      b.addEventListener('click', () => {
        state.filters.horse = (state.filters.horse === h) ? null : h;
        buildHorseChips();
        render();
      });
      wrap.appendChild(b);
    }
  }

  //////////////////////
  // Counts
  //////////////////////
  function computeCountsFromTrips() {
    const classes = listAllTripClasses();
    const totalClasses = classes.length;
    const totalEntries = state.tripsRaw.length;
    const underway = classes.filter(c => c.status_code === 'L').length;
    const upcoming = classes.filter(c => c.status_code === 'U').length;
    const completed = classes.filter(c => c.status_code === 'C').length;
    return { totalClasses, totalEntries, underway, upcoming, completed };
  }

  function listAllTripClasses() {
    const out = [];
    for (const r of state.ringsLite) {
      for (const c of (r.classesArr || [])) out.push(c);
    }
    return out;
  }

  function listClassesFromTrips({ status, limit = 10 }) {
    const all = listAllTripClasses();
    const filtered = all.filter(c => c.status_code === status);
    filtered.sort((a, b) => {
      const ta = (a.time_sort == null ? 1e15 : Number(a.time_sort));
      const tb = (b.time_sort == null ? 1e15 : Number(b.time_sort));
      return ta - tb;
    });
    return filtered.slice(0, limit);
  }

  //////////////////////
  // Load
  //////////////////////
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  }

  async function loadAll() {
    state.lastError = null;

    const [tripsRes, schedRes, threadsRes] = await Promise.allSettled([
      fetchJson(URL_TRIPS),
      fetchJson(URL_SCHEDULE),
      fetchJson(URL_THREADS),
    ]);

    // Trips (required for Lite)
    if (tripsRes.status === 'fulfilled') {
      const recs = Array.isArray(tripsRes.value?.records) ? tripsRes.value.records : (Array.isArray(tripsRes.value) ? tripsRes.value : []);
      state.tripsRaw = recs;
      state.ringsLite = groupByRingsFromTrips(recs);
      state.horses = buildHorseListFromTrips(recs);
    } else {
      state.tripsRaw = [];
      state.ringsLite = [];
      state.horses = [];
      state.lastError = `Trips: ${String(tripsRes.reason?.message || tripsRes.reason)}`;
    }

    // Schedule (optional)
    if (schedRes.status === 'fulfilled') {
      const recs = Array.isArray(schedRes.value?.records) ? schedRes.value.records : (Array.isArray(schedRes.value) ? schedRes.value : []);
      state.scheduleRaw = recs;
      state.ringsFull = groupByRingsFromSchedule(recs);
    } else {
      state.scheduleRaw = [];
      state.ringsFull = [];
      state.lastError = state.lastError ? `${state.lastError} | Schedule: ${String(schedRes.reason?.message || schedRes.reason)}` : `Schedule: ${String(schedRes.reason?.message || schedRes.reason)}`;
    }

    // Threads (optional)
    if (threadsRes.status === 'fulfilled') {
      const recs = Array.isArray(threadsRes.value?.records) ? threadsRes.value.records : (Array.isArray(threadsRes.value) ? threadsRes.value : []);
      state.threadsRaw = recs;
    } else {
      state.threadsRaw = [];
      // don't elevate
    }

    state.lastRefreshAt = Date.now();

    // Keep screen stable; re-render
    setTop(qs('#topTitle').textContent, statusSub());
    render();
  }

  function buildHorseListFromTrips(recs) {
    const set = new Set();
    for (const r of recs) {
      const h = (r.horseName || r.horse_name || '').trim();
      if (h) set.add(h);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  //////////////////////
  // Init
  //////////////////////
  function bindUI() {
    // bottom nav
    for (const b of qsa('.nav-btn')) {
      b.addEventListener('click', () => setView(b.dataset.screen));
    }

    // refresh
    qs('#btnRefresh').addEventListener('click', () => loadAll().catch(err => {
      state.lastError = String(err?.message || err);
      render();
    }));

    // fly close
    fly.root = qs('#fly');
    fly.title = qs('#flyTitle');
    fly.body = qs('#flyBody');
    fly.closeBtn = qs('#flyClose');
    fly.closeBtn.addEventListener('click', flyClose);
    fly.root.addEventListener('click', (e) => {
      if (e.target === fly.root) flyClose();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fly.root.classList.contains('is-on')) flyClose();
    });
  }

  function boot() {
    bindUI();
    setView('start');
    loadAll().catch(err => {
      state.lastError = String(err?.message || err);
      render();
    });
    setInterval(() => {
      loadAll().catch(() => {});
    }, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
