#!/usr/bin/env node
/**
 * expeditor.js
 * Coordinator for items/agents/list-runner
 *
 * Responsibilities:
 * - Rebuild lists/index.json from:
 *     - lists/started_lists.json
 *     - lists/archived_lists.json
 *     - lists/item_manifest.json
 *     - shows/show_schedule.json
 * - Normalize legacy shapes into a canonical structure.
 * - Auto-archive shows:
 *     - when all lists are complete AND
 *     - end_date is at least 3 days in the past.
 * - Append structured events into logs/updates.json for its own actions.
 * - Optionally expose read-only health endpoints.
 *
 * No placeholders. No remote calls. Pure filesystem.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = __dirname;
const LISTS_DIR = path.join(ROOT, "lists");
const LOGS_DIR = path.join(ROOT, "logs");
const SHOWS_DIR = path.join(ROOT, "shows");

const STATE_PATH = path.join(ROOT, "state.json");
const STARTED_PATH = path.join(LISTS_DIR, "started_lists.json");
const ARCHIVED_PATH = path.join(LISTS_DIR, "archived_lists.json");
const ITEM_MANIFEST_PATH = path.join(LISTS_DIR, "item_manifest.json");
const INDEX_PATH = path.join(LISTS_DIR, "index.json");
const UPDATES_PATH = path.join(LOGS_DIR, "updates.json");
const BACKUPS_DIR = path.join(LOGS_DIR, "backups");
const SHOW_SCHEDULE_PATH = path.join(SHOWS_DIR, "show_schedule.json");

// ---------- helpers ----------

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const txt = fs.readFileSync(filePath, "utf8");
    if (!txt.trim()) return fallback;
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const json = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(filePath, json, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function ensureUpdates() {
  const base = readJson(UPDATES_PATH, null);
  if (base && Array.isArray(base.events)) return base;
  return { version: "1.0", events: [] };
}

function logEvent(updates, event) {
  updates.events.push(event);
}

// ---------- show schedule meta ----------

function buildShowMetaMap() {
  const data = readJson(SHOW_SCHEDULE_PATH, { shows: [] });
  const map = {};
  if (Array.isArray(data.shows)) {
    for (const s of data.shows) {
      if (!s || s.show_id == null) continue;
      const key = String(s.show_id);
      map[key] = {
        show_id: s.show_id,
        show_name: s.show_name || "",
        start_date: s.start_date || null,
        end_date: s.end_date || null,
        display_date: s.display_date || null,
        show_address: s.show_address || "",
        city: s.city || "",
        state: s.state || ""
      };
    }
  }
  return map;
}

// ---------- normalization ----------
//
// Canonical started/archived shape:
//
// {
//   "version": "1.0",
//   "shows": {
//     "200000034": {
//       "show_id": 200000034,
//       "show_name": "...",
//       "start_date": "...",
//       "end_date": "...",
//       "lists": {
//         "tack": {
//           "name": "tack",
//           "state": "home" | "away" | "complete" | "archived",
//           "items": [ itemObject, ... ]
//         },
//         "equipment": { ... },
//         "feed": { ... }
//       }
//     },
//     ...
//   }
// }
//
// expeditor tolerates legacy:
// - { weeks: { week_key: { lists: { name: [items] } } } }
// - lists as arrays instead of { items: [] }

function normalizeItem(it, listName, showKey, index) {
  const name = it && it.name ? String(it.name) : `item_${listName}_${showKey}_${index}`;
  const created = (it && it.created_at) || nowIso();

  const to_take =
    typeof it.to_take === "string"
      ? it.to_take
      : (it.status === "to_take"
          ? "not_packed"
          : (it.status_to_take || "not_packed"));

  const to_bring_home =
    typeof it.to_bring_home === "string"
      ? it.to_bring_home
      : (it.status_to_bring_home || "not_packed");

  return {
    id: (it && (it.id || it.uid)) || `${String(showKey)}:${listName}:${name}`.toLowerCase(),
    name,
    type: it && it.type ? it.type : null,
    subtype: it && it.subtype ? it.subtype : null,
    note: it && it.note ? it.note : null,
    created_at: created,
    to_take,
    to_bring_home,
    packed_take: it && it.packed_take === true,
    packed_home: it && it.packed_home === true,
    state: it && it.state ? it.state : null
  };
}

function normalizeShowBlock(rawShow, sid, showMeta) {
  const meta = showMeta[String(rawShow.show_id || sid)] || {};
  const key = String(rawShow.show_id || sid);

  const out = {
    show_id: rawShow.show_id != null ? rawShow.show_id : (meta.show_id != null ? meta.show_id : null),
    show_name: rawShow.show_name || meta.show_name || "",
    start_date: rawShow.start_date || meta.start_date || null,
    end_date: rawShow.end_date || meta.end_date || null,
    lists: {}
  };

  const srcLists = rawShow.lists || {};
  for (const [lname, lst] of Object.entries(srcLists)) {
    if (!lst) continue;

    // tolerate arrays or { items: [] }
    const itemsArray = Array.isArray(lst)
      ? lst
      : (Array.isArray(lst.items) ? lst.items : []);

    const normItems = itemsArray.map((it, idx) =>
      normalizeItem(it, lname, key, idx)
    );

    out.lists[lname] = {
      name: lname,
      state: lst.state || "home",
      items: normItems
    };
  }

  return out;
}

function normalizeStarted(startedRaw, showMeta) {
  const out = {
    version: (startedRaw && startedRaw.version) ? String(startedRaw.version) : "1.0",
    shows: {}
  };

  if (startedRaw && startedRaw.shows && typeof startedRaw.shows === "object") {
    for (const [sid, s] of Object.entries(startedRaw.shows)) {
      if (!s || !s.lists) continue;
      out.shows[String(sid)] = normalizeShowBlock(s, sid, showMeta);
    }
    return out;
  }

  // legacy: weeks
  if (startedRaw && startedRaw.weeks && typeof startedRaw.weeks === "object") {
    for (const [weekKey, week] of Object.entries(startedRaw.weeks)) {
      if (!week || !week.lists) continue;

      // try match by start_date prefix
      let chosenShowId = null;
      for (const [sid, meta] of Object.entries(showMeta)) {
        if (meta.start_date && String(meta.start_date).startsWith(weekKey)) {
          chosenShowId = sid;
          break;
        }
      }

      const showBlock = {
        show_id: chosenShowId ? Number(chosenShowId) : null,
        show_name: chosenShowId ? (showMeta[chosenShowId].show_name || "") : "",
        start_date: chosenShowId ? showMeta[chosenShowId].start_date : weekKey,
        end_date: chosenShowId ? showMeta[chosenShowId].end_date : null,
        lists: {}
      };

      for (const [lname, items] of Object.entries(week.lists || {})) {
        const arr = Array.isArray(items) ? items : [];
        showBlock.lists[lname] = {
          name: lname,
          state: "home",
          items: arr.map((it, idx) => normalizeItem(it, lname, weekKey, idx))
        };
      }

      const key = chosenShowId || weekKey;
      out.shows[String(key)] = showBlock;
    }
    return out;
  }

  return out;
}

function normalizeArchived(archivedRaw, showMeta) {
  const out = {
    version: (archivedRaw && archivedRaw.version) ? String(archivedRaw.version) : "1.0",
    shows: {}
  };

  if (archivedRaw && archivedRaw.shows && typeof archivedRaw.shows === "object") {
    for (const [sid, s] of Object.entries(archivedRaw.shows)) {
      if (!s || !s.lists) continue;
      const norm = normalizeShowBlock(s, sid, showMeta);
      // enforce archived state at list level
      for (const lst of Object.values(norm.lists)) {
        if (lst.state !== "archived") lst.state = "archived";
      }
      out.shows[String(sid)] = norm;
    }
    return out;
  }

  if (archivedRaw && archivedRaw.weeks && typeof archivedRaw.weeks === "object") {
    for (const [weekKey, week] of Object.entries(archivedRaw.weeks)) {
      if (!week || !week.lists) continue;

      let chosenShowId = null;
      for (const [sid, meta] of Object.entries(showMeta)) {
        if (meta.start_date && String(meta.start_date).startsWith(weekKey)) {
          chosenShowId = sid;
          break;
        }
      }

      const showBlock = {
        show_id: chosenShowId ? Number(chosenShowId) : null,
        show_name: chosenShowId ? (showMeta[chosenShowId].show_name || "") : "",
        start_date: chosenShowId ? showMeta[chosenShowId].start_date : weekKey,
        end_date: chosenShowId ? showMeta[chosenShowId].end_date : null,
        lists: {}
      };

      for (const [lname, items] of Object.entries(week.lists || {})) {
        const arr = Array.isArray(items) ? items : [];
        showBlock.lists[lname] = {
          name: lname,
          state: "archived",
          items: arr.map((it, idx) => normalizeItem(it, lname, weekKey, idx))
        };
      }

      const key = chosenShowId || weekKey;
      out.shows[String(key)] = showBlock;
    }
    return out;
  }

  return out;
}

// ---------- list state + auto-archive logic ----------

function deriveListState(list, showMeta, now) {
  if (!list || !Array.isArray(list.items) || list.items.length === 0) {
    return list && list.state ? list.state : "home";
  }

  let anyToTakeNotPacked = false;
  let allToTakeResolved = true;
  let anyBringHomeNotPacked = false;
  let allBringHomeResolved = true;

  for (const it of list.items) {
    const t1 = it.to_take || "not_packed";
    const t2 = it.to_bring_home || "not_packed";

    if (t1 === "not_packed") anyToTakeNotPacked = true;
    if (!(t1 === "packed" || t1 === "not_needed" || t1 === "not_packed")) {
      allToTakeResolved = false;
    }

    if (t2 === "not_packed") anyBringHomeNotPacked = true;
    if (!(
      t2 === "packed" ||
      t2 === "missing" ||
      t2 === "broken" ||
      t2 === "left_over" ||
      t2 === "sent_back_early" ||
      t2 === "not_packed"
    )) {
      allBringHomeResolved = false;
    }
  }

  // If any to_take not packed: list is still home (pre-show packing).
  if (anyToTakeNotPacked) return "home";

  // All to_take resolved, but some bring_home not resolved: away.
  if (!anyToTakeNotPacked && allToTakeResolved && anyBringHomeNotPacked) {
    return "away";
  }

  // All bring_home resolved: complete.
  if (!anyBringHomeNotPacked && allBringHomeResolved) {
    return "complete";
  }

  return list.state || "home";
}

function shouldAutoArchiveShow(showEntry, now) {
  if (!showEntry) return false;
  const end = toDate(showEntry.end_date);
  if (!end) return false;

  const cutoff = addDays(end, 3);
  if (now < cutoff) return false;

  const lists = showEntry.lists || {};
  const names = Object.keys(lists);
  if (names.length === 0) return false;

  for (const name of names) {
    const st = lists[name].state;
    if (!(st === "complete" || st === "archived")) return false;
  }

  return true;
}

// ---------- rebuild index ----------

function rebuildIndex() {
  const ts = nowIso();
  const nowDate = new Date(ts);
  const showMeta = buildShowMetaMap();
  const startedRaw = readJson(STARTED_PATH, { version: "1.0" });
  const archivedRaw = readJson(ARCHIVED_PATH, { version: "1.0" });
  const itemManifest = readJson(ITEM_MANIFEST_PATH, { version: "1.0", items: [] });
  const updates = ensureUpdates();

  const started = normalizeStarted(startedRaw, showMeta);
  const archived = normalizeArchived(archivedRaw, showMeta);

  const autoArchived = [];

  // derive list states and auto-archive complete + aged shows
  for (const [sid, show] of Object.entries(started.shows)) {
    const meta = showMeta[sid] || {};
    const lists = show.lists || {};

    for (const [lname, list] of Object.entries(lists)) {
      list.state = deriveListState(list, meta, nowDate);
    }

    if (shouldAutoArchiveShow({ ...show, lists }, nowDate)) {
      const archivedShow = {
        show_id: show.show_id,
        show_name: show.show_name,
        start_date: show.start_date,
        end_date: show.end_date,
        lists: {}
      };

      for (const [lname, list] of Object.entries(lists)) {
        archivedShow.lists[lname] = {
          name: lname,
          state: "archived",
          items: list.items || []
        };
      }

      archived.shows[sid] = archivedShow;
      delete started.shows[sid];
      autoArchived.push(sid);

      logEvent(updates, {
        ts,
        source: "expeditor",
        action: "auto_archive_show",
        show_id: show.show_id || Number(sid),
        show_name: show.show_name || (meta.show_name || ""),
        reason: "end_date_plus_3_days",
        files_touched: [
          "lists/started_lists.json",
          "lists/archived_lists.json",
          "lists/index.json",
          "logs/updates.json"
        ],
        ok: true
      });
    }
  }

  // build index summary
  const index = {
    version: "1.0",
    built_at: ts,
    totals: {
      active_shows: 0,
      archived_shows: 0,
      items_to_take_not_packed: 0,
      items_to_bring_home_not_packed: 0,
      items_missing: 0,
      items_broken: 0,
      items_left_over: 0
    },
    active: {},
    archived: {},
    // passthrough reference for item manifest consumers
    item_manifest_version: itemManifest.version || "1.0"
  };

  // active shows
  for (const [sid, show] of Object.entries(started.shows)) {
    const meta = showMeta[sid] || {};
    const lists = show.lists || {};

    const showIndex = {
      show_id: show.show_id || Number(sid),
      show_name: show.show_name || meta.show_name || "",
      start_date: show.start_date || meta.start_date || null,
      end_date: show.end_date || meta.end_date || null,
      lists: {}
    };

    index.totals.active_shows += 1;

    for (const [lname, list] of Object.entries(lists)) {
      const counts = {
        to_take: { not_packed: 0, packed: 0, not_needed: 0 },
        to_bring_home: {
          not_packed: 0,
          packed: 0,
          missing: 0,
          broken: 0,
          left_over: 0,
          sent_back_early: 0
        }
      };

      for (const it of list.items || []) {
        const t1 = it.to_take || "not_packed";
        const t2 = it.to_bring_home || "not_packed";

        if (t1 === "not_packed") counts.to_take.not_packed++;
        else if (t1 === "packed") counts.to_take.packed++;
        else if (t1 === "not_needed") counts.to_take.not_needed++;

        if (t2 === "not_packed") counts.to_bring_home.not_packed++;
        else if (t2 === "packed") counts.to_bring_home.packed++;
        else if (t2 === "missing") counts.to_bring_home.missing++;
        else if (t2 === "broken") counts.to_bring_home.broken++;
        else if (t2 === "left_over") counts.to_bring_home.left_over++;
        else if (t2 === "sent_back_early") counts.to_bring_home.sent_back_early++;
      }

      showIndex.lists[lname] = {
        state: list.state,
        counts
      };

      index.totals.items_to_take_not_packed += counts.to_take.not_packed;
      index.totals.items_to_bring_home_not_packed += counts.to_bring_home.not_packed;
      index.totals.items_missing += counts.to_bring_home.missing;
      index.totals.items_broken += counts.to_bring_home.broken;
      index.totals.items_left_over += counts.to_bring_home.left_over;
    }

    index.active[sid] = showIndex;
  }

  // archived shows
  for (const [sid, show] of Object.entries(archived.shows)) {
    const meta = showMeta[sid] || {};
    const lists = show.lists || {};

    const showIndex = {
      show_id: show.show_id || Number(sid),
      show_name: show.show_name || meta.show_name || "",
      start_date: show.start_date || meta.start_date || null,
      end_date: show.end_date || meta.end_date || null,
      lists: {}
    };

    index.totals.archived_shows += 1;

    for (const [lname, list] of Object.entries(lists)) {
      const counts = {
        to_take: { not_packed: 0, packed: 0, not_needed: 0 },
        to_bring_home: {
          not_packed: 0,
          packed: 0,
          missing: 0,
          broken: 0,
          left_over: 0,
          sent_back_early: 0
        }
      };

      for (const it of list.items || []) {
        const t1 = it.to_take || "not_packed";
        const t2 = it.to_bring_home || "not_packed";

        if (t1 === "not_packed") counts.to_take.not_packed++;
        else if (t1 === "packed") counts.to_take.packed++;
        else if (t1 === "not_needed") counts.to_take.not_needed++;

        if (t2 === "not_packed") counts.to_bring_home.not_packed++;
        else if (t2 === "packed") counts.to_bring_home.packed++;
        else if (t2 === "missing") counts.to_bring_home.missing++;
        else if (t2 === "broken") counts.to_bring_home.broken++;
        else if (t2 === "left_over") counts.to_bring_home.left_over++;
        else if (t2 === "sent_back_early") counts.to_bring_home.sent_back_early++;
      }

      showIndex.lists[lname] = {
        state: list.state || "archived",
        counts
      };
    }

    index.archived[sid] = showIndex;
  }

  // persist normalized + index + updates + state
  writeJson(STARTED_PATH, started);
  writeJson(ARCHIVED_PATH, archived);
  writeJson(INDEX_PATH, index);
  writeJson(UPDATES_PATH, updates);

  const state = readJson(STATE_PATH, { version: "1.0" });
  state.last_expeditor_run = ts;
  if (!state.session_version) {
    state.session_version = "list-runner-1";
  }
  writeJson(STATE_PATH, state);

  return { index, autoArchived };
}

// ---------- daily backup ----------

function dailyBackup(indexSnapshot) {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const today = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(BACKUPS_DIR, `${today}-index.json`);

  if (!fs.existsSync(backupPath)) {
    const data = indexSnapshot || readJson(INDEX_PATH, {});
    writeJson(backupPath, data);
  }

  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith("-index.json"))
    .sort(); // oldest first

  const excess = files.length - 7;
  if (excess > 0) {
    for (let i = 0; i < excess; i++) {
      const f = path.join(BACKUPS_DIR, files[i]);
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

// ---------- health server ----------

function serve(port) {
  const server = http.createServer((req, res) => {
    if (req.url === "/items/agents/health" || req.url === "/items/agents/health/") {
      const index = readJson(INDEX_PATH, null);
      const state = readJson(STATE_PATH, null);
      const updates = readJson(UPDATES_PATH, { events: [] });
      const lastEvent = Array.isArray(updates.events) && updates.events.length
        ? updates.events[updates.events.length - 1]
        : null;

      const body = {
        ok: !!index,
        built_at: index && index.built_at || null,
        totals: index && index.totals || null,
        last_event_ts: lastEvent && lastEvent.ts || null,
        last_expeditor_run: state && state.last_expeditor_run || null
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body, null, 2));
      return;
    }

    if (req.url === "/items/agents/health/compact") {
      const index = readJson(INDEX_PATH, null);
      const state = readJson(STATE_PATH, null);
      const body = {
        ok: !!index,
        built_at: index && index.built_at || null,
        last_expeditor_run: state && state.last_expeditor_run || null
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });

  server.listen(port, () => {
    console.log(`expeditor health server listening on ${port}`);
  });
}

// ---------- CLI ----------

if (require.main === module) {
  const cmd = process.argv[2];

  if (cmd === "update") {
    const { index } = rebuildIndex();
    dailyBackup(index);
    console.log("Index rebuilt and backup updated.");
  } else if (cmd === "serve") {
    const { index } = rebuildIndex();
    dailyBackup(index);
    serve(8080);
  } else {
    console.log("Usage:");
    console.log("  node expeditor.js update   # rebuild index + backup");
    console.log("  node expeditor.js serve    # rebuild index + backup + health server");
  }
}

module.exports = {
  rebuildIndex,
  dailyBackup
};
