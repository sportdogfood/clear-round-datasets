// Project: CRT BLOG-RUNNER
// File: crt-blog-runner-project-overview
// Version: v0.1 – 2025-12-02
// Session stamp: session_id: crt-runners/crt-blog-runner-2025-12-02T12-xx-ET

---

## 1. Purpose of this document

This overview captures the **current state** of the CRT BLOG-RUNNER and the **remaining work** required to treat it as LIVE-ready.

It is written so another assistant can pick up the project and continue without needing prior context.

---

## 2. High-level goal of CRT BLOG-RUNNER

For a single `creation_id`, CRT BLOG-RUNNER:

1. Reuses upstream **TOP** and **BOTTOM** runners (already LIVE contracts).
2. Reads their **final JSON outputs from Docs** (no Rows, no Expeditor).
3. Assembles a single **BLOG JSON** with this structure:

   * `event_identity` (copied from TOP).
   * `hello` (intro + transition).
   * Four lanes from BOTTOM: `stay`, `dine`, `locale`, `essentials` (aligned structure).
   * `outro`.
   * `seo`.
   * `workflow` (stage + timestamps).
4. Treats the above as **one continuous blog-style article**.
5. Runs **blog-writer** then **blog-rewriter** prompts to:

   * Clean spelling/grammar.
   * Fix broken sentences and tempo.
   * Smooth transitions between lanes.
   * Fill SEO fields, without inventing new places/brands or facts.
6. Commits:

   * `docs/runner/blog/finals/{creation_id}-blog.json`
   * `docs/runner/blog/finals/{creation_id}-blog.html`
7. Supports UI-driven **inline editing** with three buttons:

   * **Check** → diagnostic pass only.
   * **Rewrite** → apply rewriter on edited BLOG + re-commit JSON/HTML.
   * **Approve** → mark BLOG as approved and (optionally) re-render HTML.

The runner must be **non-interactive** in main mode: no questions, no options, no tone choices once triggered.

---

## 3. Current state (as of this session)

### 3.1. Upstream inputs (TOP and BOTTOM)

* TOP-RUNNER final JSON:

  * Path: `docs/runner/top/finals/{creation_id}-topblock_final.json`.
  * Shape:

    * `creation_id`.
    * `event_identity` (event_leg_key, event_name, event_acronym, venue_name, city, state, season_label, rating_string, rider_caliber).
    * `top_block` (paragraph_1, paragraph_2, bridge).

* BOTTOM-RUNNER final JSON:

  * Path: `docs/runner/bottom/finals/{creation_id}-bottomblock_final.json`.
  * Shape:

    * `creation_id`.
    * `hub_meta`.
    * `bottom_block.stay/dine/locale/essentials/outro` with titles, paragraphs, spectator_tip, cta, items[] (where present).

Both have been successfully read and validated in at least one full CRT BLOG-RUNNER run for `creation_id = creator-abc`.

### 3.2. BLOG JSON schema (current contract)

* Final BLOG JSON is committed to:

  * `docs/runner/blog/finals/{creation_id}-blog.json`.

* Schema (summary, see `instructions.txt` for full detail):

  * `creation_id`.
  * `event_identity` (copied from TOP; treated as ground truth).
  * `source_files`:

    * `topblock = "docs/runner/top/finals/{creation_id}-topblock_final.json"`
    * `bottomblock = "docs/runner/bottom/finals/{creation_id}-bottomblock_final.json"`
  * `hello` (intro, transition).
  * `stay` / `dine` / `locale` / `essentials`:

    * `title`, `paragraph`, `transition`, `spectator_tip`, `cta`, `items[]`.
    * `items[]` contains `{ name, link, alt, type }` (type may be empty).
    * For `locale`, items/cta are allowed but may be empty/"".
  * `outro` (pivot, main).
  * `seo` (section_title, meta_description, open_graph_title, open_graph_description, search_title, search_description).
  * `workflow`:

    * `stage`: `draft_v1` | `draft_rewritten` | `approved`.
    * `last_refresh_at`: null or ISO-8601 string.
    * `last_approved_at`: null or ISO-8601 string.

