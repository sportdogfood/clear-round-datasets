# TackLists (TackLists.com) — Mobile Tack List App

Single-page mobile web app for maintaining quick “packed / not packed” tack lists per horse. Session is stored locally (no server writes) and can be texted via the device SMS handler.

## What it does

- Start / State / Lists / Summary / Share screens
- Select Active Horses
- For each list (e.g., Bridles, Girths), toggle horses as Packed / Not Packed
- Summary shows counts per list
- Share screen generates SMS body for:
  - Packed
  - Not Packed
- Autosave to localStorage with sliding expiration (TTL)

## Data sources (static JSON)

The app loads two JSON files (served from the same GitHub Pages site):

- `./data/lists.json`
  - Drives list definitions, labels, and which lists appear in nav/summary/share.
- `./data/horses.json`
  - Provides the horse “catalog” used only when creating a new session (or restart).

If either file is missing/unavailable, the app falls back to hardcoded defaults.

### `data/lists.json` shape

An array of objects:

```json
[
  {"key":"state","label":"Active Horses","type":"state","inNav":true,"inSummary":true,"inShare":true},
  {"key":"list1","label":"Schooling Bridles","type":"list","inNav":true,"inSummary":true,"inShare":true}
]
```

Rules:

- `key` and `label` are required.
- `type` is `"state"` or `"list"` (defaults to `"list"`).
- `inNav`, `inSummary`, `inShare` default to `true` when omitted.
- The app ensures a `state` definition always exists.

### `data/horses.json` shape

Array of objects containing at least:

- `"Barn Name"` (string) → used as `horseName`
- `Horse_Active` (boolean) → used as `barnActive` indicator only

Example:

```json
[
  {"Barn Name":"ATLAS","Horse_Active":true},
  {"Barn Name":"DARBY","Horse_Active":false}
]
```

Notes:

- `Horse_Active` is not auto-selected into Active Horses; it only adds an indicator.

## Session storage (local)

Session persists in `localStorage` and survives refresh/tab close.

### Storage keys

- `tacklists_session_v1` — session
- `tacklists_horses_catalog_v1` — cached catalog
- `tacklists_lists_catalog_v1` — cached lists config

### TTL behavior

- Session includes an `expiresAt` timestamp.
- TTL is 12 hours from the last meaningful change (sliding).
- Only New session and Restart session force a fresh session.

## Repo layout (GitHub Pages)

Minimum working layout:

```
/
  index.html
  tacklists.png
  /data
    lists.json
    horses.json
  /js
    tl.core.js
    tl.storage.js
    tl.lists.js
    tl.catalog.js
    tl.session.js
    tl.router.js
    tl.ui.js
    tl.nav.js
    tl.screens.js
    tl.boot.js
```

Important:

- Paths are relative to the folder containing `index.html`.
- GitHub Pages is case-sensitive.

## Operational notes

- The app can run entirely from static hosting (GitHub Pages).
- The “Share” screen uses `sms:?&body=...` which relies on the device’s SMS handler.
- The session is designed to be resilient to missing/malformed JSON by falling back to defaults.

## Tap-active (brand standard)

**Tap-active** is the brand pattern for “this row is the current selection” and “this row responds to touch like a control,” without introducing new UI components.

It’s the combination of two classes:

- `.row--tap` = “this row is tappable”
  - enables cursor + user-select rules
  - adds the press animation (`:active` transform + shadow shift)
- `.row--active` = “this row is currently selected / on”
  - changes border + background gradient
  - raises the row visually (stronger shadow)
  - communicates state at a glance

In other words:

- **Interaction affordance** = `.row--tap`
- **Selection/state** = `.row--active`

### Why it’s brand-critical

Brandwise, “tap-active” is your reusable control surface:

- One consistent “pill row” component across screens
- One consistent pressed feedback (micro-motion)
- One consistent active state (accent border + gradient)
- No new button styles needed for list behavior (keeps the UI calm and familiar)

That consistency is the cadence: users don’t have to learn new controls as they move from Start → State → Lists → Summary → Share.

### Rules to keep across the codebase

1. Keep the row component as the primary control.
   - Prefer rendering actions as `.row.row--tap` rather than creating new button styles.
2. Use `.row--active` only for true state.
   - Active horse, packed status, current selection, etc.
3. Keep the press feedback unchanged.
   - The `:active` transform/shadow is part of the tactile feel.
4. Do not introduce alternate tap patterns.
   - No competing hover/press systems, no new pill variants unless they map to this same model.

## Safe change workflow (don’t break cadence)

- Change one module at a time and test:
  - Start → New session
  - Toggle Active Horses
  - Toggle a list membership
  - Summary counts
  - Share (Packed/Not Packed)
  - Restart session
- Keep public function names used by `tl.boot.js` stable (e.g., `TL.ui.setScreen`, `TL.ui.goBack`).

## Troubleshooting

- If the UI is blank or nav is missing, open DevTools Console:
  - Any uncaught error in boot will prevent render.
- If JSON doesn’t load, confirm these URLs return 200:
  - `./data/lists.json`
  - `./data/horses.json`
- If scripts don’t load on GitHub Pages, confirm file names and paths are exact (case-sensitive).

