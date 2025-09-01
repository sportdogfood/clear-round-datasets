# README — Kernel & Agents Knowledge
# Clear Round Travel
# Version: v1
# Last updated: 2025-09-01

Purpose
-------
This README is the table of contents and runbook for our kernel-based agents.
It explains definitions, day-to-day workflow, where policies live, and how we
scale from our current single agent to five agents across the five domains.

Glossary
--------
- Kernel: The lightweight loader that resolves a starter key to a task pack by
  folder convention. No router/manifest edits to add tasks.
- Domain: One of { add, research, create, query, reminders } that governs a task’s
  output contract. See output-behavior.txt.
- Starter: The first-line trigger key that loads a task pack (e.g., "Add Event").
- Agent / Task Pack: A folder with rules.json (+ optional prompt.md, schema.json)
  that defines one unit of work loaded by the kernel.

Where the rules live (read these)
---------------------------------
- permissions-policy.txt — Light rails (green/yellow/red), who can change what, rail triggers.
- operating-rules.txt — Roles, domain output contracts, PREVIEW→COMMIT lifecycle, runbook.
- manifest-contract.txt — What the dataset manifest governs (proxy_base, git_base, allowlist).
- output-behavior.txt — Stable outputs per domain (add/research/create/query/reminders).
- triggers.txt — Mapping of starter phrases → expected folder key(s).
- naming-policy.txt — UID, slug, path, link rules.
- validation-checklist.txt — Pre-commit checks for DATA-WRITE.
- error-codes.txt — Stable kernel/proxy error codes and suggested remediation.

Current state → Target
----------------------
- Today: 1 agent (our legacy chat agent) with its own instructions/schema/trigger/rules.
- Target: 5 agents (one per domain) with additional starters as needed.
  We do this incrementally—no refactor required. Add new task packs alongside the current one.

Kernel loader (no manifest edits)
---------------------------------
Lookup order for a starter key:
1) items/agents/<starter>/rules.json
2) items/agents/<domain>/<starter>/rules.json
Else → { "error": "not_enabled", "detail": "<starter>" }

Data registry & allowlist (unchanged)
-------------------------------------
- dir-map.json (v2) at items/agents/dir-map.json is the directory registry:
  { entities, normalizers, content }.
- ALLOW_DIRS on Heroku is derived from dir-map.json and gates write paths.

Daily runbook (Human)
---------------------
A) Registry: In Airtable (dirs table)
   - Dry-run dir-map script → review JSON buckets.
   - Commit → items/agents/dir-map.json via proxy.
   - Run the printed Heroku one-liner to set ALLOW_DIRS, then verify.

B) Data commits
   - Use Airtable “commit_all”/PowerShell to push { path, json, message }.
   - Confirm response/SHA. Paths must be within ALLOW_DIRS.

C) Tasks (when enabled)
   - First line = starter key (e.g., “Add Event”, “Update Event”).
   - Review PREVIEW; only COMMIT when correct. Agent writes as PR by default.

PREVIEW → COMMIT (summary)
--------------------------
1) Validate inputs per rules.json.
2) Derive & validate (UIDs, dates, https links, relations or deferrals).
3) PREVIEW: shows { path, payload, and diff summary if updating }.
4) Human decides: COMMIT / EDIT / CANCEL.
5) Write via proxy (PR-by-default). If file changed since preview → fail safe (re-preview).

Agents catalog
--------------
Below lists what exists now and the initial targets. Add folders when ready;
no router or manifest changes needed.

Current (legacy)
- starter: chatagent
  location: items/agents/chatagent/ (or your current path)
  notes: Has specific instructions/schema/trigger; remains active during transition.

Planned (phase-in; names are placeholders you can adjust)
- Domain add/:
  - starter: add-event
    location: items/agents/add/add-event/
    brief: creates a new event file with minimal safe fields; PR-by-default.
  - starter: update-event
    location: items/agents/add/update-event/
    brief: surgical edits to a single event file (e.g., description, official_link); PR-by-default.

- Domain research/:
  - starter: research-hotels
    location: items/agents/research/research-hotels/
    brief: facts-only JSON about lodging near a venue; no commit.

- Domain query/:
  - starter: events-upcoming
    location: items/agents/query/events-upcoming/
    brief: returns structured list of upcoming events; no commit.

- Domain create/:
  - starter: create-section-content
    location: items/agents/create/create-section-content/
    brief: emits content JSON/Markdown per task schema; no commit.

- Domain reminders/:
  - starter: daily-due
    location: items/agents/reminders/daily-due/
    brief: emits schedule JSON (RRULE-like) for follow-ups; no commit.

(Only enable what you need now; others can be added later.)

Lanes & rails (operational defaults)
------------------------------------
- Agent: PR-by-default; you can say “ship directly” for green-lane changes.
- Codex: PR-by-default; dataset mechanics allowed with an explicit notice.
- Human: direct-commit permitted any time (fast lane).
- On conflict (HEAD changed since preview): fail safe; re-preview.

Change control for this README
------------------------------
- Updates to this file are Yellow (PR required).
- Do not duplicate details from the other knowledge files; link conceptually.
