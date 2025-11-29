# CRT Top Runner – README

File: `items/agents/crt-blog-runner/crt-top-runner/README.md`
Version: v0.1 – 2025-11-28

---

## 1. What `crt-top-runner` is

`crt-top-runner` is a **single-run, non-interactive pipeline** that generates the **top-block** copy for a blog-style competition page.

For **one** `creation_id`, it:

1. Reads a curated `CompetitionPayload` from **Rows**.
2. Builds three **research lanes**:

   * EVENT: identity + prestige framing of the competition leg.
   * VENUE: physical feel of the showgrounds.
   * CITY/SEASON: off-hours feel of the host city in the relevant season.
3. Merges those into a single **writer bundle**.
4. Runs a **writer** to create two paragraphs + a bridge.
5. Runs a **rewriter** to clean and safeguard the language.
6. Commits:

   * **Logs** for each lane/stage.
   * One **final top-block JSON** ready for downstream use.

Everything runs **end-to-end** off a single trigger:

```text
start crt-top-runner {creation_id}
```

No stage-by-stage questions, no mode selection.

---

## 2. Files and layout (top-level)

Under `items/agents/crt-blog-runner/crt-top-runner/`:

* **Specs + control**

  * `project_overview` – high-level description of the project.
  * `instructions.txt` – full contract (truth model, behavior, errors).
  * `instructions-mini.txt` – short summary for the custom UI (≤8000 chars).
  * `expeditor-spec.txt` – spec for the expeditor (Rows → lane inputs).
  * `expeditor.js` – implementation that follows `expeditor-spec.txt`.

* **Prompts**

  * `research-event-prompt.txt`
  * `research-venue-prompt.txt`
  * `research-city-prompt.txt`
  * `prompt-topblock-writer.txt`
  * `prompt-topblock-rewriter.txt`

* **Runtime Items outputs (per creation_id)**

  * `competition_payload.json` (optional, from expeditor)
  * `event-research-input.json`
  * `venue-research-input.json`
  * `city-research-input.json`
  * `event_research.json`
  * `venue_research.json`
  * `city_research.json`
  * `topblock_research_clean.json`
  * `topblock_writer.json`
  * `topblock_final.json`

On the **Docs** side (committed via `openapi_git.yaml`):

* Logs:

  ```text
  docs/runner/top/logs/{creation_id}-event_research.json
  docs/runner/top/logs/{creation_id}-venue_research.json
  docs/runner/top/logs/{creation_id}-city_research.json
  docs/runner/top/logs/{creation_id}-topblock_research_clean.json
  docs/runner/top/logs/{creation_id}-topblock_writer.json
  docs/runner/top/logs/{creation_id}-topblock_final.json
  ```

* Finals:

  ```text
  docs/runner/top/finals/{creation_id}-topblock_final.json
  ```

All Docs paths **must** begin with `docs/`.

---

## 3. Data flow – stage by stage

### 3.1 Expeditor (Rows → Items inputs)

`expeditor.js` (per `expeditor-spec.txt`):

1. Accepts **one** `creation_id`.
2. Calls Rows (`openapi_rows.yaml`) to get `CompetitionPayload`.
3. If not found:

   * Fails with a clear error.
   * Does **not** write any Items files.
   * Does **not** trigger the runner.
4. If found:

   * Writes:

     ```text
     items/agents/crt-blog-runner/crt-top-runner/competition_payload.json     (optional)
     items/agents/crt-blog-runner/crt-top-runner/event-research-input.json
     items/agents/crt-blog-runner/crt-top-runner/venue-research-input.json
     items/agents/crt-blog-runner/crt-top-runner/city-research-input.json
     ```

   * Then emits/prints the trigger:

     ```text
     start crt-top-runner {creation_id}
     ```

Expeditor **never** commits to Docs and never uses any `items/triggers/*` configuration.

---

### 3.2 Research lanes (EVENT / VENUE / CITY)

Triggered by `crt-top-runner` after lane inputs exist.

Each lane:

* Reads its `*-research-input.json` from Items.
* Uses its `research-*-prompt.txt`.
* Does allowed web research (Category A/B/C).
* Writes a single lane JSON into Items:

  * `event_research.json`
  * `venue_research.json`
  * `city_research.json`
* Commits a matching log file under `docs/runner/top/logs/`.

Key rules for **all** lanes:

* Any fact that cannot be clearly supported:

  * Field value = `"could-not-verify"`.
  * A short reason appended to `*_research.could_not_verify_reasons[]`.
* Any descriptive field that is **not** `"could-not-verify"`:

  * Must have at least one URL in `source_log.primary/secondary/last_resort`.
