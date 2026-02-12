import { loadAll } from "../js/dataLoader.js";

const APP_SLUG = "pellettap";
const KEY_PREFIX = `tapactive:${APP_SLUG}:`;
const STATE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const TIMESPANS = ["AM", "MD", "PM", "NC"];
const AMOUNTS = [0.5, 1, 1.5, 2, 2.5];

const state = {
  datasets: {
    horses: [],
    feed_items: [],
    profiles: [],
    locations: [],
  },
  todayKey: "",
  yyyymmdd: "",
  loadedFromCache: false,
  daily: null,
  activeView: "start",
  selectedHorseId: null,
  horseTab: "grain",
  selectedGrainId: null,
  selectedSuppId: null,
};

const views = {
  start: document.getElementById("view-start"),
  horses: document.getElementById("view-horses"),
  detail: document.getElementById("view-detail"),
  summary: document.getElementById("view-summary"),
  tools: document.getElementById("view-tools"),
};

const todayLabel = document.getElementById("todayLabel");

function getYyyymmdd(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function makeStateKey(yyyymmdd) {
  return `${KEY_PREFIX}${yyyymmdd}`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function emptyHorseState() {
  return {
    grains: {},
    supplements: {},
    hay: { AM: 0, MD: 0, PM: 0, NC: 0 },
  };
}

function createEmptyDaily(yyyymmdd) {
  return {
    app: APP_SLUG,
    yyyymmdd,
    saved_at: Date.now(),
    active_horse_ids: [],
    by_horse: {},
  };
}

function saveDaily() {
  state.daily.saved_at = Date.now();
  localStorage.setItem(state.todayKey, JSON.stringify(state.daily));
}

function purgeOldState() {
  const now = Date.now();
  const removeKeys = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;

    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      if (!parsed.saved_at || now - Number(parsed.saved_at) > STATE_TTL_MS) {
        removeKeys.push(key);
      }
    } catch {
      removeKeys.push(key);
    }
  }

  removeKeys.forEach((key) => localStorage.removeItem(key));
}

function loadDaily() {
  purgeOldState();
  const raw = localStorage.getItem(state.todayKey);
  if (!raw) {
    state.loadedFromCache = false;
    state.daily = createEmptyDaily(state.yyyymmdd);
    saveDaily();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.app === APP_SLUG && parsed?.yyyymmdd === state.yyyymmdd) {
      state.loadedFromCache = true;
      state.daily = {
        ...createEmptyDaily(state.yyyymmdd),
        ...parsed,
        active_horse_ids: Array.isArray(parsed.active_horse_ids) ? parsed.active_horse_ids : [],
        by_horse: parsed.by_horse && typeof parsed.by_horse === "object" ? parsed.by_horse : {},
      };
      return;
    }
  } catch {
    // fall through to empty state
  }

  state.loadedFromCache = false;
  state.daily = createEmptyDaily(state.yyyymmdd);
  saveDaily();
}

async function loadDatasetsFromBaseLoader() {
  const existingBaseTag = document.querySelector("base");
  const previousHref = existingBaseTag ? existingBaseTag.getAttribute("href") : null;

  if (!existingBaseTag) {
    const baseTag = document.createElement("base");
    baseTag.setAttribute("href", "../");
    document.head.prepend(baseTag);
  } else {
    existingBaseTag.setAttribute("href", "../");
  }

  try {
    const loaded = await loadAll();
    state.datasets.horses = Array.isArray(loaded.horses) ? loaded.horses : [];
    state.datasets.feed_items = Array.isArray(loaded.feed_items) ? loaded.feed_items : [];
    state.datasets.profiles = Array.isArray(loaded.profiles) ? loaded.profiles : [];
    state.datasets.locations = Array.isArray(loaded.locations) ? loaded.locations : [];
  } finally {
    const currentBaseTag = document.querySelector("base");
    if (currentBaseTag) {
      if (previousHref === null) {
        currentBaseTag.remove();
      } else {
        currentBaseTag.setAttribute("href", previousHref);
      }
    }
  }
}

function horseIdToKey(horseId) {
  return String(horseId);
}

