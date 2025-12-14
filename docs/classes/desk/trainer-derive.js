// File: docs/classes/desk/trainer-derive.js
// Reads sessionStorage: schedule, entries, horses, rings
// Writes sessionStorage: trainer_rows
// Exposes: window.CRT_deriveTrainer()
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

  function write(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function asArray(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (Array.isArray(x.items)) return x.items;
    if (Array.isArray(x.values)) return x.values;
    if (Array.isArray(x.rows)) return x.rows;
    if (x.data && Array.isArray(x.data.rows)) return x.data.rows;
    return [];
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] != null && obj[k] !== "") return obj[k];
    }
    return null;
  }

  function toStr(v) {
    if (v == null) return "";
    return String(v).trim();
  }

  function derive() {
    const scheduleRaw = read("schedule");
    const entriesRaw = read("entries");
    const horsesRaw = read("horses");
    const ringsRaw = read("rings");

    const schedule = asArray(scheduleRaw);
    const entries = asArray(entriesRaw);
    const horses = asArray(horsesRaw);
    const rings = asArray(ringsRaw);

    const ringById = {};
    for (const r of rings) {
      const rid = toStr(pick(r, ["ring_id", "ringId", "ring", "id"]));
      if (!rid) continue;
      ringById[rid] = r;
    }

    const horseById = {};
    for (const h of horses) {
      const hid = toStr(pick(h, ["horse_id", "horseId", "horse", "id"]));
      if (!hid) continue;
      horseById[hid] = h;
    }

    const entriesByClass = {};
    for (const e of entries) {
      const cid = toStr(pick(e, ["class_id", "classId", "class", "classid", "id"]));
      if (!cid) continue;
      if (!entriesByClass[cid]) entriesByClass[cid] = [];
      entriesByClass[cid].push(e);
    }

    function horseLabel(ent) {
      const raw = pick(ent, ["horse", "horse_name", "horseName", "horse_id", "horseId"]);
      const id = toStr(raw);
      if (id && horseById[id]) {
        const h = horseById[id];
        return (
          toStr(pick(h, ["horse_name", "horseName", "name"])) ||
          toStr(pick(h, ["horse"])) ||
          id
        );
      }
      return toStr(raw) || "";
    }

    function timeLabel(cls) {
      return (
        toStr(pick(cls, ["estimated_start_time", "start_time_default", "estimated_go_time", "start_time"])) ||
        ""
      );
    }

    function ringName(cls) {
      const rid = toStr(pick(cls, ["ring_id", "ringId", "ring"]));
      if (rid && ringById[rid]) {
        return toStr(pick(ringById[rid], ["ring_name", "ringName", "name"])) || `Ring ${rid}`;
      }
      return rid ? `Ring ${rid}` : "Unassigned";
    }

    function groupId(cls) {
      return toStr(pick(cls, ["class_group_id", "class_groupxclasses_id", "group_id", "groupId"])) || "";
    }

    function groupName(cls) {
      return (
        toStr(pick(cls, ["class_group_name", "group_name", "class_name", "name"])) ||
        "Class Group"
      );
    }

    function className(cls) {
      return toStr(pick(cls, ["class_name", "name"])) || "";
    }

    function orderOfGo(ent) {
      const v = pick(ent, ["order_of_go", "order", "oog"]);
      const s = toStr(v);
      return s;
    }

    const rows = [];

    for (const cls of schedule) {
      const cid = toStr(pick(cls, ["class_id", "classId", "class", "classid", "id"]));
      if (!cid) continue;

      const classEntries = entriesByClass[cid] || [];
      if (!classEntries.length) continue;

      const ring = ringName(cls);
      const rid = toStr(pick(cls, ["ring_id", "ringId", "ring"])) || "";
      const gid = groupId(cls);
      const gname = groupName(cls);
      const cname = className(cls);
      const t = timeLabel(cls);

      for (const ent of classEntries) {
        rows.push({
          ring_id: rid,
          ring_name: ring,
          group_id: gid,
          group_name: gname,
          class_id: cid,
          class_name: cname,
          time: t,
          order: orderOfGo(ent),
          horse: horseLabel(ent)
        });
      }
    }

    // sort for stable output
    rows.sort((a, b) => {
      const ar = a.ring_name.localeCompare(b.ring_name);
      if (ar) return ar;
      const ag = a.group_name.localeCompare(b.group_name);
      if (ag) return ag;
      const at = a.time.localeCompare(b.time);
      if (at) return at;
      const ao = (a.order || "").localeCompare(b.order || "");
      if (ao) return ao;
      return (a.horse || "").localeCompare(b.horse || "");
    });

    write("trainer_rows", rows);
    console.log("[CRT] trainer_rows derived", rows.length);
    return rows.length;
  }

  window.CRT_deriveTrainer = derive;

  // derive immediately only if a session is already active
  try {
    const meta = read("_crt_meta");
    if (meta && meta.active) derive();
  } catch {}
})();
