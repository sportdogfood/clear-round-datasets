// app.js
// CRT Session Tool – selector-data (filter-key → places-json, collection-json)
// - User picks a venue (filter_id) from dropdown or enters it manually
// - On Start/Restart: fetch matching row from Rows selector table
// - Cache places + collection JSON in sessionStorage
// - Keep a small index for debugging and later use

(() => {
  // ------------------------------------------------
  // Config
  // ------------------------------------------------
  const ROWS_API_BASE = "https://api.rows.com/v1";
  const ROWS_API_KEY =
    window.CRT_ROWS_API_KEY ||
    "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

  // selector-data table: filter-key | places-json | collection-json | ...
  const SELECTOR_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
  const SELECTOR_TABLE_ID = "ac426c27-747f-44f7-a581-d856c7ac23d6";
  const SELECTOR_RANGE = "A2:C999";

  // sessionStorage keys we own
  const STORAGE_KEYS = {
    index: "crt_session_index",
    places: "crt_session_places",
    collection: "crt_session_collection"
  };

  // Simple in-memory state
  const state = {
    isLoading: false,
    sessionId: null,
    filterId: null
  };

  // ------------------------------------------------
  // DOM refs
  // ------------------------------------------------
  const filterSelect = document.getElementById("filter-select");
  const filterInput = document.getElementById("filter-id-input");

  const btnStart = document.getElementById("session-start-btn");
  const btnRestart = document.getElementById("session-restart-btn");
  const btnSend = document.getElementById("session-send-btn"); // not wired yet

  const statusEl = document.getElementById("session-status");
  const debugPre = document.getElementById("session-log");

  // ------------------------------------------------
  // Helpers
  // ------------------------------------------------
  function updateStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
    console.log("[CRT status]", msg);
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

  function safeJsonParse(maybeStr) {
    if (maybeStr == null || maybeStr === "") return null;
    if (typeof maybeStr !== "string") return null;
    try {
      return JSON.parse(maybeStr);
    } catch (err) {
      console.error("JSON parse error for string:", maybeStr.slice(0, 200), err);
      return null;
    }
  }

  function cellToString(cell) {
    if (cell == null) return "";
    const t = typeof cell;
    if (t === "string" || t === "number" || t === "boolean") {
      return String(cell);
    }
    if (t === "object") {
      // Try common shapes (guessing from typical spreadsheet APIs)
      if (cell.value != null) return String(cell.value);
      if (cell.formattedValue != null) return String(cell.formattedValue);
      if (cell.displayValue != null) return String(cell.displayValue);
      if (cell.formula != null) return String(cell.formula);
      try {
        return JSON.stringify(cell);
      } catch {
        return String(cell);
      }
    }
    return String(cell);
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
        JSON.stringify(indexObj, null, 2)
      );
    } catch (err) {
      console.error("Failed to write session index:", err);
    }
  }

  function showDebugSnapshot(indexObj, selectorResult) {
    if (!debugPre) return;
    const snapshot = {
      index: indexObj,
      selector_row: selectorResult
        ? {
            filter_id: selectorResult.filterId,
            places_present: !!selectorResult.places,
            collection_present: !!selectorResult.collection
          }
        : null
    };
    debugPre.textContent = JSON.stringify(snapshot, null, 2);
  }

  function getActiveFilterId() {
    const manual = (filterInput && filterInput.value.trim()) || "";
    if (manual) return manual;
    if (filterSelect && filterSelect.value) return filterSelect.value;
    return null;
  }

  // ------------------------------------------------
  // Rows selector fetch
  // ------------------------------------------------
  async function fetchSelectorRow(filterId) {
    const url = buildRowsUrl(
      SELECTOR_SHEET_ID,
      SELECTOR_TABLE_ID,
      SELECTOR_RANGE
    );
    console.log("[CRT] selector URL:", url);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ROWS_API_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`Rows selector GET failed (${res.status}): ${url}`);
    }

    const data = await res.json();
    console.log("[CRT] selector raw response:", data);

    const items = Array.isArray(data.items) ? data.items : [];
    console.log("[CRT] selector items length:", items.length);

    const target = String(filterId).trim();
    let match = null;

    for (const row of items) {
      if (!Array.isArray(row) || row.length === 0) continue;
      const rawKey = row[0];
      const keyStr = cellToString(rawKey).trim();
      console.log("[CRT] row key candidate:", keyStr, "raw:", rawKey);

      if (!keyStr) continue;

      // Allow exact match, or prefix/substring match for safeness
      if (
        keyStr === target ||
        keyStr.startsWith(target) ||
        target.startsWith(keyStr)
      ) {
        match = row;
        break;
      }
    }

    if (!match) {
      console.warn(
        "[CRT] No selector row match for filter_id",
        filterId,
        "candidates:",
        items.map((r) => cellToString(r && r[0]).trim())
      );
      return {
        filterId,
        places: null,
        collection: null,
        rawPlaces: null,
        rawCollection: null
      };
    }

    const placesCell = match.length > 1 ? match[1] : null;
    const collectionCell = match.length > 2 ? match[2] : null;

    const placesStr = cellToString(placesCell);
    const collectionStr = cellToString(collectionCell);

    console.log("[CRT] matched row for filter", filterId, {
      placesStrPreview: placesStr.slice(0, 120),
      collectionStrPreview: collectionStr.slice(0, 120)
    });

    const placesJson = safeJsonParse(placesStr);
    const collectionJson = safeJsonParse(collectionStr);

    return {
      filterId,
      places: placesJson,
      collection: collectionJson,
      rawPlaces: placesStr,
      rawCollection: collectionStr
    };
  }

  // ------------------------------------------------
  // Core flows
  // ------------------------------------------------
  async function startOrRestartSession() {
    if (state.isLoading) return;

    const filterId = getActiveFilterId();
    if (!filterId) {
      updateStatus("Select or enter a venue first.");
      return;
    }

    state.isLoading = true;
    updateStatus(`Loading selector row for ${filterId}…`);

    clearSessionStorageKeys();

    const sessionId = generateSessionId();
    let selectorResult = null;

    try {
      selectorResult = await fetchSelectorRow(filterId);

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

      if (!selectorResult.places && !selectorResult.collection) {
        updateStatus(
          `No JSON found for filter_id ${filterId}. Check console logs for selector rows.`
        );
      } else {
        updateStatus(
          `Session ready (${sessionId}). filter_id: ${filterId} – places: ${
            indexObj.payloads.places
          }, collection: ${indexObj.payloads.collection}`
        );
      }
    } catch (err) {
      console.error("Error starting session:", err);
      updateStatus("Error loading selector row. See console for details.");
      clearSessionStorageKeys();
      state.sessionId = null;
      state.filterId = null;
    } finally {
      state.isLoading = false;
    }
  }

  // ------------------------------------------------
  // Event wiring
  // ------------------------------------------------
  function bindEvents() {
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        startOrRestartSession();
      });
    }

    if (btnRestart) {
      btnRestart.addEventListener("click", () => {
        startOrRestartSession();
      });
    }

    if (btnSend) {
      btnSend.addEventListener("click", () => {
        console.log(
          "[CRT] Send session clicked. Implement webhook/runner POST here."
        );
        updateStatus("Send session: not wired yet (stub).");
      });
    }
  }

  function init() {
    if (!ROWS_API_KEY) {
      console.warn(
        "[CRT] ROWS_API_KEY is not set. Set window.CRT_ROWS_API_KEY or edit app.js."
      );
    }
    bindEvents();
    updateStatus("Ready. Pick a venue and start a session.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
