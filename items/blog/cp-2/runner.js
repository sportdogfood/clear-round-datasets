/* ============================================================
   RUNNER.JS — FINAL EXECUTION GLUE FOR CP:2
   ============================================================ */

import fs from "fs";
import path from "path";
import { executeLane } from "./brain.js";
import { buildExpeditorOutput } from "./expeditor-contract.js";
import { docs_commit_bulk } from "./git-commit.js";

// Ensure directory exists
function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function runJob(jobDefinition) {
  const job_id = jobDefinition.job_id;
  const run_order = jobDefinition.run_order;
  const houseRoot = "items/blog/cp-2/";

  // Directories
  const itemsRoot = jobDefinition.paths.items_root;
  const logsRoot  = jobDefinition.paths.docs_logs_root;
  const finalsRoot = jobDefinition.paths.docs_finals_root;

  mkdirp(itemsRoot);
  mkdirp(logsRoot);
  mkdirp(finalsRoot);

  // ---------------------------------------
  // EXPEDITOR (builds identity + lane inputs)
  // ---------------------------------------
  const exp = await buildExpeditorOutput(jobDefinition);

  // Collect lane results
  const laneResults = {};

  // ---------------------------------------
  // LANE EXECUTION LOOP
  // ---------------------------------------
  for (const laneKey of run_order) {
    let laneInput;

    if (laneKey === "crr") {
      laneInput = exp.cr_input;
    }

    else if (laneKey === "cwr") {
      laneInput = {
        job_id,
        street: jobDefinition.street,
        house: jobDefinition.house,
        lane: "cwr",
        cid: exp.cid,
        event_identity: exp.event_identity,
        collection_research: laneResults["crr"]?.collection_research || {}
      };
    }

    else if (laneKey === "prr") {
      laneInput = exp.pr_input;
    }

    else if (laneKey === "pwr") {
      laneInput = {
        job_id,
        street: jobDefinition.street,
        house: jobDefinition.house,
        lane: "pwr",
        cid: exp.cid,
        stay_research: laneResults["prr"]?.stay_research || {},
        dine_research: laneResults["prr"]?.dine_research || {},
        essentials_research: laneResults["prr"]?.essentials_research || {},
        locale_research: laneResults["prr"]?.locale_research || {}
      };
    }

    else if (laneKey === "rwt") {
      // receives full tree for final assembly
      laneInput = {
        job_id,
        street: jobDefinition.street,
        house: jobDefinition.house,
        lane: "rwt",
        cid: exp.cid,

        event_identity: exp.event_identity,

        collection_output: laneResults["cwr"] || {},
        profile_output: laneResults["pwr"] || {},

        global_rules: jobDefinition.global_rules
      };
    }

    else {
      throw new Error("Unsupported lane: " + laneKey);
    }

    // Run the lane
    const result = await executeLane(laneKey, laneInput, houseRoot);
    laneResults[laneKey] = result;

    // Write lane output to items folder
    const laneOutPath = path.join(itemsRoot, `${laneKey}-output.json`);
    fs.writeFileSync(laneOutPath, JSON.stringify(result, null, 2));
  }

  // ---------------------------------------
  // FINAL OUTPUT (from RWT)
  // ---------------------------------------
  const finalJson = laneResults["rwt"];
  const jsonPath = path.join(finalsRoot, `${job_id}-final.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(finalJson, null, 2));

  // ---------------------------------------
  // Build HTML via writer result
  // ---------------------------------------
  const html = finalJson.html || "<p>No HTML returned.</p>";
  const htmlPath = path.join(finalsRoot, `${job_id}-final.html`);
  fs.writeFileSync(htmlPath, html);

  // ---------------------------------------
  // LOG FILE
  // ---------------------------------------
  const log = { job_id, laneResults };
  const logPath = path.join(logsRoot, `${job_id}-log.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  // ---------------------------------------
  // COMMIT (docs_commit_bulk)
  // ---------------------------------------
  const commitPayload = {
    message: `Final commit for ${job_id}`,
    overwrite: true,
    files: [
      {
        path: `blog/cp-2/finals/${job_id}-final.json`,
        content_type: "application/json",
        content_base64: Buffer.from(JSON.stringify(finalJson)).toString("base64")
      },
      {
        path: `blog/cp-2/finals/${job_id}-final.html`,
        content_type: "text/html",
        content_base64: Buffer.from(html).toString("base64")
      },
      {
        path: `blog/cp-2/logs/${job_id}-log.json`,
        content_type: "application/json",
        content_base64: Buffer.from(JSON.stringify(log)).toString("base64")
      }
    ]
  };

  return await docs_commit_bulk(commitPayload);
}
