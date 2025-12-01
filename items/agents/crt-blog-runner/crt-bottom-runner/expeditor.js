// File: expeditor.js
// Version: v0.2-bottom – 2025-12-01
// Purpose: Expeditor for CRT bottom-runner.
// Scope:
// - Read top-level CompetitionPayload (for locale lane).
// - Read bottom “places” payload (stay / dine / essentials).
// - Build a locale-research input JSON matching research-locale-prompt.txt.
// - Log both inputs under docs/ for debugging.
// - No writer/rewriter logic, no prose generation, no assumptions.

const DEFAULT_ITEMS_BASE = "https://items.clearroundtravel.com";
const DEFAULT_DOCS_BASE = "https://docs.clearroundtravel.com";

// -----------------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------------

async function httpGetJson(baseUrl, path) {
  const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed with ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`GET ${url} returned invalid JSON: ${err.message}`);
  }
}

async function commitDocs(docsBase, message, files) {
  const url = `${docsBase.replace(/\/+$/, "")}/docs/commit-bulk`;
  const body = {
    message,
    files: files.map(({ path, content }) => ({
      path,
      content:
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2),
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `POST ${url} failed with ${res.status} ${res.statusText}: ${text.slice(
        0,
        500
      )}`
    );
  }

  return res.json().catch(() => ({}));
}

// -----------------------------------------------------------------------------
// Locale Research Input Builder
// Matches EXACTLY the schema required by research-locale-prompt.txt.
// -----------------------------------------------------------------------------

function buildLocaleResearchInput(creationId, cp) {
  const competition = cp || {};

  // Required keys (no assumptions, no invention).
  const eventName =
    competition.event_name ||
    competition.zoom_leg_name ||
    competition.comp_name ||
    "";
  const venueName = competition.venue_name || "";
  const city = competition.city || "";
  const state = competition.state || "";
  const zone = competition.zone || "";

  // Dates (research prompt uses span_start_date / span_end_date directly)
  const spanStart = competition.span_start_date || "";
  const spanEnd = competition.span_end_date || "";

  // Season (do NOT invent; use cp.span_season if present)
  const spanSeason = competition.span_season || "";

  // Coordinates (required by prompt, empty if missing)
  const lat = competition.lat || "";
  const lng = competition.lng || "";

  return {
    creation_id: creationId,
    locale_input: {
      event_name: eventName,
      venue_name: venueName,
      city,
      state,
      zone,
      span_start_date: spanStart,
      span_end_date: spanEnd,
      span_season: spanSeason,
      lat,
      lng,
    },
  };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const CREATION_ID =
    process.env.CREATION_ID || args[0] || "";
  const AGENT_KEY =
    process.env.AGENT_KEY || args[1] || "crt-bottom-runner";

  if (!CREATION_ID) {
    throw new Error("CREATION_ID is required (env CREATION_ID or first CLI arg).");
  }

  const ITEMS_BASE = process.env.CRT_ITEMS_BASE || DEFAULT_ITEMS_BASE;
  const DOCS_BASE = process.env.CRT_DOCS_BASE || DEFAULT_DOCS_BASE;

  const TOP_PAYLOAD_PATH =
    process.env.CRT_TOP_PAYLOAD_PATH || args[2] || "";
  const BOTTOM_PAYLOAD_PATH =
    process.env.CRT_BOTTOM_PAYLOAD_PATH || args[3] || "";

  if (!TOP_PAYLOAD_PATH) {
    throw new Error("CRT_TOP_PAYLOAD_PATH is required (env or CLI).");
  }
  if (!BOTTOM_PAYLOAD_PATH) {
    throw new Error("CRT_BOTTOM_PAYLOAD_PATH is required (env or CLI).");
  }

  const LOCALE_RESEARCH_INPUT_PATH =
    process.env.CRT_LOCALE_RESEARCH_INPUT_PATH ||
    `agents/${AGENT_KEY}/locale_research_input.json`;

  const BOTTOM_PLACES_LOG_PATH =
    process.env.CRT_BOTTOM_PLACES_LOG_PATH ||
    `agents/${AGENT_KEY}/bottom_places_payload.json`;

  // ---------------------------------------------------------------------------
  // 1) Load inputs (no transformations)
  // ---------------------------------------------------------------------------

  const competitionPayload = await httpGetJson(ITEMS_BASE, TOP_PAYLOAD_PATH);
  const bottomPlacesPayload = await httpGetJson(ITEMS_BASE, BOTTOM_PAYLOAD_PATH);

  // ---------------------------------------------------------------------------
  // 2) Build locale-research input EXACTLY matching the prompt schema
  // ---------------------------------------------------------------------------

  const localeResearchInput = buildLocaleResearchInput(
    CREATION_ID,
    competitionPayload
  );

  // ---------------------------------------------------------------------------
  // 3) Commit both files as logs for downstream stages
  // ---------------------------------------------------------------------------

  const message = `[expeditor-bottom] ${AGENT_KEY} ${CREATION_ID} – locale input + bottom payload`;

  const filesToCommit = [
    {
      path: LOCALE_RESEARCH_INPUT_PATH,
      content: localeResearchInput,
    },
    {
      path: BOTTOM_PLACES_LOG_PATH,
      content: bottomPlacesPayload,
    },
  ];

  await commitDocs(DOCS_BASE, message, filesToCommit);

  console.log(
    JSON.stringify(
      {
        ok: true,
        creation_id: CREATION_ID,
        agent_key: AGENT_KEY,
        written: filesToCommit.map((f) => f.path),
      },
      null,
      2
    )
  );
}

// -----------------------------------------------------------------------------
// Entry
// -----------------------------------------------------------------------------

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err.message || String(err),
      },
      null,
      2
    )
  );
  process.exit(1);
});
