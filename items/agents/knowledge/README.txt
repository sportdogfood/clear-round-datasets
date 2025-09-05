CRT AGENTS — KNOWLEDGE README (Session Boot & Rails) — v1.7

CANONICAL PROXY (FULL URLS ONLY)
Base:            https://crt-b1434e13de34.herokuapp.com
Health (diag):   https://crt-b1434e13de34.herokuapp.com/health
Manifest:        https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
Generated dirs:  https://crt-b1434e13de34.herokuapp.com/items/_manifest.json

RULE FILES (MUST LOAD BEFORE TASKS)
Ingestion rules: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
Event rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
Venue rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
Place rules:     https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
Cards core:      https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
Labels rules:    https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json

WRITES (OPERATOR ONLY)
POST https://crt-b1434e13de34.herokuapp.com/items/commit  body: { path, json, message }
Allowed file types: .json .txt .md .html .js
Allowed dirs: via proxy ALLOW_DIRS; inspect at /items/_manifest.json

SESSION START (PASTE ONE LINE)
SESSION-START v13: proxy=https://crt-b1434e13de34.herokuapp.com manifest=https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json mode=task-only overrides: tz=America/New_York filename_equals_uid=false leg_label=Leg SHOW_FULL_URLS=1 HEALTH_MODE=soft NO_THOUGHTS=1 OUTPUT=ops

STARTUP CHECKLIST (STOP ON ANY REQUIRED FAILURE; PRINT FULL URL + STATUS)
GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json
Diagnostic (non-blocking): GET https://crt-b1434e13de34.herokuapp.com/health

OUTPUT DISCIPLINE
NO_THOUGHTS=1 → no internal reasoning printed.
OUTPUT=ops    → only session ACK JSON, flat status lines, or PREVIEW/COMMIT payloads.

TASK TRIGGERS (ALIASES)
add_event | add-event | add_event
add_venue | add-venue | add_venue
add_place | add-place | add_place | add-location | add_location
refresh_derived | refresh-derived | refresh_derived
index_cards | index-cards | build-indices | reindex
curate_places | curate-places | curate_places | curate-hotels | curate_restaurants | curate_airbnbs | curate_rvparks | curate_sites | curate_parks

HANDSHAKE (ALWAYS)
1) Operator posts Task: … with inputs (hints).
2) Assistant returns PREVIEW blocks (full files + target path).
3) Operator replies COMMIT/EDIT/CANCEL.
4) Assistant returns exact POST body for /items/commit. No implicit writes.

NOTES
- Places use stay/dine families per dir-map; ignore legacy hotels/restaurants dirs.
- Venue gate: venue_uid must end -venue; resolve via confirm/input/exit; never guess.
END
