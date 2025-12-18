// mini-runner.mjs
// BLOG cp:2 — Diagnostic MINI (safe live mode)
// Version: v2025-12-18-dbg01

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/* -----------------------------------------------------------
   UTILITIES
----------------------------------------------------------- */

const ts = () => new Date().toISOString();

function logInfo(msg, obj) {
  console.log(`[${ts()}] ℹ️  ${msg}`);
  if (obj) console.log(JSON.stringify(obj, null, 2));
}

function logWarn(msg) {
  console.warn(`[${ts()}] ⚠️  ${msg}`);
}

function logError(msg) {
  console.error(`[${ts()}] ❌  ${msg}`);
}

/* -----------------------------------------------------------
   HOUSE + MINI HELPERS
----------------------------------------------------------- */

export async function loadMiniText() {
  const p = path.resolve(process.cwd(), "instructions-mini.txt");
  return await fs.readFile(p, "utf8");
}

// Print and optionally write pre-commit JSON for inspection
export async function showFinalOutput(state) {
  if (!state?.final_output) {
    logWarn("No final_output found in state.");
    return;
  }

  const jobId = state.final_output.job_id || "unknown-job";
  const outDir = path.resolve(process.cwd(), "tmp-precommit");
  await fs.mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `${jobId}-final.json`);
  const htmlPath = path.join(outDir, `${jobId}-final.html`);
  const logPath = path.join(outDir, `${jobId}-runlog.json`);

  // Basic diagnostics
  logInfo("Dumping FINAL OUTPUT (pre-commit):", {
    job_id: jobId,
    keys: Object.keys(state.final_output || {}),
  });

  // Write JSON
  await fs.writeFile(jsonPath, JSON.stringify(state.final_output, null, 2));
  logInfo(`Saved pre-commit JSON → ${jsonPath}`);

  // Try deterministic HTML render if structure exists
  try {
    const f = state.final_output;
    const html = `
<div class="collection-body">
  <p>${f?.collection_body?.paragraph_1 || ""}</p>
  <p>${f?.collection_body?.paragraph_2 || ""}</p>
</div>
<div class="places-body">
  <p>${f?.places_body?.stay_paragraph || ""}</p>
  <p>${f?.places_body?.dine_paragraph || ""}</p>
  <p>${f?.places_body?.essentials_paragraph || ""}</p>
  <p>${f?.places_body?.locale_paragraph || ""}</p>
  <p>${f?.places_body?.outro_paragraph || ""}</p>
</div>`;
    await fs.writeFile(htmlPath, html.trim());
    logInfo(`Saved pre-commit HTML → ${htmlPath}`);
  } catch (err) {
    logWarn(`Could not render HTML preview: ${err.message}`);
  }

  // Dump lane logs if present
  if (state.lane_logs) {
    await fs.writeFile(logPath, JSON.stringify(state.lane_logs, null, 2));
    logInfo(`Saved lane log JSON → ${logPath}`);
  }

  // Console summary
  console.log("===== FINAL OUTPUT (pre-commit) =====");
  console.log(JSON.stringify(state.final_output, null, 2));
  console.log("=====================================");
}

// Glue stub for brain.js
export async function callOpenAI(payload) {
  logInfo("Simulated OpenAI call (local-sim)", payload);
  return {
    ok: true,
    mode: "local-sim",
    payload,
  };
}

/* -----------------------------------------------------------
   MAIN EXECUTION (example integration)
----------------------------------------------------------- */

export async function runMini(job_definition, state) {
  try {
    logInfo("Starting MINI diagnostics for blog-cp:2");

    // 1️⃣ Validate job_definition
    if (job_definition.street !== "blog" || job_definition.house !== "cp:2") {
      throw new Error("job_definition validation failed");
    }
    logInfo("Validated job_definition", { job_id: job_definition.job_id });

    // 2️⃣ Assume git.brains already ran, so state.final_output exists
    if (!state.final_output) {
      throw new Error("Missing final_output from brains pipeline");
    }

    // 3️⃣ Show diagnostics before commit
    await showFinalOutput(state);

    // 4️⃣ (Placeholder for commit phase)
    logInfo("Ready for docs_commit_bulk → skipping actual push (diagnostic mode)");
    return {
      ok: true,
      job_id: job_definition.job_id,
      mode: "diagnostic",
      dump_path: "tmp-precommit/",
    };
  } catch (err) {
    logError(`Runner failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/* -----------------------------------------------------------
   EXAMPLE USAGE (local test)
----------------------------------------------------------- */

if (process.argv[1].endsWith("mini-runner.mjs")) {
  // Example local simulation
  const dummyJob = { job_id: "job-4434456", street: "blog", house: "cp:2" };
  const dummyState = {
    final_output: {
      job_id: "job-4434456",
      dataset_id: "demo",
      collection_body: {
        paragraph_1: "During the show week, the grounds stay busy yet grounded.",
        paragraph_2: "Outside, the city offers quiet resets and simple comforts.",
      },
      places_body: {
        stay_paragraph: "Riders tend to stay near the barns or nearby motels.",
        dine_paragraph: "Simple cafes handle the breakfast rush.",
        essentials_paragraph: "Groceries and pharmacies are within a short drive.",
        locale_paragraph: "Local parks give brief calm between classes.",
        outro_paragraph: "A practical week for those in the circuit rhythm.",
      },
    },
    lane_logs: { exp: "ok", cw1: "ok" },
  };

  runMini(dummyJob, dummyState).then((r) => {
    console.log("\nRun complete:", r);
  });
}
