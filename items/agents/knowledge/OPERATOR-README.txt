CLEAR ROUND TRAVEL — OPERATOR README (v1.0)

SCOPE (FACTS-ONLY)
- This repo stores small “cards” (JSON/text) for: events (incl. legs), venues, places (hotels/restaurants/airbnbs/rvparks/sites/parks), normalizers (time/location), labels (global tags), and later: content.
- Cards are factual only (no tone/prose). Content cards live separately.
- All tasks follow: HINTS → CONFIRM from official sources → PREVIEW (full files + paths) → COMMIT/EDIT/CANCEL. No implicit writes.

RUNTIME / PROXY
- Base (proxy-first): https://crt-b1434e13de34.herokuapp.com
- Health:            GET https://crt-b1434e13de34.herokuapp.com/health
- Manifest:          GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
- Generated index:   GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json
- Rules (always read before tasks):
  • Ingestion:       GET https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
  • Event rules:     GET https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
  • Venue rules:     GET https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
  • Place rules:     GET https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
  • Cards core:      GET https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
  • Labels rules:    GET https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json
- Commit endpoint (manual write): POST https://crt-b1434e13de34.herokuapp.com/items/commit  (body: {path,json,message})
  • Allowed GET/PUT file types: .json .txt .md .html .js
  • Allowed top-level dirs: as configured via ALLOW_DIRS (proxy env). Use full paths, e.g., items/index/events/…json
  • The proxy normalizes “items/” and busts its cache on successful commit.

SESSION START (PASTE THIS FIRST IN ANY NEW SESSION)
SESSION-START vX: proxy=https://crt-b1434e13de34.herokuapp.com manifest=/items/agents/manifest.json mode=task-only overrides: filename_equals_uid=false leg_label=Leg tz=America/New_York
Startup checklist (assistant MUST run): 
GET /health → OK • GET /items/agents/manifest.json → OK • GET /items/agents/ingestion-rules.txt → OK • GET /items/agents/event-rules.json → OK • GET /items/agents/venue-rules.json → OK • GET /items/_manifest.json → OK.
If any fails: STOP and report the full URL + status. 
To re-sync mid-session: RESET → version vX; use proxy; reload manifest.

GLOBAL POLICY (DON’T REPEAT IN TASKS)
- facts_only=true • timezone=America/New_York • date_format=YYYY-MM-DD • bool_encoding=yn
- uid_regex=^[a-z0-9]+(?:-[a-z0-9]+)*$ • ignore_prefixes=[dnu_, ignore_]
- official_link_must_be_https=true • confirm official name/dates from the site(s) before write
- relations_must_resolve=true (venue gate: confirm/input/exit)
- labels: predefined only, stored one-file-per-label under items/index/labels/, with compiled _index.json

CARD CORE (APPLIES TO ALL FAMILIES)
- *_uid (primary), display_name
- created_date, last_updated (ET, ISO)
- source_uids (domain-slug), label_uids (predefined only)
- Optional location binds: city_uid, state_uid, country_uid
- notes (facts-only) 
See: items/agents/cards-core.txt

ENTITIES & NAMING
- EVENTS
  • UID = slugify( sanitize_official_name(official_name) ) after stripping venue/organizer/sponsors/ratings/years/common terms (“horse show(s)”, “circuit”, “classic”, “series”, etc.).
  • Filename (events only): {organizer_uid}-{event_uid}.json (filename_equals_uid=false)
  • is_series ∈ {y|n|auto}; if series, create “legs” inside hub window. Guards: legs inside hub; non-overlapping. Internal label = “Leg N”; public display must NOT say “Leg” unless source uses it.
  • Organizer and Venue are distinct; venue_uid must end with -venue.
  • Derived (never overwrite inputs): yyyymm, event_duration, event_current_status, days_until_start/end, estimated_next_start (if annual), month_uids, year_uid, season_uid; for legs also week_uids/day_uids.
- VENUES
  • UID: {slugified-name}-venue; filename_equals_uid=true; venue gate strict (confirm/input/exit).
- PLACES (hotel|restaurant|airbnb|rvpark|site|park)
  • UID: flat slugified name (append city stem on collision); filename_equals_uid=true.
  • All place types share place-rules; venue has its own venue-rules.

LABELS (GLOBAL TAGS)
- Storage: items/index/labels/{label_uid}.json (one file per label); compiled index: items/index/labels/_index.json
- Each label: label_uid, label_display_name, label_family, allow_on[], synonyms[], is_active, created_date, last_updated (+ optional description, implies[], conflicts_with[], replaces/deprecated_by)
- Tasks must validate include/exclude sets against _index.json. Unknown: hard error. Derived tags not in catalog are dropped.

NORMALIZERS (REQUIRED WHEN REFERENCED)
- Time: items/index/{days|months|seasons|years|weeks}/…
- Location: items/index/{countries|states|cities}/…
- Others: weather, airports, labels
- Missing normalizer → halt with needs_normalizer.

