// app.js
// CRT Session Tool – selector-data via Rows + sessionStorage
// ----------------------------------------------------------
// - User picks a venue (filter-id) from dropdown.
// - We GET selector-data from Rows (filter-key, places-json, collection-json).
// - We match on filter-key == filter-id (string compare).
// - We cache places/collection payloads + a small index into sessionStorage.
// - Restart clears everything. Send just dumps a preview into the debug log.

(() => {
  // ------------------------------------------------
  // Config
  // ------------------------------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY || "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  // selector-data table: filter-key | places-json | collection-json | ...
  const SELECTOR_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
  const SELECTOR_TABLE_ID = "a34b24a6-386b-457d-a9d4-beb2c7c13543";
  const SELECTOR_RANGE = "A2:C999";

  const STORAGE_KEYS = {
    index: "crt_session_index",
    places: "crt_session_places_payload",
    collection: "crt_session_collection_payload"
  };

  const VENUES = [
    { id: "6565", label: "Fox Lea" },
    { id: "177", label: "Devon" },
    { id: "276", label: "Hampton Classic" },
    { id: "497", label: "PA National Horse Show" },
    { id: "4993509", label: "WEF" },
    { id: "5388360", label: "WEC" },
    { id: "5692036", label: "WEC" },
    { id: "5126822", label: "Old Salem" },
    { id: "5368663", label: "Traverse City" },
    { id: "5659122", label: "Terranova" },
    { id: "5278924", label: "Tryon" },
    { id: "4597285", label: "Kentucky Horse Park" },
    { id: "3501105", label: "Prince Gerorge Eq Cntr" },
    { id: "541", label: "Colorado Horse Park" },
    { id: "263", label: "Great Southwest Eq Cntr" },
    { id: "5445344", label: "Virginia Horse Center" },
    { id: "997", label: "Galway Downs Equestrian Park" },
    { id: "5606921", label: "Desert" },
    { id: "999", label: "South Point" },
    { id: "4880209-ocala", label: "HITS Ocala" },
    { id: "4880209-saugerties", label: "HITS Saugerties" },
    { id: "4880209-wayn", label: "HITS Lamplight" },
    { id: "4880209-eastdorset", label: "HITS Vermont" },
    { id: "4880209-delmar", label: "HITS Del Mar" },
    { id: "4880209-culpeper", label: "HITS Culpeper" },
    { id: "240211", label: "Capital Challenge" },
    { id: "692", label: "Washington Intern Horse Show" },
    { id: "431", label: "National Horse Show" },
    { id: "597", label: "SFHJA" },
    { id: "4880209", label: "HITS" },
    { id: "4624769", label: "USHJA" },
    { id: "5319183", label: "Split Rock" }
  ];

  // ------------------------------------------------
  // DOM
  // ------------------------------------------------
  const venueSelect = document.getElementById("venue-select");
  const btnStart = document.getElementById("session-start-btn");
  const btnRestart = document.getElementById("session-restart-btn");
  const btnSend = document.getElementById("session-send-btn");
  const statusEl = document.getElementById("session-status");
  const logEl = document.getElementById("session-log");

  // ------------------------------------------------
  // Helpers
  // ------------------------------------------------
  function appendLog(message) {
    if (!logEl) return;
    const ts = new Date().toISOString();
    logEl.textContent = `[${ts}] ${message}\n` + logEl.textContent;
  }

  function updateStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function generateSessionId() {
    return (
      "sess-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function clearStorage() {
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (err) {
        console.warn("Failed removing sessionStorage key:", key, err);
      }
    });
  }

  function safeJsonParse(text) {
    if (text == null) return null;
    try {
      return JSON.parse(String(text));
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

  async function fetchSelectorRow(filterId) {
    const url = buildRowsUrl(
      SELECTOR_SHEET_ID,
      SELECTOR_TABLE_ID,
      SELECTOR_RANGE
    );

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`Rows GET failed (${res.status})`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    // IMPORTANT: compare as strings so "4993509" and 4993509 both match.
    const row = items.find(
      (r) => Array.isArray(r) && String(r[0]) === String(filterId)
    );

    if (!row) {
      appendLog(`No row found for filter_id=${filterId}.`);
      return null;
    }

    const placesStr = row[1] != null ? String(row[1]) : "";
    const collectionStr = row[2] != null ? String(row[2]) : "";

    const places = placesStr ? safeJsonParse(placesStr) : null;
    const collection = collectionStr ? safeJsonParse(collectionStr) : null;

    return {
      filterId: String(filterId),
      placesStr,
      collectionStr,
      places,
      collection
    };
  }

  function populateVenueOptions() {
    if (!venueSelect) return;

    // Keep first option (placeholder), clear the rest.
    while (venueSelect.options.length > 1) {
      venueSelect.remove(1);
    }

    VENUES.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.label} (${v.id})`;
      venueSelect.appendChild(opt);
    });
  }

  // ------------------------------------------------
  // Core flows
  // ------------------------------------------------
  async function handleStart() {
    if (!venueSelect) {
      appendLog("venue-select not found in DOM.");
      return;
    }

    const filterId = venueSelect.value.trim();
    if (!filterId) {
      updateStatus("Select a venue first.");
      appendLog("Start blocked: no venue selected.");
      return;
    }

    clearStorage();
    updateStatus("Loading from Rows…");
    appendLog(`Fetching selector-data for filter_id=${filterId}…`);

    try {
      const row = await fetchSelectorRow(filterId);
      if (!row) {
        updateStatus(`No Rows row found for filter_id ${filterId}.`);
        return;
      }

      const sessionId = generateSessionId();
      const indexObj = {
        session_id: sessionId,
        filter_id: row.filterId,
        created_at: new Date().toISOString(),
        payloads: {
          places: !!row.places,
          collection: !!row.collection
        }
      };

      try {
        sessionStorage.setItem(STORAGE_KEYS.index, JSON.stringify(indexObj));
        if (row.places) {
          sessionStorage.setItem(
            STORAGE_KEYS.places,
            JSON.stringify(row.places)
          );
        }
        if (row.collection) {
          sessionStorage.setItem(
            STORAGE_KEYS.collection,
            JSON.stringify(row.collection)
          );
        }
      } catch (err) {
        console.error("sessionStorage write error:", err);
      }

      appendLog(
        `Session ${sessionId} loaded: filter_id=${row.filterId}, places=${!!row.places}, collection=${!!row.collection}.`
      );
      updateStatus(`Session ready for filter_id ${row.filterId}.`);
    } catch (err) {
      console.error(err);
      appendLog(`Error loading Rows: ${err.message}`);
      updateStatus("Error loading Rows data.");
      clearStorage();
    }
  }

  function handleRestart() {
    clearStorage();
    updateStatus("Session cleared.");
    appendLog("Session cleared via Restart button.");
  }

  function handleSend() {
    const indexRaw = sessionStorage.getItem(STORAGE_KEYS.index);
    const placesRaw = sessionStorage.getItem(STORAGE_KEYS.places);
    const collectionRaw = sessionStorage.getItem(STORAGE_KEYS.collection);

    const payload = {
      index: indexRaw ? safeJsonParse(indexRaw) : null,
      places: placesRaw ? safeJsonParse(placesRaw) : null,
      collection: collectionRaw ? safeJsonParse(collectionRaw) : null
    };

    appendLog("Send session (preview only):");
    appendLog(JSON.stringify(payload, null, 2));
  }

  // ------------------------------------------------
  // Init
  // ------------------------------------------------
  function bindEvents() {
    if (btnStart) btnStart.addEventListener("click", handleStart);
    if (btnRestart) btnRestart.addEventListener("click", handleRestart);
    if (btnSend) btnSend.addEventListener("click", handleSend);
  }

  function init() {
    populateVenueOptions();
    bindEvents();
    appendLog("CRT Session Tool initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
