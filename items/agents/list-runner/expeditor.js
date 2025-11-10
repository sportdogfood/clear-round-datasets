#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const LISTS_DIR = path.join(ROOT, "lists");
const STARTED = path.join(LISTS_DIR, "started_lists.json");
const ARCHIVED = path.join(LISTS_DIR, "archived_lists.json");
const INDEX = path.join(LISTS_DIR, "index.json");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function countStatuses(items, field, allowed) {
  const counts = {};
  for (const v of allowed) counts[v] = 0;
  for (const it of items) {
    const v = it[field];
    if (v && Object.prototype.hasOwnProperty.call(counts, v)) {
      counts[v] += 1;
    }
  }
  return counts;
}

function isReadyAway(list) {
  if (list.state !== "home") return false;
  if (!list.items.length) return false;
  for (const it of list.items) {
    if (!["packed", "not_needed", "missing", "broken"].includes(it.to_take)) {
      return false;
    }
  }
  return true;
}

function isReadyComplete(list) {
  if (list.state !== "away") return false;
  if (!list.items.length) return false;
  for (const it of list.items) {
    if (!["packed", "missing", "broken", "sent_back_early", "left_over"].includes(it.to_bring_home)) {
      return false;
    }
  }
  return true;
}

function buildIndex() {
  const started = readJson(STARTED, { version: "1.0", lists: [] });
  const archived = readJson(ARCHIVED, { version: "1.0", lists: [] });

  const index = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    lists: {}
  };

  function addList(list, scope) {
    const id = list.list_id;
    const items = Array.isArray(list.items) ? list.items : [];

    const toTakeCounts = countStatuses(
      items,
      "to_take",
      ["not_packed", "packed", "not_needed", "missing", "broken"]
    );
    const toBringCounts = countStatuses(
      items,
      "to_bring_home",
      ["not_packed", "packed", "missing", "broken", "sent_back_early", "left_over"]
    );

    index.lists[id] = {
      scope,
      show_id: list.show_id,
      list_type: list.list_type,
      name: list.name,
      state: list.state,
      total_items: items.length,
      to_take: toTakeCounts,
      to_bring_home: toBringCounts,
      ready_to_mark_away: isReadyAway(list),
      ready_to_mark_complete: isReadyComplete(list)
    };
  }

  for (const l of started.lists) addList(l, "started");
  for (const l of archived.lists) addList(l, "archived");

  writeJson(INDEX, index);
  return index;
}

if (require.main === module) {
  buildIndex();
  console.log("index.json updated");
}

module.exports = { buildIndex };
