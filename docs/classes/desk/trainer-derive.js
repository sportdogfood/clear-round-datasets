// trainer-derive.js
// Derives trainer-ready rows from sessionStorage raw datasets
// Writes: sessionStorage.trainer_rows
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

  const schedule = read("schedule") || [];
  const entries = read("entries") || [];
  const horses = read("horses") || [];
  const rings = read("rings") || [];

  const horseById = {};
  horses.forEach(h => {
    if (h.horse) horseById[h.horse] = h;
  });

  const ringById = {};
  rings.forEach(r => {
    if (r.ring_id) ringById[r.ring_id] = r;
  });

  const entriesByClass = {};
  entries.forEach(e => {
    if (!e.class_id) return;
    if (!entriesByClass[e.class_id]) entriesByClass[e.class_id] = [];
    entriesByClass[e.class_id].push(e);
  });

  function deriveStatus(cls) {
    const now = Date.now();

    const start =
      Date.parse(`1970-01-01T${cls.estimated_start_time || cls.start_time_default || ""}Z`) ||
      null;

    const end =
      Date.parse(`1970-01-01T${cls.estimated_end_time || ""}Z`) || null;

    if (end && now > end) return "completed";
    if (start && now >= start) return "live";
    return "upcoming";
  }

  const rows = [];

  schedule.forEach(cls => {
    const classEntries = entriesByClass[cls.class_id] || [];
    if (!classEntries.length) return;

    const ring =
      ringById[cls.ring]?.ring_name ||
      cls.ring ||
      "Unassigned";

    const status = deriveStatus(cls);

    classEntries.forEach(ent => {
      rows.push({
        ring_name: ring,
        class_group_name: cls.class_name || "Class Group",
        class_name: cls.class_name || "",
        horse: ent.horse || "",
        time:
          cls.estimated_start_time ||
          cls.start_time_default ||
          cls.estimated_go_time ||
          "",
        status
      });
    });
  });

  sessionStorage.setItem("trainer_rows", JSON.stringify(rows));

  console.log("[CRT] trainer_rows derived", rows.length);
})();
