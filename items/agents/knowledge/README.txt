# README — Kernel & Agents Knowledge
# Clear Round Travel
# Version: v1
# Last updated: 2025-09-01

Purpose
-------
This README is the table of contents and day-to-day runbook for our kernel-based agent
setup. It explains definitions, what files control behavior, how starters load (no
router edits), and the minimal workflows for Humans, the Agent, and Codex.

Glossary
--------
- Kernel: Lightweight loader that resolves a starter key to a task pack by folder
  convention. No manifest/router edits to add tasks.
- Domain: One of { add, research, create, query, reminders } defining a task’s output.
- Starter: The first-line trigger key (e.g., "add-event") that maps to a task pack.
- Task pack / Agent: A folder with rules.json (+ optional prompt.md, schema.json)
  implementing one unit of work.

Knowledge files (authoritative references)
------------------------------------------
Read these for specifics; this README does not duplicate their content.

- permissions-policy.txt   — Light rails (green/yellow/red), who can change what.
- operating-rules.txt      — Roles, domain outputs, PREVIEW→COMMIT lifecycle, runbook.
- output-behavior.txt      — Exact output contracts per domain.
- triggers.txt             — Starter normalization and lookup order.
- naming-policy.txt        — UID/slug/path conventions; link/date/boolean rules.
- validation-checklist.txt — Add/Update PREVIEW checks; conflict handling; lanes.
- error-codes.txt          — Canonical error codes with remediation.
- manifest-contract.txt    — What the dataset manifest governs (proxy, git, allowlist).

Current → Target
----------------
- Today: 1 legacy agent (chatagent) with its own instructions/schema/trigger.
- Target: 5 agents across the 5 domains, plus additional starters as needed.
- Migration: additive. Keep the legacy agent; add new task folders alongside it.

Kernel loader (by convention)
-----------------------------
Lookup order for a normalized starter key S:
1) items/agents/<S>/rules.json
2) items/agents/<domain>/<S>/rules.json    where <domain> ∈ {add, research, create, query, reminders}
Else → { "error": "not_enabled", "detail": "<S>" }
See triggers.txt for normalization rules and examples.

Registry & allowlist (unchanged flow)
-------------------------------------
- Directory registry: items/agents/dir-map.json (v2) with { entities, normalizers, content }.
- Write allowlist: Heroku ALLOW_DIRS mirrors the union of dir-map keys.
- The proxy enforces ALLOW_DIRS (and manifest write_allowlist) on every write.

Governance summary (light rails)
--------------------------------
- Agent: PR-by-default for DATA-WRITE. Human may say “ship directly” for green-lane scopes.
- Codex: PR-by-default. Dataset mechanics allowed with explicit notice.
- Human: direct-commit permitted anytime (Airtable/PowerShell).
- Conflicts: if target changed since PREVIEW → fail safe; re-preview.
(See permissions-policy.txt and operating-rules.txt.)

Domains & outputs (pointer)
---------------------------
- add/        → PREVIEW → COMMIT (writes only after explicit COMMIT).
- research/   → facts-only JSON (no write).
- create/     → content JSON/Markdown (no write).
- query/      → facts-only JSON (no write).
- reminders/  → schedule JSON (no write).
Details in output-behavior.txt.

Day-to-day runbook (Human)
--------------------------
A) Keep registry in sync
   1. In Airtable (dirs table) run the dir-map script: Dry-run → review; Commit → write items/agents/dir-map.json.
   2. Run the printed Heroku one-liner to set ALLOW_DIRS; verify with `heroku config:get`.

B) Commit data safely
   - Use Airtable “commit_all” / PowerShell to send { path, json, message } to the proxy.
   - Ensure path is within ALLOW_DIRS; confirm response/SHA.

C) Use tasks (when enabled)
   - First line = starter key (e.g., “Add Event”, “Update Event”).
   - Review PREVIEW (path + payload + diff for updates).
   - Reply COMMIT to open a PR (default) or “ship directly” for green-lane items.

Starter catalog (living list)
-----------------------------
Current (live)
- starter: chatagent
  folder:  items/agents/chatagent/
  note:    Legacy agent; remains active during transition.

Planned (pending; add when ready)
- add/add-event/            — create new event file (PREVIEW → COMMIT).
- add/update-event/         — surgical edits to one event file (PREVIEW → COMMIT).
- research/research-hotels/ — facts-only lodging nearby (no write).
- query/events-upcoming/    — structured list of upcoming events (no write).
- create/create-section-content/ — content JSON/MD for a page section (no write).
- reminders/daily-due/      — schedule JSON for daily prompts (no write).
(See triggers.txt; only starters with folders are enabled.)

Testing scripts (minimum checks)
--------------------------------
- dir-map script:
  - Dry-run shows valid v2 buckets.
  - Commit writes items/agents/dir-map.json.
  - ALLOW_DIRS equals union of keys (verify via Heroku CLI).
- commit_all script:
  - Handles *_uid and *_uids correctly; empty path is rejected with a clear message.
  - Proxy/network errors surface cleanly; no silent success.

Error handling (pointer)
------------------------
- Common codes: not_enabled, bad_input, validation_failed, allowlist_denied, conflict,
  commit_denied, server_error, upstream_error.
- See error-codes.txt for when they occur and what to do next.

Change control
--------------
- Updates to this README are Yellow (PR required).
- Do not duplicate specs that already live in the files above; link conceptually instead.
