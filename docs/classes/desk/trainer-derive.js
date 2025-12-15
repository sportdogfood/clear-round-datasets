/* trainer_derive.js
 * Exposes: window.CRT_trainerDerive()
 * Reads from sessionStorage: "schedule", "entries"
 * Writes to sessionStorage: "trainer_rows"
 */
(() => {
  "use strict";

  const SS = {
    get(key) {
      try {
        const v = sessionStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },
    set(key, obj) {
      try {
        sessionStorage.setItem(key, JSON.stringify(obj));
      } catch {}
    }
  };

  function toInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isObj(x) {
    return x && typeof x === "object" && !Array.isArray(x);
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] != null && obj[k] !== "") return obj[k];
    }
    return null;
  }

  function timeToMin(t) {
    if (!t || typeof t !== "string") return null;
    // accepts "HH:MM:SS" or "HH:MM"
    const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  }

  function normalizeTime(t) {
    if (!t || typeof t !== "string") return null;
    if (t === "00:00:00") return null;
    const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const hh = String(m[1]).padStart(2, "0");
    const mm = m[2];
    return `${hh}:${mm}`;
  }

  function scheduleItems(raw) {
    if (!Array.isArray(raw)) return [];
    // Expect array of objects already; otherwise ignore (keep strict)
    return raw.filter(isObj);
  }

  function entryItems(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isObj);
  }

  function scheduleClassKey(s) {
    const classId = toInt(pick(s, ["class_id"]));
    const classNum = toInt(pick(s, ["class_number", "class_num"]));
    return classId != null ? `id:${classId}` : (classNum != null ? `num:${classNum}` : null);
  }

  function entryClassKey(e) {
    const cd = e.class_data || {};
    const ec = e.entry_class || {};
    const classId = toInt(pick(cd, ["class_id"])) ?? toInt(pick(ec, ["class_id"])) ?? toInt(pick(e, ["class_id"]));
    const classNum = toInt(pick(cd, ["class_number"])) ?? toInt(pick(e, ["class_number"]));
    return classId != null ? `id:${classId}` : (classNum != null ? `num:${classNum}` : null);
  }

  function getRingFromSchedule(s) {
    return toInt(pick(s, ["ring", "ring_id"]));
  }

  function getGroupIdFromSchedule(s) {
    return toInt(pick(s, ["class_group_id", "group_id"]));
  }

  function getGroupSeqFromSchedule(s) {
    // class_group_sequence is best; fallback to group_sequence
    const a = toInt(pick(s, ["class_group_sequence"]));
    if (a != null) return a;
    const b = toInt(pick(s, ["group_sequence"]));
    return b != null ? b : null;
  }

  function parseClassList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(toInt).filter(n => n != null);
    if (typeof v !== "string") return [];
    return v
      .split(",")
      .map(s => toInt(String(s).trim()))
      .filter(n => n != null);
  }

  function getSchedTime(s) {
    const t = pick(s, ["estimated_go_time", "start_time", "time", "go_time"]);
    return normalizeTime(t);
  }

  function getEntryTime(e) {
    const ec = e.entry_class || {};
    const cd = e.class_data || {};
    return (
      normalizeTime(pick(ec, ["estimated_go_time"])) ||
      normalizeTime(pick(cd, ["estimated_go_time"])) ||
      null
    );
  }

  function build() {
    const scheduleRaw = SS.get("schedule");
    const entriesRaw = SS.get("entries");

    const schedule = scheduleItems(scheduleRaw);
    const entries = entryItems(entriesRaw);

    // Index barn entries by ring|group|classKey
    const entryIndex = new Map();
    for (const e of entries) {
      const cd = e.class_data || {};
      const ring = toInt(pick(cd, ["ring"])) ?? toInt(pick(e, ["ring"]));
      const groupId = toInt(pick(cd, ["class_group_id"])) ?? toInt(pick(e, ["class_group_id"]));
      const ck = entryClassKey(e);
      if (ring == null || groupId == null || !ck) continue;

      const k = `${ring}|${groupId}|${ck}`;
      if (!entryIndex.has(k)) entryIndex.set(k, []);
      entryIndex.get(k).push({
        entry_id: toInt(e.entry_id),
        horse: String(e.horse || "").trim() || "—",
        rider: String(pick(e.entry_class, ["rider_name"]) || "").trim() || "—",
        order_of_go: toInt(pick(e.entry_class, ["order_of_go"])) ?? 0,
        time: getEntryTime(e),
        order_of_go_set: toInt(pick(cd, ["order_of_go_set"])) ?? 0
      });
    }

    // Build schedule-first groups/classes; if schedule missing, synthesize from entries
    const groupMap = new Map(); // ring|groupId => groupRow
    function ensureGroup(ring, groupId) {
      const k = `${ring}|${groupId}`;
      if (groupMap.has(k)) return groupMap.get(k);
      const g = {
        ring,
        class_group_id: groupId,
        class_group_sequence: null,
        class_list: [],
        group_time: null,
        horses: [],
        classes: [] // {class_key, class_id, class_number, class_name, time, group_sequence, entries:[]}
      };
      groupMap.set(k, g);
      return g;
    }

    // From schedule (preferred)
    for (const s of schedule) {
      const ring = getRingFromSchedule(s);
      const groupId = getGroupIdFromSchedule(s);
      const ck = scheduleClassKey(s);
      if (ring == null || groupId == null || !ck) continue;

      const g = ensureGroup(ring, groupId);

      const gseq = getGroupSeqFromSchedule(s);
      if (gseq != null) g.class_group_sequence = g.class_group_sequence == null ? gseq : Math.min(g.class_group_sequence, gseq);

      const cl = parseClassList(pick(s, ["class_list"]));
      if (cl.length) g.class_list = cl;

      const st = getSchedTime(s);
      if (st) {
        const cur = timeToMin(g.group_time);
        const nt = timeToMin(st);
        if (cur == null || (nt != null && nt < cur)) g.group_time = st;
      }

      const classId = toInt(pick(s, ["class_id"]));
      const classNum = toInt(pick(s, ["class_number", "class_num"]));
      const className = String(pick(s, ["class_name", "name"]) || "").trim() || "—";
      const groupSeq = toInt(pick(s, ["group_sequence", "class_sequence"])) ?? null;

      // Find or create class within group
      let c = g.classes.find(x => x.class_key === ck);
      if (!c) {
        c = {
          class_key: ck,
          class_id: classId,
          class_number: classNum,
          class_name: className,
          time: st,
          group_sequence: groupSeq,
          entries: []
        };
        g.classes.push(c);
      } else {
        // fill gaps
        if (!c.class_name || c.class_name === "—") c.class_name = className;
        if (c.class_number == null && classNum != null) c.class_number = classNum;
        if (c.class_id == null && classId != null) c.class_id = classId;
        if (!c.time && st) c.time = st;
        if (c.group_sequence == null && groupSeq != null) c.group_sequence = groupSeq;
      }

      // Attach barn entries (if any)
      const ek = `${ring}|${groupId}|${ck}`;
      const els = entryIndex.get(ek) || [];
      if (els.length) c.entries = els;
    }

    // If schedule missing or incomplete, synthesize group/classes from entries
    if (groupMap.size === 0) {
      for (const e of entries) {
        const cd = e.class_data || {};
        const ring = toInt(pick(cd, ["ring"])) ?? toInt(pick(e, ["ring"]));
        const groupId = toInt(pick(cd, ["class_group_id"])) ?? toInt(pick(e, ["class_group_id"]));
        const ck = entryClassKey(e);
        if (ring == null || groupId == null || !ck) continue;

        const g = ensureGroup(ring, groupId);
        const gseq = toInt(pick(cd, ["group_sequence"])) ?? null;
        if (gseq != null) g.class_group_sequence = g.class_group_sequence == null ? gseq : Math.min(g.class_group_sequence, gseq);

        let c = g.classes.find(x => x.class_key === ck);
        if (!c) {
          c = {
            class_key: ck,
            class_id: toInt(pick(cd, ["class_id"])) ?? toInt(pick(e.entry_class, ["class_id"])),
            class_number: toInt(pick(cd, ["class_number"])) ?? null,
            class_name: String(pick(cd, ["class_name"]) || "").trim() || "—",
            time: getEntryTime(e),
            group_sequence: toInt(pick(cd, ["group_sequence"])) ?? null,
            entries: []
          };
          g.classes.push(c);
        }
        const ek = `${ring}|${groupId}|${ck}`;
        const els = entryIndex.get(ek) || [];
        if (els.length) c.entries = els;
      }
    }

    // Post-process: horses list, time rollups, sorting
    const rows = Array.from(groupMap.values()).map(g => {
      // sort classes within group
      g.classes.sort((a, b) => {
        const as = a.group_sequence ?? 9999;
        const bs = b.group_sequence ?? 9999;
        if (as !== bs) return as - bs;

        const at = timeToMin(a.time);
        const bt = timeToMin(b.time);
        if (at != null && bt != null && at !== bt) return at - bt;

        const an = a.class_number ?? 999999;
        const bn = b.class_number ?? 999999;
        if (an !== bn) return an - bn;

        return String(a.class_name).localeCompare(String(b.class_name));
      });

      // group_time = earliest class time if missing
      if (!g.group_time) {
        let best = null;
        for (const c of g.classes) {
          const t = timeToMin(c.time);
          if (t == null) continue;
          if (best == null || t < best) best = t;
        }
        if (best != null) {
          const hh = String(Math.floor(best / 60)).padStart(2, "0");
          const mm = String(best % 60).padStart(2, "0");
          g.group_time = `${hh}:${mm}`;
        }
      }

      // horses = unique horses with at least one entry
      const horsesSet = new Set();
      for (const c of g.classes) {
        for (const en of c.entries || []) {
          horsesSet.add(en.horse);
        }
      }
      g.horses = Array.from(horsesSet).filter(Boolean);

      return g;
    });

    // sort groups by ring, then group sequence, then time, then id
    rows.sort((a, b) => {
      if (a.ring !== b.ring) return (a.ring ?? 999) - (b.ring ?? 999);

      const as = a.class_group_sequence ?? 9999;
      const bs = b.class_group_sequence ?? 9999;
      if (as !== bs) return as - bs;

      const at = timeToMin(a.group_time);
      const bt = timeToMin(b.group_time);
      if (at != null && bt != null && at !== bt) return at - bt;

      return (a.class_group_id ?? 0) - (b.class_group_id ?? 0);
    });

    SS.set("trainer_rows", rows);
    return rows;
  }

  window.CRT_trainerDerive = build;
})();