function ensureHorse(horseId) {
  const key = horseIdToKey(horseId);
  if (!state.daily.by_horse[key]) {
    state.daily.by_horse[key] = emptyHorseState();
  }
  return state.daily.by_horse[key];
}

function toggleActiveHorse(horseId) {
  const list = state.daily.active_horse_ids;
  const idx = list.indexOf(horseId);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(horseId);
  }
  saveDaily();
  return idx < 0;
}

function isActiveHorse(horseId) {
  return state.daily.active_horse_ids.includes(horseId);
}

function getHorseLabel(horse) {
  return horse.display_name || horse.show_name || horse.barn_name || String(horse.horse_id);
}

function getFeedLabel(item) {
  return item.display_name || item.short_name || item.feed_item_id;
}

function getSortedActiveHorses() {
  return state.datasets.horses
    .filter((h) => h && h.active !== false)
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
}

function getGrains() {
  return state.datasets.feed_items
    .filter((item) => {
      const type = String(item.type || "").toLowerCase();
      return type.includes("grain") || (!type.includes("supp") && !type.includes("supplement"));
    })
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
}

function getSupplements() {
  return state.datasets.feed_items
    .filter((item) => {
      const type = String(item.type || "").toLowerCase();
      return type.includes("supp");
    })
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
}

function getGrainTimespanEntry(horseId, grainId, timespan) {
  const horseState = ensureHorse(horseId);
  if (!horseState.grains[grainId]) {
    horseState.grains[grainId] = { AM: null, MD: null, PM: null, NC: null };
  }
  if (!(timespan in horseState.grains[grainId])) {
    horseState.grains[grainId][timespan] = null;
  }
  return horseState.grains[grainId][timespan];
}

function setGrainAmount(horseId, grainId, timespan, amount, defaultUom) {
  const horseState = ensureHorse(horseId);
  if (!horseState.grains[grainId]) {
    horseState.grains[grainId] = { AM: null, MD: null, PM: null, NC: null };
  }

  const current = horseState.grains[grainId][timespan];
  if (current && Number(current.amount) === amount) {
    horseState.grains[grainId][timespan] = null;
  } else {
    horseState.grains[grainId][timespan] = {
      amount,
      uom: current?.uom || defaultUom || "scoop",
    };
  }
  saveDaily();
}

function setGrainUom(horseId, grainId, timespan, uom) {
  const horseState = ensureHorse(horseId);
  if (!horseState.grains[grainId]) {
    horseState.grains[grainId] = { AM: null, MD: null, PM: null, NC: null };
  }
  const current = horseState.grains[grainId][timespan];
  horseState.grains[grainId][timespan] = {
    amount: current?.amount ?? 1,
    uom,
  };
  saveDaily();
}

function toggleSuppTimespan(horseId, suppId, timespan) {
  const horseState = ensureHorse(horseId);
  const current = Array.isArray(horseState.supplements[suppId]) ? [...horseState.supplements[suppId]] : [];
  const idx = current.indexOf(timespan);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(timespan);
  }
  horseState.supplements[suppId] = current;
  saveDaily();
}

