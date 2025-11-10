# 🐎 List-Runner

List-Runner is a small, JSON-backed packing assistant for equestrian shows.
It is designed for mobile and voice: fast, forgiving, and stateful.
All data is versioned in GitHub via a controlled API; no database, no login.

---

## Layout

All List-Runner assets live under:

`items/agents/list-runner/`

Key paths:

* `lists/item_registry.json`        – starter item definitions (name, type, subtype, note, aliases)
* `lists/list_registry.json`        – known lists (tack, equipment, feed, etc.)
* `lists/started_lists.json`        – active per-show lists and item states
* `lists/archived_lists.json`       – archived lists (auto after rules)
* `lists/index.json`                – precomputed counts/summary for quick reads
* `shows/show_schedule.json`        – show calendar (source of truth)
* `logs/updates.json`               – append-only command/event log
* `state.json`                      – runner state (active show/week, etc.)
* `expeditor.js`                    – index + backup utility (CLI)

Upstream is served read-only at:

`https://items.clearroundtravel.com/items/agents/list-runner/...`

Mutations go through the command endpoint:

`POST https://items.clearroundtravel.com/items/agents/list-runner/command`

---

## Data model (concise)

**Shows**

* Defined in `shows/show_schedule.json`.
* Each show has: `show_id`, `show_name`, dates, location.
* Show context drives which lists are active.

**Lists**

* Default per show: `tack`, `equipment`, `feed`.
* List states:

  * `home`   – packing to go.
  * `away`   – at show, tracking bring-home.
  * `complete` – bring-home resolved.
  * Archive: 3+ days after show end (expeditor / backend).

**Items**

* Seeded in `lists/item_registry.json` with:

  * `name`, `type`, `subtype`, `note`, `aliases`, `mispells`.
* When attached to a list for a show, they track two sides:

  * `to_take`: `not_packed` | `packed` | `not_needed`
  * `to_bring_home`: `not_packed` | `packed` | `missing` | `broken` | `left_over` | `sent_back_early`
* Constraints:

  * `missing` / `broken` cannot be reused until explicitly reset.
  * `left_over` stays at show; cannot be put on home list unless returned.

---

## Command surface

All writes flow through:

`POST /items/agents/list-runner/command`

```jsonc
{
  "device_id": "string",       // required, stable per device
  "command": "string",         // required, natural language
  "actor": "optional name",    // who is acting (for audit)
  "now": "2025-11-09T21:54:00Z", // optional client timestamp
  "debug": false
}
```

Backend responsibilities (not client):

* Parse command to structured intent.
* Resolve show (current / next / recent) using `show_schedule.json`.
* Resolve list via `list_registry.json`.
* Resolve items via `item_registry.json` + aliases + fuzzy match.
* Update `started_lists.json` / `archived_lists.json` / `state.json`.
* Append event to `logs/updates.json`.
* Run `expeditor.js update` to refresh `lists/index.json` and backups.
* Return a compact JSON summary for UI/voice.

Typical intents (examples, not exhaustive):

* Add: "add liverpool to equipment"
* Mark packed to take: "mark Girth1 packed to take"
* Mark packed to bring home: "mark Senior packed to bring home"
* Special: "mark thisbit missing", "leave thatbit over for next show", "reset thisbit"
* Query: "show tack list for Pre-Charity", "what's left to pack", "summary for this week"

---

## Runner behavior (for Custom GPT / UI)

The List-Runner assistant:

* Talks casually, in short, clear lines.
* Always identifies which show it is working on.
* Uses the API only; never edits JSON directly.
* Tolerates typos and nicknames:

  * Suggests disambiguation when needed: "blue girth or black girth?".
* Suggests, does not silently flip, list-level states:

  * e.g. "tack looks ready (9 packed, 1 not_needed). Mark list away?"
* Treats backend `ok:false` as real failure and reports in one line.

---

## Ops notes

* All mutations are Git-backed via `/items/commit` or `/items/commit-bulk` behind the command handler.
* `expeditor.js update` should be run by the backend after command batches to:

  * rebuild `lists/index.json`
  * write a dated backup under `logs/backups/`
* `logs/updates.json` is the audit trail; consumers should treat it append-only.

This README describes the contract. Keep the implementation aligned with the OpenAPI (`CRT Runner-Light API`) and these paths.
