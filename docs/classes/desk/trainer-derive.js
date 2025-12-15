// trainer_derive.js
// - Derives Trainer report model (Ring → Class Group → Class → Your Entries)
// - Inputs (sessionStorage): schedule, entries
// - Output (sessionStorage): trainer_rows (array of rings)
// - Persistent log (sessionStorage): desk_log (last ~250 events)
//
// Version: v2025-12-14-derive-01
// Timestamp: 2025-12-14T00:00:00Z

(() => {
  "use strict";

  const LOG_KEY = "desk_log";
  const OUT_KEY = "trainer_rows";

  // ----------------------------
  // Tiny persistent logger
  // ----------------------------
  function readLog() {
    try {
      const raw = sessionStorage.getItem(LOG_KEY);
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function writeLog(items) {
    try {
      sessionStorage.setItem(LOG_KEY, JSON.stringify(items));
    } catch {}
  }

  function log(level, msg, data) {
    const items = readLog();
    items.push({
      t: new Date().toISOString(),
      level,
      msg,
      data: data == null ? null : data
    });
    // cap log size
    while (items.length > 250) items.shift();
    writeLog(items);
  }

  // optional helpers (for you in DevTools)
  window.CRT_logRead = () => readLog();
  window.CRT_logClear = () => writeLog([]);

  // ----------------------------
  // Storage helpers
  // ----------------------------
  function ssGet(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return sessionStorage.getItem(key);
    }
  }

  // ----------------------------
  // Core derive
  // ----------------------------
  function normalizeTime(t) {
    if (!t || typeof t !== "string") return "";
    // keep as-is; just normalize "00:00:00" to ""
    return t === "00:00:00" ? "" : t;
  }

  function safeNum(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function makeEntryLine(e) {
    const horse = e?.horse ? String(e.horse) : "";
    const rider =
      e?.entry_class?.rider_name ? String(e.entry_class.rider_name) :
      e?.class_data?.rider_name ? String(e.class_data.rider_name) :
      "";

    const orderOfGo =
      safeNum(e?.entry_class?.order_of_go, 0) ||
      safeNum(e?.class_data?.order_of_go, 0) ||
      safeNum(e?.order_of_go, 0) ||
      0;

    const goTime = normalizeTime(e?.entry_class?.estimated_go_time);

    return {
      entry_id: e?.entry_id ?? null,
      horse,
      rider_name: rider,
      order_of_go: orderOfGo || 0,
      estimated_go_time: goTime
    };
  }

  function derive() {
    // clear only our output key; keep log history
    try { sessionStorage.removeItem(OUT_KEY); } catch {}

    const schedule = ssGet("schedule");
    const entries = ssGet("entries");

    log("info", "trainer_derive:start", {
      has_schedule: Array.isArray(schedule),
      has_entries: Array.isArray(entries),
      schedule_len: Array.isArray(schedule) ? schedule.length : null,
      entries_len: Array.isArray(entries) ? entries.length : null
    });

    if (!Array.isArray(schedule) || !schedule.length) {
      log("error", "trainer_derive:no_schedule", { key: "schedule" });
      try { sessionStorage.setItem(OUT_KEY, JSON.stringify([])); } catch {}
      return [];
    }

    // Build index from schedule by class_id -> location
    const classIndex = new Map(); // class_id -> { ring_number, ring_name, class_group_id, class_group_sequence }
    let scheduleClassCount = 0;

    for (const ring of schedule) {
      const ringNum = safeNum(ring?.ring_number, null);
      const ringName = ring?.ring_name ? String(ring.ring_name) : "";
      const classes = Array.isArray(ring?.classes) ? ring.classes : [];

      for (const c of classes) {
        const cid = safeNum(c?.class_id, null);
        if (!cid) continue;

        scheduleClassCount++;

        classIndex.set(cid, {
          ring_number: ringNum,
          ring_name: ringName,
          class_group_id: safeNum(c?.class_group_id, null),
          class_group_sequence: safeNum(c?.class_group_sequence, null)
        });
      }
    }

    // Prepare ring-first structure from schedule (authoritative order)
    const ringsOut = [];
    const ringMap = new Map(); // ring_number -> ringObj

    function getRing(ring_number, ring_name) {
      if (ringMap.has(ring_number)) return ringMap.get(ring_number);

      const ro = {
        ring_number,
        ring_name: ring_name || "",
        groups: [] // array of group objects
      };
      ringMap.set(ring_number, ro);
      ringsOut.push(ro);
      return ro;
    }

    function getOrCreateGroup(ringObj, groupKey, groupTemplate) {
      // groupKey is string unique per ring
      let g = ringObj.groups.find(x => x._k === groupKey);
      if (g) return g;

      g = {
        _k: groupKey,
        class_group_id: groupTemplate.class_group_id,
        class_group_sequence: groupTemplate.class_group_sequence,
        group_name: groupTemplate.group_name || "",
        class_list: groupTemplate.class_list || "",
        classes: []
      };
      ringObj.groups.push(g);
      return g;
    }

    function getOrCreateClass(groupObj, classKey, classTemplate) {
      let cl = groupObj.classes.find(x => x._k === classKey);
      if (cl) return cl;

      cl = {
        _k: classKey,
        class_id: classTemplate.class_id,
        class_number: classTemplate.class_number,
        class_name: classTemplate.class_name || "",
        estimated_start_time: classTemplate.estimated_start_time || "",
        warmup_class: classTemplate.warmup_class ? 1 : 0,
        // entries folded in below
        entries: []
      };
      groupObj.classes.push(cl);
      return cl;
    }

    // First: build all schedule groups/classes (full day, by ring)
    for (const ring of schedule) {
      const ringNum = safeNum(ring?.ring_number, null);
      const ringName = ring?.ring_name ? String(ring.ring_name) : "";
      if (!ringNum) continue;

      const ringObj = getRing(ringNum, ringName);
      const classes = Array.isArray(ring?.classes) ? ring.classes : [];

      for (const c of classes) {
        const classId = safeNum(c?.class_id, null);
        if (!classId) continue;

        const groupId = safeNum(c?.class_group_id, null);
        const groupSeq = safeNum(c?.class_group_sequence, null);

        const groupKey = `${ringNum}:${groupId || "nogroup"}:${groupSeq || "noseq"}`;

        const groupObj = getOrCreateGroup(ringObj, groupKey, {
          class_group_id: groupId,
          class_group_sequence: groupSeq,
          group_name: c?.group_name ? String(c.group_name) : "",
          class_list: c?.class_list ? String(c.class_list) : ""
        });

        const classKey = `${classId}`;
        getOrCreateClass(groupObj, classKey, {
          class_id: classId,
          class_number: safeNum(c?.class_number, null),
          class_name: c?.class_name ? String(c.class_name) : "",
          estimated_start_time: normalizeTime(c?.estimated_start_time) || normalizeTime(c?.start_time_default),
          warmup_class: safeNum(c?.warmup_class, 0) === 1
        });
      }
    }

    // Sort rings/groups/classes by schedule sequence (do NOT invent extra ordering)
    ringsOut.sort((a, b) => (a.ring_number || 0) - (b.ring_number || 0));
    for (const r of ringsOut) {
      r.groups.sort((a, b) => (a.class_group_sequence || 0) - (b.class_group_sequence || 0));
      for (const g of r.groups) {
        // Primary: start time if present, else class_number
        g.classes.sort((a, b) => {
          const ta = a.estimated_start_time || "";
          const tb = b.estimated_start_time || "";
          if (ta && tb && ta !== tb) return ta.localeCompare(tb);
          const na = a.class_number || 0;
          const nb = b.class_number || 0;
          return na - nb;
        });
      }
    }

    // Second: fold barn entries into schedule by class_id
    let matched = 0;
    let unmatched = 0;

    if (Array.isArray(entries) && entries.length) {
      for (const e of entries) {
        const classId =
          safeNum(e?.entry_class?.class_id, null) ||
          safeNum(e?.class_data?.class_id, null);

        if (!classId) {
          unmatched++;
          continue;
        }

        const loc = classIndex.get(classId);

        // If class is missing from schedule, do not guess. Log it.
        if (!loc || !loc.ring_number) {
          unmatched++;
          continue;
        }

        const ringObj = ringMap.get(loc.ring_number);
        if (!ringObj) {
          unmatched++;
          continue;
        }

        // Find the class inside the ring structure
        let placed = false;
        for (const g of ringObj.groups) {
          const cl = g.classes.find(x => x.class_id === classId);
          if (!cl) continue;

          cl.entries.push(makeEntryLine(e));
          matched++;
          placed = true;
          break;
        }

        if (!placed) unmatched++;
      }
    }

    // Remove internal keys
    for (const r of ringsOut) {
      for (const g of r.groups) {
        delete g._k;
        for (const c of g.classes) delete c._k;
      }
    }

    // Summary log
    log("info", "trainer_derive:done", {
      schedule_rings: ringsOut.length,
      schedule_classes_indexed: scheduleClassCount,
      barn_entries_in: Array.isArray(entries) ? entries.length : 0,
      entries_matched_to_schedule: matched,
      entries_unmatched: unmatched
    });

    // Persist output
    try {
      sessionStorage.setItem(OUT_KEY, JSON.stringify(ringsOut));
    } catch {
      log("error", "trainer_derive:write_failed", { key: OUT_KEY });
    }

    return ringsOut;
  }

  // Expose required function name (used by your app.js)
  window.CRT_trainerDerive = derive;
})();
