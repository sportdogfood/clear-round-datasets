/* trainer_derive.js
   Version: v34
   Timestamp: 2025-12-14T23:20 ET
   Purpose: Build Ring → Class Group → Class → Entries (barn) model from schedule + entries,
            write trainer_rows + trainer_log to sessionStorage, and RETURN trainer_rows (not null).
*/
(function attachTrainerDerive(global) {
  "use strict";

  function nowISO() { return new Date().toISOString(); }

  function safeParseJSON(x, fallback) {
    if (x == null) return fallback;
    if (typeof x === "object") return x; // already parsed
    try { return JSON.parse(x); } catch (_) { return fallback; }
  }

  function toInt(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function hhmmssToMinutes(hhmmss) {
    if (!hhmmss || typeof hhmmss !== "string") return null;
    // accepts "HH:MM:SS" (also tolerates "H:MM:SS")
    var parts = hhmmss.split(":");
    if (parts.length < 2) return null;
    var h = toInt(parts[0]) || 0;
    var m = toInt(parts[1]) || 0;
    return h * 60 + m;
  }

  function uniqStrings(arr) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (!s || typeof s !== "string") continue;
      var key = s.trim();
      if (!key) continue;
      if (!seen[key]) { seen[key] = 1; out.push(key); }
    }
    return out;
  }

  function bySortKeys(aKeys, bKeys) {
    for (var i = 0; i < aKeys.length; i++) {
      var a = aKeys[i], b = bKeys[i];
      // nulls last
      var aNull = (a === null || a === undefined), bNull = (b === null || b === undefined);
      if (aNull && bNull) continue;
      if (aNull) return 1;
      if (bNull) return -1;

      if (a < b) return -1;
      if (a > b) return 1;
    }
    return 0;
  }

  function normalizeSchedule(scheduleInput) {
    var schedule = scheduleInput;

    // allow pulling from sessionStorage if omitted
    if (schedule == null) schedule = safeParseJSON(sessionStorage.getItem("schedule"), []);
    schedule = safeParseJSON(schedule, []);

    // Two possible shapes:
    // A) rings array: [{ring_number, ring_name, ring_id, classes:[...]}]
    // B) flat classes array: [{ring_number|ring, class_group_id, class_id, ...}]
    var flat = [];
    if (Array.isArray(schedule) && schedule.length && schedule[0] && Array.isArray(schedule[0].classes)) {
      for (var r = 0; r < schedule.length; r++) {
        var ringObj = schedule[r] || {};
        var ringNum = toInt(ringObj.ring_number) ?? toInt(ringObj.ring) ?? null;
        var ringName = ringObj.ring_name || "";
        var ringId = toInt(ringObj.ring_id) ?? null;

        var classes = Array.isArray(ringObj.classes) ? ringObj.classes : [];
        for (var c = 0; c < classes.length; c++) {
          var cls = classes[c] || {};
          flat.push({
            _raw: cls,
            ring: ringNum,
            ring_name: ringName,
            ring_id: ringId,

            class_group_id: toInt(cls.class_group_id),
            class_group_sequence: toInt(cls.class_group_sequence),
            group_name: cls.group_name || "",

            class_id: toInt(cls.class_id),
            class_number: toInt(cls.class_number),
            class_name: cls.class_name || "",

            sched_time: cls.estimated_start_time || cls.start_time_default || "",
            sched_minutes: hhmmssToMinutes(cls.estimated_start_time || cls.start_time_default || "")
          });
        }
      }
    } else if (Array.isArray(schedule)) {
      for (var i = 0; i < schedule.length; i++) {
        var row = schedule[i] || {};
        flat.push({
          _raw: row,
          ring: toInt(row.ring_number) ?? toInt(row.ring) ?? null,
          ring_name: row.ring_name || "",
          ring_id: toInt(row.ring_id) ?? null,

          class_group_id: toInt(row.class_group_id),
          class_group_sequence: toInt(row.class_group_sequence) ?? toInt(row.class_group_sequence),
          group_name: row.group_name || "",

          class_id: toInt(row.class_id),
          class_number: toInt(row.class_number),
          class_name: row.class_name || "",

          sched_time: row.estimated_start_time || row.start_time_default || row.sched_time || "",
          sched_minutes: hhmmssToMinutes(row.estimated_start_time || row.start_time_default || row.sched_time || "")
        });
      }
    }

    // missing field counts (for your log panel / debugging)
    var missing = { ring: 0, class_group_id: 0, class_id: 0, class_number: 0, class_name: 0, sched_time: 0 };
    for (var j = 0; j < flat.length; j++) {
      var x = flat[j];
      if (x.ring === null) missing.ring++;
      if (x.class_group_id === null) missing.class_group_id++;
      if (x.class_id === null) missing.class_id++;
      if (x.class_number === null) missing.class_number++;
      if (!x.class_name) missing.class_name++;
      if (!x.sched_time) missing.sched_time++;
    }

    return { flat: flat, missing: missing };
  }

  function normalizeEntries(entriesInput) {
    var entries = entriesInput;

    // allow pulling from sessionStorage if omitted
    if (entries == null) entries = safeParseJSON(sessionStorage.getItem("entries"), []);
    entries = safeParseJSON(entries, []);

    var out = [];
    var bad = 0;

    if (!Array.isArray(entries)) return { list: [], bad: 0 };

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i] || {};
      var ec = e.entry_class || {};
      var cd = e.class_data || {};

      var classId = toInt(ec.class_id) ?? toInt(cd.class_id) ?? null;
      var ring = toInt(cd.ring) ?? null;
      var classGroupId = toInt(cd.class_group_id) ?? null;

      var horse = e.horse || "";
      var rider = ec.rider_name || "";
      var estGo = ec.estimated_go_time || "";
      var og = toInt(ec.order_of_go) ?? toInt(cd.order_of_go) ?? toInt(e.order_of_go) ?? 0;

      if (classId === null) { bad++; continue; }

      out.push({
        _raw: e,
        entry_id: toInt(e.entry_id),
        class_id: classId,
        class_group_id: classGroupId,
        ring: ring,
        horse: horse,
        rider_name: rider,
        estimated_go_time: estGo,
        est_minutes: hhmmssToMinutes(estGo) ?? 0,
        order_of_go: og
      });
    }

    return { list: out, bad: bad };
  }

  function indexEntries(entriesList) {
    var byClassId = Object.create(null);
    var byRingGroup = Object.create(null);

    for (var i = 0; i < entriesList.length; i++) {
      var e = entriesList[i];
      var cid = e.class_id;
      if (!byClassId[cid]) byClassId[cid] = [];
      byClassId[cid].push(e);

      var rgKey = (e.ring ?? "x") + "|" + (e.class_group_id ?? "x");
      if (!byRingGroup[rgKey]) byRingGroup[rgKey] = [];
      byRingGroup[rgKey].push(e);
    }

    return {
      byClassId: byClassId,
      byRingGroup: byRingGroup,
      byClassId_keys: Object.keys(byClassId).length,
      byRingGroup_keys: Object.keys(byRingGroup).length
    };
  }

  function buildModel(scheduleFlat, entriesIndex) {
    // Build Ring → Class Group → Class (+ entries)
    var ringsMap = Object.create(null);

    for (var i = 0; i < scheduleFlat.length; i++) {
      var s = scheduleFlat[i];

      var ringKey = String(s.ring ?? "x");
      if (!ringsMap[ringKey]) {
        ringsMap[ringKey] = {
          ring: s.ring,
          ring_name: s.ring_name || "",
          ring_id: s.ring_id ?? null,
          groupsMap: Object.create(null),
          groups: []
        };
      }

      var ringObj = ringsMap[ringKey];

      var groupId = s.class_group_id; // REQUIRED for locked structure
      var groupKey = String(groupId ?? "x");

      if (!ringObj.groupsMap[groupKey]) {
        ringObj.groupsMap[groupKey] = {
          class_group_id: groupId,
          class_group_sequence: s.class_group_sequence ?? null,
          group_name: s.group_name || "",
          classes: []
        };
      }

      var groupObj = ringObj.groupsMap[groupKey];

      var classId = s.class_id;
      var classEntries = (classId != null && entriesIndex.byClassId[classId]) ? entriesIndex.byClassId[classId] : [];

      groupObj.classes.push({
        class_id: classId,
        class_number: s.class_number,
        class_name: s.class_name || "",
        sched_time: s.sched_time || "",
        sched_minutes: s.sched_minutes,
        // folded barn entries (can be empty)
        entries: classEntries
      });
    }

    // finalize rings/groups arrays + sorting + headers for default/detail
    var ringsOut = [];
    var ringKeys = Object.keys(ringsMap);

    for (var rk = 0; rk < ringKeys.length; rk++) {
      var rObj = ringsMap[ringKeys[rk]];
      var groupKeys = Object.keys(rObj.groupsMap);

      // groups array
      var groups = [];
      for (var gk = 0; gk < groupKeys.length; gk++) {
        var gObj = rObj.groupsMap[groupKeys[gk]];

        // sort classes inside group
        gObj.classes.sort(function (a, b) {
          return bySortKeys(
            [a.sched_minutes, a.class_number, a.class_id],
            [b.sched_minutes, b.class_number, b.class_id]
          );
        });

        // horses present in this class group (across all classes)
        var horses = [];
        for (var ci = 0; ci < gObj.classes.length; ci++) {
          var cls = gObj.classes[ci];
          var ents = cls.entries || [];
          for (var ei = 0; ei < ents.length; ei++) horses.push(ents[ei].horse);
        }
        var uniqHorses = uniqStrings(horses);

        // DEFAULT header label: "FORT KNOX. HALO"
        var header_default = uniqHorses.join(". ");

        // DETAIL: split into horse-specific “sub-groups” when more than 1 horse
        var horse_groups = [];
        if (uniqHorses.length > 1) {
          for (var hi = 0; hi < uniqHorses.length; hi++) {
            var horseName = uniqHorses[hi];
            var horseClasses = [];
            for (var cj = 0; cj < gObj.classes.length; cj++) {
              var cls2 = gObj.classes[cj];
              var hasHorse = false;
              for (var ek = 0; ek < (cls2.entries || []).length; ek++) {
                if ((cls2.entries[ek].horse || "").trim() === horseName) { hasHorse = true; break; }
              }
              if (hasHorse) horseClasses.push(cls2);
            }
            horse_groups.push({
              horse: horseName,
              classes: horseClasses
            });
          }
        }

        groups.push({
          class_group_id: gObj.class_group_id,
          class_group_sequence: gObj.class_group_sequence,
          group_name: gObj.group_name,
          header_default: header_default,
          horses: uniqHorses,
          classes: gObj.classes,
          horse_groups: horse_groups
        });
      }

      // sort groups in ring
      groups.sort(function (a, b) {
        return bySortKeys(
          [a.class_group_sequence, a.class_group_id, a.group_name],
          [b.class_group_sequence, b.class_group_id, b.group_name]
        );
      });

      ringsOut.push({
        ring: rObj.ring,
        ring_name: rObj.ring_name,
        ring_id: rObj.ring_id,
        groups: groups
      });
    }

    // sort rings by ring number
    ringsOut.sort(function (a, b) {
      return bySortKeys([a.ring], [b.ring]);
    });

    return ringsOut;
  }

  function writeSession(keys, trainerRows, trainerLog) {
    sessionStorage.setItem(keys.trainerRows, JSON.stringify(trainerRows));
    sessionStorage.setItem(keys.trainerLog, JSON.stringify(trainerLog));
  }

  function trainerDerive(scheduleArg, entriesArg, optsArg) {
    // supports signature:
    // (schedule, entries, opts) OR ({schedule, entries, opts})
    var schedule = scheduleArg;
    var entries = entriesArg;
    var opts = optsArg || {};

    if (scheduleArg && typeof scheduleArg === "object" && !Array.isArray(scheduleArg) && scheduleArg.schedule) {
      schedule = scheduleArg.schedule;
      entries = scheduleArg.entries;
      opts = scheduleArg.opts || {};
    }

    var keys = {
      schedule: "schedule",
      entries: "entries",
      trainerRows: "trainer_rows",
      trainerLog: "trainer_log"
    };

    var steps = [];
    var warnings = [];
    var errors = [];

    // normalize
    var schedNorm = normalizeSchedule(schedule);
    var entriesNorm = normalizeEntries(entries);

    steps.push({
      at: nowISO(),
      name: "inputs.normalized",
      schedule_type: Array.isArray(schedNorm.flat) ? "array" : typeof schedNorm.flat,
      entries_type: Array.isArray(entriesNorm.list) ? "array" : typeof entriesNorm.list,
      schedule_len: schedNorm.flat.length,
      entries_len: entriesNorm.list.length,
      sources: {
        schedule: "sessionStorage.schedule",
        entries: "sessionStorage.entries"
      }
    });

    steps.push({
      at: nowISO(),
      name: "schedule.missing_fields_counts",
      missing_fields_counts: schedNorm.missing
    });

    // index entries
    var idx = indexEntries(entriesNorm.list);

    steps.push({
      at: nowISO(),
      name: "entries.indexed",
      byClassId_keys: idx.byClassId_keys,
      byRingGroup_keys: idx.byRingGroup_keys,
      bad_entries: entriesNorm.bad
    });

    // build model
    var ringsOut = buildModel(schedNorm.flat, idx);

    // orphan entries: entries whose class_id never appears in schedule
    var scheduleClassSet = Object.create(null);
    for (var i = 0; i < schedNorm.flat.length; i++) {
      var cid = schedNorm.flat[i].class_id;
      if (cid != null) scheduleClassSet[cid] = 1;
    }
    var orphan = 0;
    for (var j = 0; j < entriesNorm.list.length; j++) {
      var ecid = entriesNorm.list[j].class_id;
      if (!scheduleClassSet[ecid]) orphan++;
    }

    // counts
    var scheduleRingsCount = (function countDistinctRings() {
      var seen = Object.create(null), n = 0;
      for (var k = 0; k < schedNorm.flat.length; k++) {
        var r = schedNorm.flat[k].ring;
        var key = String(r ?? "x");
        if (!seen[key]) { seen[key] = 1; n++; }
      }
      return n;
    })();

    steps.push({
      at: nowISO(),
      name: "model.built",
      counts: {
        schedule_rings: scheduleRingsCount,
        schedule_classes: schedNorm.flat.length,
        entries_total: entriesNorm.list.length,
        rings_out: ringsOut.length,
        orphan_entries: orphan
      }
    });

    var trainerRows = ringsOut;

    var trainerLog = {
      at: nowISO(),
      steps: steps,
      counts: {
        schedule_rings: scheduleRingsCount,
        schedule_classes: schedNorm.flat.length,
        entries_total: entriesNorm.list.length,
        rings_out: ringsOut.length,
        orphan_entries: orphan
      },
      warnings: warnings,
      errors: errors
    };

    // write session
    writeSession(keys, trainerRows, trainerLog);

    steps.push({
      at: nowISO(),
      name: "sessionStorage.writes",
      trainer_rows: true,
      trainer_log: true,
      keys: {
        schedule: keys.schedule,
        entries: keys.entries,
        trainerRows: keys.trainerRows,
        trainerLog: keys.trainerLog
      }
    });

    // re-write with updated steps including write step
    trainerLog.steps = steps;
    sessionStorage.setItem(keys.trainerLog, JSON.stringify(trainerLog));

    // IMPORTANT: return the rows (so app.js doesn’t log “done null”)
    return trainerRows;
  }

  // attach multiple names to reduce “wrong function name” failures
  global.trainerDerive = trainerDerive;
  global.trainer_derive = trainerDerive;
  global.trainerDerive_v34 = trainerDerive;

})(typeof window !== "undefined" ? window : this);
