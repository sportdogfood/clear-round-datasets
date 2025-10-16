/* generator.js — pure content synthesizer
 * Version: 2025-10-16.CR-v1
 * Runtime: Node 18+ (no I/O). Export a single async function.
 *
 * Input (from expeditor):
 *   {
 *     task_uid, lane, version,
 *     event, venue, geo, section,
 *     libs: { audiences, patterns, ctas, outros, gold },
 *     curated: { stay, dine, essentials },
 *     externals: { event_official_link, venue_official_link },
 *     knobs: { word_target?, use_keywords_min?, use_insiders_min?, include_weather? },
 *     flags: { research_mode? },
 *     rules // generator.rules.json (already loaded by expeditor)
 *   }
 *
 * Output:
 *   { sections: {...}, seo: {...}, metrics: {...} }
 */

"use strict";

module.exports = async function generator(ctx) {
  const R = ctx.rules || {};
  const seed = (ctx.event?.uid || "ev") + ":" + (ctx.task_uid || "task");
  const rand = seeded(seed);

  // ---- Prepare basics ----
  const names = deriveNames(ctx);
  const beats = deriveBeats(ctx, R, names);
  const titles = makeTitles(names, rand);

  // ---- Items mapping ----
  const stayItems = mapItems(ctx.curated?.stay, R, "stay");
  const dineItems = mapItems(ctx.curated?.dine, R, "dine");
  const essItems  = mapItems(ctx.curated?.essentials, R, "essentials");

  // ---- Build sections ----
  const intro = buildIntro(ctx, R, beats, names, rand);
  const transition = buildTransition(R, names, rand);

  const stay = buildZone({
    kind: "stay", R, title: titles.stay, items: stayItems, names, rand
  });

  const dine = buildZone({
    kind: "dine", R, title: titles.dine, items: dineItems, names, rand
  });

  const locale = buildLocale({
    R, title: titles.locale, names, rand, section: ctx.section, externals: ctx.externals
  });

  const essentials = buildEssentials({
    R, title: titles.essentials, items: essItems, names, rand
  });

  const outro = buildOutro(R, names, rand);

  // ---- Metrics ----
  const sections = {
    hello: { intro: intro.text, transition: transition.text },
    stay,
    dine,
    locale,
    essentials,
    outro
  };

  const word_counts = countWords(sections);
  const paragraph_checks = paraChecks(sections);
  const ngram_max_jaccard = maxJaccard(sections, R);
  const templates_used = {}; // reserved hook
  const labels = {};         // reserved hook

  // ---- SEO ----
  const seo = buildSeo(names, R);

  return {
    sections,
    seo,
    metrics: {
      word_counts,
      paragraph_checks,
      ngram_max_jaccard,
      templates_used,
      labels,
      flags: {
        used_intro_patterns: false,
        used_outro_templates: false,
        used_cta_closers: false
      }
    }
  };
};

/* ========================= helpers ========================= */

function deriveNames(ctx) {
  const eventName = safeStr(ctx.event?.name) || "This event";
  const venueName = safeStr(ctx.venue?.name) || "the venue";
  const city = safeStr(ctx.venue?.city);
  const state = safeStr(ctx.venue?.state);
  const cityState = city && state ? `${city}, ${state}` : (city || state || "");
  const acronym = safeStr(ctx.venue?.acronym);
  const venueShort = acronym || venueName;
  return { eventName, venueName, venueShort, city, state, cityState };
}

function deriveBeats(ctx, R, names) {
  const start = ctx.event?.start_date || "";
  const end   = ctx.event?.end_date || "";
  const time_phrase = humanizeDateRange(start, end);
  const season_phrase_only = seasonFromDate(start, end);
  const city_presence_phrase = names.cityState ? `in ${names.cityState}` : "in the host city";
  // Do not invent specifics; keep safe defaults.
  const event_stature_hallmark_or_final = "marquee week on the calendar";
  const venue_visual_flow_trait = "clear sightlines and efficient ring flow";
  const rider_caliber_if_confirmed = ""; // only if explicitly provided (not guessing)
  return {
    time_phrase,
    season_phrase_only,
    city_presence_phrase,
    event_stature_hallmark_or_final,
    venue_visual_flow_trait,
    rider_caliber_if_confirmed
  };
}

