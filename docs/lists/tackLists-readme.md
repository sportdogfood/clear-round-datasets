# TackLists.com Style App – Reference Pattern

## 1. Concept recap

* Single-purpose, mobile-style micro-app in a fixed “phone shell”.
* All interaction is pill-based: long pills for rows, small pills for nav and tags.
* One in-memory session per tab, but the **horse list and saves can be wired to Rows** instead of staying purely local.

---

## 2. Layout skeleton (unchanged)

* **Header:** back pill, title, contextual action pill (`Next`, `Text/Send`).
* **Main:** scrollable column of long pills (start options, horses, summary rows).
* **Bottom nav:** horizontal row of small pills (Start, Active Horses, each tack list, Summary) with aggregate tags.

---

## 3. Visual + behavior patterns (unchanged)

* Pills everywhere (header buttons, rows, nav, tags) with:

  * Solid blue when “active/selected”.
  * Neutral dark when idle.
* Tags:

  * Boolean dot (grey/green) or numeric chip (grey for `0`, green for `>0`, optional ✔ when “full”).
* Consistent pill behavior:

  * Tap a row → toggle or navigate.
  * Tap a nav pill → change screen.
  * Tap header action → progress the flow or enter share mode.

---

## 4. Data model pattern

Core idea stays:

* **Entity array**

  * Horses: `[{horseId, horseName, state, lists{list1..list5}}]`.
* **Lanes / lists**

  * Fixed keys: `state` (Active Horses), `list1..list5` for tack categories.
  * Each key appears in three places:

    * A main screen
    * A Summary row
    * A bottom-nav pill
* **Aggregates**

  * Derived every render:

    * Active count
    * Per-list counts (only counting active horses)
    * Summary bottom-nav tag = how many lists have `>0` horses

This same pattern can be reused for any domain (projects/tasks/trips/etc.) by changing the entity fields and lane names.

---

## 5. Rows API integration pattern

Instead of hard-coding `HORSE_NAMES` and keeping everything only in memory, the app can treat **Rows as the source of truth and sink for payloads**:

### 5.1. Read flow: bootstrapping from Rows

* On first visit (or when pressing “New session” on Start), the app:

  1. Calls a **Rows read endpoint** (e.g. a JIT plugin / webhook) to fetch the current horse list:

     * Each row provides `horseId` (or stable slug), `horseName`, and any optional metadata.
  2. Constructs the local `session.horses[]` array from that response:

     * Initialize `state = false` and all `lists.* = false`, **or** reuse any state returned by Rows if you decide to persist per-horse flags there.
  3. Stores a `sessionId` and timestamps exactly as now, but they can also include a Rows correlation ID if needed.

* Result: the app’s UI stays the same, but the *names and IDs* originate from Rows instead of a static array.

### 5.2. Write flow: posting session payload back to Rows

* Whenever you want to “save” or export data (two natural triggers):

  * When the user taps **`Text` → `Send`** on the Summary screen, right before composing the SMS body.
  * Or when leaving Summary / completing a run (explicit `Save` action if you add it).

* The app can then:

  1. Build a compact **session payload**:

     * `sessionId`, `createdAt`, `lastUpdated`
     * `horses[]` with `{horseId, state, lists{...}}`
     * Optional derived aggregates (total active, per-list counts).
  2. POST that payload to a **Rows write endpoint** (e.g. a script / JIT plugin that appends a row or writes JSON into a cell).

     * This turns each in-memory run into a Rows record you can analyze later.

* Rows then holds:

  * The master horse list (input table).
  * A log of “packing sessions” (output table with JSON or denormalized columns).

### 5.3. Why this works well with the current pattern

* The **UI never changes**: pills, screens, and interactions stay exactly as they are.
* Integration points are clean:

  * `ensureSession()` → “if no session, fetch horses from Rows, then build `session`”.
  * `updateLastUpdated()` / `buildShareText()` → natural places to add `postSessionToRows()` without affecting rendering.
* For future apps you can reuse the same idea:

  * A **Rows table for entities** (horses, bags, tasks, items).
  * An **output table for sessions or runs**, each storing the in-memory JSON payload.

---

## 6. Reusing this for other apps

When you build another app in the same style:

1. Define:

   * Entity table in Rows (items).
   * Lanes/lists (columns or metadata).
2. Implement the same three layers:

   * **Rows read** → hydrate `session.items[]`.
   * **Pill UI** → header / long pills / nav pills.
   * **Rows write** → push final `session` payload as JSON.

That lets you keep the exact TackLists visual + interaction language, while swapping only:

* rows table/columns,
* item labels,
* lane names,
* and any custom share/export logic.

---

### Extra example for section 5 – Rows integration

Example configuration snippet for using Rows as the source of horses (instead of a hard-coded array) and as a sink for saving payloads:

```js
const ROWS_API_BASE = "https://api.rows.com/v1";

// IMPORTANT: in production, inject this via window.CRT_ROWS_API_KEY
// or another environment-based mechanism (do not hardcode secrets).
const ROWS_API_KEY =
  window.CRT_ROWS_API_KEY ||
  "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

// selector-data table: filter-key | places-json | collection-json | ...
const SELECTOR_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
const SELECTOR_TABLE_ID = "ac426c27-747f-44f7-a581-d856c7ac23d6";
const SELECTOR_RANGE = "A2:C999";
```

A small helper can then:

* `GET /sheets/{sheetId}/tables/{tableId}/values/{range}` to read the current horse list.
* Map each row into `{ horseId, horseName, state, lists }` before booting the UI.
* `POST` the final `session` JSON into a logging or history sheet when the user completes or sends their list.
