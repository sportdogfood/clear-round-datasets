import { loadAll } from "../js/dataLoader.js";
import {
  Card,
  HorseCard,
  PeakStrip,
  Pills,
  RowTap,
  Tabs,
  TimespanColumn,
  escapeHtml,
} from "../js/ui/components.js";

const KIT_VARIANT = "A"; // switch to "B" for legacy-inspired style
const APP_SLUG = "pellettap";
const KEY_PREFIX = `tapactive:${APP_SLUG}:`;
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
  nav: document.querySelector(".bottom-nav"),
};

const state = {
  yyyymmdd: "",
  stateKey: "",
  loadedFromCache: false,
  hadSavedState: false,
  datasets: { horses: [], feed_items: [] },
  daily: null,
  nav: "start",
  planMode: "list", // list | detail
  planTab: "feed",
  selectedHorseId: null,
  expandedGrainByHorse: {},
  expandedSuppByHorse: {},
  lastScrollTop: 0,
};

function yyyymmdd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function createDaily(dayKey) {
  return {
    app: APP_SLUG,
    yyyymmdd: dayKey,
    saved_at: Date.now(),
    active_horse_ids: [],
    by_horse: {},
  };
}

function saveDaily() {
  state.daily.saved_at = Date.now();
  localStorage.setItem(state.stateKey, JSON.stringify(state.daily));
}

function purgeOldState() {
  const now = Date.now();
  const stale = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(KEY_PREFIX)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(k) || "{}");
      if (!parsed.saved_at || now - Number(parsed.saved_at) > TTL_MS) stale.push(k);
    } catch {
      stale.push(k);
    }
  }
  stale.forEach((k) => localStorage.removeItem(k));
}

function loadDaily() {
  purgeOldState();
  const raw = localStorage.getItem(state.stateKey);
  if (!raw) {
    state.loadedFromCache = false;
    state.hadSavedState = false;
    state.daily = createDaily(state.yyyymmdd);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.app === APP_SLUG && parsed?.yyyymmdd === state.yyyymmdd) {
      state.loadedFromCache = true;
      state.hadSavedState = true;
      state.daily = {
        ...createDaily(state.yyyymmdd),
        ...parsed,
        active_horse_ids: Array.isArray(parsed.active_horse_ids) ? parsed.active_horse_ids : [],
        by_horse: parsed.by_horse && typeof parsed.by_horse === "object" ? parsed.by_horse : {},
      };
      return;
    }
  } catch {
    // fall through
  }

  state.loadedFromCache = false;
  state.hadSavedState = false;
  state.daily = createDaily(state.yyyymmdd);
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

function getHorseLabel(horse) {
  return horse.display_name || horse.show_name || horse.barn_name || String(horse.horse_id);
}

function getHorseInitial(horse) {
  return getHorseLabel(horse).trim().slice(0, 1).toUpperCase();
}

function getFeedLabel(item) {
  return item.display_name || item.short_name || item.feed_item_id;
}

function getHorses() {
  return state.datasets.horses
    .filter((h) => h && h.active !== false)
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999));
}

function getHorseById(horseId) {
  return getHorses().find((h) => h.horse_id === horseId) || null;
}