TASKS (ENABLED)
A) add-event (add_event)
Inputs (HINTS):
  - link (official HTTPS), name (candidate), start (YYYY-MM or YYYY-MM-DD)
  - venue_uid OR venue_hint (venue gate)
Optional:
  - end (YYYY-MM-DD), is_series (y|n|auto), series_label, total_legs_hint, organizer_uid
Flow:
  - Confirm official homepage, canonical title, schedule dates from site(s).
  - Build hub (+ legs if series). PREVIEW: full file(s) + target paths. Await COMMIT/EDIT/CANCEL.
Rails:
  - official_link_must_be_https + official_site
  - filename template {organizer_uid}-{event_uid}.json
  - legs inside hub; non-overlap; display_name should not include “Leg”.

B) add-venue (add_venue)
Inputs (HINTS): link, name, city_uid, state_uid, country_uid, aka (pipe list)
Behavior:
  - Confirm official link/name; resolve/normalize address, geo_lat/geo_long or google_pin when present; keywords derived from page; label_uids filtered to predefined.
  - Enforce UID suffix -venue; filename_equals_uid=true.
PREVIEW → COMMIT.

C) add-place (add_place)  [non-venue place types]
Inputs (HINTS): place_type (hotel|restaurant|airbnb|rvpark|site|park), link, name, city_uid, state_uid, country_uid
Optional: primary_venue_uid, near_venue_uids (each must end -venue), aka, keywords
Behavior:
  - Same confirmation & normalization rails as venue; shared place-rules.
  - PREVIEW → COMMIT.

D) curate-places (curate_places)  [no writes; emits a table preview and optional text CSV]
Purpose: quick curation from public web given time/location targeting.
Inputs:
  - place_type, city/state/country, optional near_venue_uid (enables distance/walkable), radius_miles
  - price_band (normalized), min_review_score, chain_mode (allow|exclude|only)
  - include_labels|exclude_labels (must exist in labels index)
  - target_month_uids|target_season_uid|target_start_date|target_end_date (for naming/diagnostics only)
  - strict_price=y|n, max_results, save=y|n, filename_hint
Output (PREVIEW):
  - columns + rows with distance_miles, walkable, price fields (raw/detected/normalized/match), review fields, derived tags filtered to global labels, and diagnostics (sources_used, counts, events_in_window when near_venue_uid + indices present).
Save path (when save=y): items/agents/curations/{place_type}/{near_key}-{time_key}{-hint}.txt

E) refresh-derived-card-data (refresh_derived)
- Recompute derived fields for events/legs/venues/places (days_until, statuses, yyyymm, month_uids/year_uid/season_uid, week/day uids for legs).
- Never overwrite input fields. PREVIEW delta → COMMIT write.

F) index-cards (index_cards)
- Walk cards and emit flat indices:
  • by_time: byYear, byMonth, bySeason, byWeek, next7d, next30d
  • by_location: byCity, byState, byCountry
  • by_relation: byVenue, byOrganizer
  • by_label: label_uid → [card_uids]
- Outputs live under items/index/ (read-only artifacts).

HANDSHAKE (ALL TASKS)
1) You post a “Task: …” line with full inputs (hints).
2) Assistant returns PREVIEW: one or more {path, message, json|text} blocks.
3) You reply COMMIT (or EDIT/CANCEL). On COMMIT, assistant returns the exact POST body for /items/commit.
4) On success, proxy cache is invalidated. No implicit writes.

DRIFT PROTECTION
- Always use full proxy URLs above; assistant stops on any failed GET and prints the failing URL/status.
- No guessing: venue gate requires resolve/confirm/input/exit.
- Unknown labels → error (include/exclude). Derived labels must exist in global catalog.
- Relations must resolve before PREVIEW can be COMMIT’d.

DIRECTORIES & FILENAME RULES (SUMMARY)
- Events: items/index/events/{organizer_uid}-{event_uid}.json  (filename_equals_uid=false)
- Venues: items/index/venues/{venue_uid}.json (must end -venue)
- Places: items/index/stay|dine|…/{place_uid}.json (per place-rules)
- Labels: items/index/labels/{label_uid}.json + items/index/labels/_index.json
- Indices: items/index/{by_time|by_location|by_relation|by_label}.json
- Sources: items/index/sources/{source_uid}.json (domain-slug policy)

AIRTABLE (OPTIONAL STAGING)
- Use Airtable to collect hints/CSV exports. Airtable is never authoritative; commits happen via /items/commit after PREVIEW.
- Export shape should match task inputs; normalization/enrichment happens in task flow.

NOTES / FUTURE
- research-locations (read-only, powers enrichment for venues/places) — later
- curate-content + render-content (content cards & MD stitching) — later
- If rules change, bump README version and use “RESET → version vX” in-session.

END
