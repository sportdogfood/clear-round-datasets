// app.js
// CRT Session Tool – Rows integration + sessionStorage cache
// ----------------------------------------------------------
// This script:
// - Starts a new session on "Start session" click
// - Fetches two Rows payloads (competitions + destinations)
// - Stores them in sessionStorage
// - Maintains a lightweight session "index" for overwrite/clear logic
// - Clears everything on "End session"
//
// Replace the CONFIG constants (API key + table IDs) with your real values.

(() => {
  // ------------------------------------------------
  // Config
  // ------------------------------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";

  // IMPORTANT: put your real Rows API key here (or inject via <script> before this file)
  const ROWS_API_KEY = window.CRT_ROWS_API_KEY || "REPLACE_WITH_ROWS_API_KEY";

  // GET: competition payload rows
  // Shape: { items: [ [creation_id, payload_json_string], ... ] }
  const COMPETITIONS_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
  const COMPETITIONS_TABLE_ID = "18be0a0d-dbea-43ea-811f-f7bcbf4982d3"; // from openapi-rows
  const COMPETITIONS_RANGE = "A2:B999";

  // GET: destinations/hub payload rows (stay/dine/essentials)
  // You must replace DESTINATIONS_TABLE_ID and DESTINATIONS_RANGE with your real values.
  const DESTINATIONS_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
  const DESTINATIONS_TABLE_ID = "REPLACE_DESTINATIONS_TABLE_ID";
  const DESTINATIONS_RANGE = "A2:B999";

  // sessionStorage keys we own
  const STORAGE_KEYS = {
    index: "crt_session_index",
    competitions: "crt_session_competitions",
    destinations: "crt_session_destinations"
  };

  // Minimal in-memory state (for guarding double-clicks, etc.)
  const state = {
    isLoading: false,
    sessionId: null,
    creationId: null
  };

  // ------------------------------------------------
  // DOM refs (adjust IDs here if your markup differs)
  // ------------------------------------------------
  const btnStart = document.getElementById("btn-start-session");
  const btnEnd = document.getElementById("btn-end-session");
  const statusEl = document.getElementById("session-status");

  const debugPanel =
    document.getElementById("debug-panel") || null;
  const debugPayload =
    document.getElementById("debug-payload") || null;

  // ------------------------------------------------
  // Helpers
  // ------------------------------------------------
  function updateStatus(msg) {
    if (statusEl) {
      statusEl.textContent = msg;
    } else {
      console.log("[CRT status]", msg);
    }
  }

  function generateSessionId() {
    return (
      "sess-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function clearSessionStorageKeys() {
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (err) {
        console.warn("Failed to remove sessionStorage key:", key, err);
      }
    });
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      console.error("JSON parse error:", err);
      return null;
    }
  }

  async function fetchRowsPayload(url) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`Rows GET failed (${res.status}): ${url}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    if (!items.length || !Array.isArray(items[0]) || items[0].length < 2) {
      // Nothing usable; return null rather than throwing
      return null;
    }

    const [creationId, payloadString] = items[0];

    if (typeof payloadString !== "string") {
      throw new Error("Rows payload_json cell is not a string");
    }

    const parsed = safeJsonParse(payloadString);
    if (!parsed) {
      throw new Error("Rows payload_json could not be parsed as JSON");
    }

    return {
      creationId: creationId || parsed.creation_id || null,
      payload: parsed,
      raw: payloadString
    };
  }

  function buildRowsUrl(sheetId, tableId, rangeA1) {
    // /spreadsheets/{sheetId}/tables/{tableId}/values/{range} 
    return [
      ROWS_API_BASE,
      "spreadsheets",
      encodeURIComponent(sheetId),
      "tables",
      encodeURIComponent(tableId),
      "values",
      encodeURIComponent(rangeA1)
    ].join("/");
  }

  function writeIndexToStorage(indexObj) {
    try {
      sessionStorage.setItem(STORAGE_KEYS.index, JSON.stringify(indexObj));
    } catch (err) {
      console.error("Failed to write session index:", err);
    }
  }

  function showDebugSnapshot(indexObj, comp, dest) {
    if (!debugPanel || !debugPayload) return;
    debugPanel.hidden = false;

    const snapshot = {
      index: indexObj,
      competitions: comp ? { creation_id: comp.creationId } : null,
      destinations: dest ? { creation_id: dest.creationId } : null
    };

    debugPayload.textContent = JSON.stringify(snapshot, null, 2);
  }

  // ------------------------------------------------
  // Core flows
  // ------------------------------------------------
  async function startNewSession() {
    if (state.isLoading) {
      return; // guard against rapid double-clicks
    }

    state.isLoading = true;
    updateStatus("Loading payloads from Rows…");

    // Always treat this as a fresh session:
    clearSessionStorageKeys();

    const sessionId = generateSessionId();
    let competitionsResult = null;
    let destinationsResult = null;

    try {
      const competitionsUrl = buildRowsUrl(
        COMPETITIONS_SHEET_ID,
        COMPETITIONS_TABLE_ID,
        COMPETITIONS_RANGE
      );
      const destinationsUrl = buildRowsUrl(
        DESTINATIONS_SHEET_ID,
        DESTINATIONS_TABLE_ID,
        DESTINATIONS_RANGE
      );

      // Fetch both in parallel
      const [compRes, destRes] = await Promise.all([
        fetchRowsPayload(competitionsUrl),
        fetchRowsPayload(destinationsUrl)
      ]);

      competitionsResult = compRes;
      destinationsResult = destRes;

      // Write payloads into sessionStorage (if present)
      if (compRes && compRes.payload) {
        sessionStorage.setItem(
          STORAGE_KEYS.competitions,
          JSON.stringify(compRes.payload)
        );
      }

      if (destRes && destRes.payload) {
        sessionStorage.setItem(
          STORAGE_KEYS.destinations,
          JSON.stringify(destRes.payload)
        );
      }

      const creationId =
        (compRes && compRes.creationId) ||
        (destRes && destRes.creationId) ||
        null;

      const indexObj = {
        session_id: sessionId,
        creation_id: creationId,
        created_at: new Date().toISOString(),
        payloads: {
          competitions: !!(compRes && compRes.payload),
          destinations: !!(destRes && destRes.payload)
        }
      };

      state.sessionId = sessionId;
      state.creationId = creationId;

      writeIndexToStorage(indexObj);
      showDebugSnapshot(indexObj, compRes, destRes);

      updateStatus(
        `Session ready (${sessionId}).` +
          (creationId ? ` creation_id: ${creationId}` : "")
      );
    } catch (err) {
      console.error("Error starting session:", err);
      updateStatus("Error loading payloads from Rows. See console for details.");
      // In case of failure, make sure we don't leave half-written keys
      clearSessionStorageKeys();
      state.sessionId = null;
      state.creationId = null;
    } finally {
      state.isLoading = false;
    }
  }

  function endSession() {
    clearSessionStorageKeys();
    state.sessionId = null;
    state.creationId = null;
    updateStatus("Session cleared.");
    if (debugPanel && debugPayload) {
      debugPanel.hidden = true;
      debugPayload.textContent = "";
    }
  }

  // ------------------------------------------------
  // Event wiring
  // ------------------------------------------------
  function bindEvents() {
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        // Treat every click as "start/restart" – always overwrites prior session.
        startNewSession();
      });
    } else {
      console.warn("btn-start-session not found in DOM.");
    }

    if (btnEnd) {
      btnEnd.addEventListener("click", () => {
        endSession();
      });
    } else {
      console.warn("btn-end-session not found in DOM.");
    }
  }

  function init() {
    if (!ROWS_API_KEY || ROWS_API_KEY === "REPLACE_WITH_ROWS_API_KEY") {
      console.warn(
        "[CRT] ROWS_API_KEY is not set. Set window.CRT_ROWS_API_KEY or edit app.js."
      );
    }
    bindEvents();
    updateStatus("Ready. Start a new session to load Rows payloads.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