function getActiveHorseIds() {
  const horses = getHorses();
  if (!state.daily.active_horse_ids.length) return horses.map((h) => h.horse_id);
  return state.daily.active_horse_ids.filter((id) => getHorseById(id));
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

function ensureAutoActivatedOnFirstLoad() {
  if (state.hadSavedState) return;
  const allIds = getHorses().map((h) => h.horse_id);
  state.daily.active_horse_ids = allIds;
  if (!state.selectedHorseId && allIds.length) state.selectedHorseId = allIds[0];
  saveDaily();
}

function toDatasetRootLoad(loadFn) {
  const existingBase = document.querySelector("base");
  const oldHref = existingBase ? existingBase.getAttribute("href") : null;
  let created = false;
  let baseTag = existingBase;

  if (!baseTag) {
    baseTag = document.createElement("base");
    document.head.prepend(baseTag);
    created = true;
  }
  baseTag.setAttribute("href", "../");

  return Promise.resolve(loadFn()).finally(() => {
    if (created) baseTag.remove();
    else if (oldHref == null) baseTag.removeAttribute("href");
    else baseTag.setAttribute("href", oldHref);
  });
}

async function loadDatasets() {
  const loaded = await toDatasetRootLoad(() => loadAll());
  state.datasets.horses = Array.isArray(loaded.horses) ? loaded.horses : [];
  state.datasets.feed_items = Array.isArray(loaded.feed_items) ? loaded.feed_items : [];
}

function setNav(nav) {
  state.nav = nav;
  Object.entries(ui.views).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== nav);
  });

  const items = [
    { key: "start", label: "Start" },
    { key: "horses", label: "Horses" },
    { key: "plan", label: "Plan" },
    { key: "share", label: "Share" },
  ];
  ui.nav.innerHTML = items
    .map(
      (item) =>
        `<button type="button" class="row--tap bottom-nav__item BottomNav__item ${
          nav === item.key ? "row--active bottom-nav__item--active BottomNav__item--active" : ""
        }" data-nav="${item.key}">${item.label}</button>`
    )
    .join("");
}

function setPlanMode(mode) {
  state.planMode = mode;
}

function setPlanTab(tab) {
  state.planTab = tab;
}

function openHorseDetail(horseId) {
  state.selectedHorseId = horseId;
  if (!state.daily.active_horse_ids.includes(horseId)) {
    state.daily.active_horse_ids.push(horseId);
    saveDaily();
  }
  setPlanMode("detail");
  setPlanTab("feed");
  setNav("plan");
}

function grainTimespanEntry(horseId, grainId, span) {
  const h = ensureHorseState(horseId);
  if (!h.grains[grainId]) h.grains[grainId] = { AM: null, MD: null, PM: null, NC: null };
  if (!(span in h.grains[grainId])) h.grains[grainId][span] = null;
  return h.grains[grainId][span];
}

function toggleGrainAmount(horseId, grainId, span, amount, defaultUom) {
  const h = ensureHorseState(horseId);
  if (!h.grains[grainId]) h.grains[grainId] = { AM: null, MD: null, PM: null, NC: null };
  const current = h.grains[grainId][span];
  if (current && Number(current.amount) === amount) h.grains[grainId][span] = null;
  else h.grains[grainId][span] = { amount, uom: current?.uom || defaultUom || "scoop" };
  saveDaily();
}

function setGrainUom(horseId, grainId, span, uom) {
  const h = ensureHorseState(horseId);
  if (!h.grains[grainId]) h.grains[grainId] = { AM: null, MD: null, PM: null, NC: null };
  const current = h.grains[grainId][span];
  h.grains[grainId][span] = { amount: current?.amount ?? 1, uom };
  saveDaily();
}

function toggleSupplementSpan(horseId, suppId, span) {
  const h = ensureHorseState(horseId);
  const curr = Array.isArray(h.supplements[suppId]) ? [...h.supplements[suppId]] : [];
  const i = curr.indexOf(span);
  if (i >= 0) curr.splice(i, 1);
  else curr.push(span);
  h.supplements[suppId] = curr;
  saveDaily();
}

function toggleHayAmount(horseId, span, amount) {
  const h = ensureHorseState(horseId);
  const current = Number(h.hay[span] || 0);
  h.hay[span] = current === amount ? 0 : amount;
  saveDaily();
}

function renderStart() {
  ui.views.start.innerHTML = Card({
    title: "Start",
    meta: "New creates fresh state. Resume uses today's state if available.",
    body: `
      <div class="stack" style="margin-top:8px;">
        ${RowTap({ title: "New", attrs: 'data-action="start-new"' })}
        ${RowTap({ title: "Resume", active: state.loadedFromCache, attrs: 'data-action="start-resume"' })}
      </div>
    `,
  });
}

