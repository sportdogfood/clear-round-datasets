File: expeditor.js
Role: TOP-BLOCK EXPEDITOR for CRT wec-ocala-test-runner

Purpose
- For a single creation_id:
  1) Read one CompetitionPayload row from Rows.
  2) Build three small research inputs:
     - research_event_input.json
     - research_venue_input.json
     - research_city_input.json
  3) Optionally stash the full CompetitionPayload for the runner:
     - competition_payload.json
  4) Write these JSON files into Items under agents/wec-ocala-test-runner/.
  5) Trigger the wec-ocala-test-runner once for that creation_id.

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
- Top level: creation_id, span_start_date, span_end_date, span_season, span_season_city_slug, span_rating, venue_acronym, venue_name, venue_official_url, place_id, maps, farm_id, name_short, lat, lng, city, state, city_slug, zone, collection_primary, etc.

2.1 research_event_input.json
Path:
- items/agents/wec-ocala-test-runner/research_event_input.json

Shape (minimum):

{
  "creation_id": "<from CompetitionPayload.creation_id>",
  "event_name": "<collection_primary.zoom_leg_name>",
  "event_leg_key": "<collection_primary.zoom_leg_key>",
  "series_title": "<collection_primary.collection_title>",
  "series_base_key": "<collection_primary.base_key>",
  "event_date_range_human": "<derived human range for zoom_start_date–zoom_end_date>",
  "span_start_date": "<span_start_date>",
  "span_end_date": "<span_end_date>",
  "span_season": "<span_season>",
  "span_season_city_slug": "<span_season_city_slug>",
  "span_rating": "<span_rating>",
  "zoom_start_date": "<collection_primary.zoom_start_date>",
  "zoom_end_date": "<collection_primary.zoom_end_date>",
  "zoom_season": "<collection_primary.zoom_season>",
  "zoom_season_city_slug": "<collection_primary.zoom_season_city_slug>",
  "zoom_rating": "<collection_primary.zoom_rating>",
  "venue_name": "<venue_name>",
  "venue_acronym": "<venue_acronym>",
  "venue_official_url": "<venue_official_url>",
  "city": "<city>",
  "state": "<state>",
  "zone": "<zone>"
}

Notes:
- event_date_range_human: simple “March 25–29, 2026” style string derived from zoom_start_date / zoom_end_date.
- No prose, no inferred prestige; just structured facts and stringified dates.

2.2 research_venue_input.json
Path:
- items/agents/wec-ocala-test-runner/research_venue_input.json

Shape (minimum):

{
  "creation_id": "<creation_id>",
  "venue_name": "<venue_name>",
  "venue_acronym": "<venue_acronym>",
  "venue_official_url": "<venue_official_url>",
  "place_id": "<place_id>",
  "maps": "<maps>",
  "name_short": "<name_short>",
  "lat": "<lat>",
  "lng": "<lng>",
  "city": "<city>",
  "state": "<state>",
  "city_slug": "<city_slug>",
  "zone": "<zone>",
  "span_season": "<span_season>",
  "span_start_date": "<span_start_date>",
  "span_end_date": "<span_end_date>"
}

Notes:
- This is the only place the venue researcher needs to know about season and span dates (for “spring feel” at the venue).
- No event-class lists, no business names.

2.3 research_city_input.json
Path:
- items/agents/wec-ocala-test-runner/research_city_input.json

Shape (minimum):

{
  "creation_id": "<creation_id>",
  "city": "<city in Title Case>",
  "state": "<state>",
  "city_slug": "<city_slug>",
  "zone": "<zone>",
  "lat": "<lat>",
  "lng": "<lng>",
  "radius_miles": 20,
  "span_season": "<span_season>",
  "season_label": "<derived human label, e.g. 'spring in Ocala'>",
  "span_start_date": "<span_start_date>",
  "span_end_date": "<span_end_date>"
}

Notes:
- radius_miles is fixed at 20 (tight radius around the venue lat/lng).
- season_label can be derived from span_season + city (“spring in Ocala”).

2.4 Optional: competition_payload.json
Path:
- items/agents/wec-ocala-test-runner/competition_payload.json

Contents:
- The full CompetitionPayload object as-is from Rows, pretty-printed.

--------------------------------------------------
3. Writing to Items
--------------------------------------------------

For each of the JSON objects above:

- Serialize with 2-space indentation, ASCII only.
- Write via Items write lane (whichever mechanism you already use for agents/*).
- Overwrite existing files for the same creation_id / runner (this is a prep layer; idempotent).

Ensure the final Items layout for this runner looks like:

- agents/wec-ocala-test-runner/instructions.txt              (manual, not written by expeditor)
- agents/wec-ocala-test-runner/prompt-research-city.txt      (manual)
- agents/wec-ocala-test-runner/prompt-research-venue.txt     (manual)
- agents/wec-ocala-test-runner/prompt-research-event.txt     (manual)
- agents/wec-ocala-test-runner/prompt-topblock-writer.txt    (manual)
- agents/wec-ocala-test-runner/prompt-topblock-rewrite.txt   (manual)
- agents/wec-ocala-test-runner/competition_payload.json      (written by expeditor)
- agents/wec-ocala-test-runner/research_city_input.json      (written by expeditor)
- agents/wec-ocala-test-runner/research_venue_input.json     (written by expeditor)
- agents/wec-ocala-test-runner/research_event_input.json     (written by expeditor)

--------------------------------------------------
4. Triggering the runner
--------------------------------------------------

After successfully writing all three research_* inputs (and competition_payload.json):

- Invoke the runner once for this creation_id, using whatever trigger contract you’ve already standardized, e.g.:

  - Send a message or task payload that includes:
    - runner_id: "wec-ocala-test-runner"
    - creation_id: "<creation_id>"
    - mode: "topblock"

- The runner, following its instructions:
  - Loads competition_payload.json + research_*_input.json.
  - Runs the three research prompts.
  - Builds topblock_research_clean (internally).
  - Runs the top-block writer and rewriter.
  - Commits topblock_final.json to docs/runner/test/… via docs_commit_bulk.

If expeditor fails at any step (no row, parse error, write failure):
- Do NOT trigger the runner.
- Return/log a clear error that includes creation_id and failing stage.
