// trainer-derive.js
// Defines: window.CRT_trainerDerive()
// - Reads raw datasets from sessionStorage
// - Writes: sessionStorage.trainer_rows
// - NO DOM. NO FETCH. NO EXPORTS.

(() => {
  function ssGet(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function pick(obj, keys) {
    if (!obj) return null;
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return null;
  }

  function normId(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  }

  function buildIndex(arr, idKeys) {
    const m = {};
    (arr || []).forEach(o => {
      const id = normId(pick(o, idKeys));
      if (!id) return;
      m[id] = o;
    });
    return m;
  }

  function groupBy(arr, keyFn) {
    const m = {};
    (arr || []).forEach(o => {
      const k = keyFn(o);
      if (!k) return;
      if (!m[k]) m[k] = [];
      m[k].push(o);
    });
    return m;
  }

  function timeStr(cls) {
    return (
      pick(cls, ["estimated_start_time", "start_time_default", "estimated_go_time", "start_time", "time"]) ||
      ""
    );
  }

  function className(cls) {
    return pick(cls, ["class_name", "name", "class", "title"]) || "";
  }

  function groupName(cls) {
    return (
      pick(cls, ["class_group_name", "group_name", "class_group", "group"]) ||
      className(cls) ||
      "Class"
    );
  }

  window.CRT_trainerDerive = function CRT_trainerDerive() {
    const schedule = ssGet("schedule") || [];
    const entries = ssGet("entries") || [];
    const horses = ssGet("horses") || [];
    const rings = ssGet("rings") || [];

    const ringById = buildIndex(rings, ["ring_id", "ring", "id"]);
    const horseById = buildIndex(horses, ["horse_id", "horse", "id"]);

    // entries grouped by class_id (normalize to string)
    const entriesByClass = groupBy(entries, (e) => {
      return normId(pick(e, ["class_id", "classid", "class", "classId", "classID", "id"]));
    });

    const rows = [];

    schedule.forEach(cls => {
      const clsId = normId(pick(cls, ["class_id", "classid", "class", "classId", "classID", "id"]));
      if (!clsId) return;

      const entList = entriesByClass[clsId] || [];
      if (!entList.length) return;

      const ringId = normId(pick(cls, ["ring_id", "ring", "ringId", "ringID"]));
      const ringName =
        (ringId && (pick(ringById[ringId], ["ring_name", "name"]) || null)) ||
        ringId ||
        "Unassigned";

      const clsName = className(cls);
      const grpName = groupName(cls);
      const t = timeStr(cls);

      entList.forEach(ent => {
        const horseId = normId(pick(ent, ["horse_id", "horse", "horseId", "horseID"]));
        const horseRec = horseId ? horseById[horseId] : null;

        const horseName =
          pick(ent, ["horse_name", "horseName", "horse_display", "horseDisplay"]) ||
          pick(horseRec, ["horse_name", "name", "horse"]) ||
          horseId ||
          "";

        rows.push({
          ring_name: ringName,
          group_name: grpName,
          time: t,
          horse: horseName,
          class_name: clsName
        });
      });
    });

    // stable sort for rendering
    rows.sort((a, b) => {
      const ar = (a.ring_name || "").localeCompare(b.ring_name || "");
      if (ar) return ar;
      const ag = (a.group_name || "").localeCompare(b.group_name || "");
      if (ag) return ag;
      const at = (a.time || "").localeCompare(b.time || "");
      if (at) return at;
      return (a.horse || "").localeCompare(b.horse || "");
    });

    try {
      sessionStorage.setItem("trainer_rows", JSON.stringify(rows));
    } catch {}

    console.log("[CRT] trainer_rows derived", rows.length, {
      schedule: schedule.length,
      entries: entries.length,
      horses: horses.length,
      rings: rings.length
    });

    return rows;
  };
})();
