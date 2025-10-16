"use strict";

/* expeditor.js — Content Runner orchestrator (CR → park SR trigger + corpus ledger)
 * Version: 2025-10-16.CR-v3
 * Node 18+ (global fetch). CommonJS export.
 */

const CR_HOST = "https://items.clearroundtravel.com";
const ITEMS_PREFIX = `${CR_HOST}/items/`;
const READ_ITEMS = (p) => `${CR_HOST}/items/${p}`;
const WRITE_ITEMS = `${CR_HOST}/items/commit-bulk`;

const POLICY_URL = `${ITEMS_PREFIX}runners/content/policy.json`;
const SCHEMA_URL = `${ITEMS_PREFIX}runners/content/task.schema.json`;
const RULES_URL  = `${ITEMS_PREFIX}runners/content/generator.rules.json`;

const LEDGER_REL = `runners/content/corpus_fingerprint.ndjson`;
const LEDGER_URL = READ_ITEMS(LEDGER_REL);

const { createHash } = require("node:crypto");

module.exports = async function expeditor(input) {
  const t0 = Date.now();
  const trace = [];
  const T = (path, status) => trace.push({ path, status });

  try {
    const taskUri = extractTaskUri(input);
    const policy = await getJson(POLICY_URL, T, "policy");
    await getJson(SCHEMA_URL, T, "schema"); // reserved
    const rules  = await getJson(RULES_URL,  T, "rules");

    // Read ledger (best-effort)
    const ledgerText = await getText(LEDGER_URL, T, "ledger_read");
    const ledger = parseLedger(ledgerText);

    const task = await getJson(taskUri, T, "task_uri");
    if (!task || typeof task !== "object") throw fail("Task JSON missing");

    normalizeTypes(task);

    const outputPath = req(task, "output_path");
    assertRegex(outputPath, new RegExp(policy.io_guards.content_path_regex), "output_path");

    const { slug, date: baseDate, year } = derive(outputPath);

    const links = mergeLinks(task.links || {}, task);
    const plan = fetchPlan(links);

    const allow = buildAllow(plan);
    enforceItemsOnly(allow);

    const fetched = {};
    for (const { key, url, required } of plan) {
      if (!url) continue;
      if (!allow.has(url)) { if (required) throw fail(`Not allowlisted: ${url}`); continue; }
      const json = await getJson(url, T, key);
      if (!json && required) throw fail(`Required empty: ${key}`);
      fetched[key] = json;
    }

    const libs = {
      audiences: fetched.audiences_link || {},
      insiders:  fetched.insiders_link || {},
      keywords:  fetched.keywords_link || {},
      templates: fetched.outro_templates_link || {},
      ctas:      fetched.cta_closers_library_link || {},
      patterns:  fetched.intro_closing_patterns_link || {},
      gold:      fetched.gold_link || {}
    };

    const curated = {
      stay: fetched.stay_link || {},
      dine: fetched.dine_link || {},
      essentials: fetched.essentials_link || {}
    };

    const externals = {
      event_official_link: links.event_official_link || "",
      venue_official_link: links.venue_official_link || "",
      city_profile_link:   links.city_profile_link || "",
      seasonal_context_link: links.seasonal_context_link || ""
    };

    const generator = requireSafe("./generator.js");

    const context = {
      task_uid: task.task_uid || "",
      lane: task.lane || "blog",
      version: task.version || "1.0.0",
      event: fetched.event_link,
      venue: fetched.venue_link,
      geo: fetched.geo_link,
      section: fetched.section_link,
      libs, curated, externals,
      knobs: task.knobs || {},
      flags: task.flags || {},
      rules
    };

    const gen = await generator(context); // { sections, seo, metrics }
    if (!gen || !gen.sections) throw fail("generator returned no sections");

    // -------- corpus similarity check (pre-commit) --------
    const curText = concatSections(gen.sections);
    const curTri = ngrams(normalize(curText), 3);
    const curTTR = ttr(curText);
    const { maxScore, matchPath } = jaccardAgainstLedger(curTri, ledger);
    const corpusWarnings = [];
    if (maxScore >= 0.72) corpusWarnings.push(`corpus_similarity: ${maxScore.toFixed(3)} vs ${matchPath}`);

    // -------- assemble + validate --------
    const content = assemble({
      slug, baseDate, year, taskUri, task, fetched, gen, policy, corpusWarnings
    });

    ioValidate(content, policy);

    // -------- commit content --------
    const contentJson = JSON.stringify(content, null, 2);
    await commitItems({
      message: task.commit_message || `content ${slug} ${baseDate}`,
      files: [{ path: outputPath, content_type: "application/json", content_base64: b64(contentJson) }]
    }, T, "content_write");

    const rel = stripItems(outputPath);
    const verify = await getText(READ_ITEMS(rel), T, "content_verify");
    if (!verify || verify.length < (policy.io_guards.min_bytes || 512)) throw fail("verify too small");

    // -------- park SR trigger --------
    const triggerPath = `items/triggers/${slug}-trigger-${baseDate}.json`;
    assertRegex(triggerPath, new RegExp(policy.io_guards.trigger_path_regex), "trigger_path");

    const trigger = {
      content_link: `${CR_HOST}/${outputPath}`,
      year: String(year),
      post_folder_slug: basenameNoExt(outputPath),
      commit_message: task.commit_message || `Publish ${slug}`
    };
    if (links.event_link)  trigger.event_link  = links.event_link;
    if (links.images_link) trigger.images_link = links.images_link;

    await commitItems({
      message: task.commit_message || `trigger ${slug} ${baseDate}`,
      files: [{ path: triggerPath, content_type: "application/json", content_base64: b64(JSON.stringify(trigger, null, 2)) }]
    }, T, "trigger_write");

    // -------- append to corpus ledger (best-effort) --------
    const ledgerEntry = {
      ts_iso: new Date().toISOString(),
      content_path: outputPath,
      sha256: sha256(curText),
      ttr: +curTTR.toFixed(4),
      tri: sampleSet(curTri, 200),      // cap size
      max_sim_prev: +maxScore.toFixed(4),
      similar_to: matchPath || ""
    };
    const newLedgerText = (ledgerText || "") + JSON.stringify(ledgerEntry) + "\n";
    await commitItems({
      message: `ledger append ${slug} ${baseDate}`,
      files: [{ path: `items/${LEDGER_REL}`, content_type: "text/plain", content_base64: b64(newLedgerText) }]
    }, T, "ledger_write");

    return {
      ok: true,
      ms: Date.now() - t0,
      content_path: outputPath,
      trigger_path: triggerPath,
      trace
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e), trace };
  }
};

