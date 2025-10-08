# README — Clear Round Travel / Content Runner

## 1) Purpose
Generate rider-first event blog JSON from curated sources with deterministic, research-based copy. Output is schema-conformant and ready to publish.

## 2) What the runner produces
- One JSON document per event with:
  - `hello.intro` (single paragraph, 110–180 words, links to event + venue)
  - Section prose + items: `stay`, `dine`, `locale`, `essentials`
  - `seo` block
  - Trace, validation, and usage metadata
- Canvas emit + suggested save path.

## 3) Where behavior lives
- **`items/policy/policy.json`**: Hard rules. Paragraph counts, link requirements, forbids, dynamic titles, template rotation, emit_items, validation.
- **`items/instructions/instructions.txt`**: Operator playbook. Workflow, research directive, emit rules, canvas/save-path.
- **Brand templates**
  - `items/brand/intro_closing_patterns.json`: One-line intro closers. Deterministic rotation.
  - `items/brand/outro_templates.json`: Outro lines. Deterministic rotation with finals/weekend routing.
  - `items/brand/cta_closers_library.json`: Section CTAs. Deterministic rotation, one per section.
  - `items/brand/intro-outro-lockdown.json`: Guardrails for intro/outro style and link obligations.
  - `items/brand/founder.json`: Voice, tone, constraints (e.g., banned phrases), template links.
- **Gold shape**
  - `items/gold/hchs.gold.json`: Shape holder + example reference copy. Not emitted verbatim. Keeps runner field schema stable.

## 4) Inputs and links
- **Task payload**: `{"task_uri":"<absolute URL>"}`.
- Runner reads only `*_link` fields (no `*_url`).
- Required 200s for intro: `event_official_link`, `venue_official_link`.
- Optional: `geo_link` for month/city naming. No temperatures.

## 5) Research model (Lean “Six-Pillar”)
Use official pages; do not copy canonicals.
- **Time**: humanized dates + cadence (early week vs finals weekend).
- **Season**: single term only (e.g., “late-summer”).
- **Event**: stature + one hallmark (e.g., finals/feature class).
- **Venue**: two concrete visuals/flow traits.
- **City**: one vibe line + proximity (“close at hand”).
- **Rider-caliber**: level implied by sanctioning + one ops-quality clause.

## 6) Section rules (travel-brochure style)
- **Intro**: single paragraph; include 2 markdown links (event + venue); cover the six pillars; forbid ticketing, prices, lists, temps, hotel/restaurant names.
- **Stay / Dine / Locale / Essentials**:
  - Dynamic titles (3–6 words). No static titles baked in content.
  - One paragraph using “tell → write → tell” logic (the words aren’t printed).
  - Feature 1–2 items inline with links.
  - Close with: **“Also consider: Name; Name.”** (inline links).
  - **Dine** is one flowing paragraph. If AM/Dinner missing, borrow “lunch” internally; do not print labels.
- **Outro**: 25–45 words from `outro_templates` via hash rotation.

## 7) Deterministic selection (no RNG)
- Mode: **hash**; seed: `hub.core.event.uid`; algorithm: fnv1a.
- Applies to outro templates and CTA closers.
- De-dupe within document.

## 8) Emit items (data → list)
Maps JSON from linked sources to `stay.items`, `dine.items`, `essentials.items`.
- **Alt fallback order**:
  - `alt` → `approx_drive` → `approx_distance` → `formatDistance(distance_m, distance_mi)` → `distance` → `notes`.
- `http_200_only: true` on source reads.

## 9) Distances nuance
- Hotels often have `approx_drive`/`approx_distance`.
- Restaurants often have `distance_m`/`distance_mi`.
- We **do not normalize**. The fallback ladder produces a consistent `alt` string.

## 10) Dynamic titles + SEO
- Titles per section generated at runtime (3–6 words). SEO guard enforces length.
- SEO block constrained to length and no insider terms.

## 11) Trace and validation
- Trace records fetches (`path`,`status`) in a capped list.
- Validation enforces intro/outro word counts, link presence, items minima, and required fields/types.

## 12) Output + canvas + save path
- Emit schema-conformant JSON to canvas (type `code/json`).
- Suggested save path derived from `task_uri`:
  - Given: `.../items/tasks/{slug}-task-YYYY-MM-DD.json`
  - Save: `docs/blogs/{slug}-blogs-{YYYY}/{slug}-blog-{YYYY-MM-DD}/{slug}-blog-{YYYY-MM-DD}.json`

## 13) Current status (as of v1.0.9 policy set)
- **Implemented**: Single-para intro; six-pillar research; dynamic section titles; tell–write–tell sections; “Also consider:” prose; deterministic rotation; emit_items fallbacks; canvas/save-path logic.
- **Known resolved**:
  - CTA “first item bias” → fixed via hash rotation + de-dupe.
  - Distance fields mismatch → handled via fallback ladder.
- **Not used**: `city_reference_url` (replaced by `geo_link` optional only).

## 14) Where to edit what
- Tighten or relax content rules → `items/policy/policy.json`.
- Adjust workflow/operator notes → `items/instructions/instructions.txt`.
- Change voice/banned phrases → `items/brand/founder.json`.
- Modify intro closer list → `items/brand/intro_closing_patterns.json`.
- Modify outro lines or routing → `items/brand/outro_templates.json`.
- Tune CTAs or routing → `items/brand/cta_closers_library.json`.
- Lock intro/outro constraints → `items/brand/intro-outro-lockdown.json`.
- Do **not** change `items/gold/hchs.gold.json` for behavior; it is a shape + examples reference.

## 15) Edit protocol (to avoid regressions)
- **FETCH** live files from raw GitHub URLs.
- **PRESERVE** original keys/order/whitespace.
- **APPLY** only the requested changes.
- **RETURN** full drops, one code block each, with a terse diff summary if requested.
- **STOP** on any fetch/parse failure.

## 16) Open checks before scale
- Verify your runner actually reads **policy.json** and **instructions.txt** for the new single-para intro logic and dynamic titles.
- Confirm canvas/save-path derivation is active.
- Confirm `*_link` usage everywhere; no `*_url` references remain.

## 17) Single next step
Confirm one target event to run end-to-end and compare output to this spec.
