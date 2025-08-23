#!/usr/bin/env node
// node 20+
// Usage example:
// node scripts/add_show_kernel.js \
//   --agents-index https://sportdogfood.github.io/clear-round-datasets/shows/config/agents/index.json \
//   --official-site https://www.hamptonclassic.com/ \
//   --show-keys "hampton classic;bridgehampton;ny" \
//   --start-date 2025-08-24 \
//   --is-series no --series-name "" --series-week "" \
//   --is-championship no --championship-type "" \
//   --slug "" --notes ""

import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as cheerio from "cheerio";

const args = Object.fromEntries(process.argv.slice(2).reduce((m, a, i, arr) => {
  if (a.startsWith("--")) m.push([a.replace(/^--/, ""), arr[i+1] ?? ""]);
  return m;
}, []));
const need = k => { if (!args[k]) { console.error(`Missing --${k}`); process.exit(1); } return args[k]; };

const AGENTS_INDEX = need("agents-index");
const OFFICIAL = need("official-site");
const SHOW_KEYS = (args["show-keys"]||"").split(";").map(s=>s.trim()).filter(Boolean);
const START = ((args["start-date"]||"").toLowerCase()==="unknown") ? "" : (args["start-date"]||"");
const IS_SERIES = (args["is-series"]||"").toLowerCase().startsWith("y");
const SERIES_NAME = (args["series-name"]||"") || null;
const SERIES_WEEK = args["series-week"] ? Number(args["series-week"]) : null;
const IS_CHAMP = (args["is-championship"]||"").toLowerCase().startsWith("y");
const CHAMP_TYPE = (args["championship-type"]||"") || null;
const SLUG_IN = (args["slug"]||"").trim();
const NOTES = (args["notes"]||"") || null;

const today = new Date().toISOString().slice(0,10);
const toSlug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const seasonForMonth = m => (m<=2||m===12)?"winter":(m<=5)?"spring":(m<=8)?"summer":"fall";
const monthName = d => d ? new Date(d).toLocaleString("en-US",{month:"long"}) : null;

async function getJSON(u){ const r=await fetch(u); if(!r.ok) throw new Error(`GET ${u} -> ${r.status}`); return await r.json(); }
async function getText(u){ const r=await fetch(u,{headers:{'user-agent':'clear-round-kernel/1.0'}}); if(!r.ok) throw new Error(`GET ${u} -> ${r.status}`); return await r.text(); }

function extract(html, baseUrl){
  const $ = cheerio.load(html);
  const title = (
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('h1').first().text() ||
    $('title').first().text() ||
    new URL(baseUrl).hostname.replace(/^www\./,'')
  ).trim().replace(/\s+/g,' ');
  const canonical = $('link[rel="canonical"]').attr('href');
  const official_link = canonical ? new URL(canonical, baseUrl).href : baseUrl;

  let addr=null, venueName=null, geo=null, start=null, end=null;
  $('script[type="application/ld+json"]').each((_,el)=>{
    try {
      const raw = $(el).contents().text();
      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : [data];
      for (const o of arr){
        const t=(o['@type']||'').toString().toLowerCase();
        if (t.includes('event')){
          start = start || o.startDate || null;
          end   = end   || o.endDate   || null;
          const loc=o.location;
          if (loc){
            if (loc.name && !venueName) venueName=loc.name;
            if (loc.address && !addr) addr=loc.address;
            if (loc.geo && (loc.geo.latitude||loc.geo.longitude) && !geo){
              geo = { lat:Number(loc.geo.latitude), lon:Number(loc.geo.longitude) };
            }
          }
        }
        if (!venueName && o.name) venueName=o.name;
        if (!addr && o.address) addr=o.address;
        if (!geo && o.geo && (o.geo.latitude||o.geo.longitude)) {
          geo = { lat:Number(o.geo.latitude), lon:Number(o.geo.longitude) };
        }
      }
    } catch {}
  });

  const normAddr = (addr && typeof addr==='object') ? {
    street: addr.streetAddress || null,
    city: addr.addressLocality || null,
    state: addr.addressRegion || null,
    postal: addr.postalCode || null,
    country: addr.addressCountry || null
  } : {street:null,city:null,state:null,postal:null,country:null};

  return { official_link, title, venueName, ...normAddr, geo, start, end };
}

