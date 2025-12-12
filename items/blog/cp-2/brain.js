/* ============================================================
   BRAIN.JS — FINAL GLUE LAYER
   cp:2   (blog street)
   This version FORCES:
   - CR → member-template-cr-prompt.txt
   - CW → member-template-cw-prompt.txt
   - PR → member-template-pr-prompt.txt
   - PW → member-template-pw-prompt.txt
   - RWT → member-template-rwt-prompt.txt

   There are ZERO fallbacks.
   If a file is missing, the run stops.
   ============================================================ */

import fs from "fs";
import path from "path";
import { callOpenAI } from "./mini.js";  // your existing wrapper

// ---------------------------------------------
// Load one template file (sync)
// ---------------------------------------------
function loadTemplate(filePath) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) {
    throw new Error("Template missing: " + full);
  }
  return fs.readFileSync(full, "utf8");
}

// ---------------------------------------------
// Lane → template file mapping (FINAL / LOCKED)
// ---------------------------------------------
const TEMPLATE_MAP = {
  "crr": "member-template-cr-prompt.txt",
  "cwr": "member-template-cw-prompt.txt",
  "prr": "member-template-pr-prompt.txt",
  "pwr": "member-template-pw-prompt.txt",
  "rwt": "member-template-rwt-prompt.txt"
};

// ---------------------------------------------
// Execute a lane
// ---------------------------------------------
export async function executeLane(laneKey, laneInput, houseRoot) {
  const templateFile = TEMPLATE_MAP[laneKey];
  if (!templateFile) {
    throw new Error(`Lane ${laneKey} has no template mapping.`);
  }

  const templatePath = path.join(houseRoot, templateFile);

  // Load template text
  const promptText = loadTemplate(templatePath);

  // Build OpenAI call payload
  const messages = [
    { role: "system", content: promptText },
    { role: "user", content: JSON.stringify(laneInput) }
  ];

  // Call LLM
  let raw;
  try {
    raw = await callOpenAI(messages);
  } catch (err) {
    throw new Error(`OpenAI error in ${laneKey}: ${err.message}`);
  }

  // Parse JSON safely
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Lane ${laneKey} returned invalid JSON.\nRaw output:\n${raw}`
    );
  }

  return parsed;
}

