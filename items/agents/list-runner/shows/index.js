#!/usr/bin/env node
/**
 * shows/index.js
 * Build index fields for shows/show_schedule.json without changing show records.
 *
 * - Input:  shows/show_schedule.json
 *   { "shows": [ { show_id, start_date, ... }, ... ] }
 *
 * - Output: shows/show_schedule.json
 *   {
 *     "version": "1.0",
 *     "shows": [ ...original objects, unchanged order... ],
 *     "by_week_start": {
 *       "<YYYY-MM-DD>": [show_id, ...],
 *       ...
 *     }
 *   }
 *
 * Week start = Monday (UTC) of each show's start_date.
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SCHEDULE_PATH = path.join(ROOT, "show_schedule.json");

/** Read JSON or fail hard (this is a build-time script). */
function readJson(p) {
  const txt = fs.readFileSync(p, "utf8");
  return JSON.parse(txt);
}

/** Write JSON with trailing newline. */
function writeJson(p, obj) {
  const out = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, out, "utf8");
}

/** Given ISO date/time string, return Monday week start (YYYY-MM-DD) in UTC. */
function weekStartFromISO(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // 0 if Monday, 1 if Tue, ... 6 if Sun
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function buildShowsIndex() {
  const data = readJson(SCHEDULE_PATH);

  if (!data || !Array.isArray(data.shows)) {
    throw new Error("show_schedule.json must contain a 'shows' array");
  }

  const shows = data.shows;
  const by_week_start = {};

  for (const show of shows) {
    const id = show.show_id;
    const start = show.start_date;

    if (id == null || !start) continue;

    const ws = weekStartFromISO(start);
    if (!ws) continue;

    if (!by_week_start[ws]) by_week_start[ws] = [];
    by_week_start[ws].push(id);
  }

  // Optionally keep IDs sorted for determinism
  for (const k of Object.keys(by_week_start)) {
    by_week_start[k].sort((a, b) => {
      if (typeof a === "number" && typeof b === "number") return a - b;
      return String(a).localeCompare(String(b));
    });
  }

  const out = {
    version: data.version || "1.0",
    shows, // unchanged
    by_week_start
  };

  writeJson(SCHEDULE_PATH, out);
  console.log("shows/show_schedule.json indexed (by_week_start updated).");
}

if (require.main === module) {
  try {
    buildShowsIndex();
  } catch (e) {
    console.error("shows index build failed:", e.message);
    process.exit(1);
  }
}

module.exports = { buildShowsIndex };
