# CRT Section Hero Image Runner — Workflow v0.2 (LOCKED)

This runner consumes the output from the **Section Hero Research Runner** and produces a single, tightly constrained prompt for an image-generation tool.

It is designed to generate **section-level** heroes (e.g. Jumping, Vendor Row, Spectators, Pony Island) that:

* Are recognisably part of the real venue.
* Do **not** look like a second venue hero.
* Use tighter, action-focused framing with more ambiguous backgrounds.

---

## 1. Input contract

The image runner receives **one value per call**.

### 1.1 Failure case

If the research runner returned the bare string:

* `could-not-verify-section-visuals`

then the image runner MUST:

* Not call any image tool.
* Return exactly: `could-not-verify-section-visuals`.

### 1.2 Success case

Otherwise, the image runner receives a structured object with at least:

* `venue_name` (string)
* Optional context: `city`, `state`, `country` (strings)
* `section_label` (string) — e.g. `"Jumping"`, `"Vendor Row"`, `"Spectators"`, `"Pony Island"`
* `section_keywords` (array of short strings) — search hints only
* `season_label` (string) — e.g. `"winter"`, `"spring"`, `"summer"`, `"fall"`
* `selected_references` (array of 4–6 reference objects) — informational only, no new scraping
* Optional: `chosen_ref_indices` (array of integers)

  * If present: indices into `selected_references` that the human/editor has approved.
  * If absent: treat all `selected_references` as chosen.
* `features` (object) with keys:

  * `layout_and_context` (array of bullets)
  * `structures_and_fixtures` (array of bullets)
  * `people_and_activity` (array of bullets)
  * `landscape_and_surroundings` (array of bullets)
  * `surfaces_and_materials` (array of bullets)
  * `branding_and_atmosphere` (array of bullets)
* `section_view_guidance` (string paragraph)

The image runner performs **no new external research**. `features` and `section_view_guidance` are already cross-verified and final.

---

## 2. Use of selected vs. chosen references

1. Build `chosen_references`:

   * If `chosen_ref_indices` exists and is non-empty, set:

     * `chosen_references = [ selected_references[i] for i in chosen_ref_indices ]`.
   * Otherwise, set:

     * `chosen_references = selected_references`.

2. `chosen_references` are used only to:

   * Anchor geometry and camera logic (which side of ring, how tight the view is).
   * Support lighting mood and crowd density (within what `features` already describes).

3. The runner MUST NOT introduce any fact that appears only in a reference and not in `features`. `features` + `section_view_guidance` are the truth contract.

---

## 3. Environment and scaling rules (indoor/outdoor, trees, skyline)

The runner derives environment from `features`, never from assumptions:

* If `features.structures_and_fixtures` and `features.landscape_and_surroundings` describe an **indoor** arena or space (roof, walls, indoor stands, artificial lighting), the image MUST show a fully indoor scene:

  * Visible roof and enclosing walls.
  * Indoor lighting.
  * No exterior tree line, horizon, or sky.

* If they describe an **outdoor** arena or grounds, the image MUST:

  * Use only the tree types, vegetation, horizon, and skyline patterns explicitly mentioned in `features.landscape_and_surroundings` and `features.structures_and_fixtures`.
  * Never assume palm trees, bright sun, or blue sky by default.

* The runner MUST NEVER upgrade the section visually by adding:

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

## 5. Relationship to Venue Hero (composition separation)

The section hero MUST NOT look like a second venue hero.

* Treat the section hero as a **tighter, action-focused crop**:

  * Focus on the subject of the section (e.g. a single jump effort, a band of spectators, a short run of vendor tents) rather than the whole arena.
  * Keep the background **simplified and more ambiguous**: same footing, same indoor/outdoor context, same broad palette, but with structures and landmarks softened, partially cropped, or pushed out of focus.

* The section hero MUST NOT:

  * Reuse a wide, arena-overview composition already used (or likely to be used) for the venue hero.
  * Make the primary iconic landmark (e.g. main arch, signature grandstand) the centered, dominant subject.

