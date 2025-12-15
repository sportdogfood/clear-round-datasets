/* ============================================================
   File: trainer_derive.js
   Version: v32.1 (fix schedule normalization + logs)
   Purpose: Build Ring → Class Group → Class → Entries model
            from ONE 10-minute refreshed schedule payload
            + entries payload in sessionStorage.
   Storage:
     - reads:  sessionStorage.schedule, sessionStorage.entries
     - writes: sessionStorage.trainer_rows, sessionStorage.trainer_log
   ============================================================ */

(function () {
  "use strict";

  var KEYS = {
    schedule: "schedule",
    entries: "entries",
    trainerRows: "trainer_rows",
    trainerLog: "trainer_log"
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function safeJSONParse(x) {
    if (x == null) return null;
    if (typeof x === "string") {
      try { return JSON.parse(x); } catch (e) { return null; }
    }
    return x; // already object/array
  }

  function ssGet(key) {
    return safeJSONParse(sessionStorage.getItem(key));
  }

  function ssSet(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function capArray(arr, max) {
    if (!Array.isArray(arr)) return [];
    if (arr.length <= max) return arr;
    return arr.slice(arr.length - max);
  }

  function pushLog(step, state) {
    var log = ssGet(KEYS.trainerLog);
    if (!Array.isArray(log)) log = [];
    log.push(Object.assign({ at: nowISO() }, step));
    ssSet(KEYS.trainerLog, capArray(log, 250));
    if (state && state.steps) state.steps.push(Object.assign({ at: nowISO() }, step));
  }

  function toMinutes(hhmmss) {
    if (!hhmmss || typeof hhmmss !== "string") return null;
    // Accept "HH:MM:SS" or "HH:MM"
    var parts = hhmmss.split(":");
    if (parts.length < 2) return null;
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (!isFinite(h) || !isFinite(m)) return null;
    return h * 60 + m;
  }

  function firstNonEmpty(a, b, c) {
    if (a != null && a !== "") return a;
    if (b != null && b !== "") return b;
    if (c != null && c !== "") return c;
    return "";
  }

  // ---------- NORMALIZATION (FIX) ----------

  // Accept either:
  // A) schedule = [ { ring_number, ring_name, ring_id, classes:[...] }, ... ]  (your current payload)
  // B) schedule = [ { class_id, class_group_id, ... }, ... ]                  (flat already)
  function normalizeSchedule(scheduleRaw) {
    var out = [];

    if (!Array.isArray(scheduleRaw)) return out;

    // Detect ring-list shape if first item has "classes" array
    var looksLikeRingList = scheduleRaw.length > 0 && scheduleRaw[0] && Array.isArray(scheduleRaw[0].classes);

    if (looksLikeRingList) {
      for (var i = 0; i < scheduleRaw.length; i++) {
        var ringObj = scheduleRaw[i] || {};
        var ringNum = ringObj.ring_number != null ? ringObj.ring_number : ringObj.ring;
        var ringName = ringObj.ring_name || "";
        var ringId = ringObj.ring_id != null ? ringObj.ring_id : null;

        var classes = Array.isArray(ringObj.classes) ? ringObj.classes : [];
        for (var j = 0; j < classes.length; j++) {
          var c = classes[j] || {};
          var schedTime = firstNonEmpty(c.estimated_start_time, c.start_time_default, "");
          out.push({
            _raw: c,

            ring: ringNum,
            ring_name: ringName,
            ring_id: ringId,

            class_group_id: c.class_group_id != null ? c.class_group_id : null,
            class_group_sequence: c.class_group_sequence != null ? c.class_group_sequence : null,

            class_id: c.class_id != null ? c.class_id : null,
            class_number: c.class_number != null ? c.class_number : null,
            class_name: c.class_name || "",

            group_name: c.group_name || "",
            class_list: c.class_list || "",

            sched_time: schedTime,
            sched_minutes: toMinutes(schedTime),

            cancelled: c.cancelled === 1,
            warmup_class: c.warmup_class === 1
          });
        }
      }
      return out;
    }

    // Flat schedule list
    for (var k = 0; k < scheduleRaw.length; k++) {
      var s = scheduleRaw[k] || {};
      var t = firstNonEmpty(s.estimated_start_time, s.start_time_default, s.sched_time);
      out.push({
        _raw: s,
        ring: s.ring_number != null ? s.ring_number : s.ring,
        ring_name: s.ring_name || "",
        ring_id: s.ring_id != null ? s.ring_id : null,

        class_group_id: s.class_group_id != null ? s.class_group_id : null,
        class_group_sequence: s.class_group_sequence != null ? s.class_group_sequence : null,

        class_id: s.class_id != null ? s.class_id : null,
        class_number: s.class_number != null ? s.class_number : null,
        class_name: s.class_name || "",

        group_name: s.group_name || "",
        class_list: s.class_list || "",

        sched_time: t,
        sched_minutes: toMinutes(t),

        cancelled: s.cancelled === 1,
        warmup_class: s.warmup_class === 1
      });
    }
    return out;
  }

  function normalizeEntries(entriesRaw) {
    var out = [];
    if (!Array.isArray(entriesRaw)) return out;

    for (var i = 0; i < entriesRaw.length; i++) {
      var e = entriesRaw[i] || {};
      var ec = e.entry_class || {};
      var cd = e.class_data || {};

      var classId = (ec.class_id != null ? ec.class_id : (cd.class_id != null ? cd.class_id : null));
      var estGo = ec.estimated_go_time || "";
      var og = (ec.order_of_go != null ? ec.order_of_go : (cd.order_of_go != null ? cd.order_of_go : null));

      out.push({
        _raw: e,

        entry_id: e.entry_id != null ? e.entry_id : null,
        horse: e.horse || "",
        rider_name: ec.rider_name || "",
        rider_id: ec.rider_id != null ? ec.rider_id : null,

        class_id: classId,
        class_group_id: cd.class_group_id != null ? cd.class_group_id : null,
        ring: cd.ring != null ? cd.ring : null,
        group_sequence: cd.group_sequence != null ? cd.group_sequence : null,

        estimated_go_time: estGo,
        est_minutes: toMinutes(estGo) || 0,
        order_of_go: og != null ? og : 0,

        is_morning: !!e.is_morning,
        has_conflict: !!e.has_conflict
      });
    }

    return out;
  }

  function countMissing(scheduleNorm) {
    var miss = { ring: 0, class_group_id: 0, class_id: 0, class_number: 0, class_name: 0, sched_time: 0 };
    for (var i = 0; i < scheduleNorm.length; i++) {
      var r = scheduleNorm[i];
      if (r.ring == null) miss.ring++;
      if (r.class_group_id == null) miss.class_group_id++;
      if (r.class_id == null) miss.class_id++;
      if (r.class_number == null) miss.class_number++;
      if (!r.class_name) miss.class_name++;
      if (!r.sched_time) miss.sched_time++;
    }
    return miss;
  }

  function uniqPush(map, key, val) {
    if (!val) return;
    if (!map[key]) map[key] = true;
  }

  function buildModel(scheduleNorm, entriesNorm) {
    var byClassId = Object.create(null);
    var allScheduleClassIds = Object.create(null);

    for (var i = 0; i < entriesNorm.length; i++) {
      var en = entriesNorm[i];
      if (en.class_id == null) continue;
      if (!byClassId[en.class_id]) byClassId[en.class_id] = [];
      byClassId[en.class_id].push(en);
    }

    // rings -> groups -> classes
    var ringsMap = Object.create(null);

    for (var j = 0; j < scheduleNorm.length; j++) {
      var sc = scheduleNorm[j];
      if (sc.class_id != null) allScheduleClassIds[sc.class_id] = true;

      var ringKey = String(sc.ring != null ? sc.ring : "null");
      if (!ringsMap[ringKey]) {
        ringsMap[ringKey] = {
          ring: sc.ring,
          ring_name: sc.ring_name || "",
          ring_id: sc.ring_id != null ? sc.ring_id : null,
          class_groups: Object.create(null),
          _group_order: []
        };
      }

      var ringObj = ringsMap[ringKey];

      var cgId = sc.class_group_id != null ? sc.class_group_id : "null";
      var cgKey = String(cgId);

      if (!ringObj.class_groups[cgKey]) {
        ringObj.class_groups[cgKey] = {
          class_group_id: sc.class_group_id,
          class_group_sequence: sc.class_group_sequence != null ? sc.class_group_sequence : null,
          group_name: sc.group_name || "",
          class_list: sc.class_list || "",
          horses_set: Object.create(null),
          classes: []
        };
        ringObj._group_order.push(cgKey);
      }

      var groupObj = ringObj.class_groups[cgKey];

      var clsEntries = sc.class_id != null && byClassId[sc.class_id] ? byClassId[sc.class_id] : [];
      for (var x = 0; x < clsEntries.length; x++) {
        uniqPush(groupObj.horses_set, clsEntries[x].horse, true);
      }

      groupObj.classes.push({
        class_id: sc.class_id,
        class_number: sc.class_number,
        class_name: sc.class_name,
        sched_time: sc.sched_time,
        sched_minutes: sc.sched_minutes,
        cancelled: sc.cancelled,
        warmup_class: sc.warmup_class,
        entries: clsEntries
      });
    }

    // Orphan entries (entries whose class_id not in schedule)
    var orphan = 0;
    for (var y = 0; y < entriesNorm.length; y++) {
      var e2 = entriesNorm[y];
      if (e2.class_id == null) continue;
      if (!allScheduleClassIds[e2.class_id]) orphan++;
    }

    // Convert maps to arrays with stable ordering
    var ringKeys = Object.keys(ringsMap).sort(function (a, b) {
      var na = parseInt(a, 10); var nb = parseInt(b, 10);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });

    var ringsOut = [];
    for (var rk = 0; rk < ringKeys.length; rk++) {
      var rObj = ringsMap[ringKeys[rk]];

      // group order: by class_group_sequence, fallback insertion
      var groupsArr = [];
      for (var gi = 0; gi < rObj._group_order.length; gi++) {
        var gKey = rObj._group_order[gi];
        var g = rObj.class_groups[gKey];

        // horses list
        var horses = Object.keys(g.horses_set);
        horses.sort();

        // class order inside group: by sched_minutes then class_number
        g.classes.sort(function (a, b) {
          var am = a.sched_minutes, bm = b.sched_minutes;
          if (am != null && bm != null && am !== bm) return am - bm;
          var an = a.class_number, bn = b.class_number;
          if (an != null && bn != null && an !== bn) return an - bn;
          return 0;
        });

        groupsArr.push({
          class_group_id: g.class_group_id,
          class_group_sequence: g.class_group_sequence,
          group_name: g.group_name,
          class_list: g.class_list,
          horses: horses,
          horses_joined: horses.join(", "),
          classes: g.classes
        });
      }

      groupsArr.sort(function (a, b) {
        var as = a.class_group_sequence, bs = b.class_group_sequence;
        if (as != null && bs != null && as !== bs) return as - bs;
        return 0;
      });

      ringsOut.push({
        ring: rObj.ring,
        ring_name: rObj.ring_name,
        ring_id: rObj.ring_id,
        class_groups: groupsArr
      });
    }

    return {
      generated_at: nowISO(),
      counts: {
        schedule_rings: ringKeys.length,
        schedule_classes: scheduleNorm.length,
        entries_total: entriesNorm.length,
        rings_out: ringsOut.length,
        orphan_entries: orphan
      },
      rings: ringsOut
    };
  }

  // ---------- MAIN ----------

  function deriveTrainer() {
    var state = { at: nowISO(), steps: [], warnings: [], errors: [] };

    var scheduleRaw = ssGet(KEYS.schedule);
    var entriesRaw = ssGet(KEYS.entries);

    var scheduleNorm = normalizeSchedule(scheduleRaw);
    var entriesNorm = normalizeEntries(entriesRaw);

    pushLog({
      name: "inputs.normalized",
      schedule_type: Array.isArray(scheduleNorm) ? "array" : typeof scheduleNorm,
      entries_type: Array.isArray(entriesNorm) ? "array" : typeof entriesNorm,
      schedule_len: scheduleNorm.length,
      entries_len: entriesNorm.length,
      sources: { schedule: "sessionStorage.schedule", entries: "sessionStorage.entries" }
    }, state);

    var missing = countMissing(scheduleNorm);
    pushLog({
      name: "schedule.missing_fields_counts",
      missing_fields_counts: missing
    }, state);

    if (scheduleNorm.length === 0) {
      state.errors.push("no_schedule_classes_after_normalize");
    }
    if (entriesNorm.length === 0) {
      state.warnings.push("no_entries_after_normalize");
    }

    // Index summary
    var byClassIdKeys = 0;
    var byRingGroupKeys = Object.create(null);
    var badEntries = 0;

    for (var i = 0; i < entriesNorm.length; i++) {
      var e = entriesNorm[i];
      if (e.class_id == null) badEntries++;
      if (e.ring != null && e.class_group_id != null) {
        byRingGroupKeys[String(e.ring) + ":" + String(e.class_group_id)] = true;
      }
    }
    // count distinct class_ids in entries
    var seenClass = Object.create(null);
    for (var j = 0; j < entriesNorm.length; j++) {
      var e2 = entriesNorm[j];
      if (e2.class_id != null) seenClass[String(e2.class_id)] = true;
    }
    byClassIdKeys = Object.keys(seenClass).length;

    pushLog({
      name: "entries.indexed",
      byClassId_keys: byClassIdKeys,
      byRingGroup_keys: Object.keys(byRingGroupKeys).length,
      bad_entries: badEntries
    }, state);

    var model = buildModel(scheduleNorm, entriesNorm);

    pushLog({
      name: "model.built",
      counts: model.counts
    }, state);

    var wroteRows = ssSet(KEYS.trainerRows, model);
    var wroteLog = ssSet(KEYS.trainerLog, capArray(ssGet(KEYS.trainerLog) || [], 250)); // keep

    pushLog({
      name: "sessionStorage.writes",
      trainer_rows: wroteRows,
      trainer_log: wroteLog,
      keys: {
        schedule: KEYS.schedule,
        entries: KEYS.entries,
        trainerRows: KEYS.trainerRows,
        trainerLog: KEYS.trainerLog
      }
    }, state);

    // Final summary object (also returned)
    return {
      at: nowISO(),
      ok: state.errors.length === 0,
      counts: model.counts,
      warnings: state.warnings,
      errors: state.errors
    };
  }

  // Expose
  window.CRT_trainerDerive = deriveTrainer;

})();
