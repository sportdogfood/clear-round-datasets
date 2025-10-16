/* expeditor.js — Content Runner orchestrator (CR→SR trigger)
 * Version: 2025-10-16.CR-v1
 * Runtime: Node 18+ (global fetch), CommonJS export
 *
 * Input shape:
 *   { "task_uri": "https://items.clearroundtravel.com/items/tasks/{slug}-task-YYYY-MM-DD.json" }
 *
 * Behavior:
 *   - Load policy, schema, rules from items/runners/content/
 *   - GET task, coerce types, build allowlist, fetch items/*
 *   - Call generator(context) from ./generator.js (pure, no I/O)
 *   - Assemble content package JSON
 *   - Validate IO guards
 *   - Commit content → items/content/{slug}-content-{date}.json
 *   - Verify content by GET
 *   - Commit SR trigger → items/triggers/{slug}-trigger-{date}.json
 *   - Stop (no SR call)
 */

"use strict";

const CR_HOST = "https://items.clearroundtravel.com";
const ITEMS_PREFIX = `${CR_HOST}/items/`;
const READ_ITEMS_ENDPOINT = (p) => `${CR_HOST}/items/${p}`;
const WRITE_ITEMS_ENDPOINT = `${CR_HOST}/items/commit-bulk`;

// Static references (served by your repo under items/)
const POLICY_URL = `${ITEMS_PREFIX}runners/content/policy.json`;
const SCHEMA_URL = `${ITEMS_PREFIX}runners/content/task.schema.json`;
const RULES_URL  = `${ITEMS_PREFIX}runners/content/generator.rules.json`;

const { createHash } = require("node:crypto");

