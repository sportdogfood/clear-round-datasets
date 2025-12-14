// trainer-derive.js
// Derives trainer-ready rows from sessionStorage raw datasets
// Writes: sessionStorage.trainer_rows
// NO DOM. NO FETCH. NO EXPORTS.

(() => {
  const OUT_KEY = "trainer_rows";

  function read(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function write(key, val) {
    try {
      sessionStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error("[CRT] failed to write", key, e);
    }
  }

  function norm(s) {
    return (s == null ? "" : String(s)).toLowerCase();
  }

  function numOrInf(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }

  function derive() {
    const schedule = read("schedule") || [];
    const entries = read("entries") || [];
    const horses = read("horses") || [];
    const rings = read("rings") || [];

    const ringNameById = {};
    for (const r of rings) {
      const id = r?.ring_id ?? r?.ring ?? r?.id;
      if (id == null) continue;
      const name = r?.ring_name ?? r?.name ?? r?.label;
      ringNameById[String(id)] = name ? String(name) : String(id);
    }

    const horseLabelById = {};
    for (const h of horses) {
      const id = h?.horse ?? h?.horse_id ?? h?.id;
      if (id == null) continue;
      const label =
        h?.horse_name ??
        h?.name ??
        h?.display_name ??
        h?.horse_label ??
        h?.label ??
        null;
      horseLabelById[String(id)] = label ? String(label) : String(id);
    }

    const entriesByClass = {};
    for (const e of entries) {
      const cid = e?.class_id ?? e?.class ?? e?.classid ?? e?.classId ?? e?.classID;
      if (cid == null) continue;
      const k = String(cid);
      if (!entriesByClass[k]) entriesByClass[k] = [];
      entriesByClass[k].push(e);
    }

    const rows = [];

    for (const cls of schedule) {
      const classId = cls?.class_id ?? cls?.classid ?? cls?.classId ?? cls?.id;
      if (classId == null) continue;

      const classKey = String(classId);
      const classEntries = entriesByClass[classKey] || [];
      if (!classEntries.length) continue;

      const ringIdRaw = cls?.ring ?? cls?.ring_id ?? cls?.ringid ?? cls?.ringId;
      const ringId = ringIdRaw == null ? "" : String(ringIdRaw);
      const ringName = ringId ? (ringNameById[ringId] || ringId) : "Unassigned";

      const groupKeyRaw =
        cls?.class_group_id ??
        cls?.class_groupxclasses_id ??
        cls?.class_group ??
        cls?.group_id ??
        classId;

      const groupKey = groupKeyRaw == null ? classKey : String(groupKeyRaw);

      const groupName =
        cls?.class_group_name ??
        cls?.group_name ??
        cls?.class_name ??
        cls?.name ??
        "Class";

      const className = cls?.class_name ?? cls?.name ?? "";

      const time =
        cls?.estimated_start_time ??
        cls?.start_time_default ??
        cls?.estimated_go_time ??
        cls?.time ??
        "";

      for (const ent of classEntries) {
        const horseIdRaw =
          ent?.horse ?? ent?.horse_id ?? ent?.horseid ?? ent?.horseId ?? "";
        const horseId = horseIdRaw == null ? "" : String(horseIdRaw);
        const horseLabel = horseId ? (horseLabelById[horseId] || horseId) : "";

        const order =
          ent?.order_of_go ??
          ent?.order ??
          ent?.oog ??
          ent?.go_order ??
          "";

        rows.push({
          ring_id: ringId,
          ring_name: ringName,
          class_id: classKey,
          class_group_key: groupKey,
          class_group_name: String(groupName),
          class_name: String(className),
          time: time == null ? "" : String(time),
          order: order == null ? "" : String(order),
          horse_id: horseId,
          horse_label: horseLabel
        });
      }
    }

    rows.sort((a, b) => {
      const r = norm(a.ring_name).localeCompare(norm(b.ring_name));
      if (r) return r;

      const g = norm(a.class_group_name).localeCompare(norm(b.class_group_name));
      if (g) return g;

      const t = norm(a.time).localeCompare(norm(b.time));
      if (t) return t;

      const o = numOrInf(a.order) - numOrInf(b.order);
      if (o) return o;

      return norm(a.horse_label).localeCompare(norm(b.horse_label));
    });

    write(OUT_KEY, rows);
    return rows;
  }

  // expose for session-start flow
  window.CRT_trainerDerive = derive;

  // safe to run once on load (will re-run on Trainer click)
  try {
    derive();
  } catch (e) {
    console.error("[CRT] trainer derive error", e);
  }
})();
