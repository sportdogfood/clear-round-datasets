# Architecture Map (`app.js`)

## Scope and constraints
- Contract source: `CONTRACT.md` (treated as non-negotiable).
- App type: single-page app mounted at `#app`, shell rebuilt at runtime by `mountShell()`.
- Primary contract screen keys: `start`, `summary`, `horses`, `riders`, `schedule`.

## Runtime shell and fixed DOM contract
Built by `mountShell()`:
- Root mount: `#app`
- Header: `#header-back`, `#header-title`
- Main: `#app-main`, `#screen-root`
- Bottom nav: `#nav-row`
- Filter bar (dynamic): `#filterbottom` (created/removed by filter renderers)

## State map (central `state` object)
Defined in `app.js` lines ~153-188.

Contract-stable keys present and used:
- `state.screen`: current route/screen key
- `state.history[]`: back stack
- `state.detail`: active drill-in payload
- `state.search.horses`
- `state.search.riders`
- `state.search.schedule` (present, but schedule UI currently uses `search.rings`)
- `state.loaded`
- `state.meta` (`dt`, `sid`, `generated_at`)

Observed additional keys used by implementation:
- `state.schedule`: parsed records from `watch_schedule.json`
- `state.trips`: normalized records from `watch_trips.json`
- `state.search.rings`
- `state.search.classes`
- `state.filter.horse`
- `state.filter.bucket`
- `state.ridersMode`
- `state.pendingScrollId`
- `state.tripSnapshot` (declared)
- `state.changeFlags` (declared)

## Router and screen-to-render mapping
Top-level router is `render()`.

Primary screens (contract):
- `start` -> `renderStart()`
- `summary` -> `renderSummary(sIdx, tIdx)`
- `horses` -> `renderHorses(sIdx, tIdx)`
- `riders` -> `renderRiders(sIdx, tIdx)`
- `schedule` -> `renderSchedule(sIdx, tIdx)`

Additional implemented screens:
- `summaryDetail` -> `renderSummaryDetail(sIdx, tIdx)`
- `classes` -> `renderClasses(sIdx, tIdx)`
- `horseDetail` -> `renderHorseDetail(sIdx, tIdx)`
- `riderDetail` -> `renderRiderDetail(sIdx, tIdx)`
- `classDetail` -> `renderClassDetail(sIdx, tIdx)`
- `ringDetail` -> `renderRingDetail(sIdx, tIdx)`
- `groupDetail` -> `renderGroupDetail(sIdx, tIdx)`
- `rings` alias -> routed to `renderSchedule(sIdx, tIdx)`

Route helpers:
- `goto(screen)`: set screen + clear detail/history
- `pushDetail(screen, detail)`: push current state to history, set detail/screen
- `goBack()`: pop from history
- `getPrimaryForScreen(screen)`: maps detail screens back to nav primary tab for `is-active`

## Per-screen render responsibilities
- `renderStart()`:
  - shows sid/dt/generated metadata
  - "Start Session" action loads data if needed, then navigates to `schedule`

- `renderSummary()`:
  - computes Completed/To Go buckets from truth index (`tIdx`)
  - emits rows for classes/horses/riders + ribbons counts
  - row taps open `summaryDetail` or riders placing mode

- `renderSummaryDetail()`:
  - reads `state.detail.kind/status`
  - builds filtered trip set from `state.trips`
  - renders schedule-style cards via `renderRingCardsFromTrips()`
  - renders bucket filter bar

- `renderHorses()`:
  - searchable horse list from `tIdx.byHorse`
  - tap row -> `horseDetail`

- `renderRiders()`:
  - searchable rider list from `tIdx.byRider`
  - supports `state.ridersMode` filters (placing/ribbons)
  - tap row -> `riderDetail`

- `renderSchedule()`:
  - ring search (`state.search.rings`)
  - optional horse filter chip (`state.filter.horse`)
  - renders ring/group/class/entry/trip hierarchy
  - renders horse chips in bottom filter

- Detail screens (`horseDetail`, `riderDetail`, `classDetail`, `ringDetail`, `groupDetail`):
  - scope `state.trips` by selected `state.detail.key`
  - feed scoped trips into shared ring-card renderer
  - most details use bucket filter chips