function renderHorses() {
  const list = getHorses()
    .map((horse) => {
      const active = getActiveHorseIds().includes(horse.horse_id);
      return RowTap({
        title: getHorseLabel(horse),
        meta: [horse.barn_name, horse.gender, horse.color].filter(Boolean).join(" | "),
        right: active ? "Active" : "",
        active: state.selectedHorseId === horse.horse_id,
        attrs: `data-action="open-horse" data-horse-id="${escapeHtml(horse.horse_id)}"`,
      });
    })
    .join("");

  ui.views.horses.innerHTML = Card({
    title: "Horses",
    meta: "Tap any horse to jump into Horse Detail.",
    body: `<div class="horse-list" style="margin-top:8px;">${list || "<div class=\"card__meta\">No horses found.</div>"}</div>`,
  });
}

function renderPlanList() {
  const activeIds = getActiveHorseIds();
  const peaks = PeakStrip({
    items: activeIds.map((id) => ({ id, label: getHorseLabel(getHorseById(id) || { horse_id: id }) })),
  });

  const cards = activeIds
    .map((horseId) => {
      const horse = getHorseById(horseId);
      if (!horse) return "";
      return `
        <div id="plan-horse-${horseId}">
          ${HorseCard({
            title: getHorseLabel(horse),
            meta: [horse.barn_name, horse.gender, horse.color].filter(Boolean).join(" | "),
            body: `<div class="card__meta" style="margin-top:8px;">Tap card to open Horse Detail</div>`,
            attrs: `data-action="open-horse" data-horse-id="${escapeHtml(horseId)}"`,
            active: state.selectedHorseId === horseId,
          })}
        </div>
      `;
    })
    .join("");

  ui.views.plan.innerHTML = `
    ${Card({
      title: "Plan",
      meta: "Peak anchors jump to horse cards.",
      body: `<div style="margin-top:8px;">${peaks}</div>`,
    })}
    <section class="plan-list">${cards || "<div class='card card--dense'><div class='card__meta'>No active horses.</div></div>"}</section>
  `;
}

function renderFeedDetail(horse) {
  const horseId = horse.horse_id;
  const openGrainId = state.expandedGrainByHorse[String(horseId)] || null;
  const grains = getGrains();

  return grains
    .map((grain) => {
      const grainId = grain.feed_item_id;
      const open = openGrainId === grainId;
      const uoms = Array.isArray(grain.uoms) && grain.uoms.length ? grain.uoms : ["cup", "scoop"];

      const detail = !open
        ? ""
        : Card({
            dense: true,
            body: TimespanColumn({
              blocks: TIMESPANS.map((span) => {
                const entry = grainTimespanEntry(horseId, grainId, span);
                const amountPills = Pills({
                  items: AMOUNTS.map((n) => ({ value: n, label: String(n) })),
                  activeValue: entry ? entry.amount : "",
                  action: "grain-amount",
                  attrs: `data-grain-id="${escapeHtml(grainId)}" data-span="${span}" data-horse-id="${escapeHtml(horseId)}"`,
                });
                const uomPills = Pills({
                  items: uoms.map((u) => ({ value: u, label: u })),
                  activeValue: entry ? entry.uom : "",
                  action: "grain-uom",
                  attrs: `data-grain-id="${escapeHtml(grainId)}" data-span="${span}" data-horse-id="${escapeHtml(horseId)}"`,
                });
                return { label: span, body: `${amountPills}${uomPills}` };
              }),
            }),
          });

      const setCount = TIMESPANS.filter((span) => grainTimespanEntry(horseId, grainId, span)).length;

      return `
        <article class="card card--dense">
          ${RowTap({
            title: getFeedLabel(grain),
            right: setCount ? `${setCount} set` : "open",
            active: open,
            attrs: `data-action="open-grain" data-grain-id="${escapeHtml(grainId)}" data-horse-id="${escapeHtml(horseId)}"`,
          })}
          <div class="inline-detail">${detail}</div>
        </article>
      `;
    })
    .join("");
}

