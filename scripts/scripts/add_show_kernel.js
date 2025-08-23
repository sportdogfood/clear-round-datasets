#!/usr/bin/env node
// Usage:
//   node scripts/add_show_kernel.js \
//     --agents-index https://.../shows/config/agents/index.json \
//     --shows-index  https://.../shows/index.json \
//     --official-site https://... \
//     --start-date 2025-08-24 \
//     --is-series no \
//     --series-name "" \
//     --series-week "" \
//     --is-championship no \
//     --championship-type "" \
//     --slug "" \
//     --notes ""

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as cheerio from "cheerio";

const args = Object.fromEntries(process.argv.slice(2).reduce((m, a, i, arr) => {
  if (a.startsWith("--")) m.push([a.replace(/^--/,""), arr[i+1] ?? ""]);
  return m;
}, []));
const must = (k) => { if (!args[k]) { console.error(`Missing --${k}`); process.exit(1); } return args[k]; };

const AGENTS_INDEX = must("agents-index");          // absolute URL
const SHOWS_INDEX  = args["shows-index"] || "";     // absolute URL (not strictly needed for add-show)
const OFFICIAL     = must("official-site");
const START        = (args["start-date"]||"").trim().toLowerCase()==="unknown" ? "" : (args["start-date"]||"").trim();
const IS_SERIES    = ((args["is-series"]||"").toLowerCase().startsWith("y"));
const SERIES_NAME  = (args["series-name"]||"").trim() || null;
const SERIES_WEEK  = (args["series-week"]||"").trim(); const SERIES_WEEK_NUM = SERIES_WEEK ? Number(SERIES_WEEK) : null;
const IS_CHAMP     = ((args["is-championship"]||"").toLowerCase().startsWith("y"));
const CHAMP_TYPE   = (args["championship-type"]||"").trim() || null;
const SLUG_IN      = (args["slug"]||"").trim();
const NOTES        = (args["notes"]||"").trim() || null;

const today = new Date().toISOString().slice(0,10);
const toSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const seasonForMonth = (m) => (m<=2||m===12)?"winter":(m<=5)?"spring":(m<=8)?"summer":"fall";
const monthName = (d) => d ? new Date(d).toLocaleString("en-US",{month:"long"}) : null;

async function getJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error(`GET ${url} -> ${r.status}`); return await r.json(); }
async function getText(url){ const r=await fetch(url,{headers:{'user-agent':'clear-round-kernel/1.0'}}); if(!r.ok) throw new Error(`GET ${url} -> ${r.status}`); return await r.text(); }

function pick(arr){ return arr.find(Boolean) ?? null; }

function extractFromHTML(html, baseUrl) {
  const $ = cheerio.load(html);
  // title
  const title = pick([
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('h1').first().text(),
    $('title').first().text()
  ])?.trim().replace(/\s+/g,' ') || new URL(baseUrl).hostname.replace(/^www\./,'');
  // canonical
  const canonical = $('link[rel="canonical"]').attr('href');
  const official_link = canonical ? new URL(canonical, baseUrl).href : baseUrl;
  // JSON-LD event/place
  let addr=null, venueName=null, geo=null, start=null, end=null;
  $('script[type="application/ld+json"]').each((_,el)=>{
    let raw=$(el).contents().text(); try{
      const data = JSON.parse(raw); const arr = Array.isArray(data)?data:[data];
      for(const o of arr){
        const t = (o['@type']||'').toString().toLowerCase();
        if (t.includes('event')) {
          start = start || o.startDate || null;
          end   = end   || o.endDate   || null;
          const loc = o.location;
          if (loc){
            if (loc.name && !venueName) venueName = loc.name;
            if (loc.address && !addr) addr = loc.address;
            if (loc.geo && (loc.geo.latitude||loc.geo.longitude) && !geo) {
              geo = { lat:Number(loc.geo.latitude), lon:Number(loc.geo.longitude) };
            }
          }
        }
        if (!venueName && o.name) venueName = o.name;
        if (!addr && o.address) addr = o.address;
        if (!geo && o.geo && (o.geo.latitude||o.geo.longitude)) {
          geo = { lat:Number(o.geo.latitude), lon:Number(o.geo.longitude) };
        }
      }
    }catch{}
  });
  // normalize postal address
  let street=null, city=null, state=null, postal=null, country=null;
  if (addr && typeof addr==='object'){
    street  = addr.streetAddress || null;
    city    = addr.addressLocality || null;
    state   = addr.addressRegion || null;
    postal  = addr.postalCode || null;
    country = addr.addressCountry || null;
  }
  return { official_link, title, venueName, street, city, state, postal, country, geo, start, end };
}

