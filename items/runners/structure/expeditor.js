/**
 * expeditor.js
 * Location: /items/runners/structure/expeditor.js
 * Purpose: Orchestrates blog publication using the ClearRound structure model.
 * Mode: Lightweight by default (post page + publish.json). Flip INCLUDE_INDEXES to true to also build RSS/sitemap/indexes/manifest.
 * Author: CRT / 2025-10-14
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// ===== CONFIG =====
const CRT_PROXY = process.env.CRT_PROXY || "https://items.clearroundtravel.com";
const GITHUB_RAW = "https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main";
const TEMPLATE_PATH = `${GITHUB_RAW}/docs/blogs/templates`;

// Toggle: runner builds indexes (true) vs. Codex indexer builds them on schedule (false)
const INCLUDE_INDEXES = false;

// ===== UTILS =====
async function fetchJSON(url, label) {
  console.log(`→ Fetching ${label}: ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} fetch failed: ${r.status}`);
  return r.json();
}

async function fetchText(url, label) {
  console.log(`→ Fetching ${label}: ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} fetch failed: ${r.status}`);
  return r.text();
}

const b64 = (s) => Buffer.from(s, "utf-8").toString("base64");

function pickYear(trigger, event) {
  return (
    trigger.year ||
    (event?.start_date && String(event.start_date).slice(0, 4)) ||
    new Date().toISOString().slice(0, 4)
  );
}

/**
 * Derive canonical paths from your model:
 *  Folder: docs/blogs/<brand>-blogs-<year>/<post-folder-slug>/
 *  Files:  index.html, <content-slug>-publish.json
 *
 * Assumptions:
 *  - content.slug is a human slug like "capc-cap-challenge"
 *  - trigger.post_folder_slug or trigger.docs_path can predefine the folder "capc-blog-2025-10-05"
 *  - If missing, we derive post-folder from brand + "-blog-" + date
 */
function derivePaths(trigger, content, event) {
  const year = pickYear(trigger, event);

  // brand: everything before "-blog" in post folder or first token of content slug
  const contentSlug = content.slug || "post";
  const brandGuess = (contentSlug.split("-")[0] || "blog").toLowerCase();

  // post folder slug: prefer trigger.docs_path folder name or explicit trigger.post_folder_slug
  const triggerPath = trigger.docs_path || trigger.content_link || "";
  const fromDocsPath = triggerPath
    .split("/")
    .filter(Boolean)
    .slice(-2, -1)[0]; // takes folder if docs/.../<folder>/<file>

  const postFolderSlug =
    trigger.post_folder_slug ||
    fromDocsPath ||
    `${brandGuess}-blog-${(event?.start_date || new Date().toISOString()).slice(0, 10)}`;

  const yearFolder = `${brandGuess}-blogs-${year}`;
  const baseDir = `docs/blogs/${yearFolder}/${postFolderSlug}`;

  // publish file name is based on content slug
  const publishJson = `${baseDir}/${contentSlug}-publish.json`;

  // global indices/feeds
  const blogsIndex = "docs/blogs/index.html";
  const yearIndex = `docs/blogs/${year}/index.html`;
  const rss = "docs/blogs/rss.xml";
  const sitemap = "docs/sitemap.xml";
  const manifest = "docs/blogs/manifest.json";

  return {
    baseDir,
    publish_json: publishJson,
    index_html: `${baseDir}/index.html`,
    blogs_index: blogsIndex,
    year_index: yearIndex,
    rss,
    sitemap,
    manifest,
    year,
    brand: brandGuess,
    post_folder_slug: postFolderSlug
  };
}

function renderPostHTML(tmpl, { title, date, body }) {
  return tmpl
    .replace(/{{\s*title\s*}}/g, title)
    .replace(/{{\s*date\s*}}/g, date)
    .replace(/{{\s*body\s*}}/g, body || "");
}