## Shared render/data indices
Built each render cycle in `render()`:
- `sIdx = buildScheduleIndex()` from `state.schedule`
  - `ringMap`, `classMap`
  - used for scaffold metadata/lookups (ring/group/class context, naming fallback)
- `tIdx = buildTruthIndex()` from `state.trips`
  - `byEntryKey`, `entryBest`, `byHorse`, `byRing`, `byGroup`, `byClass`, `byRider`
  - used for aggregates, list counts, status rollups, next-up computation

Core shared renderer:
- `renderRingCardsFromTrips(trips, sIdx, opts)`
  - builds hierarchy: ring -> group -> class -> class number -> entry -> trips
  - renders peakbar anchors + schedule cards
  - conditionally wires class/horse/rider drill-ins

## Event binding map
Global shell/chrome:
- `appMain.scroll` -> `bindChromeScroll()` toggles `hide-header` / `hide-nav`
- `#header-back.click` -> `goBack()`
- `#nav-row.click` (delegated on `[data-screen]`) -> reset detail/history/mode, set primary screen, `render()`
- `setInterval(REFRESH_MS)` -> periodic `loadAll()`

Shared controls:
- Search input (`renderSearch`) `input`:
  - updates `state.search[screenKey]`
  - calls `render()` and restores focus/cursor
- Peakbar item (`renderPeakBar`) `click`:
  - in-main scroll to ring anchor and `history.replaceState('#ring-*')`
- Schedule horse filter chips (`renderFilterBottom`) `click`:
  - toggles `state.filter.horse`, then `render()`
- Bucket filter chips (`renderBucketFilterBottom`) `click`:
  - toggles `state.filter.bucket`, then `render()`

Screen-specific taps:
- Start session row -> load then `goto('schedule')`
- Summary rows -> `pushDetail('summaryDetail', ...)` or set riders placing mode + `goto('riders')`
- Horses/Riders/Classes rows -> open corresponding detail screen
- Schedule/detail ring cards:
  - class row -> `classDetail`
  - entry row -> `horseDetail` (or from horse detail -> `riderDetail`)
  - trip rider row -> `riderDetail`

## Data flow from JSON sources
Sources (contract paths):
- `./data/latest/watch_trips.json`
- `./data/latest/watch_schedule.json`

Load pipeline (`loadAll()`):
1. Fetch `watch_trips.json` first (with fallback paths).
2. Fetch `watch_schedule.json` independently (with fallback paths).
3. Partial failure tolerated:
   - trip fetch failure keeps prior `state.trips`
   - schedule fetch failure keeps prior `state.schedule`
4. Skip re-render when `generated_at` unchanged.
5. On success:
   - `state.schedule = sched.records` (if schedule loaded)
   - `state.trips = trips.records.map(normalizeTripRecord).filter(Boolean)` (if trips loaded)
   - recompute `state.meta.{dt,sid,generated_at}` from meta or record fallback
   - set `state.loaded`
   - call `render()`

Normalization (`normalizeTripRecord()`):
- Canonicalizes alternate field names for IDs, names, ring/class/group fields, timing/status, placing, totals, sid/dt.
- Adds fallbacks for missing rider/horse labels.
- Makes downstream render/index logic tolerant of schema variation.

Usage split (scaffold vs truth):
- `watch_trips.json` is the "truth" for nearly all visible counts, list membership, statuses, and detail content.
- `watch_schedule.json` is scaffold/context:
  - ring/group/class metadata fallback
  - class lookup support (`findClassInSchedule`)
  - supplemental source for class lists when trips are sparse

## Safe refactor candidates (no behavior change)
1. Add a compatibility alias for contract key naming (`state.filters`) while preserving current `state.filter` reads/writes.
2. Extract repeated detail-screen bucket-filter block (`baseTrips -> bucketItems -> bucketKey -> viewTrips`) into one shared helper.
3. Remove or wire up currently-declared-but-unused change tracking (`state.tripSnapshot`, `state.changeFlags`, `buildTripSnapshot`, `buildTripChangeFlags`) to reduce dead code ambiguity.
4. Normalize screen-key terminology by documenting `rings` as internal alias of `schedule` and consolidating callers to one key.
5. Centralize repeated `applyPendingScroll()` call pattern in router after each screen render where applicable.
