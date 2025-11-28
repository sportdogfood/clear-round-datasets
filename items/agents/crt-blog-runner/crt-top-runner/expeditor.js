// File: expeditor.js (spec)
// Version: v0.2 - 2025-11-28
// Timestamp: 2025-11-28T00:00:00

Role: TOP-BLOCK EXPEDITOR for CRT crt-top-runner

Purpose
- For a single creation_id:
  1) Read one CompetitionPayload row from Rows.
  2) Build three small research inputs:
     - event-research-input.json
     - venue-research-input.json
     - city-research-input.json
  3) Optionally stash the full CompetitionPayload for the runner:
     - competition_payload.json
  4) Write these JSON files into Items under:
     - items/agents/crt-blog-runner/crt-top-runner/
  5) Trigger the crt-top-runner once for that creation_id.

--------------------------------------------------
1. Inputs (Rows side)
--------------------------------------------------

Use the existing Rows endpoint (Reader API) you already defined in OpenAPI:

- getCompetitionPayloadRows
  - Returns items: [ [creation_id, payload_json_string], ... ]

Expeditor behavior:

1) Accept a single creation_id as input (e.g. CLI arg, query param, or task payload).
2) Call getCompetitionPayloadRows once.
3) Find the row where items[i][0] === creation_id.
4) Parse items[i][1] (payload_json_string) into a CompetitionPayload object.

If no matching row:
- Log or return a clear error: "No CompetitionPayload found for <creation_id>."
- Do NOT write any Items files or trigger the runner.

--------------------------------------------------
2. CompetitionPayload → research inputs
--------------------------------------------------

Assume a CompetitionPayload with at least the fields from your example:
- Top level: creation_id, span_start_date, span_end_date, span_season, span_season_city_slug, span_rating,
  venue_acronym, venue_name, venue_official_url, place_id, maps, farm_id, name_short, lat, lng, city,
  state, city_slug, zone, collection_primary, etc.

2.1 event-research-input.json
Path:
- items/agents/crt-blog-runner/crt-top-runner/event-research-input.json

Shape (minimum):

{
  "creation_id": "<CompetitionPayload.creation_id>",
  "event_name": "<CompetitionPayload.collection_primary.zoom_leg_name>",
  "event_leg_key": "<CompetitionPayload.collection_primary.zoom_leg_key>",
  "series_title": "<CompetitionPayload.collection_primary.collection_title>",
  "series_base_key": "<CompetitionPayload.collection_primary.base_key>",
  "event_date_range_human": "<derived human range for zoom_start_date–zoom_end_date>",
  "span_start_date": "<CompetitionPayload.span_start_date>",
  "span_end_date": "<CompetitionPayload.span_end_date>",
  "span_season": "<CompetitionPayload.span_season>",
  "span_season_city_slug": "<CompetitionPayload.span_season_city_slug>",
  "span_rating": "<CompetitionPayload.span_rating>",
  "zoom_start_date": "<CompetitionPayload.collection_primary.zoom_start_date>",
  "zoom_end_date": "<CompetitionPayload.collection_primary.zoom_end_date>",
  "zoom_season": "<CompetitionPayload.collection_primary.zoom_season>",
  "zoom_season_city_slug": "<CompetitionPayload.collection_primary.zoom_season_city_slug>",
  "zoom_rating": "<CompetitionPayload.collection_primary.zoom_rating>",
  "venue_name": "<CompetitionPayload.venue_name>",
  "venue_acronym": "<CompetitionPayload.venue_acronym>",
  "venue_official_url": "<CompetitionPayload.venue_official_url>",
  "city": "<CompetitionPayload.city>",
  "state": "<CompetitionPayload.state>",
  "zone": "<CompetitionPayload.zone>"
}

Notes:
- event_date_range_human: simple “March 25–29, 2026” style string derived from zoom_start_date / zoom_end_date.
- No prose, no inferred prestige; just structured facts and stringified dates.

2.2 venue-research-input.json
Path:
- items/agents/crt-blog-runner/crt-top-runner/venue-research-input.json

Shape (minimum):

