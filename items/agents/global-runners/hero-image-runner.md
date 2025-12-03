# CRT Venue Hero Image Runner — Workflow v0.2 (LOCKED)

This runner consumes the output from the **Venue Hero Research Runner** and produces a single, tightly constrained prompt for an image-generation tool.

It is designed to work for any venue (Florida, Kentucky, Washington, indoor, outdoor) without inventing scenery and without risking copying a specific photograph.

---

## 1. Input contract

The image runner receives **one value per call**.

### 1.1 Failure case

If the research runner returned the bare string:

* `could-not-verify-venue-visuals`

then the image runner MUST:

* Not call any image tool.
* Return exactly: `could-not-verify-venue-visuals`.

### 1.2 Success case

Otherwise, the image runner receives a structured object with at least:

* `venue_name` (string)
* Optional context: `city`, `state`, `country` (strings)
* `season_label` (string) — e.g. `"winter"`, `"spring"`, `"summer"`, `"fall"`
* `selected_references` (array of 4–6 reference objects) — informational only, no new scraping
* Optional: `chosen_ref_indices` (array of integers)

  * If present: indices into `selected_references` that the human/editor has approved.
  * If absent: treat all `selected_references` as chosen.
* `features` (object) with keys:

  * `layout_and_vantage` (array of short bullet strings)
  * `structures` (array of bullets)
  * `landscape` (array of bullets)
  * `surfaces_and_materials` (array of bullets)
  * `branding_and_atmosphere` (array of bullets)
* `hero_view_guidance` (string paragraph)

The image runner performs **no new external research**. `features` and `hero_view_guidance` are already cross-verified and final.

---

## 2. Use of selected vs. chosen references

1. Build `chosen_references`:

   * If `chosen_ref_indices` exists and is non-empty, set:

     * `chosen_references = [ selected_references[i] for i in chosen_ref_indices ]`.
   * Otherwise, set:

     * `chosen_references = selected_references`.

2. `chosen_references` are used only to:

   * Anchor **geometry and camera logic** (which side of ring, how wide, how tight).
   * Support lighting mood and crowd density (within what `features` already describes).

3. The runner MUST NOT introduce any fact that appears only in a reference and not in `features`. `features` + `hero_view_guidance` are the truth contract.

---

## 3. Environment and scaling rules (indoor/outdoor, trees, skyline)

The runner derives the environment from `features`, never from assumptions:

* If `features.structures` and `features.landscape` describe an **indoor** arena (roof, walls, indoor stands, artificial lighting), the image MUST show a fully indoor scene:

  * Visible roof and enclosing walls.
  * Indoor lighting.
  * No exterior tree line, horizon, or sky.

* If they describe an **outdoor** arena or grounds, the image MUST:

  * Use only the tree types, vegetation, horizon, and skyline patterns explicitly mentioned in `features.landscape` and `features.structures`.
  * Never assume palm trees, bright sun, or blue sky by default.

* The runner MUST NEVER upgrade the venue visually by adding:

  * Extra palm rows, forests, lakes, mountains, or city skylines that are not in the feature set.
  * Larger or more dramatic stands, bowls, or new buildings.

* If `features` describe modest stands, they must remain modest. If no stands are described, none may be added.

These constraints MUST be expressed explicitly inside the final prompt so the image tool cannot default to a generic Florida or generic stadium scene.

---

## 4. Season and lighting behavior

The runner uses `season_label` only for **subtle, realistic** adjustments:

* `season_label` MAY influence:

  * Sun angle (slightly lower in winter, slightly higher in summer), if consistent with `features`.
  * Overall color temperature (slightly cooler in winter, slightly warmer in summer).

* The runner MUST NOT:

  * Introduce snow, bare trees, or heavy winter clothing unless such details are present in `features`.
  * Override indoor/outdoor reality; season adjusts light and feel, not core environment.

In the prompt, season appears as:

* A single sentence instructing subtle adjustment: e.g. "Subtly adjust lighting and color temperature to match {season_label} while remaining realistic for this venue and consistent with the verified references."

---

## 5. Relationship to Section Hero (composition separation)

The venue hero defines the big-picture look of the venue. Section heroes (separate runner) are responsible for tight, action-focused views.

For the venue hero:

* Composition should be **wide** or moderately wide, showing enough of the main competition space and surrounding context to establish:

  * Overall layout (ring/arena + key structures).
  * Environment (indoor vs outdoor, skyline / tree line).

* The venue hero is allowed to show the iconic landmark (e.g. arch, main grandstand) as a prominent subject.

* The image runner does not need to know if a section hero exists, but the hero prompt SHOULD describe a composition that is clearly broader than a single action or tight crop.

Section heroes will take care of zoomed-in, ambiguous-background shots; the venue hero MUST not attempt to be ultra-tight or ambiguous.

---

## 6. Prompt construction

The image runner converts the structured object into a single natural-language prompt with the following structure.

### 6.1 High-level request

* One or two sentences specifying:

  * That the image is an original, photorealistic **venue hero image** for `{venue_name}`.
  * The geographic context if available (`city`, `state`, `country`).
  * The required aspect ratio: `16:9`, suitable for a web blog or landing hero.

### 6.2 Verified feature summary

* A compact restatement of the `features` object, with **no new facts**, merging bullets into clauses:

  * Layout and vantage: 1–3 short clauses from `features.layout_and_vantage`.
  * Structures: 1–3 short clauses from `features.structures`.
  * Landscape: 1–2 short clauses from `features.landscape`.
  * Surfaces and materials: 1–2 short clauses from `features.surfaces_and_materials`.
  * Branding and atmosphere: 1–2 short clauses from `features.branding_and_atmosphere`.

* These clauses MUST be clearly identified as the **only** allowed structural and environmental cues.

### 6.3 Hero view framing

* Insert `hero_view_guidance` verbatim as the framing description, prefixed with a label like:

  * "Hero view framing:" or similar.

This paragraph defines the camera distance, angle, and which parts of the venue are in frame.

### 6.4 Environment and scaling block (embedded)

* Insert an explicit constraints block that restates the environment and scaling rules in user-facing language, for example:

  * "Use the environment exactly as described in the verified features: if the arena is indoor, keep it fully indoor with roof, walls, and artificial lighting and no exterior horizon; if it is outdoor, only use the specific tree types, vegetation, horizon, and skyline patterns mentioned. Do not add trees, hills, lakes, or city skylines that are not in the feature list, and do not enlarge modest stands into stadium bowls or invent new barns or towers."

### 6.5 Season note

* Add a single sentence referencing `season_label`, e.g.:

  * "Subtly adjust lighting and color temperature to match {season_label} while remaining realistic for this venue and consistent with the verified references."

### 6.6 Composition and style notes

* Add a concise section stating:

  * Style: high-resolution, natural-looking photograph (not painted or stylized) with realistic lens perspective and believable colors.
  * Camera: mid-distance or wide view of the main arena consistent with `hero_view_guidance`, capturing overall venue layout.
  * Aspect ratio: `16:9`.
  * People: spectators, riders, and staff only as small, generic figures without recognisable faces or copied poses.

### 6.7 Strict constraints

Conclude the prompt with explicit hard rules:

* Do not add any structures, trees, skyline, or landscape elements that are not explicitly supported by the verified features.
* Do not upscale modest seating into giant stadiums or introduce new buildings.
* Do not recreate, match, or trace any specific existing photograph; the image must be an original composition that follows only the verified structural and atmospheric cues from the research runner.
* Do not contradict the `season_label` or indoor/outdoor classification derived from `features`, except for subtle, realistic lighting shifts as allowed above.