function setHayAmount(horseId, timespan, amount) {
  const horseState = ensureHorse(horseId);
  const current = Number(horseState.hay[timespan] || 0);
  horseState.hay[timespan] = current === amount ? 0 : amount;
  saveDaily();
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getHorseById(horseId) {
  return getSortedActiveHorses().find((horse) => horse.horse_id === horseId) || null;
}

function formatHorseSummary(horseId) {
  const horse = getHorseById(horseId);
  const horseState = ensureHorse(horseId);
  const grainItems = getGrains();
  const suppItems = getSupplements();

  const grainsHtml = grainItems
    .map((item) => {
      const grain = horseState.grains[item.feed_item_id];
      if (!grain) return "";
      const parts = TIMESPANS
        .map((span) => {
          const val = grain[span];
          if (!val) return "";
          return `${span} ${val.amount} ${val.uom}`;
        })
        .filter(Boolean);
      if (!parts.length) return "";
      return `<div><strong>${htmlEscape(getFeedLabel(item))}</strong>: ${htmlEscape(parts.join(" | "))}</div>`;
    })
    .filter(Boolean)
    .join("");

  const suppHtml = suppItems
    .map((item) => {
      const spans = Array.isArray(horseState.supplements[item.feed_item_id])
        ? horseState.supplements[item.feed_item_id]
        : [];
      if (!spans.length) return "";
      return `<div><strong>${htmlEscape(getFeedLabel(item))}</strong>: ${htmlEscape(spans.join(", "))}</div>`;
    })
    .filter(Boolean)
    .join("");

  const hayParts = TIMESPANS
    .map((span) => {
      const amount = Number(horseState.hay[span] || 0);
      if (!amount) return "";
      return `${span} ${amount} flake(s)`;
    })
    .filter(Boolean);

  const horseTitle = horse ? getHorseLabel(horse) : `Horse ${horseId}`;

  return `
    <div class="section-card">
      <h3>${htmlEscape(horseTitle)}</h3>
      <div class="meta">horse_id: ${htmlEscape(horseId)}</div>
      <div><strong>Grain</strong></div>
      ${grainsHtml || "<div class=\"meta\">No grain set.</div>"}
      <div style="margin-top:0.4rem;"><strong>Supplements</strong></div>
      ${suppHtml || "<div class=\"meta\">No supplements set.</div>"}
      <div style="margin-top:0.4rem;"><strong>Hay</strong></div>
      ${hayParts.length ? `<div>${htmlEscape(hayParts.join(" | "))}</div>` : "<div class=\"meta\">No hay set.</div>"}
    </div>
  `;
}

function formatToolsPayload() {
  const activeIds = state.daily.active_horse_ids;
  const horsesPayload = activeIds.map((horseId) => {
    return {
      horse_id: horseId,
      horse_label: getHorseLabel(getHorseById(horseId) || { horse_id: horseId }),
      data: clone(ensureHorse(horseId)),
    };
  });

  return {
    app: APP_SLUG,
    yyyymmdd: state.yyyymmdd,
    saved_at: state.daily.saved_at,
    active_horse_ids: [...state.daily.active_horse_ids],
    horses: horsesPayload,
  };
}

function setView(viewName) {
  state.activeView = viewName;
  views.start.hidden = viewName !== "start";
  views.horses.hidden = viewName !== "horses";
  views.detail.hidden = viewName !== "detail";
  views.summary.hidden = viewName !== "summary";
  views.tools.hidden = viewName !== "tools";

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("row--active", btn.dataset.view === viewName);
  });
}

function renderStart() {
  views.start.innerHTML = `
    <h2>Start</h2>
    <p class="meta">Create a new run or resume today's saved run.</p>
    <div class="stack">
      <button type="button" id="btn-new" class="row--tap">New</button>
      <button type="button" id="btn-resume" class="row--tap ${state.loadedFromCache ? "row--active" : ""}" ${state.loadedFromCache ? "" : "disabled"}>Resume</button>
    </div>
  `;

  document.getElementById("btn-new").addEventListener("click", () => {
    state.daily = createEmptyDaily(state.yyyymmdd);
    saveDaily();
    state.loadedFromCache = true;
    renderAll();
    setView("horses");
  });

  document.getElementById("btn-resume").addEventListener("click", () => {
    setView("horses");
  });
}

function renderHorses() {
  const horses = getSortedActiveHorses();
  const rows = horses
    .map((horse) => {
      const isActive = isActiveHorse(horse.horse_id);
      return `
        <button type="button" class="row--tap horse-row ${isActive ? "row--active" : ""}" data-horse-id="${htmlEscape(horse.horse_id)}">
          <div class="two-col">
            <span>${htmlEscape(getHorseLabel(horse))}</span>
            <span>${isActive ? "Active" : "Inactive"}</span>
          </div>
          <div class="meta">${htmlEscape(horse.barn_name || "")} ${horse.gender ? `| ${htmlEscape(horse.gender)}` : ""}</div>
        </button>
      `;
    })
    .join("");

  views.horses.innerHTML = `
    <h2>Horses</h2>
    <p class="meta">Tap a horse row to toggle active state and open detail.</p>
    <div class="stack">${rows || "<div class=\"meta\">No active horses dataset found.</div>"}</div>
  `;

  views.horses.querySelectorAll(".horse-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const horseId = Number(btn.dataset.horseId);
      const turnedOn = toggleActiveHorse(horseId);
      if (turnedOn) {
        btn.classList.add("row--active");
      } else {
        btn.classList.remove("row--active");
      }
      state.selectedHorseId = horseId;
      state.horseTab = "grain";
      state.selectedGrainId = null;
      state.selectedSuppId = null;
      renderDetail();
      setView("detail");
    });
  });
}