{
  "creation_id": "<CompetitionPayload.creation_id>",
  "venue_name": "<CompetitionPayload.venue_name>",
  "venue_acronym": "<CompetitionPayload.venue_acronym>",
  "venue_official_url": "<CompetitionPayload.venue_official_url>",
  "place_id": "<CompetitionPayload.place_id>",
  "maps": "<CompetitionPayload.maps>",
  "name_short": "<CompetitionPayload.name_short>",
  "lat": "<CompetitionPayload.lat>",
  "lng": "<CompetitionPayload.lng>",
  "city": "<CompetitionPayload.city>",
  "state": "<CompetitionPayload.state>",
  "city_slug": "<CompetitionPayload.city_slug>",
  "zone": "<CompetitionPayload.zone>",
  "span_season": "<CompetitionPayload.span_season>",
  "span_start_date": "<CompetitionPayload.span_start_date>",
  "span_end_date": "<CompetitionPayload.span_end_date>"
}

Notes:
- This is the only place the venue researcher needs to know about season and span dates (for “spring feel” at the venue).
- No event-class lists, no business names.

2.3 city-research-input.json
Path:
- items/agents/crt-blog-runner/crt-top-runner/city-research-input.json

Shape (minimum):

{
  "creation_id": "<CompetitionPayload.creation_id>",
  "city": "<CompetitionPayload.city in Title Case>",
  "state": "<CompetitionPayload.state>",
  "city_slug": "<CompetitionPayload.city_slug>",
  "zone": "<CompetitionPayload.zone>",
  "lat": "<CompetitionPayload.lat>",
  "lng": "<CompetitionPayload.lng>",
  "radius_miles": 20,
  "span_season": "<CompetitionPayload.span_season>",
  "season_label": "<derived human label, e.g. 'spring in Ocala'>",
  "span_start_date": "<CompetitionPayload.span_start_date>",
  "span_end_date": "<CompetitionPayload.span_end_date>"
}

Notes:
- radius_miles is fixed at 20 (tight radius around the venue lat/lng).
- season_label can be derived from span_season + city (“spring in Ocala”).

2.4 Optional: competition_payload.json
Path:
- items/agents/crt-blog-runner/crt-top-runner/competition_payload.json

Contents:
- The full CompetitionPayload object as-is from Rows, pretty-printed.

--------------------------------------------------
3. Writing to Items
--------------------------------------------------

For each of the JSON objects above:

- Serialize with 2-space indentation, ASCII only.
- Write via the Items write lane (whichever mechanism you already use for items/agents/*).
- Overwrite existing files for the same creation_id / runner (this is a prep layer; idempotent for a given run).

Ensure the final Items layout for this runner looks like:

- items/agents/crt-blog-runner/crt-top-runner/instructions.txt            (manual, not written by expeditor)
- items/agents/crt-blog-runner/crt-top-runner/instructions-mini.txt       (manual)
- items/agents/crt-blog-runner/crt-top-runner/research-city-prompt.txt    (manual)
- items/agents/crt-blog-runner/crt-top-runner/research-venue-prompt.txt   (manual)
- items/agents/crt-blog-runner/crt-top-runner/research-event-prompt.txt   (manual)
- items/agents/crt-blog-runner/crt-top-runner/prompt-topblock-writer.txt  (manual)
- items/agents/crt-blog-runner/crt-top-runner/prompt-topblock-rewriter.txt(manual)
- items/agents/crt-blog-runner/crt-top-runner/competition_payload.json    (written by expeditor)
- items/agents/crt-blog-runner/crt-top-runner/city-research-input.json    (written by expeditor)
- items/agents/crt-blog-runner/crt-top-runner/venue-research-input.json   (written by expeditor)
- items/agents/crt-blog-runner/crt-top-runner/event-research-input.json   (written by expeditor)

--------------------------------------------------
4. Triggering the runner
--------------------------------------------------

After successfully writing all three *-research-input.json files (and competition_payload.json):

- Invoke the runner once for this creation_id, using your standardized trigger contract, for example:

  - Send a message or task payload that includes:
    - runner_id: "crt-top-runner"
    - creation_id: "<creation_id>"
    - mode: "topblock"

- The runner, following instructions.txt and instructions-mini.txt:
  - Loads competition_payload.json + the three *-research-input.json files from:
    - items/agents/crt-blog-runner/crt-top-runner/
  - Runs the three research prompts.
  - Builds topblock_research_clean.json (internally) under the same agent folder.
  - Runs the top-block writer and rewriter.
  - Commits the final top-block JSON to Docs via openapi_git.yaml at:

    - docs/runner/topblock_<creation_id>.json

If expeditor fails at any step (no row, parse error, write failure):
- Do NOT trigger the runner.
- Return/log a clear error that includes creation_id and failing stage.
