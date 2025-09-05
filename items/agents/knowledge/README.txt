CRT AGENTS — KNOWLEDGE README (Session Boot and Rails) — v1.4

PURPOSE
This file is the fast, factual session boot and guardrails reference so every new session behaves the same. It complements the operator guides.

CANONICAL PROXY (ALWAYS USE FULL URLS)
Base: https://crt-b1434e13de34.herokuapp.com
Health: GET https://crt-b1434e13de34.herokuapp.com/health
Manifest: GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
Generated dirs: GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json

RULE FILES (MUST LOAD BEFORE TASKS)
Ingestion rules: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
Event rules: https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
Venue rules: https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
Place rules: https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
Cards core: https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
Labels rules: https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json

WRITES (OPERATOR-TRIGGERED ONLY)
Commit endpoint: POST https://crt-b1434e13de34.herokuapp.com/items/commit
Body: { path, json, message }
Allowed file types: .json .txt .md .html .js
Allowed dirs: governed by proxy ALLOW_DIRS (inspect via https://crt-b1434e13de34.herokuapp.com/items/_manifest.json)
Proxy invalidates its cache for the written path on success.

SESSION START (PASTE THIS ONE LINE AT THE TOP OF ANY NEW SESSION)
SESSION-START vX: proxy=https://crt-b1434e13de34.herokuapp.com manifest= https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json mode=task-only overrides: filename_equals_uid=false leg_label=Leg tz=America/New_York

STARTUP CHECKLIST (STOP ON ANY FAILURE AND REPORT URL PLUS STATUS)
GET https://crt-b1434e13de34.herokuapp.com/health
GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json

MID-SESSION RESET WHEN DRIFT SUSPECTED
RESET → version vX; use proxy; reload manifest
Then rerun the full startup checklist above.

GLOBAL POLICY (DO NOT RESTATE IN TASKS)
facts_only=true
timezone=America/New_York
date_format=YYYY-MM-DD
bool_encoding=yn
uid_regex=^[a-z0-9]+(?:-[a-z0-9]+)$
ignore_prefixes = dnu_ and ignore_
official_link_must_be_https=true
relations_must_resolve=true including the venue gate
labels are predefined only under items/index/labels with a compiled _index.json

VENUE GATE (APPLIES WHENEVER A VENUE BIND IS NEEDED)
Provide venue_uid or venue_hint and resolve deterministically. Never guess. Flow is confirm then input then exit. venue_uid must end with -venue.

EVENT NAMING AND SERIES GUARDS (SUMMARY, SEE EVENT RULES FOR DETAILS)
Derive event_uid by stripping venue, organizer, sponsors, ratings, years and common terms such as horse show, horse shows, circuit, classic, series from the official title.
Events use filename template organizer_uid dash event_uid dot json. For events only filename_equals_uid=false.
Series setting is one of y n auto. If series then legs sit fully inside the hub window and do not overlap.
Internal leg label is Leg N. Public display must not say Leg unless the source does.

LABELS (GLOBAL TAGS)
Store one file per label at items slash index slash labels slash label_uid dot json.
Use items slash index slash labels slash underscore index dot json for validation and synonyms mapping.
Unknown labels cause error for include or exclude. Unknown derived labels are dropped.

TASK TRIGGERS (ALIASES)
add_event = add-event or add_event
add_venue = add-venue or add_venue
add_place = add-place or add_place or add-location or add_location
refresh_derived = refresh-derived or refresh_derived
index_cards = index-cards or index_cards
curate_places = curate-places or curate_places

TASK HANDSHAKE (ALWAYS)
One task line with inputs as hints only.
Assistant returns PREVIEW blocks with full target path and complete file body without diffs.
Operator replies COMMIT or EDIT or CANCEL.
Assistant returns the exact POST body for the commit endpoint. No implicit writes.

DIRECTORY SHAPES (CONFIRM VIA https://crt-b1434e13de34.herokuapp.com/items/_manifest.json)
Events: items/index/events/organizer_uid dash event_uid dot json
Venues: items/index/venues/venue_uid dot json where uid ends with -venue
Places: items/index/stay or dine or similar slash place_uid dot json according to place rules
Labels: items/index/labels/label_uid dot json plus items/index/labels/_index.json
Indices: items/index/by_time.json and by_location.json and by_relation.json and by_label.json
Sources: items/index/sources/source_uid dot json using domain slugs

AIRTABLE (OPTIONAL)
Airtable is for collecting hints and exports only. The repo is the source of truth via the commit endpoint after PREVIEW.

SEE ALSO
Operator README: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/OPERATOR-README.txt
Task Runner README: https://crt-b1434e13de34.herokuapp.com/items/agents/README.txt

END
