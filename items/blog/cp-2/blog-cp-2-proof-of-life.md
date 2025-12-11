# File: blog-cp-2-proof-of-life.md  
# Version: v2025-12-11  
# Status: CONFIRMED WORKING — blog cp:2 dynamic runner

This file locks in the **working shape** of the `blog-cp:2` pipeline so you
do not have to re-prove it again.

It confirms:

- Trigger: `start blog-cp:2`
- Dynamic job_definition from Rows (not hardcoded)
- Shared cp-2 house in Git (no per-job copies)
- cr0 / pr1 dataset wiring
- Final JSON + HTML committed to `docs/blog/cp-2/finals/`
- Known-good run: `job-4434456`


============================================================
1. Trigger and identity
============================================================

**Trigger phrase:**

start blog-cp:2

This encodes:

- `street` = `"blog"`
- `house`  = `"cp:2"`  (competitions + places, 2 datasets)

The runner uses this trigger to:

1. Look up the **job row** in Rows.
2. Resolve the **house** in Git (`blog/cp-2/...`).


============================================================
2. Job-definition in Rows (authoritative)
============================================================

Rows table:

- Column A: trigger key → `"blog-cp:2"`
- Column B: full `job_definition` JSON as a string

Example (structure only):

```json
{
  "job_id": "job-4434456",
  "street": "blog",
  "house": "cp:2",

  "run_order": ["exp", "crr", "cwr", "prr", "pwr", "rwt"],

  "global_rules": {
    "truth_rules": { "no_fabrication": true },
    "structure_rules": { "schemas_are_fixed": true },
    "governance_rules": { "lane_boundaries_hard": true },
    "safety_rules": { "no_tourism_invention": true },
    "tone_rules": {
      "audience": ["riders", "trainers", "families"],
      "tone": "practical_clear_grounded",
      "avoid_hype": true,
      "avoid_flowery_language": true,
      "focus_on_usefulness": true,
      "acknowledge_working_week": true
    },
    "narrative_rules": {
      "stay_lane_focus": "lodging_only",
      "dine_lane_focus": "food_only",
      "essentials_lane_focus": "groceries_pharmacy_tack_only",
      "locale_lane_focus": "off_grounds_resets_only",
      "outro_lane_focus": "practical_closing_for_riders"
    },
    "could_not_verify_rules": {
      "treated_as_missing": true,
      "never_guess_missing_fields": true,
      "never_echo_literal_string": true,
      "fallback_to_general_sentences": true
    }
  },

  "datasets": [
    {
      "role_key": "cr0",
      "domains": ["event", "venue", "city_season"],
      "sheet_id": "GqOwXTcrQ9u14dbdcTxWa",
      "table_id": "18be0a0d-dbea-43ea-811f-f7bcbf4982d3",
      "range": "A2:B999"
    },
    {
      "role_key": "pr1",
      "domains": ["stay", "dine", "essentials", "locale"],
      "sheet_id": "GqOwXTcrQ9u14dbdcTxWa",
      "table_id": "52d0a628-4e75-4b93-8acd-121a5e860e2e",
      "range": "A2:B999"
    }
  ],

  "paths": {
    "items_root":       "items/blog/cp-2/jobs/job-4434456/",
    "docs_finals_root": "docs/blog/cp-2/finals/",
    "docs_logs_root":   "docs/blog/cp-2/logs/"
  }
}
```

Key points:

- `run_order` is driven by the job, not hardcoded.
- `datasets` define where cr0 / pr1 live in Rows.
- `paths` define where this job’s outputs go.


============================================================
3. House vs Job — where files live
============================================================

### 3.1 House (shared cp-2)

All **cp-2 house files** live once under:

items/blog/cp-2/
  pipeline-spec.json
  style-spec.json
  expeditor-contract.json
  expeditor-map.json
  final-schema.json
  commit-spec.json
  checker.json
  member-template-cr.prompt
  member-template-cw.prompt
  member-template-pr.prompt
  member-template-pw.prompt
  member-template-rwt.prompt

