"use strict";

const fs = require("fs");
const path = require("path");

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function get(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o && o[k] != null ? o[k] : null), obj);
}

function set(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function normalizeProperNouns(text, qaConfig, issues) {
  if (!text) return text;

  const canon = qaConfig.canonical_proper_nouns || {};
  let out = text;

  for (const key of Object.keys(canon)) {
    const canonVal = canon[key];
    // crude case-insensitive normalization
    const pattern = new RegExp(canonVal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (pattern.test(out) && !out.includes(canonVal)) {
      out = out.replace(pattern, canonVal);
      issues.push(`normalized proper noun to "${canonVal}"`);
    }
  }

  return out;
}

function applyStringReplacements(text, qaConfig, issues) {
  if (!text) return text;
  let out = text;
  for (const r of qaConfig.string_replacements || []) {
    if (!r.from || !r.to) continue;
    if (out.includes(r.from)) {
      out = out.replace(new RegExp(r.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), r.to);
      issues.push(`replaced "${r.from}" → "${r.to}" (${r.reason || "no reason"})`);
    }
  }
  return out;
}

function checkForbiddenTokens(text, qaConfig, issues) {
  if (!text) return;
  for (const tok of qaConfig.forbidden_tokens || []) {
    if (tok && text.toLowerCase().includes(tok.toLowerCase())) {
      issues.push(`forbidden token found: "${tok}"`);
    }
  }
}

function checkSentenceLengths(text, qaConfig, issues) {
  if (!text) return;
  const minW = qaConfig.min_sentence_words || 0;
  const maxW = qaConfig.max_sentence_words || 999;

  const sentences = text
    .split(/([.!?])/) // keep punctuation
    .reduce((acc, cur, idx, arr) => {
      if (idx % 2 === 0) {
        const nextPunct = arr[idx + 1] || "";
        const s = (cur + nextPunct).trim();
        if (s) acc.push(s);
      }
      return acc;
    }, []);

  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < minW) {
      issues.push(`very short sentence (${words.length} words): "${s}"`);
    } else if (words.length > maxW) {
      issues.push(`very long sentence (${words.length} words): "${s}"`);
    }
  }
}

function runCompetitionQa(outputJson, qaConfig) {
  const report = [];
  const cleaned = JSON.parse(JSON.stringify(outputJson));
  const fields = qaConfig.target_fields || [];

  for (const field of fields) {
    const original = get(cleaned, field);
    if (typeof original !== "string" || !original.trim()) continue;

    let text = original;
    const issues = [];

    text = normalizeProperNouns(text, qaConfig, issues);
    text = applyStringReplacements(text, qaConfig, issues);
    checkForbiddenTokens(text, qaConfig, issues);
    checkSentenceLengths(text, qaConfig, issues);

    if (issues.length > 0) {
      set(cleaned, field, text);
      report.push({ field, issues, before: original, after: text });
    }
  }

  return { cleaned, report };
}

// CLI usage for POC:
// node competition-qa.js docs/runner/competition-output.creator-abc.json items/agents/competition-runner/qa-config.json
if (require.main === module) {
  const [,, outputPath, configPath] = process.argv;
  if (!outputPath || !configPath) {
    console.error("Usage: node competition-qa.js <competition-output.json> <qa-config.json>");
    process.exit(1);
  }
  const out = loadJson(path.resolve(outputPath));
  const cfg = loadJson(path.resolve(configPath));
  const { cleaned, report } = runCompetitionQa(out, cfg);

  console.log("QA report:");
  for (const r of report) {
    console.log(`\nField: ${r.field}`);
    for (const msg of r.issues) console.log(`  - ${msg}`);
  }

  // For POC, just write a sibling file so we don't overwrite:
  const outPath = outputPath.replace(/\.json$/, ".qa-clean.json");
  fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2), "utf8");
  console.log(`\nWrote cleaned JSON to: ${outPath}`);
}

module.exports = { runCompetitionQa };
