import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const INSTRUCTIONS_PATH = path.join(process.cwd(), 'docs', 'schedule', 'data', 'instructions.json');
const VOLATILE_FIELDS = new Set(['last_seen_run_id', 'last_seen_at', 'is_active']);
const SCOPE_FIELDS = ['show_id', 'show_date', 'show_day_key'];

function formatRunId(date) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  return `${year}${month}${day}-${hour}${minute}${second}Z`;
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

function stableStringify(value) {
  const sorted = sortKeys(value);
  return JSON.stringify(sorted);
}

function stripVolatileFields(row) {
  const cleaned = {};
  for (const [key, value] of Object.entries(row)) {
    if (!VOLATILE_FIELDS.has(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function fingerprintRow(row) {
  const canonical = stableStringify(stripVolatileFields(row));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

async function fetchWithRetry(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'poll-runs' } });
      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function buildScheduleRows(payload, streamConfig, scopeMeta) {
  let rowsSource;
  if (Array.isArray(payload)) {
    rowsSource = payload;
  } else if (Array.isArray(payload?.data)) {
    rowsSource = payload.data;
  } else {
    throw new Error('schedule_v1 payload is not an array');
  }

  return rowsSource.map((row) => {
    const enriched = { ...row };
    for (const field of SCOPE_FIELDS) {
      if (enriched[field] === undefined || enriched[field] === null) {
        if (scopeMeta?.[field] !== undefined) {
          enriched[field] = scopeMeta[field];
        }
      }
    }

    const keepFields = streamConfig.row_fields_keep;
    if (Array.isArray(keepFields) && keepFields.length > 0) {
      const filtered = {};
      for (const field of keepFields) {
        if (enriched[field] !== undefined) {
          filtered[field] = enriched[field];
        }
      }
      if (filtered[streamConfig.stable_key] === undefined) {
        filtered[streamConfig.stable_key] = enriched[streamConfig.stable_key];
      }
      return filtered;
    }

    return enriched;
  });
}

function buildRows(payload, streamConfig, scopeMeta) {
  switch (streamConfig.row_builder) {
    case 'schedule_v1':
      return buildScheduleRows(payload, streamConfig, scopeMeta);
    default:
      throw new Error(`Unsupported row_builder: ${streamConfig.row_builder}`);
  }
}

function ensureRowFields(rows, stableKey, runId, generatedAtUtc) {
  return rows.map((row) => {
    if (row[stableKey] === undefined || row[stableKey] === null) {
      throw new Error(`Row missing stable key ${stableKey}`);
    }
    return {
      ...row,
      last_seen_run_id: runId,
      last_seen_at: generatedAtUtc,
      is_active: true,
    };
  });
}

function computeDiff(previousRows, currentRows, stableKey) {
  const previousMap = new Map();
  const previousKeyValues = new Map();
  for (const row of previousRows) {
    const key = row[stableKey];
    const mapKey = String(key);
    previousMap.set(mapKey, fingerprintRow(row));
    previousKeyValues.set(mapKey, key);
  }

  const currentMap = new Map();
  const currentKeyValues = new Map();
  for (const row of currentRows) {
    const key = row[stableKey];
    const mapKey = String(key);
    currentMap.set(mapKey, fingerprintRow(row));
    currentKeyValues.set(mapKey, key);
  }

  const addedKeys = [];
  const updatedKeys = [];
  const droppedKeys = [];

  for (const [mapKey, fingerprint] of currentMap.entries()) {
    if (!previousMap.has(mapKey)) {
      addedKeys.push(currentKeyValues.get(mapKey));
    } else if (previousMap.get(mapKey) !== fingerprint) {
      updatedKeys.push(currentKeyValues.get(mapKey));
    }
  }

  for (const mapKey of previousMap.keys()) {
    if (!currentMap.has(mapKey)) {
      droppedKeys.push(previousKeyValues.get(mapKey));
    }
  }

  return {
    added_keys: addedKeys,
    updated_keys: updatedKeys,
    dropped_keys: droppedKeys,
  };
}

async function readJsonIfExists(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJson(filePath, data) {
  const canonical = sortKeys(data);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(canonical, null, 2)}\n`);
}

function resolveTemplate(template, runId) {
  return template.replace('{run_id}', runId);
}

function runGitCommit(runId) {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
  if (!status) {
    console.log('No changes detected; skipping commit.');
    return;
  }
  execSync('git add .', { stdio: 'inherit' });
  execSync(`git commit -m "chore: poll runs ${runId}"`, { stdio: 'inherit' });
}

async function run() {
  const instructionsContent = await fs.readFile(INSTRUCTIONS_PATH, 'utf-8');
  const instructions = JSON.parse(instructionsContent);
  const runDate = new Date();
  const runId = formatRunId(runDate);
  const generatedAtUtc = runDate.toISOString();

  const streams = instructions.streams ?? {};
  const streamsOrder = instructions.streams_order ?? Object.keys(streams);
  const outputs = instructions.outputs ?? {};
  const baseDir = outputs.base_dir;
  if (!baseDir) {
    throw new Error('outputs.base_dir is required');
  }

  for (const streamName of streamsOrder) {
    const streamConfig = streams[streamName];
    if (!streamConfig) {
      throw new Error(`Stream ${streamName} missing from instructions`);
    }
    if (!streamConfig.enabled) {
      continue;
    }

    const payload = await fetchWithRetry(streamConfig.endpoint_url);
    const rawRows = buildRows(payload, streamConfig, instructions.meta);
    const rows = ensureRowFields(rawRows, streamConfig.stable_key, runId, generatedAtUtc);

    const streamBaseDir = path.join(baseDir, streamName);
    const latestPath = path.join(streamBaseDir, outputs.files?.latest ?? 'latest.json');
    const diffsPath = path.join(streamBaseDir, outputs.files?.diffs ?? 'diffs.json');
    const historyPath = path.join(
      streamBaseDir,
      resolveTemplate(outputs.files?.history_latest ?? 'history/{run_id}.json', runId),
    );
    const historyDiffsPath = path.join(
      streamBaseDir,
      resolveTemplate(outputs.files?.history_diffs ?? 'history/diffs/{run_id}.json', runId),
    );

    const previousSnapshot = await readJsonIfExists(latestPath);
    const previousRows = previousSnapshot?.data ?? [];
    const changes = computeDiff(previousRows, rows, streamConfig.stable_key);

    const snapshot = {
      meta: {
        run_id: runId,
        generated_at_utc: generatedAtUtc,
        stream: streamName,
        stable_key: streamConfig.stable_key,
        source_url: streamConfig.endpoint_url,
        row_count: rows.length,
        show_id: instructions.meta?.show_id,
        show_date: instructions.meta?.show_date,
        show_day_key: instructions.meta?.show_day_key,
      },
      data: rows,
    };

    const diff = {
      meta: {
        run_id: runId,
        generated_at_utc: generatedAtUtc,
        stream: streamName,
        stable_key: streamConfig.stable_key,
        previous_run_id: previousSnapshot?.meta?.run_id ?? null,
        added_count: changes.added_keys.length,
        updated_count: changes.updated_keys.length,
        dropped_count: changes.dropped_keys.length,
      },
      changes,
    };

    await writeJson(historyPath, snapshot);
    await writeJson(historyDiffsPath, diff);
    await writeJson(latestPath, snapshot);
    await writeJson(diffsPath, diff);
  }

  runGitCommit(runId);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
