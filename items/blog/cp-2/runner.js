/**
 * File: items/blog/cp-2/brains.js
 * Runner: blog-cp:2 — brains
 * Version: v2025-12-12T03:25Z
 *
 * PURPOSE:
 * - Accept pipeline request from runner.js
 * - Execute 3 grouped steps:
 *      A1 = CRR + CWR
 *      A2 = PRR + PWR
 *      A3 = RWT final pass
 * - Return final_json + lane_logs back to runner.js
 *
 * NOTES:
 * - No external APIs (OpenAI, etc.)
 * - All prompting is done via "chatWithGPT()" which calls ChatGPT itself
 *   through the runner-side handshake.
 * - Each lane returns structured JSON; errors propagate upward.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------
// GPT handshake (local ChatGPT call through your wrapper)
// ---------------------------------------------------------
async function chatWithGPT(prompt) {
  // You replace this with your actual ChatGPT call.
  // For now, it acts as a placeholder that simply returns
  // the prompt so the pipeline wiring can be tested.
  return {
    ok: true,
    data: { echo: prompt }
  };
}

// ---------------------------------------------------------
// Load a prompt template from Items (local file system)
// ---------------------------------------------------------
function loadPrompt(relPath) {
  const p = path.join(process.cwd(), relPath);
  return fs.readFileSync(p, "utf8");
}

// ---------------------------------------------------------
// Helper: run one lane using a prompt template + JSON
// ---------------------------------------------------------
async function runLane(laneName, template, json) {
  const payload = {
    lane: laneName,
    template,
    json
  };

  const resp = await chatWithGPT(payload);

  if (!resp.ok) {
    throw new Error(`Lane ${laneName} failed: ${resp.error || "unknown error"}`);
  }

  return resp.data;
}

// ---------------------------------------------------------
// MAIN brains() — 3 grouped calls
// ---------------------------------------------------------
export async function brains(requestBody) {
  const {
    runner_id,
    mode,
    job_definition,
    datasets_by_role
  } = requestBody;

  const logs = {
    crr: null,
    cwr: null,
    prr: null,
    pwr: null,
    rwt: null
  };

  // -----------------------------------------
  // LOAD TEMPLATES
  // -----------------------------------------
  const t_cr  = loadPrompt("items/blog/cp-2/member-template-cr-prompt.txt");
  const t_cw  = loadPrompt("items/blog/cp-2/member-template-cw-prompt.txt");
  const t_pr  = loadPrompt("items/blog/cp-2/member-template-pr-prompt.txt");
  const t_pw  = loadPrompt("items/blog/cp-2/member-template-pw-prompt.txt");
  const t_rwt = loadPrompt("items/blog/cp-2/member-template-rwt-prompt.txt");

  // -----------------------------------------
  // A1 = CRR + CWR
  // -----------------------------------------
  const exp_cr0 = datasets_by_role["cr0"];
  if (!exp_cr0) {
    throw new Error("Missing cr0 payload for A1 pipeline");
  }

  const crr_in = { data: exp_cr0.items };
  const crr_out = await runLane("crr", t_cr, crr_in);
  logs.crr = crr_out;

  const cwr_in = { research: crr_out };
  const cwr_out = await runLane("cwr", t_cw, cwr_in);
  logs.cwr = cwr_out;

  // -----------------------------------------
  // A2 = PRR + PWR
  // -----------------------------------------
  const exp_pr1 = datasets_by_role["pr1"];
  if (!exp_pr1) {
    throw new Error("Missing pr1 payload for A2 pipeline");
  }

  const prr_in = { data: exp_pr1.items };
  const prr_out = await runLane("prr", t_pr, prr_in);
  logs.prr = prr_out;

  const pwr_in = { research: prr_out };
  const pwr_out = await runLane("pwr", t_pw, pwr_in);
  logs.pwr = pwr_out;

  // -----------------------------------------
  // A3 = RWT (final merge + polish)
  // -----------------------------------------
  const rwt_in = {
    collection: cwr_out,
    places: pwr_out
  };

  const rwt_out = await runLane("rwt", t_rwt, rwt_in);
  logs.rwt = rwt_out;

  // -----------------------------------------
  // RETURN
  // -----------------------------------------
  return {
    job_id: job_definition.job_id,
    final_json: rwt_out,
    lane_logs: logs
  };
}
