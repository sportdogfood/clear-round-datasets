/**
 * expeditor.js — Runner-Light (fills rich blog template tokens)
 * Location: /items/runners/structure/expeditor.js
 * Purpose : Read one trigger (Items), build publish.json + index.html, commit-bulk to Docs.
 * Lanes   : READ from Items (content/event/images), READ template from Blog, WRITE to Docs.
 * Author  : GPT-5 (2025-10-15)
 */

import path from "path";
import fetch from "node-fetch";

/* --- Fixed endpoints (no mirrors, no raw) --- */
const ITEMS_BASE        = "https://items.clearroundtravel.com";
const DOCS_COMMIT_URL   = `${ITEMS_BASE}/docs/commit-bulk`;
const BLOG_TEMPLATE_URL = "https://blog.clearroundtravel.com/blogs/templates/blog.index.html.tmpl";

/* --- Small utils --- */
const b64    = (s) => Buffer.from(s, "utf8").toString("base64");
const isHttp = (u) => typeof u === "string" && /^https:\/\//i.test(u);

function htmlEscape(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function toISO(dateStr) {
  try {
    if (!dateStr) return new Date().toISOString().slice(0, 10);
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  } catch { return new Date().toISOString().slice(0, 10); }
}
function humanDate(dateStr) {
  try {
    const d = new Date(dateStr || Date.now());
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
  } catch { return dateStr || ""; }
}
function monthName(dateStr) {
  try {
    const d = new Date(dateStr || Date.now());
    return d.toLocaleDateString("en-US", { month: "long", timeZone: "America/New_York" });
  } catch { return ""; }
}
function seasonFromMonth(dateStr) {
  try {
    const m = (new Date(dateStr || Date.now())).getUTCMonth() + 1;
    if ([12,1,2].includes(m)) return "Winter";
    if ([3,4,5].includes(m))  return "Spring";
    if ([6,7,8].includes(m))  return "Summer";
    return "Fall";
  } catch { return ""; }
}

/* very light markdown-style [text](url) → <a> */
function linkify(p = "") {
  return p.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t, u) => `<a href="${htmlEscape(u)}">${htmlEscape(t)}</a>`);
}
function pTag(s = "") {
  if (!s) return "";
  return `<p>${linkify(htmlEscape(s)).replace(/&lt;a href=.*?&gt;.*?&lt;\/a&gt;/g, (m) =>
    m.replaceAll("&lt;", "<").replaceAll("&gt;", ">"))}</p>`;
}
function listItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const lis = items.map(x => {
    const name = htmlEscape(x.name || "");
    const alt  = htmlEscape(x.alt || x.type || "");
    const link = isHttp(x.link) ? `<a href="${htmlEscape(x.link)}">${name}</a>` : name;
    return `<li>${link}${alt ? ` <span class="alt">${alt}</span>` : ""}</li>`;
  }).join("");
  return `<ul>${lis}</ul>`;
}

/* token replacer (unmatched → empty) */
function renderTokens(template, map) {
  let out = template;
  for (const [k, v] of Object.entries(map)) {
    const safe = v == null ? "" : String(v);
    out = out.replaceAll(new RegExp(`{{\\s*${k}\\s*}}`, "g"), safe);
  }
  // strip any leftover {{unknown}} tokens
  out = out.replace(/\{\{\s*[a-z0-9_]+\s*\}\}/gi, "");
  return out;
}

