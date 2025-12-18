/* ============================================================================
   Trainer / Team App
   Single-pass, no persistence, no UX changes
   ========================================================================== */

(() => {
  'use strict';

  /* --------------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------------- */
  const screenRoot = document.getElementById('screen-root');

  /* --------------------------------------------------------------------------
   DATA PATHS
   -------------------------------------------------------------------------- */
  const DATA_PATHS = {
    team: './data/team_enriched.json',
    rings: './data/rings.json',
    classes: './data/classes.json'
  };

  /* --------------------------------------------------------------------------
   STATE (in-memory only)
   -------------------------------------------------------------------------- */
  const state = {
    expandedRings: new Set(),
    expandedGroups: new Set()
  };

  /* --------------------------------------------------------------------------
   UTIL
   -------------------------------------------------------------------------- */
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const pillRow = (label, right, active = false) => {
    const row = el('div', 'row row--tap');
    if (active) row.classList.add('row--active');

    const title = el('div', 'row-title', label);
    row.appendChild(title);

    if (right != null) {
      const tag = el('div', 'row-tag', right);
      row.appendChild(tag);
    }
    return row;
  };

  const divider = () => el('div', 'list-group-divider');
  const label = txt => el('div', 'list-group-label', txt);

  /* --------------------------------------------------------------------------
   LOAD
   -------------------------------------------------------------------------- */
  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed ${path}`);
    return res.json();
  }

  Promise.all([
    loadJSON(DATA_PATHS.team),
    loadJSON(DATA_PATHS.rings),
    loadJSON(DATA_PATHS.classes)
  ]).then(([teamRows, rings, classes]) => {
    build(teamRows, rings, classes);
  }).catch(err => {
    screenRoot.textContent = err.message;
  });

  /* --------------------------------------------------------------------------
   BUILD
   -------------------------------------------------------------------------- */
  function build(rows, rings, classes) {
    screenRoot.innerHTML = '';

    const ringMap = Object.fromEntries(
      rings.map(r => [String(r.ring_id), r])
    );

    const classMap = Object.fromEntries(
      classes.map(c => [String(c.class_id), c])
    );

    /* Group by Ring */
    const ringGroups = {};
    rows.forEach(r => {
      const ringId = String(r['Ring Id']);
      if (!ringGroups[ringId]) ringGroups[ringId] = [];
      ringGroups[ringId].push(r);
    });

    /* Sort rings by priority */
    const orderedRings = Object.keys(ringGroups).sort((a, b) => {
      return (ringMap[a]?.ring_priority ?? 999) -
             (ringMap[b]?.ring_priority ?? 999);
    });

    orderedRings.forEach(ringId => {
      renderRing(ringId, ringGroups[ringId], ringMap, classMap);
    });
  }

  /* --------------------------------------------------------------------------
   RENDER RING
   -------------------------------------------------------------------------- */
  function renderRing(ringId, rows, ringMap, classMap) {
    const ring = ringMap[ringId] || {};
    const ringKey = `ring:${ringId}`;
    const open = state.expandedRings.has(ringKey);

    const ringRow = pillRow(
      `${ring.ring_nickname || ring['Ring Nickname'] || ''} → ${ring['Ring Name'] || ring.ring_name || ''}`,
      open ? '−' : '+',
      open
    );

    ringRow.onclick = () => {
      open ? state.expandedRings.delete(ringKey)
           : state.expandedRings.add(ringKey);
      rebuild();
    };

    screenRoot.appendChild(ringRow);

    if (!open) return;

    /* Group by Class Group */
    const groupMap = {};
    rows.forEach(r => {
      const gid = String(r['Class Group Id']);
      if (!groupMap[gid]) groupMap[gid] = [];
      groupMap[gid].push(r);
    });

    Object.keys(groupMap)
      .sort((a, b) =>
        (groupMap[a][0]['Class Group Sequence'] ?? 0) -
        (groupMap[b][0]['Class Group Sequence'] ?? 0)
      )
      .forEach(gid => {
        renderGroup(gid, groupMap[gid], classMap);
      });
  }

  /* --------------------------------------------------------------------------
   RENDER GROUP
   -------------------------------------------------------------------------- */
  function renderGroup(groupId, rows, classMap) {
    const key = `group:${groupId}`;
    const open = state.expandedGroups.has(key);
    const meta = rows[0];

    const row = pillRow(
      `${meta['Group Name']}`,
      open ? '−' : '+',
      open
    );

    row.onclick = () => {
      open ? state.expandedGroups.delete(key)
           : state.expandedGroups.add(key);
      rebuild();
    };

    screenRoot.appendChild(row);

    if (!open) return;

    screenRoot.appendChild(divider());

    /* Classes */
    const classIds = [...new Set(rows.map(r => String(r['Class Id'])))];
    classIds.forEach(cid => {
      const c = classMap[cid] || {};
      const r = rows.find(x => String(x['Class Id']) === cid);

      screenRoot.appendChild(
        pillRow(
          `${c.class_nickname || ''} → ${r['Class Name']} #${r['Class Number']}`
        )
      );
    });

    /* Horses / Riders */
    rows.forEach(r => {
      screenRoot.appendChild(
        pillRow(
          `${r['Barn Name']} → ${r['Horse']}  •  ${r['Team Name']} → ${r['Rider Name']} #${r['Entry Number']}`
        )
      );
    });

    screenRoot.appendChild(divider());
  }

  /* --------------------------------------------------------------------------
   REBUILD
   -------------------------------------------------------------------------- */
  function rebuild() {
    Promise.all([
      loadJSON(DATA_PATHS.team),
      loadJSON(DATA_PATHS.rings),
      loadJSON(DATA_PATHS.classes)
    ]).then(([teamRows, rings, classes]) => {
      build(teamRows, rings, classes);
    });
  }

})();
