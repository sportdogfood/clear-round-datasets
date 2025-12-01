// app.js
// CRT Session Tool – Rows integration + sessionStorage cache
// ----------------------------------------------------------
// - User selects a venue by name (hardcoded map -> filter_id).
// - Start session:
//     * Fetches one Rows table (filter-key, places-json, collection-json).
//     * Finds the row where filter-key === selected filter_id.
//     * Parses places-json + collection-json and stores them in sessionStorage.
//     * Writes a small index object to sessionStorage for overwrite/clear logic.
// - Restart session:
//     * Clears sessionStorage keys and log, keeps current venue selection.
// - Send session:
//     * Builds a lightweight outbound payload preview and writes it to the debug log
//       (no POST yet).
//
// Requirements:
//   - index.html must include:
//       * #session-start-btn
//       * #session-restart-btn
//       * #session-send-btn
//       * #session-status
//       * #debug-panel
//       * #session-log
//   - A global ROWS API key can be provided as window.CRT_ROWS_API_KEY.

(() => {
  // ------------------------------------------------
  // Config
  // ------------------------------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";

  // Prefer a global key if injected; fall back to literal.
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY || "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  // Single table with:
  //   A: filter-key (filter_id)
  //   B: places-json
  //   C: collection-json
  const SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
  const TABLE_ID = "a34b24a6-386b-457d-a9d4-beb2c7c13543";
  const RANGE_A1 = "A2:C999";

  // Hardcoded venue choices for the dropdown
  const VENUES = [
    { id: "6565", name: "Fox Lea" },
    { id: "177", name: "Devon" },
    { id: "276", name: "Hampton Classic" },
    { id: "497", name: "PA National Horse Show" },
    { id: "4993509", name: "WEF" },
    { id: "5388360", name: "WEC" },
    { id: "5692036", name: "WEC" },
    { id: "5126822", name: "Old Salem" },
    { id: "5368663", name: "Traverse City" },
    { id: "5659122", name: "Terranova" },
    { id: "5278924", name: "Tryon" },
    { id: "4597285", name: "Kentucky Horse Park" },
    { id: "3501105", name: "Prince Gerorge Eq Cntr" },
    { id: "541", name: "Colorado Horse Park" },
    { id: "263", name: "Great Southwest Eq Cntr" },
    { id: "5445344", name: "Virginia Horse Center" },
    { id: "997", name: "Galway Downs Equestrian Park" },
    { id: "5606921", name: "Desert" },
    { id: "999", name: "South Point" },
    { id: "4880209-ocala", name: "HITS Ocala" },
    { id: "4880209-saugerties", name: "HITS Saugerties" },
    { id: "4880209-wayn", name: "HITS Lamplight" },
    { id: "4880209-eastdorset", name: "HITS Vermont" },
    { id: "4880209-delmar", name: "HITS Del Mar" },
    { id: "4880209-culpeper", name: "HITS Culpeper" },
    { id: "240211", name: "Capital Challenge" },
    { id: "692", name: "Washington Intern Horse Show" },
    { id: "431", name: "National Horse Show" },
    { id: "597", name: "SFHJA" },
    { id: "4880209", name: "HITS" },
    { id: "4624769", name: "USHJA" },
    { id: "5319183", name: "Split Rock" }
  ];

  // sessionStorage keys we own
  const STORAGE_KEYS = {
    index: "crt_session_index",
    places: "crt_session_places",
    collection: "crt_session_collection"
  };

  // Minimal in-memory state
  const state = {
    isLoading: false,
    sessionId: null,
    filterId: null,
    venueName: null
  };

  // ------------------------------------------------
  // DOM refs
  // ------------------------------------------------
  const btnStart = document.getElementById("session-start-btn");
  const btnRestart = document.getElementById("session-restart-btn");
  const btnSend = document.getElementById("session-send-btn");
  const statusEl = document.getElementById("session-status");
  const debugPanel = document.getElementById("debug-panel");
  const sessionLog = document.getElementById("session-log");
  const sessionControls = document.getElementById("session-controls");

  // We’ll inject a <select> for venue choice into #session-controls.
  let venueSelect = null;

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
    if (typeof text !== "string") return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      console.error("JSON parse error:", err);
      return null;
    }
  }

  function buildRowsUrl(sheetId, tableId, rangeA1) {
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
      sessionStorage.setItem(
        STORAGE_KEYS.index,
        JSON.stringify(indexObj)
      );
    } catch (err) {
      console.error("Failed to write session index:", err);
    }
  }

  function logSnapshot(obj) {
    if (!debugPanel || !sessionLog) return;
    debugPanel.hidden = false;
    sessionLog.textContent = JSON.stringify(obj, null, 2);
  }

  function appendLogLine(line) {
    if (!sessionLog) return;
    const now = new Date().toISOString();
    const prefix = `[${now}] `;
    sessionLog.textContent =
      prefix + line + "\n" + (sessionLog.textContent || "");
  }

  function getSelectedVenue() {
    if (!venueSelect) return null;
    const id = venueSelect.value;
    if (!id) return null;
    const found = VENUES.find((v) => v.id === id);
    if (!found) return null;
    return found;
  }

  // ------------------------------------------------
  // Rows fetch
  // ------------------------------------------------
  async function fetchRowByFilterId(filterId) {
    const url = buildRowsUrl(SHEET_ID, TABLE_ID, RANGE_A1);

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

    // Find row with A == filterId
    const match = items.find(
      (row) => Array.isArray(row) && String(row[0]) === String(filterId)
    );

    if (!match) {
      return null;
    }

    const placesString = match[1] || null;
    const collectionString = match[2] || null;

    const places = placesString ? safeJsonParse(placesString) : null;
    const collection = collectionString ? safeJsonParse(collectionString) : null;

    return {
      filterId: String(filterId),
      places,
      collection,
      rawPlaces: placesString,
      rawCollection: collectionString
    };
  }

  // ------------------------------------------------
  // Core flows
  // ------------------------------------------------
  async function startSession() {
    if (state.isLoading) return;

    const venue = getSelectedVenue();
    if (!venue) {
      updateStatus("Select a venue first.");
      return;
    }

    if (!ROWS_API_KEY || ROWS_API_KEY === "REPLACE_WITH_ROWS_API_KEY") {
      updateStatus("ROWS_API_KEY is not set.");
      console.warn("[CRT] ROWS_API_KEY missing.");
      return;
    }

    state.isLoading = true;
    updateStatus(`Loading Rows payloads for ${venue.name} (${venue.id})…`);

    // Fresh data every time start is clicked
    clearSessionStorageKeys();

    const sessionId = generateSessionId();
    const filterId = venue.id;
    const venueName = venue.name;

    try {
      const rowResult = await fetchRowByFilterId(filterId);

      if (!rowResult) {
        updateStatus(
          `No Rows row found for filter_id ${filterId}.`
        );
        appendLogLine(
          `No row found for filter_id=${filterId}.`
        );
        state.sessionId = null;
        state.filterId = null;
        state.venueName = null;
        return;
      }

      // Write parsed payloads into sessionStorage
      if (rowResult.places) {
        sessionStorage.setItem(
          STORAGE_KEYS.places,
          JSON.stringify(rowResult.places)
        );
      }

      if (rowResult.collection) {
        sessionStorage.setItem(
          STORAGE_KEYS.collection,
          JSON.stringify(rowResult.collection)
        );
      }

      const indexObj = {
        session_id: sessionId,
        filter_id: filterId,
        venue_name: venueName,
        created_at: new Date().toISOString(),
        payloads: {
          places: !!rowResult.places,
          collection: !!rowResult.collection
        }
      };

      state.sessionId = sessionId;
      state.filterId = filterId;
      state.venueName = venueName;

      writeIndexToStorage(indexObj);

      logSnapshot({
        index: indexObj,
        meta: {
          places_keys: rowResult.places
            ? Object.keys(rowResult.places)
            : null,
          collection_keys: rowResult.collection
            ? Object.keys(rowResult.collection)
            : null
        }
      });

      updateStatus(
        `Session ready (${sessionId}) for ${venueName} (${filterId}).`
      );
      appendLogLine(
        `Loaded session_id=${sessionId}, filter_id=${filterId}, venue=${venueName}.`
      );
    } catch (err) {
      console.error("Error starting session:", err);
      updateStatus("Error loading Rows payloads. See console for details.");
      clearSessionStorageKeys();
      state.sessionId = null;
      state.filterId = null;
      state.venueName = null;
    } finally {
      state.isLoading = false;
    }
  }

  function restartSession() {
    clearSessionStorageKeys();
    const venue = getSelectedVenue();
    state.sessionId = null;
    // Keep filter selection; just clear data.
    updateStatus(
      venue
        ? `Session cleared for ${venue.name}. Click Start session to reload payloads.`
        : "Session cleared. Select a venue and click Start session."
    );
    if (debugPanel && sessionLog) {
      debugPanel.hidden = false;
      sessionLog.textContent = "";
    }
    appendLogLine("Session storage cleared.");
  }

  function sendSession() {
    if (!state.sessionId || !state.filterId || !state.venueName) {
      updateStatus("No active session to send.");
      appendLogLine("Send skipped: no active session.");
      return;
    }

    let indexJson = null;
    let placesJson = null;
    let collectionJson = null;

    try {
      const idx = sessionStorage.getItem(STORAGE_KEYS.index);
      indexJson = idx ? JSON.parse(idx) : null;
    } catch (err) {
      console.warn("Failed to parse index from storage:", err);
    }

    try {
      const p = sessionStorage.getItem(STORAGE_KEYS.places);
      placesJson = p ? JSON.parse(p) : null;
    } catch (err) {
      console.warn("Failed to parse places from storage:", err);
    }

    try {
      const c = sessionStorage.getItem(STORAGE_KEYS.collection);
      collectionJson = c ? JSON.parse(c) : null;
    } catch (err) {
      console.warn("Failed to parse collection from storage:", err);
    }

    const outbound = {
      session_id: state.sessionId,
      filter_id: state.filterId,
      venue_name: state.venueName,
      prepared_at: new Date().toISOString(),
      index: indexJson,
      // Only include very light meta for now; full objects live in sessionStorage.
      meta: {
        has_places: !!placesJson,
        has_collection: !!collectionJson
      }
    };

    logSnapshot(outbound);
    updateStatus("Session payload prepared (preview only, no POST wired yet).");
    appendLogLine("Session payload preview generated.");
  }

  // ------------------------------------------------
  // UI: venue dropdown
  // ------------------------------------------------
  function ensureVenueSelect() {
    if (venueSelect || !sessionControls) return;

    const wrapper = document.createElement("div");
    wrapper.id = "venue-select-wrapper";

    const label = document.createElement("label");
    label.setAttribute("for", "venue-select");
    label.textContent = "Venue";

    const select = document.createElement("select");
    select.id = "venue-select";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Select a venue…";
    select.appendChild(defaultOpt);

    VENUES.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.name} (${v.id})`;
      select.appendChild(opt);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    // Insert before status element if possible, otherwise append at end.
    if (statusEl && statusEl.parentNode === sessionControls) {
      sessionControls.insertBefore(wrapper, statusEl);
    } else {
      sessionControls.appendChild(wrapper);
    }

    venueSelect = select;
  }

  // ------------------------------------------------
  // Event wiring
  // ------------------------------------------------
  function bindEvents() {
    if (btnStart) {
      btnStart.addEventListener("click", startSession);
    } else {
      console.warn("#session-start-btn not found.");
    }

    if (btnRestart) {
      btnRestart.addEventListener("click", restartSession);
    } else {
      console.warn("#session-restart-btn not found.");
    }

    if (btnSend) {
      btnSend.addEventListener("click", sendSession);
    } else {
      console.warn("#session-send-btn not found.");
    }
  }

  function init() {
    ensureVenueSelect();
    bindEvents();
    if (debugPanel) {
      debugPanel.hidden = false;
    }
    updateStatus("Ready. Select a venue and click Start session.");
    appendLogLine("CRT Session Tool initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
