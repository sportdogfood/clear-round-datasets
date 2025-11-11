#!/usr/bin/env node

// expeditor.js — List-Runner
// Purpose:
// - Auto-archive shows 3+ days after end_date
// - Maintain lists/index.json summary
// - Maintain logs/transactions.json as structured event log
// - Touch logs/updates.json with a simple heartbeat
//
// Usage:
//   node items/agents/list-runner/expeditor.js update

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This file lives in: items/agents/list-runner
const ROOT = __dirname;

const NOW_ISO = new Date().toISOString();
const changed = new Set();

// ---------- fs helpers ----------

function abs(relPath) {
  return path.join(ROOT, relPath);
}

async function readJson(relPath, fallback) {
  try {
    const txt = await fs.readFile(abs(relPath), "utf8");
    if (!txt.trim()) return structuredCloneOr(fallback);
    return JSON.parse(txt);
  } catch (e) {
    return structuredCloneOr(fallback);
  }
}

function structuredCloneOr(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

async function writeJsonIfChanged(relPath, data) {
  const full = abs(relPath);
  const dir = path.dirname(full);
  await fs.mkdir(dir, { recursive: true });

  const next = JSON.stringify(data, null, 2) + "\n";
  let prev = null;
  try {
    prev = await fs.readFile(full, "utf8");
  } catch {
    // missing is fine
  }
  if (prev === next) return;

  await fs.writeFile(full, next, "utf8");

  // Track repo-relative path for optional external tooling
  const relForRepo = path
    .join("items", "agents", "list-runner", relPath)
    .replace(/\\/g, "/");

  changed.add(relForRepo);
}

// ---------- small utils ----------

function parseDate(v) {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

function buildShowsById(showsLib) {
  const map = {};
  if (!showsLib) return map;

  const push = (s) => {
    if (!s || typeof s !== "object") return;
    const id =
      s.show_id !== undefined
        ? s.show_id
        : s.id !== undefined
        ? s.id
        : s.code !== undefined
        ? s.code
        : null;
    if (id === null || id === undefined) return;
    const key = String(id);
    if (!map[key]) {
      map[key] = { ...s, show_id: s.show_id ?? id };
    }
  };

  if (Array.isArray(showsLib)) {
    showsLib.forEach(push);
  } else if (Array.isArray(showsLib.shows)) {
    showsLib.shows.forEach(push);
  } else if (showsLib.shows && typeof showsLib.shows === "object") {
    for (const [id, s] of Object.entries(showsLib.shows)) {
      if (!s || typeof s !== "object") continue;
      const key = String(id);
      map[key] = { ...s, show_id: s.show_id ?? id };
    }
  }

  return map;
}

function isFinalToTake(status) {
  return status === "packed" || status === "not_needed";
}

function isFinalToBringHome(status) {
  return (
    status === "packed" ||
    status === "missing" ||
    status === "broken" ||
    status === "left_over" ||
    status === "sent_back_early"
  );
}

function newTxnId() {
  return (
    "trn_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

// ---------- core: auto-archive ----------

function autoArchiveShows(started, archived, showsById, txEvents, nowIso) {
  if (!started || typeof started !== "object") return;
  if (!started.shows || typeof started.shows !== "object") return;

  if (!archived || typeof archived !== "object") return;
  if (!archived.shows || typeof archived.shows !== "object") {
    archived.shows = {};
  }

  const now = parseDate(nowIso);
  if (!now) return;

  for (const [showKey, showState] of Object.entries(started.shows)) {
    if (!showState || typeof showState !== "object") continue;

    const showId = showState.show_id ?? showKey;
    const meta = showsById[String(showId)] || showState;

    const end =
      parseDate(showState.end_date) ||
      parseDate(meta && meta.end_date) ||
      null;
    if (!end) continue;

    const archiveAt = addDays(end, 3);
    if (now < archiveAt) continue;

    // Move to archived if not already there
    archived.shows[String(showId)] = {
      ...showState,
      state: "archived"
    };
    delete started.shows[showKey];

    txEvents.push({
      id: newTxnId(),
      ts: nowIso,
      actor: "system",
      device_id: "expeditor",
      source: "expeditor",
      action: "show_archived",
      show_id: showId,
      list_id: null,
      item_id: null,
      horse_id: null,
      location_id: null,
      from_state: showState.state || null,
      to_state: "archived",
      qty_delta: null,
      reason: "auto_archive_3d",
      meta: {
        end_date: end.toISOString().slice(0, 10)
      }
    });
  }
}

// ---------- core: index builder ----------

function buildIndex(started) {
  const out = {
    version: "1.0",
    generated_at: NOW_ISO,
    shows: {}
  };

  if (!started || typeof started !== "object" || !started.shows) {
    return out;
  }

  for (const [showKey, showState] of Object.entries(started.shows)) {
    if (!showState || typeof showState !== "object") continue;

    const sid = String(showState.show_id ?? showKey);
    const showEntry = {
      show_id: showState.show_id ?? null,
      show_name: showState.show_name ?? null,
      state: showState.state || "home",
      lists: {}
    };

    const lists = showState.lists || {};
    for (const [listKey, listVal] of Object.entries(lists)) {
      if (!listVal) continue;

      // Two tolerated shapes:
      // 1) listVal = { name, state, items: [...] }
      // 2) listVal = [ items... ] (legacy simple)
      let listName = listVal.name || listKey;
      let listState = listVal.state || showEntry.state || "home";
      let items = Array.isArray(listVal)
        ? listVal
        : Array.isArray(listVal.items)
        ? listVal.items
        : [];

      let total = items.length;
      let to_take_remaining = 0;
      let to_bring_home_remaining = 0;

      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const tt = it.to_take || "not_packed";
        const tb = it.to_bring_home || "not_packed";

        if (listState === "home") {
          if (!isFinalToTake(tt)) to_take_remaining++;
        } else if (listState === "away") {
          if (!isFinalToBringHome(tb)) to_bring_home_remaining++;
        }
      }

      showEntry.lists[listKey] = {
        list_id: listVal.list_id || listKey,
        name: listName,
        state: listState,
        total_items: total,
        to_take_remaining,
        to_bring_home_remaining
      };
    }

    out.shows[sid] = showEntry;
  }

  return out;
}

// ---------- core: run ----------

async function run() {
  const mode = process.argv[2] || "update";
  if (mode !== "update") {
    console.error("Usage: node expeditor.js update");
    process.exit(1);
  }

  // Load libs (only shows_lib is required for archive logic)
  const showsLib = await readJson("lib/shows_lib.json", null);

  // Load lists
  const started = await readJson("lists/started_lists.json", {
    version: "1.0",
    shows: {}
  });
  const archived = await readJson("lists/archived_lists.json", {
    version: "1.0",
    shows: {}
  });

  // Load logs
  const tx = await readJson("logs/transactions.json", {
    version: "1.0",
    events: []
  });
  const updates = await readJson("logs/updates.json", {
    events: []
  });

  if (!Array.isArray(tx.events)) tx.events = [];
  if (!Array.isArray(updates.events)) updates.events = [];

  const showsById = buildShowsById(showsLib);

  // 1) auto-archive shows based on shows_lib / show end_date
  autoArchiveShows(started, archived, showsById, tx.events, NOW_ISO);

  // 2) rebuild index for active (started) shows
  const index = buildIndex(started);

  // 3) write back canonical + derived + logs
  await writeJsonIfChanged("lists/started_lists.json", started);
  await writeJsonIfChanged("lists/archived_lists.json", archived);
  await writeJsonIfChanged("lists/index.json", index);

  tx.version = "1.0";
  await writeJsonIfChanged("logs/transactions.json", tx);

  updates.events.push({
    ts: NOW_ISO,
    source: "expeditor",
    note: `expeditor update; ${changed.size} file(s) touched`
  });
  await writeJsonIfChanged("logs/updates.json", updates);

  // No interactive confirmation. Caller (server, action, etc.) can rely on exit code.
  console.log(
    `expeditor: ok, ${changed.size} file(s) updated`
  );
}

run().catch((err) => {
  console.error("expeditor: failed", err.message || err);
  process.exit(1);
});