async function buildOutputs(trigger, content, event, images) {
  const paths = derivePaths(trigger, content, event);
  const title = content.seo?.section_title || content.title || "Untitled Post";
  const date = event?.start_date || new Date().toISOString().slice(0, 10);

  // single-post HTML
  const blogTemplate = await fetchText(`${TEMPLATE_PATH}/blog.index.html.tmpl`, "blog template");
  const postHTML = renderPostHTML(blogTemplate, {
    title,
    date,
    body: content.body || ""
  });

  const publishJSON = JSON.stringify(
    {
      ...content,
      event,
      images,
      meta: {
        generated_at: new Date().toISOString(),
        year: paths.year,
        brand: paths.brand,
        post_folder: paths.post_folder_slug
      }
    },
    null,
    2
  );

  // Minimal default: publish JSON + post page
  const files = [
    { path: paths.publish_json, content_type: "application/json", content_base64: b64(publishJSON) },
    { path: paths.index_html,  content_type: "text/html",         content_base64: b64(postHTML) }
  ];

  if (INCLUDE_INDEXES) {
    const [rss, sitemap, blogsIndex, yearIndex] = await Promise.all([
      fetchText(`${TEMPLATE_PATH}/rss.xml.tmpl`, "rss"),
      fetchText(`${TEMPLATE_PATH}/sitemap.xml.tmpl`, "sitemap"),
      fetchText(`${TEMPLATE_PATH}/blogs.index.html.tmpl`, "blogs index"),
      fetchText(`${TEMPLATE_PATH}/year.index.html.tmpl`, "year index")
    ]);
    const manifest = JSON.stringify(
      [{ slug: content.slug || "post", title, date, json: paths.publish_json }],
      null,
      2
    );

    files.push(
      { path: paths.blogs_index, content_type: "text/html",         content_base64: b64(blogsIndex) },
      { path: paths.year_index,  content_type: "text/html",         content_base64: b64(yearIndex) },
      { path: paths.rss,         content_type: "application/xml",   content_base64: b64(rss) },
      { path: paths.sitemap,     content_type: "application/xml",   content_base64: b64(sitemap) },
      { path: paths.manifest,    content_type: "application/json",  content_base64: b64(manifest) }
    );
  }

  return { files, paths, title, date };
}

async function commitToDocs(message, files) {
  const body = { message, overwrite: true, files };
  console.log(`→ Committing ${files.length} files via /docs/commit-bulk`);
  const res = await fetch(`${CRT_PROXY}/docs/commit-bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Commit failed: ${JSON.stringify(result)}`);
  console.log("✓ Commit successful:", result.commit?.url || "No URL");
  return result;
}

export async function runExpeditor(triggerUrlOrJson) {
  try {
    // 1) Load trigger (URL or object)
    const trigger =
      typeof triggerUrlOrJson === "string"
        ? await fetchJSON(triggerUrlOrJson, "trigger")
        : triggerUrlOrJson;

    // 2) Load linked inputs (content, event, images)
    if (!trigger.content_link || !trigger.event_link) {
      throw new Error("Trigger must include content_link and event_link");
    }
    const [content, event, images] = await Promise.all([
      fetchJSON(trigger.content_link, "content"),
      fetchJSON(trigger.event_link, "event"),
      trigger.images_link ? fetchJSON(trigger.images_link, "images") : Promise.resolve({})
    ]);

    // 3) Build outputs (post+publish; optional indexes)
    const { files, paths } = await buildOutputs(trigger, content, event, images);

    // 4) Log a compact table
    console.table(
      files.map((f) => ({
        path: f.path,
        type: f.content_type,
        bytes: Buffer.from(f.content_base64, "base64").length
      }))
    );

    // 5) Commit
    const msg =
      trigger.commit_message ||
      `publish ${content.slug || paths.post_folder_slug} (${paths.year})`;
    await commitToDocs(msg, files);
  } catch (err) {
    console.error("✗ Expeditor failed:", err.message);
    process.exitCode = 1;
  }
}

// If run directly from CLI
if (process.argv[2]) {
  const arg = process.argv[2];
  runExpeditor(arg);
}
