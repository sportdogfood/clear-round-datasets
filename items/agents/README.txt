CRT TASK RUNNER — README (v3.2)

RESET / SESSION START
SESSION-START v13: proxy=https://crt-b1434e13de34.herokuapp.com manifest=https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json mode=task-only overrides: tz=America/New_York filename_equals_uid=false leg_label=Leg SHOW_FULL_URLS=1 HEALTH_MODE=soft NO_THOUGHTS=1 OUTPUT=ops

REQUIRED STARTUP CHECKS (STOP ON FAILURE; PRINT FULL URL + STATUS)
GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json
Diagnostic: GET https://crt-b1434e13de34.herokuapp.com/health (non-blocking)

FILE / UID POLICY
- snake_case keys; y|n bools; dates YYYY-MM-DD; ET timezone.
- Events: filename {organizer_uid}-{event_uid}.json (filename_equals_uid=false for events only).
- Venue UIDs must end -venue; filename == UID.
- Places live under stay/dine families; filename == UID.
- Sources = domain slugs.

CONTRACTS (SEE KNOWLEDGE)
- https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/events-contract.txt
- https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/venues-contract.txt
- https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/places-contract.txt

TASKS (ENABLED)
1) add_event → Hints: link, name, start, organizer_uid, venue_uid|venue_hint [end] [is_series] [series_label] [total_legs_hint] [public_leg_label] [event_description] [is_finals]
2) add_venue → Hints: link, name, city_uid, state_uid, country_uid [aka]
3) add_place → Hints: place_type, link, name, city_uid, state_uid, country_uid [aka]
4) index_cards → Inputs: [scope=all|events|venues|places] [uids=a|b] [dry_run=y|n]
5) reminders → Inputs: [window=7|30|N] [start_date=...] [venue_uid|organizer_uid|city_uid|state_uid|country_uid|label_uid] [limit]
6) curate_places → Inputs: place_type=… [near_venue_uid] [radius_miles] [price_band] [min_review_score] [include_labels|exclude_labels] [max_results] [save=y|n] [filename_hint]

GUARDS & DRIFT PROTECTION
- Full proxy URLs only; stop on failed GETs; no implicit writes.
- Relations must resolve (venue gate, normalizers present). No ad hoc values.

WRITE API
POST /items/commit  { path, json, message }
- For .json send an object; for .txt/.md/.html/.js send the string body.

SESSION MAINTENANCE
RESET → version vX; use proxy; reload manifest; rerun checklist.
END
