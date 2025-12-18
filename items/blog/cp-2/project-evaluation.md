Below is a **clean, handoff-ready** `project-evaluation.md`.
It is written for a **professional engineer** who needs to understand the project **quickly**, see **why it stalled**, and **what not to undo**.

No theory. No blame. No GPT fluff.

---

# project-evaluation.md

## Project Evaluation & Professional Handoff Brief

**Project:** Clear Round Travel — Blog Generation System (cp:2)
**Status:** Partially implemented, conceptually proven, execution stalled
**Audience:** Senior software engineer / systems engineer
**Purpose:** Enable takeover without architectural archaeology or accidental reinvention

---

## 1. Executive Summary (Plain English)

This project generates **fact-grounded, deterministic travel blog content** for equestrian competitions.

At its core, it is **not complex**:

* Structured input data (Rows / spreadsheets)
* Deterministic transforms (research → writing → final)
* Versioned outputs (Git)

The project **has proof of life**:

* A legacy system already worked using similar rules
* Individual prompt behaviors are validated
* Output quality is acceptable when the system runs end-to-end

The failure has **not** been technical difficulty.
The failure has been **system drift** during redesign and assistant-driven over-abstraction.

This document exists to prevent a professional engineer from repeating that mistake.

---

## 2. What the System Actually Does (Reality, Not Aspirational)

One job = one competition context.

For each job:

1. Load a job definition (what this job is)
2. Load structured datasets (facts only)
3. Produce **one research output**
4. Produce **one or more narrative outputs**
5. Assemble **one final artifact**
6. Commit results to Git

**There is no learning, no autonomy, no dynamic planning.**
Everything is deterministic.

---

## 3. What Is Already Proven to Work

### Proven:

* Fact-only research prompts
* Writer prompts that consume research reliably
* Strict “could-not-verify” sentinel handling
* One-job / one-context discipline
* Output serialization to JSON / HTML
* Git as the final source of truth

### Proven by:

* A legacy “hardcoded” system
* Multiple partial executions that succeed in isolation

The project is **not speculative**.

---

## 4. The Core Architectural Truth (This Matters)

### The system succeeds **only when it is boring**.

Every failure occurred when:

* Too many “lanes” were invented
* Research was split into sub-researchers
* “Helpful” orchestration layers were added
* Execution strategy was solved before data contracts
* Assistants tried to “improve” clarity by decomposing roles

### The system works when:

* Research is **single-pass**
* Writing is **multi-pass**
* Stitching happens **once**
* Each stage consumes exactly one input and produces exactly one output

---

## 5. Canonical Pipeline (Do Not Re-Invent)

This is the **entire intended flow**:

```
Rows Data
   ↓
Research (single pass, facts only)
   ↓
Writing (narrative only, may be multi-pass)
   ↓
Final Assembly
   ↓
Git Commit
```

There are **no side branches**.

---

## 6. Known Mistakes That Caused Repeated Failure

### 6.1 Over-Decomposition

* Splitting research into VRR / CSR / ERR
* Treating venue / city / event as separate lanes
* Creating “helper” roles that were not required

**Impact:**
Loss of determinism, unclear ownership, impossible debugging.

---

### 6.2 Premature Orchestration

* Designing “brains” or controllers too early
* Solving execution before locking data contracts
* Treating prompts as agents instead of transformers

**Impact:**
System became abstract without becoming runnable.

---

### 6.3 Implicit State Assumptions

* Assuming GPT “remembers” prior outputs
* Assuming lane order implies data availability
* Assuming assistants will respect unstated boundaries

**Impact:**
Silent drift and hallucinated structure.

---

### 6.4 Assistant Drift (Critical)

Repeated assistant behaviors that caused damage:

* Inventing new lanes not requested
* Rewriting working rules “for clarity”
* Introducing scalable patterns the project explicitly rejects
* Treating the system as a framework instead of a pipeline

This is not a human error — it is a tooling reality.

---

## 7. What Is Explicitly Frozen (Do Not Touch)

A professional engineer **must not revisit**:

* Single research pass
* No external research or browsing
* No state stored in LLMs
* One output per stage
* “could-not-verify” as a hard sentinel
* Git as final output authority
* One job = one competition

If any redesign violates these, it is wrong.

---

## 8. What Is Incomplete (The Real Blockers)

These are the **actual unfinished items**:

1. **Writer Output Definition**

   * Exact JSON shape writers emit
   * Writer → final consumer contract

2. **Final Assembly Contract**

   * How writer outputs are combined
   * No rewriting of facts
   * No schema mutation

That’s it.

Not dozens of files.
Not new roles.
Not new frameworks.

---

## 9. Why the Project “Could Never Find the End”

Because the system kept being treated as:

* A platform
* A framework
* A scalable agent system

Instead of what it is:

* A **deterministic content compiler**

Every attempt to “future-proof” it prevented finishing it.

---

## 10. How a Professional Engineer Should Approach This

### Correct posture:

* Treat prompts as **pure functions**
* Treat JSON as **interfaces**
* Treat execution as **dumb plumbing**
* Optimize for debuggability, not elegance

### Wrong posture:

* Adding abstraction layers
* Designing for reuse
* Introducing dynamic routing
* “Cleaning up” working constraints

---

## 11. Recommended Recovery Plan (Minimal, Safe)

1. Re-implement **one** research prompt (CR) as a pure function
2. Re-implement **one** writer prompt (CW) consuming that output
3. Hard-wire the handoff
4. Generate one final artifact
5. Commit to Git
6. Stop

Only after this works should anything be generalized.

---

## 12. Final Note to the Engineer

This project is **simpler than it looks**.

Its difficulty came from:

* Over-thinking
* Tool limitations
* Well-intentioned abstraction

If you make it boring again, it will work.

---

**End of project-evaluation.md**

---

If you want, next I can:

* tighten this for an external contractor, **or**
* add a one-page “what not to do” checklist for engineers, **or**
* turn this into a README + handoff email

You choose the next step.
