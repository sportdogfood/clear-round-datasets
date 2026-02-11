const DB_NAME = "tapactive";
const STORE_NAME = "datasets";
const DB_VERSION = 1;
const TTL_MS = 12 * 60 * 60 * 1000;
const TARGET_DATASETS = ["horses", "profiles", "feed_items", "locations", "tack_lists", "barn_tack"];


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
  if (typeof document === "undefined" || !document.baseURI) {
    return normalized;
  }
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
      warn("IndexedDB is unavailable; cache disabled.");
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
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

async function getCachedRecord(name) {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(name);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Failed to read cache record"));
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  } catch (error) {
    warn("IndexedDB read failed.", error);
    return null;
  }
}

async function putCachedRecord(record) {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Failed to write cache record"));
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  } catch (error) {
    warn("IndexedDB write failed.", error);
  }
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
    const datasets = Array.isArray(manifest?.datasets) ? manifest.datasets : [];
    const map = {};
    datasets.forEach((entry) => {
      if (entry && typeof entry.name === "string" && typeof entry.path === "string") {
        map[entry.name] = entry.path;
      }
    });
    return map;
  } catch (error) {
    warn("Failed to load dbindex.json.", error);
    return {};
  }
}

function isFresh(record, nowMs) {
  return Boolean(record && typeof record.fetched_at === "number" && nowMs - record.fetched_at < TTL_MS);
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
      fetchedAt = nowMs;
      await putCachedRecord({
        name,
        data,
        fetched_at: fetchedAt,
        source_path: cached.source_path || sourcePath || "",
      });
    } else if (sourcePath) {
      try {
        const datasetUrl = resolveRepoRelativePath(normalizeDatasetPath(sourcePath));
        const networkData = await fetchJson(datasetUrl);
        data = isArray(networkData);
        source = "network";
        fetchedAt = nowMs;
        await putCachedRecord({
          name,
          data,
          fetched_at: fetchedAt,
          source_path: sourcePath,
        });
      } catch (error) {
        warn(`Failed to refresh dataset: ${name}.`, error);
        if (cached) {
          data = isArray(cached.data);
          source = "stale-cache";
          fetchedAt = typeof cached.fetched_at === "number" ? cached.fetched_at : nowMs;
        }
      }
    } else if (cached) {
      data = isArray(cached.data);
      source = "stale-cache";
      fetchedAt = typeof cached.fetched_at === "number" ? cached.fetched_at : nowMs;
    }

    memory[name] = data;
    meta[name] = {
      source,
      source_path: sourcePath || (cached?.source_path || ""),
      fetched_at: fetchedAt,
    };
  }

  memory.meta = meta;
  return {
    horses: memory.horses,
    profiles: memory.profiles,
    feed_items: memory.feed_items,
    locations: memory.locations,
    lists: memory.lists,
    meta: memory.meta,
  };
}

function getDataset(name) {
  return isArray(memory[name]);
}

async function clearCache() {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Failed to clear cache"));
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  } catch (error) {
    warn("IndexedDB clear failed.", error);
  }
}

const api = { loadAll, getDataset, clearCache };

if (typeof window !== "undefined") {
  window.tapActiveDataLoader = api;
}

export { loadAll, getDataset, clearCache };
export default api;
