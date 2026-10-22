import type { AlkamelRace } from "./alkamel";

/** Load the whole library; a changing analysis selection only changes priority. */
export async function loadRaceLibrary({ races, priority, load, signal, concurrency = 3, onError }: {
  races: AlkamelRace[];
  priority: () => string[];
  load: (race: AlkamelRace) => Promise<void>;
  signal: AbortSignal;
  concurrency?: number;
  onError?: (race: AlkamelRace, error: unknown) => void;
}): Promise<void> {
  const queue = [...races];
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length && !signal.aborted) {
      const selected = priority();
      const index = queue.findIndex(race => selected.includes(race.id));
      const [race] = queue.splice(index < 0 ? 0 : index, 1);
      try { await load(race); }
      catch (error) { if (!signal.aborted) onError?.(race, error); }
    }
  }));
}
