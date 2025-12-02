# CRT Bottom-Runner Overview

**Session ID:** crt-bottom-runner-overview
**Timestamp:** 2025-12-01T23:15ET

---

## 1. Project Purpose

The CRT bottom-runner generates the **bottom block** of a blog entry for a specific `creation_id`. It transforms Rows.com payloads into shaped JSONs, applies local research, creates structured content (Stay, Dine, Essentials, Locale), and produces a final publishable JSON committed to Docs.

It is one of the three coordinated runners:

* **Top-runner** → produces top-block JSON (intro paragraphs + bridge)
* **Bottom-runner** → produces stay/dine/essentials + locale
* **Blog-runner** → merges top + bottom into full blog

This document summarizes the workflow, core files, schema rules, known limitations, and communication failures encountered in development.

---

## 2. High-Level Workflow (Bottom-Runner)

### Step 1 — Load Inputs

* Fetch **CompetitionPayload** (CP) from Rows.
* Fetch **DestinationPayload** (DP) from Rows.
* Validate `creation_id` matches both.

### Step 2 — Expeditor

Produces two strict JSONs:

* `locale-research-input.json`
* `bottomblock-writer-input.json`

**Key roles:**

* Mechanical shaping only.
* No research, no inference, no invention.
* Normalize fields using unified fallback rules:

  * Missing/empty → `"could-not-verify"`
  * Lat/lng non-numeric → `null`
* Preserve curated place rows exactly.

### Step 3 — Locale Researcher

* Researches ONLY off-grounds resets (parks, trails, simple outings) using authoritative local sources.
* Never verifies or corrects event identity from CP.
* Produces structured `locale-research-output.json`.
* Always returns all buckets (even if empty).

### Step 4 — Writer

* Uses **writer-input + locale-research-output**.
* Produces `bottomblock-writer-output.json`.
* Creates structured text for:

  * Stay
  * Dine
  * Essentials
  * Locale
  * Outro
* STRICT boundaries: stay ≠ dine ≠ essentials ≠ locale.
* Does not invent businesses, distances, or events.
* Ignores all `"could-not-verify"` values.

### Step 5 — Rewriter

* Cleans grammar and flow.
* NEVER modifies structure, facts, or curated fields.
* Output: `bottomblock_final.json`.

### Step 6 — Commit

* Commits all intermediate logs to:

  * `docs/runner/bottom/logs/{cid}-*.json`
* Commits final JSON to:

  * `docs/runner/bottom/finals/{cid}-bottomblock_final.json`

---

## 3. Core Files Used (Bottom-Runner)

### **1. instructions.txt**

Full contract for the entire bottom-runner.
Defines:

* Pipeline
* Rules for each module
* Shapes for all JSON files
* Fallback logic
* Error handling

### **2. instructions-mini.txt**

* Must be < 8000 chars.
* Defines trigger behavior + stage flow.
* Defers ALL detailed rules to instructions.txt.

### **3. expeditor-spec.txt**

* Complete definition of expeditor responsibilities.
* Required input/output exact shapes.
* Fallback rules.
* Forbidden behaviors.

### **4. expeditor.js**

* LIVE executable logic.
* Loads CP + DP.
* Generates `locale-research-input.json`.
* Generates `bottomblock-writer-input.json`.
* Commits logs.
* Uses the SAME shapes the writer and researcher expect.

### **5. research-locale-prompt.txt**

* Defines all rules for the locale researcher.
* Strict buckets.
* Strict no-invention.
* Strict schema.

### **6. bottomblock-writer-prompt.txt** (or equivalent `prompt-bottom-writer.txt`)

* Defines writer behavior.
* Defines exact output schema.
* Strict boundaries per lane.

### **7. bottomblock-rewriter-prompt.txt** (or equivalent `prompt-bottom-rewriter.txt`)

* Receives writer output.
* Only polishes string fields.
* Schema must remain identical.

These 7 files are the core set required for a working bottom-runner.

---

## 4. Known Limitations

### Technical Limitations

* **Rows payloads sometimes include inconsistent fields** (example: `list-only` vs `list_only`). Runner requires strict normalization.
* **Empty strings** from Rows must be normalized to avoid writer failures.
* **Locale researcher depends on limited reliable sources**; may return empty buckets.
* **Writer’s schema requires all lanes present**, even if empty.
* **Expeditor.js fields are authoritative**; ALL prompts must match its shape.

### Operational Limitations

* Runner must be invoked with the correct `creation_id`.
* Docs must allow commit-bulk with correct paths.
* Writer and rewriter must not introduce schema drift.

---

## 5. Communication & Misalignment Issues Encountered

### 1. **Shape Drift Between Files**

* expeditor.js used `list_only` but prompts used `list-only`.
* Writer prompts expected fields expeditor never produced.
* Locale researcher expected a different schema than expeditor emitted.

**Impact:** Hard failures or fabricated fallback behavior.

### 2. **Mixing Blog Runner Specs with Bottom Runner Specs**

* Some mini instructions belonged to the blog-runner.
* Bottom-runner attempted to follow incorrect top-runner/blog-runner patterns.

**Impact:** Confused pipeline, unexpected commits, shape mismatch.

### 3. **Old Versions Persisting in Memory**

* Multiple outdated shapes were still referenced.
* Assistant sometimes used prior cached schemas.

**Impact:** Inconsistent expectations, contradictory outputs.

### 4. **Ambiguity Around Core Files**

* Some files existed under multiple names.
* Prompts were named inconsistently (e.g., `bottomblock-writer-prompt.txt` vs `prompt-bottom-writer.txt`).

**Impact:** Wrong prompt loaded → wrong output.

### 5. **User Time Lost to Repeated Clarifications**

* The assistant asked branching/option questions.
* Produced incorrect or incomplete files.
* Shared “safe examples” instead of real core files.

**Impact:** User had to invest hours re-explaining basics.

### 6. **Incorrect Assumptions by Assistant**

* Sometimes assumed new schemas or behaviors.
* Occasionally suggested files that do not exist (`writer-spec.json`).

**Impact:** Confusion, drift, wrong file generation.

---

## 6. Corrected System Status (as of this session)

### ✔ All 7 core bottom-runner files are now aligned

* Shapes match LIVE runner output.
* Keys match expeditor.js exactly.
* Prompts follow schema tightly.

### ✔ The pipeline can run end-to-end

* Load
* Expeditor
* Locale Researcher
* Writer
* Rewriter
* Commit

### ✔ Commit paths are correct

* Logs → `docs/runner/bottom/logs/`
* Finals → `docs/runner/bottom/finals/`

### ✔ Prompts cannot fabricate missing data

* Strict rules for all modules.

### ✔ Removing drift from old versions

* All prior conflicting versions have been replaced.

---

## 7. Summary

The bottom-runner is now governed by:

* A single authoritative **instructions.txt**
* A compact **instructions-mini.txt**
* A strict **expeditor-spec** + live **expeditor.js**
* Updated, schema-correct **research**, **writer**, and **rewriter** prompts

The complete system can now generate:

* Fully grounded bottom-block content
* Structured outputs
* Deterministic JSON
* Safe commits to Docs

This overview captures the correct final architecture plus the history of obstacles and miscommunications that prevented previous runs from succeeding.

---

**End of Overview**
