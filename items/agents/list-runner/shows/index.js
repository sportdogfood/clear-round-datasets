#!/usr/bin/env node
/**
 * shows/index.js
 *
 * Build indexes for shows/show_schedule.json without altering show records.
 *
 * Input:
 *   shows/show_schedule.json
 *   {
 *     "shows": [
 *       {
 *         "show_id": ...,
 *         "show_name": "2025 ESP Spring 2 (#233850)",
 *         "start_date": "2025-04-09T00:00:00.000Z",
 *         "end_date": "...",
 *         ...
 *       },
 *       ...
 *     ]
 *   }
 *
 * Output (same file):
 *   {
 *     "version": "1.1",
 *     "shows": [ ...unchanged... ],
 *     "by_week_start": {
 *       "<YYYY-MM-DD>": [show_id, ...],
 *       ...
 *     },
 *     "by_sanction": {
 *       "233850": [show_id, ...],
 *       "6880": [show_id, ...],
 *       "343029": [show_id, ...],
 *       ...
 *     }
 *   }
 *
 * Rules:
 * - Do not drop or rewrite any show fields.
 * - Week start = Monday (UTC) for each show's start_date.
 * - Sanction ids are parsed from show_name occurrences of "#<digits>".
 * - Both indexes use arrays (sanctions or weeks may map to multiple shows).
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SCHEDULE_PATH = path.join(ROOT, "show_schedule.json");

// Read JSON (fail hard, this is a build tool)
function readJson(p) {
  const txt = fs.readFileSync(p, "utf8");
  return JSON.parse(txt);
}

// Write JSON with trailing newline
function writeJson(p, obj) {
  const out = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, out, "utf8");
}

// Monday week start (YYYY-MM-DD) from ISO date/time (UTC-based)
function weekStartFromISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // 0 if Monday, 1 if Tue, ..., 6 if Sun
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

// Extract sanction ids from show_name occurrences of "#<digits>"
function extractSanctions(showName) {
  if (!showName || typeof showName !== "string") return [];
  const ids = [];
  const re = /#(\d{3,})/g;
  let m;
  while ((m = re.exec(showName)) !== null) {
    const id = m[1];
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function buildShowsIndex() {
  const data = readJson(SCHEDULE_PATH);

  if (!data || !Array.isArray(data.shows)) {
    throw new Error("show_schedule.json must contain a 'shows' array");
  }

  const shows = data.shows;
  const by_week_start = {};
  const by_sanction = {};

  for (const show of shows) {
    const showId = show.show_id;
    const start = show.start_date;

    // week_start index
    if (showId != null && start) {
      const ws = weekStartFromISO(start);
      if (ws) {
        if (!by_week_start[ws]) by_week_start[ws] = [];
        by_week_start[ws].push(showId);
      }
    }

    // sanction index from show_name
    const sanctions = extractSanctions(show.show_name);
    if (showId != null && sanctions.length) {
      for (const s of sanctions) {
        if (!by_sanction[s]) by_sanction[s] = [];
        by_sanction[s].push(showId);
      }
    }
  }

  // Deterministic ordering
  for (const key of Object.keys(by_week_start)) {
    by_week_start[key].sort((a, b) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b))
    );
  }
  for (const key of Object.keys(by_sanction)) {
    by_sanction[key].sort((a, b) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b))
    );
  }

  const out = {
    version: data.version || "1.1",
    shows, // unchanged
    by_week_start,
    by_sanction
  };

  writeJson(SCHEDULE_PATH, out);
  console.log("shows/show_schedule.json indexed (by_week_start, by_sanction).");
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
