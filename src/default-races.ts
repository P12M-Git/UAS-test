import { applyDriverCategories, parseTimingCsv } from "./parser/uraice_adapter";
import type { RaceDataset } from "./models/race";

export const DEFAULT_RACES = [
  "26ELMSR01_BARC.csv", "26ELMSR02_RICA.csv",
  "26ELMSR03_IMOL.csv", "26ELMSR04_SPAF.csv",
];
let defaults: Promise<RaceDataset> | undefined;
export function loadDefaultRaces(): Promise<RaceDataset> {
  return defaults ??= (async () => {
    const get = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load ${url} (${response.status})`);
      return response.text();
    };
    const [ratings, ...csvs] = await Promise.all([
      get("/driver_categories.tsv"),
      ...DEFAULT_RACES.map(name => get(`/races/${name}`)),
    ]);
    const sets = csvs.map((csv, i) => parseTimingCsv(csv, DEFAULT_RACES[i]));
    return {
      laps: applyDriverCategories(sets.flatMap(s => s.laps), ratings),
      diagnostics: sets.flatMap(s => s.diagnostics),
    };
  })().catch(error => { defaults = undefined; throw error; });
}

// An import updates matching event/car/lap rows, keeping the built-in races.
export function mergeRaceDatasets(base: RaceDataset, incoming: RaceDataset): RaceDataset {
  const laps = new Map(base.laps.map(l => [`${l.event}|${l.session}|${l.carNumber}|${l.lapNumber}`, l]));
  incoming.laps.forEach(l => laps.set(`${l.event}|${l.session}|${l.carNumber}|${l.lapNumber}`, l));
  const diagnostics = new Map(base.diagnostics.map(d => [d.sourceFile, d]));
  incoming.diagnostics.forEach(d => diagnostics.set(d.sourceFile, d));
  return { laps: [...laps.values()], diagnostics: [...diagnostics.values()] };
}
