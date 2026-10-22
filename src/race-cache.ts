import type { AlkamelRace } from "./alkamel";
import type { RaceDataset } from "./models/race";
import { RACE_DATA_VERSION } from "./models/data-version";

const DATABASE = "uraice-processed-races";
const STORE = "races";
// Increment when the timing parser or lap model changes incompatibly.
const PARSER_VERSION = RACE_DATA_VERSION;

interface CachedRace {
  id: string;
  path: string;
  version: string;
  dataset: RaceDataset;
}

let databasePromise: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open race cache"));
  });
}

export async function raceCacheVersion(categoryCsv: string): Promise<string> {
  const bytes = new TextEncoder().encode(categoryCsv);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${PARSER_VERSION}:${hash}`;
}

export async function readRaceCache(races: AlkamelRace[], version: string): Promise<Map<string, RaceDataset>> {
  const db = await database();
  const entries = await new Promise<CachedRace[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as CachedRace[]);
    request.onerror = () => reject(request.error || new Error("Could not read race cache"));
  });
  const expected = new Map(races.map(race => [race.id, race.path]));
  const found = new Map<string, RaceDataset>();
  const stale: string[] = [];
  for (const entry of entries) {
    if (entry.version === version && expected.get(entry.id) === entry.path && entry.dataset?.laps?.length)
      found.set(entry.id, entry.dataset);
    else stale.push(entry.id);
  }
  if (stale.length) {
    const transaction = db.transaction(STORE, "readwrite");
    for (const id of stale) transaction.objectStore(STORE).delete(id);
  }
  return found;
}

export async function saveRaceCache(race: AlkamelRace, version: string, dataset: RaceDataset): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ id: race.id, path: race.path, version, dataset } satisfies CachedRace);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save race"));
    transaction.onabort = () => reject(transaction.error || new Error("Could not save race"));
  });
}
