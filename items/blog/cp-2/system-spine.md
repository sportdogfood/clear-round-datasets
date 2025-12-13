# SYSTEM-SPINE.md

**Clear Round Travel — Active Working Spine (cp:2)**
**Status:** Living / Session-Bound
**Version:** v2025-12-13-spine-fix-01
**Timestamp:** 2025-12-13T22:45 ET
**Purpose:** Prevent drift; allow safe resume without re-architecture
**Scope:** What is frozen, what is prohibited, where work stopped, what remains

---

## 1. What this document is

This document is the **authoritative working spine** for the CRT blog cp:2 system.

It exists to:

* prevent architectural drift,
* prohibit unapproved decomposition,
* mark the exact stopping point,
* and constrain future assistants.

This is **not** a blueprint, contract, or prompt.
It is a **guardrail document**.

---

## 2. Frozen assumptions (non-negotiable)

The following are **locked and must not be revisited**:

* GPT **does not** hold state, runners, or instances
* No pipeline logic lives in GPT memory
* Prompts are **stateless transformers**
* All orchestration is external or declarative
* `could-not-verify` is a **hard sentinel**
* No browsing, research, enrichment, or inference
* One job = one concrete competition context
* Convenience and control > scalability

Any suggestion violating these is **out of scope**.

---

## 3. Canonical lane boundaries (non-negotiable)

### There is exactly ONE research lane in cp:2

* **Canonical lane key:** `cr`
* **Allowed aliases:** `crr`, `cr*`
* **Role:** collection research (event, venue, city_season)

### Explicit prohibitions

The following are **forbidden**:

* Creating additional research lanes
* Splitting research into:

  * VRR (venue researcher)
  * CSR (city/season researcher)
  * ERR, PRR variants, or equivalents
* Treating event / venue / city_season as separate lanes

**Event, venue, and city_season are sections, not lanes.**

Any assistant that invents new research lanes is **in violation of the spine**.

---

## 4. Confirmed outer shell (do not redesign)

The outer execution shell is **established and sufficient**:

* Trigger: `start blog-cp:2`
* Job-definition loaded from Rows
* Datasets fetched from Rows
* Final artifacts committed to Git

This layer is **not under discussion**.

---

## 5. First concrete output bin (LOCKED)

### Research Output Bin — Canonical

* **Name:** `collection-research-bin`
* **Produced by:** CR lane only
* **Produced:** exactly once per job
* **Contents:** structured, fact-only research
* **Scope:** event + venue + city_season
* **Subdivision:** explicitly forbidden

This bin **must exist** before any writer runs.

There are **no parallel research bins**.

---

## 6. Lane roles (clarified, constrained)

### Expeditor

* Holds all datasets
* Normalizes inputs
* Releases **only requested slices**
* Does **not** produce a narrative or durable output bin

### CR (collection researcher)

* Declares what it needs
* Consumes expeditor slices
* Produces **collection-research-bin only**

### CW / PW (writers)

* Consume research bins only
* Produce narrative outputs only
* Do not see raw datasets

### RWT (rewriter / stitcher)

* Consumes writer outputs only
* Produces final output only

No lane:

* invents facts,
* sees more than declared,
* or mutates schemas.

---

## 7. Output bins (authoritative list)

There are exactly three durable bins:

1. **collection-research-bin**

   * Producer: CR
   * Consumer: CW / PW

2. **content-output-bin** *(not yet defined)*

   * Producer: CW / PW
   * Consumer: RWT

3. **final-output**

   * Producer: RWT
   * Committed to Git

No lane writes to more than one bin.
No bin is produced more than once per job.

---

## 8. Where work STOPPED (critical)

Work stopped **after**:

* CR prompt definition ✅
* CW prompt definition ✅

Work stopped **before**:

* Writer Output Bin definition ❌
* Any places bins ❌
* Rewriter / stitcher bin ❌
* Final commit artifact lock ❌

**The Writer Output Bin is NOT defined.**

This is the exact resume point.

---

## 9. Explicit prohibition on “helpful decomposition”

Assistants **must not**:

* decompose lanes,
* subdivide bins,
* introduce parallel runners,
* or “improve” the architecture,

even if such changes appear cleaner, more modular, or more scalable.

Only explicitly named lanes and bins may exist.

---

## 10. What is allowed next (narrow scope)

The next allowed step is **one thing only**:

> **Define the Writer Output Bin.**

That means:

* canonical name
* producing lane(s)
* exact JSON shape
* conceptual storage / handoff

Nothing else may proceed before this is complete.

---

## 11. How to use this spine in a new session

In a new chat:

1. Paste this file first
2. State: “Resume at Writer Output Bin definition”
3. Reject any suggestion that introduces new lanes or bins

This makes drift **detectable**, not silent.

---

**End of SYSTEM-SPINE.md**
