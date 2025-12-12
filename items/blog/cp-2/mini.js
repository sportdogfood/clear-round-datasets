/* ============================================================
   MINI.JS — CP:2 PIPELINE ORCHESTRATOR
   Executes lanes in run_order
   No logic beyond sequencing and handoff
   ============================================================ */

import { runExpeditor } from "./expeditor.js";
import { runCollectionResearcher } from "./cr.js";
import { runCollectionWriter } from "./cw.js";
import { runPlacesResearcher } from "./pr.js";
import { runPlacesWriter } from "./pw.js";
import { runRewriter } from "./rwt.js";

export async function runMiniPipeline(job) {
  let state = {
    job,
    exp: null,
    cr: null,
    cw: null,
    pr: null,
    pw: null,
    final: null
  };

  for (const lane of job.run_order) {
    switch (lane) {
      case "exp":
        state.exp = await runExpeditor(job);
        break;

      case "cr0":
      case "crr":
        state.cr = await runCollectionResearcher(job, state.exp);
        break;

      case "cw0":
      case "cwr":
        state.cw = await runCollectionWriter(job, state.cr);
        break;

      case "pr1":
      case "prr":
        state.pr = await runPlacesResearcher(job, state.exp);
        break;

      case "pw1":
      case "pwr":
        state.pw = await runPlacesWriter(job, state.pr);
        break;

      case "rwt":
        state.final = await runRewriter(job, state.cw, state.pw);
        break;

      default:
        throw new Error(`Unknown lane in run_order: ${lane}`);
    }
  }

  return state.final;
}
