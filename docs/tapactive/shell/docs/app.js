(() => {
  const URLS = {
    horses: '../../../schedule/data/latest/shell_horses.json',
    profiles: '../../../schedule/data/latest/shell_profiles.json',
    items: '../data/shell_feed_items.json',
    values: '../data/shell_values.json'
  };

  const TTL_MS = 5 * 24 * 60 * 60 * 1000;
  const DB_NAME = 'shellboard-cache';
  const STORE = 'datasets';

  const state = {
    screen: 'start',
    history: [],
    horseId: null,
    detailTab: 'feed',
    feedWindow: 'am',
    extrasMode: 'none',
    horsesSource: 'live',
    profilesSource: 'live',
    errors: [],
    datasets: { horses: [], profiles: {}, items: [], values: { horses: {} } }
  };

  const seenErrors = new Set();

  const app = document.getElementById('app');
  const main = document.getElementById('app-main');
  const root = document.getElementById('screen-root');
  const title = document.getElementById('header-title');
  const backBtn = document.getElementById('back-btn');
  const nav = document.getElementById('app-nav');

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function fmtRation(v) {
    if (v === 0) return '—';
    if (v === 0.5) return '½';
    if (v === 1.5) return '1½';
    return String(v);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function cacheGet(key) {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => {
          const row = req.result;
          if (!row || row.expiresAt < Date.now()) return resolve(null);
          row.touchedAt = Date.now();
          row.expiresAt = Date.now() + TTL_MS;
          tx.objectStore(STORE).put(row, key);
          resolve(row.data);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async function cacheSet(key, data) {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ data, touchedAt: Date.now(), expiresAt: Date.now() + TTL_MS }, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return null;
    }
  }

  async function fetchJson(url, dataset) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw { dataset, url, status: res.status };
    return res.json();
  }

  async function fetchShared(name) {
    const url = URLS[name];
    try {
      const data = await fetchJson(url, name);
      await cacheSet(name, data);
      state[`${name}Source`] = 'live';
      return data;
    } catch (err) {
      const cached = await cacheGet(name);
      if (cached) {
        state[`${name}Source`] = 'cached';
        return cached;
      }
      pushError(name, url, err?.status || 'network error');
      return name === 'horses' ? { horses: [] } : {};
    }
  }

  async function fetchApp(name) {
    const url = URLS[name];
    try {
      return await fetchJson(url, name);
    } catch (err) {
      pushError(name, url, err?.status || 'network error');
      return name === 'values' ? { horses: {} } : { items: [] };
    }
  }

  function pushError(dataset, url, status) {
    const key = `${dataset}|${url}|${status}`;
    if (seenErrors.has(key)) return;
    seenErrors.add(key);
    state.errors.push({ dataset, url, status });
  }

  function getHorseById(id) {
    return state.datasets.horses.find(h => String(h.horse_id) === String(id));
  }

  function getSeed(horseId) {
    return state.datasets.values?.horses?.[horseId] || { feed: { am: { items: {} }, pm: { items: {} } }, extras: { am: { items: {} }, pm: { items: {} } }, hay: { am: 0, md: 0, pm: 0, nc: 0 }, info: {} };
  }

  function profileForHorse(horse) {
    if (!horse) return {};
    const p = state.datasets.profiles || {};
    const byId = p.by_horse_id || p.byHorseId || p.horses || p;
    return byId?.[String(horse.horse_id)] || {};
  }

  function horseIdentity(horse) {
    const profile = profileForHorse(horse);
    return {
      title: profile.barnName || horse?.barnName || horse?.horseName || 'Unknown',
      horseName: profile.horseName || horse?.horseName || horse?.barnName || 'Unknown',
      showName: profile.showName || horse?.showName || horse?.barnName || '',
      profileIcon: profile.profile_icon || horse?.profile_icon || null,
      emergency: profile.emergency || horse?.emergency || {}
    };
  }

  function getItemsByCategory(cat) {
    return (state.datasets.items || []).filter(x => x.category === cat && x.active !== false);
  }

  function renderErrorRows(container) {
    if (!state.errors.length) return;
    const wrap = el('div', 'stack');
    state.errors.forEach(e => {
      const row = el('div', 'error-row');
      row.innerHTML = `<strong>${e.dataset}</strong><br>${e.url}<br>Status: ${e.status}`;
      wrap.appendChild(row);
    });
    container.appendChild(wrap);
  }

  function makeRowTap(titleText, metaText, onTap, active = false) {
    const row = el('button', `row row--tap${active ? ' row--active' : ''}`);
    const left = el('div');
    left.textContent = titleText;
    const right = el('div', 'row-meta', metaText || '');
    row.append(left, right);
    row.addEventListener('click', onTap);
    return row;
  }

  function screenStart() {
    title.textContent = 'ShellBoard';
    backBtn.hidden = true;
    const wrap = el('div', 'stack');
    const stub = el('div', 'card');
    stub.innerHTML = `<h2 style="margin:0 0 8px">Start</h2><div class="row-meta">Reusable board shell with feed-like sample data.</div>`;
    wrap.appendChild(stub);
    wrap.appendChild(el('div', 'row', `Horses: ${state.horsesSource}`));
    wrap.appendChild(el('div', 'row', `Profiles: ${state.profilesSource}`));
    renderErrorRows(wrap);
    return wrap;
  }

  function screenHorses() {
    title.textContent = 'Horses';
    backBtn.hidden = true;
    const wrap = el('div', 'stack');
    state.datasets.horses.forEach((h, i) => {
      const ident = horseIdentity(h);
      const row = makeRowTap(ident.title, ident.showName || '', () => {
        state.history.push(state.screen);
        state.screen = 'detail';
        state.horseId = String(h.horse_id);
        render();
      });
      row.appendChild(el('span', 'badge', String(i + 1)));
      wrap.appendChild(row);
    });
    if (!state.datasets.horses.length) wrap.appendChild(el('div', 'row', 'No horses loaded'));
    renderErrorRows(wrap);
    return wrap;
  }

  function renderItemList(mode, horseId, muted = false) {
    const card = el('div', 'card');
    const items = getItemsByCategory(mode);
    const seed = getSeed(horseId);
    items.forEach(item => {
      const r = el('div', `item-row${muted ? ' item-row--muted' : ''}`);
      const left = el('div');
      left.innerHTML = `<div class="item-title">${item.title}</div><div class="item-sub">${item.default_uom || 'scoop'} | options: ${(item.ration_options || []).join(', ')}</div>`;
      const key = item.item_id;
      let data;
      if (mode === 'feed') data = seed.feed?.[state.feedWindow]?.items?.[key];
      else data = seed.extras?.[state.feedWindow]?.items?.[key] || seed.extras?.am?.items?.[key];
      const right = el('div', 'badge', `${fmtRation(Number(data?.ration ?? 0))} ${(data?.uom || 'scoop')}`);
      r.append(left, right);
      card.appendChild(r);
    });
    return card;
  }

  function screenDetail() {
    const horse = getHorseById(state.horseId) || {};
    const ident = horseIdentity(horse);
    title.textContent = ident.title || 'Detail';
    backBtn.hidden = false;

    const wrap = el('div', 'stack');
    const hero = el('div', 'hero');
    hero.innerHTML = `<div style="display:flex;align-items:flex-end"><div class="icon-circle">${ident.profileIcon || ident.title.slice(0, 1)}</div><div><h2>${ident.horseName}</h2><h3>${ident.showName || ident.title}</h3></div></div>`;
    wrap.appendChild(hero);

    const tabs = el('div', 'tabs');
    ['feed', 'extras', 'hay', 'info'].forEach(t => {
      const b = el('button', `chip${state.detailTab === t ? ' chip--active' : ''}`, t[0].toUpperCase() + t.slice(1));
      b.addEventListener('click', () => { state.detailTab = t; render(); });
      tabs.appendChild(b);
    });
    wrap.appendChild(tabs);

    if (state.detailTab === 'feed' || state.detailTab === 'extras') {
      const toggle = el('div', 'chips');
      ['am', 'pm'].forEach(t => {
        const b = el('button', `chip${state.feedWindow === t ? ' chip--active' : ''}`, t.toUpperCase());
        b.addEventListener('click', () => { state.feedWindow = t; render(); });
        toggle.appendChild(b);
      });
      wrap.appendChild(toggle);
    }

    if (state.detailTab === 'feed') {
      wrap.appendChild(renderItemList('feed', String(horse.horse_id)));
    }

    if (state.detailTab === 'extras') {
      const modes = ['none', 'am', 'pm', 'am/pm'];
      const modeBar = el('div', 'chips');
      const modeBtn = el('button', 'chip', `Mode: ${state.extrasMode.toUpperCase()}`);
      modeBtn.addEventListener('click', () => {
        const idx = modes.indexOf(state.extrasMode);
        state.extrasMode = modes[(idx + 1) % modes.length];
        render();
      });
      modeBar.appendChild(modeBtn);
      wrap.appendChild(modeBar);
      wrap.appendChild(renderItemList('extras', String(horse.horse_id), state.extrasMode === 'none'));
    }

    if (state.detailTab === 'hay') {
      const card = el('div', 'card');
      const seed = getSeed(String(horse.horse_id));
      const sequence = [0, 0.5, 1, 2];
      ['am', 'md', 'pm', 'nc'].forEach(slot => {
        const row = makeRowTap(slot.toUpperCase(), 'tap to cycle', () => {
          const curr = Number(seed.hay?.[slot] ?? 0);
          const idx = sequence.indexOf(curr);
          seed.hay[slot] = sequence[(idx + 1) % sequence.length];
          state.datasets.values.horses[String(horse.horse_id)] = seed;
          render();
        }, Number(seed.hay?.[slot]) > 0);
        row.querySelector('.row-meta').textContent = fmtRation(Number(seed.hay?.[slot] || 0));
        card.appendChild(row);
      });
      wrap.appendChild(card);
    }

    if (state.detailTab === 'info') {
      const seed = getSeed(String(horse.horse_id));
      const card = el('div', 'card');
      const colors = ['Grey', 'Chestnut', 'Bay', 'Palomino', 'Liverchestnut', 'Black', 'Paint'];
      const colorBar = el('div', 'chips');
      colors.forEach(c => {
        const b = el('button', `chip${seed.info?.color === c ? ' chip--active' : ''}`, c);
        b.addEventListener('click', () => { seed.info.color = c; state.datasets.values.horses[String(horse.horse_id)] = seed; render(); });
        colorBar.appendChild(b);
      });
      const genderBar = el('div', 'chips');
      ['Mare', 'Gelding'].forEach(g => {
        const b = el('button', `chip${seed.info?.gender === g ? ' chip--active' : ''}`, g);
        b.addEventListener('click', () => { seed.info.gender = g; state.datasets.values.horses[String(horse.horse_id)] = seed; render(); });
        genderBar.appendChild(b);
      });
      const emergency = el('div', 'row');
      emergency.style.minHeight = 'auto';
      emergency.style.borderRadius = '12px';
      emergency.style.alignItems = 'flex-start';
      emergency.innerHTML = `<div><strong>Emergency</strong><br>${ident.emergency?.contact || 'N/A'}<br>${ident.emergency?.phone || 'N/A'}</div>`;
      card.append(colorBar, genderBar, emergency);
      wrap.appendChild(card);
    }

    renderErrorRows(wrap);
    return wrap;
  }

  function screenPlan() {
    title.textContent = 'Plan';
    backBtn.hidden = true;
    const wrap = el('div', 'stack');
    const anchors = el('div', 'chips');
    state.datasets.horses.forEach(h => {
      const ident = horseIdentity(h);
      const b = el('button', 'chip', ident.title);
      b.addEventListener('click', () => {
        const target = document.getElementById(`peak-${h.horse_id}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      anchors.appendChild(b);
    });
    wrap.appendChild(anchors);

    state.datasets.horses.forEach(h => {
      const ident = horseIdentity(h);
      const card = el('div', 'card');
      card.id = `peak-${h.horse_id}`;
      card.innerHTML = `<div style="font-weight:650">${ident.title}</div><div class="row-meta">${ident.showName || ''}</div>`;
      wrap.appendChild(card);
    });
    renderErrorRows(wrap);
    return wrap;
  }

  function summarizeCell(seed, phase, hayPhase) {
    const feed = seed.feed?.[phase]?.items || {};
    const extras = seed.extras?.[phase]?.items || {};
    const firstFeed = Object.values(feed)[0] || { ration: 0, uom: 'scoop' };
    const firstExtra = Object.values(extras)[0] || { ration: 0, uom: 'scoop' };
    return {
      feedline: `${fmtRation(Number(firstFeed.ration || 0))} ${firstFeed.uom || 'scoop'}`,
      extraline: `${fmtRation(Number(firstExtra.ration || 0))} ${firstExtra.uom || 'scoop'}`,
      hayline: fmtRation(Number(seed.hay?.[hayPhase] || 0))
    };
  }

  function screenShare() {
    title.textContent = 'Share';
    backBtn.hidden = true;
    const wrap = el('div', 'stack');
    const preview = el('div', 'card');
    preview.innerHTML = '<div style="font-weight:650;margin-bottom:6px">Mobile preview</div><div class="row-meta">Wall/print grid is below.</div>';
    wrap.appendChild(preview);

    const scrollWrap = el('div', 'wall-scroll');
    const grid = el('div', 'grid-wall');
    ['Horse', 'Morning', 'Midday', 'Night', 'Night Check', ''].forEach((h, i) => {
      const head = el('div', `grid-head${i === 4 ? ' muted' : ''}`, h);
      grid.appendChild(head);
    });

    state.datasets.horses.forEach(h => {
      const ident = horseIdentity(h);
      const seed = getSeed(String(h.horse_id));
      const label = el('div', 'grid-cell grid-rowlabel', ident.title);
      grid.appendChild(label);

      const slots = [
        { key: 'am', title: 'Morning' },
        { key: 'md', title: 'Midday' },
        { key: 'pm', title: 'Night' },
        { key: 'nc', title: 'Night Check', muted: true }
      ];

      slots.forEach(s => {
        const phase = s.key === 'md' ? 'am' : s.key;
        const summary = summarizeCell(seed, phase, s.key);
        const cell = el('div', `grid-cell${s.muted ? ' muted' : ''}`);
        cell.innerHTML = `<div class="timecard">${s.title}</div><div class="feedline">Feed: ${summary.feedline}</div><div class="extraline">Extras: ${summary.extraline}</div><div class="hayline">Hay: ${summary.hayline}</div>`;
        grid.appendChild(cell);
      });

      grid.appendChild(el('div', 'grid-cell muted', ''));
    });

    scrollWrap.appendChild(grid);
    wrap.appendChild(scrollWrap);
    renderErrorRows(wrap);
    return wrap;
  }

  function render() {
    root.innerHTML = '';
    const screens = {
      start: screenStart,
      horses: screenHorses,
      detail: screenDetail,
      plan: screenPlan,
      share: screenShare
    };
    const node = (screens[state.screen] || screenStart)();
    root.appendChild(node);
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('nav-btn--active', b.dataset.screen === state.screen);
    });
  }

  function bindUi() {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-screen]');
      if (!btn) return;
      state.screen = btn.dataset.screen;
      if (state.screen !== 'detail') state.history = [];
      render();
    });

    backBtn.addEventListener('click', () => {
      state.screen = state.history.pop() || 'horses';
      render();
    });

    let lastTop = 0;
    let ticking = false;
    main.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const top = main.scrollTop;
        const delta = top - lastTop;
        if (top <= 6) {
          app.classList.remove('hide-header', 'hide-nav');
        } else if (delta > 9) {
          app.classList.add('hide-header', 'hide-nav');
        } else if (delta < -9) {
          app.classList.remove('hide-header', 'hide-nav');
        }
        lastTop = top;
        ticking = false;
      });
    }, { passive: true });
  }

  async function loadData() {
    const horsesData = await fetchShared('horses');
    const profilesData = await fetchShared('profiles');
    const itemsData = await fetchApp('items');
    const valuesData = await fetchApp('values');
    state.datasets.horses = horsesData.horses || horsesData || [];
    const pRoot = profilesData.profiles || profilesData || {};
    if (Array.isArray(pRoot)) {
      state.datasets.profiles = {
        by_horse_id: Object.fromEntries(pRoot.filter(x => x && x.horse_id != null).map(x => [String(x.horse_id), x]))
      };
    } else {
      state.datasets.profiles = pRoot;
    }
    state.datasets.items = itemsData.items || itemsData || [];
    state.datasets.values = valuesData || { horses: {} };
  }

  (async function init() {
    bindUi();
    await loadData();
    render();
  })();
})();
