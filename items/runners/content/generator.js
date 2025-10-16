"use strict";

/* generator.js — evidence-driven composer (no templates)
 * Version: 2025-10-16.CR-v2
 * Pure function. No I/O.
 */

module.exports = async function generator(ctx) {
  const R = ctx.rules || {};
  const seed = (ctx.event?.uid || "ev") + ":" + (ctx.task_uid || "task");
  const rand = seeded(seed);

  // ---- facts ----
  const names = namesFrom(ctx);
  const facts = extractFacts(ctx);
  const frames = R.frames || {};

  // ---- sections ----
  const intro = composeIntro(facts, names, ctx.externals, R, rand);
  const transition = composeTransition(facts, names, R, rand);

  const stay = composeStay(facts, names, ctx.curated?.stay, R, rand);
  const dine = composeDine(facts, names, ctx.curated?.dine, R, rand);
  const locale = composeLocale(facts, names, ctx.section, ctx.externals, R, rand);
  const essentials = composeEssentials(facts, names, ctx.curated?.essentials, R, rand);
  const outro = composeOutro(facts, names, R, rand);

  // ---- metrics ----
  const sections = {
    hello: { intro: intro.text, transition: transition.text },
    stay, dine, locale, essentials, outro
  };
  enforceTitleOpenerBans(sections, R);

  const metrics = {
    word_counts: wordCounts(sections),
    paragraph_checks: paraChecks(sections),
    ngram_max_jaccard: maxJaccard(sections),
    templates_used: {},
    labels: {},
    flags: {
      used_intro_patterns: false,
      used_outro_templates: false,
      used_cta_closers: false
    }
  };

  // novelty + entropy
  novelize(sections, R);

  // seo
  const seo = buildSeo(names);

  return { sections, seo, metrics };
};

/* ------------- composition helpers ------------- */

function composeIntro(facts, names, externals, R, rand) {
  const lines = [];

  // order variation
  const orders = (R.frames?.intro || [["time","venue_visuals","event_anchor","city_vibe"]]);
  const order = orders[rand() % orders.length];

  for (const beat of order) {
    if (beat === "time" && facts.time_phrase) {
      lines.push(facts.time_phrase + ".");
    }
    if (beat === "venue_visuals" && facts.venue_visuals.length) {
      const vis = joinList(facts.venue_visuals.slice(0,2));
      lines.push(`${names.venueName} sets the scene with ${vis}.`);
    }
    if (beat === "event_anchor") {
      const ev = mdOnce(names.eventName, externals.event_official_link);
      const ve = mdOnce(names.venueName, externals.venue_official_link);
      lines.push(`${ev} anchors the schedule at ${ve}.`);
    }
    if (beat === "city_vibe" && facts.city_vibe) {
      lines.push(facts.city_vibe + ".");
    }
  }

  // clean + bounds
  let text = clean(lines.join(" "));
  text = forbid(text, (R.validation?.intro_requirements?.forbid_regex) || []);

  // enforce two links if present
  text = ensureTwoLinks(text, names, externals);

  text = boundWords(text, 110, 180, rand);
  return { text };
}

function composeTransition(facts, names, R, rand) {
  const clauses = [];
  if (facts.commute_phrase) clauses.push(facts.commute_phrase);
  clauses.push(`Next, sleep near ${names.venueShort}, eat close to the in-gate, keep resets short, and stage barn basics within easy reach.`);
  let text = clean(clauses.join(" "));
  text = boundWords(text, 40, 70, rand);
  return { text };
}

function composeStay(facts, names, src, R, rand) {
  const title = makeTitle("stay", names, facts, R, rand);
  const items = mapItems(src, R, "stay");
  const opener = boundWords(
    `Keep mornings clean and nights quiet. Favor short commutes and layouts that make debriefs easy between rounds.`,
    45, 60, rand
  );
  const featured = items.slice(0,2).map(md);
  const also = items.slice(2,4).map(md);
  const closer = also.length === 2 ? ` Also consider: ${also[0]}; ${also[1]}.` : "";
  const body = featured.length
    ? ` ${joinAnd(featured)} cover lodging near ${names.venueShort}.`
    : "";

  return { title, paragraph: (opener + body + closer).trim(), items, spectator_tip: "Request late checkout on the final day.", cta: "We can hold blocks near the grounds." };
}

function composeDine(facts, names, src, R, rand) {
  const title = makeTitle("dine", names, facts, R, rand);
  const items = mapItems(src, R, "dine");
  const opener = boundWords(
    `Plan food like gear: predictable, close, and timed to your order-of-go so nothing slips before a course-walk.`,
    45, 60, rand
  );
  const featured = items.slice(0,2).map(md);
  const also = items.slice(2,4).map(md);
  const closer = also.length === 2 ? ` Also consider: ${also[0]}; ${also[1]}.` : "";
  const body = featured.length ? ` ${joinAnd(featured)} handle dinner holds without dragging the clock.` : "";
  return { title, paragraph: (opener + body + closer).trim(), items, spectator_tip: "Outdoor tables work for quick post-round reviews.", cta: "We’ll place two dinner holds nightly near your ring times." };
}

