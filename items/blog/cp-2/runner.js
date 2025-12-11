// File: items/blog/cp-2/runner.js
// Runner: blog-cp:2 — brains
// Version: v2025-12-11T23:45Z

// NOTE:
// - This is a SMOKE-TEST runner.
// - It checks that Rows + Items + house files + datasets are wired.
// - It does NOT actually call model prompts or docs_commit_bulk yet.
// - You can run it with: node runner.js start blog-cp:2

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// ---- CONFIG: adjust to your infra ----
const ROWS_BASE = "https://api.rows.com";
const ITEMS_BASE = "https://items.clearroundtravel.com";
const ROWS_API_KEY = process.env.ROWS_API_KEY;     // set in env
const ITEMS_API_KEY = process.env.ITEMS_API_KEY;   // if needed

// These match instructions-mini
const JOB_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
const JOB_TABLE_ID = "a2300cab-6557-4c6a-8e48-129b169bcc68";
const JOB_RANGE    = "A2:B999";

const HOUSE_ROOT = "items/blog/cp-2/";  // as in runner.txt

// -----------------------------------------------------
// Helpers: HTTP wrappers
// -----------------------------------------------------

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}: ${text}`);
  }
  return res.json();
}

function buildRowsHeaders() {
  return {
    "Authorization": `Bearer ${ROWS_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// items.clearroundtravel.com usually just needs GET, no auth;
// if you require auth, add header here.
function buildItemsHeaders() {
  const h = { "Content-Type": "application/json" };
  if (ITEMS_API_KEY) h["Authorization"] = `Bearer ${ITEMS_API_KEY}`;
  return h;
}

// -----------------------------------------------------
// 1. Load job_definition from Rows
// -----------------------------------------------------

async function loadJobDefinition(triggerKey = "blog-cp:2") {
  const url = `${ROWS_BASE}/spreadsheets/${JOB_SHEET_ID}/tables/${JOB_TABLE_ID}/values/${encodeURIComponent(JOB_RANGE)}`;
  const data = await fetchJson(url, { headers: buildRowsHeaders() });

  const rows = data.items || data.values || [];
  const row = rows.find(r => r[0] === triggerKey);
  if (!row) {
    throw new Error(`No job_definition row for trigger ${triggerKey}`);
  }

  let jobDef;
  try {
    jobDef = JSON.parse(row[1]);
  } catch (e) {
    throw new Error(`Failed to parse job_definition JSON: ${e.message}`);
  }

  // Minimal validation
  if (jobDef.street !== "blog") {
    throw new Error(`job_definition.street must be "blog", got ${jobDef.street}`);
  }
  if (jobDef.house !== "cp:2") {
    throw new Error(`job_definition.house must be "cp:2", got ${jobDef.house}`);
  }
  if (!Array.isArray(jobDef.run_order) || jobDef.run_order.length === 0) {
    throw new Error(`job_definition.run_order missing or empty`);
  }
  if (!Array.isArray(jobDef.datasets) || jobDef.datasets.length === 0) {
    throw new Error(`job_definition.datasets missing or empty`);
  }
  if (!jobDef.paths || !jobDef.paths.docs_finals_root || !jobDef.paths.docs_logs_root) {
    throw new Error(`job_definition.paths.docs_finals_root / docs_logs_root required`);
  }

  return jobDef;
}

// -----------------------------------------------------
// 2. Load house files from Items
// -----------------------------------------------------

async function loadHouseFile(relPath) {
  const url = `${ITEMS_BASE}/${relPath}`;
  return fetchJson(url, { headers: buildItemsHeaders() });
}

async function loadTextHouseFile(relPath) {
  const url = `${ITEMS_BASE}/${relPath}`;
  const res = await fetch(url, { headers: buildItemsHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}: ${text}`);
  }
  return res.text();
}

async function loadHouse() {
  const files = {
    pipelineSpec:      `${HOUSE_ROOT}pipeline-spec.json`,
    styleSpec:         `${HOUSE_ROOT}style-spec.json`,
    expContract:       `${HOUSE_ROOT}expeditor-contract.json`,
    finalSchema:       `${HOUSE_ROOT}final-schema.json`,
    commitSpec:        `${HOUSE_ROOT}commit-spec.json`,
    checker:           `${HOUSE_ROOT}checker.json`,
    memberCr:          `${HOUSE_ROOT}member-template-cr.prompt`,
    memberCw:          `${HOUSE_ROOT}member-template-cw.prompt`,
    memberPr:          `${HOUSE_ROOT}member-template-pr.prompt`,
    memberPw:          `${HOUSE_ROOT}member-template-pw.prompt`,
    memberRwt:         `${HOUSE_ROOT}member-template-rwt.prompt`,
    instructionsMini:  `${HOUSE_ROOT}instructions-mini.txt`,
    instructions:      `${HOUSE_ROOT}instructions.txt`,
  };

  // Load JSON files
  const [
    pipelineSpec,
    styleSpec,
    expContract,
    finalSchema,
    commitSpec,
    checker,
  ] = await Promise.all([
    loadHouseFile("blog/cp-2/pipeline-spec.json"),
    loadHouseFile("blog/cp-2/style-spec.json"),
    loadHouseFile("blog/cp-2/expeditor-contract.json"),
    loadHouseFile("blog/cp-2/final-schema.json"),
    loadHouseFile("blog/cp-2/commit-spec.json"),
    loadHouseFile("blog/cp-2/checker.json"),
  ]);

  // Load prompts / instructions as text
  const [
    memberCr,
    memberCw,
    memberPr,
    memberPw,
    memberRwt,
    instructionsMini,
    instructions,
  ] = await Promise.all([
    loadTextHouseFile("blog/cp-2/member-template-cr.prompt"),
    loadTextHouseFile("blog/cp-2/member-template-cw.prompt"),
    loadTextHouseFile("blog/cp-2/member-template-pr.prompt"),
    loadTextHouseFile("blog/cp-2/member-template-pw.prompt"),
    loadTextHouseFile("blog/cp-2/member-template-rwt.prompt"),
    loadTextHouseFile("blog/cp-2/instructions-mini.txt"),
    loadTextHouseFile("blog/cp-2/instructions.txt"),
  ]);

  return {
    pipelineSpec,
    styleSpec,
    expContract,
    finalSchema,
    commitSpec,
    checker,
    memberCr,
    memberCw,
    memberPr,
    memberPw,
    memberRwt,
    instructionsMini,
    instructions,
  };
}

// -----------------------------------------------------
// 3. Fetch datasets
// -----------------------------------------------------

async function fetchDataset(ds) {
  const { sheet_id, table_id, range, role_key, domains } = ds;
  const url = `${ROWS_BASE}/spreadsheets/${sheet_id}/tables/${table_id}/values/${encodeURIComponent(range)}`;
  const data = await fetchJson(url, { headers: buildRowsHeaders() });
  const items = data.items || data.values || [];
  return {
    role_key,
    domains,
    items,
  };
}

async function loadDatasets(jobDef) {
  const results = await Promise.all(jobDef.datasets.map(fetchDataset));
  const byRole = {};
  for (const r of results) {
    byRole[r.role_key] = r;
  }
  return byRole;
}

// -----------------------------------------------------
// 4. Run lanes (SMOKE ONLY: no model calls)
// -----------------------------------------------------

async function runPipeline(jobDef, house, datasetsByRole) {
  const state = {
    exp_output: null,
    crr_output: null,
    cwr_output: null,
    prr_output: null,
    pwr_output: null,
    rwt_output: null,
  };

  // For now, just log what we WOULD do.
  console.log("▶ run_order:", jobDef.run_order.join(" → "));

  for (const lane of jobDef.run_order) {
    switch (lane) {
      case "exp":
        console.log("  [exp] would shape datasets (cr0, pr1) into cr0_input/pr1_input");
        state.exp_output = {
          cr0_input: { stub: true, role_key: "cr0" },
          pr1_input: { stub: true, role_key: "pr1" },
        };
        break;

      case "crr":
        console.log("  [crr] would call member-template-cr.prompt with cr0_input");
        state.crr_output = { stub: true, lane: "crr" };
        break;

      case "cwr":
        console.log("  [cwr] would call member-template-cw.prompt with crr_output");
        state.cwr_output = {
          job_id: jobDef.job_id,
          dataset_id: "cr0",
          collection_body: {
            paragraph_1: "Stub paragraph 1 from cwr.",
            paragraph_2: "Stub paragraph 2 from cwr.",
          },
        };
        break;

      case "prr":
        console.log("  [prr] would call member-template-pr.prompt with pr1_input");
        state.prr_output = { stub: true, lane: "prr" };
        break;

      case "pwr":
        console.log("  [pwr] would call member-template-pw.prompt with prr_output");
        state.pwr_output = {
          job_id: jobDef.job_id,
          dataset_id: "pr1",
          places_body: {
            stay_paragraph: "Stub stay paragraph.",
            dine_paragraph: "Stub dine paragraph.",
            essentials_paragraph: "Stub essentials paragraph.",
            locale_paragraph: "Stub locale paragraph.",
            outro_paragraph: "Stub outro paragraph.",
          },
        };
        break;

      case "rwt":
        console.log("  [rwt] would merge cwr_output + pwr_output and run member-template-rwt.prompt");
        state.rwt_output = {
          job_id: jobDef.job_id,
          dataset_id: "cr0+pr1",
          collection_body: state.cwr_output?.collection_body || {},
          places_body: state.pwr_output?.places_body || {},
        };
        break;

      default:
        console.warn(`  [${lane}] unknown lane; skipping`);
    }
  }

  return state;
}

// -----------------------------------------------------
// 5. Compute final paths and show commit plan
// -----------------------------------------------------

function computeCommitTargets(jobDef, state) {
  const finalsRoot = jobDef.paths.docs_finals_root; // e.g. "docs/blog/cp-2/finals/"
  const logsRoot   = jobDef.paths.docs_logs_root;   // e.g. "docs/blog/cp-2/logs/"
  const jobId      = jobDef.job_id;

  const jsonPath = `${finalsRoot}${jobId}.json`;
  const htmlPath = `${finalsRoot}${jobId}.html`;
  const logPath  = `${logsRoot}${jobId}-rwt.json`;

  const logPayload = {
    job_id: jobId,
    run_order: jobDef.run_order,
    crr_output: state.crr_output,
    cwr_output: state.cwr_output,
    prr_output: state.prr_output,
    pwr_output: state.pwr_output,
    rwt_output: state.rwt_output,
  };

  return {
    jsonPath,
    htmlPath,
    logPath,
    finalJson: state.rwt_output,
    logJson: logPayload,
  };
}

// -----------------------------------------------------
// 6. Main entry
// -----------------------------------------------------

async function runCli() {
  const [, , cmd, arg] = process.argv;

  if (cmd !== "start" || arg !== "blog-cp:2") {
    console.error('Usage: node runner.js start blog-cp:2');
    process.exit(1);
  }

  try {
    console.log("Loading job_definition from Rows...");
    const jobDef = await loadJobDefinition("blog-cp:2");

    const mode = jobDef.mode || "sandbox";
    console.log("job_id:", jobDef.job_id, "mode:", mode);

    console.log("Loading house files from Items...");
    const house = await loadHouse();

    console.log("Loading datasets from Rows...");
    const datasetsByRole = await loadDatasets(jobDef);
    console.log("datasets loaded:", Object.keys(datasetsByRole));

    console.log("Running pipeline (SMOKE MODE, no model calls)...");
    const state = await runPipeline(jobDef, house, datasetsByRole);

    console.log("Computing commit targets (no commit yet)...");
    const targets = computeCommitTargets(jobDef, state);

    console.log("Planned outputs:");
    console.log("  JSON:", targets.jsonPath);
    console.log("  HTML:", targets.htmlPath);
    console.log("  LOG :", targets.logPath);

    // Here is where you would actually call docs_commit_bulk
    // using git_openapi.yaml contract. For now we only echo.
    console.log("SMOKE TEST COMPLETE — wiring appears consistent.");
  } catch (err) {
    console.error("RUNNER ERROR:", err.message);
    process.exit(1);
  }
}

// Allow both CLI and programmatic use
if (process.argv[1] && process.argv[1].endsWith("runner.js")) {
  runCli();
}

export { runCli as runBlogCp2 };