/* fetch helpers */
async function fetchText(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} fetch failed: ${r.status}`);
  return await r.text();
}
async function fetchJSON(url, label) {
  const t = await fetchText(url, label);
  try { return JSON.parse(t); } catch { throw new Error(`${label} invalid JSON`); }
}

/* derive publish paths */
function derivePaths(trigger, content, event) {
  const slugBase = (trigger?.content_link || "").replace(/\.json$/i, "");
  const fallbackSlug = path.basename(slugBase) || "post-blog";
  const slug = (content?.slug || fallbackSlug).trim();

  const brand = (slug.split("-")[0] || "blog").toLowerCase();
  const eventYear = (event?.start_date || "").slice(0, 4);
  const year = String(trigger?.year || eventYear || new Date().getUTCFullYear());
  const folder = String(trigger?.post_folder_slug || `${brand}-blog-${toISO(event?.start_date)}`).trim();

  const baseDocs = `docs/blogs/${brand}-blogs-${year}/${folder}/`;
  const basePublic = baseDocs.replace(/^docs\//, ""); // for canonical on blog domain

  return {
    year,
    brand,
    folder,
    baseDocs,
    publish_json: `${baseDocs}${slug.replace(/-blog(-\d{4}-\d{2}-\d{2})?$/i, "-publish$1")}.json`,
    index_html:   `${baseDocs}index.html`,
    canonical:    `https://blog.clearroundtravel.com/${basePublic}`,
    slug
  };
}

/* build HTML fragments from content sections */
function buildFragments(content = {}, event = {}, images = {}) {
  const hello = content.hello || {};
  const stay = content.stay || {};
  const dine = content.dine || {};
  const essentials = content.essentials || {};
  const locale = content.locale || {};
  const outro = content.outro || {};

  const intro_html = [hello.intro, hello.transition].filter(Boolean).map(pTag).join("");

  const stay_list_html = listItems(stay.items);
  const dine_list_html = listItems(dine.items);
  const essentials_list_html = listItems(essentials.items);
  const locale_html = locale.paragraph ? pTag(locale.paragraph) : "";

  const outro_html = [outro.pivot, outro.main].filter(Boolean).map(pTag).join("");

  /* tags */
  const tags = []
    .concat(content?.tags || [])
    .concat(content?.brand_usage?.keywords_used || []);
  const tags_html = Array.from(new Set(tags))
    .slice(0, 12)
    .map(t => `<a href="/blogs/?tag=${encodeURIComponent(t)}">${htmlEscape(t)}</a>`)
    .join(" ");

  /* hero image (prefer explicit) */
  const heroUrl =
    content?.seo?.open_graph_image ||
    images?.hero?.url ||
    images?.card?.url ||
    "";
  const heroAlt =
    images?.hero?.alt ||
    content?.seo?.open_graph_title ||
    content?.title ||
    "";
  const heroCaption = images?.hero?.caption || "";
  const hero_img = heroUrl
    ? `<figure><img src="${htmlEscape(heroUrl)}" alt="${htmlEscape(heroAlt)}" /><figcaption>${htmlEscape(heroCaption)}</figcaption></figure>`
    : "";

  return {
    intro_html, stay_list_html, dine_list_html, essentials_list_html, locale_html, outro_html, tags_html, hero_img
  };
}

/* build JSON-LD (minimal Article with Event date) */
function buildJsonLd(title, canonical, event) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title || "",
    "mainEntityOfPage": canonical || "",
    "datePublished": toISO(event?.start_date),
    "dateModified": toISO(event?.start_date),
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/* fill the template token map */
function buildTemplateMap(paths, content, event, images) {
  const title =
    content?.seo?.section_title ||
    content?.seo?.open_graph_title ||
    content?.title ||
    paths.slug;

  const meta_description =
    content?.seo?.meta_description ||
    content?.seo?.open_graph_description ||
    (content?.hello?.intro || "").slice(0, 160);

  const og_title = content?.seo?.open_graph_title || title;
  const og_desc  = content?.seo?.open_graph_description || meta_description;
  const og_img   = content?.seo?.open_graph_image || images?.card?.url || images?.hero?.url || "";

  const date_iso   = toISO(event?.start_date);
  const date_human = humanDate(event?.start_date);
  const event_month  = monthName(event?.start_date);
  const event_season = seasonFromMonth(event?.start_date);

  const venue_label =
    event?.venue?.name ||
    event?.venue_name ||
    "";

  const frags = buildFragments(content, event, images);
  const json_ld = buildJsonLd(title, paths.canonical, event);

  return {
    /* head/meta */
    title: htmlEscape(title),
    meta_description: htmlEscape(meta_description || ""),
    canonical: htmlEscape(paths.canonical),
    open_graph_title: htmlEscape(og_title || ""),
    open_graph_description: htmlEscape(og_desc || ""),
    open_graph_image: htmlEscape(og_img || ""),

    /* eyebrow/date/location */
    date_iso: htmlEscape(date_iso),
    date_human: htmlEscape(date_human),
    venue_label: htmlEscape(venue_label),
    event_month: htmlEscape(event_month),
    event_season: htmlEscape(event_season),

    /* body sections */
    ...frags,

    /* pager (empty until an indexer provides links) */
    prev_link: "",
    next_link: "",

    /* footer */
    year: htmlEscape(paths.year),

    /* structured data */
    json_ld
  };
}

