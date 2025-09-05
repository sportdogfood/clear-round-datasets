CRT TASK RUNNER — README (v3)

RESET / SESSION START
- Always run a session start line:
  SESSION-START vX: proxy=https://crt-b1434e13de34.herokuapp.com manifest=/items/agents/manifest.json overrides: tz=America/New_York mode=task-only
- Startup checklist (stop on any failure; report exact URL + status):
  GET /health
  GET /items/agents/manifest.json
  GET /items/agents/ingestion-rules.txt
  GET /items/agents/event-rules.json
  GET /items/agents/venue-rules.json
  GET /items/agents/place-rules.json
  GET /items/_manifest.json
- Fetch order: proxy first, then git (as defined in manifest). Facts-only; no tone content.

FILE / UID POLICY (applies to all families)
- snake_case keys; bools encoded y|n; dates YYYY-MM-DD; ET timezone.
- Filenames equal UIDs; flat layout under items/index/{family}/.
- Events: legs are separate files with UIDs hub_uid-N. Venue UIDs must end with -venue.
- Source UIDs: domain slugs (lowercase; dots→hyphens).

CONTRACTS (read these before running tasks)
- Events:  items/agents/knowledge/events-contract.txt
- Venues:  items/agents/knowledge/venues-contract.txt
- Places:  items/agents/knowledge/places-contract.txt

TASKS (enabled)
1) add_event (aliases: add-event, add_event)
   Inputs (hints): link= name= start= organizer_uid= venue_uid=|venue_hint= [end=] [is_series=y|n|auto] [series_label=] [total_legs_hint=] [public_leg_label=] [event_description=] [is_finals=y|n]
   Flow: confirm name/link/dates → build hub/legs as needed → PREVIEW (full files + paths) → COMMIT/EDIT/CANCEL.

2) add_venue (aliases: add-venue, add_venue)
   Inputs (hints): link= name= city_uid= state_uid= country_uid= [aka=]
   Flow: confirm official name/link → derive uid/keywords/sources/geo (from pin if present) → PREVIEW → COMMIT.

3) add_place (aliases: add-place, add_place, add-location, add_location)
   Inputs (hints): place_type=hotel|restaurant|airbnb|rvpark|site|park link= name= city_uid= state_uid= country_uid= [aka=]
   Flow: confirm official name/link → derive uid/keywords/sources/geo (from pin if present) → PREVIEW → COMMIT.

4) index_cards (aliases: index-cards, build-indices, reindex)
   Inputs: [scope=all|events|venues|places] [uids=a|b] [dry_run=y|n]
   Emits (read-only artifacts):
     items/index/by_time.json
     items/index/by_location.json
     items/index/by_relation.json
     items/index/by_label.json

5) reminders (aliases: reminders, upcoming, query-upcoming)
   Inputs: [window=7|30|N] [start_date=YYYY-MM-DD] [venue_uid=] [organizer_uid=] [city_uid=] [state_uid=] [country_uid=] [label_uid=] [limit=]
   Output: read-only list of upcoming events in window. Uses indices when present; falls back to scanning events.

6) curate_places (aliases: curate-places, curate_places, curate-hotels, curate_restaurants, curate_airbnbs, curate_rvparks, curate_sites, curate_parks)
   Inputs: place_type=… [link=] [name=] city_uid= state_uid= country_uid= [near_venue_uid=] [radius_miles=] [price_band=] [min_review_score=] [max_results=] [save=y|n] [filename_hint=]
   Output: table in PREVIEW; optional CSV-as-text under items/agents/curations/{place_type}/…  (no card writes).

GUARDS & DRIFT PROTECTION
- Stop on failed GETs; report exact URL + status.
- Use proxy base in ALL reads/writes. Never hardcode GitHub URLs.
- No implicit writes. Only COMMIT writes and invalidates cache.
- Relations must resolve (venue_uid must end -venue; normalizers must exist). No ad hoc values.

WRITE API (operator runs POSTs; the assistant only returns PREVIEW)
- POST /items/commit  with body: { path, json, message }
  • path: e.g., items/index/events/desert-circuit.json
  • json: for .json files, pass an object; for text files (.txt/.md/.js/.html) pass a string body (UTF-8, LF).

SESSION MAINTENANCE
- To realign a drifting session:  RESET → version vX; use proxy; reload manifest. Rerun startup checklist.

NOTES
- All outputs are facts-only. Content/prose lives in separate content cards.
- For any ambiguity in venue/place resolution, set git_status=needs_review and include facts-only notes in PREVIEW diagnostics.
