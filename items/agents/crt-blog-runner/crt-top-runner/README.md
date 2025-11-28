# CRT Top Runner – README

File: `items/agents/crt-blog-runner/crt-top-runner/README.md`  
Version: v0.1 – 2025-11-28

---

## 1. What `crt-top-runner` is

`crt-top-runner` is a **single-run, non-interactive pipeline** that generates the **top-block** copy for a blog-style competition page.

For **one** `creation_id`, it:

1. Reads a curated `CompetitionPayload` from **Rows**.
2. Builds three **research lanes**:
   - EVENT: identity + prestige framing of the competition leg.
   - VENUE: physical feel of the showgrounds.
   - CITY/SEASON: off-hours feel of the host city in the relevant season.
3. Merges those into a single **writer bundle**.
4. Runs a **writer** to create two paragraphs + a bridge.
5. Runs a **rewriter** to clean and safeguard the language.
6. Commits:
   - **Logs** for each lane/stage.
   - One **final top-block JSON** ready for downstream use.

Everything runs **end-to-end** off a single trigger:

```text
start crt-top-runner {creation_id}