function renderGrainTab(horseId) {
  const grains = getGrains();
  const selectedGrainId = state.selectedGrainId || (grains[0] ? grains[0].feed_item_id : null);
  state.selectedGrainId = selectedGrainId;

  const list = grains
    .map((grain) => {
      const selected = grain.feed_item_id === selectedGrainId;
      return `<button type="button" class="row--tap grain-item ${selected ? "row--active" : ""}" data-grain-id="${htmlEscape(grain.feed_item_id)}">${htmlEscape(getFeedLabel(grain))}</button>`;
    })
    .join("");

  let detail = "<div class=\"meta\">Select a grain to set schedule.</div>";
  const grain = grains.find((g) => g.feed_item_id === selectedGrainId);
  if (grain) {
    const uoms = Array.isArray(grain.uoms) && grain.uoms.length
      ? grain.uoms
      : (grain.default_uom ? [grain.default_uom] : ["scoop", "cup"]);

    const timespanRows = TIMESPANS.map((span) => {
      const entry = getGrainTimespanEntry(horseId, grain.feed_item_id, span);
      const amountPills = AMOUNTS.map((amount) => {
        const active = entry && Number(entry.amount) === amount;
        return `<button type="button" class="pill amount-pill ${active ? "active" : ""}" data-grain-id="${htmlEscape(grain.feed_item_id)}" data-span="${span}" data-amount="${amount}">${amount}</button>`;
      }).join("");

      const uomPills = uoms.map((uom) => {
        const active = entry && entry.uom === uom;
        return `<button type="button" class="pill uom-pill ${active ? "active" : ""}" data-grain-id="${htmlEscape(grain.feed_item_id)}" data-span="${span}" data-uom="${htmlEscape(uom)}">${htmlEscape(uom)}</button>`;
      }).join("");

      return `
        <div class="section-card">
          <div><strong>${span}</strong></div>
          <div class="pills">${amountPills}</div>
          <div class="pills">${uomPills}</div>
        </div>
      `;
    }).join("");

    detail = `<div class="section-card"><h3>${htmlEscape(getFeedLabel(grain))}</h3></div>${timespanRows}`;
  }

  return `
    <div class="stack">
      <div class="section-card">
        <h3>Grains</h3>
        <div class="stack">${list || "<div class=\"meta\">No grain items.</div>"}</div>
      </div>
      ${detail}
    </div>
  `;
}

function renderSuppTab(horseId) {
  const supplements = getSupplements();
  const selectedSuppId = state.selectedSuppId || (supplements[0] ? supplements[0].feed_item_id : null);
  state.selectedSuppId = selectedSuppId;

  const list = supplements
    .map((supp) => {
      const selected = supp.feed_item_id === selectedSuppId;
      return `<button type="button" class="row--tap supp-item ${selected ? "row--active" : ""}" data-supp-id="${htmlEscape(supp.feed_item_id)}">${htmlEscape(getFeedLabel(supp))}</button>`;
    })
    .join("");

  let detail = "<div class=\"meta\">Select a supplement to set timespans.</div>";
  const supp = supplements.find((s) => s.feed_item_id === selectedSuppId);
  if (supp) {
    const horseState = ensureHorse(horseId);
    const selectedSpans = Array.isArray(horseState.supplements[supp.feed_item_id])
      ? horseState.supplements[supp.feed_item_id]
      : [];

    const spans = TIMESPANS.map((span) => {
      const active = selectedSpans.includes(span);
      return `<button type="button" class="pill supp-span-pill ${active ? "active" : ""}" data-supp-id="${htmlEscape(supp.feed_item_id)}" data-span="${span}">${span}</button>`;
    }).join("");

    detail = `
      <div class="section-card">
        <h3>${htmlEscape(getFeedLabel(supp))}</h3>
        <div class="pills">${spans}</div>
      </div>
    `;
  }

  return `
    <div class="stack">
      <div class="section-card">
        <h3>Supplements</h3>
        <div class="stack">${list || "<div class=\"meta\">No supplement items.</div>"}</div>
      </div>
      ${detail}
    </div>
  `;
}

