# TackLists.com – Mobile Tack List Helper

TackLists.com is a single-page, mobile-first web app for managing simple tack checklists per horse.
It runs entirely in memory in the browser (no backend, no login, no storage).

---

## Overview

Core ideas:

* Fixed list of horses (editable in `app.js`).
* One session at a time, created in memory when you start.
* Each horse has:

  * a **global active flag** (`state`) – “in this session” or not.
  * membership flags in **5 tack lists** (`list1`–`list5`).
* A **Summary** screen shows per-list totals and lets you text out the current state as a plain text checklist.

---

## Screens and Flow

### 1. Start

Entry screen.

* Shows logo (`docs/lists/tacklists.png`), app name, and subtitle.
* Buttons:

  * **New session** – create a new in-memory session and go to **Active Horses**.
  * **In-session** – resume current session, go to **Active Horses**.
  * **Summary** – jump directly to Summary for the current session.
  * **Restart session** – clear current session (all horses reset to inactive), then go to **Active Horses**.

### 2. Active Horses (State)

Main “who’s in” screen.

* Search bar: filter horses by name (client-side, case-insensitive).
* List is split into:

  * **Active** – horses currently included in this session.
  * **Inactive** – horses not in this session.
* Tap a horse:

  * Inactive → **Active** (added to session).
  * Active → Inactive.

    * If the horse belongs to any lists, a confirm dialog warns that it will be removed from all lists.

Header:

* Title: `Active Horses`.
* Right button: **Next** → goes to **List 1 (Schooling Bridles)**.

### 3. Lists 1–5

Per-category lists (Schooling Bridles, Show Bridles, Schooling Girths, Show Girths, Saddles).

* Only **globally active** horses are shown.
* Each list is split into:

  * **Active in this list** – horses currently checked for that list.
  * **Inactive in this list** – other active horses not selected for that list.
* Tap a horse toggles membership for that list:

  * Inactive → Active (row style inverts).
  * Active → Inactive (moved back to lower group).

Header:

* Title: list name (e.g., `Schooling Bridles`).
* Right button: **Next**:

  * From List 1–4 → moves to the next list.
  * From List 5 → moves to **Summary**.

Bottom nav:

* **Start**, **Active Horses**, **Schooling Bridles**, **Show Bridles**, **Schooling Girths**, **Show Girths**, **Saddles**, **Summary**.
* Uses pill highlight to reflect the current area.
* If you jump to a list with **no active horses yet**, the app first sends you to **Active Horses**.

### 4. Summary

High-level counts per list.

* Rows:

  * **Active Horses** – count of globally active horses.
  * Each list (1–5) – count of active members.

    * If the list contains **all** active horses, its pill shows `n ✔️`.
* Tap a row:

  * **Active Horses** → goes to **Active Horses (State)**.
  * A list row → goes to that list’s **Detail** view (same UI as normal list).

Header:

* Right button: **Text** / **Send** toggles share mode.

Share flow:

1. Tap **Text** on Summary → app enters **share selection mode**:

   * Each Summary row becomes a toggle (highlighted when selected).
2. Tap rows to include/exclude them from the outgoing text.
3. Tap **Send**:

   * App builds a plain-text body:

     * One section per selected row.
     * Section header: `List Label (members/active ✔️)` or `List Label (count)`.
     * Members listed one per line; empty lists show `[none]`.
   * Opens the device SMS app via `sms:?&body=...`.

---

## File Structure

Minimal static app:

```text
/
├─ index.html   # HTML + CSS shell; loads app.js
├─ app.js       # All app logic and state (in-memory)
└─ docs/
   └─ lists/
      └─ tacklists.png   # Logo image used on Start screen
```

> If you host from `/docs` on GitHub Pages, adjust the `src` path to the logo accordingly (`lists/tacklists.png` instead of `docs/lists/...`).

---

## Configuration

All configuration is in the top of `app.js`.

### Horses

```js
const HORSE_NAMES = [
  'Cervin',
  'Charly',
  // ...
  'Titan',
  'Zen'
];
```

* Order here defines display order (after alphabetic sort).
* Add/remove names as needed; IDs are derived from index (`h1`, `h2`, …).

### List Labels

```js
const LIST_NAMES = [
  'Active Horses',     // state
  'Schooling Bridles', // list1
  'Show Bridles',      // list2
  'Schooling Girths',  // list3
  'Show Girths',       // list4
  'Saddles'            // list5
];
```

* Update these strings to rename lists.
* The bottom nav and Summary automatically use these labels (via `LIST_LABELS` mapping).

---

## Running Locally

1. Clone or download the repository.
2. Ensure the structure above (`index.html`, `app.js`, logo path) is correct.
3. Open `index.html` directly in a browser, or serve the folder via a simple static server:

   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```
4. Visit the page on a phone or narrow desktop viewport to test the mobile layout.

---

## Notes

* Everything is **in-memory**: reloading the page clears the session.
* There is no analytics, storage, or external API dependency.
* Text export is intentionally simple: just one name per line under each heading so it’s easy to read and edit inside the SMS app.
