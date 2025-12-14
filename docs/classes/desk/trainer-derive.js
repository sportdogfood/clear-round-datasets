// trainer-derive.js
// ------------------------------------------------------------
// PURPOSE
// - Read raw datasets from sessionStorage
// - Derive trainer-ready rows
// - Write: sessionStorage.trainer_rows
//
// RULES
// - NO DOM
// - NO FETCH
// - NO EXPORTS
// - EMPTY > GUESS
// ------------------------------------------------------------

(() => {
  // ---------------------------
  // Helpers
  // ---------------------------
  function read(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function norm(v) {
    return v == null ? "" : String(v);
  }

  // ---------------------------
  // Load base datasets
  // ---------------------------
  const schedule = read("schedule") || [];
  const entries  = read("entries")  || [];
  const horses   = read("horses")   || [];
  const rings    = read("rings")    || [];

  // ---------------------------
  // Index lookups
  // ---------------------------
  const horseById = {};
  horses.forEach(h => {
    if (h && h.horse) horseById[h.horse] = h;
  });

  const ringById = {};
  rings.forEach(r => {
    if (r && r.ring_id) ringById[r.ring_id] = r;
  });

  const entriesByClass = {};
  entries.forEach(e => {
    if (!e || !e.class_id) return;
    if (!entriesByClass[e.class_id]) entriesByClass[e.class_id] = [];
    entriesByClass[e.class_id].push(e);
  });

  // ---------------------------
  // Status derivation (simple + safe)
  // ---------------------------
  function deriveStatus(cls) {
    const now = Date.now();

    const startStr =
      cls.estimated_start_time ||
      cls.start_time_default ||
      "";

    const endStr =
      cls.estimated_end_time ||
      "";

    const start = startStr
      ? Date.parse(`1970-01-01T${startStr}Z`)
      : null;

    const end = endStr
      ? Date.parse(`1970-01-01T${endStr}Z`)
      : null;

    if (end && now > end) return "completed";
    if (start && now >= start) return "live";
    return "upcoming";
  }

  // ---------------------------
  // Build trainer rows
  // ---------------------------
  const rows = [];

  schedule.forEach(cls => {
    if (!cls || !cls.class_id) return;

    const classEntries = entriesByClass[cls.class_id] || [];
    if (!classEntries.length) return;

    const ringName =
      ringById[cls.ring]?.ring_name ||
      norm(cls.ring) ||
      "Unassigned";

    const groupName =
      cls.class_group_name ||
      cls.class_group ||
      cls.class_name ||
      "Class Group";

    const time =
      cls.estimated_start_time ||
      cls.start_time_default ||
      cls.estimated_go_time ||
      "";

    const status = deriveStatus(cls);

    classEntries.forEach(ent => {
      const horseName =
        horseById[ent.horse]?.horse_name ||
        ent.horse ||
        "";

      rows.push({
        ring_name: ringName,
        class_group_name: norm(groupName),
        class_name: norm(cls.class_name),
        time: norm(time),
        horse: norm(horseName),
        order: ent.order_of_go ?? "",
        status
      });
    });
  });

  // ---------------------------
  // Sort for trainer usability
  // ---------------------------
  rows.sort((a, b) => {
    if (a.ring_name !== b.ring_name)
      return a.ring_name.localeCompare(b.ring_name);

    if (a.class_group_name !== b.class_group_name)
      return a.class_group_name.localeCompare(b.class_group_name);

    if (a.time !== b.time)
      return a.time.localeCompare(b.time);

    return (a.order || 0) - (b.order || 0);
  });

  // ---------------------------
  // Write output
  // ---------------------------
  sessionStorage.setItem("trainer_rows", JSON.stringify(rows));

  console.log("[CRT] trainer_rows ready", rows.length);
})();
