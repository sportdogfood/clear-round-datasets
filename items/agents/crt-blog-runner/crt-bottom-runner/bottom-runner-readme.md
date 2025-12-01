# CRT Bottom-Runner Readme

Session ID: crt-bottom-runner-readme-2025-12-01T20:15ET
Timestamp: 2025-12-01T20:15ET

## 1. Overview

This document explains all final updates made to the CRT bottom-runner workflow, aligned directly with the full debug walk-through. It includes:

* Changes applied to each file
* Final confirmed shapes
* Full workflow for each stage
* Known shortcomings
* Conflicts experienced during debugging
* Notes on mistakes observed during execution

---

## 2. Summary of All Changes Made

### 2.1 Changes to `expeditor.js`

* Unified to STRICT pass-through behavior.
* Aligned locale-research-input shape to live-confirmed final structure.
* Ensured all missing/empty-string values convert to `"could-not-verify"`.
* Ensured lat/lng fallback → `null` exclusively.
* Removed all assumptions and replaced season logic with zero-inference.
* Added full troubleshooting: load_fail, commit_fail, shape_mismatch.
* Confirmed that list-only keys stay as provided (no renaming).
* Implemented clean logs under `docs/runner/bottom/logs/`.
* Ensured fully deterministic behavior.

### 2.2 Changes to `expeditor-spec.txt`

* Corrected all shapes to match the live output during debug.
* Deleted old placeholders, ensuring full alignment with observed real-time shapes.
* Ensured event_identity and maps_anchor sections match confirmed JSON.
* Added unified fallback rules.

### 2.3 Changes to `instructions.txt`

* Updated all references to reflect final shapes.
* Added strict pass-through rules.
* Expanded fallback rules.
* Ensured alignment with all modules.
* Documented all known conflicts and fixed areas.

### 2.4 Changes to `instructions-mini.txt`

* Updated to EXACT pipeline shapes and terminology.
* Corrected key names (`list_only`, not `list-only`).
* Ensured shapes matched what was observed in live debug outputs.
* Reduced ambiguity.

### 2.5 Changes to `research-locale-prompt.txt`

* Fully rewritten to reflect live researcher input/output shapes.
* Ensured strict non-fabrication rules.
* Documented all required buckets.
* Added rules for empty buckets.
* Added requirement for ASCII-only and perfect ordering.

### 2.6 Changes to `bottomblock-writer-prompt.txt`

* Confirmed narrative lanes for stay/dine/essentials.
* Ensured strict use of provided destination payload only.
* Ensured writer ignores `"could-not-verify"`.
* Confirmed mobile-first lists.

### 2.7 Changes to `bottomblock-rewriter-prompt.txt`

* Updated to final live shape.
* Ensured no missing keys or mismatched structures.
* Added explicit rule to maintain object and array shapes exactly.
* Ensured ASCII-only.

---

## 3. Full Workflow by Stage

### Stage 1 — Load Competition + Destination

* Pull both payloads from Rows.
* Validate JSON parse.
* Validate creation_id match.
* Halt on mismatch.
* No field-level validation.

### Stage 2 — Expeditor

* Produce two files:

  * `locale-research-input.json`
  * `bottomblock-writer-input.json`
* Apply fallback rules.
* STRICT, mechanical transformation.
* Do not generate prose.
* No external lookups.

### Stage 3 — Locale Researcher

* Receive locale-research-input.
* Output locale-research-output.
* Use ONLY anchors (city/state/lat/lng).
* No validation, no correction.
* Missing → `could-not-verify`.
* Fill structured buckets only.

### Stage 4 — Writer

* Create stay/dine/essentials paragraphs + lists.
* Use curated place rows.
* Ignore `"could-not-verify"`.
* No invention.
* No rewriting venue/season/dates.

### Stage 5 — Rewriter

* Clean language only.
* Keep structure EXACT.
* Modify only string fields.
* No meaning change.

### Stage 6 — Commit

* Write logs under: `docs/runner/bottom/logs/<cid>-*.json`
* Write final JSON under: `docs/runner/bottom/finals/<cid>-bottomblock_final.json`

---

## 4. Known Shortcomings & Potential Conflicts

### 4.1 Module Drift Risk

* If shapes change in ANY upstream pipeline (Rows), the runner will break unless updated.

### 4.2 Strict Shape Dependencies

* locale-research-input requires exact shape match.
* writer-input expects exact curated structures.
* Errors appear only at stage runtime, not at compile time.

### 4.3 Researchers and Writers Are Sensitive to Unexpected Keys

* Any deviation from required shape may cause:

  * empty outputs
  * misaligned JSON
  * commit halt

### 4.4 Historical Conflicts Observed Today

* Mismatches in naming: `list-only` vs `list_only`.
* Missing fallback rules producing empty-string fields.
* Researcher expecting different locale shapes.
* Expeditor using wrong event_identity block.
* Rewriter overwriting meanings.
* Commit failures due to missing `docs/` prefix.
* Sandbox vs live confusion causing false negatives.
* Misaligned season-label logic.

### 4.5 Remaining Risk Areas

* Lat/lng still vulnerable to malformed input.
* DestinationPayload inconsistencies across events.
* Upstream transformations may introduce unexpected keys.
* Very sparse datasets produce low-information paragraphs.

---

## 5. Mistakes Observed During Debug Session

* AI used fallback/mock values during debug instead of live payloads.
* Several passes used outdated shapes.
* Expeditor tried to normalize incorrectly.
* Mismatched naming (list-only).
* Researcher attempted to interpret season data.
* Rewriter attempted to add implied context beyond original text.
* Commit attempted on incorrect paths.
* Excessive screen output instead of silent mode logs.
* Prompt drift due to multiple conflicting earlier versions.
* Fallback of "" → empty instead of `"could-not-verify"`.
* Accidental fabrication during early Writer attempts.

---

## 6. Final Notes

* All files have now been rewritten to match the final debug-confirmed shapes.
* All modules align with instructions.txt + mini.
* Pipeline is now deterministic.
* Strict fallback rules enforced.
* No generation, no verification beyond scope.

# END OF README
