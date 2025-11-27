// /docs/session-tool/main.js

(function () {
  // -----------------------------
  // DOM references
  // -----------------------------
  const btnStartSession = document.getElementById("btn-start-session");
  const btnEndSession = document.getElementById("btn-end-session");
  const sessionStatus = document.getElementById("session-status");

  const filtersPanel = document.getElementById("filters-panel");
  const filterCompUuid = document.getElementById("filter-comp-uuid");
  const filterRating = document.getElementById("filter-rating");
  const filterName = document.getElementById("filter-name");
  const filterArchived = document.getElementById("filter-archived");
  const filterYear = document.getElementById("filter-year");
  const filterCity = document.getElementById("filter-city");
  const filterZone = document.getElementById("filter-zone");
  const filterState = document.getElementById("filter-state");
  const btnClearFilters = document.getElementById("btn-clear-filters");

  const resultsPanel = document.getElementById("results-panel");
  const seriesList = document.getElementById("series-list");

  const submitPanel = document.getElementById("submit-panel");
  const selectionSummary = document.getElementById("selection-summary");
  const btnSubmitSelection = document.getElementById("btn-submit-selection");

  const debugPanel = document.getElementById("debug-panel");
  const debugPayload = document.getElementById("debug-payload");

  // -----------------------------
  // State
  // -----------------------------
  /** @type {Array<Object>} */
  let allRows = [];

  /** Map<Base Key, seriesObject> */
  const seriesMap = new Map();

  const activeFilters = {
    compUuid: "",
    rating: "",
    name: "",
    archived: "all", // all | active | archived
    year: "",
    city: "",
    zone: "",
    state: ""
  };

  /** @type {null | {sessionId:string, startedAt:string, selectedBaseKeys:Set<string>}} */
  let currentSession = null;

  // -----------------------------
  // Helpers
  // -----------------------------
  function safeStr(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function toLower(v) {
    return safeStr(v).toLowerCase();
  }

  function isArchived(row) {
    const v = row["Archived"];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      return v.toLowerCase() === "true" || v.toLowerCase() === "yes";
    }
    return false;
  }

  function parseDate(text) {
    const s = safeStr(text).trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDateRange(startText, endText) {
    const s = safeStr(startText);
    const e = safeStr(endText);
    if (!s && !e) return "";
    if (s && e) return `${s} – ${e}`;
    return s || e;
  }

  function generateSessionId() {
    return (
      "sess-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // -----------------------------
  // Data loading & grouping
  // -----------------------------
  async function loadCompetitions() {
    try {
      const res = await fetch("./competitions.json", { cache: "no-cache" });
      if (!res.ok) {
        throw new Error("Failed to load competitions.json");
      }
      const data = await res.json();
      const rows = Array.isArray(data.rows) ? data.rows : [];
      allRows = rows;
      buildSeriesMap(rows);
      populateFilterOptions(rows);
    } catch (err) {
      console.error(err);
      sessionStatus.textContent = "Error loading competitions.json";
    }
  }

  function buildSeriesMap(rows) {
    seriesMap.clear();

    for (const row of rows) {
      const baseKey = safeStr(row["Base Key"]);
      if (!baseKey) continue;

      const baseName = safeStr(row["Base Name"]);
      const city = safeStr(row["City"]);
      const state = safeStr(row["State"]);
      const zone = row["Zone"];

      let series = seriesMap.get(baseKey);
      if (!series) {
        series = {
          baseKey,
          baseName,
          city,
          state,
          zone,
          legs: []
        };
        seriesMap.set(baseKey, series);
      }

      series.legs.push(row);
    }
  }

  function populateFilterOptions(rows) {
    const uuidSet = new Set();
    const yearSet = new Set();
    const zoneSet = new Set();
    const stateSet = new Set();

    for (const row of rows) {
      const cu = safeStr(row["Comp Uuid"]);
      if (cu) uuidSet.add(cu);

      const year = row["Comp Year"];
      if (year !== null && year !== undefined && year !== "") {
        yearSet.add(String(year));
      }

      const zone = row["Zone"];
      if (zone !== null && zone !== undefined && zone !== "") {
        zoneSet.add(String(zone));
      }

      const state = safeStr(row["State"]);
      if (state) stateSet.add(state);
    }

    function fillSelect(selectEl, values) {
      // keep first option (All), remove others
      while (selectEl.options.length > 1) {
        selectEl.remove(1);
      }
      const sorted = Array.from(values).sort();
      for (const val of sorted) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        selectEl.appendChild(opt);
      }
    }

    fillSelect(filterCompUuid, uuidSet);
    fillSelect(filterYear, yearSet);
    fillSelect(filterZone, zoneSet);
    fillSelect(filterState, stateSet);
  }

  // -----------------------------
  // Filtering
  // -----------------------------
  function rowMatchesFilters(row) {
    // Comp Uuid exact
    if (activeFilters.compUuid) {
      if (safeStr(row["Comp Uuid"]) !== activeFilters.compUuid) {
        return false;
      }
    }

    // Rating substring
    if (activeFilters.rating) {
      const needle = activeFilters.rating.toLowerCase();
      if (!toLower(row["Rating"]).includes(needle)) return false;
    }

    // Name (Name Orig + Base Name)
    if (activeFilters.name) {
      const needle = activeFilters.name.toLowerCase();
      const nameOrig = toLower(row["Name Orig"]);
      const baseName = toLower(row["Base Name"]);
      if (!nameOrig.includes(needle) && !baseName.includes(needle)) {
        return false;
      }
    }

    // Archived tri-state
    const archivedVal = isArchived(row);
    if (activeFilters.archived === "active" && archivedVal) return false;
    if (activeFilters.archived === "archived" && !archivedVal) return false;

    // Year (Comp Year)
    if (activeFilters.year) {
      const y = safeStr(row["Comp Year"]);
      if (y !== activeFilters.year) return false;
    }

    // City substring
    if (activeFilters.city) {
      const needle = activeFilters.city.toLowerCase();
      if (!toLower(row["City"]).includes(needle)) return false;
    }

    // Zone exact
    if (activeFilters.zone) {
      const z = safeStr(row["Zone"]);
      if (z !== activeFilters.zone) return false;
    }

    // State exact
    if (activeFilters.state) {
      const st = safeStr(row["State"]);
      if (st !== activeFilters.state) return false;
    }

    return true;
  }

  function getFilteredSeries() {
    const result = [];

    for (const series of seriesMap.values()) {
      const visibleLegs = series.legs.filter(rowMatchesFilters);
      if (!visibleLegs.length) continue;

      let minDate = null;
      let maxDate = null;

      for (const leg of visibleLegs) {
        const s = parseDate(leg["Start Date Text"]);
        const e = parseDate(leg["End Date Text"]);
        if (s && (!minDate || s < minDate)) minDate = s;
        if (e && (!maxDate || e > maxDate)) maxDate = e;
      }

      const visibleSeries = {
        baseKey: series.baseKey,
        baseName: series.baseName,
        city: series.city,
        state: series.state,
        zone: series.zone,
        legs: visibleLegs,
        legCount: visibleLegs.length,
        seriesStartText: visibleLegs.length
          ? safeStr(visibleLegs[0]["Start Date Text"])
          : "",
        seriesEndText: visibleLegs.length
          ? safeStr(visibleLegs[visibleLegs.length - 1]["End Date Text"])
          : "",
        minDate,
        maxDate
      };

      result.push(visibleSeries);
    }

    // Sort series list for stable display (by Base Name, then Base Key)
    result.sort((a, b) => {
      const an = a.baseName.toLowerCase();
      const bn = b.baseName.toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      const ak = a.baseKey.toLowerCase();
      const bk = b.baseKey.toLowerCase();
      if (ak < bk) return -1;
      if (ak > bk) return 1;
      return 0;
    });

    return result;
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  function renderSeriesList() {
    seriesList.innerHTML = "";

    if (!currentSession) {
      return;
    }

    const filteredSeries = getFilteredSeries();

    if (!filteredSeries.length) {
      const empty = document.createElement("p");
      empty.textContent = "No series match the current filters.";
      seriesList.appendChild(empty);
      updateSelectionSummary();
      return;
    }

    for (const series of filteredSeries) {
      const groupEl = document.createElement("article");
      groupEl.className = "series-group";
      groupEl.dataset.baseKey = series.baseKey;

      const headerEl = document.createElement("header");
      headerEl.className = "series-header";

      const titleEl = document.createElement("h3");
      titleEl.textContent = series.baseName || series.baseKey;
      headerEl.appendChild(titleEl);

      const metaEl = document.createElement("p");
      const parts = [];
      if (series.city || series.state) {
        parts.push([series.city, series.state].filter(Boolean).join(", "));
      }
      if (series.zone !== undefined && series.zone !== null && series.zone !== "") {
        parts.push(`Zone ${series.zone}`);
      }

      // series date range (from visible legs)
      const startText =
        series.minDate && series.legs.length
          ? safeStr(series.legs[0]["Start Date Text"])
          : "";
      const endText =
        series.minDate && series.legs.length
          ? safeStr(series.legs[series.legs.length - 1]["End Date Text"])
          : "";
      const dateRange = formatDateRange(startText, endText);
      if (dateRange) {
        parts.push(dateRange);
      }

      metaEl.textContent = parts.join(" • ");
      headerEl.appendChild(metaEl);

      const countEl = document.createElement("span");
      countEl.className = "series-leg-count";
      countEl.textContent = `${series.legCount} leg(s) shown`;
      headerEl.appendChild(countEl);

      // Select button
      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "btn-select-series";
      selectBtn.dataset.baseKey = series.baseKey;
      const isSelected =
        currentSession.selectedBaseKeys &&
        currentSession.selectedBaseKeys.has(series.baseKey);
      selectBtn.textContent = isSelected ? "Selected" : "Select this series";
      headerEl.appendChild(selectBtn);

      // Expand/collapse button
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn-toggle-legs";
      toggleBtn.textContent = "Show legs";
      headerEl.appendChild(toggleBtn);

      groupEl.appendChild(headerEl);

      // Legs container
      const legsContainer = document.createElement("div");
      legsContainer.className = "legs-container";
      legsContainer.hidden = true;

      const table = document.createElement("table");
      table.className = "legs-table";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");

      [
        "Leg Name",
        "Comp Uuid",
        "Comp Year",
        "Rating",
        "Start Date",
        "End Date",
        "Archived"
      ].forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      });

      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      for (const leg of series.legs) {
        const tr = document.createElement("tr");
        const archivedFlag = isArchived(leg);

        const cells = [
          safeStr(leg["Leg Name"] || leg["Name Orig"]),
          safeStr(leg["Comp Uuid"]),
          safeStr(leg["Comp Year"]),
          safeStr(leg["Rating"]),
          safeStr(leg["Start Date Text"]),
          safeStr(leg["End Date Text"]),
          archivedFlag ? "Yes" : "No"
        ];

        for (const value of cells) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        }

        if (archivedFlag) {
          tr.classList.add("leg-archived");
        }

        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      legsContainer.appendChild(table);
      groupEl.appendChild(legsContainer);

      // Selected style
      if (isSelected) {
        groupEl.classList.add("series-selected");
      }

      // Attach event handlers
      selectBtn.addEventListener("click", () => {
        handleToggleSeriesSelection(series.baseKey);
      });

      toggleBtn.addEventListener("click", () => {
        const isHidden = legsContainer.hidden;
        legsContainer.hidden = !isHidden;
        toggleBtn.textContent = isHidden ? "Hide legs" : "Show legs";
      });

      seriesList.appendChild(groupEl);
    }

    updateSelectionSummary();
  }

  function updateSelectionSummary() {
    const count =
      currentSession && currentSession.selectedBaseKeys
        ? currentSession.selectedBaseKeys.size
        : 0;

    if (!currentSession) {
      selectionSummary.textContent = "No active session.";
      btnSubmitSelection.disabled = true;
      return;
    }

    if (count === 0) {
      selectionSummary.textContent = "You haven’t selected any series yet.";
      btnSubmitSelection.disabled = true;
    } else {
      selectionSummary.textContent = `You’ve selected ${count} series.`;
      btnSubmitSelection.disabled = false;
    }
  }

  function handleToggleSeriesSelection(baseKey) {
    if (!currentSession) return;

    const set = currentSession.selectedBaseKeys;
    if (set.has(baseKey)) {
      set.delete(baseKey);
    } else {
      set.add(baseKey);
    }

    renderSeriesList();
  }

  // -----------------------------
  // Session controls
  // -----------------------------
  function startSession() {
    currentSession = {
      sessionId: generateSessionId(),
      startedAt: new Date().toISOString(),
      selectedBaseKeys: new Set()
    };

    sessionStatus.textContent = `Session active (${currentSession.sessionId})`;
    btnStartSession.disabled = true;
    btnEndSession.hidden = false;
    filtersPanel.hidden = false;
    resultsPanel.hidden = false;
    submitPanel.hidden = false;

    // Reset filters to defaults
    filterCompUuid.value = "";
    filterRating.value = "";
    filterName.value = "";
    filterArchived.value = "all";
    filterYear.value = "";
    filterCity.value = "";
    filterZone.value = "";
    filterState.value = "";

    activeFilters.compUuid = "";
    activeFilters.rating = "";
    activeFilters.name = "";
    activeFilters.archived = "all";
    activeFilters.year = "";
    activeFilters.city = "";
    activeFilters.zone = "";
    activeFilters.state = "";

    debugPanel.hidden = true;
    debugPayload.textContent = "";

    renderSeriesList();
  }

  function endSession() {
    currentSession = null;
    sessionStatus.textContent = "Session ended.";
    btnStartSession.disabled = false;
    btnEndSession.hidden = true;
    filtersPanel.hidden = true;
    resultsPanel.hidden = true;
    submitPanel.hidden = true;
    btnSubmitSelection.disabled = true;
  }

  // -----------------------------
  // Submit (debug to screen only)
  // -----------------------------
  function buildSubmitPayload() {
    if (!currentSession) return null;

    const selectedSeries = [];

    for (const baseKey of currentSession.selectedBaseKeys) {
      const series = seriesMap.get(baseKey);
      if (!series) continue;

      const legs = series.legs || [];
      if (!legs.length) continue;

      let minDate = null;
      let maxDate = null;
      const years = new Set();

      for (const leg of legs) {
        const s = parseDate(leg["Start Date Text"]);
        const e = parseDate(leg["End Date Text"]);
        if (s && (!minDate || s < minDate)) minDate = s;
        if (e && (!maxDate || e > maxDate)) maxDate = e;

        const y = leg["Comp Year"];
        if (y !== null && y !== undefined && y !== "") {
          years.add(String(y));
        }
      }

      const firstLeg = legs[0];

      selectedSeries.push({
        base_key: baseKey,
        base_name: safeStr(series.baseName),
        city: safeStr(series.city),
        state: safeStr(series.state),
        zone: series.zone,
        comp_years: Array.from(years),
        series_start_text: safeStr(firstLeg["Start Date Text"]),
        series_end_text: safeStr(legs[legs.length - 1]["End Date Text"]),
        leg_count: legs.length
      });
    }

    return {
      session_id: currentSession.sessionId,
      started_at: currentSession.startedAt,
      submitted_at: new Date().toISOString(),
      selected_series: selectedSeries
    };
  }

  function handleSubmitSelection() {
    if (!currentSession) return;
    const payload = buildSubmitPayload();
    if (!payload) return;

    debugPanel.hidden = false;
    debugPayload.textContent = JSON.stringify(payload, null, 2);

    // In this debug mode, we do NOT close the session or block resubmits.
    // Later, you can replace this with a POST + session lock.
  }

  // -----------------------------
  // Event binding
  // -----------------------------
  function bindEvents() {
    btnStartSession.addEventListener("click", startSession);
    btnEndSession.addEventListener("click", endSession);

    filterCompUuid.addEventListener("change", () => {
      activeFilters.compUuid = filterCompUuid.value.trim();
      renderSeriesList();
    });

    filterRating.addEventListener("input", () => {
      activeFilters.rating = filterRating.value.trim();
      renderSeriesList();
    });

    filterName.addEventListener("input", () => {
      activeFilters.name = filterName.value.trim();
      renderSeriesList();
    });

    filterArchived.addEventListener("change", () => {
      activeFilters.archived = filterArchived.value;
      renderSeriesList();
    });

    filterYear.addEventListener("change", () => {
      activeFilters.year = filterYear.value.trim();
      renderSeriesList();
    });

    filterCity.addEventListener("input", () => {
      activeFilters.city = filterCity.value.trim();
      renderSeriesList();
    });

    filterZone.addEventListener("change", () => {
      activeFilters.zone = filterZone.value.trim();
      renderSeriesList();
    });

    filterState.addEventListener("change", () => {
      activeFilters.state = filterState.value.trim();
      renderSeriesList();
    });

    btnClearFilters.addEventListener("click", () => {
      filterCompUuid.value = "";
      filterRating.value = "";
      filterName.value = "";
      filterArchived.value = "all";
      filterYear.value = "";
      filterCity.value = "";
      filterZone.value = "";
      filterState.value = "";

      activeFilters.compUuid = "";
      activeFilters.rating = "";
      activeFilters.name = "";
      activeFilters.archived = "all";
      activeFilters.year = "";
      activeFilters.city = "";
      activeFilters.zone = "";
      activeFilters.state = "";

      renderSeriesList();
    });

    btnSubmitSelection.addEventListener("click", handleSubmitSelection);
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    sessionStatus.textContent = "Loading competitions…";
    await loadCompetitions();
    sessionStatus.textContent = "Ready. Start a new session to begin.";
    bindEvents();
  }

  init();
})();