A full end-to-end run for `creator-abc` has produced and committed a BLOG JSON matching this schema.

### 3.3. Instructions files

* `items/agents/crt-blog-runner/instructions.txt` (LONG):

  * Defines:

    * Non-interactive interaction policy (no questions or options in main run).
    * Trusted inputs (TOP/BOTTOM finals) and their paths.
    * Detailed BLOG schema and mapping from TOP/BOTTOM.
    * Roles of `blog-writer.txt`, `blog-rewriter.txt`, `prompt-blog-checker.txt`.
    * Pipelines:

      * Main run (start crt-blog-runner {creation_id}).
      * Inline button modes (check/rewrite/approve) as HTTP/UI-driven flows.
    * Safety and editorial constraints (no new places, no strong guarantees, practical rider-first tone).

* `items/agents/crt-blog-runner/instructions-mini.txt` (MINI):

  * Mirrors the LONG file in compressed form.
  * Controls trigger behavior:

    * On `start crt-blog-runner {creation_id}` → run full pipeline (load → assemble → writer → rewriter → commit) exactly once.
    * On failure → log to `docs/runner/blog/logs/{creation_id}-error.json` and return one short failure message.
    * On success → return one short success message listing committed paths and workflow.stage.
  * Explicitly forbids interactive questions, preview prompts, and tone options.

These two files now agree on:

* Input paths.
* Output paths.
* File names for prompts.
* Non-interactive behavior.

### 3.4. Prompt files (writer, rewriter, checker)

All under `items/agents/crt-blog-runner/`:

1. `blog-writer.txt`

   * Input: assembled BLOG JSON + read-only references to TOP/BOTTOM finals.
   * Output: one BLOG JSON in the exact same schema and key order.
   * Allowed changes:

     * Human-readable strings only (hello, stay/dine/locale/essentials text, outro, seo).
   * Must not:

     * Change event_identity, URLs, place/brand names, or items[] lengths.
   * Responsibilities:

     * Fix spelling/grammar/broken sentences.
     * Smooth major transitions.
     * Fill `transition` fields where natural.
     * Fill SEO fields with grounded, non-hyped text.

2. `blog-rewriter.txt`

   * Input: BLOG JSON from writer or human-edited BLOG JSON.
   * Output: same schema, with micro-level polish.
   * Stricter constraints:

     * No structural changes, no new facts, no cross-lane moves.
   * Responsibilities:

     * Clean final rhythm and clarity.
     * Tighten transitions without altering meaning.

3. `prompt-blog-checker.txt`

   * Input: BLOG JSON.
   * Output: diagnostic JSON:

     * `ok`: boolean.
     * `summary`: 2–4 sentence high-level assessment.
     * `issues[]`: array of { field, severity, category, example, suggestion }.
   * No commits and no rewrites.
   * Used by the **Check** button only.

All three prompt files have been updated to:

* Match the BLOG schema described above.
* Use consistent file names (`blog-writer.txt`, `blog-rewriter.txt`, `prompt-blog-checker.txt`).
* Respect safety and tone rules.

### 3.5. OpenAPI / tools

* Current OpenAPI spec in use:

  * `CRT Runner-Light API` v1.2.3.
  * Server: `https://items.clearroundtravel.com`.
  * Supports:

    * `GET /items/{path}` → raw Items files (text/plain).
    * `GET /docs/{path}` → raw Docs files (text/plain).
    * `POST /docs/commit-bulk` → commit multiple `docs/*` files.
    * `GET /http-get` → generic HTTP GET for research (not used by blog-runner).

* For commits:

  * `FileItem.path` must begin with `docs/`.
  * `content_type` is one of: `text/html`, `application/json`, `application/xml`.

The BLOG-RUNNER is already successfully using `docs/commit-bulk` to write:

* `docs/runner/blog/finals/{creation_id}-blog.json`.
* `docs/runner/blog/finals/{creation_id}-blog.html`.

### 3.6. Blog HTML output (current behavior)

