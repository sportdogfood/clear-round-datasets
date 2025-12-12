/* ============================================================
   EXPEDITOR-CONTRACT.JS — FINAL GLUE FOR CP:2
   Builds the identity + lane inputs for:
   - CRR
   - CWR (indirect)
   - PRR
   - PWR (indirect)
   - RWT (indirect)

   This version does NOT guess.
   It extracts ONLY what is allowed in cp:2.
   ============================================================ */

import fs from "fs";
import path from "path";

// Utility: load a JSON file from dataset directory
function loadDataset(filePath) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) return {};
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    console.error("Failed to parse dataset:", full);
    return {};
  }
}

export async function buildExpeditorOutput(jobDefinition) {
  const job_id = jobDefinition.job_id;

  // -------------------------------------------
  // DATASET ROOT
  // Example:
  // items/blog/cp-2/jobs/job-4434456/cr0.json
  // items/blog/cp-2/jobs/job-4434456/pr1.json
  // -------------------------------------------
  const itemsRoot = jobDefinition.paths.items_root;

  // Pull dataset roles:
  const crDataset = jobDefinition.datasets.find(d => d.role_key === "cr0");
  const prDataset = jobDefinition.datasets.find(d => d.role_key === "pr1");

  // Load each dataset file expected to have been fetched already
  const crRaw = loadDataset(path.join(itemsRoot, "cr0.json"));
  const prRaw = loadDataset(path.join(itemsRoot, "pr1.json"));

  // -------------------------------------------
  // Build event_identity (NO GUESSING)
  // -------------------------------------------
  const event_identity = {
    event_leg_key: crRaw.event_leg_key ?? "could-not-verify",
    event_name: crRaw.event_name ?? "could-not-verify",
    event_acronym: crRaw.event_acronym ?? "could-not-verify",
    venue_name: crRaw.venue_name ?? "could-not-verify",
    city: crRaw.city ?? "could-not-verify",
    state: crRaw.state ?? "could-not-verify",
    season_label: crRaw.season_label ?? "could-not-verify",
    rating_string: crRaw.rating_string ?? "could-not-verify",
    rider_caliber: crRaw.rider_caliber ?? "could-not-verify"
  };

  // -------------------------------------------
  // Build maps_anchor (NO GUESSING)
  // -------------------------------------------
  const maps_anchor = {
    place_id: crRaw.place_id ?? "could-not-verify",
    lat: crRaw.lat ?? null,
    lng: crRaw.lng ?? null
  };

  // -------------------------------------------
  // Build collection_input for CRR
  // -------------------------------------------
  const collection_input = {
    event_notes: crRaw.event_notes ?? "could-not-verify",
    venue_notes: crRaw.venue_notes ?? "could-not-verify",
    city_season_notes: crRaw.city_season_notes ?? "could-not-verify"
  };

  // -------------------------------------------
  // Build profile_input for PRR
  // -------------------------------------------
  const profile_input = {
    stay_notes: prRaw.stay_notes ?? "could-not-verify",
    dine_notes: prRaw.dine_notes ?? "could-not-verify",
    essentials_notes: prRaw.essentials_notes ?? "could-not-verify",
    locale_notes: prRaw.locale_notes ?? "could-not-verify"
  };

  // -------------------------------------------
  // Build lane inputs
  // -------------------------------------------
  const cr_input = {
    job_id,
    street: jobDefinition.street,
    house: jobDefinition.house,
    lane: "crr",
    dataset_id: "cr0",
    cid: crRaw.cid ?? "unknown",

    global_rules: jobDefinition.global_rules,

    event_identity,
    maps_anchor,
    collection_input
  };

  const pr_input = {
    job_id,
    street: jobDefinition.street,
    house: jobDefinition.house,
    lane: "prr",
    dataset_id: "pr1",
    cid: prRaw.cid ?? "unknown",

    global_rules: jobDefinition.global_rules,

    event_identity,
    profile_input
  };

  // -------------------------------------------
  // Return all upstream-assembled components
  // -------------------------------------------
  return {
    cid: crRaw.cid ?? prRaw.cid ?? "unknown",
    event_identity,
    maps_anchor,
    cr_input,
    pr_input
  };
}
