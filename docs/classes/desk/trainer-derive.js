// trainer-derive.js
// Reads raw datasets from sessionStorage: schedule, entries, horses, rings
// Writes derived rows to sessionStorage: trainer_rows
// NO DOM. NO FETCH. NO EXPORTS.

(() => {
  function read(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function write(key, obj) {
    try {
      sessionStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }

  function normStr(v) {
    return (v == null ? "" : String(v)).trim();
  }

  function pickTime(cls) {
    return (
      normStr(cls.estimated_start_time) ||
      normStr(cls.start_time_default) ||
      normStr(cls.estimated_go_time) ||
      normStr(cls.start_time) ||
      ""
    );
  }

  function pickGroupId(cls) {
    return (
      normStr(cls.class_group_id) ||
      normStr(cls.class_groupxclasses_id) ||
      normStr(cls.class_group) ||
      normStr(cls.class_group_uid) ||
      ""
    );
  }

  function pickRingId(cls) {
    return normStr(cls.ring_id) || normStr(cls.ring) || "";
  }

  function pickClassId(cls) {
    return normStr(cls.class_id) || normStr(cls.classid) || "";
  }

  function pickGroupName(cls) {
    return (
      normStr(cls.class_group_name) ||
      normStr(cls.class_name) ||
      normStr(cls.group_name) ||
      "Class Group"
    );
  }

  function pickClassName(cls) {
    return normStr(cls.class_name) || "";
  }

  function pickEntryHorse(ent) {
    return normStr(ent.horse) || normStr(ent.horse_id) || "";
  }

  function pickOrder(ent) {
    const v = ent.order_of_go ?? ent.order ?? ent.ogo ?? "";
    return normStr(v);
  }

  // ------------------------------------------------------------
  // Main derive
  // ------------------------------------------------------------
  window.CRT_trainerDerive = function CRT_trainerDerive() {
    const schedule = read("schedule") || [];
    const entries  = read("entries")  || [];
    const horses   = read("horses")   || [];
    const rings    = read("rings")    || [];

    // Lookups
    const ringById = {};
    rings.forEach(r => {
      const id = normStr(r.ring_id || r.ring || r.id);
      if (!id) return;
      ringById[id] = r;
    });

    const horseById = {};
    horses.forEach(h => {
      const id = normStr(h.horse || h.horse_id || h.id);
      if (!id) return;
      horseById[id] = h;
    });

    // Entries by class_id
    const entriesByClass = {};
    entries.forEach(e => {
      const cid = normStr(e.class_id || e.classid);
      if (!cid) return;
      if (!entriesByClass[cid]) entriesByClass[cid] = [];
      entriesByClass[cid].push(e);
    });

    // Groups: ring_id -> group_id -> { group_name, rows[] }
    const groups = {};

    schedule.forEach(cls => {
      const ringId  = pickRingId(cls);
      const groupId = pickGroupId(cls);
      const classId = pickClassId(cls);
      if (!ringId || !groupId || !classId) return;

      if (!groups[ringId]) groups[ringId] = {};
      if (!groups[ringId][groupId]) {
        groups[ringId][groupId] = {
          group_name: pickGroupName(cls),
          rows: []
        };
      }

      const classEntries = entriesByClass[classId] || [];
      if (!classEntries.length) return;

      const time = pickTime(cls);
      const class_name = pickClassName(cls);

      classEntries.forEach(ent => {
        const horseId = pickEntryHorse(ent);
        const horseObj = horseById[horseId] || null;

        groups[ringId][groupId].rows.push({
          ring_id: ringId,
          group_id: groupId,
          time,
          class_name,
          group_name: pickGroupName(cls),
          horse: horseId,
          horse_name:
            normStr(horseObj?.horse_name) ||
            normStr(horseObj?.name) ||
            "",
          order: pickOrder(ent)
        });
      });
    });

    // Flatten in a stable order: ring -> group -> rows
    const out = [];

    const ringIds = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    ringIds.forEach(ringId => {
      const ringName =
        normStr(ringById[ringId]?.ring_name) ||
        normStr(ringById[ringId]?.name) ||
        `Ring ${ringId}`;

      const groupMap = groups[ringId];
      const groupIds = Object.keys(groupMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      groupIds.forEach(gid => {
        const g = groupMap[gid];

        // Sort within group: time then order then horse
        g.rows.sort((x, y) => {
          const t = x.time.localeCompare(y.time, undefined, { numeric: true });
          if (t) return t;
          const o = x.order.localeCompare(y.order, undefined, { numeric: true });
          if (o) return o;
          return x.horse.localeCompare(y.horse, undefined, { numeric: true });
        });

        g.rows.forEach(r => {
          out.push({
            ring_name: ringName,
            group_name: g.group_name,
            time: r.time,
            order: r.order,
            horse: r.horse,
            horse_name: r.horse_name,
            class_name: r.class_name
          });
        });
      });
    });

    write("trainer_rows", out);
    console.log("[CRT] trainer_rows derived", out.length);
    return out;
  };
})();
