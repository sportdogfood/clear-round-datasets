/**
 * runner.js — cp:2 Glue Integration
 * Resolves trigger, loads job, uses glue-contract to bind lanes,
 * launches brain.js to execute them in correct order,
 * then commits results via docs/commit-bulk.
 */

import fs from "fs";
import { executeLanes } from "./brain.js";
import { rowsGet } from "./rows.js";
import { gitCommitBulk } from "./git.js";

const glue = JSON.parse(
  fs.readFileSync("blog-cp2-glue-contract.json", "utf-8")
);

export async function run(trigger) {

  // -------------------------------------------------------
  // 1. Validate trigger
  // -------------------------------------------------------
  if (trigger !== glue.trigger) {
    throw new Error(`Invalid trigger '${trigger}'. Expected '${glue.trigger}'.`);
  }

  // -------------------------------------------------------
  // 2. Load job-definition from Rows
  // -------------------------------------------------------
  const job = await rowsGet("job-definition", "job-4434456");

  // -------------------------------------------------------
  // 3. Load datasets
  // -------------------------------------------------------
  const datasets = {};
  for (const d of job.datasets) {
    const key = d.role_key;
    datasets[key] = await rowsGet(d.table_id, d.range);
  }

  // -------------------------------------------------------
  // 4. Execute all lanes in brain.js
  // -------------------------------------------------------
  const finalOutput = await executeLanes(job, datasets);

  // -------------------------------------------------------
  // 5. Commit final JSON via docs/commit-bulk
  // -------------------------------------------------------
  const target = job.paths.docs_finals_root + job.job_id + ".json";

  const base64 = Buffer.from(JSON.stringify(finalOutput, null, 2)).toString(
    "base64"
  );

  const commitPayload = {
    message: `Final commit for ${job.job_id}`,
    overwrite: true,
    files: [
      {
        path: target,
        content_type: "application/json",
        content_base64: base64
      }
    ]
  };

  const commitResp = await gitCommitBulk(commitPayload);

  // -------------------------------------------------------
  // 6. Debug log
  // -------------------------------------------------------
  const logPath = job.paths.docs_logs_root + job.job_id + "-log.json";
  const log = {
    timestamp: new Date().toISOString(),
    trigger,
    job_id: job.job_id,
    datasets_loaded: Object.keys(datasets),
    commit_path: target,
    commit_sha: commitResp.sha
  };

  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  return finalOutput;
}
