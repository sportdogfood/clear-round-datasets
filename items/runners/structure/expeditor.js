/**
 * expeditor.js
 * Location: /items/runners/structure/expeditor.js
 * Purpose: Orchestrates blog publication using the ClearRound structure model.
 * Author: GPT-5 (2025-10-13)
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const CRT_PROXY = "https://crt-b1434e13de34.herokuapp.com";
const GITHUB_RAW = "https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main";
const TEMPLATE_PATH = `${GITHUB_RAW}/docs/blogs/templates`;

async function fetchJSON(url, label) {
  console.log(`→ Fetching ${label}: ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${label} fetch failed: ${resp.status}`);
  return await resp.json();
}

async function fetchText(url, label) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${label} fetch failed: ${resp.status}`);
  return await resp.text();
}

function base64(str) {
  return Buffer.from(str, "utf-8").toString("base64");
}

function derivePaths(trigger, content, event) {
  const year = trigger.year || event.start_date?.slice(0, 4) || "2025";
  const slug = path.basename(trigger.content_link || trigger.docs_path).replace(".json", "");
  const baseDir = `docs/blogs/${slug.replace("-blog", "")}`;
  return {
    publish_json: `${baseDir}/${slug.replace("-blog", "-publish")}.json`,
    index_html: `${baseDir}/index.html`,
    blogs_index: "docs/blogs/index.html",
    year_index: `docs/blogs/${year}/index.html`,
    rss: "docs/blogs/rss.xml",
    sitemap: "docs/sitemap.xml",
    manifest: "docs/blogs/manifest.json",
  };
}

async function buildOutputs(trigger, content, event, images) {
  const paths = derivePaths(trigger, content, event);
  const title = content.seo?.section_title || content.title || "Untitled Post";
  const date = event.start_date || new Date().toISOString().slice(0, 10);

  const blogTemplate = await fetchText(`${TEMPLATE_PATH}/blog.index.html.tmpl`, "blog template");
  const postHTML = blogTemplate
    .replace(/{{title}}/g, title)
    .replace(/{{date}}/g, date)
    .replace(/{{body}}/g, content.body || "");

  const publishJSON = JSON.stringify({
    ...content,
    event,
    images,
    generated_at: new Date().toISOString(),
  }, null, 2);

  // Build other files with minimal content for now
  const rss = await fetchText(`${TEMPLATE_PATH}/rss.xml.tmpl`, "rss");
  const sitemap = await fetchText(`${TEMPLATE_PATH}/sitemap.xml.tmpl`, "sitemap");
  const blogsIndex = await fetchText(`${TEMPLATE_PATH}/blogs.index.html.tmpl`, "blogs index");
  const yearIndex = await fetchText(`${TEMPLATE_PATH}/year.index.html.tmpl`, "year index");
  const manifest = JSON.stringify([{ slug: content.slug, title, date, json: paths.publish_json }], null, 2);

  return [
    { path: paths.publish_json, content_type: "application/json", content_base64: base64(publishJSON) },
    { path: paths.index_html, content_type: "text/html", content_base64: base64(postHTML) },
    { path: paths.blogs_index, content_type: "text/html", content_base64: base64(blogsIndex) },
    { path: paths.year_index, content_type: "text/html", content_base64: base64(yearIndex) },
    { path: paths.rss, content_type: "application/xml", content_base64: base64(rss) },
    { path: paths.sitemap, content_type: "application/xml", content_base64: base64(sitemap) },
    { path: paths.manifest, content_type: "application/json", content_base64: base64(manifest) },
  ];
}

async function commitToDocs(message, files) {
  const body = { message, overwrite: true, files };
  console.log(`→ Committing ${files.length} files to /docs/commit-bulk`);
  const res = await fetch(`${CRT_PROXY}/docs/commit-bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`Commit failed: ${JSON.stringify(result)}`);
  console.log("✓ Commit successful:", result.commit?.url || "No URL");
}

export async function runExpeditor(triggerUrlOrJson) {
  try {
    const trigger = typeof triggerUrlOrJson === "string"
      ? await fetchJSON(triggerUrlOrJson, "trigger")
      : triggerUrlOrJson;

    const [content, event, images] = await Promise.all([
      fetchJSON(trigger.content_link, "content"),
      fetchJSON(trigger.event_link, "event"),
      trigger.images_link ? fetchJSON(trigger.images_link, "images") : Promise.resolve({}),
    ]);

    const files = await buildOutputs(trigger, content, event, images);

    console.table(files.map(f => ({
      path: f.path,
      type: f.content_type,
      bytes: Buffer.from(f.content_base64, "base64").length,
    })));

    await commitToDocs(trigger.commit_message || `publish ${content.slug || "blog"}`, files);
  } catch (err) {
    console.error("✗ Expeditor failed:", err.message);
  }
}

// If run directly from CLI
if (process.argv[2]) {
  const arg = process.argv[2];
  runExpeditor(arg);
}
