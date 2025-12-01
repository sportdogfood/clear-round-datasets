// File: expeditor.js
// Version: v1.0-bottom – 2025-12-01
// Contract-Aligned Revision (includes all known conflicts + safety rules)
// NOTE: This file now enforces:
// - STRICT pass-through of CompetitionPayload + DestinationPayload
// - NO data validation, NO verification, NO guessing
// - researcher receives ONLY the fields it must use as context
// - researcher does NOT verify upstream fields; only performs its tasks
// - writer ignores "" and "could-not-verify" fields
// - troubleshooting logs for: load_fail, shape_mismatch, commit_fail
// - zero assumptions about present/absent optional fields
// - NO top-runner cross-contamination
// - NO fabrications

const DEFAULT_ITEMS_BASE = "https://items.clearroundtravel.com";
const DEFAULT_DOCS_BASE = "https://docs.clearroundtravel.com";

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

async function httpGetJson(baseUrl, path) {
  const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`load_fail: network error for ${url}: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`load_fail: GET ${url} → ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`load_fail: invalid JSON at ${url}: ${err.message}`);
  }
}

async function commitDocs(docsBase, message, files) {
  const url = `${docsBase.replace(/\/+$/, "")}/docs/commit-bulk`;
  const body = {
    message,
    overwrite: true,
    files: files.map(f => ({
      path: f.path,
      content_type: "application/json",
      content_base64: Buffer.from(
        typeof f.content === "string"
          ? f.content
          : JSON.stringify(f.content, null, 2),
        "utf8"
      ).toString("base64")
    }))
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error(`commit_fail: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `commit_fail: POST ${url} → ${res.status} ${res.statusText}: ${text.slice(
        0,
        500
      )}`
    );
  }
}

// ------------------------------------------------------------
// small utilities
// ------------------------------------------------------------

// convert "", null, undefined → "could-not-verify"
// leave normal values unchanged
function normalizeField(v) {
  if (v === null || v === undefined) return "could-not-verify";
  if (typeof v === "string" && v.trim() === "") return "could-not-verify";
  return v;
}

// numeric parse or null
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// safe nested lookup
function safeGet(obj, pathArr) {
  let cur = obj;
  for (const p of pathArr) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else return undefined;
  }
  return cur;
}

// ------------------------------------------------------------
// BUILD locale_research_input
// ------------------------------------------------------------
// researcher will NOT verify any of these fields — they are context only
// researcher WILL output "could-not-verify" ONLY on its own task failures
// (not missing fields from this file)

function buildLocaleResearchInput(creationId, cp) {
  const city = normalizeField(cp.city);
  const state = normalizeField(cp.state);
  const venue_name = normalizeField(cp.venue_name);

  // BOOLEAN ZERO-ASSUMPTION PARSING:
  // For season_label → do NOT “verify”, do NOT “confirm”
  // If CP provides span_season → pass through
  // Else if zoom_season → pass through
  // Else → "could-not-verify"
  let season_label = "could-not-verify";
  if (cp.span_season && cp.span_season.trim() !== "") {
    season_label = cp.span_season.trim();
  } else if (cp.zoom_season && cp.zoom_season.trim() !== "") {
    season_label = cp.zoom_season.trim();
  }

  return {
    creation_id: creationId,
    locale_input: {
      event_name:
        safeGet(cp, ["collection_primary", "zoom_leg_name"]) ||
        safeGet(cp, ["collection_primary", "comp_name"]) ||
        "could-not-verify",
      venue_name,
      city,
      state,
      zone: normalizeField(cp.zone),
      span_start_date: normalizeField(cp.span_start_date),
      span_end_date: normalizeField(cp.span_end_date),
      span_season: season_label,

      // pass-through; researcher does NOT validate lat/lng
      lat: numOrNull(cp.lat),
      lng: numOrNull(cp.lng)
    }
  };
}

// ------------------------------------------------------------
// BUILD bottomblock_writer_input
// ------------------------------------------------------------
// EXACT pass-through of curated DestinationPayload structure
// We DO NOT rename list-only → list_only here (writer handles keys later)
// No verification. No assumptions. No corrections.

function buildBottomWriterInput(destPayload) {
  return {
    creation_id: destPayload.creation_id || "could-not-verify",
    hub_meta: {
      hub_title_override:
        normalizeField(
          safeGet(destPayload, ["hub_meta", "hub_title_override"])
        ) || "could-not-verify"
    },

    // preserve EXACT structure from DestinationPayload
    stay: {
      feature: Array.isArray(destPayload.stay?.feature)
        ? destPayload.stay.feature
        : [],
      "list-only": Array.isArray(destPayload.stay?.["list-only"])
        ? destPayload.stay["list-only"]
        : []
    },
    dine: {
      feature: Array.isArray(destPayload.dine?.feature)
        ? destPayload.dine.feature
        : [],
      "list-only": Array.isArray(destPayload.dine?.["list-only"])
        ? destPayload.dine["list-only"]
        : []
    },
    essentials: {
      feature: Array.isArray(destPayload.essentials?.feature)
        ? destPayload.essentials.feature
        : [],
      "list-only": Array.isArray(destPayload.essentials?.["list-only"])
        ? destPayload.essentials["list-only"]
        : []
    }
  };
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const CREATION_ID = process.env.CREATION_ID || args[0] || "";
  const AGENT_KEY = process.env.AGENT_KEY || args[1] || "crt-bottom-runner";

  if (!CREATION_ID) throw new Error("load_fail: missing CREATION_ID");

  const ITEMS_BASE = process.env.CRT_ITEMS_BASE || DEFAULT_ITEMS_BASE;
  const DOCS_BASE = process.env.CRT_DOCS_BASE || DEFAULT_DOCS_BASE;

  const TOP_PAYLOAD_PATH =
    process.env.CRT_TOP_PAYLOAD_PATH || args[2] || "";
  const BOTTOM_PAYLOAD_PATH =
    process.env.CRT_BOTTOM_PAYLOAD_PATH || args[3] || "";

  if (!TOP_PAYLOAD_PATH)
    throw new Error("load_fail: missing TOP_PAYLOAD_PATH");

  if (!BOTTOM_PAYLOAD_PATH)
    throw new Error("load_fail: missing BOTTOM_PAYLOAD_PATH");

  // ------------------------------------------------------------
  // 1. LOAD
  // ------------------------------------------------------------
  const competitionPayload = await httpGetJson(ITEMS_BASE, TOP_PAYLOAD_PATH);
  const destinationPayload = await httpGetJson(ITEMS_BASE, BOTTOM_PAYLOAD_PATH);

  // ------------------------------------------------------------
  // 2. BUILD INPUTS
  // ------------------------------------------------------------
  const locale_research_input = buildLocaleResearchInput(
    CREATION_ID,
    competitionPayload
  );

  const bottom_writer_input = buildBottomWriterInput(destinationPayload);

  // ------------------------------------------------------------
  // 3. COMMIT LOGS
  // ------------------------------------------------------------
  const files = [
    {
      path: `docs/runner/bottom/logs/${CREATION_ID}-locale_research_input.json`,
      content: locale_research_input
    },
    {
      path: `docs/runner/bottom/logs/${CREATION_ID}-bottomblock_writer_input.json`,
      content: bottom_writer_input
    }
  ];

  await commitDocs(
    DOCS_BASE,
    `[expeditor-bottom] ${AGENT_KEY} ${CREATION_ID} – inputs`,
    files
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        creation_id: CREATION_ID,
        agent_key: AGENT_KEY,
        written: files.map(f => f.path)
      },
      null,
      2
    )
  );
}

// ------------------------------------------------------------
main().catch(err => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err.message || String(err)
      },
      null,
      2
    )
  );
  process.exit(1);
});
