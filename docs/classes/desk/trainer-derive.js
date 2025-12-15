/* trainer_derive.js
 * Drop-in: derives Trainer report model from sessionStorage.schedule + sessionStorage.entries
 * Exposes:
 *   - window.CRT_trainerDerive() -> Array (never null)
 * Writes:
 *   - sessionStorage.trainer_rows (JSON string)
 *   - sessionStorage.trainer_log  (JSON string)
 *
 * Output shape (trainer_rows):
 *   [
 *     {
 *       ring: <number|string>,
 *       ring_name: <string>,
 *       class_group_id: <number|null>,
 *       group_sequence: <number|null>,
 *       group_name: <string>,
 *       horses: [<string>...],                // unique horses across this group (barn only)
 *       classes: [
 *         {
 *           class_id: <number|null>,
 *           class_number: <number|null>,
 *           class_name: <string>,
 *           time: <string>,                   // schedule time (estimated_start_time/start_time_default)
 *           sched_minutes: <number|null>,
 *           entries: [
 *             { entry_id, horse, rider_name, order_of_go, estimated_go_time, is_morning, has_conflict }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 */
(() => {
  "use strict";

  const LOG_KEY = "trainer_log";
  const ROWS_KEY = "trainer_rows";
  const SCHEDULE_KEY = "schedule";
  const ENTRIES_KEY = "entries";

  function nowISO() {
    return new Date().toISOString();
  }

  function safeJsonParse(v) {
    if (v == null) return null;
    if (typeof v !== "string") return v;
    const s = v.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function writeSessionJSON(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function readSessionJSON(key) {
    try {
      return safeJsonParse(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function isObj(x) {
    return x && typeof x === "object" && !Array.isArray(x);
  }

  function toInt(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function cleanStr(x) {
    const s = String(x == null ? "" : x).trim();
    return s;
  }

  function uniqStrings(arr) {
    const out = [];
    const seen = new Set();
    for (const x of arr || []) {
      const v = cleanStr(x);
      if (!v) continue;
      const k = v.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    return out;
  }

  function hhmmssToMinutes(t) {
    const s = cleanStr(t);
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3] || "0");
    if (![hh, mm, ss].every(Number.isFinite)) return null;
    return hh * 60 + mm + (ss >= 30 ? 1 : 0);
  }

  function pickSchedTime(c) {
    return (
      cleanStr(c.estimated_start_time) ||
      cleanStr(c.start_time_default) ||
      cleanStr(c.sched_time) ||
      ""
    );
  }

  function normalizeSchedule(rawSchedule, log) {
    const out = [];

    // Case A: rings array: [{ ring_number, ring_name, classes:[...] }, ...]
    const looksLikeRingArray =
      Array.isArray(rawSchedule) &&
      rawSchedule.length &&
      isObj(rawSchedule[0]) &&
      Array.isArray(rawSchedule[0].classes);

    if (looksLikeRingArray) {
      for (const ringObj of rawSchedule) {
        const ring = toInt(ringObj.ring_number) ?? toInt(ringObj.ring) ?? ringObj.ring_number ?? ringObj.ring ?? null;
        const ring_name = cleanStr(ringObj.ring_name) || "";
        const ring_id = toInt(ringObj.ring_id);
        const classes = Array.isArray(ringObj.classes) ? ringObj.classes : [];
        for (const c of classes) {
          const time = pickSchedTime(c);
          out.push({
            _raw: c,
            ring,
            ring_name,
            ring_id,
            class_group_id: toInt(c.class_group_id),
            group_sequence: toInt(c.class_group_sequence) ?? toInt(c.group_sequence),
            group_name: cleanStr(c.group_name) || "",
            class_id: toInt(c.class_id),
            class_number: toInt(c.class_number),
            class_name: cleanStr(c.class_name) || "",
            sched_time: time,
            sched_minutes: hhmmssToMinutes(time),
          });
        }
      }

      log.push({
        at: nowISO(),
        name: "schedule.normalized.from_rings",
        rings_in: rawSchedule.length,
        classes_out: out.length,
      });

      return out;
    }

    // Case B: already a class-row array: [{ class_id, class_group_id, ring/ring_number, ... }, ...]
    if (Array.isArray(rawSchedule)) {
      for (const c of rawSchedule) {
        if (!isObj(c)) continue;
        const ring =
          toInt(c.ring_number) ??
          toInt(c.ring) ??
          toInt(c.ring_no) ??
          toInt(c.ringNum) ??
          c.ring_number ??
          c.ring ??
          null;

        const ring_name = cleanStr(c.ring_name) || "";
        const ring_id = toInt(c.ring_id);

        const time = pickSchedTime(c);

        out.push({
          _raw: c,
          ring,
          ring_name,
          ring_id,
          class_group_id: toInt(c.class_group_id),
          group_sequence: toInt(c.class_group_sequence) ?? toInt(c.group_sequence),
          group_name: cleanStr(c.group_name) || "",
          class_id: toInt(c.class_id),
          class_number: toInt(c.class_number),
          class_name: cleanStr(c.class_name) || "",
          sched_time: time,
          sched_minutes: hhmmssToMinutes(time),
        });
      }

      log.push({
        at: nowISO(),
        name: "schedule.normalized.from_rows",
        rows_in: rawSchedule.length,
        rows_out: out.length,
      });

      return out;
    }

    log.push({
      at: nowISO(),
      name: "schedule.normalized.empty_or_bad_type",
      schedule_type: typeof rawSchedule,
    });

    return out;
  }

  function normalizeEntries(rawEntries, log) {
    const out = [];
    if (!Array.isArray(rawEntries)) {
      log.push({
        at: nowISO(),
        name: "entries.normalized.empty_or_bad_type",
        entries_type: typeof rawEntries,
      });
      return out;
    }

    for (const e of rawEntries) {
      if (!isObj(e)) continue;

      const cd = isObj(e.class_data) ? e.class_data : {};
      const ec = isObj(e.entry_class) ? e.entry_class : {};

      const class_id = toInt(ec.class_id) ?? toInt(cd.class_id);
      const horse = cleanStr(e.horse);
      const rider_name = cleanStr(ec.rider_name);
      const estimated_go_time = cleanStr(ec.estimated_go_time);
      const order_of_go = toInt(ec.order_of_go) ?? toInt(e.order_of_go) ?? 0;

      out.push({
        _raw: e,
        entry_id: toInt(e.entry_id),
        class_id,
        ring: toInt(cd.ring),
        class_group_id: toInt(cd.class_group_id),
        group_sequence: toInt(cd.group_sequence),
        class_number: toInt(cd.class_number),
        class_name: cleanStr(cd.class_name) || "",
        horse,
        rider_name,
        estimated_go_time,
        order_of_go: order_of_go ?? 0,
        is_morning: !!e.is_morning,
        has_conflict: !!e.has_conflict,
      });
    }

    log.push({
      at: nowISO(),
      name: "entries.normalized",
      entries_in: rawEntries.length,
      entries_out: out.length,
    });

    return out;
  }

  function countMissing(scheduleRows) {
    const c = {
      ring: 0,
      class_group_id: 0,
      class_id: 0,
      class_number: 0,
      class_name: 0,
      sched_time: 0,
    };
    for (const r of scheduleRows || []) {
      if (r.ring == null) c.ring++;
      if (r.class_group_id == null) c.class_group_id++;
      if (r.class_id == null) c.class_id++;
      if (r.class_number == null) c.class_number++;
      if (!cleanStr(r.class_name)) c.class_name++;
      if (!cleanStr(r.sched_time)) c.sched_time++;
    }
    return c;
  }

  function indexEntries(entries, log) {
    const byClassId = new Map();      // class_id -> [entry...]
    const byRingGroup = new Map();    // "ring|class_group_id" -> [entry...]

    let bad = 0;

    for (const e of entries || []) {
      const cid = e.class_id;
      if (cid == null) bad++;

      if (cid != null) {
        if (!byClassId.has(cid)) byClassId.set(cid, []);
        byClassId.get(cid).push(e);
      }

      const rgk = `${e.ring ?? "—"}|${e.class_group_id ?? "—"}`;
      if (!byRingGroup.has(rgk)) byRingGroup.set(rgk, []);
      byRingGroup.get(rgk).push(e);
    }

    // stable sort entries inside each class by order_of_go (if present >0), else by horse
    for (const [cid, arr] of byClassId.entries()) {
      arr.sort((a, b) => {
        const ao = toInt(a.order_of_go) ?? 0;
        const bo = toInt(b.order_of_go) ?? 0;
        if (ao && bo) return ao - bo;
        if (ao && !bo) return -1;
        if (!ao && bo) return 1;
        const ah = cleanStr(a.horse).toUpperCase();
        const bh = cleanStr(b.horse).toUpperCase();
        if (ah < bh) return -1;
        if (ah > bh) return 1;
        return 0;
      });
    }

    log.push({
      at: nowISO(),
      name: "entries.indexed",
      byClassId_keys: byClassId.size,
      byRingGroup_keys: byRingGroup.size,
      bad_entries: bad,
    });

    return { byClassId, byRingGroup, bad_entries: bad };
  }

  function buildTrainerRows(scheduleRows, entryIndex, log) {
    const { byClassId } = entryIndex;

    // group schedule rows by (ring, class_group_id)
    const groupMap = new Map(); // key -> group obj

    let schedule_classes = 0;

    for (const s of scheduleRows || []) {
      schedule_classes++;

      const ring = s.ring ?? "—";
      const ring_name = cleanStr(s.ring_name) || "";
      const class_group_id = s.class_group_id ?? null;
      const group_sequence = s.group_sequence ?? null;
      const group_name = cleanStr(s.group_name) || "";

      const gkey = `${ring}|${class_group_id ?? "—"}`;

      if (!groupMap.has(gkey)) {
        groupMap.set(gkey, {
          ring,
          ring_name,
          class_group_id,
          group_sequence,
          group_name,
          horses: [],
          classes: [],
        });
      }

      const group = groupMap.get(gkey);

      const class_id = s.class_id ?? null;
      const entries = class_id != null ? (byClassId.get(class_id) || []) : [];

      // fold entries (barn) into schedule class
      const classRow = {
        class_id,
        class_number: s.class_number ?? null,
        class_name: s.class_name || "",
        time: s.sched_time || "",
        sched_minutes: s.sched_minutes ?? null,
        entries: entries.map(e => ({
          entry_id: e.entry_id ?? null,
          horse: e.horse || "",
          rider_name: e.rider_name || "",
          order_of_go: e.order_of_go ?? 0,
          estimated_go_time: e.estimated_go_time || "",
          is_morning: !!e.is_morning,
          has_conflict: !!e.has_conflict,
        })),
      };

      group.classes.push(classRow);
      if (entries.length) {
        group.horses.push(...entries.map(e => e.horse));
      }
    }

    // finalize groups: uniq horses, sort classes, sort groups, then output as array
    const groups = Array.from(groupMap.values());

    for (const g of groups) {
      g.horses = uniqStrings(g.horses);

      g.classes.sort((a, b) => {
        const am = a.sched_minutes ?? 1e9;
        const bm = b.sched_minutes ?? 1e9;
        if (am !== bm) return am - bm;

        const an = a.class_number ?? 1e9;
        const bn = b.class_number ?? 1e9;
        if (an !== bn) return an - bn;

        const aid = a.class_id ?? 1e18;
        const bid = b.class_id ?? 1e18;
        return aid - bid;
      });
    }

    groups.sort((a, b) => {
      const ar = toInt(a.ring) ?? 1e9;
      const br = toInt(b.ring) ?? 1e9;
      if (ar !== br) return ar - br;

      const ags = a.group_sequence ?? 1e9;
      const bgs = b.group_sequence ?? 1e9;
      if (ags !== bgs) return ags - bgs;

      const ag = toInt(a.class_group_id) ?? 1e18;
      const bg = toInt(b.class_group_id) ?? 1e18;
      return ag - bg;
    });

    // counts
    const ringsSet = new Set(groups.map(g => String(g.ring)));
    let entries_total = 0;
    for (const g of groups) {
      for (const c of g.classes || []) entries_total += (c.entries || []).length;
    }

    log.push({
      at: nowISO(),
      name: "model.built",
      counts: {
        schedule_rings: ringsSet.size,
        schedule_classes,
        groups_out: groups.length,
        entries_attached_total: entries_total,
      },
    });

    return groups;
  }

  window.CRT_trainerDerive = function CRT_trainerDerive() {
    const log = [];
    const startedAt = nowISO();

    try {
      const rawSchedule = readSessionJSON(SCHEDULE_KEY);
      const rawEntries = readSessionJSON(ENTRIES_KEY);

      log.push({
        at: startedAt,
        name: "inputs.read",
        schedule_type: Array.isArray(rawSchedule) ? "array" : typeof rawSchedule,
        entries_type: Array.isArray(rawEntries) ? "array" : typeof rawEntries,
        schedule_len: Array.isArray(rawSchedule) ? rawSchedule.length : null,
        entries_len: Array.isArray(rawEntries) ? rawEntries.length : null,
        sources: { schedule: `sessionStorage.${SCHEDULE_KEY}`, entries: `sessionStorage.${ENTRIES_KEY}` },
      });

      const scheduleRows = normalizeSchedule(rawSchedule, log);
      const entries = normalizeEntries(rawEntries, log);

      const missing = countMissing(scheduleRows);
      log.push({
        at: nowISO(),
        name: "schedule.missing_fields_counts",
        missing_fields_counts: missing,
      });

      const idx = indexEntries(entries, log);
      const trainerRows = buildTrainerRows(scheduleRows, idx, log);

      // Write rows + log, then read-back verify (no guessing).
      const wroteRows = writeSessionJSON(ROWS_KEY, trainerRows);
      const wroteLog = writeSessionJSON(LOG_KEY, log);

      const readBack = readSessionJSON(ROWS_KEY);
      const readBackOk = Array.isArray(readBack);

      log.push({
        at: nowISO(),
        name: "sessionStorage.writes",
        trainer_rows: wroteRows,
        trainer_log: wroteLog,
        readback_ok: readBackOk,
        readback_type: Array.isArray(readBack) ? "array" : typeof readBack,
        readback_len: Array.isArray(readBack) ? readBack.length : null,
        keys: {
          schedule: SCHEDULE_KEY,
          entries: ENTRIES_KEY,
          trainerRows: ROWS_KEY,
          trainerLog: LOG_KEY,
        },
      });

      // Ensure the final log write includes the write+readback step too.
      writeSessionJSON(LOG_KEY, log);

      // Hard guarantee: never return null/undefined.
      return Array.isArray(trainerRows) ? trainerRows : [];
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      log.push({
        at: nowISO(),
        name: "fatal.error",
        message: msg,
      });
      writeSessionJSON(LOG_KEY, log);

      // Hard guarantee: never return null/undefined.
      return [];
    }
  };
})();