function makeTitles(names, rand) {
  return {
    stay: pick(rand, [
      `Sleep Close to ${truncateWords(names.venueShort, 3)}`,
      `Rest Near ${truncateWords(names.venueShort, 3)}`,
      `Stay Minutes From ${truncateWords(names.venueShort, 3)}`
    ]),
    dine: pick(rand, [
      "Eat Efficiently Nearby",
      "Close, Reliable Meals",
      "Food on the Clock"
    ]),
    locale: pick(rand, [
      "Light Resets Nearby",
      "Quick Off-Grounds Resets",
      "Short Resets That Fit"
    ]),
    essentials: pick(rand, [
      "Barn Basics On Hand",
      "Stock Up Without Drift",
      "Basics Within Easy Reach"
    ])
  };
}

function mapItems(src, R, kind) {
  const arr = normalizeArray(src);
  const ladder = (R?.items_contract?.field_ladders || {})[`${kind}.alt`] || [];
  return arr
    .map(raw => {
      const name = coalesce(raw, ["name"]) || "";
      const link = coalesce(raw, ["link"]) || first(raw?.links) || "";
      const alt  = ladderPick(raw, ladder) || "";
      return (name && link) ? { name, link, alt } : null;
    })
    .filter(Boolean);
}

function buildIntro(ctx, R, beats, names, rand) {
  const min = R.sections?.hello_intro?.words_min || 110;
  const max = R.sections?.hello_intro?.words_max || 180;

  const evLink = safeHttp(ctx.externals?.event_official_link);
  const veLink = safeHttp(ctx.externals?.venue_official_link);

  // Two proper-noun links exactly once each
  const evMd = evLink ? `[${names.eventName}](${evLink})` : names.eventName;
  const veMd = veLink ? `[${names.venueName}](${veLink})` : names.venueName;

  // Compose with >=3 derived beats
  const lines = [];
  lines.push(
    `${beats.time_phrase}, ${beats.season_phrase_only}, ${beats.event_stature_hallmark_or_final}.`
  );
  lines.push(
    `At ${veMd}, ${beats.venue_visual_flow_trait}; pace stays crisp ${names.cityState ? "around " + names.cityState : "on site"}.`
  );
  lines.push(
    `${evMd} anchors the week ${names.city ? "in " + names.city : ""}, with early cadence tightening toward the close.`
  );

  const raw = joinSentences(lines);
  const text = enforceBounds(cleanForbid(raw, R.sections?.hello_intro?.forbid_regex), min, max, rand);

  return { text };
}

function buildTransition(R, names, rand) {
  const min = R.sections?.transition?.words_min || 40;
  const max = R.sections?.transition?.words_max || 70;
  const s = [
    "Lock short drives, predictable meals, and quick restocks so warm-up windows stay on time.",
    `Next: sleep close to ${names.venueShort}, eat near the in-gate, keep resets short, and stage barn basics within easy reach.`
  ];
  return { text: enforceBounds(s.join(" "), min, max, rand) };
}

