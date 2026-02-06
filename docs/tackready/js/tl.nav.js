// tl.nav.js
(function () {
  'use strict';

  const TL = (window.TL = window.TL || {});
  TL.nav = TL.nav || {};

  function makeBtn(screenKey, label, withAgg) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-btn';
    btn.dataset.screen = String(screenKey);

    const lab = document.createElement('span');
    lab.className = 'nav-label';
    lab.textContent = String(label || '');

    btn.appendChild(lab);

    if (withAgg) {
      const agg = document.createElement('span');
      agg.className = 'nav-agg';
      agg.dataset.navAgg = String(screenKey); // [data-nav-agg="..."]
      agg.textContent = '0';
      btn.appendChild(agg);
    }

    return btn;
  }

  function rebuild() {
    if (!TL.dom || !TL.dom.navRow) return;

    const navRow = TL.dom.navRow;
    navRow.innerHTML = '';

    const cfg = (TL.lists && TL.lists.getListsConfig) ? TL.lists.getListsConfig() : [];
    const stateDef = (TL.lists && TL.lists.getStateDef) ? TL.lists.getStateDef(cfg) : { key: 'state', label: 'Active Horses' };
    const listDefs = (TL.lists && TL.lists.getListDefs) ? TL.lists.getListDefs(cfg) : [];

    // Always include Start / State / Summary
    navRow.appendChild(makeBtn('start', 'Start', false));
    navRow.appendChild(makeBtn('state', stateDef.label || 'Active Horses', true));

    // Lists from config (inNav != false)
    listDefs
      .filter((d) => d && d.inNav !== false)
      .forEach((d) => {
        navRow.appendChild(makeBtn(d.key, d.label || d.key, true));
      });

    navRow.appendChild(makeBtn('summary', 'Summary', true));

    // Sync highlight + counts
    if (TL.ui && TL.ui.renderNav) TL.ui.renderNav();
    if (TL.ui && TL.ui.updateNavAggregates) TL.ui.updateNavAggregates();
  }

  TL.nav.rebuild = rebuild;
})();
