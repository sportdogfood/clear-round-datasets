// File: items/blog/cp-2/runner.js
// Runner: blog-cp:2 — brains
// Version: v2025-12-11T23:59Z

// NOTE (SMOKE TEST):
// - Checks that Rows + Items + cp:2 house files + datasets are wired.
// - Loads job_definition and all datasets listed there.
// - Does NOT yet call model prompts or docs_commit_bulk.
//
// Run example:
//   node runner.js start blog-cp:2

import fetch from "node-fetch";

// ---- CONFIG: adjust to your infra ----
const ROWS_BASE  = "https://api.rows.com";
const ITEMS_BASE = "https://items.clearroundtravel.com";

// TEMP: hard-coded Rows key for testing.
// Replace this string with your real key.
const ROWS_API_KEY = "rows-1lpXwfcrOYTfAhiZYT7EMQiypUCHlPMklQWsgiqcTAbc";

// Items proxy usually needs no auth; leave null unless you add one.
const ITEMS_API_KEY = null;

// These match instructions-mini
const JOB_SHEET_ID = "GqOwXTcrQ9u14dbdcTxWa";
const JOB_TABLE_ID = "a2300cab-6557-4c6a-8e48-129b169bcc68";
const JOB_RANGE    = "A2:B999";

// House root as used by Items proxy (matches tool call path: "blog/cp-2/...").
const HOUSE_ROOT = "blog/cp-2/";

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

async function fetchText(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}: ${text}`);
  }
  return res.text();
}

function buildRowsHeaders() {
  return {
    "Authorization": `Bearer ${ROWS_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// items.clearroundtravel.com usually just needs GET, no auth;
// if you require auth later, add header here.
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
// 2. Load datasets (payloads) from Rows
// -----------------------------------------------------

async function loadDatasets(jobDef) {
  const datasetsByRole = {};

  for (const ds of jobDef.datasets) {
    const { role_key, domains, sheet_id, table_id, range } = ds;

    if (!role_key || !sheet_id || !table_id || !range) {
      throw new Error(`Invalid dataset descriptor for role_key=${role_key || "UNKNOWN"}`);
    }

    const url = `${ROWS_BASE}/spreadsheets/${sheet_id}/tables/${table_id}/values/${encodeURIComponent(range)}`;
    const data = await fetchJson(url, { headers: buildRowsHeaders() });
    const rows = data.items || data.values || [];

    datasetsByRole[role_key] = {
      role_key,
      domains,
      items: rows,
    };
  }

  return datasetsByRole;
}

// -----------------------------------------------------
// 3. Load cp:2 house files from Items
// -----------------------------------------------------

async function loadHouseJson(relPath) {
  const url = `${ITEMS_BASE}/${relPath}`;
  return fetchJson(url, { headers: buildItemsHeaders() });
}

async function loadHouseText(relPath) {
  const url = `${ITEMS_BASE}/${relPath}`;
  return fetchText(url, { headers: buildItemsHeaders() });
}

async function smokeLoadHouseFiles() {
  // JSON files
  const jsonFiles = [
    "pipeline-spec.json",
    "style-spec.json",
    "expeditor-contract.json",
    "final-schema.json",
    "commit-spec.json",
    "checker.json",
  ];

  // Text / prompt files
  const textFiles = [
    "member-template-cr.prompt",
    "member-template-cw.prompt",
    "member-template-pr.prompt",
    "member-template-pw.prompt",
    "member-template-rwt.prompt",
    "instructions.txt",
    "instructions-mini.txt",
  ];

  // Load JSON files
  for (const file of jsonFiles) {
    const rel = `${HOUSE_ROOT}${file}`;
    await loadHouseJson(rel);
  }

  // Load text files
  for (const file of textFiles) {
    const rel = `${HOUSE_ROOT}${file}`;
    await loadHouseText(rel);
  }
}

// -----------------------------------------------------
// 4. MAIN — smoke-test entrypoint
// -----------------------------------------------------

async function main() {
  const [, , cmd, trigger] = process.argv;

  if (cmd !== "start" || trigger !== "blog-cp:2") {
    console.error(`Usage: node runner.js start blog-cp:2`);
    process.exit(1);
  }

  try {
    console.log("▶ Loading job_definition from Rows...");
    const jobDef = await loadJobDefinition(trigger);
    console.log("  job_id:", jobDef.job_id);
    console.log("  mode:", jobDef.mode || "sandbox");
    console.log("  run_order:", jobDef.run_order.join(" → "));
    console.log("  datasets:", jobDef.datasets.map(d => d.role_key).join(", "));

    console.log("\n▶ Fetching dataset payloads from Rows...");
    const datasetsByRole = await loadDatasets(jobDef);

    Object.entries(datasetsByRole).forEach(([role, payload]) => {
      const count = Array.isArray(payload.items) ? payload.items.length : 0;
      console.log(`  ${role}: ${count} rows (${(payload.domains || []).join(", ")})`);
    });

    console.log("\n▶ Loading cp:2 house files from Items...");
    await smokeLoadHouseFiles();
    console.log("  All required house files loaded successfully.");

    console.log("\n✅ blog-cp:2 smoke test OK:");
    console.log("   - job_definition loaded");
    console.log("   - datasets fetched (payloads present)");
    console.log("   - house files reachable via Items proxy");
  } catch (err) {
    console.error("\n❌ blog-cp:2 smoke test FAILED:");
    console.error("   ", err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