/* copy-through publish JSON with enrichments */
function buildPublishJSON(content, event, images, year, folder) {
  const enriched = {
    ...content,
    event,
    images,
    meta: {
      ...(content.meta || {}),
      generated_at: new Date().toISOString(),
      year,
      post_folder: folder
    }
  };
  return JSON.stringify(enriched, null, 2) + "\n";
}

/* fetch blog template (single source) */
async function getTemplate() {
  return await fetchText(BLOG_TEMPLATE_URL, "blog template");
}

/* Commit to Docs (bulk) */
async function commitToDocs(message, files) {
  const body = { message, overwrite: true, files };
  const res = await fetch(DOCS_COMMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Commit failed: ${res.status} ${JSON.stringify(json)}`);
  console.log("✓ Commit:", json.commit?.url || "no-url");
  return json;
}

/* MAIN */
export async function runExpeditor(triggerUrlOrJson) {
  try {
    const trigger =
      typeof triggerUrlOrJson === "string"
        ? await fetchJSON(triggerUrlOrJson, "trigger")
        : triggerUrlOrJson;

    if (!isHttp(trigger?.content_link) || !isHttp(trigger?.event_link)) {
      throw new Error("Trigger missing required HTTPS links: content_link and event_link.");
    }

    const [content, event, images] = await Promise.all([
      fetchJSON(trigger.content_link, "content"),
      fetchJSON(trigger.event_link, "event"),
      trigger.images_link ? fetchJSON(trigger.images_link, "images") : Promise.resolve({})
    ]);

    /* paths + template */
    const paths = derivePaths(trigger, content, event);
    const template = await getTemplate();

    /* publish.json */
    const publishJSON = buildPublishJSON(content, event, images, paths.year, paths.folder);

    /* render index.html via tokens */
    const map = buildTemplateMap(paths, content, event, images);
    const indexHTML = renderTokens(template, map);

    /* preflight sizes */
    const pubBytes  = Buffer.byteLength(publishJSON, "utf8");
    const htmlBytes = Buffer.byteLength(indexHTML, "utf8");
    console.table([
      { path: paths.publish_json, type: "application/json", bytes: pubBytes,  status: pubBytes  >= 100 ? "OK" : "WARN" },
      { path: paths.index_html,   type: "text/html",        bytes: htmlBytes, status: htmlBytes >= 200 ? "OK" : "WARN" },
    ]);

    /* commit (2 files) */
    await commitToDocs(trigger.commit_message || `publish ${paths.slug} (${paths.year})`, [
      { path: paths.publish_json, content_type: "application/json", content_base64: b64(publishJSON) },
      { path: paths.index_html,   content_type: "text/html",        content_base64: b64(indexHTML)  },
    ]);
  } catch (err) {
    console.error("✗ Expeditor failed:", err.message);
  }
}

/* CLI */
if (process.argv[2]) {
  const arg = process.argv[2];
  runExpeditor(arg);
}
