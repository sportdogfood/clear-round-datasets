// app.js
// CRT Session Tool – selector-data → sessionStorage
// Single Rows table:
//   A: filter-key
//   B: places-json
//   C: collection-json

(() => {
  // -----------------------------
  // Config
  // -----------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";

  const ROWS_API_KEY =
        window.CRT_ROWS_API_KEY || "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  // selector-data table: filter-key | places-json | collection-json | ...
  const SELECTOR_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
  const SELECTOR_TABLE_ID = "ac426c27-747f-44f7-a581-d856c7ac23d6";
  const SELECTOR_RANGE = "A2:C999";

  const STORAGE_KEYS = {
    index: "crt_session_index",
    places: "crt_session_places",
    collection: "crt_session_collection"
  };

  // Hard-coded venue list for the dropdown
  const VENUE_OPTIONS = [
    { id: "6565", label: "Fox Lea" },
    { id: "177", label: "Devon" },
    { id: "276", label: "Hampton Classic" },
    { id: "497", label: "PA National Horse Show" },
    { id: "4993509", label: "WEF" },
    { id: "5388360", label: "WEC" },
    { id: "5692036", label: "WEC (5692036)" },
    { id: "5126822", label: "Old Salem" },
    { id: "5368663", label: "Traverse City" },
    { id: "5659122", label: "Terranova" },
    { id: "5278924", label: "Tryon" },
    { id: "4597285", label: "Kentucky Horse Park" },
    { id: "3501105", label: "Prince George Eq Cntr" },
    { id: "541", label: "Colorado Horse Park" },
    { id: "263", label: "Great Southwest Eq Cntr" },
    { id: "5445344", label: "Virginia Horse Center" },
    { id: "997", label: "Galway Downs" },
    { id: "5606921", label: "Desert" },
    { id: "999", label: "South Point" },
    { id: "4880209-ocala", label: "HITS Ocala" },
    { id: "4880209-saugerties", label: "HITS Saugerties" },
    { id: "4880209-wayn", label: "HITS Lamplight" },
    { id: "4880209-eastdorset", label: "HITS Vermont" },
    { id: "4880209-delmar", label: "HITS Del Mar" },
    { id: "4880209-culpeper", label: "HITS Culpeper" },
    { id: "240211", label: "Capital Challenge" },
    { id: "692", label: "Washington International" },
    { id: "431", label: "National Horse Show" },
    { id: "597", label: "SFHJA" },
    { id: "4880209", label: "HITS (generic)" },
    { id: "4624769", label: "USHJA" },
    { id: "5319183", label: "Split Rock" }
  ];

  // -----------------------------
  // State + DOM refs
  // -----------------------------
  const state = {
    isLoading: false,
    sessionId: null,
    filterId: null
  };

  let venueSelectEl;
  let btnStartEl;
  let btnRestartEl;
  let btnSendEl;
  let statusEl;
  let logEl;

  // -----------------------------
  // Helpers
  // -----------------------------
  function appendLog(line) {
    if (!logEl) return;
    const ts = new Date().toISOString();
    logEl.textContent += `[${ts}] ${line}\n`;
  }

  function logConsole(...args) {
    console.log("[CRT]", ...args);
  }

  function updateStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
    appendLog(msg);
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
        logConsole("Failed to remove key", key, err);
      }
    });
  }

  function safeJsonParse(value) {
    if (value == null) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch (err) {
      logConsole("JSON parse error:", err, value);
      appendLog("JSON parse error; see console.");
      return null;
    }
  }

  // Try to pull a primitive from a Rows cell (handles objects / data cells)
  function getCellPrimitive(cell) {
    if (cell == null) return null;
    if (typeof cell === "object") {
      if ("value" in cell) return getCellPrimitive(cell.value);
      if ("values" in cell) return getCellPrimitive(cell.values);
      if ("stringValue" in cell) return cell.stringValue;
      if ("numberValue" in cell) return cell.numberValue;
      if ("boolValue" in cell) return cell.boolValue;
      // Fallback: stringify
      return JSON.stringify(cell);
    }
    return cell;
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

  async function fetchSelectorRowForFilter(filterId) {
    const url = buildRowsUrl(
      SELECTOR_SHEET_ID,
      SELECTOR_TABLE_ID,
      SELECTOR_RANGE
    );
    logConsole("Fetching selector-data from", url);
    appendLog(`GET selector-data for filter_id=${filterId}`);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      const msg = `Rows GET failed (${res.status})`;
      appendLog(msg);
      throw new Error(msg);
    }

    const data = await res.json();
    const rows =
      (Array.isArray(data.items) && data.items) ||
      (Array.isArray(data.values) && data.values) ||
      [];

    logConsole("Raw selector-data rows:", rows);
    appendLog(`selector-data rows length=${rows.length}`);

    const filterIdStr = String(filterId);
    let match = null;

    for (const row of rows) {
      const rawKey = row[0];
      const keyVal = getCellPrimitive(rawKey);
      logConsole("Row[0] raw:", rawKey, "primitive:", keyVal);
      appendLog(`check key=${String(keyVal)} vs ${filterIdStr}`);
      if (keyVal != null && String(keyVal) === filterIdStr) {
        match = row;
        break;
      }
    }

    if (!match) {
      appendLog(`No row found for filter_id=${filterIdStr}.`);
      return null;
    }

    appendLog(`Matched row for filter_id=${filterIdStr}.`);

    const placesCell = match[1];
    const collectionCell = match[2];

    const placesPrimitive = getCellPrimitive(placesCell);
    const collectionPrimitive = getCellPrimitive(collectionCell);

    logConsole("places cell primitive:", placesPrimitive);
    logConsole("collection cell primitive:", collectionPrimitive);

    const placesJson = safeJsonParse(placesPrimitive);
    const collectionJson = safeJsonParse(collectionPrimitive);

    return {
      filterId: filterIdStr,
      places: placesJson,
      collection: collectionJson
    };
  }

  // -----------------------------
  // Core flows
  // -----------------------------
  async function startSession() {
    if (state.isLoading) return;

    const selectedId = venueSelectEl ? venueSelectEl.value : "";
    if (!selectedId) {
      updateStatus("Select a venue before starting.");
      return;
    }

    state.isLoading = true;
    updateStatus(`Starting session for filter_id=${selectedId}…`);

    clearSessionStorageKeys();

    const sessionId = generateSessionId();
    state.sessionId = sessionId;
    state.filterId = selectedId;

    try {
      const selectorRow = await fetchSelectorRowForFilter(selectedId);

      const indexObj = {
        session_id: sessionId,
        filter_id: selectedId,
        venue_name: venueSelectEl
          ? venueSelectEl.options[venueSelectEl.selectedIndex].text
          : null,
        created_at: new Date().toISOString(),
        payloads: {
          places: !!(selectorRow && selectorRow.places),
          collection: !!(selectorRow && selectorRow.collection)
        }
      };

      if (selectorRow && selectorRow.places) {
        sessionStorage.setItem(
          STORAGE_KEYS.places,
          JSON.stringify(selectorRow.places)
        );
      }
      if (selectorRow && selectorRow.collection) {
        sessionStorage.setItem(
          STORAGE_KEYS.collection,
          JSON.stringify(selectorRow.collection)
        );
      }
      sessionStorage.setItem(STORAGE_KEYS.index, JSON.stringify(indexObj));

      logConsole("Session index:", indexObj);
      appendLog(
        `Session ready. places=${indexObj.payloads.places}, collection=${indexObj.payloads.collection}`
      );
      updateStatus(
        `Session ready for ${indexObj.venue_name || selectedId}.`
      );
    } catch (err) {
      logConsole("Error in startSession:", err);
      updateStatus("Error loading selector-data. See console.");
      clearSessionStorageKeys();
      state.sessionId = null;
      state.filterId = null;
    } finally {
      state.isLoading = false;
    }
  }

  function restartSession() {
    appendLog("Restart requested.");
    startSession();
  }

  function sendSession() {
    appendLog("Send session clicked (no-op stub for now).");
    // Placeholder: here you would gather index + payloads and POST them
    // to your webhook/server when you're ready.
  }

  // -----------------------------
  // DOM + init
  // -----------------------------
  function initDomRefs() {
    venueSelectEl = document.getElementById("venue-select");
    btnStartEl = document.getElementById("session-start-btn");
    btnRestartEl = document.getElementById("session-restart-btn");
    btnSendEl = document.getElementById("session-send-btn");
    statusEl = document.getElementById("session-status");
    logEl = document.getElementById("session-log");
  }

  function populateVenueSelect() {
    if (!venueSelectEl) return;
    venueSelectEl.innerHTML = "";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Select a venue…";
    venueSelectEl.appendChild(defaultOpt);

    VENUE_OPTIONS.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.label} (${v.id})`;
      venueSelectEl.appendChild(opt);
    });
  }

  function bindEvents() {
    if (btnStartEl) {
      btnStartEl.addEventListener("click", startSession);
    }
    if (btnRestartEl) {
      btnRestartEl.addEventListener("click", restartSession);
    }
    if (btnSendEl) {
      btnSendEl.addEventListener("click", sendSession);
    }
  }

  function init() {
    initDomRefs();
    populateVenueSelect();
    bindEvents();
    appendLog("CRT Session Tool initialized.");
    updateStatus("Ready. Select a venue and start session.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

