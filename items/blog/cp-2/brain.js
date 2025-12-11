// File: items/blog/cp-2/brains.js
// Purpose: Run full cp:2 pipeline (exp → crr → cwr → prr → pwr → rwt)
// Returns:
//   { job_id, final_json, lane_logs }

import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "<PUT_YOUR_KEY_HERE>"
});

// Helper: load text file
async function loadText(filePath) {
  const abs = path.resolve(filePath);
  return fs.readFile(abs, "utf8");
}

// Helper: call model with a prompt and JSON response
async function runLane(prompt, inputJson) {
  const userContent = JSON.stringify(inputJson, null, 2);

  const completion = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      { role: "system", content: prompt },
      { role: "user", content: userContent }
    ],
    response_format: { type: "json_object" }
  });

  return completion.output[0].content[0].text;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    const { runner_id, job_definition, datasets_by_role } = req.body;
    const job_id = job_definition?.job_id;

    // ---------------------------
    // Load all member templates
    // ---------------------------
    const base = "items/blog/cp-2";

    const expPrompt  = await loadText(`${base}/member-template-exp.prompt`);
    const crrPrompt  = await loadText(`${base}/member-template-cr.prompt`);
    const cwrPrompt  = await loadText(`${base}/member-template-cw.prompt`);
    const prrPrompt  = await loadText(`${base}/member-template-pr.prompt`);
    const pwrPrompt  = await loadText(`${base}/member-template-pw.prompt`);
    const rwtPrompt  = await loadText(`${base}/member-template-rwt.prompt`);

    // ---------------------------
    // Build lane_inputs
    // datasets_by_role = cr0, pr1
    // ---------------------------

    const cr0 = datasets_by_role["cr0"]?.items ?? [];
    const pr1 = datasets_by_role["pr1"]?.items ?? [];

    // Expeditor input uses entire job + datasets
    const expInput = {
      job_definition,
      datasets_by_role
    };

    // ---------------------------
    // RUN LANES IN SEQUENCE
    // ---------------------------

    const lane_logs = {};

    // 1) EXP
    const expOutput = JSON.parse(await runLane(expPrompt, expInput));
    lane_logs.exp_output = expOutput;

    // 2) CRR (collection researcher)
    const crrInput = {
      job_definition,
      event_block: expOutput.event_block,
      venue_block: expOutput.venue_block,
      city_season_block: expOutput.city_season_block,
      dataset_rows: cr0
    };
    const crrOutput = JSON.parse(await runLane(crrPrompt, crrInput));
    lane_logs.crr_output = crrOutput;

    // 3) CWR (collection writer)
    const cwrInput = {
      job_definition,
      research: crrOutput
    };
    const cwrOutput = JSON.parse(await runLane(cwrPrompt, cwrInput));
    lane_logs.cwr_output = cwrOutput;

    // 4) PRR (places researcher)
    const prrInput = {
      job_definition,
      dataset_rows: pr1
    };
    const prrOutput = JSON.parse(await runLane(prrPrompt, prrInput));
    lane_logs.prr_output = prrOutput;

    // 5) PWR (places writer)
    const pwrInput = {
      job_definition,
      research: prrOutput
    };
    const pwrOutput = JSON.parse(await runLane(pwrPrompt, pwrInput));
    lane_logs.pwr_output = pwrOutput;

    // 6) RWT (final merge writer)
    const rwtInput = {
      job_definition,
      collection_body: cwrOutput,
      places_body: pwrOutput
    };
    const final_json = JSON.parse(await runLane(rwtPrompt, rwtInput));
    lane_logs.rwt_output = final_json;

    // ---------------------------
    // RETURN PIPELINE RESULT
    // ---------------------------

    res.status(200).json({
      job_id,
      final_json,
      lane_logs
    });

  } catch (err) {
    console.error("BRAINS ERROR:", err);
    res.status(500).json({
      error: "Brains pipeline failed",
      detail: err.message
    });
  }
}
