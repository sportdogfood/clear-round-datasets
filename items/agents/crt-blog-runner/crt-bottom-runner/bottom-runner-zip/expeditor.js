// File: expeditor.js
// Version: v1.1-bottom – 2025-12-01
// LIVE-SHAPE CORRECTED VERSION (matches successful pipeline output)

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
// utilities
// ------------------------------------------------------------

function normalizeField(v) {
  if (v === null || v === undefined) return "could-not-verify";
  if (typeof v === "string" && v.trim() === "") return "could-not-verify";
  return v;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
// EXACTLY the shape used in the LIVE runner
// ------------------------------------------------------------

function buildLocaleResearchInput(creationId, cp) {
  return {
    creation_id: creationId,

    event_identity: {
      venue_name: normalizeField(cp.venue_name),
      venue_acronym: normalizeField(cp.venue_acronym),
      city: normalizeField(cp.city),
      state: normalizeField(cp.state),
      zone: normalizeField(cp.zone),

      span_season: normalizeField(cp.span_season),
      span_season_city_slug: normalizeField(cp.span_season_city_slug),

      zoom_season: normalizeField(cp.zoom_season),
      zoom_season_city_slug: normalizeField(cp.zoom_season_city_slug),

      span_start_date: normalizeField(cp.span_start_date),
      span_end_date: normalizeField(cp.span_end_date),

      zoom_start_date: normalizeField(cp.zoom_start_date),
      zoom_end_date: normalizeField(cp.zoom_end_date)
    },

    maps_anchor: {
      place_id: normalizeField(cp.place_id),
      lat: numOrNull(cp.lat),
      lng: numOrNull(cp.lng)
    }
  };
}

// ------------------------------------------------------------
// BUILD bottomblock-writer-input
// EXACTLY the shape consumed by the LIVE writer
// ------------------------------------------------------------

function buildBottomWriterInput(dest) {
  return {
    creation_id: dest.creation_id || "could-not-verify",

    hub_meta: {
      hub_title_override:
        normalizeField(
          safeGet(dest, ["hub_meta", "hub_title_override"])
        )
    },

    stay: {
      feature: Array.isArray(dest?.stay?.feature) ? dest.stay.feature : [],
      list_only: Array.isArray(dest?.stay?.["list-only"])
        ? dest.stay["list-only"]
        : []
    },

    dine: {
      feature: Array.isArray(dest?.dine?.feature) ? dest.dine.feature : [],
      list_only: Array.isArray(dest?.dine?.["list-only"])
        ? dest.dine["list-only"]
        : []
    },

    essentials: {
      feature: Array.isArray(dest?.essentials?.feature)
        ? dest.essentials.feature
        : [],
      list_only: Array.isArray(dest?.essentials?.["list-only"])
        ? dest.essentials["list-only"]
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

  // LOAD
  const competitionPayload = await httpGetJson(ITEMS_BASE, TOP_PAYLOAD_PATH);
  const destinationPayload = await httpGetJson(ITEMS_BASE, BOTTOM_PAYLOAD_PATH);

  // BUILD INPUTS
  const locale_research_input = buildLocaleResearchInput(
    CREATION_ID,
    competitionPayload
  );

  const bottom_writer_input = buildBottomWriterInput(destinationPayload);

  // COMMIT LOGS
  const files = [
    {
      path: `docs/runner/bottom/logs/${CREATION_ID}-locale-research-input.json`,
      content: locale_research_input
    },
    {
      path: `docs/runner/bottom/logs/${CREATION_ID}-bottomblock-writer-input.json`,
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
