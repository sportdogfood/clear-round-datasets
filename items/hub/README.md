# HUB README


## Purpose
A **Hub** is the anchor record that normalizes time and location for a show-week. Every lane reads from the Hub to output venue-scoped (**dine/stay**) and locale-scoped (**locale**) artifacts, plus routes, weather, events, and finals groupings.


## Required identifiers
- `hub_uid` (primary)
- `venue_uid` (stable, internal)
- `venue.system_uid` (for external event API lookups)
- `locale_uid` (city/region profile)
- `event_uid` (optional, if a specific event week)
- `organizer_uid` (optional)


## Location & time fields
- `center.lat`, `center.lng` (venue coords)
- `timezone` (IANA string)
- `walkable_m`, `short_drive_m` (distance buckets)
- `bbox` (optional precomputed)


## Provider crosswalk (optional)
- `place_id.google`, `place_id.yelp`, `place_id.osm`


## Lane outputs (by directory)
- `items/dine/{hub_uid}/` → `curated.json`, `review.json`, `essentials.json`, `section.md`, `seo.json`, `blocks.json`
- `items/stay/{hub_uid}/` → `curated.json`, `review.json`, `essentials.json`, `section.md`, `seo.json`, `blocks.json`
- `items/locale/{locale_uid}/` → `locale.json`, `locale_review_queue.json`, `essentials.json`, `section.md`, `seo.json`, `blocks.json`
- `items/routes/{hub_uid}/` → `route.json`
- `items/weather/{hub_uid}/` → `weather.json`
- `items/hub/{hub_uid}/` → `events.json`
- `items/finals/{finals_uid}/` → `finals.json`, `section.md`, `seo.json`


## Batch and Preview
- `…+BATCH` runs over lists of UIDs; `…+BATCH+PREVIEW` disables writes for review before committing.


## Content guidelines (CREATE lanes)
- **Persona:** Clear Round Travel owner; upbeat, insider, precise hunter/jumper terms; practical travel lingo.
- **Structure:** scene-setter; getting there; where to stay/eat; on-grounds logistics; what to watch; local eats/areas; CTA.
- **Outputs:** `section.md` (owner voice), `seo.json` (slug/title/meta), `blocks.json` (structured lists for UI).


## Idempotency & Safety
- All lanes are idempotent; commits skipped if no content hash changes.
- Boots reference a single shared **LOAD+KIT+TEST** file before fetching/writing.