// --------- Public entry ---------
module.exports = async function expeditor(input) {
  const t0 = Date.now();
  const trace = [];
  const addTrace = (path, status) => trace.push({ path, status });

  try {
    const taskUri = extractTaskUri(input);
    // Load bootstrap assets
    const policy = await safeGetJson(POLICY_URL, addTrace, "policy");
    const schema = await safeGetJson(SCHEMA_URL, addTrace, "schema");
    const rules  = await safeGetJson(RULES_URL,  addTrace, "rules");

    // Fetch task
    const task = await safeGetJson(taskUri, addTrace, "task_uri");
    if (!task || typeof task !== "object") throw fail("Task JSON missing or invalid");

    // Normalize task
    normalizeTypes(task);

    // Derive paths
    const outputPath = requireField(task, "output_path");
    assertRegex(outputPath, new RegExp(policy.io_guards.content_path_regex), "output_path mismatch");
    const { slug, baseDate, year } = deriveFromOutputPath(outputPath);

    // Build allowlist (items/* only)
    const allowUrls = buildAllowUrls(task);
    enforceItemsOnly(allowUrls);

    // Fetch required items
    const fetchPlan = collectFetchPlan(task);
    const fetched = {};
    for (const { key, url, required } of fetchPlan) {
      if (!url) continue;
      if (!allowUrls.has(url)) {
        if (required) throw fail(`URL not allowlisted: ${url}`);
        continue;
      }
      const json = await safeGetJson(url, addTrace, key);
      if (!json && required) throw fail(`Required JSON empty: ${key}`);
      fetched[key] = json;
    }

    // Compose libs bundle (optional)
    const libs = {
      audiences: fetched.audiences_link || {},
      patterns:  fetched.intro_closing_patterns_link || {},
      ctas:      fetched.cta_closers_library_link || {},
      outros:    fetched.outro_templates_link || {},
      gold:      fetched.gold_link || {}
    };

    // Curated content sources (optional)
    const curated = {
      stay: fetched.stay_link || {},
      dine: fetched.dine_link || {},
      essentials: fetched.essentials_link || {}
    };

    // Externals are display-only; never fetched
    const externals = {
      event_official_link: task.event_official_link || "",
      venue_official_link: task.venue_official_link || ""
    };

    // Build context for generator
    const context = {
      task_uid: requireField(task, "task_uid"),
      lane: requireField(task, "lane"),
      version: requireField(task, "version"),
      commit_message: requireField(task, "commit_message"),
      event: fetched.event_link,
      venue: fetched.venue_link,
      geo: fetched.geo_link,
      section: fetched.section_link,
      libs,
      curated,
      externals,
      knobs: task.knobs || {},
      flags: task.flags || {},
      rules
    };

    // Call generator (pure function)
    const generator = requireSafe("./generator.js");
    const genResult = await generator(context); // expected: { sections, seo, metrics }

    // Assemble content package
    const content = assembleContentPackage({
      slug, baseDate, year, taskUri, task, fetched, genResult, policy, rules
    });

    // IO validations (size, utf-8, path, image http)
    ioValidateContent(content, policy);

    // Commit content package
    const contentJson = JSON.stringify(content, null, 2);
    const contentWrite = await commitItems(
      {
        message: task.commit_message || `content ${slug} ${baseDate}`,
        files: [
          {
            path: outputPath,
            content_type: "application/json",
            content_base64: toB64(contentJson)
          }
        ]
      },
      addTrace,
      "content_write"
    );

    // Verify content by GET
    const relContentPath = stripItemsPrefix(outputPath);
    const verifyTxt = await safeGetText(READ_ITEMS_ENDPOINT(relContentPath), addTrace, "content_verify");
    if (!verifyTxt || verifyTxt.length < (policy.io_guards.min_bytes || 256)) {
      throw fail("Content verify failed or too small");
    }

    // Build SR trigger
    const triggerPath = `items/triggers/${slug}-trigger-${baseDate}.json`;
    assertRegex(triggerPath, new RegExp(policy.io_guards.trigger_path_regex), "trigger_path mismatch");

    const srTrigger = buildSrTrigger({
      outputPath,
      year,
      commit_message: task.commit_message,
      event_link: task.event_link, // optional
      images_link: task.images_link // optional if present in task
    });

    const triggerWrite = await commitItems(
      {
        message: task.commit_message || `trigger ${slug} ${baseDate}`,
        files: [
          {
            path: triggerPath,
            content_type: "application/json",
            content_base64: toB64(JSON.stringify(srTrigger, null, 2))
          }
        ]
      },
      addTrace,
      "trigger_write"
    );

    const t1 = Date.now();
    return {
      ok: true,
      ms: t1 - t0,
      content_path: outputPath,
      trigger_path: triggerPath,
      committed: contentWrite?.committed_paths || [],
      trace
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err && err.message ? err.message : err),
      trace
    };
  }
};

// --------- Helpers ---------

function extractTaskUri(input) {
  let obj = input;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); } catch (_) {}
  }
  if (!obj || typeof obj !== "object") throw fail("Input must be object or JSON");
  const uri = obj.task_uri || obj.taskUri;
  if (!uri || typeof uri !== "string") throw fail("task_uri missing");
  if (!uri.startsWith(ITEMS_PREFIX)) throw fail("task_uri must be items/* absolute URL");
  return uri;
}

async function safeGetJson(url, addTrace, label) {
  const { status, text, headers } = await httpGet(url);
  addTrace(label || url, status);
  if (status !== 200) return null;
  const ct = headers.get("content-type") || "";
  if (ct.includes("application/json") || ct.includes("text/plain")) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }
  return null;
}

async function safeGetText(url, addTrace, label) {
  const { status, text } = await httpGet(url);
  addTrace(label || url, status);
  if (status !== 200) return null;
  return text;
}

