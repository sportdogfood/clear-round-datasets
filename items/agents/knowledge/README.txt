CRT ChatGPT Knowledge — v1
Purpose: Give the agent the minimum facts to ingest events/venues via the proxy using manifest/event-rules/venue-rules/ingestion-rules. Facts-only; task-locked; no enrichment or content.
Load order:
1) Read manifest.json
2) Read ingestion-rules.txt
3) Read event-rules.json (when add-event)
4) Read venue-rules.json (when venue checks are needed)
