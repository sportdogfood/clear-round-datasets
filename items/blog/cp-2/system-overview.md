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

It exists to support **a real travel business**, not to scale content production.

**Convenience, control, and auditability** are valued over automation or throughput.

The system assumes:

* one job represents **one specific competition context** (never a generic blog type),
* all facts come from provided inputs only,
* creative work stays inside explicitly defined boundaries.

---

## 2. Core principles (non-negotiable)

These principles govern every part of the system:

* **GPT memory is not trusted**
* **No runners or state live inside GPT**
* **All authority comes from job-definition + inputs**
* **LLMs transform; they do not design or decompose architecture**
* **“could-not-verify” is a hard sentinel**
* **No external research, browsing, or world knowledge**
* **One job = one event context**
* **Convenience > scalability**
* **Determinism > cleverness**

Any suggestion that violates these principles is **out of scope**.

---

## 3. High-level lifecycle (conceptual only)

```
User Trigger
   ↓
Job-Definition (Rows)
   ↓
Dataset Fetch (Rows)
   ↓
Expeditor (normalize + gate)
   ↓
Research (single pass)
   ↓
Writing (multi-pass)
   ↓
Rewrite / Stitch
   ↓
Final JSON + HTML
   ↓
Git Commit
```

**Important constraint:**
GPT never “runs” this pipeline internally.
GPT is invoked repeatedly as a **stateless transformer**.

---

## 4. The job-definition as the blueprint

The **job-definition** is the system’s primary control surface.

It defines:

* what this job is,
* what runs and in what order,
* what rules apply,
* what data is available,
* where outputs are committed.

Examples of control knobs:

* `run_order`
* `global_rules`
* `datasets`
* `paths`
* `mode`

The job-definition is **the blueprint**.
Prompts only implement what the blueprint already declares.

---

## 5. Role boundaries (strict, conceptual)

### Expeditor

* Holds **all raw datasets**
* Normalizes values (including `could-not-verify`)
* Releases **only explicitly requested slices**
* Does **not** produce narrative
* Does **not** emit a durable output bin

> The expeditor is a **controlled loader + gatekeeper**, not a runner.

---

### Research (CR — single lane)

* There is **exactly one research lane** in cp:2
* Canonical lane key: `cr` (aliases like `crr` allowed)
* Covers **event, venue, and city_season together**
* Produces **one structured fact bundle**
* No prose, no schema changes, no inference

**Explicitly forbidden:**

* splitting research into multiple lanes
* VRR, CSR, ERR, or similar constructs
* parallel or staged research passes

---

### Writing (CW / PW)

* Consume **research output only**
* Produce **narrative text only**
* Add no facts
* Change no schemas
* Emit content outputs, not finals

Writing may be multi-pass; research is not.

---

### Rewriter / Stitcher

* Consumes **writer outputs only**
* Smooths, aligns, and assembles
* Performs final structural validation
* Produces **one final output**

This is the **only lane** that sees the whole tree.

---

## 6. Output bins (canonical model)

The system operates via **explicit output bins**, never shared memory:

1. **Research Output Bin**

   * Produced once
   * Produced by CR only
   * Contains event + venue + city_season facts
   * Cannot be subdivided

2. **Content Output Bin**

   * Produced by writers
   * Contains narrative text only

3. **Final Output**

   * Produced once
   * Committed to Git

Each lane:

* reads from exactly one bin,
* writes to exactly one bin.

---

## 7. Execution model (intentionally flexible)

The execution mechanism is **not fixed**.

Valid approaches include:

* dumb, pre-defined runners waiting for inputs
* an external brain/controller orchestrating handoffs

What does **not** change:

* lane count,
* lane responsibilities,
* output bins,
* data contracts.

Execution strategy may evolve.
**Architecture must not.**

---

## 8. What this system is explicitly NOT

This system is **not**:

* a SaaS platform,
* an agent framework,
* a self-improving system,
* a scalable content factory,
* an autonomous decision-maker,
* an OpenAPI orchestration engine.

Any drift in these directions is incorrect.

---

## 9. Where work last stopped (orientation)

As of the last stable session:

* Research lane definition: **complete**
* Collection Writer definition: **complete**
* Writer Output Bin: **not defined**
* Rewriter / Stitcher bin: **not defined**
* Commit artifact shape: **outlined, not locked**

This document exists so a new assistant can resume **without inventing structure**.

---

## 10. Relationship to other documents

* **SYSTEM-OVERVIEW.md**
  Explains *what the system is*.

* **SYSTEM-SPINE.md**
  Locks *what is frozen, prohibited, and next*.

* **Job-definitions**
  Control individual executions.

* **Member templates**
  Define lane behavior.

These documents serve **different purposes** and must not be merged.

---

**End of SYSTEM-OVERVIEW.md**

---

