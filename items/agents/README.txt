# Clear Round Travel — Agents README
# Version: v1.3
# Last updated: 2025-09-07 (ET)

Purpose
-------
This README is the single entry point for running lane-scoped agents against the Clear Round datasets. It explains where truth lives, how agents load rules, and how to run add-event (hints-only) without drift.

Sources of Truth (must-read)
----------------------------
- Proxy (READ/WRITE): https://crt-b1434e13de34.herokuapp.com
- Manifest (agents): https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
- Repo (read-through): https://raw.githubusercontent.com/sportdogfood/clear-round-datasets/main/items (fallback only)

Key Model
---------
- Events are **hub + legs** (weekly “legs” inside a hub window). There is **no separate Event-Series entity**.
- Venue is the location anchor; organizer is the producing entity.
- Records are **lightweight**; normalizers keep names/dates/labels consistent.
- Inputs supplied by the operator are **hints**. Agents confirm facts (official name/link/dates) before any preview/commit.

Critical Infra Notes
--------------------
- **ALLOW_DIRS** on the proxy must be first-segment tokens only (e.g., `items,agents,index`), not path prefixes like `items/index/events/`.
- GET supports: .json, .txt, .md, .html, .js
- POST /items/commit supports: **.json and text** files
  - JSON path → body.json = object (server pretty-prints)
  - Text path (.txt/.md/.html/.js) → body.json = string (server normalizes newlines; appends trailing newline)

Load Order (every run)
----------------------
1) Fetch **manifest** (proxy-first, then git fallback).
2) Load **ingestion-rules.txt** + the lane’s core rule file(s) (e.g., **event-rules.core.json** and **event-rules.json** for add-event).
3) Validate availability of required normalizers and relations before any preview (fail-closed on missing).
4) **Kit attestation**: if manifest.kit.enforce_hash is true, compute sha256 for boot.json and core shard(s) and compare to manifest.kit.hashes.*.

Current Directories (top-level under /items)
--------------------------------------------
- **/items/events/** → event hubs/legs (organizer-fronted filenames)
- **/items/index/** → venues, organizers, sources, months, days, labels, countries, states, cities, weather, airports, stay/dine/parks/sites, etc.
- **/items/agents/** → agent rules, knowledge, starters

Lane Kits (tiny bootstrap)
--------------------------
- boot.json → minimal policy/dirs/template pointers, optional hash enforcement
- *-rules.core.json → lane’s write-critical essentials (required fields, relations, save path template, validation switches)
- Rich rules (e.g., event-rules.json) → enrichment/research; **not required** for a safe write if the core shard is present

Session Boot (fresh chat)
-------------------------
- Paste **SESSION-START v14** line if desired for discipline, then run the **LOAD-KIT-TEST** diagnostic (boot.json + event-rules.core.json). If either fails → STOP.
- Use **proxy URLs only** in tools; raw git is fallback only.

Absolute Musts for add-event
----------------------------
- Treat operator inputs as **hints**. Confirm **official** link/name/dates from the show/organizer/federation.
- Enforce UID naming from rules (slug of sanitized official name).
- If legs exist: confirm each leg’s start/end date; hub window = first leg start → last leg end.
- Source policy: de-duplicate by domain; create/link minimal source records under **/items/sources**.

Preview → Commit Contract (always)
----------------------------------
- **PREVIEW** returns lane, target path, complete read-only card, sources_checked, load_ledger (with sha256 + hash_verified when enforced), and any discrepancies (official vs hint).
- **COMMIT** re-checks HEAD and invariants. If drifted, return conflict; re-preview. Commit messages include actor: “(actor: human|agent|codex)”.

Common Errors (fast triage)
---------------------------
- not_enabled → Starter/rules missing. Check knowledge/README and manifest paths.*
- needs_rules → Required rule file unreadable (see manifest paths.*) or hash mismatch when enforced
- needs_normalizer → Relation didn’t resolve (e.g., venue_uid)
- validation_failed → HTTPS/UID/date/series window constraints violated
- allowlist_denied → First path segment not in ALLOW_DIRS tokens
- conflict → HEAD changed since preview; re-run PREVIEW

Do/Don’t
--------
- DO keep lane kits minimal and pinned (with optional hashes).
- DO use proxy URLs; git raw is fallback only.
- DO keep **content POV** out of ops agents; content belongs to render/create lanes.
- DON’T hardcode directories; respect manifest.dirs.* and templates.
- DON’T skip PREVIEW. Never commit blind.

Where to Edit / Add
-------------------
- Knowledge (rules/policies): /items/agents/knowledge/*
- add-event starter: /items/agents/add/add-event/*
- update-event starter: /items/agents/add/update-event/*
- Shared rules: /items/agents/event-rules.core.json, /items/agents/event-rules.json, /items/agents/venue-rules.json

Operator Notes
--------------
- If something 404s, GET `/items/_manifest.json` to verify ALLOW_DIRS and upstream base.
- If a write fails with “Path not allowed”, confirm the **first token** of the path is in ALLOW_DIRS.
- To test text writes quickly: POST /items/commit with { path: "agents/knowledge/TEST.txt", json: "hello\n" }.

Ownership
---------
- Project owner: Clear Round Travel
- Timezone: America/New_York
