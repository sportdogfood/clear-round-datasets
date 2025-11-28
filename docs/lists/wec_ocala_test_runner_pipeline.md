# wec-ocala-test-runner pipeline — locked contract

Session ID: wec-ocala-test-runner-pipeline-v1
Timestamp: 2025-11-28T13:00:00-05:00

---

## 1. External rails (fixed)

These rails already exist and are **not** changed by this runner. The pipeline only calls into them.

1. **Rows → CompetitionPayload**
   - Uses your existing Rows integration (e.g. `getCompetitionPayloadRows`).
   - Returns exactly one `CompetitionPayload` JSON object for the active `creation_id`.
   - The runner/expeditor do **not** modify how Rows is called; they only consume the JSON.

2. **Git/Runner-Light → docs/**
   - Uses your existing commit path (e.g. `docs_commit_bulk`) to write under `docs/...`.
   - The runner only controls:
     - which `docs/...` path(s) are written, and
     - the JSON payload that is pretty-printed, UTF-8 encoded, and Base64’d.
   - No changes to branches, remotes, or upstream repo wiring.

All subsequent steps in this pipeline—expeditor fan-out, three research lanes, writer, rewriter—are **purely consumers** of these two rails.

---

## 2. Trigger

- User message must contain `"wec-ocala-test-runner"` **and** one of: `"start"`, `"run"`, `"test"`.
- Once triggered, the runner:
  - does **not** ask for confirmation,
  - follows this pipeline to completion or reports a concise error.

---

## 3. Load instructions

1. **Mini instructions**  
   - Path: `items/agents/wec-ocala-test-runner/instructions-mini.txt` (or `.md`/`.txt` per final naming).  
   - Purpose: light control of trigger, tool use, and which stages to run.

2. **Long instructions**  
   - Path: `items/agents/wec-ocala-test-runner/instructions.txt`.  
   - Purpose: full contract for Category A/B/C, research rules, non-fabrication, schema requirements.

If either instructions file is missing, the runner stops with a clear error and **does not** attempt research or commit.

---

## 4. Rows → CompetitionPayload

- Call existing Rows helper (already wired) to fetch **one** `CompetitionPayload` row for the requested `creation_id`.
- Treat the returned JSON as **authoritative Category A** for identity/geo/structure.
- The runner does **not** write back to Rows.

Internal name in this pipeline:
- `competition_payload` (in-memory object).

---

## 5. Expeditor fan-out (in-runner view)

The expeditor step is treated as **pure data shaping** from `competition_payload` into three smaller research inputs. In your implementation it may live in `expeditor.js` or an equivalent module.

It builds, in-memory:

1. `event-research-input.json`
2. `venue-research-input.json`
3. `city-research-input.json`

Each is a projection of `CompetitionPayload` with just the fields needed for that research lane (event, venue, city+season), plus any fallback hints.

These may optionally be written under `items/agents/wec-ocala-test-runner/` for debugging, but the contract only requires them as **inputs to the research prompts**.

---

## 6. Research stage (three lanes)

Run three **fact-only** researchers. Each lane:
- may use `http_get` + allowed sources,
- must obey Category A/B/C + no-fabrication rules,
- must **not** produce brochure prose,
- must prefix unknown values with `"could-not-verify"` instead of leaving them blank.

Outputs (logical names / suggested files):

1. `event_research.json`   (e.g. `items/agents/wec-ocala-test-runner/event_research.json`)
2. `venue_research.json`   (e.g. `items/agents/wec-ocala-test-runner/venue_research.json`)
3. `city_research.json`    (e.g. `items/agents/wec-ocala-test-runner/city_research.json`)

Lane responsibilities (summary):

- **Event researcher**: identity, dates, rating tags, rider caliber, aliases, “known_for” clause, prestige/vibe **only for the event**. No venue description, no city copy.
- **Venue researcher**: physical setting, layout, materials, light, on-grounds atmosphere, and equestrian reputation **for the venue**. No event names, dates, or city attractions.
- **City+season researcher**: in-town visuals, pace, daily rhythm, qualitative seasonal feel **around the venue’s lat/lng radius**. No venue or event names.

Each researcher has its own `prompt-research-*.txt` and keeps strictly within its lane.

---

## 7. Filter / merge research

- Take the three research JSONs and:
  - ensure ASCII-only strings,
  - drop or normalize malformed fields,
  - keep `"could-not-verify"` markers where data could not be confirmed.
- Merge into one bundle:

`topblock_research_clean.json`

with clear sections for `event`, `venue`, and `city_season`.

This file/bundle is the **only** research input the writer sees.

---

## 8. Writer + rewriter

1. **Writer**
   - Input: `competition_payload` + `topblock_research_clean.json` + gold spec for the top-block narrative.
   - Output: `topblock_writer.json` with the full top-block schema:
     - 2-paragraph travel-brochure opener for riders/trainers/families.
     - Short bridge paragraph that cleanly sets up Stay / Dine / Essentials.
   - Writer may only use facts present in:
     - `CompetitionPayload` or
     - `topblock_research_clean.json`.

2. **Rewriter**
   - Input: `topblock_writer.json`.
   - Output: `topblock_final.json`.
   - Responsibilities:
     - Clean wording and syntax.
     - Strip or soften any claims not clearly grounded in inputs.
     - Preserve schema and non-string values.
     - Ensure ASCII-only.

If `topblock_final.json` fails schema or contains empty required fields, the runner reports an error and does **not** commit.

---

## 9. Commit to docs

- Pretty-print `topblock_final.json` (2-space indent, ASCII).
- Use existing `docs_commit_bulk` integration to write to a single path such as:

  - `docs/runner/test/wec-ocala-topblock.json`  
    (or whatever final path you choose for top-block output).

- One commit per run, with a clear message like:

  - `"wec-ocala-test-runner top-block (<creation_id>)"`.

- On success, send a short completion message listing the written path.
- On failure, send a concise error and do not claim success.

