---

# SYSTEM-SPINE.md

**Clear Round Travel — Active Working Spine (cp:2)**
**Status:** Living / Session-Bound
**Purpose:** Resume work without re-architecting or re-explaining
**Scope:** What is being built *now*, what is frozen, and what is next

---

## 1. What this document is

This document captures the **current working spine** of the system:

* what is already agreed and frozen,
* what layer we are currently operating in,
* what decisions are explicitly *not* being revisited,
* and what the next safe moves are.

This is **not** a contract, blueprint, or prompt file.
It is a **checkpoint** to prevent drift.

---

## 2. Frozen assumptions (do not revisit)

The following are **locked for this phase**:

* GPT **does not hold state or runners**
* No architecture lives “inside” GPT memory
* All executions are driven by:

  * `job-definition`
  * datasets from Rows
  * external orchestration
* Prompts are **stateless transformers**
* `could-not-verify` is a **hard sentinel**
* No external research, browsing, or enrichment
* One job = one concrete competition context
* Convenience and control > scalability

If any future suggestion violates these, it is out of scope.

---

## 3. Where we are in the system

We have already established the **outer shell**:

### Confirmed outer shell

* Trigger: `start blog-cp:2`
* Job-definition loaded from Rows
* Datasets fetched from Rows
* Final outputs committed to Git

This outer shell **works conceptually** and does not need redesign.

---

## 4. What is still unresolved (the real problem)

The unresolved problem is **not**:

* prompts,
* schemas,
* or missing rules.

The unresolved problem is:

> **How data and rules are handed lane-to-lane without relying on GPT memory.**

Specifically:

* Where “what CRR needs” is declared
* How the expeditor gates data without becoming a pseudo-runner
* How outputs are staged and handed off deterministically

---

## 5. Current lane model (agreed)

Conceptual run order (names may vary, roles do not):

```
exp → cr → cw → pr → pw → rwt
```

### Role clarity

* **Expeditor**

  * Holds all datasets
  * Normalizes
  * Releases *only requested slices*
* **CR / PR**

  * Declare what they need
  * Produce research outputs only
* **CW / PW**

  * Consume research outputs
  * Produce narrative outputs only
* **RWT (or stitcher)**

  * Consumes writer outputs only
  * Assembles final output

No lane:

* invents facts,
* sees more than it should,
* or changes schemas.

---

## 6. Output bins (active working model)

We are now explicitly thinking in **output bins**:

1. **Research Output Bin**

   * Produced by CR / PR
   * Consumed by CW / PW

2. **Content Output Bin**

   * Produced by CW / PW
   * Consumed by RWT

3. **Final Output**

   * Produced once
   * Committed to Git

No lane reads from more than one bin.
No lane writes to more than one bin.

---

## 7. Execution strategy (current stance)

We are **not choosing final execution strategy yet**.

Both remain valid:

* external “brain” orchestrating handoffs, or
* dumb pre-defined runners waiting for inputs.

What *is* decided:

* Handoffs must be explicit
* Inputs and outputs must be named and scoped
* No implicit memory, ever

Decision will be made **after bins and handoffs are defined**, not before.

---

## 8. What we are working on next (narrow scope)

The next work is **one layer only**:

> **Define the first real output bin and its exact producer/consumer.**

Concretely:

* Are we at `exp → cr`?
* What exact JSON does CR request?
* What exact JSON does CR emit?
* Where does that output live (conceptually)?

No new prompts.
No new files.
No rewrites.

Just this handoff.

---

## 9. What we are explicitly not doing next

We are **not**:

* finalizing PW or RWT,
* locking more templates,
* optimizing prose quality,
* adding automation,
* or scaling execution.

Those steps only happen **after the spine is stable**.

---

## 10. How to use this document

* Read this first in any new session
* Use it to anchor discussion
* If a proposal contradicts it, stop and realign
* Update it only when the working focus truly shifts

---

**End of SYSTEM-SPINE.md**

---
