#!/usr/bin/env node
/**
 * expeditor.js
 *
 * Single source of truth maintenance for List-Runner.
 *
 * Responsibilities:
 * - Use ONLY lib/shows_lib.json for show schedule.
 * - Maintain:
 *     lists/started_lists.json
 *     lists/archived_lists.json
 *     lists/index.json
 *     lists/item_manifest.json
 * - Archive lists when show_end_date is 3+ days past.
 * - Never touch *_registry.json.
 * - Never create surprise folders.
 *
 * Assumed structure:
 *   items/agents/list-runner/
 *     expeditor.js                (this file)
 *     lib/
 *       shows_lib.json            (required)
 *       // optional future: horses_lib.json, items_lib.json, lists_lib.json, etc.
 *     lists/
 *       started_lists.json
 *       archived_lists.json
 *       index.json
 *       item_manifest.json
 *       item_registry.json        (read-only, legacy support)
 *       list_registry.json        (read-only, legacy support)
 *     logs/
 *       updates.json              (append-only elsewhere)
 *
 * All paths below are relative to this file's directory.
 */

const fs = require("fs");
const path = require("path");

// --- Paths ---
const ROOT = __dirname;
const LIB_DIR = path.join(ROOT, "lib");
const LISTS_DIR = path.join(ROOT, "lists");

const SHOWS_LIB_PATH = path.join(LIB_DIR, "shows_lib.json");

const STARTED_PATH = path.join(LISTS_DIR, "started_lists.json");
const ARCHIVED_PATH = path.join(LISTS_DIR, "archived_lists.json");
const INDEX_PATH = path.join(LISTS_DIR, "index.json");
const MANIFEST_PATH = path.join(LISTS_DIR, "item_manifest.json");

// --- Helpers ---

function safeReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const txt = fs.readFileSync(p, "utf8");
    if (!txt.trim()) return fallback;
    return JSON.parse(txt);
  } catch (e) {
    console.error(`[expeditor] Failed to read ${p}: ${e.message}`);
    return fallback;
  }
}

function writeJson(p, obj) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, out, "utf8");
}

function nowUtcIso() {
  return new Date().toISOString();
}

function parseDateUTC(s) {
  if (!s) return null;
  // Accept "YYYY-MM-DD HH:mm:ss" or ISO
  const norm = s.replace(" ", "T");
  const d = new Date(norm);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysDiff(a, b) {
  const ms = a.getTime() - b.getTime();
  return ms / 86400000;
}

// Normalize shows_lib: support either {shows:[..]} or [..]
function loadShowsLib() {
  const raw = safeReadJson(SHOWS_LIB_PATH, null);
  if (!raw) {
    throw new Error("lib/shows_lib.json is required but missing or unreadable");
  }
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.shows) ? raw.shows : null;
  if (!arr) {
    throw new Error("lib/shows_lib.json must be an array or { shows: [] }");
  }

  const byId = {};
  for (const s of arr) {
    if (s && s.show_id != null) {
      byId[s.show_id] = s;
    }
  }
  return { shows: arr, byId };
}

// --- Core steps ---