/* ---------------- helpers ---------------- */

function extractTaskUri(input) {
  let obj = input;
  if (typeof input === "string") { try { obj = JSON.parse(input); } catch {} }
  if (!obj || typeof obj !== "object") throw fail("Input must be object/JSON");
  const uri = obj.task_uri || obj.taskUri;
  if (!uri || typeof uri !== "string") throw fail("task_uri missing");
  if (!uri.startsWith(ITEMS_PREFIX)) throw fail("task_uri must be items/* absolute URL");
  return uri;
}

async function getJson(url, T, label) {
  const { status, text, headers } = await httpGet(url);
  T(label || url, status);
  if (status !== 200) return null;
  const ct = headers.get("content-type") || "";
  if (ct.includes("application/json") || ct.includes("text/plain")) {
    try { return JSON.parse(text); } catch { return null; }
  }
  return null;
}

async function getText(url, T, label) {
  const { status, text } = await httpGet(url);
  T(label || url, status);
  return status === 200 ? text : null;
}

async function httpGet(url) {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

function normalizeTypes(task) {
  for (const k of ["flags","knobs"]) {
    if (task[k] && typeof task[k] === "object") {
      for (const kk of Object.keys(task[k])) {
        if (task[k][kk] === "true") task[k][kk] = true;
        if (task[k][kk] === "false") task[k][kk] = false;
        if (typeof task[k][kk] === "string" && /^\d+$/.test(task[k][kk])) task[k][kk] = parseInt(task[k][kk], 10);
      }
    }
  }
  const csvKeys = [
    "food_preview_am_links","food_preview_lunch_links","food_preview_dinner_links",
    "hotel_premium_links","hotel_preview_standard_links",
    "spot_grocery_links","spot_pharmacy_links","spot_feed_links","spot_cart_links","spot_car_links"
  ];
  for (const k of csvKeys) {
    const v = task[k];
    if (typeof v === "string" && v.includes("http")) task[k] = v.split(",").map(s => s.trim()).filter(Boolean);
  }
}

function mergeLinks(links, flat) {
  const out = { ...links };
  for (const [k,v] of Object.entries(flat)) {
    if ((k.endsWith("_link") || k.endsWith("_links")) && out[k] == null) out[k] = v;
  }
  return out;
}

function fetchPlan(L) {
  return [
    { key: "event_link", url: L.event_link, required: true },
    { key: "venue_link", url: L.venue_link, required: true },
    { key: "geo_link", url: L.geo_link, required: true },
    { key: "section_link", url: L.section_link, required: true },
    { key: "audiences_link", url: L.audiences_link, required: false },
    { key: "insiders_link", url: L.insiders_link, required: false },
    { key: "keywords_link", url: L.keywords_link, required: false },
    { key: "outro_templates_link", url: L.outro_templates_link, required: false },
    { key: "cta_closers_library_link", url: L.cta_closers_library_link, required: false },
    { key: "intro_closing_patterns_link", url: L.intro_closing_patterns_link, required: false },
    { key: "gold_link", url: L.gold_link, required: false },
    { key: "stay_link", url: L.stay_link, required: false },
    { key: "dine_link", url: L.dine_link, required: false },
    { key: "essentials_link", url: L.essentials_link, required: false }
  ];
}

function buildAllow(plan) {
  const urls = new Set();
  for (const p of plan) if (typeof p.url === "string" && p.url.startsWith(ITEMS_PREFIX)) urls.add(p.url);
  return urls;
}

function enforceItemsOnly(allow) {
  for (const u of allow) if (!u.startsWith(ITEMS_PREFIX)) throw fail(`Non-items URL: ${u}`);
}

function req(obj, key) { if (!obj || !(key in obj)) throw fail(`Missing ${key}`); return obj[key]; }

function derive(outputPath) {
  const m = outputPath.match(/^items\/content\/([a-z0-9-]+)-content-(\d{4}-\d{2}-\d{2})\.json$/);
  if (!m) throw fail("Bad output_path");
  return { slug: m[1], date: m[2], year: m[2].slice(0,4) };
}

function assemble({ slug, baseDate, year, taskUri, task, fetched, gen, policy, corpusWarnings }) {
  const { sections, seo, metrics } = gen;
  const manifest = {
    slug, date: baseDate, year,
    venue: pick(fetched.venue_link, "name", "uid", "city", "state", "country", "acronym", "timezone"),
    event: pick(fetched.event_link, "name", "uid", "start_date", "end_date"),
    city: fetched.venue_link?.city || "",
    state: fetched.venue_link?.state || "",
    country: fetched.venue_link?.country || "",
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
    sources: echoSources(task),
    allowlist_hash: sha256(JSON.stringify(Object.keys(task).filter(k => k.endsWith("_link")).sort())),
    expeditor_version: "2025-10-16.CR-v3",
    generator_version: String(task.version || "")
  };
  const validation = { status: "pass", flags: metrics?.flags || {} };
  const quality = {
    word_counts: metrics?.word_counts || {},
    paragraph_checks: metrics?.paragraph_checks || {},
    templates_used: metrics?.templates_used || {},
    labels: metrics?.labels || {},
    duplicates: { ngram_max_jaccard: metrics?.ngram_max_jaccard ?? 0 },
    warnings: Array.isArray(corpusWarnings) ? corpusWarnings.slice() : [],
    errors: []
  };
  return { manifest, sections, quality, validation, provenance };
}

function ioValidate(content, policy) {
  const minBytes = policy.io_guards?.min_bytes ?? 512;
  const txt = JSON.stringify(content);
  if (Buffer.byteLength(txt, "utf8") < minBytes) throw fail("content below min-bytes");
  const og = content?.manifest?.seo?.open_graph_image;
  if (og && !/^https?:\/\//.test(og)) throw fail("open_graph_image must be http(s)");
  const s = content.sections || {};
  if (s.stay?.items && s.stay.items.length < 2) throw fail("stay items < 2");
  if (s.dine?.items && s.dine.items.length < 3) throw fail("dine items < 3");
  if (s.essentials?.items && s.essentials.items.length < 5) throw fail("essentials items < 5");
}

async function commitItems(body, T, label) {
  const res = await fetch(WRITE_ITEMS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ overwrite: true, ...body }) });
  let json = null; try { json = await res.json(); } catch {}
  T(label, res.status);
  if (!res.ok) throw fail(`commit-bulk failed: ${res.status}`);
  return json;
}