(async()=>{
  // 1) resolve rules + schema from agents index
  const agents = await getJSON(AGENTS_INDEX);
  const addShow = agents["add-show"];
  if (!addShow?.rules || !addShow?.schema) throw new Error("agents index missing add-show.rules/schema");
  const rules = await getJSON(addShow.rules);
  const schema = await getJSON(addShow.schema);

  // 2) fetch + extract
  const html = await getText(OFFICIAL);
  const ex = extract(html, OFFICIAL);

  // 3) assemble meta.json per rules (rules keep kernel tiny)
  const official_name = ex.title || "Horse Show";
  const slug = SLUG_IN || toSlug(official_name);
  const startEff = START || ex.start || null;
  const endEff   = ex.end   || null;
  const yyyymm = startEff ? startEff.slice(0,7) : null;

  const autoKeys = Array.from(new Set([
    ...official_name.toLowerCase().split(/[^a-z0-9]+/).filter(s=>s.length>2),
    ex.city?.toLowerCase(), ex.state?.toLowerCase(),
    startEff ? startEff.slice(0,4) : null,
    ...SHOW_KEYS.map(s=>s.toLowerCase())
  ].filter(Boolean)));

  const out = {
    show_uid: slug,
    display_name: official_name,
    event_uid: startEff ? `${slug}_${yyyymm}` : null,
    slug,
    timezone: "America/New_York",
    created_date: today,
    last_updated: today,
    meta: {
      official_link: ex.official_link || OFFICIAL,
      official_name,
      official_start_date: startEff,
      official_end_date: endEff,
      venue_name: ex.venueName || null,
      venue_address: ex.street || null,
      venue_city: ex.city || null,
      venue_state: ex.state || null,
      venue_zip: ex.postal || null,
      venue_coords: {
        lat: ex.geo?.lat ?? null,
        lon: ex.geo?.lon ?? null,
        coordinate_source: ex.geo ? "jsonld" : null,
        google_place_id: null,
        maps_url: null
      },
      notes: NOTES,
      sources: Array.from(new Set([ex.official_link || OFFICIAL, OFFICIAL]))
    },
    derived: {
      yyyymm,
      month_name: startEff ? monthName(startEff) : null,
      season: startEff ? seasonForMonth(Number(startEff.slice(5,7))) : null,
      status_window: (endEff && new Date(endEff) < new Date(today)) ? "past"
                    : (startEff && new Date(startEff) > new Date(today)) ? "upcoming"
                    : (startEff && endEff) ? "current" : "unknown"
    },
    search: {
      auto_keys: autoKeys,
      curated_keys: SHOW_KEYS,
      facets: {
        discipline: null,
        rating: IS_CHAMP ? "championship" : (IS_SERIES ? "series" : null),
        state: ex.state || null,
        region: null,
        airports_primary: [],
        season: startEff ? seasonForMonth(Number(startEff.slice(5,7))) : null,
        is_series: IS_SERIES,
        series_name: SERIES_NAME,
        series_week: SERIES_WEEK,
        is_championship: IS_CHAMP,
        championship_type: CHAMP_TYPE
      }
    },
    aliases: { curated: [] },
    ops: {
      needs_meta_refresh: !startEff,
      needs_research: true,
      needs_blog: false,
      last_ops_check: today,
      stale_reason: startEff ? null : "missing_start_date"
    },
    quick_notes: rules.quick_notes || [],
    suggested_save: {
      file_path: `/shows/${slug}/events/meta.json`,
      download_name: `meta-${slug}.json`
    },
    admin_preview: {
      root: `/shows/${slug}/`,
      paths: [`/shows/${slug}/events/meta.json`]
    }
  };

  // 4) validate to schema
  const ajv = new Ajv({allErrors:true, strict:false}); addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(out)) { console.error(JSON.stringify(validate.errors,null,2)); process.exit(1); }

  // 5) print one JSON
  process.stdout.write(JSON.stringify(out, null, 2));
})().catch(e=>{ console.error(e.message||e); process.exit(1); });
