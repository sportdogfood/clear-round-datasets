// session-tool/app.js
// CRT Session Tool – desktop picker (competitions + destinations)
// Step 1: wire Start Session (Rows GET) and Send (Rows POST) with in-memory state.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  // READ endpoints (from your OpenAPI)
  const ROWS_API_BASE_READ = 'https://api.rows.com/v1';
  const COMPETITIONS_URL =
    ROWS_API_BASE_READ +
    '/spreadsheets/GqOwXTcrQ9u14dbdcTxWa/tables/18be0a0d-dbea-43ea-811f-f7bcbf4982d3/values/A2:B999';

  const DESTINATIONS_URL =
    ROWS_API_BASE_READ +
    '/spreadsheets/GqOwXTcrQ9u14dbdcTxWa/tables/52d0a628-4e75-4b93-8acd-121a5e860e2e/values/A2:B999';

  // WRITE endpoint (append)
  // A:E, table_id 07cf8adf-604f-452b-a2f7-494b5fea0c2e
  const ROWS_API_BASE_WRITE = 'https://api.rows.com/v1beta1';
  const SUBMIT_URL =
    ROWS_API_BASE_WRITE +
    '/spreadsheets/GqOwXTcrQ9u14dbdcTxWa/tables/07cf8adf-604f-452b-a2f7-494b5fea0c2e/values/A:E:append';

  // TODO: replace with your real token (read+append for these tables only)
  const ROWS_API_KEY = 'rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const state = {
    session: {
      sessionId: null,
      mode: 'top',
      startedAt: null,
      submittedAt: null,
      creationId: null // from rows.items[0][0]
    },
    // Raw payloads from Rows (items[0][1] parsed)
    raw: {
      competitions: null,
      destinations: null
    },
    // UI models (what tables will actually render)
    model: {
      series: [],      // competitions grouped by series_key
      stay: [],        // flat rows
      dine: [],
      essentials: []
    },
    // Selection that will be POSTed
    selection: {
      seriesKeys: [],  // ['2025-esp-october-wef-wellington', ...]
      zoom: {
        enabled: false,
        seriesKey: null,
        compUuid: null
      },
      destinations: {
        stay: {
          list: [],    // [{ place_id, key2 }]
          feature: []
        },
        dine: {
          list: [],
          feature: []
        },
        essentials: {
          list: [],
          feature: []  // always empty in your rules, but kept for schema stability
        }
      }
    },
    submitted: false
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function nowIso() {
    return new Date().toISOString();
  }

  function generateSessionId() {
    // Simple unique-enough ID for this context
    return 'sess-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function parseYearFromDateText(dateText) {
    // Expecting MM/DD/YYYY; be defensive.
    if (!dateText || typeof dateText !== 'string') return null;
    const parts = dateText.split('/');
    const yearPart = parts[2] || parts[0] || '';
    const year = parseInt(yearPart, 10);
    return Number.isFinite(year) ? year : null;
  }

  function toComparableDate(dateText) {
    // For sorting min/max; fall back to dateText string.
    if (!dateText || typeof dateText !== 'string') return dateText || '';
    // Let Date parse US-style MM/DD/YYYY; we only use it to compare.
    const t = Date.parse(dateText);
    return Number.isFinite(t) ? t : dateText;
  }

  // ---------------------------------------------------------------------------
  // Rows API helpers
  // ---------------------------------------------------------------------------

  async function rowsGetValues(url) {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + ROWS_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error('Rows GET failed: ' + resp.status + ' ' + resp.statusText + ' ' + text);
    }

    const json = await resp.json();
    if (!json.items || !Array.isArray(json.items) || json.items.length === 0) {
      throw new Error('Rows GET returned no items');
    }

    const firstRow = json.items[0];
    const creationId = firstRow[0];
    const payloadString = firstRow[1];

    if (typeof payloadString !== 'string') {
      throw new Error('Expected payload_json_string in items[0][1]');
    }

    let payload;
    try {
      payload = JSON.parse(payloadString);
    } catch (e) {
      throw new Error('Failed to parse payload JSON from Rows: ' + e.message);
    }

    return { creationId, payload };
  }

  async function rowsAppendSubmitRow(valueRow) {
    // valueRow is: [session_id, mode, submitted_at, creation_id, payload_json]
    const body = JSON.stringify({ values: [valueRow] });

    const resp = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + ROWS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body
    });

    if (!resp.ok && resp.status !== 202) {
      const text = await resp.text().catch(() => '');
      throw new Error('Rows append failed: ' + resp.status + ' ' + resp.statusText + ' ' + text);
    }

    // Rows append typically returns 202; ignore body.
    return true;
  }

  // ---------------------------------------------------------------------------
  // Model builders
  // ---------------------------------------------------------------------------

  function buildCompetitionsModel(rawPayload) {
    // rawPayload expected shape:
    // { meta: {...}, rows: [ { 'Comp Uuid': ..., 'Base Key': ..., 'Base Name': ..., ... }, ... ] }
    if (!rawPayload || !Array.isArray(rawPayload.rows)) {
      console.warn('buildCompetitionsModel: no rows found');
      return [];
    }

    const seriesMap = new Map();

    for (const row of rawPayload.rows) {
      const baseKey = row['Base Key'];
      const baseName = row['Base Name'];
      const startDateText = row['Start Date Text'];
      if (!baseKey || !startDateText) continue;

      const startYear = parseYearFromDateText(startDateText);
      const seriesKey = (startYear ? String(startYear) : 'unknown') + '-' + baseKey;

      let series = seriesMap.get(seriesKey);
      if (!series) {
        series = {
          seriesKey,
          baseKey,
          baseName: baseName || '',
          zone: row['Zone'] ?? null,
          compMgtId: row['Comp Mgt ID'] ?? null,
          startYear,
          legs: []
        };
        seriesMap.set(seriesKey, series);
      }

      const leg = {
        compUuid: row['Comp Uuid'] || null,
        legName: row['Leg Name'] || '',
        nameOrig: row['Name Orig'] || '',
        compYear: row['Comp Year'] ?? null,
        city: row['City'] || '',
        state: row['State'] || '',
        startDateText: row['Start Date Text'] || '',
        endDateText: row['End Date Text'] || '',
        zone: row['Zone'] ?? null,
        compMgtId: row['Comp Mgt ID'] ?? null,
        rating: row['Rating'] || '',
        linkId: row['Link ID'] || '',
        ordinalNumber: row['Ordinal Number'] ?? null,
        archived: !!row['Archived'],
        legKey: row['Leg Key'] || '',
        legUuid: row['Leg Uuid'] || ''
      };

      series.legs.push(leg);
    }

    const seriesList = [];

    for (const series of seriesMap.values()) {
      // Sort legs: ordinalNumber asc, then startDateText, then compUuid.
      series.legs.sort((a, b) => {
        const ao = a.ordinalNumber ?? Number.POSITIVE_INFINITY;
        const bo = b.ordinalNumber ?? Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;

        const ad = toComparableDate(a.startDateText);
        const bd = toComparableDate(b.startDateText);
        if (ad < bd) return -1;
        if (ad > bd) return 1;

        if (a.compUuid < b.compUuid) return -1;
        if (a.compUuid > b.compUuid) return 1;
        return 0;
      });

      const startVals = series.legs.map(l => l.startDateText).filter(Boolean);
      const endVals = series.legs.map(l => l.endDateText).filter(Boolean);

      let seriesStart = null;
      let seriesEnd = null;

      if (startVals.length) {
        seriesStart = startVals.slice().sort((a, b) => {
          const ad = toComparableDate(a);
          const bd = toComparableDate(b);
          return ad < bd ? -1 : ad > bd ? 1 : 0;
        })[0];
      }

      if (endVals.length) {
        seriesEnd = endVals.slice().sort((a, b) => {
          const ad = toComparableDate(a);
          const bd = toComparableDate(b);
          return ad < bd ? 1 : ad > bd ? -1 : 0;
        })[0];
      }

      series.seriesStartDateText = seriesStart;
      series.seriesEndDateText = seriesEnd;
      series.legCount = series.legs.length;

      seriesList.push(series);
    }

    // Sort series list by startYear then baseName.
    seriesList.sort((a, b) => {
      const ay = a.startYear ?? 0;
      const by = b.startYear ?? 0;
      if (ay !== by) return ay - by;
      if (a.baseName < b.baseName) return -1;
      if (a.baseName > b.baseName) return 1;
      return 0;
    });

    return seriesList;
  }

  function buildDestinationsModel(rawPayload) {
    // Placeholder split: keep everything in one pool for now.
    // Next step we will actually route rows to stay/dine/essentials by Vertical Lane / Dine Lane.
    if (!rawPayload || !Array.isArray(rawPayload.rows)) {
      console.warn('buildDestinationsModel: no rows found');
      return {
        stay: [],
        dine: [],
        essentials: []
      };
    }

    const stay = [];
    const dine = [];
    const essentials = [];

    for (const row of rawPayload.rows) {
      const placeId = row['Place Id'] || row['PlaceId'] || null;
      const key2 = row['Key2'] || null;

      const base = {
        place_id: placeId,
        key2: key2,
        name: row['Name'] || row['Name2'] || '',
        website: row['Website'] || '',
        rating: row['Rating'] ?? null,
        topRated: !!row['Top Rated'],
        distanceBucket: row['Distance Bucket'] || '',
        distanceText: row['Distance Text'] || '',
        durationText: row['Duration Text'] || '',
        label: row['Label'] || '',
        entity: row['Entity'] || '',
        type: row['Type'] || '',
        priceBand: row['Price Band'] || '',
        allTypes: row['All Types'] || '',
        chain: row['Chain'] || '',
        parentChain: row['Parent Chain'] || '',
        entityType: row['Entity Type'] || '',
        menu: row['Menu'] || '',
        venueUid: row['Venue Uid'] || row['Venue Uid Corrected'] || '',
        editorialOverview: row['Editorial Overview'] || '',
        attrAcronyms: row['Attr Acronyms'] || '',
        nation: row['Nation'] || '',
        dineLane: row['Dine Lane'] || '',
        verticalLane: row['Vertical Lane'] || ''
      };

      // For now, just push everything into all three arrays as a stub.
      // In the next step we will route based on verticalLane/dineLane.
      stay.push(Object.assign({ lane: 'stay' }, base));
      dine.push(Object.assign({ lane: 'dine' }, base));
      essentials.push(Object.assign({ lane: 'essentials' }, base));
    }

    return { stay, dine, essentials };
  }

  function resetSelection() {
    state.selection.seriesKeys = [];
    state.selection.zoom = {
      enabled: false,
      seriesKey: null,
      compUuid: null
    };
    state.selection.destinations = {
      stay: { list: [], feature: [] },
      dine: { list: [], feature: [] },
      essentials: { list: [], feature: [] }
    };
  }

  function resetSessionState() {
    state.session.sessionId = generateSessionId();
    state.session.mode = 'top';
    state.session.startedAt = nowIso();
    state.session.submittedAt = null;
    state.session.creationId = null;

    state.raw.competitions = null;
    state.raw.destinations = null;

    state.model.series = [];
    state.model.stay = [];
    state.model.dine = [];
    state.model.essentials = [];

    resetSelection();
    state.submitted = false;
  }

  // ---------------------------------------------------------------------------
  // Start Session / Send
  // ---------------------------------------------------------------------------

  async function startSession() {
    if (state.submitted === false && state.session.sessionId) {
      // Optional: confirm discard of in-progress session.
      console.info('Starting new session; discarding previous in-memory state.');
    }

    resetSessionState();

    try {
      // 1) competitions
      const compResult = await rowsGetValues(COMPETITIONS_URL);
      state.session.creationId = compResult.creationId;
      state.raw.competitions = compResult.payload;
      state.model.series = buildCompetitionsModel(compResult.payload);

      // 2) destinations
      const destResult = await rowsGetValues(DESTINATIONS_URL);
      state.raw.destinations = destResult.payload;

      const destModel = buildDestinationsModel(destResult.payload);
      state.model.stay = destModel.stay;
      state.model.dine = destModel.dine;
      state.model.essentials = destModel.essentials;

      // At this point the UI can render competitions + destinations.
      console.info('[session-tool] Start Session complete', {
        sessionId: state.session.sessionId,
        creationId: state.session.creationId,
        seriesCount: state.model.series.length,
        stayCount: state.model.stay.length,
        dineCount: state.model.dine.length,
        essentialsCount: state.model.essentials.length
      });

      // TODO: call a render() function here once the HTML structure is defined.
    } catch (err) {
      console.error('[session-tool] Start Session failed:', err);
      // TODO: surface a human-friendly error message in the UI.
    }
  }

  function buildSubmitPayloadObject() {
    return {
      session: {
        session_id: state.session.sessionId,
        mode: state.session.mode,
        started_at: state.session.startedAt,
        submitted_at: state.session.submittedAt
      },
      dataset: {
        source: 'rows-competition+destinations',
        version: 'v1',
        generated_at: state.session.startedAt
      },
      selection: {
        series_keys: state.selection.seriesKeys.slice(),
        zoom: {
          enabled: state.selection.zoom.enabled,
          series_key: state.selection.zoom.seriesKey,
          comp_uuid: state.selection.zoom.compUuid
        },
        destinations: {
          stay: {
            list: state.selection.destinations.stay.list.map(x => ({
              place_id: x.place_id,
              key2: x.key2
            })),
            feature: state.selection.destinations.stay.feature.map(x => ({
              place_id: x.place_id,
              key2: x.key2
            }))
          },
          dine: {
            list: state.selection.destinations.dine.list.map(x => ({
              place_id: x.place_id,
              key2: x.key2
            })),
            feature: state.selection.destinations.dine.feature.map(x => ({
              place_id: x.place_id,
              key2: x.key2
            }))
          },
          essentials: {
            list: state.selection.destinations.essentials.list.map(x => ({
              place_id: x.place_id,
              key2: x.key2
            })),
            feature: state.selection.destinations.essentials.feature.map(x => ({
              place_id: x.place_id,
              key2: x.key2
            }))
          }
        }
      }
    };
  }

  async function sendSession() {
    if (!state.session.sessionId || !state.session.startedAt) {
      console.warn('[session-tool] Cannot send: session not started');
      return;
    }
    if (state.submitted) {
      console.warn('[session-tool] This session was already submitted');
      return;
    }

    // NOTE: validation of selection (zoom vs multi, lane counts, etc.)
    // will be added in the next step before we build the payload.

    state.session.submittedAt = nowIso();
    const payloadObject = buildSubmitPayloadObject();
    const payloadJsonString = JSON.stringify(payloadObject);

    const row = [
      state.session.sessionId,
      state.session.mode,
      state.session.submittedAt,
      state.session.creationId || '',
      payloadJsonString
    ];

    try {
      await rowsAppendSubmitRow(row);
      state.submitted = true;
      console.info('[session-tool] Session submitted successfully', {
        sessionId: state.session.sessionId
      });
      // TODO: Show a "submitted" state in the UI and disable Send until new Start.
    } catch (err) {
      console.error('[session-tool] Send failed:', err);
      // TODO: surface error to user.
      state.session.submittedAt = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring to DOM controls (IDs to be used in index.html)
  // ---------------------------------------------------------------------------

  function bindUi() {
    const startBtn = document.getElementById('session-start-btn');
    const restartBtn = document.getElementById('session-restart-btn');
    const sendBtn = document.getElementById('session-send-btn');

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        startSession();
      });
    }

    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        startSession();
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        sendSession();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', bindUi);
})();