The proof run showed:

items_get → path: "blog/cp-2/pipeline-spec.json"

So:

- The runner fetches the **shared house** at `blog/cp-2/...`.
- It does **not** require copies under `jobs/job-xxxx/...`.

### 3.2 Job-level (per job_id)

Per job, the dynamic parts are:

- The `job_definition` row in Rows.
- The `paths` inside that job_definition.

For `job-4434456`:

docs/blog/cp-2/finals/job-4434456.json
docs/blog/cp-2/finals/job-4434456.html

Those are the actual committed outputs.


============================================================
4. cp:2 vs cp-2 — semantic vs filesystem
============================================================

Two identifiers:

- Semantic house id (in JSON, prompts):

  "house": "cp:2"

- Filesystem-safe slug (in Git paths):

  blog/cp-2/...
  docs/blog/cp-2/...

Rules:

- Use `"cp:2"` inside **job_definition** and conceptual docs.
- Use `"cp-2"` inside **Git paths** and `paths.docs_finals_root`.

The proof run confirms:

- House read: `blog/cp-2/pipeline-spec.json`.
- Final commit paths: `docs/blog/cp-2/finals/...`.


============================================================
5. pipeline-spec and lanes
============================================================

Working `pipeline-spec.json`:

```json
{
  "pipeline": "cp:2",
  "steps": [
    { "name": "exp", "type": "expeditor",
      "description": "Initial data shaping phase" },

    { "name": "crr", "type": "researcher",
      "description": "Event, venue, and city season research phase" },

    { "name": "cwr", "type": "writer",
      "description": "Event/venue/city season narrative" },

    { "name": "prr", "type": "researcher",
      "description": "Stay/dine/essentials/locale research phase" },

    { "name": "pwr", "type": "writer",
      "description": "Stay/dine/essentials/locale narrative" },

    { "name": "rwt", "type": "rewriter",
      "description": "Final merge and polish" }
  ]
}
```

This matches:

- `job_definition.run_order`
- Your UMTS model: exp → collection track → places track → rewriter


============================================================
6. Dataset mapping — cr0 and pr1
============================================================

From `job_definition.datasets`:

```json
{
  "role_key": "cr0",
  "domains": ["event","venue","city_season"],
  "sheet_id": "GqOwXTcrQ9u14dbdcTxWa",
  "table_id": "18be0a0d-dbea-43ea-811f-f7bcbf4982d3",
  "range": "A2:B999"
}
```

```json
{
  "role_key": "pr1",
  "domains": ["stay","dine","essentials","locale"],
  "sheet_id": "GqOwXTcrQ9u14dbdcTxWa",
  "table_id": "52d0a628-4e75-4b93-8acd-121a5e860e2e",
  "range": "A2:B999"
}
```

Runtime logs confirmed:

- `getRowsValues` for cr0 (A2:B999).
- `getRowsValues` for pr1 (A2:B999), returning the full `creator-abc` places
  payload (stay/dine/essentials etc).

Lane mapping:

- `cr0` → feeds **crr** and **cwr** (collection: event / venue / city_season).
- `pr1` → feeds **prr** and **pwr** (places: stay / dine / essentials / locale).

The **expeditor** is the only lane allowed to:

- Shape raw Rows `items` into lane inputs.
- Normalize missing/unusable fields to `"could-not-verify"`.
- Respect schema and domain boundaries.


============================================================
7. could-not-verify + RWT behavior
============================================================

Canonical rules applied in cp:2:

- **Expeditor**
  - Assigns `"could-not-verify"` to missing/null/illegal/contradictory fields.

- **Researchers (crr, prr)**
  - Propagate `"could-not-verify"` when present.
  - Do not guess, repair, or infer across domains.

- **Writers (cwr, pwr)**
  - Never output the literal `"could-not-verify"` in text.
  - Use safe fallback sentences when facts are missing:
    - generic, non-invented, no new specifics.

- **RWT (rewriter)**
  - Fixes mechanics, flow, and cleans hallucinations.
  - Removes any leaked `"could-not-verify"` in visible strings.
  - Moves toward **less specific**, never more specific.