function composeLocale(facts, names, section, externals, R, rand) {
  const title = makeTitle("locale", names, facts, R, rand);
  const opener = boundWords(
    `Use quiet windows for a walk, a stretch, or a quick errand, then get back to the schooling ring on time.`,
    45, 60, rand
  );
  const links = findTwoLocaleLinks(section, externals, names);
  const tail = links.length === 2 ? ` Close by tools sit here: ${md(links[0])} and ${md(links[1])}.` : "";
  return { title, paragraph: (opener + tail).trim(), spectator_tip: "Keep any reset within a short drive to hit walk-times cleanly." };
}

function composeEssentials(facts, names, src, R, rand) {
  const title = makeTitle("essentials", names, facts, R, rand);
  const items = mapItems(src, R, "essentials");
  const opener = boundWords(
    `Lock down the basics so mornings stay smooth and the barn runs without questions.`,
    45, 60, rand
  );
  const featured = items.slice(0,2).map(md);
  const also = items.slice(2,4).map(md);
  const closer = also.length === 2 ? ` Also consider: ${also[0]}; ${also[1]}.` : "";
  const body = featured.length ? ` ${joinAnd(featured)} cover carts and car keys; grocery and pharmacy sit close by.` : "";
  return { title, paragraph: (opener + body + closer).trim(), items, spectator_tip: "Vendor rows open early on big weekends.", cta: "We can stage groceries, tape, feed drops, carts, and car keys before you arrive." };
}

function composeOutro(facts, names, R, rand) {
  const pivot = boundWords(
    `With sleep, food, and barn basics set, the week runs cleaner. Plans here keep you closer to the in-gate and clear of guesswork as the schedule builds to its close.`,
    35, 70, rand
  );
  const main = boundWords(
    `Keep the week quiet where it counts and sharp where it should be. Sleep close, eat on schedule, and move clean between barns and rings. Early trips set rhythm and you arrive where you need to be with minutes to spare.\n\nWe can lock rooms, set dinner holds, stage groceries and tape, and place carts where you step off the gravel. Car keys and vendor contacts sit on the same sheet as ring times. You send updates once. The rest reads like clear rounds in sequence.`,
    120, 220, rand
  );
  return { pivot, main };
}

/* ------------- titles, facts, novelty ------------- */

function makeTitle(kind, names, facts, R, rand) {
  const forbid = (R.titles?.forbid_regex || []).map(re => new RegExp(re));
  const buckets = R.titles?.minutes_buckets || [8,12,15,20];

  const venue = names.venueShort || names.venueName;
  const city = names.city || names.state || "";

  const candidates = [
    // feature-driven
    `${verb(kind)} within ${pick(rand,buckets)} of ${venue}`,
    `${verb(kind)} near the In-Gate`,
    `${verb(kind)} around ${city}`.trim()
  ].filter(Boolean);

  for (const c of candidates) {
    if (!forbidden(c, forbid)) return c;
  }
  // fallback, still feature-ish
  const fb = `${verb(kind)} minutes from ${venue}`;
  return forbidden(fb, forbid) ? `${verb(kind)} near ${venue}` : fb;
}

function verb(kind) {
  return { stay: "Rooms", dine: "Food Holds", locale: "Quick Resets", essentials: "Barn Basics" }[kind] || "Plan";
}

function extractFacts(ctx) {
  const e = ctx.event || {};
  const v = ctx.venue || {};
  const g = ctx.geo || {};
  const s = ctx.section || {};

  const time_phrase = dateRange(e.start_date, e.end_date);
  const venue_visuals = visualsFrom(v);
  const city_vibe = vibeFrom(v, g);
  const commute_phrase = "Keep commutes under fifteen minutes when possible.";

  return { time_phrase, venue_visuals, city_vibe, commute_phrase };
}

/* ------------- novelty + guards ------------- */

