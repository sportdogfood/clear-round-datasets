# CRT Daily App — Project Overview & Handoff

## Objective
Deliver a **mobile-first daily show app** that **looks and feels like the legacy TackLists UI**, while rendering horse-show data:
- **Trips overlay (truth):** the active entries the user is following.
- **Full schedule scaffold:** the complete show day schedule (rings → groups → classes), with trips overlaid.

## Data Sources (Git)
- `docs/schedule/data/latest/watch_schedule.json`
  - Full schedule rows (ring/group/class labels + time/status + total_trips).
- `docs/schedule/data/latest/watch_trips.json`
  - Active entry overlay rows (horse/rider/entry + latestGO/placing/score/oog).

## Core Model
- **Schedule is the map** (what exists today, and in what order).
- **Trips are the truth overlay** (what the user actually cares about: active entries).

The UI should support:
- Viewing the **entire schedule** even if the user follows only a few horses.
- Seeing **trip counts and entry detail** on top of the schedule.

## UI Contract (must match legacy)
### Bottom nav
- Markup: `.app-nav > .nav-scroller > #nav-row.nav-row`
- Buttons: `.nav-btn`, selected: `.nav-btn--primary`
- Aggregates: `.nav-agg[data-nav-agg="..."]`, positive: `.nav-agg--positive`

### Global gating toggles (top of screens)
- Two pill buttons using **only** `.nav-btn` / `.nav-btn--primary`:
  - Scope: `ACTIVE` vs `FULL`
  - Status: `LIVE` vs `ALL` (ALL includes Completed)
- No “Scope:” / “Status:” labels.

### Peak filters (per-screen)
- Rendered in a **separate scroller row** (not mixed with toggles).
- Uses `.nav-btn` and `.nav-btn--primary`.
- Screen-specific meaning:
  - Rings screen: peak = ring filter
  - Classes screen: peak = group filter
  - Riders screen: peak = rider filter
  - Summary screen: optional (none by default)

### Cards (Option B)
Lists must **not** render as legacy “pill rows.”
- Introduce a **card container** CSS class (e.g., `.card`) and use it everywhere for list items.
- Use legacy pills (`.row-tag` variants) inside cards for counts/status.
- Active selection must be obvious (card-level active styling).

### Active Horses screen requirements
- Includes `state-search` + `state-search-input`.
- Horse selection (follow/unfollow) must visually reflect active state.

## Screens
- `start` — session start (required)
  - Shows dt/sid/generated_at when available.
  - Button: “Start Session” → routes to Active Horses.

- `state` — Active Horses (follow set)
  - Search input.
  - Card list of horses with trip-count pill.

- `rings` — full schedule view by rings
  - Ring cards; inside card shows group/class lines and trip-counts.

- `classes` — full schedule grouped by class groups
  - Group cards; inside card shows classes and trip counts.

- `riders` — derived from trips overlay
  - Rider cards; trip counts.

- `summary` — flattened overlay (ring + class + horse) for followed horses

## What’s still pending (after this delivery)
1. **Exact copy/wording** for card subtitles and the start screen (if you want it to match a specific legacy script).
2. **More nav aggregates** (e.g., rings/classes counts should be based on current gating + peak).
3. **Edge-case handling**
   - Missing `latestStatus` or missing times.
   - Empty datasets / fetch errors (show a friendly empty state card).
4. **Deep drill-down refinements**
   - Entry detail formatting (placing/score/oog/go).
   - Consistent ordering rules (time then number then OOG).

