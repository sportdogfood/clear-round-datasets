import { loadAll } from "../js/dataLoader.js";

const APP = "pellettap";
const KEY_PREFIX = `tapactive:${APP}:`;
const TTL_MS = 5 * 24 * 60 * 60 * 1000;
const TIMESPANS = ["AM", "MD", "PM", "NC"];
const AMOUNTS = [0.5, 1, 1.5, 2, 2.5];

const ui = {
  header: document.getElementById("appHeader"),
  main: document.getElementById("appMain"),
  dateLabel: document.getElementById("dateLabel"),
  views: {
    start: document.getElementById("view-start"),
    horses: document.getElementById("view-horses"),
    plan: document.getElementById("view-plan"),
    share: document.getElementById("view-share"),
  },
};

const state = {
  yyyymmdd: "",
  stateKey: "",
  loadedFromCache: false,
  datasets: { horses: [], feed_items: [] },
  daily: null,
  nav: "start",
  planTab: "feed",
  selectedHorseId: null,
  expandedGrainId: null,
  expandedSuppId: null,
  lastScrollTop: 0,
};

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}${m}${d}`;
}

function createDaily(yyyymmdd) {
  return {
    app: APP,
    yyyymmdd,
    saved_at: Date.now(),
    active_horse_ids: [],
    by_horse: {},
  };
}

function saveDaily() {
  state.daily.saved_at = Date.now();
  localStorage.setItem(state.stateKey, JSON.stringify(state.daily));
}

function purgeOldDailyState() {
  const now = Date.now();
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(KEY_PREFIX)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(k) || "{}");
      const ts = Number(parsed.saved_at || 0);
      if (!ts || now - ts > TTL_MS) keys.push(k);
    } catch {
      keys.push(k);
    }
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

function loadDaily() {
  purgeOldDailyState();
  const raw = localStorage.getItem(state.stateKey);
  if (!raw) {
    state.loadedFromCache = false;
    state.daily = createDaily(state.yyyymmdd);
    saveDaily();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.app === APP && parsed?.yyyymmdd === state.yyyymmdd) {
      state.loadedFromCache = true;
      state.daily = {
        ...createDaily(state.yyyymmdd),
        ...parsed,
        active_horse_ids: Array.isArray(parsed.active_horse_ids) ? parsed.active_horse_ids : [],
        by_horse: parsed.by_horse && typeof parsed.by_horse === "object" ? parsed.by_horse : {},
      };
      return;
    }
  } catch {
    // fallback below
  }

  state.loadedFromCache = false;
  state.daily = createDaily(state.yyyymmdd);
  saveDaily();
}

function ensureHorseState(horseId) {
  const key = String(horseId);
  if (!state.daily.by_horse[key]) {
    state.daily.by_horse[key] = {
      grains: {},
      supplements: {},
      hay: { AM: 0, MD: 0, PM: 0, NC: 0 },
    };
  }
  return state.daily.by_horse[key];
}

function isHorseActive(horseId) {
  return state.daily.active_horse_ids.includes(horseId);
}

function toggleHorseActive(horseId) {
  const idx = state.daily.active_horse_ids.indexOf(horseId);
  if (idx >= 0) state.daily.active_horse_ids.splice(idx, 1);
  else state.daily.active_horse_ids.push(horseId);
  saveDaily();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function horseLabel(horse) {
  return horse.display_name || horse.show_name || horse.barn_name || String(horse.horse_id);
}

function itemLabel(item) {
  return item.display_name || item.short_name || item.feed_item_id;
}

function getHorses() {
  return state.datasets.horses
    .filter((h) => h && h.active !== false)
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
}

function getHorse(horseId) {
  return getHorses().find((h) => h.horse_id === horseId) || null;
}

function getGrains() {
  return state.datasets.feed_items
    .filter((item) => String(item.type || "").toLowerCase() === "grain")
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
}

function getSupplements() {
  return state.datasets.feed_items
    .filter((item) => String(item.type || "").toLowerCase() === "supplement")
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
}

function setNav(nav) {
  state.nav = nav;
  Object.entries(ui.views).forEach(([name, el]) => {
    el.classList.toggle("hidden", name !== nav);
  });

  document.querySelectorAll("[data-nav]").forEach((btn) => {
    const active = btn.dataset.nav === nav;
    btn.classList.toggle("bottom-nav__item--active", active);
    btn.classList.toggle("row--active", active);
  });
}

function setPlanTab(tab) {
  state.planTab = tab;
}

function ensureSelectedHorse() {
  if (state.selectedHorseId && getHorse(state.selectedHorseId)) return;
  const active = state.daily.active_horse_ids.find((id) => getHorse(id));
  state.selectedHorseId = active || null;
}

function renderStart() {
  ui.views.start.innerHTML = `
    <article class="card">
      <h2 class="card__title">Start</h2>
      <div class="card__meta">Begin fresh or resume today's saved plan.</div>
      <div class="stack" style="margin-top:0.55rem;">
        <button type="button" class="row--tap" data-action="new-day">New</button>
        <button type="button" class="row--tap ${state.loadedFromCache ? "row--active" : ""}" data-action="resume-day">Resume</button>
      </div>
    </article>
  `;
}

function renderHorses() {
  const rows = getHorses().map((horse) => {
    const active = isHorseActive(horse.horse_id);
    return `
      <button type="button" class="row row--tap horse-row ${active ? "row--active" : ""}" data-horse-id="${escapeHtml(horse.horse_id)}">
        <span class="row__left">${escapeHtml(horseLabel(horse))}</span>
        <span class="row__mid">${escapeHtml(horse.barn_name || "")}</span>
        <span class="row__right">${active ? "On" : "Off"}</span>
      </button>
    `;
  }).join("");

  ui.views.horses.innerHTML = `
    <article class="card">
      <h2 class="card__title">Horses</h2>
      <div class="card__meta">Tap row to toggle active. Tap again still routes to plan.</div>
      <div class="horse-list" style="margin-top:0.55rem;">${rows || "<div class=\"card__meta\">No horses found.</div>"}</div>
    </article>
  `;
}

function grainState(horseId, grainId) {
  const horseState = ensureHorseState(horseId);
  if (!horseState.grains[grainId]) {
    horseState.grains[grainId] = { AM: null, MD: null, PM: null, NC: null };
  }
  return horseState.grains[grainId];
}

function toggleGrainAmount(horseId, grainId, span, amount, defaultUom) {
  const g = grainState(horseId, grainId);
  const current = g[span];
  if (current && Number(current.amount) === amount) g[span] = null;
  else g[span] = { amount, uom: current?.uom || defaultUom || "scoop" };
  saveDaily();
}

function setGrainUom(horseId, grainId, span, uom) {
  const g = grainState(horseId, grainId);
  const current = g[span];
  g[span] = { amount: current?.amount ?? 1, uom };
  saveDaily();
}

function toggleSuppSpan(horseId, suppId, span) {
  const horseState = ensureHorseState(horseId);
  const current = Array.isArray(horseState.supplements[suppId]) ? [...horseState.supplements[suppId]] : [];
  const idx = current.indexOf(span);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(span);
  horseState.supplements[suppId] = current;
  saveDaily();
}

function toggleHay(horseId, span, amount) {
  const horseState = ensureHorseState(horseId);
  const current = Number(horseState.hay[span] || 0);
  horseState.hay[span] = current === amount ? 0 : amount;
  saveDaily();
}

function renderFeedTab(horse) {
  const grains = getGrains();
  const horseState = ensureHorseState(horse.horse_id);

  return grains.map((grain) => {
    const grainId = grain.feed_item_id;
    const open = state.expandedGrainId === grainId;
    const uoms = Array.isArray(grain.uoms) && grain.uoms.length
      ? grain.uoms
      : (grain.default_uom ? [grain.default_uom] : ["cup", "scoop"]);

    const detail = !open
      ? ""
      : `
        <div class="inline-detail card card--dense">
          <div class="time-grid">
            ${TIMESPANS.map((span) => {
              const entry = grainState(horse.horse_id, grainId)[span];
              const amounts = AMOUNTS.map((amount) => {
                const active = entry && Number(entry.amount) === amount;
                return `<button type="button" class="row--tap pill ${active ? "row--active pill--active" : ""}" data-action="grain-amount" data-grain-id="${escapeHtml(grainId)}" data-span="${span}" data-amount="${amount}">${amount}</button>`;
              }).join("");
              const uomPills = uoms.map((uom) => {
                const active = entry && entry.uom === uom;
                return `<button type="button" class="row--tap pill ${active ? "row--active pill--active" : ""}" data-action="grain-uom" data-grain-id="${escapeHtml(grainId)}" data-span="${span}" data-uom="${escapeHtml(uom)}">${escapeHtml(uom)}</button>`;
              }).join("");
              return `
                <section class="time-block">
                  <div class="time-block__label">${span}</div>
                  <div class="time-block__body">
                    <div class="inline-actions">${amounts}</div>
                    <div class="inline-actions">${uomPills}</div>
                  </div>
                </section>
              `;
            }).join("")}
          </div>
        </div>
      `;

    const selectedCount = TIMESPANS.filter((s) => grainState(horse.horse_id, grainId)[s]).length;

    return `
      <article class="card card--dense">
        <button type="button" class="row row--tap ${open ? "row--active" : ""}" data-action="open-grain" data-grain-id="${escapeHtml(grainId)}">
          <span class="row__left">${escapeHtml(itemLabel(grain))}</span>
          <span class="row__right">${selectedCount ? `${selectedCount} set` : "open"}</span>
        </button>
        ${detail}
      </article>
    `;
  }).join("") || "<div class='card card--dense'><div class='card__meta'>No grain items.</div></div>";
}

function renderExtrasTab(horse) {
  const horseState = ensureHorseState(horse.horse_id);
  const supplements = getSupplements();

  const suppHtml = supplements.map((supp) => {
    const suppId = supp.feed_item_id;
    const open = state.expandedSuppId === suppId;
    const selectedSpans = Array.isArray(horseState.supplements[suppId]) ? horseState.supplements[suppId] : [];

    const detail = !open
      ? ""
      : `
        <div class="inline-detail card card--dense">
          <div class="inline-actions">
            ${TIMESPANS.map((span) => {
              const active = selectedSpans.includes(span);
              return `<button type="button" class="row--tap pill ${active ? "row--active pill--active" : ""}" data-action="supp-span" data-supp-id="${escapeHtml(suppId)}" data-span="${span}">${span}</button>`;
            }).join("")}
          </div>
        </div>
      `;

    return `
      <article class="card card--dense">
        <button type="button" class="row row--tap ${open ? "row--active" : ""}" data-action="open-supp" data-supp-id="${escapeHtml(suppId)}">
          <span class="row__left">${escapeHtml(itemLabel(supp))}</span>
          <span class="row__right">${selectedSpans.length ? `${selectedSpans.length} spans` : "open"}</span>
        </button>
        ${detail}
      </article>
    `;
  }).join("");

  const hay = TIMESPANS.map((span) => {
    const current = Number(horseState.hay[span] || 0);
    const amountButtons = AMOUNTS.map((amount) => {
      const active = current === amount;
      return `<button type="button" class="row--tap pill ${active ? "row--active pill--active" : ""}" data-action="hay-amount" data-span="${span}" data-amount="${amount}">${amount}</button>`;
    }).join("");

    return `
      <section class="time-block">
        <div class="time-block__label">${span}</div>
        <div class="time-block__body">
          <div class="inline-actions">${amountButtons}</div>
          <div class="chip">flakes</div>
        </div>
      </section>
    `;
  }).join("");

  return `
    <div class="extra-list">
      ${suppHtml || "<div class='card card--dense'><div class='card__meta'>No supplement items.</div></div>"}
      <article class="card">
        <h3 class="card__title">Hay</h3>
        <div class="card__meta">Hardcoded stage (not from dataset)</div>
        <div class="time-grid" style="margin-top:0.45rem;">${hay}</div>
      </article>
    </div>
  `;
}

function horseCardLines(horseId) {
  const horse = getHorse(horseId);
  const horseState = ensureHorseState(horseId);

  const grainLines = getGrains().map((grain) => {
    const g = horseState.grains[grain.feed_item_id];
    if (!g) return "";
    const spans = TIMESPANS.map((span) => (g[span] ? `${span} ${g[span].amount} ${g[span].uom}` : "")).filter(Boolean);
    if (!spans.length) return "";
    return `<div>${escapeHtml(itemLabel(grain))}: ${escapeHtml(spans.join(" | "))}</div>`;
  }).filter(Boolean).join("");

  const extraLines = getSupplements().map((supp) => {
    const spans = horseState.supplements[supp.feed_item_id] || [];
    if (!spans.length) return "";
    return `<div>${escapeHtml(itemLabel(supp))}: ${escapeHtml(spans.join(", "))}</div>`;
  }).filter(Boolean).join("");

  const haySpans = TIMESPANS.map((span) => {
    const a = Number(horseState.hay[span] || 0);
    return a ? `${span} ${a} flakes` : "";
  }).filter(Boolean);

  return `
    <article class="card card--dense">
      <div class="headline-row">
        <h3 class="card__title">${escapeHtml(horse ? horseLabel(horse) : String(horseId))}</h3>
        <span class="chip">${escapeHtml(String(horseId))}</span>
      </div>
      <div class="card__meta">Feed</div>
      ${grainLines || "<div class='meta-line'>No feed set.</div>"}
      <div class="card__meta" style="margin-top:0.35rem;">Extras</div>
      ${extraLines || "<div class='meta-line'>No extras set.</div>"}
      <div class="card__meta" style="margin-top:0.35rem;">Hay</div>
      ${haySpans.length ? `<div>${escapeHtml(haySpans.join(" | "))}</div>` : "<div class='meta-line'>No hay set.</div>"}
    </article>
  `;
}

function renderCardTab(horse) {
  return horseCardLines(horse.horse_id);
}

function renderPlan() {
  ensureSelectedHorse();
  const horse = state.selectedHorseId ? getHorse(state.selectedHorseId) : null;
  if (!horse) {
    ui.views.plan.innerHTML = `
      <article class="card">
        <h2 class="card__title">Plan</h2>
        <div class="card__meta">Select a horse from Horses to begin planning.</div>
      </article>
    `;
    return;
  }

  const horseMeta = `
    <article class="card">
      <h2 class="card__title">${escapeHtml(horseLabel(horse))}</h2>
      <div class="card__meta">
        barn ${escapeHtml(horse.barn_name || "-")} | gender ${escapeHtml(horse.gender || "-")} | color ${escapeHtml(horse.color || "-")}
      </div>
    </article>
  `;

  const tabHtml = `
    <div class="tabs">
      <button type="button" class="row--tap tab ${state.planTab === "feed" ? "row--active tab--active" : ""}" data-tab="feed">Feed</button>
      <button type="button" class="row--tap tab ${state.planTab === "extras" ? "row--active tab--active" : ""}" data-tab="extras">Extras</button>
      <button type="button" class="row--tap tab ${state.planTab === "card" ? "row--active tab--active" : ""}" data-tab="card">Card</button>
    </div>
  `;

  let body = "";
  if (state.planTab === "feed") body = `<section class="feed-list">${renderFeedTab(horse)}</section>`;
  if (state.planTab === "extras") body = renderExtrasTab(horse);
  if (state.planTab === "card") body = `<section class="summary-list">${renderCardTab(horse)}</section>`;

  ui.views.plan.innerHTML = `${horseMeta}${tabHtml}${body}`;
}

function sharePayload() {
  return {
    app: APP,
    yyyymmdd: state.yyyymmdd,
    horses: state.daily.active_horse_ids.map((horseId) => ({
      horse_id: horseId,
      selections: ensureHorseState(horseId),
    })),
  };
}

function renderShare() {
  const cards = state.daily.active_horse_ids.map((id) => horseCardLines(id)).join("");
  ui.views.share.innerHTML = `
    <article class="card">
      <h2 class="card__title">Share</h2>
      <div class="card__meta">Daily board for all active horses.</div>
      <div class="inline-actions" style="margin-top:0.45rem;">
        <button type="button" class="row--tap" data-action="copy-share">Copy text</button>
        <button type="button" class="row--tap" data-action="push-share">Push to cloud</button>
      </div>
    </article>
    <section class="summary-list">${cards || "<div class='card card--dense'><div class='card__meta'>No active horses yet.</div></div>"}</section>
  `;
}

function renderAll() {
  renderStart();
  renderHorses();
  renderPlan();
  renderShare();
  setNav(state.nav);
}

function bindHeaderAutoHide() {
  ui.main.addEventListener("scroll", () => {
    const y = ui.main.scrollTop;
    if (y > state.lastScrollTop + 8 && y > 24) {
      ui.header.classList.add("header--hidden");
    } else if (y < state.lastScrollTop - 8) {
      ui.header.classList.remove("header--hidden");
    }
    state.lastScrollTop = y;
  });
}

function withTapactiveRootBase(fn) {
  const baseTag = document.querySelector("base");
  const existingHref = baseTag ? baseTag.getAttribute("href") : null;
  let created = false;

  let activeBase = baseTag;
  if (!activeBase) {
    activeBase = document.createElement("base");
    document.head.prepend(activeBase);
    created = true;
  }

  activeBase.setAttribute("href", "../");

  return Promise.resolve(fn()).finally(() => {
    if (created) activeBase.remove();
    else if (existingHref === null) activeBase.removeAttribute("href");
    else activeBase.setAttribute("href", existingHref);
  });
}

async function loadDatasets() {
  const loaded = await withTapactiveRootBase(() => loadAll());
  state.datasets.horses = Array.isArray(loaded.horses) ? loaded.horses : [];
  state.datasets.feed_items = Array.isArray(loaded.feed_items) ? loaded.feed_items : [];
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
  return Promise.resolve();
}

function handleClick(event) {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.nav) {
    setNav(target.dataset.nav);
    return;
  }

  const action = target.dataset.action;
  if (!action) return;

  if (action === "new-day") {
    state.daily = createDaily(state.yyyymmdd);
    saveDaily();
    state.loadedFromCache = true;
    state.selectedHorseId = null;
    renderAll();
    setNav("horses");
    return;
  }

  if (action === "resume-day") {
    setNav("horses");
    return;
  }

  if (action === "open-grain") {
    const grainId = target.dataset.grainId;
    state.expandedGrainId = state.expandedGrainId === grainId ? null : grainId;
    renderPlan();
    return;
  }

  if (action === "grain-amount") {
    const grainId = target.dataset.grainId;
    const span = target.dataset.span;
    const amount = Number(target.dataset.amount);
    const grain = getGrains().find((g) => g.feed_item_id === grainId);
    toggleGrainAmount(state.selectedHorseId, grainId, span, amount, grain?.default_uom || "scoop");
    renderPlan();
    renderShare();
    return;
  }

  if (action === "grain-uom") {
    setGrainUom(state.selectedHorseId, target.dataset.grainId, target.dataset.span, target.dataset.uom);
    renderPlan();
    renderShare();
    return;
  }

  if (action === "open-supp") {
    const suppId = target.dataset.suppId;
    state.expandedSuppId = state.expandedSuppId === suppId ? null : suppId;
    renderPlan();
    return;
  }

  if (action === "supp-span") {
    toggleSuppSpan(state.selectedHorseId, target.dataset.suppId, target.dataset.span);
    renderPlan();
    renderShare();
    return;
  }

  if (action === "hay-amount") {
    toggleHay(state.selectedHorseId, target.dataset.span, Number(target.dataset.amount));
    renderPlan();
    renderShare();
    return;
  }

  if (action === "copy-share") {
    copyToClipboard(JSON.stringify(sharePayload(), null, 2));
    return;
  }

  if (action === "push-share") {
    console.log("pellettap push payload", sharePayload());
  }
}

function handleViewSpecificClick(event) {
  const horseRow = event.target.closest(".horse-row");
  if (horseRow) {
    const horseId = Number(horseRow.dataset.horseId);
    toggleHorseActive(horseId);
    state.selectedHorseId = horseId;
    if (state.planTab !== "feed") state.planTab = "feed";
    renderHorses();
    renderPlan();
    renderShare();
    setNav("plan");
    return;
  }

  const tabBtn = event.target.closest("[data-tab]");
  if (tabBtn) {
    setPlanTab(tabBtn.dataset.tab);
    renderPlan();
  }
}

async function boot() {
  state.yyyymmdd = todayKey();
  state.stateKey = `${KEY_PREFIX}${state.yyyymmdd}`;
  ui.dateLabel.textContent = state.yyyymmdd;

  loadDaily();
  await loadDatasets();

  bindHeaderAutoHide();
  renderAll();

  document.addEventListener("click", (event) => {
    handleClick(event);
    handleViewSpecificClick(event);
  });
}

boot();
