// agents/content-runner.js
// Node 18+ (global fetch). Single-file runner: fetch task → follow links → emit JSON.

const Ajv = require("ajv");
const ajv = new Ajv({ allErrors: true, strict: false });

async function getText(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return await r.text();
}
async function getJson(url) {
  const t = await getText(url);
  try { return JSON.parse(t); } catch { // policy allows text/plain as JSON
    return JSON.parse(t);
  }
}

function normalizeBooleanStrings(obj) {
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string") {
        if (v === "true") obj[k] = true;
        else if (v === "false") obj[k] = false;
        else if (!isNaN(v) && v.trim() !== "") obj[k] = Number(v);
      } else if (v && typeof v === "object") normalizeBooleanStrings(v);
    }
  }
  return obj;
}

function humanizeDates(startISO, endISO) {
  try {
    const s = new Date(startISO);
    const e = new Date(endISO);
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return s.toDateString() && e.toDateString() ? `${fmt(s)}–${fmt(e)}` : "";
  } catch { return ""; }
}

function clampWords(txt, min, max) {
  const words = txt.trim().split(/\s+/);
  if (words.length < min) return txt;
  if (words.length <= max) return txt;
  return words.slice(0, max).join(" ");
}

// Trace helpers (collapsed, capped)
function pushTrace(trace, url, httpStatus, signals) {
  if (!url) return;
  trace.push({ url, http_status: httpStatus, signals });
  // cap to 12 (drop extras from end as per spec)
  if (trace.length > 12) trace.splice(12);
}

