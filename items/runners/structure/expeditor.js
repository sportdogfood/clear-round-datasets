/**
 * STRICT ENTRYPOINT: one trigger URL in, GET only.
 * - GET <trigger_url>  -> { content_link, event_link, [images_link], post_folder_slug, year, commit_message }
 * - GET content_link
 * - GET event_link
 * - GET images_link (optional)
 * - Build outputs (post page + publish.json)
 * - POST /docs/commit-bulk (one commit)
 */

import fetch from "node-fetch";

const CRT_PROXY   = process.env.CRT_PROXY || "https://items.clearroundtravel.com";
const GITHUB_RAW  = "https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main";
const TEMPLATES   = `${GITHUB_RAW}/docs/blogs/templates`;

// ---- tiny helpers ----
const b64 = (s) => Buffer.from(s, "utf-8").toString("base64");
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

async function getJson(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} GET failed: ${r.status} ${url}`);
  return r.json();
}
async function getText(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} GET failed: ${r.status} ${url}`);
  return r.text();
}

// --- very small renderer: we keep template simple: {{title}}, {{date}}, {{body}}
function esc(s=""){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function li(items=[]){
  if(!Array.isArray(items)||!items.length) return "";
  return "<ul>" + items.map(i=>{
    const name = esc(i.name||i.title||"");
    const alt  = i.alt ? ` <span class="alt">— ${esc(i.alt)}</span>`:"";
    const a    = i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${name}</a>` : name;
    return `<li>${a}${alt}</li>`;
  }).join("") + "</ul>";
}
function section(id, t){ return `<section id="${id}">${t}</section>`; }
function block({title, paragraph, spectator_tip, cta, items}){
  let out = [];
  if(title) out.push(`<h2>${esc(title)}</h2>`);
  if(paragraph) out.push(`<p>${paragraph}</p>`); // allow inline links already present
  if(spectator_tip) out.push(`<p class="tip"><strong>Spectator Tip:</strong> ${esc(spectator_tip)}</p>`);
  if(cta) out.push(`<p class="cta">${esc(cta)}</p>`);
  if(items) out.push(li(items));
  return out.join("\n");
}
function renderBody(content={}){
  const parts = [];
  if(content.hello){
    parts.push(section("hello",
      `${content.hello.intro?`<p>${content.hello.intro}</p>`:""}${content.hello.transition?`<p>${content.hello.transition}</p>`:""}`
    ));
  }
  for(const key of ["stay","dine","locale","essentials"]){
    const s = content[key]; if(!s) continue;
    parts.push(section(key, block(s)));
  }
  if(content.outro){
    parts.push(section("outro",
      `${content.outro.pivot?`<p class="pivot">${esc(content.outro.pivot)}</p>`:""}${content.outro.main?`<p>${content.outro.main.replace(/\n\n/g,"</p><p>")}</p>`:""}`
    ));
  }
  return parts.join("\n\n");
}

// ---- path derivation (matches your pattern) ----
function derivePaths(trigger, content, event){
  const year = trigger.year || (event?.start_date||"").slice(0,4) || new Date().toISOString().slice(0,4);
  const contentSlug = content.slug || "post";
  const brand = (contentSlug.split("-")[0] || "blog").toLowerCase();
  const postFolder = trigger.post_folder_slug || `${brand}-blog-${(event?.start_date||new Date().toISOString()).slice(0,10)}`;
  const baseDir = `docs/blogs/${brand}-blogs-${year}/${postFolder}`;
  return {
    baseDir,
    year,
    publish_json: `${baseDir}/${contentSlug}-publish.json`,
    index_html:   `${baseDir}/index.html`
  };
}

// ---- commit bulk (one request) ----
async function commitBulk(message, files){
  const res = await fetch(`${CRT_PROXY}/docs/commit-bulk`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ message, overwrite:true, files })
  });
  const j = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`Commit failed: ${JSON.stringify(j)}`);
  console.log("✓ commit", j.commit?.sha, j.commit?.url || "");
  return j;
}

// ---- PUBLIC ENTRYPOINT: one URL ----
export async function runExpeditorFromUrl(triggerUrl){
  must(/^https?:\/\//i.test(triggerUrl), "Trigger must be a URL");
  console.log("→ GET trigger", triggerUrl);

  const trigger = await getJson(triggerUrl, "trigger");
  must(trigger.content_link, "trigger.content_link required");
  must(trigger.event_link,   "trigger.event_link required");

  const [content, event, images] = await Promise.all([
    getJson(trigger.content_link, "content"),
    getJson(trigger.event_link,   "event"),
    trigger.images_link ? getJson(trigger.images_link, "images") : Promise.resolve({})
  ]);

  // build post (title/date/body) with your structured content
  const title = content.seo?.section_title || content.title || "Untitled Post";
  const date  = event?.start_date || new Date().toISOString().slice(0,10);
  const body  = renderBody(content);

  const tmpl = await getText(`${TEMPLATES}/blog.index.html.tmpl`, "blog template");
  const html = tmpl
    .replace(/{{\s*title\s*}}/g, title)
    .replace(/{{\s*date\s*}}/g,  date)
    .replace(/{{\s*body\s*}}/g,  body);

  const paths = derivePaths(trigger, content, event);

  // publish JSON (include meta you asked for)
  const publish = JSON.stringify({
    ...content,
    event,
    images,
    meta: {
      ...(content.meta || {}),
      generated_at: new Date().toISOString(),
      year: paths.year,
      post_folder: paths.baseDir.split("/").slice(-1)[0]
    }
  }, null, 2);

  const files = [
    { path: paths.publish_json, content_type:"application/json", content_base64: b64(publish) },
    { path: paths.index_html,   content_type:"text/html",        content_base64: b64(html) }
  ];

  console.table(files.map(f=>({ path:f.path, bytes: Buffer.from(f.content_base64,"base64").length })));

  const msg = trigger.commit_message || `publish ${content.slug || "post"} (${paths.year})`;
  await commitBulk(msg, files);
  console.log("✓ done");
}

// CLI usage (node expeditor.js <trigger-url>)
if (process.argv[1] && process.argv[1].endsWith("expeditor.js") && process.argv[2]) {
  runExpeditorFromUrl(process.argv[2]).catch(e => { console.error("✗", e.message); process.exitCode = 1; });
}
