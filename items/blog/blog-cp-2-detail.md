# File: blog-cp:2-detail.md
# Version: v2025-12-09
# Status: Authoritative Detail Specification for cp:2 House (blog street)

This document defines the complete behavioral model for the cp:2 house on
the blog street. It includes: expeditor behavior, researcher and writer
roles, rewriter behavior, lane boundaries, CNV rules, run_order mechanics,
and known architectural obstacles observed during development.

The goal of this document is to serve as a single reference ensuring:
- no drift,
- no role confusion,
- no accidental inference,
- no schema mutation,
- and predictable, reproducible pipeline behavior.

============================================================
1. House Overview
============================================================

House: cp:2
Street: blog

This house processes two datasets:
- crw:1  → collection/event/venue/season research + writing (CRR/CWR)
- prw:2  → stay/dine/essentials/locale research + writing (PRR/PWR)

The house contains these active lanes:

1. exp → Expeditor (only permitted shaper)
2. crr → Researcher (event, venue, season)
3. cwr → Writer (event, venue, season)
4. prr → Researcher (stay, dine, essentials, locale)
5. pwr → Writer (stay, dine, essentials, locale)
6. rwt → Rewriter (mechanical polish, final stage)

cp:2 explicitly separates conceptual domains into two tracks:
- Collection Track: event, venue, season → CRR → CWR
- Places Track: stay, dine, essentials, locale → PRR → PWR

All lanes must obey global rules referenced in job-definition.global_rules.
They are not expanded here.

============================================================
2. Run Order (Strict, Non-Branching)
============================================================

run_order = [
  exp,
  crr,
  cwr,
  prr,
  pwr,
  rwt
]

There are no alternate paths. No skipping. No parallel execution.
Each lane receives exactly the files defined for it, shaped exclusively by
the expeditor.

============================================================
3. Expeditor (exp)
============================================================

The expeditor is the only shaping authority in cp:2.

It receives:
- job_definition (including global_rules, datasets, paths)
- raw payloads for crw:1 and prw:2

It MUST:
- Build EXACT researcher inputs for CRR and PRR
- Build EXACT writer inputs for CWR and PWR
- Build rwt-input.json for the rewriter (in last_stage mode)
- Normalize missing/null → "could-not-verify" for required string fields
- Never fabricate values
- Never infer meaning
- Never create narrative
- Never violate domain boundaries

It MUST produce:
- crr-input.json
- cwr-input.json
- prr-input.json
- pwr-input.json
- rwt-input.json (combined writer output references)

Known obstacle:
- Any misunderstanding of domain boundaries at the expeditor level breaks
  everything downstream. If expeditor maps incorrectly, writers will invent
  structure or CNV will leak. This was a repeated failure point.

============================================================
4. CRR — Research Lane (event, venue, season)
============================================================

CRR responsibilities:
- Research event, venue, and season facts.
- Use only approved reputable sources permitted by cp:2.
- Produce structured factual blocks (never paragraphs).
- Output only the fields defined in the CRR schema.
- Insert "could-not-verify" for any unverified fact.

CRR MUST:
- Accept crr-input.json exactly as provided.
- Treat input fields as authoritative.
- Use CNV correctly (never patch or override).
- Keep domains separate (event != venue != season).
- Produce zero narrative content.

CRR MUST NOT:
- Invent facts or fill gaps.
- Perform cross-lane inference.
- Create descriptive copy.
- Call tools unless explicitly allowed.
- Alter structure or add new fields.

Known obstacle:
- Earlier attempts blended event/venue/city incorrectly. This is permanently
  disallowed. CRR now outputs SILOED factual structures.

============================================================
5. CWR — Writer Lane (event, venue, season)
============================================================

CWR responsibilities:
- Generate narrative content ONLY from:
  1) CRR factual output
  2) c-rows payload (crw:1)
- Produce event/venue/season writer content.
- Follow tone_rules and narrative_rules from job-definition.

CWR MUST:
- Use ONLY supplied data.
- Preserve factual meaning.
- Never repair CRR CNV.
- Respect lane boundaries.