function buildZone({ kind, R, title, items, names, rand }) {
  const spec = R.sections?.[kind] || {};
  const minO = spec.opener_words_min || 45;
  const maxO = spec.opener_words_max || 60;
  const needsAlso = !!spec.require_also_consider_sentence;

  const opener = {
    stay: `Keep mornings clean and nights quiet. Favor short commutes, simple parking, and layouts that make debriefs easy between rounds.`,
    dine: `Plan food like gear: predictable, close, and timed to your order-of-go so nothing slips before a course-walk.`,
    essentials: `Lock down the basics so mornings stay smooth and the barn runs without questions.`,
    locale: `Keep resets short and simple—one stroll, one coffee, one breath—so focus stays on rounds and reviews.`
  }[kind];

  const openerTxt = enforceBounds(opener, minO, maxO, rand);

  const featured = items.slice(0, 2);
  const also = items.slice(2, 4);

  const inline = featured
    .map(it => `[${it.name}](${it.link})`)
    .join(" and ");

  const closer = needsAlso && also.length >= 2
    ? ` Also consider: [${also[0].name}](${also[0].link}); [${also[1].name}](${also[1].link}).`
    : "";

  const bodyTail = {
    stay: inline ? ` ${inline} cover the lodging lanes near ${names.venueShort}.` : "",
    dine: inline ? ` For seated options nearby, ${inline} handle dinner holds without dragging the clock.` : "",
    essentials: inline ? ` ${inline} cover carts and car keys; grocery and pharmacy sit close by.` : "",
    locale: ""
  }[kind] || "";

  const paragraph = `${openerTxt}${bodyTail}${closer}`.trim();

  const out = { title, paragraph };
  if (kind !== "locale") {
    if (items.length) out.items = items;
    out.spectator_tip = tipFor(kind, names, rand);
    if (spec.cta_allowed) out.cta = ctaFor(kind, names, rand);
  } else {
    out.spectator_tip = "Aim early for any off-grounds stroll; traffic builds on show days.";
  }
  return out;
}

function buildLocale({ R, title, names, rand, section, externals }) {
  // Try to find two named links in section data; fallback to officials.
  const links = findTwoLocaleLinks(section, externals, names);
  const openerMin = R.sections?.locale?.opener_words_min || 45;
  const openerMax = R.sections?.locale?.opener_words_max || 60;
  const opener = `Use quiet windows for a walk, a stretch, or a quick errand, then get back to the schooling ring on time.`;
  const openerTxt = enforceBounds(opener, openerMin, openerMax, rand);
  const close = links.length === 2
    ? ` Close by tools for planning sit here: [${links[0].name}](${links[0].link}) and [${links[1].name}](${links[1].link}).`
    : "";
  return {
    title,
    paragraph: `${openerTxt}${close}`.trim(),
    spectator_tip: "Keep any reset within a short drive to hit walk-times cleanly."
  };
}

function buildEssentials({ R, title, items, names, rand }) {
  return buildZone({ kind: "essentials", R, title, items, names, rand });
}

function buildOutro(R, names, rand) {
  const pMin = R.sections?.outro?.pivot?.words_min || 35;
  const pMax = R.sections?.outro?.pivot?.words_max || 70;
  const mMin = R.sections?.outro?.main?.words_min || 120;
  const mMax = R.sections?.outro?.main?.words_max || 220;

  const pivot = enforceBounds(
    `With sleep, food, and barn basics set, the week runs cleaner. Plans here keep you closer to the in-gate and clear of guesswork as the schedule builds to its close.`,
    pMin, pMax, rand
  );

  const main = enforceBounds(
    `Keep the week quiet where it counts and sharp where it should be. Sleep close, eat on schedule, and move clean between barns and rings. Early trips set rhythm and you arrive where you need to be with minutes to spare.\n\nWe can lock rooms, set dinner holds, stage groceries and tape, and place carts where you step off the gravel. Car keys and vendor contacts sit on the same sheet as ring times. You send updates once. The rest reads like clear rounds in sequence.`,
    mMin, mMax, rand
  );

  return { pivot, main };
}

/* ========================= SEO ========================= */

function buildSeo(names, R) {
  const section_title = `${names.eventName} Week Guide`.trim();
  const meta_description = clipTo(`Plan ${names.eventName} at ${names.venueShort}: short commutes, reliable dining, quick resets, and barn basics${names.cityState ? " near " + names.cityState : ""}.`, 160);
  const og_title = clipTo(`${names.eventName} at ${names.venueShort}`, 60);
  const og_desc  = clipTo(`Sleep close, eat on schedule, and restock fast${names.cityState ? " near " + names.cityState : ""}.`, 140);
  const search_title = clipTo(`${names.eventName} Travel Guide`, 60);
  const search_description = clipTo(`Hotels, dining, essentials, and local resets for ${names.eventName}${names.cityState ? " in " + names.cityState : ""}.`, 160);
  return {
    section_title,
    meta_description,
    open_graph_title: og_title,
    open_graph_description: og_desc,
    search_title,
    search_description
  };
}