function renderExtrasDetail(horse) {
  const horseId = horse.horse_id;
  const openSuppId = state.expandedSuppByHorse[String(horseId)] || null;
  const supplements = getSupplements();
  const horseState = ensureHorseState(horseId);

  const suppBlocks = supplements
    .map((supp) => {
      const suppId = supp.feed_item_id;
      const open = openSuppId === suppId;
      const selected = Array.isArray(horseState.supplements[suppId]) ? horseState.supplements[suppId] : [];

      const detail = !open
        ? ""
        : Card({
            dense: true,
            body: `
              <div class="inline-actions">
                ${TIMESPANS.map((span) => {
                  const active = selected.includes(span);
                  return `<button type="button" class="row--tap pill ${active ? "row--active pill--active" : ""}" data-action="supp-span" data-supp-id="${escapeHtml(
                    suppId
                  )}" data-horse-id="${escapeHtml(horseId)}" data-value="${span}">${span}</button>`;
                }).join("")}
              </div>
            `,
          });

      const chips = selected.map((span) => `<span class="chip">${escapeHtml(span)}</span>`).join(" ");
      return `
        <article class="card card--dense">
          ${RowTap({
            title: getFeedLabel(supp),
            right: selected.length ? `${selected.length} spans` : "open",
            active: open,
            attrs: `data-action="open-supp" data-supp-id="${escapeHtml(suppId)}" data-horse-id="${escapeHtml(horseId)}"`,
          })}
          ${chips ? `<div style="margin-top:6px;">${chips}</div>` : ""}
          <div class="inline-detail">${detail}</div>
        </article>
      `;
    })
    .join("");

  const hayBlocks = TimespanColumn({
    blocks: TIMESPANS.map((span) => {
      const amount = Number(horseState.hay[span] || 0);
      const amountPills = AMOUNTS.map((n) => {
        const active = amount === n;
        return `<button type="button" class="row--tap pill ${active ? "row--active pill--active" : ""}" data-action="hay-amount" data-horse-id="${escapeHtml(
          horseId
        )}" data-span="${span}" data-value="${n}">${n}</button>`;
      }).join("");
      return { label: span, body: `<div class="inline-actions">${amountPills}</div><span class="chip">flakes</span>` };
    }),
  });

  return `
    <div class="stack">
      ${suppBlocks || "<div class='card card--dense'><div class='card__meta'>No supplements.</div></div>"}
      ${Card({ title: "Hay", meta: "Hardcoded stage (not from dataset)", body: hayBlocks })}
    </div>
  `;
}

function renderHorseSummaryCard(horseId) {
  const horse = getHorseById(horseId);
  const horseState = ensureHorseState(horseId);

  const grainLines = getGrains()
    .map((grain) => {
      const g = horseState.grains[grain.feed_item_id];
      if (!g) return "";
      const spans = TIMESPANS.map((span) => (g[span] ? `${span} ${g[span].amount} ${g[span].uom}` : "")).filter(Boolean);
      if (!spans.length) return "";
      return `<div>${escapeHtml(getFeedLabel(grain))}: ${escapeHtml(spans.join(" | "))}</div>`;
    })
    .filter(Boolean)
    .join("");

  const suppLines = getSupplements()
    .map((supp) => {
      const spans = horseState.supplements[supp.feed_item_id] || [];
      if (!spans.length) return "";
      return `<div>${escapeHtml(getFeedLabel(supp))}: ${escapeHtml(spans.join(", "))}</div>`;
    })
    .filter(Boolean)
    .join("");

  const hayLine = TIMESPANS.map((span) => {
    const amount = Number(horseState.hay[span] || 0);
    return amount ? `${span} ${amount} flakes` : "";
  })
    .filter(Boolean)
    .join(" | ");

  return HorseCard({
    title: horse ? getHorseLabel(horse) : `Horse ${horseId}`,
    meta: horse ? [horse.barn_name, horse.gender, horse.color].filter(Boolean).join(" | ") : "",
    body: `
      <div class="card__meta" style="margin-top:8px;">Feed</div>
      ${grainLines || "<div class='meta-line'>No feed set.</div>"}
      <div class="card__meta" style="margin-top:8px;">Extras</div>
      ${suppLines || "<div class='meta-line'>No extras set.</div>"}
      <div class="card__meta" style="margin-top:8px;">Hay</div>
      ${hayLine ? `<div>${escapeHtml(hayLine)}</div>` : "<div class='meta-line'>No hay set.</div>"}
    `,
    attrs: `data-action="open-horse" data-horse-id="${escapeHtml(horseId)}"`,
    active: state.selectedHorseId === horseId,
  });
}

