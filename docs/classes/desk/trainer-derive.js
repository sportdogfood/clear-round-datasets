/* trainer_derive.js
 * Drop-in derive module (schedule-first, ring-first) with hard logs.
 *
 * Exposes:
 *   window.CRT_trainerDerive(schedule?, entries?, opts?)
 *
 * Behavior:
 * - Accepts either:
 *   A) schedule as rings[] with .classes[] (nested), OR
 *   B) schedule as flattened classes[] (len ~105)
 * - Folds your barn entries into schedule classes by class_id
 * - Writes:
 *     sessionStorage.trainer_rows (JSON string)
 *     sessionStorage.trainer_log  (JSON string)
 * - RETURNS trainer_rows array (NEVER null)
 */
(() => {
  "use strict";

  const VERSION = "v2025-12-15-derive-dropin-01";
  const SS_KEYS = {
    schedule: "schedule",
    entries: "entries",
    trainerRows: "trainer_rows",
    trainerLog: "trainer_log",
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function safeParseJSON(v) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  function toInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function asStr(v) {
    return v == null ? "" : String(v);
  }

  function isArray(x) {
    return Array.isArray(x);
  }

  function uniqStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const x of arr || []) {
      const s = String(x || "").trim();
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  function pickTime(obj) {
    // schedule times
    const a = asStr(obj && obj.estimated_start_time).trim();
    const b = asStr(obj && obj.start_time_default).trim();
    // entry times (not used for schedule lines, but keep)
    const c = asStr(obj && obj.estimated_go_time).trim();
    if (a && a !== "00:00:00") return a;
    if (b && b !== "00:00:00") return b;
    if (c && c !== "00:00:00") return c;
    return "";
  }

  function logPush(steps, name, payload) {
    steps.push(Object.assign({ at: nowISO(), name }, payload || {}));
  }

  // ---- Normalize schedule ----
  // Output: flatClasses[] where each row is one scheduled class line
  function normalizeSchedule(input, steps) {
    const raw = input;

    // A) rings[] w/ classes[]
    if (isArray(raw) && raw.length && raw[0] && isArray(raw[0].classes)) {
      const flat = [];
      for (const ringObj of raw) {
        const ring =
          toInt(ringObj.ring_number) ??
          toInt(ringObj.ring) ??
          toInt(ringObj.ring_id) ??
          null;

        const classes = isArray(ringObj.classes) ? ringObj.classes : [];
        for (const c of classes) {
          flat.push({
            _raw: c,
            ring,
            class_group_id: toInt(c.class_group_id),
            group_sequence: toInt(c.class_group_sequence) ?? toInt(c.group_sequence),
            group_name: asStr(c.group_name).trim(),
            class_id: toInt(c.class_id),
            class_number: toInt(c.class_number),
            class_name: asStr(c.class_name).trim(),
            sched_time: pickTime(c),
          });
        }
      }
      logPush(steps, "schedule.normalized", {
        input_shape: "rings[].classes[]",
        schedule_len: flat.length,
      });
      return flat;
    }

    // B) flat classes[]
    if (isArray(raw)) {
      const flat = raw.map((c) => {
        const ring =
          toInt(c.ring) ??
          toInt(c.ring_number) ??
          toInt(c.ring_id) ??
          null;

        return {
          _raw: c,
          ring,
          class_group_id: toInt(c.class_group_id),
          group_sequence: toInt(c.class_group_sequence) ?? toInt(c.group_sequence),
          group_name: asStr(c.group_name).trim(),
          class_id: toInt(c.class_id),
          class_number: toInt(c.class_number),
          class_name: asStr(c.class_name).trim(),
          sched_time: pickTime(c),
        };
      });

      logPush(steps, "schedule.normalized", {
        input_shape: "classes[]",
        schedule_len: flat.length,
      });
      return flat;
    }

    logPush(steps, "schedule.normalized", {
      input_shape: typeof raw,
      schedule_len: 0,
    });
    return [];
  }

  function missingCountsSchedule(flat) {
    const c = {
      ring: 0,
      class_group_id: 0,
      class_id: 0,
      class_number: 0,
      class_name: 0,
      sched_time: 0,
    };
    for (const r of flat || []) {
      if (r.ring == null) c.ring++;
      if (r.class_group_id == null) c.class_group_id++;
      if (r.class_id == null) c.class_id++;
      if (r.class_number == null) c.class_number++;
      if (!asStr(r.class_name).trim()) c.class_name++;
      // time can be blank; do not count as missing unless you want it
      if (!asStr(r.sched_time).trim()) c.sched_time++;
    }
    return c;
  }

  // ---- Normalize entries ----
  // Output: entryRows[] each with class_id and display bits
  function normalizeEntries(input, steps) {
    const raw = input;
    if (!isArray(raw)) {
      logPush(steps, "entries.normalized", { entries_len: 0, input_shape: typeof raw });
      return [];
    }

    const out = [];
    let bad = 0;

    for (const e of raw) {
      const cd = e && e.class_data ? e.class_data : null;
      const ec = e && e.entry_class ? e.entry_class : null;

      const class_id = toInt((ec && ec.class_id) ?? (cd && cd.class_id));
      const ring = toInt(cd && cd.ring);
      const class_group_id = toInt(cd && cd.class_group_id);

      const horse = asStr(e && e.horse).trim();
      const rider_name = asStr(ec && ec.rider_name).trim();
      const order_of_go = toInt((ec && ec.order_of_go) ?? (cd && cd.order_of_go) ?? (e && e.order_of_go)) ?? 0;
      const estimated_go_time = asStr(ec && ec.estimated_go_time).trim();

      if (class_id == null || !horse) {
        bad++;
        continue;
      }

      out.push({
        _raw: e,
        class_id,
        ring,
        class_group_id,
        horse,
        rider_name,
        order_of_go,
        estimated_go_time: estimated_go_time && estimated_go_time !== "00:00:00" ? estimated_go_time : "",
      });
    }

    logPush(steps, "entries.normalized", {
      input_shape: "entries[]",
      entries_len: out.length,
      bad_entries: bad,
    });

    return out;
  }

  // Build indices for fast attach
  function indexEntries(entries, steps) {
    const byClassId = new Map(); // class_id -> entry[]
    const byRingGroup = new Map(); // "ring|group" -> entry[]
    let bad = 0;

    for (const e of entries || []) {
      if (e.class_id == null) {
        bad++;
        continue;
      }
      if (!byClassId.has(e.class_id)) byClassId.set(e.class_id, []);
      byClassId.get(e.class_id).push(e);

      const rk = e.ring != null && e.class_group_id != null ? `${e.ring}|${e.class_group_id}` : null;
      if (rk) {
        if (!byRingGroup.has(rk)) byRingGroup.set(rk, []);
        byRingGroup.get(rk).push(e);
      }
    }

    logPush(steps, "entries.indexed", {
      byClassId_keys: byClassId.size,
      byRingGroup_keys: byRingGroup.size,
      bad_entries: bad,
    });

    return { byClassId, byRingGroup };
  }

  // ---- Build trainer_rows (Ring → Group → Class lines with entries attached) ----
  function buildTrainerRows(scheduleFlat, entries, steps) {
    const { byClassId } = indexEntries(entries, steps);

    // schedule class_id set (for orphan detection)
    const schedClassIds = new Set();
    for (const s of scheduleFlat || []) {
      if (s.class_id != null) schedClassIds.add(s.class_id);
    }

    // orphan entries = class_id not present in schedule
    let orphan = 0;
    for (const e of entries || []) {
      if (e.class_id != null && !schedClassIds.has(e.class_id)) orphan++;
    }

    // Group map: ring|class_group_id
    const groupMap = new Map();

    for (const s of scheduleFlat || []) {
      // ignore unusable schedule rows
      if (s.ring == null) continue;
      if (s.class_group_id == null) continue;
      if (s.class_id == null) continue;

      const key = `${s.ring}|${s.class_group_id}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          ring: s.ring,
          class_group_id: s.class_group_id,
          group_sequence: s.group_sequence != null ? s.group_sequence : 9999,
          group_name: s.group_name || "",
          horses: [],
          classes: [],
        });
      }

      const g = groupMap.get(key);

      const attached = byClassId.get(s.class_id) || [];
      const classLine = {
        class_id: s.class_id,
        time: s.sched_time || "",
        class_number: s.class_number,
        class_name: s.class_name || "",
        entries: attached.map((e) => ({
          entry_id: e._raw && e._raw.entry_id != null ? e._raw.entry_id : null,
          horse: e.horse,
          rider_name: e.rider_name,
          order_of_go: e.order_of_go,
          estimated_go_time: e.estimated_go_time,
        })),
      };

      g.classes.push(classLine);

      // update horses union from attached entries (schedule-first, so empty allowed)
      for (const e of attached) {
        if (e && e.horse) g.horses.push(e.horse);
      }
    }

    // finalize group horses unique
    const groups = Array.from(groupMap.values());
    for (const g of groups) g.horses = uniqStrings(g.horses);

    // sort classes inside group by (time, class_number, class_id)
    for (const g of groups) {
      g.classes.sort((a, b) => {
        const ta = asStr(a.time);
        const tb = asStr(b.time);
        if (ta !== tb) return ta < tb ? -1 : 1;

        const na = a.class_number == null ? 999999 : Number(a.class_number);
        const nb = b.class_number == null ? 999999 : Number(b.class_number);
        if (na !== nb) return na - nb;

        return Number(a.class_id) - Number(b.class_id);
      });
    }

    // sort groups by ring then group_sequence then class_group_id
    groups.sort((a, b) => {
      if (a.ring !== b.ring) return Number(a.ring) - Number(b.ring);
      if (a.group_sequence !== b.group_sequence) return Number(a.group_sequence) - Number(b.group_sequence);
      return Number(a.class_group_id) - Number(b.class_group_id);
    });

    const ringSet = new Set(groups.map((g) => g.ring));
    logPush(steps, "model.built", {
      counts: {
        schedule_rings: new Set(scheduleFlat.map((s) => s.ring).filter((x) => x != null)).size,
        schedule_classes: scheduleFlat.filter((s) => s.class_id != null).length,
        entries_total: (entries || []).length,
        rings_out: ringSet.size,
        groups_out: groups.length,
        orphan_entries: orphan,
      },
    });

    return groups;
  }

  function readFromSessionStorage() {
    const schedule = safeParseJSON(sessionStorage.getItem(SS_KEYS.schedule));
    const entries = safeParseJSON(sessionStorage.getItem(SS_KEYS.entries));
    return { schedule, entries };
  }

  function writeToSessionStorage(trainerRows, steps) {
    try {
      sessionStorage.setItem(SS_KEYS.trainerRows, JSON.stringify(trainerRows || []));
      sessionStorage.setItem(SS_KEYS.trainerLog, JSON.stringify(steps || []));
      logPush(steps, "sessionStorage.writes", {
        trainer_rows: true,
        trainer_log: true,
        keys: SS_KEYS,
      });
    } catch (err) {
      logPush(steps, "sessionStorage.writes", {
        trainer_rows: false,
        trainer_log: false,
        error: asStr(err && err.message),
      });
    }
  }

  function deriveCore(scheduleInput, entriesInput, opts) {
    const steps = [];
    logPush(steps, "derive.start", { version: VERSION, at_local: nowISO() });

    const schedule = scheduleInput;
    const entries = entriesInput;

    logPush(steps, "inputs.normalized", {
      schedule_type: isArray(schedule) ? "array" : typeof schedule,
      entries_type: isArray(entries) ? "array" : typeof entries,
      schedule_len: isArray(schedule) ? schedule.length : 0,
      entries_len: isArray(entries) ? entries.length : 0,
      sources: (opts && opts.sources) || {},
    });

    const scheduleFlat = normalizeSchedule(schedule, steps);
    logPush(steps, "schedule.missing_fields_counts", {
      missing_fields_counts: missingCountsSchedule(scheduleFlat),
    });

    const entryRows = normalizeEntries(entries, steps);

    const trainerRows = buildTrainerRows(scheduleFlat, entryRows, steps);

    // always write logs + rows (even if empty)
    writeToSessionStorage(trainerRows, steps);

    // hard console breadcrumb
    try {
      console.log("[TRAINER_DERIVE]", VERSION, {
        trainer_rows_len: trainerRows.length,
        rings_out: new Set(trainerRows.map((g) => g.ring)).size,
      });
    } catch {}

    // CRITICAL: never return null
    return trainerRows;
  }

  // Public API: tolerant signature
  // - CRT_trainerDerive() -> reads schedule/entries from sessionStorage
  // - CRT_trainerDerive(schedule, entries)
  // - CRT_trainerDerive({schedule, entries}) (object form)
  window.CRT_trainerDerive = function (a, b, c) {
    // object-form
    if (a && typeof a === "object" && !Array.isArray(a) && (a.schedule || a.entries)) {
      const schedule = a.schedule;
      const entries = a.entries;
      return deriveCore(schedule, entries, { sources: { schedule: "arg.schedule", entries: "arg.entries" } });
    }

    // schedule/entries args
    if (Array.isArray(a) || Array.isArray(b)) {
      return deriveCore(a, b, { sources: { schedule: "arg[0]", entries: "arg[1]" } });
    }

    // default: sessionStorage
    const { schedule, entries } = readFromSessionStorage();
    return deriveCore(schedule, entries, { sources: { schedule: "sessionStorage.schedule", entries: "sessionStorage.entries" } });
  };

  // Optional aliases (harmless if unused)
  window.trainerDerive = window.CRT_trainerDerive;
  window.CRT_trainer_derive = window.CRT_trainerDerive;
})();