* HTML is committed to:

  * `docs/runner/blog/finals/{creation_id}-blog.html`.

* Accessible via public site, e.g.:

  * `https://blog.clearroundtravel.com/runner/blog/finals/creator-abc-blog.html`.

* Current state:

  * Renders as HTML (not just raw text) on the public site.
  * **Does NOT yet include**:

    * Inline editing hooks for each BLOG field.
    * Visual controls/buttons for Check / Rewrite / Approve.
    * Client-side JS to POST `{ creation_id, mode, blog }` back into the runner.

This indicates that the runner side is wiring the template correctly, but `blog-template.html` is still a **static article shell**, not a full inline editor.

### 3.7. Interaction behavior (chat logs)

* Earlier runs showed interactive chatter:

  * Asking whether to preview JSON.
  * Asking for tone selection.
  * Offering Continue / Preview choices.
* These behaviors are now explicitly **forbidden** in `instructions.txt` and `instructions-mini.txt`.
* Expectation going forward:

  * A single short success message for the main run.
  * A single short failure message on error.
  * Button modes (check/rewrite/approve) return structured results but no questions.

The underlying behavior may still need one more adjustment pass to fully eliminate legacy chatter, but the contracts are now clear.

---

## 4. What already works end-to-end

For at least one `creation_id` (creator-abc):

1. **Top and bottom finals are present and valid** in Docs.
2. **Blog-runner main pipeline runs to completion**:

   * Loads TOP/BOTTOM finals via `/docs/{path}`.
   * Assembles internal BLOG object with expected fields.
   * Calls `blog-writer.txt` then `blog-rewriter.txt`.
   * Validates schema.
   * Commits:

     * `docs/runner/blog/finals/creator-abc-blog.json`.
     * `docs/runner/blog/finals/creator-abc-blog.html`.
3. JSON and HTML are both reachable via:

   * `https://items.clearroundtravel.com/docs/runner/blog/finals/creator-abc-blog.json` (raw JSON).
   * `https://items.clearroundtravel.com/docs/runner/blog/finals/creator-abc-blog.html` (raw HTML source).
   * `https://blog.clearroundtravel.com/runner/blog/finals/creator-abc-blog.html` (rendered HTML).
4. BLOG JSON content:

   * Represents a coherent WEC Ocala Spring 2026 guide.
   * Follows the lane structure (hello, stay, dine, essentials, outro, seo, workflow).
   * Has at least `workflow.stage = "draft_v1"`.

Main missing pieces now are **UI/editor-layer** and **strict enforcement** of non-interactive responses.

---

## 5. Remaining work before declaring LIVE

Below is a checklist of open items.

### 5.1. Finalize non-interactive behavior

Goal: Main run behaves like a pure worker.

* [ ] Confirm the currently deployed BLOG-RUNNER actually obeys the updated instructions:

  * Trigger: `start crt-blog-runner {creation_id}`.
  * Expectation:

    * NO questions.
    * NO tone options.
    * NO intermediate “would you like…” prompts.
    * Single compact success/failure message only.
* [ ] If legacy chatter persists, tighten the instructions again or adjust the runner’s top-level behavior so it only reads `instructions-mini.txt` for chat-facing behavior.

### 5.2. Implement `blog-template.html` as a real inline editor

Current template is effectively static.

Remaining tasks:

* [ ] Upgrade `items/agents/crt-blog-runner/blog-template.html` to:

  * Include `<script id="blog-data" type="application/json">...BLOG JSON...</script>`.
  * Render each BLOG field into elements with explicit hooks, for example:

    * `data-blog-field="hello.intro"`, `data-blog-field="stay.paragraph"`, etc.
    * `contenteditable="true"` where inline editing is allowed.
  * Render three buttons:

    * `data-blog-action="check"`
    * `data-blog-action="rewrite"`
    * `data-blog-action="approve"`
  * Add JS that:

    * Reads the JSON from `#blog-data`.
    * Syncs DOM edits back into a BLOG JSON object.
    * POSTs `{ creation_id, mode, blog }` to the appropriate runner endpoint for button modes.

