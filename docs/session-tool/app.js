// app.js
// CRT Session Tool – Selector table → sessionStorage
// --------------------------------------------------
// - User chooses a venue (filter-id) via dropdown or manual input
// - We fetch selector rows from Rows: filter-key | places-json | collection-json
// - We find the row whose first column matches filter-id
// - We store parsed JSONs into sessionStorage (places + collection)
// - We keep a small index object for quick inspection

(() => {
  // ------------------------------------------------
  // Config
  // ------------------------------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";

  // IMPORTANT: set this via window.CRT_ROWS_API_KEY or hardcode here
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  // selector-data table: filter-key | places-json | collection-json | ...
  const SELECTOR_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
  const SELECTOR_TABLE_ID = "ac426c27-747f-44f7-a581-d856c7ac23d6";
  const SELECTOR_RANGE = "A2:C999";

  // Hardcoded venue list for dropdown
  const VENUES = [
    { id: "6565", label: "Fox Lea" },
    { id: "177", label: "Devon" },
    { id: "276", label: "Hampton Classic" },
    { id: "497", label: "PA National Horse Show" },
    { id: "4993509", label: "WEF" },
    { id: "5388360", label: "WEC" },
    { id: "5692036", label: "WEC (alt)" },
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
    { id: "4880209", label: "HITS (generic)" },
    { id: "4624769", label: "USHJA" },
    { id: "5319183", label: "Split Rock" }
  ];

  // sessionStorage keys we own
  const STORAGE_KEYS = {
    index: "crt_session_index",
    places: "crt_session_places",
    collection: "crt_session_collection"
  };

  const state = {
    isLoading: false,
    sessionId: null,
    filterId: null
  };

  // ------------------------------------------------
  // DOM refs (support both older/newer IDs where possible)
  // ------------------------------------------------
  const btnStart =
    document.getElementById("session-start-btn") ||
    document.getElementById("btn-start-session");
  const btnRestart = document.getElementById("session-restart-btn");
  const btnSend = document.getElementById("session-send-btn");
  const btnEnd =
    document.getElementById("session-end-btn") ||
    document.getElementById("btn-end-session");

  const statusEl = document.getElementById("session-status");

  const debugPanel = document.getElementById("debug-panel") || null;
  const debugPre =
    document.getElementById("debug-payload") ||
    document.getElementById("session-log") ||
    null;

  const filterIdInput = document.getElementById("filter-id-input");
  const filterIdSelect = document.getElementById("filter-id-select");

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
    if (text == null) return null;
    if (typeof text !== "string") return text; // already parsed / non-string value
    try {
      return JSON.parse(text);
    } catch (err) {
      console.error("JSON parse error:", err, "for text:", text);
      return null;
    }
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

  function showDebugSnapshot(indexObj, selectorResult) {
    if (!debugPanel || !debugPre) return;
    debugPanel.hidden = false;

    const snapshot = {
      session_id: indexObj.session_id,
      filter_id: indexObj.filter_id,
      created_at: indexObj.created_at,
      payloads: indexObj.payloads,
      selector_row: selectorResult
        ? {
            filter_id: selectorResult.filterId,
            has_places: !!selectorResult.places,
            has_collection: !!selectorResult.collection,
            row_preview: selectorResult.rawRow
          }
        : null
    };

    debugPre.textContent = JSON.stringify(snapshot, null, 2);
  }

  function getSelectedFilterId() {
    const fromSelect =
      filterIdSelect && filterIdSelect.value
        ? String(filterIdSelect.value).trim()
        : "";
    const fromInput =
      filterIdInput && filterIdInput.value
        ? String(filterIdInput.value).trim()
        : "";
    const fid = fromSelect || fromInput;
    return fid || null;
  }

  // ------------------------------------------------
  // Rows fetch + troubleshooting
  // ------------------------------------------------
  async function fetchSelectorRow(filterId) {
    const url = buildRowsUrl(
      SELECTOR_SHEET_ID,
      SELECTOR_TABLE_ID,
      SELECTOR_RANGE
    );

    console.log("[CRT] Fetching selector row", { filterId, url });

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
    console.log("[CRT] Raw Rows response object keys:", Object.keys(data));

    // Support multiple possible shapes: items, values, data.rows...
    let rows = [];

    if (Array.isArray(data.items)) {
      rows = data.items;
      console.log("[CRT] Using data.items, row count:", rows.length);
    } else if (Array.isArray(data.values)) {
      rows = data.values;
      console.log("[CRT] Using data.values, row count:", rows.length);
    } else if (data.data && Array.isArray(data.data.rows)) {
      rows = data.data.rows.map((r) =>
        Array.isArray(r.cells)
          ? r.cells.map((c) => c.value)
          : []
      );
      console.log("[CRT] Using data.data.rows, row count:", rows.length);
    } else {
      console.warn("[CRT] No known rows field (items/values/data.rows) in Rows response.");
    }

    if (!rows.length) {
      console.warn("[CRT] No rows returned from selector table.");
      return null;
    }

    const fid = String(filterId).trim();
    const availableKeys = rows
      .map((r) => (r && r.length > 0 ? r[0] : null))
      .filter((k) => k != null)
      .map((k) => String(k).trim());

    console.log("[CRT] Available filter keys in first column:", availableKeys);

    let matchedRow = null;
    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const key = row[0];
      if (key == null) continue;
      const keyStr = String(key).trim();
      if (keyStr === fid) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      console.warn(
        "[CRT] No Rows row found for filter_id",
        fid,
        "Available keys:",
        availableKeys
      );
      return null;
    }

    console.log("[CRT] Matched row for filter_id", fid, "=>", matchedRow);

    const placesCell = matchedRow[1];
    const collectionCell = matchedRow[2];

    const placesParsed = safeJsonParse(placesCell);
    const collectionParsed = safeJsonParse(collectionCell);

    console.log("[CRT] Parsed cells:", {
      placesType: typeof placesCell,
      collectionType: typeof collectionCell,
      hasPlaces: !!placesParsed,
      hasCollection: !!collectionParsed
    });

    return {
      filterId: fid,
      places: placesParsed,
      collection: collectionParsed,
      rawRow: matchedRow
    };
  }

  // ------------------------------------------------
  // Core flows
  // ------------------------------------------------
  async function startNewSession() {
    if (state.isLoading) return;

    const filterId = getSelectedFilterId();
    if (!filterId) {
      updateStatus("Set Filter ID (input or dropdown) before starting.");
      console.warn("[CRT] No filterId provided.");
      return;
    }

    state.isLoading = true;
    updateStatus(`Loading Rows payloads for filter_id ${filterId}…`);

    clearSessionStorageKeys();

    const sessionId = generateSessionId();
    let selectorResult = null;

    try {
      selectorResult = await fetchSelectorRow(filterId);

      if (!selectorResult) {
        updateStatus(`No row found for filter_id ${filterId}. See console logs.`);
        state.sessionId = null;
        state.filterId = null;
        clearSessionStorageKeys();
        return;
      }

      if (selectorResult.places) {
        sessionStorage.setItem(
          STORAGE_KEYS.places,
          JSON.stringify(selectorResult.places)
        );
      }

      if (selectorResult.collection) {
        sessionStorage.setItem(
          STORAGE_KEYS.collection,
          JSON.stringify(selectorResult.collection)
        );
      }

      const indexObj = {
        session_id: sessionId,
        filter_id: filterId,
        created_at: new Date().toISOString(),
        payloads: {
          places: !!selectorResult.places,
          collection: !!selectorResult.collection
        }
      };

      state.sessionId = sessionId;
      state.filterId = filterId;

      writeIndexToStorage(indexObj);
      showDebugSnapshot(indexObj, selectorResult);

      updateStatus(
        `Session ready (${sessionId}). filter_id: ${filterId}`
      );
      console.log("[CRT] Session index:", indexObj);
    } catch (err) {
      console.error("Error starting session:", err);
      updateStatus("Error loading from Rows. See console for details.");
      clearSessionStorageKeys();
      state.sessionId = null;
      state.filterId = null;
    } finally {
      state.isLoading = false;
    }
  }

  function restartSession() {
    console.log("[CRT] Restart requested.");
    startNewSession();
  }

  function endSession() {
    console.log("[CRT] End session requested.");
    clearSessionStorageKeys();
    state.sessionId = null;
    state.filterId = null;
    updateStatus("Session cleared.");
    if (debugPanel && debugPre) {
      debugPanel.hidden = false;
      debugPre.textContent = JSON.stringify(
        {
          session_id: null,
          filter_id: null,
          payloads: { places: false, collection: false }
        },
        null,
        2
      );
    }
  }

  function sendSession() {
    try {
      const index = safeJsonParse(
        sessionStorage.getItem(STORAGE_KEYS.index) || "null"
      );
      const places = safeJsonParse(
        sessionStorage.getItem(STORAGE_KEYS.places) || "null"
      );
      const collection = safeJsonParse(
        sessionStorage.getItem(STORAGE_KEYS.collection) || "null"
      );

      console.log("[CRT] SEND SESSION STUB", {
        index,
        places,
        collection
      });

      updateStatus("Send stub executed. See console for payload.");
    } catch (err) {
      console.error("Error in sendSession stub:", err);
      updateStatus("Error while preparing send stub. See console.");
    }
  }

  // ------------------------------------------------
  // UI wiring
  // ------------------------------------------------
  function populateVenueSelect() {
    if (!filterIdSelect) return;

    // Only populate once
    if (filterIdSelect.dataset.crtPopulated === "1") return;

    filterIdSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a venue…";
    filterIdSelect.appendChild(placeholder);

    VENUES.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.label} (${v.id})`;
      filterIdSelect.appendChild(opt);
    });

    filterIdSelect.dataset.crtPopulated = "1";
  }

  function bindEvents() {
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        console.log("[CRT] Start clicked.");
        startNewSession();
      });
    } else {
      console.warn("Start button not found (session-start-btn / btn-start-session).");
    }

    if (btnRestart) {
      btnRestart.addEventListener("click", () => {
        console.log("[CRT] Restart clicked.");
        restartSession();
      });
    }

    if (btnEnd) {
      btnEnd.addEventListener("click", () => {
        endSession();
      });
    }

    if (btnSend) {
      btnSend.addEventListener("click", () => {
        sendSession();
      });
    }

    if (filterIdSelect && filterIdInput) {
      filterIdSelect.addEventListener("change", () => {
        if (filterIdSelect.value) {
          filterIdInput.value = filterIdSelect.value;
        }
      });
    }
  }

  function init() {
    if (!ROWS_API_KEY || ROWS_API_KEY === "REPLACE_WITH_ROWS_API_KEY") {
      console.warn(
        "[CRT] ROWS_API_KEY is not set. Set window.CRT_ROWS_API_KEY or edit app.js."
      );
    }
    populateVenueSelect();
    bindEvents();
    updateStatus("Ready. Choose a venue / filter ID, then Start session.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