function run() {
  const ts = nowUtcIso();
  const { shows, byId: showsById } = loadShowsLib();

  // started_lists.json
  const startedRaw = safeReadJson(STARTED_PATH, null);
  const started = {
    version: (startedRaw && startedRaw.version) || "1.0",
    lists: (startedRaw && Array.isArray(startedRaw.lists)) ? startedRaw.lists : []
  };

  // archived_lists.json
  const archivedRaw = safeReadJson(ARCHIVED_PATH, null);
  const archived = {
    version: (archivedRaw && archivedRaw.version) || "1.0",
    lists: (archivedRaw && Array.isArray(archivedRaw.lists)) ? archivedRaw.lists : []
  };

  const now = new Date(ts);

  // 1) Auto-archive: any started list whose show ended 3+ days ago.
  const keepStarted = [];
  for (const list of started.lists) {
    const show = list && list.show_id != null ? showsById[list.show_id] : null;
    if (!show) {
      // Unknown show_id: keep it; human can clean later.
      keepStarted.push(list);
      continue;
    }

    const end = parseDateUTC(show.end_date);
    if (!end) {
      // Bad date: keep; do not guess.
      keepStarted.push(list);
      continue;
    }

    const diffDays = daysDiff(now, end);
    if (diffDays >= 3) {
      // Move to archived
      archived.lists.push({
        ...list,
        archived_at: ts
      });
    } else {
      keepStarted.push(list);
    }
  }
  started.lists = keepStarted;

  // 2) Build index.json (lightweight, UI- and GPT-friendly)
  const index = {
    summary: {
      last_updated: ts,
      total_active_lists: started.lists.length,
      total_archived_lists: archived.lists.length
    },
    shows: {},
    totals: {
      to_take_unpacked: 0,
      to_bring_home_unpacked: 0
    }
  };

  for (const list of started.lists) {
    const showId = list.show_id;
    const show = showId != null ? showsById[showId] : null;
    const showKey = showId != null ? String(showId) : "unknown";

    if (!index.shows[showKey]) {
      index.shows[showKey] = {
        show_id: showId || null,
        show_name: show ? show.show_name : null,
        lists: {}
      };
    }

    const listKey = list.list_type || list.name || list.list_id || "unknown";
    const bucket = index.shows[showKey].lists[listKey] || {
      to_take: { packed: 0, not_packed: 0, not_needed: 0 },
      to_bring_home: {
        packed: 0,
        not_packed: 0,
        missing: 0,
        broken: 0,
        left_over: 0,
        sent_back_early: 0
      }
    };

    const items = Array.isArray(list.items) ? list.items : [];
    for (const it of items) {
      const tt = it.to_take || "not_packed";
      const bh = it.to_bring_home || "not_packed";

      // to_take side
      if (tt === "packed") bucket.to_take.packed += 1;
      else if (tt === "not_needed") bucket.to_take.not_needed += 1;
      else bucket.to_take.not_packed += 1;

      // bring_home side
      if (bh === "packed") bucket.to_bring_home.packed += 1;
      else if (bh === "missing") bucket.to_bring_home.missing += 1;
      else if (bh === "broken") bucket.to_bring_home.broken += 1;
      else if (bh === "left_over") bucket.to_bring_home.left_over += 1;
      else if (bh === "sent_back_early") bucket.to_bring_home.sent_back_early += 1;
      else bucket.to_bring_home.not_packed += 1;
    }

    index.shows[showKey].lists[listKey] = bucket;
  }

  // accumulate global totals
  for (const s of Object.values(index.shows)) {
    for (const l of Object.values(s.lists)) {
      index.totals.to_take_unpacked += l.to_take.not_packed;
      index.totals.to_bring_home_unpacked += l.to_bring_home.not_packed;
    }
  }

  // 3) Rebuild item_manifest.json from active lists only
  const manifest = {
    version: "1.0",
    generated_at: ts,
    items: []
  };

  for (const list of started.lists) {
    const items = Array.isArray(list.items) ? list.items : [];
    for (const it of items) {
      manifest.items.push({
        item_uid: it.item_uid || null,
        name: it.name || null,
        show_id: list.show_id || null,
        list_id: list.list_id || null,
        list_type: list.list_type || null,
        to_take: it.to_take || "not_packed",
        to_bring_home: it.to_bring_home || "not_packed"
      });
    }
  }

  // --- Write outputs ---
  writeJson(STARTED_PATH, started);
  writeJson(ARCHIVED_PATH, archived);
  writeJson(INDEX_PATH, index);
  writeJson(MANIFEST_PATH, manifest);

  console.log("[expeditor] OK");
  console.log(`  active_lists=${started.lists.length}`);
  console.log(`  archived_lists=${archived.lists.length}`);
}

// CLI entry
if (require.main === module) {
  try {
    run();
  } catch (e) {
    console.error("[expeditor] FAILED:", e.message);
    process.exit(1);
  }
}

module.exports = { run };
