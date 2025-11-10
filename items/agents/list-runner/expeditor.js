#!/usr/bin/env node
/**
 * expeditor.js (List-Runner aligned with *_lib.json + lists/*.json)
 *
 * Scope:
 *   items/agents/list-runner/
 *
 * Trust:
 *   - lib/*.json are authoritative catalogs ("libs")
 *   - lists/*.json are runtime views built from libs + commands
 *
 * This script:
 *   1. Syncs list_registry.json from lists_lib.json
 *   2. Syncs item_registry.json from items_lib.json
 *   3. Rebuilds lists/index.json summary from:
 *        - started_lists.json
 *        - archived_lists.json
 *   4. Maintains item_manifest.json as a flat view of physical items
 *
 * It does NOT:
 *   - invent new folders
 *   - read or write lib/*_registry.json
 *   - depend on shows/show_schedule.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const LISTS_DIR = path.join(ROOT, "lists");
const LIB_DIR = path.join(ROOT, "lib");

function readJson(p, fallback) {
  try {
    const txt = fs.readFileSync(p, "utf8");
    return JSON.parse(txt);
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`readJson failed for ${p}: ${e.message}`);
  }
}

function writeJson(p, data) {
  const out = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(p, out, "utf8");
}

/**
 * Load libs (all optional except lists/items for registry).
 */
function loadLibs() {
  const load = (name) =>
    readJson(path.join(LIB_DIR, name), null);

  return {
    locations: load("locations_lib.json"),
    shows: load("shows_lib.json"),
    horses: load("horses_lib.json"),
    lists: load("lists_lib.json") || [],
    items: load("items_lib.json") || [],
    kits: load("kits_lib.json") || []
  };
}

/**
 * 1. Build list_registry.json from lists_lib.json
 */
function buildListRegistry(listsLib) {
  const registry = { version: "1.0", lists: {} };

  for (const l of listsLib) {
    if (!l || !l.list_id) continue;
    registry.lists[l.list_id] = {
      aliases: l.aliases || [],
      misspells: l.misspells || [],
      default: !!l.default
    };
  }

  const target = path.join(LISTS_DIR, "list_registry.json");
  writeJson(target, registry);
}

/**
 * 2. Build item_registry.json from items_lib.json
 *    Map canonical item_id -> aliases/misspells
 */
function buildItemRegistry(itemsLib) {
  const registry = { version: "1.0", items: {} };

  for (const it of itemsLib) {
    if (!it || !it.item_id) continue;
    registry.items[it.item_id] = {
      aliases: it.aliases || [],
      misspells: it.misspells || []
    };
  }

  const target = path.join(LISTS_DIR, "item_registry.json");
  writeJson(target, registry);
}

/**
 * Helpers to read runtime list files
 */
function loadStartedLists() {
  const p = path.join(LISTS_DIR, "started_lists.json");
  const data = readJson(p, { version: "1.0", lists: [] });
  data.lists = Array.isArray(data.lists) ? data.lists : [];
  return { path: p, data };
}

function loadArchivedLists() {
  const p = path.join(LISTS_DIR, "archived_lists.json");
  const data = readJson(p, { version: "1.0", lists: [] });
  data.lists = Array.isArray(data.lists) ? data.lists : [];
  return { path: p, data };
}

/**
 * 3. Build lists/index.json summary from started + archived
 */
function buildIndex(started, archived) {
  const by_show = {};
  let activeCount = 0;
  let archivedCount = archived.data.lists.length;

  for (const lst of started.data.lists) {
    const showId = lst.show_id;
    if (showId == null) continue;
    const lt = lst.list_type || lst.list_id;
    if (!lt) continue;

    if (!by_show[showId]) by_show[showId] = {};
    const entry = by_show[showId][lt] || {
      state: lst.state || "home",
      to_take: { packed: 0, not_packed: 0, not_needed: 0 },
      to_bring_home: { packed: 0, open: 0 }
    };

    const items = Array.isArray(lst.items) ? lst.items : [];
    for (const it of items) {
      const take = it.to_take || "not_packed";
      if (take === "packed") entry.to_take.packed++;
      else if (take === "not_needed") entry.to_take.not_needed++;
      else entry.to_take.not_packed++;

      const bring = it.to_bring_home || "not_packed";
      if (bring === "packed") entry.to_bring_home.packed++;
      else entry.to_bring_home.open++;
    }

    entry.state = lst.state || entry.state;
    by_show[showId][lt] = entry;
    activeCount++;
  }

  const out = {
    summary: {
      last_updated: new Date().toISOString(),
      total_active_lists: activeCount,
      total_archived_lists: archivedCount
    },
    by_show
  };

  const target = path.join(LISTS_DIR, "index.json");
  writeJson(target, out);
}

/**
 * 4. Maintain item_manifest.json as flat map of known items.
 *    Strategy:
 *      - Ensure every item in started_lists has a row.
 *      - Preserve existing manifest rows when possible.
 */
function buildItemManifest(started) {
  const p = path.join(LISTS_DIR, "item_manifest.json");
  const existing = readJson(p, { version: "1.0", items: [] });
  const byUid = new Map();

  if (Array.isArray(existing.items)) {
    for (const it of existing.items) {
      if (it && it.item_uid) byUid.set(it.item_uid, it);
    }
  }

  const now = new Date().toISOString();
  const itemsOut = [];

  for (const lst of started.data.lists) {
    const showId = lst.show_id || null;
    const items = Array.isArray(lst.items) ? lst.items : [];
    for (const it of items) {
      if (!it.item_uid) continue;
      const prev = byUid.get(it.item_uid) || {};
      const row = {
        item_uid: it.item_uid,
        item_id: it.item_id || prev.item_id || null,
        name: it.name || prev.name || null,
        horse_id: it.horse_id || prev.horse_id || null,
        home_location_id: prev.home_location_id || "home",
        current_location_id: prev.current_location_id || "home",
        state: prev.state || "home",
        show_id: showId,
        last_update: prev.last_update || now,
        last_updated_by: prev.last_updated_by || "expeditor"
      };
      itemsOut.push(row);
      byUid.delete(it.item_uid);
    }
  }

  // Keep any manifest entries not present in started_lists as-is
  for (const it of byUid.values()) {
    itemsOut.push(it);
  }

  const out = {
    version: "1.0",
    items: itemsOut
  };

  writeJson(p, out);
}

/**
 * Run all steps
 */
function run() {
  const libs = loadLibs();

  // Require minimal libs for registries
  if (!Array.isArray(libs.lists)) {
    throw new Error("lists_lib.json missing or invalid");
  }
  if (!Array.isArray(libs.items)) {
    throw new Error("items_lib.json missing or invalid");
  }

  buildListRegistry(libs.lists);
  buildItemRegistry(libs.items);

  const started = loadStartedLists();
  const archived = loadArchivedLists();

  buildIndex(started, archived);
  buildItemManifest(started);

  console.log("[expeditor] registry + index + manifest updated.");
}

if (require.main === module) {
  try {
    run();
  } catch (e) {
    console.error("[expeditor] failed:", e.message);
    process.exit(1);
  }
}

module.exports = { run };
