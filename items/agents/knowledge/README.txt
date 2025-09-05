CRT AGENTS — KNOWLEDGE README (Session Boot & Rails) — v1.2

PURPOSE
This file is the fast, factual “session boot” and guardrails reference. It ensures any new session loads the same rules, uses the proxy, and never guesses. It does not repeat the full Operator README.

CANONICAL PATHS (proxy-first, always use full URLs)
- Base:            https://crt-b1434e13de34.herokuapp.com
- Health:          GET /health
- Manifest:        GET /items/agents/manifest.json
- Generated dirs:  GET /items/_manifest.json
- Rules:
  • Ingestion:     GET /items/agents/ingestion-rules.txt
  • Events:        GET /items/agents/event-rules.json
  • Venues:        GET /items/agents/venue-rules.json
  • Places:        GET /items/agents/place-rules.json
  • Cards core:    GET /items/agents/cards-core.txt
  • Labels rules:  GET /items/agents/labels-rules.json

WRITES (operator-triggered only)
- Commit endpoint: POST /items/commit  (body: { path, json, message })
- Allowed file types: .json .txt .md .html .js
- Allowed dirs: governed by proxy ALLOW_DIRS (inspect via /items/_manifest.json)
- Proxy busts its cache for the path after a successful commit.

SESSION START (paste this single line at the top of any new session)
SESSION-START vX: proxy=https://crt-b1434e13de34.herokuapp.com manifest=/items/agents/manifest.json mode=task-only overrides: filename_equals_uid=false leg_label=Leg tz=America/New_York

WHAT MUST LOAD (startup checklist; STOP on any failure)
- GET /health → 200
- GET /items/agents/manifest.json → 200
- GET /items/agents/ingestion-rules.txt → 200
- GET /items/agents/event-rules.json → 200
- GET /items/agents/venue-rules.json → 200
- GET /items/agents/place-rules.json → 200
- GET /items/agents/cards-core.txt → 200
- GET /items/agents/labels-rules.json → 200
- GET /items/_manifest.json → 200
If any call fails: halt immediately and report the exact URL + HTTP status.

MID-SESSION RESET (use when drift is suspected)
RESET → version vX; use proxy; reload manifest
(Then rerun the full startup checklist above.)

GLOBAL POLICY (do not restate in tasks)
- facts_only=true
- timezone=America/New_York
- date_format=YYYY-MM-DD
- bool_encoding=yn
- uid_regex=^[a-z0-9]+(?:-[a-z0-9]+)*$
- filename_equals_uid=false (events only; see event rules)
- official_link_must_be_https=true
- relations_must_resolve=true
- labels are predefined only (items/index/labels/ + _index.json)

VENUE GATE (applies wherever a venue bind is needed)
- Must resolve venue by UID or operator-confirmed hint.
- Never guess. Flow = confirm / input / exit.
- venue_uid must end with “-venue”.

EVENT NAMING & SERIES GUARDS (summary; see event-rules for details)
- Strip venue/organizer/sponsors/ratings/years/common terms from the official title to derive event_uid.
- Filename (events only): {organizer_uid}-{event_uid}.json
- is_series ∈ {y|n|auto}; legs must sit fully inside hub window and must not overlap.
- Internal leg label is “Leg N”; public display MUST NOT include “Leg” unless the source uses it.

TASK TRIGGERS (aliases)
- add-event      = add-event | add_event
- add-venue      = add-venue | add_venue
- add-place      = add-location | add_location | add-place | add_place
- refresh-derived= refresh-derived | refresh_derived
- index-cards    = index-cards | index_cards
- curate-places  = curate-places | curate_places

TASK HANDSHAKE (always the same)
1) Operator posts one Task: … line with inputs (hints).
2) Assistant returns PREVIEW blocks: full target path + full file content (no diffs).
3) Operator replies COMMIT (or EDIT/CANCEL).
4) Assistant returns exact POST body for /items/commit. No implicit writes.

LABELS (global tags)
- Store one file per label under items/index/labels/{label_uid}.json
- Validate any include/exclude/derived tags against items/index/labels/_index.json
- Unknown labels: error on include/exclude; drop on derived.

DIRECTORIES SUMMARY (read-only guidance; confirm via /items/_manifest.json)
- Events:   items/index/events/{organizer_uid}-{event_uid}.json
- Venues:   items/index/venues/{venue_uid}.json (must end -venue)
- Places:   items/index/{stay|dine|…}/{place_uid}.json (place-rules)
- Labels:   items/index/labels/{label_uid}.json + _index.json
- Indices:  items/index/{by_time|by_location|by_relation|by_label}.json
- Sources:  items/index/sources/{source_uid}.json (domain-slug)

AIRTABLE (optional)
- Airtable is for collecting hints/exports only. System of record is the repo via /items/commit after PREVIEW.

SEE ALSO
- Operator README: /items/agents/README.txt (system overview, deeper rationale)
- This file is for session boot and rails only.

END
