# Airtable Formulas & Scripts – Project Rules & Reusable Snippets

*Last updated: Oct 16, 2025*

This living document consolidates what we’ve learned in the **airtable_formulas** project: hard rules, gotchas, and reusable snippets for formulas and scripts. Use it as a checklist before shipping any new logic.

---

## 1) Formula Rules & Gotchas

**Not supported in Airtable formulas**

* ❌ `LET()`, `BASE()`, `LAMBDA()` (and other Excel-only functions)
* ❌ Comments inside formulas

**General syntax**

* ✅ Function names are UPPERCASE: `IF`, `SWITCH`, `REGEX_REPLACE`, `DATETIME_DIFF`, etc.
* ✅ Strings use double quotes `"like this"`.
* ✅ Booleans are `TRUE` / `FALSE` (uppercase).

**Blanks and nulls**

* Prefer `IS_BLANK({Field})` and `BLANK()`; avoid lowercase variants.
* When concatenating, coalesce with empty string to avoid `#ERROR`: e.g. `({a}&""&{b})`.

**Dates & times**

* `TODAY()` and `NOW()` are dynamic; use `CREATED_TIME()` / `LAST_MODIFIED_TIME()` when you need a fixed timestamp.
* `DATETIME_DIFF(end, start, 'days')` returns integer; add `+1` when inclusive.

**Regex helpers**

* `REGEX_REPLACE()` is your friend for slugging, suffix/prefix trims, and punctuation stripping.
* Use anchors carefully: `^` start, `$` end. Examples below.

---

## 2) Reusable Formula Snippets

### Slugify (normalize whitespace, collapse dashes, trim edges)

```airtable
LOWER(
  REGEX_REPLACE(
    REGEX_REPLACE(
      REGEX_REPLACE(
        TRIM({insider_phrase}),
        "\\s+",
        "-"
      ),
      "-{2,}",
      "-"
    ),
    "^-|-$",
    ""
  )
)
```

**Strip unsafe chars `&`, `/`, `(`, `)`, `,` (apply after slugify)**

```airtable
REGEX_REPLACE(
  {insider_uuid},
  "[&\\/(),]",
  ""
)
```

### Instagram & X (Twitter) profile links from handle fields

```airtable
IF({Equestrian Team IG},
  "https://instagram.com/" & SUBSTITUTE({Equestrian Team IG}, "@", ""),
  BLANK()
)
```

```airtable
IF({Equestrian Team X},
  "https://x.com/" & SUBSTITUTE({Equestrian Team X}, "@", ""),
  BLANK()
)
```

### Google Maps link from `{formatted_address}`

```airtable
IF({formatted_address},
  "https://maps.google.com/?q=" & ENCODE_URL_COMPONENT({formatted_address}),
  BLANK()
)
```

### Remove a specific suffix (example: remove `-wihs`)

```airtable
REGEX_REPLACE({hotel_preview_uid}, "-wihs$", "")
```

### Replace segment in a UID

Replace trailing `-venue` → `-essentials`:

```airtable
REGEX_REPLACE({venue_uid}, "-venue$", "-essentials")
```

Map `hva-stay-premium` back to `hva-venue` (example):

```airtable
REGEX_REPLACE({some_uid}, "-stay-.*$", "-venue")
```

### Extract parts from `{task_id}` like `hchs-task-2025-10-07`

* Org code `hchs`:

```airtable
REGEX_EXTRACT({task_id}, "^([^ -]+)")
```

* `hchs-blogs`:

```airtable
REGEX_REPLACE({task_id}, "^([^ -]+).*", "$1-blogs")
```

* Year `2025`:

```airtable
REGEX_EXTRACT({task_id}, "(\\d{4})")
```

* `hchs-blog-2025-10-07`:

```airtable
REGEX_REPLACE({task_id}, "^([^ -]+).*?(\\d{4}-\\d{2}-\\d{2})$", "$1-blog-$2")
```

### Create link_uid variants

`capc-venue-official` → `capc-venue`:

```airtable
REGEX_REPLACE({link_uid}, "-official$", "")
```

### Convert meters to miles

```airtable
ROUND(({distance_m} / 1609.344), 2)
```

### Parse drive time ranges like `28–35 min`

* First number `28`:

```airtable
VALUE(REGEX_EXTRACT({approx_drive}, "^(\\d+)") )
```

* Second number `35`:

```airtable
VALUE(REGEX_EXTRACT({approx_drive}, "(\\d+)\\s*min$"))
```

### Prevent `NaN` in status text

```airtable
IF(
  TODAY() < {start_date},
  "Starts in " & DATETIME_DIFF({start_date}, TODAY(), 'days') & " days",
  IF(
    AND(TODAY() >= {start_date}, TODAY() <= {end_date}),
    "Ends in " & (DATETIME_DIFF({end_date}, TODAY(), 'days') + 1) & " days",
    IF({event_estimated_next_start_date},
      "Complete (next in " & DATETIME_DIFF({event_estimated_next_start_date}, TODAY(), 'days') & " days)",
      "Complete"
    )
  )
)
```

### Build blog UID with created date

Outputs e.g. `hchs-blog-2025-09-30`:

```airtable
LOWER({blog_uid} & "-" & DATETIME_FORMAT(CREATED_TIME(), 'YYYY-MM-DD'))
```

---

## 3) Scripting Rules (Airtable Scripting App / Automations)

**Environment**

* Scripts run either in **Scripting extension** or **Automations**. Confirm which; APIs differ slightly (e.g., `input.config()` in Automations).

**Tables & fields**

* Use `base.getTable('Table Name')` or `base.getTableByNameIfExists()` (check for `null` before use).
* Field access: prefer `table.getField('Field Name')`. If you need a safe lookup, implement your own helper (see snippet) since `table.getFieldByNameIfExists` may not be present in all contexts.

**Reading records**

* `const q = await table.selectRecordsAsync({fields: [...]});`
* Always `q.unloadData()` when you’re done in long scripts.

**Creating / updating**

* Batch writes: `createRecordsAsync` / `updateRecordsAsync` in chunks of ≤50.
* Always `await` write calls; handle errors with `try/catch`.

**Linking records**

* Link field values are arrays of `{id}` objects: `{ {linkField: [{id: rec.id}]} }`.
* For “create-or-connect” patterns, search by a stable key (e.g. `keyword_uid`) and create if missing.

**Regex & parsing**

* Use JS `RegExp` for complex parsing (e.g., extracting `hello_outro.outro_pivot → hello_outro_outro_pivot`).

**Common pitfalls**

* Don’t assume a view exists; fetch by name and check.
* Guard for missing fields; create them first if your flow requires it.

---

## 4) Reusable Script Snippets

### Safe field getter

```javascript
async function ensureFieldAsync(table, name, type, options) {
  let field = table.getFieldByNameIfExists && table.getFieldByNameIfExists(name);
  if (!field) {
    await table.createFieldAsync(name, type, options);
    field = table.getField(name);
  }
  return field;
}
```

> If `getFieldByNameIfExists` is unavailable, swap the first line for a try/catch around `table.getField(name)`.

### List all tables with IDs (for a registry table)

```javascript
for (const t of base.tables) {
  output.markdown(`- **${t.name}** — ${t.id}`);
}
```

### Create/Update Section from Hubs + link Keywords

*Pattern:* read `hubs` (view `section-hub`), upsert into `sections` by `section_uid`, link back to `hubs` via single link, link many keywords by `keyword_uid` (create if missing).

Skeleton:

```javascript
const hubs = base.getTable('hubs');
const sections = base.getTable('sections');
const keywords = base.getTable('keywords');

const hubQuery = await hubs.selectRecordsAsync({fields: ['section_uid','section_type','section_title','section_overview','section_keywords','hub_recordId']});
const kwQuery = await keywords.selectRecordsAsync({fields: ['keyword_uid','keyword_name']});

const kwByUid = new Map(kwQuery.records.map(r => [r.getCellValueAsString('keyword_uid'), r]));
const secQuery = await sections.selectRecordsAsync({fields: ['section_uid']});
const secByUid = new Map(secQuery.records.map(r => [r.getCellValueAsString('section_uid'), r]));

const toCreate = [], toUpdate = [];

for (const r of hubQuery.records) {
  const uid = r.getCellValueAsString('section_uid');
  const kwNames = (r.getCellValue('section_keywords') || []).map(k => k.name || k);
  const kwIds = [];
  for (const name of kwNames) {
    const uidKey = String(name).toLowerCase().replace(/\s+/g,'-');
    let kw = kwByUid.get(uidKey);
    if (!kw) {
      const [created] = await keywords.createRecordsAsync([{fields: {keyword_uid: uidKey, keyword_name: name}}]);
      kw = (await keywords.selectRecordsAsync({fields:['keyword_uid']})).getRecord(created.id);
      kwByUid.set(uidKey, kw);
    }
    kwIds.push({id: kw.id});
  }

  const payload = {
    section_uid: uid,
    section_type: r.getCellValueAsString('section_type'),
    section_title: r.getCellValueAsString('section_title'),
    section_overview: r.getCellValueAsString('section_overview'),
    keywords_uid: kwIds,
    hub_uid: r.getCellValue('hub_recordId') ? [{id: r.getCellValue('hub_recordId')[0].id}] : []
  };

  const existing = secByUid.get(uid);
  if (existing) {
    toUpdate.push({id: existing.id, fields: payload});
  } else {
    toCreate.push({fields: payload});
  }
}

while (toCreate.length) await sections.createRecordsAsync(toCreate.splice(0,50));
while (toUpdate.length) await sections.updateRecordsAsync(toUpdate.splice(0,50));
output.text('ok');
```

### Parse `{output}` JSON-like vars into fields on `blogs`

*Maps nested keys like `hello.intro`, `hello_outro.outro_pivot` → `hello_intro`, `hello_outro_outro_pivot`.*

```javascript
const table = base.getTable('blogs');
const fieldTypes = {
  _title: 'singleLineText',
  _paragraph: 'multilineText',
  hello_: 'multilineText'
};

function normKey(k){
  return k.replace(/\./g,'_');
}

// ensure needed fields exist based on discovered keys
async function ensureFields(keys){
  for (const k of keys) {
    const name = normKey(k)
      .replace(/_title$/, '_title')
      .replace(/_paragraph$/, '_paragraph');
    let type = 'multilineText';
    if (name.endsWith('_title')) type = 'singleLineText';
    const exists = table.getFieldByNameIfExists && table.getFieldByNameIfExists(name);
    if (!exists) await table.createFieldAsync(name, type);
  }
}

// parse and write
```

*(complete this per your exact `{output}` structure and field list)*

### Unique 5‑char ID generator (collision‑safe)

> Use an **Automation script** on “When record created” to assign `{short_id}`. Retry on collision.

```javascript
const table = base.getTable('tasks');
const view = table; // or base.getTable('tasks').getView('All');

function randBase36(n=5){
  const s = Math.random().toString(36).slice(2).toUpperCase();
  return s.slice(0,n);
}

async function exists(id){
  const q = await table.selectRecordsAsync({fields:['short_id']});
  return q.records.some(r => r.getCellValueAsString('short_id') === id);
}

let id;
for (let i=0;i<10;i++) {
  id = randBase36(5);
  if (!(await exists(id))) break;
}
if (!id) throw new Error('Could not generate unique 5-char id after retries');

// `input.config()` may provide the triggering record ID in Automations
const recId = input.config()?.recordId || (await table.selectRecordsAsync()).records[0]?.id;
await table.updateRecordAsync(recId, {short_id: id});
```

> If you need deterministic IDs, base it on `RECORD_ID()` hashed client-side (script) rather than formula (Airtable formulas don’t expose hash functions).

---

## 5) Project Conventions

* **Naming**: `snake_case` for field machine names (where possible), kebab-case for UIDs.
* **Versioning**: Append `_v2`, `_v3` for script/formula iterations saved in this doc.
* **Checklists**: Before shipping, run through the Formula & Script Rules above.

---

## 6) Open Items / To Refine

* Attachment-from-URL: finalize the best pattern (Attachment field supports URL paste; for bulk, use script to download or direct URL attach via API where permitted).
* JSON fetch lists: confirm the approved ALLOW_URLS list and implement a robust fetcher script.
* `{output}` parser: finish the mapping table for all nested keys and ensure fallback names.

---

### Using this document

When you ask for a new formula or script, say: *“Follow the rules from **Airtable Formulas & Scripts – Project Rules & Reusable Snippets**.”* I’ll adhere to this source of truth and update it as we learn more.