function renderHayTab(horseId) {
  const horseState = ensureHorse(horseId);
  const rows = TIMESPANS.map((span) => {
    const value = Number(horseState.hay[span] || 0);
    const amountPills = AMOUNTS.map((amount) => {
      const active = value === amount;
      return `<button type="button" class="pill hay-pill ${active ? "active" : ""}" data-span="${span}" data-amount="${amount}">${amount}</button>`;
    }).join("");

    return `
      <div class="section-card">
        <div><strong>${span}</strong></div>
        <div class="pills">${amountPills}</div>
        <div class="meta">flake(s)</div>
      </div>
    `;
  }).join("");

  return `<div class="stack">${rows}</div>`;
}

function renderHorseDetailSummaryTab(horseId) {
  return formatHorseSummary(horseId);
}

function renderDetail() {
  const horse = getHorseById(state.selectedHorseId);
  if (!horse) {
    views.detail.innerHTML = `
      <h2>Horse Detail</h2>
      <p class="meta">Select a horse from Horses.</p>
      <button type="button" class="row--tap" id="detail-back">Back to Horses</button>
    `;
    document.getElementById("detail-back")?.addEventListener("click", () => setView("horses"));
    return;
  }

  const horseLabel = getHorseLabel(horse);
  let tabContent = "";
  if (state.horseTab === "grain") tabContent = renderGrainTab(horse.horse_id);
  if (state.horseTab === "supplements") tabContent = renderSuppTab(horse.horse_id);
  if (state.horseTab === "hay") tabContent = renderHayTab(horse.horse_id);
  if (state.horseTab === "summary") tabContent = renderHorseDetailSummaryTab(horse.horse_id);

  views.detail.innerHTML = `
    <div class="hide-print">
      <button type="button" class="row--tap" id="detail-back">Back to Horses</button>
    </div>
    <div class="section-card">
      <h2>${htmlEscape(horseLabel)}</h2>
      <div class="meta">barn: ${htmlEscape(horse.barn_name || "-")} | gender: ${htmlEscape(horse.gender || "-")} | horse_id: ${htmlEscape(horse.horse_id)}</div>
    </div>
    <div class="tabs">
      <button type="button" class="row--tap detail-tab ${state.horseTab === "grain" ? "row--active" : ""}" data-tab="grain">Grain</button>
      <button type="button" class="row--tap detail-tab ${state.horseTab === "supplements" ? "row--active" : ""}" data-tab="supplements">Supplements</button>
      <button type="button" class="row--tap detail-tab ${state.horseTab === "hay" ? "row--active" : ""}" data-tab="hay">Hay</button>
      <button type="button" class="row--tap detail-tab ${state.horseTab === "summary" ? "row--active" : ""}" data-tab="summary">Summary</button>
    </div>
    ${tabContent}
  `;

  document.getElementById("detail-back")?.addEventListener("click", () => {
    renderHorses();
    setView("horses");
  });

  views.detail.querySelectorAll(".detail-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.horseTab = btn.dataset.tab;
      renderDetail();
    });
  });

  views.detail.querySelectorAll(".grain-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedGrainId = btn.dataset.grainId;
      renderDetail();
    });
  });

  views.detail.querySelectorAll(".supp-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedSuppId = btn.dataset.suppId;
      renderDetail();
    });
  });

  views.detail.querySelectorAll(".amount-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const grainId = btn.dataset.grainId;
      const span = btn.dataset.span;
      const amount = Number(btn.dataset.amount);
      const grain = getGrains().find((item) => item.feed_item_id === grainId);
      setGrainAmount(horse.horse_id, grainId, span, amount, grain?.default_uom || "scoop");
      renderDetail();
      renderSummary();
    });
  });

  views.detail.querySelectorAll(".uom-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const grainId = btn.dataset.grainId;
      const span = btn.dataset.span;
      const uom = btn.dataset.uom;
      setGrainUom(horse.horse_id, grainId, span, uom);
      renderDetail();
      renderSummary();
    });
  });

  views.detail.querySelectorAll(".supp-span-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleSuppTimespan(horse.horse_id, btn.dataset.suppId, btn.dataset.span);
      renderDetail();
      renderSummary();
    });
  });

  views.detail.querySelectorAll(".hay-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      setHayAmount(horse.horse_id, btn.dataset.span, Number(btn.dataset.amount));
      renderDetail();
      renderSummary();
    });
  });
}

