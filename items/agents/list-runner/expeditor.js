#!/usr/bin/env node
/**
 * expeditor.js
 *
 * Items/agents/list-runner expeditor:
 * - Rebuilds lists/index.json from started + archived shows.
 * - Auto-archives shows 3+ days after end_date (if still in started).
 * - Writes a daily index backup under logs/backups/.
 * - Exposes /items/agents/health endpoints in serve mode.
 *
 * All data is local JSON under items/agents/list-runner.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

// --- Paths (relative to this directory) ---
const ROOT = __dirname;

const LISTS_DIR = path.join(ROOT, "lists");
const LOGS_DIR = path.join(ROOT, "logs");
const SHOWS_DIR = path.join(ROOT, "shows");

const STATE_FILE = path.join(ROOT, "state.json");
const STARTED_FILE = path.join(LISTS_DIR, "started_lists.json");
const ARCHIVED_FILE = path.join(LISTS_DIR, "archived_lists.json");
const INDEX_FILE = path.join(LISTS_DIR, "index.json");
const UPDATES_FILE = path.join(LOGS_DIR, "updates.json");
const SCHEDULE_FILE = path.join(SHOWS_DIR, "show_schedule.json");

const BACKUP_DIR = path.join(LOGS_DIR, "backups");

// --- Helpers ---

function now() {
  return new Date().toISOString();
}

function today() {
  return now().slice(0, 10);
}

function toMs(iso) {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? NaN : t;
}

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJSON(p, fallback) {
  try {
    const txt = fs.readFileSync(p, "utf8");
    if (!txt.trim()) return fallback;
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function writeJSON(p, obj) {
  ensureDir(p);
  const body = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, body, "utf8");
}

// --- Auto-archive: 3+ days after end_date moves from started->archived ---

function autoArchiveOldShows(started, archived, ts, updates) {
  const nowMs = toMs(ts);
  if (!started.shows) return false;
  if (!archived.shows) archived.shows = {};

  let changed = false;

  for (const [key, showState] of Object.entries(started.shows)) {
    const endMs = toMs(showState.end_date);
    if (Number.isNaN(endMs)) continue;
    const diffDays = (nowMs - endMs) / 86400000;
    if (diffDays >= 3) {
      archived.shows[key] = showState;
      delete started.shows[key];
      changed = true;
      updates.events.push({
        ts,
        action: "auto_archive",
        source: "expeditor",
        show_id: showState.show_id,
        show_key: key,
        end_date: showState.end_date,
        diff_days: Number(diffDays.toFixed(2))
      });
    }
  }

  return changed;
}

// --- Index builder ---

function buildIndex(started, archived, ts) {
  const index = {
    version: "1.0",
    last_updated: ts,
    active: {
      shows: 0,
      items_to_take_not_packed: 0,
      items_to_bring_home_not_packed: 0
    },
    archived: {
      shows: 0
    },
    shows: {}
  };

  const startedShows = started.shows || {};
  const archivedShows = archived.shows || {};

  // count archived shows
  index.archived.shows = Object.keys(archivedShows).length;

  // active shows
  for (const [key, s] of Object.entries(startedShows)) {
    if (!s || !s.lists) continue;

    index.active.shows++;

    const showId = s.show_id || key;
    const showNode = {
      show_id: showId,
      show_name: s.show_name || "",
      start_date: s.start_date || null,
      end_date: s.end_date || null,
      state: s.state || "home",
      lists: {},
      totals: {
        total_items: 0,
        to_take: {
          not_packed: 0,
          packed: 0,
          not_needed: 0
        },
        to_bring_home: {
          not_packed: 0,
          packed: 0,
          missing: 0,
          broken: 0,
          left_over: 0,
          sent_back_early: 0
        }
      }
    };

    for (const [listName, items] of Object.entries(s.lists)) {
      const lc = {
        total_items: 0,
        to_take: {
          not_packed: 0,
          packed: 0,
          not_needed: 0
        },
        to_bring_home: {
          not_packed: 0,
          packed: 0,
          missing: 0,
          broken: 0,
          left_over: 0,
          sent_back_early: 0
        }
      };

      if (Array.isArray(items)) {
        for (const it of items) {
          lc.total_items++;
          showNode.totals.total_items++;

          // to_take
          if (it.to_take === "not_packed") {
            lc.to_take.not_packed++;
            showNode.totals.to_take.not_packed++;
            index.active.items_to_take_not_packed++;
          } else if (it.to_take === "packed") {
            lc.to_take.packed++;
            showNode.totals.to_take.packed++;
          } else if (it.to_take === "not_needed") {
            lc.to_take.not_needed++;
            showNode.totals.to_take.not_needed++;
          }

          // to_bring_home
          if (it.to_bring_home === "not_packed") {
            lc.to_bring_home.not_packed++;
            showNode.totals.to_bring_home.not_packed++;
            index.active.items_to_bring_home_not_packed++;
          } else if (it.to_bring_home === "packed") {
            lc.to_bring_home.packed++;
            showNode.totals.to_bring_home.packed++;
          } else if (it.to_bring_home === "missing") {
            lc.to_bring_home.missing++;
            showNode.totals.to_bring_home.missing++;
          } else if (it.to_bring_home === "broken") {
            lc.to_bring_home.broken++;
            showNode.totals.to_bring_home.broken++;
          } else if (it.to_bring_home === "left_over") {
            lc.to_bring_home.left_over++;
            showNode.totals.to_bring_home.left_over++;
          } else if (it.to_bring_home === "sent_back_early") {
            lc.to_bring_home.sent_back_early++;
            showNode.totals.to_bring_home.sent_back_early++;
          }
        }
      }

      showNode.lists[listName] = lc;
    }

    index.shows[String(showId)] = showNode;
  }

  return index;
}

// --- Daily backup of index.json ---

function ensureDailyBackup(index, ts, updates) {
  ensureDir(path.join(BACKUP_DIR, "x")); // ensure dir via dummy

  const day = ts.slice(0, 10);
  const backupFile = path.join(BACKUP_DIR, `${day}-index.json`);

  let created = false;

  if (!fs.existsSync(backupFile)) {
    writeJSON(backupFile, index);
    created = true;
    updates.events.push({
      ts,
      action: "daily_backup",
      source: "expeditor",
      target: `logs/backups/${path.basename(backupFile)}`
    });
  }

  // keep last 7 backups
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith("-index.json"))
    .sort(); // ascending by name (date)

  const excess = files.length - 7;
  if (excess > 0) {
    for (let i = 0; i < excess; i++) {
      const f = path.join(BACKUP_DIR, files[i]);
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }

  return created;
}

// --- Core: update flow ---

function runUpdate() {
  const ts = now();

  const state = readJSON(STATE_FILE, {});
  const started = readJSON(STARTED_FILE, { shows: {} });
  const archived = readJSON(ARCHIVED_FILE, { shows: {} });
  const updates = readJSON(UPDATES_FILE, { events: [] });

  if (!Array.isArray(updates.events)) updates.events = [];

  // auto-archive shows by end_date + 3 days
  const archivedChanged = autoArchiveOldShows(started, archived, ts, updates);

  // rebuild index from current started + archived
  const index = buildIndex(started, archived, ts);
  writeJSON(INDEX_FILE, index);

  // daily backup
  const backupCreated = ensureDailyBackup(index, ts, updates);

  // log index rebuild
  updates.events.push({
    ts,
    action: "index_rebuild",
    source: "expeditor",
    files: ["lists/index.json"],
    archive_changed: archivedChanged,
    backup_created: backupCreated
  });

  // persist updated structures
  writeJSON(STARTED_FILE, started);
  writeJSON(ARCHIVED_FILE, archived);
  writeJSON(UPDATES_FILE, updates);

  return index;
}

// --- Health server ---

function serveHealth(port = 8080) {
  const server = http.createServer((req, res) => {
    try {
      if (
        req.url === "/items/agents/health" ||
        req.url === "/items/agents/health/"
      ) {
        const state = readJSON(STATE_FILE, {});
        const updates = readJSON(UPDATES_FILE, { events: [] });
        const index = readJSON(INDEX_FILE, null);

        const lastEvent =
          Array.isArray(updates.events) && updates.events.length
            ? updates.events[updates.events.length - 1]
            : null;

        const body = {
          ok: true,
          last_update:
            (index && index.last_updated) ||
            (lastEvent && lastEvent.ts) ||
            null,
          active_show_id: state.active_show_id || null,
          active_show_name: state.active_show_name || null,
          active_shows: index?.active?.shows ?? 0,
          archived_shows: index?.archived?.shows ?? 0,
          to_take_unpacked:
            index?.active?.items_to_take_not_packed ?? 0,
          to_bring_home_unpacked:
            index?.active?.items_to_bring_home_not_packed ?? 0
        };

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body, null, 2));
        return;
      }

      if (req.url === "/items/agents/health/compact") {
        const state = readJSON(STATE_FILE, {});
        const index = readJSON(INDEX_FILE, null);

        const body = {
          ok: true,
          show_id: state.active_show_id || null,
          show_name: state.active_show_name || null,
          updated:
            (index && index.last_updated) ||
            state.updated_at ||
            null
        };

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body, null, 2));
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`expeditor health server running on ${port}`);
  });
}

// --- CLI entrypoint ---

const cmd = process.argv[2];

if (cmd === "update") {
  runUpdate();
  // eslint-disable-next-line no-console
  console.log("Index rebuilt, archives checked, backup ensured.");
} else if (cmd === "serve") {
  runUpdate();
  serveHealth(8080);
} else {
  // eslint-disable-next-line no-console
  console.log(
    "Usage:\n" +
    "  node expeditor.js update   # rebuild index + auto-archive + backup\n" +
    "  node expeditor.js serve    # run health server on :8080"
  );
}
