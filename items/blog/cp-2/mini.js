import fs from "node:fs/promises";
import path from "node:path";

// Utility to load the local MINI instructions text
export async function loadMiniText() {
  const p = path.resolve(process.cwd(), "instructions-mini.txt");
  return await fs.readFile(p, "utf8");
}

// Diagnostic output (instead of committing)
export async function showFinalOutput(state) {
  if (!state?.final_output) {
    console.error("❌ No final_output found in state");
    return;
  }

  console.log("=== FINAL OUTPUT (pre-commit) ===");
  console.log(JSON.stringify(state.final_output, null, 2));
  console.log("================================");
}

// REQUIRED BY brain.js — glue only, no OpenAPI call
export async function callOpenAI(payload) {
  return {
    ok: true,
    mode: "local-sim",
    payload
  };
}
