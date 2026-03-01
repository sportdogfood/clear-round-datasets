# Schedule App — PRO Project Contracts (v2_79)

## Scope
This README locks the **data + UI contracts** for the current template.

**Non‑negotiables**
- One shared class system + one CSS system across **Pro, Full, Threads, Flyups**.
- No alternate styling per view.
- No structural/template changes unless explicitly requested.
- Any non-critical derives must be **fail‑soft** (blank/hide, never break render).

---

## Views

### Pro (tab currently labeled “Lite”)
- **Toggles**: ON
- **Flyups**: ON
- **Ignores**: ON (inactive horses hidden)
- **SMS**: ON (from flyups + from Threads)

### Full
- Shows **all entry rollups** (unfiltered)
- **No toggles**
- **No flyups**
- **No ignores**
- **No SMS**

### Threads
- SMS from Threads: ON (Pro behavior)
- Ignores apply (inactive horses hidden)

---

## Data Sources

### watch_trips (primary)
- Grain: **entry-in-class** rows
- Used by: Pro list, Pro flyups, horse toggle list, Threads filtering.

Fields used (non-exhaustive, as provided):
- Ring: `ring_number`, `ringName`, `ringWalk`
- Group/Class: `group_name`, `class_group_id`, `class_number`, `class_type`, `schedule_sequencetype`
- Entry: `entry_id`, `backNumber`, `entryNumber`
- Parties: `barnName`, `horseName`, `teamName`, `riderName`
- Estimates: `estimated_start_time`, `estimated_go_time`, `estimated_end_time`, `estimated_start_time`
- Counts: `total_trips`, `remaining_trips`, `completed_trips`, `unscratched_count`
- Status/Timing: `latestStart`, `latestGO`, `latestStatus`, `secondsTill`, `runningOOG`, `lastGoneIn`
- OOG/position sanity: `lastOOG`, `lastPosition`, `lastPlace`
- Results: `lastTime`, `lastScore`, `latestPlacing`, plus `time_one..three`, `score1..3`

### watch_schedule (secondary)
- Grain: **class rows**
- Used by: Full list (class scaffolding + rollups).
- Rollups: `rollup_entries[]` joins back to watch_trips by `entry_id`.

### threads
- Event feed items
- Used by: Threads list + SMS.

---

## Sorting + Grouping (Pro + Full)

### Rings
- Group by `ring_number`
- Sort rings **ascending** (lowest → highest)

### Class groups (future contract)
- Group by `class_group_type`
- Sort by `class_group_sequence` (ascending)
- If missing in payload, the UI must **not break** (fallback grouping allowed).

### Class order within group
- Sort earliest → latest using `time_sort` (number) **ascending**.
- Time strings are intentionally strings; `time_sort` is the preferred deterministic key.

---

## Status Contract

### Incoming values
`latestStatus` values: **Completed**, **Upcoming**, **Underway**

### Status mapping (UI states)
- Completed → DONE
- Upcoming → SOON
- Underway → NOW

### Additional status (required)
- Add **Not Started** to `class_status` controls.
- Must have its own SVG icon and appear in `statusWrap`.

### Icon contract
- Status controls use the **contract icons** (consistent across app).

---

## Class Line Contract (class_card / class_line)

5 columns:
1) time
2) num
3) name
4) tag
5) badge

Geometry:
- time and badge: **equal fixed widths**, always reserved even if null.
- num and tag: **smaller equal fixed widths**, always reserved even if null.
- name: **1fr**, left‑justified, single-line ellipsis.

---

## EPill Contract (rollup)

Display:
- `horseName` (always use normalized short/nickname)
- separator dot
- `lastOOG/total_trips`
- separator dot
- `latestGO`

Rules:
- separators live **between segments**, not inside OOG.
- OOG is max 3 chars.

---

## Names Contract
- `horseName`: normalized short/nickname — always use
- `riderName`: normalized first name/nickname — always use
- `ringName`: normalized short/nickname — always use

---

## Time Contract

### Definitions
- `latestStart`: class start time (display)
- `latestGO`: rider latest go time (display)
- `estimated_start_time`: originally assigned start (machine HH:mm:ss)
- `estimated_go_time`: originally assigned go (machine HH:mm:ss)
- `estimated_end_time`: originally assigned end (machine)

### Start-time winner priority
`latest_estimated_start_time > sanityTme > estimated_start_time`

### GO-time (future)
- Create `calculated_go_time` using:
  - `duration_per_trip * last_order_of_go` applied from `latest_estimated_start_time`
- `last_order_of_go` validity:
  - not blank
  - not > 200
  - not 10000
  - expected blank when `schedule_sequencetype = Under Saddle/Flat`

### secondsTill
- May be negative or positive; **negatives are allowed**.

### Ignore sentinels
- ignore numeric sentinel: `100000`
- ignore duration/time sentinel: `00:00:00`

---

## runningOOG Contract
- Only calculate/show when:
  - `latestStatus = Underway` AND `lastGoneIn = 0`
- Must stop/hide when:
  - `latestStatus = Completed`, or
  - `latestStatus = Underway` AND `lastGoneIn = 1`

---

## Results Contract
- `lastTime` appears only for class_type **J** or **H**
- `lastScore` appears only for class_type **E**
- `latestPlacing` is placing (“ribbon”)

---

## Horse Toggles / Ignores
- Source list derives from **unique `watch_trips.horseName`** (schedule-only).
- Default state: **Active**.
- Tap cycles Active ↔ Inactive.
- Inactive horses are hidden in **Pro + Threads** only.
- Full is unfiltered by toggles.

---

## SMS Safety Rule
- SMS bodies must remain minimal to avoid brittleness.
- Current temporary rule: **2 lines** (status + 3 datapoints) per flyup.
- Avoid multi-line literal breaks inside JS string literals.

---

## Temporary debug display
- `dj_go_dt5` may be displayed in Entry flyup as a temporary diagnostic row.