async function httpGet(url) {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

function requireField(obj, key) {
  if (!obj || !(key in obj)) throw fail(`Missing required field: ${key}`);
  return obj[key];
}

function normalizeTypes(task) {
  // flags: coerce "true"/"false" to booleans
  if (task.flags && typeof task.flags === "object") {
    for (const k of Object.keys(task.flags)) {
      const v = task.flags[k];
      if (v === "true") task.flags[k] = true;
      if (v === "false") task.flags[k] = false;
    }
  }
  // knobs: numeric strings to ints
  if (task.knobs && typeof task.knobs === "object") {
    for (const k of Object.keys(task.knobs)) {
      const v = task.knobs[k];
      if (typeof v === "string" && /^\d+$/.test(v)) task.knobs[k] = parseInt(v, 10);
    }
  }
  // coerce CSV link fields to arrays if present
  const csvKeys = [
    "food_preview_am_links",
    "food_preview_lunch_links",
    "food_preview_dinner_links",
    "hotel_premium_links",
    "hotel_preview_standard_links",
    "spot_grocery_links",
    "spot_pharmacy_links",
    "spot_feed_links",
    "spot_cart_links",
    "spot_car_links"
  ];
  for (const k of csvKeys) {
    const v = task[k];
    if (typeof v === "string" && v.includes("http")) {
      task[k] = v.split(",").map(s => s.trim()).filter(Boolean);
    }
  }
}

function buildAllowUrls(task) {
  const urls = new Set();
  const add = (u) => { if (typeof u === "string" && u.startsWith(ITEMS_PREFIX)) urls.add(u); };
  for (const [k, v] of Object.entries(task)) {
    if (k.endsWith("_link")) add(v);
    if (k.endsWith("_links")) {
      if (Array.isArray(v)) v.forEach(add);
      else if (typeof v === "string") v.split(",").map(s => s.trim()).forEach(add);
    }
  }
  return urls;
}

function enforceItemsOnly(allowUrls) {
  for (const u of allowUrls) {
    if (!u.startsWith(ITEMS_PREFIX)) throw fail(`Non-items URL in allowlist: ${u}`);
  }
}

function collectFetchPlan(task) {
  // required core
  const plan = [
    { key: "event_link", url: task.event_link, required: true },
    { key: "venue_link", url: task.venue_link, required: true },
    { key: "geo_link", url: task.geo_link, required: true },
    { key: "section_link", url: task.section_link, required: true },

    // optional libs
    { key: "audiences_link", url: task.audiences_link, required: false },
    { key: "intro_closing_patterns_link", url: task.intro_closing_patterns_link, required: false },
    { key: "cta_closers_library_link", url: task.cta_closers_library_link, required: false },
    { key: "outro_templates_link", url: task.outro_templates_link, required: false },
    { key: "gold_link", url: task.gold_link, required: false },
    { key: "founder_link", url: task.founder_link, required: false },
    { key: "keywords_link", url: task.keywords_link, required: false },
    { key: "insiders_link", url: task.insiders_link, required: false },

    // zone data
    { key: "stay_link", url: task.stay_link, required: false },
    { key: "dine_link", url: task.dine_link, required: false },
    { key: "essentials_link", url: task.essentials_link, required: false }
  ];
  return plan;
}

function deriveFromOutputPath(outputPath) {
  // items/content/{slug}-content-YYYY-MM-DD.json
  const m = outputPath.match(/^items\/content\/([a-z0-9-]+)-content-(\d{4}-\d{2}-\d{2})\.json$/);
  if (!m) throw fail("Unable to derive slug/date from output_path");
  const [, slug, baseDate] = m;
  const year = baseDate.slice(0, 4);
  return { slug, baseDate, year };
}

function assembleContentPackage({ slug, baseDate, year, taskUri, task, fetched, genResult, policy, rules }) {
  const { sections, seo, metrics } = genResult || {};
  if (!sections) throw fail("generator returned no sections");

  const manifest = {
    slug,
    date: baseDate,
    year,
    venue: pick(fetched.venue_link, "name", "uid", "city", "state", "country"),
    event: pick(fetched.event_link, "name", "uid"),
    city: fetched.venue_link?.city || "",
    state: fetched.venue_link?.state || "",
    country: fetched.venue_link?.country || "",
    timezone: fetched.venue_link?.timezone || "",
    start_date: fetched.event_link?.start_date || "",
    end_date: fetched.event_link?.end_date || "",
    seo: seo || {}
  };

  const provenance = {
    task_uid: task.task_uid || "",
    task_uri: taskUri,
    policy_uri: POLICY_URL,
    schema_uri: SCHEMA_URL,
    rules_uri: RULES_URL,
    sources: buildSourcesEcho(task),
    allowlist_hash: sha256(Array.from(buildAllowUrls(task)).sort().join("|")),
    generator_version: String(task.version || ""),
    expeditor_version: "2025-10-16.CR-v1"
  };

  const quality = {
    word_counts: metrics?.word_counts || {},
    paragraph_checks: metrics?.paragraph_checks || {},
    templates_used: metrics?.templates_used || {},
    labels: metrics?.labels || {},
    duplicates: { ngram_max_jaccard: metrics?.ngram_max_jaccard ?? 0 },
    warnings: [],
    errors: []
  };

  const validation = {
    status: "pass",
    flags: metrics?.flags || {}
  };

  return { manifest, sections, provenance, quality, validation };
}

function ioValidateContent(content, policy) {
  const minBytes = policy.io_guards?.min_bytes ?? 256;
  const asTxt = JSON.stringify(content);
  if (Buffer.byteLength(asTxt, "utf8") < minBytes) throw fail("content below min-bytes");

  // OG image if present must be http(s)
  const og = content?.manifest?.seo?.open_graph_image;
  if (og && !/^https?:\/\//.test(og)) throw fail("open_graph_image must be http(s)");

  // Items minima (if present)
  const s = content.sections || {};
  if (s.stay?.items && s.stay.items.length < 2) throw fail("stay items < 2");
  if (s.dine?.items && s.dine.items.length < 3) throw fail("dine items < 3");
  if (s.essentials?.items && s.essentials.items.length < 5) throw fail("essentials items < 5");
}

async function commitItems(body, addTrace, label) {
  const res = await fetch(WRITE_ITEMS_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overwrite: true, ...body })
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  addTrace(label, res.status);
  if (!res.ok) throw fail(`commit-bulk failed: ${res.status}`);
  return json;
}

function buildSrTrigger({ outputPath, year, commit_message, event_link, images_link }) {
  const content_link = `${CR_HOST}/${outputPath}`; // absolute items URL
  const post_folder_slug = basenameNoExt(outputPath);
  const trigger = {
    content_link,
    year: String(year),
    post_folder_slug,
    commit_message: commit_message || `Publish ${post_folder_slug}`
  };
  if (event_link && event_link.startsWith(ITEMS_PREFIX)) trigger.event_link = event_link;
  if (images_link && images_link.startsWith(ITEMS_PREFIX)) trigger.images_link = images_link;
  return trigger;
}

function stripItemsPrefix(p) {
  if (p.startsWith("items/")) return p.slice("items/".length);
  if (p.startsWith(`${CR_HOST}/items/`)) return p.slice(`${CR_HOST}/items/`.length);
  return p;
}

function basenameNoExt(p) {
  const name = p.split("/").pop() || "";
  return name.replace(/\.json$/i, "");
}

function toB64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

function pick(obj, ...keys) {
  const out = {};
  if (!obj) return out;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

function fail(msg) {
  const err = new Error(msg);
  err.name = "CR_EXPEDITOR_ERROR";
  return err;
}

function requireSafe(path) {
  try {
    const mod = require(path);
    if (typeof mod !== "function" && typeof mod?.default !== "function") {
      throw new Error("generator export must be a function");
    }
    return typeof mod === "function" ? mod : mod.default;
  } catch (e) {
    throw fail(`generator load failed: ${e.message}`);
  }
}
