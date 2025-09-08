CRT AGENTS — OPERATOR README (Canonical) v3.0
Updated: 2025-09-08 (ET)

PURPOSE
This is the single, canonical operator entrypoint for Clear Round Travel agents. All other READMEs under agents/knowledge/* are deprecated stubs that point here.

SOURCE OF TRUTH (load these first; fail-closed)
- Manifest: https://crt-b1434e13de34.herokuapp.com/items/agents/manifest.json
- Dir Map:  https://crt-b1434e13de34.herokuapp.com/items/dir-map.json
- Ingestion: https://crt-b1434e13de34.herokuapp.com/items/agents/ingestion-rules.txt
- Cards Core: https://crt-b1434e13de34.herokuapp.com/items/agents/cards-core.txt
- Labels:    https://crt-b1434e13de34.herokuapp.com/items/agents/labels-rules.json
- Boot:      https://crt-b1434e13de34.herokuapp.com/items/agents/boot.json

LANES (load-kit-test → load+preview)
Event add:
- MODE: LOAD-KIT-TEST → https://crt-b1434e13de34.herokuapp.com/items/agents/modes/add_event.load-kit-test.txt
- MODE: LOAD+PREVIEW  → https://crt-b1434e13de34.herokuapp.com/items/agents/modes/add_event.load-preview.txt
- Core rules          → https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.core.json
- Rich rules          → https://crt-b1434e13de34.herokuapp.com/items/agents/event-rules.json
- Contract            → https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/events-contract.txt

Venue add:
- MODE: LOAD-KIT-TEST → https://crt-b1434e13de34.herokuapp.com/items/agents/modes/add_venue.load-kit-test.txt
- MODE: LOAD+PREVIEW  → https://crt-b1434e13de34.herokuapp.com/items/agents/modes/add_venue.load-preview.txt
- Core rules          → https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.core.json
- Rich rules          → https://crt-b1434e13de34.herokuapp.com/items/agents/venue-rules.json
- Contract            → https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/venues-contract.txt

Place add:
- MODE: LOAD-KIT-TEST → https://crt-b1434e13de34.herokuapp.com/items/agents/modes/add_place.load-kit-test.txt
- MODE: LOAD+PREVIEW  → https://crt-b1434e13de34.herokuapp.com/items/agents/modes/add_place.load-preview.txt
- Core rules          → https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.core.json
- Rich rules          → https://crt-b1434e13de34.herokuapp.com/items/agents/place-rules.json
- Contract            → https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/places-contract.txt

OUTPUT BEHAVIOR
- PREVIEW envelopes only (read-only). COMMIT is full-drop, no ops wrapper.
- Commit contract: https://crt-b1434e13de34.herokuapp.com/items/agents/agent-git-access.txt

ERROR CODES (fail-closed)
- needs_rules | needs_source | needs_review | needs_normalizer | invalid_path | validation_failed
(Definitions: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/error-codes.txt)

NAMING & VALIDATION (canonical)
- Naming policy: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/naming-policy.txt
- Validation checklist: https://crt-b1434e13de34.herokuapp.com/items/agents/knowledge/validation-checklist.txt

NOTES
- No legacy shows/* branches. Events filenames are organizer-fronted under items/events/.
- Venues/Places filename == UID under items/index/*.
