CLEAR ROUND TRAVEL — OPERATOR README (v1.1)

SCOPE (FACTS ONLY)
This repository stores small factual cards for events including legs, venues, places which include hotels restaurants airbnbs rvparks sites and parks, time and location normalizers, and global labels. Content cards are separate. All tasks follow HINTS then CONFIRM from official sources then PREVIEW with full files and paths then COMMIT or EDIT or CANCEL. There are no implicit writes.

PROXY AND ENDPOINTS
Base: https://crt-b1434e13de34.herokuapp.com
Health: GET https://crt-b1434e13de34.herokuapp.com/health
Manifest: GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
Generated directories: GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json
Rules you must read before tasks:
 Ingestion rules: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
 Event rules: https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
 Venue rules: https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
 Place rules: https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
 Cards core: https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
 Labels rules: https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json

WRITE API
Commit endpoint: POST https://crt-b1434e13de34.herokuapp.com/items/commit
Body: { path, json, message }
Allowed types: .json .txt .md .html .js
Allowed top level dirs: governed by proxy ALLOW_DIRS shown in the generated directories endpoint. Use full item paths such as items/index/events/example.json.
The proxy normalizes paths and invalidates its cache on a successful write.

SESSION START LINE FOR ANY NEW SESSION
SESSION-START vX: proxy=https://crt-b1434e13de34.herokuapp.com manifest= https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json mode=task-only overrides: filename_equals_uid=false leg_label=Leg tz=America/New_York

DRIFT AND RESET
If any startup GET fails the assistant must stop and report the full URL and status. To re align mid session use RESET then version vX then use proxy then reload manifest and rerun the startup checklist.

GLOBAL POLICY
facts_only=true
timezone=America/New_York
date_format=YYYY-MM-DD
bool_encoding=yn
uid_regex=^[a-z0-9]+(?:-[a-z0-9]+)$
ignore_prefixes are dnu_ and ignore_
official_link_must_be_https=true
relations_must_resolve=true including the venue gate
labels are predefined only from items/index/labels and validated via items/index/labels/_index.json

CARD CORE APPLIES TO EVERY FAMILY
Primary uid field and display_name
created_date and last_updated in ET ISO
source_uids using domain slugs and label_uids from the predefined catalog
Optional city_uid state_uid country_uid when locational
notes field is facts only

ENTITIES AND NAMING
Events
 UID is slug of the sanitized official name after stripping venue organizer sponsors ratings years and common terms such as horse show horse shows circuit classic series. Filename for events only is organizer_uid dash event_uid dot json meaning filename_equals_uid is false for events only. Series mode is y n or auto. Series legs must be inside the hub window and not overlap. Internal leg label is Leg N and public display should not include Leg unless the source title does. Organizer and venue are distinct and venue_uid must end with -venue. Derived never overwrite inputs and include yyyymm event_duration event_current_status days_until_start days_until_end estimated_next_start month_uids year_uid season_uid and for legs week_uids and day_uids.
Venues
 UID is slugified name with suffix -venue. filename_equals_uid is true. Venue gate is strict with confirm then input then exit.
Places
 Place types are hotel restaurant airbnb rvpark site park. UID is flat slugified name and on collision append a city stem. filename_equals_uid is true. All share place rules and venue remains under venue rules.

LABELS GLOBAL TAGS
One file per label at items/index/labels/label_uid.json and a compiled items/index/labels/_index.json. A label file carries label_uid label_display_name label_family allow_on synonyms is_active created_date last_updated with optional description implies conflicts_with and replacement fields. Tasks validate include and exclude sets against the index and drop any unknown derived labels.

NORMALIZERS REQUIRED WHEN REFERENCED
Time families under items/index/days months seasons years weeks. Location families under items/index/countries states cities. Others include weather airports labels. Missing a required normalizer must halt with needs_normalizer.

TASKS ENABLED
add_event
 Inputs hints include link name start and either venue_uid or venue_hint. Optional end is_series series_label total_legs_hint organizer_uid. Flow is confirm official homepage title dates then build hub and legs and return PREVIEW with full files and paths and await COMMIT or EDIT or CANCEL. Rails include https only official site the event filename template and leg guards.
add_venue
 Inputs hints include link name city_uid state_uid country_uid and optional aka. Confirm official link and name derive uid keywords and geo when present filter label_uids to the predefined catalog and enforce the -venue suffix. Return PREVIEW then COMMIT.
add_place
 Inputs hints include place_type link name city_uid state_uid country_uid with optional primary_venue_uid near_venue_uids aka and keywords. Same confirmation and normalization rails as venue with shared place rules. PREVIEW then COMMIT.
curate_places
 No card writes. Emits a preview table and optional CSV as text under items/agents/curations per rules. Accepts place_type location targeting radius price band review score chain mode include or exclude labels time targeting strict price max results and filename hint.
refresh_derived
 Recompute derived fields for events legs venues and places such as days until statuses yyyymm month_uids year_uid season_uid and week or day uids for legs. Never overwrite input fields. PREVIEW delta then COMMIT write.
index_cards
 Walk cards and emit flat indices by time by location by relation and by label under items/index. Outputs are read only artifacts.

HANDSHAKE ALWAYS
Operator posts one Task line with inputs. Assistant returns PREVIEW blocks with full target path and complete file bodies. Operator replies COMMIT or EDIT or CANCEL. Assistant returns the exact POST body for the commit endpoint. No implicit writes.

DIRECTORY AND FILENAME SUMMARY
Events: items/index/events/organizer_uid dash event_uid dot json
Venues: items/index/venues/venue_uid dot json with -venue suffix
Places: items/index/stay or items/index/dine and similar using place rules
Labels: items/index/labels/label_uid dot json plus items/index/labels/_index.json
Indices: items/index/by_time.json by_location.json by_relation.json by_label.json
Sources: items/index/sources/source_uid dot json using the domain slug policy

AIRTABLE OPTIONAL STAGING
Airtable may collect hints. It is never authoritative. Commits happen via the commit endpoint after PREVIEW.

END
