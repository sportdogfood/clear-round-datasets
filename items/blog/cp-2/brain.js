/**
 * brain.js — cp:2 Glue Layer Integration
 * Loads glue-contract, applies lane bindings, executes members,
 * and hands final output back to runner.js.
 */

import fs from "fs";
import path from "path";

// Load glue contract
const glue = JSON.parse(
  fs.readFileSync("blog-cp2-glue-contract.json", "utf-8")
);

// Utility: load prompt template
export function loadTemplate(file) {
  return fs.readFileSync(path.join("blog-cp-2", file), "utf-8");
}

// Execute one lane with a template and input
async function runLane(laneName, templateName, inputPayload, globalRules) {
  const prompt = loadTemplate(templateName);

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    temperature: 0,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: JSON.stringify({
          lane: laneName,
          input: inputPayload,
          rules: globalRules
        })
      }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

// Main execution entry called by runner.js
export async function executeLanes(job, datasets) {
  const out = {};
  const g = job.global_rules;

  // ======================================================
  // EXPEDITOR
  // ======================================================
  out.crr_input = datasets.cr0;
  out.cwr_input = datasets.cr0;
  out.prr_input = datasets.pr1;
  out.pwr_input = datasets.pr1;

  // ======================================================
  // CRR
  // ======================================================
  out.crr_output = await runLane(
    "crr",
    glue.house_binding.files.cr_template,
    out.crr_input,
    g
  );

  // ======================================================
  // CWR
  // ======================================================
  out.cwr_output = await runLane(
    "cwr",
    glue.house_binding.files.cw_template,
    {
      cwr_input: out.cwr_input,
      crr_output: out.crr_output
    },
    g
  );

  // ======================================================
  // PRR
  // ======================================================
  out.prr_output = await runLane(
    "prr",
    glue.house_binding.files.pr_template,
    out.prr_input,
    g
  );

  // ======================================================
  // PWR
  // ======================================================
  out.pwr_output = await runLane(
    "pwr",
    glue.house_binding.files.pw_template,
    {
      pwr_input: out.pwr_input,
      prr_output: out.prr_output
    },
    g
  );

  // ======================================================
  // RWT — Merge + Polish
  // ======================================================
  out.final_output = await runLane(
    "rwt",
    glue.house_binding.files.rwt_template,
    {
      cwr_output: out.cwr_output,
      pwr_output: out.pwr_output
    },
    g
  );

  return out.final_output;
}
