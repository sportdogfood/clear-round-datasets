/* File: trainer_derive.js
   Purpose: Derive Trainer Ring-First report model from schedule + entries
   Exposes: window.CRT_trainerDerive(payload?)
   Writes:  sessionStorage.trainer_rows, sessionStorage.trainer_log
*/
(function () {
  "use strict";

  const SS_KEYS = {
    schedule: "schedule",
    entries: "entries",
    trainerRows: "trainer_rows",
    trainerLog: "trainer_log",
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function safeJsonParse(maybeJson, fallback) {
    try {
      if (maybeJson == null) return fallback;
      if (typeof maybeJson === "object") return maybeJson;
      if (typeof maybeJson !== "string") return fallback;
      const s = maybeJson.trim();
      if (!s) return fallback;
      return JSON.parse(s);
    } catch (_) {
      return fallback;
    }
  }

  function ssGetJson(key, fallback) {
    try {
      return safeJsonParse(sessionStorage.getItem(key), fallback);
    } catch (_) {
      return fallback;
    }
  }

  function ssSetJson(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function makeLog() {
    const log = {
      at: nowISO(),
      steps: [],
      counts: {},
      warnings: [],
      errors: [],
    };
    log.step = function (name, data) {
      log.steps.push({ at: nowISO(), name, ...(data || {}) });
    };
    log.warn = function (msg, data) {
      log.warnings.push({ at: nowISO(), msg, ...(data || {}) });
    };
    log.err = function (msg, data) {
      log.errors.push({ at: nowISO(), msg, ...(data || {}) });
    };
    return log;
  }

  function normalizeInputs(payload, log) {
    // Accept:
    // - payload = { schedule: [...], entries: [...] }
    // - payload = { rings: [...] } (treated as schedule)
    // - payload omitted (read from sessionStorage)
    let schedule = null;
    let entries = null;

    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.schedule)) schedule = payload.schedule;
      if (Array.isArray(payload.entries)) entries = payload.entries;
      if (!schedule && Array.isArray(payload.rings)) schedule = payload.rings;
      if (!schedule && Array.isArray(payload)) schedule = payload; // payload is schedule array
    }

    if (!schedule) schedule = ssGetJson(SS_KEYS.schedule, []);
    if (!entries) entries = ssGetJson(SS_KEYS.entries, []);

    // Some callers may store a single object in "schedule" that contains both.
    if (schedule && !Array.isArray(schedule) && typeof schedule === "object") {
      const maybeSchedule = schedule.schedule || schedule.rings;
      const maybeEntries = schedule.entries;
      if (Array.isArray(maybeSchedule)) schedule = maybeSchedule;
      if (Array.isArray(maybeEntries) && !Array.isArray(entries)) entries = maybeEntries;
    }

    if (!Array.isArray(schedule)) schedule = [];
    if (!Array.isArray(entries)) entries = [];

    log.step("inputs.normalized", {
      schedule_type: Array.isArray(schedule) ? "array" : typeof schedule,
      entries_type: Array.isArray(entries) ? "array" : typeof entries,
      schedule_len: schedule.length,
      entries_len: entries.length,
      sources: {
        schedule: payload && payload.schedule ? "payload.schedule" : "sessionStorage.schedule",
        entries: payload && payload.entries ? "payload.entries" : "sessionStorage.entries",
      },
    });

    return { schedule, entries };
  }

  function timeKey(cls) {
    // Prefer estimated_start_time, then start_time_default, else empty.
    return (
      (cls && (cls.estimated_start_time || cls.start_time_default)) ||
      ""
    );
  }

  function parseClassList(str) {
    if (typeof str !== "string") return [];
    return str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : v;
      });
  }

  function stableSort(arr, cmp) {
    return arr
      .map((v, i) => ({ v, i }))
      .sort((a, b) => {
        const c = cmp(a.v, b.v);
        return c !== 0 ? c : a.i - b.i;
      })
      .map((x) => x.v);
  }

  function buildEntriesIndex(entries, log) {
    // Index barn entries by class_id and by (ring_number,class_group_id)
    const byClassId = new Map();
    const byRingGroup = new Map();

    let bad = 0;
    for (const e of entries) {
      const cd = e && e.class_data;
      const ec = e && e.entry_class;

      const classId = cd && cd.class_id;
      const ringNum = cd && cd.ring;
      const groupId = cd && cd.class_group_id;

      if (!classId) {
        bad++;
        continue;
      }

      if (!byClassId.has(classId)) byClassId.set(classId, []);
      byClassId.get(classId).push(e);

      const rgk = `${ringNum || ""}|${groupId || ""}`;
      if (!byRingGroup.has(rgk)) byRingGroup.set(rgk, []);
      byRingGroup.get(rgk).push(e);
    }

    log.step("entries.indexed", {
      byClassId_keys: byClassId.size,
      byRingGroup_keys: byRingGroup.size,
      bad_entries: bad,
    });

    return { byClassId, byRingGroup };
  }

  function simplifyEntry(e) {
    const ec = e.entry_class || {};
    return {
      entry_id: e.entry_id,
      horse: e.horse || "",
      rider_id: ec.rider_id || null,
      rider_name: ec.rider_name || "",
      responsibleparty_id: e.responsibleparty_id || null,
      entryowner_id: e.entryowner_id || null,
      is_morning: !!e.is_morning,
      has_conflict: !!e.has_conflict,
      // Prefer entry_class order_of_go; fallback to top-level; fallback to 0
      order_of_go:
        Number(ec.order_of_go) ||
        Number(e.order_of_go) ||
        0,
      estimated_go_time: ec.estimated_go_time || "",
      entryxclasses_uuid: ec.entryxclasses_uuid || "",
    };
  }

  function buildTrainerModel(schedule, entries, log) {
    const idx = buildEntriesIndex(entries, log);

    const ringsOut = [];
    const seenScheduleClassIds = new Set();

    for (const ring of schedule) {
      const ringNumber = ring.ring_number ?? ring.ring ?? ring.ringNumber;
      const ringName = ring.ring_name ?? ring.ring_name_display ?? ring.ringName ?? `Ring ${ringNumber ?? ""}`;
      const ringId = ring.ring_id ?? ring.ringId ?? null;

      const classes = Array.isArray(ring.classes) ? ring.classes : [];
      // group classes by class_group_id
      const groupsMap = new Map();

      for (const cls of classes) {
        if (!cls) continue;
        const classId = cls.class_id;
        if (classId) seenScheduleClassIds.add(classId);

        const groupId = cls.class_group_id ?? null;
        const groupSeq = cls.class_group_sequence ?? null;
        const groupName = cls.group_name ?? "";
        const classList = cls.class_list ?? "";

        const gKey = String(groupId ?? "0");
        if (!groupsMap.has(gKey)) {
          groupsMap.set(gKey, {
            class_group_id: groupId,
            class_group_sequence: groupSeq,
            group_name: groupName,
            class_list: classList,
            horses: [],
            horse_map: {}, // horse -> [class_id,...]
            classes: [],
          });
        }

        const g = groupsMap.get(gKey);

        // Keep earliest non-empty group_name / class_list if later rows vary.
        if (!g.group_name && groupName) g.group_name = groupName;
        if (!g.class_list && classList) g.class_list = classList;
        if (g.class_group_sequence == null && groupSeq != null) g.class_group_sequence = groupSeq;

        // Attach barn entries for this class_id (if any)
        const barnEntriesRaw = classId ? (idx.byClassId.get(classId) || []) : [];
        const barnEntries = barnEntriesRaw.map(simplifyEntry);

        // Track horses at group level (for Default/Detail toggles)
        for (const be of barnEntries) {
          if (be.horse) {
            g.horses.push(be.horse);
            if (!g.horse_map[be.horse]) g.horse_map[be.horse] = [];
            g.horse_map[be.horse].push(classId);
          }
        }

        g.classes.push({
          class_id: classId,
          class_number: cls.class_number ?? null,
          class_name: cls.class_name ?? "",
          class_type: cls.class_type ?? "",
          sponsor: cls.sponsor ?? "",
          cancelled: Number(cls.cancelled) || 0,
          warmup_class: Number(cls.warmup_class) || 0,
          schedule_break: Number(cls.schedule_break) || 0,
          schedule_sequencetype: cls.schedule_sequencetype ?? "",
          jumper_table: cls.jumper_table ?? "",
          group_sequence: cls.group_sequence ?? null, // sometimes present
          class_groupxclasses_id: cls.class_groupxclasses_id ?? null,
          class_group_id: cls.class_group_id ?? null,
          class_group_sequence: cls.class_group_sequence ?? null,
          total_trips: cls.total_trips ?? null,
          show_total_trips: cls.show_total_trips ?? null,
          group_has_warmup: cls.group_has_warmup ?? null,
          is_open_card_warmup: cls.is_open_card_warmup ?? null,
          estimated_start_time: cls.estimated_start_time ?? "",
          start_time_default: cls.start_time_default ?? "",
          estimated_end_time: cls.estimated_end_time ?? "",
          time: timeKey(cls),
          barn_entries: barnEntries,
        });
      }

      // finalize groups: de-dupe horses, order classes, order groups
      const groupsOut = [];
      for (const g of groupsMap.values()) {
        // de-dupe horses while preserving first-seen order
        const seen = new Set();
        g.horses = g.horses.filter((h) => {
          if (!h) return false;
          if (seen.has(h)) return false;
          seen.add(h);
          return true;
        });

        // order classes:
        // 1) by group class_list position (if available)
        // 2) by time (estimated/start default)
        // 3) by class_number
        const orderList = parseClassList(g.class_list);
        const pos = new Map();
        for (let i = 0; i < orderList.length; i++) pos.set(orderList[i], i);

        g.classes = stableSort(g.classes, (a, b) => {
          const aNum = a.class_number;
          const bNum = b.class_number;

          const aPos = pos.has(aNum) ? pos.get(aNum) : Number.POSITIVE_INFINITY;
          const bPos = pos.has(bNum) ? pos.get(bNum) : Number.POSITIVE_INFINITY;
          if (aPos !== bPos) return aPos - bPos;

          const at = a.time || "";
          const bt = b.time || "";
          if (at !== bt) return at.localeCompare(bt);

          const an = Number(aNum) || 0;
          const bn = Number(bNum) || 0;
          if (an !== bn) return an - bn;

          return String(a.class_id || "").localeCompare(String(b.class_id || ""));
        });

        // remove duplicate class_ids in horse_map lists
        for (const horse of Object.keys(g.horse_map)) {
          const list = g.horse_map[horse] || [];
          const s2 = new Set();
          g.horse_map[horse] = list.filter((cid) => {
            const k = String(cid || "");
            if (!k) return false;
            if (s2.has(k)) return false;
            s2.add(k);
            return true;
          });
        }

        groupsOut.push(g);
      }

      const groupsSorted = stableSort(groupsOut, (a, b) => {
        const as = Number(a.class_group_sequence);
        const bs = Number(b.class_group_sequence);
        const aHas = Number.isFinite(as);
        const bHas = Number.isFinite(bs);
        if (aHas && bHas && as !== bs) return as - bs;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;

        // fallback: earliest class time in group
        const aFirst = (a.classes[0] && (a.classes[0].time || "")) || "";
        const bFirst = (b.classes[0] && (b.classes[0].time || "")) || "";
        if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);

        // fallback: group id
        return String(a.class_group_id || "0").localeCompare(String(b.class_group_id || "0"));
      });

      ringsOut.push({
        ring_number: ringNumber,
        ring_name: ringName,
        ring_id: ringId,
        ring_status: ring.ring_status ?? "",
        total_trips: ring.total_trips ?? null,
        groups: groupsSorted,
      });
    }

    // sort rings by ring_number numeric
    const ringsSorted = stableSort(ringsOut, (a, b) => {
      const an = Number(a.ring_number);
      const bn = Number(b.ring_number);
      const aHas = Number.isFinite(an);
      const bHas = Number.isFinite(bn);
      if (aHas && bHas && an !== bn) return an - bn;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return String(a.ring_name || "").localeCompare(String(b.ring_name || ""));
    });

    // Orphan entries (class_id not found in schedule)
    const orphan = [];
    for (const [classId, list] of idx.byClassId.entries()) {
      if (!seenScheduleClassIds.has(classId)) {
        for (const e of list) orphan.push(simplifyEntry(e));
      }
    }

    if (orphan.length) {
      log.warn("entries.without_schedule_class", {
        orphan_count: orphan.length,
        sample: orphan.slice(0, 5),
      });
    }

    log.counts = {
      schedule_rings: schedule.length,
      schedule_classes: Array.isArray(schedule)
        ? schedule.reduce((acc, r) => acc + (Array.isArray(r.classes) ? r.classes.length : 0), 0)
        : 0,
      entries_total: entries.length,
      rings_out: ringsSorted.length,
      orphan_entries: orphan.length,
    };

    log.step("model.built", { counts: log.counts });

    return {
      meta: {
        generated_at: nowISO(),
        payload_mode: "schedule+entries",
      },
      rings: ringsSorted,
      orphan_entries: orphan, // optional; renderer can ignore
    };
  }

  function derive(payload) {
    const log = makeLog();

    try {
      const { schedule, entries } = normalizeInputs(payload, log);

      if (!schedule.length) {
        log.warn("schedule.empty", { key: SS_KEYS.schedule });
      }
      // entries may be intentionally empty; do not warn unless schedule exists and entries missing.
      if (schedule.length && !entries.length) {
        log.warn("entries.empty", { key: SS_KEYS.entries });
      }

      const model = buildTrainerModel(schedule, entries, log);

      const wroteRows = ssSetJson(SS_KEYS.trainerRows, model);
      const wroteLog = ssSetJson(SS_KEYS.trainerLog, log);

      log.step("sessionStorage.writes", {
        trainer_rows: wroteRows,
        trainer_log: wroteLog,
        keys: SS_KEYS,
      });

      // ensure latest log persisted (after writes step)
      ssSetJson(SS_KEYS.trainerLog, log);

      return model;
    } catch (err) {
      log.err("derive.failed", {
        message: String(err && err.message ? err.message : err),
        stack: String(err && err.stack ? err.stack : ""),
      });
      ssSetJson(SS_KEYS.trainerLog, log);
      throw err;
    }
  }

  // Public API
  window.CRT_trainerDerive = derive;
})();
