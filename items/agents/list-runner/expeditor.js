#!/usr/bin/env node
/**
 * expeditor.js
 * Self-contained coordinator for items/agents/list-runner
 * Handles index rebuild, daily backup, and /health endpoints.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const LISTS = path.join(ROOT, "lists");
const LOGS = path.join(ROOT, "logs");
const STATE = path.join(ROOT, "state.json");
const INDEX = path.join(LISTS, "index.json");
const STARTED = path.join(LISTS, "started_lists.json");
const ARCHIVED = path.join(LISTS, "archived_lists.json");
const UPDATES = path.join(LOGS, "updates.json");

// ---------- utilities ----------
const readJSON = (p, d = {}) => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return d; }
};
const writeJSON = (p, obj) =>
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// ---------- index rebuild ----------
function rebuildIndex() {
  const started = readJSON(STARTED, { started_lists: {} });
  const index = { summary: {}, weeks: {}, totals: { to_take: {}, to_bring_home: {} } };

  let totalActive = 0, totalArchived = 0, totalToTake = 0, totalToBring = 0;

  for (const [week, data] of Object.entries(started.started_lists || {})) {
    totalActive++;
    const packedCounts = {};
    let archiveReady = true;

    for (const [list, items] of Object.entries(data.lists || {})) {
      packedCounts[list] = { to_take: { packed: 0, unpacked: 0 }, to_bring_home: { packed: 0, unpacked: 0 } };
      for (const item of items) {
        const { status, packed } = item;
        if (!status) continue;
        const s = packedCounts[list][status];
        s[packed ? "packed" : "unpacked"]++;
        if (status === "to_take" || packed === false) archiveReady = false;
        if (status === "to_take") totalToTake++;
        if (status === "to_bring_home") totalToBring++;
      }
    }

    index.weeks[week] = {
      show_name: data.show_name || "",
      packed_counts: packedCounts,
      archive_ready: archiveReady
    };
  }

  const archived = readJSON(ARCHIVED, { archived_lists: {} });
  totalArchived = Object.keys(archived.archived_lists || {}).length;

  index.summary = {
    last_updated: now(),
    total_active_weeks: totalActive,
    total_archived_weeks: totalArchived
  };
  index.totals = {
    to_take: totalToTake,
    to_bring_home: totalToBring
  };

  writeJSON(INDEX, index);
  return index;
}

// ---------- daily backup ----------
function dailyBackup() {
  const backupDir = path.join(LOGS, "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `${today()}-index.json`);
  if (fs.existsSync(file)) return;
  const index = readJSON(INDEX, {});
  writeJSON(file, index);

  const updates = readJSON(UPDATES, { updates: [] });
  updates.updates.push({
    timestamp: now(),
    action: "daily_backup",
    source: "expeditor",
    target: `/logs/backups/${today()}-index.json`
  });
  writeJSON(UPDATES, updates);

  // Keep 7 most recent backups
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith("-index.json"))
    .sort().reverse();
  files.slice(7).forEach(f => fs.unlinkSync(path.join(backupDir, f)));
}

// ---------- health endpoints ----------
function serveHealth(port = 8080) {
  http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    const state = readJSON(STATE, {});
    const updates = readJSON(UPDATES, { updates: [] });
    const lastUpdate = updates.updates.at(-1);
    const index = readJSON(INDEX, {});
    const archived = readJSON(ARCHIVED, { archived_lists: {} });

    if (req.url === "/items/agents/health" || req.url === "/items/agents/health/") {
      const body = {
        ok: true,
        last_update: lastUpdate ? lastUpdate.timestamp : null,
        active_week: state.active_week || null,
        current_mode: state.current_mode || null,
        archived_weeks: Object.keys(archived.archived_lists || {}).length,
        pending_packs: index.totals?.to_take ?? 0,
        index_version: index.summary?.last_updated ?? null
      };
      res.end(JSON.stringify(body, null, 2));
    } else if (req.url === "/items/agents/health/compact") {
      const body = {
        ok: true,
        mode: state.current_mode || null,
        active_week: state.active_week || null,
        updated: lastUpdate ? lastUpdate.timestamp : null
      };
      res.end(JSON.stringify(body, null, 2));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
    }
  }).listen(port, () => console.log(`expeditor health server running on ${port}`));
}

// ---------- CLI ----------
const cmd = process.argv[2];
if (cmd === "update") {
  rebuildIndex();
  dailyBackup();
  console.log("Index rebuilt and backup checked.");
} else if (cmd === "serve") {
  rebuildIndex();
  dailyBackup();
  serveHealth(8080);
} else {
  console.log("Usage:\n  node expeditor.js update   # rebuild index + backup\n  node expeditor.js serve    # run health server");
}