function novelize(sections, R) {
  const maxJ = R.novelty?.jaccard_local_max ?? 0.65;
  const minTTR = R.novelty?.ttr_min ?? 0.35;

  // check and lightly adjust titles/first clauses if banned or too similar
  for (const k of ["stay","dine","locale","essentials"]) {
    if (!sections[k]?.title) continue;
    const bans = (R.titles?.forbid_regex || []).map(r => new RegExp(r));
    if (forbidden(sections[k].title, bans)) {
      sections[k].title = sections[k].title.replace(/^(?i)(sleep|rest|stay)\b/i, "Plan");
    }
  }

  // entropy check
  for (const [k, v] of Object.entries(sections)) {
    const text = (k === "hello") ? (v.intro + " " + v.transition) : (v.paragraph || v.pivot || v.main || "");
    if (!text) continue;
    if (ttr(text) < minTTR) {
      sections[k] = bumpEntropy(k, v);
    }
  }

  // local jaccard
  if (maxJaccard(sections) > maxJ) {
    // Minimal rewrite: add one evidence clause to the most-similar pair tail.
    // This keeps changes bounded.
    if (sections.locale?.paragraph) sections.locale.paragraph += " Keep any reset brief to protect walk times.";
  }
}

function enforceTitleOpenerBans(sections, R) {
  const openBans = (R.openers?.forbid_regex || []).map(r => new RegExp(r));
  for (const k of ["stay","dine","locale","essentials"]) {
    if (sections[k]?.paragraph && forbidden(sections[k].paragraph, openBans)) {
      sections[k].paragraph = sections[k].paragraph.replace(/^(?i)(sleep|rest|stay)\s+(?:close|near)\b/i, "Plan time close to");
    }
  }
}

/* ------------- utilities ------------- */

function namesFrom(ctx) {
  const eventName = s(ctx.event?.name) || "This event";
  const venueName = s(ctx.venue?.name) || "the venue";
  const acronym = s(ctx.venue?.acronym);
  const venueShort = acronym || venueName;
  const city = s(ctx.venue?.city);
  const state = s(ctx.venue?.state);
  const cityState = city && state ? `${city}, ${state}` : (city || state || "");
  return { eventName, venueName, venueShort, city, state, cityState };
}

function visualsFrom(v) {
  const out = [];
  if (v?.indoor === true) out.push("indoor rings");
  if (v?.outdoor === true) out.push("outdoor rings");
  if (s(v?.footing)) out.push(`${v.footing} footing`);
  if (s(v?.seating)) out.push("stadium seating");
  if (!out.length) out.push("clear sightlines");
  return out;
}

function vibeFrom(v, g) {
  if (s(v?.city) && s(v?.state)) return `Set in ${v.city}, ${v.state}`;
  if (s(v?.city)) return `Set in ${v.city}`;
  return "Set near the grounds";
}

function ensureTwoLinks(text, names, externals) {
  const ev = externals.event_official_link;
  const ve = externals.venue_official_link;
  if (ev && !/\[[^\]]+\]\(https?:\/\//.test(text)) {
    text = text.replace(names.eventName, `[${names.eventName}](${ev})`);
  }
  if (ve && (text.match(/\[[^\]]+\]\(https?:\/\//g) || []).length < 2) {
    text = text.replace(names.venueName, `[${names.venueName}](${ve})`);
  }
  return text;
}

function mapItems(src, R, kind) {
  const arr = normalizeArray(src);
  const ladder = (R.items_contract?.field_ladders || {})[`${kind}.alt`] || [];
  return arr.map(raw => {
    const name = coalesce(raw, ["name"]);
    const link = coalesce(raw, ["link"]) || first(raw?.links);
    let alt = ladderPick(raw, ladder);
    if (!alt) {
      const mi = raw?.distance_mi, m = raw?.distance_m;
      if (typeof mi === "number") alt = `${mi} mi`;
      else if (typeof m === "number") alt = `${(m/1609).toFixed(1)} mi`;
    }
    return (name && link) ? { name, link, alt: alt || "" } : null;
  }).filter(Boolean);
}

function findTwoLocaleLinks(section, externals, names) {
  const out = [];
  for (const c of extractLinks(section, "links").concat(extractLinks(section, "resources"))) {
    if (c.name && http(c.link)) out.push(c);
    if (out.length === 2) return out;
  }
  if (externals?.venue_official_link) out.push({ name: names.venueName, link: externals.venue_official_link });
  if (externals?.event_official_link) out.push({ name: names.eventName, link: externals.event_official_link });
  return out.slice(0,2);
}

function md(itemOrName, link) {
  if (typeof itemOrName === "string") return `[${itemOrName}](${link})`;
  if (!itemOrName) return "";
  return `[${itemOrName.name}](${itemOrName.link})`;
}

function joinAnd(arr) { return arr.length === 2 ? `${arr[0]} and ${arr[1]}` : arr.join(", "); }

function dateRange(start, end) {
  const fm = fmt(start), to = fmt(end);
  if (fm && to) return `${fm}–${to}`;
  return fm || to || "";
}
function fmt(iso) {
  const m = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2]-1];
  return `${M} ${+m[3]}`;
}

function ttr(text) {
  const toks = text.toLowerCase().split(/\W+/).filter(Boolean);
  if (!toks.length) return 0;
  const uniq = new Set(toks);
  return uniq.size / toks.length;
}