- **Checker**
  - Fails if sentinel appears in final JSON/HTML.

Proof run summary showed:

- No `"could-not-verify"` strings in final output.
- Schema, governance, and tone rules respected.


============================================================
8. Final commit behavior — proof run
============================================================

The working run called `docs_commit_bulk`:

```json
{
  "message": "Final commit for job-4434456",
  "overwrite": true,
  "files": [
    {
      "path": "docs/blog/cp-2/finals/job-4434456.json",
      "content_type": "application/json",
      "content_base64": "..."
    },
    {
      "path": "docs/blog/cp-2/finals/job-4434456.html",
      "content_type": "text/html",
      "content_base64": "..."
    }
  ]
}
```

Git response:

- `ok: true`
- `commit.sha: "6171d32b109e88d9ee306bdb74cfef28f8b88863"`
- `committed_paths`:
  - `docs/blog/cp-2/finals/job-4434456.json`
  - `docs/blog/cp-2/finals/job-4434456.html`

So cp-2 now has:

- A proven JSON final.
- A proven HTML final.
- A known commit SHA.


============================================================
9. Actual execution sequence (job-4434456)
============================================================

For `start blog-cp:2`:

1. Trigger  
   - User: `start blog-cp:2`

2. Load job_definition  
   - From Rows row where col A = `"blog-cp:2"`.

3. Load cp-2 house  
   - Read `blog/cp-2/pipeline-spec.json` (and other house files).

4. Fetch datasets  
   - For each `datasets[*]` entry:
     - Call `getRowsValues(sheet_id, table_id, range)`.

5. Run lanes in run_order  
   - `exp`  → shape, normalize, build lane inputs.  
   - `crr`  → collection research.  
   - `cwr`  → collection narrative.  
   - `prr`  → places research.  
   - `pwr`  → places narrative.  
   - `rwt`  → merge + polish under rewriter constraints.

6. Commit finals  
   - To `docs/blog/cp-2/finals/job-4434456.json`  
   - And `docs/blog/cp-2/finals/job-4434456.html`


============================================================
10. Adding the next cp:2 job (pattern)
============================================================

To add `job-4434457` without touching the house:

1. Do **not** change:

   items/blog/cp-2/...

2. Create a new job_definition in Rows:

   - Same worksheet/table as `job-4434456`.
   - Column A: `blog-cp:2`
   - Column B: new JSON with e.g.:
     - `"job_id": "job-4434457"`
     - Updated `datasets` (if needed)
     - Updated `paths.items_root` / `docs_logs_root` / `docs_finals_root`
       (e.g. `items/blog/cp-2/jobs/job-4434457/`, etc.)

3. Trigger again:

   start blog-cp:2

4. Expected:

   - Same cp-2 house used.  
   - New datasets fetched as defined.  
   - New outputs:

     docs/blog/cp-2/finals/job-4434457.json
     docs/blog/cp-2/finals/job-4434457.html


============================================================
11. Minimal “it works” checklist
============================================================

For any cp:2 job, verify:

- [ ] Trigger used: `start blog-cp:2`
- [ ] Rows row exists:
      - col A = `"blog-cp:2"`
      - col B = valid `job_definition`
- [ ] `job_definition.house` = `"cp:2"`
- [ ] House exists in Git: `items/blog/cp-2/...`
- [ ] `pipeline-spec.json` defines: exp → crr → cwr → prr → pwr → rwt
- [ ] `datasets` entries have valid `sheet_id` / `table_id` / `range`
- [ ] `paths.docs_finals_root` points to `docs/blog/cp-2/finals/`
- [ ] Final commit contains:
      - `docs/blog/cp-2/finals/<job_id>.json`
      - `docs/blog/cp-2/finals/<job_id>.html`
- [ ] Git commit `ok: true` with both paths in `committed_paths`
- [ ] No `"could-not-verify"` in final JSON/HTML

If all are true, cp:2 is **live, dynamic, and reusable**.
