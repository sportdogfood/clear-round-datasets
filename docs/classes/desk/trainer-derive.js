// File: trainer-derive.js
// Purpose: Assemble Trainer Report data (implementation-only, no UI)
// Scope: Desktop trainer reports
// Version: v2025-12-14-01
// Notes:
// - Pulls Rows datasets
// - Normalizes + joins
// - Derives status + notification booleans
// - Emits trainer-data-shape JSON only

/* =========================
   CONFIG
========================= */

const ROWS_API_BASE = "https://api.rows.com/v1";
const ROWS_API_KEY = window.CRT_ROWS_API_KEY; // required

const DATASETS = {
  schedule: { sheet: "SCHEDULE_SHEET_ID", table: "SCHEDULE_TABLE_ID", range: "A2:Z" },
  entries: { sheet: "ENTRIES_SHEET_ID", table: "ENTRIES_TABLE_ID", range: "A2:Z" },
  ringHelper: { sheet: "RING_SHEET_ID", table: "RING_TABLE_ID", range: "A2:Z" },
  horseRoster: { sheet: "HORSE_SHEET_ID", table: "HORSE_TABLE_ID", range: "A2:Z" },
  liveData: { sheet: "LIVE_SHEET_ID", table: "LIVE_TABLE_ID", range: "A2:Z" }
};

/* =========================
   FETCH HELPERS
========================= */

async function fetchRowsDataset({ sheet, table, range }) {
  const url = `${ROWS_API_BASE}/spreadsheets/${sheet}/tables/${table}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ROWS_API_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`Rows fetch failed: ${url}`);
  const data = await res.json();
  return data.values || data.items || [];
}

/* =========================
   TIME / STATUS HELPERS
========================= */

function nowTs() {
  return new Date();
}

function parseTime(baseDate, timeStr) {
  if (!timeStr) return null;
  const [h, m, s] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h || 0, m || 0, s || 0, 0);
  return d;
}

function deriveStatus({ start, end, go }) {
  const now = nowTs();
  if (end && now > end) return "completed";
  if (start && now >= start && (!end || now <= end)) return "live";
  return "upcoming";
}

function notifFlags(targetTime, minutes) {
  if (!targetTime) return false;
  const diff = (targetTime - nowTs()) / 60000;
  return diff <= minutes && diff > 0;
}

/* =========================
   CORE DERIVE
========================= */

export async function deriveTrainerData() {
  const [schedule, entries, rings, horses, live] = await Promise.all([
    fetchRowsDataset(DATASETS.schedule),
    fetchRowsDataset(DATASETS.entries),
    fetchRowsDataset(DATASETS.ringHelper),
    fetchRowsDataset(DATASETS.horseRoster),
    fetchRowsDataset(DATASETS.liveData)
  ]);

  const today = new Date();

  const scheduleIndex = Object.create(null);
  schedule.forEach((row) => {
    scheduleIndex[row.class_id] = row;
  });

  const horseIndex = Object.create(null);
  horses.forEach((h) => {
    horseIndex[h.horse_id] = h;
  });

  const output = {
    generated_at: new Date().toISOString(),
    freshness_minutes: 10,
    rings: []
  };

  entries.forEach((entry) => {
    const sched = scheduleIndex[entry.class_id];
    if (!sched) return;

    const start = parseTime(today, sched.estimated_start_time || sched.start_time_default);
    const end = parseTime(today, sched.estimated_end_time);
    const go = parseTime(today, entry.estimated_go_time);

    const status = deriveStatus({ start, end, go });

    const record = {
      time: sched.estimated_start_time || sched.start_time_default,
      ring: entry.ring,
      horse: horseIndex[entry.horse_id]?.horse_name || entry.horse_name,
      class_name: sched.class_name,
      class_group: sched.group_name || null,
      class_count: (sched.class_list || "").split(",").filter(Boolean).length || 1,
      number: sched.class_number,
      class_type: sched.class_type,
      warmup_class: !!sched.warmup_class,
      schedule_sequencetype: sched.schedule_sequencetype,
      total_trips: sched.total_trips,
      group_has_warmup: !!sched.group_has_warmup,
      order_of_go: entry.order_of_go,
      is_morning: start ? start.getHours() < 12 : false,
      estimated_go_time: entry.estimated_go_time || null,
      status,
      notifications: {
        class_notif30: notifFlags(start, 30),
        class_notif60: notifFlags(start, 60),
        go_notif30: notifFlags(go, 30),
        go_notif60: notifFlags(go, 60),
        check_live: status === "upcoming" && end && nowTs() >= end,
        live_notifNow: status === "live",
        completed_notifDone: status === "completed"
      }
    };

    output.rings.push(record);
  });

  return output;
}

/* =========================
   END FILE
========================= */