function stripItems(p) {
  if (p.startsWith("items/")) return p.slice(6);
  if (p.startsWith(`${CR_HOST}/items/`)) return p.slice(`${CR_HOST}/items/`.length);
  return p;
}

function basenameNoExt(p) { const n = p.split("/").pop() || ""; return n.replace(/\.json$/i, ""); }
function b64(s) { return Buffer.from(s, "utf8").toString("base64"); }
function sha256(s) { return createHash("sha256").update(s).digest("hex"); }
function pick(obj, ...keys) { const out = {}; if (!obj) return out; for (const k of keys) if (k in obj) out[k] = obj[k]; return out; }
function echoSources(task) {
  const out = {};
  for (const [k,v] of Object.entries(task)) if (k.endsWith("_link")) out[k] = v;
  if (task.links) for (const [k,v] of Object.entries(task.links)) if (k.endsWith("_link")) out[k] = v;
  return out;
}
function fail(msg) { const e = new Error(msg); e.name = "CR_EXPEDITOR_ERROR"; return e; }
function requireSafe(p) {
  try {
    const mod = require(p);
    const fn = typeof mod === "function" ? mod : (mod && typeof mod.default === "function" ? mod.default : null);
    if (!fn) throw new Error("generator export must be a function");
    return fn;
  } catch (e) { throw fail(`generator load failed: ${e.message}`); }
}

