# Clear Round Travel — Agents README
# Version: v1
# Last updated: 2025-09-03 (ET)

Purpose
-------
This README is the single entry point for running “kernel-style” agents against the Clear Round datasets.
It explains where truth lives, how agents load rules, and how to run the add-event flow (hints-only) without drift.

Sources of Truth (must-read)
----------------------------
- Proxy (READ/WRITE): https://crt-b1434e13de34.herokuapp.com
- Manifest (agents):  /items/agents/manifest.json   (full URL: https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json)
- Repo (read-through): https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main/items  (fallback only)

Key Model
---------
- Events are **hub + legs** (weekly “legs” inside a hub window). There is **no separate Event-Series entity**.
- Venue is the location anchor; organizer is the producing entity (not the venue, not the event).
- Records are lightweight and modular; normalizers keep names/dates/labels consistent.
- Inputs supplied by the operator are **hints**. Agents confirm facts (official name/link/dates) before any preview/commit.

Critical Infra Notes
--------------------
- **ALLOW_DIRS** on the proxy must be first-segment tokens only (e.g., `index,agents,events,venues,organizers,...`), not path prefixes like `index/events/`.
- GET supports: .json, .txt, .md, .html, .js
- POST /items/commit supports: **.json and text** files
  - JSON path → body.json = object (pretty-printed by server)
  - Text path (.txt/.md/.html/.js) → body.json = string (server normalizes newlines; appends trailing newline)

Load Order (every run)
----------------------
1) Fetch manifest (proxy-first, then git fallback).
2) If present, load dir-map to resolve/override any folder names the rules expect.
3) Load **ingestion-rules.txt** + the trigger’s rule files (e.g., **event-rules.json** for add-event).
4) Validate availability of normalizers and required relations before any preview.

Current Directories (top-level under /items)
--------------------------------------------
- /index/*         → canonical entity stores (events, venues, organizers, sources, months, days, labels, etc.)
- /agents/*        → agent rules, knowledge, starters (see below)

Agents & Starters (today)
-------------------------
ENABLED
- add/add-event/            → Create event hub (+ legs when applicable); inputs = *hints only*.
  - brief.txt
  - rules.json
  - schema.json
  - instructions.txt

SCAFFOLDED (enable when ready)
- add/update-event/         → Surgical edits to an existing hub/leg (PREVIEW required).

PLANNED / HOLD (not enabled here)
- research-*                → facts-only research (e.g., hotels, restaurants, locale).
- curated-*                 → stitch curated lists and produce curated content.
- index-agent               → local index maintenance & freshness checks.
- reminder-agent            → date-driven reminders (agent-side).
- render/experience         → held until content tracks are finalized.

Absolute Musts for add-event
----------------------------
- Treat user inputs as **hints**. Confirm **official** link/name/dates from the show/organizer/federation.
- Enforce UID naming from **event-rules.json** (slug of sanitized official name).
- If legs exist: confirm each leg’s start/end date; hub window = first leg start → last leg end.
- Source policy: de-duplicate by domain; create/link minimal source records under /index/sources.

Quick Operator “Session Boot”
-----------------------------
Paste these two lines at the top of a new session to avoid drift:

1) Force proxy/tool use
   Use the OpenAPI tool and GET `/items/agents/manifest.json` from `https://crt-b1434e13de34.herokuapp.com` (proxy-first; no raw git).

2) Start add-event with hints (facts must be confirmed)
   Trigger: add-event — HINTS ONLY
   link=<official or candidate HTTPS>
   name=<as seen on site>
   start=YYYY-MM-DD
   is_series=y|n
   Load ingestion-rules + event-rules from manifest paths, confirm official link/name/dates, then PREVIEW.

Preview→Commit Contract (always)
--------------------------------
- PREVIEW shows: lane, full payload(s), target path(s), and notes about unresolved relations.
- COMMIT re-checks HEAD. If drifted, return conflict; re-preview.
- Commit messages include actor: “(actor: human|agent|codex)”.

Common Errors (fast triage)
---------------------------
- not_enabled           → Starter folder/rules missing. Check triggers.txt; add rules.json.
- needs_rules           → Required rule file unreadable (see manifest paths.*).
- needs_normalizer      → Relation didn’t resolve (e.g., venue_uid). Add/point to correct /index/* record.
- validation_failed     → HTTPS/UID/date/series window constraints violated.
- allowlist_denied      → First path segment not in ALLOW_DIRS tokens.
- conflict              → HEAD changed since preview; re-run PREVIEW.

Do/Don’t
--------
- DO keep all rule/knowledge files aligned with hub + legs terminology (no “event-series” entity references).
- DO use proxy URLs in tools and agents; git raw is fallback only.
- DO keep content (POV/tone) out of ops agents; content belongs to separate render/content agents.
- DON’T hardcode “events/…”; use manifest.dirs.* and/or dir-map.
- DON’T skip PREVIEW. Never commit blind.

Where to Edit / Add
-------------------
- Knowledge (rules/policies): /items/agents/knowledge/*
- add-event starter:         /items/agents/add/add-event/*
- update-event starter:      /items/agents/add/update-event/*
- Shared rules:              /items/agents/event-rules.json, /items/agents/venue-rules.json

Operator Notes
--------------
- If something suddenly 404s, first GET `/items/_manifest.json` to verify ALLOW_DIRS and upstream base.
- If a write fails with “Path not allowed”, confirm the **first token** of the path is in ALLOW_DIRS.
- To test text writes quickly: POST /items/commit with { path: "agents/knowledge/TEST.txt", json: "hello\n" }.

Ownership
---------
- Project owner: Clear Round Travel
- Contact: (fill in)
- Timezone: America/New_York
