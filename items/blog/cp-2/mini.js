import fs from "node:fs/promises";
import path from "node:path";

// Load local contract file
export async function loadMiniText() {
  const p = path.resolve(process.cwd(), "instructions-mini.txt");
  return await fs.readFile(p, "utf8");
}

// Diagnostic helper to inspect pre-commit output
export async function showFinalOutput(state) {
  if (!state?.final_output) {
    console.error("⚠️  No final_output in state");
    return;
  }

  console.log("===== FINAL OUTPUT (pre-commit) =====");
  console.log(JSON.stringify(state.final_output, null, 2));
  console.log("=====================================");
}

// REQUIRED BY brain.js — glue only, no OpenAPI
export async function callOpenAI(payload) {
  return {
    ok: true,
    mode: "local-sim",
    payload
  };
}