CWR MUST NOT:
- Invent facts.
- Patch missing details.
- Quote CNV.
- Introduce bottom-block content.
- Call tools.

Known obstacle:
- Writers previously attempted to fix research gaps. That led to
  hallucinations. Architecture now strictly separates facts (CRR) from prose (CWR).

============================================================
6. PRR — Research Lane (stay, dine, essentials, locale)
============================================================

PRR responsibilities:
- Research structured factual data for:
  - stay
  - dine
  - essentials
  - locale
- Output structured factual bundles only.

PRR MUST:
- Preserve input values.
- Use CNV when facts cannot be verified.
- Maintain lane boundaries strictly.
- Output structured facts only.

PRR MUST NOT:
- Invent amenities.
- Assume venue-city relationships.
- Guess distances or directions.
- Reinterpret mismatched inputs.
- Add unsupported details.

Known obstacle:
- Earlier versions blended categories inside writers. PRR now ensures each
  category arrives as a discrete structured block.

============================================================
7. PWR — Writer Lane (stay, dine, essentials, locale)
============================================================

PWR responsibilities:
- Create content ONLY from:
  1) PRR factual output
  2) p-rows payload (prw:2)
- Produce narrative for all four categories.

PWR MUST:
- Maintain strict category separation.
- Honor CNV constraints.
- Follow tone_rules and narrative_rules.
- Never invent places or amenities.

PWR MUST NOT:
- Fix PRR missing values.
- Inflate or reinterpret factual claims.
- Blend categories.
- Call tools.

Known obstacle:
- PWR historically invented amenities or assumed hotel/restaurant details.
  cp:2 forbids this entirely.

============================================================
8. RWT — Rewriter Lane (Final Stage)
============================================================

The rewriter performs mechanical polish only.

RWT Modes:

8.1 last_stage mode  
Input:
- cwr-output.json
- pwr-output.json  
RWT MUST:
- Polish text mechanically (grammar, clarity, flow)
- Preserve all structure
- Preserve all meaning
- NOT create new content
- NOT merge domains
- NOT rewrite CNV behavior
Output: rwt-output.json

8.2 scoped mode (#write-cwr-output or #write-pwr-output)  
Input: scoped file only  
RWT MUST:
- Polish only the file provided
- Return only that polished file
- Preserve all structure and meaning

Known obstacles:
- Past rewriters invented content or "fixed" missing facts. cp:2 forbids
  any semantic expansion.

============================================================
9. Key Architectural Invariants (cp:2)
============================================================

1. No lane may perform another lane’s work.
2. CRR/PRR produce facts only — no narrative.
3. CWR/PWR produce narrative only — no facts.
4. RWT improves text only — no semantic expansion.
5. Expeditor is the only shaper.
6. CNV is a hard sentinel — never patched, never improved.
7. Writers cannot add facts missing from researchers.
8. Researchers cannot add narrative missing from writers.
9. Input → Expeditor → Research → Write → Rewrite is the only flow.
10. All outputs must obey fixed schema — no drift.

Known global obstacles:
- The model tries to infer or improve missing data.
- The model tends to merge conceptual domains.
- The model attempts to upscale CNV into invented content.
- Writers historically bypassed researcher constraints.
- Cached memory created cross-lane hallucinations.

============================================================
10. Development Warnings & Known Failure Modes
============================================================

A. Schema Drift  
Breaks entire pipeline if any lane adds/removes fields.

B. Inference Creep  
The model tries to fill gaps. Forbidden.

C. CNV Leakage  
Writers sometimes quote or replace CNV. Forbidden.

D. Domain Bleeding  
Event↔venue↔city bleeding. Stay↔dine↔essentials↔locale bleeding.

E. Cathedral Problem  
Overbuilt architectures caused confusion. cp:2 remains intentionally rigid.

F. Memory Contamination  
The model tries to remember prior examples. Forbidden.

G. Semantic Enrichment in RWT  
Rewriter must not introduce meaning.

============================================================
END OF FILE
============================================================
