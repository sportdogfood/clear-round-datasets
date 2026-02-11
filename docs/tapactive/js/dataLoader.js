const DB_NAME = "tapactive";
const STORE_NAME = "datasets";
const DB_VERSION = 1;
const TTL_MS = 12 * 60 * 60 * 1000;

const TARGET_DATASETS = [
  "horses",
  "profiles",
  "feed_items",
  "locations",
  "tack_lists",
  "barn_tack"
];

let idbWarned = false;

const memory = {
  horses: [],
  profiles: [],
  feed_items: [],
  locations: [],
  tack_lists: [],
  barn_tack: [],
  meta: {},
};

function warn(message, error) {
  console.warn(message, error);
}

function getNow() {
  return Date.now();
}

function isArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveRepoRelativePath(repoRelativePath) {
  const normalized = String(repoRelativePath || "").replace(/^\/+/, "");
  return new URL(normalized, document.baseURI).toString();
}

function normalizeDatasetPath(pathFromManifest) {
  const raw = String(pathFromManifest || "").trim();
  if (!raw) return "";
  if (raw.startsWith("./data/")) return raw;
  if (raw.startsWith("data/")) return `./${raw}`;
  const fileName = raw.split("/").filter(Boolean).pop();
  return fileName ? `./data/${fileName}` : "";
}

function openDb() {
  if (typeof indexedDB === "undefined") {
    if (!idbWarned) {
      warn("IndexedDB unavailable; cache disabled.");
      idbWarned = true;
    }
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "name" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedRecord(name) {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(name);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
}

async function putCachedRecord(record) {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function getManifestDatasets() {
  try {
    const manifestUrl = resolveRepoRelativePath("./data/dbindex.json");
    const manifest = await fetchJson(manifestUrl);

    const map = {};
    (manifest.datasets || []).forEach((entry) => {
      map[entry.name] = entry.path;
    });

    return map;
  } catch (error) {
    warn("Failed to load dbindex.json", error);
    return {};
  }
}

function isFresh(record, nowMs) {
  return record && (nowMs - record.fetched_at < TTL_MS);
}

async function loadAll() {
  const nowMs = getNow();
  const manifestMap = await getManifestDatasets();
  const meta = {};

  for (const name of TARGET_DATASETS) {
    const sourcePath = manifestMap[name];
    const cached = await getCachedRecord(name);

    let data = [];
    let source = "empty";
    let fetchedAt = nowMs;

    if (isFresh(cached, nowMs)) {
      data = isArray(cached.data);
      source = "cache";
    } else if (sourcePath) {
      try {
        const datasetUrl = resolveRepoRelativePath(
          normalizeDatasetPath(sourcePath)
        );
        data = isArray(await fetchJson(datasetUrl));
        source = "network";

        await putCachedRecord({
          name,
          data,
          fetched_at: nowMs,
          source_path: sourcePath,
        });

      } catch (error) {
        warn(`Failed refresh: ${name}`, error);

        if (cached) {
          data = isArray(cached.data);
          source = "stale-cache";
          fetchedAt = cached.fetched_at;
        }
      }
    }

    memory[name] = data;

    meta[name] = {
      source,
      source_path: sourcePath || "",
      fetched_at: fetchedAt,
    };
  }

  memory.meta = meta;

  return {
    horses: memory.horses,
    profiles: memory.profiles,
    feed_items: memory.feed_items,
    locations: memory.locations,
    tack_lists: memory.tack_lists,
    barn_tack: memory.barn_tack,
    meta: memory.meta,
  };
}

function getDataset(name) {
  return isArray(memory[name]);
}

async function clearCache() {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
}

const api = { loadAll, getDataset, clearCache };

if (typeof window !== "undefined") {
  window.tapActiveDataLoader = api;
}

export { loadAll, getDataset, clearCache };
export default api;
