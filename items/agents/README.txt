# README — CRT Tasks & Proxy Usage
# Scope: small, operator-led system for events, places, content, and indices
# Last updated: 2025-09-04 (America/New_York)

Base & Health
-------------
Proxy base (always use full URLs):
- https://crt-b1434e13de34.herokuapp.com

Health check:
- https://crt-b1434e13de34.herokuapp.com/health  → {"ok":true,...}

Directory & Allowlist Visibility
--------------------------------
Generated listing (sanity check; served as text):
- https://crt-b1434e13de34.herokuapp.com/items/_manifest.json

If a GET fails, stop and resolve before proceeding.

Drift Protection (session rails)
--------------------------------
- Facts-only in cards (entities/places/tags/indices). Content tone/POV lives only in content cards.
- Inputs are hints; confirm official link/name/dates via proxyed sources before write.
- Venue gate: confirm / input / exit; never guess. Venue UID must end with "-venue".
- Event model: time-centric hub (+ legs). Legs sit fully inside hub; non-overlapping; label as "Leg N".
- Event naming: stripped `event_uid` (e.g., `spring`, `circuit-leg-1`). Do not include venue, organizer, sponsor, rating, year.
- Event filenames: organizer-fronted, flat `{organizer_uid}-{event_uid}.json` (append `-YEAR` only on collision).
- Labels: `label_uids` are curated only. Derived facets belong in indices, not tags.
- Booleans: `y|n`. Dates: `YYYY-MM-DD` (accept `YYYY-MM` as hint only). TZ: America/New_York.
- Preview → Commit: Assistant returns PREVIEW files; operator must say COMMIT to write. No implicit writes.
- Full proxy URLs only. Hard-stop on the first failed GET and report the exact URL.

Card Families (records)
-----------------------
- Events: `items/events/`
- Venues: `items/venues/`  (UID must end with `-venue`)
- Organizers: `items/organizers/`
- Places: `items/hotels/`, `items/airbnbs/`, `items/rvparks/`, `items/restaurants/`, `items/sites/`, `items/parks/`
- Labels (curated): `items/labels/`
- Sources (domain-first): `items/sources/`
- Content (agnostic): `items/content/`

Indices (derived artifacts; read-only)
--------------------------------------
- `items/index/` (e.g., `events.index.js`, `places.index.js`, `content.index.js`)
  - by_time: byYear, byMonth, bySeason, byWeek, next7d, next30d
  - by_location: byCity, byState, byCountry
  - by_relation: byVenue, byOrganizer
  - by_label: label_uid → [card_uids]

Normalizers (read-only)
-----------------------
- Time: `items/years/`, `items/seasons/`, `items/months/`, `items/weeks/`, `items/days/`
- Location: `items/countries/`, `items/states/`, `items/cities/`

Rules (read before tasks)
-------------------------
- Manifest:        https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
- Ingestion rules: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
- Event rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
- Venue rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json

GET (Reads)
-----------
Pattern:
- https://crt-b1434e13de34.herokuapp.com/items/<dir>/<file>.<ext>

Notes:
- `.json` is served as `text/plain` for reliable rendering; body is unchanged JSON text.
- Use the generated listing to confirm allowlisted dirs before relying on GETs.

PUT (Writes) — via /items/commit
--------------------------------
Endpoint:
- POST https://crt-b1434e13de34.herokuapp.com/items/commit

Request fields:
- `path`   (string)  Target path under `items/` (e.g., `items/events/desert-circuit-leg-1.json`).
- `json`   (object|string) If target is `.json`, send an object (or a JSON string); for text files, send a string body.
- `message`(string)  Commit message.

Behavior:
- Path must pass allowlist and extension checks.
- JSON payloads are pretty-printed on write.
- Non-JSON text normalized to LF with a trailing newline.
- Cache for that path is invalidated on success.

Session Start (no re-education; paste once at top of chat)
----------------------------------------------------------
SESSION-START: proxy=https://crt-b1434e13de34.herokuapp.com manifest=/items/agents/manifest.json overrides: filename_equals_uid=false, leg_label=Leg, tz=America/New_York mode=task-only

Operator Checklist (every new session)
-------------------------------------
1) Health: GET /health — must be 200.
2) Manifest: GET /items/agents/manifest.json — must be readable.
3) Rules: GET event-rules, venue-rules, ingestion-rules — must be readable.
4) If any GET fails, stop and resolve. Do not proceed.
5) Start the task with a “Task:” line (see below). Expect PREVIEW only; then reply COMMIT/EDIT/CANCEL.

Tasks (enabled & planned)
-------------------------
ENABLED
- add-event — Create event record(s). Inputs are hints; confirm official details; hub(+legs) when applicable.

PLANNED
- add-location — Create a place record (one spec covers: venue | hotel | airbnb | rvpark | restaurant | site | park).
- research-locations — Facts-only lookup/normalize within constraints (no write).
- refresh-derived-card-data — Recompute derived fields (facts-only).
- index-cards — Rebuild indices across families (read-only artifacts).
- curate-content — Bind content ↔ entities by *_uid / *_uids.
- render-content — Emit MD for site from curated binds.

Task Inputs (concise)
---------------------
add-event (hints)
- Required: `link`, `name`, `start(YYYY-MM or YYYY-MM-DD)`, `venue_uid` OR `venue_hint`
- Optional: `end`, `is_series (y|n|auto)`, `series_label`, `total_legs_hint`, `organizer_uid`

add-location (hints; when enabled)
- Required: `place_type` ∈ { venue | hotel | airbnb | rvpark | restaurant | site | park }, `official_name`, `official_link`
- Optional: `aka[]`, `keywords[]`, `city_uid`, `state_uid`, `country_uid`, `geo_lat`, `geo_long`, `google_pin`
- Special: if `place_type=venue`, UID must end with `-venue` and venue gate applies.

Derived Fields (examples; never overwrite inputs)
-------------------------------------------------
- Time: `yyyymm`, `season_uid`, `month_uid`, `year_uid`, optional `week_uid/day_uid`; `event_duration`, `event_status`, `days_until_start`, `days_until_end`.
- Location: `city_uid`, `state_uid`, `country_uid`.
- Meta: `created_date`, `last_updated`.
- Series: `is_series (y|n)`, `total_legs`, legs inside hub only.

Preview → Commit Handshake
--------------------------
1) PREVIEW: full files with `path`, `message`, and `content` (and any unresolved relation notes).
2) Operator replies COMMIT to write (or EDIT/CANCEL).
3) On success: cache is invalidated; indices may be rebuilt as needed.

Failure Handling
----------------
- On any failed GET (non-200 or unreadable): stop and report the exact full URL and status; do not proceed.
- Commit failures return a JSON error body from the proxy; correct and retry.

Operator Notes
--------------
- Keep `ALLOW_DIRS` current with your working dirs; confirm via generated listing.
- Keep `organizer_uid` out of `event_uid`. Use organizer-fronted filenames only.
- Use curated `label_uids` sparingly; put computed/derived facets into index files, not tags.
