// File: expeditor.js
// Version: v0.1 - 2025-11-28
// Purpose: TOP-BLOCK EXPEDITOR for CRT crt-top-runner
//
// For a single creation_id, this script:
//  1) Fetches CompetitionPayload from Rows.
//  2) Builds three lane input JSON files:
//       - event-research-input.json
//       - venue-research-input.json
//       - city-research-input.json
//  3) Optionally writes competition_payload.json.
//  4) Writes all of them under:
//       items/agents/crt-blog-runner/crt-top-runner/
//  5) Prints the runner trigger string:
//       start crt-top-runner {creation_id}
//
// It does not talk to Docs; commits are done by your normal git flow.

import fs from "fs/promises";
import path from "path";
import process from "process";

// ---- CONFIG -----------------------------------------------------------------

// Root of the repo on disk (default: current working directory)
const REPO_ROOT = process.env.CRT_REPO_ROOT || process.cwd();

// Items agent folder for this runner
const AGENT_ROOT = path.join(
  REPO_ROOT,
  "items",
  "agents",
  "crt-blog-runner",
  "crt-top-runner"
);

// Rows endpoint that returns CompetitionPayload rows.
// Expected shape (per spec): { items: [ [ creation_id, payload_json_string ], ... ] }
const ROWS_COMPETITION_PAYLOAD_URL =
  process.env.ROWS_COMPETITION_PAYLOAD_URL ||
  "https://your-rows-endpoint.example.com/competition-payload";

// Optional auth header for Rows (e.g. "Bearer xxx")
const ROWS_AUTH_HEADER = process.env.ROWS_AUTH_HEADER || "";

// ---- HELPERS ----------------------------------------------------------------

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJsonFile(relativePath, obj) {
  const fullPath = path.join(AGENT_ROOT, relativePath);
  await ensureDir(path.dirname(fullPath));
  const json = JSON.stringify(obj, null, 2);
  await fs.writeFile(fullPath, json, "utf8");
  return fullPath;
}

/**
 * Fetch CompetitionPayload table from Rows and return the row for creationId.
 * Expected response JSON:
 *   { items: [ [ "creation_id", "{...payload json...}" ], ... ] }
 */
async function fetchCompetitionPayload(creationId) {
  const res = await fetch(ROWS_COMPETITION_PAYLOAD_URL, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(ROWS_AUTH_HEADER ? { Authorization: ROWS_AUTH_HEADER } : {})
    }
  });

  if (!res.ok) {
    throw new Error(
      `rows_fetch: HTTP ${res.status} from Rows endpoint ${ROWS_COMPETITION_PAYLOAD_URL}`
    );
  }

  const data = await res.json();

  if (!data.items || !Array.isArray(data.items)) {
    throw new Error("rows_fetch: Response missing items[]");
  }

  const match = data.items.find(
    (row) => Array.isArray(row) && row[0] === creationId
  );

  if (!match) {
    throw new Error(
      `rows_fetch: No CompetitionPayload found for creation_id=${creationId}`
    );
  }

  const payloadStr = match[1];
  if (typeof payloadStr !== "string") {
    throw new Error("rows_fetch: payload cell is not a stringified JSON");
  }

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch (err) {
    throw new Error(
      `rows_fetch: Failed to parse payload JSON for creation_id=${creationId}: ${err.message}`
    );
  }

  // Basic sanity
  if (!payload.creation_id || payload.creation_id !== creationId) {
    // Do not “fix” it; just warn and proceed.
    console.warn(
      `Warning: payload.creation_id (${payload.creation_id}) does not match requested creation_id (${creationId}). Using payload as-is.`
    );
  }

  return payload;
}

// ---- BUILDERS ---------------------------------------------------------------

function toTitleCaseCity(city) {
  if (!city || typeof city !== "string") return city;
  return city
    .toLowerCase()
    .split(" ")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function deriveSeasonLabel(spanSeason, city) {
  if (!spanSeason || !city) return "could-not-verify";
  return `${spanSeason.toLowerCase()} in ${toTitleCaseCity(city)}`;
}

/**
 * Very simple human date range builder like "March 25–29, 2026".
 * Assumes US-style MM/DD/YYYY in input; if parsing fails, return "could-not-verify".
 */
function buildHumanDateRange(startStr, endStr) {
  try {
    if (!startStr || !endStr) return "could-not-verify";

    const [sm, sd, sy] = startStr.split("/").map(Number);
    const [em, ed, ey] = endStr.split("/").map(Number);

    if (!sm || !sd || !sy || !em || !ed || !ey) {
      return "could-not-verify";
    }

    const months = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];

    if (sy === ey && sm === em) {
      // Same month/year
      return `${months[sm]} ${sd}–${ed}, ${sy}`;
    }

    if (sy === ey) {
      // Same year, different months
      return `${months[sm]} ${sd} – ${months[em]} ${ed}, ${sy}`;
    }

    // Different years; just use full both sides
    return `${months[sm]} ${sd}, ${sy} – ${months[em]} ${ed}, ${ey}`;
  } catch {
    return "could-not-verify";
  }
}