* [ ] Ensure the HTML keeps the article visually simple and readable (no CMS styling conflicts) but exposes enough hooks for the JS.

### 5.3. Wire button modes to backend behavior

Backend contract is described in `instructions.txt` under **Button / inline modes**.

Tasks:

* [ ] Confirm or implement the endpoint that receives:

  * `{ creation_id, mode: "check" | "rewrite" | "approve", blog: { ... } }`.

* [ ] Implement the following flows:

  1. **Check** (`mode = "check"`):

     * Use `prompt-blog-checker.txt`.
     * Return a JSON diagnostic object `{ ok, summary, issues[] }`.
     * No commit to Docs.

  2. **Rewrite** (`mode = "rewrite"`):

     * Input BLOG = user-edited JSON from page.
     * Run `blog-rewriter.txt`.
     * Validate schema.
     * Overwrite Docs finals:

       * `docs/runner/blog/finals/{creation_id}-blog.json`.
       * `docs/runner/blog/finals/{creation_id}-blog.html` (re-rendered from template).
     * Set `workflow.stage = "draft_rewritten"` if not already approved.

  3. **Approve` (`mode = "approve"`):

     * Load latest BLOG JSON from Docs or trust payload (depending on system guarantees).
     * Set:

       * `workflow.stage = "approved"`.
       * `workflow.last_approved_at = now (ISO-8601)`.
     * Optionally re-render HTML to show approved state.
     * Commit JSON (+ HTML if refreshed).

* [ ] Decide and encode policy for edits after approval:

  * Either disallow further rewrites for `workflow.stage = "approved"`, or allow with explicit override.

### 5.4. Confirm file name and path consistency

* [ ] Double-check that the deployed runner uses exactly these file names:

  * `items/agents/crt-blog-runner/instructions.txt`
  * `items/agents/crt-blog-runner/instructions-mini.txt`
  * `items/agents/crt-blog-runner/blog-writer.txt`
  * `items/agents/crt-blog-runner/blog-rewriter.txt`
  * `items/agents/crt-blog-runner/prompt-blog-checker.txt`
  * `items/agents/crt-blog-runner/blog-template.html`

* [ ] Confirm all references inside instructions and any code/specs match these names exactly (no leftover `prompt-blog-writer.txt` or `prompt-blog-rewriter.txt` references).

### 5.5. Logging and error handling

* [ ] Ensure blog-runner writes error logs consistently to:

  * `docs/runner/blog/logs/{creation_id}-error.json`.
  * Contents should clearly state:

    * stage: e.g. "load", "assemble", "writer", "rewriter", "commit".
    * message: short explanation.
    * optionally: stack/trace or upstream error snippet.

* [ ] Optionally add a CHECK log location:

  * e.g. `docs/runner/blog/logs/{creation_id}-check.json` for persisted checker output (if desired).

### 5.6. Optional polish before wider LIVE use

These are not blockers but useful improvements:

* [ ] SEO pattern review:

  * Validate that `seo.*` outputs from writer/rewriter are concise, consistent, and do not overpromise.

* [ ] Layout alignment across hubs:

  * Ensure `blog-template.html` uses a shared CRT layout (typography, spacing) consistent with other runner outputs.

* [ ] Content QA for one or two additional `creation_id` samples beyond `creator-abc`.

---

## 6. Summary

* CRT BLOG-RUNNER successfully runs end-to-end for at least one `creation_id` and commits both BLOG JSON and HTML to Docs.
* Instructions (long + mini) and prompt contracts (writer/rewriter/checker) are now aligned on schema, file names, paths, and non-interactive behavior.
* Main remaining work is **front-end/editor-focused**:

  * Upgrading `blog-template.html` into a true inline editor with buttons.
  * Wiring button modes (check/rewrite/approve) to the backend behaviors defined in `instructions.txt`.
  * Verifying that all chat-facing flows remain strictly non-interactive beyond a single final status line.

Once those items are complete and validated on 2–3 sample events, CRT BLOG-RUNNER can be treated as LIVE for publishing competition hub blogs.
