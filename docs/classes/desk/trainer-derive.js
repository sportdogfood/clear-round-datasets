// trainer_derive.js
// - Produces trainer_rows from sessionStorage: schedule + entries
// - Grouping: Ring -> class_group_id -> Classes (sorted by time)
// - View behavior is renderer-only (default/detail toggle)
// - Adds logs + stores trainer_debug in sessionStorage

(() => {
  "use strict";

  // ----------------------------
  // Storage helpers (standalone)
  // ----------------------------
  function ssGetRaw(key) {
    return sessionStorage.getItem(key);
  }
  function ssGet(key) {
    const v = sessionStorage.getItem(key);
    if (!v) return null;
    try { return JSON.parse(v); } catch { return v; }
  }
  function ssSet(key, obj) {
    try { sessionStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  // ----------------------------
  // Safe field access
  // ----------------------------
  function firstDefined(...vals) {
    for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
    return null;
  }

  function toInt(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normStr(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  // time strings: "HH:MM" or "HH:MM:SS"
  function timeToMinutes(t) {
    const s = normStr(t);
    if (!s) return null;
    const parts = s.split(":").map(x => Number(x));
    if (parts.length < 2 || parts.some(n => !Number.isFinite(n))) return null;
    const hh = parts[0] || 0;
    const mm = parts[1] || 0;
    return hh * 60 + mm;
  }

  function minMinutes(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    return Math.min(a, b);
  }

  // ----------------------------
  // Normalize schedule rows (robust to nesting)
  // ----------------------------
  function normalizeScheduleItem(item) {
    const cd = item?.class_data || null;

    const ring = firstDefined(
      item?.ring,
      cd?.ring,
      item?.ring_number,
      cd?.ring_number,
      item?.ring_id,
      cd?.ring_id
    );

    const class_group_id = firstDefined(
      item?.class_group_id,
      cd?.class_group_id
    );

    const group_sequence = firstDefined(
      item?.class_group_sequence,
      item?.group_sequence,
      cd?.class_group_sequence,
      cd?.group_sequence
    );

    const class_id = firstDefined(
      item?.class_id,
      cd?.class_id
    );

    const class_number = firstDefined(
      item?.class_number,
      cd?.class_number
    );

    const class_name = firstDefined(
      item?.class_name,
      cd?.class_name
    );

    // schedule time field is inconsistent across feeds — try common candidates
    const sched_time = firstDefined(
      item?.time,
      item?.start_time,
      item?.scheduled_time,
      item?.estimated_start_time,
      cd?.time,
      cd?.start_time,
      cd?.scheduled_time,
      cd?.estimated_start_time
    );

    return {
      _raw: item,
      ring: toInt(ring) ?? ring, // keep numeric if possible
      class_group_id: toInt(class_group_id) ?? class_group_id,
      group_sequence: toInt(group_sequence) ?? group_sequence,
      class_id: toInt(class_id) ?? class_id,
      class_number: toInt(class_number) ?? class_number,
      class_name: normStr(class_name),
      sched_time: normStr(sched_time),
      sched_minutes: timeToMinutes(sched_time)
    };
  }

  // ----------------------------
  // Normalize entry rows (robust to nesting)
  // ----------------------------
  function normalizeEntryItem(item) {
    const ec = item?.entry_class || null;
    const cd = item?.class_data || null;

    const class_id = firstDefined(
      item?.class_id,
      ec?.class_id,
      cd?.class_id
    );

    const horse = firstDefined(item?.horse, item?.horse_name);
    const rider_name = firstDefined(
      ec?.rider_name,
      item?.rider_name,
      item?.rider
    );

    const estimated_go_time = firstDefined(
      ec?.estimated_go_time,
      item?.estimated_go_time
    );

    const order_of_go = firstDefined(
      ec?.order_of_go,
      item?.order_of_go
    );

    return {
      _raw: item,
      class_id: toInt(class_id) ?? class_id,
      horse: normStr(horse),
      rider_name: normStr(rider_name),
      estimated_go_time: normStr(estimated_go_time),
      est_minutes: timeToMinutes(estimated_go_time),
      order_of_go: toInt(order_of_go) ?? 0
    };
  }

  // ----------------------------
  // Derive report model
  // ----------------------------
  function deriveTrainerRows() {
    const scheduleRaw = ssGet("schedule");
    const entriesRaw = ssGet("entries");

    const debug = {
      at: new Date().toISOString(),
      ok: true,
      schedule_type: typeof scheduleRaw,
      entries_type: typeof entriesRaw,
      schedule_len: Array.isArray(scheduleRaw) ? scheduleRaw.length : null,
      entries_len: Array.isArray(entriesRaw) ? entriesRaw.length : null,
      schedule_sample: null,
      entries_sample: null,
      normalized_schedule_sample: null,
      normalized_entry_sample: null,
      missing_fields_counts: {
        ring: 0,
        class_group_id: 0,
        class_id: 0,
        class_number: 0,
        class_name: 0
      }
    };

    if (Array.isArray(scheduleRaw) && scheduleRaw.length) debug.schedule_sample = scheduleRaw[0];
    if (Array.isArray(entriesRaw) && entriesRaw.length) debug.entries_sample = entriesRaw[0];

    if (!Array.isArray(scheduleRaw) || !Array.isArray(entriesRaw)) {
      debug.ok = false;
      debug.error = "schedule or entries missing/not arrays";
      ssSet("trainer_debug", debug);
      console.log("[TRAINER] derive abort", debug);
      ssSet("trainer_rows", []);
      return [];
    }

    // Normalize
    const schedule = scheduleRaw.map(normalizeScheduleItem);
    const entries = entriesRaw.map(normalizeEntryItem);

    debug.normalized_schedule_sample = schedule[0] || null;
    debug.normalized_entry_sample = entries[0] || null;

    // Count missing key fields to catch “Group 0” / wrong ring values
    for (const r of schedule) {
      if (r.ring == null || r.ring === "") debug.missing_fields_counts.ring++;
      if (r.class_group_id == null || r.class_group_id === "") debug.missing_fields_counts.class_group_id++;
      if (r.class_id == null || r.class_id === "") debug.missing_fields_counts.class_id++;
      if (r.class_number == null || r.class_number === "") debug.missing_fields_counts.class_number++;
      if (!r.class_name) debug.missing_fields_counts.class_name++;
    }

    // Index entries by class_id
    const entriesByClass = new Map();
    for (const e of entries) {
      const cid = e.class_id;
      if (cid == null || cid === "") continue;
      if (!entriesByClass.has(cid)) entriesByClass.set(cid, []);
      entriesByClass.get(cid).push(e);
    }
    // sort entries inside a class by order_of_go when present
    for (const [cid, list] of entriesByClass.entries()) {
      list.sort((a, b) => {
        const ao = toInt(a.order_of_go) ?? 0;
        const bo = toInt(b.order_of_go) ?? 0;
        // stable-ish: order_of_go then horse name
        if (ao !== bo) return ao - bo;
        return normStr(a.horse).localeCompare(normStr(b.horse));
      });
    }

    // Build: ring -> group -> classes
    const ringMap = new Map();

    for (const s of schedule) {
      const ringKey = s.ring ?? "—";
      if (!ringMap.has(ringKey)) ringMap.set(ringKey, new Map());

      const groupKey = s.class_group_id ?? 0; // if this becomes 0, debug will show missing count
      const groupMap = ringMap.get(ringKey);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          class_group_id: groupKey,
          group_sequence: s.group_sequence ?? null,
          classes: [],
          horses: [] // populated after class fold-in
        });
      }

      const g = groupMap.get(groupKey);

      const myEntries = entriesByClass.get(s.class_id) || [];

      // prefer schedule time; else earliest entry estimated_go_time
      let classMinutes = s.sched_minutes;
      let classTime = s.sched_time || "";
      if (classMinutes == null && myEntries.length) {
        let m = null;
        for (const e of myEntries) m = minMinutes(m, e.est_minutes);
        if (m != null) {
          classMinutes = m;
          const hh = String(Math.floor(m / 60)).padStart(2, "0");
          const mm = String(m % 60).padStart(2, "0");
          classTime = `${hh}:${mm}`;
        }
      }

      g.classes.push({
        class_id: s.class_id,
        class_number: s.class_number,
        class_name: s.class_name,
        time: classTime || "—",
        sort_minutes: classMinutes,
        group_sequence: s.group_sequence ?? null,
        my_entries: myEntries.map(e => ({
          horse: e.horse,
          rider_name: e.rider_name,
          estimated_go_time: e.estimated_go_time || "",
          order_of_go: e.order_of_go || 0
        }))
      });
    }

    // Finalize: compute horses + sort classes/groups/rings
    const ringsOut = [];

    for (const [ringKey, groupMap] of ringMap.entries()) {
      const groupsOut = [];

      for (const [groupKey, g] of groupMap.entries()) {
        // sort classes by (time minutes) then (group_sequence) then (class_number)
        g.classes.sort((a, b) => {
          const am = a.sort_minutes;
          const bm = b.sort_minutes;
          if (am != null && bm != null && am !== bm) return am - bm;
          if (am == null && bm != null) return 1;
          if (am != null && bm == null) return -1;

          const ag = toInt(a.group_sequence) ?? 999999;
          const bg = toInt(b.group_sequence) ?? 999999;
          if (ag !== bg) return ag - bg;

          const an = toInt(a.class_number) ?? 999999;
          const bn = toInt(b.class_number) ?? 999999;
          if (an !== bn) return an - bn;

          return normStr(a.class_name).localeCompare(normStr(b.class_name));
        });

        // horses in this group (unique, from my entries only)
        const horseSet = new Set();
        for (const c of g.classes) {
          for (const e of c.my_entries) {
            const h = normStr(e.horse);
            if (h) horseSet.add(h);
          }
        }
        g.horses = Array.from(horseSet);

        // group sort key: earliest class time
        let gMin = null;
        for (const c of g.classes) gMin = minMinutes(gMin, c.sort_minutes);
        g.sort_minutes = gMin;

        groupsOut.push(g);
      }

      // sort groups by earliest class time, then group_sequence, then id
      groupsOut.sort((a, b) => {
        const am = a.sort_minutes;
        const bm = b.sort_minutes;
        if (am != null && bm != null && am !== bm) return am - bm;
        if (am == null && bm != null) return 1;
        if (am != null && bm == null) return -1;

        const ag = toInt(a.group_sequence) ?? 999999;
        const bg = toInt(b.group_sequence) ?? 999999;
        if (ag !== bg) return ag - bg;

        const ai = toInt(a.class_group_id) ?? 999999;
        const bi = toInt(b.class_group_id) ?? 999999;
        return ai - bi;
      });

      ringsOut.push({
        ring: ringKey,
        groups: groupsOut
      });
    }

    // sort rings numerically when possible
    ringsOut.sort((a, b) => {
      const ar = toInt(a.ring);
      const br = toInt(b.ring);
      if (ar != null && br != null && ar !== br) return ar - br;
      return normStr(a.ring).localeCompare(normStr(b.ring));
    });

    // persist + log
    ssSet("trainer_rows", ringsOut);
    ssSet("trainer_debug", debug);

    console.log("[TRAINER] derive ok", {
      schedule_len: debug.schedule_len,
      entries_len: debug.entries_len,
      rings: ringsOut.length,
      missing: debug.missing_fields_counts,
      sample_ring: ringsOut[0]?.ring,
      sample_group: ringsOut[0]?.groups?.[0]?.class_group_id
    });

    return ringsOut;
  }

  // ----------------------------
  // Public API expected by app.js
  // ----------------------------
  window.CRT_trainerDerive = function CRT_trainerDerive() {
    return deriveTrainerRows();
  };

  // Optional helper for quick inspection (no renderer changes needed)
  window.CRT_trainerDebug = function CRT_trainerDebug() {
    return ssGet("trainer_debug");
  };
})();