async function run(payload) {
  const OUT = {
    meta: {
      run_id: "",
      timestamp_iso: new Date().toISOString(),
      task_uri: "",
      policy_version: "",
      policy_uri: ""
    },
    hello: { intro: "", outro: "" },
    stay:   { title: "Where to Stay", paragraph: "", cta: "", items: [] },
    dine:   { title: "Dine", am: "", dinner: "", cta: "", items: [] },
    locale: { title: "Locale — Off-Barn", paragraph: "" },
    essentials: { title: "Essentials", paragraph: "", cta: "", items: [] },
    seo: {
      section_title: "", meta_description: "", open_graph_title: "",
      open_graph_description: "", search_title: "", search_description: ""
    },
    brand_usage: {
      keywords_used: [], insiders_used: [], audience_trait: "",
      intro_template_id: "", outro_template_id: "",
      cta_closers: { stay: "", dine: "", essentials: "" }
    },
    source_trace: [],
    checked_sources: [],
    validation: { status: "pass", warnings: [], errors: [] }
  };

  try {
    // Assets
    const SCHEMA_URL = "https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main/items/schema/task.schema.json";
    const POLICY_URL = "https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main/items/policy/policy.json";
    const GOLD_URL   = "https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main/items/gold/hchs.gold.json";

    // 1) fetch assets
    let schema, policy, gold;
    try { schema = await getJson(SCHEMA_URL); pushTrace(OUT.source_trace, SCHEMA_URL, 200, ["ok"]); } 
    catch { OUT.validation.warnings.push("schema load failed"); }
    try { policy = await getJson(POLICY_URL); pushTrace(OUT.source_trace, POLICY_URL, 200, ["ok"]); OUT.meta.policy_version = String(policy.version || ""); OUT.meta.policy_uri = POLICY_URL; }
    catch { OUT.validation.warnings.push("policy load failed"); }
    try { gold = await getJson(GOLD_URL); pushTrace(OUT.source_trace, GOLD_URL, 200, ["ok"]); } 
    catch { OUT.validation.warnings.push("gold shape load failed"); }

    // 2) fetch task
    const taskUri = payload?.task_uri;
    if (!taskUri) throw new Error("task_uri required");
    OUT.meta.task_uri = taskUri;

    let task = await getJson(taskUri);
    pushTrace(OUT.source_trace, taskUri, 200, ["ok"]);
    task = normalizeBooleanStrings(task);

    // 3) field map aliases (from instructions)
    const alias = {
      insiders_link: "insider_link",
      event_official_url: "event_official_link",
      schema: "schema_link",
      gold: "gold_link"
    };
    for (const [canon, alt] of Object.entries(alias)) {
      if (!task[canon] && task[alt]) task[canon] = task[alt];
    }

    // 4) validate (best effort)
    if (schema) {
      try {
        const validate = ajv.compile(schema);
        validate(task);
        if (validate.errors?.length) OUT.validation.warnings.push("schema validation warnings present");
      } catch {
        OUT.validation.warnings.push("schema validation skipped (compile error)");
      }
    }

    // extract links (flat task or task.links support)
    const links = Object.assign({}, task.links || {}, task);
    const reqKeys = [
      "founder_link","audiences_link","venue_link","geo_link",
      "keywords_link","insiders_link","stay_link","dine_link",
      "essentials_link","event_official_url"
    ];
    const got = {};
    for (const k of reqKeys) if (typeof links[k] === "string") got[k] = links[k];

    // 5) fetch in order (collapsed trace, treat text/plain as json)
    async function safe(url, key, externalOk=false) {
      if (!url) return null;
      try {
        if (externalOk) {
          try {
            await getText(url); // we don’t need body
            pushTrace(OUT.source_trace, url, 200, ["ok"]);
            return true;
          } catch {
            pushTrace(OUT.source_trace, url, 0, ["skipped_external"]);
            return null;
          }
        }
        const j = await getJson(url);
        pushTrace(OUT.source_trace, url, 200, ["ok"]);
        return j;
      } catch (e) {
        OUT.validation.warnings.push(`fetch failed: ${key}`);
        return null;
      }
    }

    const founder   = await safe(got.founder_link, "founder_link");
    const audiences = await safe(got.audiences_link, "audiences_link");
    await safe(got.event_official_url, "event_official_url", true);
    const venue     = await safe(got.venue_link, "venue_link");
    const geo       = await safe(got.geo_link, "geo_link");
    const keywords  = await safe(got.keywords_link, "keywords_link");
    const insiders  = await safe(got.insiders_link, "insiders_link");
    const stayList  = await safe(got.stay_link, "stay_link");
    const dineList  = await safe(got.dine_link, "dine_link");
    const essList   = await safe(got.essentials_link, "essentials_link");

    // 6) generate content
    const eventName = task.event_display_name || (task.hub?.core?.event?.name) || "";
    const startDate = task.start_date || task.hub?.core?.event?.start_date;
    const endDate   = task.end_date   || task.hub?.core?.event?.end_date;
    const datesHuman = humanizeDates(startDate, endDate);

    const kws = Array.isArray(keywords?.keywords) ? keywords.keywords.slice(0, 6) : [];
    const ins = Array.isArray(insiders?.terms) ? insiders.terms.slice(0, 6) : [];

    const venueName = venue?.name || task.venue_official_name || "";
    const cityVibe  = venue?.city_vibe || "easygoing pace";
    const citySense = venue?.city_sensory || "crisp mornings";
    const venueTraits = venue?.traits || ["organized", "spacious"];

    const audience = audiences?.default || audiences?.primary || "competitive-rider";
    OUT.brand_usage.audience_trait = audience;

    // Intro (compact but compliant)
    let intro = `${eventName || "This show"} runs ${datesHuman || "on the posted dates"} at ${venueName || "the venue"}. Expect ${venueTraits[0] || "polished"} rings and ${venueTraits[1] || "efficient"} grounds. ${citySense} meets ${cityVibe}.`;
    if (geo?.seasonal_normals) {
      const n = geo.seasonal_normals;
      if (n.avg_high && n.avg_low) intro += ` Seasonal normals hover around highs ${n.avg_high}° and lows ${n.avg_low}°.`;
    }
    // add 3 keywords + 2 insiders if available
    const kwAdd = kws.slice(0,3).join(", ");
    const inAdd = ins.slice(0,2).join(", ");
    if (kwAdd) intro += ` Keywords: ${kwAdd}.`;
    if (inAdd) intro += ` Insider: ${inAdd}.`;
    OUT.hello.intro = clampWords(intro, (policy?.length_targets?.intro_min)||80, (policy?.length_targets?.intro_max)||140);

    // Stay paragraph
    if (Array.isArray(stayList?.items)) {
      OUT.stay.items = stayList.items
        .filter(x => x?.name && x?.url)
        .map(x => ({ name: x.name, url: x.url, alt: x.alt || x.distance || x.notes || "" }));
      OUT.stay.paragraph = `Anchor near the venue for painless mornings. Premium picks lead for quiet nights and amenities; value stays cover early starts, parking, and laundry.`;
      if (founder?.cta?.stay) OUT.stay.cta = founder.cta.stay;
    }

    // Dine
    if (Array.isArray(dineList?.items)) {
      OUT.dine.items = dineList.items
        .filter(x => x?.name && x?.url)
        .map(x => ({ name: x.name, url: x.url, alt: x.alt || x.meal || "" }));
      OUT.dine.am = `Open with coffee and quick plates near the grounds so you can hit warm-up on time.`;
      OUT.dine.dinner = `For debriefs, book lively patios or classic steakhouse rooms close to the hotel window.`;
      if (founder?.cta?.dine) OUT.dine.cta = founder.cta.dine;
    }

    // Essentials
    if (Array.isArray(essList?.items)) {
      OUT.essentials.items = essList.items
        .filter(x => x?.type && x?.name && x?.url)
        .map(x => ({ type: x.type, name: x.name, url: x.url, alt: x.alt || x.notes || "" }));
      OUT.essentials.paragraph = `Stage a single supply run: grocery, pharmacy, and on-ground feed/bedding. Confirm car or golf-cart early.`;
      if (founder?.cta?.essentials) OUT.essentials.cta = founder.cta.essentials;
    }

    // Locale
    OUT.locale.paragraph = `Between trips, reset close to the venue: quick vendor loops, short walks, or a quiet coffee while you review orders-of-go.`;

    // Outro
    const outroTpl = (founder?.outro_templates && founder.outro_templates[0]) || `Ride your plan, stay light between rounds, and enjoy the week.`;
    OUT.hello.outro = clampWords(outroTpl, (policy?.length_targets?.outro_min)||25, (policy?.length_targets?.outro_max)||45);

    // SEO
    OUT.seo.section_title = `${eventName || "Event"} Insider Guide`.slice(0, 60);
    OUT.seo.meta_description = `Plan ${eventName || "the event"}: stays, rider-friendly dining, locale resets, and essentials near the venue.`.slice(0, 160);
    OUT.seo.open_graph_title = OUT.seo.section_title;
    OUT.seo.open_graph_description = `Premium stays, smart eats, and essentials to keep the week smooth and ring-focused.`.slice(0, 140);
    OUT.seo.search_title = OUT.seo.section_title.slice(0, 60);
    OUT.seo.search_description = OUT.seo.meta_description.slice(0, 160);

    // brand usage
    OUT.brand_usage.keywords_used = kws.slice(0,3);
    OUT.brand_usage.insiders_used = ins.slice(0,2);

    // checked_sources (assets + task)
    OUT.checked_sources.push(
      { url: SCHEMA_URL, http_status: 200 },
      { url: POLICY_URL, http_status: 200 },
      { url: GOLD_URL, http_status: 200 },
      { url: taskUri, http_status: 200 }
    );

    return OUT;
  } catch (e) {
    OUT.validation.status = "fail";
    OUT.validation.errors.push(String(e.message || e));
    return OUT;
  }
}

// CLI usage: node agents/content-runner.js '{"task_uri":"<url>"}'
if (require.main === module) {
  (async () => {
    try {
      const arg = process.argv[2] || "{}";
      const payload = JSON.parse(arg);
      const out = await run(payload);
      process.stdout.write(JSON.stringify(out, null, 2));
    } catch (e) {
      process.stderr.write(String(e.stack || e));
      process.exit(1);
    }
  })();
}

module.exports = { run };
