// trainer-derive.js
// CRT Desk — Trainer Derive (robust join + logs)
// Writes: sessionStorage.trainer_rows + sessionStorage._trainer_meta
// NO DOM. NO FETCH. NO EXPORTS.
//
// Version: v2025-12-14T14:40ET

(() => {
  const OUT_KEY = "trainer_rows";
  const META_KEY = "_trainer_meta";

  const CAND_CLASS = ["class_id","classid","class","classId","classID","class_num","class_number","classid_num"];
  const CAND_RING  = ["ring_id","ringid","ring","ringId","ringID","ring_num","ring_number"];
  const CAND_GROUP = ["class_group_id","class_groupxclasses_id","class_group","group_id","groupid","class_group_id_num"];
  const CAND_TIME  = ["estimated_start_time","start_time_default","estimated_go_time","go_time","time","start_time","start_time_est"];
  const CAND_CNAME = ["class_name","class","classTitle","name","class_label"];
  const CAND_ORDER = ["order_of_go","order","oog","go_order","order_num"];

  const CAND_HORSE_IN_ENTRY = ["horse_name","horse","horse_id","horseid","horseId","horseID","horse_label"];
  const CAND_HORSE_ID_IN_HORSES = ["horse_id","horse","id","horseid","horseId","horseID"];
  const CAND_HORSE_NAME_IN_HORSES = ["horse_name","name","horse","horse_label","horseTitle"];

  const CAND_RING_ID_IN_RINGS = ["ring_id","ring","id","ringid","ringId","ringID"];
  const CAND_RING_NAME_IN_RINGS = ["ring_name","name","ring","ring_label","ringTitle"];

  function readJson(key) {
    try {
      const v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, obj) {
    try { sessionStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  function keysOfFirst(arr) {
    if (!Array.isArray(arr) || !arr.length || typeof arr[0] !== "object" || !arr[0]) return [];
    return Object.keys(arr[0]);
  }

  function pickKey(sampleKeys, candidates) {
    const set = new Set(sampleKeys);
    for (const c of candidates) if (set.has(c)) return c;
    return null;
  }

  function normId(v) {
    if (v == null) return "";
    const s = String(v).trim();
    return s;
  }

  function isLikelyId(v) {
    if (v == null) return false;
    const s = String(v).trim();
    if (!s) return false;
    // numbers or short tokens treated as ids
    return /^[0-9]+$/.test(s) || /^[0-9]+-[0-9a-z]+$/i.test(s);
  }

  function safeText(v) {
    if (v == null) return "";
    return String(v).trim();
  }

  function deriveStatus(cls) {
    // keep simple + non-breaking: only uses presence of live_data later if you want
    const t = safeText(getField(cls, CAND_TIME));
    if (!t) return "upcoming";
    return "scheduled";
  }

  function getField(obj, candidates) {
    if (!obj || typeof obj !== "object") return null;
    for (const k of candidates) {
      if (obj[k] != null && obj[k] !== "") return obj[k];
    }
    return null;
  }

  // -------------------------
  // Load raw datasets
  // -------------------------
  const schedule = readJson("schedule") || [];
  const entries  = readJson("entries") || [];
  const horses   = readJson("horses") || [];
  const rings    = readJson("rings") || [];

  // -------------------------
  // Auto-detect join keys
  // -------------------------
  const scheduleKeys = keysOfFirst(schedule);
  const entryKeys    = keysOfFirst(entries);
  const horseKeys    = keysOfFirst(horses);
  const ringKeys     = keysOfFirst(rings);

  const schClassKey = pickKey(scheduleKeys, CAND_CLASS);
  const entClassKey = pickKey(entryKeys,    CAND_CLASS);

  const schRingKey  = pickKey(scheduleKeys, CAND_RING);
  const schGroupKey = pickKey(scheduleKeys, CAND_GROUP);

  const ringIdKey   = pickKey(ringKeys,  CAND_RING_ID_IN_RINGS);
  const ringNameKey = pickKey(ringKeys,  CAND_RING_NAME_IN_RINGS);

  const horseIdKey  = pickKey(horseKeys, CAND_HORSE_ID_IN_HORSES);
  const horseNameKey= pickKey(horseKeys, CAND_HORSE_NAME_IN_HORSES);

  // -------------------------
  // Build lookups
  // -------------------------
  const ringNameById = {};
  if (ringIdKey) {
    for (const r of rings) {
      const rid = normId(r?.[ringIdKey]);
      if (!rid) continue;
      const rn = ringNameKey ? safeText(r?.[ringNameKey]) : "";
      ringNameById[rid] = rn || `Ring ${rid}`;
    }
  }

  const horseNameById = {};
  if (horseIdKey) {
    for (const h of horses) {
      const hid = normId(h?.[horseIdKey]);
      if (!hid) continue;
      const hn = horseNameKey ? safeText(h?.[horseNameKey]) : "";
      horseNameById[hid] = hn || `Horse ${hid}`;
    }
  }

  const entriesByClass = {};
  if (entClassKey) {
    for (const e of entries) {
      const cid = normId(e?.[entClassKey]);
      if (!cid) continue;
      (entriesByClass[cid] ||= []).push(e);
    }
  }

  // -------------------------
  // Derive trainer rows
  // -------------------------
  const rows = [];

  for (const cls of schedule) {
    const classId = schClassKey ? normId(cls?.[schClassKey]) : "";
    const className = safeText(getField(cls, CAND_CNAME)) || (classId ? `Class ${classId}` : "Class");
    const time = safeText(getField(cls, CAND_TIME));
    const status = deriveStatus(cls);

    // ring label
    const ringId = schRingKey ? normId(cls?.[schRingKey]) : "";
    const ringName =
      (ringId && ringNameById[ringId]) ||
      safeText(cls?.ring_name) ||
      (ringId ? `Ring ${ringId}` : "Unassigned");

    // group label
    const groupId = schGroupKey ? normId(cls?.[schGroupKey]) : "";
    const groupName =
      safeText(cls?.class_group_name) ||
      safeText(cls?.group_name) ||
      className;

    const classEntries = (classId && entriesByClass[classId]) ? entriesByClass[classId] : [];

    // If there are entries, expand them; else still include a row (so you never get 0 just because entries mismatch)
    if (classEntries.length) {
      for (const ent of classEntries) {
        const rawHorse = getField(ent, CAND_HORSE_IN_ENTRY);
        const horse =
          (!isLikelyId(rawHorse) ? safeText(rawHorse) : "") ||
          (isLikelyId(rawHorse) ? (horseNameById[normId(rawHorse)] || safeText(rawHorse)) : "") ||
          "";

        const order = getField(ent, CAND_ORDER);
        rows.push({
          ring_id: ringId || null,
          ring_name: ringName,
          group_id: groupId || null,
          class_id: classId || null,
          class_group_name: groupName,
          class_name: className,
          time,
          status,
          order_of_go: order ?? "",
          horse
        });
      }
    } else {
      rows.push({
        ring_id: ringId || null,
        ring_name: ringName,
        group_id: groupId || null,
        class_id: classId || null,
        class_group_name: groupName,
        class_name: className,
        time,
        status,
        order_of_go: "",
        horse: ""
      });
    }
  }

  // stable sort (ring -> group -> time -> order)
  rows.sort((a, b) => {
    const ra = safeText(a.ring_name), rb = safeText(b.ring_name);
    if (ra !== rb) return ra.localeCompare(rb);

    const ga = safeText(a.class_group_name), gb = safeText(b.class_group_name);
    if (ga !== gb) return ga.localeCompare(gb);

    const ta = safeText(a.time), tb = safeText(b.time);
    if (ta !== tb) return ta.localeCompare(tb);

    const oa = safeText(a.order_of_go), ob = safeText(b.order_of_go);
    return oa.localeCompare(ob);
  });

  writeJson(OUT_KEY, rows);

  writeJson(META_KEY, {
    derived_at: new Date().toISOString(),
    counts: {
      schedule: schedule.length,
      entries: entries.length,
      horses: horses.length,
      rings: rings.length,
      trainer_rows: rows.length
    },
    detected_keys: {
      schedule: { class: schClassKey, ring: schRingKey, group: schGroupKey },
      entries: { class: entClassKey },
      horses: { id: horseIdKey, name: horseNameKey },
      rings: { id: ringIdKey, name: ringNameKey }
    },
    first_keys: {
      schedule: scheduleKeys,
      entries: entryKeys,
      horses: horseKeys,
      rings: ringKeys
    }
  });

  console.log("[CRT] trainer_rows derived", rows.length, "meta:", readJson(META_KEY));
})();
