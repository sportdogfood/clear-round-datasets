# Clear Round Datasets

Data and content repository for Clear Round Travel.  
**Write path:** Airtable/PowerShell → Proxy → Git (PR-by-default).  
**Docs:** See [`items/agents/knowledge/`](items/agents/knowledge/).

## What lives here

- `index/` — canonical entities (events, venues, event-series, organizers, sources, …)
- `items/` — content collections and agent scaffolding:
  - `items/agents/` — task packs (agents) + knowledge docs
  - `items/stay`, `items/dine`, `items/locale`, … (content)
- `items/agents/dir-map.json` — directory registry (entities/normalizers/content)

## How changes flow

1. **Stage in Airtable**  
   - Build/preview `dir-map.json` (v2), or prepare records for `/index`/`/items`.
2. **Commit via Proxy**  
   - POST `{ path, json, message }` to the proxy. Agent and Codex also use this.
3. **Allowlist enforced**  
   - Heroku `ALLOW_DIRS` (derived from `items/agents/dir-map.json`) gates writes.
4. **PR-by-default**  
   - Agent/Codex open PRs by default; you may “ship directly” for green-lane items.

## Start here (knowledge)

- **Operating rules:** [`operating-rules.txt`](items/agents/knowledge/operating-rules.txt)  
- **Permissions / lanes & rails:** [`permissions-policy.txt`](items/agents/knowledge/permissions-policy.txt)  
- **Domain outputs:** [`output-behavior.txt`](items/agents/knowledge/output-behavior.txt)  
- **Starter mapping:** [`triggers.txt`](items/agents/knowledge/triggers.txt)  
- **Naming / UID & paths:** [`naming-policy.txt`](items/agents/knowledge/naming-policy.txt)  
- **Validation checklist:** [`validation-checklist.txt`](items/agents/knowledge/validation-checklist.txt)  
- **Errors & remediation:** [`error-codes.txt`](items/agents/knowledge/error-codes.txt)  
- **Manifest contract:** [`manifest-contract.txt`](items/agents/knowledge/manifest-contract.txt)

## Daily quickstart

- **Registry:** Run the Airtable *dir-map* script → commit `items/agents/dir-map.json` → set `ALLOW_DIRS`.  
- **Data commits:** Use the Airtable *commit_all* script or PowerShell to post `{ path, json, message }`.  
- **Tasks:** Use a starter (e.g., “Add Event”). Agent returns a PREVIEW; reply **COMMIT** to write (PR-by-default).

## Contribution rules (short)

- No silent writes. PREVIEW → COMMIT for add/ tasks.  
- Paths must be within `ALLOW_DIRS`.  
- Conflicts (file changed since preview) fail safe; re-preview required.  
- Keep root README minimal; put specifics in `items/agents/knowledge/`.

---

*Questions? See the knowledge README:*  
[`items/agents/knowledge/README.txt`](items/agents/knowledge/README.txt)
