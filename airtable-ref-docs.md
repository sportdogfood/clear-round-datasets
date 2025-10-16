# Airtable Docs – Quick Reference (Formulas, Scripting, Automations, API)

*Last updated: Oct 16, 2025*

A curated, always-handy set of official Airtable docs we reference when building formulas and scripts. Use this alongside **Airtable Formulas & Scripts – Project Rules & Reusable Snippets**.

> Tip: When something behaves oddly, scan the relevant section below first. Most answers are one click away here.

---

## 1) Formulas

* **Formula Field Reference (All Functions)**
  [https://support.airtable.com/docs/formula-field-reference](https://support.airtable.com/docs/formula-field-reference)
* **Date & Time Functions**
  [https://support.airtable.com/docs/formulas-date-and-time-functions](https://support.airtable.com/docs/formulas-date-and-time-functions)
* **Text Functions**
  [https://support.airtable.com/docs/formulas-text-functions](https://support.airtable.com/docs/formulas-text-functions)
* **Logical Functions**
  [https://support.airtable.com/docs/formulas-logical-functions](https://support.airtable.com/docs/formulas-logical-functions)
* **Aggregation & Rollup Functions**
  [https://support.airtable.com/docs/formulas-aggregation-and-rollup-functions](https://support.airtable.com/docs/formulas-aggregation-and-rollup-functions)
* **Regex Functions (REGEX_MATCH/REPLACE/EXTRACT)**
  [https://support.airtable.com/docs/formulas-regular-expressions](https://support.airtable.com/docs/formulas-regular-expressions)
* **URL-encoding (ENCODE_URL_COMPONENT)**
  Covered in formula reference above; search for `ENCODE_URL_COMPONENT`.

**Notes & Gotchas**

* Airtable formulas **do not** support Excel-style `LET()`, `LAMBDA()`, or `BASE()`.
* No inline comments allowed; keep helper logic in separate fields if needed.

---

## 2) Scripting (Scripting Extension)

* **Scripting API (Developer Hub)**
  [https://airtable.com/developers/scripting/api](https://airtable.com/developers/scripting/api)
* **Introduction / Concepts**
  [https://airtable.com/developers/scripting](https://airtable.com/developers/scripting)

**Key topics to revisit**

* `selectRecordsAsync`, `createRecordsAsync`, `updateRecordsAsync` (batch ≤ 50)
* Working with **linked records** (arrays of `{id}`)
* Field creation via `createFieldAsync`
* Views vs. tables; querying specific fields for performance

---

## 3) Automations (Automation Scripts & Triggers)

* **Automations API (Scripting in Automations)**
  [https://airtable.com/developers/automations/api](https://airtable.com/developers/automations/api)
* **Automations Overview**
  [https://support.airtable.com/docs/automations-overview](https://support.airtable.com/docs/automations-overview)

**Key topics to revisit**

* `input.config()` for trigger payload
* Differences from the Scripting Extension runtime
* Handling retries / idempotency for upserts

---

## 4) Web API (REST)

* **Web API (REST) – Developer Hub**
  [https://airtable.com/developers/web/api](https://airtable.com/developers/web/api)
* **Authentication & Base IDs**
  See the "Authentication" and "Bases" sections in the Web API docs
* **Rate Limits**
  See the "Rate limits" section
* **Field Types & Attachments**
  See the "Field types" section; attachments allow URL-based uploads

**Helpful when**

* You need to push/pull data at scale
* You want to attach files from URLs programmatically
* You’re building outside Airtable UI (ETL, scripts, servers)

---

## 5) Metadata / Schema

* **Schema & Metadata**
  Start from the Web API docs above and search for "metadata" or "schema". (Airtable’s metadata endpoints and features evolve; the Developer Hub is the current source of truth.)

---

## 6) Attachments

* **How attachments work**
  See Web API → Field types → "Attachment"
* **Adding attachments by URL**
  Web API lets you supply `{url: "https://..."}`; Scripting/Automations can also upload from URLs in supported contexts.

---

## 7) Useful Support Articles

* **Linked Record Basics**
  [https://support.airtable.com/docs/linked-record](https://support.airtable.com/docs/linked-record)
* **Rollup & Lookup Fields**
  [https://support.airtable.com/docs/rollup-field](https://support.airtable.com/docs/rollup-field)
* **Views & Filtering**
  [https://support.airtable.com/docs/views-overview](https://support.airtable.com/docs/views-overview)

---

## 8) Search Phrases (when docs move)

If a link changes, use these precise searches:

* `site:airtable.com/developers scripting api selectRecordsAsync`
* `site:airtable.com/developers automations api input.config`
* `site:support.airtable.com formula field reference`
* `site:airtable.com/developers web api rate limits`

---

### How we’ll use this

* Link to the relevant section in pull-requests / comments.
* Keep this page open while drafting new formulas/scripts.
* When we discover a new quirk, add a short note here **and** add a rule/snippet in the project rules doc.