* No blank required fields.
* No prestige upgrades (e.g., National → International) without Category A/B support.
* If a key page is blocked, 404, or **too large**:

  * Treat it as unavailable.
  * Do **not** try to summarize it.
  * Use `"could-not-verify"` + a reason.

Lane scopes:

* EVENT:

  * Identity, ratings, rider_caliber, “known_for”, “vibe_clause”.
  * No venue architecture, no tourist copy.

* VENUE:

  * Physical setting, architecture, layout, atmosphere, arrival.
  * No event dates/classes, no off-grounds tourism.

* CITY/SEASON:

  * Qualitative weather feel, landscape, day/evening vibe, reset feel.
  * No businesses, brands, hotels, restaurants, or numeric weather stats.

---

### 3.3 Merge → writer → rewriter

After all three lane JSONs are valid:

1. Build `topblock_research_clean.json` in Items:

   * Contains:

     ```json
     {
       "creation_id": "...",
       "event_identity": {
         "event_leg_key": "...",
         "event_name": "...",
         "event_acronym": "...",
         "venue_name": "...",
         "city": "...",
         "state": "...",
         "season_label": "...",
         "rating_string": "...",
         "rider_caliber": "..."
       },
       "competition_payload": { "...": "subset" },
       "event_research": { },
       "venue_research": { },
       "city_research": { },
       "could_not_verify_notes": [ ]
     }
     ```

   * `event_identity` must not contradict `CompetitionPayload`.

   * Normalize to ASCII.

   * Do not erase lane-level `could_not_verify_reasons` or `source_log`.

   * Commit log: `docs/runner/top/logs/{creation_id}-topblock_research_clean.json`.

2. **Writer** (`prompt-topblock-writer.txt`):

   * Input: `topblock_research_clean.json` only (no new http).

   * Output: `topblock_writer.json` with:

     ```json
     {
       "creation_id": "...",
       "event_identity": { "...": "copied" },
       "top_block": {
         "paragraph_1": "...",  
         "paragraph_2": "...",  
         "bridge": "..."        
       }
     }
     ```

   * Paragraph 1: event + venue as a “show world”.

   * Paragraph 2: city + season off-hours feel.

   * Bridge: pivot into stay/dine/essentials planning.

   * No new facts, no prestige above `rider_caliber`, no quoting `rating_string`.

   * Log: `docs/runner/top/logs/{creation_id}-topblock_writer.json`.

3. **Rewriter** (`prompt-topblock-rewriter.txt`):

   * Input: `topblock_writer.json`.
   * Output: `topblock_final.json` (same shape).
   * Only cleans spelling, grammar, flow, and softens borderline claims.
   * Must not change numeric values, structure, or identities.
   * Logs:

     * `docs/runner/top/logs/{creation_id}-topblock_final.json`
     * `docs/runner/top/finals/{creation_id}-topblock_final.json`

---

## 4. Interaction and UI rules

The runner is designed to be **non-interactive** once triggered.

* No mode selection:

  * No “run live vs simulate”.
* No step-wise confirmations:

  * No “Got it, now doing Stage 3” user-facing chatter.
* For the UI (custom runner panel):

  * On success: at most **one** compact “run completed” status line.
  * On failure: **one** clear error with the failing stage label, e.g.:

    * `rows_fetch`
    * `expeditor`
    * `event_research`
    * `venue_research`
    * `city_research`
    * `merge_bundle`
    * `topblock_writer`
    * `topblock_rewriter`
    * `docs_commit`

All stronger behavior and truth rules live in `instructions.txt`.
`instructions-mini.txt` is just enough for the UI and runner wiring.

---

## 5. What `crt-top-runner` cannot do

* It does **not**:

  * Decide what `creation_id` to run; that comes from upstream (Rows / UI).
  * Edit or create any HTML, templates, or blog pages.
  * Write anywhere in Docs outside `docs/runner/top/...`.
  * Work in “simulate” mode via UI toggles (no such option is defined).
  * Depend on hidden configuration files (e.g. `items/triggers/*.json`).

* It must **not**:

  * Invent facts about events, venues, cities, or weather.
  * Upgrade prestige beyond what’s supported by `CompetitionPayload` + research.
  * Change the JSON schema of lane outputs, writer bundle, or finals.
  * Reuse facts from other `creation_id`s as evidence.

---

## 6. Known difficulties and obstacles

### 6.1 Multi-file maintenance

The runner is split across many files:

* `instructions.txt`
* `instructions-mini.txt`
* `expeditor-spec.txt` / `expeditor.js`
* 3 × `research-*-prompt.txt`
* `prompt-topblock-writer.txt`
* `prompt-topblock-rewriter.txt`

Any change to paths, naming, or behavior often touches **several** of these.

Typical pain points:

* Changing Docs paths (`docs/runner/test/...` → `docs/runner/top/...`) requires:

  * Updating `instructions.txt`
  * Updating `instructions-mini.txt`
  * Verifying any hard-coded paths in the orchestration code.

* Changing lane output names or fields requires:

  * Updating the lane prompt,
  * Updating merge logic description,
  * Updating the writer prompt.

A new assistant must assume that **path changes are global** and must be synchronized across all relevant files.

### 6.2 Path prefix and 404 / commit errors

Common failure modes:

* Missing `docs/` prefix in commit paths → commit fails.
* Wrong subfolder (`docs/runner/test/...` vs `docs/runner/top/...`).
* Mismatched filenames (e.g. `wec-ocala-topblock.json` vs `{creation_id}-topblock_final.json`).

Fix:

* Standardize paths in `instructions.txt` and `instructions-mini.txt`.
* Align any orchestration code to those exact strings.

### 6.3 Large or blocked source pages

For city/venue research:

* Some official or tourism pages can be:

  * Too large,
  * Blocked,
  * Time out.

Lanes must:

* Treat them as **unavailable**.
* Not reference connector errors in output.
* Use `"could-not-verify"` with a short reason instead of inventing detail.

### 6.4 Assistant drift over long builds

When a new chat assistant is used:

* Risk:

  * Reliance on cached/memory assumptions from earlier runs.
  * Reintroduction of disallowed behaviors:

    * Asking for “run live vs simulate”.
    * Adding TODO/placeholder comments.
    * Changing the output paths or shapes “for convenience”.

Mitigations:

* Treat `instructions.txt` + `instructions-mini.txt` + `expeditor-spec.txt` as **current source of truth**.
* Always read the **actual files** supplied, not prior chat memory.
* When making changes:

  * Rewrite the full file, not partial patches from older sessions.
  * Never leave “fill-me-in later” markers.

---

## 7. How to build a sibling runner (example: `crt-bottom-runner`)

A new assistant can use this README and the existing files as a template to build `crt-bottom-runner` for a **bottom-block** (stay/dine/essentials) layer.

### 7.1 Folder and paths

Create:

```text
items/agents/crt-blog-runner/crt-bottom-runner/
docs/runner/bottom/logs/
docs/runner/bottom/finals/
```

Mirror the top runner structure:

* `instructions.txt`
* `instructions-mini.txt`
* `expeditor-spec.txt` (or reuse the same expeditor if inputs are identical)
* `expeditor.js` (or shared, parameterized by runner id)
* Lane prompts:

  * e.g. `research-bottom-stay-prompt.txt`
  * e.g. `research-bottom-dine-prompt.txt`
  * e.g. `research-bottom-essentials-prompt.txt`
* Writer / rewriter:

  * `prompt-bottomblock-writer.txt`
  * `prompt-bottomblock-rewriter.txt`

### 7.2 Data model and shape

Decide on a **final JSON shape** like:

```json
{
  "creation_id": "...",
  "bottom_block": {
    "stay": { },
    "dine": { },
    "essentials": { }
  }
}
```

Then:

* Copy and adapt:

  * The **truth model** structure (Category A/B/C).
  * The **could-not-verify** + `source_log` rules.
  * The expected lane outputs and logs.
  * The commit paths:

    ```text
    docs/runner/bottom/logs/{creation_id}-*.json
    docs/runner/bottom/finals/{creation_id}-bottomblock_final.json
    ```

* Adjust:

  * Lane names and scopes.
  * What each lane is allowed to say.
  * Writer prompt and final key names.

### 7.3 Interaction rules

Keep the same UI behavior:

* Single trigger:

  * `start crt-bottom-runner {creation_id}`
* No run-mode toggles.
* No per-stage confirmations.
* Same error-signaling pattern with stage names.

### 7.4 Reuse vs duplication

A new assistant should:

* Reuse **patterns**, not copy text blindly:

  * Expeditor pattern: CompetitionPayload → lane inputs.
  * Lane pattern: input JSON + prompt → lane JSON + logs.
  * Writer/rewriter pattern: merged bundle → writer → rewriter → finals.
* Duplicate and adapt the structure for new data sets, changing:

  * Folder names (`top` → `bottom`),
  * File names (`topblock_*` → `bottomblock_*`),
  * Narrative intent in writer prompts.

---

## 8. Summary

`crt-top-runner` is a **pattern**:

* One curated payload → multiple research lanes → merged bundle → writer → rewriter → logs + final JSON.

The main complexity is **coordination across many small files**, not the individual steps.
Any new runner (like `crt-bottom-runner`) should follow the same pattern, with:

* Clear path conventions,
* Strict truth + “could-not-verify” rules,
* Non-interactive
