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
      console.error("[CRT] write failed", key, e);
    }
  }

  function asArray(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (Array.isArray(x.items)) return x.items;
    if (Array.isArray(x.values)) return x.values;

    // Rows table-ish shapes (defensive)
    if (x.data && Array.isArray(x.data.rows)) {
      // if cells, map to objects is unknown; return rows as-is if already objects
      const first = x.data.rows[0];
      if (first && typeof first === "object" && !Array.isArray(first)) return x.data.rows;
      if (first && Array.isArray(first.cells)) {
        return x.data.rows.map(r => (Array.isArray(r.cells) ? r.cells.map(c => c.value) : []));
      }
    }
    return [];
  }

  function s(v) {
    return v == null ? "" : String(v).trim();
  }

  function pickClassId(obj) {
    if (!obj || typeof obj !== "object") return "";
    return s(
      obj.class_id ??
        obj.classid ??
        obj.classId ??
        obj.classID ??
        obj.id ??
        obj.class ??
        (obj.class && (obj.class.class_id ?? obj.class.id)) ??
        obj.class_ref ??
        obj.class_uid
    );
  }

  function pickRingId(obj) {
    if (!obj || typeof obj !== "object") return "";
    return s(
      obj.ring_id ??
        obj.ringid ??
        obj.ringId ??
        obj.ring ??
        (obj.ring && (obj.ring.ring_id ?? obj.ring.id)) ??
        obj.ring_ref ??
        obj.ring_uid
    );
  }

  function pickRingName(r) {
    if (!r || typeof r !== "object") return "";
    return s(r.ring_name ?? r.name ?? r.label ?? r.title);
  }

  function pickHorseId(obj) {
    if (!obj || typeof obj !== "object") return "";
    return s(
      obj.horse_id ??
        obj.horseid ??
        obj.horseId ??
        obj.horse ??
        (obj.horse && (obj.horse.horse_id ?? obj.horse.id)) ??
        obj.horse_ref ??
        obj.horse_uid
    );
  }

  function pickHorseLabel(h) {
    if (!h || typeof h !== "object") return "";
    return s(h.horse_name ?? h.name ?? h.display_name ?? h.label ?? h.horse_label ?? h.horse);
  }

  function pickGroupKey(cls) {
    if (!cls || typeof cls !== "object") return "";
    return s(
      cls.class_group_id ??
        cls.class_groupxclasses_id ??
        cls.class_group ??
        cls.group_id ??
        cls.group ??
        cls.group_key ??
        cls.group_uid ??
        pickClassId(cls)
    );
  }

  function pickGroupName(cls) {
    if (!cls || typeof cls !== "object") return "";
    return s(
      cls.class_group_name ??
        cls.group_name ??
        cls.class_name ??
        cls.name ??
        cls.title ??
        "Class"
    );
  }

  function pickClassName(cls) {
    if (!cls || typeof cls !== "object") return "";
    return s(cls.class_name ?? cls.name ?? cls.title ?? "");
  }

  function pickTime(cls) {
    if (!cls || typeof cls !== "object") return "";
    return s(
      cls.estimated_start_time ??
        cls.start_time_default ??
        cls.estimated_go_time ??
        cls.time ??
        cls.go_time ??
        ""
    );
  }

  function pickOrder(ent) {
    if (!ent || typeof ent !== "object") return "";
    const v =
      ent.order_of_go ??
      ent.order ??
      ent.oog ??
      ent.go_order ??
      ent.order_num ??
      "";
    return s(v);
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

    const ringNameById = {};
    for (const r of rings) {
      // rings might be objects or 2-col arrays; handle both
      if (Array.isArray(r)) continue;
      const id = s(r?.ring_id ?? r?.ring ?? r?.id);
      if (!id) continue;
      const nm = pickRingName(r) || id;
      ringNameById[id] = nm;
    }

    const horseLabelById = {};
    for (const h of horses) {
      if (Array.isArray(h)) continue;
      const id = s(h?.horse ?? h?.horse_id ?? h?.id);
      if (!id) continue;
      horseLabelById[id] = pickHorseLabel(h) || id;
    }

    const entriesByClass = {};
    for (const e of entries) {
      if (!e || Array.isArray(e)) continue;
      const cid = pickClassId(e);
      if (!cid) continue;
      if (!entriesByClass[cid]) entriesByClass[cid] = [];
      entriesByClass[cid].push(e);
    }

    const rows = [];

    for (const cls of schedule) {
      if (!cls || Array.isArray(cls)) continue;

      const classId = pickClassId(cls);
      if (!classId) continue;

      const classEntries = entriesByClass[classId] || [];
      if (!classEntries.length) continue;

      const ringId = pickRingId(cls);
      const ringName = ringId ? (ringNameById[ringId] || ringId) : "Unassigned";

      const groupKey = pickGroupKey(cls) || classId;
      const groupName = pickGroupName(cls);
      const className = pickClassName(cls);
      const time = pickTime(cls);

      for (const ent of classEntries) {
        const horseId = pickHorseId(ent);
        const horseLabel = horseId ? (horseLabelById[horseId] || horseId) : s(ent?.horse_label ?? ent?.horse_name ?? ent?.horse ?? "");
        const order = pickOrder(ent);

        rows.push({
          ring_id: ringId,
          ring_name: ringName,

          class_id: classId,
          class_group_key: groupKey,
          class_group_name: groupName,
          class_name: className,

          time,
          order,

          horse_id: horseId,
          horse_label: horseLabel
        });
      }
    }

    // stable sort
    rows.sort((a, b) => {
      const ar = (a.ring_name || "").toLowerCase();
      const br = (b.ring_name || "").toLowerCase();
      if (ar < br) return -1;
      if (ar > br) return 1;

      const ag = (a.class_group_name || "").toLowerCase();
      const bg = (b.class_group_name || "").toLowerCase();
      if (ag < bg) return -1;
      if (ag > bg) return 1;

      const at = (a.time || "").toLowerCase();
      const bt = (b.time || "").toLowerCase();
      if (at < bt) return -1;
      if (at > bt) return 1;

      const ao = Number(a.order);
      const bo = Number(b.order);
      const aok = Number.isFinite(ao) ? ao : 1e18;
      const bok = Number.isFinite(bo) ? bo : 1e18;
      if (aok !== bok) return aok - bok;

      const ah = (a.horse_label || "").toLowerCase();
      const bh = (b.horse_label || "").toLowerCase();
      if (ah < bh) return -1;
      if (ah > bh) return 1;
      return 0;
    });

    write(OUT_KEY, rows);
    console.log("[CRT] trainer_rows derived", rows.length);
    return rows;
  }

  window.CRT_trainerDerive = derive;

  try {
    derive();
  } catch (e) {
    console.error("[CRT] trainer derive error", e);
    write(OUT_KEY, []);
  }
})();
