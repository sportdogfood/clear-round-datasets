CRT TASK RUNNER — README (v3.1)

RESET AND SESSION START
Always run a session start line:
SESSION-START vX: proxy=https://crt-b1434e13de34.herokuapp.com manifest= https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json overrides: tz=America/New_York mode=task-only

Startup checklist. Stop on any failure and report the exact URL and status.
GET https://crt-b1434e13de34.herokuapp.com/health
GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json

Fetch order is proxy first then git as defined in the manifest. Facts only. No tone content.

FILE AND UID POLICY APPLIES TO ALL FAMILIES
snake_case keys. Bools encoded y or n. Dates use YYYY-MM-DD. Timezone is America New York.
Filenames equal UIDs and layout is flat under items slash index slash family.
Events store legs as separate files with UIDs hub_uid dash N. Venue UIDs must end with -venue.
Source UIDs are domain slugs lowercase with dots to hyphens.

CONTRACTS. READ BEFORE RUNNING TASKS
Events: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/events-contract.txt
Venues: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/venues-contract.txt
Places: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/places-contract.txt

TASKS ENABLED
1) add_event (aliases add-event add_event)
 Inputs hints: link= name= start= organizer_uid= venue_uid= or venue_hint= and optional end= is_series=y or n or auto series_label= total_legs_hint= public_leg_label= event_description= is_finals=y or n
 Flow: confirm name link and dates then build hub and legs as needed then PREVIEW with full files and paths then COMMIT or EDIT or CANCEL.

2) add_venue (aliases add-venue add_venue)
 Inputs hints: link= name= city_uid= state_uid= country_uid= optional aka=
 Flow: confirm official name and link then derive uid keywords and geo from pin if present then PREVIEW then COMMIT.

3) add_place (aliases add-place add_place add-location add_location)
 Inputs hints: place_type=hotel or restaurant or airbnb or rvpark or site or park link= name= city_uid= state_uid= country_uid= optional aka=
 Flow: confirm official name and link then derive uid keywords and geo from pin if present then PREVIEW then COMMIT.

4) index_cards (aliases index-cards build-indices reindex)
 Inputs: optional scope=all or events or venues or places optional uids=a pipe b optional dry_run=y or n
 Emits read only artifacts:
 items/index/by_time.json
 items/index/by_location.json
 items/index/by_relation.json
 items/index/by_label.json

5) reminders (aliases reminders upcoming query-upcoming)
 Inputs: optional window=7 or 30 or N optional start_date=YYYY-MM-DD optional venue_uid= organizer_uid= city_uid= state_uid= country_uid= label_uid= limit=
 Output: read only list of upcoming events in window. Uses indices when present and falls back to scanning events.

6) curate_places (aliases curate-places curate_places curate-hotels curate_restaurants curate_airbnbs curate_rvparks curate_sites curate_parks)
 Inputs: place_type=… optional link= optional name= city_uid= state_uid= country_uid= optional near_venue_uid= optional radius_miles= optional price_band= optional min_review_score= optional max_results= optional save=y or n optional filename_hint=
 Output: table in PREVIEW and optional CSV as text under items slash agents slash curations slash place_type without card writes.

GUARDS AND DRIFT PROTECTION
Stop on failed GETs and report the exact URL and status.
Use the proxy base in all reads and writes. Never hardcode raw GitHub URLs.
No implicit writes. Only COMMIT writes and invalidates cache.
Relations must resolve. venue_uid must end with -venue. Normalizers must exist. No ad hoc values.

WRITE API. OPERATOR RUNS POSTS. THE ASSISTANT ONLY RETURNS PREVIEW
POST https://crt-b1434e13de34.herokuapp.com/items/commit with body { path, json, message }
path example items/index/events/desert-circuit.json
json for .json files is an object. For text files use a string body with UTF 8 and LF.

SESSION MAINTENANCE
To realign a drifting session use RESET then version vX then use proxy then reload manifest then rerun the startup checklist.
