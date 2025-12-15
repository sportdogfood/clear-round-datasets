/* trainer_render.js
 * Exposes: window.CRT_trainerRender(rootEl, trainerRowsOrRings)
 *
 * Locked behavior:
 * - Ring-first
 * - Toggle display-only: Default vs Detail
 *   - Default: Ring → Class Group (horses combined) → Class lines
 *   - Detail: if >1 horse in a group: Ring → (Class Group — HORSE) → that horse’s class lines
 * - No rider details in UI
 * - Adds render logs (console + sessionStorage.trainer_render_log)
 */
(() => {
  "use strict";

  const LOG_KEY = "trainer_render_log";
  const LOG_MAX = 200;

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return ""; }
  }

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch (_) { return null; }
  }

  function pushLog(step) {
    const entry = Object.assign({ at: nowIso() }, step || {});
    try {
      const cur = safeJsonParse(sessionStorage.getItem(LOG_KEY)) || [];
      cur.push(entry);
      while (cur.length > LOG_MAX) cur.shift();
      sessionStorage.setItem(LOG_KEY, JSON.stringify(cur));
    } catch (_) {}
    try { console.log("[TRAINER_RENDER]", entry); } catch (_) {}
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function uniq(arr) {
    const s = new Set();
    const out = [];
    for (const x of arr || []) {
      const v = String(x || "").trim();
      if (!v) continue;
      if (!s.has(v)) { s.add(v); out.push(v); }
    }
    return out;
  }

  function toNum(x, d = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : d;
  }

  function timeToMinutes(t) {
    // expects "HH:MM:SS" or "HH:MM"
    if (!t) return null;
    const s = String(t).trim();
    const parts = s.split(":").map(p => Number(p));
    if (parts.length < 2 || parts.some(p => !Number.isFinite(p))) return null;
    const h = parts[0], m = parts[1];
    return h * 60 + m;
  }

  function fmtClassLine(c) {
    const time = (c && (c.sched_time || c.time || c.estimated_start_time || c.start_time_default)) || "";
    const t = time ? `${time} · ` : "";
    const numVal = (c && (c.class_number != null ? c.class_number : c.number));
    const num = (numVal != null && String(numVal).trim() !== "") ? `${numVal} · ` : "";
    const name = (c && (c.class_name || c.name)) || "—";
    return `${t}${num}${name}`;
  }

  function normalizeToRings(input) {
    // Accepts:
    // A) rings-array: [{ ring, ring_name?, groups:[...] }, ...]
    // B) groups-array: [{ ring, class_group_id, horses:[...], classes:[...] }, ...]
    // C) rows-array (class rows): [{ ring, class_group_id, class_id, class_number, class_name, sched_time, entries:[...] }, ...]
    if (!Array.isArray(input)) return [];

    // A) Rings array
    const looksLikeRings = input.length && input[0] && Array.isArray(input[0].groups);
    if (looksLikeRings) {
      const rings = input
        .map(r => ({
          ring: (r.ring != null ? r.ring : r.ring_number),
          ring_name: r.ring_name || "",
          groups: Array.isArray(r.groups) ? r.groups : []
        }))
        .filter(r => r.ring != null);

      rings.sort((a, b) => toNum(a.ring, 9999) - toNum(b.ring, 9999));
      return rings;
    }

    // B) Groups array
    const looksLikeGroups = input.length && input[0] && input[0] && Array.isArray(input[0].classes) && (input[0].class_group_id != null || input[0].group_sequence != null);
    if (looksLikeGroups) {
      const byRing = new Map();
      for (const g of input) {
        const ring = (g && g.ring != null) ? g.ring : "—";
        if (!byRing.has(ring)) byRing.set(ring, []);
        byRing.get(ring).push(g);
      }
      const rings = Array.from(byRing.entries()).map(([ring, groups]) => ({
        ring,
        ring_name: "",
        groups: groups || []
      }));
      rings.sort((a, b) => toNum(a.ring, 9999) - toNum(b.ring, 9999));
      return rings;
    }

    // C) Class rows array → build groups → rings
    const looksLikeRows = input.length && input[0] && (input[0].ring != null) && (input[0].class_group_id != null) && (input[0].class_id != null);
    if (looksLikeRows) {
      const ringMap = new Map(); // ring -> groupMap
      for (const row of input) {
        const ring = row.ring;
        const gid = row.class_group_id;
        if (ring == null || gid == null) continue;

        if (!ringMap.has(ring)) ringMap.set(ring, new Map());
        const gmap = ringMap.get(ring);

        if (!gmap.has(gid)) {
          gmap.set(gid, {
            ring,
            class_group_id: gid,
            group_sequence: row.group_sequence != null ? row.group_sequence : null,
            horses: [],
            classes: []
          });
        }

        const g = gmap.get(gid);
        g.classes.push({
          class_id: row.class_id,
          class_number: row.class_number,
          class_name: row.class_name,
          sched_time: row.sched_time || "",
          sched_minutes: row.sched_minutes != null ? row.sched_minutes : timeToMinutes(row.sched_time),
          entries: Array.isArray(row.entries) ? row.entries : []
        });

        const horses = uniq((row.entries || []).map(e => e && e.horse));
        for (const h of horses) g.horses.push(h);
        g.horses = uniq(g.horses);
      }

      const rings = [];
      for (const [ring, gmap] of ringMap.entries()) {
        const groups = Array.from(gmap.values());
        rings.push({ ring, ring_name: "", groups });
      }
      rings.sort((a, b) => toNum(a.ring, 9999) - toNum(b.ring, 9999));
      return rings;
    }

    return [];
  }

  function sortGroups(groups) {
    const out = Array.isArray(groups) ? groups.slice() : [];
    out.sort((a, b) => {
      const sa = (a && (a.group_sequence != null ? a.group_sequence : a.class_group_sequence)) ;
      const sb = (b && (b.group_sequence != null ? b.group_sequence : b.class_group_sequence)) ;
      const na = sa == null ? 9999 : toNum(sa, 9999);
      const nb = sb == null ? 9999 : toNum(sb, 9999);
      if (na !== nb) return na - nb;
      const ga = (a && a.class_group_id) != null ? toNum(a.class_group_id, 0) : 0;
      const gb = (b && b.class_group_id) != null ? toNum(b.class_group_id, 0) : 0;
      return ga - gb;
    });
    return out;
  }

  function sortClasses(classes) {
    const out = Array.isArray(classes) ? classes.slice() : [];
    out.sort((a, b) => {
      const ma = (a && (a.sched_minutes != null ? a.sched_minutes : timeToMinutes(a.sched_time))) ;
      const mb = (b && (b.sched_minutes != null ? b.sched_minutes : timeToMinutes(b.sched_time))) ;
      const na = ma == null ? 9999 : toNum(ma, 9999);
      const nb = mb == null ? 9999 : toNum(mb, 9999);
      if (na !== nb) return na - nb;
      const ca = (a && a.class_number != null) ? toNum(a.class_number, 9999) : 9999;
      const cb = (b && b.class_number != null) ? toNum(b.class_number, 9999) : 9999;
      if (ca !== cb) return ca - cb;
      const ia = (a && a.class_id != null) ? toNum(a.class_id, 0) : 0;
      const ib = (b && b.class_id != null) ? toNum(b.class_id, 0) : 0;
      return ia - ib;
    });
    return out;
  }

  function buildHorseIndex(group) {
    // horse -> deduped list of classes (only those where that horse appears in entries)
    const ix = new Map();
    const seen = new Map(); // horse -> Set(class_id)
    for (const c of group.classes || []) {
      const entries = Array.isArray(c.entries) ? c.entries : [];
      const horses = uniq(entries.map(e => e && e.horse));
      for (const h of horses) {
        if (!h) continue;
        if (!ix.has(h)) ix.set(h, []);
        if (!seen.has(h)) seen.set(h, new Set());
        const s = seen.get(h);
        const cid = c.class_id != null ? String(c.class_id) : "";
        if (cid && s.has(cid)) continue;
        if (cid) s.add(cid);
        ix.get(h).push(c);
      }
    }
    // sort each horse list
    for (const [h, cls] of ix.entries()) ix.set(h, sortClasses(cls));
    return ix;
  }

  function renderToolbar(root, mode, onMode) {
    const bar = el("div", "report-toolbar");
    const left = el("div", "report-toolbar-left", "View:");
    const btnA = el("button", "report-btn", "Default");
    const btnB = el("button", "report-btn", "Detail");
    btnA.type = "button";
    btnB.type = "button";

    if (mode === "default") btnA.classList.add("report-btn--active");
    if (mode === "detail") btnB.classList.add("report-btn--active");

    btnA.addEventListener("click", () => onMode("default"));
    btnB.addEventListener("click", () => onMode("detail"));

    bar.appendChild(left);
    bar.appendChild(btnA);
    bar.appendChild(btnB);
    root.appendChild(bar);
  }

  function renderRingHeader(root, ringObj) {
    const ring = ringObj && ringObj.ring != null ? ringObj.ring : "—";
    root.appendChild(el("div", "ring-header", `Ring ${ring}`));
  }

  function renderGroupDefault(root, g) {
    const horses = uniq(g && g.horses);
    const label = horses.length ? `Class Group — ${horses.join(", ")}` : `Class Group`;
    root.appendChild(el("div", "group-header", label));

    const list = el("div", "class-list");
    for (const c of sortClasses(g && g.classes)) {
      list.appendChild(el("div", "class-line", fmtClassLine(c)));
    }
    root.appendChild(list);
  }

  function renderGroupDetail(root, g) {
    const horses = uniq(g && g.horses);
    const multi = horses.length > 1;

    // If 0 or 1 horse, detail == default behavior (locked)
    if (!multi) {
      renderGroupDefault(root, g);
      return;
    }

    // If >1 horse: split into horse-specific group sections
    const ix = buildHorseIndex(g);

    for (const horse of horses) {
      root.appendChild(el("div", "group-header", `Class Group — ${horse}`));

      const list = el("div", "class-list");
      const cls = ix.get(horse) || [];
      for (const c of cls) list.appendChild(el("div", "class-line", fmtClassLine(c)));
      root.appendChild(list);
    }
  }

  function summarizeCounts(rings) {
    let ringsN = 0, groupsN = 0, classesN = 0;
    for (const r of rings || []) {
      ringsN++;
      const gs = Array.isArray(r.groups) ? r.groups : [];
      groupsN += gs.length;
      for (const g of gs) classesN += Array.isArray(g.classes) ? g.classes.length : 0;
    }
    return { rings: ringsN, groups: groupsN, classes: classesN };
  }

  function renderInto(rootEl, rings, mode) {
    rootEl.innerHTML = "";
    renderToolbar(rootEl, mode, nextMode => renderInto(rootEl, rings, nextMode));

    const counts = summarizeCounts(rings);
    pushLog({ name: "render.start", mode, counts });

    if (!rings.length) {
      rootEl.appendChild(el("div", "empty-state", "No trainer data"));
      pushLog({ name: "render.empty", reason: "rings.length==0" });
      return;
    }

    for (const ringObj of rings) {
      renderRingHeader(rootEl, ringObj);

      const groups = sortGroups(Array.isArray(ringObj.groups) ? ringObj.groups : []);
      if (!groups.length) {
        rootEl.appendChild(el("div", "empty-state", "No class groups"));
        continue;
      }

      for (const g of groups) {
        if (mode === "detail") renderGroupDetail(rootEl, g);
        else renderGroupDefault(rootEl, g);
      }
    }

    pushLog({ name: "render.done", mode });
  }

  window.CRT_trainerRender = function (rootEl, trainerRowsOrRings) {
    const rings = normalizeToRings(trainerRowsOrRings);
    pushLog({
      name: "inputs.detected",
      input_type: Array.isArray(trainerRowsOrRings) ? "array" : typeof trainerRowsOrRings,
      rings_len: rings.length,
      counts: summarizeCounts(rings)
    });

    // default mode is locked as "default"
    renderInto(rootEl, rings, "default");
  };
})();
