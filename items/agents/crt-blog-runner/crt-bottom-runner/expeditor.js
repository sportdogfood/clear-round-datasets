 // File: expeditor.js
// Version: v0.1-bottom – 2025-11-29
// Purpose: Expeditor for CRT bottom-runner.
// Scope:
// - Read top-level CompetitionPayload (for locale lane).
// - Read bottom “places” payload (stay / dine / essentials).
// - Build a small locale-research input JSON for the locale researcher.
// - Optionally log both inputs under docs/ for debugging.
// - No writing of prose; no research; no writer/rewriter logic here.

const DEFAULT_ITEMS_BASE = "https://items.clearroundtravel.com";
const DEFAULT_DOCS_BASE = "https://docs.clearroundtravel.com";

// -----------------------------------------------------------------------------
// Small HTTP helpers (adapt to match your existing runner-light helpers)
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

// commit-bulk wrapper: write one or more files into Docs
async function commitDocs(docsBase, message, files) {
  const url = `${docsBase.replace(/\/+$/, "")}/docs/commit-bulk`;
  const body = {
    message,
    files: files.map(({ path, content }) => ({
      path,
      content: typeof content === "string" ? content : JSON.stringify(content, null, 2),
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
      `POST ${url} failed with ${res.status} ${res.statusText}: ${text.slice(0, 500)}`
    );
  }

  return res.json().catch(() => ({}));
}

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

// CompetitionPayload → locale-research-input.json
// This keeps the shape intentionally small and generic; adjust fields as needed
// once you wire it to the actual CompetitionPayload shape.
function buildLocaleResearchInput(creationId, competitionPayload) {
  // These paths assume a CompetitionPayload similar to top-runner:
  // - top-level city/state/zone
  // - collection_primary as the main leg
  const cp = competitionPayload || {};
  const primary = cp.collection_primary || {};

  const eventName =
    primary.zoom_leg_name ||
    primary.comp_name ||
    cp.event_name ||
    cp.title ||
    "";

  const venueName =
    primary.venue_name ||
    cp.venue_name ||
    "";

  const city = primary.city || cp.city || "";
  const state = primary.state || cp.state || "";

  // Dates / seasons – keep loose; top-runner is already the source of truth.
  const zoomStart = primary.zoom_start_date || cp.zoom_start_date || cp.span_start_date || "";
  const zoomEnd = primary.zoom_end_date || cp.zoom_end_date || cp.span_end_date || "";
  const seasonLabel =
    primary.zoom_season ||
    cp.zoom_season ||
    cp.span_season ||
    "";

  return {
    creation_id: creationId,
    locale_identity: {
      event_name: eventName,
      venue_name: venueName,
      city,
      state,
      season_label: seasonLabel,
      zoom_start_date: zoomStart,
      zoom_end_date: zoomEnd,
    },
    // The researcher prompt (research-locale-prompt) will see this object and
    // is responsible for turning it into city/locale “things to do” research.
  };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Inputs from env / CLI; these are deliberately flexible so you can wire
  // actual paths in your trigger config, not hard-coded here.
  const CREATION_ID =
    process.env.CREATION_ID ||
    args[0] ||
    "";
  const AGENT_KEY =
    process.env.AGENT_KEY ||
    args[1] ||
    "crt-bottom-runner";

  if (!CREATION_ID) {
    throw new Error("CREATION_ID is required (env CREATION_ID or first CLI arg).");
  }

  const ITEMS_BASE = process.env.CRT_ITEMS_BASE || DEFAULT_ITEMS_BASE;
  const DOCS_BASE = process.env.CRT_DOCS_BASE || DEFAULT_DOCS_BASE;

  // Paths (set these via env so we don’t bake in any new scheme):
  //
  // - TOP_PAYLOAD_PATH: CompetitionPayload JSON (same as top-runner uses)
  // - BOTTOM_PAYLOAD_PATH: bottom “places” payload JSON (the big stay/dine/essentials object)
  //
  // Example (you will set the real ones in your trigger):
  //   CRT_TOP_PAYLOAD_PATH=agents/wec-ocala-test-runner/CompetitionPayload.json
  //   CRT_BOTTOM_PAYLOAD_PATH=agents/crt-bottom-runner/bottom_payload.json
  const TOP_PAYLOAD_PATH =
    process.env.CRT_TOP_PAYLOAD_PATH ||
    args[2] ||
    "";
  const BOTTOM_PAYLOAD_PATH =
    process.env.CRT_BOTTOM_PAYLOAD_PATH ||
    args[3] ||
    "";

  if (!TOP_PAYLOAD_PATH) {
    throw new Error("CRT_TOP_PAYLOAD_PATH is required (env or CLI).");
  }
  if (!BOTTOM_PAYLOAD_PATH) {
    throw new Error("CRT_BOTTOM_PAYLOAD_PATH is required (env or CLI).");
  }

  // Output paths under Docs. These are the only new files this expeditor
  // is responsible for. They are intentionally simple and bottom-runner-specific.
  const LOCALE_RESEARCH_INPUT_PATH =
    process.env.CRT_LOCALE_RESEARCH_INPUT_PATH ||
    `agents/${AGENT_KEY}/locale_research_input.json`;

  const BOTTOM_PLACES_LOG_PATH =
    process.env.CRT_BOTTOM_PLACES_LOG_PATH ||
    `agents/${AGENT_KEY}/bottom_places_payload.json`;

  // ---------------------------------------------------------------------------
  // 1) Load inputs
  // ---------------------------------------------------------------------------

  const competitionPayload = await httpGetJson(ITEMS_BASE, TOP_PAYLOAD_PATH);
  const bottomPlacesPayload = await httpGetJson(ITEMS_BASE, BOTTOM_PAYLOAD_PATH);

  // ---------------------------------------------------------------------------
  // 2) Build locale research input (city/season “things to do” lane)
  // ---------------------------------------------------------------------------

  const localeResearchInput = buildLocaleResearchInput(CREATION_ID, competitionPayload);

  // ---------------------------------------------------------------------------
  // 3) Commit outputs to Docs
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

  // If your runner-light wiring expects console output, keep this minimal and
  // machine-readable.
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