function renderSummary() {
  const activeIds = state.daily.active_horse_ids;
  const blocks = activeIds.map((horseId) => formatHorseSummary(horseId)).join("");

  views.summary.innerHTML = `
    <h2>Summary</h2>
    <div class="meta">All active horses for ${htmlEscape(state.yyyymmdd)}</div>
    <div>${blocks || "<div class=\"meta\">No active horses selected.</div>"}</div>
  `;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const box = document.createElement("textarea");
  box.value = text;
  document.body.appendChild(box);
  box.select();
  document.execCommand("copy");
  document.body.removeChild(box);
  return Promise.resolve();
}

function renderTools() {
  views.tools.innerHTML = `
    <h2>Tools</h2>
    <div class="stack tools-only">
      <button type="button" class="row--tap" id="tool-text">Text</button>
      <button type="button" class="row--tap" id="tool-print">Print</button>
      <button type="button" class="row--tap" id="tool-cloud">Save to Cloud</button>
      <button type="button" class="row--tap" id="tool-clear">Clear Today</button>
    </div>
  `;

  document.getElementById("tool-text").addEventListener("click", async () => {
    const payload = formatToolsPayload();
    await copyText(JSON.stringify(payload, null, 2));
  });

  document.getElementById("tool-print").addEventListener("click", () => {
    setView("summary");
    window.print();
  });

  document.getElementById("tool-cloud").addEventListener("click", () => {
    console.log("pellettap save-to-cloud payload", formatToolsPayload());
  });

  document.getElementById("tool-clear").addEventListener("click", () => {
    localStorage.removeItem(state.todayKey);
    state.daily = createEmptyDaily(state.yyyymmdd);
    saveDaily();
    state.loadedFromCache = false;
    state.selectedHorseId = null;
    renderAll();
    setView("start");
  });
}

function renderAll() {
  renderStart();
  renderHorses();
  renderDetail();
  renderSummary();
  renderTools();
}

function bindNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setView(btn.dataset.view);
      if (btn.dataset.view === "horses") renderHorses();
      if (btn.dataset.view === "summary") renderSummary();
      if (btn.dataset.view === "tools") renderTools();
      if (btn.dataset.view === "start") renderStart();
    });
  });
}

async function boot() {
  state.yyyymmdd = getYyyymmdd();
  state.todayKey = makeStateKey(state.yyyymmdd);

  todayLabel.textContent = `Date ${state.yyyymmdd}`;

  loadDaily();
  await loadDatasetsFromBaseLoader();

  const resolvedDbindexUrl = new URL("../data/dbindex.json", document.baseURI).toString();
  const datasetCounts = {
    horses: state.datasets.horses.length,
    feed_items: state.datasets.feed_items.length,
    profiles: state.datasets.profiles.length,
    locations: state.datasets.locations.length,
  };

  console.log("pellettap boot", {
    baseURI: document.baseURI,
    resolved_dbindex_url: resolvedDbindexUrl,
    dataset_counts: datasetCounts,
    state_key: state.todayKey,
    loaded_from_cache: state.loadedFromCache,
  });

  bindNav();
  renderAll();
  setView("start");
}

boot();
