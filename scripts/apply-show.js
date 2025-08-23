#!/usr/bin/env node
// Usage: node scripts/apply-show.js /path/to/meta.json
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/apply-show.js /path/to/meta.json');
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error('File not found:', src);
  process.exit(1);
}

const root = process.cwd();
const showsDir = path.join(root, 'shows');

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJSON(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function toSlug(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function seasonForMonth(m){ return (m<=0||m>12)?null:(m<=2||m===12)?'winter':(m<=5)?'spring':(m<=8)?'summer':'fall'; }

const meta = readJSON(src);

// derive/normalize a few essentials if missing
const slug = meta.slug || meta.show_uid || toSlug(meta.display_name || meta.meta?.official_name || 'show');
meta.slug = slug;
meta.show_uid = meta.show_uid || slug;
const today = new Date().toISOString().slice(0,10);
meta.created_date = meta.created_date || today;
meta.last_updated = today;

// derived block if missing
if (!meta.derived) meta.derived = {};
if (!meta.derived.yyyymm && meta.meta?.official_start_date) {
  meta.derived.yyyymm = meta.meta.official_start_date.slice(0,7);
  meta.derived.month_name = new Date(meta.meta.official_start_date).toLocaleString('en-US',{month:'long'});
  meta.derived.season = seasonForMonth(Number(meta.meta.official_start_date.slice(5,7)));
}
if (!meta.timezone) meta.timezone = 'America/New_York';

// write into repo tree
const base = path.join(showsDir, slug);
const eventsDir = path.join(base, 'events');
const metaPath = path.join(eventsDir, 'meta.json');

// create minimal show structure (with .gitkeep so folders exist in git)
const dirs = [
  base,
  path.join(base, 'research'),
  path.join(base, 'evergreen'),
  eventsDir,
  path.join(eventsDir, 'reviewed'),
  path.join(eventsDir, 'assembled'),
];
dirs.forEach(d => { fs.mkdirSync(d, { recursive: true }); const keep = path.join(d,'.gitkeep'); if (!fs.existsSync(keep)) fs.writeFileSync(keep,''); });

// write meta.json
writeJSON(metaPath, meta);

// rebuild index.json by scanning shows/**
const index = { version: 1, generated_at: today, shows: [] };
if (fs.existsSync(showsDir)) {
  for (const name of fs.readdirSync(showsDir)) {
    const p = path.join(showsDir, name, 'events', 'meta.json');
    if (!fs.existsSync(p)) continue;
    try {
      const m = readJSON(p);
      index.shows.push({
        slug: m.slug || name,
        display_name: m.display_name || m.meta?.official_name || m.slug || name,
        yyyymm: m.derived?.yyyymm || (m.meta?.official_start_date ? m.meta.official_start_date.slice(0,7) : null),
        title_official: m.meta?.official_name || null,
        location_city: m.meta?.venue_city || null,
        location_state: m.meta?.venue_state || null,
        venue_name: m.meta?.venue_name || null,
        meta_path: path.relative(root, p).replace(/\\/g,'/'),
        has_sections: [],
        flags: {
          is_series: !!(m.search?.facets?.is_series),
          is_championship: !!(m.search?.facets?.is_championship)
        }
      });
    } catch (e) {
      console.error('Skipping bad JSON:', p, e.message);
    }
  }
}
index.shows.sort((a,b) => (a.slug||'').localeCompare(b.slug||''));
writeJSON(path.join(root,'index.json'), index);

console.log('✅ Installed:', metaPath);
console.log(`✅ index.json updated with ${index.shows.length} show(s)`);