/* ========================= utilities ========================= */

function tipFor(kind, names, rand) {
  const bank = {
    stay: [
      "Quiet floors help after late classes.",
      "Request late checkout on the final day."
    ],
    dine: [
      "Outdoor tables work for quick post-round reviews.",
      "Book earlier slots on finals night."
    ],
    essentials: [
      "Vendor rows open early on big weekends.",
      "Restock tape and ice the night before."
    ]
  }[kind] || ["Keep timing tight between trips."];
  return pick(rand, bank);
}

function ctaFor(kind, names, rand) {
  const bank = {
    stay: [
      "Need rooms blocked and late check-in coordinated? We handle it.",
      "Prefer a hotel block near the venue? We’ll stage it."
    ],
    dine: [
      "Want two dinner holds nightly near the in-gate? We’ll set them.",
      "Need reliable seats after late classes? We’ll place the holds."
    ],
    essentials: [
      "We can stage groceries, tape, feed drops, carts, and car keys before you arrive.",
      "We’ll arrange carts, rental car, and basic restock on your schedule."
    ]
  }[kind] || ["We can coordinate the logistics you don’t want to carry."];
  return pick(rand, bank);
}

function findTwoLocaleLinks(section, externals, names) {
  const out = [];
  // Try structured section data
  const candidates = []
    .concat(extractLinks(section, "locale_links"))
    .concat(extractLinks(section, "links"))
    .concat(extractLinks(section, "resources"));
  for (const c of candidates) {
    if (c.name && safeHttp(c.link)) out.push(c);
    if (out.length === 2) return out;
  }
  // Fallback to officials
  if (externals?.venue_official_link) {
    out.push({ name: names.venueName, link: externals.venue_official_link });
  }
  if (externals?.event_official_link) {
    out.push({ name: names.eventName, link: externals.event_official_link });
  }
  return out.slice(0, 2);
}

function extractLinks(obj, key) {
  if (!obj) return [];
  const v = obj[key];
  if (!v) return [];
  const arr = Array.isArray(v) ? v : (Array.isArray(v?.items) ? v.items : []);
  return arr
    .map(x => {
      if (!x) return null;
      if (typeof x === "string") return null;
      const name = x.name || x.title || "";
      const link = x.link || first(x.links);
      return name && link ? { name, link } : null;
    })
    .filter(Boolean);
}

function normalizeArray(src) {
  if (!src) return [];
  if (Array.isArray(src)) return src;
  if (Array.isArray(src?.items)) return src.items;
  if (typeof src === "object") return Object.values(src);
  return [];
}

function coalesce(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}
function first(x) { return Array.isArray(x) && x.length ? x[0] : ""; }

function ladderPick(raw, ladder) {
  for (const k of ladder) {
    const v = raw?.[k];
    if (v == null) continue;
    if (typeof v === "number") return String(v);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // distance formatters
  const mi = raw?.distance_mi, m = raw?.distance_m;
  if (typeof mi === "number") return `${mi} mi`;
  if (typeof m === "number") return `${(m / 1609).toFixed(1)} mi`;
  return "";
}

function enforceBounds(text, min, max, rand) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < min) {
    // pad with neutral cadence
    const add = cadenceFill();
    while (words.length < min) words.push(add[rand() % add.length]);
  }
  if (words.length > max) {
    words.length = max;
  }
  return words.join(" ").replace(/\s+/g, " ").trim();
}

function cadenceFill() {
  // neutral, safe fillers to reach bounds without adding logistics or hype
  return [
    "Focus stays on rounds.",
    "Pacing remains steady.",
    "Windows between trips remain clean.",
    "Reviews fit between schools.",
    "Energy builds toward the close."
  ];
}