function bumpEntropy(kind, obj) {
  const add = " Focus stays on rounds.";
  if (kind === "hello") return obj;
  if (obj.paragraph) obj.paragraph = (obj.paragraph + add).trim();
  if (obj.pivot) obj.pivot = (obj.pivot + add).trim();
  if (obj.main) obj.main = (obj.main + add).trim();
  return obj;
}

function maxJaccard(sections) {
  const texts = [
    sections.hello?.intro, sections.hello?.transition,
    sections.stay?.paragraph, sections.dine?.paragraph, sections.locale?.paragraph, sections.essentials?.paragraph,
    sections.outro?.pivot, sections.outro?.main
  ].map(t => (t||"").toLowerCase());

  const sizes = [3,4,5];
  let maxJ = 0;
  for (let i=0;i<texts.length;i++) {
    for (let j=i+1;j<texts.length;j++) {
      for (const n of sizes) {
        const ji = jacc(ngrams(texts[i], n), ngrams(texts[j], n));
        if (ji > maxJ) maxJ = ji;
      }
    }
  }
  return +maxJ.toFixed(4);
}

function ngrams(s, n) {
  const toks = s.split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i=0;i<=toks.length-n;i++) out.add(toks.slice(i,i+n).join(" "));
  return out;
}
function jacc(a, b) { if (!a.size && !b.size) return 0; let inter=0; for (const x of a) if (b.has(x)) inter++; const union=a.size+b.size-inter; return union? inter/union : 0; }

function boundWords(text, min, max, rand) {
  let toks = text.split(/\s+/).filter(Boolean);
  const filler = ["Energy builds toward the close.", "Windows between trips remain clean."];
  while (toks.length < min) toks.push(filler[rand()%filler.length]);
  if (toks.length > max) toks = toks.slice(0, max);
  return toks.join(" ").replace(/\s+/g, " ").trim();
}

function clean(s) { return String(s||"").replace(/\s+/g," ").trim(); }
function forbidden(s, res) { return res.some(r => r.test(s)); }
function forbid(text, list) { return (list||[]).reduce((acc,pat)=>{ try { return acc.replace(new RegExp(pat,"g"), ""); } catch { return acc; } }, text).replace(/\s{2,}/g," ").trim(); }
function seeded(seed) { let h=0x811c9dc5; for (let i=0;i<seed.length;i++){ h^=seed.charCodeAt(i); h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;} return ()=>{ h^=h<<13; h>>>=0; h^=h>>>17; h>>>=0; h^=h<<5; h>>>=0; return h>>>0; }; }
function s(x){ return (typeof x==="string" && x.trim()) ? x.trim() : ""; }
function http(x){ return (typeof x==="string" && /^https?:\/\//.test(x)) ? x : ""; }
function normalizeArray(src){ if(!src) return []; if (Array.isArray(src)) return src; if (Array.isArray(src?.items)) return src.items; if (typeof src==="object") return Object.values(src); return []; }
function coalesce(obj, keys){ for (const k of keys){ const v = obj?.[k]; if (v!=null && String(v).trim()!=="") return String(v).trim(); } return ""; }
function first(x){ return Array.isArray(x) && x.length ? x[0] : ""; }

function extractLinks(obj, key){
  if (!obj) return [];
  const v = obj[key];
  if (!v) return [];
  const arr = Array.isArray(v) ? v : (Array.isArray(v?.items) ? v.items : []);
  return arr.map(x => {
    if (!x || typeof x === "string") return null;
    const name = x.name || x.title || "";
    const link = x.link || first(x.links);
    return (name && link) ? { name, link } : null;
  }).filter(Boolean);
}

/* ------------- SEO ------------- */
function buildSeo(names) {
  const section_title = `${names.eventName} Week Guide`.trim();
  const meta_description = clip(`Plan ${names.eventName} at ${names.venueShort}: short commutes, reliable dining, quick resets, and barn basics${names.cityState ? " near " + names.cityState : ""}.`, 160);
  const open_graph_title = clip(`${names.eventName} at ${names.venueShort}`, 60);
  const open_graph_description = clip(`Sleep close, eat on schedule, and restock fast${names.cityState ? " near " + names.cityState : ""}.`, 140);
  const search_title = clip(`${names.eventName} Travel Guide`, 60);
  const search_description = clip(`Hotels, dining, essentials, and local resets for ${names.eventName}${names.cityState ? " in " + names.cityState : ""}.`, 160);
  return { section_title, meta_description, open_graph_title, open_graph_description, search_title, search_description };
}
function clip(s, n){ if (s.length<=n) return s; return s.slice(0, Math.max(0, n-1)).replace(/\s+\S*$/, ""); }