/* ---------- corpus ledger helpers ---------- */

function parseLedger(text) {
  if (!text) return [];
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const ln of lines) {
    try {
      const j = JSON.parse(ln);
      if (Array.isArray(j.tri)) out.push({ path: j.content_path || "", tri: new Set(j.tri) });
    } catch {}
  }
  return out;
}

function jaccardAgainstLedger(curTri, ledger) {
  let maxScore = 0;
  let matchPath = "";
  for (const e of ledger) {
    const score = jacc(curTri, e.tri || new Set());
    if (score > maxScore) { maxScore = score; matchPath = e.path; }
  }
  return { maxScore, matchPath };
}

function concatSections(sections) {
  const parts = [];
  if (sections.hello?.intro) parts.push(sections.hello.intro);
  if (sections.hello?.transition) parts.push(sections.hello.transition);
  for (const k of ["stay","dine","locale","essentials"]) if (sections[k]?.paragraph) parts.push(sections[k].paragraph);
  if (sections.outro?.pivot) parts.push(sections.outro.pivot);
  if (sections.outro?.main) parts.push(sections.outro.main);
  return parts.join(" ").trim();
}

function normalize(s) { return String(s||"").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }

function ngrams(s, n) {
  const toks = s.split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i=0;i<=toks.length-n;i++) out.add(toks.slice(i,i+n).join(" "));
  return out;
}

function jacc(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function ttr(text) {
  const toks = text.toLowerCase().split(/\W+/).filter(Boolean);
  if (!toks.length) return 0;
  const uniq = new Set(toks);
  return uniq.size / toks.length;
}

function sampleSet(set, cap) {
  const arr = Array.from(set);
  if (arr.length <= cap) return arr;
  // simple reservoir-like downsample
  const step = Math.ceil(arr.length / cap);
  const out = [];
  for (let i=0; i<arr.length; i+=step) out.push(arr[i]);
  return out.slice(0, cap);
}
