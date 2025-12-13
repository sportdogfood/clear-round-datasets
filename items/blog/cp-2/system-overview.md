# SYSTEM-OVERVIEW.md

**Clear Round Travel — Blog Generation System (cp:2)**
**Status:** Conceptual / Read-Only
**Audience:** Future assistants, future self, collaborators
**Purpose:** Fast rehydration of system intent and structure (≤5 minutes)

---

## 1. What this system is

This system produces **grounded, non-fabricated travel blog outputs** for equestrian competitions by combining:

* deterministic input data (Rows),
* strict, rule-bound LLM transformations,
* and Git-based publishing.

It is designed to **support a real travel business**, not to scale content production.
**Convenience, control, and auditability** are valued over automation or throughput.

The system assumes:

* one job represents **one specific competition context** (“this competition”, not a generic blog type),
* all facts must come from provided inputs,
* and all creative work must remain inside explicitly allowed boundaries.

---

## 2. Core principles (non-negotiable)

These principles govern every part of the system:

* **GPT memory is not trusted**
* **No runners or state live inside GPT**
* **All authority comes from job-definition + inputs**
* **LLMs transform; they do not decide architecture**
* **“could-not-verify” is a hard sentinel**
* **No external research, browsing, or world knowledge**
* **One job = one event context**
* **Convenience > scalability**
* **Determinism > cleverness**

Any suggestion or change that violates these principles is out of scope.

---

## 3. High-level lifecycle

This is the system flow at a conceptual level:

```
User Trigger
   ↓
Job Definition (Rows)
   ↓
Dataset Fetch (Rows)
   ↓
Expeditor (normalize + gate)
   ↓
Researchers (facts only)
   ↓
Writers (text only)
   ↓
Rewriter / Stitcher
   ↓
Final JSON + HTML
   ↓
Git Commit
```

Key point:
**GPT never “runs” this pipeline internally**.
GPT is invoked repeatedly as a **stateless transformer**.

---

## 4. The job-definition as the blueprint

The **job-definition** is the primary control surface for the system.

It defines:

* what this job is,
* what order things run in,
* what rules apply,
* what data is available,
* and where outputs go.

Examples of control knobs inside a job-definition:

* `run_order`
* `global_rules`
* `datasets`
* `paths`
* `mode`

The job-definition is **the blueprint**, not the prompts.

---

## 5. Role boundaries (conceptual, not code)

### Expeditor

* Holds **all raw datasets**
* Normalizes values (including `could-not-verify`)
* Releases **only what downstream lanes explicitly request**
* Never writes narrative
* Never invents structure

> The expeditor is not a researcher or writer.
> It is a controlled loader + gatekeeper.

---

### Researchers (CR / PR)

* Consume **approved, normalized inputs only**
* Produce **structured fact bundles**
* No prose
* No schema changes
* No inference beyond provided inputs

Outputs are **research bins**, not content.

---

### Writers (CW / PW)

* Consume **research outputs only**
* Produce **narrative text only**
* No facts added
* No schema changes
* No UI language

Outputs are **content bins**, not final products.

---

### Rewriter / Stitcher

* Consumes **writer outputs only**
* Smooths, aligns, and assembles
* Applies final structural validation
* Produces **one final output**

This is the only lane that sees the whole picture.

---

## 6. Output bins (conceptual)

The system operates through **explicit handoff bins**, not shared state:

* **Research Outputs**

  * Produced by researchers
  * Consumed by writers

* **Content Outputs**

  * Produced by writers
  * Consumed by rewriter / stitcher

* **Final Output**

  * Produced once
  * Committed to Git

Each lane reads from **exactly one bin** and writes to **exactly one bin**.

---

## 7. Execution model (intentionally flexible)

This system allows **multiple execution strategies**, including:

* Dumb pre-defined runners waiting for inputs
* A brain/controller that orchestrates handoffs externally

What matters:

* **Inputs and outputs are explicit**
* **Rules are always supplied**
* **No state is assumed or remembered**

The execution mechanism may change.
The **role boundaries and data contracts do not**.

---

## 8. What this system is NOT

This system explicitly does **not** aim to be:

* A SaaS platform
* A multi-tenant agent framework
* A self-healing pipeline
* An OpenAPI orchestration engine
* A scalable content factory
* An autonomous decision-maker

Any design that drifts in these directions is incorrect.

---

## 9. Why this document exists

This document exists to:

* prevent re-explaining the system every session,
* prevent architectural drift,
* allow safe stopping and restarting of work,
* and give future assistants a stable mental model.

It is **descriptive**, not prescriptive.
It should change **rarely**.

---

## 10. Relationship to other documents

* **SYSTEM-OVERVIEW.md**
  Explains *what the system is*.

* **SYSTEM-SPINE.md / working notes**
  Explain *what we are doing right now*.

* **Job-definitions**
  Control individual executions.

* **Member templates**
  Define lane behavior.

These documents serve **different purposes** and must not be merged.

---

**End of SYSTEM-OVERVIEW.md**

---

