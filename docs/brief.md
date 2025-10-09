1-line summary: Static blog system that ingests post JSON from raw.githubusercontent.com, renders HTML/feeds, and atomically commits to GitHub Pages via a bulk endpoint.

Feasibility: Achievable — with caveats.
Complexity: Moderate (network allowlists, schema alignment, deterministic outputs).
Primary risks / obstacles: - Domain blocking by tools; - Content shape drift vs template; - Misconfigured UPSTREAM_BASE or proxy caching.
Impact of removing step 4: Removing bulk commit forces per-file commits, increases race risk, and reduces atomicity of deploys.
Recommendation: Lock the trigger contract and allowlist now, then align template to the new JSON shape before building runner actions.
Assumptions: UPSTREAM_BASE is repo root; commit host is items.clearroundtravel.com; allow_urls includes raw.github + commit host; Airtable commits stay as-is.
Concrete next step (single action): approve this brief to use as the project summary in new threads.