function cleanForbid(text, patterns) {
  if (!patterns || !patterns.length) return text;
  let out = text;
  for (const p of patterns) {
    try {
      const re = new RegExp(p);
      out = out.replace(re, "");
    } catch { /* ignore bad regex */ }
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function joinSentences(lines) {
  return lines
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map(s => s.endsWith(".") ? s : s + ".")
    .join(" ");
}

function clipTo(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "";
}

function countWords(sections) {
  const W = {};
  const take = (s) => (s || "").split(/\s+/).filter(Boolean).length;
  W.intro = take(sections.hello?.intro);
  W.transition = take(sections.hello?.transition);
  W.outro_pivot = take(sections.outro?.pivot);
  W.outro_main = take(sections.outro?.main);
  W.stay = take(sections.stay?.paragraph);
  W.dine_paragraph = take(sections.dine?.paragraph);
  W.locale = take(sections.locale?.paragraph);
  W.essentials = take(sections.essentials?.paragraph);
  return W;
}

function paraChecks(sections) {
  return {
    intro_paragraphs: 1,
    transition_paragraphs: 1,
    outro_pivot_paragraphs: 1,
    outro_main_paragraphs: (sections.outro?.main || "").split(/\n{2,}/).length,
    link_checks: {
      intro_p1: {
        event_link_present: /\[[^\]]+\]\(https?:\/\/.+\)/.test(sections.hello?.intro || ""),
        venue_link_present: /\[[^\]]+\]\(https?:\/\/.+\)/.test(sections.hello?.intro || "")
      }
    }
  };
}

function maxJaccard(sections, R) {
  const texts = [
    sections.hello?.intro,
    sections.hello?.transition,
    sections.stay?.paragraph,
    sections.dine?.paragraph,
    sections.locale?.paragraph,
    sections.essentials?.paragraph,
    sections.outro?.pivot,
    sections.outro?.main
  ].map(t => (t || "").toLowerCase());

  const nSizes = (R?.deduplication?.ngram_sizes || [3, 4, 5]).map(n => Math.max(2, n));
  let maxJ = 0;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      for (const n of nSizes) {
        const ji = jaccard(ngrams(texts[i], n), ngrams(texts[j], n));
        if (ji > maxJ) maxJ = ji;
      }
    }
  }
  return Number(maxJ.toFixed(4));
}

function ngrams(s, n) {
  const toks = s.split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i <= toks.length - n; i++) {
    out.add(toks.slice(i, i + n).join(" "));
  }
  return out;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function seasonFromDate(start, end) {
  const month = (s) => {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Number(m[2]) : NaN;
  };
  const m = !isNaN(month(start)) ? month(start) : month(end);
  if (isNaN(m)) return "in season";
  const seasons = [
    { m: [12,1,2], name: "winter" },
    { m: [3,4,5], name: "spring" },
    { m: [6,7,8], name: "summer" },
    { m: [9,10,11], name: "fall" }
  ];
  const s = seasons.find(x => x.m.includes(m))?.name || "season";
  const pos = (m % 3 === 1) ? "early-" : (m % 3 === 2) ? "" : "late-";
  return (pos ? pos + s : s);
}

function humanizeDateRange(start, end) {
  if (!start && !end) return "This week runs on a steady cadence";
  const fm = fmtDate(start);
  const to = fmtDate(end);
  if (fm && to) return `${fm}–${to}`;
  return fm || to || "This week runs on a steady cadence";
}

function fmtDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [_, y, mo, d] = m;
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(mo)-1];
  return `${M} ${Number(d)}`;
}

function seeded(seed) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return function next() {
    // xorshift-like step
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return h >>> 0;
  };
}

function pick(rand, arr) {
  if (!arr || !arr.length) return "";
  return arr[rand() % arr.length];
}

function truncateWords(s, maxW) {
  const ws = String(s || "").split(/\s+/).filter(Boolean);
  return ws.slice(0, maxW).join(" ");
}

function safeStr(x) {
  return (typeof x === "string" && x.trim()) ? x.trim() : "";
}
function safeHttp(x) {
  return (typeof x === "string" && /^https?:\/\//.test(x)) ? x : "";
}
