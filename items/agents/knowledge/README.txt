CRT AGENTS — KNOWLEDGE README (Session Boot & Rails) — v1.8

CANONICAL PROXY (FULL URLS ONLY)
Base: https://crt-b1434e13de34.herokuapp.com
Health (diag): https://crt-b1434e13de34.herokuapp.com/health
Manifest: https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
Generated dirs: https://crt-b1434e13de34.herokuapp.com/items/_manifest.json

RULE FILES (MUST LOAD BEFORE TASKS)
Ingestion rules: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
Event rules (rich): https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
Event rules (core): https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.core.json
Venue rules: https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
Place rules: https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
Cards core: https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
Labels rules: https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json

WRITES (OPERATOR ONLY)
POST https://crt-b1434e13de34.herokuapp.com/items/commit  body: { path, json, message }
Allowed file types: .json .txt .md .html .js
Allowed dirs: via proxy ALLOW_DIRS; inspect at /items/_manifest.json

SESSION START (PASTE ONE LINE)
SESSION-START v14: proxy=https://crt-b1434e13de34.herokuapp.com manifest=https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json mode=task-only overrides: tz=America/New_York filename_equals_uid=false leg_label=Leg SHOW_FULL_URLS=1 HEALTH_MODE=soft NO_THOUGHTS=1 OUTPUT=ops

STARTUP CHECKLIST (STOP ON ANY REQUIRED FAILURE; PRINT FULL URL + STATUS)
GET https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.core.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
GET https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json
GET https://crt-b1434e13de34.herokuapp.com/items/_manifest.json
Diagnostic (non-blocking): GET https://crt-b1434e13de34.herokuapp.com/health

OUTPUT DISCIPLINE
NO_THOUGHTS=1 → no internal reasoning printed.
OUTPUT=ops → only session ACK JSON, flat status lines, or PREVIEW/COMMIT payloads.

LANE-BASED TASKS (single responsibility)
- add_event, add_venue, add_place, refresh_derived, index_cards, curate_places, research, create, render.
- Each lane loads only its kit (boot + core shard) and any lane-local rules. No global loads.

WHAT YOU WANT (project contract)
- Lane-based tasks with single responsibility.
- Facts-only entity cards (events, venues, places). **Content/POV lives only in content cards (create/render).**
- Airtable is staging only; Git is source of truth.
- Every card is lightweight and:
  • includes its own _uid, and
  • includes related fields (*_uid and *_uids such as venue_uid, organizer_uid, near_venue_uids, label_uids, source_uids).
  → Enables stitching, easy refresh, and small, predictable writes.
- If rules/sources can’t be confirmed: **fail closed** with a precise report (no assumptions, no “memory” fill-ins).
- Deterministic paths & filenames (events are organizer-fronted). No legacy branch dirs. No ad-hoc locations.

KNOWN LIMITS (explicit)
1) Rule-load fragility — Heroku cold starts / timeouts; long files may truncate in some tools.
2) Assumption drift — when a rule fails to load, never fill gaps with memory/heuristics.
3) Cross-file coupling — edits in one rules file can impact others (templates vs dirs).
4) Unreviewed behavior changes — full rewrites can drop capabilities if not documented.
5) Single-user infra realities — no autoscaling; large rules magnify failures.

BEST-PRACTICE TO MEET SCOPE (minimal change)
A) Deterministic “load → retry → verify → or stop” gate per task.
B) Tiny lane “kits”: boot.json + *-rules.core.json (3–8 KB each) for write-critical behavior.
C) Relationship fabric is first-class: always include _uid and related *_uid(s).
D) Stop auto-expansion: load only the lane’s kit files.
E) Change governance: Planned Change Report (PCR) pre-edit; Change Confirm Report (CCR) post-edit.

PCR — Planned Change Report (before edits)
- Intent (exact behavior to change and why)
- Touched files (primary)
- Dependent files (secondary) and how they’ll adjust
- Risk (behaviors that could degrade or change)
- Roll-back plan

CCR — Change Confirm Report (after edits)
- Original behavior (as-is) vs New behavior (to-be)
- Functionality preserved
- Functionality removed/altered (explicit)
- Schema/paths: confirm no drift (or enumerate drift and why)

PREVIEW ENVELOPE (read-only; required before commit)
{
  "event":"ADD_EVENT_PREVIEW|ADD_VENUE_PREVIEW|ADD_PLACE_PREVIEW",
  "status":"ok|error",
  "path":"items/...",
  "message":"…",
  "json": { /* complete card */ },
  "sources_checked":[ {"url":"<final_url>","source_uid":"<domain-slug>","is_official":"y"} ],
  "discrepancies":[ {"field":"…","hint":"…","official":"…","resolution":"official_overrode_hint"} ],
  "load_ledger":[ {"url":"<boot>","status":"ok","sha256":"…","hash_verified":true}, {"url":"<core>","status":"ok","sha256":"…","expected_sha256":"…","hash_verified":true} ],
  "timestamp":"ISO-8601"
}

NOTES
- Places use stay/dine families; ignore legacy hotels/restaurants dirs.
- Venue gate: venue_uid must end -venue; resolve via confirm/input/exit; never guess.
- Events write under **items/events/**; venues under **items/index/venues/**; places under **items/index/{family}/**; sources under **items/sources/**.

END
