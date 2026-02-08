# CONTRACT — Tap Active / RingerTap Single‑Page UI Shell

This document defines the **non‑negotiable interface contract** for this app.

Codex (and any contributor) must treat these items as **stable API surface**. If a change is required, it must be explicitly called out as a **contract change** with a migration note.

---

## 1) Primary goals

- Preserve the **existing UI structure, IDs, and class names** relied on by CSS and event binding.
- Preserve the **screen router contract** (screen keys, navigation behavior, and history/back behavior).
- Preserve the **data ingress contract** (paths, refresh cadence expectations, and basic shape assumptions).

---

## 2) DOM / UI contract (IDs that must exist)

These IDs must exist in the live DOM at runtime and remain semantically consistent.

### Root

- `#app` — main mount container (single page)

### Header

- `#header-back` — back button element (clickable)
- `#header-title` — header title text element

### Main

- `#app-main` — main content region
- `#screen-root` — where screens render
- `#filterbottom` — sticky bottom filter area (screen-specific controls)

### Bottom navigation

- `#nav-row` — bottom nav row container

> Note: `app.js` may rebuild the shell dynamically. The runtime DOM must still produce the IDs above.

---

## 3) CSS class contract (do not rename)

The following class families must not be renamed or removed without a contract change:

### Layout / shell

- `app-shell`, `app-header`, `app-main`, `nav-row`, `nav-btn`, `nav-btn primary`, `is-active`
- `header-back`, `header-title`
- `hide-header`, `hide-nav`

### Cards / rows

- `card`, `card-row`, `card-row-left`, `card-row-mid`, `card-row-right`
- `mini-chip`, `badge`, `subtle`, `hr`

### Timeline / schedule UI

- `peakbar`, `peakbar-row`, `peakbar-title`, `peakbar-subtitle`
- `timeline-viewport`, `timeline-axis`, `timeline-grid`, `timeline-lane`, `timeline-card`

### Filter bottom

- `filterbottom`, `filter-chip`, `filter-chip active`

---

## 4) Screen/router contract

### Screen keys (must remain valid)

- `start`
- `summary`
- `horses`
- `riders`
- `schedule`

### Navigation expectations

- Screen transitions must be deterministic.
- Back behavior must respect `state.history` and the `#header-back` control.
- Bottom nav buttons must set `is-active` correctly for the current screen.

---

## 5) State contract (stable keys)

The central state object must continue to include these keys (names and meaning).

- `state.screen` — current screen key
- `state.history[]` — stack for back navigation
- `state.detail` — optional “selected item” payload (record/object/id) for drill‑in

- `state.search.horses` — horses search string
- `state.search.riders` — riders search string
- `state.search.schedule` — schedule search string

- `state.filters` — app-level filter selections (per screen or global)
- `state.loaded` — loaded data cache (schedule/trips)
- `state.meta` — last fetch times, counts, flags

> You may add keys, but do not rename/remove these without a contract change.

---

## 6) Data ingress contract

### JSON sources (paths are stable)

- `./data/latest/watch_schedule.json`
- `./data/latest/watch_trips.json`

### Expectations

- App must tolerate missing fields and empty arrays (render “no data” states).
- Refresh cadence is approximately every **8 minutes**. If changed, document the reason.

### No breaking assumptions

- Do not require new fields in JSON without a fallback.
- Do not change the file paths without providing a redirect/migration note.

---

## 7) Logging and error handling contract

- Errors fetching JSON must not brick the UI.
- If data fetch fails, the app should:
  - keep last known good data (if available)
  - surface a minimal, non-blocking indicator
  - log a concise error to console

---

## 8) What counts as a “contract change”

Any of the following requires:
1) explicit note in `docs/CHANGELOG.md`
2) migration guidance
3) (if applicable) updating any dependent apps/pages

- Renaming/removing any required ID in section 2
- Renaming/removing any class families in section 3
- Changing screen keys in section 4
- Changing JSON paths in section 6
- Removing/renaming stable `state.*` keys in section 5

---

## 9) Codex operating rules (short)

When using Codex on this repo:

- Always start by summarizing impacted files and functions.
- For any change proposal, state:
  - **Does this change the contract?** yes/no
  - If yes: list each breaking surface and migration steps.
- Prefer small diffs (one intent per change).