function buildEventInput(payload) {
  const cp = payload || {};
  const primary = cp.collection_primary || {};

  const creation_id = cp.creation_id;
  const event_name = primary.zoom_leg_name || cp.zoom_leg_name || "could-not-verify";
  const event_leg_key = primary.zoom_leg_key || cp.zoom_leg_key || "could-not-verify";
  const series_title = primary.collection_title || "could-not-verify";
  const series_base_key = primary.base_key || "could-not-verify";

  const zoom_start_date =
    primary.zoom_start_date || cp.zoom_start_date || cp.span_start_date;
  const zoom_end_date =
    primary.zoom_end_date || cp.zoom_end_date || cp.span_end_date;

  const event_date_range_human = buildHumanDateRange(
    zoom_start_date,
    zoom_end_date
  );

  return {
    creation_id,
    event_name,
    event_leg_key,
    series_title,
    series_base_key,
    event_date_range_human,
    span_start_date: cp.span_start_date || "could-not-verify",
    span_end_date: cp.span_end_date || "could-not-verify",
    span_season: cp.span_season || "could-not-verify",
    span_season_city_slug: cp.span_season_city_slug || "could-not-verify",
    span_rating: cp.span_rating || "could-not-verify",
    zoom_start_date: zoom_start_date || "could-not-verify",
    zoom_end_date: zoom_end_date || "could-not-verify",
    zoom_season: primary.zoom_season || cp.zoom_season || "could-not-verify",
    zoom_season_city_slug:
      primary.zoom_season_city_slug ||
      cp.zoom_season_city_slug ||
      "could-not-verify",
    zoom_rating: primary.zoom_rating || cp.zoom_rating || "could-not-verify",
    venue_name: cp.venue_name || "could-not-verify",
    venue_acronym: cp.venue_acronym || "could-not-verify",
    venue_official_url: cp.venue_official_url || "could-not-verify",
    city: cp.city || "could-not-verify",
    state: cp.state || "could-not-verify",
    zone: cp.zone || "could-not-verify"
  };
}

function buildVenueInput(payload) {
  const cp = payload || {};
  return {
    creation_id: cp.creation_id,
    venue_name: cp.venue_name || "could-not-verify",
    venue_acronym: cp.venue_acronym || "could-not-verify",
    venue_official_url: cp.venue_official_url || "could-not-verify",
    place_id: cp.place_id || "could-not-verify",
    maps: cp.maps || "could-not-verify",
    name_short: cp.name_short || "could-not-verify",
    lat: cp.lat || "could-not-verify",
    lng: cp.lng || "could-not-verify",
    city: cp.city || "could-not-verify",
    state: cp.state || "could-not-verify",
    city_slug: cp.city_slug || "could-not-verify",
    zone: cp.zone || "could-not-verify",
    span_season: cp.span_season || "could-not-verify",
    span_start_date: cp.span_start_date || "could-not-verify",
    span_end_date: cp.span_end_date || "could-not-verify"
  };
}

function buildCityInput(payload) {
  const cp = payload || {};
  const city = cp.city || "could-not-verify";
  const spanSeason = cp.span_season || "could-not-verify";

  return {
    creation_id: cp.creation_id,
    city: toTitleCaseCity(city) || "could-not-verify",
    state: cp.state || "could-not-verify",
    city_slug: cp.city_slug || "could-not-verify",
    zone: cp.zone || "could-not-verify",
    lat: cp.lat || "could-not-verify",
    lng: cp.lng || "could-not-verify",
    radius_miles: 20,
    span_season: spanSeason,
    season_label: deriveSeasonLabel(spanSeason, city),
    span_start_date: cp.span_start_date || "could-not-verify",
    span_end_date: cp.span_end_date || "could-not-verify"
  };
}

// ---- MAIN -------------------------------------------------------------------

async function run() {
  const creationId = process.argv[2];

  if (!creationId) {
    console.error(
      "Usage: node expeditor.js <creation_id>\nExample: node expeditor.js creator-abc"
    );
    process.exit(1);
  }

  try {
    console.log(`Expeditor: starting for creation_id=${creationId}`);

    const payload = await fetchCompetitionPayload(creationId);

    // Write full CompetitionPayload (optional but useful for debugging)
    const competitionPayloadPath = await writeJsonFile(
      "competition_payload.json",
      payload
    );
    console.log(`Wrote ${competitionPayloadPath}`);

    // Build and write lane inputs
    const eventInput = buildEventInput(payload);
    const venueInput = buildVenueInput(payload);
    const cityInput = buildCityInput(payload);

    const eventInputPath = await writeJsonFile(
      "event-research-input.json",
      eventInput
    );
    console.log(`Wrote ${eventInputPath}`);

    const venueInputPath = await writeJsonFile(
      "venue-research-input.json",
      venueInput
    );
    console.log(`Wrote ${venueInputPath}`);

    const cityInputPath = await writeJsonFile(
      "city-research-input.json",
      cityInput
    );
    console.log(`Wrote ${cityInputPath}`);

    // Final message: trigger string for the runner
    const trigger = `start crt-top-runner ${creationId}`;
    console.log("\nExpeditor complete.\nUse this trigger for the runner:");
    console.log(trigger);
  } catch (err) {
    console.error(`Expeditor error for creation_id=${process.argv[2]}:`);
    console.error(err.message || err);
    process.exit(1);
  }
}

run();