* Instead, the section hero SHOULD:

  * Place action or the section subject (e.g. jumper, shopper flow, spectator band) in the foreground or mid-foreground.
  * Use depth of field, partial cropping, or angle to keep the background recognisable only as soft shapes, not detailed architectural documentation.

* Required visual continuity with the venue hero:

  * Same footing type and color.
  * Same indoor vs outdoor context.
  * Season-consistent lighting and atmosphere.

---

## 6. Prompt construction

The image runner converts the structured object into a single natural-language prompt with the following structure.

### 6.1 High-level request

* One or two sentences specifying:

  * That the image is an original, photorealistic **section hero image** for `{section_label}` at `{venue_name}`.
  * The geographic context if available (`city`, `state`, `country`).
  * The required aspect ratio: `16:9`, suitable for a web section hero.

### 6.2 Verified feature summary

* A compact restatement of the `features` object, with **no new facts**, merging bullets into clauses:

  * Layout and context: 1–3 short clauses from `features.layout_and_context`.
  * Structures and fixtures: 1–3 short clauses from `features.structures_and_fixtures`.
  * People and activity: 1–2 short clauses from `features.people_and_activity`.
  * Landscape and surroundings: 1–2 short clauses from `features.landscape_and_surroundings`.
  * Surfaces and materials: 1–2 short clauses from `features.surfaces_and_materials`.
  * Branding and atmosphere: 1–2 short clauses from `features.branding_and_atmosphere`.

* These clauses MUST be clearly identified as the **only** allowed structural and environmental cues.

### 6.3 Section view framing

* Insert `section_view_guidance` verbatim as the framing description, prefixed with a label like:

  * "Section view framing:" or similar.

This paragraph defines the camera distance, angle, and which parts of the section are in frame.

### 6.4 Relationship-to-hero block (embedded)

* Insert an explicit constraints block stating that the section hero:

  * Must not reuse a wide, arena-overview composition.
  * Must be tighter and more action-focused.
  * Must keep background structures and landmarks simplified or partially out of frame.

Example phrasing:

* "This section hero must not look like a second wide venue hero. Use a tighter, action-focused framing with a simplified, slightly blurred or partially cropped background. Keep footing, indoor/outdoor context, and overall palette consistent with the venue, but avoid repeating the wide arena overview or making the main landmark the central subject again."

### 6.5 Environment and scaling block (embedded)

* Insert an explicit constraints block that restates the environment and scaling rules in user-facing language, for example:

  * "Use the environment exactly as described in the verified features: if the section is indoor, keep it fully indoor with roof, walls, and artificial lighting and no exterior horizon; if it is outdoor, only use the specific tree types, vegetation, horizon, and skyline patterns mentioned. Do not add trees, hills, lakes, or city skylines that are not in the feature list, and do not enlarge modest stands into stadium bowls or invent new barns or towers."

### 6.6 Season note

* Add a single sentence referencing `season_label`, e.g.:

  * "Subtly adjust lighting and color temperature to match {season_label} while remaining realistic for this venue and consistent with the verified references."

### 6.7 Composition and style notes

* Add a concise section stating:

  * Style: high-resolution, natural-looking photograph (not painted or stylized) with realistic lens perspective and believable colors.
  * Camera: mid-distance or mid-close view of the section subject consistent with `section_view_guidance`, clearly showing the section’s purpose.
  * Aspect ratio: `16:9`.
  * People: riders, spectators, shoppers, and staff only as small, generic figures without recognisable faces or copied poses.

### 6.8 Strict constraints

Conclude the prompt with explicit hard rules:

* Do not add any structures, trees, skyline, or landscape elements that are not explicitly supported by the verified features.
* Do not upscale modest seating into giant stadiums or introduce new buildings.
* Do not recreate, match, or trace any specific existing photograph; the image must be an original composition that follows only the verified structural and atmospheric cues from the research runner.
* Do not contradict the `season_label` or indoor/outdoor classification derived from `features`, except for subtle, realistic lighting shifts as allowed above.
* Do not allow the composition to collapse back into a wide, venue-hero-style overview; the image must remain section-focused and tighter than the venue hero.
