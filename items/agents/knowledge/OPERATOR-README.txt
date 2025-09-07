CLEAR ROUND TRAVEL — OPERATOR README (v1.2)

SCOPE (FACTS ONLY)
This repository stores small factual cards for events (hubs/legs), venues, and places (hotels, restaurants, airbnbs, rvparks, sites, parks), plus time/location normalizers and labels. **Content cards are separate.** All tasks follow: HINTS → CONFIRM (official) → PREVIEW (full file + path) → COMMIT. No implicit writes.

PROXY AND ENDPOINTS
Base: https://crt-b1434e13de34.herokuapp.com
Health: GET https://crt-b1434e13de34.herokuapp.com/health
Manifest: GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
Generated directories: GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json
Rules you must read before tasks:
- Ingestion rules: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
- Event rules (rich): https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
- Event rules (core): https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.core.json
- Venue rules: https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
- Place rules: https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
- Cards core: https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
- Labels rules: https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json

WRITE API
Commit: POST https://crt-b1434e13de34.herokuapp.com/items/commit
Body: { path, json, message }
Allowed types: .json .txt .md .html .js
Allowed top-level dirs: governed by proxy ALLOW_DIRS → inspect at /items/_manifest.json
Use full paths such as **items/events/esp-november.json** (events) or **items/index/venues/wellington-international-venue.json** (venues).

SESSION START LINE (NEW CHAT)
SESSION-START v14: proxy=https://crt-b1434e13de34.herokuapp.com manifest=https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json mode=task-only overrides: tz=America/New_York filename_equals_uid=false leg_label=Leg SHOW_FULL_URLS=1 HEALTH_MODE=soft

DRIFT AND RESET
If any startup GET fails, STOP and report the full URL + status.
To realign mid-session use RESET, then version vX, reload manifest, rerun startup checklist.

GLOBAL POLICY
facts_only=true  timezone=America/New_York  date_format=YYYY-MM-DD  bool_encoding=yn
uid_regex=^[a-z0-9]+(?:-[a-z0-9]+)*$  ignore_prefixes=dnu_,ignore_
official_link_must_be_https=true  relations_must_resolve=true (venue gate)  labels are predefined only

CARD CORE (ALL FAMILIES)
- Primary id: _uid (and family-specific UID).
- Display name, created_date, last_updated (ET ISO).
- Relations: *_uid (single), *_uids (arrays). Always include **source_uids** (domain slugs) and any applicable **label_uids**.

ENTITIES AND NAMING
- **Events**: UID is slug of the sanitized official name (strip venue/organizer/sponsors/ratings/years/common terms). **Filename = {organizer_uid}-{event_uid}.json** under **items/events/**.
- Series mode: y|n|auto. Legs must be inside the hub window and non-overlapping. Internal leg label “Leg N”; public display avoids “Leg” unless the source uses it.
- **Venues**: UID ends **-venue**; filename equals UID under **items/index/venues/**.
- **Places**: families: stay/dine/sites/parks; filename equals UID under **items/index/{family}/**.

NORMALIZERS (REQUIRED WHEN REFERENCED)
Time: items/index/days, months, seasons, years, weeks
Location: items/index/countries, states, cities
Other: items/index/weather, airports, labels
Missing a required normalizer → needs_normalizer.

TASKS ENABLED
- add_event — hints: link, name, start, end (opt), is_series, is_finals (opt), venue_uid (-venue), organizer_uid. Confirm official; PREVIEW; COMMIT.
- add_venue — hints: link, name, city_uid, state_uid, country_uid (opt aka). Confirm; derive; PREVIEW; COMMIT.
- add_place — hints per place-rules; PREVIEW; COMMIT.
- curate_places — no writes; emits preview table/CSV under agents/curations/.
- index_cards — build read-only indices under items/index/.
- refresh_derived — recompute derived safely; PREVIEW delta; COMMIT write.

HANDSHAKE (ALWAYS)
1) Operator posts Task: … with inputs (hints).
2) Assistant returns PREVIEW (full target path + file bodies + load_ledger).
3) Operator replies COMMIT or EDIT or CANCEL.
4) Assistant returns the exact POST body for /items/commit. **No implicit writes.**

DIRECTORY & FILENAME SUMMARY
- Events: **items/events/{organizer_uid}-{event_uid}.json**
- Venues: **items/index/venues/{venue_uid}.json**
- Places: **items/index/{family}/{place_uid}.json** (families per place-rules)
- Labels: **items/index/labels/{label_uid}.json** (+ compiled **items/index/labels/_index.json**)
- Sources: **items/sources/{source_uid}.json** (domain slug)
- Indices: **items/index/by_time.json**, **by_location.json**, **by_relation.json**, **by_label.json**

AIRTABLE (OPTIONAL STAGING)
Airtable may collect hints. It is never authoritative. Commits happen via the commit endpoint after PREVIEW.

END