(async () => {
  // 1) read indices
  const agentsIndex = await getJSON(AGENTS_INDEX);
  const addShow = agentsIndex["add-show"];
  if (!addShow?.rules || !addShow?.schema) throw new Error("agents index missing add-show.rules/schema");

  // 2) fetch rule + schema
  const rules  = await getJSON(addShow.rules);
  const schema = await getJSON(addShow.schema);

  // 3) fetch official page and extract basics
  const html = await getText(OFFICIAL);
  const ex = extractFromHTML(html, OFFICIAL);

  // 4) apply rules minimal logic (source order & normalization are defined in rules but kernel stays light)
  const official_name = ex.title || rules.defaults?.fallback_title || "Horse Show";
  const slug = SLUG_IN || toSlug(official_name);
  const startDate = START || ex.start || null;
  const endDate   = ex.end   || null;

  // 5) derive
  const yyyymm = startDate ? startDate.slice(0,7) : null;
  const out = {
    show_uid: slug,
    display_name: official_name,
    event_uid: startDate ? `${slug}_${yyyymm}` : null,
    slug,
    timezone: "America/New_York",
    created_date: today,
    last_updated: today,
    meta: {
      official_link: ex.official_link || OFFICIAL,
      official_name: official_name,
      official_start_date: startDate,
      official_end_date: endDate,
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
      sources: Array.from(new Set([ex.official_link || OFFICIAL, OFFICIAL].filter(Boolean)))
    },
    derived: {
      yyyymm,
      month_name: startDate ? monthName(startDate) : null,
      season: startDate ? seasonForMonth(Number(startDate.slice(5,7))) : null,
      status_window: (endDate && new Date(endDate) < new Date(today)) ? "past"
                    : (startDate && new Date(startDate) > new Date(today)) ? "upcoming"
                    : (startDate && endDate) ? "current" : "unknown"
    },
    search: {
      auto_keys: Array.from(new Set([...official_name.toLowerCase().split(/[^a-z0-9]+/).filter(s=>s.length>2),
                                     ex.city?.toLowerCase(), ex.state?.toLowerCase(),
                                     startDate ? startDate.slice(0,4) : null].filter(Boolean))),
      curated_keys: [],
      facets: {
        discipline: null,
        rating: IS_CHAMP ? "championship" : (IS_SERIES ? "series" : null),
        state: ex.state || null,
        region: null,
        airports_primary: [],
        season: startDate ? seasonForMonth(Number(startDate.slice(5,7))) : null,
        is_series: IS_SERIES,
        series_name: SERIES_NAME,
        series_week: SERIES_WEEK_NUM,
        is_championship: IS_CHAMP,
        championship_type: CHAMP_TYPE
      }
    },
    aliases: { curated: [] },
    ops: {
      needs_meta_refresh: !startDate,
      needs_research: true,
      needs_blog: false,
      last_ops_check: today,
      stale_reason: startDate ? null : "missing_start_date"
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

  // 6) validate strictly against schema
  const ajv = new Ajv({allErrors:true, strict:false}); addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(out)) {
    console.error(JSON.stringify(validate.errors, null, 2));
    process.exit(1);
  }

  // 7) print ONE JSON
  process.stdout.write(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e.stack||e.message); process.exit(1); });
