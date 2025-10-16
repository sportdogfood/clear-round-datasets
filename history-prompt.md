Task: Generate a project-specific **Rules.md** from this project’s chat history.

Scope:
- Source only this project’s prior conversations and files.
- Output one file: **Rules.md** (markdown).

Include (must-have):
1) **Unsupported/Forbidden**: functions, APIs, libraries that failed (with brief why and example error).
2) **Do / Don’t**: concrete dos/don’ts for formulas, scripts, API calls.
3) **Known Pain Points**: list recurring breakages, regressions, edge-cases, confusing UX; note first-seen dates and example messages.
4) **Fix Patterns**: proven resolutions and workarounds with minimal snippets.
5) **Templates**: small, vetted starter patterns (no speculation).
6) **Conventions**: naming, field types, file paths, commit rules, response format rules.
7) **Assumptions**: clearly labeled; avoid if not evidenced by history.
8) **Change Log Seeds**: bullets of lessons to watch going forward.

Format:
- H1 title: “Project Rules”
- TOC
- Sections in the order above
- Each item: one-line rule + 1–2 line rationale
- Cite history breadcrumbs: date or short message reference (e.g., “2025-10-13 · ‘LET() not supported’”)

Constraints:
- Pull only verifiable content from history; mark anything inferred as **Assumption**.
- Keep code snippets minimal and known-good.
- No generic advice; tailor to this project.
- Be concise.

Acceptance:
- At least 10 distinct **Known Pain Points** with dates.
- At least 8 **Fix Patterns** tied to those pain points.
- All “Unsupported/Forbidden” items have a one-line reason and an example breadcrumb.
- Final file ≤ 800 lines.

Deliverable:
- Return the complete **Rules.md** as markdown only, no extra commentary.