function renderPlanDetail() {
  const horse = state.selectedHorseId ? getHorseById(state.selectedHorseId) : null;
  if (!horse) {
    ui.views.plan.innerHTML = Card({
      title: "Plan",
      meta: "Select a horse from Horses or Plan.",
    });
    return;
  }

  const horseMetaCard = Card({
    body: `
      <div class="horse-meta">
        <div class="horse-avatar">${escapeHtml(getHorseInitial(horse))}</div>
        <div>
          <h2 class="card__title">${escapeHtml(getHorseLabel(horse))}</h2>
          <div class="card__meta">${escapeHtml([horse.barn_name, horse.color, horse.gender].filter(Boolean).join(" | "))}</div>
        </div>
      </div>
    `,
  });

  const tabs = Tabs({
    active: state.planTab,
    items: [
      { key: "feed", label: "Feed" },
      { key: "extras", label: "Extras" },
      { key: "card", label: "Card" },
    ],
  });

  let body = "";
  if (state.planTab === "feed") body = renderFeedDetail(horse);
  if (state.planTab === "extras") body = renderExtrasDetail(horse);
  if (state.planTab === "card") body = renderHorseSummaryCard(horse.horse_id);

  ui.views.plan.innerHTML = `
    ${RowTap({ title: "Back to Plan List", attrs: 'data-action="back-plan-list"' })}
    ${horseMetaCard}
    ${tabs}
    <section class="stack">${body}</section>
  `;
}

function renderPlan() {
  if (state.planMode === "detail") renderPlanDetail();
  else renderPlanList();
}

function sharePayload(selectedOnly) {
  const ids = selectedOnly && state.selectedHorseId ? [state.selectedHorseId] : getActiveHorseIds();
  return {
    app: APP_SLUG,
    yyyymmdd: state.yyyymmdd,
    horses: ids.map((horseId) => ({
      horse_id: horseId,
      selections: ensureHorseState(horseId),
    })),
  };
}

function renderShare() {
  const selectedHorse = state.selectedHorseId ? getHorseById(state.selectedHorseId) : null;

  const headerCard = Card({
    title: "Share",
    meta: selectedHorse
      ? `Selected horse: ${getHorseLabel(selectedHorse)}`
      : "No selected horse. Showing all-horse overview.",
    body: `
      <div class="inline-actions" style="margin-top:8px;">
        <button type="button" class="row--tap" data-action="share-copy">Copy text</button>
        <button type="button" class="row--tap" data-action="share-cloud">Push to cloud</button>
      </div>
    `,
  });

  let content = "";
  if (selectedHorse) {
    content = renderHorseSummaryCard(selectedHorse.horse_id);
  } else {
    content = getActiveHorseIds()
      .map((id) => RowTap({
        title: getHorseLabel(getHorseById(id) || { horse_id: id }),
        meta: "Tap to open horse detail",
        attrs: `data-action="open-horse" data-horse-id="${escapeHtml(id)}"`,
      }))
      .join("");
  }

  ui.views.share.innerHTML = `${headerCard}<section class="summary-list">${content || "<div class='card card--dense'><div class='card__meta'>No horses available.</div></div>"}</section>`;
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
    const top = ui.main.scrollTop;
    if (top > state.lastScrollTop + 8 && top > 26) ui.header.classList.add("header--hidden");
    if (top < state.lastScrollTop - 8) ui.header.classList.remove("header--hidden");
    state.lastScrollTop = top;
  });
}

