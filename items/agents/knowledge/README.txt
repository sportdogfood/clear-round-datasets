CRT AGENTS — KNOWLEDGE README (Session Boot & Rails) — v1.5

PURPOSE
This file is the fast, factual session boot and guardrails reference so every new session behaves the same. It complements the operator guides.

CANONICAL PROXY (ALWAYS USE FULL URLS)
Base:            https://crt-b1434e13de34.herokuapp.com
Health:          GET https://crt-b1434e13de34.herokuapp.com/health
Manifest:        GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
Generated dirs:  GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json

RULE FILES (MUST LOAD BEFORE TASKS)
Ingestion rules: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
Event rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
Venue rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
Place rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
Cards core:      https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
Labels rules:    https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json

WRITES (OPERATOR-TRIGGERED ONLY)
Commit endpoint: POST https://crt-b1434e13de34.herokuapp.com/items/commit
Body: { path, json, message }
Allowed file types: .json .txt .md .html .js
Allowed dirs: governed by proxy ALLOW_DIRS (inspect via https://crt-b1434e13de34.herokuapp.com/items/_manifest.json)
Proxy invalidates its cache for the written path on success.

SESSION START (PASTE THIS ONE LINE AT THE TOP OF ANY NEW SESSION)
SESSION-START vX: proxy=https://crt-b1434e13de34.herokuapp.com manifest=https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json mode=task-only overrides: filename_equals_uid=false leg_label=Leg tz=America/New_York

STARTUP CHECKLIST (STOP ON ANY FAILURE AND REPORT URL + STATUS)
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
uid_regex=^[a-z0-9]+(?:-[a-z0-9]+)*$
ignore_prefixes = dnu_ and ignore_
official_link_must_be_https=true
relations_must_resolve=true (venue gate)
labels are predefined only under items/index/labels with a compiled _index.json

VENUE GATE (APPLIES WHENEVER A VENUE BIND IS NEEDED)
Provide venue_uid or venue_hint and resolve deterministically. Never guess. Flow: confirm → input → exit. venue_uid must end with -venue.

EVENT NAMING & SERIES GUARDS (SUMMARY; SEE EVENT-RULES)
Derive event_uid by stripping venue/organizer/sponsors/ratings/years/common terms (horse show(s), circuit, classic, series) from the official title.
Events use filename template: {organizer_uid}-{event_uid}.json (events only; filename_equals_uid=false).
Series: is_series ∈ {y|n|auto}. Legs must sit fully inside the hub window and must not overlap. Internal leg label = "Leg N"; public display must not include "Leg" unless the source does.

LABELS (GLOBAL TAGS)
One file per label: items/index/labels/{label_uid}.json
Index for validation: https://crt-b1434e13de34.herokuapp.com/items/index/labels/_index.json
Unknown labels → error (include/exclude). Unknown derived → drop.

TASK TRIGGERS (ALIASES)
add_event        = add-event | add_event
add_venue        = add-venue | add_venue
add_place        = add-place | add_place | add-location | add_location
refresh_derived  = refresh-derived | refresh_derived
index_cards      = index-cards | index_cards
curate_places    = curate-places | curate_places

TASK HANDSHAKE (ALWAYS)
1) Operator posts one Task: … line with inputs (hints only).
2) Assistant returns PREVIEW blocks: full target path + complete file body (no diffs).
3) Operator replies COMMIT (or EDIT/CANCEL).
4) Assistant returns the exact POST body for /items/commit. No implicit writes.

DIRECTORY SHAPES (CONFIRM VIA https://crt-b1434e13de34.herokuapp.com/items/_manifest.json)
Events:  items/index/events/{organizer_uid}-{event_uid}.json
Venues:  items/index/venues/{venue_uid}.json (UID must end -venue)
Places:  items/index/{stay|dine|…}/{place_uid}.json (per place-rules)
Labels:  items/index/labels/{label_uid}.json + items/index/labels/_index.json
Indices: items/index/{by_time.json|by_location.json|by_relation.json|by_label.json}
Sources: items/index/sources/{source_uid}.json (domain-slug)

AIRTABLE (OPTIONAL)
Airtable is for collecting hints/exports only. The repo is the source of truth via the commit endpoint after PREVIEW.

SEE ALSO
Operator README: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/OPERATOR-README.txt
Task Runner README: https://crt-b1434e13de34.herokuapp.com/items/agents/README.txt

END