function copyText(text) {
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
  const btn = event.target.closest("button");
  if (!btn) return;

  if (btn.dataset.nav) {
    setNav(btn.dataset.nav);
    if (btn.dataset.nav === "plan") setPlanMode("list");
    renderPlan();
    return;
  }

  const action = btn.dataset.action;
  if (!action) return;

  if (action === "start-new") {
    state.daily = createDaily(state.yyyymmdd);
    state.daily.active_horse_ids = getHorses().map((h) => h.horse_id);
    state.selectedHorseId = state.daily.active_horse_ids[0] || null;
    saveDaily();
    state.loadedFromCache = true;
    renderAll();
    setNav("horses");
    return;
  }

  if (action === "start-resume") {
    setNav("horses");
    return;
  }

  if (action === "open-horse") {
    const horseId = Number(btn.dataset.horseId);
    openHorseDetail(horseId);
    renderAll();
    return;
  }

  if (action === "back-plan-list") {
    setPlanMode("list");
    renderPlan();
    return;
  }

  if (action === "peak-jump") {
    const horseId = Number(btn.dataset.horseId);
    const target = document.getElementById(`plan-horse-${horseId}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (btn.dataset.tab) {
    setPlanTab(btn.dataset.tab);
    renderPlan();
    return;
  }

  if (action === "open-grain") {
    const horseId = Number(btn.dataset.horseId);
    const key = String(horseId);
    const grainId = btn.dataset.grainId;
    state.expandedGrainByHorse[key] = state.expandedGrainByHorse[key] === grainId ? null : grainId;
    renderPlan();
    return;
  }

  if (action === "grain-amount") {
    const horseId = Number(btn.dataset.horseId);
    const grainId = btn.dataset.grainId;
    const span = btn.dataset.span;
    const amount = Number(btn.dataset.value);
    const grain = getGrains().find((g) => g.feed_item_id === grainId);
    toggleGrainAmount(horseId, grainId, span, amount, grain?.default_uom || "scoop");
    renderPlan();
    renderShare();
    return;
  }

  if (action === "grain-uom") {
    setGrainUom(Number(btn.dataset.horseId), btn.dataset.grainId, btn.dataset.span, btn.dataset.value);
    renderPlan();
    renderShare();
    return;
  }

  if (action === "open-supp") {
    const horseId = Number(btn.dataset.horseId);
    const key = String(horseId);
    const suppId = btn.dataset.suppId;
    state.expandedSuppByHorse[key] = state.expandedSuppByHorse[key] === suppId ? null : suppId;
    renderPlan();
    return;
  }

  if (action === "supp-span") {
    toggleSupplementSpan(Number(btn.dataset.horseId), btn.dataset.suppId, btn.dataset.value);
    renderPlan();
    renderShare();
    return;
  }

  if (action === "hay-amount") {
    toggleHayAmount(Number(btn.dataset.horseId), btn.dataset.span, Number(btn.dataset.value));
    renderPlan();
    renderShare();
    return;
  }

  if (action === "share-copy") {
    const payload = sharePayload(Boolean(state.selectedHorseId));
    copyText(JSON.stringify(payload, null, 2));
    return;
  }

  if (action === "share-cloud") {
    const payload = sharePayload(Boolean(state.selectedHorseId));
    console.log("pellettap push payload", payload);
  }
}

async function boot() {
  document.documentElement.setAttribute("data-kit", KIT_VARIANT);

  state.yyyymmdd = yyyymmdd();
  state.stateKey = `${KEY_PREFIX}${state.yyyymmdd}`;
  ui.dateLabel.textContent = state.yyyymmdd;

  loadDaily();
  await loadDatasets();
  ensureAutoActivatedOnFirstLoad();

  bindHeaderAutoHide();
  renderAll();

  document.addEventListener("click", handleClick);
}

boot();
